import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collapse a static group's thousands of little meshes into a few big ones (per material look
// and per 200 m tile), so a whole city costs a few dozen draw calls instead of over a thousand.

const hexOf = (c) => (c ? c.getHexString() : '-');
function matKey(m) {
  return [m.type, hexOf(m.color), m.map?.source?.uuid ?? '-', m.map ? `${m.map.repeat.x},${m.map.repeat.y}` : '',
    hexOf(m.emissive), m.emissiveIntensity, m.emissiveMap?.source?.uuid ?? '-', m.roughness, m.metalness,
    m.transparent, m.opacity, m.flatShading, m.side].join('|');
}

export function mergeStatic(group, tile = 200) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.noMerge) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.lights || p.userData.noMerge) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => !m.isMeshStandardMaterial || m.transparent)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv || !g.attributes.normal) return;
    g.applyMatrix4(o.matrixWorld);
    const wp = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const cell = `${Math.floor(wp.x / tile)},${Math.floor(wp.z / tile)}`;
    const parts = Array.isArray(o.material) && g.groups.length
      ? g.groups.map((gr) => ({ mat: mats[gr.materialIndex], start: gr.start, count: gr.count }))
      : [{ mat: mats[0], start: 0, count: g.attributes.position.count }];
    for (const part of parts) {
      let sub = g;
      if (parts.length > 1 || part.count !== g.attributes.position.count) {
        sub = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) {
          const a = g.attributes[name];
          sub.setAttribute(name, new THREE.BufferAttribute(a.array.slice(part.start * a.itemSize, (part.start + part.count) * a.itemSize), a.itemSize));
        }
      } else sub.clearGroups();
      const key = `${matKey(part.mat)}#${o.castShadow ? 1 : 0}#${cell}`;
      if (!buckets.has(key)) buckets.set(key, { mat: part.mat, cast: o.castShadow, geos: [] });
      buckets.get(key).geos.push(sub);
    }
    victims.push(o);
  });
  for (const o of victims) o.removeFromParent();
  // drop empty groups left behind
  const empties = [];
  group.traverse((o) => { if (o !== group && o.isGroup && o.children.length === 0) empties.push(o); });
  for (const e of empties) e.removeFromParent();
  for (const { mat, cast, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    group.add(m);
  }
  return buckets.size;
}
