import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, LAND_Y, addPier } from './world.js';
import { std, sign, solidBox, canvasTex, speckle } from './buildkit.js';
import { fbm, smooth, rng, makeRoad, RoadIndex, buildTerrain, ribbon, scatter, besideRoad } from './terrain.js';
import { gasStation } from './gasstation.js';

// The Scorch: a huge desert south of the city, out past the airport. Sand dunes in the west,
// red mesas standing up out of the scrub, a salt flat as white and flat as a table, Route 9
// running the length of it to the ghost town of Copper Gulch, the Last Chance gas station, and
// the wreck of an old airliner. It's reached by the long causeway off the south end of the
// city, which stays barricaded until Act II.

const Y = LAND_Y;

export class Scorch {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'scorch');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.R = rng(1977);
    this.mesas = [[-1250, 1150, 90, 55], [-1750, 1350, 130, 70], [-600, 1700, 80, 45], [-1300, 2000, 110, 60], [-2050, 1500, 70, 50], [-1180, 2820, 100, 65], [-2450, 1150, 120, 80], [-1650, 2650, 60, 40], [-2500, 2100, 90, 60]].map(([x, z, r, h]) => ({ x, z, r, h }));
    this.salt = { x: -820, z: 2400, r: 300 };
    this.town = { x: -2255, z: 2470, r: 80 };
    this.plan();
    this.build();
  }

  natural(x, z) {
    const isl = this.isl;
    const e = Math.min(x - isl.x0, isl.x1 - x, z - isl.z0, isl.z1 - z);
    const mask = smooth(6, 70, e);
    let h = 5 * fbm(x / 230, z / 230) + 2 * fbm(x / 40, z / 40, 3);
    // dunes in the west: long ridges across the wind
    const dw = smooth(-1500, -1900, x) * smooth(this.town.r + 40, this.town.r + 220, Math.hypot(x - this.town.x, z - this.town.z)); // (flattened round the town)
    if (dw > 0) {
      const warp = fbm(x / 120, z / 120) * 5;
      const ridge = Math.pow(Math.abs(Math.sin((x * 0.55 + z * 0.83) / 36 + warp)), 2.5);
      h += dw * (4 + 16 * ridge * (0.6 + 0.6 * fbm(x / 300 + 2, z / 300)));
    }
    for (const m of this.mesas) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (d > m.r + 40) continue;
      const a = Math.atan2(z - m.z, x - m.x);
      const rr = m.r * (0.82 + 0.36 * fbm(Math.cos(a) * 2 + m.x, Math.sin(a) * 2 + m.z, 3));
      h += m.h * smooth(rr + 16, rr, d) + 6 * smooth(rr + 40, rr + 16, d); // sheer sides on a scree apron
    }
    const ds = Math.hypot(x - this.salt.x, z - this.salt.z);
    h = h * smooth(this.salt.r - 30, this.salt.r + 60, ds) + 0.3 * (1 - smooth(this.salt.r - 30, this.salt.r + 60, ds));
    return Y + mask * h;
  }

  plan() {
    const yNat = (s, x, z) => Math.max(Y + 0.2, this.natural(x, z) - 0.5);
    // Route 9 leaves the causeway exactly level with it, then eases up to the desert over 150 m
    const yRoute = (s, x, z) => { const k = smooth(4, 150, s); return (Y + 0.03) * (1 - k) + yNat(s, x, z) * k; };
    this.route = makeRoad([[-740, 801], [-745, 900], [-790, 1060], [-880, 1250], [-1050, 1440], [-1300, 1590], [-1600, 1740], [-1900, 1950], [-2150, 2250], [-2255, 2470], [-2340, 2650], [-2400, 2900]],
      { width: 12, yOf: yRoute, smoothN: 18, name: 'Route 9' });
    for (const p of this.route.pts) { const k = smooth(0, 45, p.s); p.y = (Y + 0.03) * (1 - k) + p.y * k; } // (no lip where it meets the causeway)
    this.track = makeRoad([[-1060, 1450], [-990, 1650], [-930, 1900], [-880, 2120]], { width: 6, kind: 'dirt', yOf: yNat, smoothN: 10 });
    this.roads = [this.route, this.track];
    this.index = new RoadIndex(this.roads);
    this.flats = [
      { ...besideRoad(this.route, -860, 1150, 28), r: 31, blend: 30 }, // Last Chance Gas
      { x: this.town.x, z: this.town.z, r: this.town.r, y: null }, // Copper Gulch
      { x: -1480, z: 2300, r: 45, y: null }, // the crashed airliner
    ];
    // the gas station and the town sit at road level; the wreck where it fell
    const roadY = (x, z) => this.route.pts.reduce((b, p) => ((p.x - x) ** 2 + (p.z - z) ** 2 < (b.x - x) ** 2 + (b.z - z) ** 2 ? p : b)).y;
    this.flats.forEach((f, i) => { if (i === 1) f.y = roadY(f.x, f.z); else if (i === 2) f.y = Math.max(Y + 0.3, this.natural(f.x, f.z)); });
  }

  heightAt(x, z) {
    let h = this.natural(x, z);
    for (const f of this.flats) { const b = f.blend || 30, d = Math.hypot(x - f.x, z - f.z); if (d < f.r + b) h = f.y + (h - f.y) * smooth(f.r, f.r + b, d); }
    const n = this.index.nearest(x, z, 36);
    if (n) { const w = n.r.width / 2; h = n.p.y - 0.05 + (h - n.p.y + 0.05) * smooth(w + 1, w + 22, n.d); }
    return h;
  }

  free(x, z, m = 3) {
    const isl = this.isl;
    if (x < isl.x0 + 5 || x > isl.x1 - 5 || z < isl.z0 + 5 || z > isl.z1 - 5) return false;
    if (this.index.nearest(x, z, 10 + m)) return false;
    if (this.flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 8 + m)) return false;
    if (Math.hypot(x - this.salt.x, z - this.salt.z) < this.salt.r + 10) return false;
    return true;
  }

  get open() { return !!this.game.story?.act2; }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl, R = this.R;
    const W = isl.x1 - isl.x0, D = isl.z1 - isl.z0;
    const sandTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#d9b98a'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) { const r = Math.random(); c.fillStyle = r < 0.5 ? `rgba(160,120,80,${0.1 + Math.random() * 0.2})` : r < 0.85 ? `rgba(240,220,180,${0.15 + Math.random() * 0.2})` : `rgba(110,80,60,${0.15 + Math.random() * 0.2})`; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      c.strokeStyle = 'rgba(150,110,70,0.12)'; c.lineWidth = 2;
      for (let y = 0; y < h; y += 22) { c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w / 3, y + 6, (2 * w) / 3, y - 6, w, y); c.stroke(); }
    }, [W / 14, D / 14]);
    buildTerrain(g, sb, isl, {
      heightAt: (x, z) => this.heightAt(x, z), step: 9, sideColor: 0xa8845a, map: sandTex,
      colorAt: (x, y, z, ny) => {
        const rock = Math.max(smooth(0.88, 0.62, ny), smooth(Y + 30, Y + 50, y));
        const salt = 1 - smooth(this.salt.r - 40, this.salt.r + 20, Math.hypot(x - this.salt.x, z - this.salt.z));
        const scrub = (1 - rock) * smooth(0.45, 0.75, fbm(x / 90 + 5, z / 90)) * 0.25 * (1 - smooth(-1500, -1800, x));
        const c = [1 - scrub * 0.25, 1 - scrub * 0.1, 1 - scrub * 0.35];
        c[0] = c[0] * (1 - rock * 0.08) + rock * 0.05; c[1] *= 1 - rock * 0.38; c[2] *= 1 - rock * 0.55; // red rock
        if (salt > 0) { c[0] = c[0] * (1 - salt) + salt * 1.45; c[1] = c[1] * (1 - salt) + salt * 1.62; c[2] = c[2] * (1 - salt) + salt * 2.05; } // (bleached white)
        return c;
      },
    });
    // ---- Route 9 and the dirt track to the salt flat ----
    const roadTex = canvasTex(64, 128, (c, cw, ch) => {
      c.fillStyle = '#4a4744'; c.fillRect(0, 0, cw, ch); speckle(c, cw, ch, 700, 0.08);
      c.fillStyle = '#e8c547'; c.fillRect(cw / 2 - 2, 0, 1.5, ch); c.fillRect(cw / 2 + 0.5, 0, 1.5, ch);
      c.fillStyle = '#d8d2c4'; c.fillRect(3, 0, 1.5, ch); c.fillRect(cw - 4.5, 0, 1.5, ch);
      for (let i = 0; i < 6; i++) { c.strokeStyle = 'rgba(0,0,0,.35)'; c.beginPath(); let x = Math.random() * cw, y = Math.random() * ch; c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 12; y += Math.random() * 12; c.lineTo(x, y); } c.stroke(); }
    });
    ribbon(g, this.route.pts, 12, std({ map: roadTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }), { uScale: 24 });
    const dirt = std({ color: 0xb8925f, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
    ribbon(g, this.track.pts, 6, dirt, { uScale: 6, yOf: (p, x, z) => this.heightAt(x, z) });

    // ---- the causeway from the south end of Verian City, barricaded until Act II ----
    const cx0 = -748, cx1 = -732, cz0 = 206, cz1 = isl.z0 + 2;
    const cw = new THREE.Mesh(new THREE.BoxGeometry(cx1 - cx0, 2, cz1 - cz0), std({ color: 0x8a8680 }));
    cw.position.set((cx0 + cx1) / 2, Y - 1, (cz0 + cz1) / 2); cw.receiveShadow = true; g.add(cw);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((cx1 - cx0) / 2, 1, (cz1 - cz0) / 2).setTranslation(cw.position.x, Y - 1, cw.position.z));
    addPier(cx0, cx1, cz0, cz1);
    const asph = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#3a3d41'; c.fillRect(0, 0, w, h); speckle(c, w, h, 300, 0.06); c.fillStyle = '#e8c547'; c.fillRect(w / 2 - 1, 0, 2, h); }, [1, (cz1 - cz0) / 8]), roughness: 0.9 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(cx1 - cx0 - 2, cz1 - cz0 + 24), asph);
    top.rotation.x = -Math.PI / 2; top.position.set((cx0 + cx1) / 2, Y + 0.025, (cz0 + cz1) / 2 - 12); top.receiveShadow = true; g.add(top);
    const railM = std({ color: 0xc8ccd0, metalness: 0.5, roughness: 0.5 });
    for (const x of [cx0 + 0.3, cx1 - 0.3]) solidBox(g, sb, 0.3, 0.9, cz1 - cz0 - 30, x, Y, (cz0 + cz1) / 2 + 15, railM);
    for (let z = cz0 + 30; z < cz1; z += 40) for (const x of [cx0 + 0.3, cx1 - 0.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), railM); p.position.set(x, Y + 3, z); g.add(p); const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.3), std({ color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 0.6 })); l.position.set(x + (x < -740 ? 0.6 : -0.6), Y + 6, z); g.add(l); }
    // the barricade: concrete blocks, a barrier arm and signs
    const bz = cz0 + 26;
    const conc = std({ color: 0xc9c5bc, roughness: 0.9 });
    this.blocks = [];
    for (const dx of [-5.4, -1.8, 1.8, 5.4]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 0.9), conc);
      m.position.set(-740 + dx, Y + 0.55, bz); m.castShadow = true; g.add(m);
      const col = sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.6, 1.2, 0.45).setTranslation(-740 + dx, Y + 1.2, bz));
      this.blocks.push({ m, col });
    }
    const stripe = canvasTex(128, 16, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#c23b2a' : '#f2f2ee'; c.fillRect((i * w) / 8, 0, w / 8, h); } });
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 0.25), std({ map: stripe }));
    this.arm.geometry.translate(7, 0, 0);
    this.arm.position.set(cx0 + 1, Y + 1.3, bz - 3); g.add(this.arm);
    solidBox(g, sb, 0.5, 1.4, 0.5, cx0 + 1, Y, bz - 3, std({ color: 0x2a2c30 }));
    this.closedSigns = [
      sign(g, 'ROAD CLOSED', -740, Y + 2.6, bz - 0.6, Math.PI, { w: 6, h: 1.2, bg: '#b3261e', fg: '#ffffff', post: Y }),
      sign(g, 'THE SCORCH · NO ENTRY · OPENS IN ACT II', -740, Y + 1.25, bz - 0.5, Math.PI, { w: 9, h: 0.5, bg: '#1b1b1b', fg: '#ffd166' }),
    ];
    sign(g, 'ROUTE 9 · THE SCORCH ➜', -752, Y + 3, cz0 + 4, Math.PI / 2, { w: 7, h: 1.1, bg: '#7a3a1a', fg: '#f2e2c0', post: Y });
    this.gate = new THREE.Vector3(-740, Y, cz0 + 8);
    this.entrance = new THREE.Vector3(-740, Y, isl.z0 + 30);
    sign(g, 'WELCOME TO THE SCORCH · NEXT GAS 0 MI', -755, Y + 3.2, isl.z0 + 20, -Math.PI / 2 - 0.2, { w: 9, h: 1.2, bg: '#7a3a1a', fg: '#f2e2c0', post: Y });

    // ---- Last Chance Gas: an old roadside stop, sun-bleached and a bit rusty ----
    const gs = this.flats[0];
    const st = gasStation(g, sb, gs.x, gs.y, gs.z, gs.yaw, { name: 'LAST CHANCE GAS', sub: 'COLD BEER · JERKY · ICE', brand: 0x9a5a34, brand2: 0xf2e2c0, old: true, prices: ['4.89', '5.19', '5.39'], loot: this.lootSpots });
    { const f = st.front, fx = Math.sin(gs.yaw), fz = Math.cos(gs.yaw); this.wreckCar(gs.x - fz * 26 - fx * 6, gs.y, gs.z + fx * 26 - fz * 6, gs.yaw + 0.6); void f; }
    { const b = besideRoad(this.route, gs.x + Math.cos(gs.yaw) * 60, gs.z - Math.sin(gs.yaw) * 60, 10); sign(g, 'LAST CHANCE GAS ½ MI · NEXT GAS 140 MI', b.x, b.y + 3, b.z, b.yaw, { w: 8, h: 1.2, bg: '#f2e2c0', fg: '#9a5a34', post: b.y }); }

    // ---- Copper Gulch: a ghost town on Route 9 ----
    const tw = this.town, yT = tw.y ?? this.flats[1].y;
    const near = this.route.pts.reduce((b, p) => (Math.hypot(p.x - tw.x, p.z - tw.z) < Math.hypot(b.x - tw.x, b.z - tw.z) ? p : b));
    const i0 = this.route.pts.indexOf(near);
    const a = this.route.pts[i0 - 6], b = this.route.pts[i0 + 6];
    const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz), fx = dx / dl, fz = dz / dl, nx = -fz, nz = fx;
    const roadYaw = Math.atan2(fx, fz);
    const woodCols = [0x8a6a48, 0x7a5638, 0x9a7a54, 0x6a4a30, 0xa08060];
    const names = ['SALOON', 'GENERAL STORE', 'SHERIFF', 'BANK', 'HOTEL', 'ASSAY OFFICE', 'BARBER', 'LIVERY'];
    let k = 0;
    for (const side of [-1, 1]) for (let s = -48; s <= 48; s += 24) {
      const x = near.x + fx * s + nx * side * 17, z = near.z + fz * s + nz * side * 17;
      const yaw = Math.atan2(-nx * side, -nz * side); // (front to the street)
      this.westernBuilding(x, yT, z, yaw, woodCols[k % woodCols.length], names[k % names.length], R);
      k++;
    }
    // water tower and a windmill
    const tx = near.x + nx * 40, tz = near.z + nz * 40;
    for (const [ax, az] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) solidBox(g, sb, 0.4, 10, 0.4, tx + ax, yT, tz + az, std({ color: 0x5a4030 }));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 4.5, 16), std({ color: 0x7a5a3a, roughness: 0.9 })); tank.position.set(tx, yT + 12.2, tz); tank.castShadow = true; g.add(tank);
    const tcap = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.6, 16), std({ color: 0x4a3a2a })); tcap.position.set(tx, yT + 15.2, tz); g.add(tcap);
    sign(g, 'COPPER GULCH', tx, yT + 12.4, tz - 3.25, Math.PI, { w: 5, h: 0.9, bg: '#7a5a3a', fg: '#f2e2c0' });
    const mx = near.x - nx * 45 + fx * 20, mz = near.z - nz * 45 + fz * 20;
    solidBox(g, sb, 0.5, 11, 0.5, mx, yT, mz, std({ color: 0x8a8f96, metalness: 0.5 }));
    this.mill = new THREE.Group(); this.mill.position.set(mx, yT + 11, mz + 0.4); g.add(this.mill);
    for (let i = 0; i < 12; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 0.04), std({ color: 0xd8d8d2, metalness: 0.4 })); bl.position.y = 1.4; const h = new THREE.Group(); h.rotation.z = (i / 12) * Math.PI * 2; h.add(bl); this.mill.add(h); }
    this.mill.traverse((o) => { o.userData.noMerge = true; });
    sign(g, 'COPPER GULCH · POP. 0', near.x - fx * 70 + nx * 10, yT + 2.2, near.z - fz * 70 + nz * 10, roadYaw + Math.PI, { w: 5, h: 0.9, bg: '#7a5a3a', fg: '#f2e2c0', post: yT });

    // ---- the crashed airliner ----
    const cr = this.flats[2], yC = cr.y;
    const hullM = std({ color: 0xd8dade, metalness: 0.5, roughness: 0.5 }), burnt = std({ color: 0x2a2624, roughness: 1 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 26, 18, 1, true), hullM); fus.rotation.set(Math.PI / 2, 0, 0.25); fus.position.set(cr.x, yC + 1.6, cr.z); fus.material.side = THREE.DoubleSide; fus.castShadow = true; g.add(fus);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hullM); nose.rotation.x = Math.PI / 2; nose.position.set(cr.x + Math.sin(0.25) * 13, yC + 1.6, cr.z + Math.cos(0.25) * 13); g.add(nose);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.2, 12, 16, 1, true), hullM); tail.material.side = THREE.DoubleSide; tail.rotation.set(Math.PI / 2 - 0.15, 0, -0.5); tail.position.set(cr.x - 22, yC + 1.8, cr.z - 26); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 4), std({ color: 0xc23b2a })); fin.position.set(cr.x - 24, yC + 5, cr.z - 30); fin.rotation.set(0.2, -0.5, 0.15); g.add(fin);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 4.5), hullM); wing.position.set(cr.x + 14, yC + 0.4, cr.z + 4); wing.rotation.set(0.1, 0.4, 0.12); g.add(wing);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(16, 20), std({ color: 0x3a3028, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })); scorch.rotation.x = -Math.PI / 2; scorch.position.set(cr.x + 4, yC + 0.08, cr.z + 6); g.add(scorch);
    for (let i = 0; i < 14; i++) { const d2 = new THREE.Mesh(new THREE.BoxGeometry(0.5 + R() * 2.5, 0.2 + R() * 0.6, 0.5 + R() * 2), R() < 0.5 ? hullM : burnt); d2.position.set(cr.x + (R() - 0.5) * 60, yC + 0.2, cr.z + (R() - 0.5) * 60); d2.rotation.set(R(), R() * 6, R()); g.add(d2); }
    const qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.25));
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(13, 2.6).setTranslation(cr.x, yC + 1.6, cr.z).setRotation(qf));
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(9, 0.3, 2.3).setTranslation(wing.position.x, wing.position.y, wing.position.z).setRotation(new THREE.Quaternion().setFromEuler(wing.rotation)));
    this.lootSpots.push(new THREE.Vector3(cr.x + 3, yC + 0.4, cr.z + 8), new THREE.Vector3(cr.x - 6, yC + 0.4, cr.z - 10));

    // ---- the salt flat: a marker post for anyone after a speed record ----
    const S = this.salt;
    sign(g, 'BONE DRY SALT FLAT · SPEED TRIALS', S.x, Y + 3, S.z - S.r + 25, 0, { w: 8, h: 1.2, bg: '#f2f0ea', fg: '#7a3a1a', post: Y + 0.3 });
    for (let i = 0; i < 12; i++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 10), std({ color: 0xe0601a })); cone.position.set(S.x - 150 + i * 25, Y + 0.7, S.z); g.add(cone); }

    // ---- cacti, dead bushes and rocks ----
    const sag = [];
    const trunk = new THREE.CylinderGeometry(0.35, 0.42, 6, 8); trunk.translate(0, 3, 0);
    for (const [s, h, y] of [[1, 2.4, 2.6], [-1, 1.8, 3.4]]) {
      const arm = new THREE.CylinderGeometry(0.24, 0.26, 1.4, 7); arm.rotateZ(Math.PI / 2); arm.translate(s * 0.9, y, 0); sag.push(arm.toNonIndexed());
      const up = new THREE.CylinderGeometry(0.24, 0.26, h, 7); up.translate(s * 1.55, y + h / 2 - 0.1, 0); sag.push(up.toNonIndexed());
    }
    const cactusGeo = mergeGeometries([trunk.toNonIndexed(), ...sag]); cactusGeo.computeVertexNormals();
    const cactusSpots = [];
    for (let i = 0; i < 9000 && cactusSpots.length < 1400; i++) {
      const x = isl.x0 + R() * W, z = isl.z0 + R() * D;
      if (x < -1850 && R() < 0.85) continue; // (hardly any out in the dunes)
      if (!this.free(x, z, 4)) continue;
      const y = this.heightAt(x, z);
      if (y > Y + 30) continue;
      cactusSpots.push({ x, y: y - 0.2, z, s: 0.6 + R() * 0.7, yaw: R() * 6.28 });
    }
    scatter(g, cactusGeo, std({ color: 0x4a7a3a, roughness: 0.85 }), cactusSpots.length, (i) => cactusSpots[i],
      { collide: (o) => sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(3 * o.s, 0.4 * o.s).setTranslation(o.x, o.y + 3 * o.s, o.z)) });
    const bushGeo = new THREE.IcosahedronGeometry(0.8, 0);
    scatter(g, bushGeo, std({ color: 0x8a7a50, roughness: 1, flatShading: true }), 2200, () => {
      const x = isl.x0 + R() * W, z = isl.z0 + R() * D;
      if (!this.free(x, z, 1)) return null;
      return { x, y: this.heightAt(x, z) + 0.1, z, s: 0.5 + R() * 0.8, sy: 0.35 + R() * 0.3, yaw: R() * 6 };
    }, { shadow: false });
    const rockM = std({ color: 0xa0623a, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 160; i++) {
      const x = isl.x0 + R() * W, z = isl.z0 + R() * D;
      if (!this.free(x, z, 3)) continue;
      const r = 1 + R() * 4, yy = this.heightAt(x, z);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockM);
      rock.scale.y = 0.5 + R() * 0.4; rock.rotation.set(R(), R() * 6, R());
      rock.position.set(x, yy + r * 0.15, z); rock.castShadow = rock.receiveShadow = true; g.add(rock);
      sb.addStaticCollider(RAPIER.ColliderDesc.ball(r * 0.7).setTranslation(x, yy + r * 0.15, z));
    }
    // a few tumbleweeds blowing about
    this.weeds = [];
    const weedM = std({ color: 0x9a8058, roughness: 1, wireframe: false, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), weedM);
      m.userData.noMerge = true;
      g.add(m);
      this.weeds.push({ m, x: isl.x0 + 200 + R() * (W - 400), z: isl.z0 + 200 + R() * (D - 400), v: 3 + R() * 4, ph: R() * 6 });
    }
    this.applyLock(true);
  }

  // an old western false-front building facing the street
  westernBuilding(x, y0, z, yaw, color, name, R) {
    const g = this.group, sb = this.sb;
    const w = 9 + R() * 3, d = 10, h = 4.5 + R() * 1.5;
    const grp = new THREE.Group(); grp.position.set(x, y0, z); grp.rotation.y = yaw; g.add(grp);
    const plank = canvasTex(64, 64, (c, cw, ch) => { c.fillStyle = '#' + color.toString(16).padStart(6, '0'); c.fillRect(0, 0, cw, ch); for (let i = 0; i < cw; i += 8) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(i, 0, 1.5, ch); } speckle(c, cw, ch, 200, 0.12); }, [w / 3, h / 3]);
    const wallM = std({ map: plank, roughness: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM); body.position.y = h / 2; grp.add(body);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 1.5, d + 3.4), std({ color: 0x7a6a58, roughness: 1 })); base.position.set(0, -0.55, 1.5); grp.add(base); // (footing: no daylight under it)
    const front = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 2.4, 0.3), wallM); front.position.set(0, h + 1.0, d / 2); grp.add(front);
    const porch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 3), std({ color: 0x6a4a30 })); porch.position.set(0, 0.3, d / 2 + 1.5); grp.add(porch);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, 3.2), std({ color: 0x5a3a24 })); awning.position.set(0, 3.2, d / 2 + 1.5); awning.rotation.x = 0.12; grp.add(awning);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), std({ color: 0x5a3a24 })); p.position.set(s * (w / 2 - 0.3), 1.6, d / 2 + 2.9); grp.add(p); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.1), std({ color: 0x2a1a10 })); door.position.set(0, 1.4, d / 2 + 0.05); grp.add(door);
    for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.1), std({ color: 0x1a1a1a, roughness: 0.3 })); win.position.set(s * (w / 2 - 2), 1.8, d / 2 + 0.05); grp.add(win); }
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y0 + h / 2, z).setRotation(q));
    const at = new THREE.Vector3(0, h + 1.0, d / 2 + 0.17).applyQuaternion(q).add(new THREE.Vector3(x, y0, z));
    sign(g, name, at.x, at.y, at.z, yaw, { w: w * 0.8, h: 1.1, bg: '#f2e2c0', fg: '#3a2010' });
    this.lootSpots.push(new THREE.Vector3(0, 0.6, d / 2 + 1.5).applyQuaternion(q).add(new THREE.Vector3(x, y0, z)));
  }

  wreckCar(x, y, z, yaw) {
    const m = new THREE.Group(); m.position.set(x, y, z); m.rotation.y = yaw; this.group.add(m);
    const rust = std({ color: 0x7a3a1a, roughness: 1 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 4.4), rust); b.position.y = 0.6; m.add(b);
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), rust); c.position.set(0, 1.3, 0.2); m.add(c);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.95, 0.8, 2.2).setTranslation(x, y + 0.8, z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)));
  }

  // the barricade on the causeway: up until Act II
  applyLock(force = false) {
    const open = this.open;
    if (!force && open === this.wasOpen) return;
    this.wasOpen = open;
    for (const b of this.blocks) { b.m.visible = !open; b.col.setEnabled(!open); }
    this.arm.rotation.z = open ? 1.35 : 0;
    for (const s of this.closedSigns) s.visible = !open;
    this.isl.name = open ? 'The Scorch' : 'The Scorch (Act II)';
  }

  update(dt) {
    const g = this.game;
    this.applyLock();
    this.t = (this.t || 0) + dt;
    if (this.mill) this.mill.rotation.z -= dt * 1.4;
    const isl = this.isl;
    for (const w of this.weeds) {
      w.x += w.v * dt * 0.8; w.z += w.v * dt * 0.5;
      if (w.x > isl.x1 - 60 || w.z > isl.z1 - 60) { w.x = isl.x0 + 100 + Math.random() * 600; w.z = isl.z0 + 100 + Math.random() * (isl.z1 - isl.z0 - 300); }
      const y = this.heightAt(w.x, w.z);
      w.m.position.set(w.x, y + 0.7 + Math.abs(Math.sin(this.t * 2.4 + w.ph)) * 0.8, w.z);
      w.m.rotation.x += dt * w.v * 0.9; w.m.rotation.z -= dt * w.v * 0.5;
    }
    // locked: anyone who gets in some other way (by boat, by air) is turned back
    if (!this.open && g.onShore && !g.flying) {
      const v = g.vehicles?.active, p = v?.pos || g.shorePlayer.body.translation();
      if (p.x > isl.x0 + 2 && p.x < isl.x1 - 2 && p.z > isl.z0 + 2 && p.z < isl.z1 - 2 && !this.turning) {
        this.turning = true;
        g.hud.toast('The Scorch is closed off until Act II', 0xffd166);
        g.story.fade(() => {
          this.turning = false;
          const at = this.gate.clone().add(new THREE.Vector3(0, 0, -14));
          if (v && !v.isHeli) { v.body.setTranslation({ x: at.x, y: at.y + 0.6, z: at.z }, true); v.body.setLinvel({ x: 0, y: 0, z: 0 }, true); v.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0), true); v.heading = 0; v.pos.set(at.x, at.y, at.z); v.expect = null; }
          else { if (v) g.vehicles.exit?.(); g.placeOnShore(at.clone().setY(at.y + 1.2), 0); }
        });
      }
    }
  }
}
