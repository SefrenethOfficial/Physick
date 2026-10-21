import { ITEM_BY_ID } from './items.js';

// Money, the storage bag, owned boats, and the shop panels. Progress is saved in this browser.

const KEY = 'physick.save.v1';
export const BAG_CAPACITY = 40; // total weight

export class Economy {
  constructor(game) {
    this.game = game;
    this.money = 150;
    this.bank = 0; // safe in Verian National
    this.bag = []; // item ids
    this.ownedBoats = ['dinghy'];
    this.ammo = { pistolAmmo: 0, smgAmmo: 0, shells: 0 };
    this.perks = {};
    this.load();
    this.panel = document.getElementById('panel');
    this.panel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === this.panel || e.target.closest('.close')) this.close();
    });
  }

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) {
        this.money = s.money ?? this.money;
        this.bank = s.bank ?? 0;
        this.bag = (s.bag || []).filter((id) => ITEM_BY_ID[id]);
        this.ownedBoats = s.ownedBoats?.length ? s.ownedBoats : this.ownedBoats;
        Object.assign(this.ammo, s.ammo || {});
        Object.assign(this.perks, s.perks || {});
      }
    } catch { /* no saved game */ }
  }

  save() {
    this.game.hud?.setBank?.(this.bank);
    try { localStorage.setItem(KEY, JSON.stringify({ bank: this.bank, money: this.money, bag: this.bag, ownedBoats: this.ownedBoats, ammo: this.ammo, perks: this.perks })); } catch { /* storage unavailable */ }
  }

  get weight() { return this.bag.reduce((w, id) => w + (ITEM_BY_ID[id].weight ?? 1), 0); }

  addMoney(n, why) {
    this.money = Math.max(0, Math.round(this.money + n));
    this.game.hud.setMoney(this.money, n);
    this.game.hud.setBank?.(this.bank);
    if (why) this.game.hud.toast(`${n >= 0 ? '+' : '-'}$${Math.abs(Math.round(n))} ${why}`, n >= 0 ? 0x7be08a : 0xff8a6a);
    this.save();
  }

  // Put an item in the bag; cash bundles go straight into your pocket.
  stash(def, silent = false) {
    if (def.cash) { this.addMoney(80 + Math.floor(Math.random() * 120), 'cash'); return true; }
    if (def.noBag) { if (!silent) this.game.hud.toast(`The ${def.name.toLowerCase()} won't go in the bag — throw it in the sea`, 0xff8a6a); return false; }
    if (this.weight + (def.weight ?? 1) > BAG_CAPACITY) {
      if (!silent) this.game.hud.toast('Bag is full', 0xff8a6a);
      return false;
    }
    this.bag.push(def.id);
    if (!silent) this.game.hud.toast(`${def.name} → bag`);
    this.game.hud.setBag(this.weight, BAG_CAPACITY);
    this.save();
    return true;
  }

  addAmmo(kind, n) {
    this.ammo[kind] = (this.ammo[kind] || 0) + n;
    this.save();
    this.game.refreshHolding?.();
  }

  takeOut(i) {
    const id = this.bag.splice(i, 1)[0];
    this.game.hud.setBag(this.weight, BAG_CAPACITY);
    this.save();
    return ITEM_BY_ID[id];
  }

  loseBag() {
    const n = this.bag.length;
    this.bag = [];
    this.game.hud.setBag(0, BAG_CAPACITY);
    this.save();
    return n;
  }

  // ---------------------------------------------------------------- panels
  get isOpen() { return !this.panel.classList.contains('hidden'); }

  open(title, html, bind) {
    this.panel.querySelector('h2').textContent = title;
    // fresh element each time so old click handlers don't pile up
    const old = this.panel.querySelector('.body');
    const body = old.cloneNode(false);
    old.replaceWith(body);
    body.innerHTML = html;
    bind?.(body);
    this.panel.classList.remove('hidden');
    this.game.panelOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  close() {
    this.panel.classList.add('hidden');
    this.game.panelOpen = false;
    this.game.lock();
  }

  header() {
    return `<div class="econ-head"><span>Cash <b>$${this.money}</b></span><span>Bank <b>$${this.bank.toLocaleString()}</b></span><span>Bag <b>${this.weight.toFixed(1)} / ${BAG_CAPACITY}</b></span></div>`;
  }

  openBag() {
    const render = () => {
      const rows = this.bag.map((id, i) => {
        const d = ITEM_BY_ID[id];
        return `<div class="erow"><div><b>${d.name}</b><small>worth ~$${d.value} · weight ${d.weight ?? 1}</small></div>
          <div class="btns"><button data-a="hold" data-i="${i}">Hold</button><button data-a="drop" data-i="${i}">Drop</button></div></div>`;
      }).join('') || '<p class="empty">Your bag is empty. Pick things up and press <kbd>B</kbd> to bag them.</p>';
      this.open('Storage bag', this.header() + rows + (this.game.story?.keyItemsHtml() || ''), (body) => body.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-a]');
        if (!b) return;
        const i = +b.dataset.i;
        if (b.dataset.a === 'hold') {
          if (this.game.held) { this.game.hud.toast('Your hand is full'); return; }
          const def = this.takeOut(i);
          this.game.holdItem(def);
          this.close();
        } else {
          const def = this.takeOut(i);
          this.game.dropFromBag(def);
          render();
        }
      }));
    };
    render();
  }

  openPawn() {
    const render = () => {
      const held = this.game.held;
      const heldRow = held ? `<div class="erow hl"><div><b>${held.name}</b><small>in your hand</small></div><div class="btns"><button data-a="held">Sell $${held.value}</button></div></div>` : '';
      const rows = this.bag.map((id, i) => {
        const d = ITEM_BY_ID[id];
        return `<div class="erow"><div><b>${d.name}</b><small>weight ${d.weight ?? 1}</small></div><div class="btns"><button data-a="sell" data-i="${i}">Sell $${d.value}</button></div></div>`;
      }).join('');
      const total = this.bag.reduce((t, id) => t + ITEM_BY_ID[id].value, 0);
      const all = this.bag.length ? `<button class="big" data-a="all">Sell everything in the bag · $${total}</button>` : '';
      this.open('Pawn shop', this.header() + '<p class="lede">"Cash for anything. No questions asked."</p>' + heldRow + rows + all +
        (!this.bag.length && !held ? '<p class="empty">You have nothing to sell.</p>' : ''), (body) => body.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-a]');
        if (!b) return;
        if (b.dataset.a === 'sell') { const d = this.takeOut(+b.dataset.i); this.addMoney(d.value, `sold ${d.name}`); }
        if (b.dataset.a === 'held' && this.game.held) { const d = this.game.held; this.game.clearHand(); this.addMoney(d.value, `sold ${d.name}`); }
        if (b.dataset.a === 'all') { let t = 0; while (this.bag.length) t += this.takeOut(0).value; this.addMoney(t, 'sold the lot'); }
        this.game.sfx.play('select');
        render();
      }));
    };
    render();
  }

  openDealer(types) {
    const render = () => {
      const rows = types.filter((t) => t.price !== undefined).map((t) => {
        const owned = this.ownedBoats.includes(t.id);
        const btn = owned ? '<span class="owned">Owned</span>'
          : `<button data-a="buy" data-id="${t.id}" ${this.money < t.price ? 'disabled' : ''}>Buy $${t.price.toLocaleString()}</button>`;
        return `<div class="erow"><div><b>${t.name}</b><small>${Math.round(t.maxSpeed * 1.944)} kn · hull ${t.hp} · ${t.blurb}</small></div><div class="btns">${btn}</div></div>`;
      }).join('');
      this.open('Boat sales', this.header() + '<p class="lede">Bought boats are waiting at the marina berths.</p>' + rows, (body) => body.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-a="buy"]');
        if (!b) return;
        const t = types.find((x) => x.id === b.dataset.id);
        if (this.money < t.price) return;
        this.addMoney(-t.price, `bought a ${t.name}`);
        this.ownedBoats.push(t.id);
        this.save();
        this.game.boats.spawnOwned(t.id);
        this.game.sfx.play('freeze');
        render();
      }));
    };
    render();
  }
}
