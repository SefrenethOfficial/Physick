import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildFigure } from './figure.js';
import { LAND_Y, nearestLandPoint } from './world.js';

// Falling out of the sky (after ejecting from a jet): freefall, then the parachute. Seen from
// behind, in third person.
//   freefall: WASD to drift and the mouse to turn; SPACE opens the parachute
//   parachute: A/D (or the mouse) to turn, W to dive faster, S to flare (slow right down)
// Hit the ground in freefall and that's it. Under the canopy you land on your feet.

const G = 9.81;

export class Skydive {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.camPos = new THREE.Vector3();
  }

  start(pos, vel) {
    const g = this.game;
    this.clear();
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
    g.hud.toast('Ejected! SPACE to open your parachute', 0xffd166);
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
    if (this.chute === 0) {
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
    if (gy === null && this.pos.y <= water + 0.3) { this.land(new THREE.Vector3(this.pos.x, water, this.pos.z), true); return; }
    // the figure: spread-eagled in freefall, hanging upright under the canopy
    const f = this.fig, P = f.parts;
    f.root.position.copy(this.pos);
    const ff = 1 - this.chute;
    f.root.rotation.set(-Math.PI / 2 * ff * 0.95, this.heading + Math.PI, 0, 'YXZ');
    P.armLPivot.rotation.set(0, 0, -(1.3 * ff + 2.6 * (1 - ff)) + Math.sin(this.t * 7) * 0.05 * ff);
    P.armRPivot.rotation.set(0, 0, 1.3 * ff + 2.6 * (1 - ff) - Math.sin(this.t * 7) * 0.05 * ff);
    P.legLPivot.rotation.set(0.3 * ff, 0, -0.35 * ff); P.legRPivot.rotation.set(0.3 * ff, 0, 0.35 * ff);
    this.canopy.position.copy(this.pos);
    this.canopy.rotation.set(0, this.heading, -turn * 0.25 * this.chute);
    // the body follows (so the police, the map and multiplayer know where you are)
    g.shorePlayer.body.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true);
    g.shorePlayer.yaw = this.heading;
    if (Math.random() < dt * 30 * ff && this.vel.length() > 30) g.fx.emit(this.pos.clone(), this.vel.clone().multiplyScalar(-0.05), 0xffffff, 0.3, 0, 0.3);
  }

  land(at, water) {
    const g = this.game;
    const vy = -this.vel.y, chute = this.chute > 0.6;
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
      if (chute) { g.sfx.play('thud'); g.hud.toast('Touchdown', 0x7be08a); }
      else { g.sfx.play('crash'); g.health.damage(vy > 18 ? 1000 : vy * 3, 'fall'); }
    }
    g.story?.fallout?.onLanded?.(chute);
  }

  clear() {
    this.active = false;
    if (this.fig) { this.fig.root.removeFromParent(); this.fig = null; }
    if (this.canopy) { this.canopy.removeFromParent(); this.canopy = null; }
  }

  cameraPose(camera, dt) {
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const want = this.pos.clone().addScaledVector(fwd, -9 - this.chute * 4).add(new THREE.Vector3(0, 3 + this.chute * 4, 0));
    this.camPos.lerp(want, Math.min(1, dt * 4));
    camera.position.copy(this.camPos);
    camera.lookAt(this.pos.clone().add(new THREE.Vector3(0, this.chute * 2.5, 0)).addScaledVector(fwd, 4));
  }
}
