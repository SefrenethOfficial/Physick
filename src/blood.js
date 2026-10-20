import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Blood decals in the ship frame: spray from a kill, a pool that spreads under the body,
// smears when a body is dragged, and the mop that cleans it all up.

function splatTex(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(64, 64, 34 + rnd() * 10, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, r = 30 + rnd() * 22, rr = 6 + rnd() * 14;
    g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rr, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, r = 50 + rnd() * 12;
    g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1.5 + rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function smearTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.2, 'rgba(255,255,255,1)');
  grd.addColorStop(0.8, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  for (let i = 0; i < 7; i++) g.fillRect(8 + i * 7 + Math.random() * 3, 0, 4 + Math.random() * 3, 128);
  return new THREE.CanvasTexture(c);
}

export class Blood {
  // opts.parent: where decals live (ship frame or world); opts.sandbox: physics to stick to;
  // opts.npcs: the NPC set whose ragdolls bleed.
  constructor(game, opts = {}) {
    this.game = game;
    this.opts = opts;
    this.group = new THREE.Group();
    (opts.parent || game.frame).add(this.group);
    this.decals = [];
    this.drops = [];
    this.splats = [0, 1, 2, 3].map(splatTex);
    this.smear = smearTex();
    this.dropGeo = new THREE.SphereGeometry(0.025, 6, 4);
    this.dropMat = new THREE.MeshStandardMaterial({ color: 0x6e0a0a, roughness: 0.3 });
    this.max = 400;
  }

  get enabled() { return this.game.settings.blood; }

  // Flat decal on the surface at (ship-frame) point p with normal n.
  decal(p, n, size, { tex = null, opacity = 0.92, yaw = Math.random() * 6.28, stretch = 1, grow = 0 } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
      color: 0x5a0606, map: tex || this.splats[Math.floor(Math.random() * 4)], alphaMap: tex || null,
      transparent: true, opacity, roughness: 0.25, metalness: 0.1, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2 - (this.decals.length % 8), polygonOffsetUnits: -2,
    }));
    if (!tex) m.material.alphaMap = m.material.map;
    m.position.copy(p).addScaledVector(n, 0.012);
    m.lookAt(m.position.clone().add(n));
    m.rotateZ(yaw);
    m.scale.set(size, size * stretch, 1);
    m.userData = { size, target: grow || size, opacity, stretch };
    this.group.add(m);
    this.decals.push(m);
    while (this.decals.length > this.max) this.remove(this.decals[0]);
    return m;
  }

  remove(m) {
    m.removeFromParent();
    m.material.dispose();
    m.geometry.dispose();
    const i = this.decals.indexOf(m);
    if (i >= 0) this.decals.splice(i, 1);
  }

  // Surface under a ship-frame point (deck, floor...).
  ground(p, maxDown = 3) {
    return this.cast({ x: p.x, y: p.y + 0.2, z: p.z }, { x: 0, y: -1, z: 0 }, maxDown + 0.2);
  }

  // Ray against the ship itself only (ignores bodies, props, crew and you).
  cast(origin, dir, max) {
    const sb = this.opts.sandbox || this.game.sandbox;
    const hit = sb.world.castRayAndGetNormal(new RAPIER.Ray(origin, dir), max, true, undefined, undefined, undefined, undefined,
      (c) => sb.staticColliders.has(c.handle));
    if (!hit) return null;
    const d = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    };
  }

  // A crew member was killed: spray droplets and start the body bleeding.
  onKill(rd, point, dir) {
    if (!this.enabled) return;
    rd.bleed = 1;
    rd.lastSmear = rd.torso.body.translation();
    const d = dir ? dir.clone().normalize() : new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(this.dropGeo, this.dropMat);
      m.position.copy(point);
      this.group.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).multiplyScalar(4.5).addScaledVector(d, 3);
      this.drops.push({ m, v, life: 2 });
    }
  }

  // Mop: fade decals near a ship-frame point. Returns true if anything was cleaned.
  mop(p, radius, dt) {
    let any = false;
    for (const m of [...this.decals]) {
      if (m.position.distanceTo(p) > radius + m.userData.size * 0.4) continue;
      m.material.opacity -= dt * 0.9;
      any = true;
      if (m.material.opacity <= 0.04) this.remove(m);
    }
    return any;
  }

  update(dt) {
    // flying droplets
    for (const d of [...this.drops]) {
      d.life -= dt;
      d.v.y -= 9.8 * dt;
      const from = d.m.position.clone();
      d.m.position.addScaledVector(d.v, dt);
      const seg = d.m.position.clone().sub(from);
      const len = seg.length();
      let landed = false;
      if (len > 0) {
        const hit = this.cast(from, seg.divideScalar(len), len + 0.03);
        if (hit) {
          this.decal(hit.point, hit.normal, 0.12 + Math.random() * 0.22, { opacity: 0.85 });
          landed = true;
        }
      }
      if (landed || d.life <= 0) {
        d.m.removeFromParent();
        this.drops.splice(this.drops.indexOf(d), 1);
      }
    }
    // growing pools
    for (const m of this.decals) {
      const u = m.userData;
      if (u.size < u.target) {
        u.size = Math.min(u.target, u.size + dt * 0.05);
        m.scale.set(u.size, u.size * u.stretch, 1);
      }
    }
    // bodies bleed: a pool under a resting body, smears behind a dragged one
    const npcs = this.opts.npcs ? this.opts.npcs() : this.game.npcs;
    const sbx = this.opts.sandbox || this.game.sandbox;
    for (const rd of npcs.ragdolls) {
      if (!rd.bleed || rd.bleed <= 0 || !sbx.props.has(rd.torso)) continue;
      rd.bleed = Math.max(0, rd.bleed - dt / 90);
      const t = rd.torso.body.translation();
      const v = rd.torso.body.linvel();
      const speed = Math.hypot(v.x, v.z);
      const tp = new THREE.Vector3(t.x, t.y, t.z);
      if (speed < 0.3) {
        rd.restT = (rd.restT || 0) + dt;
        if (rd.restT > 0.8 && (!rd.pool || rd.pool.position.distanceTo(tp) > 0.9 || !rd.pool.parent)) {
          const g = this.ground(tp, 1.2);
          if (g) rd.pool = this.decal(g.point, g.normal, 0.35, { grow: 0.9 + rd.bleed * 0.9, opacity: 0.95 });
        }
      } else {
        rd.restT = 0;
        const last = rd.lastSmear ? new THREE.Vector3(rd.lastSmear.x, rd.lastSmear.y, rd.lastSmear.z) : tp.clone();
        if (tp.distanceTo(last) > 0.35) {
          const g = this.ground(tp, 1.0);
          if (g) {
            const dir = tp.clone().sub(last);
            const yaw = Math.atan2(dir.x, dir.z);
            const m = this.decal(g.point, g.normal, 0.42, { tex: this.smear, opacity: 0.55 + rd.bleed * 0.35, yaw: 0, stretch: Math.min(dir.length() * 2.6, 2.4) });
            // align the smear with the drag direction (decal faces up; rotate around the normal)
            m.rotation.set(-Math.PI / 2, 0, yaw + Math.PI);
          }
          rd.lastSmear = { x: tp.x, y: tp.y, z: tp.z };
        }
      }
    }
  }

  clear() {
    for (const m of [...this.decals]) this.remove(m);
  }
}
