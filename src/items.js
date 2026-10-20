import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Things you can pick up with the robot arm, carry, put on shelves, throw, and sometimes use.

function labelTex(bg, fg, text, w = 256, h = 128, extra) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
  extra?.(g, w, h);
  if (text) {
    g.fillStyle = fg;
    g.font = `bold ${Math.round(h * 0.32)}px "Chakra Petch", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const cache = {};
const tex = (key, fn) => (cache[key] ||= fn());
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });

function boxItem(w, h, d, faceMat, sideMat) {
  const mats = faceMat && sideMat ? [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat] : faceMat || sideMat;
  return {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats),
    colliders: [RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)],
  };
}

export const ITEMS = [
  {
    id: 'ammo', name: 'Ammo Box', radius: 0.3, weight: 3,
    build: () => {
      const face = std({ map: tex('ammo', () => labelTex('#4f5a32', '#e8c547', '7.62 MM')) });
      const side = std({ color: 0x4f5a32 });
      const it = boxItem(0.42, 0.24, 0.2, face, side);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.04), std({ color: 0x222222 }));
      handle.position.y = 0.135;
      it.mesh.add(handle);
      return { ...it, density: 160 };
    },
  },
  {
    id: 'toolbox', name: 'Toolbox', radius: 0.3, weight: 2,
    build: () => {
      const it = boxItem(0.5, 0.22, 0.22, null, std({ color: 0xc23b2a, metalness: 0.4, roughness: 0.4 }));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI), std({ color: 0x222222 }));
      handle.position.y = 0.11;
      it.mesh.add(handle);
      return { ...it, density: 120 };
    },
  },
  {
    id: 'rations', name: 'Ration Crate', radius: 0.35, weight: 3,
    build: () => {
      const face = std({ map: tex('rations', () => labelTex('#a87a48', '#3b2a17', 'RATIONS', 256, 128, (g, w, h) => {
        g.strokeStyle = '#6e4d2a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
      })) });
      return { ...boxItem(0.55, 0.3, 0.38, face, std({ color: 0xa87a48 })), density: 70 };
    },
  },
  {
    id: 'medkit', name: 'Medkit', radius: 0.25, weight: 1, use: 'heal',
    build: () => {
      const face = std({ map: tex('medkit', () => labelTex('#f2f2ee', '#d32f2f', '', 128, 128, (g, w) => {
        g.fillStyle = '#d32f2f'; g.fillRect(w * 0.4, w * 0.15, w * 0.2, w * 0.7); g.fillRect(w * 0.15, w * 0.4, w * 0.7, w * 0.2);
      })) });
      return { ...boxItem(0.34, 0.22, 0.12, face, std({ color: 0xf2f2ee })), density: 80 };
    },
  },
  {
    id: 'extinguisher', name: 'Fire Extinguisher', radius: 0.35, weight: 2,
    build: () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 14), std({ color: 0xd32f2f, roughness: 0.35 }));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 8), std({ color: 0x222222 }));
      top.position.y = 0.29;
      const hose = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), std({ color: 0x222222 }));
      hose.position.set(0, 0.3, 0.07);
      g.add(body, top, hose);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.27, 0.08)], density: 300 };
    },
  },
  {
    id: 'jerrycan', name: 'Jerry Can', radius: 0.3, weight: 3,
    build: () => {
      const it = boxItem(0.34, 0.45, 0.16, null, std({ color: 0x3f5b33, roughness: 0.5 }));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), std({ color: 0x222222 }));
      cap.position.set(0.11, 0.25, 0);
      it.mesh.add(cap);
      return { ...it, density: 160 };
    },
  },
  {
    id: 'mug', name: 'Coffee Mug', radius: 0.12, weight: 0.3, use: 'coffee',
    build: () => {
      const g = new THREE.Group();
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 14), std({ color: 0x1f3b63, roughness: 0.3 }));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 10), std({ color: 0x1f3b63 }));
      handle.position.x = 0.055;
      handle.rotation.y = Math.PI / 2;
      g.add(cup, handle);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.055, 0.05)], density: 200 };
    },
  },
  {
    id: 'lifejacket', name: 'Life Jacket', radius: 0.3, weight: 1,
    build: () => {
      const it = boxItem(0.42, 0.5, 0.12, null, std({ color: 0xff6a1a, roughness: 0.8 }));
      for (const y of [-0.1, 0.1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.03, 0.13), std({ color: 0xdfdfdf }));
        strap.position.y = y;
        it.mesh.add(strap);
      }
      return { ...it, density: 25 };
    },
  },
  {
    id: 'wrench', name: 'Wrench', radius: 0.25, weight: 1,
    build: () => {
      const g = new THREE.Group();
      const m = std({ color: 0xaab2b8, metalness: 0.8, roughness: 0.3 });
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.36), m);
      const head = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.014, 6, 10, Math.PI * 1.6), m);
      head.rotation.x = Math.PI / 2;
      head.position.z = -0.2;
      g.add(shaft, head);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cuboid(0.04, 0.015, 0.22)], density: 900 };
    },
  },
  {
    id: 'rope', name: 'Coil of Rope', radius: 0.3, weight: 2,
    build: () => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 8, 20), std({ color: 0xcbb68a, roughness: 1 }));
      mesh.rotation.x = Math.PI / 2;
      const g = new THREE.Group();
      g.add(mesh);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.06, 0.24)], density: 90 };
    },
  },
  {
    id: 'shell', name: '5-inch Shell', radius: 0.4, weight: 4,
    build: () => {
      const g = new THREE.Group();
      const brass = std({ color: 0xc8a24a, metalness: 0.9, roughness: 0.25 });
      const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 16), brass);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 16), std({ color: 0x3a3f45, metalness: 0.5 }));
      tip.position.y = 0.31;
      caseM.position.y = 0;
      g.add(caseM, tip);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.3, 0.065).setTranslation(0, 0.08, 0)], density: 900 };
    },
  },
  {
    id: 'flashlight', name: 'Flashlight', radius: 0.2, weight: 0.5,
    build: () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 10), std({ color: 0x222222 }));
      body.rotation.z = Math.PI / 2;
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 10), std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 0.8 }));
      lens.rotation.z = Math.PI / 2;
      lens.position.x = 0.13;
      g.add(body, lens);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cuboid(0.14, 0.035, 0.035)], density: 500 };
    },
  },
  {
    id: 'mop', name: 'Mop', radius: 0.5, weight: 1.5, use: 'mop', heldSize: 0.5,
    build: () => {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8), std({ color: 0xb58a55 }));
      handle.position.y = 0.2;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.22, 14), std({ color: 0xdedbd2, roughness: 1 }));
      head.position.y = -0.58;
      for (let i = 0; i < 10; i++) {
        const strand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), std({ color: 0xcfcabb, roughness: 1 }));
        const a = (i / 10) * Math.PI * 2;
        strand.position.set(Math.cos(a) * 0.12, -0.72, Math.sin(a) * 0.12);
        strand.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
        g.add(strand);
      }
      g.add(handle, head);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.7, 0.05).setTranslation(0, 0.2, 0), RAPIER.ColliderDesc.cylinder(0.12, 0.15).setTranslation(0, -0.6, 0)], density: 150 };
    },
  },

  // ---- valuables and town loot ----
  {
    id: 'wallet', name: 'Wallet', radius: 0.12, weight: 0.2,
    build: () => ({ ...boxItem(0.11, 0.025, 0.09, null, std({ color: 0x4a2f1c, roughness: 0.6 })), density: 300 }),
  },
  {
    id: 'phone', name: 'Phone', radius: 0.1, weight: 0.2,
    build: () => {
      const face = std({ map: tex('phone', () => labelTex('#0d1116', '#4fa3ff', '', 64, 128, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#1f4fa0'); grd.addColorStop(1, '#7a2fa0');
        g.fillStyle = grd; g.fillRect(4, 8, w - 8, h - 16);
      })), roughness: 0.2 });
      const it = boxItem(0.075, 0.01, 0.155, null, std({ color: 0x1b1c1e, metalness: 0.5 }));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.15), face);
      scr.rotation.x = -Math.PI / 2; scr.position.y = 0.006;
      it.mesh.add(scr);
      return { ...it, density: 800 };
    },
  },
  {
    id: 'watch', name: 'Gold Watch', radius: 0.1, weight: 0.1,
    build: () => {
      const g = new THREE.Group();
      const gold = std({ color: 0xd4a72c, metalness: 0.95, roughness: 0.2 });
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 16), gold);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 16), gold);
      band.rotation.x = Math.PI / 2;
      g.add(face, band);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.008, 0.04)], density: 1500 };
    },
  },
  {
    id: 'necklace', name: 'Diamond Necklace', radius: 0.12, weight: 0.1,
    build: () => {
      const g = new THREE.Group();
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.004, 6, 24), std({ color: 0xe8e8e8, metalness: 1, roughness: 0.15 }));
      chain.rotation.x = Math.PI / 2;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), std({ color: 0xcfefff, metalness: 0.2, roughness: 0, emissive: 0x335566 }));
      gem.position.set(0, 0.01, 0.07);
      g.add(chain, gem);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.01, 0.075)], density: 800 };
    },
  },
  {
    id: 'laptop', name: 'Laptop', radius: 0.25, weight: 2,
    build: () => {
      const it = boxItem(0.34, 0.025, 0.24, null, std({ color: 0xb8bec4, metalness: 0.7, roughness: 0.3 }));
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.24), std({ color: 0xb8bec4, metalness: 0.7, roughness: 0.3 }));
      lid.position.set(0, 0.11, -0.115); lid.rotation.x = -1.2;
      it.mesh.add(lid);
      return { ...it, density: 600 };
    },
  },
  {
    id: 'tv', name: 'Flat-screen TV', radius: 0.6, weight: 6,
    build: () => {
      const it = boxItem(1.0, 0.6, 0.06, null, std({ color: 0x111214, roughness: 0.3 }));
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.18), std({ color: 0x222222 }));
      stand.position.y = -0.32;
      it.mesh.add(stand);
      return { ...it, density: 160 };
    },
  },
  {
    id: 'painting', name: 'Oil Painting', radius: 0.5, weight: 3,
    build: () => {
      const art = std({ map: tex('painting', () => labelTex('#c99a4e', '#fff', '', 160, 128, (g, w, h) => {
        g.fillStyle = '#2c5a7a'; g.fillRect(12, 12, w - 24, h * 0.5);
        g.fillStyle = '#5a7a3a'; g.fillRect(12, h * 0.5, w - 24, h * 0.5 - 12);
        g.fillStyle = '#f2d36a'; g.beginPath(); g.arc(w * 0.7, h * 0.3, 12, 0, 7); g.fill();
        g.fillStyle = '#3b2a17'; g.fillRect(w * 0.3, h * 0.35, 8, h * 0.3);
      })) });
      return { ...boxItem(0.8, 0.64, 0.05, art, std({ color: 0x8a6a2e, metalness: 0.4 })), density: 200 };
    },
  },
  {
    id: 'goldbar', name: 'Gold Bar', radius: 0.15, weight: 4,
    build: () => ({ ...boxItem(0.24, 0.06, 0.1, null, std({ color: 0xd4a72c, metalness: 1, roughness: 0.2 })), density: 9000 }),
  },
  {
    id: 'radio', name: 'Radio', radius: 0.25, weight: 1.5,
    build: () => {
      const face = std({ map: tex('radio', () => labelTex('#5a3b26', '#e0d0a0', '', 128, 96, (g, w, h) => {
        g.fillStyle = '#d8c79c'; g.beginPath(); g.arc(w * 0.3, h / 2, 24, 0, 7); g.fill();
        g.fillStyle = '#222'; for (let i = 0; i < 4; i++) g.fillRect(w * 0.6, 20 + i * 16, w * 0.3, 6);
      })) });
      return { ...boxItem(0.32, 0.2, 0.12, face, std({ color: 0x5a3b26 })), density: 250 };
    },
  },
  {
    id: 'camera', name: 'Camera', radius: 0.15, weight: 0.6,
    build: () => {
      const it = boxItem(0.14, 0.09, 0.07, null, std({ color: 0x1b1c1e, roughness: 0.4 }));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 14), std({ color: 0x2b2d30, metalness: 0.6 }));
      lens.rotation.x = Math.PI / 2; lens.position.z = 0.06;
      it.mesh.add(lens);
      return { ...it, density: 900 };
    },
  },
  {
    id: 'handbag', name: 'Handbag', radius: 0.2, weight: 0.8,
    build: () => {
      const it = boxItem(0.3, 0.2, 0.12, null, std({ color: [0x8a2e3a, 0x2e3a8a, 0x1b1b1b, 0xc8a46e][Math.floor(Math.random() * 4)], roughness: 0.5 }));
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 16, Math.PI), std({ color: 0x222 }));
      strap.position.y = 0.1;
      it.mesh.add(strap);
      return { ...it, density: 120 };
    },
  },
  {
    id: 'vase', name: 'Antique Vase', radius: 0.2, weight: 1.5,
    build: () => {
      const pts = [[0, 0], [0.08, 0], [0.11, 0.08], [0.09, 0.22], [0.05, 0.3], [0.07, 0.36]].map(([r, y]) => new THREE.Vector2(r, y));
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), std({ color: 0x2e5aa8, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide }));
      m.position.y = -0.18;
      const g = new THREE.Group(); g.add(m);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.18, 0.1)], density: 400 };
    },
  },
  {
    id: 'cash', name: 'Bundle of Cash', radius: 0.12, weight: 0.2, cash: true,
    build: () => {
      const face = std({ map: tex('cash', () => labelTex('#7fb27a', '#2e5a2a', '$100', 128, 64)) });
      return { ...boxItem(0.16, 0.04, 0.07, face, std({ color: 0x9cc796 })), density: 600 };
    },
  },
  {
    id: 'bat', name: 'Baseball Bat', radius: 0.45, weight: 1, melee: 70, heldSize: 0.42,
    build: () => {
      const pts = [[0, -0.42], [0.016, -0.42], [0.018, -0.4], [0.017, -0.1], [0.03, 0.15], [0.034, 0.38], [0, 0.42]].map(([r, y]) => new THREE.Vector2(r, y));
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), std({ color: 0xc8a06a, roughness: 0.6 }));
      const g = new THREE.Group(); g.add(m);
      return { mesh: g, colliders: [RAPIER.ColliderDesc.cylinder(0.42, 0.03)], density: 700 };
    },
  },
];

// What a pawn shop pays for each thing ($).
export const VALUES = {
  ammo: 40, toolbox: 60, rations: 25, medkit: 50, extinguisher: 35, jerrycan: 30, mug: 5, lifejacket: 20,
  wrench: 25, rope: 15, shell: 150, flashlight: 20, mop: 8,
  wallet: 45, phone: 120, watch: 220, necklace: 380, laptop: 450, tv: 300, painting: 650, goldbar: 1200,
  radio: 60, camera: 180, handbag: 90, vase: 110, cash: 100, bat: 30,
};
export const LOOT_COMMON = ['wallet', 'phone', 'handbag', 'radio', 'mug', 'flashlight', 'rope', 'wrench', 'camera', 'bat'];
export const LOOT_RARE = ['watch', 'necklace', 'laptop', 'tv', 'painting', 'vase', 'cash', 'goldbar'];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
for (const it of ITEMS) { it.item = true; it.value = VALUES[it.id] ?? 10; }
