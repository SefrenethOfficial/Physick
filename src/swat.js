import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Heli } from './cargo.js';
import { Car, clearSpot } from './carphys.js';
import { islandAt, LAND_Y } from './world.js';
import { modelMesh } from './dealership.js';
import { std, canvasTex } from './buildkit.js';

// The heavy end of a police chase. The wanted level goes all the way to 20 stars:
//   6+  police helicopters circle overhead with a searchlight and a marksman
//   10+ SWAT vans full of armoured officers with rifles
//   20  advanced SWAT: armoured trucks and exo-suited officers who hit very hard
// Plus roadblocks (with spike strips) ahead of you when you're driving, and bounty hunters who
// come for you after a big chase, even once the police have given up.

export const MAX_STARS = 20;
export const HEAT = [0, 1, 2, 4, 7, 11, 15, 19, 24, 29, 35, 41, 48, 55, 63, 71, 80, 89, 99, 110, 120];
export const FOOT = [0, 2, 4, 6, 8, 10, 10, 11, 11, 12, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14];
export const CARS = [0, 1, 2, 3, 4, 4, 4, 5, 5, 5, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 5];
export const HELIS = (w) => (w >= 20 ? 3 : w >= 10 ? 2 : w >= 6 ? 1 : 0);
export const VANS = (w) => (w >= 20 ? 3 : w >= 15 ? 2 : w >= 10 ? 1 : 0);

export const SWAT_LOOK = { shirt: 0x1b1d22, pants: 0x1b1d22, skin: 0xa8724f, hat: 'helmet', hatColor: 0x111214 };
export const ADV_LOOK = { shirt: 0x3a4250, pants: 0x262b33, skin: 0x7a4f35, hat: 'helmet', hatColor: 0x2a3038 };

// marks a citizen as SWAT (tier 1) or advanced SWAT (tier 2): armour, a rifle and a look
export function makeSwat(npc, tier) {
  npc.swat = tier;
  npc.hp = tier === 2 ? 420 : 260;
  npc.cash = tier === 2 ? 150 : 60;
  // a visor (glowing red on the advanced ones) and a vest
  const head = npc.fig.parts.head, torso = npc.fig.parts.torso;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), tier === 2
    ? new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 })
    : new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.1, metalness: 0.6 }));
  visor.position.set(0, 0.03, 0.13); head.add(visor);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.32), std({ color: tier === 2 ? 0x55606e : 0x2a2e36, roughness: 0.6, metalness: tier === 2 ? 0.5 : 0.1 }));
  vest.position.y = 0.06; torso.add(vest);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), new THREE.MeshBasicMaterial({ map: swatTag(tier), transparent: true }));
  label.position.set(0, 0.1, -0.165); label.rotation.y = Math.PI; torso.add(label);
  if (tier === 2) for (const s of [-1, 1]) { const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.22), std({ color: 0x55606e, metalness: 0.5 })); pad.position.set(s * 0.28, 0.33, 0); torso.add(pad); }
  return npc;
}
const tags = {};
function swatTag(tier) {
  return (tags[tier] ||= canvasTex(128, 40, (c, w, h) => { c.fillStyle = tier === 2 ? '#ff4030' : '#f2f2ee'; c.font = 'bold 30px Arial'; c.textAlign = 'center'; c.fillText(tier === 2 ? 'ADV-SWAT' : 'SWAT', w / 2, 31); }));
}

// ---------------------------------------------------------------- police helicopter
class PoliceHeli {
  constructor(game, at) {
    this.game = game;
    this.h = new Heli(game);
    this.h.ladder.visible = false;
    this.h.root.traverse((o) => { if (o.isMesh && o.material.color?.getHex() === 0x1f2a3a) { o.material = o.material.clone(); o.material.color.set(0xf2f2ee); } });
    // a blue stripe and POLICE on the sides
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.35, 4.6), std({ color: 0x1c2f6e }));
    stripe.position.y = -0.25; this.h.root.add(stripe);
    const word = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#1c2f6e'; c.font = 'bold 48px Arial'; c.textAlign = 'center'; c.fillText('POLICE', w / 2, 50); });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: word, transparent: true })); p.position.set(s * 1.64, 0.35, 0); p.rotation.y = s * Math.PI / 2; this.h.root.add(p); }
    // the searchlight: a soft cone down to a bright pool on the ground
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 4.5, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pool.rotation.x = -Math.PI / 2;
    game.scene.add(this.beam, this.pool);
    this.pos = at.clone();
    this.vel = new THREE.Vector3();
    this.ang = Math.random() * Math.PI * 2;
    this.r = 26 + Math.random() * 10;
    this.alt = 26 + Math.random() * 8;
    this.hp = 320;
    this.fireT = 3;
    this.light = at.clone();
    this.t = 0;
    this.leaving = false;
  }

  update(dt, target, advanced) {
    const g = this.game;
    this.t += dt;
    if (this.falling) {
      this.vel.y -= 14 * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.h.root.rotation.y += dt * 6;
      this.h.root.position.copy(this.pos);
      this.h.rotor.rotation.y += dt * 10;
      const ground = groundBelow(g, this.pos);
      if (this.pos.y < ground + 1.2) { g.blast(this.pos.clone().setY(ground + 1), 9, 60, false); this.dead = true; }
      return false;
    }
    // circle the target, high up, swinging round
    this.ang += dt * (0.25 + 0.1 * Math.sin(this.t * 0.3));
    const goal = this.leaving
      ? this.pos.clone().add(new THREE.Vector3(this.pos.x - target.x, 0, this.pos.z - target.z).normalize().multiplyScalar(60)).setY(this.pos.y + 20)
      : new THREE.Vector3(target.x + Math.cos(this.ang) * this.r, Math.max(target.y, LAND_Y) + this.alt, target.z + Math.sin(this.ang) * this.r);
    const to = goal.sub(this.pos);
    this.vel.lerp(to.clampLength(0, 30), Math.min(1, dt * 1.2));
    this.pos.addScaledVector(this.vel, dt);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const r = this.h.root;
    r.position.copy(this.pos);
    const yaw = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    r.rotation.set(Math.min(0.3, hv * 0.012), yaw, Math.sin(this.t) * 0.05, 'YXZ');
    this.h.rotor.rotation.y += dt * 28;
    this.h.tail.rotation.x += dt * 40;
    r.visible = true;
    // the searchlight wanders onto you
    this.light.lerp(new THREE.Vector3(target.x + Math.sin(this.t * 1.7) * 2, target.y, target.z + Math.cos(this.t * 1.3) * 2), Math.min(1, dt * 2.2));
    const gy = groundBelow(g, this.light);
    this.pool.position.set(this.light.x, gy + 0.08, this.light.z);
    const from = this.pos.clone().add(new THREE.Vector3(0, -1.6, 0)), toL = new THREE.Vector3(this.light.x, gy, this.light.z);
    const len = from.distanceTo(toL);
    this.beam.scale.set(1, len, 1);
    this.beam.position.copy(from).lerp(toL, 0.5);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), toL.clone().sub(from).normalize());
    this.beam.visible = this.pool.visible = !this.leaving;
    // can the crew see you?
    const sees = !this.leaving && Math.hypot(target.x - this.pos.x, target.z - this.pos.z) < 90 && lineOfSight(g, this.pos, target);
    // the marksman in the door
    this.fireT -= dt;
    if (sees && this.fireT <= 0 && !g.health.dead) {
      this.fireT = advanced ? 1.4 + Math.random() : 2.4 + Math.random() * 1.5;
      const hit = Math.random() < (advanced ? 0.45 : 0.3);
      const aim = new THREE.Vector3(target.x, target.y + 0.5, target.z);
      if (!hit) aim.add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
      g.police.tracer(this.pos.clone().add(new THREE.Vector3(0, -0.8, 0)), aim);
      g.sfx.play('smg');
      const v = g.vehicles.active;
      if (hit) {
        if (v && !v.isHeli) { if (!v.bulletproof && !v.monster) { v.damage(9); g.health.damage(3, 'police'); } else g.fx.flash(aim, 0xffe0a0, 0.6, 0.05); }
        else g.health.damage(advanced ? 12 : 9, 'police');
      }
    }
    return sees;
  }

  // a ray from the player's gun: does it hit the helicopter (within maxD)?
  rayHit(o, d, maxD) {
    const c = this.pos.clone().add(new THREE.Vector3(0, 0.2, 0));
    const t = c.clone().sub(o).dot(d);
    if (t < 0 || t > maxD) return null;
    const closest = o.clone().addScaledVector(d, t);
    return closest.distanceTo(c) < 2.6 ? t : null;
  }

  damage(n) {
    if (this.falling) return;
    this.hp -= n;
    this.game.fx.flash(this.pos.clone(), 0xffe0a0, 0.8, 0.05);
    if (this.hp <= 0) {
      this.falling = true;
      this.vel.set((Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6);
      this.beam.visible = this.pool.visible = false;
      this.game.fx.explosion(this.pos.clone());
      this.game.sfx.play('explosion');
      this.game.hud.toast('Police chopper down!', 0xffd166);
      this.game.news?.add(`A police helicopter has been shot down over ${this.game.news.place(this.pos)}. Unbelievable scenes.`, 'crime');
      this.game.police.heat += 4; this.game.police.setWantedFromHeat();
    }
  }

  dispose() { this.h.root.removeFromParent(); this.beam.removeFromParent(); this.pool.removeFromParent(); }
}

function groundBelow(g, p) {
  const sb = g.portSandbox;
  const hit = sb.world.castRay(new RAPIER.Ray({ x: p.x, y: Math.max(p.y, LAND_Y) + 60, z: p.z }, { x: 0, y: -1, z: 0 }), 200, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
  return hit ? Math.max(p.y, LAND_Y) + 60 - hit.timeOfImpact : 0.2;
}
function lineOfSight(g, a, b) {
  const sb = g.portSandbox;
  const dx = b.x - a.x, dy = b.y + 0.5 - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
  const hit = sb.world.castRay(new RAPIER.Ray({ x: a.x, y: a.y - 2, z: a.z }, { x: dx / d, y: dy / d, z: dz / d }), d - 1.5, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
  return !hit;
}

// ---------------------------------------------------------------- the heavy response
export class Escalation {
  constructor(game) {
    this.game = game;
    this.helis = [];
    this.blocks = []; // roadblocks: { cars, strip, cops, t }
    this.spikes = [];
    this.vanT = 0;
    this.heliT = 0;
    this.blockT = 12;
    this.chaseT = 0;
    this.peak = 0;
    this.bounty = null;
    this.bountyT = 0;
  }

  get police() { return this.game.police; }

  // ---------------------------------------------------------------- SWAT vans
  spawnVan(target, island, tier) {
    const P = this.police, R = P.roads(island);
    if (!R) return null;
    const nodes = [];
    for (let i = 0; i < R.xs.length; i++) for (let j = 0; j < R.zs.length; j++) {
      const d = Math.hypot(R.xs[i] - target.x, R.zs[j] - target.z);
      if (d > 100 && d < 300) nodes.push({ i, j });
    }
    nodes.sort(() => Math.random() - 0.5);
    const spec = tier === 2
      ? { id: 'advtruck', scale: [1.25, 1.42, 1.32], color: 0x2a3038, rack: true }
      : { id: 'swatvan', scale: [1.15, 1.38, 1.22], color: 0x1b1d22, rack: true };
    const half = { x: 0.95 * spec.scale[0], y: 0.55 * spec.scale[1], z: 2.25 * spec.scale[2] };
    const n = nodes.find((m) => clearSpot(this.game, R.xs[m.i], R.zs[m.j], 0, half));
    if (!n) return null;
    const mesh = modelMesh(spec, spec.color);
    // SWAT lettering and a light bar
    const word = swatTag(tier);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ map: word, transparent: true })); p.position.set(s * 1.12, 1.15, 0.2); p.rotation.y = s * Math.PI / 2; mesh.add(p); }
    for (const [x, c] of [[-0.4, 0xff2020], [0.4, 0x2050ff]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5 })); l.position.set(x, 2.35, -0.6); mesh.add(l); }
    const toward = Math.atan2(-(target.x - R.xs[n.i]), -(target.z - R.zs[n.j]));
    const car = new Car(this.game, { police: true, mesh, half, x: R.xs[n.i], z: R.zs[n.j], heading: Math.round(toward / (Math.PI / 2)) * (Math.PI / 2), hp: tier === 2 ? 650 : 320, density: 170 });
    Object.assign(car, { R, island, at: { i: n.i, j: n.j }, from: null, to: null, deployed: 0, ramT: 0, leaving: false, life: 0, stuckT: 0, reverseT: 0, swat: tier, bulletproof: tier === 2 });
    P.cars.push(car);
    return car;
  }

  // ---------------------------------------------------------------- roadblocks and spikes
  // Somewhere on the road ahead of the car you're driving.
  roadAhead(v) {
    const g = this.game, f = v.forward;
    const hw = g.highway;
    // on the long road / bridge: a point on the route ~140 m ahead the way you're going
    if (hw) {
      let bi = -1, bd = 30;
      hw.route.forEach((p, i) => { const d = Math.hypot(p.x - v.pos.x, p.z - v.pos.z); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) {
        const dir = (() => { const a = hw.route[Math.max(0, bi - 1)], b = hw.route[Math.min(hw.route.length - 1, bi + 1)]; return (b.x - a.x) * f.x + (b.z - a.z) * f.z > 0 ? 1 : -1; })();
        let dist = 0, i = bi;
        while (dist < 140 && i + dir >= 0 && i + dir < hw.route.length) { dist += hw.route[i].distanceTo(hw.route[i + dir]); i += dir; }
        if (dist >= 90) {
          const p = hw.route[i], q = hw.route[Math.max(0, Math.min(hw.route.length - 1, i - dir))];
          return { pos: new THREE.Vector3(p.x, hw.groundY(p), p.z), along: Math.atan2(p.x - q.x, p.z - q.z), width: 12 };
        }
      }
    }
    // in a street grid: the junction ahead
    const isl = islandAt(v.pos.x, v.pos.z, 4)?.id;
    const R = this.police.roads(isl);
    if (!R) return null;
    let best = null, bs = -Infinity;
    for (const x of R.xs) for (const z of R.zs) {
      const dx = x - v.pos.x, dz = z - v.pos.z, d = Math.hypot(dx, dz);
      if (d < 80 || d > 190) continue;
      const ahead = (dx * f.x + dz * f.z) / d;
      if (ahead > bs) { bs = ahead; best = { x, z }; }
    }
    if (!best || bs < 0.85) return null;
    const ax = Math.abs(f.x) > Math.abs(f.z);
    // stop just before the junction, across your lane of travel
    const back = ax ? new THREE.Vector3(-Math.sign(f.x) * 12, 0, 0) : new THREE.Vector3(0, 0, -Math.sign(f.z) * 12);
    return { pos: new THREE.Vector3(best.x + back.x, LAND_Y, best.z + back.z), along: ax ? Math.PI / 2 : 0, width: 14 };
  }

  placeRoadblock(v) {
    const g = this.game, spot = this.roadAhead(v);
    if (!spot) return false;
    const across = new THREE.Vector3(Math.cos(spot.along), 0, -Math.sin(spot.along)); // perpendicular to the road
    const along = new THREE.Vector3(Math.sin(spot.along), 0, Math.cos(spot.along));
    const cars = [];
    for (const s of [-1, 1]) {
      const p = spot.pos.clone().addScaledVector(across, s * (spot.width / 2 - 2.4)).addScaledVector(along, 3);
      const heading = spot.along + Math.PI / 2 + (s > 0 ? 0.25 : -0.25);
      const c = new Car(g, { police: true, x: p.x, z: p.z, heading });
      const gy = c.groundAt(p.x, p.z, spot.pos.y + 3);
      c.body.setTranslation({ x: p.x, y: gy, z: p.z }, true); c.pos.y = gy; c.groundY = gy;
      Object.assign(c, { blockade: true, leaving: false, life: 0, deployed: 1, island: islandAt(p.x, p.z, 4)?.id || 'park' });
      this.police.cars.push(c);
      cars.push(c);
    }
    // the spike strip across the gap, a few metres in front of the cars
    const sp = spot.pos.clone().addScaledVector(along, -4);
    const strip = new THREE.Group();
    strip.position.set(sp.x, spot.pos.y + 0.05, sp.z);
    strip.rotation.y = spot.along; // (its length runs across the road)
    const base = new THREE.Mesh(new THREE.BoxGeometry(spot.width - 2, 0.05, 0.5), std({ color: 0x2a2c30, metalness: 0.5 }));
    strip.add(base);
    for (let k = 0; k < 24; k++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), std({ color: 0xb8bcc2, metalness: 0.8 })); t.position.set(-(spot.width - 2) / 2 + (k + 0.5) * ((spot.width - 2) / 24), 0.1, (k % 2 - 0.5) * 0.2); strip.add(t); }
    g.scene.add(strip);
    const spike = { mesh: strip, pos: sp, dirAcross: across, half: (spot.width - 2) / 2, along, t: 0 };
    this.spikes.push(spike);
    // officers behind the cars
    const cops = [];
    const isl = islandAt(spot.pos.x, spot.pos.z, 4)?.id;
    if (isl && ['city', 'town', 'hood', 'park'].includes(isl)) for (const s of [-1, 1]) {
      const p = spot.pos.clone().addScaledVector(across, s * 2).addScaledVector(along, 7);
      p.y = spot.pos.y + 0.1;
      const n = g.citizens.spawnCitizen(isl, 'cop', p);
      if (!n) continue;
      if (this.police.wanted >= 10) makeSwat(n, this.police.wanted >= 20 ? 2 : 1);
      Object.assign(n, { dispatched: true, state: 'chase', lastSeen: v.pos.clone() });
      cops.push(n);
    }
    this.blocks.push({ cars, spike, cops, t: 0, pos: spot.pos.clone() });
    g.hud.toast('Roadblock ahead!', 0xff6a5a);
    return true;
  }

  clearBlock(b) {
    const P = this.police;
    for (const c of b.cars) if (P.cars.includes(c)) P.removeCar(c);
    this.removeSpike(b.spike);
    for (const n of b.cops) if (this.game.citizens.list.includes(n)) n.leaving = true;
    this.blocks.splice(this.blocks.indexOf(b), 1);
  }

  removeSpike(s) { s.mesh.removeFromParent(); const i = this.spikes.indexOf(s); if (i >= 0) this.spikes.splice(i, 1); }

  checkSpikes() {
    const v = this.game.vehicles.active;
    if (!v || v.isHeli) return;
    for (const s of this.spikes) {
      const d = v.pos.clone().sub(s.pos);
      if (Math.abs(d.dot(s.along)) < 1.6 && Math.abs(d.dot(s.dirAcross)) < s.half + 0.8 && Math.abs(v.pos.y - s.pos.y) < 2) {
        if (v.bulletproof || v.monster) { if (!v.spikeNote) { v.spikeNote = true; this.game.hud.toast('Run-flat tyres: the spikes do nothing', 0x7be08a); } continue; }
        if (!v.flat) { v.flat = true; this.game.sfx.play('thud'); this.game.shake = 0.8; this.game.hud.toast('Tyres shredded! Get them fixed at Underpass Customs', 0xff6a5a); }
      }
    }
  }

  // ---------------------------------------------------------------- bounty hunters
  startBounty() {
    const g = this.game;
    const amount = 500 * this.peak;
    const pt = g.shorePlayer.body.translation();
    const isl = islandAt(pt.x, pt.z, 4)?.id;
    if (!isl || !['city', 'town', 'hood', 'park'].includes(isl) || !g.onShore || g.homes?.inside) { this.bountyT = 30; return; } // try later
    const hunters = [];
    for (let k = 0; k < (this.peak >= 10 ? 4 : 3); k++) {
      const p = g.citizens.randomPointOn(isl, new THREE.Vector3(pt.x, 0, pt.z), 80, 45);
      if (!p) continue;
      const n = g.citizens.spawnCitizen(isl, 'goon', p, { look: { shirt: 0x3a2a1a, pants: 0x1b1b1b, skin: [0xd9a47c, 0x7a4f35, 0xf1c9a5][k % 3], hat: 'cap', hatColor: 0xc06a1a } });
      if (!n) continue;
      Object.assign(n, { alerted: true, lastSeen: new THREE.Vector3(pt.x, pt.y, pt.z), hp: 180, cash: Math.round(amount / 6), hunter: true,
        weapon: k === 0 ? { rate: [1.2, 0.5], dmg: 14, acc: 1.1, range: 14, shotgun: true } : { rate: [0.8, 0.5], dmg: 8, acc: 1.2, range: 20 } });
      hunters.push(n);
    }
    if (!hunters.length) { this.bountyT = 30; return; }
    this.bounty = { hunters, amount, t: 0 };
    g.story?.phone?.text?.('Unknown', `Word is someone put $${amount.toLocaleString()} on your head. Watch your back.`, true);
    g.news?.add('Rumours on the street of a big bounty on whoever caused that chase.', 'crime');
    g.hud.toast(`BOUNTY HUNTERS are after you ($${amount.toLocaleString()} on your head)`, 0xff9a3a);
    g.hud.flashBanner?.('BOUNTY', '#ff9a3a');
  }

  updateBounty(dt) {
    const g = this.game, b = this.bounty;
    if (!b) {
      if (this.bountyT > 0) { this.bountyT -= dt; if (this.bountyT <= 0 && this.peak >= 5) this.startBounty(); }
      return;
    }
    b.t += dt;
    const pt = g.shorePlayer.body.translation();
    const alive = b.hunters.filter((n) => g.citizens.list.includes(n) && !n.down);
    // they always know roughly where you are
    b.trackT = (b.trackT || 0) - dt;
    if (b.trackT <= 0) { b.trackT = 2.5; for (const n of alive) n.lastSeen = new THREE.Vector3(pt.x + (Math.random() - 0.5) * 6, pt.y, pt.z + (Math.random() - 0.5) * 6); }
    if (!alive.length) {
      g.economy.addMoney(Math.round(b.amount * 0.5), 'turned the tables on the bounty hunters');
      g.hud.toast('The bounty hunters are dead. The contract\'s off.', 0x7be08a);
      this.bounty = null; this.peak = 0;
    } else if (b.t > 240) {
      for (const n of alive) g.citizens.despawn(n);
      g.hud.toast('The bounty hunters gave up on you', 0x9ec5ff);
      this.bounty = null; this.peak = 0;
    }
  }

  // ---------------------------------------------------------------- per tick
  update(dt, target, onFoot, island) {
    const g = this.game, P = this.police, w = P.wanted;
    if (w > this.peak) this.peak = w;
    // a long chase only gets hotter while they've got eyes on you
    if (w >= 5 && g.time * 1000 - P.lastSeen < 3000) {
      this.chaseT += dt;
      if (this.chaseT > 14) { this.chaseT = 0; P.heat += 2; const before = P.wanted; P.setWantedFromHeat(); if (P.wanted > before) { g.sfx.play('star'); g.hud.toast(`They're throwing everything at you: ${P.wanted} stars`, 0xff6a5a); } }
    }
    // helicopters
    const wantH = HELIS(w);
    const live = this.helis.filter((h) => !h.leaving && !h.falling);
    this.heliT -= dt;
    if (w > 0 && live.length < wantH && this.heliT <= 0) {
      this.heliT = 8;
      const a = Math.random() * Math.PI * 2;
      this.helis.push(new PoliceHeli(g, new THREE.Vector3(target.x + Math.cos(a) * 220, LAND_Y + 70, target.z + Math.sin(a) * 220)));
      g.hud.toast('Police chopper inbound', 0xff6a5a);
    }
    if (live.length > wantH) for (const h of live.slice(wantH)) h.leaving = true;
    let seen = false;
    for (const h of [...this.helis]) {
      if (h.update(dt, target, w >= 20)) seen = true;
      const far = Math.hypot(h.pos.x - target.x, h.pos.z - target.z);
      if (h.dead || (h.leaving && far > 250)) { h.dispose(); this.helis.splice(this.helis.indexOf(h), 1); }
    }
    // SWAT vans
    const vans = P.cars.filter((c) => c.swat && !c.leaving && !c.wreck).length;
    this.vanT -= dt;
    if (island && vans < VANS(w) && this.vanT <= 0) { this.vanT = 10; if (this.spawnVan(target, island, w >= 20 ? 2 : 1)) g.hud.toast(w >= 20 ? 'Advanced SWAT deployed' : 'SWAT team inbound', 0xff6a5a); }
    // roadblocks when you're driving
    const v = g.vehicles.active;
    this.blockT -= dt;
    if (w >= 4 && v && !v.isHeli && Math.abs(v.speed) > 8 && this.blockT <= 0 && this.blocks.length < 2) this.blockT = this.placeRoadblock(v) ? 28 : 4;
    for (const b of [...this.blocks]) {
      b.t += dt;
      if (b.t > 70 || (w === 0 && b.t > 3) || Math.hypot(b.pos.x - target.x, b.pos.z - target.z) > 450) this.clearBlock(b);
    }
    this.checkSpikes();
    // a big chase that ends with you getting away: someone puts a price on your head
    if (w === 0 && this.peak >= 5 && !this.bounty && this.bountyT <= 0 && !this.bountyArmed) { this.bountyArmed = true; this.bountyT = 25 + Math.random() * 20; }
    if (w > 0) this.bountyArmed = false;
    this.updateBounty(dt);
    void onFoot;
    return seen;
  }

  // your gunfire against the choppers
  shootAir(o, d, maxD, dmg) {
    let best = null, bt = maxD;
    for (const h of this.helis) { if (h.falling) continue; const t = h.rayHit(o, d, bt); if (t != null) { bt = t; best = h; } }
    if (best) best.damage(dmg);
    return best ? bt : null;
  }

  // dead or busted: the chase is over, no bounty
  reset() {
    for (const h of this.helis) h.leaving = true;
    for (const b of [...this.blocks]) this.clearBlock(b);
    this.peak = 0; this.chaseT = 0; this.bountyArmed = false; this.bountyT = 0;
  }
}
