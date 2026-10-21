import * as THREE from 'three';
import { LAND_Y } from './world.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { ITEM_BY_ID } from './items.js';
import { std } from './buildkit.js';
import { Mansion } from './mansion.js';
import { Phone } from './phone.js';
import { Heli, SHIP } from './cargo.js';
import { ElMonstruo, CARS_TOTAL, MAX_ALIVE } from './elmonstruo.js';

// The story: Wren Takavic, your oldest friend, was killed in the Verian Central bombing.
// The Ashen Hand cell did it. Work your way towards them one job at a time.

const KEY = 'physick.story.v1';

export const FRIEND = 'Wren Takavic';
export const FIXER = 'Vic';

// Story things you carry. They don't go in the bag: they can't be sold, dropped or confiscated.
export const KEY_ITEMS = {
  key: { name: 'Strange iron key', desc: 'Heavy and old, stamped with a pine tree and the letters "C.E.". It\'s cold to the touch.' },
  manifest: { name: 'Shipping manifest', desc: 'Crates through Saltmarsh dock marked "agricultural". Half of it is in some kind of code.' },
  blueprint: { name: 'Torn blueprint', desc: 'Part of a floor plan, with a circle drawn round one room. You can\'t tell where it is from this piece.' },
};
const DOCS = ['manifest', 'blueprint'];

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
    passText: `${FIXER}: "A manifest and half a blueprint… I can\'t read this. I know someone who can. I\'ll call you."`,
  },
  {
    id: 'm4',
    title: 'Dead Cargo',
    requires: 'm3',
    brief: `${FIXER}: "My guy read the blueprint. It's a bomb, and the circled room is Verian Central Square. They're doing it again. The manifest says the parts came in on the MV Halvard, tied up off Saltmarsh's west pier. Get aboard and put every piece of it in the sea."`,
    reward: 2500,
    passText: `${FIXER}: "You're alive and the bomb's in the harbour. Wren would've liked that. Get some sleep. This isn't over."`,
  },
  {
    id: 'm5',
    title: 'El Monstruo',
    requires: 'm4',
    act: 1,
    brief: `${FIXER}: "Rafe Doucet. The Courier. He brought the bomb in, and tonight he's moving to the Hollows. His driver had an accident. You're his driver now. The truck's at Dockside Motors by Saltmarsh's fishing dock: a monster truck they call El Monstruo. Don't touch him while his men are in the cab, or they'll kill you. Wait till they leave. Then get rid of the truck at the new scrapyard on Verian docks."`,
    reward: 5000,
    passText: `${FIXER}: "That's one of them. The Courier's done, the bomb's in the sea and El Monstruo's a pancake. Wren, that's for you."`,
  },
  { id: 'm6', title: 'Act II: coming soon', locked: true, brief: 'The Ashen Hand know your face now. Vic says lie low. For now.' },
];

export class Story {
  constructor(game) {
    this.game = game;
    this.state = { introSeen: false, passed: [], keyItems: [] };
    try { Object.assign(this.state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
    this.state.keyItems = (this.state.keyItems || []).filter((id) => KEY_ITEMS[id]);
    // a save from before missions 2 and 3: the Courier "unlock" is gone, nothing to carry over
    delete this.state.unlocked;
    this.active = null;
    this.store = game.stores.list.find((s) => s.label === 'MINI MART') || game.stores.list.find((s) => s.theme === 'grocery');
    this.parlour = game.city.interiors.find((it) => it.name?.startsWith('SCOOPS'));
    this.mansion = new Mansion(game);
    this.buildBeacon();
    this.buildParlour();
    this.phone = new Phone(game);
    this.heli = new Heli(game);
    this.monstruo = new ElMonstruo(game);
    // Vic's texts: the brief for every job you've been given so far
    if (!this.state.messages) {
      this.state.messages = [];
      for (const m of MISSIONS) if (this.state.introSeen && this.unlocked(m)) this.state.messages.push({ from: FIXER, text: m.brief.replace(`${FIXER}: `, '') });
    }
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
  keyItem(id) { return KEY_ITEMS[id]; }

  missionList() {
    return MISSIONS.map((m, i) => {
      const state = this.active?.id === m.id ? 'active' : this.passed(m.id) ? 'passed' : this.unlocked(m) ? 'ready' : 'locked';
      return { id: m.id, n: i + 1, title: m.title, state, canStart: state !== 'locked' && state !== 'active', lockText: m.locked ? m.brief : `Finish "${MISSIONS.find((x) => x.id === m.requires)?.title}" first` };
    });
  }

  unlocked(m) { return !m.locked && (!m.requires || this.passed(m.requires)); }

  get underground() { return this.mansion.built && this.mansion.inside(this.game.shorePlayer.body.translation()); }

  // Nobody's calling the police from in here.
  quietZone(pos) {
    if (this.mansion.built && this.mansion.inside(pos)) return true;
    if (this.game.cargo?.onDeck(pos, 2)) return true;
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
    if (!this.state.messages.length) this.phone.text(FIXER, MISSIONS[0].brief.replace(`${FIXER}: `, ''), true);
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

  openJournal() { this.phone.open('missions'); }

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
    if (id === 'm5') {
      const M = this.monstruo;
      M.clearEnemies(); M.clearCrew();
      M.spawnTruck(); M.spawnCrew();
      M.spawned = 0;
      Object.assign(a, { stage: 'garage', destroyed: 0, carsDone: false, chopT: 18, spawnT: 0, chopSpawned: 0 });
      if (!hasGun) { g.giveItem(ITEM_BY_ID.pistol); g.hud.toast(`${FIXER} left you a pistol`, 0xffd166); }
      if ((g.economy.ammo.pistolAmmo || 0) < 24) g.economy.addAmmo('pistolAmmo', 24);
    }
    if (id === 'm4') {
      Object.assign(a, { stage: 'board', goons: [], parts: [], sunk: 0, alert: false, reinfT: 0 });
      if (!hasGun) { g.giveItem(ITEM_BY_ID.pistol); g.hud.toast(`${FIXER} left you a pistol`, 0xffd166); }
      if ((g.economy.ammo.pistolAmmo || 0) < 60) g.economy.addAmmo('pistolAmmo', 60);
      if ((g.economy.ammo.smgAmmo || 0) < 90) g.economy.addAmmo('smgAmmo', 90);
      if (!g.held?.gun && !g.economy.bag.includes('smg')) { g.economy.stash(ITEM_BY_ID.smg, true); g.hud.toast(`${FIXER} put an SMG in your bag`, 0xffd166); }
      this.setupShip(a);
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
    if (a.goons) for (const n of a.goons) if (g.citizens.list.includes(n)) g.citizens.despawn(n);
    if (a.id === 'm5') {
      const M = this.monstruo;
      M.clearEnemies(); M.clearCrew();
      if (!pass) M.removeTruck();
      M.plate.position.y = LAND_Y + 8.2;
    }
    if (a.id === 'm4') {
      for (const p of [...g.portSandbox.props]) if (p.def.bombPart) g.portSandbox.remove(p);
      if (g.held?.bombPart) g.clearHand?.();
      this.heli.hide();
      if (this.phone.call) { this.phone.call = null; this.phone.ringEl.classList.remove('on'); }
    }
    if (pass) {
      if (!this.passed(a.id)) this.state.passed.push(a.id);
      this.save();
      g.hud.flashBanner('MISSION PASSED', '#7be08a');
      g.sfx.play('cash');
      if (a.m.reward) g.economy.addMoney(a.m.reward, `from ${FIXER}`);
      if (a.m.passText) setTimeout(() => g.hud.toast(a.m.passText, 0xffd166), 1800);
      if (a.m.act) setTimeout(() => this.actComplete(a.m.act), 3500);
      const next = MISSIONS[MISSIONS.indexOf(a.m) + 1];
      if (next && this.unlocked(next) && !this.state.messages.some((x) => x.text === next.brief.replace(`${FIXER}: `, ''))) setTimeout(() => this.phone.text(FIXER, next.brief.replace(`${FIXER}: `, '')), 6000);
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
    const cg = g.cargo;
    if (cg && a?.id === 'm4') {
      if (near(cg.ladderFoot, 2.6)) return { label: 'Climb the ladder aboard the Halvard', run: () => this.fade(() => { g.placeOnShore(cg.ladderTop.clone().setY(cg.ladderTop.y + 1), Math.PI / 2); g.cullFar(); }) };
      if (near(cg.ladderTop, 1.8) && a.stage !== 'extract') return { label: 'Climb down to the pier', run: () => this.fade(() => { g.placeOnShore(cg.ladderFoot.clone().setY(cg.ladderFoot.y + 1), -Math.PI / 2); g.cullFar(); }) };
      if (a.stage === 'extract' && near(cg.padPos, 5)) return { label: 'Grab the helicopter ladder', run: () => this.extract() };
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
    this.phone.update(dt);
    if (!a) { this.beacon.visible = false; return; }
    a.t += dt;
    if (g.health.dead) { this.end(false, 'You died'); return; }
    const p = g.shorePlayer.body.translation();
    if (a.id === 'm1') this.updateM1(a, p, dt);
    if (a.id === 'm2') this.updateM2(a, p, dt);
    if (a.id === 'm3') this.updateM3(a, p, dt);
    if (a.id === 'm4') this.updateM4(a, p, dt);
    if (a.id === 'm5') this.updateM5(a, p, dt);
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

  // ---------------------------------------------------------------- mission 4: the MV Halvard
  spawnGoon(a, at) {
    const g = this.game;
    const n = g.citizens.spawnCitizen('town', 'goon', at.clone(), { look: { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0x1a1a1a, hat: 'cap', hatColor: 0x111111 } });
    if (!n) return null;
    n.hp = 90;
    n.cash = 30 + Math.floor(Math.random() * 90);
    n.items = Math.random() < 0.3 ? ['pistol'] : [];
    n.heading = Math.random() * Math.PI * 2;
    n.mission = a;
    a.goons.push(n);
    return n;
  }

  setupShip(a) {
    const g = this.game, cg = g.cargo;
    for (const p of [...g.portSandbox.props]) if (p.def.bombPart) g.portSandbox.remove(p);
    const parts = ['bp_casing', 'bp_charge', 'bp_detonator', 'bp_charge', 'bp_timer', 'bp_shrapnel'];
    a.total = parts.length;
    parts.forEach((id, k) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6);
      g.portSandbox.spawn(ITEM_BY_ID[id], cg.partSpots[k].clone(), q, { noHistory: true });
    });
    for (const p of cg.posts.slice(0, 7)) this.spawnGoon(a, p);
  }

  extract() {
    const g = this.game;
    const a = this.active;
    this.fade(() => {
      // set down on the plaza in Verian City
      const c = g.city.spawn;
      g.placeOnShore(new THREE.Vector3(c.x, c.y + 1, c.z), 0);
      g.cullFar();
      if (a) this.end(true);
      g.hud.toast('The helicopter drops you on the plaza and peels away over the rooftops.', 0xe8e2d4);
    });
  }

  updateM4(a, p, dt) {
    const g = this.game, cg = g.cargo, sb = g.portSandbox;
    a.goons = a.goons.filter((n) => g.citizens.list.includes(n));
    const aboard = cg.onDeck(p, 0.5);
    // bomb parts that went over the side
    for (const prop of [...sb.props]) {
      if (!prop.def.bombPart) continue;
      const t = prop.body.translation();
      if (t.y < 0.6 && !cg.onDeck(t, -0.5)) {
        g.fx?.splash?.(new THREE.Vector3(t.x, 0, t.z));
        g.sfx.play('splash');
        sb.remove(prop);
        a.sunk++;
        g.hud.toast(`${prop.def.name} — gone. ${a.total - a.sunk ? `${a.total - a.sunk} to go` : 'That\'s the lot.'}`, 0x7be08a);
      }
    }
    // the crew wake up as soon as one of them sees you
    // the crew wake up when one of them sees you, you get close, a part goes over the side, or shots are fired aboard
    const close = aboard && a.goons.some((n) => { const t = n.body.translation(); return Math.hypot(t.x - p.x, t.z - p.z) < 12; });
    const shots = aboard && g.time - (g.lastShotT ?? -99) < 0.5;
    if (!a.alert && (a.goons.some((n) => n.playerVisible) || close || a.sunk > 0 || shots)) { a.alert = true; g.hud.toast('"Intruder on deck!"', 0xff6a5a); }
    for (const n of a.goons) n.alerted = a.alert;
    if (a.stage === 'board') {
      a.text = 'Get aboard the MV Halvard: the ladder at the end of Saltmarsh\'s west pier';
      a.wp = cg.ladderFoot.clone();
      if (aboard) { a.stage = 'parts'; g.hud.toast('Bomb parts are marked red on your map. Pick them up and throw them overboard (RMB).', 0xffd166); }
      return;
    }
    if (a.stage === 'parts') {
      a.wp = null;
      const left = a.total - a.sunk;
      a.text = aboard ? `Throw the bomb parts into the sea (${a.sunk}/${a.total})` : `Get back aboard: ${left} bomb part${left > 1 ? 's' : ''} left`;
      if (!aboard) a.wp = cg.ladderFoot.clone();
      if (left <= 0) {
        a.stage = 'call';
        setTimeout(() => this.phone.ring(FIXER, [
          `<b>${FIXER}:</b> Tell me that was the last of it.`,
          '<b>You:</b> Every piece is at the bottom of the harbour.',
          `<b>${FIXER}:</b> Good. Now the bad news: they know. Every one of them in Verian is heading for that ship.`,
          `<b>${FIXER}:</b> I've got a friend with a helicopter. Three minutes. Stay alive for three minutes.`,
          `<b>${FIXER}:</b> When you hear the rotors, get to the pad on the bow.`,
        ], () => { if (this.active === a) { a.stage = 'hold'; a.holdT = 180; a.reinfT = 4; g.hud.flashBanner('HOLD OUT', '#ffd166'); } }), 1500);
      }
      return;
    }
    if (a.stage === 'call') { a.text = 'Your phone is ringing: press <kbd>J</kbd> to answer'; a.wp = null; return; }
    if (a.stage === 'hold' || a.stage === 'extract') {
      // reinforcements up from below decks
      a.reinfT -= dt;
      if (a.stage === 'hold' && a.reinfT <= 0 && a.goons.length < 8) {
        a.reinfT = 14 + Math.random() * 6;
        const k = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < k; i++) this.spawnGoon(a, cg.doorPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, Math.random() * 2)));
        g.hud.toast('More of them coming up from below!', 0xff8a6a);
      }
      const hover = cg.padPos.clone().add(new THREE.Vector3(0, 5.2, 0));
      const from = new THREE.Vector3(-1000, 80, -400);
      if (a.stage === 'hold') {
        a.holdT -= dt;
        const s = Math.max(0, Math.ceil(a.holdT));
        a.text = `Hold out until the helicopter gets here: <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b>`;
        a.wp = null;
        if (a.holdT < 35) this.heli.pose(from, hover, (35 - a.holdT) / 35, g.time);
        if (a.holdT <= 0) { a.stage = 'extract'; g.hud.toast('The rope ladder comes down over the pad. GO!', 0x7be08a); }
        return;
      }
      this.heli.pose(from, hover, 1, g.time);
      a.text = 'Get to the helicopter on the bow';
      a.wp = cg.padPos.clone();
    }
  }

  // ---------------------------------------------------------------- mission 5: El Monstruo
  get extraCars() { return this.monstruo.cars; }

  vehicleLock(v) {
    const a = this.active;
    if (a?.id === 'm5' && v === this.monstruo.truck && (a.stage === 'escort' || a.stage === 'dropoff')) return 'The Courier: "Where do you think you\'re going? Drive."';
    if (a?.id === 'm5' && v === this.monstruo.truck && a.stage === 'crush') return null;
    return null;
  }

  // G in the truck: deal with the Courier. Too early and his men kill you.
  onKeyG() {
    const a = this.active, g = this.game, M = this.monstruo;
    if (a?.id !== 'm5' || g.vehicles.active !== M.truck || !['escort', 'dropoff', 'kill'].includes(a.stage)) return false;
    if (a.stage === 'kill') {
      g.sfx.play('pistol'); g.shake = 0.6;
      const c = M.riders[0].root;
      c.rotation.set(0.35, 0, 0.9); c.position.y -= 0.25;
      g.fx.flash(M.truck.pos.clone().add(new THREE.Vector3(0, 3.2, 0)), 0xffc060, 1, 0.08);
      for (let i = 0; i < 14; i++) g.fx.emit(M.truck.pos.clone().add(new THREE.Vector3(0.3, 3.2, 0)), new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0x8a0a0a, 0.6, 1, 0.25);
      g.hud.toast('The Courier slumps against the window. Rafe Doucet won\'t be moving anything again.', 0xe8e2d4);
      a.stage = 'escape';
      a.spawnT = 6; a.chopT = 20;
      setTimeout(() => { if (this.active === a) { g.hud.flashBanner('THEY KNOW', '#ff6a5a'); g.hud.toast('Ashen Hand cars are coming for the truck. Smash every one of them!', 0xff6a5a); } }, 3000);
      return true;
    }
    // his men are still right there
    g.sfx.play('pistol'); setTimeout(() => g.sfx.play('smg'), 150); setTimeout(() => g.sfx.play('smg'), 400);
    g.hud.toast('His men saw it coming.', 0xff6a5a);
    g.health.damage(999, 'goon');
    return true;
  }

  updateM5(a, p, dt) {
    const g = this.game, M = this.monstruo, t = M.truck;
    const inTruck = g.vehicles.active === t && !!t;
    if (!t || t.wreck || t.sinking) { if (a.stage !== 'crush') { this.end(false, t?.sinking ? 'El Monstruo went in the water' : 'El Monstruo was wrecked'); return; } }
    if (a.stage === 'garage') {
      a.text = inTruck ? '' : 'Go to Dockside Motors by Saltmarsh\'s fishing dock and get in El Monstruo';
      a.wp = t.pos.clone();
      if (inTruck) {
        M.clearCrew();
        for (const f of M.riders) f.root.visible = true;
        a.stage = 'escort';
        g.hud.toast('The Courier: "You\'re the new driver? The Hollows. Eyes on the road."', 0xe8e2d4);
      }
      return;
    }
    const hood = g.hood;
    const drop = new THREE.Vector3(hood.xs[1], LAND_Y, hood.zs[2] + 18);
    if (a.stage === 'escort') {
      a.text = 'Drive the Courier to the Hollows. Don\'t touch him while his men are in the cab';
      a.wp = drop.clone();
      if (!inTruck) a.wp = t.pos.clone();
      if (inTruck && Math.hypot(t.pos.x - drop.x, t.pos.z - drop.z) < 14 && Math.abs(t.speed) < 2.5) {
        a.stage = 'dropoff';
        g.hud.toast('The Courier: "Wait here." His men climb down and head off down the street.', 0xe8e2d4);
        M.riders[1].root.visible = M.riders[2].root.visible = false;
        M.crew = [];
        const f = t.forward, r = new THREE.Vector3(-f.z, 0, f.x);
        for (const s of [-1, 1]) {
          const at = t.pos.clone().addScaledVector(r, s * 2.8).addScaledVector(f, -1.5); at.y = LAND_Y;
          const n = g.citizens.spawnCitizen('hood', 'escort', at, { look: { shirt: 0x1d1f22, pants: 0x2a2c30, skin: s < 0 ? 0xa8724f : 0x7a4f35, hat: 'cap', hatColor: 0x111111 } });
          if (!n) continue;
          n.walkTo = t.pos.clone().addScaledVector(f, -40).addScaledVector(r, s * 4);
          n.walkSpeed = 1.7;
          M.crew.push(n);
        }
      }
      return;
    }
    if (a.stage === 'dropoff') {
      a.wp = null;
      const near = M.crew.filter((n) => g.citizens.list.includes(n) && !n.arrived && Math.hypot(n.body.translation().x - t.pos.x, n.body.translation().z - t.pos.z) < 26);
      a.text = 'Wait. His men are still close';
      for (const n of M.crew) if (n.arrived && g.citizens.list.includes(n)) g.citizens.despawn(n);
      if (!near.length) { M.clearCrew(); a.stage = 'kill'; g.sfx.play('select'); }
      return;
    }
    if (a.stage === 'kill') { a.text = 'His men are gone. Press <kbd>G</kbd> to deal with the Courier'; a.wp = null; return; }
    if (a.stage === 'escape') {
      // more of them, until they've thrown everything they've got at you
      const alive = M.cars.filter((c) => !c.wreck && !c.sinking).length;
      const atDump = M.atDump(t.pos);
      a.spawnT -= dt;
      if (M.spawned < CARS_TOTAL && (a.spawnT <= 0 || atDump) && alive < (atDump ? CARS_TOTAL : MAX_ALIVE)) {
        a.spawnT = M.spawned < 3 ? 1.5 : 9 + Math.random() * 4;
        M.spawnCar();
      }
      a.chopT -= dt;
      if (a.chopT <= 0 && a.chopSpawned < 4 && M.choppers.filter((c) => !c.falling).length < 2 && !a.carsDone) { a.chopT = 18; a.chopSpawned++; M.spawnChopper(); g.hud.toast('Chopper inbound!', 0xff8a6a); }
      M.updateEnemies(dt, a);
      a.carsDone = M.spawned >= CARS_TOTAL && alive === 0;
      const left = CARS_TOTAL - a.destroyed;
      if (!a.carsDone) {
        a.text = `Smash the Ashen Hand cars with El Monstruo (${a.destroyed}/${CARS_TOTAL}), on your way to the scrapyard at Verian docks`;
        a.wp = atDump ? null : new THREE.Vector3(-717, LAND_Y, -175);
        if (atDump) a.text = `Finish them off before you dump the truck: ${left} Ashen Hand car${left === 1 ? '' : 's'} left`;
        return;
      }
      a.text = inTruck ? 'Drive El Monstruo into the crusher' : 'Get back in El Monstruo and drive it into the crusher';
      a.wp = new THREE.Vector3(-648, LAND_Y, -175);
      if (inTruck && M.inBay(t.pos) && Math.abs(t.speed) < 2) {
        a.stage = 'crush'; a.crushT = 0;
        g.vehicles.active = null;
        g.placeOnShore(new THREE.Vector3(-648 - 9, LAND_Y + 1, -175), Math.PI / 2);
        g.hud.toast('You climb down. The crusher groans into life.', 0xe8e2d4);
      }
      return;
    }
    if (a.stage === 'crush') {
      a.text = 'Watch it go';
      a.wp = null;
      a.crushT += dt;
      const k = Math.min(1, a.crushT / 2.6);
      M.plate.position.y = LAND_Y + 8.2 - k * 5.4;
      if (t) { t.mesh.scale.y = Math.max(0.22, 1 - Math.max(0, (k - 0.55) / 0.45) * 0.78); t.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      if (k > 0.55 && !a.crunched) { a.crunched = true; g.sfx.play('crash'); g.shake = 1.2; for (let i = 0; i < 30; i++) g.fx.emit(t.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8), 0xbfe0ff, 0.6, 1, 0.2); }
      if (a.crushT > 4.2) {
        M.removeTruck();
        M.plate.position.y = LAND_Y + 8.2;
        this.end(true);
      }
    }
  }

  actComplete(n) {
    const e = this.game.economy;
    const html = `<div class="story act">
      <h1>ACT ${['', 'I', 'II', 'III'][n]}</h1><h2>complete</h2>
      <p>Verian Central Square is still standing. The bomb is at the bottom of the harbour, the Courier is dead in a truck that's now a metal pancake, and the Ashen Hand have lost their first man.</p>
      <p>They know someone is coming for them now. They don't know it's you. Not yet.</p>
      <p class="lede">For Wren.</p>
      <div class="btns"><button data-a="ok">Continue</button></div></div>`;
    e.open('The Ashen Hand', html, (body) => body.addEventListener('click', (ev) => { if (ev.target.closest('button[data-a]')) e.close(); }));
  }
}

