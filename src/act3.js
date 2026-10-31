import * as THREE from 'three';
import { ITEM_BY_ID } from './items.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { std, canvasTex } from './buildkit.js';
import { blocked } from './world.js';
import { BOAT_BY_ID } from './boats.js';

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
  sniperphone: { name: "The sniper's phone", desc: 'One message, from a withheld number, an hour before you got to the cabins: "Cabin 3. He\'s alone tonight."' },
  hollowsplans: { name: 'Demolition plans: the Hollows', desc: 'PRATT DEVELOPMENTS · HOLLOWS REGENERATION. Six blocks of the Hollows, each marked "VACANT BY Q3". Nobody\'s told the people living in them. Clipped to the back: a list of "site preparation" dates, and the first one is next week.' },
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
  {
    id: 'm14', title: "Dead Man's Switch", requires: 'm13',
    brief: `${FIXER}: "Somebody saw your ledger and wants out. Elias Varga, Pratt Developments' bookkeeper. Twenty years cooking Pratt's books, and now he's scared. He's hiding up at Ridgeback Cabins, cabin 3. Nobody knows he's there but me. Walk him through the woods to the volcano. Dutch will take him out by sea, and then he talks."`,
    reward: 8000,
    passText: `${FIXER}: "Cabin 3? … No. No, I didn't tell anyone, kid. Who would I tell? … Look, we'll talk later. I've got a call."`,
  },
  {
    id: 'm15', title: 'Black Water', requires: 'm14',
    brief: `${FIXER}: "Kid. I've been asking around. Pratt's got a barge running \"cement\" out of Ridgeback tonight. It isn't cement. Get to the sea pen, take one of Dutch's armoured boats, and stop it. Get on board and find out what he's moving. And kid… about cabin 3. It wasn't me. You know that, right?"`,
    reward: 9000,
    passText: `${FIXER}: "The Hollows. Six blocks of people's homes. He's going to do Verian Central again." … "I'll call you back." He hangs up before you can say anything.`,
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
  spawnGoon(a, at, kind, island = 'hills') {
    const g = this.game, n = g.citizens.spawnCitizen(island, 'goon', at.clone(), { look: LOOKS[kind] });
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
    if (a.id === 'm14') { this.startM14(a); return; }
    if (a.id === 'm15') { this.startM15(a); return; }
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
    if (a.elias && g.citizens.list.includes(a.elias)) g.citizens.despawn(a.elias);
    if (a.id === 'm15') {
      g.boats.boardAt = null;
      for (const c of a.cols || []) { g.portSandbox.staticColliders.delete(c.handle); g.portSandbox.world.removeCollider(c, false); }
      const strand = a.barge && g.onShore && !g.boats.active && a.W && (() => { const t = g.shorePlayer.body.translation(); return Math.abs(a.barge.mesh.worldToLocal(V3(t.x, t.y, t.z)).x) < 5; })();
      for (const e of [...(a.escorts || []), a.barge]) if (e && g.boats.list.includes(e) && !strand) g.boats.remove(e);
      if (strand) { a.barge.ai = null; this.leftBarge = a.barge; this.leftCols = a.cols; a.cols = []; } /* (you're standing on it: it stays till you've left) */
      if (a.loan && g.boats.list.includes(a.loan) && g.boats.active !== a.loan && !pass) g.boats.remove(a.loan);
      if (a.loan) a.loan.loan = true;
    }
    this.alarm(false);
    if (a.id === 'm13') this.stealth.clearStealth(a);
    if (!pass) this.retry = { id: a.id, t: performance.now() };
  }

  checkpoint(a) {
    const g = this.game, v = this.vb;
    if (a.id === 'm15') { const pen = this.rb.pen; this.story.fade(() => { g.placeOnShore(V3(this.vb.penDealer.x, this.vb.penDealer.y + 1.2, this.vb.penDealer.z), 0); g.hud.toast('Checkpoint: the sea pen', 0x9ec5ff); }); void pen; return; }
    if (a.id === 'm14') { const c = this.rb.cabins[2], d = c.door; this.story.fade(() => { g.placeOnShore(V3(d.x, d.y + 1.2, d.z).add(V3(Math.sin(c.yaw + Math.PI) * -6, 0, Math.cos(c.yaw + Math.PI) * -6)), c.yaw + Math.PI); g.hud.toast('Checkpoint: Ridgeback Cabins', 0x9ec5ff); }); return; }
    if (a.id === 'm13') { const d = this.game.city.bank.door, B = this.bankB, o = V3(d.x - B.x, 0, d.z - B.z).normalize(); this.story.fade(() => { g.placeOnShore(V3(d.x + o.x * 14, d.y + 1.2, d.z + o.z * 14), Math.atan2(-o.x, -o.z)); g.hud.toast('Checkpoint: across the street from the bank', 0x9ec5ff); }); return; }
    if (a.id === 'm12' && v) this.story.fade(() => { g.placeOnShore(v.portal.clone().add(V3(0, 1.2, 0)), Math.atan2(v.T.u.x, v.T.u.z)); g.hud.toast('Checkpoint: the summit car park', 0x9ec5ff); });
  }

  action(pos, a) {
    if (!a || !this.owns(a.id)) return null;
    const g = this.game;
    if (a.id === 'm15' && a.W && (a.stage === 'search' || a.stage === 'aboard')) {
      const near = (lx, lz, r) => { const w = a.W(lx, lz); return Math.hypot(pos.x - w.x, pos.z - w.z) < r && Math.abs(pos.y - w.y) < 2.6; };
      if (!a.crates && near(-1.1, 7.4, 2.2)) return { label: 'Force the crates open', run: () => {
        a.crates = true; g.sfx.play('crash');
        g.giveItem(ITEM_BY_ID.rifle || ITEM_BY_ID.smg); g.economy.addAmmo('rifleAmmo', 60);
        g.hud.toast('Rifles, still in grease paper, and boxes of rounds. Ashen Hand guns, on a Pratt barge. You help yourself to one.', 0xe8e2d4);
      } };
      if (a.stage === 'search' && near(0, 9.3, 2.2)) return { label: 'Search the wheelhouse', run: () => {
        this.story.giveKeyItem('hollowsplans');
        g.hud.toast(ACT3_KEY_ITEMS.hollowsplans.desc, 0xe8e2d4);
        a.stage = 'done';
        setTimeout(() => this.story.end(true), 4500);
      } };
    }
    if (a.id === 'm14') {
      if (a.stage === 'meet' && Math.hypot(pos.x - a.cabin.door.x, pos.z - a.cabin.door.z) < 3.5) return { label: 'Knock on cabin 3', run: () => {
        g.sfx.play('punch');
        a.stage = 'escort'; a.d0 = Math.hypot(a.elias.body.translation().x - this.vb.portal.x, a.elias.body.translation().z - this.vb.portal.z);
        const t = a.elias.body.translation(); a.trail = [V3(t.x, t.y, t.z), a.cabin.door.clone()];
        g.hud.toast(`Elias: "Who— You're Vic's? Thank God. He's the only one who knows I'm here."`, 0xe8e2d4);
        setTimeout(() => { if (this.story.active === a) g.hud.toast('Elias: "Lead the way. I\'m right behind you. Not too fast, I\'m an accountant."', 0xe8e2d4); }, 3500);
      } };
      if (a.stage === 'phone' && a.phoneAt && Math.hypot(pos.x - a.phoneAt.x, pos.z - a.phoneAt.z) < 2.6) return { label: "Take the sniper's phone", run: () => {
        this.story.giveKeyItem('sniperphone');
        g.hud.toast(ACT3_KEY_ITEMS.sniperphone.desc, 0xe8e2d4);
        setTimeout(() => g.hud.toast("Only one person knew which cabin.", 0xff8a6a), 3200);
        a.stage = 'done';
        setTimeout(() => this.story.end(true), 6500);
      } };
      return null;
    }
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
    if (a.id === 'm14') this.updM14(a, p, dt);
    if (a.id === 'm15') this.updM15(a, p, dt);
  }

  // ---------------------------------------------------------------- m15: Black Water
  // A Pratt Aggregates barge out at sea west of the pen with two Ashen Hand boats riding shotgun.
  // Ram the escorts under, ram the barge until its rudder goes, then pull alongside and climb on.
  startM15(a) {
    const g = this.game, pen = this.rb.pen;
    Object.assign(a, { stage: 'pen', escorts: [], crew: [], rams: 0, crates: false });
    const hasGun = g.held?.gun || g.economy.carried.some((x) => ITEM_BY_ID[x]?.gun);
    if (!hasGun) { g.giveItem(ITEM_BY_ID.smg); g.hud.toast(`${FIXER} left an SMG for you`, 0xffd166); }
    for (const [k, n] of [['smgAmmo', 150], ['pistolAmmo', 60]]) if ((g.economy.ammo[k] || 0) < n) g.economy.addAmmo(k, n - (g.economy.ammo[k] || 0));
    // Dutch lends you a gunboat if you haven't an armoured boat of your own in the pen
    const mine = g.boats.list.find((b) => b.owned && b.alive && b.type.armored);
    if (!mine) {
      const loan = g.boats.spawnOwned('gunboat'); loan.loan = true; a.loan = loan; }
    a.boat0 = mine || a.loan;
    // the barge: out west of the pen, heading out to sea
    const n = pen.n, s = { x: -n.z, z: n.x };
    let st = null;
    for (let k = 0; k < 30 && !st; k++) { const d = 420 + k * 20, x = pen.x + n.x * d + s.x * 160, z = pen.z + n.z * d + s.z * 160; if (!blocked(x, z, 40)) st = { x, z }; }
    a.route = [1, 2, 3, 4].map((k) => ({ x: st.x + n.x * 700 * k + s.x * 120 * Math.sin(k), z: st.z + n.z * 700 * k + s.z * 120 * Math.sin(k) }));
    this.makeBarge(a, st.x, st.z, Math.atan2(-n.x, -n.z));
    for (const [i, id] of [[0, 'speedboat'], [1, 'rib']]) {
      const e = g.boats.spawnPolice(st.x + s.x * (i ? 22 : -22), st.z + s.z * (i ? 22 : -22), a.barge.heading);
      this.dressEscort(e, BOAT_BY_ID[id]); e.ai = (b, dt) => this.escortAI(a, b, dt); a.escorts.push(e);
    }
    g.boats.boardAt = (b) => this.boardBarge(a, b);
    this.maybeCheckpoint(a);
  }

  // an Ashen Hand boat: a police boat's AI slot, but painted black with no lights, and its own stats
  dressEscort(e, type) {
    const g = this.game;
    e.police = false; e.escort = true;
    e.type = { ...type, id: 'ashen-' + type.id };
    e.hp = type.hp; e.radius = type.len * 0.42;
    e.mesh.traverse((o) => { if (o.isMesh && o.material?.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); } });
    const L = e.mesh.userData.lights; if (L) { L.red.visible = L.blue.visible = false; e.mesh.userData.lights = null; }
    e.driver.root.visible = true; void g;
  }

  steer(b, goal, look = 14) {
    const dx = goal.x - b.pos.x, dz = goal.z - b.pos.z;
    let desired = Math.atan2(-dx, -dz);
    const probe = (ang, d) => blocked(b.pos.x - Math.sin(ang) * d, b.pos.z - Math.cos(ang) * d, 2);
    const lk = look + Math.abs(b.speed) * 1.2;
    if (probe(desired, lk)) for (const off of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) if (!probe(desired + off, lk)) { desired += off; break; }
    let d = desired - b.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    return { turn: d, steer: THREE.MathUtils.clamp(-d * 2, -1, 1), dist: Math.hypot(dx, dz) };
  }

  escortAI(a, b, dt) {
    const g = this.game, P = g.boats.active, B = a.barge;
    const hunting = a.stage === 'chase' && P && b.pos.distanceTo(P.pos) < 260;
    let goal;
    if (hunting) { const lead = THREE.MathUtils.clamp(b.pos.distanceTo(P.pos) / 25, 0, 2); goal = P.pos.clone().addScaledVector(P.forward, P.speed * lead); }
    else { const side = a.escorts.indexOf(b) ? 1 : -1, r = B.forward.clone(); goal = B.pos.clone().add(V3(-r.z * 22 * side, 0, r.x * 22 * side)); }
    const st = this.steer(b, goal);
    // and they shoot: tracers at your boat (the armour stops them; a boat that isn't armoured gets holed)
    b.shootT = (b.shootT || 1) - dt;
    if (hunting && b.shootT <= 0 && st.dist < 60) {
      b.shootT = 0.9 + Math.random() * 0.6;
      g.police.tracer(b.pos.clone().setY(b.mesh.position.y + 1.6), P.pos.clone().setY(P.mesh.position.y + 1.2).add(V3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)));
      g.sfx.play('smg');
      if (!P.type.armored) { P.damage(4); g.health.damage(3, 'goon'); } else if (Math.random() < 0.3) g.sfx.play('impact');
    }
    let throttle = Math.abs(st.turn) > 1.6 ? 0.5 : 1;
    if (!hunting) throttle = THREE.MathUtils.clamp((st.dist - 4) / 20, 0, 1) * 0.9 + 0.1;
    return { throttle, steer: st.steer };
  }

  // the barge: a long low hull, cement silos up front, containers amidships, a wheelhouse at the stern
  makeBarge(a, x, z, heading) {
    const g = this.game, type = { id: 'barge', name: 'Pratt Aggregates barge', maxSpeed: 6.5, accel: 0.8, turn: 0.22, hp: 1e6, len: 30, beam: 9, depth: 2.4, style: 'cruiser', color: 0x3a3f46 };
    const b = g.boats.spawnPolice(x, z, heading);
    b.police = false; b.type = type; b.hp = type.hp; b.radius = 13; b.barge = true;
    for (const c of [...b.mesh.children]) c.visible = false;
    b.mesh.userData.lights = null;
    const grp = new THREE.Group(); b.mesh.add(grp);
    const M = { hull: std({ color: 0x3a3f46, roughness: 0.8 }), deck: std({ color: 0x6a645a, roughness: 0.95 }), red: std({ color: 0x8a2a1e, roughness: 0.8 }), silo: std({ color: 0xc8c4bc, roughness: 0.6, metalness: 0.3 }), box: [0x1f4a7a, 0xb0401e, 0x2e5a3a].map((c) => std({ color: c, roughness: 0.7 })), white: std({ color: 0xe8e6e0 }), glass: std({ color: 0x1a2a3a, roughness: 0.1, metalness: 0.5 }), crate: std({ color: 0x7a6040, roughness: 0.9 }) };
    const box = (w, h, d, px, py, pz, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py + h / 2, pz); o.castShadow = true; grp.add(o); return o; };
    const D = 1.6; /* (the deck, above the waterline) */
    box(9, 3.6, 30, 0, D - 3.6, 0, M.hull);
    box(9.02, 0.6, 30.02, 0, -0.6, 0, M.red); /* (the boot-top, red at the waterline) */
    box(8.6, 0.05, 29.6, 0, D, 0, M.deck);
    for (const sx of [-1, 1]) box(0.2, 0.9, 30, sx * 4.4, D, 0, M.hull);
    box(9, 0.9, 0.2, 0, D, -14.9, M.hull); box(9, 0.9, 0.2, 0, D, 14.9, M.hull);
    for (const [px, pz] of [[-2.2, -11], [2.2, -11], [-2.2, -6.5], [2.2, -6.5]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 5.5, 18), M.silo); c.position.set(px, D + 2.75, pz); c.castShadow = true; grp.add(c); const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 18), M.silo); cone.position.set(px, D + 5.95, pz); grp.add(cone); }
    box(2.4, 2.6, 6, -2.3, D, 0, M.box[0]); box(2.4, 2.6, 6, 2.3, D, 0, M.box[1]); box(2.4, 2.6, 6, -2.3, D + 2.6, 0.2, M.box[2]);
    for (let i = 0; i < 3; i++) box(1.2, 0.9, 0.9, -2.6 + i * 1.5, D, 6.2, M.crate);
    box(6, 3.4, 4, 0, D, 11.8, M.white); box(6.2, 0.2, 4.2, 0, D + 3.4, 11.8, M.hull);
    box(5.4, 0.9, 0.05, 0, D + 2.1, 9.78, M.glass);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.4), new THREE.MeshBasicMaterial({ map: canvasTex(512, 52, (c, w, h) => { c.fillStyle = '#3a3f46'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2f0ea'; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.fillText('PRATT AGGREGATES', w / 2, 38); }) }));
    for (const sx of [-1, 1]) { const m = side.clone(); m.position.set(sx * 4.52, 0.4, -2); m.rotation.y = sx * Math.PI / 2; grp.add(m); }
    a.barge = b; a.bargeD = D;
    b.ai = (bb, dt) => this.bargeAI(a, bb, dt);
  }

  bargeAI(a, b, dt) {
    if (a.stage === 'aboard' || a.stage === 'search' || a.bargeDead) return { throttle: 0, steer: 0 };
    let w = a.route[a.wi || 0];
    if (Math.hypot(w.x - b.pos.x, w.z - b.pos.z) < 40) { a.wi = Math.min(a.route.length - 1, (a.wi || 0) + 1); w = a.route[a.wi]; }
    const st = this.steer(b, w, 30);
    return { throttle: 0.9, steer: st.steer };
  }

  // stopped dead: freeze it level and give it a deck you can walk on
  stopBarge(a) {
    const g = this.game, b = a.barge, sb = g.portSandbox;
    a.bargeDead = true;
    b.frozen = true; b.speed = 0; b.pitch = b.roll = 0; b.heave = 0;
    b.mesh.position.set(b.pos.x, 0, b.pos.z); b.mesh.rotation.set(0, b.heading, 0, 'YXZ'); b.mesh.updateMatrixWorld(true);
    const q = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), b.heading), D = a.bargeD;
    a.cols = [];
    const col = (hx, hy, hz, px, py, pz) => { const w = V3(px, py, pz).applyQuaternion(q).add(b.mesh.position); a.cols.push(sb.addStaticCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(w.x, w.y, w.z).setRotation(q))); };
    col(4.5, 1.8, 15, 0, D - 1.8, 0);
    for (const sx of [-1, 1]) col(0.1, 0.45, 15, sx * 4.4, D + 0.45, 0);
    col(4.5, 0.45, 0.1, 0, D + 0.45, -14.9); col(4.5, 0.45, 0.1, 0, D + 0.45, 14.9);
    col(4, 2.75, 3.9, 0, D + 2.75, -8.75); /* (the silos) */
    col(2.4, 1.3, 3, 0, D + 1.3, 0); col(1.2, 1.3, 3, -2.3, D + 3.9, 0.2);
    col(2.2, 0.45, 0.45, -1.1, D + 0.45, 6.2);
    col(3, 1.7, 2, 0, D + 1.7, 11.8);
    a.W = (lx, lz, dy = 0) => V3(lx, D + dy, lz).applyQuaternion(q).add(b.mesh.position);
  }

  boardBarge(a, boat) {
    if (!a.bargeDead || a.stage === 'search' || boat === a.barge) return null;
    const b = a.barge, l = b.mesh.worldToLocal(boat.pos.clone().setY(0));
    if (Math.abs(l.x) > 4.5 + boat.type.beam / 2 + 7 || Math.abs(l.z) > 17) return null;
    const sx = Math.sign(l.x) || 1, lz = THREE.MathUtils.clamp(l.z, -3, 5);
    return { pos: a.W(sx * 3.4, lz, 1.2), heading: b.heading };
  }

  updM15(a, p, dt) {
    const g = this.game, C = g.citizens, b = a.barge, P = g.boats.active, pen = this.rb.pen;
    a.escorts = a.escorts.filter((e) => e.alive && g.boats.list.includes(e));
    if (!b || !g.boats.list.includes(b)) { this.story.end(false, 'The barge is gone'); return; }
    // the barge gets away if you let it run too far out
    if (!a.bargeDead && Math.hypot(b.pos.x - pen.x, b.pos.z - pen.z) > 3600) { this.story.end(false, 'The barge got away'); return; }
    if (a.stage === 'pen') {
      a.text = P ? 'Head out to sea, west of the volcano: find the barge' : `Get to the sea pen under the volcano and take ${a.loan ? "Dutch's Bulletproof Gunboat" : 'your armoured boat'}`;
      a.wp = P ? b.pos.clone() : (a.boat0?.pos.clone() || V3(pen.x, 0, pen.z));
      if (P && P.pos.distanceTo(b.pos) < 300) { a.stage = 'chase'; g.hud.flashBanner('THE BARGE', '#ffd166'); g.hud.toast('There: PRATT AGGREGATES, riding low, and two black boats with no lights alongside it. They\'ve seen you.', 0xffd166); }
      return;
    }
    if (a.stage === 'chase') {
      a.wp = b.pos.clone();
      if (a.escorts.length) { a.text = `Ram the Ashen Hand boats under: ${a.escorts.length} left${P ? '' : '. Get back in a boat!'}`; return; }
      // count the rams on the barge (its hp drops when you hit it)
      const lost = 1e6 - b.hp;
      if (lost > (a.lost || 0) + 8) { a.rams++; g.hud.toast(['Its stern swings round', 'Something cracks under the counter…', 'The rudder\'s gone! She\'s dead in the water'][Math.min(2, a.rams - 1)], 0xffd166); }
      a.lost = lost;
      a.text = `Ram the barge's stern to smash its rudder (${a.rams}/3)`;
      if (a.rams >= 3) {
        a.stage = 'stopping';
        a.stopT = 4;
      }
      return;
    }
    if (a.stage === 'stopping') {
      a.text = 'She\'s slowing…';
      b.speed *= 1 - dt * 0.8; a.stopT -= dt;
      if (a.stopT <= 0) {
        this.stopBarge(a);
        a.stage = 'board';
        g.hud.toast('Dead in the water. Pull alongside and press E to climb aboard', 0xffd166);
      }
      return;
    }
    if (a.stage === 'board') {
      a.text = 'Pull alongside the barge and press E to climb aboard';
      a.wp = b.pos.clone();
      if (!P && Math.abs(b.mesh.worldToLocal(V3(p.x, p.y, p.z)).x) < 4.6 && p.y > a.bargeD - 0.5) {
        a.stage = 'aboard';
        g.hud.flashBanner('ABOARD', '#ff3a2a');
        g.hud.toast('The crew come out of the wheelhouse with guns. Ashen Hand, every one of them.', 0xff6a5a);
        [['rifle', -2.5, 10], ['smg', 2.5, 10], ['heavy', 0, 8.5], ['rifle', -3.2, -3.5], ['smg', 3.2, -4]].forEach(([kind, lx, lz]) => this.spawnGoon(a, a.W(lx, lz, 0.05), kind, 'hills'));
      }
      return;
    }
    if (a.stage === 'aboard') {
      a.goons = a.goons.filter((n) => C.list.includes(n));
      this.story.updateNades(a, dt, p);
      a.text = a.goons.length ? `Clear the barge: ${a.goons.length} of them` : 'Search the barge: the crates, and the wheelhouse';
      a.wp = null;
      if (!a.goons.length) a.stage = 'search';
      return;
    }
    if (a.stage === 'search') { a.text = a.crates ? 'Now the wheelhouse: whatever he\'s hiding, it\'s in there' : 'Search the barge: the crates, and the wheelhouse'; a.wp = null; }
  }

  // ---------------------------------------------------------------- m14: Dead Man's Switch
  get rb() { return this.game.ridgeback; }
  startM14(a) {
    const g = this.game, rb = this.rb, c = rb.cabins[2];
    Object.assign(a, { stage: 'go', cabin: c, trail: [], ambushed: 0, hitT: 0 });
    const hasGun = g.held?.gun || g.economy.carried.some((x) => ITEM_BY_ID[x]?.gun);
    if (!hasGun) { g.giveItem(ITEM_BY_ID.smg); g.hud.toast(`${FIXER} left an SMG for you`, 0xffd166); }
    for (const [k, n] of [['smgAmmo', 150], ['pistolAmmo', 60], ['rifleAmmo', 60]]) if ((g.economy.ammo[k] || 0) < n) g.economy.addAmmo(k, n - (g.economy.ammo[k] || 0));
    const e = g.citizens.spawnCitizen('hills', 'escort', c.inside.clone(), { look: { shirt: 0x7a6a52, pants: 0x3a3a40, skin: 0xf1c9a5, glasses: true } });
    if (e) { e.faceYaw = c.yaw; e.heading = c.yaw; e.hp = 150; e.name = 'Elias Varga'; e.walkSpeed = 3.4; a.elias = e; }
    this.maybeCheckpoint(a);
  }

  eliasAlive(a) { const n = a.elias; return n && this.game.citizens.list.includes(n); }

  updM14(a, p, dt) {
    const g = this.game, rb = this.rb, v = this.vb, C = g.citizens, E = a.elias;
    a.goons = (a.goons || []).filter((n) => C.list.includes(n));
    const ePos = this.eliasAlive(a) ? E.body.translation() : null;
    if (['go', 'meet', 'escort'].includes(a.stage) && !ePos) { this.story.end(false, 'Elias is dead'); return; }
    if (a.stage === 'go') {
      a.text = 'Get to Ridgeback Cabins, up in the hills: Elias is hiding in cabin 3';
      a.wp = a.cabin.door.clone();
      if (Math.hypot(p.x - a.cabin.door.x, p.z - a.cabin.door.z) < 9) a.stage = 'meet';
      return;
    }
    if (a.stage === 'meet') {
      a.text = 'Knock on cabin 3';
      a.wp = a.cabin.door.clone();
      return;
    }
    if (a.stage === 'escort') {
      const goal = v.portal, dGoal = Math.hypot(ePos.x - goal.x, ePos.z - goal.z), dP = Math.hypot(p.x - ePos.x, p.z - ePos.z);
      a.prog = 1 - dGoal / a.d0;
      // he follows the way you went (a trail of breadcrumbs), keeping a few metres back
      const last = a.trail.at(-1);
      if (!g.vehicles.active && (!last || Math.hypot(p.x - last.x, p.z - last.z) > 2)) { a.trail.push(V3(p.x, p.y, p.z)); if (a.trail.length > 400) a.trail.shift(); }
      while (a.trail.length && Math.hypot(a.trail[0].x - ePos.x, a.trail[0].z - ePos.z) < 2.2) a.trail.shift();
      const cower = a.goons.length && a.cowerT > 0;
      a.cowerT = (a.cowerT || 0) - dt;
      if (dP > 3.5 && a.trail.length && !cower) {
        E.walkTo = a.trail[0]; E.walkSpeed = dP > 12 ? 4.6 : 3.2;
        /* (stuck on a tree or a fence: after a couple of seconds he scrambles past it) */
        a.stuckT = (a.stuckT || 0) + dt;
        if (a.stuckT > 2.5) { if (a.lastE && Math.hypot(ePos.x - a.lastE.x, ePos.z - a.lastE.z) < 1) { const q = a.trail.shift(); if (q) E.body.setTranslation({ x: q.x, y: q.y + 0.1, z: q.z }, true); } a.stuckT = 0; a.lastE = V3(ePos.x, ePos.y, ePos.z); }
      }
      else { E.walkTo = null; E.faceYaw = Math.atan2(p.x - ePos.x, p.z - ePos.z); }
      if (dP > 90) { this.story.end(false, 'You left Elias behind'); return; }
      // the Ashen Hand are in the woods: two ambushes on the way
      for (const [k, at] of [[1, 0.25], [2, 0.6]]) if (a.ambushed < k && a.prog > at && !a.goons.length) { a.ambushed = k; this.ambush14(a, ePos, goal); break; }
      // they're shooting at him too
      if (a.goons.length) {
        a.hitT -= dt;
        if (a.hitT <= 0) {
          a.hitT = 1.2 + Math.random();
          const sh = a.goons.find((n) => { const t = n.body.translation(); return Math.hypot(t.x - ePos.x, t.z - ePos.z) < 40 && C.canSee(n, V3(ePos.x, ePos.y + 0.5, ePos.z), 40); });
          if (sh && Math.random() < 0.5) { const t = sh.body.translation(); g.police.tracer(V3(t.x, t.y + 0.6, t.z), V3(ePos.x, ePos.y + 0.4, ePos.z)); E.hp -= 8 + Math.random() * 8; g.sfx.play('impact'); if (E.hp <= 0) { C.knockOver(E, V3(0, 1, 0), 1, { killed: true }); return; } }
        }
      }
      const hp = Math.max(0, Math.round((E.hp / 150) * 100));
      a.text = a.goons.length ? `Ambush! Keep Elias alive: ${a.goons.length} of them in the trees · <b>Elias ${hp}%</b>` : `Walk Elias through the woods to the volcano tunnel (he follows your path; don't get too far ahead) · Elias ${hp}%`;
      if (g.vehicles.active) a.text = "Elias is on foot. So are you: get out and walk him there";
      a.wp = goal.clone();
      if (!a.goons.length && dGoal < 45) this.lastWords(a, ePos);
      return;
    }
    if (a.stage === 'talk') { a.text = 'Elias needs a second. Listen'; a.wp = null; if (this.eliasAlive(a)) { E.walkTo = null; E.faceYaw = Math.atan2(p.x - ePos.x, p.z - ePos.z); } return; }
    if (a.stage === 'sniper') {
      const sn = a.sniper, alive = sn && C.list.includes(sn);
      if (!alive) {
        a.stage = 'phone'; a.glint?.removeFromParent();
        a.phoneAt = a.sniperAt.clone();
        g.hud.toast("He's down. He had a phone, and it's still buzzing", 0x7be08a);
        return;
      }
      const t = sn.body.translation(); a.sniperAt = V3(t.x, t.y - 0.9, t.z);
      a.text = 'SNIPER on the ridge! Get to cover and take him out';
      a.wp = a.sniperAt.clone();
      if (a.glint) { a.glint.position.set(t.x, t.y + 0.7, t.z); a.glint.material.opacity = 0.5 + Math.sin(g.time * 9) * 0.5; }
      a.snipeT -= dt;
      if (a.snipeT <= 0) {
        a.snipeT = 3.2;
        if (C.canSee(sn, V3(p.x, p.y + 0.5, p.z), 400)) {
          g.sfx.play('sniper'); g.police.tracer(V3(t.x, t.y + 0.6, t.z), V3(p.x + (Math.random() - 0.5) * 2, p.y + 0.5, p.z + (Math.random() - 0.5) * 2));
          if (Math.random() < 0.45) g.health.damage(22, 'goon');
        }
      }
      return;
    }
    if (a.stage === 'phone') { a.text = "Take the sniper's phone"; a.wp = a.phoneAt.clone(); }
  }

  ambush14(a, ePos, goal) {
    const g = this.game, rb = this.rb, f = V3(goal.x - ePos.x, 0, goal.z - ePos.z).normalize(), s = V3(f.z, 0, -f.x);
    g.hud.flashBanner('AMBUSH', '#ff3a2a');
    g.hud.toast(a.ambushed === 1 ? 'Elias: "They found me! How did they find me?"' : 'Elias: "More of them! Get me out of here!"', 0xff8a6a);
    a.cowerT = 4;
    const kinds = a.ambushed === 1 ? ['rifle', 'smg', 'rifle', 'smg'] : ['rifle', 'heavy', 'smg', 'grenadier', 'rifle'];
    kinds.forEach((kind, i) => {
      const side = i % 2 ? 1 : -1, x = ePos.x + f.x * (24 + i * 4) + s.x * side * (12 + i * 3), z = ePos.z + f.z * (24 + i * 4) + s.z * side * (12 + i * 3);
      this.spawnGoon(a, V3(x, rb.heightAt(x, z) + 0.2, z), kind, 'hills');
    });
  }

  // he stops at the car park to get his breath, tells you what he knows, and doesn't finish
  lastWords(a, ePos) {
    const g = this.game, C = g.citizens, E = a.elias, rb = this.rb;
    a.stage = 'talk';
    const lines = [
      'Elias: "Wait. Wait. I need… a second."',
      'Elias: "It\'s Pratt. All of it. The Ashen Hand blow it up, Pratt Developments buys the ground for nothing, and the city pays him to rebuild."',
      'Elias: "Verian Central was the biggest one. Eleven people. He had the plans drawn up a year before the bomb."',
      'Elias: "And the money goes out to Meridian. Meridian sent—"',
    ];
    lines.forEach((l, i) => setTimeout(() => { if (this.story.active === a) g.hud.toast(l, 0xe8e2d4); }, i * 3600));
    setTimeout(() => {
      if (this.story.active !== a) return;
      // the shot: from the ridge across the car park
      const v = this.vb, P = v.portal, out = V3(-v.T.u.x, 0, -v.T.u.z).normalize(), side = V3(out.z, 0, -out.x);
      let best = null;
      for (let k = 0; k < 48; k++) { const ang = ((k % 24) / 24) * Math.PI - Math.PI / 2, d = k < 24 ? 75 : 55, dir = out.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang)), x = P.x + dir.x * d, z = P.z + dir.z * d, y = rb.heightAt(x, z), sc = y - P.y < 22 ? y : -1e9 - y; if (!best || sc > best.sc) best = { x, y, z, sc }; } /* (up on a rise across the car park: high, but not halfway up the volcano) */
      const t = E && C.list.includes(E) ? E.body.translation() : ePos;
      g.sfx.play('sniper'); g.police.tracer(V3(best.x, best.y + 1.4, best.z), V3(t.x, t.y + 0.6, t.z));
      if (E && C.list.includes(E)) { const dir = V3(t.x - best.x, 0, t.z - best.z).normalize(); C.knockOver(E, dir.multiplyScalar(4).setY(1), 2, { killed: true, dir }); }
      g.shake = 0.6;
      g.hud.flashBanner('SNIPER', '#ff3a2a');
      const sn = this.spawnGoon(a, V3(best.x, best.y + 0.2, best.z), 'rifle', 'hills');
      if (sn) { sn.guard = { watch: true }; sn.alerted = false; sn.hp = 140; sn.lastSeen = null; a.sniper = sn; }
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff4c0, transparent: true, depthTest: false }));
      gl.scale.setScalar(1.6); g.scene.add(gl); a.glint = gl; a.fx.push(gl);
      a.stage = 'sniper'; a.snipeT = 2.5; a.sniperAt = V3(best.x, best.y, best.z);
      g.hud.toast('Elias is dead. The shot came from the ridge: there, a glint!', 0xff6a5a);
    }, lines.length * 3600 - 800);
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

  tick() {
    // the barge you were left standing on: gone once you've sailed off (or wandered far away)
    const g = this.game, b = this.leftBarge;
    if (b && !this.story.active) {
      const p = g.shorePlayer.body.translation();
      if (g.boats.active || !g.onShore || Math.hypot(p.x - b.pos.x, p.z - b.pos.z) > 80) {
        for (const c of this.leftCols || []) { g.portSandbox.staticColliders.delete(c.handle); g.portSandbox.world.removeCollider(c, false); }
        if (g.boats.list.includes(b) && (!g.boats.active || Math.hypot(g.boats.active.pos.x - b.pos.x, g.boats.active.pos.z - b.pos.z) > 60)) { g.boats.remove(b); this.leftBarge = null; this.leftCols = null; }
        else this.leftCols = null;
      }
    }
  }

  completeText() {
    return `<p>Pratt Developments is rebuilding Verian Central. The Ashen Hand cleared the ground for it. And the money from both goes somewhere offshore called MERIDIAN.</p>
      <p>Vic's phone keeps ringing. He keeps not answering it in front of you.</p>`;
  }
}
