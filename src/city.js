import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y, addPier } from './world.js';
import { canvasTex, speckle, std, sign, lamp, tree, carMesh, solidBox } from './buildkit.js';
import { cityBuilding } from './architecture.js';
import { dressAlley } from './underworld.js';

// Port Calder: the city you start in. A compact 5 x 5 grid of blocks with kerbed pavements,
// brick walk-ups with shopfronts, apartment blocks and glass towers downtown, shops and
// lobbies you can walk into, a plaza with a fountain, the pawn shop, police station,
// hospital, and a marina on the east waterfront.

const Y = LAND_Y;
const ROAD = 16; // road width: a lane each way plus parking
const KERB = 0.15; // pavement height
const WALK = 4; // pavement width
export const LANE = 3; // lane centre offset from the road centreline
export const PARK = 6.4; // parked cars

export function islandSlab(group, sb, isl, topMap, sideColor = 0x8c8678) {
  const w = isl.x1 - isl.x0, d = isl.z1 - isl.z0;
  const side = std({ color: sideColor });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 14, d), [side, side, std({ map: topMap }), std({ color: 0x5a5448 }), side, side]);
  m.position.set((isl.x0 + isl.x1) / 2, Y - 7, (isl.z0 + isl.z1) / 2);
  m.receiveShadow = true;
  m.userData.noMerge = true;
  group.add(m);
  sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, 7, d / 2).setTranslation((isl.x0 + isl.x1) / 2, Y - 7, (isl.z0 + isl.z1) / 2));
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

const pave = (rep) => canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#b9b5ad'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, 0.07);
  c.strokeStyle = 'rgba(0,0,0,0.14)'; c.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
});

export class City {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'city');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.interiors = [];
    this.xs = []; this.zs = [];
    for (let i = 0; i < 6; i++) this.xs.push(-1090 + i * 70);
    for (let j = 0; j < 6; j++) this.zs.push(-175 + j * 70);
    this.lane = LANE;
    this.build();
  }

  // Block (i, j) is the land between roads i..i+1 and j..j+1 (kerb to kerb).
  block(i, j) {
    return { x0: this.xs[i] + ROAD / 2, x1: this.xs[i + 1] - ROAD / 2, z0: this.zs[j] + ROAD / 2, z1: this.zs[j + 1] - ROAD / 2 };
  }

  // Pavement corner c (0 NW, 1 NE, 2 SE, 3 SW) of a block, where pedestrians turn.
  corner(i, j, c) {
    const b = this.block(i, j), m = 2.4;
    const x = c === 0 || c === 3 ? b.x0 + m : b.x1 - m;
    const z = c < 2 ? b.z0 + m : b.z1 - m;
    return new THREE.Vector3(x, Y + KERB, z);
  }

  get blocks() { return this.xs.length - 1; }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl;
    islandSlab(g, sb, isl, pave([(isl.x1 - isl.x0) / 4, (isl.z1 - isl.z0) / 4]), 0x8a8a86);
    const T = this.texs();

    // ---- roads: one lane each way, parking either side, crossings at every junction ----
    const x0 = this.xs[0], x1 = this.xs[5], z0 = this.zs[0], z1 = this.zs[5];
    for (const x of this.xs) flat(g, ROAD, z1 - z0 + ROAD, x, (z0 + z1) / 2, std({ map: T.road(z1 - z0 + ROAD) }), Y + 0.03);
    for (const z of this.zs) flat(g, ROAD, x1 - x0 + ROAD, (x0 + x1) / 2, z, std({ map: T.road(x1 - x0 + ROAD) }), Y + 0.035, Math.PI / 2);
    const asphalt = std({ map: T.asphalt });
    const zebra = std({ map: T.zebra });
    for (const x of this.xs) for (const z of this.zs) {
      flat(g, ROAD, ROAD, x, z, asphalt, Y + 0.04);
      for (const [dx, dz, r] of [[0, -ROAD / 2 - 2, 0], [0, ROAD / 2 + 2, 0], [-ROAD / 2 - 2, 0, Math.PI / 2], [ROAD / 2 + 2, 0, Math.PI / 2]]) {
        const ex = x + dx, ez = z + dz;
        if (ex < x0 - 1 || ex > x1 + 1 || ez < z0 - 1 || ez > z1 + 1) continue;
        flat(g, ROAD - 2, 3, ex, ez, zebra, Y + 0.045, r);
      }
    }

    // ---- special places ----
    const bc = (i, j) => { const b = this.block(i, j); return new THREE.Vector3((b.x0 + b.x1) / 2, Y + KERB, (b.z0 + b.z1) / 2); };
    const plaza = bc(2, 2);
    this.plaza = plaza;
    this.spawn = plaza.clone().add(new THREE.Vector3(0, 1.1, 14));
    const special = new Set(['2,2', '1,1', '3,3', '1,3']);
    const ALLEYS = ['0,2', '4,1', '2,4']; // blocks cut through by a service alley
    this.alleys = [];

    // every block gets a kerbed pavement slab
    const walkM = std({ map: T.slabs });
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const b = this.block(i, j), w = b.x1 - b.x0, d = b.z1 - b.z0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, KERB, d), [T.kerb, T.kerb, walkM, T.kerb, T.kerb, T.kerb]);
      m.position.set((b.x0 + b.x1) / 2, Y + KERB / 2, (b.z0 + b.z1) / 2);
      m.receiveShadow = true;
      g.add(m);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, KERB / 2, d / 2).setTranslation(m.position.x, m.position.y, m.position.z));
      // street trees and lamps along the kerb
      for (const [ax, az, bx, bz] of [[b.x0, b.z0, b.x1, b.z0], [b.x0, b.z1, b.x1, b.z1], [b.x0, b.z0, b.x0, b.z1], [b.x1, b.z0, b.x1, b.z1]]) {
        const len = Math.hypot(bx - ax, bz - az);
        const nx = ax === bx ? (ax === b.x0 ? 1 : -1) : 0, nz = az === bz ? (az === b.z0 ? 1 : -1) : 0;
        for (let s = 9; s < len - 8; s += 13) {
          const t = s / len;
          const px = ax + (bx - ax) * t + nx * 1.0, pz = az + (bz - az) * t + nz * 1.0;
          if (special.has(`${i},${j}`) && !(i === 2 && j === 2)) continue;
          if (Math.random() < 0.3) tree(g, sb, px, Y + KERB, pz, 0.75 + Math.random() * 0.2);
          else if (Math.random() < 0.25) lamp(g, sb, px, Y + KERB, pz);
        }
      }
    }

    // plaza with a fountain
    flat(g, 52, 52, plaza.x, plaza.z, std({ map: T.plaza }), Y + KERB + 0.01);
    const stone = std({ color: 0xcfc6b6 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.8, 32), stone);
    basin.position.set(plaza.x, Y + KERB + 0.4, plaza.z);
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), std({ color: 0x3a7da8, roughness: 0.1, metalness: 0.3 }));
    water.rotation.x = -Math.PI / 2; water.position.set(plaza.x, Y + KERB + 0.75, plaza.z);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 3, 12), stone);
    spout.position.set(plaza.x, Y + KERB + 1.5, plaza.z);
    g.add(basin, water, spout);
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(0.4, 6.4).setTranslation(plaza.x, Y + KERB + 0.4, plaza.z));
    for (const [dx, dz] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) tree(g, sb, plaza.x + dx, Y + KERB, plaza.z + dz, 1.05);
    const benchM = std({ color: 0x6b4a2f });
    for (const [dx, dz, r] of [[-11, 0, Math.PI / 2], [11, 0, Math.PI / 2], [0, -11, 0], [0, 11, 0]]) {
      solidBox(g, sb, 3, 0.5, 0.7, plaza.x + dx, Y + KERB, plaza.z + dz, benchM, { rotY: r });
      this.lootSpots.push(new THREE.Vector3(plaza.x + dx, Y + KERB + 0.8, plaza.z + dz));
    }
    sign(g, 'PORT CALDER', plaza.x, Y + 5, plaza.z - 24, 0, { w: 12, h: 2, bg: '#1f3b63' });

    // pocket park (block 1,3)
    const park = this.block(1, 3);
    const grass = std({ map: T.grass });
    flat(g, park.x1 - park.x0 - 6, park.z1 - park.z0 - 6, (park.x0 + park.x1) / 2, (park.z0 + park.z1) / 2, grass, Y + KERB + 0.01);
    for (let n = 0; n < 9; n++) tree(g, sb, park.x0 + 8 + Math.random() * (park.x1 - park.x0 - 16), Y + KERB, park.z0 + 8 + Math.random() * (park.z1 - park.z0 - 16), 0.9 + Math.random() * 0.5);
    for (const dz of [-8, 8]) {
      solidBox(g, sb, 3, 0.5, 0.7, (park.x0 + park.x1) / 2, Y + KERB, (park.z0 + park.z1) / 2 + dz, benchM);
      this.lootSpots.push(new THREE.Vector3((park.x0 + park.x1) / 2, Y + KERB + 0.8, (park.z0 + park.z1) / 2 + dz));
    }

    // ---- buildings ----
    const y0 = Y + KERB;
    const quad = (i, j) => {
      const b = this.block(i, j);
      const ax0 = b.x0 + WALK, ax1 = b.x1 - WALK, az0 = b.z0 + WALK, az1 = b.z1 - WALK;
      const s = (ax1 - ax0 - 2) / 2;
      return [
        { x0: ax0, x1: ax0 + s, z0: az0, z1: az0 + s, streets: new Set(['n', 'w']), key: 'NW' },
        { x0: ax1 - s, x1: ax1, z0: az0, z1: az0 + s, streets: new Set(['n', 'e']), key: 'NE' },
        { x0: ax1 - s, x1: ax1, z0: az1 - s, z1: az1, streets: new Set(['s', 'e']), key: 'SE' },
        { x0: ax0, x1: ax0 + s, z0: az1 - s, z1: az1, streets: new Set(['s', 'w']), key: 'SW' },
      ];
    };
    const whole = (i, j) => {
      const b = this.block(i, j);
      return { x0: b.x0 + WALK, x1: b.x1 - WALK, z0: b.z0 + WALK, z1: b.z1 - WALK, streets: new Set(['n', 's', 'e', 'w']) };
    };
    const place = (r, front, opts) => {
      const ew = front === 'e' || front === 'w';
      const lot = {
        cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, y0,
        w: ew ? r.z1 - r.z0 : r.x1 - r.x0, d: ew ? r.x1 - r.x0 : r.z1 - r.z0,
        front, streets: r.streets,
      };
      const out = cityBuilding(g, sb, lot, opts);
      for (const p of out.loot) this.lootSpots.push(p);
      if (opts.interior) this.interiors.push({ kind: opts.interior, name: opts.name, door: out.door, inside: out.inside });
      return out;
    };
    const pickFront = (r) => { const a = [...r.streets]; return a[Math.floor(Math.random() * a.length)]; };

    // pawn shop: block (3,2), the corner lot facing the plaza across the street
    const pq = quad(3, 2);
    const pawn = place(pq[0], 'w', { type: 'brick', floors: 3, interior: 'pawn', name: 'PAWN · WE BUY ANYTHING', signBg: '#a8281e' });
    this.pawnCounter = pawn.counter;
    this.pawnDoor = pawn.door;
    place(pq[1], 'n', { type: 'brick', floors: 4 });
    place(pq[2], 's', { type: 'apartment', floors: 7 });
    place(pq[3], 'w', { type: 'brick', floors: 3, interior: 'shop', name: 'CORNER STORE', signBg: '#1f5f3a' });

    // diner and a shop facing the plaza from the north
    const dq = quad(2, 1);
    place(dq[3], 's', { type: 'brick', floors: 2, interior: 'diner', name: 'CALDER DINER', signBg: '#b0201c', signFg: '#ffffff' });
    place(dq[2], 's', { type: 'brick', floors: 4, interior: 'shop', name: 'ELECTRONICS', signBg: '#1f2f6f' });
    place(dq[0], 'n', { type: 'apartment', floors: 8 });
    place(dq[1], 'e', { type: 'office', floors: 12 });

    // police station (block 1,1)
    const pd = place(whole(1, 1), 's', { type: 'civic', floors: 2, interior: 'lobby', name: 'POLICE', signBg: '#1c2f6e', signFg: '#ffffff', color: '#d9d4c8' });
    const pdb = this.block(1, 1);
    this.policeStation = new THREE.Vector3((pdb.x0 + pdb.x1) / 2, Y + KERB, pdb.z1 - 1.5);
    this.copNode = { i: 1, j: 2 };
    void pd;
    for (let k = -1; k <= 1; k++) {
      const car = carMesh(0x15171c, true);
      car.position.set(this.policeStation.x + k * 7, Y, this.zs[2] - PARK);
      car.rotation.y = Math.PI / 2;
      g.add(car);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(2.3, 0.9, 1).setTranslation(car.position.x, Y + 0.9, car.position.z));
    }

    // hospital (block 3,3)
    place(whole(3, 3), 'n', { type: 'civic', floors: 6, interior: 'lobby', name: '✚ HOSPITAL', signBg: '#ffffff', signFg: '#c62828', color: '#eef0f0' });
    const hb = this.block(3, 3);
    this.hospital = new THREE.Vector3((hb.x0 + hb.x1) / 2, Y + KERB + 1.1, hb.z0 + 1.5);

    // everything else: taller in the middle, low-rise brick at the edges
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      if (special.has(`${i},${j}`) || (i === 3 && j === 2) || (i === 2 && j === 1)) continue;
      if (ALLEYS.includes(`${i},${j}`)) {
        // two rows of walk-ups back to back with a grimy service alley between them
        const b = whole(i, j), mid = (b.z0 + b.z1) / 2, AW = 7;
        place({ ...b, z1: mid - AW / 2, streets: new Set(['n', 'e', 'w']) }, 'n', { type: 'brick', floors: 2 + Math.floor(Math.random() * 3) });
        place({ ...b, z0: mid + AW / 2, streets: new Set(['s', 'e', 'w']) }, 's', { type: 'brick', floors: 2 + Math.floor(Math.random() * 3) });
        const bl = this.block(i, j);
        const alley = { x0: bl.x0, x1: bl.x1, z: mid, w: AW, i, j };
        this.alleys.push(alley);
        dressAlley(g, sb, alley, Y + KERB);
        continue;
      }
      const c = bc(i, j);
      const centre = 1 - Math.min(Math.hypot(c.x - plaza.x, c.z - plaza.z) / 200, 1); // 1 downtown .. 0 edge
      const roll = Math.random();
      if (roll < 0.08) { this.carPark(i, j); continue; }
      if (centre > 0.55 && roll < 0.35) {
        // one tower on the block with a small forecourt
        const b = whole(i, j);
        const inset = 5;
        const r = { x0: b.x0 + inset, x1: b.x1 - inset, z0: b.z0 + inset, z1: b.z1 - inset, streets: b.streets };
        place(r, pickFront(r), { type: 'office', floors: 14 + Math.floor(Math.random() * 14), interior: Math.random() < 0.5 ? 'lobby' : null });
        continue;
      }
      if (roll < 0.55) {
        // two long buildings back to back
        const b = whole(i, j), mid = (b.z0 + b.z1) / 2;
        for (const [r, front] of [[{ ...b, z1: mid - 1, streets: new Set(['n', 'e', 'w']) }, 'n'], [{ ...b, z0: mid + 1, streets: new Set(['s', 'e', 'w']) }, 's']]) {
          place(r, front, this.styleFor(centre));
        }
        continue;
      }
      for (const r of quad(i, j)) place(r, pickFront(r), this.styleFor(centre));
    }

    // parked cars along the kerbs (out of the traffic lanes)
    const colors = [0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x1b1b1b, 0x3aa760, 0x7a4fb0, 0xe0a52b, 0x8a9096];
    for (let k = 0; k < 34; k++) {
      const alongX = Math.random() < 0.5;
      const lineIdx = Math.floor(Math.random() * 6), segIdx = Math.floor(Math.random() * 5);
      const side = Math.random() < 0.5 ? -1 : 1;
      const lines = alongX ? this.zs : this.xs, segs = alongX ? this.xs : this.zs;
      const t = segs[segIdx] + 14 + Math.random() * (70 - 28);
      const x = alongX ? t : lines[lineIdx] + side * PARK, z = alongX ? lines[lineIdx] + side * PARK : t;
      if ((alongX && lineIdx === 2 && x > this.policeStation.x - 15 && x < this.policeStation.x + 15)) continue;
      const car = carMesh(colors[k % colors.length]);
      car.position.set(x, Y, z);
      car.rotation.y = alongX ? Math.PI / 2 : 0;
      g.add(car);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(alongX ? 2.3 : 1, 0.9, alongX ? 1 : 2.3).setTranslation(x, Y + 0.9, z));
      if (Math.random() < 0.3) this.lootSpots.push(new THREE.Vector3(alongX ? x : x - side * 1.6, Y + 0.3, alongX ? z - side * 1.6 : z));
    }

    // promenade round the edge of the island
    for (let x = x0 + 10; x < x1; x += 22) for (const z of [isl.z0 + 6, isl.z1 - 6]) {
      if (Math.random() < 0.6) tree(g, sb, x, Y, z, 0.9);
      else lamp(g, sb, x, Y, z);
    }
    for (let z = z0; z < z1; z += 24) tree(g, sb, isl.x0 + 6, Y, z, 0.9);

    // ---- marina on the east waterfront ----
    const mx = isl.x1;
    this.berths = [];
    for (const pz of [-60, 0, 60]) {
      pier(g, sb, mx - 1, mx + 70, pz - 3, pz + 3);
      for (const side of [-1, 1]) for (const bx of [mx + 22, mx + 50]) {
        this.berths.push({ x: bx, z: pz + side * 7.5, heading: -Math.PI / 2 });
      }
    }
    for (let z = isl.z0 + 20; z < isl.z1 - 20; z += 26) if (Math.abs(z) > 80 && Math.abs(z - 115) > 12) tree(g, sb, mx - 10, Y, z, 0.9);
    for (const pz of [-30, 30]) {
      solidBox(g, sb, 3, 0.5, 0.7, mx - 8, Y, pz, benchM, { rotY: Math.PI / 2 });
      this.lootSpots.push(new THREE.Vector3(mx - 8, Y + 0.8, pz));
    }
    // boat dealer kiosk
    const dk = new THREE.Vector3(mx - 16, Y, 115);
    solidBox(g, sb, 10, 4, 8, dk.x, Y, dk.z, std({ color: 0xf2f2ee }));
    solidBox(g, sb, 11, 0.4, 9, dk.x, Y + 4, dk.z, std({ color: 0x1f6fa8 }), { collide: false });
    sign(g, 'BOAT SALES', dk.x + 5.1, Y + 3.2, dk.z, Math.PI / 2, { w: 8, h: 1.6, bg: '#1f6fa8', fg: '#ffffff', glow: true });
    this.dealerCounter = new THREE.Vector3(dk.x + 7, Y, dk.z);
    sign(g, 'MARINA', mx + 2, Y + 4, 0, Math.PI / 2, { w: 8, h: 1.6, bg: '#2c3e5e' });
    for (const pz of [-60, 0, 60]) for (const bx of [mx + 20, mx + 50]) lamp(g, sb, bx, Y, pz + 2.6);
  }

  styleFor(centre) {
    const r = Math.random();
    const interior = Math.random() < 0.3 ? ['shop', 'diner', 'office', 'shop'][Math.floor(Math.random() * 4)] : null;
    if (centre > 0.55) {
      if (r < 0.45) return { type: 'office', floors: 8 + Math.floor(Math.random() * 10), interior: interior && 'lobby' };
      if (r < 0.8) return { type: 'apartment', floors: 6 + Math.floor(Math.random() * 6) };
      return { type: 'brick', floors: 4 + Math.floor(Math.random() * 3), interior };
    }
    if (centre > 0.25) {
      if (r < 0.15) return { type: 'office', floors: 6 + Math.floor(Math.random() * 6) };
      if (r < 0.5) return { type: 'apartment', floors: 4 + Math.floor(Math.random() * 5) };
      return { type: 'brick', floors: 2 + Math.floor(Math.random() * 4), interior };
    }
    if (r < 0.2) return { type: 'apartment', floors: 3 + Math.floor(Math.random() * 3) };
    return { type: 'brick', floors: 1 + Math.floor(Math.random() * 4), interior };
  }

  carPark(i, j) {
    const g = this.group, sb = this.sb;
    const b = this.block(i, j);
    flat(g, b.x1 - b.x0 - 2, b.z1 - b.z0 - 2, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, std({ color: 0x46494d }), Y + KERB + 0.01);
    for (let k = 0; k < 10; k++) {
      if (Math.random() < 0.3) continue;
      const car = carMesh([0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x1b1b1b, 0x3aa760, 0xe0a52b][k % 6]);
      const x = b.x0 + 6 + (k % 5) * 10, z = (b.z0 + b.z1) / 2 + (k < 5 ? -9 : 9);
      car.position.set(x, Y + KERB, z);
      car.rotation.y = k < 5 ? 0 : Math.PI;
      g.add(car);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1, 0.9, 2.3).setTranslation(x, Y + KERB + 0.9, z));
      if (Math.random() < 0.4) this.lootSpots.push(new THREE.Vector3(x + 1.7, Y + KERB + 0.3, z));
    }
  }

  texs() {
    return {
      road: (len) => canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#3c3f43'; c.fillRect(0, 0, w, h); speckle(c, w, h, 700, 0.06);
        c.fillStyle = '#e8c547'; c.fillRect(w / 2 - 3, 0, 2, h); c.fillRect(w / 2 + 1, 0, 2, h);
        c.fillStyle = '#e8e8e2'; for (let y = 0; y < h; y += 64) { c.fillRect(w * 0.19, y, 2, 40); c.fillRect(w * 0.81 - 2, y, 2, 40); }
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, 3, h); c.fillRect(w - 3, 0, 3, h);
      }, [1, len / 16]),
      asphalt: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#3c3f43'; c.fillRect(0, 0, w, h); speckle(c, w, h, 300, 0.06); }),
      zebra: canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#3c3f43'; c.fillRect(0, 0, w, h); c.fillStyle = '#eeeeea'; for (let x = 4; x < w; x += 16) c.fillRect(x, 2, 9, h - 4); }),
      slabs: pave([54 / 4, 54 / 4]),
      kerb: std({ color: 0x9d9a94 }),
      plaza: canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#d8d0c0'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#bfb6a4'; c.lineWidth = 3; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
      }, [7, 7]),
      grass: canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#5f8f45'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 1200; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(40,80,30,0.3)' : 'rgba(150,190,90,0.25)'; c.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
      }, [8, 8]),
    };
  }
}
