import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// MOVE: grab props with a beam, carry them, spin them, freeze them in place.
export class Move {
  constructor(game) {
    this.game = game;
    this.name = 'Move';
    this.color = 0x39a7ff;
    this.held = null; // { prop, local, dist, rel }
    this.rotating = false;
    this.hints = [
      ['LMB', 'Grab (hold)'],
      ['Wheel', 'Push / pull'],
      ['Stand on it', 'Grab + look down to fly'],
      ['E + Mouse', 'Rotate held prop'],
      ['RMB', 'Freeze while holding'],
      ['R', 'Unfreeze aimed prop'],
    ];
    game.events.on('propRemoved', (p) => { if (this.held?.prop === p) this.release(true); });
  }

  yawQuat() {
    return _q.setFromAxisAngle(UP, this.game.player.yaw).clone();
  }

  primaryDown() {
    const g = this.game;
    const hit = g.aimHit();
    if (!hit?.prop) { g.sfx.play('error'); return; }
    const prop = hit.prop;
    if (prop.frozen) {
      g.sandbox.setFrozen(prop, false);
      g.sfx.play('unfreeze');
    }
    const t = prop.body.translation();
    const r = new THREE.Quaternion().copy(prop.body.rotation());
    const local = hit.point.clone().sub(t).applyQuaternion(r.clone().invert());
    const rel = this.yawQuat().invert().multiply(r); // body rotation relative to player yaw
    this.held = { prop, local, dist: Math.max(hit.distance, 0.8), rel };
    prop.body.setGravityScale(0, true);
    prop.body.wakeUp();
    g.heldProp = prop;
    g.sandbox.setHighlight(prop, this.color);
    g.sfx.play('grab');
    g.sfx.setHum(true);
  }

  primaryUp() { this.release(); }

  release(silent = false) {
    const g = this.game;
    if (!this.held) return;
    const p = this.held.prop;
    if (g.sandbox.props.has(p)) {
      p.body.setGravityScale(1, true);
      // Cap the throw so flicks don't launch things into orbit.
      const v = p.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 25) p.body.setLinvel({ x: (v.x / sp) * 25, y: (v.y / sp) * 25, z: (v.z / sp) * 25 }, true);
      g.sandbox.setHighlight(p, null);
    }
    this.held = null;
    this.rotating = false;
    g.heldProp = null;
    g.sfx.setHum(false);
    if (!silent) g.sfx.play('drop');
  }

  secondaryDown() {
    const g = this.game;
    if (!this.held) return;
    const p = this.held.prop;
    this.release(true);
    // Freeze the whole welded group so contraptions stay put as one piece.
    for (const q of g.sandbox.group(p)) g.sandbox.setFrozen(q, true);
    g.effects.sparks(p.mesh.position, new THREE.Vector3(0, 1, 0), 0x9fd8ff, 24, 3, 0.3);
    g.sfx.play('freeze');
    g.hud.toast('Frozen', this.color);
  }

  wheel(dy) {
    if (!this.held) return false;
    this.held.dist = THREE.MathUtils.clamp(this.held.dist * (dy > 0 ? 0.9 : 1.11), 0.8, 80);
    return true;
  }

  key(code) {
    if (code === 'KeyR' && !this.held) {
      const g = this.game;
      const hit = g.aimHit();
      if (hit?.prop?.frozen) {
        let n = 0;
        for (const q of g.sandbox.group(hit.prop)) if (q.frozen) { g.sandbox.setFrozen(q, false); n++; }
        g.sfx.play('unfreeze');
        g.hud.toast(n > 1 ? `Unfroze ${n} props` : 'Unfrozen', this.color);
      }
      return true;
    }
    return false;
  }

  // Returns true when the tool wants the mouse (E held while carrying).
  wantsMouse(keys) {
    this.rotating = !!this.held && keys.has('KeyE');
    return this.rotating;
  }

  mouse(dx, dy) {
    if (!this.held) return;
    const s = 0.006;
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, dx * s);
    // pitch around the player's right axis, expressed in yaw-relative space = +X
    const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * s);
    this.held.rel.premultiply(yaw).premultiply(pitch).normalize();
  }

  update(dt) {
    const g = this.game;
    g.viewmodel.gripTarget = this.held ? 1 : 0;
    if (!this.held) { g.effects.setBeam(false); return; }
    const { prop, local, dist, rel } = this.held;
    if (!g.sandbox.props.has(prop)) { this.release(true); return; }
    const body = prop.body;

    const { origin, dir } = g.aim();
    const targetRot = this.yawQuat().multiply(rel);
    const grabTarget = origin.clone().addScaledVector(dir, dist);
    const centerTarget = grabTarget.clone().sub(local.clone().applyQuaternion(targetRot));

    const t = body.translation();
    const err = _v.set(centerTarget.x - t.x, centerTarget.y - t.y, centerTarget.z - t.z);
    const errLen = err.length();
    const vel = err.multiplyScalar(14);
    const maxV = 45;
    if (vel.length() > maxV) vel.setLength(maxV);
    body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);

    const cur = new THREE.Quaternion().copy(body.rotation());
    const dq = targetRot.clone().multiply(cur.clone().invert());
    if (dq.w < 0) { dq.x *= -1; dq.y *= -1; dq.z *= -1; dq.w *= -1; }
    const angle = 2 * Math.acos(Math.min(dq.w, 1));
    const s = Math.sqrt(1 - dq.w * dq.w);
    if (s > 1e-4) {
      const k = Math.min(angle * 12, 25);
      body.setAngvel({ x: (dq.x / s) * k, y: (dq.y / s) * k, z: (dq.z / s) * k }, true);
    } else {
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    // Beam: from the gripper, bending toward where you're looking, landing on the grab point.
    const r = new THREE.Quaternion().copy(body.rotation());
    const tr = body.translation();
    const grabWorld = local.clone().applyQuaternion(r).add(new THREE.Vector3(tr.x, tr.y, tr.z));
    const from = g.muzzle();
    const ctrl = origin.clone().addScaledVector(dir, from.distanceTo(grabWorld) * 0.55);
    g.effects.setBeam(true, from, grabWorld, ctrl, this.color, performance.now() / 1000);
    g.sfx.setHum(true, 1 + Math.min(errLen * 0.3, 0.6));
  }

  deactivate() {
    this.release(true);
    this.game.effects.setBeam(false);
  }
}
