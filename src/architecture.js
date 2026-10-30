import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, speckle, std, sign } from './buildkit.js';

// City architecture: brick walk-ups with shopfronts, glass office towers on stone podiums,
// concrete apartment blocks with balconies, and ground floors you can walk into.
// Every building is built in its own local frame with the main street front facing local +Z.

export const FLOOR = 3.5; // storey height (one facade tile)
export const GROUND = 4.5; // ground floor height

const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- textures (one tile = one 4 m bay, one storey)
function glassFill(g, x, y, w, h, lit) {
  const grd = g.createLinearGradient(x, y, x + w, y + h);
  grd.addColorStop(0, lit ? '#a8875a' : '#3d566a');
  grd.addColorStop(0.6, lit ? '#5e4a33' : '#22323f');
  grd.addColorStop(1, lit ? '#8f7349' : '#4c6577');
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  { g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(x, y + h * 0.7); g.lineTo(x + w * 0.5, y); g.lineTo(x + w * 0.7, y); g.lineTo(x, y + h); g.fill(); }
}

function bricks(g, w, h, base) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 6) {
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, w, 1);
    for (let x = (y / 6) % 2 ? 0 : 6; x < w; x += 12) {
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x, y, 1, 6);
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`; g.fillRect(x + 1, y + 1, 11, 5);
    }
  }
}

export function brickTex(base, trim, variant, windows = true) {
  return cached(`brick|${base}|${trim}|${variant}|${windows}`, () => canvasTex(128, 112, (g, w, h) => {
    bricks(g, w, h, base);
    if (!windows) return;
    g.fillStyle = trim; g.fillRect(34, 18, 60, 74); // frame
    g.fillRect(30, 90, 68, 6); // sill
    g.fillStyle = trim; g.fillRect(32, 12, 64, 8); // lintel
    glassFill(g, 39, 23, 50, 64, Math.random() < 0.25);
    g.fillStyle = trim; g.fillRect(62, 23, 4, 64); g.fillRect(39, 52, 50, 3);
  }));
}

export function concreteTex(base, variant) {
  return cached(`conc|${base}|${variant}`, () => canvasTex(128, 112, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h); speckle(g, w, h, 400, 0.06);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 2, h);
    glassFill(g, 12, 24, 104, 58, Math.random() < 0.3);
    g.fillStyle = '#d8d8d4'; g.fillRect(62, 24, 4, 58); g.fillRect(12, 24, 104, 3); g.fillRect(12, 80, 104, 3);
  }));
}

export function curtainTex(tint, variant) {
  return cached(`glass|${tint}|${variant}`, () => canvasTex(128, 112, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, tint); grd.addColorStop(0.5, '#1b2a36'); grd.addColorStop(1, tint);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) if (Math.random() < 0.2) { g.fillStyle = 'rgba(255,225,160,0.35)'; g.fillRect(i * 32 + 2, 16, 28, h - 18); }
    g.fillStyle = '#9aa6af';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h);
    g.fillStyle = '#2a3036'; g.fillRect(0, 0, w, 14);
    g.fillStyle = '#9aa6af'; g.fillRect(0, 14, w, 2);
  }));
}

export function stoneTex(base) {
  return cached(`stone|${base}`, () => canvasTex(128, 112, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h); speckle(g, w, h, 500, 0.06);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    for (let y = 0; y < h; y += 28) { g.fillRect(0, y, w, 2); for (let x = (y / 28) % 2 ? 0 : 32; x < w; x += 64) g.fillRect(x, y, 2, 28); }
  }));
}

// Shopfront: one tile is 8 m wide by the whole ground floor.
export function shopfrontTex(frame, variant) {
  return cached(`shop|${frame}|${variant}`, () => canvasTex(256, 144, (g, w, h) => {
    g.fillStyle = frame; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, 30); // fascia
    const lit = variant % 3 !== 2;
    glassFill(g, 14, 40, 228, 96, lit);
    if (lit) {
      g.fillStyle = 'rgba(30,22,14,0.55)'; for (const y of [92, 116]) g.fillRect(18, y, 220, 4); // shelves inside
      for (let i = 0; i < 26; i++) { g.fillStyle = `hsla(${Math.random() * 360},40%,${30 + Math.random() * 25}%,0.8)`; g.fillRect(20 + Math.random() * 214, (Math.random() < 0.5 ? 82 : 106) + Math.random() * 4, 4 + Math.random() * 7, 6 + Math.random() * 4); }
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.moveTo(40, 136); g.lineTo(120, 40); g.lineTo(150, 40); g.lineTo(70, 136); g.fill();
    }
    g.fillStyle = frame;
    g.fillRect(0, 36, w, 6); g.fillRect(126, 40, 5, 96);
    if (variant % 2) { g.fillStyle = '#2a2420'; g.fillRect(100, 52, 56, 92); glassFill(g, 106, 58, 44, 50, lit); }
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 136, w, 8);
  }));
}

const roofTex = () => cached('roof', () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#5f6266'; g.fillRect(0, 0, w, h); speckle(g, w, h, 600, 0.12); }));
const tileTex = (a, b) => cached(`tile|${a}|${b}`, () => canvasTex(64, 64, (g) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 16, j * 16, 16, 16); } }));
const woodTex = () => cached('wood', () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#8a6440'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, y, w, 1); } speckle(g, w, h, 200, 0.08); }));

const matCache = new Map();
// Shared materials (same look -> same material, which keeps merging and the GPU happy).
export function mat(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
const M = {
  roof: () => mat('roof', () => std({ map: roofTex() })),
  plaster: (c = 0xe9e4da) => mat(`plaster${c}`, () => std({ color: c })),
  dark: () => mat('dark', () => std({ color: 0x2a2c30, roughness: 0.6 })),
  metal: () => mat('metal', () => std({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.6 })),
  wood: () => mat('wood', () => std({ map: woodTex() })),
  glass: () => mat('glassClear', () => new THREE.MeshStandardMaterial({ color: 0x9fc3d8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false })),
  light: () => mat('ceilLight', () => std({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.2 })),
  tex: (t, extra = {}) => mat(`t|${t.uuid}|${JSON.stringify(extra)}`, () => std({ map: t, ...extra })),
  // the inside face of an outside wall: plaster with the window it looks out of (lit by daylight)
  innerWin: (glass = false) => mat(`innerWin${glass}`, () => { const t = innerWinTex(glass); return std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.8 }); }),
  inner: (c = 0xe9e4da) => mat(`inner${c}`, () => std({ color: c, emissive: c, emissiveIntensity: 0.3 })),
  floor: (kind) => mat(`floorIn|${kind}`, () => { const map = kind === 'tile' ? tileTex('#d6d1c8', '#bfb9af') : kind === 'carpet' ? carpetTex() : woodTex(); return std({ map, roughness: 0.6, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.2 }); }),
};
const innerWinTex = (glass) => cached(`innerWin|${glass}`, () => canvasTex(128, 112, (g, w, h) => {
  g.fillStyle = '#ece6da'; g.fillRect(0, 0, w, h);
  const [x0, y0, x1, y1] = glass ? [4, 14, 124, 108] : [30, 18, 98, 90];
  const grd = g.createLinearGradient(0, y0, 0, y1); grd.addColorStop(0, '#cfe6f6'); grd.addColorStop(1, '#9cc3dc');
  g.fillStyle = '#5a5e64'; g.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
  g.fillStyle = grd; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = '#5a5e64'; g.fillRect((x0 + x1) / 2 - 2, y0, 4, y1 - y0);
  if (!glass) { g.fillStyle = '#d8d0c0'; g.fillRect(x0 - 5, y1 + 2, x1 - x0 + 10, 5); } // sill
}));
const carpetTex = () => cached('carpet', () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#7a8088'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, 0.08); }));
export { M as MATS };

// Every building in the world with an inside (see insides.js, which fits them out as you go in).
export const BUILDINGS = [];
export const CORE = { w: 4.3, d: 7.3, run: 5 }; // the stairwell, in the back-left corner of every building
export const WALL = 0.3;

// Box with UVs scaled so a texture tile covers tw x th metres on the sides.
function boxUV(w, h, d, tw = 4, th = FLOOR) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    const side = f !== 2 && f !== 3;
    uv.setXY(k, (uv.getX(k) * dims[f][0]) / tw, (uv.getY(k) * dims[f][1]) / (side ? th : tw));
  }
  return g;
}

// ---------------------------------------------------------------- local-frame builder
class Kit {
  constructor(group, sb, x, y, z, yaw) {
    this.sb = sb;
    this.root = new THREE.Group();
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    group.add(this.root);
    this.root.updateMatrixWorld(true);
    this.q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.yaw = yaw;
  }
  world(x, y, z) { return this.root.localToWorld(new THREE.Vector3(x, y, z)); }
  // box standing on y (bottom at y), centred on x/z
  box(w, h, d, x, y, z, material, { collide = true, cast = true, uv = null, rotY = 0 } = {}) {
    const geo = uv ? boxUV(w, h, d, uv[0], uv[1]) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = cast; m.receiveShadow = true;
    this.root.add(m);
    if (collide) this.collider(w, h, d, x, y, z, rotY);
    return m;
  }
  collider(w, h, d, x, y, z, rotY = 0) {
    const p = this.world(x, y + h / 2, z);
    const q = rotY ? this.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)) : this.q;
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, p.y, p.z).setRotation(q));
  }
  cyl(r, h, x, y, z, material, { collide = false, seg = 10 } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    this.root.add(m);
    if (collide) {
      const p = this.world(x, y + h / 2, z);
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(h / 2, r).setTranslation(p.x, p.y, p.z));
    }
    return m;
  }
}

// Which way each local face points in the world, for a given yaw. Local faces: +z front, -z back, +x right, -x left.
const YAW = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };
const DIRS = ['s', 'e', 'n', 'w']; // clockwise order seen from above, starting at yaw 0
function faceDir(front, local) { // local: 'front' | 'right' | 'back' | 'left'
  const i = DIRS.indexOf(front);
  const k = { front: 0, right: 1, back: 2, left: 3 }[local];
  return DIRS[(i + k) % 4];
}

const BRICKS = [['#8e4a36', '#e8e0d0'], ['#a35a3c', '#f2ece0'], ['#6e3b2e', '#d9cdb8'], ['#b0794f', '#efe6d6'], ['#7c5a48', '#ece4d4'], ['#9b9187', '#ffffff']];
const CONCRETE = ['#cfcac0', '#bdb8ae', '#d8d2c6', '#a9aaa6', '#c9c0b0'];
const TINTS = ['#3f6f8f', '#4a7a7f', '#2f4f6f', '#5b7f96', '#3b5b5b'];
const FRAMES = ['#1f3b2e', '#2a2a2e', '#6b1f1f', '#1f2f4f', '#4b3a2a', '#3a3f45'];
const AWN = [0xb03a2e, 0x2e6fb0, 0x2f8a52, 0xd99b2b, 0x6a3fa0, 0x333333];
const SHOP_NAMES = ['DELI', 'BAKERY', 'PHARMACY', 'BOOKS', 'HARDWARE', 'FLOWERS', 'BARBER', 'CAFÉ', 'LAUNDRY', 'GROCER', 'TAILOR', 'NOODLES', 'PIZZA', 'OPTICIAN', 'TOYS', 'JEWELLER', 'RECORDS', 'TATTOO'];

// ---------------------------------------------------------------- buildings
// lot: { cx, cz, w (along local x), d (local z), y0, front: 's'|'n'|'e'|'w', streets: Set of world sides facing streets }
// opts: { type: 'brick'|'office'|'apartment'|'civic', floors, interior: null|'shop'|'diner'|'office'|'pawn'|'lobby', name, color }
export function cityBuilding(group, sb, lot, opts) {
  const { w, d, y0 } = lot;
  const k = new Kit(group, sb, lot.cx, y0, lot.cz, YAW[lot.front]);
  const type = opts.type;
  const floors = opts.floors;
  const out = { loot: [], door: null, inside: null, counter: null };
  const street = (local) => lot.streets.has(faceDir(lot.front, local));

  let wallT, plainT, upperExtra = {};
  if (type === 'brick') {
    const [b, t] = pick(BRICKS);
    wallT = brickTex(b, t, Math.floor(Math.random() * 3));
    plainT = brickTex(b, t, 0, false);
  } else if (type === 'apartment') {
    const c = pick(CONCRETE);
    wallT = concreteTex(c, Math.floor(Math.random() * 3));
    plainT = stoneTex(c);
  } else if (type === 'office') {
    wallT = curtainTex(pick(TINTS), Math.floor(Math.random() * 3));
    plainT = stoneTex('#c9c3b6');
    upperExtra = { roughness: 0.25, metalness: 0.35 };
  } else { // civic
    wallT = concreteTex(opts.color || '#e4ded2', 0);
    plainT = stoneTex(opts.color || '#e4ded2');
  }
  const wallM = M.tex(wallT, upperExtra);
  const plainM = M.tex(plainT);
  const roofM = M.roof();
  const shopM = M.tex(shopfrontTex(pick(FRAMES), Math.floor(Math.random() * 6)));
  const ceilM = M.plaster(0xd8d4cc);

  const T = WALL;
  const H = GROUND + floors * FLOOR;
  // the stairwell: the back-left corner, open from the ground to the roof (too small a building and
  // there's no going upstairs)
  const C = CORE;
  const core = w >= C.w + 7 && d >= C.d + 5 ? { x0: -w / 2 + T, x1: -w / 2 + T + C.w, z0: -d / 2 + T, z1: -d / 2 + T + C.d, hole: -d / 2 + T + C.run } : null;
  const storeGround = !opts.interior && type === 'brick' && street('front');
  const upper = type === 'office' || type === 'civic' ? 'offices' : type === 'apartment' ? 'apartments' : storeGround && floors >= 3 && Math.random() < 0.6 ? 'shops+apartments' : 'apartments';
  const B = { id: BUILDINGS.length, k, x: lot.cx, z: lot.cz, y0, yaw: YAW[lot.front], w, d, floors, H, type, name: opts.name || null, interior: opts.interior || null, core, upper, ground: opts.interior ? 'room' : storeGround ? 'store' : 'lobby', island: opts.island || null, room: null, style: Math.floor(Math.random() * 1e9) };
  BUILDINGS.push(B);
  out.building = B;
  const innerG = M.innerWin(false);
  // an outside wall: the facade on the outer face, plaster (with the windows) on the inner one
  // (box faces: +x, -x, +y, -y, +z, -z)
  const wallBox = (bw, bh, bd, x, y, z, outer, outerM, innerM = innerG, uv = [4, FLOOR], o = {}) => {
    const mats = [innerM, innerM, M.plaster(0xd8d4cc), M.plaster(0xd8d4cc), innerM, innerM];
    mats[outer] = outerM;
    // the front and back walls run the full width, so their ends are the building's corners: those
    // are outside too (in the plain finish, not the inside plaster)
    if (outer === 4 || outer === 5) mats[0] = mats[1] = plainM;
    return k.box(bw, bh, bd, x, y, z, mats, { uv, ...o });
  };
  const FRONT = 4, BACK = 5, RIGHT = 0, LEFT = 1;
  // ---- ground floor
  const fm = (local) => (street(local) && type !== 'civic' ? shopM : plainM);
  const DW = 2.4, DH = 3.0; // a front door
  const frontRun = (x0, x1, door) => { // the front wall from x0 to x1, with the door gap if it's in this run
    const segs = door != null && door > x0 && door < x1 ? [[x0, door - DW / 2], [door + DW / 2, x1]] : [[x0, x1]];
    for (const [a, c] of segs) if (c - a > 0.05) wallBox(c - a, GROUND, T, (a + c) / 2, 0, d / 2 - T / 2, FRONT, fm('front'), M.inner(), [8, GROUND]);
    if (door != null && door > x0 && door < x1) {
      wallBox(DW, GROUND - DH, T, door, DH, d / 2 - T / 2, FRONT, fm('front'), M.inner(), [8, GROUND]);
      for (const sx of [-1, 1]) k.box(0.18, DH, T + 0.08, door + sx * (DW / 2 + 0.09), 0, d / 2 - T / 2, M.dark(), { collide: false });
      k.box(DW + 0.36, 0.18, T + 0.08, door, DH, d / 2 - T / 2, M.dark(), { collide: false });
    }
  };
  if (opts.interior) {
    // a walk-in room at the front of the ground floor (a shop, a diner, a bank…); behind and round
    // it, the building's lobby and its stairs (through a door in the room's back wall)
    const rw = Math.min(w, 18), rd = Math.min(d, 15);
    const oz = d / 2 - rd / 2;
    const rp = k.world(0, 0, oz);
    const rk = new Kit(k.root.parent, k.sb, rp.x, rp.y, rp.z, YAW[lot.front]);
    Object.assign(out, interior(rk, rw, rd, opts.interior, plainM, { ...opts, backDoor: d - rd > 3 ? { x: 0 } : null }));
    B.room = { x0: -rw / 2, x1: rw / 2, z0: d / 2 - rd, z1: d / 2 };
    if (w > rw + 0.1) { frontRun(-w / 2, -rw / 2, null); frontRun(rw / 2, w / 2, null); }
    const sideTo = rw >= w - 0.1 ? d / 2 - rd : d / 2 - T;
    wallBox(T, GROUND, sideTo + d / 2 - T, w / 2 - T / 2, 0, (sideTo - d / 2 + T) / 2, RIGHT, fm('right'), M.inner(), [8, GROUND]);
    wallBox(T, GROUND, sideTo + d / 2 - T, -w / 2 + T / 2, 0, (sideTo - d / 2 + T) / 2, LEFT, fm('left'), M.inner(), [8, GROUND]);
  } else {
    frontRun(-w / 2, w / 2, core ? Math.max(core.x1 + 2, 0) : 0);
    wallBox(T, GROUND, d - 2 * T, w / 2 - T / 2, 0, 0, RIGHT, fm('right'), M.inner(), [8, GROUND]);
    wallBox(T, GROUND, d - 2 * T, -w / 2 + T / 2, 0, 0, LEFT, fm('left'), M.inner(), [8, GROUND]);
    B.door = k.world(core ? Math.max(core.x1 + 2, 0) : 0, 0, d / 2 + 1.2);
  }
  wallBox(w, GROUND, T, 0, 0, -d / 2 + T / 2, BACK, fm('back'), M.inner(), [8, GROUND]);
  // ---- upper floors: the outside walls, all the way up
  let top = GROUND;
  const ring = (y, h, outerM, innerM = innerG) => {
    wallBox(w, h, T, 0, y, d / 2 - T / 2, FRONT, outerM, innerM);
    wallBox(w, h, T, 0, y, -d / 2 + T / 2, BACK, outerM, innerM);
    wallBox(T, h, d - 2 * T, w / 2 - T / 2, y, 0, RIGHT, outerM, innerM);
    wallBox(T, h, d - 2 * T, -w / 2 + T / 2, y, 0, LEFT, outerM, innerM);
  };
  // a moulding round the outside of the walls (a ring, so it doesn't cut across the inside)
  const band = (out, bh, by, m) => {
    const t = out + 0.02;
    k.box(w + 2 * out, bh, t, 0, by, d / 2 + out - t / 2, m, { collide: false });
    k.box(w + 2 * out, bh, t, 0, by, -d / 2 - out + t / 2, m, { collide: false });
    k.box(t, bh, d, w / 2 + out - t / 2, by, 0, m, { collide: false });
    k.box(t, bh, d, -w / 2 - out + t / 2, by, 0, m, { collide: false });
  };
  if (floors > 0) {
    if (type === 'office') {
      // a stone podium for the lowest floors, then glass all the way up
      const podium = Math.min(2, floors);
      band(0.2, 0.5, GROUND, plainM);
      ring(GROUND, podium * FLOOR, plainM);
      if (floors > podium) ring(GROUND + podium * FLOOR, (floors - podium) * FLOOR, wallM, M.innerWin(true));
    } else ring(GROUND, floors * FLOOR, wallM);
  }
  top = H;
  // ---- floors (each with the stairwell open through it) and the roof
  const slab = (yTop, topM) => {
    const mats = [M.plaster(0xd8d4cc), M.plaster(0xd8d4cc), topM, M.inner(0xe8e4dc), M.plaster(0xd8d4cc), M.plaster(0xd8d4cc)];
    const iw = w - 2 * T + 0.02, id = d - 2 * T + 0.02;
    if (!core) { k.box(iw, 0.3, id, 0, yTop - 0.3, 0, mats, { cast: false }); return; }
    const ax0 = core.x1, ax1 = w / 2 - T;
    k.box(ax1 - ax0, 0.3, id, (ax0 + ax1) / 2, yTop - 0.3, 0, mats, { cast: false });
    k.box(core.x1 - (-w / 2 + T), 0.3, d / 2 - T - core.hole, (-w / 2 + T + core.x1) / 2, yTop - 0.3, (core.hole + d / 2 - T) / 2, mats, { cast: false });
  };
  const floorTop = type === 'office' || type === 'civic' ? M.floor('carpet') : M.floor('wood');
  for (let f = 1; f <= floors; f++) slab(GROUND + (f - 1) * FLOOR, floorTop);
  slab(H, roofM);
  // the roof: a parapet all round, and a little hut over the top of the stairs with a door out
  if (floors > 0 || core) {
    band(0.35, 0.55, top - 0.2, type === 'brick' ? M.plaster(0xe8e0d0) : plainM);
    k.box(w - 0.4, 1.0, 0.25, 0, top, d / 2 - 0.2, plainM);
    k.box(w - 0.4, 1.0, 0.25, 0, top, -d / 2 + 0.2, plainM);
    k.box(0.25, 1.0, d - 0.4, w / 2 - 0.2, top, 0, plainM);
    k.box(0.25, 1.0, d - 0.4, -w / 2 + 0.2, top, 0, plainM);
  }
  band(0.15, 0.35, GROUND - 0.1, plainM); // belt course over the shops
  if (core) {
    const hutM = M.plaster(0xcfc9bd), hx0 = -w / 2 + T, hx1 = core.x1 + 0.3, hz0 = -d / 2 + T, hz1 = core.z1 + 0.3, HH = 3;
    k.box(T, HH, hz1 - hz0, hx1 - T / 2, top, (hz0 + hz1) / 2, hutM);
    k.box(hx1 - hx0, HH, T, (hx0 + hx1) / 2, top, hz0 + T / 2, hutM);
    k.box(T, HH, hz1 - hz0, hx0 + T / 2, top, (hz0 + hz1) / 2, hutM);
    const dx0 = core.x0 + 1.2, dx1 = core.x0 + 3.1; // the door out onto the roof
    k.box(dx0 - hx0, HH, T, (hx0 + dx0) / 2, top, hz1 - T / 2, hutM);
    k.box(hx1 - dx1, HH, T, (dx1 + hx1) / 2, top, hz1 - T / 2, hutM);
    k.box(dx1 - dx0, HH - 2.3, T, (dx0 + dx1) / 2, top + 2.3, hz1 - T / 2, hutM);
    k.box(hx1 - hx0 + 0.4, 0.25, hz1 - hz0 + 0.4, (hx0 + hx1) / 2, top + HH, (hz0 + hz1) / 2, M.dark());
    B.roofDoor = k.world((dx0 + dx1) / 2, top, hz1 + 1);
  }
  // rooftop kit (kept clear of the stairs hut), solid now so you can climb about up there
  const rx = () => (core ? core.x1 + 2 + Math.random() * Math.max(0.1, w / 2 - core.x1 - 5) : (Math.random() - 0.5) * w * 0.4);
  if (type === 'office') {
    k.box(Math.min(w * 0.3, 8), 2.5, Math.min(d * 0.3, 6), w * 0.22, top, d * 0.12, M.metal());
    if (floors > 14) k.cyl(0.15, 8 + Math.random() * 10, w * 0.22, top + 2.5, d * 0.12, M.metal());
  } else if (type === 'brick' && Math.random() < 0.5) { // a water tank on legs
    const tx = rx(), tz = (Math.random() - 0.5) * d * 0.4;
    for (const [a, b] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) k.box(0.15, 2, 0.15, tx + a, top, tz + b, M.dark());
    k.cyl(1.4, 2.6, tx, top + 2, tz, M.wood(), { collide: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 10), M.dark());
    cone.position.set(tx, top + 5.05, tz);
    k.root.add(cone);
  } else if (type !== 'brick') {
    k.box(Math.min(w, 6) * 0.6, 1.8, Math.min(d, 6) * 0.5, rx(), top, (Math.random() - 0.5) * d * 0.3, M.metal());
  }
  {
    // fire escape on brick buildings' side street faces
    if (type === 'brick' && floors >= 3) {
      for (const local of ['left', 'right']) {
        if (!street(local) || Math.random() < 0.4) continue;
        const sx = local === 'right' ? w / 2 + 0.6 : -w / 2 - 0.6;
        for (let f = 1; f <= floors; f++) {
          const y = GROUND + (f - 1) * FLOOR + 0.1;
          k.box(1.1, 0.08, 4, sx, y, 0, M.dark(), { collide: false });
          k.box(0.05, 1, 4, sx + (local === 'right' ? 0.55 : -0.55), y, 0, M.dark(), { collide: false });
          const ladder = k.box(0.5, 0.06, 4.6, sx, y + 1.7, 0.2, M.dark(), { collide: false });
          ladder.rotation.x = 0.75;
        }
      }
    }
    // balconies on apartment street fronts
    if (type === 'apartment') {
      for (const local of ['front', 'back', 'left', 'right']) {
        if (!street(local)) continue;
        const along = local === 'front' || local === 'back' ? w : d;
        const n = Math.max(1, Math.floor(along / 8));
        for (let f = 1; f < floors; f++) {
          for (let i = 0; i < n; i++) {
            const a = -along / 2 + (i + 0.5) * (along / n);
            const y = GROUND + f * FLOOR - 0.05;
            const [x, z, bw, bd] = local === 'front' ? [a, d / 2 + 0.6, 3, 1.2] : local === 'back' ? [a, -d / 2 - 0.6, 3, 1.2]
              : local === 'right' ? [w / 2 + 0.6, a, 1.2, 3] : [-w / 2 - 0.6, a, 1.2, 3];
            k.box(bw, 0.15, bd, x, y, z, plainM, { collide: false });
            const rx2 = local === 'right' ? x + 0.55 : local === 'left' ? x - 0.55 : x;
            const rz = local === 'front' ? z + 0.55 : local === 'back' ? z - 0.55 : z;
            k.box(local === 'front' || local === 'back' ? bw : 0.06, 1, local === 'front' || local === 'back' ? 0.06 : bd, rx2, y + 0.15, rz, M.metal(), { collide: false });
          }
        }
      }
    }
  }
  // ---- awnings and a shop sign on the street front
  if (!opts.interior && type === 'brick' && street('front') && Math.random() < 0.7) {
    const aw = k.box(Math.min(w - 2, 7), 0.12, 1.8, (Math.random() - 0.5) * (w - 9), GROUND - 1.4, d / 2 + 0.9, mat(`awn${pick(AWN)}`, () => std({ color: pick(AWN), roughness: 0.9 })), { collide: false });
    aw.rotation.x = 0.35;
  }
  if (opts.name) {
    const p = k.world(0, GROUND - 0.6, d / 2 + 0.14);
    sign(group, opts.name, p.x, p.y, p.z, YAW[lot.front], { w: Math.min(w - 2, Math.max(5, opts.name.length * 0.75)), h: 1.1, bg: opts.signBg || '#1b1b1b', fg: opts.signFg || '#ffe7a0', glow: true });
  } else if (!opts.interior && type === 'brick' && street('front') && Math.random() < 0.35) {
    const p = k.world(0, GROUND - 0.6, d / 2 + 0.14);
    sign(group, pick(SHOP_NAMES), p.x, p.y, p.z, YAW[lot.front], { w: 5, h: 0.8, bg: '#151515', fg: '#f4e2b0' });
  }
  out.height = top;
  return out;
}

// ---------------------------------------------------------------- walk-in ground floors
function interior(k, w, d, kind, wallM, opts) {
  const T = 0.3, DOOR = 2.4, DH = 3.0;
  const out = { loot: [], slots: [], yaw: k.yaw };
  const lit = (c) => mat(`lit${c}`, () => std({ color: c, emissive: c, emissiveIntensity: 0.28 }));
  const litWood = mat('litWood', () => std({ map: woodTex(), emissive: 0xffffff, emissiveMap: woodTex(), emissiveIntensity: 0.25 }));
  const W = { wood: litWood, dark: lit(0x3a3c40), metal: lit(0xa0a6ac) };
  // interiors are lit by their ceiling panels: surfaces glow a little so rooms don't read as caves
  const floorM = mat(`floor|${kind}`, () => {
    const map = kind === 'diner' ? tileTex('#e9e4da', '#2f2f33') : kind === 'bank' ? tileTex('#efe9dd', '#d9cfbd') : kind === 'office' || kind === 'lobby' ? tileTex('#d6d1c8', '#bfb9af') : woodTex();
    return std({ map, roughness: 0.55, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.22 });
  });
  const ic = kind === 'diner' ? 0xf2e4c6 : kind === 'pawn' ? 0xd6c9a8 : 0xece7dd;
  const inner = mat(`inner${ic}`, () => std({ color: ic, emissive: ic, emissiveIntensity: 0.32 }));
  // floor + ceiling
  const fg = new THREE.PlaneGeometry(w - 0.1, d - 0.1);
  const fuv = fg.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, (fuv.getX(i) * w) / 4, (fuv.getY(i) * d) / 4);
  const fl = new THREE.Mesh(fg, floorM);
  fl.rotation.x = -Math.PI / 2; fl.position.y = 0.02; fl.receiveShadow = true;
  k.root.add(fl);
  k.box(w, 0.22, d, 0, GROUND - 0.32, 0, inner, { collide: false, cast: false }); // (just under the floor above)
  // side and back walls (outside: the building's wall; inside: plaster lining)
  k.box(T, GROUND, d, -w / 2 + T / 2, 0, 0, wallM, { uv: [4, FLOOR] });
  k.box(T, GROUND, d, w / 2 - T / 2, 0, 0, wallM, { uv: [4, FLOOR] });
  if (opts.backDoor) { // a door at the back, through to the rest of the building (and its stairs)
    // (lined with plaster on both faces: the lobby's behind it)
    const bx = opts.backDoor.x ?? 0, seg = (a, b) => { if (b - a > 0.05) { k.box(b - a, GROUND, T, (a + b) / 2, 0, -d / 2 + T / 2, inner, { uv: [4, FLOOR] }); k.box(b - a, GROUND - 0.3, 0.05, (a + b) / 2, 0, -d / 2 + T + 0.03, inner, { collide: false, cast: false }); } };
    seg(-w / 2, bx - 0.9); seg(bx + 0.9, w / 2);
    k.box(1.8, GROUND - 2.6, T, bx, 2.6, -d / 2 + T / 2, inner);
    for (const sx of [-1, 1]) k.box(0.12, 2.6, T + 0.1, bx + sx * 0.96, 0, -d / 2 + T / 2, W.dark, { collide: false });
    k.box(2.04, 0.12, T + 0.1, bx, 2.6, -d / 2 + T / 2, W.dark, { collide: false });
    out.backDoor = k.world(bx, 0, -d / 2 - 1);
  } else {
    k.box(w, GROUND, T, 0, 0, -d / 2 + T / 2, wallM, { uv: [4, FLOOR] });
    k.box(w - 2 * T, GROUND - 0.3, 0.05, 0, 0, -d / 2 + T + 0.03, inner, { collide: false, cast: false });
  }
  k.box(0.05, GROUND - 0.3, d - 2 * T, -w / 2 + T + 0.03, 0, 0, inner, { collide: false, cast: false });
  k.box(0.05, GROUND - 0.3, d - 2 * T, w / 2 - T - 0.03, 0, 0, inner, { collide: false, cast: false });
  // shopfront: sill, big windows either side of the door, fascia over the top
  const fz = d / 2 - T / 2;
  const frameM = mat(`frame${opts.frame || 0}`, () => std({ color: 0x1d2420, roughness: 0.5 }));
  const side = (w - DOOR) / 2;
  for (const s of [-1, 1]) {
    const cx = s * (DOOR / 2 + side / 2);
    k.box(side, 0.6, T, cx, 0, fz, frameM);
    const g = k.box(side - 0.2, DH - 0.6, 0.06, cx, 0.6, fz, M.glass(), { cast: false, collide: false });
    g.userData.noMerge = true;
    k.collider(side, DH - 0.6, T, cx, 0.6, fz);
    k.box(0.2, DH, T + 0.05, s * (DOOR / 2 + 0.1), 0, fz, frameM, { collide: false });
    k.box(0.2, DH, T + 0.05, s * (w / 2 - 0.1), 0, fz, frameM, { collide: false });
  }
  k.box(w, GROUND - DH, T, 0, DH, fz, wallM, { uv: [4, FLOOR] });
  k.box(w, 0.15, T + 0.1, 0, DH, fz, frameM, { collide: false });
  // ceiling lights
  for (let x = -w / 2 + 3; x <= w / 2 - 3; x += Math.max(4, (w - 6) / 2)) {
    for (let z = -d / 2 + 3; z <= d / 2 - 3; z += Math.max(4, (d - 6) / 2)) k.box(1.4, 0.05, 0.5, x, GROUND - 0.36, z, M.light(), { collide: false, cast: false });
  }
  out.door = k.world(0, 0, d / 2 + 1.5);
  out.doorway = { pos: k.world(0, 0, fz), yaw: k.yaw, w: DOOR, h: DH };
  out.inside = k.world(0, 0, d / 2 - 2.5);
  const spot = (x, y, z) => out.loot.push(k.world(x, y, z));
  const hw = w / 2 - T, hd = d / 2 - T;
  out.room = { center: k.world(0, 0, 0), yaw: k.yaw, hw: w / 2, hd: d / 2 };
  const slot = (x, y, z, kind = 'shelf') => out.slots.push({ pos: k.world(x, y, z), kind });
  const clerkAt = (x, z) => { out.clerk = k.world(x, 0, z); };
  const counter = (x, z, cw, mat_ = W.wood) => {
    k.box(cw, 1.05, 0.8, x, 0, z, mat_);
    k.box(cw + 0.1, 0.06, 0.9, x, 1.05, z, W.dark, { collide: false });
  };
  // open shelving: a centre panel, end panels and boards that things can actually sit on
  const shelf = (x, z, sw, sides = [-1, 1]) => {
    k.box(0.06, 2.0, sw, x, 0, z, W.wood);
    for (const e of [-1, 1]) k.box(0.56, 2.0, 0.05, x, 0, z + e * (sw / 2 - 0.025), W.wood);
    for (const y of [0.08, 0.6, 1.15, 1.7]) {
      k.box(0.56, 0.05, sw - 0.1, x, y, z, W.dark);
      // product slots along the board, on the side(s) facing the aisle
      for (const sd of sides) for (let zz = -sw / 2 + 0.3; zz <= sw / 2 - 0.29; zz += 0.4) slot(x + sd * 0.15, y + 0.06, z + zz);
    }
  };

  if (kind === 'shop' || kind === 'pawn') {
    // shelving down both walls and free-standing aisles, counter at the back
    for (const s of [-1, 1]) {
      const x = s * (hw - 0.35);
      for (let z = -hd + 2.5; z < hd - 3; z += 3.2) {
        shelf(x, z, 2.8, [-s]);
      }
    }
    if (w > 12) for (const ax of [-w / 6, w / 6]) for (let z = -hd + 4.5; z < hd - 5; z += 3.4) {
      shelf(ax, z, 3);
    }
    const cz = -hd + 2.2;
    counter(w > 12 ? -w / 4 : 0, cz, Math.min(5, w - 4), kind === 'pawn' ? lit(0x5a4030) : W.wood);
    k.box(0.5, 0.35, 0.4, (w > 12 ? -w / 4 : 0) + 1, 1.11, cz, W.dark, { collide: false }); // till
    out.counter = k.world(w > 12 ? -w / 4 : 0, 0, cz + 1.5);
    clerkAt(w > 12 ? -w / 4 : 0, cz - 1.0);
    for (let i = 0; i < 3; i++) slot((w > 12 ? -w / 4 : 0) - 1.6 + i * 0.5, 1.12, cz + 0.15, 'counter'); // impulse buys on the counter
    if (kind === 'pawn') {
      // guitars, tellies and a safe behind the counter
      for (let i = 0; i < 3; i++) k.box(0.9, 0.6, 0.5, -hw + 1.5 + i * 1.2, 1.7, -hd + 0.35, W.dark, { collide: false });
      k.box(1, 1.2, 0.9, hw - 1.2, 0, -hd + 0.8, W.metal);
    }
  } else if (kind === 'diner') {
    const cz = -hd + 2;
    counter(0, cz, w - 6, lit(0xc8302b));
    out.counter = k.world(0, 0, cz + 1.5);
    clerkAt(0, cz - 1.0);
    for (let x = -w / 2 + 4; x <= w / 2 - 4; x += 1.6) k.cyl(0.25, 0.75, x, 0, cz + 0.9, W.metal);
    slot(-2, 1.12, cz, 'counter'); slot(2, 1.12, cz, 'counter');
    const red = lit(0x9e2420);
    for (const s of [-1, 1]) for (let z = -hd + 5.5; z < hd - 3; z += 3.2) {
      const x = s * (hw - 1.4);
      k.box(1.6, 0.75, 0.9, x, 0, z, lit(0xe8e2d4));
      k.box(1.6, 0.9, 0.5, x, 0, z - 0.9, red);
      k.box(1.6, 0.9, 0.5, x, 0, z + 0.9, red);
      slot(x - 0.4, 0.76, z, 'table'); slot(x + 0.4, 0.76, z, 'table');
    }
  } else if (kind === 'bank') {
    // marble hall: a long teller counter with glass screens (a gap at one end), the vault behind
    const cz = -hd + 5;
    const gap = 1.6;
    const cw = w - 2 * T - gap;
    const cx = -w / 2 + T + cw / 2;
    const marble = lit(0xe2dccf);
    k.box(cw, 1.1, 0.9, cx, 0, cz, marble);
    k.box(cw + 0.1, 0.06, 1, cx, 1.1, cz, lit(0x6a5a48), { collide: false });
    const glassScreen = k.box(cw, 1.1, 0.04, cx, 1.16, cz, M.glass(), { cast: false, collide: false });
    glassScreen.userData.noMerge = true;
    k.collider(cw, 1.1, 0.1, cx, 1.16, cz);
    for (let i = 0; i < 3; i++) {
      const x = cx - cw / 2 + (i + 0.5) * (cw / 3);
      k.box(0.5, 0.35, 0.08, x, 1.13, cz - 0.3, W.dark, { collide: false }); // teller screens
      k.box(0.8, 0.08, 0.3, x, 0.98, cz + 0.55, W.dark, { collide: false }); // pass-through tray
    }
    out.counter = k.world(cx, 0, cz + 1.6);
    clerkAt(cx - cw / 4, cz - 1.2);
    // the vault: a big round door standing open in the back wall
    const vx = -w / 4;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.25, 24), lit(0x8a8f96));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(vx, 1.6, -hd + 0.1);
    k.root.add(ring);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24), std({ color: 0x0c0c0e }));
    hole.position.set(vx, 1.6, -hd + 0.24);
    k.root.add(hole);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.4, 24), lit(0xa8adb4));
    door.rotation.set(Math.PI / 2, 0, 0);
    door.position.set(vx + 1.9, 1.6, -hd + 1.1);
    door.rotation.y = 1.2;
    k.root.add(door);
    for (let i = 0; i < 4; i++) k.box(0.45, 0.3, 0.3, vx - 1.5 + i * 0.5, 0, -hd + 1.4, lit(0x2f5a3a), { collide: false }); // cash bags
    out.vault = k.world(vx, 0, -hd + 2);
    // velvet rope queue and plants
    for (let i = 0; i < 4; i++) k.cyl(0.05, 1, -2 + i * 1.6, 0, cz + 3.2, lit(0xc9a24a));
    k.box(4.8, 0.08, 0.06, -2 + 2.4, 0.85, cz + 3.2, lit(0x8a1c2a), { collide: false });
    for (const s of [-1, 1]) k.cyl(0.35, 0.6, s * (hw - 0.8), 0, hd - 1.5, W.dark);
  } else if (kind === 'office' || kind === 'lobby') {
    const cz = -hd + 2.5;
    counter(0, cz, Math.min(6, w - 6), lit(0xd8d2c4));
    out.counter = k.world(0, 0, cz + 1.5);
    clerkAt(0, cz - 1.0);
    spot(-1.6, 1.2, cz); spot(1.6, 1.2, cz);
    // lift doors on the back wall, a couple of sofas and plants
    for (const x of [-3, 3]) k.box(1.8, 2.6, 0.06, x, 0, -hd + 0.06, W.metal, { collide: false });
    for (const s of [-1, 1]) {
      k.box(2.4, 0.5, 0.9, s * (hw - 1.5), 0, hd - 4, lit(0x3b4a5a));
      k.box(0.6, 0.45, 0.6, s * (hw - 1.5), 0, hd - 2.2, lit(0xe8e2d4), { collide: false });
      spot(s * (hw - 1.5), 0.75, hd - 2.2);
      k.cyl(0.35, 0.6, s * (hw - 0.7), 0, -hd + 1.2, W.dark);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), lit(0x3f7d3a));
      const p = new THREE.Vector3(s * (hw - 0.7), 1.2, -hd + 1.2);
      leaf.position.copy(p);
      k.root.add(leaf);
    }
    if (kind === 'office') for (let z = -hd + 6; z < hd - 6; z += 3) for (const s of [-1, 1]) {
      k.box(1.6, 0.75, 0.8, s * 3, 0, z, W.wood);
      spot(s * 3, 0.95, z);
    }
  }
  return out;
}
