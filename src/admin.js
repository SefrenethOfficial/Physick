import * as THREE from 'three';
import { Car } from './carphys.js';
import { ITEMS, ITEM_BY_ID } from './items.js';
import { CAR_MODELS, modelMesh } from './dealership.js';
import { Chopper } from './homes.js';
import { monsterTruckMesh } from './elmonstruo.js';
import { HEAT, MAX_STARS } from './swat.js';
import { UPGRADES } from './garage.js';
import { MISSIONS, KEY_ITEMS } from './story.js';
import { WEATHER } from './daynight.js';
import { islandAt, LAND_Y } from './world.js';

// The admin panel: for testing. It's hidden until you unlock it: on the title screen, hold Alt
// (Option on a Mac) and click the very top-left corner. After that, F8 (or `) opens it any time.

const UNLOCK = 'physick.admin';
const SAVES = ['physick.save.v1', 'physick.story.v1', 'physick.stunts.v1', 'physick.clock.v1', 'physick.biz.v1', 'physick.stocks.v1', 'physick.homelife.v1'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Admin {
  constructor(game) {
    this.game = game;
    try { this.unlocked = localStorage.getItem(UNLOCK) === '1'; } catch { this.unlocked = false; }
    this.tab = 'player';
    this.flags = { ammo: false, debug: false };
    this.helis = [];
    const el = (this.el = document.createElement('div'));
    el.id = 'admin';
    el.className = 'hidden';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === el) { this.close(); return; }
      const b = e.target.closest('[data-a]');
      if (b) { this.act(b.dataset.a, b.dataset, b); if (this.isOpen) this.render(); }
    });
    el.addEventListener('input', (e) => { const r = e.target.closest('[data-in]'); if (r) this.input(r.dataset.in, r); });
    el.addEventListener('keydown', (e) => e.stopPropagation()); // (typing in the boxes doesn't drive the game)
    this.debugEl = document.createElement('div');
    this.debugEl.id = 'admin-debug';
    document.body.appendChild(this.debugEl);
    // the secret unlock: Alt + click in the top-left corner of the title screen
    document.addEventListener('mousedown', (e) => {
      if (this.unlocked || !e.altKey || e.clientX > 90 || e.clientY > 90) return;
      if (game.started || !document.getElementById('overlay')?.classList.contains('title')) return;
      e.preventDefault(); e.stopPropagation();
      this.unlocked = true;
      try { localStorage.setItem(UNLOCK, '1'); } catch { /* ignore */ }
      game.sfx.play('star');
      this.flash('Admin commands unlocked: press F8 (or `) in game');
    }, true);
    addEventListener('keydown', (e) => {
      if (!this.unlocked || e.repeat) return;
      if (e.code === 'F8' || e.code === 'Backquote') { e.preventDefault(); this.toggle(); }
      else if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  flash(text) {
    const d = document.createElement('div');
    d.className = 'admin-flash';
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  open() {
    const g = this.game;
    if (!g.started || g.title?.active) { this.flash('Start the game first, then press F8'); return; }
    if (g.story.phone.isOpen) g.story.phone.close();
    if (g.economy.isOpen) g.economy.close();
    this.el.classList.remove('hidden');
    g.panelOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
  }

  close() {
    this.el.classList.add('hidden');
    this.game.panelOpen = false;
    this.game.lock();
  }

  // ---------------------------------------------------------------- the panel
  places() {
    const g = this.game, C = g.city, S = g.saltmarsh, H = g.hood, P = g.park;
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const list = [
      ['Plaza', C.spawn.clone()], ['Hospital', C.hospital.clone()], ['Police station', C.policeStation.clone().add(v(0, 1.1, 4))],
      ['Bank', C.bank.door.clone().add(v(0, 1.1, -2))], ['Verian Motors', g.dealer?.desk.clone().add(v(0, 1.1, 0))], ['Marina', v(C.isl.x1 - 6, LAND_Y + 1.2, 0)],
      ['Ferry pier (city)', g.fleet?.ferryStops[0].board.clone().add(v(0, 1.2, 0))], ['Scrapyard (docks)', v(-665, LAND_Y + 1.2, -175)],
      ['Saltmarsh market', S.market.clone().add(v(0, 1.2, 0))], ['Saltmarsh beach', v((S.beach?.x ?? -1030), LAND_Y + 1.2, (S.beach?.z ?? -1500))], ['Fishing dock', S.dock.clone().add(v(0, 1.2, 30))],
      ['Cargo ship ladder', g.cargo?.ladderFoot?.clone().add(v(0, 1.2, 0))], ['The Hollows', H.entrance.clone().add(v(10, 1.2, 0))],
      ['Trailhead', P.entrance?.clone().add(v(0, 1.2, 0))], ['Underpass Customs', P.garage?.bay.clone().add(v(4, 1.2, 0))], ['Bunker (lab)', P.bunker?.out.clone().add(v(0, 1.2, 0))],
      ['Bridge (middle)', (() => { const b = g.bridge, p = b.at(b.length / 2, 6); return v(p.x, b.deckAt(b.length / 2) + 1.2, p.z); })()],
      ['Airport terminal', v(-1220 + 280, LAND_Y + 1.2, 445)], ['Airport runway', v(-1600 + 280, LAND_Y + 1.2, 640)], ['Naval air station', v(400, LAND_Y + 1.2, 0)],
      ['Pelican Point', g.pelican?.entrance.clone().add(v(10, 1.4, 0))], ['Lighthouse', g.pelican && v(g.pelican.hill.x - 6, g.pelican.flats[1].y + 1.4, g.pelican.hill.z - 8)],
      ['Ridgeback Hills (gas)', g.ridgeback && v(g.ridgeback.flats[0].x, g.ridgeback.flats[0].y + 1.4, g.ridgeback.flats[0].z + 14)], ['Ridgeback summit', g.ridgeback?.summit.clone().add(v(6, 1.4, 6))],
      ['Scorch gate', g.scorch?.gate.clone().add(v(0, 1.4, -10))], ['Scorch: Copper Gulch', g.scorch && v(g.scorch.town.x + 25, g.scorch.flats[1].y + 1.6, g.scorch.town.z)],
    ];
    for (const h of g.homes?.list || []) list.push([`Home: ${h.name}`, h.door.clone().add(v(0, 1.1, 0))]);
    return list.filter(([, p]) => p);
  }

  render() {
    const g = this.game, e = g.economy, P = g.police, D = g.daynight;
    const tabs = [['player', 'Player'], ['teleport', 'Teleport'], ['items', 'Items'], ['vehicles', 'Vehicles'], ['world', 'World'], ['story', 'Story'], ['fun', 'Activities'], ['save', 'Save data']];
    const btn = (a, label, data = {}, cls = '') => `<button class="${cls}" data-a="${a}" ${Object.entries(data).map(([k, v2]) => `data-${k}="${esc(v2)}"`).join(' ')}>${label}</button>`;
    const tog = (a, label, on) => btn(a, `${on ? '☑' : '☐'} ${label}`, {}, on ? 'on' : '');
    let body = '';
    const t = this.tab;
    if (t === 'player') {
      body = `<h4>Health</h4><div class="row">${tog('god', 'God mode', g.health.god)}${btn('heal', 'Full health')}${btn('armor', 'Full armour')}${btn('kill', 'Die')}</div>
        <h4>Money · cash $${e.money.toLocaleString()} · bank $${e.bank.toLocaleString()}</h4><div class="row">${[1000, 10000, 100000, 1000000, 10000000].map((n) => btn('money', `+$${n.toLocaleString()}`, { n })).join('')}${btn('money0', 'Zero cash')}</div>
        <h4>Wanted level: ${P.wanted} star${P.wanted === 1 ? '' : 's'}</h4><div class="row"><input type="range" min="0" max="${MAX_STARS}" value="${P.wanted}" data-in="wanted" style="flex:1"> ${btn('clearWanted', 'Clear')}</div>
        <div class="row">${[1, 3, 5, 6, 10, 15, 20].map((n) => btn('stars', `${n}★`, { n })).join('')}</div>
        <div class="row">${tog('police', 'Police off (no crimes reported)', P.disabled)}${tog('ammo', 'Infinite ammo', this.flags.ammo)}${tog('debug', 'Debug overlay', this.flags.debug)}</div>`;
    } else if (t === 'teleport') {
      const pt = g.shorePlayer.body.translation();
      body = `<div class="grid">${this.places().map(([n], i) => btn('tp', esc(n), { i })).join('')}</div>
        <h4>Where you're looking</h4><div class="row">${btn('tpLook', 'Teleport to the spot under the crosshair')}${btn('tpUp', 'Up 30 m')}</div>
        <h4>Coordinates (you're at ${pt.x.toFixed(0)}, ${pt.y.toFixed(1)}, ${pt.z.toFixed(0)})</h4><div class="row"><input id="adm-x" placeholder="x" value="${pt.x.toFixed(0)}" size="7"><input id="adm-z" placeholder="z" value="${pt.z.toFixed(0)}" size="7">${btn('tpXZ', 'Go')}</div>`;
    } else if (t === 'items') {
      const guns = ITEMS.filter((i) => i.gun), other = ITEMS.filter((i) => !i.gun && !i.noBag && !i.bombPart);
      body = `<h4>Weapons</h4><div class="grid">${guns.map((i) => btn('give', esc(i.name), { id: i.id })).join('')}${ITEM_BY_ID.grenade ? btn('give', 'Grenade', { id: 'grenade' }) : ''}${ITEM_BY_ID.armor ? btn('give', 'Body armour', { id: 'armor' }) : ''}</div>
        <div class="row">${btn('maxAmmo', 'Max ammo (all guns)')}${btn('clearHand', 'Empty your hand')}</div>
        <h4>Everything else (into your hand)</h4><div class="grid small">${other.map((i) => btn('give', esc(i.name), { id: i.id })).join('')}</div>`;
    } else if (t === 'vehicles') {
      const v = g.vehicles.active;
      body = `<h4>Spawn in front of you</h4><div class="grid">${CAR_MODELS.map((m) => btn('spawn', esc(m.name), { id: m.id })).join('')}${btn('spawn', 'Police car', { id: 'police' })}${btn('spawn', 'El Monstruo', { id: 'monster' })}</div>
        <h4>Your vehicle${v ? `: ${esc(v.type?.name || 'car')} (${Math.round((v.hp / v.maxHp) * 100)}%)` : ' (you\'re on foot)'}</h4>
        <div class="row">${btn('repair', 'Repair + new tyres')}${btn('maxUp', 'Fit every upgrade')}${btn('bulletproof', 'Bulletproof')}${btn('boom', 'Blow it up')}</div>
        <div class="row">${btn('clearCars', 'Clear cars within 60 m')}${tog('freezeTraffic', 'Freeze traffic', g.traffic.frozen)}</div>`;
    } else if (t === 'world') {
      body = `<h4>Time: ${D?.timeText}</h4><div class="row"><input type="range" min="0" max="23.9" step="0.1" value="${D?.hour}" data-in="hour" style="flex:1"></div>
        <div class="row">${[6.5, 9, 12, 18.6, 20, 23].map((h) => btn('hour', `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`, { h })).join('')}</div>
        <div class="row">Clock speed: ${[0, 1, 10, 60].map((m) => btn('clock', m ? `×${m}` : 'Stopped', { m }, Math.abs((D?.rate || 0) * 60 - m) < 0.01 ? 'on' : '')).join('')}</div>
        <h4>Weather: ${D ? WEATHER[D.kind].name : ''}</h4><div class="row">${Object.entries(WEATHER).map(([k, w]) => btn('weather', `${w.icon} ${w.name}`, { k })).join('')}</div>
        <h4>Game speed: ×${g.timeScale ?? 1}</h4><div class="row">${[0.25, 0.5, 1, 2].map((s) => btn('speed', `×${s}`, { s })).join('')}</div>
        <h4>People</h4><div class="row">${btn('clearPeople', 'Clear people within 60 m')}${btn('clearCars', 'Clear cars within 60 m')}</div>`;
    } else if (t === 'story') {
      const s = g.story;
      body = `<h4>Missions${s.active ? ` (playing: ${esc(s.active.m.title)})` : ''}</h4>${MISSIONS.filter((m) => !m.locked).map((m) => `<div class="row"><b style="flex:1">${esc(m.title)}${s.passed(m.id) ? ' ✓' : ''}</b>${btn('mStart', 'Start', { id: m.id })}${btn('mPass', s.passed(m.id) ? 'Un-pass' : 'Mark done', { id: m.id })}</div>`).join('')}
        <div class="row">${s.active ? btn('mEnd', 'Pass the current mission') + btn('mFail', 'Fail it') : ''}${btn('allPassed', 'Mark all done')}${btn('keys', 'Give all key items')}${btn('act2', g.story.state.act2 ? 'Act II areas: forced open' : 'Open Act II areas (the Scorch)', {}, g.story.state.act2 ? 'on' : '')}</div>`;
    } else if (t === 'fun') {
      const A = g.activities, S = g.stunts;
      body = `<h4>Street races (puts you in a car on the start)</h4><div class="row">${A.races.routes.map((r, i) => btn('race', esc(r.name), { i })).join('')}</div>
        <h4>Odd jobs</h4><div class="row">${A.odd.list.map((j) => btn('odd', esc(j.name), { id: j.id })).join('')}${A.cur ? btn('endAct', 'End current activity') : ''}</div>
        <h4>Vehicle jobs (spawns the vehicle and starts the shift)</h4><div class="row">${btn('vjob', 'Taxi', { k: 'taxi' })}${btn('vjob', 'Ambulance', { k: 'ambulance' })}${btn('vjob', 'Fire engine', { k: 'firetruck' })}</div>
        <h4>Hidden packages: ${S.found.size}/${S.total} · Stunt jumps: ${S.done.size}/${S.ramps.length}</h4><div class="row">${btn('nextPkg', 'Teleport to the nearest package')}${btn('nextRamp', 'Teleport to a ramp')}${btn('resetStunts', 'Reset jumps + packages')}</div>
        <h4>Police tests</h4><div class="row">${btn('bounty', 'Send bounty hunters')}${btn('roadblock', 'Roadblock ahead (driving)')}</div>
        <h4>Businesses: ${g.business.mine().length}/${g.business.list.length} owned</h4><div class="row">${btn('bizAll', 'Own every business')}${btn('bizFill', 'Fill every till')}${btn('bizRaid', 'Start a raid now')}${btn('bizTp', 'Teleport to a business')}</div>
        <h4>Stock market</h4><div class="row">${btn('stockNews', 'Random company news')}${btn('stockCrash', 'Crash the market')}${btn('stockBoom', 'Boom the market')}</div>`;
    } else if (t === 'save') {
      body = `<p>These wipe saved progress in this browser, then reload the game.</p><div class="row">${btn('wipe', 'Wipe money, homes, cars, businesses + stocks', { k: 'save' })}${btn('wipe', 'Wipe story progress', { k: 'story' })}${btn('wipe', 'Wipe stunts + packages', { k: 'stunts' })}</div>
        <div class="row">${btn('wipe', 'Wipe EVERYTHING', { k: 'all' }, 'danger')}${btn('lock', 'Hide admin again')}</div>`;
    }
    this.el.innerHTML = `<div class="adm-box"><div class="adm-head"><b>ADMIN</b><span>F8 / Esc to close</span><button data-a="close">✕</button></div>
      <div class="adm-tabs">${tabs.map(([k, n]) => `<button data-a="tab" data-k="${k}" class="${k === t ? 'on' : ''}">${n}</button>`).join('')}</div><div class="adm-body">${body}</div></div>`;
  }

  input(name, el) {
    const g = this.game;
    if (name === 'wanted') this.setStars(+el.value);
    if (name === 'hour' && g.daynight) g.daynight.hour = +el.value;
    const h = this.el.querySelector('h4'); void h;
  }

  setStars(n) {
    const P = this.game.police;
    if (n <= 0) { P.clearWanted(); return; }
    P.disabled = false;
    P.heat = HEAT[Math.min(n, MAX_STARS)];
    P.setWantedFromHeat();
    P.lastSeen = this.game.time * 1000;
  }

  // in front of you, facing the way you're looking
  ahead(d = 7) {
    const g = this.game, p = g.vehicles.active?.pos || g.shorePlayer.body.translation(), yaw = g.vehicles.active?.heading ?? g.shorePlayer.yaw;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    return { pos: new THREE.Vector3(p.x + f.x * d, p.y, p.z + f.z * d), heading: yaw };
  }

  tp(p) {
    const g = this.game;
    if (!p) return;
    g.homes && (g.homes.inside = null);
    const v = g.vehicles.active;
    if (v && !v.isHeli) {
      v.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      v.expect = null; v.vy = 0; v.pos.set(p.x, p.y, p.z);
    } else g.placeOnShore(p.clone ? p.clone() : new THREE.Vector3(p.x, p.y, p.z));
  }

  spawnVehicle(id) {
    const g = this.game, { pos, heading } = this.ahead(id === 'monster' ? 9 : 7);
    let car;
    const m = CAR_MODELS.find((x) => x.id === id);
    if (m?.vehicle === 'heli') { const c = new Chopper(g, pos.clone().setY(pos.y - 1)); c.setAvailable(true); this.helis.push(c); this.flash('Helicopter spawned: walk up and press E'); return; }
    if (m?.vehicle === 'bike') car = g.fleet.makeBike({ x: pos.x, z: pos.z, heading, color: m.color, maxSpeed: m.maxSpeed, sport: m.sport });
    else if (m?.vehicle === 'tow') car = g.fleet.makeTow({ x: pos.x, z: pos.z, heading });
    else if (m) car = new Car(g, { x: pos.x, z: pos.z, heading, hp: m.hp, maxSpeed: m.maxSpeed, mesh: modelMesh(m), half: { x: 0.95 * m.scale[0], y: 0.55 * m.scale[1], z: 2.25 * m.scale[2] } });
    else if (id === 'police') car = new Car(g, { x: pos.x, z: pos.z, heading, police: true });
    else if (id === 'monster') { car = new Car(g, { mesh: monsterTruckMesh(), x: pos.x, z: pos.z, heading, hp: 1700, half: { x: 1.45, y: 1.05, z: 3.45 }, density: 420, wheelbase: 4.5, maxSpeed: 31, ride: 1.0 }); car.monster = true; }
    if (!car) return;
    car.baseMax = car.maxSpeed;
    car.type = { name: m?.name || (id === 'police' ? 'Police car' : 'El Monstruo'), hp: car.maxHp, car: true };
    car.base = 300;
    g.vehicles.list.push(car);
  }

  act(a, d) {
    const g = this.game, e = g.economy, v = g.vehicles.active, P = g.police;
    switch (a) {
      case 'close': this.close(); return;
      case 'tab': this.tab = d.k; return;
      case 'god': g.health.god = !g.health.god; return;
      case 'heal': g.health.heal(1000); return;
      case 'armor': g.health.armor = 100; g.hud.setArmor?.(1); return;
      case 'kill': this.close(); g.health.god = false; g.health.damage(10000, 'x'); return;
      case 'money': e.addMoney(+d.n, 'admin'); return;
      case 'money0': e.addMoney(-e.money); return;
      case 'stars': this.setStars(+d.n); return;
      case 'clearWanted': P.clearWanted(); return;
      case 'police': P.disabled = !P.disabled; if (P.disabled) P.clearWanted(); return;
      case 'ammo': this.flags.ammo = !this.flags.ammo; return;
      case 'maxAmmo': for (const k of Object.keys(e.ammo)) e.ammo[k] = 999; e.save(); g.refreshHolding?.(); return;
      case 'debug': this.flags.debug = !this.flags.debug; this.debugEl.style.display = this.flags.debug ? 'block' : 'none'; return;
      case 'tp': this.tp(this.places()[+d.i][1]); this.close(); return;
      case 'tpLook': {
        const eye = g.player.eye, dir = g.lookDir(), hit = g.portSandbox.raycast(eye, dir, 600, g.shorePlayer.collider);
        if (hit) this.tp(hit.point.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(dir, -0.8));
        this.close(); return;
      }
      case 'tpUp': { const p = g.shorePlayer.body.translation(); this.tp(new THREE.Vector3(p.x, p.y + 30, p.z)); return; }
      case 'tpXZ': {
        const x = +this.el.querySelector('#adm-x').value, z = +this.el.querySelector('#adm-z').value;
        const hit = g.portSandbox.raycast({ x, y: 300, z }, { x: 0, y: -1, z: 0 }, 400);
        this.tp(new THREE.Vector3(x, (hit ? hit.point.y : LAND_Y) + 1.3, z)); this.close(); return;
      }
      case 'give': { const def = ITEM_BY_ID[d.id]; if (def) { g.clearHand?.(); g.holdItem ? g.holdItem(def) : g.giveItem(def); if (def.gun) e.ammo[def.gun.ammo] = Math.max(e.ammo[def.gun.ammo] || 0, 200); g.refreshHolding?.(); } return; }
      case 'clearHand': g.clearHand?.(); return;
      case 'spawn': this.spawnVehicle(d.id); return;
      case 'repair': if (v && !v.isHeli) { v.hp = v.maxHp; v.flat = false; } return;
      case 'maxUp': if (v && !v.isHeli) { v.mods ||= {}; for (const u of UPGRADES) { v.mods[u.id] = u.levels.length - 1; u.apply(v, u.levels.length - 1); } if (v.ownedUid) g.dealer?.remember(v); } return;
      case 'bulletproof': if (v) v.bulletproof = true; return;
      case 'boom': if (v && !v.isHeli) v.explode(); this.close(); return;
      case 'clearCars': {
        const p = g.shorePlayer.body.translation();
        for (const c of [...g.traffic.cars]) if (c.pos.distanceTo(p) < 60) g.traffic.remove(c);
        for (const c of [...g.vehicles.parked]) if (c.pos.distanceTo(p) < 60) { c.dispose(); g.vehicles.parked.splice(g.vehicles.parked.indexOf(c), 1); }
        for (const c of [...g.police.cars]) if (c.pos.distanceTo(p) < 60) P.removeCar(c);
        return;
      }
      case 'freezeTraffic': g.traffic.frozen = !g.traffic.frozen; if (g.highway) g.highway.frozen = g.traffic.frozen; return;
      case 'clearPeople': { const p = g.shorePlayer.body.translation(); for (const n of [...g.citizens.list]) { const t = n.body.translation(); if (Math.hypot(t.x - p.x, t.z - p.z) < 60 && !n.store) g.citizens.despawn(n); } return; }
      case 'hour': if (g.daynight) g.daynight.hour = +d.h; return;
      case 'clock': if (g.daynight) g.daynight.rate = +d.m / 60; return;
      case 'weather': g.daynight?.setWeather(d.k); if (g.daynight) Object.assign(g.daynight.w, { cloud: WEATHER[d.k].cloud, rain: WEATHER[d.k].rain, fog: WEATHER[d.k].fog }); return;
      case 'speed': g.adminSpeed = +d.s; return;
      case 'mStart': this.close(); if (g.story.active) g.story.end(false, 'Switched mission'); g.story.start(d.id); return;
      case 'mPass': { const st = g.story.state; if (st.passed.includes(d.id)) st.passed = st.passed.filter((x) => x !== d.id); else st.passed.push(d.id); g.story.save(); return; }
      case 'mEnd': g.story.end(true, 'Mission passed (admin)'); return;
      case 'mFail': g.story.end(false, 'Mission failed (admin)'); return;
      case 'allPassed': { const st = g.story.state; for (const m of MISSIONS) if (!m.locked && !st.passed.includes(m.id)) st.passed.push(m.id); st.introSeen = true; g.story.save(); return; }
      case 'act2': { const st = g.story.state; st.act2 = !st.act2; g.story.save(); this.flash(g.story.act2 ? 'The Scorch is open' : 'The Scorch is closed again (unless Act I is done)'); return; }
      case 'keys': { const st = g.story.state; for (const k of Object.keys(KEY_ITEMS)) if (!st.keyItems.includes(k)) st.keyItems.push(k); g.story.save(); return; }
      case 'race': {
        const r = g.activities.races.routes[+d.i];
        if (!g.vehicles.active) { this.spawnVehicle('sports'); const c = g.vehicles.list.at(-1); g.vehicles.enter(c); }
        const car = g.vehicles.active, dir = r.pts[1].clone().sub(r.pts[0]).normalize(), hd = Math.atan2(-dir.x, -dir.z);
        this.tp(r.start.clone().setY(r.start.y + 0.4));
        car.body.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hd, 0)), true);
        this.close();
        setTimeout(() => g.activities.races.open(r), 100);
        return;
      }
      case 'odd': this.close(); g.activities.odd.cool = {}; g.activities.odd.act('go', { id: d.id }); return;
      case 'endAct': g.activities.end(false, 'Ended (admin)'); return;
      case 'vjob': {
        const src = g.vehicles.parked.find((c) => c[d.k]) || g.traffic.cars.find((c) => c[d.k]);
        if (!src) { this.flash('None of those around right now'); return; }
        this.close();
        const { pos, heading } = this.ahead(6);
        src.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true); src.body.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0)), true); src.expect = null;
        g.vehicles.steal({ car: src, kind: g.vehicles.parked.includes(src) ? 'parked' : 'traffic' });
        g.police.clearWanted();
        setTimeout(() => g.activities.keyY(), 200);
        return;
      }
      case 'nextPkg': {
        const p = g.shorePlayer.body.translation(), S = g.stunts;
        const k = [...S.packages].sort((a2, b2) => Math.hypot(a2.pos.x - p.x, a2.pos.z - p.z) - Math.hypot(b2.pos.x - p.x, b2.pos.z - p.z))[0];
        if (k) { this.tp(k.pos.clone().add(new THREE.Vector3(3, 1.3, 0))); this.close(); } else this.flash('All packages found');
        return;
      }
      case 'nextRamp': {
        const S = g.stunts, r = S.ramps[(this.rampI = ((this.rampI ?? -1) + 1) % S.ramps.length)];
        this.tp(r.at.clone().addScaledVector(r.f, -45).setY(r.at.y + 1.3)); this.close();
        return;
      }
      case 'resetStunts': { const S = g.stunts; S.done.clear(); S.found.clear(); S.save(); this.flash('Reset: reload to put the packages back'); return; }
      case 'bounty': { const E = P.esc; E.peak = Math.max(E.peak, 8); E.startBounty(); this.close(); return; }
      case 'roadblock': { if (v && !v.isHeli) { this.setStars(Math.max(P.wanted, 4)); P.esc.placeRoadblock(v); } else this.flash('Get in a car and drive first'); this.close(); return; }
      case 'bizAll': { const B = g.business; for (const st of B.list) if (!B.owns(st)) B.owned[st.biz.key] = { till: 0, sec: 0, closed: 0, earned: 0 }; B.save(); this.flash(`You own all ${B.list.length} businesses`); break; }
      case 'bizFill': { const B = g.business; for (const st of B.mine()) B.owned[st.biz.key].till = B.cap(st); B.save(); this.flash('Tills full'); break; }
      case 'bizRaid': { if (g.business.raid) g.business.endRaid(true); if (!g.business.startRaid()) this.flash('Buy a business first'); else this.close(); return; }
      case 'bizTp': { const B = g.business, l = B.mine().length ? B.mine() : B.list; const st = l[(this.bizI = ((this.bizI ?? -1) + 1) % l.length)]; this.tp(st.it.door.clone().setY(st.it.door.y + 1.3)); this.close(); return; }
      case 'stockNews': g.stocks.storyT = 0; this.flash('Check the news'); break;
      case 'stockCrash': for (const c of g.stocks.list) g.stocks.event(c.sym, -0.25); this.flash('Market crashed 25%'); break;
      case 'stockBoom': for (const c of g.stocks.list) g.stocks.event(c.sym, 0.25); this.flash('Market up 25%'); break;
      case 'wipe': {
        const keys = d.k === 'all' ? SAVES : d.k === 'save' ? ['physick.save.v1', 'physick.biz.v1', 'physick.stocks.v1', 'physick.homelife.v1'] : d.k === 'story' ? ['physick.story.v1'] : ['physick.stunts.v1'];
        if (!confirmWipe(d.k)) return;
        for (const k of keys) try { localStorage.removeItem(k); } catch { /* ignore */ }
        location.reload();
        return;
      }
      case 'lock': try { localStorage.removeItem(UNLOCK); } catch { /* ignore */ } this.unlocked = false; this.close(); return;
    }
  }

  update(dt) {
    const g = this.game;
    for (const h of this.helis) h.update(dt);
    if (this.flags.ammo) { const a = g.economy.ammo; for (const k of Object.keys(a)) if (a[k] < 500) a[k] = 999; }
    if (this.flags.debug) {
      this.dbgT = (this.dbgT || 0) - dt;
      if (this.dbgT <= 0) {
        this.dbgT = 0.15;
        const p = g.shorePlayer.body.translation(), v = g.vehicles.active, isl = islandAt(p.x, p.z, 4);
        this.debugEl.innerHTML = [
          `pos ${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)} · ${isl?.name || 'sea'}${g.homes?.inside ? ` (inside ${g.homes.inside.name})` : ''}`,
          `yaw ${(((-g.shorePlayer.yaw * 180) / Math.PI) % 360).toFixed(0)}° · ${g.daynight?.timeText} ${g.daynight ? WEATHER[g.daynight.kind].name : ''} · time ×${(g.timeScale ?? 1).toFixed(2)}`,
          v ? `${esc(v.type?.name || 'vehicle')}: ${(Math.abs(v.speed) * 3.6).toFixed(0)} km/h · hp ${v.hp.toFixed(0)}/${v.maxHp} · ${v.airborne ? 'AIRBORNE' : 'grounded'} · slope ${((v.slope || 0) * 100).toFixed(0)}% · vy ${(v.vy || 0).toFixed(1)}` : `on foot · hp ${g.health.hp.toFixed(0)} · armour ${g.health.armor.toFixed(0)}`,
          `wanted ${g.police.wanted}★ (heat ${g.police.heat}) · cops ${g.citizens.list.filter((n) => n.role === 'cop').length} · police cars ${g.police.cars.length} · choppers ${g.police.esc?.helis.length || 0}`,
          `people ${g.citizens.list.length} · traffic ${g.traffic.cars.length} · all cars ${g.vehicles.all.length} · props ${g.portSandbox.props.size ?? g.portSandbox.props.length}`,
          `activity: ${g.activities?.cur?.title || '-'} · mission: ${g.story.active?.m.title || '-'}`,
        ].join('<br>');
      }
    }
  }
}

function confirmWipe(k) {
  // (no browser dialogs: they freeze the game; a second click within 3 s confirms instead)
  const now = performance.now();
  if (confirmWipe.k === k && now - confirmWipe.t < 3000) { confirmWipe.k = null; return true; }
  confirmWipe.k = k; confirmWipe.t = now;
  const d = document.createElement('div'); d.className = 'admin-flash'; d.textContent = 'Click again to confirm'; document.body.appendChild(d); setTimeout(() => d.remove(), 2500);
  return false;
}
