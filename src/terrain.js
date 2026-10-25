import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAND_Y } from './world.js';
import { std } from './buildkit.js';

// Shared bits for the sculpted areas (Pelican Point, Ridgeback Hills, the Scorch): value noise,
// roads that the ground is graded to, a terrain mesh with a matching collider, and ribbons
// (asphalt or dirt) draped along a road.

export function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 5) { let t = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { t += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return t / 0.97; }
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a seeded random (so an area's scenery comes out the same every time you play)
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------------------------------------------------------------- roads
// A road: a smooth line through control points, sampled every 3 m, each sample with a height.
// yOf(s, x, z, L) gives the road height at distance s along it (then it's smoothed so there are no lumps).
export function makeRoad(ctrl, { width = 10, kind = 'asphalt', loop = false, yOf, smoothN = 8, name = '', maxGrade = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), loop, 'centripetal');
  const L = curve.getLength(), n = Math.max(2, Math.ceil(L / 3));
  const pts = curve.getSpacedPoints(n).map((p, i) => ({ x: p.x, z: p.z, s: (i / n) * L }));
  if (loop) pts.pop();
  const raw = pts.map((p) => yOf(p.s, p.x, p.z, L));
  pts.forEach((p, i) => {
    let a = 0, c = 0;
    for (let k = -smoothN; k <= smoothN; k++) {
      let j = i + k;
      if (loop) j = (j + pts.length) % pts.length;
      if (j < 0 || j >= pts.length) continue;
      a += raw[j]; c++;
    }
    p.y = a / c;
  });
  // no steeper than maxGrade: cut down through humps both ways (a road climbs; it doesn't jump)
  if (maxGrade && !loop) {
    for (let i = 1; i < pts.length; i++) pts[i].y = Math.min(pts[i].y, pts[i - 1].y + maxGrade * (pts[i].s - pts[i - 1].s));
    for (let i = pts.length - 2; i >= 0; i--) pts[i].y = Math.min(pts[i].y, pts[i + 1].y + maxGrade * (pts[i + 1].s - pts[i].s));
  }
  return { pts, width, kind, loop, length: L, name };
}

// Find the nearest road sample fast: samples bucketed on a 24 m grid.
export class RoadIndex {
  constructor(roads, cell = 24) {
    this.cell = cell;
    this.map = new Map();
    for (const r of roads) for (const p of r.pts) {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push({ p, r });
    }
  }

  // nearest sample within `reach` metres (or null)
  nearest(x, z, reach = 40) {
    const c = this.cell, n = Math.ceil(reach / c), cx = Math.floor(x / c), cz = Math.floor(z / c);
    let best = null, bd = reach * reach;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const list = this.map.get(`${cx + i},${cz + j}`);
      if (!list) continue;
      for (const e of list) { const d = (e.p.x - x) ** 2 + (e.p.z - z) ** 2; if (d < bd) { bd = d; best = e; } }
    }
    return best ? { p: best.p, r: best.r, d: Math.sqrt(bd) } : null;
  }
}

// ---------------------------------------------------------------- the ground
// The island's bank (a slab down into the sea) plus a sculpted top that follows heightAt(), with
// a trimesh collider. colorAt(x, y, z, ny) returns [r, g, b] multipliers on the texture.
export function buildTerrain(group, sb, isl, { heightAt, step = 6, map, sideColor = 0x8a8478, colorAt = null, roughness = 1 }) {
  const w = isl.x1 - isl.x0, d = isl.z1 - isl.z0, cx = (isl.x0 + isl.x1) / 2, cz = (isl.z0 + isl.z1) / 2;
  const bank = std({ color: sideColor, roughness: 1 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 14, d), bank);
  slab.position.set(cx, LAND_Y - 7.02, cz);
  slab.userData.noMerge = true;
  group.add(slab);
  sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, 7, d / 2).setTranslation(cx, LAND_Y - 7, cz));
  const geo = new THREE.PlaneGeometry(w, d, Math.round(w / step), Math.round(d / step));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i) + cx, pos.getZ(i) + cz));
  geo.computeVertexNormals();
  if (colorAt) {
    const col = new Float32Array(pos.count * 3), nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const c = colorAt(pos.getX(i) + cx, pos.getY(i), pos.getZ(i) + cz, nrm.getY(i));
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const mesh = new THREE.Mesh(geo, std({ map, vertexColors: !!colorAt, roughness }));
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  mesh.userData.noMerge = true;
  group.add(mesh);
  const verts = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { verts[i * 3] = pos.getX(i) + cx; verts[i * 3 + 1] = pos.getY(i); verts[i * 3 + 2] = pos.getZ(i) + cz; }
  sb.addStaticCollider(RAPIER.ColliderDesc.trimesh(verts, new Uint32Array(geo.index.array)));
  return mesh;
}

// A strip of road surface laid along points (each with x, z and y), lifted a touch off the ground.
export function ribbon(group, pts, width, mat, { uScale = 20, lift = 0.12, loop = false, yOf = null } = {}) {
  const v = [], uv = [], idx = [];
  const P = loop ? [...pts, pts[0]] : pts;
  let run = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i) run += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
    for (const sgn of [-1, 1]) {
      const x = P[i].x - tz * sgn * width / 2, z = P[i].z + tx * sgn * width / 2;
      v.push(x, (yOf ? yOf(P[i], x, z) : P[i].y) + lift, z);
      uv.push(sgn < 0 ? 0 : 1, run / uScale);
    }
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  gg.setIndex(idx);
  gg.computeVertexNormals();
  const m = new THREE.Mesh(gg, mat);
  m.receiveShadow = true;
  m.userData.noMerge = true;
  group.add(m);
  return m;
}

// Lots of one thing (pines, cacti, rocks) as an instanced mesh. place(i) returns
// { x, y, z, s, yaw, color? } or null to skip; collide(x, y, z, s) adds a collider if wanted.
export function scatter(group, geo, mat, n, place, { collide = null, shadow = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.userData.noMerge = true;
  im.castShadow = shadow; im.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    const o = place(i);
    if (!o) continue;
    q.setFromAxisAngle(up, o.yaw ?? 0);
    sc.set(o.sx ?? o.s, o.sy ?? o.s, o.sz ?? o.s);
    p.set(o.x, o.y, o.z);
    m.compose(p, q, sc);
    im.setMatrixAt(k, m);
    if (o.color != null) im.setColorAt(k, new THREE.Color(o.color));
    collide?.(o);
    k++;
  }
  im.count = k;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  group.add(im);
  return im;
}
