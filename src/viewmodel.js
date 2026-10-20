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

    // Key points in model space (measured from the asset): mount plate, wrist joint, gripper tip.
    this.pivotPt = new THREE.Vector3(8.43, 2.8, 0);
    this.wristPt = new THREE.Vector3(8.28, 1.53, -0.25);
    const tip = (this.tipPt = new THREE.Vector3(7.76, 1.57, -1.06));

    const align = new THREE.Group();
    model.position.copy(tip).negate(); // gripper tip sits at the align origin
    align.add(model);
    this.base.add(align);
    this.align = align;
    this.model = model;
    this.setPose();

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

  // Holds the arm like a tool: the gripper points at the crosshair and the rest of the
  // arm trails back toward the bottom-right corner of the screen, out of view.
  setPose({
    aim = [-0.1, 0.07, -1], // where the gripper points (camera space)
    trail = [0.85, -1, 0], // screen direction the arm body runs off toward
    roll = 0, // extra twist around the gripper axis
    tipPos = [0.21, -0.17, -0.45], // gripper tip position (camera space)
    size = 0.85, // camera-space distance from tip to mount plate
  } = {}) {
    const g = this.tipPt.clone().sub(this.wristPt).normalize(); // gripper axis
    const back = this.pivotPt.clone().sub(this.tipPt);
    const e2 = back.clone().addScaledVector(g, -back.dot(g)).normalize();
    const e3 = new THREE.Vector3().crossVectors(g, e2);
    const f1 = new THREE.Vector3(...aim).normalize();
    const d = new THREE.Vector3(...trail);
    const f2 = d.addScaledVector(f1, -d.dot(f1)).normalize();
    const f3 = new THREE.Vector3().crossVectors(f1, f2);
    const src = new THREE.Matrix4().makeBasis(g, e2, e3);
    const dst = new THREE.Matrix4().makeBasis(f1, f2, f3);
    const m = dst.multiply(src.transpose());
    this.align.quaternion.setFromRotationMatrix(m);
    this.align.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(f1, roll));
    this.align.scale.setScalar(size / this.pivotPt.distanceTo(this.tipPt));
    this.base.position.set(...tipPos);
  }

  setColor(hex) {
    this.color.set(hex);
    this.glow.material.color.set(hex);
    this.glowLight.color.set(hex);
  }

  kick(amount = 1) { this.recoil = Math.min(this.recoil + amount, 1.6); }
  land() { this.landKick = 1; }

  // Show an item (a fresh mesh) clamped in the gripper, or nothing.
  setHeld(mesh, size = 0.17, rot = null, push = 0) {
    this.heldPush = push;
    if (this.held) { this.held.removeFromParent(); this.held = null; }
    if (!mesh) { this.gripTarget = 0; return; }
    const sizeTarget = size;
    const box = new THREE.Box3().setFromObject(mesh);
    size = box.getSize(new THREE.Vector3());
    const holder = new THREE.Group();
    mesh.position.sub(box.getCenter(new THREE.Vector3()));
    holder.add(mesh);
    holder.scale.setScalar(sizeTarget / Math.max(size.x, size.y, size.z, 0.05));
    if (rot) holder.rotation.set(...rot); else holder.rotation.set(0.25, -0.5, 0.1);
    mesh.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.scene.add(holder);
    this.held = holder;
    this.gripTarget = 0.75;
    this.switchAnim = 0.5;
  }
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
    const pulse = 0.05 + Math.sin(this.time * 8) * 0.006 + this.recoil * 0.04 + this.grip * 0.025;
    this.glow.scale.setScalar(this.held ? 0.02 : pulse);
    if (this.held) {
      // hang just in front of the gripper, swinging gently with the arm
      const fwd = new THREE.Vector3(-0.05, -0.04, -0.09).applyEuler(this.rig.rotation);
      if (this.heldPush) this.held.position.copy(tp).add(new THREE.Vector3(0.012, -0.03, -this.heldPush).applyEuler(this.rig.rotation)); // a gun sits in the grip
      else this.held.position.copy(tp).add(fwd);
      this.held.rotation.z = (this.heldPush ? 0 : 0.1) + this.sway.x * 2;
    }
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
