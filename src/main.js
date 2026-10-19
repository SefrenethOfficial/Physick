import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sandbox } from './sandbox.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { Player } from './player.js';
import { Viewmodel } from './viewmodel.js';
import { Hud } from './hud.js';
import { PROPS, PROP_BY_ID, prepareRobotArmProp } from './props.js';
import { Gunner } from './tools/gunner.js';
import { Weld } from './tools/weld.js';
import { Move } from './tools/move.js';
import * as T from './textures.js';

const FOV = 75;

class Emitter {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] ||= []).push(f); }
  emit(e, ...a) { (this.h[e] || []).forEach((f) => f(...a)); }
}

// Box whose UVs are scaled by face size so tiled textures stay square in world space.
function worldBox(w, h, d, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  return g;
}

class Game {
  constructor() {
    this.events = new Emitter();
    this.canvas = document.getElementById('game');
    this.keys = new Set();
    this.heldProp = null;
    this.locked = false;
    this.started = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firingPrimary = false;
    this.assets = {};
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
    r.toneMappingExposure = 1.05;
    r.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 1500);
    this.scene.add(this.camera);
    this.buildSky();

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.effects = new Effects(this.scene);
    this.sandbox = new Sandbox(this);
    this.sfx = new Sfx();

    // ---------- assets ----------
    loadingEl.textContent = 'Loading robot arm…';
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/robotic_arm.glb`, (e) => {
      if (e.total) loadingEl.textContent = `Loading robot arm… ${Math.round((e.loaded / e.total) * 100)}%`;
    });
    this.assets.robotArm = prepareRobotArmProp(gltf.scene);

    this.buildLevel();
    this.player = new Player(this, new THREE.Vector3(0, 1.5, 12));
    this.viewmodel = new Viewmodel(gltf.scene, FOV);

    this.tools = [new Gunner(this), new Weld(this), new Move(this)];
    this.hud = new Hud(this, this.tools);
    this.toolIndex = -1;
    this.setTool(2, true);

    this.populate();
    loadingEl.textContent = 'Building spawn menu…';
    const thumbs = this.renderThumbnails();
    this.hud.buildSpawnMenu(PROPS, thumbs, (def, keepOpen) => this.spawnFromMenu(def, keepOpen));

    this.bindInput();
    this.resize();
    addEventListener('resize', () => this.resize());

    loadingEl.textContent = '';
    const play = document.querySelector('#overlay .play');
    play.disabled = false;
    this.hud.showOverlay(true, true);

    this.timer = new THREE.Timer();
    this.timer.connect?.(document);
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.renderer.setAnimationLoop(() => this.frame());
    window.physick = this; // handy for poking around in the console
  }

  // ---------- world ----------
  buildSky() {
    const top = new THREE.Color(0x5d8fc9), horizon = new THREE.Color(0xd9e4ee), bottom = new THREE.Color(0x9aa3ab);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: top }, horizon: { value: horizon }, bottom: { value: bottom } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
          void main(){ float h = vP.y; vec3 c = h > 0. ? mix(horizon, top, pow(h, .55)) : mix(horizon, bottom, pow(-h, .4));
          gl_FragColor = vec4(c, 1.); }`,
      }),
    );
    sky.renderOrder = -1;
    this.camera.add(sky); // follows the camera
    this.scene.fog = new THREE.Fog(0xd9e4ee, 90, 420);

    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b5f50, 1.2));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff2df, 2.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = s.bottom = -45; s.right = s.top = 45; s.near = 1; s.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.sunOffset = new THREE.Vector3(40, 70, 25);
    this.scene.add(sun, sun.target);
  }

  buildLevel() {
    const sb = this.sandbox;
    const grey = T.devGrid('#8b9097', '#787d84', '#61666d');
    const orange = T.devGrid('#d5843a', '#bf722d', '#9e5a1f');
    const dark = T.devGrid('#545a62', '#4a4f56', '#3a3e44');
    const mat = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
    const mGrey = mat(grey), mOrange = mat(orange), mDark = mat(dark);

    const block = (w, h, d, x, y, z, m, rot) => {
      const mesh = new THREE.Mesh(worldBox(w, h, d), m);
      mesh.position.set(x, y, z);
      if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
      mesh.updateMatrix();
      sb.addStatic(mesh, RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2));
      return mesh;
    };

    // ground
    block(400, 1, 400, 0, -0.5, 0, mGrey);

    // raised platform with stairs + ramp
    block(12, 3, 12, -18, 1.5, -12, mOrange);
    for (let i = 0; i < 6; i++) block(3, 0.5 * (i + 1), 1, -10.5, 0.25 * (i + 1), -16.5 + i, mDark);
    const rampLen = 12, rampAngle = Math.atan2(3, rampLen);
    block(4, 0.4, Math.hypot(rampLen, 3), -18, 1.35, -12 + 6 + rampLen / 2 - 0.2, mDark, [rampAngle, 0, 0]);

    // big jump ramp
    block(8, 0.5, 14, 22, 2.2, -4, mOrange, [-0.33, 0, 0]);
    block(8, 4, 3, 22, 2, -12, mOrange);

    // tower
    block(5, 14, 5, -30, 7, 18, mDark);
    block(9, 0.6, 9, -30, 14.3, 18, mOrange);

    // perimeter-ish walls for things to crash into
    block(30, 4, 1, 0, 2, -40, mDark);
    block(1, 4, 20, 34, 2, 10, mDark);
    block(16, 1.2, 1, 10, 0.6, 18, mOrange);
    // little pillars
    for (let i = 0; i < 4; i++) block(1.2, 2 + i, 1.2, -6 + i * 3, 1 + i / 2, 26, mOrange);
  }

  populate() {
    const sb = this.sandbox;
    const P = PROP_BY_ID;
    const q0 = new THREE.Quaternion();
    const at = (x, y, z) => new THREE.Vector3(x, y, z);
    // crate pyramid
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 4 - row; i++) sb.spawn(P.crate, at(6 + i * 1.02 + row * 0.51, 0.5 + row * 1.0, -6), q0);
    }
    // barrels
    for (let i = 0; i < 4; i++) sb.spawn(P.barrel, at(-4 + i * 1.1, 0.6, -5), q0);
    // balls
    for (let i = 0; i < 3; i++) sb.spawn(P.ball, at(2 + i, 0.4, 2 + (i % 2)), q0);
    // car kit: sheet + four wheels, ready to weld
    sb.spawn(P.sheet, at(10, 1.3, 6), q0);
    for (const [dx, dz] of [[-1.25, -1.1], [1.25, -1.1], [-1.25, 1.1], [1.25, 1.1]]) sb.spawn(P.wheel, at(10 + dx, 0.6, 6 + dz), q0);
    // planks and beams
    sb.spawn(P.plank, at(-2, 0.1, 6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, 0)));
    sb.spawn(P.plank, at(-2, 0.3, 7), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.2, 0)));
    sb.spawn(P.beam, at(-8, 0.15, 3), q0);
    // robot arm on show
    sb.spawn(P.robotarm, at(0, 1.15, -8), q0);
    // cones
    for (let i = 0; i < 5; i++) sb.spawn(P.cone, at(14 + i * 1.2, 0.42, 12), q0);
    // boulder up on the platform
    sb.spawn(P.boulder, at(-18, 4, -14), q0);
    sb.spawn(P.bigcrate, at(-15, 4, -9), q0);
    sb.history.length = 0; // the starting layout isn't undoable
  }

  resetMap() {
    this.tools.forEach((t) => t.deactivate());
    this.sandbox.clear();
    this.populate();
    this.player.respawn();
    this.hud.toast('Map reset');
  }

  // ---------- tools ----------
  get tool() { return this.tools[this.toolIndex]; }

  setTool(i, silent = false) {
    if (i === this.toolIndex || !this.tools[i]) return;
    this.tool?.deactivate();
    this.toolIndex = i;
    this.hud.setMode(i, this.tool);
    this.viewmodel.setColor(this.tool.color);
    if (!silent) { this.viewmodel.switched(); this.sfx.play('switch'); }
  }

  aim() {
    const p = this.player;
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
    return { origin: p.eye, dir };
  }

  aimHit(max = 300) {
    const { origin, dir } = this.aim();
    return this.sandbox.raycast(origin, dir, max, this.player.collider);
  }

  muzzle() {
    this.camera.updateMatrixWorld();
    return this.viewmodel.tipWorld(this.camera);
  }

  spawnFromMenu(def, keepOpen) {
    const { origin, dir } = this.aim();
    const hit = this.sandbox.raycast(origin, dir, 14, this.player.collider);
    const pos = hit
      ? hit.point.clone().addScaledVector(hit.normal, def.radius + 0.05)
      : origin.clone().addScaledVector(dir, 6);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
    const prop = this.sandbox.spawn(def, pos, q);
    this.effects.sparks(pos, new THREE.Vector3(0, 1, 0), 0xffffff, 16, 3, 0.4);
    this.sfx.play('spawn');
    this.hud.toast(`Spawned ${def.name}`);
    if (!keepOpen) this.closeMenu();
    return prop;
  }

  // ---------- spawn menu thumbnails ----------
  renderThumbnails() {
    const size = 160;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(2, 3, 2.5);
    scene.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    const out = {};
    for (const def of PROPS) {
      const mesh = def.build(this.assets).mesh;
      mesh.rotation.set(0.0, -0.6, 0);
      scene.add(mesh);
      const sphere = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere());
      const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02;
      cam.position.copy(sphere.center).add(new THREE.Vector3(0.6, 0.45, 1).normalize().multiplyScalar(dist));
      cam.lookAt(sphere.center);
      r.clear();
      r.render(scene, cam);
      out[def.id] = r.domElement.toDataURL();
      scene.remove(mesh);
    }
    r.dispose();
    r.forceContextLoss?.();
    return out;
  }

  // ---------- input ----------
  lock() {
    this.sfx.unlock();
    const p = this.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => { if (!this.hud.menuOpen) this.hud.showOverlay(true); });
  }

  openMenu() {
    this.tool.primaryUp?.();
    this.hud.showMenu(true);
    this.hud.showOverlay(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  closeMenu() {
    this.hud.showMenu(false);
    this.lock();
  }

  bindInput() {
    const overlay = document.getElementById('overlay');
    overlay.addEventListener('click', () => {
      if (document.querySelector('#overlay .play').disabled) return;
      this.started = true;
      this.lock();
    });
    this.canvas.addEventListener('click', () => { if (!this.locked && !this.hud.menuOpen) this.lock(); });
    document.getElementById('spawnmenu').addEventListener('click', (e) => {
      if (e.target.id === 'spawnmenu') this.closeMenu();
    });
    document.getElementById('btn-clear').addEventListener('click', () => {
      this.tools.forEach((t) => t.deactivate());
      this.sandbox.clear();
      this.hud.toast('Cleared');
      this.closeMenu();
    });
    document.getElementById('btn-reset').addEventListener('click', () => { this.resetMap(); this.closeMenu(); });

    document.addEventListener('pointerlockerror', () => { if (!this.hud.menuOpen) this.hud.showOverlay(true); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) {
        this.hud.showOverlay(false);
        this.hud.showMenu(false);
      } else {
        this.tool.primaryUp?.();
        this.keys.clear();
        if (!this.hud.menuOpen) this.hud.showOverlay(true);
      }
    });

    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Ignore the occasional giant spike some browsers emit on lock.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      if (this.tool.wantsMouse?.(this.keys)) this.tool.mouse(e.movementX, e.movementY);
      else this.player.look(e.movementX, e.movementY);
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.firingPrimary = true; this.tool.primaryDown?.(); }
      if (e.button === 2) this.tool.secondaryDown?.();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.firingPrimary = false; if (this.locked) this.tool.primaryUp?.(); }
      if (e.button === 2 && this.locked) this.tool.secondaryUp?.();
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (!this.locked) return;
      if (this.tool.wheel?.(e.deltaY)) return;
      const n = this.tools.length;
      this.setTool((this.toolIndex + (e.deltaY > 0 ? 1 : n - 1)) % n);
    }, { passive: true });

    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape' && this.hud.menuOpen) {
        this.hud.showMenu(false);
        this.hud.showOverlay(true);
        return;
      }
      if (e.code === 'KeyQ') {
        if (this.hud.menuOpen) this.closeMenu();
        else if (this.started) this.openMenu();
        return;
      }
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Digit')) { this.setTool(+e.code.slice(5) - 1); return; }
      if (e.code === 'KeyZ') {
        const p = this.sandbox.undo();
        if (p) { this.hud.toast(`Undone ${p.def.name}`); this.sfx.play('unweld'); }
        else this.hud.toast('Nothing to undo');
        return;
      }
      if (e.code === 'KeyV') {
        this.player.noclip = !this.player.noclip;
        this.hud.setNoclip(this.player.noclip);
        this.hud.toast(this.player.noclip ? 'Noclip on' : 'Noclip off');
        return;
      }
      this.tool.key?.(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.effects.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.resize(w / h, FOV);
  }

  // ---------- loop ----------
  frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const steps = Math.min(Math.max(Math.ceil(dt / (1 / 60) - 0.01), 1), 4);
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.player.update(sub, this.locked ? this.keys : new Set());
      this.tool.update(sub);
      this.world.timestep = sub;
      this.world.step();
    }
    this.sandbox.sync();
    this.sandbox.cleanup();

    this.player.applyCamera(this.camera);
    this.camera.updateMatrixWorld();
    this.viewmodel.update(dt, this.player, this.mouseDX, this.mouseDY, this.firingPrimary && this.toolIndex === 0);
    this.mouseDX = this.mouseDY = 0;
    this.effects.update(dt);

    const pp = this.player.body.translation();
    this.sun.position.set(pp.x + this.sunOffset.x, pp.y + this.sunOffset.y, pp.z + this.sunOffset.z);
    this.sun.target.position.set(pp.x, pp.y, pp.z);

    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.viewmodel.scene, this.viewmodel.camera);

    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      let welds = 0;
      for (const p of this.sandbox.props) welds += p.welds.size;
      const worldWelds = [...this.sandbox.props].reduce((n, p) => n + [...p.welds].filter((w) => !w.b && w.a === p).length, 0);
      this.hud.setStats(Math.round(this.fpsFrames / this.fpsAcc), this.sandbox.props.size, (welds + worldWelds) / 2);
      this.fpsAcc = 0; this.fpsFrames = 0;
    }
  }
}

new Game().init().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Failed to start: ${err.message}`;
});
