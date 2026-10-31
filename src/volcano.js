import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { std, canvasTex, sign, speckle } from './buildkit.js';
import { Car } from './carphys.js';
import { ITEM_BY_ID } from './items.js';
import { pistolModel, magnumModel, smgModel, shotgunModel, rifleModel, combatShotgunModel, sniperModel, lmgModel } from './gunmodels.js';
import { LAUNDER_CUT, moneyBagMesh } from './loot.js';
import { GLOW } from './effects.js';
import { marcosLogo } from './marcos.js';
import { buildFigure } from './figure.js';

// Inside Mount Ridgeback. The volcano is hollow: a tunnel from the summit car park (behind a blast
// door) runs into a great cone-shaped cavern with a concrete floor, lit by the lava glowing up
// through the grating that cages the pit in the middle, and a little vent open to the sky right at
// the top. Round the walls is a crime base: a garage for your cars, the armoury, the counting room
// (where hot money from a job is counted and cleaned), the quarters (sleep here and it's where you
// wake up), the control room with the heist board, a lounge with a bar, and a workshop. In the
// middle of the grating is the disposal chute: whatever goes down it lands in the lava, which
// throws up a great spout of it (it's all for show: the spout won't hurt you).

const SAVE_KEY = 'physick.base.v1';
const GUNS = [
  { id: 'pistol', price: 450, ammo: ['pistolAmmo', 24] }, { id: 'smg', price: 1200, ammo: ['smgAmmo', 90] }, { id: 'shotgun', price: 900, ammo: ['shells', 16] },
  { id: 'magnum', price: 2500, ammo: ['magnumAmmo', 18] }, { id: 'combat', price: 4800, ammo: ['shells', 24] }, { id: 'rifle', price: 6000, ammo: ['rifleAmmo', 90] },
  { id: 'sniper', price: 9000, ammo: ['sniperAmmo', 15] }, { id: 'lmg', price: 13000, ammo: ['rifleAmmo', 200] },
];
const AMMO = [['pistolAmmo', 48], ['smgAmmo', 180], ['shells', 32], ['magnumAmmo', 36], ['rifleAmmo', 180], ['sniperAmmo', 20]];

// a little Kit: boxes in a rotated frame, with matching colliders
class Kit {
  constructor(parent, sb, x, y, z, yaw) {
    this.sb = sb; this.root = new THREE.Group(); this.root.position.set(x, y, z); this.root.rotation.y = yaw; parent.add(this.root); this.root.updateMatrixWorld(true);
    this.q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); this.yaw = yaw;
  }
  world(x, y, z) { return this.root.localToWorld(new THREE.Vector3(x, y, z)); }
  box(w, h, d, x, y, z, m, solid = true, rotY = 0) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.rotation.y = rotY; o.castShadow = true; o.receiveShadow = true; this.root.add(o);
    if (solid) { const p = this.world(x, y + h / 2, z); const q = rotY ? this.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)) : this.q; this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, p.y, p.z).setRotation(q)); }
    return o;
  }
  cyl(r, h, x, y, z, m, seg = 12, r2 = r) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m); o.position.set(x, y + h / 2, z); o.castShadow = true; this.root.add(o); return o; }
  plane(w, h, x, y, z, rotY, m) { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.set(x, y, z); o.rotation.y = rotY; this.root.add(o); return o; }
  add(o, x, y, z, rotY = 0) { o.position.set(x, y, z); o.rotation.y = rotY; this.root.add(o); return o; }
}

const lit = (c, k = 0.25, extra = {}) => { const m = std({ color: c, roughness: 0.75, ...extra }); m.emissive = new THREE.Color(c); m.emissiveIntensity = k; return m; };

export class VolcanoBase {
  constructor(game, sb, rb) {
    this.game = game; this.sb = sb; this.rb = rb;
    this.V = new THREE.Vector3(rb.peak.x, rb.summitY, rb.peak.z);
    this.Y = rb.summitY;
    this.K = rb.crater;
    this.R = this.K.cave;
    this.T = rb.tunnel;
    this.thetaT = Math.atan2(-this.T.u.x, -this.T.u.z); // the direction of the tunnel, from the middle
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.spots = [];
    this.people = [];
    this.splashes = [];
    try { this.save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') || {}; } catch { this.save = {}; }
    this.save.stored ||= [];
    this.mats();
    this.build();
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage unavailable */ } }

  // a point on the floor at radius r, angle a (radians from the tunnel), and the yaw that faces the middle
  at(r, a) { const t = this.thetaT + a; return new THREE.Vector3(this.V.x + Math.sin(t) * r, this.Y, this.V.z + Math.cos(t) * r); }
  inward(a) { return this.thetaT + a + Math.PI; }
  inside(p, m = 0) { return Math.hypot(p.x - this.V.x, p.z - this.V.z) < this.R + m && p.y > this.Y - 30 && p.y < this.Y + 60; }

  mats() {
    const rockTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#463e38'; c.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '120,90,70'},${0.1 + Math.random() * 0.25})`; const s = 4 + Math.random() * 18; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, s, s * 0.6, Math.random() * 3, 0, 7); c.fill(); } }, [12, 3]);
    const concTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#8e8b84'; c.fillRect(0, 0, w, h); speckle(c, w, h, 2500, 0.1); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); }, [18, 18]);
    const grate = canvasTex(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#5a5e62'; for (let i = 0; i < w; i += 8) { c.fillRect(i, 0, 2, h); c.fillRect(0, i, w, 2); } c.fillStyle = '#7a7e82'; c.fillRect(0, 0, w, 3); c.fillRect(0, 0, 3, h); });
    grate.repeat.set(10, 10);
    const lava = canvasTex(256, 256, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); g.addColorStop(0, '#ffe080'); g.addColorStop(1, '#ff6a10'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${60 + Math.random() * 60},10,0,${0.4 + Math.random() * 0.4})`; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 5 + Math.random() * 16, Math.random() * 3, 0, 7); c.fill(); }
    }, [2, 2]);
    this.M = {
      rock: Object.assign(std({ map: rockTex, roughness: 1 }), { side: THREE.DoubleSide }),
      rockLit: Object.assign(std({ map: rockTex, color: 0xb8aea4, roughness: 1, emissive: 0x3a1c0c, emissiveIntensity: 0.6 }), { side: THREE.DoubleSide }),
      conc: Object.assign(std({ map: concTex, roughness: 0.9 }), { emissive: new THREE.Color(0x1a1816), emissiveIntensity: 1 }),
      wall: lit(0x7a7670, 0.25), dark: lit(0x2a2c30, 0.1), steel: lit(0x8a9096, 0.15, { metalness: 0.6, roughness: 0.35 }), yellow: lit(0xe8b830, 0.3), red: lit(0xb3261e, 0.3),
      grate: new THREE.MeshStandardMaterial({ map: grate, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5, emissive: 0x401808, emissiveIntensity: 0.5 }),
      lava: new THREE.MeshBasicMaterial({ map: lava, color: 0xffffff }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), screen: new THREE.MeshBasicMaterial({ color: 0x3a8ac8 }),
      wood: lit(0x7a5434, 0.2), felt: lit(0x1f6a3a, 0.2), leather: lit(0x5a2a1a, 0.18), cash: lit(0x3a7a3a, 0.3), white: lit(0xe8e8e2, 0.3), olive: lit(0x4a5a3a, 0.2),
    };
  }

  build() {
    const g = this.group, sb = this.sb, V = this.V, Y = this.Y, R = this.R, K = this.K, M = this.M;
    const rb = this.rb, coneIn = (r) => rb.coneAt(r) - K.thick; // the cavern roof
    const WH = coneIn(R) - Y; // the height of the walls
    const gap = Math.asin(6.8 / R);
    // ---- the cavern: the wall round the floor, the cone-shaped roof, the vent at the top ----
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, WH, 72, 3, true, this.thetaT + gap, Math.PI * 2 - gap * 2), M.rockLit); wall.position.set(V.x, Y + WH / 2, V.z); g.add(wall);
    const lint = new THREE.Mesh(new THREE.CylinderGeometry(R, R, WH - 7.6, 6, 1, true, this.thetaT - gap, gap * 2), M.rockLit); lint.position.set(V.x, Y + 7.6 + (WH - 7.6) / 2, V.z); g.add(lint);
    const prof = []; for (let k = 0; k <= 24; k++) { const r = R - ((R - K.oculus) * k) / 24; prof.push(new THREE.Vector2(r, coneIn(r) - Y)); }
    const roof = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), M.rockLit); roof.position.set(V.x, Y, V.z); g.add(roof);
    const ventTop = rb.heightAt(V.x + K.oculus + 2, V.z) + 0.5, ventBot = coneIn(K.oculus);
    this.ventTop = ventTop;
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(K.oculus, K.oculus, ventTop - ventBot, 24, 1, true), M.rock); vent.position.set(V.x, (ventTop + ventBot) / 2, V.z); g.add(vent);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(K.oculus + 1.2, 1.6, 8, 24), M.rock); lip.rotation.x = Math.PI / 2; lip.position.set(V.x, ventTop - 0.6, V.z); g.add(lip); lip.userData.noMerge = true; this.ventLip = lip;
    // (the wall's solid; the roof's out of reach)
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gap + 0.03) continue;
      const p = this.at(R + 0.6, a), L = (2 * Math.PI * (R + 0.6)) / 48 + 0.4;
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(L / 2, WH / 2, 0.6).setTranslation(p.x, Y + WH / 2, p.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.thetaT + a)));
    }
    // ---- the floor: concrete, with the caged lava pit in the middle ----
    const PIT = 12, CHUTE = 3.4;
    this.pit = PIT; this.chute = CHUTE; this.lavaY = Y - 17;
    const ring = new THREE.RingGeometry(PIT, R + 0.5, 72, 1); ring.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(ring, M.conc); floor.position.set(V.x, Y + 0.02, V.z); floor.receiveShadow = true; g.add(floor);
    const grateG = new THREE.RingGeometry(CHUTE, PIT, 48, 2); grateG.rotateX(-Math.PI / 2);
    const gr = new THREE.Mesh(grateG, M.grate); gr.position.set(V.x, Y + 0.04, V.z); g.add(gr);
    // the grating's frame: a beam ring and radial joists
    const steelRing = (r, w, y) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 64), M.steel); t.rotation.x = Math.PI / 2; t.position.set(V.x, y, V.z); g.add(t); };
    steelRing(PIT, 0.25, Y - 0.1); steelRing(CHUTE, 0.18, Y - 0.05); steelRing((PIT + CHUTE) / 2, 0.12, Y - 0.12);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, mid = this.at((PIT + CHUTE) / 2, a); const j = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, PIT - CHUTE), M.steel); j.position.set(mid.x, Y - 0.16, mid.z); j.rotation.y = this.thetaT + a; g.add(j); }
    // hazard stripes round the pit's edge
    const stripes = canvasTex(256, 16, (c, w, h) => { c.fillStyle = '#e8b830'; c.fillRect(0, 0, w, h); c.fillStyle = '#151515'; for (let x = -16; x < w; x += 16) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 8, h); c.lineTo(x + 16, 0); c.lineTo(x + 8, 0); c.fill(); } }, [24, 1]);
    const hz = new THREE.RingGeometry(PIT, PIT + 0.6, 72, 1); hz.rotateX(-Math.PI / 2);
    { const uv = hz.attributes.uv, P = hz.attributes.position; for (let i = 0; i < uv.count; i++) { const a = Math.atan2(P.getX(i), P.getZ(i)); uv.setXY(i, (a / (Math.PI * 2) + 0.5), Math.hypot(P.getX(i), P.getZ(i)) > PIT + 0.3 ? 1 : 0); } }
    const hzm = new THREE.Mesh(hz, std({ map: stripes, emissive: 0xffffff, emissiveMap: stripes, emissiveIntensity: 0.25 })); hzm.position.set(V.x, Y + 0.035, V.z); g.add(hzm);
    // walkable everywhere but the chute: a ring collider (a trimesh with a hole)
    { const rg = new THREE.RingGeometry(CHUTE, R + 0.8, 64, 1); rg.rotateX(-Math.PI / 2); const P = rg.attributes.position, v = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { v[i * 3] = P.getX(i) + V.x; v[i * 3 + 1] = Y; v[i * 3 + 2] = P.getZ(i) + V.z; } sb.addStaticCollider(RAPIER.ColliderDesc.trimesh(v, new Uint32Array(rg.index.array))); }
    // the pit below the grating: its rock walls, the lava, and its light
    const pw = new THREE.Mesh(new THREE.CylinderGeometry(PIT, PIT - 1, 18, 40, 1, true), M.rockLit); pw.position.set(V.x, Y - 9, V.z); g.add(pw);
    const lav = new THREE.Mesh(new THREE.CircleGeometry(PIT - 0.8, 40), M.lava); lav.rotation.x = -Math.PI / 2; lav.position.set(V.x, this.lavaY, V.z); g.add(lav);
    this.lavaMesh = lav;
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(1, PIT).setTranslation(V.x, this.lavaY - 1.2, V.z)); // (things land in it, not through it)
    const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff7a20, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })); glowS.scale.set(34, 34, 1); glowS.position.set(V.x, this.lavaY + 4, V.z); g.add(glowS);
    this.lavaLight = new THREE.PointLight(0xff6a20, 4, 75, 1.2); this.lavaLight.position.set(V.x, Y + 2, V.z); g.add(this.lavaLight);
    for (const a of [0.9, 3.0, 5.1]) { const p = this.at(R * 0.55, a), L = new THREE.PointLight(0xfff0d8, 1.6, 70, 1.3); L.position.set(p.x, Y + 13, p.z); g.add(L); }
    // the disposal chute: a steel funnel down through the grating, a rail round it (open on one side)
    const funnel = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(CHUTE, 0), new THREE.Vector2(CHUTE - 0.6, -2), new THREE.Vector2(1.9, -6)], 24), Object.assign(M.steel.clone(), { side: THREE.DoubleSide })); funnel.position.set(V.x, Y, V.z); g.add(funnel);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.PI / 16; if (k === 0 || k === 15) continue; // the open side faces the tunnel
      const p = this.at(CHUTE + 0.35, a);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), M.yellow); post.position.set(p.x, Y + 0.55, p.z); g.add(post);
      const L = (2 * Math.PI * (CHUTE + 0.35)) / 16, rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.07, 0.07), M.yellow); const m = this.at(CHUTE + 0.35, a + Math.PI / 16); rail.position.set(m.x, Y + 1.08, m.z); rail.rotation.y = this.thetaT + a + Math.PI / 16 + Math.PI / 2; g.add(rail);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(L / 2, 0.55, 0.06).setTranslation(m.x, Y + 0.55, m.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.thetaT + a + Math.PI / 16 + Math.PI / 2)));
    }
    { const p = this.at(CHUTE + 1.6, -0.55); sign(g, 'DISPOSAL ▼', p.x, Y + 1.7, p.z, this.inward(-0.55), { w: 1.8, h: 0.45, bg: '#b3261e', fg: '#ffffff', post: Y }); }
    // a ring road painted on the concrete
    const line = (r, w, col) => { const rr = new THREE.RingGeometry(r - w / 2, r + w / 2, 96, 1); rr.rotateX(-Math.PI / 2); const m = new THREE.Mesh(rr, new THREE.MeshBasicMaterial({ color: col })); m.position.set(V.x, Y + 0.04, V.z); g.add(m); };
    line(PIT + 3, 0.15, 0xd8d0b0); line(31.5, 0.15, 0xd8d0b0); line(22, 0.18, 0xd8a830);
    // hanging industrial lamps in two rings
    for (const [r, n] of [[22, 10], [36, 16]]) for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.15, p = this.at(r, a), top = coneIn(r);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, top - (Y + 9)), M.dark); cord.position.set(p.x, (top + Y + 9) / 2, p.z); g.add(cord);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 0.6, 12, 1, true), M.dark); shade.position.set(p.x, Y + 8.8, p.z); g.add(shade);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), M.lamp); bulb.rotation.x = Math.PI / 2; bulb.position.set(p.x, Y + 8.52, p.z); g.add(bulb);
    }
    this.buildCage();
    this.buildHunter();
    this.buildTunnel();
    this.buildRooms();
    this.buildAlcove();
    // seen from far off (through the haze): the mountain's shape, so you can pick it out from the city.
    // (A coarse copy of the real ground, just behind it, so the two never fight.)
    { const NA = 72, NR = 26, pos = [], idx = [];
      for (let i = 0; i <= NR; i++) for (let j = 0; j < NA; j++) { const th = (j / NA) * Math.PI * 2, r = 0.5 + (330 * i) / NR, x = V.x + Math.sin(th) * r, z = V.z + Math.cos(th) * r; pos.push(x, rb.heightAt(x, z) - 1.5 - Math.max(0, r - 260) * 0.3, z); }
      for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA; idx.push(a, c, b, b, c, d); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      const far = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3e3f46, fog: false, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      far.visible = false; far.renderOrder = -1; this.game.scene.add(far); this.far = far; }
    this.buildSummit();
    // the eruption: big glowing blobs out of the vent, and its light on the mountainside
    this.blobs = [];
    this.ventLight = new THREE.PointLight(0xff6a20, 0, 400, 1.2); this.ventLight.position.set(V.x, ventTop + 15, V.z); this.game.scene.add(this.ventLight);
  }

  // out of the top: the spout keeps going, right out of the vent
  erupt() {
    const V = this.V, top = this.ventTop;
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: [0xffd060, 0xff7a20, 0xff4a10][i % 3], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const sc = 12 + Math.random() * 16; s.scale.set(sc, sc, 1); s.position.set(V.x, top, V.z); this.game.scene.add(s);
      const a = Math.random() * 6.28, out = Math.random() * 9;
      this.blobs.push({ s, v: new THREE.Vector3(Math.cos(a) * out * 2, 40 + Math.random() * 40, Math.sin(a) * out * 2), t: -i * 0.03, life: 3.5 + Math.random() * 1.5 });
    }
    // a column of it, right up out of the vent
    const col = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 5.5, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.95, side: THREE.DoubleSide, fog: false }));
    col.position.set(V.x, top, V.z); this.game.scene.add(col);
    this.ventCol = { m: col, t: 0 };
    this.ventLight.intensity = 30;
  }

  // the camera pulls right out, round the mountain, to watch it go up
  startCinema() {
    const g = this.game;
    if (this.cine) { this.cine.t = Math.min(this.cine.t, 1); return; }
    const c = g.camera.position, a = Math.atan2(c.x - this.V.x, c.z - this.V.z);
    this.cine = { t: 0, a0: Number.isFinite(a) ? a : 0, dur: 6 };
  }

  // the top of the mountain: the crater glowing round the vent, cracks of lava down from the rim,
  // and a plume of smoke you can see from the city
  buildSummit() {
    const rb = this.rb, V = this.V, K = this.K, g = this.game.scene;
    const glowM = new THREE.MeshBasicMaterial({ color: 0xff6a18 });
    this.ventLip?.material && (this.ventLip.material = glowM);
    const top = this.ventTop;
    const pool = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xff5a10, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })); pool.scale.set(40, 22, 1); pool.position.set(V.x, top + 4, V.z); g.add(pool);
    this.summitGlow = pool;
    // the fissures: glowing ribbons from the rim a long way down, on three sides (above the footpath)
    const fis = new THREE.MeshBasicMaterial({ color: 0xff7a20 }), fis2 = new THREE.MeshBasicMaterial({ color: 0xffc040 });
    for (const [a0, len] of [[rb.coneAz + 2.2, 70], [rb.coneAz + 3.6, 85], [rb.coneAz + 4.9, 60]]) {
      const pts = [];
      for (let r = K.rim - 2; r < K.rim + len; r += 2) { const th = a0 + Math.sin(r * 0.07) * 0.06, x = V.x + Math.sin(th) * r, z = V.z + Math.cos(th) * r; pts.push(new THREE.Vector3(x, rb.heightAt(x, z) + 0.25, z)); }
      for (const [w, m, lift] of [[2.4, fis, 0], [0.9, fis2, 0.06]]) {
        const v = [], ix = [];
        pts.forEach((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1, ww = w * (1 - i / pts.length * 0.8); v.push(p.x - dz / l * ww / 2, p.y + lift, p.z + dx / l * ww / 2, p.x + dz / l * ww / 2, p.y + lift, p.z - dx / l * ww / 2); if (i) ix.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1); });
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setIndex(ix);
        const ribbon = new THREE.Mesh(geo, m); ribbon.material.side = THREE.DoubleSide; ribbon.userData.noMerge = true; g.add(ribbon);
      }
    }
    // the plume: big soft puffs rising and drifting off the summit (seen through the haze)
    const smoke = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(120,116,112,0.85)'); gr.addColorStop(0.6, 'rgba(110,106,104,0.4)'); gr.addColorStop(1, 'rgba(100,100,100,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    this.plume = [];
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
      sp.userData.t = i / 14; g.add(sp); this.plume.push(sp);
    }
  }

  updatePlume(dt) {
    const V = this.V, top = this.ventTop, cam = this.game.camera.position, d = Math.hypot(cam.x - V.x, cam.z - V.z);
    const haze = Math.max(0.35, Math.min(1, 1 - (d - 2500) / 3000)); // (fainter a long way off)
    for (const sp of this.plume) {
      const u = (sp.userData.t = (sp.userData.t + dt * 0.012) % 1);
      const s = 18 + u * 110;
      sp.scale.set(s, s, 1);
      sp.position.set(V.x + u * u * 260 + Math.sin(u * 9 + sp.id) * 6, top + 10 + u * 230, V.z + u * 80 + Math.cos(u * 7 + sp.id) * 6);
      sp.material.opacity = Math.sin(Math.PI * Math.min(1, u * 1.4)) * 0.55 * haze;
    }
    if (this.summitGlow) this.summitGlow.material.opacity = 0.75 + Math.sin(this.t * 1.7) * 0.15;
  }

  cinema(dt, cam) {
    const C = this.cine; if (!C) return false;
    C.t += dt;
    if (C.t > C.dur) { this.cine = null; return false; }
    const k = Math.min(1, C.t / 1.6), e = 1 - Math.pow(1 - k, 3); // (a fast pull-out, then a slow drift round)
    const dist = 60 + e * 330, a = C.a0 + C.t * 0.12, top = this.ventTop;
    cam.position.set(this.V.x + Math.sin(a) * dist, this.Y + 40 + e * (top - this.Y + 10), this.V.z + Math.cos(a) * dist);
    cam.lookAt(this.V.x, top + 18 * e, this.V.z);
    cam.updateMatrixWorld();
    return true;
  }

  // ---- up the outside: a walkway bolted to the cliff, spiralling up from the car park to the alcove ----
  buildAlcove() {
    const rb = this.rb, A = rb.alcove, V = this.V, Y = this.Y, M = this.M, sb = this.sb, g = this.group;
    if (!A) return;
    const pts = rb.walkway.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    this.walk = pts;
    const deckM = Object.assign(M.grate.clone(), { emissiveIntensity: 0.1 }), railM = M.yellow, postM = M.dark;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), pitch = -Math.atan2(b.y - a.y, L);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), len = Math.hypot(L, b.y - a.y) + 0.15;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, len), deckM); deck.position.copy(mid); deck.quaternion.copy(q); g.add(deck);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.2, 0.08, len / 2).setTranslation(mid.x, mid.y - 0.02, mid.z).setRotation(q));
      // the outer rail (away from the mountain) and a low inner one
      // (sideways from the walkway, whichever way it's running: the outer side's the one away from the mountain)
      let nx = dz / L, nz = -dx / L; if (nx * (mid.x - V.x) + nz * (mid.z - V.z) < 0) { nx = -nx; nz = -nz; }
      for (const [off, h] of [[1.15, 1.05], [-1.15, 0.5]]) {
        const rx = mid.x + nx * off, rz = mid.z + nz * off;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), railM); rail.position.set(rx, mid.y + h, rz); rail.quaternion.copy(q); g.add(rail);
        sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.05, h / 2, len / 2).setTranslation(rx, mid.y + h / 2, rz).setRotation(q));
        if (i % 5 === 0) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h), postM); post.position.set(rx, mid.y + h / 2, rz); g.add(post); }
      }
      if (i % 16 === 0) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.6), postM); br.position.set(mid.x - nx * 0.3, mid.y - 0.5, mid.z - nz * 0.3); br.rotation.y = Math.atan2(nx, nz); br.rotation.x = 0.6; g.add(br); } // brackets into the rock
    }
    { const p = pts[0]; sign(g, 'SKYHIGH CHUTES & GLIDERS · FOOTPATH ↑', p.x, p.y + 2.4, p.z, Math.atan2(V.x - p.x, V.z - p.z) + Math.PI, { w: 5.5, h: 0.7, bg: '#2a6ac8', fg: '#ffffff', post: p.y }); }
    // ---- the alcove: a ledge in a niche cut into the spire ----
    const k = new Kit(g, sb, A.x, A.y, A.z, A.th); // (local: +z out from the mountain, x across)
    const wood = M.wood;
    k.box(15, 0.3, 13, 0, -0.3, 0.5, M.conc); // the floor, out over the edge
    k.box(15, 1.05, 0.12, 0, 0, 6.95, M.yellow); for (const s of [-1, 1]) k.box(0.12, 1.05, 7, s * 7.45, 0, 3.5, M.yellow); // the rail round it
    // a rock overhang over the back
    const roof = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 8, 0, Math.PI, 0, Math.PI / 2), M.rock); roof.scale.set(1, 0.45, 1.0); roof.rotation.y = -Math.PI / 2; k.add(roof, 0, 4.2, -4);
    // the shop: a booth in the back of the niche
    k.box(6, 3.0, 3, -2.5, 0, -4.5, lit(0x2a6ac8, 0.25)); k.box(6.4, 0.25, 3.4, -2.5, 3.0, -4.5, lit(0xf2f2ee, 0.3), false);
    k.box(4.4, 1.05, 0.6, -2.5, 0, -2.75, wood); k.box(4.6, 0.06, 0.8, -2.5, 1.05, -2.75, M.dark, false);
    k.plane(5.2, 0.8, -2.5, 3.6, -2.95, 0, new THREE.MeshBasicMaterial({ map: canvasTex(512, 80, (c, W, H) => { c.fillStyle = '#2a6ac8'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.fillText('SKYHIGH · CHUTES & GLIDERS', W / 2, 52); }) }));
    for (let i = 0; i < 3; i++) { const wing = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.2, 3), lit([0xe8b830, 0xc8201e, 0x2a6ac8][i], 0.3)); wing.scale.set(1, 1, 0.5); wing.rotation.set(Math.PI / 2, 0, Math.PI); k.add(wing, 2.8 + i * 1.2, 2.2 + i * 0.25, -5.2); }
    for (let i = 0; i < 4; i++) k.box(0.45, 0.6, 0.35, -4.2 + i * 0.55, 1.1, -2.85, lit([0xc8201e, 0xe8e8e2, 0xc8201e, 0x2a6ac8][i], 0.3), false); // parachute packs
    // the launch ramp, out over the drop, and a windsock
    const ramp = k.box(3.2, 0.2, 6, 3.6, 0.1, 9.2, wood, false); ramp.rotation.x = 0.16;
    { const p = k.world(3.6, 0.6, 9.2), q = k.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.16)); sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.6, 0.1, 3).setTranslation(p.x, p.y - 0.4, p.z).setRotation(q)); }
    k.box(0.1, 0.05, 6, 2.0, 0.6, 9.2, M.yellow, false); k.box(0.1, 0.05, 6, 5.2, 0.6, 9.2, M.yellow, false);
    k.cyl(0.05, 5, -6.5, 0, 5.5, M.dark, 6); const sock = k.cyl(0.25, 1.4, -6.5, 4.4, 6.2, lit(0xe86a20, 0.4), 8, 0.1); sock.rotation.x = Math.PI / 2; this.sock = sock;
    this.alcoveShop = k.world(-2.5, 0, -1.8); this.alcoveClerk = k.world(-2.5, 0, -3.8); this.alcoveYaw = k.yaw + Math.PI;
    this.alcove = k.world(0, 0, 2);
  }

  // ---- a cage round the pit: a tall cylinder of grating, so nobody walks (or drives) in. The only way
  // in is the disposal hatch on the tunnel side: E there with a body or something in your hand.
  buildCage() {
    const g = this.group, sb = this.sb, V = this.V, Y = this.Y, M = this.M;
    const CR = this.pit + 0.7, H = 9, hatch = 1.9 / CR, hy0 = 0.95, hy1 = 2.05; // (the hatch: a slot at chest height, too small to climb through)
    this.cageR = CR;
    const gm = M.grate.clone(); gm.map = M.grate.map.clone(); gm.map.repeat.set(70, 7); gm.map.needsUpdate = true; gm.emissiveIntensity = 0.7;
    const t0 = this.thetaT + hatch / 2, sweep = Math.PI * 2 - hatch;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(CR, CR, H, 96, 1, true, t0, sweep), gm); wall.position.set(V.x, Y + H / 2, V.z); g.add(wall);
    for (const [y0, y1] of [[0, hy0], [hy1, H]]) { const piece = new THREE.Mesh(new THREE.CylinderGeometry(CR, CR, y1 - y0, 4, 1, true, this.thetaT - hatch / 2, hatch), gm); piece.position.set(V.x, Y + (y0 + y1) / 2, V.z); g.add(piece); }
    // the frame: rings top, middle and bottom, and posts
    for (const y of [0.1, hy0, H / 2, H]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(CR, 0.12, 6, 96), M.steel); ring.rotation.x = Math.PI / 2; ring.position.set(V.x, Y + y, V.z); g.add(ring); }
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2 + 0.13, p = this.at(CR, a); const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, H, 0.22), M.steel); post.position.set(p.x, Y + H / 2, p.z); post.rotation.y = this.thetaT + a; g.add(post); }
    // the hatch: a yellow frame, a sloped steel lip and a sign
    { const k = new Kit(g, sb, ...this.at(CR + 0.05, 0).toArray(), this.thetaT); // (local +z: out from the middle)
      k.box(2.2, 0.14, 0.3, 0, hy0 - 0.14, 0, M.yellow, false); k.box(2.2, 0.14, 0.3, 0, hy1, 0, M.yellow, false);
      for (const s of [-1, 1]) k.box(0.14, hy1 - hy0 + 0.14, 0.3, s * 1.03, hy0 - 0.07, 0, M.yellow, false);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 1.2), M.steel); lip.rotation.x = -0.35; k.add(lip, 0, hy0 - 0.15, -0.55); /* (tipping in) */ }
    { const p = this.at(CR + 0.1, 0.13); sign(g, 'DISPOSAL HATCH · E', p.x, Y + 2.7, p.z, this.inward(0.13) + Math.PI, { w: 2.4, h: 0.45, bg: '#b3261e', fg: '#ffffff' }); }
    this.hatch = this.at(CR + 1.0, 0);
    // (solid: a ring of panels, the hatch slot left open between its sill and lintel)
    const N = 64;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2, p = this.at(CR, a), L = (2 * Math.PI * CR) / N + 0.15, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.thetaT + a); // (along the curve)
      const inHatch = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < hatch / 2 + (Math.PI / N);
      const spans = inHatch ? [[0, hy0], [hy1, H]] : [[0, H]];
      for (const [y0, y1] of spans) sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(L / 2, (y1 - y0) / 2, 0.15).setTranslation(p.x, Y + (y0 + y1) / 2, p.z).setRotation(q));
    }
    // (and a lid, so nothing's thrown over the top)
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(0.1, CR).setTranslation(V.x, Y + H + 0.1, V.z));
  }

  // E at the hatch: down the chute it goes
  dispose() {
    const g = this.game, V = this.V, drop = new THREE.Vector3(V.x, this.Y - 3, V.z);
    if (g.dragging) {
      const rd = g.dragging.prop?.ragdoll; g.endDrag(false);
      if (rd) { for (const p of rd.parts) { const t = p.body.translation(); p.body.setTranslation({ x: drop.x + (t.x - rd.torso.body.translation().x) * 0.3, y: drop.y + Math.random(), z: drop.z + (t.z - rd.torso.body.translation().z) * 0.3 }, true); p.body.setLinvel({ x: 0, y: -4, z: 0 }, true); } }
      g.sfx.play('thud'); g.hud.toast('Down the chute…', 0xff8a3a); return;
    }
    if (g.held) {
      const def = g.held; g.clearHand();
      const prop = g.portSandbox.spawn(def, drop, new THREE.Quaternion(), { noHistory: true }); prop.body?.setLinvel?.({ x: 0, y: -4, z: 0 }, true);
      g.sfx.play('drop'); g.hud.toast(`The ${def.name.toLowerCase()} goes down the chute`, 0xff8a3a);
    }
  }

  // ---- by the cage, a curved desk: the bounty hunter who hands out contracts. Nobody knows his face;
  // nobody's ever managed to put a bullet in him either.
  buildHunter() {
    const g = this.group, sb = this.sb, V = this.V, Y = this.Y, M = this.M;
    const a = Math.PI, r = this.pit + 4.6; // (across the cage from the tunnel)
    const top = new THREE.Mesh(new THREE.RingGeometry(r - 0.45, r + 0.45, 32, 1, this.thetaT + a - 0.42 - Math.PI / 2, 0.84), M.wood); // (the desktop: an arc)
    top.rotation.x = -Math.PI / 2; top.position.set(V.x, Y + 0.92, V.z);
    // RingGeometry's angle runs the other way round after the flip: rebuild the arc by points instead
    top.geometry.dispose(); top.geometry = (() => { const sh = new THREE.Shape(), n = 24, a0 = a - 0.42, a1 = a + 0.42; for (let i = 0; i <= n; i++) { const p = this.at(r + 0.45, a0 + (a1 - a0) * i / n); i ? sh.lineTo(p.x - V.x, -(p.z - V.z)) : sh.moveTo(p.x - V.x, -(p.z - V.z)); } for (let i = n; i >= 0; i--) { const p = this.at(r - 0.45, a0 + (a1 - a0) * i / n); sh.lineTo(p.x - V.x, -(p.z - V.z)); } return new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }); })();
    g.add(top);
    for (let i = 0; i < 12; i++) { // the front panel, in facets
      const a0 = a - 0.42 + (0.84 * i) / 12, a1 = a0 + 0.84 / 12, p0 = this.at(r + 0.4, a0), p1 = this.at(r + 0.4, a1), L = p0.distanceTo(p1) + 0.03, m = p0.clone().add(p1).multiplyScalar(0.5);
      const pan = new THREE.Mesh(new THREE.BoxGeometry(L, 0.92, 0.08), M.dark); pan.position.set(m.x, Y + 0.46, m.z); pan.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z) + Math.PI / 2; g.add(pan);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(L / 2, 0.55, 0.06).setTranslation(m.x, Y + 0.55, m.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pan.rotation.y)));
      if (i % 3 === 1) { const strip = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xb3261e })); strip.position.set(m.x, Y + 0.82, m.z); strip.rotation.y = pan.rotation.y; strip.translateZ(-0.05); g.add(strip); }
    }
    // on the desk: a lamp, a stack of files, a wanted poster pinned to the front, a glass
    const on = (rr, aa, y = 1.0) => this.at(rr, aa).setY(Y + y);
    { const p = on(r, a + 0.3); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 12), M.dark); base.position.copy(p); g.add(base); const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), M.dark); arm.position.copy(p).add(new THREE.Vector3(0, 0.25, 0)); g.add(arm); const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 12, 1, true), std({ color: 0x1f5a3a, side: THREE.DoubleSide })); shade.position.copy(p).add(new THREE.Vector3(0, 0.52, 0)); g.add(shade); const bulb = new THREE.PointLight(0xffd8a0, 1.4, 6, 1.6); bulb.position.copy(p).add(new THREE.Vector3(0, 0.45, 0)); g.add(bulb); }
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.24), std({ color: [0xd8c8a0, 0xb8a070, 0xd8c8a0, 0x8a3a2a][i] })); f.position.copy(on(r, a - 0.25, 1.02 + i * 0.032)); f.rotation.y = i * 0.15; g.add(f); }
    { const p = on(r - 0.1, a - 0.08); const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 10), std({ color: 0xc8a050, roughness: 0.2 })); gl.position.copy(p).add(new THREE.Vector3(0, 0.05, 0)); g.add(gl); }
    { const p = this.at(r + 0.46, a); sign(g, 'CONTRACTS', p.x, Y + 0.62, p.z, this.inward(a) + Math.PI, { w: 1.4, h: 0.32, bg: '#141414', fg: '#b3261e' }); }
    // him: a long dark coat, a wide-brimmed hat pulled down, and where his face should be, shadow
    const fig = buildFigure({ shirt: 0x4a3a2c, pants: 0x2a2622, skin: 0x030303, hat: 'cowboy', hatColor: 0x3a2a1e });
    const pos = this.at(r - 0.85, a);
    fig.root.scale.setScalar(1.18); fig.root.position.set(pos.x, Y + 0.83 * 1.18, pos.z); fig.root.rotation.y = this.inward(a) + Math.PI; // (facing out, at you)
    const P = fig.parts, coat = std({ color: 0x4a3a2c, roughness: 0.9 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.75, 0.3), coat); tail.position.set(0, -0.5, 0); P.torso.add(tail); // the coat's skirts
    for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshBasicMaterial({ color: 0x8a1a10 })); eye.position.set(s * 0.05, 0.02, 0.15); P.head.add(eye); } // (just a glint)
    fig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.game.scene.add(fig.root);
    { const sp = new THREE.SpotLight(0xffc890, 14, 9, 0.6, 0.6, 1.5); const sp0 = this.at(r + 2.5, a); sp.position.set(sp0.x, Y + 4.2, sp0.z); sp.target.position.set(pos.x, Y + 1.3, pos.z); g.add(sp, sp.target); } // (lit from the front: his face stays in shadow under the brim)
    this.hunter = { fig, pos: pos.clone(), yaw: fig.root.rotation.y, t: 0 };
    sb.addStaticCollider(RAPIER.ColliderDesc.capsule(0.55, 0.32).setTranslation(pos.x, Y + 0.95, pos.z)); // (bullets just hit the wall behind him… or so it seems)
    this.hunterDesk = this.at(r + 1.2, a);
  }

  updateHunter(dt) {
    const H = this.hunter; if (!H) return;
    H.t += dt;
    const p = this.game.shorePlayer.body.translation(), d = Math.hypot(p.x - H.pos.x, p.z - H.pos.z);
    // he turns his head to follow you when you're near, and his eyes catch the light now and then
    const want = d < 14 ? Math.atan2(p.x - H.pos.x, p.z - H.pos.z) - H.yaw : 0;
    const head = H.fig.parts.head, cur = head.rotation.y, dd = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    head.rotation.y = cur + Math.max(-0.9, Math.min(0.9, dd)) * Math.min(1, dt * 3) * (Math.abs(want) < 1.1 ? 1 : 0);
    H.fig.parts.torso.rotation.x = Math.sin(H.t * 0.8) * 0.015;
  }

  // ---- the tunnel from the summit car park, and its blast door ----
  buildTunnel() {
    const T = this.T, Y = this.Y, M = this.M, sb = this.sb;
    const t0 = T.portal - 2.6, t1 = T.len + 1.5, L = t1 - t0, tm = (t0 + t1) / 2;
    const yaw = Math.atan2(T.u.x, T.u.z);
    const k = new Kit(this.group, sb, T.a.x + T.u.x * tm, Y, T.a.z + T.u.z * tm, yaw);
    this.tk = k;
    // (local: z runs along the tunnel, into the mountain; x across)
    k.box(13.6, 0.6, L, 0, -0.6, 0, M.conc); // the floor
    for (const s of [-1, 1]) { k.box(0.6, 7.6, L, s * 6.8, 0, 0, M.wall); k.box(0.2, 1.0, L, s * 6.4, 0, 0, M.yellow, false); }
    k.box(14.2, 0.8, L, 0, 7.6, 0, M.wall); // the roof
    for (let z = -L / 2 + 3; z < L / 2; z += 6) k.box(0.5, 0.06, 3, 0, 7.55, z, M.lamp, false);
    // the portal: a concrete headwall round the mouth, and the blast door (it opens as you come up)
    k.box(18, 4.5, 1.4, 0, 7.6, -L / 2 + 0.2, M.wall);
    for (const s of [-1, 1]) k.box(2.2, 7.6, 1.4, s * 8.1, 0, -L / 2 + 0.2, M.wall);
    this.door = [];
    for (const s of [-1, 1]) {
      const leaf = k.box(6.6, 7.4, 0.5, s * 3.3, 0, -L / 2 + 1.2, M.steel, false);
      for (let y = 1; y < 7; y += 1.5) { const st = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.25, 0.08), M.yellow); st.position.set(0, y - 3.7, -0.29); st.rotation.z = s * 0.5; leaf.add(st); }
      const p = k.world(s * 3.3, 3.7, -L / 2 + 1.2);
      const body = sb.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z).setRotation(k.q));
      sb.world.createCollider(RAPIER.ColliderDesc.cuboid(3.3, 3.7, 0.25), body);
      this.door.push({ leaf, body, s, x0: s * 3.3 });
    }
    this.doorOpen = 0;
    this.doorLocal = -L / 2 + 1.2;
    const sp = k.world(9.5, 0, -L / 2 - 2);
    sign(this.group, 'PRIVATE · KEEP OUT', sp.x, Y + 2.2, sp.z, yaw + Math.PI, { w: 3.4, h: 0.7, bg: '#b3261e', fg: '#ffffff', post: Y });
    this.portal = k.world(0, 0, -L / 2 - 3);
    // the mountainside over the tunnel (the ground's opened up there so the tunnel can run underneath)
    {
      const rb = this.rb, a0 = T.portal - 2.5, a1 = T.len + 4.5, nx = 9, nz = Math.ceil((a1 - a0) / 2.5);
      const geo = new THREE.PlaneGeometry(21, a1 - a0, nx, nz); geo.rotateX(-Math.PI / 2);
      const P = geo.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const lx = P.getX(i), lt = a0 + (P.getZ(i) + (a1 - a0) / 2);
        const wx = T.a.x + T.u.x * lt + T.u.z * lx, wz = T.a.z + T.u.z * lt - T.u.x * lx;
        P.setXYZ(i, wx, Math.max(rb.heightAt(wx, wz) + 0.3, Y + 8.8), wz);
      }
      geo.computeVertexNormals();
      const cap = new THREE.Mesh(geo, Object.assign(std({ color: 0x4a423c, roughness: 1, map: this.M.rock.map }), { side: THREE.DoubleSide })); cap.receiveShadow = true; cap.castShadow = true;
      this.group.add(cap);
    }
  }

  updateDoor(dt) {
    const p = this.game.shorePlayer.body.translation(), car = this.game.vehicles.active;
    const q = car ? car.pos : p;
    // a safe haven, but not at 50 stars: the door stays shut and the crew won't open it
    const g = this.game, locked = (g.police?.wanted ?? 0) >= 50, dPortal = Math.hypot(q.x - this.portal.x, q.z - this.portal.z);
    if (locked && dPortal < 40 && !this.lockNote && !this.playerInside) {
      this.lockNote = true; g.sfx.play('error');
      g.hud.toast('Intercom: "You\'ve got the whole army on your tail and you come HERE? Door stays shut. Lose some of that heat first."', 0xff6a5a);
    }
    if (!locked || dPortal > 80) this.lockNote = false;
    if (locked && this.playerInside && !this.showingOut) { // they see you out
      this.showingOut = true;
      g.hud.toast('The crew: "Not in here, you don\'t. Out." They march you to the door.', 0xff6a5a);
      const out = () => { if (g.vehicles.active) g.vehicles.exit?.(); const T = this.T; g.placeOnShore(this.portal.clone().add(new THREE.Vector3(-T.u.x * 4, 1.2, -T.u.z * 4)), Math.atan2(T.u.x, T.u.z)); this.showingOut = false; };
      if (g.story?.fade) g.story.fade(out); else out();
    }
    const want = !locked && (dPortal < 30 || this.inside(q, 8)) ? 1 : 0;
    const before = this.doorOpen;
    this.doorOpen += Math.sign(want - this.doorOpen) * Math.min(Math.abs(want - this.doorOpen), dt * 0.6);
    if (before === this.doorOpen && this.doorPlaced) return;
    this.doorPlaced = true;
    for (const d of this.door) {
      const x = d.x0 + d.s * this.doorOpen * 6.2;
      d.leaf.position.x = x;
      const w = this.tk.world(x, 3.7, this.doorLocal);
      d.body.setNextKinematicTranslation({ x: w.x, y: w.y, z: w.z });
    }
    if ((before === 0 && this.doorOpen > 0) || (before === 1 && this.doorOpen < 1)) this.game.sfx.play('switch');
  }

  // a room against the wall at angle a: w wide, d deep, with an open doorway facing the middle
  room(a, w, d, name, { open = false, door = 3, h = 4.2 } = {}) {
    const r = this.R - d / 2 - 0.6, p = this.at(r, a);
    const k = new Kit(this.group, this.sb, p.x, this.Y, p.z, this.inward(a));
    const M = this.M;
    // (local: +z towards the middle; the back of the room is against the cavern wall at -z)
    k.box(w, 0.04, d, 0, 0.01, 0, M.conc, false);
    for (const s of [-1, 1]) k.box(0.3, h, d, s * (w / 2), 0, 0, M.wall);
    k.box(w + 0.3, 0.3, d + 0.3, 0, h, 0, M.wall); // the ceiling
    k.box(w, h, 0.3, 0, 0, -d / 2, M.wall);
    if (!open) {
      const seg = (w - door) / 2;
      for (const s of [-1, 1]) k.box(seg, h, 0.3, s * (door / 2 + seg / 2), 0, d / 2, M.wall);
      k.box(door, h - 2.6, 0.3, 0, 2.6, d / 2, M.wall);
      for (const s of [-1, 1]) k.box(0.15, 2.7, 0.4, s * (door / 2 + 0.07), 0, d / 2, M.yellow, false);
    } else {
      for (const s of [-1, 1]) k.box(0.5, h, 0.5, s * (w / 2), 0, d / 2, M.yellow);
      k.box(w + 0.6, 0.5, 0.5, 0, h - 0.5, d / 2, M.yellow, false);
    }
    // strip lights
    for (let x = -w / 2 + 2; x < w / 2 - 1; x += 3.5) k.box(1.6, 0.05, 0.3, x, h - 0.06, 0, M.lamp, false);
    const sp = k.world(0, 0, d / 2 + 0.2);
    sign(this.group, name, sp.x, this.Y + h + 0.5, sp.z, k.yaw, { w: Math.max(3, name.length * 0.42), h: 0.65, bg: '#14161c', fg: '#ffd166', glow: true });
    return k;
  }

  buildRooms() {
    const M = this.M, D2R = Math.PI / 180;
    // ---- the garage: open to the floor, four painted bays and a terminal ----
    { const a = 44 * D2R, w = 27, d = 11, k = this.room(a, w, d, 'GARAGE', { open: true, h: 6 });
      this.bays = [];
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 3.4 + i * 6.7;
        for (const s of [-1, 1]) k.box(0.15, 0.02, 7, x + s * 3.2, 0.04, 0.5, M.yellow, false);
        const n = k.plane(1.4, 1.4, x, 0.06, d / 2 - 1.5, 0, new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (c) => { c.fillStyle = '#d8a830'; c.font = 'bold 50px Arial'; c.textAlign = 'center'; c.fillText(String(i + 1), 32, 50); }), transparent: true }));
        n.rotation.x = -Math.PI / 2;
        const p = k.world(x, 0, 0.3), f = k.world(x, 0, 2).sub(p);
        this.bays.push({ x: p.x, z: p.z, y: this.Y, heading: Math.atan2(f.x, f.z) }); // (nose out)
      }
      k.box(0.8, 1.3, 0.6, w / 2 - 1.2, 0, d / 2 - 1.0, M.dark); k.box(0.6, 0.45, 0.04, w / 2 - 1.2, 1.0, d / 2 - 0.68, M.screen, false);
      k.box(1.6, 1.0, 0.6, -w / 2 + 1.2, 0, -d / 2 + 0.6, M.red); k.box(1.6, 0.9, 0.5, -w / 2 + 3.2, 0, -d / 2 + 0.6, M.red); // tool chests
      this.garageTerminal = k.world(w / 2 - 1.2, 0, d / 2 + 0.3);
      this.garageArea = { k, w, d };
    }
    // ---- the armoury ----
    { const a = 86 * D2R, w = 13, d = 10, k = this.room(a, w, d, 'ARMOURY');
      k.box(w - 1, 2.6, 0.12, 0, 0.6, -d / 2 + 0.25, M.olive, false); // the pegboard
      const models = [pistolModel, magnumModel, smgModel, shotgunModel, rifleModel, combatShotgunModel, sniperModel, lmgModel];
      models.forEach((mk, i) => { try { const o = mk(); o.scale.setScalar(2.2); k.add(o, -w / 2 + 1.6 + (i % 4) * 2.9, 1.4 + Math.floor(i / 4) * 1.1, -d / 2 + 0.45, Math.PI / 2); o.rotation.z = 0; } catch { /* (a model that won't build) */ } });
      k.box(5, 1.05, 0.9, 0, 0, 1.2, M.wood); k.box(5.2, 0.06, 1.0, 0, 1.05, 1.2, M.dark, false);
      for (let i = 0; i < 4; i++) k.box(0.8, 0.5, 0.5, w / 2 - 1 - (i % 2) * 0.9, Math.floor(i / 2) * 0.5, -1.5, M.olive); // ammo crates
      this.armoury = k.world(0, 0, 2.4); this.armourer = k.world(0, 0, 0.2); this.armouryYaw = k.yaw;
    }
    // ---- the counting room ----
    { const a = 120 * D2R, w = 14, d = 10, k = this.room(a, w, d, 'COUNTING ROOM');
      for (const x of [-3.3, 3.3]) {
        k.box(4.2, 0.85, 1.6, x, 0, -0.5, M.steel);
        for (let i = 0; i < 6; i++) k.box(0.32, 0.18 + Math.random() * 0.3, 0.16, x - 1.5 + i * 0.6, 0.85, -0.6 + (i % 2) * 0.3, M.cash, false);
        k.box(0.6, 0.35, 0.5, x + 1.5, 0.85, -0.1, M.dark, false); // a note counter
      }
      // the cage at the back, stacked with cash
      k.box(w - 1, 2.8, 0.06, 0, 0, -d / 2 + 2.2, new THREE.MeshStandardMaterial({ map: this.M.grate.map, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, metalness: 0.5 }), false);
      for (let i = 0; i < 14; i++) k.box(1.0, 0.5, 0.6, -w / 2 + 1.2 + (i % 7) * 1.7, Math.floor(i / 7) * 0.5, -d / 2 + 1.0, M.cash, false);
      for (let i = 0; i < 3; i++) k.add(moneyBagMesh(), -1 + i * 0.8, 0, 2.6);
      this.counting = k.world(0, 0, 1.6);
      this.counters = [k.world(-3.3, 0, 0.6), k.world(3.3, 0, 0.6)]; this.countingYaw = k.yaw;
    }
    // ---- the control room: the heist board ----
    { const a = 180 * D2R, w = 16, d = 10, k = this.room(a, w, d, 'CONTROL ROOM');
      const mapTex = canvasTex(512, 256, (c, W, H) => { c.fillStyle = '#0a1a2a'; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(80,160,220,.25)'; for (let x = 0; x < W; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y < H; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } c.fillStyle = '#2a6a4a'; for (const [x, y, ww, hh] of [[60, 40, 120, 70], [200, 60, 90, 60], [300, 30, 70, 120], [180, 140, 260, 100], [90, 130, 70, 60]]) c.fillRect(x, y, ww, hh); c.strokeStyle = '#ffd166'; c.lineWidth = 3; c.beginPath(); c.moveTo(80, 220); c.bezierCurveTo(180, 150, 300, 230, 470, 120); c.stroke(); c.fillStyle = '#ff4a3a'; c.beginPath(); c.arc(330, 190, 8, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.font = 'bold 18px monospace'; c.fillText('TARGET: SCORCH LINE', 300, 24); });
      k.plane(9, 4.5, 0, 2.4, -d / 2 + 0.2, 0, new THREE.MeshBasicMaterial({ map: mapTex }));
      for (const s of [-1, 1]) for (let j = 0; j < 2; j++) k.plane(2.4, 1.4, s * 6, 1.6 + j * 1.6, -d / 2 + 0.2, 0, M.screen);
      k.box(7, 0.8, 1.2, 0, 0, 0.5, M.dark); for (let i = 0; i < 4; i++) { k.box(0.7, 0.45, 0.05, -2.4 + i * 1.6, 0.8, 0.3, M.dark, false); k.plane(0.6, 0.36, -2.4 + i * 1.6, 1.03, 0.33, 0, M.screen); }
      for (let i = 0; i < 3; i++) { k.box(0.6, 0.5, 0.6, -2 + i * 2, 0, 1.6, M.leather); }
      this.board = k.world(0, 0, 2.3);
    }
    // ---- the quarters: bunks, lockers, and your bed ----
    { const a = -46 * D2R, w = 15, d = 10, k = this.room(a, w, d, 'QUARTERS');
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 2 + i * 3.6;
        for (const y of [0, 1.4]) { k.box(1.1, 0.35, 2.1, x, y + 0.25, -d / 2 + 1.3, M.dark, !y); k.box(1.0, 0.18, 2.0, x, y + 0.6, -d / 2 + 1.3, i === 0 && !y ? M.red : M.olive, false); }
        for (const s of [-1, 1]) k.box(0.08, 2.4, 0.08, x + s * 0.55, 0, -d / 2 + 0.3, M.dark, false);
      }
      for (let i = 0; i < 6; i++) k.box(0.7, 2.0, 0.5, -w / 2 + 0.8 + i * 0.75, 0, d / 2 - 1.2, M.steel); // lockers by the door
      k.box(1.6, 0.75, 1.0, w / 2 - 2, 0, 0.5, M.wood); for (const s of [-1, 1]) k.box(0.45, 0.45, 0.45, w / 2 - 2 + s * 1.1, 0, 0.5, M.wood, false);
      this.bed = k.world(-w / 2 + 2, 0, -d / 2 + 2.9); this.wakeAt = k.world(-w / 2 + 3.2, 0, 0.5); this.wakeYaw = k.yaw;
    }
    // ---- the lounge: "The Crater", the crew's bar ----
    { const a = -92 * D2R, w = 16, d = 10, k = this.room(a, w, d, 'THE CRATER · LOUNGE');
      const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false });
      const neon = (txt, col, w2, h2) => new THREE.MeshBasicMaterial({ map: canvasTex(512, 128, (c, W, H) => { c.clearRect(0, 0, W, H); c.font = `bold ${H * 0.62}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = col; c.shadowBlur = 18; c.fillStyle = col; c.fillText(txt, W / 2, H / 2); c.fillText(txt, W / 2, H / 2); }), transparent: true, depthWrite: false });
      const L = -w / 2; // (the bar's along the left)
      // the bar: a long counter with a brass foot rail, stools, beer taps, and the back bar lit up
      k.box(6, 1.1, 0.8, L + 3.6, 0, -1.8, M.wood); k.box(6.2, 0.07, 1.0, L + 3.6, 1.1, -1.8, M.dark, false);
      k.box(6, 0.06, 0.06, L + 3.6, 0.22, -1.25, this.M.yellow, false);
      for (let i = 0; i < 5; i++) { const x = L + 1.4 + i * 1.1; k.cyl(0.05, 0.75, x, 0, -0.95, M.steel, 6); k.cyl(0.24, 0.1, x, 0.75, -0.95, M.leather, 12); }
      for (let i = 0; i < 4; i++) { const x = L + 2.4 + i * 0.5; k.cyl(0.04, 0.35, x, 1.17, -2.0, M.steel, 8); k.box(0.07, 0.12, 0.07, x, 1.5, -1.98, [M.red, M.yellow, M.cash, M.white][i], false); }
      k.box(6.4, 2.4, 0.45, L + 3.6, 0.9, -d / 2 + 0.45, M.wood); // the back bar
      k.plane(6, 1.0, L + 3.6, 2.15, -d / 2 + 0.69, 0, Object.assign(this.M.steel.clone(), { metalness: 0.95, roughness: 0.05 })); // (its mirror)
      for (const y of [1.05, 1.45, 1.85]) { k.box(6.2, 0.04, 0.35, L + 3.6, y, -d / 2 + 0.8, M.dark, false); for (let i = 0; i < 22; i++) { const bc = [0x3a7a3a, 0x7a3a1a, 0xc8a050, 0x2a4a7a, 0xe8e0d0, 0x5a1a1a][(i * 7 + Math.round(y * 10)) % 6]; k.cyl(0.05, 0.28 + (i % 3) * 0.05, L + 0.8 + i * 0.27, y + 0.04, -d / 2 + 0.8, lit(bc, 0.35, { roughness: 0.15 }), 6); } }
      k.plane(4.6, 1.1, L + 3.6, 3.45, -d / 2 + 0.31, 0, neon('THE CRATER', '#ff7a30'));
      for (let i = 0; i < 3; i++) { const x = L + 1.8 + i * 1.8; k.cyl(0.01, 0.9, x, 3.3, -1.8, M.dark, 4); k.cyl(0.12, 0.25, x, 3.05, -1.8, lit(0xffb060, 0.9), 10, 0.25); }
      // a fish tank along the left wall
      k.box(0.6, 0.9, 2.6, L + 0.45, 0, 2.6, M.dark); const tank = k.box(0.55, 0.9, 2.5, L + 0.45, 0.9, 2.6, lit(0x2a7ac8, 0.6, { transparent: true, opacity: 0.75 }), false); void tank;
      for (let i = 0; i < 6; i++) k.box(0.05, 0.09, 0.16, L + 0.45, 1.1 + (i % 3) * 0.22, 1.7 + i * 0.35, lit([0xffa020, 0xff4a4a, 0xffe060][i % 3], 0.6), false);
      // the pool table, with its balls and cues, under a long lamp
      { const px = 2.6, pz = -2.4;
        for (const [dx, dz] of [[-1.1, -0.55], [1.1, -0.55], [-1.1, 0.55], [1.1, 0.55]]) k.box(0.16, 0.7, 0.16, px + dx, 0, pz + dz, M.wood);
        k.box(2.7, 0.15, 1.5, px, 0.7, pz, M.wood); k.box(2.4, 0.04, 1.2, px, 0.85, pz, M.felt, false);
        for (const s of [-1, 1]) { k.box(2.7, 0.1, 0.16, px, 0.85, pz + s * 0.67, M.wood, false); k.box(0.16, 0.1, 1.5, px + s * 1.27, 0.85, pz, M.wood, false); }
        for (const [dx, dz] of [[-1.17, -0.57], [0, -0.6], [1.17, -0.57], [-1.17, 0.57], [0, 0.6], [1.17, 0.57]]) k.cyl(0.07, 0.02, px + dx, 0.95, pz + dz, M.dark, 8);
        for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), lit([0xf2f2ee, 0xe8b830, 0x2a4ac8, 0xc8201e, 0x6a2a8a, 0xe86a20, 0x2a8a3a, 0x7a1a1a, 0x111111, 0xe8b830][i], 0.3, { roughness: 0.2 })); b.position.set(px + 0.4 + (i % 4) * 0.1, 0.92, pz - 0.15 + Math.floor(i / 4) * 0.1); k.root.add(b); }
        const cue = k.box(0.03, 0.03, 1.45, px - 0.4, 0.93, pz + 0.2, M.wood, false); cue.rotation.y = 0.4;
        k.box(2.2, 0.1, 0.4, px, 2.3, pz, M.dark, false); k.box(2.0, 0.03, 0.3, px, 2.27, pz, lit(0xfff0c0, 1.2), false);
        k.box(0.08, 1.4, 1.2, w / 2 - 0.2, 0.6, -3.4, M.wood, false); for (let i = 0; i < 5; i++) k.box(0.03, 1.3, 0.03, w / 2 - 0.3, 0.65, -3.85 + i * 0.22, M.wood, false); // the cue rack
      }
      // the sofas round the big telly (right wall), a rug, a coffee table, an armchair, a lamp
      k.plane(3.6, 3.2, w / 2 - 2.6, 0.02, 2.4, 0, M.felt).rotation.x = -Math.PI / 2;
      k.box(0.9, 0.45, 2.8, w / 2 - 4.4, 0, 2.4, M.leather); k.box(0.25, 0.85, 2.8, w / 2 - 4.85, 0, 2.4, M.leather); for (const s of [-1, 1]) k.box(0.9, 0.62, 0.22, w / 2 - 4.4, 0, 2.4 + s * 1.3, M.leather, false);
      k.box(2.2, 0.45, 0.9, w / 2 - 2.4, 0, 4.15, M.leather); k.box(2.2, 0.85, 0.22, w / 2 - 2.4, 0, 4.55, M.leather);
      k.box(1.1, 0.4, 0.7, w / 2 - 2.6, 0, 2.3, M.wood); k.box(0.3, 0.05, 0.2, w / 2 - 2.5, 0.4, 2.2, M.red, false);
      k.box(0.12, 1.5, 2.8, w / 2 - 0.2, 1.0, 2.0, M.dark, false); k.plane(2.6, 1.35, w / 2 - 0.27, 1.75, 2.0, -Math.PI / 2, M.screen);
      k.cyl(0.04, 1.6, w / 2 - 4.6, 0, 4.4, M.dark, 6); k.cyl(0.18, 0.35, w / 2 - 4.6, 1.6, 4.4, lit(0xffe0b0, 0.9), 12, 0.25);
      // the poker table: chips and cards out, five chairs
      { const tx = -3.6, tz = 2.6;
        k.cyl(0.95, 0.06, tx, 0.75, tz, M.felt, 24); k.cyl(1.0, 0.08, tx, 0.7, tz, M.wood, 24); k.cyl(0.12, 0.7, tx, 0, tz, M.dark, 8);
        for (let i = 0; i < 5; i++) { const a2 = (i / 5) * Math.PI * 2, cx = tx + Math.sin(a2) * 1.45, cz = tz + Math.cos(a2) * 1.45; k.box(0.45, 0.45, 0.45, cx, 0, cz, M.leather, false); k.box(0.45, 0.5, 0.08, cx + Math.sin(a2) * 0.2, 0.45, cz + Math.cos(a2) * 0.2, M.leather, false).rotation.y = a2;
          for (let j = 0; j < 3; j++) k.cyl(0.035, 0.02 * (3 + ((i + j) % 4)), tx + Math.sin(a2) * 0.65 + j * 0.08, 0.81, tz + Math.cos(a2) * 0.65, [M.red, M.white, M.cash][j], 10); }
        for (let i = 0; i < 5; i++) { const card = k.box(0.09, 0.005, 0.13, tx - 0.25 + i * 0.12, 0.81, tz, M.white, false); card.rotation.y = 0.1 * i; }
        k.cyl(0.01, 1.3, tx, 2.9, tz, M.dark, 4); k.cyl(0.25, 0.3, tx, 2.6, tz, lit(0x30a050, 0.9), 12, 0.45);
      }
      // a jukebox, an arcade machine, a dartboard, posters, and neon along the top
      k.box(1.0, 1.6, 0.6, 0.6, 0, -d / 2 + 0.5, lit(0x8a2a6a, 0.5)); k.box(0.8, 0.5, 0.05, 0.6, 1.0, -d / 2 + 0.82, lit(0xffd060, 1.0), false);
      k.box(0.8, 1.8, 0.7, 6.8, 0, -d / 2 + 0.6, M.dark); k.plane(0.6, 0.45, 6.8, 1.35, -d / 2 + 0.96, 0, lit(0x40e0ff, 1.2));
      k.cyl(0.25, 0.05, w / 2 - 0.25, 1.75, -0.4, lit(0x2a2a2a, 0.2), 16).rotation.z = Math.PI / 2;
      k.plane(1.0, 1.4, 4.4, 2.0, -d / 2 + 0.16, 0, new THREE.MeshBasicMaterial({ map: marcosLogo(256, 256) }));
      for (const s of [-1, 1]) k.box(w - 1, 0.06, 0.06, 0, 3.9, s * (d / 2 - 0.4), lit(s < 0 ? 0xff3aa0 : 0x40c0ff, 1.5), false);
      void glass;
      this.bar = k.world(L + 3.6, 0, -0.9); this.barman = k.world(L + 3.6, 0, -2.9); this.barYaw = k.yaw;
    }
    // ---- MARCOS (not an official franchise): burgers, and a ball pit ----
    { const a = 150 * D2R, w = 18, d = 10, k = this.room(a, w, d, 'MARCOS*');
      const red = lit(0xc8102e, 0.3), yel = lit(0xffc72c, 0.35);
      const logo = new THREE.MeshBasicMaterial({ map: marcosLogo(256, 256), transparent: true });
      const lg = k.plane(2.2, 2.2, -2, 2.6, -d / 2 + 0.2, 0, logo); lg.rotation.z = 0.14; // (hung a bit crooked)
      k.plane(3.2, 0.5, -2, 1.2, -d / 2 + 0.2, 0, new THREE.MeshBasicMaterial({ map: canvasTex(256, 40, (c, W, H) => { c.fillStyle = '#1a1414'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffc72c'; c.font = 'bold 20px Arial'; c.textAlign = 'center'; c.fillText('*NOT AN OFFICIAL FRANCHISE', W / 2, 27); }) }));
      k.box(8, 1.05, 0.9, -2, 0, -1.6, red); k.box(8.1, 0.06, 1.0, -2, 1.05, -1.6, yel, false);
      k.box(0.45, 0.35, 0.35, -4.5, 1.1, -1.6, M.dark, false); k.box(0.45, 0.35, 0.35, 0.5, 1.1, -1.6, M.dark, false);
      k.box(2.4, 0.95, 0.8, -4.5, 0, -d / 2 + 0.6, M.steel); k.box(2.4, 0.95, 0.8, -1.5, 0, -d / 2 + 0.6, M.dark); // fryer and grill
      k.plane(3.6, 1.0, 2.6, 2.6, -d / 2 + 0.2, 0, new THREE.MeshBasicMaterial({ map: canvasTex(512, 140, (c, W, H) => { c.fillStyle = '#1a1414'; c.fillRect(0, 0, W, H); const it = [['MARCO BURGER', '$6'], ['BIG MARCO', '$9'], ['FRIES', '$3'], ['SHAKE', '$4']]; it.forEach(([n, p], i) => { const x = 12 + (i % 2) * 250, y = 18 + Math.floor(i / 2) * 60; c.fillStyle = '#c8102e'; c.fillRect(x, y, 236, 50); c.fillStyle = '#ffc72c'; c.font = 'bold 24px Arial'; c.fillText(n, x + 10, y + 33); c.fillStyle = '#fff'; c.fillText(p, x + 180, y + 33); }); }) }));
      for (const x of [-6.5, -3.5]) { k.box(1.4, 0.75, 0.9, x, 0, 2.8, lit(0xe8e2d4, 0.2)); for (const s of [-1, 1]) { k.box(1.4, 0.45, 0.55, x, 0, 2.8 + s * 0.9, yel, false); k.box(1.4, 1.0, 0.15, x, 0, 2.8 + s * 1.2, red, false); } }
      // the ball pit and its slide
      { const bx = 5, bz = 1.5, S = 4.2;
        for (const s of [-1, 1]) { k.box(S, 0.6, 0.2, bx, 0, bz + s * S / 2, lit(0x2f7fd8, 0.3)); k.box(0.2, 0.6, s > 0 ? S : S - 1.4, bx + s * S / 2, 0, bz + (s > 0 ? 0 : -0.7), lit(0x2f7fd8, 0.3)); }
        const n = 320, geo = new THREE.SphereGeometry(0.11, 8, 6), mat = new THREE.MeshStandardMaterial({ roughness: 0.4 }), ib = new THREE.InstancedMesh(geo, mat, n), m4 = new THREE.Matrix4(), col = new THREE.Color();
        for (let i = 0; i < n; i++) { const p = k.world(bx - S / 2 + 0.25 + Math.random() * (S - 0.5), 0.1 + Math.random() * 0.38, bz - S / 2 + 0.25 + Math.random() * (S - 0.5)); m4.makeTranslation(p.x, p.y, p.z); ib.setMatrixAt(i, m4); ib.setColorAt(i, col.setHex([0xc8102e, 0xffc72c, 0x2f7fd8, 0x3aa760, 0xff7ab0][i % 5])); }
        ib.instanceMatrix.needsUpdate = true; this.group.add(ib);
        const sl = k.box(0.9, 0.1, 3.2, bx + 1.2, 1.0, bz - 0.4, red, false); sl.rotation.x = -0.55;
        k.box(1.0, 2.0, 1.0, bx + 1.2, 0, bz - 2.6, yel); // the steps up to it
      }
      for (let x = -w / 2 + 2; x < w / 2; x += 4) k.box(1.2, 0.05, 0.3, x, 3.95, 1, lit(0xfff2d8, 1.2), false);
      this.mcCounter = k.world(-2, 0, -0.4); this.mcCook = k.world(-2, 0, -2.6); this.mcYaw = k.yaw;
    }
    // ---- the workshop: crates and a forklift ----
    { const a = -136 * D2R, w = 14, d = 10, k = this.room(a, w, d, 'WORKSHOP', { open: true, h: 5 });
      for (let i = 0; i < 9; i++) k.box(1.4, 1.2, 1.2, -w / 2 + 1.2 + (i % 3) * 1.5, Math.floor(i / 3) * 1.2, -d / 2 + 1.0, M.wood);
      k.box(3, 0.9, 0.9, w / 2 - 2, 0, -d / 2 + 0.7, M.steel); k.box(3, 1.4, 0.1, w / 2 - 2, 1.1, -d / 2 + 0.3, M.olive, false);
      const fl = k.box(1.4, 1.4, 2.4, 0.5, 0.2, 0.5, M.yellow); fl.rotation.y = 0.4; k.box(1.2, 2.6, 0.12, 0.5 + Math.sin(0.4) * 1.3, 0, 0.5 + Math.cos(0.4) * 1.3, M.dark, false);
    }
  }

  // ---- the people who work here (off in multiplayer) ----
  staff() {
    const C = this.game.citizens, Y = this.Y;
    const add = (p, yaw, look, sit = false) => { const n = C.spawnCitizen('hills', 'escort', new THREE.Vector3(p.x, (p.y ?? Y) + 0.95, p.z), { look }); if (n) { n.faceYaw = yaw; n.heading = yaw; n.sit = sit; n.indoors = true; n.hp = 120; this.people.push(n); } };
    const crew = (shirt) => ({ shirt, pants: 0x1d1f22, hat: 'beanie', hatColor: 0x15161a, skin: [0xd9a47c, 0x7a4f35, 0xf1c9a5, 0xa8724f][this.people.length % 4] });
    add(this.armourer, this.armouryYaw + Math.PI, crew(0x4a5a3a));
    for (const c of this.counters) add(c, this.countingYaw + Math.PI, { ...crew(0xe8e8e2), glasses: 'black' }, true);
    add(this.barman, this.barYaw, crew(0x2a2a2a));
    if (this.alcoveClerk) add(this.alcoveClerk, this.alcoveYaw, { shirt: 0x2a6ac8, pants: 0x2a2c30, hat: 'cap', hatColor: 0xf2f2ee, skin: 0xf1c9a5 });
    if (this.mcCook) add(this.mcCook, this.mcYaw, { shirt: 0xc8102e, pants: 0x1d1f22, hat: 'cap', hatColor: 0xffc72c, skin: 0xa8724f });
    for (const s of [-1, 1]) { const p = this.at(this.R - 4, s * 0.22); add(p, this.inward(s * 0.22), { ...crew(0x15161a), glasses: 'black' }); }
  }

  // ---- E ----
  action(pos) {
    const g = this.game;
    const near = (p, r = 2.2) => p && Math.hypot(pos.x - p.x, pos.z - p.z) < r && Math.abs(pos.y - 1 - p.y) < 2;
    if (near(this.alcoveShop, 2.6)) return { label: 'Skyhigh Chutes & Gliders', run: () => g.airGear.open() };
    if (!this.inside(pos, 2)) return null;
    const car = g.vehicles.active;
    if (car && this.inGarage(car.pos)) return { label: car.ownedUid ? 'Keep this car at the volcano garage' : 'Store this car in the volcano garage', run: () => this.store(car) };
    if (near(this.garageTerminal)) return { label: 'Garage', run: () => this.openGarage() };
    if (near(this.armoury, 2.6)) return { label: 'Armoury', run: () => this.openArmoury() };
    if (near(this.counting, 2.6)) return { label: g.loot.carrying ? `Count the money ($${g.loot.amount.toLocaleString()})` : 'Counting room', run: () => this.count() };
    if (near(this.bed, 2.4)) return { label: g.economy.homeSpawn === 'volcano' ? 'Sleep (your bunk)' : 'Make this your bunk (wake up here)', run: () => g.homes.sleep({ id: 'volcano', name: 'the volcano base' }) };
    if (near(this.bar, 2.4)) return { label: 'Have a drink', run: () => { g.health.heal(15); g.sfx.play('cash'); g.hud.toast(['"On the house."', '"Steady, now."', '"Rough day?"'][Math.floor(Math.random() * 3)] + ' +15 health', 0x7be08a); } };
    if (near(this.board, 2.6)) return { label: 'Heist board', run: () => this.openBoard() };
    if (near(this.mcCounter, 2.4)) return { label: 'MARCOS* (order)', run: () => g.marcos.order() };
    if (near(this.hunterDesk, 2.6)) return { label: 'The bounty hunter: contracts', run: () => g.hits.open() };
    if (near(this.hatch, 2.2) && (g.dragging || g.held)) return { label: g.dragging ? 'Throw the body down the chute' : `Throw the ${g.held.name.toLowerCase()} down the chute`, run: () => this.dispose() };
    return null;
  }

  inGarage(p) {
    const A = this.garageArea; if (!A) return false;
    const l = A.k.root.worldToLocal(new THREE.Vector3(p.x, p.y, p.z));
    return Math.abs(l.x) < A.w / 2 && l.z > -A.d / 2 && l.z < A.d / 2 + 4;
  }

  colorOf(car) { let c = car.color; if (c == null) car.mesh.traverse((o) => { if (c == null && o.isMesh && o.material?.color && o.material.color.getHex() !== 0x1b1b1b) c = o.material.color.getHex(); }); return c ?? 0x2f7fd8; }

  store(car) {
    const g = this.game, e = g.economy;
    if (Math.abs(car.speed) > 2) { g.hud.toast('Stop first', 0xffd166); return; }
    if (car.isHeli) { g.hud.toast('No room for a helicopter in here', 0xffd166); return; }
    if (car.ownedUid) {
      const rec = e.ownedCars.find((r) => r.uid === car.ownedUid);
      if (rec) { rec.home = 'volcano'; e.save(); g.vehicles.exit(); g.hud.toast(`Your ${car.type?.name || 'car'} lives at the volcano now: it'll be waiting in the garage`, 0x7be08a); }
      return;
    }
    if (this.save.stored.length >= 8) { g.hud.toast('The garage is full (8 cars). Take one out first', 0xff8a6a); return; }
    const rec = { id: Date.now().toString(36), name: car.type?.name?.replace(/^Stolen /, '') || 'Car', color: this.colorOf(car), police: !!car.police, bike: !!car.bike, hp: car.maxHp };
    if (car.tank || car.bus || car.tow || car.monster) { g.hud.toast('That won\'t fit in the garage', 0xffd166); return; }
    g.vehicles.exit();
    if (g.vehicles.active === car) return;
    if (g.vehicles.list.includes(car)) g.vehicles.remove(car);
    this.save.stored.push(rec); this.persist();
    g.police.clearWanted?.();
    g.sfx.play('switch');
    g.hud.toast(`${rec.name} stored in the garage. Out of sight, out of mind.`, 0x7be08a);
  }

  freeBay() {
    const g = this.game;
    return this.bays.find((b) => !g.vehicles.all.some((c) => Math.hypot(c.pos.x - b.x, c.pos.z - b.z) < 3)) || null;
  }

  takeOut(rec) {
    const g = this.game, bay = this.freeBay();
    if (!bay) { g.hud.toast('All four bays are full', 0xff8a6a); return; }
    const opts = { x: bay.x, z: bay.z, heading: bay.heading, color: rec.color };
    const car = rec.bike ? g.fleet.makeBike(opts) : new Car(g, { ...opts, police: rec.police });
    const gy = car.groundAt(bay.x, bay.z, this.Y + 2); car.body.setTranslation({ x: bay.x, y: gy + 0.6, z: bay.z }, true);
    car.type = { name: rec.name, hp: car.maxHp, car: true }; car.base = 300; car.color = rec.color;
    g.vehicles.list.push(car);
    this.save.stored.splice(this.save.stored.indexOf(rec), 1); this.persist();
    g.hud.toast(`Your ${rec.name} is in bay ${this.bays.indexOf(bay) + 1}`, 0x7be08a);
  }

  openGarage() {
    const g = this.game, e = g.economy;
    const render = () => {
      const st = this.save.stored.map((r, i) => `<div class="erow"><div><b>${r.name}</b> <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#${r.color.toString(16).padStart(6, '0')}"></span><small>Stored</small></div><div class="btns"><button data-a="out" data-i="${i}">Take it out</button></div></div>`).join('') || '<p class="empty">Nothing stored. Drive a car in under the canopy and press E to keep it here.</p>';
      const mine = e.ownedCars.filter((r) => r.model !== 'skylark').map((r) => `<div class="erow"><div><b>${r.model}</b><small>${r.home === 'volcano' ? 'Lives here' : 'Lives elsewhere'}</small></div><div class="btns"><button data-a="keep" data-uid="${r.uid}">${r.home === 'volcano' ? 'Bring it round' : 'Keep it here'}</button></div></div>`).join('');
      e.open('Volcano garage', `<p class="lede">Up to eight stolen cars, hidden away (and forgotten by the police), plus any you bought at Verian Motors.</p><h3 class="kih">Stored</h3>${st}${mine ? '<h3 class="kih">Your cars</h3>' + mine : ''}`, (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]'); if (!b) return;
        if (b.dataset.a === 'out') { this.takeOut(this.save.stored[+b.dataset.i]); e.close(); return; }
        const rec = e.ownedCars.find((r) => r.uid === b.dataset.uid);
        if (rec) { rec.home = 'volcano'; e.save(); g.dealer?.deliver(rec); e.close(); return; }
        render();
      }));
    };
    render();
  }

  openArmoury() {
    const g = this.game, e = g.economy;
    const today = Math.floor(Date.now() / 86400000); // (a real day)
    const render = () => {
      const a = e.ammo;
      const row = (label, small, btn) => `<div class="erow"><div><b>${label}</b><small>${small}</small></div><div class="btns">${btn}</div></div>`;
      let html = e.header() + `<p class="lede">"No questions, no paperwork, and nobody calls the police."</p>`;
      html += `<div class="econ-head"><span>Ammo: pistol <b>${a.pistolAmmo}</b> · magnum <b>${a.magnumAmmo}</b> · SMG <b>${a.smgAmmo}</b> · rifle <b>${a.rifleAmmo}</b> · shells <b>${a.shells}</b> · sniper <b>${a.sniperAmmo}</b></span></div>`;
      html += row('Restock', this.save.restocked === today ? 'Already done today' : 'A full set of ammo for everything, free once a day', `<button data-a="restock" ${this.save.restocked === today ? 'disabled' : ''}>Free</button>`);
      for (const it of GUNS) { const d = ITEM_BY_ID[it.id]; if (d) html += row(d.name, `with ${it.ammo[1]} rounds`, `<button data-a="gun" data-id="${it.id}" ${e.money >= it.price ? '' : 'disabled'}>$${it.price.toLocaleString()}</button>`); }
      for (const [id, price] of [['grenade', 150], ['armor', 400]]) { const d = ITEM_BY_ID[id]; if (d) html += row(d.name, id === 'armor' ? 'Soaks up bullets' : 'Pull the pin, throw', `<button data-a="gun" data-id="${id}" ${e.money >= price ? '' : 'disabled'}>$${price}</button>`); }
      e.open('Armoury', html, (el) => el.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]'); if (!b || b.disabled) return;
        if (b.dataset.a === 'restock') { for (const [k, n] of AMMO) e.addAmmo(k, n); this.save.restocked = today; this.persist(); g.sfx.play('select'); g.hud.toast('Restocked. Go easy.', 0x7be08a); }
        if (b.dataset.a === 'gun') {
          const it = GUNS.find((x) => x.id === b.dataset.id) || { id: b.dataset.id, price: b.dataset.id === 'armor' ? 400 : 150 };
          if (e.money < it.price) return;
          e.addMoney(-it.price, `bought a ${ITEM_BY_ID[it.id].name.toLowerCase()}`);
          g.giveItem(ITEM_BY_ID[it.id]);
          if (it.ammo) e.addAmmo(it.ammo[0], it.ammo[1]);
          g.refreshHolding?.(); g.sfx.play('cash');
        }
        render();
      }));
    };
    render();
  }

  count() {
    const g = this.game;
    if (!g.loot.carrying) { g.economy.open('Counting room', '<p class="lede">"Bring us bags from a job and we\'ll count it, clean it and put it in your account. We take ten per cent."</p>'); return; }
    g.story.fade(() => {
      const r = g.loot.process();
      g.hud.flashBanner('MONEY CLEANED', '#7be08a');
      g.hud.toast(`Counted $${r.gross.toLocaleString()}: $${r.net.toLocaleString()} is in your bank account (the counters keep ${Math.round(LAUNDER_CUT * 100)}%)`, 0x7be08a);
      g.police.clearWanted?.();
    });
  }

  openBoard() {
    const g = this.game;
    const job = g.trainHeist;
    if (job) { job.openBoard(); return; }
    g.economy.open('Heist board', '<p class="lede">Nothing on the board yet.</p>');
  }

  // starting the game / coming round with the bunk as home
  wake() {
    const g = this.game;
    if (g.economy.homeSpawn !== 'volcano' || !this.wakeAt) return false;
    g.placeOnShore(this.wakeAt.clone().setY(this.Y + 1.1), this.wakeYaw);
    g.hud.toast('You wake up in your bunk in the volcano', 0x7be08a);
    return true;
  }

  // ---- the lava: anything that drops down the chute lands in it, and it spouts ----
  splash(x, z, big = true) {
    const g = this.game, y = this.lavaY;
    const n = big ? 120 : 14;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = Math.random() * (big ? 4 : 1.5);
      g.fx.emit(new THREE.Vector3(x + Math.cos(a) * 0.6, y + 0.3, z + Math.sin(a) * 0.6), new THREE.Vector3(Math.cos(a) * s, (big ? 20 : 5) + Math.random() * (big ? 16 : 4), Math.sin(a) * s), [0xffd060, 0xff7a20, 0xff4a10][i % 3], big ? 0.9 : 0.5, big ? 2.6 : 1.2, 1);
    }
    if (big) {
      g.sfx.play('explosion');
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      col.position.set(x, y, z); this.group.add(col);
      this.splashes.push({ col, t: 0 });
      this.lavaLight.intensity = 14;
      this.erupt();
      this.startCinema();
    }
  }

  checkLava() {
    const g = this.game, V = this.V, low = this.lavaY + 2;
    const inPit = (p) => Math.hypot(p.x - V.x, p.z - V.z) < this.pit && p.y < low;
    const pp = g.shorePlayer.body.translation();
    if (g.onShore && !g.health.dead && inPit(pp)) { this.splash(pp.x, pp.z); g.health.damage(9999, 'lava'); }
    for (const n of [...g.citizens.list]) { const t = n.body.translation(); if (inPit(t)) { this.splash(t.x, t.z); g.citizens.despawn(n); } }
    for (const c of [...g.vehicles.list]) if (c !== g.vehicles.active && inPit(c.pos)) { this.splash(c.pos.x, c.pos.z); g.vehicles.remove(c); }
    const pr = g.pragdoll?.rd?.torso?.body?.translation?.();
    if (pr && inPit(pr) && !this.prSplashed) { this.prSplashed = true; this.splash(pr.x, pr.z); g.health.damage(9999, 'lava'); }
    if (!pr) this.prSplashed = false;
    const A = g.vehicles.active;
    if (A && inPit(A.pos)) { this.splash(A.pos.x, A.pos.z); g.vehicles.exit(); g.health.damage(9999, 'lava'); if (g.vehicles.list.includes(A)) g.vehicles.remove(A); }
    if (g.health.dead && this.cine) g.health.deadT = Math.max(g.health.deadT, this.cine.dur - this.cine.t + 0.3); // (you come round once the eruption's over, not with the camera still out there)
    const C = g.citizens;
    for (const rd of [...(C.ragdolls || [])]) { const t = rd.torso?.body?.translation?.(); if (t && inPit(t)) { this.splash(t.x, t.z); for (const q of rd.parts) if (g.portSandbox.props.has(q)) g.portSandbox.remove(q); C.ragdolls.splice(C.ragdolls.indexOf(rd), 1); } }
    // (anything else that's fallen in: not your own ragdoll, though. Deleting the body you're in froze the game)
    const mine = new Set(g.pragdoll?.rd?.parts || []);
    for (const q of [...g.portSandbox.props]) { if (mine.has(q)) continue; const t = q.body?.translation?.(); if (t && inPit(t)) { this.splash(t.x, t.z, false); g.portSandbox.remove(q); } }
  }

  // in the cavern or the tunnel (for the lighting)
  inBase(p) {
    if (this.inside(p, 0.5) && p.y < this.Y + 40) return true;
    const T = this.T, ax = p.x - T.a.x, az = p.z - T.a.z, t = ax * T.u.x + az * T.u.z, lat = Math.abs(ax * T.u.z - az * T.u.x);
    return t > T.portal + 2 && t < T.len + 2 && lat < 7 && p.y < this.Y + 8;
  }

  update(dt) {
    const g = this.game;
    this.t = (this.t || 0) + dt;
    { const car = g.vehicles.active, q = car ? car.pos : g.shorePlayer.body.translation(); this.playerInside = g.onShore && !g.flying && this.inBase(q); }
    if (this.lavaMesh) { const m = this.lavaMesh.material.map; m.offset.x = Math.sin(this.t * 0.07) * 0.3; m.offset.y = this.t * 0.012; }
    this.lavaLight.intensity += (4 + Math.sin(this.t * 2.3) * 0.6 - this.lavaLight.intensity) * Math.min(1, dt * 1.5);
    for (const s of [...this.splashes]) {
      s.t += dt;
      const h = Math.max(0.01, Math.sin(Math.min(1, s.t / 1.8) * Math.PI) * 30);
      s.col.scale.set(1 + s.t, h, 1 + s.t); s.col.position.y = this.lavaY + h / 2; s.col.material.opacity = Math.max(0, 0.9 - s.t * 0.4);
      if (s.t > 2.2) { s.col.removeFromParent(); s.col.geometry.dispose(); this.splashes.splice(this.splashes.indexOf(s), 1); }
    }
    for (const b of [...this.blobs]) {
      b.t += dt; if (b.t < 0) continue;
      b.v.y -= 16 * dt; b.s.position.addScaledVector(b.v, dt); b.s.material.opacity = Math.max(0, 1 - b.t / b.life);
      if (b.t > b.life) { b.s.removeFromParent(); b.s.material.dispose(); this.blobs.splice(this.blobs.indexOf(b), 1); }
    }
    if (this.ventCol) { const c = this.ventCol; c.t += dt; const h = Math.max(0.01, Math.sin(Math.min(1, c.t / 3) * Math.PI) * 110); c.m.scale.set(1 + c.t * 0.6, h, 1 + c.t * 0.6); c.m.position.y = this.ventTop + h / 2; c.m.material.opacity = Math.max(0, 0.95 - c.t * 0.28); if (c.t > 3.4) { c.m.removeFromParent(); c.m.geometry.dispose(); this.ventCol = null; } }
    this.ventLight.intensity = Math.max(0, this.ventLight.intensity - dt * 8);
    { const cam = g.camera.position, d = Math.hypot(cam.x - this.V.x, cam.z - this.V.z), o = Math.max(0, Math.min(1, (d - 650) / 450)); this.far.visible = o > 0.01; this.far.material.opacity = o; }
    this.updatePlume(dt);
    this.updateHunter(dt);
    // the odd blob of lava pops up on its own
    this.bubT = (this.bubT ?? 2) - dt;
    const p = g.shorePlayer.body.translation(), here = Math.hypot(p.x - this.V.x, p.z - this.V.z) < 160;
    if (this.bubT < 0 && here) { this.bubT = 1.5 + Math.random() * 3; const a = Math.random() * 6.28, r = Math.random() * (this.pit - 2); this.splash(this.V.x + Math.cos(a) * r, this.V.z + Math.sin(a) * r, false); }
    if (here) this.checkLava();
    this.updateDoor(dt);
    // the crew
    const near = Math.hypot(p.x - this.V.x, p.z - this.V.z) < 110 && g.started && !g.net;
    this.people = this.people.filter((n) => g.citizens.list.includes(n));
    if (near && !this.people.length && !this.staffed) { this.staffed = true; this.staff(); }
    if (!near && this.staffed) { for (const n of this.people) g.citizens.despawn(n); this.people = []; this.staffed = false; }
  }
}
