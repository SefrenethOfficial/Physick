import * as THREE from 'three';
import { blocked, nearestLandPoint, LAND_Y } from './world.js';
import { halfBeam, SHIP_LEN } from './ocean.js';
import { std, canvasTex } from './buildkit.js';
import { buildFigure, poseSeated } from './figure.js';
import { GLOW } from './effects.js';

// Small craft you drive: the starter dinghy, boats from the dealer, and police boats.
// Arcade water physics: thrust, drag, turning that needs way on, riding the swell, and ramming.

export const BOAT_TYPES = [
  { id: 'dinghy', name: 'Dinghy', price: 0, maxSpeed: 8, accel: 2.2, turn: 1.1, hp: 60, len: 3.8, beam: 1.7, depth: 0.7, style: 'dinghy', color: 0x8a9096, blurb: 'Your trusty starter. Slow.' },
  { id: 'skiff', name: 'Fishing Skiff', price: 900, maxSpeed: 12, accel: 3, turn: 0.95, hp: 90, len: 5.6, beam: 2.1, depth: 0.85, style: 'skiff', color: 0x2f6b8f, blurb: 'Cheap and cheerful.' },
  { id: 'speedboat', name: 'Speedboat', price: 2800, maxSpeed: 23, accel: 6, turn: 0.85, hp: 110, len: 7, beam: 2.5, depth: 1.0, style: 'speed', color: 0xc62828, blurb: 'Fast enough to outrun the harbour police.' },
  { id: 'rib', name: 'Patrol RIB', price: 4800, maxSpeed: 26, accel: 7, turn: 0.9, hp: 170, len: 8, beam: 2.8, depth: 1.0, style: 'rib', color: 0x2b2f36, blurb: 'Fast and tough; shrugs off rams.' },
  { id: 'cruiser', name: 'Cabin Cruiser', price: 9500, maxSpeed: 17, accel: 3, turn: 0.55, hp: 340, len: 12, beam: 4, depth: 1.5, style: 'cruiser', color: 0xf2f2ee, blurb: 'Built like a tank. Rams back.' },
  { id: 'yacht', name: 'Super Yacht', price: 26000, maxSpeed: 20, accel: 2.4, turn: 0.4, hp: 750, len: 24, beam: 6, depth: 2.4, style: 'yacht', color: 0xffffff, blurb: 'Make a statement.' },
  // the illegal ones: only from the sea pen under the volcano. Steel plate and bulletproof screens:
  // gunfire doesn't touch you or the boat, and the armour soaks up most of a ram
  { id: 'gofast', name: 'Armoured Go-Fast', price: 18000, illegal: true, armored: true, maxSpeed: 31, accel: 8, turn: 0.85, hp: 380, len: 9, beam: 2.6, depth: 1.0, style: 'speed', color: 0x1a1c20, blurb: 'A smuggler\'s go-fast. Bulletproof. Outruns anything the police have.' },
  { id: 'gunboat', name: 'Bulletproof Gunboat', price: 27000, illegal: true, armored: true, maxSpeed: 25, accel: 7, turn: 0.9, hp: 560, len: 9.5, beam: 3, depth: 1.1, style: 'rib', color: 0x2e3428, blurb: 'Armour-plated RIB. Shrugs off bullets and police rams alike.' },
  { id: 'ironclad', name: 'Armoured Cruiser', price: 42000, illegal: true, armored: true, maxSpeed: 19, accel: 3.5, turn: 0.55, hp: 950, len: 13, beam: 4.2, depth: 1.6, style: 'cruiser', color: 0x2a2c30, blurb: 'Steel plate over a cabin cruiser. Rams like a battleship.' },
];
export const POLICE_BOAT = { id: 'police', name: 'Police Boat', maxSpeed: 21, accel: 6, turn: 0.95, hp: 220, len: 9, beam: 3, depth: 1.1, style: 'police', color: 0xf2f2ee };
export const BOAT_BY_ID = Object.fromEntries([...BOAT_TYPES, POLICE_BOAT].map((t) => [t.id, t]));

// Lofted planing hull: bow at -Z, V-bottom, flat transom. Returns hull + deck geometry.
function hullGeometry(L, B, D) {
  const N = 26, M = 6;
  const pos = [], idx = [];
  const halfW = (t) => (B / 2) * Math.min(1, Math.pow(Math.max(t, 0.001) / 0.42, 0.6)) * (t > 0.85 ? 0.97 : 1);
  const keel = (t) => -D * 0.45 + (t < 0.2 ? Math.pow(1 - t / 0.2, 1.6) * D * 0.55 : 0);
  const top = (t) => D * 0.55 + (t < 0.25 ? (1 - t / 0.25) * D * 0.25 : 0);
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = -L / 2 + L * t;
      for (let j = 0; j <= M; j++) {
        const u = j / M;
        const y = keel(t) + (top(t) - keel(t)) * u;
        const w = halfW(t) * Math.min(1, 0.25 + u * 1.6);
        pos.push(side * w, y, z);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = base + i * (M + 1) + j, b = a + M + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // transom
  const tb = pos.length / 3, zt = L / 2;
  pos.push(0, (keel(1) + top(1)) / 2, zt);
  const ring = [];
  for (let j = 0; j <= M; j++) { const u = j / M; ring.push([halfW(1) * Math.min(1, 0.25 + u * 1.6), keel(1) + (top(1) - keel(1)) * u]); }
  const pts = [...ring, ...ring.slice().reverse().map(([w, y]) => [-w, y])];
  pts.forEach(([x, y]) => pos.push(x, y, zt));
  for (let k = 0; k < pts.length - 1; k++) idx.push(tb, tb + 1 + k, tb + 2 + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // deck (slightly below the gunwale)
  const dp = [], di = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -L / 2 + L * t, y = top(t) - 0.25, w = Math.max(halfW(t) * 0.95, 0.01);
    dp.push(-w, y, z, w, y, z);
    if (i < N) { const a = i * 2; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dg.setIndex(di);
  dg.computeVertexNormals();
  return { hull: g, deck: dg, deckY: top(0.6) - 0.25 };
}

export function buildBoat(type) {
  const { len: L, beam: B, depth: D } = type;
  const root = new THREE.Group();
  const { hull, deck, deckY } = hullGeometry(L, B, D);
  const paint = std({ color: type.color, roughness: 0.4, metalness: 0.15, side: THREE.DoubleSide });
  const deckM = std({ color: type.style === 'dinghy' ? 0x5a5f64 : 0xd9cfbd, roughness: 0.8, side: THREE.DoubleSide });
  const dark = std({ color: 0x1d1f22, roughness: 0.6 });
  const white = std({ color: 0xf4f4f0, roughness: 0.45 });
  const glass = std({ color: 0x1d2a33, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.7 });
  root.add(new THREE.Mesh(hull, paint), new THREE.Mesh(deck, deckM));
  // boot stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(B * 1.01, 0.08, L * 0.8), std({ color: type.style === 'police' ? 0x1c3f8f : 0x1b1d20 }));
  stripe.position.set(0, -D * 0.05, L * 0.08);
  stripe.visible = type.style !== 'dinghy';
  root.add(stripe);
  const helm = new THREE.Vector3(0, deckY + 0.55, L * 0.12); // where the driver sits

  const motor = (x) => {
    const m = new THREE.Group();
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.45), dark);
    cowl.position.y = 0.35;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.15), dark);
    leg.position.y = -0.2;
    m.add(cowl, leg);
    m.position.set(x, deckY + 0.15, L / 2 + 0.2);
    root.add(m);
  };
  const console_ = (z, w = 0.7) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.6), white);
    c.position.set(0, deckY + 0.45, z);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.4, 0.04), glass);
    ws.position.set(0, deckY + 1.1, z - 0.25);
    ws.rotation.x = -0.4;
    root.add(c, ws);
  };
  const s = type.style;
  if (s === 'dinghy') {
    const tube = std({ color: 0x8a9096, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, L * 0.8, 6, 12), tube);
      t.rotation.x = Math.PI / 2;
      t.position.set(side * (B / 2 - 0.1), deckY + 0.3, 0.1);
      root.add(t);
    }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(B * 0.8, 0.08, 0.35), std({ color: 0x8a6a48 }));
    bench.position.set(0, deckY + 0.3, 0.6);
    root.add(bench);
    motor(0);
    helm.set(0, deckY + 0.45, L * 0.3);
  } else if (s === 'skiff') {
    console_(0.2);
    motor(0);
    helm.set(0, deckY + 0.5, L * 0.18);
  } else if (s === 'speed' || s === 'rib') {
    if (s === 'rib') {
      const tube = std({ color: 0xff6a1a, roughness: 0.6 });
      for (const side of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, L * 0.75, 6, 12), tube);
        t.rotation.x = Math.PI / 2;
        t.position.set(side * (B / 2), deckY + 0.25, 0.3);
        root.add(t);
      }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(B * 0.42, 0.06, 6, 16, Math.PI), std({ color: 0xcfd3d6, metalness: 0.7 }));
      arch.position.set(0, deckY, L * 0.2);
      root.add(arch);
    } else {
      const wht = new THREE.Mesh(new THREE.BoxGeometry(B * 0.85, 0.1, L * 0.3), white);
      wht.position.set(0, deckY + 0.06, -L * 0.25);
      root.add(wht);
    }
    console_(-0.1, B * 0.6);
    for (const x of [-0.35, 0.35]) motor(x);
    helm.set(0, deckY + 0.5, L * 0.06);
  } else if (s === 'cruiser' || s === 'police') {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(B * 0.75, 1.5, L * 0.38), white);
    cabin.position.set(0, deckY + 0.75, -L * 0.05);
    const win = new THREE.Mesh(new THREE.BoxGeometry(B * 0.76, 0.5, L * 0.3), glass);
    win.position.set(0, deckY + 1.05, -L * 0.07);
    root.add(cabin, win);
    if (s === 'cruiser') {
      const fly = new THREE.Mesh(new THREE.BoxGeometry(B * 0.6, 0.12, L * 0.3), white);
      fly.position.set(0, deckY + 2.0, L * 0.02);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(B * 0.62, 0.6, 0.05), glass);
      rail.position.set(0, deckY + 2.35, -L * 0.12);
      root.add(fly, rail);
    } else {
      const t = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#1c3f8f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLICE', w / 2, h / 2 + 2); });
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: t }));
        p.position.set(side * (B * 0.385), deckY + 0.7, -L * 0.05);
        p.rotation.y = side * Math.PI / 2;
        root.add(p);
      }
      const red = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff2020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const blue = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x3060ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      red.position.set(-0.4, deckY + 1.75, -L * 0.05); blue.position.set(0.4, deckY + 1.75, -L * 0.05);
      red.scale.setScalar(3); blue.scale.setScalar(3);
      root.add(red, blue);
      root.userData.lights = { red, blue };
    }
    for (const x of [-0.5, 0.5]) motor(x);
    helm.set(0, deckY + 0.5, L * 0.22);
  } else if (s === 'yacht') {
    const tiers = [[0.8, 0.5, 2.0], [0.62, 0.38, 1.8], [0.4, 0.22, 1.6]];
    let y = deckY;
    tiers.forEach(([bw, lz, h], i) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(B * bw, h, L * lz), white);
      t.position.set(0, y + h / 2, -L * 0.02 + i * L * 0.03);
      const w = new THREE.Mesh(new THREE.BoxGeometry(B * bw + 0.02, h * 0.4, L * lz * 0.9), glass);
      w.position.set(0, y + h * 0.6, -L * 0.02 + i * L * 0.03);
      root.add(t, w);
      y += h;
    });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), std({ color: 0xcfd3d6, metalness: 0.7 }));
    mast.position.set(0, y + 1.5, 0);
    root.add(mast);
    helm.set(0, deckY + 0.5, L * 0.32);
  }
  // armour: steel plates down both sides, and the screens blacked out
  if (type.armored) {
    const steel = std({ color: 0x4a4e52, roughness: 0.55, metalness: 0.6 }), rivet = std({ color: 0x2a2c2e, metalness: 0.7 });
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.07, D * 0.42, L * 0.17), steel); pl.position.set(s * B * 0.5, D * 0.22, -L * 0.28 + i * L * 0.19); pl.rotation.z = s * 0.12; root.add(pl);
      for (const dz of [-1, 1]) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), rivet); r.position.set(s * B * 0.53, D * 0.36, -L * 0.28 + i * L * 0.19 + dz * L * 0.07); root.add(r); }
    }
    root.traverse((o) => { if (o.isMesh && o.material === glass) o.material = std({ color: 0x0c0e10, roughness: 0.2, metalness: 0.7 }); });
  }
  // driver (shown while someone's at the helm)
  const driver = buildFigure(type.style === 'police'
    ? { shirt: 0x1c2f6e, pants: 0x1b2638, skin: 0xd9a47c, hat: 'cap', hatColor: 0x111a33 }
    : { shirt: 0x2f7fd8, pants: 0x2c3440, skin: 0xf1c9a5 });
  poseSeated(driver.parts);
  driver.root.position.copy(helm).add(new THREE.Vector3(0, 0.1, 0.25));
  driver.root.rotation.y = Math.PI; // figure faces +Z; boats face -Z
  driver.root.visible = type.style === 'police';
  root.add(driver.root);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, driver, deckY };
}

// ---------------------------------------------------------------- one boat
export class Boat {
  constructor(game, type, x, z, heading, { owned = false, police = false } = {}) {
    this.game = game;
    this.type = type;
    const b = buildBoat(type);
    this.mesh = b.root;
    this.driver = b.driver;
    this.deckY = b.deckY;
    game.scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.hp = type.hp;
    this.owned = owned;
    this.police = police;
    this.sinking = 0;
    this.pitch = 0; this.roll = 0; this.heave = 0;
    this.radius = type.len * 0.42;
    this.sprayT = 0;
  }

  get forward() { return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  get alive() { return !this.sinking; }

  damage(n) {
    if (this.sinking || n <= 0) return;
    if (this.type.armored) n *= 0.4; // (the plate takes most of it)
    this.hp -= n;
    if (this.game.boats.active === this) this.game.hud.boatHit(n);
    if (this.hp <= 0) this.sink();
  }

  sink() {
    this.sinking = 0.001;
    this.speed *= 0.3;
    this.game.fx.explosion(this.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    this.game.sfx.play('explosion');
    this.game.boats.sunk(this);
  }

  update(dt, ctl) {
    const t = this.type, ocean = this.game.ocean;
    if (this.sinking) {
      this.sinking += dt;
      this.speed *= 1 - dt * 0.8;
      this.pos.addScaledVector(this.forward, this.speed * dt);
      this.mesh.position.set(this.pos.x, ocean.heightAt(this.pos.x, this.pos.z) - this.sinking * 0.9, this.pos.z);
      this.mesh.rotation.set(Math.min(this.sinking * 0.15, 0.6), this.heading, Math.min(this.sinking * 0.1, 0.4), 'YXZ');
      return;
    }
    const throttle = ctl ? ctl.throttle : 0;
    const steer = ctl ? ctl.steer : 0;
    const target = throttle > 0 ? throttle * t.maxSpeed : throttle * t.maxSpeed * 0.35;
    if (throttle) this.speed += THREE.MathUtils.clamp(target - this.speed, -t.accel * dt * 1.5, t.accel * dt);
    else this.speed *= 1 - dt * 0.45;
    const way = THREE.MathUtils.clamp(Math.abs(this.speed) / 4, 0.15, 1);
    this.heading -= steer * t.turn * way * Math.sign(this.speed || 1) * dt;

    const prev = this.pos.clone();
    this.pos.addScaledVector(this.forward, this.speed * dt);

    // hit the coast or a pier?
    const f = this.forward, r = new THREE.Vector3(-f.z, 0, f.x);
    const L2 = t.len / 2, B2 = t.beam / 2;
    let hit = false;
    for (const [a, b] of [[L2, 0], [-L2, 0], [0, B2], [0, -B2], [L2 * 0.6, B2], [L2 * 0.6, -B2]]) {
      if (blocked(this.pos.x + f.x * a + r.x * b, this.pos.z + f.z * a + r.z * b)) { hit = true; break; }
    }
    // ... or the destroyer?
    if (!hit) {
      const local = this.game.frame.worldToLocal(this.pos.clone());
      if (Math.abs(local.z) < SHIP_LEN / 2 + this.radius) {
        const tt = (local.z + SHIP_LEN / 2) / SHIP_LEN;
        if (Math.abs(local.x) < halfBeam(THREE.MathUtils.clamp(tt, 0.001, 0.999)) + B2 + 0.3 && tt > -0.02 && tt < 1.02) hit = true;
      }
    }
    if (hit) {
      this.pos.copy(prev);
      if (Math.abs(this.speed) > 4) {
        this.damage((Math.abs(this.speed) - 4) * 4);
        this.game.sfx.play('thud');
        if (this.game.boats.active === this) this.game.shake = 0.7;
      }
      this.speed = -this.speed * 0.25;
    }

    // ride the swell; bow lifts as she gets on the plane
    const h = (a, b) => ocean.heightAt(this.pos.x + f.x * a + r.x * b, this.pos.z + f.z * a + r.z * b);
    const hb = h(L2, 0), hs = h(-L2, 0), hp = h(0, -B2), hst = h(0, B2);
    const planing = THREE.MathUtils.clamp(this.speed / t.maxSpeed, 0, 1);
    const k = Math.min(dt * 4, 1);
    this.heave += ((hb + hs + hp + hst) / 4 + planing * 0.15 - this.heave) * k;
    this.pitch += (Math.atan2(hb - hs, t.len) + planing * 0.09 - this.pitch) * k;
    this.roll += (Math.atan2(hst - hp, t.beam) * 0.6 + steer * planing * 0.12 - this.roll) * k;
    this.mesh.position.set(this.pos.x, this.heave, this.pos.z);
    this.mesh.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');

    // spray off the bow at speed
    this.sprayT -= dt;
    if (Math.abs(this.speed) > 6 && this.sprayT <= 0) {
      this.sprayT = 0.05;
      const bow = this.pos.clone().addScaledVector(f, L2 * 0.6);
      bow.y = this.heave + 0.2;
      for (const side of [-1, 1]) {
        const v = r.clone().multiplyScalar(side * (1.5 + Math.random() * 2)).add(new THREE.Vector3(0, 1.5 + Math.random() * 1.5, 0)).addScaledVector(f, this.speed * 0.3);
        this.game.fx.emit(bow.clone().addScaledVector(r, side * B2), v, 0xcfe2ee, 0.5 + Math.random() * 0.4, 1, 0.5);
      }
    }
    // police lights
    const L = this.mesh.userData.lights;
    if (L) { const on = (performance.now() / 180) % 2 < 1; L.red.visible = on; L.blue.visible = !on; }
  }

  dispose() {
    this.mesh.removeFromParent();
  }
}

// ---------------------------------------------------------------- the fleet
export class Boats {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.active = null;
    this.camQuat = new THREE.Quaternion();
    this.respawnQueue = [];
  }

  berthFree(b) {
    return !this.list.some((x) => x.alive && Math.hypot(x.pos.x - b.x, x.pos.z - b.z) < 5);
  }

  spawnOwned(id) {
    const type = BOAT_BY_ID[id];
    const berths = this.game.city.berths;
    const big = type.len > 10;
    const pen = type.illegal && this.game.volcano?.penBerth?.(type); // (the illegal ones live in the sea pen)
    if (pen) { const boat = new Boat(this.game, type, pen.x, pen.z, pen.heading, { owned: true }); this.list.push(boat); return boat; }
    const b = berths.find((x) => this.berthFree(x) && (!big || Math.abs(x.z) > 10)) || berths[0];
    // big boats moor further out
    const boat = new Boat(this.game, type, b.x + (big ? type.len * 0.3 : 0), b.z + (big ? Math.sign(b.z || 1) * type.beam * 0.4 : 0), b.heading, { owned: true });
    this.list.push(boat);
    return boat;
  }

  spawnPolice(x, z, heading) {
    const boat = new Boat(this.game, POLICE_BOAT, x, z, heading, { police: true });
    this.list.push(boat);
    return boat;
  }

  remove(boat) {
    boat.dispose();
    this.list.splice(this.list.indexOf(boat), 1);
  }

  nearbyOwned(pos) {
    let best = null, bd = 6 + 1;
    for (const b of this.list) {
      if (!b.owned || !b.alive) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) - b.type.len * 0.3;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  enter(boat) {
    this.active = boat;
    boat.driver.root.visible = true;
    this.camQuat.setFromEuler(new THREE.Euler(0, boat.heading, 0));
    this.game.hud.setMode('boat');
    this.game.sfx.play('engineStart');
  }

  exit() {
    const b = this.active;
    if (!b) return false;
    const p = nearestLandPoint(b.pos.x, b.pos.z);
    if (!p || p.dist > b.type.beam / 2 + 7) { this.game.hud.toast('Too far from shore to get off — find a pier or the coast'); return false; }
    this.active = null;
    b.driver.root.visible = false;
    b.speed = 0;
    this.game.leaveBoatAt(new THREE.Vector3(p.x, LAND_Y + 0.95, p.z), b.heading);
    return true;
  }

  sunk(boat) {
    if (boat === this.active) {
      this.active = null;
      boat.driver.root.visible = false;
      this.game.boatSunk();
    }
    if (boat.owned) this.respawnQueue.push({ id: boat.type.id, t: 30 });
    if (boat.police) this.game.police?.policeBoatSunk(boat);
  }

  update(dt, keys) {
    for (const b of [...this.list]) {
      let ctl = null;
      if (b === this.active) {
        ctl = {
          throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
          steer: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
        };
      } else if (b.police) ctl = this.game.police.boatAI(b, dt);
      b.update(dt, ctl);
      if (b.sinking > 6) this.remove(b);
    }
    // boats bumping and ramming each other
    const L = this.list.filter((b) => b.alive);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], c = L[j];
      const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), min = a.radius + c.radius;
      if (d >= min || d < 0.001) continue;
      const nx = dx / d, nz = dz / d;
      const push = (min - d) / 2;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      c.pos.x += nx * push; c.pos.z += nz * push;
      const va = a.forward.multiplyScalar(a.speed), vc = c.forward.multiplyScalar(c.speed);
      const closing = (va.x - vc.x) * nx + (va.z - vc.z) * nz;
      if (closing > 2) {
        const ma = a.type.hp, mc = c.type.hp; // tougher boats are heavier
        c.damage(closing * 1.6 * THREE.MathUtils.clamp(ma / mc, 0.5, 1.5));
        a.damage(closing * 0.8 * THREE.MathUtils.clamp(mc / ma, 0.5, 1.5));
        a.speed *= 0.4; c.speed *= 0.6;
        this.game.sfx.play('thud');
        if (a === this.active || c === this.active) this.game.shake = 0.8;
      }
    }
    // insured boats come back to the marina
    for (const q of [...this.respawnQueue]) {
      q.t -= dt;
      if (q.t <= 0) {
        this.respawnQueue.splice(this.respawnQueue.indexOf(q), 1);
        this.spawnOwned(q.id);
        this.game.hud.toast(`Your ${BOAT_BY_ID[q.id].name} is back ${BOAT_BY_ID[q.id].illegal ? 'in the sea pen' : 'at the marina'}`);
      }
    }
    const a = this.active;
    if (a) this.game.sfx.setEngine(true, 0.2 + Math.abs(a.speed) / a.type.maxSpeed);
  }

  cameraPose(camera, dt, b = this.active) {
    const k = 1 - Math.exp(-dt * 4);
    this.camQuat.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.heading, 0)), k);
    const L = b.type.len;
    const off = new THREE.Vector3(0, 2.6 + L * 0.25, 5 + L * 1.15).applyQuaternion(this.camQuat);
    camera.position.copy(b.mesh.position).add(off);
    camera.position.y = Math.max(camera.position.y, this.game.ocean.heightAt(camera.position.x, camera.position.z) + 1.2);
    camera.up.set(0, 1, 0);
    camera.lookAt(b.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(b.forward, L));
  }
}
