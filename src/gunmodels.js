import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Detailed gun models. Each is built in metres with the muzzle toward -Z and the grip down (-Y).
// The surfaces are painted on canvases: brushed and worn steel, stippled polymer, checkered grips,
// walnut, rails, and the maker's markings. Two-handed guns carry a "foregrip" marker where your
// other hand holds them (see Viewmodel.setHeld).

const cache = {};
function canvas(key, w, h, draw, repeat) {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(...repeat);
  return (cache[key] = t);
}
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); // (the same look every time)
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; };

// brushed steel: fine streaks along the length, a few scratches, worn bright at the edges
function metalTex(base, key = base) {
  return canvas(`metal${key}`, 256, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const y = rnd() * h, l = 20 + rnd() * 120, x = rnd() * w;
      g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.02 + rnd() * 0.05})` : `rgba(0,0,0,${0.04 + rnd() * 0.08})`;
      g.fillRect(x, y, l, 1);
    }
    for (let i = 0; i < 18; i++) { // scratches
      g.strokeStyle = `rgba(220,225,230,${0.08 + rnd() * 0.15})`; g.lineWidth = 0.6;
      g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 8); g.stroke();
    }
    const edge = g.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0, 'rgba(255,255,255,0.16)'); edge.addColorStop(0.08, 'rgba(255,255,255,0)'); edge.addColorStop(0.92, 'rgba(255,255,255,0)'); edge.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
  });
}
// slide with cocking serrations at the back
function slideTex(base) {
  return canvas(`slide${base}`, 256, 64, (g, w, h) => {
    g.drawImage(metalTex(base).image, 0, 0, w, h);
    for (let x = w - 70; x < w - 8; x += 7) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, 6, 3, h - 12); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 3, 6, 1, h - 12); }
    for (let x = 8; x < 50; x += 7) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, 6, 3, h - 12); }
  });
}
// stippled polymer
function polyTex(base) {
  return canvas(`poly${base}`, 128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.05)'; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
  }, [2, 2]);
}
// checkered grip panels
function checkerTex(base) {
  return canvas(`check${base}`, 128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
    for (let i = -w; i < w * 2; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let i = -w; i < w * 2; i += 8) { g.beginPath(); g.moveTo(i + 1, 0); g.lineTo(i + 1 + h, h); g.stroke(); }
  }, [1.5, 1.5]);
}
// walnut
function woodTex(base = '#6a3f22') {
  return canvas(`wood${base}`, 256, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '30,12,4' : '150,90,50'},${0.15 + rnd() * 0.25})`; g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath(); let y = rnd() * h; g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) { y += (rnd() - 0.5) * 3; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,220,180,0.06)'; g.fillRect(0, h * 0.2, w, h * 0.15);
  });
}
// a picatinny rail: ridges across the top
function railTex() {
  return canvas('rail', 128, 32, (g, w, h) => {
    g.fillStyle = '#26282b'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = '#3a3d42'; g.fillRect(x, 0, 4, h); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, 1, h); }
  });
}
// handguard with slots
function slotTex(base) {
  return canvas(`slots${base}`, 256, 64, (g, w, h) => {
    g.drawImage(polyTex(base).image, 0, 0, w, h);
    for (let x = 14; x < w - 20; x += 30) { g.fillStyle = 'rgba(0,0,0,0.75)'; g.beginPath(); g.roundRect(x, h * 0.35, 20, h * 0.3, 5); g.fill(); }
  });
}
// the maker's markings, stamped on the side
function markTex(base, lines, key) {
  return canvas(`mark${key}`, 512, 128, (g, w, h) => {
    g.drawImage(metalTex(base).image, 0, 0, w, h);
    g.font = 'bold 22px "Chakra Petch", Arial'; g.textBaseline = 'middle';
    lines.forEach((t, i) => { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(t, 31, 42 + i * 34 + 1); g.fillStyle = 'rgba(225,228,232,0.75)'; g.fillText(t, 30, 42 + i * 34); });
  });
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
const M = {
  steel: (base = '#2b2d31') => std({ map: metalTex(shade(base, 1.9)), metalness: 0.35, roughness: 0.42 }),
  stainless: () => std({ map: metalTex('#b8bec4'), metalness: 0.5, roughness: 0.28 }),
  poly: (base = '#1e2023') => std({ map: polyTex(shade(base, 1.6)), metalness: 0.05, roughness: 0.8 }),
  checker: (base = '#1d1e20') => std({ map: checkerTex(shade(base, 1.7)), roughness: 0.85 }),
  wood: (base) => std({ map: woodTex(base), roughness: 0.55, metalness: 0.05 }),
  rail: () => std({ map: railTex(), metalness: 0.3, roughness: 0.5 }),
  slots: (base = '#1e2023') => std({ map: slotTex(shade(base, 1.6)), roughness: 0.75 }),
  black: () => std({ color: 0x0b0b0c, roughness: 0.6 }),
  rubber: () => std({ color: 0x151515, roughness: 1 }),
  brass: () => std({ color: 0xc9a040, metalness: 0.9, roughness: 0.3 }),
  lens: (c = 0x3a6aa8) => std({ color: c, metalness: 0.6, roughness: 0.05, emissive: c, emissiveIntensity: 0.25 }),
  dot: (c) => std({ color: c, emissive: c, emissiveIntensity: 1.6 }),
};
// a box with its sides marked (+x / -x faces)
function marked(base, lines, key) { const m = std({ map: markTex(shade(base, 1.9), lines, key), metalness: 0.35, roughness: 0.42 }), s = M.steel(base); return [m, m, s, s, s, s]; }

class Kit {
  constructor() { this.g = new THREE.Group(); }
  box(w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; this.g.add(m); return m;
  }
  // a cylinder along the barrel (Z)
  tube(r1, r2, len, x, y, z, mat, seg = 16, open = false) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg, 1, open), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; this.g.add(m); return m;
  }
  // the muzzle: a black hole in the end of a barrel
  bore(r, x, y, z) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14), M.black()); m.position.set(x, y, z - 0.0005); m.rotation.y = Math.PI; this.g.add(m); }
  guard(r, x, y, z, mat) { // the trigger guard, a half loop under the frame
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.16, 6, 14, Math.PI), mat); m.position.set(x, y, z); m.rotation.set(Math.PI, Math.PI / 2, 0); this.g.add(m);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.005, r * 0.9, 0.007), M.steel('#202225')); t.position.set(x, y - r * 0.45, z - r * 0.15); t.rotation.x = -0.3; this.g.add(t); // the trigger
    return m;
  }
  grip(x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); this.g.add(o); this.g.userData.grip = o; }
  foregrip(x, y, z, r) { const o = new THREE.Object3D(); o.position.set(x, y, z); o.userData.r = r; this.g.add(o); this.g.userData.foregrip = o; }
  done(len, hw = 0.03, hh = 0.07, density = 900) {
    this.g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { mesh: this.g, colliders: [RAPIER.ColliderDesc.cuboid(hw, hh, len / 2)], density };
  }
}

// ---------------------------------------------------------------- handguns
export function pistolModel() {
  const k = new Kit(), base = '#2b2d31';
  const slide = std({ map: slideTex(shade(base, 1.9)), metalness: 0.35, roughness: 0.4 });
  k.box(0.03, 0.032, 0.19, 0, 0.018, 0, [std({ map: markTex(shade(base, 1.9), ['VERIAN ARMS  VRN-17', '9x19 · AUSTIN TX'], 'p17'), metalness: 0.35, roughness: 0.4 }), slide, M.steel(base), M.steel(base), M.steel(base), M.steel(base)]);
  k.box(0.012, 0.004, 0.05, 0, 0.032, -0.02, M.steel('#1d1f22')); // ejection port edge
  k.box(0.028, 0.02, 0.15, 0, -0.008, -0.015, M.poly('#25272a')); // frame
  k.box(0.02, 0.008, 0.06, 0, -0.019, -0.06, M.rail()); // accessory rail
  k.tube(0.0075, 0.0075, 0.012, 0, 0.016, -0.1, M.steel('#1a1b1d')); k.bore(0.0055, 0, 0.016, -0.106);
  k.box(0.006, 0.007, 0.006, 0, 0.037, -0.088, M.black()); k.box(0.002, 0.002, 0.001, 0, 0.038, -0.0912, M.dot(0xf2f2ee)); // front sight + dot
  k.box(0.024, 0.008, 0.008, 0, 0.037, 0.085, M.black()); for (const s of [-1, 1]) k.box(0.002, 0.002, 0.001, s * 0.007, 0.039, 0.0806, M.dot(0xf2f2ee));
  k.box(0.029, 0.105, 0.045, 0, -0.062, 0.062, M.checker('#1e2022'), -0.24); // grip
  k.box(0.031, 0.008, 0.05, 0, -0.114, 0.074, M.steel('#1a1b1d'), -0.24); // magazine base
  k.box(0.032, 0.012, 0.016, 0, 0.0, 0.094, M.poly('#25272a')); // beavertail
  k.guard(0.018, 0, -0.02, 0.012, M.poly('#25272a'));
  k.grip(0, -0.045, 0.058);
  return k.done(0.2, 0.016, 0.07, 1100);
}

export function magnumModel() {
  const k = new Kit(), ss = M.stainless();
  k.tube(0.011, 0.011, 0.16, 0, 0.012, -0.1, ss); k.bore(0.006, 0, 0.012, -0.18);
  k.box(0.008, 0.008, 0.16, 0, 0.026, -0.1, ss); // vent rib
  k.box(0.014, 0.016, 0.15, 0, -0.004, -0.1, ss); // full under-lug
  k.box(0.004, 0.012, 0.012, 0, 0.034, -0.172, M.dot(0xc23b2a)); // red ramp front sight
  k.box(0.03, 0.05, 0.075, 0, 0.004, 0.02, marked('#a9afb5', ['VERIAN .357 MAGNUM', 'STAINLESS · 6 SHOT'], 'mag')); // frame
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.044, 6), std({ map: metalTex('#aab0b6', 'cyl'), metalness: 0.5, roughness: 0.28 })); // fluted cylinder
  cyl.rotation.x = Math.PI / 2; cyl.position.set(0, 0.006, 0.006); k.g.add(cyl);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; const ch = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 10), M.black()); ch.position.set(Math.cos(a) * 0.014, 0.006 + Math.sin(a) * 0.014, -0.0165); ch.rotation.y = Math.PI; k.g.add(ch); }
  k.box(0.008, 0.016, 0.016, 0, 0.034, 0.058, M.steel('#2a2c30'), 0.4); // hammer
  k.box(0.026, 0.006, 0.02, 0, 0.032, 0.05, ss); // rear sight
  k.box(0.034, 0.1, 0.048, 0, -0.06, 0.068, M.wood('#5a3018'), -0.32); // walnut grip
  for (const s of [-1, 1]) { const med = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12), M.brass()); med.position.set(s * 0.0172, -0.045, 0.062); med.rotation.y = s * Math.PI / 2; k.g.add(med); }
  k.guard(0.017, 0, -0.03, 0.026, ss);
  k.grip(0, -0.045, 0.064);
  return k.done(0.28, 0.018, 0.07, 1200);
}

// ---------------------------------------------------------------- two-handed
export function smgModel() {
  const k = new Kit(), base = '#25272a';
  k.box(0.042, 0.06, 0.26, 0, 0, -0.01, marked(base, ['VRN-SMG9  CAL 9MM', 'S · 1 · F'], 'smg'));
  k.box(0.02, 0.008, 0.2, 0, 0.034, -0.01, M.rail());
  k.tube(0.017, 0.017, 0.1, 0, 0.004, -0.185, M.slots(base)); // barrel shroud
  k.tube(0.007, 0.007, 0.04, 0, 0.004, -0.25, M.steel('#1a1b1d')); k.bore(0.0045, 0, 0.004, -0.27);
  k.box(0.004, 0.018, 0.004, 0, 0.044, -0.12, M.black()); // front sight post
  k.box(0.022, 0.016, 0.012, 0, 0.044, 0.09, M.black()); // rear sight
  k.box(0.026, 0.13, 0.034, 0, -0.09, -0.04, M.steel('#1a1b1d'), 0.18); // magazine (raked forward)
  k.box(0.03, 0.09, 0.04, 0, -0.07, 0.07, M.checker(), -0.22); // pistol grip
  k.guard(0.018, 0, -0.035, 0.035, M.poly(base));
  k.box(0.024, 0.07, 0.03, 0, -0.065, -0.14, M.poly(base), -0.1); // vertical foregrip
  for (const s of [-1, 1]) k.box(0.005, 0.005, 0.2, s * 0.016, -0.005, 0.21, M.steel('#1a1b1d')); // folding wire stock
  k.box(0.04, 0.05, 0.012, 0, -0.02, 0.31, M.rubber());
  k.foregrip(0, -0.09, -0.14, 0.017);
  k.grip(0, -0.06, 0.068);
  return k.done(0.6, 0.025, 0.08, 900);
}

export function shotgunModel() {
  const k = new Kit(), base = '#2a2b2e';
  k.tube(0.012, 0.012, 0.58, 0, 0.022, -0.35, M.steel(base)); k.bore(0.009, 0, 0.022, -0.64);
  k.tube(0.0105, 0.0105, 0.44, 0, -0.004, -0.28, M.steel('#232427')); // magazine tube
  k.tube(0.012, 0.012, 0.012, 0, -0.004, -0.505, M.steel('#1a1b1d'));
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), M.brass()); bead.position.set(0, 0.036, -0.63); k.g.add(bead);
  // the pump: walnut with grooves
  const pump = k.tube(0.02, 0.02, 0.15, 0, 0.002, -0.22, M.wood('#6a3a1e'), 18);
  for (let i = 0; i < 7; i++) k.tube(0.0205, 0.0205, 0.004, 0, 0.002, -0.28 + i * 0.02, std({ color: 0x2a160a, roughness: 0.9 }), 18);
  void pump;
  k.box(0.046, 0.072, 0.2, 0, 0.005, -0.04, marked('#2a2b2e', ['VERIAN 870 · 12 GA', '2-3/4" & 3" SHELLS'], 'sg')); // receiver
  k.box(0.012, 0.016, 0.06, 0.021, 0.014, -0.04, M.black()); // ejection port
  k.guard(0.02, 0, -0.04, 0.03, M.steel(base));
  // walnut stock with a pistol-grip wrist and a rubber pad
  k.box(0.04, 0.06, 0.12, 0, -0.035, 0.12, M.wood('#6a3a1e'), -0.28);
  k.box(0.042, 0.1, 0.26, 0, -0.06, 0.3, M.wood('#6a3a1e'), -0.1);
  k.box(0.045, 0.115, 0.018, 0, -0.075, 0.44, M.rubber(), -0.1);
  k.foregrip(0, 0.002, -0.22, 0.02);
  k.grip(0, -0.04, 0.125);
  return k.done(1.1, 0.025, 0.08, 700);
}

export function rifleModel() {
  const k = new Kit(), base = '#24262a';
  k.box(0.034, 0.042, 0.2, 0, 0.012, 0.02, marked(base, ['VRN-15  CAL 5.56', 'SAFE · SEMI · AUTO'], 'ar')); // upper
  k.box(0.02, 0.008, 0.36, 0, 0.037, -0.06, M.rail()); // top rail
  k.box(0.032, 0.04, 0.14, 0, -0.025, 0.02, M.steel('#202226')); // lower
  const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.26, 8), M.slots(base)); hg.rotation.set(Math.PI / 2, 0, Math.PI / 8); hg.position.set(0, 0.012, -0.21); k.g.add(hg); // octagonal handguard
  k.tube(0.0075, 0.0075, 0.18, 0, 0.012, -0.43, M.steel('#1a1b1d'));
  k.tube(0.011, 0.011, 0.05, 0, 0.012, -0.53, M.steel('#16171a'), 6); k.bore(0.006, 0, 0.012, -0.555); // flash hider
  k.box(0.006, 0.03, 0.008, 0, 0.048, -0.33, M.black()); // folding front sight
  // a red-dot sight
  k.tube(0.017, 0.017, 0.05, 0, 0.062, 0.0, M.poly('#1b1c1e'), 20);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 18), M.lens(0x4a2a2a)); lens.position.set(0, 0.062, 0.0255); k.g.add(lens);
  const red = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 8), M.dot(0xff2a1a)); red.position.set(0, 0.062, 0.026); k.g.add(red);
  k.box(0.02, 0.014, 0.03, 0, 0.046, 0.0, M.poly('#1b1c1e'));
  // curved magazine (two pieces), grip, stock
  k.box(0.024, 0.08, 0.034, 0, -0.08, -0.025, M.steel('#2b2c2f'), 0.12);
  k.box(0.024, 0.06, 0.034, 0, -0.14, -0.04, M.steel('#2b2c2f'), 0.32);
  k.box(0.028, 0.09, 0.036, 0, -0.08, 0.07, M.checker(), -0.35);
  k.guard(0.018, 0, -0.045, 0.045, M.steel('#202226'));
  k.tube(0.013, 0.013, 0.17, 0, 0.0, 0.2, M.steel('#1d1f22')); // buffer tube
  k.box(0.038, 0.075, 0.12, 0, -0.018, 0.27, M.poly(base)); // stock
  k.box(0.04, 0.085, 0.012, 0, -0.022, 0.336, M.rubber());
  k.foregrip(0, 0.012, -0.22, 0.021);
  k.grip(0, -0.07, 0.072);
  return k.done(0.9, 0.025, 0.1, 800);
}

export function combatShotgunModel() {
  const k = new Kit(), base = '#1f2124';
  k.box(0.046, 0.07, 0.22, 0, 0.005, -0.01, marked(base, ['VRN-12 TACTICAL', 'SEMI-AUTO · 12 GA'], 'cs'));
  k.box(0.02, 0.008, 0.36, 0, 0.044, -0.08, M.rail());
  k.tube(0.013, 0.013, 0.5, 0, 0.022, -0.36, M.steel('#1a1b1d')); k.bore(0.0095, 0, 0.022, -0.61);
  k.box(0.026, 0.03, 0.04, 0, 0.022, -0.6, M.steel('#16171a')); // breacher choke
  const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 8), M.slots(base)); hg.rotation.set(Math.PI / 2, 0, Math.PI / 8); hg.position.set(0, 0.01, -0.24); k.g.add(hg);
  k.box(0.03, 0.12, 0.05, 0, -0.08, -0.03, M.poly('#2a2c2f'), 0.06); // box magazine
  k.box(0.03, 0.09, 0.04, 0, -0.07, 0.07, M.checker(), -0.3);
  k.guard(0.02, 0, -0.04, 0.04, M.poly(base));
  for (const s of [-1, 1]) k.box(0.004, 0.022, 0.012, s * 0.009, 0.06, 0.06, M.black()); // ghost-ring rear sight
  k.box(0.004, 0.02, 0.006, 0, 0.056, -0.33, M.dot(0x3aff6a));
  k.tube(0.012, 0.012, 0.15, 0, 0.0, 0.17, M.steel('#1d1f22'));
  k.box(0.04, 0.08, 0.13, 0, -0.02, 0.24, M.poly('#2a2c2f'));
  k.box(0.042, 0.09, 0.012, 0, -0.024, 0.31, M.rubber());
  k.foregrip(0, 0.01, -0.24, 0.026);
  k.grip(0, -0.062, 0.072);
  return k.done(0.95, 0.028, 0.1, 800);
}

export function sniperModel() {
  const k = new Kit(), tan = '#7d6e52';
  // a tan chassis stock with a thumbhole look
  k.box(0.05, 0.06, 0.36, 0, -0.02, -0.1, M.poly(tan)); // fore-end
  k.box(0.046, 0.05, 0.16, 0, -0.03, 0.17, M.poly(tan));
  k.box(0.034, 0.09, 0.04, 0, -0.08, 0.12, M.checker('#5e523c'), -0.28); // grip
  k.box(0.046, 0.11, 0.2, 0, -0.045, 0.34, M.poly(tan), -0.05); // butt
  k.box(0.03, 0.025, 0.12, 0, 0.012, 0.33, M.poly(tan)); // cheek rest
  k.box(0.048, 0.12, 0.014, 0, -0.05, 0.445, M.rubber());
  k.box(0.036, 0.04, 0.2, 0, 0.022, 0.02, marked('#2a2c30', ['VERIAN LR-300', '.308 WIN · BOLT'], 'sn')); // action
  // the bolt handle on the right
  const bh = k.tube(0.0035, 0.0035, 0.04, 0.03, 0.02, 0.08, M.steel('#1d1e21')); bh.rotation.set(0, Math.PI / 2, -0.3);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), M.steel('#1d1e21')); knob.position.set(0.05, 0.012, 0.08); k.g.add(knob);
  // a heavy fluted barrel and a muzzle brake
  k.tube(0.012, 0.01, 0.6, 0, 0.022, -0.4, M.steel('#1f2124'), 10);
  k.box(0.03, 0.022, 0.06, 0, 0.022, -0.72, std({ map: canvas('brake', 64, 32, (g, w, h) => { g.fillStyle = '#1a1b1d'; g.fillRect(0, 0, w, h); for (let x = 6; x < w; x += 14) { g.fillStyle = '#000'; g.fillRect(x, 6, 8, h - 12); } }), metalness: 0.7, roughness: 0.4 }));
  k.bore(0.006, 0, 0.022, -0.75);
  // the scope
  const sc = M.steel('#191a1c');
  k.tube(0.016, 0.016, 0.24, 0, 0.078, 0.02, sc, 20);
  k.tube(0.026, 0.017, 0.07, 0, 0.078, -0.13, sc, 20); k.tube(0.022, 0.016, 0.05, 0, 0.078, 0.16, sc, 20);
  const l1 = new THREE.Mesh(new THREE.CircleGeometry(0.024, 20), M.lens()); l1.position.set(0, 0.078, -0.1655); l1.rotation.y = Math.PI; k.g.add(l1);
  const l2 = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), M.lens(0x1a2a3a)); l2.position.set(0, 0.078, 0.1855); k.g.add(l2);
  for (const [x, y, rz] of [[0, 0.1, 0], [0.022, 0.078, Math.PI / 2]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 12), sc); t.position.set(x, y, 0.02); t.rotation.z = rz; k.g.add(t); }
  for (const z of [-0.04, 0.08]) k.box(0.024, 0.03, 0.016, 0, 0.055, z, sc); // rings
  // folded bipod legs
  for (const s of [-1, 1]) k.box(0.006, 0.006, 0.16, s * 0.014, -0.058, -0.2, M.steel('#1d1e21'));
  k.foregrip(0, -0.02, -0.16, 0.03);
  k.grip(0, -0.07, 0.125);
  return k.done(1.2, 0.03, 0.1, 700);
}

export function lmgModel() {
  const k = new Kit(), base = '#2a2c27';
  k.box(0.06, 0.09, 0.32, 0, 0, 0, marked(base, ['VRN-249 SAW', '5.56 · BELT FED'], 'lmg'));
  k.box(0.058, 0.02, 0.24, 0, 0.055, -0.02, M.steel('#24261f')); // feed cover
  k.box(0.02, 0.008, 0.2, 0, 0.069, -0.02, M.rail());
  const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8), M.slots(base)); hg.rotation.set(Math.PI / 2, 0, Math.PI / 8); hg.position.set(0, 0.005, -0.27); k.g.add(hg);
  k.tube(0.012, 0.012, 0.3, 0, 0.005, -0.5, M.steel('#1a1b1d')); k.tube(0.016, 0.016, 0.05, 0, 0.005, -0.66, M.steel('#141517'), 8); k.bore(0.006, 0, 0.005, -0.685);
  k.box(0.01, 0.05, 0.14, 0, 0.06, -0.27, M.steel('#1d1f1b')); k.box(0.012, 0.012, 0.13, 0, 0.088, -0.27, M.poly('#1b1c1e')); // carry handle
  // the ammo box and the belt into the gun
  k.box(0.08, 0.1, 0.12, -0.065, -0.09, -0.03, std({ map: canvas('ammobox', 128, 64, (g, w, h) => { g.fillStyle = '#4b5232'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8d090'; g.font = 'bold 14px Arial'; g.fillText('200 RDS', 30, 38); g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(4, 4, w - 8, h - 8); }), roughness: 0.8 }));
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 8), M.brass()); b.position.set(-0.04 + i * 0.006, -0.03 + i * 0.006, -0.03); b.rotation.x = Math.PI / 2; k.g.add(b); }
  k.box(0.032, 0.09, 0.04, 0, -0.085, 0.09, M.checker(), -0.3);
  k.guard(0.02, 0, -0.05, 0.06, M.steel(base));
  for (const s of [-1, 1]) k.box(0.006, 0.006, 0.2, s * 0.018, -0.03, 0.26, M.steel('#1d1f1b')); // skeleton stock
  k.box(0.045, 0.1, 0.02, 0, -0.03, 0.37, M.rubber());
  for (const s of [-1, 1]) k.box(0.007, 0.007, 0.2, s * 0.02, -0.03, -0.44, M.steel('#1d1f1b')); // folded bipod
  k.foregrip(0, 0.005, -0.27, 0.028);
  k.grip(0, -0.075, 0.092);
  return k.done(1.1, 0.04, 0.12, 700);
}

// Your other hand, the human one, wrapped round a gun's foregrip (radius r): fingers over the
// right of it, thumb along the left, and the forearm running back out of view. Built in the gun's
// own frame (muzzle -Z, up +Y), in metres.
export function supportHand(r = 0.02, look = null) {
  const g = new THREE.Group();
  const skinC = look?.skin ?? 0xd9a47c, shirtC = look?.shirt ?? 0x2a303a;
  const skin = std({ color: skinC, roughness: 0.75 });
  const knuckle = std({ color: new THREE.Color(skinC).multiplyScalar(0.92), roughness: 0.75 });
  const sleeve = std({ map: canvas(`sleeve${shirtC}`, 128, 128, (c, w, h) => { c.fillStyle = `#${shirtC.toString(16).padStart(6, '0')}`; c.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.05)'; c.fillRect(rnd() * w, rnd() * h, 2, 1); } }), roughness: 1 });
  const R = r + 0.009;
  // the palm under the grip, turned a little to the left
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.085), skin);
  palm.position.set(-R * 0.45, -R - 0.004, 0.0); palm.rotation.z = 0.5; g.add(palm);
  // four fingers wrapping up the right side
  const zs = [-0.03, -0.01, 0.01, 0.03], lens = [2.0, 2.15, 2.1, 1.85];
  zs.forEach((z, i) => {
    const f = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0085, 8, 16, lens[i]), skin);
    f.rotation.z = -Math.PI / 2 - 0.35; f.position.z = z; g.add(f);
    const tipA = -Math.PI / 2 - 0.35 + lens[i];
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 6), skin); tip.position.set(Math.cos(tipA) * R, Math.sin(tipA) * R, z); g.add(tip);
    const kn = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 8, 6), knuckle); const ka = -Math.PI / 2 + 0.3; kn.position.set(Math.cos(ka) * R, Math.sin(ka) * R - 0.002, z); g.add(kn);
  });
  // the thumb along the left side, pointing up the barrel
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.045, 4, 8), skin);
  th.rotation.x = Math.PI / 2; th.rotation.z = 0.15; th.position.set(-R - 0.002, 0.004, -0.025); g.add(th);
  // wrist and forearm, back and down to the left, out of shot
  const dir = new THREE.Vector3(-0.55, -0.7, 0.45).normalize();
  const wrist = new THREE.Vector3(-R * 0.6, -R - 0.025, 0.04);
  const arm = (r1, r2, len, from, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 14), mat);
    m.position.copy(wrist).addScaledVector(dir, from + len / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(m);
  };
  arm(0.026, 0.03, 0.09, -0.01, skin); // wrist
  arm(0.042, 0.042, 0.03, 0.07, std({ color: new THREE.Color(shirtC).multiplyScalar(0.7), roughness: 1 })); // cuff
  arm(0.045, 0.055, 0.9, 0.09, sleeve); // jacket sleeve
  g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
  return g;
}
