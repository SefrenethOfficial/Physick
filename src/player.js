import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS } from './groups.js';

const EYE = 0.7; // eye height above capsule centre

// First-person walker using Rapier's kinematic character controller.
export class Player {
  // opts.world / opts.sandbox let a second walker live in another physics world (ashore).
  constructor(game, spawn = new THREE.Vector3(0, 2, 10), opts = {}) {
    this.game = game;
    const world = opts.world || game.world;
    this.sb = opts.sandbox || null;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.35).setFriction(0).setCollisionGroups(GROUPS.player), this.body);
    this.cc = world.createCharacterController(0.02);
    this.cc.enableAutostep(0.45, 0.25, false);
    this.cc.enableSnapToGround(0.35);
    this.cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.cc.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    this.cc.setApplyImpulsesToDynamicBodies(true);
    this.cc.setCharacterMass(80);

    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.spawn = spawn.clone();
    this.walkPhase = 0;
    this.speedNow = 0;
    this.platVel = null;
  }

  get eye() {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y + EYE, t.z);
  }

  look(dx, dy) {
    const s = 0.0022;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  applyCamera(camera) {
    camera.position.copy(this.eye);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (this.game.health?.dead) {
      // slump to the floor
      const k = 1 - Math.max(this.game.health.deadT - 2.4, 0) / 0.6;
      camera.position.y -= 1.1 * k;
      camera.rotation.set(this.pitch * (1 - k) - 0.25 * k, this.yaw, 0.7 * k, 'YXZ');
    }
  }

  update(dt, keys) {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (keys.has('KeyW')) wish.add(fwd);
    if (keys.has('KeyS')) wish.sub(fwd);
    if (keys.has('KeyD')) wish.add(right);
    if (keys.has('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');

    const vyBefore = this.vel.y;
    // What are we standing on? A moving prop carries you along with it.
    const plat = this.groundProp();
    const pv = plat ? this.pointVelocity(plat.prop, plat.point) : null;
    const onPlat = !!pv && this.vel.y <= 0.5;

    const speed = sprint ? 10 : 6;
    const target = wish.multiplyScalar(speed);
    const onGround = this.grounded || onPlat;
    if (onGround) {
      this.vel.x += (target.x - this.vel.x) * Math.min(14 * dt, 1);
      this.vel.z += (target.z - this.vel.z) * Math.min(14 * dt, 1);
    } else {
      // Air: keep your momentum (so flings and launches carry), with a bit of steering.
      const before = Math.hypot(this.vel.x, this.vel.z);
      this.vel.x += target.x * 2.2 * dt;
      this.vel.z += target.z * 2.2 * dt;
      const after = Math.hypot(this.vel.x, this.vel.z);
      const cap = Math.max(before, speed);
      if (after > cap) { this.vel.x *= cap / after; this.vel.z *= cap / after; }
      const drag = 1 - 0.12 * dt;
      this.vel.x *= drag; this.vel.z *= drag;
    }

    let jumped = false;
    if (onGround && keys.has('Space')) {
      this.vel.y = 6.5;
      this.grounded = false;
      jumped = true;
    }

    if (onPlat && !jumped) {
      this.vel.y = 0; // ride: vertical motion comes from the prop
    } else {
      this.vel.y -= 20 * dt;
      this.vel.y = Math.max(this.vel.y, -50);
    }

    // Leaving a moving prop (jumping off or it flying out from under you) keeps its velocity.
    if (jumped && pv) {
      this.vel.x += pv.x; this.vel.z += pv.z; this.vel.y += Math.max(pv.y, 0);
    } else if (!onPlat && this.platVel) {
      this.vel.x += this.platVel.x; this.vel.z += this.platVel.z; this.vel.y += Math.max(this.platVel.y, 0);
    }
    this.platVel = onPlat && !jumped ? pv : null;

    const carry = this.platVel || { x: 0, y: 0, z: 0 };
    const desired = {
      x: (this.vel.x + carry.x) * dt,
      y: (this.vel.y + carry.y) * dt,
      z: (this.vel.z + carry.z) * dt,
    };
    this.cc.computeColliderMovement(this.collider, desired);
    const mv = this.cc.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    const wasGrounded = this.grounded;
    this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    // bonk head
    if (!this.grounded && this.vel.y > 0 && mv.y < desired.y * 0.5) this.vel.y = 0;
    const nowOnGround = this.grounded || onPlat;
    if (!this.wasOnGround && nowOnGround) {
      this.game.viewmodel?.land();
      const fall = -vyBefore;
      if (fall > 13) this.game.health?.damage((fall - 13) * 7, 'fall');
    }
    this.wasOnGround = nowOnGround;

    const rel = { x: mv.x - carry.x * dt, z: mv.z - carry.z * dt };
    this.speedNow = Math.hypot(rel.x, rel.z) / Math.max(dt, 1e-4);
    if (onGround) this.walkPhase += this.speedNow * dt * 1.6;

    if (t.y < -40) this.respawn();
  }

  // Prop directly under the player's feet, if any (a few rays so edges count too).
  groundProp() {
    const t = this.body.translation();
    const sb = this.sb || this.game.sandbox;
    const down = { x: 0, y: -1, z: 0 };
    const feet = t.y - 0.85 + 0.1;
    for (const [ox, oz] of [[0, 0], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) {
      const hit = sb.raycast({ x: t.x + ox, y: feet, z: t.z + oz }, down, 0.3, this.collider);
      if (hit?.prop && !hit.prop.frozen) return { prop: hit.prop, point: hit.point };
      if (hit && ox === 0 && oz === 0) return null; // standing on the world
    }
    return null;
  }

  // Velocity of a point on a prop (linear + spin).
  pointVelocity(prop, point) {
    const b = prop.body;
    const lv = b.linvel(), av = b.angvel(), c = b.translation();
    const r = { x: point.x - c.x, y: point.y - c.y, z: point.z - c.z };
    return {
      x: lv.x + av.y * r.z - av.z * r.y,
      y: lv.y + av.z * r.x - av.x * r.z,
      z: lv.z + av.x * r.y - av.y * r.x,
    };
  }

  respawn() {
    this.body.setTranslation({ x: this.spawn.x, y: this.spawn.y, z: this.spawn.z }, true);
    this.vel.set(0, 0, 0);
    this.platVel = null;
  }
}
