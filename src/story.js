import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ITEM_BY_ID } from './items.js';
import { std } from './buildkit.js';
import { Mansion } from './mansion.js';

// The story: Wren Takavic, your oldest friend, was killed in the Verian Central bombing.
// The Ashen Hand cell did it. Work your way towards them one job at a time.

const KEY = 'physick.story.v1';

export const FRIEND = 'Wren Takavic';
export const FIXER = 'Vic';

// Story things you carry. They don't go in the bag: they can't be sold, dropped or confiscated.
export const KEY_ITEMS = {
  key: { name: 'Strange iron key', desc: 'Heavy and old, stamped with a pine tree and the letters "C.E.". It\'s cold to the touch.' },
  manifest: { name: 'Shipping manifest', desc: 'Crates through Saltmarsh dock marked "agricultural". Half of it is in some kind of code.' },
  ledger: { name: 'Wire-transfer ledger', desc: 'Payments routed through Halcyon Corp. The account names mean nothing to you. Yet.' },
  blueprint: { name: 'Torn blueprint', desc: 'Part of a floor plan, with a circle drawn round one room. You can\'t tell where it is from this piece.' },
};
const DOCS = ['manifest', 'ledger', 'blueprint'];

const INTRO = [
  `Three weeks ago a bomb went off at Verian Central. Eleven people died. One of them was <b>${FRIEND}</b>, the closest thing you ever had to family.`,
  'The police called it an "isolated incident". It wasn\'t. A cell calling itself <b>the Ashen Hand</b> did it, and they\'re still in Verian, still walking around.',
  `You can't touch them yet. You've got no money, no gear and no names. But Wren's cousin <b>${FIXER}</b> knows people, and people cost money.`,
];

export const MISSIONS = [
  {
    id: 'm1',
    title: 'Seed Money',
    brief: `${FIXER}: "You want names, you pay for names. Start small. The Mini Mart on the corner keeps a fat till. Take Wren's old pistol, empty the register, and don't lead the cops back to me."`,
    reward: 500,
    passText: `${FIXER}: "Good. Now listen: the week before the bombing, Wren kept asking questions about Scoops, the ice cream place. Closed for 'renovations' ever since, but the lights are on every night."`,
  },
  {
    id: 'm2',
    title: 'Sweet Tooth',
    requires: 'm1',
    brief: `${FIXER}: "Scoops Ice Cream. Wren wrote 'back room' on a napkin and underlined it twice. Break in and find out what they're hiding. Take something heavier than your fists."`,
    reward: 750,
    passText: `${FIXER}: "A pine tree and 'C.E.'… Cherry Estate. There's an old Cold War bunker up off the Pine Ridge trail. Nobody's been down there in forty years. Supposedly."`,
  },
  {
    id: 'm3',
    title: 'Down the Rabbit Hole',
    requires: 'm2',
    brief: `${FIXER}: "Take the key up to the bunker in Cherry Estate, off the Pine Ridge trail. Whatever it opens, bring back anything with writing on it."`,
    reward: 1000,
    passText: `${FIXER}: "Manifests, ledgers, blueprints… I can't read half of this. I need to find someone who can. Sit tight."`,
  },
  { id: 'm4', title: 'Coming soon', locked: true, brief: 'The documents need someone who can make sense of them. Vic\'s working on it.' },
];

export class Story {
  constructor(game) {
    this.game = game;
    this.state = { introSeen: false, passed: [], keyItems: [] };
    try { Object.assign(this.state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
    this.state.keyItems ||= [];
    // a save from before missions 2 and 3: the Courier "unlock" is gone, nothing to carry over
    delete this.state.unlocked;
    this.active = null;
    this.store = game.stores.list.find((s) => s.label === 'MINI MART') || game.stores.list.find((s) => s.theme === 'grocery');
    this.parlour = game.city.interiors.find((it) => it.name?.startsWith('SCOOPS'));
    this.mansion = new Mansion(game);
    this.buildBeacon();
    this.buildParlour();
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'fade';
    document.body.appendChild(this.fadeEl);
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage unavailable */ } }
  passed(id) { return this.state.passed.includes(id); }
  has(id) { return this.state.keyItems.includes(id); }
  giveKeyItem(id) {
    if (!this.has(id)) this.state.keyItems.push(id);
    this.save();
    this.game.sfx.play('freeze');
    this.game.hud.toast(`Key item: ${KEY_ITEMS[id].name}`, 0xffd166);
  }
  unlocked(m) { return !m.locked && (!m.requires || this.passed(m.requires)); }

  get underground() { return this.mansion.built && this.mansion.inside(this.game.shorePlayer.body.translation()); }

  // Nobody's calling the police from in here.
  quietZone(pos) {
    if (this.mansion.built && this.mansion.inside(pos)) return true;
    const a = this.active;
    return !!(a?.id === 'm2' && a.fighting && this.parlour && this.inRoom(this.parlour, pos, 1));
  }

  inRoom(it, p, margin = 0.5) {
    const r = it.room;
    const v = new THREE.Vector3(p.x - r.center.x, 0, p.z - r.center.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -r.yaw);
    return Math.abs(v.x) < r.hw + margin && Math.abs(v.z) < r.hd + margin && Math.abs(p.y - r.center.y - 1) < 3;
  }

  roomPoint(it, lx, lz) {
    const r = it.room;
    return new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), r.yaw).add(r.center);
  }

  fade(mid) {
    const el = this.fadeEl;
    el.classList.add('on');
    setTimeout(() => { mid(); setTimeout(() => el.classList.remove('on'), 250); }, 450);
  }

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
    this.beacon = g;
    this.beam = beam;
    this.arrow = arrow;
    this.game.scene.add(g);
  }

  get waypoint() { return this.active?.wp || null; }

  // ---------------------------------------------------------------- Scoops: shutter, freezers, the key
  buildParlour() {
    const it = this.parlour;
    if (!it) return;
    const g = this.game, sb = g.portSandbox, dw = it.doorway;
    const out = new THREE.Vector3(Math.sin(dw.yaw), 0, Math.cos(dw.yaw));
    // a roller shutter pulled down over the door, with a CLOSED notice
    const shutT = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 160;
      const x = c.getContext('2d');
      x.fillStyle = '#9aa0a6'; x.fillRect(0, 0, 128, 160);
      for (let y = 0; y < 160; y += 8) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, y, 128, 2); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, y + 2, 128, 1); }
      x.fillStyle = '#fff'; x.fillRect(24, 64, 80, 26); x.fillStyle = '#b3261e'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.fillText('CLOSED', 64, 84);
      return c;
    })());
    shutT.colorSpace = THREE.SRGBColorSpace;
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(dw.w + 0.2, dw.h, 0.08), std({ map: shutT, roughness: 0.5, metalness: 0.5 }));
    shutter.position.copy(dw.pos).addScaledVector(out, 0.3);
    shutter.position.y += dw.h / 2;
    shutter.rotation.y = dw.yaw;
    shutter.castShadow = true;
    g.scene.add(shutter);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dw.yaw);
    const col = sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((dw.w + 0.2) / 2, dw.h / 2, 0.1).setTranslation(shutter.position.x, shutter.position.y, shutter.position.z).setRotation(q));
    this.shutter = { mesh: shutter, col, front: dw.pos.clone().addScaledVector(out, 1.4) };
    // freezers of ice cream tubs behind the counter
    const r = it.room, d = r.hd * 2, w = r.hw * 2;
    const cz = -d / 2 + 0.3 + 2;
    const tubCols = [0xf6d3e0, 0xf3e6c4, 0x6b3f2a, 0xbfe6c8, 0xf7c46a, 0xc9a7e8];
    const glass = std({ color: 0xd8f0ff, transparent: true, opacity: 0.35, roughness: 0.1 });
    for (const s of [-1, 1]) {
      const p = this.roomPoint(it, s * (w / 4), cz - 1.2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.9), std({ color: 0xf3f3f0, roughness: 0.4 }));
      body.position.set(p.x, r.center.y + 0.45, p.z); body.rotation.y = r.yaw;
      const top = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 0.9), glass);
      top.position.set(p.x, r.center.y + 0.92, p.z); top.rotation.y = r.yaw;
      g.scene.add(body, top);
      for (let k = 0; k < 6; k++) {
        const tp = this.roomPoint(it, s * (w / 4) - 1.2 + k * 0.48, cz - 1.2);
        const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.12, 12), std({ color: tubCols[k], roughness: 0.8 }));
        tub.position.set(tp.x, r.center.y + 0.86, tp.z);
        g.scene.add(tub);
      }
    }
    // a giant fibreglass cone by the door
    const cp = this.roomPoint(it, w / 2 - 1.2, d / 2 - 1.5);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 14), std({ color: 0xd9a35a, roughness: 0.8 }));
    cone.rotation.x = Math.PI; cone.position.set(cp.x, r.center.y + 0.7, cp.z);
    const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), std({ color: 0xf6b6cf, roughness: 0.7 }));
    scoop.position.set(cp.x, r.center.y + 1.6, cp.z);
    g.scene.add(cone, scoop);
    // the key, waiting to be found
    const key = new THREE.Group();
    const gold = std({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.6 });
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 16), gold);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.26), gold); shaft.position.z = 0.19;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.05), gold); bit.position.set(0, -0.04, 0.29);
    key.add(bow, shaft, bit);
    key.visible = false;
    g.scene.add(key);
    this.keyMesh = key;
    this.keyPos = this.roomPoint(it, 0, cz);
    this.keyPos.y = r.center.y + 1.25;
    key.position.copy(this.keyPos);
  }

  setShutter(closed) {
    if (!this.shutter) return;
    this.shutter.mesh.visible = closed;
    this.shutter.col.setEnabled(closed);
  }

  // ---------------------------------------------------------------- mascots
  dressMascot(n, boss) {
    const flavours = [0xf6b6cf, 0xf3e6c4, 0x7a4a30, 0xbfe6c8, 0xc9a7e8];
    const head = n.fig.parts.head;
    const col = boss ? 0xf26a8d : flavours[Math.floor(Math.random() * flavours.length)];
    const m = std({ color: col, roughness: 0.75 });
    const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), m);
    scoop.position.y = 0.1;
    const drip = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 20), m);
    drip.rotation.x = Math.PI / 2; drip.position.y = -0.04;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 14), std({ color: 0xd9a35a, roughness: 0.85 }));
    cone.rotation.x = Math.PI; cone.position.y = -0.28;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), white); ew.position.set(s * 0.12, 0.17, 0.29);
      const ep = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), eyeM); ep.position.set(s * 0.12, 0.17, 0.355);
      head.add(ew, ep);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 16, Math.PI), eyeM);
    smile.rotation.z = Math.PI; smile.position.set(0, 0.06, 0.32);
    const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std({ color: 0xc0182b, roughness: 0.3 }));
    cherry.position.y = 0.46;
    head.add(scoop, drip, cone, smile, cherry);
    head.material = head.material.clone(); head.material.visible = false; // the costume covers their face
    if (boss) { n.fig.root.scale.setScalar(1.4); n.hp = 420; n.boss = true; } else n.hp = 75;
    n.cash = boss ? 400 : 20 + Math.floor(Math.random() * 40);
    n.items = [];
    n.heading = Math.random() * Math.PI * 2;
  }

  spawnWave(a) {
    const g = this.game, it = this.parlour, r = it.room;
    const counts = [3, 4, 5];
    const n = counts[a.wave];
    const pp = g.shorePlayer.body.translation();
    for (let k = 0; k < n; k++) {
      const boss = a.wave === 2 && k === 0;
      let p = null;
      for (let tries = 0; tries < 12; tries++) {
        const q = this.roomPoint(it, (Math.random() * 2 - 1) * (r.hw - 4), -r.hd + 4.5 + Math.random() * (r.hd * 0.9));
        if (Math.hypot(q.x - pp.x, q.z - pp.z) > 3.5) { p = q; break; }
      }
      p ||= this.roomPoint(it, 0, -r.hd + 4.5);
      p.y = r.center.y;
      const npc = g.citizens.spawnCitizen('city', 'mascot', p, { look: { shirt: 0xf3e6c4, pants: 0xf6b6cf, skin: 0xf1c9a5 } });
      if (!npc) continue;
      this.dressMascot(npc, boss);
      a.mascots.push(npc);
    }
    g.sfx.play('scream');
    const lines = ['Something big and pink comes waddling out of the back room…', 'More of them! Who hires this many mascots?', 'The Big Scoop himself. Of course.'];
    g.hud.toast(lines[a.wave], 0xffd166);
    g.hud.flashBanner(`WAVE ${a.wave + 1}`, '#f6b6cf');
  }

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
    e.open('For Wren', html, (body) => body.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b) return;
      e.close();
      if (b.dataset.a === 'start') this.start('m1');
    }));
  }

  keyItemsHtml() {
    if (!this.state.keyItems.length) return '';
    return `<h3 class="kih">Key items</h3>${this.state.keyItems.map((id) => `<div class="erow key"><div><b>${KEY_ITEMS[id].name}</b><small>${KEY_ITEMS[id].desc}</small></div></div>`).join('')}`;
  }

  openJournal() {
    const e = this.game.economy;
    const missions = MISSIONS.map((m, i) => {
      const done = this.passed(m.id), on = this.active?.id === m.id, open = this.unlocked(m);
      const status = done ? '<em class="ok">Passed</em>' : on ? '<em class="on">In progress</em>' : !open ? '<em>Locked</em>' : '';
      const btn = !open || on ? '' : `<button data-a="start" data-id="${m.id}">${done ? 'Replay' : 'Start'}</button>`;
      return `<div class="erow"><div><b>${i + 1}. ${m.title}</b><small>${open || done ? m.brief : m.locked ? m.brief : `Finish "${MISSIONS.find((x) => x.id === m.requires).title}" first.`}</small></div><div class="btns">${status}${btn}</div></div>`;
    }).join('');
    const html = `<div class="story">
      <p class="lede">${FRIEND} is dead. The Ashen Hand did it. Find them.</p>
      <h3>Missions</h3>${missions}
      ${this.active ? '<div class="btns"><button data-a="abandon" class="ghost">Abandon current mission</button></div>' : ''}
      ${this.keyItemsHtml()}
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
    if (!m || !this.unlocked(m)) return;
    const a = (this.active = { id, m, t: 0 });
    const hasGun = g.held?.gun || g.economy.bag.some((x) => ITEM_BY_ID[x]?.gun);
    if (id === 'm1') {
      const st = this.store;
      st.robbedAt = -1e9;
      st.angry = 0;
      if (!g.stores.clerkOK(st)) g.stores.spawnClerk(st);
      a.robbed = false;
      if (!hasGun) { g.giveItem(ITEM_BY_ID.pistol); g.hud.toast(`${FIXER} gave you Wren's old pistol`, 0xffd166); }
      if ((g.economy.ammo.pistolAmmo || 0) < 24) g.economy.addAmmo('pistolAmmo', 24);
    }
    if (id === 'm2') {
      this.setShutter(true);
      this.keyMesh.visible = false;
      Object.assign(a, { stage: 'shutter', wave: -1, mascots: [], waveT: 0 });
      if (!hasGun) { g.giveItem(ITEM_BY_ID.pistol); g.hud.toast(`${FIXER} gave you Wren's old pistol`, 0xffd166); }
      if ((g.economy.ammo.pistolAmmo || 0) < 40) g.economy.addAmmo('pistolAmmo', 40);
    }
    if (id === 'm3') {
      Object.assign(a, { stage: 'bunker', found: [] });
      if (!this.has('key')) this.state.keyItems.push('key');
      this.mansion.build();
      for (const d of this.mansion.docSpots) d.mesh.visible = true;
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
    if (a.mascots) for (const n of a.mascots) if (g.citizens.list.includes(n)) g.citizens.despawn(n);
    if (pass) {
      if (!this.passed(a.id)) this.state.passed.push(a.id);
      this.save();
      g.hud.flashBanner('MISSION PASSED', '#7be08a');
      g.sfx.play('cash');
      if (a.m.reward) g.economy.addMoney(a.m.reward, `from ${FIXER}`);
      if (a.m.passText) setTimeout(() => g.hud.toast(a.m.passText, 0xffd166), 1800);
      const next = MISSIONS[MISSIONS.indexOf(a.m) + 1];
      if (next && this.unlocked(next)) setTimeout(() => g.hud.toast(`New mission: ${next.title} — press J`, 0x9ec5ff), 5200);
    } else if (msg) {
      g.hud.flashBanner('MISSION FAILED', '#ff6a5a');
      g.hud.toast(`${msg} — press J to retry`, 0xff8a6a);
    }
  }

  onBusted() { if (this.active) this.end(false, 'You got busted'); }

  // E-key actions the story adds to the world.
  action(pos) {
    const g = this.game, a = this.active;
    const near = (p, r) => p && Math.hypot(p.x - pos.x, p.z - pos.z) < r && Math.abs(p.y - pos.y) < 3;
    if (a?.id === 'm2' && a.stage === 'shutter' && near(this.shutter.front, 3)) {
      return { label: 'Force the shutter open', run: () => {
        this.setShutter(false); g.sfx.play('crash'); g.shake = 1;
        g.hud.toast('The shutter gives with a screech. It\'s dark inside, and it smells like vanilla.', 0xffd166);
        a.stage = 'enter';
      } };
    }
    if (a?.id === 'm2' && a.stage === 'key' && near(this.keyPos, 2.4)) {
      return { label: 'Take the strange key', run: () => {
        this.keyMesh.visible = false;
        this.giveKeyItem('key');
        g.hud.toast(KEY_ITEMS.key.desc, 0xe8e2d4);
        this.end(true);
      } };
    }
    const bk = g.park.bunker;
    if (bk && near(bk.door, 2.6) && !this.underground) {
      if (!this.has('key')) return { label: 'Try the bunker door (locked)', run: () => g.hud.toast('Locked tight. There\'s an old-fashioned keyhole under the rust.') };
      return { label: 'Unlock the bunker with the strange key', run: () => this.goDown() };
    }
    if (this.underground) {
      if (near(this.mansion.exit, 2.4)) return { label: 'Climb back up to the surface', run: () => this.goUp() };
      if (a?.id === 'm3') {
        const d = this.mansion.docSpots.find((s) => s.mesh.visible && near(s.pos, 2));
        if (d) {
          const id = DOCS[this.mansion.docSpots.indexOf(d)];
          return { label: `Take the ${KEY_ITEMS[id].name.toLowerCase()}`, run: () => {
            d.mesh.visible = false;
            if (!a.found.includes(id)) a.found.push(id);
            this.giveKeyItem(id);
            g.hud.toast(`${KEY_ITEMS[id].desc} No use to you yet.`, 0xe8e2d4);
          } };
        }
      }
    }
    return null;
  }

  goDown() {
    const g = this.game;
    this.mansion.build();
    this.fade(() => {
      g.placeOnShore(this.mansion.entry, 0);
      g.sfx.play('thud');
      g.cullFar();
      if (this.active?.id === 'm3' && this.active.stage === 'bunker') {
        this.active.stage = 'search';
        g.hud.toast('Stairs. A lot of stairs. And at the bottom… wallpaper?', 0xffd166);
      }
    });
  }

  goUp() {
    const g = this.game, bk = g.park.bunker;
    this.fade(() => {
      g.placeOnShore(new THREE.Vector3(bk.out.x, bk.out.y + 1, bk.out.z), bk.yaw);
      g.cullFar();
      const a = this.active;
      if (a?.id === 'm3' && a.found.length >= DOCS.length) this.end(true);
    });
  }

  update(dt) {
    const a = this.active;
    const g = this.game;
    if (this.keyMesh?.visible) this.keyMesh.rotation.y += dt * 1.5;
    if (!a) { this.beacon.visible = false; return; }
    a.t += dt;
    if (g.health.dead) { this.end(false, 'You died'); return; }
    const p = g.shorePlayer.body.translation();
    if (a.id === 'm1') this.updateM1(a, p, dt);
    if (a.id === 'm2') this.updateM2(a, p, dt);
    if (a.id === 'm3') this.updateM3(a, p, dt);
    if (!this.active) return;
    const wp = a.wp;
    const d = wp ? Math.hypot(wp.x - p.x, wp.z - p.z) : 0;
    this.beacon.visible = !!wp && d > 4 && !this.underground;
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
      if (!inside) { a.text = 'Go to the Mini Mart'; a.wp = st.it.door.clone(); }
      else if (!g.held?.gun) { a.text = 'Get the pistol out (Tab → Hold)'; a.wp = null; }
      else { a.text = 'Point the gun at the clerk: <kbd>R</kbd> at the counter to empty the till'; a.wp = st.it.counter.clone(); }
      return;
    }
    a.wp = null;
    const w = g.police.wanted;
    if (w > 0) { a.hadHeat = true; a.text = `Lose the cops (${'★'.repeat(w)})`; a.calm = 0; return; }
    const far = Math.hypot(st.it.door.x - p.x, st.it.door.z - p.z) > 60;
    if (!far) { a.text = 'Get away from the Mini Mart'; a.calm = 0; return; }
    if (!a.hadHeat && g.time - a.robT < 8) { a.text = 'Get away from the Mini Mart'; return; }
    a.calm = (a.calm || 0) + dt;
    a.text = 'Lie low…';
    if (a.calm > 3) this.end(true);
  }

  updateM2(a, p, dt) {
    const g = this.game, it = this.parlour;
    if (a.stage === 'shutter') { a.text = 'Break into Scoops Ice Cream: <kbd>E</kbd> at the shutter'; a.wp = this.shutter.front.clone(); return; }
    if (a.stage === 'enter') {
      a.text = 'Go inside';
      a.wp = it.inside.clone();
      if (this.inRoom(it, p, -1)) { a.stage = 'fight'; a.fighting = true; a.wave = -1; a.waveT = 1.5; }
      return;
    }
    if (a.stage === 'fight') {
      a.wp = null;
      a.mascots = a.mascots.filter((n) => g.citizens.list.includes(n));
      if (!a.mascots.length) {
        if (a.wave >= 2) {
          a.stage = 'key'; a.fighting = false;
          this.keyMesh.visible = true;
          g.hud.toast('Quiet. Behind the counter, under a tub of rocky road, something glints.', 0xffd166);
          return;
        }
        a.text = a.wave < 0 ? 'Look around…' : 'Catch your breath…';
        a.waveT -= dt;
        if (a.waveT <= 0) { a.wave++; a.waveT = 3; this.spawnWave(a); }
        return;
      }
      a.text = `Fight off the mascots: wave ${a.wave + 1}/3 · ${a.mascots.length} left`;
      return;
    }
    if (a.stage === 'key') { a.text = 'Take whatever\'s glinting behind the counter'; a.wp = this.keyPos.clone(); a.wp.y = it.room.center.y; }
  }

  updateM3(a, p) {
    const g = this.game, bk = g.park.bunker;
    if (a.stage === 'bunker') {
      a.text = 'Find the bunker in Cherry Estate, off the Pine Ridge trail';
      a.wp = bk.door.clone();
      if (this.underground) a.stage = 'search';
      return;
    }
    a.wp = null;
    if (a.found.length < DOCS.length) {
      a.text = this.underground ? `Search the house for papers: look for lit desks (${a.found.length}/${DOCS.length})` : 'Go back down the bunker';
      if (!this.underground) a.wp = bk.door.clone();
      return;
    }
    a.text = this.underground ? 'Get back to the surface (the stairs where you came in)' : 'Get clear of the bunker';
    if (!this.underground) this.end(true);
  }
}
