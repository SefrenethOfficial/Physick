// Game settings, remembered in this browser, with a small panel on the pause screen.

const DEFAULTS = {
  civRespawn: true,
  music: true,
  police: true,
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
  return { ...DEFAULTS, ...saved };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

const ROWS = [
  { key: 'civRespawn', label: 'Townspeople respawn', hint: 'New people wander in out of sight', type: 'toggle' },
  { key: 'music', label: 'Chase music', hint: 'Plays when you have three or more stars', type: 'toggle' },
  { key: 'police', label: 'Police', hint: 'Off: crimes never get you a wanted level', type: 'toggle' },
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
      const v = s[r.key];
      const ctl = r.type === 'toggle'
        ? `<button class="tog ${v ? 'on' : ''}" data-k="${r.key}">${v ? 'On' : 'Off'}</button>`
        : `<div class="choice">${r.options.map((o) => `<button class="${o === v ? 'on' : ''}" data-k="${r.key}" data-v="${o}">${r.fmt ? r.fmt(o) : o}</button>`).join('')}</div>`;
      return `<div class="srow"><div><b>${r.label}</b>${r.hint ? `<small>${r.hint}</small>` : ''}</div>${ctl}</div>`;
    }).join('');
  };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    const k = b.dataset.k;
    const row = ROWS.find((r) => r.key === k);
    game.settings[k] = row.type === 'toggle' ? !game.settings[k] : Number(b.dataset.v);
    saveSettings(game.settings);
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
