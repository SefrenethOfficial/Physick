// Game settings, remembered in this browser, with a small panel on the pause screen.

import { PRESETS } from './graphics.js';

const DEFAULTS = {
  preset: 'high',
  ...PRESETS.high,
  fpsCap: 0,
  showFps: true,
  civRespawn: true,
  music: true,
  crewRespawn: true,
  crewCount: 8,
  blood: true,
  keepBodies: true,
  mouseSens: 1,
  invertJet: false,
};

const KEY = 'physick.settings.v1';

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage unavailable */ }
  delete saved.police; // the police can't be switched off any more
  return { ...DEFAULTS, ...saved };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

const GFX_KEYS = ['resScale', 'shadows', 'viewDist', 'crowd', 'antialias', 'dynRes'];
const pct = (v) => (v === 'native' ? 'Native' : `${Math.round(v * 100)}%`);
const cap = (v) => (typeof v === 'string' ? v.charAt(0).toUpperCase() + v.slice(1) : v);

const ROWS = [
  { section: 'Graphics' },
  { key: 'preset', label: 'Quality preset', hint: 'Sets everything below in one go', type: 'choice', options: ['low', 'medium', 'high', 'ultra'], fmt: cap, extra: ['custom'] },
  { key: 'resScale', label: 'Resolution', hint: 'Biggest single speed-up. Native = full sharpness on high-DPI screens', type: 'choice', options: [0.5, 0.75, 1, 'native'], fmt: pct },
  { key: 'dynRes', label: 'Dynamic resolution', hint: 'Lowers the resolution automatically when the frame rate drops', type: 'toggle' },
  { key: 'shadows', label: 'Shadows', type: 'choice', options: ['off', 'low', 'high', 'ultra'], fmt: cap },
  { key: 'viewDist', label: 'View distance', hint: 'How far out the world is drawn before the haze', type: 'choice', options: ['near', 'medium', 'far'], fmt: cap },
  { key: 'crowd', label: 'Crowds and traffic', hint: 'How many people and cars are about', type: 'choice', options: ['low', 'normal', 'high'], fmt: cap },
  { key: 'antialias', label: 'Antialiasing', hint: 'Smooths jagged edges. Takes effect next time the game loads', type: 'toggle' },
  { key: 'fpsCap', label: 'Frame rate cap', hint: 'A cap saves battery and keeps laptops cooler', type: 'choice', options: [30, 60, 0], fmt: (v) => (v ? `${v} FPS` : 'Off') },
  { key: 'showFps', label: 'Show FPS', type: 'toggle' },
  { section: 'Game' },
  { key: 'civRespawn', label: 'Townspeople respawn', hint: 'New people wander in out of sight', type: 'toggle' },
  { key: 'music', label: 'Chase music', hint: 'Plays while the police are after you', type: 'toggle' },
  { key: 'crewRespawn', label: 'Crew respawn', hint: 'New sailors come on deck to replace the fallen', type: 'toggle' },
  { key: 'crewCount', label: 'Crew on the warship', type: 'choice', options: [0, 4, 8, 12, 16] },
  { key: 'blood', label: 'Blood', hint: 'Blood spray, pools and drag smears', type: 'toggle' },
  { key: 'keepBodies', label: 'Bodies stay', hint: 'Off: bodies are cleared away after a while', type: 'toggle' },
  { key: 'mouseSens', label: 'Mouse sensitivity', type: 'choice', options: [0.5, 0.75, 1, 1.25, 1.5, 2], fmt: (v) => `${v}×` },
  { key: 'invertJet', label: 'Invert jet pitch', hint: 'Mouse forward pitches the nose down', type: 'toggle' },
];

export function bindSettingsPanel(game) {
  const panel = document.getElementById('settings');
  const list = panel.querySelector('.rows');
  const render = () => {
    const s = game.settings;
    list.innerHTML = ROWS.map((r) => {
      if (r.section) return `<h3 class="ssec">${r.section}</h3>`;
      const v = s[r.key];
      const ctl = r.type === 'toggle'
        ? `<button class="tog ${v ? 'on' : ''}" data-k="${r.key}">${v ? 'On' : 'Off'}</button>`
        : `<div class="choice">${r.options.concat(r.extra && r.extra.includes(v) ? [v] : []).map((o) => `<button class="${o === v ? 'on' : ''}" data-k="${r.key}" data-v="${o}">${r.fmt ? r.fmt(o) : o}</button>`).join('')}</div>`;
      return `<div class="srow"><div><b>${r.label}</b>${r.hint ? `<small>${r.hint}</small>` : ''}</div>${ctl}</div>`;
    }).join('');
  };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    const k = b.dataset.k;
    const row = ROWS.find((r) => r.key === k);
    const raw = b.dataset.v;
    const val = row.type === 'toggle' ? !game.settings[k] : (raw !== undefined && raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw);
    if (k === 'preset' && val === 'custom') return;
    const wasAA = game.settings.antialias;
    game.settings[k] = val;
    if (k === 'preset') Object.assign(game.settings, PRESETS[val]);
    else if (GFX_KEYS.includes(k)) game.settings.preset = 'custom';
    saveSettings(game.settings);
    if (game.settings.antialias !== wasAA) game.hud?.toast?.('Antialiasing changes when the game next loads', 0xffd166);
    game.applySettings?.();
    render();
  });
  document.getElementById('btn-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    render();
    panel.classList.remove('hidden');
  });
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === panel || e.target.closest('.close')) panel.classList.add('hidden');
  });
  render();
}
