import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS } from './groups.js';
import { Car, runOver, clearSpot } from './carphys.js';
import { LAND_Y, islandAt, blocked, onLand } from './world.js';

// Wanted level, witnesses' calls, and the police response: officers on foot, squad cars that
// chase and ram you through the streets, and police boats that hunt you down at sea.

import { HEAT, FOOT, CARS, Escalation, makeSwat, SWAT_LOOK, ADV_LOOK } from './swat.js';

const SWAT_LOOKS = [SWAT_LOOK, ADV_LOOK];

const BOATS = [0, 0, 1, 2, 3, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7];
const CAR_SPEED = 17;

const angleTo = (from, to) => { let d = to - from; return Math.atan2(Math.sin(d), Math.cos(d)); };

export class Police {
  constructor(game) {
    this.game = game;
    this.heat = 0;
    this.wanted = 0;
    this.crimes = []; // recent crimes witnesses might see: { kind, severity, pos, t }
    this.reports = [];
    this.lastSeen = 0;
    this.cars = [];
    this.boats = [];
    this.bustT = 0;
    this.spawnT = 0;
    this.radioT = 0;
    this.tracers = [];
    this.esc = new Escalation(game);
  }

  tracer(a, b) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9 }));
    this.game.scene.add(l);
    this.tracers.push({ l, t: 0.09 });
  }

  get enabled() { return !this.disabled; } // (the admin panel can switch them off)
  // SWAT on the scene (10+ stars, or vans/officers still hunting you)
  get swatActive() { return this.wanted >= 10 || (this.wanted > 0 && (this.cars.some((c) => c.swat && !c.leaving) || this.game.citizens.list.some((n) => n.swat && n.dispatched && !n.leaving))); }
  get searching() { return this.wanted > 0 && this.game.time * 1000 - this.lastSeen > 2500; }

  // The player just did something. Anyone (or any officer) who sees it may call it in.
  crime(kind, severity, pos) {
    if (this.game.story?.quietZone(pos)) return; // nobody to see it
    const now = this.game.time * 1000;
    this.crimes.push({ kind, severity, pos: pos.clone(), t: now });
    this.crimes = this.crimes.filter((c) => now - c.t < 3000);
    this.game.citizens?.alarm(pos, kind === 'theft' ? 0 : 14);
  }

  // A witness (or officer) called the police. playerSeen: they can describe you.
  report(severity, pos, playerSeen, why = '') {
    if (!this.enabled || this.game.health.dead) return;
    const now = this.game.time * 1000;
    this.reports = this.reports.filter((r) => now - r.t < 4000);
    const dup = this.reports.find((r) => r.why === why && r.pos.distanceTo(pos) < 25 && r.sev >= severity);
    if (dup) return;
    this.reports.push({ why, pos: pos.clone(), sev: severity, t: now });
    if (!playerSeen) {
      this.game.hud.toast(why === 'blood' ? 'Someone reported blood on the street' : 'Someone found a body and called the police', 0x9ec5ff);
      this.sendToInvestigate(pos);
      return;
    }
    const before = this.wanted;
    this.heat += severity;
    this.setWantedFromHeat();
    this.lastSeen = now;
    if (this.wanted > before) {
      this.game.sfx.play('star');
      const msg = { murder: 'A witness saw the killing', copkill: 'Officer down!', assault: 'Someone saw you attack', theft: 'Someone saw you steal', body: 'Someone saw you with a body', blood: 'A witness put you near the blood' }[why] || 'The police are after you';
      this.game.hud.toast(`${msg}: ${this.wanted} star${this.wanted > 1 ? 's' : ''}`, 0xff6a5a);
      const N = this.game.news, where = N?.place(pos);
      const what = { murder: `a killing in ${where}, witnesses say the suspect fled`, copkill: `an officer down in ${where}`, assault: `an assault in ${where}`, theft: `a theft in ${where}`, carjack: `a carjacking in ${where}`, copcar: `someone stole a police cruiser in ${where}`, shooting: `shots fired in ${where}`, explosion: `an explosion in ${where}` }[why];
      if (what) N.add(`Police are responding to ${what}.`, 'crime');
      if ([6, 10, 15, 20, 25, 30].includes(this.wanted)) N?.add(this.wanted >= 30 ? 'BREAKING: the National Guard is sending tanks into the streets after a suspect. Residents must stay indoors.' : this.wanted >= 25 ? 'Every police unit in the state is converging on one suspect.' : this.wanted >= 20 ? 'The city has deployed its riot SWAT unit. Residents are told to stay indoors.' : this.wanted >= 10 ? `SWAT teams are in pursuit of a suspect in ${where}.` : `Police helicopters are circling ${where} in a manhunt.`, 'crime');
    }
  }

  setWantedFromHeat() {
    let w = 0;
    for (let k = 1; k < HEAT.length; k++) if (this.heat >= HEAT[k]) w = k;
    this.wanted = w;
  }

  sendToInvestigate(pos) {
    let best = null, bd = 400;
    for (const n of this.game.citizens.list) {
      if (n.role !== 'cop' || n.state === 'chase') continue;
      const t = n.body.translation();
      const d = Math.hypot(t.x - pos.x, t.z - pos.z);
      if (d < bd) { bd = d; best = n; }
    }
    if (best) { best.state = 'investigate'; best.target = pos.clone(); }
  }

  // lost: you got away (a big chase can still bring bounty hunters); otherwise the slate's wiped
  clearWanted(lost = false) {
    if (!lost) this.esc?.reset();
    this.heat = 0;
    this.wanted = 0;
    this.bustT = 0;
    for (const c of this.cars) c.leaving = true;
    for (const b of this.boats) b.leaving = true;
    for (const n of this.game.citizens.list) if (n.dispatched) n.leaving = true;
  }

  // ---------------------------------------------------------------- officers on foot
  copShoots(npc, target) {
    const g = this.game;
    const t = npc.body.translation();
    const from = new THREE.Vector3(t.x, t.y + 0.5, t.z).addScaledVector(new THREE.Vector3(Math.sin(npc.heading), 0, Math.cos(npc.heading)), 0.4);
    const tier = npc.swat || 0;
    const hit = Math.random() < [0.35, 0.45, 0.55][tier];
    const to = new THREE.Vector3(target.x, target.y + 0.4, target.z);
    if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.2, (Math.random() - 0.5) * 2.5));
    this.tracer(from, to);
    g.fx.flash(from, 0xffc060, 0.8, 0.06);
    g.sfx.play(tier ? 'smg' : 'pistol');
    const v = g.vehicles.active;
    if (hit && v && !v.isHeli) { // shooting up your car
      if (v.bulletproof || v.monster) g.fx.flash(to, 0xffe0a0, 0.6, 0.05);
      else { v.damage([5, 7, 10][tier]); if (Math.random() < 0.4) g.health.damage(3, 'police'); }
    } else if (hit) g.health.damage([7, 10, 13][tier], 'police');
    g.citizens.alarm(from, 18);
  }

  dispatchFoot(target, island) {
    const c = this.game.citizens;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 35;
      const p = c.randomPointOn(island, new THREE.Vector3(target.x + Math.cos(a) * r, 0, target.z + Math.sin(a) * r), 10, 40);
      if (!p) continue;
      const n = c.spawnCitizen(island, 'cop', p, this.wanted >= 10 && Math.random() < 0.5 ? { look: this.wanted >= 20 ? SWAT_LOOKS[1] : SWAT_LOOKS[0] } : {});
      if (!n) continue;
      if (n.fig.look === SWAT_LOOKS[0] || n.fig.look === SWAT_LOOKS[1]) makeSwat(n, n.fig.look === SWAT_LOOKS[1] ? 2 : 1);
      n.dispatched = true;
      n.state = 'chase';
      n.lastSeen = new THREE.Vector3(target.x, target.y, target.z);
      return n;
    }
    return null;
  }

  // ---------------------------------------------------------------- squad cars
  roads(island) {
    if (island === 'city') return this.game.city;
    if (island === 'town') return this.game.saltmarsh;
    if (island === 'hood') return this.game.hood;
    return null;
  }

  spawnCar(target, island) {
    const R = this.roads(island);
    if (!R) return null;
    const nodes = [];
    for (let i = 0; i < R.xs.length; i++) for (let j = 0; j < R.zs.length; j++) {
      const d = Math.hypot(R.xs[i] - target.x, R.zs[j] - target.z);
      if (d > 110 && d < 300) nodes.push({ i, j, d });
    }
    // a junction with room for the car (never inside a building)
    nodes.sort(() => Math.random() - 0.5);
    const n = nodes.find((m) => clearSpot(this.game, R.xs[m.i], R.zs[m.j], 0));
    if (!n) return null;
    const toward = Math.atan2(-(target.x - R.xs[n.i]), -(target.z - R.zs[n.j]));
    const car = new Car(this.game, { police: true, x: R.xs[n.i], z: R.zs[n.j], heading: Math.round(toward / (Math.PI / 2)) * (Math.PI / 2) });
    Object.assign(car, { R, island, at: { i: n.i, j: n.j }, from: null, to: null, deployed: 0, ramT: 0, leaving: false, life: 0, stuckT: 0, reverseT: 0 });
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    car.dispose();
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  nodePos(R, n) { return new THREE.Vector3(R.xs[n.i], LAND_Y, R.zs[n.j]); }

  // Choose the next intersection: the neighbour that gets closest to where we're going.
  nextNode(car, goal) {
    const { R, at } = car;
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([di, dj]) => ({ i: at.i + di, j: at.j + dj }))
      .filter((n) => n.i >= 0 && n.j >= 0 && n.i < R.xs.length && n.j < R.zs.length);
    const fresh = opts.filter((n) => !car.from || n.i !== car.from.i || n.j !== car.from.j);
    const list = fresh.length ? fresh : opts;
    if (!goal) return list[Math.floor(Math.random() * list.length)];
    let best = list[0], bd = Infinity;
    for (const n of list) {
      const d = Math.hypot(R.xs[n.i] - goal.x, R.zs[n.j] - goal.z) + Math.random() * 8;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  clearPath(a, b) {
    const sb = this.game.portSandbox;
    const o = { x: a.x, y: LAND_Y + 1, z: a.z };
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return true;
    const hit = sb.world.castRay(new RAPIER.Ray(o, { x: dx / d, y: 0, z: dz / d }), d, true, undefined, undefined, undefined, undefined,
      (c) => sb.staticColliders.has(c.handle));
    return !hit;
  }

  updateCar(car, dt, target, onFoot) {
    const g = this.game;
    car.life += dt;
    const sameIsland = target && onFoot && islandAt(target.x, target.z, 4)?.id === car.island;
    const goal = car.leaving ? null : sameIsland ? target : null;
    const dist = goal ? Math.hypot(goal.x - car.pos.x, goal.z - car.pos.z) : Infinity;
    let want = 0, aim = null;
    const chasingCar = !!g.vehicles?.active;
    const direct = goal && dist < 45 && this.clearPath(car.pos, goal);
    if (car.wreck) { car.coast(dt); return false; }
    if (direct) {
      car.to = null;
      aim = goal;
      want = chasingCar ? CAR_SPEED * 1.1 : CAR_SPEED * 0.8;
      if (!chasingCar) {
        if (car.deployed && dist < 16) want = 0;
        if (!car.deployed && dist < 13) {
          want = 0;
          if (Math.abs(car.speed) < 2) this.deploy(car, goal);
        }
        if (dist < 6 && !g.hostage) want = 9; // they will run you down
      if (g.hostage && dist < 28) want = 0; // not with a hostage in the way
      }
    } else {
      if (!car.to) { car.to = this.nextNode(car, goal); }
      const tp = this.nodePos(car.R, car.to);
      const d = Math.hypot(tp.x - car.pos.x, tp.z - car.pos.z);
      if (d < 6) {
        car.from = car.at; car.at = car.to; car.to = this.nextNode(car, goal);
      }
      aim = this.nodePos(car.R, car.to);
      want = goal ? CAR_SPEED : 10;
    }
    // stuck against something? back up and try again
    if (want > 3 && Math.abs(car.speed) < 1) car.stuckT += dt; else car.stuckT = 0;
    if (car.stuckT > 1.5) { car.reverseT = 1.2; car.stuckT = 0; }
    if (car.tank) want = Math.min(want, dist < 30 ? 4 : 12); // (a tank lumbers in, and stops to fire)
    if (car.reverseT > 0) { car.reverseT -= dt; car.driveTo(dt, -6, aim, { maxSpeed: 36 }); }
    else {
      const turn = Math.abs(Math.atan2(Math.sin(Math.atan2(-(aim.x - car.pos.x), -(aim.z - car.pos.z)) - car.heading), Math.cos(Math.atan2(-(aim.x - car.pos.x), -(aim.z - car.pos.z)) - car.heading)));
      if (turn > 0.9) want = Math.min(want, 7);
      car.driveTo(dt, want, aim, { accel: 11, brake: 20, maxSpeed: 36 });
    }
    const fwd = car.forward;

    // ramming the player on foot
    car.ramT -= dt;
    if (target && onFoot && !chasingCar && !g.hostage && car.ramT <= 0 && car.speed > 5 && Math.hypot(target.x - car.pos.x, target.z - car.pos.z) < 3 && Math.abs(target.y - LAND_Y - 1) < 2) {
      car.ramT = 1.2;
      g.health.damage(car.speed * 2.2, 'car');
      g.shorePlayer.vel.addScaledVector(fwd, car.speed * 0.9).add(new THREE.Vector3(0, 5, 0));
      g.shake = 0.8;
      g.sfx.play('thud');
    }
    runOver(g, car, false);
    if (goal && dist < 60) return true; // can see you
    return false;
  }

  deploy(car, goal) {
    car.deployed = 1;
    const c = this.game.citizens;
    const fwd = new THREE.Vector3(-Math.sin(car.heading), 0, -Math.cos(car.heading));
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const spots = car.swat ? [[-1, 0], [1, 0], [-1, -2.5], [1, -2.5]] : [[-1, 0], [1, 0]];
    for (const [s, back] of spots) {
      const p = car.pos.clone().addScaledVector(side, s * (car.swat ? 2.4 : 2)).addScaledVector(fwd, back);
      p.y = LAND_Y;
      const n = c.spawnCitizen(car.island, 'cop', p, car.swat ? { look: SWAT_LOOKS[car.swat - 1] } : {});
      if (!n) continue;
      if (car.swat) makeSwat(n, car.swat);
      n.dispatched = true;
      n.state = 'chase';
      n.lastSeen = new THREE.Vector3(goal.x, goal.y, goal.z);
    }
    this.game.sfx.play('switch');
  }

  // ---------------------------------------------------------------- boats
  spawnBoat(target) {
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, r = 220 + Math.random() * 120;
      const x = target.x + Math.cos(a) * r, z = target.z + Math.sin(a) * r;
      if (blocked(x, z, 20)) continue;
      const local = this.game.frame.worldToLocal(new THREE.Vector3(x, 0, z));
      if (Math.abs(local.x) < 30 && Math.abs(local.z) < 110) continue;
      const b = this.game.boats.spawnPolice(x, z, Math.atan2(-(target.x - x), -(target.z - z)));
      this.boats.push(b);
      return b;
    }
    return null;
  }

  policeBoatSunk(b) {
    const i = this.boats.indexOf(b);
    if (i >= 0) this.boats.splice(i, 1);
    if (this.wanted > 0) { this.heat += 1; this.setWantedFromHeat(); }
  }

  // Steering for a police boat: run the player's boat down; keep off the rocks.
  boatAI(b, dt) {
    const g = this.game;
    const tgt = !b.leaving && g.boats.active ? g.boats.active : null;
    let goal;
    if (tgt) {
      const lead = THREE.MathUtils.clamp(b.pos.distanceTo(tgt.pos) / 25, 0, 2.5);
      goal = tgt.pos.clone().addScaledVector(tgt.forward, tgt.speed * lead);
    } else if (b.leaving) {
      const away = b.pos.clone().sub(g.shorePlayer.body.translation());
      goal = b.pos.clone().add(away.setY(0).normalize().multiplyScalar(100));
    } else {
      // you're ashore: wait just off the coast near you
      const p = g.player.body.translation();
      goal = new THREE.Vector3(p.x, 0, p.z);
    }
    const dx = goal.x - b.pos.x, dz = goal.z - b.pos.z;
    let desired = Math.atan2(-dx, -dz);
    // feel ahead for land and turn away from it
    const probe = (ang, d) => blocked(b.pos.x - Math.sin(ang) * d, b.pos.z - Math.cos(ang) * d, 2);
    const look = 10 + Math.abs(b.speed) * 1.2;
    if (probe(desired, look)) {
      for (const off of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
        if (!probe(desired + off, look)) { desired += off; break; }
      }
    }
    const turn = angleTo(b.heading, desired);
    const steer = THREE.MathUtils.clamp(-turn * 2, -1, 1);
    const near = Math.hypot(dx, dz);
    let throttle = Math.abs(turn) > 1.6 ? 0.4 : 1;
    if (!tgt && !b.leaving && near < 40) throttle = 0.15;
    if (probe(b.heading, 8)) throttle = -0.6;
    return { throttle, steer };
  }

  // ---------------------------------------------------------------- per tick
  update(dt) {
    const g = this.game;
    const now = this.game.time * 1000;
    for (const tr of [...this.tracers]) {
      tr.t -= dt;
      tr.l.material.opacity = Math.max(tr.t / 0.09, 0);
      if (tr.t <= 0) { tr.l.removeFromParent(); tr.l.geometry.dispose(); tr.l.material.dispose(); this.tracers.splice(this.tracers.indexOf(tr), 1); }
    }
    const pt = g.player.body.translation();
    const inBoat = !!g.boats.active;
    const target = inBoat ? g.boats.active.pos.clone().setY(1) : new THREE.Vector3(pt.x, pt.y, pt.z);
    const onFoot = g.onShore && !g.flying && !inBoat;
    if (!this.enabled && this.wanted) this.clearWanted();

    // who can see you right now?
    let seen = false;
    for (const n of g.citizens.list) if (n.role === 'cop' && n.playerVisible) { seen = true; break; }
    for (const c of [...this.cars]) {
      if (c.blockade) { c.coast(dt); runOver(g, c, false); continue; } // parked across the road
      if (this.updateCar(c, dt, target, onFoot)) seen = seen || this.wanted > 0;
      const far = Math.hypot(c.pos.x - target.x, c.pos.z - target.z);
      if ((c.leaving && far > 70) || far > 600) this.removeCar(c);
    }
    for (const b of [...this.boats]) {
      if (!b.alive) continue;
      const d = b.pos.distanceTo(new THREE.Vector3(target.x, 0, target.z));
      if (!b.leaving && d < 220 && inBoat) seen = true;
      if ((b.leaving && d > 260) || d > 900) { g.boats.remove(b); this.boats.splice(this.boats.indexOf(b), 1); }
    }
    for (const n of [...g.citizens.list]) {
      if (!n.leaving) continue;
      const t = n.body.translation();
      if (Math.hypot(t.x - target.x, t.z - target.z) > 45 || !n.playerVisible) g.citizens.despawn(n);
    }
    if (seen && this.wanted > 0) this.lastSeen = now;
    if (g.flying) this.lastSeen = Math.min(this.lastSeen, now - 1e9); // they lose you in a jet

    // losing them
    if (this.wanted > 0 && now - this.lastSeen > (10 + this.wanted * 6) * (g.economy.perks.scanner ? 650 : 1000)) {
      this.wanted -= 1;
      this.heat = HEAT[this.wanted];
      this.lastSeen = now;
      if (this.wanted === 0) { this.clearWanted(true); g.hud.toast('You lost the police', 0x7be08a); }
      else g.hud.toast(`Wanted level down: ${this.wanted} star${this.wanted > 1 ? 's' : ''}`, 0x9ec5ff);
    }

    // send more units
    this.spawnT -= dt;
    if (this.wanted > 0 && this.spawnT <= 0) {
      this.spawnT = 2.5;
      const isl = onFoot ? islandAt(target.x, target.z, 4) : null;
      const island = isl && ['city', 'town', 'park', 'hood'].includes(isl.id) ? isl.id : null;
      if (island) {
        const foot = g.citizens.list.filter((n) => n.dispatched && !n.leaving).length;
        if (foot < FOOT[this.wanted]) this.dispatchFoot(target, island);
        const cars = this.cars.filter((c) => !c.leaving).length;
        if (cars < CARS[this.wanted]) this.spawnCar(target, island);
      }
      const boats = this.boats.filter((b) => !b.leaving && b.alive).length;
      if (inBoat && boats < BOATS[this.wanted]) this.spawnBoat(target);
    }
    // choppers, SWAT, roadblocks, bounty hunters
    {
      const isl = islandAt(target.x, target.z, 4);
      const island = isl && ['city', 'town', 'hood'].includes(isl.id) && !inBoat ? isl.id : null;
      if (this.esc.update(dt, target, onFoot, island) && this.wanted > 0) this.lastSeen = now;
    }
    // officers who can see you shoot at the car you're in
    this.carFireT = (this.carFireT || 0) - dt;
    if (this.wanted >= 3 && g.vehicles.active && !g.vehicles.active.isHeli && this.carFireT <= 0) {
      this.carFireT = 0.5;
      for (const n of g.citizens.list) {
        if (n.role !== 'cop' || !n.playerVisible || n.down) continue;
        const t = n.body.translation();
        if (Math.hypot(t.x - target.x, t.z - target.z) > 35) continue;
        n.carAtk = (n.carAtk || 0) - 0.5;
        if (n.carAtk <= 0) { n.carAtk = n.swat === 2 ? 0.8 : n.swat ? 1.3 : 2.2; this.copShoots(n, target); }
      }
    }
    // officers on the radio always know roughly where you were last seen
    this.radioT -= dt;
    if (this.radioT <= 0 && this.wanted > 0) {
      this.radioT = 3;
      if (now - this.lastSeen < 8000) for (const n of g.citizens.list) if (n.dispatched && !n.leaving) n.lastSeen = target.clone();
    }

    // getting arrested
    let cuffs = false;
    if (this.wanted > 0 && onFoot && !g.health.dead) {
      for (const n of g.citizens.list) {
        if (n.role !== 'cop') continue;
        const t = n.body.translation();
        if (!g.hostage && Math.hypot(t.x - pt.x, t.z - pt.z) < 1.8) { cuffs = true; break; }
      }
    }
    this.bustT = cuffs ? this.bustT + dt : Math.max(0, this.bustT - dt * 2);
    if (this.bustT > 2.5) this.busted();

    g.hud.setWanted(this.wanted, this.searching, this.bustT / 2.5);
    const sirens = this.cars.filter((c) => !c.leaving).reduce((m, c) => Math.max(m, 1 - Math.hypot(c.pos.x - target.x, c.pos.z - target.z) / 250), 0);
    const boatSirens = this.boats.filter((b) => !b.leaving && b.alive).reduce((m, b) => Math.max(m, 1 - b.pos.distanceTo(new THREE.Vector3(target.x, 0, target.z)) / 350), 0);
    g.sfx.setSiren(Math.max(sirens, boatSirens, 0));
  }

  busted() {
    const g = this.game;
    g.story?.onBusted();
    g.loot?.lose('busted');
    this.esc.reset();
    const lost = g.economy.loseBag();
    const fine = Math.round(g.economy.money * 0.25);
    if (fine) g.economy.addMoney(-fine);
    g.clearHand?.(true);
    this.clearWanted();
    for (const c of [...this.cars]) this.removeCar(c);
    for (const n of [...g.citizens.list]) if (n.leaving) g.citizens.despawn(n);
    g.placeOnShore(g.city.policeStation.clone().add(new THREE.Vector3(0, 1, 4)), Math.PI);
    g.hud.toast(`BUSTED — fined $${fine}${lost ? `, ${lost} item${lost > 1 ? 's' : ''} confiscated` : ''}`, 0x9ec5ff);
    g.hud.flashBanner('BUSTED', '#7fb2ff');
    g.news?.add('A suspect has been taken into custody after a chase. Police say it\'s a weight off everyone\'s minds.', 'crime');
  }
}
