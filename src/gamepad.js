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
  update(dt) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const pad = pads.find((p) => p.connected);
    if (!pad) { if (this.active) this.setActive(false); return; }
    const g = this.game;
    const btn = (i) => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
    const val = (i) => pad.buttons[i]?.value ?? 0;
    const ax = (i) => { const v = pad.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); };
    const now = pad.buttons.map((_, i) => btn(i));
    const pressed = (i) => now[i] && !this.prev[i];
    const released = (i) => !now[i] && this.prev[i];
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    // anything at all wakes controller mode up
    if (now.some(Boolean) || lx || ly || rx || ry) { if (!this.active) { this.kind = padKind(pad.id); this.setActive(true); } }
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
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch?.(() => {});
  }

  // ---------------------------------------------------------------- menus: a cursor
  menu(dt, { lx, ly, rx, ry, pressed, released, now }, onOverlay) {
    const c = this.cursor;
    if (!c.on) { c.on = true; c.x = innerWidth / 2; c.y = innerHeight / 2; }
    this.el.classList.remove('hidden');
    const sp = 900 * dt;
    // d-pad nudges too
    const dx = lx + (now[B.right] ? 0.6 : 0) - (now[B.left] ? 0.6 : 0), dy = ly + (now[B.down] ? 0.6 : 0) - (now[B.up] ? 0.6 : 0);
    if (dx || dy) {
      c.x = Math.max(0, Math.min(innerWidth - 1, c.x + Math.sign(dx) * dx * dx * sp * 1.4));
      c.y = Math.max(0, Math.min(innerHeight - 1, c.y + Math.sign(dy) * dy * dy * sp * 1.4));
      const t = document.elementFromPoint(c.x, c.y);
      t?.dispatchEvent(new MouseEvent('mousemove', { clientX: c.x, clientY: c.y, bubbles: true }));
    }
    this.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
    const target = () => document.elementFromPoint(c.x, c.y);
    if (pressed(B.south) || pressed(B.rt)) {
      const t = target();
      if (t) { t.dispatchEvent(new MouseEvent('mousedown', { clientX: c.x, clientY: c.y, button: 0, bubbles: true })); this.downOn = t; }
    }
    if (released(B.south) || released(B.rt)) {
      const t = target();
      dispatchEvent(new MouseEvent('mouseup', { clientX: c.x, clientY: c.y, button: 0, bubbles: true }));
      if (t && t === this.downOn) {
        t.click?.();
        if (onOverlay && t.closest?.('.play')) this.play();
      }
      this.downOn = null;
    }
    if (pressed(B.east)) {
      if (document.getElementById('pool')) document.querySelector('#pool .pool-x')?.click();
      else if (this.game.story?.phone?.isOpen) this.game.story.phone.close();
      else if (this.game.panelOpen) this.tap('Escape');
    }
    if (pressed(B.up) && this.game.story?.phone?.isOpen && !(ly || lx)) { /* (the d-pad moves the cursor in menus) */ }
    // right stick scrolls whatever's under the cursor
    if (ry) {
      let el = target();
      while (el && el !== document.body && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      (el && el !== document.body ? el : document.scrollingElement)?.scrollBy(0, ry * 900 * dt);
    }
    void rx;
  }
}
