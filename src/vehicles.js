import { chopperCamera } from './homes.js';
import * as THREE from 'three';
import { LAND_Y, blocked, islandAt } from './world.js';
import { runOver } from './carphys.js';

// Grand theft auto: drag a driver out of their car, break into a parked one, or take a cop car,
// and drive it. The cars themselves are physical (see carphys.js).

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = []; // cars that have been taken (driven now, or left wherever you got out)
    this.parked = []; // parked cars around town, waiting to be broken into
    this.active = null;
    this.camQuat = new THREE.Quaternion();
  }

  // Every car in the world (traffic, police, parked, stolen).
  get all() { return [...this.game.traffic.cars, ...this.game.police.cars, ...this.parked, ...this.list, ...(this.game.story?.extraCars || []), ...(this.game.title?.cars || []), ...(this.game.highway?.cars || []), ...(this.game.activities?.cars || []), ...(this.game.net?.carList || [])]; }

  // A car you could get into from where you're standing.
  nearby(pos) {
    const g = this.game;
    let best = null, bd = 3.6;
    const consider = (car, kind) => {
      if (car.wreck) return;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bd && Math.abs(pos.y - car.pos.y - 1) < 2.5) { bd = d; best = { car, kind }; }
    };
    for (const v of this.list) consider(v, 'mine');
    for (const c of this.parked) consider(c, 'parked');
    for (const c of g.traffic.cars) if (Math.abs(c.speed) < 6) consider(c, 'traffic');
    for (const c of g.police.cars) if (Math.abs(c.speed) < 6) consider(c, 'police');
    for (const c of g.highway?.cars || []) if (Math.abs(c.speed) < 6) consider(c, 'highway');
    for (const c of g.net?.stealable() || []) if (Math.abs(c.speed) < 6) consider(c, 'remote'); // another player's car, left about
    return best;
  }

  // Take a car: drivers are thrown out and it's a crime either way.
  steal({ car, kind }, drive = true) {
    const g = this.game;
    if (kind === 'mine') { this.enter(car); return; }
    const police = car.police;
    if (kind === 'remote') { g.net.takeRemote(car); kind = 'parked'; }
    else if (kind === 'police') g.police.cars.splice(g.police.cars.indexOf(car), 1);
    else if (kind === 'traffic') { g.traffic.cars.splice(g.traffic.cars.indexOf(car), 1); g.net?.carTaken(car); }
    else if (kind === 'highway') { g.highway.cars.splice(g.highway.cars.indexOf(car), 1); car.hw = false; car.maxSpeed = undefined; kind = 'traffic'; }
    else if (this.parked.includes(car)) { g.net?.parkedTaken(car); this.parked.splice(this.parked.indexOf(car), 1); }
    car.base = 350 + Math.floor(Math.random() * 6) * 70;
    car.type = { name: police ? 'Police car' : car.bike ? 'Stolen bike' : car.bus ? 'Hijacked bus' : car.tow ? 'Tow truck' : 'Stolen car', hp: car.maxHp, car: true };
    car.mesh.visible = true;
    this.list.push(car);
    const where = new THREE.Vector3(car.pos.x, LAND_Y + 1, car.pos.z);
    if (kind === 'parked') {
      g.sfx.play('punch'); // window goes in
      for (let i = 0; i < 8; i++) g.fx.emit(where.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 0xbfe0ff, 0.5, 1, 0.2);
      g.police.crime(police ? 'copcar' : 'carjack', police ? 2 : 1, where);
    } else {
      // the driver gets dragged out
      const f = car.forward;
      const at = car.pos.clone().add(new THREE.Vector3(f.z, 0, -f.x).multiplyScalar(2.2));
      const island = islandAt(at.x, at.z, 2)?.id;
      const victim = (!police || !car.deployed) && (island === 'city' || island === 'town')
        ? g.citizens.spawnCitizen(island, police ? 'cop' : 'civ', new THREE.Vector3(at.x, LAND_Y, at.z)) : null;
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
    }
    if (drive) this.enter(car);
  }

  enter(v) {
    const g = this.game;
    g.endDrag(false);
    g.clearDropHeld();
    this.active = v;
    v.dazedT = 0;
    g.shorePlayer.collider.setEnabled(false);
    this.camQuat.setFromEuler(new THREE.Euler(0, v.heading, 0));
    g.hud.setMode('car');
    g.sfx.play('engineStart');
  }

  exit() {
    const v = this.active;
    if (!v) return false;
    const lock = this.game.story?.vehicleLock?.(v);
    if (lock) { this.game.hud.toast(lock, 0xffd166); return false; }
    if (Math.abs(v.speed) > 5) { this.bailOut(v); return true; }
    const f = v.forward;
    const left = new THREE.Vector3(f.z, 0, -f.x);
    let out = v.pos.clone().addScaledVector(left, 2.2);
    if (!blocked(out.x, out.z)) out = v.pos.clone().addScaledVector(left, -2.2);
    this.active = null;
    this.game.sfx.setEngine(false);
    this.game.placeOnShore(new THREE.Vector3(out.x, v.pos.y + 1.1, out.z), v.heading);
    return true;
  }

  // Throw the door open and dive out of a moving car: you go flying (and it keeps going).
  bailOut(v) {
    const g = this.game;
    const f = v.forward, left = new THREE.Vector3(f.z, 0, -f.x);
    const speed = Math.abs(v.speed);
    this.active = null;
    g.sfx.setEngine(false);
    const pos = v.pos.clone().addScaledVector(left, 1.9 + (v.monster ? 1 : 0)).add(new THREE.Vector3(0, v.monster ? 3 : 1.6, 0));
    const vel = v.vel.clone().multiplyScalar(0.85).addScaledVector(left, 4).add(new THREE.Vector3(0, 3.5, 0));
    g.pragdoll.start(pos, v.heading, vel, { spin: 3 + speed * 0.15 });
    g.hud.setMode('deck');
    g.shake = 0.8;
    if (speed > 12) g.health.damage((speed - 12) * 1.4, 'bail');
  }

  remove(v) {
    if (v === this.active) this.active = null;
    v.dispose();
    this.list.splice(this.list.indexOf(v), 1);
  }

  damage(v, n) { v.damage(n); }

  update(dt, keys) {
    const g = this.game;
    for (const v of [...this.list]) {
      if (v.wreck) { v.coast(dt); if (v.wreckT > 40) this.remove(v); continue; }
      if (v !== this.active) { v.coast(dt); continue; }
      const throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const steer = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
      v.driveInput(dt, throttle, steer, keys.has('Space'), keys.has('ShiftLeft') || keys.has('ShiftRight'));
      runOver(g, v, true);
      // ramming a police car is asking for trouble
      for (const c of g.police.cars) if (c.hitT > 0.2 && c.pos.distanceTo(v.pos) < 5.5 && !g.police.wanted) g.police.report(1, v.pos.clone(), true, 'ramcop');
      g.shorePlayer.body.setTranslation({ x: v.pos.x, y: v.pos.y + 1.4, z: v.pos.z }, true);
      g.sfx.setEngine(true, 0.25 + Math.abs(v.speed) / 36);
      if (keys.has('KeyH') && !this.honked) { g.sfx.play('honk'); this.honked = true; }
      if (!keys.has('KeyH')) this.honked = false;
    }
    for (const c of this.parked) c.coast(dt);
  }

  cameraPose(camera, dt, v = this.active) {
    if (v.isHeli) { chopperCamera(camera, dt, v, this.camQuat); return; }
    const k = 1 - Math.exp(-dt * 5);
    this.camQuat.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.heading, 0)), k);
    const big = v.monster;
    const off = new THREE.Vector3(0, big ? 4.6 : 2.4, big ? 12.5 : 7).applyQuaternion(this.camQuat);
    const target = v.mesh.position.clone().add(new THREE.Vector3(0, big ? 3 : 1.2, 0));
    camera.position.copy(target).add(off);
    camera.up.set(0, 1, 0);
    camera.lookAt(target.clone().addScaledVector(v.forward, 3));
  }
}
