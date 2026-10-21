import * as THREE from 'three';
import { islandAt } from './world.js';

// The two crews of the Hollows. Hang around their turf, sizing up anyone who comes close.
// Act suspicious — linger in their space, wave a gun about, start trouble near them, speed at
// them — and they'll come for you, and the whole neighbourhood goes up in a gang war.

export const CREWS = {
  kings: { id: 'kings', name: 'Eastside Kings', color: '#d13b2b', shirt: 0xb3261e, pants: 0x1d1f22, hat: 0xb3261e },
  hollow: { id: 'hollow', name: 'Hollow Boys', color: '#3fae5a', shirt: 0x2f7a3a, pants: 0x2a2a2a, hat: 0x1f5a2a },
};
const SKIN = [0xf1c9a5, 0xd9a47c, 0xa8724f, 0x7a4f35, 0x5a3a28];
const PER_CREW = 7;

export class Gangs {
  constructor(game) {
    this.game = game;
    this.crews = {
      kings: { ...CREWS.kings, hostile: false, post: game.hood.kingsPost },
      hollow: { ...CREWS.hollow, hostile: false, post: game.hood.hollowPost },
    };
    this.war = { active: false, t: 0, calmT: 0 };
    this.respawnT = 10;
  }

  rival(id) { return id === 'kings' ? 'hollow' : 'kings'; }

  look(id) {
    const c = CREWS[id];
    return { shirt: c.shirt, pants: c.pants, skin: SKIN[Math.floor(Math.random() * SKIN.length)], hat: 'cap', hatColor: c.hat };
  }

  spawnMember(id, far = false) {
    const crew = this.crews[id];
    const cz = this.game.citizens;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 7;
      const p = cz.randomPointOn('hood', new THREE.Vector3(crew.post.x + Math.cos(a) * r, 0, crew.post.z + Math.sin(a) * r), 2, far ? 50 : 0);
      if (!p) continue;
      const n = cz.spawnCitizen('hood', 'gang', p, { look: this.look(id) });
      if (!n) continue;
      n.gang = id;
      n.post = crew.post.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      n.susp = 0;
      n.raider = Math.random() < 0.5;
      n.hp = 120;
      n.cash = 60 + Math.floor(Math.random() * 240);
      if (Math.random() < 0.35) n.items.push('pistol');
      n.heading = Math.random() * Math.PI * 2;
      return n;
    }
    return null;
  }

  populate() {
    for (const id of ['kings', 'hollow']) for (let i = 0; i < PER_CREW; i++) this.spawnMember(id);
  }

  members(id) { return this.game.citizens.list.filter((n) => n.role === 'gang' && (!id || n.gang === id)); }

  // Something set them off.
  provoke(id, why = '') {
    const crew = this.crews[id];
    const g = this.game;
    if (!crew.hostile) {
      crew.hostile = true;
      g.hud.toast(`${crew.name}: ${why || 'you picked the wrong block'} — they're coming for you`, 0xff6a5a);
    }
    this.war.calmT = 0;
    if (!this.war.active) {
      this.war.active = true;
      this.war.t = 0;
      g.hud.flashBanner('GANG WAR', crew.color);
      g.sfx.play('scream');
    }
  }

  // A gang member shoots at a point. Returns true on a hit.
  shoot(npc, target, chance) {
    const g = this.game;
    const t = npc.body.translation();
    const from = new THREE.Vector3(t.x, t.y + 0.5, t.z).addScaledVector(new THREE.Vector3(Math.sin(npc.heading), 0, Math.cos(npc.heading)), 0.4);
    const hit = Math.random() < chance;
    const to = new THREE.Vector3(target.x, target.y + 0.4, target.z);
    if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.4, (Math.random() - 0.5) * 3));
    g.police.tracer(from, to);
    g.fx.flash(from, 0xffc060, 0.8, 0.06);
    g.sfx.play('pistol');
    g.citizens.alarm(from, 30);
    return hit;
  }

  update(dt) {
    const g = this.game;
    const w = this.war;
    if (w.active) {
      w.t += dt;
      // it dies down once you're well away (or keep your head down for a while)
      const p = g.shorePlayer.body.translation();
      const inHood = islandAt(p.x, p.z, 60)?.id === 'hood';
      w.calmT += dt * (inHood ? 0.4 : 1.5);
      if (w.calmT > 60 || g.health.dead) {
        w.active = false;
        for (const c of Object.values(this.crews)) c.hostile = false;
        for (const n of this.members()) { n.susp = 0; n.lastSeen = null; this.game.citizens.setMarker(n, null); }
        g.hud.toast('The Hollows have calmed down… for now', 0x9ec5ff);
      }
    }
    // crews get new recruits, out of sight
    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = w.active ? 20 : 12;
      for (const id of ['kings', 'hollow']) if (this.members(id).length < PER_CREW) this.spawnMember(id, true);
    }
  }
}
