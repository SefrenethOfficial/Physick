import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { canvasTex, std } from './buildkit.js';
import { buildFigure, animateWalk } from './figure.js';
import { ITEM_BY_ID } from './items.js';

// The back alleys of Port Calder: bins, crates, graffiti and puddles, and the people you
// don't meet on the high street: an arms dealer, a fence who buys hot goods and sells
// "services", and a chop shop that pays cash for stolen cars.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function graffitiTex() {
  const tags = ['VEX', 'KR8Z', 'NO COPS', 'SKUL', 'DRIP', 'R.I.P. JAY', 'CALDER KINGS', 'ZOMB', '187', 'WAKE UP', 'LOOP'];
  return canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let n = 0; n < 2; n++) {
      const t = pick(tags);
      g.save();
      g.translate(w / 2 + (Math.random() - 0.5) * 60, h / 2 + (n ? 30 : -14));
      g.rotate((Math.random() - 0.5) * 0.3);
      g.font = `bold ${n ? 26 : 46}px Impact, Arial Black, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 7; g.strokeStyle = pick(['#111', '#2a0a3a', '#0a2a3a']);
      g.strokeText(t, 0, 0);
      g.fillStyle = pick(['#ff3b6b', '#3bffb0', '#ffd23b', '#3b9bff', '#ff8a2b', '#d14bff', '#ffffff']);
      g.fillText(t, 0, 0);
      g.restore();
    }
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(Math.random() * w, h * 0.5 + Math.random() * h * 0.5, 2, 6 + Math.random() * 14); }
  });
}

// Dress a service alley running east-west through a block (x0..x1 at z, width w).
export function dressAlley(group, sb, a, y) {
  const { x0, x1, z, w } = a;
  const box = (bw, bh, bd, x, yy, zz, m, collide = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m);
    mesh.position.set(x, yy + bh / 2, zz);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(bw / 2, bh / 2, bd / 2).setTranslation(x, yy + bh / 2, zz));
    return mesh;
  };
  // grimy tarmac and puddles
  const tar = canvasTex(128, 128, (g, cw, ch) => {
    g.fillStyle = '#4a4a48'; g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * cw, Math.random() * ch, 3, 3); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, ch * 0.6); g.lineTo(cw * 0.3, ch * 0.55); g.lineTo(cw * 0.5, ch * 0.7); g.lineTo(cw, ch * 0.62); g.stroke();
  }, [(x1 - x0) / 6, w / 6]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, w), std({ map: tar }));
  floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, y + 0.012, z);
  floor.receiveShadow = true;
  group.add(floor);
  const wet = std({ color: 0x1a2026, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.6 + Math.random() * 0.9, 16), wet);
    p.rotation.x = -Math.PI / 2; p.scale.x = 1.5 + Math.random();
    p.position.set(x0 + 4 + Math.random() * (x1 - x0 - 8), y + 0.02, z + (Math.random() - 0.5) * (w - 2));
    group.add(p);
  }
  // bins, bags, crates, pallets
  const binM = std({ color: pick([0x2f5e3a, 0x2a4a6a, 0x5a2a2a]), roughness: 0.6, metalness: 0.3 });
  const lidM = std({ color: 0x1d1f22 });
  for (const bx of [x0 + 5 + Math.random() * 6, x1 - 8 - Math.random() * 6]) {
    const side = Math.random() < 0.5 ? -1 : 1;
    box(1.9, 1.25, 1.1, bx, y, z + side * (w / 2 - 0.8), binM);
    box(2.0, 0.08, 1.2, bx, y + 1.25, z + side * (w / 2 - 0.8), lidM, false);
  }
  const bagM = std({ color: 0x141414, roughness: 0.3 });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.15, 1), bagM);
    b.scale.y = 0.75;
    b.position.set(x0 + 2 + Math.random() * (x1 - x0 - 4), y + 0.25, z + (Math.random() < 0.5 ? -1 : 1) * (w / 2 - 0.5));
    b.castShadow = true;
    group.add(b);
  }
  const wood = std({ color: 0x8a6440, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const cx = x0 + 10 + Math.random() * (x1 - x0 - 20), cz = z + (Math.random() < 0.5 ? -1 : 1) * (w / 2 - 0.7);
    box(1, 1, 1, cx, y, cz, wood);
    if (Math.random() < 0.6) box(0.9, 0.9, 0.9, cx + 0.05, y + 1, cz, wood);
  }
  // graffiti on both walls, pipes, and a caged bulb
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshStandardMaterial({ map: graffitiTex(), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x0 + 6 + Math.random() * (x1 - x0 - 12), y + 1.6, z + side * (w / 2 - 0.02));
    m.rotation.y = side > 0 ? Math.PI : 0;
    group.add(m);
  }
  const pipeM = std({ color: 0x6f6a62, metalness: 0.5, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 8), pipeM);
    p.position.set(x0 + 4 + Math.random() * (x1 - x0 - 8), y + 4.5, z + side * (w / 2 - 0.12));
    group.add(p);
  }
  for (const lx of [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7]) {
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.35), std({ color: 0xffe6a8, emissive: 0xffd68a, emissiveIntensity: 1.6 }));
    bulb.position.set(lx, y + 4, z - w / 2 + 0.4);
    group.add(bulb);
  }
}

const DEALERS = {
  arms: { title: 'Vic — "hardware"', look: { shirt: 0x3b3226, pants: 0x1d1f22, skin: 0xd9a47c, hat: 'cap', hatColor: 0x111111 }, label: 'Guns', color: '#ff5a4a' },
  fence: { title: 'Rosa — the fence', look: { shirt: 0x5a2a4a, pants: 0x222222, skin: 0xa8724f }, label: 'Fence', color: '#d48aff' },
  chop: { title: "Dimitri's chop shop", look: { shirt: 0x2a4a7a, pants: 0x2a4a7a, skin: 0xf1c9a5, hat: 'cap', hatColor: 0x2a4a7a }, label: 'Chop', color: '#ffb36b' },
};

// The prices: guns come with a little ammo; ammo is per weapon type.
export const ARMS = [
  { id: 'pistol', price: 600, ammo: ['pistolAmmo', 24], blurb: 'Reliable 9 mm. Comes with 24 rounds.' },
  { id: 'shotgun', price: 1500, ammo: ['shells', 16], blurb: 'Pump action. Devastating up close. 16 shells.' },
  { id: 'smg', price: 2200, ammo: ['smgAmmo', 90], blurb: 'Hold the trigger. 90 rounds.' },
  { ammoOnly: 'pistolAmmo', n: 24, price: 60, name: 'Pistol rounds ×24' },
  { ammoOnly: 'shells', n: 16, price: 90, name: 'Shotgun shells ×16' },
  { ammoOnly: 'smgAmmo', n: 90, price: 150, name: 'SMG rounds ×90' },
  { id: 'grenade', price: 300, blurb: 'Throw it (RMB). Four seconds is a long time.' },
  { id: 'armor', price: 500, blurb: 'Soaks up most of the damage until it\'s shot through. Press F to wear.' },
];

export class Underworld {
  constructor(game) {
    this.game = game;
    this.dealers = [];
  }

  // Put a dealer in an alley. kind: 'arms' | 'fence' | 'chop'
  addDealer(kind, alley, y) {
    const d = DEALERS[kind];
    const fig = buildFigure(d.look);
    const x = alley.x0 + (alley.x1 - alley.x0) * (0.4 + Math.random() * 0.2);
    const z = alley.z - alley.w / 2 + 1.0;
    fig.root.position.set(x, y + 0.83, z);
    this.game.scene.add(fig.root);
    this.game.portSandbox.addStaticCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(x, y + 0.83, z));
    const g = this.game.city.group;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.8), std({ color: 0x6a4a30 }));
    crate.position.set(x + 1.4, y + 0.45, z + 0.2);
    crate.castShadow = true;
    g.add(crate);
    this.game.portSandbox.addStaticCollider(RAPIER.ColliderDesc.cuboid(0.8, 0.45, 0.4).setTranslation(x + 1.4, y + 0.45, z + 0.2));
    if (kind === 'arms') {
      // a case of goods on the crate
      const caseM = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.55), std({ color: 0x1b1b1b, metalness: 0.3 }));
      caseM.position.set(x + 1.4, y + 0.99, z + 0.2);
      g.add(caseM);
    }
    if (kind === 'chop') {
      // roller door on the far wall and oil stains
      const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.6), std({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#7d8084'; c.fillRect(0, 0, w, h); for (let yy = 0; yy < h; yy += 4) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, yy, w, 1); } }), metalness: 0.4 }));
      door.position.set(x - 5, y + 1.8, alley.z + alley.w / 2 - 0.03);
      door.rotation.y = Math.PI;
      g.add(door);
      const oil = std({ color: 0x0c0c0c, roughness: 0.2, transparent: true, opacity: 0.7 });
      for (let i = 0; i < 3; i++) {
        const o = new THREE.Mesh(new THREE.CircleGeometry(0.5 + Math.random() * 0.6, 12), oil);
        o.rotation.x = -Math.PI / 2; o.position.set(x - 5 + (Math.random() - 0.5) * 4, y + 0.022, alley.z + (Math.random() - 0.5) * 2);
        g.add(o);
      }
    }
    const dealer = { kind, ...d, fig, pos: new THREE.Vector3(x, y, z), at: new THREE.Vector3(x, y, z + 1.6), alley, phase: Math.random() * 10 };
    this.dealers.push(dealer);
    return dealer;
  }

  near(pos, r = 3.2) {
    return this.dealers.find((d) => Math.hypot(d.at.x - pos.x, d.at.z - pos.z) < r && Math.abs(pos.y - d.at.y - 1) < 2) || null;
  }

  // a stolen car parked in the chop shop's alley
  chopZone(pos) {
    const d = this.dealers.find((x) => x.kind === 'chop');
    if (!d) return null;
    const a = d.alley;
    return pos.x > a.x0 - 2 && pos.x < a.x1 + 2 && Math.abs(pos.z - a.z) < a.w / 2 + 1 ? d : null;
  }

  carPrice(v) {
    const base = v.police ? 1500 : v.base;
    return Math.round(base * (0.35 + 0.65 * Math.max(v.hp, 0) / v.maxHp) / 10) * 10;
  }

  update(dt) {
    const p = this.game.shorePlayer.body.translation();
    for (const d of this.dealers) {
      d.phase += dt;
      const dx = p.x - d.pos.x, dz = p.z - d.pos.z;
      const close = dx * dx + dz * dz < 100;
      const want = close ? Math.atan2(dx, dz) : 0;
      d.fig.root.rotation.y += Math.atan2(Math.sin(want - d.fig.root.rotation.y), Math.cos(want - d.fig.root.rotation.y)) * Math.min(1, dt * 4);
      animateWalk(d.fig.parts, d.phase * 0.6, 0.06); // shifting from foot to foot
    }
  }

  open(d) {
    const g = this.game, e = g.economy;
    if (d.kind === 'arms') this.openArms(d);
    else if (d.kind === 'fence') this.openFence(d);
    else e.open(d.title, e.header() + '<p class="lede">"Bring me a car — any car — park it in the alley and I\'ll pay cash. Cop cars, I pay extra."</p>', null);
  }

  openArms(d) {
    const g = this.game, e = g.economy;
    const render = () => {
      const rows = ARMS.map((a, i) => {
        const def = a.id ? ITEM_BY_ID[a.id] : null;
        const name = def ? def.name : a.name;
        const blurb = a.blurb || `You have ${e.ammo[a.ammoOnly] || 0}`;
        return `<div class="erow"><div><b>${name}</b><small>${blurb}</small></div><div class="btns"><button data-i="${i}" ${e.money < a.price ? 'disabled' : ''}>$${a.price.toLocaleString()}</button></div></div>`;
      }).join('');
      e.open(d.title, e.header() + `<p class="lede">"Cash only. You didn't get these from me."</p><div class="econ-head"><span>Ammo: pistol <b>${e.ammo.pistolAmmo}</b> · shells <b>${e.ammo.shells}</b> · SMG <b>${e.ammo.smgAmmo}</b></span><span>Armour <b>${Math.round(g.health.armor)}</b></span></div>` + rows, (body) => body.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-i]');
        if (!b) return;
        const a = ARMS[+b.dataset.i];
        if (e.money < a.price) return;
        e.addMoney(-a.price, a.id ? `bought a ${ITEM_BY_ID[a.id].name.toLowerCase()}` : 'ammo');
        if (a.ammo) e.addAmmo(a.ammo[0], a.ammo[1]);
        if (a.ammoOnly) e.addAmmo(a.ammoOnly, a.n);
        if (a.id) g.giveItem(ITEM_BY_ID[a.id]);
        g.sfx.play('cash');
        render();
      }));
    };
    render();
  }

  openFence(d) {
    const g = this.game, e = g.economy;
    const render = () => {
      const total = e.bag.reduce((t, id) => t + Math.round(ITEM_BY_ID[id].value * 1.3), 0);
      const stars = g.police.wanted;
      const bribe = 500 * stars;
      const rows = [
        `<div class="erow"><div><b>Sell the whole bag</b><small>Rosa pays 30% over the pawn shop — no questions asked.</small></div><div class="btns"><button data-a="sell" ${e.bag.length ? '' : 'disabled'}>$${total.toLocaleString()}</button></div></div>`,
        `<div class="erow"><div><b>Make the heat go away</b><small>${stars ? `A friend at the station loses the paperwork. Clears ${stars} star${stars > 1 ? 's' : ''}.` : 'Nobody\'s looking for you. Yet.'}</small></div><div class="btns"><button data-a="bribe" ${stars && e.money >= bribe ? '' : 'disabled'}>${stars ? '$' + bribe.toLocaleString() : '—'}</button></div></div>`,
        `<div class="erow"><div><b>Police scanner</b><small>Shows every cop on your map, and they lose interest faster.</small></div><div class="btns">${e.perks.scanner ? '<span class="owned">Owned</span>' : `<button data-a="scanner" ${e.money >= 900 ? '' : 'disabled'}>$900</button>`}</div></div>`,
      ].join('');
      e.open(d.title, e.header() + '<p class="lede">"Whatever you\'ve got, I\'ve got a buyer."</p>' + rows, (body) => body.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]');
        if (!b) return;
        if (b.dataset.a === 'sell') { let t = 0; while (e.bag.length) t += Math.round(e.takeOut(0).value * 1.3); e.addMoney(t, 'from Rosa'); }
        if (b.dataset.a === 'bribe' && g.police.wanted) { e.addMoney(-500 * g.police.wanted, 'bribe'); g.police.clearWanted(); g.hud.toast('The heat is off', 0x7be08a); }
        if (b.dataset.a === 'scanner' && e.money >= 900) { e.addMoney(-900, 'police scanner'); e.perks.scanner = true; e.save(); }
        g.sfx.play('cash');
        render();
      }));
    };
    render();
  }
}
