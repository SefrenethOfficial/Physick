import * as THREE from 'three';

// Businesses: buy the shops and diners you can walk into. Each one puts money in its till every
// minute (collect it at the counter, or have it wired to the bank from the phone for a cut), and
// the Ashen Hand don't like the competition: now and then they'll raid one of your places. Get
// there and see them off before the timer runs out, or they clean out the till and the place
// shuts while it's patched up. Better security means fewer raids.

const KEY = 'physick.biz.v1';
const money = (n) => '$' + Math.round(n).toLocaleString();
const TYPES = {
  grocery: { price: 60000, kind: 'Corner shop' },
  liquor: { price: 75000, kind: 'Liquor store' },
  diner: { price: 90000, kind: 'Diner' },
  pharmacy: { price: 110000, kind: 'Pharmacy' },
  hardware: { price: 120000, kind: 'Hardware store' },
  electronics: { price: 180000, kind: 'Electronics store' },
};
const RATE = 0.006; // of the price, per minute
const CAP_MIN = 30; // the till holds this many minutes of takings
const SECURITY = [
  { name: 'None', raid: 1 },
  { name: 'Cameras and shutters', raid: 0.55, cost: 0.15 },
  { name: 'Armed guard', raid: 0.25, cost: 0.35 },
];
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export class Business {
  constructor(game) {
    this.game = game;
    this.list = game.stores.list.filter((st) => TYPES[st.theme] && st.it.counter);
    // (the side streets are different every time you play, so a business is saved as "the Nth
    // shop of its kind on its island": the landmark ones, like the Mini Mart, always come first)
    const count = {};
    for (const st of this.list) {
      const t = TYPES[st.theme], k = `${st.island}:${st.theme}`;
      count[k] = (count[k] || 0) + 1;
      st.biz = { key: `${k}#${count[k] - 1}`, price: t.price, kind: t.kind, name: title(st.label) };
    }
    this.owned = {}; // key -> { till, sec, closed (seconds left), earned, name }
    try { this.owned = JSON.parse(localStorage.getItem(KEY) || '{}').owned || {}; } catch { /* fresh */ }
    this.raid = null;
    this.raidT = 420 + Math.random() * 300;
    this.saveT = 0;
    this.timerEl = document.createElement('div');
    this.timerEl.id = 'raid-timer';
    this.timerEl.className = 'hidden';
    document.getElementById('hud').appendChild(this.timerEl);
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify({ owned: this.owned })); } catch { /* storage unavailable */ } }

  owns(st) { return !!(st?.biz && this.owned[st.biz.key]); }
  mine() { return this.list.filter((st) => this.owns(st)); }
  rate(st) { return st.biz.price * RATE; }
  cap(st) { return this.rate(st) * CAP_MIN; }

  // ---------------------------------------------------------------- at the counter
  counterRows(st) {
    if (!st.biz) return '';
    const g = this.game, e = g.economy, o = this.owned[st.biz.key];
    const row = (label, small, btn) => `<div class="erow"><div><b>${label}</b><small>${small}</small></div><div class="btns">${btn}</div></div>`;
    if (!o) {
      const funds = e.money + e.bank;
      return '<h3 class="kih">This business is for sale</h3>' + row(`Buy ${st.biz.name}`, `${st.biz.kind} · takes about ${money(this.rate(st))} a minute`, `<button data-a="bizBuy" ${funds >= st.biz.price ? '' : 'disabled'}>${money(st.biz.price)}</button>`);
    }
    const sec = SECURITY[o.sec || 0], next = SECURITY[(o.sec || 0) + 1];
    let h = `<h3 class="kih">Your business</h3><p class="lede">"Hey, boss!"${o.closed > 0 ? ` We're shut for repairs after the raid: open again in ${Math.ceil(o.closed / 60)} min.` : ''}</p>`;
    h += row('The till', `${money(o.till)} of ${money(this.cap(st))} · ${money(this.rate(st))} a minute · ${money(o.earned || 0)} earned so far`, `<button data-a="bizCollect" ${o.till >= 1 ? '' : 'disabled'}>Collect</button>`);
    h += row('Security', `${sec.name}${next ? ` · next: ${next.name} (fewer raids)` : ' · the best there is'}`, next ? `<button data-a="bizSec" ${e.money + e.bank >= next.cost * st.biz.price ? '' : 'disabled'}>${money(next.cost * st.biz.price)}</button>` : '');
    h += row('Sell the business', 'You get 60% of what you paid', `<button data-a="bizSell">${money(st.biz.price * 0.6)}</button>`);
    return h;
  }

  counterAct(st, a) {
    const g = this.game, e = g.economy, o = this.owned[st.biz?.key];
    const pay = (n) => { const c = Math.min(e.money, n); e.bank -= n - c; e.addMoney(-c); };
    if (a === 'bizBuy' && !o && e.money + e.bank >= st.biz.price) {
      pay(st.biz.price);
      this.owned[st.biz.key] = { till: 0, sec: 0, closed: 0, earned: 0, name: st.biz.name };
      g.sfx.play('cash');
      g.hud.toast(`You own ${st.biz.name}! Its takings pile up in the till`, 0x7be08a);
      g.news?.add(`New owner for ${st.biz.name}. Staff say the new boss "seems nice. Quiet. Pays cash."`, 'money');
      if (this.mine().length === 1) this.raidT = Math.max(this.raidT, 360);
    }
    if (a === 'bizCollect' && o?.till >= 1) { e.addMoney(Math.floor(o.till), `takings from ${st.biz.name}`); o.till -= Math.floor(o.till); g.sfx.play('cash'); }
    if (a === 'bizSec' && o) {
      const next = SECURITY[(o.sec || 0) + 1];
      if (next && e.money + e.bank >= next.cost * st.biz.price) { pay(next.cost * st.biz.price); o.sec = (o.sec || 0) + 1; g.hud.toast(`${next.name} fitted at ${st.biz.name}`, 0x7be08a); }
    }
    if (a === 'bizSell' && o) {
      if (this.raid?.st === st) { g.hud.toast('Not in the middle of a raid!', 0xff8a6a); return; }
      e.addMoney(Math.floor(o.till) + st.biz.price * 0.6, `sold ${st.biz.name}`);
      delete this.owned[st.biz.key];
    }
    this.save();
  }

  // ---------------------------------------------------------------- raids
  startRaid(st = null) {
    const g = this.game;
    const mine = this.mine().filter((s) => !(this.owned[s.biz.key].closed > 0));
    if (!mine.length) return false;
    if (!st) {
      // the less security, the likelier it's the target
      const w = mine.map((s) => SECURITY[this.owned[s.biz.key].sec || 0].raid), tot = w.reduce((a, b) => a + b, 0);
      let r = Math.random() * tot;
      st = mine[mine.length - 1];
      for (let i = 0; i < mine.length; i++) { r -= w[i]; if (r <= 0) { st = mine[i]; break; } }
    }
    const o = this.owned[st.biz.key];
    const door = st.it.door.clone();
    const n = 2 + Math.floor(Math.random() * 2) + (o.sec ? 0 : 1);
    const crew = [];
    for (let k = 0; k < n; k++) {
      const p = g.citizens.randomPointOn(st.island, door, 9, 0) || door.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
      const npc = g.citizens.spawnCitizen(st.island, 'goon', p, { look: { shirt: 0x2a2a2a, pants: 0x1b1b1b, skin: [0xd9a47c, 0x7a4f35, 0xf1c9a5][k % 3], hat: 'cap', hatColor: 0x8a1a1a } });
      if (!npc) continue;
      Object.assign(npc, { hp: 130, raider: true, cash: 60 + Math.floor(Math.random() * 120),
        weapon: k === 0 ? { rate: [1.2, 0.5], dmg: 13, acc: 1.1, range: 14, shotgun: true } : { rate: [0.9, 0.5], dmg: 7, acc: 1.1, range: 18 } });
      crew.push(npc);
    }
    if (!crew.length) return false;
    const pt = g.shorePlayer.body.translation();
    const dist = Math.hypot(pt.x - door.x, pt.z - door.z);
    this.raid = { st, crew, t: 0, limit: Math.round(Math.min(330, 110 + dist / 6)), at: door };
    this.timerEl.classList.remove('hidden');
    const msg = `The Ashen Hand are smashing up ${st.biz.name}! Get here in ${Math.ceil(this.raid.limit / 60)} minutes or they'll clean us out.`;
    g.story?.phone?.text?.(`${st.biz.name} (manager)`, msg);
    g.hud.toast(`RAID! ${st.biz.name} is under attack: it's on your map`, 0xff6a5a);
    g.hud.flashBanner?.('RAID', '#ff5a4a');
    g.sfx.play('scream');
    return true;
  }

  endRaid(won) {
    const g = this.game, r = this.raid, st = r.st, o = this.owned[st.biz.key];
    for (const n of r.crew) if (g.citizens.list.includes(n) && !n.down) g.citizens.despawn(n);
    this.raid = null;
    this.timerEl.classList.add('hidden');
    this.raidT = (420 + Math.random() * 480) / Math.max(0.3, this.mine().reduce((t, s) => t + SECURITY[this.owned[s.biz.key].sec || 0].raid, 0) / Math.max(1, this.mine().length));
    if (!o) return;
    if (won) {
      const bonus = Math.round(1000 + st.biz.price * 0.02);
      g.economy.addMoney(bonus, `saved ${st.biz.name}: the staff whip round`);
      g.hud.toast(`You saw off the Ashen Hand at ${st.biz.name}`, 0x7be08a);
      g.news?.add(`Shoppers at ${st.biz.name} describe a "terrifying" gunfight as a gang raid went badly wrong for the gang.`, 'crime');
    } else {
      const lost = Math.floor(o.till);
      o.till = 0; o.closed = 300;
      g.hud.toast(`Too late: they cleaned out ${st.biz.name}${lost ? ` (${money(lost)} gone)` : ''}. It's shut for 5 minutes.`, 0xff6a5a);
      g.news?.add(`${st.biz.name} was trashed by a gang this afternoon. The owner was nowhere to be seen.`, 'crime');
      g.stocks?.event('GOMT', -0.01);
    }
    this.save();
  }

  update(dt) {
    const g = this.game;
    if (!this.appAdded && g.story?.phone) { g.story.phone.addApp(this.app()); this.appAdded = true; }
    const mine = this.mine();
    for (const st of mine) {
      const o = this.owned[st.biz.key];
      if (o.closed > 0) { o.closed -= dt; continue; }
      if (!g.stores.clerkOK(st)) continue; // nobody minding the shop
      const add = Math.min(this.rate(st) * dt / 60, this.cap(st) - o.till);
      if (add > 0) { o.till += add; o.earned = (o.earned || 0) + add; }
    }
    this.saveT += dt;
    if (this.saveT > 20) { this.saveT = 0; if (mine.length) this.save(); }
    const r = this.raid;
    if (!r) {
      if (!mine.length) return;
      // no raids while you're busy with a story job or the police are on you
      const busy = g.story?.active || (g.police?.wanted || 0) > 0 || !g.onShore || g.health?.dead;
      this.raidT -= dt * (busy ? 0.25 : 1);
      if (this.raidT <= 0) { if (!this.startRaid()) this.raidT = 120; }
      return;
    }
    r.t += dt;
    const left = this.raidLeft;
    this.timerEl.textContent = `RAID at ${r.st.biz.name}: ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · ${r.crew.filter((n) => g.citizens.list.includes(n) && !n.down).length} left`;
    const pt = g.shorePlayer.body.translation();
    const alive = r.crew.filter((n) => g.citizens.list.includes(n) && !n.down);
    const near = Math.hypot(pt.x - r.at.x, pt.z - r.at.z) < 45;
    for (const n of alive) if (near && !n.alerted) { n.alerted = true; n.lastSeen = new THREE.Vector3(pt.x, pt.y, pt.z); }
    if (!alive.length) this.endRaid(true);
    else if (r.t > r.limit && !near) this.endRaid(false);
    else if (r.t > r.limit + 90) this.endRaid(false);
  }

  get raidLeft() { return this.raid ? Math.max(0, this.raid.limit - this.raid.t) : 0; }

  // the minimap / big map
  marks() {
    const out = [];
    for (const st of this.mine()) out.push({ x: st.it.counter.x, z: st.it.counter.z, color: '#7be08a', r: 3.5, label: '$', name: st.biz.name });
    if (this.raid) {
      out.push({ x: this.raid.at.x, z: this.raid.at.z, color: (performance.now() / 250) % 2 < 1 ? '#ff3030' : '#ffd166', r: 5.5, label: '!', name: `RAID: ${this.raid.st.biz.name}` });
      for (const n of this.raid.crew) if (this.game.citizens.list.includes(n) && !n.down) { const t = n.body.translation(); out.push({ x: t.x, z: t.z, color: '#ff3030', r: 2.5 }); }
    }
    return out;
  }

  // ---------------------------------------------------------------- the phone app
  app() {
    return {
      id: 'biz', icon: '🏪', name: 'Business',
      render: (head) => {
        const mine = this.mine();
        const raid = this.raid ? `<div class="ph-alert">RAID at <b>${this.raid.st.biz.name}</b>: ${Math.floor(this.raidLeft / 60)}:${String(Math.floor(this.raidLeft % 60)).padStart(2, '0')} left</div>` : '';
        const total = mine.reduce((t, st) => t + this.owned[st.biz.key].till, 0);
        return head('Business') + raid + (mine.length ? `<div class="ph-sub">In the tills <b>${money(total)}</b> · ${money(mine.reduce((t, st) => t + this.rate(st), 0))}/min</div>` : '') + '<div class="ph-list">'
          + mine.map((st) => { const o = this.owned[st.biz.key]; return `<div class="ph-item"><div><b>${st.biz.name}</b><small>${st.biz.kind} · ${o.closed > 0 ? 'shut for repairs' : `till ${money(o.till)}`} · ${SECURITY[o.sec || 0].name.toLowerCase()} security</small></div></div>`; }).join('')
          + Object.entries(this.owned).filter(([k]) => !mine.some((st) => st.biz.key === k)).map(([, o]) => `<div class="ph-item locked"><div><b>${o.name || 'Your shop'}</b><small>Not trading today</small></div></div>`).join('')
          + (mine.length ? `</div><div class="ph-foot"><button data-a="app-act" data-app="biz" data-cmd="wire" ${total >= 1 ? '' : 'disabled'}>Wire the takings to the bank (20% fee)</button></div>`
            : '<small class="ph-empty">You don\'t own a business yet. Ask at the counter of any shop or diner: everything\'s for sale.</small></div>');
      },
      act: (cmd) => {
        if (cmd !== 'wire') return;
        const g = this.game, e = g.economy;
        let t = 0;
        for (const st of this.mine()) { const o = this.owned[st.biz.key]; t += Math.floor(o.till); o.till -= Math.floor(o.till); }
        if (!t) return;
        e.bank += Math.round(t * 0.8); e.addMoney(0);
        g.hud.toast(`${money(t * 0.8)} wired to your bank`, 0x7be08a);
        g.sfx.play('cash');
        this.save();
      },
    };
  }
}
