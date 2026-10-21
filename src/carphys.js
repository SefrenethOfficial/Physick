import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS } from './groups.js';
import { carMesh } from './buildkit.js';
import { LAND_Y, blocked, nearestLandPoint } from './world.js';

// One physical car: a dynamic box in the shore physics world, so cars shove each other,
// spin out when they're hit, bounce off walls and push loose stuff around. Driving is an
// arcade tyre model (grip kills sideways slide, a bicycle model turns it), and crashes dent
// the bodywork, smash glass, start smoke and fire, and finally blow the car up.

const WHEELBASE = 2.7;
const HALF = { x: 0.95, y: 0.55, z: 2.25 };
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };
const yawOf = (q) => new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ').y;

export class Car {
  constructor(game, { color = 0x2f7fd8, police = false, x, z, heading = 0, hp } = {}) {
    this.game = game;
    this.police = police;
    this.mesh = carMesh(color, police);
    game.scene.add(this.mesh);
    const w = game.portWorld;
    const y = this.groundAt(x, z);
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0)))
      .setGravityScale(0)
      .enabledRotations(false, true, false)
      .setLinearDamping(0.05)
      .setAngularDamping(0.4)
      .setCcdEnabled(true)
      .setCanSleep(true));
    this.collider = w.createCollider(RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z)
      .setTranslation(0, 0.55 + HALF.y, 0)
      .setDensity(120).setFriction(0.35).setRestitution(0.15)
      .setCollisionGroups(GROUPS.car)
      .setActiveEvents(RAPIER.ActiveEvents.NONE), this.body);
    this.pos = new THREE.Vector3(x, y, z);
    this.heading = heading;
    this.speed = 0;
    this.vel = new THREE.Vector3();
    this.expect = null; // the velocity we asked for, to spot crashes
    this.steer = 0;
    this.maxHp = hp ?? (police ? 160 : 100);
    this.hp = this.maxHp;
    this.wreck = false;
    this.dazedT = 0;
    this.hitT = 0;
    this.dentTotal = 0;
    this.groundT = 0;
    this.groundY = y;
    this.lights = this.mesh.userData.lights || null;
  }

  get forward() { return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }

  // Road surface under (x, z), searched from just above the car (hills, bridges, kerbs).
  groundAt(x, z, fromY = (this.pos ? this.pos.y : LAND_Y) + 2.5) {
    const sb = this.game.portSandbox;
    const hit = sb.world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), 8, true, undefined, undefined, undefined, undefined,
      (col) => sb.staticColliders.has(col.handle));
    this.lastGroundHit = !!hit;
    return hit ? fromY - hit.timeOfImpact : (this.pos ? this.pos.y : LAND_Y);
  }

  // Read the physics body back (call after the world has stepped).
  sync(dt) {
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.heading = yawOf(r);
    this.vel.set(v.x, 0, v.z);
    const f = this.forward;
    this.speed = this.vel.dot(f);
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    // a crash: the velocity changed far more than we asked it to
    if (this.expect && !this.wreck) {
      const dv = new THREE.Vector3(v.x - this.expect.x, 0, v.z - this.expect.z);
      const m = dv.length();
      if (m > 3.2) this.impact(dv, m);
    }
    this.expect = null;
    this.hitT -= dt;
    if (this.lights) { const on = (performance.now() / 160) % 2 < 1; this.lights.glowR.visible = on; this.lights.glowB.visible = !on; }
    // smoke, then fire, as it's beaten up
    const fx = this.game.fx;
    if (!this.wreck && this.hp < this.maxHp * 0.45 && Math.random() < dt * (this.hp < this.maxHp * 0.2 ? 30 : 10)) {
      const p = this.pos.clone().addScaledVector(f, 1.7).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.1, (Math.random() - 0.5) * 0.6));
      const fire = this.hp < this.maxHp * 0.2;
      fx.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.4, fire ? 2.5 : 1.6, (Math.random() - 0.5) * 0.4), fire ? (Math.random() < 0.5 ? 0xff7a1a : 0xffc040) : 0x555555, fire ? 0.5 : 1.6, -0.2, 0.4);
      if (fire && Math.random() < dt * 0.6) this.damage(1.5); // burning down
    }
    if (this.wreck) {
      this.wreckT += dt;
      if (Math.random() < dt * 8) fx.emit(this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5), 1.4, (Math.random() - 0.5))), new THREE.Vector3(0, 2 + Math.random(), 0), 0x2a2a2a, 2.5, -0.1, 0.3);
    }
  }

  impact(dv, m) {
    if (this.hitT > 0) return;
    this.hitT = 0.25;
    const g = this.game;
    const mine = g.vehicles?.active === this;
    this.damage((m - 3) * 2.4);
    // which side took it: the velocity jumped away from whatever we hit
    const local = dv.clone().multiplyScalar(-1 / m).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading);
    this.dent(local, Math.min(0.32, (m - 2.5) * 0.035));
    this.dazedT = Math.min(2.5, m * 0.18);
    g.sfx.play(m > 9 ? 'crash' : 'thud');
    if (m > 7) { // glass
      for (let i = 0; i < 10; i++) g.fx.emit(this.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 2, (Math.random() - 0.5) * 5), 0xbfe0ff, 0.6, 1, 0.2);
    }
    if (mine) {
      g.shake = Math.min(1.2, m / 14);
      if (m > 13) g.health.damage((m - 13) * 2, 'carCrash');
    }
  }

  // Push the bodywork in around the point on the side facing `dir` (car-local, unit).
  dent(dir, amount) {
    if (this.dentTotal > 3 || amount <= 0) return;
    this.dentTotal += amount;
    const body = this.mesh.userData.body;
    if (!body) return;
    const pos = body.geometry.attributes.position;
    const c = new THREE.Vector3(THREE.MathUtils.clamp(dir.x * 3, -1, 1) * HALF.x, 0.85, THREE.MathUtils.clamp(dir.z * 3, -1, 1) * HALF.z);
    const R = 1.25;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.y < 0.42) continue; // leave the wheels round
      const d = Math.hypot(v.x - c.x, (v.y - c.y) * 0.8, v.z - c.z);
      if (d > R) continue;
      const k = amount * (1 - d / R) ** 2 * (0.8 + Math.random() * 0.4);
      v.addScaledVector(dir, -k);
      v.y -= k * 0.25;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    body.geometry.computeVertexNormals();
  }

  damage(n) {
    if (this.wreck || n <= 0) return;
    this.hp -= n;
    if (this.game.vehicles?.active === this) this.game.hud.boatHit(n);
    if (this.hp <= 0) this.explode();
  }

  explode() {
    const g = this.game;
    this.wreck = true;
    this.wreckT = 0;
    this.mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.multiplyScalar(0.15);
      if (o.material.emissive) o.material.emissive.set(0);
    });
    if (this.lights) { this.lights.glowR.visible = this.lights.glowB.visible = false; this.lights = null; }
    this.body.setLinvel({ x: (Math.random() - 0.5) * 4, y: 0, z: (Math.random() - 0.5) * 4 }, true);
    this.body.setAngvel({ x: 0, y: (Math.random() - 0.5) * 3, z: 0 }, true);
    if (g.vehicles?.active === this) {
      g.vehicles.active = null;
      g.placeOnShore(this.pos.clone().add(new THREE.Vector3(2.5, 1.2, 0)), this.heading);
      g.health.damage(50, 'carExplosion');
    }
    g.blast?.(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 7, 60, false);
    g.sfx.play('explosion');
  }

  // Keep the car on the road surface (we have no gravity; kerbs pass under the body).
  hover(dt) {
    if (this.sinking || (!blocked(this.pos.x, this.pos.z, 1) && !this.overDeck())) return this.sinkInto(dt);
    this.groundT -= dt;
    if (this.groundT <= 0) {
      // ride on the highest of front, middle and back so climbing a hill doesn't dig the nose in
      this.groundT = 0.05;
      const f = this.forward;
      const lead = 1.8 + Math.min(Math.abs(this.speed) * 0.08, 2);
      this.groundY = Math.max(this.groundAt(this.pos.x, this.pos.z),
        this.groundAt(this.pos.x + f.x * lead, this.pos.z + f.z * lead),
        this.groundAt(this.pos.x - f.x * lead, this.pos.z - f.z * lead));
    }
    return THREE.MathUtils.clamp((this.groundY - this.pos.y) * 14, -8, 10);
  }

  // Is there something solid under us (a bridge deck) even though we're over water?
  overDeck() {
    this.groundAt(this.pos.x, this.pos.z);
    return this.lastGroundHit;
  }

  // Driven off the edge: it goes down like a stone (and you swim for it).
  sinkInto(dt) {
    const g = this.game;
    if (!this.sinking) {
      this.sinking = true;
      g.sfx.play('splash');
      g.fx.splash?.(this.pos.clone(), true);
      if (g.vehicles?.active === this) {
        g.vehicles.active = null;
        const p = nearestLandPoint(this.pos.x, this.pos.z);
        g.placeOnShore(new THREE.Vector3(p.x, LAND_Y + 1.2, p.z), this.heading);
        g.hud.toast('Your car went in the water', 0xff8a6a);
        g.health.damage(10, 'drown');
      }
    }
    if (this.pos.y < LAND_Y - 5 && !this.wreck) { this.wreck = true; this.wreckT = 30; this.mesh.visible = false; }
    return -2.5;
  }

  // Nobody driving: it rolls to a stop (wrecks and parked cars can still be shoved about).
  coast(dt) {
    const v = this.body.linvel();
    const k = Math.max(0, 1 - dt * (this.wreck ? 2.5 : 1.6));
    const vy = this.hover(dt);
    if (Math.hypot(v.x, v.z) < 0.05 && Math.abs(vy) < 0.05) return;
    this.body.setLinvel({ x: v.x * k, y: vy, z: v.z * k }, true);
    const av = this.body.angvel();
    this.body.setAngvel({ x: 0, y: av.y * k, z: 0 }, true);
  }

  // Low-level: approach a forward speed and steering angle (+ = left) with tyre grip.
  apply(dt, targetSpeed, steerAngle, { accel = 9, brake = 18, grip = 10, maxSpeed = 30, steerRate = 8, yawResponse = 1.2 } = {}) {
    if (this.wreck || this.sinking) { this.coast(dt); return; }
    const dazed = this.dazedT > 0;
    if (dazed) { this.dazedT -= dt; grip *= 0.25; accel *= 0.3; }
    const v = this.body.linvel();
    const f = this.forward, r = new THREE.Vector3(-f.z, 0, f.x);
    let vf = v.x * f.x + v.z * f.z, vr = v.x * r.x + v.z * r.z;
    const want = THREE.MathUtils.clamp(targetSpeed, -9, maxSpeed);
    const slowing = Math.abs(want) < Math.abs(vf) || Math.sign(want) !== Math.sign(vf);
    vf += THREE.MathUtils.clamp(want - vf, -(slowing ? brake : accel) * dt, (slowing ? brake : accel) * dt);
    vr *= Math.max(0, 1 - grip * dt);
    const vy = this.hover(dt);
    const nv = { x: f.x * vf + r.x * vr, y: vy, z: f.z * vf + r.z * vr };
    this.body.setLinvel(nv, true);
    this.steer = THREE.MathUtils.lerp(this.steer, steerAngle, Math.min(1, dt * steerRate));
    const yawRate = (vf / WHEELBASE) * Math.tan(this.steer);
    const av = this.body.angvel();
    this.body.setAngvel({ x: 0, y: av.y + (yawRate - av.y) * Math.min(1, dt * grip * yawResponse), z: 0 }, true);
    this.expect = new THREE.Vector3(nv.x, 0, nv.z);
  }

  // Player controls: throttle -1..1, steer -1 (right) .. 1 (left), handbrake.
  driveInput(dt, throttle, steer, handbrake) {
    const max = this.police ? 36 : 30;
    const vf = this.speed;
    let target = vf;
    if (throttle > 0) target = vf < -0.5 ? 0 : Math.min(max, vf + 12);
    else if (throttle < 0) target = vf > 0.5 ? 0 : -9;
    else target = vf * 0.97;
    // tight, direct steering: plenty of lock even at speed, and the tyres bite hard
    const lock = 0.62 / (1 + Math.abs(vf) * 0.022) * (handbrake ? 1.35 : 1);
    this.apply(dt, handbrake ? vf * 0.9 : target, steer * lock, {
      accel: 10 - Math.abs(vf) * 0.12, brake: handbrake ? 6 : 20, grip: handbrake ? 1.8 : 16, maxSpeed: max, steerRate: 16, yawResponse: handbrake ? 2 : 3,
    });
  }

  // AI: drive at targetSpeed toward a point.
  driveTo(dt, targetSpeed, aim, opts = {}) {
    const want = Math.atan2(-(aim.x - this.pos.x), -(aim.z - this.pos.z));
    const ang = angDiff(this.heading, want);
    const reverse = targetSpeed < 0;
    const steer = THREE.MathUtils.clamp((reverse ? -ang : ang) * 1.6, -0.6, 0.6);
    this.apply(dt, targetSpeed, steer, opts);
    return ang;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.game.portWorld.removeRigidBody(this.body);
  }
}

// Anyone in front of a moving car gets hit: the player (hurt and thrown) and townspeople (killed
// at speed). byPlayer: you're driving, so it's your crime.
export function runOver(g, car, byPlayer) {
  if (car.wreck || Math.abs(car.speed) < 3) return;
  const f = car.forward, r = new THREE.Vector3(-f.z, 0, f.x);
  const dirSign = Math.sign(car.speed);
  const inBox = (x, z) => {
    const dx = x - car.pos.x, dz = z - car.pos.z;
    const a = (dx * f.x + dz * f.z) * dirSign;
    return a > -1 && a < 2.7 && Math.abs(dx * r.x + dz * r.z) < 1.3;
  };
  const pt = g.shorePlayer.body.translation();
  const onFoot = g.onShore && !g.flying && !g.boats.active && !g.vehicles?.active && !g.health.dead;
  car.bumpT = (car.bumpT || 0) - 1 / 60;
  if (!byPlayer && onFoot && car.bumpT <= 0 && Math.abs(pt.y - car.pos.y - 1) < 1.6 && inBox(pt.x, pt.z)) {
    car.bumpT = 1;
    g.health.damage(Math.abs(car.speed) * 2.2, car.police ? 'car' : 'traffic');
    g.shorePlayer.vel.addScaledVector(f, car.speed * 0.8).add(new THREE.Vector3(0, 4, 0));
    g.shake = 0.7;
    g.sfx.play('thud');
    g.sfx.play('honk');
  }
  for (const n of [...g.citizens.list]) {
    const t = n.body.translation();
    if (!inBox(t.x, t.z)) continue;
    const v = f.clone().multiplyScalar(car.speed * 1.1); v.y = 3 + Math.abs(car.speed) * 0.15;
    const lethal = Math.abs(car.speed) > 8;
    const cop = n.role === 'cop';
    g.citizens.knockOver(n, v, 5, { killed: lethal, point: new THREE.Vector3(t.x, t.y, t.z), dir: f.clone() });
    if (byPlayer) g.police.crime(lethal ? (cop ? 'copkill' : 'murder') : 'assault', lethal ? (cop ? 3 : 2) : 1, new THREE.Vector3(t.x, t.y, t.z));
    else g.sfx.play('honk');
    car.damage(2);
  }
}
