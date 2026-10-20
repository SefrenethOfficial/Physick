import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y, addPier } from './world.js';
import { canvasTex, speckle, std, building, sign, lamp, tree, carMesh, solidBox } from './buildkit.js';

// Port Calder: the city you start in. A street grid of towers, a plaza, the pawn shop,
// police station, hospital, and a marina with your boat and the boat dealer.

const Y = LAND_Y;

export function islandSlab(group, sb, isl, topMap, sideColor = 0x8c8678) {
  const w = isl.x1 - isl.x0, d = isl.z1 - isl.z0;
  const side = std({ color: sideColor });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 14, d), [side, side, std({ map: topMap }), std({ color: 0x5a5448 }), side, side]);
  m.position.set((isl.x0 + isl.x1) / 2, Y - 7, (isl.z0 + isl.z1) / 2);
  m.receiveShadow = true;
  group.add(m);
  sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, 7, d / 2).setTranslation((isl.x0 + isl.x1) / 2, Y - 7, (isl.z0 + isl.z1) / 2));
  // sea wall rail all round (gaps where piers join are added by the caller)
  return m;
}

export function flat(group, w, d, x, z, mat, y = Y + 0.02, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.set(-Math.PI / 2, 0, rotY);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  group.add(m);
  return m;
}

// Wooden pier from (x0..x1, z0..z1) at deck height Y, with posts.
export function pier(group, sb, x0, x1, z0, z1) {
  const wood = std({ map: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8a6a48'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, w, 2); }
    speckle(g, w, h, 500, 0.08);
  }, [Math.max(1, (x1 - x0) / 4), Math.max(1, (z1 - z0) / 4)]) });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, z1 - z0), wood);
  deck.position.set((x0 + x1) / 2, Y - 0.15, (z0 + z1) / 2);
  deck.receiveShadow = deck.castShadow = true;
  group.add(deck);
  sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.15, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, Y - 0.15, (z0 + z1) / 2));
  const postM = std({ color: 0x4a3a2a });
  const along = x1 - x0 > z1 - z0;
  const len = along ? x1 - x0 : z1 - z0;
  for (let s = 0; s <= len; s += 6) {
    for (const side of [0, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6, 8), postM);
      if (along) p.position.set(x0 + s, Y - 3, side ? z1 : z0);
      else p.position.set(side ? x1 : x0, Y - 3, z0 + s);
      group.add(p);
    }
  }
  addPier(x0, x1, z0, z1);
}

export class City {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'city');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.build();
  }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl;
    const pave = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#b4b0a8'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, 0.07);
      c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
    }, [(isl.x1 - isl.x0) / 3, (isl.z1 - isl.z0) / 3]);
    islandSlab(g, sb, isl, pave, 0x8a8a86);

    // ---- street grid ----
    this.xs = []; this.zs = [];
    for (let i = 0; i < 10; i++) this.xs.push(-1410 + i * 80);
    for (let j = 0; j < 10; j++) this.zs.push(-360 + j * 80);
    const road = (len) => canvasTex(64, 256, (c, w, h) => {
      c.fillStyle = '#3c3f43'; c.fillRect(0, 0, w, h); speckle(c, w, h, 700, 0.06);
      c.fillStyle = '#e8c547'; for (let y = 0; y < h; y += 64) c.fillRect(w / 2 - 1.5, y + 10, 3, 34);
    }, [1, len / 20]);
    const zLen = isl.z1 - isl.z0 - 20, xLen = isl.x1 - isl.x0 - 20;
    for (const x of this.xs) flat(g, 14, zLen, x, (isl.z0 + isl.z1) / 2, std({ map: road(zLen) }), Y + 0.03);
    for (const z of this.zs) flat(g, 14, xLen, (isl.x0 + isl.x1) / 2, z, std({ map: road(xLen) }), Y + 0.035, Math.PI / 2);

    // ---- special places ----
    const bc = (i, j) => new THREE.Vector3(this.xs[i] + 40, Y, this.zs[j] + 40);
    this.spawn = bc(4, 4).clone().add(new THREE.Vector3(0, 1, 12));
    const special = new Set(['4,4', '5,4', '2,1', '6,6']);

    // plaza with a fountain
    const plaza = bc(4, 4);
    flat(g, 66, 66, plaza.x, plaza.z, std({ map: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#d8d0c0'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#bfb6a4'; c.lineWidth = 3; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
    }, [8, 8]) }), Y + 0.04);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.8, 32), std({ color: 0xcfc6b6 }));
    basin.position.set(plaza.x, Y + 0.4, plaza.z);
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), std({ color: 0x3a7da8, roughness: 0.1, metalness: 0.3 }));
    water.rotation.x = -Math.PI / 2; water.position.set(plaza.x, Y + 0.75, plaza.z);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 3, 12), std({ color: 0xcfc6b6 }));
    spout.position.set(plaza.x, Y + 1.5, plaza.z);
    g.add(basin, water, spout);
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(0.4, 6.4).setTranslation(plaza.x, Y + 0.4, plaza.z));
    for (const [dx, dz] of [[-22, -22], [22, -22], [-22, 22], [22, 22], [0, -26], [0, 26], [-26, 0], [26, 0]]) tree(g, sb, plaza.x + dx, Y, plaza.z + dz, 1.1);
    const benchM = std({ color: 0x6b4a2f });
    for (const [dx, dz, r] of [[-12, 0, Math.PI / 2], [12, 0, Math.PI / 2], [0, -12, 0], [0, 12, 0]]) {
      solidBox(g, sb, 3, 0.5, 0.7, plaza.x + dx, Y, plaza.z + dz, benchM, { rotY: r });
      this.lootSpots.push(new THREE.Vector3(plaza.x + dx, Y + 0.8, plaza.z + dz));
    }
    sign(g, 'PORT CALDER', plaza.x, Y + 5, plaza.z - 30, 0, { w: 14, h: 2.4, bg: '#1f3b63' });

    // pawn shop (block 5,4), door facing the plaza street (x = xs[5])
    const pawn = bc(5, 4);
    building(g, sb, pawn.x + 8, pawn.z, 40, 50, 9, Y);
    this.pawnCounter = new THREE.Vector3(pawn.x - 15, Y, pawn.z);
    sign(g, 'PAWN SHOP · WE BUY ANYTHING', pawn.x - 12.1, Y + 6.5, pawn.z, -Math.PI / 2, { w: 16, h: 2, bg: '#a8281e', fg: '#ffe7a0', glow: true });
    solidBox(g, sb, 1.2, 1.1, 4, pawn.x - 13.2, Y, pawn.z, std({ color: 0x5a3b26 }));
    for (const b of [[pawn.x + 8, pawn.z - 28], [pawn.x + 8, pawn.z + 28]]) building(g, sb, b[0], b[1], 40, 6, 14, Y);

    // police station (block 2,1)
    const pd = bc(2, 1);
    building(g, sb, pd.x, pd.z, 50, 40, 14, Y);
    sign(g, 'POLICE', pd.x, Y + 11, pd.z + 20.1, 0, { w: 12, h: 2.4, bg: '#1c2f6e', fg: '#ffffff', glow: true });
    this.policeStation = new THREE.Vector3(pd.x, Y, pd.z + 26);
    this.copNode = { i: 2, j: 2 }; // intersection in front of the station
    for (let k = -1; k <= 1; k++) {
      const car = carMesh(0x1c1c1c, true);
      car.position.set(pd.x + k * 6, Y, pd.z + 28);
      car.rotation.y = Math.PI;
      g.add(car);
    }

    // hospital (block 6,6)
    const hs = bc(6, 6);
    building(g, sb, hs.x, hs.z, 50, 44, 22, Y);
    sign(g, '✚ HOSPITAL', hs.x, Y + 18, hs.z - 22.1, Math.PI, { w: 14, h: 2.6, bg: '#ffffff', fg: '#c62828', glow: true });
    this.hospital = new THREE.Vector3(hs.x, Y + 1, hs.z - 30);

    // ---- ordinary city blocks ----
    const cx = -1050, cz = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      if (special.has(`${i},${j}`)) continue;
      const b = bc(i, j);
      const centrality = 1 - Math.min(Math.hypot(b.x - cx, b.z - cz) / 420, 1);
      if (Math.random() < 0.12) { // car park
        flat(g, 60, 60, b.x, b.z, std({ color: 0x46494d }), Y + 0.04);
        for (let k = 0; k < 6; k++) {
          const car = carMesh([0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x1b1b1b, 0x3aa760, 0xe0a52b][k % 6]);
          car.position.set(b.x - 20 + k * 8, Y, b.z + (k % 2 ? 10 : -10));
          car.rotation.y = k % 2 ? 0 : Math.PI;
          g.add(car);
          sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1, 0.9, 2.3).setTranslation(car.position.x, Y + 0.9, car.position.z));
        }
        continue;
      }
      for (const [ox, oz] of [[-16.5, -16.5], [16.5, -16.5], [-16.5, 16.5], [16.5, 16.5]]) {
        if (Math.random() < 0.1) continue;
        const h = 10 + Math.random() * 18 + centrality * centrality * (40 + Math.random() * 50);
        building(g, sb, b.x + ox, b.z + oz, 27 + Math.random() * 2, 27 + Math.random() * 2, h, Y);
      }
    }
    // lamps at intersections
    for (const x of this.xs) for (const z of this.zs) if ((x + z) % 160 === 0) lamp(g, sb, x + 8, Y, z + 8);
    // parked cars along a few streets
    for (let k = 0; k < 26; k++) {
      const alongX = Math.random() < 0.5;
      const line = alongX ? this.zs[1 + Math.floor(Math.random() * 8)] : this.xs[1 + Math.floor(Math.random() * 8)];
      const t = -340 + Math.random() * 680;
      const x = alongX ? -1050 + t : line + 5.5, z = alongX ? line + 5.5 : t;
      if (Math.abs(x - plaza.x) < 40 && Math.abs(z - plaza.z) < 40) continue;
      const car = carMesh([0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x1b1b1b, 0x3aa760, 0x7a4fb0][k % 6]);
      car.position.set(x, Y, z);
      car.rotation.y = alongX ? Math.PI / 2 : 0;
      g.add(car);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(alongX ? 2.3 : 1, 0.9, alongX ? 1 : 2.3).setTranslation(x, Y + 0.9, z));
      this.lootSpots.push(new THREE.Vector3(x, Y + 0.3, z + (alongX ? 2 : 0) + (alongX ? 0 : 3)));
    }

    // ---- marina on the east waterfront ----
    const mx = isl.x1;
    this.berths = [];
    for (const pz of [-60, 0, 60]) {
      pier(g, sb, mx - 1, mx + 70, pz - 3, pz + 3);
      for (const side of [-1, 1]) for (const bx of [mx + 22, mx + 50]) {
        this.berths.push({ x: bx, z: pz + side * 7.5, heading: -Math.PI / 2 });
      }
    }
    for (let z = isl.z0 + 20; z < isl.z1 - 20; z += 30) if (Math.abs(z) > 80) tree(g, sb, mx - 10, Y, z, 0.9);
    // boat dealer kiosk
    const dk = new THREE.Vector3(mx - 14, Y, 115);
    solidBox(g, sb, 10, 4, 8, dk.x, Y, dk.z, std({ color: 0xf2f2ee }));
    solidBox(g, sb, 11, 0.4, 9, dk.x, Y + 4, dk.z, std({ color: 0x1f6fa8 }), { collide: false });
    sign(g, 'BOAT SALES', dk.x + 5.1, Y + 3.2, dk.z, Math.PI / 2, { w: 8, h: 1.6, bg: '#1f6fa8', fg: '#ffffff', glow: true });
    this.dealerCounter = new THREE.Vector3(dk.x + 7, Y, dk.z);
    sign(g, 'MARINA', mx + 2, Y + 4, 0, Math.PI / 2, { w: 8, h: 1.6, bg: '#2c3e5e' });
    // lamps on the piers
    for (const pz of [-60, 0, 60]) for (const bx of [mx + 20, mx + 50]) lamp(g, sb, bx, Y, pz + 2.6);
  }
}
