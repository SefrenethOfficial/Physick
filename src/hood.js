import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y } from './world.js';
import { canvasTex, speckle, std, sign, lamp, solidBox, carMesh, tree } from './buildkit.js';
import { islandSlab, flat } from './city.js';
import { cityBuilding, FLOOR, GROUND } from './architecture.js';
import { graffitiTex } from './underworld.js';

// The Hollows: Verian's north end, built right onto the top of the city (the city's avenues just
// carry on up into it), with a causeway across to the tip of Pelican Point. It's still the rough
// part of town: cracked streets, walk-ups with fire escapes and plywood over the windows, the
// projects, a liquor store, the Eastside Kings' basketball court and the Hollow Boys' burned-out
// lot. But it's alive: murals on every other wall, a community garden, a taco truck under string
// lights, a boxing gym, a tattoo parlour, a car wash, and a welcome arch from downtown.

const Y = LAND_Y;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Hood {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'hood');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.parkedSpots = [];
    this.interiors = [];
    this.lights = []; // string lights (they glow at night)
    // the city's avenues run straight on up (x), and the cross streets carry on the city's spacing (z)
    this.xs = [-1090, -1020, -950, -880, -810, -740, -670];
    this.zs = [-595, -525, -455, -385, -315, -245];
    this.build();
  }

  block(i, j) { return { x0: this.xs[i] + 5, x1: this.xs[i + 1] - 5, z0: this.zs[j] + 5, z1: this.zs[j + 1] - 5 }; }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl;
    const ground = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#7a756a'; c.fillRect(0, 0, w, h);
      speckle(c, w, h, 2400, 0.1);
      c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 2;
      for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
      for (let i = 0; i < 40; i++) { c.strokeStyle = 'rgba(30,28,24,0.35)'; c.beginPath(); let x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; c.lineTo(x, y); } c.stroke(); } // cracks
    }, [(isl.x1 - isl.x0) / 16, (isl.z1 - isl.z0) / 16]);
    islandSlab(g, sb, isl, ground, 0x6a6458);

    // ---- cracked streets ----
    const road = (len) => canvasTex(64, 256, (c, w, h) => {
      c.fillStyle = '#3f4144'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, 0.09);
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1;
      for (let i = 0; i < 14; i++) { c.beginPath(); let x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 16; y += Math.random() * 14; c.lineTo(x, y); } c.stroke(); }
      c.fillStyle = 'rgba(200,170,60,0.55)'; for (let y = 0; y < h; y += 64) if (Math.random() < 0.8) c.fillRect(w / 2 - 1, y + 10, 2, 30);
      for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(20,20,20,0.6)'; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 6, 3 + Math.random() * 4, 0, 0, 7); c.fill(); } // potholes
    }, [1, len / 20]);
    // the avenues run from the north shore right down into the city (to its first cross street)
    const zTop = isl.z0 + 2, zCity = -175, zLen = zCity - zTop;
    for (const x of this.xs) flat(g, 10, zLen, x, (zTop + zCity) / 2, std({ map: road(zLen) }), Y + 0.03);
    const xLen = this.xs.at(-1) - this.xs[0] + 10;
    for (const z of this.zs) flat(g, 10, xLen, (this.xs[0] + this.xs.at(-1)) / 2, z, std({ map: road(xLen) }), Y + 0.035, Math.PI / 2);
    const kerbM = std({ color: 0x8a867c, roughness: 0.9 });
    for (let i = 0; i < this.xs.length - 1; i++) for (let j = 0; j < this.zs.length - 1; j++) { const b = this.block(i, j); solidBox(g, sb, b.x1 - b.x0, 0.15, b.z1 - b.z0, (b.x0 + b.x1) / 2, Y, (b.z0 + b.z1) / 2, kerbM, { collide: false }); }

    // ---- the welcome arch where downtown turns into the Hollows (on 4th avenue) ----
    const ax = -880, az = isl.z1 - 6;
    const archM = std({ color: 0x3a3430, roughness: 0.6, metalness: 0.4 });
    for (const s of [-1, 1]) solidBox(g, sb, 0.6, 7.5, 0.6, ax + s * 6.5, Y, az, archM);
    solidBox(g, sb, 14, 1.4, 0.5, ax, Y + 7.5, az, archM, { collide: false });
    sign(g, 'WELCOME TO THE HOLLOWS', ax, Y + 8.2, az + 0.3, 0, { w: 12.5, h: 1.1, bg: '#2a2622', fg: '#ffd166', glow: true });
    sign(g, 'WELCOME TO THE HOLLOWS', ax, Y + 8.2, az - 0.3, Math.PI, { w: 12.5, h: 1.1, bg: '#2a2622', fg: '#ffd166', glow: true });
    this.entrance = V3(ax, Y, az - 10);

    // ---- the causeway across to Pelican Point (7th avenue runs straight on to it) ----
    const cx = this.xs.at(-1), cz0 = -702, cz1 = isl.z0 + 2;
    const cw = new THREE.Mesh(new THREE.BoxGeometry(16, 2, cz1 - cz0), std({ color: 0x8a8680 }));
    cw.position.set(cx, Y - 1, (cz0 + cz1) / 2); cw.receiveShadow = true; g.add(cw);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(8, 1, (cz1 - cz0) / 2).setTranslation(cx, Y - 1, (cz0 + cz1) / 2));
    this.causeway = { x0: cx - 8, x1: cx + 8, z0: cz0, z1: cz1 };
    flat(g, 10, cz1 - cz0 + 2, cx, (cz0 + cz1) / 2, std({ map: road(cz1 - cz0) }), Y + 0.03);
    for (const s of [-1, 1]) solidBox(g, sb, 0.3, 0.9, cz1 - cz0, cx + s * 7.7, Y, (cz0 + cz1) / 2, std({ color: 0xcfcac0 }));
    sign(g, 'PELICAN POINT ➜', cx + 9, Y + 3, isl.z0 + 8, 0, { w: 5.5, h: 1, bg: '#1f5a7a', fg: '#ffffff', post: Y });

    // ---- blocks ----
    const drab = { type: 'brick' };
    const place = (r, front, opts, board = true) => {
      const ew = front === 'e' || front === 'w';
      const lot = { cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, y0: Y + 0.15, w: ew ? r.z1 - r.z0 : r.x1 - r.x0, d: ew ? r.x1 - r.x0 : r.z1 - r.z0, front, streets: r.streets };
      const out = cityBuilding(g, sb, lot, opts);
      for (const p of out.loot) this.lootSpots.push(p);
      if (opts.interior) this.interiors.push({ ...out, kind: opts.interior, name: opts.name, island: 'hood' });
      if (board) this.boardUp(r, front, opts.floors || 2);
      if ((opts.type || 'brick') === 'brick' && (opts.floors || 2) >= 2 && Math.random() < 0.7) this.fireEscape(r, front, opts.floors || 2);
      return out;
    };
    const WK = 4;
    const special = {
      '1,1': (b, inner) => { // the liquor store, the coin laundry and a corner bodega
        const mid = (inner.x0 + inner.x1) / 2, zm = (inner.z0 + inner.z1) / 2;
        place({ ...inner, x1: mid - 1, z1: zm, streets: new Set(['n', 'w']) }, 'n', { type: 'brick', floors: 1, interior: 'shop', name: 'LIQUOR · LOTTO', signBg: '#1b1b1b', signFg: '#ff5a3a' });
        place({ ...inner, x0: mid + 1, z1: zm, streets: new Set(['n', 'e']) }, 'n', { type: 'brick', floors: 2, name: 'COIN LAUNDRY', signBg: '#1f3b63' });
        place({ ...inner, z0: zm + 2, streets: new Set(['s', 'e', 'w']) }, 's', { type: 'brick', floors: 3, interior: 'shop', name: 'BODEGA 24/7', signBg: '#e8c547', signFg: '#15161a' });
      },
      '0,3': (b) => this.court(b), // Eastside Kings
      '4,1': (b) => this.emptyLot(b), // Hollow Boys
      '2,0': (b, inner) => { for (const dx of [-14, 14]) place({ x0: (b.x0 + b.x1) / 2 + dx - 9, x1: (b.x0 + b.x1) / 2 + dx + 9, z0: inner.z0 + 6, z1: inner.z1 - 6, streets: inner.streets }, 's', { type: 'apartment', floors: 9 + Math.floor(Math.random() * 3) }); this.plaza(b); },
      '3,0': (b, inner) => { for (const dx of [-14, 14]) place({ x0: (b.x0 + b.x1) / 2 + dx - 9, x1: (b.x0 + b.x1) / 2 + dx + 9, z0: inner.z0 + 6, z1: inner.z1 - 6, streets: inner.streets }, 's', { type: 'apartment', floors: 8 + Math.floor(Math.random() * 3) }); },
      '2,2': (b) => this.garden(b),
      '4,3': (b) => this.tacoLot(b),
      '1,4': (b, inner) => {
        const mid = (inner.x0 + inner.x1) / 2;
        place({ ...inner, x1: mid - 1, streets: new Set(['n', 's', 'w']) }, 's', { type: 'brick', floors: 2, name: "TITO'S BOXING GYM", signBg: '#8a1a14', signFg: '#ffffff' }, false);
        place({ ...inner, x0: mid + 1, streets: new Set(['n', 's', 'e']) }, 's', { type: 'brick', floors: 2, name: 'INK & IRON TATTOO', signBg: '#15161a', signFg: '#ff4ad8' }, false);
      },
      '3,4': (b) => this.carWash(b),
      '5,0': (b) => this.parkingLot(b), // (open: the run-up to the Pelican plunge jump goes through it)
    };
    for (let i = 0; i < this.xs.length - 1; i++) for (let j = 0; j < this.zs.length - 1; j++) {
      const b = this.block(i, j);
      const key = `${i},${j}`;
      const inner = { x0: b.x0 + WK, x1: b.x1 - WK, z0: b.z0 + WK, z1: b.z1 - WK, streets: new Set(['n', 's', 'e', 'w']) };
      if (special[key]) { special[key](b, inner); continue; }
      // walk-ups back to back, with a gap down the middle for the bins
      const mid = (inner.z0 + inner.z1) / 2;
      place({ ...inner, z1: mid - 1.5, streets: new Set(['n', 'e', 'w']) }, 'n', { ...drab, floors: 2 + Math.floor(Math.random() * 3) });
      if (key === '1,2') this.flat = { door: V3((inner.x0 + inner.x1) / 2, Y, inner.z0 - 1.6), yaw: 0 }; // a walk-up for sale (yaw: facing out of the door)
      place({ ...inner, z0: mid + 1.5, streets: new Set(['s', 'e', 'w']) }, 's', { type: Math.random() < 0.3 ? 'apartment' : 'brick', floors: 2 + Math.floor(Math.random() * 4) });
      // a mural on the end wall of some rows
      if (Math.random() < 0.55) this.mural(Math.random() < 0.5 ? inner.x0 - 0.1 : inner.x1 + 0.1, (inner.z0 + mid) / 2, Math.random() < 0.5);
    }

    // ---- street life: bins, bags, dumped couches, tyres, burned-out cars, lamps, string lights ----
    const binM = std({ color: 0x2f4a32, roughness: 0.7, metalness: 0.3 });
    const bagM = std({ color: 0x141414, roughness: 0.3 });
    const couchM = [std({ color: 0x6a4a3a }), std({ color: 0x4a5a6a }), std({ color: 0x7a6a3a })];
    const tyreM = std({ color: 0x151515 });
    for (const x of this.xs) for (const z of this.zs) {
      const ox = x + (Math.random() < 0.5 ? -8 : 8), oz = z + (Math.random() < 0.5 ? -8 : 8);
      if (Math.random() < 0.5) solidBox(g, sb, 1.9, 1.25, 1.1, ox, Y, oz, binM);
      for (let k = 0; k < 3; k++) {
        const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.15, 1), bagM);
        bag.scale.y = 0.75; bag.position.set(ox + (Math.random() - 0.5) * 4, Y + 0.25, oz + (Math.random() - 0.5) * 4);
        g.add(bag);
      }
      if (Math.random() < 0.2) {
        const m = pick(couchM), cx2 = ox + 3, cz2 = oz;
        solidBox(g, sb, 2, 0.5, 0.9, cx2, Y, cz2, m);
        solidBox(g, sb, 2, 0.6, 0.25, cx2, Y + 0.5, cz2 - 0.35, m, { collide: false });
        this.lootSpots.push(V3(cx2, Y + 0.8, cz2));
      }
      if (Math.random() < 0.3) for (let k = 0; k < 3; k++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.15, 6, 12), tyreM);
        t.rotation.x = Math.PI / 2; t.position.set(ox - 3, Y + 0.15 + k * 0.3, oz + 2);
        g.add(t);
      }
      if (Math.random() < 0.7) lamp(g, sb, x + 6.5, Y, z + 6.5);
    }
    // string lights zig-zagging over a couple of streets (the block party street, and the taco lot's)
    this.stringLights(-950, -455, -880, -455);
    this.stringLights(-810, -385, -740, -385);
    this.stringLights(-1020, -315, -950, -315);
    for (let k = 0; k < 4; k++) this.burnedCar(this.xs[1 + Math.floor(Math.random() * 5)] + (Math.random() < 0.5 ? -7 : 7), this.zs[Math.floor(Math.random() * 5)] + 20 + Math.random() * 30, Math.random() < 0.5 ? 0 : Math.PI);
    // street trees on the avenues near downtown (it gets nicer the closer you get)
    for (const x of this.xs) for (let z = -300; z < -215; z += 18) if (Math.random() < 0.6) tree(g, sb, x + (Math.random() < 0.5 ? -7.5 : 7.5), Y, z, 0.8);
    // parked beaters along the cross streets
    for (let k = 0; k < 9; k++) {
      const z = this.zs[1 + Math.floor(Math.random() * 4)];
      const x = this.xs[0] + 20 + Math.random() * (this.xs.at(-1) - this.xs[0] - 40);
      if (this.xs.some((xx) => Math.abs(xx - x) < 12)) continue;
      this.parkedSpots.push({ x, z: z + 3.6, heading: Math.PI / 2, color: pick([0x6a5a4a, 0x3a4a5a, 0x7a2a2a, 0x2a2a2a, 0x8a8a70, 0x4a6a3a]) });
    }
  }

  // plywood over some ground and first-floor windows, and graffiti on the walls
  boardUp(r, front, floors) {
    const g = this.group;
    const ply = std({ color: 0xa88a5a, roughness: 0.95 });
    const along = front === 'n' || front === 's';
    const faceZ = front === 'n' ? r.z0 - 0.08 : r.z1 + 0.08, faceX = front === 'w' ? r.x0 - 0.08 : r.x1 + 0.08;
    const span = along ? [r.x0 + 2, r.x1 - 2] : [r.z0 + 2, r.z1 - 2];
    for (let k = 0; k < 4; k++) {
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

  // black iron fire escapes zig-zagging down a brick front
  fireEscape(r, front, floors) {
    const g = this.group, iron = std({ color: 0x24262a, metalness: 0.6, roughness: 0.5 });
    const along = front === 'n' || front === 's';
    const s = front === 'n' || front === 'w' ? -1 : 1;
    const face = along ? (front === 'n' ? r.z0 : r.z1) : (front === 'w' ? r.x0 : r.x1);
    const at = along ? r.x0 + 3 + Math.random() * (r.x1 - r.x0 - 9) : r.z0 + 3 + Math.random() * (r.z1 - r.z0 - 9);
    for (let f = 1; f < floors; f++) {
      const y = Y + 0.15 + GROUND + FLOOR * (f - 1) + 0.1;
      const plat = new THREE.Mesh(new THREE.BoxGeometry(along ? 4 : 1.2, 0.08, along ? 1.2 : 4), iron);
      plat.position.set(along ? at + 2 : face + s * 0.65, y, along ? face + s * 0.65 : at + 2); g.add(plat);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(along ? 4 : 0.05, 0.9, along ? 0.05 : 4), iron);
      rail.position.set(along ? at + 2 : face + s * 1.25, y + 0.45, along ? face + s * 1.25 : at + 2); g.add(rail);
      const ladder = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.5 : 0.05, FLOOR * 1.1, along ? 0.05 : 0.5), iron);
      ladder.position.set(along ? at + (f % 2 ? 3.5 : 0.5) : face + s * 1.1, y - FLOOR / 2, along ? face + s * 1.1 : at + (f % 2 ? 3.5 : 0.5));
      ladder.rotation[along ? 'z' : 'x'] = (f % 2 ? 1 : -1) * 0.5; g.add(ladder);
    }
  }

  // a big painted mural down the end wall of a row
  mural(x, z, flip) {
    const palettes = [['#ff5a3a', '#ffd166', '#1f5fbf'], ['#7be08a', '#ff4ad8', '#15161a'], ['#e8c547', '#2a8a5a', '#c23b2a'], ['#9ec5ff', '#ff8a6a', '#2c3e5e']];
    const p = pick(palettes), words = ['HOLLOWS', 'STAY UP', 'R.I.P. WREN', 'NORTH SIDE', 'LOVE THY BLOCK', 'DREAM BIG', 'VERIAN'];
    const t = canvasTex(256, 128, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, p[0]); gr.addColorStop(1, p[1]); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 7; k++) { c.fillStyle = `${p[(k % 3)]}aa`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 0, 7); c.fill(); }
      c.fillStyle = p[2]; c.font = 'bold 34px Impact, Arial'; c.textAlign = 'center'; c.fillText(pick(words), w / 2, h / 2 + 12);
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.strokeText(pick(words), w / 2, h / 2 + 12);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x + (flip ? -0.05 : 0.05), Y + 3.6, z);
    m.rotation.y = flip ? -Math.PI / 2 : Math.PI / 2;
    this.group.add(m);
  }

  // bulbs strung back and forth across a street, between two junctions
  stringLights(x0, z0, x1, z1) {
    const g = this.group, mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 10);
    const wireM = new THREE.LineBasicMaterial({ color: 0x222222 });
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const a = V3(x0 + (x1 - x0) * t0, Y + 6, z0 + (z1 - z0) * t0 + 5.5), b = V3(x0 + (x1 - x0) * t1, Y + 6, z0 + (z1 - z0) * t1 - 5.5);
      if (k % 2) { a.z -= 11; b.z += 11; }
      const pts = [];
      for (let s = 0; s <= 8; s++) { const p = a.clone().lerp(b, s / 8); p.y -= Math.sin((s / 8) * Math.PI) * 0.9; pts.push(p); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
      for (const p of pts.slice(1, -1)) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), mat); bulb.position.copy(p).y -= 0.12; bulb.userData.noMerge = true; g.add(bulb); }
    }
    for (const x of [x0, x1]) for (const s of [-1, 1]) solidBox(g, this.sb, 0.18, 6.2, 0.18, x + 6.5 * (x === x0 ? 1 : -1), Y, z0 + s * 5.5, std({ color: 0x3a3c40, metalness: 0.5 }));
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

  // Eastside Kings' turf: a fenced basketball court with a mural down one side
  court(b) {
    const g = this.group;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const ct = canvasTex(256, 140, (c, w, h) => {
      c.fillStyle = '#3a5a8a'; c.fillRect(0, 0, w, h); c.fillStyle = '#c23b2a'; c.fillRect(w * 0.3, 6, w * 0.4, h - 12); speckle(c, w, h, 800, 0.08);
      c.strokeStyle = '#e8e8e2'; c.lineWidth = 2; c.strokeRect(6, 6, w - 12, h - 12);
      c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w / 2, h - 6); c.stroke();
      c.beginPath(); c.arc(w / 2, h / 2, 18, 0, 7); c.stroke();
      for (const x of [6, w - 6]) { c.beginPath(); c.arc(x, h / 2, 50, x < w / 2 ? -1.4 : Math.PI - 1.74, x < w / 2 ? 1.4 : Math.PI + 1.74); c.stroke(); }
      c.fillStyle = '#ffd166'; c.font = 'bold 18px Impact'; c.textAlign = 'center'; c.fillText('EASTSIDE', w / 2, h / 2 - 26);
    });
    flat(g, 46, 26, cx, cz, std({ map: ct }), Y + 0.17);
    const pole = std({ color: 0x777777, metalness: 0.6 });
    for (const s of [-1, 1]) {
      solidBox(g, this.sb, 0.25, 3.6, 0.25, cx + s * 23.5, Y, cz, pole);
      solidBox(g, this.sb, 0.1, 1.1, 1.8, cx + s * 23, Y + 3.2, cz, std({ color: 0xeeeeee }), { collide: false });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16), std({ color: 0xff5a1a }));
      rim.rotation.x = Math.PI / 2; rim.position.set(cx + s * 22.6, Y + 3.05, cz);
      g.add(rim);
    }
    // fence round three sides (open toward the street to the north)
    const x0 = cx - 26, x1 = cx + 26, z0 = cz - 16, z1 = cz + 16;
    this.fence(x0, z1, x1, z1); this.fence(x0, z0 + 6, x0, z1); this.fence(x1, z0 + 6, x1, z1);
    this.mural(x0 - 0.3, cz + 4, false);
    // benches and a crew car with its doors open
    solidBox(g, this.sb, 3, 0.5, 0.7, cx - 12, Y, z0 - 2, std({ color: 0x6b4a2f }));
    const car = carMesh(0x8a1c1c);
    car.position.set(cx + 16, Y, z0 - 6); car.rotation.y = Math.PI / 2;
    g.add(car);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(2.3, 0.9, 1).setTranslation(cx + 16, Y + 0.9, z0 - 6));
    this.lootSpots.push(V3(cx - 12, Y + 0.8, z0 - 2), V3(cx + 12, Y + 0.3, z0 - 6));
    this.kingsPost = V3(cx, Y, z0 - 4);
  }

  // Hollow Boys' turf: a burned-out empty lot behind a sagging fence
  emptyLot(b) {
    const g = this.group;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    flat(g, b.x1 - b.x0, b.z1 - b.z0, cx, cz, std({ color: 0x4f4a3c, roughness: 1 }), Y + 0.17);
    this.fence(b.x0 + 2, b.z0 + 2, b.x1 - 2, b.z0 + 2);
    this.fence(b.x1 - 2, b.z0 + 2, b.x1 - 2, b.z1 - 2);
    this.fence(b.x0 + 2, b.z1 - 2, b.x0 + 2, b.z0 + 2);
    this.burnedCar(cx - 10, cz - 5, 0.7);
    this.burnedCar(cx + 14, cz - 12, 2.2);
    // a burn barrel and some crates to sit on, under a tarp
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12), std({ color: 0x3a2a20, metalness: 0.4 }));
    barrel.position.set(cx, Y + 0.45, cz + 14);
    g.add(barrel);
    const fire = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), std({ color: 0x2a1a10, emissive: 0xff6a1a, emissiveIntensity: 1.2 }));
    fire.rotation.x = -Math.PI / 2; fire.position.set(cx, Y + 0.9, cz + 14);
    g.add(fire);
    for (const [dx, dz] of [[-2.5, 1], [2.5, 1.5], [0, 3]]) solidBox(g, this.sb, 1, 0.8, 1, cx + dx, Y, cz + 14 + dz, std({ color: 0x8a6440 }));
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), std({ color: 0x2a5a8a, side: THREE.DoubleSide, roughness: 0.8 }));
    tarp.rotation.x = -Math.PI / 2 + 0.15; tarp.position.set(cx, Y + 3, cz + 15); g.add(tarp);
    for (const [dx, dz] of [[-3.8, -2.8], [3.8, -2.8], [-3.8, 2.8], [3.8, 2.8]]) solidBox(g, this.sb, 0.12, 3.2, 0.12, cx + dx, Y, cz + 15 + dz, std({ color: 0x5a5048 }), { collide: false });
    this.lootSpots.push(V3(cx - 2.5, Y + 1.1, cz + 15), V3(cx + 5, Y + 0.3, cz + 19));
    this.hollowPost = V3(cx, Y, cz + 16);
    sign(g, 'NO TRESPASSING', cx, Y + 2, b.z0 + 1.9, Math.PI, { w: 4, h: 0.8, bg: '#b3261e', fg: '#ffffff' });
  }

  // the projects' plaza: benches, a dead fountain, chalk on the ground
  plaza(b) {
    const g = this.group, cx = (b.x0 + b.x1) / 2, cz = b.z1 - 8;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, 0.7, 16), std({ color: 0x9a948a }));
    f.position.set(cx, Y + 0.5, cz); g.add(f);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(0.35, 3.2).setTranslation(cx, Y + 0.5, cz));
    for (const s of [-1, 1]) solidBox(g, this.sb, 3, 0.5, 0.7, cx + s * 9, Y + 0.15, cz, std({ color: 0x6b4a2f }));
  }

  // the Hollows Community Garden: raised beds, sunflowers, a shed, a painted fence
  garden(b) {
    const g = this.group, sb = this.sb;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    flat(g, b.x1 - b.x0, b.z1 - b.z0, cx, cz, std({ color: 0x4a6a32, roughness: 1 }), Y + 0.17);
    const bed = std({ color: 0x7a5a3a, roughness: 0.9 }), soil = std({ color: 0x3a2a1a, roughness: 1 });
    const greens = [0x3aa760, 0x6ac040, 0x2a8a4a];
    for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) {
      const x = cx + i * 9, z = cz + s * 10;
      solidBox(g, sb, 6, 0.6, 2.4, x, Y + 0.15, z, bed);
      solidBox(g, sb, 5.6, 0.05, 2, x, Y + 0.75, z, soil, { collide: false });
      for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 6, 4), std({ color: pick(greens) })); p.position.set(x - 2.4 + k * 0.95, Y + 0.95, z + (Math.random() - 0.5)); g.add(p); }
    }
    for (let k = 0; k < 8; k++) { // sunflowers
      const x = b.x0 + 3 + k * 3.4, z = b.z1 - 3;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 5), std({ color: 0x3a7a2a })); st.position.set(x, Y + 1.25, z); g.add(st);
      const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 10), std({ color: 0xf2c418 })); hd.rotation.x = Math.PI / 2 - 0.3; hd.position.set(x, Y + 2.4, z - 0.1); g.add(hd);
    }
    solidBox(g, sb, 4, 2.6, 3, b.x1 - 5, Y + 0.15, b.z0 + 5, std({ color: 0x8a3a2a }));
    sign(g, 'HOLLOWS COMMUNITY GARDEN', cx, Y + 2.4, b.z0 - 0.2, Math.PI, { w: 8, h: 0.9, bg: '#2a6a3a', fg: '#ffffff', post: Y });
    this.lootSpots.push(V3(b.x1 - 5, Y + 0.6, b.z0 + 7.5));
  }

  // a taco truck on an open lot, picnic tables, and lights strung overhead
  tacoLot(b) {
    const g = this.group, sb = this.sb;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    flat(g, b.x1 - b.x0, b.z1 - b.z0, cx, cz, std({ color: 0x55534e, roughness: 1 }), Y + 0.17);
    const truck = new THREE.Group(); truck.position.set(cx, Y + 0.15, b.z0 + 9); g.add(truck);
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 2.6), std({ color: 0xe8c547 })); body.position.y = 1.9; truck.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 2.5), std({ color: 0xe8c547 })); cab.position.set(4.4, 1.5, 0); truck.add(cab);
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.1), std({ color: 0x15161a })); hatch.position.set(-0.5, 2.2, 1.31); truck.add(hatch);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 1.2), std({ color: 0xc23b2a })); awning.position.set(-0.5, 3.1, 1.9); awning.rotation.x = 0.25; truck.add(awning);
    for (const x of [-2.5, 2.5, 4.2]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), std({ color: 0x15161a })); w.rotation.x = Math.PI / 2; w.position.set(x, 0.5, s * 1.3); truck.add(w); }
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(4.5, 1.7, 1.3).setTranslation(cx + 0.9, Y + 1.85, b.z0 + 9));
    sign(g, 'TACOS EL GÜERO', cx - 0.5, Y + 3.9, b.z0 + 10.35, 0, { w: 4.4, h: 0.7, bg: '#c23b2a', fg: '#ffd166', glow: true });
    for (const [x, z] of [[-10, 6], [0, 8], [10, 6], [-6, 16], [6, 16]]) {
      solidBox(g, sb, 2.2, 0.75, 1, cx + x, Y + 0.15, cz + z, std({ color: 0x8a6440 }));
      for (const s of [-1, 1]) solidBox(g, sb, 2.2, 0.45, 0.35, cx + x, Y + 0.15, cz + z + s * 0.9, std({ color: 0x7a5434 }));
    }
    this.lootSpots.push(V3(cx, Y + 1, cz + 8));
    // lights strung in a fan from a pole in the middle
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), wireM = new THREE.LineBasicMaterial({ color: 0x222222 });
    const top = V3(cx, Y + 6.5, cz + 10);
    solidBox(g, sb, 0.2, 6.6, 0.2, cx, Y, cz + 10, std({ color: 0x3a3c40 }));
    for (const [ex, ez] of [[b.x0 + 1, b.z0 + 1], [b.x1 - 1, b.z0 + 1], [b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z1 - 1]]) {
      const end = V3(ex, Y + 4, ez), pts = [];
      for (let s = 0; s <= 10; s++) { const p = top.clone().lerp(end, s / 10); p.y -= Math.sin((s / 10) * Math.PI) * 1.2; pts.push(p); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
      for (const p of pts.slice(1)) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), mat); bulb.position.copy(p).y -= 0.12; bulb.userData.noMerge = true; g.add(bulb); }
      solidBox(g, sb, 0.15, 4.1, 0.15, ex, Y, ez, std({ color: 0x3a3c40 }));
    }
  }

  // an open car park on the north shore, with a clear lane down the middle
  parkingLot(b) {
    const g = this.group, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    flat(g, b.x1 - b.x0, b.z1 - b.z0, cx, cz, std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#45484c'; c.fillRect(0, 0, w, h); speckle(c, w, h, 300, 0.08); c.fillStyle = 'rgba(232,232,226,0.7)'; c.fillRect(0, 0, 2, h); }, [10, 1]) }), Y + 0.17);
    for (let k = 0; k < 4; k++) this.parkedSpots.push({ x: b.x0 + 4 + k * 3.2, z: cz + (Math.random() - 0.5) * 30, heading: 0, color: pick([0x6a5a4a, 0x3a4a5a, 0x7a2a2a, 0x2a2a2a]) });
    sign(g, 'P', b.x0 + 2, Y + 3, b.z1 + 0.5, 0, { w: 1.2, h: 1.2, bg: '#1f5fbf', fg: '#ffffff', post: Y });
  }

  // Suds car wash: two open bays under a canopy, brushes and all
  carWash(b) {
    const g = this.group, sb = this.sb;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    flat(g, b.x1 - b.x0, b.z1 - b.z0, cx, cz, std({ color: 0x6a6e74, roughness: 0.6 }), Y + 0.17);
    const blue = std({ color: 0x2f7fd8 }), white = std({ color: 0xeeeeea });
    for (const x of [cx - 16, cx, cx + 16]) solidBox(g, sb, 0.6, 5, 24, x, Y + 0.15, cz, white);
    solidBox(g, sb, 34, 0.5, 26, cx, Y + 5.15, cz, blue, { collide: false });
    for (const x of [cx - 8, cx + 8]) for (const s of [-1, 1]) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.4, 10), std({ color: [0xff4ad8, 0x2f7fd8][s > 0 ? 1 : 0], roughness: 1 })); br.position.set(x + s * 3.6, Y + 2, cz); g.add(br); }
    sign(g, 'SUDS CAR WASH', cx, Y + 6.3, b.z1 - 0.5, 0, { w: 9, h: 1.3, bg: '#2f7fd8', fg: '#ffffff', glow: true });
    this.lootSpots.push(V3(cx - 14, Y + 0.6, cz + 10));
  }
}
