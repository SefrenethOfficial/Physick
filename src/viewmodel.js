import * as THREE from 'three';

// Your right arm in first person: a jacket sleeve, a wrist with a watch, and a hand whose
// fingers curl round whatever you're holding. Rendered in its own scene and camera on top of
// the world so it never clips into walls.

const SKIN = 0xd9a47c;

function capsule(r, len, mat) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.rotateX(Math.PI / 2); // lie along z
  g.translate(0, 0, -len / 2); // grow towards -z from the joint
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

export class Viewmodel {
  constructor(_unused, fov) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 20);
    this.scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x4a4136, 1.5));
    const key = new THREE.DirectionalLight(0xfff1dd, 2.2);
    key.position.set(1, 2, 1.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc3ff, 0.9);
    rim.position.set(-2, 0.5, -1);
    this.scene.add(rim);

    this.rig = new THREE.Group(); // animated (bob/sway/recoil)
    this.scene.add(this.rig);
    this.base = new THREE.Group(); // the wrist, in camera space
    this.rig.add(this.base);

    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.65 });
    const sleeveM = new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.9 });
    const cuffM = new THREE.MeshStandardMaterial({ color: 0x1f252e, roughness: 0.95 });
    const strapM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const faceM = new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: 0.8, roughness: 0.25 });

    // local frame at the wrist: fingers point along -z, the palm faces -x (towards the middle of
    // the screen), the thumb is on top (+y); the forearm runs back along +z
    const arm = (this.arm = new THREE.Group());
    this.base.add(arm);
    // forearm and sleeve
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.12, 14), skin);
    fore.rotation.x = Math.PI / 2; fore.position.z = 0.05;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.056, 0.55, 16), sleeveM);
    sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.36;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 16), cuffM);
    cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.095;
    // a wristwatch
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.0315, 0.0315, 0.016, 14), strapM);
    strap.rotation.x = Math.PI / 2; strap.position.z = 0.03;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 16), faceM);
    face.rotation.z = Math.PI / 2; face.position.set(0.032, 0, 0.03);
    // palm: slightly flattened, with the heel of the hand rounded off
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin);
    palm.scale.set(0.019, 0.043, 0.054); palm.position.set(0, 0, -0.048);
    const heel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin);
    heel.scale.set(0.6, 1.25, 1); heel.position.set(0, -0.004, -0.008);
    const knuck = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.05, 4, 10), skin);
    knuck.position.set(0.002, 0, -0.088);
    for (const m of [fore, sleeve, cuff, strap, face, palm, heel, knuck]) { m.frustumCulled = false; arm.add(m); }

    // fingers: two segments each, hinged so they curl towards the palm (-x)
    this.fingers = [];
    const fdefs = [[0.028, 0.044, 0.034], [0.009, 0.048, 0.036], [-0.01, 0.045, 0.034], [-0.028, 0.036, 0.028]];
    for (const [y, l1, l2] of fdefs) {
      const k = new THREE.Group(); k.position.set(0.002, y, -0.09);
      const s1 = capsule(0.0085, l1, skin); k.add(s1);
      const j = new THREE.Group(); j.position.z = -l1; k.add(j);
      const s2 = capsule(0.0078, l2, skin); j.add(s2);
      arm.add(k);
      this.fingers.push({ k, j, phase: Math.random() * 6 });
    }
    // thumb: from the side of the palm, up and forward
    const tb = (this.thumb = new THREE.Group());
    tb.position.set(-0.012, 0.03, -0.02);
    tb.rotation.set(0.5, 0.55, 0);
    tb.add(capsule(0.0105, 0.036, skin));
    const tj = (this.thumbTip = new THREE.Group()); tj.position.z = -0.036; tb.add(tj);
    tj.add(capsule(0.0095, 0.03, skin));
    arm.add(tb);

    // where held things sit: inside the curl of the fingers
    this.tip = new THREE.Object3D();
    this.tip.position.set(-0.03, 0.004, -0.085);
    arm.add(this.tip);

    this.setPose();
    this.recoil = 0;
    this.landKick = 0;
    this.sway = new THREE.Vector2();
    this.grip = 0;
    this.gripTarget = 0;
    this.time = 0;
    this.switchAnim = 0;
  }

  // Rest pose: the hand low on the right, reaching forward and a little in towards the crosshair.
  setPose({ wrist = [0.21, -0.215, -0.42], aim = [-0.24, 0.17, -1], roll = -0.75, scale = 1.2 } = {}) {
    this.base.position.set(...wrist);
    this.base.scale.setScalar(scale);
    const d = new THREE.Vector3(...aim).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), roll));
    this.base.quaternion.copy(q);
  }

  setColor() { /* a hand doesn't glow */ }
  kick(amount = 1) { this.recoil = Math.min(this.recoil + amount, 1.6); }
  land() { this.landKick = 1; }

  // Show an item (a fresh mesh) in the hand, or nothing.
  setHeld(mesh, size = 0.17, rot = null, push = 0) {
    this.heldPush = push;
    if (this.held) { this.held.removeFromParent(); this.held = null; }
    if (!mesh) { this.gripTarget = 0; return; }
    const sizeTarget = size;
    const box = new THREE.Box3().setFromObject(mesh);
    const sz = box.getSize(new THREE.Vector3());
    const holder = new THREE.Group();
    mesh.position.sub(box.getCenter(new THREE.Vector3()));
    holder.add(mesh);
    holder.scale.setScalar(sizeTarget / Math.max(sz.x, sz.y, sz.z, 0.05));
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

  update(dt, player, mouseDX, mouseDY) {
    this.time += dt;
    // sway lags behind the mouse
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
      this.recoil * 0.05,
    );
    this.rig.rotation.set(this.recoil * 0.1 + sw * 0.4, this.sway.x * 1.5, -bobX * 2);

    // fingers: relaxed and a little loose when empty, wrapped round whatever you're holding,
    // a fist when punching
    this.grip += (this.gripTarget - this.grip) * Math.min(dt * 12, 1);
    const g = Math.max(this.grip, this.held ? 0.75 : 0, Math.min(this.recoil, 1) * (this.held ? 0 : 1));
    for (const [i, f] of this.fingers.entries()) {
      const idle = Math.sin(this.time * 1.3 + f.phase) * 0.04;
      const spread = (1.5 - i) * 0.05 * (1 - g);
      f.k.rotation.set(spread, 0.4 + i * 0.06 + g * 1.1 + idle, 0);
      f.j.rotation.set(0, 0.45 + g * 1.05 + idle * 0.5, 0);
    }
    this.thumb.rotation.set(0.5 - g * 0.15, 0.55 + g * 0.35, 0);
    this.thumbTip.rotation.set(0, 0.2 + g * 0.5, 0);

    this.scene.updateMatrixWorld(true);
    if (this.held) {
      const tp = this.tipPosition();
      if (this.heldPush) this.held.position.copy(tp).add(new THREE.Vector3(0.006, 0.01, -this.heldPush).applyEuler(this.rig.rotation)); // a gun sits in the grip
      else this.held.position.copy(tp).add(new THREE.Vector3(-0.02, 0.0, -0.03).applyEuler(this.rig.rotation));
      this.held.rotation.z = (this.heldPush ? 0 : 0.1) + this.sway.x * 2;
    }
  }

  // The grip point in viewmodel-camera space (camera sits at the origin looking down -Z).
  tipPosition() {
    return this.tip.getWorldPosition(new THREE.Vector3());
  }

  // Same point expressed in the main world, given the world camera.
  tipWorld(worldCamera) {
    return worldCamera.localToWorld(this.tipPosition());
  }
}
