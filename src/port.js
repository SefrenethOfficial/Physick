import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Naval air station on the coast, in world coordinates (it does not move).
// The quay runs along x = QUAY_X; land extends east from there.

import { ISLANDS, LAND_Y as LY, onLand as onAnyLand, landHeight as anyLandHeight } from './world.js';

export const LAND_Y = LY;
export const QUAY_X = 10;
export const LAND = ISLANDS.find((i) => i.id === 'naval');
export const RUNWAY = { x: 420, z0: -650, z1: 650, w: 45 };
export const GANGWAY_FOOT = new THREE.Vector3(QUAY_X + 4.6, LAND_Y, 0);

// Any island counts (ships run aground on all of them; jets can land on any flat ground).
export const onLand = onAnyLand;
export const landHeight = anyLandHeight;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(...repeat);
  return t;
}
const speckle = (g, w, h, n, a = 0.08) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
};

export class Port {
  constructor(game, sandbox) {
    this.game = game;
    this.sb = sandbox; // physics for the shore (world frame)
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.build();
    this.group.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; if (!o.userData.noShadow) o.castShadow = true; } });
  }

  box(w, h, d, x, y, z, mat, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    this.group.add(m);
    if (collide) this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z));
    return m;
  }

  flat(w, d, x, z, mat, y = LAND_Y + 0.01) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.userData.noShadow = true;
    this.group.add(m);
    return m;
  }

  build() {
    const Y = LAND_Y;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

    // ---- land ----
    const grass = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#6a8f45'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = Math.random() < 0.5 ? `rgba(50,90,35,${0.2 + Math.random() * 0.3})` : `rgba(150,180,90,${0.15 + Math.random() * 0.2})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2 + Math.random() * 4);
      }
    }, [180, 240]);
    const concrete = (rep) => canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#a7a59e'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, 0.08);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    }, rep);
    const L = LAND;
    const lw = L.x1 - L.x0, ld = L.z1 - L.z0;
    const land = new THREE.Mesh(new THREE.BoxGeometry(lw, 14, ld), [
      std({ color: 0x8c8678 }), std({ color: 0x8f8d86 }), std({ map: grass }), std({ color: 0x5a5448 }), std({ color: 0x8c8678 }), std({ color: 0x8c8678 }),
    ]);
    land.position.set((L.x0 + L.x1) / 2, Y - 7, 0);
    land.userData.noShadow = true;
    this.group.add(land);
    this.sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(lw / 2, 7, ld / 2).setTranslation((L.x0 + L.x1) / 2, Y - 7, 0));

    // ---- quay, apron, taxiway, runway ----
    const apronM = std({ map: concrete([30, 30]) });
    this.flat(300, 520, L.x0 + 150, 50, apronM, Y + 0.02); // quay + apron (x 10..310, z -210..310)
    // quay edge kerb + bollards + fenders
    const kerbM = std({ color: 0xe8b43a });
    const ironM = std({ color: 0x222428, roughness: 0.6 });
    this.box(0.5, 0.25, 520, L.x0 + 0.25, Y, 50, kerbM, false);
    for (let z = -200; z <= 300; z += 15) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 10), ironM);
      b.position.set(L.x0 + 1.2, Y + 0.3, z);
      this.group.add(b);
      const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 12), std({ color: 0x1b1c1e }));
      fender.rotation.z = Math.PI / 2;
      fender.position.set(L.x0 - 0.3, Y - 1.4, z + 7);
      this.group.add(fender);
    }
    // a rail along the rest of the sea wall (not where ships moor) so nobody strolls into the sea
    const railM = std({ color: 0xc9cfd3, metalness: 0.5, roughness: 0.4 });
    for (const [z0, z1] of [[-1000, -210], [310, 1000]]) {
      const len = z1 - z0;
      this.box(0.08, 1.05, len, L.x0 + 0.4, Y, (z0 + z1) / 2, railM, true);
    }

    // runway
    const rwTex = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#3b3e42'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 4000, 0.07);
      g.fillStyle = '#ecece6';
      g.fillRect(6, 0, 6, h); g.fillRect(w - 12, 0, 6, h);
      g.fillRect(w / 2 - 3, 40, 6, 200);
    }, [1, (RUNWAY.z1 - RUNWAY.z0) / 60]);
    this.flat(RUNWAY.w, RUNWAY.z1 - RUNWAY.z0, RUNWAY.x, (RUNWAY.z0 + RUNWAY.z1) / 2, std({ map: rwTex, roughness: 0.9 }), Y + 0.04);
    // threshold bars + runway numbers
    const markM = std({ color: 0xecece6, roughness: 0.7 });
    for (const [z, num, flip] of [[RUNWAY.z1 - 12, '36', false], [RUNWAY.z0 + 12, '18', true]]) {
      for (let k = -7; k <= 7; k++) {
        if (k === 0) continue;
        this.flat(1.8, 30, RUNWAY.x + k * 2.8, z - (flip ? -15 : 15), markM, Y + 0.05);
      }
      const t = canvasTex(256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#ecece6';
        g.font = 'bold 200px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(num, w / 2, h / 2);
      });
      const n = this.flat(16, 22, RUNWAY.x, z - (flip ? -48 : 48), std({ map: t, transparent: true }), Y + 0.05);
      n.rotation.z = flip ? Math.PI : 0;
    }
    // taxiway (parallel) + stubs to the runway and the apron
    const twTex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#4a4d51'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 600, 0.06);
      g.fillStyle = '#e8b43a'; g.fillRect(w / 2 - 2, 0, 4, h);
    }, [1, 40]);
    const twM = std({ map: twTex });
    this.flat(20, 1260, 335, 0, twM, Y + 0.035);
    for (const z of [-620, 0, 620]) {
      const stub = this.flat(20, 80, 365, z, std({ map: twTex.clone() }), Y + 0.036);
      stub.material.map.repeat.set(1, 3);
      stub.rotation.z = Math.PI / 2;
    }
    const s2 = this.flat(20, 30, 318, 0, std({ map: twTex.clone() }), Y + 0.036);
    s2.rotation.z = Math.PI / 2;

    // ---- hangars (arched) on the north side of the apron ----
    const hangarM = std({ color: 0x9aa0a4, metalness: 0.3, roughness: 0.6, side: THREE.DoubleSide });
    const doorM = std({ map: canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#7d858c'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 2, h); }
      g.fillStyle = '#e8b43a'; g.fillRect(0, h - 8, w, 8);
    }) });
    for (const [x, num] of [[60, '1'], [130, '2'], [200, '3']]) {
      const z = -190, w = 56, d = 40;
      this.box(w, 9, d, x, Y, z, hangarM);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 24, 1, false, -Math.PI / 2, Math.PI), hangarM);
      roof.rotation.x = -Math.PI / 2; // half cylinder arching upward, running front to back
      roof.scale.set(1, 1, 0.22);
      roof.position.set(x, Y + 9, z);
      this.group.add(roof);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(w - 6, 8.6), doorM);
      door.position.set(x, Y + 4.3, z + d / 2 + 0.03);
      this.group.add(door);
      const label = canvasTex(128, 128, (g, cw) => { g.fillStyle = '#1f3b63'; g.fillRect(0, 0, cw, cw); g.fillStyle = '#fff'; g.font = 'bold 90px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, cw / 2, cw / 2 + 4); });
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), std({ map: label }));
      lab.position.set(x, Y + 11.5, z + d / 2 + 0.2);
      this.group.add(lab);
    }

    // ---- control tower ----
    const towerM = std({ color: 0xd8d3c8 });
    this.box(9, 22, 9, 300, Y, -170, towerM);
    this.box(13, 0.6, 13, 300, Y + 22, -170, std({ color: 0x5f666c }));
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 5.6, 5, 8), std({ color: 0x24465e, metalness: 0.6, roughness: 0.1, transparent: true, opacity: 0.75 }));
    cab.position.set(300, Y + 25.1, -170);
    this.group.add(cab);
    this.box(13, 0.6, 13, 300, Y + 27.6, -170, std({ color: 0x5f666c }), false);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), std({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 }));
    beacon.position.set(300, Y + 30.5, -170);
    this.group.add(beacon);
    this.box(0.2, 2.5, 0.2, 300, Y + 28.2, -170, ironM, false);

    // ---- containers + fuel tanks south of the apron ----
    const cols = [0xc23b2a, 0x2f7fd8, 0x3aa760, 0xe0a52b, 0x7a4fb0, 0xdedede, 0x2f4f6f];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const stack = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < stack; k++) {
        const c = this.box(12.2, 2.6, 2.45, 60 + i * 15, Y + k * 2.6, 240 + j * 3.2, std({ color: cols[Math.floor(Math.random() * cols.length)], metalness: 0.3, roughness: 0.6 }));
        c.rotation.y = (Math.random() - 0.5) * 0.04;
      }
    }
    for (const [x, z] of [[200, 255], [225, 255], [250, 255]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 11, 24), std({ color: 0xe6e6e0, metalness: 0.3 }));
      t.position.set(x, Y + 5.5, z + 20);
      this.group.add(t);
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(5.5, 9).setTranslation(x, Y + 5.5, z + 20));
    }

    // ---- lamp posts along the quay ----
    for (let z = -180; z <= 290; z += 40) {
      this.box(0.25, 9, 0.25, L.x0 + 4, Y, z, ironM, true);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.6), std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 0.6 }));
      head.position.set(L.x0 + 3.5, Y + 9, z);
      this.group.add(head);
    }

    // ---- windsock by the runway ----
    this.box(0.15, 6, 0.15, 470, Y, 560, ironM, false);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.2, 12, 1, true), std({ color: 0xff6a1a, side: THREE.DoubleSide }));
    sock.rotation.z = Math.PI / 2;
    sock.position.set(471.6, Y + 5.8, 560);
    this.group.add(sock);
    this.sock = sock;

    // ---- trees dotted around the grass ----
    const trunkM = std({ color: 0x6b4a2f });
    const leafM = std({ color: 0x3f7d3a, flatShading: true });
    for (let i = 0; i < 90; i++) {
      const x = 40 + Math.random() * 1400, z = -950 + Math.random() * 1900;
      if (x < 330 && z > -230 && z < 340) continue; // apron, hangars, containers
      if (Math.abs(x - RUNWAY.x) < 70 || Math.abs(x - 335) < 30) continue; // runway + taxiway
      if (Math.abs(x - 300) < 20 && Math.abs(z + 170) < 20) continue;
      const s = 0.9 + Math.random() * 0.8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 3 * s, 6), trunkM);
      trunk.position.set(x, Y + 1.5 * s, z);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 * s, 0), leafM);
      crown.position.set(x, Y + 4.2 * s, z);
      this.group.add(trunk, crown);
      this.sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(1.5 * s, 0.35 * s).setTranslation(x, Y + 1.5 * s, z));
    }

    // ---- gangway (shown while the ship is moored) ----
    const gw = new THREE.Group();
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1), std({ color: 0x6f777d, metalness: 0.4 }));
    gw.add(plank);
    for (const side of [-0.6, 0.6]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), railM);
      r.position.set(side, 1.0, 0);
      gw.add(r);
    }
    this.gangway = gw;
    this.group.add(gw);
    // walkable: a kinematic ramp in the shore physics world that follows the gangway
    const w = this.sb.world;
    this.gwBody = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.gwCol = w.createCollider(RAPIER.ColliderDesc.cuboid(0.65, 0.08, 0.5).setFriction(1), this.gwBody);
  }

  // Lay the gangway from the ship's deck edge (world point) down to the quay.
  updateGangway(top, visible) {
    const gw = this.gangway;
    gw.visible = visible;
    this.gwCol.setEnabled(visible);
    if (!visible) return;
    const bottom = GANGWAY_FOOT.clone();
    bottom.z = top.z;
    const mid = top.clone().add(bottom).multiplyScalar(0.5);
    const len = top.distanceTo(bottom);
    gw.position.copy(mid);
    gw.lookAt(bottom);
    gw.scale.set(1, 1, len);
    this.gwBody.setNextKinematicTranslation(mid);
    this.gwBody.setNextKinematicRotation(gw.quaternion);
    if (Math.abs(this.gwLen - len) > 0.05 || !this.gwLen) {
      this.gwLen = len;
      this.gwCol.setHalfExtents({ x: 0.65, y: 0.08, z: len / 2 });
    }
  }

  update(dt, t) {
    this.sock.rotation.y = Math.sin(t * 0.7) * 0.15;
  }
}
