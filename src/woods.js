import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { std, sign, canvasTex, speckle } from './buildkit.js';
import { scatter } from './terrain.js';
import { ITEM_BY_ID } from './items.js';

// The woods: log cabins you can walk into, campfires, the undergrowth (bushes, ferns, mushrooms,
// birches, stumps, wildflowers), things to find off the trails (a treehouse, hunting stands, a
// crashed plane, an old caravan, a mine, a fishing pond) and the deer that live out there.

// ---------------------------------------------------------------- a local frame
// place things relative to (X, Y, Z) turned by yaw (local +z is the front)
export class Frame {
  constructor(g, sb, X, Y, Z, yaw = 0) { Object.assign(this, { g, sb, X, Y, Z, yaw }); this.c = Math.cos(yaw); this.s = Math.sin(yaw); }
  world(x, y, z) { return new THREE.Vector3(this.X + x * this.c + z * this.s, this.Y + y, this.Z - x * this.s + z * this.c); }
  mesh(geo, mat, x, y, z, { rx = 0, ry = 0, rz = 0, cast = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(this.world(x, y, z)); m.rotation.set(rx, this.yaw + ry, rz, 'YXZ');
    m.castShadow = cast; m.receiveShadow = true; this.g.add(m); return m;
  }
  // y is the bottom of the box (unless tilted: then it's where the centre is, less h/2)
  box(w, h, d, x, y, z, mat, o = {}) {
    const m = this.mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, o);
    if (o.collide !== false) this.collider(w, h, d, x, y, z, o);
    return m;
  }
  collider(w, h, d, x, y, z, o = {}) {
    const p = this.world(x, y + h / 2, z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, this.yaw + (o.ry || 0), o.rz || 0, 'YXZ'));
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, p.y, p.z).setRotation(q));
  }
  cyl(r0, r1, h, x, y, z, mat, o = {}) { // y: the bottom (upright)
    const m = this.mesh(new THREE.CylinderGeometry(r0, r1, h, o.seg || 10), mat, x, y + h / 2, z, o);
    if (o.collide) { const p = this.world(x, y + h / 2, z); this.sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(h / 2, Math.max(r0, r1)).setTranslation(p.x, p.y, p.z)); }
    return m;
  }
}

// ---------------------------------------------------------------- materials (made once)
let MT = null;
export function woodMats() {
  if (MT) return MT;
  const bark = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = '#6e4a2c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '30,18,8' : '160,120,80'},${0.15 + Math.random() * 0.25})`; c.fillRect(Math.random() * w, 0, 1 + Math.random() * 3, h); }
    speckle(c, w, h, 200, 0.1);
  }, [2, 1]);
  const rings = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#c9a272'; c.fillRect(0, 0, w, h);
    for (let r = 4; r < 32; r += 3 + Math.random() * 2) { c.strokeStyle = `rgba(110,70,35,${0.35 + Math.random() * 0.3})`; c.lineWidth = 1; c.beginPath(); c.arc(32, 32, r, 0, 7); c.stroke(); }
    c.strokeStyle = '#5a3a1e'; c.lineWidth = 4; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.stroke();
  });
  const planks = (base, n = 4) => canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { c.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`; c.fillRect((i * w) / n, 0, w / n, h); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect((i * w) / n, 0, 1.5, h); }
    speckle(c, w, h, 160, 0.08);
  });
  const shingle = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#4a3c30'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = -(y % 16 ? 6 : 0); x < w; x += 12) { c.fillStyle = `rgb(${70 + Math.random() * 30},${55 + Math.random() * 20},${42 + Math.random() * 15})`; c.fillRect(x + 1, y + 1, 10, 7); }
  }, [3, 3]);
  const stone = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#5c5852'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) for (let x = -(y % 20 ? 7 : 0); x < w; x += 14) { const v = 110 + Math.random() * 50; c.fillStyle = `rgb(${v},${v - 6},${v - 14})`; c.beginPath(); c.ellipse(x + 7, y + 5, 6, 4, 0, 0, 7); c.fill(); }
  }, [1, 1]);
  const quilt = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#9a2a24'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(20,10,10,0.45)'; for (let i = 0; i < w; i += 16) { c.fillRect(i, 0, 6, h); c.fillRect(0, i, w, 6); }
  }, [2, 2]);
  const birch = canvasTex(32, 128, (c, w, h) => {
    c.fillStyle = '#e8e4da'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { c.fillStyle = 'rgba(30,28,26,0.85)'; c.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 1.5 + Math.random() * 2); }
  });
  MT = {
    bark: std({ map: bark, roughness: 1 }), rings: std({ map: rings, roughness: 0.9 }),
    log: std({ map: bark, color: 0xb88a5c, roughness: 0.95 }),
    planks: std({ map: planks('#8a6440'), roughness: 0.9 }), floor: std({ map: planks('#9a7048', 3), roughness: 0.75 }),
    trim: std({ map: planks('#c8a878', 2), roughness: 0.85 }), darkWood: std({ color: 0x3e2a1a, roughness: 0.85 }),
    shingle: std({ map: shingle, roughness: 0.95 }), stone: std({ map: stone, roughness: 1 }),
    quilt: std({ map: quilt, roughness: 1 }), linen: std({ color: 0xeee8da, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8aa8b8, emissive: 0xffb050, emissiveIntensity: 0.05, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45 }),
    glow: std({ color: 0x2a1408, emissive: 0xff6a1a, emissiveIntensity: 1.2 }),
    lantern: std({ color: 0xfff0c0, emissive: 0xffc060, emissiveIntensity: 1.1 }),
    iron: std({ color: 0x2a2a2c, metalness: 0.6, roughness: 0.5 }),
    rust: std({ color: 0x7a4a2a, metalness: 0.4, roughness: 0.8 }),
    birch: std({ map: birch, roughness: 0.9 }),
    leaf: std({ color: 0xffffff, roughness: 0.9, flatShading: true }),
  };
  return MT;
}

// ---------------------------------------------------------------- a log cabin
// W wide (local x), D deep (z), door at the front (+z) with a porch; walk in: a bed, a table, a
// fireplace with the chimney outside on the right, a kitchen counter. Y is the ground.
export function logCabin(g, sb, X, Y, Z, yaw, { W = 8, D = 6.5, num = null, office = false } = {}) {
  const F = new Frame(g, sb, X, Y, Z, yaw), M = woodMats();
  const fy = 0.6, R = 0.17, STEP = 0.32, N = 8, top = fy + N * STEP, rise = 2.1;
  const out = { loot: [], door: F.world(0.9, 0, D / 2 + 3.2), inside: F.world(0, fy, 0), yaw };
  F.box(W + 0.5, 1.2, D + 0.5, 0, fy - 1.2, 0, M.stone); // the stone footing (its top is the floor)
  const door = { wall: 'front', a: 0.9, w: 1.0, y0: 0, y1: 2.1 };
  const holes = [door, { wall: 'front', a: -2.1, w: 1.3, y0: 0.9, y1: 1.9 }, { wall: 'left', a: 0.2, w: 1.3, y0: 0.9, y1: 1.9 }, { wall: 'back', a: 1.6, w: 1.0, y0: 1.0, y1: 1.8 }];
  if (office) holes.push({ wall: 'right', a: 0.4, w: 1.3, y0: 0.9, y1: 1.9 });
  // the walls: courses of logs, crossing at the corners (the side walls half a log up)
  const walls = { front: [W, (a) => [a, D / 2]], back: [W, (a) => [a, -D / 2]], left: [D, (a) => [-W / 2, a]], right: [D, (a) => [W / 2, a]] };
  for (const [name, [L, at]] of Object.entries(walls)) {
    const side = name === 'left' || name === 'right';
    for (let i = 0; i < N + (side ? 0 : 1); i++) {
      const yc = R + i * STEP + (side ? STEP / 2 : 0);
      if (yc > top - fy + 0.05) continue;
      let spans = [[-L / 2 - 0.35, L / 2 + 0.35]];
      for (const o of holes) if (o.wall === name && yc > o.y0 - R * 0.6 && yc < o.y1 + R * 0.6) spans = spans.flatMap(([a, b]) => [[a, Math.min(b, o.a - o.w / 2)], [Math.max(a, o.a + o.w / 2), b]]).filter(([a, b]) => b - a > 0.1);
      for (const [a, b] of spans) {
        const [x, z] = at((a + b) / 2);
        const geo = new THREE.CylinderGeometry(R, R, b - a, 9, 1);
        F.mesh(geo, [M.log, M.rings, M.rings], x, fy + yc, z, side ? { rx: Math.PI / 2 } : { rz: Math.PI / 2 });
      }
    }
  }
  // (and the solid walls: a door gap at the front)
  const wt = 2 * R, wh = top - fy;
  F.collider(door.a - door.w / 2 + W / 2, wh, wt, (-W / 2 + door.a - door.w / 2) / 2, fy, D / 2);
  F.collider(W / 2 - door.a - door.w / 2, wh, wt, (W / 2 + door.a + door.w / 2) / 2, fy, D / 2);
  F.collider(door.w, wh - door.y1, wt, door.a, fy + door.y1, D / 2);
  F.collider(W, wh, wt, 0, fy, -D / 2); F.collider(wt, wh, D, -W / 2, fy, 0); F.collider(wt, wh, D, W / 2, fy, 0);
  // windows: a frame, a pane, a cross
  for (const o of holes) {
    if (o === door) continue;
    const along = o.wall === 'front' || o.wall === 'back', sgn = o.wall === 'front' || o.wall === 'right' ? 1 : -1;
    const P = (a, y, off = 0) => (along ? [a, y, sgn * (D / 2 + off)] : [sgn * (W / 2 + off), y, a]);
    const fr = (w, h, a, y) => { const [x, yy, z] = P(a, y, R + 0.02); F.box(along ? w : 0.06, h, along ? 0.06 : w, x, yy, z, M.trim, { collide: false, cast: false }); };
    fr(o.w + 0.2, 0.12, o.a, fy + o.y0 - 0.12); fr(o.w + 0.2, 0.12, o.a, fy + o.y1); fr(0.1, o.y1 - o.y0, o.a - o.w / 2 - 0.05, fy + o.y0); fr(0.1, o.y1 - o.y0, o.a + o.w / 2 + 0.05, fy + o.y0);
    fr(0.05, o.y1 - o.y0, o.a, fy + o.y0); fr(o.w, 0.05, o.a, fy + (o.y0 + o.y1) / 2);
    const [x, yy, z] = P(o.a, fy + o.y0);
    const gl = F.box(along ? o.w : 0.03, o.y1 - o.y0, along ? 0.03 : o.w, x, yy, z, M.glass, { collide: false, cast: false });
    gl.userData.noMerge = true;
  }
  // the door, standing open (swung in)
  { const geo = new THREE.BoxGeometry(door.w - 0.04, 2.05, 0.07); geo.translate((door.w - 0.04) / 2, 0, 0);
    F.mesh(geo, M.planks, door.a - door.w / 2 + 0.02, fy + 1.03, D / 2 - R, { ry: 1.25 });
    F.box(door.w + 0.24, 0.14, 0.4, door.a, fy + door.y1, D / 2, M.trim, { collide: false }); }
  // the roof: shingles over planks, a ridge, board gables
  const run = D / 2 + 0.55, ang = Math.atan2(rise, D / 2), Ls = run / Math.cos(ang);
  for (const s of [1, -1]) {
    const cz = (s * run) / 2, cy = top + rise - (run / 2) * Math.tan(ang) + 0.1;
    const mats = [M.planks, M.planks, M.shingle, M.planks, M.planks, M.planks];
    F.box(W + 1.1, 0.16, Ls, 0, cy - 0.08, cz, mats, { rx: s * ang });
  }
  F.box(W + 1.15, 0.22, 0.32, 0, top + rise + 0.05, 0, M.darkWood, { collide: false });
  { const sh = new THREE.Shape([new THREE.Vector2(-D / 2 - 0.2, 0), new THREE.Vector2(D / 2 + 0.2, 0), new THREE.Vector2(0, rise + 0.05)]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: false }); geo.translate(0, 0, -0.12);
    for (const s of [1, -1]) F.mesh(geo, M.planks, s * (W / 2 - 0.02), top - 0.02, 0, { ry: Math.PI / 2 }); }
  // the fireplace (on the right wall) and its stone chimney outside
  F.box(1.0, top + rise + 1.0, 1.3, W / 2 + 0.62, 0, 0.2, M.stone);
  F.box(0.8, 0.6, 0.8, W / 2 + 0.62, top + rise + 1.0, 0.2, M.stone, { collide: false });
  out.chimney = F.world(W / 2 + 0.62, top + rise + 1.7, 0.2);
  F.box(0.7, 1.5, 1.7, W / 2 - 0.55, fy, 0.2, M.stone);
  F.box(0.06, 0.6, 0.9, W / 2 - 0.92, fy + 0.15, 0.2, M.glow, { collide: false, cast: false });
  F.box(0.9, 0.12, 2.0, W / 2 - 0.6, fy + 1.5, 0.2, M.darkWood, { collide: false }); // mantel
  F.box(1.0, 0.08, 2.0, W / 2 - 1.2, fy, 0.2, M.stone, { collide: false, cast: false }); // hearth
  for (const s of [-1, 1]) F.mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.7, 5), M.trim, W / 2 - 0.4, fy + 2.0, 0.2 + s * 0.25, { rz: s * 0.9, cast: false }); // antlers
  out.fire = F.world(W / 2 - 1.0, fy + 0.4, 0.2);
  // inside
  F.box(W - 0.3, 0.04, D - 0.3, 0, fy, 0, M.floor, { collide: false, cast: false });
  F.box(2.4, 0.02, 1.7, 1.2, fy + 0.04, 0.6, std({ color: 0x8a3a24, roughness: 1 }), { collide: false, cast: false }); // rug
  if (office) {
    F.box(2.6, 1.0, 0.7, -0.6, fy, -0.4, M.darkWood); F.box(2.7, 0.06, 0.8, -0.6, fy + 1.0, -0.4, M.trim, { collide: false });
    F.box(0.5, 0.06, 0.35, -1.2, fy + 1.06, -0.4, M.iron, { collide: false }); // the bell
    F.box(3.0, 1.9, 0.35, -1.8, fy, -D / 2 + 0.4, M.planks, { collide: false }); // key board and brochures
    for (let i = 0; i < 6; i++) F.box(0.06, 0.12, 0.04, -3.0 + i * 0.4, fy + 1.4, -D / 2 + 0.6, M.iron, { collide: false, cast: false });
    out.counter = F.world(-0.6, fy, 0.6); out.loot.push(F.world(-1.6, fy + 1.1, -0.4));
  } else {
    // the bed (back left)
    const bx = -W / 2 + 1.4, bz = -D / 2 + 1.15;
    F.box(2.2, 0.35, 1.6, bx, fy, bz, M.darkWood); F.box(2.1, 0.22, 1.5, bx, fy + 0.35, bz, M.linen, { collide: false });
    F.box(1.5, 0.08, 1.56, bx + 0.32, fy + 0.57, bz, M.quilt, { collide: false }); F.box(0.42, 0.14, 1.1, bx - 0.75, fy + 0.57, bz, M.linen, { collide: false });
    F.box(0.1, 1.1, 1.6, bx - 1.1, fy, bz, M.darkWood, { collide: false });
    // the table and two chairs, a lantern
    const tx = -1.4, tz = 0.9;
    F.box(1.3, 0.06, 0.85, tx, fy + 0.74, tz, M.trim, { collide: false });
    for (const [a, b] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) F.box(0.07, 0.74, 0.07, tx + a, fy, tz + b, M.darkWood, { collide: false });
    F.collider(1.3, 0.8, 0.85, tx, fy, tz);
    for (const s of [-1, 1]) { F.box(0.45, 0.05, 0.45, tx + s * 0.95, fy + 0.45, tz, M.planks, { collide: false }); F.box(0.05, 0.55, 0.45, tx + s * 1.15, fy + 0.45, tz, M.planks, { collide: false }); for (const [a, b] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) F.box(0.04, 0.45, 0.04, tx + s * 0.95 + a, fy, tz + b, M.darkWood, { collide: false, cast: false }); }
    F.box(0.14, 0.24, 0.14, tx + 0.3, fy + 0.8, tz - 0.1, M.lantern, { collide: false, cast: false });
    out.loot.push(F.world(tx - 0.3, fy + 0.85, tz));
    // the kitchen counter along the back (right), with a shelf of jars over it
    F.box(2.0, 0.9, 0.6, 1.4, fy, -D / 2 + 0.55, M.planks); F.box(2.05, 0.05, 0.65, 1.4, fy + 0.9, -D / 2 + 0.55, M.trim, { collide: false });
    F.box(0.55, 0.04, 0.4, 1.0, fy + 0.95, -D / 2 + 0.55, M.iron, { collide: false, cast: false });
    F.box(2.0, 0.05, 0.28, 1.4, fy + 1.75, -D / 2 + 0.38, M.trim, { collide: false, cast: false });
    for (let i = 0; i < 6; i++) F.cyl(0.07, 0.07, 0.2, 0.6 + i * 0.32, fy + 1.8, -D / 2 + 0.38, std({ color: [0xb04a2a, 0xd8b04a, 0x6a8a3a][i % 3], roughness: 0.4 }), { seg: 8, cast: false });
    out.loot.push(F.world(2.0, fy + 1.0, -D / 2 + 0.55));
    // an armchair by the fire
    F.box(0.9, 0.45, 0.9, 1.9, fy, 1.3, std({ color: 0x5a6a3a, roughness: 1 })); F.box(0.2, 0.6, 0.9, 1.5, fy + 0.45, 1.3, std({ color: 0x5a6a3a, roughness: 1 }), { collide: false });
  }
  // the porch: a deck, posts, a rail with a gap at the steps, a lean-to roof
  const pz0 = D / 2 + R, pd = 2.3, pz1 = pz0 + pd;
  F.box(W + 0.4, 0.14, pd, 0, fy - 0.14, (pz0 + pz1) / 2, M.floor);
  F.box(W + 0.2, fy - 0.14, 0.2, 0, 0, pz1 - 0.15, M.darkWood, { collide: false });
  F.box(1.4, 0.3, 0.45, door.a, 0, pz1 + 0.22, M.planks); // the step
  const porchY = (z) => top - 0.12 - ((z - pz0) / pd) * 0.42;
  const posts = [-W / 2, door.a - 0.8, door.a + 0.8, W / 2].map((x) => x + (x === -W / 2 ? 0.12 : x === W / 2 ? -0.12 : 0));
  for (const x of posts) F.box(0.16, porchY(pz1 - 0.12) - fy, 0.16, x, fy, pz1 - 0.12, M.log);
  for (const [a, b] of [[posts[0], posts[1]], [posts[2], posts[3]]]) {
    F.box(b - a, 0.08, 0.1, (a + b) / 2, fy + 0.95, pz1 - 0.12, M.trim, { collide: false });
    F.box(b - a, 0.06, 0.06, (a + b) / 2, fy + 0.45, pz1 - 0.12, M.trim, { collide: false });
    F.collider(b - a, 1.0, 0.1, (a + b) / 2, fy, pz1 - 0.12);
  }
  for (const s of [-1, 1]) { F.box(0.08, 0.08, pd - 0.2, s * (W / 2 + 0.1), fy + 0.95, (pz0 + pz1) / 2, M.trim, { collide: false }); F.collider(0.1, 1.0, pd, s * (W / 2 + 0.12), fy, (pz0 + pz1) / 2); }
  { const a2 = Math.atan2(0.42, pd), L = (pd + 0.4) / Math.cos(a2); F.box(W + 0.7, 0.1, L, 0, porchY(pz0 + (pd + 0.4) / 2) - 0.05 + 0.06, pz0 + (pd + 0.4) / 2 - 0.1, [M.planks, M.planks, M.shingle, M.planks, M.planks, M.planks], { rx: a2, collide: false }); }
  // a rocking chair or two, a lantern by the door, the cabin's number
  for (const x of [-2.8, -1.6]) { F.box(0.55, 0.06, 0.55, x, fy + 0.42, pz0 + 0.9, M.darkWood, { collide: false }); F.box(0.55, 0.65, 0.06, x, fy + 0.45, pz0 + 0.62, M.darkWood, { collide: false }); for (const s of [-1, 1]) F.box(0.04, 0.42, 0.7, x + s * 0.25, fy, pz0 + 0.9, M.darkWood, { collide: false, cast: false }); }
  F.box(0.16, 0.26, 0.16, door.a + 0.8, fy + 1.9, pz0 + 0.12, M.lantern, { collide: false, cast: false });
  out.lantern = F.world(door.a + 0.8, fy + 2.0, pz0 + 0.4);
  if (num != null) { const p = F.world(door.a, fy + 2.45, D / 2 + R + 0.03); sign(g, office ? 'OFFICE' : String(num), p.x, p.y, p.z, yaw, { w: office ? 1.5 : 0.6, h: 0.4, bg: '#3b2a1a', fg: '#f2d9a0' }); }
  // firewood stacked against the left wall, under the eaves
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9 - r; i++) F.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 7), [M.bark, M.rings, M.rings], -W / 2 - 0.6, 0.12 + r * 0.2, -1.6 + i * 0.23 + r * 0.115, { rz: Math.PI / 2, cast: false });
  F.collider(0.95, 0.85, 2.2, -W / 2 - 0.6, 0, -0.65);
  return out;
}

// ---------------------------------------------------------------- a campfire with log benches
export function campfire(g, sb, x, y, z, { benches = 4, r = 3.4 } = {}) {
  const F = new Frame(g, sb, x, y, z, 0), M = woodMats();
  const rockM = std({ color: 0x77736c, roughness: 1, flatShading: true });
  for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; F.mesh(new THREE.DodecahedronGeometry(0.28, 0), rockM, Math.cos(a) * 1.05, 0.14, Math.sin(a) * 1.05, { rx: i, ry: i * 2, cast: false }); }
  F.mesh(new THREE.CircleGeometry(0.9, 14), std({ color: 0x1a1008, emissive: 0xff4a10, emissiveIntensity: 0.9 }), 0, 0.05, 0, { rx: -Math.PI / 2, cast: false });
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; F.mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.2, 6), M.bark, Math.cos(a) * 0.28, 0.45, Math.sin(a) * 0.28, { ry: -a, rz: 0.55, cast: false }); }
  const flames = [];
  const fm = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const fm2 = new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const [ox, oz, s, m] of [[0, 0, 1, fm], [0.18, 0.1, 0.7, fm], [-0.15, -0.12, 0.75, fm], [0, 0, 0.55, fm2]]) {
    const f = F.mesh(new THREE.ConeGeometry(0.32 * s, 1.3 * s, 7, 1, true), m, ox, 0.2 + 0.65 * s, oz, { cast: false });
    f.userData.noMerge = true; f.userData.base = f.position.y; f.userData.s = s; flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a30, 0, 18, 1.6); light.position.copy(F.world(0, 1.2, 0)); g.add(light);
  for (let i = 0; i < benches; i++) {
    const a = (i / benches) * Math.PI * 2 + 0.4, bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const half = new THREE.CylinderGeometry(0.28, 0.28, 2.2, 10, 1, false, 0, Math.PI);
    const m = new THREE.Mesh(half, [M.bark, M.rings, M.rings]); m.position.copy(F.world(bx, 0.3, bz)); m.rotation.set(0, -a, Math.PI / 2, 'YXZ'); m.castShadow = m.receiveShadow = true; g.add(m);
    for (const s of [-0.7, 0.7]) F.box(0.25, 0.3, 0.4, bx - Math.sin(a) * s, 0, bz + Math.cos(a) * s, M.darkWood, { collide: false, cast: false });
    F.collider(0.6, 0.55, 2.2, bx, 0, bz, { ry: -a + Math.PI / 2 });
  }
  return { flames, light, pos: new THREE.Vector3(x, y, z) };
}

// ---------------------------------------------------------------- undergrowth
// spot(margin) → { x, z } somewhere in the woods, or null; heightAt(x, z)
export function undergrowth(g, sb, { spot, heightAt, counts = {}, rnd = Math.random }) {
  const M = woodMats(), out = {};
  const n = { bush: 1400, fern: 1600, shroom: 260, stump: 160, birch: 260, flower: 500, log: 0, ...counts };
  const at = (margin, f) => () => { const p = spot(margin); if (!p) return null; return f(p.x, p.z, heightAt(p.x, p.z)); };
  // bushes: three blobs
  { const parts = [[0, 0.45, 0, 0.7], [0.5, 0.35, 0.2, 0.5], [-0.35, 0.3, -0.3, 0.55]].map(([x, y, z, r]) => { const b = new THREE.IcosahedronGeometry(r, 0); b.translate(x, y, z); return b.toNonIndexed(); });
    const geo = mergeGeometries(parts); geo.computeVertexNormals(); const c = new THREE.Color();
    out.bush = scatter(g, geo, M.leaf, n.bush, at(1, (x, z, y) => { c.setHSL(0.25 + rnd() * 0.1, 0.35 + rnd() * 0.2, 0.13 + rnd() * 0.08); const s = 0.6 + rnd() * 0.9; return { x, y: y - 0.1, z, s, sy: s * (0.7 + rnd() * 0.4), yaw: rnd() * 6.3, color: c.getHex() }; }), { shadow: false }); }
  // ferns: a ring of fronds
  { const fronds = []; for (let i = 0; i < 7; i++) { const p = new THREE.PlaneGeometry(0.28, 1.0, 1, 2); p.translate(0, 0.5, 0); const pos = p.attributes.position; for (let k = 0; k < pos.count; k++) { const v = pos.getY(k); pos.setX(k, pos.getX(k) * (1 - v * 0.8)); pos.setZ(k, v * v * 0.35); } p.rotateX(-0.75); p.rotateY((i / 7) * Math.PI * 2); fronds.push(p.toNonIndexed()); }
    const geo = mergeGeometries(fronds); geo.computeVertexNormals();
    const fm = std({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }), c = new THREE.Color();
    out.fern = scatter(g, geo, fm, n.fern, at(0.5, (x, z, y) => { c.setHSL(0.27 + rnd() * 0.06, 0.45, 0.16 + rnd() * 0.08); return { x, y, z, s: 0.7 + rnd() * 0.7, yaw: rnd() * 6.3, color: c.getHex() }; }), { shadow: false }); }
  // mushrooms, in clusters: red caps and brown ones (vertex-coloured: a pale stem)
  for (const [key, cap] of [['shroomR', 0xc0281e], ['shroomB', 0x8a5a32]]) {
    const parts = []; const capC = new THREE.Color(cap), stemC = new THREE.Color(0xeee6d4);
    for (const [ox, oz, s] of [[0, 0, 1], [0.18, 0.08, 0.7], [-0.12, 0.15, 0.6], [0.05, -0.17, 0.5]]) {
      const st = new THREE.CylinderGeometry(0.025 * s, 0.035 * s, 0.16 * s, 6); st.translate(ox, 0.08 * s, oz);
      const cp = new THREE.SphereGeometry(0.09 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); cp.scale(1, 0.7, 1); cp.translate(ox, 0.15 * s, oz);
      for (const [geo2, col] of [[st, stemC], [cp, capC]]) { const ng = geo2.toNonIndexed(); const cols = new Float32Array(ng.attributes.position.count * 3); for (let k = 0; k < cols.length; k += 3) { cols[k] = col.r; cols[k + 1] = col.g; cols[k + 2] = col.b; } ng.setAttribute('color', new THREE.BufferAttribute(cols, 3)); parts.push(ng); }
    }
    const geo = mergeGeometries(parts); geo.computeVertexNormals();
    out[key] = scatter(g, geo, std({ vertexColors: true, roughness: 0.7 }), Math.round(n.shroom / 2), at(0.5, (x, z, y) => ({ x, y: y - 0.02, z, s: 0.9 + rnd() * 1.2, yaw: rnd() * 6.3 })), { shadow: false });
  }
  // stumps (sawn: rings on top)
  { const geo = new THREE.CylinderGeometry(0.42, 0.55, 0.6, 9); geo.translate(0, 0.3, 0);
    out.stump = scatter(g, geo, [M.bark, M.rings, M.bark], n.stump, at(2, (x, z, y) => ({ x, y: y - 0.05, z, s: 0.7 + rnd() * 0.6, sy: 0.6 + rnd() * 0.9, yaw: rnd() * 6.3 })),
      { collide: (o) => sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(0.3 * o.sy, 0.5 * o.s).setTranslation(o.x, o.y + 0.3 * o.sy, o.z)) }); }
  // birches: white trunks, a light, round canopy
  if (n.birch) {
    const trunk = new THREE.CylinderGeometry(0.13, 0.2, 7.5, 7); trunk.translate(0, 3.75, 0);
    const blobs = [[0, 7.2, 0, 1.7], [0.9, 6.3, 0.4, 1.2], [-0.8, 6.6, -0.5, 1.3], [0.2, 8.4, -0.3, 1.1]].map(([x, y, z, r]) => { const b = new THREE.IcosahedronGeometry(r, 1); b.translate(x, y, z); return b.toNonIndexed(); });
    const crown = mergeGeometries(blobs); crown.computeVertexNormals();
    const spots = []; for (let i = 0; i < n.birch * 3 && spots.length < n.birch; i++) { const p = spot(2.5); if (p) spots.push({ x: p.x, y: heightAt(p.x, p.z) - 0.2, z: p.z, s: 0.75 + rnd() * 0.5, yaw: rnd() * 6.3 }); }
    out.birch = scatter(g, trunk, M.birch, spots.length, (i) => spots[i], { collide: (o) => sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(2 * o.s, 0.2 * o.s).setTranslation(o.x, o.y + 2 * o.s, o.z)) });
    const c = new THREE.Color();
    out.birchLeaves = scatter(g, crown, M.leaf, spots.length, (i) => { c.setHSL(0.2 + rnd() * 0.07, 0.45 + rnd() * 0.15, 0.3 + rnd() * 0.1); return { ...spots[i], color: c.getHex() }; });
  }
  // wildflowers: a handful of little heads
  { const heads = []; for (let i = 0; i < 6; i++) { const b = new THREE.IcosahedronGeometry(0.07, 0); b.translate((rnd() - 0.5) * 0.6, 0.22 + rnd() * 0.18, (rnd() - 0.5) * 0.6); heads.push(b.toNonIndexed()); }
    const geo = mergeGeometries(heads); const cols = [0xf2d23a, 0xb070d8, 0xf4f0ea, 0xe85a8a, 0x5a8ae0];
    out.flower = scatter(g, geo, std({ color: 0xffffff, roughness: 0.8, emissive: 0x222222 }), n.flower, at(0.5, (x, z, y) => ({ x, y, z, s: 0.8 + rnd() * 0.6, yaw: rnd() * 6.3, color: cols[Math.floor(rnd() * cols.length)] })), { shadow: false }); }
  // fallen logs
  for (let i = 0; i < n.log; i++) {
    const p = spot(5); if (!p) continue;
    const yy = heightAt(p.x, p.z), len = 4 + rnd() * 5, yaw = rnd() * Math.PI;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, len, 8), [M.bark, M.rings, M.rings]);
    log.rotation.set(0, yaw, Math.PI / 2, 'YXZ'); log.position.set(p.x, yy + 0.3, p.z); log.castShadow = true; g.add(log);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ'));
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(len / 2, 0.34).setTranslation(p.x, yy + 0.3, p.z).setRotation(q));
  }
  return out;
}

// ---------------------------------------------------------------- things to find in the woods
// a deer stand: a ladder up to a little hide on four legs
export function huntingStand(g, sb, x, y, z, yaw) {
  const F = new Frame(g, sb, x, y, z, yaw), M = woodMats(), H = 4.2;
  for (const [a, b] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) F.box(0.14, H + 1.6, 0.14, a, 0, b, M.log, { collide: false });
  F.box(2.2, 0.12, 2.2, 0, H, 0, M.planks);
  for (const [w, d, a, b] of [[2.2, 0.08, 0, -1.05], [0.08, 2.2, -1.05, 0], [0.08, 2.2, 1.05, 0]]) F.box(w, 0.9, d, a, H + 0.12, b, M.planks);
  F.box(0.7, 0.9, 0.08, -0.75, H + 0.12, 1.05, M.planks); F.box(0.7, 0.9, 0.08, 0.75, H + 0.12, 1.05, M.planks);
  F.box(2.5, 0.08, 2.5, 0, H + 1.6, 0, std({ color: 0x3d4a2e, roughness: 1 }), { collide: false }); // a camo tarp roof
  for (let i = 0; i <= 12; i++) F.box(0.6, 0.08, 0.12, 0, i * 0.35, 1.25 + (12 - i) * 0.12, M.darkWood); // the ladder (climb it)
  for (const s of [-1, 1]) F.box(0.06, 0.06, 1.9, s * 0.32, 2.1, 1.95, M.darkWood, { collide: false, rx: -1.22 });
  return { top: F.world(0, H + 0.2, 0), loot: [F.world(0.5, H + 0.2, -0.5)] };
}

// a treehouse in a big old oak: a platform, a hut with a window, a rope ladder (well, a plank one)
export function treehouse(g, sb, x, y, z, yaw) {
  const F = new Frame(g, sb, x, y, z, yaw), M = woodMats(), H = 5.2;
  F.cyl(0.7, 1.05, 10.5, 0, 0, 0, M.bark, { seg: 10, collide: true });
  for (const [a, l, t] of [[0.4, 4, 0.9], [2.3, 3.6, 0.8], [4.1, 4.2, 1.0], [5.5, 3.2, 0.7]]) { // big boughs
    const m = F.mesh(new THREE.CylinderGeometry(0.22, 0.35, l, 7), M.bark, Math.sin(a) * l * 0.4, 9.2, Math.cos(a) * l * 0.4, { ry: a, rx: t });
    void m;
  }
  const c = new THREE.Color();
  for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 2.2 + (i % 3) * 1.2; c.setHSL(0.26 + Math.random() * 0.05, 0.4, 0.2 + Math.random() * 0.06); F.mesh(new THREE.IcosahedronGeometry(2.4 + Math.random(), 1), std({ color: c.getHex(), roughness: 0.9, flatShading: true }), Math.sin(a) * r, 11.2 + (i % 2) * 1.6, Math.cos(a) * r); }
  F.box(5, 0.16, 5, 0, H, 0, M.planks);
  for (const [a, b] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) F.box(0.16, H, 0.16, a, 0, b, M.log, { collide: false }); // props
  // a rail round the edge, a gap for the ladder at the front
  for (const [w, d, a, b] of [[5, 0.08, 0, -2.45], [0.08, 5, -2.45, 0], [0.08, 5, 2.45, 0], [1.6, 0.08, -1.7, 2.45], [1.6, 0.08, 1.7, 2.45]]) { F.box(w, 0.08, d, a, H + 0.95, b, M.trim, { collide: false }); F.collider(w, 1.0, d, a, H + 0.16, b); }
  // the hut on top
  F.box(2.8, 2.0, 0.1, 0, H + 0.16, -1.9, M.planks); F.box(0.1, 2.0, 2.4, -1.4, H + 0.16, -0.7, M.planks); F.box(0.1, 2.0, 2.4, 1.4, H + 0.16, -0.7, M.planks);
  F.box(3.2, 0.1, 2.9, 0, H + 2.2, -0.75, M.shingle, { rx: 0.18 });
  sign(g, 'NO GROWN-UPS', ...F.world(0, H + 1.7, -1.83).toArray(), yaw, { w: 1.6, h: 0.35, bg: '#c8a878', fg: '#7a1a1a' });
  for (let i = 0; i <= 15; i++) F.box(0.7, 0.07, 0.1, 0, i * 0.34, 2.6, M.darkWood); // the ladder rungs
  for (const s of [-1, 1]) F.box(0.06, H + 1, 0.06, s * 0.38, 0, 2.6, M.darkWood, { collide: false });
  return { loot: [F.world(-0.6, H + 0.3, -1.2), F.world(0.8, H + 0.3, 0.5)] };
}

// a small plane, crashed nose first into the hillside a long time ago
export function planeWreck(g, sb, x, y, z, yaw) {
  const F = new Frame(g, sb, x, y, z, yaw);
  const paint = std({ color: 0xd8d4c8, roughness: 0.6, metalness: 0.3 }), stripe = std({ color: 0x8a2a20, roughness: 0.6 }), dark = std({ color: 0x1a1c1e, roughness: 0.5 });
  F.mesh(new THREE.CylinderGeometry(0.75, 0.45, 6.5, 10), paint, 0, 1.0, 0, { rx: Math.PI / 2 + 0.22, rz: 0.15 });
  F.mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.25, 10), stripe, 0, 1.3, -1.2, { rx: Math.PI / 2 + 0.22, rz: 0.15 });
  F.mesh(new THREE.ConeGeometry(0.45, 1.6, 10), paint, 0, 0.35, 3.6, { rx: Math.PI / 2 + 0.22 }); // the crumpled nose
  F.box(1.0, 0.55, 1.4, 0, 1.45, 1.0, dark, { collide: false, rx: 0.22 }); // the cockpit glass (smashed)
  F.box(9.5, 0.12, 1.5, -1.0, 1.75, 0.7, paint, { rz: -0.12, ry: 0.05 }); // the wing still on
  F.box(3.6, 0.12, 1.4, 4.6, 0.25, 2.8, paint, { rz: 0.35, ry: 0.5 }); // the other half of the other wing, torn off
  F.box(0.12, 1.6, 1.2, 0.2, 1.8, -3.4, paint, { collide: false, rx: 0.22 }); // the tail fin
  F.box(3.0, 0.1, 0.9, 0, 1.6, -3.3, paint, { collide: false, rx: 0.22 });
  F.mesh(new THREE.BoxGeometry(0.15, 1.9, 0.08), dark, 0.9, 0.4, 4.4, { rz: 0.8, rx: 0.4 }); // a bent prop blade
  sign(g, 'N4127V', ...F.world(0.8, 1.2, -1.6).toArray(), yaw + Math.PI / 2 - 0.15, { w: 1.4, h: 0.3, bg: '#d8d4c8', fg: '#2a2a2a' });
  F.collider(1.4, 1.6, 6.8, 0, 0.2, 0, { rx: 0.22 });
  const rockM = std({ color: 0x5a4e3e, roughness: 1, flatShading: true }); // dirt thrown up round the nose
  for (let i = 0; i < 7; i++) F.mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.5, 0), rockM, (Math.random() - 0.5) * 3, 0.1, 4 + Math.random() * 1.5, { rx: i, ry: i });
  return { loot: [F.world(-0.4, 0.9, 0.2), F.world(2.4, 0.3, 2.0)] };
}

// an old caravan, up on blocks, with junk round it
export function caravan(g, sb, x, y, z, yaw) {
  const F = new Frame(g, sb, x, y, z, yaw), M = woodMats();
  const shell = std({ color: 0xd6cdb4, roughness: 0.7, metalness: 0.2 }), band = std({ color: 0x5a7a8a, roughness: 0.7 });
  F.box(6.5, 2.3, 2.4, 0, 0.55, 0, shell);
  F.box(6.55, 0.35, 2.45, 0, 1.3, 0, band, { collide: false });
  F.mesh(new THREE.CylinderGeometry(1.2, 1.2, 6.5, 12, 1, false, 0, Math.PI), shell, 0, 2.85, 0, { rz: Math.PI / 2, rx: Math.PI / 2, cast: true });
  for (const sx of [-2.2, 2.2]) F.box(0.6, 0.55, 0.6, sx, 0, 0, M.stone, { collide: false }); // up on blocks
  for (const s of [-1, 1]) { const w = F.mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10), std({ color: 0x1a1a1a }), 0, 0.35, s * 1.25, { rx: Math.PI / 2, rz: 0.2 }); void w; }
  for (const [a, w] of [[-1.8, 1.1], [1.2, 1.4]]) F.box(w, 0.6, 0.04, a, 1.7, 1.22, std({ color: 0x2a3640, roughness: 0.2 }), { collide: false, cast: false });
  F.box(0.8, 1.9, 0.05, -0.4, 0.6, 1.22, std({ color: 0xa89878 }), { collide: false });
  F.mesh(new THREE.BoxGeometry(2.5, 0.06, 1.6), std({ color: 0x6a8a5a, roughness: 1 }), -0.2, 2.35, 2.1, { rx: -0.25, cast: false }); // a sagging awning
  for (const s of [-1, 1]) F.box(0.05, 2.2, 0.05, -0.2 + s * 1.2, 0, 2.85, M.iron, { collide: false });
  // junk: a sofa, tyres, a rusty drum, a chair
  F.box(2.0, 0.5, 0.85, 2.0, 0, 3.2, std({ color: 0x6a4a5a, roughness: 1 })); F.box(2.0, 0.6, 0.25, 2.0, 0.5, 2.85, std({ color: 0x6a4a5a, roughness: 1 }), { collide: false });
  for (let i = 0; i < 3; i++) { const t = F.mesh(new THREE.TorusGeometry(0.38, 0.15, 6, 12), std({ color: 0x151515 }), -3.8, 0.15 + i * 0.28, 2.2, { rx: Math.PI / 2 }); void t; }
  F.cyl(0.32, 0.32, 0.9, -2.6, 0, 3.4, M.rust, { collide: true });
  return { loot: [F.world(-0.4, 0.95, 0.4), F.world(2.0, 0.6, 3.2), F.world(-2.6, 0.95, 3.4)] };
}

// an old mine: a timber portal into the hillside, rails coming out, a cart
export function mineEntrance(g, sb, x, y, z, yaw) {
  const F = new Frame(g, sb, x, y, z, yaw), M = woodMats();
  const black = std({ color: 0x050505, roughness: 1 });
  const rock = std({ color: 0x5a524a, roughness: 1, flatShading: true });
  F.box(3.4, 3.6, 6, 0, -0.4, -3.2, [rock, rock, rock, rock, black, rock], { collide: false }); // the dark way in (cut back into the hill)
  for (const s of [-1, 1]) F.box(0.35, 3.4, 0.35, s * 1.6, 0, 0, M.log);
  F.box(4.0, 0.45, 0.45, 0, 3.3, 0, M.log, { collide: false });
  for (let i = 0; i < 5; i++) F.box(0.25, 2.2, 0.08, -1.0 + i * 0.5, 0.4, -0.3, M.planks, { collide: false, rz: (i % 2 ? 0.1 : -0.08) }); // boarded up (mostly)
  F.collider(3.2, 3.3, 0.3, 0, 0, -0.3);
  sign(g, 'DANGER · OLD WORKINGS · KEEP OUT', ...F.world(0, 3.85, 0.25).toArray(), yaw, { w: 3.8, h: 0.4, bg: '#c9b23a', fg: '#1b1b1b' });
  for (let i = 0; i < 10; i++) F.box(1.5, 0.08, 0.2, 0, 0, 0.6 + i * 0.7, M.darkWood, { collide: false, cast: false }); // sleepers
  for (const s of [-1, 1]) F.box(0.06, 0.1, 7, s * 0.5, 0.08, 3.8, M.rust, { collide: false, cast: false });
  F.box(1.3, 0.8, 1.8, 0, 0.35, 4.0, M.rust); F.box(1.15, 0.2, 1.65, 0, 1.0, 4.0, std({ color: 0x4a4a46, roughness: 1, flatShading: true }), { collide: false }); // the cart, full of ore
  for (const [a, b] of [[-0.5, 3.4], [0.5, 3.4], [-0.5, 4.6], [0.5, 4.6]]) F.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), M.iron, a * 1.25, 0.25, b, { rz: Math.PI / 2, cast: false });
  return { loot: [F.world(0.8, 0.1, 1.5)] };
}

// a fishing pond's jetty with a rowing boat tied up, and a rope swing on an overhanging tree
export function jetty(g, sb, x, y, z, yaw, len = 9) {
  const F = new Frame(g, sb, x, y, z, yaw), M = woodMats();
  F.box(1.8, 0.14, len, 0, 0.4, len / 2, M.planks);
  for (let i = 0; i <= len; i += 2.5) for (const s of [-1, 1]) F.box(0.18, 1.9, 0.18, s * 0.82, -1.3, i, M.log, { collide: false });
  const hull = std({ color: 0x3a6a8a, roughness: 0.7 });
  const boat = F.mesh(new THREE.CylinderGeometry(0.75, 0.55, 3.2, 10, 1, true, 0, Math.PI), hull, 1.9, 0.15, len - 2, { rx: Math.PI / 2, rz: Math.PI, cast: true });
  boat.material.side = THREE.DoubleSide; boat.userData.noMerge = true;
  F.box(1.2, 0.06, 0.25, 1.9, -0.05, len - 2, M.planks, { collide: false });
  F.box(0.06, 0.06, 2.0, 1.6, 0.25, len - 2.3, M.trim, { collide: false, ry: 0.3 }); // an oar
  return { end: F.world(0, 0.54, len - 0.5), loot: [F.world(0.3, 0.6, len - 0.8)] };
}

// ---------------------------------------------------------------- deer
function deerMesh(buck) {
  const g = new THREE.Group(), coat = std({ color: buck ? 0x7a5232 : 0x8a6040, roughness: 1 }), pale = std({ color: 0xe8dcc8, roughness: 1 }), dark = std({ color: 0x2a1c12 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 1.15), coat); body.position.y = 1.0; g.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.9), pale); belly.position.y = 0.76; g.add(belly);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.08), pale); tail.position.set(0, 1.12, -0.6); g.add(tail);
  const neck = new THREE.Group(); neck.position.set(0, 1.15, 0.5); g.add(neck);
  const nk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), coat); nk.position.set(0, 0.22, 0.08); nk.rotation.x = 0.45; neck.add(nk);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.42), coat); head.position.set(0, 0.5, 0.25); neck.add(head);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.08), dark); nose.position.set(0, 0.46, 0.48); neck.add(nose);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.1), coat); ear.position.set(s * 0.13, 0.65, 0.12); ear.rotation.z = s * -0.6; neck.add(ear); }
  if (buck) for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55, 5), pale); a.position.set(s * 0.14, 0.82, 0.12); a.rotation.z = s * -0.5; neck.add(a);
    for (const k of [0.3, 0.5]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.22, 4), pale); t.position.set(s * (0.14 + k * 0.25), 0.68 + k * 0.4, 0.2); t.rotation.x = 0.6; neck.add(t); }
  }
  const legs = [];
  for (const [x, z] of [[-0.14, 0.42], [0.14, 0.42], [-0.14, -0.42], [0.14, -0.42]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.85, z); g.add(hip);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.09), coat); l.position.y = -0.42; hip.add(l);
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.1), dark); hoof.position.y = -0.82; hip.add(hoof);
    legs.push(hip);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { legs, neck };
  return g;
}

export class Wildlife {
  constructor(game) { this.game = game; this.deer = []; this.herds = []; this.t = 0; }

  // a herd: n deer that stay in the area ok(x, z) says is theirs
  addHerd({ n, spot, ok, heightAt }) {
    const herd = { spot, ok, heightAt };
    this.herds.push(herd);
    for (let i = 0; i < n; i++) {
      const p = spot(); if (!p) continue;
      const buck = i % 4 === 0, mesh = deerMesh(buck);
      const d = { herd, mesh, buck, pos: new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z), yaw: Math.random() * 6.3, state: 'graze', t: Math.random() * 6, phase: Math.random() * 6, hp: 40, target: null, fall: 0, gone: 0 };
      mesh.position.copy(d.pos); mesh.visible = false;
      this.game.scene.add(mesh);
      this.deer.push(d);
    }
  }

  playerPos() { const g = this.game, v = g.vehicles?.active; if (v) return v.pos; const t = g.shorePlayer?.body.translation(); return t || null; }

  // something loud (a gunshot): everything nearby bolts
  alarm(p, r = 90) { for (const d of this.deer) if (d.state !== 'dead' && d.pos.distanceTo(p) < r) this.bolt(d, p); }
  bolt(d, from) { d.state = 'flee'; d.t = 4 + Math.random() * 3; d.from = from.clone ? from.clone() : new THREE.Vector3(from.x, from.y, from.z); }

  // the gun's ray: the distance to the deer it hits first (or null)
  shoot(eye, dir, maxT, dmg) {
    let best = null, bd = maxT;
    const c = new THREE.Vector3();
    for (const d of this.deer) {
      if (d.state === 'dead' || !d.mesh.visible) continue;
      c.copy(d.pos); c.y += 1.0;
      const ox = c.x - eye.x, oy = c.y - eye.y, oz = c.z - eye.z, tca = ox * dir.x + oy * dir.y + oz * dir.z;
      if (tca < 0) continue;
      const d2 = ox * ox + oy * oy + oz * oz - tca * tca, r2 = 0.7 * 0.7;
      if (d2 > r2) continue;
      const t = tca - Math.sqrt(r2 - d2);
      if (t < bd) { bd = t; best = d; }
    }
    if (!best) return null;
    best.hp -= dmg;
    if (best.hp <= 0) this.kill(best, dir); else this.bolt(best, eye);
    return bd;
  }

  kill(d, dir) {
    d.state = 'dead'; d.t = 0; d.fall = 0; d.butchered = false;
    d.fallSide = dir && (dir.x * Math.cos(d.yaw) - dir.z * Math.sin(d.yaw)) < 0 ? -1 : 1;
    this.game.sfx?.play('hit');
  }

  // E by a dead deer: butcher it (venison, and the antlers off a buck)
  action(pos) {
    for (const d of this.deer) {
      if (d.state !== 'dead' || d.butchered || d.pos.distanceTo(pos) > 2.6) continue;
      return { label: d.buck ? 'Butcher the buck (venison, antlers)' : 'Butcher the deer (venison)', run: () => {
        d.butchered = true; d.t = Math.max(d.t, 100);
        const sb = this.game.portSandbox, q = new THREE.Quaternion();
        for (const id of d.buck ? ['venison', 'antlers'] : ['venison']) { const def = ITEM_BY_ID[id]; if (def) sb.spawn(def, d.pos.clone().add(new THREE.Vector3(Math.random() - 0.5, 0.6, Math.random() - 0.5)), q, { noHistory: true }); }
        this.game.hud.toast(d.buck ? 'Venison and a set of antlers: the pawn shop will take both' : 'Venison: the pawn shop will take it', 0xc8a878);
      } };
    }
    return null;
  }

  update(dt) {
    this.t += dt;
    const P = this.playerPos(); if (!P) return;
    const g = this.game, onFoot = !g.vehicles?.active, car = g.vehicles?.active;
    const carSpeed = car ? Math.hypot(car.vel?.x || 0, car.vel?.z || 0) : 0;
    for (const d of this.deer) {
      const dist = Math.hypot(d.pos.x - P.x, d.pos.z - P.z);
      d.mesh.visible = dist < 420 && !d.gone;
      if (d.gone) { // waiting to come back (somewhere out of sight)
        d.gone -= dt;
        if (d.gone <= 0) { const p = d.herd.spot(); if (p && Math.hypot(p.x - P.x, p.z - P.z) > 150) { d.pos.set(p.x, d.herd.heightAt(p.x, p.z), p.z); d.state = 'graze'; d.t = 3; d.hp = 40; d.gone = 0; d.mesh.rotation.set(0, d.yaw, 0); } else d.gone = 5; }
        continue;
      }
      if (dist > 460) continue;
      const { legs, neck } = d.mesh.userData;
      if (d.state === 'dead') {
        d.t += dt; d.fall = Math.min(1, d.fall + dt * 2.5);
        d.mesh.rotation.set(0, d.yaw, d.fallSide * (Math.PI / 2) * d.fall, 'YXZ');
        d.mesh.position.set(d.pos.x, d.pos.y + 0.25 * d.fall, d.pos.z);
        for (const l of legs) l.rotation.x *= 0.9;
        if (d.t > 150 && dist > 120) { d.gone = 30; d.mesh.visible = false; }
        continue;
      }
      // spooked by someone close on foot, or a car coming
      if (d.state !== 'flee' && ((onFoot && dist < 15) || (!onFoot && dist < 40 && carSpeed > 4))) this.bolt(d, P);
      // hit by a car
      if (car && dist < 2.6 && carSpeed > 6) { this.kill(d, new THREE.Vector3(car.vel.x, 0, car.vel.z).normalize()); continue; }
      let speed = 0, want = d.yaw;
      if (d.state === 'graze') {
        d.t -= dt; neck.rotation.x += (1.1 - neck.rotation.x) * Math.min(1, dt * 3);
        if (d.t <= 0) { // wander off a little way
          for (let k = 0; k < 6; k++) { const a = Math.random() * 6.3, r = 10 + Math.random() * 30, x = d.pos.x + Math.sin(a) * r, z = d.pos.z + Math.cos(a) * r; if (d.herd.ok(x, z)) { d.target = new THREE.Vector3(x, 0, z); break; } }
          d.state = d.target ? 'walk' : 'graze'; d.t = 4 + Math.random() * 8;
        }
      } else if (d.state === 'walk') {
        neck.rotation.x += (0 - neck.rotation.x) * Math.min(1, dt * 3);
        const dx = d.target.x - d.pos.x, dz = d.target.z - d.pos.z;
        want = Math.atan2(dx, dz); speed = 1.3;
        if (Math.hypot(dx, dz) < 1.5) { d.state = 'graze'; d.t = 5 + Math.random() * 10; d.target = null; }
      } else { // flee: away from whatever spooked it, bounding
        neck.rotation.x += (-0.3 - neck.rotation.x) * Math.min(1, dt * 5);
        want = Math.atan2(d.pos.x - d.from.x, d.pos.z - d.from.z) + Math.sin(this.t * 1.3 + d.phase) * 0.4; speed = 10;
        d.t -= dt; if (d.t <= 0) { d.state = 'graze'; d.t = 4; }
      }
      if (speed) {
        let dy = want - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        d.yaw += Math.max(-dt * 3.5, Math.min(dt * 3.5, dy));
        const nx = d.pos.x + Math.sin(d.yaw) * speed * dt, nz = d.pos.z + Math.cos(d.yaw) * speed * dt;
        if (d.herd.ok(nx, nz)) { d.pos.x = nx; d.pos.z = nz; } else { d.yaw += Math.PI * 0.6; if (d.state === 'walk') { d.state = 'graze'; d.t = 2; } }
        d.pos.y = d.herd.heightAt(d.pos.x, d.pos.z);
        d.phase += dt * speed * (speed > 5 ? 1.1 : 3.2);
      }
      const amp = speed > 5 ? 0.9 : speed ? 0.35 : 0;
      legs.forEach((l, i) => { l.rotation.x = amp * Math.sin(d.phase + (speed > 5 ? (i < 2 ? 0 : Math.PI) : (i % 3 ? 0 : Math.PI))); });
      const hop = speed > 5 ? Math.abs(Math.sin(d.phase)) * 0.45 : 0;
      d.mesh.position.set(d.pos.x, d.pos.y + hop, d.pos.z);
      d.mesh.rotation.set(0, d.yaw, 0);
    }
  }
}

// ---------------------------------------------------------------- the life in it: fires flicker, chimneys smoke, windows light up
export class Woods {
  constructor(game) { this.game = game; this.fires = []; this.chimneys = []; this.t = 0; this.smokeT = 0; }
  update(dt) {
    const g = this.game; this.t += dt;
    const night = g.daynight?.night ?? 0;
    const M = woodMats(); M.glass.emissiveIntensity = 0.05 + night * 0.9; M.lantern.emissiveIntensity = 0.3 + night * 1.4;
    for (const m of this.nightMats || []) m.emissiveIntensity = 0.15 + night * 1.8;
    const P = g.camera.position;
    for (const f of this.fires) {
      const near = f.pos.distanceTo(P) < 260;
      for (const fl of f.flames) { fl.visible = near; if (!near) continue; const k = 0.8 + 0.25 * Math.sin(this.t * 13 + fl.userData.s * 9) + 0.15 * Math.sin(this.t * 23 + fl.userData.s * 3); fl.scale.set(1, k, 1); fl.position.y = fl.userData.base + (k - 1) * 0.4; }
      f.light.intensity = near ? (0.6 + night * 2.6) * (0.85 + 0.15 * Math.sin(this.t * 17)) : 0;
    }
    this.smokeT -= dt;
    if (this.smokeT <= 0 && g.fx) {
      this.smokeT = 0.35;
      for (const c of this.chimneys) if (c.distanceTo(P) < 220) g.fx.emit(c.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.4 + 0.3, 1.4, (Math.random() - 0.5) * 0.4), 0x8a8682, 3.5, -0.06, 0.5);
      for (const f of this.fires) if (f.pos.distanceTo(P) < 120) g.fx.emit(f.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.2, (Math.random() - 0.5) * 0.3), 0x6a6460, 2.5, -0.05, 0.5);
    }
  }
}
