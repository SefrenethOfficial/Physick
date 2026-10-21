import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';

// The story: Eli Navarro, your oldest friend, was killed in the Verian Central bombing.
// The Ashen Hand cell did it. Work your way up to them one job at a time; every mission
// you finish opens up intel and, eventually, a bounty on one of their heads.

const KEY = 'physick.story.v1';

export const FRIEND = 'Eli Navarro';
export const FIXER = 'Vic';

export const TARGETS = [
  { id: 'courier', alias: 'The Courier', name: 'Rafe Doucet', bounty: 5000, role: 'Moved the bomb parts into the city through Saltmarsh dock.', unlock: 'Mission 2' },
  { id: 'chemist', alias: 'The Chemist', name: 'Ines Valk', bounty: 12000, role: 'Built the device. Hides out somewhere in the Hollows.', unlock: 'Mission 3' },
  { id: 'banker', alias: 'The Banker', name: 'Saul Brenner', bounty: 20000, role: 'Launders the cell\'s money through a Verian City front.', unlock: 'Mission 4' },
  { id: 'gunner', alias: 'The Gunner', name: 'Tomas Kroll', bounty: 30000, role: 'Their muscle. Ex-military, never alone.', unlock: 'Mission 5' },
  { id: 'architect', alias: 'The Architect', name: 'Unknown', bounty: 100000, role: 'Planned Verian Central. Nobody has seen their face.', unlock: 'The finale' },
];

const INTRO = [
  `Three weeks ago a bomb went off at Verian Central. Eleven people died. One of them was <b>${FRIEND}</b>, the closest thing you ever had to a brother.`,
  'The police called it an "isolated incident". It wasn\'t. A cell calling itself <b>the Ashen Hand</b> did it, and they\'re still in Verian, still walking around.',
  `You can't touch them yet. You've got no money, no gear and no names. But Eli's cousin <b>${FIXER}</b> knows people, and people cost money.`,
];

export const MISSIONS = [
  {
    id: 'm1',
    title: 'Seed Money',
    brief: `${FIXER}: "You want names, you pay for names. Start small. The Mini Mart on the corner keeps a fat till. Take Eli's old pistol, empty the register, and don't lead the cops back to me."`,
    reward: 500,
    passText: `${FIXER}: "Not bad. That'll buy us a conversation with the right people. I'll be in touch about the Courier."`,
  },
  { id: 'm2', title: 'The Courier', locked: true, brief: 'Coming soon: track Rafe Doucet through Saltmarsh dock.' },
  { id: 'm3', title: 'Bad Chemistry', locked: true, brief: 'Coming soon: find the Chemist\'s lab in the Hollows.' },
];

export class Story {
  constructor(game) {
    this.game = game;
    this.state = { introSeen: false, passed: [], unlocked: [] };
    try { Object.assign(this.state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
    this.active = null; // { id, step, t, ... }
    this.store = game.stores.list.find((s) => s.label === 'MINI MART') || game.stores.list.find((s) => s.theme === 'grocery');
    this.buildBeacon();
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage unavailable */ } }

  passed(id) { return this.state.passed.includes(id); }

  // ---------------------------------------------------------------- the waypoint beacon
  buildBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 60, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 30;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, fog: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0xffd166, fog: false }));
    arrow.rotation.x = Math.PI;
    arrow.position.y = 3;
    g.add(beam, ring, arrow);
    g.visible = false;
    g.renderOrder = 5;
    this.beacon = g;
    this.beam = beam;
    this.arrow = arrow;
    this.game.scene.add(g);
  }

  get waypoint() { return this.active?.wp || null; }

  // ---------------------------------------------------------------- panels
  showIntro() {
    const g = this.game, e = g.economy;
    const html = `<div class="story">
      ${INTRO.map((p) => `<p>${p}</p>`).join('')}
      <div class="brief"><small>Mission 1 · ${MISSIONS[0].title}</small><p>${MISSIONS[0].brief}</p></div>
      <div class="btns"><button data-a="start">Start mission</button><button data-a="later" class="ghost">Later (J for the story)</button></div>
    </div>`;
    this.state.introSeen = true;
    this.save();
    e.open('For Eli', html, (body) => body.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b) return;
      e.close();
      if (b.dataset.a === 'start') this.start('m1');
    }));
  }

  openJournal() {
    const g = this.game, e = g.economy;
    const missions = MISSIONS.map((m, i) => {
      const done = this.passed(m.id), on = this.active?.id === m.id;
      const status = done ? '<em class="ok">Passed</em>' : on ? '<em class="on">In progress</em>' : m.locked ? '<em>Locked</em>' : '';
      const btn = m.locked || on ? '' : `<button data-a="start" data-id="${m.id}">${done ? 'Replay' : 'Start'}</button>`;
      return `<div class="erow"><div><b>${i + 1}. ${m.title}</b><small>${m.brief}</small></div><div class="btns">${status}${btn}</div></div>`;
    }).join('');
    const targets = TARGETS.map((t) => {
      const known = this.state.unlocked.includes(t.id);
      return `<div class="target ${known ? 'known' : ''}">
        <div class="mug">${known ? t.alias.split(' ')[1][0] : '?'}</div>
        <div><b>${t.alias}</b><small>${known ? `${t.name} · ${t.role}` : `Unlocked by ${t.unlock}`}</small></div>
        <div class="bounty">$${t.bounty.toLocaleString()}</div></div>`;
    }).join('');
    const html = `<div class="story">
      <p class="lede">${FRIEND} is dead. The Ashen Hand did it. Take them apart, one bounty at a time.</p>
      <h3>Missions</h3>${missions}
      ${this.active ? '<div class="btns"><button data-a="abandon" class="ghost">Abandon current mission</button></div>' : ''}
      <h3>The Ashen Hand · bounties</h3><div class="targets">${targets}</div>
    </div>`;
    e.open('Story', html, (body) => body.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b) return;
      if (b.dataset.a === 'start') { e.close(); this.start(b.dataset.id); }
      if (b.dataset.a === 'abandon') { this.end(false, 'Mission abandoned'); this.openJournal(); }
    }));
  }

  // ---------------------------------------------------------------- running a mission
  start(id) {
    const g = this.game;
    if (this.active) this.end(false, null);
    const m = MISSIONS.find((x) => x.id === id);
    if (!m || m.locked) return;
    if (id === 'm1') {
      const st = this.store;
      st.robbedAt = -1e9; // the till's full again
      st.angry = 0;
      if (!g.stores.clerkOK(st)) g.stores.spawnClerk(st);
      this.active = { id, m, step: 'gun', t: 0, robbed: false };
      // Eli's old pistol, if you haven't got a gun of your own
      const hasGun = g.held?.gun || g.economy.bag.some((x) => ITEM_BY_ID[x]?.gun);
      if (!hasGun) { g.giveItem(ITEM_BY_ID.pistol); g.hud.toast(`${FIXER} gave you Eli's old pistol`, 0xffd166); }
      if ((g.economy.ammo.pistolAmmo || 0) < 24) g.economy.addAmmo('pistolAmmo', 24);
    }
    g.hud.flashBanner(m.title.toUpperCase(), '#ffd166');
    this.update(0);
  }

  end(pass, msg) {
    const g = this.game, a = this.active;
    if (!a) return;
    this.active = null;
    this.beacon.visible = false;
    g.hud.setObjective(null);
    if (pass) {
      if (!this.passed(a.id)) this.state.passed.push(a.id);
      if (a.id === 'm1' && !this.state.unlocked.includes('courier')) this.state.unlocked.push('courier');
      this.save();
      g.hud.flashBanner('MISSION PASSED', '#7be08a');
      g.sfx.play('cash');
      if (a.m.reward) g.economy.addMoney(a.m.reward, `from ${FIXER}`);
      if (a.m.passText) setTimeout(() => g.hud.toast(a.m.passText, 0xffd166), 1800);
      setTimeout(() => g.hud.toast('New target on the bounty board: The Courier — press J', 0x9ec5ff), 4200);
    } else if (msg) {
      g.hud.flashBanner('MISSION FAILED', '#ff6a5a');
      g.hud.toast(`${msg} — press J to retry`, 0xff8a6a);
    }
  }

  onBusted() { if (this.active) this.end(false, 'You got busted'); }

  update(dt) {
    const a = this.active;
    if (!a) { this.beacon.visible = false; return; }
    const g = this.game;
    a.t += dt;
    if (g.health.dead) { this.end(false, 'You died'); return; }
    const p = g.shorePlayer.body.translation();
    if (a.id === 'm1') this.updateM1(a, p, dt);
    if (!this.active) return;
    // beacon on the waypoint
    const wp = a.wp;
    const d = wp ? Math.hypot(wp.x - p.x, wp.z - p.z) : 0;
    this.beacon.visible = !!wp && d > 4;
    if (wp) {
      this.beacon.position.set(wp.x, wp.y, wp.z);
      this.arrow.position.y = 3 + Math.sin(g.time * 3) * 0.25;
      this.arrow.rotation.y += dt * 2;
      this.beam.material.opacity = Math.min(0.28, 0.06 + d / 400);
    }
    g.hud.setObjective({ title: a.m.title, text: a.text, dist: wp && d > 6 ? Math.round(d) : null });
  }

  updateM1(a, p, dt) {
    const g = this.game, st = this.store, S = g.stores;
    const inside = S.contains(st, p);
    if (!a.robbed && !S.clerkOK(st)) { this.end(false, 'The clerk is gone — nobody to open the till'); return; }
    if (!a.robbed && st.robbedAt > 0 && g.time - st.robbedAt < 5) { a.robbed = true; a.robT = g.time; }
    if (!a.robbed) {
      const gunInHand = !!g.held?.gun;
      if (!inside) {
        a.step = 'goto';
        a.text = 'Go to the Mini Mart';
        a.wp = st.it.door.clone();
      } else if (!gunInHand) {
        a.step = 'arm';
        a.text = 'Get the pistol out (Tab → Hold)';
        a.wp = null;
      } else {
        a.step = 'rob';
        a.text = 'Point the gun at the clerk: <kbd>R</kbd> at the counter to empty the till';
        a.wp = st.it.counter.clone();
      }
      return;
    }
    // got the money: now shake the heat
    a.wp = null;
    const w = g.police.wanted;
    if (w > 0) { a.hadHeat = true; a.text = `Lose the cops (${'★'.repeat(w)})`; a.calm = 0; return; }
    const far = Math.hypot(st.it.door.x - p.x, st.it.door.z - p.z) > 60;
    if (!far) { a.text = 'Get away from the Mini Mart'; a.calm = 0; return; }
    if (!a.hadHeat && g.time - a.robT < 8) { a.text = 'Get away from the Mini Mart'; return; } // the call hasn't come in yet
    a.calm = (a.calm || 0) + dt;
    a.text = 'Lie low…';
    if (a.calm > 3) this.end(true);
  }
}
