import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUPS } from './groups.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const mats = (o) => (Array.isArray(o.material) ? o.material : [o.material]);

// Owns every physics prop in the world, the static level geometry, and welds.
export class Sandbox {
  constructor(game, opts = {}) {
    this.game = game;
    this.world = opts.world || game.world;
    this.scene = opts.scene || game.scene;
    this.props = new Set();
    this.byCollider = new Map(); // collider handle -> prop
    this.history = []; // spawn order, for undo
    this.nextId = 1;

    // One fixed body carries every static collider so "weld to world" has a body to attach to.
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.staticColliders = new Set();
    this.npcByCollider = new Map(); // collider handle -> living NPC
  }

  // ---------- static level ----------
  addStatic(mesh, colliderDesc) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    colliderDesc
      .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
      .setRotation(mesh.quaternion)
      .setFriction(0.9)
      .setCollisionGroups(GROUPS.world);
    const col = this.world.createCollider(colliderDesc, this.staticBody);
    this.staticColliders.add(col.handle);
    return col;
  }

  // Collider with no mesh of its own (its desc already carries its position).
  addStaticCollider(colliderDesc) {
    colliderDesc.setFriction(0.9).setCollisionGroups(GROUPS.world);
    const col = this.world.createCollider(colliderDesc, this.staticBody);
    this.staticColliders.add(col.handle);
    return col;
  }

  // ---------- props ----------
  spawn(def, position, quaternion = new THREE.Quaternion(), opts = {}) {
    const built = def.build(this.game.assets);
    const mesh = built.mesh;
    mesh.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Per-prop materials so highlights and freeze tints stay local.
        const cl = (m) => {
          const c = m.clone();
          c.userData.baseEmissive = c.emissive ? c.emissive.clone() : null;
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material);
      }
    });
    mesh.position.copy(position);
    mesh.quaternion.copy(quaternion);
    this.scene.add(mesh);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(quaternion)
      .setLinearDamping(0.05)
      .setAngularDamping(0.15)
      .setCcdEnabled(!!built.ccd);
    const body = this.world.createRigidBody(bodyDesc);
    const colliders = [];
    built.colliders.forEach((desc, i) => {
      desc
        .setFriction(built.friction ?? 0.7)
        .setRestitution(built.restitution ?? 0.15)
        .setDensity(built.densities?.[i] ?? built.density ?? 1)
        .setCollisionGroups(GROUPS.prop);
      const col = this.world.createCollider(desc, body);
      colliders.push(col);
    });

    const prop = {
      id: this.nextId++,
      def,
      mesh,
      body,
      colliders,
      frozen: false,
      welds: new Set(),
      links: new Set(), // ball joints (ragdolls)
      highlight: null,
      temporary: !!opts.temporary,
      bornAt: performance.now(),
    };
    for (const c of colliders) this.byCollider.set(c.handle, prop);
    this.props.add(prop);
    if (!prop.temporary && !opts.noHistory) this.history.push(prop);
    built.setup?.(prop, this);
    return prop;
  }

  remove(prop) {
    if (!this.props.has(prop)) return;
    for (const w of [...prop.welds]) this.unweldOne(w);
    for (const l of [...prop.links]) this.unlink(l);
    if (prop.vehicle) {
      this.game.events.emit('vehicleRemoved', prop);
      this.world.removeVehicleController(prop.vehicle.ctrl);
      prop.vehicle = null;
    }
    for (const c of prop.colliders) this.byCollider.delete(c.handle);
    this.world.removeRigidBody(prop.body);
    this.scene.remove(prop.mesh);
    prop.mesh.traverse((o) => {
      if (o.isMesh) mats(o).forEach((m) => m.dispose());
    });
    this.props.delete(prop);
    const i = this.history.indexOf(prop);
    if (i >= 0) this.history.splice(i, 1);
    this.game.events.emit('propRemoved', prop);
  }

  undo() {
    const p = this.history.pop();
    if (p) this.remove(p);
    return p;
  }

  clear() {
    for (const p of [...this.props]) this.remove(p);
  }

  mass(prop) {
    return prop.body.mass();
  }

  // ---------- freeze ----------
  setFrozen(prop, frozen) {
    if (prop.frozen === frozen) return;
    prop.frozen = frozen;
    prop.body.setBodyType(frozen ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
    if (!frozen) prop.body.wakeUp();
    this.refreshTint(prop);
  }

  // ---------- highlight / tint ----------
  setHighlight(prop, color) {
    prop.highlight = color;
    this.refreshTint(prop);
  }

  refreshTint(prop) {
    const c = prop.highlight != null ? new THREE.Color(prop.highlight).multiplyScalar(0.45)
      : prop.frozen ? new THREE.Color(0x1a4fa0).multiplyScalar(0.5) : null;
    prop.mesh.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of mats(o)) {
        if (!m.emissive) continue;
        if (c) m.emissive.copy(c);
        else if (m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive);
      }
    });
  }

  // ---------- welds ----------
  // Weld prop A to prop B (or to the world when b is null) at world point p.
  weld(a, b, point) {
    const bodyA = a.body;
    const bodyB = b ? b.body : this.staticBody;
    const ta = bodyA.translation(), tb = bodyB.translation();
    const qa = new THREE.Quaternion().copy(bodyA.rotation());
    const qb = new THREE.Quaternion().copy(bodyB.rotation());

    const anchorA = _v.copy(point).sub(ta).applyQuaternion(_q.copy(qa).invert()).clone();
    const anchorB = new THREE.Vector3().copy(point).sub(tb).applyQuaternion(_q.copy(qb).invert());
    // Fixed joint keeps qa*frameA == qb*frameB; with frameA = identity, frameB = qb^-1 * qa.
    const frameB = _q2.copy(qb).invert().multiply(qa);

    const params = RAPIER.JointData.fixed(
      { x: anchorA.x, y: anchorA.y, z: anchorA.z }, { x: 0, y: 0, z: 0, w: 1 },
      { x: anchorB.x, y: anchorB.y, z: anchorB.z }, { x: frameB.x, y: frameB.y, z: frameB.z, w: frameB.w },
    );
    const joint = this.world.createImpulseJoint(params, bodyA, bodyB, true);
    joint.setContactsEnabled(false);

    const weld = { joint, a, b, markers: [] };
    weld.markers.push(this.game.effects.weldMarker(a.mesh, anchorA));
    if (b) weld.markers.push(this.game.effects.weldMarker(b.mesh, anchorB));
    else weld.markers.push(this.game.effects.weldMarker(this.scene, new THREE.Vector3().copy(point)));
    a.welds.add(weld);
    if (b) b.welds.add(weld);
    return weld;
  }

  unweldOne(weld) {
    if (this.world.getImpulseJoint(weld.joint.handle)) this.world.removeImpulseJoint(weld.joint, true);
    for (const m of weld.markers) m.removeFromParent();
    weld.a.welds.delete(weld);
    if (weld.b) weld.b.welds.delete(weld);
    weld.a.body.wakeUp();
    if (weld.b) weld.b.body.wakeUp();
  }

  unweldAll(prop) {
    const n = prop.welds.size;
    for (const w of [...prop.welds]) this.unweldOne(w);
    return n;
  }

  // Ball joint between two props at a world point (used for ragdoll limbs).
  link(a, b, point) {
    const ta = a.body.translation(), tb = b.body.translation();
    const qa = new THREE.Quaternion().copy(a.body.rotation()).invert();
    const qb = new THREE.Quaternion().copy(b.body.rotation()).invert();
    const la = new THREE.Vector3().copy(point).sub(ta).applyQuaternion(qa);
    const lb = new THREE.Vector3().copy(point).sub(tb).applyQuaternion(qb);
    const joint = this.world.createImpulseJoint(
      RAPIER.JointData.spherical({ x: la.x, y: la.y, z: la.z }, { x: lb.x, y: lb.y, z: lb.z }), a.body, b.body, true,
    );
    joint.setContactsEnabled(false);
    const link = { joint, a, b };
    a.links.add(link);
    b.links.add(link);
    return link;
  }

  unlink(link) {
    if (this.world.getImpulseJoint(link.joint.handle)) this.world.removeImpulseJoint(link.joint, true);
    link.a.links.delete(link);
    link.b.links.delete(link);
  }

  // Everything connected to `prop` through welds (not counting the world).
  group(prop) {
    const seen = new Set([prop]);
    const stack = [prop];
    while (stack.length) {
      const p = stack.pop();
      for (const w of [...p.welds, ...p.links]) {
        for (const o of [w.a, w.b]) if (o && !seen.has(o)) { seen.add(o); stack.push(o); }
      }
    }
    return seen;
  }

  // ---------- queries ----------
  raycast(origin, dir, maxDist = 500, excludeCollider) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, excludeCollider);
    if (!hit) return null;
    const d = hit.timeOfImpact;
    return {
      collider: hit.collider,
      prop: this.byCollider.get(hit.collider.handle) || null,
      npc: this.npcByCollider.get(hit.collider.handle) || null,
      isWorld: this.staticColliders.has(hit.collider.handle),
      distance: d,
      point: new THREE.Vector3(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    };
  }

  // Props near a capsule that are flying at it. Returns [{ prop, speed, mass, vel }] where
  // speed is how fast the prop is closing in on the capsule (relative to selfVel).
  incoming(center, halfHeight, radius, selfVel = { x: 0, y: 0, z: 0 }, ignore = null) {
    const out = [];
    const seen = new Set();
    const shape = new RAPIER.Capsule(halfHeight, radius + 0.35);
    this.world.intersectionsWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, shape, (col) => {
      const prop = this.byCollider.get(col.handle);
      if (!prop || seen.has(prop) || prop.frozen || (ignore && ignore.has(prop))) return true;
      seen.add(prop);
      const v = prop.body.linvel();
      const t = prop.body.translation();
      const rel = { x: v.x - selfVel.x, y: v.y - selfVel.y, z: v.z - selfVel.z };
      const to = new THREE.Vector3(center.x - t.x, center.y - t.y, center.z - t.z);
      const len = to.length() || 1;
      const speed = (rel.x * to.x + rel.y * to.y + rel.z * to.z) / len;
      if (speed > 0) out.push({ prop, speed, mass: prop.body.mass(), vel: v });
      return true;
    }, undefined, GROUPS.onlyProps);
    return out;
  }

  // ---------- per frame ----------
  sync() {
    for (const p of this.props) {
      const t = p.body.translation();
      const r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  cleanup() {
    const now = performance.now();
    for (const p of [...this.props]) {
      if (p.body.translation().y < -60) this.remove(p);
      else if (p.temporary && now - p.bornAt > 20000 && p.welds.size === 0 && !p.frozen && p !== this.game.heldProp) this.remove(p);
    }
  }
}
