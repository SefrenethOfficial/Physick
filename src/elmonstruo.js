import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAND_Y, addPier, islandAt } from './world.js';
import { canvasTex, speckle, std, sign, solidBox, carMesh, worldBox } from './buildkit.js';
import { Car, clearSpot } from './carphys.js';
import { buildFigure, poseSeated } from './figure.js';
import { Heli } from './cargo.js';

// Mission 5, "El Monstruo" (the end of Act I). Drive the Courier and his two men from the
// garage by Saltmarsh's fishing dock to the Hollows in a monster truck. Don't touch him while
// his men are aboard. When they've gone, deal with him, then race back to the new dump at
// Verian docks while Ashen Hand cars and choppers try to stop you. Smash every car, then crush
// the truck.

const Y = LAND_Y;
export const GARAGE = { x: -800, z: -1240 };
export const DUMP = { x0: -700, x1: -630, z0: -200, z1: -150, bay: { x: -648, z: -175 } };
const CARS_TOTAL = 14;
const MAX_ALIVE = 6;

// ---------------------------------------------------------------- the truck
export function monsterTruckMesh() {
  const g = new THREE.Group();
  const paint = std({ color: 0x1d6b2e, roughness: 0.35, metalness: 0.4 });
  const dark = std({ color: 0x1b1d20, roughness: 0.6, metalness: 0.4 });
  const chrome = std({ color: 0xd8dde2, roughness: 0.2, metalness: 0.9 });
  const tyre = std({ color: 0x151515, roughness: 0.95 });
  const glass = std({ color: 0x223040, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.55 });
  const flames = std({ map: canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#1d6b2e'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = i * 26;
      const gr = c.createLinearGradient(x, h, x + 40, 0); gr.addColorStop(0, '#ffcc33'); gr.addColorStop(0.5, '#ff6a1a'); gr.addColorStop(1, 'rgba(200,30,10,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + 18, h * 0.4, x + 48, h * 0.15); c.quadraticCurveTo(x + 26, h * 0.6, x + 30, h); c.fill();
    }
    c.fillStyle = '#fff'; c.font = 'bold 30px "Chakra Petch", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeStyle = '#000'; c.lineWidth = 5; c.strokeText('EL MONSTRUO', w / 2, h / 2); c.fillText('EL MONSTRUO', w / 2, h / 2);
  }), roughness: 0.4, metalness: 0.3 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  // frame and body, lifted high over the wheels
  add(new THREE.BoxGeometry(2.0, 0.35, 6.2), dark, 0, 1.45, 0);
  const body = add(new THREE.BoxGeometry(2.9, 1.0, 6.6), [paint, paint, paint, dark, flames, flames].map((m) => m)[0], 0, 2.15, 0.1);
  body.material = [flames, flames, paint, dark, paint, paint]; // +x, -x sides get the flames
  add(new THREE.BoxGeometry(2.7, 1.25, 2.6), paint, 0, 3.27, 0.2); // cab
  add(new THREE.BoxGeometry(2.72, 0.75, 2.2), glass, 0, 3.4, 0.2); // windows all round
  add(new THREE.BoxGeometry(2.75, 0.08, 2.65), dark, 0, 3.92, 0.2);
  add(new THREE.BoxGeometry(2.0, 0.2, 0.3), chrome, 0, 2.0, -3.45); // front bumper
  add(new THREE.BoxGeometry(2.9, 0.5, 0.4), dark, 0, 1.7, -3.5); // bull bar
  for (const x of [-0.95, 0.95]) add(new THREE.BoxGeometry(0.1, 0.9, 0.12), chrome, x, 2.1, -3.6);
  add(new THREE.BoxGeometry(2.0, 0.15, 0.3), chrome, 0, 2.0, 3.45);
  // roof lights
  add(new THREE.BoxGeometry(2.2, 0.08, 0.1), chrome, 0, 4.05, -0.8);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.32, 0.22, 0.16), std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 1.2 }), -0.75 + i * 0.5, 4.17, -0.8);
  // headlights
  for (const x of [-1.05, 1.05]) add(new THREE.BoxGeometry(0.45, 0.25, 0.05), std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 1 }), x, 2.3, -3.21);
  // exhaust stacks behind the cab
  for (const x of [-1.25, 1.25]) { const p = add(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 10), chrome, x, 3.6, -1.15); void p; }
  // huge wheels
  const wheelGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.85, 20);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.9, 12); hubGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1.55, -2.25], [1.55, -2.25], [-1.55, 2.25], [1.55, 2.25]]) {
    add(wheelGeo, tyre, x, 0.95, z);
    add(hubGeo, chrome, x, 0.95, z);
  }
  // seats for the passengers, inside the cab
  g.userData.seats = [new THREE.Vector3(0.55, 2.95, -0.25), new THREE.Vector3(-0.55, 2.95, 0.85), new THREE.Vector3(0.55, 2.95, 0.85)];
  return g;
}

export class ElMonstruo {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.buildGarage();
    this.buildDump();
    this.cars = [];
    this.choppers = [];
  }

  // ---------------------------------------------------------------- places
  buildGarage() {
    const g = this.group, sb = this.game.portSandbox;
    const { x, z } = GARAGE;
    const wall = std({ color: 0x8d8a82, roughness: 0.9 });
    const roof = std({ color: 0x4a4f55, roughness: 0.6, metalness: 0.4 });
    // a two-bay workshop, door facing south towards the street
    solidBox(g, sb, 16, 6, 0.4, x, Y, z + 7, wall); // back
    solidBox(g, sb, 0.4, 6, 14, x - 8, Y, z, wall);
    solidBox(g, sb, 0.4, 6, 14, x + 8, Y, z, wall);
    solidBox(g, sb, 16.4, 0.4, 14.4, x, Y + 6, z, roof);
    solidBox(g, sb, 16, 1.4, 0.4, x, Y + 4.6, z - 7, wall); // over the doors
    for (const dx of [-7.6, 0, 7.6]) solidBox(g, sb, 0.6, 4.6, 0.4, x + dx, Y, z - 7, wall);
    const shutterM = std({ color: 0x6e7378, roughness: 0.5, metalness: 0.5 });
    const sh = new THREE.Mesh(worldBox(7, 1.2, 0.1, 2), shutterM); sh.position.set(x - 3.8, Y + 4, z - 7); g.add(sh); // rolled up
    const sh2 = new THREE.Mesh(worldBox(7, 1.2, 0.1, 2), shutterM); sh2.position.set(x + 3.8, Y + 4, z - 7); g.add(sh2);
    sign(g, 'DOCKSIDE MOTORS', x, Y + 5.3, z - 7.25, Math.PI, { w: 9, h: 1, bg: '#2a2c30', fg: '#ffd166' });
    // concrete apron out to the street, oil drums, a workbench
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(16, 60), std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#9b978f'; c.fillRect(0, 0, w, h); speckle(c, w, h, 300, 0.08); c.fillStyle = 'rgba(30,25,20,.35)'; c.beginPath(); c.arc(30, 40, 9, 0, 7); c.fill(); }, [3, 10]), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(x, Y + 0.04, z - 30); g.add(apron);
    for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 12), std({ color: [0x2f5a8a, 0xb3261e, 0x3a3c40][i % 3] })); d.position.set(x + 6.5, Y + 0.5, z + 5 - i * 0.8); g.add(d); }
    solidBox(g, sb, 3, 0.9, 1, x - 6, Y, z + 6, std({ color: 0x5a3e2a }));
    this.truckSpot = { x: x - 3.8, z: z - 14, heading: 0 };
    this.crewSpot = new THREE.Vector3(x + 3, Y, z - 9);
  }

  buildDump() {
    const g = this.group, sb = this.game.portSandbox;
    const { x0, x1, z0, z1 } = DUMP;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // a concrete wharf on piles, with a road in from the end of the city's south street
    const slabM = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#8f8b84'; c.fillRect(0, 0, w, h); speckle(c, w, h, 400, 0.1); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, 0, w, 1); c.fillRect(0, 0, 1, h); }, [(x1 - x0) / 6, (z1 - z0) / 6]), roughness: 0.95 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0), slabM);
    slab.position.set(cx, Y - 0.5, cz); slab.receiveShadow = true; g.add(slab);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.5, (z1 - z0) / 2).setTranslation(cx, Y - 0.5, cz));
    addPier(x0, x1, z0, z1);
    for (let px = x0 + 4; px < x1; px += 10) for (const pz of [z0 + 1, z1 - 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8, 8), std({ color: 0x4a4640 })); p.position.set(px, Y - 4, pz); g.add(p); }
    const road = new THREE.Mesh(new THREE.PlaneGeometry(34, 16), std({ color: 0x45484c, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
    road.rotation.x = -Math.PI / 2; road.position.set(-717, Y + 0.05, -175); g.add(road);
    // chain-link fence round three sides, gate gap facing the city
    const fence = std({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0.45 });
    const run = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, len), fence);
      m.position.set((ax + bx) / 2, Y + 1.2, (az + bz) / 2); m.rotation.y = Math.atan2(bx - ax, bz - az); m.userData.noMerge = true; g.add(m);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.05, 1.2, len / 2).setTranslation(m.position.x, m.position.y, m.position.z).setRotation(q));
    };
    run(x0 + 0.5, z0 + 0.5, x1 - 0.5, z0 + 0.5); run(x0 + 0.5, z1 - 0.5, x1 - 0.5, z1 - 0.5); run(x1 - 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5);
    run(x0 + 0.5, z0 + 0.5, x0 + 0.5, -183); run(x0 + 0.5, -167, x0 + 0.5, z1 - 0.5);
    sign(g, 'VERIAN SCRAP & SALVAGE', x0 + 0.6, Y + 3.3, -175, -Math.PI / 2, { w: 9, h: 1.1, bg: '#7a2e1e', fg: '#ffe7a0', post: Y });
    // scrap heaps: stacks of flattened cars
    const scrapCols = [0x6a5a4a, 0x3a4a5a, 0x7a2a2a, 0x4a4a40, 0x5a6a6a];
    for (const [sx, sz] of [[-690, -195], [-680, -195], [-670, -195], [-690, -155], [-680, -155], [-668, -156]]) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) solidBox(g, sb, 4.4, 0.55, 2, sx + (Math.random() - 0.5) * 0.6, Y + k * 0.55, sz + (Math.random() - 0.5) * 0.4, std({ color: scrapCols[(k + n) % 5], roughness: 0.8, metalness: 0.4 }), { rotY: (Math.random() - 0.5) * 0.2 });
    }
    // the crusher: a steel frame over a bay, with a heavy plate hanging in it
    const steel = std({ color: 0xd9a400, roughness: 0.5, metalness: 0.5 });
    const { bay } = DUMP;
    for (const [dx, dz] of [[-5, -6], [5, -6], [-5, 6], [5, 6]]) solidBox(g, sb, 0.8, 9, 0.8, bay.x + dx, Y, bay.z + dz, steel);
    solidBox(g, sb, 11, 1, 13, bay.x, Y + 9, bay.z, steel, { collide: false });
    for (const s of [-1, 1]) solidBox(g, sb, 9, 1.2, 0.6, bay.x, Y, bay.z + s * 6.2, std({ color: 0x3a3c40 }));
    solidBox(g, sb, 0.6, 1.2, 13, bay.x + 5.2, Y, bay.z, std({ color: 0x3a3c40 }));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(9, 0.8, 11.4), std({ color: 0x3a3c40, roughness: 0.4, metalness: 0.7 }));
    plate.position.set(bay.x, Y + 8.2, bay.z); plate.userData.noMerge = true;
    this.plate = plate;
    this.game.scene.add(plate);
    const stripes = new THREE.Mesh(new THREE.PlaneGeometry(9, 11.4), std({ map: canvasTex(64, 64, (c, w, h) => { for (let i = -h; i < w; i += 16) { c.fillStyle = '#e8c547'; c.fillRect(0, 0, 0, 0); c.save(); c.translate(i, 0); c.rotate(0.6); c.fillRect(0, -20, 8, h * 2); c.restore(); } }), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
    stripes.rotation.x = -Math.PI / 2; stripes.position.set(bay.x, Y + 0.06, bay.z); stripes.userData.noMerge = true; g.add(stripes);
  }

  inBay(p) { const b = DUMP.bay; return Math.abs(p.x - b.x) < 4.2 && Math.abs(p.z - b.z) < 5.6; }
  atDump(p) { return p.x > DUMP.x0 - 30 && p.x < DUMP.x1 && p.z > DUMP.z0 && p.z < DUMP.z1; }

  // ---------------------------------------------------------------- the mission's actors
  spawnTruck() {
    const g = this.game;
    this.removeTruck();
    const mesh = monsterTruckMesh();
    const s = this.truckSpot;
    const t = new Car(g, { mesh, x: s.x, z: s.z, heading: s.heading, hp: 1700, half: { x: 1.45, y: 1.05, z: 3.45 }, density: 420, wheelbase: 4.5, maxSpeed: 31, ride: 1.0 });
    t.monster = true;
    t.type = { name: 'El Monstruo', hp: t.maxHp, car: true };
    t.base = 0;
    g.vehicles.list.push(t);
    this.truck = t;
    // passengers: the Courier up front, his two men in the back
    const looks = [
      { shirt: 0x6a2a24, pants: 0x1d1f22, skin: 0xd9a47c, hat: null },
      { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0xa8724f, hat: 'cap', hatColor: 0x111111 },
      { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0x7a4f35, hat: 'cap', hatColor: 0x111111 },
    ];
    this.riders = looks.map((look, i) => {
      const f = buildFigure(look);
      poseSeated(f.parts);
      f.root.position.copy(mesh.userData.seats[i]);
      mesh.add(f.root);
      return f;
    });
    return t;
  }

  removeTruck() {
    const g = this.game, t = this.truck;
    if (!t) return;
    if (g.vehicles.active === t) g.vehicles.active = null;
    if (g.vehicles.list.includes(t)) g.vehicles.remove(t);
    this.truck = null;
  }

  // standing by the garage before the job: the Courier and his men
  spawnCrew() {
    const g = this.game;
    this.crew = [];
    const looks = [
      { shirt: 0x6a2a24, pants: 0x1d1f22, skin: 0xd9a47c },
      { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0xa8724f, hat: 'cap', hatColor: 0x111111 },
      { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0x7a4f35, hat: 'cap', hatColor: 0x111111 },
    ];
    looks.forEach((look, i) => {
      const n = g.citizens.spawnCitizen('town', 'escort', this.crewSpot.clone().add(new THREE.Vector3(i * 1.4, 0, (i % 2) * 1.2)), { look });
      if (!n) return;
      n.heading = Math.PI;
      n.speed = 0;
      n.walkTo = null;
      n.hold = true;
      this.crew.push(n);
    });
    for (const f of this.riders || []) f.root.visible = false;
  }

  clearCrew() {
    const c = this.game.citizens;
    for (const n of this.crew || []) if (c.list.includes(n)) c.despawn(n);
    this.crew = [];
  }

  // ---- Ashen Hand cars ----
  candidateSpawns(from) {
    const g = this.game, out = [];
    for (const R of [g.city, g.saltmarsh, g.hood]) for (const x of R.xs) for (const z of R.zs) out.push(new THREE.Vector3(x, Y, z));
    const road = g.park.road;
    for (let i = 0; i < road.length; i += 12) out.push(new THREE.Vector3(road[i].x, road[i].y, road[i].z));
    return out.filter((p) => { const d = Math.hypot(p.x - from.x, p.z - from.z); return d > 70 && d < 190; });
  }

  spawnCar() {
    const g = this.game, t = this.truck;
    if (!t) return null;
    const c = this.candidateSpawns(t.pos);
    if (!c.length) return null;
    // prefer spots ahead of or beside the truck so they come at you
    const f = t.forward;
    c.sort((a, b) => ((b.x - t.pos.x) * f.x + (b.z - t.pos.z) * f.z) - ((a.x - t.pos.x) * f.x + (a.z - t.pos.z) * f.z) + (Math.random() - 0.5) * 120);
    // never inside a building, a wall or a tree
    const p = c.find((q) => clearSpot(g, q.x, q.z, Math.atan2(-(t.pos.x - q.x), -(t.pos.z - q.z)), undefined, q.y));
    if (!p) return null;
    const heading = Math.atan2(-(t.pos.x - p.x), -(t.pos.z - p.z));
    // one in four is an armoured SUV that takes a couple of good hits
    const armoured = Math.random() < 0.28;
    const car = new Car(g, { color: armoured ? 0x2a2f24 : 0x15171a, x: p.x, z: p.z, heading, hp: armoured ? 170 : 95, maxSpeed: 37 });
    car.ashen = true;
    car.armoured = armoured;
    car.shootT = 2 + Math.random() * 2;
    this.cars.push(car);
    this.spawned++;
    return car;
  }

  spawnChopper() {
    const g = this.game, t = this.truck;
    const h = new Heli(g);
    h.root.traverse((o) => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0x1f2a3a) { o.material = o.material.clone(); o.material.color.set(0x111214); } });
    h.ladder.visible = false;
    const from = t.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 200, 60, (Math.random() - 0.5) * 200));
    const c = { h, pos: from, hp: 1, t: 0, swoopT: 8 + Math.random() * 6, shootT: 3, side: Math.random() < 0.5 ? -1 : 1, falling: false, vy: 0 };
    h.root.visible = true;
    h.root.position.copy(from);
    this.choppers.push(c);
    return c;
  }

  // gunfire from a car or chopper at the truck; you're inside, so it's you that gets hurt
  shootAt(from, chance) {
    const g = this.game, t = this.truck;
    const to = t.pos.clone().add(new THREE.Vector3(0, 3.2, 0));
    const hit = Math.random() < chance;
    if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 2, (Math.random() - 0.5) * 6));
    g.police.tracer(from, to);
    g.fx.flash(from, 0xffc060, 0.8, 0.06);
    g.sfx.play('smg');
    if (hit && g.vehicles.active === t) { g.health.damage(4, 'goon'); t.damage(11); }
  }

  // ---------------------------------------------------------------- per frame
  updateEnemies(dt, a) {
    const g = this.game, t = this.truck;
    if (!t) return;
    // cars: chase and ram, shoot out of the windows
    for (const c of [...this.cars]) {
      if (c.wreck || c.sinking) {
        if (!c.counted) { c.counted = true; a.destroyed++; g.hud.toast(`Ashen Hand car wrecked (${a.destroyed}/${CARS_TOTAL})`, 0x7be08a); }
        c.coast(dt);
        if ((c.wreckT || 0) > 25) { c.dispose(); this.cars.splice(this.cars.indexOf(c), 1); }
        continue;
      }
      const lead = t.pos.clone().addScaledVector(t.vel, 0.5);
      const d = c.pos.distanceTo(t.pos);
      c.driveTo(dt, d > 30 ? 37 : 32, lead, { maxSpeed: 37, accel: 16, grip: 13 });
      // El Monstruo flattens anything it hits
      c.truckT = (c.truckT || 0) - dt;
      const rel = c.vel.clone().sub(t.vel).length();
      if (d < 4.8 && c.truckT <= 0 && (Math.abs(t.speed) > 5 || rel > 8)) {
        c.truckT = 0.5;
        c.damage(30 + Math.abs(t.speed) * 3 + rel * 1.5);
        const push = c.pos.clone().sub(t.pos).setY(0).normalize().multiplyScalar(6 + Math.abs(t.speed) * 0.6);
        c.body.applyImpulse({ x: push.x * c.body.mass(), y: 0, z: push.z * c.body.mass() }, true);
        c.dent(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), 0.3);
        g.sfx.play('crash');
        g.shake = Math.max(g.shake || 0, 0.6);
        t.damage(c.armoured ? 22 : 12);
        if (g.vehicles.active === t) g.health.damage(c.armoured ? 5 : 2, 'carCrash');
      }
      c.shootT -= dt;
      if (c.shootT <= 0 && d < 45) { c.shootT = 1.1 + Math.random() * 1.2; this.shootAt(c.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), d < 20 ? 0.38 : 0.2); }
    }
    // choppers: circle and shoot, then swoop low across your path (ram them!)
    for (const c of [...this.choppers]) {
      c.t += dt;
      const h = c.h;
      if (c.falling) {
        c.vy -= 14 * dt; c.pos.y += c.vy * dt; c.pos.x += c.drift.x * dt; c.pos.z += c.drift.z * dt;
        h.root.position.copy(c.pos); h.root.rotation.z += dt * 3; h.root.rotation.y += dt * 4;
        if (Math.random() < dt * 30) g.fx.emit(c.pos.clone(), new THREE.Vector3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2), 0x333333, 2, -0.1, 0.5);
        if (c.pos.y < Y - 2 || c.t > 6) { g.blast?.(c.pos.clone().setY(Math.max(c.pos.y, Y + 0.5)), 6, 30, false); g.sfx.play('explosion'); h.root.removeFromParent(); this.choppers.splice(this.choppers.indexOf(c), 1); }
        continue;
      }
      const f = t.forward, r = new THREE.Vector3(-f.z, 0, f.x);
      let target;
      if (a.carsDone) target = c.pos.clone().add(new THREE.Vector3(0, 40, 0)).addScaledVector(r, 30); // they give up
      else if (c.swoopT <= 0) {
        // drop down across the road ahead and hang there, trying to block you
        if (!c.swoopAt) c.swoopAt = t.pos.clone().addScaledVector(f, 26 + Math.abs(t.speed) * 1.1).add(new THREE.Vector3(0, 2.3, 0));
        target = c.swoopAt;
      }
      else target = t.pos.clone().addScaledVector(r, c.side * 16).addScaledVector(f, 6).add(new THREE.Vector3(0, 10, 0));
      c.swoopT -= dt;
      if (c.swoopT < -5) { c.swoopT = 9 + Math.random() * 6; c.side *= -1; c.swoopAt = null; }
      c.pos.lerp(target, Math.min(1, dt * (c.swoopT <= 0 ? 1.6 : 1.0)));
      h.root.position.copy(c.pos);
      h.root.position.y += Math.sin(c.t * 1.3) * 0.3;
      const look = t.pos.clone().sub(c.pos);
      h.root.rotation.set(0.12, Math.atan2(look.x, look.z), Math.sin(c.t) * 0.05);
      h.rotor.rotation.y = c.t * 25; h.tail.rotation.x = c.t * 40;
      if (a.carsDone && c.pos.y > t.pos.y + 45) { h.root.removeFromParent(); this.choppers.splice(this.choppers.indexOf(c), 1); continue; }
      c.shootT -= dt;
      if (c.shootT <= 0 && c.swoopT > 0 && !a.carsDone) { c.shootT = 0.9 + Math.random() * 0.8; this.shootAt(c.pos.clone().add(new THREE.Vector3(0, -1, 0)), 0.36); }
      // rammed: the truck's up to the chopper's height and moving
      const dh = Math.hypot(c.pos.x - t.pos.x, c.pos.z - t.pos.z);
      if (dh < 5.5 && c.pos.y - t.pos.y < 5 && Math.abs(t.speed) > 4) {
        c.falling = true; c.vy = 6; c.t = 0;
        c.drift = t.forward.clone().multiplyScalar(t.speed * 0.6);
        g.sfx.play('crash'); g.shake = 1;
        a.choppersDown = (a.choppersDown || 0) + 1;
        g.hud.toast('Chopper down!', 0x7be08a);
      }
    }
  }

  clearEnemies() {
    for (const c of this.cars) c.dispose();
    this.cars = [];
    for (const c of this.choppers) c.h.root.removeFromParent();
    this.choppers = [];
  }
}

export { CARS_TOTAL, MAX_ALIVE, islandAt, carMesh };
