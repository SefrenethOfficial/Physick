import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y } from './world.js';
import { canvasTex, speckle, std, house, sign, lamp, tree, solidBox } from './buildkit.js';
import { islandSlab, flat, pier } from './city.js';

// Saltmarsh Key: a small island town of painted houses, a market square and a fishing dock.
// Lots of stuff lying around, and townspeople with wallets worth taking.

const Y = LAND_Y;

export class Saltmarsh {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'town');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = []; // { pos, kind: 'stall' | 'porch' | 'misc' }
    this.parkedSpots = [];
    this.build();
  }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl;
    const grass = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#6f9a4a'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2200; i++) {
        c.fillStyle = Math.random() < 0.5 ? `rgba(50,90,35,${0.2 + Math.random() * 0.3})` : `rgba(150,190,90,${0.15 + Math.random() * 0.2})`;
        c.fillRect(Math.random() * w, Math.random() * h, 2, 2 + Math.random() * 4);
      }
    }, [(isl.x1 - isl.x0) / 8, (isl.z1 - isl.z0) / 8]);
    islandSlab(g, sb, isl, grass, 0x9a8a6a);

    // cobbled lanes
    this.xs = [-1000, -900, -800, -700];
    this.zs = [-1700, -1600, -1500, -1400, -1300];
    const cobble = (len) => canvasTex(64, 128, (c, w, h) => {
      c.fillStyle = '#8f8576'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 ? 0 : 6; x < w; x += 12) {
        c.fillStyle = `rgb(${120 + Math.random() * 40},${112 + Math.random() * 30},${100 + Math.random() * 25})`;
        c.fillRect(x + 1, y + 1, 10, 8);
      }
    }, [1, len / 10]);
    const zLen = 520, xLen = this.xs.at(-1) - this.xs[0] + 10;
    for (const x of this.xs) flat(g, 10, zLen, x, (isl.z0 + isl.z1) / 2, std({ map: cobble(zLen) }), Y + 0.03);
    for (const z of this.zs) flat(g, 10, xLen, (this.xs[0] + this.xs.at(-1)) / 2, z, std({ map: cobble(xLen) }), Y + 0.035, Math.PI / 2);

    // market square (block between xs[2..3], zs[2..3])
    const mx = -750, mz = -1450;
    this.market = new THREE.Vector3(mx, Y, mz);
    flat(g, 88, 88, mx, mz, std({ map: cobble(88) }), Y + 0.04);
    const awnings = [0xc23b2a, 0x2f7fd8, 0x3aa760, 0xe0a52b, 0x8a54c9, 0xe06a9b];
    let k = 0;
    for (const sx of [-24, -8, 8, 24]) for (const sz of [-22, 0, 22]) {
      const x = mx + sx, z = mz + sz;
      solidBox(g, sb, 4, 0.9, 2, x, Y, z, std({ color: 0x8a6a48 }));
      for (const [px, pz] of [[-1.9, -0.9], [1.9, -0.9], [-1.9, 0.9], [1.9, 0.9]]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), std({ color: 0x4a3a2a }));
        p.position.set(x + px, Y + 1.3, z + pz);
        g.add(p);
      }
      const aw = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 2.6), std({ color: awnings[k++ % awnings.length] }));
      aw.position.set(x, Y + 2.6, z);
      aw.rotation.x = 0.12;
      aw.castShadow = true;
      g.add(aw);
      for (let n = 0; n < 2; n++) this.lootSpots.push({ pos: new THREE.Vector3(x - 1.2 + n * 2.4, Y + 1.2, z), kind: 'stall' });
    }
    tree(g, sb, mx - 38, Y, mz - 38, 1.2); tree(g, sb, mx + 38, Y, mz + 38, 1.2); tree(g, sb, mx - 38, Y, mz + 38, 1.2); tree(g, sb, mx + 38, Y, mz - 38, 1.2);
    sign(g, 'SALTMARSH MARKET', mx, Y + 3.4, mz - 44, Math.PI, { w: 11, h: 1.6, bg: '#7a2e2e', fg: '#ffe7a0', post: Y });

    // houses around every other block's edges
    for (let i = 0; i < this.xs.length - 1; i++) for (let j = 0; j < 4; j++) {
      const x0 = this.xs[i], x1 = this.xs[i + 1], z0 = this.zs[j], z1 = this.zs[j + 1];
      const bx = (x0 + x1) / 2, bz = (z0 + z1) / 2;
      if (Math.abs(bx - mx) < 10 && Math.abs(bz - mz) < 10) continue;
      // a house (sometimes two) facing each lane around the block
      const pickT = () => (Math.random() < 0.3 ? [-22, 22] : [Math.random() < 0.5 ? -22 : 22]);
      for (const t of pickT()) this.addHouse(bx + t, z0 + 14, Math.PI);
      for (const t of pickT()) this.addHouse(bx + t, z1 - 14, 0);
      for (const t of pickT()) this.addHouse(x0 + 14, bz + t, -Math.PI / 2);
      for (const t of pickT()) this.addHouse(x1 - 14, bz + t, Math.PI / 2);
      if (Math.random() < 0.6) tree(g, sb, bx + (Math.random() - 0.5) * 20, Y, bz + (Math.random() - 0.5) * 20, 1 + Math.random() * 0.5);
    }
    // a few lamps
    for (const x of this.xs) for (const z of this.zs) if (Math.random() < 0.5) lamp(g, sb, x + 6, Y, z + 6);

    // church + lighthouse landmarks
    solidBox(g, sb, 14, 10, 22, -667, Y, -1650, std({ color: 0xece6da }));
    const steeple = new THREE.Mesh(new THREE.ConeGeometry(3.5, 12, 4), std({ color: 0x4b5563 }));
    steeple.position.set(-667, Y + 22, -1662);
    solidBox(g, sb, 6, 12, 6, -667, Y + 4, -1662, std({ color: 0xece6da }), { collide: false });
    g.add(steeple);
    const lh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 16), std({ map: canvasTex(64, 64, (c, w, h) => { for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#c62828' : '#f2f2ee'; c.fillRect(0, (i * h) / 4, w, h / 4); } }) }));
    lh.position.set(-655, Y + 11, -1215);
    const lamphouse = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.5, 12), std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 1 }));
    lamphouse.position.set(-655, Y + 23.3, -1215);
    g.add(lh, lamphouse);
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(11, 3).setTranslation(-655, Y + 11, -1215));

    // general store + parked cars
    solidBox(g, sb, 14, 6, 20, -667, Y, -1350, std({ color: 0xd9c08a }));
    sign(g, 'GENERAL STORE', -674.1, Y + 5, -1350, -Math.PI / 2, { w: 10, h: 1.6, bg: '#2f4f2f', fg: '#ffe7a0' });
    for (let n = 0; n < 4; n++) this.lootSpots.push({ pos: new THREE.Vector3(-676, Y + 0.3, -1356 + n * 4), kind: 'porch' });
    for (let n = 0; n < 8; n++) {
      const z = this.zs[Math.floor(Math.random() * this.zs.length)];
      const x = -1000 + 60 + Math.random() * 230;
      this.parkedSpots.push({ x, z: z + 6.5, heading: Math.PI / 2, color: [0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x3aa760][n % 4] });
    }

    // fishing dock on the north shore
    pier(g, sb, -756, -744, isl.z1 - 1, isl.z1 + 70);
    pier(g, sb, -790, -710, isl.z1 + 64, isl.z1 + 70);
    this.dock = new THREE.Vector3(-750, Y, isl.z1 + 4);
    this.berths = [{ x: -763, z: isl.z1 + 35, heading: 0 }, { x: -737, z: isl.z1 + 35, heading: 0 }];
    for (let n = 0; n < 6; n++) {
      const c = solidBox(g, sb, 1.2, 0.8, 1.2, -752 + (n % 2) * 3.5, Y, isl.z1 + 8 + n * 7, std({ color: 0x8a6a48 }));
      void c;
      this.lootSpots.push({ pos: new THREE.Vector3(-752 + (n % 2) * 3.5, Y + 1.2, isl.z1 + 8 + n * 7), kind: 'misc' });
    }
    sign(g, 'SALTMARSH KEY', -742, Y + 3, isl.z1 - 3, 0, { w: 8, h: 1.5, bg: '#2c3e5e', post: Y });
  }

  addHouse(x, z, yaw) {
    const porch = house(this.group, this.sb, x, Y, z, yaw, 9 + Math.random() * 2, 7 + Math.random() * 2, 3.6 + Math.random());
    if (Math.random() < 0.55) this.lootSpots.push({ pos: porch, kind: 'porch' });
  }
}
