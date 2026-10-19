import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// The town around the original sandbox pad: grass, a ring road, houses, trees,
// and a jump park for the quad bikes on the east side.

const RING = 52; // ring road centre line (half size of the square)
const ROAD_W = 9;

function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function grassTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#6f9a4a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? `rgba(60,100,40,${0.25 + Math.random() * 0.3})` : `rgba(150,190,90,${0.15 + Math.random() * 0.25})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2 + Math.random() * 4);
    }
  });
}

function asphaltTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#3d4044';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    // dashed centre line runs along V
    g.fillStyle = '#f2c230';
    for (let y = 0; y < s; y += 64) g.fillRect(s / 2 - 4, y + 8, 8, 36);
    // edge lines
    g.fillStyle = '#e8e8e8';
    g.fillRect(10, 0, 5, s);
    g.fillRect(s - 15, 0, 5, s);
  });
}

function pavementTex() {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#b9b4aa';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#9d988f';
    g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(0, (i * s) / 2); g.lineTo(s, (i * s) / 2); g.stroke();
      g.beginPath(); g.moveTo((i * s) / 2, 0); g.lineTo((i * s) / 2, s); g.stroke();
    }
  });
}

function dirtTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#a07a4f';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '70,45,20' : '200,170,120'},${Math.random() * 0.25})`;
      g.fillRect(Math.random() * s, Math.random() * s, 3, 3);
    }
  });
}

// Flat decal-style quad lying on the ground (no collider).
function flat(scene, w, d, x, z, tex, y = 0.01, rotY = 0, repeat = [1, 1]) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(repeat[0], repeat[1]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  m.rotation.set(-Math.PI / 2, 0, rotY);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

function prismGeometry(w, h, d) {
  // triangular roof prism, ridge along Z
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

const WALLS = [0xf1e3c8, 0xd8e6ef, 0xf3d1c4, 0xe4ecd2, 0xefe7a8, 0xffffff, 0xc9d6e3];
const ROOFS = [0x8c3b2e, 0x4b5563, 0x6b3f2a, 0x2f4f6f, 0x7a2e2e];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function buildTown(game, block, padTex) {
  const sb = game.sandbox;
  const scene = game.scene;
  const grass = grassTex(), asphalt = asphaltTex(), pave = pavementTex(), dirt = dirtTex();

  // --- ground cover: grass everywhere, the old grey dev pad stays in the middle ---
  flat(scene, 400, 400, 0, 0, grass, 0.015, 0, [50, 50]);
  flat(scene, 84, 84, 0, 0, padTex, 0.025, 0, [21, 21]);

  // --- ring road with pavements ---
  const L = RING * 2 + ROAD_W;
  for (const s of [-1, 1]) {
    // north/south (along X)
    flat(scene, ROAD_W, L, 0, s * RING, asphalt, 0.04, Math.PI / 2, [1, L / 8]);
    // east/west (along Z)
    flat(scene, ROAD_W, L, s * RING, 0, asphalt, 0.042, 0, [1, L / 8]);
    for (const side of [-1, 1]) {
      const off = s * RING + side * (ROAD_W / 2 + 1.25);
      flat(scene, L + 5, 2.5, 0, off, pave, 0.03, 0, [(L + 5) / 2.5, 1]);
      flat(scene, 2.5, L + 5, off, 0, pave, 0.031, 0, [1, (L + 5) / 2.5]);
    }
  }
  // spokes from the pad out to the ring
  flat(scene, ROAD_W, RING - 40, 0, 40 + (RING - 40) / 2 - ROAD_W / 2, asphalt, 0.04, 0, [1, 2]);
  flat(scene, ROAD_W, RING - 34, 34 + (RING - 34) / 2 - ROAD_W / 2, 0, asphalt, 0.04, Math.PI / 2, [1, 2]);

  // --- houses around the outside of the ring ---
  const houses = [];
  const house = (x, z, faceYaw) => {
    const w = 7 + Math.random() * 3, d = 7 + Math.random() * 2, h = 3.6 + Math.random() * 1.6;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = faceYaw;
    const wallM = new THREE.MeshStandardMaterial({ color: pick(WALLS), roughness: 0.85 });
    const roofM = new THREE.MeshStandardMaterial({ color: pick(ROOFS), roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM);
    body.position.y = h / 2;
    const roofH = 1.6 + Math.random() * 0.8;
    const roof = new THREE.Mesh(prismGeometry(w + 0.8, roofH, d + 0.8), roofM);
    roof.position.y = h;
    const doorM = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.12), doorM);
    door.position.set(0, 1.05, d / 2 + 0.03);
    const winM = new THREE.MeshStandardMaterial({ color: 0x9fd0f0, roughness: 0.15, metalness: 0.2, emissive: 0x16324a });
    g.add(body, roof, door);
    for (const wx of [-w / 2 + 1.6, w / 2 - 1.6]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.1), winM);
      win.position.set(wx, h * 0.55, d / 2 + 0.03);
      g.add(win);
    }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a5a44 }));
    chimney.position.set(w * 0.25, h + roofH * 0.6, -d * 0.2);
    g.add(chimney);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceYaw);
    const col = RAPIER.ColliderDesc.cuboid(w / 2, (h + roofH * 0.5) / 2, d / 2)
      .setTranslation(x, (h + roofH * 0.5) / 2, z)
      .setRotation(q);
    sb.addStaticCollider(col);
    // little front path
    const path = flat(scene, 1.4, 4.5, 0, 0, pave, 0.035, 0, [1, 2]);
    const front = new THREE.Vector3(0, 0, d / 2 + 2.25).applyQuaternion(q);
    path.position.set(x + front.x, 0.035, z + front.z);
    path.rotation.z = faceYaw;
    houses.push({ x, z, r: Math.max(w, d) * 0.75 + 2 });
  };
  const outer = RING + ROAD_W / 2 + 3.5 + 5; // set back from the pavement
  for (let i = -4; i <= 4; i++) {
    const t = i * 11.5;
    if (Math.abs(t) > 47) continue;
    house(t + (Math.random() - 0.5) * 2, outer, Math.PI); // north side faces -z... (toward road)
    house(t + (Math.random() - 0.5) * 2, -outer, 0);
    house(-outer, t + (Math.random() - 0.5) * 2, Math.PI / 2);
    if (Math.abs(t) > 25) house(outer, t + (Math.random() - 0.5) * 2, -Math.PI / 2); // east side leaves room for the jump park
  }

  // --- trees ---
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const leafMs = [0x3f7d3a, 0x4f8f3f, 0x2f6b34, 0x5b9a44].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  const tree = (x, z) => {
    const s = 0.8 + Math.random() * 0.6;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 2.4 * s, 8), trunkM);
    trunk.position.y = 1.2 * s;
    g.add(trunk);
    const leafM = pick(leafMs);
    if (Math.random() < 0.5) {
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((1.6 - k * 0.4) * s, 1.8 * s, 9), leafM);
        cone.position.y = (2.4 + k * 1.0) * s;
        g.add(cone);
      }
    } else {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 0), leafM);
      blob.position.y = 3.2 * s;
      g.add(blob);
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * 6;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(1.4 * s, 0.26 * s).setTranslation(x, 1.4 * s, z));
  };
  const nearRoad = (x, z) => {
    const m = Math.max(Math.abs(x), Math.abs(z));
    return Math.abs(m - RING) < ROAD_W / 2 + 4.5;
  };
  const inPark = (x, z) => x > RING + 6 && x < 135 && Math.abs(z) < 26;
  let placed = 0;
  for (let i = 0; i < 400 && placed < 70; i++) {
    const x = (Math.random() - 0.5) * 230, z = (Math.random() - 0.5) * 230;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m < 42) continue; // keep the sandbox pad clear
    if (nearRoad(x, z) || inPark(x, z)) continue;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < h.r + 1.5)) continue;
    tree(x, z);
    placed++;
  }

  // --- quad jump park, east of the ring ---
  const px = RING + ROAD_W / 2 + 6;
  flat(scene, 75, 50, px + 37, 0, dirt, 0.025, 0, [8, 5]);
  const dirtM = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xb5834f, roughness: 0.85 });
  const ramp = (x, z, len, height, width, m = wood, yaw = 0) => {
    const ang = Math.atan2(height, len);
    const L2 = Math.hypot(len, height);
    // rotate around Z so it rises toward +X
    block(L2, 0.4, width, x, height / 2 - 0.1, z, m, [0, yaw, ang]);
  };
  // kickers of increasing size
  ramp(px + 10, -12, 5, 1.2, 4);
  ramp(px + 26, -12, 6, 2.0, 4.5);
  ramp(px + 44, -12, 7, 3.0, 5);
  // tabletop: up, flat, down
  ramp(px + 12, 10, 6, 1.8, 6, dirtM);
  block(8, 1.8, 6, px + 19, 0.9, 10, dirtM);
  ramp(px + 26, 10, 6, 1.8, 6, dirtM, Math.PI);
  // a mound
  const mound = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), dirtM);
  mound.scale.set(1, 0.35, 1);
  mound.position.set(px + 50, 0, 12);
  mound.receiveShadow = mound.castShadow = true;
  scene.add(mound);
  // collider: a squashed ball approximated by a convex hull of the mound vertices
  const pos = mound.geometry.attributes.position;
  const pts = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    pts[i * 3] = pos.getX(i);
    pts[i * 3 + 1] = pos.getY(i) * 0.35;
    pts[i * 3 + 2] = pos.getZ(i);
  }
  sb.addStaticCollider(RAPIER.ColliderDesc.convexHull(pts).setTranslation(px + 50, 0, 12));
  // tyre barriers around the park
  const tyreM = new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const tx = px + 3 + i * 2.9;
    for (const tz of [-24, 24]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.2, 8, 14), tyreM);
      t.rotation.x = Math.PI / 2;
      t.position.set(tx, 0.2, tz);
      t.castShadow = true;
      scene.add(t);
      sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(0.2, 0.62).setTranslation(tx, 0.2, tz));
    }
  }

  return { parkX: px, ring: RING };
}
