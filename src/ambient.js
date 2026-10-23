import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildFigure } from './figure.js';
import { std } from './buildkit.js';
import { LAND_Y } from './world.js';

// Life around town: buskers playing in the plaza (tip them), fishermen on the end of the
// Saltmarsh dock, people walking their dogs and joggers out on their runs.

const DOG_COLORS = [0x8a5a2a, 0x2a2a2a, 0xe8d8b8, 0xb07a3a, 0x6a6a6a, 0xf2f0ea];

function dogMesh(color) {
  const g = new THREE.Group(), m = std({ color, roughness: 0.9 }), dark = std({ color: 0x1b1b1b });
  const add = (w, h, d, x, y, z, mat = m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  add(0.26, 0.24, 0.62, 0, 0.36, 0); // body
  const head = add(0.22, 0.22, 0.24, 0, 0.55, 0.36);
  add(0.12, 0.1, 0.14, 0, 0.5, 0.52); // snout
  add(0.05, 0.05, 0.03, 0, 0.53, 0.6, dark); // nose
  for (const s of [-1, 1]) add(0.06, 0.12, 0.06, s * 0.08, 0.7, 0.32, m); // ears
  const legs = [];
  for (const [x, z] of [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]]) {
    const p = new THREE.Group(); p.position.set(x, 0.3, z); g.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), m); l.position.y = -0.15; p.add(l); legs.push(p);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.45, -0.3); g.add(tail);
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.25), m); t.position.z = -0.12; t.rotation.x = -0.5; tail.add(t);
  g.userData = { legs, tail, head };
  return g;
}

export class Ambient {
  constructor(game) {
    this.game = game;
    this.dogs = []; // { npc, mesh, leash, phase, runT }
    this.buskers = [];
    this.fishers = [];
    this.t = 0;
    const c = game.city.plaza;
    this.addBusker(new THREE.Vector3(c.x + 13, c.y, c.z - 9), -2.3, 0x8a3a2a, 'guitar');
    this.addBusker(new THREE.Vector3(c.x - 14, c.y, c.z + 11), 0.9, 0x2a4a6a, 'sax');
    const d = game.saltmarsh.dock;
    for (const [x, k] of [[-782, 0], [-765, 1], [-723, 2], [-700, 3]]) this.addFisher(new THREE.Vector3(x + (k === 3 ? -14 : 0), LAND_Y, d.z + 65.5), k);
    for (const n of game.citizens.list) if (n.role === 'civ') this.dress(n); // the people already out
  }

  addBusker(at, yaw, shirt, kind) {
    const g = this.game;
    const fig = buildFigure({ shirt, pants: 0x2c3440, skin: [0xd9a47c, 0x7a4f35][this.buskers.length % 2], hat: kind === 'guitar' ? 'cap' : undefined, hatColor: 0x4a3a2a });
    fig.root.position.set(at.x, at.y + 0.83, at.z); fig.root.rotation.y = yaw;
    const wood = std({ color: 0xb0703a, roughness: 0.5 }), brass = std({ color: 0xd0a040, metalness: 0.8, roughness: 0.3 });
    if (kind === 'guitar') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.1), wood); body.position.set(0.05, 0.12, 0.2); body.rotation.z = 0.5;
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.04), std({ color: 0x3a2a1a })); neck.position.set(-0.22, 0.4, 0.2); neck.rotation.z = 0.5;
      fig.root.add(body, neck);
    } else {
      const sax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.6, 10), brass); sax.position.set(0, 0.25, 0.22); sax.rotation.x = 0.4;
      fig.root.add(sax);
    }
    g.scene.add(fig.root);
    g.portSandbox.addStaticCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(at.x, at.y + 0.83, at.z));
    // the open case with some coins in it
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const cp = at.clone().addScaledVector(f, 1.0);
    const casing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.36), std({ color: 0x1b1b1b })); casing.position.set(cp.x, at.y + 0.04, cp.z); casing.rotation.y = yaw;
    const felt = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.02, 0.3), std({ color: 0x7a1a2a })); felt.position.set(cp.x, at.y + 0.09, cp.z); felt.rotation.y = yaw;
    g.scene.add(casing, felt);
    for (let i = 0; i < 9; i++) { const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 8), brass); coin.position.set(cp.x + (Math.random() - 0.5) * 0.6, at.y + 0.105, cp.z + (Math.random() - 0.5) * 0.2); g.scene.add(coin); }
    this.buskers.push({ fig, at, kind, case: cp, tips: 0 });
  }

  addFisher(at, k) {
    const g = this.game;
    const fig = buildFigure({ shirt: [0xe0a52b, 0x3a6a3a, 0xc23b2a, 0x2f4f6f][k % 4], pants: 0x34495e, skin: [0xf1c9a5, 0xa8724f, 0xd9a47c, 0x7a4f35][k % 4], hat: 'cap', hatColor: [0x2a4a2a, 0xf2f0ea, 0x1b2638, 0x8a3a2a][k % 4] });
    fig.root.position.set(at.x, at.y + 0.83, at.z); // facing +z: out to sea
    const rod = new THREE.Group(); rod.position.set(0.25, 0.1, 0.25); rod.rotation.x = -0.9; fig.root.add(rod);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 2.6, 6), std({ color: 0x2a2a2a })); pole.position.y = 1.3; rod.add(pole);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 }));
    g.scene.add(fig.root, line);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 12), std({ color: 0x5a7a9a })); bucket.position.set(at.x - 0.7, at.y + 0.15, at.z - 0.3); g.scene.add(bucket);
    const stool = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), std({ color: 0x6a4a2a })); stool.position.set(at.x + 0.6, at.y + 0.4, at.z - 0.4); g.scene.add(stool);
    g.portSandbox.addStaticCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(at.x, at.y + 0.83, at.z));
    this.fishers.push({ fig, rod, line, at, phase: Math.random() * 6, biteT: 10 + Math.random() * 30 });
  }

  // a citizen just spawned: maybe give them a dog, or send them jogging
  dress(npc) {
    if (npc.role !== 'civ' || npc.island === 'naval') return;
    const r = Math.random();
    if (r < 0.12) {
      const mesh = dogMesh(DOG_COLORS[Math.floor(Math.random() * DOG_COLORS.length)]);
      const s = 0.8 + Math.random() * 0.5; mesh.scale.setScalar(s);
      const t = npc.body.translation(); mesh.position.set(t.x, t.y - 0.83, t.z);
      const leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xc0442c }));
      leash.frustumCulled = false;
      this.game.scene.add(mesh, leash);
      this.dogs.push({ npc, mesh, leash, phase: Math.random() * 6, runT: 0, off: new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 0.7, 0, 0.6) });
      npc.hasDog = true;
    } else if (r < 0.22) {
      npc.jogger = true; // running kit and a sweatband
      const p = npc.fig.parts;
      p.torso.material = std({ color: [0xff5a8a, 0x3ad8a0, 0xf2d23a, 0x5ab0ff][Math.floor(Math.random() * 4)] });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.04, 14), std({ color: 0xf2f2ee })); band.position.y = 0.05; p.head.add(band);
    }
  }

  near(pos) {
    for (const b of this.buskers) if (Math.hypot(pos.x - b.case.x, pos.z - b.case.z) < 3.4) return b;
    return null;
  }

  action(pos) {
    const b = this.near(pos);
    if (!b) return null;
    return { label: `Tip the ${b.kind === 'guitar' ? 'guitarist' : 'sax player'} ($5)`, run: () => this.tip(b) };
  }

  tip(b) {
    const g = this.game, e = g.economy;
    if (e.money < 5) { g.hud.toast('You\'ve not even got five dollars', 0xff8a6a); return; }
    e.addMoney(-5);
    b.tips++;
    g.sfx.play('cash');
    g.hud.toast(['"Cheers, friend!"', '"You\'re a legend."', '"This one\'s for you!"', '"Bless you."'][b.tips % 4], 0x7be08a);
    g.stats?.add?.('tips', 1);
    g.rep?.change?.(1, 'tipped a busker');
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const cp = g.camera.position;
    // buskers play: a strum or a sway, and some notes if you're close
    for (const b of this.buskers) {
      const p = b.fig.parts;
      const near = Math.hypot(cp.x - b.at.x, cp.z - b.at.z) < 60;
      b.fig.root.visible = near;
      if (!near) continue;
      if (b.kind === 'guitar') { p.armRPivot.rotation.x = -0.9 + Math.sin(this.t * 9) * 0.25; p.armLPivot.rotation.set(-1.2, 0, 0.5); }
      else { p.armRPivot.rotation.x = -1.3; p.armLPivot.rotation.x = -1.3; b.fig.root.rotation.z = Math.sin(this.t * 2) * 0.05; }
      b.noteT = (b.noteT || 0) - dt;
      const d = Math.hypot(cp.x - b.at.x, cp.z - b.at.z);
      if (d < 18 && b.noteT <= 0 && g.sfx.ctx && !g.sfx.muffled) {
        b.noteT = b.kind === 'guitar' ? 0.32 : 0.45;
        const scale = [220, 247, 262, 294, 330, 392, 440];
        const f = scale[Math.floor(Math.random() * scale.length)] * (b.kind === 'sax' ? 1 : 1);
        g.sfx.tone?.(b.kind === 'guitar' ? 'triangle' : 'sawtooth', f, f * 0.995, 0.35, 0.05 * (1 - d / 18));
      }
    }
    // fishermen: rods bob, and now and then something bites
    for (const f of this.fishers) {
      const near = Math.hypot(cp.x - f.at.x, cp.z - f.at.z) < 120;
      f.fig.root.visible = f.line.visible = near;
      if (!near) continue;
      f.phase += dt;
      f.biteT -= dt;
      const bite = f.biteT < 0 && f.biteT > -2.5;
      if (f.biteT < -2.5) f.biteT = 15 + Math.random() * 40;
      f.rod.rotation.x = -0.9 + Math.sin(f.phase * 1.3) * 0.04 + (bite ? -0.25 + Math.sin(f.phase * 14) * 0.08 : 0);
      f.fig.parts.armRPivot.rotation.x = -0.9 + (bite ? -0.3 : 0); f.fig.parts.armLPivot.rotation.x = -0.8;
      f.fig.root.updateMatrixWorld(true);
      const tip = new THREE.Vector3(0, 2.6, 0); f.rod.children[0].parent.localToWorld(tip);
      const bob = new THREE.Vector3(f.at.x + 0.3, 0.1 + Math.sin(f.phase * 2) * 0.05 - (bite ? 0.2 : 0), f.at.z + 4.5);
      const a = f.line.geometry.attributes.position; a.setXYZ(0, tip.x, tip.y, tip.z); a.setXYZ(1, bob.x, bob.y, bob.z); a.needsUpdate = true;
    }
    // dogs trot along beside (or a bit behind) their people
    for (const d of [...this.dogs]) {
      const alive = g.citizens.list.includes(d.npc);
      const m = d.mesh, u = m.userData;
      if (!alive || d.npc.down || d.npc.hostage) {
        // their person's gone: off it runs, yelping
        d.runT += dt;
        if (d.runT === dt) g.sfx.play('ouch');
        const away = new THREE.Vector3(Math.sin(m.rotation.y), 0, Math.cos(m.rotation.y));
        m.position.addScaledVector(away, dt * 6);
        d.leash.visible = false;
        for (const [i, l] of u.legs.entries()) l.rotation.x = Math.sin(this.t * 18 + i * Math.PI) * 0.7;
        if (d.runT > 6) { m.removeFromParent(); d.leash.removeFromParent(); this.dogs.splice(this.dogs.indexOf(d), 1); }
        continue;
      }
      const t = d.npc.body.translation(), h = d.npc.heading;
      const side = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)), fw = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
      const goal = new THREE.Vector3(t.x, t.y - 0.83, t.z).addScaledVector(side, d.off.x).addScaledVector(fw, d.off.z + Math.sin(this.t * 0.7 + d.phase) * 0.4);
      const prev = m.position.clone();
      m.position.lerp(goal, Math.min(1, dt * 4));
      const mv = m.position.clone().sub(prev);
      const sp = mv.length() / Math.max(dt, 1e-4);
      if (sp > 0.2) m.rotation.y = Math.atan2(mv.x, mv.z);
      m.visible = d.leash.visible = Math.hypot(cp.x - t.x, cp.z - t.z) < 140;
      d.phase += dt * (2 + sp * 4);
      for (const [i, l] of u.legs.entries()) l.rotation.x = Math.sin(d.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(0.7, sp * 0.4);
      u.tail.rotation.y = Math.sin(this.t * 10 + d.phase) * 0.6;
      // the lead, from their hand to the collar
      const hand = new THREE.Vector3(t.x, t.y - 0.05, t.z).addScaledVector(side, Math.sign(d.off.x) * 0.3);
      const collar = m.position.clone().add(new THREE.Vector3(0, 0.5 * m.scale.y, 0)).addScaledVector(new THREE.Vector3(Math.sin(m.rotation.y), 0, Math.cos(m.rotation.y)), 0.3 * m.scale.z);
      const a = d.leash.geometry.attributes.position; a.setXYZ(0, hand.x, hand.y, hand.z); a.setXYZ(1, collar.x, collar.y, collar.z); a.needsUpdate = true;
    }
  }
}
