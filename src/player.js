import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const EYE = 0.7; // eye height above capsule centre

// First-person walker using Rapier's kinematic character controller.
export class Player {
  constructor(game, spawn = new THREE.Vector3(0, 2, 10)) {
    this.game = game;
    const world = game.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.35).setFriction(0), this.body);
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
    this.noclip = false;
    this.spawn = spawn.clone();
    this.walkPhase = 0;
    this.speedNow = 0;
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

    if (this.noclip) {
      const camFwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      const fly = new THREE.Vector3();
      if (keys.has('KeyW')) fly.add(camFwd);
      if (keys.has('KeyS')) fly.sub(camFwd);
      if (keys.has('KeyD')) fly.add(right);
      if (keys.has('KeyA')) fly.sub(right);
      if (keys.has('Space')) fly.y += 1;
      if (keys.has('ControlLeft') || keys.has('KeyC')) fly.y -= 1;
      if (fly.lengthSq() > 0) fly.normalize();
      const sp = sprint ? 30 : 12;
      const t = this.body.translation();
      this.body.setNextKinematicTranslation({ x: t.x + fly.x * sp * dt, y: t.y + fly.y * sp * dt, z: t.z + fly.z * sp * dt });
      this.vel.set(0, 0, 0);
      this.speedNow = 0;
      return;
    }

    const speed = sprint ? 10 : 6;
    const accel = this.grounded ? 14 : 3;
    const target = wish.multiplyScalar(speed);
    this.vel.x += (target.x - this.vel.x) * Math.min(accel * dt, 1);
    this.vel.z += (target.z - this.vel.z) * Math.min(accel * dt, 1);

    if (this.grounded && keys.has('Space')) {
      this.vel.y = 6.5;
      this.grounded = false;
    }
    this.vel.y -= 20 * dt;
    this.vel.y = Math.max(this.vel.y, -50);

    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    const held = this.game.heldProp;
    this.cc.computeColliderMovement(this.collider, desired, undefined, undefined, (col) => {
      // Never collide with the prop you're carrying (no prop-surfing).
      if (!held) return true;
      const owner = this.game.sandbox.byCollider.get(col.handle);
      return owner !== held;
    });
    const mv = this.cc.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    const wasGrounded = this.grounded;
    this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    // bonk head
    if (!this.grounded && this.vel.y > 0 && mv.y < desired.y * 0.5) this.vel.y = 0;
    if (!wasGrounded && this.grounded) this.game.viewmodel?.land();

    this.speedNow = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-4);
    if (this.grounded) this.walkPhase += this.speedNow * dt * 1.6;

    if (t.y < -40) this.respawn();
  }

  respawn() {
    this.body.setTranslation({ x: this.spawn.x, y: this.spawn.y, z: this.spawn.z }, true);
    this.vel.set(0, 0, 0);
  }
}
