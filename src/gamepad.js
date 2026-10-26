// Controller support: Xbox, PlayStation (DualShock 4 / DualSense) and Nintendo Switch Pro
// controllers, through the browser's Gamepad API. Buttons are read by position (the "standard"
// layout), so the bottom face button is jump on all three, whatever letter is printed on it.
//
// The controller drives the game the same way the keyboard and mouse do: held buttons hold keys,
// presses send key presses, the right stick turns the camera like the mouse, and the triggers
// are the mouse buttons on foot (fire / throw) or the pedals in a vehicle. Menus, the phone and
// the shops get an on-screen cursor: left stick to move it, bottom button to click, right button
// to back out, right stick to scroll.

const DEAD = 0.22; // stick deadzone
const B = { south: 0, east: 1, west: 2, north: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15, home: 16 };

// what each pad calls its buttons (for the on-screen prompts)
const GLYPHS = {
  xbox: { south: 'A', east: 'B', west: 'X', north: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', select: 'View', start: 'Menu', l3: 'LS', r3: 'RS' },
  ps: { south: '✕', east: '○', west: '□', north: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', select: 'Share', start: 'Options', l3: 'L3', r3: 'R3' },
  switch: { south: 'B', east: 'A', west: 'Y', north: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', select: '−', start: '+', l3: 'LS', r3: 'RS' },
};
GLYPHS.xbox.up = GLYPHS.ps.up = GLYPHS.switch.up = '▲'; GLYPHS.xbox.down = GLYPHS.ps.down = GLYPHS.switch.down = '▼';
GLYPHS.xbox.left = GLYPHS.ps.left = GLYPHS.switch.left = '◀'; GLYPHS.xbox.right = GLYPHS.ps.right = GLYPHS.switch.right = '▶';

export function padKind(id = '') {
  const s = id.toLowerCase();
  if (/054c|playstation|dualsense|dualshock|wireless controller/.test(s)) return 'ps';
  if (/057e|nintendo|pro controller|joy-con|switch/.test(s)) return 'switch';
  return 'xbox';
}

// keyboard key (as shown in prompts) → the controller button that does the same job
const KEY_TO_BTN = { E: 'north', Space: 'south', F: 'east', R: 'west', G: 'rb', T: 'rb', B: 'select', Tab: 'left', J: 'up', M: 'down', Y: 'right', H: 'r3', Shift: 'lb', LMB: 'rt', RMB: 'lt', W: 'rt', S: 'lt' };

export class Gamepads {
  constructor(game) {
    this.game = game;
    this.active = false; // the last thing you touched was a controller
    this.kind = 'xbox';
    this.prev = [];
    this.held = new Set(); // keys we're holding down for you
    this.mouseHeld = new Set();
    this.cursor = { x: innerWidth / 2, y: innerHeight / 2, on: false };
    this.el = document.createElement('div');
    this.el.id = 'pad-cursor';
    this.el.className = 'hidden';
    document.body.appendChild(this.el);
    this.toastEl = null;
    addEventListener('gamepadconnected', (e) => this.connected(e.gamepad));
    addEventListener('gamepaddisconnected', () => this.game.hud?.toast?.('Controller disconnected', 0xffd166));
    // back to mouse and keyboard as soon as you use them
    addEventListener('mousemove', (e) => { if (e.isTrusted && this.active && (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)) this.setActive(false); });
    addEventListener('keydown', (e) => { if (e.isTrusted && this.active) this.setActive(false); });
  }

  connected(pad) {
    this.kind = padKind(pad.id);
    const name = { xbox: 'Xbox', ps: 'PlayStation', switch: 'Switch Pro' }[this.kind];
    this.game.hud?.toast?.(`${name} controller connected`, 0x9ec5ff);
  }

  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    if (!on) { this.releaseAll(); this.el.classList.add('hidden'); }
    document.body.classList.toggle('pad-mode', on);
  }

  glyph(btn) { return GLYPHS[this.kind][btn] || btn; }

  // menu confirm / back: A and B as printed on the pad (on a Switch, A is the right-hand button)
  get ok() { return this.kind === 'switch' ? B.east : B.south; }
  get back() { return this.kind === 'switch' ? B.south : B.east; }

  // swap keyboard/mouse labels in a prompt for this controller's buttons
  prompt(html) {
    if (!this.active || !html) return html;
    return html.replace(/<kbd>([^<]+)<\/kbd>/g, (m, k) => {
      const btn = KEY_TO_BTN[k.trim()];
      return btn ? `<kbd class="pad pad-${this.kind}">${this.glyph(btn)}</kbd>` : m;
    });
  }

  // ---------------------------------------------------------------- sending input
  key(code, down) {
    if (down === this.held.has(code)) return;
    if (down) this.held.add(code); else this.held.delete(code);
    dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  }

  tap(code) { this.key(code, true); this.key(code, false); }

  mouse(button, down) {
    if (down === this.mouseHeld.has(button)) return;
    if (down) this.mouseHeld.add(button); else this.mouseHeld.delete(button);
    dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true }));
  }

  releaseAll() {
    for (const c of [...this.held]) this.key(c, false);
    for (const b of [...this.mouseHeld]) this.mouse(b, false);
  }

  // in controller mode the game plays without pointer lock: "locked" means "playing"
  play() {
    const g = this.game;
    g.locked = true;
    g.hud.showOverlay(false);
  }

  pause() {
    const g = this.game;
    this.releaseAll();
    g.locked = false;
    g.keys.clear();
    g.hud.showOverlay(true);
  }

  // ---------------------------------------------------------------- each frame
  // Read every controller the browser reports and merge them into one. (Windows, Steam and
  // remapping tools often add a "virtual" controller ahead of the real one; testers show them
  // all, so we listen to them all too.) Some browsers give the Switch Pro a non-standard layout
  // with the d-pad on a "hat" axis: that's decoded into the usual d-pad buttons.
  read() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
    this.pads = pads;
    if (!pads.length) return null;
    const N = 17, b = new Array(N).fill(false), v = new Array(N).fill(0), axes = [0, 0, 0, 0];
    let busiest = null, most = 0;
    for (const p of pads) {
      let act = 0;
      p.buttons.forEach((bt, i) => { if (i >= N) return; const on = !!bt && (bt.pressed || bt.value > 0.5); if (on) { b[i] = true; act++; } v[i] = Math.max(v[i], bt?.value ?? 0); });
      for (let i = 0; i < 4; i++) { const a = p.axes[i] || 0; if (Math.abs(a) > DEAD) act++; if (Math.abs(a) > Math.abs(axes[i])) axes[i] = a; }
      if (p.mapping !== 'standard') { // a hat switch for the d-pad (any axis past the sticks that reads in eighths, or > 1 when centred)
        for (let i = 4; i < p.axes.length; i++) {
          const a = p.axes[i];
          if (a === undefined || Math.abs(a) > 1.01) continue;
          const k = Math.round((a + 1) / (2 / 7));
          if (Math.abs((a + 1) - k * (2 / 7)) > 0.05) continue;
          const dir = [[1, 0, 0, 0], [1, 0, 0, 1], [0, 0, 0, 1], [0, 1, 0, 1], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [1, 0, 1, 0]][k];
          if (!dir) continue;
          if (dir[0]) b[B.up] = true; if (dir[1]) b[B.down] = true; if (dir[2]) b[B.left] = true; if (dir[3]) b[B.right] = true;
          act++;
          break;
        }
      }
      if (act > most) { most = act; busiest = p; }
    }
    if (busiest && busiest !== this.lastPad) { this.lastPad = busiest; this.kind = padKind(busiest.id); }
    return { b, v, axes, any: most > 0 };
  }

  // for the pause screen: what the browser can see
  status() {
    const pads = this.pads || [];
    if (!pads.length) return 'No controller detected. Connect one, click this page, then press a button on it.';
    const names = pads.map((p) => `${p.id.replace(/\s*\(.*$/, '').slice(0, 40) || 'Controller'}${p.mapping === 'standard' ? '' : ' (non-standard layout)'}`);
    return `Controller${pads.length > 1 ? 's' : ''}: ${names.join(' · ')} — press Start (+ on Switch, Options on PlayStation) to play`;
  }

  update(dt) {
    const st = this.read();
    this.statusT = (this.statusT || 0) - dt;
    if (this.statusT <= 0) { this.statusT = 0.5; const el = document.getElementById('pad-status'); if (el) el.textContent = this.status(); }
    if (!st) { if (this.active) this.setActive(false); this.prev = []; return; }
    const g = this.game;
    const val = (i) => st.v[i] ?? 0;
    const ax = (i) => { const v = st.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); };
    const now = st.b;
    const pressed = (i) => now[i] && !this.prev[i];
    const released = (i) => !now[i] && this.prev[i];
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    // anything at all wakes controller mode up
    if (now.some(Boolean) || lx || ly || rx || ry) { if (!this.active) this.setActive(true); }
    if (!this.active) { this.prev = now; return; }

    const overlay = document.getElementById('overlay');
    const onOverlay = overlay && !overlay.classList.contains('hidden');
    const phoneOpen = g.story?.phone?.isOpen;
    const poolOpen = !!document.getElementById('pool');
    const menu = onOverlay || g.panelOpen || phoneOpen || poolOpen || g.hud?.bigMapOpen && false;

    // ---- start / pause
    if (pressed(B.start)) {
      if (onOverlay) { const play = document.querySelector('#overlay .play'); if (play && !play.disabled) { play.click(); this.play(); } }
      else if (g.panelOpen || phoneOpen) { this.tap('Escape'); }
      else this.pause();
      this.prev = now; return;
    }

    if (menu) {
      this.releaseAll();
      this.menu(dt, { lx, ly, rx, ry, pressed, released, now }, onOverlay);
      this.prev = now;
      return;
    }
    this.el.classList.add('hidden');
    this.setFocus(null);
    if (!g.locked) this.play(); // (came back from a menu)

    // ---- driving, flying or on foot?
    const inVeh = !!(g.vehicles?.active || g.boats?.active || g.flying || g.atHelm);
    // left stick: movement keys
    this.key('KeyW', ly < -0.35 || (inVeh && val(B.rt) > 0.25));
    this.key('KeyS', ly > 0.35 || (inVeh && val(B.lt) > 0.25));
    this.key('KeyA', lx < -0.35);
    this.key('KeyD', lx > 0.35);
    // held buttons
    this.key('Space', now[B.south]);
    this.key('ShiftLeft', now[B.lb] || now[B.l3]);
    // triggers: the mouse buttons on foot
    this.mouse(0, !inVeh && val(B.rt) > 0.4);
    this.mouse(2, !inVeh && val(B.lt) > 0.4);
    if (inVeh && g.flying) this.mouse(0, now[B.west]); // (in a jet: guns on the left face button)
    // presses
    if (pressed(B.north)) this.tap('KeyE');
    if (pressed(B.east)) this.tap('KeyF');
    if (pressed(B.west) && !g.flying) this.tap('KeyR');
    if (pressed(B.rb)) this.tap(inVeh ? 'KeyT' : 'KeyG');
    if (pressed(B.select)) this.tap('KeyB');
    if (pressed(B.r3)) this.key('KeyH', true); if (released(B.r3)) this.key('KeyH', false);
    if (pressed(B.up)) this.tap('KeyJ');
    if (pressed(B.down)) this.tap('KeyM');
    if (pressed(B.left)) this.tap('Tab');
    if (pressed(B.right)) this.tap('KeyY');
    // right stick: the camera, like the mouse (a little curve so small nudges are fine)
    if (rx || ry) {
      const sp = 1100 * dt, cx = Math.sign(rx) * rx * rx * sp, cy = Math.sign(ry) * ry * ry * sp * 0.75;
      dispatchEvent(new MouseEvent('mousemove', { movementX: cx, movementY: cy, bubbles: true }));
    }
    // rumble when things go bang
    const sh = g.shake || 0;
    if (sh > 0.35 && !(this.rumbleT > 0)) { this.rumble(Math.min(1, sh), 180); this.rumbleT = 0.25; }
    this.rumbleT = (this.rumbleT || 0) - dt;
    this.prev = now;
  }

  rumble(strength, ms) {
    const pad = this.lastPad || (this.pads || [])[0];
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch?.(() => {});
  }

  // ---------------------------------------------------------------- menus: a cursor
  // ---------------------------------------------------------------- menus: console-style selection
  // One thing is highlighted; the d-pad or left stick moves the highlight to the next button in
  // that direction, the bottom button selects it, the right button backs out. Sliders go left and
  // right; the right stick scrolls long lists. (The pool table is its own thing: see pool().)

  // the window the controller is working in right now (the topmost one that's open)
  layer() {
    const vis = (el) => el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
    const g = this.game;
    for (const el of [document.getElementById('settings'), document.getElementById('mp'), g.admin?.isOpen ? g.admin.el : null, g.story?.phone?.isOpen ? g.story.phone.el : null, g.panelOpen ? document.getElementById('panel') : null, document.getElementById('overlay')]) {
      if (el && vis(el)) return el;
    }
    return null;
  }

  // everything you can select in it, on screen
  items(root) {
    if (!root) return [];
    const sel = 'button, [data-a], [data-ch], [data-bet], [data-add], a[href], input, select, .ph-item[data-a]';
    return [...root.querySelectorAll(sel)].filter((el) => {
      if (el.disabled || el.closest('[disabled]')) return false;
      if (el.matches('[data-a]') && el.querySelector('button, [data-a]')) return false; // (a row whose buttons are selectable themselves)
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const st = getComputedStyle(el);
      return st.visibility !== 'hidden' && st.display !== 'none' && st.pointerEvents !== 'none';
    });
  }

  centre(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; }

  setFocus(el) {
    if (this.focus === el) return;
    this.focus?.classList.remove('pad-focus');
    this.focus = el;
    if (!el) return;
    el.classList.add('pad-focus');
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.lastAt = this.centre(el);
  }

  // the nearest thing in a direction (dx, dy): distance along it, plus a penalty for being off to the side
  step(list, dx, dy) {
    const cur = this.focus && list.includes(this.focus) ? this.centre(this.focus) : null;
    if (!cur) return list[0];
    let best = null, bs = Infinity;
    for (const el of list) {
      if (el === this.focus) continue;
      const c = this.centre(el);
      const vx = c.x - cur.x, vy = c.y - cur.y;
      const along = vx * dx + vy * dy;
      if (along <= 2) continue;
      const side = Math.abs(vx * dy - vy * dx);
      // overlapping rows/columns count as "straight ahead"
      const overlap = dx ? !(c.r.bottom < cur.r.top || c.r.top > cur.r.bottom) : !(c.r.right < cur.r.left || c.r.left > cur.r.right);
      const score = along + side * (overlap ? 0.3 : 2.5);
      if (score < bs) { bs = score; best = el; }
    }
    return best;
  }

  menu(dt, { lx, ly, rx, ry, pressed, released, now }, onOverlay) {
    this.el.classList.add('hidden');
    if (document.getElementById('pool')) { this.pool(dt, { lx, ly, pressed, released, now }); return; }
    const root = this.layer();
    const list = this.items(root);
    if (!list.length) { this.setFocus(null); return; }
    // keep a highlight: after a menu redraws itself, pick whatever's now nearest where it was
    const fresh = root !== this.layerEl;
    this.layerEl = root;
    if (fresh || !this.focus || !list.includes(this.focus)) {
      let best = null;
      if (!fresh && this.lastAt && this.focus) { let bd = Infinity; for (const el of list) { const c = this.centre(el); const d = (c.x - this.lastAt.x) ** 2 + (c.y - this.lastAt.y) ** 2; if (d < bd) { bd = d; best = el; } } }
      this.focus = null;
      const play = onOverlay && list.find((el) => el.classList.contains('play'));
      // a window that's just opened: its first proper choice (not the Close / back button in the corner)
      const first = list.find((el) => !el.matches('.close, .pool-x, [data-a="home"], .ph-homebar')) || list[0];
      this.setFocus(best || play || first);
    }
    // direction: d-pad, or the left stick pushed most of the way
    let dx = (now[B.right] ? 1 : 0) - (now[B.left] ? 1 : 0), dy = (now[B.down] ? 1 : 0) - (now[B.up] ? 1 : 0);
    if (!dx && !dy && Math.hypot(lx, ly) > 0.55) { if (Math.abs(lx) > Math.abs(ly)) dx = Math.sign(lx); else dy = Math.sign(ly); }
    const dir = dx || dy ? `${dx},${dy}` : '';
    let move = false;
    if (dir !== this.heldDir) { this.heldDir = dir; this.repeatT = 0.38; move = !!dir; } // move at once, then a pause before it repeats
    else if (dir) { this.repeatT -= dt; if (this.repeatT <= 0) { this.repeatT = 0.11; move = true; } }
    if (move) {
      const f = this.focus;
      if (f && f.matches('input[type="range"]') && dx) { // a slider: left/right changes it
        const stp = Number(f.step) || 1;
        f.value = String(Math.min(Number(f.max), Math.max(Number(f.min), Number(f.value) + dx * stp * 5)));
        f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const next = this.step(list, dx, dy);
        if (next) { this.setFocus(next); this.game.sfx?.play?.('select'); }
      }
    }
    // select
    if (pressed(this.ok) && this.focus) {
      const f = this.focus;
      if (f.matches('input[type="checkbox"]')) f.click();
      else if (f.matches('input, select')) f.focus();
      else { f.click(); if (onOverlay && f.classList.contains('play')) this.play(); }
    }
    // back
    if (pressed(this.back)) {
      const g = this.game, st = document.getElementById('settings');
      if (st && !st.classList.contains('hidden')) st.classList.add('hidden');
      else if (g.admin?.isOpen) g.admin.close();
      else if (g.story?.phone?.isOpen) { const ph = g.story.phone; if (ph.screen !== 'home' && ph.call?.state !== 'live') ph.act('home', {}); else ph.close(); } // (back out of an app first)
      else if (g.panelOpen) this.tap('Escape');
      this.focus?.classList.remove('pad-focus'); this.focus = null;
    }
    // the right stick scrolls the list
    if (ry && root) {
      let el = this.focus || root;
      while (el && el !== document.body && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      if (el && el !== document.body) el.scrollBy(0, ry * 900 * dt);
    }
    void rx; void released;
  }

  // The pool table: left stick swings the cue round the white ball, hold the bottom button
  // (or the right trigger) to build power and let go to shoot; the right button quits.
  pool(dt, { lx, ly, pressed, released, now }) {
    this.setFocus(null);
    const P = this.game.poolGame;
    const cv = document.querySelector('#pool canvas');
    if (!P || !cv) return;
    if (pressed(this.back)) { document.querySelector('#pool .pool-x')?.click(); return; }
    const again = document.querySelector('#pool .pool-again');
    if (again && pressed(this.ok)) { again.click(); return; }
    if (this.poolAng == null || this.poolFor !== P) { this.poolFor = P; this.poolAng = P.aimAngle?.() ?? 0; }
    // stick direction aims; the d-pad nudges for fine shots
    if (Math.hypot(lx, ly) > 0.5) this.poolAng = Math.atan2(ly, lx);
    this.poolAng += ((now[B.right] || now[B.down] ? 1 : 0) - (now[B.left] || now[B.up] ? 1 : 0)) * dt * 0.35;
    const cb = P.cue, r = cv.getBoundingClientRect(), k = r.width / cv.width;
    const mx = (cb.x + Math.cos(this.poolAng) * 120 + 34) * k + r.left, my = (cb.y + Math.sin(this.poolAng) * 120 + 34) * k + r.top;
    cv.dispatchEvent(new MouseEvent('mousemove', { clientX: mx, clientY: my, bubbles: true }));
    if (pressed(this.ok) || pressed(B.rt)) cv.dispatchEvent(new MouseEvent('mousedown', { clientX: mx, clientY: my, button: 0, bubbles: true }));
    if (released(this.ok) || released(B.rt)) dispatchEvent(new MouseEvent('mouseup', { clientX: mx, clientY: my, button: 0, bubbles: true }));
  }
}
