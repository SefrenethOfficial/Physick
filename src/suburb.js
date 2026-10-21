import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, speckle, std, worldBox } from './buildkit.js';

// Suburban homes for Saltmarsh Key: lap-siding houses with pitched shingle roofs, porches,
// shuttered windows, attached garages, driveways, mailboxes, hedges and back-yard fences.
// Materials are shared per colour so the whole neighbourhood merges into a few draw calls.

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

const SIDING = ['#f2efe8', '#d9dde0', '#a9b8c4', '#c9d3b8', '#efe2b8', '#d8c3a5', '#b9c6cf', '#e8d6cf', '#9fb0a0'];
const TRIM = 0xf7f5ef;
const SHUTTER = [0x2b3a2e, 0x1f2a3a, 0x3a2b2b, 0x2a2a2a, 0x4a5a6a];
const DOORS = [0x7a1f24, 0x1f3a5a, 0x2b4a30, 0x2a2a2a, 0xc9a24a, 0xe8e2d4];
const ROOFS = ['#3a3c40', '#4a3e36', '#2f3438', '#5a4a40'];

const sidingM = (hex) => once(`sid${hex}`, () => {
  const t = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = hex; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { c.fillStyle = 'rgba(0,0,0,.13)'; c.fillRect(0, y + 6, w, 2); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, y, w, 1); }
    speckle(c, w, h, 80, 0.03);
  });
  return std({ map: t, roughness: 0.85, side: THREE.DoubleSide });
});
const brickM = () => once('brick', () => std({ map: canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#8d8478'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < w; x += 16) { c.fillStyle = `rgb(${140 + Math.random() * 30},${70 + Math.random() * 20},${55 + Math.random() * 15})`; c.fillRect(x + 1, y + 1, 14, 6); }
}), roughness: 0.95 }));
const roofM = (hex) => once(`roof${hex}`, () => {
  const t = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = hex; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? -6 : 0; x < w; x += 12) {
      c.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.2})`; c.fillRect(x, y + 6, 12, 2); c.fillRect(x, y, 1, 8);
    }
    speckle(c, w, h, 200, 0.08);
  });
  return std({ map: t, roughness: 0.95, side: THREE.DoubleSide });
});
const plain = (hex, o = {}) => once(`p${hex}${JSON.stringify(o)}`, () => std({ color: hex, roughness: 0.7, ...o }));
const glassM = () => once('glass', () => std({ color: 0x3a4d5c, roughness: 0.15, metalness: 0.4, emissive: 0x1a2530, emissiveIntensity: 0.4 }));
const concreteM = () => once('conc', () => std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#b9b5ad'; c.fillRect(0, 0, w, h); speckle(c, w, h, 300, 0.06); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 0, w, 1); c.fillRect(0, 0, 1, h); }), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }));
const garageDoorM = () => once('gdoor', () => std({ map: canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#f1efea'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, y, w, 2); }
  for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { c.strokeStyle = 'rgba(0,0,0,.1)'; c.strokeRect(x + 3, y + 4, 10, 9); }
}), roughness: 0.6 }));
const fenceM = () => once('fence', () => std({ map: canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#9a7650'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, 0, 1, h); c.fillStyle = `rgba(255,220,180,${Math.random() * 0.1})`; c.fillRect(x + 1, 0, 7, h); }
}), roughness: 0.9 }));
const hedgeM = () => once('hedge', () => std({ color: 0x3f6a32, roughness: 1, flatShading: true }));

// A gable roof prism over a w × d footprint (ridge along x), eaves at y = 0, overhang o.
function gableRoof(w, d, rise, o = 0.45) {
  const hw = w / 2 + o, hd = d / 2 + o;
  const v = [
    // north slope
    -hw, 0, -hd, hw, 0, -hd, hw, rise, 0, -hw, 0, -hd, hw, rise, 0, -hw, rise, 0,
    // south slope
    -hw, 0, hd, -hw, rise, 0, hw, rise, 0, -hw, 0, hd, hw, rise, 0, hw, 0, hd,
  ];
  const slope = Math.hypot(hd, rise);
  const uv = [0, 0, w / 2, 0, w / 2, slope / 2, 0, 0, w / 2, slope / 2, 0, slope / 2,
    0, 0, 0, slope / 2, w / 2, slope / 2, 0, 0, w / 2, slope / 2, w / 2, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// Triangular gable-end wall (the bit of wall under the roof at each end).
function gableEnds(w, d, rise) {
  const hw = w / 2, hd = d / 2;
  const v = [-hw, 0, -hd, -hw, 0, hd, -hw, rise, 0, hw, 0, hd, hw, 0, -hd, hw, rise, 0];
  const uv = [0, 0, d / 2, 0, d / 4, rise / 2, 0, 0, d / 2, 0, d / 4, rise / 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Build one home on a lot. (x, z): centre of the lot's street edge; yaw: the direction the
// house faces (towards the street). lotW × lotD: lot size. Returns useful points.
export function suburbanHome(group, sb, x, y0, z, yaw, lotW, lotD, R = Math.random) {
  const pick = (a) => a[Math.floor(R() * a.length)];
  const root = new THREE.Group();
  root.position.set(x, y0, z);
  root.rotation.y = yaw;
  group.add(root);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const W = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(root.position);
  const add = (geo, mat, lx, ly, lz, ry = 0, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(lx, ly, lz);
    m.rotation.y = ry;
    m.castShadow = cast; m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const collide = (w, h, d, lx, ly, lz) => {
    const p = W(lx, ly + h / 2, lz);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, p.y, p.z).setRotation(q));
  };
  const box = (w, h, d, lx, ly, lz, mat, { solid = false, cast = true, tile = 2 } = {}) => {
    const m = add(worldBox(w, h, d, tile, tile), mat, lx, ly + h / 2, lz, 0, cast);
    if (solid) collide(w, h, d, lx, ly, lz);
    return m;
  };

  // local frame: +z towards the street; the lot runs from z = 0 (street edge) back to z = -lotD
  const floors = R() < 0.5 ? 2 : 1;
  const storey = 2.9;
  const hw = floors === 2 ? 9 + R() * 2 : 11 + R() * 3; // house width
  const hd = 8 + R() * 2;
  const garage = R() < 0.75;
  const gw = garage ? 4.8 : 0;
  const gSide = R() < 0.5 ? -1 : 1;
  const total = hw + gw;
  const setback = 7.5 + R() * 2;
  const hx = garage ? -gSide * gw / 2 : 0; // house centre x
  const hz = -setback - hd / 2;
  const wallH = floors * storey;
  const sid = sidingM(pick(SIDING));
  const brickFront = R() < 0.25;
  const roofMat = roofM(pick(ROOFS));
  const trim = plain(TRIM);
  const shutter = plain(pick(SHUTTER));

  // foundation, walls
  box(hw + 0.2, 0.45, hd + 0.2, hx, 0, hz, plain(0x8f8a82));
  box(hw, wallH, hd, hx, 0.45, hz, sid, { solid: true });
  if (brickFront) box(hw + 0.04, 1.1, 0.06, hx, 0.45, hz + hd / 2 + 0.02, brickM(), { cast: false });
  // corner boards and a band between floors
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(0.16, wallH, 0.16, hx + s * hw / 2, 0.45, hz + t * hd / 2, trim, { cast: false });
  if (floors === 2) box(hw + 0.06, 0.14, hd + 0.06, hx, 0.45 + storey, hz, trim, { cast: false });
  // roof
  const rise = (floors === 2 ? 0.45 : 0.5) * hd;
  add(gableRoof(hw, hd, rise), roofMat, hx, 0.45 + wallH, hz);
  add(gableEnds(hw, hd, rise), sid, hx, 0.45 + wallH, hz);
  box(hw + 0.9, 0.12, 0.2, hx, 0.45 + wallH - 0.12, hz + hd / 2 + 0.4, trim, { cast: false }); // fascia
  box(hw + 0.9, 0.12, 0.2, hx, 0.45 + wallH - 0.12, hz - hd / 2 - 0.4, trim, { cast: false });
  if (R() < 0.45) box(0.9, rise + 1.6, 0.9, hx + (R() < 0.5 ? -1 : 1) * (hw / 2 - 1.2), 0.45 + wallH, hz - hd / 4, brickM()); // chimney

  // front door and porch
  const doorX = hx + (floors === 2 ? 0 : (R() - 0.5) * (hw - 4));
  const front = hz + hd / 2;
  box(1.1, 2.15, 0.08, doorX, 0.45, front + 0.03, plain(pick(DOORS)), { cast: false });
  box(1.4, 2.4, 0.06, doorX, 0.45, front + 0.01, trim, { cast: false });
  const porchW = floors === 2 ? 3.6 : 2.6;
  box(porchW, 0.4, 2, doorX, 0, front + 1, plain(0xb9b5ad), { solid: true });
  box(porchW - 0.6, 0.2, 0.4, doorX, 0, front + 2.2, plain(0xb9b5ad));
  if (floors === 2 || R() < 0.5) { // porch roof on two columns
    for (const s of [-1, 1]) box(0.18, 2.6, 0.18, doorX + s * (porchW / 2 - 0.2), 0.4, front + 1.8, trim);
    box(porchW + 0.3, 0.15, 2.3, doorX, 3.0, front + 1.05, roofMat);
  }
  // windows: frame, glass, shutters
  const win = (lx, ly, lz, ry) => {
    const g = new THREE.Group();
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.08), trim);
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.1), glassM());
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.12), trim);
    const mull2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.12), trim);
    g.add(f, p, mull, mull2);
    for (const s of [-1, 1]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.06), shutter); sh.position.x = s * 0.9; g.add(sh); }
    g.position.set(lx, ly, lz); g.rotation.y = ry;
    root.add(g);
  };
  for (let f = 0; f < floors; f++) {
    const y = 0.45 + f * storey + 1.55;
    const n = Math.max(2, Math.floor((hw - 1) / 3));
    for (let i = 0; i < n; i++) {
      const wx = hx - hw / 2 + (hw / n) * (i + 0.5);
      if (f === 0 && Math.abs(wx - doorX) < 1.6) continue;
      win(wx, y, front + 0.05, 0);
      if (R() < 0.7) win(wx, y, hz - hd / 2 - 0.05, Math.PI);
    }
    for (const s of [-1, 1]) if (!(garage && s === gSide) || f === 1) win(hx + s * (hw / 2 + 0.05), y, hz + (R() - 0.5) * 2, s * Math.PI / 2);
  }

  // attached garage with its own lower roof
  let drive = doorX;
  if (garage) {
    const gx = hx + gSide * (hw / 2 + gw / 2), gd = 6.6;
    const gz = front - gd / 2 + 0.6;
    box(gw, 3, gd, gx, 0.15, gz, sid, { solid: true });
    add(gableRoof(gw, gd, 1.6, 0.3).rotateY(Math.PI / 2), roofMat, gx, 3.15, gz);
    add(gableEnds(gw, gd, 1.6).rotateY(Math.PI / 2), sid, gx, 3.15, gz);
    box(gw - 1, 2.3, 0.08, gx, 0.15, gz + gd / 2 + 0.03, garageDoorM(), { cast: false });
    box(gw - 0.6, 0.18, 0.12, gx, 2.45, gz + gd / 2 + 0.05, trim, { cast: false });
    drive = gx;
  }
  // driveway and front walk, out to the kerb
  const conc = concreteM();
  const dLen = garage ? setback - 0.6 + 4 : setback + 4;
  const dw = garage ? gw - 0.4 : 3;
  const dm = add(new THREE.PlaneGeometry(dw, dLen), conc, drive, 0.06, -dLen / 2 + 4, 0, false);
  dm.rotation.x = -Math.PI / 2;
  if (garage) {
    const wl = setback - 2.2;
    const wm = add(new THREE.PlaneGeometry(1.2, wl), conc, doorX, 0.065, front + 2.2 + wl / 2 - (setback - 2.2) - 0 + (setback - 2.2), 0, false);
    wm.rotation.x = -Math.PI / 2;
    wm.position.z = front + 2.4 + wl / 2;
  }
  // mailbox at the kerb
  box(0.1, 1, 0.1, drive + (gSide || 1) * (dw / 2 + 0.6), 0, -0.4, plain(0x3a3c40));
  box(0.3, 0.25, 0.5, drive + (gSide || 1) * (dw / 2 + 0.6), 1, -0.4, plain(pick([0x2a2a2a, 0x1f3a5a, 0xe8e2d4]), { metalness: 0.5 }));
  // hedges along the front, either side of the driveway
  if (R() < 0.6) {
    const hz2 = front + 0.7;
    const segs = [[hx - hw / 2 + 0.6, doorX - porchW / 2 - 0.3], [doorX + porchW / 2 + 0.3, hx + hw / 2 - 0.6]];
    for (const [a, b] of segs) if (b - a > 0.8) box(b - a, 0.9, 0.7, (a + b) / 2, 0, hz2, hedgeM());
  }
  // back-yard privacy fence
  const fm = fenceM();
  const back = -lotD + 0.3, fy = 1.8;
  const lx0 = -lotW / 2 + 0.2, lx1 = lotW / 2 - 0.2;
  box(lotW - 0.4, fy, 0.08, 0, 0, back, fm, { solid: true, cast: true, tile: 1.8 });
  const sideFrom = hz - hd / 2 + 1;
  for (const lx of [lx0, lx1]) box(0.08, fy, sideFrom - back, lx, 0, (sideFrom + back) / 2, fm, { solid: true, tile: 1.8 });
  // gaps between the house and the side fences, closed with a gate run
  const gateL = hx - hw / 2 - (garage && gSide < 0 ? gw : 0) - lx0, gateR = lx1 - (hx + hw / 2 + (garage && gSide > 0 ? gw : 0));
  if (gateL > 0.3) box(gateL, fy, 0.08, (lx0 + hx - hw / 2 - (garage && gSide < 0 ? gw : 0)) / 2, 0, sideFrom, fm, { solid: true, tile: 1.8 });
  if (gateR > 0.3) box(gateR, fy, 0.08, (lx1 + hx + hw / 2 + (garage && gSide > 0 ? gw : 0)) / 2, 0, sideFrom, fm, { solid: true, tile: 1.8 });

  return {
    porch: W(doorX, 0.6, front + 1.4),
    drive: W(drive, 0, 2.5 - setback / 2),
    driveYaw: yaw,
    garage,
    frontYard: W(hx + (R() < 0.5 ? -1 : 1) * (total / 2 - 2), 0, -setback / 2),
    backYard: W((R() - 0.5) * (lotW - 6), 0, back + 5),
  };
}
