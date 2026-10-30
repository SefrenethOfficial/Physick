import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildFigure } from './figure.js';
import { LAND_Y, nearestLandPoint } from './world.js';

// Falling out of the sky (after ejecting from a jet): freefall, then the parachute. Seen from
// behind, in third person.
//   freefall: WASD to drift and the mouse to turn; SPACE opens the parachute
//   parachute: A/D (or the mouse) to turn, W to dive faster, S to flare (slow right down)
// Hit the ground in freefall and that's it. Under the canopy you land on your feet.
// The same goes for a parachute you bought (open it as you fall: see airgear.js), and the hang
// glider: launch off somewhere high, mouse or A/D to bank, W to dive (speed), S to pull up (trade
// speed for height, but too slow and it stalls). Hot air comes up off the volcano: circle it to climb.

const G = 9.81;

export class Skydive {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.camPos = new THREE.Vector3();
  }

  start(pos, vel, { mode = 'freefall' } = {}) {
    const g = this.game;
    this.clear();
    this.glider = mode === 'glider';
    this.active = true;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.heading = Math.atan2(-vel.x, -vel.z) || g.shorePlayer.yaw;
    this.chute = 0; // 0 = freefall, opening → 1 = canopy open
    this.opening = false;
    this.t = 0;
    this.fig = buildFigure(g.style?.figureLook || { shirt: 0x2a303a, pants: 0x2c3440, skin: 0xd9a47c });
    g.scene.add(this.fig.root);
    this.canopy = this.buildCanopy();
    this.canopy.visible = false;
    g.scene.add(this.canopy);
    g.onShore = true;
    g.shorePlayer.collider.setEnabled(false);
    g.hud.setMode('deck');
    this.camPos.copy(this.pos).add(new THREE.Vector3(0, 4, 8));
    if (this.glider) {
      this.canopy.removeFromParent(); this.canopy = this.buildGlider(); g.scene.add(this.canopy);
      this.chute = 1; this.speed = Math.max(13, Math.hypot(vel.x, vel.z)); this.pitch = -0.1;
      g.hud.toast('Gliding! Mouse or A/D to bank · W dive · S pull up · hot air rises off the volcano', 0x9ec5ff);
    } else if (mode === 'chute') {
      this.opening = true; g.sfx.play('grab'); g.hud.toast('Parachute open: A/D steer · W dive · S flare', 0x9ec5ff);
    } else g.hud.toast('Ejected! SPACE to open your parachute', 0xffd166);
  }

  // a hang glider: a fabric delta wing on an aluminium frame, you hanging under it
  buildGlider() {
    const grp = new THREE.Group();
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -2.6, -5.2, -0.35, 1.4, 0, 0.25, 0.8, 0, 0, -2.6, 0, 0.25, 0.8, 5.2, -0.35, 1.4], 3));
    wing.computeVertexNormals();
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 4; i++) { x.fillStyle = ['#e8b830', '#c8201e', '#2a6ac8', '#f2f2ee'][i]; x.fillRect(i * 32, 0, 32, 64); }
    const t = new THREE.CanvasTexture(c);
    const uv = [0.5, 0, 0, 1, 0.5, 1, 0.5, 0, 0.5, 1, 1, 1]; wing.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const w = new THREE.Mesh(wing, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.7 })); w.position.y = 2.2; grp.add(w);
    const al = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.7, roughness: 0.3 });
    const tube = (a, b) => { const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, d.length(), 6), al); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); grp.add(m); };
    const k = new THREE.Vector3(0, 2.25, -0.2);
    tube(new THREE.Vector3(-0.7, 0.95, -0.5), new THREE.Vector3(0.7, 0.95, -0.5)); // the control bar
    tube(new THREE.Vector3(-0.7, 0.95, -0.5), k); tube(new THREE.Vector3(0.7, 0.95, -0.5), k);
    tube(new THREE.Vector3(0, 2.2, -2.6), new THREE.Vector3(0, 2.4, 0.8)); // the keel
    return grp;
  }

  buildCanopy() {
    const grp = new THREE.Group();
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f2f2ee' : '#d9483b'; x.fillRect(i * 32, 0, 32, 64); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const can = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
    can.scale.set(1.25, 0.55, 0.8); can.position.y = 4.6;
    grp.add(can);
    // rigging lines from the canopy's edge down to your shoulders
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 4.0 * 1.25, 4.6 + 0.9, Math.sin(a) * 4.0 * 0.8 * 0.85), new THREE.Vector3(Math.cos(a) * 0.15, 0.55, Math.sin(a) * 0.1)); }
    grp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
    return grp;
  }

  // the ground (or a roof) under a point, or null for open water
  groundAt(x, z, fromY) {
    const sb = this.game.portSandbox;
    const hit = sb.world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), 400, true, undefined, undefined, undefined, undefined, (col) => sb.staticColliders.has(col.handle));
    return hit ? fromY - hit.timeOfImpact : null;
  }

  update(dt, keys, mouseDX) {
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    this.heading -= (mouseDX || 0) * 0.0025;
    const turn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if ((keys.has('Space')) && !this.opening && this.chute === 0 && this.t > 0.4) { this.opening = true; g.sfx.play('grab'); g.hud.toast('Parachute open: A/D steer · W dive · S flare', 0x9ec5ff); }
    if (this.opening) { this.chute = Math.min(1, this.chute + dt * 1.6); this.canopy.visible = true; this.canopy.scale.setScalar(0.2 + this.chute * 0.8); }
    if (this.glider) {
      // the glider: pitch sets the trade between speed and sink; the volcano's hot air lifts you
      this.heading += turn * 0.85 * dt;
      const want = keys.has('KeyW') ? -0.38 : keys.has('KeyS') ? 0.28 : -0.085;
      this.pitch += (want - this.pitch) * Math.min(1, dt * 1.6);
      if (this.speed < 8.5) this.pitch = Math.min(this.pitch, -0.3); // (stalled: the nose drops)
      this.speed += (-G * Math.sin(this.pitch) - 0.0034 * this.speed * this.speed) * dt;
      this.speed = Math.max(4, Math.min(42, this.speed));
      const V = g.ridgeback?.peak, top = g.volcano?.ventTop ?? 0;
      let lift = 0;
      if (V) { const d = Math.hypot(this.pos.x - V.x, this.pos.z - V.z); lift = 5.5 * Math.max(0, 1 - d / 220) * (this.pos.y < top + 160 ? 1 : 0); }
      this.vel.set(fwd.x * this.speed * Math.cos(this.pitch), this.speed * Math.sin(this.pitch) + lift, fwd.z * this.speed * Math.cos(this.pitch));
      this.bank = (this.bank || 0) + (turn * 0.55 - (this.bank || 0)) * Math.min(1, dt * 3);
    } else if (this.chute === 0) {
      // freefall: belly down, drifting where you lean; air drag gives ~55 m/s
      const lean = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const slide = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const want = fwd.clone().multiplyScalar(lean * 14).addScaledVector(right, slide * 10);
      this.vel.x += (want.x - this.vel.x) * Math.min(1, dt * 0.6);
      this.vel.z += (want.z - this.vel.z) * Math.min(1, dt * 0.6);
      this.vel.y -= G * dt;
      this.vel.y -= Math.sign(this.vel.y) * this.vel.y * this.vel.y * 0.0032 * dt;
    } else {
      // under the canopy: a steady glide; S flares, W dives
      this.heading += turn * 0.9 * dt;
      const flare = keys.has('KeyS') ? 1 : 0, dive = keys.has('KeyW') ? 1 : 0;
      const glide = 9 + dive * 5 - flare * 6, sink = 5 + dive * 3 - flare * 2.5;
      const k = Math.min(1, dt * (1.5 + this.chute * 2));
      this.vel.x += (fwd.x * glide - this.vel.x) * k;
      this.vel.z += (fwd.z * glide - this.vel.z) * k;
      this.vel.y += (-sink - this.vel.y) * k;
    }
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    // touchdown
    const gy = this.groundAt(this.pos.x, this.pos.z, Math.max(prev.y, this.pos.y) + 2);
    const water = g.ocean.heightAt(this.pos.x, this.pos.z);
    if (gy !== null && this.pos.y <= gy + 0.85) { this.land(new THREE.Vector3(this.pos.x, gy, this.pos.z), false); return; }
    if (this.glider) { // into a cliff?
      const ahead = this.groundAt(this.pos.x + fwd.x * 1.5, this.pos.z + fwd.z * 1.5, this.pos.y + 3);
      if (ahead !== null && this.pos.y < ahead + 0.6) { this.land(new THREE.Vector3(this.pos.x, ahead, this.pos.z), false); return; }
    }
    if (gy === null && this.pos.y <= water + 0.3) { this.land(new THREE.Vector3(this.pos.x, water, this.pos.z), true); return; }
    // the figure: spread-eagled in freefall, hanging upright under the canopy
    const f = this.fig, P = f.parts;
    f.root.position.copy(this.pos);
    const ff = this.glider ? 1 : 1 - this.chute;
    f.root.rotation.set(-Math.PI / 2 * ff * 0.95 - (this.glider ? this.pitch : 0), this.heading + Math.PI, this.glider ? -this.bank : 0, 'YXZ');
    P.armLPivot.rotation.set(0, 0, -(1.3 * ff + 2.6 * (1 - ff)) + Math.sin(this.t * 7) * 0.05 * ff);
    P.armRPivot.rotation.set(0, 0, 1.3 * ff + 2.6 * (1 - ff) - Math.sin(this.t * 7) * 0.05 * ff);
    P.legLPivot.rotation.set(0.3 * ff, 0, -0.35 * ff); P.legRPivot.rotation.set(0.3 * ff, 0, 0.35 * ff);
    this.canopy.position.copy(this.pos);
    if (this.glider) { this.canopy.rotation.set(-this.pitch, this.heading, this.bank, 'YXZ'); this.canopy.position.y -= 0.6; }
    else this.canopy.rotation.set(0, this.heading, -turn * 0.25 * this.chute);
    // the body follows (so the police, the map and multiplayer know where you are)
    g.shorePlayer.body.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true);
    g.shorePlayer.yaw = this.heading;
    if (Math.random() < dt * 30 * ff && this.vel.length() > 30) g.fx.emit(this.pos.clone(), this.vel.clone().multiplyScalar(-0.05), 0xffffff, 0.3, 0, 0.3);
  }

  land(at, water) {
    const g = this.game;
    const vy = -this.vel.y, chute = this.chute > 0.6, glider = this.glider, fast = glider && this.speed > 19;
    this.clear();
    g.shorePlayer.collider.setEnabled(true);
    if (water) {
      g.sfx.play('splash');
      const lp = nearestLandPoint(at.x, at.z);
      g.placeOnShore(new THREE.Vector3(lp.x, LAND_Y + 1, lp.z), this.heading);
      g.hud.toast(chute ? 'Splashdown! You swim for the shore.' : 'You hit the water hard', chute ? 0x9ec5ff : 0xff8a6a);
      if (!chute) g.health.damage(vy > 40 ? 1000 : vy * 1.2, 'fall');
    } else {
      g.placeOnShore(new THREE.Vector3(at.x, at.y + 1.1, at.z), this.heading);
      if (glider) { if (fast) { g.sfx.play('crash'); g.health.damage((this.speed - 17) * 9, 'fall'); g.hud.toast('Crash landing!', 0xff8a6a); } else { g.sfx.play('thud'); g.hud.toast('Touchdown. The glider folds up into its bag.', 0x7be08a); } }
      else if (chute) { g.sfx.play('thud'); g.hud.toast('Touchdown', 0x7be08a); }
      else { g.sfx.play('crash'); g.health.damage(vy > 18 ? 1000 : vy * 3, 'fall'); }
    }
    g.story?.fallout?.onLanded?.(chute);
  }

  clear() {
    this.active = false;
    this.glider = false;
    if (this.fig) { this.fig.root.removeFromParent(); this.fig = null; }
    if (this.canopy) { this.canopy.removeFromParent(); this.canopy = null; }
  }

  cameraPose(camera, dt) {
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const want = this.pos.clone().addScaledVector(fwd, this.glider ? -11 : -9 - this.chute * 4).add(new THREE.Vector3(0, this.glider ? 4.5 : 3 + this.chute * 4, 0));
    this.camPos.lerp(want, Math.min(1, dt * 4));
    camera.position.copy(this.camPos);
    camera.lookAt(this.pos.clone().add(new THREE.Vector3(0, this.chute * 2.5, 0)).addScaledVector(fwd, 4));
  }
}
