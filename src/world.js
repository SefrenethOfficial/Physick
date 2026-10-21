// The archipelago: every island and pier, in world coordinates.
// Land is a flat slab whose top is at LAND_Y. Piers are walkable too.

export const LAND_Y = 2.5;

export const ISLANDS = [
  { id: 'naval', name: 'NAS Halyard', x0: 10, x1: 1500, z0: -1000, z1: 1000, color: '#6a8f45' },
  { id: 'city', name: 'Verian City', x0: -1115, x1: -700, z0: -212, z1: 212, color: '#8d8f93' },
  { id: 'park', name: 'Cherry Estate', x0: -1715, x1: -1115, z0: -420, z1: 420, color: '#3f6b35' },
  { id: 'airport', name: 'Verian International (closed)', x0: -2000, x1: -1060, z0: 420, z1: 800, color: '#6f6f68' },
  { id: 'hood', name: 'The Hollows', x0: -580, x1: -180, z0: -1750, z1: -1250, color: '#5a5550' },
  { id: 'town', name: 'Saltmarsh Key', x0: -1050, x1: -640, z0: -1750, z1: -1200, color: '#7a9a55' },
];

// Piers and jetties (rectangles that stick out into the water).
export const PIERS = [];
export function addPier(x0, x1, z0, z1) { PIERS.push({ x0, x1, z0, z1 }); }

const inRect = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

export function islandAt(x, z, margin = 0) {
  for (const i of ISLANDS) if (inRect(i, x, z, margin)) return i;
  return null;
}
export function onLand(x, z, margin = 0) { return !!islandAt(x, z, margin); }
export function landHeight(x, z) { return onLand(x, z) ? LAND_Y : null; }
// Land or a pier: something a boat can't sail through.
export function blocked(x, z, margin = 0) {
  if (onLand(x, z, margin)) return true;
  for (const p of PIERS) if (inRect(p, x, z, margin)) return true;
  return false;
}

// Closest walkable point (island edge or pier) to (x, z).
export function nearestLandPoint(x, z) {
  let best = null;
  for (const r of [...ISLANDS, ...PIERS]) {
    const cx = Math.min(Math.max(x, r.x0 + 1.2), r.x1 - 1.2);
    const cz = Math.min(Math.max(z, r.z0 + 1.2), r.z1 - 1.2);
    const d = Math.hypot(cx - x, cz - z);
    if (!best || d < best.dist) best = { x: cx, z: cz, dist: d };
  }
  return best;
}
