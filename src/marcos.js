import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, std, sign } from './buildkit.js';
import { LAND_Y } from './world.js';
import { GLOW } from './effects.js';

// MARCOS: a burger joint on the corner block between the airport and Scorch causeways (the last
// stop for a feed before you head out of town). Red brick and big windows under a red mansard roof,
// a tall pole sign you can see from both causeways, a drive-thru lane round the back, a patio with
// umbrellas, and inside: the counter and its glowing menu boards, the kitchen behind, booths along
// the windows and a little play corner. Order at the counter (E) to eat.

const KERB = 0.15;
const MENU = [['Marco Burger', 6, 30], ['Big Marco', 9, 50], ['Chicken Bites', 5, 25], ['Fries', 3, 12], ['Choc Shake', 4, 15], ['Meal Deal', 12, 100]];

// the logo: a burger in a yellow ring on red, the name underneath (an original mark)
export function marcosLogo(w = 512, h = 512) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = '#c8102e'; c.beginPath(); c.arc(w / 2, h * 0.42, w * 0.38, 0, 7); c.fill();
    c.lineWidth = w * 0.035; c.strokeStyle = '#ffc72c'; c.beginPath(); c.arc(w / 2, h * 0.42, w * 0.34, 0, 7); c.stroke();
    const cx = w / 2, cy = h * 0.42, bw = w * 0.36;
    // the bun, the lettuce, the patty, the cheese, the bun
    c.fillStyle = '#ffb347'; c.beginPath(); c.ellipse(cx, cy - h * 0.05, bw / 2, h * 0.1, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#fff3c4'; for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(cx - bw * 0.3 + i * bw * 0.1, cy - h * 0.1, 5, 3, 0.4, 0, 7); c.fill(); } // sesame
    c.fillStyle = '#5fbf3f'; c.beginPath(); for (let i = 0; i <= 10; i++) { const x = cx - bw / 2 + (i * bw) / 10; c.lineTo(x, cy - h * 0.035 + (i % 2 ? 8 : 0)); } c.lineTo(cx + bw / 2, cy - h * 0.01); c.lineTo(cx - bw / 2, cy - h * 0.01); c.fill();
    c.fillStyle = '#6b3a1e'; c.fillRect(cx - bw / 2, cy - h * 0.01, bw, h * 0.055);
    c.fillStyle = '#ffc72c'; c.beginPath(); c.moveTo(cx - bw / 2, cy + h * 0.045); c.lineTo(cx + bw / 2, cy + h * 0.045); c.lineTo(cx + bw * 0.3, cy + h * 0.075); c.lineTo(cx - bw * 0.2, cy + h * 0.07); c.fill();
    c.fillStyle = '#ffb347'; c.beginPath(); c.ellipse(cx, cy + h * 0.075, bw / 2, h * 0.04, 0, 0, Math.PI); c.fill();
    c.fillRect(cx - bw / 2, cy + h * 0.06, bw, h * 0.018);
    // the name
    c.font = `900 ${Math.round(h * 0.15)}px "Arial Black", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = h * 0.03; c.strokeStyle = '#c8102e'; c.strokeText('MARCOS', w / 2, h * 0.9);
    c.fillStyle = '#ffc72c'; c.fillText('MARCOS', w / 2, h * 0.9);
  });
}

export class Marcos {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.b = game.city.block(4, 4);
    this.build();
  }

  build() {
    const g = this.group, sb = this.game.portSandbox, b = this.b;
    const Y = LAND_Y + KERB;
    const box = (w, h, d, x, y, z, mat, collide = true, rotY = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y + h / 2, z); m.rotation.y = rotY; m.castShadow = true; m.receiveShadow = true; g.add(m);
      if (collide) sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)));
      return m;
    };
    const lit = (c, k = 0.3) => std({ color: c, emissive: c, emissiveIntensity: k });
    const red = std({ color: 0xc8102e, roughness: 0.6 }), yellow = lit(0xffc72c, 0.35), brick = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#9a3a2a'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, y, w, 1); for (let x = (y / 8) % 2 ? 0 : 8; x < w; x += 16) c.fillRect(x, y, 1, 8); } }, [6, 1.2]), roughness: 0.9 });
    const glass = std({ color: 0x9ec5e8, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.3, depthWrite: false });
    const inner = lit(0xf4ece0, 0.3), tile = std({ map: canvasTex(64, 64, (c) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#e8e2d4' : '#c8102e'; c.fillRect(i * 16, j * 16, 16, 16); } }, [12, 8]), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.12 });
    tile.emissiveMap = tile.map;
    // the restaurant: 24 x 16 m, front (north) onto the street, the patio on the west, drive-thru east
    const x0 = -790, x1 = -766, z0 = 118, z1 = 134, H = 4.6, cx = (x0 + x1) / 2, T = 0.3;
    this.box = { x0, x1, z0, z1 };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), tile); floor.rotation.x = -Math.PI / 2; floor.position.set(cx, Y + 0.02, (z0 + z1) / 2); floor.receiveShadow = true; g.add(floor);
    // walls: brick up to the sill, glass above, round three sides; the kitchen wall at the back is solid
    const glazed = (len, x, z, along) => {
      box(along ? len : T, 1.0, along ? T : len, x, Y, z, brick);
      const gm = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.06, 2.4, along ? 0.06 : len), glass); gm.position.set(x, Y + 2.2, z); g.add(gm);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(along ? len / 2 : 0.1, 1.2, along ? 0.1 : len / 2).setTranslation(x, Y + 2.2, z));
      box(along ? len : T, H - 3.4, along ? T : len, x, Y + 3.4, z, brick);
      for (let k = 0; k <= Math.round(len / 3); k++) box(0.12, 2.4, 0.12, along ? x - len / 2 + (k * len) / Math.round(len / 3) : x, Y + 1, along ? z : z - len / 2 + (k * len) / Math.round(len / 3), std({ color: 0x2a2c30 }), false);
    };
    // front: glass either side of the double doors (3 m wide at cx)
    glazed((cx - 1.5) - x0, (x0 + cx - 1.5) / 2, z0, true);
    glazed(x1 - (cx + 1.5), (cx + 1.5 + x1) / 2, z0, true);
    box(3, H - 2.8, T, cx, Y + 2.8, z0, brick);
    glazed(z1 - z0 - 6, x0, (z0 + z1 - 6) / 2, false); // west (the patio side)
    box(T, H, 6, x0, Y, z1 - 3, brick);
    glazed(10, x1, z0 + 5, false); // east, front half
    box(T, H, 6, x1, Y, z0 + 13, brick); // east, back: the drive-thru window
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 1.6), glass); hatch.position.set(x1 + 0.05, Y + 1.6, z0 + 13); g.add(hatch);
    box(0.5, 0.08, 1.8, x1 + 0.35, Y + 1.0, z0 + 13, std({ color: 0xa9adb1, metalness: 0.6 }), false);
    box(x1 - x0, H, T, cx, Y, z1, brick);
    // the roof: a flat top with a red mansard all round, and a yellow fascia with the name on it
    box(x1 - x0 + 0.6, 0.35, z1 - z0 + 0.6, cx, Y + H, (z0 + z1) / 2, std({ color: 0x5f6266 }));
    const mansard = (len, x, z, rot) => { const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 2.4), red); m.position.set(x, Y + H + 1, z); m.rotation.set(rot[0], rot[1], 0, 'YXZ'); m.castShadow = true; g.add(m); };
    mansard(x1 - x0 + 2, cx, z0 - 0.6, [0.9, 0]); mansard(x1 - x0 + 2, cx, z1 + 0.6, [-0.9, 0]);
    mansard(z1 - z0 + 2, x0 - 0.6, (z0 + z1) / 2, [0.9, Math.PI / 2]); mansard(z1 - z0 + 2, x1 + 0.6, (z0 + z1) / 2, [-0.9, Math.PI / 2]);
    box(x1 - x0 + 1.6, 0.5, 0.2, cx, Y + H - 0.2, z0 - 0.75, yellow, false);
    const logo = marcosLogo();
    const wordmark = canvasTex(1024, 192, (c, w, h) => { c.fillStyle = '#c8102e'; c.fillRect(0, 0, w, h); c.font = '900 140px "Arial Black", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 10; c.strokeStyle = '#ffffff'; c.strokeText('MARCOS', w / 2, h / 2 + 6); c.fillStyle = '#ffc72c'; c.fillText('MARCOS', w / 2, h / 2 + 6); });
    const fasc = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshStandardMaterial({ map: wordmark, emissive: 0xffffff, emissiveMap: wordmark, emissiveIntensity: 0.55 })); fasc.position.set(cx, Y + H + 1.3, z0 - 1.95); fasc.rotation.set(-0.15, Math.PI, 0); g.add(fasc);
    // a canopy over the doors
    box(6, 0.2, 2.2, cx, Y + 3.1, z0 - 1.1, red, false);
    // ---- inside: the counter across the back, the kitchen behind it, the menu boards above
    const counterZ = z1 - 5.5;
    box(12, 1.05, 0.9, cx + 2, Y, counterZ, red);
    box(12.1, 0.06, 1.0, cx + 2, Y + 1.05, counterZ, lit(0xe8e2d4, 0.2), false);
    for (const dx of [-2.5, 1.5, 5.5]) { box(0.45, 0.35, 0.35, cx + dx, Y + 1.1, counterZ, std({ color: 0x2a2c30 }), false); }
    this.counter = new THREE.Vector3(cx + 1.5, Y, counterZ - 1.3);
    const menuTex = canvasTex(1024, 256, (c, w, h) => {
      c.fillStyle = '#1a1414'; c.fillRect(0, 0, w, h);
      MENU.forEach(([n, p], i) => { const x = 20 + (i % 3) * 340, y = 30 + Math.floor(i / 3) * 110; c.fillStyle = '#c8102e'; c.fillRect(x, y, 320, 90); c.fillStyle = '#ffc72c'; c.font = 'bold 34px Arial'; c.fillText(n.toUpperCase(), x + 14, y + 42); c.fillStyle = '#ffffff'; c.font = 'bold 30px Arial'; c.fillText(`$${p}`, x + 14, y + 78); });
    });
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: menuTex })); menu.position.set(cx + 2, Y + 3.2, z1 - 0.2); menu.rotation.y = Math.PI; g.add(menu);
    // the kitchen: fryers, a grill, a shelf of buns
    box(3, 0.95, 0.8, cx - 2, Y, z1 - 1.2, std({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.3 }));
    box(2.6, 0.95, 0.8, cx + 2, Y, z1 - 1.2, std({ color: 0x2a2c30, metalness: 0.5 }));
    box(2.6, 1.8, 0.6, cx + 6, Y, z1 - 1, std({ color: 0xb8bcc2, metalness: 0.6 }));
    // booths along the front windows, tables in the middle, the play corner by the patio
    const seatM = std({ color: 0xffc72c, roughness: 0.6 }), table = lit(0xe8e2d4, 0.15);
    for (const x of [x0 + 3, x0 + 8, x1 - 8, x1 - 3]) {
      box(1.6, 0.75, 1.0, x, Y, z0 + 2.4, table);
      for (const s of [-1, 1]) { box(1.6, 0.45, 0.6, x, Y, z0 + 2.4 + s * 1.0, seatM); box(1.6, 1.1, 0.15, x, Y, z0 + 2.4 + s * 1.35, red, false); }
    }
    for (const [x, z] of [[cx - 4, z0 + 7], [cx, z0 + 7], [cx + 4, z0 + 7]]) { box(1.1, 0.75, 1.1, x, Y, z, table); for (const s of [-1, 1]) box(0.45, 0.45, 0.45, x + s * 0.9, Y, z, red, false); }
    // play corner: a slide and a ball pit
    const pit = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 3), std({ color: 0x2f7fd8 })); pit.position.set(x0 + 2.2, Y + 0.3, z1 - 5); g.add(pit);
    for (let k = 0; k < 40; k++) { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), lit([0xc8102e, 0xffc72c, 0x2f7fd8, 0x3aa760][k % 4], 0.3)); ball.position.set(x0 + 1 + Math.random() * 2.4, Y + 0.62, z1 - 6.2 + Math.random() * 2.4); g.add(ball); }
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 3.4), std({ color: 0xc8102e })); slide.position.set(x0 + 4.5, Y + 1.0, z1 - 5); slide.rotation.x = -0.5; g.add(slide);
    // ceiling lights
    for (let x = x0 + 3; x < x1; x += 5) for (const z of [z0 + 3, z0 + 8, z1 - 3]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12), new THREE.MeshBasicMaterial({ color: 0xfff2d8 })); l.position.set(x, Y + H - 0.1, z); g.add(l); }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), inner); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, Y + H - 0.02, (z0 + z1) / 2); g.add(ceil);
    this.light = new THREE.PointLight(0xfff0d8, 0, 26, 1.4); this.light.position.set(cx, Y + H - 1, (z0 + z1) / 2); g.add(this.light);
    // ---- outside: the patio, the pole sign, the drive-thru, the car park
    for (const [x, z] of [[x0 - 4.5, z0 + 3], [x0 - 4.5, z0 + 9], [x0 - 9.5, z0 + 6]]) {
      box(1.2, 0.75, 1.2, x, Y, z, std({ color: 0xe8e2d4 }));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), std({ color: 0xe8e2d4 })); pole.position.set(x, Y + 1.2, z); g.add(pole);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 8), std({ color: 0xc8102e })); um.position.set(x, Y + 2.5, z); g.add(um);
    }
    // the pole sign at the corner, facing both causeways
    const px = this.b.x0 + 3, pz = this.b.z0 + 3; // the street corner, seen down both roads
    box(0.6, 12, 0.6, px, Y, pz, std({ color: 0xc8102e, metalness: 0.3 }));
    for (const r of [Math.PI * 0.75, -Math.PI / 4]) { const disc = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new THREE.MeshStandardMaterial({ map: logo, transparent: true, emissive: 0xffffff, emissiveMap: logo, emissiveIntensity: 0.6, side: THREE.FrontSide })); disc.position.set(px + Math.sin(r) * 0.32, Y + 14, pz + Math.cos(r) * 0.32); disc.rotation.y = r; g.add(disc); }
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffc72c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); this.glow.position.set(px, Y + 14, pz); this.glow.scale.setScalar(12); g.add(this.glow);
    sign(g, 'OPEN 24 HOURS · DRIVE-THRU', px + 0.4, Y + 10.6, pz - 0.4, Math.PI * 0.75, { w: 4.4, h: 0.7, bg: '#ffc72c', fg: '#c8102e', glow: true });
    // the drive-thru lane: in at the south-east corner, up the east side past the window, out north
    const lane = std({ color: 0x3c3f43, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(6, this.b.z1 - this.b.z0 - 4), lane); ln.rotation.x = -Math.PI / 2; ln.position.set(x1 + 4.5, Y + 0.03, (this.b.z0 + this.b.z1) / 2); g.add(ln);
    for (let z = this.b.z0 + 4; z < this.b.z1 - 4; z += 5) { const ar = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2), new THREE.MeshBasicMaterial({ color: 0xf2f2ee })); ar.rotation.x = -Math.PI / 2; ar.position.set(x1 + 4.5, Y + 0.04, z); g.add(ar); }
    box(0.3, 2.2, 2.6, x1 + 8.2, Y, z0 + 20, std({ color: 0x1a1414 })); // the menu board on the lane
    const mb = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ map: menuTex })); mb.position.set(x1 + 8.0, Y + 1.6, z0 + 20); mb.rotation.y = -Math.PI / 2; g.add(mb);
    sign(g, 'DRIVE-THRU ➜', x1 + 4.5, Y + 2.8, this.b.z1 - 2, 0, { w: 3.6, h: 0.7, bg: '#c8102e', fg: '#ffc72c', glow: true, post: Y });
    this.window = new THREE.Vector3(x1 + 3, Y, z0 + 13);
    // car park bays at the back
    const park = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 6, 22), std({ color: 0x45484c, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 })); park.rotation.x = -Math.PI / 2; park.position.set(cx, Y + 0.025, z1 + 13); g.add(park);
    for (let x = x0 - 2; x <= x1 + 2; x += 3) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 5), new THREE.MeshBasicMaterial({ color: 0xf2f2ee })); s.rotation.x = -Math.PI / 2; s.position.set(x, Y + 0.035, z1 + 6); g.add(s); }
    this.door = new THREE.Vector3(cx, Y, z0 - 2);
    this.inside = (p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;
    // the staff (red shirts, yellow caps) and a few customers
    this.people = [];
  }

  staff() {
    const g = this.game, C = g.citizens, Y = LAND_Y + KERB, cz = this.box.z1 - 5.5 + 1.2;
    const add = (x, z, yaw, look) => { const n = C.spawnCitizen('city', 'escort', new THREE.Vector3(x, Y + 0.95, z), { look }); if (n) { n.faceYaw = yaw; n.heading = yaw; n.hp = 60; this.people.push(n); } };
    const crew = { shirt: 0xc8102e, pants: 0x1d1f22, hat: 'cap', hatColor: 0xffc72c, skin: 0 };
    const skins = [0xd9a47c, 0x7a4f35, 0xf1c9a5, 0xa8724f];
    const cx = (this.box.x0 + this.box.x1) / 2;
    for (const [dx, k] of [[-2.5, 0], [1.5, 1], [5.5, 2]]) add(cx + dx, cz, Math.PI, { ...crew, skin: skins[k] });
    add(cx - 2, this.box.z1 - 2.2, 0, { ...crew, skin: skins[3] }); // at the fryer
    for (let k = 0; k < 3; k++) { const n = C.spawnCitizen('city', 'escort', new THREE.Vector3(cx - 4 + k * 4, Y + 0.95, this.box.z0 + 7 + 0.9), {}); if (n) { n.faceYaw = Math.PI; n.heading = Math.PI; n.sit = true; this.people.push(n); } }
  }

  update() {
    const g = this.game, night = g.daynight?.night ?? 0;
    this.light.intensity = 0.3 + night * 1.8;
    this.glow.material.opacity = 0.75 * night;
    const p = g.shorePlayer.body.translation();
    const near = Math.hypot(p.x - this.door.x, p.z - this.door.z) < 120 && g.started && !g.net;
    this.people = this.people.filter((n) => g.citizens.list.includes(n));
    if (near && !this.people.length && !this.cooldown) this.staff();
    if (!near && this.people.length) { for (const n of this.people) g.citizens.despawn(n); this.people = []; }
    if (g.lastShotT !== this.lastShot) { // gunfire in here: everyone's off
      const shot = this.lastShot !== undefined && Math.hypot(p.x - this.door.x, p.z - this.door.z) < 40;
      this.lastShot = g.lastShotT;
      if (shot) { for (const n of this.people) { n.role = 'civ'; g.citizens.flee(n, p, 20); } this.people = []; this.cooldown = true; setTimeout(() => { this.cooldown = false; }, 90000); }
    }
  }

  action(pos) {
    const g = this.game;
    const atCounter = Math.hypot(pos.x - this.counter.x, pos.z - this.counter.z) < 2.2 && Math.abs(pos.y - 1 - this.counter.y) < 1.5;
    const atWindow = g.vehicles.active && Math.hypot(pos.x - this.window.x, pos.z - this.window.z) < 4;
    if (!atCounter && !atWindow) return null;
    if (atCounter && !this.people.length) return { label: 'MARCOS (nobody at the counter)', run: () => g.hud.toast('Nobody\'s serving. Come back later.') };
    return { label: atWindow ? 'Order at the drive-thru' : 'Order at the counter', run: () => this.order() };
  }

  order() {
    const g = this.game, e = g.economy;
    e.open('MARCOS', e.header() + `<p class="lede">"Welcome to MARCOS! What can I get you?"</p><div class="btns">${MENU.map(([n, p, hp], i) => `<button data-i="${i}" ${e.money >= p ? '' : 'disabled'}>${n} · $${p} (+${hp})</button>`).join('')}</div>`, (el) => el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]');
      if (!b) return;
      const [n, p, hp] = MENU[+b.dataset.i];
      if (e.money < p) return;
      e.addMoney(-p, `MARCOS: ${n.toLowerCase()}`);
      g.health.heal(hp);
      g.sfx.play('cash');
      g.hud.toast(`${n}. ${['Delicious.', 'Still hot.', 'Extra pickles, nice.', 'That hit the spot.'][Math.floor(Math.random() * 4)]} +${hp} health`, 0x7be08a);
      e.close();
    }));
  }
}
