import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y, addPier } from './world.js';
import { std, sign, solidBox, canvasTex, speckle, house, lamp, tree } from './buildkit.js';
import { fbm, smooth, rng, makeRoad, RoadIndex, buildTerrain, ribbon } from './terrain.js';
import { photoTex } from './park.js';

// Pelican Point: a little fishing village on a grassy headland east of the Hollows, over a short
// bridge from the end of the z = -1500 street. Cottages, a seafood shack and a harbour with the
// boats tied up, and out on the rocky point a red-and-white lighthouse that sweeps the sea at
// night. One road loops right round the point: the Lighthouse Loop street race.

const Y = LAND_Y;

export class Pelican {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'point');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.R = rng(41);
    this.hill = { x: 168, z: -1532 };
    this.plan();
    this.build();
  }

  // the raw ground: gentle grass by the village, a rocky hill out on the point
  natural(x, z) {
    const isl = this.isl;
    const e = Math.min(x - isl.x0, isl.x1 - x, z - isl.z0, isl.z1 - z);
    const mask = smooth(4, 45, e);
    const d = Math.hypot(x - this.hill.x, z - this.hill.z);
    const hill = 21 * smooth(150, 16, d) * (0.9 + fbm(x / 45, z / 45) * 0.2);
    const roll = 3.5 * fbm(x / 70 + 4, z / 70 - 2);
    return Y + mask * (roll + hill * smooth(0, 30, e));
  }

  plan() {
    const isl = this.isl;
    const yRoad = (s, x, z) => Y + 0.1 + (this.natural(x, z) - Y) * 0.6;
    this.loop = makeRoad([[-62, -1500], [-42, -1572], [8, -1628], [88, -1655], [160, -1648], [210, -1600], [218, -1528], [200, -1455], [146, -1404], [64, -1392], [-6, -1410], [-48, -1448]], { width: 10, loop: true, yOf: yRoad, smoothN: 12, name: 'loop' });
    this.entry = makeRoad([[isl.x0 - 2, -1500], [-95, -1500], [-62, -1500]], { width: 10, yOf: () => Y + 0.1, smoothN: 2 });
    const loopY = (x, z) => this.loop.pts.reduce((b, p) => ((p.x - x) ** 2 + (p.z - z) ** 2 < (b.x - x) ** 2 + (b.z - z) ** 2 ? p : b)).y;
    this.lane = makeRoad([[207, -1595], [192, -1575], [178, -1552], [172, -1545]], { width: 5, kind: 'dirt', yOf: (s, x, z) => (s < 10 ? loopY(x, z) : this.natural(x, z)), smoothN: 3 });
    this.roads = [this.loop, this.entry, this.lane];
    this.index = new RoadIndex(this.roads);
    this.flats = [
      { x: -20, z: -1500, r: 26, y: Y + 0.3 }, // the village green
      { x: this.hill.x, z: this.hill.z, r: 15, y: null }, // the lighthouse yard
      { x: -40, z: -1660, r: 22, y: Y + 0.2 }, // the harbour front
    ];
    for (const f of this.flats) if (f.y == null) f.y = this.natural(f.x, f.z);
  }

  heightAt(x, z) {
    let h = this.natural(x, z);
    for (const f of this.flats) { const d = Math.hypot(x - f.x, z - f.z); if (d < f.r + 16) h = f.y + (h - f.y) * smooth(f.r, f.r + 16, d); }
    const n = this.index.nearest(x, z, 36);
    if (n) { const w = n.r.width / 2; h = n.p.y - 0.05 + (h - n.p.y + 0.05) * smooth(w + 2, w + 26, n.d); }
    return h;
  }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl, R = this.R;
    const base = import.meta.env.BASE_URL;
    const W = isl.x1 - isl.x0, D = isl.z1 - isl.z0;
    // ---- the ground: grass, sandy at the shore, grey rock up on the point ----
    buildTerrain(g, sb, isl, {
      heightAt: (x, z) => this.heightAt(x, z), step: 4, sideColor: 0x8a7d66,
      map: photoTex(`${base}assets/textures/grass.jpg`, W / 9, D / 9),
      colorAt: (x, y, z, ny) => {
        const e = Math.min(x - isl.x0, isl.x1 - x, z - isl.z0, isl.z1 - z);
        const sand = smooth(16, 5, e) * smooth(Y + 4, Y + 1, y);
        const rock = Math.max(smooth(0.9, 0.7, ny), smooth(Y + 14, Y + 24, y) * 0.8);
        const c = [1, 1, 1];
        c[0] += sand * 1.2 + rock * 0.3; c[1] += sand * 0.75 - rock * 0.05; c[2] += sand * 0.25 + rock * 0.25;
        return c;
      },
    });
    // ---- roads ----
    const roadTex = canvasTex(64, 128, (c, cw, ch) => {
      c.fillStyle = '#3d4044'; c.fillRect(0, 0, cw, ch); speckle(c, cw, ch, 500, 0.07);
      c.fillStyle = '#e8e8e2'; for (let y = 0; y < ch; y += 32) c.fillRect(cw / 2 - 1, y, 2, 16);
      c.fillRect(3, 0, 1.5, ch); c.fillRect(cw - 4.5, 0, 1.5, ch);
    });
    const asphalt = std({ map: roadTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    ribbon(g, this.loop.pts, 10, asphalt, { loop: true });
    ribbon(g, this.entry.pts, 10, asphalt);
    ribbon(g, this.lane.pts, 5, std({ map: photoTex(`${base}assets/textures/dirt.jpg`, 1, 1), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), { uScale: 6, yOf: (p, x, z) => this.heightAt(x, z) });

    // ---- the bridge over from the Hollows (the z = -1500 street runs on across the strip) ----
    const hx1 = -180, sx0 = -248;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(hx1 - sx0, 10), std({ color: 0x45474b, roughness: 0.9 }));
    strip.rotation.x = -Math.PI / 2; strip.position.set((sx0 + hx1) / 2, Y + 0.04, -1500); strip.receiveShadow = true; g.add(strip);
    const bx0 = hx1 - 1, bx1 = isl.x0 + 1;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, 1.2, 12), std({ color: 0x9a948a }));
    deck.position.set((bx0 + bx1) / 2, Y - 0.6, -1500); deck.receiveShadow = deck.castShadow = true; g.add(deck);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((bx1 - bx0) / 2, 0.6, 6).setTranslation(deck.position.x, Y - 0.6, -1500));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0, 10), std({ map: roadTex.clone(), roughness: 0.9 }));
    top.material.map.repeat.set(1, 1); top.rotation.set(-Math.PI / 2, 0, Math.PI / 2); top.position.set(deck.position.x, Y + 0.02, -1500); g.add(top);
    addPier(bx0, bx1, -1506, -1494);
    const railM = std({ color: 0xe8e4dc, roughness: 0.6 });
    for (const s of [-1, 1]) solidBox(g, sb, bx1 - bx0, 1, 0.3, deck.position.x, Y, -1500 + s * 5.85, railM);
    for (let x = bx0 + 6; x < bx1; x += 14) for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2.4), std({ color: 0x7a766e })); p.position.set(x, Y - 5, -1500 + s * 4); g.add(p); }
    sign(g, 'PELICAN POINT ➜', hx1 - 6, Y + 3, -1508, Math.PI / 2, { w: 6, h: 1.1, bg: '#1f5a7a', fg: '#ffffff', post: Y });
    sign(g, 'WELCOME TO PELICAN POINT', isl.x0 + 8, Y + 3.2, -1510, -Math.PI / 2, { w: 8, h: 1.3, bg: '#f2efe6', fg: '#1f5a7a', post: Y });
    this.entrance = new THREE.Vector3(isl.x0 + 14, Y, -1500);

    // ---- the village: cottages round the green and along the road in ----
    const yAt = (x, z) => this.heightAt(x, z);
    const cottage = (x, z, faceX, faceZ, w = 7, d = 6) => {
      const yaw = Math.atan2(faceX - x, faceZ - z);
      const y0 = yAt(x, z);
      this.lootSpots.push(house(g, sb, x, y0, z, yaw, w, d, 3.4));
    };
    for (const [x, z, fx, fz] of [[-100, -1478, -100, -1500], [-80, -1478, -80, -1500], [-100, -1522, -100, -1500], [-80, -1524, -80, -1500],
      [-14, -1530, -20, -1500], [8, -1508, -20, -1500], [-2, -1474, -20, -1500], [-38, -1478, -20, -1500], [-30, -1532, -20, -1500]]) cottage(x, z, fx, fz);
    // the green: a flagpole, benches and an old anchor
    const yG = this.flats[0].y;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 9, 8), std({ color: 0xe8e8e2 })); pole.position.set(-20, yG + 4.5, -1500); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), std({ map: canvasTex(64, 40, (c, w, h) => { c.fillStyle = '#1f5a7a'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2efe6'; c.beginPath(); c.arc(w / 2, h / 2, 10, 0, 7); c.fill(); }), side: THREE.DoubleSide }));
    flag.position.set(-19.1, yG + 8.3, -1500); g.add(flag); this.flag = flag;
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(4.5, 0.12).setTranslation(-20, yG + 4.5, -1500));
    const wood = std({ color: 0x7a5a3a, roughness: 0.9 });
    for (const [bx, bz, r] of [[-10, -1512, 0], [-30, -1488, Math.PI], [-8, -1490, Math.PI / 2]]) {
      solidBox(g, sb, 2, 0.08, 0.5, bx, yG + 0.45, bz, wood, { collide: false, rotY: r });
      solidBox(g, sb, 2, 0.45, 0.45, bx, yG, bz, wood, { collide: true, rotY: r });
    }
    const anchorM = std({ color: 0x2a2c30, metalness: 0.6, roughness: 0.5 });
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), anchorM); shank.position.set(-26, yG + 1.3, -1512); g.add(shank);
    const arms = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 16, Math.PI), anchorM); arms.rotation.z = Math.PI; arms.position.set(-26, yG + 0.9, -1512); g.add(arms);
    for (const [lx, lz] of [[-60, -1488], [-60, -1512], [-110, -1490], [20, -1560], [60, -1640], [120, -1408], [40, -1404]]) lamp(g, sb, lx, yAt(lx, lz), lz);
    for (let k = 0; k < 26; k++) {
      const x = isl.x0 + 15 + R() * 170, z = isl.z0 + 15 + R() * (D - 30);
      if (this.index.nearest(x, z, 11) || this.flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 4)) continue;
      if (Math.hypot(x - this.hill.x, z - this.hill.z) < 60) continue;
      tree(g, sb, x, yAt(x, z), z, 0.8 + R() * 0.4);
    }

    // ---- the seafood shack and the harbour ----
    const yH = this.flats[2].y;
    const shack = std({ color: 0x3f6f8a, roughness: 0.8 });
    solidBox(g, sb, 12, 4, 7, -40, yH, -1648, shack);
    const sroof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 8.5), std({ color: 0xc23b2a })); sroof.position.set(-40, yH + 4.2, -1648); sroof.castShadow = true; g.add(sroof);
    solidBox(g, sb, 12, 0.15, 3, -40, yH + 2.6, -1643, std({ color: 0xf2efe6 }), { collide: false });
    sign(g, 'PELICAN POINT SEAFOOD', -40, yH + 5.4, -1644.2, 0, { w: 9, h: 1.1, bg: '#f2efe6', fg: '#c23b2a' });
    sign(g, 'BAIT · ICE · CHOWDER', -40, yH + 3.0, -1644.4, 0, { w: 5, h: 0.6, bg: '#1f5a7a', fg: '#ffffff' });
    for (const tx of [-48, -40, -32]) { solidBox(g, sb, 2, 0.08, 1, tx, yH + 0.75, -1636, wood, { collide: false }); solidBox(g, sb, 2, 0.75, 0.2, tx, yH, -1636, wood); }
    this.lootSpots.push(new THREE.Vector3(-40, yH + 0.9, -1636), new THREE.Vector3(-32, yH + 0.9, -1636));
    // the jetty out into the harbour, with three fishing boats tied up
    const jx0 = -10, jx1 = -2, jz0 = isl.z0 - 70, jz1 = isl.z0 + 2;
    const plank = std({ map: canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#8a6a48'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, y, w, 2); } speckle(c, w, h, 500, 0.08); }, [1, 8]) });
    solidBox(g, sb, jx1 - jx0, 0.5, jz1 - jz0, (jx0 + jx1) / 2, Y - 0.5, (jz0 + jz1) / 2, plank);
    addPier(jx0, jx1, jz0, jz1);
    for (let z = jz0 + 2; z < jz1; z += 8) for (const x of [jx0, jx1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 8), wood); p.position.set(x, Y - 3, z); g.add(p); }
    const hullCols = [0xc23b2a, 0x1f5a7a, 0xe0b42b];
    this.boats = [];
    for (let k = 0; k < 3; k++) {
      const bt = this.fishingBoat(hullCols[k]);
      const side = k % 2 ? 1 : -1;
      bt.position.set((jx0 + jx1) / 2 + side * 6.5, Y - 1.6, jz0 + 12 + k * 18);
      bt.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(bt);
      this.boats.push({ m: bt, ph: k * 1.7, y: bt.position.y });
    }
    for (let k = 0; k < 6; k++) { // lobster pots stacked on the jetty
      const pot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), std({ color: 0x8a6a3a, roughness: 1 }));
      pot.position.set(jx0 + 1.2, Y + 0.25 + (k % 2) * 0.5, jz1 - 6 - Math.floor(k / 2) * 0.8); g.add(pot);
    }

    // ---- the lighthouse ----
    const L = this.hill, yL = this.flats[1].y;
    const tower = new THREE.Group(); tower.position.set(L.x, yL, L.z); g.add(tower);
    const stripes = canvasTex(64, 256, (c, w, h) => { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#c23b2a' : '#f4f1ea'; c.fillRect(0, (i * h) / 6, w, h / 6); } }, [1, 1]);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 3.3, 22, 24), std({ map: stripes, roughness: 0.6 })); body.position.y = 11; tower.add(body);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.3, 24), std({ color: 0x2a2c30 })); gallery.position.y = 22.1; tower.add(gallery);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06), std({ color: 0x2a2c30 })); r.position.set(Math.cos(a) * 3.1, 22.7, Math.sin(a) * 3.1); tower.add(r); }
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.6, 12), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe8a0, emissiveIntensity: 0.4, transparent: true, opacity: 0.75, roughness: 0.1 }));
    lantern.position.y = 23.6; tower.add(lantern); this.lantern = lantern;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2, 12), std({ color: 0x2a2c30, metalness: 0.4 })); cap.position.y = 25.9; tower.add(cap);
    // the beam: two long faint cones that sweep round at night
    const beamM = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    const beam = new THREE.Group(); beam.position.y = 23.6; tower.add(beam);
    for (const s of [0, Math.PI]) { const c = new THREE.Mesh(new THREE.ConeGeometry(9, 160, 16, 1, true), beamM); c.rotation.z = Math.PI / 2; c.position.x = 80; const holder = new THREE.Group(); holder.rotation.y = s; holder.add(c); beam.add(holder); }
    beam.traverse((o) => { o.userData.noMerge = true; });
    lantern.userData.noMerge = true;
    this.beam = beam; this.beamM = beamM;
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(11, 3).setTranslation(L.x, yL + 11, L.z));
    // the keeper's cottage beside it
    this.lootSpots.push(house(g, sb, L.x - 10, yL, L.z + 6, Math.PI / 2 + 0.3, 6, 5, 3));
    sign(g, 'PELICAN POINT LIGHT · 1887', L.x - 4.5, yL + 1.4, L.z - 6, -Math.PI / 2, { w: 4, h: 0.6, bg: '#2a2c30', fg: '#f2efe6', post: yL });
    // rocks round the point
    const rockM = std({ color: 0x8a8680, roughness: 0.95, flatShading: true });
    for (let k = 0; k < 50; k++) {
      const a = R() * Math.PI * 2, d = 40 + R() * 70;
      const x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
      if (x > isl.x1 - 3 || z < isl.z0 + 3 || z > isl.z1 - 3 || this.index.nearest(x, z, 9)) continue;
      const r = 0.8 + R() * 2.4, yy = yAt(x, z);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockM);
      rock.scale.y = 0.55 + R() * 0.3; rock.rotation.set(R(), R() * 6, R());
      rock.position.set(x, yy + r * 0.15, z); rock.castShadow = rock.receiveShadow = true; g.add(rock);
      sb.addStaticCollider(RAPIER.ColliderDesc.ball(r * 0.7).setTranslation(x, yy + r * 0.15, z));
    }
    // a couple of beach umbrellas on the sand by the bridge
    for (const [ux, uz, col] of [[-100, -1385, 0xc23b2a], [-80, -1382, 0x1f5a7a], [-60, -1384, 0xe0b42b]]) {
      const uy = yAt(ux, uz);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), std({ color: 0xe8e8e2 })); st.position.set(ux, uy + 1.2, uz); g.add(st);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 10), std({ color: col, roughness: 0.8 })); um.position.set(ux, uy + 2.5, uz); g.add(um);
      const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), std({ color: col === 0xc23b2a ? 0xf2efe6 : 0xe8789f })); towel.rotation.x = -Math.PI / 2; towel.position.set(ux + 1.2, uy + 0.04, uz); g.add(towel);
    }
    this.lootSpots.push(new THREE.Vector3(-99, yAt(-99, -1384) + 0.3, -1384));

    // ---- the Lighthouse Loop street race: round the point twice, starting by the green ----
    const pts = this.loop.pts;
    const i0 = pts.reduce((b, p, i) => (Math.hypot(p.x + 48, p.z + 1448) < Math.hypot(pts[b].x + 48, pts[b].z + 1448) ? i : b), 0);
    const cps = [];
    for (let k = 0; k < pts.length; k += 12) { const p = pts[(i0 + k) % pts.length]; cps.push(new THREE.Vector3(p.x, p.y, p.z)); }
    this.race = { id: 'lighthouse', name: 'Lighthouse Loop', laps: 2, prize: [3000, 1100, 500], pts: cps, desc: '2 laps round Pelican Point: through the village, out along the clifftop past the lighthouse and back by the beach.' };
  }

  fishingBoat(color) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 9), std({ color, roughness: 0.6 })); hull.position.y = 0.8; b.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 4), std({ color, roughness: 0.6 })); bow.rotation.set(Math.PI / 2, Math.PI / 4, 0); bow.scale.set(1, 1, 0.53); bow.position.set(0, 0.8, -5.9); b.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 8.6), std({ color: 0xc8b89a })); deck.position.y = 1.62; b.add(deck);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.4), std({ color: 0xf2efe6 })); cab.position.set(0, 2.5, 1.2); b.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.5, 2.0), std({ color: 0x2c4a5e, roughness: 0.2 })); win.position.set(0, 2.9, 1.2); b.add(win);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 6), std({ color: 0xe8e8e2 })); mast.position.set(0, 4, -1); b.add(mast);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), std({ color: 0xe8e8e2 })); boom.rotation.z = Math.PI / 2.5; boom.position.set(1, 4, -1); b.add(boom);
    b.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noMerge = true; } });
    return b;
  }

  update(dt) {
    const g = this.game;
    this.t = (this.t || 0) + dt;
    for (const b of this.boats) { b.m.position.y = b.y + Math.sin(this.t * 0.9 + b.ph) * 0.18; b.m.rotation.z = Math.sin(this.t * 0.7 + b.ph) * 0.04; }
    if (this.flag) this.flag.rotation.y = Math.sin(this.t * 2.2) * 0.25;
    const night = g.daynight?.night ?? 0;
    this.beam.rotation.y += dt * 0.6;
    this.beamM.opacity = 0.16 * night;
    this.lantern.material.emissiveIntensity = 0.4 + night * 2.6;
  }
}
