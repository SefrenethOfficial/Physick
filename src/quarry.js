import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { std, sign, canvasTex, speckle, carMesh } from './buildkit.js';
import { Frame, woodMats } from './woods.js';

// Ridgeback Aggregates: a gravel quarry dug into a hill. A square pit with three terraced benches
// down to the floor (ridgeback.js shapes the ground), the haul road coming in through a cutting
// from the north, and on the floor: the crusher, the screens and their conveyors, the stockpiles,
// an excavator loading a haul truck, a wheel loader, the site office, floodlights, the explosives
// store and a sump pond. A fence runs round the top edge.

export const PIT = { floor: 45, rim: 90, bench: 15, face: 5, lift: 10 };

export function buildQuarry(rb, g, sb) {
  const q = rb.quarry, f = rb.quarryFloor();
  const F = new Frame(g, sb, q.x, f, q.z, 0), W = woodMats();
  const out = { loot: [], lamps: [] };
  const yellow = std({ color: 0xe0b42b, roughness: 0.55 }), steel = std({ color: 0x6a6e74, metalness: 0.6, roughness: 0.5 }), dark = std({ color: 0x232528, roughness: 0.6 });
  const rubber = std({ color: 0x161616, roughness: 0.9 }), glass = std({ color: 0x2c3a44, roughness: 0.15, metalness: 0.4 }), conc = std({ color: 0x9a968e, roughness: 0.95 });
  const lampM = std({ color: 0xfff6dc, emissive: 0xfff0c8, emissiveIntensity: 0.2 }); out.lampM = lampM;
  const gravel = (c) => std({ color: c, roughness: 1, flatShading: true });

  // ---- a conveyor: a belt on a truss from a to b ([x, y, z]), on legs down to the floor
  const conveyor = (a, b, legs = true) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz), yaw = Math.atan2(dx, dz), pitch = -Math.asin(dy / L);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const G = new Frame(g, sb, q.x + mid[0], f + mid[1], q.z + mid[2], yaw);
    G.mesh(new THREE.BoxGeometry(1.2, 0.12, L), dark, 0, 0.1, 0, { rx: pitch });
    for (const s of [-1, 1]) G.mesh(new THREE.BoxGeometry(0.1, 0.5, L), yellow, s * 0.7, -0.15, 0, { rx: pitch });
    G.mesh(new THREE.BoxGeometry(1.5, 0.08, L), steel, 0, -0.4, 0, { rx: pitch, cast: false });
    if (legs) for (let t = 0.2; t < 0.95; t += 6 / L) {
      const x = a[0] + dx * t, y = a[1] + dy * t, z = a[2] + dz * t;
      for (const s of [-1, 1]) F.box(0.18, y - 0.4, 0.18, x + Math.cos(yaw) * s * 0.7, 0, z - Math.sin(yaw) * s * 0.7, steel, { collide: false });
      F.collider(1.6, y - 0.5, 0.3, x, 0, z, { ry: yaw });
    }
  };
  const pile = (x, z, r, h, c) => {
    F.mesh(new THREE.ConeGeometry(r, h, 16), gravel(c), x, h / 2, z);
    const p = F.world(x, h / 2, z); sb.addStaticCollider(RAPIER.ColliderDesc.cone(h / 2, r * 0.9).setTranslation(p.x, p.y, p.z));
  };

  // ---- the crusher: a hopper on a steel frame, the jaw crusher under it, the motor house beside
  { const cx = -30, cz = -24;
    for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) F.box(0.5, 6, 0.5, cx + a, 0, cz + b, steel, { collide: false });
    F.box(5, 3.5, 5, cx, 2.2, cz, yellow); F.collider(6.6, 6, 6.6, cx, 0, cz);
    const hop = F.mesh(new THREE.CylinderGeometry(4.6, 1.8, 3.2, 4, 1, true), steel, cx, 7.3, cz, { ry: Math.PI / 4 }); hop.material = steel;
    F.box(6.8, 0.25, 6.8, cx, 5.7, cz, yellow, { collide: false });
    F.box(5, 4, 7, cx - 6.5, 0, cz, std({ color: 0x8a8e94, metalness: 0.5, roughness: 0.6 })); F.box(5.4, 0.3, 7.4, cx - 6.5, 4, cz, dark, { collide: false });
    sign(g, 'PRIMARY CRUSHER', ...F.world(cx - 3.95, 3.0, cz).toArray(), Math.PI / 2, { w: 3.2, h: 0.5, bg: '#1b1b1b', fg: '#e0b42b' });
    // the screen tower, and the belts between them and out to the stockpiles
    const sx = -6, sz = -33;
    for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) F.box(0.35, 7, 0.35, sx + a, 0, sz + b, steel, { collide: false });
    F.box(4.6, 2.2, 4.6, sx, 7, sz, yellow, { rx: 0.12 }); F.collider(4.4, 7, 4.4, sx, 0, sz);
    F.box(4.2, 0.8, 4.2, sx, 2.2, sz, steel, { collide: false });
    conveyor([cx, 2.2, cz + 3.5], [cx, 11.5, 6]);
    pile(cx, 12, 9, 10, 0x9a968e);
    conveyor([cx + 3.5, 2.5, cz - 1], [sx - 2.5, 8.6, sz + 0.5]);
    conveyor([sx + 2.2, 7.2, sz], [16, 9, sz]);
    pile(19, sz, 8, 9, 0xb8a684);
    conveyor([sx, 6.8, sz + 2.2], [sx - 2, 8, -6]);
    pile(sx - 2, -4, 7, 7.5, 0xa0644a);
    out.loot.push(F.world(cx - 6.5, 0.4, cz + 4.2)); }

  // ---- machines: an excavator at the face loading a haul truck, the loader by the piles, another truck
  const haulTruck = (x, z, yaw, tipped = 0) => {
    const T = new Frame(g, sb, q.x + x, f, q.z + z, yaw);
    T.box(3.6, 0.8, 9, 0, 1.0, 0, dark, { collide: false });
    T.box(4.2, 2.4, 5.6, 0, 2.0, -1.4, yellow, { collide: false, rx: -tipped }); // the bed
    T.box(3.8, 0.2, 5.2, 0, 4.42, -1.4, gravel(0xa8a090), { collide: false, rx: -tipped });
    T.box(4.2, 1.6, 2.6, 0, 1.8, 3.2, yellow, { collide: false }); // the engine
    T.box(1.6, 1.6, 1.8, -1.2, 3.4, 3.4, yellow, { collide: false }); T.box(1.5, 0.9, 0.06, -1.2, 4.0, 4.31, glass, { collide: false, cast: false }); // the cab, up on the left
    T.box(4.4, 0.25, 1.2, 0, 3.4, 4.6, yellow, { collide: false }); // the deck in front
    for (const [a, b] of [[-1.85, 3.0], [1.85, 3.0], [-1.85, -2.6], [1.85, -2.6]]) T.mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.0, 16), rubber, a, 1.3, b, { rz: Math.PI / 2 });
    T.collider(4.4, 4.6, 9.4, 0, 0, 0);
  };
  haulTruck(30, 9, Math.PI, 0); haulTruck(2, 24, 0.5, 0.35);
  // the excavator (tracks, the house on its turntable, boom, stick and a bucket up at the face)
  { const E = new Frame(g, sb, q.x + 33, f, q.z - 6, Math.PI / 2);
    for (const s of [-1, 1]) { E.box(1.0, 1.1, 5.2, s * 1.6, 0, 0, rubber, { collide: false }); E.box(0.9, 0.5, 4.6, s * 1.6, 0.3, 0, dark, { collide: false }); }
    E.box(3.4, 1.4, 4.2, 0, 1.3, -0.4, yellow, { collide: false }); E.box(3.4, 1.2, 1.2, 0, 1.4, -2.6, dark, { collide: false });
    E.box(1.2, 1.7, 1.6, -1.0, 2.7, 0.9, yellow, { collide: false }); E.box(1.1, 1.1, 0.05, -1.0, 3.1, 1.72, glass, { collide: false, cast: false });
    E.mesh(new THREE.BoxGeometry(0.7, 0.8, 6.2), yellow, 0.5, 4.7, 3.1, { rx: -0.65 }); // the boom
    E.mesh(new THREE.BoxGeometry(0.55, 0.6, 4.2), yellow, 0.5, 6.1, 7.2, { rx: 0.9 }); // the stick
    E.mesh(new THREE.BoxGeometry(1.6, 1.2, 1.2), dark, 0.5, 4.3, 8.6, { rx: 0.4 }); // the bucket
    E.collider(4.2, 3.6, 5.6, 0, 0, 0); }
  // the wheel loader, its bucket down by stockpile A
  { const L = new Frame(g, sb, q.x - 17, f, q.z + 13, -Math.PI / 2);
    L.box(2.6, 1.6, 3.2, 0, 1.0, -1.2, yellow, { collide: false }); L.box(2.4, 1.2, 2.2, 0, 1.2, 1.6, yellow, { collide: false });
    L.box(1.8, 1.6, 1.8, 0, 2.6, -0.2, yellow, { collide: false }); L.box(1.7, 1.0, 0.05, 0, 3.0, 0.72, glass, { collide: false, cast: false });
    L.box(3.4, 1.2, 1.2, 0, 0.15, 3.6, dark, { collide: false }); for (const s of [-1, 1]) L.box(0.25, 0.3, 2.4, s * 0.9, 0.9, 2.6, yellow, { collide: false, rx: -0.3 });
    for (const [a, b] of [[-1.35, 1.6], [1.35, 1.6], [-1.35, -1.6], [1.35, -1.6]]) L.mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.7, 14), rubber, a, 0.85, b, { rz: Math.PI / 2 });
    L.collider(3.4, 3.4, 7.4, 0, 0, 0.6); }
  // the drill rig up on the first bench, drilling the next blast
  { const D = new Frame(g, sb, q.x - 4, f + PIT.lift, q.z - 55, 0);
    for (const s of [-1, 1]) D.box(0.8, 0.8, 4, s * 1.2, 0, 0, rubber, { collide: false });
    D.box(2.6, 1.6, 3.2, 0, 0.8, -0.3, yellow, { collide: false }); D.box(1.3, 1.4, 1.3, -0.6, 2.4, -1.0, yellow, { collide: false });
    D.box(0.5, 9, 0.5, 0.6, 1.0, 1.6, dark, { collide: false, rx: 0.05 }); D.collider(3.2, 3.2, 4.2, 0, 0, 0);
    for (let i = 0; i < 8; i++) D.cyl(0.12, 0.12, 0.12, -6 + (i % 4) * 3, 0, 4 + Math.floor(i / 4) * 3, std({ color: 0xe04a20 }), { cast: false }); }

  // ---- the site office: two portable cabins, one on top of the other, stairs up the side
  { const O = new Frame(g, sb, q.x + 26, f, q.z + 33, Math.PI), cab = std({ color: 0xdedad0, roughness: 0.7 }), trimC = std({ color: 0x2a5a8a, roughness: 0.6 });
    const L0 = 9.6, D0 = 3.2, H0 = 2.8;
    // the lower one: you can walk in (door at the front, on the right)
    O.box(L0, 0.3, D0, 0, 0, 0, conc, { cast: false });
    O.box(L0, H0, 0.12, 0, 0.3, -D0 / 2, cab); O.box(0.12, H0, D0, -L0 / 2, 0.3, 0, cab); O.box(0.12, H0, D0, L0 / 2, 0.3, 0, cab);
    O.box(L0 - 3.2, H0, 0.12, -1.6, 0.3, D0 / 2, cab); O.box(1.6, H0, 0.12, L0 / 2 - 0.8, 0.3, D0 / 2, cab); O.box(1.0, 0.7, 0.12, 2.7, 0.3 + H0 - 0.7, D0 / 2, cab);
    O.box(L0 + 0.2, 0.2, D0 + 0.2, 0, 0.3 + H0, 0, trimC);
    for (const a of [-3.4, -1.0]) O.box(1.4, 0.9, 0.06, a, 1.3, D0 / 2 + 0.04, glass, { collide: false, cast: false });
    sign(g, 'SITE OFFICE · ALL VISITORS REPORT HERE', ...O.world(-1.6, 2.65, D0 / 2 + 0.08).toArray(), Math.PI, { w: 4.4, h: 0.4, bg: '#2a5a8a', fg: '#ffffff' });
    O.box(1.8, 0.75, 0.8, -3.2, 0.3, -0.9, W.planks); O.box(0.5, 0.5, 0.5, -3.2, 0.3, 0, dark, { collide: false }); // a desk and chair
    O.box(0.5, 1.3, 0.6, -4.4, 0.3, -1.1, steel); // filing cabinet
    O.box(2.2, 1.2, 0.05, 0, 1.2, -D0 / 2 + 0.1, std({ color: 0xf4f4f0 }), { collide: false, cast: false }); // whiteboard: the blast schedule
    O.box(1.5, 0.9, 0.6, 3.6, 0.3, -1.0, W.planks); O.cyl(0.08, 0.1, 0.25, 3.4, 1.2, -1.0, steel, { cast: false }); // the kettle
    out.loot.push(O.world(-3.2, 1.15, -0.9), O.world(3.8, 1.25, -1.0));
    out.office = O.world(2.7, 0, D0 / 2 + 1.2);
    // the upper one (solid), with a balcony walk and stairs
    O.box(L0, H0, D0, 0, 0.3 + H0 + 0.2, 0, cab); O.box(L0 + 0.2, 0.2, D0 + 0.2, 0, 0.3 + 2 * H0 + 0.2, 0, trimC);
    for (const a of [-3, 0, 3]) O.box(1.4, 0.9, 0.06, a, H0 + 1.5, D0 / 2 + 0.04, glass, { collide: false, cast: false });
    O.box(L0, 0.12, 1.2, 0, 0.3 + H0 + 0.2, D0 / 2 + 0.6, steel);
    O.box(L0, 1.0, 0.05, 0, 0.3 + H0 + 0.32, D0 / 2 + 1.18, steel, { collide: false }); O.collider(L0, 1.1, 0.1, 0, H0 + 0.6, D0 / 2 + 1.18);
    for (let i = 0; i < 13; i++) O.box(1.0, 0.1, 0.32, -L0 / 2 - 0.7, 0.26 * i + 0.12, -3.8 + i * 0.29, steel); // the stairs up the end
    O.box(1.2, 0.12, 2.9, -L0 / 2 - 0.6, H0 + 0.5, 1.4, steel); out.loot.push(O.world(2, H0 + 0.75, D0 / 2 + 0.6));
    // the pickup outside, a fuel tank, the generator
    const pick = carMesh(0xf2f2ee); pick.position.copy(F.world(14, 0, 36)); pick.rotation.y = 0.2; g.add(pick);
    { const p = F.world(14, 0.9, 36); sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.0, 0.9, 2.3).setTranslation(p.x, p.y, p.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2))); }
    F.mesh(new THREE.CylinderGeometry(1.2, 1.2, 5.5, 16), std({ color: 0xe8e6de, roughness: 0.5, metalness: 0.3 }), 38, 1.6, 22, { rx: Math.PI / 2 });
    for (const s of [-1.8, 1.8]) F.box(2.0, 0.6, 0.4, 38, 0, 22 + s, steel, { collide: false });
    F.collider(2.4, 2.8, 5.6, 38, 0, 22);
    sign(g, 'DIESEL · NO SMOKING', ...F.world(36.75, 1.7, 22).toArray(), -Math.PI / 2, { w: 2.6, h: 0.45, bg: '#c23b2a', fg: '#ffffff' });
    F.box(2.4, 1.6, 1.4, 38, 0, 29, std({ color: 0x3a6a3a, roughness: 0.6 })); }

  // ---- the explosives store: a red steel box behind an earth bank
  { const mx = -37, mz = 36;
    F.box(3.2, 2.5, 2.6, mx, 0, mz, std({ color: 0xa8281e, roughness: 0.6, metalness: 0.3 }));
    sign(g, 'DANGER · EXPLOSIVES', ...F.world(mx, 1.9, mz - 1.33).toArray(), Math.PI, { w: 2.6, h: 0.5, bg: '#ffffff', fg: '#c01a10' });
    for (const [w, d, a, b] of [[8, 1.6, 0, 3.4], [1.6, 7, -4.2, 0.5], [1.6, 7, 4.2, 0.5]]) F.box(w, 2.2, d, mx + a, 0, mz + b, gravel(0x8a7a62));
    out.loot.push(F.world(mx + 1.3, 0.2, mz - 2.0)); }

  // ---- the sump pond in the corner, and its pump
  { const water = new THREE.Mesh(new THREE.CircleGeometry(8.5, 28), new THREE.MeshStandardMaterial({ color: 0x4a6a5a, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.copy(F.world(30, -0.45, -30)); water.userData.noMerge = true; g.add(water);
    F.box(1.4, 1.0, 1.0, 38, 0, -22, std({ color: 0x2a5a8a, roughness: 0.6 })); F.mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8), dark, 34, 0.2, -26, { rz: Math.PI / 2, ry: -0.8, cast: false }); }

  // ---- floodlights on masts
  for (const [x, z, yaw] of [[-41, 41, -2.4], [41, -41, 0.8], [-41, -41, -0.8], [41, 41, 2.4]]) {
    const L = new Frame(g, sb, q.x + x, f, q.z + z, yaw);
    for (const [a, b] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) L.box(0.1, 14, 0.1, a, 0, b, steel, { collide: false });
    for (let y = 2; y < 14; y += 2.4) L.box(0.9, 0.06, 0.9, 0, y, 0, steel, { collide: false, cast: false });
    L.collider(1, 14, 1, 0, 0, 0);
    L.box(3.2, 0.2, 0.3, 0, 14, 0, steel, { collide: false });
    for (const a of [-1.2, -0.4, 0.4, 1.2]) { L.box(0.7, 0.55, 0.35, a, 14.2, 0.25, dark, { collide: false, rx: -0.5 }); L.box(0.6, 0.45, 0.04, a, 14.25, 0.45, lampM, { collide: false, cast: false, rx: -0.5 }); }
    out.lamps.push(L.world(0, 14, 1));
  }

  // ---- boulders on the floor and the benches (blasted rock), and blocks at the foot of the faces
  const rockM = gravel(0x8e8a82);
  const R = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(Math.random() * 4), lvl = Math.floor(Math.random() * 3), along = R(-40, 40), off = lvl === 0 ? R(38, 44) : 45 + lvl * 15 + R(0.5, 7);
    let x = [off, -off, along, along][side], z = [along, along, off, -off][side];
    if (z > 0 && Math.abs(x) < 20) continue; // (not in the way in)
    if (lvl === 0 && Math.random() < 0.5) { x = R(-20, 25); z = R(-25, 20); }
    const r = R(0.5, 1.8), y = rb.heightAt(q.x + x, q.z + z) - f;
    F.mesh(new THREE.DodecahedronGeometry(r, 0), rockM, x, y + r * 0.4, z, { rx: R(0, 3), ry: R(0, 6) });
    const p = F.world(x, y + r * 0.4, z); sb.addStaticCollider(RAPIER.ColliderDesc.ball(r * 0.8).setTranslation(p.x, p.y, p.z));
  }
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) F.box(1.6, 0.9, 0.8, s * 13, 0, 50 + i * 6, conc, { ry: Math.PI / 2 }); // the cutting's crash blocks

  // ---- the fence round the top (the cutting's left open), with warning signs
  { const meshTex = canvasTex(32, 32, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = '#b8bcc0'; c.lineWidth = 1.5; for (let i = -w; i < w * 2; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); c.beginPath(); c.moveTo(i, h); c.lineTo(i + h, 0); c.stroke(); } }, [1, 1]);
    const wire = std({ map: meshTex, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 });
    const S = PIT.rim - 2.5, n = 96, pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pts.push([Math.sign(s) * Math.pow(Math.abs(s), 1 / 3) * S, Math.sign(c) * Math.pow(Math.abs(c), 1 / 3) * S]); }
    let signs = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (mz > 0 && Math.abs(mx) < 26) continue;
      const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), y0 = rb.heightAt(q.x + mx, q.z + mz) - f;
      const panel = F.mesh(new THREE.PlaneGeometry(L, 1.8), wire, mx, y0 + 0.9, mz, { ry: yaw + Math.PI / 2, cast: false });
      const uv = panel.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * L / 0.5, uv.getY(k) * 1.8 / 0.5);
      F.box(0.08, 2.0, 0.08, x0, rb.heightAt(q.x + x0, q.z + z0) - f, z0, steel, { collide: false, cast: false });
      F.collider(L, 2.0, 0.1, mx, y0, mz, { ry: yaw + Math.PI / 2 });
      if (i % 12 === 6) { const p = F.world(mx, y0 + 1.2, mz); const out2 = Math.atan2(mx, mz); sign(g, signs++ % 2 ? 'DANGER · DEEP EXCAVATION' : 'KEEP OUT · QUARRY FACE', p.x + Math.sin(out2) * 0.08, p.y, p.z + Math.cos(out2) * 0.08, out2, { w: 2.4, h: 0.5, bg: '#c9b23a', fg: '#1b1b1b' }); }
    } }

  // ---- the gate at the mouth of the cutting, and the sign
  { const gz = 128, gy = rb.heightAt(q.x, q.z + gz) - f;
    for (const s of [-1, 1]) F.box(0.4, 1.4, 0.4, s * 7, gy, gz, yellow);
    F.mesh(new THREE.BoxGeometry(0.18, 7, 0.18), std({ color: 0xd8382a }), -7, gy + 4.6, gz, { rz: -0.15, cast: false }); // the boom, up
    sign(g, 'RIDGEBACK AGGREGATES', ...F.world(-12, gy + 2.6, gz + 2).toArray(), 0.3, { w: 6, h: 1.0, bg: '#e0b42b', fg: '#1b1b1b', post: f + gy });
    sign(g, 'HARD HATS · HI-VIS · 10 MPH · HAUL TRUCKS HAVE RIGHT OF WAY', ...F.world(12, gy + 2.0, gz + 2).toArray(), -0.3, { w: 6, h: 0.6, bg: '#ffffff', fg: '#1b1b1b', post: f + gy }); }
  return out;
}
void speckle;
