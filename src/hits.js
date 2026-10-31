import * as THREE from 'three';

// Contracts from the bounty hunter at the curved desk in the volcano base. He never says who's paying.
// Some are grudges: people who wronged somebody (a loan shark, a landlord, a business partner who
// cooked the books). Some are names everyone in Verian City knows. The harder the job (more
// bodyguards, better armed, tougher targets, security that calls the police the moment it starts),
// the more it pays; the hard ones only come up once you've proved yourself on the easy ones.
//
// Find the target (marked ☠ on the map), kill them (or knock them out and finish them, or drop them
// down the volcano's disposal chute: he likes that), and the money's wired to your bank. Let them
// get away, die yourself, or take too long, and it's off.

const KEY = 'physick.hits.v1';
const FIRST = ['Victor', 'Dale', 'Marta', 'Lionel', 'Rosalind', 'Carl', 'Petra', 'Hector', 'Wanda', 'Felix', 'Imogen', 'Gus', 'Nadia', 'Ronan', 'Delphine', 'Otis', 'Bea', 'Silas', 'Tamsin', 'Ike'];
const LAST = ['Crane', 'Moretti', 'Pike', 'Halloran', 'Voss', 'Delacroix', 'Mulvey', 'Szabo', 'Quill', 'Fairweather', 'Okafor', 'Brandt', 'Lusk', 'Ferreira', 'Kettle', 'Sorrell', 'Dunmore', 'Abbate', 'Royce', 'Marsh'];
const CLIENTS = ['A widow in Saltmarsh', 'A dock worker with a long memory', 'A man who won\'t give his name', 'A woman in a very good coat', 'Somebody in the Hollows', 'An old friend of yours (he says)', 'A restaurant owner', 'A retired cop', 'A client who paid in cash, in advance', 'Someone who used to work for them'];
const WRONGED = [
  { who: 'a loan shark', why: 'forty percent a week, and broken fingers when it\'s late', d: [1, 3] },
  { who: 'a landlord', why: 'put a family on the street in January and kept the deposit', d: [1, 2] },
  { who: 'a business partner', why: 'cooked the books and walked off with the lot', d: [1, 3] },
  { who: 'a used car dealer', why: 'sold the client a car with no brakes. It went off the Saltmarsh Gate Bridge', d: [1, 2] },
  { who: 'a debt collector', why: 'collects the debts other people owe, from their kids', d: [2, 3] },
  { who: 'a private investigator', why: 'sold the client\'s secrets to both sides', d: [2, 3] },
  { who: 'a nightclub owner', why: 'something happened in the back room. The client won\'t say what', d: [2, 4] },
  { who: 'a bookie', why: 'fixed the fight the client bet the house on', d: [1, 3] },
  { who: 'a fence', why: 'took the client\'s jewellery and gave him a quarter of what it was worth', d: [1, 2] },
  { who: 'an ex-Ashen Hand bagman', why: 'knows where the money went. Somebody would rather he didn\'t', d: [3, 4] },
  { who: 'a bent harbourmaster', why: 'looked the other way for the wrong people, and then the right ones too', d: [2, 4] },
  { who: 'a smuggler', why: 'left the client\'s brother to take the fall', d: [3, 5] },
];
const FAMOUS = [
  { name: 'Dario Venn', who: 'the TV chef off Channel 6\'s "Verian Kitchen"', why: 'his last review closed somebody\'s restaurant, and he did it on purpose', d: [2, 4], look: { shirt: 0xf2f2ee, pants: 0x2a2c30, hat: 'dixie', hatColor: 0xffffff } },
  { name: 'Rex Halloway', who: 'the Verian Vipers\' star striker', why: 'took money to throw the cup final. The people who paid him lost more', d: [3, 4], look: { shirt: 0x1a7a3a, pants: 0x111111 } },
  { name: 'DJ Nova', who: 'the biggest act in Verian City', why: 'stole the client\'s song and made a million off it', d: [3, 5], look: { shirt: 0xc23b8a, pants: 0x1a1a1a, hat: 'beanie', hatColor: 0x2a2a2a } },
  { name: 'Gideon Pratt', who: 'the property developer behind half of downtown', why: 'his towers went up where a whole street used to be', d: [4, 5], look: { shirt: 0x1f2a3a, pants: 0x1f2a3a, hat: 'fedora', hatColor: 0x1a1a1a } },
  { name: 'Benny Sloane', who: 'the talk radio host on 98.4 the Mouth', why: 'said a name on air he shouldn\'t have', d: [2, 3], look: { shirt: 0x8a5a2a, pants: 0x2a2620 } },
  { name: 'Vivian Ash', who: 'Channel 6\'s news anchor', why: 'is about to read out a story on air that somebody needs to stay buried', d: [3, 4], look: { shirt: 0x8a1a2a, pants: 0x1a1a1a } },
  { name: 'Lars Ekman', who: 'the chief executive of Verian National Bank', why: 'foreclosed on half of Saltmarsh to pay for his yacht', d: [4, 5], look: { shirt: 0x2a2c30, pants: 0x2a2c30, hat: 'tophat', hatColor: 0x111111 } },
  { name: 'Mickey Drummond', who: 'the man who owns the MARCOS franchise in Verian', why: 'found out about the MARCOS* in the volcano and he\'s talking to his lawyers', d: [2, 3], look: { shirt: 0xc8102e, pants: 0x1a1a1a } },
  { name: 'Kayla Bright', who: 'the influencer with two million followers', why: 'filmed something in the Hollows she shouldn\'t have, and she\'s posting it tonight', d: [2, 3], look: { shirt: 0xf2c0d8, pants: 0xe8e2d4 } },
  { name: 'Judge Harlan Oakes', who: 'Verian City\'s hanging judge', why: 'sent the client\'s son down for twenty years on evidence everyone knew was planted', d: [4, 5], look: { shirt: 0x111111, pants: 0x111111 } },
  { name: 'Councillor Marla Quint', who: 'the city councillor who runs the planning committee', why: 'sold the Hollows to the highest bidder', d: [3, 5], look: { shirt: 0x2a3a5a, pants: 0x2a3a5a } },
];
// difficulty: bodyguards (their guns), how tough the target is, the pay, and who's around
const TIERS = {
  1: { guards: [], hp: 100, pay: [1200, 1800], label: 'Easy: on their own' },
  2: { guards: ['pistol'], hp: 130, pay: [2600, 3600], label: 'One bodyguard' },
  3: { guards: ['pistol', 'smg', 'rifle'], hp: 170, pay: [5200, 7200], label: 'A security detail' },
  4: { guards: ['rifle', 'smg', 'heavy', 'rifle', 'smg'], hp: 260, pay: [9500, 13500], label: 'Heavy security, and they\'ll call the police', cops: 3 },
  5: { guards: ['rifle', 'heavy', 'smg', 'rifle', 'heavy', 'smg', 'rifle'], hp: 420, pay: [17000, 25000], label: 'A small army, and the police on speed dial', cops: 6 },
};
const WEAPONS = {
  pistol: { rate: [1.0, 0.6], dmg: 5, acc: 1.0 },
  smg: { rate: [0.25, 0.3], dmg: 3, acc: 0.6 },
  rifle: { rate: [0.9, 0.9], dmg: 6, acc: 0.8 },
  heavy: { rate: [1.4, 0.6], dmg: 11, acc: 1.2, shotgun: true },
};
const GUARD_LOOK = { shirt: 0x1a1a1c, pants: 0x1a1a1c, skin: 0x7a4f35, hat: 'cap', hatColor: 0x111111 };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SKINS = [0xd9a47c, 0x7a4f35, 0xf1c9a5, 0xa8724f, 0x5a3a26];

export class Hits {
  constructor(game) {
    this.game = game;
    try { this.save = JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { this.save = {}; }
    this.save.rep ||= 0; this.save.done ||= 0; this.save.earned ||= 0;
    this.offers = [];
    this.active = null;
    this.offersAt = -1e9;
  }

  persist() { try { localStorage.setItem(KEY, JSON.stringify(this.save)); } catch { /* storage unavailable */ } }

  get maxTier() { return Math.min(5, 2 + Math.floor(this.save.rep / 2)); } // (two jobs done for each step up)

  // three contracts on the board: an easy one, a middling one, and the hardest he'll trust you with
  refreshOffers() {
    const m = this.maxTier, tiers = [Math.max(1, m - 2), Math.max(1, m - 1), m];
    const used = new Set();
    this.offers = tiers.map((d, i) => this.makeOffer(d, i === 1 ? 'famous' : i === 2 && Math.random() < 0.5 ? 'famous' : 'wronged', used));
    this.offersAt = this.game.time;
  }

  makeOffer(d, kind, used) {
    let o;
    if (kind === 'famous') {
      const pool = FAMOUS.filter((f) => d >= f.d[0] - 1 && d <= f.d[1] && !used.has(f.name));
      const f = pool.length ? pick(pool) : null;
      if (f) { used.add(f.name); o = { name: f.name, who: f.who, why: f.why, look: f.look, famous: true }; }
    }
    if (!o) {
      const pool = WRONGED.filter((w) => d >= w.d[0] && d <= w.d[1] && !used.has(w.who));
      const w = pick(pool.length ? pool : WRONGED); used.add(w.who);
      o = { name: `${pick(FIRST)} ${pick(LAST)}`, who: w.who, why: w.why, client: pick(CLIENTS) };
    }
    const T = TIERS[d];
    const island = d <= 2 ? pick(['city', 'city', 'town']) : d === 3 ? pick(['city', 'town', 'hood']) : pick(['hood', 'town', 'city']);
    return { ...o, id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, d, island, pay: Math.round((T.pay[0] + Math.random() * (T.pay[1] - T.pay[0])) / 50) * 50, label: T.label };
  }

  // ---------------------------------------------------------------- the desk
  open() {
    const g = this.game, e = g.economy;
    if (!this.offers.length || g.time - this.offersAt > 600) this.refreshOffers();
    const skulls = (d) => '☠'.repeat(d) + '<span style="opacity:.25">' + '☠'.repeat(5 - d) + '</span>';
    const where = (isl) => ({ city: 'Verian City', town: 'Saltmarsh', hood: 'the Hollows' }[isl] || isl);
    const render = () => {
      const lines = this.active ? '"You\'ve got a job. Finish it."'
        : this.save.done === 0 ? '"Sit down. I have work, if you have the stomach for it. Easy ones first: I don\'t know you yet."'
          : this.maxTier >= 5 ? '"There\'s nobody I won\'t send you after now."' : pick(['"Back again."', '"Word gets around. Good work does too."', '"Pick one. Don\'t ask who\'s paying."']);
      let html = e.header() + `<p class="lede">The man behind the desk doesn't look up. You can't see his face under the hat. ${lines}</p>`
        + `<p class="ihint">Contracts done: <b>${this.save.done}</b> · Earned: <b>$${this.save.earned.toLocaleString()}</b> · He'll give you jobs up to ${skulls(this.maxTier)}</p>`;
      if (this.active) {
        const a = this.active;
        html += `<div class="erow hl"><div><b>${a.name}</b> · <span style="color:#ff6a5a">${skulls(a.d)}</span><small>${a.who}. ${a.status || ''}</small></div><div class="btns"><button data-a="cancel">Walk away</button></div></div>`;
      } else {
        html += this.offers.map((o, i) => `<div class="erow"><div><b>${o.name}</b> · <span style="color:#ff6a5a">${skulls(o.d)}</span> · <b style="color:#7be08a">$${o.pay.toLocaleString()}</b>
          <small>${o.famous ? `Everyone knows them: ${o.who}. Someone wants them gone: ${o.why}.` : `${o.client} wants ${o.who} gone: ${o.why}.`}<br>${o.label}. Somewhere in ${where(o.island)}.</small></div>
          <div class="btns"><button data-a="take" data-i="${i}">Take it</button></div></div>`).join('');
      }
      e.open('Contracts', html, (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]'); if (!b) return;
        if (b.dataset.a === 'take') { this.start(this.offers[+b.dataset.i]); e.close(); }
        if (b.dataset.a === 'cancel') { this.fail('You walked away from it. He won\'t forget.', true); render(); }
      }));
    };
    render();
  }

  // ---------------------------------------------------------------- a job
  start(o) {
    const g = this.game, C = g.citizens, T = TIERS[o.d];
    const pp = g.shorePlayer.body.translation();
    let at = null;
    for (let k = 0; k < 30 && !at; k++) { const p = C.randomPointOn(o.island, null, 0, 160); if (p && Math.hypot(p.x - pp.x, p.z - pp.z) > 160) at = p; }
    if (!at) { g.hud.toast('He frowns at a map. "Not today. Come back later."', 0xffd166); return; }
    const look = o.look ? { skin: pick(SKINS), ...o.look } : { shirt: pick([0x5a3a2a, 0x2a3a5a, 0x3a3a3a, 0x6a6a5a, 0x7a2a2a]), pants: pick([0x2a2c30, 0x3a3428, 0x1f2a3a]), skin: pick(SKINS), hat: pick([undefined, 'cap', 'fedora', 'beanie']), hatColor: 0x2a2a2a };
    const t = C.spawnCitizen(o.island, 'civ', at.clone().setY(at.y + 0.95), { look });
    if (!t) { g.hud.toast('"Not today."', 0xffd166); return; }
    Object.assign(t, { hitId: o.id, hp: T.hp, cash: 200 + o.d * 150, items: o.famous ? ['watch', 'phone'] : ['wallet', 'phone'] });
    const a = { ...o, target: t, anchor: new THREE.Vector3(at.x, at.y, at.z), guards: [], t: 0, alerted: false, startHp: T.hp, sharp: 0.8 + o.d * 0.1 };
    T.guards.forEach((kind, i) => {
      const ang = (i / Math.max(1, T.guards.length)) * Math.PI * 2, gp = C.randomPointOn(o.island, new THREE.Vector3(at.x + Math.cos(ang) * 3, 0, at.z + Math.sin(ang) * 3), 3) || at;
      const n = C.spawnCitizen(o.island, 'goon', gp.clone().setY(gp.y + 0.95), { look: { ...GUARD_LOOK, skin: pick(SKINS), hat: kind === 'heavy' ? 'cranial' : i % 2 ? 'cap' : undefined } });
      if (!n) return;
      Object.assign(n, { kind, weapon: WEAPONS[kind], hp: kind === 'heavy' ? 240 : 110, guard: true, mission: a, cash: 40 + Math.floor(Math.random() * 80), items: Math.random() < 0.3 ? [kind === 'pistol' ? 'pistol' : 'smg'] : [], heading: ang });
      if (kind === 'heavy') n.fig.root.scale.setScalar(1.15);
      a.guards.push(n);
    });
    a.goons = a.guards; // (goonBrain reads mission.goons / mission.sharp)
    this.active = a;
    g.hud.toast(`Contract: ${o.name}. Marked on your map (☠)`, 0xff6a5a);
    g.sfx.play('select');
  }

  fail(why, quiet = false) {
    const g = this.game, a = this.active; if (!a) return;
    if (!quiet) g.hud.flashBanner?.('CONTRACT FAILED', '#ff6a5a');
    g.hud.toast(why, 0xff8a6a);
    this.cleanup(); this.offers = [];
  }

  succeed(how) {
    const g = this.game, a = this.active; if (!a) return;
    const bonus = how === 'chute' ? Math.round(a.pay * 0.25) : 0, total = a.pay + bonus;
    g.economy.bank += total; g.economy.save(); g.hud.setBank?.(g.economy.bank);
    this.save.done++; this.save.rep++; this.save.earned += total; this.persist();
    g.hud.flashBanner?.('CONTRACT COMPLETE', '#7be08a');
    g.hud.toast(`${a.name} is dead. $${total.toLocaleString()} wired to your bank${bonus ? ` (+$${bonus.toLocaleString()}: "Down the chute. I like that.")` : ''}`, 0x7be08a);
    g.sfx.play('cash');
    g.news?.add(a.famous ? `BREAKING: ${a.name}, ${a.who}, has been found dead. Police are treating it as murder.` : `A body found in ${g.news?.place(a.anchor)} has been named as ${a.name}. Police are appealing for witnesses.`, 'crime');
    this.cleanup(); this.offers = [];
  }

  cleanup() {
    const g = this.game, a = this.active; if (!a) return;
    for (const n of a.guards) if (g.citizens.list.includes(n)) { n.guard = false; n.alerted = false; g.citizens.despawn(n); }
    if (g.citizens.list.includes(a.target)) g.citizens.despawn(a.target);
    this.active = null;
    if (!g.story?.active && !g.trainHeist?.job) g.hud.setObjective(null);
  }

  get wp() { const a = this.active; if (!a) return null; const t = this.game.citizens.list.includes(a.target) ? a.target.body.translation() : a.lastPos; return t ? { x: t.x, z: t.z } : null; }

  update(dt) {
    const g = this.game, a = this.active, C = g.citizens;
    if (!a) return;
    a.t += dt;
    if (g.health.dead) { this.fail('You got sloppy. The contract\'s off.'); return; }
    if (a.t > 600) { this.fail('Too slow. The target\'s gone to ground. The contract\'s off.'); return; }
    const alive = C.list.includes(a.target);
    let status;
    if (alive) {
      const t = a.target.body.translation(); a.lastPos = new THREE.Vector3(t.x, t.y, t.z);
      // they hang about where they are (until something happens)
      if (!a.alerted && a.target.state === 'wander' && Math.hypot(t.x - a.anchor.x, t.z - a.anchor.z) > 5) a.target.target = a.anchor.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
      // trouble: they've been hurt, or they're running, or a guard's spotted you
      if (!a.alerted && (a.target.hp < a.startHp || a.target.state === 'flee' || a.guards.some((n) => n.alerted))) {
        a.alerted = true;
        const pp = g.shorePlayer.body.translation();
        for (const n of a.guards) { n.alerted = true; n.lastSeen = new THREE.Vector3(pp.x, pp.y, pp.z); }
        C.flee?.(a.target, pp, 30);
        const cops = TIERS[a.d].cops;
        if (cops) { g.police.report(cops, a.lastPos, true, 'shooting'); g.hud.toast(`${a.name}'s security is on the radio to the police!`, 0xff6a5a); }
        else if (a.guards.length) g.hud.toast(`${a.name}'s bodyguard${a.guards.length > 1 ? 's have' : ' has'} seen you!`, 0xff6a5a);
      }
      if (Math.hypot(t.x - a.anchor.x, t.z - a.anchor.z) > 650) { this.fail(`${a.name} got away. The contract's off.`); return; }
      const left = a.guards.filter((n) => C.list.includes(n)).length;
      status = a.alerted ? `${a.name} is running${left ? ` (${left} bodyguard${left > 1 ? 's' : ''} left)` : ''}: kill them` : `Find ${a.name} (${a.who}) and kill them${left ? `. ${left} bodyguard${left > 1 ? 's' : ''}` : ''}`;
    } else {
      // down: dead, or out cold (finish them), or gone (down the chute? or did they just get away?)
      const rd = C.ragdolls.find((r) => r.hitId === a.id);
      if (rd?.dead) { this.succeed('kill'); return; }
      if (rd) status = `${a.name}'s out cold: finish them (or take them to the volcano's disposal chute)`;
      else if (a.lastPos && g.volcano && Math.hypot(a.lastPos.x - g.volcano.V.x, a.lastPos.z - g.volcano.V.z) < 20) { this.succeed('chute'); return; }
      else { this.fail(`${a.name} got away. The contract's off.`); return; }
      { const t = rd.torso.body.translation(); a.lastPos = new THREE.Vector3(t.x, t.y, t.z); }
    }
    a.status = status;
    if (!g.story?.active && !g.trainHeist?.job) {
      const pp = g.shorePlayer.body.translation(), wp = this.wp, d = wp ? Math.hypot(pp.x - wp.x, pp.z - wp.z) : 0;
      g.hud.setObjective({ title: `Contract ${'☠'.repeat(a.d)}`, text: status, dist: wp && d > 8 ? Math.round(d) : null });
    }
  }
}
