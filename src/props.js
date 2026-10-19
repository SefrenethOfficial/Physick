import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './textures.js';

// Shared textures (materials are cloned per prop by the sandbox).
const tex = {};
function getTex() {
  if (tex.crate) return tex;
  tex.crate = T.crate();
  tex.crateDark = T.crate('#6f7f4a', '#454f2c');
  tex.metal = T.metal();
  tex.plank = T.plank();
  tex.ball = T.ball();
  tex.beach = T.ball('#2b8be6', '#ffd43b');
  return tex;
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05, ...o });

function boxProp(w, h, d, mat, extra = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  return { mesh, colliders: [RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)], ...extra };
}

export const PROPS = [
  {
    id: 'crate', name: 'Crate', radius: 0.6,
    build: () => boxProp(1, 1, 1, std({ map: getTex().crate }), { density: 0.6 }),
  },
  {
    id: 'bigcrate', name: 'Big Crate', radius: 1.1,
    build: () => boxProp(2, 2, 2, std({ map: getTex().crateDark }), { density: 0.4 }),
  },
  {
    id: 'plank', name: 'Plank', radius: 0.4,
    build: () => boxProp(4, 0.15, 0.6, std({ map: getTex().plank }), { density: 0.5, friction: 0.9 }),
  },
  {
    id: 'beam', name: 'Steel Beam', radius: 0.4,
    build: () => boxProp(6, 0.3, 0.3, std({ color: 0x8b949c, metalness: 0.6, roughness: 0.4 }), { density: 2.5 }),
  },
  {
    id: 'sheet', name: 'Sheet', radius: 0.2,
    build: () => boxProp(3, 0.08, 3, std({ color: 0xa9b1b8, metalness: 0.5, roughness: 0.45 }), { density: 1.5 }),
  },
  {
    id: 'barrel', name: 'Barrel', radius: 0.7,
    build: () => {
      const t = getTex().metal;
      const side = std({ map: t, metalness: 0.4, roughness: 0.5 });
      const cap = std({ color: 0x4a535c, metalness: 0.4, roughness: 0.5 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 24), [side, cap, cap]);
      return { mesh, colliders: [RAPIER.ColliderDesc.cylinder(0.6, 0.45)], density: 0.8 };
    },
  },
  {
    id: 'wheel', name: 'Wheel', radius: 0.7,
    build: () => {
      const tire = std({ color: 0x222326, roughness: 0.95 });
      const hub = std({ color: 0xb8bec4, metalness: 0.7, roughness: 0.3 });
      const g = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 32);
      g.rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(g, [tire, hub, hub]);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      return { mesh, colliders: [RAPIER.ColliderDesc.cylinder(0.15, 0.6).setRotation(q)], density: 1.2, friction: 1.2 };
    },
  },
  {
    id: 'ball', name: 'Bouncy Ball', radius: 0.5,
    build: () => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), std({ map: getTex().beach, roughness: 0.35 }));
      return { mesh, colliders: [RAPIER.ColliderDesc.ball(0.4)], density: 0.25, restitution: 0.85, friction: 0.5 };
    },
  },
  {
    id: 'boulder', name: 'Boulder', radius: 1,
    build: () => {
      const g = new THREE.IcosahedronGeometry(0.85, 1);
      const pos = g.attributes.position;
      // Lumpy rock: push vertices in/out deterministically by direction.
      const seen = new Map();
      for (let i = 0; i < pos.count; i++) {
        const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
        if (!seen.has(k)) seen.set(k, 0.8 + Math.random() * 0.35);
        const s = seen.get(k);
        pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
      }
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, std({ color: 0x7d7468, roughness: 1, flatShading: true }));
      const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(pos.array));
      return { mesh, colliders: [hull], density: 2.6, friction: 0.9 };
    },
  },
  {
    id: 'cone', name: 'Traffic Cone', radius: 0.5,
    build: () => {
      const mesh = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 24), std({ color: 0xff6a1a, roughness: 0.6 }));
      cone.position.y = 0.05;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.215, 0.14, 24), std({ color: 0xf2f2f2 }));
      band.position.y = 0.12;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.62), std({ color: 0x222222 }));
      base.position.y = -0.38;
      mesh.add(cone, band, base);
      return {
        mesh,
        colliders: [
          RAPIER.ColliderDesc.cone(0.4, 0.3).setTranslation(0, 0.05, 0),
          RAPIER.ColliderDesc.cuboid(0.31, 0.03, 0.31).setTranslation(0, -0.38, 0),
        ],
        density: 0.4,
      };
    },
  },
  {
    id: 'robotarm', name: 'Robo Arm', radius: 1,
    build: (assets) => {
      const t = assets.robotArm; // { template, boxes }
      const mesh = t.template.clone(true);
      const colliders = t.boxes.map((b) =>
        RAPIER.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setTranslation(b.center.x, b.center.y, b.center.z),
      );
      return { mesh, colliders, density: 0.9 };
    },
  },
];

export const CANNONBALL = {
  id: 'cannonball', name: 'Cannonball', radius: 0.3,
  build: () => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 20, 12),
      new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.8, roughness: 0.35 }),
    );
    return { mesh, colliders: [RAPIER.ColliderDesc.ball(0.25)], density: 9, ccd: true, restitution: 0.2 };
  },
};

export const PROP_BY_ID = Object.fromEntries([...PROPS, CANNONBALL].map((p) => [p.id, p]));

// Builds the prop version of the robot arm: flipped so the mount plate sits on the ground,
// centred on its bounds, plus a handful of boxes approximating its shape for collisions.
export function prepareRobotArmProp(gltfScene) {
  const holder = new THREE.Group();
  const inner = gltfScene.clone(true);
  inner.rotation.x = Math.PI; // ceiling mount -> floor mount
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const targetHeight = 2.2;
  const s = targetHeight / size.y;
  inner.scale.setScalar(s);
  holder.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(inner);
  const c = box2.getCenter(new THREE.Vector3());
  inner.position.sub(c);
  holder.updateMatrixWorld(true);

  const boxes = [];
  inner.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const half = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    half.x = Math.max(half.x, 0.04); half.y = Math.max(half.y, 0.04); half.z = Math.max(half.z, 0.04);
    boxes.push({ center: b.getCenter(new THREE.Vector3()), half });
  });
  return { template: holder, boxes };
}
