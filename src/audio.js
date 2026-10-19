// Tiny synthesized sound kit, no audio files needed.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.hum = null;
  }

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  tone(type, f0, f1, dur, vol = 0.4, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 2000, q = 0.8, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'shoot': this.noise(0.09, 0.5, 2600, 0.7); this.tone('square', 220, 60, 0.08, 0.18); break;
      case 'cannon': this.noise(0.35, 0.7, 500, 0.6); this.tone('sine', 120, 35, 0.35, 0.6); break;
      case 'impact': this.noise(0.05, 0.15, 4000, 1.5); break;
      case 'select': this.tone('triangle', 660, 990, 0.08, 0.25); break;
      case 'weld':
        this.tone('sawtooth', 1400, 300, 0.22, 0.18);
        this.noise(0.25, 0.35, 5000, 2);
        this.tone('sine', 880, 1320, 0.12, 0.2, 0.12);
        break;
      case 'unweld': this.tone('sawtooth', 300, 1400, 0.18, 0.14); this.noise(0.12, 0.2, 3000, 2); break;
      case 'grab': this.tone('sine', 300, 700, 0.12, 0.3); break;
      case 'drop': this.tone('sine', 600, 200, 0.12, 0.25); break;
      case 'freeze': this.tone('triangle', 1200, 1800, 0.15, 0.25); this.tone('sine', 2400, 2400, 0.25, 0.1, 0.05); break;
      case 'unfreeze': this.tone('triangle', 1600, 700, 0.18, 0.22); break;
      case 'switch': this.tone('square', 520, 520, 0.04, 0.12); this.tone('square', 780, 780, 0.04, 0.1, 0.05); break;
      case 'spawn': this.tone('sine', 400, 900, 0.1, 0.3); this.noise(0.06, 0.15, 1200, 1); break;
      case 'error': this.tone('square', 180, 140, 0.15, 0.15); break;
    }
  }

  setHum(on, pitch = 1) {
    if (!this.ctx) return;
    if (on && !this.hum) {
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'sine';
      o.frequency.value = 70; o2.frequency.value = 141;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.1);
      o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
      o.start(); o2.start();
      this.hum = { o, o2, g };
    } else if (!on && this.hum) {
      const h = this.hum; this.hum = null;
      h.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
      h.o.stop(this.ctx.currentTime + 0.12); h.o2.stop(this.ctx.currentTime + 0.12);
    }
    if (on && this.hum) {
      this.hum.o.frequency.value = 70 * pitch;
      this.hum.o2.frequency.value = 141 * pitch;
    }
  }
}
