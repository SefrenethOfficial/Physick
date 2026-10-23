// Your phone (J): missions, texts from Vic, key items, and calls that come in mid-job.

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class Phone {
  constructor(game) {
    this.game = game;
    this.screen = 'home';
    this.call = null; // { from, lines, i, state: 'ringing' | 'live' | 'done', onEnd }
    this.unread = 0;
    this.apps = []; // extra apps: { id, icon, name, render(head), act(cmd, data) }
    const el = (this.el = document.createElement('div'));
    el.id = 'phone';
    el.className = 'hidden';
    el.innerHTML = `<div class="ph-frame"><div class="ph-notch"></div>
      <div class="ph-status"><b class="ph-time"></b><span>●●●● 5G ▮</span></div>
      <div class="ph-screen"></div>
      <div class="ph-homebar" data-a="home"></div></div>`;
    document.body.appendChild(el);
    this.screenEl = el.querySelector('.ph-screen');
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === el) { this.close(); return; }
      const b = e.target.closest('[data-a]');
      if (b) this.act(b.dataset.a, b.dataset);
    });
    // a pill on the HUD while someone's calling
    this.ringEl = document.createElement('div');
    this.ringEl.className = 'ph-ring';
    document.getElementById('hud').appendChild(this.ringEl);
    addEventListener('keydown', (e) => {
      // (ignore the very key press that opened it, which reaches this listener too)
      if (!this.isOpen || e.repeat || e === this.openEvent || performance.now() - this.openedAt < 250) return;
      if (e.code === 'KeyJ' || e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
  }

  addApp(app) { this.apps.push(app); }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  open(screen = this.call?.state === 'ringing' ? 'call' : 'home') {
    this.screen = screen;
    this.openedAt = performance.now();
    this.el.classList.remove('hidden');
    this.game.panelOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
  }

  close() {
    if (this.call?.state === 'live') return; // finish the call first
    this.el.classList.add('hidden');
    this.game.panelOpen = false;
    this.game.lock();
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  // ---- texts and calls ----
  text(from, body, silent = false) {
    const st = this.game.story.state;
    (st.messages ||= []).push({ from, text: body });
    this.game.story.save();
    if (!silent) {
      this.unread++;
      this.game.sfx.play('select');
      this.game.hud.toast(`New message from ${from} — press J`, 0x9ec5ff);
    }
    if (this.isOpen) this.render();
  }

  ring(from, lines, onEnd) {
    this.call = { from, lines, i: 0, state: 'ringing', onEnd, t: 0 };
    this.ringEl.innerHTML = `<i>📱</i><span><b>${esc(from)}</b> is calling…</span><kbd>J</kbd>`;
    this.ringEl.classList.add('on');
  }

  update(dt) {
    const c = this.call;
    if (c?.state === 'ringing') {
      c.t -= dt;
      if (c.t <= 0) { c.t = 1.8; this.game.sfx.play('telegraph'); setTimeout(() => this.game.sfx.play('telegraph'), 180); }
    }
    const t = this.el.querySelector('.ph-time');
    if (t && this.isOpen) t.textContent = this.game.daynight?.timeText || '';
  }

  act(a, data) {
    const s = this.game.story;
    if (a === 'home') { if (this.call?.state !== 'live') { this.screen = 'home'; this.render(); } return; }
    if (a === 'app-act') { this.apps.find((x) => x.id === data.app)?.act(data.cmd, data); if (this.isOpen) this.render(); return; }
    if (a === 'app') { this.screen = data.app; if (data.app === 'messages') this.unread = 0; this.render(); return; }
    if (a === 'start') { this.close(); s.start(data.id); return; }
    if (a === 'abandon') { s.end(false, 'Mission abandoned'); this.render(); return; }
    if (a === 'answer' && this.call) { this.call.state = 'live'; this.call.i = 1; this.ringEl.classList.remove('on'); this.render(); return; }
    if (a === 'next' && this.call) {
      const c = this.call;
      if (c.i < c.lines.length) c.i++;
      if (c.i >= c.lines.length) c.state = 'done';
      this.render();
      return;
    }
    if (a === 'hangup' && this.call) {
      const c = this.call;
      this.call = null;
      this.ringEl.classList.remove('on');
      this.screen = 'home';
      this.close();
      c.onEnd?.();
    }
  }

  render() {
    const s = this.game.story, sc = this.screen;
    let h = '';
    const head = (title) => `<div class="ph-head"><button data-a="home">‹</button><b>${title}</b></div>`;
    if (sc === 'call' && this.call) {
      const c = this.call;
      h = `<div class="ph-call"><div class="ph-avatar">${esc(c.from[0])}</div><b class="ph-caller">${esc(c.from)}</b>`;
      if (c.state === 'ringing') h += `<small>incoming call…</small><div class="ph-callbtns"><button class="ph-green" data-a="answer">Answer</button></div>`;
      else {
        h += '<small>on call</small><div class="ph-lines">' + c.lines.slice(0, c.i).map((l, k) => `<p class="${k === c.i - 1 ? 'new' : ''}">${l}</p>`).join('') + '</div>';
        h += c.state === 'done' ? '<div class="ph-callbtns"><button class="ph-red" data-a="hangup">End call</button></div>' : '<div class="ph-callbtns"><button data-a="next">…</button></div>';
      }
      h += '</div>';
    } else if (sc === 'missions') {
      h = head('Jobs') + '<div class="ph-list">' + s.missionList().map((m) => `<div class="ph-item ${m.state}">
        <div><b>${m.n}. ${esc(m.title)}</b><small>${m.state === 'locked' ? esc(m.lockText) : m.state === 'passed' ? 'Done' : m.state === 'active' ? 'In progress' : 'Ready'}</small></div>
        ${m.canStart ? `<button data-a="start" data-id="${m.id}">${m.state === 'passed' ? 'Replay' : 'Start'}</button>` : ''}</div>`).join('') + '</div>';
      if (s.active) h += '<div class="ph-foot"><button data-a="abandon">Abandon current job</button></div>';
    } else if (this.apps.some((x) => x.id === sc)) {
      h = this.apps.find((x) => x.id === sc).render(head);
    } else if (sc === 'messages') {
      const msgs = s.state.messages || [];
      h = head('Vic') + '<div class="ph-thread">' + (msgs.length ? msgs.map((m) => `<p class="${m.from === 'You' ? 'me' : ''}">${m.text}</p>`).join('') : '<small class="ph-empty">No messages yet.</small>') + '</div>';
    } else if (sc === 'keys') {
      const ids = s.state.keyItems;
      h = head('Key items') + '<div class="ph-list">' + (ids.length ? ids.map((id) => `<div class="ph-item"><div><b>${esc(s.keyItem(id).name)}</b><small>${esc(s.keyItem(id).desc)}</small></div></div>`).join('') : '<small class="ph-empty">Nothing yet.</small>') + '</div>';
    } else {
      const obj = s.active ? `<div class="ph-widget"><small>Current job</small><b>${esc(s.active.m.title)}</b><span>${s.active.text || ''}</span></div>` : '';
      h = `<div class="ph-home"><div class="ph-clock">${this.game.daynight?.timeText || ''}</div>${obj}
        <div class="ph-apps">
          <button data-a="app" data-app="missions"><i>📋</i>Jobs</button>
          <button data-a="app" data-app="messages"><i>💬</i>Messages${this.unread ? `<em>${this.unread}</em>` : ''}</button>
          <button data-a="app" data-app="keys"><i>🔑</i>Key items</button>
          ${this.apps.map((x) => `<button data-a="app" data-app="${x.id}"><i>${x.icon}</i>${x.name}</button>`).join('')}
          ${this.call?.state === 'ringing' ? '<button data-a="app" data-app="call"><i>📞</i>Call</button>' : ''}
        </div><small class="ph-hint">J or Esc to put it away</small></div>`;
    }
    this.screenEl.innerHTML = h;
    this.update(0);
    const th = this.screenEl.querySelector('.ph-thread');
    if (th) th.scrollTop = th.scrollHeight;
  }
}
