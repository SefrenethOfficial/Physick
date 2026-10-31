import * as THREE from 'three';

const IMPACT_SPEED = 9; // m/s a prop has to be closing at before it hurts
const REGEN_DELAY = 5; // seconds after getting hurt
const REGEN_RATE = 6; // hp per second

// Player health: fall damage, getting hit by props, crashing the quad. Dying respawns you.
export class Health {
  constructor(game) {
    this.game = game;
    this.max = 100;
    this.hp = this.max;
    this.dead = false;
    this.deadT = 0;
    this.sinceHurt = 99;
    this.cooldown = new Map(); // prop -> time of last hit
    this.god = false;
    this.armor = 0;
  }

  damage(amount, kind = '') {
    if (this.dead || this.god || amount <= 0.5) return;
    // El Monstruo is bulletproof: rounds spark off the armoured glass
    const v = this.game.vehicles?.active;
    if ((v?.monster || v?.bulletproof) && ['goon', 'police', 'gang', 'clerk'].includes(kind)) return;
    const boat = this.game.boats?.active; // (an armoured boat: same again, the military's guns too)
    if (boat?.type.armored && ['goon', 'police', 'gang', 'clerk', 'military'].includes(kind)) return;
    if (boat?.type.armored && kind === 'explosion') amount *= 0.35;
    if (this.armor > 0) { // armour takes 70% of the hit until it's shot through
      const soak = Math.min(this.armor, amount * 0.7);
      this.armor -= soak;
      amount -= soak;
    }
    this.hp = Math.max(this.hp - amount, 0);
    this.sinceHurt = 0;
    this.game.hud.hurt(Math.min(amount / 40, 1));
    this.game.sfx.play(amount > 25 ? 'hurtBig' : 'hurt');
    if (this.hp <= 0) this.die(kind);
  }

  heal(n) {
    this.hp = Math.min(this.max, this.hp + n);
  }

  die(kind) {
    this.dead = true;
    this.deadT = 4;
    const g = this.game;
    g.leaveHelm?.();
    g.gunnery?.leave();
    const msg = {
      fall: 'You fell too far',
      lava: 'Into the lava',
      train: 'Hit by a train',
      prop: 'Flattened',
      overboard: 'Lost at sea',
      jet: 'Your jet went down',
      boat: 'Your boat went down',
      police: 'Shot by the police',
      car: 'Run down by a squad car',
      traffic: 'Hit by a car',
      gang: 'Gunned down in the Hollows',
      clerk: 'Shot by a shopkeeper',
      mascot: 'Beaten senseless by an ice cream mascot',
      goon: 'Gunned down by the Ashen Hand',
      drown: 'Drowned',
      carExplosion: 'Your car blew up',
      carCrash: 'Wrapped round a lamp post',
      explosion: 'Blown up',
      bail: 'Jumped out of a moving car',
      player: 'Killed by another player',
    }[kind] || 'You died';
    g.hud.showDeath(true, msg);
    g.sfx.play('die');
    g.onDeath?.(kind);
  }

  respawn() {
    this.dead = false;
    this.hp = this.max;
    if (this.game.respawnPlayer) this.game.respawnPlayer();
    else this.game.player.respawn();
    this.game.hud.showDeath(false);
  }

  // Every physics sub-step while on foot: anything flying into you hurts.
  checkImpacts() {
    const g = this.game;
    if (this.dead || g.atHelm || g.gunnery?.active || g.onShore || g.flying) return;
    const p = g.player;
    const t = p.body.translation();
    const ignore = new Set();
    if (g.heldProp) ignore.add(g.heldProp);
    const under = p.groundProp();
    if (under) ignore.add(under.prop);
    const self = p.vel.clone();
    if (p.platVel) self.add(new THREE.Vector3(p.platVel.x, p.platVel.y, p.platVel.z));
    const now = performance.now();
    for (const h of g.sandbox.incoming(t, 0.5, 0.35, self, ignore)) {
      if (h.speed < IMPACT_SPEED) continue;
      if (now - (this.cooldown.get(h.prop) || 0) < 600) continue;
      this.cooldown.set(h.prop, now);
      // Heavier things hurt more (masses here are in game units: a crate is ~0.6, the quad ~12).
      const weight = THREE.MathUtils.clamp(Math.sqrt(h.mass) * 0.9, 0.35, 3.5);
      this.damage((h.speed - IMPACT_SPEED + 3) * weight * 2.2, 'prop');
    }
  }

  update(dt) {
    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0) this.respawn();
    } else {
      this.sinceHurt += dt;
      if (this.sinceHurt > REGEN_DELAY && this.hp < this.max) this.hp = Math.min(this.max, this.hp + REGEN_RATE * dt);
    }
    this.game.hud.setHealth(this.hp / this.max, Math.ceil(this.hp));
    this.game.hud.setArmor?.(this.armor / 100);
  }
}
