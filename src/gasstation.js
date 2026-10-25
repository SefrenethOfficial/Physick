import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { std, sign, canvasTex, speckle } from './buildkit.js';

// Roadside gas stations and the Saltmarsh general store, built properly: a kerbed concrete
// forecourt that sits on its own foundation (so it never floats or sinks on a slope), a canopy
// on steel columns with lights underneath, pump islands with real-looking dispensers and hoses,
// a convenience store with a glass shopfront, a price pylon, and the clutter that goes with it.

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// Everything is built in the station's own frame: +z is the road side, x along the road.
class Kit {
  constructor(group, sb, x, y, z, yaw) {
    this.g = new THREE.Group();
    this.g.position.set(x, y, z);
    this.g.rotation.y = yaw;
    group.add(this.g);
    this.sb = sb;
    this.q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.o = new THREE.Vector3(x, y, z);
  }

  world(lx, ly, lz) { return new THREE.Vector3(lx, ly, lz).applyQuaternion(this.q).add(this.o); }

  box(w, h, d, x, y, z, mat, { collide = false, rx = 0, ry = 0, shadow = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.set(rx, ry, 0);
    m.castShadow = shadow; m.receiveShadow = true;
    this.g.add(m);
    if (collide) {
      const p = this.world(x, y + h / 2, z);
      const q = this.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)));
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, p.y, p.z).setRotation(q));
    }
    return m;
  }

  cyl(r0, r1, h, x, y, z, mat, seg = 12, { collide = false } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    this.g.add(m);
    if (collide) { const p = this.world(x, y + h / 2, z); this.sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(h / 2, Math.max(r0, r1)).setTranslation(p.x, p.y, p.z)); }
    return m;
  }

  // a sign on a face of the kit, in local coordinates (yaw local)
  sign(text, x, y, z, yaw, opts) {
    const m = sign(this.g, text, x, y, z, yaw, opts);
    return m;
  }
}

const concreteTex = (base = '#b4b0a6', lines = true) => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = base; c.fillRect(0, 0, w, h); speckle(c, w, h, 1800, 0.06);
  for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(40,30,20,0.07)'; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 6 + Math.random() * 14, Math.random() * 3, 0, 7); c.fill(); } // oil stains
  if (lines) { c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); }
});

// A fuel dispenser: a tall cabinet with a lit display, nozzles in holsters both sides, hoses.
function dispenser(k, x, z, { body = 0xf2f0ea, trim = 0xc23b2a, old = false } = {}, y0 = 0.3) {
  const bodyM = std({ color: body, roughness: 0.5 }), trimM = std({ color: trim, roughness: 0.5 }), black = std({ color: 0x18191c, roughness: 0.6 });
  if (old) { // a rounded 1950s pump
    k.box(0.9, 1.5, 0.6, x, y0, z, bodyM, { collide: true });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 16, 1, false, 0, Math.PI), bodyM);
    top.rotation.set(0, 0, Math.PI / 2); top.rotation.order = 'ZYX'; top.position.set(x, y0 + 1.5, z); top.scale.set(1, 1, 1); k.g.add(top);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc860, emissiveIntensity: 0.6 }));
    globe.position.set(x, y0 + 2.15, z); k.g.add(globe);
    for (const s of [-1, 1]) { k.box(0.5, 0.35, 0.02, x, y0 + 0.95, z + s * 0.31, std({ color: 0xf2efe6, emissive: 0x302820 })); k.box(0.14, 0.3, 0.12, x + 0.3, y0 + 0.5, z + s * 0.36, trimM); }
    k.box(0.92, 0.12, 0.62, x, y0 + 0.4, z, trimM);
    return;
  }
  k.box(1.1, 0.25, 0.7, x, y0, z, black); // plinth
  k.box(1.0, 1.95, 0.55, x, y0 + 0.25, z, bodyM, { collide: true });
  k.box(1.02, 0.42, 0.57, x, y0 + 1.85, z, trimM); // brand header
  const scr = new THREE.MeshStandardMaterial({ map: canvasTex(64, 32, (c, w, h) => { c.fillStyle = '#0a1a10'; c.fillRect(0, 0, w, h); c.fillStyle = '#7dff9a'; c.font = 'bold 11px monospace'; c.fillText('$ 00.00', 4, 13); c.fillText('GAL 0.000', 4, 27); }), emissive: 0xffffff, emissiveMap: canvasTex(64, 32, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#7dff9a'; c.font = 'bold 11px monospace'; c.fillText('$ 00.00', 4, 13); c.fillText('GAL 0.000', 4, 27); }), emissiveIntensity: 0.8 });
  for (const s of [-1, 1]) {
    k.box(0.6, 0.32, 0.02, x, y0 + 1.42, z + s * 0.285, scr, { shadow: false }); // display
    k.box(0.5, 0.18, 0.02, x, y0 + 1.1, z + s * 0.285, black, { shadow: false }); // keypad / card slot
    for (const [gx, col] of [[-0.3, 0x2fa84f], [0, 0xe0b42b], [0.3, 0x1b1b1b]]) { // three grades, three nozzles
      k.box(0.16, 0.24, 0.12, x + gx, y0 + 0.7, z + s * 0.33, std({ color: col, roughness: 0.4 }));
      k.box(0.05, 0.05, 0.22, x + gx, y0 + 0.8, z + s * 0.42, black);
    }
    // a hose hanging in a loop down the side
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x + 0.45, y0 + 1.7, z + s * 0.2), new THREE.Vector3(x + 0.62, y0 + 1.0, z + s * 0.32), new THREE.Vector3(x + 0.6, y0 + 0.35, z + s * 0.36), new THREE.Vector3(x + 0.3, y0 + 0.72, z + s * 0.4)]);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 6), black);
    k.g.add(hose);
  }
}

// ---------------------------------------------------------------- a gas station
// opts: name, brand colours, old (rustic desert style), w/d of the forecourt.
export function gasStation(group, sb, x, y, z, yaw, { name = 'GAS', sub = 'FOOD · DRINKS · ICE', brand = 0xc23b2a, brand2 = 0xf2f0ea, old = false, prices = ['3.49', '3.79', '4.09'], loot = [] } = {}) {
  const k = new Kit(group, sb, x, y, z, yaw);
  const W = 42, D = 32; // forecourt, x along the road, z back from it (road side is +z)
  // ---- the forecourt slab: a thick block sunk into the ground so it can't float, with a kerb
  const slabM = std({ map: (() => { const t = concreteTex(old ? '#a89c86' : '#b8b4aa'); t.repeat.set(W / 6, D / 6); return t; })(), roughness: 0.95 });
  const slab = k.box(W, 1.6, D, 0, -1.45, 0, slabM, { collide: true });
  slab.castShadow = false;
  const kerbM = std({ color: old ? 0x9a9284 : 0xd8d6d0, roughness: 0.8 });
  for (const s of [-1, 1]) k.box(W + 0.4, 0.25, 0.3, 0, 0, s * (D / 2), kerbM, { shadow: false });
  for (const s of [-1, 1]) k.box(0.3, 0.25, D, s * (W / 2), 0, 0, kerbM, { shadow: false });
  // (gaps in the kerb on the road side for the way in and out)
  for (const s of [-1, 1]) k.box(8, 0.27, 0.34, s * 13, -0.01, D / 2, slabM, { shadow: false });
  // driveways out to the road (sunk like the forecourt, so they meet the tarmac)
  for (const s of [-1, 1]) k.box(8, 1.6, 7, s * 13, -1.47, D / 2 + 3.5, slabM, { collide: true }).castShadow = false;
  // painted parking bays in front of the shop
  const paint = std({ color: old ? 0xd8cfa8 : 0xf2f2ee, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  for (let i = 0; i <= 5; i++) k.box(0.12, 0.01, 4.6, -18 + i * 3, 0.16, -8.4, paint, { shadow: false });

  // ---- the shop at the back
  const shopW = 16, shopD = 9, shopH = 4.4, sx = -10, sz = -D / 2 + shopD / 2 + 0.8;
  const wallM = std({ color: old ? 0xd9c7a2 : 0xece9e2, roughness: 0.85 });
  const brandM = std({ color: brand, roughness: 0.5 }), brand2M = std({ color: brand2, roughness: 0.5 });
  k.box(shopW, shopH, shopD, sx, 0.15, sz, wallM, { collide: true });
  k.box(shopW + 0.6, 0.9, shopD + 0.6, sx, 0.15 + shopH, sz, brandM); // parapet / sign band
  k.box(shopW + 0.62, 0.15, shopD + 0.62, sx, 0.15 + shopH + 0.38, sz, brand2M, { shadow: false }); // stripe
  const front = sz + shopD / 2 + 0.01;
  // shopfront: big windows either side of glass doors, with shelves and posters behind
  const glassM = new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2c4a5e'); gr.addColorStop(1, '#1a2a36'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 3; r++) { c.fillStyle = '#c8c4bc'; c.fillRect(0, 40 + r * 30, w, 3); for (let i = 0; i < 26; i++) { c.fillStyle = ['#c23b2a', '#2f7fd8', '#e0b42b', '#3aa760', '#f2efe6', '#8a54c9'][(i * 7 + r) % 6]; c.fillRect(4 + i * 9.6, 22 + r * 30, 7, 17); } }
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(70, 0); c.lineTo(0, 90); c.fill();
  }), roughness: 0.1, metalness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.12 });
  glassM.emissiveMap = glassM.map;
  const frameM = std({ color: 0x2a2c30, metalness: 0.5, roughness: 0.4 });
  for (const s of [-1, 1]) {
    k.box(5.6, 2.4, 0.05, sx + s * 4.4, 0.8, front, glassM, { shadow: false });
    k.box(5.8, 0.12, 0.1, sx + s * 4.4, 3.22, front + 0.02, frameM); k.box(5.8, 0.12, 0.1, sx + s * 4.4, 0.7, front + 0.02, frameM);
    k.box(0.12, 2.6, 0.1, sx + s * 7.2, 0.7, front + 0.02, frameM);
  }
  k.box(2.4, 2.6, 0.05, sx, 0.15, front, new THREE.MeshStandardMaterial({ color: 0x9ec5e8, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55 }), { shadow: false }); // doors
  k.box(0.06, 2.6, 0.1, sx, 0.15, front + 0.03, frameM); k.box(2.6, 0.14, 0.12, sx, 2.75, front + 0.03, frameM);
  for (const s of [-1, 1]) k.box(0.04, 0.5, 0.06, sx + s * 0.18, 1.2, front + 0.08, std({ color: 0xc8ccd0, metalness: 0.8 }));
  k.sign(name, sx, 0.15 + shopH + 0.45, front + 0.32, 0, { w: shopW - 2, h: 0.75, bg: hex(brand), fg: hex(brand2), glow: true });
  k.sign('OPEN 24 HRS', sx + 4.4, 2.75, front + 0.04, 0, { w: 1.6, h: 0.35, bg: '#111111', fg: '#ff4040', glow: true });
  k.sign(sub, sx - 4.4, 2.75, front + 0.04, 0, { w: 2.6, h: 0.3, bg: '#f2efe6', fg: hex(brand) });
  // a sidewalk in front of the shop, and the stuff that lives on it
  k.box(shopW + 2, 0.2, 2.2, sx, 0, front + 1.1, kerbM, { shadow: false });
  const ice = std({ color: 0xf2f6fa, roughness: 0.4 });
  k.box(1.6, 1.2, 0.8, sx + 9.2, 0.2, front + 0.6, ice, { collide: true }); k.sign('ICE', sx + 9.2, 1.0, front + 1.02, 0, { w: 1.2, h: 0.4, bg: '#2f7fd8', fg: '#ffffff' });
  const cage = std({ color: 0x8a8f96, metalness: 0.5, roughness: 0.5 });
  k.box(1.4, 1.6, 0.9, sx - 9.4, 0.2, front + 0.55, cage, { collide: true });
  for (let i = 0; i < 4; i++) k.cyl(0.15, 0.15, 0.6, sx - 9.9 + i * 0.32, 0.3, front + 0.55, std({ color: 0xf2f2ee }), 10);
  k.box(0.5, 0.9, 0.4, sx + 5.6, 0.2, front + 0.5, std({ color: 0x2f5f9f })); // newspaper box
  k.cyl(0.32, 0.3, 0.9, sx - 5.6, 0.2, front + 0.5, std({ color: 0x3a3d40 }), 12, { collide: true }); // bin
  // the back wall: an AC unit and a door
  k.box(1.6, 1, 1.2, sx + 4, 0.15 + shopH + 0.9, sz - 1, std({ color: 0xb8bcc2, metalness: 0.4 }));
  for (const p of [[sx - 4, 1, front + 1.4], [sx + 3, 1, front + 1.4]]) loot.push(k.world(...p));

  // ---- the canopy over two pump islands, nearer the road
  const cx = 7, cz = 5, cW = 22, cD = 12, cH = 5.2;
  const steel = std({ color: old ? 0x8a6a4a : 0xe8e8e4, metalness: old ? 0.1 : 0.5, roughness: 0.5 });
  for (const ox of [-cW / 2 + 3, cW / 2 - 3]) for (const oz of [-2.5, 2.5]) k.box(0.45, cH, 0.45, cx + ox, 0.15, cz + oz, steel, { collide: true });
  k.box(cW, 0.35, cD, cx, 0.15 + cH, cz, std({ color: 0xf2f2ee, roughness: 0.6 })); // ceiling
  k.box(cW + 0.3, 0.9, cD + 0.3, cx, 0.15 + cH + 0.35, cz, brandM); // fascia
  k.box(cW + 0.32, 0.18, cD + 0.32, cx, 0.15 + cH + 0.6, cz, brand2M, { shadow: false });
  for (const s of [-1, 1]) k.sign(name, cx, 0.15 + cH + 0.8, cz + s * (cD / 2 + 0.17), s > 0 ? 0 : Math.PI, { w: 9, h: 0.6, bg: hex(brand), fg: hex(brand2), glow: true });
  // the lights under it
  const lightM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6dc, emissiveIntensity: 1.6 });
  for (const ox of [-7.5, -2.5, 2.5, 7.5]) for (const oz of [-3, 3]) k.box(1.4, 0.06, 0.6, cx + ox, 0.15 + cH - 0.05, cz + oz, lightM, { shadow: false });
  // two islands: a raised kerb with a dispenser each end, bollards to protect them
  const islandM = std({ color: 0xd8d6d0, roughness: 0.8 }), yellow = std({ color: 0xf2c418, roughness: 0.5 });
  for (const ix of [-4.5, 4.5]) {
    k.box(1.6, 0.3, 7.5, cx + ix, 0.15, cz, islandM, { collide: true });
    k.box(1.62, 0.08, 7.52, cx + ix, 0.35, cz, yellow, { shadow: false });
    for (const dz of [-1.9, 1.9]) dispenser(k, cx + ix, cz + dz, { body: old ? 0xc8b48a : 0xf2f0ea, trim: brand, old }, 0.45);
    for (const dz of [-3.6, 3.6]) k.cyl(0.12, 0.12, 1.1, cx + ix, 0.45, cz + dz, yellow, 10, { collide: true });
    k.box(0.5, 0.6, 0.4, cx + ix, 0.45, cz, std({ color: 0x2a6a3a })); // squeegee bucket / bin
  }
  // air & water by the side
  k.box(0.7, 1.4, 0.5, cx + cW / 2 + 2, 0.15, cz - 4, std({ color: old ? 0x7a5a3a : 0x2f5f9f }), { collide: true });
  k.sign('AIR', cx + cW / 2 + 2, 1.3, cz - 3.74, 0, { w: 0.5, h: 0.25, bg: '#f2efe6', fg: '#111111' });
  // ---- the price pylon by the road
  const px = W / 2 - 3, pz = D / 2 - 2.2;
  k.box(0.5, 6.2, 0.5, px, 0.15, pz, std({ color: 0x3a3c40, metalness: 0.4 }), { collide: true });
  k.box(3.4, 4.6, 0.5, px, 3.4, pz, brandM);
  for (const s of [-1, 1]) {
    k.sign(old ? name.split(' ').slice(-1)[0] : name.split(' ')[0], px, 7.35, pz + s * 0.26, s > 0 ? 0 : Math.PI, { w: 3.0, h: 0.8, bg: hex(brand), fg: hex(brand2), glow: true });
    prices.forEach((p, i) => k.sign(`${['REG', 'PLUS', 'DSL'][i]}  ${p}⁹`, px, 6.25 - i * 0.82, pz + s * 0.26, s > 0 ? 0 : Math.PI, { w: 2.9, h: 0.68, bg: '#111111', fg: i === 2 ? '#7dff9a' : '#ffd166', glow: true }));
  }
  // light poles at the corners of the lot
  for (const [lx, lz] of [[-W / 2 + 1, D / 2 - 1], [-W / 2 + 1, -D / 2 + 1], [W / 2 - 1, -D / 2 + 1]]) {
    k.cyl(0.1, 0.13, 7.5, lx, 0.15, lz, std({ color: 0x5a5c60, metalness: 0.4 }), 8, { collide: true });
    k.box(1.2, 0.2, 0.5, lx + (lx < 0 ? 0.5 : -0.5), 7.6, lz, lightM, { shadow: false });
  }
  if (old) { // a tyre stack and an old oil drum or two
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.16, 6, 14), std({ color: 0x151515 })); t.rotation.x = Math.PI / 2; t.position.set(sx + 10.5, 0.3 + i * 0.32, sz - 2); k.g.add(t); }
    for (const dx of [0, 0.8]) k.cyl(0.3, 0.3, 0.9, sx - 9 + dx, 0.15, sz - 3, std({ color: 0x8a3a1a, roughness: 0.9 }), 12, { collide: true });
  }
  k.g.traverse((o) => { if (o.isMesh && o.material.emissiveIntensity > 0.5) o.userData.noMerge = true; });
  return { group: k.g, front: k.world(0, 0, D / 2), size: [W, D], loot };
}

// ---------------------------------------------------------------- the Saltmarsh general store
// A two-storey clapboard store with a covered porch, big display windows and a flat above.
// front: the road side is +z in its own frame.
export function generalStore(group, sb, x, y, z, yaw, loot = []) {
  const k = new Kit(group, sb, x, y, z, yaw);
  const W = 18, D = 13, H1 = 4.2, H2 = 3.4;
  const clap = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#e6dcc4'; c.fillRect(0, 0, w, h); for (let yy = 0; yy < h; yy += 10) { c.fillStyle = 'rgba(0,0,0,0.13)'; c.fillRect(0, yy + 8, w, 2); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, yy, w, 1); } speckle(c, w, h, 300, 0.04); }, [W / 3, (H1 + H2) / 2.6]);
  const wallM = std({ map: clap, roughness: 0.85 });
  const trimM = std({ color: 0x2f4f2f, roughness: 0.6 }), white = std({ color: 0xf6f3ea, roughness: 0.6 });
  k.box(W + 1, 0.5, D + 1, 0, -0.35, 0, std({ color: 0x8a8070, roughness: 0.9 }), { collide: true }); // foundation
  k.box(W, H1 + H2, D, 0, 0.15, 0, wallM, { collide: true });
  // a false front with a cornice, taller than the roof
  k.box(W + 0.4, 1.6, 0.4, 0, 0.15 + H1 + H2, D / 2 - 0.2, wallM);
  k.box(W + 0.9, 0.3, 0.8, 0, 0.15 + H1 + H2 + 1.6, D / 2 - 0.2, trimM);
  k.box(W, 0.3, D, 0, 0.15 + H1 + H2, 0, std({ color: 0x4a4a4a, roughness: 0.8 })); // roof
  for (const s of [-1, 1]) k.box(0.3, H1 + H2, 0.3, s * (W / 2), 0.15, D / 2, white); // corner boards
  k.box(W + 0.1, 0.25, 0.25, 0, 0.15 + H1, D / 2 + 0.05, white); // band between floors
  k.sign('SALTMARSH GENERAL STORE', 0, 0.15 + H1 + H2 + 0.6, D / 2 + 0.03, 0, { w: W - 2, h: 1.1, bg: '#2f4f2f', fg: '#ffe7a0' });
  k.sign('EST. 1908 · GROCERIES · HARDWARE · BAIT · POST OFFICE', 0, 0.15 + H1 + 0.55, D / 2 + 2.62, 0, { w: 9, h: 0.38, bg: '#f6f3ea', fg: '#2f4f2f' });
  // display windows with goods behind, and a screen door between them
  const shopGlass = new THREE.MeshStandardMaterial({ map: canvasTex(256, 160, (c, w, h) => {
    c.fillStyle = '#2a3a3e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#6a4a30'; for (let r = 0; r < 3; r++) c.fillRect(0, 50 + r * 38, w, 5);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 18; i++) { c.fillStyle = ['#c23b2a', '#e0b42b', '#f2efe6', '#3a7d6a', '#8a5a3a', '#2f7fd8'][(i * 5 + r * 3) % 6]; const hh = 12 + ((i * 7) % 3) * 6; c.fillRect(6 + i * 13.6, 50 + r * 38 - hh, 10, hh); }
    c.fillStyle = '#f2efe6'; c.font = 'bold 18px Georgia'; c.fillText('FRESH BREAD', 60, 22);
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(90, 0); c.lineTo(0, 120); c.fill();
  }), roughness: 0.1, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.1 });
  shopGlass.emissiveMap = shopGlass.map;
  for (const s of [-1, 1]) {
    k.box(5.6, 2.6, 0.05, s * 4.9, 0.85, D / 2 + 0.02, shopGlass, { shadow: false });
    k.box(5.9, 0.18, 0.2, s * 4.9, 0.75, D / 2 + 0.06, trimM); k.box(5.9, 0.18, 0.2, s * 4.9, 3.45, D / 2 + 0.06, trimM);
    for (const t of [-1, 0, 1]) k.box(0.12, 2.7, 0.15, s * 4.9 + t * 2.85, 0.8, D / 2 + 0.07, trimM);
    k.box(5.6, 0.75, 0.3, s * 4.9, 0.15, D / 2 + 0.15, white); // stall riser below the window
  }
  k.box(1.6, 2.6, 0.08, 0, 0.15, D / 2 + 0.03, std({ color: 0x3a2618 }));
  k.box(1.2, 1.4, 0.05, 0, 1.05, D / 2 + 0.08, std({ color: 0x9ec5e8, roughness: 0.1, metalness: 0.4 }));
  k.box(2.1, 0.2, 0.2, 0, 2.75, D / 2 + 0.1, trimM);
  // upstairs: sash windows
  for (const wx of [-6, -2, 2, 6]) { k.box(1.3, 1.7, 0.08, wx, 0.15 + H1 + 0.8, D / 2 + 0.03, std({ color: 0x2c4a5e, roughness: 0.15 })); k.box(1.5, 0.15, 0.25, wx, 0.15 + H1 + 0.7, D / 2 + 0.1, white); k.box(1.5, 0.12, 0.2, wx, 0.15 + H1 + 2.52, D / 2 + 0.1, white); k.box(1.3, 0.08, 0.1, wx, 0.15 + H1 + 1.6, D / 2 + 0.08, white); }
  // the porch: boards, posts, a sloped roof
  const deckM = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#8a6a48'; c.fillRect(0, 0, w, h); for (let xx = 0; xx < w; xx += 8) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(xx, 0, 1.5, h); } }, [W / 2, 1]), roughness: 0.9 });
  k.box(W, 0.35, 3, 0, -0.1, D / 2 + 1.5, deckM, { collide: true });
  for (let i = 0; i < 2; i++) k.box(3.4, 0.17, 0.4, 0, -0.1 - i * 0.17, D / 2 + 3.2 + i * 0.4, deckM, { collide: true }); // steps
  for (const px of [-W / 2 + 0.3, -3, 3, W / 2 - 0.3]) k.box(0.22, 3.6, 0.22, px, 0.25, D / 2 + 2.8, white, { collide: true });
  const pr = k.box(W + 0.6, 0.15, 3.4, 0, 0.15 + H1 - 0.15, D / 2 + 1.6, std({ color: 0x2f4f2f, roughness: 0.6 }), { rx: 0.12 });
  pr.position.y -= 0.2;
  for (const s of [-1, 1]) k.box(0.08, 0.9, 2.6, s * (W / 2 - 0.3), 0.25, D / 2 + 1.5, white); // rails at the ends
  // things on the porch: a bench, an ice chest, barrels, flower boxes, a bike rack, a mailbox
  const wood = std({ color: 0x6a4a30, roughness: 0.9 });
  k.box(2.2, 0.1, 0.5, -6.5, 0.7, D / 2 + 1.2, wood); k.box(2.2, 0.5, 0.1, -6.5, 0.75, D / 2 + 0.95, wood); for (const s of [-1, 1]) k.box(0.1, 0.45, 0.45, -6.5 + s * 1, 0.25, D / 2 + 1.2, wood);
  k.box(1.5, 1.1, 0.75, 6.6, 0.25, D / 2 + 1.0, std({ color: 0xf2f6fa, roughness: 0.4 }), { collide: true });
  k.sign('ICE', 6.6, 1.0, D / 2 + 1.39, 0, { w: 1.0, h: 0.35, bg: '#2f7fd8', fg: '#ffffff' });
  for (const [bx, bz] of [[8.4, D / 2 + 1.8], [8.4, D / 2 + 0.9]]) k.cyl(0.32, 0.36, 0.85, bx, 0.25, bz, std({ color: 0x7a5434, roughness: 0.9 }), 12);
  for (const s of [-1, 1]) {
    k.box(5.2, 0.3, 0.35, s * 4.9, 0.15 + 0.75, D / 2 + 0.35, std({ color: 0x5a3a24 }));
    for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), std({ color: [0xe8789f, 0xf2d23a, 0xc23b2a, 0xf2f2ee][i % 4] })); f.position.set(s * 4.9 - 2.2 + i * 0.55, 0.15 + 1.15, D / 2 + 0.35); k.g.add(f); }
  }
  const rack = std({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 16, Math.PI), rack); r.position.set(-W / 2 - 1.5, 0, D / 2 + 1 + i * 0.6); r.rotation.y = Math.PI / 2; k.g.add(r); }
  k.box(0.45, 1.1, 0.45, W / 2 + 1.2, -0.3, D / 2 + 3.2, std({ color: 0x2f5f9f }), { collide: true }); // mailbox
  k.sign('U.S. MAIL', W / 2 + 1.2, 0.55, D / 2 + 3.43, 0, { w: 0.42, h: 0.16, bg: '#2f5f9f', fg: '#ffffff' });
  // a side lean-to with sacks of feed and a stack of crates
  k.box(4, 2.6, D - 3, W / 2 + 2, 0.15, -1, std({ color: 0x8a6a48, roughness: 0.9 }), { collide: true });
  k.box(4.4, 0.15, D - 2.6, W / 2 + 2.1, 2.8, -1, std({ color: 0x4a4a4a }), { rx: 0, ry: 0 });
  for (let i = 0; i < 5; i++) k.box(0.8, 0.5, 0.5, -W / 2 - 1.2, 0.15 + (i % 2) * 0.5, D / 2 - 1 - Math.floor(i / 2) * 0.6, std({ color: 0xd8c8a0, roughness: 1 }));
  for (const p of [[-6.5, 1.0, D / 2 + 1.3], [3.5, 0.5, D / 2 + 1.5], [8.4, 1.3, D / 2 + 1.8]]) loot.push(k.world(...p));
  return { group: k.g, loot, door: k.world(0, 0, D / 2 + 3.6) };
}
