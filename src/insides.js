import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BUILDINGS, CORE, WALL, FLOOR, GROUND, MATS } from './architecture.js';
import { std, canvasTex } from './buildkit.js';
import { islandAt, LAND_Y } from './world.js';
import { seeded } from './netseed.js';
import { randomLook } from './figure.js';

// Inside every building. The outside walls, the floors and the roof are always there (see
// cityBuilding); whatever you're standing in gets fitted out as you go in, a floor or two either
// side of the one you're on: the stairs up the back-left corner, a corridor with apartments off it
// (people at home in most of them, and a few FOR RENT), shops upstairs over some of the shops,
// open-plan offices in the towers, a lobby or a corner shop on the ground floor, and a lift in the
// tall ones. The stairs carry on up to a hut on the roof with a door out.

const T = WALL;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const RENT_KEY = 'physick.rent.v1';
const PRICE = { city: 70, hood: 25, town: 50 }; // a day, before the size of the place
const UPPER_SHOPS = [['BOUTIQUE', '#6a2a5a', 0xe8c0d8], ['BARBER', '#1f3b63', 0xc8d8e8], ['NAIL SALON', '#c2185b', 0xf8d0e0], ['VINTAGE', '#5a3a1a', 0xe0c890], ['GAME CAFÉ', '#2a2a7a', 0xb0c0ff], ['DENTIST', '#1f6f5a', 0xd0f0e8], ['TAILOR', '#3a3a3a', 0xd8d0c0], ['RECORDS', '#8a1a14', 0xf0d0b0]];
const SNACKS = [['Soda', 3, 8], ['Crisps', 2, 5], ['Sandwich', 7, 25], ['Coffee', 4, 10], ['Energy bar', 5, 15]];

export class Insides {
  constructor(game) {
    this.game = game;
    this.list = BUILDINGS;
    this.active = null; // { B, floors: Map(f -> {group, cols, npcs}) , f }
    this.scanT = 0;
    try { this.rental = JSON.parse(localStorage.getItem(RENT_KEY) || 'null'); } catch { this.rental = null; }
    this.lastHour = null;
    this.mats = {
      wall: MATS.inner(0xe9e4da), wall2: MATS.inner(0xd8e0e6), wall3: MATS.inner(0xe8dcc8),
      dark: std({ color: 0x2a2c30 }), wood: MATS.floor('wood'), metal: MATS.metal(),
      light: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
      bed: std({ color: 0xe8e6e0 }), blanket: [0x2f5f9f, 0x9f2f3f, 0x3f8f5f, 0x8f7f3f, 0x5f3f8f].map((c) => std({ color: c, roughness: 0.9 })),
      sofa: [0x6a4a3a, 0x3a4a6a, 0x5a6a4a, 0x7a3a3a, 0x4a4a4a].map((c) => std({ color: c, roughness: 0.9 })),
      rug: [0x8a3a2a, 0x2a5a7a, 0x6a6a3a, 0x5a2a5a].map((c) => std({ color: c, roughness: 1 })),
      tv: std({ color: 0x0e0f12, roughness: 0.3 }), screen: new THREE.MeshBasicMaterial({ color: 0x3a6a9a }),
      counter: MATS.inner(0xd8d4cc), stone: MATS.inner(0x9a9690), white: MATS.inner(0xf2f2ee),
      door: std({ color: 0x6a4a30, roughness: 0.6 }), doorMine: std({ color: 0x2a6a3a, roughness: 0.6 }),
      plant: std({ color: 0x3a8a4a, roughness: 0.9 }), pot: std({ color: 0xa8603a }),
      shelf: std({ color: 0xb8b2a6, metalness: 0.2 }), monitor: new THREE.MeshBasicMaterial({ color: 0x8ab8e8 }),
      lift: std({ color: 0xa9adb1, metalness: 0.7, roughness: 0.3 }), mail: std({ color: 0x8a7a5a, metalness: 0.4 }),
    };
    this.items = [0xc23b2a, 0x2f7fd8, 0xe0a030, 0x3aa760, 0xf2f2ee, 0x8a4ad8].map((c) => std({ color: c, roughness: 0.6 }));
    for (const m of [this.mats.bed, ...this.mats.blanket, ...this.mats.sofa, ...this.mats.rug, this.mats.door, this.mats.doorMine, this.mats.plant, this.mats.pot, this.mats.shelf, this.mats.mail, ...this.items]) { m.emissive = m.color.clone(); m.emissiveIntensity = 0.22; }
  }

  // ---------------------------------------------------------------- finding the building you're in
  local(B, p) { return B.k.root.worldToLocal(V3(p.x, p.y, p.z)); }
  inside(B, l, m = 0) { return Math.abs(l.x) < B.w / 2 + m && Math.abs(l.z) < B.d / 2 + m && l.y > -2 && l.y < B.H + 4; }
  floorOf(B, ly) {
    if (ly < GROUND - 0.6) return 0;
    if (ly > B.H - 0.6) return B.floors + 1; // the roof
    return Math.min(B.floors, 1 + Math.floor((ly - GROUND + 0.6) / FLOOR));
  }
  levelY(f) { return f === 0 ? 0 : GROUND + (f - 1) * FLOOR; }

  update(dt) {
    const g = this.game;
    this.payRent();
    if (!g.started || !g.onShore || g.vehicles.active || g.flying || g.homes?.inside || g.story?.underground) { if (this.active) this.close(); return; }
    const t = g.shorePlayer.body.translation();
    this.scanT -= dt;
    let A = this.active;
    if (A) {
      const l = this.local(A.B, t);
      if (!this.inside(A.B, l, 6)) { this.close(); A = null; } else { this.setFloor(this.floorOf(A.B, l.y)); this.tickNpcs(dt); return; }
    }
    if (this.scanT > 0) return;
    this.scanT = 0.25;
    for (const B of BUILDINGS) {
      if (Math.abs(B.x - t.x) > 60 || Math.abs(B.z - t.z) > 60) continue;
      const l = this.local(B, t);
      if (this.inside(B, l, 3)) { this.open(B); this.setFloor(this.floorOf(B, l.y)); return; }
    }
  }

  open(B) {
    if (this.active) this.close();
    this.active = { B, floors: new Map(), f: -1 };
  }

  close() {
    const A = this.active;
    if (!A) return;
    for (const f of [...A.floors.keys()]) this.dropFloor(f);
    this.active = null;
  }

  // keep the floor you're on and the ones either side of it fitted out
  setFloor(f) {
    const A = this.active;
    if (!A || A.f === f) return;
    A.f = f;
    const want = new Set();
    for (let k = f - 1; k <= f + 1; k++) if (k >= 0 && k <= A.B.floors) want.add(k);
    for (const k of [...A.floors.keys()]) if (!want.has(k)) this.dropFloor(k);
    for (const k of want) if (!A.floors.has(k)) A.floors.set(k, this.buildFloor(A.B, k));
  }

  dropFloor(f) {
    const A = this.active, F = A.floors.get(f);
    if (!F) return;
    const g = this.game, sb = g.portSandbox;
    F.group.removeFromParent();
    F.group.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose(); });
    for (const c of F.cols) { sb.staticColliders.delete(c.handle); sb.world.removeCollider(c, false); }
    for (const n of F.npcs) if (g.citizens.list.includes(n)) g.citizens.despawn(n);
    A.floors.delete(f);
  }

  // ---------------------------------------------------------------- building a floor
  buildFloor(B, f) {
    const g = this.game, sb = g.portSandbox, M = this.mats;
    const F = { group: new THREE.Group(), cols: [], npcs: [], spots: [] };
    // (the building's own group was merged away: carry its transform over)
    F.group.matrixAutoUpdate = false;
    F.group.matrix.copy(B.k.root.matrixWorld);
    F.group.matrixWorldNeedsUpdate = true;
    g.scene.add(F.group);
    const y = this.levelY(f), h = f === 0 ? GROUND : FLOOR;
    const rng = seeded((B.style ^ (f * 2654435761)) >>> 0);
    const q = B.k.q;
    // a box in the building's frame (y = its bottom), optionally solid
    const box = (w, hh, d, x, by, z, m, solid = false, rotY = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
      o.position.set(x, by + hh / 2, z); o.rotation.y = rotY; o.castShadow = false; o.receiveShadow = true;
      F.group.add(o);
      if (solid) {
        const p = B.k.world(x, by + hh / 2, z);
        const rq = rotY ? q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rotY)) : q;
        F.cols.push(sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, hh / 2, d / 2).setTranslation(p.x, p.y, p.z).setRotation(rq)));
      }
      return o;
    };
    const lightAt = (x, z, w = 1.2, d = 0.4) => { const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), M.light); l.position.set(x, y + h - 0.34, z); F.group.add(l); };
    const ctx = { B, f, y, h, rng, box, lightAt, F };
    const xL = -B.w / 2 + T, xR = B.w / 2 - T, zB = -B.d / 2 + T, zF = B.d / 2 - T;
    if (f === 0) {
      // the ground floor stands on the pavement: give it a proper floor
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(xR - xL, zF - zB), MATS.floor(B.ground === 'store' ? 'tile' : 'wood'));
      fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.03, 0); F.group.add(fl);
    }
    const C = B.core;
    if (C) this.stairs(ctx);
    if (f === 0) this.groundFloor(ctx);
    else if (C) {
      const use = B.upper === 'offices' ? 'offices' : B.upper === 'shops+apartments' && f === 1 ? 'shops' : 'apartments';
      if (use === 'offices') this.offices(ctx); else this.corridorFloor(ctx, use);
    }
    // a lift in the tall ones: a call panel by the stairs on every floor
    if (C && B.floors >= 5) {
      box(1.6, 2.3, 0.1, C.x1 + 1.1, y, C.hole - 0.02 + 0.06, M.lift);
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.04), new THREE.MeshBasicMaterial({ color: 0xffd166 })); btn.position.set(C.x1 + 2.15, y + 1.2, C.hole + 0.1); F.group.add(btn);
      F.spots.push({ kind: 'lift', at: B.k.world(C.x1 + 1.1, y, C.hole + 1.2) });
    }
    return F;
  }

  // switchback stairs up the corner: up the left half to a half landing, back along the right half
  stairs({ B, f, y, h, box, F }) {
    const C = B.core, M = this.mats, sb = this.game.portSandbox;
    const rise = h, half = rise / 2;
    const xa0 = C.x0, xa1 = C.x0 + 2.05, xb0 = C.x0 + 2.25, xb1 = C.x1;
    const zl = C.z0 + 1.6, zt = C.hole, run = zt - zl;
    const ramp = (x0, x1, zFrom, yFrom, zTo, yTo) => {
      const L = Math.hypot(zTo - zFrom, yTo - yFrom), a = Math.atan2(yTo - yFrom, Math.abs(zTo - zFrom)) * (zTo < zFrom ? 1 : -1);
      const mid = B.k.world((x0 + x1) / 2, (yFrom + yTo) / 2 - 0.08, (zFrom + zTo) / 2);
      const rq = B.k.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), a));
      F.cols.push(sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.08, L / 2).setTranslation(mid.x, mid.y, mid.z).setRotation(rq)));
      const n = 12;
      for (let i = 0; i < n; i++) { // the treads
        const t0 = i / n, t1 = (i + 1) / n;
        const za = zFrom + (zTo - zFrom) * t0, zb = zFrom + (zTo - zFrom) * t1;
        const top = yFrom + (yTo - yFrom) * t1;
        box(x1 - x0, 0.22, Math.abs(zb - za) + 0.01, (x0 + x1) / 2, top - 0.22, (za + zb) / 2, M.stone);
      }
    };
    ramp(xa0, xa1, zt, y, zl, y + half);
    box(C.x1 - C.x0, 0.25, zl - C.z0, (C.x0 + C.x1) / 2, y + half - 0.25, (C.z0 + zl) / 2, M.stone, true); // the half landing
    ramp(xb0, xb1, zl, y + half, zt, y + rise);
    box(0.12, rise + 0.9, run, (xa1 + xb0) / 2, y, (zl + zt) / 2, M.wall); // the wall between the flights
    // the stairwell's side wall, between it and the rooms
    const zEnd = f === 0 ? C.hole : Math.min(B.d / 2 - T, Math.max(C.hole, this.corridor(B).z0));
    box(T, h - 0.3, zEnd - (-B.d / 2 + T), C.x1 + T / 2, y, (zEnd - B.d / 2 + T) / 2, M.wall, true);
    // a sign by the bottom step
    const label = f + 1 > B.floors ? 'ROOF' : `FLOOR ${f + 1}`;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), new THREE.MeshBasicMaterial({ map: this.labelTex(`${label} ↑`) }));
    s.position.set(C.x0 + 1, y + 2.1, C.hole + 0.02 + 0.5); s.rotation.y = 0; F.group.add(s);
  }

  labelTex(text, bg = '#2c3e5e', fg = '#ffffff') {
    this.labels ||= new Map();
    const key = `${text}|${bg}|${fg}`;
    if (!this.labels.has(key)) this.labels.set(key, canvasTex(256, 80, (c, w, hh) => { c.fillStyle = bg; c.fillRect(0, 0, w, hh); c.fillStyle = fg; c.font = 'bold 40px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, hh / 2 + 2); }));
    return this.labels.get(key);
  }

  // the corridor and the two rows of rooms off it (the same plan on every floor)
  corridor(B) {
    const C = B.core, zC1 = Math.max(1.1, C.z1), zC0 = zC1 - 2.2;
    return { z0: zC0, z1: zC1 };
  }
  units(B) {
    const C = B.core, xL = -B.w / 2 + T, xR = B.w / 2 - T, zB = -B.d / 2 + T, zF = B.d / 2 - T;
    const cor = this.corridor(B), out = [];
    const row = (x0, x1, z0, z1, side) => {
      if (z1 - z0 < 3 || x1 - x0 < 3.5) return;
      const n = Math.max(1, Math.round((x1 - x0) / 8));
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n;
        out.push({ x0: a, x1: b, z0, z1, side, door: { x: (a + b) / 2, z: side === 'front' ? z0 : z1 } });
      }
    };
    row(C.x1 + T, xR, zB, cor.z0, 'back');
    row(xL, xR, cor.z1, zF, 'front');
    out.forEach((u, i) => { u.i = i; });
    return out;
  }

  corridorFloor(ctx, use) {
    const { B, f, y, h, box, lightAt, rng, F } = ctx, M = this.mats;
    const C = B.core, xL = -B.w / 2 + T, xR = B.w / 2 - T, cor = this.corridor(B);
    const WH = h - 0.3;
    // corridor walls, with a door gap for each room
    const units = this.units(B);
    const wallRun = (x0, x1, z, doors) => {
      let at = x0;
      for (const dx of [...doors.sort((p, q2) => p - q2), x1 + 0.6]) { const b = Math.min(x1, dx - 0.6); if (b - at > 0.05) box(b - at, WH, 0.15, (at + b) / 2, y, z, M.wall, true); at = dx + 0.6; }
      for (const dx of doors) box(1.2, WH - 2.2, 0.15, dx, y + 2.2, z, M.wall);
    };
    wallRun(C.x1 + T, xR, cor.z0, units.filter((u) => u.side === 'back').map((u) => u.door.x));
    wallRun(xL, xR, cor.z1, units.filter((u) => u.side === 'front').map((u) => u.door.x));
    // the walls between the rooms
    for (const u of units) if (u.x1 < xR - 0.5) box(0.15, WH, u.z1 - u.z0, u.x1, y, (u.z0 + u.z1) / 2, M.wall2, true);
    for (let x = xL + 2; x < xR; x += 5) lightAt(x, (cor.z0 + cor.z1) / 2, 0.8, 0.8);
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(xR - xL, 1.4), M.rug[1]); runner.rotation.x = -Math.PI / 2; runner.position.set(0, y + 0.02, (cor.z0 + cor.z1) / 2); F.group.add(runner);
    // the rooms
    const mine = this.rental;
    for (const u of units) {
      const r = this.roll(B, f, u.i);
      const isMine = mine && mine.id === B.id && mine.f === f && mine.u === u.i;
      if (use === 'shops') { this.shopUnit(ctx, u); continue; }
      const state = isMine ? 'mine' : r < 0.18 ? 'rent' : r < 0.82 ? 'home' : 'away';
      this.apartment(ctx, u, state, rng);
    }
    void use;
  }

  // a fixed dice roll for a room (who lives there, whether it's to let)
  roll(B, f, i) { const R = seeded((B.style ^ Math.imul(f + 1, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0); R(); R(); return R(); }

  // a room's frame: a across the room, b in from the door; returns local (x, z)
  uf(u) {
    const s = u.side === 'front' ? 1 : -1, W = u.x1 - u.x0, D = u.z1 - u.z0, cx = (u.x0 + u.x1) / 2, zd = u.door.z;
    return { W, D, s, at: (a, b) => [cx + a, zd + s * b] };
  }

  apartment(ctx, u, state, rng) {
    const { B, f, y, box, lightAt, F } = ctx, M = this.mats;
    const { W, D, s, at } = this.uf(u);
    // the front door: shut and locked if somebody's in (or out); open if it's empty, or yours
    const open = state === 'rent' || state === 'mine';
    const dd = box(1.15, 2.2, 0.08, u.door.x + (open ? 0.5 : 0), y, u.door.z + (open ? s * 0.55 : 0), state === 'mine' ? M.doorMine : M.door, !open, open ? Math.PI / 2 : 0);
    void dd;
    const num = `${f}${String.fromCharCode(65 + u.i)}`;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: this.labelTex(num, '#d8c890', '#2a2420') }));
    plate.position.set(u.door.x + 0.95, y + 1.7, u.door.z - s * 0.1); plate.rotation.y = s > 0 ? Math.PI : 0; F.group.add(plate);
    if (state === 'rent' || state === 'mine') {
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: this.labelTex(state === 'mine' ? 'HOME' : 'FOR RENT', state === 'mine' ? '#2a6a3a' : '#b3261e') }));
      sg.position.set(u.door.x - 1.1, y + 1.5, u.door.z - s * 0.1); sg.rotation.y = s > 0 ? Math.PI : 0; F.group.add(sg);
    }
    F.spots.push({ kind: 'door', state, u, f, at: B.k.world(u.door.x, y, u.door.z - s * 0.8), num, price: this.price(B, u) });
    // inside: a bed in the far corner, a sofa facing a telly, a kitchen counter by the door, a table
    const [rx, rz] = at(0, D / 2);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3, W - 1.5), Math.min(2.2, D - 1.5)), M.rug[Math.floor(rng() * M.rug.length)]); rug.rotation.x = -Math.PI / 2; rug.position.set(rx, y + 0.02, rz); F.group.add(rug);
    lightAt(rx, rz, 1.2, 1.2);
    if (W >= 4 && D >= 4) {
      const [bx, bz] = at(W / 2 - 1.2, D - 1.25);
      box(1.6, 0.5, 2.1, bx, y, bz, M.bed, true);
      box(1.5, 0.12, 1.5, bx, y + 0.5, bz - s * 0.2, M.blanket[Math.floor(rng() * M.blanket.length)]);
      box(1.5, 0.15, 0.45, bx, y + 0.5, bz + s * 0.75, M.white);
      F.spots.push({ kind: 'bed', state, u, at: B.k.world(bx, y, bz - s * 1.4), bedAt: B.k.world(bx - 0.9, y, bz), yaw: B.yaw + (s > 0 ? Math.PI : 0) });
      const [sx, sz] = at(-W / 2 + 1.2, D * 0.62);
      box(0.9, 0.45, 2.2, sx, y, sz, M.sofa[Math.floor(rng() * M.sofa.length)], true);
      box(0.25, 0.85, 2.2, sx - 0.45, y, sz, M.sofa[1]);
      const [tx, tz] = at(W / 2 - 0.5, D * 0.62);
      if (W > 5) { box(0.5, 0.5, 1.6, tx, y, tz, M.wood, true); box(0.08, 0.7, 1.3, tx, y + 0.5, tz, M.tv); const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), M.screen); sc.position.set(tx - 0.05, y + 0.85, tz); sc.rotation.y = -Math.PI / 2; F.group.add(sc); }
      const [kx, kz] = at(-W / 2 + 0.4, 1.9);
      box(0.6, 0.92, 2.4, kx, y, kz, M.counter, true);
      box(0.62, 0.05, 2.42, kx, y + 0.92, kz, M.stone);
      const [ax, az] = at(0.6, D * 0.35);
      box(1.1, 0.75, 0.8, ax, y, az, M.wood, true);
      for (const o of [-0.5, 0.5]) box(0.4, 0.45, 0.4, ax + o, y, az + s * 0.7, M.wood);
      const [px, pz] = at(-W / 2 + 0.5, D - 0.5);
      box(0.4, 0.4, 0.4, px, y, pz, M.pot); const pl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), M.plant); pl.position.set(px, y + 0.85, pz); F.group.add(pl);
    }
    // somebody home
    if (state === 'home' && this.game.citizens.list.length < 140) {
      const [nx, nz] = at((rng() - 0.5) * (W - 2), 1.5 + rng() * Math.max(0.5, D - 3));
      this.person(F, B, B.k.world(nx, y, nz), B.yaw + rng() * Math.PI * 2);
    }
  }

  shopUnit(ctx, u) {
    const { B, y, box, lightAt, F, rng } = ctx, M = this.mats;
    const { W, D, at } = this.uf(u);
    const [name, bg, tint] = UPPER_SHOPS[Math.floor(rng() * UPPER_SHOPS.length)];
    const s = u.side === 'front' ? 1 : -1;
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: this.labelTex(name, bg) }));
    sg.position.set(u.door.x, y + 2.45, u.door.z - s * 0.1); sg.rotation.y = s > 0 ? Math.PI : 0; F.group.add(sg);
    const floorTint = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, D - 0.3), std({ color: tint, roughness: 0.6, emissive: tint, emissiveIntensity: 0.15 }));
    floorTint.rotation.x = -Math.PI / 2; const [fx, fz] = at(0, D / 2); floorTint.position.set(fx, y + 0.02, fz); F.group.add(floorTint);
    lightAt(fx, fz, 1.6, 1.6);
    if (W < 3.5 || D < 3.5) return;
    const [cx, cz] = at(W / 2 - 1, D * 0.45);
    box(0.8, 1.0, 2.2, cx, y, cz, M.counter, true);
    for (const a of [-W / 2 + 0.45]) for (let b = 1.5; b < D - 0.8; b += 2) { const [hx, hz] = at(a, b); box(0.5, 1.8, 1.6, hx, y, hz, M.shelf, true); for (let k = 0; k < 4; k++) box(0.3, 0.25, 0.3, hx + 0.05, y + 0.4 + (k % 2) * 0.6, hz - 0.5 + k * 0.3, this.items[Math.floor(rng() * this.items.length)]); }
    const [ex, ez] = at(W / 2 - 0.35, D * 0.45);
    this.person(F, B, B.k.world(ex, y, ez), B.yaw + (u.side === 'front' ? -Math.PI / 2 : Math.PI / 2), { shirt: 0x2c2c2c, pants: 0x1d1f22 });
  }

  offices(ctx) {
    const { B, y, h, box, lightAt, F, rng } = ctx, M = this.mats;
    const C = B.core, xL = -B.w / 2 + T, xR = B.w / 2 - T, zB = -B.d / 2 + T, zF = B.d / 2 - T;
    for (let x = C.x1 + 2.5; x < xR - 1.2; x += 3.6) for (let z = zB + 2; z < zF - 1.2; z += 3.4) {
      if (rng() < 0.12) continue;
      box(1.6, 0.75, 0.8, x, y, z, M.wood, true);
      box(0.6, 0.38, 0.04, x, y + 0.78, z - 0.25, M.tv);
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), M.monitor); sc.position.set(x, y + 0.97, z - 0.22); F.group.add(sc);
      box(0.5, 0.5, 0.5, x, y, z + 0.75, M.dark);
      if (rng() < 0.35 && F.npcs.length < 8) this.person(F, B, B.k.world(x, y, z + 0.8), B.yaw + Math.PI, { shirt: [0xf2f2ee, 0x9ec5e8, 0x2c3e5e][Math.floor(rng() * 3)], pants: 0x2a2c30 }, true);
    }
    for (let x = xL + 3; x < xR; x += 6) for (let z = zB + 3; z < zF; z += 6) lightAt(x, z, 1.4, 0.6);
    // a water cooler and plants by the stairs
    box(0.4, 1.2, 0.4, C.x1 + 1.2, y, C.z1 + 1.4, M.white, true);
    box(0.5, 0.5, 0.5, xR - 0.6, y, zF - 0.6, M.pot); const pl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), M.plant); pl.position.set(xR - 0.6, y + 1, zF - 0.6); F.group.add(pl);
    void h;
  }

  groundFloor(ctx) {
    const { B, y, box, lightAt, F, rng } = ctx, M = this.mats;
    const C = B.core, xL = -B.w / 2 + T, xR = B.w / 2 - T, zB = -B.d / 2 + T, zF = B.d / 2 - T;
    const x0 = C ? C.x1 + T : xL;
    for (let x = xL + 3; x < xR; x += 6) for (let z = zB + 3; z < zF; z += 6) lightAt(x, z, 1.4, 0.6);
    if (B.ground === 'store') {
      // a corner shop: aisles of shelves, a till by the door, somebody behind it
      const door = B.door ? this.local(B, B.door) : V3(0, 0, B.d / 2);
      const cx = Math.min(xR - 1.2, door.x + 3.2);
      box(2.6, 1.05, 0.8, cx, y, zF - 3.2, M.counter, true);
      box(2.7, 0.06, 0.9, cx, y + 1.05, zF - 3.2, M.stone);
      F.spots.push({ kind: 'till', at: B.k.world(cx, y, zF - 2.2) });
      this.person(F, B, B.k.world(cx, y, zF - 4.1), B.yaw, { shirt: 0x2f6f4a, pants: 0x1d1f22 });
      for (let z = zB + 3; z < zF - 6; z += 3.2) for (let x = x0 + 1.8; x < xR - 2; x += 7) {
        const len = Math.min(5.5, xR - 1 - x);
        if (len < 1.5) continue;
        box(len, 1.7, 0.7, x + len / 2, y, z, M.shelf, true);
        for (let k = 0; k < Math.floor(len / 0.5); k++) for (const sh of [0.35, 0.95]) if (rng() < 0.8) box(0.32, 0.3, 0.3, x + 0.3 + k * 0.5, y + sh, z + (rng() < 0.5 ? -0.25 : 0.25), this.items[Math.floor(rng() * this.items.length)]);
      }
      if (rng() < 0.6) this.person(F, B, B.k.world(x0 + 3 + rng() * (xR - x0 - 6), y, zB + 4.5 + rng() * 4), B.yaw + rng() * 6);
    } else {
      // a lobby: mailboxes, a bench, plants, a doormat
      const zm = B.room ? B.room.z0 - 1 : zF - 2;
      box(Math.min(4, xR - x0 - 1), 1.6, 0.35, x0 + 2.5, y + 0.5, zB + 0.25, M.mail);
      box(2, 0.45, 0.6, xR - 2, y, (zB + zm) / 2, M.wood, true);
      box(0.5, 0.5, 0.5, xR - 0.6, y, zB + 0.6, M.pot); const pl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), M.plant); pl.position.set(xR - 0.6, y + 1, zB + 0.6); F.group.add(pl);
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), M.rug[0]); mat.rotation.x = -Math.PI / 2; mat.position.set(B.door ? this.local(B, B.door).x : 0, y + 0.02, zF - 1); F.group.add(mat);
      const dir = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ map: this.labelTex(B.floors ? `FLOORS 1–${B.floors} ↑` : 'LOBBY') }));
      if (C) { dir.position.set(C.x1 + 0.17, y + 1.9, C.hole + 1); dir.rotation.y = Math.PI / 2; F.group.add(dir); }
      if (rng() < 0.5) this.person(F, B, B.k.world(x0 + 2 + rng() * 3, y, zm - 2), B.yaw + rng() * 6);
    }
  }

  person(F, B, at, yaw, look, sitting = false) {
    const g = this.game;
    const isl = islandAt(at.x, at.z, 4)?.id || 'city';
    const n = g.citizens.spawnCitizen(isl, 'escort', V3(at.x, at.y + 0.95, at.z), { look: look || randomLook() });
    if (!n) return null;
    n.faceYaw = yaw; n.heading = yaw; n.indoors = true; n.hp = 60; n.sit = sitting;
    F.npcs.push(n);
    return n;
  }

  tickNpcs() {
    const A = this.active, C = this.game.citizens;
    for (const F of A.floors.values()) F.npcs = F.npcs.filter((n) => C.list.includes(n));
  }

  // ---------------------------------------------------------------- rent
  price(B, u) {
    const area = (u.x1 - u.x0) * (u.z1 - u.z0);
    const base = PRICE[islandAt(B.x, B.z, 4)?.id] ?? 120;
    return Math.round((base * (0.6 + area / 60)) / 5) * 5;
  }

  save() { try { localStorage.setItem(RENT_KEY, JSON.stringify(this.rental)); } catch { /* storage unavailable */ } }

  // rent comes out every in-game day; miss it and you're out
  payRent() {
    const g = this.game, R = this.rental, dn = g.daynight;
    if (!R || !dn) { this.lastHour = dn?.hour ?? null; return; }
    if (this.lastHour == null) { this.lastHour = dn.hour; return; }
    let dh = dn.hour - this.lastHour; if (dh < 0) dh += 24;
    this.lastHour = dn.hour;
    if (dh > 12) return; // (a clock reset, not time passing)
    R.hoursLeft -= dh;
    if (R.hoursLeft > 0) return;
    const e = g.economy;
    if (e.money >= R.price) { e.addMoney(-R.price, `rent: apartment ${R.num}`); R.hoursLeft += 24; this.save(); }
    else {
      g.hud.toast(`You couldn't make the rent on apartment ${R.num}. The landlord's changed the locks.`, 0xff8a6a);
      this.rental = null; this.save();
      if (e.homeSpawn === 'rental') { e.homeSpawn = null; e.save(); }
      this.refreshActive();
    }
  }

  refreshActive() { const A = this.active; if (!A) return; const f = A.f; for (const k of [...A.floors.keys()]) this.dropFloor(k); A.f = -1; this.setFloor(f); }

  rent(spot) {
    const g = this.game, e = g.economy, B = this.active.B;
    const where = B.name ? B.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : islandAt(B.x, B.z, 4)?.name || 'Verian';
    const have = this.rental;
    e.open(`Apartment ${spot.num}`, e.header() + `<p class="lede">A ${spot.u.x1 - spot.u.x0 > 7 ? 'roomy' : 'snug'} place on floor ${spot.f} (${where}). A bed, a sofa and a telly, a kitchen, and a door that locks.</p>
      <p>Rent is <b>$${spot.price} a day</b>, the first day up front. It works like a home: sleep in the bed to make it home and you'll wake up here.${have ? ` <i>(You'd be giving up apartment ${have.num}.)</i>` : ''}</p>
      <div class="btns"><button data-a="rent" ${e.money >= spot.price ? '' : 'disabled'}>Rent it ($${spot.price})</button></div>`,
    (el) => el.addEventListener('click', (ev) => {
      if (!ev.target.closest('button[data-a="rent"]')) return;
      e.close();
      e.addMoney(-spot.price, `rent: apartment ${spot.num}`);
      this.rental = { id: B.id, f: spot.f, u: spot.u.i, num: spot.num, price: spot.price, hoursLeft: 24, where };
      this.save();
      e.homeSpawn = 'rental'; e.save();
      g.sfx.play('cash');
      g.hud.toast(`Apartment ${spot.num} is yours. $${spot.price} a day. Sleep in the bed to wake up here.`, 0x7be08a);
      this.refreshActive();
    }));
  }

  leaveRental() {
    const g = this.game, e = g.economy, R = this.rental;
    this.rental = null; this.save();
    if (e.homeSpawn === 'rental') { e.homeSpawn = null; e.save(); }
    g.hud.toast(`You hand back the keys to apartment ${R.num}.`, 0x9ec5ff);
    this.refreshActive();
  }

  // respawning / starting the game with a rented apartment as home
  wakeAtRental() {
    const g = this.game, R = this.rental;
    if (!R || g.economy.homeSpawn !== 'rental') return false;
    const B = BUILDINGS[R.id];
    if (!B?.core) return false;
    const u = this.units(B)[R.u];
    if (!u) return false;
    const { D, at } = this.uf(u);
    const [x, z] = at(0, Math.min(2.2, D / 2));
    const p = B.k.world(x, this.levelY(R.f) + 1.1, z);
    g.placeOnShore(p, B.yaw);
    g.hud.toast(`You wake up in apartment ${R.num}`, 0x7be08a);
    return true;
  }

  // ---------------------------------------------------------------- E
  action(pos) {
    const A = this.active, g = this.game;
    if (!A) return null;
    let best = null, bd = 1.6;
    for (const F of A.floors.values()) for (const s of F.spots) {
      const d = Math.hypot(s.at.x - pos.x, s.at.z - pos.z);
      if (d < bd && Math.abs(s.at.y + 1 - pos.y) < 1.6) { bd = d; best = s; }
    }
    if (!best) return null;
    const s = best;
    if (s.kind === 'lift') return { label: 'Call the lift', run: () => this.lift() };
    if (s.kind === 'till') return { label: 'Buy a snack', run: () => this.snacks() };
    if (s.kind === 'bed' && s.state === 'mine') return { label: 'Sleep', run: () => g.homes?.sleep({ id: 'rental', name: `apartment ${this.rental.num}` }) };
    if (s.kind === 'door') {
      if (s.state === 'rent') return { label: `Rent apartment ${s.num} ($${s.price}/day)`, run: () => this.rent(s) };
      if (s.state === 'mine') return { label: `Apartment ${s.num}: give up the lease`, run: () => this.leaveRental() };
      return { label: `Knock on ${s.num}`, run: () => { g.sfx.play('thud'); g.hud.toast(s.state === 'home' ? ['"Who is it? …Go away."', '"Not interested!"', '"We gave already."', '"I can hear you breathing out there."'][Math.floor(Math.random() * 4)] : 'Nobody answers.', 0xe8e2d4); } };
    }
    return null;
  }

  lift() {
    const g = this.game, e = g.economy, B = this.active.B;
    const btn = (f, label) => `<button data-f="${f}">${label}</button>`;
    const list = [btn(0, 'Ground'), ...Array.from({ length: B.floors }, (_, i) => btn(i + 1, `${i + 1}`)), btn(B.floors + 1, 'Roof')].join('');
    e.open('Lift', `<p class="lede">Which floor?</p><div class="btns lift-btns">${list}</div>`, (el) => el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-f]');
      if (!b) return;
      e.close();
      const f = +b.dataset.f, C = B.core;
      g.story.fade(() => {
        if (f > B.floors) g.placeOnShore(B.roofDoor.clone().add(V3(0, 1.1, 0)), B.yaw);
        else g.placeOnShore(B.k.world(C.x1 + 1.1, this.levelY(f) + 1.1, C.hole + 1.4), B.yaw);
        g.sfx.play('select');
      });
    }));
  }

  snacks() {
    const g = this.game, e = g.economy;
    e.open('Corner shop', e.header() + `<div class="btns">${SNACKS.map(([n, p], i) => `<button data-i="${i}" ${e.money >= p ? '' : 'disabled'}>${n} ($${p})</button>`).join('')}</div>`, (el) => el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]');
      if (!b) return;
      const [n, p, hp] = SNACKS[+b.dataset.i];
      if (e.money < p) return;
      e.addMoney(-p, n.toLowerCase());
      g.health.heal(hp);
      g.sfx.play('cash');
      g.hud.toast(`${n}: +${hp} health`, 0x7be08a);
      e.close();
    }));
  }
}

void LAND_Y;
