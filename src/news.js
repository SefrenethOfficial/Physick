import { islandAt } from './world.js';

// Verian's news: things that happened (mostly things you did), for the talk radio and the TV.
// Headlines are added as they happen and kept for a while; the newest come first.

const PLACES = { city: 'downtown Verian', town: 'Saltmarsh Key', hood: 'the Hollows', park: 'Cherry Estate', naval: 'the naval air station', point: 'Pelican Point', hills: 'Ridgeback Hills', scorch: 'the Scorch' };

export class News {
  constructor(game) {
    this.game = game;
    this.items = []; // { text, kind, t, said }
  }

  place(pos) {
    const isl = pos && islandAt(pos.x, pos.z, 4);
    return PLACES[isl?.id] || 'the city';
  }

  add(text, kind = 'news') {
    const g = this.game;
    const last = this.items[0];
    if (last && last.text === text) return;
    this.items.unshift({ text, kind, t: g.time || 0, hour: g.daynight?.timeText, said: 0 });
    if (this.items.length > 40) this.items.length = 40;
  }

  // the freshest item nobody's read out yet (or a recent one, if they've all been said)
  next(maxAge = 600) {
    const now = this.game.time || 0;
    const fresh = this.items.filter((i) => now - i.t < maxAge);
    const it = fresh.find((i) => !i.said) || null;
    if (it) it.said++;
    return it;
  }
}
