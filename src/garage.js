import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildFigure } from './figure.js';
import { carAtlas } from './buildkit.js';

// Underpass Customs: a tin shed under the Saltmarsh Gate Bridge at the end of a dirt lane no
// traffic uses. Roll into the bay, press E, and the boys will work on whatever you're driving.

const PAINTS = [['Fire red', 0xc23b2a], ['Midnight', 0x14161c], ['Pearl', 0xeeeeea], ['Lime', 0x7ad83a], ['Gold', 0xd0a020], ['Purple', 0x6a2a8a], ['Sky', 0x2f9fe8], ['Pink', 0xe8789f]];

export const UPGRADES = [
  { id: 'engine', name: 'Engine', levels: [2500, 6000, 12000], desc: (lv) => `Stage ${lv + 1}: more power, higher top speed`,
    apply: (car, lv) => { car.maxSpeed = (car.baseMax ?? 30) + 5 + 6 * lv; car.accelMul = 1.2 + 0.2 * lv; } },
  { id: 'armour', name: 'Armour plating', levels: [4000], desc: () => 'Reinforced body: takes about 2.5x the punishment',
    apply: (car) => { car.maxHp = Math.max(car.maxHp, 250); car.hp = car.maxHp; if (car.type) car.type = { ...car.type, hp: car.maxHp }; } },
  { id: 'bulletproof', name: 'Bulletproof glass & tyres', levels: [15000], desc: () => 'Rounds just spark off. You and the car stay safe from gunfire',
    apply: (car) => { car.bulletproof = true; } },
  { id: 'nitro', name: 'Nitrous', levels: [8000], desc: () => 'Hold Shift for a burst of speed (it refills)',
    apply: (car) => { car.nitro = true; car.nitroTank = 1; } },
];

export class Garage {
  constructor(game) {
    this.game = game;
    const gar = game.park.garage;
    this.bay = gar.bay;
    this.mechanics = gar.mechanics.map((p, i) => {
      const fig = buildFigure({ shirt: 0xd06a1a, pants: 0x2a3446, skin: [0xc68a5a, 0x8a5a3a][i % 2], hat: 'cap', hatColor: 0x1b2638 });
      fig.root.position.set(p.x, p.y + 0.83, p.z);
      fig.root.rotation.y = Math.atan2(gar.bay.x - p.x, gar.bay.z - p.z) + Math.PI;
      game.scene.add(fig.root);
      game.portSandbox.addStaticCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(p.x, p.y + 0.83, p.z));
      return fig;
    });
    this.t = 0;
  }

  // in a car, stopped in the bay
  inBay() {
    const v = this.game.vehicles.active;
    return v && !v.isHeli && !v.monster && Math.hypot(v.pos.x - this.bay.x, v.pos.z - this.bay.z) < 7 && Math.abs(v.speed) < 3 ? v : null;
  }

  update(dt) {
    this.t += dt;
    // tinkering: a bob and a swing of the spanner
    for (const [i, f] of this.mechanics.entries()) {
      const a = Math.sin(this.t * (2.2 + i) + i);
      if (f.parts.armR) f.parts.armR.rotation.x = -0.9 + a * 0.5;
      if (f.parts.torso) f.parts.torso.rotation.x = 0.12 + Math.max(0, a) * 0.1;
    }
  }

  open(car) {
    const g = this.game, e = g.economy;
    const cur = (u) => (car.mods?.[u.id] ?? -1);
    const pay = (n) => {
      if (e.money + e.bank < n) { g.hud.toast(`You need $${n.toLocaleString()}`, 0xff8a6a); return false; }
      const fromCash = Math.min(e.money, n);
      e.bank -= n - fromCash;
      e.addMoney(-fromCash);
      g.sfx.play('cash');
      return true;
    };
    const render = () => {
      const rows = UPGRADES.map((u) => {
        const lv = cur(u), next = lv + 1, done = next >= u.levels.length;
        const tag = u.levels.length > 1 ? ` <small>(${Math.max(0, lv + 1)}/${u.levels.length})</small>` : '';
        return `<div class="erow"><div><b>${u.name}</b>${tag}<small>${u.desc(done ? lv : next)}</small></div>
          <div class="btns">${done ? '<button disabled>Fitted</button>' : `<button data-a="up" data-id="${u.id}">$${u.levels[next].toLocaleString()}</button>`}</div></div>`;
      }).join('');
      const fix = car.hp < car.maxHp || car.flat ? `<div class="erow"><div><b>Repair</b><small>Panel beating, a polish${car.flat ? ' and four new tyres' : ''} (${Math.round((car.hp / car.maxHp) * 100)}% now)</small></div><div class="btns"><button data-a="fix">$300</button></div></div>` : '';
      const paint = `<div class="erow"><div><b>Respray</b><small>$500, any colour you like</small></div><div class="btns paints">${PAINTS.map(([n, c], i) => `<button data-a="paint" data-i="${i}" title="${n}" style="background:#${c.toString(16).padStart(6, '0')};width:26px;height:26px;padding:0;border-radius:50%"></button>`).join('')}</div></div>`;
      e.open('Underpass Customs', e.header() + '<p><i>"What are we doing to her?"</i></p>' + (car.ownedUid ? '<p class="lede">It\'s your car: everything we fit is kept.</p>' : '<p class="lede">Heads up: this one isn\'t yours, so the work goes when the car does. Buy a car at Verian Motors to keep your upgrades.</p>') + rows + fix + paint, (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b || b.disabled) return;
        if (b.dataset.a === 'up') {
          const u = UPGRADES.find((x) => x.id === b.dataset.id), next = cur(u) + 1;
          if (!pay(u.levels[next])) return;
          (car.mods ||= {})[u.id] = next;
          u.apply(car, next);
          g.hud.toast(`${u.name} fitted`, 0x7be08a);
          g.sfx.play('engineStart');
        }
        if (b.dataset.a === 'fix' && pay(300)) { car.hp = car.maxHp; car.flat = false; g.hud.toast('Good as new', 0x7be08a); }
        if (b.dataset.a === 'paint' && pay(500)) { this.respray(car, PAINTS[+b.dataset.i][1]); g.hud.toast(`Sprayed ${PAINTS[+b.dataset.i][0].toLowerCase()}`, 0x7be08a); }
        if (car.ownedUid) g.dealer?.remember(car); // your own car keeps its upgrades (saved)
        render();
      }));
    };
    render();
  }

  respray(car, color) {
    const old = car.mesh.children[0]?.material;
    if (!old) return;
    const m = carAtlas(color, false);
    car.mesh.traverse((o) => { if (o.isMesh && o.material === old) o.material = m; });
    car.color = color;
  }
}
