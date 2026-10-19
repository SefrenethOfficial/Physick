import * as THREE from 'three';
import { GLOW } from './effects.js';

// Manning the ship's guns, the rounds they fire (in world space, over the ocean),
// splashes and explosions, and the floating target rafts you shoot at.

const G = 9.81;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ---------------------------------------------------------------- world effects
class WorldFx {
  constructor(scene) {
    this.scene = scene;
    this.max = 1400;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.parts = Array.from({ length: this.max }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), g: 1, drag: 0 }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.4, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    this.flashes = [];
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.8, 1.0, 32);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  emit(p, v, color, life, g = 1, drag = 0) {
    const q = this.parts[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    q.p.copy(p); q.v.copy(v); q.c.set(color); q.max = q.life = life; q.g = g; q.drag = drag;
  }

  splash(p, big) {
    const n = big ? 90 : 10;
    const up = big ? 16 : 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * (big ? 3.5 : 0.8);
      _v.set(Math.cos(a) * r, up * (0.4 + Math.random() * 0.8), Math.sin(a) * r);
      this.emit(p, _v, 0xdfe9f0, 1.2 + Math.random() * (big ? 1.2 : 0.3), 1, 0.4);
    }
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.copy(p);
    ring.position.y += 0.15;
    ring.userData = { life: big ? 2.5 : 0.8, max: big ? 2.5 : 0.8, grow: big ? 9 : 3 };
    this.scene.add(ring);
    this.rings.push(ring);
  }

  explosion(p) {
    for (let i = 0; i < 160; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 22);
      const c = Math.random() < 0.5 ? 0xff9a2a : Math.random() < 0.5 ? 0xffd166 : 0xff4a1a;
      this.emit(p, _v, c, 0.6 + Math.random() * 1.1, 0.6, 1.2);
    }
    this.flash(p, 0xffb060, 28, 0.35);
    this.splash(p, true);
  }

  flash(p, color, size, life) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.position.copy(p);
    s.scale.setScalar(size);
    s.userData = { life, max: life, size };
    this.scene.add(s);
    this.flashes.push(s);
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const q = this.parts[i];
      if (q.life > 0) {
        q.life -= dt;
        q.v.y -= G * q.g * dt;
        q.v.multiplyScalar(1 - Math.min(q.drag * dt, 0.5));
        q.p.addScaledVector(q.v, dt);
        const f = Math.max(q.life / q.max, 0);
        this.col[i * 3] = q.c.r * f; this.col[i * 3 + 1] = q.c.g * f; this.col[i * 3 + 2] = q.c.b * f;
      } else {
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        q.p.set(0, -9999, 0);
      }
      this.pos[i * 3] = q.p.x; this.pos[i * 3 + 1] = q.p.y; this.pos[i * 3 + 2] = q.p.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const s of [...this.flashes]) {
      s.userData.life -= dt;
      const f = Math.max(s.userData.life / s.userData.max, 0);
      s.material.opacity = f;
      s.scale.setScalar(s.userData.size * (1.4 - f * 0.4));
      if (f <= 0) { s.removeFromParent(); s.material.dispose(); this.flashes.splice(this.flashes.indexOf(s), 1); }
    }
    for (const r of [...this.rings]) {
      r.userData.life -= dt;
      const f = Math.max(r.userData.life / r.userData.max, 0);
      r.material.opacity = f * 0.7;
      r.scale.setScalar(1 + (1 - f) * r.userData.grow);
      if (f <= 0) { r.removeFromParent(); r.material.dispose(); this.rings.splice(this.rings.indexOf(r), 1); }
    }
  }
}

// ---------------------------------------------------------------- targets
function targetMesh() {
  const g = new THREE.Group();
  const pontoon = new THREE.Mesh(new THREE.BoxGeometry(4, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0x2d3238, roughness: 0.8 }));
  g.add(pontoon);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#f2f2ee' : '#e0321e'; x.fillRect(i * 32, j * 32, 32, 32); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const panelM = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, side: THREE.DoubleSide });
  for (const ry of [0, Math.PI / 2]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), panelM);
    p.position.y = 2.05;
    p.rotation.y = ry;
    g.add(p);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  pole.position.y = 4.6;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), new THREE.MeshStandardMaterial({ color: 0xffd166, side: THREE.DoubleSide, emissive: 0x332200 }));
  flag.position.set(0.5, 5.4, 0);
  g.add(pole, flag);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

class Targets {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.count = 7;
    this.destroyed = 0;
  }

  spawn() {
    const ship = this.game.ship;
    // mostly ahead and off the bows, 250-900 m out
    const ang = ship.heading + (Math.random() - 0.5) * Math.PI * 1.4;
    const r = 250 + Math.random() * 650;
    const mesh = targetMesh();
    mesh.position.set(ship.pos.x - Math.sin(ang) * r, 0, ship.pos.z - Math.cos(ang) * r);
    mesh.rotation.y = Math.random() * 6;
    this.game.scene.add(mesh);
    this.list.push({ mesh, hp: 100, sinking: 0, spin: Math.random() * 6 });
  }

  update(dt) {
    const ocean = this.game.ocean, ship = this.game.ship;
    while (this.list.filter((t) => !t.sinking).length < this.count) this.spawn();
    for (const t of [...this.list]) {
      const p = t.mesh.position;
      const h = ocean.heightAt(p.x, p.z);
      if (t.sinking) {
        t.sinking += dt;
        p.y = h - t.sinking * 1.6;
        t.mesh.rotation.x = Math.min(t.sinking * 0.25, 0.9);
        if (t.sinking > 5) this.remove(t);
        continue;
      }
      p.y = h + 0.1;
      const hx = ocean.heightAt(p.x + 2, p.z) - ocean.heightAt(p.x - 2, p.z);
      const hz = ocean.heightAt(p.x, p.z + 2) - ocean.heightAt(p.x, p.z - 2);
      t.mesh.rotation.x = hz * 0.2;
      t.mesh.rotation.z = -hx * 0.2;
      // left far behind? move it out ahead again
      if (Math.hypot(p.x - ship.pos.x, p.z - ship.pos.z) > 1400) this.remove(t);
    }
  }

  remove(t) {
    t.mesh.removeFromParent();
    this.list.splice(this.list.indexOf(t), 1);
  }

  // Returns the target hit (if any) by a round at p with blast radius r.
  hitTest(p, r) {
    for (const t of this.list) {
      if (t.sinking) continue;
      const m = t.mesh.position;
      const dx = p.x - m.x, dz = p.z - m.z, dy = p.y - (m.y + 1.8);
      if (dx * dx + dz * dz < (r + 2.4) ** 2 && Math.abs(dy) < r + 2.6) return t;
    }
    return null;
  }

  damage(t, amount, p) {
    t.hp -= amount;
    if (t.hp <= 0 && !t.sinking) {
      t.sinking = 0.001;
      this.destroyed++;
      this.game.fx.explosion(t.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
      this.game.sfx.play('explosion');
      this.game.hud.toast(`Target destroyed! (${this.destroyed})`, 0xffd166);
      this.game.hud.setScore(this.destroyed);
    } else {
      this.game.fx.flash(p, 0xffc070, 3, 0.15);
    }
  }
}

// ---------------------------------------------------------------- rounds
class Rounds {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.shellMat = new THREE.SpriteMaterial({ map: GLOW, color: 0xffc27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.bulletMat = new THREE.SpriteMaterial({ map: GLOW, color: 0xff9a4a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  }

  fire(kind, pos, vel) {
    const s = new THREE.Sprite(kind === 'shell' ? this.shellMat : this.bulletMat);
    s.scale.setScalar(kind === 'shell' ? 1.6 : 0.9);
    s.position.copy(pos);
    this.game.scene.add(s);
    this.list.push({ kind, pos: pos.clone(), vel: vel.clone(), sprite: s, life: kind === 'shell' ? 40 : 4 });
  }

  update(dt) {
    const { ocean, targets, fx, sfx } = this.game;
    const cam = this.game.camera.position;
    for (const r of [...this.list]) {
      const steps = r.kind === 'shell' ? 2 : 3;
      let done = false;
      for (let k = 0; k < steps && !done; k++) {
        const h = dt / steps;
        r.vel.y -= G * h;
        r.pos.addScaledVector(r.vel, h);
        r.life -= h;
        const t = targets.hitTest(r.pos, r.kind === 'shell' ? 5 : 0.6);
        if (t) {
          targets.damage(t, r.kind === 'shell' ? 100 : 7, r.pos);
          if (r.kind === 'shell') fx.flash(r.pos, 0xffb060, 14, 0.25);
          done = true;
        } else if (r.pos.y < ocean.heightAt(r.pos.x, r.pos.z)) {
          const big = r.kind === 'shell';
          fx.splash(r.pos, big);
          if (big) {
            const d = r.pos.distanceTo(cam);
            if (d < 1500) sfx.play('splashFar');
          }
          done = true;
        } else if (r.life <= 0) done = true;
      }
      r.sprite.position.copy(r.pos);
      // keep tracers visible at range
      const d = r.pos.distanceTo(cam);
      r.sprite.scale.setScalar((r.kind === 'shell' ? 1.6 : 0.8) * Math.max(1, d / 120));
      if (done) {
        r.sprite.removeFromParent();
        this.list.splice(this.list.indexOf(r), 1);
      }
    }
  }
}

// ---------------------------------------------------------------- manning a gun
export class Gunnery {
  constructor(game) {
    this.game = game;
    this.fx = new WorldFx(game.scene);
    game.fx = this.fx;
    this.targets = new Targets(game);
    game.targets = this.targets;
    this.rounds = new Rounds(game);
    this.gun = null; // the gun being manned
    this.trigger = false;
    this.cooldown = 0;
    for (const gun of game.ship.guns) {
      gun.yawAngle = 0;
      gun.pitchAngle = gun.pitch0;
      gun.kick = 0;
      gun.pitch.rotation.x = gun.pitchAngle;
      gun.yaw.rotation.y = gun.yawCenter;
    }
  }

  get active() { return !!this.gun; }

  // Gun whose firing position you're standing at, if any.
  nearby() {
    const e = this.game.player.body.translation();
    let best = null, bd = 2.2;
    for (const gun of this.game.ship.guns) {
      const d = Math.hypot(e.x - gun.stand.x, e.z - gun.stand.z);
      if (d < bd && Math.abs(e.y - 0.85 - gun.stand.y) < 1.2) { bd = d; best = gun; }
    }
    return best;
  }

  man(gun) {
    this.gun = gun;
    this.trigger = false;
    this.game.hud.setMode('gun', gun);
    this.game.sfx.play('select');
  }

  leave() {
    if (!this.gun) return;
    this.gun = null;
    this.trigger = false;
    this.game.hud.setMode('deck');
  }

  aim(dx, dy) {
    const g = this.gun;
    if (!g) return;
    const s = g.kind === 'shell' ? 0.0016 : 0.0022;
    g.yawAngle = THREE.MathUtils.clamp(g.yawAngle - dx * s, -g.yawLimit, g.yawLimit);
    g.pitchAngle = THREE.MathUtils.clamp(g.pitchAngle - dy * s, g.pitchMin, g.pitchMax);
  }

  fire() {
    const g = this.gun;
    const game = this.game;
    g.muzzle.updateMatrixWorld(true);
    const pos = g.muzzle.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(g.muzzle.getWorldQuaternion(_q)).normalize();
    // small dispersion
    const spread = g.kind === 'shell' ? 0.002 : 0.006;
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    const ship = game.ship;
    const shipVel = new THREE.Vector3(-Math.sin(ship.heading), 0, -Math.cos(ship.heading)).multiplyScalar(ship.speed);
    this.rounds.fire(g.kind, pos, dir.clone().multiplyScalar(g.speed).add(shipVel));
    g.kick = 1;
    if (g.kind === 'shell') {
      this.fx.flash(pos.clone().addScaledVector(dir, 2), 0xffc070, 12, 0.18);
      for (let i = 0; i < 40; i++) {
        _v.copy(dir).multiplyScalar(8 + Math.random() * 20).add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6));
        this.fx.emit(pos, _v, 0x8a8a8a, 0.8 + Math.random(), -0.05, 2.5);
      }
      game.sfx.play('bigGun');
      game.shake = 1;
    } else {
      this.fx.flash(pos.clone().addScaledVector(dir, 0.4), 0xffb060, 1.6, 0.05);
      if (Math.random() < 0.5) game.sfx.play('ciws');
      game.shake = Math.max(game.shake || 0, 0.15);
    }
  }

  update(dt) {
    this.fx.update(dt);
    this.targets.update(dt);
    this.rounds.update(dt);
    for (const gun of this.game.ship.guns) {
      // ease the mount toward the commanded angles (big gun traverses slowly)
      const rate = gun.kind === 'shell' ? 0.9 : 3.5;
      const yawT = gun.yawCenter + gun.yawAngle;
      gun.yaw.rotation.y += THREE.MathUtils.clamp(yawT - gun.yaw.rotation.y, -rate * dt, rate * dt);
      gun.pitch.rotation.x += THREE.MathUtils.clamp(gun.pitchAngle - gun.pitch.rotation.x, -rate * dt, rate * dt);
      gun.kick = Math.max(gun.kick - dt * (gun.kind === 'shell' ? 2.5 : 18), 0);
      gun.recoil.position.z = gun.kick * (gun.kind === 'shell' ? 0.7 : 0.06);
    }
    this.cooldown -= dt;
    if (this.gun && this.trigger && this.cooldown <= 0) {
      this.fire();
      this.cooldown = this.gun.interval;
      if (this.gun.kind === 'shell') this.trigger = false; // one shot per click
    }
  }

  // Camera pose (ship frame) behind and above the manned mount, looking where it points.
  cameraPose(eye) {
    const g = this.gun;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw.rotation.y);
    const pos = g.cam.clone().applyQuaternion(yawQ).add(g.yaw.position);
    eye.position.copy(pos);
    eye.rotation.set(g.pitch.rotation.x - (g.kind === 'shell' ? 0.06 : 0.03), g.yaw.rotation.y, 0, 'YXZ');
  }
}
