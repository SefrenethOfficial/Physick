import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS } from './groups.js';
import { buildFigure, animateWalk, animatePanic } from './figure.js';

const HALF = 0.55; // capsule half height
const RAD = 0.28;
const FOOT = HALF + RAD; // centre to feet
const KNOCKDOWN_SPEED = 5.5; // m/s a prop must be closing at to bowl someone over
const RAGDOLL_LIFETIME = 45; // seconds before an untouched ragdoll is tidied away
const MAX_RAGDOLLS = 8;

const yawDir = (h) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h)); // figure faces +Z

// Wandering citizens. They walk around, run away from danger, and turn into ragdolls
// (ordinary props you can grab, weld and freeze) when something hits them hard enough.
export class Npcs {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.ragdolls = [];
    this.max = 10;
    this.respawnTimer = 2;
    this.radius = 75; // wander area around the origin
    this.knockdowns = 0;
  }

  get world() { return this.game.world; }

  populate(n = this.max) {
    for (let i = 0; i < n; i++) {
      const p = this.randomPoint(0);
      if (p) this.spawn(p);
    }
  }

  clear() {
    for (const n of [...this.list]) this.despawn(n);
    this.ragdolls = [];
  }

  // Random walkable spot on the ground (not on top of buildings), optionally away from the player.
  randomPoint(minDistFromPlayer = 0, near = null, range = 25) {
    const sb = this.game.sandbox;
    const pp = this.game.player?.body.translation();
    for (let i = 0; i < 25; i++) {
      let x, z;
      if (near) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * range;
        x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r;
      } else {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.radius;
        x = Math.cos(a) * r; z = Math.sin(a) * r;
      }
      if (Math.hypot(x, z) > this.radius) continue;
      if (pp && minDistFromPlayer && Math.hypot(x - pp.x, z - pp.z) < minDistFromPlayer) continue;
      const hit = sb.raycast({ x, y: 30, z }, { x: 0, y: -1, z: 0 }, 40);
      if (!hit || !hit.isWorld || hit.normal.y < 0.85 || hit.point.y > 0.6) continue;
      return hit.point;
    }
    return null;
  }

  spawn(groundPoint) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(groundPoint.x, groundPoint.y + FOOT + 0.05, groundPoint.z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(HALF, RAD).setCollisionGroups(GROUPS.npc),
      body,
    );
    const cc = this.world.createCharacterController(0.02);
    cc.enableAutostep(0.4, 0.2, false);
    cc.enableSnapToGround(0.4);
    cc.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    cc.setApplyImpulsesToDynamicBodies(false);
    const fig = buildFigure();
    this.game.scene.add(fig.root);
    const npc = {
      body, collider, cc, fig,
      hp: 100,
      heading: Math.random() * Math.PI * 2,
      target: null,
      idle: Math.random() * 2,
      speed: 0,
      vy: 0,
      phase: Math.random() * 10,
      fear: 0,
      threat: new THREE.Vector3(),
      stuckT: 0,
      lastPos: new THREE.Vector3(groundPoint.x, 0, groundPoint.z),
    };
    this.game.sandbox.npcByCollider.set(collider.handle, npc);
    this.list.push(npc);
    return npc;
  }

  despawn(npc) {
    this.game.sandbox.npcByCollider.delete(npc.collider.handle);
    this.world.removeCharacterController(npc.cc);
    this.world.removeRigidBody(npc.body);
    this.game.scene.remove(npc.fig.root);
    const i = this.list.indexOf(npc);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Something dangerous happened at `point` (gunfire, explosion of crates...): nearby people run.
  alarm(point, radius = 8) {
    for (const n of this.list) {
      const t = n.body.translation();
      if (Math.hypot(t.x - point.x, t.z - point.z) < radius) this.scare(n, point, 4);
    }
  }

  scare(npc, from, seconds) {
    npc.fear = Math.max(npc.fear, seconds);
    npc.threat.set(from.x, 0, from.z);
    npc.target = null;
    npc.idle = 0;
  }

  damage(npc, amount, dir, point) {
    npc.hp -= amount;
    if (npc.hp <= 0) {
      const v = dir.clone().multiplyScalar(7);
      v.y += 1.5;
      this.knockOver(npc, v);
    } else {
      this.scare(npc, point.clone().sub(dir.clone().multiplyScalar(20)), 5);
      this.game.sfx.play('ouch');
    }
  }

  // Turn a living NPC into a ragdoll made of ordinary props joined by ball joints.
  knockOver(npc, velocity = new THREE.Vector3(), spin = 3) {
    const sb = this.game.sandbox;
    const { parts } = npc.fig;
    npc.fig.root.updateMatrixWorld(true);
    const v = new THREE.Vector3().copy(velocity);

    const make = (mesh, desc) => {
      const wp = mesh.getWorldPosition(new THREE.Vector3());
      const wq = mesh.getWorldQuaternion(new THREE.Quaternion());
      const copy = mesh.clone(true);
      copy.position.set(0, 0, 0);
      copy.rotation.set(0, 0, 0);
      const def = {
        id: 'ragdoll', name: 'Ragdoll', radius: 0.3,
        build: () => ({ mesh: copy, colliders: [desc], density: 40, friction: 0.9, restitution: 0.05 }),
      };
      const prop = sb.spawn(def, wp, wq, { noHistory: true });
      const r = () => (Math.random() - 0.5) * 2 * spin;
      prop.body.setLinvel({ x: v.x * (0.85 + Math.random() * 0.3), y: v.y, z: v.z * (0.85 + Math.random() * 0.3) }, true);
      prop.body.setAngvel({ x: r(), y: r(), z: r() }, true);
      prop.body.setAngularDamping(1.2);
      prop.body.setLinearDamping(0.15);
      return prop;
    };
    const C = RAPIER.ColliderDesc;
    const rd = {
      bornAt: performance.now(),
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
    for (const p of rd.parts) p.ragdoll = rd;

    this.despawn(npc);
    this.ragdolls.push(rd);
    this.knockdowns++;
    this.trimRagdolls(MAX_RAGDOLLS);
    this.game.sfx.play('thud');
    this.game.effects.sparks(rd.torso.mesh.position, new THREE.Vector3(0, 1, 0), 0xffffff, 10, 2.5, 0.6);
    // Everyone nearby panics.
    this.alarm(rd.torso.mesh.position, 14);
    return rd;
  }

  trimRagdolls(max) {
    const sb = this.game.sandbox;
    this.ragdolls = this.ragdolls.filter((rd) => rd.parts.some((p) => sb.props.has(p)));
    while (this.ragdolls.length > max) {
      const i = this.ragdolls.findIndex((rd) => !this.inUse(rd));
      if (i < 0) break;
      for (const p of this.ragdolls[i].parts) sb.remove(p);
      this.ragdolls.splice(i, 1);
    }
  }

  inUse(rd) {
    return rd.parts.some((p) => p.frozen || p.welds.size || p === this.game.heldProp);
  }

  // ---------- physics step ----------
  update(dt) {
    const g = this.game;
    const pp = g.player.body.translation();
    const drive = g.driving.vehicle;
    const dv = drive ? drive.body.linvel() : null;
    const dpos = drive ? drive.body.translation() : null;

    for (const npc of [...this.list]) {
      const t = npc.body.translation();

      // Anything flying at this person fast enough knocks them flat.
      const hits = g.sandbox.incoming(t, HALF, RAD);
      let worst = null;
      for (const h of hits) if (!worst || h.speed > worst.speed) worst = h;
      if (worst && worst.speed > KNOCKDOWN_SPEED) {
        const v = new THREE.Vector3(worst.vel.x, worst.vel.y, worst.vel.z).multiplyScalar(1.1);
        v.y = Math.max(v.y, 0) + 2 + worst.speed * 0.15;
        this.knockOver(npc, v, 4 + worst.speed * 0.3);
        continue;
      }
      if (worst && worst.speed > 2) this.scare(npc, worst.prop.body.translation(), 3);

      // Run from a quad bike coming their way.
      if (drive) {
        const sp = Math.hypot(dv.x, dv.z);
        const d = Math.hypot(t.x - dpos.x, t.z - dpos.z);
        if (sp > 4 && d < 14) {
          const toward = ((t.x - dpos.x) * dv.x + (t.z - dpos.z) * dv.z) / (d * sp);
          if (toward > 0.5) this.scare(npc, dpos, 2.5);
        }
      }

      // --- decide where to go ---
      let want = null;
      let speed = 0;
      if (npc.fear > 0) {
        npc.fear -= dt;
        want = new THREE.Vector3(t.x - npc.threat.x, 0, t.z - npc.threat.z);
        if (want.lengthSq() < 0.01) want.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        // Don't flee off the edge of the town.
        if (Math.hypot(t.x, t.z) > this.radius) want.add(new THREE.Vector3(-t.x, 0, -t.z).normalize().multiplyScalar(2));
        want.normalize();
        speed = 4.8;
      } else if (npc.idle > 0) {
        npc.idle -= dt;
      } else {
        if (!npc.target || Math.hypot(npc.target.x - t.x, npc.target.z - t.z) < 1.2) {
          if (npc.target && Math.random() < 0.4) npc.idle = 1 + Math.random() * 4;
          npc.target = this.randomPoint(0, t, 22);
        }
        if (npc.target) {
          want = new THREE.Vector3(npc.target.x - t.x, 0, npc.target.z - t.z).normalize();
          speed = 1.5;
        }
      }

      // Turn smoothly toward the wanted direction.
      if (want) {
        const targetH = Math.atan2(want.x, want.z);
        let d = targetH - npc.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        npc.heading += d * Math.min(dt * (npc.fear > 0 ? 10 : 4), 1);
        if (Math.abs(d) > 1.2) speed *= 0.3; // slow while turning around
      }
      npc.speed += (speed - npc.speed) * Math.min(dt * 6, 1);

      // Stuck? pick something else.
      npc.stuckT += dt;
      if (npc.stuckT > 1.5) {
        const moved = Math.hypot(t.x - npc.lastPos.x, t.z - npc.lastPos.z);
        if (npc.speed > 0.5 && moved < 0.4) {
          npc.target = null;
          npc.heading += Math.PI * (0.5 + Math.random());
        }
        npc.lastPos.set(t.x, 0, t.z);
        npc.stuckT = 0;
      }

      const f = yawDir(npc.heading).multiplyScalar(npc.speed * dt);
      npc.vy = Math.max(npc.vy - 20 * dt, -40);
      npc.cc.computeColliderMovement(npc.collider, { x: f.x, y: npc.vy * dt, z: f.z }, undefined, GROUPS.npcMove);
      const mv = npc.cc.computedMovement();
      npc.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
      if (npc.cc.computedGrounded()) npc.vy = 0;
      if (t.y < -20) this.despawn(npc);
    }
  }

  // ---------- per frame ----------
  frame(dt) {
    for (const npc of this.list) {
      const t = npc.body.translation();
      const root = npc.fig.root;
      root.position.set(t.x, t.y, t.z);
      root.rotation.y = npc.heading;
      npc.phase += dt * (2.5 + npc.speed * 2.6);
      if (npc.fear > 0) animatePanic(npc.fig.parts, npc.phase);
      else animateWalk(npc.fig.parts, npc.phase, npc.speed / 1.5);
    }

    // Keep the town populated (new people show up out of sight).
    if (this.list.length < this.max) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        const p = this.randomPoint(30);
        if (p) this.spawn(p);
        this.respawnTimer = 3;
      }
    }

    // Tidy up old ragdolls nobody is playing with.
    const now = performance.now();
    const sb = this.game.sandbox;
    for (const rd of [...this.ragdolls]) {
      if (now - rd.bornAt > RAGDOLL_LIFETIME * 1000 && !this.inUse(rd)) {
        for (const p of rd.parts) sb.remove(p);
        this.ragdolls.splice(this.ragdolls.indexOf(rd), 1);
      }
    }
  }
}
