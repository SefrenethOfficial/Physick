import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, std, speckle, worldBox } from './buildkit.js';

// The insides of the homes you can buy. Each one is a furnished set built well below its own
// house (under the island's bedrock, like the lab), with painted views in the windows. Walk in
// through the front door and you're moved down into it; walk out and you're back on the step.

export const FLOOR_Y = -34;
const T = 0.2; // wall thickness

// ---------------------------------------------------------------- textures
const cache = new Map();
const tex = (key, w, h, draw) => { if (!cache.has(key)) cache.set(key, canvasTex(w, h, draw)); return cache.get(key); };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const shade = (c, k) => { const o = new THREE.Color(c); o.multiplyScalar(k); return '#' + o.getHexString(); };

function woodTex(base) {
  return tex(`wood${base}`, 256, 256, (c, w, h) => {
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const off = (r * 97) % 256;
      for (let x = -256; x < 256; x += 128) {
        c.fillStyle = shade(base, 0.86 + ((r * 7 + x / 128 + 9) % 5) * 0.06);
        c.fillRect(x + off, (r * h) / rows, 128, h / rows);
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + off, (r * h) / rows, 2, h / rows);
      }
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(0, (r * h) / rows, w, 1.5);
      for (let k = 0; k < 6; k++) { c.strokeStyle = 'rgba(60,30,10,.12)'; c.beginPath(); const y = (r + 0.2 + Math.random() * 0.6) * (h / rows); c.moveTo(0, y); c.bezierCurveTo(80, y + 3, 160, y - 3, w, y + 1); c.stroke(); }
    }
  });
}
function tileTex(a, b, n = 4) {
  return tex(`tile${a}${b}${n}`, 128, 128, (c, w, h) => {
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? a : b; c.fillRect(i * s, j * s, s, s); }
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.5;
    for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, h); c.moveTo(0, i * s); c.lineTo(w, i * s); c.stroke(); }
  });
}
function marbleTex() {
  return tex('marble', 256, 256, (c, w, h) => {
    c.fillStyle = '#ecebe6'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) {
      c.strokeStyle = `rgba(120,120,125,${0.08 + Math.random() * 0.15})`; c.lineWidth = 0.6 + Math.random() * 1.6;
      c.beginPath(); let x = Math.random() * w, y = 0; c.moveTo(x, y);
      while (y < h) { x += (Math.random() - 0.5) * 40; y += 10 + Math.random() * 20; c.lineTo(x, y); }
      c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,.08)'; c.strokeRect(0, 0, w, h);
  });
}
function paintTex(base, stripe = null, stains = false) {
  return tex(`paint${base}${stripe}${stains}`, 128, 128, (c, w, h) => {
    c.fillStyle = hex(base); c.fillRect(0, 0, w, h);
    if (stripe != null) for (let x = 0; x < w; x += 16) { c.fillStyle = hex(stripe); c.fillRect(x, 0, 5, h); }
    speckle(c, w, h, 500, 0.03);
    if (stains) for (let k = 0; k < 5; k++) { const g = c.createRadialGradient(Math.random() * w, Math.random() * h, 2, Math.random() * w, Math.random() * h, 40); g.addColorStop(0, 'rgba(90,70,30,.18)'); g.addColorStop(1, 'rgba(90,70,30,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  });
}
function carpetTex(base) { return tex(`carpet${base}`, 128, 128, (c, w, h) => { c.fillStyle = hex(base); c.fillRect(0, 0, w, h); speckle(c, w, h, 3000, 0.1); }); }
function rugTex(a, b, style) {
  return tex(`rug${a}${b}${style}`, 256, 192, (c, w, h) => {
    c.fillStyle = a; c.fillRect(0, 0, w, h);
    c.strokeStyle = b; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
    c.lineWidth = 3; c.strokeRect(30, 30, w - 60, h - 60);
    c.fillStyle = b;
    if (style === 0) { c.beginPath(); c.ellipse(w / 2, h / 2, 50, 34, 0, 0, 7); c.fill(); c.fillStyle = a; c.beginPath(); c.ellipse(w / 2, h / 2, 30, 18, 0, 0, 7); c.fill(); }
    if (style === 1) for (let x = 44; x < w - 40; x += 24) c.fillRect(x, 40, 8, h - 80);
    if (style === 2) for (let i = 0; i < 5; i++) { c.save(); c.translate(56 + i * 36, h / 2); c.rotate(Math.PI / 4); c.fillRect(-12, -12, 24, 24); c.restore(); }
    speckle(c, w, h, 1500, 0.08);
  });
}
// a canvas of abstract art for the walls
function artTex(seed) {
  return tex(`art${seed}`, 160, 120, (c, w, h) => {
    let s = seed * 9301 + 49297; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const pal = [['#e8d5b0', '#c0442c', '#2f4f6f', '#e0a030', '#1b1b1b'], ['#f2efe8', '#3a7d6a', '#e2b04a', '#d06a4a', '#22313f'], ['#20232a', '#f2d23a', '#e8789f', '#5ab0ff', '#f2f2ee']][seed % 3];
    c.fillStyle = pal[0]; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 7; k++) {
      c.fillStyle = pal[1 + Math.floor(R() * 4)]; c.globalAlpha = 0.85;
      if (R() < 0.5) { c.beginPath(); c.arc(R() * w, R() * h, 10 + R() * 35, 0, 7); c.fill(); }
      else c.fillRect(R() * w, R() * h, 15 + R() * 60, 8 + R() * 40);
    }
    c.globalAlpha = 1;
  });
}
function posterTex(seed) {
  return tex(`poster${seed}`, 96, 136, (c, w, h) => {
    const bg = ['#1b1b1b', '#b3261e', '#22313f', '#f2d23a'][seed % 4];
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = seed % 4 === 3 ? '#1b1b1b' : '#f2efe8'; c.font = 'bold 18px Arial'; c.textAlign = 'center';
    c.fillText(['SKULLZ', 'VERIAN', 'NO LIMIT', 'LOUD'][seed % 4], w / 2, 30);
    c.beginPath(); c.arc(w / 2, 78, 26, 0, 7); c.fill();
    c.font = '11px Arial'; c.fillText('LIVE · ONE NIGHT', w / 2, 126);
  });
}
function screenTex(kind) {
  return tex(`screen${kind}`, 192, 108, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    if (kind === 'game') { g.addColorStop(0, '#2a6fd8'); g.addColorStop(1, '#7fd3ff'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#3aa760'; c.fillRect(0, h * 0.7, w, h); c.fillStyle = '#c23b2a'; c.fillRect(80, h * 0.55, 30, 14); c.fillStyle = '#fff'; c.font = 'bold 14px Arial'; c.fillText('LAP 2/3', 8, 18); }
    else { g.addColorStop(0, '#0e1a2a'); g.addColorStop(1, '#203a5a'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#c0442c'; c.fillRect(0, h - 26, w, 26); c.fillStyle = '#fff'; c.font = 'bold 13px Arial'; c.fillText('VERIAN NEWS · BREAKING', 8, h - 9); c.fillStyle = '#e8d5b0'; c.beginPath(); c.arc(w * 0.65, h * 0.45, 22, 0, 7); c.fill(); c.fillRect(w * 0.65 - 26, h * 0.45 + 18, 52, 30); }
  });
}
// what you see out of the windows
function viewTex(kind) {
  return tex(`view${kind}`, 512, 256, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h * 0.7);
    if (kind === 'city') { sky.addColorStop(0, '#1a1638'); sky.addColorStop(0.6, '#6a3a6a'); sky.addColorStop(1, '#f08a4a'); }
    else if (kind === 'alley') { sky.addColorStop(0, '#9aa3ab'); sky.addColorStop(1, '#c8c4bc'); }
    else { sky.addColorStop(0, '#5a9ad8'); sky.addColorStop(1, '#cfe6f5'); }
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    let s = 7; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    if (kind === 'city') {
      for (let layer = 0; layer < 2; layer++) {
        for (let x = 0; x < w;) {
          const bw = 20 + R() * 45, bh = (layer ? 50 : 90) + R() * (layer ? 60 : 120);
          c.fillStyle = layer ? '#141826' : '#232a3e'; c.fillRect(x, h - bh - (layer ? 0 : 20), bw, bh + 20);
          for (let yy = h - bh + 6; yy < h - 4; yy += 8) for (let xx = x + 4; xx < x + bw - 4; xx += 7) if (R() < 0.45) { c.fillStyle = R() < 0.8 ? '#ffd88a' : '#bfe0ff'; c.fillRect(xx, yy, 3, 4); }
          x += bw + R() * 6;
        }
      }
      c.fillStyle = 'rgba(255,255,255,.8)'; for (let k = 0; k < 30; k++) c.fillRect(R() * w, R() * h * 0.35, 1.5, 1.5);
    } else if (kind === 'alley') {
      c.fillStyle = '#7a3a2a'; c.fillRect(0, h * 0.18, w, h);
      for (let y = h * 0.18; y < h; y += 8) for (let x = ((y / 8) % 2) * 12; x < w; x += 24) { c.fillStyle = `rgba(0,0,0,${0.1 + R() * 0.15})`; c.fillRect(x, y, 22, 1.5); c.fillRect(x, y, 1.5, 8); }
      for (let i = 0; i < 4; i++) { c.fillStyle = '#2a2e33'; c.fillRect(40 + i * 120, h * 0.3, 70, 50); c.fillStyle = 'rgba(255,220,150,.35)'; c.fillRect(44 + i * 120, h * 0.32, 62, 44); }
      c.strokeStyle = '#1b1d20'; c.lineWidth = 3; for (let y = h * 0.55; y < h; y += 36) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      for (let x = 10; x < w; x += 22) { c.beginPath(); c.moveTo(x, h * 0.55); c.lineTo(x, h); c.lineWidth = 1.5; c.stroke(); }
    } else {
      // Saltmarsh: lawns, picket fences, the houses across the street, trees
      c.fillStyle = '#79a85a'; c.fillRect(0, h * 0.62, w, h);
      c.fillStyle = '#55585e'; c.fillRect(0, h * 0.8, w, h * 0.08);
      for (let x = 0; x < w; x += 92) {
        const hw = 60 + R() * 20, hh = 40 + R() * 25, col = ['#d8d2c4', '#a8c0d0', '#e8dcb0', '#c4d4b8', '#f2f0ea'][Math.floor(R() * 5)];
        c.fillStyle = col; c.fillRect(x + 10, h * 0.62 - hh, hw, hh);
        c.fillStyle = '#5a4a3e'; c.beginPath(); c.moveTo(x + 4, h * 0.62 - hh); c.lineTo(x + 10 + hw / 2, h * 0.62 - hh - 26); c.lineTo(x + 16 + hw, h * 0.62 - hh); c.fill();
        c.fillStyle = '#3a4a5a'; c.fillRect(x + 20, h * 0.62 - hh + 10, 10, 10); c.fillRect(x + hw - 10, h * 0.62 - hh + 10, 10, 10);
        c.fillStyle = '#6a3a2a'; c.fillRect(x + hw / 2 + 5, h * 0.62 - 20, 9, 20);
      }
      for (let k = 0; k < 9; k++) { const x = R() * w, y = h * 0.62; c.fillStyle = '#5a3a2a'; c.fillRect(x - 2, y - 30, 4, 30); c.fillStyle = ['#3f7a3a', '#4f8a3f', '#2f6a35'][k % 3]; c.beginPath(); c.arc(x, y - 40, 16 + R() * 8, 0, 7); c.fill(); }
      c.fillStyle = '#f2f0ea'; for (let x = 0; x < w; x += 9) c.fillRect(x, h * 0.9, 4, 18); c.fillRect(0, h * 0.92, w, 3);
    }
  });
}

// ---------------------------------------------------------------- a kit for building rooms
class Kit {
  constructor(game, origin) {
    this.game = game;
    this.o = origin.clone();
    this.sb = game.portSandbox;
    this.g = new THREE.Group();
    this.g.position.copy(this.o);
    game.scene.add(this.g);
  }

  col(w, h, d, x, y, z, rotY = 0, rotX = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ'));
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(this.o.x + x, this.o.y + y + h / 2, this.o.z + z).setRotation(q));
  }

  // a box with its bottom at y (local), textured in world units when it has a map
  box(w, h, d, x, y, z, mat, { collide = true, rotY = 0, tile = 2.5, tileY = 2.6, parent = this.g } = {}) {
    const m = new THREE.Mesh(mat.map ? worldBox(w, h, d, tile, tileY) : new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    parent.add(m);
    if (collide && parent === this.g) this.col(w, h, d, x, y, z, rotY);
    return m;
  }

  cyl(r0, r1, h, x, y, z, mat, seg = 16, parent = this.g) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
    m.position.set(x, y + h / 2, z);
    parent.add(m);
    return m;
  }

  // a flat plane facing up (floors, rugs) or down (ceilings)
  plane(w, d, x, y, z, mat, down = false, tile = null) {
    const geo = new THREE.PlaneGeometry(w, d);
    if (tile) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile); }
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.g.add(m);
    return m;
  }

  // A run of wall along one side, with windows (and doorways) cut into it.
  // side: 'n' (-z), 's' (+z), 'e' (+x), 'w' (-x) of the box from x0..x1 / z0..z1; or a partition with 'x'/'z' at a fixed coordinate.
  wall({ along, at, from, to, y0 = 0, h, mat, openings = [], inward = 1, thick = T }) {
    const ops = [...openings].sort((a, b) => a.at - b.at);
    const piece = (a, b, py, ph) => {
      if (b - a < 0.01 || ph < 0.01) return;
      const c = (a + b) / 2, len = b - a;
      if (along === 'x') this.box(len, ph, thick, c, py, at, mat);
      else this.box(thick, ph, len, at, py, c, mat);
    };
    let cur = from;
    for (const op of ops) {
      const a = op.at - op.w / 2, b = op.at + op.w / 2;
      piece(cur, a, y0, h);
      piece(a, b, y0, op.y0 ?? 0);
      piece(a, b, y0 + (op.y0 ?? 0) + op.h, h - (op.y0 ?? 0) - op.h);
      if (op.view) this.window(along, at, op, y0, inward);
      cur = b;
    }
    piece(cur, to, y0, h);
  }

  window(along, at, op, y0, inward) {
    const yb = y0 + op.y0, frameM = std({ color: 0xf2f0ea, roughness: 0.5 });
    const view = new THREE.Mesh(new THREE.PlaneGeometry(op.w + 3, op.h + 2), new THREE.MeshBasicMaterial({ map: viewTex(op.view), fog: false }));
    const out = -inward * (T / 2 + 0.9);
    // frame, sill and glazing bars
    if (along === 'x') {
      view.position.set(op.at, yb + op.h / 2, at + out);
      view.rotation.y = inward > 0 ? 0 : Math.PI;
      this.box(op.w + 0.16, 0.08, 0.32, op.at, yb - 0.08, at + inward * 0.06, frameM, { collide: false });
      this.box(op.w, 0.06, 0.06, op.at, yb + op.h / 2 - 0.03, at, frameM, { collide: false });
      if (op.w > 1.2 && !op.clean) this.box(0.06, op.h, 0.06, op.at, yb, at, frameM, { collide: false });
      this.col(op.w, op.h, T, op.at, yb, at); // the glass
    } else {
      view.position.set(at + out, yb + op.h / 2, op.at);
      view.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.box(0.32, 0.08, op.w + 0.16, at + inward * 0.06, yb - 0.08, op.at, frameM, { collide: false });
      this.box(0.06, 0.06, op.w, at, yb + op.h / 2 - 0.03, op.at, frameM, { collide: false });
      if (op.w > 1.2 && !op.clean) this.box(0.06, op.h, 0.06, at, yb, op.at, frameM, { collide: false });
      this.col(T, op.h, op.w, at, yb, op.at);
    }
    this.g.add(view);
    // a faint pane of glass in front of the view
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(op.w, op.h), new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.5 }));
    glass.position.set(along === 'x' ? op.at : at, yb + op.h / 2, along === 'x' ? at : op.at);
    glass.rotation.y = view.rotation.y;
    this.g.add(glass);
  }

  // A room shell: floor, ceiling, four walls (windows per side), skirting boards.
  shell({ x0, x1, z0, z1, y0 = 0, h, wallM, floorM, ceilM, windows = {}, skirting = 0x6a5a4a, floor = true, ceiling = true }) {
    if (floor) { this.plane(x1 - x0, z1 - z0, (x0 + x1) / 2, y0, (z0 + z1) / 2, floorM, false, 2); this.col(x1 - x0 + 1, 0.4, z1 - z0 + 1, (x0 + x1) / 2, y0 - 0.4, (z0 + z1) / 2); }
    if (ceiling) { this.plane(x1 - x0, z1 - z0, (x0 + x1) / 2, y0 + h, (z0 + z1) / 2, ceilM, true); this.col(x1 - x0 + 1, 0.3, z1 - z0 + 1, (x0 + x1) / 2, y0 + h, (z0 + z1) / 2); }
    this.wall({ along: 'x', at: z0 - T / 2, from: x0 - T, to: x1 + T, y0, h, mat: wallM, openings: windows.n || [], inward: 1 });
    this.wall({ along: 'x', at: z1 + T / 2, from: x0 - T, to: x1 + T, y0, h, mat: wallM, openings: windows.s || [], inward: -1 });
    this.wall({ along: 'z', at: x0 - T / 2, from: z0, to: z1, y0, h, mat: wallM, openings: windows.w || [], inward: 1 });
    this.wall({ along: 'z', at: x1 + T / 2, from: z0, to: z1, y0, h, mat: wallM, openings: windows.e || [], inward: -1 });
    if (skirting != null) {
      const sk = std({ color: skirting, roughness: 0.6 });
      this.box(x1 - x0, 0.1, 0.03, (x0 + x1) / 2, y0, z0 + 0.015, sk, { collide: false });
      this.box(x1 - x0, 0.1, 0.03, (x0 + x1) / 2, y0, z1 - 0.015, sk, { collide: false });
      this.box(0.03, 0.1, z1 - z0, x0 + 0.015, y0, (z0 + z1) / 2, sk, { collide: false });
      this.box(0.03, 0.1, z1 - z0, x1 - 0.015, y0, (z0 + z1) / 2, sk, { collide: false });
    }
  }

  // A piece of furniture: built in its own frame (front faces +z) and turned to face `rotY`.
  // foot: [w, h, d] of the collider (centred on the piece), or null for none.
  item(x, z, rotY, build, foot, y0 = 0) {
    const grp = new THREE.Group();
    grp.position.set(x, y0, z);
    grp.rotation.y = rotY;
    this.g.add(grp);
    const b = (w, h, d, lx, ly, lz, mat) => this.box(w, h, d, lx, ly, lz, mat, { parent: grp, collide: false });
    const c = (r0, r1, h, lx, ly, lz, mat, seg) => this.cyl(r0, r1, h, lx, ly, lz, mat, seg, grp);
    build(b, c, grp);
    if (foot) this.col(foot[0], foot[1], foot[2], x, y0, z, rotY);
    return grp;
  }
}

// ---------------------------------------------------------------- furniture
const M = {
  white: std({ color: 0xf2f0ea, roughness: 0.6 }),
  black: std({ color: 0x1b1c1f, roughness: 0.4, metalness: 0.2 }),
  steel: std({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 }),
  chrome: std({ color: 0xdfe3e8, roughness: 0.15, metalness: 0.95 }),
  oak: std({ color: 0xb08050, roughness: 0.6 }),
  walnut: std({ color: 0x5a3a24, roughness: 0.55 }),
  linen: std({ color: 0xf4f1ea, roughness: 0.95 }),
  glow: std({ color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 1.4 }),
  bulb: std({ color: 0xffffff, emissive: 0xfff0c0, emissiveIntensity: 2.2 }),
  leaf: std({ color: 0x3f7a3a, roughness: 0.8, flatShading: true }),
  pot: std({ color: 0xc8b8a0, roughness: 0.8 }),
};
const fabric = (c) => std({ color: c, roughness: 0.95 });

function sofa(k, x, z, rotY, { len = 2.2, color = 0x5a6a7a, y0 = 0, legs = M.walnut } = {}) {
  const f = fabric(color), cu = fabric(new THREE.Color(color).multiplyScalar(1.12).getHex());
  k.item(x, z, rotY, (b) => {
    b(len, 0.25, 0.9, 0, 0.12, 0, f); // base
    b(len, 0.55, 0.22, 0, 0.12, -0.34, f); // back
    for (const s of [-1, 1]) b(0.2, 0.42, 0.9, s * (len / 2 - 0.1), 0.12, 0, f);
    const n = len > 2 ? 3 : 2, cw = (len - 0.4) / n;
    for (let i = 0; i < n; i++) { b(cw - 0.03, 0.14, 0.62, -len / 2 + 0.2 + cw * (i + 0.5), 0.37, 0.1, cu); b(cw - 0.06, 0.38, 0.14, -len / 2 + 0.2 + cw * (i + 0.5), 0.45, -0.2, cu); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(0.05, 0.12, 0.05, sx * (len / 2 - 0.08), 0, sz * 0.38, legs);
  }, [len, 0.8, 0.9], y0);
}
function armchair(k, x, z, rotY, color = 0x7a5a4a, y0 = 0) { sofa(k, x, z, rotY, { len: 0.95, color, y0 }); }
function coffeeTable(k, x, z, rotY, { w = 1.2, d = 0.6, top = M.walnut, y0 = 0 } = {}) {
  k.item(x, z, rotY, (b) => {
    b(w, 0.05, d, 0, 0.4, 0, top);
    b(w - 0.1, 0.03, d - 0.1, 0, 0.12, 0, top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(0.05, 0.4, 0.05, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), M.black);
    b(0.25, 0.04, 0.18, w * 0.2, 0.45, 0, std({ color: 0xc0442c })); // a book
    b(0.12, 0.1, 0.12, -w * 0.25, 0.45, 0.05, M.white); // a mug
  }, [w, 0.45, d], y0);
}
function rug(k, x, z, w, d, a, b2, style = 0, y0 = 0, rotY = 0) {
  const m = k.plane(w, d, x, y0 + 0.012, z, std({ map: rugTex(a, b2, style), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.z = rotY;
}
function tvUnit(k, x, z, rotY, { w = 1.8, screen = 'news', y0 = 0, big = 1 } = {}) {
  const sm = new THREE.MeshStandardMaterial({ map: screenTex(screen), emissive: 0xffffff, emissiveMap: screenTex(screen), emissiveIntensity: 0.9 });
  k.item(x, z, rotY, (b) => {
    b(w, 0.45, 0.42, 0, 0, 0, M.walnut);
    b(w - 0.1, 0.02, 0.02, 0, 0.22, 0.21, M.black);
    const tw = 1.25 * big, th = 0.72 * big;
    b(0.3, 0.04, 0.2, 0, 0.45, -0.05, M.black);
    b(0.06, 0.12, 0.04, 0, 0.49, -0.08, M.black);
    b(tw, th, 0.05, 0, 0.6, -0.08, M.black);
    b(tw - 0.06, th - 0.06, 0.01, 0, 0.63, -0.05, sm);
    b(0.2, 0.25, 0.25, -w / 2 + 0.2, 0.45, 0, std({ color: 0x2a2c30 })); // speaker
  }, [w, 0.5, 0.42], y0);
}
function bookshelf(k, x, z, rotY, { w = 1.2, h = 2, y0 = 0, wood = M.oak } = {}) {
  const colors = [0xc0442c, 0x2f4f6f, 0xe0a030, 0x3a7d6a, 0xe8d5b0, 0x6a2a8a, 0x1b1b1b];
  k.item(x, z, rotY, (b) => {
    b(w, h, 0.04, 0, 0, -0.16, wood);
    for (const s of [-1, 1]) b(0.04, h, 0.36, s * (w / 2 - 0.02), 0, 0, wood);
    const n = Math.round(h / 0.4);
    for (let i = 0; i <= n; i++) b(w, 0.03, 0.36, 0, (i * h) / n - (i === n ? 0.03 : 0), 0, wood);
    for (let i = 0; i < n; i++) {
      let bx = -w / 2 + 0.06;
      while (bx < w / 2 - 0.12) {
        const bw = 0.03 + Math.random() * 0.05, bh = 0.2 + Math.random() * 0.12;
        if (Math.random() < 0.85) b(bw, bh, 0.22, bx + bw / 2, (i * h) / n + 0.03, 0.02, std({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 0.8 }));
        bx += bw + 0.005;
      }
    }
  }, [w, h, 0.36], y0);
}
function bed(k, x, z, rotY, { w = 1.6, len = 2.05, duvet = 0x4a6a8a, frame = M.walnut, y0 = 0, head = true } = {}) {
  k.item(x, z, rotY, (b) => {
    b(w + 0.08, 0.3, len, 0, 0, 0, frame);
    b(w, 0.22, len - 0.1, 0, 0.3, 0.02, M.linen);
    b(w + 0.04, 0.08, len * 0.68, 0, 0.5, len * 0.15, fabric(duvet));
    b(w + 0.06, 0.4, 0.02, 0, 0.12, len * 0.15 + len * 0.34, fabric(duvet)); // the end of the duvet, hanging
    const np = w > 1.2 ? 2 : 1;
    for (let i = 0; i < np; i++) b(w / np - 0.12, 0.13, 0.4, (i - (np - 1) / 2) * (w / np), 0.52, -len / 2 + 0.3, M.white);
    if (head) b(w + 0.12, 1.05, 0.08, 0, 0, -len / 2 - 0.02, frame);
  }, [w + 0.1, 0.6, len], y0);
}
function nightstand(k, x, z, rotY, { lamp = true, y0 = 0 } = {}) {
  k.item(x, z, rotY, (b, c) => {
    b(0.45, 0.5, 0.4, 0, 0, 0, M.walnut);
    b(0.38, 0.015, 0.01, 0, 0.32, 0.2, M.black);
    if (lamp) { c(0.06, 0.08, 0.04, 0, 0.5, 0, M.black); c(0.015, 0.015, 0.3, 0, 0.54, 0, M.black); c(0.1, 0.15, 0.2, 0, 0.8, 0, M.glow, 14); }
  }, [0.45, 0.6, 0.4], y0);
}
function wardrobe(k, x, z, rotY, { w = 1.4, h = 2.1, y0 = 0, wood = M.oak } = {}) {
  k.item(x, z, rotY, (b) => {
    b(w, h, 0.6, 0, 0, 0, wood);
    b(0.01, h - 0.1, 0.01, 0, 0.05, 0.305, M.black);
    for (const s of [-1, 1]) b(0.025, 0.25, 0.03, s * 0.08, h * 0.5, 0.31, M.steel);
  }, [w, h, 0.6], y0);
}
function dresser(k, x, z, rotY, { w = 1.1, y0 = 0, mirror = true } = {}) {
  k.item(x, z, rotY, (b) => {
    b(w, 0.85, 0.45, 0, 0, 0, M.white);
    for (let i = 0; i < 3; i++) { b(w - 0.06, 0.01, 0.01, 0, 0.27 * (i + 1), 0.226, M.black); b(0.12, 0.025, 0.03, 0, 0.27 * i + 0.14, 0.23, M.steel); }
    if (mirror) { b(0.7, 0.85, 0.03, 0, 0.95, -0.18, M.walnut); b(0.62, 0.77, 0.01, 0, 0.99, -0.16, M.chrome); }
    b(0.1, 0.14, 0.1, w * 0.35, 0.85, 0.05, std({ color: 0xe8789f })); // perfume, a candle
  }, [w, 0.9, 0.45], y0);
}
function chair(k, x, z, rotY, { mat = M.walnut, seat = null, y0 = 0 } = {}) {
  k.item(x, z, rotY, (b) => {
    b(0.44, 0.05, 0.44, 0, 0.44, 0, seat || mat);
    b(0.44, 0.48, 0.04, 0, 0.49, -0.2, mat);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(0.04, 0.44, 0.04, sx * 0.19, 0, sz * 0.19, mat);
  }, null, y0);
}
function diningTable(k, x, z, rotY, { w = 1.8, d = 0.95, top = M.oak, legs = M.walnut, chairs = 4, ends = false, chairMat, y0 = 0, glass = false } = {}) {
  k.item(x, z, rotY, (b) => {
    b(w, 0.05, d, 0, 0.72, 0, top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(0.06, 0.72, 0.06, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), legs);
    b(0.5, 0.02, 0.32, 0, 0.77, 0, M.linen); // a runner
    for (let i = 0; i < 3; i++) b(0.08, 0.12, 0.08, (i - 1) * 0.2, 0.79, 0, glass ? M.chrome : M.white);
  }, [w, 0.8, d], y0);
  const per = chairs / 2;
  const q = (lx, lz) => { const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY); return [x + v.x, z + v.z]; };
  for (let i = 0; i < per; i++) {
    const lx = (i - (per - 1) / 2) * (w / per);
    let [cx, cz] = q(lx, -d / 2 - 0.25); chair(k, cx, cz, rotY, { mat: chairMat, y0 });
    [cx, cz] = q(lx, d / 2 + 0.25); chair(k, cx, cz, rotY + Math.PI, { mat: chairMat, y0 });
  }
  if (ends) for (const s of [-1, 1]) { const [cx, cz] = q(s * (w / 2 + 0.3), 0); chair(k, cx, cz, rotY - s * Math.PI / 2, { mat: chairMat, y0 }); }
}
// a run of kitchen units along a wall: cupboards, worktop, sink and hob
function kitchen(k, x, z, rotY, { len = 3.6, base = M.white, top = std({ color: 0x3a3c40, roughness: 0.35 }), upper = true, sinkAt = 0.3, hobAt = -0.25, y0 = 0, handles = M.steel } = {}) {
  k.item(x, z, rotY, (b, c) => {
    b(len, 0.86, 0.6, 0, 0, 0, base);
    b(len + 0.02, 0.04, 0.62, 0, 0.86, 0.01, top);
    b(len, 0.08, 0.5, 0, 0, -0.02, M.black); // kickboard
    const n = Math.max(2, Math.round(len / 0.6));
    for (let i = 0; i < n; i++) { const cx = -len / 2 + (len / n) * (i + 0.5); b(len / n - 0.02, 0.005, 0.005, cx - len / n / 2 + 0.01, 0.1, 0.301, M.black); b(0.18, 0.02, 0.02, cx, 0.74, 0.31, handles); }
    // sink with a mixer tap
    const sx = sinkAt * len;
    b(0.55, 0.02, 0.4, sx, 0.88, 0.02, M.steel); c(0.02, 0.02, 0.3, sx, 0.88, -0.18, M.chrome, 8); b(0.04, 0.03, 0.18, sx, 1.16, -0.12, M.chrome);
    // hob with four rings and an oven under it
    const hx = hobAt * len;
    b(0.6, 0.015, 0.5, hx, 0.88, 0.02, M.black);
    for (const [ox, oz] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.12], [0.14, 0.12]]) c(0.08, 0.08, 0.005, hx + ox, 0.896, oz, std({ color: 0x3a3a3a }), 16);
    b(0.58, 0.5, 0.01, hx, 0.18, 0.302, M.black); b(0.4, 0.2, 0.012, hx, 0.4, 0.305, std({ color: 0x1a1a1a, roughness: 0.1, metalness: 0.3 }));
    b(0.25, 0.3, 0.22, hx + 0.9, 0.9, -0.1, M.steel); // a kettle-ish thing / microwave
    if (upper) {
      b(len, 0.7, 0.35, 0, 1.5, -0.13, base);
      for (let i = 0; i < n; i++) { const cx = -len / 2 + (len / n) * (i + 0.5); b(len / n - 0.02, 0.005, 0.005, cx - len / n / 2 + 0.01, 1.52, 0.051, M.black); b(0.02, 0.15, 0.02, cx + len / n / 2 - 0.08, 1.56, 0.06, handles); }
      b(0.7, 0.35, 0.45, hx, 1.5, -0.08, M.steel); // extractor hood
    }
  }, [len, 0.9, 0.6], y0);
}
function fridge(k, x, z, rotY, { y0 = 0, big = false } = {}) {
  const w = big ? 0.95 : 0.7;
  k.item(x, z, rotY, (b) => {
    b(w, 1.85, 0.68, 0, 0, 0, M.steel);
    b(w - 0.02, 0.008, 0.01, 0, 1.15, 0.341, M.black);
    if (big) b(0.008, 1.8, 0.01, 0, 0.02, 0.341, M.black);
    for (const s of big ? [-1, 1] : [1]) b(0.03, 0.5, 0.04, s * (big ? 0.06 : w / 2 - 0.08), 1.3, 0.36, M.chrome);
    b(0.03, 0.4, 0.04, w / 2 - 0.08, 0.6, 0.36, M.chrome);
  }, [w, 1.85, 0.68], y0);
}
function island(k, x, z, rotY, { w = 2.2, d = 0.95, base = M.white, top = M.white, stools = 3, y0 = 0 } = {}) {
  k.item(x, z, rotY, (b, c, grp) => {
    b(w, 0.88, d, 0, 0, 0, base);
    b(w + 0.25, 0.05, d + 0.15, 0, 0.88, 0.08, top);
    c(0.15, 0.15, 0.1, -w * 0.25, 0.93, 0, std({ color: 0x8a5a3a }), 12); // fruit bowl
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), std({ color: [0xd8302a, 0x7ad83a, 0xf2b030][i] })); m.position.set(-w * 0.25 + (i - 1) * 0.06, 1.05, 0); grp.add(m); }
  }, [w, 0.95, d], y0);
  const v = (lx, lz) => { const p = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY); return [x + p.x, z + p.z]; };
  for (let i = 0; i < stools; i++) { const [sx, sz] = v((i - (stools - 1) / 2) * 0.62, d / 2 + 0.45); stool(k, sx, sz, y0); }
}
function stool(k, x, z, y0 = 0) {
  k.item(x, z, 0, (b, c) => { c(0.2, 0.2, 0.06, 0, 0.7, 0, M.black, 16); c(0.025, 0.025, 0.7, 0, 0, 0, M.chrome, 8); c(0.18, 0.2, 0.02, 0, 0, 0, M.chrome, 16); c(0.17, 0.17, 0.015, 0, 0.3, 0, M.chrome, 16); }, null, y0);
}
function plant(k, x, z, { s = 1, y0 = 0 } = {}) {
  k.item(x, z, Math.random() * 6, (b, c, grp) => {
    c(0.2 * s, 0.15 * s, 0.4 * s, 0, 0, 0, M.pot, 14);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry((0.18 + Math.random() * 0.12) * s, 0), M.leaf);
      m.position.set((Math.random() - 0.5) * 0.3 * s, (0.5 + Math.random() * 0.5) * s, (Math.random() - 0.5) * 0.3 * s);
      m.scale.y = 1.5;
      grp.add(m);
    }
  }, [0.4 * s, 1 * s, 0.4 * s], y0);
}
function floorLamp(k, x, z, y0 = 0) {
  k.item(x, z, 0, (b, c) => { c(0.15, 0.17, 0.03, 0, 0, 0, M.black); c(0.015, 0.015, 1.5, 0, 0.03, 0, M.black, 8); c(0.16, 0.24, 0.3, 0, 1.45, 0, M.glow, 16); }, [0.3, 1.7, 0.3], y0);
}
function pendant(k, x, y, z, { r = 0.25 } = {}) {
  k.cyl(0.006, 0.006, 0.7, x, y - 0.7, z, M.black, 6);
  const shadeM = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.8, 20, 1, true), std({ color: 0x1b1c1f, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.4 }));
  shadeM.position.set(x, y - 0.7 - r * 0.4, z); k.g.add(shadeM);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 10, 8), M.bulb); bulb.position.set(x, y - 0.7 - r * 0.75, z); k.g.add(bulb);
}
function ceilingLight(k, x, y, z, { r = 0.25 } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, 0.06, 20), M.bulb);
  m.position.set(x, y - 0.03, z); k.g.add(m);
}
// a picture on a wall: `facing` is the direction the picture faces (into the room)
function picture(k, x, y, z, facing, { w = 0.8, h = 0.6, map, frame = M.black } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = facing; k.g.add(g);
  const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.03), frame); g.add(f);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map, roughness: 0.7 })); p.position.z = 0.017; g.add(p);
}
// the way out: a front door in a wall (decorative; you leave by pressing E at it)
function door(k, x, z, facing, { y0 = 0, color = 0x6a3a2a, lift = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = facing; k.g.add(g);
  const frameM = std({ color: lift ? 0x8a8f96 : 0xf2f0ea, roughness: 0.5, metalness: lift ? 0.6 : 0 });
  const add = (w, h, d, lx, ly, lz, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(lx, ly + h / 2, lz); g.add(b); };
  add(1.1, 2.2, 0.06, 0, 0, 0.02, frameM);
  if (lift) { // brushed steel lift doors and a call button
    add(0.48, 2.06, 0.03, -0.25, 0, 0.06, M.steel); add(0.48, 2.06, 0.03, 0.25, 0, 0.06, M.steel);
    add(0.08, 0.14, 0.02, 0.75, 1.15, 0.03, M.black); add(0.03, 0.03, 0.02, 0.75, 1.2, 0.045, M.glow);
    return;
  }
  const dm = std({ color, roughness: 0.6 });
  add(0.95, 2.08, 0.05, 0, 0, 0.06, dm);
  for (const [px, py] of [[-0.2, 1.15], [0.2, 1.15], [-0.2, 0.25], [0.2, 0.25]]) add(0.3, 0.7, 0.02, px, py, 0.095, std({ color: new THREE.Color(color).multiplyScalar(0.85).getHex(), roughness: 0.6 }));
  add(0.04, 0.04, 0.08, 0.38, 1.0, 0.1, M.chrome);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), std({ color: 0x5a4a3a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.013, 0.45); g.add(mat);
}
function radiator(k, x, z, facing, y0 = 0) {
  k.item(x, z, facing, (b) => { for (let i = 0; i < 8; i++) b(0.06, 0.55, 0.08, -0.35 + i * 0.1, 0.12, 0, M.white); b(0.8, 0.04, 0.06, 0, 0.12, 0, M.white); }, null, y0);
}

// ---------------------------------------------------------------- the four homes
// Each builder works in local coordinates: origin at the middle of the ground floor, the front
// door in the +z wall. Returns where you appear, the door out, the bed and the lights.

function hollowsStudio(k) {
  const W = 3.5, D = 3, H = 2.7;
  k.shell({ x0: -W, x1: W, z0: -D, z1: D, h: H, wallM: std({ map: paintTex(0x8a9a78, 0x7e8e6e, true), roughness: 0.95 }), floorM: std({ map: woodTex(0x7a5a3a), roughness: 0.8 }), ceilM: std({ map: paintTex(0xd8d0bc, null, true) }),
    windows: { n: [{ at: 0.8, w: 1.4, y0: 0.9, h: 1.3, view: 'alley' }] }, skirting: 0x4a3a2a });
  door(k, -2, D, Math.PI, { color: 0x4a3a2e });
  // a single bed in the corner with a scruffy blanket, and a crate for a bedside table
  bed(k, -2.95, -2.0, 0, { w: 1.0, len: 1.95, duvet: 0x5a5a6a, frame: std({ color: 0x3a3c40, metalness: 0.5, roughness: 0.5 }), head: false });
  k.item(-1.9, -2.7, 0, (b, c) => { b(0.45, 0.4, 0.4, 0, 0, 0, std({ color: 0x9a7a4a, roughness: 1 })); c(0.04, 0.05, 0.25, 0.1, 0.4, 0, std({ color: 0x3a6a3a, transparent: true, opacity: 0.8 }), 10); }, [0.45, 0.4, 0.4]);
  // kitchenette along the right wall
  kitchen(k, 3.2, -1.3, -Math.PI / 2, { len: 2.8, base: std({ color: 0xc8c0a8, roughness: 0.7 }), top: std({ color: 0x8a7a5a, roughness: 0.6 }), upper: true, sinkAt: -0.25, hobAt: 0.22, handles: M.black });
  fridge(k, 3.1, 0.75, -Math.PI / 2);
  // couch facing a telly on a milk crate, on a worn rug
  rug(k, 0.6, 1.3, 2.4, 1.6, '#7a3a2a', '#c8a060', 1);
  sofa(k, 0.6, 2.45, Math.PI, { len: 1.8, color: 0x6a4a34 });
  k.item(0.6, 0.15, 0, (b) => { b(0.5, 0.35, 0.4, 0, 0, 0, std({ color: 0x2f5a8a })); b(0.62, 0.42, 0.42, 0, 0.35, 0, std({ color: 0x2a2a2a })); b(0.5, 0.33, 0.01, 0, 0.39, 0.215, new THREE.MeshStandardMaterial({ map: screenTex('news'), emissive: 0xffffff, emissiveMap: screenTex('news'), emissiveIntensity: 0.8 })); }, [0.62, 0.8, 0.42]);
  // a folding table and a chair, pizza boxes, empties
  k.item(-1.9, 0.6, 0, (b) => { b(0.8, 0.04, 0.6, 0, 0.72, 0, std({ color: 0xc8c4bc })); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(0.03, 0.72, 0.03, sx * 0.36, 0, sz * 0.26, M.steel); }, [0.8, 0.76, 0.6]);
  chair(k, -1.9, 1.2, Math.PI, { mat: std({ color: 0x3a3c40, metalness: 0.4 }) });
  for (let i = 0; i < 3; i++) k.box(0.42, 0.05, 0.42, -3.1 + (i % 2) * 0.05, i * 0.05, 1.8, std({ color: 0xd8c8a8 }), { collide: false, rotY: i * 0.3 });
  for (let i = 0; i < 4; i++) k.cyl(0.035, 0.035, 0.22, -1.6 + i * 0.12, 0.76, 0.5, std({ color: 0x2a6a3a, transparent: true, opacity: 0.85 }), 8);
  radiator(k, 0.8, -2.85, 0);
  picture(k, -0.5, 1.6, -2.98, 0, { w: 0.55, h: 0.78, map: posterTex(0), frame: M.white });
  picture(k, -3.48, 1.5, -0.5, Math.PI / 2, { w: 0.55, h: 0.78, map: posterTex(1), frame: M.white });
  // a bare bulb
  k.cyl(0.006, 0.006, 0.45, 0, H - 0.45, 0, M.black, 6);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.bulb); bulb.position.set(0, H - 0.5, 0); k.g.add(bulb);
  return { spawn: new THREE.Vector3(-2, 1.1, 2.0), exit: new THREE.Vector3(-2, 0, 2.6), bed: new THREE.Vector3(-2.95, 0, -2.0), wake: new THREE.Vector3(-1.9, 1.1, -1.6), lights: [new THREE.Vector3(0, H - 0.6, 0)], tint: 0xffd8a0, power: 0.75 };
}

function bungalow(k) {
  const H = 2.7;
  const wallM = std({ map: paintTex(0xece4d4), roughness: 0.9 });
  k.shell({ x0: -6, x1: 6, z0: -4.5, z1: 4.5, h: H, wallM, floorM: std({ map: woodTex(0xc09060), roughness: 0.55 }), ceilM: std({ color: 0xf6f4ee }),
    windows: {
      s: [{ at: -4, w: 1.6, y0: 0.9, h: 1.3, view: 'suburb' }, { at: 3.6, w: 1.6, y0: 0.9, h: 1.3, view: 'suburb' }],
      n: [{ at: -3.5, w: 1.2, y0: 1.2, h: 1.0, view: 'suburb' }, { at: 2.4, w: 1.4, y0: 1.15, h: 1.0, view: 'suburb' }],
      w: [{ at: 2.4, w: 1.4, y0: 0.9, h: 1.3, view: 'suburb' }],
      e: [{ at: 2.0, w: 1.4, y0: 0.9, h: 1.3, view: 'suburb' }],
    } });
  // the bedroom in the back left corner (soft blue, carpeted)
  const blue = std({ map: paintTex(0xc8d8e4), roughness: 0.9 });
  k.wall({ along: 'x', at: 0.3, from: -6, to: -1, h: H, mat: wallM, openings: [{ at: -2.0, w: 0.95, y0: 0, h: 2.1 }] });
  k.wall({ along: 'z', at: -1, from: -4.5, to: 0.4, h: H, mat: wallM });
  for (const [w, x, z, ry] of [[4.95, -3.5, 0.18, 0], [4.8, -1.13, -2.1, Math.PI / 2]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), blue); m.position.set(x, H / 2, z); m.rotation.y = ry + Math.PI; k.g.add(m); }
  k.plane(4.95, 4.75, -3.5, 0.01, -2.1, std({ map: carpetTex(0x8a8070), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), false, 2);
  bed(k, -3.5, -3.4, 0, { duvet: 0x3a5a7a });
  nightstand(k, -4.75, -4.15, 0); nightstand(k, -2.25, -4.15, 0);
  wardrobe(k, -5.68, -1.4, Math.PI / 2, { w: 1.3 });
  dresser(k, -1.35, -2.4, -Math.PI / 2, { w: 1.0 });
  rug(k, -3.5, -1.6, 2.2, 1.2, '#e8e0d0', '#5a7a9a', 2);
  picture(k, -5.97, 1.6, -3.5, Math.PI / 2, { w: 1.0, h: 0.6, map: artTex(2), frame: M.white });
  // the living room, front left
  rug(k, -3.5, 2.3, 3.0, 2.0, '#d8cbb0', '#7a4a3a', 0);
  tvUnit(k, -3.5, 0.62, 0, { w: 1.8, screen: 'news' });
  sofa(k, -3.5, 3.85, Math.PI, { len: 2.4, color: 0x6a7a6a });
  coffeeTable(k, -3.5, 2.3, 0, { w: 1.1, d: 0.55 });
  armchair(k, -5.45, 2.0, Math.PI / 2, 0xb08a5a);
  floorLamp(k, -5.6, 3.95);
  plant(k, -1.4, 4.0, { s: 1.1 });
  bookshelf(k, -1.25, 1.4, Math.PI / 2, { w: 1.0, h: 1.8 });
  // kitchen along the back and right walls, tiled
  k.plane(7, 3.6, 2.5, 0.01, -2.7, std({ map: tileTex('#e8e4dc', '#cfcac0'), roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -1 }), false, 2);
  kitchen(k, 2.9, -4.2, 0, { len: 4.2, base: std({ color: 0x8aa6a0, roughness: 0.6 }), top: std({ color: 0xe8e4dc, roughness: 0.3 }), upper: false, sinkAt: 0.0, hobAt: -0.35 });
  k.box(1.2, 0.03, 0.25, 4.4, 1.75, -4.35, M.oak, { collide: false }); // an open shelf
  for (let i = 0; i < 6; i++) k.cyl(0.05, 0.05, 0.14, 3.95 + i * 0.18, 1.78, -4.35, std({ color: [0xe8e4dc, 0x3a7d6a, 0xe0a030][i % 3] }), 10);
  kitchen(k, 5.7, -2.2, -Math.PI / 2, { len: 1.8, base: std({ color: 0x8aa6a0, roughness: 0.6 }), top: std({ color: 0xe8e4dc, roughness: 0.3 }), upper: false, sinkAt: 0.2, hobAt: -10 });
  fridge(k, 0.0, -4.15, 0);
  // dining by the front window
  diningTable(k, 3.0, 1.9, 0, { w: 1.7, d: 0.9, chairs: 4 });
  pendant(k, 3.0, H, 1.9);
  plant(k, 5.5, 4.0);
  picture(k, 5.98, 1.6, 0, -Math.PI / 2, { w: 0.9, h: 0.6, map: artTex(4) });
  door(k, 0.8, 4.5, Math.PI, { color: 0x2f4f6f });
  ceilingLight(k, -3.5, H, 2.2); ceilingLight(k, 2.6, H, -2.4); ceilingLight(k, -3.5, H, -2.1);
  return { spawn: new THREE.Vector3(0.8, 1.1, 3.3), exit: new THREE.Vector3(0.8, 0, 4.1), bed: new THREE.Vector3(-3.5, 0, -3.4), wake: new THREE.Vector3(-2.1, 1.1, -2.6), lights: [new THREE.Vector3(-3, 2.3, 2.0), new THREE.Vector3(2.5, 2.3, -1.5)], tint: 0xffe8c8, power: 1 };
}

function familyHome(k) {
  const H = 3.0, UP = 3.2, H2 = 2.8;
  const wallM = std({ map: paintTex(0xeee8dc), roughness: 0.9 });
  const floorM = std({ map: woodTex(0xb88a5a), roughness: 0.55 });
  const sv = 'suburb';
  // ground floor (no ceiling: the upper floor's slab is the ceiling)
  k.shell({ x0: -6.5, x1: 6.5, z0: -5, z1: 5, h: H, wallM, floorM, ceilM: null, ceiling: false,
    windows: {
      s: [{ at: -4.4, w: 1.4, y0: 0.9, h: 1.4, view: sv }, { at: 0.3, w: 1.4, y0: 0.9, h: 1.4, view: sv }, { at: 5.0, w: 1.4, y0: 0.9, h: 1.4, view: sv }],
      n: [{ at: -1.8, w: 1.6, y0: 0.9, h: 1.4, view: sv }, { at: 3.6, w: 1.4, y0: 1.2, h: 1.0, view: sv }],
      e: [{ at: 2.5, w: 1.6, y0: 0.9, h: 1.4, view: sv }],
    } });
  // the slab between the floors, with the stairwell cut out of it
  const ceilM = std({ color: 0xf6f4ee });
  const slab = (x0, x1, z0, z1) => {
    k.box(x1 - x0, 0.2, z1 - z0, (x0 + x1) / 2, H, (z0 + z1) / 2, ceilM);
    k.plane(x1 - x0, z1 - z0, (x0 + x1) / 2, UP + 0.012, (z0 + z1) / 2, std({ map: carpetTex(0xb8ae9c), roughness: 1 }), false, 2);
  };
  slab(-5.3, 6.5, -5, 5); slab(-6.5, -5.3, -5, -2.5); slab(-6.5, -5.3, 2.5, 5);
  // the stairs: up along the left wall from the back to the front
  const stepM = std({ map: woodTex(0x8a5a34), roughness: 0.55 });
  for (let i = 0; i < 16; i++) { const d = 5 / 16; k.box(1.2, (i + 1) * 0.2, d, -5.9, 0, -2.5 + d * (i + 0.5), stepM, { tile: 1.2, tileY: 1.2 }); }
  const L = Math.hypot(5, 3.2), ang = Math.atan2(3.2, 5);
  k.col(1.2, 0.1, L, -5.9, 1.6 + 0.2 - 0.05 - 0.05, 0, 0, -ang); // a smooth ramp over the steps
  // banister down the open side
  const railM = std({ color: 0xf2f0ea, roughness: 0.5 });
  for (let i = 0; i <= 8; i++) { const z = -2.4 + i * 0.6; k.box(0.05, 0.95, 0.05, -5.28, ((z + 2.5) / 5) * 3.2, z, railM, { collide: false }); }
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, L), std({ color: 0x5a3a24 })); hand.position.set(-5.28, 1.6 + 1.0, 0); hand.rotation.x = -ang; k.g.add(hand);
  k.col(0.1, 1.0, L, -5.25, 1.6 + 0.4, 0, 0, -ang);
  // upstairs: outer walls, the rooms, a rail round the top of the stairwell
  k.shell({ x0: -6.5, x1: 6.5, z0: -5, z1: 5, y0: UP, h: H2, wallM, floorM: null, floor: false, ceilM,
    windows: {
      s: [{ at: -2.5, w: 1.4, y0: 0.9, h: 1.2, view: sv }, { at: 3.0, w: 1.4, y0: 0.9, h: 1.2, view: sv }],
      n: [{ at: -2.3, w: 1.6, y0: 1.0, h: 1.2, view: sv }, { at: 3.6, w: 1.4, y0: 0.9, h: 1.2, view: sv }],
      e: [{ at: -1.5, w: 1.4, y0: 0.9, h: 1.2, view: sv }],
      w: [{ at: -3.8, w: 1.0, y0: 0.9, h: 1.2, view: sv }],
    } });
  k.wall({ along: 'x', at: 2.5, from: -5.3, to: 6.5, y0: UP, h: H2, mat: wallM, openings: [{ at: -3.0, w: 0.95, y0: 0, h: 2.1 }, { at: 3.5, w: 0.95, y0: 0, h: 2.1 }] });
  k.wall({ along: 'z', at: 0.75, from: -5, to: 2.4, y0: UP, h: H2, mat: wallM });
  k.wall({ along: 'z', at: -5.3, from: -2.5, to: 2.5, y0: UP, h: H2, mat: wallM });
  k.box(1.2, 1.0, 0.06, -5.9, UP, -2.5, railM); // the rail at the top of the nook
  // ---- ground floor: living room at the front, dining in the middle, kitchen at the back right
  rug(k, -2.0, 2.5, 3.2, 2.2, '#c8b89a', '#3a5a6a', 2);
  tvUnit(k, -2.0, 4.72, Math.PI, { w: 2.0, screen: 'game' });
  sofa(k, -2.0, 1.0, 0, { len: 2.6, color: 0x4a5a6e });
  coffeeTable(k, -2.0, 2.55, 0, { w: 1.2, d: 0.6, top: M.oak });
  armchair(k, -4.4, 2.6, Math.PI / 2, 0xa06a4a);
  floorLamp(k, -4.6, 4.4);
  plant(k, 1.4, 4.5, { s: 1.2 });
  k.item(4.3, 4.6, Math.PI, (b) => { b(1.2, 0.85, 0.35, 0, 0, 0, M.oak); for (let i = 0; i < 3; i++) b(0.3, 0.02, 0.3, -0.4 + i * 0.4, 0.86, 0, std({ color: [0x8a5a3a, 0x3a5a3a, 0x5a3a5a][i] })); }, [1.2, 0.9, 0.35]); // shoe bench
  for (let i = 0; i < 3; i++) k.box(0.06, 0.06, 0.12, 3.9 + i * 0.3, 1.7, 4.92, M.chrome, { collide: false }); // coat hooks
  k.box(0.5, 0.8, 0.05, 4.2, 1.1, 4.88, fabric(0x8a3a2a), { collide: false }); // a coat
  diningTable(k, -1.8, -2.4, 0, { w: 2.0, d: 1.0, chairs: 4, ends: true });
  pendant(k, -1.8, H, -2.4, { r: 0.3 });
  k.plane(5.6, 4.2, 3.7, 0.01, -2.9, std({ map: tileTex('#f0ece4', '#d8d2c6', 4), roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 }), false, 2);
  kitchen(k, 3.7, -4.7, 0, { len: 4.6, base: std({ color: 0x2f4a5f, roughness: 0.5 }), top: std({ map: marbleTex(), roughness: 0.25 }), upper: true, sinkAt: 0.28, hobAt: -0.2, handles: std({ color: 0xc8a050, metalness: 0.8, roughness: 0.3 }) });
  kitchen(k, 6.2, -2.4, -Math.PI / 2, { len: 1.6, base: std({ color: 0x2f4a5f, roughness: 0.5 }), top: std({ map: marbleTex(), roughness: 0.25 }), upper: false, sinkAt: -10, hobAt: -10, handles: std({ color: 0xc8a050, metalness: 0.8 }) });
  fridge(k, 1.0, -4.62, 0, { big: true });
  island(k, 3.6, -1.9, Math.PI, { w: 2.0, d: 0.9, base: std({ color: 0x2f4a5f }), top: std({ map: marbleTex(), roughness: 0.25 }), stools: 3 });
  picture(k, 6.48, 1.7, 0.4, -Math.PI / 2, { w: 1.0, h: 0.7, map: artTex(1), frame: M.walnut });
  picture(k, -1.8, 1.7, -4.98, 0, { w: 0.8, h: 0.55, map: artTex(5), frame: M.white });
  door(k, 2.5, 5, Math.PI, { color: 0x8a2a2a });
  // ---- upstairs: the master bedroom (left), the kid's room (right), the landing at the front
  const Y = UP;
  rug(k, -2.3, -2.4, 2.6, 1.8, '#e8e0d0', '#8a5a6a', 0, Y);
  bed(k, -2.3, -3.85, 0, { w: 1.8, len: 2.1, duvet: 0x8a5a6a, y0: Y });
  nightstand(k, -3.65, -4.6, 0, { y0: Y }); nightstand(k, -0.95, -4.6, 0, { y0: Y });
  wardrobe(k, -5.0, 0.9, Math.PI / 2, { w: 1.6, y0: Y, h: 2.2 });
  dresser(k, 0.45, -0.6, -Math.PI / 2, { w: 1.1, y0: Y });
  plant(k, -6.0, -4.5, { y0: Y, s: 0.9 });
  picture(k, -2.3, Y + 1.85, -4.98, 0, { w: 1.2, h: 0.5, map: artTex(3), frame: M.walnut }); // over the bed (under the window? no: the window's to the side)
  const kid = std({ map: paintTex(0xf2e2a8), roughness: 0.9 });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(7.4, H2), kid); m.position.set(0.87, Y + H2 / 2, -1.3); m.rotation.y = Math.PI / 2; k.g.add(m); } // an accent wall
  bed(k, 5.9, -3.9, 0, { w: 1.0, len: 2.0, duvet: 0xc0442c, y0: Y, frame: std({ color: 0x3a7d6a }) });
  k.item(1.2, -3.4, Math.PI / 2, (b) => { b(1.3, 0.04, 0.6, 0, 0.74, 0, M.white); for (const s of [-1, 1]) b(0.04, 0.74, 0.58, s * 0.63, 0, 0, M.white); b(0.55, 0.34, 0.03, 0, 0.82, -0.18, M.black); b(0.5, 0.29, 0.01, 0, 0.845, -0.163, new THREE.MeshStandardMaterial({ map: screenTex('game'), emissive: 0xffffff, emissiveMap: screenTex('game'), emissiveIntensity: 0.8 })); b(0.45, 0.02, 0.15, 0, 0.78, 0.1, std({ color: 0x2a2a2a })); }, [1.3, 0.8, 0.6], Y);
  chair(k, 1.75, -3.4, -Math.PI / 2, { mat: std({ color: 0x2f5a8a }), y0: Y });
  k.item(4.5, -0.3, 0, (b) => { b(0.9, 0.45, 0.5, 0, 0, 0, std({ color: 0x3a7d6a })); b(0.9, 0.05, 0.52, 0, 0.45, 0, std({ color: 0xe0a030 })); }, [0.9, 0.5, 0.5], Y); // toy box
  for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), std({ color: [0xc0442c, 0x2f7fd8, 0xe0a030, 0x3aa760, 0xe8789f][i] })); t.position.set(3.3 + (i % 3) * 0.3, Y + 0.08 + (i > 2 ? 0.16 : 0), 0.2 + (i % 2) * 0.1); t.rotation.y = i; k.g.add(t); }
  const bean = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), fabric(0xe8789f)); bean.scale.y = 0.6; bean.position.set(2.0, Y + 0.27, 1.6); k.g.add(bean);
  rug(k, 3.6, -1.5, 2.2, 2.2, '#5ab0ff', '#f2f2ee', 0, Y);
  picture(k, 3.0, Y + 1.6, -4.98, 0, { w: 0.5, h: 0.7, map: posterTex(3), frame: M.white });
  picture(k, 6.48, Y + 1.6, -3.9, -Math.PI / 2, { w: 0.5, h: 0.7, map: posterTex(2), frame: M.white });
  bookshelf(k, -0.5, 4.75, Math.PI, { w: 1.4, h: 1.6, y0: Y });
  plant(k, 5.8, 4.4, { y0: Y });
  k.item(2.0, 4.65, Math.PI, (b) => { b(1.2, 0.45, 0.4, 0, 0, 0, M.oak); b(1.15, 0.1, 0.38, 0, 0.45, 0, fabric(0x6a7a8a)); }, [1.2, 0.55, 0.4], Y); // window seat
  picture(k, -3.8, Y + 1.6, 4.98, Math.PI, { w: 0.9, h: 0.6, map: artTex(6) });
  ceilingLight(k, -2.0, H, 2.4); ceilingLight(k, 3.6, H, -2.6); ceilingLight(k, -2.3, Y + H2, -1.8); ceilingLight(k, 3.6, Y + H2, -1.6); ceilingLight(k, 0, Y + H2, 3.7, { r: 0.2 });
  return { spawn: new THREE.Vector3(2.5, 1.1, 3.8), exit: new THREE.Vector3(2.5, 0, 4.6), bed: new THREE.Vector3(-2.3, Y, -3.85), wake: new THREE.Vector3(-0.8, Y + 1.1, -3.2), lights: [new THREE.Vector3(0, 2.5, 0), new THREE.Vector3(0.5, Y + 2.4, -1.5)], tint: 0xffe8c8, power: 1.1 };
}

function penthouse(k) {
  const H = 3.4;
  const wallM = std({ map: paintTex(0xf4f2ee), roughness: 0.8 });
  const glassRun = (from, to, n, y0 = 0.1) => { const out = []; const w = (to - from) / n; for (let i = 0; i < n; i++) out.push({ at: from + w * (i + 0.5), w: w - 0.14, y0, h: H - 0.25, view: 'city', clean: true }); return out; };
  k.shell({ x0: -10, x1: 10, z0: -7, z1: 7, h: H, wallM, floorM: std({ map: marbleTex(), roughness: 0.2, metalness: 0.1 }), ceilM: std({ color: 0xf6f4ee }),
    windows: { n: glassRun(-10, 10, 7), e: glassRun(-7, 7, 5) }, skirting: 0x2a2a2a });
  const dark = std({ color: 0x23252a, roughness: 0.45 });
  const brass = std({ color: 0xc8a050, metalness: 0.85, roughness: 0.3 });
  // the bedroom suite in the back right corner, behind a wall with a wide opening
  k.wall({ along: 'z', at: 4.29, from: -7, to: 1.3, h: H, mat: wallM });
  k.wall({ along: 'x', at: 1.4, from: 4.39, to: 10, h: H, mat: wallM, openings: [{ at: 5.8, w: 1.4, y0: 0, h: 2.4 }] });
  k.plane(5.6, 8.3, 7.2, 0.012, -2.85, std({ map: carpetTex(0x6a6058), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), false, 2);
  bed(k, 5.6, -3.6, Math.PI / 2, { w: 2.0, len: 2.2, duvet: 0xe8e2d4, frame: dark });
  k.box(0.1, 1.6, 3.4, 4.44, 0, -3.6, std({ color: 0x5a4a3e, roughness: 0.9 }), { collide: false }); // padded headboard wall
  nightstand(k, 4.75, -5.2, Math.PI / 2); nightstand(k, 4.75, -2.0, Math.PI / 2);
  rug(k, 6.9, -3.6, 2.6, 3.4, '#d8d0c0', '#8a7a6a', 1, 0, Math.PI / 2);
  wardrobe(k, 8.8, 0.95, Math.PI, { w: 2.0, h: 2.6, wood: dark });
  armchair(k, 9.0, -6.0, -Math.PI * 0.75, 0xc0a080);
  picture(k, 4.5, 2.4, -3.6, Math.PI / 2, { w: 1.6, h: 0.5, map: artTex(7), frame: brass });
  // the living room: sectional sofa, low table, a huge TV on the left wall
  rug(k, -6.5, -2.0, 4.6, 3.8, '#2a2c30', '#c8a050', 2);
  tvUnit(k, -9.75, -2.0, Math.PI / 2, { w: 2.6, screen: 'news', big: 1.6 });
  sofa(k, -4.7, -2.0, -Math.PI / 2, { len: 3.4, color: 0xd8d2c4, legs: brass });
  sofa(k, -6.4, -4.25, 0, { len: 2.2, color: 0xd8d2c4, legs: brass });
  coffeeTable(k, -6.6, -2.0, Math.PI / 2, { w: 1.6, d: 0.8, top: std({ map: marbleTex(), roughness: 0.2 }) });
  armchair(k, -6.6, 0.4, Math.PI, 0x3a5a6a);
  floorLamp(k, -9.3, -5.4); plant(k, -9.3, 1.2, { s: 1.4 }); plant(k, -3.6, -6.4, { s: 1.2 });
  // the grand piano in the window
  k.item(1.2, -5.2, Math.PI * 0.9, (b, c, grp) => {
    const shape = new THREE.Shape(); shape.moveTo(-0.75, 0.9); shape.lineTo(0.75, 0.9); shape.lineTo(0.75, -0.2); shape.quadraticCurveTo(0.7, -1.0, 0.0, -1.0); shape.quadraticCurveTo(-0.3, -0.9, -0.75, -0.6); shape.lineTo(-0.75, 0.9);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), std({ color: 0x0c0c0e, roughness: 0.15, metalness: 0.3 }));
    body.rotation.x = Math.PI / 2; body.position.y = 1.0; grp.add(body);
    const lid = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), std({ color: 0x0c0c0e, roughness: 0.15 }));
    lid.rotation.set(Math.PI / 2 - 0.6, 0, 0); lid.position.set(0, 1.05, 0.9); grp.add(lid);
    b(1.5, 0.06, 0.18, 0, 0.72, 0.98, M.white); for (let i = 0; i < 18; i++) b(0.025, 0.02, 0.1, -0.68 + i * 0.08, 0.78, 0.95, M.black);
    for (const [lx, lz] of [[-0.6, 0.75], [0.6, 0.75], [0.1, -0.8]]) b(0.08, 0.7, 0.08, lx, 0, lz, std({ color: 0x0c0c0e }));
    b(0.8, 0.06, 0.35, 0, 0.48, 1.45, std({ color: 0x0c0c0e })); for (const s of [-1, 1]) b(0.05, 0.48, 0.3, s * 0.36, 0, 1.45, std({ color: 0x0c0c0e }));
  }, [1.6, 1.0, 2.0]);
  // dining for eight under a long pendant
  diningTable(k, -1.6, -2.2, 0, { w: 2.8, d: 1.1, chairs: 6, ends: true, top: std({ color: 0xcfe6f5, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.4 }), legs: brass, chairMat: dark, glass: true });
  k.box(2.2, 0.06, 0.12, -1.6, H - 1.0, -2.2, brass, { collide: false });
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.bulb); m.position.set(-2.5 + i * 0.6, H - 1.08, -2.2); k.g.add(m); }
  k.cyl(0.006, 0.006, 0.94, -2.6, H - 0.94, -2.2, M.black, 6); k.cyl(0.006, 0.006, 0.94, -0.6, H - 0.94, -2.2, M.black, 6);
  // the kitchen along the front wall, with an island
  k.plane(8, 4, 3.5, 0.012, 4.9, std({ map: woodTex(0x5a3a24), roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -1 }), false, 2);
  kitchen(k, 3.8, 6.68, Math.PI, { len: 5.6, base: dark, top: std({ map: marbleTex(), roughness: 0.2 }), upper: true, sinkAt: -0.25, hobAt: 0.2, handles: brass });
  fridge(k, 7.25, 6.62, Math.PI, { big: true });
  island(k, 3.6, 3.9, Math.PI, { w: 3.0, d: 1.0, base: dark, top: std({ map: marbleTex(), roughness: 0.2 }), stools: 4 });
  pendant(k, 2.8, H, 3.6, { r: 0.2 }); pendant(k, 4.4, H, 3.6, { r: 0.2 });
  // the bar: a backlit bottle wall and a counter
  k.item(-6.4, 6.75, Math.PI, (b) => {
    b(3.2, 2.6, 0.06, 0, 0, -0.12, dark);
    for (const s of [-1, 1]) b(0.08, 2.6, 0.3, s * 1.56, 0, 0, dark);
    b(3.2, 0.1, 0.3, 0, 2.5, 0, dark); b(3.2, 0.5, 0.3, 0, 0, 0, dark);
    b(3.0, 2.0, 0.01, 0, 0.5, -0.085, std({ color: 0xffd88a, emissive: 0xffb050, emissiveIntensity: 0.9 }));
    for (let s = 0; s < 3; s++) { b(3.0, 0.03, 0.26, 0, 0.6 + s * 0.65, 0.01, std({ color: 0xdfe3e8, transparent: true, opacity: 0.6 })); }
  }, [3.2, 2.6, 0.3]);
  for (let s = 0; s < 3; s++) for (let i = 0; i < 12; i++) {
    const col = [0x6a2a1a, 0x2a5a2a, 0xd0a020, 0xe8e8e8, 0x3a1a3a, 0x8a4a1a][(i + s) % 6];
    k.cyl(0.04, 0.04, 0.24 + (i % 3) * 0.04, -7.8 + i * 0.25, 0.63 + s * 0.65, 6.74, std({ color: col, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }), 8);
  }
  k.item(-6.4, 5.2, 0, (b) => { b(3.0, 1.05, 0.6, 0, 0, 0, std({ color: 0x3a2a20, roughness: 0.4 })); b(3.2, 0.05, 0.75, 0, 1.05, 0.05, std({ map: marbleTex(), roughness: 0.2 })); b(3.0, 0.03, 0.03, 0, 0.1, 0.31, brass); }, [3.2, 1.1, 0.75]);
  for (let i = 0; i < 4; i++) stool(k, -7.6 + i * 0.8, 4.4);
  // art, a sculpture, the lift door you came in by
  picture(k, -9.97, 2.0, 3.2, Math.PI / 2, { w: 1.8, h: 1.2, map: artTex(8), frame: brass });
  picture(k, 7.0, 2.2, 1.52, 0, { w: 1.2, h: 0.8, map: artTex(9), frame: M.black });
  k.item(-3.0, 2.5, 0, (b, c, grp) => { c(0.3, 0.3, 0.9, 0, 0, 0, M.white, 20); const t = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.06, 64, 8), brass); t.position.y = 1.25; grp.add(t); }, [0.6, 1.4, 0.6]);
  door(k, -2.0, 7, Math.PI, { lift: true });
  for (const [x, z] of [[-6.5, -2], [-1.6, 2.0], [7.0, -3.4], [3.6, 3.9], [-6.4, 5.0]]) ceilingLight(k, x, H, z, { r: 0.18 });
  return { spawn: new THREE.Vector3(-2.0, 1.1, 5.8), exit: new THREE.Vector3(-2.0, 0, 6.5), bed: new THREE.Vector3(6.6, 0, -3.6), wake: new THREE.Vector3(6.4, 1.1, -1.9), lights: [new THREE.Vector3(-4, 2.9, 0.5), new THREE.Vector3(6.5, 2.9, -2.5)], tint: 0xffe2c0, power: 1.2 };
}

const BUILDERS = { hollows: hollowsStudio, ranch: bungalow, family: familyHome, penthouse };

// Build the inside of home `h` (below its own front door). Returns the room's anchor points in world space.
export function buildInterior(game, h) {
  const origin = new THREE.Vector3(h.door.x, FLOOR_Y, h.door.z);
  const k = new Kit(game, origin);
  const r = BUILDERS[h.id](k);
  const W = (v) => v.clone().add(origin);
  k.g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.matrixAutoUpdate = true; } });
  return { group: k.g, origin, spawn: W(r.spawn), exit: W(r.exit), bed: W(r.bed), wake: W(r.wake), lights: r.lights.map(W), tint: r.tint, power: r.power };
}
