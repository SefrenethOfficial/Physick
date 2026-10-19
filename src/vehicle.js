import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PROP, WORLD } from './groups.js';
import { buildFigure, poseSeated } from './figure.js';

// ---------------------------------------------------------------------------
// Quad bike prop. Built along +X (Rapier's default vehicle forward axis).
// ---------------------------------------------------------------------------
const WHEELS = [
  { pos: [0.66, -0.02, 0.52], front: true },
  { pos: [0.66, -0.02, -0.52], front: true },
  { pos: [-0.62, -0.02, 0.52], front: false },
  { pos: [-0.62, -0.02, -0.52], front: false },
];
const WHEEL_R = 0.33;
const REST = 0.26;
const SEAT = new THREE.Vector3(-0.18, 0.95, 0); // where the rider's eye-ish anchor sits

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });

function box(w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

function cyl(r1, r2, len, m, seg = 16) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m);
}

function buildWheel() {
  const g = new THREE.Group();
  const tire = cyl(WHEEL_R, WHEEL_R, 0.26, std(0x1b1c1e, { roughness: 0.95 }), 24);
  tire.rotation.x = Math.PI / 2;
  g.add(tire);
  // chunky tread blocks
  const treadM = std(0x101113, { roughness: 1 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const t = box(0.07, 0.05, 0.28, treadM, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, 0, 0, 0, a);
    g.add(t);
  }
  const rim = cyl(0.18, 0.18, 0.27, std(0xc9ced3, { metalness: 0.7, roughness: 0.3 }), 16);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const nut = cyl(0.06, 0.06, 0.29, std(0x3a3d42, { metalness: 0.6 }), 8);
  nut.rotation.x = Math.PI / 2;
  g.add(nut);
  const spin = new THREE.Group(); // steering pivot -> spin
  spin.add(g);
  const steer = new THREE.Group();
  steer.add(spin);
  return { steer, spin };
}

function buildQuad() {
  const root = new THREE.Group();
  const paint = std(0xe0532a, { roughness: 0.45, metalness: 0.1 });
  const dark = std(0x26282c, { roughness: 0.7 });
  const metal = std(0x9aa0a6, { metalness: 0.8, roughness: 0.35 });
  const seatM = std(0x151515, { roughness: 0.9 });

  // frame + body panels
  root.add(box(1.35, 0.16, 0.5, dark, 0, 0.02, 0));
  root.add(box(0.62, 0.2, 1.08, paint, 0.62, 0.22, 0, 0, 0, -0.12)); // front fenders
  root.add(box(0.62, 0.18, 1.08, paint, -0.6, 0.22, 0, 0, 0, 0.1)); // rear fenders
  root.add(box(0.5, 0.22, 0.46, paint, 0.22, 0.3, 0)); // tank
  root.add(box(0.72, 0.12, 0.38, seatM, -0.22, 0.37, 0)); // seat
  root.add(box(0.32, 0.08, 0.5, dark, 0.95, 0.12, 0)); // front bumper
  // racks
  for (const x of [0.62, -0.62]) {
    root.add(box(0.5, 0.03, 0.04, metal, x, 0.36, 0.42));
    root.add(box(0.5, 0.03, 0.04, metal, x, 0.36, -0.42));
    for (const dx of [-0.2, 0, 0.2]) root.add(box(0.03, 0.03, 0.88, metal, x + dx, 0.36, 0));
  }
  // footrests
  root.add(box(0.34, 0.04, 0.2, dark, -0.02, 0.0, 0.4));
  root.add(box(0.34, 0.04, 0.2, dark, -0.02, 0.0, -0.4));
  // steering column + bars
  const col = cyl(0.03, 0.03, 0.42, metal, 8);
  col.position.set(0.42, 0.55, 0);
  col.rotation.z = 0.35;
  root.add(col);
  const bars = new THREE.Group();
  bars.position.set(0.36, 0.76, 0);
  const bar = cyl(0.022, 0.022, 0.78, metal, 8);
  bar.rotation.x = Math.PI / 2;
  bars.add(bar);
  for (const z of [0.34, -0.34]) {
    const grip = cyl(0.035, 0.035, 0.14, seatM, 8);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = z;
    bars.add(grip);
  }
  root.add(bars);
  // headlights
  const lampM = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 1.2 });
  for (const z of [0.2, -0.2]) root.add(box(0.05, 0.08, 0.14, lampM, 0.93, 0.27, z));
  const tail = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xaa0000 });
  root.add(box(0.04, 0.05, 0.16, tail, -0.92, 0.27, 0));

  const wheels = WHEELS.map((w) => {
    const wh = buildWheel();
    wh.steer.position.set(w.pos[0], w.pos[1] - REST, w.pos[2]);
    root.add(wh.steer);
    return wh;
  });

  // rider (only shown while someone is driving)
  const rider = buildFigure({ shirt: 0x2f7fd8, pants: 0x2c3440, skin: 0xf1c9a5 });
  poseSeated(rider.parts);
  rider.root.position.set(-0.24, 0.76, 0);
  rider.root.rotation.y = Math.PI / 2;
  rider.root.visible = false;
  root.add(rider.root);

  root.userData.wheels = wheels;
  root.userData.bars = bars;
  root.userData.rider = rider;
  return root;
}

export const QUAD = {
  id: 'quad', name: 'Quad Bike', radius: 1.1,
  build: () => ({
    mesh: buildQuad(),
    colliders: [
      RAPIER.ColliderDesc.cuboid(0.78, 0.17, 0.5).setTranslation(0, 0.15, 0),
      RAPIER.ColliderDesc.cuboid(0.3, 0.12, 0.2).setTranslation(-0.2, 0.42, 0), // seat bump
      RAPIER.ColliderDesc.cuboid(0.55, 0.05, 0.4).setTranslation(0, -0.22, 0), // heavy ballast: low centre of mass
    ],
    densities: [6, 2, 260],
    friction: 0.6,
    restitution: 0.1,
    setup: attachVehicle,
  }),
};

function attachVehicle(prop, sandbox) {
  const ctrl = sandbox.world.createVehicleController(prop.body);
  WHEELS.forEach((w, i) => {
    ctrl.addWheel({ x: w.pos[0], y: w.pos[1], z: w.pos[2] }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }, REST, WHEEL_R);
    ctrl.setWheelSuspensionStiffness(i, 34);
    ctrl.setWheelSuspensionCompression(i, 3.2);
    ctrl.setWheelSuspensionRelaxation(i, 3.8);
    ctrl.setWheelMaxSuspensionTravel(i, 0.3);
    ctrl.setWheelMaxSuspensionForce(i, 1e5);
    ctrl.setWheelFrictionSlip(i, 2.2);
    ctrl.setWheelSideFrictionStiffness(i, 1.1);
  });
  prop.body.setAngularDamping(0.6);
  const ud = prop.mesh.userData;
  prop.vehicle = {
    ctrl,
    wheels: ud.wheels,
    bars: ud.bars,
    rider: ud.rider,
    steer: 0,
    driven: false,
  };
}

// ---------------------------------------------------------------------------
// Driving: entering/exiting, controls, chase camera, crash damage.
// ---------------------------------------------------------------------------
const WHEEL_FILTER = ((PROP & 0xffff) << 16) | (WORLD | PROP); // wheels ignore people

export class Driving {
  constructor(game) {
    this.game = game;
    this.vehicle = null;
    this.relYaw = 0;
    this.pitch = -0.22;
    this.sinceMouse = 0;
    this.prevVel = null;
    this.honkT = 0;
    game.events.on('vehicleRemoved', (p) => { if (p === this.vehicle) this.exit(true); });
  }

  get active() { return !!this.vehicle; }

  vehicles() {
    return [...this.game.sandbox.props].filter((p) => p.vehicle);
  }

  // Vehicle you're looking at (close by) or standing right next to.
  nearby() {
    const g = this.game;
    const hit = g.aimHit(4.5);
    if (hit?.prop?.vehicle) return hit.prop;
    const pp = g.player.body.translation();
    let best = null, bd = 2.6;
    for (const v of this.vehicles()) {
      const t = v.body.translation();
      const d = Math.hypot(t.x - pp.x, t.y - pp.y, t.z - pp.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  tryEnter() {
    const v = this.nearby();
    if (!v || v.frozen) return false;
    this.enter(v);
    return true;
  }

  enter(prop) {
    const g = this.game;
    g.tool.deactivate();
    this.vehicle = prop;
    prop.vehicle.driven = true;
    prop.vehicle.rider.root.visible = true;
    g.player.collider.setEnabled(false);
    this.relYaw = 0;
    this.pitch = -0.22;
    this.prevVel = null;
    g.hud.setDriving(true);
    g.sfx.play('engineStart');
    g.sfx.setEngine(true, 0);
  }

  exit(silent = false) {
    const g = this.game;
    const prop = this.vehicle;
    if (!prop) return;
    this.vehicle = null;
    g.sfx.setEngine(false);
    g.hud.setDriving(false);
    if (prop.vehicle) {
      prop.vehicle.driven = false;
      prop.vehicle.rider.root.visible = false;
    }
    // Step off to the left side (or the right, or on top if both are blocked).
    const t = prop.body.translation();
    const q = new THREE.Quaternion().copy(prop.body.rotation());
    const side = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    side.y = 0;
    side.normalize();
    let spot = null;
    for (const s of [side, side.clone().negate()]) {
      const origin = { x: t.x, y: t.y + 0.9, z: t.z };
      const hit = g.sandbox.raycast(origin, s, 1.6);
      if (!hit) { spot = new THREE.Vector3(t.x + s.x * 1.5, t.y + 0.9, t.z + s.z * 1.5); break; }
    }
    if (!spot) spot = new THREE.Vector3(t.x, t.y + 2, t.z);
    g.player.body.setTranslation(spot, true);
    g.player.collider.setEnabled(true);
    const v = prop.body.linvel();
    g.player.vel.set(v.x * 0.6, Math.max(v.y, 0), v.z * 0.6);
    g.player.yaw = this.cameraYaw();
    g.player.pitch = 0;
    if (!silent) g.sfx.play('drop');
  }

  heading() {
    const q = this.vehicle.body.rotation();
    const f = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    return Math.atan2(-f.x, -f.z);
  }

  cameraYaw() {
    return this.vehicle ? this.heading() + this.relYaw : this.game.player.yaw;
  }

  mouse(dx, dy) {
    this.relYaw -= dx * 0.0025;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0025, -1.2, 0.45);
    this.sinceMouse = 0;
  }

  key(code) {
    const g = this.game;
    if (code === 'KeyE') { this.exit(); return true; }
    if (code === 'KeyR') { this.flip(); return true; }
    if (code === 'KeyH') { g.sfx.play('honk'); this.honk(); return true; }
    return true; // swallow other keys (no tools while driving)
  }

  honk() {
    const t = this.vehicle.body.translation();
    this.game.npcs.alarm(t, 10);
  }

  flip() {
    const b = this.vehicle.body;
    const t = b.translation();
    const h = this.heading();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h + Math.PI / 2);
    b.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true);
    b.setRotation(q, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.game.hud.toast('Flipped upright');
  }

  // Called every physics sub-step, before world.step().
  step(dt, keys) {
    const g = this.game;
    for (const prop of this.vehicles()) {
      const v = prop.vehicle;
      const ctrl = v.ctrl;
      const mine = prop === this.vehicle && !g.health.dead;
      let engine = 0, brake = 0, steerTarget = 0, handbrake = false;
      const speed = ctrl.currentVehicleSpeed();
      if (mine) {
        prop.body.wakeUp(); // engine forces alone don't wake a sleeping body
        const fwd = keys.has('KeyW') || keys.has('ArrowUp');
        const back = keys.has('KeyS') || keys.has('ArrowDown');
        const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
        const mass = prop.body.mass();
        const force = mass * (boost ? 11 : 7);
        const top = boost ? 24 : 15; // m/s
        if (fwd && speed < top) engine = force * (1 - Math.max(speed, 0) / (top * 1.4));
        if (back) {
          if (speed > 1.0) brake = mass * 0.35; // braking while rolling forward
          else if (speed > -7) engine = -force * 0.6; // reverse (capped at ~25 km/h)
        }
        if (keys.has('KeyA') || keys.has('ArrowLeft')) steerTarget += 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) steerTarget -= 1;
        handbrake = keys.has('Space');
        if (!fwd && !back) brake = mass * 0.015; // gentle engine braking
        // less steering at speed
        steerTarget *= 0.55 / (1 + Math.abs(speed) * 0.06);
        g.sfx.setEngine(true, Math.min(Math.abs(speed) / 18, 1.2) + (fwd || back ? 0.15 : 0));
      } else {
        brake = prop.body.mass() * 0.25; // parked
      }
      v.steer += (steerTarget - v.steer) * Math.min(dt * 8, 1);

      WHEELS.forEach((w, i) => {
        ctrl.setWheelSteering(i, w.front ? v.steer : 0);
        ctrl.setWheelEngineForce(i, -engine / 4); // Rapier pushes along -forward for positive force
        ctrl.setWheelBrake(i, handbrake && !w.front ? 2 : brake);
        ctrl.setWheelFrictionSlip(i, handbrake && !w.front ? 1.1 : 2.2);
      });
      ctrl.updateVehicle(dt, undefined, WHEEL_FILTER);
    }

    // Crash damage for the rider: a big sudden change in speed hurts.
    if (this.vehicle) {
      const lv = this.vehicle.body.linvel();
      if (this.prevVel) {
        const dvel = Math.hypot(lv.x - this.prevVel.x, lv.y - this.prevVel.y, lv.z - this.prevVel.z);
        if (dvel > 9) g.health.damage((dvel - 9) * 5, 'crash');
      }
      this.prevVel = { x: lv.x, y: lv.y, z: lv.z };
      // keep the (disabled) player body riding along so distance checks still work
      const t = this.vehicle.body.translation();
      g.player.body.setNextKinematicTranslation({ x: t.x, y: t.y + 0.6, z: t.z });
    }
  }

  // Called once per rendered frame: wheel visuals and the chase camera.
  frame(dt, camera) {
    for (const prop of this.vehicles()) {
      const v = prop.vehicle;
      WHEELS.forEach((w, i) => {
        const wh = v.wheels[i];
        const len = v.ctrl.wheelSuspensionLength(i) ?? REST;
        wh.steer.position.set(w.pos[0], w.pos[1] - len, w.pos[2]);
        wh.steer.rotation.y = v.ctrl.wheelSteering(i) ?? 0;
        wh.spin.rotation.z = -(v.ctrl.wheelRotation(i) ?? 0);
      });
      v.bars.rotation.y = v.steer * 0.8;
      if (v.driven) poseSeated(v.rider.parts, v.steer);
    }

    if (!this.vehicle) return;
    this.sinceMouse += dt;
    const lv = this.vehicle.body.linvel();
    const speed = Math.hypot(lv.x, lv.z);
    if (this.sinceMouse > 1.2 && speed > 2) {
      this.relYaw = Math.atan2(Math.sin(this.relYaw), Math.cos(this.relYaw));
      this.relYaw *= 1 - Math.min(dt * 2.2, 1);
    }
    const t = this.vehicle.body.translation();
    const target = new THREE.Vector3(t.x, t.y + 1.1, t.z);
    const yaw = this.cameraYaw();
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, yaw, 0, 'YXZ'));
    let dist = 5.2 + Math.min(speed * 0.06, 1.5);
    const ray = new RAPIER.Ray(target, { x: -dir.x, y: -dir.y, z: -dir.z });
    const hit = this.game.world.castRay(ray, dist, true, undefined, undefined, undefined, this.vehicle.body,
      (c) => !this.game.sandbox.npcByCollider.has(c.handle) && c.handle !== this.game.player.collider.handle);
    if (hit) dist = Math.max(hit.timeOfImpact - 0.25, 1.2);
    camera.position.copy(target).addScaledVector(dir, -dist);
    camera.lookAt(target.x + dir.x * 3, target.y + dir.y * 3, target.z + dir.z * 3);
    this.game.hud.setSpeed(Math.abs(this.vehicle.vehicle.ctrl.currentVehicleSpeed()) * 3.6);
  }
}
