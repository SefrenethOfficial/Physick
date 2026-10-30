import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, std, sign, carMesh } from './buildkit.js';
import { Car, clearSpot } from './carphys.js';
import { buildFigure } from './figure.js';
import { UPGRADES } from './garage.js';
import { LAND_Y } from './world.js';
import { bikeMesh } from './fleet.js';
import { Chopper } from './homes.js';
import { Heli } from './cargo.js';
import { GLOW } from './effects.js';

// Verian Motors: a glass showroom on the west side of Verian City. Buy a car here and it's yours
// for good: it's saved (with its paint and every upgrade Underpass Customs fits), waits in the
// customer bays out back, and if it's wrecked or lost a new one is delivered to the lot.

const KERB = 0.15;
const Y = LAND_Y + KERB;
const BASE_HALF = { x: 0.95, y: 0.55, z: 2.25 };

export const CAR_MODELS = [
  { id: 'pico', name: 'Pico', kind: 'City hatchback', price: 6500, color: 0xe0a030, maxSpeed: 27, hp: 90, scale: [0.92, 0.95, 0.84], blurb: 'Cheap, cheerful and parks anywhere.' },
  { id: 'sedan', name: 'Meridian', kind: 'Family saloon', price: 14000, color: 0x5a6a7a, maxSpeed: 30, hp: 115, scale: [1, 1, 1.03], blurb: 'Comfortable, reliable, invisible.' },
  { id: 'muscle', name: 'Bruiser GT', kind: 'Muscle car', price: 38000, color: 0xc23b2a, maxSpeed: 37, hp: 135, scale: [1.05, 0.9, 1.1], blurb: 'Big V8, racing stripes, no manners.', stripes: true, scoop: true },
  { id: 'suv', name: 'Trailmaster', kind: 'SUV', price: 45000, color: 0x2f4a3a, maxSpeed: 31, hp: 190, scale: [1.1, 1.25, 1.06], blurb: 'Tall, heavy and hard to stop.', rack: true, density: 150 },
  { id: 'sports', name: 'Stiletto', kind: 'Sports car', price: 95000, color: 0x2f7fd8, maxSpeed: 42, hp: 105, scale: [1.02, 0.78, 1.04], blurb: 'Low, light and very quick.', spoiler: true },
  { id: 'super', name: 'Vortex X', kind: 'Supercar', price: 350000, color: 0xf2f2ee, maxSpeed: 50, hp: 120, scale: [1.08, 0.7, 1.1], blurb: 'The fastest thing on four wheels in Verian.', wing: true },
  { id: 'sparrow', name: 'Sparrow 600', kind: 'Street bike', price: 12000, color: 0xc23b2a, maxSpeed: 40, hp: 60, scale: [1, 1, 1], vehicle: 'bike', sport: false, blurb: 'Nimble and quick off the line. Crash hard and you go over the bars.' },
  { id: 'reaper', name: 'Reaper 1000', kind: 'Superbike', price: 28000, color: 0x15161a, maxSpeed: 48, hp: 60, scale: [1, 1, 1], vehicle: 'bike', sport: true, blurb: 'A rocket with handlebars. Hang on.' },
  { id: 'hauler', name: 'Hauler', kind: 'Tow truck', price: 22000, color: 0xe0a030, maxSpeed: 28, hp: 220, scale: [1, 1, 1], vehicle: 'tow', blurb: 'Back up to any car and press T to hook it. Dimitri pays for what you tow in.' },
  { id: 'skylark', name: 'Skylark', kind: 'Helicopter', price: 850000, color: 0xf2f0ea, maxSpeed: 42, hp: 400, scale: [1, 1, 1], vehicle: 'heli', blurb: 'Your own helicopter, kept on the pad behind the showroom.' },
];
const MODEL = Object.fromEntries(CAR_MODELS.map((m) => [m.id, m]));
const PAINTS = [0xc23b2a, 0x14161c, 0xeeeeea, 0x2f7fd8, 0xe0a030, 0x3aa760, 0x6a2a8a, 0x8a8f96];

// The model's look: the standard car body scaled to its shape, plus a few bolt-ons.
export function modelMesh(m, color = m.color) {
  const g = carMesh(color);
  const [sx, sy, sz] = m.scale;
  for (const c of g.children) { // stretch the body and cabin; the wheels just move to the new corners
    const wheel = c.geometry?.type === 'CylinderGeometry';
    c.position.x *= sx; c.position.z *= sz; if (!wheel) { c.position.y *= sy; c.scale.multiply(new THREE.Vector3(sx, sy, sz)); }
  }
  const black = std({ color: 0x15161a, roughness: 0.5 });
  const add = (w, h, d, x, y, z, mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  const top = 0.66 * sy + 0.36 * sy;
  if (m.stripes) for (const s of [-1, 1]) add(0.16, 0.01, 4.5 * sz, s * 0.16, top + 0.005, 0, std({ color: 0xf2f2ee }));
  if (m.scoop) add(0.5, 0.12, 0.7, 0, top + 0.06, -1.3 * sz, black);
  if (m.spoiler) { add(1.6, 0.05, 0.3, 0, top + 0.18, 2.05 * sz, black); for (const s of [-1, 1]) add(0.05, 0.18, 0.08, s * 0.6, top + 0.08, 2.05 * sz, black); }
  if (m.wing) { add(1.9, 0.06, 0.4, 0, top + 0.42, 2.2 * sz, black); for (const s of [-1, 1]) add(0.06, 0.42, 0.12, s * 0.7, top + 0.2, 2.15 * sz, black); }
  if (m.rack) { for (const s of [-1, 1]) add(0.06, 0.08, 1.8, s * 0.7, 1.33 * sy + 0.31 * sy + 0.05, 0.25 * sz, std({ color: 0x8a8f96, metalness: 0.6 })); add(1.5, 0.05, 0.06, 0, 1.33 * sy + 0.31 * sy + 0.1, -0.4, black); add(1.5, 0.05, 0.06, 0, 1.33 * sy + 0.31 * sy + 0.1, 0.9, black); }
  g.userData.model = m.id;
  g.userData.spec = MODEL[m.id] ? `m:${m.id}:${color}` : `s:${color}:${m.scale.join(',')}`;
  return g;
}

export class Dealership {
  constructor(game) {
    this.game = game;
    const b = game.city.block(0, 2); // on the corner where the highway from the bridge comes into the city
    this.b = b;
    this.cars = new Map(); // uid -> live Car
    this.respawnT = new Map(); // uid -> seconds until it's delivered again
    this.build();
    this.selColor = null;
    for (const rec of game.economy.ownedCars) this.deliver(rec, true);
  }

  build() {
    const g = (this.group = new THREE.Group()), sb = this.game.portSandbox, b = this.b;
    this.game.scene.add(g);
    const box = (w, h, d, x, y, z, mat, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
      if (collide) sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z));
      return m;
    };
    // the showroom: a glass box on the north side of the block, door facing the street
    const x0 = b.x0 + 6, x1 = b.x1 - 6, z0 = b.z0 + 6, z1 = z0 + 22, H = 5.5;
    const cx = (x0 + x1) / 2;
    this.showroom = { x0, x1, z0, z1 };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), std({ map: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#e8e6e2'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c8c6c0'; c.lineWidth = 2;
      for (let i = 0; i <= 2; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, h); c.moveTo(0, i * 64); c.lineTo(w, i * 64); c.stroke(); }
    }, [(x1 - x0) / 4, (z1 - z0) / 4]), roughness: 0.15, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, Y + 0.02, (z0 + z1) / 2); floor.receiveShadow = true; g.add(floor);
    const glass = std({ color: 0x9ec5e8, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.25, depthWrite: false });
    const frame = std({ color: 0x2a2c30, roughness: 0.4, metalness: 0.6 });
    const white = std({ color: 0xf2f2ee, roughness: 0.5 });
    // back wall solid, the other three glass with black mullions; a wide door in the front
    box(x1 - x0, H, 0.3, cx, Y, z1, white);
    for (const [ax, az, len, along] of [[x0, (z0 + z1) / 2, z1 - z0, 'z'], [x1, (z0 + z1) / 2, z1 - z0, 'z']]) {
      const gm = new THREE.Mesh(new THREE.BoxGeometry(0.06, H - 0.4, len), glass); gm.position.set(ax, Y + (H - 0.4) / 2, az); g.add(gm);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.1, H / 2, len / 2).setTranslation(ax, Y + H / 2, az));
      for (let k = 0; k <= 5; k++) box(0.14, H, 0.14, ax, Y, z0 + (k * len) / 5, frame, false);
      void along;
    }
    const door = 4;
    for (const [a, c] of [[x0, cx - door / 2], [cx + door / 2, x1]]) {
      const gm = new THREE.Mesh(new THREE.BoxGeometry(c - a, H - 0.4, 0.06), glass); gm.position.set((a + c) / 2, Y + (H - 0.4) / 2, z0); g.add(gm);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((c - a) / 2, H / 2, 0.1).setTranslation((a + c) / 2, Y + H / 2, z0));
      for (let k = 0; k <= 4; k++) box(0.14, H, 0.14, a + ((c - a) * k) / 4, Y, z0, frame, false);
    }
    box(door, H - 3.0, 0.2, cx, Y + 3.0, z0, frame, false);
    box(x1 - x0 + 1, 0.4, z1 - z0 + 1, cx, Y + H - 0.4, (z0 + z1) / 2, white).castShadow = false; // roof (lets the daylight in: it's mostly glass)
    box(x1 - x0 + 2, 0.15, 3, cx, Y + 3.2, z0 - 1.4, white, false).castShadow = false; // canopy over the door
    sign(g, 'VERIAN MOTORS', cx, Y + H + 0.9, z0 - 0.1, Math.PI, { w: 14, h: 1.6, bg: '#14161c', fg: '#e8c547', glow: true });
    // ---- lighting: rows of panels in the ceiling, spots on the cars, floodlights over the lot, and
    // a bright sign on a pole by the road. (It all comes up at night; by day it's just the panels.)
    const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
    for (let x = x0 + 4; x < x1 - 2; x += 6) for (let z = z0 + 4; z < z1 - 2; z += 6) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.8), glow(0xfff6e8)); p.position.set(x, Y + H - 0.45, z); p.userData.noMerge = true; g.add(p); }
    this.lights = [];
    for (const lx of [x0 + (x1 - x0) * 0.28, x0 + (x1 - x0) * 0.72]) { const L = new THREE.PointLight(0xfff0dc, 0, 30, 1.4); L.position.set(lx, Y + H - 1, (z0 + z1) / 2); g.add(L); this.lights.push(L); }
    this.floods = [];
    const pole = std({ color: 0x3a3c40, metalness: 0.6, roughness: 0.4 });
    for (const [px, pz] of [[x0 - 1.5, z0 - 2], [x1 + 1.5, z0 - 2], [x0 - 1.5, z1 + 16], [x1 + 1.5, z1 + 16]]) {
      box(0.25, 8, 0.25, px, Y, pz, pole, true);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.6), glow(0xffffff)); head.position.set(px, Y + 8, pz); head.userData.noMerge = true; g.add(head);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xfff2d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      halo.position.set(px, Y + 7.8, pz); halo.scale.setScalar(7); g.add(halo); this.floods.push(halo);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(px + (px < cx ? 5 : -5), Y + 0.06, pz + (pz < z0 ? 3 : -3)); pool.userData.noMerge = true; g.add(pool); this.floods.push(pool);
    }
    // the pole sign by the road
    box(0.5, 9, 0.5, x0 - 3, Y, z0 - 4, pole, true);
    sign(g, 'VERIAN MOTORS', x0 - 3, Y + 10, z0 - 4, Math.PI, { w: 6, h: 1.4, bg: '#e8c547', fg: '#14161c', glow: true });
    sign(g, 'VERIAN MOTORS', x0 - 3, Y + 10, z0 - 3.9, 0, { w: 6, h: 1.4, bg: '#e8c547', fg: '#14161c', glow: true });
    sign(g, 'CARS · BIKES · CHOPPERS', x0 - 3, Y + 8.7, z0 - 4, Math.PI, { w: 5.2, h: 0.8, bg: '#14161c', fg: '#ffffff', glow: true });
    // the cars on display, on round plinths
    const plinth = std({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.5 });
    const lz = z1 + 2 + 15; // the open part of the lot, behind the customer bays
    const spots = [[x0 + 6, z0 + 6, 0.7], [x0 + 14, z0 + 13, -0.5], [cx - 1, z0 + 7, 2.6], [cx + 6, z0 + 14, 0.4], [x1 - 13, z0 + 7, -2.4], [x1 - 6, z0 + 14, 2.8],
      [x0 + 4, z1 - 4, 0.5], [x0 + 9, z1 - 4, -0.5], [cx - 12, lz, 0.6], [cx + 12, lz, 1.2]];
    this.pad = new THREE.Vector3(cx + 12, Y, lz);
    const padM = new THREE.Mesh(new THREE.CircleGeometry(7, 32), std({ map: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#2f3438'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2d23a'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.stroke();
      c.fillStyle = '#f2f2ee'; c.font = 'bold 72px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 64, 68);
    }), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
    padM.rotation.x = -Math.PI / 2; padM.position.set(this.pad.x, Y + 0.04, this.pad.z); g.add(padM);
    this.display = CAR_MODELS.map((m, i) => {
      const [x, z, yaw] = spots[i];
      const big = !m.vehicle;
      if (big) { const p = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.25, 40), plinth); p.position.set(x, Y + 0.12, z); p.receiveShadow = true; g.add(p); p.userData.noMerge = true; }
      if (m.vehicle === 'bike') { const p = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 30), plinth); p.position.set(x, Y + 0.1, z); g.add(p); }
      let car;
      if (m.vehicle === 'heli') { const h = new Heli(this.game); h.ladder.visible = false; h.root.removeFromParent(); h.root.visible = true; car = h.root; car.position.set(x, Y + 1.6, z); car.rotation.y = yaw; g.add(car); this.heliDisplay = car; }
      else {
        car = m.vehicle === 'bike' ? bikeMesh(m.color, { sport: m.sport }) : m.vehicle === 'tow' ? this.game.fleet.towMeshFor(m.color) : modelMesh(m);
        car.position.set(x, Y + (m.vehicle === 'bike' ? 0.2 : big ? 0.25 : 0.02), z); car.rotation.y = yaw; g.add(car);
      }
      car.traverse((o) => { o.userData.noMerge = true; });
      if (m.vehicle !== 'heli') sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(0.8, big ? 2.4 : m.vehicle === 'bike' ? 1.1 : 2.3).setTranslation(x, Y + 0.8, z));
      // a price card on a little stand
      const card = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), std({ map: canvasTex(192, 128, (c, w, h) => {
        c.fillStyle = '#14161c'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8c547'; c.font = 'bold 30px Arial'; c.textAlign = 'center'; c.fillText(m.name, w / 2, 44);
        c.fillStyle = '#f2f2ee'; c.font = '20px Arial'; c.fillText(m.kind, w / 2, 74); c.font = 'bold 26px Arial'; c.fillText('$' + m.price.toLocaleString(), w / 2, 110);
      }), emissive: 0xffffff, emissiveIntensity: 0.15 }));
      const cd = m.vehicle === 'bike' ? 2 : m.vehicle === 'heli' ? 7.6 : 3.4;
      card.position.set(x, Y + 1.1, z - cd); card.rotation.y = Math.PI; card.userData.noMerge = true; g.add(card);
      box(0.06, 0.9, 0.06, x, Y, z - cd - 0.02, frame, false);
      return { model: m, mesh: car };
    });
    for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.5), std({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.2 })); l.position.set(x0 + 5 + k * ((x1 - x0 - 10) / 3), Y + H - 0.45, (z0 + z1) / 2); g.add(l); }
    // the sales desk just inside the door, and the salesman behind it
    const dx = cx + 7, dz = z0 + 3.5;
    box(3, 1.05, 0.9, dx, Y, dz, white);
    box(3.2, 0.06, 1.1, dx, Y + 1.05, dz, std({ color: 0x14161c, roughness: 0.2 }), false);
    box(0.5, 0.35, 0.05, dx + 0.6, Y + 1.11, dz + 0.1, std({ color: 0x1b1b1b }), false);
    this.desk = new THREE.Vector3(dx, Y, dz - 1.4);
    const fig = buildFigure({ shirt: 0x22313f, pants: 0x22313f, skin: 0xc68a5a });
    fig.root.position.set(dx, Y + 0.83, dz + 1.0); fig.root.rotation.y = Math.PI;
    this.game.scene.add(fig.root);
    sb.addStaticCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(dx, Y + 0.83, dz + 1.0));
    this.salesman = fig;
    // the customer lot behind: asphalt, painted bays, a sign; your cars wait here, nose to the street
    const lz0 = z1 + 2, lz1 = b.z1 - 1;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0 - 2, lz1 - lz0), std({ color: 0x3c3f43, roughness: 0.9 }));
    lot.rotation.x = -Math.PI / 2; lot.position.set((b.x0 + b.x1) / 2, Y + 0.025, (lz0 + lz1) / 2); g.add(lot);
    const lineM = std({ color: 0xf2f2ee });
    this.bays = [];
    const n = 9, bw = (b.x1 - b.x0 - 6) / n, bz = lz0 + 4.5;
    for (let k = 0; k <= n; k++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5.5), lineM); l.rotation.x = -Math.PI / 2; l.position.set(b.x0 + 3 + k * bw, Y + 0.03, bz); g.add(l); }
    for (let k = 0; k < n; k++) this.bays.push({ x: b.x0 + 3 + (k + 0.5) * bw, z: bz, heading: Math.PI });
    sign(g, 'CUSTOMER CARS', b.x0 + 4, Y + 2.6, lz0 + 0.5, -Math.PI / 2, { w: 4, h: 0.7, bg: '#14161c', fg: '#e8c547', post: Y });
    this.lotCentre = new THREE.Vector3((b.x0 + b.x1) / 2, Y, bz);
  }

  // ---------------------------------------------------------------- your cars
  near(pos) { return Math.hypot(pos.x - this.desk.x, pos.z - this.desk.z) < 2.6 && Math.abs(pos.y - 1 - this.desk.y) < 2; }
  action(pos) {
    if (this.near(pos)) return { label: 'Verian Motors: buy a car', run: () => this.open() };
    const c = this.chopper;
    if (c?.available && !c.active && !c.dead && c.pos.distanceTo(new THREE.Vector3(pos.x, pos.y - 1, pos.z)) < 5) return { label: 'Fly the Skylark', run: () => c.enter() };
    return null;
  }

  // Make the car for a saved record, with its paint and upgrades, in a free bay.
  deliver(rec, quiet = false) {
    const g = this.game, m = MODEL[rec.model];
    if (!m) return null;
    const old = this.cars.get(rec.uid);
    if (old && !old.wreck && g.vehicles.list.includes(old)) { if (g.vehicles.active === old) return old; g.vehicles.remove(old); }
    if (m.vehicle === 'heli') return this.deliverHeli(rec, quiet);
    const sx = m.scale[0], sz = m.scale[2];
    const half = m.vehicle === 'bike' ? { x: 0.42, y: 0.5, z: 1.1 } : { x: BASE_HALF.x * sx, y: BASE_HALF.y * m.scale[1], z: BASE_HALF.z * sz };
    // parked at one of your homes, if it lives there (and there's a space); otherwise the lot
    const free = (p, y) => !g.vehicles.all.some((c) => c.ownedUid !== rec.uid && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 2.6) && clearSpot(g, p.x, p.z, p.heading, half, y);
    const home = rec.home && g.homes?.owns(rec.home) ? g.homes.list.find((h) => h.id === rec.home) : null;
    const spot = home ? g.homes.parking(home).find((p) => free(p, p.y)) : null;
    if (home && !spot && !quiet) g.hud.toast(`No room outside ${home.name}: it's on the lot at Verian Motors instead`, 0xffd166);
    const vb = rec.home === 'volcano' && g.volcano ? g.volcano.freeBay() : null;
    const bay = vb || spot || this.bays.find((p) => free(p, Y)) || this.bays[0];
    const opts = { color: rec.color, x: bay.x, z: bay.z, heading: bay.heading, hp: m.hp, maxSpeed: m.maxSpeed };
    const car = m.vehicle === 'bike' ? g.fleet.makeBike({ ...opts, sport: m.sport })
      : m.vehicle === 'tow' ? g.fleet.makeTow(opts)
        : new Car(g, { ...opts, mesh: modelMesh(m, rec.color), half, density: m.density || 120, ride: 0.55 * Math.min(1, m.scale[1]) });
    car.baseMax = m.maxSpeed;
    car.ownedUid = rec.uid;
    car.color = rec.color;
    car.type = { name: m.name, hp: car.maxHp, car: true };
    car.base = Math.round(m.price * 0.1);
    car.mods = { ...(rec.mods || {}) };
    for (const u of UPGRADES) if (car.mods[u.id] != null) u.apply(car, car.mods[u.id]);
    g.vehicles.list.push(car);
    this.cars.set(rec.uid, car);
    this.respawnT.delete(rec.uid);
    if (vb) car.body.setTranslation({ x: vb.x, y: vb.y + 1.2, z: vb.z }, true);
    if (!quiet) g.hud.toast(vb ? `Your ${m.name} is in the volcano garage` : spot ? `Your ${m.name} is parked outside ${home.name}` : `Your ${m.name} is waiting in the customer bays at Verian Motors`, 0x7be08a);
    return car;
  }

  // your helicopter: one Skylark on the pad behind the showroom (it looks after its own wrecks)
  deliverHeli(rec, quiet) {
    const g = this.game;
    if (!this.chopper) this.chopper = new Chopper(g, this.pad);
    const c = this.chopper;
    if (g.vehicles.active === c) return c;
    c.reset(); c.setAvailable(true); c.ownedUid = rec.uid;
    this.cars.set(rec.uid, c);
    if (this.heliDisplay) this.heliDisplay.visible = false;
    if (!quiet) g.hud.toast('Your Skylark is on the helipad behind Verian Motors', 0x7be08a);
    return c;
  }

  // You got out of one of your own cars: left by a home you own, it lives there now.
  parked(car) {
    const g = this.game, rec = g.economy.ownedCars.find((r) => r.uid === car?.ownedUid);
    if (!rec || car.isHeli) return;
    const h = g.homes?.ownedNear(car.pos);
    if (!h || rec.home === h.id) return;
    rec.home = h.id;
    g.economy.save();
    g.hud.toast(`${MODEL[rec.model].name} parked at ${h.name}: it'll be waiting here`, 0x7be08a);
  }

  sendHome(rec, id) {
    const g = this.game;
    rec.home = id || null;
    g.economy.save();
    const car = this.cars.get(rec.uid);
    if (car && g.vehicles.active === car) { g.hud.toast('You\'re in it! It\'ll stay where you leave it', 0xffd166); return; }
    this.deliver(rec);
  }

  // the garage just changed something on one of your cars: remember it
  remember(car) {
    const e = this.game.economy, rec = e.ownedCars.find((r) => r.uid === car.ownedUid);
    if (!rec) return;
    rec.mods = { ...(car.mods || {}) };
    rec.color = car.color ?? rec.color;
    e.save();
  }

  buy(m, color) {
    const g = this.game, e = g.economy;
    if (e.money + e.bank < m.price) return false;
    const fromCash = Math.min(e.money, m.price);
    e.bank -= m.price - fromCash;
    e.addMoney(-fromCash);
    const rec = { uid: `${m.id}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`, model: m.id, color: color ?? m.color, mods: {} };
    e.ownedCars.push(rec);
    e.save();
    g.sfx.play('cash');
    g.news?.add(`Verian Motors says business is booming after another ${m.name} drove off the lot.`, 'money');
    g.stocks?.event('VMTR', Math.min(0.06, m.price / 3e6));
    this.deliver(rec);
    return rec;
  }

  sell(rec) {
    const g = this.game, e = g.economy, m = MODEL[rec.model];
    const car = this.cars.get(rec.uid);
    if (car && g.vehicles.active === car) { g.hud.toast('Get out of it first', 0xff8a6a); return; }
    if (car?.isHeli) { car.setAvailable(false); if (this.heliDisplay) this.heliDisplay.visible = true; }
    else if (car && g.vehicles.list.includes(car)) g.vehicles.remove(car);
    this.cars.delete(rec.uid);
    e.ownedCars.splice(e.ownedCars.indexOf(rec), 1);
    const back = Math.round(m.price * 0.5);
    e.addMoney(back, `for your ${m.name}`);
    e.save();
  }

  open() {
    const g = this.game, e = g.economy;
    const swatch = (c, i) => `<button data-a="col" data-i="${i}" title="paint" style="background:#${c.toString(16).padStart(6, '0')};width:24px;height:24px;padding:0;border-radius:50%;${this.selColor === c ? 'outline:2px solid #ffd166;outline-offset:2px' : ''}"></button>`;
    const render = () => {
      const funds = e.money + e.bank;
      const rows = CAR_MODELS.map((m) => `<div class="erow"><div><b>${m.name}</b> <small style="display:inline">${m.kind}</small><small>${m.vehicle === 'heli' ? '150 km/h in the air' : Math.round(m.maxSpeed * 3.6) + ' km/h'} · body ${m.hp} · ${m.blurb}</small></div>
        <div class="btns"><button data-a="buy" data-id="${m.id}" ${funds < m.price ? 'disabled' : ''}>$${m.price.toLocaleString()}</button></div></div>`).join('');
      const mine = e.ownedCars.map((r) => {
        const m = MODEL[r.model], car = this.cars.get(r.uid), mods = Object.entries(r.mods || {}).map(([k, v]) => k === 'engine' ? `engine ${v + 1}` : k).join(', ');
        const status = car?.isHeli ? (car.dead ? 'wrecked: a new one is on its way' : g.vehicles.active === car ? 'you\'re flying it' : 'on the pad') : !car || car.wreck ? (this.respawnT.has(r.uid) ? 'wrecked: a new one is on its way' : 'wrecked') : g.vehicles.active === car ? 'you\'re driving it' : 'parked';
        return `<div class="erow"><div><b>${m.name}</b> <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#${r.color.toString(16).padStart(6, '0')}"></span><small>${status}${mods ? ' · ' + mods : ''}</small></div>
          <div class="btns">${m.vehicle === 'heli' ? '' : g.homes.list.filter((h) => g.homes.owns(h.id)).map((h) => `<button data-a="home" data-h="${h.id}" data-uid="${r.uid}" ${r.home === h.id ? 'class="on"' : ''}>${r.home === h.id ? 'Lives at' : 'Park at'} ${h.short}</button>`).join('')}<button data-a="bring" data-uid="${r.uid}">Bring to the lot</button><button data-a="sell" data-uid="${r.uid}">Sell ($${Math.round(m.price * 0.5).toLocaleString()})</button></div></div>`;
      }).join('') || '<p class="empty">You don\'t own any cars yet.</p>';
      e.open('Verian Motors', e.header() + `<p class="lede">Cars you buy here are yours to keep: they're saved with their paint and any upgrades from Underpass Customs, and wait for you in the customer bays out back.</p>
        <div class="erow"><div><b>Paint</b><small>${this.selColor == null ? 'Showroom colour' : 'Your pick'}</small></div><div class="btns">${PAINTS.map(swatch).join('')}</div></div>` + rows + '<h3 class="kih">Your cars</h3>' + mine,
      (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b || b.disabled) return;
        if (b.dataset.a === 'col') { const c = PAINTS[+b.dataset.i]; this.selColor = this.selColor === c ? null : c; }
        if (b.dataset.a === 'buy') { const m = MODEL[b.dataset.id]; if (this.buy(m, this.selColor)) g.hud.toast(`You bought a ${m.name}! It's in the customer bays out back`, 0x7be08a); }
        const rec = e.ownedCars.find((r) => r.uid === b.dataset.uid);
        if (b.dataset.a === 'bring' && rec) { const car = this.cars.get(rec.uid); if (car && g.vehicles.active === car) g.hud.toast('You\'re in it!', 0xffd166); else { rec.home = null; e.save(); this.deliver(rec); } }
        if (b.dataset.a === 'home' && rec) this.sendHome(rec, b.dataset.h);
        if (b.dataset.a === 'sell' && rec) this.sell(rec);
        render();
      }));
    };
    render();
  }

  update(dt) {
    const g = this.game;
    this.t = (this.t || 0) + dt;
    const night = g.daynight?.night ?? 0;
    for (const L of this.lights || []) L.intensity = 0.4 + night * 2.2;
    for (const f of this.floods || []) f.material.opacity = (f.isSprite ? 0.85 : 0.18) * night;
    if (this.salesman.parts?.armR) this.salesman.parts.armR.rotation.x = -0.2 + Math.sin(this.t * 1.3) * 0.15;
    // wrecked or gone: a replacement is delivered to the lot a minute later
    this.chopper?.update(dt);
    for (const rec of g.economy.ownedCars) {
      const car = this.cars.get(rec.uid);
      if (car?.isHeli) continue;
      const gone = !car || car.wreck || car.sinking || !g.vehicles.list.includes(car);
      if (!gone) continue;
      if (!this.respawnT.has(rec.uid)) { this.respawnT.set(rec.uid, 60); if (car && car.wreck) g.hud.toast(`Your ${MODEL[rec.model].name} is wrecked. Verian Motors will have a new one on the lot in a minute`, 0xffd166); continue; }
      const t = this.respawnT.get(rec.uid) - dt;
      if (t > 0) { this.respawnT.set(rec.uid, t); continue; }
      if (car && g.vehicles.list.includes(car) && g.vehicles.active !== car) g.vehicles.remove(car);
      this.deliver(rec);
    }
  }
}
