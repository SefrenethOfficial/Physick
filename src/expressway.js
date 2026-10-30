import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAND_Y } from './world.js';
import { std, sign, canvasTex, speckle } from './buildkit.js';
import { ribbon } from './terrain.js';

// The Ridgeback Expressway (Route 4): the main road from Verian City to Ridgeback Hills. It leaves
// the west end of 105th Street, climbs on a viaduct over the Cherry Estate valleys, cuts through
// the ridge in the middle of the park, swings out over the sea along the park's west coast and
// comes down to the foot of the Ridgeback Pass, by the gas station.

const CTRL = [[-1112, 105], [-1150, 104], [-1210, 98], [-1330, 62], [-1460, 10], [-1590, -8], [-1695, -40], [-1748, -150], [-1752, -290], [-1712, -385], [-1662, -421]];
const STEP = 5, GRADE = 0.085, WIDTH = 13;

// Lay out the route and its height profile (before the park's terrain exists: from its raw hills).
export function planExpressway(natural) {
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = curve.getLength(), n = Math.ceil(L / STEP);
  const pts = curve.getSpacedPoints(n).map((p, i) => ({ x: p.x, z: p.z, s: (i * L) / n }));
  const ground = (x, z) => (x < -1712 && z > -421 ? -4 : z < -421 ? LAND_Y : natural(x, z));
  // the deck wants 8 m of air under it; it can't climb faster than GRADE, and both ends are pinned at street level
  const req = pts.map((p) => { let m = -Infinity; for (const [dx, dz] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]]) m = Math.max(m, ground(p.x + dx, p.z + dz)); return Math.max(m + 8, 8); });
  const g = GRADE * (L / n), N = pts.length;
  const cap = pts.map((_, i) => Math.min(LAND_Y + 0.15 + i * g * 0.92, LAND_Y + 0.1 + (N - 1 - i) * g * 0.92));
  let y = req.map((r, i) => Math.min(r, cap[i]));
  for (let i = 1; i < N; i++) y[i] = Math.max(y[i], Math.min(cap[i], y[i - 1] - g));
  for (let i = N - 2; i >= 0; i--) y[i] = Math.max(y[i], Math.min(cap[i], y[i + 1] - g));
  // smooth out the kinks (crests and sags become long curves)
  for (let pass = 0; pass < 3; pass++) { const o = y.slice(); for (let i = 1; i < N - 1; i++) { let a = 0, c = 0; for (let k = -8; k <= 8; k++) { const q = o[i + k]; if (q != null) { a += q; c++; } } y[i] = Math.min(cap[i] + 0.4, a / c); } }
  y[0] = LAND_Y + 0.15; y[N - 1] = LAND_Y + 0.1;
  pts.forEach((p, i) => { p.y = y[i]; });
  // a coarse grid for "how near the expressway is this point"
  const grid = new Map(), key = (x, z) => `${Math.floor(x / 25)},${Math.floor(z / 25)}`;
  for (const p of pts) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = `${Math.floor(p.x / 25) + a},${Math.floor(p.z / 25) + b}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  const near = (x, z) => {
    const list = grid.get(key(x, z));
    if (!list) return null;
    let best = null, bd = Infinity;
    for (const p of list) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
    return { p: best, d: Math.sqrt(bd) };
  };
  // the ground under and beside it: never above the deck (a cutting through the hills, banks either side)
  const carve = (x, z, h) => {
    const n = near(x, z);
    if (!n || n.d > 40) return h;
    const allowed = n.p.y - 0.5 + Math.max(0, n.d - WIDTH / 2 - 2.5) * 1.1;
    return Math.min(h, allowed);
  };
  return { pts, length: L, near, carve, width: WIDTH };
}

export class Expressway {
  constructor(game, sb, plan) {
    this.game = game; this.sb = sb; this.plan = plan;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.pts = plan.pts;
    this.build();
  }

  groundAt(x, z) {
    const g = this.game;
    if (x < -1712 && z > -421) return -12; // the sea bed
    if (z < -421) return g.ridgeback ? g.ridgeback.heightAt(x, z) : LAND_Y;
    if (x > -1115) return LAND_Y;
    return g.park.heightAt(x, z);
  }

  build() {
    const g = this.group, sb = this.sb, P = this.pts;
    const concrete = std({ color: 0xbab4a8, roughness: 0.9 }), dark = std({ color: 0x8a857c, roughness: 0.9 });
    const roadTex = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#3a3d41'; c.fillRect(0, 0, w, h); speckle(c, w, h, 700, 0.06);
      c.fillStyle = '#e8e8e2'; for (const x of [0.27, 0.73]) for (let y = 0; y < h; y += 32) c.fillRect(w * x - 1, y, 2, 18);
      c.fillStyle = '#e8c547'; c.fillRect(w / 2 - 3, 0, 2, h); c.fillRect(w / 2 + 1, 0, 2, h);
      c.fillStyle = '#e8e8e2'; c.fillRect(6, 0, 2, h); c.fillRect(w - 8, 0, 2, h);
    });
    ribbon(g, P, WIDTH - 1.2, std({ map: roadTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }), { uScale: 14, lift: 0.03 });
    const lampM = new THREE.MeshBasicMaterial({ color: 0xfff1c8 }), poleM = std({ color: 0x6a6e74, metalness: 0.5 });
    const Q = (yaw, pitch) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    this.lamps = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), pitch = -Math.atan2(b.y - a.y, L);
      const len = Math.hypot(L, b.y - a.y) + 0.25, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
      const q = Q(yaw, pitch);
      // the deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 1.0, len), concrete);
      deck.position.set(mx, my - 0.5, mz); deck.quaternion.copy(q); deck.receiveShadow = true; deck.castShadow = true; g.add(deck);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(WIDTH / 2, 0.5, len / 2).setTranslation(mx, my - 0.5, mz).setRotation(q));
      // crash barriers both sides (concrete, waist high)
      const nx = Math.cos(yaw), nz = -Math.sin(yaw);
      for (const s of [-1, 1]) {
        const bx = mx + nx * s * (WIDTH / 2 - 0.3), bz = mz + nz * s * (WIDTH / 2 - 0.3);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, len), concrete); bar.position.set(bx, my + 0.47, bz); bar.quaternion.copy(q); bar.castShadow = true; g.add(bar);
        sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.6, len / 2).setTranslation(bx, my + 0.55, bz).setRotation(q));
      }
      // piers wherever it's up in the air, every 30 m
      if (i % 6 === 3) {
        const gy = Math.min(...[[0, 0], [4, 0], [-4, 0]].map(([o]) => this.groundAt(mx + nx * o, mz + nz * o)));
        const hgt = my - 1.0 - gy;
        if (hgt > 2.5) {
          for (const s of [-1, 1]) {
            const px = mx + nx * s * 3.6, pz = mz + nz * s * 3.6;
            const col = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, hgt, 12), concrete); col.position.set(px, gy + hgt / 2, pz); col.castShadow = true; g.add(col);
            sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(hgt / 2, 1.05).setTranslation(px, gy + hgt / 2, pz));
          }
          const capB = new THREE.Mesh(new THREE.BoxGeometry(WIDTH - 1, 1.2, 2.2), dark); capB.position.set(mx, my - 1.6, mz); capB.rotation.y = yaw; g.add(capB);
        }
      }
      // street lights every 40 m, alternating sides
      if (i % 8 === 4) {
        const s = (i / 8) % 2 < 1 ? 1 : -1, lx = mx + nx * s * (WIDTH / 2 - 0.2), lz = mz + nz * s * (WIDTH / 2 - 0.2);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 8, 6), poleM); pole.position.set(lx, my + 4, lz); g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), poleM); arm.position.set(lx - nx * s * 1.1, my + 7.9, lz - nz * s * 1.1); arm.rotation.y = yaw + Math.PI / 2; g.add(arm);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.4), lampM); head.position.set(lx - nx * s * 2.1, my + 7.8, lz - nz * s * 2.1); head.rotation.y = yaw; head.userData.noMerge = true; g.add(head);
        this.lamps.push(head);
      }
    }
    // signs at each end
    const side = (i, off, facing) => { const a = P[i], c = P[i + 1], yaw = Math.atan2(c.x - a.x, c.z - a.z); return { x: a.x + Math.cos(yaw) * off, z: a.z - Math.sin(yaw) * off, y: a.y, yaw: yaw + facing }; };
    { const q = side(2, -(WIDTH / 2 + 1.5), Math.PI); sign(g, 'RIDGEBACK EXPRESSWAY · RIDGEBACK HILLS', q.x, q.y + 3.4, q.z, q.yaw, { w: 7.5, h: 1.2, bg: '#1f5a2a', fg: '#ffffff', post: q.y }); }
    { const q = side(P.length - 4, WIDTH / 2 + 1.5, 0); sign(g, 'EXPRESSWAY · VERIAN CITY', q.x, q.y + 3.4, q.z, q.yaw, { w: 6.5, h: 1.2, bg: '#1f5a2a', fg: '#ffffff', post: q.y }); }
    this.mapLine = P.filter((_, i) => i % 4 === 0).map((p) => [p.x, p.z]);
  }
}
