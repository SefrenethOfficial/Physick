import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { std, canvasTex, speckle } from './buildkit.js';
import { mergeStatic } from './merge.js';

// The Ashen Hand's hideout: an old mansion's worth of rooms dug out under Cherry Estate,
// laid out as a maze. It's built the first time you go down, well below the park.

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

    // ---- materials ----
    const wallpaper = (base, line) => canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      c.strokeStyle = line; c.lineWidth = 2;
      for (let x = 8; x < w; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      c.fillStyle = line;
      for (let y = 8; y < h; y += 32) for (let x = 0; x < w; x += 16) { c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill(); }
      speckle(c, w, h, 200, 0.05);
    });
    const papers = [['#5a1f24', '#7a3a30'], ['#1f3a2c', '#335a40'], ['#2a2a4a', '#45457a']].map(([a, b]) => {
      const t = wallpaper(a, b); t.repeat.set(2, 1.2);
      return std({ map: t, roughness: 0.85, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.18 });
    });
    const parquetT = canvasTex(256, 256, (c, w, h) => {
      for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 64) {
        const off = (y / 32) % 2 ? 32 : 0;
        c.fillStyle = ['#6a4426', '#5d3a20', '#734b2a', '#55361e'][Math.floor(Math.random() * 4)];
        c.fillRect(x + off, y, 64, 32); c.fillRect(x + off - 64, y, 64, 32);
        c.strokeStyle = 'rgba(0,0,0,.35)'; c.strokeRect(x + off, y, 64, 32);
      }
    });
    parquetT.repeat.set(this.size / 4, this.size / 4);
    const floorM = std({ map: parquetT, roughness: 0.55, emissive: 0xffffff, emissiveMap: parquetT, emissiveIntensity: 0.12 });
    const ceilM = std({ color: 0xd9cdb4, roughness: 0.9, emissive: 0xd9cdb4, emissiveIntensity: 0.12 });
    const panelM = std({ color: 0x3a2516, roughness: 0.6 });
    const trimM = std({ color: 0xb8954a, roughness: 0.35, metalness: 0.7 });
    const glowM = std({ color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 1.6 });
    const rugMs = [0x7a1f2a, 0x1f3f6a, 0x5a3a1a].map((c) => std({ color: c, roughness: 1 }));

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
    // floor, ceiling and the outer shell
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(S, S), floorM);
    fl.rotation.x = -Math.PI / 2; fl.position.set(X0 + S / 2, Y + 0.01, Z0 + S / 2);
    g.add(fl);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(S / 2 + 2, 0.5, S / 2 + 2).setTranslation(X0 + S / 2, Y - 0.5, Z0 + S / 2));
    box(S + 1, 0.3, S + 1, X0 + S / 2, Y + H, Z0 + S / 2, ceilM);
    // a wall segment with wallpaper, a dark wainscot and a brass rail
    const segment = (x, z, len, alongX) => {
      const w = alongX ? len + WALL : WALL, d = alongX ? WALL : len + WALL;
      box(w, H, d, x, Y, z, pick(papers));
      box(w + (alongX ? 0 : 0.06), 1.1, d + (alongX ? 0.06 : 0), x, Y, z, panelM, false);
      box(w + (alongX ? 0 : 0.08), 0.06, d + (alongX ? 0.08 : 0), x, Y + 1.1, z, trimM, false);
    };
    for (let i = 0; i < N; i++) {
      segment(X0 + (i + 0.5) * CELL, Z0, CELL, true); // north edge
      if (i !== 0) segment(X0 + (i + 0.5) * CELL, Z0 + S, CELL, true);
      segment(X0, Z0 + (i + 0.5) * CELL, CELL, false);
      segment(X0 + S, Z0 + (i + 0.5) * CELL, CELL, false);
    }
    segment(X0 + 0.5 * CELL, Z0 + S, CELL, true);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (walls.v[i][j] && i < N - 1) segment(X0 + (i + 1) * CELL, Z0 + (j + 0.5) * CELL, CELL, false);
      if (walls.h[i][j] && j < N - 1) segment(X0 + (i + 0.5) * CELL, Z0 + (j + 1) * CELL, CELL, true);
    }

    // ---- furnishings: chandeliers, rugs, side tables, paintings ----
    const painting = () => canvasTex(96, 72, (c, w, h) => {
      const hue = Math.floor(R() * 360);
      c.fillStyle = `hsl(${hue},35%,25%)`; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 6; k++) { c.fillStyle = `hsla(${(hue + k * 40) % 360},45%,${30 + k * 6}%,0.8)`; c.beginPath(); c.arc(R() * w, R() * h, 6 + R() * 20, 0, 7); c.fill(); }
      c.strokeStyle = '#c9a24a'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    });
    const deadEnds = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = this.cell(i, j);
      const open = [i < N - 1 && !walls.v[i][j], i > 0 && !walls.v[i - 1][j], j < N - 1 && !walls.h[i][j], j > 0 && !walls.h[i][j - 1]].filter(Boolean).length;
      if (open === 1 && (i + j) > 3) deadEnds.push({ i, j, d: depth[i][j] });
      if ((i + j) % 2 === 0) { // chandelier
        box(0.05, 0.7, 0.05, c.x, Y + H - 0.7, c.z, trimM, false);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 16), trimM);
        ring.rotation.x = Math.PI / 2; ring.position.set(c.x, Y + H - 0.75, c.z); g.add(ring);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; box(0.08, 0.14, 0.08, c.x + Math.cos(a) * 0.5, Y + H - 0.72, c.z + Math.sin(a) * 0.5, glowM, false); }
      }
      if (R() < 0.45) box(2.6, 0.02, 1.7, c.x, Y + 0.01, c.z, pick(rugMs), false);
      if (R() < 0.35) { // painting on a wall that's there
        const sides = [];
        if (j === 0 || walls.h[i][j - 1]) sides.push([0, -1]);
        if (j === N - 1 || walls.h[i][j]) sides.push([0, 1]);
        if (i === 0 || walls.v[i - 1][j]) sides.push([-1, 0]);
        if (i === N - 1 || walls.v[i][j]) sides.push([1, 0]);
        if (sides.length) {
          const [sx, sz] = pick(sides);
          const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), std({ map: painting(), roughness: 0.6, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.05 }));
          p.material.emissiveMap = p.material.map;
          p.position.set(c.x + sx * (CELL / 2 - WALL / 2 - 0.02), Y + 2.2, c.z + sz * (CELL / 2 - WALL / 2 - 0.02));
          p.rotation.y = Math.atan2(-sx, -sz);
          p.userData.noMerge = true;
          g.add(p);
        }
      }
    }

    // ---- the way in: a stair landing at the entrance cell, with the door back up ----
    const e = this.cell(0, N - 1);
    this.entry = new THREE.Vector3(e.x, Y + 1, e.z + 1);
    this.exit = new THREE.Vector3(e.x, Y, Z0 + S - 0.4);
    box(1.6, 2.4, 0.15, e.x, Y, Z0 + S - WALL / 2 - 0.1, std({ color: 0x3f4a44, metalness: 0.6, roughness: 0.5 }), false);
    for (let k = 0; k < 4; k++) box(1.8, 0.2, 0.4, e.x, Y + 2.5 + k * 0.2, Z0 + S - 0.4 - k * 0.0, panelM, false);

    // ---- the documents: on writing desks in the two deepest dead ends ----
    deadEnds.sort((a, b) => b.d - a.d);
    const picks = [];
    for (const de of deadEnds) { if (picks.every((p) => Math.abs(p.i - de.i) + Math.abs(p.j - de.j) > 3)) picks.push(de); if (picks.length === 2) break; }
    while (picks.length < 2) picks.push(deadEnds[picks.length] || { i: N - 1, j: picks.length });
    const deskM = std({ color: 0x4a2c18, roughness: 0.5 });
    const paperM = std({ color: 0xf4ecd8, emissive: 0xfff2c0, emissiveIntensity: 0.5 });
    this.docSpots = picks.map((de) => {
      const c = this.cell(de.i, de.j);
      box(1.6, 0.8, 0.8, c.x, Y, c.z, deskM);
      box(0.08, 0.35, 0.08, c.x + 0.6, Y + 0.8, c.z - 0.2, trimM, false);
      box(0.25, 0.12, 0.25, c.x + 0.6, Y + 1.15, c.z - 0.2, glowM, false); // desk lamp
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3), paperM);
      paper.position.set(c.x - 0.2, Y + 0.82, c.z);
      paper.userData.noMerge = true;
      g.add(paper);
      return { pos: new THREE.Vector3(c.x - 0.2, Y + 0.82, c.z), mesh: paper };
    });

    mergeStatic(g);
  }
}
