import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAND_Y, islandAt } from './world.js';
import { std, sign, canvasTex, speckle } from './buildkit.js';

// Verian Rail: one double-track line down the length of the map. It starts on Saltmarsh Key's east
// shore, runs on a viaduct round the outside of Pelican Point, the Hollows and Verian City (with a
// station off each), crosses to Verian International, and then comes down to the desert floor and
// runs right across the Scorch to Copper Gulch. (It doesn't go to NAS Halyard.) A train runs each
// way, end to end, stopping at every station: walk on board at a platform and you ride along; walk
// off at the stop you want. The stations are up on the viaduct: there's a lift down to the street.

const CTRL = [
  [-620, -1640], [-620, -1450], [-622, -1320], [-575, -1245], [-500, -1160], [-485, -1020], [-485, -900], [-487, -790], [-530, -690], [-605, -590],
  [-620, -470], [-620, -380], [-628, -280], [-660, -190], [-680, -90], [-680, 0], [-680, 100], [-700, 210], [-760, 340], [-795, 430], [-795, 490],
  [-797, 600], [-800, 740], [-815, 880], [-862, 1012], [-945, 1192], [-1090, 1380], [-1320, 1530], [-1610, 1680], [-1900, 1880], [-2120, 2140], [-2230, 2280], [-2290, 2360], [-2312, 2420],
];
export const STATIONS = [
  { name: 'Saltmarsh Key', at: [-620, -1500], street: [-655, -1500] },
  { name: 'Pelican Point', at: [-485, -900], street: [-520, -900] },
  { name: 'The Hollows', at: [-620, -420], street: [-660, -420] },
  { name: 'Verian Central', at: [-680, 30], street: [-712, 30] },
  { name: 'Verian International', at: [-795, 475], street: [-830, 470] },
  { name: 'Copper Gulch', at: [-2290, 2362], street: [-2262, 2385] },
];
const STEP = 6, HIGH = LAND_Y + 11.5; // the viaduct's rail top
export const CAR_LEN = 14, GAP = 0.6;

export function planRail(scorchNatural) {
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = curve.getLength(), n = Math.ceil(L / STEP);
  const pts = curve.getSpacedPoints(n).map((p, i) => ({ x: p.x, z: p.z, s: (i * L) / n }));
  // where it reaches the Scorch, it comes down to the desert floor (the ground smoothed, 2% at most)
  const inScorch = (p) => p.z > 800;
  const ground = pts.map((p) => (inScorch(p) ? scorchNatural(p.x, p.z) + 0.9 : HIGH));
  const sm = ground.map((_, i) => { let a = 0, c = 0; for (let k = -10; k <= 10; k++) { const q = ground[i + k]; if (q != null) { a += q; c++; } } return a / c; });
  const g = 0.022 * (L / n);
  const y = sm.map((v, i) => (inScorch(pts[i]) ? v : HIGH));
  for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i], y[i - 1] - g); // (it can't drop faster than the grade)
  for (let i = y.length - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - g);
  pts.forEach((p, i) => { p.y = y[i]; });
  // the stations: their distance along the line
  const sOf = ([x, z]) => pts.reduce((b, p) => ((p.x - x) ** 2 + (p.z - z) ** 2 < (b.x - x) ** 2 + (b.z - z) ** 2 ? p : b)).s;
  const stations = STATIONS.map((st) => ({ ...st, s: sOf(st.at) }));
  // a coarse grid for "how near the line is this point"
  const grid = new Map(), key = (x, z) => `${Math.floor(x / 30)},${Math.floor(z / 30)}`;
  for (const p of pts) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = `${Math.floor(p.x / 30) + a},${Math.floor(p.z / 30) + b}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  const near = (x, z) => { const list = grid.get(key(x, z)); if (!list) return null; let best = null, bd = Infinity; for (const p of list) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } } return { p: best, d: Math.sqrt(bd) }; };
  // the desert floor along it: cut down to the trackbed (it rides on a low embankment elsewhere)
  const carve = (x, z, h) => { const q = near(x, z); if (!q || q.d > 30 || q.p.z < 790) return h; return Math.min(h, q.p.y - 0.9 + Math.max(0, q.d - 7) * 0.7); };
  return { pts, length: L, stations, near, carve };
}

// the two tracks splay apart round a station, for the island platform between them
function sepAt(plan, s) { let k = 0; for (const st of plan.stations) k = Math.max(k, 1 - smoothstep(42, 90, Math.abs(s - st.s))); return 2.4 + 2.3 * k; }
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export class Railway {
  constructor(game, sb, plan) {
    this.game = game; this.sb = sb; this.plan = plan;
    this.pts = plan.pts;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.build();
    this.trains = [new Train(this, -1, 0.05, 1), new Train(this, 1, 0.62, -1)];
  }

  // a point on the line: distance s, offset lat (+ = right of the direction of the line), and the heading
  at(s, lat = 0) {
    const P = this.pts, L = this.plan.length;
    s = Math.max(0, Math.min(L, s));
    const f = (s / L) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), t = f - i, a = P[i], b = P[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const rx = -dz / l, rz = dx / l; // right
    return { x: a.x + dx * t + rx * lat, y: a.y + (b.y - a.y) * t, z: a.z + dz * t + rz * lat, yaw: Math.atan2(dx, dz), rx, rz };
  }
  sep(s) { return sepAt(this.plan, s); }

  build() {
    const g = this.group, sb = this.sb, P = this.pts, plan = this.plan;
    const concrete = std({ color: 0xb2ada4, roughness: 0.9 }), dark = std({ color: 0x5a554e, roughness: 0.95 });
    const steel = std({ color: 0x8a9096, metalness: 0.7, roughness: 0.35 });
    const ballastTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#6a645c'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, 0.25); c.fillStyle = '#4a3a2a'; for (let y = 0; y < h; y += 10) c.fillRect(6, y, w - 12, 4); }, [1, 1]);
    const ballast = std({ map: ballastTex, roughness: 1 });
    // the trackbed in pieces: a deck (on piers up on the viaduct; on an embankment in the desert)
    const DSEG = 2; // samples per piece
    for (let i = 0; i < P.length - DSEG; i += DSEG) {
      const a = P[i], b = P[i + DSEG];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), pitch = -Math.atan2(b.y - a.y, L);
      const sepM = Math.max(this.sep(a.s), this.sep(b.s)), W = sepM * 2 + 4.2;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2, len = Math.hypot(L, b.y - a.y) + 0.3;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      const high = my > LAND_Y + 6 || a.z < 790;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(W, high ? 1.2 : 2.4, len), high ? concrete : dark);
      deck.position.set(mx, my - (high ? 0.6 : 1.2) - 0.2, mz); deck.quaternion.copy(q); deck.receiveShadow = deck.castShadow = true; g.add(deck);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(W / 2, 0.6, len / 2).setTranslation(mx, my - 0.8, mz).setRotation(q));
      // the two tracks: ballast, sleepers, rails
      for (const side of [-1, 1]) {
        const sa = this.sep(a.s) * side, sbb = this.sep(b.s) * side, lat = (sa + sbb) / 2;
        const ox = mx - Math.cos(yaw) * lat, oz = mz + Math.sin(yaw) * lat; // (the same side as at())
        const bb = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, len), ballast); bb.position.set(ox, my - 0.12, oz); bb.quaternion.copy(q); g.add(bb);
        for (const r of [-0.72, 0.72]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, len), steel); rail.position.set(ox + Math.cos(yaw) * r, my + 0.02, oz - Math.sin(yaw) * r); rail.quaternion.copy(q); g.add(rail); }
      }
      // parapets up on the viaduct, piers under it
      if (high) {
        for (const s of [-1, 1]) { const px = mx + Math.cos(yaw) * s * (W / 2 - 0.15), pz = mz - Math.sin(yaw) * s * (W / 2 - 0.15); const par = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, len), concrete); par.position.set(px, my + 0.35, pz); par.quaternion.copy(q); g.add(par); sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.15, 0.6, len / 2).setTranslation(px, my + 0.4, pz).setRotation(q)); }
        if ((i / DSEG) % 3 === 0) {
          const gy = islandAt(mx, mz) ? (mz > 790 ? this.game.scorch.heightAt(mx, mz) : LAND_Y) : -10;
          const hgt = my - 1.5 - gy;
          if (hgt > 2) { const col = new THREE.Mesh(new THREE.BoxGeometry(3.2, hgt, 2.2), concrete); col.position.set(mx, gy + hgt / 2, mz); col.rotation.y = yaw; col.castShadow = true; g.add(col); sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.6, hgt / 2, 1.1).setTranslation(mx, gy + hgt / 2, mz).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))); }
        }
      }
    }
    // ---- the stations ----
    this.stations = plan.stations.map((st) => this.station(st));
    this.mapLine = P.filter((_, i) => i % 5 === 0).map((p) => [p.x, p.z]);
  }

  station(st) {
    const g = this.group, sb = this.sb;
    const c = this.at(st.s), y = c.y;
    const PL = 64, W = 2 * (this.sep(st.s) - 1.75); // the island platform between the tracks
    const yaw = c.yaw, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const plat = std({ color: 0xc8c2b8, roughness: 0.8 }), edge = std({ color: 0xe8c547, emissive: 0xe8c547, emissiveIntensity: 0.2 }), red = std({ color: 0xb3261e, roughness: 0.6 }), glass = std({ color: 0x9fc3d8, transparent: true, opacity: 0.35, depthWrite: false });
    const box = (w, h, l, lat, yy, along, m, solid = true) => {
      const p = this.at(st.s + along, lat);
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); o.position.set(p.x, yy + h / 2, p.z); o.rotation.y = yaw; o.castShadow = true; o.receiveShadow = true; g.add(o);
      if (solid) sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, l / 2).setTranslation(p.x, yy + h / 2, p.z).setRotation(q));
      return o;
    };
    const top = y + 1.15; // level with the carriage floors
    box(W, top - y + 0.2, PL, 0, y - 0.2, 0, plat);
    for (const s of [-1, 1]) box(0.45, 0.03, PL, s * (W / 2 - 0.25), top, 0, edge, false);
    // a canopy on posts, benches, lamps, the name boards and the lift
    for (let k = -3; k <= 3; k++) box(0.25, 3.4, 0.25, 0, top, k * 9, std({ color: 0x3a3c40 }));
    box(W + 1.2, 0.2, PL - 6, 0, top + 3.4, 0, red, false);
    for (const k of [-2, -1, 1, 2]) box(0.5, 0.45, 2.2, 0, top, k * 9 + 4.5, std({ color: 0x5a3a24 }), true);
    for (const s of [-1, 1]) {
      const p = this.at(st.s + s * 22, 0);
      sign(g, st.name.toUpperCase(), p.x, top + 2.4, p.z, yaw + Math.PI / 2, { w: Math.max(4, st.name.length * 0.42), h: 0.7, bg: '#1f3b63', fg: '#ffffff', glow: true });
      sign(g, st.name.toUpperCase(), p.x, top + 2.4, p.z, yaw - Math.PI / 2, { w: Math.max(4, st.name.length * 0.42), h: 0.7, bg: '#1f3b63', fg: '#ffffff', glow: true });
    }
    box(1.8, 2.6, 1.8, 0, top, -PL / 2 + 3, glass, true); box(1.9, 0.2, 1.9, 0, top + 2.6, -PL / 2 + 3, red, false);
    const lift = this.at(st.s - PL / 2 + 3 + 1.4, 0);
    // down at street level: a lift kiosk with the logo
    const street = new THREE.Vector3(st.street[0], st.street[1] > 790 ? this.game.scorch.heightAt(st.street[0], st.street[1]) : LAND_Y, st.street[1]);
    const k = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), glass); k.position.set(street.x, street.y + 1.5, street.z); g.add(k);
    const kr = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 2.3), red); kr.position.set(street.x, street.y + 3.1, street.z); g.add(kr);
    sign(g, `VERIAN RAIL · ${st.name.toUpperCase()}`, street.x, street.y + 3.8, street.z, yaw, { w: 5.5, h: 0.7, bg: '#b3261e', fg: '#ffffff', glow: true });
    return { ...st, y: top, lift: new THREE.Vector3(lift.x, top, lift.z), street, yaw };
  }

  // E: the lifts
  action(pos) {
    const g = this.game;
    for (const st of this.stations) {
      if (Math.hypot(pos.x - st.lift.x, pos.z - st.lift.z) < 2.2 && Math.abs(pos.y - 1 - st.lift.y) < 1.6) return { label: `Lift down to the street (${st.name})`, run: () => g.story.fade(() => g.placeOnShore(st.street.clone().add(new THREE.Vector3(0, 1.2, 2.2)), st.yaw)) };
      if (Math.hypot(pos.x - st.street.x, pos.z - st.street.z) < 2.6 && Math.abs(pos.y - 1 - st.street.y) < 1.6) return { label: `Lift up to the platform (${st.name})`, run: () => g.story.fade(() => g.placeOnShore(st.lift.clone().add(new THREE.Vector3(0, 1.2, 0)), st.yaw)) };
    }
    return null;
  }

  update(dt) { for (const t of this.trains) t.update(dt); }
  marks() { return this.trains.map((t) => ({ x: t.head.x, z: t.head.z, color: t.cash ? '#e8c547' : '#ff6a5a' })); }
}

// ---------------------------------------------------------------- a train
const TOP = 22, ACC = 1.0, DWELL = 16;

export class Train {
  constructor(rail, track, start, dir, { cars = 4, cash = false } = {}) {
    this.rail = rail; this.track = track; this.dir = dir; this.cash = cash;
    this.s = rail.plan.length * start; this.v = 0; this.state = 'run'; this.dwell = 0;
    this.n = cars;
    this.cars = [];
    for (let i = 0; i < cars; i++) this.cars.push(this.makeCar(i));
    this.head = new THREE.Vector3();
    this.pickNext();
    this.place(0);
  }

  get length() { return this.n * (CAR_LEN + GAP); }

  pickNext() {
    const st = this.rail.plan.stations, L = this.rail.plan.length;
    const ahead = st.filter((x) => (this.dir > 0 ? x.s > this.s + 5 : x.s < this.s - 5)).sort((a, b) => (a.s - b.s) * this.dir);
    this.next = ahead[0] || null;
    this.stopAt = this.next ? this.next.s + this.dir * (this.rail.plan.stations[0] === this.next || this.rail.plan.stations.at(-1) === this.next ? 0 : 0) : (this.dir > 0 ? L - 10 : 10);
  }

  makeCar(i) {
    const g = this.rail.game, sb = this.rail.sb;
    const loco = i === 0 || (!this.cash && i === this.n - 1);
    const group = new THREE.Group();
    const body = this.cash ? 0x2a4a3a : 0xe8e6e0, stripe = this.cash ? 0xd8b030 : 0xb3261e;
    const winTex = canvasTex(256, 64, (c, w, h) => { c.fillStyle = `#${body.toString(16).padStart(6, '0')}`; c.fillRect(0, 0, w, h); c.fillStyle = `#${stripe.toString(16).padStart(6, '0')}`; c.fillRect(0, h * 0.72, w, h * 0.12); if (!this.cash && !loco) { c.fillStyle = '#1a2a3a'; for (let x = 10; x < w - 20; x += 34) c.fillRect(x, h * 0.18, 24, h * 0.36); c.fillStyle = '#5a5e64'; c.fillRect(w / 2 - 12, h * 0.12, 24, h * 0.6); } if (this.cash && !loco) { c.fillStyle = '#d8b030'; c.font = 'bold 14px Arial'; c.fillText('VERIAN NATIONAL · SECURE', 40, h * 0.5); } }, [1, 1]);
    const m = std({ map: winTex, roughness: 0.5, metalness: 0.2 });
    const plain = std({ color: body, roughness: 0.5 }), under = std({ color: 0x2a2c30 });
    const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; group.add(o); return o; };
    // body shell (open inside: floor, sides, roof), with the doors in the middle of each side
    add(new THREE.BoxGeometry(3.0, 0.3, CAR_LEN), under, 0, 1.0, 0);
    for (const s of [-1, 1]) {
      const side = add(new THREE.BoxGeometry(0.12, 2.6, CAR_LEN), m, s * 1.44, 2.45, 0);
      side.rotation.y = s > 0 ? Math.PI : 0;
      if (!this.cash || loco) { side.geometry.dispose(); side.removeFromParent(); for (const z of [-4.3, 4.3]) { const seg = add(new THREE.BoxGeometry(0.12, 2.6, 5.4), m, s * 1.44, 2.45, z); void seg; } add(new THREE.BoxGeometry(0.12, 0.6, 3.2), m, s * 1.44, 3.45, 0); }
    }
    add(new THREE.BoxGeometry(3.1, 0.25, CAR_LEN + 0.1), plain, 0, 3.85, 0);
    if (loco) { const nose = add(new THREE.BoxGeometry(3.0, 2.0, 1.4), std({ color: stripe }), 0, 2.2, (i === 0 ? 1 : -1) * (CAR_LEN / 2 + 0.6)); void nose; add(new THREE.BoxGeometry(2.4, 0.9, 0.08), std({ color: 0x1a2a3a, roughness: 0.1 }), 0, 3.0, (i === 0 ? 1 : -1) * (CAR_LEN / 2 + 0.04)); }
    for (const z of [-CAR_LEN / 2 + 2.2, CAR_LEN / 2 - 2.2]) add(new THREE.BoxGeometry(2.4, 0.6, 2.6), under, 0, 0.55, z); // bogies
    // seats (or cargo)
    if (!loco) for (let z = -5.5; z <= 5.5; z += 2.2) if (Math.abs(z) > 1.6 || this.cash) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.9, 0.5, 0.6), this.cash ? std({ color: 0x8a7a52 }) : std({ color: 0x2f5f9f }), s * 0.85, 1.4, z);
    g.scene.add(group);
    // a kinematic body: floor, sides (with their door gaps), roof, so you can walk about inside
    const rb = sb.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = (hx, hy, hz, x, y, z) => sb.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z), rb);
    col(1.5, 0.15, CAR_LEN / 2, 0, 1.0, 0); col(1.55, 0.12, CAR_LEN / 2, 0, 3.85, 0);
    for (const s of [-1, 1]) { if (this.cash && !loco) col(0.06, 1.3, CAR_LEN / 2, s * 1.44, 2.45, 0); else for (const z of [-4.3, 4.3]) col(0.06, 1.3, 2.7, s * 1.44, 2.45, z); }
    if (loco) col(1.5, 1.3, 0.1, 0, 2.45, (i === 0 ? 1 : -1) * (CAR_LEN / 2 - 0.1));
    return { group, rb, i, prev: null };
  }

  place(dt) {
    const R = this.rail, P = this.rail.plan;
    const pp = R.game.shorePlayer?.body.translation(), carry = pp && R.game.onShore && !R.game.vehicles.active && !R.game.health.dead;
    let moved = false;
    for (const c of this.cars) {
      const sc = this.s - this.dir * (CAR_LEN / 2 + c.i * (CAR_LEN + GAP));
      const a = R.at(sc - 5, R.sep(sc) * this.track), b = R.at(sc + 5, R.sep(sc) * this.track), m = R.at(sc, R.sep(sc) * this.track);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z) + (this.dir < 0 ? Math.PI : 0);
      const pitch = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) * (this.dir < 0 ? -1 : 1);
      const pos = new THREE.Vector3(m.x, m.y + 0.05, m.z), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      const mat = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
      // anyone standing in it rides along
      if (carry && c.prev && !moved) {
        const inv = c.prev.clone().invert(), l = new THREE.Vector3(pp.x, pp.y, pp.z).applyMatrix4(inv);
        if (Math.abs(l.x) < 1.55 && Math.abs(l.z) < CAR_LEN / 2 + 0.2 && l.y > 0.6 && l.y < 3.9) {
          const w = l.clone().applyMatrix4(mat);
          R.game.shorePlayer.body.setTranslation({ x: w.x, y: w.y, z: w.z }, true);
          const e0 = new THREE.Euler().setFromRotationMatrix(c.prev, 'YXZ'), e1 = new THREE.Euler().setFromRotationMatrix(mat, 'YXZ');
          R.game.shorePlayer.yaw += Math.atan2(Math.sin(e1.y - e0.y), Math.cos(e1.y - e0.y));
          this.riding = true; moved = true;
        }
      }
      c.prev = mat;
      c.group.position.copy(pos); c.group.quaternion.copy(q);
      c.rb.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z }); c.rb.setNextKinematicRotation(q);
      if (c.i === 0) this.head.copy(pos);
    }
    if (!moved) this.riding = false;
    void P; void dt;
  }

  update(dt) {
    const L = this.rail.plan.length;
    if (this.halted) { this.v = Math.max(0, this.v - 6 * dt); this.s += this.dir * this.v * dt; this.place(dt); return; }
    if (this.state === 'dwell') {
      this.dwell -= dt;
      if (this.dwell <= 0) { this.state = 'run'; if (this.atEnd) { this.dir *= -1; this.s += this.dir * this.length; this.atEnd = false; } this.pickNext(); this.rail.game.sfx?.playAt?.('horn', this.head); }
      this.place(dt); return;
    }
    // brake for the next stop; the end of the line turns it round
    const target = this.next ? this.next.s + this.dir * (this.length / 2) : (this.dir > 0 ? L - 4 : 4);
    const left = (target - this.s) * this.dir;
    const vmax = Math.min(this.cash ? 18 : TOP, Math.max(left > 0.4 ? 1.2 : 0, Math.sqrt(2 * ACC * Math.max(0, left - 0.4))));
    this.v = this.v < vmax ? Math.min(vmax, this.v + ACC * dt) : Math.max(vmax, this.v - ACC * 2 * dt);
    this.s += this.dir * this.v * dt;
    if (left < 0.6 && this.v < 1.5) {
      this.v = 0; this.state = 'dwell'; this.dwell = DWELL;
      const ends = this.rail.plan.stations;
      if (!this.next || this.next === ends[0] || this.next === ends.at(-1)) this.atEnd = true;
      if (this.atEnd) { this.s = target; } // (flips round when it leaves)
    }
    this.s = Math.max(0, Math.min(L, this.s));
    this.place(dt);
    this.hitCheck();
  }

  // anyone on the line in front of it
  hitCheck() {
    const g = this.rail.game;
    if (this.v < 4) return;
    const p = g.shorePlayer.body.translation();
    if (g.onShore && !g.vehicles.active && !g.health.dead && !this.riding) {
      const d = Math.hypot(p.x - this.head.x, p.z - this.head.z);
      if (d < 3.2 && Math.abs(p.y - this.head.y - 1.5) < 2.5) g.health.damage(9999, 'train');
    }
  }

  dispose() { const sb = this.rail.sb; for (const c of this.cars) { c.group.removeFromParent(); sb.world.removeRigidBody(c.rb); } }
}
