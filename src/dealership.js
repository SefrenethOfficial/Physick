import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, std, sign, carMesh } from './buildkit.js';
import { Car, clearSpot } from './carphys.js';
import { buildFigure } from './figure.js';
import { UPGRADES } from './garage.js';
import { LAND_Y } from './world.js';

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
  return g;
}

export class Dealership {
  constructor(game) {
    this.game = game;
    const b = game.city.block(0, 3);
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
    // the cars on display, on round plinths
    const plinth = std({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.5 });
    const spots = [[x0 + 6, z0 + 6, 0.7], [x0 + 14, z0 + 13, -0.5], [cx - 1, z0 + 7, 2.6], [cx + 6, z0 + 14, 0.4], [x1 - 13, z0 + 7, -2.4], [x1 - 6, z0 + 14, 2.8]];
    this.display = CAR_MODELS.map((m, i) => {
      const [x, z, yaw] = spots[i];
      const p = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.25, 40), plinth); p.position.set(x, Y + 0.12, z); p.receiveShadow = true; g.add(p);
      const car = modelMesh(m);
      car.position.set(x, Y + 0.25, z); car.rotation.y = yaw; g.add(car);
      car.traverse((o) => { o.userData.noMerge = true; });
      p.userData.noMerge = true;
      sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(0.8, 2.4).setTranslation(x, Y + 0.8, z));
      // a price card on a little stand
      const card = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), std({ map: canvasTex(192, 128, (c, w, h) => {
        c.fillStyle = '#14161c'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8c547'; c.font = 'bold 30px Arial'; c.textAlign = 'center'; c.fillText(m.name, w / 2, 44);
        c.fillStyle = '#f2f2ee'; c.font = '20px Arial'; c.fillText(m.kind, w / 2, 74); c.font = 'bold 26px Arial'; c.fillText('$' + m.price.toLocaleString(), w / 2, 110);
      }), emissive: 0xffffff, emissiveIntensity: 0.15 }));
      card.position.set(x, Y + 1.1, z - 3.4); card.rotation.y = Math.PI; card.userData.noMerge = true; g.add(card);
      box(0.06, 0.9, 0.06, x, Y, z - 3.42, frame, false);
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
  action(pos) { return this.near(pos) ? { label: 'Verian Motors: buy a car', run: () => this.open() } : null; }

  // Make the car for a saved record, with its paint and upgrades, in a free bay.
  deliver(rec, quiet = false) {
    const g = this.game, m = MODEL[rec.model];
    if (!m) return null;
    const old = this.cars.get(rec.uid);
    if (old && !old.wreck && g.vehicles.list.includes(old)) { if (g.vehicles.active === old) return old; g.vehicles.remove(old); }
    const sx = m.scale[0], sz = m.scale[2];
    const half = { x: BASE_HALF.x * sx, y: BASE_HALF.y * m.scale[1], z: BASE_HALF.z * sz };
    const bay = this.bays.find((p) => !g.vehicles.all.some((c) => Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 2.6) && clearSpot(g, p.x, p.z, p.heading, half, Y)) || this.bays[0];
    const car = new Car(g, { color: rec.color, x: bay.x, z: bay.z, heading: bay.heading, hp: m.hp, maxSpeed: m.maxSpeed, mesh: modelMesh(m, rec.color), half, density: m.density || 120, ride: 0.55 * Math.min(1, m.scale[1]) });
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
    if (!quiet) g.hud.toast(`Your ${m.name} is waiting in the customer bays at Verian Motors`, 0x7be08a);
    return car;
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
    this.deliver(rec);
    return rec;
  }

  sell(rec) {
    const g = this.game, e = g.economy, m = MODEL[rec.model];
    const car = this.cars.get(rec.uid);
    if (car && g.vehicles.active === car) { g.hud.toast('Get out of it first', 0xff8a6a); return; }
    if (car && g.vehicles.list.includes(car)) g.vehicles.remove(car);
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
      const rows = CAR_MODELS.map((m) => `<div class="erow"><div><b>${m.name}</b> <small style="display:inline">${m.kind}</small><small>${Math.round(m.maxSpeed * 3.6)} km/h · body ${m.hp} · ${m.blurb}</small></div>
        <div class="btns"><button data-a="buy" data-id="${m.id}" ${funds < m.price ? 'disabled' : ''}>$${m.price.toLocaleString()}</button></div></div>`).join('');
      const mine = e.ownedCars.map((r) => {
        const m = MODEL[r.model], car = this.cars.get(r.uid), mods = Object.entries(r.mods || {}).map(([k, v]) => k === 'engine' ? `engine ${v + 1}` : k).join(', ');
        const status = !car || car.wreck ? (this.respawnT.has(r.uid) ? 'wrecked: a new one is on its way' : 'wrecked') : g.vehicles.active === car ? 'you\'re driving it' : 'parked';
        return `<div class="erow"><div><b>${m.name}</b> <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#${r.color.toString(16).padStart(6, '0')}"></span><small>${status}${mods ? ' · ' + mods : ''}</small></div>
          <div class="btns"><button data-a="bring" data-uid="${r.uid}">Bring to the lot</button><button data-a="sell" data-uid="${r.uid}">Sell ($${Math.round(m.price * 0.5).toLocaleString()})</button></div></div>`;
      }).join('') || '<p class="empty">You don\'t own any cars yet.</p>';
      e.open('Verian Motors', e.header() + `<p class="lede">Cars you buy here are yours to keep: they're saved with their paint and any upgrades from Underpass Customs, and wait for you in the customer bays out back.</p>
        <div class="erow"><div><b>Paint</b><small>${this.selColor == null ? 'Showroom colour' : 'Your pick'}</small></div><div class="btns">${PAINTS.map(swatch).join('')}</div></div>` + rows + '<h3 class="kih">Your cars</h3>' + mine,
      (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b || b.disabled) return;
        if (b.dataset.a === 'col') { const c = PAINTS[+b.dataset.i]; this.selColor = this.selColor === c ? null : c; }
        if (b.dataset.a === 'buy') { const m = MODEL[b.dataset.id]; if (this.buy(m, this.selColor)) g.hud.toast(`You bought a ${m.name}! It's in the customer bays out back`, 0x7be08a); }
        const rec = e.ownedCars.find((r) => r.uid === b.dataset.uid);
        if (b.dataset.a === 'bring' && rec) { const car = this.cars.get(rec.uid); if (car && g.vehicles.active === car) g.hud.toast('You\'re in it!', 0xffd166); else this.deliver(rec); }
        if (b.dataset.a === 'sell' && rec) this.sell(rec);
        render();
      }));
    };
    render();
  }

  update(dt) {
    const g = this.game;
    this.t = (this.t || 0) + dt;
    if (this.salesman.parts?.armR) this.salesman.parts.armR.rotation.x = -0.2 + Math.sin(this.t * 1.3) * 0.15;
    // wrecked or gone: a replacement is delivered to the lot a minute later
    for (const rec of g.economy.ownedCars) {
      const car = this.cars.get(rec.uid);
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
