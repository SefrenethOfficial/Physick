import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildFigure } from './figure.js';
import { LAND_Y } from './world.js';

// You, as a ragdoll: thrown out of a moving car (Space to get back up once you've stopped
// tumbling) or dead (until you respawn). The camera pulls out to third person and orbits you.

const LOOK = { shirt: 0x2c3440, pants: 0x3a3f46, skin: 0xd9a47c };

export class PlayerRagdoll {
  constructor(game) {
    this.game = game;
    this.rd = null;
    this.camPos = new THREE.Vector3();
  }

  get active() { return !!this.rd; }

  // pos: where your body is (capsule centre), yaw: facing, vel: how fast you're going.
  start(pos, yaw, vel, { dead = false, spin = 4 } = {}) {
    const g = this.game, sb = g.portSandbox;
    if (this.rd) this.clear();
    const fig = buildFigure(this.game?.style?.figureLook || LOOK);
    // the robot arm
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.85, roughness: 0.35 });
    fig.parts.armR.material = metal;
    fig.root.position.copy(pos);
    fig.root.rotation.y = yaw;
    g.scene.add(fig.root);
    fig.root.updateMatrixWorld(true);
    const { parts } = fig;
    const make = (mesh, desc) => {
      const wp = mesh.getWorldPosition(new THREE.Vector3());
      const wq = mesh.getWorldQuaternion(new THREE.Quaternion());
      const copy = mesh.clone(true);
      copy.position.set(0, 0, 0);
      copy.rotation.set(0, 0, 0);
      const def = { id: 'ragdoll', name: 'You', radius: 0.3, build: () => ({ mesh: copy, colliders: [desc], density: 40, friction: 0.9, restitution: 0.08 }) };
      const prop = sb.spawn(def, wp, wq, { noHistory: true });
      const r = () => (Math.random() - 0.5) * 2 * spin;
      prop.body.setLinvel({ x: vel.x * (0.9 + Math.random() * 0.2), y: vel.y, z: vel.z * (0.9 + Math.random() * 0.2) }, true);
      prop.body.setAngvel({ x: r(), y: r(), z: r() }, true);
      prop.body.setAngularDamping(0.9);
      prop.body.setLinearDamping(0.1);
      prop.playerPart = true;
      return prop;
    };
    const C = RAPIER.ColliderDesc;
    const rd = {
      torso: make(parts.torso, C.cuboid(0.21, 0.3, 0.12)),
      head: make(parts.head, C.ball(0.15)),
      armL: make(parts.armL, C.cuboid(0.06, 0.31, 0.07)),
      armR: make(parts.armR, C.cuboid(0.06, 0.31, 0.07)),
      legL: make(parts.legL, C.cuboid(0.08, 0.4, 0.09)),
      legR: make(parts.legR, C.cuboid(0.08, 0.4, 0.09)),
    };
    const at = (obj, x = 0, y = 0, z = 0) => obj.localToWorld(new THREE.Vector3(x, y, z));
    sb.link(rd.torso, rd.head, at(parts.torso, 0, 0.32, 0));
    sb.link(rd.torso, rd.armL, at(parts.armLPivot));
    sb.link(rd.torso, rd.armR, at(parts.armRPivot));
    sb.link(rd.torso, rd.legL, at(parts.legLPivot));
    sb.link(rd.torso, rd.legR, at(parts.legRPivot));
    rd.parts = [rd.torso, rd.head, rd.armL, rd.armR, rd.legL, rd.legR];
    fig.root.removeFromParent();
    this.rd = rd;
    this.dead = dead;
    this.t = 0;
    this.still = 0;
    // the camera starts where you were looking from and swings out
    this.camPos.copy(g.camera.position);
    g.shorePlayer.collider.setEnabled(false);
    g.sfx.play('thud');
  }

  torsoPos() { const t = this.rd.torso.body.translation(); return new THREE.Vector3(t.x, t.y, t.z); }

  update(dt) {
    const g = this.game, rd = this.rd;
    if (!rd) return;
    this.t += dt;
    if (!rd.parts.every((p) => g.portSandbox.props.has(p))) { this.getUp(); return; }
    const p = this.torsoPos();
    // the you the police are chasing is wherever your body ended up
    g.shorePlayer.body.setTranslation({ x: p.x, y: p.y + 0.4, z: p.z }, true);
    const v = rd.torso.body.linvel();
    this.still = Math.hypot(v.x, v.y, v.z) < 1.2 ? this.still + dt : 0;
    // fell in the sea
    if (p.y < LAND_Y - 3 && !this.dead) { this.getUp(); return; }
  }

  canGetUp() { return this.rd && !this.dead && this.t > 0.8 && this.still > 0.3; }

  // Back on your feet where your body landed.
  getUp() {
    const g = this.game;
    if (!this.rd) return;
    const p = this.torsoPos();
    this.clear();
    g.shorePlayer.collider.setEnabled(true);
    if (!this.deadAtEnd) g.placeOnShore(new THREE.Vector3(p.x, Math.max(p.y, LAND_Y) + 1, p.z), g.shorePlayer.yaw);
  }

  clear() {
    const sb = this.game.portSandbox;
    if (this.rd) for (const part of this.rd.parts) if (sb.props.has(part)) sb.remove(part);
    this.rd = null;
    this.dead = false;
  }

  // Third person: orbit the body with the mouse.
  cameraPose(camera, dt) {
    const g = this.game, pl = g.shorePlayer;
    const target = this.torsoPos().add(new THREE.Vector3(0, 0.4, 0));
    const dist = this.dead ? 4.6 : 3.6;
    const pitch = THREE.MathUtils.clamp(-pl.pitch, -0.2, 1.2) + 0.35;
    const want = target.clone().add(new THREE.Vector3(Math.sin(pl.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(pl.yaw) * Math.cos(pitch)).multiplyScalar(dist));
    // don't put the camera inside a wall
    const dir = want.clone().sub(target);
    const len = dir.length();
    dir.normalize();
    const hit = g.portSandbox.raycast(target, dir, len);
    if (hit && hit.isWorld) want.copy(target).addScaledVector(dir, Math.max(0.8, hit.distance - 0.3));
    this.camPos.lerp(want, 1 - Math.exp(-dt * (this.t < 0.3 ? 6 : 9)));
    camera.position.copy(this.camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
  }
}
