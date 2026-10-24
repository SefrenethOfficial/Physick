// The Verian Stock Exchange: eight local companies whose prices drift, jump on the news and, now
// and then, on what you get up to (rob a GoMart and GoMart's shares dip; bring in the SWAT and
// Kestrel Arms has a very good day). Trade from the phone's Stocks app; holdings are saved.

const KEY = 'physick.stocks.v1';
const money = (n) => '$' + (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2));

const COMPANIES = [
  { sym: 'VMTR', name: 'Verian Motors', price: 84, vol: 0.012 },
  { sym: 'VNB', name: 'Verian National Bank', price: 142, vol: 0.008 },
  { sym: 'GOMT', name: 'GoMart Stores', price: 38, vol: 0.01 },
  { sym: 'YLC', name: 'Yellowline Cabs', price: 21, vol: 0.016 },
  { sym: 'OCNF', name: 'Oceanic Freight', price: 57, vol: 0.014 },
  { sym: 'VAIR', name: 'Verian Air', price: 66, vol: 0.018 },
  { sym: 'KSTR', name: 'Kestrel Arms', price: 112, vol: 0.015 },
  { sym: 'SMPH', name: 'Saltmarsh Pharma', price: 29, vol: 0.022 },
];

// company news that turns up by itself every few minutes: [symbol, move, headline]
const STORIES = [
  ['OCNF', 0.09, 'Oceanic Freight wins the new container contract at Verian port.'],
  ['OCNF', -0.08, 'A cargo ship stuck at the harbour mouth costs Oceanic Freight a fortune.'],
  ['VAIR', 0.1, 'Verian Air announces new routes from the airport. Shares take off.'],
  ['VAIR', -0.11, 'Verian Air grounds half its fleet for checks. Travellers furious.'],
  ['SMPH', 0.18, 'Saltmarsh Pharma\'s new cold remedy passes its trials.'],
  ['SMPH', -0.16, 'Saltmarsh Pharma recalls a batch of headache pills.'],
  ['VMTR', 0.07, 'The new Vortex X is a hit: Verian Motors can\'t build them fast enough.'],
  ['VMTR', -0.07, 'Verian Motors recalls Meridians over a sticky accelerator.'],
  ['YLC', 0.12, 'Yellowline Cabs gets the airport taxi rank all to itself.'],
  ['YLC', -0.1, 'Yellowline drivers walk out over pay.'],
  ['GOMT', 0.06, 'GoMart reports a record quarter. It\'s the energy drinks.'],
  ['GOMT', -0.06, 'GoMart fined over out-of-date sandwiches.'],
  ['VNB', 0.05, 'Verian National posts healthy profits.'],
  ['KSTR', 0.06, 'Kestrel Arms lands a city police contract.'],
  ['KSTR', -0.07, 'Kestrel Arms faces questions over where its guns end up.'],
];

export class Stocks {
  constructor(game) {
    this.game = game;
    this.list = COMPANIES.map((c) => ({ ...c, open: c.price, hist: [c.price], drift: 0 }));
    this.hold = {}; // sym -> { n, cost } (cost = total paid)
    this.tickT = 0;
    this.storyT = 120 + Math.random() * 120;
    this.sel = null;
    this.load();
    this.lastWanted = 0;
  }

  get(sym) { return this.list.find((c) => c.sym === sym); }
  change(c) { return c.price / c.open - 1; }

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      for (const c of this.list) { const o = s.prices?.[c.sym]; if (o) { c.price = o.price; c.open = o.open; c.hist = o.hist?.slice(-40) || [o.price]; } }
      this.hold = s.hold || {};
    } catch { /* fresh market */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ prices: Object.fromEntries(this.list.map((c) => [c.sym, { price: c.price, open: c.open, hist: c.hist.slice(-40) }])), hold: this.hold })); } catch { /* storage unavailable */ }
  }

  // something happened that moves a share price (and maybe makes the news)
  event(sym, move, headline) {
    const c = this.get(sym);
    if (!c) return;
    c.price = Math.max(1, c.price * (1 + move));
    c.drift += move * 0.15; // the market keeps reacting for a bit
    c.hist.push(c.price);
    if (headline) this.game.news?.add(headline, 'money');
    this.save();
  }

  get worth() { return this.list.reduce((t, c) => t + (this.hold[c.sym]?.n || 0) * c.price, 0); }

  buy(sym, n) {
    const g = this.game, e = g.economy, c = this.get(sym);
    n = Math.min(n, Math.floor((e.money + e.bank) / c.price));
    if (n <= 0) { g.hud.toast('Not enough money', 0xff8a6a); return; }
    const cost = n * c.price, fromCash = Math.min(e.money, cost);
    e.bank -= cost - fromCash;
    e.addMoney(-fromCash);
    const h = (this.hold[sym] ||= { n: 0, cost: 0 });
    h.n += n; h.cost += cost;
    c.price *= 1 + Math.min(0.03, n * c.price / 2e6); // big orders push the price
    g.sfx.play('cash');
    this.save();
  }

  sell(sym, n) {
    const g = this.game, e = g.economy, c = this.get(sym), h = this.hold[sym];
    if (!h?.n) return;
    n = Math.min(n, h.n);
    const avg = h.cost / h.n;
    h.n -= n; h.cost -= avg * n;
    if (!h.n) delete this.hold[sym];
    e.bank += Math.round(n * c.price);
    e.addMoney(0);
    c.price *= 1 - Math.min(0.03, n * c.price / 2e6);
    g.hud.toast(`Sold ${n} ${sym} for ${money(n * c.price)} (into your bank)`, 0x7be08a);
    g.sfx.play('cash');
    this.save();
  }

  update(dt) {
    const g = this.game;
    if (!this.appAdded && g.story?.phone) { g.story.phone.addApp(this.app()); this.appAdded = true; }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 6;
      for (const c of this.list) {
        const pull = (c.open - c.price) / c.open * 0.004; // a gentle pull back towards the day's open
        const r = (Math.random() + Math.random() + Math.random() - 1.5) * c.vol + c.drift + pull;
        c.price = Math.max(1, c.price * (1 + r));
        c.drift *= 0.7;
        c.hist.push(c.price);
        if (c.hist.length > 40) c.hist.shift();
      }
      this.saveT = (this.saveT || 0) + 1;
      if (this.saveT % 5 === 0) this.save();
      if (g.story?.phone?.isOpen && g.story.phone.screen === 'stocks') g.story.phone.render();
    }
    // a new trading day every in-game midnight: today's open is yesterday's close
    const hr = g.daynight?.hour ?? 0;
    if (this.lastHour != null && hr < this.lastHour - 12) for (const c of this.list) c.open = c.price;
    this.lastHour = hr;
    this.storyT -= dt;
    if (this.storyT <= 0) { this.storyT = 150 + Math.random() * 200; const [s, m, h] = STORIES[Math.floor(Math.random() * STORIES.length)]; this.event(s, m * (0.7 + Math.random() * 0.6), h); }
    // the cops gearing up is good news for somebody
    const w = g.police?.wanted || 0;
    if (w >= 6 && this.lastWanted < 6) this.event('KSTR', 0.04);
    if (w >= 10 && this.lastWanted < 10) this.event('KSTR', 0.06, 'Kestrel Arms shares jump as SWAT teams hit the streets of Verian.');
    this.lastWanted = w;
    if (g.health?.dead && !this.wasDead) this.event('SMPH', 0.01);
    this.wasDead = !!g.health?.dead;
  }

  // ---------------------------------------------------------------- the phone app
  spark(c, w = 120, h = 30) {
    const pts = c.hist.slice(-30), lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const d = pts.map((p, i) => `${((i / Math.max(1, pts.length - 1)) * w).toFixed(1)},${(h - ((p - lo) / span) * (h - 4) - 2).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${this.change(c) >= 0 ? '#7be08a' : '#ff6a5a'}" stroke-width="1.6" points="${d}"/></svg>`;
  }

  app() {
    return {
      id: 'stocks', icon: '📈', name: 'Stocks',
      render: (head) => {
        const e = this.game.economy;
        const pct = (x) => `<span class="${x >= 0 ? 'up' : 'down'}">${x >= 0 ? '▲' : '▼'}${Math.abs(x * 100).toFixed(1)}%</span>`;
        if (this.sel) {
          const c = this.get(this.sel), h = this.hold[c.sym];
          const pl = h ? h.n * c.price - h.cost : 0;
          return head(c.sym) + `<div class="ph-stock"><b>${c.name}</b><div class="ph-price">${money(c.price)} ${pct(this.change(c))}</div>${this.spark(c, 220, 60)}
            <small>${h ? `You own ${h.n} · worth ${money(h.n * c.price)} · ${pl >= 0 ? 'up' : 'down'} ${money(Math.abs(pl))}` : 'You don\'t own any.'}</small>
            <small>Buying uses cash, then your bank. Sales go into your bank.</small>
            <div class="ph-btnrow">${[1, 10, 100].map((n) => `<button data-a="app-act" data-app="stocks" data-cmd="buy" data-sym="${c.sym}" data-n="${n}" ${e.money + e.bank >= c.price * n ? '' : 'disabled'}>Buy ${n}</button>`).join('')}</div>
            <div class="ph-btnrow">${[1, 10].map((n) => `<button data-a="app-act" data-app="stocks" data-cmd="sell" data-sym="${c.sym}" data-n="${n}" ${h?.n >= n ? '' : 'disabled'}>Sell ${n}</button>`).join('')}<button data-a="app-act" data-app="stocks" data-cmd="sell" data-sym="${c.sym}" data-n="1e9" ${h?.n ? '' : 'disabled'}>Sell all</button></div>
            <button class="ph-back" data-a="app-act" data-app="stocks" data-cmd="back">All stocks</button></div>`;
        }
        return head('Stocks') + `<div class="ph-sub">Portfolio <b>${money(this.worth)}</b></div><div class="ph-list">` + this.list.map((c) => `<div class="ph-item ph-tick" data-a="app-act" data-app="stocks" data-cmd="pick" data-sym="${c.sym}">
          <div><b>${c.sym}</b><small>${c.name}${this.hold[c.sym] ? ` · own ${this.hold[c.sym].n}` : ''}</small></div>${this.spark(c, 56, 22)}<div class="ph-px">${money(c.price)}<br>${pct(this.change(c))}</div></div>`).join('') + '</div>';
      },
      act: (cmd, d) => {
        if (cmd === 'pick') this.sel = d.sym;
        if (cmd === 'back') this.sel = null;
        if (cmd === 'buy') this.buy(d.sym, +d.n);
        if (cmd === 'sell') this.sell(d.sym, +d.n);
      },
    };
  }
}
