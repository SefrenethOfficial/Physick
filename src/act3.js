import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';
import { std } from './buildkit.js';

// ACT III: Foundations. The Ashen Hand blow things up; Gideon Pratt's company builds on what's left.
// Verian Central was on land he wanted, and the money runs from both of them offshore, to something
// called MERIDIAN. Somewhere along the way, Vic starts taking calls he doesn't want you to hear.
//   m12 Ash on the Wind    the Ashen Hand raid the volcano base. Somebody told them where it was.
//   (more to come: Following the Money, Dead Man's Switch, Black Water, The Quarry Job, Lockdown)

const FIXER = 'Vic';

// a sign's face: the text as big as it'll go
function textTex(text, bg, fg, aspect) {
  const H = 64, W = Math.round(H * aspect), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  let fs = 40; x.font = `bold ${fs}px Arial`; while (x.measureText(text).width > W - 16 && fs > 8) { fs -= 2; x.font = `bold ${fs}px Arial`; }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const ACT3_KEY_ITEMS = {
  ledger: { name: 'The Meridian ledger', desc: 'Copied off the director\'s computer at Verian National. Ashen Hand front companies pay Pratt Developments; Pratt Developments pays out to an account offshore called MERIDIAN. Every month. Since before the bombing.' },
  raidphone: { name: "The lieutenant's phone", desc: 'One photo in it: your tunnel entrance, taken from the summit car park. Sent from a withheld number, the day before the raid.' },
};

export const ACT3_MISSIONS = [
  {
    id: 'm12', title: 'Ash on the Wind', requires: 'm11',
    brief: `${FIXER}: "Where are you? Get to the volcano. Now. One of my people heard the Ashen Hand are sending a crew tonight, and they know exactly where to go. I don't know how."`,
    reward: 6000,
    passText: `${FIXER}: "A photo of the tunnel. From the car park. … Could've been anyone, kid. People talk. Let me make some calls."`,
  },
  {
    id: 'm13', title: 'Following the Money', requires: 'm12',
    brief: `${FIXER}: "The lieutenant's phone. There's a banking app on it, and every payment goes through Verian National. Downtown. The director keeps his own books on his own computer, up on the executive floor. Go tonight, after the place shuts. Quiet, kid. No guns. A shot in there and every alarm in the city goes off."`,
    reward: 7500,
    passText: `${FIXER}: "Sorry, kid, other line. Wrong number. … Pratt Developments? Gideon Pratt's rebuilding the square. He's untouchable, kid. Send me a copy." He doesn't ask what MERIDIAN is.`,
  },
];

const LOOKS = {
  rifle: { shirt: 0x1d1f22, pants: 0x2a2c30, skin: 0x1a1a1a, hat: 'balaclava', hatColor: 0x111111 },
  smg: { shirt: 0x2a2620, pants: 0x1d1f22, skin: 0x1a1a1a, hat: 'balaclava', hatColor: 0x111111 },
  heavy: { shirt: 0x3a3f36, pants: 0x1d1f22, skin: 0x1a1a1a, hat: 'cranial', hatColor: 0x2a2c30 },
  grenadier: { shirt: 0x4a1f1a, pants: 0x1d1f22, skin: 0x1a1a1a, hat: 'balaclava', hatColor: 0x6a1a14 },
};
const WEAPONS = {
  rifle: { rate: [0.9, 0.9], dmg: 6, acc: 0.8 },
  smg: { rate: [0.25, 0.3], dmg: 3, acc: 0.6 },
  heavy: { rate: [1.4, 0.6], dmg: 11, acc: 1.2, shotgun: true },
  grenadier: { rate: [1.6, 1.0], dmg: 5, acc: 0.6 },
};

export class Act3 {
  constructor(game, story) {
    this.game = game;
    this.story = story;
    this.fitBank();
  }

  get stealth() { return this.story.fallout; } /* (Act II's guards, cameras and takedowns) */

  // ---------------------------------------------------------------- Verian National's executive floor
  // The bank's top floor (4), fitted out by the building's insides as you go up: the director's office,
  // private clients and the boardroom across the front, a corridor in front of them, open-plan desks
  // behind low partitions in the middle (crouch behind them), and the stairs in the back-left corner.
  fitBank() {
    const bank = this.game.city?.bank, B = bank?.B;
    if (!B || B.fit) return;
    this.bankB = B;
    const EXEC = B.floors;
    this.exec = { f: EXEC, pc: { x: 1.6, z: 18.2 }, model: { x: -4.2, z: 11.5 } };
    B.fit = { [EXEC]: (ctx, I) => this.fitExec(ctx, I) };
  }

  fitExec(ctx, I) {
    const { B, y, h, box, lightAt, F } = ctx, M = I.mats, T = 0.3;
    const xL = -B.w / 2 + T, xR = B.w / 2 - T, zB = -B.d / 2 + T, zF = B.d / 2 - T, WH = h - 0.3;
    const oak = this.mats?.oak || (this.mats = {
      oak: std({ color: 0x5a3a24, roughness: 0.5, emissive: 0x5a3a24, emissiveIntensity: 0.2 }),
      glassWall: new THREE.MeshStandardMaterial({ color: 0x9ec5e8, transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0.3 }),
      part: std({ color: 0x6a7480, roughness: 0.9, emissive: 0x6a7480, emissiveIntensity: 0.2 }),
      leather: std({ color: 0x2a2220, roughness: 0.6, emissive: 0x2a2220, emissiveIntensity: 0.25 }),
      carpet: std({ color: 0x5a1f24, roughness: 1 }),
      model: std({ color: 0xf2f0ea, roughness: 0.7, emissive: 0xf2f0ea, emissiveIntensity: 0.3 }),
      green: std({ color: 0x3a7a4a, roughness: 0.9 }),
      screen: new THREE.MeshBasicMaterial({ color: 0x1a2a3a }),
    }).oak;
    const X = this.mats;
    const sign = (text, x, z, rot, w = 1.6, bg = '#1f3b2e', fg = '#f2e6c0', at = 2.35, hh = 0.32) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: textTex(text, bg, fg, w / hh) })); m.position.set(x, y + at, z); m.rotation.y = rot; m.userData.keep = true; F.group.add(m); return m; };
    // a wall along z (x from a to b), with door gaps (centred at the xs given)
    const wallX = (a, b, z, gaps = []) => { let at = a; for (const c of [...gaps.sort((p, q) => p - q), b + 0.9]) { const e = Math.min(b, c - 0.9); if (e - at > 0.05) box(e - at, WH, 0.15, (at + e) / 2, y, z, M.wall, true); at = c + 0.9; } for (const c of gaps) box(1.8, WH - 2.4, 0.15, c, y + 2.4, z, M.wall, true); };
    const wallZ = (a, b, x) => box(0.15, WH, b - a, x, y, (a + b) / 2, M.wall, true);
    // ---- the front: three rooms, doors off the corridor
    const ZW = 7;
    wallX(xL, xR, ZW, [-15, 0, 15]);
    wallZ(ZW, zF, -7.5); wallZ(ZW, zF, 7.5);
    sign('PRIVATE CLIENTS', -15, ZW - 0.1, Math.PI);
    sign('R. HALVERSON · DIRECTOR', 0, ZW - 0.1, Math.PI, 2.4);
    sign('BOARDROOM', 15, ZW - 0.1, Math.PI);
    // the director's office: a big desk facing the door, his computer, a leather chair, a rug, bookcases,
    // and on a table by the window a white model of Verian Central, rebuilt (PRATT DEVELOPMENTS · PHASE II)
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(10, 9), X.carpet); rug.rotation.x = -Math.PI / 2; rug.position.set(0, y + 0.04, 14.5); F.group.add(rug);
    const P = this.exec.pc;
    box(3.4, 0.8, 1.1, 0, y, P.z, oak, true); box(3.5, 0.05, 1.2, 0, y + 0.8, P.z, X.leather);
    box(0.7, 0.42, 0.05, P.x, y + 0.85, P.z - 0.05, M.tv); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.36), this.pcMat && this.copied ? this.pcMat : M.monitor); scr.position.set(P.x, y + 1.06, P.z - 0.02); scr.userData.keep = true; F.group.add(scr); this.pcScreen = scr;
    box(0.8, 1.1, 0.8, -1.2, y, P.z + 1.3, X.leather); /* (his chair, pushed back) */
    for (const x of [-6.6, 6.6]) box(0.5, 2.6, 4, x, y, 17, oak, true);
    for (const x of [-2, 2]) box(0.9, 0.9, 0.9, x, y, 9.4, X.leather, true); // (chairs for visitors)
    const Mo = this.exec.model;
    box(3, 0.85, 2.2, Mo.x, y, Mo.z, oak, true);
    box(2.8, 0.04, 2, Mo.x, y + 0.85, Mo.z, X.green);
    for (const [dx, dz, hh, ww] of [[-0.8, -0.5, 0.9, 0.4], [-0.2, -0.6, 1.3, 0.35], [0.6, -0.4, 0.7, 0.5], [0.8, 0.5, 1.1, 0.4], [-0.7, 0.5, 0.5, 0.6], [0.05, 0.3, 0.25, 0.9]]) box(ww, hh, ww, Mo.x + dx, y + 0.89, Mo.z + dz, X.model);
    { const pl = sign('PRATT DEVELOPMENTS · VERIAN CENTRAL · PHASE II', Mo.x, Mo.z - 1.12, Math.PI, 1.6, '#b08a3a', '#1a1408', 0.66, 0.16); pl.rotation.x = -0.5; pl.rotation.order = 'YXZ'; }
    lightAt(0, 12, 1.4, 0.6); lightAt(0, 18, 1.4, 0.6);
    // private clients: two desks, filing cabinets along the side wall
    for (const x of [-18, -12]) { box(1.8, 0.75, 0.9, x, y, 15, oak, true); box(0.6, 0.6, 0.6, x, y, 16.1, X.leather); }
    for (let z = 9; z < 21; z += 1.2) box(0.6, 1.4, 1, xL + 0.4, y, z, M.metal, true);
    lightAt(-15, 14, 1.4, 0.6);
    // the boardroom: a long table, chairs, and a screen with the logo up
    box(9, 0.78, 2.4, 15, y, 15, oak, true);
    for (let x = 11.4; x < 19; x += 1.4) for (const s of [-1, 1]) box(0.55, 0.9, 0.55, x, y, 15 + s * 1.7, X.leather);
    box(4, 2.2, 0.08, 15, y + 0.6, zF - 0.1, M.tv);
    sign('PRATT DEVELOPMENTS', 15, zF - 0.16, Math.PI, 3.4, '#10161e', '#d8b36a', 1.5, 0.7);
    lightAt(15, 13, 1.4, 0.6); lightAt(15, 18, 1.4, 0.6);
    // ---- the open-plan floor: rows of desks behind low partitions (1.3 m: crouch and they can't see you)
    for (const z of [-7.5, -1]) for (let x = -12; x < 19; x += 7.5) {
      box(6, 1.3, 0.1, x, y, z, X.part, true);
      for (const s of [-1, 1]) { box(1.6, 0.75, 0.8, x - 1.5, y, z + s * 0.75, M.wood, true); box(1.6, 0.75, 0.8, x + 1.5, y, z + s * 0.75, M.wood, true); }
    }
    for (let x = -12; x < 19; x += 6) for (const z of [-11, -4, 3]) lightAt(x, z, 1.4, 0.6);
    // ---- the back: the stairs come up in the corner; a print room, plants, the night's only coffee
    for (let z = -20; z < -13; z += 1.2) box(1, 1.5, 0.6, xR - 0.4, y, z, M.metal, true);
    box(1.6, 1.1, 0.8, 8, y, zB + 0.5, M.white, true);
    for (const [x, z] of [[-14, zB + 0.6], [xR - 0.6, -11], [xL + 0.6, 5.5], [xR - 0.6, 5.5]]) { box(0.5, 0.5, 0.5, x, y, z, M.pot); const pl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), M.plant); pl.position.set(x, y + 1, z); F.group.add(pl); }
    for (let x = -12; x < xR; x += 8) lightAt(x, -17, 1.4, 0.6);
    void zB;
  }

  // floor y (world) of the executive floor, and whether you're up there
  execY() { return this.bankB.k.world(0, 15, 0).y; }
  inBank(p, m = 0.5) { const B = this.bankB, l = B.k.root.worldToLocal(V3(p.x, p.y, p.z)); return Math.abs(l.x) < B.w / 2 + m && Math.abs(l.z) < B.d / 2 + m && l.y > -2 && l.y < B.H + 1 ? l : null; }
  bankW(x, z, dy = 0) { return this.bankB.k.world(x, 15 + dy, z); }

  owns(id) { return ACT3_MISSIONS.some((m) => m.id === id); }
  get vb() { return this.game.volcano; }

  // an Ashen Hand gunman, anywhere (inside the volcano: the hills)
  spawnGoon(a, at, kind) {
    const g = this.game, n = g.citizens.spawnCitizen('hills', 'goon', at.clone(), { look: LOOKS[kind] });
    if (!n) return null;
    Object.assign(n, { kind, weapon: WEAPONS[kind], nadeT: 3 + Math.random() * 3, hp: kind === 'heavy' ? 240 : 100, cash: 30 + Math.floor(Math.random() * 90), items: Math.random() < 0.3 ? ['pistol'] : [], heading: Math.random() * Math.PI * 2, mission: a, alerted: true });
    const p = g.shorePlayer.body.translation(); n.lastSeen = V3(p.x, p.y, p.z);
    if (kind === 'heavy') n.fig.root.scale.setScalar(1.15);
    a.goons.push(n);
    return n;
  }

  start(a) {
    const g = this.game;
    Object.assign(a, { goons: [], stage: 'go', fx: [] });
    if (a.id === 'm13') { this.startM13(a); return; }
    const hasGun = g.held?.gun || g.economy.carried.some((x) => ITEM_BY_ID[x]?.gun);
    if (!hasGun) { g.giveItem(ITEM_BY_ID.smg); g.hud.toast(`${FIXER} left an SMG for you`, 0xffd166); }
    for (const [k, n] of [['smgAmmo', 150], ['pistolAmmo', 60], ['rifleAmmo', 90]]) if ((g.economy.ammo[k] || 0) < n) g.economy.addAmmo(k, n - (g.economy.ammo[k] || 0));
    if (g.health.armor < 50) { g.health.armor = 100; g.hud.toast('…and a vest. You\'re wearing it.', 0x7fb2ff); }
    this.maybeCheckpoint(a);
  }

  maybeCheckpoint(a) {
    const g = this.game, retry = this.retry?.id === a.id && performance.now() - this.retry.t < 20 * 60e3;
    this.retry = null;
    if (retry && !this.vb?.playerInside && !g.vehicles.active && !g.flying && !g.boats?.active && !g.skydive?.active) this.checkpoint(a);
  }

  end(a, pass) {
    const g = this.game;
    for (const n of a.goons || []) if (g.citizens.list.includes(n)) g.citizens.despawn(n);
    for (const o of a.fx || []) o.removeFromParent();
    if (a.phoneMesh) a.phoneMesh.removeFromParent();
    this.alarm(false);
    if (a.id === 'm13') this.stealth.clearStealth(a);
    if (!pass) this.retry = { id: a.id, t: performance.now() };
  }

  checkpoint(a) {
    const g = this.game, v = this.vb;
    if (a.id === 'm13') { const d = this.game.city.bank.door, B = this.bankB, o = V3(d.x - B.x, 0, d.z - B.z).normalize(); this.story.fade(() => { g.placeOnShore(V3(d.x + o.x * 14, d.y + 1.2, d.z + o.z * 14), Math.atan2(-o.x, -o.z)); g.hud.toast('Checkpoint: across the street from the bank', 0x9ec5ff); }); return; }
    if (a.id === 'm12' && v) this.story.fade(() => { g.placeOnShore(v.portal.clone().add(V3(0, 1.2, 0)), Math.atan2(v.T.u.x, v.T.u.z)); g.hud.toast('Checkpoint: the summit car park', 0x9ec5ff); });
  }

  action(pos, a) {
    if (!a || !this.owns(a.id)) return null;
    const g = this.game;
    if (a.id === 'm13') {
      const td = this.inBank(pos) && this.stealth.takedownTarget(a, pos);
      if (td) return { label: 'Silent takedown', run: () => this.stealth.takedown(a, td) };
      const pc = this.bankW(this.exec.pc.x, this.exec.pc.z + 1.1);
      if (a.stage === 'floor' && Math.hypot(pos.x - pc.x, pos.z - pc.z) < 1.7 && Math.abs(pos.y - pc.y) < 2.5) return { label: "(hold E) Copy the director's books", hold: true, run: () => { a.copying = true; } };
      const mo = this.bankW(this.exec.model.x, this.exec.model.z - 1.4);
      if (!a.sawModel && Math.hypot(pos.x - mo.x, pos.z - mo.z) < 1.8 && Math.abs(pos.y - mo.y) < 2.5) return { label: 'Look at the model', run: () => { a.sawModel = true; g.hud.toast('Verian Central, rebuilt: glass towers where the square was. A brass plate: PRATT DEVELOPMENTS · PHASE II · GROUNDBREAKING THIS SPRING.', 0xe8e2d4); } };
      return null;
    }
    if (a.id === 'm12' && a.stage === 'search' && a.phoneAt && Math.hypot(pos.x - a.phoneAt.x, pos.z - a.phoneAt.z) < 2.4) {
      return { label: "Take the lieutenant's phone", run: () => {
        this.story.giveKeyItem('raidphone');
        g.hud.toast(ACT3_KEY_ITEMS.raidphone.desc, 0xe8e2d4);
        setTimeout(() => this.story.end(true), 2200);
        a.stage = 'done';
      } };
    }
    return null;
  }

  // the base's alarm: red lights flashing round the cavern, a klaxon
  alarm(on) {
    const g = this.game, v = this.vb; if (!v) return;
    if (on && !this.alarmLights) {
      this.alarmLights = [];
      for (let k = 0; k < 6; k++) { const p = v.at(v.R - 6, (k / 6) * Math.PI * 2 + 0.5), L = new THREE.PointLight(0xff2010, 0, 40, 1.4); L.position.set(p.x, v.Y + 10, p.z); g.scene.add(L); this.alarmLights.push(L); }
    }
    if (!on && this.alarmLights) { for (const L of this.alarmLights) L.removeFromParent(); this.alarmLights = null; }
  }

  update(a, p, dt) {
    if (a.id === 'm12') this.updM12(a, p, dt);
    if (a.id === 'm13') this.updM13(a, p, dt);
  }

  // ---------------------------------------------------------------- m13: Following the Money
  startM13(a) {
    const g = this.game, dn = g.daynight;
    Object.assign(a, { stage: 'enter', guards: [], cams: [], copy: 0, lastShot: g.lastShotT });
    if (dn && dn.hour > 5 && dn.hour < 21.5) this.story.fade(() => { dn.hour = 22.5; g.hud.toast('Later that night. The bank shut hours ago.', 0x9ec5ff); });
    this.maybeCheckpoint(a);
  }

  // two guards (one up and down the corridor in front of the offices, one round the desks) and two
  // cameras (the far end of the corridor, and the back corner)
  setupExec(a) {
    const S = this.stealth, B = this.bankB, fy = this.execY(), W = (x, z) => this.bankW(x, z), H = (h) => h + B.yaw;
    const look = { shirt: 0x1f3b2e, pants: 0x1d1f22, skin: 0xd9a47c, hat: 'cap', hatColor: 0x111a14 };
    S.spawnGuard(a, W(-17, 4.6), { look, y: fy, route: [W(-17, 4.6), W(18, 4.6)], pauseAt: [0, 1], range: 13, fov: 0.6, speed: 1.3 });
    const loop = [W(-12, -4.2), W(17, -4.2), W(17, -11), W(-12, -11)];
    S.spawnGuard(a, loop[0], { look: { ...look, skin: 0x7a4f35 }, y: fy, route: loop, pauseAt: [1, 3], range: 11, fov: 0.6, speed: 1.2 });
    const c1 = S.addCamera(a, W(21.8, 5.2).setY(fy + 3), H(-Math.PI / 2), 0.35, 14); c1.floorY = fy;
    const c2 = S.addCamera(a, W(21.8, -21.8).setY(fy + 3), H(-Math.PI * 0.75), 0.4, 13); c2.floorY = fy;
  }

  updM13(a, p, dt) {
    const g = this.game, l = this.inBank(p), bank = g.city.bank;
    const det = () => (a.detect > 0.05 ? ` <b style="color:#ff8a6a">Detection ${Math.round(a.detect * 100)}%</b>` : '');
    if (l && g.lastShotT !== a.lastShot) { this.story.end(false, 'Gunfire in the bank! Every alarm in the building went off'); return; }
    a.lastShot = g.lastShotT;
    const up = l && l.y > 13.5; /* (on the executive floor) */
    if (a.stage === 'enter') {
      a.text = l ? 'Go through the door at the back of the banking hall and take the stairs to the top floor' : 'Get into Verian National Bank, downtown, and up to the executive floor';
      a.wp = l ? null : bank.door.clone();
      if (l && l.y > 6 && !a.guards.length) this.setupExec(a);
      if (up) { a.stage = 'floor'; g.hud.toast("The executive floor. Two guards and cameras. Crouch (C) behind the partitions and stay out of the cones. The director's office is at the front.", 0xffd166); }
      return;
    }
    if (a.stage === 'floor') {
      if (l && this.stealth.updateStealth(a, dt, p)) return;
      const pc = this.bankW(this.exec.pc.x, this.exec.pc.z + 1.1);
      const holding = a.copying && g.keys.has('KeyE') && Math.hypot(p.x - pc.x, p.z - pc.z) < 2 && Math.abs(p.y - pc.y) < 2.5;
      if (!holding) a.copying = false;
      if (holding) {
        a.copy += dt / 6;
        a.text = `Copying the director's books… ${Math.round(a.copy * 100)}%${det()}`;
        if (this.pcScreen) this.pcScreen.material = this.pcMat ||= new THREE.MeshBasicMaterial({ color: 0x7be08a });
        if (Math.random() < dt * 3) g.sfx.play('select');
      } else a.text = up ? `Find the director's office (R. HALVERSON, the middle door at the front) and copy the books off his computer.${det()}` : `Back up to the executive floor (top floor)${det()}`;
      a.wp = null;
      if (a.copy >= 1) {
        a.stage = 'out';
        this.story.giveKeyItem('ledger');
        g.hud.toast(ACT3_KEY_ITEMS.ledger.desc, 0xe8e2d4);
        setTimeout(() => { if (this.story.active === a) g.hud.toast(`You ring ${FIXER} to tell him. Engaged.`, 0x9ec5ff); }, 5000);
      }
      return;
    }
    if (a.stage === 'out') {
      if (l && this.stealth.updateStealth(a, dt, p)) return;
      a.text = `Get out of the bank without being seen${det()}`;
      a.wp = null;
      if (!l && Math.hypot(p.x - this.bankB.x, p.z - this.bankB.z) > 45) this.story.end(true);
    }
  }

  // ---------------------------------------------------------------- m12: Ash on the Wind
  updM12(a, p, dt) {
    const g = this.game, v = this.vb, C = g.citizens;
    if (!v) return;
    const inside = v.playerInside, dV = Math.hypot(p.x - v.V.x, p.z - v.V.z);
    a.goons = a.goons.filter((n) => C.list.includes(n));
    const left = a.goons.length;
    // the alarm going, while they're in the base
    if (this.alarmLights) {
      a.klaxT = (a.klaxT || 0) - dt;
      if (a.klaxT <= 0) { a.klaxT = 2.4; if (dV < 120) g.sfx.play('alarm'); }
      this.alarmLights.forEach((L, i) => { L.intensity = Math.max(0, Math.sin(g.time * 6 + i * 1.3)) * 4; });
    }
    if (a.stage !== 'go' && a.stage !== 'done' && dV > 170) { this.story.end(false, 'You ran. They tore the base apart'); return; }
    if (a.stage === 'go') {
      a.text = 'Get to the volcano base: the tunnel from the summit car park';
      a.wp = v.portal.clone();
      if (inside) {
        a.stage = 'wave1'; a.waveT = 3;
        this.alarm(true);
        g.hud.flashBanner('INTRUDERS', '#ff3a2a');
        g.hud.toast('The blast door alarm\'s going: they\'re in the tunnel behind you!', 0xff6a5a);
      }
      return;
    }
    a.wp = null;
    if (a.stage === 'wave1') {
      if (a.waveT != null) {
        a.waveT -= dt; a.text = 'Get ready. They\'re coming up the tunnel';
        if (a.waveT <= 0) {
          a.waveT = null;
          const T = v.T, kinds = ['rifle', 'smg', 'rifle', 'grenadier', 'smg', 'heavy'];
          kinds.forEach((kind, i) => { const t = T.len - 6 - (i % 3) * 4, lat = (i % 2 ? 1 : -1) * (1.5 + (i % 3)); this.spawnGoon(a, V3(T.a.x + T.u.x * t + T.u.z * lat, T.y + 1.05, T.a.z + T.u.z * t - T.u.x * lat), kind); });
        }
        return;
      }
      a.text = `They're coming through the tunnel! Fight them off (${left} left)`;
      this.story.updateNades(a, dt, p);
      if (!left) { a.stage = 'wave2'; a.waveT = 4; g.hud.toast('…Ropes! Coming down from the vent!', 0xff6a5a); this.ropes(a); }
      return;
    }
    if (a.stage === 'wave2') {
      if (a.waveT != null) {
        a.waveT -= dt; a.text = 'Look up: they\'re coming down ropes from the vent';
        if (a.waveT <= 0) {
          a.waveT = null;
          a.ropeAt.forEach((r, i) => { for (const [j, kind] of [[0, 'rifle'], [1, i === 1 ? 'grenadier' : 'smg']]) this.spawnGoon(a, V3(r.x + (j ? 1.4 : -1.4), v.Y + 0.95, r.z), kind); });
        }
        return;
      }
      a.text = `They came down from the vent! Take them out (${left} left)`;
      this.story.updateNades(a, dt, p);
      if (!left) {
        a.stage = 'vault'; a.vaultT = 50; a.waveT = 0.1;
        g.hud.flashBanner('THE COUNTING ROOM', '#ff3a2a');
        g.hud.toast('That was a distraction: there\'s a crew in the counting room, cutting into the safe!', 0xff6a5a);
      }
      return;
    }
    if (a.stage === 'vault') {
      if (a.waveT != null) {
        a.waveT = null;
        /* the room's own axes, from the counters (local x) and the door (local +z) */
        const [c0, c1] = v.counters, s = c1.clone().sub(c0).setY(0).normalize(), mid = c0.clone().add(c1).multiplyScalar(0.5), f = v.counting.clone().sub(mid).setY(0).normalize();
        const loc = (x, z) => v.counting.clone().addScaledVector(s, x).addScaledVector(f, z - 1.6).setY(v.counting.y + 0.95);
        [['smg', -1.5, 3.2], ['rifle', 2, 3.2], ['heavy', 0, -2.0], ['heavy', 0, 0.6]].forEach(([kind, x, z], i) => {
          const n = this.spawnGoon(a, loc(x, z), kind);
          if (n && i === 2) { n.lt = true; n.hp = 360; a.lt = n; } /* (the lieutenant: he's got a phone) */
        });
        return;
      }
      a.vaultT -= dt;
      const s = Math.max(0, Math.ceil(a.vaultT));
      a.text = `Stop them in the counting room before they're through the safe: <b>0:${String(s).padStart(2, '0')}</b> (${left} left)`;
      a.wp = v.counting.clone();
      if (a.lt && C.list.includes(a.lt)) { const t = a.lt.body.translation(); a.ltAt = V3(t.x, v.Y, t.z); }
      if (a.vaultT <= 0 && left) { this.story.end(false, 'They cracked the safe and got away with everything'); return; }
      if (!left) {
        a.stage = 'search'; this.alarm(false);
        a.phoneAt = (a.ltAt || v.counting).clone();
        const ph = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.17), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x3a7aff, emissiveIntensity: 0.6 }));
        ph.position.copy(a.phoneAt).add(V3(0.5, 0.06, 0)); g.scene.add(ph); a.phoneMesh = ph;
        g.hud.toast('That\'s all of them. The lieutenant had a phone on him, and it\'s lit up', 0x7be08a);
      }
      return;
    }
    if (a.stage === 'search') {
      a.text = "The lieutenant's phone is lit up on the floor: take it";
      a.wp = a.phoneAt.clone();
      if (a.phoneMesh) a.phoneMesh.rotation.y += dt * 2;
    }
  }

  // ropes hanging from the vent down into the cavern, where the second lot come down
  ropes(a) {
    const g = this.game, v = this.vb, top = v.ventTop - 2;
    a.ropeAt = [0.9, 2.9, 4.9].map((ang) => v.at(20, ang));
    for (const r of a.ropeAt) {
      const geo = new THREE.BufferGeometry().setFromPoints([V3(v.V.x + (r.x - v.V.x) * 0.1, top, v.V.z + (r.z - v.V.z) * 0.1), V3(r.x, v.Y + 0.2, r.z)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2a2620 }));
      g.scene.add(line); a.fx.push(line);
    }
  }

  tick() {}

  completeText() {
    return `<p>Pratt Developments is rebuilding Verian Central. The Ashen Hand cleared the ground for it. And the money from both goes somewhere offshore called MERIDIAN.</p>
      <p>Vic's phone keeps ringing. He keeps not answering it in front of you.</p>`;
  }
}
