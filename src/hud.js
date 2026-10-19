const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// All DOM UI: logo, crosshair, mode bar, hints, toasts, spawn menu, title/pause screen.
export class Hud {
  constructor(game, tools) {
    this.game = game;
    this.el = document.getElementById('hud');
    this.el.innerHTML = `
      <img class="hud-logo" src="${import.meta.env.BASE_URL}assets/physick-logo.svg" alt="Physick">
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
    this.modes.forEach((m) => m.addEventListener('click', () => game.setTool(+m.dataset.i)));

    this.overlay = document.getElementById('overlay');
    this.menu = document.getElementById('spawnmenu');
  }

  setMode(i, tool) {
    this.modes.forEach((m, j) => m.classList.toggle('active', i === j));
    this.crosshair.style.setProperty('--c', hex(tool.color));
    this.crosshair.dataset.mode = tool.name.toLowerCase();
    const common = [['Q', 'Spawn menu'], ['Z', 'Undo spawn'], ['V', 'Noclip']];
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

  setStats(fps, props, welds) {
    this.statsEl.textContent = `${fps} FPS · ${props} props · ${welds} welds`;
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
