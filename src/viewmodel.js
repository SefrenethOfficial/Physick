import * as THREE from 'three';
import { GLOW } from './effects.js';

// The robot arm you hold in first person. Rendered in its own scene and camera
// on top of the world so it never clips into walls.
export class Viewmodel {
  constructor(gltfScene, fov) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 20);
    this.scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x4a4136, 1.6));
    const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
    key.position.set(1, 2, 1.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc3ff, 1.2);
    rim.position.set(-2, 0.5, -1);
    this.scene.add(rim);

    this.rig = new THREE.Group(); // animated (bob/sway/recoil)
    this.scene.add(this.rig);
    this.base = new THREE.Group(); // rest pose in camera space
    this.rig.add(this.base);

    const model = gltfScene.clone(true);
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); }
    });
    const find = (prefix) => {
      let r = null;
      model.traverse((o) => { if (!r && o.name.startsWith(prefix)) r = o; });
      return r;
    };
    this.bones = {
      b1: find('Bone.001'), b2: find('Bone.002'), b3: find('Bone.003'), b4: find('Bone.004'), b5: find('Bone.005'),
    };
    for (const b of Object.values(this.bones)) if (b) b.userData.rest = b.quaternion.clone();

    // Mount plate centre and gripper tip in model space (measured from the asset).
    const pivot = new THREE.Vector3(8.43, 2.8, 0);
    const tip = new THREE.Vector3(7.88, 1.57, -1.08);
    const dir = tip.clone().sub(pivot).normalize();
    const length = tip.distanceTo(pivot);

    const align = new THREE.Group();
    model.position.copy(pivot).negate();
    align.add(model);
    // Point the arm's reach direction straight forward and slightly in toward the crosshair.
    const forward = new THREE.Vector3(-0.22, 0.12, -1).normalize();
    align.quaternion.setFromUnitVectors(dir, forward);
    // Roll around the reach axis so the gripper reads well from the player's view.
    align.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(forward, this.roll = 2.2));
    const scale = 0.62 / length;
    align.scale.setScalar(scale);
    this.base.add(align);
    this.base.position.set(0.3, -0.36, -0.12);
    this.align = align;
    this.model = model;

    // Tip anchor follows the last bone so the beam starts at the gripper even while animating.
    this.tip = new THREE.Object3D();
    const host = this.bones.b5 || model;
    this.scene.updateMatrixWorld(true);
    this.tip.position.copy(host.worldToLocal(model.localToWorld(tip.clone())));
    host.add(this.tip);

    // Emitter glow at the gripper.
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x39a7ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.scale.setScalar(0.09);
    this.scene.add(this.glow);
    this.glowLight = new THREE.PointLight(0x39a7ff, 0.6, 0.8);
    this.scene.add(this.glowLight);

    this.recoil = 0;
    this.landKick = 0;
    this.sway = new THREE.Vector2();
    this.grip = 0;
    this.gripTarget = 0;
    this.color = new THREE.Color(0x39a7ff);
    this.time = 0;
    this.switchAnim = 0;
  }

  setColor(hex) {
    this.color.set(hex);
    this.glow.material.color.set(hex);
    this.glowLight.color.set(hex);
  }

  kick(amount = 1) { this.recoil = Math.min(this.recoil + amount, 1.6); }
  land() { this.landKick = 1; }
  switched() { this.switchAnim = 1; }

  resize(aspect, fov) {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  update(dt, player, mouseDX, mouseDY, firing) {
    this.time += dt;
    // Sway lags behind the mouse.
    this.sway.x += (-mouseDX * 0.0006 - this.sway.x) * Math.min(dt * 10, 1);
    this.sway.y += (mouseDY * 0.0006 - this.sway.y) * Math.min(dt * 10, 1);
    this.sway.clampScalar(-0.06, 0.06);

    const moving = Math.min(player.speedNow / 6, 1.5) * (player.grounded ? 1 : 0.2);
    const ph = player.walkPhase;
    const bobX = Math.sin(ph) * 0.012 * moving;
    const bobY = Math.abs(Math.cos(ph)) * 0.014 * moving;
    const breathe = Math.sin(this.time * 1.6) * 0.004;

    this.recoil = Math.max(this.recoil - dt * 7, 0);
    this.landKick = Math.max(this.landKick - dt * 4, 0);
    this.switchAnim = Math.max(this.switchAnim - dt * 3.5, 0);
    const sw = Math.sin(this.switchAnim * Math.PI);

    this.rig.position.set(
      this.sway.x + bobX,
      this.sway.y - bobY + breathe - this.landKick * 0.03 - sw * 0.2,
      this.recoil * 0.06,
    );
    this.rig.rotation.set(this.recoil * 0.12 + sw * 0.4, this.sway.x * 1.5, -bobX * 2);

    // Gripper/joint animation: a little life on idle, curls when grabbing or welding.
    this.grip += (this.gripTarget - this.grip) * Math.min(dt * 10, 1);
    const b = this.bones;
    const wig = Math.sin(this.time * 2.1) * 0.03;
    const ax = new THREE.Vector3(1, 0, 0);
    const set = (bone, angle) => {
      if (!bone) return;
      bone.quaternion.copy(bone.userData.rest).multiply(new THREE.Quaternion().setFromAxisAngle(ax, angle));
    };
    set(b.b3, wig * 0.5 + this.grip * 0.12);
    set(b.b4, -wig * 0.6 - this.grip * 0.18);
    set(b.b5, wig + this.grip * 0.35 + (firing ? Math.sin(this.time * 60) * 0.03 : 0));

    this.scene.updateMatrixWorld(true);
    const tp = this.tipPosition();
    this.glow.position.copy(tp);
    this.glowLight.position.copy(tp);
    const pulse = 0.08 + Math.sin(this.time * 8) * 0.01 + this.recoil * 0.06 + this.grip * 0.04;
    this.glow.scale.setScalar(pulse);
  }

  // Gripper tip in viewmodel-camera space (camera sits at the origin looking down -Z).
  tipPosition() {
    return this.tip.getWorldPosition(new THREE.Vector3());
  }

  // Same point expressed in the main world, given the world camera.
  tipWorld(worldCamera) {
    const p = this.tipPosition();
    return worldCamera.localToWorld(p);
  }
}
