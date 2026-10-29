import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { std, canvasTex } from './buildkit.js';
import { LAND_Y } from './world.js';

// Stunt jumps (ramps around the map: hit one fast enough and the camera slows right down while
// you fly; land it for a bonus) and hidden packages (thirty glowing parcels tucked away all over
// the place, with rewards for every ten). Both are saved.

const SAVE = 'physick.stunts.v1';
const KERB = 0.15;

export class Stunts {
  constructor(game) {
    this.game = game;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { /* none */ }
    this.done = new Set(s?.jumps || []);
    this.found = new Set(s?.packages || []);
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.ramps = [];
    this.packages = [];
    this.buildRamps();
    this.placePackages();
    this.slowT = 0;
  }

  save() { try { localStorage.setItem(SAVE, JSON.stringify({ jumps: [...this.done], packages: [...this.found] })); } catch { /* ignore */ } }

  // ---------------------------------------------------------------- ramps
  // A wedge: base at `at`, rising towards `yaw` (the way you drive up it). Each one is aimed at
  // somewhere: `dist` metres ahead (landing height `landY`), and hit at `minSpeed` or better it
  // throws you there; too slow and you don't make it. pitch: the slope of the road it sits on.
  ramp(id, at, yaw, { len = 9, rise = 2.4, w = 6, dist = 60, landY = null, minSpeed = 22, pitch = 0, name } = {}) {
    const g = this.game, sb = g.portSandbox;
    const y0 = at.y;
    const ang = Math.atan2(rise, len);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len, rise); shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(-len / 2, 0, -w / 2);
    geo.rotateY(Math.PI / 2); // up-slope along -z in local space (the way a car faces at heading 0)
    const stripes = canvasTex(64, 64, (c, ww, h) => { c.fillStyle = '#f2d23a'; c.fillRect(0, 0, ww, h); c.fillStyle = '#1b1b1b'; for (let k = -2; k < 4; k++) { c.beginPath(); c.moveTo(k * 22, 0); c.lineTo(k * 22 + 11, 0); c.lineTo(k * 22 + 11 + 32, h); c.lineTo(k * 22 + 32, h); c.fill(); } }, [2, 2]);
    const mesh = new THREE.Mesh(geo, std({ map: stripes, roughness: 0.6 }));
    mesh.position.set(at.x, y0, at.z);
    mesh.rotation.set(pitch, yaw, 0, 'YXZ');
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.noMerge = true;
    this.group.add(mesh);
    // the collider: a thin slab along the slope
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const up = Math.tan(pitch);
    const mid = new THREE.Vector3(at.x, y0 + rise / 2, at.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ang + pitch, yaw, 0, 'YXZ'));
    const L = Math.hypot(len, rise);
    const off = new THREE.Vector3(0, -0.15, 0).applyQuaternion(q);
    // (cars don't collide with it: they ride up it on their ground probe, so the nose can't dig in)
    const RAMP = ((0x20 << 16) | (0x1 | 0x2 | 0x4 | 0x8));
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, 0.15, L / 2).setTranslation(mid.x + off.x, mid.y + off.y, mid.z + off.z).setRotation(q)).setCollisionGroups(RAMP);
    // a solid back so you can't drive through it the wrong way
    const back = at.clone().addScaledVector(f, len / 2 - 0.2);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, (rise - 0.3) / 2, 0.2).setTranslation(back.x, y0 + (len / 2) * up + (rise - 0.3) / 2, back.z).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)))).setCollisionGroups(RAMP);
    const lip = at.clone().addScaledVector(f, len / 2); lip.y = y0 + rise + (len / 2) * up;
    const land = lip.clone().addScaledVector(f, dist); land.y = landY ?? y0;
    // a pair of chevron boards either side of the run-up, so you can see it coming
    const chev = canvasTex(64, 64, (c, ww, h) => { c.fillStyle = '#1b1b1b'; c.fillRect(0, 0, ww, h); c.fillStyle = '#f2d23a'; for (const dx of [6, 26]) { c.beginPath(); c.moveTo(dx, 8); c.lineTo(dx + 18, 32); c.lineTo(dx, 56); c.lineTo(dx + 8, 56); c.lineTo(dx + 26, 32); c.lineTo(dx + 8, 8); c.fill(); } });
    const side = new THREE.Vector3(f.z, 0, -f.x);
    for (const s of [-1, 1]) {
      const p = at.clone().addScaledVector(f, -len / 2 - 1).addScaledVector(side, s * (w / 2 + 0.9));
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), std({ map: chev, emissive: 0xffffff, emissiveMap: chev, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
      board.position.set(p.x, y0 + 1.2, p.z); board.rotation.y = Math.atan2(-f.x, -f.z); // (facing the driver coming up to it)
      board.userData.noMerge = true;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), std({ color: 0x3a3c40 })); post.position.set(p.x, y0 + 0.6, p.z);
      this.group.add(board, post);
    }
    const r = { id, at: at.clone(), yaw, f, lip, land, dist, minSpeed, len, w, rise, ang, pitch, name: name || `Jump ${this.ramps.length + 1}`, mesh };
    this.ramps.push(r);
    return r;
  }

  // Every ramp sits at the end of a long straight run-up and throws you over a real gap.
  buildRamps() {
    const g = this.game, H = g.hood, S = g.saltmarsh, Y = LAND_Y;
    const v = (x, z, y = Y) => new THREE.Vector3(x, y, z);
    const E = -Math.PI / 2, W = Math.PI / 2, N = 0, Sth = Math.PI; // (yaw for driving east / west / north (-z) / south (+z))
    // over the strait between Saltmarsh Key and the Hollows, both ways
    this.ramp('strait-e', v(S.isl.x1 - 10, S.zs[3]), E, { dist: 84, minSpeed: 22, rise: 2.6, name: 'Strait leap' });
    this.ramp('strait-w', v(H.isl.x0 + 8, H.zs[1]), W, { dist: 84, minSpeed: 22, rise: 2.6, name: 'Hollows getaway' });
    // over the water between the Hollows and Pelican Point, both ways
    const P = g.pelican;
    if (P) {
      this.ramp('point-e', v(H.isl.x1 - 8, H.zs[3]), E, { dist: 78, minSpeed: 22, rise: 2.6, landY: P.heightAt(P.isl.x0 + 20, H.zs[3]), name: 'Pelican plunge' });
      this.ramp('point-w', v(P.isl.x0 + 9, H.zs[1], P.heightAt(P.isl.x0 + 9, H.zs[1])), W, { dist: 74, minSpeed: 22, rise: 2.6, name: 'Point break' });
    }
    // the airport: fly in over the gate from the causeway, and jump back out again
    const A = g.airport;
    if (A) {
      this.ramp('gate-in', v(A.gateAt.x - 4, A.isl.z0 - 17), Sth, { dist: 42, minSpeed: 21, rise: 2.4, name: 'Gate crasher' });
      this.ramp('gate-out', v(A.gateAt.x + 4, A.isl.z0 + 52), N, { dist: 62, minSpeed: 22, rise: 2.6, name: 'Jailbreak' });
    }
  }

  // ---------------------------------------------------------------- the jump
  update(dt) {
    const g = this.game, v = g.vehicles.active;
    this.slowT = Math.max(0, this.slowT - dt / Math.max(0.05, g.timeScale || 1));
    g.timeScale = this.slowT > 0 ? 0.35 : 1;
    if (this.jump && (this.jump.car !== v || !v)) this.jump = null;
    if (v && !v.isHeli && !this.jump) {
      // driving up a ramp fast: launch off the lip, aimed at its landing spot
      for (const r of this.ramps) {
        const d = v.pos.clone().sub(r.lip);
        const along = d.dot(r.f), side = Math.abs(d.x * r.f.z - d.z * r.f.x);
        const sp = v.vel.dot(r.f);
        if (along > -1.2 && along < 1.4 && side < r.w / 2 + 0.6 && sp > 8 && Math.abs(v.pos.y - r.lip.y) < 1.6) {
          let vy;
          if (sp >= r.minSpeed) {
            // fast enough: the arc that lands you on the far side (a quicker run-up flies further)
            const reach = r.dist * Math.min(1.25, 0.92 + (sp - r.minSpeed) * 0.02);
            const T = reach / sp;
            vy = Math.min(42, (r.land.y - r.lip.y + 11 * T * T) / T);
            // and straighten you up so you're heading for it
            const vel = v.body.linvel(), s2 = Math.hypot(vel.x, vel.z);
            v.body.setLinvel({ x: r.f.x * s2, y: vel.y, z: r.f.z * s2 }, true);
          } else vy = sp * Math.sin(r.ang) * 1.2 + 2; // not enough: a hop, and probably a swim
          v.vy = Math.max(v.vy || 0, vy);
          v.airborne = true;
          v.stuntJump = true;
          this.jump = { car: v, from: v.pos.clone(), ramp: r, t: 0, fast: sp >= r.minSpeed };
          this.slowT = 1.2;
          g.sfx.play('engineStart');
          if (sp < r.minSpeed) g.hud.toast(`${r.name}: too slow! (${Math.round(sp * 3.6)} of ${Math.round(r.minSpeed * 3.6)} km/h)`, 0xff8a6a);
          break;
        }
      }
    }
    // in the air: a chase camera from the side, then land it
    if (this.jump) {
      const a = this.jump;
      a.t += dt;
      const v2 = a.car;
      if (v2.sinking || v2.wreck) { this.jump = null; v2.stuntJump = false; g.hud.toast(`${a.ramp.name}: missed it`, 0xff8a6a); }
      else if (a.t > 0.3 && !v2.airborne) {
        const r = a.ramp; this.jump = null; v2.stuntJump = false;
        const dist = Math.hypot(v2.pos.x - a.from.x, v2.pos.z - a.from.z);
        if (dist >= r.dist * 0.7 && v2.pos.y > LAND_Y - 0.5) {
          const first = !this.done.has(r.id);
          if (first) { this.done.add(r.id); this.save(); g.economy.addMoney(500, `${r.name}: unique stunt`); }
          g.hud.flashBanner(`${first ? 'UNIQUE STUNT' : 'STUNT'} · ${dist.toFixed(0)} m`, '#ffd166');
          g.hud.toast(`${r.name}: ${dist.toFixed(1)} m · ${this.done.size}/${this.ramps.length} unique jumps`, 0xffd166);
          g.stats?.best?.('longestJump', dist, true);
          g.stats?.add?.('stunts', 1);
          if (first && this.done.size === this.ramps.length) { g.economy.addMoney(10000, 'all stunt jumps done'); g.hud.flashBanner('ALL STUNT JUMPS!', '#7be08a'); }
        } else g.hud.toast(`${r.name}: ${dist.toFixed(1)} m (need ${Math.round(r.dist * 0.7)} m)`, 0x9ec5ff);
      }
    }
    this.updatePackages(dt);
  }

  // for the map: where the jumps are (done ones fade)
  marks() { return this.ramps.map((r) => ({ x: r.at.x, z: r.at.z, color: this.done.has(r.id) ? '#8a7a40' : '#f2d23a', r: 3, label: '⤴', name: `Stunt jump: ${r.name}` })); }

  // ---------------------------------------------------------------- hidden packages
  placePackages() {
    const g = this.game, C = g.city, H = g.hood, S = g.saltmarsh, Y = LAND_Y;
    const spots = [];
    const add = (x, z) => spots.push(new THREE.Vector3(x, Y, z));
    // city: tucked in by the kerbs at the block corners, the alleys, the marina, the ferry pier
    for (const [i, j] of [[0, 0], [4, 0], [0, 4], [4, 4], [2, 1], [1, 2], [3, 3], [2, 4]]) { const b = C.block(i, j); add(b.x0 + 1.2, b.z0 + 1.2); }
    for (const a of C.alleys) add(a.x1 - 3, a.z);
    add(C.isl.x1 + 66, 0); add(-762, -258);
    // the Hollows
    for (const [x, z] of [[H.xs[0] + 8, H.zs[0] + 8], [H.xs[3] - 8, H.zs[4] - 8], [H.xs[1] + 8, H.zs[2] - 8], [H.xs[2] - 8, H.zs[3] + 8]]) add(x, z);
    // Saltmarsh: the beach, the dock, the market, the lighthouse, the church
    add(S.beach?.x ?? -1040, S.beach?.z ?? -1500); add(-750, S.dock.z + 66); add(S.market.x + 30, S.market.z + 30); add(-655, -1222); add(-659, -1640);
    // Cherry Estate: campsites, the lookout, the trailhead, the garage under the bridge, the bunker
    for (const [x, z] of [[-1380, -262], [-1420, 240], [-1605, -62], [-1650, 330], [-1150, -35]]) add(x + 5, z + 5);
    const gp = g.park.garage?.pos; if (gp) add(gp.x - 6, gp.z + 4);
    const bk = g.park.bunker?.out; if (bk) add(bk.x + 3, bk.z + 3);
    // the airport and the docks scrapyard
    add(-1600 + 280, 470); add(-1150 + 280, 760); add(-660, -160);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3aff7a, emissive: 0x20d860, emissiveIntensity: 1.2, roughness: 0.4 });
    spots.slice(0, 30).forEach((p, i) => {
      // sit it on whatever's there (pavement, sand, a pier, the hillside)
      const sb = g.portSandbox;
      const hit = sb.world.castRay(new RAPIER.Ray({ x: p.x, y: 120, z: p.z }, { x: 0, y: -1, z: 0 }), 200, true, undefined, undefined, undefined, undefined, (c) => sb.staticColliders.has(c.handle));
      p.y = hit ? 120 - hit.timeOfImpact : g.park.heightAt?.(p.x, p.z) ?? Y;
      if (this.found.has(i)) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat);
      m.position.set(p.x, p.y + 0.6, p.z);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3aff7a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.add(halo);
      this.group.add(m);
      this.packages.push({ i, pos: p, mesh: m });
    });
    this.total = Math.min(30, spots.length);
  }

  updatePackages(dt) {
    const g = this.game, p = g.vehicles.active?.pos || g.shorePlayer.body.translation();
    const cp = g.camera.position;
    for (const k of [...this.packages]) {
      const d2 = (cp.x - k.pos.x) ** 2 + (cp.z - k.pos.z) ** 2;
      k.mesh.visible = d2 < 160 * 160;
      if (!k.mesh.visible) continue;
      k.mesh.rotation.y += dt * 2;
      k.mesh.position.y = k.pos.y + 0.6 + Math.sin(performance.now() / 400 + k.i) * 0.12;
      if (Math.hypot(p.x - k.pos.x, p.z - k.pos.z) < 2 && Math.abs(p.y - k.pos.y) < 3) {
        k.mesh.removeFromParent();
        this.packages.splice(this.packages.indexOf(k), 1);
        this.found.add(k.i);
        this.save();
        const n = this.found.size;
        g.sfx.play('star');
        g.hud.flashBanner(`PACKAGE ${n}/${this.total}`, '#3aff7a');
        const reward = { 10: 5000, 20: 15000, 30: 50000 }[n];
        g.economy.addMoney(reward || 100, reward ? `${n} hidden packages!` : 'hidden package');
        if (n === this.total) g.news?.add('Someone has found every one of the city\'s mysterious green parcels. Nobody knows who\'s been leaving them.', 'weird');
      }
    }
  }
}

// (the fishing dock's coordinates, without importing Saltmarsh here)
function DOCKX() { return -750; }
function DOCKZ(g) { return g.saltmarsh.dock.z; }
