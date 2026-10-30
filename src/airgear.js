import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Parachutes and the hang glider, from the shop in the alcove up the side of the volcano.
//   a parachute: fall from anywhere high (a roof, a cliff, a helicopter) and SPACE opens it. One
//   use each; carry up to five.
//   the hang glider: yours to keep. Stand somewhere high, facing out over the drop, and press H.

const CHUTE = 900, GLIDER = 12000, MAX_CHUTES = 5;

export class AirGear {
  constructor(game) { this.game = game; }

  get chutes() { return this.game.economy.perks.parachutes || 0; }
  get glider() { return !!this.game.economy.perks.glider; }

  // free-falling on foot, with a parachute, and well clear of the ground
  chuteReady() {
    const g = this.game, P = g.shorePlayer;
    if (!this.chutes || !g.onShore || g.vehicles.active || g.skydive.active || g.health.dead || g.pragdoll.active) return false;
    if (P.vel.y > -9) return false;
    const t = P.body.translation();
    const gy = g.skydive.groundAt(t.x, t.z, t.y - 1);
    return gy === null ? t.y > 25 : t.y - gy > 14;
  }

  openChute() {
    const g = this.game, P = g.shorePlayer, t = P.body.translation();
    g.economy.perks.parachutes = this.chutes - 1; g.economy.save();
    const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    g.skydive.start(new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(P.vel.x + f.x * 2, P.vel.y, P.vel.z + f.z * 2), { mode: 'chute' });
  }

  // standing at an edge with a drop in front of you
  canLaunch() {
    const g = this.game;
    if (!this.glider || !g.onShore || g.vehicles.active || g.skydive.active || g.health.dead || g.pragdoll.active) return false;
    const P = g.shorePlayer, t = P.body.translation(), f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    for (const d of [8, 16]) {
      const gy = g.skydive.groundAt(t.x + f.x * d, t.z + f.z * d, t.y + 1);
      if (gy !== null && t.y - gy < 7) return false;
    }
    return true;
  }

  launch() {
    const g = this.game, P = g.shorePlayer, t = P.body.translation(), f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    g.skydive.start(new THREE.Vector3(t.x + f.x * 1.5, t.y + 0.5, t.z + f.z * 1.5), f.multiplyScalar(14), { mode: 'glider' });
    g.sfx.play('grab');
  }

  prompt() {
    if (this.chuteReady()) return `<kbd>Space</kbd> Open your parachute (${this.chutes} left)`;
    return null;
  }

  // the shop
  open() {
    const g = this.game, e = g.economy;
    const render = () => {
      const row = (label, small, btn) => `<div class="erow"><div><b>${label}</b><small>${small}</small></div><div class="btns">${btn}</div></div>`;
      let html = e.header() + '<p class="lede">"Best launch on the island, right here off the edge. Wind\'s usually coming up the mountain."</p>';
      html += row('Parachute', `Fall from anywhere high and press <kbd>Space</kbd> to open it. One use. You have ${this.chutes} (carry up to ${MAX_CHUTES}).`, `<button data-a="chute" ${e.money >= CHUTE && this.chutes < MAX_CHUTES ? '' : 'disabled'}>$${CHUTE}</button>`);
      html += row('Hang glider', this.glider ? 'You own one. Stand at an edge facing out and press <kbd>H</kbd>.' : 'Yours to keep: stand somewhere high, facing out over a drop, and press <kbd>H</kbd>. Mouse or A/D to bank, W to dive, S to pull up. Hot air comes up off the volcano.', this.glider ? '<button disabled>Owned</button>' : `<button data-a="glider" ${e.money + e.bank >= GLIDER ? '' : 'disabled'}>$${GLIDER.toLocaleString()}</button>`);
      e.open('Skyhigh Chutes & Gliders', html, (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]'); if (!b || b.disabled) return;
        if (b.dataset.a === 'chute') { e.addMoney(-CHUTE, 'a parachute'); e.perks.parachutes = this.chutes + 1; }
        if (b.dataset.a === 'glider') { const c = Math.min(e.money, GLIDER); e.bank -= GLIDER - c; e.addMoney(-c, 'a hang glider'); e.perks.glider = true; g.hud.toast('A hang glider! Walk to the edge of the launch ramp, face out, press H', 0x7be08a); }
        e.save(); g.sfx.play('cash');
        render();
      }));
    };
    render();
  }
}
void RAPIER;
