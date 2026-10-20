import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLOW } from './effects.js';

// Shared bits for building islands: textures, buildings, houses, signs, lamps, cars.

export function canvasTex(w, h, draw, repeat) {
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

export const speckle = (g, w, h, n, a = 0.08) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
};

export const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

// Box whose UVs are scaled by face size so tiled textures keep their size in world units.
export function worldBox(w, h, d, tile = 4, tileY = tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    const isSide = f !== 2 && f !== 3;
    uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / (isSide ? tileY : tile));
  }
  return g;
}

// Facade texture: one tile = one window bay (4 m wide, 3.5 m storey).
const facadeCache = new Map();
export function facadeTex(wall, glass, lit = 0.25, style = 0) {
  const key = `${wall}|${glass}|${style}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const t = canvasTex(128, 112, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 300, 0.05);
    if (style === 1) { // full-glass office band
      g.fillStyle = glass; g.fillRect(4, 10, w - 8, h - 20);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(4, 10, w - 8, 6);
    } else {
      g.fillStyle = glass; g.fillRect(24, 22, w - 48, h - 44);
      g.fillStyle = Math.random() < lit ? 'rgba(255,230,160,0.55)' : 'rgba(255,255,255,0.08)';
      g.fillRect(24, 22, w - 48, (h - 44) / 2);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.strokeRect(24, 22, w - 48, h - 44);
    }
  });
  facadeCache.set(key, t);
  return t;
}

// A static, solid box with collider in the given sandbox.
export function solidBox(group, sb, w, h, d, x, y, z, mat, { collide = true, rotY = 0 } = {}) {
  const m = new THREE.Mesh(Array.isArray(mat) ? new THREE.BoxGeometry(w, h, d) : worldBox(w, h, d, 4, 3.5), mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  if (collide) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z).setRotation(q));
  }
  return m;
}

// City building: facade-textured box with a darker roof and a little rooftop kit.
const WALLS = ['#b9b2a6', '#9aa3ab', '#c8bfae', '#7f8a93', '#a69886', '#d2cdc4', '#8e8173', '#6f7b84'];
const GLASS = ['#2c4a5e', '#33505f', '#3d5566', '#28414f', '#4a6273'];
export function building(group, sb, x, z, w, d, h, y0) {
  const wall = WALLS[Math.floor(Math.random() * WALLS.length)];
  const glass = GLASS[Math.floor(Math.random() * GLASS.length)];
  const style = h > 40 && Math.random() < 0.5 ? 1 : 0;
  const fac = facadeTex(wall, glass, 0.3, style).clone();
  fac.needsUpdate = true;
  const sideM = std({ map: fac, roughness: style ? 0.3 : 0.8, metalness: style ? 0.3 : 0.05 });
  const roofM = std({ color: 0x55585c });
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, (uv.getX(k) * dims[f][0]) / 4, (uv.getY(k) * dims[f][1]) / 3.5);
  }
  const m = new THREE.Mesh(geo, [sideM, sideM, roofM, roofM, sideM, sideM]);
  m.position.set(x, y0 + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y0 + h / 2, z));
  // rooftop: parapet + AC unit / water tank
  const kit = std({ color: 0x8b9095 });
  const ac = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w, 6) * 0.5, 1.6, Math.min(d, 6) * 0.5), kit);
  ac.position.set(x + (Math.random() - 0.5) * w * 0.4, y0 + h + 0.8, z + (Math.random() - 0.5) * d * 0.4);
  group.add(ac);
  return m;
}

// Small gabled house (Saltmarsh Key).
const HOUSE_WALLS = [0xf1e3c8, 0xd8e6ef, 0xf3d1c4, 0xe4ecd2, 0xefe7a8, 0xffffff, 0xc9d6e3, 0xe8c9a0];
const ROOFS = [0x8c3b2e, 0x4b5563, 0x6b3f2a, 0x2f4f6f, 0x7a2e2e];
export function house(group, sb, x, y0, z, yaw, w = 8, d = 7, h = 3.8) {
  const g = new THREE.Group();
  g.position.set(x, y0, z);
  g.rotation.y = yaw;
  const wallM = std({ color: HOUSE_WALLS[Math.floor(Math.random() * HOUSE_WALLS.length)] });
  const roofM = std({ color: ROOFS[Math.floor(Math.random() * ROOFS.length)], roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM);
  body.position.y = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.4, 0); shape.lineTo(w / 2 + 0.4, 0); shape.lineTo(0, 2.2); shape.closePath();
  const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false });
  rg.translate(0, 0, -(d + 0.8) / 2);
  const roof = new THREE.Mesh(rg, roofM);
  roof.position.y = h;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), std({ color: 0x5a3a22 }));
  door.position.set(0, 1.05, d / 2 + 0.03);
  const winM = std({ color: 0x9fd0f0, roughness: 0.15, metalness: 0.2, emissive: 0x16324a });
  g.add(body, roof, door);
  for (const wx of [-w / 2 + 1.6, w / 2 - 1.6]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.1), winM);
    win.position.set(wx, h * 0.55, d / 2 + 0.03);
    g.add(win);
  }
  // porch step
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 1.2), std({ color: 0x9a8f80 }));
  step.position.set(0, 0.1, d / 2 + 0.6);
  g.add(step);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(g);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, (h + 1.1) / 2, d / 2).setTranslation(x, y0 + (h + 1.1) / 2, z).setRotation(q));
  // a spot on the porch for loot (world coords)
  return new THREE.Vector3(0, 0.45, d / 2 + 0.9).applyQuaternion(q).add(new THREE.Vector3(x, y0, z));
}

export function sign(group, text, x, y, z, yaw, { w = 6, h = 1.4, bg = '#1f3b63', fg = '#ffffff', glow = false } = {}) {
  const t = canvasTex(512, Math.round((512 * h) / w), (g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    g.fillStyle = fg;
    g.font = `bold ${Math.round(ch * 0.62)}px "Chakra Petch", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, cw / 2, ch / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: glow ? 0xffffff : 0x000000, emissiveMap: glow ? t : null, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  group.add(m);
  return m;
}

export function lamp(group, sb, x, y0, z) {
  const iron = std({ color: 0x2a2c30, roughness: 0.5, metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 8), iron);
  pole.position.set(x, y0 + 3.5, z);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.4), std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 0.7 }));
  head.position.set(x, y0 + 7, z);
  group.add(pole, head);
  sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(3.5, 0.14).setTranslation(x, y0 + 3.5, z));
}

export function tree(group, sb, x, y0, z, s = 1) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.32 * s, 3 * s, 7), std({ color: 0x6b4a2f }));
  trunk.position.set(x, y0 + 1.5 * s, z);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1 * s, 0), std({ color: [0x3f7d3a, 0x4f8f3f, 0x2f6b34][Math.floor(Math.random() * 3)], flatShading: true }));
  crown.position.set(x, y0 + 4.1 * s, z);
  trunk.castShadow = crown.castShadow = true;
  group.add(trunk, crown);
  sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(1.5 * s, 0.32 * s).setTranslation(x, y0 + 1.5 * s, z));
}

// A car body (nose toward -Z). Police cars get a light bar.
export function carMesh(color = 0x2f7fd8, police = false) {
  const g = new THREE.Group();
  const paint = std({ color, roughness: 0.35, metalness: 0.4 });
  const dark = std({ color: 0x1b1c1e, roughness: 0.9 });
  const glassM = std({ color: 0x1d2a33, roughness: 0.1, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.5), paint);
  body.position.y = 0.65;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.3), glassM);
  cabin.position.set(0, 1.35, 0.25);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 2.0), paint);
  roof.position.set(0, 1.7, 0.3);
  g.add(body, cabin, roof);
  if (police) {
    const white = std({ color: 0xf2f2ee, roughness: 0.4 });
    for (const z of [-0.9, 0.9]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.5, 1.0), white);
      door.position.set(0, 0.7, z * 0.6);
      g.add(door);
    }
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x0030ff, emissiveIntensity: 1 }));
    blue.position.x = 0.35;
    bar.add(red, blue);
    bar.position.set(0, 1.82, 0.3);
    g.add(bar);
    const glowR = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff2020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const glowB = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x3060ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glowR.position.set(-0.35, 1.9, 0.3); glowB.position.set(0.35, 1.9, 0.3);
    glowR.scale.setScalar(2.5); glowB.scale.setScalar(2.5);
    g.add(glowR, glowB);
    g.userData.lights = { red, blue, glowR, glowB };
  }
  for (const [x, z] of [[-0.85, -1.45], [0.85, -1.45], [-0.85, 1.45], [0.85, 1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    g.add(w);
  }
  const lampM = std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 0.8 });
  for (const x of [-0.65, 0.65]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.05), lampM);
    l.position.set(x, 0.75, -2.26);
    g.add(l);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
