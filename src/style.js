import * as THREE from 'three';
import { buildFigure, animateWalk } from './figure.js';

// Your look: what you're wearing. Bought at Saltmarsh Threads (the clothes shop on the Saltmarsh
// shore). Other players see it in multiplayer; you see it on your own sleeve when you hold a
// two-handed gun, and on yourself when you go flying out of a car.

const KEY = 'physick.style.v1';
export const SHIRTS = [0x2a303a, 0xd9483b, 0x2f7fd8, 0x3aa760, 0xe0a52b, 0x8a54c9, 0x1f9aa3, 0xe06a9b, 0xf2f2ee, 0x15161a, 0x7a4f35, 0xff7a1a];
export const PANTS = [0x2c3440, 0x4a3b2a, 0x34495e, 0x5b5b5b, 0x2d4a2d, 0x15161a, 0xc8b48a, 0x8a2a22];
export const SKINS = [0xffdcbd, 0xf1c9a5, 0xd9a47c, 0xa8724f, 0x7a4f35, 0x5a3a24];
export const HAT_COLORS = [0x1b2638, 0x15161a, 0xd9483b, 0x2f7fd8, 0x3aa760, 0xe0a52b, 0xf2f2ee, 0x6a4a30, 0xe06a9b];
export const HATS = [
  { id: null, name: 'No hat', price: 0 },
  { id: 'cap', name: 'Baseball cap', price: 60 },
  { id: 'beanie', name: 'Beanie', price: 50 },
  { id: 'cowboy', name: 'Cowboy hat', price: 250 },
  { id: 'tophat', name: 'Top hat', price: 400 },
  { id: 'helmet', name: 'Motorbike helmet', price: 300 },
  { id: 'crown', name: 'Gold crown', price: 25000 },
];
export const EXTRAS = [
  { id: 'shades', name: 'Sunglasses', price: 120 },
  { id: 'aviators', name: 'Gold aviators', price: 900 },
  { id: 'chain', name: 'Gold chain', price: 1500 },
  { id: 'backpack', name: 'Backpack', price: 200 },
];
const COLOR_PRICE = 40; // a new shirt or trousers in another colour
const DEFAULT = { shirt: 0x2a303a, pants: 0x2c3440, skin: 0xd9a47c, hat: null, hatColor: 0x1b2638, glasses: null, chain: false, backpack: false };
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// What you're wearing, straight from the save (for before the game's built: multiplayer's hello).
export function savedLook() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!s?.look) return null; const L = { ...DEFAULT, ...s.look }; return { shirt: L.shirt, pants: L.pants, skin: L.skin, hat: L.hat || undefined, hatColor: L.hatColor, glasses: L.glasses || undefined, chain: L.chain || undefined, backpack: L.backpack || undefined }; } catch { return null; }
}

export class Style {
  constructor(game) {
    this.game = game;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* none */ }
    this.look = { ...DEFAULT, ...(s?.look || {}) };
    this.owned = new Set(s?.owned || []);
    this.apply();
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify({ look: this.look, owned: [...this.owned] })); } catch { /* storage unavailable */ } }

  // The look as the figure builder wants it.
  get figureLook() {
    const L = this.look;
    return { shirt: L.shirt, pants: L.pants, skin: L.skin, hat: L.hat || undefined, hatColor: L.hatColor, glasses: L.glasses || undefined, chain: L.chain || undefined, backpack: L.backpack || undefined };
  }

  // Wear it: your sleeve, and what other players see.
  apply() {
    const g = this.game;
    if (g.viewmodel) { g.viewmodel.look = this.figureLook; if (g.held?.twoHand) g.holdItem(g.held); }
    g.net?.lookChanged?.();
  }

  // ---------------------------------------------------------------- the shop
  open(st) {
    const g = this.game, e = g.economy;
    const L = this.look;
    const swatches = (key, colors, price) => `<div class="sw-row">${colors.map((c) => `<button class="sw${L[key] === c ? ' on' : ''}" data-a="color" data-k="${key}" data-c="${c}" style="background:${hex(c)}" title="${price ? '$' + price : 'free'}"></button>`).join('')}</div>`;
    const render = () => {
      let html = e.header();
      const owed = g.stores.unpaid.filter((u) => u.st === st), total = owed.reduce((t, u) => t + Math.max(2, Math.round((u.def.value ?? 10) * 1.25)), 0);
      if (total) html += `<div class="erow"><div><b>Pay for ${owed.length} item${owed.length > 1 ? 's' : ''}</b><small>${owed.map((u) => u.def.name).join(', ')}</small></div><div class="btns"><button data-a="pay" ${e.money >= total ? '' : 'disabled'}>$${total}</button></div></div>`;
      html += `<div class="style-shop"><div class="style-preview"></div><div class="style-opts">`;
      html += `<p class="lede">"Looking sharp is half the job." Changing your shirt or trousers colour is $${COLOR_PRICE}. Hats and extras are yours to wear once you've bought them.</p>`;
      html += `<h4>Shirt <small>$${COLOR_PRICE}</small></h4>${swatches('shirt', SHIRTS, COLOR_PRICE)}`;
      html += `<h4>Trousers <small>$${COLOR_PRICE}</small></h4>${swatches('pants', PANTS, COLOR_PRICE)}`;
      html += `<h4>Skin tone <small>free</small></h4>${swatches('skin', SKINS, 0)}`;
      html += '<h4>Hats</h4><div class="opt-row">' + HATS.map((h) => {
        const own = !h.id || this.owned.has(h.id), on = (L.hat || null) === h.id;
        return `<button data-a="hat" data-id="${h.id ?? ''}" class="${on ? 'on' : ''}" ${!own && e.money < h.price ? 'disabled' : ''}>${h.name}${own ? '' : ` · $${h.price.toLocaleString()}`}</button>`;
      }).join('') + '</div>';
      if (L.hat && L.hat !== 'crown') html += `<h4>Hat colour <small>free</small></h4>${swatches('hatColor', HAT_COLORS, 0)}`;
      html += '<h4>Extras</h4><div class="opt-row">' + EXTRAS.map((x) => {
        const own = this.owned.has(x.id), on = this.wearing(x.id);
        return `<button data-a="extra" data-id="${x.id}" class="${on ? 'on' : ''}" ${!own && e.money < x.price ? 'disabled' : ''}>${x.name}${own ? (on ? ' ✓' : '') : ` · $${x.price.toLocaleString()}`}</button>`;
      }).join('') + '</div>';
      html += '</div></div>';
      e.open('Saltmarsh Threads', html, (body) => {
        body.querySelector('.style-preview')?.appendChild(this.previewCanvas());
        this.showPreview();
        body.addEventListener('click', (ev) => {
          const b = ev.target.closest('button[data-a]');
          if (!b) return;
          if (b.dataset.a === 'pay') g.stores.pay(st); else this.act(b.dataset);
          render();
        });
      });
    };
    render();
  }

  wearing(id) {
    const L = this.look;
    return id === 'shades' ? L.glasses === 'black' : id === 'aviators' ? L.glasses === 'gold' : id === 'chain' ? !!L.chain : id === 'backpack' ? !!L.backpack : false;
  }

  act({ a, k, c, id }) {
    const g = this.game, e = g.economy, L = this.look;
    const buy = (price, what) => { if (e.money < price) { g.hud.toast('Not enough cash', 0xff8a6a); return false; } if (price) { e.addMoney(-price, what); g.sfx.play('cash'); } return true; };
    if (a === 'color') {
      const col = +c;
      if (L[k] === col) return;
      if ((k === 'shirt' || k === 'pants') && !buy(COLOR_PRICE, k === 'shirt' ? 'a new shirt' : 'new trousers')) return;
      L[k] = col;
    } else if (a === 'hat') {
      const h = HATS.find((x) => (x.id ?? '') === id);
      if (!h) return;
      if (h.id && !this.owned.has(h.id)) { if (!buy(h.price, `a ${h.name.toLowerCase()}`)) return; this.owned.add(h.id); }
      L.hat = h.id;
    } else if (a === 'extra') {
      const x = EXTRAS.find((q) => q.id === id);
      if (!x) return;
      if (!this.owned.has(id)) { if (!buy(x.price, x.name.toLowerCase())) return; this.owned.add(id); }
      const on = !this.wearing(id);
      if (id === 'shades') L.glasses = on ? 'black' : null;
      if (id === 'aviators') L.glasses = on ? 'gold' : null;
      if (id === 'chain') L.chain = on;
      if (id === 'backpack') L.backpack = on;
    }
    this.save();
    this.apply();
    this.showPreview();
  }

  // a little turntable of you in the new clothes
  previewCanvas() {
    if (this.pv) return this.pv.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = 220; canvas.height = 300;
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(220, 300, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.2));
    const key = new THREE.DirectionalLight(0xfff0dd, 2); key.position.set(1, 2, 2); scene.add(key);
    const cam = new THREE.PerspectiveCamera(30, 220 / 300, 0.1, 20);
    cam.position.set(0, 0.25, 3.6); cam.lookAt(0, 0.05, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 32), new THREE.MeshStandardMaterial({ color: 0x3a3e44 }));
    disc.position.y = -0.85; scene.add(disc);
    this.pv = { canvas, r, scene, cam, fig: null, t: 0 };
    return canvas;
  }

  showPreview() {
    const pv = this.pv;
    if (!pv) return;
    if (pv.fig) pv.scene.remove(pv.fig.root);
    pv.fig = buildFigure(this.figureLook);
    pv.scene.add(pv.fig.root);
    if (pv.loop) return;
    const tick = () => {
      if (!pv.canvas.isConnected) { pv.loop = null; return; }
      pv.t += 1 / 60;
      pv.fig.root.rotation.y = pv.t * 0.8;
      animateWalk(pv.fig.parts, pv.t * 2, 0.15);
      pv.r.render(pv.scene, pv.cam);
      pv.loop = requestAnimationFrame(tick);
    };
    pv.loop = requestAnimationFrame(tick);
  }
}
