import * as THREE from 'three';

// WELD: click a prop, then click another prop (or the world) to weld them together.
export class Weld {
  constructor(game) {
    this.game = game;
    this.name = 'Weld';
    this.color = 0xffc928;
    this.first = null; // { prop, localPoint }
    this.hints = [
      ['LMB', 'Select prop, then weld target'],
      ['LMB', 'on the ground welds to world'],
      ['RMB', 'Remove all welds on prop'],
      ['R', 'Cancel selection'],
    ];
    game.events.on('propRemoved', (p) => { if (this.first?.prop === p) this.first = null; });
  }

  primaryDown() {
    const g = this.game;
    const hit = g.aimHit();
    const muzzle = g.muzzle();
    if (!hit) { g.sfx.play('error'); return; }
    g.effects.tracer(muzzle, hit.point, this.color, 0.012);
    g.viewmodel.kick(0.25);

    if (!this.first) {
      if (!hit.prop) { g.hud.toast('Select a prop first', this.color); g.sfx.play('error'); return; }
      this.first = { prop: hit.prop, point: hit.point.clone() };
      g.sandbox.setHighlight(hit.prop, this.color);
      g.effects.sparks(hit.point, hit.normal, this.color, 8, 2);
      g.sfx.play('select');
      g.hud.toast('Now click what to weld it to', this.color);
      return;
    }

    const a = this.first.prop;
    if (hit.prop === a) { this.cancel(); g.hud.toast('Selection cleared', this.color); return; }
    const b = hit.prop; // null = world
    if (!b && !hit.isWorld) { g.sfx.play('error'); return; }
    if (b && [...a.welds].some((w) => w.a === b || w.b === b)) {
      g.hud.toast('Already welded', this.color); g.sfx.play('error'); this.cancel(); return;
    }

    g.sandbox.weld(a, b, hit.point);
    g.sandbox.setHighlight(a, null);
    this.first = null;
    g.effects.sparks(hit.point, hit.normal, 0xfff0a0, 40, 5);
    g.effects.sparks(hit.point, hit.normal, 0x7fd3ff, 16, 3);
    g.sfx.play('weld');
    g.hud.toast(b ? 'Welded!' : 'Welded to world', this.color);
  }

  secondaryDown() {
    const g = this.game;
    const hit = g.aimHit();
    if (!hit?.prop) { g.sfx.play('error'); return; }
    const n = g.sandbox.unweldAll(hit.prop);
    if (n) {
      g.effects.sparks(hit.point, hit.normal, 0xff9a3d, 20, 4);
      g.sfx.play('unweld');
      g.hud.toast(`Removed ${n} weld${n > 1 ? 's' : ''}`, this.color);
    } else {
      g.hud.toast('No welds on that', this.color);
      g.sfx.play('error');
    }
  }

  key(code) {
    if (code === 'KeyR') { this.cancel(); return true; }
    return false;
  }

  cancel() {
    if (this.first) this.game.sandbox.setHighlight(this.first.prop, null);
    this.first = null;
  }

  update() {
    const g = this.game;
    g.viewmodel.gripTarget = this.first ? 0.6 : 0;
    // Keep a live beam to the selected prop so you can see what's queued.
    if (this.first && g.sandbox.props.has(this.first.prop)) {
      const to = this.first.prop.mesh.getWorldPosition(new THREE.Vector3());
      const from = g.muzzle();
      const ctrl = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.6, 0));
      g.effects.setBeam(true, from, to, ctrl, this.color, performance.now() / 1000);
    } else {
      g.effects.setBeam(false);
    }
  }

  deactivate() {
    this.cancel();
    this.game.effects.setBeam(false);
  }
}
