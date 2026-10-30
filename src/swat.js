import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Heli } from './cargo.js';
import { Car, clearSpot } from './carphys.js';
import { islandAt, LAND_Y } from './world.js';
import { modelMesh } from './dealership.js';
import { std, canvasTex } from './buildkit.js';
import { DIMS } from './figure.js';
import { rifleModel, smgModel } from './gunmodels.js';

// The heavy end of a police chase. The wanted level goes up to 50 stars (past 30 it's the
// military: see military.js):
//   6+  police helicopters circle overhead with a searchlight and a marksman
//   10+ SWAT vans full of tactical officers with rifles
//   20+ riot SWAT: armoured trucks and officers in full armour behind riot shields
//   25+ more of everything
//   30  the army: tanks roll in and shell you
// Plus roadblocks (with spike strips) ahead of you when you're driving, and bounty hunters who
// come for you after a big chase, even once the police have given up.

export const MAX_STARS = 50;
export const HEAT = [0, 1, 2, 4, 7, 11, 15, 19, 24, 29, 35, 41, 48, 55, 63, 71, 80, 89, 99, 110, 120, 132, 144, 157, 170, 184, 198, 213, 228, 244, 260,
  277, 294, 312, 330, 349, 368, 388, 408, 429, 450, 472, 494, 517, 540, 564, 588, 613, 638, 664, 690];
export const FOOT = [0, 2, 4, 6, 8, 10, 10, 11, 11, 12, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14, 14, 15, 15, 15, 16, 16, 16, 16, 16, 14,
  10, 10, 10, 10, 10, 9, 9, 9, 9, 9, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]; // (past 30, soldiers make up the rest)
export const CARS = [0, 1, 2, 3, 4, 4, 4, 5, 5, 5, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 5,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
export const HELIS = (w) => (w >= 50 ? 5 : w >= 25 ? 4 : w >= 20 ? 3 : w >= 10 ? 2 : w >= 6 ? 1 : 0); // (police and army together)
export const GUNSHIPS = (w) => (w >= 50 ? 4 : w >= 46 ? 3 : w >= 36 ? 2 : 0);
export const VANS = (w) => (w >= 25 ? 4 : w >= 20 ? 3 : w >= 15 ? 2 : w >= 10 ? 1 : 0);
export const TANKS = (w) => (w >= 46 ? 4 : w >= 30 ? 3 : 0);

export const SWAT_LOOK = { shirt: 0x1b1d22, pants: 0x1b1d22, skin: 0xa8724f, hat: 'helmet', hatColor: 0x111214 };
export const ADV_LOOK = { shirt: 0x262b33, pants: 0x262b33, skin: 0x7a4f35, hat: 'helmet', hatColor: 0x3e4652 };

// marks a citizen as SWAT (tier 1) or advanced SWAT (tier 2): kit, armour, a gun and a look.
//   tier 1: tactical SWAT: helmet with goggles, balaclava, a plate carrier with pouches, gloves,
//           knee pads and an assault rifle held at the low ready
//   tier 2: riot SWAT: full armour (chest plate, shoulder, arm and shin guards), a helmet with a
//           face shield, a riot shield on the left arm (it stops rounds from the front) and an SMG
export function makeSwat(npc, tier) {
  npc.swat = tier;
  npc.hp = tier === 2 ? 420 : 260;
  npc.cash = tier === 2 ? 150 : 60;
  const P = npc.fig.parts, head = P.head, torso = P.torso;
  const add = (parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const black = M.black(), armour = tier === 2 ? M.armour() : M.carrier();
  // the head: a balaclava, the helmet's goggles (or a full face shield)
  add(head, new THREE.SphereGeometry(0.153, 14, 10), black, 0, 0, 0);
  if (tier === 1) {
    add(head, B(0.26, 0.035, 0.03), M.strap(), 0, 0.075, 0.135);
    for (const x of [-0.05, 0.05]) add(head, new THREE.CylinderGeometry(0.032, 0.032, 0.03, 12), M.lens(), x, 0.075, 0.15, Math.PI / 2);
    for (const x of [-1, 1]) add(head, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), black, x * 0.15, 0.0, 0, 0, 0, Math.PI / 2); // ear defenders
  } else {
    add(head, new THREE.SphereGeometry(0.19, 16, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.18, Math.PI * 0.5), M.faceShield(), 0, 0.02, 0.0);
    add(head, B(0.32, 0.03, 0.05), M.armour(), 0, 0.16, 0.06); // visor hinge
  }
  // the body armour
  const [tw, th, td] = DIMS.torso.size;
  add(torso, B(tw + 0.06, th * 0.8, td + 0.08), armour, 0, 0.04, 0);
  add(torso, new THREE.PlaneGeometry(0.3, 0.08), M.tag(tier, 'front'), 0, 0.17, td / 2 + 0.041);
  add(torso, new THREE.PlaneGeometry(0.36, 0.11), M.tag(tier, 'back'), 0, 0.08, -td / 2 - 0.041, 0, Math.PI, 0);
  if (tier === 1) for (const x of [-0.14, -0.045, 0.045, 0.14]) add(torso, B(0.075, 0.09, 0.05), M.pouch(), x, -0.12, td / 2 + 0.06); // mag pouches
  else {
    for (const sd of [-1, 1]) add(torso, new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), armour, sd * 0.27, 0.27, 0, 0, 0, sd * 0.4); // shoulder guards
    add(torso, B(tw + 0.1, 0.12, td + 0.1), armour, 0, -th / 2 + 0.02, 0); // groin / belt plate
  }
  // gloves, knee (and shin, and forearm) pads
  for (const arm of [P.armL, P.armR]) { for (const c of arm.children) c.material = black; if (tier === 2) add(arm, B(0.15, 0.24, 0.17), armour, 0, -0.14, 0); }
  for (const leg of [P.legL, P.legR]) { add(leg, B(0.19, 0.12, 0.08), tier === 2 ? armour : black, 0, 0.0, 0.1); if (tier === 2) add(leg, B(0.19, 0.26, 0.06), armour, 0, -0.22, 0.1); add(leg, B(0.18, 0.09, 0.26), black, 0, -0.37, 0.04); /* boots */ }
  // the gun, held across the chest, and on the riot squad the shield
  const gun = (tier === 1 ? rifleModel() : smgModel()).mesh;
  gun.scale.setScalar(tier === 1 ? 1 : 1.1);
  gun.position.set(0.06, -0.06, td / 2 + 0.16); gun.rotation.set(0.35, Math.PI + 0.35, 0.25);
  gun.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  torso.add(gun);
  if (tier === 2) {
    const sh = new THREE.Group();
    sh.position.set(-0.27, -0.12, td / 2 + 0.24); sh.rotation.y = 0.18;
    add(sh, B(0.58, 1.05, 0.025), M.shield(), 0, 0, 0);
    add(sh, new THREE.PlaneGeometry(0.46, 0.12), M.tag(2, 'shield'), 0, -0.18, 0.014);
    add(sh, B(0.6, 0.04, 0.04), black, 0, 0.53, 0); add(sh, B(0.6, 0.04, 0.04), black, 0, -0.53, 0);
    add(sh, B(0.04, 1.08, 0.04), black, 0.3, 0, 0); add(sh, B(0.04, 1.08, 0.04), black, -0.3, 0, 0);
    torso.add(sh);
    npc.shield = true;
  }
  return npc;
}
const mats = {};
const M = {
  black: () => (mats.black ||= std({ color: 0x0d0e10, roughness: 0.8 })),
  carrier: () => (mats.carrier ||= std({ color: 0x1f2226, roughness: 0.85 })),
  pouch: () => (mats.pouch ||= std({ color: 0x2a2e33, roughness: 0.9 })),
  strap: () => (mats.strap ||= std({ color: 0x5a5040, roughness: 0.9 })),
  lens: () => (mats.lens ||= std({ color: 0x1a2a3a, roughness: 0.1, metalness: 0.6, emissive: 0x0a1420 })),
  armour: () => (mats.armour ||= std({ color: 0x3e4652, roughness: 0.45, metalness: 0.35 })),
  faceShield: () => (mats.face ||= new THREE.MeshStandardMaterial({ color: 0xa8c8e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })),
  shield: () => (mats.shield ||= new THREE.MeshStandardMaterial({ color: 0x9fb8cc, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false })),
  tag: (tier, where) => (mats[`tag${tier}${where}`] ||= new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(192, 48, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const text = where === 'shield' ? 'POLICE' : where === 'front' ? 'POLICE' : tier === 2 ? 'RIOT SWAT' : 'SWAT';
    c.fillStyle = where === 'shield' ? '#f2f2ee' : '#f2f2ee'; c.font = `bold ${where === 'front' ? 34 : 38}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2);
  }) })),
};
function swatTag(tier) {
  return (mats[`van${tier}`] ||= canvasTex(128, 40, (c, w) => { c.fillStyle = '#f2f2ee'; c.font = 'bold 30px Arial'; c.textAlign = 'center'; c.fillText(tier === 2 ? 'RIOT' : 'SWAT', w / 2, 31); }));
}

// ---------------------------------------------------------------- the army (30 stars)
// An olive-drab main battle tank: hull, tracks and road wheels, and a turret (that turns on its
// own) with a long gun. The hull's front is -Z, like every car.
let camo = null;
export function tankMesh() {
  camo ||= canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#4b5232'; c.fillRect(0, 0, w, h);
    const blob = (col, n) => { for (let i = 0; i < n; i++) { c.fillStyle = col; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 16, 5 + Math.random() * 10, Math.random() * 3, 0, 7); c.fill(); } };
    blob('#3a3f26', 14); blob('#5e5a3c', 10); blob('#2a2c1e', 6);
    for (let i = 0; i < 800; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.04)'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, [2, 2]);
  const olive = std({ map: camo, roughness: 0.85, metalness: 0.15 });
  const dark = std({ color: 0x23251c, roughness: 0.9 }), steel = std({ color: 0x3a3c36, roughness: 0.6, metalness: 0.5 });
  const tread = std({ map: canvasTex(32, 128, (c, w, h) => { c.fillStyle = '#1c1d18'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { c.fillStyle = '#34352d'; c.fillRect(0, y, w, 4); } }, [1, 8]), roughness: 0.95 });
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, m, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  box(3.0, 0.75, 6.2, 0, 1.05, 0, olive); // hull
  box(3.0, 0.6, 1.3, 0, 1.15, -3.2, olive, -0.55); // sloped glacis
  box(3.0, 0.5, 0.6, 0, 1.0, 3.25, olive); // rear
  for (const s of [-1, 1]) {
    box(0.75, 0.85, 6.9, s * 1.82, 0.5, 0, tread); // track
    box(0.9, 0.08, 6.6, s * 1.82, 1.0, 0, olive); // track guard
    box(0.06, 0.55, 6.0, s * 2.21, 0.72, 0, olive); // side skirt
    for (let k = 0; k < 7; k++) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 14), steel); wh.rotation.z = Math.PI / 2; wh.position.set(s * 2.0, 0.38, -2.7 + k * 0.9); g.add(wh); }
  }
  for (const s of [-1, 1]) box(0.3, 0.12, 0.12, s * 1.1, 1.2, -3.85, std({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 0.6 })); // headlights
  // the turret
  const turret = new THREE.Group(); turret.position.set(0, 1.42, 0.35); g.add(turret);
  const tb = (w, h, d, x, y, z, m, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; turret.add(o); return o; };
  tb(2.5, 0.7, 2.9, 0, 0.35, 0.2, olive);
  for (const s of [-1, 1]) tb(0.9, 0.7, 1.2, s * 0.95, 0.35, -1.25, olive, s * 0.45); // angled cheeks
  tb(1.6, 0.4, 0.9, 0, 0.4, 1.9, olive); // bustle
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.3, 14), olive); cup.position.set(0.55, 0.85, 0.5); turret.add(cup);
  const mg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), dark); mg.rotation.x = Math.PI / 2; mg.position.set(0.55, 1.05, 0.1); turret.add(mg);
  const barrel = new THREE.Group(); barrel.position.set(0, 0.38, -1.5); turret.add(barrel);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.2, 14), steel); gun.rotation.x = Math.PI / 2; gun.position.z = -2.1; barrel.add(gun);
  const evac = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.55, 14), olive); evac.rotation.x = Math.PI / 2; evac.position.z = -2.4; barrel.add(evac);
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.4), olive); barrel.add(mantlet);
  // a white star on each side, and ARMY
  const star = canvasTex(128, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#e8e4d4'; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } c.fill(); c.font = 'bold 26px Arial'; c.fillText('ARMY', 62, 42); });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: star, transparent: true })); p.position.set(s * 1.26, 0.38, 0.4); p.rotation.y = s * Math.PI / 2; turret.add(p); }
  g.userData.spec = 'tank';
  return { mesh: g, turret, barrel };
}

// ---------------------------------------------------------------- police helicopter
export class PoliceHeli {
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
      this.game.hud.toast(`${this.label || 'Police chopper'} down!`, 0xffd166);
      this.game.news?.add(`${this.gunship ? 'An army attack helicopter' : 'A police helicopter'} has been shot down over ${this.game.news.place(this.pos)}. Unbelievable scenes.`, 'crime');
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

// a straight line from a gun's muzzle to you, past the buildings and the ground
function clearShot(g, a, b) {
  const sb = g.portSandbox;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
  const hit = sb.world.castRay(new RAPIER.Ray({ x: a.x, y: a.y, z: a.z }, { x: dx / d, y: dy / d, z: dz / d }), d - 2, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
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

  // ---------------------------------------------------------------- tanks
  spawnTank(target, island) {
    const P = this.police, R = P.roads(island);
    if (!R) return null;
    const nodes = [];
    for (let i = 0; i < R.xs.length; i++) for (let j = 0; j < R.zs.length; j++) {
      const d = Math.hypot(R.xs[i] - target.x, R.zs[j] - target.z);
      if (d > 110 && d < 320) nodes.push({ i, j });
    }
    nodes.sort(() => Math.random() - 0.5);
    const half = { x: 1.9, y: 0.75, z: 3.5 };
    const n = nodes.find((m) => clearSpot(this.game, R.xs[m.i], R.zs[m.j], 0, half));
    if (!n) return null;
    const { mesh, turret, barrel } = tankMesh();
    const toward = Math.atan2(-(target.x - R.xs[n.i]), -(target.z - R.zs[n.j]));
    const car = new Car(this.game, { police: true, mesh, half, x: R.xs[n.i], z: R.zs[n.j], heading: Math.round(toward / (Math.PI / 2)) * (Math.PI / 2), hp: 1200, density: 700, wheelbase: 4.4, ride: 0.25, maxSpeed: 13 });
    Object.assign(car, { R, island, at: { i: n.i, j: n.j }, from: null, to: null, deployed: 1, ramT: 0, leaving: false, life: 0, stuckT: 0, reverseT: 0, tank: true, bulletproof: true, turret, barrel, fireT: 3 + Math.random() * 3, recoil: 0 });
    car.type = { name: 'Tank', hp: 1200, car: true };
    P.cars.push(car);
    return car;
  }

  // The turret swings round onto you; when it's on you and has a clear shot, it fires.
  updateTank(t, dt, target) {
    const g = this.game;
    if (t.wreck) return;
    const dx = target.x - t.pos.x, dz = target.z - t.pos.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz) - t.heading;
    let cur = t.turret.rotation.y, d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    cur += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9);
    t.turret.rotation.y = cur;
    t.recoil = Math.max(0, t.recoil - dt * 2);
    t.barrel.position.z = -1.5 + t.recoil * 0.6;
    t.barrel.rotation.x = Math.min(0.25, Math.max(-0.05, Math.atan2(target.y - (t.pos.y + 1.8), Math.max(dist, 1)))) ;
    t.fireT -= dt;
    if (t.leaving || t.fireT > 0 || Math.abs(d) > 0.06 || dist < 14 || dist > 230) return;
    const muzzle = t.barrel.localToWorld(new THREE.Vector3(0, 0, -4.3));
    if (!clearShot(g, muzzle, new THREE.Vector3(target.x, target.y + 0.3, target.z))) { t.fireT = 0.6; return; }
    t.fireT = 5 + Math.random() * 2.5;
    t.recoil = 1;
    // lead the shot a little, and it's not dead accurate
    const pv = g.vehicles.active ? g.vehicles.active.vel : g.shorePlayer.vel;
    const T = dist / 95;
    const aim = new THREE.Vector3(target.x + (pv?.x || 0) * T * 0.7 + (Math.random() - 0.5) * 5, target.y + 0.3, target.z + (pv?.z || 0) * T * 0.7 + (Math.random() - 0.5) * 5);
    const vel = aim.clone().sub(muzzle).normalize().multiplyScalar(95);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd080 }));
    ball.position.copy(muzzle); g.scene.add(ball);
    (this.shells ||= []).push({ ball, pos: muzzle.clone(), vel, life: 0 });
    g.fx.flash(muzzle, 0xffb040, 3, 0.12);
    for (let i = 0; i < 10; i++) g.fx.emit(muzzle.clone(), vel.clone().multiplyScalar(0.03).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), 0x8a8a80, 1.6, -0.1, 0.4);
    const near = muzzle.distanceTo(g.camera.position);
    g.sfx.play('cannon', Math.max(0.25, 1 - near / 300));
    if (near < 120) g.shake = Math.max(g.shake, 0.4);
  }

  // You've stolen one: the turret follows where you're looking, and LMB fires.
  playerTank(dt) {
    const g = this.game, t = g.vehicles.active;
    if (!t?.tank || t.wreck) return;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const want = Math.atan2(-f.x, -f.z) - t.heading;
    let cur = t.turret.rotation.y, d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    t.turret.rotation.y = cur + Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
    t.recoil = Math.max(0, (t.recoil || 0) - dt * 2);
    t.barrel.position.z = -1.5 + t.recoil * 0.6;
    t.fireT = (t.fireT || 0) - dt;
  }

  playerTankFire() {
    const g = this.game, t = g.vehicles.active;
    if (!t?.tank || t.wreck || t.fireT > 0) return;
    t.fireT = 2.2; t.recoil = 1;
    const muzzle = t.barrel.localToWorld(new THREE.Vector3(0, 0, -4.3));
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(t.turret.getWorldQuaternion(new THREE.Quaternion()));
    f.y = Math.max(-0.1, Math.min(0.25, new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).y + 0.04));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd080 }));
    ball.position.copy(muzzle); g.scene.add(ball);
    (this.shells ||= []).push({ ball, pos: muzzle.clone(), vel: f.normalize().multiplyScalar(95), life: 0, mine: true });
    g.fx.flash(muzzle, 0xffb040, 3, 0.12);
    g.sfx.play('cannon'); g.shake = Math.max(g.shake, 0.6);
  }

  updateShells(dt) {
    const g = this.game, sb = g.portSandbox;
    for (const s of [...(this.shells || [])]) {
      s.life += dt;
      s.vel.y -= 3 * dt;
      const step = s.vel.clone().multiplyScalar(dt), len = step.length();
      const hit = sb.raycast(s.pos, step.clone().normalize(), len);
      const pt = g.shorePlayer.body.translation();
      const nearYou = !s.mine && s.pos.distanceTo(new THREE.Vector3(pt.x, pt.y, pt.z)) < 2.2;
      let boom = null;
      if (hit && !hit.prop?.ragdoll) boom = hit.point;
      else if (nearYou) boom = s.pos.clone();
      else if (s.pos.y < LAND_Y - 1 || s.life > 4) boom = s.pos.clone();
      if (!boom) {
        // smacking into a car on the way
        const car = g.vehicles.all.find((c) => (s.mine ? c !== g.vehicles.active : !c.tank) && !c.wreck && c.pos.distanceTo(s.pos) < (c.tank ? 3.6 : 2.6));
        if (car) boom = s.pos.clone();
      }
      if (boom) {
        g.blast(boom, 7.5, 80, !!s.mine); // (yours is a crime)
        g.shake = Math.max(g.shake, 0.9);
        s.ball.removeFromParent();
        this.shells.splice(this.shells.indexOf(s), 1);
        continue;
      }
      s.pos.add(step);
      s.ball.position.copy(s.pos);
      if (Math.random() < 0.6) g.fx.emit(s.pos.clone(), new THREE.Vector3(0, 0.3, 0), 0x9a968a, 0.9, -0.05, 0.5);
    }
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
      const army = this.police.wanted > 30;
      const c = army ? this.police.mil.humvee({ x: p.x, z: p.z, heading }) : new Car(g, { police: true, x: p.x, z: p.z, heading });
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
      const army = this.police.wanted > 30;
      const n = g.citizens.spawnCitizen(isl, 'cop', p, army ? { look: { shirt: 0x5a6340, pants: 0x4a5034, skin: 0xa8724f, hat: 'helmet', hatColor: 0x4b5232 } } : {});
      if (!n) continue;
      if (army) this.police.mil.soldier(n);
      else if (this.police.wanted >= 10) makeSwat(n, this.police.wanted >= 20 ? 2 : 1);
      Object.assign(n, { dispatched: true, state: 'chase', lastSeen: v.pos.clone() });
      cops.push(n);
    }
    this.blocks.push({ cars, spike, cops, t: 0, pos: spot.pos.clone() });
    g.hud.toast(this.police.wanted > 30 ? 'Army checkpoint ahead!' : 'Roadblock ahead!', 0xff6a5a);
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
      if (this.chaseT > 14) { this.chaseT = 0; P.heat += w >= 30 ? 8 : w >= 20 ? 4 : 2; const before = P.wanted; P.setWantedFromHeat(); if (P.wanted > before) { g.sfx.play('star'); g.hud.toast(`They're throwing everything at you: ${P.wanted} stars`, 0xff6a5a); } }
    }
    // helicopters
    const wantH = HELIS(w);
    const live = this.helis.filter((h) => !h.leaving && !h.falling);
    this.heliT -= dt;
    const wantG = GUNSHIPS(w), liveG = live.filter((h) => h.gunship).length;
    if (w > 0 && (live.length < wantH || liveG < wantG) && this.heliT <= 0) {
      this.heliT = wantG ? 6 : 8;
      const a = Math.random() * Math.PI * 2, at = new THREE.Vector3(target.x + Math.cos(a) * 220, LAND_Y + 70, target.z + Math.sin(a) * 220);
      if (liveG < wantG) { this.helis.push(P.mil.makeGunship(at)); g.hud.toast('Army attack helicopter inbound!', 0xff3a2a); }
      else { this.helis.push(new PoliceHeli(g, at)); g.hud.toast('Police chopper inbound', 0xff6a5a); }
    }
    if (live.length > Math.max(wantH, wantG)) for (const h of live.filter((x) => !x.gunship).slice(Math.max(0, wantH - wantG))) h.leaving = true;
    if (liveG > wantG) for (const h of live.filter((x) => x.gunship).slice(wantG)) h.leaving = true;
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
    // the army
    const tanks = P.cars.filter((c) => c.tank && !c.wreck);
    this.tankT = (this.tankT ?? 0) - dt;
    if (island && tanks.filter((c) => !c.leaving).length < TANKS(w) && this.tankT <= 0) {
      this.tankT = 14;
      if (this.spawnTank(target, island)) {
        g.hud.toast('TANKS are rolling in!', 0xff3a2a);
        if (!this.tankBanner) { this.tankBanner = true; g.hud.flashBanner?.('THE ARMY IS HERE', '#ff3a2a'); }
      }
    }
    if (w < 30) this.tankBanner = false;
    for (const t of tanks) if (t !== g.vehicles.active) this.updateTank(t, dt, target);
    this.updateShells(dt);
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
    if (P.mil.update(dt, onFoot, island)) seen = true;
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
    this.police?.mil?.reset();
  }
}
