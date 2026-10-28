// Chase music: one track for a low wanted level (1-2 stars), another when they're really
// after you (3+), *Oversized* once the SWAT teams are out (10+ stars), *Studiopolis Zone* at 20+ stars, and *Time Trial* in a street race. Tracks crossfade as the level changes and fade out when you lose the police.
export class Track {
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
    this.swat = new Track(`${base}assets/music/oversized.mp3`, 0.6);
    this.race = new Track(`${base}assets/music/time-trial.mp3`, 0.55);
    this.top = new Track(`${base}assets/music/studiopolis.mp3`, 0.6); // 20+ stars: Studiopolis Zone
  }

  // stars: current wanted level (0 = no music)
  // lab: you're down in the lab under Cherry Estate (its own music, nothing else)
  // force: a mission's own track ('low' = Chase on Foot, 'high' = Pursuer), whatever the stars
  // swat: SWAT teams are on you (Oversized takes over from everything else)
  // race: you're in a street race (Time Trial plays over the chase themes; only the SWAT beat it)
  update(dt, stars, lab = false, force = null, swat = false, race = false) {
    const top = stars >= 20; // (20 stars and up: Studiopolis over everything but the lab)
    if (top) swat = false;
    const racing = race && !swat && !force && !top;
    const low = !swat && !racing && !top && (force ? force === 'low' : stars >= 1 && stars <= 2);
    const high = !swat && !racing && !top && (force ? force === 'high' : stars >= 3);
    this.top.update(dt, !lab && top);
    this.race.update(dt, !lab && racing);
    this.low.update(dt, !lab && low);
    this.high.update(dt, !lab && high);
    this.swat.update(dt, !lab && swat);
    this.lab.update(dt, lab);
  }

  get vol() { return Math.max(this.low.vol, this.high.vol, this.lab.vol, this.swat.vol, this.race.vol, this.top.vol); }
}
