import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y, addPier } from './world.js';
import { canvasTex, speckle, std, sign, lamp, solidBox, carMesh } from './buildkit.js';
import { islandSlab, flat } from './city.js';
import { cityBuilding, FLOOR, GROUND } from './architecture.js';
import { graffitiTex } from './underworld.js';

// The Hollows: the rough end of the map, east of Saltmarsh Key over a little bridge. Cracked
// streets, boarded-up walk-ups, two grim project towers, a liquor store, a fenced basketball
// court, a burned-out empty lot — and two crews who don't like strangers.

const Y = LAND_Y;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Hood {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'hood');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.parkedSpots = [];
    this.xs = [-550, -450, -350, -250];
    this.zs = [-1700, -1600, -1500, -1400, -1300];
    this.build();
  }

  block(i, j) { return { x0: this.xs[i] + 5, x1: this.xs[i + 1] - 5, z0: this.zs[j] + 5, z1: this.zs[j + 1] - 5 }; }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl;
    const dirt = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#6b6450'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const r = Math.random();
        c.fillStyle = r < 0.4 ? `rgba(90,80,55,${0.3 + Math.random() * 0.3})` : r < 0.7 ? `rgba(110,120,70,${0.2 + Math.random() * 0.2})` : `rgba(40,38,30,${0.2 + Math.random() * 0.2})`;
        c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
    }, [(isl.x1 - isl.x0) / 10, (isl.z1 - isl.z0) / 10]);
    islandSlab(g, sb, isl, dirt, 0x6a6458);

    // ---- cracked streets ----
    const road = (len) => canvasTex(64, 256, (c, w, h) => {
      c.fillStyle = '#3f4144'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, 0.09);
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1;
      for (let i = 0; i < 14; i++) { c.beginPath(); let x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 16; y += Math.random() * 14; c.lineTo(x, y); } c.stroke(); }
      c.fillStyle = 'rgba(200,170,60,0.5)'; for (let y = 0; y < h; y += 64) if (Math.random() < 0.7) c.fillRect(w / 2 - 1, y + 10, 2, 30);
      for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(20,20,20,0.6)'; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 6, 3 + Math.random() * 4, 0, 0, 7); c.fill(); } // potholes
    }, [1, len / 20]);
    const zLen = this.zs.at(-1) - this.zs[0] + 10, xLen = this.xs.at(-1) - this.xs[0] + 10;
    for (const x of this.xs) flat(g, 10, zLen, x, (this.zs[0] + this.zs.at(-1)) / 2, std({ map: road(zLen) }), Y + 0.03);
    for (const z of this.zs) flat(g, 10, xLen, (this.xs[0] + this.xs.at(-1)) / 2, z, std({ map: road(xLen) }), Y + 0.035, Math.PI / 2);

    // ---- the bridge over from Saltmarsh (on the z = -1500 street) ----
    const sx0 = -695, sx1 = isl.x0 + 2;
    flat(g, sx1 - sx0, 10, (sx0 + sx1) / 2, -1500, std({ color: 0x45474b }), Y + 0.04);
    const bx0 = -642, bx1 = isl.x0 + 1;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, 1.2, 12), std({ color: 0x8e8a82 }));
    deck.position.set((bx0 + bx1) / 2, Y - 0.6, -1500);
    deck.receiveShadow = deck.castShadow = true;
    g.add(deck);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((bx1 - bx0) / 2, 0.6, 6).setTranslation(deck.position.x, Y - 0.6, -1500));
    addPier(bx0, bx1, -1506, -1494);
    for (const s of [-1, 1]) solidBox(g, sb, bx1 - bx0, 1, 0.3, deck.position.x, Y, -1500 + s * 5.85, std({ color: 0x8e8a82 }));
    for (const s of [-1, 1]) for (let x = bx0 + 4; x < bx1; x += 12) { const p = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2.5), std({ color: 0x7a766e })); p.position.set(x, Y - 5, -1500 + s * 4); g.add(p); }
    sign(g, 'THE HOLLOWS', isl.x0 + 8, Y + 4.5, -1507, Math.PI / 2, { w: 7, h: 1.5, bg: '#2a2622', fg: '#e8d8b0' });
    this.entrance = new THREE.Vector3(isl.x0 + 10, Y, -1500);

    // ---- blocks ----
    const drab = { type: 'brick' };
    const place = (r, front, opts) => {
      const ew = front === 'e' || front === 'w';
      const lot = { cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, y0: Y, w: ew ? r.z1 - r.z0 : r.x1 - r.x0, d: ew ? r.x1 - r.x0 : r.z1 - r.z0, front, streets: r.streets };
      const out = cityBuilding(g, sb, lot, opts);
      for (const p of out.loot) this.lootSpots.push(p);
      this.boardUp(r, front, opts.floors);
      return out;
    };
    const WK = 4;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
      const b = this.block(i, j);
      const key = `${i},${j}`;
      const inner = { x0: b.x0 + WK, x1: b.x1 - WK, z0: b.z0 + WK, z1: b.z1 - WK, streets: new Set(['n', 's', 'e', 'w']) };
      if (key === '0,2') { this.court(b); continue; }
      if (key === '2,3') { this.emptyLot(b); continue; }
      if (key === '2,0') { // the projects: two slab towers on a bare plaza
        for (const dx of [-20, 20]) place({ x0: (b.x0 + b.x1) / 2 + dx - 10, x1: (b.x0 + b.x1) / 2 + dx + 10, z0: inner.z0 + 6, z1: inner.z1 - 6, streets: inner.streets }, 'n', { type: 'apartment', floors: 8 + Math.floor(Math.random() * 3) });
        continue;
      }
      if (key === '1,1') { // liquor store and laundromat
        const mid = (inner.x0 + inner.x1) / 2;
        place({ ...inner, x1: mid - 1, z1: (inner.z0 + inner.z1) / 2, streets: new Set(['n', 'w']) }, 'n', { type: 'brick', floors: 1, interior: 'shop', name: 'LIQUOR · LOTTO', signBg: '#1b1b1b', signFg: '#ff5a3a' });
        place({ ...inner, x0: mid + 1, z1: (inner.z0 + inner.z1) / 2, streets: new Set(['n', 'e']) }, 'n', { type: 'brick', floors: 2, name: 'COIN LAUNDRY', signBg: '#1f3b63' });
        place({ ...inner, z0: (inner.z0 + inner.z1) / 2 + 2, streets: new Set(['s', 'e', 'w']) }, 's', { ...drab, floors: 3 });
        continue;
      }
      // row houses back to back
      const mid = (inner.z0 + inner.z1) / 2;
      place({ ...inner, z1: mid - 1, streets: new Set(['n', 'e', 'w']) }, 'n', { ...drab, floors: 1 + Math.floor(Math.random() * 3) });
      place({ ...inner, z0: mid + 1, streets: new Set(['s', 'e', 'w']) }, 's', { type: Math.random() < 0.3 ? 'apartment' : 'brick', floors: 2 + Math.floor(Math.random() * 3) });
    }

    // ---- street junk: dumpsters, bags, old couches, tyres, burned-out cars, broken lights ----
    const binM = std({ color: 0x2f4a32, roughness: 0.7, metalness: 0.3 });
    const bagM = std({ color: 0x141414, roughness: 0.3 });
    const couchM = [std({ color: 0x6a4a3a }), std({ color: 0x4a5a6a }), std({ color: 0x7a6a3a })];
    const tyreM = std({ color: 0x151515 });
    for (const x of this.xs) for (const z of this.zs) {
      const ox = x + (Math.random() < 0.5 ? -8 : 8), oz = z + (Math.random() < 0.5 ? -8 : 8);
      if (Math.random() < 0.5) { solidBox(g, sb, 1.9, 1.25, 1.1, ox, Y, oz, binM); }
      for (let k = 0; k < 4; k++) {
        const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.15, 1), bagM);
        bag.scale.y = 0.75; bag.position.set(ox + (Math.random() - 0.5) * 4, Y + 0.25, oz + (Math.random() - 0.5) * 4);
        g.add(bag);
      }
      if (Math.random() < 0.3) { // a couch someone dumped
        const m = pick(couchM);
        const cx = ox + 3, cz = oz;
        solidBox(g, sb, 2, 0.5, 0.9, cx, Y, cz, m);
        solidBox(g, sb, 2, 0.6, 0.25, cx, Y + 0.5, cz - 0.35, m, { collide: false });
        this.lootSpots.push(new THREE.Vector3(cx, Y + 0.8, cz));
      }
      if (Math.random() < 0.4) for (let k = 0; k < 3; k++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.15, 6, 12), tyreM);
        t.rotation.x = Math.PI / 2; t.position.set(ox - 3, Y + 0.15 + k * 0.3, oz + 2);
        g.add(t);
      }
      if (Math.random() < 0.55) { // lamp post, maybe with the bulb out
        lamp(g, sb, x + 6.5, Y, z + 6.5);
      }
    }
    for (let k = 0; k < 5; k++) this.burnedCar(this.xs[Math.floor(Math.random() * 4)] + (Math.random() < 0.5 ? -7 : 7), this.zs[Math.floor(Math.random() * 4)] + 20 + Math.random() * 60, Math.random() < 0.5 ? 0 : Math.PI);
    // parked beaters
    for (let k = 0; k < 6; k++) {
      const z = this.zs[1 + Math.floor(Math.random() * 3)];
      this.parkedSpots.push({ x: this.xs[0] + 20 + Math.random() * 260, z: z + 7, heading: Math.PI / 2, color: pick([0x6a5a4a, 0x3a4a5a, 0x7a2a2a, 0x2a2a2a, 0x8a8a70]) });
    }
  }

  // plywood over some ground and first-floor windows, and graffiti on the walls
  boardUp(r, front, floors) {
    const g = this.group;
    const ply = std({ color: 0xa88a5a, roughness: 0.95 });
    const along = front === 'n' || front === 's';
    const faceZ = front === 'n' ? r.z0 - 0.08 : r.z1 + 0.08, faceX = front === 'w' ? r.x0 - 0.08 : r.x1 + 0.08;
    const span = along ? [r.x0 + 2, r.x1 - 2] : [r.z0 + 2, r.z1 - 2];
    for (let k = 0; k < 6; k++) {
      const a = span[0] + Math.random() * (span[1] - span[0]);
      const y = Y + (Math.random() < 0.5 ? 1.6 : GROUND + FLOOR * Math.floor(Math.random() * Math.max(1, floors)) + 1.6);
      const b = new THREE.Mesh(new THREE.BoxGeometry(along ? 1.8 : 0.08, 1.6, along ? 0.08 : 1.8), ply);
      b.position.set(along ? a : faceX, y, along ? faceZ : a);
      b.rotation[along ? 'z' : 'x'] = (Math.random() - 0.5) * 0.1;
      g.add(b);
    }
    for (let k = 0; k < 2; k++) {
      const a = span[0] + Math.random() * (span[1] - span[0]);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshStandardMaterial({ map: graffitiTex(), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(along ? a : faceX + (front === 'w' ? -0.05 : 0.05), Y + 1.5, along ? faceZ + (front === 'n' ? -0.05 : 0.05) : a);
      m.rotation.y = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[front];
      g.add(m);
    }
  }

  burnedCar(x, z, yaw) {
    const car = carMesh(0x2a2622);
    car.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); } });
    car.position.set(x, Y - 0.25, z);
    car.rotation.set(0.04, yaw, 0.03);
    this.group.add(car);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1, 0.8, 2.3).setTranslation(x, Y + 0.6, z).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))));
  }

  // chain-link fence along a run (with collider)
  fence(ax, az, bx, bz, h = 3) {
    const g = this.group;
    const len = Math.hypot(bx - ax, bz - az);
    const t = canvasTex(64, 64, (c, w, hh) => {
      c.clearRect(0, 0, w, hh); c.strokeStyle = 'rgba(170,175,180,0.9)'; c.lineWidth = 2;
      for (let i = -64; i < 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.stroke(); c.beginPath(); c.moveTo(i + 64, 0); c.lineTo(i, 64); c.stroke(); }
    }, [len / 2, h / 2]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 }));
    m.position.set((ax + bx) / 2, Y + h / 2, (az + bz) / 2);
    m.rotation.y = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    g.add(m);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(len / 2, h / 2, 0.08).setTranslation(m.position.x, Y + h / 2, m.position.z).setRotation(q));
  }

  // Eastside Kings' turf: a fenced basketball court
  court(b) {
    const g = this.group;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const ct = canvasTex(256, 140, (c, w, h) => {
      c.fillStyle = '#5a6a7a'; c.fillRect(0, 0, w, h); speckle(c, w, h, 800, 0.08);
      c.strokeStyle = '#e8e8e2'; c.lineWidth = 2; c.strokeRect(6, 6, w - 12, h - 12);
      c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w / 2, h - 6); c.stroke();
      c.beginPath(); c.arc(w / 2, h / 2, 18, 0, 7); c.stroke();
      for (const x of [6, w - 6]) { c.beginPath(); c.arc(x, h / 2, 50, x < w / 2 ? -1.4 : Math.PI - 1.74, x < w / 2 ? 1.4 : Math.PI + 1.74); c.stroke(); }
    });
    flat(g, 56, 30, cx, cz, std({ map: ct }), Y + 0.04);
    const pole = std({ color: 0x777777, metalness: 0.6 });
    for (const s of [-1, 1]) {
      solidBox(g, this.sb, 0.25, 3.6, 0.25, cx + s * 27.5, Y, cz, pole);
      solidBox(g, this.sb, 0.1, 1.1, 1.8, cx + s * 27, Y + 3.2, cz, std({ color: 0xeeeeee }), { collide: false });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16), std({ color: 0xff5a1a }));
      rim.rotation.x = Math.PI / 2; rim.position.set(cx + s * 26.6, Y + 3.05, cz);
      g.add(rim);
    }
    // fence round three sides (open toward the street to the north)
    const x0 = cx - 31, x1 = cx + 31, z0 = cz - 18, z1 = cz + 18;
    this.fence(x0, z1, x1, z1); this.fence(x0, z0 + 6, x0, z1); this.fence(x1, z0 + 6, x1, z1);
    // benches and a crew car with its doors open
    solidBox(g, this.sb, 3, 0.5, 0.7, cx - 12, Y, z0 - 2, std({ color: 0x6b4a2f }));
    const car = carMesh(0x8a1c1c);
    car.position.set(cx + 18, Y, z0 - 6); car.rotation.y = Math.PI / 2;
    g.add(car);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(2.3, 0.9, 1).setTranslation(cx + 18, Y + 0.9, z0 - 6));
    this.lootSpots.push(new THREE.Vector3(cx - 12, Y + 0.8, z0 - 2), new THREE.Vector3(cx + 14, Y + 0.3, z0 - 6));
    this.kingsPost = new THREE.Vector3(cx, Y, z0 - 4);
  }

  // Hollow Boys' turf: a burned-out empty lot behind a sagging fence
  emptyLot(b) {
    const g = this.group;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    flat(g, 80, 80, cx, cz, std({ color: 0x4f4a3c, roughness: 1 }), Y + 0.04);
    this.fence(b.x0 + 2, b.z0 + 2, b.x1 - 2, b.z0 + 2);
    this.fence(b.x1 - 2, b.z0 + 2, b.x1 - 2, b.z1 - 2);
    this.fence(b.x0 + 2, b.z1 - 2, b.x0 + 2, b.z0 + 2);
    this.burnedCar(cx - 10, cz + 5, 0.7);
    this.burnedCar(cx + 15, cz - 12, 2.2);
    // a burn barrel and some crates to sit on
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12), std({ color: 0x3a2a20, metalness: 0.4 }));
    barrel.position.set(cx, Y + 0.45, cz + 20);
    g.add(barrel);
    const fire = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), std({ color: 0x2a1a10, emissive: 0xff6a1a, emissiveIntensity: 1.2 }));
    fire.rotation.x = -Math.PI / 2; fire.position.set(cx, Y + 0.9, cz + 20);
    g.add(fire);
    for (const [dx, dz] of [[-2.5, 1], [2.5, 1.5], [0, 3]]) solidBox(g, this.sb, 1, 0.8, 1, cx + dx, Y, cz + 20 + dz, std({ color: 0x8a6440 }));
    this.lootSpots.push(new THREE.Vector3(cx - 2.5, Y + 1.1, cz + 21), new THREE.Vector3(cx + 5, Y + 0.3, cz + 25));
    this.hollowPost = new THREE.Vector3(cx, Y, cz + 22);
    sign(g, 'NO TRESPASSING', cx, Y + 2, b.z0 + 1.9, Math.PI, { w: 4, h: 0.8, bg: '#b3261e', fg: '#ffffff' });
  }
}
