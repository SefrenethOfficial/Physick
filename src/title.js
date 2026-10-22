import * as THREE from 'three';
import { LAND_Y } from './world.js';
import { buildFigure, animateWalk } from './figure.js';
import { Car } from './carphys.js';
import { Heli } from './cargo.js';
import { Track } from './music.js';
import { monsterTruckMesh } from './elmonstruo.js';
import RAPIER from '@dimforge/rapier3d-compat';

// The title screen: you, standing on a pier at the Verian docks, while the city goes to hell
// behind you: a police car chasing a getaway car round the block, robbers legging it down the
// waterfront with a cop on their heels, cars going up in flames, a shootout, a chopper circling.
// And on a loop: two airliners collide overhead and a burning chunk of fuselage slams down right
// next to you before El Monstruo shoves it out of the way; El Monstruo ploughs through a swarm of
// cop cars; and killer clown vans turn up to do burnouts.

const Y = LAND_Y;
const ME = { x: -712, z: 66 }; // on the waterfront, north of the marina
// the block the chase goes round (city roads x -740 / -810, z -35 / 35)
const LOOP = [[-740, -175], [-740, 175], [-810, 175], [-810, -175]]; // up the street in view, back round behind the block

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.t = 0;
    this.cars = [];
    this.music = game.menuTrack || new Track(`${import.meta.env.BASE_URL}assets/music/main-menu.mp3`, 0.6);
  }

  start() {
    const g = this.game;
    this.active = true;
    this.t = 0;
    // you
    const f = buildFigure({ shirt: 0x2c3440, pants: 0x3a3f46, skin: 0xd9a47c });
    f.parts.armR.material = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.85, roughness: 0.35 });
    f.root.position.set(ME.x, Y + 0.95, ME.z);
    f.root.rotation.y = Math.PI / 2 + 0.15; // facing out towards the water (and the camera)
    g.scene.add(f.root);
    this.me = f;
    // the chase: a getaway car with a squad car on its tail
    const mk = (color, police, k) => {
      const [x, z] = LOOP[k];
      const c = new Car(g, { color, police, x, z: z + (police ? -16 : 0), heading: Math.PI, maxSpeed: 24 });
      c.wp = (k + 1) % 4;
      return c;
    };
    this.cars = [mk(0xd0a020, false, 0), mk(0x1b1d22, true, 0)];
    // a burning wreck on the waterfront
    this.wreck = new Car(g, { color: 0x7a2a2a, x: -733, z: 30, heading: 0.6 });
    this.wreck.hp = this.wreck.maxHp * 0.15;
    this.cars.push(this.wreck);
    // the robbers and the cop chasing them
    this.runners = [];
    this.spawnRunners();
    // a police chopper overhead
    this.heli = new Heli(g);
    this.heli.ladder.visible = false;
    this.heli.root.visible = true;
    this.boomT = 9;
    this.shotT = 1.5;
    this.shake = 0;
    this.cine = { t: 0, stage: 0 };
    this.junk = []; // visual debris
    this.extras = []; // event cars, props
    // music: browsers only let it play after you've clicked something
    this.music.update(0, true);
    g.hud.showOverlay(true, true);
  }

  spawnRunners() {
    const g = this.game, C = g.citizens;
    for (const n of this.runners) if (C.list.includes(n)) C.despawn(n);
    this.runners = [];
    const robber = { shirt: 0x111214, pants: 0x1d1f22, skin: 0x111111, hat: 'cap', hatColor: 0x111111 };
    const cop = { shirt: 0x1c2f6e, pants: 0x111a33, skin: 0xd9a47c, hat: 'cap', hatColor: 0x111a33, badge: true };
    const z0 = 95;
    [[robber, 0], [robber, 2.5], [cop, 11]].forEach(([look, back], i) => {
      const n = C.spawnCitizen('city', 'escort', new THREE.Vector3(-728 + i * 1.2, Y, z0 + back), { look });
      if (!n) return;
      n.walkTo = new THREE.Vector3(-728 + i * 1.2, Y, -10);
      n.walkSpeed = i === 2 ? 5.6 : 5.2;
      this.runners.push(n);
    });
  }

  stop() {
    const g = this.game;
    if (!this.active) return;
    this.active = false;
    this.me.root.removeFromParent();
    for (const c of this.cars) c.dispose();
    this.cars = [];
    for (const n of this.runners) if (g.citizens.list.includes(n)) g.citizens.despawn(n);
    this.runners = [];
    this.heli.root.removeFromParent();
    this.clearCine();
  }

  update(dt) {
    const g = this.game;
    this.music.update(dt, this.active && g.settings.music);
    if (!this.active) return;
    this.t += dt;
    // you: idle, breathing, glancing about
    const p = this.me.parts;
    p.torso.position.y = 0.27 + Math.sin(this.t * 1.6) * 0.006;
    this.me.root.rotation.y = Math.PI / 2 + 0.15 + Math.sin(this.t * 0.35) * 0.12;
    animateWalk(p, 0, 0);
    // the chase round the block
    for (const c of this.cars) {
      if (c.scripted) continue; // set-piece vehicles drive themselves
      if (c === this.wreck || c.wreck) { c.coast(dt); continue; }
      const [x, z] = LOOP[c.wp];
      if (Math.hypot(c.pos.x - x, c.pos.z - z) < 9) c.wp = (c.wp + 1) % 4;
      c.driveTo(dt, c.police ? 22 : 21, new THREE.Vector3(x, Y, z), { maxSpeed: 24, accel: 10, grip: 14 });
    }
    this.cinematic(dt);
    // runners: round again when they get to the end
    if (this.runners.every((n) => !g.citizens.list.includes(n) || n.arrived)) this.spawnRunners();
    // the chopper circles the block
    const a = this.t * 0.25;
    this.heli.root.position.set(-770 + Math.cos(a) * 45, Y + 38, 30 + Math.sin(a) * 45);
    this.heli.root.rotation.set(0.1, a + Math.PI, -0.15);
    this.heli.rotor.rotation.y = this.t * 25;
    this.heli.tail.rotation.x = this.t * 40;
    // things going bang in the city
    this.boomT -= dt;
    if (this.boomT <= 0) {
      this.boomT = 10 + Math.random() * 8;
      const at = new THREE.Vector3(-748 - Math.random() * 25, Y + 1, 25 + Math.random() * 45);
      g.fx.explosion(at);
      for (let i = 0; i < 20; i++) g.fx.emit(at.clone(), new THREE.Vector3((Math.random() - 0.5) * 8, 3 + Math.random() * 6, (Math.random() - 0.5) * 8), 0xff8a2a, 1.2, 1, 0.4);
      g.sfx.play('explosion');
    }
    // a shootout down a side street
    this.shotT -= dt;
    if (this.shotT <= 0) {
      this.shotT = Math.random() < 0.7 ? 0.12 + Math.random() * 0.2 : 1.5 + Math.random() * 2;
      const a1 = new THREE.Vector3(-733, Y + 1.4, 48 + Math.random() * 6), b1 = new THREE.Vector3(-752, Y + 1.4, 40 + Math.random() * 12);
      const [from, to] = Math.random() < 0.5 ? [a1, b1] : [b1, a1];
      g.police.tracer(from, to);
      g.fx.flash(from, 0xffc060, 0.8, 0.05);
      if (Math.random() < 0.4) g.sfx.play('pistol');
    }
  }

  // a slow drift round you, with the chaos over your shoulder
  cameraPose(camera) {
    const k = this.t * 0.05;
    const c = new THREE.Vector3(ME.x + 2.7 + Math.sin(k) * 0.3, Y + 1.55 + Math.sin(this.t * 0.3) * 0.05, ME.z + 1.6 + Math.cos(k) * 0.5);
    const sh = this.shake * 0.25;
    if (sh > 0.001) c.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    camera.position.copy(c);
    camera.up.set(0, 1, 0);
    camera.lookAt(ME.x - 10, Y + 2.9, ME.z - 2.2);
  }

  // ================================================================ the set pieces
  clearCine() {
    const g = this.game;
    for (const j of this.junk) j.m.removeFromParent();
    this.junk = [];
    for (const e of this.extras) {
      if (e.isCar) { if (!e.disposed) { e.dispose(); e.disposed = true; } const k = this.cars.indexOf(e); if (k >= 0) this.cars.splice(k, 1); }
      else if (e.prop) { if (g.portSandbox.props.has(e.prop)) g.portSandbox.remove(e.prop); }
      else e.removeFromParent?.();
    }
    this.extras = [];
    this.planes = null; this.chunk = null; this.truck = null; this.cops = null; this.vans = null;
  }

  addCar(car) { car.isCar = true; this.cars.push(car); this.extras.push(car); car.scripted = true; return car; }

  // a fireball in mid-air (no splash ring)
  airBlast(p, size = 1) {
    const g = this.game, fx = g.fx;
    for (let i = 0; i < 260 * size; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.5).normalize().multiplyScalar((8 + Math.random() * 26) * size);
      fx.emit(p.clone(), v, Math.random() < 0.5 ? 0xff9a2a : Math.random() < 0.5 ? 0xffd166 : 0xff4a1a, 0.8 + Math.random() * 1.6, 0.4, 1.0);
    }
    for (let i = 0; i < 60 * size; i++) fx.emit(p.clone(), new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 6, (Math.random() - 0.5) * 10), 0x2a2a2a, 3 + Math.random() * 2, -0.05, 0.4);
    fx.flash(p, 0xffc070, 40 * size, 0.6);
    fx.flash(p, 0xff7a2a, 70 * size, 0.25);
    g.sfx.play('explosion');
    this.shake = Math.max(this.shake, 0.5 * size);
  }

  groundBlast(p, size = 1) {
    const g = this.game, fx = g.fx;
    for (let i = 0; i < 200 * size; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar((6 + Math.random() * 20) * size);
      fx.emit(p.clone(), v, Math.random() < 0.5 ? 0xff9a2a : 0xffd166, 0.7 + Math.random() * 1.2, 0.6, 1.2);
    }
    for (let i = 0; i < 40 * size; i++) fx.emit(p.clone(), new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6), 0x303030, 3, -0.08, 0.3);
    fx.flash(p, 0xffb060, 26 * size, 0.4);
    g.sfx.play('explosion');
  }

  planeMesh(livery) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.2 });
    const tail = new THREE.MeshStandardMaterial({ color: livery, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.2 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 26, 16), white); body.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), white); nose.rotation.x = -Math.PI / 2; nose.position.z = -13;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 5, 16), white); cone.rotation.x = Math.PI / 2; cone.position.z = 15.5;
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.2), glass); cockpit.position.set(0, 0.9, -12.6);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 4.5), white); wing.position.set(0, -0.4, 0.5);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 2.4), white); stab.position.set(0, 0.4, 15);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 4), tail); fin.position.set(0, 3.5, 15); fin.rotation.x = -0.3;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 22, 16, 1, true, -0.4, 0.8), tail); stripe.rotation.x = Math.PI / 2; stripe.rotation.y = Math.PI / 2;
    g.add(body, nose, cone, cockpit, wing, stab, fin, stripe);
    for (const x of [-7, 7]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.5, 12), tail); e.rotation.x = Math.PI / 2; e.position.set(x, -1.4, -1); g.add(e); }
    g.scale.setScalar(1.3);
    return g;
  }

  // a clown van: white with rainbow stripes and a grinning face down the sides
  clownVanMesh() {
    const g = new THREE.Group();
    const side = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 256, 128);
      ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].forEach((col, i) => { x.fillStyle = col; x.fillRect(0, 96 + i * 5, 256, 5); });
      x.fillStyle = '#fff'; x.beginPath(); x.arc(128, 52, 34, 0, 7); x.fill();
      x.fillStyle = '#111'; x.beginPath(); x.arc(114, 44, 6, 0, 7); x.arc(142, 44, 6, 0, 7); x.fill();
      x.fillStyle = '#d50000'; x.beginPath(); x.arc(128, 56, 8, 0, 7); x.fill();
      x.strokeStyle = '#b71c1c'; x.lineWidth = 6; x.beginPath(); x.arc(128, 58, 20, 0.15, Math.PI - 0.15); x.stroke();
      x.fillStyle = '#e53935'; x.beginPath(); x.moveTo(98, 30); x.lineTo(84, 10); x.lineTo(106, 24); x.fill(); x.beginPath(); x.moveTo(158, 30); x.lineTo(172, 10); x.lineTo(150, 24); x.fill();
      x.fillStyle = '#d50000'; x.font = 'bold 16px Arial'; x.textAlign = 'center'; x.fillText('HA HA HA', 128, 16);
      return c;
    })());
    side.colorSpace = THREE.SRGBColorSpace;
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 });
    const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 5.2), [sideM, sideM, white, white, white, white]);
    body.position.y = 1.55;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0x223040 }));
    glass.position.set(0, 2.05, -2.62);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd50000, roughness: 0.3, emissive: 0x400000 }));
    nose.position.set(0, 1.2, -2.7);
    g.add(body, glass, nose);
    const tyre = new THREE.MeshStandardMaterial({ color: 0x151515 });
    const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14); wg.rotateZ(Math.PI / 2);
    for (const [x, z] of [[-1, -1.7], [1, -1.7], [-1, 1.7], [1, 1.7]]) { const w = new THREE.Mesh(wg, tyre); w.position.set(x, 0.42, z); g.add(w); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  cinematic(dt) {
    const g = this.game, c = this.cine, Yg = Y;
    c.t += dt;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const at = (t) => c.stage < t && c.t >= [0, 3, 10, 12.6, 16, 31, 32, 46, 70][t];
    // falling debris and burning bits
    for (const j of [...this.junk]) {
      if (j.landed) { j.life -= dt; if (Math.random() < dt * 20) g.fx.emit(j.m.position.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3((Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)), Math.random() < 0.6 ? 0xff7a1a : 0x333333, 1.4, -0.2, 0.3); if (j.life <= 0) { j.m.removeFromParent(); this.junk.splice(this.junk.indexOf(j), 1); } continue; }
      j.v.y -= 9.8 * dt;
      j.m.position.addScaledVector(j.v, dt);
      j.m.rotation.x += j.spin.x * dt; j.m.rotation.z += j.spin.z * dt;
      if (Math.random() < dt * 40) g.fx.emit(j.m.position.clone(), new THREE.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), Math.random() < 0.5 ? 0xff8a2a : 0x2a2a2a, 1.6, -0.1, 0.3);
      if (j.m.position.y <= Yg + 0.4) { j.m.position.y = Yg + 0.4; j.landed = true; j.life = 18; this.groundBlast(j.m.position.clone(), 0.5); }
    }
    // 1 · two airliners on a collision course
    if (at(1)) {
      c.stage = 1;
      const C = new THREE.Vector3(-790, 62, 30);
      this.crash = C;
      this.planes = [[new THREE.Vector3(-760, 66, 330), 0xc62828], [new THREE.Vector3(-820, 58, -270), 0x1e5aa8]].map(([from, col]) => {
        const m = this.planeMesh(col); g.scene.add(m); this.extras.push(m);
        return { m, from, to: C.clone() };
      });
    }
    if (this.planes && c.stage === 1) {
      const k = Math.min(1, (c.t - 3) / 7);
      for (const p of this.planes) {
        p.m.position.lerpVectors(p.from, p.to, k);
        const d = p.to.clone().sub(p.from);
        p.m.rotation.set(0, Math.atan2(-d.x, -d.z), Math.sin(c.t * 0.8) * 0.05);
        if (Math.random() < dt * 30) g.fx.emit(p.m.position.clone().addScaledVector(d.clone().normalize(), 18), new THREE.Vector3(0, 0, 0), 0xdddddd, 2.5, 0, 0.1); // contrails
      }
    }
    // 2 · impact
    if (at(2)) {
      c.stage = 2;
      for (const p of this.planes) p.m.visible = false;
      this.airBlast(this.crash.clone(), 1.6);
      setTimeout(() => this.active && this.airBlast(this.crash.clone().add(new THREE.Vector3(6, -3, 4)), 0.9), 250);
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
      const bits = [[8, 0.4, 3], [6, 0.4, 2.5], [3, 3, 6], [2, 2, 4], [1.5, 1.5, 3], [5, 0.3, 2], [2.5, 2.5, 2.5]];
      for (const [w, h, d] of bits) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.copy(this.crash); m.castShadow = true; g.scene.add(m);
        const land = new THREE.Vector3(-750 - Math.random() * 60, Yg, -10 + Math.random() * 80);
        const T = 2.6 + Math.random() * 1.6;
        const v = land.clone().sub(this.crash).divideScalar(T); v.y = (land.y - this.crash.y) / T + 0.5 * 9.8 * T;
        this.junk.push({ m, v, spin: new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4) });
      }
      // the big one: a burning section of fuselage, aimed right at you
      const target = new THREE.Vector3(ME.x - 5, Yg + 1.6, ME.z - 6.5);
      const T = 2.6;
      const v0 = target.clone().sub(this.crash).divideScalar(T); v0.y = (target.y - this.crash.y) / T + 0.5 * 9.81 * T;
      const fus = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
      shell.rotation.x = Math.PI / 2;
      const burnt = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 1.6, 14, 1, true, 0, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide }));
      burnt.rotation.x = Math.PI / 2; burnt.position.z = 3;
      const strip = new THREE.Mesh(new THREE.CylinderGeometry(1.63, 1.63, 7, 14, 1, true, -0.3, 0.6), new THREE.MeshStandardMaterial({ color: 0xc62828, side: THREE.DoubleSide }));
      strip.rotation.x = Math.PI / 2; strip.rotation.y = Math.PI / 2;
      fus.add(shell, burnt, strip);
      fus.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const def = { id: 'wreckage', name: 'Wreckage', radius: 3.5, build: () => ({ mesh: fus, colliders: [RAPIER.ColliderDesc.cuboid(1.6, 1.5, 3.5)], density: 30, friction: 1.2, restitution: 0 }) };
      const prop = g.portSandbox.spawn(def, this.crash.clone(), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.8, 0.2)), { noHistory: true });
      prop.body.enableCcd(true); // it comes down fast: don't let it punch through the ground
      prop.body.setLinvel({ x: v0.x, y: v0.y, z: v0.z }, true);
      prop.body.setAngvel({ x: 0.6, y: 0.4, z: 0.9 }, true);
      this.chunk = prop;
      this.extras.push({ prop });
    }
    // the fuselage on fire, all the way down and after
    if (this.chunk && g.portSandbox.props.has(this.chunk)) {
      const t = this.chunk.body.translation();
      for (let i = 0; i < (c.stage >= 3 ? 2 : 3); i++) g.fx.emit(new THREE.Vector3(t.x + (Math.random() - 0.5) * 2, t.y + 0.8, t.z + (Math.random() - 0.5) * 3), new THREE.Vector3((Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.5), Math.random() < 0.65 ? (Math.random() < 0.5 ? 0xff7a1a : 0xffc040) : 0x2a2a2a, 1.2, -0.2, 0.3);
      if (c.stage === 2 && t.y < Yg + 3.6) {
        c.stage = 3;
        // it slams down and stays down (no bouncing off into the harbour)
        const v = this.chunk.body.linvel();
        this.chunk.body.setLinvel({ x: v.x * 0.1, y: -2, z: v.z * 0.1 }, true);
        this.chunk.body.setAngvel({ x: 0, y: 0.3, z: 0 }, true);
        this.groundBlast(new THREE.Vector3(t.x, Yg + 0.5, t.z), 1.3);
        this.shake = 1.6;
        g.sfx.play('crash');
      }
    }
    // 4 · El Monstruo comes down the waterfront and shoves the wreckage out of the way
    if (at(4)) {
      c.stage = 4;
      const t = this.addCar(new Car(g, { mesh: monsterTruckMesh(), x: -719, z: 5, heading: Math.PI, hp: 99999, half: { x: 1.45, y: 1.05, z: 3.45 }, density: 420, wheelbase: 4.5, maxSpeed: 26, ride: 1.0 }));
      t.monster = true;
      // straight through wherever the wreckage ended up
      const cp = this.chunk && g.portSandbox.props.has(this.chunk) ? this.chunk.body.translation() : { x: -717, z: 60 };
      t.route = [new THREE.Vector3(cp.x - 1, Yg, cp.z - 18), new THREE.Vector3(cp.x - 0.5, Yg, cp.z + 4), new THREE.Vector3(cp.x - 2, Yg, cp.z + 18), new THREE.Vector3(-740, Yg, cp.z + 40), new THREE.Vector3(-740, Yg, 260)]; // shove it clear, then off up the street
      t.speedWant = 15;
      this.truck = t;
    }
    // 5 · a swarm of cop cars comes down the street…
    if (at(5)) {
      c.stage = 5;
      if (this.truck) { this.truck.dispose(); this.truck.disposed = true; this.cars.splice(this.cars.indexOf(this.truck), 1); }
      this.cops = [];
      for (let i = 0; i < 7; i++) {
        const cop = this.addCar(new Car(g, { police: true, x: -743 + (i % 2) * 5, z: 48 + i * 7, heading: 0, maxSpeed: 16 }));
        cop.route = [new THREE.Vector3(-741 + (i % 2) * 4, Yg, -60)];
        cop.speedWant = 6;
        this.cops.push(cop);
      }
    }
    // 6 · …straight into El Monstruo coming the other way
    if (at(6)) {
      c.stage = 6;
      const t = this.addCar(new Car(g, { mesh: monsterTruckMesh(), x: -740, z: -45, heading: Math.PI, hp: 99999, half: { x: 1.45, y: 1.05, z: 3.45 }, density: 420, wheelbase: 4.5, maxSpeed: 30, ride: 1.0 }));
      t.monster = true;
      t.route = [new THREE.Vector3(-740, Yg, 250)];
      t.speedWant = 26;
      this.truck = t;
    }
    // 7 · killer clown vans, doing burnouts
    if (at(7)) {
      c.stage = 7;
      this.vans = [[-724, 34], [-735, 50], [-722, 16]].map(([x, z], i) => {
        const v = this.addCar(new Car(g, { mesh: this.clownVanMesh(), x, z, heading: i * 2, half: { x: 1.05, y: 0.9, z: 2.6 }, maxSpeed: 12 }));
        v.donut = i % 2 ? 1 : -1;
        return v;
      });
    }
    // 8 · round again
    if (at(8)) { this.clearCine(); c.t = 0; c.stage = 0; return; }

    // drive the scripted vehicles
    for (const v of this.extras) {
      if (!v.isCar || v.disposed || v.wreck) continue;
      if (v.donut) {
        v.apply(dt, 8, 0.62 * v.donut, { accel: 14, grip: 3.5, maxSpeed: 12, steerRate: 10 });
        if (Math.random() < dt * 60) {
          const back = v.pos.clone().addScaledVector(v.forward, -2.2);
          g.fx.emit(back.add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.4, (Math.random() - 0.5) * 2)), new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2), 0xd8d8d8, 2.2, -0.05, 0.6);
        }
        continue;
      }
      if (!v.route?.length) { v.coast(dt); continue; }
      const wp = v.route[0];
      if (Math.hypot(v.pos.x - wp.x, v.pos.z - wp.z) < 8) { v.route.shift(); if (!v.route.length) continue; }
      v.driveTo(dt, v.speedWant, v.route[0], { maxSpeed: v.maxSpeed ?? 24, accel: 12, grip: 14 });
    }
    // El Monstruo flattens every cop car it touches
    if (this.truck && !this.truck.disposed && this.cops) {
      const t = this.truck;
      for (const cop of this.cops) {
        if (cop.wreck || cop.disposed || cop.pos.distanceTo(t.pos) > 5.2) continue;
        const push = cop.pos.clone().sub(t.pos).setY(0).normalize();
        cop.body.applyImpulse({ x: push.x * cop.body.mass() * 14, y: 0, z: push.z * cop.body.mass() * 14 }, true);
        cop.body.applyTorqueImpulse({ x: 0, y: (Math.random() - 0.5) * 30000, z: 0 }, true);
        cop.dent(push.clone().multiplyScalar(-1).applyAxisAngle(new THREE.Vector3(0, 1, 0), -cop.heading), 0.35);
        cop.damage(999);
        this.shake = Math.max(this.shake, 0.4);
      }
    }
  }
}
