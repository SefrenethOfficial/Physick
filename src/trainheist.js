import * as THREE from 'three';
import { Train, CAR_LEN, GAP } from './railway.js';
import { moneyBagMesh } from './loot.js';

// The Scorch Line mail train. Verian National moves cash from the airport to its Copper Gulch
// branch by rail, a few times a day, with an armed escort. Set it up from the heist board in the
// volcano base: plant a charge on the line out in the desert, get clear, and when the train comes
// the blast stops it dead. Deal with the guards, blow the door off the armoured car, grab the money
// bags, and get them back to the volcano to be counted.

const SAVE = 'physick.heist.v1';
const COST = 2500, COOLDOWN = 20 * 60 * 1000; // (real time between jobs)
const S_SPOT = 3350; // where on the line (in the open desert, west of the Last Chance)

export class TrainHeist {
  constructor(game) {
    this.game = game;
    try { this.save = JSON.parse(localStorage.getItem(SAVE) || 'null') || {}; } catch { this.save = {}; }
    this.job = null;
  }

  persist() { try { localStorage.setItem(SAVE, JSON.stringify(this.save)); } catch { /* storage unavailable */ } }
  get ready() { return !this.save.last || Date.now() - this.save.last > COOLDOWN; }

  openBoard() {
    const g = this.game, e = g.economy, R = g.railway;
    const wait = this.ready ? 0 : Math.ceil((COOLDOWN - (Date.now() - this.save.last)) / 60000);
    const busy = !!g.story?.active || !!this.job;
    const row = (label, small, btn) => `<div class="erow"><div><b>${label}</b><small>${small}</small></div><div class="btns">${btn}</div></div>`;
    let html = e.header() + '<p class="lede">"Two jobs worth doing right now. Whatever you take, bring the bags back here and we\'ll count it."</p>';
    html += row('The Scorch Line mail train', `Verian National's cash run from the airport to Copper Gulch. Plant a charge on the line in the desert, stop the train, blow the armoured car. Around $70,000–$95,000. The charges cost $${COST.toLocaleString()}.${wait ? ` <i>(Lying low: ${wait} min)</i>` : ''}`,
      `<button data-a="train" ${!R || busy || !this.ready || e.money + e.bank < COST ? 'disabled' : ''}>${this.job ? 'In progress' : 'Set it up'}</button>`);
    html += row('Verian National Bank', 'Walk in with a gun and press R at the counter, then get into the vault. The bags come here.', '<button disabled>On foot</button>');
    if (busy && !this.job) html += '<p class="empty">Finish what you\'re doing first.</p>';
    e.open('Heist board', html, (el) => el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || b.disabled) return;
      if (b.dataset.a === 'train') { e.close(); this.start(); }
    }));
  }

  start() {
    const g = this.game, e = g.economy, R = g.railway;
    const fromCash = Math.min(e.money, COST); e.bank -= COST - fromCash; e.addMoney(-fromCash, 'charges'); e.save();
    // the spot: on the southbound track (the mail train's), out in the open desert
    const side = 1, spot = R.at(S_SPOT, R.sep(S_SPOT) * side);
    this.job = { stage: 'plant', spot: new THREE.Vector3(spot.x, spot.y, spot.z), side, plant: 0, bags: [], goons: { goons: [], sharp: 1 } };
    // a beacon so you can find the place
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35, depthWrite: false }));
    beam.position.set(spot.x, spot.y + 30, spot.z); g.scene.add(beam); this.job.beam = beam;
    g.hud.flashBanner('TRAIN HEIST', '#ffd166');
    g.hud.toast('Get out to the Scorch Line and plant the charge on the southbound track (the marker on the map)', 0xffd166);
  }

  get wp() { const j = this.job; if (!j) return null; return j.stage === 'plant' ? j.spot : j.stage === 'escape' ? this.game.volcano?.portal : j.train && j.stage !== 'wait' ? j.train.cars[1]?.group.position : null; }

  action(pos) {
    const j = this.job, g = this.game;
    if (!j) return null;
    const near = (p, r) => Math.hypot(pos.x - p.x, pos.z - p.z) < r && Math.abs(pos.y - 1 - p.y) < 2.5;
    if (j.stage === 'plant' && near(j.spot, 3)) return { label: '(hold E) Plant the charge on the track', run: () => { j.planting = true; } };
    if (j.stage === 'door') { const d = this.doorSpot(); if (d && near(d, 3)) return { label: '(hold E) Set a charge on the armoured car\'s door', run: () => { j.doorSet = true; } }; }
    if (j.stage === 'grab') for (const b of j.bags) if (b.mesh.parent && near(b.at, 2.2)) return { label: `Grab a money bag ($${b.n.toLocaleString()})`, run: () => this.grab(b) };
    void g;
    return null;
  }

  // the armoured car: the side of it facing away from the other track
  doorSpot() {
    const c = this.job.train?.cars[1]; if (!c) return null;
    return new THREE.Vector3(1.9, 0, 0).applyMatrix4(c.prev).setY(c.group.position.y);
  }

  grab(b) {
    const g = this.game, j = this.job;
    b.mesh.removeFromParent();
    g.loot.add(b.n, 'train');
    g.sfx.play('cash');
    if (j.bags.every((x) => !x.mesh.parent)) { j.stage = 'escape'; g.hud.toast('That\'s all of it. Lose the heat and get the bags to the volcano base!', 0xffd166); }
  }

  update(dt) {
    const j = this.job, g = this.game;
    if (!j) return;
    const p = g.shorePlayer.body.translation(), R = g.railway;
    let text = '';
    if (g.health.dead && j.stage !== 'escape') { this.fail('You didn\'t make it'); return; }
    if (j.stage === 'plant') {
      const holding = j.planting && g.keys.has('KeyE') && Math.hypot(p.x - j.spot.x, p.z - j.spot.z) < 3.2;
      if (!holding) j.planting = false;
      if (holding) { j.plant += dt / 3; if (Math.random() < dt * 4) g.sfx.play('select'); }
      text = holding ? `Planting the charge… ${Math.round(j.plant * 100)}%` : 'Plant the charge on the southbound track, out in the desert';
      if (j.plant >= 1) {
        j.stage = 'wait';
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: 0x3a3a2a, emissive: 0xff2a10, emissiveIntensity: 0.3 })); ch.position.copy(j.spot).add(new THREE.Vector3(0, 0.2, 0)); g.scene.add(ch); j.charge = ch;
        j.beam.visible = false;
        // the mail train leaves the airport (the passenger train on that track waits at the far end)
        const st = R.stations.find((s) => s.name === 'Verian International');
        const old = R.trains[1]; old.dispose(); R.trains.splice(1, 1);
        j.train = new Train(R, j.side, st.s / R.plan.length, 1, { cars: 3, cash: true });
        j.train.state = 'run'; j.train.next = null; j.train.v = 6;
        R.trains.push(j.train);
        g.hud.toast('Charge set. The mail train\'s just left Verian International: get well clear of the track!', 0xffd166);
      }
    } else if (j.stage === 'wait') {
      const T = j.train, left = S_SPOT - T.s;
      text = `The mail train is coming (${Math.max(0, Math.round(left))} m out). Get clear of the track!`;
      j.charge.material.emissiveIntensity = 0.3 + 0.7 * (Math.sin(g.time * (left < 150 ? 20 : 6)) > 0 ? 1 : 0);
      if (left < 26) {
        // boom: the line's cut and the train slams on its brakes
        g.blast(j.spot.clone().add(new THREE.Vector3(0, 0.5, 0)), 9, 120);
        j.charge.removeFromParent();
        T.halted = true;
        g.police.report?.(4, j.spot.clone(), true, 'bank');
        g.police.crime?.('bankjob', 3, j.spot.clone());
        g.news?.add('Explosion on the Scorch Line! A Verian National cash train has been stopped in the desert.', 'crime');
        j.stage = 'guards';
        j.outT = 1.6;
      }
    } else if (j.stage === 'guards') {
      if (j.outT != null && (j.outT -= dt) <= 0) {
          j.outT = null;
          const T = j.train, c = T.cars[T.n - 1];
          for (let k = 0; k < 5; k++) {
            const at = new THREE.Vector3((k % 2 ? 1 : -1) * 3.2, 1.2, -5 + k * 2.5).applyMatrix4(c.prev);
            const n = g.story.spawnGoon(j.goons, at, ['rifle', 'smg', 'rifle', 'heavy', 'rifle'][k]);
            if (n) { n.alerted = true; n.lastSeen = new THREE.Vector3(p.x, p.y, p.z); }
          }
          g.hud.toast('The escort\'s coming out shooting!', 0xff6a5a);
      }
      j.goons.goons = j.goons.goons.filter((n) => g.citizens.list.includes(n) && !n.dead);
      const left = j.goons.goons.length;
      text = left ? `Take out the escort (${left} left), then get to the armoured car` : 'Get to the armoured car (the middle one) and blow its door';
      if (j.outT == null && j.train.v < 0.2) j.stage = 'door'; // (you can go for the door with them still shooting)
    } else if (j.stage === 'door') {
      const d = this.doorSpot();
      const holding = j.doorSet && g.keys.has('KeyE') && d && Math.hypot(p.x - d.x, p.z - d.z) < 3.3;
      if (!holding) j.doorSet = false;
      if (holding) j.door = (j.door || 0) + dt / 2.5;
      text = holding ? `Setting the charge… ${Math.round((j.door || 0) * 100)}%` : 'Set a charge on the armoured car\'s door (the middle car, the side away from the other track)';
      if ((j.door || 0) >= 1) {
        j.stage = 'fuse'; j.fuse = 4;
        g.hud.toast('Charge set. Back off!', 0xffd166);
      }
    } else if (j.stage === 'fuse') {
      j.fuse -= dt; text = `Back off! ${Math.ceil(j.fuse)}…`;
      if (j.fuse <= 0) {
        const c = j.train.cars[1], d = this.doorSpot();
        g.blast(d.clone().add(new THREE.Vector3(0, 1.2, 0)), 5, 70);
        // the door's gone: open that side, and the bags are there inside
        for (const col of [...Array(c.rb.numColliders()).keys()].map((i) => c.rb.collider(i))) { const t = col.translation(), l = new THREE.Vector3(t.x, t.y, t.z).applyMatrix4(c.prev.clone().invert()); if (l.x > 1.2 && Math.abs(l.y - 2.45) < 0.2) col.setEnabled(false); }
        c.group.children.forEach((o) => { if (o.position.x > 1.2 && Math.abs(o.position.y - 2.45) < 0.1) o.visible = false; });
        const total = 70000 + Math.floor(Math.random() * 25000), n = 5;
        for (let k = 0; k < n; k++) {
          const m = moneyBagMesh(); const local = new THREE.Vector3(0.6, 1.15, -4 + k * 2);
          m.position.copy(local); c.group.add(m);
          j.bags.push({ mesh: m, n: Math.round(total / n), get at() { return local.clone().applyMatrix4(c.prev); } });
        }
        j.stage = 'grab';
        g.hud.toast('Door\'s off. Grab the bags!', 0xffd166);
      }
    } else if (j.stage === 'grab') {
      text = `Grab the money bags (${j.bags.filter((b) => b.mesh.parent).length} left)`;
    } else if (j.stage === 'escape') {
      text = 'Get the money bags to the volcano base and count them';
      if (!g.loot.from.has('train')) { this.finish(g.loot.lastProcessed?.includes('train') ? 'counted' : null); return; }
    }
    if (!g.story?.active) {
      const wp = this.wp, d = wp ? Math.hypot(p.x - wp.x, p.z - wp.z) : 0;
      g.hud.setObjective(text ? { title: 'Train heist', text, dist: wp && d > 8 ? Math.round(d) : null } : null);
    }
  }

  fail(why) { this.game.hud.toast(`Heist off: ${why}`, 0xff8a6a); this.finish(null); }

  finish(how) {
    const g = this.game, j = this.job, R = g.railway;
    if (!j) return;
    if (how === 'counted') { g.hud.flashBanner('HEIST COMPLETE', '#7be08a'); }
    this.save.last = Date.now(); this.persist();
    j.beam?.removeFromParent(); j.charge?.removeFromParent();
    for (const n of j.goons.goons) if (g.citizens.list.includes(n)) g.citizens.despawn(n);
    // the mail train's towed away; the passenger service comes back
    if (j.train) { j.train.dispose(); R.trains.splice(R.trains.indexOf(j.train), 1); R.trains.push(new Train(R, 1, 0.62, -1)); }
    this.job = null;
    if (!g.story?.active) g.hud.setObjective(null);
  }
}
void CAR_LEN; void GAP;
