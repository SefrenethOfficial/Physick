const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const kbd = (rows) => rows.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('');

const ON_FOOT = [['W A S D', 'Walk'], ['Space', 'Jump'], ['Shift', 'Run'], ['LMB', 'Pick up / put down / drag'], ['RMB', 'Throw / heave'], ['F', 'Use held item'], ['E', 'Helm / gun / jet']];
const ON_GUN = [['Mouse', 'Aim'], ['LMB', 'Fire'], ['E', 'Leave the gun']];
const IN_JET = [['W / S', 'Throttle'], ['Shift', 'Afterburner (full throttle)'], ['Mouse', 'Pitch / roll'], ['A / D', 'Rudder / steer'],
  ['B', 'Brakes'], ['G', 'Gear'], ['LMB', 'Cannon'], ['C', 'Cockpit / chase view'], ['E', 'Get out (stopped)']];
const AT_HELM = [['W / S', 'Engine order up / down'], ['A / D', 'Rudder port / starboard'], ['H', 'Ship\'s horn'], ['Mouse', 'Look around'], ['E', 'Leave the helm']];

// All DOM UI: logo, health, compass, helm readout, prompts, toasts, title and death screens.
export class Hud {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('hud');
    this.el.innerHTML = `
      <img class="hud-logo" src="${import.meta.env.BASE_URL}assets/physick-logo.svg" alt="Physick">
      <div class="health" id="health"><div class="fill"></div><span>100</span></div>
      <div class="compass" id="compass"><div class="strip"></div><div class="needle"></div><b id="hdg">000°</b></div>
      <div class="crosshair"><b></b></div>
      <div class="stats" id="stats"></div>
      <div class="hints" id="hints"></div>
      <div class="toasts" id="toasts"></div>
      <div class="prompt" id="prompt"></div>
      <div class="helm" id="helm">
        <div class="row"><span>Engines</span><b id="order">AHEAD 2/3</b></div>
        <div class="telegraph" id="telegraph"></div>
        <div class="row"><span>Rudder</span><b id="rudder">MIDSHIPS</b></div>
        <div class="rudderbar"><i id="rudderfill"></i></div>
        <div class="row"><span>Speed</span><b id="knots">0 kn</b></div>
      </div>
      <div class="gunpanel" id="gunpanel">
        <div class="row"><span>Mount</span><b id="gunname">5-inch gun</b></div>
        <div class="row"><span>Bearing</span><b id="gunbrg">000°</b></div>
        <div class="row"><span>Elevation</span><b id="gunelev">0°</b></div>
        <div class="row"><span>Targets destroyed</span><b id="score">0</b></div>
      </div>
      <div class="holding" id="holding"></div>
      <div class="flight" id="flight">
        <div class="row"><span>Speed</span><b id="fspd">0 kn</b></div>
        <div class="row"><span>Altitude</span><b id="falt">0 ft</b></div>
        <div class="row"><span>Climb</span><b id="fvs">0 ft/min</b></div>
        <div class="row"><span>Throttle</span><b id="fthr">0%</b></div>
        <div class="thrbar"><i id="fthrbar"></i></div>
        <div class="row"><span>Gear</span><b id="fgear">DOWN</b></div>
      </div>
      <div class="fpm" id="fpm"></div>
      <div class="warn" id="fwarn"></div>
      <div class="hurt" id="hurt"></div>
      <div class="death" id="death"><h2>You died</h2><p>Respawning…</p></div>
    `;
    const $ = (id) => this.el.querySelector('#' + id);
    this.healthEl = $('health');
    this.hurtEl = $('hurt');
    this.promptEl = $('prompt');
    this.deathEl = $('death');
    this.toastsEl = $('toasts');
    this.statsEl = $('stats');
    this.hintsEl = $('hints');
    this.helmEl = $('helm');
    this.compassStrip = this.el.querySelector('.compass .strip');
    this.hdgEl = $('hdg');
    this.buildCompass();
    this.hurtLevel = 0;
    this.lastHp = -1;
    this.overlay = document.getElementById('overlay');
    this.gunEl = $('gunpanel');
    this.flightEl = $('flight');
    this.fpmEl = $('fpm');
    this.warnEl = $('fwarn');
    this.holdingEl = $('holding');
    this.setMode('deck');
  }

  setMode(mode, gun) {
    this.mode = mode;
    this.helmEl.classList.toggle('on', mode === 'helm');
    this.gunEl.classList.toggle('on', mode === 'gun');
    this.el.classList.toggle('gunning', mode === 'gun');
    this.el.classList.toggle('flying', mode === 'jet');
    this.flightEl.classList.toggle('on', mode === 'jet');
    const title = { deck: 'On deck', shore: 'Ashore', helm: 'At the helm', gun: gun ? `Manning the ${gun.name}` : 'Gun', jet: 'Flying' }[mode];
    const rows = { deck: ON_FOOT, shore: ON_FOOT, helm: AT_HELM, jet: IN_JET, gun: gun?.kind === 'bullet' ? [['Mouse', 'Aim'], ['LMB (hold)', 'Fire'], ['E', 'Leave the gun']] : ON_GUN }[mode];
    this.hintsEl.innerHTML = `<div class="hint-title">${title}</div>` + kbd(rows);
    if (gun) this.gunEl.querySelector('#gunname').textContent = gun.name;
  }

  setGun(gun) {
    const brg = ((Math.round(-gun.yaw.rotation.y * 57.2958) % 360) + 360) % 360;
    this.gunEl.querySelector('#gunbrg').textContent = String(brg).padStart(3, '0') + '° rel';
    this.gunEl.querySelector('#gunelev').textContent = Math.round(gun.pitch.rotation.x * 57.2958) + '°';
  }

  // Flight readout + flight-path marker (screen position of where the jet is heading).
  setFlight(jet, camera) {
    const $ = (id) => this.flightEl.querySelector('#' + id);
    $('fspd').textContent = `${Math.round(jet.airspeed * 1.944)} kn`;
    $('falt').textContent = `${Math.round(jet.pos.y * 3.281)} ft`;
    $('fvs').textContent = `${Math.round(jet.vel.y * 196.85 / 10) * 10} ft/min`;
    $('fthr').textContent = jet.ab ? 'AB' : `${Math.round(jet.throttle * 100)}%`;
    $('fthrbar').style.width = `${jet.throttle * 100}%`;
    $('fthrbar').classList.toggle('ab', jet.ab);
    $('fgear').textContent = jet.gearDown ? 'DOWN' : 'UP';
    const p = jet.pos.clone().addScaledVector(jet.onGround || jet.vel.lengthSq() < 4 ? jet.fwd : jet.vel.clone().normalize(), 400).project(camera);
    const vis = p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
    this.fpmEl.style.display = vis ? 'block' : 'none';
    if (vis) this.fpmEl.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px)`;
    let warn = '';
    if (!jet.onGround && jet.stall) warn = 'STALL';
    else if (!jet.onGround && jet.pos.y < 120 && jet.vel.y < -25) warn = 'PULL UP';
    else if (!jet.onGround && !jet.gearDown && jet.pos.y < 60 && jet.airspeed < 90) warn = 'GEAR';
    if (this.warnEl.textContent !== warn) this.warnEl.textContent = warn;
    this.warnEl.classList.toggle('on', !!warn);
  }

  setScore(n) { this.gunEl.querySelector('#score').textContent = n; }

  setHolding(name) {
    this.holdingEl.innerHTML = name ? `Holding <b>${name}</b>` : '';
    this.holdingEl.classList.toggle('on', !!name);
  }

  buildCompass() {
    const marks = [];
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n];
      const label = card ?? (n % 45 === 0 ? String(n) : '|');
      marks.push(`<span style="left:${(d + 360) * 4}px" class="${card ? 'card' : ''}">${label}</span>`);
    }
    this.compassStrip.innerHTML = marks.join('');
  }

  // deg: compass heading (0 = north, 90 = east)
  setHeading(deg) {
    const d = ((deg % 360) + 360) % 360;
    this.compassStrip.style.transform = `translateX(${-(d + 360) * 4 + 200}px)`;
    this.hdgEl.textContent = String(Math.round(d) % 360).padStart(3, '0') + '°';
  }

  setShip(ship, speeds) {
    const tele = speeds.map((s, i) => `<i class="${i === ship.telegraph ? 'on' : ''}">${s.name}</i>`).join('');
    if (this._tele !== tele) { this.helmEl.querySelector('#telegraph').innerHTML = tele; this._tele = tele; }
    this.helmEl.querySelector('#order').textContent = ship.order.name;
    const deg = Math.round(ship.rudder * 35);
    this.helmEl.querySelector('#rudder').textContent = deg === 0 ? 'MIDSHIPS' : `${Math.abs(deg)}° ${deg > 0 ? 'STBD' : 'PORT'}`;
    const f = this.helmEl.querySelector('#rudderfill');
    f.style.left = deg >= 0 ? '50%' : `${50 + ship.rudder * 50}%`;
    f.style.width = `${Math.abs(ship.rudder) * 50}%`;
    f.classList.toggle('port', deg < 0);
    this.helmEl.querySelector('#knots').textContent = `${(ship.speed * 1.944).toFixed(1)} kn`;
  }

  setHealth(frac, hp) {
    if (hp === this.lastHp) return;
    this.lastHp = hp;
    this.healthEl.querySelector('.fill').style.width = `${frac * 100}%`;
    this.healthEl.querySelector('span').textContent = hp;
    this.healthEl.classList.toggle('low', frac < 0.3);
  }

  hurt(level) {
    this.hurtLevel = Math.min(this.hurtLevel + 0.35 + level * 0.6, 1);
    this.hurtEl.style.opacity = this.hurtLevel;
    this.healthEl.classList.remove('hit');
    void this.healthEl.offsetWidth;
    this.healthEl.classList.add('hit');
  }

  frame(dt) {
    if (this.hurtLevel > 0) {
      this.hurtLevel = Math.max(this.hurtLevel - dt * 1.4, 0);
      this.hurtEl.style.opacity = this.hurtLevel;
    }
  }

  showDeath(show, msg = 'You died') {
    this.deathEl.classList.toggle('on', show);
    this.deathEl.querySelector('h2').textContent = msg;
  }

  setPrompt(html) {
    if (this._prompt === html) return;
    this._prompt = html;
    this.promptEl.innerHTML = html || '';
    this.promptEl.classList.toggle('on', !!html);
  }

  toast(text, color = 0xffffff) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    t.style.setProperty('--c', hex(color));
    this.toastsEl.prepend(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2300);
  }

  setStats(fps, crew) {
    this.statsEl.textContent = `${fps} FPS · ${crew} crew on deck`;
  }

  showOverlay(show, first = false) {
    this.overlay.classList.toggle('hidden', !show);
    this.el.classList.toggle('hidden', show);
    this.overlay.querySelector('.play').textContent = first ? 'Click to board' : 'Click to resume';
  }
}
