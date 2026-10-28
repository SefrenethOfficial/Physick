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
  const shirt = mat(look.shirt), pants = mat(look.pants), skin = mat(look.skin);
  const parts = {};

  const torso = new THREE.Mesh(new THREE.BoxGeometry(...DIMS.torso.size), shirt);
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
  if (look.chain) { // a gold chain
    const ch = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20), new THREE.MeshStandardMaterial({ color: 0xe8c547, metalness: 0.7, roughness: 0.3 }));
    ch.position.set(0, 0.5, 0.06); ch.rotation.x = Math.PI / 2 - 0.5; ch.scale.y = 0.75; root.add(ch);
  }
  if (look.backpack) {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.16), mat(look.backpack === true ? 0x2a4a6a : look.backpack)); bp.position.set(0, 0.28, -0.2); root.add(bp);
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
  limb('armL', DIMS.arm.size, DIMS.arm.shoulder, -1, shirt, skin);
  limb('armR', DIMS.arm.size, DIMS.arm.shoulder, 1, shirt, skin);
  limb('legL', DIMS.leg.size, DIMS.leg.hip, -1, pants);
  limb('legR', DIMS.leg.size, DIMS.leg.hip, 1, pants);

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
