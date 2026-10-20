// Chase music: fades in when the police are really after you (3+ stars) and out when you lose them.
export class ChaseMusic {
  constructor(url) {
    this.el = new Audio(url);
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.volume = 0;
    this.vol = 0;
    this.max = 0.6;
  }

  update(dt, want) {
    const target = want ? this.max : 0;
    const rate = want ? 0.5 : 0.25; // fade in over ~2 s, out over ~4 s
    this.vol += Math.sign(target - this.vol) * Math.min(Math.abs(target - this.vol), rate * dt);
    if (this.vol > 0.001 && this.el.paused) {
      if (this.vol < 0.05) this.el.currentTime = 0; // a fresh chase starts the song from the top
      this.el.play().catch(() => {});
    }
    if (this.vol <= 0.001 && !this.el.paused) this.el.pause();
    this.el.volume = Math.max(0, Math.min(1, this.vol));
  }
}
