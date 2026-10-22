import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { std, canvasTex, speckle } from './buildkit.js';
import { mergeStatic } from './merge.js';

// The Ashen Hand's hideout: an abandoned underground lab under Cherry Estate, laid out as a
// maze of dark tiled rooms. A blood trail leads to the documents. Built the first time you go down.

export const MANSION = { x: -1480, y: -32, z: 300 }; // below the park's bedrock, above the -40 m safety net // corner of the maze (world)
const N = 8; // cells per side
const CELL = 6.5;
const H = 4.2;
const WALL = 0.3;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class Mansion {
  constructor(game) {
    this.game = game;
    this.sb = game.portSandbox;
    this.built = false;
    this.docs = [];
    this.size = N * CELL;
  }

  // world position of a cell's centre (floor level)
  cell(i, j) { return new THREE.Vector3(MANSION.x + (i + 0.5) * CELL, MANSION.y, MANSION.z + (j + 0.5) * CELL); }

  inside(p) {
    return p.x > MANSION.x - 4 && p.x < MANSION.x + this.size + 4 && p.z > MANSION.z - 12 && p.z < MANSION.z + this.size + 4 && p.y < MANSION.y + H + 6 && p.y > MANSION.y - 6;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const g = (this.group = new THREE.Group());
    this.game.scene.add(g);
    const sb = this.sb;
    const R = rng(1987);
    const pick = (a) => a[Math.floor(R() * a.length)];

    // ---- the maze: recursive backtracker ----
    const walls = { h: [], v: [] }; // h[i][j]: wall on the south side of cell (i,j); v[i][j]: east side
    for (let i = 0; i < N; i++) { walls.h.push(Array(N).fill(true)); walls.v.push(Array(N).fill(true)); }
    const seen = Array.from({ length: N }, () => Array(N).fill(false));
    const depth = Array.from({ length: N }, () => Array(N).fill(0));
    const stack = [[0, 0]];
    seen[0][0] = true;
    while (stack.length) {
      const [i, j] = stack.at(-1);
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => [i + di, j + dj, di, dj]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen[a][b]);
      if (!nb.length) { stack.pop(); continue; }
      const [a, b, di, dj] = nb[Math.floor(R() * nb.length)];
      if (di === 1) walls.v[i][j] = false; if (di === -1) walls.v[a][b] = false;
      if (dj === 1) walls.h[i][j] = false; if (dj === -1) walls.h[a][b] = false;
      seen[a][b] = true;
      depth[a][b] = depth[i][j] + 1;
      stack.push([a, b]);
    }
    // a few extra openings so it's a maze of rooms, not one long corridor
    for (let k = 0; k < 9; k++) {
      const i = Math.floor(R() * (N - 1)), j = Math.floor(R() * (N - 1));
      if (R() < 0.5) walls.v[i][j] = false; else walls.h[i][j] = false;
    }

    this.walls = walls;
    // ---- materials: a derelict underground lab, tiles and steel, lit by a few dying tubes ----
    const tileT = (base, grout, dirt) => canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = grout; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { c.fillStyle = base; c.fillRect(x + 1, y + 1, 14, 14); }
      for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(${dirt},${0.05 + R() * 0.2})`; c.beginPath(); c.arc(R() * w, R() * h, 2 + R() * 14, 0, 7); c.fill(); }
      for (let k = 0; k < 8; k++) { c.fillStyle = `rgba(${dirt},0.25)`; c.fillRect(R() * w, R() * h * 0.3, 1 + R() * 2, 20 + R() * 60); } // streaks
      speckle(c, w, h, 300, 0.08);
    });
    const wallTs = [['#c9d1c8', '#7d857c', '60,50,30'], ['#b8c4c9', '#6e787c', '50,45,35'], ['#cfd3c0', '#80846f', '70,55,30']].map(([a, b2, d]) => {
      const t = tileT(a, b2, d); t.repeat.set(2, 1.3);
      return std({ map: t, roughness: 0.4, metalness: 0.1 });
    });
    const floorT = canvasTex(256, 256, (c, w, h) => {
      for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { c.fillStyle = (x + y) / 32 % 2 ? '#3a3f3c' : '#2c302e'; c.fillRect(x, y, 32, 32); }
      for (let k = 0; k < 60; k++) { c.fillStyle = `rgba(20,15,10,${0.1 + R() * 0.3})`; c.beginPath(); c.arc(R() * w, R() * h, 3 + R() * 20, 0, 7); c.fill(); }
      speckle(c, w, h, 600, 0.1);
    });
    floorT.repeat.set(this.size / 6, this.size / 6);
    const floorM = std({ map: floorT, roughness: 0.6, metalness: 0.15 });
    const ceilM = std({ color: 0x2a2e2c, roughness: 0.9 });
    const panelM = std({ color: 0x3a4a44, roughness: 0.5, metalness: 0.4 }); // steel kick plates
    const trimM = std({ color: 0x5a6266, roughness: 0.4, metalness: 0.7 });
    const tubeOn = std({ color: 0xd8fff0, emissive: 0xb8ffe0, emissiveIntensity: 1.2 });
    const tubeOff = std({ color: 0x5a6060, roughness: 0.5 });
    const pipeM = std({ color: 0x4a5258, roughness: 0.45, metalness: 0.75 });
    const glowM = std({ color: 0x9fffc8, emissive: 0x4fff9a, emissiveIntensity: 1.4 });

    const X0 = MANSION.x, Z0 = MANSION.z, Y = MANSION.y;
    const box = (w, h, d, x, y, z, m, collide = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y + h / 2, z);
      mesh.receiveShadow = true;
      g.add(mesh);
      if (collide) sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z));
      return mesh;
    };
    const S = this.size;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(S, S), floorM);
    fl.rotation.x = -Math.PI / 2; fl.position.set(X0 + S / 2, Y + 0.01, Z0 + S / 2);
    g.add(fl);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(S / 2 + 2, 0.5, S / 2 + 2).setTranslation(X0 + S / 2, Y - 0.5, Z0 + S / 2));
    box(S + 1, 0.3, S + 1, X0 + S / 2, Y + H, Z0 + S / 2, ceilM);
    // a tiled wall with a steel kick plate and a pipe run along the top
    const segment = (x, z, len, alongX) => {
      const w = alongX ? len + WALL : WALL, d = alongX ? WALL : len + WALL;
      box(w, H, d, x, Y, z, pick(wallTs));
      box(w + (alongX ? 0 : 0.06), 0.5, d + (alongX ? 0.06 : 0), x, Y, z, panelM, false);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 8), pipeM);
      pipe.rotation.set(alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
      pipe.position.set(x + (alongX ? 0 : 0.22), Y + H - 0.35, z + (alongX ? 0.22 : 0));
      g.add(pipe);
    };
    for (let i = 0; i < N; i++) {
      segment(X0 + (i + 0.5) * CELL, Z0, CELL, true);
      if (i !== 0) segment(X0 + (i + 0.5) * CELL, Z0 + S, CELL, true);
      segment(X0, Z0 + (i + 0.5) * CELL, CELL, false);
      segment(X0 + S, Z0 + (i + 0.5) * CELL, CELL, false);
    }
    segment(X0 + 0.5 * CELL, Z0 + S, CELL, true);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (walls.v[i][j] && i < N - 1) segment(X0 + (i + 1) * CELL, Z0 + (j + 0.5) * CELL, CELL, false);
      if (walls.h[i][j] && j < N - 1) segment(X0 + (i + 0.5) * CELL, Z0 + (j + 1) * CELL, CELL, true);
    }

    // ---- furnishings: strip lights (most of them dead), benches, cabinets, tanks, gurneys ----
    const benchM = std({ color: 0x8a9096, roughness: 0.35, metalness: 0.7 });
    const topM = std({ color: 0x1f2422, roughness: 0.6 });
    const tankGlass = std({ color: 0x5affb0, roughness: 0.1, transparent: true, opacity: 0.22, emissive: 0x1a8a50, emissiveIntensity: 0.6 });
    const sheetM = std({ color: 0xc9cfc8, roughness: 0.9 });
    this.flicker = [];
    const deadEnds = [];
    const wallSides = (i, j) => {
      const sides = [];
      if (j === 0 || walls.h[i][j - 1]) sides.push([0, -1]);
      if (j === N - 1 || walls.h[i][j]) sides.push([0, 1]);
      if (i === 0 || walls.v[i - 1][j]) sides.push([-1, 0]);
      if (i === N - 1 || walls.v[i][j]) sides.push([1, 0]);
      return sides;
    };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = this.cell(i, j);
      const open = [i < N - 1 && !walls.v[i][j], i > 0 && !walls.v[i - 1][j], j < N - 1 && !walls.h[i][j], j > 0 && !walls.h[i][j - 1]].filter(Boolean).length;
      if (open === 1 && (i + j) > 3) deadEnds.push({ i, j, d: depth[i][j] });
      // a strip light in every room; only a few still work, and some of those flicker
      const r = R();
      const tube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.16), r < 0.22 ? tubeOn.clone() : tubeOff);
      tube.position.set(c.x, Y + H - 0.08, c.z);
      box(1.5, 0.05, 0.3, c.x, Y + H - 0.06, c.z, trimM, false);
      if (r < 0.22) { tube.userData.noMerge = true; if (R() < 0.6) this.flicker.push({ m: tube.material, ph: R() * 10, sp: 3 + R() * 9 }); }
      g.add(tube);
      // furniture against a wall
      const sides = wallSides(i, j);
      if (!sides.length || (i === 0 && j === N - 1)) continue;
      const [sx, sz] = pick(sides);
      const along = sx === 0; // the wall runs along x
      const wx = c.x + sx * (CELL / 2 - 0.75), wz = c.z + sz * (CELL / 2 - 0.75);
      const kind = R();
      if (kind < 0.35) { // workbench with junk on it
        box(along ? 2.4 : 0.9, 0.9, along ? 0.9 : 2.4, wx, Y, wz, benchM);
        box(along ? 2.5 : 1, 0.05, along ? 1 : 2.5, wx, Y + 0.9, wz, topM, false);
        for (let k = 0; k < 3; k++) box(0.14, 0.22, 0.14, wx + (along ? (k - 1) * 0.6 : 0), Y + 0.95, wz + (along ? 0 : (k - 1) * 0.6), k === 1 ? glowM : trimM, false);
      } else if (kind < 0.55) { // a specimen tank, still lit from inside
        box(1.1, 0.35, 1.1, wx, Y, wz, trimM);
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.1, 16), tankGlass);
        tank.position.set(wx, Y + 1.4, wz); tank.userData.noMerge = true; g.add(tank);
        box(1.1, 0.25, 1.1, wx, Y + 2.45, wz, trimM, false);
        sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(1.05, 0.5).setTranslation(wx, Y + 1.4, wz));
      } else if (kind < 0.75) { // filing cabinets
        for (let k = 0; k < 2; k++) box(0.6, 1.4, 0.6, wx + (along ? (k - 0.5) * 0.7 : 0), Y, wz + (along ? 0 : (k - 0.5) * 0.7), pick([benchM, panelM]));
      } else if (kind < 0.88) { // a gurney with a sheet over it
        const gx = c.x + sx * 0.8, gz = c.z + sz * 0.8;
        box(along ? 2 : 0.8, 0.8, along ? 0.8 : 2, gx, Y, gz, benchM);
        box(along ? 1.9 : 0.75, 0.18, along ? 0.75 : 1.9, gx, Y + 0.8, gz, sheetM, false);
      }
    }

    // ---- the way in: the stairs down from the bunker, and the door back up ----
    const e = this.cell(0, N - 1);
    this.entry = new THREE.Vector3(e.x, Y + 1, e.z + 1);
    this.exit = new THREE.Vector3(e.x, Y, Z0 + S - 0.4);
    box(1.6, 2.4, 0.15, e.x, Y, Z0 + S - WALL / 2 - 0.1, std({ color: 0x3f4a44, metalness: 0.6, roughness: 0.5 }), false);
    const exitLamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.06), std({ color: 0x40ff60, emissive: 0x20ff40, emissiveIntensity: 1.5 }));
    exitLamp.position.set(e.x, Y + 2.7, Z0 + S - WALL / 2 - 0.2); g.add(exitLamp);

    // ---- the documents: on desks in the two deepest dead ends, under a desk lamp ----
    deadEnds.sort((a, b) => b.d - a.d);
    const picks = [];
    for (const de of deadEnds) { if (picks.every((p) => Math.abs(p.i - de.i) + Math.abs(p.j - de.j) > 3)) picks.push(de); if (picks.length === 2) break; }
    while (picks.length < 2) picks.push(deadEnds[picks.length] || { i: N - 1, j: picks.length });
    const deskM = std({ color: 0x3a3f42, roughness: 0.5, metalness: 0.5 });
    const paperM = std({ color: 0xf4ecd8, emissive: 0xfff2c0, emissiveIntensity: 0.35 });
    const lampM = std({ color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 1.6 });
    this.docSpots = picks.map((de) => {
      const c = this.cell(de.i, de.j);
      box(1.6, 0.8, 0.8, c.x, Y, c.z, deskM);
      box(0.08, 0.35, 0.08, c.x + 0.6, Y + 0.8, c.z - 0.2, trimM, false);
      box(0.25, 0.12, 0.25, c.x + 0.6, Y + 1.15, c.z - 0.2, lampM, false);
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3), paperM);
      paper.position.set(c.x - 0.2, Y + 0.82, c.z);
      paper.userData.noMerge = true;
      g.add(paper);
      return { pos: new THREE.Vector3(c.x - 0.2, Y + 0.82, c.z), mesh: paper, cell: de };
    });

    // ---- a blood trail from the stairs to each document, along the way through the maze ----
    this.bloodTrail(g, [0, N - 1], picks, R);

    mergeStatic(g);
  }

  // Shortest way through the maze between two cells.
  path(from, to) {
    const W = this.walls, key = (i, j) => i * N + j;
    const prev = new Map([[key(...from), null]]);
    const q = [from];
    while (q.length) {
      const [i, j] = q.shift();
      if (i === to[0] && j === to[1]) break;
      const nb = [];
      if (i < N - 1 && !W.v[i][j]) nb.push([i + 1, j]);
      if (i > 0 && !W.v[i - 1][j]) nb.push([i - 1, j]);
      if (j < N - 1 && !W.h[i][j]) nb.push([i, j + 1]);
      if (j > 0 && !W.h[i][j - 1]) nb.push([i, j - 1]);
      for (const n of nb) if (!prev.has(key(...n))) { prev.set(key(...n), [i, j]); q.push(n); }
    }
    const out = [];
    for (let c = to; c; c = prev.get(key(...c))) out.unshift(c);
    return out;
  }

  bloodTrail(g, start, picks, R) {
    const tex = canvasTex(64, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const blob = (x, y, r, a) => { c.fillStyle = `rgba(110,4,6,${a})`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
      blob(32, 32, 14, 0.85);
      for (let k = 0; k < 9; k++) blob(32 + (R() - 0.5) * 40, 32 + (R() - 0.5) * 40, 2 + R() * 6, 0.8);
      blob(30, 30, 8, 0.6);
    });
    const smearTex = canvasTex(32, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(110,4,6,0)'); gr.addColorStop(0.3, 'rgba(110,4,6,0.75)'); gr.addColorStop(1, 'rgba(90,2,4,0.9)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.35, h * 0.48, 0, 0, 7); c.fill();
    });
    // a faint sheen so it catches what little light there is
    const dropM = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x5a0000, emissiveIntensity: 0.55, transparent: true, depthWrite: false, roughness: 0.15, polygonOffset: true, polygonOffsetFactor: -3 });
    const smearM = new THREE.MeshStandardMaterial({ map: smearTex, emissiveMap: smearTex, emissive: 0x5a0000, emissiveIntensity: 0.55, transparent: true, depthWrite: false, roughness: 0.15, polygonOffset: true, polygonOffsetFactor: -3 });
    const drops = [], smears = [];
    const Y = MANSION.y + 0.03;
    for (const pk of picks) {
      const cells = this.path(start, [pk.i, pk.j]).map(([i, j]) => this.cell(i, j));
      cells.push(this.cell(pk.i, pk.j)); // finish at the desk
      for (let k = 0; k < cells.length - 1; k++) {
        const a = cells[k], b = cells[k + 1];
        const len = a.distanceTo(b);
        const dir = b.clone().sub(a).normalize();
        for (let t = 0; t < len; t += 0.55 + R() * 0.5) {
          const p = a.clone().addScaledVector(dir, t);
          const side = Math.sin((k * 7 + t) * 1.3) * 0.35 + (R() - 0.5) * 0.25;
          p.x += -dir.z * side; p.z += dir.x * side;
          if (R() < 0.25) smears.push({ p, yaw: Math.atan2(dir.x, dir.z) + (R() - 0.5) * 0.3, s: 0.5 + R() * 0.5 });
          else drops.push({ p, yaw: R() * 6, s: 0.18 + R() * 0.3 });
        }
      }
      // a pool under the desk
      const c = this.cell(pk.i, pk.j);
      drops.push({ p: c.clone().add(new THREE.Vector3(0.3, 0, 0.5)), yaw: 0, s: 1.4 });
    }
    const place = (list, mat, w, h) => {
      const geo = new THREE.PlaneGeometry(w, h); geo.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      list.forEach((d, k) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw); sc.set(d.s, 1, d.s); m.compose(new THREE.Vector3(d.p.x, Y, d.p.z), q, sc); im.setMatrixAt(k, m); });
      im.userData.noMerge = true;
      im.frustumCulled = false;
      g.add(im);
    };
    place(drops, dropM, 1, 1);
    place(smears, smearM, 0.35, 1.3);
  }

  // dying strip lights
  update(time) {
    for (const f of this.flicker || []) {
      const v = Math.sin(time * f.sp + f.ph) + Math.sin(time * f.sp * 2.7 + f.ph * 3);
      f.m.emissiveIntensity = v > 1.2 ? 0.05 : v > -1.5 ? 1.1 : 0.4;
    }
  }
}
