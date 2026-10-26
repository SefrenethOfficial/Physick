import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS } from './groups.js';
import { buildFigure, randomLook, animateWalk } from './figure.js';
import { Car, runOver } from './carphys.js';
import { carMesh, canvasTex } from './buildkit.js';
import { CAR_MODELS, modelMesh } from './dealership.js';
import { bikeMesh, busMesh, towMesh } from './fleet.js';
import { monsterTruckMesh } from './elmonstruo.js';
import { taxiMesh } from './activities.js';
import { buildBoat, BOAT_BY_ID } from './boats.js';
import { buildJet } from './jets.js';
import { Heli } from './cargo.js';
import { LAND_Y, islandAt } from './world.js';
import { setMpSession, seeded } from './netseed.js';

// Multiplayer. Everyone in a room connects to the Physick server (server/index.js), which relays
// messages. Each game is in charge of its own player: where you are, what you're driving, your
// own cars and the cops chasing you; it sends that out 15 times a second and everyone else draws
// it. One game, the "world host", also runs the shared city life (traffic and pedestrians) and
// sends that out too; the others mirror it, and tell the host when they shoot someone or steal
// a car. If the host leaves (or tabs away), the server hands the job to someone else and their
// game carries on from what it was mirroring.

const SEND_DT = 1 / 15;
const WORLD_DT = 1 / 10;
const DELAY = 0.12; // remote players are drawn this far behind, so there's always a pair to blend between
const FOOT = 0.83; // capsule centre to feet
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export function wsUrl(http) { return http.replace(/^http/, 'ws').replace(/\/$/, ''); }
export function httpUrl(url) { return (/^https?:\/\//.test(url) ? url : `https://${url}`).replace(/^ws/, 'http').replace(/\/$/, ''); }

// A look for a player, from their name (so it's the same every game, for everyone).
export function lookFor(name) {
  let h = 2166136261;
  for (const c of String(name)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const orig = Math.random; Math.random = seeded(h);
  const look = randomLook();
  Math.random = orig;
  return look;
}

// A car's body from its spec string (see Car.spec).
function carFromSpec(g, spec, x, y, z, heading) {
  const [m, dims] = String(spec).split('|');
  const [k, a, b] = m.split(':');
  let mesh;
  try {
    if (k === 'm') { const model = CAR_MODELS.find((q) => q.id === a); mesh = model ? modelMesh(model, +b) : carMesh(); }
    else if (k === 's') mesh = modelMesh({ id: '_', scale: b.split(',').map(Number) }, +a);
    else if (k === 'b') mesh = bikeMesh(+a, { sport: b === '1' });
    else if (k === 'u') mesh = busMesh(+a);
    else if (k === 't') mesh = towMesh(+a);
    else if (k === 'x') mesh = monsterTruckMesh();
    else if (k === 'y') mesh = taxiMesh();
    else mesh = carMesh(+a || 0x2f7fd8, b === '1');
  } catch { mesh = carMesh(); }
  const [hx, hy, hz, ride, wb] = (dims || '').split(',').map(Number);
  const car = new Car(g, { mesh, x, z, heading, police: k === 'c' && b === '1', half: hx ? { x: hx, y: hy, z: hz } : undefined, ride: ride || 0.55, wheelbase: wb || 2.7 });
  car.body.setTranslation({ x, y, z }, true);
  car.pos.set(x, y, z);
  if (k === 'y') car.taxi = true;
  if (k === 'u') car.bus = true;
  if (k === 'b') car.bike = true;
  if (k === 'x') car.monster = true;
  return car;
}

function nameTag(text, color = '#ffffff') {
  const tex = canvasTex(256, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.font = 'bold 30px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tw = Math.min(w - 8, c.measureText(text).width + 24);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.roundRect((w - tw) / 2, 10, tw, 44, 12); c.fill();
    c.fillStyle = color; c.fillText(text, w / 2, 33);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

// ------------------------------------------------------------------ someone walking about
// A figure with a capsule you can bump into and shoot; moved to wherever its owner says.
class Puppet {
  constructor(net, look) {
    this.net = net;
    const g = net.g, w = g.portWorld;
    this.fig = buildFigure(look);
    g.scene.add(this.fig.root);
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.28).setCollisionGroups(GROUPS.npc), this.body);
    net.byCollider.set(this.collider.handle, this);
    this.pos = new THREE.Vector3(0, -50, 0);
    this.yaw = 0; this.speed = 0; this.phase = Math.random() * 6;
    this.shown = false;
  }

  place(x, y, z, yaw, speed, mode = 'f') {
    const lying = mode === 'd' || mode === 'r';
    this.pos.set(x, y, z);
    this.yaw = yaw; this.speed = speed;
    const root = this.fig.root;
    const visible = mode === 'f' || mode === 's' || lying;
    root.visible = visible;
    this.collider.setEnabled(mode === 'f' || mode === 's');
    this.body.setNextKinematicTranslation({ x, y: visible ? y : -50, z });
    root.position.set(x, lying ? y - FOOT + 0.15 : y, z);
    root.rotation.set(lying ? -Math.PI / 2 : 0, yaw, 0, 'YXZ');
  }

  animate(dt) {
    this.phase += dt * (2.5 + this.speed * 2.6);
    animateWalk(this.fig.parts, this.phase, Math.min(this.speed / 1.5, 3));
  }

  dispose() {
    this.net.byCollider.delete(this.collider.handle);
    this.net.g.portWorld.removeRigidBody(this.body);
    this.fig.root.removeFromParent();
  }
}

// ------------------------------------------------------------------ another player
class Remote {
  constructor(net, id, name, look) {
    this.net = net; this.id = id; this.name = name;
    this.look = look || lookFor(name);
    this.puppet = new Puppet(net, this.look);
    this.puppet.remote = this;
    this.tag = nameTag(name);
    net.g.scene.add(this.tag);
    this.buf = []; // [{ t, s }]
    this.state = null;
    this.ride = null; // { kind, mesh } a boat / helicopter / jet they're in
  }

  push(s) {
    const now = performance.now() / 1000;
    this.buf.push({ t: now, s });
    if (this.buf.length > 20) this.buf.shift();
    this.state = s;
  }

  // the pose DELAY seconds ago, blended between the two states either side of it
  sample() {
    const b = this.buf;
    if (!b.length) return null;
    const t = performance.now() / 1000 - DELAY;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) i--;
    const A = b[Math.max(0, i - 1)], B = b[i];
    if (!A || A === B || B.t <= A.t) return { ...B.s };
    const k = THREE.MathUtils.clamp((t - A.t) / (B.t - A.t), 0, 1.2);
    const s = { ...B.s };
    if (A.s.p && B.s.p && A.s.m === B.s.m) {
      s.p = A.s.p.map((v, j) => v + (B.s.p[j] - v) * k);
      s.y = angLerp(A.s.y, B.s.y, Math.min(k, 1));
      if (A.s.v?.p && B.s.v?.p) s.v = { ...B.s.v, p: A.s.v.p.map((v, j) => v + (B.s.v.p[j] - v) * k), q: slerpArr(A.s.v.q, B.s.v.q, Math.min(k, 1)) };
    }
    return s;
  }

  update(dt) {
    const s = this.sample();
    if (!s) return;
    const P = this.puppet, [x, y, z] = s.p;
    P.place(x, y, z, s.y, s.sp || 0, s.m);
    if (s.m === 'f' || s.m === 's') P.animate(dt);
    // a ride with no physics of its own here: a boat, a helicopter or a jet
    const kind = s.v?.k;
    if (kind && kind !== 'c') {
      const key = `${kind}:${s.v.n ?? ''}`;
      if (this.ride?.key !== key) { this.dropRide(); this.ride = this.makeRide(kind, s.v.n, key); }
      if (this.ride) {
        const m = this.ride.mesh;
        m.visible = true;
        m.position.fromArray(s.v.p);
        if (s.v.q) m.quaternion.fromArray(s.v.q);
        if (this.ride.rotor) this.ride.rotor.rotation.y += dt * 30;
      }
    } else this.dropRide();
    // name over their head (or their car)
    const car = s.m === 'c' ? this.net.pcars.get(`${this.id}:${s.v?.cid}`) : null;
    const at = car ? car.pos.clone().add(new THREE.Vector3(0, 2.6, 0)) : this.ride ? this.ride.mesh.position.clone().add(new THREE.Vector3(0, 3.2, 0)) : new THREE.Vector3(x, y + 1.2, z);
    this.tag.position.copy(at);
    const dist = this.net.g.camera.position.distanceTo(at);
    this.tag.visible = s.m !== 'x' && dist < 400;
    const k = Math.max(1, dist / 14); // (about the same size on screen however far away)
    this.tag.scale.set(1.6 * k, 0.4 * k, 1);
    this.where = at;
  }

  makeRide(kind, n, key) {
    const g = this.net.g;
    let mesh, rotor = null;
    if (kind === 'b') { const type = BOAT_BY_ID[n] || BOAT_BY_ID.dinghy || Object.values(BOAT_BY_ID)[0]; mesh = buildBoat(type).root; }
    else if (kind === 'j') mesh = buildJet(n || '00').root;
    else if (kind === 'h') { const h = new Heli(g); mesh = h.root; rotor = h.rotor; h.ladder.visible = false; mesh.removeFromParent(); }
    else return null;
    g.scene.add(mesh);
    return { key, mesh, rotor };
  }

  dropRide() {
    if (!this.ride) return;
    this.ride.mesh.removeFromParent();
    this.ride = null;
  }

  dispose() {
    this.puppet.dispose();
    this.tag.removeFromParent();
    this.dropRide();
  }
}

function slerpArr(a, b, k) {
  if (!a || !b) return b || a;
  const qa = new THREE.Quaternion().fromArray(a), qb = new THREE.Quaternion().fromArray(b);
  return qa.slerp(qb, k).toArray();
}

// ------------------------------------------------------------------ the connection
export class Net {
  constructor(game, session) {
    this.g = game;
    this.s = session;
    this.id = null;
    this.host = null;
    this.players = new Map(); // id -> Remote
    this.pcars = new Map(); // "owner:cid" -> Car (other players' cars, and the cop cars chasing them)
    this.pcops = new Map(); // "owner:lid" -> Puppet (cops on foot chasing other players)
    this.byCollider = new Map(); // collider handle -> Puppet
    this.mirrorCars = new Map(); // nid -> Car (the host's traffic)
    this.mirrorPeds = new Map(); // nid -> npc (the host's pedestrians)
    this.looks = new Map(); // nid -> look
    this.asked = new Set();
    this.gone = new Map(); // nid -> time: taken or killed here, so ignore the host for a moment
    this.dead = []; // host: [nid, vx, vy, vz, time] recently knocked down
    this.nextNid = 1;
    this.nextCid = 1;
    this.sendT = 0; this.worldT = 0; this.pingT = 0;
    this.ping = 0;
    this.status = 'connecting';
    this.feed = [];
  }

  get isHost() { return this.id != null && this.host === this.id; }
  get mirroring() { return !this.isHost; }
  get carList() { return [...this.pcars.values()]; }

  // Open the connection and wait until we're in the room (or it fails).
  connect(timeout = 9000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); } };
      let ws;
      try { ws = new WebSocket(wsUrl(this.s.url)); } catch (e) { fail(`Bad server address (${e.message})`); return; }
      this.ws = ws;
      const timer = setTimeout(() => { fail('The server didn\'t answer'); try { ws.close(); } catch { /* */ } }, timeout);
      ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', room: this.s.room, name: this.s.name, look: lookFor(this.s.name) })); if (document.hidden) ws.send(JSON.stringify({ t: 'away', v: true })); };
      if (!this.visBound) { this.visBound = true; document.addEventListener('visibilitychange', () => this.send({ t: 'away', v: document.hidden })); }
      ws.onerror = () => fail('Couldn\'t reach the server');
      ws.onclose = () => {
        clearTimeout(timer);
        if (!done) { fail('The server closed the connection'); return; }
        this.lost();
      };
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'error') { this.errorMsg = msg.msg; fail(msg.msg); return; }
        if (msg.t === 'welcome' && !done) {
          done = true; clearTimeout(timer);
          this.welcome(msg);
          resolve(msg);
          return;
        }
        this.onMessage(msg);
      };
    });
  }

  welcome(msg) {
    const was = this.isHost;
    this.id = msg.id;
    this.room = msg.room;
    this.status = 'online';
    for (const p of msg.players) if (p.id !== this.id && !this.players.has(p.id)) this.players.set(p.id, new Remote(this, p.id, p.name, p.look));
    this.setHost(msg.host, was);
  }

  // Connection dropped mid-game: keep playing, and keep trying to get back in.
  lost() {
    if (this.leaving) return;
    this.status = 'reconnecting';
    this.g.hud?.toast('Lost the connection to the server: reconnecting…', 0xff8a6a);
    for (const r of this.players.values()) r.dispose();
    this.players.clear();
    for (const k of [...this.pcars.keys()]) this.dropCar(k);
    for (const k of [...this.pcops.keys()]) { this.pcops.get(k).dispose(); this.pcops.delete(k); }
    clearTimeout(this.retryT);
    this.retryT = setTimeout(() => {
      this.connect().then(() => this.g.hud?.toast('Back online', 0x7be08a)).catch((e) => {
        if (/closed|full/.test(e.message)) { this.status = 'offline'; this.g.hud?.toast(`Multiplayer: ${e.message}`, 0xff8a6a); return; }
        this.lost();
      });
    }, 3000);
  }

  leave() {
    this.leaving = true;
    setMpSession(null);
    try { this.ws?.close(); } catch { /* */ }
    location.reload();
  }

  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  event(k, data = {}, to = null) { this.send({ t: 'e', k, to: to ?? undefined, ...data }); }
  nameOf(id) { return id === this.id ? this.s.name : this.players.get(id)?.name || 'Someone'; }

  // ---------------------------------------------------------------- incoming
  onMessage(m) {
    const g = this.g;
    switch (m.t) {
      case 'join':
        if (m.id === this.id || this.players.has(m.id)) return;
        this.players.set(m.id, new Remote(this, m.id, m.name, m.look));
        this.say(`${m.name} joined`, '#7be08a');
        g.sfx.play('grab');
        break;
      case 'leave': {
        const r = this.players.get(m.id);
        if (!r) return;
        this.say(`${r.name} left`, '#c9ced4');
        r.dispose();
        this.players.delete(m.id);
        for (const k of [...this.pcars.keys()]) if (k.startsWith(`${m.id}:`)) this.dropCar(k);
        for (const k of [...this.pcops.keys()]) if (k.startsWith(`${m.id}:`)) { this.pcops.get(k).dispose(); this.pcops.delete(k); }
        break;
      }
      case 'host': {
        const was = this.isHost;
        this.setHost(m.id, was);
        if (m.id === this.id) this.say('You\'re running the city now (the last host left)', '#ffd166');
        break;
      }
      case 's': this.onState(m); break;
      case 'w': if (!this.isHost) this.onWorld(m); break;
      case 'e': this.onEvent(m); break;
      case 'chat': this.say(`${m.name}: ${m.text}`, m.id === this.id ? '#ffd166' : '#ffffff', true); g.sfx.play('cash'); break;
      case 'pong': this.ping = Math.round(performance.now() - m.c); break;
    }
  }

  setHost(id, was) {
    this.host = id;
    const now = this.isHost;
    if (now && !was) this.becomeHost();
    else if (!now && was) this.becomeMirror();
  }

  // ---------------------------------------------------------------- the shared world
  // Taking over the city: what we were mirroring becomes real traffic and real people again.
  becomeHost() {
    const g = this.g;
    if (!g.citizens || !g.traffic) return; // (still loading: nothing to take over yet)
    for (const [nid, npc] of this.mirrorPeds) {
      delete npc.mirror;
      npc.state = npc.role === 'cop' ? 'patrol' : 'wander';
      npc.ambient = true;
      this.nextNid = Math.max(this.nextNid, nid + 1);
    }
    for (const [nid, car] of this.mirrorCars) {
      delete car.mirror;
      this.nextNid = Math.max(this.nextNid, nid + 1);
      if (!g.traffic.cars.includes(car)) continue;
      const net = g.traffic.nets.find((n) => n.id === islandAt(car.pos.x, car.pos.z, 2)?.id);
      if (!net || car.wreck) { if (!car.wreck) g.traffic.remove(car); continue; }
      Object.assign(car, { net, path: [], waitT: 0, ghostT: 0, honkT: 0, bumpT: 0 });
      g.traffic.repath(car);
    }
    this.mirrorPeds.clear();
    this.mirrorCars.clear();
    for (const n of g.citizens.list) if (n.ambient && n.nid) this.nextNid = Math.max(this.nextNid, n.nid + 1);
  }

  // Someone else runs the city now: our own traffic and people carry on as mirrors of theirs.
  becomeMirror() {
    const g = this.g;
    if (!g.citizens || !g.traffic) return;
    for (const npc of g.citizens.list) {
      if (!npc.ambient) continue;
      if (!npc.nid) { g.citizens.despawn(npc); continue; }
      const t = npc.body.translation();
      npc.mirror = { x: t.x, y: t.y, z: t.z, h: npc.heading, sp: 0, f: 0 };
      this.mirrorPeds.set(npc.nid, npc);
    }
    for (const car of [...g.traffic.cars]) {
      if (!car.nid) { g.traffic.remove(car); continue; }
      car.mirror = { x: car.pos.x, y: car.pos.y, z: car.pos.z, h: car.heading, vx: 0, vz: 0 };
      this.mirrorCars.set(car.nid, car);
    }
  }

  // Host: everybody's traffic and pedestrians, 10 times a second.
  sendWorld() {
    const g = this.g, now = g.time;
    const cars = [];
    for (const c of g.traffic.cars) {
      c.nid ||= this.nextNid++;
      cars.push([c.nid, c.spec, r1(c.pos.x), r2(c.pos.y), r1(c.pos.z), r2(c.heading), r1(c.vel.x), r1(c.vel.z), c.wreck ? 1 : 0]);
    }
    const peds = [];
    this.pedTick = !this.pedTick; // (people only every other time: they walk slowly)
    if (this.pedTick) for (const n of g.citizens.list) {
      if (!n.ambient || n.hostage) continue;
      n.nid ||= this.nextNid++;
      const t = n.body.translation();
      peds.push([n.nid, r1(t.x), r2(t.y), r1(t.z), r2(n.heading), r1(n.speed), (n.state === 'flee' ? 1 : 0) | (n.role === 'cop' ? 2 : 0) | (n.handsUp > 0 ? 4 : 0)]);
    }
    this.dead = this.dead.filter((d) => now - d[4] < 2);
    this.send({ t: 'w', tod: r2(g.daynight?.hour ?? 10), cars, peds: this.pedTick ? peds : undefined, dead: this.dead.map((d) => d.slice(0, 4)) });
  }

  // Not host: line our mirrors up with the host's world.
  onWorld(m) {
    const g = this.g, now = g.time;
    if (!g.traffic || !g.citizens || !g.started && !g.hud) return; // (still loading)
    for (const [nid, t] of this.gone) if (now - t > 8) this.gone.delete(nid);
    // the time of day
    if (g.daynight && m.tod != null && Math.abs(g.daynight.hour - m.tod) > 0.05) g.daynight.hour = m.tod;
    // traffic
    const seen = new Set();
    for (const [nid, spec, x, y, z, h, vx, vz, wreck] of m.cars || []) {
      if (this.gone.has(nid)) continue;
      seen.add(nid);
      let car = this.mirrorCars.get(nid);
      if (car && !g.traffic.cars.includes(car)) { this.mirrorCars.delete(nid); continue; } // stolen here: it's ours now
      if (!car) {
        car = carFromSpec(g, spec, x, y, z, h);
        car.nid = nid;
        this.mirrorCars.set(nid, car);
        g.traffic.cars.push(car);
      }
      car.mirror = { x, y, z, h, vx, vz };
      if (wreck && !car.wreck) car.wreckLook();
    }
    for (const [nid, car] of this.mirrorCars) {
      if (seen.has(nid)) continue;
      this.mirrorCars.delete(nid);
      if (g.traffic.cars.includes(car)) g.traffic.remove(car);
    }
    // people
    const dead = new Map((m.dead || []).map((d) => [d[0], d]));
    for (const [nid, d] of dead) { // (knocked down: don't wait for the next list of people)
      const npc = this.mirrorPeds.get(nid);
      if (!npc) continue;
      this.mirrorPeds.delete(nid);
      if (g.citizens.list.includes(npc)) { delete npc.mirror; g.citizens.knockOver(npc, new THREE.Vector3(d[1], d[2], d[3]), 4, { killed: true }); }
    }
    if (!m.peds) return;
    const live = new Set(), need = [];
    for (const [nid, x, y, z, h, sp, f] of m.peds || []) {
      if (this.gone.has(nid)) continue;
      live.add(nid);
      let npc = this.mirrorPeds.get(nid);
      if (npc && !g.citizens.list.includes(npc)) { this.mirrorPeds.delete(nid); this.gone.set(nid, now); continue; } // knocked down here
      if (!npc) {
        const look = this.looks.get(nid);
        if (!look) { if (!this.asked.has(nid) && need.length < 60) { this.asked.add(nid); need.push(nid); } continue; }
        const island = islandAt(x, z, 2)?.id || 'city';
        npc = g.citizens.spawnCitizen(island, f & 2 ? 'cop' : 'civ', new THREE.Vector3(x, y - FOOT - 0.05, z), { look });
        if (!npc) continue;
        npc.nid = nid; npc.ambient = true;
        npc.heading = h;
        this.mirrorPeds.set(nid, npc);
      }
      npc.mirror = { x, y, z, h, sp, f };
    }
    if (need.length && this.host != null) this.event('looks?', { nids: need }, this.host);
    for (const [nid, npc] of this.mirrorPeds) {
      if (live.has(nid)) continue;
      this.mirrorPeds.delete(nid);
      if (!g.citizens.list.includes(npc)) continue;
      const d = dead.get(nid);
      if (d) { delete npc.mirror; g.citizens.knockOver(npc, new THREE.Vector3(d[1], d[2], d[3]), 4, { killed: true }); }
      else g.citizens.despawn(npc);
    }
  }

  // Each frame, for a mirrored pedestrian (called from Citizens.update in place of its brain).
  followPed(npc, dt) {
    const m = npc.mirror, t = npc.body.translation();
    const dx = m.x - t.x, dz = m.z - t.z;
    if (dx * dx + dz * dz > 64) npc.body.setTranslation({ x: m.x, y: m.y, z: m.z }, true);
    else {
      const k = Math.min(1, dt * 8);
      npc.body.setNextKinematicTranslation({ x: t.x + dx * k, y: t.y + (m.y - t.y) * k, z: t.z + dz * k });
    }
    npc.heading = angLerp(npc.heading, m.h, Math.min(1, dt * 10));
    npc.speed = m.sp;
    npc.state = m.f & 1 ? 'flee' : npc.role === 'cop' ? 'patrol' : 'wander';
    npc.handsUp = m.f & 4 ? 1 : 0;
  }

  // A pedestrian went down. Host: tell everyone. Mirror: tell the host (we did it).
  npcDown(npc, velocity) {
    if (!npc.nid || !npc.ambient) return;
    if (this.isHost) this.dead.push([npc.nid, r1(velocity.x), r1(velocity.y), r1(velocity.z), this.g.time]);
    else if (npc.mirror) {
      this.gone.set(npc.nid, this.g.time);
      this.event('npcHit', { nid: npc.nid, dmg: 999, v: [r1(velocity.x), r1(velocity.y), r1(velocity.z)] }, this.host);
      delete npc.mirror;
    }
  }

  // We hurt one of the host's pedestrians (not fatally: npcDown covers that).
  npcHurt(npc, dmg) {
    if (!npc.mirror || !npc.nid) return;
    const p = this.g.shorePlayer.body.translation();
    this.event('npcHit', { nid: npc.nid, dmg, from: [r1(p.x), r1(p.z)] }, this.host);
  }

  // Parked cars are the same for everyone (they're built from the seed): known by where they stand.
  pkey(car) { return car.pkey ||= `${Math.round(car.pos.x)}:${Math.round(car.pos.z)}`; }
  keyParked() { for (const c of this.g.vehicles.parked) this.pkey(c); }
  parkedTaken(car) { this.event('parked', { key: this.pkey(car) }); }

  // We took one of the host's traffic cars.
  carTaken(car) {
    if (!car.nid || !this.mirrorCars.has(car.nid)) return;
    this.mirrorCars.delete(car.nid);
    this.gone.set(car.nid, this.g.time);
    delete car.mirror;
    this.event('take', { nid: car.nid }, this.host);
    car.nid = null;
  }

  // ---------------------------------------------------------------- other players
  onState(m) {
    const r = this.players.get(m.id);
    if (!r) return;
    r.push(m);
    const g = this.g;
    // their cars (and the police cars after them)
    const seen = new Set();
    for (const [cid, spec, x, y, z, h, vx, vz, fl] of m.cars || []) {
      const key = `${m.id}:${cid}`;
      seen.add(key);
      let car = this.pcars.get(key);
      if (!car) {
        car = carFromSpec(g, spec, x, y, z, h);
        car.netOwner = m.id; car.netCid = cid; car.netKey = key;
        this.pcars.set(key, car);
      }
      car.mirror = { x, y, z, h, vx, vz };
      car.netDriven = m.m === 'c' && m.v?.cid === cid;
      car.netLocked = !!(fl & 2);
      if (fl & 1 && !car.wreck) car.wreckLook();
    }
    for (const key of [...this.pcars.keys()]) if (key.startsWith(`${m.id}:`) && !seen.has(key)) this.dropCar(key);
    // the cops on foot chasing them
    const cseen = new Set();
    for (const [lid, x, y, z, h, sp, swat] of m.cops || []) {
      const key = `${m.id}:${lid}`;
      cseen.add(key);
      let p = this.pcops.get(key);
      if (!p) {
        p = new Puppet(this, swat ? { shirt: 0x1b1d22, pants: 0x1b1d22, skin: 0xa8724f, hat: 'helmet', hatColor: 0x111214 } : { shirt: 0x1c2f6e, pants: 0x111a33, skin: 0xd9a47c, hat: 'cap', hatColor: 0x111a33, badge: true });
        p.cop = { owner: m.id, lid };
        this.pcops.set(key, p);
        p.place(x, y, z, h, sp);
      }
      p.target = { x, y, z, h, sp };
    }
    for (const key of [...this.pcops.keys()]) if (key.startsWith(`${m.id}:`) && !cseen.has(key)) { this.pcops.get(key).dispose(); this.pcops.delete(key); }
  }

  dropCar(key) {
    const car = this.pcars.get(key);
    if (!car) return;
    this.pcars.delete(key);
    car.dispose();
  }

  // Ours to send: where we are and what we're doing, plus our cars and our cops.
  sendState() {
    const g = this.g;
    const sp = g.shorePlayer, t = sp.body.translation();
    let m = 'f', p = [t.x, t.y, t.z], yaw = sp.yaw, v;
    const veh = g.vehicles.active, boat = g.boats.active, jet = g.jets.active;
    const pose = (o) => ({ p: [r1(o.position.x), r2(o.position.y), r1(o.position.z)], q: o.quaternion.toArray().map((x) => +x.toFixed(3)) });
    if (g.health.dead) m = 'd';
    if (g.pragdoll.active) { m = 'r'; const tp = g.pragdoll.torsoPos(); p = [tp.x, tp.y + 0.5, tp.z]; }
    else if (veh?.isHeli) { m = 'h'; v = { k: 'h', ...pose(veh.mesh) }; }
    else if (veh) { m = 'c'; veh.cid ||= this.nextCid++; v = { k: 'c', cid: veh.cid }; }
    else if (boat) { m = 'b'; v = { k: 'b', n: boat.type?.id, ...pose(boat.mesh) }; }
    else if (jet) { m = 'j'; v = { k: 'j', n: jet.number, ...pose(jet.mesh) }; }
    else if (!g.onShore) { m = 's'; const w = g.frame.localToWorld(new THREE.Vector3(g.shipPlayer.body.translation().x, g.shipPlayer.body.translation().y, g.shipPlayer.body.translation().z)); p = [w.x, w.y, w.z]; yaw = g.ship.heading + g.shipPlayer.yaw; }
    if (g.homes?.inside || g.story?.underground || g.title?.active || !g.started) m = 'x';
    // how fast we're walking (for their animation)
    const now = performance.now() / 1000;
    const lp = this.lastP;
    const speed = lp && now > lp.t ? Math.hypot(p[0] - lp.p[0], p[2] - lp.p[2]) / (now - lp.t) : 0;
    this.lastP = { t: now, p };
    // our cars: the one we're in, ones we've left about, and the police cars after us
    const cars = [];
    const add = (c, fl = 0) => {
      if (cars.length >= 14 || !c.body) return;
      c.cid ||= this.nextCid++;
      cars.push([c.cid, c.spec, r1(c.pos.x), r2(c.pos.y), r1(c.pos.z), r2(c.heading), r1(c.vel.x), r1(c.vel.z), (c.wreck ? 1 : 0) | (c.ownedUid || c.police || c.story ? 2 : 0) | fl]);
    };
    if (veh && !veh.isHeli) add(veh);
    for (const c of g.vehicles.list) if (c !== veh && !c.isHeli && c.pos.distanceTo(veh?.pos || new THREE.Vector3(t.x, t.y, t.z)) < 600) add(c);
    for (const c of g.police.cars) add(c, 2);
    for (const c of g.activities?.cars || []) add(c, 2);
    // cops after us on foot
    const cops = [];
    for (const n of g.citizens.list) {
      if (n.role !== 'cop' || n.ambient || cops.length >= 20) continue;
      n.lid ||= this.nextCid++;
      const ct = n.body.translation();
      cops.push([n.lid, r1(ct.x), r2(ct.y), r1(ct.z), r2(n.heading), r1(n.speed), n.swat ? 1 : 0]);
    }
    this.send({ t: 's', m, p: p.map((x, i) => (i === 1 ? r2(x) : r1(x))), y: r2(yaw), sp: r1(speed), hp: Math.round(g.health.hp), w: g.police.wanted, v, cars, cops });
  }

  // ---------------------------------------------------------------- events
  onEvent(m) {
    const g = this.g, from = m.id;
    switch (m.k) {
      case 'hit': { // someone shot / punched / blew us up
        if (g.health.dead || g.health.god) return;
        this.lastHitBy = from; this.lastHitT = g.time;
        g.health.damage(m.dmg, 'player');
        if (m.push && g.onShore && !g.vehicles.active) g.shorePlayer.vel.add(new THREE.Vector3(m.push[0], 2.5, m.push[1]));
        if (g.health.dead) {
          this.event('kill', { by: from, how: m.how || 'shot' });
          this.say(`${this.nameOf(from)} ${m.how === 'blast' ? 'blew you up' : m.how === 'punch' ? 'beat you to death' : 'killed you'}`, '#ff6a6a');
          g.hud.showDeath(true, `Killed by ${this.nameOf(from)}`);
        }
        break;
      }
      case 'kill': {
        const killer = m.by === this.id ? 'You' : this.nameOf(m.by);
        this.say(`${killer} killed ${this.nameOf(from)}`, m.by === this.id ? '#ffd166' : '#ff9a8a');
        if (m.by === this.id) { g.economy.addMoney(250, `took out ${this.nameOf(from)}`); this.kills = (this.kills || 0) + 1; }
        break;
      }
      case 'shot': { // gunfire from another player: a tracer and the bang
        const a = new THREE.Vector3().fromArray(m.a), b = new THREE.Vector3().fromArray(m.b);
        g.police.tracer(a, b);
        g.fx.flash(a, 0xffc060, 1.2, 0.05);
        const d = a.distanceTo(g.camera.position);
        if (d < 160) g.sfx.play(m.s || 'pistol', Math.max(0.15, 1 - d / 160));
        break;
      }
      case 'boom': { // an explosion over there
        const p = new THREE.Vector3().fromArray(m.p);
        g.fx.explosion(p);
        if (p.distanceTo(g.camera.position) < 300) g.sfx.play('explosion');
        break;
      }
      case 'carHit': { // our car got shot
        const car = this.ourCar(m.cid);
        if (car && !car.wreck) car.damage(m.dmg * 0.45);
        break;
      }
      case 'copHit': { // someone shot one of the cops after us
        const npc = g.citizens.list.find((n) => n.lid === m.lid);
        if (!npc) return;
        npc.hp -= m.dmg;
        if (npc.hp <= 0) { const d = new THREE.Vector3(m.dir?.[0] || 0, 0, m.dir?.[1] || 0).multiplyScalar(6); d.y = 1.5; g.citizens.knockOver(npc, d, 3, { killed: true }); }
        else npc.stunT = 0.6;
        break;
      }
      case 'take': { // they took our car (one we'd left)
        if (m.nid != null) { // (host) one of our traffic cars
          const car = g.traffic.cars.find((c) => c.nid === m.nid);
          if (car) g.traffic.remove(car);
          return;
        }
        const car = this.ourCar(m.cid);
        if (!car || car === g.vehicles.active) return;
        const i = g.vehicles.list.indexOf(car);
        if (i >= 0) { g.vehicles.list.splice(i, 1); car.dispose(); }
        this.say(`${this.nameOf(from)} stole your car`, '#ff9a8a');
        break;
      }
      case 'parked': { // they broke into a parked car: it's theirs now (it shows up as their car)
        const P = g.vehicles.parked, i = P.findIndex((c) => c.pkey === m.key);
        if (i >= 0) { const [c] = P.splice(i, 1); c.dispose(); }
        break;
      }
      case 'npcHit': { // host: a mirror shot / knocked down one of our people
        if (!this.isHost) return;
        const npc = g.citizens.list.find((n) => n.nid === m.nid);
        if (!npc) return;
        if (m.v) { g.citizens.knockOver(npc, new THREE.Vector3(...m.v), 4, { killed: true }); return; }
        npc.hp -= m.dmg;
        if (npc.hp <= 0) g.citizens.knockOver(npc, new THREE.Vector3(0, 2, 0), 3, { killed: true });
        else if (npc.role === 'civ') { npc.stunT = 0.7; g.citizens.flee(npc, { x: m.from?.[0] ?? 0, z: m.from?.[1] ?? 0 }, 8); }
        break;
      }
      case 'looks?': { // a mirror wants to know what some of our people look like
        if (!this.isHost) return;
        const looks = {};
        for (const nid of m.nids || []) { const n = g.citizens.list.find((q) => q.nid === nid); if (n?.look) looks[nid] = n.look; }
        this.event('looks', { looks }, from);
        break;
      }
      case 'looks':
        for (const [nid, look] of Object.entries(m.looks || {})) { this.looks.set(+nid, look); this.asked.delete(+nid); }
        break;
    }
  }

  ourCar(cid) {
    const g = this.g;
    return [...g.vehicles.list, ...g.police.cars, ...(g.activities?.cars || [])].find((c) => c.cid === cid) || null;
  }

  // Our shot / punch hit something: if it's another player (or their cop), tell them.
  // Returns true if it was one of theirs.
  hitCollider(collider, dmg, dir, how = 'shot') {
    const p = this.byCollider.get(collider?.handle);
    if (!p) return false;
    const push = how === 'punch' ? [r1(dir.x * 3), r1(dir.z * 3)] : null;
    if (p.remote) this.event('hit', { dmg, how, push }, p.remote.id);
    else if (p.cop) this.event('copHit', { lid: p.cop.lid, dmg, dir: [r2(dir.x), r2(dir.z)] }, p.cop.owner);
    return true;
  }

  // We shot (or rammed) someone's car.
  carHit(car, dmg) {
    if (car.netOwner == null) return false;
    this.event('carHit', { cid: car.netCid, dmg }, car.netOwner);
    return true;
  }

  // Our gun went off: everyone else sees the tracer.
  shot(a, b, sound) { this.event('shot', { a: a.toArray().map(r2), b: b.toArray().map(r1), s: sound }); }

  // An explosion here: hurts other players and their cars, and they see it.
  blast(p, radius, dmg) {
    this.event('boom', { p: p.toArray().map(r1) });
    for (const r of this.players.values()) {
      const s = r.state;
      if (!s || s.m === 'x' || s.m === 'd') continue;
      const at = r.where || new THREE.Vector3().fromArray(s.p);
      const d = at.distanceTo(p);
      if (d < radius) this.event('hit', { dmg: Math.round(dmg * (1 - d / radius)), how: 'blast', push: [r1((at.x - p.x) / Math.max(d, 1) * 8), r1((at.z - p.z) / Math.max(d, 1) * 8)] }, r.id);
    }
    for (const car of this.pcars.values()) {
      const d = car.pos.distanceTo(p);
      if (d < radius && !car.wreck) this.carHit(car, dmg * (1 - d / radius) * 2);
    }
  }

  // Stealing someone's car that they've left about.
  stealable() { return [...this.pcars.values()].filter((c) => !c.netDriven && !c.netLocked && !c.wreck); }
  takeRemote(car) {
    this.event('take', { cid: car.netCid }, car.netOwner);
    this.pcars.delete(car.netKey);
    delete car.mirror; car.netOwner = null; car.netCid = null; car.netKey = null; car.cid = null;
    return car;
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    const g = this.g;
    if (this.status !== 'online') return;
    for (const r of this.players.values()) r.update(dt);
    for (const car of this.pcars.values()) {
      if (car.mirror) car.follow(dt, car.mirror);
      if (!car.wreck) runOver(g, car, false);
    }
    for (const p of this.pcops.values()) {
      const m = p.target; if (!m) continue;
      const k = Math.min(1, dt * 8);
      p.place(p.pos.x + (m.x - p.pos.x) * k, p.pos.y + (m.y - p.pos.y) * k, p.pos.z + (m.z - p.pos.z) * k, angLerp(p.yaw, m.h, k), m.sp);
      p.animate(dt);
    }
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = SEND_DT; this.sendState(); }
    if (this.isHost) { this.worldT -= dt; if (this.worldT <= 0) { this.worldT = WORLD_DT; this.sendWorld(); } }
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 3; this.send({ t: 'ping', c: performance.now() }); }
    this.drawPill();
    this.fadeFeed();
  }

  // ---------------------------------------------------------------- the map
  marks() {
    const out = [];
    for (const r of this.players.values()) {
      const s = r.state;
      if (!s || s.m === 'x' || !r.where) continue;
      out.push({ x: r.where.x, z: r.where.z, color: '#ff4adf', r: 4.5, label: r.name.slice(0, 1).toUpperCase(), name: r.name });
    }
    return out;
  }

  // ---------------------------------------------------------------- chat and the feed
  ui() {
    if (this.uiEl) return this.uiEl;
    const el = (this.uiEl = document.createElement('div'));
    el.id = 'mp-ui';
    el.innerHTML = '<div class="mp-pill"></div><div class="mp-feed"></div><input class="mp-chat hidden" maxlength="160" placeholder="Say something… (Enter to send, Esc to cancel)" />';
    (document.getElementById('hud') || document.body).appendChild(el);
    this.pill = el.querySelector('.mp-pill');
    this.feedEl = el.querySelector('.mp-feed');
    this.chatEl = el.querySelector('.mp-chat');
    this.chatEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { const text = this.chatEl.value.trim(); if (text) this.send({ t: 'chat', text }); this.closeChat(); }
      else if (e.code === 'Escape') this.closeChat();
    });
    this.chatEl.addEventListener('keyup', (e) => e.stopPropagation());
    return el;
  }

  openChat() {
    this.ui();
    this.g.keys.clear();
    this.chatEl.classList.remove('hidden');
    this.chatEl.value = '';
    setTimeout(() => this.chatEl.focus(), 0);
    this.chatting = true;
    this.feedEl.classList.add('open');
  }

  closeChat() {
    this.chatEl.classList.add('hidden');
    this.chatEl.blur();
    this.chatting = false;
    this.feedEl.classList.remove('open');
  }

  say(text, color = '#fff', chat = false) {
    this.ui();
    const line = document.createElement('div');
    line.className = chat ? 'chat' : 'sys';
    line.style.color = color;
    line.textContent = text;
    this.feedEl.appendChild(line);
    this.feed.push({ el: line, t: performance.now() });
    while (this.feedEl.children.length > 30) this.feedEl.firstChild.remove();
  }

  fadeFeed() {
    const now = performance.now();
    for (const f of this.feed) f.el.classList.toggle('old', now - f.t > 12000);
    this.feed = this.feed.filter((f) => now - f.t < 13000);
  }

  drawPill() {
    this.ui();
    this.pillT = (this.pillT || 0) - 1;
    if (this.pillT > 0) return;
    this.pillT = 20;
    const n = this.players.size + 1;
    this.pill.innerHTML = `<b>${this.room}</b> · ${n} player${n === 1 ? '' : 's'}${this.isHost ? ' · host' : ''} · ${this.ping} ms <span class="k">Enter</span> chat`;
  }
}
