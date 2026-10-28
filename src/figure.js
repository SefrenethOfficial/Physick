import * as THREE from 'three';

// Blocky test-dummy person. Origin is the body centre; feet sit at y = -0.83, facing +Z.
// Every limb hangs off a pivot so it can be animated, and each limb mesh is centred on its
// own geometry so it can be turned straight into a ragdoll part.

const SHIRTS = [0xd9483b, 0x2f7fd8, 0x3aa760, 0xe0a52b, 0x8a54c9, 0x1f9aa3, 0xe06a9b, 0x6b7380];
const PANTS = [0x2c3440, 0x4a3b2a, 0x34495e, 0x5b5b5b, 0x2d4a2d];
const SKIN = [0xf1c9a5, 0xd9a47c, 0xa8724f, 0x7a4f35, 0xffdcbd];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });

export const DIMS = {
  torso: { size: [0.42, 0.6, 0.24], center: [0, 0.27, 0] },
  head: { radius: 0.15, center: [0, 0.75, 0] },
  arm: { size: [0.12, 0.62, 0.14], shoulder: [0.28, 0.52, 0] },
  leg: { size: [0.16, 0.8, 0.18], hip: [0.11, -0.03, 0] },
};

export function randomLook() {
  return { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN) };
}

// Navy working uniforms: blue coveralls or khaki/whites, with a ball cap or white dixie cup.
const CREW = [
  { shirt: 0x2c3e5e, pants: 0x2c3e5e, hat: 'cap', hatColor: 0x1b2638 },
  { shirt: 0x2c3e5e, pants: 0x2c3e5e, hat: 'cap', hatColor: 0x1b2638 },
  { shirt: 0x34507a, pants: 0x23324a, hat: 'cap', hatColor: 0x1b2638 },
  { shirt: 0xc8b48a, pants: 0xc8b48a, hat: 'cap', hatColor: 0x2b2f36 },
  { shirt: 0xf2f2ee, pants: 0xf2f2ee, hat: 'dixie', hatColor: 0xffffff },
  { shirt: 0xe0d23a, pants: 0x2c3e5e, hat: 'cranial', hatColor: 0xe0d23a }, // flight deck jersey
  { shirt: 0xc23b2a, pants: 0x2c3e5e, hat: 'cranial', hatColor: 0xc23b2a },
];
export function crewLook() {
  return { ...pick(CREW), skin: pick(SKIN) };
}

export function buildFigure(look = randomLook()) {
  const root = new THREE.Group();
  const O = look.outfit ? OUTFITS[look.outfit] : null;
  const shirt = mat(look.shirt), skin = mat(look.skin);
  const pants = O?.pants != null ? mat(O.pants) : mat(look.pants);
  const parts = {};
  // an outfit: a painted front (and back) on the torso, and its own sleeves and trousers
  const torsoMat = O ? outfitTorso(look.outfit, look.shirt) : shirt;
  const armMat = O ? (O.arms === 'skin' ? skin : O.arms === 'shirt' ? shirt : O.arms === 'stripe' ? stripeMat(look.shirt) : mat(O.arms)) : shirt;
  const legMat = O?.legs === 'stripe' ? stripeMat(look.pants) : pants;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(...DIMS.torso.size), torsoMat);
  torso.position.set(...DIMS.torso.center);
  root.add(torso);
  parts.torso = torso;

  const head = new THREE.Mesh(new THREE.SphereGeometry(DIMS.head.radius, 16, 12), skin);
  head.position.set(...DIMS.head.center);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const x of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeM);
    eye.position.set(x, 0.03, 0.135);
    head.add(eye);
  }
  if (look.hat) {
    const hm = mat(look.hatColor ?? 0x1b2638);
    if (look.hat === 'cap') {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm);
      crown.position.y = 0.04;
      const bill = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.14), hm);
      bill.position.set(0, 0.045, 0.17);
      head.add(crown, bill);
    } else if (look.hat === 'dixie') {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.1, 16), hm);
      cup.position.y = 0.12;
      head.add(cup);
    } else if (look.hat === 'beanie') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.162, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hm); b.position.y = 0.02; b.scale.y = 1.15;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.05, 16), hm); cuff.position.y = 0.03;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0xf2f2ee)); pom.position.y = 0.2;
      head.add(b, cuff, pom);
    } else if (look.hat === 'cowboy') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.018, 20), hm); brim.position.y = 0.07; brim.scale.z = 0.85; brim.rotation.x = -0.08;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.16, 14), hm); crown.position.y = 0.15;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.151, 0.151, 0.03, 14), mat(0x3a2414)); band.position.y = 0.09;
      head.add(brim, crown, band);
    } else if (look.hat === 'tophat') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.015, 18), hm); brim.position.y = 0.09;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.26, 16), hm); tube.position.y = 0.22;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.04, 16), mat(0x8a1a1a)); band.position.y = 0.12;
      head.add(brim, tube, band);
    } else if (look.hat === 'fedora') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.014, 20), hm); brim.position.y = 0.08;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.145, 0.13, 14), hm); crown.position.y = 0.15; crown.scale.z = 1.1;
      const dent = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), hm); dent.position.y = 0.215;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.146, 0.146, 0.028, 14), mat(0x15161a)); band.position.y = 0.1; band.scale.z = 1.1;
      head.add(brim, crown, dent, band);
    } else if (look.hat === 'beret') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.05, 18), hm); b.position.set(0.03, 0.13, 0); b.rotation.z = -0.25;
      const nub = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), hm); nub.position.set(0.05, 0.16, 0);
      head.add(b, nub);
    } else if (look.hat === 'hardhat') {
      const y = new THREE.MeshStandardMaterial({ color: 0xf2c21a, roughness: 0.4 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.168, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), y); dome.position.y = 0.04;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 18), y); brim.position.set(0, 0.04, 0.02);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3), y); ridge.position.y = 0.2;
      head.add(dome, brim, ridge);
    } else if (look.hat === 'balaclava') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.157, 16, 12), hm); head.add(m);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), mat(look.skin)); slot.position.set(0, 0.03, 0.148); head.add(slot);
      for (const x of [-0.055, 0.055]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); e.position.set(x, 0.03, 0.155); head.add(e); }
    } else if (look.hat === 'crown') {
      const gold = new THREE.MeshStandardMaterial({ color: 0xe8c547, metalness: 0.6, roughness: 0.3 });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.08, 16, 1, true), gold); ring.position.y = 0.12; ring.material.side = THREE.DoubleSide;
      head.add(ring);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), gold); sp.position.set(Math.sin(a) * 0.145, 0.2, Math.cos(a) * 0.145); head.add(sp); const gem = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshStandardMaterial({ color: [0xc62828, 0x2f7fd8, 0x3aa760][i % 3], emissive: 0x220000 })); gem.position.set(Math.sin(a) * 0.152, 0.12, Math.cos(a) * 0.152); head.add(gem); }
    } else {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hm);
      helm.position.y = 0.01;
      head.add(helm);
    }
  }
  if (look.glasses) { // shades
    const lens = new THREE.MeshStandardMaterial({ color: look.glasses === 'gold' ? 0x6a4a10 : 0x101010, metalness: 0.6, roughness: 0.15 });
    for (const x of [-0.055, 0.055]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.012), lens); l.position.set(x, 0.03, 0.145); head.add(l); }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.012), mat(look.glasses === 'gold' ? 0xc9a040 : 0x111111)); bridge.position.set(0, 0.045, 0.145); head.add(bridge);
  }
  root.add(head);
  parts.head = head;
  // (things worn on the body hang off the torso, so they go with it into a ragdoll)
  const ty = DIMS.torso.center[1];
  if (look.chain) { // a gold chain
    const ch = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20), new THREE.MeshStandardMaterial({ color: 0xe8c547, metalness: 0.7, roughness: 0.3 }));
    ch.position.set(0, 0.5 - ty, 0.06); ch.rotation.x = Math.PI / 2 - 0.5; ch.scale.y = 0.75; torso.add(ch);
  }
  if (look.backpack) {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.16), mat(look.backpack === true ? 0x2a4a6a : look.backpack)); bp.position.set(0, 0.28 - ty, -0.2); torso.add(bp);
  }
  if (O) outfitExtras(torso, look.outfit, look.shirt);
  if (look.phones) { // headphones over the head
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.014, 6, 16, Math.PI), mat(0x15161a)); band.position.y = 0.02; head.add(band);
    for (const x of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 14), mat(look.phones === true ? 0xd9483b : look.phones)); cup.rotation.z = Math.PI / 2; cup.position.set(x * 0.16, 0.0, 0); head.add(cup); }
  }

  const limb = (name, size, joint, side, m, sideMat) => {
    const pivot = new THREE.Group();
    pivot.position.set(joint[0] * side, joint[1], joint[2]);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
    mesh.position.y = -size[1] / 2;
    pivot.add(mesh);
    if (sideMat) { // hands
      const hand = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 0.9, 0.1, size[2] * 0.9), sideMat);
      hand.position.y = -size[1] / 2 - 0.02;
      mesh.add(hand);
    }
    root.add(pivot);
    parts[name] = mesh;
    parts[name + 'Pivot'] = pivot;
  };
  limb('armL', DIMS.arm.size, DIMS.arm.shoulder, -1, armMat, skin);
  limb('armR', DIMS.arm.size, DIMS.arm.shoulder, 1, armMat, skin);
  limb('legL', DIMS.leg.size, DIMS.leg.hip, -1, legMat);
  limb('legR', DIMS.leg.size, DIMS.leg.hip, 1, legMat);
  if (look.shoes && SHOES[look.shoes]) for (const leg of [parts.legL, parts.legR]) {
    const S = SHOES[look.shoes];
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.27), new THREE.MeshStandardMaterial({ color: S.color, roughness: S.rough, metalness: S.metal || 0 }));
    shoe.position.set(0, -DIMS.leg.size[1] / 2 + 0.03, 0.04); leg.add(shoe);
    if (S.sole) { const sole = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.025, 0.28), mat(S.sole)); sole.position.set(0, -DIMS.leg.size[1] / 2 - 0.003, 0.04); leg.add(sole); }
    if (S.stripe) { for (const x of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.03, 0.12), mat(S.stripe)); st.position.set(x * 0.092, -DIMS.leg.size[1] / 2 + 0.035, 0.04); leg.add(st); } }
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, parts, look };
}

// ---------------------------------------------------------------- outfits
// pants: forced trouser colour; arms: 'shirt' | 'skin' | 'stripe' | a colour; legs: 'stripe' for track pants
export const OUTFITS = {
  tank: { arms: 'skin' },
  hawaiian: { arms: 'shirt' },
  hoodie: { arms: 'shirt' },
  tracksuit: { arms: 'stripe', legs: 'stripe' },
  hivis: { arms: 'shirt' },
  puffer: { arms: 'shirt' },
  leather: { arms: 0x1d1a18 },
  labcoat: { arms: 0xf2f2ee },
  trench: { arms: 0xa8875a },
  suit: { arms: 0x3a3d42, pants: 0x3a3d42 },
  tuxedo: { arms: 0x111214, pants: 0x111214 },
};
export const SHOES = {
  sneakers: { color: 0xf2f2ee, rough: 0.7, sole: 0xdddddd, stripe: 0xd9483b },
  boots: { color: 0x5a3a22, rough: 0.8, sole: 0x2a1a10 },
  dress: { color: 0x0e0e10, rough: 0.2, metal: 0.3 },
};
const hexc = (c) => `#${(c >>> 0).toString(16).padStart(6, '0')}`;
const texCache = new Map();
function paint(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
function stripeMat(base) {
  return new THREE.MeshStandardMaterial({ roughness: 0.8, map: paint(`stripe${base}`, 32, 64, (g, w, h) => { g.fillStyle = hexc(base); g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2ee'; g.fillRect(w * 0.42, 0, w * 0.16, h); }) });
}
// the torso box's faces: +x, -x, top, bottom, front (+z), back (-z)
function outfitTorso(id, shirt) {
  const S = hexc(shirt);
  const front = (draw) => new THREE.MeshStandardMaterial({ roughness: id === 'leather' ? 0.45 : 0.8, map: paint(`${id}${shirt}f`, 84, 120, draw) });
  const plain = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: id === 'leather' ? 0.45 : 0.8 });
  let F, side;
  switch (id) {
    case 'tuxedo': case 'suit': {
      const jacket = id === 'tuxedo' ? '#111214' : '#3a3d42';
      F = front((g, w, h) => {
        g.fillStyle = jacket; g.fillRect(0, 0, w, h);
        g.fillStyle = '#f6f6f2'; g.beginPath(); g.moveTo(w * 0.28, 0); g.lineTo(w * 0.72, 0); g.lineTo(w * 0.5, h * 0.58); g.fill(); // shirt front
        g.strokeStyle = id === 'tuxedo' ? '#2a2b2e' : '#2a2c30'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.28, 0); g.lineTo(w * 0.5, h * 0.58); g.lineTo(w * 0.72, 0); g.stroke(); // lapels
        if (id === 'suit') { g.fillStyle = '#8a1a1a'; g.beginPath(); g.moveTo(w * 0.46, h * 0.04); g.lineTo(w * 0.54, h * 0.04); g.lineTo(w * 0.53, h * 0.5); g.lineTo(w * 0.5, h * 0.56); g.lineTo(w * 0.47, h * 0.5); g.fill(); }
        else { g.fillStyle = '#111'; for (const y of [0.2, 0.32, 0.44]) { g.beginPath(); g.arc(w * 0.5, h * y, 1.6, 0, 7); g.fill(); } }
        g.fillStyle = id === 'tuxedo' ? '#2a2b2e' : '#2c2e33'; for (const y of [0.66, 0.8]) { g.beginPath(); g.arc(w * 0.44, h * y, 2, 0, 7); g.fill(); }
        g.fillRect(w * 0.12, h * 0.68, w * 0.2, 2); g.fillRect(w * 0.68, h * 0.68, w * 0.2, 2); // pocket flaps
        if (id === 'tuxedo') { g.fillStyle = '#f6f6f2'; g.fillRect(w * 0.7, h * 0.18, w * 0.12, 4); } // pocket square
      });
      side = plain(id === 'tuxedo' ? 0x111214 : 0x3a3d42);
      break;
    }
    case 'hoodie': F = front((g, w, h) => { g.fillStyle = S; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(w * 0.18, h * 0.62, w * 0.64, h * 0.26); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(w * 0.18, h * 0.62, w * 0.64, 2); g.fillStyle = '#f2f2ee'; g.fillRect(w * 0.42, 0, 2, h * 0.3); g.fillRect(w * 0.56, 0, 2, h * 0.3); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 8, w, 8); }); side = shirt; break;
    case 'tracksuit': F = front((g, w, h) => { g.fillStyle = S; g.fillRect(0, 0, w, h); g.fillStyle = '#c8ccd0'; g.fillRect(w * 0.49, 0, 2, h); g.fillStyle = '#f2f2ee'; g.fillRect(0, h * 0.08, w * 0.16, 4); g.fillRect(w * 0.84, h * 0.08, w * 0.16, 4); g.fillRect(0, 0, w, 6); }); side = stripeMat(shirt); break;
    case 'hawaiian': F = front((g, w, h) => { g.fillStyle = S; g.fillRect(0, 0, w, h); const r = mulberry(shirt); for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h; g.fillStyle = ['#ffe066', '#ff7aa8', '#ffffff', '#ff8a3a'][i % 4]; for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 2.6, 0, 7); g.fill(); } g.fillStyle = '#c23b2a'; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); g.fillStyle = '#2d7a3a'; g.fillRect(x + 4, y + 3, 6, 2); } g.fillStyle = '#f6f2e6'; for (const y of [0.25, 0.45, 0.65, 0.85]) { g.beginPath(); g.arc(w * 0.5, h * y, 1.5, 0, 7); g.fill(); } g.strokeStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.moveTo(w * 0.32, 0); g.lineTo(w * 0.5, h * 0.18); g.lineTo(w * 0.68, 0); g.stroke(); }); side = F; break;
    case 'tank': F = front((g, w, h) => { g.fillStyle = S; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(w * 0.5, 0, w * 0.18, h * 0.12, 0, 0, Math.PI); g.fill(); }); side = shirt; break;
    case 'hivis': F = front((g, w, h) => { g.fillStyle = S; g.fillRect(0, 0, w, h); g.fillStyle = '#f2d21a'; g.fillRect(0, 0, w * 0.4, h); g.fillRect(w * 0.6, 0, w * 0.4, h); g.fillRect(0, h * 0.5, w, h * 0.5); g.fillStyle = '#d8dde2'; g.fillRect(0, h * 0.58, w, 7); g.fillRect(0, h * 0.8, w, 7); g.fillRect(w * 0.12, 0, 6, h); g.fillRect(w * 0.8, 0, 6, h); }); side = new THREE.MeshStandardMaterial({ color: 0xf2d21a, roughness: 0.7 }); break;
    case 'puffer': F = front((g, w, h) => { g.fillStyle = S; g.fillRect(0, 0, w, h); for (let y = 12; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y - 7, w, 3); } g.fillStyle = '#c8ccd0'; g.fillRect(w * 0.49, 0, 2, h); }); side = F; break;
    case 'leather': F = front((g, w, h) => { g.fillStyle = '#1d1a18'; g.fillRect(0, 0, w, h); g.fillStyle = S; g.beginPath(); g.moveTo(w * 0.36, 0); g.lineTo(w * 0.64, 0); g.lineTo(w * 0.56, h); g.lineTo(w * 0.44, h); g.fill(); g.fillStyle = '#c8ccd0'; g.fillRect(w * 0.36, h * 0.15, 1.5, h * 0.85); g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 40; i++) g.fillRect((i * 37) % w, (i * 53) % h, 6, 1); g.fillStyle = '#2c2724'; g.fillRect(w * 0.1, h * 0.55, w * 0.2, 2); }); side = plain(0x1d1a18); break;
    case 'labcoat': F = front((g, w, h) => { g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = S; g.beginPath(); g.moveTo(w * 0.34, 0); g.lineTo(w * 0.66, 0); g.lineTo(w * 0.5, h * 0.4); g.fill(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.strokeRect(w * 0.62, h * 0.3, w * 0.22, h * 0.14); g.fillStyle = '#2f5fd8'; g.fillRect(w * 0.66, h * 0.24, 2, h * 0.1); g.fillStyle = '#c8ccd0'; for (const y of [0.5, 0.65, 0.8]) { g.beginPath(); g.arc(w * 0.5, h * y, 1.8, 0, 7); g.fill(); } }); side = plain(0xf2f2ee); break;
    case 'trench': F = front((g, w, h) => { g.fillStyle = '#a8875a'; g.fillRect(0, 0, w, h); g.fillStyle = S; g.beginPath(); g.moveTo(w * 0.36, 0); g.lineTo(w * 0.64, 0); g.lineTo(w * 0.5, h * 0.3); g.fill(); g.fillStyle = '#5a4022'; g.fillRect(0, h * 0.62, w, 6); g.fillStyle = '#c8a040'; g.fillRect(w * 0.46, h * 0.61, 8, 8); g.fillStyle = '#5a4022'; for (const y of [0.25, 0.4, 0.75]) for (const x of [0.36, 0.64]) { g.beginPath(); g.arc(w * x, h * y, 2, 0, 7); g.fill(); } }); side = plain(0xa8875a); break;
    default: return mat(shirt);
  }
  const top = plain(id === 'tuxedo' ? 0x111214 : id === 'suit' ? 0x3a3d42 : shirt);
  return [side, side, top, top, F, side === F ? F : side];
}
// bits that stick out: a bow tie, a hood, a collar, coat tails
function outfitExtras(torso, id, shirt) {
  const ty = DIMS.torso.center[1], add = (m, x, y, z) => { m.position.set(x, y - ty, z); m.castShadow = true; torso.add(m); return m; };
  const [, th, td] = DIMS.torso.size;
  if (id === 'tuxedo') { const bt = mat(0x0b0b0c); add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), bt), -0.035, ty + th / 2 - 0.03, td / 2 + 0.012).rotation.z = Math.PI / 2; add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), bt), 0.035, ty + th / 2 - 0.03, td / 2 + 0.012).rotation.z = -Math.PI / 2; add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.02), bt), 0, ty + th / 2 - 0.03, td / 2 + 0.014); }
  if (id === 'hoodie') { const hood = add(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.045, 8, 16, Math.PI), mat(shirt)), 0, ty + th / 2 + 0.01, -0.05); hood.rotation.set(-Math.PI / 2 - 0.4, 0, Math.PI); }
  if (id === 'leather' || id === 'trench') { const c = id === 'leather' ? 0x1d1a18 : 0xa8875a; for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.03), mat(c)), s * 0.1, ty + th / 2 - 0.02, td / 2 + 0.01).rotation.z = s * 0.5; }
  if (id === 'labcoat' || id === 'trench') { // the coat hangs down over the hips
    const c = id === 'labcoat' ? 0xf2f2ee : 0xa8875a;
    const skirt = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.26), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })), 0, ty - th / 2 - 0.15, 0);
    void skirt;
  }
  if (id === 'puffer') torso.scale.set(1.08, 1.02, 1.15);
}
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// phase: walk cycle position, amount: 0 idle .. 1 walking .. 2 sprinting
export function animateWalk(parts, phase, amount) {
  const s = Math.sin(phase) * 0.55 * Math.min(amount, 1.6);
  parts.legLPivot.rotation.x = s;
  parts.legRPivot.rotation.x = -s;
  parts.armLPivot.rotation.x = -s * 0.9;
  parts.armRPivot.rotation.x = s * 0.9;
  parts.armLPivot.rotation.z = -0.06;
  parts.armRPivot.rotation.z = 0.06;
}

// Arms up, flailing (when fleeing).
export function animatePanic(parts, phase) {
  parts.armLPivot.rotation.x = Math.PI * 0.85 + Math.sin(phase * 1.7) * 0.4;
  parts.armRPivot.rotation.x = Math.PI * 0.85 + Math.cos(phase * 1.9) * 0.4;
  const s = Math.sin(phase) * 0.8;
  parts.legLPivot.rotation.x = s;
  parts.legRPivot.rotation.x = -s;
}

// Sitting on a quad, hands forward on the bars.
export function poseSeated(parts, steer = 0) {
  parts.legLPivot.rotation.set(-1.1, 0, -0.3);
  parts.legRPivot.rotation.set(-1.1, 0, 0.3);
  parts.armLPivot.rotation.set(-1.15, 0, -0.15 + steer * 0.2);
  parts.armRPivot.rotation.set(-1.15, 0, 0.15 + steer * 0.2);
}
