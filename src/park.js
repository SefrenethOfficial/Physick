import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, LAND_Y } from './world.js';
import { std, sign, solidBox, canvasTex, speckle } from './buildkit.js';

// Cherry Estate National Park: a big stretch of pine forest behind Verian City, with dirt
// trails, a ranger station at the trailhead, campsites, fallen logs, boulders and a lookout.

const Y = LAND_Y;
const loader = new THREE.TextureLoader();
export function photoTex(url, rx, ry) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// distance from point to segment
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

// ---- terrain noise ----
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) { let t = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { t += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return t / 0.97; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const DECK_Y = LAND_Y + 30; // the bridge deck (and the top of the park road)

export class Park {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'park');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.planRoad();
    this.build();
  }

  // ---- the road: from the city's edge, winding up through the hills to the bridge ----
  planRoad() {
    // the bridge leaves the north shore toward Saltmarsh Key; the road meets it 70 m inland
    const edge = new THREE.Vector2(-1420, this.isl.z0);
    const far = new THREE.Vector2(-1040, -1203);
    const dir = far.clone().sub(edge).normalize();
    const S = edge.clone().addScaledVector(dir, -70);
    this.bridge = { start: new THREE.Vector3(S.x, DECK_Y, S.y), end: new THREE.Vector3(far.x, LAND_Y, far.y), dir: new THREE.Vector3(dir.x, 0, dir.y) };
    const pts = [[-1112, -35], [-1185, -42], [-1255, -80], [-1315, -140], [-1385, -175], [-1460, -192], [-1530, -235],
      [S.x - dir.x * 80, S.y - dir.y * 80], [S.x - dir.x * 40, S.y - dir.y * 40], [S.x, S.y]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const L = curve.getLength();
    const n = Math.ceil(L / 3);
    this.road = [];
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n);
      const s = (i / n) * L;
      this.road.push({ x: p.x, z: p.z, s, y: LAND_Y + (DECK_Y - LAND_Y) * smooth(L * 0.06, L * 0.96, s) });
    }
    this.roadLength = L;
    this.roadLine = this.road.filter((_, i) => i % 6 === 0).map((r) => [r.x, r.z]);
    // under the bridge, by the shore: a hidden garage, and a dirt track back along the coast to the city
    const bt = 55; // metres out along the bridge from its start
    this.underBridge = new THREE.Vector3(S.x + dir.x * bt, LAND_Y, S.y + dir.y * bt);
    const g0 = this.underBridge;
    this.lanes = [
      { kind: 'dirt', width: 6, pts: this.spline([[g0.x + 6, g0.z + 6], [g0.x + 40, -398], [-1330, -402], [-1240, -400], [-1170, -390], [-1132, -330], [-1128, -250], [-1124, -190], [-1104, -176], [-1090, -175]]) },
      { kind: 'drive', width: 7, pts: this.spline([[-1185, -40], [-1200, -10], [-1214, 8]]) },
    ];
    this.mansionAt = new THREE.Vector3(-1228, 0, 36);
  }

  spline(pts) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const n = Math.ceil(curve.getLength() / 3);
    return curve.getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z }));
  }

  // nearest point on the hidden lanes (dirt road, driveway)
  nearestLane(x, z) {
    let best = null, bd = Infinity;
    for (const l of this.lanes || []) for (const p of l.pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = { p, l }; } }
    return best ? { ...best, d: Math.sqrt(bd) } : null;
  }

  nearestRoad(x, z) {
    let best = null, bd = Infinity;
    for (const r of this.road) { const d = (r.x - x) ** 2 + (r.z - z) ** 2; if (d < bd) { bd = d; best = r; } }
    return { r: best, d: Math.sqrt(bd) };
  }

  // Raw mountains: low foothills by the city and the airport, real peaks out west.
  natural(x, z) {
    const isl = this.isl;
    const e = Math.min(x - isl.x0, isl.x1 - x, z - isl.z0, isl.z1 - z);
    const mask = smooth(8, 90, e) * smooth(15, 170, isl.x1 - x) * smooth(10, 120, isl.z1 - z);
    const amp = 30 + 70 * smooth(-1250, -1600, x);
    const ridge = 1 - Math.abs(fbm(x / 260, z / 260) * 2 - 1); // sharp-ish ridgelines
    const h = Math.pow(fbm(x / 170 + 3.1, z / 170 - 7.3), 1.6) * 0.65 + ridge * ridge * 0.45;
    return LAND_Y + mask * amp * h;
  }

  // Ground height anywhere in the park (what the terrain, trees and buildings all follow).
  heightAt(x, z) {
    let h = this.natural(x, z);
    for (const c of this.clearings) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r + 18) h = c.y + (h - c.y) * smooth(c.r, c.r + 18, d);
    }
    const { r, d } = this.nearestRoad(x, z);
    if (d < 34) h = r.y - 0.05 + (h - r.y + 0.05) * smooth(13, 34, d);
    // the lanes run on their own graded bed (heights fixed once, below)
    const ln = this.lanesReady && this.nearestLane(x, z);
    if (ln && ln.d < ln.l.width + 12) h = ln.p.y + (h - ln.p.y) * smooth(ln.l.width * 0.6, ln.l.width + 12, ln.d);
    return h;
  }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl;
    const base = import.meta.env.BASE_URL;
    const w = isl.x1 - isl.x0, d = isl.z1 - isl.z0;
    const wood = std({ color: 0x6b4a2f, roughness: 0.9 });
    const darkWood = std({ color: 0x4a3220, roughness: 0.9 });

    // flat spots for the trailhead, ranger station, campsites and the lookout
    this.clearings = [];
    const flatSpot = (x, z, r, y = null) => { const c = { x, z, r, y: y ?? this.natural(x, z) }; this.clearings.push(c); return c.y; };
    const yTrail = flatSpot(-1150, -35, 22, LAND_Y);
    const yRanger = flatSpot(-1165, -78, 14, LAND_Y + 0.5);
    const camps = [[-1380, -262], [-1420, 240], [-1605, -62]].map(([x, z]) => [x, z, flatSpot(x, z, 16)]);
    const yLook = flatSpot(-1650, 330, 12);
    const yBunker = flatSpot(-1392, 92, 11);
    const yMansion = flatSpot(this.mansionAt.x, this.mansionAt.z, 34);
    this.mansionAt.y = yMansion;
    const yGarage = flatSpot(this.underBridge.x + 8, this.underBridge.z + 4, 12, LAND_Y + 0.2);
    // grade the lanes: follow the ground, smoothed, with no lumps
    for (const l of this.lanes) {
      const raw = l.pts.map((p) => this.heightAt(p.x, p.z));
      l.pts.forEach((p, i) => { let a = 0, n = 0; for (let k = -6; k <= 6; k++) { const q = raw[i + k]; if (q != null) { a += q; n++; } } p.y = a / n; });
      if (l.kind === 'drive') { l.pts[l.pts.length - 1].y = yMansion; }
    }
    this.lanesReady = true;
    void yGarage;

    // ---- terrain: a sculpted mesh with a matching collider; grass with rocky steep slopes ----
    const bank = std({ map: photoTex(`${base}assets/textures/dirt.jpg`, w / 10, 1.4), roughness: 1 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 14, d), bank);
    slab.position.set((isl.x0 + isl.x1) / 2, Y - 7.02, (isl.z0 + isl.z1) / 2);
    slab.userData.noMerge = true;
    g.add(slab);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, 7, d / 2).setTranslation(slab.position.x, Y - 7, slab.position.z));
    const STEP = 5;
    const geo = new THREE.PlaneGeometry(w, d, Math.round(w / STEP), Math.round(d / STEP));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cx = (isl.x0 + isl.x1) / 2, cz = (isl.z0 + isl.z1) / 2;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i) + cx, pos.getZ(i) + cz));
    geo.computeVertexNormals();
    const col = new Float32Array(pos.count * 3), nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const steep = smooth(0.92, 0.7, nrm.getY(i)), high = smooth(LAND_Y + 45, LAND_Y + 90, pos.getY(i));
      const k = Math.max(steep, high * 0.7);
      col[i * 3] = 1 - k * 0.15; col[i * 3 + 1] = 1 - k * 0.35; col[i * 3 + 2] = 1 - k * 0.2 + k * 0.05;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const terrain = new THREE.Mesh(geo, std({ map: photoTex(`${base}assets/textures/grass.jpg`, w / 9, d / 9), vertexColors: true, roughness: 1 }));
    terrain.position.set(cx, 0, cz);
    terrain.receiveShadow = true;
    terrain.userData.noMerge = true;
    g.add(terrain);
    const verts = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { verts[i * 3] = pos.getX(i) + cx; verts[i * 3 + 1] = pos.getY(i); verts[i * 3 + 2] = pos.getZ(i) + cz; }
    sb.addStaticCollider(RAPIER.ColliderDesc.trimesh(verts, new Uint32Array(geo.index.array)));

    // ---- the road (asphalt ribbon with lines) and dirt trails draped over the hills ----
    const ribbon = (pts, width, yOf, mat, uScale) => {
      const v = [], uv = [], idx = [];
      let run = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        if (i) run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        for (const sgn of [-1, 1]) {
          const x = pts[i].x - tz * sgn * width / 2, z = pts[i].z + tx * sgn * width / 2;
          v.push(x, yOf(pts[i], x, z), z);
          uv.push(sgn < 0 ? 0 : 1, run / uScale);
        }
        if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      gg.setIndex(idx);
      gg.computeVertexNormals();
      const m = new THREE.Mesh(gg, mat);
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const roadTex = canvasTex(64, 128, (c, cw, ch) => {
      c.fillStyle = '#3a3d41'; c.fillRect(0, 0, cw, ch); speckle(c, cw, ch, 500, 0.06);
      c.fillStyle = '#e8c547'; c.fillRect(cw / 2 - 2, 0, 1.5, ch); c.fillRect(cw / 2 + 0.5, 0, 1.5, ch);
      c.fillStyle = '#e8e8e2'; c.fillRect(3, 0, 1.5, ch); c.fillRect(cw - 4.5, 0, 1.5, ch);
    });
    ribbon(this.road, 10, (r) => r.y + 0.12, std({ map: roadTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }), 20);
    const dirtTex = photoTex(`${base}assets/textures/dirt.jpg`, 1, 1);
    const dirtM = std({ map: dirtTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
    this.trails = [
      [[-1315, -140], [-1380, -262], [-1480, -300], [-1580, -220], [-1640, -140], [-1605, -62]],
      [[-1255, -80], [-1340, -20], [-1360, 120], [-1420, 240], [-1520, 320], [-1610, 250], [-1650, 330]],
      [[-1340, -20], [-1420, 40], [-1500, 10], [-1605, -62]],
    ];
    for (const line of this.trails) {
      const curve = new THREE.CatmullRomCurve3(line.map(([x, z]) => new THREE.Vector3(x, 0, z)));
      const n = Math.ceil(curve.getLength() / 3);
      const pts = curve.getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z }));
      ribbon(pts, 4, (p, x, z) => this.heightAt(x, z) + 0.1, dirtM, 5);
    }
    this.trailPts = this.trails;
    // the hidden dirt road under the bridge, and the mansion's driveway
    for (const l of this.lanes) ribbon(l.pts, l.width, (p, x, z) => this.heightAt(x, z) + 0.12, l.kind === 'dirt' ? dirtM : std({ color: 0x3c3f43, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }), l.kind === 'dirt' ? 6 : 20);
    const clearing = (x, z, r, y) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), std({ map: photoTex(`${base}assets/textures/dirt.jpg`, r / 4, r / 4), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y + 0.06, z);
      m.receiveShadow = true;
      g.add(m);
    };

    // ---- trailhead gateway over the road, and the ranger station ----
    clearing(-1150, -35, 16, yTrail);
    this.entrance = new THREE.Vector3(-1135, yTrail, -35);
    for (const dz of [-7, 7]) solidBox(g, sb, 0.5, 5.5, 0.5, -1124, yTrail, -35 + dz, darkWood);
    solidBox(g, sb, 0.6, 0.5, 15, -1124, yTrail + 5.4, -35, darkWood, { collide: false });
    sign(g, 'CHERRY ESTATE NATIONAL PARK', -1123.6, yTrail + 4.55, -35, Math.PI / 2, { w: 11, h: 1.7, bg: '#3b2a1a', fg: '#f2d9a0' });
    sign(g, 'CHERRY ESTATE NATIONAL PARK', -1124.4, yTrail + 4.55, -35, -Math.PI / 2, { w: 11, h: 1.7, bg: '#3b2a1a', fg: '#f2d9a0' });
    sign(g, 'BRIDGE TO SALTMARSH KEY ➜', -1140, yTrail + 2.2, -44, Math.PI / 2, { w: 6, h: 0.8, bg: '#1f5a2a', fg: '#ffffff', post: yTrail });
    clearing(-1165, -78, 12, yRanger);
    const logTex = canvasTex(64, 64, (c, cw, ch) => {
      c.fillStyle = '#7a5434'; c.fillRect(0, 0, cw, ch);
      for (let y = 0; y < ch; y += 8) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, y, cw, 2); c.fillStyle = 'rgba(255,220,170,0.12)'; c.fillRect(0, y + 3, cw, 2); }
    }, [3, 1.2]);
    solidBox(g, sb, 12, 4.5, 9, -1165, yRanger - 0.5, -80, std({ map: logTex }));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 8.2, 3, 4, 1), std({ color: 0x3f4a3a, roughness: 0.8, flatShading: true }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.05, 1, 0.8);
    roof.position.set(-1165, yRanger + 5.5, -80);
    roof.castShadow = true;
    g.add(roof);
    solidBox(g, sb, 12, 0.25, 3, -1165, yRanger, -74, wood);
    sign(g, 'RANGER STATION', -1165, yRanger + 3.2, -75.45, 0, { w: 6, h: 0.9, bg: '#2f4a2a', fg: '#f2e6c0' });
    for (let n = 0; n < 2; n++) this.lootSpots.push(new THREE.Vector3(-1168 + n * 5, yRanger + 0.6, -73.5));
    this.ranger = new THREE.Vector3(-1165, yRanger, -80);

    // ---- campsites: fire pit, tents, picnic table, stuff lying about ----
    const camp = (x, z, Yc) => {
      clearing(x, z, 14, Yc);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), std({ color: 0x77736c, flatShading: true }));
        st.position.set(x + Math.cos(a) * 1.1, Yc + 0.15, z + Math.sin(a) * 1.1);
        g.add(st);
      }
      const embers = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), std({ color: 0x2a1a10, emissive: 0xff5a10, emissiveIntensity: 0.8 }));
      embers.rotation.x = -Math.PI / 2; embers.position.set(x, Yc + 0.08, z);
      g.add(embers);
      const tentCols = [0xd9622b, 0x2b7fd9, 0x3aa760, 0xe0b42b];
      for (let t = 0; t < 2; t++) {
        const tx = x + (t ? 6 : -6), tz = z - 5;
        const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.9, 2.2, 4, 1), std({ color: tentCols[Math.floor(Math.random() * 4)], roughness: 0.9, flatShading: true }));
        tent.rotation.y = Math.PI / 4;
        tent.scale.set(1, 1, 1.5);
        tent.position.set(tx, Yc + 1.1, tz);
        tent.castShadow = true;
        g.add(tent);
        sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.3, 1, 1.9).setTranslation(tx, Yc + 1, tz));
        this.lootSpots.push(new THREE.Vector3(tx, Yc + 0.3, tz + 2.6));
      }
      solidBox(g, sb, 2.2, 0.08, 0.9, x + 4, Yc + 0.75, z + 5, wood, { collide: false });
      for (const s2 of [-0.75, 0.75]) solidBox(g, sb, 2.2, 0.45, 0.3, x + 4, Yc, z + 5 + s2, wood);
      for (const s2 of [-0.9, 0.9]) solidBox(g, sb, 0.1, 0.75, 0.8, x + 4 + s2, Yc, z + 5, wood);
      this.lootSpots.push(new THREE.Vector3(x + 3.6, Yc + 1.1, z + 5), new THREE.Vector3(x + 4.5, Yc + 1.1, z + 5));
      solidBox(g, sb, 0.7, 0.45, 0.45, x - 3, Yc, z + 3, std({ color: 0x2b6fd9 }));
      this.lootSpots.push(new THREE.Vector3(x - 3, Yc + 0.7, z + 3));
    };
    for (const [x, z, y] of camps) camp(x, z, y);
    this.camps = camps;

    // ---- lookout tower on a hilltop in the far corner ----
    const tx = -1650, tz = 330, Yl = yLook;
    clearing(tx, tz, 10, Yl);
    for (const [ax, az] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) solidBox(g, sb, 0.35, 12, 0.35, tx + ax, Yl, tz + az, darkWood);
    solidBox(g, sb, 5, 0.3, 5, tx, Yl + 12, tz, wood);
    for (const [ax, az, rw, rd] of [[0, 2.4, 5, 0.12], [-2.4, 0, 0.12, 5], [2.4, 0, 0.12, 5]]) solidBox(g, sb, rw, 1, rd, tx + ax, Yl + 12.3, tz + az, wood);
    const troof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4, 2, 4, 1), std({ color: 0x3f4a3a, flatShading: true }));
    troof.rotation.y = Math.PI / 4; troof.position.set(tx, Yl + 15.5, tz);
    g.add(troof);
    for (let i = 0; i < 4; i++) solidBox(g, sb, 0.15, 3, 0.15, tx + (i % 2 ? 2.3 : -2.3), Yl + 12.3, tz + (i < 2 ? 2.3 : -2.3), darkWood, { collide: false });
    for (let i = 0; i <= 30; i++) solidBox(g, sb, 1.3, 0.2, 0.42, tx, Yl + i * 0.4, tz - 2.75 - (30 - i) * 0.32, wood);
    this.lootSpots.push(new THREE.Vector3(tx, Yl + 12.6, tz));
    this.lookout = new THREE.Vector3(tx, Yl, tz);

    // ---- an old Cold War bunker dug into the hillside, off the Pine Ridge trail ----
    {
      const bx = -1392, bz = 92, Yb = yBunker;
      clearing(bx, bz, 9, Yb);
      const conc = std({ color: 0x8d8a82, roughness: 0.95 });
      const steel = std({ color: 0x3f4a44, roughness: 0.5, metalness: 0.6 });
      solidBox(g, sb, 7, 3.4, 6, bx - 1.5, Yb - 0.3, bz, conc); // the blockhouse, door facing east to the trail
      solidBox(g, sb, 7.6, 0.5, 6.6, bx - 1.5, Yb + 3.1, bz, conc);
      // a mound of earth heaped over the back
      const mound = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x4f6a35, roughness: 1, flatShading: true }));
      mound.scale.set(1, 0.6, 1.1); mound.position.set(bx - 5, Yb - 0.5, bz);
      g.add(mound);
      solidBox(g, sb, 0.25, 2.3, 1.5, bx + 2.05, Yb, bz, steel); // the door
      for (const s of [-1, 1]) solidBox(g, sb, 0.3, 2.6, 0.25, bx + 2.1, Yb, bz + s * 0.9, conc, { collide: false });
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 10), steel);
      vent.position.set(bx - 3, Yb + 4, bz + 1.5); g.add(vent);
      sign(g, 'KEEP OUT', bx + 2.2, Yb + 2.75, bz, Math.PI / 2, { w: 1.6, h: 0.35, bg: '#c9b23a', fg: '#1b1b1b' });
      this.bunker = { door: new THREE.Vector3(bx + 2.6, Yb, bz), out: new THREE.Vector3(bx + 4.5, Yb, bz), yaw: -Math.PI / 2 };
    }

    // ---- Underpass Customs: a mechanics' shed in the shadow of the bridge ----
    {
      const u = this.underBridge, gx = u.x + 8, gz = u.z + 4, Yg = this.heightAt(gx, gz);
      const tin = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#6e7378'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 6) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, 0, 2, h); } speckle(c, w, h, 200, 0.12); }, [3, 1]), roughness: 0.6, metalness: 0.5 });
      // three walls and a roof, open to the dirt lane on the east side
      solidBox(g, sb, 16, 5.5, 0.3, gx, Yg, gz - 6, tin);
      solidBox(g, sb, 0.3, 5.5, 12, gx - 8, Yg, gz, tin);
      solidBox(g, sb, 16, 5.5, 0.3, gx, Yg, gz + 6, tin);
      solidBox(g, sb, 16.6, 0.3, 12.6, gx, Yg + 5.5, gz, tin);
      const conc = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), std({ color: 0x6a6660, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
      conc.rotation.x = -Math.PI / 2; conc.position.set(gx, Yg + 0.06, gz); g.add(conc);
      for (let i = 0; i < 3; i++) solidBox(g, sb, 1.8, 0.9, 0.6, gx - 6 + i * 2.2, Yg, gz - 5.4, std({ color: [0xb3261e, 0x2f5a8a, 0x3a3c40][i] })); // tool chests
      solidBox(g, sb, 0.6, 1.2, 0.6, gx - 6.8, Yg, gz - 1, std({ color: 0x2a2c30 })); // compressor
      for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 8, 16), std({ color: 0x151515 })); t.rotation.x = Math.PI / 2; t.position.set(gx - 6.6, Yg + 0.2 + i * 0.32, gz + 4); g.add(t); }
      sign(g, 'UNDERPASS CUSTOMS', gx + 8.2, Yg + 4.6, gz, Math.PI / 2, { w: 8, h: 1.1, bg: '#151515', fg: '#ffb020', glow: true });
      this.garage = { bay: new THREE.Vector3(gx + 1, Yg, gz), pos: new THREE.Vector3(gx, Yg, gz), mechanics: [new THREE.Vector3(gx - 5, Yg, gz - 3.5), new THREE.Vector3(gx + 4, Yg, gz - 4)] };
    }

    // ---- Cherry Crest: a modern mansion on its own hill, with a helipad (for sale) ----
    {
      const M = this.mansionAt, Ym = M.y, mx = M.x, mz = M.z;
      const white = std({ color: 0xf2f0ea, roughness: 0.5 });
      const stone = std({ color: 0x8d877c, roughness: 0.9 });
      const glass = std({ color: 0x2c4a5e, roughness: 0.1, metalness: 0.6, emissive: 0x0c1a24, emissiveIntensity: 0.5 });
      const wood = std({ color: 0x7a5236, roughness: 0.7 });
      // lawn and terrace
      const lawn = new THREE.Mesh(new THREE.CircleGeometry(32, 40), std({ color: 0x5f8f3f, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(mx, Ym + 0.05, mz); g.add(lawn);
      solidBox(g, sb, 30, 0.4, 20, mx, Ym, mz - 2, stone);
      // ground floor: glass all round between white slabs
      solidBox(g, sb, 26, 0.5, 15, mx, Ym + 0.4, mz - 3, white);
      solidBox(g, sb, 24, 3.2, 13, mx, Ym + 0.9, mz - 3, glass);
      solidBox(g, sb, 28, 0.6, 17, mx, Ym + 4.1, mz - 3, white);
      // upper floor, cantilevered out over the pool, wood-clad
      solidBox(g, sb, 18, 3.4, 12, mx + 4, Ym + 4.7, mz - 1, wood);
      solidBox(g, sb, 16, 2.2, 0.1, mx + 4, Ym + 5.3, mz + 5.06, glass, { collide: false });
      solidBox(g, sb, 20, 0.5, 14, mx + 4, Ym + 8.1, mz - 1, white);
      // pool
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), std({ color: 0x3fb8e8, roughness: 0.05, metalness: 0.2, emissive: 0x0a3a5a, emissiveIntensity: 0.6 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(mx + 5, Ym + 0.45, mz + 10); g.add(pool);
      solidBox(g, sb, 15, 0.45, 0.4, mx + 5, Ym, mz + 7.3, stone); solidBox(g, sb, 15, 0.45, 0.4, mx + 5, Ym, mz + 12.7, stone);
      for (let i = 0; i < 3; i++) solidBox(g, sb, 0.8, 0.4, 2, mx - 4 + i * 1.4, Ym + 0.4, mz + 9.5, std({ color: 0xffffff }), { collide: false }); // loungers
      // helipad on the lawn
      const pad = new THREE.Mesh(new THREE.CircleGeometry(7, 32), std({ map: canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#2f3438'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2d23a'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.stroke();
        c.fillStyle = '#f2f2ee'; c.font = 'bold 72px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 64, 68);
      }), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(mx - 16, Ym + 0.08, mz + 14); g.add(pad);
      this.mansion = { door: new THREE.Vector3(mx - 6, Ym, mz + 4.8), spawn: new THREE.Vector3(mx - 6, Ym + 1, mz + 7), pad: new THREE.Vector3(mx - 16, Ym, mz + 14), sign: new THREE.Vector3(mx - 26, Ym, mz - 18) };
    }

    // ---- the forest: pines everywhere that isn't a road, trail or clearing ----
    this.plantPines();

    // boulders and fallen logs
    const rockM = std({ color: 0x7d7a74, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 110; i++) {
      const p = this.freeSpot(3);
      if (!p) continue;
      const r = 0.6 + Math.random() * 2.4;
      const yy = this.heightAt(p.x, p.z);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockM);
      rock.scale.y = 0.6 + Math.random() * 0.3;
      rock.rotation.set(Math.random(), Math.random() * 6, Math.random());
      rock.position.set(p.x, yy + r * 0.2, p.z);
      rock.castShadow = rock.receiveShadow = true;
      g.add(rock);
      sb.addStaticCollider(RAPIER.ColliderDesc.ball(r * 0.75).setTranslation(p.x, yy + r * 0.2, p.z));
    }
    const barkM = std({ color: 0x5a4030, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const p = this.freeSpot(5);
      if (!p) continue;
      const yy = this.heightAt(p.x, p.z);
      const len = 4 + Math.random() * 5, yaw = Math.random() * Math.PI;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, len, 8), barkM);
      log.rotation.set(0, yaw, Math.PI / 2, 'YXZ');
      log.position.set(p.x, yy + 0.3, p.z);
      log.castShadow = true;
      g.add(log);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ'));
      sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(len / 2, 0.34).setTranslation(p.x, yy + 0.3, p.z).setRotation(q));
    }
  }

  // Somewhere in the woods: not on a trail, not in a clearing, not by the city edge.
  freeSpot(margin = 2, tries = 20) {
    const isl = this.isl;
    for (let k = 0; k < tries; k++) {
      const x = isl.x0 + 6 + Math.random() * (isl.x1 - isl.x0 - 24);
      const z = isl.z0 + 6 + Math.random() * (isl.z1 - isl.z0 - 12);
      if (this.clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + margin)) continue;
      if (this.nearestRoad(x, z).d < 14 + margin) continue;
      if (this.garage && Math.hypot(x - this.garage.pos.x - 10, z - this.garage.pos.z) < 20 + margin) continue; // the garage's yard
      const ln = this.nearestLane(x, z);
      if (ln && ln.d < ln.l.width + 3 + margin) continue;
      const b = this.bridge;
      if (b) { const t = (x - b.start.x) * b.dir.x + (z - b.start.z) * b.dir.z; const lat = Math.abs((x - b.start.x) * b.dir.z - (z - b.start.z) * b.dir.x); if (t > -10 && lat < 16) continue; }
      let ok = true;
      for (const line of this.trails) {
        for (let i = 0; i < line.length - 1 && ok; i++) if (segDist(x, z, line[i], line[i + 1]) < 3.5 + margin) ok = false;
        if (!ok) break;
      }
      if (ok) return { x, z };
    }
    return null;
  }

  plantPines() {
    const g = this.group, sb = this.sb;
    const N = 4200;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 3.2, 6);
    trunkGeo.translate(0, 1.6, 0);
    const cones = [[2.3, 3.2, 2.9], [1.8, 2.8, 4.7], [1.25, 2.4, 6.3], [0.7, 1.8, 7.7]].map(([r, h, y]) => {
      const c = new THREE.ConeGeometry(r, h, 7);
      c.translate(0, y, 0);
      return c.toNonIndexed();
    });
    const leafGeo = mergeGeometries(cones);
    leafGeo.computeVertexNormals();
    const trunks = new THREE.InstancedMesh(trunkGeo, std({ color: 0x5a3e2a, roughness: 1 }), N);
    const leaves = new THREE.InstancedMesh(leafGeo, std({ color: 0xffffff, roughness: 0.9, flatShading: true }), N);
    trunks.userData.noMerge = leaves.userData.noMerge = true;
    trunks.castShadow = leaves.castShadow = true;
    trunks.receiveShadow = leaves.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (let k = 0; k < N * 2 && n < N; k++) {
      const s = this.freeSpot(0.5, 1);
      if (!s) continue;
      const size = 0.75 + Math.random() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      sc.set(size * (0.9 + Math.random() * 0.2), size, size * (0.9 + Math.random() * 0.2));
      p.set(s.x, this.heightAt(s.x, s.z) - 0.2, s.z);
      m.compose(p, q, sc);
      trunks.setMatrixAt(n, m);
      leaves.setMatrixAt(n, m);
      col.setHSL(0.33 + Math.random() * 0.06, 0.3 + Math.random() * 0.18, 0.1 + Math.random() * 0.07);
      leaves.setColorAt(n, col);
      sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(1.6 * size, 0.3 * size).setTranslation(s.x, p.y + 1.6 * size, s.z));
      n++;
    }
    trunks.count = leaves.count = n;
    trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
    leaves.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere(); leaves.computeBoundingSphere();
    g.add(trunks, leaves);
    this.pines = n;
  }
}
