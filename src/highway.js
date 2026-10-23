import * as THREE from 'three';
import { Car, runOver, clearSpot } from './carphys.js';

// Traffic on the long road: from Verian City up through Cherry Estate, over the Saltmarsh Gate
// Bridge and down into Saltmarsh Key, both ways. Cars keep to their side, keep their distance,
// and are swapped out of sight at the ends.

const COLORS = [0xc23b2a, 0x2f7fd8, 0xe0e0e0, 0x3aa760, 0x2a2a2a, 0xd0a020, 0x8a8f96, 0x6a2a8a];
const COUNT = 10;
const LANE = 2.8;

export class Highway {
  constructor(game) {
    this.game = game;
    const p = game.park, b = game.bridge;
    const pts = [[-1090, -35]];
    for (let i = 0; i < p.road.length; i += 4) pts.push([p.road[i].x, p.road[i].z]);
    for (let t = 15; t < b.length + 12; t += 15) { const q = b.at(t); pts.push([q.x, q.z]); }
    const e = b.at(b.length + 12);
    pts.push([e.x, e.z], [-1010, -1262], [-1000, -1300]);
    this.route = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.cars = [];
    this.spawnT = 0;
    for (let i = 0; i < COUNT; i++) this.spawn(true);
  }

  // a point on the route, moved over to the right-hand lane for the direction of travel
  lanePoint(i, dir) {
    const r = this.route, a = r[Math.max(0, Math.min(r.length - 1, i))], b = r[Math.max(0, Math.min(r.length - 1, i + dir))];
    const d = b.clone().sub(a);
    if (d.lengthSq() < 0.01) return a.clone();
    d.normalize();
    const right = new THREE.Vector3(d.z, 0, -d.x); // to the right of travel
    return a.clone().addScaledVector(right, LANE);
  }

  spawn(anywhere = false) {
    const g = this.game, r = this.route;
    const pt = g.shorePlayer?.body.translation();
    for (let tries = 0; tries < 15; tries++) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const i = anywhere ? 1 + Math.floor(Math.random() * (r.length - 3)) : dir > 0 ? 1 : r.length - 2;
      const at = this.lanePoint(i, dir);
      if (pt && Math.hypot(pt.x - at.x, pt.z - at.z) < 90) continue;
      if (this.cars.some((c) => c.pos.distanceTo(at) < 25)) continue;
      const nx = r[i + dir];
      const heading = Math.atan2(-(nx.x - at.x), -(nx.z - at.z));
      if (!clearSpot(g, at.x, at.z, heading, undefined, this.groundY(at))) continue;
      const car = new Car(g, { color: COLORS[Math.floor(Math.random() * COLORS.length)], x: at.x, z: at.z, heading, maxSpeed: 22 });
      // start at road height (the bridge deck and the hills are well above sea level)
      const gy = car.groundAt(at.x, at.z, this.groundY(at) + 2.5);
      car.body.setTranslation({ x: at.x, y: gy, z: at.z }, true);
      car.pos.y = gy; car.groundY = gy;
      Object.assign(car, { hw: true, idx: i + dir, dir, cruise: 15 + Math.random() * 4 });
      this.cars.push(car);
      return car;
    }
    return null;
  }

  // roughly how high the road is here (park road / bridge deck), for spawning
  groundY(p) {
    const g = this.game, b = g.bridge;
    const t = (p.x - b.start.x) * b.dir.x + (p.z - b.start.z) * b.dir.z;
    const lat = Math.abs((p.x - b.start.x) * b.dir.z - (p.z - b.start.z) * b.dir.x);
    if (t > -5 && t < b.length + 5 && lat < 15) return b.deckAt(Math.max(0, t));
    const n = g.park.nearestRoad(p.x, p.z);
    return n.d < 20 ? n.r.y : 2.5;
  }

  update(dt) {
    const g = this.game;
    if (this.frozen) { for (const c of this.cars) c.coast(dt); return; }
    const pt = g.shorePlayer.body.translation();
    for (const c of [...this.cars]) {
      if (c.wreck || c.sinking) {
        c.coast(dt);
        if ((c.wreckT || 0) > 30 || c.sinking) { if ((c.wreckT || 0) > 30 || c.pos.y < -5) this.remove(c); }
        continue;
      }
      if (g.vehicles.active === c) continue;
      const target = this.lanePoint(c.idx, c.dir);
      if (Math.hypot(target.x - c.pos.x, target.z - c.pos.z) < 7) {
        c.idx += c.dir;
        if (c.idx < 0 || c.idx >= this.route.length) {
          // the end of the road: off it goes (out of sight), and someone new starts somewhere else
          if (Math.hypot(pt.x - c.pos.x, pt.z - c.pos.z) > 70) { this.remove(c); continue; }
          c.dir *= -1; c.idx = Math.max(0, Math.min(this.route.length - 1, c.idx + c.dir * 2));
        }
      }
      // keep a distance behind whoever's in front
      let speed = c.cruise;
      const f = c.forward;
      for (const o of [...this.cars, ...g.traffic.cars, ...g.vehicles.list]) {
        if (o === c || o.wreck) continue;
        const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z;
        const ahead = dx * f.x + dz * f.z, side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 22 && side < 2.6) speed = Math.min(speed, Math.max(0, (ahead - 7) * 1.2));
      }
      const pdx = pt.x - c.pos.x, pdz = pt.z - c.pos.z;
      if (pdx * f.x + pdz * f.z > 0 && pdx * f.x + pdz * f.z < 14 && Math.abs(pdx * f.z - pdz * f.x) < 2 && !g.vehicles.active) speed = 0; // you're in the road
      c.driveTo(dt, speed, this.lanePoint(c.idx, c.dir), { maxSpeed: 22, accel: 6, grip: 12 });
      runOver(g, c, false);
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 3; if (this.cars.length < COUNT) this.spawn(false); }
  }

  remove(c) {
    c.dispose();
    const i = this.cars.indexOf(c);
    if (i >= 0) this.cars.splice(i, 1);
  }
}
