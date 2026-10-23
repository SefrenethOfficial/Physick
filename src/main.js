import { SIGNS } from "./buildkit.js";
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Sandbox } from './sandbox.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { Npcs } from './npcs.js';
import { Health } from './health.js';
import { Ocean } from './ocean.js';
import { Ship, HELM, DECK } from './ship.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Viewmodel } from './viewmodel.js';
import { PlayerRagdoll } from './ragdoll.js';
import { ITEMS, ITEM_BY_ID, LOOT_COMMON, LOOT_RARE } from './items.js';
import { Gunnery } from './guns.js';
import { Port, GANGWAY_FOOT, LAND_Y } from './port.js';
import { Jets } from './jets.js';
import { Blood } from './blood.js';
import { loadSettings, bindSettingsPanel } from './settings.js';
import { Graphics } from './graphics.js';
import { Story } from './story.js';
import { CargoShip } from './cargo.js';
import { Breakables } from './breakables.js';
import { TitleScene } from './title.js';
import { Track } from './music.js';
import { deckHalfWidth } from './ship.js';
import { onLand } from './port.js';
import { City } from './city.js';
import { Saltmarsh } from './saltmarsh.js';
import { Economy, BAG_CAPACITY } from './economy.js';
import { Boats, BOAT_TYPES } from './boats.js';
import { Citizens } from './citizens.js';
import { Police } from './police.js';
import { ISLANDS, PIERS, nearestLandPoint, islandAt } from './world.js';
import { mergeStatic, MERGED } from './merge.js';
import { Traffic } from './traffic.js';
import { Park } from './park.js';
import { Hood } from './hood.js';
import { Gangs } from './gangs.js';
import { Stores } from './stores.js';
import { Bridge } from './bridge.js';
import { Highway } from './highway.js';
import { Homes } from './homes.js';
import { Garage } from './garage.js';
import { Airport } from './airport.js';
import { Bank } from './bank.js';
import { Vehicles } from './vehicles.js';
import { Car, clearSpot } from './carphys.js';
import { Underworld } from './underworld.js';
import { ChaseMusic } from './music.js';

const FOV = 75;
const SKY_TOP = 0x4a83c4;
const HORIZON = 0xcbdbe7;
const FOG_NEAR = 180;
const FOG_FAR = 2400;
const SUN = new THREE.Vector3(-0.42, 0.5, -0.75).normalize(); // afternoon sun, off the port bow

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.keys = new Set();
    this.locked = false;
    this.started = false;
    this.atHelm = false;
    this.onShore = true;
    this.panelOpen = false;
    this.pick = null; // pickpocket in progress
    this.punchT = 0;
    this.jetTrigger = false;
    this.settings = loadSettings();
    this.dragging = null; // { prop, local } a body being dragged
    this.mopping = false;
    this.heldProp = null;
    this.held = null; // item def carried in the robot hand
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.shake = 0;
    this.time = 0; // game seconds (pauses with the game)
    this.events = { on() {}, emit() {} }; // sandbox hooks (no listeners needed here)
  }

  async init() {
    const loadingEl = document.getElementById('loading');
    await this.loadStep('Starting physics…', 3);
    await RAPIER.init();

    // ---------- renderer / scene ----------
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !!this.settings.antialias, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 6000);
    this.scene.add(this.camera);
    this.buildSky();

    // Everything on the ship lives in this group (the "ship frame").
    this.frame = new THREE.Group();
    this.scene.add(this.frame);

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.sandbox = new Sandbox(this);
    this.sandbox.scene = this.frame;
    this.effects = new Effects(this.frame);
    this.sfx = new Sfx();

    await this.loadStep('Building the ship…', 10);
    this.ocean = new Ocean(this.scene, {
      sun: SUN, skyTop: SKY_TOP, skyHorizon: HORIZON, fogColor: HORIZON, fogNear: FOG_NEAR, fogFar: FOG_FAR,
    });
    this.ship = new Ship(this);
    this.world.step(); // scene queries only see new colliders after a step

    // The naval air station has its own physics world in world coordinates.
    await this.loadStep('Building the air station…', 20);
    this.portWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.portSandbox = new Sandbox(this, { world: this.portWorld, scene: this.scene });
    this.port = new Port(this, this.portSandbox);
    await this.loadStep('Building Verian City…', 32);
    this.city = new City(this, this.portSandbox);
    this.saltmarsh = new Saltmarsh(this, this.portSandbox);
    this.cargo = new CargoShip(this, this.portSandbox);
    await this.loadStep('Running down the Hollows…', 48);
    this.hood = new Hood(this, this.portSandbox);
    mergeStatic(this.hood.group);
    await this.loadStep('Planting Cherry Estate…', 58);
    this.park = new Park(this, this.portSandbox);
    mergeStatic(this.park.group);
    await this.loadStep('Stringing the bridge…', 70);
    this.bridge = new Bridge(this, this.portSandbox, this.park.bridge.start, this.park.bridge.end);
    {
      const e = this.bridge.at(this.bridge.length + 12);
      this.bridge.groundRoad([[e.x, e.z], [-1010, -1262], [-1000, -1300]]);
    }
    mergeStatic(this.bridge.group);
    await this.loadStep('Closing the airport…', 80);
    this.airport = new Airport(this, this.portSandbox);
    mergeStatic(this.airport.group);
    mergeStatic(this.port.group);
    mergeStatic(this.city.group);
    mergeStatic(this.saltmarsh.group);
    this.breakables = new Breakables(this); // every tree and lamp, now the world's built
    this.portWorld.step();

    await this.loadStep('Loading your arm…', 88);
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/robotic_arm.glb`, (e) => {
      if (e.total) loadingEl.textContent = `Loading your arm… ${Math.round((e.loaded / e.total) * 100)}%`;
    });
    this.viewmodel = new Viewmodel(gltf.scene, FOV);


    this.shipPlayer = new Player(this, new THREE.Vector3(0, DECK + 1.3, 44));
    this.shorePlayer = new Player(this, this.city.spawn.clone(), { world: this.portWorld, sandbox: this.portSandbox });
    this.shorePlayer.yaw = -Math.PI / 2; // looking east, toward the pawn shop
    this.health = new Health(this);
    this.hud = new Hud(this);
    this.npcs = new Npcs(this);
    this.npcs.populate();
    this.blood = new Blood(this);
    this.worldBlood = new Blood(this, { parent: this.scene, sandbox: this.portSandbox, npcs: () => this.citizens });
    this.gunnery = new Gunnery(this);
    this.jets = new Jets(this);
    this.stockStores();
    this.economy = new Economy(this);
    this.hud.setMoney(this.economy.money);
    this.hud.setBag(this.economy.weight, BAG_CAPACITY);
    this.boats = new Boats(this);
    for (const id of this.economy.ownedBoats) this.boats.spawnOwned(id);
    this.police = new Police(this);
    this.citizens = new Citizens(this);
    this.citizens.populate();
    this.gangs = new Gangs(this);
    this.gangs.populate();
    this.stores = new Stores(this);
    this.hostage = null;
    this.traffic = new Traffic(this);
    this.traffic.addNetwork('city', this.city.xs, this.city.zs, this.city.lane, 18, 11);
    this.traffic.addNetwork('town', this.saltmarsh.xs, this.saltmarsh.zs, 2.4, 5, 8);
    this.traffic.addNetwork('hood', this.hood.xs, this.hood.zs, 2.4, 4, 7);
    this.vehicles = new Vehicles(this);
    this.bank = new Bank(this);
    this.placeATMs();
    for (const sp of [...this.city.parkedSpots, ...this.saltmarsh.parkedSpots, ...this.hood.parkedSpots]) {
      if (!clearSpot(this, sp.x, sp.z, sp.heading)) continue; // no room (a tree, a wall): leave the space empty
      this.vehicles.parked.push(new Car(this, { color: sp.color, police: !!sp.police, x: sp.x, z: sp.z, heading: sp.heading }));
    }
    this.underworld = new Underworld(this);
    ['arms', 'fence', 'chop'].forEach((kind, i) => { if (this.city.alleys[i]) this.underworld.addDealer(kind, this.city.alleys[i], LAND_Y + 0.15); });
    this.music = new ChaseMusic(import.meta.env.BASE_URL);
    this.grenades = [];
    this.fireT = 0;
    this.spawnLoot();
    this.hud.setMode('shore');
    this.eye = new THREE.Object3D(); // camera pose in the ship frame

    this.bindInput();
    bindSettingsPanel(this);
    this.resize();
    addEventListener('resize', () => this.resize());

    await this.loadStep('Ready', 100);
    this.loadDone();
    document.querySelector('#overlay .play').disabled = false;
    this.hud.showOverlay(true, true);
    this.sfx.unlock(); // (you've already clicked, so the browser allows it)
    this.highway = new Highway(this);
    this.homes = new Homes(this);
    this.garage = new Garage(this);
    this.title = new TitleScene(this);
    this.title.start();

    this.timer = new THREE.Timer();
    this.timer.connect?.(document);
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.pragdoll = new PlayerRagdoll(this);
    this.story = new Story(this);
    this.graphics = new Graphics(this);
    this.graphics.apply();
    this.renderer.setAnimationLoop((now) => { if (this.graphics.shouldRender(now)) this.tick(); });
    window.physick = this;
    this.signs = SIGNS;
    this.itemDefs = ITEM_BY_ID;
    this.THREE = THREE;
  }

  // Loading popup on the title screen
  async loadStep(text, pct) {
    document.getElementById('loading').textContent = text;
    document.querySelector('#loadpop .bar i').style.width = `${pct}%`;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  loadDone() {
    const p = document.getElementById('loadpop');
    p.classList.add('done');
    setTimeout(() => p.remove(), 700);
  }

  // The walker you're controlling: aboard (ship frame) or ashore (world frame).
  get player() { return this.onShore ? this.shorePlayer : this.shipPlayer; }
  // Physics props in whichever world you're standing in.
  get sb() { return this.onShore ? this.portSandbox : this.sandbox; }
  get flying() { return !!this.jets?.active; }

  // ---------- ship <-> shore ----------
  gangwayTop() {
    return new THREE.Vector3(this.ship.side * 6.7, DECK, 0);
  }

  applySettings() {
    if (!this.settings.blood) { this.blood.clear(); this.worldBlood.clear(); }
    this.graphics?.apply();
  }

  // ---------- city life: moving about, money, the bag ----------
  placeOnShore(pos, yaw = this.shorePlayer.yaw) {
    if (this.pragdoll?.active) this.pragdoll.clear();
    this.endDrag(false);
    if (this.boats.active) { this.boats.active.driver.root.visible = false; this.boats.active = null; }
    if (this.vehicles?.active) this.vehicles.active = null;
    this.shorePlayer.collider.setEnabled(true);
    this.atHelm = false;
    this.onShore = true;
    this.shorePlayer.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.shorePlayer.vel.set(0, 0, 0);
    this.shorePlayer.yaw = yaw;
    this.shorePlayer.pitch = 0;
    this.hud.setMode('shore');
  }

  leaveBoatAt(pos, heading) {
    this.placeOnShore(pos, heading);
    this.sfx.setEngine(false);
  }

  boatSunk() {
    this.sinkingBoat = this.boats.list.find((b) => b.sinking && b.owned) || null;
    this.health.damage(1000, 'boat');
  }

  holdItem(def) {
    this.held = def;
    this.viewmodel.setHeld(def.build().mesh, def.heldSize, def.heldRot, def.heldPush);
    this.refreshHolding();
    this.sfx.play('grab');
  }

  refreshHolding() {
    const d = this.held;
    if (!d) { this.hud.setHolding(null); return; }
    this.hud.setHolding(d.gun ? `${d.name} · ${this.economy.ammo[d.gun.ammo] || 0} rds` : d.name);
  }

  // Something bought: into your hand if it's free, else the bag, else at your feet.
  giveItem(def) {
    if (!this.held) { this.holdItem(def); return; }
    if (!this.economy.stash(def)) this.dropFromBag(def);
  }

  // ---------- guns ----------
  fire() {
    const def = this.held, G = def?.gun;
    if (!G || this.fireT > 0) return;
    this.lastShotT = this.time;
    const e = this.economy;
    if (!(e.ammo[G.ammo] > 0)) { this.sfx.play('error'); this.hud.toast(`Out of ${def.name.toLowerCase()} ammo — Vic sells more`, 0xff8a6a); this.firing = false; this.fireT = 0.4; return; }
    e.ammo[G.ammo]--;
    this.saveAmmoT = 1;
    this.fireT = G.rate;
    if (!G.auto) this.firing = false;
    this.sfx.play(G.sound);
    this.viewmodel.kick(G.pellets > 1 ? 1.4 : G.auto ? 0.35 : 0.8);
    this.shake = Math.max(this.shake, G.pellets > 1 ? 0.35 : 0.12);
    const eye = this.player.eye, base = this.lookDir();
    const toWorld = (v) => (this.onShore ? v.clone() : this.frame.localToWorld(v.clone()));
    const right = new THREE.Vector3().crossVectors(base, new THREE.Vector3(0, 1, 0)).normalize();
    const muzzle = eye.clone().addScaledVector(base, 0.7).addScaledVector(right, 0.22).add(new THREE.Vector3(0, -0.2, 0));
    this.fx.flash(toWorld(muzzle), 0xffc060, 1.2, 0.05);
    for (let k = 0; k < G.pellets; k++) {
      const dir = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * G.spread, (Math.random() - 0.5) * 2 * G.spread, (Math.random() - 0.5) * 2 * G.spread)).normalize();
      const hit = this.sb.raycast(eye, dir, G.range, this.player.collider);
      const end = hit ? hit.point : eye.clone().addScaledVector(dir, G.range);
      if (k < 3) this.police.tracer(toWorld(muzzle), toWorld(end));
      if (!hit) continue;
      const set = this.onShore ? this.citizens : this.npcs;
      if (hit.npc && set.list.includes(hit.npc)) {
        set.damage(hit.npc, G.dmg, dir.clone().setY(0).normalize(), hit.point);
        for (let i = 0; i < 4; i++) this.fx.emit(toWorld(hit.point), dir.clone().multiplyScalar(2).add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5)), 0x8a0a0a, 0.4, 1, 0);
      } else if (hit.prop) {
        hit.prop.body.applyImpulseAtPoint(dir.clone().multiplyScalar(G.dmg * 0.02), hit.point, true);
      } else {
        if (this.onShore && this.bank.hitATM(hit.collider, G.dmg)) continue;
        const car = this.onShore && this.carByCollider(hit.collider);
        if (car) this.shootCar(car, G.dmg, hit.point);
        for (let i = 0; i < 3; i++) this.fx.emit(toWorld(hit.point), hit.normal.clone().multiplyScalar(2).add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5)), 0xffd27a, 0.25, 1, 0);
      }
    }
    if (this.onShore) {
      const p = this.player.body.translation();
      this.citizens.alarm(p, 45);
      if (this.time - (this.lastShotCrime || -9) > 0.6) { this.lastShotCrime = this.time; this.police.crime('shooting', 1, new THREE.Vector3(p.x, p.y, p.z)); }
    }
    this.refreshHolding();
  }

  carByCollider(col) {
    const body = col.parent();
    if (!body) return null;
    return this.vehicles.all.find((c) => c.body === body) || null;
  }

  // Shooting a car: your own takes damage; a driver under fire bails out and runs.
  shootCar(car, dmg, hitPoint = null) {
    if ((car.monster || car.bulletproof) && hitPoint) { this.fx.flash(hitPoint, 0xffe0a0, 0.6, 0.05); return; } // bulletproof: it just sparks
    car.damage(dmg * 0.45);
    if (hitPoint) { // a little dent where the round went in
      const local = hitPoint.clone().sub(car.pos).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -car.heading);
      car.dent(local, 0.03);
    }
    if (this.traffic.cars.includes(car) && !car.wreck) {
      const v = this.vehicles;
      v.steal({ car, kind: 'traffic' }, false); // the driver bails out and runs
    }
  }

  // Explosion at a world point: knocks everyone over, shoves props, hurts you and cars.
  blast(p, radius, dmg, crime = true) {
    this.fx.explosion(p);
    this.sfx.play('explosion');
    this.shake = Math.max(this.shake, 1);
    for (const n of [...this.citizens.list]) {
      const t = n.body.translation();
      const d = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      if (d > radius) continue;
      const v = new THREE.Vector3(t.x - p.x, 0, t.z - p.z).normalize().multiplyScalar(12 * (1 - d / radius) + 3); v.y = 6;
      this.citizens.knockOver(n, v, 8, { killed: true, point: new THREE.Vector3(t.x, t.y, t.z), dir: v.clone() });
      if (crime) this.police.crime(n.role === 'cop' ? 'copkill' : 'murder', n.role === 'cop' ? 3 : 2, new THREE.Vector3(t.x, t.y, t.z));
    }
    for (const pr of this.portSandbox.props) {
      const t = pr.body.translation();
      const d = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      if (d > radius * 1.3) continue;
      const v = new THREE.Vector3(t.x - p.x, t.y - p.y + 1, t.z - p.z).normalize().multiplyScalar((1 - d / (radius * 1.3)) * 14);
      pr.body.setLinvel(v, true);
    }
    for (const c of this.vehicles.all) {
      const d = c.pos.distanceTo(p);
      if (c.wreck || d > radius * 1.4) continue;
      const k = 1 - d / (radius * 1.4);
      const push = c.pos.clone().sub(p).setY(0).normalize();
      c.body.applyImpulse({ x: push.x * k * 9000, y: 0, z: push.z * k * 9000 }, true);
      c.body.applyTorqueImpulse({ x: 0, y: (Math.random() - 0.5) * k * 20000, z: 0 }, true);
      c.dent(push.clone().multiplyScalar(-1).applyAxisAngle(new THREE.Vector3(0, 1, 0), -c.heading), 0.25 * k);
      c.dazedT = 2;
      if (d < radius) this.shootCar(c, dmg * 2 * k / 0.45);
    }
    const pt = this.shorePlayer.body.translation();
    const dp = Math.hypot(pt.x - p.x, pt.y - p.y, pt.z - p.z);
    if (this.onShore && dp < radius) this.health.damage(dmg * (1 - dp / radius) * 1.3, 'explosion');
    this.citizens.alarm(p, 60);
    if (crime) this.police.crime('explosion', 1, p.clone());
  }

  updateGrenades(dt) {
    for (const gr of [...this.grenades]) {
      gr.t -= dt;
      if (!gr.sb.props.has(gr.prop)) { this.grenades.splice(this.grenades.indexOf(gr), 1); continue; }
      if (gr.t > 0) continue;
      const t = gr.prop.body.translation();
      let p = new THREE.Vector3(t.x, t.y, t.z);
      gr.sb.remove(gr.prop);
      this.grenades.splice(this.grenades.indexOf(gr), 1);
      if (gr.sb === this.sandbox) {
        // aboard the destroyer: crew go flying
        for (const n of [...this.npcs.list]) {
          const q = n.body.translation();
          const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
          if (d < 7) { const v = new THREE.Vector3(q.x - p.x, 0, q.z - p.z).normalize().multiplyScalar(12); v.y = 6; this.npcs.knockOver(n, v, 8, { killed: true, point: new THREE.Vector3(q.x, q.y, q.z), dir: v }); }
        }
        const sp = this.shipPlayer.body.translation();
        const dp = Math.hypot(sp.x - p.x, sp.y - p.y, sp.z - p.z);
        if (!this.onShore && dp < 7) this.health.damage(90 * (1 - dp / 7), 'explosion');
        p = this.frame.localToWorld(p);
        this.fx.explosion(p);
        this.sfx.play('explosion');
        this.shake = 1;
      } else this.blast(p, 7, 90);
    }
  }

  clearHand() {
    this.firing = false;
    this.held = null;
    this.mopping = false;
    this.viewmodel.setHeld(null);
    this.hud.setHolding(null);
  }

  // Something taken out of the bag and dropped at your feet.
  dropFromBag(def) {
    const eye = this.player.eye, dir = this.lookDir().setY(0).normalize();
    const pos = eye.clone().addScaledVector(dir, 0.9);
    pos.y -= 0.4;
    this.sb.spawn(def, pos, new THREE.Quaternion(), { noHistory: true });
    this.sfx.play('drop');
  }

  // B: put the held item (or the thing you're looking at) in the bag.
  stash() {
    if (this.held) {
      const def = this.held;
      if (this.economy.stash(def)) { this.clearHand(); this.sfx.play(def.cash ? 'cash' : 'grab'); }
      return;
    }
    const hit = this.lookHit();
    if (hit?.prop?.def.item) {
      const def = hit.prop.def;
      if (this.economy.stash(def)) { if (this.onShore) this.stores.onTake(hit.prop, 'bag'); this.sb.remove(hit.prop); this.sfx.play(def.cash ? 'cash' : 'grab'); }
    } else this.hud.toast('Nothing to bag — look at an item, or hold one');
  }

  spawnLoot() {
    const sb = this.portSandbox;
    const pick = (a) => ITEM_BY_ID[a[Math.floor(Math.random() * a.length)]];
    const place = (def, p) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      sb.spawn(def, new THREE.Vector3(p.x, p.y + 0.25, p.z), q, { noHistory: true });
    };
    for (const p of this.city.lootSpots) if (Math.random() < 0.6) place(pick(Math.random() < 0.1 ? LOOT_RARE : LOOT_COMMON), p);
    for (const p of this.hood.lootSpots) place(pick(Math.random() < 0.12 ? LOOT_RARE : LOOT_COMMON), p);
    for (const p of this.park.lootSpots) place(pick(Math.random() < 0.15 ? LOOT_RARE : LOOT_COMMON), p);
    for (const s of this.saltmarsh.lootSpots) {
      const rare = s.kind === 'porch' ? 0.3 : s.kind === 'stall' ? 0.2 : 0.08;
      place(pick(Math.random() < rare ? LOOT_RARE : LOOT_COMMON), s.pos);
    }
    // mops to clean up after yourself, and a couple of bats
    const mop = ITEM_BY_ID.mop, bat = ITEM_BY_ID.bat;
    const plaza = this.city.spawn;
    place(mop, plaza.clone().add(new THREE.Vector3(3, 0, -3)));
    place(bat, plaza.clone().add(new THREE.Vector3(-3, 0, -2)));
    place(mop, this.saltmarsh.market.clone().add(new THREE.Vector3(0, 1, 30)));
    place(mop, this.saltmarsh.dock.clone().add(new THREE.Vector3(3, 1, 3)));
  }

  // Bare-handed punch, or a swing of whatever melee weapon you're holding.
  punch() {
    if (this.punchT > 0) return;
    const melee = this.held?.melee;
    this.punchT = melee ? 0.6 : 0.42;
    this.viewmodel.kick(melee ? 1.2 : 0.7);
    const hit = this.lookHit(melee ? 2.6 : 2.1);
    if (!hit) { this.sfx.play('drop'); return; }
    const dir = this.lookDir();
    if (hit.npc) {
      const set = this.onShore ? this.citizens : this.npcs;
      if (!set.list.includes(hit.npc)) return;
      this.sfx.play('punch');
      set.damage(hit.npc, melee || 34, dir.clone().setY(0).normalize(), hit.point);
      this.fx.emit(hit.point, dir.clone().multiplyScalar(-2), 0xff4040, 0.3, 1, 0);
    } else if (hit.prop) {
      this.sfx.play('punch');
      hit.prop.body.applyImpulseAtPoint(dir.multiplyScalar(melee ? 6 : 3), hit.point, true);
    } else if (!(this.onShore && this.bank.hitATM(hit.collider, melee ? melee * 0.6 : 12))) this.sfx.play('impact');
  }

  // Search a body you're looking at (once each).
  searchBody(rd) {
    if (rd.searched) { this.hud.toast('Already searched'); return; }
    rd.searched = true;
    const loot = rd.loot || { cash: 0, items: [] };
    if (loot.cash) { this.economy.addMoney(loot.cash, 'from the body'); this.sfx.play('cash'); }
    let dropped = 0;
    for (const id of loot.items) {
      const def = ITEM_BY_ID[id];
      if (!this.economy.stash(def, true)) { this.dropFromBag(def); dropped++; }
      else this.hud.toast(`${def.name} → bag`);
    }
    if (!loot.cash && !loot.items.length) this.hud.toast('Nothing on them');
    if (dropped) this.hud.toast('Bag full — dropped the rest', 0xff8a6a);
    const t = rd.torso.body.translation();
    this.police.crime('theft', 1, new THREE.Vector3(t.x, t.y, t.z));
  }

  // Living townsperson you're looking at, and whether you're behind them.
  pickTarget() {
    if (!this.onShore || this.held?.melee) return null;
    const hit = this.lookHit(2.2);
    const npc = hit?.npc;
    if (!npc || !this.citizens.list.includes(npc)) return null;
    const t = npc.body.translation(), p = this.player.body.translation();
    const toMe = new THREE.Vector3(p.x - t.x, 0, p.z - t.z).normalize();
    const facing = new THREE.Vector3(Math.sin(npc.heading), 0, Math.cos(npc.heading));
    return { npc, behind: facing.dot(toMe) < -0.2 };
  }

  updatePickpocket(dt) {
    const pk = this.pick;
    if (!pk) return;
    const cur = this.pickTarget();
    if (!this.keys.has('KeyE') || !cur || cur.npc !== pk.npc || !cur.behind) { this.pick = null; return; }
    pk.t += dt;
    pk.check -= dt;
    if (pk.check <= 0) {
      pk.check = 0.3;
      const odds = pk.npc.role === 'cop' ? 0.12 : pk.npc.speed > 1 ? 0.045 : 0.07;
      if (Math.random() < odds) {
        const t = pk.npc.body.translation();
        this.hud.toast('They noticed!', 0xff6a5a);
        this.sfx.play('scream');
        const at = new THREE.Vector3(t.x, t.y, t.z);
        this.police.crime('theft', 1, at);
        if (pk.npc.role === 'cop') this.police.report(1, at, true, 'theft');
        else {
          this.citizens.flee(pk.npc, this.player.body.translation(), 10);
          Object.assign(pk.npc, { reportT: 1.5, reportSev: 1, reportPos: at, reportSeen: true, reportWhy: 'theft' });
        }
        pk.npc.pickpocketed = true;
        this.pick = null;
        return;
      }
    }
    if (pk.t >= 1.2) {
      const n = pk.npc;
      n.pickpocketed = true;
      if (n.cash) { this.economy.addMoney(n.cash, 'pickpocketed'); this.sfx.play('cash'); n.cash = 0; }
      if (n.items.length && Math.random() < 0.5) {
        const def = ITEM_BY_ID[n.items.pop()];
        if (this.economy.stash(def, true)) this.hud.toast(`Lifted a ${def.name.toLowerCase()}`, 0x7be08a);
      }
      this.pick = null;
    }
  }

  leaveJetAt(pos, yaw) {
    this.onShore = true;
    this.shorePlayer.body.setTranslation(pos, true);
    this.shorePlayer.vel.set(0, 0, 0);
    this.shorePlayer.yaw = yaw;
    this.shorePlayer.pitch = 0;
    this.hud.setMode('shore');
  }

  jetCrashed() {
    this.jetTrigger = false;
    this.health.damage(1000, 'jet');
  }

  // Dying on land: you crumple (third person) until you come round at the hospital.
  onDeath() {
    if (!this.onShore || this.flying || this.boats.active) return;
    if (this.pragdoll.active) { this.pragdoll.dead = true; return; }
    const v = this.vehicles.active;
    if (v) { this.vehicles.active = null; this.hud.setMode('deck'); }
    const t = this.shorePlayer.body.translation();
    const pos = v ? v.pos.clone().add(new THREE.Vector3(0, 1.6, 0)) : new THREE.Vector3(t.x, t.y, t.z);
    const vel = v ? v.vel.clone().add(new THREE.Vector3(0, 2, 0)) : this.shorePlayer.vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2));
    this.endDrag(false);
    this.clearDropHeld?.();
    this.pragdoll.start(pos, this.shorePlayer.yaw, vel, { dead: true, spin: 2 });
  }

  // Down in the lab: pitch dark but for its own lights, and silent apart from you (and the music).
  setUnderground(on) {
    if (on === !!this.underMode) return;
    this.underMode = on;
    const f = this.scene.fog;
    if (on) {
      this.overworld = { fogColor: f.color.clone(), near: f.near, far: f.far, hemi: this.hemi.intensity, sun: this.sun.intensity, exp: this.renderer.toneMappingExposure };
      f.color.set(0x020403); f.near = 3; f.far = 30;
      this.hemi.intensity = 0.09;
      this.sun.intensity = 0;
      this.sky.visible = false;
      this.ocean.near.visible = this.ocean.far.visible = false;
      this.renderer.setClearColor(0x000000);
      // your torch: the only real light down here
      if (!this.torch) {
        this.torch = new THREE.SpotLight(0xfff1dc, 38, 30, 0.42, 0.55, 1.3);
        this.torch.target = new THREE.Object3D();
      }
      this.scene.add(this.torch, this.torch.target);
    } else if (this.overworld) {
      const o = this.overworld;
      f.color.copy(o.fogColor); f.near = this.view?.fogNear ?? o.near; f.far = this.view?.fogFar ?? o.far;
      this.hemi.intensity = o.hemi;
      this.sun.intensity = o.sun;
      this.renderer.toneMappingExposure = o.exp;
      this.sky.visible = true;
      this.ocean.near.visible = this.ocean.far.visible = true;
      if (this.torch) { this.torch.removeFromParent(); this.torch.target.removeFromParent(); }
    }
    this.sfx.muffled = on;
    if (on) this.sfx.setEngine(false);
  }

  respawnPlayer() {
    // patched up at the hospital in Verian City; the bill comes out of your pocket
    if (this.pragdoll.active) this.pragdoll.clear();
    this.sinkingBoat = null;
    this.clearHand();
    this.police.clearWanted();
    const home = this.homes?.spawnHome;
    if (home) { this.placeOnShore(home.spawn.clone(), home.yaw); this.hud.toast(`You come round at home: ${home.name}`, 0x7be08a); return; }
    this.placeOnShore(this.city.hospital.clone(), 0);
    const bill = Math.round(this.economy.money * 0.1);
    if (bill) this.economy.addMoney(-bill, 'hospital bill');
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          top: { value: new THREE.Color(SKY_TOP) },
          horizon: { value: new THREE.Color(HORIZON) },
          sun: { value: SUN },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; varying vec3 vP;
          void main(){
            float h = max(vP.y, 0.0);
            vec3 c = mix(horizon, top, pow(h, 0.45));
            float s = max(dot(vP, sun), 0.0);
            c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.18);
            if (vP.y < 0.0) c = horizon;
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);

    this.hemi = new THREE.HemisphereLight(0xd6e6ff, 0x2a4a5e, 1.4);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1dc, 2.8));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = s.bottom = -40; s.right = s.top = 40; s.near = 1; s.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
  }

  // ---------- helm ----------
  nearHelm() {
    if (this.onShore) return false;
    const e = this.player.eye;
    return e.distanceTo(HELM) < 1.9;
  }

  takeHelm() {
    this.atHelm = true;
    this.player.vel.set(0, 0, 0);
    // step up behind the wheel, facing the bow
    const t = this.player.body.translation();
    this.player.body.setTranslation({ x: 0, y: t.y, z: HELM.z + 1.15 }, true);
    this.player.yaw = 0;
    this.player.pitch = -0.08;
    this.hud.setMode('helm');
    this.hud.toast('You have the conn');
    this.sfx.play('select');
  }

  leaveHelm() {
    if (!this.atHelm) return;
    this.atHelm = false;
    this.hud.setMode('deck');
  }

  // ---------- stores & your hand ----------
  stockStores() {
    const sb = this.sandbox;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const NAVAL = ['ammo', 'toolbox', 'rations', 'medkit', 'extinguisher', 'jerrycan', 'lifejacket', 'wrench', 'rope', 'shell', 'flashlight'];
    const shelfItems = NAVAL.map((id) => ITEM_BY_ID[id]);
    const spots = [...this.ship.storeSpots].sort(() => Math.random() - 0.5);
    spots.slice(0, Math.min(spots.length, 30)).forEach((p) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 0.6 - 0.3 + (Math.abs(p.x) > 1 ? Math.PI / 2 : 0));
      sb.spawn(pick(shelfItems), p, q, { noHistory: true });
    });
    const mug = ITEMS.find((i) => i.id === 'mug'), rations = ITEMS.find((i) => i.id === 'rations');
    // mops: one in the stores, one by the mess door, one out on deck by the hangar
    const mop = ITEMS.find((i) => i.id === 'mop');
    for (const p of [[2.6, DECK + 0.9, 6.2], [-2.6, DECK + 0.9, 1.6], [4.2, DECK + 0.9, 31.5]]) {
      sb.spawn(mop, new THREE.Vector3(...p), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), { noHistory: true });
    }
    this.ship.messSpots.forEach((p, i) => sb.spawn(i % 3 === 2 ? rations : mug, p, new THREE.Quaternion(), { noHistory: true }));
  }

  lookDir() {
    return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ'));
  }

  lookHit(max = 2.6) {
    return this.sb.raycast(this.player.eye, this.lookDir(), max, this.player.collider);
  }

  pickUp() {
    const hit = this.lookHit();
    if (!hit?.prop?.def.item) return false;
    const def = hit.prop.def;
    if (this.onShore) this.stores.onTake(hit.prop, 'hand');
    this.sb.remove(hit.prop);
    this.held = def;
    this.viewmodel.setHeld(def.build().mesh, def.heldSize, def.heldRot, def.heldPush);
    this.hud.setHolding(def.name);
    this.sfx.play('grab');
    return true;
  }

  // Put the held item down where you're looking (or just in front of you), or throw it.
  release(throwIt) {
    const def = this.held;
    if (!def) return;
    const eye = this.player.eye, dir = this.lookDir();
    const hit = this.sb.raycast(eye, dir, throwIt ? 1.0 : 2.4, this.player.collider);
    let pos;
    if (hit) pos = hit.point.clone().addScaledVector(hit.normal, def.radius * 0.7).addScaledVector(dir, -0.05);
    else pos = eye.clone().addScaledVector(dir, throwIt ? 0.9 : 1.3);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
    const prop = this.sb.spawn(def, pos, q, { noHistory: true });
    if (def.grenade && throwIt) { this.grenades.push({ prop, sb: this.sb, t: 3.2 }); this.sfx.play('switch'); }
    if (throwIt) {
      const v = dir.multiplyScalar(13).add(this.player.vel);
      prop.body.setLinvel(v, true);
      prop.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true);
      this.viewmodel.kick(0.8);
      this.sfx.play('drop');
    } else {
      this.sfx.play('drop');
    }
    this.held = null;
    this.viewmodel.setHeld(null);
    this.hud.setHolding(null);
  }

  useHeld() {
    const def = this.held;
    if (!def) return;
    if (def.use === 'heal') {
      if (this.health.hp >= this.health.max) { this.hud.toast('Already at full health'); return; }
      this.health.heal(50);
      this.hud.toast('Patched up (+50)', 0x7be08a);
      this.sfx.play('freeze');
      this.held = null;
      this.viewmodel.setHeld(null);
      this.hud.setHolding(null);
    } else if (def.use === 'armor') {
      if (this.health.armor >= 99) { this.hud.toast('Already wearing armour'); return; }
      this.health.armor = 100;
      this.hud.toast('Armour on', 0x7fb2ff);
      this.sfx.play('freeze');
      this.clearHand();
    } else if (def.use === 'eat') {
      if (this.stores?.unpaid.some((u) => u.def === def && u.held)) this.stores.ateUnpaid(def);
      this.health.heal(def.heal || 5);
      this.hud.toast(`${def.name} (+${def.heal || 5})`, 0x7be08a);
      this.sfx.play('select');
      this.clearHand();
    } else if (def.use === 'coffee') {
      this.health.heal(10);
      this.hud.toast('Navy coffee. Strong. (+10)', 0xc8a24a);
      this.sfx.play('select');
    } else {
      this.hud.toast(`Can't use the ${def.name.toLowerCase()}`);
    }
  }

  // ---------- dragging bodies ----------
  tryDrag() {
    let hit = this.lookHit(3.2);
    if (hit?.npc) {
      // grabbing a living person knocks them out cold (no blood)
      const set = this.onShore ? this.citizens : this.npcs;
      if (!set.list.includes(hit.npc)) return false;
      const t = hit.npc.body.translation();
      const rd = set.knockOver(hit.npc, new THREE.Vector3(), 0.5, { killed: false });
      if (this.onShore) this.police.crime('assault', 1, new THREE.Vector3(t.x, t.y, t.z));
      hit = { ...hit, prop: rd.torso, point: rd.torso.mesh.position.clone() };
    }
    const prop = hit?.prop;
    if (!prop?.ragdoll) return false;
    const t = prop.body.translation();
    const q = new THREE.Quaternion().copy(prop.body.rotation()).invert();
    this.dragging = { prop, local: hit.point.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(q) };
    this.viewmodel.gripTarget = 1;
    this.sfx.play('grab');
    return true;
  }

  endDrag(heave) {
    const d = this.dragging;
    this.dragging = null;
    this.viewmodel.gripTarget = 0;
    if (!d || !this.sb.props.has(d.prop)) return;
    if (heave) {
      const v = this.lookDir().multiplyScalar(7);
      v.y += 2.5;
      for (const p of d.prop.ragdoll.parts) p.body.setLinvel(v, true);
      this.viewmodel.kick(1);
      this.sfx.play('drop');
    }
  }

  updateDrag() {
    const d = this.dragging;
    if (!d) return;
    if (!this.sb.props.has(d.prop)) { this.endDrag(false); return; }
    const b = d.prop.body;
    const t = b.translation();
    const grab = d.local.clone().applyQuaternion(new THREE.Quaternion().copy(b.rotation())).add(new THREE.Vector3(t.x, t.y, t.z));
    const eye = this.player.eye;
    const target = eye.clone().addScaledVector(this.lookDir(), 1.6);
    target.y = Math.max(target.y, eye.y - 1.25);
    if (grab.distanceTo(eye) > 4) { this.endDrag(false); return; }
    const v = target.sub(grab).multiplyScalar(9);
    if (v.length() > 7) v.setLength(7);
    b.setLinvel(v, true);
  }

  // ---------- mop ----------
  updateMop(dt) {
    if (!this.mopping || this.held?.use !== 'mop') { this.mopScrub = 0; return; }
    const blood = this.onShore ? this.worldBlood : this.blood;
    const hit = blood.cast(this.player.eye, this.lookDir(), 3);
    this.mopScrub = (this.mopScrub || 0) + dt;
    this.viewmodel.kick(0.08);
    if (hit) {
      if (blood.mop(hit.point, 0.75, dt) && this.mopScrub > 0.35) { this.sfx.play('scrub'); this.mopScrub = 0; }
    }
  }

  // ---------- stepping on and off the ship ----------
  stepAshore(world, localVel) {
    this.endDrag(false);
    this.onShore = true;
    const p = this.shorePlayer;
    p.body.setTranslation(world, true);
    p.vel.copy(localVel).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.ship.heading);
    p.yaw = this.ship.heading + this.shipPlayer.yaw;
    p.pitch = this.shipPlayer.pitch;
    p.wasOnGround = false;
    this.hud.setMode('shore');
  }

  stepAboard(local, localVel) {
    this.endDrag(false);
    this.onShore = false;
    const p = this.shipPlayer;
    p.body.setTranslation({ x: local.x, y: Math.max(local.y, DECK + 0.87), z: local.z }, true);
    p.vel.copy(localVel);
    p.yaw = this.shorePlayer.yaw - this.ship.heading;
    p.pitch = this.shorePlayer.pitch;
    p.wasOnGround = false;
    this.hud.setMode('deck');
  }

  checkTransfer() {
    if (this.flying || this.health.dead) return;
    if (!this.onShore) {
      const t = this.shipPlayer.body.translation();
      if (Math.abs(t.z) < 56 && Math.abs(t.x) > deckHalfWidth(t.z) + 0.3 && t.y > DECK - 3) {
        const w = this.frame.localToWorld(new THREE.Vector3(t.x, t.y, t.z));
        if (this.ship.moored || onLand(w.x, w.z, 4)) this.stepAshore(w, this.shipPlayer.vel.clone());
      }
    } else {
      const p = this.shorePlayer.body.translation();
      const local = this.frame.worldToLocal(new THREE.Vector3(p.x, p.y, p.z));
      if (Math.abs(local.z) < 54 && Math.abs(local.x) < deckHalfWidth(local.z) - 0.2 && local.y > DECK - 1.2 && local.y < DECK + 4) {
        const v = this.shorePlayer.vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.ship.heading);
        this.stepAboard(local, v);
      }
    }
  }

  overboard() {
    this.sfx.play('splash');
    this.hud.toast('Man overboard!', 0xff8a6a);
    this.health.damage(40, 'overboard');
    if (!this.health.dead) this.player.respawn();
  }

  near(p, r) {
    const t = this.shorePlayer.body.translation();
    return this.onShore && Math.hypot(t.x - p.x, t.z - p.z) < r && Math.abs(t.y - p.y - 1) < 2;
  }

  // What E does when you're on land, most specific first.
  shoreAction() {
    const pos = this.shorePlayer.body.translation();
    const sa = this.story.action(pos);
    if (sa) return sa;
    const home = this.homes?.action(pos);
    if (home) return home;
    const jet = this.jets.nearby(pos);
    if (jet) return { label: 'Fly the jet', run: () => this.jets.enter(jet) };
    if (this.near(this.city.pawnCounter, 3.5)) return { label: 'Pawn shop — sell loot', run: () => this.economy.openPawn() };
    if (this.near(this.city.dealerCounter, 4)) return { label: 'Boat sales', run: () => this.economy.openDealer(BOAT_TYPES) };
    const dealer = this.underworld.near(pos);
    if (this.bank.nearCounter(pos)) return { label: 'Bank teller', run: () => this.bank.open(false) };
    const st = this.stores.nearCounter(pos);
    if (st && this.stores.clerkOK(st)) {
      const owed = this.stores.unpaid.some((u) => u.st === st);
      return { label: owed ? 'Pay at the counter' : st.theme === 'diner' ? 'Order food' : st.theme === 'office' ? 'Talk to reception' : st.theme === 'hospital' ? 'See the doctor' : st.theme === 'police' ? 'Front desk' : 'Talk to the clerk', run: () => this.stores.open(st) };
    }
    const atm = this.bank.nearATM(pos);
    if (atm) return { label: 'Use the ATM', run: () => this.bank.open(true) };
    if (dealer) return { label: `Talk to ${dealer.title.split(' ')[0].replace(/[^\w']/g, '')}`, run: () => this.underworld.open(dealer) };
    const car = this.vehicles.nearby(pos);
    if (car) return { label: car.kind === 'mine' ? 'Get in' : car.kind === 'police' ? 'Steal the police car' : 'Steal the car', run: () => this.vehicles.steal(car) };
    const hit = this.lookHit(3);
    const rd = hit?.prop?.ragdoll;
    if (rd && this.citizens.ragdolls.includes(rd)) {
      return rd.searched ? null : { label: `Search the ${rd.dead ? 'body' : 'unconscious ' + (rd.role === 'cop' ? 'officer' : 'person')}`, run: () => this.searchBody(rd) };
    }
    const pk = this.pickTarget();
    if (pk && !pk.npc.pickpocketed) {
      return pk.behind ? { label: '(hold) Pick their pocket', run: () => { this.pick = { npc: pk.npc, t: 0, check: 0.3 }; } }
        : { label: 'Get behind them to pick their pocket', run: () => {} };
    }
    const boat = this.boats.nearbyOwned(pos);
    if (boat) return { label: `Drive the ${boat.type.name}`, run: () => { this.endDrag(false); this.clearDropHeld(); this.boats.enter(boat); } };
    return null;
  }

  // ---- hostages: a human shield the police won't shoot through ----
  canTakeHostage(n) { return n && this.citizens.list.includes(n) && (n.role === 'civ' || n.role === 'clerk') && !this.hostage; }

  toggleHostage() {
    if (this.hostage) { this.releaseHostage(); return; }
    if (this.vehicles.active || this.boats.active || this.flying) return;
    const hit = this.lookHit(2.6);
    const n = hit?.npc;
    if (!this.canTakeHostage(n)) return;
    this.hostage = n;
    n.hostage = true;
    n.collider.setEnabled(false);
    this.endDrag(false);
    this.sfx.play('scream');
    const t = n.body.translation();
    this.police.crime('kidnap', 2, new THREE.Vector3(t.x, t.y, t.z));
    this.hud.toast('You\'ve got a hostage — the police won\'t shoot. G to let them go', 0xffd166);
  }

  releaseHostage(flee = true) {
    const n = this.hostage;
    if (!n) return;
    this.hostage = null;
    n.hostage = false;
    if (!this.citizens.list.includes(n)) return;
    n.collider.setEnabled(true);
    n.store = n.store || null;
    if (flee) {
      this.citizens.flee(n, this.shorePlayer.body.translation(), 12);
      const t = n.body.translation();
      Object.assign(n, { reportT: 2, reportSev: 2, reportPos: new THREE.Vector3(t.x, t.y, t.z), reportSeen: true, reportWhy: 'kidnap' });
      if (n.role === 'clerk') n.role = 'civ'; // they're not going back to work today
    }
  }

  updateHostage() {
    const n = this.hostage;
    if (!n) return;
    if (!this.citizens.list.includes(n) || !this.onShore || this.vehicles.active || this.boats.active || this.flying || this.health.dead) { this.releaseHostage(this.citizens.list.includes(n)); return; }
    const p = this.shorePlayer.body.translation(), yaw = this.shorePlayer.yaw;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(-f.z, 0, f.x);
    const at = { x: p.x + f.x * 0.55 + r.x * 0.62, y: p.y - 0.02, z: p.z + f.z * 0.55 + r.z * 0.62 };
    n.body.setTranslation(at, true);
    n.body.setNextKinematicTranslation(at);
    n.heading = Math.atan2(f.x, f.z);
    n.speed = 0;
  }

  chopCar() {
    const v = this.vehicles.active;
    const price = this.underworld.carPrice(v);
    this.vehicles.exit();
    this.vehicles.remove(v);
    this.economy.addMoney(price, `for the ${v.police ? 'cop car' : 'car'}`);
    this.sfx.play('cash');
    this.hud.toast('Dimitri\'s boys strip it in minutes', 0xffb36b);
  }

  interactAshore() {
    const a = this.shoreAction();
    if (a) a.run();
  }

  // Can't steer a boat with your hands full: what you're holding goes in the bag (or at your feet).
  clearDropHeld() {
    if (!this.held) return;
    const def = this.held;
    if (!this.economy.stash(def, true)) this.release(false);
    else { this.clearHand(); this.hud.toast(`${def.name} → bag`); }
  }

  // LMB on a body drags it (living people need RMB, which knocks them out first).
  tryDragBody() {
    const hit = this.lookHit(3.2);
    if (!hit?.prop?.ragdoll) return false;
    return this.tryDrag();
  }

  // ---------- input ----------
  lock() {
    this.sfx.unlock();
    const p = this.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => this.hud.showOverlay(true));
  }

  bindInput() {
    document.getElementById('overlay').addEventListener('click', (e) => {
      if (document.querySelector('#overlay .play').disabled) return;
      // on the title screen, only the Play button starts; anywhere else just turns the sound on
      if (!this.started && this.title?.active && !e.target.closest('.play')) return; // only the Play button starts
      if (this.title?.active) { this.title.stop(); document.getElementById('overlay').classList.remove('title'); }
      if (!this.started && this.homes?.spawnHome) { const h = this.homes.spawnHome; this.placeOnShore(h.spawn.clone(), h.yaw); }
      this.started = true;
      this.lock();
      if (!this.story.state.introSeen) setTimeout(() => this.story.showIntro(), 400);
    });
    this.canvas.addEventListener('click', () => { if (!this.locked) this.lock(); });
    document.addEventListener('pointerlockerror', () => this.hud.showOverlay(true));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.hud.showOverlay(false);
      else { this.keys.clear(); this.mopping = false; if (!this.panelOpen) this.hud.showOverlay(true); }
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      const sens = this.settings.mouseSens;
      const dx = e.movementX * sens, dy = e.movementY * sens;
      if (this.flying) this.jets.mouse(dx, this.settings.invertJet ? -dy : dy);
      else if (this.gunnery.active) this.gunnery.aim(dx, dy);
      else this.player.look(dx, dy);
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked || this.health.dead) return;
      if (this.flying) { if (e.button === 0) this.jetTrigger = true; return; }
      if (this.gunnery.active) { if (e.button === 0) this.gunnery.trigger = true; return; }
      if (this.atHelm || this.boats.active || this.vehicles.active) return;
      if (this.held?.gun) {
        if (e.button === 0) { this.firing = true; this.fire(); }
        if (e.button === 2) this.release(true);
        return;
      }
      if (this.dragging) {
        if (e.button === 0) this.endDrag(false);
        if (e.button === 2) this.endDrag(true);
        return;
      }
      if (this.held?.use === 'mop') {
        if (e.button === 0) this.mopping = true;
        if (e.button === 2) this.release(false);
        return;
      }
      if (e.button === 0) {
        if (this.held?.melee) this.punch();
        else if (this.held) this.release(false);
        else if (!this.pickUp() && !this.tryDragBody()) this.punch();
      }
      if (e.button === 2) {
        if (this.held) this.release(true);
        else this.tryDrag(); // grab a person (knocks them out) or a body
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.gunnery.gun?.kind === 'bullet') this.gunnery.trigger = false;
      if (e.button === 0) { this.jetTrigger = false; this.mopping = false; this.firing = false; }
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (!this.hud.bigMapOpen) return;
      const Z = [1, 2, 4, 8];
      const i = Z.indexOf(this.hud.bigZoom || 1);
      this.hud.bigZoom = Z[Math.max(0, Math.min(Z.length - 1, i + (e.deltaY < 0 ? 1 : -1)))];
      this.bigMapT = 0;
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (e.code === 'KeyJ' && !e.repeat && this.locked && !this.panelOpen) { this.endDrag(false); this.story.phone.toggle(); return; }
      if (e.code === 'KeyM' && !e.repeat && (this.locked || this.hud.bigMapOpen) && !this.panelOpen) { this.hud.toggleBigMap(); this.bigMapT = 0; return; }
      if (this.story.phone.isOpen) return; // the phone handles its own keys
      if (this.panelOpen && (e.code === 'Tab' || e.code === 'Escape' || e.code === 'KeyE')) { this.economy.close(); return; }
      if (e.repeat || !this.locked) return;
      this.keys.add(e.code);
      if (this.health.dead) return;
      if (this.pragdoll.active) { if (e.code === 'Space' && this.pragdoll.canGetUp()) this.pragdoll.getUp(); return; }
      if (this.flying && e.code !== 'KeyE') { this.jets.key(e.code); return; }
      if (e.code === 'KeyE') {
        if (this.flying) { this.jets.exit(); return; }
        if (this.boats.active) { this.boats.exit(); return; }
        if (this.vehicles.active?.isHeli) { this.vehicles.active.exit(); return; }
        if (this.vehicles.active && this.garage.inBay()) { this.garage.open(this.vehicles.active); return; }
        if (this.vehicles.active) {
          const chop = this.underworld.chopZone(this.vehicles.active.pos);
          if (chop && Math.abs(this.vehicles.active.speed) < 3) this.chopCar();
          else this.vehicles.exit();
          return;
        }
        if (this.atHelm) this.leaveHelm();
        else if (this.gunnery.active) this.gunnery.leave();
        else if (this.onShore) this.interactAshore();
        else if (this.nearHelm()) this.takeHelm();
        else {
          const gun = this.gunnery.nearby();
          if (gun) this.gunnery.man(gun);
        }
        return;
      }
      if (e.code === 'KeyG' && this.story.onKeyG()) return; // (works from the driver's seat)
      if (this.gunnery.active || this.boats.active || this.vehicles.active) return;
      if (e.code === 'KeyF') { this.useHeld(); return; }
      if (e.code === 'KeyB') { this.stash(); return; }
      if (e.code === 'KeyR' && this.onShore && this.held?.gun && this.bank.nearCounter(this.shorePlayer.body.translation())) { this.bank.startHeist(); return; }
      if (e.code === 'KeyR' && this.onShore && this.held?.gun) { const st = this.stores.nearCounter(this.shorePlayer.body.translation()); if (st) { this.stores.rob(st); return; } }
      if (e.code === 'KeyG' && this.onShore) { this.toggleHostage(); return; }
      if (e.code === 'Tab') { this.endDrag(false); this.economy.openBag(); return; }
      if (this.atHelm) {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') { this.ship.telegraphUp(); this.sfx.play('telegraph'); }
        if (e.code === 'KeyS' || e.code === 'ArrowDown') { this.ship.telegraphDown(); this.sfx.play('telegraph'); }
        if (e.code === 'KeyH') this.sfx.play('shipHorn');
        return;
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.effects.setPixelRatio(this.renderer.getPixelRatio());
    this.viewmodel.resize(w / h, FOV);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  promptText() {
    if (this.pragdoll.active) return this.pragdoll.canGetUp() ? '<kbd>Space</kbd> Get up' : null;
    if (this.health.dead || this.atHelm || this.gunnery.active || this.flying) return null;
    if (this.boats.active) {
      const b = this.boats.active;
      const p = nearestLandPoint(b.pos.x, b.pos.z);
      return p && p.dist < b.type.beam / 2 + 7 ? '<kbd>E</kbd> Get off' : null;
    }
    if (this.vehicles.active) {
      const v = this.vehicles.active;
      if (v.isHeli) return v.altitude < 2.5 ? '<kbd>E</kbd> Get out · <kbd>Space</kbd> Climb' : '<kbd>Space</kbd> Climb · <kbd>Shift</kbd> Descend · <kbd>W</kbd>/<kbd>S</kbd> Tilt';
      if (this.underworld.chopZone(v.pos)) return `<kbd>E</kbd> Sell to the chop shop ($${this.underworld.carPrice(v)})`;
      if (this.garage.inBay()) return '<kbd>E</kbd> Underpass Customs: upgrades, repairs, paint';
      const nos = v.nitro ? ` · <kbd>Shift</kbd> Nitro ${Math.round((v.nitroTank ?? 1) * 100)}%` : '';
      return Math.abs(v.speed) < 5 ? '<kbd>E</kbd> Get out · <kbd>Space</kbd> Handbrake · <kbd>H</kbd> Horn' + nos : '<kbd>E</kbd> Bail out' + nos;
    }
    if (this.onShore && this.bank.heist) {
      const bp = this.bank.prompt(this.shorePlayer.body.translation());
      if (bp) return bp;
    }
    if (this.onShore && this.held?.gun && !this.vehicles.active && this.bank.nearCounter(this.shorePlayer.body.translation())) {
      return this.bank.canRob ? '<kbd>E</kbd> Bank teller · <kbd>R</kbd> Rob the bank' : '<kbd>E</kbd> Bank teller (vault empty)';
    }
    if (this.hostage) return `Holding a hostage — <kbd>G</kbd> let them go${this.held?.gun ? ' · <kbd>LMB</kbd> fire' : ''}`;
    if (this.onShore && this.held?.gun && !this.vehicles.active) {
      const st = this.stores.nearCounter(this.shorePlayer.body.translation());
      if (st && this.stores.canRob(st)) return '<kbd>E</kbd> Talk to the clerk · <kbd>R</kbd> Rob the till';
    }
    if (this.pick) return `Picking pocket… ${Math.round((this.pick.t / 1.2) * 100)}%`;
    if (this.dragging) return '<kbd>LMB</kbd> Let go · <kbd>RMB</kbd> Heave';
    if (this.held?.use === 'mop') return '<kbd>LMB</kbd> (hold) Mop · <kbd>RMB</kbd> Put down · <kbd>B</kbd> Bag it';
    if (this.held?.gun) return `<kbd>LMB</kbd> Fire · <kbd>RMB</kbd> Throw · <kbd>B</kbd> Bag it`;
    if (this.held?.grenade) return '<kbd>RMB</kbd> Throw (lit) · <kbd>LMB</kbd> Put down · <kbd>B</kbd> Bag it';
    if (this.held?.melee) return `<kbd>LMB</kbd> Swing · <kbd>RMB</kbd> Throw · <kbd>B</kbd> Bag it`;
    if (this.onShore) {
      const a = this.shoreAction();
      if (a) return `<kbd>E</kbd> ${a.label}`;
    } else {
      if (this.nearHelm()) return '<kbd>E</kbd> Take the helm';
      const gun = this.gunnery.nearby();
      if (gun) return `<kbd>E</kbd> Man the ${gun.name}`;
    }
    if (this.held) return '<kbd>B</kbd> Put in bag';
    const hit = this.lookHit();
    if (hit?.prop?.def.item) return `<kbd>LMB</kbd> Pick up ${hit.prop.def.name} · <kbd>B</kbd> Bag it ($${hit.prop.def.value})`;
    const far = hit || this.lookHit(3.2);
    if (far?.prop?.ragdoll) return `<kbd>LMB</kbd> Drag ${far.prop.ragdoll.dead ? 'body' : (this.onShore ? 'them' : 'sailor')}`;
    if (hit?.npc) return `<kbd>LMB</kbd> Punch · <kbd>RMB</kbd> Grab ${this.onShore ? '' : 'sailor'}${this.onShore && this.canTakeHostage(hit.npc) ? ' · <kbd>G</kbd> Take hostage' : ''}`;
    return null;
  }

  // People, cars and loose items far from the camera aren't drawn (the city stays cheap).
  cullFar() {
    const c = this.camera.position;
    const near = (x, z, r) => (x - c.x) ** 2 + (z - c.z) ** 2 < r * r;
    const v = this.view || { cull: 170, ship: 900 };
    const R = this.flying ? 0 : v.cull;
    for (const n of this.citizens.list) { const t = n.fig.root.position; n.fig.root.visible = near(t.x, t.z, R); }
    for (const car of this.vehicles.all) car.mesh.visible = near(car.pos.x, car.pos.z, R * 1.6);
    for (const p of this.portSandbox.props) { const t = p.mesh.position; p.mesh.visible = p.store ? p.store.showStock : near(t.x, t.z, R * 0.8); }
    // the destroyer is a lot of little meshes: skip it when it's a speck on the horizon
    // whole chunks of scenery that are entirely inside the fog
    const fog = this.scene.fog.far + 50;
    for (const m of MERGED) {
      const b = m.geometry.boundingSphere;
      m.visible = Math.hypot(b.center.x - c.x, b.center.z - c.z) - b.radius < fog;
    }
    const sp = this.frame.position;
    this.frame.visible = !this.onShore || this.flying || near(sp.x, sp.z, v.ship);
  }

  placeATMs() {
    const c = this.city, Y = LAND_Y;
    // on the pavement at the middle of a block's north side, facing the street
    for (const [i, j] of [[2, 1], [3, 2], [1, 2], [3, 4], [0, 0], [4, 3], [1, 4], [4, 0]]) {
      const b = c.block(i, j);
      this.bank.addATM((b.x0 + b.x1) / 2 + 4, Y + 0.15, b.z0 + 1.0, Math.PI);
    }
    const bk = c.bank.door;
    this.bank.addATM(bk.x + 6, Y + 0.15, bk.z - 0.6, Math.PI); // outside the bank
    this.bank.addATM(c.isl.x1 - 8, Y, 40, Math.PI / 2); // marina
    const m = this.saltmarsh.market;
    this.bank.addATM(m.x + 30, Y, m.z + 44, 0); // Saltmarsh market
    this.bank.addATM(-1175, this.park.ranger.y, -70.5, 0); // ranger station
  }

  drawBigMap(yaw) {
    const pos = this.vehicles.active?.pos || this.boats.active?.pos || this.camera.position;
    const pois = [];
    const P = (p, color, label, big = false, r = 4.5) => pois.push({ x: p.x, z: p.z, color, label, big, r });
    if (this.story.waypoint) P(this.story.waypoint, "#ffd166", "★ Objective", true, 7);
    for (const c of this.story.extraCars) if (!c.wreck && !c.sinking) P(c.pos, '#ff2a1a', 'Ashen Hand', false, 5);
    const c = this.city;
    P(c.pawnCounter, '#ffd166', 'Pawn shop');
    P(c.bank.counter, '#2fd38a', 'Bank', true, 5.5);
    for (const a of this.bank.atms) P(a.pos, a.broken ? '#666' : '#2fd38a', 'ATM', false, 3);
    P(c.dealerCounter, '#7fd3ff', 'Boat sales', true);
    P(c.hospital, '#ff6a6a', 'Hospital');
    for (const h of this.homes?.list || []) P(h.door, this.homes.owns(h.id) ? '#7be08a' : '#f2d23a', this.homes.owns(h.id) ? `⌂ ${h.name}` : `⌂ For sale ${h.price >= 1e6 ? '$' + h.price / 1e6 + 'M' : '$' + Math.round(h.price / 1000) + 'k'}`, h.id === 'mansion', 4);
    P(c.policeStation, '#4a7dff', 'Police station');
    P(c.plaza, '#e8e2d4', 'Plaza');
    for (const d of this.underworld.dealers) P(d.pos, d.color, d.title.split('—')[0].replace(/"/g, '').trim());
    P(this.saltmarsh.market, '#ffb36b', 'Market');
    P(this.saltmarsh.dock, '#a07d55', 'Fishing dock');
    P(this.hood.kingsPost, this.gangs.crews.kings.color, 'Eastside Kings', true);
    P(this.hood.hollowPost, this.gangs.crews.hollow.color, 'Hollow Boys', true);
    P(this.hood.entrance, '#bbb3a0', 'Bridge to the Hollows');
    P(this.park.entrance, '#7be08a', 'Trailhead');
    P({ x: -1165, z: -80 }, '#c9a26a', 'Ranger station');
    for (const [x, z] of [[-1380, -262], [-1420, 240], [-1605, -62]]) P({ x, z }, '#ff9a3a', 'Campsite', false, 3.5);
    P({ x: -1650, z: 330 }, '#c9a26a', 'Lookout');
    { const m = this.bridge.at(this.bridge.length / 2); P(m, '#c0442c', 'Saltmarsh Gate Bridge', true); }
    P({ x: -1215, z: 475 }, '#b3261e', 'Airport (closed)', true);
    const sp = this.ship.root.position;
    P(sp, '#c9ced4', 'Destroyer', true);
    P({ x: 420, z: 0 }, '#c9ced4', 'Air base', true);
    const marks = [];
    for (const b of this.boats.list) if (b.alive && (b.owned || b.police)) marks.push({ x: b.pos.x, z: b.pos.z, color: b.police ? '#4a7dff' : '#7be08a', r: 3.5 });
    for (const v of this.vehicles.list) if (!v.wreck) marks.push({ x: v.pos.x, z: v.pos.z, color: '#7be08a', r: 3 });
    for (const car of this.police.cars) marks.push({ x: car.pos.x, z: car.pos.z, color: '#ff3030', r: 3.5 });
    for (const n of this.citizens.list) {
      if (n.role !== 'cop' || !(this.police.wanted > 0 || this.economy.perks.scanner)) continue;
      const t = n.body.translation();
      marks.push({ x: t.x, z: t.z, color: '#9ec5ff', r: 2.5 });
    }
    const bounds = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const i of ISLANDS) { bounds.x0 = Math.min(bounds.x0, i.x0 - 60); bounds.x1 = Math.max(bounds.x1, i.x1 + 60); bounds.z0 = Math.min(bounds.z0, i.z0 - 80); bounds.z1 = Math.max(bounds.z1, i.z1 + 60); }
    const lines = [{ pts: this.park.roadLine, color: '#55585e', w: 10 }, { pts: this.bridge.mapLine, color: '#c0442c', w: 22 }];
    this.hud.drawBigMap({ lines, bounds, x: pos.x, z: pos.z, yaw, islands: ISLANDS, piers: PIERS, roads: this.roadsCache || [], trails: this.park.trails, rects: this.airport.mapRects, pois, marks });
  }

  drawMinimap(yaw) {
    const c = this.camera.position;
    const marks = [];
    const b = this.boats;
    for (const x of b.list) {
      if (!x.alive || x === b.active) continue;
      if (x.police) marks.push({ x: x.pos.x, z: x.pos.z, color: '#4a7dff', r: 4 });
      else if (x.owned) marks.push({ x: x.pos.x, z: x.pos.z, color: '#7be08a', r: 3.5 });
    }
    for (const car of this.police.cars) marks.push({ x: car.pos.x, z: car.pos.z, color: (performance.now() / 200) % 2 < 1 ? '#ff3030' : '#4a7dff', r: 4 });
    for (const v of this.vehicles.list) if (!v.wreck && v !== this.vehicles.active) marks.push({ x: v.pos.x, z: v.pos.z, color: '#7be08a', r: 2.5 });
    for (const d of this.underworld.dealers) marks.push({ x: d.pos.x, z: d.pos.z, color: d.color, r: 3.5, label: d.label });
    for (const n of this.citizens.list) {
      if (n.role !== 'cop' || !(this.police.wanted > 0 || this.economy.perks.scanner)) continue;
      const t = n.body.translation();
      marks.push({ x: t.x, z: t.z, color: '#9ec5ff', r: 2.5 });
    }
    const wp = this.story.waypoint;
    for (const c of this.story.extraCars) if (!c.wreck && !c.sinking) marks.push({ x: c.pos.x, z: c.pos.z, color: '#ff2a1a', r: 4.5 });
    for (const ch of this.story.monstruo.choppers) if (!ch.falling) marks.push({ x: ch.pos.x, z: ch.pos.z, color: '#ff8a1a', r: 4 });
    if (this.story.active?.id === 'm4') for (const p of this.portSandbox.props) if (p.def.bombPart) { const t = p.body.translation(); marks.push({ x: t.x, z: t.z, color: '#ff3030', r: 3.5 }); }
    if (wp) marks.push({ x: wp.x, z: wp.z, color: '#ffd166', r: 5.5, label: '★' });
    marks.push({ x: this.city.pawnCounter.x, z: this.city.pawnCounter.z, color: '#ffd166', r: 4, label: '$' });
    marks.push({ x: this.city.dealerCounter.x, z: this.city.dealerCounter.z, color: '#7fd3ff', r: 4, label: 'Boats' });
    marks.push({ x: this.city.hospital.x, z: this.city.hospital.z, color: '#ff6a6a', r: 3, label: '+' });
    marks.push({ x: this.saltmarsh.market.x, z: this.saltmarsh.market.z, color: '#ffb36b', r: 3, label: 'Market' });
    const sp = this.ship.root.position;
    marks.push({ x: sp.x, z: sp.z, color: '#c9ced4', r: 4 });
    for (const car of this.traffic.cars) marks.push({ x: car.pos.x, z: car.pos.z, color: '#d8d8d8', r: 1.8 });
    if (!this.roadsCache) {
      this.roadsCache = [];
      for (const R of [this.city, this.saltmarsh, this.hood]) {
        const w = R === this.city ? 16 : 10;
        for (const x of R.xs) this.roadsCache.push({ x0: x - w / 2, x1: x + w / 2, z0: R.zs[0] - w / 2, z1: R.zs.at(-1) + w / 2 });
        for (const z of R.zs) this.roadsCache.push({ x0: R.xs[0] - w / 2, x1: R.xs.at(-1) + w / 2, z0: z - w / 2, z1: z + w / 2 });
      }
    }
    const far = this.boats.active || this.flying || (this.vehicles.active && Math.abs(this.vehicles.active.speed) > 12);
    this.hud.drawMap({ lines: [{ pts: this.park.roadLine, color: '#55585e', w: 10 }, { pts: this.bridge.mapLine, color: '#c0442c', w: 22 }], roads: this.roadsCache, x: c.x, z: c.z, yaw, scale: this.flying ? 12 : far ? 5 : 2.2, islands: ISLANDS, piers: PIERS, marks });
  }

  // ---------- loop ----------
  tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.time += dt;
    const k = this.keys;
    const steer = this.atHelm ? (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) : 0;
    this.ship.update(dt, this.ocean, steer);

    const alive = this.locked && !this.health.dead && !this.panelOpen;
    const walking = alive && !this.atHelm && !this.gunnery.active && !this.flying && !this.boats.active && !this.vehicles.active && !this.pragdoll.active;
    this.fireT = Math.max(0, this.fireT - dt);
    if (this.firing && this.held?.gun && alive && this.fireT <= 0) this.fire();
    this.saveAmmoT = (this.saveAmmoT || 0) - dt;
    if (this.saveAmmoT < 0 && this.saveAmmoT > -dt * 1.5) this.economy.save();
    this.punchT = Math.max(0, this.punchT - dt);
    const keys = walking ? k : new Set();
    const steps = Math.min(Math.max(Math.ceil(dt / (1 / 60) - 0.01), 1), 4);
    const sub = dt / steps;
    // Loose things aboard feel the ship's roll and pitch: gravity in the ship frame tilts with her.
    const gl = new THREE.Vector3(0, -9.81, 0).applyQuaternion(this.frame.quaternion.clone().invert());
    this.world.gravity = { x: gl.x, y: gl.y, z: gl.z };
    for (let i = 0; i < steps; i++) {
      this.updateDrag();
      // the jets fly in world space; sub-stepped for stable flight at low frame rates
      this.jets.update(sub, alive ? k : new Set(), this.jetTrigger && alive);
      if (!this.onShore) this.shipPlayer.update(sub, keys);
      this.npcs.update(sub);
      this.citizens.update(sub);
      if (i === 0) this.traffic.update(dt);
      if (!this.onShore) this.health.checkImpacts();
      this.world.timestep = sub;
      this.world.step();
      if (this.onShore && !this.flying && !this.boats.active && !this.vehicles.active && !this.pragdoll.active) this.shorePlayer.update(sub, keys);
      this.portWorld.timestep = sub;
      this.portWorld.step();
    }
    for (const c of this.vehicles.all) c.sync(dt);
    this.checkTransfer();
    this.boats.update(dt, alive ? k : new Set());
    this.vehicles.update(dt, alive ? k : new Set());
    this.breakables.update(dt);
    this.highway?.update(dt);
    this.homes?.update(dt);
    this.garage?.update(dt);
    this.title?.update(dt);
    this.pragdoll.update(dt);
    this.underworld.update(dt);
    this.bank.update(dt);
    this.stores.update(dt);
    this.story.update(dt);
    this.updateHostage();
    this.updateGrenades(dt);
    this.gangs.update(dt);
    this.graphics.update(dt);
    const under = this.story.underground;
    this.music.update(dt, this.started && this.settings.music && !this.health.dead ? Math.max(this.police.wanted, this.gangs.war.active ? 1 : 0) : 0, this.started && under, this.started && this.settings.music && !this.health.dead ? this.story.musicTrack : null);
    this.setUnderground(under);
    this.police.update(dt);
    this.updatePickpocket(dt);
    this.blood.update(dt);
    this.worldBlood.update(dt);
    this.updateMop(dt);
    this.portSandbox.sync();
    this.port.update(dt, this.ship.time);
    this.port.updateGangway(this.frame.localToWorld(this.gangwayTop()), this.ship.moored);
    this.health.update(dt);
    this.hud.frame(dt);
    this.sandbox.sync();
    this.sandbox.cleanup();
    this.npcs.frame(dt);
    this.citizens.frame(dt);
    this.portSandbox.cleanup();
    this.effects.update(dt);
    this.gunnery.update(dt);

    const pt = this.player.body.translation();
    if (!this.health.dead && !this.flying) {
      if (!this.onShore && pt.y < DECK - 3.5) this.overboard();
      if (this.onShore && !this.boats.active && !this.vehicles.active && pt.y < LAND_Y - 3 && !this.story.underground) {
        this.sfx.play('splash');
        this.endDrag(false);
        this.hud.toast('You fell in the water!', 0xff8a6a);
        this.health.damage(15, 'drown');
        const lp = nearestLandPoint(pt.x, pt.z);
        if (!this.health.dead) this.placeOnShore(new THREE.Vector3(lp.x, LAND_Y + 1, lp.z));
      }
    }

    if (this.title?.active) {
      this.title.cameraPose(this.camera);
    } else if (this.pragdoll.active) {
      this.pragdoll.cameraPose(this.camera, dt);
    } else if (this.flying) {
      this.jets.cameraPose(this.camera, dt);
    } else if (this.vehicles.active) {
      this.vehicles.cameraPose(this.camera, dt);
    } else if (this.boats.active || (this.health.dead && this.sinkingBoat)) {
      this.boats.cameraPose(this.camera, dt, this.boats.active || this.sinkingBoat);
    } else {
      // camera: player's eye (or the gun sight); aboard it's in the ship frame and carried by the ship
      if (this.gunnery.active && !this.health.dead) this.gunnery.cameraPose(this.eye);
      else this.player.applyCamera(this.eye);
      if (this.shake > 0) {
        this.shake = Math.max(this.shake - dt * 3, 0);
        const s = this.shake * 0.03;
        this.eye.rotation.x += (Math.random() - 0.5) * s;
        this.eye.rotation.y += (Math.random() - 0.5) * s;
      }
      this.eye.updateMatrix();
      if (this.onShore) {
        this.camera.position.copy(this.eye.position);
        this.camera.quaternion.copy(this.eye.quaternion);
      } else {
        this.camera.position.copy(this.frame.localToWorld(this.eye.position.clone()));
        this.camera.quaternion.copy(this.frame.quaternion).multiply(this.eye.quaternion);
      }
    }
    this.camera.updateMatrixWorld();

    this.sky.position.copy(this.camera.position);
    if (this.underMode && this.torch) {
      // held at chest height, pointing where you look
      const cp = this.camera.position, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.torch.position.set(cp.x, cp.y - 0.25, cp.z).addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x).normalize(), -0.2);
      this.torch.target.position.copy(cp).addScaledVector(fwd, 10);
    }
    this.ocean.update(dt, this.camera, this.ship);
    const cp = this.camera.position;
    this.sun.position.set(cp.x + SUN.x * 100, cp.y + SUN.y * 100, cp.z + SUN.z * 100);
    this.sun.target.position.copy(cp);

    // HUD
    const viewYaw = this.flying ? this.jets.active.heading
      : this.boats.active ? this.boats.active.heading
      : this.vehicles.active ? this.vehicles.active.heading
      : this.onShore ? this.player.yaw
        : this.ship.heading + (this.gunnery.active ? this.gunnery.gun.yaw.rotation.y : this.player.yaw);
    this.hud.setHeading(THREE.MathUtils.radToDeg(-viewYaw));
    if (this.atHelm) this.hud.setShip(this.ship, Ship.SPEEDS);
    if (this.gunnery.active) this.hud.setGun(this.gunnery.gun);
    if (this.flying) this.hud.setFlight(this.jets.active, this.camera);
    if (this.boats.active) this.hud.setBoat(this.boats.active);
    if (this.vehicles.active) this.hud.setBoat(this.vehicles.active);
    this.hud.setPrompt(this.promptText());
    if (!this.boats.active && !this.vehicles.active) this.sfx.setEngine(this.started && !this.onShore, 0.15 + Math.abs(this.ship.speed) / 22);
    const inTown = this.onShore && !this.flying && !this.boats.active && islandAt(pt.x, pt.z, -60)?.id !== 'naval';
    this.sfx.setOcean(this.started && !this.story.underground, inTown ? 0.25 : 0.6 + Math.abs(this.ship.speed) / 20);
    if (this.story.underground) this.sfx.setSiren(0);
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT <= 0) { this.cullT = 0.4; this.cullFar(); }
    this.mapT = (this.mapT || 0) - dt;
    if (this.mapT <= 0) { this.mapT = 0.1; this.drawMinimap(viewYaw); }
    if (this.hud.bigMapOpen) { this.bigMapT = (this.bigMapT || 0) - dt; if (this.bigMapT <= 0) { this.bigMapT = 0.15; this.drawBigMap(viewYaw); } }

    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    const showArm = !this.title?.active && !this.atHelm && !this.gunnery.active && !this.health.dead && !this.flying && !this.boats.active && !this.vehicles.active && !this.pragdoll.active;
    this.viewmodel.update(dt, this.player, this.mouseDX, this.mouseDY, false);
    this.mouseDX = this.mouseDY = 0;
    if (showArm) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    }

    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.hud.setStats(Math.round(this.fpsFrames / this.fpsAcc));
      this.fpsAcc = 0; this.fpsFrames = 0;
    }
  }
}

// Nothing loads until you click: that click also lets the browser play sound, so the menu
// music can start straight away while the city builds behind the title screen.
const splash = document.getElementById('splash');
splash.addEventListener('click', () => {
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 600);
  document.getElementById('loadpop').classList.remove('hidden');
  const menu = new Track(`${import.meta.env.BASE_URL}assets/music/main-menu.mp3`, 0.6);
  menu.el.currentTime = 0;
  menu.vol = 0.6; menu.el.volume = 0.6;
  menu.el.play().catch(() => {});
  const game = new Game();
  game.menuTrack = menu;
  game.init().catch((err) => {
    console.error(err);
    const el = document.getElementById('loading');
    if (el) el.textContent = `Failed to start: ${err.message}`;
  });
}, { once: true });
