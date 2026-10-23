import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, std } from './buildkit.js';
import { Heli } from './cargo.js';
import { buildInterior } from './interiors.js';

// Places to live. Buy one and you wake up there (in bed) instead of at the hospital, and the
// hospital doesn't bill you. Every home has a furnished inside: press E at the front door to go in
// (you can look round a place before you buy it).

const money = (n) => '$' + n.toLocaleString();

export class Homes {
  constructor(game) {
    this.game = game;
    const g = game, sm = g.saltmarsh;
    // the two Saltmarsh homes for sale: a bungalow and a two-storey, as near the beach as they come
    const byBeach = (list) => list.sort((a, b) => a.door.x - b.door.x)[0];
    const ranch = byBeach((sm.homes || []).filter((h) => h.floors === 1));
    const twoStorey = byBeach((sm.homes || []).filter((h) => h.floors === 2));
    this.list = [
      { id: 'hollows', name: 'Walk-up in the Hollows', area: 'The Hollows', price: 4500, door: g.hood.flat.door, yaw: g.hood.flat.yaw,
        desc: 'One room over the laundromat noise: a bed, a couch, a telly on a milk crate and a kitchenette. The lock works, mostly. Nobody asks questions round here.' },
      ranch && { id: 'ranch', name: 'Saltmarsh bungalow', area: 'Saltmarsh Key', price: 85000, door: ranch.door, yaw: ranch.yaw,
        desc: 'A tidy single-storey on a quiet street, a short walk from the beach. Open-plan living room and kitchen, a dining table by the window, and a cosy bedroom at the back.' },
      twoStorey && { id: 'family', name: 'Saltmarsh family home', area: 'Saltmarsh Key', price: 160000, door: twoStorey.door, yaw: twoStorey.yaw,
        desc: 'Two storeys: a big kitchen with an island, a dining room and a living room downstairs; a master bedroom and a kid\'s room up the stairs.' },
      { id: 'penthouse', name: 'Plaza Tower penthouse', area: 'Verian City', price: 750000, door: g.city.penthouse.door, yaw: g.city.penthouse.yaw,
        desc: 'The top floor over the plaza: marble floors, a wall of glass onto the city skyline, a grand piano, a backlit bar and a bedroom suite.' },
    ].filter(Boolean);
    for (const h of this.list) {
      h.inner = buildInterior(game, h);
      h.spawn = h.inner.wake;
      h.sign = this.forSale(h);
    }
    this.inside = null; // the home you're in
    // two warm lamps that light whichever home you're in (always in the scene so nothing recompiles)
    this.lamps = [0, 1].map(() => { const l = new THREE.PointLight(0xffe2c0, 0, 16, 1.2); game.scene.add(l); return l; });
    this.refresh();
  }

  owns(id) { return this.game.economy.ownedHomes.includes(id); }
  get spawnHome() { const e = this.game.economy; return this.list.find((h) => h.id === e.homeSpawn && this.owns(h.id)); }

  // a FOR SALE board on a post by the front door (it turns into a SOLD board when it's yours)
  forSale(h) {
    const g = this.game;
    const root = new THREE.Group();
    const f = new THREE.Vector3(-Math.sin(h.yaw), 0, -Math.cos(h.yaw)); // out of the front door
    const side = new THREE.Vector3(-f.z, 0, f.x);
    root.position.copy(h.door).addScaledVector(side, 2.2);
    root.rotation.y = h.yaw;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 0.1), std({ color: 0xf2f0ea }));
    post.position.y = 0.95;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.05), std({ color: 0xffffff }));
    board.position.set(0, 1.45, 0);
    root.add(post, board);
    g.scene.add(root);
    h.board = board;
    return root;
  }

  refresh() {
    for (const h of this.list) {
      const owned = this.owns(h.id), home = this.game.economy.homeSpawn === h.id;
      const tex = canvasTex(256, 164, (c, w, hh) => {
        c.fillStyle = owned ? '#1f5f3a' : '#b3261e'; c.fillRect(0, 0, w, hh);
        c.fillStyle = '#ffffff'; c.fillRect(8, 8, w - 16, hh - 16);
        c.fillStyle = owned ? '#1f5f3a' : '#b3261e'; c.textAlign = 'center';
        c.font = 'bold 44px Arial'; c.fillText(owned ? (home ? 'HOME' : 'SOLD') : 'FOR SALE', w / 2, 60);
        c.fillStyle = '#222'; c.font = 'bold 30px Arial'; c.fillText(owned ? 'Yours' : money(h.price), w / 2, 108);
        c.font = '20px Arial'; c.fillText(owned ? 'E to go inside' : 'E to look round', w / 2, 140);
      });
      const m = std({ map: tex, roughness: 0.6 });
      h.board.material = [std({ color: 0xffffff }), std({ color: 0xffffff }), std({ color: 0xffffff }), std({ color: 0xffffff }), m, m];
    }
  }

  nearDoor(pos) {
    for (const h of this.list) {
      if (Math.hypot(pos.x - h.door.x, pos.z - h.door.z) < 3.4 && Math.abs(pos.y - h.door.y - 1) < 3) return h;
      const s = h.sign.position;
      if (Math.hypot(pos.x - s.x, pos.z - s.z) < 2.4 && Math.abs(pos.y - s.y - 1) < 3) return h;
    }
    return null;
  }

  action(pos) {
    const near = (p, r) => Math.hypot(pos.x - p.x, pos.z - p.z) < r && Math.abs(pos.y - 1 - p.y) < 1.6;
    const h = this.inside;
    if (h) {
      if (near(h.inner.exit, 1.8)) return { label: 'Go outside', run: () => this.leave() };
      if (near(h.inner.bed, 2.0)) return this.owns(h.id) ? { label: 'Sleep (heal up)', run: () => this.sleep(h) } : { label: `Buy the place to sleep here (${money(h.price)})`, run: () => this.open(h) };
      return null;
    }
    const d = this.nearDoor(pos);
    if (!d) return null;
    if (this.owns(d.id)) return { label: `Go inside${this.game.economy.homeSpawn === d.id ? ' (home)' : ''}`, run: () => this.enter(d) };
    return { label: `${d.name}: for sale, ${money(d.price)}`, run: () => this.open(d) };
  }

  enter(h) {
    const g = this.game;
    if (g.police.wanted > 0) { g.hud.toast('Not with the police on your tail', 0xff8a6a); return; }
    g.economy.isOpen && g.economy.close();
    g.endDrag(false);
    g.story.fade(() => { this.placeInside(h, h.inner.spawn, 0); });
  }

  // put the player in a home (spawn point inside it) and switch the lights on
  placeInside(h, at, yaw = 0) {
    const g = this.game;
    g.placeOnShore(at.clone(), yaw);
    this.inside = h;
    h.inner.lights.forEach((p, i) => { const l = this.lamps[i]; l.position.copy(p); l.color.set(h.inner.tint); });
    g.cullFar?.();
  }

  leave() {
    const g = this.game, h = this.inside;
    if (!h) return;
    g.story.fade(() => {
      this.inside = null;
      const f = new THREE.Vector3(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
      g.placeOnShore(h.door.clone().addScaledVector(f, 0.8).add(new THREE.Vector3(0, 1.1, 0)), h.yaw);
      g.cullFar?.();
    });
  }

  sleep(h) {
    const g = this.game, e = g.economy;
    g.story.fade(() => {
      g.health.heal(100);
      if (e.homeSpawn !== h.id) { e.homeSpawn = h.id; e.save(); this.refresh(); }
      g.hud.toast(`You sleep like a log. ${h.name} is home: you'll wake up here.`, 0x7be08a);
    });
  }

  open(h) {
    const g = this.game, e = g.economy;
    const render = () => {
      const owned = this.owns(h.id), isHome = e.homeSpawn === h.id, inHere = this.inside === h;
      const funds = e.money + e.bank;
      const body = owned
        ? `<p>${h.desc}</p><p>${isHome ? 'This is <b>home</b>: when things go wrong, you wake up here (no hospital bill).' : 'You own this place.'}</p>
           <div class="btns">${inHere ? '' : '<button data-a="in">Go inside</button>'}${isHome ? '<button data-a="plaza">Spawn at the plaza instead</button>' : '<button data-a="home">Make this home (spawn here)</button>'}</div>`
        : `<p>${h.desc}</p><p class="price">${money(h.price)}</p>
           <p><small>Paid from your pocket first, then your account at Verian National. Your home is where you wake up after a bad day, instead of the hospital.</small></p>
           <div class="btns">${inHere ? '' : '<button data-a="in">Look round inside</button>'}<button data-a="buy" ${funds < h.price ? 'disabled' : ''}>${funds < h.price ? `You're ${money(h.price - funds)} short` : `Buy for ${money(h.price)}`}</button></div>`;
      e.open(`${h.name} · ${h.area}`, e.header() + body, (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b || b.disabled) return;
        if (b.dataset.a === 'in') { e.close(); this.enter(h); return; }
        if (b.dataset.a === 'buy') this.buy(h);
        if (b.dataset.a === 'home') this.setSpawn(h.id);
        if (b.dataset.a === 'plaza') this.setSpawn(null);
        render();
      }));
    };
    render();
  }

  buy(h) {
    const g = this.game, e = g.economy;
    if (this.owns(h.id) || e.money + e.bank < h.price) return false;
    const fromCash = Math.min(e.money, h.price);
    e.bank -= h.price - fromCash;
    e.addMoney(-fromCash);
    e.ownedHomes.push(h.id);
    e.homeSpawn = h.id; // the newest place is home (you can switch back)
    e.save();
    g.sfx.play('cash');
    g.hud.toast(`You bought ${h.name}! You'll wake up here from now on`, 0x7be08a);
    g.news?.add(`Property news: the ${h.name} in ${h.area} has sold for ${money(h.price)}.`, 'money');
    this.refresh();
    return true;
  }

  // where you start the game and come round after dying: a home you own, or null for the plaza
  setSpawn(id) {
    const g = this.game, e = g.economy, h = this.list.find((x) => x.id === id);
    e.homeSpawn = h && this.owns(h.id) ? h.id : null;
    e.save();
    this.refresh();
    g.hud.toast(e.homeSpawn ? `${h.name} is home now: you'll wake up here` : 'Spawn reset: you\'ll start at the plaza (and come round at the hospital)', 0x7be08a);
  }

  // the phone's Home app: pick where you spawn from anywhere
  app() {
    return {
      id: 'home', icon: '🏠', name: 'Home',
      render: (head) => {
        const e = this.game.economy, mine = this.list.filter((h) => this.owns(h.id));
        const row = (title, small, on, cmd, id = '') => `<div class="ph-item"><div><b>${title}</b><small>${small}</small></div>${on ? '<small>✓ Spawn</small>' : `<button data-a="app-act" data-app="home" data-cmd="${cmd}" data-id="${id}">Spawn here</button>`}</div>`;
        return head('Home') + '<div class="ph-list">'
          + row('Verian Plaza', 'Start at the plaza; come round at the hospital after a bad day', !e.homeSpawn, 'plaza')
          + mine.map((h) => row(h.name, `${h.area} · wake up in your own bed, no hospital bill`, e.homeSpawn === h.id, 'set', h.id)).join('')
          + (mine.length ? '' : '<small class="ph-empty">You don\'t own a home yet. Look for FOR SALE signs.</small>') + '</div>';
      },
      act: (cmd, d) => this.setSpawn(cmd === 'set' ? d.id : null),
    };
  }

  // back home after a bad day (or at the start of the game)
  wakeAtHome() {
    const h = this.spawnHome;
    if (!h) return false;
    this.placeInside(h, h.inner.wake, 0);
    return true;
  }

  update() {
    if (!this.appAdded && this.game.story?.phone) { this.game.story.phone.addApp(this.app()); this.appAdded = true; }
    const h = this.inside;
    if (h) {
      // moved out some other way (a mission, a respawn): you're not in here any more
      const p = this.game.shorePlayer.body.translation();
      if (!this.game.onShore || Math.hypot(p.x - h.inner.origin.x, p.z - h.inner.origin.z) > 30 || Math.abs(p.y - h.inner.origin.y) > 12) this.inside = null;
    }
    const cur = this.inside;
    for (const [i, l] of this.lamps.entries()) l.intensity = cur && cur.inner.lights[i] ? 26 * cur.inner.power : 0;
  }
}

// ---------------------------------------------------------------- the helicopter
// Flown like the arcade ones: W/S tilt forward and back, A/D turn, Space climbs, Shift drops.
// It sits on the Cherry Crest pad until you take it; wreck it and a new one turns up later.

export class Chopper {
  constructor(game, pad) {
    this.game = game;
    this.pad = pad.clone();
    this.heli = new Heli(game);
    this.heli.ladder.visible = false;
    this.mesh = this.heli.root;
    this.mesh.traverse((o) => { if (o.isMesh && o.material.color?.getHex() === 0x1f2a3a) { o.material = o.material.clone(); o.material.color.set(0xf2f0ea); } });
    this.type = { name: 'Helicopter', hp: 400, car: true };
    this.isHeli = true;
    this.hp = this.maxHp = 400;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = Math.PI / 2;
    this.speed = 0;
    this.spin = 0; // rotor speed 0..1
    this.available = false;
    this.reset();
  }

  get active() { return this.game.vehicles.active === this; }

  get forward() { return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)); } // (same convention as the cars)

  reset() {
    this.pos.copy(this.pad).add(new THREE.Vector3(0, 1.6, 0));
    this.vel.set(0, 0, 0);
    this.heading = -Math.PI / 2;
    this.hp = this.maxHp;
    this.dead = false;
    this.pitch = this.roll = 0;
    this.spin = 0;
    this.pose(0);
  }

  setAvailable(on) { this.available = on; this.mesh.visible = on; }

  enter() {
    const g = this.game;
    g.endDrag(false);
    g.clearDropHeld?.();
    g.vehicles.active = this;
    g.shorePlayer.collider.setEnabled(false);
    g.vehicles.camQuat.setFromEuler(new THREE.Euler(0, this.heading, 0));
    g.hud.setMode('car');
    g.sfx.play('engineStart');
    g.hud.toast('W/S tilt · A/D turn · Space climb · Shift descend · E to get out (on the ground)', 0x9ec5ff);
  }

  get altitude() { return this.pos.y - 1.6 - this.ground(this.pos.x, this.pos.z); }

  exit() {
    const g = this.game;
    if (this.altitude > 2.5) { g.hud.toast('Put her down first (Shift)', 0xffd166); return false; }
    g.vehicles.active = null;
    g.sfx.setEngine(false);
    const f = this.forward, left = new THREE.Vector3(f.z, 0, -f.x);
    const out = this.pos.clone().addScaledVector(left, 2.6);
    g.placeOnShore(new THREE.Vector3(out.x, this.ground(out.x, out.z) + 1.2, out.z), this.heading);
    return true;
  }

  // highest solid thing (or the sea) under a point
  ground(x, z, fromY = this.pos.y + 1) {
    const sb = this.game.portSandbox;
    const hit = sb.world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), 400, true, undefined, undefined, undefined, undefined,
      (col) => sb.staticColliders.has(col.handle));
    return Math.max(hit ? fromY - hit.timeOfImpact : -50, 0.3);
  }

  update(dt) {
    if (!this.available) return;
    const g = this.game;
    if (this.dead) {
      this.deadT -= dt;
      if (this.wreckFall) { this.vel.y -= 9.8 * dt; this.pos.addScaledVector(this.vel, dt); const gy = this.ground(this.pos.x, this.pos.z) + 1.2; if (this.pos.y < gy) { this.pos.y = gy; this.vel.set(0, 0, 0); this.wreckFall = false; } this.mesh.position.copy(this.pos); }
      if (this.deadT <= 0) { this.reset(); this.mesh.visible = true; this.mesh.traverse((o) => { if (o.isMesh && o.userData.burnt) { o.material = o.userData.burnt; delete o.userData.burnt; } }); }
      return;
    }
    const keys = this.active && !g.health.dead ? g.keys : new Set();
    this.spin = Math.min(1, Math.max(0, this.spin + (this.active ? dt * 0.6 : -dt * 0.3)));
    const lift = this.spin >= 1;
    const fwdIn = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const turn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const up = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
    const gy = this.ground(this.pos.x, this.pos.z);
    const onGround = this.pos.y - 1.6 <= gy + 0.05;
    if (lift) {
      this.heading += turn * 1.4 * dt * (onGround ? 0.3 : 1);
      const f = this.forward;
      if (!onGround) this.vel.addScaledVector(f, fwdIn * 16 * dt);
      this.vel.y += (up * 9 - this.vel.y * 1.6) * dt;
      // drag: she settles to a hover when you let go
      const k = Math.exp(-dt * 0.55);
      this.vel.x *= k; this.vel.z *= k;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 42) { this.vel.x *= 42 / hs; this.vel.z *= 42 / hs; }
      if (this.pos.y > 260) this.vel.y = Math.min(this.vel.y, 0);
    } else {
      this.vel.y -= 9.8 * dt;
    }
    // into a wall or a hillside: stop, and if it was fast, it hurts
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z), hs = hv.length();
    if (hs > 0.5) {
      const sb = g.portSandbox, d = hv.clone().normalize();
      for (const dy of [-1.2, 0.4]) {
        const hit = sb.world.castRay(new RAPIER.Ray({ x: this.pos.x, y: this.pos.y + dy, z: this.pos.z }, d), hs * dt + 4.2, true, undefined, undefined, undefined, undefined,
          (col) => sb.staticColliders.has(col.handle));
        if (hit) {
          if (hs > 14) this.damage((hs - 10) * 9);
          this.vel.x = -this.vel.x * 0.3; this.vel.z = -this.vel.z * 0.3;
          g.shake = Math.max(g.shake || 0, 0.6);
          g.sfx.play('thud');
          break;
        }
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    const ng = this.ground(this.pos.x, this.pos.z);
    if (this.pos.y - 1.6 < ng) {
      const vy = this.vel.y;
      this.pos.y = ng + 1.6;
      if (vy < -11) this.damage((-vy - 9) * 25);
      this.vel.y = Math.max(0, this.vel.y);
      if (ng <= 0.31) { this.damage(dt * 150); this.vel.multiplyScalar(0.9); } // in the sea
      this.vel.x *= 0.85; this.vel.z *= 0.85;
    }
    // lean into it
    const lf = this.forward;
    const fs = this.vel.x * lf.x + this.vel.z * lf.z;
    this.pitch += ((onGround ? 0 : 0.18 * fwdIn + fs * 0.004) - this.pitch) * Math.min(1, dt * 3);
    this.roll += ((onGround ? 0 : -turn * 0.18) - this.roll) * Math.min(1, dt * 3);
    this.speed = fs;
    this.pose(g.time || performance.now() / 1000);
    if (this.active) {
      g.shorePlayer.body.setTranslation({ x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z }, true);
      g.sfx.setEngine(true, 0.4 + this.spin * 0.5 + Math.abs(up) * 0.15);
    }
  }

  pose(time) {
    const m = this.mesh;
    m.position.copy(this.pos);
    m.rotation.set(this.pitch, this.heading + Math.PI, this.roll, 'YXZ'); // (the model's nose is +z)
    this.rotorAngle = (this.rotorAngle || 0) + this.spin * 0.9;
    this.heli.rotor.rotation.y = this.rotorAngle;
    this.heli.tail.rotation.x = this.rotorAngle * 1.6;
    void time;
  }

  damage(n) {
    if (this.dead || n <= 0) return;
    this.hp -= n;
    if (this.hp > 0) return;
    const g = this.game;
    this.dead = true;
    this.deadT = 45;
    this.wreckFall = true;
    g.fx.explosion(this.pos.clone());
    g.sfx.play('explosion');
    this.mesh.traverse((o) => { if (o.isMesh) { o.userData.burnt = o.material; o.material = std({ color: 0x1a1816, roughness: 1 }); } });
    if (this.active) g.health.damage(1000, 'carCrash');
  }
}

// ---------------------------------------------------------------- chase camera for the chopper
export function chopperCamera(camera, dt, v, camQuat) {
  const k = 1 - Math.exp(-dt * 4);
  camQuat.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.heading, 0)), k);
  const off = new THREE.Vector3(0, 4.5, 15).applyQuaternion(camQuat);
  const target = v.pos.clone().add(new THREE.Vector3(0, 1, 0));
  camera.position.copy(target).add(off);
  camera.up.set(0, 1, 0);
  camera.lookAt(target.clone().addScaledVector(v.forward, 6));
}
