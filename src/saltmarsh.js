import * as THREE from 'three';
import { generalStore } from './gasstation.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y } from './world.js';
import { canvasTex, speckle, std, sign, lamp, tree, solidBox } from './buildkit.js';
import { suburbanHome } from './suburb.js';
import { islandSlab, flat, pier } from './city.js';
import { addPier } from './world.js';
import { cityBuilding } from './architecture.js';

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
    this.interiors = []; // walk-in shops (the gun store)
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

    // ---- the beach: a strip of sand all down the west shore, sloping into the sea ----
    this.buildBeach();

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
    { const gl = []; generalStore(g, sb, -666, Y + 0.15, -1350, -Math.PI / 2, gl); for (const p of gl) this.lootSpots.push({ pos: p, kind: 'porch' }); }
    // the town proper: a row of public buildings and shops along the north shore
    this.buildTownRow();
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

  // Along the north shore, facing the last street: the school, fire station, police, hospital,
  // pharmacy, library, bank, town hall, a diner, the clothes shop and the gun store. (Gaps are left
  // for Dockside Motors' apron and the path down to the fishing dock.)
  buildTownRow() {
    const g = this.group, sb = this.sb;
    const Z = this.zs.at(-1), D = 22, front = Z + 10, cz = front + D / 2, y0 = Y + 0.15;
    this.places = [];
    const lot = (cx, w) => ({ cx, cz, y0, w, d: D, front: 'n', streets: new Set(['n']) });
    const B = [
      { cx: -975, w: 30, opts: { type: 'brick', floors: 2, interior: 'lobby', name: 'SALTMARSH ELEMENTARY SCHOOL', signBg: '#1f4f8a', signFg: '#ffffff' }, color: '#5aa0ff', label: 'School' },
      { cx: -945, w: 22, opts: { type: 'brick', floors: 2, name: 'FIRE STATION No. 4', signBg: '#8a1a12', signFg: '#ffffff' }, color: '#ff5a3a', label: 'Fire station', fire: true },
      { cx: -919, w: 22, opts: { type: 'civic', color: '#d6d8dc', floors: 2, interior: 'lobby', name: 'SALTMARSH POLICE', signBg: '#1c2f6e', signFg: '#ffffff' }, color: '#4a7dff', label: 'Police' },
      { cx: -889, w: 30, opts: { type: 'civic', color: '#f0eee8', floors: 3, interior: 'lobby', name: 'SALTMARSH HOSPITAL', signBg: '#c62828', signFg: '#ffffff' }, color: '#ff6a6a', label: 'Hospital', hospital: true },
      { cx: -862, w: 16, opts: { type: 'brick', floors: 1, interior: 'shop', name: 'SALTMARSH PHARMACY', signBg: '#2f8a52', signFg: '#ffffff' }, color: '#3ad38a', label: 'Pharmacy' },
      { cx: -841, w: 18, opts: { type: 'civic', color: '#e4d8c2', floors: 1, interior: 'lobby', name: 'PUBLIC LIBRARY', signBg: '#4a3a2a', signFg: '#f2e6c8' }, color: '#c9a26a', label: 'Library' },
      { cx: -821, w: 16, opts: { type: 'civic', color: '#e8e2d4', floors: 1, interior: 'bank', name: 'SALTMARSH SAVINGS', signBg: '#1f3b2e', signFg: '#e8d48a' }, color: '#2fd38a', label: 'Bank' },
      { cx: -774, w: 24, opts: { type: 'civic', color: '#e9e4d8', floors: 2, interior: 'lobby', name: 'TOWN HALL', signBg: '#2c3e5e', signFg: '#ffe7a0' }, color: '#e8e2d4', label: 'Town hall', flag: true },
      { cx: -729, w: 18, opts: { type: 'brick', floors: 1, interior: 'diner', name: "MARSHA'S DINER", signBg: '#c23b2a', signFg: '#fff6d8' }, color: '#ffb36b', label: 'Diner' },
      { cx: -707, w: 18, opts: { type: 'brick', floors: 1, interior: 'shop', name: 'SALTMARSH THREADS', signBg: '#6a2a5a', signFg: '#ffd0f0' }, color: '#ff8ad8', label: 'Clothes (cosmetics)', short: 'Threads' },
      { cx: -685, w: 18, opts: { type: 'brick', floors: 1, interior: 'shop', name: 'SALTMARSH GUNS & AMMO', signBg: '#2b2f22', signFg: '#e8c547' }, color: '#e8c547', label: 'Gun store', short: 'Guns' },
    ];
    for (const b of B) {
      const out = cityBuilding(g, sb, lot(b.cx, b.w), b.opts);
      if (b.opts.interior) this.interiors.push({ ...out, kind: b.opts.interior, name: b.opts.name, island: 'town' });
      const door = out.door ? out.door.clone() : new THREE.Vector3(b.cx, Y, front);
      this.places.push({ name: b.opts.name, label: b.label, short: b.short, color: b.color, pos: door });
      if (b.opts.name.includes('GUNS')) this.gunStore = door;
      if (b.opts.name.includes('THREADS')) this.threads = door;
      if (b.hospital) this.hospital = new THREE.Vector3(b.cx, Y, front - 3);
      if (b.fire) { // two red engine-bay doors
        const red = std({ color: 0xb3261e, roughness: 0.5, metalness: 0.2 });
        for (const s of [-1, 1]) {
          const d = new THREE.Mesh(new THREE.BoxGeometry(7.5, 4, 0.12), red); d.position.set(b.cx + s * 5, y0 + 2.05, front - 0.1); g.add(d);
          for (let k = 1; k < 8; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.05, 0.14), std({ color: 0x7a1a14 })); r.position.set(b.cx + s * 5, y0 + k * 0.5, front - 0.1); g.add(r); }
        }
      }
      if (b.flag) this.flagpole(b.cx + b.w / 2 - 2, front - 3);
      // a bench and a lamp out front
      lamp(g, sb, b.cx - b.w / 2 + 1.5, Y, front - 1.2);
    }
    this.flagpole(-919 - 9, front - 3);
    // vehicles you'd expect outside: a fire engine, an ambulance and the school bus (stealable, of course)
    const kerb = Z + 3.6;
    this.specialParked = [
      { kind: 'fire', x: -945, z: kerb, heading: Math.PI / 2 },
      { kind: 'ambulance', x: -889, z: kerb, heading: Math.PI / 2 },
      { kind: 'schoolbus', x: -975, z: kerb, heading: Math.PI / 2 },
      { kind: 'police', x: -919, z: kerb, heading: -Math.PI / 2 },
    ];
    // the school playground out the back: swings, a slide, a hoop, a sandpit
    const px = -975, pz = cz + D / 2 + 14;
    const steel = std({ color: 0xc23b2a, roughness: 0.5, metalness: 0.4 }), blue = std({ color: 0x2f7fd8, roughness: 0.5 });
    const box = (w, h, d, x, y, z, m, rx = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; g.add(o); return o; };
    for (const s of [-1, 1]) { box(0.12, 2.6, 0.12, px - 8 + s * 2.2, Y + 1.3, pz - 1, steel, 0.25, 0); box(0.12, 2.6, 0.12, px - 8 + s * 2.2, Y + 1.3, pz + 1, steel, -0.25, 0); }
    box(4.6, 0.12, 0.12, px - 8, Y + 2.55, pz, steel);
    for (const s of [-1, 1]) { box(0.02, 1.6, 0.02, px - 8 + s * 1.1 - 0.25, Y + 1.75, pz, std({ color: 0x8a8f96 })); box(0.02, 1.6, 0.02, px - 8 + s * 1.1 + 0.25, Y + 1.75, pz, std({ color: 0x8a8f96 })); box(0.6, 0.06, 0.25, px - 8 + s * 1.1, Y + 0.95, pz, std({ color: 0x15161a })); }
    box(1.2, 0.08, 4.2, px + 2, Y + 1.2, pz, std({ color: 0xe0a030 }), 0.5); box(1.2, 2.2, 1.2, px + 2, Y + 1.1, pz - 2.4, blue);
    solidBox(g, sb, 0.2, 3.4, 0.2, px + 10, Y, pz + 4, std({ color: 0x8a8f96 }));
    box(1.4, 1, 0.08, px + 10, Y + 3.3, pz + 3.85, std({ color: 0xf2f2ee }));
    const sandpit = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 5), std({ color: 0xe3cf9a, roughness: 1 })); sandpit.position.set(px + 2, Y + 0.1, pz + 8); g.add(sandpit);
    sign(g, 'PLAYGROUND', px - 13, Y + 1.6, pz - 5, Math.PI, { w: 3.6, h: 0.6, bg: '#e0a030', fg: '#15161a', post: Y });
  }

  flagpole(x, z) {
    const g = this.group;
    solidBox(g, this.sb, 0.15, 9, 0.15, x, Y, z, std({ color: 0xd8dde2, metalness: 0.7, roughness: 0.3 }));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: canvasTex(90, 55, (c, w, h) => { c.fillStyle = '#2c3e5e'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8c547'; c.fillRect(0, h * 0.42, w, h * 0.16); c.beginPath(); c.arc(w * 0.3, h * 0.5, 9, 0, 7); c.fill(); }) }));
    flag.position.set(x + 0.95, Y + 8.3, z); g.add(flag);
  }

  addHome(x, z, yaw, lotW, lotD) {
    const h = suburbanHome(this.group, this.sb, x, Y, z, yaw, lotW, lotD);
    (this.homes ||= []).push({ ...h, yaw: yaw + Math.PI }); // (yaw: facing out of the front door)
    if (Math.random() < 0.55) this.lootSpots.push({ pos: h.porch, kind: 'porch' });
    // a car in some driveways
    if (h.garage && Math.random() < 0.45) this.parkedSpots.push({ x: h.drive.x, z: h.drive.z, heading: yaw === 0 ? 0 : Math.PI, color: [0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x3aa760, 0x2a2a2a, 0x8a8f96][Math.floor(Math.random() * 6)] });
    if (Math.random() < 0.5) tree(this.group, this.sb, h.backYard.x, Y, h.backYard.z, 1 + Math.random() * 0.4);
  }

  buildBeach() {
    const g = this.group, sb = this.sb, isl = this.isl;
    const x0 = isl.x0, xIn = x0 + 40, z0 = isl.z0 + 6, z1 = -1290; // (north of here the bridge comes down)
    const sand = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#e3cf9a'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(160,130,80,.25)' : 'rgba(255,245,215,.35)'; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    }, [10, (z1 - z0) / 8]);
    const sandM = std({ map: sand, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
    // dry sand on top of the island's edge, fading into the grass
    flat(g, xIn - x0, z1 - z0, (x0 + xIn) / 2, (z0 + z1) / 2, sandM, Y + 0.03);
    // and a slope down into the water, walkable out into the shallows
    const slopeW = 22, drop = 4.5;
    const geo = new THREE.PlaneGeometry(slopeW, z1 - z0);
    geo.rotateX(-Math.PI / 2);
    const ang = Math.atan2(drop, slopeW);
    geo.rotateZ(ang); // high (dry) on the island side, low out in the water
    const slope = new THREE.Mesh(geo, std({ map: sand, roughness: 1, color: 0xe8d8b0 }));
    slope.position.set(x0 - slopeW / 2 + 0.2, Y - drop / 2 - 0.02, (z0 + z1) / 2);
    slope.receiveShadow = true;
    g.add(slope);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    const hl = Math.hypot(slopeW, drop) / 2;
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(hl, 0.2, (z1 - z0) / 2).setTranslation(x0 - slopeW / 2, Y - drop / 2 - 0.2, (z0 + z1) / 2).setRotation(q));
    addPier(x0 - 12, x0, z0, z1); // the shallows count as land (people, cars)
    // umbrellas, towels, loungers, a lifeguard tower, a volleyball net
    const cols = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xfb8c00, 0xffffff, 0x8e24aa];
    const pole = std({ color: 0xdddddd, metalness: 0.4 });
    for (let z = z0 + 15; z < z1 - 10; z += 14 + Math.random() * 10) {
      const x = x0 + 8 + Math.random() * 20;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), pole); p.position.set(x, Y + 1.3, z); g.add(p);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 10), std({ color: cols[Math.floor(Math.random() * cols.length)], roughness: 0.8 }));
      canopy.position.set(x, Y + 2.7, z); canopy.castShadow = true; g.add(canopy);
      for (let k = 0; k < 2; k++) {
        const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), std({ color: cols[Math.floor(Math.random() * cols.length)], roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
        towel.rotation.set(-Math.PI / 2, 0, Math.random() * 0.4); towel.position.set(x - 1.2 + k * 2.4, Y + 0.05, z + 1.6); g.add(towel);
      }
      if (Math.random() < 0.6) this.lootSpots.push({ pos: new THREE.Vector3(x + 1, Y + 0.3, z + 1.6), kind: 'misc' });
    }
    // lifeguard tower
    const lx = x0 + 14, lz = (z0 + z1) / 2, wood = std({ color: 0xf2f2ee });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solidBox(g, sb, 0.2, 3, 0.2, lx + dx, Y, lz + dz, wood);
    solidBox(g, sb, 2.8, 0.2, 2.8, lx, Y + 3, lz, wood);
    solidBox(g, sb, 2.6, 2, 2.6, lx, Y + 3.2, lz, std({ color: 0xe53935 }), { collide: false });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), std({ color: 0xe53935, side: THREE.DoubleSide })); flag.position.set(lx + 0.5, Y + 6.3, lz); g.add(flag);
    const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), pole); fp.position.set(lx, Y + 5.6, lz); g.add(fp);
    for (let i = 0; i < 9; i++) solidBox(g, sb, 1.6, 0.15, 0.35, lx - 1.6 - i * 0.0, Y + i * 0.33, lz + 1.4 + (8 - i) * 0.3, wood, { collide: false });
    // volleyball net
    const vz = z0 + 60, vx = x0 + 22;
    for (const s of [-1, 1]) { const np = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), pole); np.position.set(vx, Y + 1.3, vz + s * 4.5); g.add(np); }
    const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 1), std({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    net.rotation.y = Math.PI / 2; net.position.set(vx, Y + 2.1, vz); net.userData.noMerge = true; g.add(net);
    sign(g, 'SALTMARSH BEACH', x0 + 36, Y + 2.6, z0 + 30, -Math.PI / 2, { w: 6, h: 1.1, bg: '#1e88e5', fg: '#ffffff', post: Y });
    this.beach = new THREE.Vector3(x0 + 20, Y, (z0 + z1) / 2);
  }
}
