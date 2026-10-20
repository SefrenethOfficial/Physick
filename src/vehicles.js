import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAND_Y, blocked, islandAt } from './world.js';

// Grand theft auto: drag a driver out of their car (or take a cop car) and drive it.
// Arcade handling: a bicycle-model car that hits walls, kerbs, other cars and people.

const HALF = { x: 0.95, y: 0.55, z: 2.25 };
const WHEELBASE = 2.7;
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = []; // cars that have been taken (driven now, or left wherever you got out)
    this.active = null;
    this.camQuat = new THREE.Quaternion();
    this.shape = new RAPIER.Cuboid(HALF.x, HALF.y, HALF.z);
  }

  // A car you could get into from where you're standing: someone else's, or one you left.
  nearby(pos) {
    const g = this.game;
    let best = null, bd = 3.6;
    const consider = (car, kind) => {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bd && Math.abs(pos.y - LAND_Y - 1) < 2.5) { bd = d; best = { car, kind }; }
    };
    for (const v of this.list) if (!v.wreck) consider(v, 'mine');
    for (const c of g.traffic.cars) if (c.speed < 6) consider(c, 'traffic');
    for (const c of g.police.cars) if (c.speed < 6) consider(c, 'police');
    return best;
  }

  // Take a car from the traffic or the police: the driver is thrown out and the theft is a crime.
  steal({ car, kind }, drive = true) {
    const g = this.game;
    if (kind === 'mine') { this.enter(car); return; }
    const police = kind === 'police';
    if (police) g.police.cars.splice(g.police.cars.indexOf(car), 1);
    else g.traffic.cars.splice(g.traffic.cars.indexOf(car), 1);
    const v = {
      mesh: car.mesh, body: car.body, pos: car.pos.clone(), heading: car.heading, speed: 0, y: LAND_Y,
      police, hp: police ? 160 : 100, maxHp: police ? 160 : 100, base: 350 + Math.floor(Math.random() * 6) * 70,
      type: { name: police ? 'Police car' : 'Stolen car', hp: police ? 160 : 100, car: true },
      lights: car.mesh.userData.lights || null, wreck: false, wreckT: 0, hitT: 0,
    };
    v.mesh.visible = true;
    this.list.push(v);
    // the driver gets dragged out
    const fwd = new THREE.Vector3(-Math.sin(v.heading), 0, -Math.cos(v.heading));
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(-2.2);
    const at = v.pos.clone().add(side);
    const island = islandAt(at.x, at.z, 2)?.id;
    const victim = (!police || !car.deployed) && (island === 'city' || island === 'town')
      ? g.citizens.spawnCitizen(island, police ? 'cop' : 'civ', new THREE.Vector3(at.x, LAND_Y, at.z)) : null;
    const where = new THREE.Vector3(v.pos.x, LAND_Y + 1, v.pos.z);
    if (victim) {
      victim.stunT = 0.8;
      if (police) { victim.state = 'chase'; victim.lastSeen = where.clone(); victim.dispatched = true; g.police.report(2, where, true, 'copcar'); }
      else {
        g.citizens.flee(victim, where, 10);
        Object.assign(victim, { reportT: 2, reportSev: 1, reportPos: where.clone(), reportSeen: true, reportWhy: 'carjack' });
      }
    }
    g.police.crime(police ? 'copcar' : 'carjack', police ? 2 : 1, where);
    g.sfx.play('thud');
    if (drive) this.enter(v);
  }

  enter(v) {
    const g = this.game;
    g.endDrag(false);
    g.clearDropHeld();
    this.active = v;
    this.camQuat.setFromEuler(new THREE.Euler(0, v.heading, 0));
    g.hud.setMode('car');
    g.sfx.play('engineStart');
  }

  exit() {
    const v = this.active;
    if (!v) return false;
    if (Math.abs(v.speed) > 5) { this.game.hud.toast('Slow down first'); return false; }
    const fwd = new THREE.Vector3(-Math.sin(v.heading), 0, -Math.cos(v.heading));
    const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let out = v.pos.clone().addScaledVector(left, 2.1);
    if (!blocked(out.x, out.z)) out = v.pos.clone().addScaledVector(left, -2.1);
    this.active = null;
    v.speed = 0;
    this.game.sfx.setEngine(false);
    this.game.placeOnShore(new THREE.Vector3(out.x, v.y + 1.1, out.z), v.heading);
    return true;
  }

  remove(v) {
    if (v === this.active) this.active = null;
    v.mesh.removeFromParent();
    this.game.portWorld.removeRigidBody(v.body);
    this.list.splice(this.list.indexOf(v), 1);
  }

  damage(v, n) {
    if (v.wreck || n <= 0) return;
    v.hp -= n;
    if (v === this.active) this.game.hud.boatHit(n);
    if (v.hp <= 0) this.explode(v);
  }

  explode(v) {
    const g = this.game;
    v.wreck = true;
    v.wreckT = 0;
    const p = v.pos.clone().add(new THREE.Vector3(0, 1, 0));
    g.fx.explosion(p);
    g.sfx.play('explosion');
    v.mesh.traverse((o) => { if (o.isMesh) o.material = o.material.clone ? (() => { const m = o.material.clone(); m.color?.multiplyScalar(0.18); m.emissive?.set(0); return m; })() : o.material; });
    g.blast?.(p, 7, 70, false);
    if (v === this.active) {
      this.active = null;
      g.placeOnShore(new THREE.Vector3(v.pos.x + 2.5, v.y + 1.2, v.pos.z), v.heading);
      g.health.damage(45, 'carExplosion');
    }
  }

  // Is the car's box at (pos, heading) inside anything solid? (buildings, walls, parked cars, trees)
  hitsWorld(pos, heading, y) {
    const sb = this.game.portSandbox;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0));
    const c = sb.world.intersectionWithShape({ x: pos.x, y: y + 0.42 + HALF.y, z: pos.z }, q, this.shape, undefined, undefined, undefined, undefined,
      (col) => sb.staticColliders.has(col.handle));
    if (c) return true;
    const fwd = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    // no driving into the sea
    for (const s of [2.2, -2.2]) if (!blocked(pos.x + fwd.x * s, pos.z + fwd.z * s)) return true;
    return false;
  }

  groundAt(x, z) {
    const sb = this.game.portSandbox;
    const hit = sb.world.castRay(new RAPIER.Ray({ x, y: LAND_Y + 1.2, z }, { x: 0, y: -1, z: 0 }), 2, true, undefined, undefined, undefined, undefined,
      (col) => sb.staticColliders.has(col.handle));
    return hit ? LAND_Y + 1.2 - hit.timeOfImpact : LAND_Y;
  }

  update(dt, keys) {
    const g = this.game;
    for (const v of [...this.list]) {
      if (v.wreck) {
        v.wreckT += dt;
        if (Math.random() < dt * 8) g.fx.emit(v.pos.clone().add(new THREE.Vector3((Math.random() - 0.5), 1.4, (Math.random() - 0.5))), new THREE.Vector3(0, 2 + Math.random(), 0), 0x333333, 2.5, -0.1, 0.3);
        if (v.wreckT > 40) this.remove(v);
        continue;
      }
      const driving = v === this.active;
      const throttle = driving ? (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) : 0;
      const steer = driving ? (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) : 0;
      const brake = driving && keys.has('Space');
      const max = v.police ? 36 : 30;
      if (throttle > 0) v.speed += (v.speed < -0.5 ? 20 : 10 - Math.abs(v.speed) * 0.12) * dt;
      else if (throttle < 0) v.speed -= (v.speed > 0.5 ? 20 : 7) * dt;
      else v.speed *= 1 - dt * 0.7;
      if (brake) v.speed *= 1 - Math.min(1, dt * 3);
      v.speed = THREE.MathUtils.clamp(v.speed, -9, max);
      // steering (less lock at speed); handbrake turns tighter
      const lock = 0.6 / (1 + Math.abs(v.speed) * 0.05) * (brake ? 1.5 : 1);
      v.steer = THREE.MathUtils.lerp(v.steer || 0, steer * lock, Math.min(1, dt * 8));
      const yawRate = (v.speed / WHEELBASE) * Math.tan(v.steer);
      const nh = v.heading - yawRate * dt;
      const fwd = new THREE.Vector3(-Math.sin(nh), 0, -Math.cos(nh));
      const next = v.pos.clone().addScaledVector(fwd, v.speed * dt);
      const ny = this.groundAt(next.x, next.z);
      if (Math.abs(v.speed) > 0.05 || steer) {
        if (this.hitsWorld(next, nh, ny)) {
          const impact = Math.abs(v.speed);
          if (impact > 5) {
            this.damage(v, (impact - 5) * 2.2);
            g.sfx.play('thud');
            if (driving) { g.shake = Math.min(1, impact / 20); if (impact > 16) g.health.damage((impact - 16) * 1.6, 'carCrash'); }
          }
          v.speed = -v.speed * 0.2;
          if (this.hitsWorld(v.pos, v.heading, v.y)) { // wedged: nudge back out
            v.pos.addScaledVector(fwd, -0.15);
          }
        } else {
          v.pos.copy(next);
          v.heading = nh;
          v.y += (ny - v.y) * Math.min(1, dt * 12);
        }
      }
      // other cars
      const others = [...g.traffic.cars, ...g.police.cars, ...this.list.filter((o) => o !== v)];
      for (const o of others) {
        const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z, d = Math.hypot(dx, dz);
        if (d > 4.2 || d < 0.01) continue;
        const closing = v.speed * ((fwd.x * dx + fwd.z * dz) / d);
        v.pos.x -= (dx / d) * (4.2 - d) * 0.5; v.pos.z -= (dz / d) * (4.2 - d) * 0.5;
        if (closing > 4 && v.hitT <= 0) {
          v.hitT = 0.6;
          this.damage(v, closing * 2);
          if (o.hp !== undefined && !o.wreck) this.damage(o, closing * 2.5);
          o.speed = (o.speed || 0) * 0.2;
          if (o.net) { o.waitT = 0; g.sfx.play('honk'); } // a furious motorist
          if (g.police.cars.includes(o) && !g.police.wanted) g.police.report(1, v.pos.clone(), true, 'ramcop');
          g.sfx.play('thud');
          if (driving) g.shake = 0.8;
          v.speed *= 0.3;
        }
      }
      v.hitT -= dt;
      // people in the way
      if (Math.abs(v.speed) > 3) {
        const r = new THREE.Vector3(-fwd.z, 0, fwd.x);
        for (const n of [...g.citizens.list]) {
          const t = n.body.translation();
          const dx = t.x - v.pos.x, dz = t.z - v.pos.z;
          if (Math.abs(dx * fwd.x + dz * fwd.z) > 2.6 || Math.abs(dx * r.x + dz * r.z) > 1.25) continue;
          const vel = fwd.clone().multiplyScalar(v.speed * 1.1); vel.y = 3 + Math.abs(v.speed) * 0.15;
          const lethal = Math.abs(v.speed) > 8;
          const cop = n.role === 'cop';
          g.citizens.knockOver(n, vel, 5, { killed: lethal, point: new THREE.Vector3(t.x, t.y, t.z), dir: fwd.clone() });
          if (driving) g.police.crime(lethal ? (cop ? 'copkill' : 'murder') : 'assault', lethal ? (cop ? 3 : 2) : 1, new THREE.Vector3(t.x, t.y, t.z));
          v.speed *= 0.85;
          this.damage(v, 2);
        }
      }
      v.body.setNextKinematicTranslation({ x: v.pos.x, y: v.y + 0.9, z: v.pos.z });
      v.body.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.heading, 0)));
      v.mesh.position.set(v.pos.x, v.y, v.pos.z);
      v.mesh.rotation.set(0, v.heading, (driving ? v.steer * Math.min(Math.abs(v.speed) / 25, 1) * 0.12 : 0), 'YXZ');
      if (v.lights) { const on = (performance.now() / 160) % 2 < 1; v.lights.glowR.visible = on; v.lights.glowB.visible = !on; }
      if (driving) {
        g.shorePlayer.body.setTranslation({ x: v.pos.x, y: v.y + 1.4, z: v.pos.z }, true);
        g.sfx.setEngine(true, 0.25 + Math.abs(v.speed) / max);
        if (keys.has('KeyH') && !this.honked) { g.sfx.play('honk'); this.honked = true; }
        if (!keys.has('KeyH')) this.honked = false;
      }
    }
  }

  cameraPose(camera, dt, v = this.active) {
    const k = 1 - Math.exp(-dt * 5);
    this.camQuat.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.heading + (this.lookBack ? Math.PI : 0), 0)), k);
    const off = new THREE.Vector3(0, 2.4, 7).applyQuaternion(this.camQuat);
    const target = v.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    camera.position.copy(target).add(off);
    camera.up.set(0, 1, 0);
    const fwd = new THREE.Vector3(-Math.sin(v.heading), 0, -Math.cos(v.heading));
    camera.lookAt(target.clone().addScaledVector(fwd, 3));
    void angDiff;
  }
}
