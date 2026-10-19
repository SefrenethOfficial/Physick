const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const kbd = (rows) => rows.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('');

const ON_FOOT = [['W A S D', 'Walk'], ['Space', 'Jump'], ['Shift', 'Run'], ['E', 'Use / take the helm'], ['V', 'Noclip']];
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
      <div class="hurt" id="hurt"></div>
      <div class="badge" id="noclip">NOCLIP</div>
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
    this.noclipEl = $('noclip');
    this.compassStrip = this.el.querySelector('.compass .strip');
    this.hdgEl = $('hdg');
    this.buildCompass();
    this.hurtLevel = 0;
    this.lastHp = -1;
    this.overlay = document.getElementById('overlay');
    this.setHelm(false);
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

  setHelm(on) {
    this.helmEl.classList.toggle('on', on);
    this.hintsEl.innerHTML = `<div class="hint-title">${on ? 'At the helm' : 'On deck'}</div>` + kbd(on ? AT_HELM : ON_FOOT);
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

  setNoclip(on) { this.noclipEl.classList.toggle('on', on); }

  showOverlay(show, first = false) {
    this.overlay.classList.toggle('hidden', !show);
    this.el.classList.toggle('hidden', show);
    this.overlay.querySelector('.play').textContent = first ? 'Click to board' : 'Click to resume';
  }
}
