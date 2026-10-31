import { ITEM_BY_ID } from './items.js';

// The things you can do at home once a place is yours: a wall safe for cash (out of reach of
// hospital bills and muggers), a weapon locker that keeps your guns and ammo between jobs, the
// TV (news, the markets, the weather) and, in the bigger places, a pool table.
// The safe and the locker are shared between all your homes, like a storage unit with many doors.

const KEY = 'physick.homelife.v1';
const money = (n) => '$' + Math.round(n).toLocaleString();
const AMMO_NAMES = { pistolAmmo: 'Pistol rounds', smgAmmo: 'SMG rounds', shells: 'Shotgun shells' };

export class HomeLife {
  constructor(game) {
    this.game = game;
    this.safe = 0;
    this.locker = []; // item ids
    this.lockerAmmo = { pistolAmmo: 0, smgAmmo: 0, shells: 0 };
    this.poolWins = 0;
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) { this.safe = s.safe || 0; this.locker = (s.locker || []).filter((id) => ITEM_BY_ID[id]); Object.assign(this.lockerAmmo, s.lockerAmmo || {}); this.poolWins = s.poolWins || 0; }
    } catch { /* fresh */ }
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify({ safe: this.safe, locker: this.locker, lockerAmmo: this.lockerAmmo, poolWins: this.poolWins })); } catch { /* storage unavailable */ } }

  // E prompts inside a home you own
  action(h, pos) {
    const ex = h.inner.extras || {};
    const near = (p, r) => p && Math.hypot(pos.x - p.x, pos.z - p.z) < r && Math.abs(pos.y - 1 - p.y) < 1.6;
    if (near(ex.safe, 1.3)) return { label: `Open the safe (${money(this.safe)} inside)`, run: () => this.openSafe() };
    if (near(ex.locker, 1.4)) return { label: 'Weapon locker', run: () => this.openLocker() };
    if (near(ex.pool, 1.7)) return { label: 'Play pool', run: () => this.openPool() };
    if (near(ex.tv, 1.6)) return { label: 'Watch TV', run: () => this.openTV() };
    return null;
  }

  // ---------------------------------------------------------------- the safe
  openSafe() {
    const g = this.game, e = g.economy;
    const render = () => {
      const btn = (a, n, label, ok) => `<button data-a="${a}" data-n="${n}" ${ok ? '' : 'disabled'}>${label}</button>`;
      e.open('Wall safe', e.header() + `<p class="lede">The safe holds <b>${money(this.safe)}</b>. Cash in here can't be lost to hospital bills, cops or muggers, and you can reach it from any of your homes.</p>
        <div class="erow"><div><b>Put cash in</b><small>From your pocket</small></div><div class="btns">${[100, 1000, 10000].map((n) => btn('in', n, money(n), e.money >= n)).join('')}${btn('in', 'all', 'All', e.money > 0)}</div></div>
        <div class="erow"><div><b>Take cash out</b><small>Into your pocket</small></div><div class="btns">${[100, 1000, 10000].map((n) => btn('out', n, money(n), this.safe >= n)).join('')}${btn('out', 'all', 'All', this.safe > 0)}</div></div>`,
      (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b || b.disabled) return;
        if (b.dataset.a === 'in') { const n = b.dataset.n === 'all' ? e.money : Math.min(+b.dataset.n, e.money); this.safe += n; e.addMoney(-n); }
        if (b.dataset.a === 'out') { const n = b.dataset.n === 'all' ? this.safe : Math.min(+b.dataset.n, this.safe); this.safe -= n; e.addMoney(n); }
        g.sfx.play('cash');
        this.save();
        render();
      }));
    };
    render();
  }

  // ---------------------------------------------------------------- the weapon locker
  openLocker() {
    const g = this.game, e = g.economy;
    const isWeapon = (d) => d && (d.gun || d.grenade || d.melee || d.use === 'armor');
    const render = () => {
      const held = g.held && isWeapon(g.held) ? g.held : null;
      const bagged = e.bag.map((id, i) => ({ d: ITEM_BY_ID[id], i })).filter((x) => isWeapon(x.d));
      const onBar = e.hotbar.map((id, k) => ({ d: id && ITEM_BY_ID[id], k })).filter((x) => isWeapon(x.d) && !(x.k === e.sel && held));
      const counts = {};
      for (const id of this.locker) counts[id] = (counts[id] || 0) + 1;
      const inside = Object.entries(counts).map(([id, n]) => `<div class="erow"><div><b>${ITEM_BY_ID[id].name}</b><small>${n} in the locker</small></div><div class="btns"><button data-a="take" data-id="${id}">Take one</button></div></div>`).join('')
        || '<p class="empty">The locker is empty.</p>';
      const put = (held ? `<div class="erow hl"><div><b>${held.name}</b><small>in your hand</small></div><div class="btns"><button data-a="putHeld">Put away</button></div></div>` : '')
        + onBar.map(({ d, k }) => `<div class="erow"><div><b>${d.name}</b><small>hotbar slot ${k + 1}</small></div><div class="btns"><button data-a="putHot" data-i="${k}">Put away</button></div></div>`).join('')
        + bagged.map(({ d, i }) => `<div class="erow"><div><b>${d.name}</b><small>in your bag</small></div><div class="btns"><button data-a="putBag" data-i="${i}">Put away</button></div></div>`).join('');
      const ammo = Object.keys(AMMO_NAMES).map((k) => `<div class="erow"><div><b>${AMMO_NAMES[k]}</b><small>On you: ${e.ammo[k] || 0} · in the locker: ${this.lockerAmmo[k] || 0}</small></div>
        <div class="btns"><button data-a="ammoIn" data-k="${k}" ${e.ammo[k] ? '' : 'disabled'}>Store</button><button data-a="ammoOut" data-k="${k}" ${this.lockerAmmo[k] ? '' : 'disabled'}>Take</button></div></div>`).join('');
      e.open('Weapon locker', e.header() + '<p class="lede">Guns, grenades, armour and ammo kept here stay safe between jobs, in every home you own.</p>'
        + '<h3 class="kih">In the locker</h3>' + inside + (put ? '<h3 class="kih">Put away</h3>' + put : '') + '<h3 class="kih">Ammo</h3>' + ammo
        + `<div class="btns" style="margin-top:10px"><button class="big" data-a="gearUp" ${this.locker.length || Object.values(this.lockerAmmo).some(Boolean) ? '' : 'disabled'}>Gear up: take everything</button></div>`,
      (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b || b.disabled) return;
        const a = b.dataset.a;
        if (a === 'take') { const i = this.locker.indexOf(b.dataset.id); if (i >= 0) { this.locker.splice(i, 1); g.giveItem(ITEM_BY_ID[b.dataset.id]); } }
        if (a === 'putHeld' && g.held) { this.locker.push(g.held.id); g.clearHand(); }
        if (a === 'putBag') { const d = e.takeOut(+b.dataset.i); if (d) this.locker.push(d.id); }
        if (a === 'putHot') { const k = +b.dataset.i, id = e.hotbar[k]; if (id) { this.locker.push(id); e.hotbar[k] = null; e.save(); g.inv.syncHand(); g.inv.refresh(true); } }
        if (a === 'ammoIn') { const k = b.dataset.k; this.lockerAmmo[k] = (this.lockerAmmo[k] || 0) + (e.ammo[k] || 0); e.ammo[k] = 0; e.save(); g.refreshHolding?.(); }
        if (a === 'ammoOut') { const k = b.dataset.k; e.addAmmo(k, this.lockerAmmo[k] || 0); this.lockerAmmo[k] = 0; }
        if (a === 'gearUp') {
          for (const k of Object.keys(this.lockerAmmo)) { if (this.lockerAmmo[k]) e.addAmmo(k, this.lockerAmmo[k]); this.lockerAmmo[k] = 0; }
          const left = [];
          for (const id of this.locker) { const d = ITEM_BY_ID[id], k = e.hotbar.findIndex((x) => !x); if (!g.held && !e.hotbar[e.sel]) g.holdItem(d); else if (k >= 0) e.hotbar[k] = id; else if (!e.stash(d, true)) left.push(id); }
          e.save(); g.inv.refresh(true);
          this.locker = left;
          if (left.length) g.hud.toast('Your bag is full: the rest stays in the locker', 0xffd166);
        }
        g.sfx.play('select');
        this.save();
        render();
      }));
    };
    render();
  }

  // ---------------------------------------------------------------- the TV
  openTV(channel = 'news') {
    const g = this.game, e = g.economy;
    const tabs = [['news', 'VNN News'], ['markets', 'Markets'], ['weather', 'Weather']];
    const render = () => {
      let body = '';
      if (channel === 'news') {
        const items = (g.news?.items || []).slice(0, 12);
        body = '<div class="tv-screen"><div class="tv-bug">VNN · LIVE</div>' + (items.length
          ? items.map((it, i) => `<div class="tv-item ${i === 0 ? 'top' : ''}"><small>${it.hour || ''} · ${(it.kind || 'news').toUpperCase()}</small>${it.text}</div>`).join('')
          : '<div class="tv-item top">A quiet day in Verian. Stay tuned.</div>') + '</div>';
      } else if (channel === 'markets') {
        const st = g.stocks;
        body = '<div class="tv-screen"><div class="tv-bug">VNN BUSINESS</div>' + (st ? st.list.map((c) => {
          const ch = st.change(c);
          return `<div class="tv-row"><b>${c.sym}</b><span>${c.name}</span><span>${money(c.price)}</span><span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch * 100).toFixed(1)}%</span></div>`;
        }).join('') : '') + '<small class="tv-foot">Trade on your phone: the Stocks app.</small></div>';
      } else {
        const dn = g.daynight;
        body = `<div class="tv-screen"><div class="tv-bug">VNN WEATHER</div><div class="tv-item top">It's ${dn?.timeText || ''} in Verian. ${dn?.kind === 'rain' ? 'Rain is falling across the islands: watch those wet roads.' : dn?.kind === 'fog' ? 'Thick fog is rolling in off the sea.' : dn?.kind === 'cloudy' ? 'Grey skies over the city, staying dry for now.' : 'Clear skies over the islands.'}</div></div>`;
      }
      e.open('Television', tabs.map(([id, name]) => `<button class="tv-tab ${id === channel ? 'on' : ''}" data-ch="${id}">${name}</button>`).join('') + body,
        (el) => el.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-ch]'); if (!b) return; channel = b.dataset.ch; g.sfx.play('select'); render(); }));
    };
    render();
  }

  // ---------------------------------------------------------------- pool
  openPool() {
    const g = this.game, e = g.economy;
    e.open('Pool table', e.header() + `<p class="lede">Eight-ball against Tony from next door. Pot your group (spots or stripes), then the black. Pot the black early and you lose.</p>
      <p><small>Aim with the mouse, hold the button to build power, let go to shoot. Wins so far: ${this.poolWins}.</small></p>
      <div class="btns">${[0, 100, 500, 2000].map((n) => `<button data-bet="${n}" ${e.money >= n ? '' : 'disabled'}>${n ? 'Bet ' + money(n) : 'Just for fun'}</button>`).join('')}</div>`,
    (el) => el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-bet]');
      if (!b || b.disabled) return;
      e.panel.classList.add('hidden'); // (not close(): that grabs the mouse back for the game)
      new PoolGame(g, +b.dataset.bet, (won) => {
        if (won) this.poolWins++;
        this.save();
      });
    }));
  }
}

// ---------------------------------------------------------------- the pool minigame (a top-down table)
const TW = 760, TH = 380, R = 10, PAD = 34;

class PoolGame {
  constructor(game, bet, done) {
    this.game = game;
    game.poolGame = this;
    this.bet = bet;
    this.done = done;
    const el = (this.el = document.createElement('div'));
    el.id = 'pool';
    el.innerHTML = `<div class="pool-box"><div class="pool-top"><b>8-BALL</b><span class="pool-msg"></span><button class="pool-x">Quit</button></div>
      <canvas width="${TW + PAD * 2}" height="${TH + PAD * 2}"></canvas><div class="pool-info"></div></div>`;
    document.body.appendChild(el);
    this.cv = el.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    this.msgEl = el.querySelector('.pool-msg');
    this.infoEl = el.querySelector('.pool-info');
    game.panelOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    el.querySelector('.pool-x').addEventListener('click', () => this.quit());
    this.mouse = { x: 0, y: 0 };
    this.cv.addEventListener('mousemove', (ev) => { const r = this.cv.getBoundingClientRect(); this.mouse.x = ((ev.clientX - r.left) / r.width) * this.cv.width - PAD; this.mouse.y = ((ev.clientY - r.top) / r.height) * this.cv.height - PAD; });
    this.cv.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (this.turn === 'you' && this.still() && !this.over) { this.charging = true; this.power = 0; this.pdir = 1; } });
    addEventListener('mouseup', (this.onUp = () => { if (this.charging) { this.charging = false; this.shoot(this.aimAngle(), this.power); } }));
    document.addEventListener('pointerlockchange', (this.onLock = () => { if (document.pointerLockElement) document.exitPointerLock(); }));
    addEventListener('keydown', (this.onKey = (ev) => { ev.stopImmediatePropagation(); if (ev.code === 'Escape') this.quit(); }), true);
    this.pockets = [[0, 0, 20], [TW / 2, -7, 17], [TW, 0, 20], [0, TH, 20], [TW / 2, TH + 7, 17], [TW, TH, 20]].map(([x, y, r]) => ({ x, y, r }));
    this.rack();
    this.turn = Math.random() < 0.5 ? 'you' : 'cpu';
    this.groups = { you: null, cpu: null }; // 'solid' | 'stripe'
    this.say(this.turn === 'you' ? 'You break.' : 'Tony breaks.');
    this.last = performance.now();
    this.cpuT = 1.2;
    this.loop = () => { if (!this.el) return; const now = performance.now(); this.step(Math.min(0.1, (now - this.last) / 1000)); this.last = now; this.draw(); requestAnimationFrame(this.loop); };
    requestAnimationFrame(this.loop);
  }

  rack() {
    this.balls = [{ n: 0, x: TW * 0.25, y: TH / 2, vx: 0, vy: 0, in: false }];
    const order = [1, 9, 2, 10, 8, 3, 11, 7, 14, 4, 5, 13, 15, 6, 12];
    let k = 0;
    for (let row = 0; row < 5; row++) for (let j = 0; j <= row; j++) {
      this.balls.push({ n: order[k++], x: TW * 0.7 + row * R * 1.76, y: TH / 2 + (j - row / 2) * (R * 2.04), vx: 0, vy: 0, in: false });
    }
  }

  get cue() { return this.balls[0]; }
  kind(n) { return n === 0 ? 'cue' : n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe'; }
  still() { return this.balls.every((b) => b.in || Math.hypot(b.vx, b.vy) < 0.5); }
  say(t) { this.msgEl.textContent = t; }
  left(who) { const gr = this.groups[who]; return this.balls.filter((b) => !b.in && (gr ? this.kind(b.n) === gr : b.n !== 0 && b.n !== 8)).length; }

  aimAngle() { return Math.atan2(this.mouse.y - this.cue.y, this.mouse.x - this.cue.x); }

  shoot(a, p) {
    const sp = 180 + p * 1250;
    this.cue.vx = Math.cos(a) * sp; this.cue.vy = Math.sin(a) * sp;
    this.moving = true;
    this.potted = [];
    this.firstHit = null;
    this.game.sfx.play('thud');
  }

  step(dt) {
    if (this.charging) { this.power += this.pdir * dt * 0.9; if (this.power > 1) { this.power = 1; this.pdir = -1; } if (this.power < 0) { this.power = 0; this.pdir = 1; } }
    const vmax = Math.max(...this.balls.map((b) => (b.in ? 0 : Math.hypot(b.vx, b.vy))));
    const N = Math.min(120, Math.max(4, Math.ceil((vmax * dt) / 3))), h = dt / N; // (small steps: no tunnelling through balls)
    for (let s = 0; s < N; s++) {
      for (const b of this.balls) {
        if (b.in) continue;
        b.x += b.vx * h; b.y += b.vy * h;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0) { const k = Math.max(0, sp - 200 * h) / sp; b.vx *= k * (1 - 0.45 * h); b.vy *= k * (1 - 0.45 * h); }
        let mouth = false;
        for (const p of this.pockets) {
          const d = Math.hypot(b.x - p.x, b.y - p.y);
          if (d < p.r) { b.in = true; b.vx = b.vy = 0; this.potted?.push(b.n); this.game.sfx.play('select'); break; }
          if (d < p.r + 7) mouth = true;
        }
        if (b.in || mouth) continue; // (no cushion across a pocket's mouth)
        if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) * 0.8; } if (b.x > TW - R) { b.x = TW - R; b.vx = -Math.abs(b.vx) * 0.8; }
        if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) * 0.8; } if (b.y > TH - R) { b.y = TH - R; b.vy = -Math.abs(b.vy) * 0.8; }
      }
      for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], b = this.balls[j];
        if (a.in || b.in) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= 2 * R || d === 0) continue;
        const nx = dx / d, ny = dy / d, ov = 2 * R - d;
        a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        const imp = rel * 0.97;
        a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
        if (i === 0 && this.firstHit == null) this.firstHit = b.n;
      }
    }
    if (this.moving && this.still()) { for (const b of this.balls) { b.vx = b.vy = 0; } this.moving = false; this.endShot(); }
    if (!this.moving && !this.over && this.turn === 'cpu' && this.still()) { this.cpuT -= dt; if (this.cpuT <= 0) this.cpuShot(); }
  }

  endShot() {
    const who = this.turn, other = who === 'you' ? 'cpu' : 'you', pot = this.potted || [];
    const scratch = pot.includes(0);
    const name = (w) => (w === 'you' ? 'You' : 'Tony');
    if (pot.includes(8)) {
      const clear = this.groups[who] && this.left(who) === 0;
      this.finish(clear && !scratch ? who : other, clear && !scratch ? `${name(who)} sank the black!` : `${name(who)} potted the black too early!`);
      return;
    }
    if (!this.groups[who]) {
      const first = pot.find((n) => n !== 0);
      if (first != null && !scratch) { this.groups[who] = this.kind(first); this.groups[other] = this.groups[who] === 'solid' ? 'stripe' : 'solid'; }
    }
    const mine = pot.filter((n) => this.groups[who] && this.kind(n) === this.groups[who]);
    if (scratch) {
      const c = this.cue; c.in = false; c.x = TW * 0.25; c.y = TH / 2; c.vx = c.vy = 0;
      while (this.balls.some((b) => b !== c && !b.in && Math.hypot(b.x - c.x, b.y - c.y) < 2 * R + 1)) c.y += 2 * R;
      this.turn = other; this.say(`Scratch! ${name(other)} to shoot.`);
    } else if (mine.length) {
      this.say(`${name(who)} potted ${mine.length > 1 ? mine.length + ' balls' : 'one'}: shoot again.`);
    } else {
      this.turn = other; this.say(`${name(other)} to shoot.`);
    }
    this.cpuT = 1.1 + Math.random() * 0.8;
  }

  // Tony looks at every ball he can play and every pocket, and takes the easiest shot.
  cpuShot() {
    const c = this.cue, gr = this.groups.cpu;
    let targets = this.balls.filter((b) => !b.in && b.n !== 0 && (gr ? this.kind(b.n) === gr : b.n !== 8));
    if (!targets.length) targets = this.balls.filter((b) => b.n === 8 && !b.in);
    const clear = (x0, y0, x1, y1, skip) => this.balls.every((b) => {
      if (b.in || skip.includes(b)) return true;
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((b.x - x0) * dx + (b.y - y0) * dy) / L2));
      return Math.hypot(x0 + dx * t - b.x, y0 + dy * t - b.y) > 2 * R;
    });
    let best = null;
    for (const t of targets) for (const p of this.pockets) {
      const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy);
      const gx = t.x - (dx / d) * 2 * R, gy = t.y - (dy / d) * 2 * R;
      const ax = gx - c.x, ay = gy - c.y, ad = Math.hypot(ax, ay);
      const cut = (ax * dx + ay * dy) / (ad * d);
      if (cut < 0.25) continue;
      if (!clear(c.x, c.y, gx, gy, [c, t]) || !clear(t.x, t.y, p.x, p.y, [c, t])) continue;
      const score = cut * cut / (1 + (ad + d) / 400);
      if (!best || score > best.score) best = { score, a: Math.atan2(ay, ax), dist: ad + d };
    }
    let a, p;
    if (best) { a = best.a + (Math.random() - 0.5) * 0.045; p = Math.min(1, 0.18 + best.dist / 900 + Math.random() * 0.1); }
    else { const t = targets.sort((u, v) => Math.hypot(u.x - c.x, u.y - c.y) - Math.hypot(v.x - c.x, v.y - c.y))[0]; a = Math.atan2(t.y - c.y, t.x - c.x) + (Math.random() - 0.5) * 0.2; p = 0.45 + Math.random() * 0.3; }
    this.shoot(a, p);
  }

  finish(winner, why) {
    this.over = true;
    const g = this.game, won = winner === 'you';
    this.say(`${why} ${won ? 'You win' : 'Tony wins'}${this.bet ? (won ? `: +$${this.bet}` : `: -$${this.bet}`) : ''}.`);
    if (this.bet) g.economy.addMoney(won ? this.bet : -this.bet, won ? 'pool winnings' : 'lost at pool');
    g.sfx.play(won ? 'cash' : 'thud');
    this.done?.(won);
    this.infoEl.innerHTML = '<button class="pool-again">Rack \'em up again</button>';
    this.infoEl.querySelector('.pool-again').addEventListener('click', () => { this.close(); g.homelife.openPool(); });
  }

  quit() {
    if (!this.over && this.bet && this.moved) this.game.economy.addMoney(-this.bet, 'forfeited the pool game');
    this.close();
  }

  close() {
    removeEventListener('mouseup', this.onUp);
    removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('pointerlockchange', this.onLock);
    this.el.remove();
    this.el = null;
    this.game.poolGame = null;
    if (!this.game.economy.isOpen) { this.game.panelOpen = false; this.game.lock(); }
  }

  draw() {
    const c = this.ctx, W = this.cv.width, H = this.cv.height;
    c.fillStyle = '#4a2a18'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#5a341e'; c.fillRect(6, 6, W - 12, H - 12);
    c.save(); c.translate(PAD, PAD);
    c.fillStyle = '#1f6a3a'; c.fillRect(0, 0, TW, TH);
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(TW * 0.25, 0, 1, TH);
    for (const p of this.pockets) { c.fillStyle = '#0c0c0c'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); }
    const COL = ['#f4f1ea', '#f2d23a', '#2f5fd8', '#c0442c', '#6a2a8a', '#e07a20', '#2a8a4a', '#8a2a2a', '#111'];
    if (!this.over && this.turn === 'you' && this.still() && !this.moving) {
      const a = this.aimAngle(), cb = this.cue;
      c.strokeStyle = 'rgba(255,255,255,.45)'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(cb.x, cb.y);
      // where it hits first
      let tHit = 900;
      for (const b of this.balls) {
        if (b.in || b === cb) continue;
        const dx = b.x - cb.x, dy = b.y - cb.y, proj = dx * Math.cos(a) + dy * Math.sin(a);
        if (proj <= 0) continue;
        const perp2 = dx * dx + dy * dy - proj * proj, rr = 4 * R * R;
        if (perp2 < rr) tHit = Math.min(tHit, proj - Math.sqrt(rr - perp2));
      }
      c.lineTo(cb.x + Math.cos(a) * tHit, cb.y + Math.sin(a) * tHit); c.stroke(); c.setLineDash([]);
      if (tHit < 900) { c.strokeStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(cb.x + Math.cos(a) * tHit, cb.y + Math.sin(a) * tHit, R, 0, 7); c.stroke(); }
      // the cue
      const back = 14 + (this.charging ? this.power * 60 : 0);
      c.strokeStyle = '#d8b070'; c.lineWidth = 5; c.beginPath(); c.moveTo(cb.x - Math.cos(a) * back, cb.y - Math.sin(a) * back); c.lineTo(cb.x - Math.cos(a) * (back + 240), cb.y - Math.sin(a) * (back + 240)); c.stroke(); c.lineWidth = 1;
    }
    for (const b of this.balls) {
      if (b.in) continue;
      const col = COL[b.n > 8 ? b.n - 8 : b.n];
      c.fillStyle = b.n > 8 ? '#f4f1ea' : col; c.beginPath(); c.arc(b.x, b.y, R, 0, 7); c.fill();
      if (b.n > 8) { c.save(); c.beginPath(); c.arc(b.x, b.y, R, 0, 7); c.clip(); c.fillStyle = col; c.fillRect(b.x - R, b.y - R * 0.5, 2 * R, R); c.restore(); }
      if (b.n) { c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x, b.y, 4.2, 0, 7); c.fill(); c.fillStyle = '#111'; c.font = 'bold 6px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.n, b.x, b.y + 0.5); }
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(b.x - 3, b.y - 3, 2.5, 0, 7); c.fill();
    }
    c.restore();
    if (this.charging) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(W / 2 - 100, H - 22, 200, 12); c.fillStyle = '#ffd166'; c.fillRect(W / 2 - 100, H - 22, 200 * this.power, 12); }
    if (!this.over) {
      const gs = (w) => (this.groups[w] ? (this.groups[w] === 'solid' ? 'spots' : 'stripes') + ` (${this.left(w)} left)` : 'open table');
      const txt = `You: ${gs('you')} · Tony: ${gs('cpu')}${this.bet ? ` · Bet $${this.bet}` : ''} · ${this.turn === 'you' ? 'Your shot' : 'Tony\'s shot'}`;
      if (txt !== this.lastInfo) { this.infoEl.textContent = txt; this.lastInfo = txt; }
      if (this.moving) this.moved = true;
    }
  }
}
