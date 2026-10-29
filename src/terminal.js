import * as THREE from 'three';
import { LAND_Y } from './world.js';
import { std, sign, solidBox, canvasTex } from './buildkit.js';
import { randomLook } from './figure.js';
import { AX, TERM } from './airport.js';

// Inside Verian International's terminal: three check-in islands, a café and a duty free shop,
// rows of seats facing the windows onto the stands, the departures boards, an information desk
// and the (closed to you) security lanes through to the gates. Travellers with suitcases come in
// through the front doors, queue, check in, wander about and sit, and leave again.
// They panic and scatter like anyone else if a gun goes off.

const Y = LAND_Y;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const P = (x, z) => V3(AX(x), Y, z); // (the airport's frame → the world)

const FLIGHTS = [
  ['VA 112', 'SALTMARSH SHUTTLE', '08:15', 'BOARDING'], ['VA 207', 'PORT HALYARD', '08:40', 'ON TIME'],
  ['SK 330', 'NEW CALLOWAY', '09:05', 'ON TIME'], ['VA 415', 'RIDGEBACK REGIONAL', '09:30', 'DELAYED'],
  ['PL 021', 'PELICAN BAY', '10:10', 'ON TIME'], ['VA 509', 'THE SCORCH (COPPER GULCH)', '10:45', 'ON TIME'],
  ['HX 3', 'PRIVATE CHARTER', '--:--', 'SEE AGENT'],
];

export class Terminal {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.people = [];
    this.staff = [];
    this.calmT = 0;
    this.build();
  }

  build() {
    const g = this.group, sb = this.game.portSandbox, T = TERM;
    const desk = std({ color: 0xe9e6de, roughness: 0.5 }), dark = std({ color: 0x2a2d33, roughness: 0.5 }), steel = std({ color: 0xa9adb1, metalness: 0.6, roughness: 0.35 });
    const navy = std({ color: 0x1f3b63, roughness: 0.6 }), seatM = std({ color: 0x3a6ea8, roughness: 0.6 });
    const box = (w, h, d, x, z, m, y = Y, collide = true) => solidBox(g, sb, w, h, d, AX(x), y, z, m, { collide });
    // ---- check-in: three islands, desks facing the doors, bag belts and airline boards behind ----
    this.queues = [];
    this.deskSpots = [];
    const airlines = [['VERIAN AIR', '#1f5fbf'], ['SKYLINK', '#c23b2a'], ['PELICAN AIRWAYS', '#2a8a5a']];
    [-1300, -1258, -1216].forEach((cx, i) => {
      box(26, 1.1, 1.2, cx, 474, desk);
      box(26, 0.5, 1, cx, 476.2, dark); // the bag belt
      box(26, 2.6, 0.4, cx, 478, navy);
      sign(g, `${airlines[i][0]} · CHECK-IN`, AX(cx), Y + 3.4, 477.7, Math.PI, { w: 12, h: 1.1, bg: airlines[i][1], fg: '#ffffff', glow: true });
      for (let k = -2; k <= 2; k += 2) { // little screens on the desks
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), new THREE.MeshBasicMaterial({ color: 0x9ec5ff }));
        s.position.set(AX(cx + k * 4), Y + 1.35, 473.6); g.add(s);
        this.deskSpots.push({ at: P(cx + k * 4, 475.4), face: Math.PI });
        this.queues.push({ at: P(cx + k * 4, 471.6), face: 0 });
      }
      // queue barriers: posts and belts
      for (let k = -12; k <= 12; k += 3) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), steel); p.position.set(AX(cx + k), Y + 0.48, 469.5); g.add(p); }
      const belt = new THREE.Mesh(new THREE.BoxGeometry(24, 0.08, 0.02), std({ color: 0x1f3b63 })); belt.position.set(AX(cx), Y + 0.88, 469.5); g.add(belt);
    });
    // ---- the departures boards, hanging over the hall ----
    const boardTex = canvasTex(512, 300, (c, w, h) => {
      c.fillStyle = '#0d1117'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd166'; c.font = 'bold 26px monospace'; c.fillText('DEPARTURES', 16, 34);
      c.font = 'bold 17px monospace';
      FLIGHTS.forEach(([f, to, t, st], i) => {
        const y = 70 + i * 32;
        c.fillStyle = '#e8e8e4'; c.fillText(f, 16, y); c.fillText(to.slice(0, 22), 110, y); c.fillText(t, 362, y);
        c.fillStyle = st === 'DELAYED' ? '#ff6a5a' : st === 'BOARDING' ? '#7be08a' : st === 'SEE AGENT' ? '#ffb36b' : '#9ec5ff'; c.fillText(st, 424, y);
      });
    });
    for (const [x, yaw, z] of [[-1258, Math.PI, 465.2], [-1258, 0, 465.8]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.3), new THREE.MeshBasicMaterial({ map: boardTex }));
      b.position.set(AX(x), Y + 7.5, z); b.rotation.y = yaw; g.add(b);
    }
    box(9.4, 5.7, 0.4, -1258, 465.5, dark, Y + 4.85, false);
    for (const s of [-1, 1]) box(0.08, 2.2, 0.08, -1258 + s * 4, 465.5, steel, Y + 9.7, false);
    // ---- seats facing the windows onto the stands ----
    this.seats = [];
    for (const cx of [-1300, -1262, -1224]) for (const z of [490, 495, 500]) {
      box(14, 0.45, 0.6, cx, z, seatM, Y, false); // (people sit on these; you can walk through the rows)
      box(14, 0.5, 0.12, cx, z - 0.35, seatM, Y + 0.45, false);
      for (let k = -6; k <= 6; k += 2) this.seats.push({ at: P(cx + k, z + 0.1), face: 0, sit: true });
    }
    // ---- the café and the duty free shop at the west end ----
    box(1, 1.1, 14, -1325, 462, desk);
    box(1, 1.1, 12, -1325, 488, desk);
    sign(g, 'SKY CAFÉ', AX(-1328.5), Y + 4, 462, Math.PI / 2, { w: 6, h: 1.2, bg: '#6a3a1a', fg: '#ffe7c0', glow: true });
    sign(g, 'DUTY FREE', AX(-1328.5), Y + 4, 488, Math.PI / 2, { w: 6, h: 1.2, bg: '#2c2f3a', fg: '#e8c547', glow: true });
    for (let z = 482; z <= 494; z += 3) box(0.6, 1.8, 2.2, -1329.3, z, std({ color: [0xc23b2a, 0x2a8a5a, 0xe8c547, 0x6a2a5a, 0x1f5fbf][(z / 3) % 5 | 0] }));
    for (const z of [457, 461, 465, 468]) { box(0.9, 0.75, 0.9, -1316, z, desk); this.seats.push({ at: P(-1314.8, z), face: -Math.PI / 2, sit: true }); }
    this.shopSpots = [{ at: P(-1323.6, 460), face: -Math.PI / 2 }, { at: P(-1323.6, 464), face: -Math.PI / 2 }, { at: P(-1323.6, 486), face: -Math.PI / 2 }, { at: P(-1323.6, 490), face: -Math.PI / 2 }];
    this.clerkSpots = [{ at: P(-1326.6, 462), face: Math.PI / 2 }, { at: P(-1326.6, 488), face: Math.PI / 2 }];
    // ---- information desk, and the security lanes to the gates (shut: boarding passes only) ----
    box(5, 1.1, 1.6, -1196, 462, desk);
    sign(g, 'i  INFORMATION', AX(-1196), Y + 3.1, 462, Math.PI, { w: 4.4, h: 0.8, bg: '#1f5fbf', fg: '#ffffff', glow: true });
    this.clerkSpots.push({ at: P(-1196, 463.6), face: Math.PI });
    for (let x = -1204; x <= -1180; x += 4) { box(0.4, 1.1, 5, x, 500, steel); }
    for (let x = -1202; x <= -1182; x += 4) box(3.6, 1.4, 0.1, x, 501.8, std({ color: 0x9ec5ff, transparent: true, opacity: 0.4 }));
    sign(g, 'GATES 1–12 · BOARDING PASS HOLDERS ONLY', AX(-1192), Y + 4.2, 497, Math.PI, { w: 11, h: 1, bg: '#1f3b63', fg: '#ffd166', glow: true });
    // pillars
    for (const x of [-1320, -1280, -1240, -1200]) for (const z of [466, 486]) box(0.8, TERM.h, 0.8, x, z, std({ color: 0xd8d8d4 }));
    this.gatherSpots = [{ at: P(-1262, 467.5), face: Math.PI }, { at: P(-1252, 468), face: Math.PI }, { at: P(-1258, 469), face: Math.PI }, { at: P(-1196, 459.8), face: 0 }, { at: P(-1192, 495), face: 0 }];
    this.entrances = [-1290, -1240, -1195].map((x) => ({ out: P(x, T.z0 - 5), in: P(x, T.z0 + 3) }));
  }

  // ---------------------------------------------------------------- the people
  near() { const p = this.game.shorePlayer.body.translation(); return Math.hypot(p.x - AX(-1250), p.z - 480) < 230; }

  spawnPerson(at, look, bag = true) {
    const C = this.game.citizens;
    const n = C.spawnCitizen('airport', 'escort', V3(at.x, Y + 0.95, at.z), { look: look || randomLook() });
    if (!n) return null;
    n.terminal = true; n.hp = 60; n.walkSpeed = 1.2 + Math.random() * 0.5;
    n.cash = 20 + Math.floor(Math.random() * 180);
    if (bag && Math.random() < 0.7) { // a wheelie suitcase
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.55, 0.24), std({ color: [0x2a2d33, 0x8a1a14, 0x1f5fbf, 0x3a6a3a, 0xc9a26a][Math.floor(Math.random() * 5)], roughness: 0.5 }));
      bag.position.set(0.42, -0.6, -0.35); bag.castShadow = true; n.fig.root.add(bag);
    }
    return n;
  }

  fill() {
    const g = this.game;
    // the staff behind the desks
    for (const s of [...this.deskSpots.filter((_, i) => i % 2 === 0), ...this.clerkSpots]) {
      const n = this.spawnPerson(s.at, { shirt: 0x1f3b63, pants: 0x1d1f22, skin: [0xd9a47c, 0x7a4f35, 0xf1c9a5, 0xa8724f][Math.floor(Math.random() * 4)], hat: null }, false);
      if (n) { n.faceYaw = s.face; n.heading = s.face; this.staff.push(n); }
    }
    for (let i = 0; i < 18; i++) {
      const spots = this.allSpots();
      const s = spots[Math.floor(Math.random() * spots.length)];
      const n = this.spawnPerson(s.at.clone().add(V3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)));
      if (n) { this.people.push(n); n.walkTo = s.at.clone(); n.goal = s; }
    }
    void g;
  }

  allSpots() { return [...this.queues, ...this.queues, ...this.seats, ...this.shopSpots, ...this.gatherSpots]; }

  idle(n, s) { n.walkTo = null; n.faceYaw = s.face; n.waitT = (s.sit ? 10 : 4) + Math.random() * 14; n.goal = s; n.sit = !!s.sit; }

  clear() {
    const C = this.game.citizens;
    for (const n of [...this.people, ...this.staff]) if (C.list.includes(n)) C.despawn(n);
    this.people = []; this.staff = [];
  }

  // a gun goes off nearby: everyone runs for it
  panic(from) {
    const C = this.game.citizens;
    for (const n of [...this.people, ...this.staff]) {
      if (!C.list.includes(n)) continue;
      n.walkTo = null; n.role = 'civ'; n.terminal = false;
      C.flee(n, from, 25);
    }
    this.people = []; this.staff = [];
    this.calmT = 60;
  }

  update(dt) {
    const g = this.game, C = g.citizens;
    if (this.calmT > 0) this.calmT -= dt;
    const near = this.near() && g.started && !g.net;
    if (!near) { if (this.people.length || this.staff.length) this.clear(); this.lastShot = g.lastShotT; return; }
    if (!this.people.length && !this.staff.length && this.calmT <= 0) this.fill();
    // gunfire in or by the terminal
    if (g.lastShotT !== this.lastShot) {
      this.lastShot = g.lastShotT;
      const p = g.shorePlayer.body.translation();
      if (Math.hypot(p.x - AX(-1250), p.z - 480) < 110) { this.panic(V3(p.x, p.y, p.z)); return; }
    }
    this.people = this.people.filter((n) => C.list.includes(n));
    for (const n of [...this.people]) {
      if (n.walkTo) { n.faceYaw = null; n.sit = false; continue; }
      if (n.arrived) {
        n.arrived = false;
        if (n.leaving === 'out') { C.despawn(n); continue; }
        if (n.leaving === 'door') { n.walkTo = n.next.clone(); n.leaving = 'out'; continue; }
        if (n.then) { n.walkTo = n.then.at.clone(); n.goal = n.then; n.then = null; continue; }
        this.idle(n, n.goal);
      }
      n.waitT -= dt;
      if (n.waitT > 0) continue;
      n.sit = false;
      // next: somewhere else in the hall, or home (out of the front doors)
      if (Math.random() < 0.12) { const e = this.entrances[Math.floor(Math.random() * 3)]; n.walkTo = e.in.clone(); n.leaving = 'door'; n.next = e.out; continue; }
      const spots = this.allSpots();
      const s = spots[Math.floor(Math.random() * spots.length)];
      n.walkTo = s.at.clone(); n.goal = s;
    }
    // new arrivals come in off the kerb
    this.arriveT = (this.arriveT ?? 3) - dt;
    if (this.arriveT <= 0 && this.people.length < 18) {
      this.arriveT = 4 + Math.random() * 6;
      const e = this.entrances[Math.floor(Math.random() * 3)];
      const n = this.spawnPerson(e.out);
      if (n) { this.people.push(n); const s = this.queues[Math.floor(Math.random() * this.queues.length)]; n.walkTo = e.in.clone(); n.goal = s; n.then = s; }
    }
  }
}
