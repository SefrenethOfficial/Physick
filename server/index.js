// Physick multiplayer server.
//
// Rooms of up to 8 players. The server doesn't simulate anything: it hands out a room code and a
// world seed (so everyone's game builds the same city), picks one player as the "world host"
// (their game runs the traffic and pedestrians for the room), and relays messages between
// players. If the host leaves, the longest-connected player takes over.
//
//   GET  /             health check
//   POST /room         make a room            → { room, seed }
//   GET  /room/CODE    look a room up         → { room, seed, players, max } (404 if none)
//   WS   /             { t:'hello', room, name, look } → { t:'welcome', ... } then the game protocol
//
// Run: npm install && npm start   (PORT env var, default 8090)

import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8090;
const MAX_PLAYERS = 8;
const ROOM_TTL = 10 * 60 * 1000; // an empty room is kept this long (so a reload can rejoin it)
const MAX_MSG = 96 * 1024;
const VERSION = 1;

const rooms = new Map(); // code -> room
let nextId = 1;

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // (no I or O: they look like 1 and 0)
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}

function makeRoom() {
  const room = { code: newCode(), seed: (Math.random() * 2 ** 31) | 0, players: new Map(), host: null, emptySince: Date.now() };
  rooms.set(room.code, room);
  return room;
}

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function send(ws, msg) { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(room, msg, except = null) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) if (p.id !== except) send(p.ws, s);
}
// The host's game runs the city, so it has to be someone whose game is running: the longest
// connected player who hasn't tabbed away (a hidden browser tab stops running the game).
function pickHost(room, except = null) {
  const list = [...room.players.values()].filter((q) => q.id !== except);
  const next = list.find((q) => !q.away) || (except == null ? list[0] : null);
  if (!next) return;
  room.host = next.id;
  broadcast(room, { t: 'host', id: next.id });
}
const roster = (room) => [...room.players.values()].map((p) => ({ id: p.id, name: p.name, look: p.look }));

function leave(p) {
  const room = p.room;
  if (!room || !room.players.has(p.id)) return;
  room.players.delete(p.id);
  broadcast(room, { t: 'leave', id: p.id });
  if (room.host === p.id) pickHost(room);
  if (!room.players.size) room.emptySince = Date.now();
  console.log(`${room.code}: ${p.name} left (${room.players.size} left)`);
}

// ---------------------------------------------------------------- HTTP: rooms
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const server = http.createServer((req, res) => {
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (url.pathname === '/room' && req.method === 'POST') { const r = makeRoom(); console.log(`${r.code}: made`); json(200, { room: r.code, seed: r.seed, max: MAX_PLAYERS }); return; }
  const m = url.pathname.match(/^\/room\/([A-Za-z]{4})$/);
  if (m && req.method === 'GET') {
    const r = rooms.get(m[1].toUpperCase());
    if (!r) { json(404, { error: 'No room with that code' }); return; }
    json(200, { room: r.code, seed: r.seed, players: r.players.size, max: MAX_PLAYERS });
    return;
  }
  if (url.pathname === '/' || url.pathname === '/health') { json(200, { ok: true, game: 'physick', version: VERSION, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0) }); return; }
  json(404, { error: 'not found' });
});

// ---------------------------------------------------------------- WebSocket: the game
const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });
wss.on('connection', (ws) => {
  const p = { id: nextId++, ws, room: null, name: 'Player', look: null, alive: true };
  ws.p = p;
  ws.on('pong', () => { p.alive = true; });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = p.room;
    if (!room) {
      if (msg.t !== 'hello') return;
      const r = rooms.get(clean(msg.room, 4).toUpperCase());
      if (!r) { send(ws, { t: 'error', msg: 'That room has closed. Make a new one.' }); ws.close(); return; }
      if (r.players.size >= MAX_PLAYERS) { send(ws, { t: 'error', msg: `That room is full (${MAX_PLAYERS} players).` }); ws.close(); return; }
      p.name = clean(msg.name, 16) || `Player ${p.id}`;
      p.look = msg.look && typeof msg.look === 'object' ? msg.look : null;
      p.room = r;
      if (!r.players.size || r.host == null) r.host = p.id;
      r.players.set(p.id, p);
      send(ws, { t: 'welcome', id: p.id, room: r.code, seed: r.seed, host: r.host, players: roster(r), v: VERSION });
      broadcast(r, { t: 'join', id: p.id, name: p.name, look: p.look }, p.id);
      console.log(`${r.code}: ${p.name} joined (${r.players.size})`);
      return;
    }
    switch (msg.t) {
      case 's': // my state, many times a second
      case 'e': { // an event: to one player (msg.to) or everyone else
        msg.id = p.id;
        if (msg.to != null) { const q = room.players.get(msg.to); if (q) send(q.ws, msg); }
        else broadcast(room, msg, p.id);
        break;
      }
      case 'w': // the world (only the host's counts)
        if (room.host === p.id) { msg.id = p.id; broadcast(room, msg, p.id); }
        break;
      case 'chat': {
        const text = clean(msg.text, 160);
        if (text) broadcast(room, { t: 'chat', id: p.id, name: p.name, text });
        break;
      }
      case 'ping': send(ws, { t: 'pong', c: msg.c }); break;
      case 'away': // tabbed away (or back)
        p.away = !!msg.v;
        if (p.away && room.host === p.id) pickHost(room, p.id);
        else if (!p.away && room.players.get(room.host)?.away) pickHost(room);
        break;
    }
  });
  ws.on('close', () => leave(p));
  ws.on('error', () => {});
});

// drop dead connections; close rooms nobody has been in for a while
setInterval(() => {
  for (const ws of wss.clients) {
    const p = ws.p;
    if (!p.alive) { ws.terminate(); continue; }
    p.alive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, r] of rooms) if (!r.players.size && now - r.emptySince > ROOM_TTL) { rooms.delete(code); console.log(`${code}: closed`); }
}, 20000);

server.listen(PORT, () => console.log(`Physick server on :${PORT}`));
