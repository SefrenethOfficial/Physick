import * as THREE from 'three';

// Graphics quality: presets plus the individual knobs they set. Everything except antialiasing
// applies on the fly.

export const PRESETS = {
  low: { resScale: 0.5, shadows: 'off', viewDist: 'near', crowd: 'low', antialias: false, dynRes: true },
  medium: { resScale: 0.75, shadows: 'low', viewDist: 'medium', crowd: 'normal', antialias: false, dynRes: true },
  high: { resScale: 1, shadows: 'high', viewDist: 'far', crowd: 'normal', antialias: true, dynRes: false },
  ultra: { resScale: 'native', shadows: 'ultra', viewDist: 'far', crowd: 'high', antialias: true, dynRes: false },
};

const SHADOWS = {
  off: null,
  low: { size: 1024, extent: 28, type: THREE.PCFShadowMap },
  high: { size: 2048, extent: 40, type: THREE.PCFShadowMap },
  ultra: { size: 4096, extent: 60, type: THREE.PCFSoftShadowMap },
};

export const VIEW = {
  near: { far: 1600, fogNear: 120, fogFar: 900, cull: 110, ship: 350 },
  medium: { far: 3500, fogNear: 160, fogFar: 1600, cull: 150, ship: 500 },
  far: { far: 6000, fogNear: 180, fogFar: 2400, cull: 170, ship: 700 },
};

export const CROWD = { low: 0.5, normal: 1, high: 1.35 };

export class Graphics {
  constructor(game) {
    this.game = game;
    this.dyn = 1; // dynamic-resolution factor on top of the chosen scale
    this.fpsT = 0; this.fpsN = 0;
    this.lastFrame = 0;
    this.applied = {};
  }

  get s() { return this.game.settings; }

  basePixelRatio() {
    const r = this.s.resScale;
    return r === 'native' ? Math.min(devicePixelRatio, 2) : Number(r);
  }

  apply() {
    const g = this.game, s = this.s, r = g.renderer;
    // ---- resolution ----
    if (!s.dynRes) this.dyn = 1;
    this.setPixelRatio();

    // ---- shadows ----
    const sh = s.shadows in SHADOWS ? SHADOWS[s.shadows] : SHADOWS.high;
    const wasOn = r.shadowMap.enabled, wasType = r.shadowMap.type;
    r.shadowMap.enabled = !!sh;
    g.sun.castShadow = !!sh;
    if (sh) {
      r.shadowMap.type = sh.type;
      if (g.sun.shadow.mapSize.x !== sh.size) {
        g.sun.shadow.mapSize.set(sh.size, sh.size);
        g.sun.shadow.map?.dispose();
        g.sun.shadow.map = null;
      }
      const c = g.sun.shadow.camera;
      c.left = c.bottom = -sh.extent; c.right = c.top = sh.extent;
      c.updateProjectionMatrix();
    }
    if (wasOn !== r.shadowMap.enabled || wasType !== r.shadowMap.type) {
      // materials compile shadow code in or out: make them rebuild
      const seen = new Set();
      g.scene.traverse((o) => {
        const m = o.material;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) if (!seen.has(mm)) { seen.add(mm); mm.needsUpdate = true; }
      });
    }

    // ---- view distance ----
    const v = VIEW[s.viewDist] ?? VIEW.far;
    g.camera.far = v.far;
    g.sky.scale.setScalar(Math.min(1, (v.far * 0.9) / 3000)); // keep the sky dome inside the far plane
    g.camera.updateProjectionMatrix();
    g.scene.fog.near = v.fogNear;
    g.scene.fog.far = v.fogFar;
    const u = g.ocean.uniforms;
    u.uFogNear.value = v.fogNear;
    u.uFogFar.value = v.fogFar;
    g.view = v;

    // ---- crowds ----
    this.setCrowd(CROWD[s.crowd] ?? 1);

    g.hud.statsEl.style.display = s.showFps ? '' : 'none';
    this.applied = { ...s };
  }

  setPixelRatio() {
    const g = this.game;
    const pr = Math.max(0.35, this.basePixelRatio() * this.dyn);
    if (Math.abs(g.renderer.getPixelRatio() - pr) < 0.01) return;
    g.renderer.setPixelRatio(pr);
    g.resize();
  }

  setCrowd(m) {
    const g = this.game, c = g.citizens, t = g.traffic;
    c.baseQuota ||= { ...c.quota };
    for (const id in c.baseQuota) c.quota[id] = Math.round(c.baseQuota[id] * m);
    for (const net of t.nets) { net.baseCount ??= net.count; net.count = Math.max(1, Math.round(net.baseCount * m)); }
    // thin out the extras where you can't see it happen
    const pp = g.shorePlayer.body.translation();
    const far = (p) => Math.hypot(p.x - pp.x, p.z - pp.z) > 60;
    for (const id in c.quota) {
      const civs = c.list.filter((n) => n.role === 'civ' && n.island === id && !n.hostage && far(n.body.translation()));
      let extra = c.list.filter((n) => n.role === 'civ' && n.island === id).length - c.quota[id];
      for (const n of civs) { if (extra-- <= 0) break; c.despawn(n); }
    }
    for (const net of t.nets) {
      const cars = t.cars.filter((car) => car.net === net);
      let extra = cars.length - net.count;
      for (const car of cars) { if (extra <= 0) break; if (!car.driverOut && far(car.pos)) { t.remove(car); extra--; } }
    }
  }

  // Called from the animation loop. Returns false to skip this frame (frame-rate cap).
  shouldRender(now) {
    const cap = Number(this.s.fpsCap) || 0;
    if (cap) {
      const min = 1000 / cap;
      if (now - this.lastFrame < min - 2) return false;
    }
    this.lastFrame = now;
    return true;
  }

  // Dynamic resolution: drop the render scale when the frame rate sags, creep back up when there's headroom.
  update(dt) {
    if (!this.s.dynRes) return;
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT < 1.5) return;
    const fps = this.fpsN / this.fpsT;
    this.fpsT = 0; this.fpsN = 0;
    const cap = Number(this.s.fpsCap) || 60;
    const target = Math.min(cap, 60) * 0.85;
    if (fps < target && this.dyn > 0.5) this.dyn = Math.max(0.5, this.dyn - 0.1);
    else if (fps > Math.min(cap, 60) * 0.97 && this.dyn < 1) this.dyn = Math.min(1, this.dyn + 0.05);
    else return;
    this.setPixelRatio();
  }
}
