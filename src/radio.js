// The car radio. R flips through the stations whenever you're driving (or flying). The music
// stations are "live": tune away and back and the song has carried on without you. Talk Verian
// is a phone-in show whose host reads out the news, and the news is mostly you.

const HOST = 'Dale';
const BANTER = [
  'You\'re listening to Talk Verian, eighty-eight point nine. I\'m Dale Marsh, and the phone lines are open.',
  'Caller on line two says the bridge tolls should be abolished. Caller, there are no bridge tolls. There never have been.',
  'Reminder: Verian Motors has a sale on. Not sponsored, I just want a Stiletto and somebody to buy it for me.',
  'Somebody keeps calling in to say the ice cream parlour on the plaza is haunted. It is closed, madam. It has been closed for weeks.',
  'If you\'re out in Cherry Estate tonight, the ranger asks you kindly to stop feeding the hikers.',
  'Traffic now: the Saltmarsh Gate Bridge is moving, the Hollows is not, and the plaza is full of people taking photos of a pigeon.',
  'Our producer wants me to remind you that Talk Verian does not endorse grand theft auto. Our producer drives a Pico.',
  'We had a caller earlier who said he saw a man with a robot arm carry a vending machine down Main Street. Sir, that\'s just Tuesday.',
  'Let\'s go to the phones. Barb, you\'re on Talk Verian. Barb? We lost Barb.',
  'Weather fans, I\'m told it\'s doing something outside. I haven\'t been outside since nineteen ninety-eight.',
];
const NEWS_INTROS = ['This just in.', 'News desk, quickly.', 'Breaking on Talk Verian.', 'Here\'s one for you.', 'Now, I\'m reading this off the wire.'];
const NEWS_OUTROS = ['Unbelievable.', 'What is happening to this city?', 'Lock your doors, folks.', 'Somebody call somebody.', 'I need a coffee.', 'And they wonder why I don\'t go outside.'];

export class Radio {
  constructor(game, base) {
    this.game = game;
    const T = (file) => `${base}assets/music/${file}`;
    this.stations = [
      { name: 'Off' },
      { name: 'Verian FM 101.3', tracks: [T('main-menu.mp3')], vol: 0.45 },
      { name: 'Pursuit 94.7', tracks: [T('chase-on-foot.mp3'), T('starvation-pursuer.mp3'), T('oversized.mp3')], vol: 0.45 },
      { name: 'Static Lab 66.6', tracks: [T('true-lab.mp3')], vol: 0.45 },
      { name: 'Talk Verian 88.9', talk: true },
    ];
    this.index = 1;
    this.epoch = performance.now() / 1000 - Math.random() * 600; // the stations have been broadcasting a while
    this.el = new Audio();
    this.el.preload = 'none';
    this.cur = null; // the url loaded
    this.vol = 0;
    this.talkT = 2;
    this.on = false;
    this.speaking = false;
  }

  get station() { return this.stations[this.index]; }

  next() {
    this.index = (this.index + 1) % this.stations.length;
    this.cur = null;
    this.stopTalk();
    this.game.hud.toast(`📻 ${this.station.name}`, 0xe8c547);
    this.talkT = 0.6;
  }

  // which track is playing on a station right now, and how far in (a looping "broadcast")
  tune(st) {
    const now = performance.now() / 1000 - this.epoch;
    const len = st.len || 200;
    const slot = Math.floor(now / len);
    const url = st.tracks[slot % st.tracks.length];
    return { url, at: now % len };
  }

  stopTalk() {
    if (this.speaking && window.speechSynthesis) window.speechSynthesis.cancel();
    this.speaking = false;
  }

  say(text, { pitch = 1, rate = 1.02 } = {}) {
    const ss = window.speechSynthesis;
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return false;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = pitch; u.rate = rate; u.volume = this.game.sfx.muffled ? 0.3 : 0.85;
    const voices = ss.getVoices().filter((v) => /en/i.test(v.lang));
    if (voices.length) u.voice = voices[0];
    u.onend = () => { this.speaking = false; };
    this.speaking = true;
    ss.speak(u);
    return true;
  }

  // what Dale says next: fresh news first, otherwise a bit of chat
  talkLine() {
    const g = this.game, it = g.news?.next();
    if (it) return `${NEWS_INTROS[Math.floor(Math.random() * NEWS_INTROS.length)]} ${it.text} ${NEWS_OUTROS[Math.floor(Math.random() * NEWS_OUTROS.length)]}`;
    const w = g.police.wanted;
    if (w >= 6 && Math.random() < 0.6) return `I've got the police scanner on in the studio and it is going berserk. ${w} units... no, ${w} STARS? Is that a thing? Helicopters over ${g.news?.place(g.vehicles.active?.pos) || 'the city'} right now.`;
    if (g.daynight && Math.random() < 0.3) return `It's ${g.daynight.timeText} on Talk Verian${g.daynight.kind === 'rain' || g.daynight.kind === 'storm' ? ', and it is chucking it down out there. Slow down on those roads' : ''}.`;
    return BANTER[Math.floor(Math.random() * BANTER.length)];
  }

  update(dt) {
    const g = this.game, v = g.vehicles.active;
    const music = g.settings.music && !g.health.dead;
    // on in a car (or the chopper), unless the chase music has taken over
    const want = !!v && g.started && music && !g.title?.active && this.index > 0;
    const duck = g.music.vol > 0.05; // a chase theme is playing: the radio drops right down
    const st = this.station;
    if (want && !this.on) { this.on = true; this.cur = null; this.talkT = 1; g.hud.toast(`📻 ${st.name} · R to change station`, 0xe8c547); }
    if (!want && this.on) { this.on = false; this.stopTalk(); }
    if (st.tracks && this.on) {
      const { url, at } = this.tune(st);
      if (this.cur !== url) {
        this.cur = url;
        this.el.src = url;
        this.el.currentTime = 0;
        this.el.onloadedmetadata = () => { if (this.el.duration) { st.len = this.el.duration; const t = this.tune(st); if (t.url === this.cur) this.el.currentTime = Math.min(this.el.duration - 0.5, t.at); } };
        this.el.play().catch(() => {});
      } else if (this.el.paused) this.el.play().catch(() => {});
    }
    const target = this.on && st.tracks ? st.vol * (duck ? 0.08 : 1) * (g.sfx.muffled ? 0.5 : 1) : 0;
    this.vol += Math.sign(target - this.vol) * Math.min(Math.abs(target - this.vol), dt * 0.8);
    this.el.volume = Math.max(0, Math.min(1, this.vol));
    if (this.vol <= 0.001 && !this.el.paused) this.el.pause();
    // the talk show
    if (st.talk && this.on && !duck) {
      this.talkT -= dt;
      if (this.talkT <= 0 && !this.speaking) {
        this.talkT = 2.5 + Math.random() * 3;
        const line = this.talkLine();
        if (!this.say(line)) { this.talkT = 9; g.hud.toast(`📻 ${HOST}: "${line}"`, 0xe8c547); } // no voices on this browser: show it instead
      }
    } else if (this.speaking && (!this.on || duck)) this.stopTalk();
  }
}
