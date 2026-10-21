import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Npcs } from './npcs.js';
import { GROUPS } from './groups.js';
import { randomLook, animateWalk, animatePanic } from './figure.js';
import { ISLANDS, LAND_Y, onLand } from './world.js';
import { LOOT_COMMON, LOOT_RARE } from './items.js';
import { canvasTex } from './buildkit.js';

// Townspeople and police officers on the islands (world frame, shore physics).
// Civilians wander, notice crimes, get suspicious of blood and bodies, and call the police.
// Officers patrol, investigate, chase, punch, and (at 3+ stars) shoot.

const HALF = 0.55, RAD = 0.28;
const yawDir = (h) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
const SKIN = [0xf1c9a5, 0xd9a47c, 0xa8724f, 0x7a4f35, 0xffdcbd];

function markerTex(ch, color) {
  return canvasTex(64, 64, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fill();
    g.fillStyle = color; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 35);
  });
}

export class Citizens extends Npcs {
  constructor(game) {
    super(game);
    this.quota = { city: 36, town: 24, park: 9 };
    this.copQuota = { city: 2, town: 1, park: 1 };
    this.marks = { '?': markerTex('?', '#ffd166'), '!': markerTex('!', '#ff4a3a'), cop: markerTex('★', '#7fb2ff') };
    this.respawnT = 3;
  }

  get world() { return this.game.portWorld; }
  get sb() { return this.game.portSandbox; }
  get parent() { return this.game.scene; }
  get blood() { return this.game.worldBlood; }
  look() { return this._look || randomLook(); }

  islandRect(id) { return ISLANDS.find((i) => i.id === id); }

  // Random walkable ground point on an island (not on a roof or inside a building).
  randomPointOn(id, near = null, range = 30, minDistFromPlayer = 0) {
    if (id === 'city' && !near && this.game.city) return this.pavementPoint(minDistFromPlayer);
    const r = this.islandRect(id);
    const pp = this.game.shorePlayer?.body.translation();
    for (let i = 0; i < 25; i++) {
      const x = near ? near.x + (Math.random() - 0.5) * 2 * range : r.x0 + 10 + Math.random() * (r.x1 - r.x0 - 20);
      const z = near ? near.z + (Math.random() - 0.5) * 2 * range : r.z0 + 10 + Math.random() * (r.z1 - r.z0 - 20);
      if (!onLand(x, z, -6)) continue;
      if (pp && minDistFromPlayer && Math.hypot(x - pp.x, z - pp.z) < minDistFromPlayer) continue;
      const hit = this.sb.raycast({ x, y: 150, z }, { x: 0, y: -1, z: 0 }, 160);
      if (!hit || !hit.isWorld || (id !== 'park' && Math.abs(hit.point.y - LAND_Y) > 0.25) || hit.normal.y < 0.85) continue;
      return hit.point;
    }
    return null;
  }

  populate() {
    for (const id of ['city', 'town', 'park']) {
      for (let k = 0; k < this.quota[id]; k++) this.spawnCitizen(id);
      for (let k = 0; k < this.copQuota[id]; k++) this.spawnCitizen(id, 'cop');
    }
  }

  spawnCitizen(island, role = 'civ', at = null) {
    this._look = role === 'cop'
      ? { shirt: 0x1c2f6e, pants: 0x111a33, skin: SKIN[Math.floor(Math.random() * SKIN.length)], hat: 'cap', hatColor: 0x111a33, badge: true }
      : null;
    const p = at || this.randomPointOn(island);
    if (!p) return null;
    const npc = this.spawn(p);
    this._look = null;
    npc.role = role;
    npc.island = island;
    npc.state = role === 'cop' ? 'patrol' : 'wander';
    npc.senseT = Math.random() * 0.5;
    npc.reportT = 0;
    npc.seen = new Set();
    npc.cash = role === 'cop' ? 20 : 10 + Math.floor(Math.random() * (island === 'town' ? 140 : 90));
    npc.items = [];
    const n = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < n; i++) npc.items.push(Math.random() < 0.15 ? LOOT_RARE[Math.floor(Math.random() * 5)] : LOOT_COMMON[Math.floor(Math.random() * 5)]);
    npc.atkT = 0;
    const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.marks['?'], transparent: true, depthTest: false }));
    mk.position.y = 1.3;
    mk.scale.setScalar(0.5);
    mk.visible = false;
    npc.fig.root.add(mk);
    npc.marker = mk;
    if (role === 'cop') npc.hp = 160;
    return npc;
  }

  setMarker(npc, kind) {
    npc.marker.visible = !!kind;
    if (kind) npc.marker.material.map = this.marks[kind];
  }

  // Line of sight from an NPC's eyes to a point, against buildings and terrain only.
  canSee(npc, p, max = 40) {
    const t = npc.body.translation();
    const eye = { x: t.x, y: t.y + 0.75, z: t.z };
    const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > max) return false;
    if (d < 0.5) return true;
    const sb = this.sb;
    const hit = sb.world.castRay(new RAPIER.Ray(eye, { x: dx / d, y: dy / d, z: dz / d }), d - 0.3, true, undefined, undefined, undefined, undefined,
      (c) => sb.staticColliders.has(c.handle));
    return !hit;
  }

  damage(npc, amount, dir, point) {
    npc.hp -= amount;
    const t = npc.body.translation();
    if (npc.hp <= 0) {
      const v = dir.clone().multiplyScalar(6); v.y += 1.5;
      this.knockOver(npc, v, 3, { killed: true, point, dir });
      this.game.police.crime(npc.role === 'cop' ? 'copkill' : 'murder', npc.role === 'cop' ? 3 : 2, new THREE.Vector3(t.x, t.y, t.z));
    } else {
      this.game.sfx.play('ouch');
      this.game.police.crime('assault', 1, new THREE.Vector3(t.x, t.y, t.z));
      npc.stunT = 0.7; // reeling from the hit
      if (npc.role === 'civ') this.flee(npc, this.game.shorePlayer.body.translation(), 8);
    }
  }

  knockOver(npc, velocity, spin, opts = {}) {
    const rd = super.knockOver(npc, velocity, spin, opts);
    rd.loot = { cash: npc.cash, items: [...npc.items] };
    rd.role = npc.role;
    rd.id = Math.random();
    rd.bornAt = this.game.time * 1000;
    return rd;
  }

  flee(npc, from, seconds) {
    npc.state = 'flee';
    npc.fear = Math.max(npc.fear, seconds);
    npc.threat.set(from.x, 0, from.z);
    this.setMarker(npc, '!');
  }

  // ---- perception (a few times a second per person) ----
  sense(npc, pp, playerVisible) {
    const g = this.game;
    const t = npc.body.translation();
    const now = this.game.time * 1000;
    // crimes they can see
    for (const c of g.police.crimes) {
      if (now - c.t > 2500 || c.witnessed?.has(npc)) continue;
      if (Math.hypot(c.pos.x - t.x, c.pos.z - t.z) > 45 || !this.canSee(npc, { x: c.pos.x, y: c.pos.y + 0.5, z: c.pos.z }, 45)) continue;
      (c.witnessed ||= new Set()).add(npc);
      if (npc.role === 'cop') { g.police.report(c.severity, c.pos, true, `${c.kind}`); npc.state = 'chase'; }
      else { this.flee(npc, c.pos, 10); npc.reportT = 2.5; npc.reportSev = Math.max(npc.reportSev || 0, c.severity); npc.reportPos = c.pos.clone(); npc.reportSeen = true; npc.reportWhy = c.kind; }
      return;
    }
    if (npc.role === 'cop') return;
    // someone dragging a body around in plain sight
    if (playerVisible && g.dragging && Math.hypot(pp.x - t.x, pp.z - t.z) < 30) {
      this.flee(npc, pp, 10); npc.reportT = 2; npc.reportSev = 2; npc.reportPos = new THREE.Vector3(pp.x, pp.y, pp.z); npc.reportSeen = true; npc.reportWhy = 'body';
      return;
    }
    if (npc.state !== 'wander') return;
    // blood or a body nearby: go and look
    let found = null;
    for (const rd of this.ragdolls) {
      if (npc.seen.has(rd.id) || !this.sb.props.has(rd.torso)) continue;
      const p = rd.torso.body.translation();
      if (Math.hypot(p.x - t.x, p.z - t.z) < 18 && this.canSee(npc, p, 18)) { found = { key: rd.id, pos: new THREE.Vector3(p.x, p.y, p.z), body: true }; break; }
    }
    if (!found && this.blood) {
      for (const m of this.blood.decals) {
        if (npc.seen.has(m.id)) continue;
        const p = m.position;
        if (Math.hypot(p.x - t.x, p.z - t.z) < 12 && this.canSee(npc, { x: p.x, y: p.y + 0.2, z: p.z }, 12)) { found = { key: m.id, pos: p.clone() }; break; }
      }
    }
    if (found) {
      npc.seen.add(found.key);
      npc.state = 'investigate';
      npc.inv = found;
      npc.target = found.pos;
      this.setMarker(npc, '?');
      g.sfx.play('select');
    }
  }

  update(dt) {
    const g = this.game;
    const onFoot = g.onShore && !g.flying && !g.boats?.active;
    const pt = g.shorePlayer.body.translation();
    const pp = new THREE.Vector3(pt.x, pt.y, pt.z);
    const wanted = g.police.wanted;

    for (const npc of [...this.list]) {
      const t = npc.body.translation();
      // thrown things
      const hits = this.sb.incoming(t, HALF, RAD);
      let worst = null;
      for (const h of hits) if (!worst || h.speed > worst.speed) worst = h;
      if (worst && worst.speed > 5.5) {
        const v = new THREE.Vector3(worst.vel.x, worst.vel.y, worst.vel.z).multiplyScalar(1.1);
        v.y = Math.max(v.y, 0) + 2;
        const tp = worst.prop.body.translation();
        this.knockOver(npc, v, 4, { killed: true, point: new THREE.Vector3(t.x, t.y + 0.3, t.z), dir: new THREE.Vector3(t.x - tp.x, 0, t.z - tp.z) });
        g.police.crime('murder', 2, new THREE.Vector3(t.x, t.y, t.z));
        continue;
      }

      const distP = Math.hypot(pp.x - t.x, pp.z - t.z);
      npc.senseT -= dt;
      let playerVisible = false;
      if (npc.senseT <= 0) {
        npc.senseT = 0.35 + Math.random() * 0.2;
        playerVisible = onFoot && distP < 60 && this.canSee(npc, { x: pp.x, y: pp.y + 0.6, z: pp.z }, 60);
        npc.playerVisible = playerVisible;
        this.sense(npc, pp, playerVisible);
      }
      playerVisible = npc.playerVisible;

      // phoning it in
      if (npc.reportT > 0) {
        npc.reportT -= dt;
        if (npc.reportT <= 0) {
          g.police.report(npc.reportSev || 1, npc.reportPos || new THREE.Vector3(t.x, t.y, t.z), npc.reportSeen, npc.reportWhy);
          npc.reportSev = 0;
        }
      }

      // ---- decide what to do ----
      let want = null, speed = 0;
      if (npc.stunT > 0) {
        npc.stunT -= dt;
      } else if (npc.role === 'cop') {
        if (wanted > 0 && onFoot && !npc.leaving && (playerVisible || npc.state === 'chase')) {
          npc.state = 'chase';
          this.setMarker(npc, 'cop');
          if (playerVisible) npc.lastSeen = pp.clone();
          const goal = npc.lastSeen || pp;
          want = new THREE.Vector3(goal.x - t.x, 0, goal.z - t.z);
          const d = want.length();
          speed = d > 1.2 ? (wanted >= 3 && playerVisible && distP < 20 ? 3 : 5.6) : 0;
          if (d > 0.01) want.normalize();
          npc.atkT -= dt;
          if (wanted >= 2 && distP < 1.5 && npc.atkT <= 0) {
            npc.atkT = 0.9;
            g.health.damage(8, 'police');
            g.sfx.play('thud');
          } else if (wanted >= 3 && playerVisible && distP < 35 && distP > 3 && npc.atkT <= 0) {
            npc.atkT = 1.4 + Math.random() * 0.6;
            g.police.copShoots(npc, pp);
          }
          if (!playerVisible && npc.lastSeen && Math.hypot(npc.lastSeen.x - t.x, npc.lastSeen.z - t.z) < 2) { npc.lastSeen = null; npc.state = 'patrol'; }
        } else if (npc.state === 'investigate' && npc.target) {
          want = new THREE.Vector3(npc.target.x - t.x, 0, npc.target.z - t.z);
          if (want.length() < 2) { npc.state = 'patrol'; npc.target = null; npc.idle = 4; this.setMarker(npc, '?'); }
          else { want.normalize(); speed = 3.2; }
        } else {
          if (npc.state === 'chase') npc.state = 'patrol';
          this.setMarker(npc, null);
          ({ want, speed } = this.wander(npc, t, dt, 1.4));
        }
      } else if (npc.fear > 0 || npc.state === 'flee') {
        npc.fear -= dt;
        want = new THREE.Vector3(t.x - npc.threat.x, 0, t.z - npc.threat.z);
        if (want.lengthSq() < 0.01) want.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        want.normalize();
        speed = 4.6;
        if (npc.fear <= 0) { npc.state = 'wander'; npc.ringStale = true; this.setMarker(npc, null); }
      } else if (npc.state === 'investigate' && npc.inv) {
        want = new THREE.Vector3(npc.inv.pos.x - t.x, 0, npc.inv.pos.z - t.z);
        if (want.length() < 2.5) {
          // they've seen it close up: scream, call the police, and get away from here
          npc.state = 'alarmed';
          this.setMarker(npc, '!');
          g.sfx.play('ouch');
          const seen = playerVisible && distP < 20;
          npc.reportT = 2.5; npc.reportSev = 1; npc.reportPos = npc.inv.pos.clone(); npc.reportSeen = seen; npc.reportWhy = npc.inv.body ? 'body' : 'blood';
          npc.fear = 0; npc.idle = 2.5;
          want = null;
        } else { want.normalize(); speed = 1.6; }
      } else if (npc.state === 'alarmed') {
        npc.idle -= dt;
        if (npc.idle <= 0) this.flee(npc, npc.inv.pos, 6);
      } else {
        ({ want, speed } = this.wander(npc, t, dt, 1.4));
      }
      this.move(npc, t, want, speed, dt);
    }
  }

  // ---- city pedestrians keep to the pavements: round the block, crossing at the corners ----
  pavementPoint(minDist = 0) {
    const c = this.game.city, pp = this.game.shorePlayer?.body.translation();
    for (let k = 0; k < 30; k++) {
      const i = Math.floor(Math.random() * c.blocks), j = Math.floor(Math.random() * c.blocks), e = Math.floor(Math.random() * 4);
      const p = c.corner(i, j, e).lerp(c.corner(i, j, (e + 1) % 4), Math.random());
      if (pp && minDist && Math.hypot(p.x - pp.x, p.z - pp.z) < minDist) continue;
      return p;
    }
    return null;
  }

  nearestCorner(t) {
    const c = this.game.city;
    const cl = (v) => Math.max(0, Math.min(c.blocks - 1, v));
    const i = cl(Math.floor((t.x - c.xs[0]) / (c.xs[1] - c.xs[0]))), j = cl(Math.floor((t.z - c.zs[0]) / (c.zs[1] - c.zs[0])));
    let best = 0, bd = Infinity;
    for (let k = 0; k < 4; k++) { const p = c.corner(i, j, k); const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < bd) { bd = d; best = k; } }
    return { i, j, c: best, dir: Math.random() < 0.5 ? 1 : -1 };
  }

  pavementWander(npc, t, dt, pace) {
    const c = this.game.city;
    if (npc.idle > 0) { npc.idle -= dt; return { want: null, speed: 0 }; }
    if (!npc.ring || npc.ringStale) { npc.ring = this.nearestCorner(t); npc.ringStale = false; }
    let R = npc.ring;
    let tgt = c.corner(R.i, R.j, R.c);
    if (Math.hypot(tgt.x - t.x, tgt.z - t.z) > 75) { R = npc.ring = this.nearestCorner(t); tgt = c.corner(R.i, R.j, R.c); }
    if (Math.hypot(tgt.x - t.x, tgt.z - t.z) < 1.2) {
      const sx = R.c === 0 || R.c === 3 ? -1 : 1, sz = R.c < 2 ? -1 : 1;
      const cross = [];
      if (R.i + sx >= 0 && R.i + sx < c.blocks) cross.push({ i: R.i + sx, j: R.j, c: [1, 0, 3, 2][R.c] });
      if (R.j + sz >= 0 && R.j + sz < c.blocks) cross.push({ i: R.i, j: R.j + sz, c: [3, 2, 1, 0][R.c] });
      const cr = cross.length && Math.random() < 0.25 ? cross[Math.floor(Math.random() * cross.length)] : null;
      // look both ways: don't step out with a car coming
      const mid = cr && c.corner(cr.i, cr.j, cr.c).add(tgt).multiplyScalar(0.5);
      const clear = cr && !this.game.traffic?.cars.some((k) => Math.hypot(k.pos.x - mid.x, k.pos.z - mid.z) < 16 && k.speed > 1);
      if (cr && clear) Object.assign(R, cr);
      else R.c = (R.c + R.dir + 4) % 4;
      if (Math.random() < 0.12) npc.idle = 1 + Math.random() * 3;
      tgt = c.corner(R.i, R.j, R.c);
    }
    npc.pace ||= 0.85 + Math.random() * 0.35;
    return { want: new THREE.Vector3(tgt.x - t.x, 0, tgt.z - t.z).normalize(), speed: pace * npc.pace };
  }

  wander(npc, t, dt, pace) {
    if (npc.island === 'city' && this.game.city) return this.pavementWander(npc, t, dt, pace);
    let want = null, speed = 0;
    if (npc.idle > 0) { npc.idle -= dt; return { want, speed }; }
    if (!npc.target || Math.hypot(npc.target.x - t.x, npc.target.z - t.z) < 1.5) {
      if (npc.target && Math.random() < 0.4) npc.idle = 1 + Math.random() * 4;
      npc.target = this.randomPointOn(npc.island, t, 40);
    }
    if (npc.target) {
      want = new THREE.Vector3(npc.target.x - t.x, 0, npc.target.z - t.z).normalize();
      speed = pace;
    }
    return { want, speed };
  }

  move(npc, t, want, speed, dt) {
    if (want) {
      // stay on the island
      const ahead = t.x + want.x * 3, aheadZ = t.z + want.z * 3;
      if (!onLand(ahead, aheadZ, -2)) { want.multiplyScalar(-1); npc.target = null; }
      const targetH = Math.atan2(want.x, want.z);
      let d = targetH - npc.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      npc.heading += d * Math.min(dt * (speed > 3 ? 9 : 4), 1);
      if (Math.abs(d) > 1.2) speed *= 0.3;
    }
    npc.speed += (speed - npc.speed) * Math.min(dt * 6, 1);
    npc.stuckT += dt;
    if (npc.stuckT > 1.5) {
      const moved = Math.hypot(t.x - npc.lastPos.x, t.z - npc.lastPos.z);
      if (npc.speed > 0.5 && moved < 0.4) { npc.target = null; npc.heading += Math.PI * (0.5 + Math.random()); }
      npc.lastPos.set(t.x, 0, t.z);
      npc.stuckT = 0;
    }
    const f = yawDir(npc.heading).multiplyScalar(npc.speed * dt);
    npc.vy = Math.max(npc.vy - 20 * dt, -40);
    npc.cc.computeColliderMovement(npc.collider, { x: f.x, y: npc.vy * dt, z: f.z }, undefined, GROUPS.npcMove);
    const mv = npc.cc.computedMovement();
    npc.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    if (npc.cc.computedGrounded()) npc.vy = 0;
    if (t.y < LAND_Y - 6) this.despawn(npc);
  }

  frame(dt) {
    for (const npc of this.list) {
      const t = npc.body.translation();
      npc.fig.root.position.set(t.x, t.y, t.z);
      npc.fig.root.rotation.y = npc.heading;
      npc.phase += dt * (2.5 + npc.speed * 2.6);
      if (npc.state === 'flee' && npc.role === 'civ') animatePanic(npc.fig.parts, npc.phase);
      else animateWalk(npc.fig.parts, npc.phase, npc.speed / 1.5);
    }
    // top islands back up (out of sight of the player)
    if (this.game.settings.civRespawn) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.respawnT = 4;
        for (const id of ['city', 'town', 'park']) {
          const civs = this.list.filter((n) => n.island === id && n.role === 'civ').length;
          if (civs < this.quota[id]) { const p = this.randomPointOn(id, null, 0, 60); if (p) this.spawnCitizen(id, 'civ', p); }
          const cops = this.list.filter((n) => n.island === id && n.role === 'cop' && !n.dispatched).length;
          if (cops < this.copQuota[id]) { const p = this.randomPointOn(id, null, 0, 80); if (p) this.spawnCitizen(id, 'cop', p); }
        }
      }
    }
    const now = this.game.time * 1000;
    for (const rd of [...this.ragdolls]) {
      if (!this.game.settings.keepBodies && now - rd.bornAt > 90000 && !this.inUse(rd)) {
        for (const p of rd.parts) this.sb.remove(p);
        this.ragdolls.splice(this.ragdolls.indexOf(rd), 1);
      }
    }
  }
}
