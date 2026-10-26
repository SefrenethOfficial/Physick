// Multiplayer sessions start with a world seed from the server: while the world builds,
// Math.random is swapped for a seeded generator so every player's game lays out the same city
// (the city's streets and shops are random, and differ every load in single player).

const KEY = 'physick.mp.v1';

export function mpSession() {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return s && s.room && s.url ? s : null; } catch { return null; }
}
export function setMpSession(s) {
  try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}

// mulberry32
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Swap Math.random for a seeded one; call the returned function to put it back.
export function seedRandom(seed) {
  const orig = Math.random;
  Math.random = seeded(seed);
  return () => { Math.random = orig; };
}
