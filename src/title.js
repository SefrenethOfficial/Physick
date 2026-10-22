import * as THREE from 'three';
import { LAND_Y } from './world.js';
import { buildFigure, animateWalk } from './figure.js';
import { Car } from './carphys.js';
import { Heli } from './cargo.js';
import { Track } from './music.js';

// The title screen: you, standing on a pier at the Verian docks, while the city goes to hell
// behind you: a police car chasing a getaway car round the block, robbers legging it down the
// waterfront with a cop on their heels, cars going up in flames, a shootout, a chopper circling.

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
    this.music = new Track(`${import.meta.env.BASE_URL}assets/music/main-menu.mp3`, 0.6);
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
    this.boomT = 3;
    this.shotT = 1.5;
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
      if (c === this.wreck || c.wreck) { c.coast(dt); continue; }
      const [x, z] = LOOP[c.wp];
      if (Math.hypot(c.pos.x - x, c.pos.z - z) < 9) c.wp = (c.wp + 1) % 4;
      c.driveTo(dt, c.police ? 22 : 21, new THREE.Vector3(x, Y, z), { maxSpeed: 24, accel: 10, grip: 14 });
    }
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
      this.boomT = 6 + Math.random() * 6;
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
    camera.position.copy(c);
    camera.up.set(0, 1, 0);
    camera.lookAt(ME.x - 10, Y + 2.9, ME.z - 2.2);
  }
}
