import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, LAND_Y } from './world.js';
import { std, sign, solidBox, canvasTex, speckle, lamp } from './buildkit.js';
import { fbm, smooth, rng, makeRoad, RoadIndex, buildTerrain, ribbon, scatter, besideRoad } from './terrain.js';
import { gasStation } from './gasstation.js';
import { photoTex } from './park.js';

// Ridgeback Hills: the mountains north-west of Cherry Estate. Take the Ridgeback Expressway out
// of Verian City (or the coast road from under the Saltmarsh Gate Bridge) and you're in: a gas
// station at the foot, log cabins in a meadow, a gravel quarry cut into the hillside, and the
// Ridgeback Pass climbing through switchbacks to the top of Mount Ridgeback: a volcano. A tunnel
// from the summit car park leads into the crater, and the crime base built round its lava pit
// (see volcano.js). The pass is the Hillclimb street race.

const Y = LAND_Y;

export class Ridgeback {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'hills');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.R = rng(7);
    this.peak = { x: -2075, z: -1075 }; // the volcano (its crater)
    // the volcano's hollow: a cone-shaped cavern (radius cave at the floor, the base's level), its roof 7 m
    // under the mountainside, open to the sky through a little hole at the very top
    this.crater = { cave: 46, slope: 0.75, top: 58, thick: 7, oculus: 4.5 };
    this.quarry = { x: -1735, z: -985, r: 62 };
    this.plan();
    this.build();
  }

  natural(x, z) {
    const isl = this.isl;
    const e = Math.min(x - isl.x0, isl.x1 - x, z - isl.z0, isl.z1 - z);
    const mask = smooth(6, 90, e);
    const dP = Math.hypot(x - this.peak.x, z - this.peak.z);
    const mount = 175 * Math.pow(Math.max(0, 1 - dP / 310), 1.25) * (0.92 + 0.16 * fbm(x / 80 + 1.7, z / 80 - 4.2)); // a steep cone
    const ridge = 1 - Math.abs(fbm(x / 210, z / 210) * 2 - 1);
    const hills = 34 * (Math.pow(fbm(x / 150 + 9, z / 150 - 3), 1.5) * 0.7 + ridge * ridge * 0.4);
    return Y + mask * (mount + hills * (0.5 + 0.5 * smooth(-1560, -1900, x)));
  }

  plan() {
    // The pass follows the mountainside, never steeper than 12%, with wide hairpins.
    this.pass = makeRoad([[-1662, -421], [-1690, -495], [-1770, -545], [-1870, -570], [-1945, -600], [-1990, -640], [-2012, -688], [-2000, -728], [-1965, -752],
      [-1915, -772], [-1880, -805], [-1878, -845], [-1905, -868], [-1975, -872], [-2060, -852], [-2125, -852], [-2165, -875], [-2175, -912], [-2150, -940], [-2105, -940], [-2075, -960]],
    { width: 12, yOf: (s, x, z) => Math.max(Y + 0.1, s < 150 ? Y + 0.1 : this.natural(x, z) - 1.5), smoothN: 12, maxGrade: 0.12, name: 'pass' });
    this.summitY = this.pass.pts.at(-1).y;
    const q = this.quarry;
    const passY = (x, z) => this.pass.pts.reduce((b, p) => ((p.x - x) ** 2 + (p.z - z) ** 2 < (b.x - x) ** 2 + (b.z - z) ** 2 ? p : b)).y;
    this.quarryRoad = makeRoad([[-1790, -556], [-1770, -650], [-1760, -760], [-1745, -870], [q.x, q.z - 30]], { width: 7, kind: 'dirt', smoothN: 8, maxGrade: 0.14,
      yOf: (s, x, z) => { if (s < 20) return passY(x, z); const t = smooth(q.r + 70, q.r, Math.hypot(x - q.x, z - q.z)); const n = this.natural(x, z) - 1; return n + (this.quarryFloor() - n) * t; } });
    this.roads = [this.pass, this.quarryRoad];
    this.index = new RoadIndex(this.roads);
    const P = this.pass.pts.at(-1);
    const gas = besideRoad(this.pass, -1700, -470, 27);
    this.flats = [
      { ...gas, r: 30, blend: 26 }, // the gas station, level with the road
      { x: -1880, z: -640, r: 34, y: passY(-1880, -640), blend: 45 }, // the meadow with the cabins (at road level, sloping gently up to the hills)
      { x: P.x, z: P.z - 6, r: 22, y: P.y }, // the summit car park, at the mouth of the tunnel into the crater
    ];
    // the tunnel: from the car park, straight in to the cavern (its portal is where the ground is high enough)
    const V = this.peak, dx = V.x - P.x, dz = V.z - P.z, dl = Math.hypot(dx, dz);
    this.tunnel = { a: { x: P.x, z: P.z }, u: { x: dx / dl, z: dz / dl }, len: dl - this.crater.cave + 1, y: P.y, portal: null };
    const T = this.tunnel;
    this.tunnelRoad = makeRoad([[P.x, P.z], [P.x + T.u.x * T.len * 0.5, P.z + T.u.z * T.len * 0.5], [P.x + T.u.x * T.len, P.z + T.u.z * T.len]], { width: 10, yOf: () => P.y + 0.1, smoothN: 2, name: 'tunnel' });
    this.tunnelRoad.underground = true;
    this.index = new RoadIndex(this.roads); // (the tunnel isn't a surface road: the hill stays over it)
    for (let t = 6; t < T.len; t += 1) { const x = P.x + T.u.x * t, z = P.z + T.u.z * t; if (this.heightAt(x, z) - P.y > 9.5) { T.portal = t; break; } }
    T.portal ??= T.len * 0.4;
    this.roads.push(this.tunnelRoad);
    for (const f of this.flats) if (f.y == null) f.y = this.natural(f.x, f.z);
  }

  quarryFloor() { return Y + 4; }

  heightAt(x, z) {
    let h = this.natural(x, z);
    const q = this.quarry, dq = Math.hypot(x - q.x, z - q.z);
    if (dq < q.r + 60) { // terraced benches down to the floor
      const f = this.quarryFloor();
      const t = smooth(q.r, q.r + 60, dq);
      const want = f + (h - f) * t;
      h = dq < q.r ? f : Math.min(h, f + Math.floor((want - f) / 6) * 6 + (want - f) % 6 * 0.15);
    }
    for (const fl of this.flats) { const b = fl.blend || 20, d = Math.hypot(x - fl.x, z - fl.z); if (d < fl.r + b) h = fl.y + (h - fl.y) * smooth(fl.r, fl.r + b, d); }
    const n = this.index.nearest(x, z, 40);
    if (n) { const w = n.r.width / 2; h = n.p.y - 0.05 + (h - n.p.y + 0.05) * smooth(w + 3.5, w + 28, n.d); } // (a flat verge, then the bank)
    return this.volcanoAt(x, z, h);
  }

  // The volcano's summit: a clean cone (its slope parallel to the cavern's roof inside), with the
  // tunnel cut into its side from the car park to the portal (beyond that it runs underground).
  coneAt(r) { const K = this.crater; return this.summitY + K.top - K.slope * r; }
  volcanoAt(x, z, h) {
    const V = this.peak, r = Math.hypot(x - V.x, z - V.z);
    if (r > 200) return h;
    const cone = this.coneAt(r);
    h = r < 40 ? cone : cone + (Math.max(h, cone) - cone) * smooth(40, 75, r);
    const T = this.tunnel;
    if (T.portal != null) {
      const ax = x - T.a.x, az = z - T.a.z, t = ax * T.u.x + az * T.u.z, lat = Math.abs(ax * T.u.z - az * T.u.x);
      if (t > -4 && t < T.portal + 1) h = Math.min(h, T.y - 0.05 + Math.max(0, lat - 6.5) * 2.2);
    }
    const sm = this.flats[2], dsm = Math.hypot(x - sm.x, z - sm.z);
    if (dsm < sm.r + 22) h = sm.y + (h - sm.y) * smooth(sm.r, sm.r + 22, dsm);
    return h;
  }

  free(x, z, m = 2) {
    const isl = this.isl;
    if (x < isl.x0 + 4 || x > isl.x1 - 4 || z < isl.z0 + 4 || z > isl.z1 - 4) return false;
    if (this.index.nearest(x, z, 9 + m)) return false;
    if (this.flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + m)) return false;
    if (Math.hypot(x - this.quarry.x, z - this.quarry.z) < this.quarry.r + 30) return false;
    if (Math.hypot(x - this.peak.x, z - this.peak.z) < 130) return false; // the crater
    return true;
  }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl, R = this.R;
    const base = import.meta.env.BASE_URL;
    const W = isl.x1 - isl.x0, D = isl.z1 - isl.z0;
    const q = this.quarry;
    buildTerrain(g, sb, isl, {
      heightAt: (x, z) => this.heightAt(x, z), step: 5, sideColor: 0x6a604e, castShadow: true,
      hole: (x, z) => Math.hypot(x - this.peak.x, z - this.peak.z) < this.crater.oculus + 0.5, // the vent at the top
      map: photoTex(`${base}assets/textures/grass.jpg`, W / 9, D / 9),
      colorAt: (x, y, z, ny) => {
        const steep = smooth(0.9, 0.66, ny), high = smooth(Y + 90, Y + 145, y);
        const gravel = smooth(q.r + 50, q.r, Math.hypot(x - q.x, z - q.z));
        const k = Math.max(steep, high * 0.9);
        const c = [1 - k * 0.12, 1 - k * 0.42, 1 - k * 0.2 + k * 0.08]; // grey-brown rock up high and on the crags
        if (gravel > 0) { c[0] += gravel * 0.85; c[1] += gravel * 0.55; c[2] += gravel * 0.45; }
        const vr = Math.hypot(x - this.peak.x, z - this.peak.z), basalt = smooth(300, 170, vr);
        if (basalt > 0) { // dark grey-brown rock (the texture's green, so the tint undoes it)
          const t = [0.5, 0.33, 0.78].map((v) => v * (0.85 - 0.25 * steep));
          for (let k3 = 0; k3 < 3; k3++) c[k3] += (t[k3] - c[k3]) * basalt;
        }
        const snow = smooth(Y + 128, Y + 150, y) * smooth(0.7, 0.85, ny) * (1 - basalt);
        if (snow > 0) { c[0] += snow * 2.2; c[1] += snow * 1.9; c[2] += snow * 2.2; }
        return c;
      },
    });
    // ---- the pass (asphalt with a centre line) and the quarry track ----
    const roadTex = canvasTex(64, 128, (c, cw, ch) => {
      c.fillStyle = '#3a3d41'; c.fillRect(0, 0, cw, ch); speckle(c, cw, ch, 500, 0.06);
      c.fillStyle = '#e8c547'; c.fillRect(cw / 2 - 2, 0, 1.5, ch); c.fillRect(cw / 2 + 0.5, 0, 1.5, ch);
      c.fillStyle = '#e8e8e2'; c.fillRect(3, 0, 1.5, ch); c.fillRect(cw - 4.5, 0, 1.5, ch);
    });
    ribbon(g, this.pass.pts, 12, std({ map: roadTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    ribbon(g, this.tunnelRoad.pts, 10, std({ map: roadTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    ribbon(g, this.quarryRoad.pts, 7, std({ map: photoTex(`${base}assets/textures/dirt.jpg`, 1, 1), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), { uScale: 6, yOf: (p, x, z) => this.heightAt(x, z) });
    // crash barriers on the outside of the hairpins (where the drop is)
    const barM = std({ color: 0xc8ccd0, metalness: 0.6, roughness: 0.4 });
    const pts = this.pass.pts;
    for (let i = 4; i < pts.length - 4; i += 3) {
      const a = pts[i - 3], b = pts[i], c = pts[i + 3];
      const turn = Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
      const tn = Math.atan2(Math.sin(turn), Math.cos(turn));
      if (Math.abs(tn) < 0.12 || b.y < Y + 15) continue;
      const dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz);
      // the outside of the bend: away from where the road curls round to
      const ix = (a.x + c.x) / 2 - b.x, iz = (a.z + c.z) / 2 - b.z;
      const out = (dz / l) * ix + (-dx / l) * iz > 0 ? -1 : 1;
      const nx = (dz / l) * out, nz = (-dx / l) * out;
      const px = b.x + nx * 7.2, pz = b.z + nz * 7.2;
      const yaw = Math.atan2(dx, dz);
      solidBox(g, sb, 0.25, 0.75, 9.5, px, b.y, pz, barM, { rotY: yaw, collide: false });
      // (a capsule, not a box: rounded ends, so a car glances off instead of snagging a corner)
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, yaw, 0, 'YXZ'));
      sb.addStaticCollider(RAPIER.ColliderDesc.capsule(4.6, 0.3).setTranslation(px, b.y + 0.55, pz).setRotation(q));
    }

    // ---- the gas station at the foot of the pass ----
    const gs = this.flats[0];
    gasStation(g, sb, gs.x, gs.y, gs.z, gs.yaw, { name: 'RIDGEBACK GAS & GROCERY', sub: 'GROCERY · BAIT · FIREWOOD', brand: 0xc23b2a, brand2: 0xf2f0ea, prices: ['3.59', '3.89', '4.19'], loot: this.lootSpots });
    { const b = besideRoad(this.pass, -1640, -440, 9); sign(g, 'RIDGEBACK HILLS · SUMMIT 2 MI', b.x, b.y + 3.2, b.z, b.yaw + Math.PI, { w: 7, h: 1.1, bg: '#1f5a2a', fg: '#ffffff', post: b.y }); }

    // ---- log cabins in the meadow ----
    const mw = this.flats[1], yM = mw.y;
    const logTex = canvasTex(64, 64, (c, cw, ch) => {
      c.fillStyle = '#7a5434'; c.fillRect(0, 0, cw, ch);
      for (let y = 0; y < ch; y += 8) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, y, cw, 2); c.fillStyle = 'rgba(255,220,170,0.12)'; c.fillRect(0, y + 3, cw, 2); }
    }, [2, 1]);
    const logM = std({ map: logTex, roughness: 0.9 }), roofM = std({ color: 0x3f4a3a, roughness: 0.8, flatShading: true });
    for (const [dx, dz, yaw] of [[-20, -14, 0.3], [6, -22, -0.2], [22, 2, -1.4], [-24, 12, 1.2]]) {
      const x = mw.x + dx, z = mw.z + dz;
      const yc = Math.max(yM, this.heightAt(x, z)) ;
      solidBox(g, sb, 8.6, 1.8, 7.1, x, yc - 1.6, z, std({ color: 0x7d7a74, roughness: 0.95 }), { rotY: yaw, collide: false }); // stone footing
      solidBox(g, sb, 8, 3.6, 6.5, x, yc + 0.2, z, logM, { rotY: yaw });
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.2, 2.6, 4, 1), roofM);
      roof.rotation.y = Math.PI / 4 + yaw; roof.scale.set(1.1, 1, 0.85); roof.position.set(x, yc + 5.1, z); roof.castShadow = true; g.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1), std({ color: 0x3a2618 }));
      door.position.set(x + Math.sin(yaw) * 3.3, yc + 1.2, z + Math.cos(yaw) * 3.3); door.rotation.y = yaw; g.add(door);
      this.lootSpots.push(new THREE.Vector3(x + Math.sin(yaw) * 4.2, this.heightAt(x + Math.sin(yaw) * 4.2, z + Math.cos(yaw) * 4.2) + 0.4, z + Math.cos(yaw) * 4.2));
    }
    const fire = new THREE.Mesh(new THREE.CircleGeometry(1, 12), std({ color: 0x2a1a10, emissive: 0xff5a10, emissiveIntensity: 0.8 }));
    fire.rotation.x = -Math.PI / 2; fire.position.set(mw.x, yM + 0.08, mw.z); g.add(fire);
    sign(g, 'RIDGEBACK CABINS', mw.x + 30, yM + 2.4, mw.z + 24, -0.8, { w: 5, h: 0.9, bg: '#3b2a1a', fg: '#f2d9a0', post: yM });

    // ---- the quarry: gravel benches, a crusher, a conveyor and a dump truck ----
    const yQ = this.quarryFloor();
    const yellow = std({ color: 0xe0b42b, roughness: 0.6 }), steel = std({ color: 0x6a6e74, metalness: 0.6, roughness: 0.5 });
    solidBox(g, sb, 9, 7, 7, q.x + 18, yQ, q.z + 6, steel);
    solidBox(g, sb, 10, 2, 8, q.x + 18, yQ + 7, q.z + 6, yellow, { collide: false });
    const conv = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 30), std({ color: 0x2a2c30 }));
    conv.position.set(q.x + 18, yQ + 9, q.z - 12); conv.rotation.x = -0.32; conv.castShadow = true; g.add(conv);
    for (const [px, pz, r, h] of [[q.x - 22, q.z + 14, 7, 6], [q.x + 12, q.z - 30, 9, 8], [q.x - 8, q.z - 20, 5, 4]]) { // gravel heaps
      const heap = new THREE.Mesh(new THREE.ConeGeometry(r, h, 14), std({ color: 0xa89a86, roughness: 1, flatShading: true }));
      heap.position.set(px, yQ + h / 2, pz); heap.castShadow = heap.receiveShadow = true; g.add(heap);
      sb.addStaticCollider(RAPIER.ColliderDesc.cone(h / 2, r * 0.85).setTranslation(px, yQ + h / 2, pz));
    }
    const truck = new THREE.Group(); truck.position.set(q.x - 14, yQ, q.z - 4); truck.rotation.y = 0.7; g.add(truck);
    const tb = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; truck.add(b); };
    tb(4, 1.2, 9, 0, 2.2, 0, yellow); tb(3.6, 2.6, 5, 0, 4.0, 1.5, yellow); tb(3.4, 2, 2.8, 0, 3.6, -3.4, yellow); tb(3, 1, 2.6, 0, 4.4, -3.4, std({ color: 0x2c4a5e }));
    for (const [wx, wz] of [[-2.1, -3], [2.1, -3], [-2.1, 2.6], [2.1, 2.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.9, 14), std({ color: 0x1a1a1a })); w.rotation.z = Math.PI / 2; w.position.set(wx, 1.2, wz); truck.add(w); }
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(2.2, 2.6, 5).setTranslation(truck.position.x, yQ + 2.6, truck.position.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7)));
    sign(g, 'RIDGEBACK AGGREGATES · HARD HATS', q.x - 30, yQ + 2.2, q.z - 40, 0.4, { w: 7, h: 0.9, bg: '#e0b42b', fg: '#1b1b1b', post: yQ });
    this.lootSpots.push(new THREE.Vector3(q.x + 13, yQ + 0.4, q.z + 10));

    // ---- the summit car park, at the tunnel mouth ----
    const sm = this.flats[2], yS = sm.y;
    const asph = std({ color: 0x3c3f43, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
    const lot = new THREE.Mesh(new THREE.CircleGeometry(sm.r - 1, 32), asph); lot.rotation.x = -Math.PI / 2; lot.position.set(sm.x, yS + 0.06, sm.z); g.add(lot);
    sign(g, 'MT RIDGEBACK · SUMMIT', sm.x - 14, yS + 2.2, sm.z + 10, -2.2, { w: 4.4, h: 0.8, bg: '#1f5a2a', fg: '#ffffff', post: yS });
    this.summit = new THREE.Vector3(sm.x, yS, sm.z);

    // ---- pines, firs higher up, boulders ----
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 3.2, 6); trunkGeo.translate(0, 1.6, 0);
    const cones = [[2.3, 3.2, 2.9], [1.8, 2.8, 4.7], [1.25, 2.4, 6.3], [0.7, 1.8, 7.7]].map(([r, h, y]) => { const c = new THREE.ConeGeometry(r, h, 7); c.translate(0, y, 0); return c.toNonIndexed(); });
    const leafGeo = mergeGeometries(cones); leafGeo.computeVertexNormals();
    const spots = [];
    for (let k = 0; k < 16000 && spots.length < 4800; k++) {
      const x = isl.x0 + R() * W, z = isl.z0 + R() * D;
      if (!this.free(x, z, 3)) continue;
      const y = this.heightAt(x, z);
      if (y > Y + 132) continue; // the treeline
      if (Math.hypot(x - this.peak.x, z - this.peak.z) < 230) continue; // bare volcanic rock up top
      spots.push({ x, y: y - 0.2, z, s: 0.7 + R() * 0.9, yaw: R() * 6.28 });
    }
    scatter(g, trunkGeo, std({ color: 0x5a3e2a, roughness: 1 }), spots.length, (i) => spots[i]);
    const col = new THREE.Color();
    scatter(g, leafGeo, std({ color: 0xffffff, roughness: 0.9, flatShading: true }), spots.length, (i) => {
      col.setHSL(0.33 + R() * 0.06, 0.28 + R() * 0.18, 0.09 + R() * 0.07);
      return { ...spots[i], color: col.getHex() };
    }, { collide: (o) => sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(1.6 * o.s, 0.3 * o.s).setTranslation(o.x, o.y + 1.6 * o.s, o.z)) });
    const rockM = std({ color: 0x7d7a74, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 90; i++) {
      const x = isl.x0 + R() * W, z = isl.z0 + R() * D;
      if (!this.free(x, z, 2)) continue;
      const r = 0.8 + R() * 3, yy = this.heightAt(x, z);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockM);
      rock.scale.y = 0.6 + R() * 0.3; rock.rotation.set(R(), R() * 6, R());
      rock.position.set(x, yy + r * 0.2, z); rock.castShadow = rock.receiveShadow = true; g.add(rock);
      sb.addStaticCollider(RAPIER.ColliderDesc.ball(r * 0.75).setTranslation(x, yy + r * 0.2, z));
    }

    // ---- the Hillclimb street race: from the gas station to the observatory ----
    const p0 = this.pass.pts.findIndex((p) => p.s > 95);
    const cps = [];
    for (let i = p0; i < this.pass.pts.length; i += 9) { const p = this.pass.pts[i]; cps.push(new THREE.Vector3(p.x, p.y, p.z)); }
    const last = this.pass.pts.at(-1); cps.push(new THREE.Vector3(last.x, last.y, last.z));
    this.race = { id: 'hillclimb', name: 'Ridgeback Hillclimb', laps: 1, loop: false, prize: [5000, 1800, 700], pts: cps, desc: 'Point to point: from the gas station, through the meadow and up the switchbacks of the Ridgeback Pass to the observatory, 150 m up.' };
  }
}
