import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y } from './world.js';
import { canvasTex, speckle, std, sign, lamp, tree, solidBox } from './buildkit.js';
import { suburbanHome } from './suburb.js';
import { islandSlab, flat, pier } from './city.js';

// Saltmarsh Key: a leafy suburb of family homes on a street grid, a market square and a fishing dock.
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

    // suburban streets: asphalt with a centre line, grass verges and concrete footpaths
    this.xs = [-1000, -900, -800, -700];
    this.zs = [-1700, -1600, -1500, -1400, -1300];
    const asphalt = (len) => canvasTex(64, 256, (c, w, h) => {
      c.fillStyle = '#45484c'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, 0.07);
      c.fillStyle = '#e8c547'; for (let y = 0; y < h; y += 32) c.fillRect(w / 2 - 1, y, 2, 18);
    }, [1, len / 24]);
    const path = (len) => canvasTex(32, 64, (c, w, h) => {
      c.fillStyle = '#c4c0b8'; c.fillRect(0, 0, w, h); speckle(c, w, h, 120, 0.05);
      c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 1);
    }, [1, len / 4]);
    const zLen = this.zs.at(-1) - this.zs[0] + 10, xLen = this.xs.at(-1) - this.xs[0] + 10;
    const zMid = (this.zs[0] + this.zs.at(-1)) / 2, xMid = (this.xs[0] + this.xs.at(-1)) / 2;
    const kerb = std({ color: 0xa9a59d, roughness: 0.9 });
    for (const x of this.xs) {
      flat(g, 10, zLen, x, zMid, std({ map: asphalt(zLen) }), Y + 0.03);
      for (const s of [-1, 1]) {
        flat(g, 2, zLen, x + s * 7.3, zMid, std({ map: path(zLen) }), Y + 0.05);
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, zLen), kerb); k.position.set(x + s * 5.1, Y + 0.07, zMid); g.add(k);
      }
    }
    for (const z of this.zs) {
      flat(g, 10, xLen, xMid, z, std({ map: asphalt(xLen) }), Y + 0.035, Math.PI / 2);
      for (const s of [-1, 1]) {
        flat(g, 2, xLen, xMid, z + s * 7.3, std({ map: path(xLen) }), Y + 0.055, Math.PI / 2);
        const k = new THREE.Mesh(new THREE.BoxGeometry(xLen, 0.14, 0.25), kerb); k.position.set(xMid, Y + 0.07, z + s * 5.1); g.add(k);
      }
    }
    // intersections: plain asphalt over the kerbs and footpaths
    for (const x of this.xs) for (const z of this.zs) flat(g, 16.8, 16.8, x, z, std({ color: 0x45484c, roughness: 0.95 }), Y + 0.08);

    const cobble = (len) => canvasTex(64, 128, (c, w, h) => {
      c.fillStyle = '#8f8576'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 ? 0 : 6; x < w; x += 12) {
        c.fillStyle = `rgb(${120 + Math.random() * 40},${112 + Math.random() * 30},${100 + Math.random() * 25})`;
        c.fillRect(x + 1, y + 1, 10, 8);
      }
    }, [1, len / 10]);
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

    // houses: four lots facing each street along the north and south side of every block
    const LOT0 = 8.6; // from the road centre to the front of a lot
    for (let i = 0; i < this.xs.length - 1; i++) for (let j = 0; j < this.zs.length - 1; j++) {
      const x0 = this.xs[i], x1 = this.xs[i + 1], z0 = this.zs[j], z1 = this.zs[j + 1];
      if (Math.abs((x0 + x1) / 2 - mx) < 10 && Math.abs((z0 + z1) / 2 - mz) < 10) continue;
      const span = x1 - x0 - LOT0 * 2, lotW = span / 4, lotD = (z1 - z0 - LOT0 * 2) / 2;
      for (let k = 0; k < 4; k++) {
        const lx = x0 + LOT0 + lotW * (k + 0.5);
        this.addHome(lx, z0 + LOT0, Math.PI, lotW, lotD); // faces the street to the -z side
        this.addHome(lx, z1 - LOT0, 0, lotW, lotD);
      }
      // street trees on the verges, between lots
      for (let k = 0; k <= 4; k++) {
        const tx = x0 + LOT0 + lotW * k;
        if (k > 0 && k < 4 && Math.random() < 0.8) { tree(g, sb, tx, Y, z0 + 5.9 + 0.15, 0.9 + Math.random() * 0.3); tree(g, sb, tx, Y, z1 - 6.05, 0.9 + Math.random() * 0.3); }
      }
    }
    // street lights at the corners
    for (const x of this.xs) for (const z of this.zs) lamp(g, sb, x + 6.1, Y, z + 6.1);

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
    // cars parked on the street
    for (let n = 0; n < 8; n++) {
      const z = this.zs[Math.floor(Math.random() * this.zs.length)];
      const x = -1000 + 20 + Math.random() * 260;
      if (this.xs.some((xx) => Math.abs(xx - x) < 14)) continue;
      this.parkedSpots.push({ x, z: z + 3.6, heading: Math.PI / 2, color: [0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x3aa760][n % 4] });
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

  addHome(x, z, yaw, lotW, lotD) {
    const h = suburbanHome(this.group, this.sb, x, Y, z, yaw, lotW, lotD);
    if (Math.random() < 0.55) this.lootSpots.push({ pos: h.porch, kind: 'porch' });
    // a car in some driveways
    if (h.garage && Math.random() < 0.45) this.parkedSpots.push({ x: h.drive.x, z: h.drive.z, heading: yaw === 0 ? 0 : Math.PI, color: [0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x3aa760, 0x2a2a2a, 0x8a8f96][Math.floor(Math.random() * 6)] });
    if (Math.random() < 0.5) tree(this.group, this.sb, h.backYard.x, Y, h.backYard.z, 1 + Math.random() * 0.4);
  }
}
