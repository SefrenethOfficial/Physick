// Chase music: one track for a low wanted level (1-2 stars), another when they're really
// after you (3+). Tracks crossfade as the level changes and fade out when you lose the police.
class Track {
  constructor(url, max) {
    this.el = new Audio(url);
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.volume = 0;
    this.vol = 0;
    this.max = max;
  }

  update(dt, on) {
    const target = on ? this.max : 0;
    const rate = on ? 0.45 : 0.3;
    this.vol += Math.sign(target - this.vol) * Math.min(Math.abs(target - this.vol), rate * dt);
    if (this.vol > 0.001 && this.el.paused) {
      if (this.vol < 0.05) this.el.currentTime = 0; // a fresh chase starts the song from the top
      this.el.play().catch(() => {});
    }
    if (this.vol <= 0.001 && !this.el.paused) this.el.pause();
    this.el.volume = Math.max(0, Math.min(1, this.vol));
  }
}

export class ChaseMusic {
  constructor(base) {
    this.low = new Track(`${base}assets/music/chase-on-foot.mp3`, 0.5);
    this.high = new Track(`${base}assets/music/starvation-pursuer.mp3`, 0.6);
    this.lab = new Track(`${base}assets/music/true-lab.mp3`, 0.6);
  }

  // stars: current wanted level (0 = no music)
  // lab: you're down in the lab under Cherry Estate (its own music, nothing else)
  update(dt, stars, lab = false) {
    this.low.update(dt, !lab && stars >= 1 && stars <= 2);
    this.high.update(dt, !lab && stars >= 3);
    this.lab.update(dt, lab);
  }

  get vol() { return Math.max(this.low.vol, this.high.vol, this.lab.vol); }
}
