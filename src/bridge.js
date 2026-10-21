import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LAND_Y, addPier } from './world.js';
import { std, canvasTex, speckle } from './buildkit.js';

// The Saltmarsh Gate Bridge: an international-orange suspension bridge from the hills of
// Cherry Estate across the strait to Saltmarsh Key. Two art-deco towers, sweeping main
// cables, hundreds of suspenders, and a deck that drops down to the island at the far end.

const ORANGE = 0xc0442c;
const DECK_W = 22;

export class Bridge {
  // start: deck start on the park side (x, y = deck height, z); end: landing on Saltmarsh (y = land)
  constructor(game, sb, start, end) {
    this.game = game;
    this.sb = sb;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.start = start.clone();
    this.end = end.clone();
    const d = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
    this.length = d.length();
    this.dir = d.normalize();
    this.side = new THREE.Vector3(-this.dir.z, 0, this.dir.x);
    this.yaw = Math.atan2(this.dir.x, this.dir.z);
    this.deckY = start.y;
    this.descent = 170; // length of the ramp down to Saltmarsh at the far end
    this.towers = [this.length * 0.24, this.length * 0.74];
    this.build();
  }

  // deck surface height at distance t along the bridge
  deckAt(t) {
    const a = this.length - this.descent;
    if (t <= a) return this.deckY;
    const k = Math.min(1, (t - a) / this.descent);
    return this.end.y + (this.deckY - this.end.y) * (0.5 + 0.5 * Math.cos(k * Math.PI));
  }

  at(t, lat = 0, y = 0) {
    return new THREE.Vector3(this.start.x + this.dir.x * t + this.side.x * lat, y, this.start.z + this.dir.z * t + this.side.z * lat);
  }

  box(w, h, l, t, lat, yCenter, mat, { collide = true, pitch = 0, cast = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    const p = this.at(t, lat, yCenter);
    m.position.copy(p);
    m.rotation.set(pitch, this.yaw, 0, 'YXZ');
    m.castShadow = cast; m.receiveShadow = true;
    this.group.add(m);
    if (collide) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, this.yaw, 0, 'YXZ'));
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, l / 2).setTranslation(p.x, p.y, p.z).setRotation(q));
    }
    return m;
  }

  build() {
    const orange = std({ color: ORANGE, roughness: 0.6, metalness: 0.2 });
    const concrete = std({ color: 0xb8b2a6, roughness: 0.9 });
    const roadTex = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#3a3d41'; c.fillRect(0, 0, w, h); speckle(c, w, h, 700, 0.06);
      c.fillStyle = '#e8e8e2';
      for (const x of [0.25, 0.75]) for (let y = 0; y < h; y += 32) c.fillRect(w * x - 1, y, 2, 18); // lane dashes
      c.fillStyle = '#e8c547'; c.fillRect(w / 2 - 3, 0, 2, h); c.fillRect(w / 2 + 1, 0, 2, h);
      c.fillStyle = '#e8e8e2'; c.fillRect(8, 0, 2, h); c.fillRect(w - 10, 0, 2, h);
      c.fillStyle = '#8c8a86'; c.fillRect(0, 0, 7, h); c.fillRect(w - 7, 0, 7, h); // walkways
    }, [1, 1]);
    const roadM = std({ map: roadTex, roughness: 0.9 });

    // ---- deck, in 10 m pieces following the profile ----
    const SEG = 10;
    for (let t = 0; t < this.length + 12; t += SEG) {
      const t1 = t + SEG;
      const y0 = this.deckAt(Math.min(t, this.length)), y1 = this.deckAt(Math.min(t1, this.length));
      const pitch = -Math.atan2(y1 - y0, SEG);
      const len = Math.hypot(SEG, y1 - y0) + 0.15;
      const yc = (y0 + y1) / 2;
      const deck = this.box(DECK_W, 0.8, len, t + SEG / 2, 0, yc - 0.4, concrete, { pitch });
      void deck;
      const top = new THREE.Mesh(new THREE.PlaneGeometry(DECK_W, len), roadM);
      top.rotation.set(-Math.PI / 2 + 0, 0, 0);
      const holder = new THREE.Group();
      holder.position.copy(this.at(t + SEG / 2, 0, yc + 0.02));
      holder.rotation.set(pitch, this.yaw, 0, 'YXZ');
      holder.add(top);
      top.receiveShadow = true;
      this.group.add(holder);
      // stiffening truss under the deck and the railings
      if (yc > LAND_Y + 3) for (const s of [-1, 1]) this.box(0.6, 5, len, t + SEG / 2, s * (DECK_W / 2 - 0.3), yc - 3.3, orange, { collide: false, pitch });
      for (const s of [-1, 1]) {
        this.box(0.25, 1.2, len, t + SEG / 2, s * (DECK_W / 2 - 0.15), yc + 0.6, orange, { pitch });
        this.box(0.4, 0.12, len, t + SEG / 2, s * (DECK_W / 2 - 0.15), yc + 1.25, orange, { collide: false, pitch });
      }
      // approach columns where the deck is over land or shallow water
      if ((t < 90 || t > this.length - this.descent - 60) && yc > LAND_Y + 4 && (Math.round(t) % 30 === 0)) {
        for (const s of [-1, 1]) this.box(2.2, yc - LAND_Y + 20, 2.2, t + SEG / 2, s * 7, (yc + LAND_Y - 20) / 2 - 0.8, concrete);
      }
    }

    // ---- towers ----
    const TOP = this.deckY + 92;
    for (const t of this.towers) {
      // footing in the water (boats steer round it)
      this.box(36, 22, 16, t, 0, LAND_Y - 9, concrete);
      const c = this.at(t);
      addPier(c.x - 15, c.x + 15, c.z - 15, c.z + 15);
      for (const s of [-1, 1]) {
        const lat = s * (DECK_W / 2 + 2.5);
        // stepped legs: wide at the bottom, slimmer above each portal
        this.box(6, this.deckY - LAND_Y + 2, 7, t, lat, (this.deckY + LAND_Y + 2) / 2 - 0.5, orange);
        this.box(5.2, 32, 6.2, t, lat, this.deckY + 16, orange);
        this.box(4.6, 30, 5.6, t, lat, this.deckY + 47, orange);
        this.box(4, 30, 5, t, lat, this.deckY + 77, orange);
      }
      // portal struts (with the art-deco recesses suggested by stacked bars)
      for (const [y, h] of [[this.deckY - 4, 3], [this.deckY + 31, 4], [this.deckY + 61, 4], [TOP - 3, 6]]) {
        this.box(DECK_W + 6, h, 4.4, t, 0, y, orange, { collide: y < this.deckY });
        if (y > this.deckY) this.box(DECK_W + 2, 0.6, 4.6, t, 0, y - h / 2 - 0.6, orange, { collide: false });
      }
      // cable saddles on top
      for (const s of [-1, 1]) this.box(3.2, 2, 4, t, s * (DECK_W / 2 + 2.5), TOP + 1, orange, { collide: false });
    }

    // ---- main cables: anchored at both ends, over both towers, sagging across the main span ----
    const [ta, tb] = this.towers;
    const anchorA = 0, anchorB = this.length - this.descent + 10;
    const cableY = (t) => {
      if (t <= ta) return this.deckY + 3 + (TOP + 2 - this.deckY - 3) * Math.pow(t / ta, 1.6);
      if (t >= tb) return this.deckY + 3 + (TOP + 2 - this.deckY - 3) * Math.pow((anchorB - t) / (anchorB - tb), 1.6);
      const u = (t - ta) / (tb - ta) * 2 - 1;
      return this.deckAt(t) + 5 + (TOP + 2 - this.deckY - 5) * u * u;
    };
    const susp = [];
    for (const s of [-1, 1]) {
      const lat = s * (DECK_W / 2 + 2.5);
      const pts = [];
      for (let t = anchorA; t <= anchorB; t += 6) pts.push(this.at(t, lat, cableY(t)));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.55, 8, false), orange);
      tube.castShadow = true;
      this.group.add(tube);
      // suspenders: thin vertical cables down to the deck
      for (let t = 6; t < anchorB - 4; t += 8) {
        if (Math.abs(t - ta) < 4 || Math.abs(t - tb) < 4) continue;
        const top = this.at(t, lat, cableY(t)), bottom = this.at(t, lat, this.deckAt(t) + 1.2);
        susp.push(top.x, top.y, top.z, bottom.x, bottom.y, bottom.z);
      }
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(susp, 3));
    const sl = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: ORANGE }));
    sl.userData.noMerge = true;
    this.group.add(sl);
    // anchorage blocks at the far end
    this.box(DECK_W + 10, 10, 18, anchorB + 4, 0, this.deckAt(anchorB) - 3, concrete, { collide: false });

    // lamp posts along the deck
    const lampM = std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 0.8 });
    for (let t = 20; t < this.length - 20; t += 40) {
      for (const s of [-1, 1]) {
        this.box(0.25, 6, 0.25, t, s * (DECK_W / 2 - 0.6), this.deckAt(t) + 3, orange, { collide: false });
        this.box(0.9, 0.25, 0.5, t, s * (DECK_W / 2 - 1.2), this.deckAt(t) + 6, lampM, { collide: false, cast: false });
      }
    }
  }

  // A flat stretch of road on the ground (the link from the bridge into Saltmarsh's lanes).
  groundRoad(pts, width = 10) {
    const m = std({ color: 0x3c3f43, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(width, len + width), m);
      p.rotation.set(-Math.PI / 2, 0, Math.atan2(bx - ax, bz - az));
      p.position.set((ax + bx) / 2, LAND_Y + 0.045, (az + bz) / 2);
      p.receiveShadow = true;
      this.group.add(p);
    }
  }

  // for the maps: the deck as a polyline
  get mapLine() { return [[this.start.x, this.start.z], [this.end.x + this.dir.x * 12, this.end.z + this.dir.z * 12]]; }
}
