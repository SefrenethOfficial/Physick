import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Car, clearSpot } from './carphys.js';
import { carAtlas, std, canvasTex, sign, carMesh } from './buildkit.js';
import { buildFigure, poseSeated } from './figure.js';
import { LAND_Y, addPier, islandAt } from './world.js';

// More things to drive: motorbikes (parked round town, in traffic, and at Verian Motors), city
// buses that stop at the shelters, a tow truck that can hook any car (T), and the Verian ferry
// that runs between the city's north pier and the Saltmarsh fishing dock.

const KERB = 0.15;
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };

// ---------------------------------------------------------------- meshes
export function bikeMesh(color = 0xc23b2a, { sport = true } = {}) {
  const root = new THREE.Group(), lean = new THREE.Group();
  root.add(lean);
  const paint = std({ color, roughness: 0.35, metalness: 0.3 }), black = std({ color: 0x15161a, roughness: 0.6 }), chrome = std({ color: 0xdfe3e8, metalness: 0.9, roughness: 0.2 });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; lean.add(m); return m; };
  for (const z of [-0.72, 0.72]) { add(new THREE.CylinderGeometry(0.33, 0.33, 0.14, 18), black, 0, 0.33, z, 0, Math.PI / 2); add(new THREE.CylinderGeometry(0.17, 0.17, 0.15, 12), chrome, 0, 0.33, z, 0, Math.PI / 2); }
  add(new THREE.BoxGeometry(0.34, 0.36, 0.9), paint, 0, 0.66, -0.05); // tank + body
  add(new THREE.BoxGeometry(0.3, 0.12, 0.55), black, 0, 0.88, 0.32); // seat
  add(new THREE.BoxGeometry(0.28, 0.3, 0.42), std({ color: 0x3a3c40, metalness: 0.5 }), 0, 0.45, 0.05); // engine
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8), chrome, 0, 0.62, -0.62, -0.35); // forks
  add(new THREE.BoxGeometry(0.7, 0.04, 0.04), black, 0, 1.0, -0.5); // bars
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 8), chrome, 0.16, 0.35, 0.55, Math.PI / 2 - 0.2); // exhaust
  if (sport) { add(new THREE.BoxGeometry(0.36, 0.34, 0.4), paint, 0, 0.9, -0.62, -0.5); add(new THREE.BoxGeometry(0.3, 0.16, 0.02), std({ color: 0x223344, transparent: true, opacity: 0.6 }), 0, 1.14, -0.72, -0.6); }
  const lamp = add(new THREE.BoxGeometry(0.12, 0.08, 0.04), std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 1 }), 0, 0.88, -0.84);
  void lamp;
  root.userData.lean = lean;
  root.userData.spec = `b:${color}:${sport ? 1 : 0}`;
  return root;
}

export function busMesh(color = 0x2f7fd8) {
  const g = new THREE.Group();
  const side = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#' + color.toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2f2ee'; c.fillRect(0, h * 0.72, w, h * 0.1);
    c.fillStyle = '#1b2a3a'; for (let x = 20; x < w - 20; x += 54) c.fillRect(x, 14, 46, 46);
    c.fillStyle = '#f2f2ee'; c.font = 'bold 26px Arial'; c.fillText('VERIAN TRANSIT', 24, h - 12);
  });
  const front = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#' + color.toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h); c.fillStyle = '#1b2a3a'; c.fillRect(8, 8, w - 16, 60); c.fillStyle = '#ffb020'; c.font = 'bold 20px Arial'; c.textAlign = 'center'; c.fillText('12 PLAZA', w / 2, 32); c.fillStyle = '#fff6d8'; c.fillRect(10, 96, 22, 12); c.fillRect(w - 32, 96, 22, 12); });
  const S = std({ map: side, roughness: 0.5 }), F = std({ map: front, roughness: 0.5 }), top = std({ color: 0xe8e8e2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.7, 11), [S, S, top, std({ color: 0x222222 }), F, F]);
  body.position.y = 1.85; body.castShadow = true; g.add(body);
  const wheelM = std({ color: 0x15161a });
  for (const [x, z] of [[-1.15, -3.6], [1.15, -3.6], [-1.15, 3.4], [1.15, 3.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), wheelM); w.rotation.z = Math.PI / 2; w.position.set(x, 0.5, z); g.add(w); }
  g.userData.body = body;
  g.userData.spec = `u:${color}`;
  return g;
}

export function towMesh(color = 0xe0a030) {
  const g = carMesh(color);
  // a short cab: chop the cabin forward, and put a flatbed with a crane and hook behind it
  const black = std({ color: 0x15161a }), steel = std({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 });
  const add = (w, h, d, x, y, z, m, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; g.add(b); return b; };
  add(1.9, 0.12, 2.1, 0, 1.08, 1.25, steel); // bed
  add(0.25, 1.3, 0.25, 0, 1.7, 1.3, std({ color })); // crane post
  add(0.18, 0.18, 2.0, 0, 2.15, 2.0, std({ color }), -0.45); // boom
  add(0.06, 0.6, 0.06, 0, 1.6, 2.9, black); // cable
  add(0.3, 0.12, 0.12, 0, 1.25, 2.95, black); // hook
  add(1.0, 0.12, 0.25, 0, 2.05, -0.3, std({ color: 0xff8a1a, emissive: 0xff7a10, emissiveIntensity: 0.8 })); // beacon bar
  g.userData.spec = `t:${color}`;
  return g;
}

// ---------------------------------------------------------------- the ferry
class Ferry {
  constructor(game, A, B) {
    this.game = game;
    this.A = A; this.B = B; // { at: dock point (ferry centre), board: where you stand to board, land: where you get off, yaw }
    const g = (this.root = new THREE.Group());
    const hullM = std({ color: 0xf2f2ee, roughness: 0.5 }), blue = std({ color: 0x1f4f8a, roughness: 0.5 }), deckM = std({ color: 0x8a6a48, roughness: 0.9 });
    const add = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
    add(9, 2.2, 30, 0, 0.6, 0, blue); // hull
    add(9.2, 0.5, 30.2, 0, 1.95, 0, hullM); // rubbing strake
    add(8.4, 0.12, 29, 0, 2.25, 0, deckM); // deck
    add(6.5, 2.6, 12, 0, 3.6, -3, hullM); // cabin
    const win = std({ color: 0x223344, roughness: 0.1, metalness: 0.4 });
    for (const s of [-1, 1]) add(0.05, 0.9, 10.5, s * 3.27, 4.1, -3, win);
    add(5.5, 1.4, 4, 0, 5.6, -5, hullM); // bridge
    add(5.2, 0.6, 0.05, 0, 5.8, -7.02, win);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 2.2, 16), std({ color: 0xc0442c })); funnel.position.set(0, 6.4, 0.5); g.add(funnel);
    for (const s of [-1, 1]) for (let z = -14; z <= 14; z += 2) add(0.06, 0.9, 0.06, s * 4.1, 2.75, z, hullM); // rail posts
    for (const s of [-1, 1]) add(0.08, 0.08, 29, s * 4.1, 3.2, 0, hullM);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(1.6, 0.5, 0.5, s * 2.3, 2.55, 6 + i * 1.8, std({ color: 0x2f4f6f })); // benches
    const name = canvasTex(256, 48, (c, w, h) => { c.fillStyle = '#f2f2ee'; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.fillText('VERIAN FERRY', w / 2, 38); });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({ map: name, transparent: true })); p.position.set(s * 4.52, 1.0, 0); p.rotation.y = s * Math.PI / 2; g.add(p); }
    game.scene.add(g);
    this.leg = 0; // 0: at A, 1: A->B, 2: at B, 3: B->A
    this.t = 0;
    this.wait = 25;
    this.pos = A.at.clone();
    this.yaw = A.yaw;
    this.riding = false;
    this.seat = new THREE.Vector3(0, 2.3 + 1.0, 8); // local: on the open deck aft
    this.place();
  }

  get docked() { return this.leg === 0 ? this.A : this.leg === 2 ? this.B : null; }
  get other() { return this.leg === 0 ? this.B : this.A; }

  place() {
    const bob = Math.sin(this.t * 0.9) * 0.12;
    this.root.position.set(this.pos.x, -0.6 + bob, this.pos.z);
    this.root.rotation.set(Math.sin(this.t * 0.7) * 0.015, this.yaw, Math.sin(this.t * 0.55) * 0.02);
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (this.leg === 0 || this.leg === 2) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.leg = (this.leg + 1) % 4; this.wait = 0;
        this.from = this.pos.clone(); this.to = (this.leg === 1 ? this.B : this.A).at.clone(); this.prog = 0;
        g.sfx.play('shipHorn');
        if (this.riding) g.hud.toast(`Ferry departing for ${this.leg === 1 ? 'Saltmarsh Key' : 'Verian City'}`, 0x9ec5ff);
      }
    } else {
      // out across the strait, turning to face where it's going, easing in at the far end
      const total = this.from.distanceTo(this.to);
      this.prog = Math.min(1, this.prog + (dt * 14) / total);
      const e = this.prog < 0.1 ? this.prog * this.prog * 50 * 0.1 / 0.5 : this.prog > 0.9 ? 1 - (1 - this.prog) * (1 - this.prog) * 5 : this.prog;
      const p = this.from.clone().lerp(this.to, THREE.MathUtils.clamp(e, 0, 1));
      const dir = this.to.clone().sub(this.from);
      const wantYaw = this.prog > 0.92 ? (this.leg === 1 ? this.B.yaw : this.A.yaw) : Math.atan2(dir.x, dir.z);
      this.yaw += angDiff(this.yaw, wantYaw) * Math.min(1, dt * 0.8);
      this.pos.copy(p);
      if (this.prog >= 1) {
        this.leg = (this.leg + 1) % 4; this.wait = 25;
        g.sfx.play('shipHorn');
        if (this.riding) this.disembark();
      }
    }
    this.place();
    if (this.riding) {
      const p = this.seat.clone().applyEuler(this.root.rotation).add(this.root.position);
      g.shorePlayer.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      g.shorePlayer.vel.set(0, 0, 0);
    }
  }

  board() {
    const g = this.game;
    if (g.economy.money < 10) { g.hud.toast('A ferry ticket is $10', 0xff8a6a); return; }
    g.economy.addMoney(-10, 'ferry ticket');
    g.story.fade(() => { this.riding = true; g.shorePlayer.collider.setEnabled(false); g.hud.toast(`All aboard for ${this.other === this.B ? 'Saltmarsh Key' : 'Verian City'}. E to get off before it sails`, 0x9ec5ff); });
  }

  disembark(early = false) {
    const g = this.game, dock = early ? this.docked : this.docked || this.other;
    g.story.fade(() => { // (stay in your seat until the screen's dark)
      this.riding = false;
      g.shorePlayer.collider.setEnabled(true);
      g.placeOnShore(dock.land.clone(), dock.yaw + Math.PI);
    });
    if (!early) g.hud.toast(`Welcome to ${dock === this.B ? 'Saltmarsh Key' : 'Verian City'}`, 0x7be08a);
  }
}

// ---------------------------------------------------------------- the lot
export class Fleet {
  constructor(game) {
    this.game = game;
    this.bikes = [];
    this.stops = [];
    this.buses = [];
    this.tow = null; // { truck, car }
    this.t = 0;
    this.buildStops();
    this.parkBikes();
    this.parkTowTruck();
    this.buildFerry();
  }

  // ---- motorbikes
  makeBike(opts) {
    const g = this.game;
    const mesh = bikeMesh(opts.color, { sport: opts.sport !== false });
    const car = new Car(g, { ...opts, mesh, half: { x: 0.42, y: 0.5, z: 1.1 }, wheelbase: 1.45, density: 210, hp: opts.hp ?? 60, ride: 0.35 });
    car.bike = true;
    // a rider (shown when someone's on it)
    const fig = buildFigure(opts.look || { shirt: 0x15161a, pants: 0x2c3440, skin: 0xd9a47c, hat: 'helmet', hatColor: opts.color });
    fig.root.position.set(0, 1.45, 0.18); poseSeated(fig.parts); fig.parts.legLPivot.rotation.set(-1.3, 0, -0.35); fig.parts.legRPivot.rotation.set(-1.3, 0, 0.35);
    fig.parts.armLPivot.rotation.set(-1.5, 0, -0.2); fig.parts.armRPivot.rotation.set(-1.5, 0, 0.2); fig.root.rotation.set(0.3, Math.PI, 0, 'YXZ'); // facing the bars (the bike's front is -z), leaning forward
    mesh.userData.lean.add(fig.root);
    fig.root.visible = false;
    car.rider = fig;
    this.bikes.push(car);
    return car;
  }

  parkBikes() {
    const g = this.game, C = g.city, H = g.hood;
    const spots = [];
    for (let k = 0; k < 6; k++) spots.push({ x: C.xs[1 + (k % 4)] + 9.5, z: C.zs[1 + Math.floor(k / 2) % 4] + 14 + k * 3, heading: 0 });
    for (let k = 0; k < 3; k++) spots.push({ x: H.xs[k] + 8.5, z: H.zs[1 + k] + 20, heading: 0 });
    for (const [i, s] of spots.entries()) {
      if (!clearSpot(g, s.x, s.z, s.heading, { x: 0.42, y: 0.5, z: 1.1 }, LAND_Y + KERB)) continue;
      const b = this.makeBike({ color: [0xc23b2a, 0x15161a, 0x2f7fd8, 0xe0a030, 0x3aa760][i % 5], x: s.x, z: s.z, heading: s.heading + (Math.random() - 0.5) * 0.3, sport: i % 2 === 0, maxSpeed: 38 });
      g.vehicles.parked.push(b);
    }
    // a couple in traffic, riders and all
    for (let k = 0; k < 3; k++) {
      const net = g.traffic.nets[0];
      const car = g.traffic.spawn(net, 25, (o) => this.makeBike({ ...o, color: [0x15161a, 0xc23b2a, 0xe8e8e2][k], maxSpeed: 30 }));
      if (car) car.rider.root.visible = true;
    }
  }

  // ---- buses and stops
  buildStops() {
    const g = this.game, C = g.city, ROAD = 16;
    const grp = new THREE.Group(); g.scene.add(grp);
    const glass = std({ color: 0x9ec5e8, transparent: true, opacity: 0.35, roughness: 0.1 }), frame = std({ color: 0x2a2c30, metalness: 0.5 });
    const segs = [[1, 1, 'x'], [3, 3, 'x'], [2, 4, 'z'], [0, 2, 'z'], [1, 3, 'x'], [3, 1, 'z'], [0, 0, 'x'], [4, 2, 'z']];
    for (const [i, j, axis] of segs) for (const dirSign of [1, -1]) {
      const A = new THREE.Vector3(C.xs[i], LAND_Y, C.zs[j]);
      const B = axis === 'x' ? new THREE.Vector3(C.xs[i + 1], LAND_Y, C.zs[j]) : new THREE.Vector3(C.xs[i], LAND_Y, C.zs[j + 1]);
      const mid = A.clone().lerp(B, 0.5);
      const dir = B.clone().sub(A).normalize().multiplyScalar(dirSign);
      const r = new THREE.Vector3(-dir.z, 0, dir.x);
      const road = mid.clone().addScaledVector(r, C.lane);
      const shel = mid.clone().addScaledVector(r, ROAD / 2 + 2.2);
      const yaw = Math.atan2(r.x, r.z) + Math.PI; // the open front faces the road
      const sg = new THREE.Group(); sg.position.set(shel.x, LAND_Y + KERB, shel.z); sg.rotation.y = yaw; grp.add(sg);
      const add = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; sg.add(b); };
      add(3.4, 0.08, 1.5, 0, 2.4, 0, frame); add(3.4, 2.3, 0.05, 0, 1.2, -0.7, glass);
      for (const s of [-1, 1]) { add(0.05, 2.3, 1.4, s * 1.7, 1.2, 0, glass); add(0.08, 2.4, 0.08, s * 1.7, 1.2, 0.7, frame); }
      add(2.4, 0.08, 0.4, 0, 0.5, -0.4, std({ color: 0x8a6a48 }));
      const signT = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#2f7fd8'; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.fillText('B', 32, 44); });
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), new THREE.MeshBasicMaterial({ map: signT })); s.position.set(1.9, 2.7, 0.8); sg.add(s);
      g.portSandbox.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.75, 1.2, 0.1).setTranslation(shel.x - Math.sin(yaw) * 0.7, LAND_Y + KERB + 1.2, shel.z - Math.cos(yaw) * 0.7).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))));
      this.stops.push({ road, dir, shel });
    }
    // two buses on the city grid
    for (let k = 0; k < 2; k++) {
      const car = g.traffic.spawn(g.traffic.nets[0], 25, (o) => {
        const c = new Car(g, { ...o, mesh: busMesh([0x2f7fd8, 0xc0442c][k]), half: { x: 1.25, y: 1.4, z: 5.5 }, wheelbase: 6.5, density: 160, hp: 400, maxSpeed: 22 });
        c.bus = true; c.stopCool = 0;
        return c;
      });
      if (car) this.buses.push(car);
    }
  }

  // ---- tow truck: one parked by the scrapyard side of town, more at Verian Motors
  towMeshFor(color) { return towMesh(color); }

  makeTow(opts) {
    const car = new Car(this.game, { ...opts, mesh: towMesh(opts.color ?? 0xe0a030), hp: 220, density: 160, maxSpeed: opts.maxSpeed ?? 28 });
    car.tow = true;
    return car;
  }

  parkTowTruck() {
    const g = this.game, C = g.city;
    const x = C.xs[4] + 9.5, z = C.zs[3] + 30;
    if (clearSpot(g, x, z, 0)) g.vehicles.parked.push(this.makeTow({ x, z, heading: 0 }));
  }

  hookable(truck) {
    const g = this.game, f = truck.forward, rear = truck.pos.clone().addScaledVector(f, -(truck.half.z + 1.6));
    let best = null, bd = 4.5;
    for (const c of g.vehicles.all) {
      if (c === truck || c.bus || c.monster || c.police && !c.wreck && g.police.cars.includes(c) && !c.blockade) continue;
      const d = Math.min(c.pos.clone().addScaledVector(c.forward, c.half.z).distanceTo(rear), c.pos.clone().addScaledVector(c.forward, -c.half.z).distanceTo(rear));
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  toggleTow() {
    const g = this.game, v = g.vehicles.active;
    if (!v?.tow) return false;
    if (this.tow) { this.tow.car.towed = null; g.hud.toast('Unhooked', 0x9ec5ff); this.tow = null; return true; }
    const c = this.hookable(v);
    if (!c) { g.hud.toast('Back up to a car (its front or back) to hook it', 0xffd166); return true; }
    // which end is nearer the hook? that end gets lifted
    const rear = v.pos.clone().addScaledVector(v.forward, -(v.half.z + 1.6));
    const endSign = c.pos.clone().addScaledVector(c.forward, c.half.z).distanceTo(rear) < c.pos.clone().addScaledVector(c.forward, -c.half.z).distanceTo(rear) ? 1 : -1;
    this.tow = { truck: v, car: c, end: endSign };
    c.towed = v;
    // a traffic car's driver gets out and yells; a parked car's just gone
    if (g.traffic.cars.includes(c)) g.vehicles.steal({ car: c, kind: 'traffic' }, false);
    else if (g.vehicles.parked.includes(c)) { g.vehicles.parked.splice(g.vehicles.parked.indexOf(c), 1); g.vehicles.list.push(c); c.type = c.type || { name: 'Towed car', hp: c.maxHp, car: true }; c.base = c.base || 300; g.police.crime('theft', 1, c.pos.clone()); }
    g.sfx.play('weld');
    g.hud.toast('Hooked! T to drop it. Tow it to Dimitri\'s chop shop to sell it', 0x7be08a);
    return true;
  }

  updateTow(dt) {
    const T = this.tow;
    if (!T) return;
    const g = this.game, truck = T.truck, c = T.car;
    if (truck.wreck || c.wreck || !g.vehicles.all.includes(c) || Math.hypot(c.pos.x - truck.pos.x, c.pos.z - truck.pos.z) > 15) { c.towed = null; this.tow = null; return; }
    const f = truck.forward;
    const hitch = truck.pos.clone().addScaledVector(f, -(truck.half.z + 0.9));
    const end = c.pos.clone().addScaledVector(c.forward, T.end * c.half.z);
    const err = hitch.sub(end).setY(0);
    const v = truck.vel.clone().addScaledVector(err, 7);
    if (v.length() > 45) v.setLength(45);
    c.body.setLinvel({ x: v.x, y: c.body.linvel().y, z: v.z }, true);
    // swing round to trail behind
    const toTruck = truck.pos.clone().sub(c.pos);
    const want = Math.atan2(-toTruck.x, -toTruck.z) + (T.end > 0 ? 0 : Math.PI);
    c.body.setAngvel({ x: 0, y: angDiff(c.heading, want) * 5, z: 0 }, true);
    c.expect = null; // (it's being dragged: that's not a crash)
    // into the chop shop: Dimitri takes it off your hands
    const chop = g.underworld.chopZone(c.pos);
    if (chop && Math.abs(truck.speed) < 3 && !c.ownedUid) {
      const price = g.underworld.carPrice(c);
      this.tow = null; c.towed = null;
      g.vehicles.remove(c);
      g.economy.addMoney(price, 'for the towed car');
      g.sfx.play('cash');
      g.hud.toast('Dimitri\'s boys take it off the hook', 0xffb36b);
      g.activities?.onChop(c);
    }
  }

  // ---- ferry: the north pier (off the Hollows' shore) <-> the Saltmarsh fishing dock
  buildFerry() {
    const g = this.game, Y = LAND_Y;
    const grp = new THREE.Group(); g.scene.add(grp);
    // a pier off the north shore of the Hollows (Verian's north end)
    const px = -950, z0 = g.hood.isl.z0, z1 = g.hood.isl.z0 - 50;
    const deck = std({ color: 0x8a6a48, roughness: 0.9 });
    const box = (w, h, d, x, y, z, m, col = true) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); b.receiveShadow = true; b.castShadow = true; grp.add(b); if (col) g.portSandbox.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z)); };
    box(8, 0.5, z0 - z1 + 2, px, Y - 0.5, (z0 + z1) / 2, deck);
    for (let z = z1 + 2; z < z0; z += 6) for (const s of [-1, 1]) box(0.4, 4, 0.4, px + s * 3.8, Y - 4, z, std({ color: 0x5a4a3a }), false);
    addPier(px - 4, px + 4, z1 - 1, z0 + 2);
    const ticket = new THREE.Group(); grp.add(ticket);
    box(3, 2.6, 2.2, px - 2, Y, z0 - 6, std({ color: 0x1f4f8a }));
    sign(grp, 'VERIAN FERRY', px, Y + 3.6, z0 - 3.5, 0, { w: 6, h: 1, bg: '#1f4f8a', fg: '#ffffff', glow: true, post: Y });
    const dk = g.saltmarsh.dock;
    sign(grp, 'FERRY TO VERIAN CITY', -795, Y + 3, dk.z + 60, Math.PI, { w: 6, h: 0.9, bg: '#1f4f8a', fg: '#ffffff', post: Y });
    // where the ferry ties up (alongside, its long axis along the pier), and where you board
    const A = { at: new THREE.Vector3(px + 9, 0, (z0 + z1) / 2 - 4), board: new THREE.Vector3(px + 2.5, Y, (z0 + z1) / 2 - 4), land: new THREE.Vector3(px, Y + 1.1, z0 - 10), yaw: Math.PI };
    const B = { at: new THREE.Vector3(-810, 0, dk.z + 67), board: new THREE.Vector3(-788, Y, dk.z + 67), land: new THREE.Vector3(-780, Y + 1.1, dk.z + 66), yaw: -Math.PI / 2 };
    this.ferry = new Ferry(g, A, B);
    this.ferryStops = [A, B];
  }

  action(pos) {
    const F = this.ferry, g = this.game;
    if (F.riding) return F.docked ? { label: 'Get off the ferry', run: () => F.disembark(true) } : null;
    for (const s of this.ferryStops) {
      if (Math.hypot(pos.x - s.board.x, pos.z - s.board.z) > 7 || Math.abs(pos.y - 1 - s.board.y) > 2) continue;
      if (F.docked === s) return { label: `Board the ferry to ${s === this.ferryStops[0] ? 'Saltmarsh Key' : 'Verian City'} ($10)`, run: () => F.board() };
      return { label: `Ferry's ${F.leg === 1 || F.leg === 3 ? 'on its way' : 'at the other side'}: wait here`, run: () => g.hud.toast('It runs every couple of minutes', 0x9ec5ff) };
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.ferry.update(dt);
    // bikes: lean into the corners; the rider shows when someone's on it
    this.bikes = this.bikes.filter((b) => b.mesh.parent); // (gone ones)
    for (const b of this.bikes) {
      const lean = b.mesh.userData.lean;
      const want = -THREE.MathUtils.clamp((b.steer || 0) * Math.abs(b.speed) * 0.05, -0.6, 0.6);
      lean.rotation.z += (want - lean.rotation.z) * Math.min(1, dt * 6);
      const ridden = g.vehicles.active === b || g.traffic.cars.includes(b);
      b.rider.root.visible = ridden && !b.wreck;
    }
    // buses pull in at the stops
    for (const bus of this.buses) {
      if (!g.traffic.cars.includes(bus)) continue;
      bus.stopCool -= dt;
      if (bus.stopT > 0) { bus.stopT -= dt; bus.body.setLinvel({ x: bus.vel.x * 0.85, y: bus.body.linvel().y, z: bus.vel.z * 0.85 }, true); continue; }
      if (bus.stopCool > 0) continue;
      for (const s of this.stops) if (Math.hypot(bus.pos.x - s.road.x, bus.pos.z - s.road.z) < 7 && bus.forward.dot(s.dir) > 0.7) { bus.stopT = 5; bus.stopCool = 15; break; }
    }
    this.updateTow(dt);
    void islandAt;
  }
}
