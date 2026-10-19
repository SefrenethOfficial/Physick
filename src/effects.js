import * as THREE from 'three';

function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export const GLOW = glowSprite();

// Sparks, tracers, bullet holes, the Move-mode beam and weld markers.
export class Effects {
  constructor(scene) {
    this.scene = scene;

    // --- particles ---
    this.max = 800;
    this.pPos = new Float32Array(this.max * 3);
    this.pCol = new Float32Array(this.max * 3);
    this.parts = [];
    for (let i = 0; i < this.max; i++) this.parts.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), g: 1 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;

    // --- tracers ---
    this.tracers = [];
    const tgeo = new THREE.BoxGeometry(1, 1, 1);
    tgeo.translate(0, 0, -0.5);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.userData.life = 0;
      scene.add(m);
      this.tracers.push(m);
    }
    this.tracerIdx = 0;

    // --- bullet holes ---
    this.holes = [];
    this.holeGeo = new THREE.CircleGeometry(0.05, 10);
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x111111, polygonOffset: true, polygonOffsetFactor: -4, transparent: true, opacity: 0.85 });

    // --- beam (Move mode) ---
    this.beamN = 160;
    this.beamPos = new Float32Array(this.beamN * 3);
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(this.beamPos, 3));
    this.beam = new THREE.Points(bgeo, new THREE.PointsMaterial({
      size: 16, sizeAttenuation: false, map: GLOW, color: 0x39a7ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    scene.add(this.beam);
    this.beamCore = new THREE.Points(bgeo, new THREE.PointsMaterial({
      size: 6, sizeAttenuation: false, map: GLOW, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.beamCore.frustumCulled = false;
    this.beamCore.visible = false;
    scene.add(this.beamCore);

    this.markerGeo = new THREE.SphereGeometry(0.06, 12, 8);
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xffc928 });
  }

  sparks(point, normal, color = 0xffb347, count = 14, speed = 5, gravity = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this.parts[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      p.p.copy(point);
      p.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.6)
        .add(normal).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      p.max = p.life = 0.25 + Math.random() * 0.45;
      p.c.copy(c);
      p.g = gravity;
    }
  }

  tracer(from, to, color = 0xffc070, width = 0.025) {
    const m = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const len = from.distanceTo(to);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(width, width, len);
    m.material.color.set(color);
    m.material.opacity = 1;
    m.userData.life = 0.09;
    m.visible = true;
  }

  bulletHole(parent, worldPoint, worldNormal) {
    const m = new THREE.Mesh(this.holeGeo, this.holeMat);
    m.position.copy(worldPoint).addScaledVector(worldNormal, 0.003);
    m.lookAt(m.position.clone().add(worldNormal));
    parent.attach(m);
    this.holes.push(m);
    if (this.holes.length > 120) this.holes.shift().removeFromParent();
  }

  weldMarker(parent, localPoint) {
    const m = new THREE.Mesh(this.markerGeo, this.markerMat);
    m.position.copy(localPoint);
    // Undo parent scale so markers stay the same size on scaled models.
    parent.updateMatrixWorld(true);
    const s = new THREE.Vector3();
    parent.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    m.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    parent.add(m);
    return m;
  }

  setBeam(visible, from, to, ctrl, color, time = 0) {
    this.beam.visible = this.beamCore.visible = visible;
    if (!visible) return;
    this.beam.material.color.set(color);
    const n = this.beamN;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      // Points bunch up near the gripper, where the beam is closest to the camera.
      const u = i / (n - 1);
      const t = u * u;
      // quadratic bezier from -> ctrl -> to
      a.copy(from).lerp(ctrl, t);
      b.copy(ctrl).lerp(to, t);
      a.lerp(b, t);
      const wob = Math.sin(t * 18 - time * 22) * 0.02 * Math.sin(t * Math.PI);
      this.beamPos[i * 3] = a.x + wob;
      this.beamPos[i * 3 + 1] = a.y + wob;
      this.beamPos[i * 3 + 2] = a.z;
    }
    this.beam.geometry.attributes.position.needsUpdate = true;
  }

  setPixelRatio(pr) {
    this.beam.material.size = 16 * pr;
    this.beamCore.material.size = 6 * pr;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.v.y -= 9.8 * p.g * dt;
        p.p.addScaledVector(p.v, dt);
        const f = Math.max(p.life / p.max, 0);
        this.pCol[i * 3] = p.c.r * f; this.pCol[i * 3 + 1] = p.c.g * f; this.pCol[i * 3 + 2] = p.c.b * f;
      } else {
        this.pCol[i * 3] = this.pCol[i * 3 + 1] = this.pCol[i * 3 + 2] = 0;
        p.p.set(0, -999, 0);
      }
      this.pPos[i * 3] = p.p.x; this.pPos[i * 3 + 1] = p.p.y; this.pPos[i * 3 + 2] = p.p.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (const t of this.tracers) {
      if (!t.visible) continue;
      t.userData.life -= dt;
      t.material.opacity = Math.max(t.userData.life / 0.09, 0);
      if (t.userData.life <= 0) t.visible = false;
    }
  }
}
