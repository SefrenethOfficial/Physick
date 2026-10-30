import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Car, clearSpot } from './carphys.js';
import { islandAt, onLand, blocked, nearestLandPoint, LAND_Y } from './world.js';
import { modelMesh } from './dealership.js';
import { std, canvasTex } from './buildkit.js';
import { DIMS } from './figure.js';
import { rifleModel } from './gunmodels.js';
import { PoliceHeli, HEAT } from './swat.js';
import { buildJet } from './jets.js';

// Past 30 stars the police hand you over to the military. Up to 50:
//   31+ the army on the ground: soldiers, Humvees with a gunner on the roof, army checkpoints
//   36+ attack helicopters: a nose cannon and rocket pods, and they follow you out to sea
//   41+ air strikes: a red smoke marker where you're standing, then a jet comes in low and
//       walks a line of bombs through it
//   46+ the Navy: a frigate stands off the coast and shells you, its close-in guns shoot down
//       anything you fly near it, and marines come ashore in landing craft
//   50  everything at once (and a price on your head)
// Set foot on NAS Halyard (or fly in low over it) and you've got five seconds to turn round
// before it's 50 stars.

export const ARMY = 31, GUNSHIP = 36, STRIKE = 41, NAVY = 46, LOCKDOWN = 50;
export const SOLDIERS = (w) => (w >= 50 ? 12 : w >= 46 ? 10 : w >= 36 ? 8 : w >= 31 ? 6 : 0);
export const HUMVEES = (w) => (w >= 41 ? 3 : w >= 31 ? 2 : 0);
export const GUNSHIPS = (w) => (w >= 50 ? 4 : w >= 46 ? 3 : w >= 36 ? 2 : 0);

const SKINS = [0xd9a47c, 0x7a4f35, 0xf1c9a5, 0xa8724f, 0x5a3a26];
export const armyLook = (marine = false) => ({ shirt: marine ? 0x3a4a5a : 0x5a6340, pants: marine ? 0x2e3a46 : 0x4a5034, skin: SKINS[Math.floor(Math.random() * SKINS.length)], hat: 'helmet', hatColor: marine ? 0x2e3a46 : 0x4b5232 });

const mats = {};
const M = {
  olive: () => (mats.olive ||= std({ color: 0x4b5232, roughness: 0.85 })),
  dark: () => (mats.dark ||= std({ color: 0x23251c, roughness: 0.8 })),
  navy: () => (mats.navy ||= std({ color: 0x2e3a46, roughness: 0.85 })),
  grey: () => (mats.grey ||= std({ color: 0x7c848c, roughness: 0.6, metalness: 0.3 })),
  greyDark: () => (mats.greyDark ||= std({ color: 0x4e555c, roughness: 0.6, metalness: 0.3 })),
  star: () => (mats.star ||= new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(128, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#e8e4d4'; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } c.fill(); c.font = 'bold 26px Arial'; c.fillText('ARMY', 62, 42); }) })),
  smoke: () => (mats.smoke ||= std({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 1.5 })),
};

// a soldier: an olive plate carrier and helmet, a rifle. (Tier-1 SWAT as far as the AI goes.)
export function makeSoldier(npc, marine = false) {
  npc.swat = 1; npc.soldier = true; npc.marine = marine;
  npc.hp = 300; npc.cash = 80;
  const P = npc.fig.parts, torso = P.torso, [tw, th, td] = DIMS.torso.size, kit = marine ? M.navy() : M.olive();
  const add = (parent, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  add(torso, new THREE.BoxGeometry(tw + 0.06, th * 0.78, td + 0.08), kit, 0, 0.04, 0);
  for (const x of [-0.12, 0, 0.12]) add(torso, new THREE.BoxGeometry(0.08, 0.1, 0.05), M.dark(), x, -0.12, td / 2 + 0.06);
  add(P.head, new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), kit, 0, 0.04, 0);
  const gun = rifleModel().mesh;
  gun.position.set(0.06, -0.06, td / 2 + 0.16); gun.rotation.set(0.35, Math.PI + 0.35, 0.25);
  torso.add(gun);
  return npc;
}

// a Humvee: a wide, low olive truck with a gunner's ring and a machine gun on the roof
export function humveeMesh() {
  const mesh = modelMesh({ scale: [1.3, 1.12, 1.12] }, 0x4b5232);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 16), M.dark()); ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.95, 0.3); mesh.add(ring);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.06), M.olive()); shield.position.set(0, 2.2, -0.15); mesh.add(shield);
  const mg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 8), M.dark()); mg.rotation.x = Math.PI / 2; mg.position.set(0, 2.25, -0.6); mesh.add(mg);
  const gunner = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.3), M.olive()); gunner.position.set(0, 2.2, 0.3); mesh.add(gunner);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6), M.olive()); helm.position.set(0, 2.55, 0.3); mesh.add(helm);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), M.star()); p.position.set(s * 1.32, 0.9, 0.3); p.rotation.y = s * Math.PI / 2; mesh.add(p); }
  return mesh;
}
export function humveeCar(game, o) {
  const half = { x: 1.25, y: 0.62, z: 2.5 };
  const car = new Car(game, { police: true, mesh: humveeMesh(), half, hp: 520, density: 220, ...o });
  car.army = true; car.gunT = 1 + Math.random();
  return car;
}

// ---------------------------------------------------------------- attack helicopter
export class Gunship extends PoliceHeli {
  constructor(game, at) {
    super(game, at);
    this.gunship = true; this.label = 'Army gunship'; this.hp = 700;
    this.r = 42 + Math.random() * 12; this.alt = 34 + Math.random() * 8;
    const olive = std({ color: 0x3e4430, roughness: 0.8 });
    this.h.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.isMeshBasicMaterial) { o.visible = false; return; } // (no POLICE lettering)
      const c = o.material.color; if (!c || c.r + c.g + c.b < 0.25) return;
      o.material = olive;
    });
    const R = this.h.root;
    for (const s of [-1, 1]) {
      const stub = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.5), olive); stub.position.set(s * 2.0, -0.4, 0); R.add(stub);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 10), M.dark()); pod.rotation.x = Math.PI / 2; pod.position.set(s * 2.5, -0.5, -0.1); R.add(pod);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), M.star()); p.position.set(s * 1.64, 0.25, 0.6); p.rotation.y = s * Math.PI / 2; R.add(p);
    }
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 8), M.dark()); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.9, -2.4); R.add(nose);
    this.rocketT = 4 + Math.random() * 3; this.burstT = 2; this.burst = 0;
  }
  update(dt, target, advanced) {
    const sees = super.update(dt, target, true);
    this.beam.visible = this.pool.visible = false;
    if (this.falling || this.leaving || !sees || this.game.health.dead) return sees;
    const g = this.game, mil = g.police.mil;
    // the nose cannon: bursts of five
    this.burstT -= dt;
    if (this.burstT <= 0) {
      if (this.burst <= 0) this.burst = 5;
      this.burst--; this.burstT = this.burst > 0 ? 0.12 : 2.6 + Math.random();
      const from = this.pos.clone().add(new THREE.Vector3(0, -1.2, 0)), aim = new THREE.Vector3(target.x, target.y + 0.4, target.z);
      const hit = Math.random() < 0.3; if (!hit) aim.add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
      g.police.tracer(from, aim); g.sfx.play('ciws', 0.7);
      mil.hitPlayer(hit, 12, 9);
      if (!hit && Math.random() < 0.4) g.fx.emit(aim, new THREE.Vector3(0, 2, 0), 0xbfb090, 0.5, 1, 0);
    }
    // rockets
    this.rocketT -= dt;
    if (this.rocketT <= 0) {
      this.rocketT = 5 + Math.random() * 3;
      for (const s of [-1, 1]) mil.fireRocket(this.pos.clone().add(new THREE.Vector3(s * 2.5, -0.5, 0)), target);
    }
    return sees;
  }
}

// ---------------------------------------------------------------- the frigate
function frigateMesh() {
  const g = new THREE.Group(), grey = M.grey(), dark = M.greyDark();
  const sh = new THREE.Shape(); sh.moveTo(-6, 34); sh.lineTo(-6.5, -18); sh.quadraticCurveTo(0, -42, 6.5, -18); sh.lineTo(6, 34); sh.lineTo(-6, 34); // (the bow's at -z)
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 7, bevelEnabled: false }), grey); hull.rotation.x = Math.PI / 2; hull.position.y = 4; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 26), grey); deck.position.set(0, 6.2, 8); g.add(deck);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 7), grey); bridge.position.set(0, 10, 0); g.add(bridge);
  const win = new THREE.Mesh(new THREE.BoxGeometry(7.05, 0.8, 1), dark); win.position.set(0, 10.8, -3.2); g.add(win);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 12, 8), dark); mast.position.set(0, 17, 2); g.add(mast);
  const dish = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.4), dark); dish.position.set(0, 21, 2); g.add(dish);
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 4), dark); funnel.position.set(0, 10, 13); g.add(funnel);
  const turret = new THREE.Group(); turret.position.set(0, 5.6, -20); g.add(turret);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 1.6, 12), grey); tb.position.y = 0.8; turret.add(tb);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5, 10), dark); barrel.rotation.x = Math.PI / 2 - 0.25; barrel.position.set(0, 1.6, -2.4); turret.add(barrel);
  const ciws = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5 })); ciws.position.set(0, 13, 4); g.add(ciws);
  const num = new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(128, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#f2f2ee'; c.font = 'bold 48px Arial'; c.textAlign = 'center'; c.fillText('F 247', w / 2, 50); }) });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), num); p.position.set(s * 6.55, 2.5, -24); p.rotation.y = s * Math.PI / 2; g.add(p); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { mesh: g, turret, ciwsAt: new THREE.Vector3(0, 13, 4), gunAt: new THREE.Vector3(0, 7.5, -23) };
}

function landingCraftMesh() {
  const g = new THREE.Group(), m = M.greyDark();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.6, 9), m); hull.position.y = 0.4; g.add(hull);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.8, 0.2), m); ramp.position.set(0, 1.0, -4.5); g.add(ramp);
  const wheel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.4), M.grey()); wheel.position.set(1.0, 1.8, 3.4); g.add(wheel);
  for (let i = 0; i < 4; i++) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), M.navy()); h.position.set(-1.1 + (i % 2) * 2.2, 1.55, -1.5 + Math.floor(i / 2) * 1.6); g.add(h); }
  return g;
}

// ---------------------------------------------------------------- the military response
export class Military {
  constructor(game) {
    this.game = game;
    this.rockets = [];
    this.strike = null; this.strikeT = 10;
    this.frigate = null; this.navyT = 0;
    this.crafts = []; this.craftT = 20;
    this.soldierT = 0; this.humveeT = 0;
    this.nas = null; // trespass countdown
    this.lastTier = 0;
    this.jetHits = 0;
  }

  get police() { return this.game.police; }
  makeGunship(at) { return new Gunship(this.game, at); }
  humvee(o) { return humveeCar(this.game, o); }
  soldier(n) { return makeSoldier(n); }

  // where you really are (on foot, driving, sailing, flying, or aboard the ship)
  worldPos() {
    const g = this.game;
    if (g.flying) return g.jets.active.pos.clone();
    if (g.vehicles?.active) return g.vehicles.active.pos.clone();
    if (g.boats?.active) return g.boats.active.pos.clone().setY(1);
    const t = g.player.body.translation(), v = new THREE.Vector3(t.x, t.y, t.z);
    return g.onShore ? v : g.frame.localToWorld(v);
  }
  airborne() { const g = this.game; return g.flying || !!g.vehicles?.active?.isHeli || !!(g.skydive?.active); }
  // hidden away where nobody can see you: the volcano base, a home, the bunker, underground
  hidden() { const g = this.game; return !!(g.volcano?.playerInside || g.homes?.inside || g.underground || g.story?.underground); }

  // a hit on you (in whatever you're in)
  hitPlayer(hit, dmg, carDmg) {
    if (!hit) return;
    const g = this.game, v = g.vehicles?.active;
    if (g.flying) { this.jetHits++; if (this.jetHits > 14) { this.jetHits = 0; g.jets.active.crash?.('ground'); } return; }
    if (v) { if (v.bulletproof || v.monster) { if (Math.random() < 0.3) g.health.damage(2, 'military'); } else { v.damage(carDmg); if (Math.random() < 0.4) g.health.damage(3, 'military'); } return; }
    g.health.damage(dmg, 'military');
  }

  // ---- ground under a point (any island), walkable
  ground(x, z) {
    const sb = this.game.portSandbox;
    const hit = sb.world.castRayAndGetNormal(new RAPIER.Ray({ x, y: 420, z }, { x: 0, y: -1, z: 0 }), 500, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
    if (!hit || hit.normal.y < 0.8) return null;
    const y = 420 - hit.timeOfImpact, isl = islandAt(x, z, -4);
    if (!isl) return null;
    if (['city', 'town', 'hood', 'naval'].includes(isl.id) && Math.abs(y - LAND_Y) > 0.3) return null; // (not on a roof)
    return { p: new THREE.Vector3(x, y, z), island: isl.id };
  }

  spawnSoldier(target, marine = false, at = null) {
    const c = this.game.citizens;
    for (let k = 0; k < 8; k++) {
      let x, z;
      if (at) { x = at.x + (Math.random() - 0.5) * 6; z = at.z + (Math.random() - 0.5) * 6; } else { const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 45; x = target.x + Math.cos(a) * r; z = target.z + Math.sin(a) * r; }
      const gp = this.ground(x, z); if (!gp) continue;
      const n = c.spawnCitizen(gp.island, 'cop', gp.p.clone().setY(gp.p.y + 0.95), { look: armyLook(marine) });
      if (!n) continue;
      makeSoldier(n, marine);
      Object.assign(n, { dispatched: true, state: 'chase', lastSeen: target.clone() });
      return n;
    }
    return null;
  }

  spawnHumvee(target, island) {
    const P = this.police, R = P.roads(island);
    if (!R) return null;
    const nodes = [];
    for (let i = 0; i < R.xs.length; i++) for (let j = 0; j < R.zs.length; j++) { const d = Math.hypot(R.xs[i] - target.x, R.zs[j] - target.z); if (d > 100 && d < 300) nodes.push({ i, j }); }
    nodes.sort(() => Math.random() - 0.5);
    const n = nodes.find((m) => clearSpot(this.game, R.xs[m.i], R.zs[m.j], 0, { x: 1.25, y: 0.62, z: 2.5 }));
    if (!n) return null;
    const toward = Math.atan2(-(target.x - R.xs[n.i]), -(target.z - R.zs[n.j]));
    const car = humveeCar(this.game, { x: R.xs[n.i], z: R.zs[n.j], heading: Math.round(toward / (Math.PI / 2)) * (Math.PI / 2) });
    Object.assign(car, { R, island, at: { i: n.i, j: n.j }, from: null, to: null, deployed: 0, ramT: 0, leaving: false, life: 0, stuckT: 0, reverseT: 0, swat: 1 });
    P.cars.push(car);
    return car;
  }

  // ---- rockets (from the gunships)
  fireRocket(from, target) {
    const g = this.game;
    const aim = new THREE.Vector3(target.x + (Math.random() - 0.5) * 7, target.y, target.z + (Math.random() - 0.5) * 7);
    const vel = aim.sub(from).normalize().multiplyScalar(55);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), M.dark()); m.position.copy(from); g.scene.add(m);
    this.rockets.push({ m, pos: from.clone(), vel, life: 0 });
    g.fx.flash(from, 0xffb040, 1.5, 0.08); g.sfx.play('shoot', 0.6);
  }

  updateRockets(dt) {
    const g = this.game, sb = g.portSandbox, me = this.worldPos();
    for (const r of [...this.rockets]) {
      r.life += dt;
      const step = r.vel.clone().multiplyScalar(dt), len = step.length();
      const hit = sb.raycast(r.pos, step.clone().normalize(), len);
      let boom = null;
      if (hit && !hit.prop?.ragdoll) boom = hit.point;
      else if (r.pos.distanceTo(me) < 2.5) boom = r.pos.clone();
      else if (r.pos.y < LAND_Y - 1 || r.life > 5) boom = r.pos.clone();
      if (boom) { g.blast(boom, 6, 70, false); r.m.removeFromParent(); this.rockets.splice(this.rockets.indexOf(r), 1); continue; }
      r.pos.add(step); r.m.position.copy(r.pos); r.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), r.vel.clone().normalize());
      g.fx.emit(r.pos.clone(), new THREE.Vector3(0, 0.4, 0), 0xb8b4aa, 0.8, -0.05, 0.5);
    }
  }

  // ---- air strikes: a smoke marker, a few seconds' warning, then a jet and a line of bombs
  callStrike(target) {
    const g = this.game, v = g.vehicles?.active;
    const lead = v ? v.vel.clone().multiplyScalar(3.5) : new THREE.Vector3();
    const p = target.clone().add(lead); const gp = this.ground(p.x, p.z) || this.ground(target.x, target.z);
    if (!gp) return false;
    const yaw = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), M.smoke()); flare.position.copy(gp.p).add(new THREE.Vector3(0, 0.2, 0)); g.scene.add(flare);
    this.strike = { at: gp.p.clone(), dir, t: 0, flare, jet: null, bombs: 0 };
    g.hud.toast('AIR STRIKE INCOMING: get away from the red smoke!', 0xff3a2a);
    g.sfx.play('alarm');
    return true;
  }

  updateStrike(dt) {
    const g = this.game, S = this.strike;
    if (!S) return;
    S.t += dt;
    if (S.t < 4.5 && Math.random() < 0.7) g.fx.emit(S.at.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.2, (Math.random() - 0.5) * 0.6), 0xff4a3a, 2.2, -0.08, 0.4);
    const W = 160; // the jet's speed
    if (S.t > 3.2 && !S.jet) { // in it comes, low, along the line
      this.jetModel ||= buildJet('07').root;
      S.jet = this.jetModel.clone(); g.scene.add(S.jet);
      g.sfx.play('cannon', 0.5);
    }
    if (S.jet) {
      const s = (S.t - 4.5) * W; // where along the line (0 = over the marker)
      const p = S.at.clone().addScaledVector(S.dir, s).add(new THREE.Vector3(0, 55, 0));
      S.jet.position.copy(p); S.jet.rotation.set(0, Math.atan2(-S.dir.x, -S.dir.z), 0);
      // the bombs: five, 9 m apart, through the marker
      while (S.bombs < 5 && s > -36 + S.bombs * 9 - 8) {
        const bp = S.at.clone().addScaledVector(S.dir, -18 + S.bombs * 9);
        const gp = this.ground(bp.x, bp.z); g.blast(gp ? gp.p : bp, 8, 95, false); g.shake = Math.max(g.shake, 1);
        S.bombs++;
      }
    }
    if (S.t > 9) { S.flare.removeFromParent(); if (S.jet) S.jet.removeFromParent(); this.strike = null; }
  }

  // ---- the navy: a frigate offshore that shells the coast, shoots down aircraft, lands marines
  seaSpot(target) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, r = 260 + Math.random() * 560;
      const x = target.x + Math.cos(a) * r, z = target.z + Math.sin(a) * r;
      if (!blocked(x, z, 60)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  updateNavy(dt, target, w) {
    const g = this.game;
    const want = w >= NAVY;
    if (!want) { if (this.frigate) { this.frigate.mesh.removeFromParent(); this.frigate = null; } return false; }
    const F = this.frigate;
    if (!F || F.pos.distanceTo(target.clone().setY(0)) > 1100) {
      this.navyT -= dt;
      if (this.navyT > 0) return false;
      this.navyT = 6;
      const p = this.seaSpot(target); if (!p) return false;
      if (F) F.mesh.removeFromParent();
      const f = frigateMesh(); f.mesh.position.copy(p); g.scene.add(f.mesh);
      this.frigate = { ...f, pos: p, heading: Math.random() * 6.3, fireT: 4, ciwsT: 0, shells: [] };
      if (!F) { g.hud.toast('A Navy frigate is standing off the coast!', 0xff3a2a); g.news?.add('A Navy frigate has been ordered in to support the operation against a single suspect.', 'crime'); }
      return false;
    }
    // patrol slowly, broadside on
    F.heading += dt * 0.03;
    const fwd = new THREE.Vector3(-Math.sin(F.heading), 0, -Math.cos(F.heading));
    const next = F.pos.clone().addScaledVector(fwd, dt * 4);
    if (!blocked(next.x, next.z, 50)) F.pos.copy(next); else F.heading += Math.PI * 0.5;
    F.mesh.position.set(F.pos.x, -1.5 + Math.sin(g.time * 0.6) * 0.2, F.pos.z); F.mesh.rotation.y = F.heading;
    const dist = Math.hypot(target.x - F.pos.x, target.z - F.pos.z);
    // the turret swings onto you
    const local = F.mesh.worldToLocal(target.clone());
    F.turret.rotation.y = Math.atan2(-(local.x - F.turret.position.x), -(local.z - F.turret.position.z)) + Math.PI;
    let sees = false;
    // the main gun: shells lobbed in on the coast
    F.fireT -= dt;
    if (dist < (w >= LOCKDOWN ? 950 : 750) && F.fireT <= 0 && !this.hidden()) {
      F.fireT = w >= LOCKDOWN ? 4.5 : 7;
      const from = F.mesh.localToWorld(F.gunAt.clone()), T = 2.2 + dist / 300;
      const aim = new THREE.Vector3(target.x + (Math.random() - 0.5) * 18, target.y, target.z + (Math.random() - 0.5) * 18);
      const vel = new THREE.Vector3((aim.x - from.x) / T, (aim.y - from.y + 0.5 * 9.8 * T * T) / T, (aim.z - from.z) / T);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd080 })); ball.position.copy(from); g.scene.add(ball);
      F.shells.push({ ball, pos: from.clone(), vel, life: 0 });
      g.fx.flash(from, 0xffb040, 4, 0.15); g.sfx.play('bigGun', Math.max(0.2, 1 - dist / 900));
      sees = true;
    }
    for (const s of [...F.shells]) {
      s.life += dt; s.vel.y -= 9.8 * dt; s.pos.addScaledVector(s.vel, dt); s.ball.position.copy(s.pos);
      const gp = s.vel.y < 0 ? this.ground(s.pos.x, s.pos.z) : null, gy = gp ? gp.p.y : 0;
      if (s.pos.y <= gy + 0.3 || s.life > 12) { if (gp) { g.blast(s.pos.clone().setY(gy + 0.3), 9, 100, false); g.shake = Math.max(g.shake, 0.9); } else g.sfx.play('splashFar'); s.ball.removeFromParent(); F.shells.splice(F.shells.indexOf(s), 1); }
    }
    // close-in guns: anything flying near her gets shot down
    F.ciwsT -= dt;
    if (this.airborne() && dist < 600 && F.ciwsT <= 0) {
      F.ciwsT = 0.12; sees = true;
      const from = F.mesh.localToWorld(F.ciwsAt.clone()), aim = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
      g.police.tracer(from, aim); if (Math.random() < 0.3) g.sfx.play('ciws', 0.6);
      this.hitPlayer(Math.random() < 0.25, 6, 5);
    }
    // marines: a landing craft runs in to the nearest beach and drops four of them
    this.craftT -= dt;
    if (this.craftT <= 0 && !this.crafts.length && !g.boats?.active && !this.airborne() && dist < 700) {
      this.craftT = 45;
      const land = nearestLandPoint(target.x, target.z);
      if (land && Math.hypot(land.x - target.x, land.z - target.z) < 140) {
        const mesh = landingCraftMesh(), start = F.pos.clone();
        mesh.position.copy(start); g.scene.add(mesh);
        this.crafts.push({ mesh, pos: start, goal: new THREE.Vector3(land.x, 0, land.z), state: 'in', t: 0 });
        g.hud.toast('Marines inbound by landing craft', 0xff6a5a);
      }
    }
    for (const c of [...this.crafts]) {
      c.t += dt;
      const to = c.goal.clone().sub(c.pos).setY(0), d = to.length();
      if (c.state === 'in') {
        if (d < 6 || onLand(c.pos.x + to.x / d * 6, c.pos.z + to.z / d * 6) || c.t > 60) {
          c.state = 'out';
          const drop = new THREE.Vector3(c.goal.x, 0, c.goal.z);
          for (let i = 0; i < 4; i++) this.spawnSoldier(target, true, drop);
          g.sfx.play('switch');
        } else c.pos.addScaledVector(to.normalize(), dt * 14);
        c.mesh.rotation.y = Math.atan2(-to.x, -to.z);
      } else { c.pos.addScaledVector(to.normalize(), -dt * 14); if (c.t > 90) { c.mesh.removeFromParent(); this.crafts.splice(this.crafts.indexOf(c), 1); continue; } }
      c.mesh.position.set(c.pos.x, Math.sin(g.time * 2) * 0.15, c.pos.z);
    }
    return sees;
  }

  // ---- NAS Halyard is off limits: a warning, five seconds, then the lot
  updateNas(dt, pos) {
    const g = this.game, P = this.police;
    const inside = islandAt(pos.x, pos.z, 0)?.id === 'naval' && (g.onShore || g.flying) && pos.y < LAND_Y + 150 && !g.health.dead && P.enabled && !g.story?.active?.nasClearance;
    if (!inside) { if (this.nas && P.wanted < LOCKDOWN) { g.hud.toast('You turned back. Smart.', 0x7be08a); } this.nas = null; return; }
    if (P.wanted >= LOCKDOWN) { this.nas = null; return; }
    if (!this.nas) { this.nas = { t: 5 }; g.hud.flashBanner?.('RESTRICTED AREA', '#ff3a2a'); g.sfx.play('alarm'); g.hud.toast('NAS HALYARD: RESTRICTED MILITARY AREA. Leave immediately: 5', 0xff3a2a); return; }
    const before = Math.ceil(this.nas.t);
    this.nas.t -= dt;
    const now = Math.ceil(this.nas.t);
    if (now !== before && now > 0) { g.hud.toast(`Leave the base now: ${now}`, 0xff3a2a); g.sfx.play('alarm'); }
    if (this.nas.t <= 0) {
      this.nas = null;
      P.heat = Math.max(P.heat, HEAT[LOCKDOWN]); P.setWantedFromHeat(); P.lastSeen = g.time * 1000; P.seenIsland = 'naval';
      g.sfx.play('star');
      g.news?.add('BREAKING: an intruder at NAS Halyard. The base is on lockdown and the military is responding in force.', 'crime');
      for (let i = 0; i < 6; i++) this.spawnSoldier(pos);
    }
  }

  // tier announcements as the level climbs
  announce(w) {
    const g = this.game, tier = w >= LOCKDOWN ? 5 : w >= NAVY ? 4 : w >= STRIKE ? 3 : w >= GUNSHIP ? 2 : w >= ARMY ? 1 : 0;
    if (tier > this.lastTier) {
      const [banner, news] = [null,
        ['ARMY CHECKPOINTS', 'The army has taken over the search, with checkpoints on the main roads.'],
        ['ATTACK HELICOPTERS', 'Army attack helicopters are now in the air over the city.'],
        ['AIR STRIKES', 'The Air Force has been cleared to strike. Residents told to take shelter.'],
        ['THE NAVY', 'A Navy frigate and marines have joined the operation.'],
        ['☠ FULL LOCKDOWN', 'FULL LOCKDOWN: every branch of the military is hunting one person.']][tier];
      g.hud.flashBanner?.(banner, '#ff2a1a'); g.news?.add(news, 'crime');
      if (tier === 5 && !this.police.esc.bounty) this.police.esc.startBounty();
    }
    this.lastTier = tier;
  }

  update(dt, onFoot, island) {
    const g = this.game, P = this.police, w = P.wanted;
    const target = this.worldPos();
    this.updateNas(dt, target);
    this.updateRockets(dt);
    this.updateStrike(dt);
    this.announce(w);
    let seen = false;
    if (this.updateNavy(dt, target, w)) seen = true;
    if (w < ARMY) { this.jetHits = 0; return seen; }
    // soldiers on foot, anywhere on land
    this.soldierT -= dt;
    if (this.soldierT <= 0 && onFoot && !this.hidden()) {
      this.soldierT = 2;
      const n = g.citizens.list.filter((c) => c.soldier && c.dispatched && !c.leaving).length;
      if (n < SOLDIERS(w)) this.spawnSoldier(target);
    }
    // Humvees on the streets
    this.humveeT -= dt;
    if (island && this.humveeT <= 0) {
      this.humveeT = 9;
      if (P.cars.filter((c) => c.army && !c.leaving && !c.wreck && !c.blockade).length < HUMVEES(w) && this.spawnHumvee(target, island)) g.hud.toast('Army Humvee inbound', 0xff6a5a);
    }
    // the Humvees' roof gunners
    for (const c of P.cars) {
      if (!c.army || c.wreck || c.leaving) continue;
      c.gunT -= dt;
      const d = c.pos.distanceTo(target);
      if (c.gunT > 0 || d > 70 || this.hidden()) continue;
      const from = c.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), aim = target.clone().add(new THREE.Vector3(0, 0.4, 0));
      if (!P.mil.clearLine(from, aim)) { c.gunT = 0.5; continue; }
      c.gunT = 0.3 + Math.random() * 0.2; seen = true;
      const hit = Math.random() < 0.28;
      if (!hit) aim.add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
      P.tracer(from, aim); g.sfx.play('rifle', 0.5); this.hitPlayer(hit, 8, 6);
    }
    // air strikes
    this.strikeT -= dt;
    if (w >= STRIKE && !this.strike && this.strikeT <= 0 && !this.hidden() && !g.boats?.active) {
      this.strikeT = w >= LOCKDOWN ? 14 : w >= NAVY ? 20 : 28;
      if (!g.flying) this.callStrike(target);
    }
    return seen;
  }

  clearLine(a, b) {
    const sb = this.game.portSandbox, dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
    return !sb.world.castRay(new RAPIER.Ray({ x: a.x, y: a.y, z: a.z }, { x: dx / d, y: dy / d, z: dz / d }), d - 1.5, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
  }

  // everything stands down (dead, busted, lost them)
  reset() {
    for (const r of this.rockets) r.m.removeFromParent(); this.rockets = [];
    if (this.strike) { this.strike.flare.removeFromParent(); this.strike.jet?.removeFromParent(); this.strike = null; }
    if (this.frigate) { this.frigate.mesh.removeFromParent(); for (const s of this.frigate.shells) s.ball.removeFromParent(); this.frigate = null; }
    for (const c of this.crafts) c.mesh.removeFromParent(); this.crafts = [];
    this.lastTier = 0; this.jetHits = 0; this.strikeT = 10;
  }
}
