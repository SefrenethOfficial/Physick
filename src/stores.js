import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';

// Every walk-in shop, diner and lobby has someone behind the counter. Shops are stocked with
// their own kind of goods, sitting on the shelves. Pick something up where the clerk can see
// and you'd better pay for it at the counter — walk out with it and they'll call the police
// (and some clerks keep a shotgun under the till). Point a gun at them and you can rob the till.

export const CATALOG = {
  grocery: ['soda', 'water', 'energy', 'chips', 'cereal', 'canned'],
  liquor: ['whiskey', 'wine', 'beer', 'beer', 'chips', 'soda'],
  electronics: ['phone', 'headphones', 'console', 'camera', 'radio', 'laptop'],
  hardware: ['wrench', 'flashlight', 'rope', 'toolbox', 'bat', 'jerrycan'],
  pharmacy: ['pills', 'pills', 'medkit', 'water', 'energy'],
  pawn: ['watch', 'necklace', 'camera', 'vase', 'handbag', 'radio'],
  diner: ['burger', 'burger', 'soda', 'mug'],
  guns: ['magnum', 'rifle', 'combat', 'sniper', 'lmg', 'pistol'],
};
// What the gun store sells over the counter (each gun comes with some rounds).
const GUN_STOCK = [
  { id: 'magnum', price: 2800, ammo: ['magnumAmmo', 18], blurb: '.357 Magnum. Six shots, each one hits like a truck. 18 rounds.' },
  { id: 'rifle', price: 6500, ammo: ['rifleAmmo', 90], blurb: 'Full-auto 5.56 with a red-dot sight. Accurate a long way out. 90 rounds.' },
  { id: 'combat', price: 5200, ammo: ['shells', 24], blurb: 'Semi-auto 12 gauge: no pumping, just keep pulling. 24 shells.' },
  { id: 'sniper', price: 9500, ammo: ['sniperAmmo', 15], blurb: 'Bolt-action .308 with a 10x scope (hold right-click to aim). 15 rounds.' },
  { id: 'lmg', price: 14000, ammo: ['rifleAmmo', 200], blurb: 'Belt-fed, bipod, 200-round box. Heavy. 200 rounds.' },
  { id: 'pistol', price: 500, ammo: ['pistolAmmo', 24], blurb: 'A reliable 9 mm, cheaper than Vic\'s. 24 rounds.' },
  { ammoOnly: 'magnumAmmo', n: 18, price: 110, name: 'Magnum rounds ×18' },
  { ammoOnly: 'rifleAmmo', n: 90, price: 220, name: 'Rifle rounds ×90' },
  { ammoOnly: 'sniperAmmo', n: 10, price: 150, name: 'Sniper rounds ×10' },
  { ammoOnly: 'shells', n: 16, price: 80, name: 'Shotgun shells ×16' },
  { ammoOnly: 'pistolAmmo', n: 24, price: 50, name: 'Pistol rounds ×24' },
  { ammoOnly: 'smgAmmo', n: 90, price: 140, name: 'SMG rounds ×90' },
];
const SKIN = [0xf1c9a5, 0xd9a47c, 0xa8724f, 0x7a4f35, 0xffdcbd];
const UNIFORM = {
  grocery: 0x2f8a52, liquor: 0x3a3a3a, electronics: 0x1f5fbf, hardware: 0xd9622b, pharmacy: 0xf2f2ee,
  pawn: 0x5a4a3a, diner: 0xd8d0c0, guns: 0x4a5a3a, bank: 0x1f3b2e, police: 0x1c2f6e, hospital: 0x8fd0c8, office: 0x2c3440,
};
const price = (def) => Math.max(2, Math.round((def.value ?? 10) * 1.25));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function themeOf(it) {
  const n = (it.name || '').toUpperCase();
  if (it.kind === 'diner') return 'diner';
  if (it.kind === 'pawn') return 'pawn';
  if (it.kind === 'bank') return 'bank';
  if (it.kind === 'lobby' || it.kind === 'office') return n.includes('POLICE') ? 'police' : n.includes('HOSPITAL') ? 'hospital' : 'office';
  if (n.includes('GUN')) return 'guns';
  if (n.includes('LIQUOR')) return 'liquor';
  if (n.includes('ELECTRONIC') || n.includes('GADGET')) return 'electronics';
  if (n.includes('HARDWARE')) return 'hardware';
  if (n.includes('PHARMACY')) return 'pharmacy';
  return 'grocery';
}

export class Stores {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.unpaid = []; // { def, st, held }
    for (const it of [...game.city.interiors, ...(game.hood?.interiors || []), ...(game.saltmarsh?.interiors || [])]) {
      if (!it.clerk || it.name?.startsWith('SCOOPS')) continue; // the parlour's shut
      const st = { it, theme: themeOf(it), island: it.island, clerk: null, stocked: false, showStock: false, props: [], angry: 0, robbedAt: -1e9, clerkGoneAt: 0 };
      st.label = it.name ? it.name.split('·')[0].trim() : st.theme;
      this.list.push(st);
      this.spawnClerk(st);
    }
  }

  spawnClerk(st) {
    const c = this.game.citizens;
    const p = st.it.clerk.clone();
    const n = c.spawnCitizen(st.island, 'clerk', p, { look: { shirt: UNIFORM[st.theme] ?? 0x2c3440, pants: 0x2a2a30, skin: pick(SKIN) } });
    if (!n) return;
    n.store = st;
    n.post = p;
    n.faceYaw = st.it.yaw;
    n.heading = st.it.yaw;
    n.armed = st.theme === 'liquor' || st.theme === 'pawn' || st.theme === 'guns' || Math.random() < 0.15;
    n.cash = 80 + Math.floor(Math.random() * 300);
    n.items = [];
    st.clerk = n;
  }

  clerkOK(st) { return st.clerk && this.game.citizens.list.includes(st.clerk) && !st.clerk.hostage; }

  contains(st, p, margin = 0.5) {
    const r = st.it.room;
    const v = new THREE.Vector3(p.x - r.center.x, 0, p.z - r.center.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -r.yaw);
    return Math.abs(v.x) < r.hw + margin && Math.abs(v.z) < r.hd + margin && Math.abs(p.y - r.center.y - 1) < 3;
  }

  storeAt(p) { return this.list.find((st) => this.contains(st, p)) || null; }

  nearCounter(p) {
    return this.list.find((st) => st.it.counter && Math.hypot(st.it.counter.x - p.x, st.it.counter.z - p.z) < 2.6 && Math.abs(p.y - st.it.counter.y - 1) < 1.5) || null;
  }

  // ---- shelves ----
  stock(st) {
    const cat = CATALOG[st.theme];
    st.stocked = true;
    if (!cat) return;
    const g = this.game;
    const slots = [...st.it.slots];
    // spread the stock over every shelf (top to bottom), not just the first few boards
    const fill = st.theme === 'diner' ? 0.5 : Math.min(0.75, 170 / Math.max(1, slots.length));
    let n = 0;
    // shelves stock by the run: a few of the same thing side by side, like a real shop
    let runDef = null, run = 0;
    for (const s of slots.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x || a.pos.z - b.pos.z)) {
      if (n > 170) break;
      if (Math.random() > fill) continue;
      if (!runDef || run <= 0) { runDef = ITEM_BY_ID[pick(cat)]; run = 2 + Math.floor(Math.random() * 4); }
      run--;
      const def = s.kind === 'table' ? ITEM_BY_ID[pick(['burger', 'mug', 'soda'])] : runDef;
      if (!def) continue;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.it.yaw + (Math.random() - 0.5) * 0.2);
      const prop = g.portSandbox.spawn(def, new THREE.Vector3(s.pos.x, s.pos.y + 0.16, s.pos.z), q, { noHistory: true });
      prop.store = st;
      prop.mesh.traverse((o) => { o.castShadow = false; });
      prop.mesh.visible = st.showStock;
      st.props.push(prop);
      n++;
    }
  }

  unstock(st) {
    const sb = this.game.portSandbox;
    for (const p of st.props) if (sb.props.has(p) && p.store === st && p !== this.game.heldProp) sb.remove(p);
    st.props = [];
    st.stocked = false;
  }

  // You took something off a shelf (into your hand or the bag).
  onTake(prop, how) {
    const st = prop.store;
    if (!st) return;
    prop.store = null;
    const g = this.game;
    const pt = g.player.body.translation();
    if (!this.clerkOK(st) || !this.contains(st, pt) || st.theme === 'office') return; // nobody minding the shop
    const eye = g.player.eye;
    if (!g.citizens.canSee(st.clerk, eye, 30)) return;
    this.unpaid.push({ def: prop.def, st, held: how === 'hand' });
    const total = this.unpaid.filter((u) => u.st === st).reduce((t, u) => t + price(u.def), 0);
    g.hud.toast(`Clerk: "That's $${total} — pay at the counter."`, 0xffd166);
  }

  ateUnpaid(def) { void def; } // still owed: they'll want paying for it

  pay(st) {
    const g = this.game, e = g.economy;
    const owed = this.unpaid.filter((u) => u.st === st);
    const total = owed.reduce((t, u) => t + price(u.def), 0);
    if (!total) return;
    if (e.money < total) { g.hud.toast('Not enough cash', 0xff8a6a); return; }
    e.addMoney(-total, 'paid');
    this.unpaid = this.unpaid.filter((u) => u.st !== st);
    g.sfx.play('cash');
  }

  // ---- the counter ----
  open(st) {
    const g = this.game, e = g.economy;
    if (!this.clerkOK(st)) { g.hud.toast('Nobody here to serve you'); return; }
    if (st.angry > 0) { g.hud.toast('Clerk: "Get out of my shop!"', 0xff6a5a); return; }
    if (st.theme === 'bank') { g.bank.open(false); return; }
    if (st.theme === 'pawn') { e.openPawn(); return; }
    if (st.theme === 'guns') { this.openGuns(st); return; }
    const render = () => {
      const row = (label, small, btn) => `<div class="erow"><div><b>${label}</b><small>${small}</small></div><div class="btns">${btn}</div></div>`;
      const owed = this.unpaid.filter((u) => u.st === st);
      const total = owed.reduce((t, u) => t + price(u.def), 0);
      let html = e.header() + (g.business?.owns(st) ? g.business.counterRows(st) : '');
      if (total) html += row(`Pay for ${owed.length} item${owed.length > 1 ? 's' : ''}`, owed.map((u) => u.def.name).join(', '), `<button data-a="pay" ${e.money >= total ? '' : 'disabled'}>$${total}</button>`);
      if (st.theme === 'hospital') {
        const cost = 150;
        html += '<p class="lede">"Take a seat. Or, for a fee, the doctor will see you now."</p>';
        html += row('Get patched up', 'Back to full health', `<button data-a="heal" ${e.money >= cost && g.health.hp < g.health.max ? '' : 'disabled'}>$${cost}</button>`);
      } else if (st.theme === 'police') {
        const stars = g.police.wanted, fine = 400 * stars;
        html += `<p class="lede">${stars ? '"You do know you\'re a wanted person, right?"' : '"Can I help you?"'}</p>`;
        html += row('Pay your fines', stars ? `Hand yourself in and pay up: clears ${stars} star${stars > 1 ? 's' : ''}` : 'Nothing outstanding', `<button data-a="fine" ${stars && e.money >= fine ? '' : 'disabled'}>${stars ? '$' + fine.toLocaleString() : '—'}</button>`);
      } else if (st.theme === 'office') {
        html += '<p class="lede">"Sorry, staff only beyond this point. Have a nice day."</p>';
      } else {
        html += `<p class="lede">${st.theme === 'diner' ? '"What can I get you, hon?"' : '"Anything I can help you find?"'}</p>`;
        const seen = new Set();
        for (const id of CATALOG[st.theme] || []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const def = ITEM_BY_ID[id];
          html += row(def.name, def.heal ? `+${def.heal} health` : `resells for ~$${def.value}`, `<button data-a="buy" data-id="${id}" ${e.money >= price(def) ? '' : 'disabled'}>$${price(def)}</button>`);
        }
      }
      if (!g.business?.owns(st)) html += g.business?.counterRows(st) || '';
      e.open(st.label.charAt(0) + st.label.slice(1).toLowerCase(), html, (body) => body.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b) return;
        if (b.dataset.a.startsWith('biz')) g.business?.counterAct(st, b.dataset.a);
        if (b.dataset.a === 'pay') this.pay(st);
        if (b.dataset.a === 'buy') { const def = ITEM_BY_ID[b.dataset.id]; if (e.money >= price(def)) { e.addMoney(-price(def), `bought ${def.name.toLowerCase()}`); g.giveItem(def); g.sfx.play('cash'); } }
        if (b.dataset.a === 'heal') { e.addMoney(-150, 'doctor'); g.health.hp = g.health.max; g.sfx.play('freeze'); }
        if (b.dataset.a === 'fine' && g.police.wanted) { e.addMoney(-400 * g.police.wanted, 'fines'); g.police.clearWanted(); g.hud.toast('Fines paid — you\'re free to go', 0x7be08a); }
        render();
      }));
    };
    render();
  }

  // ---- the gun store: the good stuff, legally (so not while the police are after you) ----
  openGuns(st) {
    const g = this.game, e = g.economy;
    const render = () => {
      const row = (label, small, btn) => `<div class="erow"><div><b>${label}</b><small>${small}</small></div><div class="btns">${btn}</div></div>`;
      const owed = this.unpaid.filter((u) => u.st === st);
      const total = owed.reduce((t, u) => t + price(u.def), 0);
      let html = e.header();
      if (total) html += row(`Pay for ${owed.length} item${owed.length > 1 ? 's' : ''}`, owed.map((u) => u.def.name).join(', '), `<button data-a="pay" ${e.money >= total ? '' : 'disabled'}>$${total}</button>`);
      const wanted = g.police.wanted > 0;
      html += `<p class="lede">${wanted ? '"I can see your face on the news. Come back when the police aren\'t looking for you."' : '"Everything here\'s legal, licensed and very, very loud."'}</p>`;
      const a = e.ammo;
      html += `<div class="econ-head"><span>Ammo: pistol <b>${a.pistolAmmo}</b> · magnum <b>${a.magnumAmmo}</b> · SMG <b>${a.smgAmmo}</b> · rifle <b>${a.rifleAmmo}</b> · shells <b>${a.shells}</b> · sniper <b>${a.sniperAmmo}</b></span></div>`;
      for (const it of GUN_STOCK) {
        const def = it.id && ITEM_BY_ID[it.id];
        const label = def ? def.name : it.name;
        html += row(label, it.blurb || `You have ${a[it.ammoOnly] || 0}`, `<button data-a="gun" data-i="${GUN_STOCK.indexOf(it)}" ${!wanted && e.money >= it.price ? '' : 'disabled'}>$${it.price.toLocaleString()}</button>`);
      }
      e.open('Saltmarsh Guns & Ammo', html, (body) => body.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b) return;
        if (b.dataset.a === 'pay') this.pay(st);
        if (b.dataset.a === 'gun') {
          const it = GUN_STOCK[+b.dataset.i];
          if (g.police.wanted > 0 || e.money < it.price) return;
          e.addMoney(-it.price, it.id ? `bought a ${ITEM_BY_ID[it.id].name.toLowerCase()}` : 'ammo');
          if (it.id) g.giveItem(ITEM_BY_ID[it.id]);
          if (it.ammo) e.addAmmo(it.ammo[0], it.ammo[1]);
          if (it.ammoOnly) e.addAmmo(it.ammoOnly, it.n);
          g.refreshHolding?.();
          g.sfx.play('cash');
        }
        render();
      }));
    };
    render();
  }

  // ---- hold-ups ----
  // Their keys, if you've got them (in your hand or your bag).
  keyFor(st) {
    const g = this.game, id = `key_${st.theme}`;
    if (g.held?.id === id || g.economy.bag.includes(id)) return ITEM_BY_ID[id];
    return null;
  }

  // Nobody behind the counter and you've got the keys: help yourself, quietly.
  openTill(st) {
    const g = this.game;
    if (g.time - st.robbedAt < 300) { g.hud.toast('The till\'s empty'); return; }
    st.robbedAt = g.time;
    const take = 120 + Math.floor(Math.random() * 280) + (st.theme === 'liquor' || st.theme === 'electronics' ? 150 : 0);
    g.economy.addMoney(take, `from the ${st.label.toLowerCase()} till`);
    g.sfx.play('cash');
    g.hud.toast(`The key turns, the drawer slides out: $${take}. Nobody saw a thing.`, 0x7be08a);
  }

  canRob(st) { return this.clerkOK(st) && !this.game.business?.owns(st) && this.game.time - st.robbedAt > 300 && !['police', 'office', 'hospital', 'bank'].includes(st.theme); }

  rob(st) {
    const g = this.game;
    if (g.business?.owns(st)) { g.hud.toast('Clerk: "Boss? Is this a test?"', 0xffd166); return; }
    if (!this.canRob(st)) { g.hud.toast(this.clerkOK(st) ? 'The till\'s empty' : 'Nobody here'); return; }
    g.stocks?.event('GOMT', -0.04, Math.random() < 0.5 ? `Another hold-up in Verian: ${st.label.toLowerCase()} robbed at gunpoint. GoMart shares slip on the crime wave.` : null);
    st.robbedAt = g.time;
    const n = st.clerk;
    n.handsUp = 8;
    g.sfx.play('scream');
    g.hud.toast('Clerk: "Okay, okay! Take it!"', 0xffd166);
    const take = 150 + Math.floor(Math.random() * 450) + (st.theme === 'liquor' || st.theme === 'electronics' ? 200 : 0);
    setTimeout(() => { g.economy.addMoney(take, 'from the till'); g.sfx.play('cash'); }, 1200);
    const at = st.it.counter.clone();
    g.police.crime('robbery', 2, at);
    Object.assign(n, { reportT: 4, reportSev: 2, reportPos: at, reportSeen: true, reportWhy: 'robbery' });
  }

  update(dt) {
    const g = this.game;
    const pt = g.shorePlayer.body.translation();
    for (const st of this.list) {
      const d = Math.hypot(st.it.room.center.x - pt.x, st.it.room.center.z - pt.z);
      if (!st.stocked && d < 80) this.stock(st);
      else if (st.stocked && d > 150) this.unstock(st);
      st.angry = Math.max(0, st.angry - dt);
      // shelf stock is only drawn when you're at or in the shop (it's a lot of little things)
      const show = d < Math.max(st.it.room.hw, st.it.room.hd) + 14;
      if (show !== st.showStock) { st.showStock = show; for (const p of st.props) if (p.store === st) p.mesh.visible = show; }
      // a new clerk turns up a while after the old one was killed or taken
      if (!this.clerkOK(st) && !(st.clerk && st.clerk.hostage)) {
        st.clerkGoneAt ||= g.time;
        if (g.time - st.clerkGoneAt > 90 && d > 40) { st.clerkGoneAt = 0; this.spawnClerk(st); }
      }
    }
    // walking out without paying
    if (this.unpaid.length) {
      const here = this.storeAt(pt);
      for (const st of [...new Set(this.unpaid.map((u) => u.st))]) {
        if (here === st) continue;
        const items = this.unpaid.filter((u) => u.st === st);
        this.unpaid = this.unpaid.filter((u) => u.st !== st);
        const at = st.it.door.clone();
        g.police.crime('theft', 1, at);
        g.hud.toast(`Shoplifting! The ${st.label.toLowerCase()} clerk saw you walk out with ${items.length > 1 ? 'their stuff' : 'the ' + items[0].def.name.toLowerCase()}`, 0xff6a5a);
        if (this.clerkOK(st)) {
          st.angry = 25;
          Object.assign(st.clerk, { reportT: 2, reportSev: 1, reportPos: at, reportSeen: true, reportWhy: 'theft' });
          g.sfx.play('scream');
        }
      }
    }
  }
}
