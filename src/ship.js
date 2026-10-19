import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SHIP_LEN, halfBeam } from './ocean.js';
import { onLand } from './port.js';

// A guided-missile-destroyer-style warship, built procedurally.
// Ship frame: forward is -Z, starboard is +X, the waterline is y = 0.
// Physics runs in the ship frame (the ship is static there); the whole ship frame is then
// moved, pitched and rolled on the ocean for rendering, so walking on deck stays rock solid.

const L = SHIP_LEN;
const N = 96; // hull stations
const M = 16; // points up each side
export const DECK = 5.6; // main deck height amidships
export const DECK01 = 8.6; // top of the 01 level
export const HELM = new THREE.Vector3(0, DECK01 + 1.45, -19.7);

const zAt = (t) => -L / 2 + L * t;
const tAt = (z) => (z + L / 2) / L;
export function deckY(t) {
  return DECK + (t < 0.3 ? 2.1 * Math.pow(1 - t / 0.3, 2) : 0);
}
function keelY(t) {
  let k = -4.6;
  if (t < 0.12) k += Math.pow(1 - t / 0.12, 1.5) * 4.0;
  if (t > 0.88) k += ((t - 0.88) / 0.12) * 2.0;
  return k;
}
// Half-width of the hull at station t and height y.
function hullWidth(t, y) {
  const hb = halfBeam(t);
  const keel = keelY(t), deck = deckY(t);
  const r = THREE.MathUtils.clamp((y - keel) / Math.max(-keel * 0.95, 0.01), 0, 1);
  let w = hb * (0.16 + 0.84 * Math.pow(Math.sin((r * Math.PI) / 2), 0.55));
  if (y > 0) w = hb * (1 + 0.05 * (y / deck));
  const v = 1 - THREE.MathUtils.smoothstep(t, 0, 0.26); // V-shaped bow sections
  const lin = hb * THREE.MathUtils.clamp(((y - keel) / (deck - keel)) * 1.25, 0, 1.05);
  return THREE.MathUtils.lerp(w, lin, v);
}
export function deckHalfWidth(z) {
  const t = tAt(z);
  return hullWidth(t, deckY(t));
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(...repeat);
  return t;
}
const deckTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4b5056'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  g.strokeRect(0, 0, w, h);
});
const vlsTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#5e666d'; g.fillRect(0, 0, w, h);
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = '#6c757c'; g.fillRect(i * s + 6, j * s + 6, s - 12, s - 12);
    g.strokeStyle = '#3c4247'; g.lineWidth = 3; g.strokeRect(i * s + 6, j * s + 6, s - 12, s - 12);
    g.fillStyle = '#2d3236'; g.beginPath(); g.arc(i * s + s / 2, j * s + s / 2, 5, 0, 7); g.fill();
  }
});
const hangarTex = () => canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#9aa2a8'; g.fillRect(0, 0, w, h);
  for (let y = 4; y < h; y += 8) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, y, w, 2); }
  g.fillStyle = '#e8b43a'; g.fillRect(0, h - 10, w, 4);
});
const helipadTex = () => canvasTex(512, 512, (g, w) => {
  g.clearRect(0, 0, w, w);
  g.strokeStyle = '#f2f2ee'; g.lineWidth = 10;
  g.beginPath(); g.arc(w / 2, w / 2, w * 0.36, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#e8b43a'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, w); g.stroke();
  g.strokeStyle = '#f2f2ee'; g.lineWidth = 6;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(w * 0.2, w * (0.5 + (i - 2.5) * 0.03)); g.lineTo(w * 0.8, w * (0.5 + (i - 2.5) * 0.03)); g.stroke(); }
  g.strokeRect(6, 6, w - 12, w - 12);
});
const numberTex = (text) => canvasTex(256, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.font = 'bold 96px "Chakra Petch", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#16191c'; g.fillText(text, w / 2 + 4, h / 2 + 4);
  g.fillStyle = '#f4f4f0'; g.fillText(text, w / 2, h / 2);
});
const screenTex = (kind) => canvasTex(256, 160, (g, w, h) => {
  g.fillStyle = '#04120c'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(60,220,140,0.35)'; g.lineWidth = 1;
  for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = '#4dff9a'; g.fillStyle = '#4dff9a'; g.lineWidth = 2;
  if (kind % 2 === 0) {
    for (const r of [25, 50, 70]) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + 60, h / 2 - 40); g.stroke();
    for (let i = 0; i < 6; i++) g.fillRect(w / 2 + (Math.random() - 0.5) * 120, h / 2 + (Math.random() - 0.5) * 120, 4, 4);
  } else {
    g.font = 'bold 16px monospace';
    ['HDG 000', 'SPD 16.0', 'RPM 142', 'WIND 12', 'DEPTH 3200'].forEach((t, i) => g.fillText(t, 14, 26 + i * 26));
  }
});
const flagTex = () => canvasTex(128, 80, (g, w, h) => {
  g.fillStyle = '#16305e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8b43a'; g.fillRect(0, h * 0.42, w, h * 0.16);
  g.fillStyle = '#f4f4f0';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 9 : 22, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(w * 0.28 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
  }
  g.fill();
});

// ---------------------------------------------------------------- the ship
export class Ship {
  constructor(game) {
    this.game = game;
    this.root = game.frame; // the ship frame: moved on the ocean every frame
    this.mesh = new THREE.Group(); // ship geometry in ship frame
    this.root.add(this.mesh);
    this.sb = game.sandbox;

    this.M = {
      hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25, side: THREE.DoubleSide }),
      deck: new THREE.MeshStandardMaterial({ map: deckTex(), roughness: 0.95, side: THREE.DoubleSide }),
      grey: new THREE.MeshStandardMaterial({ color: 0x9ba3a9, roughness: 0.65, metalness: 0.2 }),
      greyDark: new THREE.MeshStandardMaterial({ color: 0x737b81, roughness: 0.7, metalness: 0.2 }),
      black: new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x6f93ad, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.16, depthWrite: false }),
      white: new THREE.MeshStandardMaterial({ color: 0xeef0ee, roughness: 0.5 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xc9cfd3, roughness: 0.4, metalness: 0.5 }),
      floor: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.9 }),
      console: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.6, metalness: 0.3 }),
    };

    this.buildHull();
    this.buildDeckFittings();
    this.buildSuperstructure();
    this.buildBridge();
    this.buildMast();
    this.mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // --- motion state ---
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0; // radians, 0 = sailing toward -Z
    this.speed = 0; // m/s along heading
    this.telegraph = 1; // index into SPEEDS (STOP: we start alongside the quay)
    this.rudder = 0; // -1..1 (positive = turn to starboard)
    this.heave = 0; this.pitch = 0; this.roll = 0;
    this.time = 0;
    this.speed = 0;
    this.moored = true; // alongside the quay at the naval air station
    this.side = 1; // starboard side to the quay
    this.mooring = false;
  }

  static SPEEDS = [
    { name: 'BACK 1/3', v: -3 },
    { name: 'STOP', v: 0 },
    { name: 'AHEAD 1/3', v: 4 },
    { name: 'AHEAD 2/3', v: 8 },
    { name: 'AHEAD FULL', v: 12 },
    { name: 'FLANK', v: 16 },
  ];

  // ------------------------------------------------------------ helpers
  box(w, h, d, x, y, z, mat, { collide = true, rot = null } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    if (rot) m.rotation.set(...rot);
    this.mesh.add(m);
    if (collide) {
      const q = new THREE.Quaternion().setFromEuler(m.rotation);
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z).setRotation(q));
    }
    return m;
  }

  cyl(r1, r2, h, x, y, z, mat, { seg = 16, collide = false, rot = null } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
    m.position.set(x, y + h / 2, z);
    if (rot) m.rotation.set(...rot);
    this.mesh.add(m);
    if (collide) this.sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(h / 2, Math.max(r1, r2)).setTranslation(x, y + h / 2, z));
    return m;
  }

  // Railing between points (ship frame, at deck level) with posts and a collider wall.
  railing(points, height = 1.05, collide = true) {
    const posts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const len = a.distanceTo(b);
      if (len < 0.01) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      for (const hh of [height * 0.5, height]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), this.M.rail);
        r.position.set(mid.x, mid.y + hh, mid.z);
        r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        this.mesh.add(r);
      }
      const steps = Math.max(1, Math.round(len / 1.6));
      for (let k = 0; k < steps; k++) posts.push(a.clone().lerp(b, k / steps));
      if (collide) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        this.sb.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(0.06, 0.65, len / 2 + 0.03).setTranslation(mid.x, mid.y + 0.65, mid.z).setRotation(q),
        );
      }
    }
    posts.push(points[points.length - 1]);
    const geo = new THREE.CylinderGeometry(0.03, 0.03, height, 6);
    geo.translate(0, height / 2, 0);
    const inst = new THREE.InstancedMesh(geo, this.M.rail, posts.length);
    const mtx = new THREE.Matrix4();
    posts.forEach((p, i) => inst.setMatrixAt(i, mtx.makeTranslation(p.x, p.y, p.z)));
    this.mesh.add(inst);
  }

  // ------------------------------------------------------------ hull
  buildHull() {
    const pos = [], col = [], idx = [];
    const cRed = new THREE.Color(0x5b2a24), cBlack = new THREE.Color(0x1b1d20), cGrey = new THREE.Color(0x868e95);
    const colorAt = (y) => (y < -0.15 ? cRed : y < 0.55 ? cBlack : cGrey);
    // two sides
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const z = zAt(t), keel = keelY(t), deck = deckY(t);
        for (let j = 0; j <= M; j++) {
          const y = keel + ((deck - keel) * j) / M;
          const w = hullWidth(t, y);
          pos.push(side * w, y, z);
          const c = colorAt(y);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
        const a = base + i * (M + 1) + j, b = a + M + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    // transom
    const tb = pos.length / 3;
    const tT = 1, zT = zAt(tT) - 0.001, keelT = keelY(0.999), deckT = deckY(1);
    pos.push(0, (keelT + deckT) / 2, zT); col.push(cGrey.r, cGrey.g, cGrey.b);
    const ring = [];
    for (let j = 0; j <= M; j++) { const y = keelT + ((deckT - keelT) * j) / M; ring.push([hullWidth(0.999, y), y]); }
    const ringPts = [...ring.map(([w, y]) => [w, y]), ...ring.slice().reverse().map(([w, y]) => [-w, y])];
    ringPts.forEach(([x, y]) => { pos.push(x, y, zT); const c = colorAt(y); col.push(c.r, c.g, c.b); });
    for (let k = 0; k < ringPts.length - 1; k++) idx.push(tb, tb + 1 + k, tb + 2 + k);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.mesh.add(new THREE.Mesh(g, this.M.hull));

    // --- deck surface (walkable trimesh) ---
    const dp = [], du = [], di = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = zAt(t), y = deckY(t), w = Math.max(hullWidth(t, y), 0.02);
      dp.push(-w, y, z, w, y, z);
      du.push(-w / 4, z / 4, w / 4, z / 4);
      if (i < N) { const a = i * 2; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dg.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2));
    dg.setIndex(di);
    dg.computeVertexNormals();
    this.mesh.add(new THREE.Mesh(dg, this.M.deck));
    this.sb.addStaticCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(dp), new Uint32Array(di)));
    // a thin solid slab under the deck too, so nothing tunnels through it
    for (let i = 0; i < N; i += 4) {
      const t = (i + 2) / N, z = zAt(t), y = deckY(t), w = hullWidth(t, y);
      if (w < 0.5) continue;
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w * 0.95, 0.25, (L / N) * 2).setTranslation(0, y - 0.26, z));
    }

    // --- deck-edge railings + gunwale strip ---
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 1; i <= N; i += 3) {
        const t = i / N, y = deckY(t);
        pts.push(new THREE.Vector3(side * (hullWidth(t, y) - 0.08), y, zAt(t)));
      }
      const tEnd = 1, yEnd = deckY(1);
      pts.push(new THREE.Vector3(side * (hullWidth(0.999, yEnd) - 0.08), yEnd, zAt(tEnd) - 0.1));
      this.railing(pts);
    }
    const wS = hullWidth(0.999, deckY(1)) - 0.08;
    this.railing([new THREE.Vector3(-wS, deckY(1), zAt(1) - 0.1), new THREE.Vector3(wS, deckY(1), zAt(1) - 0.1)]);

    // --- hull numbers ---
    const num = numberTex('88');
    for (const side of [1, -1]) {
      const z = -42, t = tAt(z), y = 3.2;
      const w = hullWidth(t, y);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshBasicMaterial({ map: num, transparent: true }));
      p.position.set(side * (w + 0.18), y, z);
      p.rotation.y = side * (Math.PI / 2) + side * 0.12; // follow the hull's taper toward the bow
      this.mesh.add(p);
    }
  }

  // ------------------------------------------------------------ foredeck & afterdeck
  buildDeckFittings() {
    const M = this.M;
    // 5-inch gun: turret (yaws) + gun cradle (elevates). Mannable.
    this.guns = [];
    const gz = -37, gy = deckY(tAt(gz));
    this.cyl(1.9, 2.1, 0.5, 0, gy, gz, M.greyDark, { collide: true, seg: 24 });
    const turret = new THREE.Group();
    turret.position.set(0, gy + 0.5, gz);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.6, 4.2), M.grey);
    tb.position.y = 0.8;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.2, 1.6), M.grey);
    nose.position.set(0, 0.95, -2.3);
    nose.rotation.x = -0.55;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), M.black);
    slot.position.set(0, 1.0, -2.75);
    turret.add(tb, nose, slot);
    const cradle = new THREE.Group();
    cradle.position.set(0, 1.0, -2.6);
    const recoil = new THREE.Group(); // slides back when firing
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 6.4, 12), M.greyDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -3.0;
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 12), M.black);
    brake.rotation.x = Math.PI / 2;
    brake.position.z = -6.2;
    const muzzle = new THREE.Object3D();
    muzzle.position.z = -6.5;
    recoil.add(barrel, brake, muzzle);
    cradle.add(recoil);
    turret.add(cradle);
    this.mesh.add(turret);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.5, 0.8, 2.3).setTranslation(0, gy + 1.3, gz));
    this.guns.push({
      id: 'main', name: '5-inch gun', kind: 'shell',
      yaw: turret, pitch: cradle, recoil, muzzle,
      stand: new THREE.Vector3(0, gy, gz + 3.0),
      cam: new THREE.Vector3(0, 3.9, 9.0),
      yawCenter: 0, yawLimit: 2.1, pitchMin: -0.06, pitchMax: 1.1,
      interval: 1.1, speed: 240, pitch0: 0.05,
    });

    // forward VLS
    const vz = -28.5, vy = deckY(tAt(vz));
    const vls = this.box(5, 0.32, 5.5, 0, vy, vz, M.greyDark);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 5.3), new THREE.MeshStandardMaterial({ map: vlsTex(), roughness: 0.8 }));
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, vy + 0.33, vz);
    this.mesh.add(top);
    void vls;

    // anchor windlass + bollards on the foredeck
    for (const x of [-1.4, 1.4]) {
      const z = -46, y = deckY(tAt(z));
      this.cyl(0.35, 0.35, 0.5, x, y, z, M.black, { collide: true });
      this.box(0.3, 0.12, 2.8, x * 0.6, y, z + 2, M.black, { collide: false }); // chain run
    }
    for (const [x, z] of [[-3.2, -40], [3.2, -40], [-5.8, -5], [5.8, -5], [-5.8, 28], [5.8, 28], [-5, 50], [5, 50]]) {
      const y = deckY(tAt(z));
      this.cyl(0.18, 0.22, 0.45, x, y, z, M.black, { collide: true, seg: 10 });
    }

    // helipad marking on the flight deck
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshStandardMaterial({ map: helipadTex(), transparent: true, roughness: 0.9 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, DECK + 0.02, 42);
    this.mesh.add(pad);

    // stern flagstaff
    const fz = 53.8;
    this.cyl(0.05, 0.05, 4.5, 0, DECK, fz, M.rail);
    this.sternFlag = this.flag(0, DECK + 3.6, fz + 0.05);
  }

  flag(x, y, z) {
    const geo = new THREE.PlaneGeometry(1.8, 1.1, 12, 4);
    geo.translate(0.9, 0, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTex(), side: THREE.DoubleSide, roughness: 0.8 }));
    m.position.set(x, y, z);
    m.rotation.y = Math.PI / 2; // streams aft (+Z)
    m.userData.base = geo.attributes.position.array.slice();
    this.mesh.add(m);
    (this.flags ||= []).push(m);
    return m;
  }

  // ------------------------------------------------------------ superstructure
  buildSuperstructure() {
    const M = this.M;
    this.buildInterior();
    // hangar
    this.box(11, 5.6, 12, 0, DECK, 24, M.grey);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.6), new THREE.MeshStandardMaterial({ map: hangarTex(), roughness: 0.7 }));
    door.position.set(0, DECK + 2.3, 30.02);
    this.mesh.add(door);

    // funnels
    for (const z of [-4, 7]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.9, 6.2, 4, 1), M.grey);
      f.rotation.y = Math.PI / 4;
      f.scale.set(1.15, 1, 1.7);
      f.position.set(0, DECK01 + 3.1, z);
      this.mesh.add(f);
      this.box(2.2, 0.5, 3.4, 0, DECK01 + 6.2, z, M.black, { collide: false });
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.7, 3.1, 2.6).setTranslation(0, DECK01 + 3.1, z));
    }

    // stairs from the main deck up to the 01 level, both sides
    for (const side of [1, -1]) {
      const x = side * 5.65;
      for (let k = 0; k < 10; k++) {
        const h = 0.3 * (k + 1);
        this.box(1.0, h, 0.56, x, DECK, 15 - k * 0.55, M.greyDark);
      }
      // handrail on the outboard side, and a rail across the open front end of the top step
      const a = new THREE.Vector3(x + side * 0.5, DECK + 0.3, 15.3), b = new THREE.Vector3(x + side * 0.5, DECK01, 9.8);
      this.railing([a, b], 1.0, false);
      this.railing([new THREE.Vector3(side * 5.05, DECK01, 9.74), new THREE.Vector3(side * 6.2, DECK01, 9.74)]);
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.05, 1.6, 2.8).setTranslation(x + side * 0.55, DECK + 2.0, 12.55));
    }

    // 01-level railings (gaps where the stairs arrive and where the bridge stands)
    const y = DECK01;
    for (const side of [1, -1]) {
      this.railing([new THREE.Vector3(side * 4.95, y, -14.2), new THREE.Vector3(side * 4.95, y, 9.4)]);
      this.railing([new THREE.Vector3(side * 4.95, y, 10.9), new THREE.Vector3(side * 4.95, y, 17.9)]);
    }
    this.railing([new THREE.Vector3(-4.95, y, 17.9), new THREE.Vector3(4.95, y, 17.9)]);

    // CIWS mounts on the 01 deck aft. Mannable, rapid fire.
    const ciws = (x, yy, z, id, center) => {
      this.cyl(0.6, 0.75, 0.8, x, yy, z, M.greyDark, { collide: true });
      const yaw = new THREE.Group();
      yaw.position.set(x, yy + 0.8, z);
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 16), M.white);
      housing.position.y = 0.55;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.white);
      dome.position.y = 1.1;
      const radome = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.7, 12), M.white);
      radome.position.set(0, 1.9, 0.15);
      yaw.add(housing, dome, radome);
      const pitch = new THREE.Group();
      pitch.position.set(0, 0.45, -0.45);
      const recoil = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), M.black);
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, -0.75);
        recoil.add(b);
      }
      const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 10), M.black);
      clamp.rotation.x = Math.PI / 2;
      clamp.position.z = -1.35;
      const muzzle = new THREE.Object3D();
      muzzle.position.z = -1.55;
      recoil.add(clamp, muzzle);
      pitch.add(recoil);
      yaw.add(pitch);
      this.mesh.add(yaw);
      this.guns.push({
        id, name: 'CIWS', kind: 'bullet',
        yaw, pitch, recoil, muzzle,
        stand: new THREE.Vector3(x, yy, z + 1.7),
        cam: new THREE.Vector3(0, 3.1, 3.8),
        yawCenter: center, yawLimit: 2.0, pitchMin: -0.15, pitchMax: 1.2, // covers its own side and astern
        interval: 0.05, speed: 650, pitch0: 0.1,
      });
    };
    ciws(-3, DECK01, 15, 'ciwsPort', Math.PI / 2);
    ciws(3, DECK01, 15, 'ciwsStbd', -Math.PI / 2);

    // boats on the 01 level between the funnels
    for (const side of [1, -1]) {
      const b = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 5.2, 6, 12), M.orange);
      tube.rotation.x = Math.PI / 2;
      tube.position.y = 0.55;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 5.4), M.greyDark);
      hull.position.y = 0.35;
      const cons = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), M.black);
      cons.position.set(0, 0.9, 0.6);
      b.add(tube, hull, cons);
      b.position.set(side * 3.95, DECK01 + 0.25, 1.5);
      this.mesh.add(b);
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.75, 0.6, 3.0).setTranslation(side * 3.95, DECK01 + 0.85, 1.5));
      // life raft canisters
      for (let k = 0; k < 3; k++) {
        const c = this.cyl(0.32, 0.32, 1.1, side * 4.45, DECK01 + 0.1, -8 + k * 1.3, M.white, { rot: [Math.PI / 2, 0, 0] });
        c.position.y = DECK01 + 0.45;
      }
    }

    // phased-array style panels on the forward corners of the superstructure
    for (const side of [1, -1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.15, 8), M.greyDark);
      p.rotation.set(Math.PI / 2, 0, Math.PI / 8);
      p.position.set(side * 3.0, DECK + 1.55, -22.08);
      this.mesh.add(p);
    }
  }

  // ------------------------------------------------------------ interior (01 level)
  // The block between the main deck and the 01 deck is hollow: a doorway on each side opens
  // into a cross passage, with the crew mess forward and the storeroom aft.
  buildInterior() {
    const M = this.M;
    const inner = new THREE.MeshStandardMaterial({ color: 0xdfe2dc, roughness: 0.8 });
    const lino = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#7d8a96'; g.fillRect(0, 0, w, w);
      g.fillStyle = '#6f7c88'; g.fillRect(0, 0, w / 2, w / 2); g.fillRect(w / 2, w / 2, w / 2, w / 2);
      g.strokeStyle = 'rgba(0,0,0,.2)'; g.strokeRect(0, 0, w, w);
    }, [10, 40]), roughness: 0.6 });
    const H = DECK01 - DECK - 0.3; // clear height inside
    const x0 = -5, x1 = 5, z0 = -22, z1 = 18;
    // wall with exterior paint on one face and interior paint on the rest
    const wall = (w, h, d, x, y, z, extFace) => {
      const mats = [inner, inner, inner, inner, inner, inner];
      if (extFace != null) mats[extFace] = M.grey;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      m.position.set(x, y + h / 2, z);
      this.mesh.add(m);
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z));
      return m;
    };
    // roof (= 01 deck), painted grey on top, white underneath
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 40), [M.grey, M.grey, M.grey, inner, M.grey, M.grey]);
    roof.position.set(0, DECK01 - 0.15, -2);
    this.mesh.add(roof);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(5, 0.15, 20).setTranslation(0, DECK01 - 0.15, -2));
    // floor
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 39.8), lino);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(0, DECK + 0.02, -2);
    this.mesh.add(fl);
    // front and back walls
    wall(10, H, 0.2, 0, DECK, z0 + 0.1, 5);
    wall(10, H, 0.2, 0, DECK, z1 - 0.1, 4);
    // side walls with a doorway at z 3.4..4.6
    const dz0 = 3.4, dz1 = 4.6, dh = 2.15;
    for (const side of [1, -1]) {
      const x = side * (x1 - 0.1), ext = side > 0 ? 0 : 1;
      wall(0.2, H, dz0 - z0, x, DECK, (z0 + dz0) / 2, ext);
      wall(0.2, H, z1 - dz1, x, DECK, (dz1 + z1) / 2, ext);
      wall(0.2, H - dh, dz1 - dz0, x, DECK + dh, (dz0 + dz1) / 2, ext);
      // door frame + sign
      for (const z of [dz0 - 0.06, dz1 + 0.06]) this.box(0.3, dh, 0.12, x, DECK, z, M.greyDark, { collide: false });
      this.box(0.3, 0.12, 1.36, x, DECK + dh, 4, M.greyDark, { collide: false });
      for (let z = -19; z < 16; z += 3.2) {
        if (Math.abs(z - 4) < 1.5) continue;
        const p = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), M.black);
        p.position.set(side * 5.01, DECK + 1.9, z);
        p.rotation.y = side * Math.PI / 2;
        this.mesh.add(p);
      }
    }
    // partitions either side of the cross passage, each with a centre doorway
    for (const z of [2.6, 5.4]) {
      wall(4.3, H, 0.15, -2.85, DECK, z);
      wall(4.3, H, 0.15, 2.85, DECK, z);
      wall(1.4, H - dh, 0.15, 0, DECK + dh, z);
    }
    // ceiling lights
    const lampM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 1.2 });
    for (const z of [-17, -11, -5, 0, 4, 8, 12.5, 16]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.3), lampM);
      l.position.set(0, DECK01 - 0.33, z);
      this.mesh.add(l);
    }
    for (const [z, i] of [[-9, 18], [11.5, 18], [4, 8]]) {
      const pl = new THREE.PointLight(0xfff3e2, i, 16, 1.4);
      pl.position.set(0, DECK01 - 0.6, z);
      this.mesh.add(pl);
    }
    // signs over the inner doorways
    const sign = (text, z, flip) => {
      const t = canvasTex(256, 64, (g, w, h) => {
        g.fillStyle = '#1f3b63'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#f2f2ee'; g.font = 'bold 34px "Chakra Petch", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, w / 2, h / 2 + 2);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      m.position.set(0, DECK + dh + 0.25, z);
      if (flip) m.rotation.y = Math.PI;
      this.mesh.add(m);
    };
    sign('CREW MESS', 2.6 + 0.09, false);
    sign('STORES', 5.4 - 0.09, true);

    // ---- storeroom (aft): shelving along both sides, a double rack down the middle, lockers ----
    this.storeSpots = [];
    const shelfM = new THREE.MeshStandardMaterial({ color: 0x8f979e, roughness: 0.5, metalness: 0.4 });
    const rack = (x, zc, len, depth) => {
      for (const zz of [zc - len / 2 + 0.05, zc + len / 2 - 0.05]) for (const xx of [x - depth / 2 + 0.03, x + depth / 2 - 0.03]) {
        this.box(0.05, 2.3, 0.05, xx, DECK, zz, shelfM, { collide: false });
      }
      for (const h of [0.12, 0.85, 1.55, 2.25]) {
        this.box(depth, 0.04, len, x, DECK + h, zc, shelfM);
        if (h < 2) for (let k = 0; k < Math.floor(len / 0.75); k++) {
          this.storeSpots.push(new THREE.Vector3(x + (Math.random() - 0.5) * depth * 0.4, DECK + h + 0.3, zc - len / 2 + 0.45 + k * 0.75));
        }
      }
    };
    rack(4.35, 9.0, 4.4, 0.75);
    rack(4.35, 14.2, 4.4, 0.75);
    rack(-4.35, 9.0, 4.4, 0.75);
    rack(-4.35, 14.2, 4.4, 0.75);
    rack(0, 11.4, 5.2, 1.0);
    for (let k = 0; k < 6; k++) {
      const x = -2.6 + k * 1.05;
      if (Math.abs(x) < 0.5) continue;
      const lk = this.box(0.95, 2.0, 0.55, x, DECK, 17.45, new THREE.MeshStandardMaterial({ color: 0x5f6f7f, roughness: 0.5, metalness: 0.3 }));
      void lk;
    }

    // ---- crew mess (forward): tables, benches, galley counter ----
    this.messSpots = [];
    const tableM = new THREE.MeshStandardMaterial({ color: 0xb7bcc1, roughness: 0.4, metalness: 0.4 });
    const benchM = new THREE.MeshStandardMaterial({ color: 0x2f4f7a, roughness: 0.7 });
    for (const z of [-5.5, -10.5, -15.5]) {
      for (const x of [-2.4, 2.4]) {
        this.box(1.0, 0.76, 2.6, x, DECK, z, tableM);
        for (const bx of [x - 0.85, x + 0.85]) this.box(0.4, 0.45, 2.6, bx, DECK, z, benchM);
        this.messSpots.push(new THREE.Vector3(x + (Math.random() - 0.5) * 0.4, DECK + 1.0, z + (Math.random() - 0.5) * 1.6));
      }
    }
    this.box(9.0, 0.95, 0.75, 0, DECK, -21.35, new THREE.MeshStandardMaterial({ color: 0x9ea6ad, roughness: 0.4, metalness: 0.6 }));
    this.box(0.5, 0.6, 0.45, -3.2, DECK + 0.95, -21.4, M.black); // coffee machine
    this.messSpots.push(new THREE.Vector3(-2.4, DECK + 1.2, -21.3), new THREE.Vector3(1.5, DECK + 1.2, -21.3));
  }

  // ------------------------------------------------------------ bridge (walk-in)
  buildBridge() {
    const M = this.M;
    const y0 = DECK01, H = 2.9, z0 = -21.5, z1 = -14.5, hw = 4.5, th = 0.22;
    // front: solid band, glass, top band
    this.box(2 * hw, 1.0, th, 0, y0, z0, M.grey);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2 * hw - 0.3, 1.45, 0.06), M.glass);
    glass.position.set(0, y0 + 1.0 + 0.72, z0);
    this.mesh.add(glass);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(hw, 0.72, 0.08).setTranslation(0, y0 + 1.72, z0));
    for (let x = -hw + 0.1; x <= hw; x += 1.5) this.box(0.12, 1.45, th, x, y0 + 1.0, z0, M.greyDark, { collide: false });
    this.box(2 * hw, H - 2.45, th, 0, y0 + 2.45, z0, M.grey);
    // side walls with a door to each bridge wing
    for (const side of [1, -1]) {
      const x = side * hw;
      this.box(th, H, 3.3, x, y0, -19.85, M.grey); // forward part (z -21.5..-18.2)
      this.box(th, H, 1.7, x, y0, -15.35, M.grey); // aft part (z -16.2..-14.5)
      this.box(th, H - 2.2, 2.0, x, y0 + 2.2, -17.2, M.grey); // lintel over the door
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 2.2), M.glass);
      win.position.set(x + side * 0.12, y0 + 1.75, -19.9);
      this.mesh.add(win);
    }
    // back wall with a centre door
    this.box(hw - 0.75, H, th, -(hw + 0.75) / 2, y0, z1, M.grey);
    this.box(hw - 0.75, H, th, (hw + 0.75) / 2, y0, z1, M.grey);
    this.box(1.5, H - 2.2, th, 0, y0 + 2.2, z1, M.grey);
    // roof
    this.box(2 * hw + 0.6, 0.3, z1 - z0 + 0.6, 0, y0 + H, (z0 + z1) / 2, M.grey);
    // floor
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw - 0.2, z1 - z0 - 0.2), M.floor);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(0, y0 + 0.01, (z0 + z1) / 2);
    this.mesh.add(fl);

    // consoles
    this.box(5.5, 1.0, 0.8, 0, y0, -20.7, M.console);
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue; // the helm stands here
      const bez = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.08), M.console);
      bez.position.set(i * 1.05, y0 + 1.28, -20.62);
      bez.rotation.x = -0.45;
      this.mesh.add(bez);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.46),
        new THREE.MeshStandardMaterial({ map: screenTex(i + 2), emissive: 0xffffff, emissiveMap: screenTex(i + 2), emissiveIntensity: 0.8, roughness: 0.4 }));
      scr.position.set(i * 1.05, y0 + 1.28, -20.62);
      scr.rotation.x = -0.45;
      scr.translateZ(0.045);
      this.mesh.add(scr);
    }
    // helm: pedestal + wheel + engine order telegraph
    this.cyl(0.16, 0.24, 0.85, 0, y0, -19.75, M.console);
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.028, 8, 24), M.black);
    wheel.add(rim);
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.54, 6), M.rail);
      spoke.rotation.z = (k * Math.PI) / 3;
      wheel.add(spoke);
    }
    wheel.position.set(0, y0 + 1.02, -19.62);
    wheel.rotation.x = -0.75;
    this.mesh.add(wheel);
    this.wheel = wheel;
    this.box(0.5, 1.1, 0.4, 1.3, y0, -19.9, M.console);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), new THREE.MeshStandardMaterial({ color: 0xc23b2a }));
    lever.position.set(1.3, y0 + 1.25, -19.9);
    this.mesh.add(lever);
    this.lever = lever;
    // captain's chair
    this.box(0.7, 0.55, 0.7, 2.6, y0, -17.6, M.console);
    this.box(0.7, 0.8, 0.12, 2.6, y0 + 0.55, -17.3, M.console, { collide: false });
    // chart table
    this.box(1.6, 0.95, 1.0, -2.8, y0, -16.2, M.console);
    // interior light
    const light = new THREE.PointLight(0xfff0dd, 22, 12, 1.6);
    light.position.set(0, y0 + 2.6, -18);
    this.mesh.add(light);

    // bridge wings
    for (const side of [1, -1]) {
      const x = side * (hw + 1.1);
      this.box(2.2, 0.2, 4.2, x, y0 - 0.2, -18.6, M.greyDark);
      this.railing([
        new THREE.Vector3(side * hw, y0, -20.7),
        new THREE.Vector3(side * (hw + 2.15), y0, -20.7),
        new THREE.Vector3(side * (hw + 2.15), y0, -16.5),
        new THREE.Vector3(side * hw, y0, -16.5),
      ]);
    }
  }

  // ------------------------------------------------------------ mast
  buildMast() {
    const M = this.M;
    const yb = DECK01 + 3.2, z = -17.5;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.2, 7, 4), M.grey);
    tower.rotation.y = Math.PI / 4;
    tower.position.set(0, yb + 3.5, z);
    this.mesh.add(tower);
    this.cyl(0.12, 0.16, 7, 0, yb + 7, z, M.rail);
    // yardarm
    this.box(7, 0.14, 0.14, 0, yb + 7.4, z, M.rail, { collide: false });
    for (const x of [-3.3, 3.3]) this.cyl(0.02, 0.02, 1.3, x, yb + 6.2, z, M.black);
    // spinning radar
    this.radar = new THREE.Group();
    const arr = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 0.12), M.greyDark);
    arr.position.y = 0.2;
    this.radar.add(arr);
    this.radar.position.set(0, yb + 8.6, z);
    this.mesh.add(this.radar);
    // dome + antennas
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), M.white);
    dome.position.set(0, yb + 14.2, z);
    this.mesh.add(dome);
    for (const x of [-4.2, 4.2]) this.cyl(0.03, 0.01, 6, x, DECK01, -9, M.black);
    // lights + mast flag
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff }));
    lamp.position.set(0, yb + 13.6, z);
    this.mesh.add(lamp);
    this.flag(3.4, yb + 6.4, z);
  }

  // ------------------------------------------------------------ helm / motion
  telegraphUp() { this.telegraph = Math.min(this.telegraph + 1, Ship.SPEEDS.length - 1); }
  telegraphDown() { this.telegraph = Math.max(this.telegraph - 1, 0); }
  get order() { return Ship.SPEEDS[this.telegraph]; }

  // steer: -1 (port) .. 1 (starboard) while the helm is held; 0 lets the rudder return amidships.
  update(dt, ocean, steer = 0) {
    this.time += dt;
    if (this.moored) {
      if (this.telegraph !== 1) { this.moored = false; this.game.hud.toast('Lines cast off'); }
      else { this.speed = 0; this.rudder *= 0.9; }
    }
    // engines
    const target = this.order.v;
    const accel = target > this.speed ? 0.35 : 0.5;
    this.speed += THREE.MathUtils.clamp(target - this.speed, -accel * dt, accel * dt);
    // rudder
    if (steer) this.rudder = THREE.MathUtils.clamp(this.rudder + steer * dt * 0.45, -1, 1);
    else this.rudder -= Math.sign(this.rudder) * Math.min(Math.abs(this.rudder), dt * 0.25);
    const rudderAngle = this.rudder * 0.61; // 35 degrees
    this.heading -= rudderAngle * this.speed * 0.011 * dt;
    // move along heading (forward is -Z rotated by heading)
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += -Math.sin(this.heading) * this.speed * dt;
    this.pos.z += -Math.cos(this.heading) * this.speed * dt;

    // running aground on the coast
    if (!this.moored) {
      const f = [-Math.sin(this.heading), -Math.cos(this.heading)], r = [-f[1], f[0]];
      for (const [a, b] of [[54, 0], [-54, 0], [0, 7.4], [0, -7.4], [35, 6], [35, -6], [-35, 6], [-35, -6]]) {
        if (onLand(this.pos.x + f[0] * a + r[0] * b, this.pos.z + f[1] * a + r[1] * b, -0.3)) {
          this.pos.x = prevX; this.pos.z = prevZ;
          if (Math.abs(this.speed) > 0.5) { this.game.hud.toast('Ran aground!', 0xff8a6a); this.game.shake = 0.8; this.game.sfx.play('thud'); }
          this.speed = 0;
          this.telegraph = 1;
          break;
        }
      }
    }

    // coming alongside: slow, engines stopped, near the berth and roughly parallel -> warp in and moor
    if (!this.moored && this.telegraph === 1) {
      const d = Math.hypot(this.pos.x, this.pos.z);
      const hd = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
      const flip = Math.abs(hd) > Math.PI / 2; // either way round
      const err = flip ? Math.atan2(Math.sin(hd - Math.PI), Math.cos(hd - Math.PI)) : hd;
      if (d < 40 && Math.abs(this.speed) < 2.5 && Math.abs(err) < 0.35) {
        this.mooring = true;
        const k = Math.min(dt * 0.6, 1);
        this.pos.x -= this.pos.x * k;
        this.pos.z -= this.pos.z * k;
        this.heading -= err * k;
        this.speed *= 1 - k;
        if (d < 0.4 && Math.abs(err) < 0.01) {
          this.moored = true; this.mooring = false;
          this.pos.set(0, 0, 0);
          this.heading = flip ? Math.PI : 0;
          this.side = flip ? -1 : 1; // which side of the ship faces the quay
          this.game.hud.toast('Moored alongside', 0x7be08a);
        }
      } else this.mooring = false;
    }

    // ride the waves: sample the ocean at bow, stern and both sides
    const fwd = new THREE.Vector2(-Math.sin(this.heading), -Math.cos(this.heading));
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    const h = (f, r) => ocean.heightAt(this.pos.x + fwd.x * f + right.x * r, this.pos.z + fwd.y * f + right.y * r);
    const hb = h(45, 0), hs = h(-45, 0), hp = h(0, -7), hst = h(0, 7), hc = h(0, 0);
    const heaveT = (hb + hs + hp + hst + hc) / 5 * 0.7;
    const pitchT = Math.atan2(hb - hs, 90) * 0.8 + Math.sin(this.time * 0.55) * 0.004;
    const heel = rudderAngle * this.speed * 0.004; // lean out of the turn
    const rollT = Math.atan2(hst - hp, 14) * 0.6 + heel + Math.sin(this.time * 0.63) * 0.03 + Math.sin(this.time * 1.07 + 1) * 0.008;
    const k = Math.min(dt * 1.3, 1);
    this.heave += (heaveT - this.heave) * k;
    this.pitch += (pitchT - this.pitch) * k;
    this.roll += (rollT - this.roll) * k;

    this.root.position.set(this.pos.x, this.heave, this.pos.z);
    this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    this.root.updateMatrixWorld(true);

    // little animations
    this.radar.rotation.y += dt * 2.2;
    this.wheel.rotation.z = -this.rudder * 2.5;
    this.lever.rotation.x = (this.telegraph - 1) * -0.18;
    for (const f of this.flags) {
      const p = f.geometry.attributes.position, b = f.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3];
        p.setZ(i, Math.sin(x * 3 - this.time * 6) * 0.12 * x);
      }
      p.needsUpdate = true;
    }
  }

  // Ship-frame helpers
  toWorld(v) { return this.root.localToWorld(v.clone()); }
  get quaternion() { return this.root.quaternion; }
}
