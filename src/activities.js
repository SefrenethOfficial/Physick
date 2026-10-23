import * as THREE from 'three';
import { Car, clearSpot } from './carphys.js';
import { std, canvasTex } from './buildkit.js';
import { buildFigure } from './figure.js';
import { LAND_Y, islandAt } from './world.js';
import { CAR_MODELS, modelMesh } from './dealership.js';
import { DUMP } from './elmonstruo.js';

// Things to do between missions, one at a time:
//  - street races (drive into a chequered start marker in any car), with betting on yourself
//  - vehicle jobs: taxi fares, ambulance call-outs and fires to put out (Y in the right vehicle)
//  - odd jobs from your contacts, picked from the phone (drop-offs, repos, tails, hot cars)

const KERB = 0.15;
const money = (n) => '$' + Math.round(n).toLocaleString();
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };

function beacon(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 70, 20, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 35;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 40), new THREE.MeshBasicMaterial({ color, fog: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
  g.add(beam, ring);
  g.visible = false;
  return g;
}

function flagTex() {
  return canvasTex(64, 64, (c, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#f2f2ee'; c.fillRect(i * 8, j * 8, 8, 8); } });
}

// ---------------------------------------------------------------- the manager
export class Activities {
  constructor(game) {
    this.game = game;
    this.cur = null;
    this.cars = []; // racers, targets: (in vehicles.all)
    this.beacon = beacon(0x5ab0ff);
    this.beacon2 = beacon(0xffffff); // the next-but-one checkpoint in a race
    this.beacon2.children[0].material.opacity = 0.08;
    game.scene.add(this.beacon, this.beacon2);
    this.races = new Races(this);
    this.vjobs = new VehicleJobs(this);
    this.odd = new OddJobs(this);
  }

  start(act) {
    const g = this.game;
    if (g.story.active) { g.hud.toast('Finish your current job first', 0xffd166); return false; }
    if (this.cur) this.end(false, 'Abandoned');
    this.cur = act;
    act.t = 0;
    act.begin?.();
    return true;
  }

  // win: true/false; msg: banner text
  end(win, msg, pay = 0) {
    const g = this.game, a = this.cur;
    if (!a) return;
    this.cur = null;
    a.cleanup?.();
    g.hud.setObjective(null);
    this.beacon.visible = this.beacon2.visible = false;
    if (pay > 0) g.economy.addMoney(pay, a.title);
    if (msg) { g.hud.flashBanner(msg, win ? '#7be08a' : '#ff6a5a'); g.sfx.play(win ? 'cash' : 'error'); }
    g.stats?.add?.(win ? 'jobsDone' : 'jobsFailed', 1);
  }

  removeCar(c) {
    const i = this.cars.indexOf(c);
    if (i >= 0) this.cars.splice(i, 1);
    if (this.game.vehicles.active === c) return; // (you're in it: it stays)
    c.dispose();
  }

  // in-car E (before getting out): start a race at a start marker
  carAction(v) { return this.cur ? null : this.races.carAction(v); }

  // Y in a taxi / ambulance / fire truck
  keyY() { return this.vjobs.toggle(); }

  marks() {
    const out = [];
    const a = this.cur;
    if (a?.waypoint) out.push({ x: a.waypoint.x, z: a.waypoint.z, color: '#5ab0ff', r: 5.5, label: '◆' });
    for (const m of a?.marks?.() || []) out.push(m);
    if (!a) for (const r of this.races.routes) out.push({ x: r.start.x, z: r.start.z, color: '#f2f2ee', r: 4, label: '🏁' });
    return out;
  }

  onChop(car) { this.cur?.onChop?.(car); }

  update(dt) {
    const g = this.game, a = this.cur;
    this.odd.register();
    this.races.idle(dt);
    this.vjobs.idle(dt);
    if (!a) return;
    a.t += dt;
    a.update(dt);
    if (this.cur !== a) return;
    const wp = a.waypoint;
    const pp = g.vehicles.active?.pos || g.shorePlayer.body.translation();
    const d = wp ? Math.hypot(wp.x - pp.x, wp.z - pp.z) : null;
    const timer = a.timeLeft != null ? ` · ${Math.max(0, Math.ceil(a.timeLeft))}s` : '';
    g.hud.setObjective({ title: a.title, text: (a.text || '') + timer, dist: d != null && d > 6 ? Math.round(d) : null });
    this.beacon.visible = !!wp;
    if (wp) { this.beacon.position.set(wp.x, wp.y ?? LAND_Y, wp.z); this.beacon.children[1].rotation.z += dt; }
    this.beacon2.visible = !!a.next;
    if (a.next) this.beacon2.position.set(a.next.x, a.next.y ?? LAND_Y, a.next.z);
    if (a.timeLeft != null) { a.timeLeft -= dt; if (a.timeLeft <= 0) this.end(false, a.failText || 'Out of time'); }
  }
}

// ---------------------------------------------------------------- street races
class Races {
  constructor(A) {
    this.A = A;
    const g = A.game, C = g.city, H = g.hood, hw = g.highway;
    const nodes = (R, list, y = LAND_Y) => list.map(([i, j]) => new THREE.Vector3(R.xs[i], y, R.zs[j]));
    const withMids = (pts) => { const o = []; pts.forEach((p, k) => { o.push(p); const q = pts[(k + 1) % pts.length]; if (p.distanceTo(q) > 100) o.push(p.clone().lerp(q, 0.5)); }); return o; };
    this.routes = [
      { id: 'city', name: 'City Sprint', laps: 2, prize: [2500, 900, 400], pts: withMids(nodes(C, [[0, 4], [3, 4], [3, 1], [1, 1], [1, 3], [0, 3]], LAND_Y + KERB)) },
      { id: 'bridge', name: 'Bridge Run', laps: 1, loop: false, prize: [4000, 1500, 600], pts: hw.route.filter((p, k) => k % 5 === 0 || k === hw.route.length - 1).map((p) => new THREE.Vector3(p.x, hw.groundY(p), p.z)) },
      { id: 'hood', name: 'Hollows Dash', laps: 2, prize: [1800, 700, 300], pts: withMids(nodes(H, [[0, 0], [3, 0], [3, 2], [1, 2], [1, 4], [0, 4]])) },
    ];
    // a chequered flag on a pole at each start
    for (const r of this.routes) {
      r.start = r.pts[0].clone();
      const pole = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 8), std({ color: 0xdddddd })); p.position.y = 2;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshBasicMaterial({ map: flagTex(), side: THREE.DoubleSide })); f.position.set(0.72, 3.5, 0);
      pole.add(p, f);
      const dir = r.pts[1].clone().sub(r.pts[0]).normalize();
      pole.position.copy(r.start).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 9);
      g.scene.add(pole);
      r.flag = f;
    }
    this.t = 0;
  }

  idle(dt) { this.t += dt; for (const r of this.routes) r.flag.rotation.y = Math.sin(this.t * 3 + r.start.x) * 0.3; }

  carAction(v) {
    if (!v || v.isHeli || v.bus || Math.abs(v.speed) > 3) return null;
    const r = this.routes.find((x) => Math.hypot(v.pos.x - x.start.x, v.pos.z - x.start.z) < 10);
    if (!r) return null;
    return { label: `Street race: ${r.name} ($500 to enter)`, run: () => this.open(r) };
  }

  open(r) {
    const g = this.A.game, e = g.economy;
    let bet = 0;
    const render = () => {
      const funds = e.money + e.bank;
      const best = g.stats?.best?.(`race-${r.id}`);
      e.open(`Street race: ${r.name}`, e.header() + `<p class="lede">${r.loop === false ? 'Point to point: the long road over the Saltmarsh Gate Bridge to Saltmarsh Key.' : `${r.laps} laps.`} Four other drivers. Entry $500. Prizes: 1st ${money(r.prize[0])}, 2nd ${money(r.prize[1])}, 3rd ${money(r.prize[2])}.${best ? ` Your best: ${best.toFixed(1)}s.` : ''}</p>
        <div class="erow"><div><b>Bet on yourself to win</b><small>Pays 3 to 1 if you finish first</small></div><div class="btns">${[0, 500, 2000, 10000].map((b) => `<button data-a="bet" data-b="${b}" ${bet === b ? 'class="on" style="outline:2px solid #ffd166"' : ''} ${b + 500 > funds ? 'disabled' : ''}>${b ? money(b) : 'No bet'}</button>`).join('')}</div></div>
        <div class="btns"><button data-a="go" ${funds < 500 + bet ? 'disabled' : ''}>Race! (${money(500 + bet)})</button></div>`,
      (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b || b.disabled) return;
        if (b.dataset.a === 'bet') { bet = +b.dataset.b; render(); }
        if (b.dataset.a === 'go') { e.close(); this.begin(r, bet); }
      }));
    };
    render();
  }

  pay(n) { const e = this.A.game.economy; const c = Math.min(e.money, n); e.bank -= n - c; e.addMoney(-c); }

  begin(r, bet) {
    const A = this.A, g = A.game, v = g.vehicles.active;
    if (!v) return;
    const race = {
      title: r.name, r, bet, cp: 1, lap: 1, racers: [], finished: [], countdown: 3.6, startT: 0,
      begin: () => {},
      cleanup: () => { for (const c of race.racers) A.removeCar(c); },
      marks: () => race.racers.filter((c) => !c.wreck).map((c) => ({ x: c.pos.x, z: c.pos.z, color: '#ff8a1a', r: 3 })),
      update: (dt) => this.update(race, dt),
    };
    if (!A.start(race)) return;
    this.pay(500 + bet);
    // the grid: you at the front, the others behind in pairs
    const p0 = r.pts[0], dir = r.pts[1].clone().sub(p0).setY(0).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
    const heading = Math.atan2(-dir.x, -dir.z);
    const slot = (k) => p0.clone().addScaledVector(side, (k % 2 ? 1 : -1) * 2.6).addScaledVector(dir, -Math.floor(k / 2) * 8);
    const place = (car, at) => { const gy = car.groundAt(at.x, at.z, at.y + 3); car.body.setTranslation({ x: at.x, y: gy, z: at.z }, true); car.body.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0)), true); car.body.setLinvel({ x: 0, y: 0, z: 0 }, true); car.body.setAngvel({ x: 0, y: 0, z: 0 }, true); car.pos.set(at.x, gy, at.z); car.groundY = gy; };
    place(v, slot(0));
    const models = CAR_MODELS.filter((m) => !m.vehicle);
    for (let k = 1; k <= 4; k++) {
      const m = models[Math.floor(Math.random() * models.length)];
      const at = slot(k);
      const half = { x: 0.95 * m.scale[0], y: 0.55 * m.scale[1], z: 2.25 * m.scale[2] };
      const c = new Car(g, { x: at.x, z: at.z, heading, hp: m.hp + 40, mesh: modelMesh(m, [0xc23b2a, 0x2f7fd8, 0xe0a030, 0x3aa760, 0x6a2a8a, 0xf2f2ee][k]), half, maxSpeed: m.maxSpeed });
      place(c, at);
      Object.assign(c, { racer: true, cp: 1, lap: 1, skill: 0.84 + Math.random() * 0.14, top: Math.max(30, m.maxSpeed), done: false });
      race.racers.push(c);
      A.cars.push(c);
    }
    // clear the road ahead of traffic for the start
    for (const c of [...g.traffic.cars]) if (c.pos.distanceTo(p0) < 40) g.traffic.remove(c);
    g.hud.toast(`${r.name}: ${r.laps > 1 ? r.laps + ' laps' : 'to the finish'}${bet ? `, ${money(bet)} on yourself` : ''}`, 0xffd166);
  }

  progress(c, race) { const r = race.r; return (c.lap - 1) * r.pts.length + c.cp - Math.min(1, c.pos.distanceTo(r.pts[c.cp % r.pts.length]) / 400); }

  update(race, dt) {
    const A = this.A, g = A.game, r = race.r, v = g.vehicles.active;
    const N = r.pts.length, finishLap = r.loop === false ? 1 : r.laps;
    const ptAt = (k) => r.pts[k % N];
    // countdown: everybody held on the line
    if (race.countdown > 0) {
      const before = Math.ceil(race.countdown);
      race.countdown -= dt;
      const now = Math.ceil(race.countdown);
      if (now !== before) { g.hud.flashBanner(now > 0 ? String(now) : 'GO!', now > 0 ? '#ffd166' : '#7be08a'); g.sfx.play(now > 0 ? 'select' : 'star'); }
      for (const c of [...race.racers, v]) if (c) { const lv = c.body.linvel(); c.body.setLinvel({ x: 0, y: lv.y, z: 0 }, true); }
      race.text = 'Get ready…';
      race.waypoint = ptAt(1);
      return;
    }
    race.startT += dt;
    if (!v || v.wreck) { A.end(false, 'Race over: no car'); return; }
    // your checkpoints
    const me = { pos: v.pos, cp: race.cp, lap: race.lap };
    const cpPos = ptAt(race.cp);
    if (Math.hypot(v.pos.x - cpPos.x, v.pos.z - cpPos.z) < 11) {
      g.sfx.play('select');
      race.cp++;
      if (r.loop === false && race.cp >= N) return this.finish(race);
      if (r.loop !== false && race.cp > N) { race.cp = 1; race.lap++; if (race.lap > finishLap) return this.finish(race); g.hud.flashBanner(`LAP ${race.lap}/${finishLap}`, '#ffd166'); }
    }
    if (Math.hypot(v.pos.x - cpPos.x, v.pos.z - cpPos.z) > 500) { A.end(false, 'You left the race'); return; }
    me.cp = race.cp; me.lap = race.lap;
    // the others
    const myProg = this.progress(me, race);
    for (const c of race.racers) {
      if (c.wreck || c.done) { if (!c.wreck) c.coast(dt); continue; }
      const tgt = ptAt(c.cp), nxt = ptAt(c.cp + 1);
      const d = Math.hypot(tgt.x - c.pos.x, tgt.z - c.pos.z);
      if (d < 12) {
        c.cp++;
        if (r.loop === false && c.cp >= N) { c.done = true; race.finished.push(c); continue; }
        if (r.loop !== false && c.cp > N) { c.cp = 1; c.lap++; if (c.lap > finishLap) { c.done = true; race.finished.push(c); continue; } }
      }
      // aim a little towards the following checkpoint as we arrive, and brake for sharp turns
      const aim = tgt.clone().lerp(nxt, THREE.MathUtils.clamp(1 - d / 30, 0, 0.5));
      const a1 = Math.atan2(tgt.x - c.pos.x, tgt.z - c.pos.z), a2 = Math.atan2(nxt.x - tgt.x, nxt.z - tgt.z);
      const turn = Math.abs(angDiff(a1, a2));
      let want = c.top * c.skill;
      if (d < 40) want *= 1 - 0.6 * Math.min(1, turn / 1.6);
      // rubber band: keep it a race
      const gap = this.progress(c, race) - myProg;
      want *= gap > 2 ? 0.86 : gap < -2 ? 1.12 : 1;
      // stuck on something? back off and come again
      if (Math.abs(c.speed) < 1.2 && want > 4) c.stuckT = (c.stuckT || 0) + dt; else c.stuckT = 0;
      if (c.stuckT > 1.2) { c.reverseT = 1.1; c.stuckT = 0; }
      if (c.reverseT > 0) { c.reverseT -= dt; c.driveTo(dt, -7, aim, { maxSpeed: 20 }); continue; }
      c.driveTo(dt, want, aim, { maxSpeed: c.top * 1.15, accel: 11, grip: 14, brake: 22 });
    }
    // where you are
    const ahead = race.racers.filter((c) => c.done || (!c.wreck && this.progress(c, race) > myProg)).length;
    race.pos = ahead + 1;
    race.text = `${race.pos}${['st', 'nd', 'rd', 'th', 'th'][race.pos - 1]} · ${r.loop === false ? `checkpoint ${race.cp}/${N - 1}` : `lap ${race.lap}/${finishLap} · checkpoint ${race.cp}/${N}`}`;
    race.waypoint = cpPos;
    race.next = ptAt(race.cp + 1);
  }

  finish(race) {
    const A = this.A, g = A.game, r = race.r;
    const rank = race.finished.length + 1;
    const pay = (r.prize[rank - 1] || 0) + (rank === 1 && race.bet ? race.bet * 3 : 0);
    g.stats?.best?.(`race-${r.id}`, race.startT);
    g.stats?.add?.('racesWon', rank === 1 ? 1 : 0);
    g.news?.add(rank === 1 ? `Residents complain of another illegal street race on the ${r.name.toLowerCase()} route. The winner's long gone.` : 'Street racers were spotted tearing through town again last night.', 'crime');
    if (rank === 1 && race.bet) g.hud.toast(`Your bet pays out: ${money(race.bet * 3)}`, 0x7be08a);
    A.end(rank <= 3, `${rank}${['st', 'nd', 'rd'][rank - 1] || 'th'} PLACE · ${race.startT.toFixed(1)}s`, pay);
  }
}

// ---------------------------------------------------------------- taxi, ambulance, fire truck
function taxiMesh() {
  const m = modelMesh({ id: 'taxi', scale: [1, 1, 1.03] }, 0xf2c21a);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.35), new THREE.MeshStandardMaterial({ map: canvasTex(64, 24, (c, w, h) => { c.fillStyle = '#ffe680'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 18px Arial'; c.textAlign = 'center'; c.fillText('TAXI', w / 2, 19); }), emissive: 0xffe060, emissiveIntensity: 0.6 }));
  sign.position.set(0, 1.78, 0.2); m.add(sign);
  for (const s of [-1, 1]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 2.2), std({ color: 0x111111 })); ch.position.set(s * 0.96, 0.7, 0); m.add(ch); }
  return m;
}
function ambulanceMesh() {
  const spec = { id: 'amb', scale: [1.1, 1.35, 1.22], rack: false };
  const m = modelMesh(spec, 0xf2f2ee);
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 4.6), std({ color: 0xc62828 })); st.position.set(s * 1.06, 1.05, 0.1); m.add(st); const cr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: canvasTex(32, 32, (c) => { c.fillStyle = '#c62828'; c.fillRect(11, 2, 10, 28); c.fillRect(2, 11, 28, 10); }), transparent: true })); cr.position.set(s * 1.08, 1.5, 0.9); cr.rotation.y = s * Math.PI / 2; m.add(cr); }
  for (const [x, c] of [[-0.35, 0xff2020], [0.35, 0x2050ff]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4 })); l.position.set(x, 2.2, -1.0); m.add(l); }
  return m;
}
function fireTruckMesh() {
  const m = modelMesh({ id: 'fire', scale: [1.2, 1.4, 1.55] }, 0xc0201a);
  const steel = std({ color: 0xc8ccd0, metalness: 0.7, roughness: 0.3 });
  const ladder = new THREE.Group(); ladder.position.set(0, 2.35, 0.4); m.add(ladder);
  for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 5.5), steel); rail.position.set(s * 0.35, 0, 0); ladder.add(rail); }
  for (let k = 0; k < 11; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.04), steel); r.position.set(0, 0, -2.6 + k * 0.52); ladder.add(r); }
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 10), steel); cannon.rotation.x = Math.PI / 2 - 0.3; cannon.position.set(0, 2.45, -1.9); m.add(cannon);
  for (const [x, c] of [[-0.4, 0xff2020], [0.4, 0xff2020]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4 })); l.position.set(x, 2.3, -2.4); m.add(l); }
  return m;
}

class VehicleJobs {
  constructor(A) {
    this.A = A;
    const g = A.game, C = g.city;
    this.fires = [];
    // taxis in the city traffic, one waiting at the plaza rank; the ambulance and fire engine outside the hospital
    for (let k = 0; k < 3; k++) {
      const c = g.traffic.spawn(g.traffic.nets[0], 25, (o) => { const car = new Car(g, { ...o, mesh: taxiMesh(), maxSpeed: 32 }); car.taxi = true; return car; });
      void c;
    }
    const park = (x, z, heading, mesh, flag, extra = {}) => {
      const half = extra.half;
      if (!clearSpot(g, x, z, heading, half, LAND_Y + KERB)) return null;
      const car = new Car(g, { x, z, heading, mesh, ...extra });
      car[flag] = true;
      g.vehicles.parked.push(car);
      return car;
    };
    const pl = C.plaza;
    park(pl.x + 30.5, pl.z - 14, 0, taxiMesh(), 'taxi', { maxSpeed: 32 });
    const h = C.hospital;
    this.er = new THREE.Vector3(h.x, LAND_Y + KERB, h.z - 2.5);
    park(h.x + 10, h.z - 6.5, Math.PI / 2, ambulanceMesh(), 'ambulance', { half: { x: 1.05, y: 0.75, z: 2.75 }, hp: 200, maxSpeed: 33 });
    park(h.x - 12, h.z - 6.5, Math.PI / 2, fireTruckMesh(), 'firetruck', { half: { x: 1.15, y: 0.78, z: 3.5 }, hp: 320, maxSpeed: 27, density: 170 });
    // water from the fire engine's cannon
    this.water = [];
  }

  idle(dt) {
    const g = this.A.game, v = g.vehicles.active;
    // the fire engine's water cannon works any time you hold F in it
    if (v?.firetruck && g.keys.has('KeyF')) this.spray(v, dt);
    for (const f of [...this.fires]) this.burn(f, dt);
  }

  kindOf(v) { return v?.taxi ? 'taxi' : v?.ambulance ? 'ambulance' : v?.firetruck ? 'fire' : null; }

  toggle() {
    const A = this.A, g = A.game, v = g.vehicles.active, kind = this.kindOf(v);
    if (!kind) return false;
    if (A.cur?.vjob) { A.end(true, `${A.cur.title}: off duty`); return true; }
    const job = { title: { taxi: 'Taxi', ambulance: 'Paramedic', fire: 'Firefighter' }[kind], vjob: kind, level: 1, earned: 0, vehicle: v };
    job.update = (dt) => this.update(job, dt);
    job.cleanup = () => this.cleanup(job);
    if (A.start(job)) { this.nextCall(job); g.hud.toast(`On duty. Y again to clock off.${kind === 'fire' ? ' Hold F to spray.' : ''}`, 0x9ec5ff); }
    return true;
  }

  point(minD = 120, maxD = 450) {
    const g = this.A.game, C = g.citizens, p = g.vehicles.active?.pos || g.shorePlayer.body.translation();
    for (let k = 0; k < 40; k++) {
      const q = C.pavementPoint(minD);
      if (q && Math.hypot(q.x - p.x, q.z - p.z) < maxD) return q;
    }
    return C.pavementPoint(minD);
  }

  nextCall(job) {
    const g = this.A.game;
    job.stage = 'pickup';
    job.next = null;
    if (job.vjob === 'taxi') {
      const p = this.point(90, 400);
      const n = g.citizens.spawnCitizen('city', 'civ', p, { look: { shirt: 0x8a5a3a + Math.floor(Math.random() * 0x404040), pants: 0x2c3440, skin: 0xd9a47c } });
      if (n) { n.fare = true; n.idle = 999; g.citizens.setMarker(n, '!'); }
      job.fare = n; job.waypoint = p; job.text = 'Pick up the fare (stop next to them)';
      job.timeLeft = 40 + p.distanceTo(job.vehicle.pos) / 9;
    } else if (job.vjob === 'ambulance') {
      const p = this.point(100, 450);
      const fig = buildFigure({ shirt: 0x5a7a9a, pants: 0x2c3440, skin: 0xf1c9a5 });
      fig.root.position.set(p.x, p.y + 0.2, p.z); fig.root.rotation.set(-Math.PI / 2, Math.random() * 6, 0, 'YXZ');
      g.scene.add(fig.root);
      job.patient = fig; job.waypoint = p; job.text = 'Get to the patient';
      job.timeLeft = 35 + p.distanceTo(job.vehicle.pos) / 10;
    } else {
      const p = this.point(120, 500);
      const f = this.startFire(p, 0.8 + job.level * 0.15);
      job.fire = f; job.waypoint = p; job.text = 'Put the fire out (hold F to spray)';
      job.timeLeft = 50 + p.distanceTo(job.vehicle.pos) / 10;
    }
  }

  update(job, dt) {
    const A = this.A, g = A.game, v = g.vehicles.active;
    if (v !== job.vehicle || job.vehicle.wreck) { A.end(false, `${job.title}: you left the vehicle`); return; }
    const near = (p, r) => Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < r;
    const stopped = Math.abs(v.speed) < 2;
    if (job.vjob === 'taxi') {
      if (job.stage === 'pickup' && job.fare) {
        if (!g.citizens.list.includes(job.fare)) { g.hud.toast('Your fare\'s gone. Next call…', 0xffd166); this.nextCall(job); return; }
        const t = job.fare.body.translation();
        if (near(t, 7) && stopped) {
          g.citizens.despawn(job.fare); job.fare = null;
          job.stage = 'drop';
          const dest = this.point(200, 700);
          job.dest = dest; job.waypoint = dest; job.dist = dest.distanceTo(v.pos);
          job.timeLeft = 25 + job.dist / 10;
          job.text = ['"Plaza Tower, and step on it."', '"The marina, please."', '"Follow… no, just go there."', '"Hollows. Don\'t ask."', '"Anywhere but here, man."'][Math.floor(Math.random() * 5)] + ' Drive to the drop-off';
          g.sfx.play('select');
        }
      } else if (job.stage === 'drop' && near(job.dest, 8) && stopped) {
        const pay = 40 + job.dist * 0.35 + job.timeLeft * 4;
        g.economy.addMoney(pay, 'fare');
        job.earned += pay; job.level++;
        g.stats?.add?.('fares', 1);
        this.nextCall(job);
      }
    } else if (job.vjob === 'ambulance') {
      if (job.stage === 'pickup' && near(job.waypoint, 7) && stopped) {
        job.patient.removeFromParent(); job.patient = null;
        job.stage = 'drop'; job.waypoint = this.er; job.timeLeft = 20 + this.er.distanceTo(v.pos) / 10; job.text = 'Get them to the hospital';
        g.sfx.play('select');
      } else if (job.stage === 'drop' && near(this.er, 10) && stopped) {
        const pay = 150 + job.level * 60 + job.timeLeft * 3;
        g.economy.addMoney(pay, 'patient delivered');
        g.health.heal?.(20);
        job.earned += pay; job.level++;
        g.stats?.add?.('patients', 1);
        this.nextCall(job);
      }
    } else if (job.fire && job.fire.strength <= 0) {
      const pay = 200 + job.level * 80 + job.timeLeft * 3;
      g.economy.addMoney(pay, 'fire out');
      job.earned += pay; job.level++;
      g.stats?.add?.('fires', 1);
      this.nextCall(job);
    }
    job.text = job.text?.replace(/ \(level \d+\)$/, '') + ` (level ${job.level})`;
  }

  cleanup(job) {
    const g = this.A.game;
    if (job.fare && g.citizens.list.includes(job.fare)) g.citizens.despawn(job.fare);
    job.patient?.removeFromParent();
    if (job.fire) this.stopFire(job.fire);
    if (job.earned) g.hud.toast(`${job.title} shift: ${money(job.earned)} earned`, 0x7be08a);
  }

  // ---- fires
  startFire(p, size = 1) {
    const g = this.A.game;
    const grp = new THREE.Group(); grp.position.set(p.x, p.y, p.z); g.scene.add(grp);
    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.25, 1.1), std({ color: 0x1b1d1a, roughness: 1 })); bin.position.y = 0.62; grp.add(bin);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); glow.position.y = 1.6; grp.add(glow);
    const f = { grp, glow, pos: p.clone().add(new THREE.Vector3(0, 1.4, 0)), strength: size, max: size };
    this.fires.push(f);
    return f;
  }

  stopFire(f) { f.grp.removeFromParent(); const i = this.fires.indexOf(f); if (i >= 0) this.fires.splice(i, 1); }

  burn(f, dt) {
    const g = this.A.game, k = f.strength / f.max;
    if (f.strength <= 0) { f.glow.visible = false; if ((f.smokeT = (f.smokeT || 0) + dt) > 6) this.stopFire(f); if (Math.random() < dt * 6) g.fx.emit(f.pos.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.4, (Math.random() - 0.5) * 0.4), 0x777777, 2, -0.1, 0.3); return; }
    f.glow.scale.setScalar(0.6 + k * 0.6 + Math.sin(performance.now() / 90) * 0.05);
    for (let i = 0; i < 3; i++) if (Math.random() < k) g.fx.emit(f.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 0.8)), new THREE.Vector3((Math.random() - 0.5) * 0.8, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 0.8), Math.random() < 0.5 ? 0xff7a1a : 0xffc040, 0.6, -0.3, 0.4);
    if (Math.random() < dt * 4 * k) g.fx.emit(f.pos.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(0, 2.5, 0), 0x333333, 3, -0.15, 0.3);
    // standing in it hurts
    const pt = g.shorePlayer.body.translation();
    if (!g.vehicles.active && Math.hypot(pt.x - f.pos.x, pt.z - f.pos.z) < 1.8) g.health.damage(dt * 20 * k, 'fire');
  }

  spray(v, dt) {
    const g = this.A.game, f = v.forward;
    const nozzle = v.pos.clone().add(new THREE.Vector3(0, 2.6, 0)).addScaledVector(f, 2.8);
    for (let i = 0; i < 4; i++) g.fx.emit(nozzle.clone(), f.clone().multiplyScalar(16 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2)), Math.random() < 0.5 ? 0xbfe0ff : 0xffffff, 0.9, 1, 0);
    for (const fire of this.fires) {
      const to = fire.pos.clone().sub(v.pos); const d = to.length();
      if (d < 22 && to.setY(0).normalize().dot(f) > 0.8 && fire.strength > 0) {
        fire.strength -= dt * 0.35;
        if (Math.random() < dt * 10) g.fx.emit(fire.pos.clone(), new THREE.Vector3((Math.random() - 0.5), 2, (Math.random() - 0.5)), 0xdddddd, 1.5, -0.1, 0.3); // steam
      }
    }
    // it knocks people flying, too
    for (const n of [...g.citizens.list]) {
      const t = n.body.translation(), to = new THREE.Vector3(t.x - v.pos.x, 0, t.z - v.pos.z), d = to.length();
      if (d < 16 && d > 2 && to.normalize().dot(f) > 0.92 && Math.random() < dt * 2) g.citizens.knockOver?.(n, f.clone().multiplyScalar(8).setY(2), 3, {});
    }
  }
}

// ---------------------------------------------------------------- odd jobs from the phone
const ODD = [
  { id: 'drop', who: 'Vic', name: 'Drop-off', desc: 'Pick up a package and get it across town before the buyer walks.', pay: 900 },
  { id: 'repo', who: 'Dimitri', name: 'Repo', desc: 'A guy owes me. Take his car (it\'s marked) and bring it to my alley. Drive it in or tow it in.', pay: 1500 },
  { id: 'tail', who: 'Rosa', name: 'Tail', desc: 'Follow the purple car for a minute and a half. Don\'t get close, don\'t lose it.', pay: 1100 },
  { id: 'hot', who: 'Dimitri', name: 'Hot car', desc: 'There\'s a Stiletto I need at the Verian docks scrapyard. Every scratch comes off your cut.', pay: 3000 },
];

class OddJobs {
  constructor(A) {
    this.A = A;
    this.cool = {}; // id -> time it's available again
    this.list = ODD;
    this.app = { id: 'odd', icon: '🧰', name: 'Odd jobs', render: (head) => this.render(head), act: (cmd, d) => this.act(cmd, d) };
  }

  // the phone app (the phone comes with the story, which is set up after us)
  register() {
    const ph = this.A.game.story?.phone;
    if (!ph || this.registered) return;
    ph.addApp(this.app);
    this.registered = true;
  }

  render(head) {
    const g = this.A.game, now = g.time;
    return head('Odd jobs') + '<div class="ph-list">' + this.list.map((j) => {
      const wait = Math.max(0, Math.ceil((this.cool[j.id] || 0) - now));
      const on = this.A.cur?.odd === j.id;
      return `<div class="ph-item"><div><b>${j.name} <small style="display:inline">· ${j.who}</small></b><small>${j.desc} ${money(j.pay)}.</small></div>
        ${on ? '<button data-a="app-act" data-app="odd" data-cmd="quit">Quit</button>' : wait ? `<small>${wait}s</small>` : `<button data-a="app-act" data-app="odd" data-cmd="go" data-id="${j.id}">Take it</button>`}</div>`;
    }).join('') + '</div>';
  }

  act(cmd, d) {
    const A = this.A, g = A.game;
    if (cmd === 'quit') { A.end(false, 'Job abandoned'); return; }
    if (cmd !== 'go') return;
    const j = this.list.find((x) => x.id === d.id);
    const job = { title: `${j.name} (${j.who})`, odd: j.id, j };
    job.update = (dt) => this[j.id](job, dt);
    job.cleanup = () => { for (const c of job.cars || []) A.removeCar(c); if (job.pkg) job.pkg.removeFromParent(); };
    job.onChop = (car) => { if (job.target === car) { this.done(job, j.pay); } };
    job.marks = () => (job.target && !job.target.wreck ? [{ x: job.target.pos.x, z: job.target.pos.z, color: job.j.id === 'tail' ? '#b45aff' : '#ff3030', r: 4 }] : []);
    if (!A.start(job)) return;
    this.cool[j.id] = g.time + 120;
    g.story.phone.close();
    this.setup(job);
  }

  done(job, pay) { this.A.end(true, `${job.j.name}: done`, pay); }

  far(island, min = 200) {
    const g = this.A.game, p = g.shorePlayer.body.translation();
    for (let k = 0; k < 40; k++) { const q = island === 'city' ? g.citizens.pavementPoint(min) : g.citizens.randomPointOn(island); if (q && Math.hypot(q.x - p.x, q.z - p.z) > min) return q; }
    return g.citizens.pavementPoint(min);
  }

  parkedTarget(at, mesh, extra = {}) {
    const g = this.A.game;
    const c = new Car(g, { x: at.x, z: at.z, heading: Math.random() * Math.PI * 2, mesh, ...extra });
    c.base = 900;
    g.vehicles.parked.push(c);
    return c;
  }

  setup(job) {
    const A = this.A, g = A.game, id = job.j.id;
    if (id === 'drop') {
      const a = this.far('city', 120), b = this.far(Math.random() < 0.5 ? 'town' : 'hood', 300);
      const pkg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.45), std({ color: 0x8a6a48 })); pkg.position.set(a.x, a.y + 0.2, a.z); g.scene.add(pkg);
      Object.assign(job, { pkg, a, b, stage: 'get', waypoint: a, text: 'Pick up the package', timeLeft: 120 });
    } else if (id === 'repo' || id === 'hot') {
      const isl = id === 'repo' ? (Math.random() < 0.5 ? 'hood' : 'town') : 'city';
      let at = null;
      for (let k = 0; k < 30 && !at; k++) { const R = g[isl === 'hood' ? 'hood' : isl === 'town' ? 'saltmarsh' : 'city']; const x = R.xs[Math.floor(Math.random() * R.xs.length)] + (Math.random() < 0.5 ? -1 : 1) * (isl === 'city' ? 6.5 : 3.5), z = R.zs[Math.floor(Math.random() * (R.zs.length - 1))] + 20 + Math.random() * 30; if (clearSpot(g, x, z, 0)) at = { x, z }; }
      if (!at) { A.end(false, 'No car today'); return; }
      const m = CAR_MODELS.find((x) => x.id === (id === 'hot' ? 'sports' : 'muscle'));
      const c = this.parkedTarget(at, modelMesh(m, id === 'hot' ? 0xf2d23a : 0x7a2a2a), { hp: m.hp, maxSpeed: m.maxSpeed, half: { x: 0.95 * m.scale[0], y: 0.55 * m.scale[1], z: 2.25 * m.scale[2] } });
      c.base = id === 'hot' ? 2000 : 900;
      Object.assign(job, { target: c, stage: 'get', waypoint: c.pos, text: id === 'hot' ? 'Find the yellow Stiletto' : 'Find the marked car' });
    } else if (id === 'tail') {
      const net = g.traffic.nets[0];
      const c = g.traffic.spawn(net, 140, (o) => new Car(g, { ...o, color: 0x8a2ad8 }));
      if (!c) { A.end(false, 'They didn\'t show'); return; }
      A.cars.push(c);
      Object.assign(job, { target: c, stage: 'tail', follow: 0, close: 0, lost: 0, waypoint: c.pos, text: 'Find the purple car and follow it' });
    }
  }

  // ---- each job's tick
  drop(job) {
    const g = this.A.game, p = g.vehicles.active?.pos || g.shorePlayer.body.translation();
    const near = (q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
    if (job.stage === 'get') { job.pkg.rotation.y += 0.03; if (near(job.a, 3.5)) { job.pkg.removeFromParent(); job.pkg = null; job.stage = 'go'; job.waypoint = job.b; job.text = 'Deliver the package'; job.timeLeft = 30 + job.a.distanceTo(job.b) / 9; g.sfx.play('grab'); } }
    else if (near(job.b, 5)) this.done(job, job.j.pay + Math.round(job.timeLeft * 5));
  }

  repo(job) {
    const g = this.A.game, c = job.target;
    if (c.wreck) { this.A.end(false, 'You wrecked it'); return; }
    if (g.vehicles.active === c || c.towed) { job.stage = 'bring'; job.text = 'Bring it to Dimitri\'s chop shop alley'; const d = g.underworld.dealers.find((x) => x.kind === 'chop'); job.waypoint = d ? new THREE.Vector3((d.alley.x0 + d.alley.x1) / 2, LAND_Y, d.alley.z) : null; }
    else { job.waypoint = c.pos; job.text = job.stage === 'bring' ? 'Get back to the car' : 'Find the marked car (steal it or hook it with a tow truck)'; }
  }

  hot(job) {
    const g = this.A.game, c = job.target;
    if (c.wreck) { this.A.end(false, 'You wrecked it'); return; }
    const yard = new THREE.Vector3(DUMP.bay.x - 12, LAND_Y, DUMP.bay.z);
    const cond = Math.round((c.hp / c.maxHp) * 100);
    if (g.vehicles.active === c) {
      job.waypoint = yard; job.text = `Deliver it to the scrapyard on the docks (condition ${cond}%)`;
      if (Math.hypot(c.pos.x - yard.x, c.pos.z - yard.z) < 12 && Math.abs(c.speed) < 2) {
        g.vehicles.exit();
        const pay = Math.round(job.j.pay * Math.max(0.2, c.hp / c.maxHp));
        g.vehicles.remove(c);
        this.done(job, pay);
      }
    } else { job.waypoint = c.pos; job.text = 'Steal the yellow Stiletto'; }
  }

  tail(job, dt) {
    const g = this.A.game, c = job.target;
    if (!g.traffic.cars.includes(c) || c.wreck) { this.A.end(false, 'The car\'s gone'); return; }
    const p = g.vehicles.active?.pos || g.shorePlayer.body.translation();
    const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
    job.waypoint = c.pos;
    if (d < 12) { job.close += dt; if (job.close > 3) { this.A.end(false, 'They spotted you'); return; } } else job.close = Math.max(0, job.close - dt);
    if (d > 90) { job.lost += dt; if (job.lost > 8) { this.A.end(false, 'You lost them'); return; } } else job.lost = 0;
    if (d < 75) job.follow += dt;
    const left = Math.max(0, 90 - job.follow);
    job.text = d < 12 ? 'Too close! Back off' : d > 75 ? 'You\'re losing them!' : `Tailing: ${Math.ceil(left)}s to go`;
    if (left <= 0) this.done(job, job.j.pay);
  }
}
export { islandAt };
