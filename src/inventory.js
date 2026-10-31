import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';
import { BAG_CAPACITY } from './economy.js';

// The inventory: a hotbar of nine slots along the bottom of the screen (1-9 or the scroll wheel
// picks one, and whatever's in it is in your hand), and the bag behind it. TAB opens the lot as
// a grid: drag things between the bag and the hotbar, drag them onto the bin to drop them,
// shift-click to send something straight across.
//
// The hand IS the selected slot: pick something up with an empty slot selected and it goes in
// that slot; throw it, drop it, use it up, sell it, bag it, and the slot's empty again.

export const HOTBAR = 9;

// ---------------------------------------------------------------- item icons
// Each item's own model, rendered once into a little picture.
let IR = null;
const ICONS = new Map();
export function itemIcon(id) {
  if (ICONS.has(id)) return ICONS.get(id);
  const def = ITEM_BY_ID[id];
  let url = '';
  try {
    if (!IR) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
      const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      r.setSize(96, 96, false); r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x50505a, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 3, 4); scene.add(sun);
      IR = { r, canvas, scene, cam: new THREE.PerspectiveCamera(30, 1, 0.01, 100) };
    }
    const built = def.build(), mesh = built.mesh;
    const pivot = new THREE.Group(); pivot.add(mesh);
    pivot.rotation.set(0.5, -0.75, 0.12);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    pivot.position.sub(c);
    IR.scene.add(pivot);
    const rad = Math.max(0.05, s.length() / 2);
    IR.cam.position.set(0, 0, (rad / Math.tan(THREE.MathUtils.degToRad(15))) * 1.02); IR.cam.lookAt(0, 0, 0);
    IR.cam.near = IR.cam.position.z / 50; IR.cam.far = IR.cam.position.z * 4; IR.cam.updateProjectionMatrix();
    IR.r.render(IR.scene, IR.cam);
    url = IR.canvas.toDataURL();
    IR.scene.remove(pivot);
    pivot.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
  } catch { url = ''; }
  ICONS.set(id, url);
  return url;
}

const weightOf = (id) => ITEM_BY_ID[id]?.weight ?? 1;

export class Inventory {
  constructor(game) {
    this.game = game;
    const e = game.economy;
    if (!Array.isArray(e.hotbar) || e.hotbar.length !== HOTBAR) e.hotbar = Array(HOTBAR).fill(null);
    e.sel = Math.max(0, Math.min(HOTBAR - 1, e.sel | 0));
    this.holstered = false;
    // the hotbar on screen
    const hud = document.getElementById('hud');
    this.bar = document.createElement('div'); this.bar.className = 'hotbar';
    this.slotsEl = [];
    for (let k = 0; k < HOTBAR; k++) {
      const s = document.createElement('div'); s.className = 'hslot';
      s.innerHTML = `<i>${k + 1}</i><img alt=""><b></b>`;
      this.bar.appendChild(s); this.slotsEl.push(s);
    }
    this.label = document.createElement('div'); this.label.className = 'hotlabel';
    hud.append(this.bar, this.label);
    this.labelT = 0;
    this._key = '';
  }

  get e() { return this.game.economy; }

  // can you have something in your hand right now?
  canHold() {
    const g = this.game;
    return g.started && !g.vehicles?.active && !g.boats?.active && !g.flying && !g.atHelm && !g.gunnery?.active && !g.pragdoll?.active && !g.health?.dead && !g.dragging && !g.hostage;
  }

  // the hand changed (main.js's held setter): keep the selected slot in step with it
  handChanged(prev, d) {
    if (this.switching) return;
    const e = this.e;
    if (!d) { if (prev) e.hotbar[e.sel] = null; } // (it left your hand: thrown, dropped, used, sold, bagged)
    else if (d.id && ITEM_BY_ID[d.id]) {
      const cur = e.hotbar[e.sel];
      if (cur && cur !== d.id) this.relocate(cur, e.sel); // (something else was in the slot: shuffle it along)
      e.hotbar[e.sel] = d.id;
      this.holstered = false;
    }
    e.save();
    this.refresh(true);
  }

  // find a home for an item: an empty hotbar slot, the bag, or your feet
  relocate(id, not = -1) {
    const e = this.e, k = e.hotbar.findIndex((x, i) => !x && i !== not);
    if (k >= 0) { e.hotbar[k] = id; return `slot ${k + 1}`; }
    if (e.stash(ITEM_BY_ID[id], true)) return 'bag';
    this.game.dropFromBag(ITEM_BY_ID[id]);
    return 'floor';
  }

  // put whatever's in the selected slot into your hand (or empty it)
  syncHand(noise = false) {
    const g = this.game, e = this.e, id = e.hotbar[e.sel], def = id ? ITEM_BY_ID[id] : null;
    if ((g.held?.id ?? null) === (id ?? null) && !this.holstered) return;
    this.switching = true;
    g.firing = false; g.mopping = false; g.scoped = false;
    g.held = def;
    if (def) g.viewmodel.setHeld(def.build().mesh, def.heldSize, def.heldRot, def.heldPush); else g.viewmodel.setHeld(null);
    this.switching = false;
    this.holstered = false;
    g.refreshHolding();
    if (noise && def) g.sfx.play('grab');
  }

  // into a car or a boat, or knocked flat: the hand's emptied but the item stays in its slot
  holster() {
    const g = this.game;
    if (!g.held) return;
    this.switching = true; g.held = null; this.switching = false;
    g.firing = false; g.mopping = false;
    g.viewmodel.setHeld(null); g.hud.setHolding(null);
    this.holstered = true;
  }

  select(k) {
    const e = this.e;
    k = ((k % HOTBAR) + HOTBAR) % HOTBAR;
    if (k === e.sel && !this.holstered) return;
    e.sel = k; e.save();
    if (this.canHold()) this.syncHand(true); else this.holstered = true;
    const id = e.hotbar[k];
    this.flash(id ? ITEM_BY_ID[id].name : `Slot ${k + 1}: empty`);
    this.refresh(true);
  }
  scroll(dir) { this.select(this.e.sel + dir); }

  flash(text) { this.label.textContent = text; this.label.classList.add('on'); this.labelT = 1.6; }

  // an item bought or given: your hand if the slot's free, else the next empty slot, else the bag
  give(def) {
    const g = this.game, e = this.e;
    if (!g.held && !e.hotbar[e.sel] && this.canHold()) { g.holdItem(def); return; }
    const where = this.relocate(def.id);
    g.hud.toast(`${def.name} → ${where}`);
    this.refresh(true);
  }

  update(dt) {
    if (this.holstered && this.canHold()) this.syncHand();
    if (this.labelT > 0) { this.labelT -= dt; if (this.labelT <= 0) this.label.classList.remove('on'); }
    this.refresh();
  }

  refresh(force = false) {
    const g = this.game, e = this.e;
    const show = g.started && !g.vehicles?.active && !g.boats?.active && !g.flying && !g.atHelm && !g.gunnery?.active && !g.health?.dead && !g.story?.phone?.isOpen;
    const ammo = (id) => { const d = ITEM_BY_ID[id]; return d?.gun ? e.ammo[d.gun.ammo] || 0 : null; };
    const key = `${show}|${e.sel}|${e.hotbar.join(',')}|${e.hotbar.map(ammo).join(',')}`;
    if (!force && key === this._key) return;
    this._key = key;
    this.bar.classList.toggle('on', show);
    e.hotbar.forEach((id, k) => {
      const s = this.slotsEl[k], img = s.querySelector('img'), b = s.querySelector('b');
      s.classList.toggle('sel', k === e.sel);
      s.classList.toggle('full', !!id);
      const src = id ? itemIcon(id) : '';
      if (img.getAttribute('src') !== src) { if (src) img.setAttribute('src', src); else img.removeAttribute('src'); }
      const a = id ? ammo(id) : null;
      b.textContent = a != null ? a : '';
      s.title = id ? ITEM_BY_ID[id].name : '';
    });
  }

  // ---------------------------------------------------------------- the inventory screen (TAB)
  open() {
    const g = this.game, e = this.e;
    const slot = (where, i, id, extra = '') => {
      const d = id ? ITEM_BY_ID[id] : null;
      const tip = d ? `${d.name} · ~$${d.value} · weight ${d.weight ?? 1}${d.gun ? ` · ${e.ammo[d.gun.ammo] || 0} rds` : ''}` : '';
      return `<div class="islot ${d ? 'full' : ''} ${extra}" data-w="${where}" data-i="${i}" title="${tip}">${where === 'hot' ? `<i>${i + 1}</i>` : ''}${d ? `<img src="${itemIcon(id)}" alt=""><span>${d.name}</span>` : ''}</div>`;
    };
    const render = () => {
      const n = Math.max(27, Math.ceil((e.bag.length + 1) / 9) * 9);
      let bagHtml = '';
      for (let i = 0; i < n; i++) bagHtml += slot('bag', i, e.bag[i] || null);
      let hotHtml = '';
      for (let k = 0; k < HOTBAR; k++) hotHtml += slot('hot', k, e.hotbar[k], k === e.sel ? 'sel' : '');
      const w = e.weight;
      const html = e.header()
        + `<p class="ihint">Drag things between the bag and your hotbar · <kbd>Shift</kbd>-click to send one straight across · drag onto the bin (or off the panel) to drop it · <kbd>1</kbd>–<kbd>9</kbd> or the scroll wheel picks what's in your hand</p>`
        + `<div class="ihead"><b>Hotbar</b><span>in your hand: slot ${e.sel + 1}</span><div class="ibin" data-w="bin">🗑 Drop</div></div><div class="igrid hot">${hotHtml}</div>`
        + `<div class="ihead"><b>Bag</b><span class="${w > BAG_CAPACITY * 0.9 ? 'warn' : ''}">${w.toFixed(1)} / ${BAG_CAPACITY} kg</span></div><div class="igrid">${bagHtml}</div>`
        + (g.story?.keyItemsHtml() || '');
      e.open('Inventory', html, (body) => this.bind(body, render));
      document.querySelector('#panel .panel')?.classList.add('inv');
    };
    this.rerender = render;
    render();
  }

  bind(body, render) {
    let drag = null;
    // (let go off the panel altogether, on the dimmed game behind it: that's a drop too)
    const at = (x, y) => { const el = document.elementFromPoint(x, y); if (!el) return null; if (!el.closest('#panel .panel')) return { dataset: { w: 'bin', i: '0' }, classList: { add() {} } }; return el.closest('[data-w]'); };
    body.addEventListener('mousedown', (ev) => {
      const s = ev.target.closest('.islot.full'); if (!s || ev.button !== 0) return;
      ev.preventDefault();
      if (ev.shiftKey) { this.quickMove(s.dataset.w, +s.dataset.i); render(); return; }
      const ghost = s.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost);
      drag = { from: s, w: s.dataset.w, i: +s.dataset.i, ghost };
      s.classList.add('lifted');
      const move = (m) => { ghost.style.left = `${m.clientX - 30}px`; ghost.style.top = `${m.clientY - 30}px`; body.querySelectorAll('.over').forEach((o) => o.classList.remove('over')); at(m.clientX, m.clientY)?.classList.add('over'); };
      const up = (u) => {
        removeEventListener('mousemove', move); removeEventListener('mouseup', up);
        ghost.remove();
        const t = at(u.clientX, u.clientY);
        if (t && drag) this.move(drag.w, drag.i, t.dataset.w, +t.dataset.i);
        drag = null; render();
      };
      move(ev);
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    });
    body.addEventListener('dblclick', (ev) => { const s = ev.target.closest('.islot.full'); if (s) { this.quickMove(s.dataset.w, +s.dataset.i); render(); } });
  }

  // shift-click: bag → the first empty hotbar slot; hotbar → the bag
  quickMove(w, i) {
    const e = this.e;
    if (w === 'bag') { const k = e.hotbar.findIndex((x) => !x); if (k < 0) { this.game.hud.toast('The hotbar is full'); return; } this.move('bag', i, 'hot', k); }
    else this.move('hot', i, 'bag', e.bag.length);
  }

  // move an item from one slot to another (swapping if there's something there)
  move(fw, fi, tw, ti) {
    const g = this.game, e = this.e;
    if (fw === tw && fi === ti) return;
    const get = (w, i) => (w === 'hot' ? e.hotbar[i] : e.bag[i]) || null;
    const id = get(fw, fi);
    if (!id) return;
    const handBefore = e.hotbar[e.sel];
    if (tw === 'bin') {
      if (fw === 'hot') e.hotbar[fi] = null; else e.bag.splice(fi, 1);
      g.dropFromBag(ITEM_BY_ID[id]);
    } else if (fw === 'hot' && tw === 'hot') {
      [e.hotbar[fi], e.hotbar[ti]] = [e.hotbar[ti], e.hotbar[fi]];
    } else if (fw === 'bag' && tw === 'bag') {
      const [x] = e.bag.splice(fi, 1); e.bag.splice(Math.min(ti, e.bag.length), 0, x);
    } else if (fw === 'bag' && tw === 'hot') {
      const other = e.hotbar[ti];
      if (other && e.weight - weightOf(id) + weightOf(other) > BAG_CAPACITY) { g.hud.toast('No room in the bag for the swap', 0xff8a6a); return; }
      e.bag.splice(fi, 1);
      if (other) e.bag.splice(fi, 0, other);
      e.hotbar[ti] = id;
    } else if (fw === 'hot' && tw === 'bag') {
      const other = e.bag[ti] || null;
      if (e.weight + weightOf(id) - (other ? weightOf(other) : 0) > BAG_CAPACITY) { g.hud.toast('Bag is full', 0xff8a6a); return; }
      if (other) { e.bag[ti] = id; e.hotbar[fi] = other; } else { e.bag.push(id); e.hotbar[fi] = null; }
    }
    g.hud.setBag(e.weight, BAG_CAPACITY);
    e.save();
    if (e.hotbar[e.sel] !== handBefore || (g.held?.id ?? null) !== (e.hotbar[e.sel] ?? null)) { if (this.canHold()) this.syncHand(); else this.holstered = true; }
    this.refresh(true);
  }
}
