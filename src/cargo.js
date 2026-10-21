import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAND_Y } from './world.js';
import { canvasTex, speckle, std, sign, worldBox } from './buildkit.js';
import { pier } from './city.js';
import { mergeStatic } from './merge.js';

// The MV Halvard: a container ship tied up off Saltmarsh's west shore, carrying the Ashen
// Hand's bomb parts. Static, walkable deck with container stacks, a superstructure aft and a
// clear foredeck where a helicopter can come in.

export const SHIP = { x: -1205, z: -1560, len: 140, beam: 22 };
export const DECK = LAND_Y + 7;

export class CargoShip {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.build();
    mergeStatic(this.group);
  }

  // local (x across, z along, bow at +z) → world
  w(x, y, z) { return new THREE.Vector3(SHIP.x + x, y, SHIP.z + z); }

  onDeck(p, margin = 0) {
    const lx = p.x - SHIP.x, lz = p.z - SHIP.z;
    const half = lz > 45 ? (SHIP.beam / 2) * Math.max(0, (70 - lz) / 25) : SHIP.beam / 2;
    return Math.abs(lx) < half + margin && lz > -70 - margin && lz < 70 + margin && p.y > DECK - 3 && p.y < DECK + 20;
  }

  build() {
    const g = this.group, sb = this.sb;
    const B = SHIP.beam / 2, Hb = DECK + 4; // hull from 4 m below the water to the deck
    const col = (desc) => sb.addStaticCollider(desc);
    const box = (w, h, d, x, y, z, m, solid = true, tile = 4) => {
      const mesh = new THREE.Mesh(worldBox(w, h, d, tile), m);
      const p = this.w(x, y + h / 2, z);
      mesh.position.copy(p);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      if (solid) col(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, p.y, p.z));
      return mesh;
    };
    // ---- hull: square stern, straight sides, a pointed bow ----
    const hullT = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#1f2f4a'; c.fillRect(0, 0, w, h * 0.72);
      c.fillStyle = '#8a2a22'; c.fillRect(0, h * 0.72, w, h);
      c.fillStyle = '#f2f2ee'; c.fillRect(0, h * 0.7, w, 2);
      speckle(c, w, h, 160, 0.08);
      c.fillStyle = 'rgba(120,60,30,.25)'; for (let i = 0; i < 6; i++) c.fillRect(Math.random() * w, h * 0.1, 2, h * 0.5);
    });
    hullT.repeat.set(SHIP.len / 16, 1);
    const shape = new THREE.Shape();
    shape.moveTo(-B, 70); shape.lineTo(-B, -45); shape.quadraticCurveTo(-B * 0.6, -66, 0, -71); shape.quadraticCurveTo(B * 0.6, -66, B, -45); shape.lineTo(B, 70); shape.closePath();
    // (shape y is -z: the bow is at shape y = -71)
    const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: Hb, bevelEnabled: false });
    hullGeo.rotateX(-Math.PI / 2); // extrude goes up; shape y → -z
    const uv = hullGeo.attributes.uv, pos = hullGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / 16, pos.getY(i) / Hb);
    const hull = new THREE.Mesh(hullGeo, std({ map: hullT, roughness: 0.6 }));
    hull.position.set(SHIP.x, -4, SHIP.z);
    hull.receiveShadow = true;
    g.add(hull);
    col(RAPIER.ColliderDesc.cuboid(B, Hb / 2, 57.5).setTranslation(SHIP.x, -4 + Hb / 2, SHIP.z - 12.5));
    const bowPts = [];
    for (const y of [-4, DECK]) for (const [x, z] of [[-B, 45], [B, 45], [-B * 0.55, 62], [B * 0.55, 62], [0, 71]]) bowPts.push(SHIP.x + x, y, SHIP.z + z);
    col(RAPIER.ColliderDesc.convexHull(new Float32Array(bowPts)));
    // deck plating
    const deckT = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#6e3b30'; c.fillRect(0, 0, w, h); speckle(c, w, h, 300, 0.1);
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.strokeRect(0, 0, w, h);
    });
    const deckGeo = new THREE.ShapeGeometry(shape);
    deckGeo.rotateX(-Math.PI / 2);
    const duv = deckGeo.attributes.uv, dpos = deckGeo.attributes.position;
    for (let i = 0; i < duv.count; i++) duv.setXY(i, dpos.getX(i) / 4, dpos.getZ(i) / 4);
    const deck = new THREE.Mesh(deckGeo, std({ map: deckT, roughness: 0.8 }));
    deck.position.set(SHIP.x, DECK + 0.01, SHIP.z);
    deck.receiveShadow = true;
    g.add(deck);
    // name on the bow and stern
    for (const s of [-1, 1]) sign(g, 'MV HALVARD', SHIP.x + s * (B + 0.05), DECK - 1.6, SHIP.z + 32, s * Math.PI / 2, { w: 9, h: 1.3, bg: '#1f2f4a', fg: '#f2f2ee' });
    sign(g, 'HALVARD · MONROVIA', SHIP.x, DECK - 2, SHIP.z - 70.06, Math.PI, { w: 9, h: 1, bg: '#1f2f4a', fg: '#f2f2ee' });

    // ---- railings round the deck edge (they keep you, and the bomb parts, honest: chest high) ----
    const rail = std({ color: 0xd8d4c8, roughness: 0.5, metalness: 0.4 });
    const railRun = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (const y of [0.55, 1.05]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), rail);
        m.position.copy(this.w(cx, DECK + y, cz)); m.rotation.y = ang; g.add(m);
      }
      for (let t = 0; t <= len; t += 2.5) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), rail);
        p.position.copy(this.w(x0 + (x1 - x0) * (t / len), DECK + 0.55, z0 + (z1 - z0) * (t / len))); g.add(p);
      }
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const c = this.w(cx, DECK + 0.55, cz);
      col(RAPIER.ColliderDesc.cuboid(0.05, 0.55, len / 2).setTranslation(c.x, c.y, c.z).setRotation(q));
    };
    railRun(-B + 0.1, -70, -B + 0.1, 45); railRun(B - 0.1, -70, B - 0.1, 45);
    railRun(-B + 0.1, 45, 0, 70.5); railRun(B - 0.1, 45, 0, 70.5);
    railRun(-B + 0.1, -69.9, B - 0.1, -69.9);

    // ---- container stacks either side of a centre aisle ----
    const CC = ['#b3261e', '#1f5f9e', '#2f7a3a', '#d97a1f', '#6a6e74', '#7a2f6a', '#c9a23a'];
    const contM = CC.map((hex) => std({ map: canvasTex(64, 32, (c, w, h) => {
      c.fillStyle = hex; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 4) { c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x, 0, 1, h); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x + 1, 0, 1, h); }
      speckle(c, w, h, 60, 0.1);
    }), roughness: 0.75 }));
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    this.coverSpots = [];
    for (const bz of [-40, -26, -12, 2, 16, 30]) for (const cx of [-8.6, -6.0, 6.0, 8.6]) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) box(2.44, 2.6, 12.2, cx, DECK + k * 2.6, bz, contM[Math.floor(rnd() * CC.length)], true, 2.6);
    }
    // crates and drums down the aisle for cover
    const crateM = std({ color: 0x8a6a48, roughness: 0.9 });
    const drumM = std({ color: 0x2f5a8a, roughness: 0.5, metalness: 0.4 });
    for (const [x, z, t] of [[-2, -33, 'c'], [2.2, -19, 'd'], [-1.5, -5, 'c'], [2, 9, 'c'], [-2.2, 23, 'd'], [1, 37, 'c'], [-3, 41, 'd']]) {
      if (t === 'c') box(1.6, 1.2, 1.6, x, DECK, z, crateM);
      else { for (const dx of [0, 0.8]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 12), drumM); d.position.copy(this.w(x + dx, DECK + 0.5, z)); g.add(d); } col(RAPIER.ColliderDesc.cuboid(0.8, 0.5, 0.4).setTranslation(SHIP.x + x + 0.4, DECK + 0.5, SHIP.z + z)); }
      this.coverSpots.push(this.w(x, DECK, z));
    }

    // ---- superstructure aft: accommodation block with the bridge on top, funnel behind ----
    const white = std({ color: 0xece8de, roughness: 0.6 });
    const winT = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#ece8de'; c.fillRect(0, 0, w, h); c.fillStyle = '#2c3e4e'; c.fillRect(8, 20, 48, 22); });
    const winM = std({ map: winT, roughness: 0.6 });
    box(16, 11, 13, 0, DECK, -61, [white, white, white, white, winM, winM].map((m) => m)[4]);
    box(22, 2.6, 8, 0, DECK + 11, -58, std({ color: 0xe0dcd2 }));
    box(20.5, 1.2, 0.3, 0, DECK + 12, -53.9, std({ color: 0x2c3e4e, emissive: 0x0a1820, emissiveIntensity: 0.5 }), false);
    box(4, 6, 4, 0, DECK + 11, -66, std({ color: 0x1f2f4a }));
    box(4.2, 1, 4.2, 0, DECK + 16.5, -66, std({ color: 0xb3261e }), false);
    // the door you came out of / they come out of
    box(1.6, 2.3, 0.1, 0, DECK, -54.45, std({ color: 0x3f4a44, metalness: 0.5 }), false);
    this.doorPos = this.w(0, DECK, -52.5);
    // foredeck: winches, a mast and a helicopter pad
    for (const s of [-1, 1]) { const wch = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2, 12), std({ color: 0x2a2c30, metalness: 0.6 })); wch.rotation.z = Math.PI / 2; wch.position.copy(this.w(s * 5, DECK + 0.8, 62)); g.add(wch); }
    box(0.4, 9, 0.4, 0, DECK, 64, std({ color: 0xd8d4c8 }), false);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(6, 32), std({ map: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#2f3438'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2d23a'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.stroke();
      c.fillStyle = '#f2f2ee'; c.font = 'bold 72px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 64, 68);
    }), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.copy(this.w(0, DECK + 0.03, 52));
    g.add(pad);
    this.padPos = this.w(0, DECK, 52);

    // ---- the pier you board from, with a ladder up the hull ----
    const isl0 = -1050;
    pier(g, sb, SHIP.x + B + 0.6, isl0 + 2, SHIP.z - 3, SHIP.z + 3);
    const ladderM = std({ color: 0x3a3c40, metalness: 0.5 });
    for (let y = LAND_Y; y < DECK; y += 0.35) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.7), ladderM);
      r.position.set(SHIP.x + B + 0.12, y, SHIP.z); g.add(r);
    }
    this.ladderFoot = new THREE.Vector3(SHIP.x + B + 1.4, LAND_Y, SHIP.z);
    this.ladderTop = this.w(B - 1.6, DECK, 0);
    // goon posts round the deck
    this.posts = [[0, -45], [0, -15], [-4, 8], [3, 20], [0, 40], [-10, -50], [10, -30], [-10, 12], [10, 38], [0, -52]].map(([x, z]) => this.w(x, DECK, z));
    // bomb parts go here
    this.partSpots = [[0, -36], [-10.2, -20], [10.2, 4], [-1.5, -5], [2, 22], [0, 46]].map(([x, z]) => this.w(x, DECK + 0.6, z));
    this.partSpots[3].y = DECK + 1.6; // on top of a crate
  }
}

// Vic's ride: a small helicopter that flies in, hovers over the pad and takes you home.
export class Heli {
  constructor(game) {
    this.game = game;
    const g = (this.root = new THREE.Group());
    const body = std({ color: 0x1f2a3a, roughness: 0.4, metalness: 0.3 });
    const glass = std({ color: 0x9ec5e8, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.7 });
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 12), body); cab.scale.set(1, 0.9, 1.6);
    const win = new THREE.Mesh(new THREE.SphereGeometry(1.62, 18, 12, -0.9, 1.8, 0.5, 1.2), glass); win.scale.set(1, 0.9, 1.6); win.rotation.y = 0;
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 6, 10), body); boom.rotation.x = Math.PI / 2; boom.position.z = -4.6;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.9), body); fin.position.set(0, 0.6, -7.4);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8), std({ color: 0x2a2c30 })); mast.position.y = 1.65;
    this.rotor = new THREE.Group(); this.rotor.position.y = 1.95;
    for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 11), std({ color: 0x1a1a1a })); b.rotation.y = k * Math.PI / 2; this.rotor.add(b); }
    this.tail = new THREE.Group(); this.tail.position.set(0.2, 0.6, -7.4);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.18), std({ color: 0x1a1a1a })); this.tail.add(tb);
    for (const s of [-1, 1]) { const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6), std({ color: 0x2a2c30 })); skid.rotation.x = Math.PI / 2; skid.position.set(s * 1.1, -1.55, 0.2); g.add(skid); }
    // a rope ladder hanging down
    this.ladder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.05), std({ color: 0xc9a24a, roughness: 1 })); this.ladder.position.set(1.2, -3.4, 0.5);
    g.add(cab, win, boom, fin, mast, this.rotor, this.tail, this.ladder);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.visible = false;
    game.scene.add(g);
  }

  // Fly from `from` to `to` over the course of progress 0..1 (eased), hovering when done.
  pose(from, to, k, time) {
    const e = k < 1 ? 1 - (1 - k) ** 2 : 1;
    const p = from.clone().lerp(to, e);
    p.y += (1 - e) * 30 + Math.sin(time * 1.3) * 0.25;
    this.root.position.copy(p);
    const d = to.clone().sub(from);
    this.root.rotation.set(k < 1 ? 0.15 : 0, Math.atan2(d.x, d.z), Math.sin(time * 0.9) * 0.03);
    this.rotor.rotation.y = time * 25;
    this.tail.rotation.x = time * 40;
    this.root.visible = true;
  }

  hide() { this.root.visible = false; }
}
