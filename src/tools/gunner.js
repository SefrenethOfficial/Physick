import * as THREE from 'three';
import { CANNONBALL } from '../props.js';

// GUNNER: hitscan blaster on the left mouse, cannonball launcher on the right.
export class Gunner {
  constructor(game) {
    this.game = game;
    this.name = 'Gunner';
    this.color = 0xff5a36;
    this.firing = false;
    this.cooldown = 0;
    this.cannonCooldown = 0;
    this.hints = [
      ['LMB', 'Fire blaster (hold)'],
      ['RMB', 'Launch cannonball'],
      ['R', 'Remove aimed prop'],
    ];
  }

  primaryDown() { this.firing = true; }
  primaryUp() { this.firing = false; }

  secondaryDown() {
    if (this.cannonCooldown > 0) return;
    this.cannonCooldown = 0.45;
    const g = this.game;
    const { origin, dir } = g.aim();
    const start = origin.clone().addScaledVector(dir, 1.0);
    const q = new THREE.Quaternion();
    const ball = g.sandbox.spawn(CANNONBALL, start, q, { temporary: true });
    const v = dir.clone().multiplyScalar(42);
    const pv = g.player.vel;
    ball.body.setLinvel({ x: v.x + pv.x, y: v.y + pv.y, z: v.z + pv.z }, true);
    g.viewmodel.kick(1.4);
    g.sfx.play('cannon');
  }

  key(code) {
    if (code === 'KeyR') {
      const hit = this.game.aimHit();
      if (hit?.npc) { this.game.npcs.knockOver(hit.npc, new THREE.Vector3(0, 2, 0)); return true; }
      if (hit?.prop) {
        if (hit.prop.ragdoll) { for (const p of hit.prop.ragdoll.parts) this.game.sandbox.remove(p); }
        this.game.effects.sparks(hit.point, hit.normal, 0xff5a36, 30, 5);
        this.game.sandbox.remove(hit.prop);
        this.game.hud.toast('Removed', this.color);
        this.game.sfx.play('unweld');
      }
      return true;
    }
    return false;
  }

  fire() {
    const g = this.game;
    const { origin, dir } = g.aim();
    // small spread
    const spread = 0.008;
    const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)).normalize();
    const hit = g.sandbox.raycast(origin, d, 400, g.player.collider);
    const muzzle = g.muzzle();
    const end = hit ? hit.point : origin.clone().addScaledVector(d, 400);
    g.effects.tracer(muzzle, end, 0xffb070, 0.03);
    g.viewmodel.kick(0.45);
    g.sfx.play('shoot');
    if (!hit) return;
    g.npcs.alarm(hit.point, 7);
    if (hit.npc) {
      g.effects.sparks(hit.point, hit.normal, 0xffffff, 8, 2.5);
      g.npcs.damage(hit.npc, 26, d, hit.point);
      return;
    }
    g.effects.sparks(hit.point, hit.normal, 0xffb347, 12, 4);
    if (hit.prop) {
      const p = hit.prop;
      if (!p.frozen) {
        const m = p.body.mass();
        const strength = THREE.MathUtils.clamp(m * 2.2, 1.5, 90);
        p.body.applyImpulseAtPoint(
          { x: d.x * strength, y: d.y * strength, z: d.z * strength },
          { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          true,
        );
      }
      g.effects.bulletHole(p.mesh, hit.point, hit.normal);
    } else {
      g.effects.bulletHole(g.scene, hit.point, hit.normal);
    }
  }

  update(dt) {
    this.cooldown -= dt;
    this.cannonCooldown -= dt;
    if (this.firing && this.cooldown <= 0) {
      this.fire();
      this.cooldown = 0.11;
    }
    this.game.viewmodel.gripTarget = this.firing ? 0.4 : 0;
  }

  deactivate() { this.firing = false; }
}
