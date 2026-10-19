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

    loadingEl.textContent = 'Loading robot arm…';
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/robotic_arm.glb`, (e) => {
      if (e.total) loadingEl.textContent = `Loading robot arm… ${Math.round((e.loaded / e.total) * 100)}%`;
    });
    this.viewmodel = new Viewmodel(gltf.scene, FOV);
    this.viewmodel.setColor(0x7fd3ff);

    this.player = new Player(this, new THREE.Vector3(0, DECK + 1.3, 44));
    this.health = new Health(this);
    this.hud = new Hud(this);
    this.npcs = new Npcs(this);
    this.npcs.populate();
    this.gunnery = new Gunnery(this);
    this.stockStores();
    this.eye = new THREE.Object3D(); // camera pose in the ship frame

    this.bindInput();
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
    const shelfItems = ITEMS.filter((i) => i.id !== 'mug');
    const spots = [...this.ship.storeSpots].sort(() => Math.random() - 0.5);
    spots.slice(0, Math.min(spots.length, 30)).forEach((p) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 0.6 - 0.3 + (Math.abs(p.x) > 1 ? Math.PI / 2 : 0));
      sb.spawn(pick(shelfItems), p, q, { noHistory: true });
    });
    const mug = ITEMS.find((i) => i.id === 'mug'), rations = ITEMS.find((i) => i.id === 'rations');
    this.ship.messSpots.forEach((p, i) => sb.spawn(i % 3 === 2 ? rations : mug, p, new THREE.Quaternion(), { noHistory: true }));
  }

  lookDir() {
    return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ'));
  }

  lookHit(max = 2.6) {
    return this.sandbox.raycast(this.player.eye, this.lookDir(), max, this.player.collider);
  }

  pickUp() {
    const hit = this.lookHit();
    if (!hit?.prop?.def.item) return false;
    const def = hit.prop.def;
    this.sandbox.remove(hit.prop);
    this.held = def;
    this.viewmodel.setHeld(def.build().mesh);
    this.hud.setHolding(def.name);
    this.sfx.play('grab');
    return true;
  }

  // Put the held item down where you're looking (or just in front of you), or throw it.
  release(throwIt) {
    const def = this.held;
    if (!def) return;
    const eye = this.player.eye, dir = this.lookDir();
    const hit = this.sandbox.raycast(eye, dir, throwIt ? 1.0 : 2.4, this.player.collider);
    let pos;
    if (hit) pos = hit.point.clone().addScaledVector(hit.normal, def.radius * 0.7).addScaledVector(dir, -0.05);
    else pos = eye.clone().addScaledVector(dir, throwIt ? 0.9 : 1.3);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
    const prop = this.sandbox.spawn(def, pos, q, { noHistory: true });
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
      if (this.gunnery.active) this.gunnery.aim(e.movementX, e.movementY);
      else this.player.look(e.movementX, e.movementY);
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked || this.health.dead) return;
      if (this.gunnery.active) { if (e.button === 0) this.gunnery.trigger = true; return; }
      if (this.atHelm) return;
      if (e.button === 0) { if (this.held) this.release(false); else this.pickUp(); }
      if (e.button === 2 && this.held) this.release(true);
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.gunnery.gun?.kind === 'bullet') this.gunnery.trigger = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (e.repeat || !this.locked) return;
      this.keys.add(e.code);
      if (this.health.dead) return;
      if (e.code === 'KeyE') {
        if (this.atHelm) this.leaveHelm();
        else if (this.gunnery.active) this.gunnery.leave();
        else if (this.nearHelm()) this.takeHelm();
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
    if (this.health.dead || this.atHelm || this.gunnery.active) return null;
    if (this.nearHelm()) return '<kbd>E</kbd> Take the helm';
    const gun = this.gunnery.nearby();
    if (gun) return `<kbd>E</kbd> Man the ${gun.name}`;
    if (this.held) return null;
    const hit = this.lookHit();
    if (hit?.prop?.def.item) return `<kbd>LMB</kbd> Pick up ${hit.prop.def.name}`;
    return null;
  }

  // ---------- loop ----------
  tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const k = this.keys;
    const steer = this.atHelm ? (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) : 0;
    this.ship.update(dt, this.ocean, steer);

    const keys = this.locked && !this.health.dead && !this.atHelm && !this.gunnery.active ? k : new Set();
    const steps = Math.min(Math.max(Math.ceil(dt / (1 / 60) - 0.01), 1), 4);
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.player.update(sub, keys);
      this.npcs.update(sub);
      this.health.checkImpacts();
      this.world.timestep = sub;
      this.world.step();
    }
    this.health.update(dt);
    this.hud.frame(dt);
    this.sandbox.sync();
    this.sandbox.cleanup();
    this.npcs.frame(dt);
    this.effects.update(dt);
    this.gunnery.update(dt);

    const pt = this.player.body.translation();
    if (!this.health.dead && pt.y < DECK - 3.5) this.overboard();

    // camera: player's eye (or the gun sight) in the ship frame, carried by the ship
    if (this.gunnery.active && !this.health.dead) this.gunnery.cameraPose(this.eye);
    else this.player.applyCamera(this.eye);
    if (this.shake > 0) {
      this.shake = Math.max(this.shake - dt * 3, 0);
      const s = this.shake * 0.03;
      this.eye.rotation.x += (Math.random() - 0.5) * s;
      this.eye.rotation.y += (Math.random() - 0.5) * s;
    }
    this.eye.updateMatrix();
    this.camera.position.copy(this.frame.localToWorld(this.eye.position.clone()));
    this.camera.quaternion.copy(this.frame.quaternion).multiply(this.eye.quaternion);
    this.camera.updateMatrixWorld();

    this.sky.position.copy(this.camera.position);
    this.ocean.update(dt, this.camera, this.ship);
    const cp = this.camera.position;
    this.sun.position.set(cp.x + SUN.x * 100, cp.y + SUN.y * 100, cp.z + SUN.z * 100);
    this.sun.target.position.copy(cp);

    // HUD
    const viewYaw = this.ship.heading + (this.gunnery.active ? this.gunnery.gun.yaw.rotation.y : this.player.yaw);
    this.hud.setHeading(THREE.MathUtils.radToDeg(-viewYaw));
    if (this.atHelm) this.hud.setShip(this.ship, Ship.SPEEDS);
    if (this.gunnery.active) this.hud.setGun(this.gunnery.gun);
    this.hud.setPrompt(this.promptText());
    this.sfx.setEngine(this.started, 0.15 + Math.abs(this.ship.speed) / 22);
    this.sfx.setOcean(this.started, 0.6 + Math.abs(this.ship.speed) / 20);

    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    const showArm = !this.atHelm && !this.gunnery.active && !this.health.dead;
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
