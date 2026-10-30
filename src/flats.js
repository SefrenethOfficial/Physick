import * as THREE from 'three';
import { std, canvasTex } from './buildkit.js';
import { MATS } from './architecture.js';

// The fit-out of a flat. Every flat is laid out in its own frame: `a` runs across it (along the
// corridor), `b` runs in from the front door (b = 0, the corridor wall) to the windows (b = D).
//
//   one-bedroom (wide enough):           studio (narrow ones):
//   ┌──────────┬───────────────┐         ┌─────────────────┐
//   │ bedroom  │ living room   │ windows │ bed      telly  │
//   │ wardrobe │ sofa · telly  │         │ sofa            │
//   ├──door────┤ dining table  │         │ table   kitchen │
//   │ bathroom │       kitchen │         ├─bath─┐  kitchen │
//   └──────────┴──door─────────┘ corridor└──────┴─door─────┘

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const glow = (c, k = 0.22, extra = {}) => { const m = std({ color: c, roughness: 0.75, ...extra }); m.emissive = new THREE.Color(c); m.emissiveIntensity = k; return m; };

export const WALLS = [0xeee8dc, 0xe4ebe6, 0xf1e6da, 0xe1e6ee, 0xeee2e6, 0xe9ecdf];
const FABRIC = [0x3f5f8a, 0x8a4a3a, 0x5a6a4a, 0x6a5a7a, 0x4a4a52, 0xb08a4a, 0x2f6f6a];
const DUVET = [0xf2efe8, 0x9fb8d8, 0xd8b8a8, 0xb8c8a8, 0xe8d8a8, 0x8a8aa8];

export function flatMats() {
  return once('mats', () => {
    const tile = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8ccd0'; for (let i = 0; i <= 4; i++) { c.fillRect(0, i * 16, w, 1); c.fillRect(i * 16, 0, 1, h); } }, [6, 3]);
    const floorTile = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#9aa4ac'; c.fillRect(0, 0, w, h); c.fillStyle = '#8a949c'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) c.fillRect(i * 16, j * 16, 16, 16); c.fillStyle = '#6a747c'; for (let i = 0; i <= 4; i++) { c.fillRect(0, i * 16, w, 1); c.fillRect(i * 16, 0, 1, h); } }, [3, 3]);
    const books = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#5a4030'; c.fillRect(0, 0, w, h); for (const y0 of [2, 34]) { let x = 2; while (x < w - 6) { const bw = 3 + Math.floor(Math.random() * 6), bh = 20 + Math.floor(Math.random() * 9); c.fillStyle = ['#8a2a2a', '#2a4a7a', '#3a6a3a', '#c8a050', '#e8e0d0', '#4a2a5a', '#1a1a1a'][Math.floor(Math.random() * 7)]; c.fillRect(x, y0 + 28 - bh, bw, bh); x += bw + 1; } } });
    const mail = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#9a8a5a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { c.fillStyle = '#7a6a40'; c.fillRect(2 + i * 16, 2 + j * 16, 14, 14); c.fillStyle = '#e8e0c8'; c.fillRect(4 + i * 16, 4 + j * 16, 6, 3); c.fillStyle = '#3a3020'; c.fillRect(12 + i * 16, 9 + j * 16, 2, 4); } });
    return {
      skirt: glow(0xf4f2ec, 0.25), oak: Object.assign(MATS.floor('wood'), {}), oakSolid: glow(0xa87a4a, 0.2), walnut: glow(0x5a3a24, 0.2),
      white: glow(0xf4f4f0, 0.3, { roughness: 0.35 }), gloss: glow(0xe8e8e4, 0.25, { roughness: 0.25 }), steel: glow(0xb8bcc0, 0.15, { metalness: 0.6, roughness: 0.3 }),
      black: glow(0x18191c, 0.05, { roughness: 0.3 }), dark: glow(0x2a2c30, 0.08), stone: glow(0x6a6660, 0.2, { roughness: 0.4 }), stoneLight: glow(0xd8d2c8, 0.25, { roughness: 0.4 }),
      screen: new THREE.MeshBasicMaterial({ color: 0x1a2a3a }), screenOn: new THREE.MeshBasicMaterial({ color: 0x5a8ac8 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xb8d8e8, transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false }),
      mirror: new THREE.MeshStandardMaterial({ color: 0xc8d8e0, emissive: 0x8aa0b0, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.05 }),
      shade: new THREE.MeshBasicMaterial({ color: 0xffe8c0 }), bulb: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
      tile: Object.assign(glow(0xffffff, 0.3, { roughness: 0.3 }), { map: tile, emissiveMap: tile }),
      floorTile: Object.assign(glow(0xffffff, 0.22, { roughness: 0.5 }), { map: floorTile, emissiveMap: floorTile }),
      books: Object.assign(glow(0xffffff, 0.25), { map: books, emissiveMap: books }),
      mail: Object.assign(glow(0xffffff, 0.25, { metalness: 0.3 }), { map: mail, emissiveMap: mail }),
      mattress: glow(0xf4f2ec, 0.25), pillow: glow(0xfafaf6, 0.3), plant: glow(0x3a8a4a, 0.2), plant2: glow(0x2a6a3a, 0.2), pot: glow(0xc87a4a, 0.2), potW: glow(0xe8e4dc, 0.25),
      fabric: FABRIC.map((c) => glow(c, 0.18, { roughness: 0.95 })), duvet: DUVET.map((c) => glow(c, 0.25, { roughness: 0.95 })),
      rug: [0x8a3a2a, 0x2a5a7a, 0x6a6a3a, 0x5a2a5a, 0xc8b898, 0x3a3a42].map((c) => glow(c, 0.18, { roughness: 1 })),
      wall: (c) => once(`wall${c}`, () => MATS.inner(c)), door: glow(0x6a4a30, 0.2, { roughness: 0.6 }), doorMine: glow(0x2a6a3a, 0.2), brass: glow(0xc8a04a, 0.3, { metalness: 0.7, roughness: 0.3 }),
      sconce: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), red: glow(0xc8201e, 0.3),
    };
  });
}

// some pictures for the walls
export function artMat(i) {
  return once(`art${i % 8}`, () => {
    const t = canvasTex(128, 96, (c, w, h) => {
      const k = i % 8, P = [['#e8d8b8', '#c84a2a', '#2a4a6a', '#e8b84a'], ['#20304a', '#e8c86a', '#c8d8e8', '#6a8aa8'], ['#f0ece4', '#1a1a1a', '#c8201e', '#e8e0d0'], ['#7aa8c8', '#e8f0f4', '#3a6a3a', '#8ab86a'], ['#e8c8b8', '#8a3a5a', '#f0e0d8', '#4a2a3a'], ['#2a3a2a', '#c8a04a', '#e8e0c8', '#6a8a5a'], ['#f4f0e8', '#2a5a8a', '#e8a84a', '#8a2a2a'], ['#3a2a4a', '#e86a4a', '#f0c86a', '#6a4a8a']][k];
      c.fillStyle = P[0]; c.fillRect(0, 0, w, h);
      if (k === 3 || k === 5) { // a landscape
        c.fillStyle = P[1]; c.fillRect(0, 0, w, h * 0.55); c.fillStyle = P[2]; c.beginPath(); c.moveTo(0, h * 0.6); c.lineTo(w * 0.3, h * 0.35); c.lineTo(w * 0.55, h * 0.55); c.lineTo(w * 0.8, h * 0.3); c.lineTo(w, h * 0.5); c.lineTo(w, h); c.lineTo(0, h); c.fill();
        c.fillStyle = P[3]; c.fillRect(0, h * 0.75, w, h * 0.25); c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(w * 0.75, h * 0.18, 8, 0, 7); c.fill();
      } else if (k === 2) { // blocks
        c.fillStyle = P[1]; c.fillRect(0, h * 0.3, w * 0.6, 4); c.fillRect(w * 0.6, 0, 4, h);
        c.fillStyle = P[2]; c.fillRect(w * 0.62, h * 0.32, w * 0.38, h * 0.68); c.fillStyle = '#2a4a8a'; c.fillRect(0, 0, w * 0.6, h * 0.3); c.fillStyle = '#e8c84a'; c.fillRect(0, h * 0.32, w * 0.3, h);
      } else { // shapes
        for (let n = 0; n < 6; n++) { c.fillStyle = P[1 + (n % 3)]; c.globalAlpha = 0.85; c.beginPath(); c.arc(((n * 37 + k * 11) % w), ((n * 23 + k * 17) % h), 10 + ((n * 7 + k) % 22), 0, 7); c.fill(); }
        c.globalAlpha = 1;
      }
    });
    return Object.assign(std({ map: t, roughness: 0.8 }), { emissive: new THREE.Color(0xffffff), emissiveMap: t, emissiveIntensity: 0.28 });
  });
}

// The flat's plan (worked out once, so the corridor knows where the front door goes)
export function flatPlan(u) {
  const W = u.x1 - u.x0, D = u.z1 - u.z0;
  if (W >= 6 && D >= 7.5) {
    const LW = Math.min(3.4, Math.max(2.9, W * 0.44));
    const as = -W / 2 + LW;
    return { kind: 'one', W, D, as, door: as + 0.95, bb: Math.min(2.7, D * 0.3), hall: [as + 0.95, 1.4] };
  }
  const pod = W >= 4.6 && D >= 5;
  return { kind: 'studio', W, D, pod, door: pod ? -W / 2 + 2.9 : 0, hall: [pod ? -W / 2 + 2.9 : 0, 1.4] };
}

// ---------------------------------------------------------------- the flat itself
export function fitFlat(I, ctx, u, state, rng) {
  const { B, y, h, box, lightAt, F } = ctx, M = flatMats();
  const { W, D, s, at } = I.uf(u), P = u.plan;
  const wallM = M.wall(WALLS[Math.floor(rng() * WALLS.length)]);
  const occupied = state === 'home';
  // helpers in the flat's frame (a across, b in from the door; heights from the floor)
  const X = (wa, hh, wb, a, by, b, m, solid = false) => { const [x, z] = at(a, b); return box(wa, hh, wb, x, y + by, z, m, solid); };
  const face = { '+a': Math.PI / 2, '-a': -Math.PI / 2, '+b': s > 0 ? 0 : Math.PI, '-b': s > 0 ? Math.PI : 0 };
  const PL = (wa, hh, a, by, b, f, m) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(wa, hh), m); const [x, z] = at(a, b); p.position.set(x, y + by, z); p.rotation.y = face[f]; F.group.add(p); return p; };
  const CY = (r, hh, a, by, b, m, seg = 12, r2 = r) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, hh, seg), m); const [x, z] = at(a, b); c.position.set(x, y + by + hh / 2, z); F.group.add(c); return c; };
  const light = (a, b, sz = 0.9) => { const [x, z] = at(a, b); lightAt(x, z, sz, sz); };
  const WH = h - 0.3, PT = 0.12;
  const aw = -W / 2 + 0.08, ae = W / 2 - 0.08, bf = 0.08, bw = D - 0.02; // the inside faces of the flat's walls
  const yawTo = (da, db) => B.yaw + Math.atan2(da, db * s);
  const people = [];
  // a partition along b at a (with door gaps), or along a at b
  const wallB = (a, b0, b1, gaps = []) => {
    let at0 = b0;
    for (const [g0, g1] of [...gaps, [b1, b1]]) { if (g0 - at0 > 0.02) { X(PT, WH, g0 - at0, a, 0, (at0 + g0) / 2, wallM, true); X(PT + 0.03, 0.1, g0 - at0, a, 0, (at0 + g0) / 2, M.skirt); } if (g1 > g0) { X(PT, WH - 2.1, g1 - g0, a, 2.1, (g0 + g1) / 2, wallM); frame(a, g0, g1, 'b'); } at0 = g1; }
  };
  const wallA = (b, a0, a1, gaps = []) => {
    let at0 = a0;
    for (const [g0, g1] of [...gaps, [a1, a1]]) { if (g0 - at0 > 0.02) { X(g0 - at0, WH, PT, (at0 + g0) / 2, 0, b, wallM, true); X(g0 - at0, 0.1, PT + 0.03, (at0 + g0) / 2, 0, b, M.skirt); } if (g1 > g0) { X(g1 - g0, WH - 2.1, PT, (g0 + g1) / 2, 2.1, b, wallM); frame(b, g0, g1, 'a'); } at0 = g1; }
  };
  // a door frame (architrave) round an opening, and an open door leaf
  function frame(c, g0, g1, along) {
    if (along === 'b') { for (const g of [g0, g1]) X(PT + 0.05, 2.12, 0.06, c, 0, g, M.skirt); X(PT + 0.05, 0.07, g1 - g0 + 0.12, c, 2.1, (g0 + g1) / 2, M.skirt); const L = g1 - g0 - 0.04; X(L, 2.04, 0.04, c - PT / 2 - L / 2, 0, g0 + 0.04, M.white); X(0.05, 0.05, 0.08, c - PT / 2 - L + 0.08, 1.0, g0 + 0.08, M.steel); } // the door, open against the wall
    else { for (const g of [g0, g1]) X(0.06, 2.12, PT + 0.05, g, 0, c, M.skirt); X(g1 - g0 + 0.12, 0.07, PT + 0.05, (g0 + g1) / 2, 2.1, c, M.skirt); }
  }
  // skirting round the outside walls of the flat
  const dA = P.door;
  X(dA - 0.62 - aw, 0.1, 0.03, (aw + dA - 0.62) / 2, 0, bf, M.skirt); X(ae - dA - 0.62, 0.1, 0.03, (ae + dA + 0.62) / 2, 0, bf, M.skirt);
  X(ae - aw, 0.1, 0.03, 0, 0, bw, M.skirt);
  X(0.03, 0.1, D, aw, 0, D / 2, M.skirt); X(0.03, 0.1, D, ae, 0, D / 2, M.skirt);
  // and the painted walls (the party walls and the corridor wall are plain, so they take the flat's colour)
  PL(ae - aw, WH, (aw + ae) / 2, WH / 2, bf + 0.005, '+b', wallM);

  if (P.kind === 'one') {
    const as = P.as, bb = P.bb;
    const bathDoor = [0.75, 1.55], bedDoor = [bb + 0.35, bb + 1.25];
    wallB(as, bf, D, [bathDoor, bedDoor]);
    wallA(bb, aw, as - PT / 2);
    const rL = as + PT / 2; // the living side's left wall face
    // ---- the kitchen, along the right-hand wall by the door
    const kb1 = Math.min(D * 0.42, 4.1);
    kitchen(ae, 0.3, kb1);
    // ---- dining table
    const aT = (rL + ae - 0.62) / 2 + 0.1, bT = kb1 + 1.0;
    table(aT, bT, 0.8, 1.0);
    for (const sd of [-1, 1]) chair(aT + sd * 0.62, bT, sd > 0 ? '-a' : '+a');
    if (aT - rL > 1.4) chair(aT, bT + 0.75, '-b');
    light(aT, bT, 0.5);
    // ---- the living room at the window end
    const bL = Math.max(bT + 2.4, (kb1 + 1.9 + D) / 2);
    const sofaA = rL + 0.45;
    const sat = occupied && rng() < 0.6;
    sofa(sofaA, bL, '+a', !sat);
    if (sat) people.push({ at: at(sofaA + 0.1, bL + (rng() < 0.5 ? -0.45 : 0.45)), yaw: yawTo(1, 0), sit: true });
    tvUnit(ae, bL, '-a');
    X(0.55, 0.4, 1.0, (sofaA + ae - 0.42) / 2 + 0.1, 0, bL, M.walnut, true);
    X(0.5, 0.02, 0.6, (sofaA + ae - 0.42) / 2 + 0.1, 0.4, bL + 0.1, M.fabric[Math.floor(rng() * 7)]); // a magazine or two
    rug((sofaA + ae) / 2, bL, ae - sofaA - 0.3, 2.4);
    art(rL + 0.002, 1.55, bL, '+a', 1.3, 0.85);
    floorLamp(rL + 0.35, Math.min(D - 0.35, bL + 1.45));
    plant(ae - 0.4, D - 0.4, true);
    if (D - bL > 2.2) shelf(ae, bL + 1.6);
    light((rL + ae) / 2, bL, 1.1);
    // ---- the bedroom behind the partition
    const bBed = (bb + D) / 2 + 0.3;
    bed(aw, bBed);
    wardrobe(aw + 0.05, bb + PT / 2, Math.min(1.7, as - aw - 1.3));
    rug(aw + 2.5, bBed, 1.2, 2.0);
    art(aw + 0.002, 1.75, bBed, '+a', 1.2, 0.6);
    light((aw + as) / 2, bBed, 0.8);
    // ---- the bathroom by the door
    bathroom(aw, as - PT / 2, bf, bb - PT / 2, bathDoor);
    // somebody pottering about
    if (occupied && (!sat || rng() < 0.35)) people.push(rng() < 0.5 ? { at: at(ae - 1.05, (0.3 + kb1) / 2), yaw: yawTo(1, 0) } : { at: at(aT - 0.62, bT), yaw: yawTo(1, 0), sit: true });
  } else {
    // ---- a studio: a bathroom pod by the door, the kitchen along the right, bed by the window
    let a0 = aw;
    if (P.pod) { const pw = 2.2, pd = 2.0; wallB(aw + pw, bf, bf + pd, [[0.35, 1.15]]); wallA(bf + pd, aw, aw + pw + PT / 2); bathroom(aw, aw + pw - PT / 2, bf, bf + pd - PT / 2, [0.35, 1.15], true); a0 = aw; }
    const kb1 = Math.min(D * 0.45, 3.2);
    kitchen(ae, 0.3, kb1);
    const bedW = W >= 5 ? 1.4 : 1.0;
    // the bed along the window wall, in the left corner
    const bBed = D - 1.1;
    bedAlong(a0 + bedW / 2 + 0.05, bBed, bedW);
    if (W > 4) { tvUnit(ae, Math.max(kb1 + 1.4, D - 1.2), '-a', 1.2); }
    const sofaB = Math.max((P.pod ? 2.2 : 0.6) + 1.3, D * 0.5);
    const sat = occupied && rng() < 0.6;
    if (W > 4) { sofa(a0 + 0.45, sofaB, '+a', !sat, 1.6); if (sat) people.push({ at: at(a0 + 0.55, sofaB), yaw: yawTo(1, 0), sit: true }); }
    if (W > 4.4) table((a0 + ae) / 2 + 0.2, sofaB, 0.6, 0.6);
    art(a0 + 0.002, 1.6, sofaB, '+a', 1.0, 0.7);
    plant(ae - 0.4, D - 0.4, true);
    light(0, D / 2, 1.1);
    if (occupied && !sat) people.push({ at: at(ae - 1.0, (0.3 + kb1) / 2), yaw: yawTo(1, 0) });
  }
  // ---- the people at home
  for (const p of people) {
    const [x, z] = p.at;
    I.person(F, B, B.k.world(x, y, z), p.yaw, null, !!p.sit);
  }
  return { bedSpot: ctx.bedSpot };

  // ================================================================ furniture
  function kitchen(aR, b0, b1) {
    const kA = aR - 0.31, front = aR - 0.62;
    // the fridge
    X(0.64, 1.95, 0.72, kA, 0, b0 + 0.36, M.steel, true);
    X(0.01, 0.02, 0.68, front - 0.005, 1.25, b0 + 0.36, M.dark);
    X(0.04, 0.45, 0.04, front - 0.03, 1.4, b0 + 0.66, M.dark); X(0.04, 0.6, 0.04, front - 0.03, 0.5, b0 + 0.66, M.dark);
    // the run of units: cupboards, worktop, sink and hob
    const c0 = b0 + 0.74, L = b1 - c0, mid = (c0 + b1) / 2;
    if (L < 0.8) return;
    X(0.6, 0.08, L, kA + 0.03, 0, mid, M.dark);
    X(0.6, 0.8, L, kA, 0.08, mid, M.gloss, true);
    for (let b = c0; b <= b1 + 0.01; b += L / Math.max(1, Math.round(L / 0.6))) X(0.01, 0.76, 0.012, front - 0.005, 0.1, b, M.dark);
    for (let b = c0 + 0.3; b < b1; b += L / Math.max(1, Math.round(L / 0.6))) X(0.03, 0.02, 0.16, front - 0.02, 0.78, b, M.steel);
    X(0.64, 0.04, L, kA - 0.01, 0.88, mid, M.stone);
    PL(L, 0.62, aR - 0.002, 1.23, mid, '-a', M.tile); // the splashback
    const sb = c0 + Math.min(0.55, L * 0.3);
    X(0.42, 0.02, 0.5, kA, 0.915, sb, M.steel); X(0.34, 0.025, 0.42, kA, 0.92, sb, M.dark);
    X(0.03, 0.32, 0.03, aR - 0.1, 0.92, sb, M.steel); X(0.2, 0.03, 0.03, aR - 0.19, 1.22, sb, M.steel);
    if (L > 1.4) {
      const hb = b1 - 0.45;
      X(0.52, 0.012, 0.58, kA, 0.92, hb, M.black);
      for (const [da, db] of [[-0.12, -0.14], [-0.12, 0.14], [0.12, -0.14], [0.12, 0.14]]) CY(0.075, 0.006, kA + da, 0.932, hb + db, M.dark, 16);
      X(0.01, 0.5, 0.56, front - 0.005, 0.22, hb, M.black); X(0.03, 0.03, 0.4, front - 0.03, 0.66, hb, M.steel);
      X(0.48, 0.14, 0.62, aR - 0.25, 1.55, hb, M.steel); // the extractor
      if (L > 2) X(0.35, 0.7, hb - 0.32 - c0, aR - 0.175, 1.5, (c0 + hb - 0.32) / 2, M.gloss); // wall cupboards
      if (b1 - hb > 0.4) X(0.35, 0.7, b1 - (hb + 0.32), aR - 0.175, 1.5, (hb + 0.32 + b1) / 2, M.gloss);
    }
    // a kettle, a bowl of fruit
    CY(0.08, 0.2, kA + 0.05, 0.92, c0 + L * 0.7, M.white, 10);
    CY(0.14, 0.07, kA, 0.92, mid + 0.1, M.walnut, 12, 0.08);
  }
  function table(a, b, wa, wb) {
    X(wa, 0.04, wb, a, 0.72, b, M.oakSolid, true);
    for (const [da, db] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) X(0.05, 0.72, 0.05, a + da * (wa / 2 - 0.06), 0, b + db * (wb / 2 - 0.06), M.walnut);
  }
  function chair(a, b, facing) {
    X(0.42, 0.04, 0.42, a, 0.44, b, M.oakSolid);
    for (const [da, db] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) X(0.04, 0.44, 0.04, a + da * 0.18, 0, b + db * 0.18, M.walnut);
    const back = { '+a': [-0.19, 0], '-a': [0.19, 0], '+b': [0, -0.19], '-b': [0, 0.19] }[facing];
    X(back[0] ? 0.04 : 0.42, 0.45, back[0] ? 0.42 : 0.04, a + back[0], 0.48, b + back[1], M.walnut);
  }
  function sofa(a, b, facing, solidSeat, len = 2.0) {
    const fab = M.fabric[Math.floor(rng() * M.fabric.length)];
    const dir = facing === '+a' ? 1 : -1;
    X(0.85, 0.24, len, a, 0.08, b, fab, solidSeat);
    X(0.85, 0.05, len, a, 0, b, M.walnut);
    X(0.22, 0.78, len, a - dir * 0.32, 0, b, fab, true); // the back
    for (const sd of [-1, 1]) X(0.85, 0.58, 0.18, a, 0, b + sd * (len / 2 - 0.09), fab, true); // the arms
    const n = len > 1.7 ? 2 : 1;
    for (let k = 0; k < n; k++) { const cb = b - len / 2 + 0.18 + ((len - 0.36) * (k + 0.5)) / n; X(0.6, 0.12, (len - 0.36) / n - 0.03, a + dir * 0.06, 0.32, cb, fab); X(0.14, 0.42, (len - 0.36) / n - 0.05, a - dir * 0.15, 0.4, cb, fab); }
    X(0.12, 0.3, 0.35, a - dir * 0.12, 0.45, b + len / 2 - 0.4, M.duvet[Math.floor(rng() * M.duvet.length)]); // a cushion
  }
  function tvUnit(aR, b, f, len = 1.7) {
    X(0.42, 0.48, len, aR - 0.21, 0, b, M.walnut, true);
    X(0.01, 0.36, len - 0.1, aR - 0.425, 0.06, b, M.dark);
    X(0.05, 0.6, 1.1, aR - 0.12, 0.62, b, M.black); X(0.12, 0.14, 0.3, aR - 0.15, 0.48, b, M.black);
    PL(1.02, 0.52, aR - 0.152, 0.92, b, f, occupied ? M.screenOn : M.screen);
    CY(0.06, 0.25, aR - 0.25, 0.48, b + len / 2 - 0.2, M.plant2, 8); // a little plant on it
  }
  function rug(a, b, wa, wb) { const r = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.8, wa), Math.max(0.8, wb)), M.rug[Math.floor(rng() * M.rug.length)]); const [x, z] = at(a, b); r.rotation.x = -Math.PI / 2; r.position.set(x, y + 0.015, z); F.group.add(r); }
  function art(a, by, b, f, wa, hh) {
    const off = f === '+a' ? 1 : f === '-a' ? -1 : 0;
    X(off ? 0.03 : wa + 0.08, hh + 0.08, off ? wa + 0.08 : 0.03, a + off * 0.07, by - hh / 2 - 0.04, b, M.walnut);
    PL(wa, hh, a + off * 0.09, by, b, f, artMat(Math.floor(rng() * 8)));
  }
  function floorLamp(a, b) { CY(0.16, 0.03, a, 0, b, M.dark, 12); CY(0.02, 1.5, a, 0.03, b, M.dark, 6); CY(0.17, 0.3, a, 1.45, b, M.shade, 14, 0.22); }
  function plant(a, b, big) { CY(0.2, 0.4, a, 0, b, rng() < 0.5 ? M.pot : M.potW, 10, 0.16); const p = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.42 : 0.28, 8, 6), M.plant); const [x, z] = at(a, b); p.position.set(x, y + (big ? 0.85 : 0.6), z); p.scale.y = 1.3; F.group.add(p); }
  function shelf(aR, b) { X(0.35, 1.8, 0.9, aR - 0.175, 0, b, M.walnut, true); PL(0.82, 1.6, aR - 0.352, 0.95, b, '-a', M.books); }
  function bed(aW, b) {
    const L = 2.05, Wd = 1.6, ac = aW + L / 2, duv = M.duvet[Math.floor(rng() * M.duvet.length)];
    X(L, 0.3, Wd + 0.06, ac, 0, b, M.oakSolid, true);
    X(L - 0.08, 0.22, Wd - 0.04, ac + 0.02, 0.3, b, M.mattress);
    X(L * 0.68, 0.08, Wd + 0.02, ac + L * 0.16, 0.5, b, duv);
    X(0.12, 0.06, Wd + 0.02, ac - L * 0.18 + 0.06, 0.52, b, duv);
    for (const sd of [-1, 1]) X(0.38, 0.12, 0.62, aW + 0.32, 0.52, b + sd * 0.38, M.pillow);
    X(0.08, 1.15, Wd + 0.2, aW + 0.04, 0, b, M.fabric[Math.floor(rng() * M.fabric.length)]); // the headboard
    for (const sd of [-1, 1]) {
      const nb = b + sd * (Wd / 2 + 0.33);
      X(0.42, 0.5, 0.42, aW + 0.23, 0, nb, M.walnut, true);
      CY(0.06, 0.25, aW + 0.23, 0.5, nb, M.white, 8); CY(0.12, 0.18, aW + 0.23, 0.75, nb, M.shade, 12, 0.15);
    }
    ctx.bedSpot = { at: B.k.world(...xz(aW + L + 0.6, b, y)), bed: B.k.world(...xz(ac, b, y)) };
  }
  function bedAlong(a, b, wd) { // a bed with its head against the window wall
    const L = 2.0, duv = M.duvet[Math.floor(rng() * M.duvet.length)];
    X(wd + 0.06, 0.3, L, a, 0, b, M.oakSolid, true);
    X(wd - 0.04, 0.22, L - 0.08, a, 0.3, b - 0.02, M.mattress);
    X(wd + 0.02, 0.08, L * 0.68, a, 0.5, b - L * 0.16, duv);
    X(wd - 0.2, 0.12, 0.38, a, 0.52, b + L / 2 - 0.3, M.pillow);
    X(wd + 0.2, 1.0, 0.08, a, 0, D - 0.06, M.fabric[Math.floor(rng() * M.fabric.length)]);
    ctx.bedSpot = { at: B.k.world(...xz(a + wd / 2 + 0.6, b, y)), bed: B.k.world(...xz(a, b, y)) };
  }
  function xz(a, b, yy) { const [x, z] = at(a, b); return [x, yy, z]; }
  function wardrobe(aW, bWall, len) {
    if (len < 0.9) return;
    const ac = aW + len / 2, bc = bWall + 0.31;
    X(len, 2.1, 0.6, ac, 0, bc, M.gloss, true);
    X(0.012, 2.0, 0.01, ac, 0.05, bc + 0.305, M.dark);
    for (const sd of [-1, 1]) X(0.03, 0.4, 0.03, ac + sd * 0.08, 0.9, bc + 0.32, M.steel);
  }
  function bathroom(a0, a1, b0, b1, door, small = false) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0, b1 - b0), M.floorTile); const [fx, fz] = at((a0 + a1) / 2, (b0 + b1) / 2); fl.rotation.x = -Math.PI / 2; fl.position.set(fx, y + 0.02, fz); F.group.add(fl);
    // tiles to head height, round all four walls (not over the doorway)
    const TH = 2.0;
    PL(b1 - b0, TH, a0 + 0.005, TH / 2, (b0 + b1) / 2, '+a', M.tile);
    PL(a1 - a0, TH, (a0 + a1) / 2, TH / 2, b0 + 0.006, '+b', M.tile);
    PL(a1 - a0, TH, (a0 + a1) / 2, TH / 2, b1 - 0.005, '-b', M.tile);
    if (door[0] - b0 > 0.05) PL(door[0] - b0, TH, a1 - 0.005, TH / 2, (b0 + door[0]) / 2, '-a', M.tile);
    if (b1 - door[1] > 0.05) PL(b1 - door[1], TH, a1 - 0.005, TH / 2, (door[1] + b1) / 2, '-a', M.tile);
    // the loo against the outside wall
    const tb = small ? b1 - 0.4 : b0 + 0.55;
    X(0.4, 0.4, 0.36, a0 + 0.45, 0, tb, M.white, true); X(0.5, 0.05, 0.42, a0 + 0.47, 0.4, tb, M.white); X(0.18, 0.45, 0.44, a0 + 0.09, 0.4, tb, M.white);
    // the basin and the mirror
    const va = small ? a0 + 1.2 : a0 + 1.45, vb = b0 + 0.26;
    if (!small || a1 - a0 > 1.8) {
      X(0.8, 0.78, 0.48, va, 0, vb, M.walnut, true); X(0.84, 0.05, 0.52, va, 0.78, vb, M.stoneLight);
      CY(0.2, 0.06, va, 0.8, vb + 0.03, M.white, 14, 0.16); X(0.03, 0.22, 0.03, va, 0.83, b0 + 0.06, M.steel);
      PL(0.72, 0.85, va, 1.5, b0 + 0.012, '+b', M.mirror); X(0.76, 0.03, 0.12, va, 1.95, b0 + 0.06, M.bulb);
    }
    // the shower in the far corner
    if (!small) {
      const sa = a0 + 0.5, sb = b1 - 0.5;
      X(0.98, 0.06, 0.98, sa, 0, sb, M.white, true);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.95, 0.02), M.glass); const [gx, gz] = at(sa, b1 - 1.0); gl.position.set(gx, y + 1.03, gz); gl.userData.keep = true; F.group.add(gl);
      X(0.03, 0.03, 0.3, a0 + 0.05, 1.95, sb, M.steel); CY(0.1, 0.03, a0 + 0.2, 1.92, sb, M.steel, 12);
      X(0.04, 0.5, 0.6, a1 - 0.03, 1.0, (door[1] + b1) / 2 - 0.1, M.steel); X(0.06, 0.5, 0.5, a1 - 0.06, 0.6, (door[1] + b1) / 2 - 0.1, M.duvet[0]); // a towel on its rail
    }
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), M.rug[4]); const [rx, rz] = at((a0 + a1) / 2 + 0.2, (b0 + b1) / 2 + 0.2); r.rotation.x = -Math.PI / 2; r.position.set(rx, y + 0.025, rz); F.group.add(r);
    light((a0 + a1) / 2, (b0 + b1) / 2, 0.5);
  }
}

// the lobby of a block of flats (the front half of its ground floor: the flats are behind)
export function fitLobby(I, ctx, x0, x1, z0, z1, doorX) {
  const { B, y, box, F, rng } = ctx, M = flatMats();
  const PLz = (w, hh, x, by, z, rot, m) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), m); p.position.set(x, y + by, z); p.rotation.y = rot; F.group.add(p); };
  const CYl = (r, hh, x, by, z, m, r2 = r) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, hh, 12), m); c.position.set(x, y + by + hh / 2, z); F.group.add(c); };
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), MATS.floor('tile')); fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, y + 0.035, (z0 + z1) / 2); F.group.add(fl);
  // a seating corner on the far side from the door: two sofas facing over a rug and a low table
  const left = doorX > (x0 + x1) / 2, sx = left ? x0 + 3.2 : x1 - 3.2, sz = (z0 + z1) / 2;
  const fab = M.fabric[Math.floor(rng() * M.fabric.length)];
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.4), M.rug[Math.floor(rng() * M.rug.length)]); rug.rotation.x = -Math.PI / 2; rug.position.set(sx, y + 0.045, sz); F.group.add(rug);
  for (const sd of [-1, 1]) {
    const z = sz + sd * 1.35;
    box(2.2, 0.42, 0.85, sx, y, z, fab, true); box(2.2, 0.8, 0.22, sx, y, z + sd * 0.32, fab, true);
    for (const e of [-1, 1]) box(0.18, 0.58, 0.85, sx + e * 1.09, y, z, fab);
  }
  box(1.2, 0.4, 0.7, sx, y, sz, M.walnut, true);
  CYl(0.15, 0.3, sx + 0.3, 0.4, sz, M.white);
  // plants in the corners, pictures on the side wall
  for (const [px, pz] of [[x0 + 0.6, z1 - 0.6], [x1 - 0.6, z1 - 0.6], [x0 + 0.6, z0 + 0.6], [x1 - 0.6, z0 + 0.6]]) {
    CYl(0.3, 0.55, px, 0, pz, M.potW, 0.24);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), M.plant); p.position.set(px, y + 1.2, pz); p.scale.y = 1.5; F.group.add(p);
  }
  const wx = left ? x0 + 0.02 : x1 - 0.02, rot = left ? Math.PI / 2 : -Math.PI / 2;
  for (const dz of [-1.4, 1.4]) { box(0.03, 1.1, 1.5, wx + (left ? 0.02 : -0.02), y + 1.25, sz + dz, M.walnut); PLz(1.4, 1.0, wx + (left ? 0.04 : -0.04), 1.8, sz + dz, rot, artMat(Math.floor(rng() * 8))); }
  // the post boxes on the other side wall, and a console table under them
  const mx = left ? x1 - 0.03 : x0 + 0.03, mr = left ? -Math.PI / 2 : Math.PI / 2;
  if (Math.abs(doorX - mx) > 3) {
    box(0.08, 1.0, 2.4, mx + (left ? -0.04 : 0.04), y + 1.0, sz, M.walnut);
    PLz(2.3, 0.9, mx + (left ? -0.085 : 0.085), 1.5, sz, mr, M.mail);
    box(0.45, 0.8, 1.6, mx + (left ? -0.25 : 0.25), y, sz + 2.2, M.walnut, true);
  }
  // a pendant light over the seats
  CYl(0.01, 1.2, sx, 3.0, sz, M.dark); CYl(0.35, 0.3, sx, 2.7, sz, M.shade, 0.5);
}

// knocking: if somebody's in they come to the door (it opens for a bit and they have a word)
export const KNOCK = {
  home: ['"Oh! Hi. Can I help you?"', '"If you\'re selling something, no thanks."', '"Are you the plumber? You\'re late."', '"Shh, the baby\'s asleep."', '"Wrong flat, mate."', '"Hello? …Do I know you?"'],
};

// ---------------------------------------------------------------- the corner shop
// Fridges of drinks along the back wall, shelving round the side wall, aisles of double-sided
// shelves down the middle, a freezer and a magazine rack by the stairs, and the counter by the
// door with the till, the sweets and the cigarettes behind.
export function fitStore(I, ctx, area, door) {
  const { B, y, box, F, rng } = ctx, M = flatMats();
  const { x0, x1, z0, z1, sx0 } = area; // the shop floor (x0..x1, z0 back .. z1 front); sx0: where the stairs end on the left
  const prod = once('prod', () => [0xc8201e, 0x2a6ac8, 0xe8b830, 0x3aa760, 0xf2f2ee, 0x8a4ad8, 0xe86a2a, 0x2ab8c8, 0x5a3a24, 0xe84a8a].map((c) => Object.assign(std({ color: c, roughness: 0.5 }), { emissive: new THREE.Color(c), emissiveIntensity: 0.25 })));
  const shelfM = once('shelfM', () => Object.assign(std({ color: 0xe8e8e4, roughness: 0.5 }), { emissive: new THREE.Color(0xe8e8e4), emissiveIntensity: 0.25 }));
  const baseM = once('baseM', () => Object.assign(std({ color: 0x2a5a8a, roughness: 0.6 }), { emissive: new THREE.Color(0x2a5a8a), emissiveIntensity: 0.2 }));
  const fridgeIn = once('fridgeIn', () => new THREE.MeshBasicMaterial({ color: 0xe8f4ff }));
  const P = () => prod[Math.floor(rng() * prod.length)];
  // a row of goods on a shelf from (ax, az) to (bx, bz), facing outwards along n
  const goods = (xa, xb, z, by, along = 'x', depth = 0.3) => {
    const len = Math.abs(xb - xa); let t = 0.05;
    while (t < len - 0.12) { const w = 0.12 + rng() * 0.16, hh = 0.14 + rng() * 0.2; if (rng() < 0.9) { const c = Math.min(xa, xb) + t + w / 2; if (along === 'x') box(w, hh, depth, c, y + by, z, P()); else box(depth, hh, w, z, y + by, c, P()); } t += w + 0.02; }
  };
  // a double-sided aisle shelf running front to back
  const gondola = (x, za, zb) => {
    const L = zb - za, zc = (za + zb) / 2;
    box(1.0, 0.12, L, x, y, zc, baseM, true);
    box(0.06, 1.75, L, x, y + 0.12, zc, shelfM, true);
    for (const h of [0.12, 0.55, 0.95, 1.35]) { box(1.0, 0.03, L, x, y + h, zc, shelfM); for (const sd of [-1, 1]) goods(za, zb, x + sd * 0.27, h + 0.03, 'z', 0.38); }
    for (const zz of [za, zb]) box(1.04, 1.9, 0.04, x, y, zz, baseM); // end panels
    box(1.04, 0.3, 0.04, x, y + 1.95, zb + 0.02, prod[Math.floor(rng() * 4)]); // an aisle header
  };
  // the side-wall shelving (against x1)
  const wallShelf = (za, zb) => {
    const L = zb - za, zc = (za + zb) / 2, xw = x1 - 0.25;
    box(0.5, 0.12, L, xw, y, zc, baseM, true); box(0.04, 2.0, L, x1 - 0.03, y, zc, shelfM, true);
    for (const h of [0.12, 0.55, 0.95, 1.35, 1.75]) { box(0.5, 0.03, L, xw, y + h, zc, shelfM); goods(za, zb, xw, h + 0.03, 'z', 0.36); }
  };
  // the fridges along the back wall
  const fx0 = sx0 + 0.6, fx1 = x1 - 1.2;
  for (let x = fx0; x + 1.2 <= fx1; x += 1.25) {
    box(1.2, 2.1, 0.75, x + 0.6, y, z0 + 0.38, M.steel, true);
    box(1.05, 1.75, 0.02, x + 0.6, y + 0.2, z0 + 0.74, fridgeIn);
    for (const h of [0.3, 0.7, 1.1, 1.5]) for (let k = 0; k < 6; k++) box(0.1, 0.24, 0.1, x + 0.18 + k * 0.17, y + h, z0 + 0.6, P());
    box(1.12, 1.85, 0.03, x + 0.6, y + 0.16, z0 + 0.77, M.glass).userData.keep = true;
    box(0.04, 0.8, 0.04, x + 1.1, y + 0.7, z0 + 0.8, M.steel);
    box(1.2, 0.25, 0.04, x + 0.6, y + 2.1, z0 + 0.76, M.red);
  }
  // shelving down the side wall, aisles in the middle
  const counterZ = z1 - 3.4;
  wallShelf(z0 + 1.6, counterZ - 1.0);
  const ax0 = sx0 + 2.2, ax1 = x1 - 2.2;
  const n = Math.max(1, Math.floor((ax1 - ax0) / 2.6));
  for (let i = 0; i < n; i++) { const x = ax0 + ((ax1 - ax0) * (i + 0.5)) / n; if (Math.abs(x - door.x) < 1.6 && n > 1) continue; gondola(x, z0 + 2.4, counterZ - 2.0); }
  // the counter: a run from the door towards the side wall, the till on it, cigarettes behind
  const cx0 = door.x + 1.6, cx1 = Math.min(x1 - 0.6, door.x + 5.6);
  if (cx1 - cx0 > 1.5) {
    const cc = (cx0 + cx1) / 2;
    box(cx1 - cx0, 1.0, 0.7, cc, y, counterZ, M.walnut, true); box(cx1 - cx0 + 0.06, 0.05, 0.8, cc, y + 1.0, counterZ, M.stoneLight);
    box(0.4, 0.25, 0.35, cx0 + 0.6, y + 1.05, counterZ, M.black); box(0.3, 0.2, 0.04, cx0 + 0.6, y + 1.3, counterZ + 0.1, M.screenOn); // the till
    box(0.5, 0.35, 0.3, cx0 + 1.4, y + 1.05, counterZ + 0.15, P()); // a sweets rack
    box(cx1 - cx0, 1.4, 0.35, cc, y + 1.0, counterZ - 1.5, M.walnut, true); // the cigarettes behind
    goods(cx0 + 0.1, cx1 - 0.1, counterZ - 1.38, 1.1, 'x', 0.1); goods(cx0 + 0.1, cx1 - 0.1, counterZ - 1.38, 1.55, 'x', 0.1);
    F.spots.push({ kind: 'till', at: B.k.world(cx0 + 0.6, y, counterZ + 1.0) });
    I.person(F, B, B.k.world(cx0 + 0.6, y, counterZ - 0.75), B.yaw, { shirt: 0x2f6f4a, pants: 0x1d1f22 });
  }
  // by the stairs: an ice-cream freezer and a newspaper rack; a mat at the door, a sign over it
  if (door.x - sx0 > 3) {
    box(1.6, 0.85, 0.8, sx0 + 1.2, y, z1 - 2.2, M.white, true); box(1.5, 0.02, 0.7, sx0 + 1.2, y + 0.86, z1 - 2.2, M.glass).userData.keep = true;
    for (let k = 0; k < 8; k++) box(0.15, 0.08, 0.2, sx0 + 0.6 + (k % 4) * 0.36, y + 0.78, z1 - 2.4 + Math.floor(k / 4) * 0.35, P());
    box(1.0, 1.2, 0.4, sx0 + 1.0, y, z1 - 4.0, M.walnut, true);
    for (const h of [0.4, 0.8]) goods(sx0 + 0.55, sx0 + 1.45, z1 - 3.85, h, 'x', 0.05);
  }
  // ceiling lights in rows over the aisles
  for (let x = sx0 + 2; x < x1 - 1; x += 3) for (let z = z0 + 2; z < z1 - 1; z += 3.2) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.3), M.bulb); l.position.set(x, y + 4.15, z); F.group.add(l); }
}
