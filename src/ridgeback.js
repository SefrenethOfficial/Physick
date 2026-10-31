import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, LAND_Y } from './world.js';
import { std, sign, solidBox, canvasTex, speckle, lamp, carMesh } from './buildkit.js';
import { fbm, smooth, rng, makeRoad, RoadIndex, buildTerrain, ribbon, scatter, besideRoad } from './terrain.js';
import { gasStation } from './gasstation.js';
import { photoTex } from './park.js';
import { buildQuarry, PIT } from './quarry.js';
import { Frame, woodMats, logCabin, campfire, undergrowth, huntingStand, planeWreck, mineEntrance } from './woods.js';

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
    // (a stratovolcano: a steep summit cone with a crater, flaring out into broad lower slopes. R0 is how far
    // out the cone reaches: less on the car park's side, more round the back; rim: the crater's edge)
    this.crater = { cave: 46, top: 300, R0: 160, p: 1.7, R1: 330, p1: 2.2, rim: 30, dip: 30, thick: 7, oculus: 4.5 }; // (R0/p: the breached side, where the car park is; R1/p1: everywhere else)
    this.quarry = { x: -1735, z: -985, r: PIT.rim };
    // out in the woods: a crashed plane, an old mine, deer stands (kept clear of trees)
    this.spots = { plane: { x: -2100, z: -736, r: 14 }, mine: { x: -2075, z: -900, r: 11 }, standA: { x: -2227, z: -688, r: 5 }, standB: { x: -1764, z: -1191, r: 5 } };
    this.fires = []; this.chimneys = []; this.nightMats = [];
    this.plan();
    this.build();
  }

  natural(x, z) {
    const isl = this.isl;
    const e = Math.min(x - isl.x0, isl.x1 - x, z - isl.z0, isl.z1 - z);
    const mask = smooth(6, 90, e);
    const dP = Math.hypot(x - this.peak.x, z - this.peak.z);
    const mount = 150 * Math.pow(Math.max(0, 1 - dP / 310), 1.25) * (0.92 + 0.16 * fbm(x / 80 + 1.7, z / 80 - 4.2)); // a steep cone
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
    { const E = this.pass.pts.at(-1); this.coneAz = Math.atan2(E.x - this.peak.x, E.z - this.peak.z); } // (the car park's side of the mountain)
    const q = this.quarry;
    const passY = (x, z) => this.pass.pts.reduce((b, p) => ((p.x - x) ** 2 + (p.z - z) ** 2 < (b.x - x) ** 2 + (b.z - z) ** 2 ? p : b)).y;
    // the haul road: down the valley, then in through a cutting in the spoil bank to the pit floor
    this.quarryRoad = makeRoad([[-1790, -556], [-1770, -650], [-1760, -760], [-1745, -850], [q.x, -890], [q.x, q.z + 30]], { width: 8, kind: 'dirt', smoothN: 8, maxGrade: 0.14,
      yOf: (s, x, z) => (s < 20 ? passY(x, z) : z - q.z < 200 ? this.cutY(x, z) : this.natural(x, z) - 1) });
    this.roads = [this.pass, this.quarryRoad];
    this.index = new RoadIndex(this.roads);
    const P = this.pass.pts.at(-1);
    const gas = besideRoad(this.pass, -1700, -470, 27);
    this.flats = [
      { ...gas, r: 30, blend: 26 }, // the gas station, level with the road
      { x: -1880, z: -640, r: 34, y: passY(-1880, -640), blend: 45 }, // the meadow with the cabins (at road level, sloping gently up to the hills)
      { x: P.x, z: P.z - 6, r: 15, y: P.y }, // the summit car park, at the mouth of the tunnel into the crater
      { x: this.spots.mine.x, z: this.spots.mine.z, r: 5, blend: 5 }, // a ledge cut into the volcano's flank for the old mine
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
    // the alcove up the spire, facing the city: a ledge cut into the rock (the chute and glider shop)
    { const th = Math.atan2(-T.u.x, -T.u.z) + 0.82, y = P.y + 92; let r = 10; while (this.coneAt(r, th) > y && r < this.R0at(th)) r += 0.5;
      this.alcove = { th, y, r, x: V.x + Math.sin(th) * r, z: V.z + Math.cos(th) * r }; }
    // the footpath up to it: once round the spire, from beside the car park, on a ledge cut into the rock
    { const A = this.alcove, th0 = Math.atan2(-T.u.x, -T.u.z) + 0.32, th1 = A.th + Math.PI * 2 - 9.5 / A.r, y0 = P.y + 0.2, y1 = A.y, n = 420;
      const rCone = (y, th) => { let r = this.crater.rim; while (this.coneAt(r, th) > y && r < this.R0at(th)) r += 0.25; return r; };
      const pts = []; for (let i = 0; i <= n; i++) { const t = i / n, th = th0 + (th1 - th0) * t, y = y0 + (y1 - y0) * t, r = Math.min(rCone(y, th) + 1.2, this.R0at(th) - 4); pts.push({ x: V.x + Math.sin(th) * r, y, z: V.z + Math.cos(th) * r }); }
      this.walkway = pts;
      const grid = new Map(); for (const p of pts) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = `${Math.floor(p.x / 12) + a},${Math.floor(p.z / 12) + b}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
      this.walkNear = (x, z) => { const l = grid.get(`${Math.floor(x / 12)},${Math.floor(z / 12)}`); if (!l) return null; let best = null, bd = Infinity; for (const p of l) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } } return { p: best, d: Math.sqrt(bd) }; }; }
    this.roads.push(this.tunnelRoad);
    for (const f of this.flats) if (f.y == null) f.y = this.natural(f.x, f.z);
  }

  quarryFloor() { return Y + 4; }
  // the pit's square (rounded) distance from its middle: the benches are straight, on the terrain's grid
  quarryS(x, z) { const dx = x - this.quarry.x, dz = z - this.quarry.z; return Math.pow(dx ** 6 + dz ** 6, 1 / 6); }
  inCutting(x, z, m = 0) { const dx = x - this.quarry.x, dz = z - this.quarry.z; return dz > 30 && dz < 205 && Math.abs(dx) < 30 + m; }
  cutY(x, z) { const q = this.quarry, f = this.quarryFloor(); return f + (this.natural(q.x, z) - 1 - f) * smooth(45, 170, z - q.z); }
  // the quarry: a hill of spoil round a pit, three benches down (10 m each) to the floor, a sump
  // pond in one corner and the cutting the haul road comes in by
  quarryAt(x, z, h) {
    const q = this.quarry, f = this.quarryFloor(), P = PIT, rim = f + 3 * P.lift, dx = x - q.x, dz = z - q.z, s = this.quarryS(x, z);
    let y;
    if (s < P.floor) y = f;
    else if (s < P.rim) { const k = s - P.floor, i = Math.floor(k / P.bench), u = k - i * P.bench; y = f + i * P.lift + P.lift * Math.min(1, u / P.face); }
    else y = Math.max(h, rim + (h - rim) * smooth(P.rim, P.rim + 110, s));
    const pd = Math.hypot(dx - 30, dz + 30); if (pd < 9.5) y = Math.min(y, f - 1.8 * smooth(9.5, 4, pd));
    if (dz > 30 && dz < 205 && Math.abs(dx) < 60) y = Math.min(y, this.cutY(x, z) + Math.max(0, Math.abs(dx) - 9) * 1.3);
    return y;
  }

  heightAt(x, z) {
    let h = this.natural(x, z);
    const q = this.quarry;
    if (Math.abs(x - q.x) < 320 && Math.abs(z - q.z) < 320) h = this.quarryAt(x, z, h);
    for (const fl of this.flats) { const b = fl.blend || 20, d = Math.hypot(x - fl.x, z - fl.z); if (d < fl.r + b) h = fl.y + (h - fl.y) * smooth(fl.r, fl.r + b, d); }
    const n = this.index.nearest(x, z, 40);
    if (n) { const w = n.r.width / 2; h = n.p.y - 0.05 + (h - n.p.y + 0.05) * smooth(w + 3.5, w + 28, n.d); } // (a flat verge, then the bank)
    return this.volcanoAt(x, z, h);
  }

  // The volcano's summit: a clean cone (its slope parallel to the cavern's roof inside), with the
  // tunnel cut into its side from the car park to the portal (beyond that it runs underground).
  // the ground's opened up over the tunnel (beyond the portal), so it can run under the mountain
  underTunnel(x, z) { const T = this.tunnel; if (T.portal == null) return false; const ax = x - T.a.x, az = z - T.a.z, t = ax * T.u.x + az * T.u.z, lat = Math.abs(ax * T.u.z - az * T.u.x); return t > T.portal - 2 && t < T.len + 4 && lat < 8.5; }
  // how far out the cone reaches at an angle (round from the car park's side)
  // (0 on the breached side, where the car park is, 1 round the rest of the mountain)
  side(th) { const d = Math.abs(Math.atan2(Math.sin(th - this.coneAz), Math.cos(th - this.coneAz))); return smooth(0.25, 0.95, d); }
  R0at(th) { const K = this.crater; return K.R0 + (K.R1 - K.R0) * this.side(th); }
  // the cone's height r m out at angle th (by default on the car park's side, where it's lowest: the
  // cavern's roof follows that): concave flanks up to the crater rim, then down into the crater
  coneAt(r, th = this.coneAz) {
    const K = this.crater, TOP = this.summitY + K.top, BASE = Y;
    if (r <= K.rim) return TOP + 3 * smooth(K.rim - 9, K.rim, r) - K.dip * smooth(K.rim - 4, 10, r); // (a lip, then the crater)
    // a broad stratovolcano, its flanks flattening all the way down; on the car park's side a breach,
    // a great notch out of the flank, where the pass comes up
    const prof = (R, p) => (r >= R ? BASE : BASE + (TOP - BASE) * Math.pow((R - r) / (R - K.rim), p));
    const near = prof(K.R0, K.p), far = prof(K.R1, K.p1);
    return near + (far - near) * this.side(th);
  }
  // ridges and gullies down the flanks (none at the rim or the foot)
  gully(r, th) {
    const K = this.crater, u = Math.min(1, Math.max(0, (this.R0at(th) - r) / (this.R0at(th) - K.rim)));
    const n = fbm(th * 9.5 + 40, r / 55 + th * 0.3);
    return 7 * Math.sin(Math.PI * u) * (1 - Math.abs(n * 2 - 1) * 2.2);
  }
  volcanoAt(x, z, h) {
    const V = this.peak, r = Math.hypot(x - V.x, z - V.z);
    if (r > 340) return h;
    const th = Math.atan2(x - V.x, z - V.z), cone = this.coneAt(r, th);
    if (r < this.R0at(th)) { // (the cone's always on top, flaring smoothly out of the hill instead of sitting on it like a hat)
      const isl = this.isl, e = Math.min(x - isl.x0, isl.x1 - x, z - isl.z0, isl.z1 - z), edge = smooth(6, 110, e); // (down to the sea at the island's edge)
      const c = Y + (cone - Y) * edge + (r > this.crater.rim ? this.gully(r, th) : 0) + (r < this.crater.rim + 6 ? 2.5 * fbm(th * 6, 3) - 1.2 : 0), k = 40, m = Math.max(0, k - Math.abs(c - h)) / k;
      h = Math.max(h, c) + m * m * k * 0.25 * smooth(this.R0at(th), this.R0at(th) - 30, r);
      // the roads up here run in cuttings through the flank
      const n = this.index.nearest(x, z, 30);
      if (n) { const w = n.r.width / 2; h = Math.min(h, n.p.y - 0.05 + Math.max(0, n.d - w - 3.5) * 0.9); }
    }
    const T = this.tunnel;
    if (T.portal != null) {
      const ax = x - T.a.x, az = z - T.a.z, t = ax * T.u.x + az * T.u.z, lat = Math.abs(ax * T.u.z - az * T.u.x);
      if (t > -4 && t < T.portal + 1) h = Math.min(h, T.y - 0.05 + Math.max(0, lat - 6.5) * 2.2);
    }
    const wn = this.walkNear?.(x, z);
    if (wn && wn.d < 9) h = Math.min(h, wn.p.y - 0.3 + Math.max(0, wn.d - 2.2) * 1.4); // (the footpath's ledge)
    const A = this.alcove;
    if (A) { // (radial: d in from the cliff face; across: l)
      const ux = Math.sin(A.th), uz = Math.cos(A.th), dx = x - A.x, dz = z - A.z, out = dx * ux + dz * uz, l = Math.abs(dx * uz - dz * ux);
      if (out > -8 && out < 10 && l < 12) h = Math.min(h, A.y - 0.05 + Math.max(0, l - 7.5) * 2.5 + Math.max(0, -out - 6.5) * 2.5);
    }
    const sm = this.flats[2], dsm = Math.hypot(x - sm.x, z - sm.z);
    if (dsm < sm.r + 12) h = sm.y + (h - sm.y) * smooth(sm.r, sm.r + 12, dsm);
    return h;
  }

  free(x, z, m = 2) {
    const isl = this.isl;
    if (x < isl.x0 + 4 || x > isl.x1 - 4 || z < isl.z0 + 4 || z > isl.z1 - 4) return false;
    if (this.index.nearest(x, z, 9 + m)) return false;
    if (this.flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + m)) return false;
    if (this.quarryS(x, z) < this.quarry.r + 6 || this.inCutting(x, z, m)) return false;
    for (const k in this.spots) { const p = this.spots[k]; if (Math.hypot(x - p.x, z - p.z) < p.r + m) return false; }
    if (Math.hypot(x - this.peak.x, z - this.peak.z) < 150) return false; // the volcano's summit cone
    return true;
  }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl, R = this.R;
    const base = import.meta.env.BASE_URL;
    const W = isl.x1 - isl.x0, D = isl.z1 - isl.z0;
    const q = this.quarry;
    // the volcano gets its own, much finer mesh out to coneR (the terrain's 5 m grid made the steep cone
    // blocky); the terrain has a hole there
    this.coneR = (th) => Math.min(this.R0at(th) * 0.8, 170);
    const volcanoHole = (x, z) => { const dx = x - this.peak.x, dz = z - this.peak.z; return Math.hypot(dx, dz) < this.coneR(Math.atan2(dx, dz)) - 1; };
    this.terrain = buildTerrain(g, sb, isl, {
      heightAt: (x, z) => this.heightAt(x, z), step: 5, sideColor: 0x6a604e, castShadow: true,
      hole: (x, z) => volcanoHole(x, z) || this.underTunnel(x, z), // the volcano (its own mesh: buildCone), and the tunnel (roofed over: volcano.js)
      map: photoTex(`${base}assets/textures/grass.jpg`, W / 9, D / 9),
      colorAt: this.colorAt = (x, y, z, ny) => {
        const steep = smooth(0.9, 0.66, ny), high = smooth(Y + 90, Y + 145, y);
        const k = Math.max(steep, high * 0.9);
        const c = [1 - k * 0.12, 1 - k * 0.42, 1 - k * 0.2 + k * 0.08]; // grey-brown rock up high and on the crags
        // the quarry: pale grey stone on the faces, dusty gravel on the benches, the floor and the haul road
        const qk = Math.max(smooth(q.r + 4, q.r - 3, this.quarryS(x, z)), this.inCutting(x, z) ? smooth(32, 16, Math.abs(x - q.x)) : 0);
        if (qk > 0) { const t = ny < 0.8 ? [1.6, 1.3, 5.9] : [2.75, 2.2, 8.0]; /* (the grass photo's tinted: these take it to grey stone and pale gravel) */ for (let k3 = 0; k3 < 3; k3++) c[k3] += (t[k3] - c[k3]) * qk; }
        const vr = Math.hypot(x - this.peak.x, z - this.peak.z), basalt = smooth(380, 240, vr);
        if (basalt > 0) { // dark grey-brown rock (the texture's green, so the tint undoes it)
          const t = [0.8, 0.56, 1.35].map((v) => v * (1 - 0.18 * steep)); // (volcanic rock: dark grey-brown)
          for (let k3 = 0; k3 < 3; k3++) c[k3] += (t[k3] - c[k3]) * basalt;
          const th = Math.atan2(x - this.peak.x, z - this.peak.z);
          if (vr < this.R0at(th)) {
            const rust = smooth(-1.5, -5, this.gully(vr, th)) * 0.75, ash = smooth(this.summitY + 190, this.summitY + 285, y) * 0.85;
            for (let k3 = 0; k3 < 3; k3++) { c[k3] += ([1.05, 0.42, 0.85][k3] - c[k3]) * rust; c[k3] += ([1.45, 1.18, 5.0][k3] - c[k3]) * ash; } // rusty streaks down the gullies, pale ash up top
          }
        }
        const snow = smooth(Y + 128, Y + 150, y) * smooth(0.7, 0.85, ny) * (1 - basalt);
        if (snow > 0) { c[0] += snow * 2.2; c[1] += snow * 1.9; c[2] += snow * 2.2; }
        return c;
      },
    });
    this.buildCone();
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

    // ---- Ridgeback Cabins: five log cabins round a campfire in the meadow, the office by the way in ----
    { const mw = this.flats[1], yM = mw.y, M = woodMats();
      const near = this.pass.pts.reduce((b2, p) => (Math.hypot(p.x - mw.x, p.z - mw.z) < Math.hypot(b2.x - mw.x, b2.z - mw.z) ? p : b2));
      const toRoad = Math.atan2(near.x - mw.x, near.z - mw.z);
      const at = (a, r) => ({ x: mw.x + Math.sin(a) * r, z: mw.z + Math.cos(a) * r });
      this.cabins = [];
      [-2, -1, 0, 1, 2].forEach((k, i) => {
        const a = toRoad + Math.PI + k * 0.62, p = at(a, 23.5);
        const c = logCabin(g, sb, p.x, yM, p.z, a + Math.PI, { num: i + 1 });
        this.cabins.push(c); this.chimneys.push(c.chimney); this.lootSpots.push(...c.loot);
      });
      { const a = toRoad + 0.95, p = at(a, 21); const o = logCabin(g, sb, p.x, yM, p.z, a + Math.PI, { W: 6.5, D: 5, num: 0, office: true }); this.cabinOffice = o; this.chimneys.push(o.chimney); this.lootSpots.push(...o.loot); }
      const fire = campfire(g, sb, mw.x, yM, mw.z, { benches: 5, r: 3.6 }); this.fires.push(fire); this.campfire = fire.pos;
      // the gravel drive in from the pass, and the car park
      const dPts = []; { const e = at(toRoad, 12), dl = Math.hypot(near.x - e.x, near.z - e.z); for (let t = 0; t <= dl; t += 2) { const x = e.x + ((near.x - e.x) * t) / dl, z = e.z + ((near.z - e.z) * t) / dl; dPts.push({ x, z, y: this.heightAt(x, z) }); } }
      const gravelM = std({ map: photoTex(`${base}assets/textures/dirt.jpg`, 1, 1), color: 0xc8bca8, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
      ribbon(g, dPts, 6, gravelM, { uScale: 6, yOf: (p2, x, z) => this.heightAt(x, z) });
      { const p = at(toRoad - 0.75, 19), lot = new THREE.Mesh(new THREE.CircleGeometry(8, 20), gravelM); lot.rotation.x = -Math.PI / 2; lot.position.set(p.x, yM + 0.07, p.z); g.add(lot);
        for (const [k, col] of [[-1, 0x4a6a3a], [1, 0x8a2a20]]) { const c = carMesh(col), q2 = at(toRoad - 0.75 + k * 0.17, 19); c.position.set(q2.x, yM, q2.z); c.rotation.y = toRoad; g.add(c);
          sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.0, 0.9, 2.3).setTranslation(q2.x, yM + 0.9, q2.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), toRoad))); } }
      // picnic tables by the fire, the outhouse out the back, a chopping block, the canoe rack
      for (const k of [-1, 1]) { const p = at(toRoad + k * 0.55, 10), P = new Frame(g, sb, p.x, yM, p.z, toRoad + k * 0.3);
        P.box(2.2, 0.08, 0.9, 0, 0.74, 0, M.planks, { collide: false }); for (const s2 of [-0.72, 0.72]) P.box(2.2, 0.06, 0.32, 0, 0.44, s2, M.planks, { collide: false });
        for (const s2 of [-0.9, 0.9]) P.box(0.08, 0.74, 1.7, s2, 0, 0, M.darkWood, { collide: false, rx: 0 }); P.collider(2.2, 0.8, 1.8, 0, 0, 0); this.lootSpots.push(P.world(0.4, 0.85, 0)); }
      { const a = toRoad + Math.PI + 1.55, p = at(a, 33), O = new Frame(g, sb, p.x, this.heightAt(p.x, p.z), p.z, a + Math.PI);
        O.box(1.4, 0.15, 1.4, 0, 0, 0, M.planks); O.box(1.4, 2.2, 0.08, 0, 0.15, -0.66, M.planks); for (const s2 of [-1, 1]) O.box(0.08, 2.2, 1.4, s2 * 0.66, 0.15, 0, M.planks);
        O.box(1.0, 2.0, 0.06, 0.1, 0.15, 0.66, M.planks, { collide: false }); O.box(1.6, 0.1, 1.7, 0, 2.4, 0, M.shingle, { rx: -0.12, collide: false });
        O.mesh(new THREE.CircleGeometry(0.1, 12, 0, 4.5), std({ color: 0x111111 }), 0.1, 1.85, 0.7, { cast: false }); }
      { const p = at(toRoad + Math.PI + 0.31, 14.5), C = new Frame(g, sb, p.x, yM, p.z, 0);
        C.cyl(0.4, 0.45, 0.6, 0, 0, 0, M.bark, { collide: true });
        C.mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 12), M.rings, 0, 0.61, 0, { cast: false });
        C.mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), M.darkWood, 0.05, 0.95, 0, { rz: 0.35 }); C.mesh(new THREE.BoxGeometry(0.03, 0.12, 0.22), M.iron, -0.08, 0.66, 0, { rz: 0.35 }); // the axe, stuck in
        for (let i = 0; i < 6; i++) C.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 6), [M.bark, M.rings, M.rings], 0.8 + (i % 3) * 0.25, 0.11 + Math.floor(i / 3) * 0.22, 0.6 + (i % 2) * 0.1, { rx: Math.PI / 2, ry: i, cast: false }); }
      { const a = toRoad + Math.PI - 1.55, p = at(a, 31), C = new Frame(g, sb, p.x, this.heightAt(p.x, p.z), p.z, a);
        for (const s2 of [-1.5, 1.5]) { C.box(0.12, 1.4, 0.12, s2, 0, -0.7, M.log, { collide: false }); C.box(0.12, 1.4, 0.12, s2, 0, 0.7, M.log, { collide: false }); C.box(0.12, 0.12, 1.6, s2, 1.4, 0, M.log, { collide: false }); C.box(0.12, 0.12, 1.6, s2, 0.7, 0, M.log, { collide: false }); }
        C.collider(3.4, 1.5, 1.6, 0, 0, 0);
        for (const [y, col] of [[1.55, 0xc23b2a], [0.85, 0x2a6a9a]]) { const hull = C.mesh(new THREE.CylinderGeometry(0.42, 0.42, 4.6, 12, 1, false, 0, Math.PI), std({ color: col, roughness: 0.6, side: THREE.DoubleSide }), 0, y + 0.06, 0, { rz: Math.PI / 2, rx: Math.PI }); hull.scale.set(1, 1, 0.75); } }
      { const sp = at(toRoad, 30); sign(g, 'RIDGEBACK CABINS', sp.x, this.heightAt(sp.x, sp.z) + 2.4, sp.z, toRoad, { w: 5, h: 0.9, bg: '#3b2a1a', fg: '#f2d9a0', post: this.heightAt(sp.x, sp.z) }); }
      this.meadow = { x: mw.x, z: mw.z, y: yM };
    }

    // ---- the quarry ----
    { const qo = buildQuarry(this, g, sb); this.lootSpots.push(...qo.loot); this.nightMats.push(qo.lampM); this.quarryOffice = qo.office; }

    // ---- things off the trails: a crashed plane, an old mine, deer stands ----
    { const S = this.spots;
      const downhill = (x, z) => { const gx = this.heightAt(x + 3, z) - this.heightAt(x - 3, z), gz = this.heightAt(x, z + 3) - this.heightAt(x, z - 3); return Math.atan2(-gx, -gz); };
      const pw = planeWreck(g, sb, S.plane.x, this.heightAt(S.plane.x, S.plane.z), S.plane.z, 2.2); this.lootSpots.push(...pw.loot);
      const ml = this.flats[3], ma = Math.atan2(this.natural(ml.x - 4, ml.z) - this.natural(ml.x + 4, ml.z), this.natural(ml.x, ml.z - 4) - this.natural(ml.x, ml.z + 4)), mx = ml.x - Math.sin(ma) * 4, mz = ml.z - Math.cos(ma) * 4; // (the portal at the back of the ledge, in the bank)
      const mine = mineEntrance(g, sb, mx, ml.y, mz, ma); this.lootSpots.push(...mine.loot); this.mine = new THREE.Vector3(ml.x, ml.y, ml.z); this.mineYaw = ma;
      for (const k of ['standA', 'standB']) { const p = S[k], st = huntingStand(g, sb, p.x, this.heightAt(p.x, p.z), p.z, Math.random() * 6.3); this.lootSpots.push(...st.loot); }
    }

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
      if (Math.hypot(x - this.peak.x, z - this.peak.z) < 255) continue; // bare volcanic rock up top
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

    // ---- the undergrowth: bushes, ferns, mushrooms, birches lower down, stumps, flowers, fallen logs ----
    { const forest = (m) => { for (let k = 0; k < 6; k++) { const x = isl.x0 + R() * W, z = isl.z0 + R() * D; if (!this.free(x, z, m)) continue; if (Math.hypot(x - this.peak.x, z - this.peak.z) < 255) continue; if (this.heightAt(x, z) > Y + 128) continue; return { x, z }; } return null; };
      const low = (m) => { const p = forest(m); return p && this.heightAt(p.x, p.z) < Y + 60 ? p : null; };
      undergrowth(g, sb, { spot: forest, heightAt: (x, z) => this.heightAt(x, z), rnd: R, counts: { bush: 1500, fern: 1500, shroom: 240, stump: 150, birch: 0, flower: 500, log: 50 } });
      undergrowth(g, sb, { spot: low, heightAt: (x, z) => this.heightAt(x, z), rnd: R, counts: { bush: 0, fern: 0, shroom: 0, stump: 0, birch: 240, flower: 0, log: 0 } });
      // wildflowers thick in the meadow, round the cabins
      const mw = this.meadow; undergrowth(g, sb, { spot: () => { const a = R() * 6.3, r = 8 + R() * 40, x = mw.x + Math.sin(a) * r, z = mw.z + Math.cos(a) * r; return this.index.nearest(x, z, 8) || this.cabins.some((c) => c.inside.distanceTo(new THREE.Vector3(x, c.inside.y, z)) < 7) ? null : { x, z }; }, heightAt: (x, z) => this.heightAt(x, z), rnd: R, counts: { bush: 0, fern: 0, shroom: 0, stump: 0, birch: 0, flower: 380, log: 0 } }); }

    // ---- the Hillclimb street race: from the gas station to the observatory ----
    const p0 = this.pass.pts.findIndex((p) => p.s > 95);
    const cps = [];
    for (let i = p0; i < this.pass.pts.length; i += 9) { const p = this.pass.pts[i]; cps.push(new THREE.Vector3(p.x, p.y, p.z)); }
    const last = this.pass.pts.at(-1); cps.push(new THREE.Vector3(last.x, last.y, last.z));
    this.race = { id: 'hillclimb', name: 'Ridgeback Hillclimb', laps: 1, loop: false, prize: [5000, 1800, 700], pts: cps, desc: 'Point to point: from the gas station, through the meadow and up the switchbacks of the Ridgeback Pass to the observatory, 150 m up.' };
  }

  // where the deer live: the woods below the treeline (not the roads, the quarry, the volcano)
  deerArea() {
    const isl = this.isl, Yb = Y;
    const ok = (x, z) => x > isl.x0 + 15 && x < isl.x1 - 15 && z > isl.z0 + 15 && z < isl.z1 - 15 && !this.index.nearest(x, z, 7) && this.quarryS(x, z) > this.quarry.r + 8 && !this.inCutting(x, z, 4) && Math.hypot(x - this.peak.x, z - this.peak.z) > 260 && this.heightAt(x, z) < Yb + 120;
    const spot = () => { for (let k = 0; k < 40; k++) { const x = isl.x0 + Math.random() * (isl.x1 - isl.x0), z = isl.z0 + Math.random() * (isl.z1 - isl.z0); if (ok(x, z) && !this.index.nearest(x, z, 20)) return { x, z }; } return null; };
    return { spot, ok, heightAt: (x, z) => this.heightAt(x, z) };
  }

  // The volcano's own mesh: a polar grid, fine near the summit, out to coneR (where the terrain takes
  // over; the last few metres tuck just under it). Same material and colours as the terrain.
  buildCone() {
    const V = this.peak, NA = 288, NR = 96, isl = this.isl, W = isl.x1 - isl.x0, D = isl.z1 - isl.z0;
    const pos = new Float32Array((NR + 1) * NA * 3), uv = new Float32Array((NR + 1) * NA * 2);
    for (let i = 0; i <= NR; i++) for (let j = 0; j < NA; j++) {
      const th = (j / NA) * Math.PI * 2, Rm = this.coneR(th), s = i / NR, r = 0.6 + (Rm + 6 - 0.6) * Math.pow(s, 1.25);
      const x = V.x + Math.sin(th) * r, z = V.z + Math.cos(th) * r;
      const y = this.heightAt(x, z) - 0.35 * smooth(Rm - 5, Rm + 2, r); // (tucked under the terrain at the edge)
      const k = i * NA + j;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = (x - isl.x0) / W; uv[k * 2 + 1] = 1 - (z - isl.z0) / D;
    }
    const idx = [], hole = (x, z) => Math.hypot(x - V.x, z - V.z) < this.crater.oculus + 0.5 || this.underTunnel(x, z);
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
      const a = i * NA + j, b = i * NA + ((j + 1) % NA), c = (i + 1) * NA + j, d = (i + 1) * NA + ((j + 1) % NA);
      for (const [p, q, r] of [[a, c, b], [b, c, d]]) {
        const mx = (pos[p * 3] + pos[q * 3] + pos[r * 3]) / 3, mz = (pos[p * 3 + 2] + pos[q * 3 + 2] + pos[r * 3 + 2]) / 3;
        if (!hole(mx, mz)) idx.push(p, q, r);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, col = new Float32Array(pos.length);
    for (let k = 0; k < pos.length / 3; k++) { const c = this.colorAt(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], nrm.getY(k)); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, this.terrain.material);
    mesh.receiveShadow = mesh.castShadow = true; mesh.userData.noMerge = true;
    this.group.add(mesh); this.coneMesh = mesh;
    this.sb.addStaticCollider(RAPIER.ColliderDesc.trimesh(pos, new Uint32Array(idx)));
  }
}
