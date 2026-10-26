import { mpSession, setMpSession } from './netseed.js';
import { httpUrl } from './net.js';

// The Multiplayer menu (from the title / pause screen): pick a server, make or join a room.
// Joining reloads the page, because everyone in a room has to build the same world from its seed.

// Where the server lives, if you haven't typed one in. (Set this once the server is deployed.)
export const DEFAULT_SERVER = '';

const SERVER_KEY = 'physick.mp.server';
const NAME_KEY = 'physick.mp.name';
const get = (k, d = '') => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };

function defaultName() {
  let n = get(NAME_KEY);
  if (!n) { n = `Player${Math.floor(100 + Math.random() * 900)}`; put(NAME_KEY, n); }
  return n;
}

async function api(server, path, opts) {
  const res = await fetch(`${httpUrl(server)}${path}`, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server said ${res.status}`);
  return body;
}

// An invite link (?join=CODE&server=…): look the room up before the world is built.
export async function linkSession() {
  const q = new URLSearchParams(location.search);
  const code = q.get('join'), server = q.get('server') || get(SERVER_KEY, DEFAULT_SERVER);
  if (!code || !server) return null;
  history.replaceState(null, '', location.pathname); // (so leaving doesn't join again)
  try {
    const r = await api(server, `/room/${encodeURIComponent(code)}`);
    put(SERVER_KEY, server);
    const s = { url: httpUrl(server), room: r.room, seed: r.seed, name: defaultName() };
    setMpSession(s);
    return s;
  } catch (e) {
    console.warn('invite link:', e.message);
    return null;
  }
}

// "Our other games": a panel of links (they open in a new tab).
function bindGames() {
  const panel = document.getElementById('games'), btn = document.getElementById('btn-games');
  if (!panel || !btn) return;
  btn.addEventListener('click', (e) => { e.stopPropagation(); panel.classList.remove('hidden'); });
  panel.addEventListener('click', (e) => {
    e.stopPropagation(); // (so a click in here doesn't start the game behind it)
    if (e.target === panel || e.target.closest('.close')) panel.classList.add('hidden');
  });
}

export function bindLobby(game) {
  bindGames();
  const panel = document.getElementById('mp');
  const btn = document.getElementById('btn-mp');
  if (!panel || !btn) return;
  const rows = panel.querySelector('.rows');
  let status = '';

  const render = () => {
    const net = game.net;
    if (net) {
      const players = [{ id: net.id, name: `${net.s.name} (you)` }, ...[...net.players.values()].map((r) => ({ id: r.id, name: r.name }))];
      rows.innerHTML = `
        <div class="mp-room">Room <b>${net.room}</b></div>
        <p class="mp-note">${net.status === 'online' ? `Connected · ${net.ping} ms` : 'Reconnecting…'} · up to 8 players</p>
        <ul class="mp-list">${players.map((p) => `<li>${esc(p.name)}${p.id === net.host ? ' <span class="tag">host</span>' : ''}</li>`).join('')}</ul>
        <div class="mp-row"><button data-a="copy">Copy invite link</button><button data-a="leave" class="danger">Leave room</button></div>
        <p class="mp-note">Friends can join with the code <b>${net.room}</b> (same server), or with the invite link. Press <kbd>Enter</kbd> in game to chat.</p>
        <p class="mp-status">${esc(status)}</p>`;
      return;
    }
    const server = get(SERVER_KEY, DEFAULT_SERVER);
    rows.innerHTML = `
      <label class="mp-field">Server<input data-f="server" placeholder="https://your-physick-server.onrender.com" value="${esc(server)}" /></label>
      <label class="mp-field">Your name<input data-f="name" maxlength="16" value="${esc(defaultName())}" /></label>
      <div class="mp-row"><button data-a="create">Create a room</button></div>
      <div class="mp-row"><input data-f="code" maxlength="4" placeholder="CODE" class="mp-code" /><button data-a="join">Join room</button></div>
      <p class="mp-note">Up to 8 players share one city: the same streets, traffic and people. Everyone keeps their own money, cars and story.</p>
      <p class="mp-status">${esc(status)}</p>`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const field = (f) => rows.querySelector(`[data-f="${f}"]`)?.value.trim() || '';
  const say = (s) => { status = s; const el = rows.querySelector('.mp-status'); if (el) el.textContent = s; };

  const go = async (create) => {
    const server = field('server'), name = field('name') || defaultName(), code = field('code').toUpperCase();
    if (!server) { say('Type in the server address first (see the README: Multiplayer).'); return; }
    if (!create && !/^[A-Z]{4}$/.test(code)) { say('Room codes are 4 letters.'); return; }
    put(SERVER_KEY, server); put(NAME_KEY, name);
    say(create ? 'Making a room…' : 'Looking for the room…');
    try {
      const r = create ? await api(server, '/room', { method: 'POST' }) : await api(server, `/room/${code}`);
      if (!create && r.players >= r.max) { say('That room is full.'); return; }
      setMpSession({ url: httpUrl(server), room: r.room, seed: r.seed, name });
      say(`Room ${r.room}: loading the city…`);
      setTimeout(() => location.reload(), 300);
    } catch (e) {
      say(/fetch|network/i.test(e.message) ? 'Couldn\'t reach that server. Is the address right, and is it running? (A free server can take a minute to wake up.)' : e.message);
    }
  };

  btn.addEventListener('click', (e) => { e.stopPropagation(); status = ''; render(); panel.classList.remove('hidden'); });
  panel.addEventListener('keydown', (e) => e.stopPropagation()); // (typing here isn't playing)
  panel.addEventListener('keyup', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === panel || e.target.closest('.close')) { panel.classList.add('hidden'); return; }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'create') go(true);
    else if (a === 'join') go(false);
    else if (a === 'leave') game.net?.leave();
    else if (a === 'copy') {
      const s = game.net.s;
      const link = `${location.origin}${location.pathname}?join=${game.net.room}&server=${encodeURIComponent(s.url)}`;
      navigator.clipboard?.writeText(link).then(() => say('Invite link copied.'), () => say(link));
    }
  });
  // keep the player list fresh while it's open
  setInterval(() => { if (!panel.classList.contains('hidden') && game.net && !panel.contains(document.activeElement)) render(); }, 1500);
  if (mpSession() && !game.net) say('');
}
