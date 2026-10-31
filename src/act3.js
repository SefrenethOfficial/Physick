import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';

// ACT III: Foundations. The Ashen Hand blow things up; Gideon Pratt's company builds on what's left.
// Verian Central was on land he wanted, and the money runs from both of them offshore, to something
// called MERIDIAN. Somewhere along the way, Vic starts taking calls he doesn't want you to hear.
//   m12 Ash on the Wind    the Ashen Hand raid the volcano base. Somebody told them where it was.
//   (more to come: Following the Money, Dead Man's Switch, Black Water, The Quarry Job, Lockdown)

const FIXER = 'Vic';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const ACT3_KEY_ITEMS = {
  raidphone: { name: "The lieutenant's phone", desc: 'One photo in it: your tunnel entrance, taken from the summit car park. Sent from a withheld number, the day before the raid.' },
};

export const ACT3_MISSIONS = [
  {
    id: 'm12', title: 'Ash on the Wind', requires: 'm11',
    brief: `${FIXER}: "Where are you? Get to the volcano. Now. One of my people heard the Ashen Hand are sending a crew tonight, and they know exactly where to go. I don't know how."`,
    reward: 6000,
    passText: `${FIXER}: "A photo of the tunnel. From the car park. … Could've been anyone, kid. People talk. Let me make some calls."`,
  },
];

const LOOKS = {
  rifle: { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0x1a1a1a, hat: 'balaclava', hatColor: 0x111111 },
  smg: { shirt: 0x2a2620, pants: 0x1d1f22, skin: 0x1a1a1a, hat: 'balaclava', hatColor: 0x111111 },
  heavy: { shirt: 0x3a3f36, pants: 0x1d1f22, skin: 0x1a1a1a, hat: 'cranial', hatColor: 0x2a2c30 },
  grenadier: { shirt: 0x4a1f1a, pants: 0x1d1f22, skin: 0x1a1a1a, hat: 'balaclava', hatColor: 0x6a1a14 },
};
const WEAPONS = {
  rifle: { rate: [0.9, 0.9], dmg: 6, acc: 0.8 },
  smg: { rate: [0.25, 0.3], dmg: 3, acc: 0.6 },
  heavy: { rate: [1.4, 0.6], dmg: 11, acc: 1.2, shotgun: true },
  grenadier: { rate: [1.6, 1.0], dmg: 5, acc: 0.6 },
};

export class Act3 {
  constructor(game, story) {
    this.game = game;
    this.story = story;
  }

  owns(id) { return ACT3_MISSIONS.some((m) => m.id === id); }
  get vb() { return this.game.volcano; }

  // an Ashen Hand gunman, anywhere (inside the volcano: the hills)
  spawnGoon(a, at, kind) {
    const g = this.game, n = g.citizens.spawnCitizen('hills', 'goon', at.clone(), { look: LOOKS[kind] });
    if (!n) return null;
    Object.assign(n, { kind, weapon: WEAPONS[kind], nadeT: 3 + Math.random() * 3, hp: kind === 'heavy' ? 240 : 100, cash: 30 + Math.floor(Math.random() * 90), items: Math.random() < 0.3 ? ['pistol'] : [], heading: Math.random() * Math.PI * 2, mission: a, alerted: true });
    const p = g.shorePlayer.body.translation(); n.lastSeen = V3(p.x, p.y, p.z);
    if (kind === 'heavy') n.fig.root.scale.setScalar(1.15);
    a.goons.push(n);
    return n;
  }

  start(a) {
    const g = this.game;
    Object.assign(a, { goons: [], stage: 'go', fx: [] });
    const hasGun = g.held?.gun || g.economy.carried.some((x) => ITEM_BY_ID[x]?.gun);
    if (!hasGun) { g.giveItem(ITEM_BY_ID.smg); g.hud.toast(`${FIXER} left an SMG for you`, 0xffd166); }
    for (const [k, n] of [['smgAmmo', 150], ['pistolAmmo', 60], ['rifleAmmo', 90]]) if ((g.economy.ammo[k] || 0) < n) g.economy.addAmmo(k, n - (g.economy.ammo[k] || 0));
    if (g.health.armor < 50) { g.health.armor = 100; g.hud.toast('…and a vest. You\'re wearing it.', 0x7fb2ff); }
    const retry = this.retry?.id === a.id && performance.now() - this.retry.t < 20 * 60e3;
    this.retry = null;
    if (retry && !this.vb?.playerInside && !g.vehicles.active && !g.flying && !g.boats?.active && !g.skydive?.active) this.checkpoint(a);
  }

  end(a, pass) {
    const g = this.game;
    for (const n of a.goons || []) if (g.citizens.list.includes(n)) g.citizens.despawn(n);
    for (const o of a.fx || []) o.removeFromParent();
    if (a.phoneMesh) a.phoneMesh.removeFromParent();
    this.alarm(false);
    if (!pass) this.retry = { id: a.id, t: performance.now() };
  }

  checkpoint(a) {
    const g = this.game, v = this.vb;
    if (a.id === 'm12' && v) this.story.fade(() => { g.placeOnShore(v.portal.clone().add(V3(0, 1.2, 0)), Math.atan2(v.T.u.x, v.T.u.z)); g.hud.toast('Checkpoint: the summit car park', 0x9ec5ff); });
  }

  action(pos, a) {
    if (!a || !this.owns(a.id)) return null;
    const g = this.game;
    if (a.id === 'm12' && a.stage === 'search' && a.phoneAt && Math.hypot(pos.x - a.phoneAt.x, pos.z - a.phoneAt.z) < 2.4) {
      return { label: "Take the lieutenant's phone", run: () => {
        this.story.giveKeyItem('raidphone');
        g.hud.toast(ACT3_KEY_ITEMS.raidphone.desc, 0xe8e2d4);
        setTimeout(() => this.story.end(true), 2200);
        a.stage = 'done';
      } };
    }
    return null;
  }

  // the base's alarm: red lights flashing round the cavern, a klaxon
  alarm(on) {
    const g = this.game, v = this.vb; if (!v) return;
    if (on && !this.alarmLights) {
      this.alarmLights = [];
      for (let k = 0; k < 6; k++) { const p = v.at(v.R - 6, (k / 6) * Math.PI * 2 + 0.5), L = new THREE.PointLight(0xff2010, 0, 40, 1.4); L.position.set(p.x, v.Y + 10, p.z); g.scene.add(L); this.alarmLights.push(L); }
    }
    if (!on && this.alarmLights) { for (const L of this.alarmLights) L.removeFromParent(); this.alarmLights = null; }
  }

  update(a, p, dt) {
    if (a.id === 'm12') this.updM12(a, p, dt);
  }

  // ---------------------------------------------------------------- m12: Ash on the Wind
  updM12(a, p, dt) {
    const g = this.game, v = this.vb, C = g.citizens;
    if (!v) return;
    const inside = v.playerInside, dV = Math.hypot(p.x - v.V.x, p.z - v.V.z);
    a.goons = a.goons.filter((n) => C.list.includes(n));
    const left = a.goons.length;
    // the alarm going, while they're in the base
    if (this.alarmLights) {
      a.klaxT = (a.klaxT || 0) - dt;
      if (a.klaxT <= 0) { a.klaxT = 2.4; if (dV < 120) g.sfx.play('alarm'); }
      this.alarmLights.forEach((L, i) => { L.intensity = Math.max(0, Math.sin(g.time * 6 + i * 1.3)) * 4; });
    }
    if (a.stage !== 'go' && a.stage !== 'done' && dV > 170) { this.story.end(false, 'You ran. They tore the base apart'); return; }
    if (a.stage === 'go') {
      a.text = 'Get to the volcano base: the tunnel from the summit car park';
      a.wp = v.portal.clone();
      if (inside) {
        a.stage = 'wave1'; a.waveT = 3;
        this.alarm(true);
        g.hud.flashBanner('INTRUDERS', '#ff3a2a');
        g.hud.toast('The blast door alarm\'s going: they\'re in the tunnel behind you!', 0xff6a5a);
      }
      return;
    }
    a.wp = null;
    if (a.stage === 'wave1') {
      if (a.waveT != null) {
        a.waveT -= dt; a.text = 'Get ready. They\'re coming up the tunnel';
        if (a.waveT <= 0) {
          a.waveT = null;
          const T = v.T, kinds = ['rifle', 'smg', 'rifle', 'grenadier', 'smg', 'heavy'];
          kinds.forEach((kind, i) => { const t = T.len - 6 - (i % 3) * 4, lat = (i % 2 ? 1 : -1) * (1.5 + (i % 3)); this.spawnGoon(a, V3(T.a.x + T.u.x * t + T.u.z * lat, T.y + 1.05, T.a.z + T.u.z * t - T.u.x * lat), kind); });
        }
        return;
      }
      a.text = `They're coming through the tunnel! Fight them off (${left} left)`;
      this.story.updateNades(a, dt, p);
      if (!left) { a.stage = 'wave2'; a.waveT = 4; g.hud.toast('…Ropes! Coming down from the vent!', 0xff6a5a); this.ropes(a); }
      return;
    }
    if (a.stage === 'wave2') {
      if (a.waveT != null) {
        a.waveT -= dt; a.text = 'Look up: they\'re coming down ropes from the vent';
        if (a.waveT <= 0) {
          a.waveT = null;
          a.ropeAt.forEach((r, i) => { for (const [j, kind] of [[0, 'rifle'], [1, i === 1 ? 'grenadier' : 'smg']]) this.spawnGoon(a, V3(r.x + (j ? 1.4 : -1.4), v.Y + 0.95, r.z), kind); });
        }
        return;
      }
      a.text = `They came down from the vent! Take them out (${left} left)`;
      this.story.updateNades(a, dt, p);
      if (!left) {
        a.stage = 'vault'; a.vaultT = 50; a.waveT = 0.1;
        g.hud.flashBanner('THE COUNTING ROOM', '#ff3a2a');
        g.hud.toast('That was a distraction: there\'s a crew in the counting room, cutting into the safe!', 0xff6a5a);
      }
      return;
    }
    if (a.stage === 'vault') {
      if (a.waveT != null) {
        a.waveT = null;
        /* the room's own axes, from the counters (local x) and the door (local +z) */
        const [c0, c1] = v.counters, s = c1.clone().sub(c0).setY(0).normalize(), mid = c0.clone().add(c1).multiplyScalar(0.5), f = v.counting.clone().sub(mid).setY(0).normalize();
        const loc = (x, z) => v.counting.clone().addScaledVector(s, x).addScaledVector(f, z - 1.6).setY(v.counting.y + 0.95);
        [['smg', -1.5, 3.2], ['rifle', 2, 3.2], ['heavy', 0, -2.0], ['heavy', 0, 0.6]].forEach(([kind, x, z], i) => {
          const n = this.spawnGoon(a, loc(x, z), kind);
          if (n && i === 2) { n.lt = true; n.hp = 360; a.lt = n; } /* (the lieutenant: he's got a phone) */
        });
        return;
      }
      a.vaultT -= dt;
      const s = Math.max(0, Math.ceil(a.vaultT));
      a.text = `Stop them in the counting room before they're through the safe: <b>0:${String(s).padStart(2, '0')}</b> (${left} left)`;
      a.wp = v.counting.clone();
      if (a.lt && C.list.includes(a.lt)) { const t = a.lt.body.translation(); a.ltAt = V3(t.x, v.Y, t.z); }
      if (a.vaultT <= 0 && left) { this.story.end(false, 'They cracked the safe and got away with everything'); return; }
      if (!left) {
        a.stage = 'search'; this.alarm(false);
        a.phoneAt = (a.ltAt || v.counting).clone();
        const ph = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.17), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x3a7aff, emissiveIntensity: 0.6 }));
        ph.position.copy(a.phoneAt).add(V3(0.5, 0.06, 0)); g.scene.add(ph); a.phoneMesh = ph;
        g.hud.toast('That\'s all of them. The lieutenant had a phone on him, and it\'s lit up', 0x7be08a);
      }
      return;
    }
    if (a.stage === 'search') {
      a.text = "The lieutenant's phone is lit up on the floor: take it";
      a.wp = a.phoneAt.clone();
      if (a.phoneMesh) a.phoneMesh.rotation.y += dt * 2;
    }
  }

  // ropes hanging from the vent down into the cavern, where the second lot come down
  ropes(a) {
    const g = this.game, v = this.vb, top = v.ventTop - 2;
    a.ropeAt = [0.9, 2.9, 4.9].map((ang) => v.at(20, ang));
    for (const r of a.ropeAt) {
      const geo = new THREE.BufferGeometry().setFromPoints([V3(v.V.x + (r.x - v.V.x) * 0.1, top, v.V.z + (r.z - v.V.z) * 0.1), V3(r.x, v.Y + 0.2, r.z)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2a2620 }));
      g.scene.add(line); a.fx.push(line);
    }
  }

  tick() {}

  completeText() {
    return `<p>Pratt Developments is rebuilding Verian Central. The Ashen Hand cleared the ground for it. And the money from both goes somewhere offshore called MERIDIAN.</p>
      <p>Vic's phone keeps ringing. He keeps not answering it in front of you.</p>`;
  }
}
