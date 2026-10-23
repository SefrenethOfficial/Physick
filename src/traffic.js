import * as THREE from 'three';
import { LAND_Y, islandAt } from './world.js';
import { Car, runOver, clearSpot } from './carphys.js';

// Everyday traffic: cars that drive their lane round the street grid, turn at junctions,
// queue behind each other, stop for people in the road (and honk at you), and knock down
// anyone who jumps out in front of them.

const COLORS = [0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x1b1b1b, 0x3aa760, 0x7a4fb0, 0xe0a52b, 0x8a9096, 0x7a1f2a, 0x24546e];
const right = (d) => new THREE.Vector3(-d.z, 0, d.x);

export class Traffic {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.nets = [];
  }

  // A road grid: node (i, j) sits at (xs[i], zs[j]). lane: offset of each lane from the centreline.
  addNetwork(id, xs, zs, lane, count, cruise) {
    const net = { id, xs, zs, lane, cruise, count };
    this.nets.push(net);
    for (let n = 0; n < count; n++) this.spawn(net);
  }

  node(net, n) { return new THREE.Vector3(net.xs[n.i], LAND_Y, net.zs[n.j]); }

  neighbours(net, n) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => ({ i: n.i + a, j: n.j + b }))
      .filter((m) => m.i >= 0 && m.j >= 0 && m.i < net.xs.length && m.j < net.zs.length);
  }

  spawn(net, minDist = 25, factory = null) {
    const g = this.game;
    for (let tries = 0; tries < 20; tries++) {
      const a = { i: Math.floor(Math.random() * net.xs.length), j: Math.floor(Math.random() * net.zs.length) };
      const nb = this.neighbours(net, a);
      const b = nb[Math.floor(Math.random() * nb.length)];
      const A = this.node(net, a), B = this.node(net, b);
      const dir = B.clone().sub(A).normalize();
      const t = 0.25 + Math.random() * 0.5;
      const pos = A.clone().lerp(B, t).addScaledVector(right(dir), net.lane);
      if (this.cars.some((c) => c.pos.distanceTo(pos) < 12)) continue;
      if (!clearSpot(g, pos.x, pos.z, Math.atan2(-dir.x, -dir.z))) continue;
      const pt = g.shorePlayer?.body.translation();
      if (pt && Math.hypot(pt.x - pos.x, pt.z - pos.z) < minDist) continue;
      const opts = { color: COLORS[Math.floor(Math.random() * COLORS.length)], x: pos.x, z: pos.z, heading: Math.atan2(-dir.x, -dir.z) };
      const car = factory ? factory(opts) : new Car(g, opts);
      Object.assign(car, { net, from: a, to: b, path: [], waitT: 0, ghostT: 0, honkT: 0, bumpT: 0 });
      this.extend(car);
      this.cars.push(car);
      return car;
    }
    return null;
  }

  // Add the next junction to the car's path: approach, turn (a curve), and out the other side.
  extend(car) {
    const net = car.net;
    const A = this.node(net, car.from), B = this.node(net, car.to);
    const din = B.clone().sub(A).normalize();
    let opts = this.neighbours(net, car.to).filter((n) => n.i !== car.from.i || n.j !== car.from.j);
    if (!opts.length) opts = this.neighbours(net, car.to);
    // prefer going straight on a bit more often than turning
    const straight = opts.find((n) => { const d = this.node(net, n).sub(B).normalize(); return d.dot(din) > 0.9; });
    const next = straight && Math.random() < 0.45 ? straight : opts[Math.floor(Math.random() * opts.length)];
    const C = this.node(net, next);
    const dout = C.clone().sub(B).normalize();
    const L = net.lane, back = 9;
    const entry = B.clone().addScaledVector(din, -back).addScaledVector(right(din), L);
    const exit = B.clone().addScaledVector(dout, back).addScaledVector(right(dout), L);
    car.path.push({ p: entry, turn: false });
    if (din.dot(dout) > 0.9) {
      car.path.push({ p: exit, turn: false });
    } else if (din.dot(dout) < -0.9) { // dead end: U-turn round the junction
      const mid = B.clone().addScaledVector(right(din), -L);
      car.path.push({ p: B.clone().addScaledVector(din, 2).addScaledVector(right(din), L), turn: true }, { p: mid, turn: true }, { p: exit, turn: true });
    } else {
      const ctrl = B.clone().addScaledVector(right(din), L).addScaledVector(right(dout), L);
      for (let s = 1; s <= 6; s++) {
        const t = s / 6, u = 1 - t;
        const p = entry.clone().multiplyScalar(u * u).addScaledVector(ctrl, 2 * u * t).addScaledVector(exit, t * t);
        car.path.push({ p, turn: true });
      }
    }
    car.from = car.to;
    car.to = next;
  }

  remove(car) {
    car.dispose();
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  // Knocked off its route (crash, shove): pick up the nearest road again.
  repath(car) {
    const net = car.net;
    const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
    let best = null, bd = Infinity;
    for (let i = 0; i < net.xs.length; i++) for (let j = 0; j < net.zs.length; j++) {
      const d = Math.hypot(net.xs[i] - car.pos.x, net.zs[j] - car.pos.z);
      if (d < bd) { bd = d; best = { i, j }; }
    }
    void cl;
    const f = car.forward;
    let to = null, td = -Infinity;
    for (const n of this.neighbours(net, best)) {
      const d = this.node(net, n).sub(this.node(net, best)).normalize().dot(f);
      if (d > td) { td = d; to = n; }
    }
    car.from = best; car.to = to; car.path = [];
    this.extend(car);
  }

  update(dt) {
    const g = this.game;
    const pt = g.shorePlayer.body.translation();
    const onFoot = g.onShore && !g.flying && !g.boats.active && !g.health.dead;
    const people = g.citizens.list;
    const others = [...this.cars, ...g.police.cars, ...g.vehicles.list.filter((v) => !v.wreck)];
    // keep the streets busy: replace stolen and wrecked cars out of sight
    this.refillT = (this.refillT || 0) - dt;
    if (this.refillT <= 0) {
      this.refillT = 3;
      for (const net of this.nets) if (this.cars.filter((c) => c.net === net).length < net.count) this.spawn(net, 60);
    }

    for (const car of [...this.cars]) {
      if (car.wreck) { car.coast(dt); if (car.wreckT > 40) this.remove(car); continue; }
      const f = car.forward;
      const r = right(f);
      // what's in front of us?
      const look = 6 + Math.max(0, car.speed) * 0.9;
      let block = Infinity, byPlayer = false, byCar = false;
      const check = (x, z, halfW, isCar) => {
        const dx = x - car.pos.x, dz = z - car.pos.z;
        const ahead = dx * f.x + dz * f.z;
        if (ahead < 1.5 || ahead > look) return false;
        if (Math.abs(dx * r.x + dz * r.z) > halfW) return false;
        if (ahead < block) block = ahead;
        if (isCar) byCar = true;
        return true;
      };
      if (onFoot && Math.abs(pt.y - LAND_Y - 1) < 2.5 && check(pt.x, pt.z, 2.1)) byPlayer = true;
      for (const n of people) { const t = n.body.translation(); check(t.x, t.z, 1.9); }
      if (car.ghostT <= 0) for (const o of others) if (o !== car) check(o.pos.x, o.pos.z, 2.2, true);
      // follow the path (pure pursuit: aim at the next point, drop the ones we've passed)
      if (car.path.length < 4) this.extend(car);
      while (car.path.length > 1) {
        const p = car.path[0].p;
        const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
        if (Math.hypot(dx, dz) < 3.5 || (dx * f.x + dz * f.z < 0 && Math.hypot(dx, dz) < 9)) car.path.shift();
        else break;
      }
      let tgt = car.path[0].p;
      if (Math.hypot(tgt.x - car.pos.x, tgt.z - car.pos.z) > 80) { this.repath(car); tgt = car.path[0].p; }
      // pick a speed
      const cornering = car.path[0]?.turn || car.path[1]?.turn;
      let want = cornering ? 5.5 : car.net.cruise;
      if (block < Infinity) want = Math.min(want, Math.max(0, (block - 5) * 1.2));
      if (car.speed < 0.3 && block < Infinity) {
        car.waitT += dt;
        if (byPlayer && car.waitT > 1.5 && car.honkT <= 0) { g.sfx.play('honk'); car.honkT = 3 + Math.random() * 2; }
        if (byCar && !byPlayer && car.waitT > 4) { car.ghostT = 2; car.waitT = 0; } // gridlock breaker
      } else car.waitT = 0;
      car.honkT -= dt; car.ghostT -= dt;
      car.driveTo(dt, want, tgt, { accel: 4, brake: 14, maxSpeed: car.net.cruise });
      runOver(g, car, false);
    }
  }

  // Quiet the cars on islands you're nowhere near (cheap: they just skip collision checks).
  get count() { return this.cars.length; }
  onIsland(car) { return islandAt(car.pos.x, car.pos.z, 2)?.id; }
}
