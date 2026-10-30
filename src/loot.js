import * as THREE from 'three';

// Hot money. A bank job or a train heist doesn't put cash in your pocket: it goes in canvas money
// bags on your back. They're heavy (you're slower with every bag), they aren't saved (close the
// game and they're gone), and if you're killed or busted the police get them back. Get them to
// the counting room in the volcano base and they're counted, cleaned and paid into your account.

const PER_BAG = 6000;
const MAX_BAGS = 6;
export const LAUNDER_CUT = 0.1;

export class Loot {
  constructor(game) {
    this.game = game;
    this.amount = 0;
    this.from = new Set();
    this.el = document.createElement('div');
    this.el.className = 'loot-hud';
    this.el.style.cssText = 'position:fixed;right:14px;top:64px;z-index:30;padding:6px 10px;border-radius:8px;background:rgba(20,16,8,.78);border:1px solid #c8a04a;color:#ffd166;font:600 13px/1.35 system-ui,sans-serif;display:none;pointer-events:none;max-width:280px';
    document.body.appendChild(this.el);
    this.pulse = 0;
  }

  get bags() { return this.amount ? Math.min(MAX_BAGS, Math.ceil(this.amount / PER_BAG)) : 0; }
  get carrying() { return this.amount > 0; }
  // how much the bags slow you down on foot
  get slow() { return 1 - Math.min(0.3, this.bags * 0.05); }

  add(n, from) {
    const before = this.bags;
    this.amount += Math.round(n);
    if (from) this.from.add(from);
    if (this.bags > before) this.game.sfx?.play('select');
    this.refresh();
  }

  refresh() {
    const n = this.bags;
    this.el.style.display = n ? 'block' : 'none';
    if (n) this.el.innerHTML = `💰 ${n} money bag${n > 1 ? 's' : ''} · $${this.amount.toLocaleString()}<br><small style="color:#e8d8a8;font-weight:500">Hot money: get it to the counting room in the volcano base</small>`;
    this.game.net?.setLoot?.(n);
  }

  // killed or busted: the police take it all back
  lose(why) {
    if (!this.amount) return;
    const g = this.game;
    g.hud.toast(why === 'busted' ? `The police took the money bags ($${this.amount.toLocaleString()})` : `You dropped the money bags. The police have recovered $${this.amount.toLocaleString()}`, 0xff8a6a);
    this.amount = 0; this.from.clear();
    this.refresh();
  }

  // at the counting room: counted, cleaned (the counters take their cut) and paid into the bank
  process() {
    const g = this.game, e = g.economy;
    if (!this.amount) return 0;
    const gross = this.amount, net = Math.round(gross * (1 - LAUNDER_CUT));
    this.lastProcessed = [...this.from];
    this.amount = 0; this.from.clear();
    e.bank += net; e.save();
    g.hud.setMoney?.(e.money, 0);
    g.sfx.play('cash');
    this.refresh();
    return { gross, net };
  }

  update(dt) {
    const g = this.game;
    if (!this.amount) return;
    if (g.health.dead) this.lose('died');
    this.pulse += dt;
    this.el.style.borderColor = Math.sin(this.pulse * 4) > 0 ? '#ffd166' : '#8a6a2a';
  }
}

// a money bag model (for your back in multiplayer, the counting room, the train)
export function moneyBagMesh() {
  const g = new THREE.Group();
  const canvas = new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 0.95 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), canvas); b.scale.set(1, 1.15, 0.85); b.position.y = 0.32; g.add(b);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.16, 8), canvas); neck.position.y = 0.7; g.add(neck);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 10), new THREE.MeshStandardMaterial({ color: 0x3a2a18 })); tie.rotation.x = Math.PI / 2; tie.position.y = 0.66; g.add(tie);
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshStandardMaterial({ color: 0x2a5a2a, emissive: 0x2a5a2a, emissiveIntensity: 0.3 })); sign.position.set(0, 0.36, 0.275); g.add(sign);
  return g;
}
