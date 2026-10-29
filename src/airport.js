import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y, addPier } from './world.js';
import { std, sign, solidBox, canvasTex, speckle } from './buildkit.js';
import { curtainTex } from './architecture.js';
import { photoTex } from './park.js';
import { buildAirliner } from './planes.js';

// Verian International Airport: straight south of the city centre, across a short causeway from
// the end of the city's 5th street. Open again: a walk-in terminal (check-in, shops, seats and a
// departures board, busy with travellers; the Airport Authority's staff wing at its east end),
// planes taking off and landing, the hangars and the runway airside behind the fence.
//
// Everything here is laid out in the airport's own frame (where it used to stand, further west)
// and the whole lot is shifted east by AIRPORT_DX: AX(x) turns a local x into a world x.

const Y = LAND_Y;
export const AIRPORT_DX = 280;
export const AX = (x) => x + AIRPORT_DX;
// the terminal (local frame): the public hall at the west end, the staff wing at the east end
export const TERM = { x0: -1330, x1: -1110, z0: 452, z1: 506, h: 12, wing: -1172 };
export const RUNWAY = { x0: -1960, x1: -1160, z: 690, w: 45 };

export class Airport {
  constructor(game, sb) {
    this.game = game;
    this.isl = ISLANDS.find((i) => i.id === 'airport'); // (world frame)
    this.group = new THREE.Group();
    this.group.position.x = AIRPORT_DX;
    game.scene.add(this.group);
    // colliders go in at their world position
    this.sb = {
      addStaticCollider: (d) => { d.setTranslation(d.translation.x + AIRPORT_DX, d.translation.y, d.translation.z); return sb.addStaticCollider(d); },
    };
    this.mapRects = []; // for the map: { x0, x1, z0, z1, color } (world frame)
    this.build();
    for (const r of this.mapRects) { r.x0 += AIRPORT_DX; r.x1 += AIRPORT_DX; }
    this.traffic = new AirTraffic(game);
  }

  update(dt) { this.traffic.update(dt); }

  flat(w, d, x, z, mat, y = Y + 0.03, rot = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  build() {
    const g = this.group, sb = this.sb;
    const isl = { ...this.isl, x0: this.isl.x0 - AIRPORT_DX, x1: this.isl.x1 - AIRPORT_DX }; // (local)
    const base = import.meta.env.BASE_URL;
    const W = isl.x1 - isl.x0, D = isl.z1 - isl.z0;
    // ground
    const grass = std({ map: photoTex(`${base}assets/textures/grass.jpg`, W / 9, D / 9), roughness: 1 });
    const bank = std({ color: 0x8a8478 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 14, D), [bank, bank, grass, bank, bank, bank]);
    slab.position.set((isl.x0 + isl.x1) / 2, Y - 7, (isl.z0 + isl.z1) / 2);
    slab.receiveShadow = true;
    slab.userData.noMerge = true;
    g.add(slab);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(W / 2, 7, D / 2).setTranslation(slab.position.x, Y - 7, slab.position.z));

    const asphalt = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#3a3d41'; c.fillRect(0, 0, w, h); speckle(c, w, h, 300, 0.06); }, [1, 1]) });
    const concrete = std({ map: canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#b3b0a8'; c.fillRect(0, 0, w, h); speckle(c, w, h, 600, 0.06); c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); }, [450 / 12, 95 / 12]) });
    const white = std({ color: 0xeeeeea }), yellow = std({ color: 0xf2c418 });

    // ---- causeway from the end of the city's 5th street to the gate ----
    const cx0 = -1098, cx1 = -1082, cz0 = 208, cz1 = isl.z0 + 2;
    const cw = new THREE.Mesh(new THREE.BoxGeometry(cx1 - cx0, 2, cz1 - cz0), std({ color: 0x8a8680 }));
    cw.position.set((cx0 + cx1) / 2, Y - 1, (cz0 + cz1) / 2);
    cw.receiveShadow = true;
    g.add(cw);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((cx1 - cx0) / 2, 1, (cz1 - cz0) / 2).setTranslation(cw.position.x, Y - 1, cw.position.z));
    addPier(cx0 + AIRPORT_DX, cx1 + AIRPORT_DX, cz0, cz1);
    this.flat(cx1 - cx0 - 2, cz1 - cz0, (cx0 + cx1) / 2, (cz0 + cz1) / 2, asphalt, Y + 0.02);
    for (let z = cz0 + 4; z < cz1; z += 10) this.flat(0.3, 5, (cx0 + cx1) / 2, z, yellow, Y + 0.03);
    for (const x of [cx0 + 0.15, cx1 - 0.15]) solidBox(g, sb, 0.3, 1, cz1 - cz0, x, Y, (cz0 + cz1) / 2, std({ color: 0xcfcac0 }));
    this.mapRects.push({ x0: cx0, x1: cx1, z0: cz0, z1: cz1, color: '#55585e' });

    // ---- perimeter fence: the gate stands open now; airside is fenced off behind the terminal ----
    const F = { x0: isl.x0 + 4, x1: isl.x1 - 4, z0: isl.z0 + 4, z1: isl.z1 - 4 };
    const gate = { x0: cx0, x1: cx1 };
    const linkTex = canvasTex(64, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(190,195,200,0.9)'; c.lineWidth = 2;
      for (let i = -64; i < 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.stroke(); c.beginPath(); c.moveTo(i + 64, 0); c.lineTo(i, 64); c.stroke(); }
    });
    const FH = 3.2;
    const fenceRun = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) return;
      const t = linkTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2, FH / 2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, FH), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }));
      m.position.set((ax + bx) / 2, Y + FH / 2, (az + bz) / 2);
      m.rotation.y = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
      g.add(m);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(len / 2, FH / 2 + 0.6, 0.1).setTranslation(m.position.x, Y + FH / 2 + 0.6, m.position.z).setRotation(q));
      const post = std({ color: 0x8a9096, metalness: 0.5 });
      for (let s = 0; s <= len; s += 5) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, FH + 0.6, 6), post);
        p.position.set(ax + ((bx - ax) * s) / len, Y + (FH + 0.6) / 2, az + ((bz - az) * s) / len);
        g.add(p);
      }
      const wire = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), post);
      wire.position.set(m.position.x, Y + FH + 0.5, m.position.z);
      wire.rotation.y = m.rotation.y;
      g.add(wire);
    };
    fenceRun(F.x0, F.z0, gate.x0, F.z0);
    fenceRun(gate.x1, F.z0, F.x1, F.z0);
    fenceRun(F.x1, F.z0, F.x1, F.z1);
    fenceRun(F.x1, F.z1, F.x0, F.z1);
    fenceRun(F.x0, F.z1, F.x0, F.z0);
    // airside: a fence line either side of the terminal (the only way through is the staff wing)
    const T = TERM;
    fenceRun(F.x0, T.z1, T.x0, T.z1);
    fenceRun(T.x1, T.z1, F.x1, T.z1);
    sign(g, 'AIRSIDE · AUTHORISED STAFF ONLY', T.x1 + 20, Y + 2.2, T.z1 - 0.2, Math.PI, { w: 7, h: 0.8, bg: '#b3261e', fg: '#ffffff' });
    sign(g, 'AIRSIDE · AUTHORISED STAFF ONLY', T.x0 - 20, Y + 2.2, T.z1 - 0.2, Math.PI, { w: 7, h: 0.8, bg: '#b3261e', fg: '#ffffff' });
    // the open gate: two posts and a sign over the road
    const postM = std({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
    for (const x of [gate.x0 - 0.4, gate.x1 + 0.4]) solidBox(g, sb, 0.6, 7, 0.6, x, Y, F.z0, postM);
    solidBox(g, sb, gate.x1 - gate.x0 + 1.4, 0.6, 0.6, (gate.x0 + gate.x1) / 2, Y + 7, F.z0, postM, { collide: false });
    sign(g, 'VERIAN INTERNATIONAL AIRPORT', (gate.x0 + gate.x1) / 2, Y + 8.1, F.z0 - 0.35, Math.PI, { w: 14, h: 1.4, bg: '#1f3b63', fg: '#ffffff', glow: true });
    sign(g, 'WELCOME · DEPARTURES ✈', (gate.x0 + gate.x1) / 2, Y + 8.1, F.z0 + 0.35, 0, { w: 14, h: 1.4, bg: '#1f3b63', fg: '#ffffff' });
    this.gateAt = new THREE.Vector3(AIRPORT_DX + (gate.x0 + gate.x1) / 2, Y, F.z0);

    // ---- landside: the road in, along the front of the terminal, and the drop-off kerb ----
    this.flat(cx1 - cx0 - 2, 14, (cx0 + cx1) / 2, F.z0 + 7, asphalt);
    this.flat(T.x1 - T.x0 + 40, 12, (T.x0 + T.x1) / 2 + 10, 438, asphalt);
    for (let x = T.x0; x < T.x1 + 25; x += 8) this.flat(4, 0.25, x, 438, white, Y + 0.035);
    solidBox(g, sb, T.x1 - T.x0, 0.18, 7, (T.x0 + T.x1) / 2, Y, T.z0 - 3.5, std({ color: 0xc9c5bc }), { collide: false }); // the pavement out front
    this.mapRects.push({ x0: T.x0 - 20, x1: T.x1 + 30, z0: 432, z1: 444, color: '#55585e' });

    this.buildTerminal(white);
    this.mapRects.push({ x0: T.x0, x1: T.x1, z0: T.z0, z1: T.z1, color: '#9fb3c0', label: 'Terminal' });

    // control tower (airside)
    const towerM = std({ color: 0xd8d3c8 });
    solidBox(g, sb, 6, 30, 6, -1070, Y, 520, towerM);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.8, 5, 8), std({ color: 0x24465e, metalness: 0.6, roughness: 0.1 }));
    cab.position.set(-1070, Y + 32.5, 520);
    g.add(cab);
    solidBox(g, sb, 12, 0.6, 12, -1070, Y + 35, 520, std({ color: 0x5f666c }), { collide: false });

    // ---- apron, taxiway, runway ----
    this.flat(450, 79, -1335, 545.5, concrete, Y + 0.02);
    this.mapRects.push({ x0: -1560, x1: -1110, z0: 506, z1: 585, color: '#9a978f' });
    this.flat(20, 85, -1405, 627, asphalt, Y + 0.025);
    const RW = RUNWAY;
    const rwLen = RW.x1 - RW.x0;
    const rwTex = canvasTex(256, 64, (c, w, h) => {
      c.fillStyle = '#34373b'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, 0.07);
      c.fillStyle = '#e8e8e4'; c.fillRect(0, h / 2 - 1, w * 0.55, 2); // centre line dash
      c.fillRect(0, 2, w, 1.5); c.fillRect(0, h - 3.5, w, 1.5); // edge lines
    }, [rwLen / 60, 1]);
    this.flat(rwLen, RW.w, (RW.x0 + RW.x1) / 2, RW.z, std({ map: rwTex }), Y + 0.03);
    this.mapRects.push({ x0: RW.x0, x1: RW.x1, z0: RW.z - RW.w / 2, z1: RW.z + RW.w / 2, color: '#2f3236', label: 'Runway' });
    for (const end of [RW.x0 + 12, RW.x1 - 12]) for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1;
      this.flat(20, 1.6, end, RW.z + s * (4 + (i % 4) * 4.2), white, Y + 0.04);
    }
    // runway numbers and edge lights
    sign(g, '27', RW.x1 - 40, Y + 0.05, RW.z, 0, { w: 14, h: 9, bg: '#34373b', fg: '#e8e8e4' }).rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    sign(g, '09', RW.x0 + 40, Y + 0.05, RW.z, 0, { w: 14, h: 9, bg: '#34373b', fg: '#e8e8e4' }).rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    const lampM = new THREE.MeshBasicMaterial({ color: 0xfff1c8 });
    for (let x = RW.x0; x <= RW.x1; x += 40) for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 6), lampM); l.position.set(x, Y + 0.17, RW.z + s * (RW.w / 2 + 1)); g.add(l); }

    // ---- parked airliners at the stands behind the terminal ----
    const liveries = [0x1f5fbf, 0xc23b2a, 0x2a8a5a];
    [-1480, -1370, -1240].forEach((x, i) => this.airliner(x, 548, liveries[i]));

    // ---- hangars ----
    for (const hx of [-1720, -1840]) {
      const hz = 530;
      solidBox(g, sb, 70, 12, 45, hx, Y, hz, std({ color: 0xa9adb1 }));
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(22.5, 22.5, 70, 20, 1, false, 0, Math.PI), std({ color: 0x8a9096, metalness: 0.4, side: THREE.DoubleSide }));
      roof.rotation.z = Math.PI / 2;
      roof.scale.set(1, 1, 0.35);
      roof.position.set(hx, Y + 12, hz);
      roof.castShadow = true;
      g.add(roof);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(60, 10), std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#7d8084'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, 0, 1, h); } }) }));
      door.position.set(hx, Y + 5, hz + 22.56);
      g.add(door);
      this.mapRects.push({ x0: hx - 35, x1: hx + 35, z0: hz - 22.5, z1: hz + 22.5, color: '#8f969c' });
    }
  }

  // The terminal: a glass front with three sets of doors, a tall hall inside (Act II fits out the
  // staff wing at the east end; terminal.js fits out the hall and fills it with travellers).
  buildTerminal(white) {
    const g = this.group, sb = this.sb, T = TERM, H = T.h;
    const glassT = curtainTex('#7fb2c9', 1).clone(); glassT.needsUpdate = true; glassT.repeat.set(1, 1);
    const glass = std({ map: glassT, roughness: 0.2, metalness: 0.4 });
    const panel = std({ color: 0xd8d8d4, roughness: 0.6 }), inner = std({ color: 0xe9e6de, roughness: 0.8 });
    const wall = (w, d, x, z, m = panel, h = H) => solidBox(g, sb, w, h, d, x, Y, z, m);
    // the glass front, with three entrances (6 m wide, 4 m high) into the hall
    const doors = [-1290, -1240, -1195];
    let x = T.x0;
    for (const dx of [...doors, T.x1 + 3]) {
      const a = x, b = Math.min(T.x1, dx - 3);
      if (b > a) wall(b - a, 0.4, (a + b) / 2, T.z0, glass);
      if (dx < T.x1) solidBox(g, sb, 6, H - 4, 0.4, dx, Y + 4, T.z0, glass); // above the door
      x = dx + 3;
    }
    this.entrances = doors.map((dx) => new THREE.Vector3(AIRPORT_DX + dx, Y, T.z0 - 3));
    // the sides and the back (the back is glass too: the stands and the runway behind)
    wall(0.4, T.z1 - T.z0, T.x0, (T.z0 + T.z1) / 2);
    wall(0.4, T.z1 - T.z0, T.x1, (T.z0 + T.z1) / 2);
    wall(T.wing - T.x0, 0.4, (T.x0 + T.wing) / 2, T.z1, glass);
    // (the wing's back wall, with the staff door out onto the apron, is Act II's)
    // floor, ceiling, roof
    const floorT = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#d9d4ca'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); speckle(c, w, h, 300, 0.04); }, [(T.x1 - T.x0) / 4, (T.z1 - T.z0) / 4]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(T.x1 - T.x0, T.z1 - T.z0), std({ map: floorT, roughness: 0.35, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((T.x0 + T.x1) / 2, Y + 0.04, (T.z0 + T.z1) / 2); floor.receiveShadow = true; g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(T.x1 - T.x0, T.z1 - T.z0), std({ color: 0xf2f0ea, emissive: 0xf2f0ea, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set((T.x0 + T.x1) / 2, Y + H - 0.05, (T.z0 + T.z1) / 2); g.add(ceil);
    solidBox(g, sb, T.x1 - T.x0 + 10, 0.8, T.z1 - T.z0 + 10, (T.x0 + T.x1) / 2, Y + H, (T.z0 + T.z1) / 2, std({ color: 0xd8d8d4 }));
    // big skylight strips and hanging lights
    for (let lx = T.x0 + 12; lx < T.wing; lx += 18) for (const lz of [462, 478, 494]) { const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })); l.position.set(lx, Y + H - 0.2, lz); g.add(l); }
    // name on the front, over the doors
    sign(g, 'VERIAN INTERNATIONAL', (T.x0 + T.x1) / 2, Y + H - 2.2, T.z0 - 0.3, Math.PI, { w: 34, h: 3, bg: '#1f3b63', fg: '#ffffff', glow: true });
    for (const dx of doors) sign(g, 'DEPARTURES', dx, Y + 4.6, T.z0 - 0.3, Math.PI, { w: 5, h: 0.8, bg: '#f2c418', fg: '#15161a' });
    this.hall = { x0: AIRPORT_DX + T.x0 + 1, x1: AIRPORT_DX + T.wing - 1, z0: T.z0 + 1, z1: T.z1 - 1 };
    void white; void inner;
  }

  // is a (world) point inside the terminal building?
  inTerminal(p) { return p.x > AX(TERM.x0) && p.x < AX(TERM.x1) && p.z > TERM.z0 && p.z < TERM.z1 && p.y < LAND_Y + TERM.h; }

  // A parked twin-engine airliner, nose pointing north (-Z).
  airliner(x, z, livery) {
    const g = this.group, sb = this.sb;
    const white = std({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.2 });
    const liv = std({ color: livery, roughness: 0.5 });
    const dark = std({ color: 0x1a1d22, roughness: 0.3 });
    const grey = std({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
    const Y0 = Y + 4.2;
    const add = (geo, m, px, py, pz, rx = 0, ry = 0, rz = 0, sc = null) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x + px, py, z + pz);
      mesh.rotation.set(rx, ry, rz);
      if (sc) mesh.scale.set(...sc);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(new THREE.CylinderGeometry(2.4, 2.4, 30, 16), white, 0, Y0, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(2.4, 16, 10), white, 0, Y0, -15, 0, 0, 0, [1, 1, 1.7]);
    add(new THREE.ConeGeometry(2.4, 10, 16), white, 0, Y0 + 0.5, 20, Math.PI / 2, 0, 0, [1, 1, 0.7]);
    add(new THREE.BoxGeometry(1.8, 0.6, 0.3), dark, 0, Y0 + 1.1, -18.6, -0.6); // cockpit glass
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.05, 0.45, 25), dark, s * 2.38, Y0 + 0.7, 0); // windows
      add(new THREE.BoxGeometry(0.05, 0.5, 30), liv, s * 2.39, Y0 - 0.4, 0); // cheatline
      add(new THREE.BoxGeometry(15, 0.4, 5), white, s * 9.2, Y0 - 1.2, 0, 0, s * -0.32); // wing
      add(new THREE.CylinderGeometry(1.1, 1, 4.2, 14), grey, s * 7, Y0 - 2.6, -3, Math.PI / 2); // engine
      add(new THREE.BoxGeometry(6, 0.3, 2.5), white, s * 3.6, Y0 + 1.6, 21, 0, s * -0.3); // tailplane
      add(new THREE.CylinderGeometry(0.25, 0.25, 2.6, 8), dark, s * 2.5, 1.3 + Y - Y + Y, 1, 0, 0, Math.PI / 2 * 0); // main gear leg
      add(new THREE.CylinderGeometry(0.6, 0.6, 0.6, 12), dark, s * 2.5, Y + 0.6, 1, 0, 0, Math.PI / 2);
    }
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.4, 10), dark, 0, Y + 0.4, -12, 0, 0, Math.PI / 2); // nose wheel
    add(new THREE.CylinderGeometry(0.15, 0.15, 2.6, 8), dark, 0, Y + 1.6, -12);
    add(new THREE.BoxGeometry(0.4, 6.5, 5), liv, 0, Y0 + 4.5, 20.5, -0.35); // fin
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(2.4, 2.4, 20).setTranslation(x, Y0, z + 1));
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(16, 0.4, 3).setTranslation(x, Y0 - 1.2, z));
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(Y0 / 2, 0.6).setTranslation(x, Y0 / 2, z));
    this.mapRects.push({ x0: x - 17, x1: x + 17, z0: z - 19, z1: z + 24, color: '#e8e8e4', plane: true });
  }
}

// ---------------------------------------------------------------- planes coming and going
// A Verian Air airliner takes off from runway 27 every few minutes and another lands, purely for
// show (they don't collide with anything). Off while Act II's finale has the runway.
class AirTraffic {
  constructor(game) {
    this.game = game;
    const b = buildAirliner(0x1f5fbf, 'VERIAN AIR');
    this.mesh = b.root; this.gear = b.gear; this.flames = b.flames;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.state = 'wait'; this.t = 25; this.next = 'takeoff';
    this.pos = new THREE.Vector3(); this.speed = 0; this.pitch = 0;
  }

  get busy() { return this.game.story?.active?.id === 'm11'; }

  update(dt) {
    const R = RUNWAY, m = this.mesh, gy = Y + 1.95;
    if (this.busy) { m.visible = false; this.state = 'wait'; this.t = 30; return; }
    if (this.state === 'wait') {
      this.t -= dt;
      if (this.t > 0) return;
      this.state = this.next;
      if (this.state === 'takeoff') { this.pos.set(AX(R.x1 - 20), gy, R.z); this.speed = 0; this.pitch = 0; }
      else { this.pos.set(AX(R.x0 - 1600), gy + 1600 * Math.tan(0.05), R.z); this.speed = 72; this.pitch = -0.05; }
      m.visible = true;
    }
    if (this.state === 'takeoff') {
      this.speed = Math.min(this.speed + dt * 3.2, 85);
      if (this.speed > 62) this.pitch = Math.min(0.14, this.pitch + dt * 0.05);
      this.pos.x -= this.speed * Math.cos(this.pitch) * dt;
      this.pos.y = Math.max(gy, this.pos.y + this.speed * Math.sin(this.pitch) * dt);
      this.gear.visible = this.pos.y < gy + 60;
      if (this.pos.x < AX(R.x0 - 3500)) { this.state = 'wait'; this.next = 'land'; this.t = 50 + Math.random() * 40; m.visible = false; }
    } else if (this.state === 'land') {
      this.gear.visible = true;
      if (this.pos.y <= gy + 0.01) { this.pos.y = gy; this.pitch = 0; this.speed = Math.max(0, this.speed - dt * 6); } // rolling out
      else { this.pos.y = Math.max(gy, this.pos.y + this.speed * Math.sin(this.pitch) * dt); if (this.pos.y < gy + 8) this.pitch = Math.min(this.pitch + dt * 0.05, -0.01); }
      this.pos.x += this.speed * Math.cos(this.pitch) * dt;
      if (this.speed < 8 || this.pos.x > AX(R.x1 - 30)) { this.state = 'wait'; this.next = 'takeoff'; this.t = 60 + Math.random() * 40; m.visible = false; }
    }
    m.position.copy(this.pos);
    m.rotation.set(this.state === 'land' ? -this.pitch : this.pitch, this.state === 'land' ? -Math.PI / 2 : Math.PI / 2, 0, 'YXZ');
    const burn = this.state === 'takeoff' ? 1 : 0.3;
    for (const { f, glow } of this.flames) { f.visible = burn > 0.5; f.scale.set(0.8, 0.9, 0.8); f.position.z = 8.7 + 1.35; glow.visible = true; glow.scale.setScalar(1 + burn); }
  }
}
