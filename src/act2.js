import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAND_Y, islandAt } from './world.js';
import { std, canvasTex, sign, solidBox } from './buildkit.js';
import { Car } from './carphys.js';
import { Jet } from './jets.js';
import { buildAirliner, buildBizJet } from './planes.js';
import { ITEM_BY_ID } from './items.js';
import { CAR_MODELS, modelMesh } from './dealership.js';
import { DUMP } from './elmonstruo.js';

// ACT II: Fallout. The Chemist, the Ashen Hand's chemical weapons man, is flying a nerve agent out
// of Verian through the "closed" airport. Find out how, get in, and stop him.
//   m6  Paper Trail          the forger reads the papers; raid Doucet's lock-up
//   m7  The Clean-Up Crew    an ambush at the airliner wreck in the Scorch; chase the last car
//   m8  The Airport Manager  tail Harlan Pike, photograph his meeting, then blackmail him (stealth)
//   m9  Blueprints           break into the Airport Authority office for the hangar plans (stealth)
//   m10 Gate Crasher         walk the airport as ground crew: trackers, and the departure (stealth)
//   m11 Last Flight          steal an empty airliner, ram the Chemist's plane, eject, parachute down

const Y = LAND_Y;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const FIXER = 'Vic';

export const ACT2_KEY_ITEMS = {
  phone: { name: "Doucet's phone", desc: 'A cheap burner. One contact: "C". The messages are all times and places.' },
  keycard: { name: 'Unmarked keycard', desc: 'White plastic, no name, a magnetic strip and a tiny printed aeroplane.' },
  schedule: { name: 'Security schedule', desc: 'Guard rotas for Verian International. Hangar 3 is always "Ashen Hand (private)".' },
  photos: { name: 'Photos of Pike', desc: 'The airport manager, Harlan Pike, shaking hands with the Ashen Hand. Very clear.' },
  pass: { name: "Pike's airport pass", desc: 'HARLAN PIKE · AIRPORT MANAGER · ALL AREAS. It opens the airport gate.' },
  plans: { name: 'Hangar 3 blueprints', desc: 'The hangar, its office, the fuel lines, and a room marked "C. LAB" in red.' },
  flightplan: { name: "The Chemist's flight plan", desc: 'Departure 06:00, runway 27, a private jet. Cargo: "agricultural samples".' },
};

export const ACT2_MISSIONS = [
  {
    id: 'm6', title: 'Paper Trail', requires: 'm5',
    brief: `${FIXER}: "The papers from the lab. I found someone who can read them: Ines Moreau. She forges passports out of the back of the Liquor-Lotto in the Hollows. Take her the manifest and the blueprint."`,
    reward: 2000,
    passText: `${FIXER}: "A nerve agent. In Verian. … Okay. Doucet's phone is still getting messages. Keep it on you."`,
  },
  {
    id: 'm7', title: 'The Clean-Up Crew', requires: 'm6',
    brief: `${FIXER}: "Doucet's phone just lit up. Somebody wants to meet 'Rafe' at the old airliner wreck out in the Scorch. Whoever turns up knows how the airport works. Take a car, it's a long way."`,
    reward: 3000,
    passText: `${FIXER}: "Hangar 3, 'Ashen Hand (private)'. At a closed airport. Somebody runs that place, and he's on their payroll."`,
  },
  {
    id: 'm8', title: 'The Airport Manager', requires: 'm7', stealth: true,
    brief: `${FIXER}: "Harlan Pike, airport manager. Office in the city. He leaves every day at noon for a 'lunch meeting'. Follow him, don't let him see you, and get a photo of who he's lunching with. I've put a camera in your bag."`,
    reward: 3500,
    passText: `${FIXER}: "With his pass we can get through the gate. Now we need to know what's in that hangar."`,
  },
  {
    id: 'm9', title: 'Blueprints', requires: 'm8', stealth: true,
    brief: `${FIXER}: "The Airport Authority keeps the plans for every building in a safe in their office, on the airport's landside. Pike's pass opens the gate. Inside there are guards and cameras. If anyone sees you, it's over. Crouch (C), stay out of their light, and get the Hangar 3 plans."`,
    reward: 4000,
    passText: `${FIXER}: "A lab in a hangar. That's where he's cooking it. We need to know when he's moving it."`,
  },
  {
    id: 'm10', title: 'Gate Crasher', requires: 'm9', stealth: true,
    brief: `${FIXER}: "Ground crew wear hi-vis and hard hats, and nobody looks twice at ground crew. I've got you the uniform. Walk into Hangar 3 like you work there, put trackers on his jet and his fuel truck, and read the departure off the board. Don't run, don't get your gun out, don't get close to them."`,
    reward: 5000,
    passText: `${FIXER}: "Six in the morning, runway 27. And there's an empty airliner sitting on that runway that nobody's flown in months…"`,
  },
  {
    id: 'm11', title: 'Last Flight', requires: 'm10', act: 2,
    brief: `${FIXER}: "He's moved it up. He's going NOW. The airliner's on the runway, fuelled. Get in it, get up there, and stop that plane. Not with bullets: if that cargo comes apart in the air, it comes down on all of us."`,
    reward: 15000,
    passText: `${FIXER}: "…You're alive. And the Chemist burned up with every drop of it. Wren would be proud of you. I mean that."`,
  },
];

export class Act2 {
  constructor(game, story) {
    this.game = game;
    this.story = story;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.cones = [];
    this.cars = []; // mission cars (driven by the script, or coasting)
    this.build();
  }

  owns(id) { return ACT2_MISSIONS.some((m) => m.id === id); }

  // ---------------------------------------------------------------- places
  build() {
    const g = this.game;
    // the Hollows: Ines works out of the back of the Liquor-Lotto
    const shop = g.hood.interiors.find((i) => (i.name || '').includes('LIQUOR')) || g.hood.interiors[0];
    this.forgerAt = shop ? shop.door.clone() : V3(-421, Y, -1593);
    this.forgerOut = shop?.inside ? V3(shop.door.x - shop.inside.x, 0, shop.door.z - shop.inside.z).normalize() : V3(0, 0, -1);
    // Marsh Storage: a row of lock-ups on the grass behind Saltmarsh's town row
    this.yard = V3(-905, Y, -1236);
    this.buildLockups();
    // the Airport Authority office on the airport's landside, west of the terminal
    this.office = { x0: -1460, x1: -1420, z0: 440, z1: 466 };
    this.buildOffice();
    // Hangar 3 (the western hangar) gets its number, a concrete pad and a site office
    this.buildHangar3();
    // the gate: Pike's pass opens it
    const gp = g.airport?.gateParts;
    this.gate = { x: gp?.x ?? -1090, z: gp?.z ?? 424 };
    if (this.story.state.gateOpen) this.openGate(true);
  }

  buildLockups() {
    const g = this.group, sb = this.game.portSandbox, { x, z } = this.yard;
    const wall = std({ color: 0xb8b2a4, roughness: 0.9 }), door = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#5a7a9a'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 6) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, y, w, 1); } }), roughness: 0.6, metalness: 0.4 });
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(46, 26), std({ color: 0x8e8a82, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(x, Y + 0.04, z - 4); g.add(pad);
    this.lockups = [];
    for (let i = 0; i < 6; i++) {
      const ux = x - 18 + i * 7.2, uz = z + 4;
      solidBox(g, sb, 7, 3.2, 0.3, ux, Y, uz + 3, wall); // back
      solidBox(g, sb, 0.3, 3.2, 6, ux - 3.5, Y, uz, wall);
      if (i === 5) solidBox(g, sb, 0.3, 3.2, 6, ux + 3.5, Y, uz, wall);
      solidBox(g, sb, 7.3, 0.25, 6.3, ux, Y + 3.2, uz, std({ color: 0x5a5f66 }), { collide: false });
      const number = i + 3;
      sign(g, `${number}`, ux, Y + 2.85, uz - 3.05, Math.PI, { w: 0.7, h: 0.45, bg: '#f2f2ee', fg: '#15161a' });
      // unit 7 is Doucet's: its door rolls up for the mission
      const d = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.7, 0.08), door); d.position.set(ux, Y + 1.35, uz - 3); g.add(d);
      const col = sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(3.2, 1.35, 0.1).setTranslation(ux, Y + 1.35, uz - 3));
      this.lockups.push({ n: number, x: ux, z: uz, door: d, col });
    }
    sign(g, 'MARSH STORAGE · 24 HR', x, Y + 2.5, z - 17, Math.PI, { w: 6, h: 0.9, bg: '#2c3e5e', fg: '#ffffff', post: Y });
    // inside unit 7: a desk, a chair, a filing cabinet, crates
    const u = this.lockups.find((l) => l.n === 7);
    this.unit7 = u;
    solidBox(g, sb, 1.6, 0.8, 0.8, u.x + 1.5, Y, u.z + 1.8, std({ color: 0x6a4a30 }));
    solidBox(g, sb, 0.5, 1.4, 0.6, u.x - 2.6, Y, u.z + 2.2, std({ color: 0x5a6068, metalness: 0.4 }));
    for (const [cx, cz] of [[-2.2, -0.5], [-1.4, 0.6]]) solidBox(g, sb, 1, 0.9, 1, u.x + cx, Y, u.z + cz, std({ color: 0x8a6a48 }));
    this.deskPapers = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.35), std({ color: 0xf2efe6 }));
    this.deskPapers.position.set(u.x + 1.4, Y + 0.84, u.z + 1.7); g.add(this.deskPapers);
  }

  setLockupOpen(open) {
    const u = this.unit7;
    u.door.position.y = Y + (open ? 3.0 : 1.35);
    u.door.scale.y = open ? 0.15 : 1;
    u.col.setEnabled(!open);
  }

  buildOffice() {
    const g = this.group, sb = this.game.portSandbox, O = this.office, H = 3.4, T = 0.3;
    const wallM = std({ color: 0xd8d4cc, roughness: 0.85 }), outer = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#b9bcc0'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, y, w, 1); } }, [4, 1]), roughness: 0.8 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(O.x1 - O.x0, O.z1 - O.z0), std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#6a6e74'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(0,0,0,.2)'; c.strokeRect(0, 0, w, h); }, [10, 6]), roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((O.x0 + O.x1) / 2, Y + 0.05, (O.z0 + O.z1) / 2); g.add(floor);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(O.x1 - O.x0 + 0.6, 0.3, O.z1 - O.z0 + 0.6), std({ color: 0x4a4f55 }));
    roof.position.set((O.x0 + O.x1) / 2, Y + H + 0.15, (O.z0 + O.z1) / 2); g.add(roof);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(O.x1 - O.x0, O.z1 - O.z0), std({ color: 0xe8e6e0, emissive: 0xe8e6e0, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set((O.x0 + O.x1) / 2, Y + H - 0.02, (O.z0 + O.z1) / 2); g.add(ceil);
    // a wall from (ax, az) to (bx, bz) (axis-aligned), with door gaps at the given offsets along it
    const wallRun = (ax, az, bx, bz, gaps = [], m = wallM) => {
      const horiz = az === bz, len = Math.abs(horiz ? bx - ax : bz - az), s0 = Math.min(horiz ? ax : az, horiz ? bx : bz);
      const cuts = [...gaps].sort((p, q) => p - q);
      let at = 0;
      for (const c of [...cuts, len + 0.9]) {
        const a = at, b = Math.min(len, c - 0.9);
        if (b - a > 0.05) {
          const mid = s0 + (a + b) / 2;
          if (horiz) solidBox(g, sb, b - a, H, T, mid, Y, az, m); else solidBox(g, sb, T, H, b - a, ax, Y, mid, m);
        }
        at = c + 0.9;
      }
      for (const c of cuts) { const mid = s0 + c; if (horiz) solidBox(g, sb, 1.8, 0.8, T, mid, Y + H - 0.8, az, m); else solidBox(g, sb, T, 0.8, 1.8, ax, Y + H - 0.8, mid, m); } // lintels
    };
    // outside: the front door faces north (towards the fence and the road)
    wallRun(O.x0, O.z0, O.x1, O.z0, [6], outer);
    wallRun(O.x0, O.z1, O.x1, O.z1, [], outer);
    wallRun(O.x0, O.z0, O.x0, O.z1, [], outer);
    wallRun(O.x1, O.z0, O.x1, O.z1, [], outer);
    // inside: the lobby (west), a corridor down the middle, offices either side, records at the east end
    const zc0 = 450, zc1 = 456; // corridor
    wallRun(O.x0 + 12, O.z0, O.x0 + 12, zc0, [5]);
    wallRun(O.x0 + 12, zc1, O.x0 + 12, O.z1, [4]);
    wallRun(O.x0 + 12, zc0, O.x1, zc0, [8, 20]);
    wallRun(O.x0 + 12, zc1, O.x1, zc1, [8, 15, 22]);
    wallRun(O.x0 + 22, O.z0, O.x0 + 22, zc0, []);
    wallRun(O.x0 + 22, zc1, O.x0 + 22, O.z1, []);
    wallRun(O.x1 - 8, zc1, O.x1 - 8, O.z1, []); // records room: x1-8 .. x1, south of the corridor
    sign(g, 'VERIAN AIRPORT AUTHORITY', O.x0 + 6, Y + H - 0.4, O.z0 - 0.2, Math.PI, { w: 9, h: 0.9, bg: '#1f3b63', fg: '#ffffff' });
    sign(g, 'RECORDS', O.x1 - 4, Y + 2.5, zc1 + 0.18, 0, { w: 2.4, h: 0.5, bg: '#2c3e5e', fg: '#ffffff' });
    // furniture: reception desk, desks and filing cabinets to hide behind
    const desk = std({ color: 0x6a5a48 }), cab = std({ color: 0x8a9096, metalness: 0.4 });
    solidBox(g, sb, 4, 1.1, 1, O.x0 + 6, Y, O.z0 + 6, desk);
    for (const [x, z] of [[O.x0 + 15, 445], [O.x0 + 19, 446], [O.x0 + 15, 462], [O.x0 + 19, 461], [O.x0 + 26, 445], [O.x0 + 30, 446], [O.x0 + 25, 462]]) solidBox(g, sb, 2, 1.05, 1, x, Y, z, desk);
    for (const [x, z] of [[O.x0 + 13, 441.2], [O.x0 + 20.5, 464.8], [O.x0 + 34, 441.2], [O.x1 - 1, 459.5], [O.x1 - 6.5, 464.8]]) solidBox(g, sb, 0.9, 1.6, 0.6, x, Y, z, cab);
    for (const [x, z] of [[O.x0 + 3, 452.5], [O.x0 + 9, 459]]) solidBox(g, sb, 1.2, 1.2, 0.6, x, Y, z, std({ color: 0x3a6a3a })); // planters
    // the safe in records
    this.safe = V3(O.x1 - 1, Y, 463.5);
    solidBox(g, sb, 1, 1.2, 0.9, this.safe.x, Y, this.safe.z, std({ color: 0x2a2c30, metalness: 0.6, roughness: 0.4 }));
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), std({ color: 0xc8ccd0, metalness: 0.8 })); dial.rotation.z = Math.PI / 2; dial.position.set(this.safe.x - 0.52, Y + 0.7, this.safe.z); g.add(dial);
    // ceiling lights
    for (const x of [O.x0 + 6, O.x0 + 17, O.x0 + 28, O.x1 - 4]) for (const z of [445, 453, 461]) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.35), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })); l.position.set(x, Y + H - 0.05, z); g.add(l); }
    this.officeDoor = V3(O.x0 + 6, Y, O.z0 - 1.5);
    this.officeInside = (p) => p.x > O.x0 && p.x < O.x1 && p.z > O.z0 && p.z < O.z1;
  }

  buildHangar3() {
    const g = this.group, sb = this.game.portSandbox;
    this.h3 = V3(-1840, Y, 530);
    sign(g, 'HANGAR 3', -1840, Y + 10.6, 552.6, 0, { w: 8, h: 1.6, bg: '#f2f2ee', fg: '#15161a' });
    sign(g, 'HANGAR 2', -1720, Y + 10.6, 552.6, 0, { w: 8, h: 1.6, bg: '#f2f2ee', fg: '#15161a' });
    sign(g, 'PRIVATE · NO ADMITTANCE', -1840, Y + 2.2, 553, 0, { w: 6, h: 0.7, bg: '#b3261e', fg: '#ffffff' });
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), std({ color: 0x9a978f, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(-1810, Y + 0.035, 584); g.add(pad);
    // the site office: a portakabin with the departures board inside (well, on its wall)
    const cabin = std({ color: 0xd8d0b0 });
    solidBox(g, sb, 6, 2.8, 3, -1885, Y, 572, cabin);
    sign(g, 'SITE OFFICE', -1885, Y + 2.4, 573.55, 0, { w: 2.6, h: 0.45, bg: '#2c3e5e', fg: '#ffffff' });
    this.board = V3(-1885, Y, 574.3);
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(256, 140, (c, w, h) => { c.fillStyle = '#10141a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd166'; c.font = 'bold 16px monospace'; ['DEPARTURES', 'HX-3  06:00  RWY 27', 'CARGO: AGRI SAMPLES', 'CREW: C. + 2'].forEach((t, i) => c.fillText(t, 12, 28 + i * 30)); }) }));
    bd.position.set(-1885, Y + 1.5, 573.56); g.add(bd);
    // a fuel bowser by the pad
    const truck = new THREE.Group(); truck.position.set(-1790, Y, 590); truck.rotation.y = Math.PI / 2; g.add(truck);
    const tb = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; truck.add(o); };
    tb(2.4, 2.2, 2.4, 0, 1.6, -3, std({ color: 0xe8e4d4 }));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 16), std({ color: 0xd8dde2, metalness: 0.6, roughness: 0.3 })); tank.rotation.x = Math.PI / 2; tank.position.set(0, 1.9, 1.5); truck.add(tank);
    for (const z of [-3, 0, 3]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), std({ color: 0x15161a })); w.rotation.z = Math.PI / 2; w.position.set(s * 1.2, 0.5, z); truck.add(w); }
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(4.5, 1.6, 1.3).setTranslation(-1790, Y + 1.6, 590));
    this.fuelTruck = V3(-1790, Y, 590);
    this.jetSpot = { x: -1835, z: 590, yaw: Math.PI / 2 };
  }

  openGate(silent = false) {
    const ap = this.game.airport;
    if (!ap?.gateParts) return;
    for (const m of ap.gateParts.meshes) { m.visible = false; }
    ap.gateParts.col?.setEnabled(false);
    if (!silent) { this.game.sfx.play('switch'); this.game.hud.toast('The gate buzzes and slides open', 0x7be08a); }
    this.story.state.gateOpen = true; this.story.save();
  }

  // ---------------------------------------------------------------- shared bits
  say(lines, title, then) { // a conversation, in the phone's call screen style
    this.story.phone.ring(title, lines, then);
    this.story.phone.open('call');
    this.story.phone.act('answer');
  }

  nearP(p, q, r) { return q && Math.hypot(p.x - q.x, p.z - q.z) < r && Math.abs(p.y - q.y) < 3.5; }

  ground(x, z, from = 200) {
    const sb = this.game.portSandbox;
    const hit = sb.world.castRay(new RAPIER.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 }), from + 50, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
    return hit ? from - hit.timeOfImpact : Y;
  }

  give(id) { this.story.giveKeyItem(id); }

  ensureCamera() {
    const g = this.game;
    if (g.held?.id === 'camera' || g.economy.bag.includes('camera')) return;
    g.economy.stash(ITEM_BY_ID.camera, true);
    g.hud.toast(`${FIXER} put a camera in your bag (Tab to take it out)`, 0xffd166);
  }

  goonsAlive(a) { return (a.goons || []).filter((n) => this.game.citizens.list.includes(n)); }

  // ---------------------------------------------------------------- stealth
  // A guard who walks a route (or stands and looks around), with a vision cone on the ground.
  spawnGuard(a, at, opts = {}) {
    const g = this.game;
    const look = opts.look || { shirt: 0x1d1f22, pants: 0x2a2c30, skin: [0xd9a47c, 0x7a4f35, 0xf1c9a5][Math.floor(Math.random() * 3)], hat: 'cap', hatColor: 0x111111 };
    const n = g.citizens.spawnCitizen(islandAt(at.x, at.z, 6)?.id || 'city', 'escort', V3(at.x, this.ground(at.x, at.z, at.y + 6), at.z), { look });
    if (!n) return null;
    n.guard = { route: opts.route || null, pauseAt: opts.pauseAt || null, i: 0, wait: 0, alert: 0, fov: opts.fov ?? 0.62, range: opts.range ?? 15, base: opts.facing ?? 0, sweep: opts.sweep ?? 0.9, phase: Math.random() * 6 };
    n.faceYaw = opts.facing ?? 0; n.heading = n.faceYaw;
    n.walkSpeed = opts.speed ?? 1.4;
    n.hp = opts.hp ?? 120;
    n.cone = this.makeCone(n.guard.range, n.guard.fov);
    n.name = opts.name;
    (a.guards ||= []).push(n);
    return n;
  }

  // a security camera on a wall: a box and a sweeping cone
  addCamera(a, pos, facing, sweep = 0.8, range = 12) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.45), std({ color: 0xe8e8e4 }));
    m.position.copy(pos); this.group.add(m);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(0, 0.06, 0.24); m.add(led);
    const cam = { pos: pos.clone(), base: facing, sweep, range, fov: 0.5, alert: 0, mesh: m, cone: this.makeCone(range, 0.5), phase: Math.random() * 6, heading: facing };
    (a.cams ||= []).push(cam);
    return cam;
  }

  makeCone(range, fov) {
    const geo = new THREE.CircleGeometry(range, 24, -Math.PI / 2 - fov, fov * 2); // (centred on +Z once laid flat)
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 2;
    this.group.add(m);
    this.cones.push(m);
    return m;
  }

  disguised() { const L = this.game.style?.look; return this.a?.disguise && L?.outfit === 'hivis' && L?.hat === 'hardhat'; }

  // Can a guard (or camera) at `eye`, facing `heading`, see you? Returns 0..1 (how clearly).
  sees(eye, heading, range, fov, p) {
    const g = this.game, pl = g.shorePlayer;
    const crouch = pl.crouch ? 0.6 : 1;
    const target = V3(p.x, p.y + (pl.crouch ? 0.05 : 0.55), p.z);
    const dx = target.x - eye.x, dz = target.z - eye.z, d = Math.hypot(dx, dz);
    if (d > range * crouch) return 0;
    const ang = Math.atan2(dx, dz) - heading;
    if (Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) > fov) return 0;
    const sb = g.portSandbox, dy = target.y - eye.y, L = Math.hypot(dx, dy, dz);
    const hit = sb.world.castRay(new RAPIER.Ray({ x: eye.x, y: eye.y, z: eye.z }, { x: dx / L, y: dy / L, z: dz / L }), L - 0.3, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
    if (hit) return 0;
    return 1 - d / (range * crouch) * 0.6;
  }

  updateStealth(a, dt, p) {
    const g = this.game, C = g.citizens;
    let worst = 0, who = null;
    const disg = this.disguised(), pl = g.shorePlayer;
    const suspicious = !disg || pl.running || g.held?.gun || g.police.wanted > 0;
    for (const n of [...(a.guards || [])]) {
      const G = n.guard, alive = C.list.includes(n);
      if (!alive) { if (n.cone) { n.cone.visible = false; } continue; }
      // walk the route, pausing at each point to look around
      if (G.route) {
        if (n.arrived || (!n.walkTo && G.wait <= 0)) {
          if (n.arrived) { n.arrived = false; G.wait = !G.pauseAt || G.pauseAt.includes(G.i) ? 1.5 + Math.random() * 2 : 0.01; G.base = n.heading; n.faceYaw = n.heading; }
          else { G.i = (G.i + 1) % G.route.length; n.walkTo = G.route[G.i]; n.faceYaw = null; }
        }
        if (G.wait > 0) { G.wait -= dt; n.faceYaw = G.base + Math.sin((G.phase += dt * 1.4)) * G.sweep; if (G.wait <= 0) { G.i = (G.i + 1) % G.route.length; n.walkTo = G.route[G.i]; n.faceYaw = null; } }
      } else if (G.sweep) { n.faceYaw = G.base + Math.sin((G.phase += dt * 0.7)) * G.sweep; }
      const t = n.body.translation();
      const eye = V3(t.x, t.y + 0.7, t.z);
      let s = this.sees(eye, n.heading, G.range, G.fov, p);
      if (s && !suspicious) s = Math.hypot(p.x - t.x, p.z - t.z) < 3.2 ? s * 0.6 : 0; // ground crew: only if you get right up close
      G.alert = s ? Math.min(1.2, G.alert + dt * (0.4 + s * 1.1)) : Math.max(0, G.alert - dt * 0.35);
      if (G.alert > worst) { worst = G.alert; who = n; }
      C.setMarker(n, G.alert >= 1 ? '!' : G.alert > 0.12 ? '?' : null);
      n.cone.visible = true;
      n.cone.position.set(t.x, t.y - 0.72, t.z);
      n.cone.rotation.y = n.heading;
      n.cone.material.color.setRGB(1, 0.9 - G.alert * 0.7, 0.4 - G.alert * 0.35);
      n.cone.material.opacity = 0.2 + G.alert * 0.25;
    }
    for (const c of a.cams || []) {
      c.heading = c.base + Math.sin((c.phase += dt * 0.5)) * c.sweep;
      c.mesh.rotation.y = c.heading;
      const s = this.sees(c.pos, c.heading, c.range, c.fov, p);
      c.alert = s ? Math.min(1.2, c.alert + dt * (0.5 + s * 1.2)) : Math.max(0, c.alert - dt * 0.4);
      if (c.alert > worst) { worst = c.alert; who = c; }
      c.cone.position.set(c.pos.x, Y + 0.13, c.pos.z);
      c.cone.rotation.y = c.heading;
      c.cone.material.color.setRGB(1, 0.9 - c.alert * 0.7, 0.4 - c.alert * 0.35);
    }
    a.detect = worst;
    if (worst >= 1) { this.story.end(false, who?.mesh ? 'A security camera saw you' : 'You were spotted'); return true; }
    return false;
  }

  clearStealth(a) {
    for (const n of a.guards || []) { if (this.game.citizens.list.includes(n)) this.game.citizens.despawn(n); n.cone?.removeFromParent(); }
    for (const c of a.cams || []) { c.mesh.removeFromParent(); c.cone.removeFromParent(); }
    a.guards = []; a.cams = [];
  }

  // ---------------------------------------------------------------- the mission plumbing
  start(a) {
    const g = this.game;
    this.a = a;
    a.goons = []; a.guards = []; a.cams = [];
    const gun = () => { if (!(g.held?.gun || g.economy.bag.some((x) => ITEM_BY_ID[x]?.gun))) { g.giveItem(ITEM_BY_ID.pistol); g.hud.toast(`${FIXER} left you a pistol`, 0xffd166); } if ((g.economy.ammo.pistolAmmo || 0) < 48) g.economy.addAmmo('pistolAmmo', 48); };
    if (a.id === 'm6') { gun(); a.stage = 'forger'; this.spawnForger(a); this.setLockupOpen(false); this.deskPapers.visible = true; }
    if (a.id === 'm7') { gun(); a.stage = 'call'; a.callT = 2; }
    if (a.id === 'm8') { this.ensureCamera(); a.stage = 'office'; this.setupPike(a); }
    a.lastShot = g.lastShotT;
    if (a.id === 'm9') { a.stage = this.story.state.gateOpen ? 'office' : 'gate'; this.setupOffice(a); }
    if (a.id === 'm10') { a.stage = this.story.state.gateOpen ? 'hangar' : 'gate'; a.done = {}; this.setupHangar(a); this.wearUniform(a, true); }
    if (a.id === 'm11') { a.stage = 'board'; this.setupFlight(a); }
  }

  end(a, pass) {
    const g = this.game;
    this.clearStealth(a);
    for (const n of a.goons || []) if (g.citizens.list.includes(n)) g.citizens.despawn(n);
    for (const n of [a.forger, a.pike, a.chemist]) if (n && g.citizens.list.includes(n)) g.citizens.despawn(n);
    for (const c of this.cars) {
      // Pike's car stays where he left it, as an ordinary parked car
      if (c === a.pcar && !c.wreck) { g.vehicles.parked.push(c); continue; }
      c.dispose();
    }
    this.cars = [];
    if (a.jet) { a.jet.mesh.removeFromParent(); if (a.jet.col) { g.portSandbox.staticColliders.delete(a.jet.col.handle); g.portSandbox.world.removeCollider(a.jet.col, false); } }
    if (a.id === 'm10') this.wearUniform(a, false);
    if (a.id === 'm11') this.clearFlight(a, pass);
    if (a.marker) a.marker.removeFromParent();
    this.a = null;
  }

  // ---------------------------------------------------------------- E actions
  action(pos, a) {
    const g = this.game;
    if (!a || !this.owns(a.id)) {
      // the gate, any time after it's been opened once (or with the pass)
      if (!this.story.state.gateOpen && this.story.has('pass') && this.nearP(pos, V3(this.gate.x, Y, this.gate.z - 2), 6)) return { label: "Swipe Pike's pass at the gate", run: () => this.openGate() };
      return null;
    }
    if (!this.story.state.gateOpen && this.story.has('pass') && this.nearP(pos, V3(this.gate.x, Y, this.gate.z - 2), 6)) return { label: "Swipe Pike's pass at the gate", run: () => { this.openGate(); if (a.stage === 'gate') a.stage = a.id === 'm9' ? 'office' : 'hangar'; } };
    if (a.id === 'm6') {
      if (a.stage === 'forger' && a.forger && this.nearP(pos, a.forger.body.translation(), 3.5)) return { label: 'Show Ines the papers', run: () => this.forgerTalk(a) };
      if (a.stage === 'search' && this.nearP(pos, this.deskPapers.position, 2.2)) return { label: "Search Doucet's desk", run: () => {
        this.deskPapers.visible = false;
        this.give('phone'); this.give('keycard');
        g.hud.toast('A burner phone and a keycard with a little aeroplane on it. Doucet travelled light.', 0xe8e2d4);
        a.stage = 'leave';
      } };
    }
    if (a.id === 'm7' && a.stage === 'grab' && a.suv && this.nearP(pos, a.suv.pos, 4)) return { label: 'Search the wreck', run: () => { this.give('schedule'); g.hud.toast(ACT2_KEY_ITEMS.schedule.desc, 0xe8e2d4); this.story.end(true); } };
    if (a.id === 'm8' && a.stage === 'confront' && a.pike && g.citizens.list.includes(a.pike) && this.nearP(pos, a.pike.body.translation(), 3)) return { label: 'Show Pike the photos', run: () => this.blackmail(a) };
    if (a.id === 'm9' && a.stage === 'office' && this.nearP(pos, this.safe, 1.9)) return { label: '(hold E) Crack the safe', hold: true, run: () => { a.cracking = true; } };
    if (a.id === 'm10' && a.stage === 'hangar') {
      if (!a.done.jet && a.jet && this.nearP(pos, a.jet.pos, 9.5)) return { label: "Stick a tracker under the Chemist's jet", run: () => { a.done.jet = true; g.sfx.play('select'); g.hud.toast('Tracker on. Small, magnetic, and very hard to spot.', 0x9ec5ff); } };
      if (!a.done.truck && this.nearP(pos, this.fuelTruck, 5)) return { label: 'Stick a tracker on the fuel truck', run: () => { a.done.truck = true; g.sfx.play('select'); g.hud.toast('Tracker on. Wherever the fuel goes, he goes.', 0x9ec5ff); } };
      if (!a.done.board && this.nearP(pos, this.board, 2.6)) return { label: 'Read the departures board', run: () => { a.done.board = true; this.give('flightplan'); g.hud.toast('HX-3 · 06:00 · runway 27. "Agricultural samples".', 0xe8e2d4); } };
    }
    if (a.id === 'm11' && a.stage === 'board' && a.plane && Math.hypot(pos.x - a.plane.pos.x, pos.z - a.plane.pos.z) < 22) return { label: 'Climb aboard the airliner and take the controls', run: () => g.jets.enter(a.plane) };
    return null;
  }

  // ---------------------------------------------------------------- the update
  update(a, p, dt) {
    if (a.id === 'm9' && this.game.lastShotT !== a.lastShot) { this.story.end(false, 'Gunfire! The alarm is going off'); return; }
    const fn = { m6: this.updM6, m7: this.updM7, m8: this.updM8, m9: this.updM9, m10: this.updM10, m11: this.updM11 }[a.id];
    fn?.call(this, a, p, dt);
  }

  // ---------------------------------------------------------------- m6: Paper Trail
  spawnForger(a) {
    const g = this.game, d = this.forgerAt;
    const o = this.forgerOut, at = d.clone().addScaledVector(o, 1.2).add(V3(o.z, 0, -o.x).multiplyScalar(2.2));
    const n = g.citizens.spawnCitizen('hood', 'escort', V3(at.x, Y + 0.3, at.z), { look: { shirt: 0x6a2a5a, pants: 0x2c3440, skin: 0xa8724f, hat: 'beret', hatColor: 0x15161a, glasses: 'black' } });
    if (n) { n.faceYaw = Math.atan2(o.x, o.z); n.heading = n.faceYaw; n.hp = 1e6; n.cash = 0; n.items = []; a.forger = n; }
  }

  forgerTalk(a) {
    a.stage = 'talk';
    this.say([
      'Ines: "So you\'re the one who sank the Halvard. Sit. Let me see."',
      'Ines: "The manifest is easy. Half the crates went to Hangar 3 at Verian International. The airport\'s been closed for months, but somebody unloads trucks there every night."',
      'Ines: "The blueprint\'s other half isn\'t a building. It\'s a flight plan. And this, in the margin… this is a recipe."',
      'Ines: "It\'s a nerve agent. The man who wrote it signs himself \'the Chemist\'. He\'s Ashen Hand, and the bomb at Verian Central was his. This would be worse. Much worse."',
      'Ines: "Rafe Doucet ran his errands. He kept a lock-up at Marsh Storage, behind the new town row in Saltmarsh. Number 7. Start there. And I never met you."',
    ], 'Ines Moreau', () => { a.stage = 'lockup'; this.game.hud.toast("Doucet's lock-up: Marsh Storage, unit 7, Saltmarsh", 0xffd166); });
  }

  updM6(a, p) {
    const g = this.game;
    if (a.stage === 'forger') { a.text = 'Take the papers to Ines in the Hollows (the Liquor-Lotto)'; a.wp = this.forgerAt.clone(); return; }
    if (a.stage === 'talk') { a.text = 'Listen to Ines'; a.wp = null; return; }
    if (a.stage === 'lockup') {
      a.text = "Go to Doucet's lock-up: Marsh Storage, unit 7 (Saltmarsh)";
      a.wp = V3(this.unit7.x, Y, this.unit7.z - 5);
      if (Math.hypot(p.x - this.yard.x, p.z - this.yard.z) < 70) {
        // the Ashen Hand got there first, and they're clearing it out
        a.stage = 'fight';
        this.setLockupOpen(true);
        const spots = [[-6, -6], [4, -8], [-12, -3], [10, -4], [0, -12]];
        for (const [dx, dz] of spots) { const n = this.story.spawnGoon(a, V3(this.yard.x + dx, Y, this.yard.z + dz), Math.random() < 0.3 ? 'smg' : 'rifle'); if (n) { n.alerted = false; } }
        g.hud.toast("Unit 7's door is up, and the Ashen Hand are carrying boxes out. They got here first.", 0xff8a6a);
      }
      return;
    }
    if (a.stage === 'fight') {
      const left = this.goonsAlive(a).length;
      a.text = left ? `Deal with the Ashen Hand (${left} left), then search the lock-up` : 'Search the desk in unit 7';
      a.wp = left ? null : this.deskPapers.position.clone();
      if (!left) a.stage = 'search';
      return;
    }
    if (a.stage === 'search') { a.text = 'Search the desk in unit 7'; a.wp = this.deskPapers.position.clone(); return; }
    if (a.stage === 'leave') {
      a.text = 'Get clear of the lock-ups';
      a.wp = null;
      if (Math.hypot(p.x - this.yard.x, p.z - this.yard.z) > 60 && !g.police.wanted) this.story.end(true);
      else if (Math.hypot(p.x - this.yard.x, p.z - this.yard.z) > 60) a.text = `Lose the police (${'★'.repeat(Math.min(g.police.wanted, 10))})`;
    }
  }

  // ---------------------------------------------------------------- m7: The Clean-Up Crew
  updM7(a, p, dt) {
    const g = this.game;
    const wreck = V3(-1480, 0, 2300);
    if (a.stage === 'call') {
      a.text = "Doucet's phone is ringing…"; a.wp = null;
      a.callT -= dt;
      if (a.callT <= 0 && !a.called) {
        a.called = true;
        this.story.phone.ring("Doucet's phone: 'C'", [
          '"Rafe. You missed the drop. Twice."',
          '"We\'re cleaning up loose ends before the flight. Bring the keycard to the old plane wreck in the Scorch. Come alone."',
          '(click)',
        ], () => { a.stage = 'drive'; g.hud.toast('The wreck is out in the Scorch: take Route 9 south off the causeway', 0xffd166); });
      }
      if (a.called) a.text = "Answer Doucet's phone (J)";
      return;
    }
    if (a.stage === 'drive') {
      a.text = 'Go to the airliner wreck in the Scorch (you\'ll want a car)';
      a.wp = V3(wreck.x, this.ground(wreck.x, wreck.z), wreck.z);
      if (Math.hypot(p.x - wreck.x, p.z - wreck.z) < 75) this.ambush(a, wreck);
      return;
    }
    if (a.stage === 'fight') {
      const left = this.goonsAlive(a).length;
      a.text = `It's an ambush! ${left} left`;
      a.wp = null;
      a.fightT = (a.fightT || 0) + dt;
      if ((left <= 2 || a.fightT > 40) && a.suv && !a.suv.wreck) {
        a.stage = 'chase';
        a.suv.fleeing = true;
        if (a.lead && g.citizens.list.includes(a.lead)) g.citizens.despawn(a.lead);
        g.hud.toast('Their boss is getting away in the SUV! Stop him!', 0xff8a6a);
      }
      return;
    }
    if (a.stage === 'chase') {
      const s = a.suv;
      a.text = `Stop the SUV! (${Math.max(0, Math.round(s.hp / s.maxHp * 100))}%)`;
      a.wp = s.pos.clone();
      if (s.wreck) { a.stage = 'grab'; g.hud.toast('Got him. Search the wreck.', 0x7be08a); return; }
      // across the salt flat and round, waypoint to waypoint
      const S = g.scorch.salt;
      if (!s.goal || s.pos.distanceTo(s.goal) < 20) { const ang = Math.random() * Math.PI * 2, r = Math.random() * (S.r - 40); s.goal = V3(S.x + Math.cos(ang) * r, 0, S.z + Math.sin(ang) * r); }
      s.goal.y = s.pos.y;
      s.driveTo(dt, 27, s.goal, { accel: 9, brake: 14, maxSpeed: 30 }); s.driven = true;
      if (Math.hypot(p.x - s.pos.x, p.z - s.pos.z) > 600) this.story.end(false, 'He got away');
      return;
    }
    if (a.stage === 'grab') { a.text = 'Search the SUV wreck'; a.wp = a.suv.pos.clone(); }
  }

  ambush(a, wreck) {
    const g = this.game;
    a.stage = 'fight';
    const gy = (x, z) => this.ground(x, z);
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2, r = 18 + (k % 3) * 6;
      const x = wreck.x + Math.cos(ang) * r, z = wreck.z + Math.sin(ang) * r;
      const n = this.story.spawnGoon(a, V3(x, gy(x, z), z), ['rifle', 'smg', 'rifle', 'heavy', 'rifle', 'smg', 'rifle'][k]);
      if (n) { n.alerted = true; n.lastSeen = g.shorePlayer.body.translation(); }
    }
    // the boss's black SUV
    const m = CAR_MODELS.find((q) => q.id === 'suv');
    const sx = wreck.x + 30, sz = wreck.z - 10;
    const suv = new Car(g, { x: sx, z: sz, heading: Math.PI / 2, mesh: modelMesh(m, 0x15161a), half: { x: 0.95 * m.scale[0], y: 0.55 * m.scale[1], z: 2.25 * m.scale[2] }, hp: 260, maxSpeed: 32 });
    const y = gy(sx, sz); suv.body.setTranslation({ x: sx, y, z: sz }, true); suv.pos.y = y;
    a.suv = suv;
    this.cars.push(suv); // (in story.extraCars: it can be shot and rammed, and shows on the map)
    a.lead = this.story.spawnGoon(a, V3(sx - 3, gy(sx - 3, sz), sz), 'smg');
    g.hud.toast('It\'s a set-up! The Ashen Hand are waiting for you!', 0xff6a5a);
    g.hud.flashBanner('AMBUSH', '#ff6a5a');
  }

  // ---------------------------------------------------------------- m8: The Airport Manager
  pikeLook() { return { shirt: 0xf2f2ee, pants: 0x3a3d42, skin: 0xf1c9a5, outfit: 'suit', shoes: 'dress' }; }

  setupPike(a) {
    const g = this.game, C = g.city, R = C;
    const meetNode = { i: R.xs.length - 1, j: 0 }; // the end of the south street, where the road runs out to the scrapyard
    const nodeAt = (n) => V3(R.xs[n.i], Y, R.zs[n.j]);
    // his office: a tower lobby a few blocks from the docks
    const offices = C.interiors.filter((i) => i.kind === 'lobby' && /TRUST|CALLOWAY|HALCYON|OFFICES/.test(i.name || ''));
    const pool = offices.length ? offices : C.interiors.filter((i) => i.kind === 'lobby' && !/POLICE|HOSPITAL/.test(i.name || ''));
    const off = pool.reduce((b, i) => (Math.abs(i.door.distanceTo(nodeAt(meetNode)) - 280) < Math.abs(b.door.distanceTo(nodeAt(meetNode)) - 280) ? i : b), pool[0]);
    a.office = off;
    a.pikeDoor = off.door.clone();
    const out = off.inside ? V3(off.door.x - off.inside.x, 0, off.door.z - off.inside.z).normalize() : V3(0, 0, -1);
    a.pikeOut = out;
    // his white saloon, at the nearest junction
    let best = null, bd = Infinity;
    for (let i = 0; i < R.xs.length; i++) for (let j = 0; j < R.zs.length; j++) { const d = Math.hypot(R.xs[i] - a.pikeDoor.x, R.zs[j] - a.pikeDoor.z); if (d < bd) { bd = d; best = { i, j }; } }
    a.node = best; a.goalNode = meetNode;
    const m = CAR_MODELS.find((q) => q.id === 'sedan');
    const car = new Car(g, { x: R.xs[best.i], z: R.zs[best.j], heading: 0, mesh: modelMesh(m, 0xf2f2ee), half: { x: 0.95 * m.scale[0], y: 0.55 * m.scale[1], z: 2.25 * m.scale[2] }, maxSpeed: 30 });
    a.pcar = car;
    this.cars.push(car);
    // where he's going: just outside the scrapyard gate on the docks
    a.park = V3(DUMP.x0 - 17, Y, DUMP.bay.z + 4);
    a.meet = V3(DUMP.x0 - 7, Y, DUMP.bay.z - 3);
  }

  updM8(a, p, dt) {
    const g = this.game, C = g.citizens;
    const pikeAlive = a.pike && C.list.includes(a.pike);
    if (a.pike && !pikeAlive && !['tail', 'kill', 'confront', 'decide', 'spared'].includes(a.stage)) { this.story.end(false, 'Pike is dead: there goes your way in'); return; }
    if ((a.stage === 'meeting' || a.stage === 'after') && g.lastShotT !== a.lastShot) { this.story.end(false, 'Gunfire! They scattered'); return; }
    if (a.stage === 'office') {
      a.text = "Wait across the street from Pike's office for him to come out (don't hang round the door)";
      a.wp = a.pikeDoor.clone();
      const d = Math.hypot(p.x - a.pikeDoor.x, p.z - a.pikeDoor.z);
      if (d < 70) a.waitT = (a.waitT || 0) + dt;
      if (d < 5) { this.story.end(false, 'Pike saw you hanging round his door'); return; }
      if (a.waitT > 4) {
        a.stage = 'tocar';
        a.pike = g.citizens.spawnCitizen('city', 'escort', a.pikeDoor.clone().addScaledVector(a.pikeOut, 0.8).setY(Y + 0.3), { look: this.pikeLook() });
        a.pike.hp = 100; a.pike.cash = 400;
        a.pike.walkTo = a.pcar.pos.clone(); a.pike.walkSpeed = 2;
        a.marker ||= this.marker(0xffd166);
        g.hud.toast('There he is, in the white suit. Give him room, and follow his car.', 0xffd166);
      }
      return;
    }
    if (a.stage === 'tocar') {
      a.text = 'Pike is walking to his car';
      a.wp = null;
      const t = a.pike.body.translation();
      a.marker.position.set(t.x, t.y + 1.9, t.z);
      if (Math.hypot(t.x - a.pcar.pos.x, t.z - a.pcar.pos.z) < 3.4 || a.pike.arrived) {
        C.despawn(a.pike); a.pike = null;
        a.stage = 'tail'; a.lostT = 0; a.closeT = 0;
        a.from = { ...a.node }; a.to = null;
        g.sfx.play('engineStart');
      }
      return;
    }
    if (a.stage === 'tail') {
      const c = a.pcar, d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
      a.text = `Tail Pike's white car: ${Math.round(d)} m. ${d < 20 ? '<b style="color:#ff8a6a">Too close!</b>' : d > 130 ? '<b style="color:#ff8a6a">Don\'t lose him!</b>' : 'Not too close, and don\'t lose him.'}`;
      a.wp = null;
      a.marker.position.set(c.pos.x, c.pos.y + 4, c.pos.z);
      this.drivePike(a, dt);
      a.lostT = d > 170 ? a.lostT + dt : 0;
      a.closeT = d < 18 ? a.closeT + dt : Math.max(0, a.closeT - dt * 0.5);
      if (a.lostT > 8) { this.story.end(false, 'You lost him'); return; }
      if (a.closeT > 4) { this.story.end(false, 'Pike noticed you following him'); return; }
      return;
    }
    if (a.stage === 'meeting' || a.stage === 'after') {
      const t = a.pike.body.translation();
      a.marker.position.set(t.x, t.y + 1.9, t.z);
      if (this.updateStealth(a, dt, p)) return;
      const det = a.detect > 0.05 ? ` <b style="color:#ff8a6a">Detection ${Math.round(a.detect * 100)}%</b>` : '';
      if (a.stage === 'meeting') {
        a.text = `Photograph Pike with the Ashen Hand: take the camera out and click (Pike and one of them in the same shot). Stay out of their sight; crouch with C.${det}`;
        a.wp = null;
        return;
      }
      a.text = `Stay hidden while they leave…${det}`;
      a.afterT -= dt;
      for (const n of a.guards) if (n !== a.pike && n.arrived && C.list.includes(n)) { C.despawn(n); n.cone?.removeFromParent(); }
      if (a.afterT <= 0 || a.guards.every((n) => n === a.pike || !C.list.includes(n))) {
        for (const n of a.guards) if (n !== a.pike) { if (C.list.includes(n)) C.despawn(n); n.cone?.removeFromParent(); }
        a.pike.cone?.removeFromParent(); a.pike.guard = null; C.setMarker(a.pike, null);
        a.guards = [];
        a.goonCar.leaving = true;
        a.stage = 'confront';
        g.hud.toast("They've gone. Pike's on his own now.", 0xffd166);
      }
      return;
    }
    if (a.goonCar?.leaving) { // the black SUV drives off down the south street
      const s = a.goonCar;
      s.driveTo(dt, 14, V3(s.pos.x - 60, Y, DUMP.bay.z - 3), { maxSpeed: 16 }); s.driven = true;
      if (s.pos.x < -980 || Math.hypot(p.x - s.pos.x, p.z - s.pos.z) > 220) { s.dispose(); this.cars.splice(this.cars.indexOf(s), 1); a.goonCar = null; }
    }
    if (a.stage === 'confront') {
      if (!pikeAlive) { this.give('pass'); g.hud.toast("You take Pike's pass off him.", 0xe8e2d4); this.story.end(true); return; }
      const t = a.pike.body.translation();
      a.marker.position.set(t.x, t.y + 1.9, t.z);
      a.text = 'Confront Pike (E) before he drives off';
      a.wp = V3(t.x, t.y, t.z);
      return;
    }
    if (a.stage === 'decide') { a.text = 'What do you do with Pike?'; a.wp = null; if (!g.economy.isOpen) { a.stage = 'confront'; a.pike.handsUp = 0; } return; }
    if (a.stage === 'spared') {
      a.wp = null; a.text = 'Let him go';
      a.spareT -= dt;
      if (!pikeAlive || a.spareT <= 0 || a.pike.arrived) this.story.end(true);
      return;
    }
    if (a.stage === 'kill') {
      a.wp = null;
      a.text = 'Pike is running';
      if (pikeAlive) { const t = a.pike.body.translation(); a.marker.position.set(t.x, t.y + 1.9, t.z); }
      else { this.give('pass'); g.hud.toast("You take Pike's pass off him.", 0xe8e2d4); this.story.end(true); }
    }
  }

  // Pike drives the city grid, junction to junction, towards the docks; then parks and gets out.
  drivePike(a, dt) {
    const c = a.pcar, R = this.game.city;
    const nodePos = (n) => V3(R.xs[n.i], Y, R.zs[n.j]);
    if (!a.to) {
      const at = a.from, goal = a.goalNode;
      if (at.i === goal.i && at.j === goal.j) a.to = 'park';
      else {
        const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => ({ i: at.i + di, j: at.j + dj })).filter((n) => n.i >= 0 && n.j >= 0 && n.i < R.xs.length && n.j < R.zs.length);
        opts.sort((p, q) => (Math.abs(p.i - goal.i) + Math.abs(p.j - goal.j)) - (Math.abs(q.i - goal.i) + Math.abs(q.j - goal.j)));
        a.to = opts[0];
      }
    }
    const tp = a.to === 'park' ? a.park : nodePos(a.to);
    const d = Math.hypot(tp.x - c.pos.x, tp.z - c.pos.z);
    c.driven = true;
    if (a.to === 'park' && d < 4) {
      c.apply(dt, 0, 0, { brake: 10 });
      if (Math.abs(c.speed) < 0.6) this.startMeeting(a);
      return;
    }
    // keep to his side of the road
    const dir = V3(tp.x - c.pos.x, 0, tp.z - c.pos.z).normalize();
    const aim = tp.clone().add(V3(-dir.z, 0, dir.x).multiplyScalar(a.to === 'park' ? 0 : 3));
    const want = Math.atan2(-(aim.x - c.pos.x), -(aim.z - c.pos.z));
    const turn = Math.abs(Math.atan2(Math.sin(want - c.heading), Math.cos(want - c.heading)));
    c.driveTo(dt, a.to === 'park' ? Math.min(9, d * 0.5) : turn > 0.5 ? 5 : d < 16 ? 7 : 13, aim, { accel: 6, brake: 12, maxSpeed: 14 });
    if (a.to !== 'park' && d < 7) { a.from = a.to; a.to = null; }
  }

  startMeeting(a) {
    const g = this.game, c = a.pcar, C = g.citizens, m = a.meet;
    a.stage = 'meeting';
    a.lastShot = g.lastShotT;
    // Pike gets out; two of the Ashen Hand are waiting at the scrapyard gate
    const side = V3(c.forward.z, 0, -c.forward.x);
    const at = c.pos.clone().addScaledVector(side, 2.2);
    a.pike = C.spawnCitizen('city', 'escort', V3(at.x, Y + 0.3, at.z), { look: this.pikeLook() });
    a.pike.hp = 100; a.pike.cash = 400;
    a.pike.walkTo = m.clone(); a.pike.walkSpeed = 1.3;
    a.pike.guard = { route: null, alert: 0, fov: 0.7, range: 12, base: Math.PI / 2, sweep: 0.5, phase: 0 };
    a.pike.cone = this.makeCone(12, 0.7);
    a.guards.push(a.pike);
    const ashen = { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0x1a1a1a, hat: 'cap', hatColor: 0x111111 };
    this.spawnGuard(a, V3(m.x + 3, Y, m.z + 1), { look: ashen, facing: -Math.PI / 2, sweep: 0.9, range: 20, fov: 0.6 });
    this.spawnGuard(a, V3(m.x + 4, Y, m.z + 5), { look: { ...ashen, shirt: 0x2a2620 }, facing: -Math.PI * 0.7, sweep: 1.0, range: 18, fov: 0.6 });
    const black = CAR_MODELS.find((q) => q.id === 'suv');
    const suv = new Car(g, { x: DUMP.x0 + 12, z: DUMP.bay.z - 3, heading: -Math.PI / 2, mesh: modelMesh(black, 0x15161a), half: { x: 0.95 * black.scale[0], y: 0.55 * black.scale[1], z: 2.25 * black.scale[2] } });
    this.cars.push(suv);
    a.goonCar = suv;
    g.hud.toast("He's meeting someone. Get a photo of them together without being seen.", 0xffd166);
  }

  // the camera: did that photo get what we need?
  photo() {
    const a = this.a, g = this.game;
    if (!a || a.id !== 'm8' || a.stage !== 'meeting') return false;
    const cam = g.camera, sb = g.portSandbox;
    const inFrame = (t) => {
      const pt = V3(t.x, t.y + 0.5, t.z);
      const v = pt.clone().project(cam);
      if (v.z > 1 || Math.abs(v.x) > 0.85 || Math.abs(v.y) > 0.85) return false;
      const d = pt.distanceTo(cam.position);
      if (d > 60) return false;
      const dir = pt.clone().sub(cam.position).normalize();
      return !sb.world.castRay(new RAPIER.Ray(cam.position, dir), d - 0.5, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
    };
    const pk = inFrame(a.pike.body.translation());
    const goon = a.guards.find((n) => n !== a.pike && g.citizens.list.includes(n) && inFrame(n.body.translation()));
    if (pk && goon) {
      this.give('photos');
      g.hud.toast('Got them: Pike and the Ashen Hand, shaking hands. Front page stuff.', 0x7be08a);
      a.stage = 'after'; a.afterT = 9;
      a.pike.walkTo = a.pcar.pos.clone().addScaledVector(V3(a.pcar.forward.z, 0, -a.pcar.forward.x), 2.2);
      for (const n of a.guards) if (n !== a.pike) { n.walkTo = a.goonCar.pos.clone(); n.walkSpeed = 1.5; }
      return true;
    }
    g.hud.toast(pk || goon ? 'Not good enough: you need Pike and one of them in the same shot, in clear view' : "Not good enough: they're not in the shot", 0xff8a6a);
    return true;
  }

  blackmail(a) {
    const g = this.game, e = g.economy;
    a.stage = 'decide';
    const pt = g.shorePlayer.body.translation(), t = a.pike.body.translation();
    a.pike.faceYaw = Math.atan2(pt.x - t.x, pt.z - t.z);
    a.pike.walkTo = null;
    a.pike.handsUp = 999;
    const html = `<div class="story act">
      <p><b>Pike:</b> "Who the hell are— … oh. Oh no."</p>
      <p>You show him the photos. Him, smiling, shaking hands with the Ashen Hand at the scrapyard gate.</p>
      <p><b>Pike:</b> "They said it was medical supplies! I just keep Hangar 3 off the books, that's all, I swear! What do you want? Money?"</p>
      <p><b>You:</b> "Your pass. All areas."</p>
      <p><b>Pike:</b> "…Fine. Take it. Take it! Just keep those pictures off the news."</p>
      <p>He drops his pass in your hand. This man helped the people who killed Wren, and he'd do it again for the right price.</p>
      <div class="btns"><button data-a="spare">Let him go</button><button data-a="kill" class="danger">He doesn't walk away</button></div></div>`;
    e.open('Harlan Pike', html, (body) => body.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b) return;
      e.close();
      a.pike.handsUp = 0;
      a.pike.faceYaw = null;
      if (b.dataset.a === 'spare') {
        this.give('pass');
        a.stage = 'spared'; a.spareT = 6;
        a.pike.walkTo = a.pcar.pos.clone(); a.pike.walkSpeed = 3.6;
        g.hud.toast('"Thank you… thank you." He runs for his car. You keep the pass, and the photos.', 0xe8e2d4);
      } else {
        a.stage = 'kill';
        a.pike.role = 'civ';
        g.citizens.flee(a.pike, g.shorePlayer.body.translation(), 60);
        g.hud.toast('He sees it in your face, and he runs.', 0xff8a6a);
      }
    }));
  }

  marker(color) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 4), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 }));
    m.rotation.x = Math.PI; m.renderOrder = 5;
    this.group.add(m);
    return m;
  }

  // ---------------------------------------------------------------- m9: Blueprints
  setupOffice(a) {
    const O = this.office, look = { shirt: 0x2c3e5e, pants: 0x1d1f22, skin: 0xd9a47c, hat: 'cap', hatColor: 0x1c2f6e };
    const P = (x, z) => V3(x, Y, z);
    // one walks the corridor end to end; one does the big office on the north side; one walks
    // between Records and the middle office on the south side (through the doors, there and back)
    this.spawnGuard(a, P(-1446, 452), { look, route: [P(-1446, 452), P(-1423, 452)], range: 13, fov: 0.6 });
    this.spawnGuard(a, P(-1436.5, 448), { look: { ...look, skin: 0x7a4f35 }, route: [P(-1436.5, 448), P(-1423.5, 448), P(-1423.5, 442.5), P(-1436.5, 442.5)], range: 11, fov: 0.6 });
    const south = [P(-1423.5, 460.5), P(-1426, 457.5), P(-1426, 454.5), P(-1433, 454.5), P(-1433, 457.5), P(-1432, 460)];
    this.spawnGuard(a, south[0], { look: { ...look, skin: 0xf1c9a5 }, route: [...south, ...south.slice(1, -1).reverse()], pauseAt: [0, 5], range: 11, fov: 0.6 });
    // cameras: one in the lobby, one looking down the corridor
    this.addCamera(a, V3(O.x0 + 1, Y + 3, O.z0 + 1), Math.PI / 4, 0.7, 11);
    this.addCamera(a, V3(O.x0 + 12.5, Y + 3, 455.5), Math.PI / 2, 0.5, 14);
    a.crack = 0;
  }

  updM9(a, p, dt) {
    const g = this.game;
    if (a.stage === 'gate') { a.text = "Use Pike's pass at the airport gate"; a.wp = V3(this.gate.x, Y, this.gate.z - 3); return; }
    const inside = this.officeInside(p);
    if (a.stage === 'office') {
      a.text = inside ? `Find the safe in Records (east end). Crouch (C) and stay out of the cones. ${a.detect > 0.05 ? `<b style="color:#ff8a6a">Detection ${Math.round(a.detect * 100)}%</b>` : ''}` : 'Get into the Airport Authority office (landside, west of the terminal)';
      a.wp = inside ? null : this.officeDoor.clone();
      if (this.updateStealth(a, dt, p)) return;
      // cracking: hold E at the safe
      const holding = a.cracking && g.keys.has('KeyE') && this.nearP(p, this.safe, 2);
      if (!holding) a.cracking = false;
      if (holding) { a.crack += dt / 4; a.text = `Cracking the safe… ${Math.round(a.crack * 100)}%`; if (Math.random() < dt * 4) g.sfx.play('select'); }
      if (a.crack >= 1) { a.stage = 'out'; this.give('plans'); g.hud.toast(ACT2_KEY_ITEMS.plans.desc, 0xe8e2d4); }
      return;
    }
    if (a.stage === 'out') {
      a.text = `Get out without being seen ${a.detect > 0.05 ? `<b style="color:#ff8a6a">Detection ${Math.round(a.detect * 100)}%</b>` : ''}`;
      a.wp = inside ? this.officeDoor.clone() : null;
      if (this.updateStealth(a, dt, p)) return;
      if (!inside && Math.hypot(p.x - this.officeDoor.x, p.z - this.officeDoor.z) > 35) this.story.end(true);
    }
  }

  // ---------------------------------------------------------------- m10: Gate Crasher
  wearUniform(a, on) {
    const S = this.game.style;
    if (!S) return;
    if (on) { a.oldLook = { ...S.look }; Object.assign(S.look, { outfit: 'hivis', hat: 'hardhat' }); S.apply(); this.game.hud.toast('You\'re in the ground crew uniform: hi-vis and a hard hat. Walk, don\'t run.', 0xffd166); }
    else if (a.oldLook) { Object.assign(S.look, a.oldLook); S.apply(); }
  }

  setupHangar(a) {
    const g = this.game, J = this.jetSpot;
    // the Chemist's jet, parked in front of Hangar 3
    const b = buildBizJet();
    b.root.position.set(J.x, Y + 1.95, J.z); b.root.rotation.y = J.yaw;
    this.group.add(b.root);
    a.jet = { pos: V3(J.x, Y, J.z), mesh: b.root };
    const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), J.yaw);
    a.jet.col = g.portSandbox.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.3, 1.3, 8).setTranslation(J.x, Y + 2.9, J.z).setRotation(q));
    const P = (x, z) => V3(x, Y, z);
    const crew = { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0x1a1a1a, hat: 'cap', hatColor: 0x111111 };
    // the Chemist himself: lab coat, glasses, watching them load
    a.chemist = g.citizens.spawnCitizen('airport', 'escort', P(J.x + 6, J.z - 6), { look: { shirt: 0xf2f2ee, pants: 0x2c3440, skin: 0xf1c9a5, outfit: 'labcoat', glasses: 'black', shoes: 'dress' } });
    if (a.chemist) { a.chemist.faceYaw = Math.PI; a.chemist.hp = 1e6; }
    this.spawnGuard(a, P(-1860, 560), { look: crew, route: [P(-1860, 560), P(-1810, 560)], range: 14 });
    this.spawnGuard(a, P(-1830, 605), { look: crew, route: [P(-1830, 605), P(-1870, 600), P(-1870, 580)], range: 14 });
    this.spawnGuard(a, P(-1800, 575), { look: crew, facing: Math.PI / 2, sweep: 1.2, range: 15 });
    this.spawnGuard(a, P(-1880, 585), { look: crew, facing: -Math.PI / 2, sweep: 1.0, range: 14 });
    this.spawnGuard(a, P(-1770, 600), { look: { shirt: 0x2c3e5e, pants: 0x1d1f22, skin: 0xd9a47c, hat: 'cap', hatColor: 0x1c2f6e }, route: [P(-1770, 600), P(-1770, 640), P(-1820, 640)], range: 13 });
    a.disguise = true;
    a.firedAt = g.time;
    a.lastShot = g.lastShotT;
  }

  updM10(a, p, dt) {
    const g = this.game;
    if (g.lastShotT !== a.lastShot) { this.story.end(false, 'Gunfire! Your cover\'s blown'); return; }
    if (this.game.police.wanted > 0) { this.story.end(false, 'The police are after you: the cover\'s blown'); return; }
    if (a.stage === 'gate') { a.text = "Use Pike's pass at the airport gate"; a.wp = V3(this.gate.x, Y, this.gate.z - 3); return; }
    const d = a.done, todo = [];
    if (!d.jet) todo.push('tracker on the jet');
    if (!d.truck) todo.push('tracker on the fuel truck');
    if (!d.board) todo.push('read the departures board (site office)');
    const near = Math.hypot(p.x - this.h3.x, p.z - (this.h3.z + 50)) < 140;
    if (this.updateStealth(a, dt, p)) return;
    if (todo.length) {
      a.text = (near ? `Hangar 3: ${todo.join(' · ')}. Walk, don't run.` : 'Go to Hangar 3 (the western hangar)') + (a.detect > 0.05 ? ` <b style="color:#ff8a6a">Detection ${Math.round(a.detect * 100)}%</b>` : '');
      a.wp = near ? null : V3(this.h3.x, Y, this.h3.z + 40);
      return;
    }
    a.text = 'Walk out of the airport (back through the gate)';
    a.wp = V3(this.gate.x, Y, this.gate.z - 6);
    if (p.z < this.gate.z - 4) this.story.end(true);
  }

  // ---------------------------------------------------------------- m11: Last Flight
  setupFlight(a) {
    const g = this.game;
    // the empty airliner, lined up on runway 27 (the east end, facing west)
    const plane = new Jet(g, { x: -1185, z: 690, yaw: Math.PI / 2 }, 'VA1', {
      build: () => buildAirliner(0x1f5fbf, 'VERIAN AIR'),
      half: [2.4, 2.4, 19, 0, 2.25, 1], wing: [16, 0.4, 3, 0, 1.0, 0],
      agility: 0.5, thrust: 0.18, noRespawn: true, name: 'airliner', // (heavy: a long take-off roll and ~400 km/h flat out)
    });
    plane.camOff = [0, 10, 58]; plane.cockpitOff = [0, 3.3, -17.5]; plane.reach = 12;
    g.jets.add(plane);
    a.plane = plane;
    // the Chemist's jet: already rolling, then climbing out over the sea and flying a big loop
    const b = buildBizJet();
    g.scene.add(b.root);
    a.target = { mesh: b.root, pos: V3(-1700, Y + 30, 690), heading: Math.PI / 2, speed: 62, alt: 450, t: 0, alive: true, wp: 0, roll: 0, quat: new THREE.Quaternion() };
    a.route = [V3(-2600, 0, 400), V3(-2200, 0, -900), V3(-900, 0, -1500), V3(200, 0, -900), V3(300, 0, 400), V3(-800, 0, 1300)];
    a.callDone = false;
    a.marker = this.marker(0xff3a2a);
    g.hud.toast('The Chemist\'s jet is taking off! Get to the airliner on the runway!', 0xff6a5a);
  }

  flyTarget(a, dt) {
    const T = a.target;
    if (!T.alive) return;
    T.t += dt;
    // climb out, then the loop
    const goal = a.route[T.wp];
    const want = Math.atan2(-(goal.x - T.pos.x), -(goal.z - T.pos.z));
    let d = Math.atan2(Math.sin(want - T.heading), Math.cos(want - T.heading));
    const rate = 0.12;
    T.heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    T.roll += (-Math.sign(d) * Math.min(0.5, Math.abs(d) * 1.5) - T.roll) * Math.min(1, dt * 1.5);
    T.speed = Math.min(78, T.speed + dt * 4);
    const fwd = V3(-Math.sin(T.heading), 0, -Math.cos(T.heading));
    T.pos.addScaledVector(fwd, T.speed * dt);
    T.pos.y += (Y + T.alt - T.pos.y) * Math.min(1, dt * 0.08);
    if (Math.hypot(goal.x - T.pos.x, goal.z - T.pos.z) < 300) T.wp = (T.wp + 1) % a.route.length;
    const climb = Math.atan2((Y + T.alt - T.pos.y) * 0.08, T.speed);
    T.quat.setFromEuler(new THREE.Euler(climb, T.heading, T.roll, 'YXZ'));
    T.mesh.position.copy(T.pos); T.mesh.quaternion.copy(T.quat);
    T.vel = fwd.clone().multiplyScalar(T.speed);
  }

  updM11(a, p, dt) {
    const g = this.game, T = a.target, P = a.plane;
    this.flyTarget(a, dt);
    if (a.marker && T.alive) { a.marker.position.set(T.pos.x, T.pos.y + 8, T.pos.z); a.marker.scale.setScalar(Math.max(1, T.pos.distanceTo(g.camera.position) / 60)); }
    if (P.crashed && !a.hit) { this.story.end(false, a.ejected ? 'The airliner missed. The Chemist got away.' : 'You crashed the airliner'); return; }
    const dist = P.pos.distanceTo(T.pos);
    // the empty airliner on its last heading: lead him a little, like a missile would
    if (a.aim && T.alive && T.vel) a.aim.pos.copy(T.pos).addScaledVector(T.vel, Math.min(6, dist / Math.max(P.airspeed, 40)));
    // impact: the airliner (with or without you aboard) into the Chemist's jet
    if (T.alive && dist < 30 && !P.crashed) this.impact(a);
    if (a.stage === 'board' && g.jets.active === P) { a.stage = 'chase'; g.hud.toast('Full throttle (W) and pull back past 200 km/h. Mouse to fly, G for the gear, F to EJECT', 0xffd166); }
    if (a.stage === 'board') { a.text = !this.story.state.gateOpen ? "Get to the airliner on the runway: Pike's pass opens the airport gate" : 'Get to the airliner on the runway (the east end) and climb aboard'; a.wp = P.pos.clone(); return; }
    if (a.stage === 'chase') {
      if (!a.callDone && !P.onGround && dist < 2600) {
        a.callDone = true;
        this.story.phone.ring(FIXER, [
          '"I can see you on the tracker. You\'re right on top of him."',
          '"Listen to me: you can\'t shoot that thing down, and you can\'t force it to land. You have to take it out in one piece, at altitude, so it all burns."',
          '"Put that airliner straight into him. And get out before you hit. F to eject. Don\'t you dare go down with it."',
        ]);
      }
      const ahead = P.fwd.dot(T.pos.clone().sub(P.pos).normalize());
      const lined = ahead > 0.96 && dist < 900;
      if (a.ejected) { a.text = g.skydive.active ? `${g.skydive.chute ? 'Under the canopy' : 'Falling: SPACE for the parachute'}… the airliner is ${Math.round(dist)} m from him` : 'Watch the sky…'; return; }
      a.text = P.onGround ? 'Take off: full throttle (W) down the runway, pull up past ~200 km/h' : `Catch the Chemist's jet: ${Math.round(dist)} m${lined ? ' · <b style="color:#ff6a5a">COLLISION COURSE: EJECT (F)!</b>' : ''}`;
      a.wp = null;
      return;
    }
    if (a.stage === 'falling') {
      a.text = g.skydive.active ? (g.skydive.chute ? 'Steer for land and touch down' : 'Open your parachute: SPACE') : 'Touchdown';
      if (a.landed && !a.endT) a.endT = 1.5;
    }
    if (a.endT) { a.endT -= dt; if (a.endT <= 0) this.story.end(true); }
  }

  onEject(jet) {
    const a = this.a;
    if (!a || a.id !== 'm11' || jet !== a.plane) return;
    a.ejected = true;
    const T = a.target, d = jet.pos.distanceTo(T.pos);
    const ahead = jet.fwd.dot(T.pos.clone().sub(jet.pos).normalize());
    // pointed at him and close enough: the empty plane holds its course into him
    if (ahead > 0.82 && d < 1400) { a.aim = { pos: T.pos.clone() }; jet.autopilot = a.aim; }
    else this.game.hud.toast('You weren\'t lined up! The airliner drifts off course…', 0xff8a6a);
  }

  impact(a) {
    const g = this.game, T = a.target, P = a.plane;
    a.hit = true;
    T.alive = false;
    const at = T.pos.clone();
    const inside = g.jets.active === P;
    if (inside) g.jets.active = null;
    P.autopilot = null;
    P.crash();
    T.mesh.visible = false;
    if (a.marker) a.marker.visible = false;
    // slow motion, a fireball, and the cargo burning up in green flame
    g.timeScale = 0.3; this.slowEnd = performance.now() + 2600;
    for (let i = 0; i < 6; i++) setTimeout(() => this.airburst(at.clone().add(V3((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 24))), i * 140);
    for (let i = 0; i < 80; i++) g.fx.emit(at.clone(), V3((Math.random() - 0.5) * 30, (Math.random() - 0.3) * 20, (Math.random() - 0.5) * 30), Math.random() < 0.5 ? 0x5aff6a : 0xffa030, 2.5, -0.3, 2);
    for (let i = 0; i < 5; i++) setTimeout(() => g.fx.flash(at.clone().add(V3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 30)), 0x4aff5a, 40 + Math.random() * 30, 3.5), 300 + i * 220); // the agent burning off
    g.sfx.play('explosion'); g.shake = 1.2;
    g.hud.flashBanner('THE CHEMIST IS GONE', '#7be08a');
    if (inside) { g.health.damage(1000, 'jet'); return; } // (you went down with it)
    a.stage = 'falling';
    g.news?.add('BREAKING: two aircraft collided over Verian. A private jet linked to the Ashen Hand was destroyed in the air.', 'crime');
  }

  // a fireball in mid-air (no splash)
  airburst(p) {
    const fx = this.game.fx, v = V3();
    for (let i = 0; i < 140; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 26);
      fx.emit(p, v, Math.random() < 0.5 ? 0xff9a2a : Math.random() < 0.5 ? 0xffd166 : 0xff4a1a, 0.8 + Math.random() * 1.4, 0.4, 1.2);
    }
    fx.flash(p, 0xffb060, 45, 0.5);
  }

  // on the ground again: Act II is over once the Chemist's plane is down (wait for it if need be)
  onLanded() {
    const a = this.a;
    if (!a || a.id !== 'm11' || this.game.health.dead) return;
    a.landed = true;
  }

  clearFlight(a) {
    const g = this.game;
    if (a.plane) { if (g.jets.active === a.plane) g.jets.active = null; g.jets.remove(a.plane); }
    a.target?.mesh.removeFromParent();
    g.timeScale = 1;
  }

  // every frame, mission or not: cars nobody drove this frame coast; slow motion wears off in real time
  tick(dt) {
    for (const c of this.cars) { if (!c.driven) c.coast(dt); c.driven = false; }
    if (this.slowEnd && performance.now() > this.slowEnd) { this.slowEnd = 0; this.game.timeScale = 1; }
  }

  // ---------------------------------------------------------------- Act II complete
  completeText() {
    return `<p>The Chemist is ash over the sea, and so is every drop of what he made. Pike's pass is in your pocket, Doucet's phone has gone quiet, and the airport is just an airport again.</p>
      <p>Somewhere in Verian, whoever gives the Ashen Hand their orders has just lost their best man. They'll be looking for whoever did it now.</p>`;
  }
}
