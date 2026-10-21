import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ISLANDS, LAND_Y, addPier } from './world.js';
import { std, sign, solidBox, canvasTex, speckle } from './buildkit.js';
import { curtainTex } from './architecture.js';
import { photoTex } from './park.js';

// Verian International Airport: south-west of the city across a causeway. It's closed —
// the gate's chained, the runway's marked with big yellow crosses and coned off, and a few
// airliners sit parked on the apron going nowhere.

const Y = LAND_Y;

export class Airport {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'airport');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.mapRects = []; // for the map: { x0, x1, z0, z1, color }
    this.build();
  }

  flat(w, d, x, z, mat, y = Y + 0.03, rot = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl;
    const base = import.meta.env.BASE_URL;
    const W = isl.x1 - isl.x0, D = isl.z1 - isl.z0;
    // ground
    const grass = std({ map: photoTex(`${base}assets/textures/grass.jpg`, W / 9, D / 9), roughness: 1 });
    const bank = std({ color: 0x8a8478 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 14, D), [bank, bank, grass, bank, bank, bank]);
    slab.position.set((isl.x0 + isl.x1) / 2, Y - 7, (isl.z0 + isl.z1) / 2);
    slab.receiveShadow = true;
    slab.userData.noMerge = true;
    g.add(slab);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(W / 2, 7, D / 2).setTranslation(slab.position.x, Y - 7, slab.position.z));

    const asphalt = std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#3a3d41'; c.fillRect(0, 0, w, h); speckle(c, w, h, 300, 0.06); }, [1, 1]) });
    const concrete = std({ map: canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#b3b0a8'; c.fillRect(0, 0, w, h); speckle(c, w, h, 600, 0.06); c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); }, [450 / 12, 95 / 12]) });
    const white = std({ color: 0xeeeeea }), yellow = std({ color: 0xf2c418 });

    // ---- causeway from the city's south-west corner to the gate ----
    const cx0 = -1098, cx1 = -1082, cz0 = 208, cz1 = isl.z0 + 2;
    const cw = new THREE.Mesh(new THREE.BoxGeometry(cx1 - cx0, 2, cz1 - cz0), std({ color: 0x8a8680 }));
    cw.position.set((cx0 + cx1) / 2, Y - 1, (cz0 + cz1) / 2);
    cw.receiveShadow = true;
    g.add(cw);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((cx1 - cx0) / 2, 1, (cz1 - cz0) / 2).setTranslation(cw.position.x, Y - 1, cw.position.z));
    addPier(cx0, cx1, cz0, cz1);
    this.flat(cx1 - cx0 - 2, cz1 - cz0, (cx0 + cx1) / 2, (cz0 + cz1) / 2, asphalt, Y + 0.02);
    for (let z = cz0 + 4; z < cz1; z += 10) this.flat(0.3, 5, (cx0 + cx1) / 2, z, yellow, Y + 0.03);
    for (const x of [cx0 + 0.15, cx1 - 0.15]) solidBox(g, sb, 0.3, 1, cz1 - cz0, x, Y, (cz0 + cz1) / 2, std({ color: 0xcfcac0 }));
    this.mapRects.push({ x0: cx0, x1: cx1, z0: cz0, z1: cz1, color: '#55585e' });

    // ---- perimeter fence with a locked gate ----
    const F = { x0: isl.x0 + 4, x1: isl.x1 - 4, z0: isl.z0 + 4, z1: isl.z1 - 4 };
    const gate = { x0: cx0, x1: cx1 };
    const linkTex = canvasTex(64, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(190,195,200,0.9)'; c.lineWidth = 2;
      for (let i = -64; i < 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.stroke(); c.beginPath(); c.moveTo(i + 64, 0); c.lineTo(i, 64); c.stroke(); }
    });
    const FH = 3.2;
    const fenceRun = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) return;
      const t = linkTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2, FH / 2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, FH), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }));
      m.position.set((ax + bx) / 2, Y + FH / 2, (az + bz) / 2);
      m.rotation.y = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
      g.add(m);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y);
      sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(len / 2, FH / 2 + 0.6, 0.1).setTranslation(m.position.x, Y + FH / 2 + 0.6, m.position.z).setRotation(q));
      const post = std({ color: 0x8a9096, metalness: 0.5 });
      for (let s = 0; s <= len; s += 5) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, FH + 0.6, 6), post);
        p.position.set(ax + ((bx - ax) * s) / len, Y + (FH + 0.6) / 2, az + ((bz - az) * s) / len);
        g.add(p);
      }
      const wire = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), post);
      wire.position.set(m.position.x, Y + FH + 0.5, m.position.z);
      wire.rotation.y = m.rotation.y;
      g.add(wire);
    };
    fenceRun(F.x0, F.z0, gate.x0, F.z0);
    fenceRun(gate.x1, F.z0, F.x1, F.z0);
    fenceRun(F.x1, F.z0, F.x1, F.z1);
    fenceRun(F.x1, F.z1, F.x0, F.z1);
    fenceRun(F.x0, F.z1, F.x0, F.z0);
    // the gate: chained shut, barrier down, concrete blocks in front
    const gateM = std({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
    for (const s of [0, 1]) {
      const gx = gate.x0 + (s + 0.5) * ((gate.x1 - gate.x0) / 2);
      const panel = new THREE.Mesh(new THREE.BoxGeometry((gate.x1 - gate.x0) / 2 - 0.1, FH, 0.1), gateM);
      panel.position.set(gx, Y + FH / 2, F.z0);
      g.add(panel);
      const bars = new THREE.Mesh(new THREE.PlaneGeometry((gate.x1 - gate.x0) / 2 - 0.4, FH - 0.4), new THREE.MeshStandardMaterial({ map: linkTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
      bars.position.set(gx, Y + FH / 2, F.z0 + 0.06);
      void bars;
    }
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid((gate.x1 - gate.x0) / 2, FH / 2 + 0.6, 0.15).setTranslation((gate.x0 + gate.x1) / 2, Y + FH / 2 + 0.6, F.z0));
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 12), std({ color: 0x555555, metalness: 0.8 }));
    chain.position.set((gate.x0 + gate.x1) / 2, Y + 1.4, F.z0 - 0.12);
    g.add(chain);
    for (const dx of [-5, 0, 5]) solidBox(g, sb, 3, 0.9, 0.7, (gate.x0 + gate.x1) / 2 + dx, Y, F.z0 - 3, std({ color: 0xc9c5bc }));
    sign(g, 'AIRPORT CLOSED', (gate.x0 + gate.x1) / 2, Y + 1.7, F.z0 - 0.2, Math.PI, { w: 7, h: 1.2, bg: '#b3261e', fg: '#ffffff' });
    sign(g, 'VERIAN INTERNATIONAL AIRPORT', (gate.x0 + gate.x1) / 2, Y + FH + 2.2, F.z0 - 0.5, Math.PI, { w: 14, h: 1.4, bg: '#1f3b63', fg: '#ffffff', post: Y });
    for (const x of [gate.x0 - 30, gate.x1 + 25, -1400, -1650].filter((x) => x > F.x0 + 4 && x < F.x1 - 4)) sign(g, 'CLOSED · NO ENTRY', x, Y + 1.8, F.z0 - 0.15, Math.PI, { w: 4, h: 0.8, bg: '#b3261e', fg: '#ffffff' });

    // ---- landside road, terminal, tower ----
    this.flat(cx1 - cx0 - 2, 30, (cx0 + cx1) / 2, F.z0 + 15, asphalt);
    this.flat(220, 12, -1200, 452, asphalt);
    const term = { x0: -1310, x1: -1120, z0: 460, z1: 490 };
    const glass = std({ map: (() => { const t = curtainTex('#4a7a8f', 1).clone(); t.needsUpdate = true; t.repeat.set(1, 1); return t; })(), roughness: 0.2, metalness: 0.4 });
    const tw = term.x1 - term.x0, td = term.z1 - term.z0;
    const tg = new THREE.BoxGeometry(tw, 13, td);
    const uv = tg.attributes.uv; const dims = [[td, 13], [td, 13], [tw, td], [tw, td], [tw, 13], [tw, 13]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (uv.getX(k) * dims[f][0]) / 4, (uv.getY(k) * dims[f][1]) / 3.5); }
    const roofM = std({ color: 0xd8d8d4 });
    const tm = new THREE.Mesh(tg, [glass, glass, roofM, roofM, glass, glass]);
    tm.position.set((term.x0 + term.x1) / 2, Y + 6.5, (term.z0 + term.z1) / 2);
    tm.castShadow = tm.receiveShadow = true;
    g.add(tm);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(tw / 2, 6.5, td / 2).setTranslation(tm.position.x, Y + 6.5, tm.position.z));
    solidBox(g, sb, tw + 8, 0.8, td + 10, tm.position.x, Y + 13, tm.position.z, roofM, { collide: false }); // roof overhang
    sign(g, 'VERIAN INTERNATIONAL', tm.position.x, Y + 10.5, term.z0 - 0.06, Math.PI, { w: 30, h: 3, bg: '#1f3b63', fg: '#ffffff', glow: true });
    for (const dx of [-60, 0, 60]) sign(g, 'TEMPORARILY CLOSED', tm.position.x + dx, Y + 4, term.z0 - 0.08, Math.PI, { w: 12, h: 1.6, bg: '#b3261e', fg: '#ffffff' });
    this.mapRects.push({ ...term, color: '#9fb3c0', label: 'Terminal' });
    // control tower
    const towerM = std({ color: 0xd8d3c8 });
    solidBox(g, sb, 6, 30, 6, -1090, Y, 520, towerM);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.8, 5, 8), std({ color: 0x24465e, metalness: 0.6, roughness: 0.1 }));
    cab.position.set(-1090, Y + 32.5, 520);
    g.add(cab);
    solidBox(g, sb, 12, 0.6, 12, -1090, Y + 35, 520, std({ color: 0x5f666c }), { collide: false });

    // ---- apron, taxiway, runway ----
    this.flat(450, 95, -1335, 537.5, concrete, Y + 0.02);
    this.mapRects.push({ x0: -1560, x1: -1110, z0: 490, z1: 585, color: '#9a978f' });
    this.flat(20, 85, -1405, 627, asphalt, Y + 0.025);
    const RW = { x0: -1960, x1: -1160, z: 690, w: 45 };
    const rwLen = RW.x1 - RW.x0;
    const rwTex = canvasTex(256, 64, (c, w, h) => {
      c.fillStyle = '#34373b'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, 0.07);
      c.fillStyle = '#e8e8e4'; c.fillRect(0, h / 2 - 1, w * 0.55, 2); // centre line dash
      c.fillRect(0, 2, w, 1.5); c.fillRect(0, h - 3.5, w, 1.5); // edge lines
    }, [rwLen / 60, 1]);
    this.flat(rwLen, RW.w, (RW.x0 + RW.x1) / 2, RW.z, std({ map: rwTex }), Y + 0.03, Math.PI / 2 * 0);
    this.mapRects.push({ x0: RW.x0, x1: RW.x1, z0: RW.z - RW.w / 2, z1: RW.z + RW.w / 2, color: '#2f3236', label: 'Runway (closed)' });
    // threshold piano keys at both ends
    for (const end of [RW.x0 + 12, RW.x1 - 12]) for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1;
      this.flat(20, 1.6, end, RW.z + s * (4 + (i % 4) * 4.2), white, Y + 0.04);
    }
    // the big yellow crosses that mean "closed"
    for (const x of [RW.x0 + 70, (RW.x0 + RW.x1) / 2, RW.x1 - 70]) {
      for (const r of [Math.PI / 4, -Math.PI / 4]) this.flat(36, 4, x, RW.z, yellow, Y + 0.045, r);
    }
    // cones and barriers across the runway and taxiway
    const coneM = std({ color: 0xff6a1a }), stripeM = std({ color: 0xffffff });
    const cone = (x, z) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 10), coneM);
      c.position.set(x, Y + 0.375, z);
      c.castShadow = true;
      g.add(c);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.12, 10), stripeM);
      s.position.set(x, Y + 0.45, z);
      g.add(s);
    };
    for (const x of [RW.x0 + 40, RW.x1 - 40, (RW.x0 + RW.x1) / 2 - 30, (RW.x0 + RW.x1) / 2 + 30]) for (let z = RW.z - 20; z <= RW.z + 20; z += 3) cone(x, z);
    for (let x = -1413; x <= -1397; x += 2.5) cone(x, 600);
    for (const dx of [-6, 0, 6]) {
      solidBox(g, sb, 4, 1, 0.5, -1405 + dx * 0, Y, 592 + dx, std({ color: 0xd9d4ca }));
    }

    // ---- parked airliners ----
    const liveries = [0x1f5fbf, 0xc23b2a, 0x2a8a5a];
    [-1480, -1370, -1240].forEach((x, i) => this.airliner(x, 540, liveries[i]));

    // ---- hangars ----
    for (const hx of [-1720, -1840]) {
      const hz = 530;
      solidBox(g, sb, 70, 12, 45, hx, Y, hz, std({ color: 0xa9adb1 }));
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(22.5, 22.5, 70, 20, 1, false, 0, Math.PI), std({ color: 0x8a9096, metalness: 0.4, side: THREE.DoubleSide }));
      roof.rotation.z = Math.PI / 2;
      roof.scale.set(1, 1, 0.35);
      roof.position.set(hx, Y + 12, hz);
      roof.castShadow = true;
      g.add(roof);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(60, 10), std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#7d8084'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, 0, 1, h); } }) }));
      door.position.set(hx, Y + 5, hz + 22.56);
      g.add(door);
      this.mapRects.push({ x0: hx - 35, x1: hx + 35, z0: hz - 22.5, z1: hz + 22.5, color: '#8f969c' });
    }
  }

  // A twin-engine airliner, nose pointing north (-Z).
  airliner(x, z, livery) {
    const g = this.group, sb = this.sb;
    const white = std({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.2 });
    const liv = std({ color: livery, roughness: 0.5 });
    const dark = std({ color: 0x1a1d22, roughness: 0.3 });
    const grey = std({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
    const Y0 = Y + 4.2;
    const add = (geo, m, px, py, pz, rx = 0, ry = 0, rz = 0, sc = null) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x + px, py, z + pz);
      mesh.rotation.set(rx, ry, rz);
      if (sc) mesh.scale.set(...sc);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(new THREE.CylinderGeometry(2.4, 2.4, 30, 16), white, 0, Y0, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(2.4, 16, 10), white, 0, Y0, -15, 0, 0, 0, [1, 1, 1.7]);
    add(new THREE.ConeGeometry(2.4, 10, 16), white, 0, Y0 + 0.5, 20, Math.PI / 2, 0, 0, [1, 1, 0.7]);
    add(new THREE.BoxGeometry(1.8, 0.6, 0.3), dark, 0, Y0 + 1.1, -18.6, -0.6); // cockpit glass
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.05, 0.45, 25), dark, s * 2.38, Y0 + 0.7, 0); // windows
      add(new THREE.BoxGeometry(0.05, 0.5, 30), liv, s * 2.39, Y0 - 0.4, 0); // cheatline
      add(new THREE.BoxGeometry(15, 0.4, 5), white, s * 9.2, Y0 - 1.2, 0, 0, s * -0.32); // wing
      add(new THREE.CylinderGeometry(1.1, 1, 4.2, 14), grey, s * 7, Y0 - 2.6, -3, Math.PI / 2); // engine
      add(new THREE.BoxGeometry(6, 0.3, 2.5), white, s * 3.6, Y0 + 1.6, 21, 0, s * -0.3); // tailplane
      add(new THREE.CylinderGeometry(0.25, 0.25, 2.6, 8), dark, s * 2.5, 1.3 + Y - Y + Y, 1, 0, 0, Math.PI / 2 * 0); // main gear leg
      add(new THREE.CylinderGeometry(0.6, 0.6, 0.6, 12), dark, s * 2.5, Y + 0.6, 1, 0, 0, Math.PI / 2);
    }
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.4, 10), dark, 0, Y + 0.4, -12, 0, 0, Math.PI / 2); // nose wheel
    add(new THREE.CylinderGeometry(0.15, 0.15, 2.6, 8), dark, 0, Y + 1.6, -12);
    add(new THREE.BoxGeometry(0.4, 6.5, 5), liv, 0, Y0 + 4.5, 20.5, -0.35); // fin
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(2.4, 2.4, 20).setTranslation(x, Y0, z + 1));
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(16, 0.4, 3).setTranslation(x, Y0 - 1.2, z));
    sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(Y0 / 2, 0.6).setTranslation(x, Y0 / 2, z));
    this.mapRects.push({ x0: x - 17, x1: x + 17, z0: z - 19, z1: z + 24, color: '#e8e8e4', plane: true });
  }
}
