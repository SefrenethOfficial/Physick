const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// All DOM UI: logo, crosshair, mode bar, hints, toasts, spawn menu, title/pause screen.
export class Hud {
  constructor(game, tools) {
    this.game = game;
    this.el = document.getElementById('hud');
    this.el.innerHTML = `
      <img class="hud-logo" src="${import.meta.env.BASE_URL}assets/physick-logo.svg" alt="Physick">
      <div class="health" id="health"><div class="fill"></div><span>100</span></div>
      <div class="hurt" id="hurt"></div>
      <div class="prompt" id="prompt"></div>
      <div class="speedo" id="speedo"><b>0</b><span>km/h</span></div>
      <div class="death" id="death"><h2>You died</h2><p>Respawning…</p></div>
      <div class="crosshair" id="crosshair"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="stats" id="stats"></div>
      <div class="hints" id="hints"></div>
      <div class="toasts" id="toasts"></div>
      <div class="modebar" id="modebar">
        ${tools.map((t, i) => `
          <div class="mode" data-i="${i}" style="--c:${hex(t.color)}">
            <span class="key">${i + 1}</span><span class="name">${t.name}</span>
          </div>`).join('')}
      </div>
      <div class="badge" id="noclip">NOCLIP</div>
    `;
    this.modes = [...this.el.querySelectorAll('.mode')];
    this.hintsEl = this.el.querySelector('#hints');
    this.toastsEl = this.el.querySelector('#toasts');
    this.statsEl = this.el.querySelector('#stats');
    this.crosshair = this.el.querySelector('#crosshair');
    this.noclipEl = this.el.querySelector('#noclip');
    this.healthEl = this.el.querySelector('#health');
    this.hurtEl = this.el.querySelector('#hurt');
    this.promptEl = this.el.querySelector('#prompt');
    this.speedEl = this.el.querySelector('#speedo');
    this.deathEl = this.el.querySelector('#death');
    this.modebar = this.el.querySelector('#modebar');
    this.tool = null;
    this.hurtLevel = 0;
    this.lastHp = -1;
    this.modes.forEach((m) => m.addEventListener('click', () => game.setTool(+m.dataset.i)));

    this.overlay = document.getElementById('overlay');
    this.menu = document.getElementById('spawnmenu');
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

  setPrompt(text) {
    if (this.promptEl.textContent !== (text || '')) this.promptEl.innerHTML = text || '';
    this.promptEl.classList.toggle('on', !!text);
  }

  setSpeed(kmh) {
    this.speedEl.querySelector('b').textContent = Math.round(kmh);
  }

  setDriving(on) {
    this.el.classList.toggle('driving', on);
    if (on) {
      this.hintsEl.innerHTML = `<div class="hint-title" style="color:#e0532a">Quad Bike</div>` +
        [['W / S', 'Throttle / brake, reverse'], ['A / D', 'Steer'], ['Shift', 'Boost'], ['Space', 'Handbrake'],
          ['Mouse', 'Look around'], ['H', 'Horn'], ['R', 'Flip upright'], ['E', 'Get off']]
          .map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('');
    } else if (this.tool) {
      this.setMode(this.modeIndex, this.tool);
    }
  }

  setMode(i, tool) {
    this.tool = tool;
    this.modeIndex = i;
    this.modes.forEach((m, j) => m.classList.toggle('active', i === j));
    this.crosshair.style.setProperty('--c', hex(tool.color));
    this.crosshair.dataset.mode = tool.name.toLowerCase();
    const common = [['E', 'Ride quad'], ['Q', 'Spawn menu'], ['Z', 'Undo spawn'], ['V', 'Noclip']];
    this.hintsEl.innerHTML =
      `<div class="hint-title" style="color:${hex(tool.color)}">${tool.name}</div>` +
      [...tool.hints, ...common].map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('');
  }

  toast(text, color = 0xffffff) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    t.style.setProperty('--c', hex(color));
    this.toastsEl.prepend(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 1400);
    setTimeout(() => t.remove(), 1900);
  }

  setStats(fps, props, welds, people, down) {
    this.statsEl.textContent = `${fps} FPS · ${props} props · ${welds} welds · ${people} people · ${down} knocked over`;
  }

  setNoclip(on) { this.noclipEl.classList.toggle('on', on); }

  showOverlay(show, first = false) {
    this.overlay.classList.toggle('hidden', !show);
    this.el.classList.toggle('hidden', show);
    this.overlay.querySelector('.play').textContent = first ? 'Click to play' : 'Click to resume';
  }

  buildSpawnMenu(defs, thumbs, onPick) {
    const grid = this.menu.querySelector('.grid');
    grid.innerHTML = '';
    defs.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.innerHTML = `<img src="${thumbs[d.id] || ''}" alt=""><span>${d.name}</span>`;
      b.addEventListener('click', (e) => onPick(d, e.shiftKey));
      grid.appendChild(b);
    });
  }

  showMenu(show) { this.menu.classList.toggle('hidden', !show); }
  get menuOpen() { return !this.menu.classList.contains('hidden'); }
}
