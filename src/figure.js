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
  root.add(head);
  parts.head = head;

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
