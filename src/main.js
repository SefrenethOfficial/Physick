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
import { ITEMS } from './items.js';
import { Gunnery } from './guns.js';
import { Port, GANGWAY_FOOT, LAND_Y } from './port.js';
import { Jets } from './jets.js';
import { Blood } from './blood.js';
import { loadSettings, bindSettingsPanel } from './settings.js';
import { deckHalfWidth } from './ship.js';
import { onLand } from './port.js';

const FOV = 75;
const SKY_TOP = 0x4a83c4;
const HORIZON = 0xcbdbe7;
const FOG_NEAR = 180;
const FOG_FAR = 1800;
const SUN = new THREE.Vector3(-0.42, 0.5, -0.75).normalize(); // afternoon sun, off the port bow

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.keys = new Set();
    this.locked = false;
    this.started = false;
    this.atHelm = false;
    this.onShore = false;
    this.jetTrigger = false;
    this.settings = loadSettings();
    this.dragging = null; // { prop, local } a body being dragged
    this.mopping = false;
    this.heldProp = null;
    this.held = null; // item def carried in the robot arm
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.shake = 0;
    this.events = { on() {}, emit() {} }; // sandbox hooks (no listeners needed here)
  }

  async init() {
    const loadingEl = document.getElementById('loading');
    loadingEl.textContent = 'Starting physics…';
    await RAPIER.init();

    // ---------- renderer / scene ----------
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true }));
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

    loadingEl.textContent = 'Building the ship…';
    this.ocean = new Ocean(this.scene, {
      sun: SUN, skyTop: SKY_TOP, skyHorizon: HORIZON, fogColor: HORIZON, fogNear: FOG_NEAR, fogFar: FOG_FAR,
    });
    this.ship = new Ship(this);
    this.world.step(); // scene queries only see new colliders after a step

    // The naval air station has its own physics world in world coordinates.
    loadingEl.textContent = 'Building the air station…';
    this.portWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.portSandbox = new Sandbox(this, { world: this.portWorld, scene: this.scene });
    this.port = new Port(this, this.portSandbox);
    this.portWorld.step();

    loadingEl.textContent = 'Loading robot arm…';
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/robotic_arm.glb`, (e) => {
      if (e.total) loadingEl.textContent = `Loading robot arm… ${Math.round((e.loaded / e.total) * 100)}%`;
    });
    this.viewmodel = new Viewmodel(gltf.scene, FOV);
    this.viewmodel.setColor(0x7fd3ff);

    this.shipPlayer = new Player(this, new THREE.Vector3(0, DECK + 1.3, 44));
    this.shorePlayer = new Player(this, GANGWAY_FOOT.clone().add(new THREE.Vector3(2, 1, 0)), { world: this.portWorld, sandbox: this.portSandbox });
    this.health = new Health(this);
    this.hud = new Hud(this);
    this.npcs = new Npcs(this);
    this.npcs.populate();
    this.blood = new Blood(this);
    this.gunnery = new Gunnery(this);
    this.jets = new Jets(this);
    this.stockStores();
    this.eye = new THREE.Object3D(); // camera pose in the ship frame

    this.bindInput();
    bindSettingsPanel(this);
    this.resize();
    addEventListener('resize', () => this.resize());

    loadingEl.textContent = '';
    document.querySelector('#overlay .play').disabled = false;
    this.hud.showOverlay(true, true);

    this.timer = new THREE.Timer();
    this.timer.connect?.(document);
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.renderer.setAnimationLoop(() => this.tick());
    window.physick = this;
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
    if (!this.settings.blood) this.blood.clear();
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

  respawnPlayer() {
    this.onShore = false;
    this.shipPlayer.respawn();
    this.hud.setMode('deck');
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

    this.scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x2a4a5e, 1.4));
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

  // ---------- stores & the robot arm ----------
  stockStores() {
    const sb = this.sandbox;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const shelfItems = ITEMS.filter((i) => i.id !== 'mug' && i.id !== 'mop');
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
    this.sb.remove(hit.prop);
    this.held = def;
    this.viewmodel.setHeld(def.build().mesh, def.heldSize);
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
    if (this.onShore) return false;
    let hit = this.lookHit(3.2);
    if (hit?.npc) {
      // grabbing a living sailor knocks them out cold (no blood)
      const rd = this.npcs.knockOver(hit.npc, new THREE.Vector3(), 0.5, { killed: false });
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
    if (!d || !this.sandbox.props.has(d.prop)) return;
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
    if (!this.sandbox.props.has(d.prop) || this.onShore) { this.endDrag(false); return; }
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
    const hit = this.onShore ? null : this.blood.cast(this.player.eye, this.lookDir(), 3);
    this.mopScrub = (this.mopScrub || 0) + dt;
    this.viewmodel.kick(0.08);
    if (hit) {
      if (this.blood.mop(hit.point, 0.75, dt) && this.mopScrub > 0.35) { this.sfx.play('scrub'); this.mopScrub = 0; }
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

  // ---------- input ----------
  lock() {
    this.sfx.unlock();
    const p = this.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => this.hud.showOverlay(true));
  }

  bindInput() {
    document.getElementById('overlay').addEventListener('click', () => {
      if (document.querySelector('#overlay .play').disabled) return;
      this.started = true;
      this.lock();
    });
    this.canvas.addEventListener('click', () => { if (!this.locked) this.lock(); });
    document.addEventListener('pointerlockerror', () => this.hud.showOverlay(true));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.hud.showOverlay(false);
      else { this.keys.clear(); this.hud.showOverlay(true); }
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
      if (this.atHelm) return;
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
      if (e.button === 0) { if (this.held) this.release(false); else if (!this.tryDrag()) this.pickUp(); }
      if (e.button === 2 && this.held) this.release(true);
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.gunnery.gun?.kind === 'bullet') this.gunnery.trigger = false;
      if (e.button === 0) { this.jetTrigger = false; this.mopping = false; }
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (e.repeat || !this.locked) return;
      this.keys.add(e.code);
      if (this.health.dead) return;
      if (this.flying && e.code !== 'KeyE') { this.jets.key(e.code); return; }
      if (e.code === 'KeyE') {
        if (this.flying) { this.jets.exit(); return; }
        if (this.atHelm) this.leaveHelm();
        else if (this.gunnery.active) this.gunnery.leave();
        else if (this.onShore) {
          const jet = this.jets.nearby(this.shorePlayer.body.translation());
          if (jet) this.jets.enter(jet);
        } else if (this.nearHelm()) this.takeHelm();
        else {
          const gun = this.gunnery.nearby();
          if (gun) this.gunnery.man(gun);
        }
        return;
      }
      if (this.gunnery.active) return;
      if (e.code === 'KeyF') { this.useHeld(); return; }
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
    if (this.health.dead || this.atHelm || this.gunnery.active || this.flying) return null;
    if (this.dragging) return '<kbd>LMB</kbd> Let go · <kbd>RMB</kbd> Heave';
    if (this.held?.use === 'mop') return '<kbd>LMB</kbd> (hold) Mop · <kbd>RMB</kbd> Put down';
    if (this.onShore) {
      const jet = this.jets.nearby(this.shorePlayer.body.translation());
      if (jet) return '<kbd>E</kbd> Fly the jet';
    }
    if (this.nearHelm()) return '<kbd>E</kbd> Take the helm';
    const gun = this.gunnery.nearby();
    if (gun) return `<kbd>E</kbd> Man the ${gun.name}`;
    if (this.held) return null;
    const hit = this.lookHit();
    if (hit?.prop?.def.item) return `<kbd>LMB</kbd> Pick up ${hit.prop.def.name}`;
    const far = !this.onShore && !hit ? this.lookHit(3.2) : null;
    if (!this.onShore && far?.prop?.ragdoll) return `<kbd>LMB</kbd> Drag ${far.prop.ragdoll.dead ? 'body' : 'sailor'}`;
    if (!this.onShore && hit?.prop?.ragdoll) return `<kbd>LMB</kbd> Drag ${hit.prop.ragdoll.dead ? 'body' : 'sailor'}`;
    if (!this.onShore && hit?.npc) return '<kbd>LMB</kbd> Grab sailor';
    return null;
  }

  // ---------- loop ----------
  tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const k = this.keys;
    const steer = this.atHelm ? (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) : 0;
    this.ship.update(dt, this.ocean, steer);

    const alive = this.locked && !this.health.dead;
    const walking = alive && !this.atHelm && !this.gunnery.active && !this.flying;
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
      if (!this.onShore) this.health.checkImpacts();
      this.world.timestep = sub;
      this.world.step();
      if (this.onShore && !this.flying) this.shorePlayer.update(sub, keys);
      this.portWorld.timestep = sub;
      this.portWorld.step();
    }
    this.checkTransfer();
    this.blood.update(dt);
    this.updateMop(dt);
    this.portSandbox.sync();
    this.port.update(dt, this.ship.time);
    this.port.updateGangway(this.frame.localToWorld(this.gangwayTop()), this.ship.moored);
    this.health.update(dt);
    this.hud.frame(dt);
    this.sandbox.sync();
    this.sandbox.cleanup();
    this.npcs.frame(dt);
    this.effects.update(dt);
    this.gunnery.update(dt);

    const pt = this.player.body.translation();
    if (!this.health.dead && !this.flying) {
      if (!this.onShore && pt.y < DECK - 3.5) this.overboard();
      if (this.onShore && pt.y < LAND_Y - 3) {
        this.sfx.play('splash');
        this.hud.toast('Fell in the harbour!', 0xff8a6a);
        this.health.damage(20, 'overboard');
        if (!this.health.dead) this.shorePlayer.body.setTranslation({ x: GANGWAY_FOOT.x + 3, y: LAND_Y + 1, z: GANGWAY_FOOT.z }, true);
      }
    }

    if (this.flying) {
      this.jets.cameraPose(this.camera, dt);
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
    this.ocean.update(dt, this.camera, this.ship);
    const cp = this.camera.position;
    this.sun.position.set(cp.x + SUN.x * 100, cp.y + SUN.y * 100, cp.z + SUN.z * 100);
    this.sun.target.position.copy(cp);

    // HUD
    const viewYaw = this.flying ? this.jets.active.heading
      : this.onShore ? this.player.yaw
        : this.ship.heading + (this.gunnery.active ? this.gunnery.gun.yaw.rotation.y : this.player.yaw);
    this.hud.setHeading(THREE.MathUtils.radToDeg(-viewYaw));
    if (this.atHelm) this.hud.setShip(this.ship, Ship.SPEEDS);
    if (this.gunnery.active) this.hud.setGun(this.gunnery.gun);
    if (this.flying) this.hud.setFlight(this.jets.active, this.camera);
    this.hud.setPrompt(this.promptText());
    this.sfx.setEngine(this.started, 0.15 + Math.abs(this.ship.speed) / 22);
    this.sfx.setOcean(this.started, 0.6 + Math.abs(this.ship.speed) / 20);

    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    const showArm = !this.atHelm && !this.gunnery.active && !this.health.dead && !this.flying;
    this.viewmodel.update(dt, this.player, this.mouseDX, this.mouseDY, false);
    this.mouseDX = this.mouseDY = 0;
    if (showArm) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    }

    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.hud.setStats(Math.round(this.fpsFrames / this.fpsAcc), this.npcs.list.length);
      this.fpsAcc = 0; this.fpsFrames = 0;
    }
  }
}

new Game().init().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Failed to start: ${err.message}`;
});
