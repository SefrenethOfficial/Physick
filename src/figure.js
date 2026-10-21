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

// ---- low-poly pixel people: boxes wearing tiny nearest-filtered textures ----
const HAIR = [0x2a1d14, 0x4a2f1c, 0x7a4f2a, 0xc9a35a, 0x111111, 0x8a8a8a, 0xa83a1c];
const texCache = new Map();
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const shade = (c, k) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return (f(r) << 16) | (f(g) << 8) | f(b); };
function pixTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  let seed = 0; for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const px = (x, y, col) => { g.fillStyle = hex(col); g.fillRect(x, y, 1, 1); };
  draw(px, rnd, g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  texCache.set(key, m);
  return m;
}
const noisy = (px, rnd, w, h, col, y0 = 0) => { for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, shade(col, 0.88 + rnd() * 0.2)); };

function shirtMat(look) {
  return pixTex(`shirt|${look.shirt}|${look.pants}|${look.skin}|${look.badge ? 1 : 0}`, 8, 12, (px, rnd) => {
    noisy(px, rnd, 8, 12, look.shirt);
    px(3, 0, look.skin); px(4, 0, look.skin); px(3, 1, shade(look.skin, 0.9)); px(4, 1, shade(look.skin, 0.9)); // collar
    for (let y = 2; y < 10; y += 3) px(4, y, shade(look.shirt, 0.65)); // buttons
    for (let x = 0; x < 8; x++) { px(x, 10, shade(look.pants, 0.7)); px(x, 11, look.pants); } // belt
    px(4, 10, 0xc9a24a);
    if (look.badge) { px(2, 3, 0xffd34a); px(2, 4, 0xe0b030); }
  });
}
function armMat(look) {
  return pixTex(`arm|${look.shirt}|${look.skin}`, 4, 12, (px, rnd) => {
    noisy(px, rnd, 4, 9, look.shirt);
    for (let x = 0; x < 4; x++) px(x, 8, shade(look.shirt, 0.75));
    noisy(px, rnd, 4, 12, look.skin, 9);
  });
}
function legMat(look) {
  return pixTex(`leg|${look.pants}`, 4, 12, (px, rnd) => {
    noisy(px, rnd, 4, 10, look.pants);
    for (let x = 0; x < 4; x++) { px(x, 10, 0x2a2018); px(x, 11, 0x1a140e); }
  });
}
function headMats(look) {
  const hair = look.hair ?? 0x2a1d14, skin = look.skin;
  const face = pixTex(`face|${skin}|${hair}`, 8, 8, (px, rnd) => {
    noisy(px, rnd, 8, 8, skin);
    for (let x = 0; x < 8; x++) px(x, 0, hair);
    px(0, 1, hair); px(7, 1, hair);
    px(2, 3, 0xffffff); px(5, 3, 0xffffff); px(2, 4, 0x1a1a2a); px(5, 4, 0x1a1a2a); // eyes
    px(1, 2, shade(hair, 1.1)); px(2, 2, shade(hair, 1.1)); px(5, 2, shade(hair, 1.1)); px(6, 2, shade(hair, 1.1)); // brows
    px(3, 5, shade(skin, 0.8)); px(4, 5, shade(skin, 0.8)); // nose
    px(3, 6, 0x7a2a2a); px(4, 6, 0x7a2a2a); px(2, 6, shade(skin, 0.75)); px(5, 6, shade(skin, 0.75)); // mouth
  });
  const side = pixTex(`hside|${skin}|${hair}`, 8, 8, (px, rnd) => {
    noisy(px, rnd, 8, 8, skin);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) px(x, y, shade(hair, 0.9 + rnd() * 0.2));
    for (let x = 4; x < 8; x++) px(x, 3, hair);
    px(3, 4, shade(skin, 0.8));
  });
  const back = pixTex(`hback|${hair}|${skin}`, 8, 8, (px, rnd) => { noisy(px, rnd, 8, 8, hair); for (let x = 0; x < 8; x++) px(x, 7, skin); });
  const top = pixTex(`htop|${hair}`, 8, 8, (px, rnd) => noisy(px, rnd, 8, 8, hair));
  const bottom = pixTex(`hbot|${skin}`, 2, 2, (px, rnd) => noisy(px, rnd, 2, 2, skin));
  // box faces: +x, -x, +y, -y, +z (front), -z
  return [side, side, top, bottom, face, back];
}

export function buildFigure(look = randomLook()) {
  look = { hair: HAIR[Math.floor(Math.random() * HAIR.length)], ...look };
  const root = new THREE.Group();
  const parts = {};

  const torso = new THREE.Mesh(new THREE.BoxGeometry(...DIMS.torso.size), shirtMat(look));
  torso.position.set(...DIMS.torso.center);
  root.add(torso);
  parts.torso = torso;

  const H = DIMS.head.radius * 2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(H, H, H), headMats(look));
  head.position.set(...DIMS.head.center);
  if (look.hat) {
    const hm = mat(look.hatColor ?? 0x1b2638);
    hm.flatShading = true;
    if (look.hat === 'cap') {
      const crown = new THREE.Mesh(new THREE.BoxGeometry(H + 0.02, 0.08, H + 0.02), hm);
      crown.position.y = H / 2 + 0.02;
      const bill = new THREE.Mesh(new THREE.BoxGeometry(H * 0.8, 0.025, 0.13), hm);
      bill.position.set(0, H / 2 - 0.01, H / 2 + 0.06);
      head.add(crown, bill);
    } else if (look.hat === 'dixie') {
      const cup = new THREE.Mesh(new THREE.BoxGeometry(H + 0.03, 0.1, H + 0.03), hm);
      cup.position.y = H / 2 + 0.03;
      head.add(cup);
    } else {
      const helm = new THREE.Mesh(new THREE.BoxGeometry(H + 0.04, 0.14, H + 0.04), hm);
      helm.position.y = H / 2 - 0.02;
      head.add(helm);
    }
  }
  root.add(head);
  parts.head = head;

  const limb = (name, size, joint, side, m) => {
    const pivot = new THREE.Group();
    pivot.position.set(joint[0] * side, joint[1], joint[2]);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
    mesh.position.y = -size[1] / 2;
    pivot.add(mesh);
    root.add(pivot);
    parts[name] = mesh;
    parts[name + 'Pivot'] = pivot;
  };
  const arm = armMat(look), leg = legMat(look);
  limb('armL', DIMS.arm.size, DIMS.arm.shoulder, -1, arm);
  limb('armR', DIMS.arm.size, DIMS.arm.shoulder, 1, arm);
  limb('legL', DIMS.leg.size, DIMS.leg.hip, -1, leg);
  limb('legR', DIMS.leg.size, DIMS.leg.hip, 1, leg);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, parts, look };
}

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
