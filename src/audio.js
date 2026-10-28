// Tiny synthesized sound kit, no audio files needed.
// Sounds that come from the world around you rather than from you.
const OUTSIDE = new Set(['honk', 'scream', 'crash', 'explosion', 'star', 'shipHorn', 'splash', 'splashFar', 'alarm', 'engineStart', 'telegraph', 'bigGun', 'ciws', 'cannon']);

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

  // vol < 1: quieter (far away)
  play(name, vol = 1) {
    if (!this.ctx || vol >= 0.99) { this._play(name); return; }
    const m = this.master, gn = this.ctx.createGain();
    gn.gain.value = vol; gn.connect(m);
    this.master = gn;
    try { this._play(name); } finally { this.master = m; }
  }

  _play(name) {
    if (!this.ctx) return;
    if (this.muffled && OUTSIDE.has(name)) return; // underground: you can't hear the world up there
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
      case 'hurt': this.noise(0.12, 0.4, 300, 0.8); this.tone('square', 160, 90, 0.12, 0.2); break;
      case 'hurtBig': this.noise(0.25, 0.6, 220, 0.7); this.tone('square', 140, 50, 0.25, 0.3); break;
      case 'die': this.tone('sawtooth', 300, 40, 1.2, 0.3); this.noise(0.5, 0.4, 200, 0.5); break;
      case 'thud': this.noise(0.18, 0.6, 180, 0.9); this.tone('sine', 140, 60, 0.2, 0.5); break;
      case 'ouch': this.tone('triangle', 520 + Math.random() * 200, 300, 0.18, 0.18); break;
      case 'honk':
        this.tone('square', 392, 392, 0.35, 0.14); this.tone('square', 494, 494, 0.35, 0.12);
        break;
      case 'splash': this.noise(0.9, 0.7, 700, 0.4); this.noise(0.4, 0.4, 2500, 0.8, 0.05); break;
      case 'telegraph': this.tone('triangle', 1760, 1760, 0.12, 0.25); this.tone('triangle', 1320, 1320, 0.2, 0.2, 0.13); break;
      case 'shipHorn':
        this.tone('sawtooth', 98, 96, 2.2, 0.32); this.tone('sawtooth', 147, 145, 2.2, 0.22); this.tone('sine', 49, 49, 2.2, 0.4);
        break;
      case 'bigGun': this.noise(0.6, 0.9, 260, 0.5); this.tone('sine', 90, 30, 0.7, 0.8); this.noise(0.15, 0.5, 2000, 0.6); break;
      case 'ciws': this.noise(0.04, 0.35, 1800, 0.9); this.tone('square', 160, 120, 0.03, 0.12); break;
      case 'splashFar': this.noise(0.6, 0.18, 500, 0.5, 0.25); break;
      case 'explosion': this.noise(1.2, 0.9, 180, 0.4); this.tone('sine', 70, 25, 1.0, 0.7); break;
      case 'scrub': this.noise(0.3, 0.18, 1800, 1.5); this.noise(0.25, 0.12, 900, 1.2, 0.12); break;
      case 'punch': this.noise(0.08, 0.5, 600, 1); this.tone('sine', 180, 70, 0.1, 0.4); break;
      case 'alarm': this.tone('square', 1250, 1250, 0.3, 0.07); this.tone('square', 950, 950, 0.3, 0.07, 0.33); break;
      case 'crash': this.noise(0.5, 0.9, 400, 0.5); this.noise(0.25, 0.5, 3200, 1.2, 0.04); this.tone('sine', 90, 35, 0.35, 0.6); break;
      case 'smg': this.noise(0.06, 0.45, 2200, 0.7); this.tone('square', 260, 90, 0.04, 0.14); break;
      case 'shotgun': this.noise(0.35, 0.8, 900, 0.5); this.tone('sine', 110, 40, 0.3, 0.5); break;
      case 'pistol': this.noise(0.12, 0.6, 1800, 0.6); this.tone('square', 300, 80, 0.06, 0.2); break;
      case 'magnum': this.noise(0.22, 0.8, 1200, 0.5); this.tone('square', 180, 50, 0.12, 0.3); this.noise(0.4, 0.2, 400, 0.5, 0.05); break;
      case 'rifle': this.noise(0.08, 0.6, 2600, 0.6); this.tone('square', 240, 70, 0.05, 0.18); this.noise(0.18, 0.15, 700, 0.5, 0.03); break;
      case 'sniper': this.noise(0.3, 0.9, 1500, 0.4); this.tone('sawtooth', 160, 35, 0.25, 0.35); this.noise(1.1, 0.25, 300, 0.4, 0.08); break;
      case 'cash': this.tone('triangle', 1320, 1320, 0.06, 0.2); this.tone('triangle', 1760, 1760, 0.12, 0.2, 0.07); break;
      case 'star': this.tone('square', 880, 660, 0.12, 0.15); this.tone('square', 880, 660, 0.12, 0.15, 0.16); break;
      case 'scream': this.tone('sawtooth', 900 + Math.random() * 300, 1300, 0.5, 0.08); this.tone('sine', 1100, 1500, 0.5, 0.06); break;
      case 'engineStart': this.tone('sawtooth', 50, 140, 0.4, 0.25); this.noise(0.3, 0.3, 400, 1); break;
    }
  }

  // Wind and waves: a looping filtered noise bed.
  // steady hiss of rain (and the drum of it on a car roof)
  setRain(level = 0) {
    if (!this.ctx) return;
    if (level > 0 && !this.rainN) {
      const len = this.ctx.sampleRate * 3;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 1 : 0.35);
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master); src.start();
      this.rainN = { src, g };
    }
    if (this.rainN) this.rainN.g.gain.setTargetAtTime(level * (this.muffled ? 0.02 : 0.09), this.ctx.currentTime, 0.8);
  }

  setOcean(on, level = 1) {
    if (!this.ctx) return;
    if (on && !this.ocean) {
      const len = this.ctx.sampleRate * 4;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.15; d[i] = last; }
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = this.ctx.createGain(); g.gain.value = 0;
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = 0.12; lg.gain.value = 0.08;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.master);
      src.start(); lfo.start();
      this.ocean = { src, g, f, lfo };
    }
    if (this.ocean) {
      this.ocean.g.gain.setTargetAtTime(on ? 0.16 * level : 0, this.ctx.currentTime, 0.5);
      this.ocean.f.frequency.setTargetAtTime(600 + level * 500, this.ctx.currentTime, 0.5);
    }
  }

  // Jet engine: a roaring noise bed plus a turbine whine that follows the throttle.
  setJet(on, throttle = 0, ab = false) {
    if (!this.ctx) return;
    if (on && !this.jet) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      const g = this.ctx.createGain(); g.gain.value = 0;
      const whine = this.ctx.createOscillator(); whine.type = 'sawtooth';
      const wg = this.ctx.createGain(); wg.gain.value = 0;
      const wf = this.ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 6;
      src.connect(f).connect(g).connect(this.master);
      whine.connect(wf).connect(wg).connect(this.master);
      src.start(); whine.start();
      this.jet = { src, f, g, whine, wg, wf };
    } else if (!on && this.jet) {
      const j = this.jet; this.jet = null;
      j.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      j.wg.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      j.src.stop(this.ctx.currentTime + 1); j.whine.stop(this.ctx.currentTime + 1);
    }
    if (on && this.jet) {
      const t = this.ctx.currentTime, j = this.jet;
      j.g.gain.setTargetAtTime(0.05 + throttle * 0.18 + (ab ? 0.15 : 0), t, 0.15);
      j.f.frequency.setTargetAtTime(300 + throttle * 900 + (ab ? 900 : 0), t, 0.15);
      j.whine.frequency.setTargetAtTime(900 + throttle * 1800, t, 0.3);
      j.wf.frequency.setTargetAtTime(900 + throttle * 1800, t, 0.3);
      j.wg.gain.setTargetAtTime(0.012 + throttle * 0.02, t, 0.2);
    }
  }

  setEngine(on, rev = 0) {
    if (!this.ctx) return;
    if (on && !this.engine) {
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square';
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.035, this.ctx.currentTime + 0.2);
      o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
      o.start(); o2.start();
      this.engine = { o, o2, g, f };
    } else if (!on && this.engine) {
      const e = this.engine; this.engine = null;
      e.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
      e.o.stop(this.ctx.currentTime + 0.25); e.o2.stop(this.ctx.currentTime + 0.25);
    }
    if (on && this.engine) {
      const base = 38 + rev * 75;
      this.engine.o.frequency.setTargetAtTime(base, this.ctx.currentTime, 0.08);
      this.engine.o2.frequency.setTargetAtTime(base * 0.5, this.ctx.currentTime, 0.08);
      this.engine.f.frequency.setTargetAtTime(500 + rev * 900, this.ctx.currentTime, 0.1);
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

  // Two-tone police siren wailing somewhere nearby (level 0 = silent).
  setSiren(level) {
    if (!this.ctx) return;
    if (level > 0 && !this.siren) {
      const o = this.ctx.createOscillator(); o.type = 'square';
      const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.4;
      const lg = this.ctx.createGain(); lg.gain.value = 170;
      o.frequency.value = 760;
      lfo.connect(lg).connect(o.frequency);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
      const g = this.ctx.createGain(); g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master);
      o.start(); lfo.start();
      this.siren = { o, lfo, g };
    }
    if (this.siren) this.siren.g.gain.setTargetAtTime(Math.min(level, 1) * 0.035, this.ctx.currentTime, 0.3);
  }
}
