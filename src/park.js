import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, LAND_Y } from './world.js';
import { std, sign, solidBox, canvasTex } from './buildkit.js';

// Cherry Estate National Park: a big stretch of pine forest behind Verian City, with dirt
// trails, a ranger station at the trailhead, campsites, fallen logs, boulders and a lookout.

const Y = LAND_Y;
const loader = new THREE.TextureLoader();
export function photoTex(url, rx, ry) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// distance from point to segment
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

export class Park {
  constructor(game, sb) {
    this.game = game;
    this.sb = sb;
    this.isl = ISLANDS.find((i) => i.id === 'park');
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.lootSpots = [];
    this.build();
  }

  build() {
    const g = this.group, sb = this.sb, isl = this.isl;
    const base = import.meta.env.BASE_URL;
    const w = isl.x1 - isl.x0, d = isl.z1 - isl.z0;
    // ---- ground: photo grass on top, dirt banks on the sides ----
    const grass = std({ map: photoTex(`${base}assets/textures/grass.jpg`, w / 9, d / 9), roughness: 1 });
    const bank = std({ map: photoTex(`${base}assets/textures/dirt.jpg`, w / 10, 1.4), roughness: 1 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 14, d), [bank, bank, grass, bank, bank, bank]);
    slab.position.set((isl.x0 + isl.x1) / 2, Y - 7, (isl.z0 + isl.z1) / 2);
    slab.receiveShadow = true;
    slab.userData.noMerge = true;
    g.add(slab);
    sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(w / 2, 7, d / 2).setTranslation(slab.position.x, Y - 7, slab.position.z));

    // ---- dirt trails ----
    const dirtMap = (len, wid) => photoTex(`${base}assets/textures/dirt.jpg`, wid / 6, len / 6);
    this.trails = [
      [[-1115, -35], [-1180, -32], [-1260, -60], [-1340, -20], [-1420, 40], [-1500, 10], [-1580, -60], [-1640, -140]],
      [[-1260, -60], [-1300, -160], [-1380, -262], [-1480, -300], [-1580, -220], [-1640, -140]],
      [[-1340, -20], [-1360, 120], [-1420, 240], [-1520, 320], [-1610, 250], [-1600, 120], [-1500, 10]],
    ];
    const TW = 4.5;
    for (const line of this.trails) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(TW, len + 1), std({ map: dirtMap(len, TW), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
        m.rotation.set(-Math.PI / 2, 0, Math.atan2(b[0] - a[0], b[1] - a[1]));
        m.position.set((a[0] + b[0]) / 2, Y + 0.02, (a[1] + b[1]) / 2);
        m.receiveShadow = true;
        g.add(m);
        const joint = new THREE.Mesh(new THREE.CircleGeometry(TW / 2, 14), m.material);
        joint.rotation.x = -Math.PI / 2;
        joint.position.set(b[0], Y + 0.021, b[1]);
        g.add(joint);
      }
    }
    const clearing = (x, z, r) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), std({ map: photoTex(`${base}assets/textures/dirt.jpg`, r / 4, r / 4), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, Y + 0.022, z);
      m.receiveShadow = true;
      g.add(m);
    };
    this.clearings = [];
    const addClearing = (x, z, r) => { this.clearings.push([x, z, r]); clearing(x, z, r * 0.8); };

    // ---- trailhead: car park, big sign, ranger station ----
    addClearing(-1150, -35, 26);
    this.entrance = new THREE.Vector3(-1135, Y, -35);
    const wood = std({ color: 0x6b4a2f, roughness: 0.9 });
    const darkWood = std({ color: 0x4a3220, roughness: 0.9 });
    for (const dz of [-6, 6]) solidBox(g, sb, 0.5, 4.5, 0.5, -1124, Y, -35 + dz, darkWood);
    solidBox(g, sb, 0.6, 0.5, 13, -1124, Y + 4.4, -35, darkWood, { collide: false });
    sign(g, 'CHERRY ESTATE NATIONAL PARK', -1123.6, Y + 3.3, -35, Math.PI / 2, { w: 11, h: 1.7, bg: '#3b2a1a', fg: '#f2d9a0' });
    sign(g, 'CHERRY ESTATE NATIONAL PARK', -1124.4, Y + 3.3, -35, -Math.PI / 2, { w: 11, h: 1.7, bg: '#3b2a1a', fg: '#f2d9a0' });
    // ranger station: a log cabin with a porch
    addClearing(-1165, -78, 16);
    const logTex = canvasTex(64, 64, (c, cw, ch) => {
      c.fillStyle = '#7a5434'; c.fillRect(0, 0, cw, ch);
      for (let y = 0; y < ch; y += 8) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, y, cw, 2); c.fillStyle = 'rgba(255,220,170,0.12)'; c.fillRect(0, y + 3, cw, 2); }
    }, [3, 1.2]);
    solidBox(g, sb, 12, 4, 9, -1165, Y, -80, std({ map: logTex }));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 8.2, 3, 4, 1), std({ color: 0x3f4a3a, roughness: 0.8, flatShading: true }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.05, 1, 0.8);
    roof.position.set(-1165, Y + 5.5, -80);
    roof.castShadow = true;
    g.add(roof);
    solidBox(g, sb, 12, 0.25, 3, -1165, Y, -74, wood);
    sign(g, 'RANGER STATION', -1165, Y + 3.2, -75.45, 0, { w: 6, h: 0.9, bg: '#2f4a2a', fg: '#f2e6c0' });
    for (let n = 0; n < 2; n++) this.lootSpots.push(new THREE.Vector3(-1168 + n * 5, Y + 0.6, -73.5));

    // ---- campsites: fire pit, tents, picnic table, stuff lying about ----
    const camp = (x, z) => {
      addClearing(x, z, 18);
      // fire pit
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), std({ color: 0x77736c, flatShading: true }));
        st.position.set(x + Math.cos(a) * 1.1, Y + 0.15, z + Math.sin(a) * 1.1);
        g.add(st);
      }
      const embers = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), std({ color: 0x2a1a10, emissive: 0xff5a10, emissiveIntensity: 0.8 }));
      embers.rotation.x = -Math.PI / 2; embers.position.set(x, Y + 0.04, z);
      g.add(embers);
      // tents
      const tentCols = [0xd9622b, 0x2b7fd9, 0x3aa760, 0xe0b42b];
      for (let t = 0; t < 2; t++) {
        const tx = x + (t ? 6 : -6), tz = z - 5;
        const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.9, 2.2, 4, 1), std({ color: tentCols[Math.floor(Math.random() * 4)], roughness: 0.9, flatShading: true }));
        tent.rotation.y = Math.PI / 4;
        tent.scale.set(1, 1, 1.5);
        tent.position.set(tx, Y + 1.1, tz);
        tent.castShadow = true;
        g.add(tent);
        sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(1.3, 1, 1.9).setTranslation(tx, Y + 1, tz));
        this.lootSpots.push(new THREE.Vector3(tx, Y + 0.3, tz + 2.6));
      }
      // picnic table + benches
      solidBox(g, sb, 2.2, 0.08, 0.9, x + 4, Y + 0.75, z + 5, wood, { collide: false });
      for (const s of [-0.75, 0.75]) solidBox(g, sb, 2.2, 0.45, 0.3, x + 4, Y, z + 5 + s, wood);
      for (const s of [-0.9, 0.9]) solidBox(g, sb, 0.1, 0.75, 0.8, x + 4 + s, Y, z + 5, wood);
      this.lootSpots.push(new THREE.Vector3(x + 3.6, Y + 1.1, z + 5), new THREE.Vector3(x + 4.5, Y + 1.1, z + 5));
      // a cooler and a camp chair
      solidBox(g, sb, 0.7, 0.45, 0.45, x - 3, Y, z + 3, std({ color: 0x2b6fd9 }));
      this.lootSpots.push(new THREE.Vector3(x - 3, Y + 0.7, z + 3));
    };
    camp(-1380, -262);
    camp(-1420, 240);
    camp(-1605, -62);

    // ---- lookout tower on the far side ----
    addClearing(-1650, 330, 14);
    const tx = -1650, tz = 330;
    for (const [ax, az] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) solidBox(g, sb, 0.35, 12, 0.35, tx + ax, Y, tz + az, darkWood);
    solidBox(g, sb, 5, 0.3, 5, tx, Y + 12, tz, wood);
    for (const [ax, az, rw, rd] of [[0, 2.4, 5, 0.12], [-2.4, 0, 0.12, 5], [2.4, 0, 0.12, 5]]) solidBox(g, sb, rw, 1, rd, tx + ax, Y + 12.3, tz + az, wood);
    const troof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4, 2, 4, 1), std({ color: 0x3f4a3a, flatShading: true }));
    troof.rotation.y = Math.PI / 4; troof.position.set(tx, Y + 15.5, tz);
    g.add(troof);
    for (let i = 0; i < 4; i++) solidBox(g, sb, 0.15, 3, 0.15, tx + (i % 2 ? 2.3 : -2.3), Y + 12.3, tz + (i < 2 ? 2.3 : -2.3), darkWood, { collide: false });
    // stairs up the tower (a ramp of steps)
    // a long steep stair up to the open side of the platform
    for (let i = 0; i <= 30; i++) solidBox(g, sb, 1.3, 0.2, 0.42, tx, Y + i * 0.4, tz - 2.75 - (30 - i) * 0.32, wood);
    this.lootSpots.push(new THREE.Vector3(tx, Y + 12.6, tz));

    // ---- the forest: pines everywhere that isn't a trail or a clearing ----
    this.plantPines();

    // boulders and fallen logs
    const rockM = std({ color: 0x7d7a74, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 70; i++) {
      const p = this.freeSpot(3);
      if (!p) continue;
      const r = 0.6 + Math.random() * 1.8;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockM);
      rock.scale.y = 0.6 + Math.random() * 0.3;
      rock.rotation.set(Math.random(), Math.random() * 6, Math.random());
      rock.position.set(p.x, Y + r * 0.25, p.z);
      rock.castShadow = rock.receiveShadow = true;
      g.add(rock);
      sb.addStaticCollider(RAPIER.ColliderDesc.ball(r * 0.75).setTranslation(p.x, Y + r * 0.25, p.z));
    }
    const barkM = std({ color: 0x5a4030, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const p = this.freeSpot(5);
      if (!p) continue;
      const len = 4 + Math.random() * 5, yaw = Math.random() * Math.PI;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, len, 8), barkM);
      log.rotation.set(0, yaw, Math.PI / 2, 'YXZ');
      log.position.set(p.x, Y + 0.32, p.z);
      log.castShadow = true;
      g.add(log);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ'));
      sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(len / 2, 0.34).setTranslation(p.x, Y + 0.32, p.z).setRotation(q));
    }
  }

  // Somewhere in the woods: not on a trail, not in a clearing, not by the city edge.
  freeSpot(margin = 2, tries = 20) {
    const isl = this.isl;
    for (let k = 0; k < tries; k++) {
      const x = isl.x0 + 6 + Math.random() * (isl.x1 - isl.x0 - 24);
      const z = isl.z0 + 6 + Math.random() * (isl.z1 - isl.z0 - 12);
      if (this.clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + margin)) continue;
      let ok = true;
      for (const line of this.trails) {
        for (let i = 0; i < line.length - 1 && ok; i++) if (segDist(x, z, line[i], line[i + 1]) < 3.5 + margin) ok = false;
        if (!ok) break;
      }
      if (ok) return { x, z };
    }
    return null;
  }

  plantPines() {
    const g = this.group, sb = this.sb;
    const N = 4200;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 3.2, 6);
    trunkGeo.translate(0, 1.6, 0);
    const cones = [[2.3, 3.2, 2.9], [1.8, 2.8, 4.7], [1.25, 2.4, 6.3], [0.7, 1.8, 7.7]].map(([r, h, y]) => {
      const c = new THREE.ConeGeometry(r, h, 7);
      c.translate(0, y, 0);
      return c.toNonIndexed();
    });
    const leafGeo = mergeGeometries(cones);
    leafGeo.computeVertexNormals();
    const trunks = new THREE.InstancedMesh(trunkGeo, std({ color: 0x5a3e2a, roughness: 1 }), N);
    const leaves = new THREE.InstancedMesh(leafGeo, std({ color: 0xffffff, roughness: 0.9, flatShading: true }), N);
    trunks.userData.noMerge = leaves.userData.noMerge = true;
    trunks.castShadow = leaves.castShadow = true;
    trunks.receiveShadow = leaves.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (let k = 0; k < N * 2 && n < N; k++) {
      const s = this.freeSpot(0.5, 1);
      if (!s) continue;
      const size = 0.75 + Math.random() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      sc.set(size * (0.9 + Math.random() * 0.2), size, size * (0.9 + Math.random() * 0.2));
      p.set(s.x, Y, s.z);
      m.compose(p, q, sc);
      trunks.setMatrixAt(n, m);
      leaves.setMatrixAt(n, m);
      col.setHSL(0.33 + Math.random() * 0.06, 0.3 + Math.random() * 0.18, 0.1 + Math.random() * 0.07);
      leaves.setColorAt(n, col);
      sb.addStaticCollider(RAPIER.ColliderDesc.cylinder(1.6 * size, 0.3 * size).setTranslation(s.x, Y + 1.6 * size, s.z));
      n++;
    }
    trunks.count = leaves.count = n;
    trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
    leaves.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere(); leaves.computeBoundingSphere();
    g.add(trunks, leaves);
    this.pines = n;
  }
}
