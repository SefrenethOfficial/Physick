import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, std } from './buildkit.js';
import { ITEM_BY_ID } from './items.js';

// Verian National Bank: keep your money safe (cash in your pocket is what you lose when you
// die or get busted), ATMs dotted around the map, and — if you're holding a gun — a bank job.

const ROB_TIME = 18; // seconds in the vault to empty it
const ROB_RATE = [600, 950]; // $ per second while you fill the bag
const COOLDOWN = 600; // seconds before the vault's worth robbing again

function atmTex(broken) {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#d7d9dc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f3b2e'; g.fillRect(0, 0, w, 22);
    g.fillStyle = '#f2e6c0'; g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.fillText('ATM', w / 2, 16);
    g.fillStyle = broken ? '#111' : '#2a6fd9'; g.fillRect(8, 30, w - 16, 34);
    if (!broken) { g.fillStyle = '#cfe4ff'; g.font = '9px Arial'; g.fillText('VERIAN', w / 2, 44); g.fillText('NATIONAL', w / 2, 56); }
    else { g.strokeStyle = '#aaa'; g.beginPath(); g.moveTo(10, 32); g.lineTo(40, 50); g.lineTo(30, 62); g.moveTo(40, 50); g.lineTo(54, 36); g.stroke(); }
    g.fillStyle = '#555'; for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.fillRect(16 + c * 12, 72 + r * 8, 9, 6);
    g.fillStyle = '#222'; g.fillRect(14, 108, w - 28, 5);
  });
}

export class Bank {
  constructor(game) {
    this.game = game;
    this.atms = [];
    this.byCollider = new Map();
    this.robbedAt = -1e9;
    this.heist = null;
    this.alarmT = 0;
    this.tex = { ok: atmTex(false), broken: atmTex(true) };
  }

  // An ATM standing at (x, z) facing yaw (its screen looks along +Z rotated by yaw).
  addATM(x, y, z, yaw) {
    const g = this.game;
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.6), std({ color: 0x9aa0a6, metalness: 0.5, roughness: 0.4 }));
    body.position.y = 0.9;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.44), new THREE.MeshStandardMaterial({ map: this.tex.ok, emissive: 0xffffff, emissiveMap: this.tex.ok, emissiveIntensity: 0.25 }));
    face.position.set(0, 0.95, 0.301);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.3), std({ color: 0x1f3b2e }));
    hood.position.set(0, 1.84, 0.2);
    group.add(body, face, hood);
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scene.add(group);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const col = g.portSandbox.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.4, 0.9, 0.3).setTranslation(x, y + 0.9, z).setRotation(q));
    const atm = { group, face, pos: new THREE.Vector3(x, y, z), front: new THREE.Vector3(0, 0, 1.2).applyQuaternion(q).add(new THREE.Vector3(x, y, z)), hp: 100, broken: false, brokenAt: 0 };
    this.byCollider.set(col.handle, atm);
    this.atms.push(atm);
    return atm;
  }

  nearATM(pos) {
    return this.atms.find((a) => !a.broken && Math.hypot(a.front.x - pos.x, a.front.z - pos.z) < 1.6 && Math.abs(pos.y - a.pos.y - 1) < 1.5) || null;
  }

  nearCounter(pos) {
    const c = this.game.city.bank?.counter;
    return c && Math.hypot(c.x - pos.x, c.z - pos.z) < 3 && Math.abs(pos.y - c.y - 1) < 1.5;
  }

  inVault(pos) {
    const v = this.game.city.bank?.vault;
    return v && Math.hypot(v.x - pos.x, v.z - pos.z) < 4.5 && Math.abs(pos.y - v.y - 1) < 1.5;
  }

  get canRob() { return this.game.time - this.robbedAt > COOLDOWN && !this.heist; }

  // ---- deposits and withdrawals ----
  open(atm = false) {
    const g = this.game, e = g.economy;
    const fee = atm ? 5 : 0;
    const render = () => {
      const row = (label, small, btns) => `<div class="erow"><div><b>${label}</b><small>${small}</small></div><div class="btns">${btns}</div></div>`;
      const dep = [100, 1000].map((n) => `<button data-a="dep" data-n="${n}" ${e.money >= n ? '' : 'disabled'}>$${n.toLocaleString()}</button>`).join('') + `<button data-a="dep" data-n="all" ${e.money > 0 ? '' : 'disabled'}>All</button>`;
      const wd = [100, 1000].map((n) => `<button data-a="wd" data-n="${n}" ${e.bank >= n + fee ? '' : 'disabled'}>$${n.toLocaleString()}</button>`).join('') + `<button data-a="wd" data-n="all" ${e.bank > fee ? '' : 'disabled'}>All</button>`;
      e.open(atm ? 'ATM — Verian National' : 'Verian National Bank', `<div class="econ-head"><span>In your pocket <b>$${e.money.toLocaleString()}</b></span><span>In the bank <b>$${e.bank.toLocaleString()}</b></span></div>`
        + `<p class="lede">${atm ? `Cash machine. $${fee} fee per withdrawal.` : '"Money in the bank can\'t be lost if you\'re hurt or arrested. Money in your pocket can."'}</p>`
        + row('Deposit', 'Put cash from your pocket in your account', dep)
        + row('Withdraw', atm ? `$${fee} fee` : 'Free at the counter', wd), (body) => body.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b) return;
        if (b.dataset.a === 'dep') {
          const n = b.dataset.n === 'all' ? e.money : Math.min(+b.dataset.n, e.money);
          if (n <= 0) return;
          e.money -= n; e.bank += n;
          g.hud.setMoney(e.money, -n);
        } else {
          const want = b.dataset.n === 'all' ? e.bank - fee : +b.dataset.n;
          if (want <= 0 || e.bank < want + fee) return;
          e.bank -= want + fee; e.money += want;
          g.hud.setMoney(e.money, want);
        }
        e.save();
        g.sfx.play('cash');
        render();
      }));
    };
    render();
  }

  // ---- the bank job ----
  startHeist() {
    const g = this.game;
    if (!this.canRob) { g.hud.toast(this.heist ? 'Already on it' : 'The vault\'s still empty from last time', 0xff8a6a); return; }
    this.heist = { t: 0, take: 0, tick: 0 };
    const p = g.city.bank.counter.clone();
    g.police.crime('bankjob', 3, p);
    g.police.report(4, p, true, 'bank'); // the tellers hit the silent alarm
    g.citizens.alarm(p, 60);
    g.hud.flashBanner('BANK JOB', '#ff5a4a');
    g.stocks?.event('VNB', -0.12, 'Armed raid on Verian National Bank! Its shares tumble as the alarm sounds downtown.');
    g.hud.toast('Get behind the counter and into the vault!', 0xffd166);
    g.sfx.play('scream');
  }

  // A shot or a swing hit something solid: is it an ATM?
  hitATM(collider, dmg) {
    const atm = this.byCollider.get(collider?.handle);
    if (!atm || atm.broken) return false;
    atm.hp -= dmg;
    const g = this.game;
    g.sfx.play('impact');
    if (atm.hp <= 0) {
      atm.broken = true;
      atm.brokenAt = g.time;
      atm.face.material.map = this.tex.broken;
      atm.face.material.emissiveMap = this.tex.broken;
      atm.face.material.needsUpdate = true;
      for (let i = 0; i < 12; i++) g.fx.emit(atm.front.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4), 0xffd27a, 0.4, 1, 0);
      // cash spills out
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const p = atm.front.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2));
        const prop = g.portSandbox.spawn(ITEM_BY_ID.cash, p, new THREE.Quaternion(), { noHistory: true });
        prop.body.setLinvel({ x: (Math.random() - 0.5) * 3, y: 2, z: (Math.random() - 0.5) * 3 }, true);
      }
      g.police.crime('theft', 2, atm.pos.clone());
      g.hud.toast('The ATM spits out cash — bag it with B', 0x7be08a);
    }
    return true;
  }

  update(dt) {
    const g = this.game;
    // broken ATMs get fixed after a while
    for (const a of this.atms) {
      if (a.broken && g.time - a.brokenAt > 300) {
        a.broken = false; a.hp = 100;
        a.face.material.map = this.tex.ok; a.face.material.emissiveMap = this.tex.ok; a.face.material.needsUpdate = true;
      }
    }
    const h = this.heist;
    if (!h) return;
    const p = g.shorePlayer.body.translation();
    this.alarmT -= dt;
    if (this.alarmT <= 0) { this.alarmT = 0.7; g.sfx.play('alarm'); }
    const v = g.city.bank.vault;
    if (g.health.dead || Math.hypot(p.x - v.x, p.z - v.z) > 60) { // you left (or didn't make it)
      if (h.take) g.hud.toast(`Got away with $${h.take.toLocaleString()} from the bank`, 0x7be08a);
      this.heist = null;
      if (h.t > 0) this.robbedAt = g.time;
      return;
    }
    if (this.inVault(p) && h.t < ROB_TIME) {
      h.t += dt;
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 1;
        const n = Math.round(ROB_RATE[0] + Math.random() * (ROB_RATE[1] - ROB_RATE[0]));
        h.take += n;
        g.economy.addMoney(n);
        g.sfx.play('cash');
      }
      if (h.t >= ROB_TIME) {
        this.robbedAt = g.time;
        g.police.report(3, v.clone(), true, 'bank');
        g.hud.toast(`Vault's empty — $${h.take.toLocaleString()}. Now get out!`, 0xffd166);
      }
    }
  }

  prompt(pos) {
    const h = this.heist;
    if (!h) return null;
    if (h.t >= ROB_TIME) return 'Vault cleaned out — get away from the bank!';
    if (this.inVault(pos)) return `Filling the bag… $${h.take.toLocaleString()} (${Math.round((h.t / ROB_TIME) * 100)}%)`;
    return 'Get into the vault behind the counter!';
  }
}
