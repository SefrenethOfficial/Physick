import * as THREE from 'three';
import { GLOW } from './effects.js';

// Big aircraft for Act II, built in the shape the Jet class flies: { root, gear, flames, pilot,
// navs }. The root's origin sits at gear height (1.95 m) above the ground; the nose is -Z.

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });

function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// flames that the Jet class can stretch: it moves each one to z = 8.7 + 1.5·length in its parent,
// so the parent sits 8.7 m ahead of the real exhaust
function flame(parent, x, y, z, r = 0.6) {
  const holder = new THREE.Group(); holder.position.set(x, y, z - 8.7); parent.add(holder);
  const f = new THREE.Mesh(new THREE.ConeGeometry(r, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  f.rotation.x = -Math.PI / 2; f.visible = false; holder.add(f);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffb070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(x, y, z + 0.3); glow.visible = false; parent.add(glow);
  return { f, glow };
}

function navLights(parent, span, tail) {
  const mk = (c, x, y, z) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, z); s.scale.setScalar(1.6); parent.add(s); return s; };
  return [mk(0xff2a1a, -span, 0, 1), mk(0x2aff5a, span, 0, 1), mk(0xffffff, 0, tail[0], tail[1])];
}

// A twin-engine airliner, 40 m long, in a livery colour, with its airline name down the side.
export function buildAirliner(livery = 0x1f5fbf, name = 'VERIAN AIR') {
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 2.25; root.add(body); // fuselage centre 4.2 m up
  const L = '#' + new THREE.Color(livery).getHexString();
  const side = tex(1024, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = L; c.fillRect(0, h * 0.62, w, h * 0.14);
    c.fillStyle = '#20252c'; for (let x = 120; x < w - 140; x += 22) c.fillRect(x, h * 0.36, 10, 14); // windows
    c.fillRect(90, h * 0.3, 16, 40); c.fillRect(w - 130, h * 0.3, 16, 40); // doors
    c.fillStyle = L; c.font = 'bold 34px Arial'; c.fillText(name, w * 0.33, h * 0.3);
  });
  const white = std({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.15 }), liv = std({ color: livery }), dark = std({ color: 0x1a1d22, roughness: 0.3 });
  const grey = std({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, sc = null, par = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); if (sc) o.scale.set(...sc); o.castShadow = true; par.add(o); return o; };
  add(new THREE.CylinderGeometry(2.4, 2.4, 30, 20), white, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) { // the livery panel down each side: windows, doors, stripe and the name
    add(new THREE.PlaneGeometry(30, 3.75), std({ map: side, roughness: 0.4, metalness: 0.15, transparent: true }), s * 2.41, 0.1, 0, 0, s * Math.PI / 2);
  }
  add(new THREE.SphereGeometry(2.4, 18, 12), white, 0, 0, -15, 0, 0, 0, [1, 1, 1.7]);
  add(new THREE.ConeGeometry(2.4, 10, 18), white, 0, 0.5, 20, Math.PI / 2, 0, 0, [1, 1, 0.7]);
  add(new THREE.BoxGeometry(1.9, 0.6, 0.4), dark, 0, 1.1, -18.6, -0.6); // cockpit glass
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(16, 0.45, 5.2), white, s * 9.6, -1.2, 0, 0, s * -0.32, s * 0.06); // wing
    add(new THREE.BoxGeometry(1.2, 0.2, 2), liv, s * 17.3, -1.0, 1.6, 0, 0, 0); // wingtip
    add(new THREE.CylinderGeometry(1.15, 1.0, 4.4, 16), grey, s * 7, -2.6, -3, Math.PI / 2); // engine
    add(new THREE.CircleGeometry(0.95, 16), dark, s * 7, -2.6, -5.21, 0, Math.PI);
    add(new THREE.BoxGeometry(6.4, 0.3, 2.6), white, s * 3.8, 1.6, 21, 0, s * -0.3); // tailplane
  }
  add(new THREE.BoxGeometry(0.4, 6.8, 5.2), liv, 0, 4.6, 20.6, -0.35); // fin
  // the gear: two main legs and a nose leg, scaled up and down by the Jet code
  const gear = new THREE.Group(); gear.position.y = 0; root.add(gear);
  for (const [x, z] of [[-2.6, 1], [2.6, 1], [0, -12]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.9, 8), dark); leg.position.set(x, -0.9, z); gear.add(leg);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14), dark); wh.rotation.z = Math.PI / 2; wh.position.set(x, -1.45, z); gear.add(wh);
  }
  gear.children.forEach((o) => { o.position.y += 0; });
  const flames = [flame(body, -7, -2.6, -0.8, 0.8), flame(body, 7, -2.6, -0.8, 0.8)];
  const pilot = new THREE.Object3D();
  const navs = navLights(body, 18, [9, 23]);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, gear, flames, pilot, navs };
}

// The Chemist's plane: a dark grey private jet with two tail-mounted engines and a T-tail.
export function buildBizJet() {
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.0; root.add(body);
  const paint = std({ color: 0x2a2d33, roughness: 0.35, metalness: 0.4 }), trim = std({ color: 0x8a1a14 }), dark = std({ color: 0x0e0f12, roughness: 0.2 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, sc = null, par = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); if (sc) o.scale.set(...sc); o.castShadow = true; par.add(o); return o; };
  add(new THREE.CylinderGeometry(1.25, 1.25, 14, 16), paint, 0, 0, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(1.25, 16, 10), paint, 0, 0, -7, 0, 0, 0, [1, 1, 2]);
  add(new THREE.ConeGeometry(1.25, 5, 16), paint, 0, 0.3, 9.5, Math.PI / 2, 0, 0, [1, 1, 0.6]);
  add(new THREE.BoxGeometry(1.2, 0.35, 0.3), dark, 0, 0.65, -8.9, -0.6);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.04, 0.35, 7), dark, s * 1.24, 0.3, -1.5);
    add(new THREE.BoxGeometry(0.05, 0.12, 14), trim, s * 1.25, -0.25, 0);
    add(new THREE.BoxGeometry(7.5, 0.25, 2.6), paint, s * 4.4, -0.7, 0.5, 0, s * -0.35, s * 0.05);
    add(new THREE.CylinderGeometry(0.55, 0.5, 2.8, 14), paint, s * 1.9, 0.5, 6.8, Math.PI / 2);
    add(new THREE.BoxGeometry(0.9, 0.2, 0.6), paint, s * 1.4, 0.5, 6.8);
    add(new THREE.BoxGeometry(2.8, 0.18, 1.4), paint, s * 1.5, 4.1, 11.2, 0, s * -0.25);
  }
  add(new THREE.BoxGeometry(0.25, 3.4, 2.6), paint, 0, 2.4, 10.4, -0.4);
  // a red hand painted on the tail
  const hand = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, map: tex(64, 64, (c) => { c.fillStyle = '#b3261e'; c.beginPath(); c.arc(32, 40, 15, 0, 7); c.fill(); for (let i = 0; i < 4; i++) c.fillRect(17 + i * 8, 10, 6, 26); c.fillRect(8, 30, 14, 6); }) }));
  hand.position.set(0.14, 2.4, 10.3); hand.rotation.y = Math.PI / 2; body.add(hand);
  const h2 = hand.clone(); h2.position.x = -0.14; h2.rotation.y = -Math.PI / 2; body.add(h2);
  const gear = new THREE.Group(); root.add(gear);
  for (const [x, z] of [[-1.4, 0.8], [1.4, 0.8], [0, -6.5]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), dark); wh.rotation.z = Math.PI / 2; wh.position.set(x, -1.6, z); gear.add(wh); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6), dark); leg.position.set(x, -0.9, z); gear.add(leg); }
  const flames = [flame(body, -1.9, 0.5, 8.3, 0.45), flame(body, 1.9, 0.5, 8.3, 0.45)];
  const navs = navLights(body, 8.2, [4.3, 11.8]);
  return { root, gear, flames, pilot: new THREE.Object3D(), navs };
}
