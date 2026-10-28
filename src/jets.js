import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { landHeight, LAND_Y, RUNWAY } from './port.js';
import { GLOW } from './effects.js';

// Fighter jets: a procedural twin-tail navy fighter and an arcade-but-physical flight model
// (thrust, drag, lift from angle of attack, stalls), with taxiing, take-off, landing and a cannon.

const G = 9.81;
const GEAR_H = 1.95; // jet origin above the ground with the gear down
const KL = 0.0029; // lift per (CL * v^2)
const CD0 = 0.00031, CDI = 0.0005, CDGEAR = 0.00018;
const THRUST = 17; // m/s^2 at full military power
const AB_THRUST = 27; // with afterburner

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Flat planform (in the XZ plane, thickness along Y) from [x, z] points.
function planform(pts, thick) {
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape Y -> world Z, extrusion -> -Y
  g.translate(0, thick / 2, 0);
  return g;
}

export function buildJet(number) {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x8e979e, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5f666c, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.4, metalness: 0.8 });

  // fuselage (lathe, nose at -Z)
  const prof = [[0, -8.6], [0.25, -8.0], [0.55, -6.8], [0.82, -5.0], [0.95, -3.2], [1.02, -1], [1.02, 3.5], [0.9, 6.2], [0.78, 7.6], [0.7, 7.9]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const fg = new THREE.LatheGeometry(prof, 18);
  fg.rotateX(Math.PI / 2);
  const fus = new THREE.Mesh(fg, paint);
  fus.scale.set(1.15, 0.8, 1);
  root.add(fus);
  const radome = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.6, 16), dark);
  radome.rotation.x = -Math.PI / 2;
  radome.position.z = -8.1;
  root.add(radome);
  // canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2c4a5e, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.7 }));
  canopy.scale.set(0.55, 0.62, 2.0);
  canopy.position.set(0, 0.45, -4.3);
  root.add(canopy);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.6 }));
  pilot.position.set(0, 0.75, -4.4);
  pilot.visible = false;
  root.add(pilot);
  // intakes
  for (const s of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 3.6), paint);
    intake.position.set(s * 1.2, -0.25, -1.0);
    root.add(intake);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.05), metal);
    mouth.position.set(s * 1.2, -0.25, -2.83);
    root.add(mouth);
  }
  // wings, LEX, stabs
  const wingPts = [[0.9, -1.6], [6.1, 2.4], [6.1, 3.4], [0.9, 3.6]];
  const lexPts = [[0.8, -5.2], [0.9, -1.6], [1.6, -0.6], [1.5, -1.6]];
  const stabPts = [[0.7, 5.1], [3.5, 7.0], [3.5, 7.8], [0.7, 7.9]];
  for (const s of [-1, 1]) {
    const mirror = (pts) => pts.map(([x, z]) => [x * s, z]);
    const w = new THREE.Mesh(planform(mirror(wingPts), 0.16), paint);
    w.position.y = -0.1;
    root.add(w);
    const lex = new THREE.Mesh(planform(mirror(lexPts), 0.1), paint);
    lex.position.y = 0.05;
    root.add(lex);
    const st = new THREE.Mesh(planform(mirror(stabPts), 0.12), paint);
    st.position.y = -0.05;
    root.add(st);
    // missile rails on the wingtips
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8), dark);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(s * 6.15, -0.05, 2.6);
    root.add(rail);
    // nozzles + afterburner flames
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.9, 16, 1, true), metal);
    noz.rotation.x = Math.PI / 2;
    noz.position.set(s * 0.52, -0.05, 8.2);
    root.add(noz);
  }
  // twin fins, canted outboard
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(planform([[0, 4.0], [2.9, 6.6], [2.9, 7.5], [0, 7.6]], 0.12), paint);
    const holder = new THREE.Group();
    fin.rotation.z = Math.PI / 2; // planform X becomes height (Y)
    holder.add(fin);
    holder.rotation.z = -s * 0.35;
    holder.position.set(s * 0.95, 0.5, 0);
    root.add(holder);
  }

  const flames = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.38, 3, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffa34a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    f.rotation.x = Math.PI / 2; // tip trails behind the nozzle
    f.position.set(s * 0.52, -0.05, 10);
    f.visible = false;
    root.add(f);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(s * 0.52, -0.05, 8.7);
    glow.scale.setScalar(1.2);
    glow.visible = false;
    root.add(glow);
    flames.push({ f, glow });
  }

  // markings
  const roundel = canvasTex(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = '#1f3b63'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, 7); g.fill();
    g.fillStyle = '#f2f2ee';
    g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 18 : 46, a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); }
    g.fill();
  });
  const rm = new THREE.MeshBasicMaterial({ map: roundel, transparent: true, depthWrite: false });
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), rm);
    r.rotation.x = -Math.PI / 2;
    r.position.set(s * 4.2, 0.0, 2.4);
    root.add(r);
  }
  const numTex = canvasTex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#2b3036';
    g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(number, w / 2, h / 2);
  });
  for (const s of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: numTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    n.position.set(s * 1.18, 0.0, -5.6);
    n.rotation.y = s * Math.PI / 2;
    root.add(n);
  }

  // landing gear
  const gear = new THREE.Group();
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.9 });
  const strutM = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.6, roughness: 0.3 });
  for (const [x, z, r] of [[0, -5.6, 0.26], [-1.45, 1.4, 0.36], [1.45, 1.4, 0.36]]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), strutM);
    strut.position.set(x, -0.9, z);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 14), tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -GEAR_H + r, z);
    gear.add(strut, wheel);
  }
  root.add(gear);

  // nav lights
  const navs = [];
  for (const [x, y, z, c] of [[-6.15, 0, 1.2, 0xff2a2a], [6.15, 0, 1.2, 0x2aff5a], [0, 0.3, 8.2, 0xffffff]]) {
    const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    l.position.set(x, y, z);
    l.scale.setScalar(0.6);
    root.add(l);
    navs.push(l);
  }

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, gear, flames, pilot, navs };
}

// ---------------------------------------------------------------- one aircraft
// opts: { build: () => ({ root, gear, flames, pilot, navs }) another model, half / wing: collider
// half-sizes, agility (how quick it rolls and pulls), thrust (×), noRespawn, name }
export class Jet {
  constructor(game, home, number, opts = {}) {
    this.game = game;
    this.home = home;
    const b = opts.build ? opts.build() : buildJet(number);
    this.number = number;
    this.agility = opts.agility ?? 1;
    this.thrustMul = opts.thrust ?? 1;
    this.noRespawn = !!opts.noRespawn;
    this.name = opts.name || 'jet';
    Object.assign(this, { mesh: b.root, gear: b.gear, flames: b.flames, pilot: b.pilot, navs: b.navs });
    game.scene.add(this.mesh);
    // a moving obstacle in the shore physics world so you can't walk through parked jets
    const w = game.portWorld;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const H = opts.half || [1.7, 1.3, 8.2, 0, -0.5, 0], Wg = opts.wing || [6.2, 0.2, 2.5, 0, -0.1, 1.2];
    this.collider = w.createCollider(RAPIER.ColliderDesc.cuboid(H[0], H[1], H[2]).setTranslation(H[3], H[4], H[5]), this.body);
    this.wingCol = w.createCollider(RAPIER.ColliderDesc.cuboid(Wg[0], Wg[1], Wg[2]).setTranslation(Wg[3], Wg[4], Wg[5]), this.body);
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(this.home.x, LAND_Y + GEAR_H, this.home.z);
    this.vel = new THREE.Vector3();
    this.yaw = this.home.yaw;
    this.pitchG = 0;
    this.quat = new THREE.Quaternion().setFromAxisAngle(AY, this.yaw);
    this.speed = 0; // ground speed while on the wheels
    this.throttle = 0;
    this.ab = false;
    this.gearDown = true;
    this.gearAnim = 1;
    this.onGround = true;
    this.crashed = false;
    this.respawnT = 0;
    this.stall = false;
    this.mesh.visible = true;
    this.collider.setEnabled(true);
    this.wingCol.setEnabled(true);
    this.syncMesh();
  }

  get fwd() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat); }
  get up() { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat); }
  get right() { return new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat); }
  get airspeed() { return this.onGround ? Math.abs(this.speed) : this.vel.length(); }
  get pitchAngle() { return Math.asin(THREE.MathUtils.clamp(this.fwd.y, -1, 1)); }
  get rollAngle() { const r = this.right, u = this.up; return Math.atan2(-r.y, u.y); }
  get heading() { const f = this.fwd; return Math.atan2(-f.x, -f.z); }

  syncMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    this.body.setNextKinematicTranslation(this.pos);
    this.body.setNextKinematicRotation(this.quat);
  }

  crash(where = 'ground') {
    if (this.crashed) return;
    this.crashed = true;
    this.respawnT = this.noRespawn ? Infinity : 15;
    this.autopilot = null;
    this.mesh.visible = false;
    this.collider.setEnabled(false);
    this.wingCol.setEnabled(false);
    const g = this.game;
    g.fx.explosion(this.pos.clone());
    if (where === 'sea') g.fx.splash(this.pos.clone(), true);
    g.sfx.play('explosion');
    g.jets.crashed(this);
  }

  // ctl: null when parked, else { throttle: -1|0|1, ab, steer: -1..1, brake, stick: {x, y} }
  update(dt, ctl) {
    if (this.crashed) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.reset();
      return;
    }
    const ocean = this.game.ocean;
    const flying = !!ctl;
    if (ctl) this.throttle = THREE.MathUtils.clamp(this.throttle + ctl.throttle * dt * 0.5, 0, 1);
    else if (!this.autopilot) this.throttle = Math.max(this.throttle - dt, 0);
    this.ab = (!!ctl?.ab || (!ctl && !!this.autopilot)) && this.throttle > 0.95; // (an autopilot run goes flat out)
    const thrust = (this.throttle * THRUST + (this.ab ? AB_THRUST - THRUST : 0)) * this.thrustMul;
    const gearDrag = this.gearDown ? CDGEAR : 0;

    if (this.onGround) {
      // ---- rolling on the wheels ----
      const steer = ctl ? ctl.steer : 0;
      const sp = this.speed;
      this.yaw += steer * 0.5 * Math.min(Math.abs(sp) / 5, 1) * THREE.MathUtils.clamp(1 - Math.abs(sp) / 110, 0.15, 1) * Math.sign(sp || 1) * dt;
      let acc = thrust - (CD0 + gearDrag) * sp * Math.abs(sp);
      const braking = !ctl || ctl.brake;
      const fric = (braking ? 9 : 0.35) * Math.sign(sp);
      if (Math.abs(sp) < Math.abs(fric) * dt && thrust < 0.5) { this.speed = 0; acc = 0; } else acc -= fric;
      this.speed += acc * dt;
      // rotate for take-off once fast enough
      const pull = ctl ? -ctl.stick.y : 0;
      if (this.speed > 58 && pull > 0.1) this.pitchG = Math.min(this.pitchG + pull * 0.5 * dt, 0.26);
      else this.pitchG = Math.max(this.pitchG - 0.35 * dt, 0);
      this.quat.setFromEuler(new THREE.Euler(this.pitchG, this.yaw, 0, 'YXZ'));
      const dir = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.pos.addScaledVector(dir, this.speed * dt);
      this.vel.copy(dir).multiplyScalar(this.speed);
      const ground = landHeight(this.pos.x, this.pos.z);
      if (ground === null) {
        // rolled off the edge of the land into the sea
        this.onGround = false;
      } else {
        this.pos.y = ground + GEAR_H;
        const cl = THREE.MathUtils.clamp((this.pitchG + 0.03) * 5, -1.2, 1.2);
        if (cl * this.speed * this.speed * KL > G * 1.02) {
          this.onGround = false;
          this.vel.copy(this.fwd).multiplyScalar(this.speed);
          this.vel.y = Math.max(this.vel.y, 1);
        }
      }
      this.stall = false;
    } else {
      // ---- flying ----
      const speed = this.vel.length();
      const authority = THREE.MathUtils.clamp((speed - 25) / 70, 0.12, 1);
      const stick = ctl ? ctl.stick : { x: 0, y: 0 };
      const pitchRate = -stick.y * 1.15 * authority * this.agility;
      const rollRate = -stick.x * 2.6 * authority * this.agility;
      const yawRate = (ctl ? ctl.steer : 0) * 0.35 * authority * this.agility;
      this.quat.multiply(_q.setFromAxisAngle(AX, pitchRate * dt));
      this.quat.multiply(_q.setFromAxisAngle(AZ, rollRate * dt));
      this.quat.multiply(_q.setFromAxisAngle(AY, yawRate * dt));
      // nobody at the controls but it's been pointed at something: it steers itself onto it
      const ap = this.autopilot?.pos;
      if (ap && !ctl) {
        const want = ap.clone().sub(this.pos).normalize();
        const turn = new THREE.Quaternion().setFromUnitVectors(this.fwd, want);
        this.quat.premultiply(new THREE.Quaternion().slerp(turn, Math.min(1, dt * 0.9)));
        this.throttle = 1;
      }
      this.quat.normalize();

      const fwd = this.fwd, up = this.up, right = this.right;
      const vhat = speed > 1 ? this.vel.clone().divideScalar(speed) : fwd.clone();
      const alpha = Math.atan2(-this.vel.dot(up), Math.max(this.vel.dot(fwd), 0.1));
      let cl = THREE.MathUtils.clamp(alpha * 5, -1.25, 1.25);
      this.stall = Math.abs(alpha) > 0.32 || speed < 52;
      if (Math.abs(alpha) > 0.32) cl *= Math.max(0.15, 1 - (Math.abs(alpha) - 0.32) * 3);
      const liftDir = up.clone().addScaledVector(vhat, -up.dot(vhat)).normalize();
      const acc = new THREE.Vector3();
      acc.addScaledVector(liftDir, cl * speed * speed * KL);
      acc.addScaledVector(vhat, -(CD0 + gearDrag + CDI * cl * cl) * speed * speed);
      acc.addScaledVector(fwd, thrust);
      acc.y -= G;
      this.vel.addScaledVector(acc, dt);
      // weathervane: bleed sideslip so the jet flies where it points
      this.vel.addScaledVector(right, -this.vel.dot(right) * Math.min(dt * 2.5, 1));
      // nose slowly follows the flight path when stalled
      if (this.stall && speed > 5) {
        const want = new THREE.Quaternion().setFromUnitVectors(fwd, vhat);
        this.quat.premultiply(new THREE.Quaternion().slerp(want, Math.min(dt * 0.8, 1)));
      }
      const prev = this.pos.clone();
      this.pos.addScaledVector(this.vel, dt);

      // hit a building or tree?
      const seg = this.pos.clone().sub(prev);
      const len = seg.length();
      if (len > 0.01 && this.pos.y < LAND_Y + 40) {
        const hit = this.game.portSandbox.raycast(prev, seg.divideScalar(len), len + 6, this.collider);
        if (hit && hit.point.y > LAND_Y + 0.4 && hit.collider.handle !== this.wingCol.handle) { this.crash(); return; }
      }
      // touchdown or crash
      const ground = landHeight(this.pos.x, this.pos.z);
      if (ground !== null && this.pos.y - GEAR_H <= ground) {
        const p = this.pitchAngle, r = this.rollAngle;
        const ok = this.gearDown && this.vel.y > -8 && Math.abs(r) < 0.4 && p > -0.12 && p < 0.45;
        if (!ok) { this.crash(); return; }
        this.onGround = true;
        this.yaw = this.heading;
        this.pitchG = Math.max(p, 0);
        this.speed = Math.hypot(this.vel.x, this.vel.z);
        this.pos.y = ground + GEAR_H;
        this.game.sfx.play('thud');
        if (flying) this.game.hud.toast(this.vel.y > -3 ? 'Nice landing!' : 'Hard landing', 0x7be08a);
      } else if (ground === null && this.pos.y < ocean.heightAt(this.pos.x, this.pos.z) + 1.0) {
        this.crash('sea');
        return;
      }
    }

    // visuals
    this.gearAnim += ((this.gearDown ? 1 : 0) - this.gearAnim) * Math.min(dt * 2.5, 1);
    this.gear.scale.y = Math.max(this.gearAnim, 0.01);
    this.gear.visible = this.gearAnim > 0.05;
    const burn = flying ? this.throttle : 0;
    for (const { f, glow } of this.flames) {
      f.visible = burn > 0.05;
      const len = this.ab ? 2.2 : 0.3 + burn * 0.9;
      f.scale.set(this.ab ? 1.1 : 0.8, len, this.ab ? 1.1 : 0.8);
      f.position.z = 8.7 + 1.5 * len;
      f.material.color.set(this.ab ? 0xff9a3a : 0x8fb4ff);
      f.material.opacity = (this.ab ? 0.85 : 0.35) * (0.8 + Math.random() * 0.2);
      glow.visible = burn > 0.05;
      glow.scale.setScalar(this.ab ? 3.2 : 1 + burn);
    }
    const t = performance.now() / 1000;
    this.navs[2].visible = (t % 1.2) < 0.12;
    this.pilot.visible = flying;
    this.syncMesh();
  }
}

// ---------------------------------------------------------------- the flight line
export class Jets {
  constructor(game) {
    this.game = game;
    const rx = RUNWAY.x;
    const homes = [
      { x: rx - 9, z: RUNWAY.z1 - 40, yaw: 0 }, // lined up on the runway, ready to go
      { x: rx + 9, z: RUNWAY.z1 - 70, yaw: 0 },
      { x: 120, z: -110, yaw: Math.PI }, // on the apron in front of the hangars
      { x: 180, z: -110, yaw: Math.PI },
      { x: 240, z: -110, yaw: Math.PI },
    ];
    this.list = homes.map((h, i) => new Jet(game, h, String(201 + i)));
    this.active = null;
    this.stick = { x: 0, y: 0 };
    this.cockpit = false;
    this.camPos = new THREE.Vector3();
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.fireCd = 0;
  }

  add(jet) { this.list.push(jet); return jet; }
  remove(jet) { const i = this.list.indexOf(jet); if (i >= 0) this.list.splice(i, 1); jet.mesh.removeFromParent(); this.game.portWorld.removeRigidBody(jet.body); if (this.active === jet) this.active = null; }

  // Bail out: the canopy goes and you're fired clear (then it's freefall and the parachute).
  eject() {
    const j = this.active, g = this.game;
    if (!j || j.onGround) { if (j) g.hud.toast('Not on the ground!'); return false; }
    this.active = null;
    g.sfx.setJet(false);
    const up = j.up, p = j.pos.clone().addScaledVector(up, 4);
    g.skydive.start(p, j.vel.clone().multiplyScalar(0.55).addScaledVector(up, 22));
    g.fx.flash(p, 0xffc060, 2, 0.15); g.sfx.play('explosion', 0.5);
    j.ejected = true;
    g.story?.fallout?.onEject?.(j);
    return true;
  }

  nearby(pos) {
    let best = null, bd = 7.5;
    for (const j of this.list) {
      if (j.crashed || !j.onGround || j.locked) continue;
      const d = Math.hypot(j.pos.x - pos.x, j.pos.z - pos.z) - (j.reach || 0);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }

  enter(jet) {
    this.active = jet;
    this.stick = { x: 0, y: 0 };
    jet.collider.setEnabled(false);
    jet.wingCol.setEnabled(false);
    this.camQuat = jet.quat.clone();
    this.game.hud.setMode('jet');
    this.game.sfx.play('engineStart');
  }

  exit() {
    const j = this.active;
    if (!j) return;
    if (!j.onGround || Math.abs(j.speed) > 4) { this.game.hud.toast('Land and stop before getting out'); return; }
    this.active = null;
    j.collider.setEnabled(true);
    j.wingCol.setEnabled(true);
    const side = j.right.multiplyScalar(-4.5); // climb down on the left
    const p = j.pos.clone().add(side);
    this.game.leaveJetAt(new THREE.Vector3(p.x, LAND_Y + 0.95, p.z), j.yaw);
  }

  crashed(jet) {
    if (jet !== this.active) return;
    this.active = null;
    this.game.jetCrashed();
  }

  mouse(dx, dy) {
    this.stick.x = THREE.MathUtils.clamp(this.stick.x + dx * 0.0035, -1, 1);
    this.stick.y = THREE.MathUtils.clamp(this.stick.y + dy * 0.0035, -1, 1);
  }

  key(code) {
    const j = this.active;
    if (!j) return;
    if (code === 'KeyG') {
      if (j.onGround) { this.game.hud.toast('Gear can\'t come up on the ground'); return; }
      j.gearDown = !j.gearDown;
      this.game.hud.toast(j.gearDown ? 'Gear down' : 'Gear up');
      this.game.sfx.play('telegraph');
    }
    if (code === 'KeyC') this.cockpit = !this.cockpit;
    if (code === 'KeyF') this.eject();
  }

  update(dt, keys, trigger) {
    // stick self-centres
    const k = Math.min(dt * 1.6, 1);
    this.stick.x -= this.stick.x * k;
    this.stick.y -= this.stick.y * k * 0.6;
    for (const j of this.list) {
      if (j === this.active) {
        const ctl = {
          throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
          ab: keys.has('ShiftLeft') || keys.has('ShiftRight'),
          steer: (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0),
          brake: keys.has('KeyB') || keys.has('Space'),
          stick: this.stick,
        };
        j.update(dt, ctl);
      } else j.update(dt, null);
    }
    const j = this.active;
    this.fireCd -= dt;
    if (j && trigger && this.fireCd <= 0 && !j.onGround) {
      this.fireCd = 0.045;
      const muzzle = new THREE.Vector3(0.7, 0.3, -6.5).applyQuaternion(j.quat).add(j.pos);
      const v = j.fwd.multiplyScalar(950).add(j.vel);
      this.game.gunnery.rounds.fire('bullet', muzzle, v);
      if (Math.random() < 0.5) this.game.sfx.play('ciws');
    }
    if (j) this.game.sfx.setJet(true, j.throttle, j.ab);
    else this.game.sfx.setJet(false);
  }

  // Chase camera (or cockpit view) for the jet you're flying.
  cameraPose(camera, dt) {
    const j = this.active;
    if (this.cockpit) {
      camera.position.copy(new THREE.Vector3(...(j.cockpitOff || [0, 0.95, -4.6])).applyQuaternion(j.quat).add(j.pos));
      camera.quaternion.copy(j.quat);
      return;
    }
    // Rigid offset behind the jet, but with a smoothed orientation so rolls and pulls feel weighty.
    const k = 1 - Math.exp(-dt * 5);
    this.camQuat.slerp(j.quat, k);
    const off = new THREE.Vector3(...(j.camOff || [0, 4.2, 19])).applyQuaternion(this.camQuat);
    const pos = j.pos.clone().add(off);
    if (j.onGround) pos.y = Math.max(pos.y, LAND_Y + 3);
    pos.y = Math.max(pos.y, this.game.ocean.heightAt(pos.x, pos.z) + 1.5); // never under the sea
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camQuat).lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
    camera.position.copy(pos);
    camera.up.copy(up);
    camera.lookAt(j.pos.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(this.camQuat)));
    camera.up.set(0, 1, 0);
  }
}
