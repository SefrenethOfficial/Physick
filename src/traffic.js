import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS } from './groups.js';
import { carMesh } from './buildkit.js';
import { LAND_Y, islandAt } from './world.js';

// Everyday traffic: cars that drive their lane round the street grid, turn at junctions,
// queue behind each other, stop for people in the road (and honk at you), and knock down
// anyone who jumps out in front of them.

const COLORS = [0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x1b1b1b, 0x3aa760, 0x7a4fb0, 0xe0a52b, 0x8a9096, 0x7a1f2a, 0x24546e];
const right = (d) => new THREE.Vector3(-d.z, 0, d.x);
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };

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

  spawn(net, minDist = 25) {
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
      const pt = g.shorePlayer?.body.translation();
      if (pt && Math.hypot(pt.x - pos.x, pt.z - pos.z) < minDist) continue;
      const mesh = carMesh(COLORS[Math.floor(Math.random() * COLORS.length)]);
      g.scene.add(mesh);
      const body = g.portWorld.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, LAND_Y + 0.9, pos.z));
      body.userData = { traffic: true };
      g.portWorld.createCollider(RAPIER.ColliderDesc.cuboid(0.95, 0.8, 2.25).setCollisionGroups(GROUPS.world), body);
      const car = {
        net, mesh, body, pos, from: a, to: b, path: [], heading: Math.atan2(-dir.x, -dir.z), speed: net.cruise * 0.6,
        waitT: 0, ghostT: 0, honkT: 0, hitT: 0, turning: false,
      };
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
    car.mesh.removeFromParent();
    this.game.portWorld.removeRigidBody(car.body);
    this.cars.splice(this.cars.indexOf(car), 1);
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

    for (const car of this.cars) {
      const f = new THREE.Vector3(-Math.sin(car.heading), 0, -Math.cos(car.heading));
      const r = right(f);
      // what's in front of us?
      const look = 6 + car.speed * 0.9;
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
      // pick a speed
      const cornering = car.path[0]?.turn || car.path[1]?.turn;
      let want = cornering ? 5.5 : car.net.cruise;
      if (block < Infinity) want = Math.min(want, Math.max(0, (block - 5) * 1.2));
      car.speed += THREE.MathUtils.clamp(want - car.speed, -14 * dt, 4 * dt);
      if (car.speed < 0.3 && block < Infinity) {
        car.waitT += dt;
        if (byPlayer && car.waitT > 1.5 && car.honkT <= 0) { g.sfx.play('honk'); car.honkT = 3 + Math.random() * 2; }
        if (byCar && !byPlayer && car.waitT > 4) { car.ghostT = 2; car.waitT = 0; } // gridlock breaker
      } else car.waitT = 0;
      car.honkT -= dt; car.ghostT -= dt; car.hitT -= dt;

      // follow the path
      let dist = car.speed * dt;
      let guard = 0;
      while (dist > 0 && guard++ < 10) {
        if (car.path.length < 3) this.extend(car);
        const tgt = car.path[0].p;
        const dx = tgt.x - car.pos.x, dz = tgt.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d <= dist) { car.pos.set(tgt.x, LAND_Y, tgt.z); car.path.shift(); dist -= d; }
        else { car.pos.x += (dx / d) * dist; car.pos.z += (dz / d) * dist; dist = 0; }
      }
      const tgt = car.path[0].p;
      const want_h = Math.atan2(-(tgt.x - car.pos.x), -(tgt.z - car.pos.z));
      if (Math.hypot(tgt.x - car.pos.x, tgt.z - car.pos.z) > 0.3) car.heading += angDiff(car.heading, want_h) * Math.min(1, dt * 7);
      car.mesh.position.set(car.pos.x, LAND_Y, car.pos.z);
      car.mesh.rotation.y = car.heading;
      car.body.setNextKinematicTranslation({ x: car.pos.x, y: LAND_Y + 0.9, z: car.pos.z });
      car.body.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, car.heading, 0)));

      // anyone who ends up under the bumper anyway gets hit
      if (car.speed > 3) {
        const inBox = (x, z) => {
          const dx = x - car.pos.x, dz = z - car.pos.z;
          return Math.abs(dx * f.x + dz * f.z) < 2.6 && Math.abs(dx * r.x + dz * r.z) < 1.3;
        };
        if (onFoot && car.hitT <= 0 && Math.abs(pt.y - LAND_Y - 1) < 1.5 && inBox(pt.x, pt.z)) {
          car.hitT = 1;
          g.health.damage(car.speed * 2.2, 'traffic');
          g.shorePlayer.vel.addScaledVector(f, car.speed * 0.8).add(new THREE.Vector3(0, 4, 0));
          g.shake = 0.7;
          g.sfx.play('thud');
          g.sfx.play('honk');
          car.speed *= 0.2;
        }
        for (const n of [...people]) {
          const t = n.body.translation();
          if (!inBox(t.x, t.z)) continue;
          const v = f.clone().multiplyScalar(car.speed * 1.1); v.y = 3.5;
          g.citizens.knockOver(n, v, 5, { killed: car.speed > 7, point: new THREE.Vector3(t.x, t.y, t.z), dir: f.clone() });
          car.speed *= 0.3;
          g.sfx.play('honk');
        }
      }
    }
  }

  // Quiet the cars on islands you're nowhere near (cheap: they just skip collision checks).
  get count() { return this.cars.length; }
  onIsland(car) { return islandAt(car.pos.x, car.pos.z, 2)?.id; }
}
