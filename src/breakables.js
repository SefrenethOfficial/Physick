import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BREAKABLES, std } from './buildkit.js';

// Trees and street lamps: drawn as a few instanced meshes, and knocked flat by cars. A car that
// hits one at speed snaps it off at the base and it topples away (a physics prop you can shove
// about); the car loses some speed. They're put back a few minutes later, out of sight.

const GRID = 20;
const RESTORE_AFTER = 180;

export class Breakables {
  constructor(game) {
    this.game = game;
    this.items = BREAKABLES.filter((b) => b.sb === game.portSandbox);
    this.grid = new Map();
    const geo = {
      trunk: new THREE.CylinderGeometry(0.22, 0.32, 3, 7).translate(0, 1.5, 0),
      crown: new THREE.IcosahedronGeometry(2.1, 0).translate(0, 4.1, 0),
      pole: new THREE.CylinderGeometry(0.1, 0.14, 7, 8).translate(0, 3.5, 0),
      head: new THREE.BoxGeometry(0.8, 0.2, 0.4).translate(0, 7, 0),
    };
    const mat = {
      trunk: std({ color: 0x6b4a2f }),
      crown: std({ color: 0xffffff, flatShading: true }),
      pole: std({ color: 0x2a2c30, roughness: 0.5, metalness: 0.5 }),
      head: std({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 0.7 }),
    };
    this.geo = geo; this.mat = mat;
    const trees = this.items.filter((b) => b.type === 'tree'), lamps = this.items.filter((b) => b.type === 'lamp');
    const inst = (g, m, list) => {
      const im = new THREE.InstancedMesh(g, m, Math.max(1, list.length));
      im.count = list.length;
      im.castShadow = true; im.receiveShadow = true;
      im.userData.noMerge = true;
      game.scene.add(im);
      return im;
    };
    this.meshes = {
      tree: [inst(geo.trunk, mat.trunk, trees), inst(geo.crown, mat.crown, trees)],
      lamp: [inst(geo.pole, mat.pole, lamps), inst(geo.head, mat.head, lamps)],
    };
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    trees.forEach((b, i) => { b.idx = i; c.setHex(b.color); this.meshes.tree[1].setColorAt(i, c); });
    lamps.forEach((b, i) => { b.idx = i; });
    for (const b of this.items) { this.show(b, true); const k = this.key(b.x, b.z); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(b); }
    for (const list of Object.values(this.meshes)) for (const im of list) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); }
    this.debris = [];
    void m;
  }

  key(x, z) { return `${Math.floor(x / GRID)},${Math.floor(z / GRID)}`; }

  show(b, on) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.y0, b.z), new THREE.Quaternion(), new THREE.Vector3().setScalar(on ? b.s : 0));
    for (const im of this.meshes[b.type]) { im.setMatrixAt(b.idx, m); im.instanceMatrix.needsUpdate = true; }
  }

  near(x, z, fn) {
    const cx = Math.floor(x / GRID), cz = Math.floor(z / GRID);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const b of this.grid.get(`${cx + i},${cz + j}`) || []) fn(b);
  }

  // A car going fast enough breaks anything just in front of (or under) its bonnet.
  update(dt) {
    const g = this.game;
    for (const car of g.vehicles.all) {
      if (car.wreck || car.sinking || Math.abs(car.speed) < 6) continue;
      const f = car.forward, r = new THREE.Vector3(-f.z, 0, f.x);
      const h = car.half || { x: 0.95, z: 2.25 };
      const ahead = Math.max(1.2, Math.abs(car.speed) * 0.1);
      const sgn = Math.sign(car.speed);
      this.near(car.pos.x, car.pos.z, (b) => {
        if (b.broken) return;
        const dx = b.x - car.pos.x, dz = b.z - car.pos.z;
        const lf = (dx * f.x + dz * f.z) * sgn, lr = dx * r.x + dz * r.z;
        if (lf < -h.z || lf > h.z + ahead || Math.abs(lr) > h.x + 0.35 + (b.type === 'tree' ? 0.25 * b.s : 0)) return;
        if (Math.abs(b.y0 - car.pos.y) > 3) return;
        this.knock(b, car);
      });
    }
    // put things back once nobody's watching
    this.restoreT = (this.restoreT || 0) - dt;
    if (this.restoreT <= 0) {
      this.restoreT = 5;
      const cp = g.camera.position;
      for (const b of this.items) {
        if (!b.broken || g.time - b.brokenAt < RESTORE_AFTER || Math.hypot(b.x - cp.x, b.z - cp.z) < 150) continue;
        b.broken = false;
        b.col.setEnabled(true);
        this.show(b, true);
        if (b.prop && g.portSandbox.props.has(b.prop)) g.portSandbox.remove(b.prop);
        b.prop = null;
      }
    }
  }

  knock(b, car) {
    const g = this.game, sb = g.portSandbox;
    b.broken = true;
    b.brokenAt = g.time;
    b.col.setEnabled(false);
    this.show(b, false);
    // the snapped-off tree / lamp as a loose prop, falling the way the car was going
    const grp = new THREE.Group();
    const parts = b.type === 'tree' ? [['trunk', 'trunk'], ['crown', 'crown']] : [['pole', 'pole'], ['head', 'head']];
    for (const [gk, mk] of parts) {
      let m = this.mat[mk];
      if (gk === 'crown') { m = m.clone(); m.color.setHex(b.color); }
      grp.add(new THREE.Mesh(this.geo[gk], m));
    }
    grp.scale.setScalar(b.s);
    const len = (b.type === 'tree' ? 5.5 : 7) * b.s, rad = (b.type === 'tree' ? 0.45 : 0.15) * b.s;
    const def = { id: `fallen_${b.type}`, name: b.type === 'tree' ? 'Fallen tree' : 'Lamp post', radius: len / 2, build: () => {
      const holder = new THREE.Group(); holder.add(grp); grp.position.y = -len / 2; // centre the collider on the middle
      return { mesh: holder, colliders: [RAPIER.ColliderDesc.cylinder(len / 2, rad)], density: b.type === 'tree' ? 90 : 160, friction: 0.6 };
    } };
    const prop = sb.spawn(def, new THREE.Vector3(b.x, b.y0 + len / 2 + 0.05, b.z), new THREE.Quaternion(), { noHistory: true });
    const v = car.vel.clone().multiplyScalar(1.05); // knocked along ahead of the car
    prop.body.setLinvel({ x: v.x, y: 2, z: v.z }, true);
    const axis = new THREE.Vector3(v.z, 0, -v.x).normalize();
    prop.body.setAngvel({ x: axis.x * 3.5, y: (Math.random() - 0.5), z: axis.z * 3.5 }, true);
    b.prop = prop;
    // the car takes it on the nose
    const keep = car.monster ? 0.93 : 0.72;
    const lv = car.body.linvel();
    car.body.setLinvel({ x: lv.x * keep, y: lv.y, z: lv.z * keep }, true);
    car.expect = null; // don't count this as a crash on top
    if (!car.monster) { car.damage(b.type === 'tree' ? 8 : 5); car.dent(new THREE.Vector3(0, 0, -1), 0.15); }
    g.sfx.play(b.type === 'tree' ? 'thud' : 'crash');
    if (g.vehicles.active === car) g.shake = Math.max(g.shake || 0, car.monster ? 0.3 : 0.7);
    const fx = g.fx;
    for (let i = 0; i < 12; i++) fx.emit(new THREE.Vector3(b.x, b.y0 + (b.type === 'tree' ? 3.5 : 1) * b.s, b.z), new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4), b.type === 'tree' ? 0x4f8f3f : 0xffd070, 0.8, 1, 0.25);
  }
}
