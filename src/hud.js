const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// All DOM UI: logo, health, compass, helm readout, prompts, toasts, title and death screens.
export class Hud {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('hud');
    this.el.innerHTML = `
      <img class="hud-logo" src="${import.meta.env.BASE_URL}assets/physick-logo.svg" alt="Physick">
      <div class="health" id="health"><div class="fill"></div><span>100</span></div>
      <div class="armor" id="armor"><i></i></div>
      <div class="compass" id="compass"><div class="strip"></div><div class="needle"></div><b id="hdg">000°</b></div>
      <div class="crosshair"><b></b></div>
      <div class="stats" id="stats"></div>
      <div class="money" id="money"><b>$0</b><i></i><small id="bankamt"></small></div>
      <div class="bagmeter" id="bagmeter"><span>Bag</span><div><i></i></div><b>0/40</b></div>
      <div class="wanted" id="wanted"></div>
      <canvas class="minimap" id="minimap" width="200" height="200"></canvas>
      <div class="banner" id="banner"></div>
      <div class="bigmap" id="bigmap"><canvas></canvas></div>
      <div class="boatpanel" id="boatpanel">
        <div class="row"><span>Boat</span><b id="bname">Dinghy</b></div>
        <div class="row"><span>Speed</span><b id="bspd">0 kn</b></div>
        <div class="row"><span>Hull</span><b id="bhp">100%</b></div>
        <div class="thrbar hull"><i id="bhpbar"></i></div>
      </div>
      <div class="toasts" id="toasts"></div>
      <div class="prompt" id="prompt"></div>
      <div class="helm" id="helm">
        <div class="row"><span>Engines</span><b id="order">AHEAD 2/3</b></div>
        <div class="telegraph" id="telegraph"></div>
        <div class="row"><span>Rudder</span><b id="rudder">MIDSHIPS</b></div>
        <div class="rudderbar"><i id="rudderfill"></i></div>
        <div class="row"><span>Speed</span><b id="knots">0 kn</b></div>
      </div>
      <div class="gunpanel" id="gunpanel">
        <div class="row"><span>Mount</span><b id="gunname">5-inch gun</b></div>
        <div class="row"><span>Bearing</span><b id="gunbrg">000°</b></div>
        <div class="row"><span>Elevation</span><b id="gunelev">0°</b></div>
        <div class="row"><span>Targets destroyed</span><b id="score">0</b></div>
      </div>
      <div class="holding" id="holding"></div>
      <div class="flight" id="flight">
        <div class="row"><span>Speed</span><b id="fspd">0 kn</b></div>
        <div class="row"><span>Altitude</span><b id="falt">0 ft</b></div>
        <div class="row"><span>Climb</span><b id="fvs">0 ft/min</b></div>
        <div class="row"><span>Throttle</span><b id="fthr">0%</b></div>
        <div class="thrbar"><i id="fthrbar"></i></div>
        <div class="row"><span>Gear</span><b id="fgear">DOWN</b></div>
      </div>
      <div class="fpm" id="fpm"></div>
      <div class="warn" id="fwarn"></div>
      <div class="hurt" id="hurt"></div>
      <div class="death" id="death"><h2>You died</h2><p>Respawning…</p></div>
    `;
    const $ = (id) => this.el.querySelector('#' + id);
    this.healthEl = $('health');
    this.hurtEl = $('hurt');
    this.promptEl = $('prompt');
    this.deathEl = $('death');
    this.toastsEl = $('toasts');
    this.statsEl = $('stats');
    this.moneyEl = $('money');
    this.bagEl = $('bagmeter');
    this.wantedEl = $('wanted');
    this.mapEl = $('minimap');
    this.map = this.mapEl.getContext('2d');
    this.bannerEl = $('banner');
    this.boatEl = $('boatpanel');
    this.helmEl = $('helm');
    this.compassStrip = this.el.querySelector('.compass .strip');
    this.hdgEl = $('hdg');
    this.buildCompass();
    this.hurtLevel = 0;
    this.lastHp = -1;
    this.overlay = document.getElementById('overlay');
    this.gunEl = $('gunpanel');
    this.flightEl = $('flight');
    this.fpmEl = $('fpm');
    this.warnEl = $('fwarn');
    this.holdingEl = $('holding');
    this.setMode('deck');
  }

  setMode(mode, gun) {
    this.mode = mode;
    this.helmEl.classList.toggle('on', mode === 'helm');
    this.gunEl.classList.toggle('on', mode === 'gun');
    this.el.classList.toggle('gunning', mode === 'gun');
    this.el.classList.toggle('flying', mode === 'jet');
    this.flightEl.classList.toggle('on', mode === 'jet');
    this.boatEl.classList.toggle('on', mode === 'boat' || mode === 'car');
    this.el.classList.toggle('boating', mode === 'boat' || mode === 'car');
    if (gun) this.gunEl.querySelector('#gunname').textContent = gun.name;
  }

  setGun(gun) {
    const brg = ((Math.round(-gun.yaw.rotation.y * 57.2958) % 360) + 360) % 360;
    this.gunEl.querySelector('#gunbrg').textContent = String(brg).padStart(3, '0') + '° rel';
    this.gunEl.querySelector('#gunelev').textContent = Math.round(gun.pitch.rotation.x * 57.2958) + '°';
  }

  // Flight readout + flight-path marker (screen position of where the jet is heading).
  setFlight(jet, camera) {
    const $ = (id) => this.flightEl.querySelector('#' + id);
    $('fspd').textContent = `${Math.round(jet.airspeed * 1.944)} kn`;
    $('falt').textContent = `${Math.round(jet.pos.y * 3.281)} ft`;
    $('fvs').textContent = `${Math.round(jet.vel.y * 196.85 / 10) * 10} ft/min`;
    $('fthr').textContent = jet.ab ? 'AB' : `${Math.round(jet.throttle * 100)}%`;
    $('fthrbar').style.width = `${jet.throttle * 100}%`;
    $('fthrbar').classList.toggle('ab', jet.ab);
    $('fgear').textContent = jet.gearDown ? 'DOWN' : 'UP';
    const p = jet.pos.clone().addScaledVector(jet.onGround || jet.vel.lengthSq() < 4 ? jet.fwd : jet.vel.clone().normalize(), 400).project(camera);
    const vis = p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
    this.fpmEl.style.display = vis ? 'block' : 'none';
    if (vis) this.fpmEl.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px)`;
    let warn = '';
    if (!jet.onGround && jet.stall) warn = 'STALL';
    else if (!jet.onGround && jet.pos.y < 120 && jet.vel.y < -25) warn = 'PULL UP';
    else if (!jet.onGround && !jet.gearDown && jet.pos.y < 60 && jet.airspeed < 90) warn = 'GEAR';
    if (this.warnEl.textContent !== warn) this.warnEl.textContent = warn;
    this.warnEl.classList.toggle('on', !!warn);
  }

  setScore(n) { this.gunEl.querySelector('#score').textContent = n; }

  setHolding(name) {
    this.holdingEl.innerHTML = name ? `Holding <b>${name}</b>` : '';
    this.holdingEl.classList.toggle('on', !!name);
  }

  buildCompass() {
    const marks = [];
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n];
      const label = card ?? (n % 45 === 0 ? String(n) : '|');
      marks.push(`<span style="left:${(d + 360) * 4}px" class="${card ? 'card' : ''}">${label}</span>`);
    }
    this.compassStrip.innerHTML = marks.join('');
  }

  // deg: compass heading (0 = north, 90 = east)
  setHeading(deg) {
    const d = ((deg % 360) + 360) % 360;
    this.compassStrip.style.transform = `translateX(${-(d + 360) * 4 + 200}px)`;
    this.hdgEl.textContent = String(Math.round(d) % 360).padStart(3, '0') + '°';
  }

  setShip(ship, speeds) {
    const tele = speeds.map((s, i) => `<i class="${i === ship.telegraph ? 'on' : ''}">${s.name}</i>`).join('');
    if (this._tele !== tele) { this.helmEl.querySelector('#telegraph').innerHTML = tele; this._tele = tele; }
    this.helmEl.querySelector('#order').textContent = ship.order.name;
    const deg = Math.round(ship.rudder * 35);
    this.helmEl.querySelector('#rudder').textContent = deg === 0 ? 'MIDSHIPS' : `${Math.abs(deg)}° ${deg > 0 ? 'STBD' : 'PORT'}`;
    const f = this.helmEl.querySelector('#rudderfill');
    f.style.left = deg >= 0 ? '50%' : `${50 + ship.rudder * 50}%`;
    f.style.width = `${Math.abs(ship.rudder) * 50}%`;
    f.classList.toggle('port', deg < 0);
    this.helmEl.querySelector('#knots').textContent = `${(ship.speed * 1.944).toFixed(1)} kn`;
  }

  setHealth(frac, hp) {
    if (hp === this.lastHp) return;
    this.lastHp = hp;
    this.healthEl.querySelector('.fill').style.width = `${frac * 100}%`;
    this.healthEl.querySelector('span').textContent = hp;
    this.healthEl.classList.toggle('low', frac < 0.3);
  }

  hurt(level) {
    this.hurtLevel = Math.min(this.hurtLevel + 0.35 + level * 0.6, 1);
    this.hurtEl.style.opacity = this.hurtLevel;
    this.healthEl.classList.remove('hit');
    void this.healthEl.offsetWidth;
    this.healthEl.classList.add('hit');
  }

  frame(dt) {
    if (this.hurtLevel > 0) {
      this.hurtLevel = Math.max(this.hurtLevel - dt * 1.4, 0);
      this.hurtEl.style.opacity = this.hurtLevel;
    }
  }

  showDeath(show, msg = 'You died') {
    this.deathEl.classList.toggle('on', show);
    this.deathEl.querySelector('h2').textContent = msg;
  }

  setPrompt(html) {
    if (this._prompt === html) return;
    this._prompt = html;
    this.promptEl.innerHTML = html || '';
    this.promptEl.classList.toggle('on', !!html);
  }

  toast(text, color = 0xffffff) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    t.style.setProperty('--c', hex(color));
    this.toastsEl.prepend(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2300);
  }

  setStats(fps) {
    this.statsEl.textContent = `${fps} FPS`;
  }

  setArmor(f) {
    const k = Math.round(f * 100);
    if (k === this._armor) return;
    this._armor = k;
    const el = this.el.querySelector('#armor');
    el.classList.toggle('on', k > 0);
    el.querySelector('i').style.width = `${k}%`;
  }

  setMoney(n, delta = 0) {
    this.moneyEl.querySelector('b').textContent = `$${n.toLocaleString()}`;
    if (delta) {
      const i = this.moneyEl.querySelector('i');
      i.textContent = `${delta > 0 ? '+' : '-'}$${Math.abs(Math.round(delta)).toLocaleString()}`;
      i.className = delta > 0 ? 'up' : 'down';
      void i.offsetWidth;
      i.classList.add('show');
    }
  }

  setBank(n) {
    const el = this.el.querySelector('#bankamt');
    const t = n > 0 ? `bank $${n.toLocaleString()}` : '';
    if (el.textContent !== t) el.textContent = t;
  }

  setBag(w, cap) {
    this.bagEl.querySelector('i').style.width = `${Math.min(w / cap, 1) * 100}%`;
    this.bagEl.querySelector('b').textContent = `${Math.round(w)}/${cap}`;
    this.bagEl.classList.toggle('full', w >= cap - 0.5);
  }

  // Wanted stars; flashing while the police are searching rather than watching you.
  // bust: 0..1 progress of an officer cuffing you.
  setWanted(n, searching, bust = 0) {
    const key = `${n}|${searching}|${Math.round(bust * 20)}`;
    if (key === this._wanted) return;
    this._wanted = key;
    let html = '';
    for (let k = 1; k <= 5; k++) html += `<span class="${k <= n ? 'on' : ''}">★</span>`;
    if (bust > 0.05) html += `<div class="cuff"><i style="width:${Math.min(bust, 1) * 100}%"></i><em>Being arrested — get away!</em></div>`;
    this.wantedEl.innerHTML = html;
    this.wantedEl.classList.toggle('active', n > 0);
    this.wantedEl.classList.toggle('searching', n > 0 && searching);
  }

  setBoat(b) {
    const $ = (id) => this.boatEl.querySelector('#' + id);
    $('bname').textContent = b.type.name;
    const rows = this.boatEl.querySelectorAll('.row');
    rows[0].querySelector('span').textContent = b.type.car ? 'Car' : 'Boat';
    rows[2].querySelector('span').textContent = b.type.car ? 'Body' : 'Hull';
    $('bspd').textContent = `${Math.round(Math.abs(b.speed) * 1.944)} kn`;
    const f = Math.max(b.hp, 0) / b.type.hp;
    $('bhp').textContent = `${Math.round(f * 100)}%`;
    $('bhpbar').style.width = `${f * 100}%`;
    $('bhpbar').classList.toggle('low', f < 0.3);
  }

  boatHit() {
    this.boatEl.classList.remove('hit');
    void this.boatEl.offsetWidth;
    this.boatEl.classList.add('hit');
  }

  flashBanner(text, color = '#ffd166') {
    this.bannerEl.textContent = text;
    this.bannerEl.style.color = color;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  get bigMapOpen() { return this.el.querySelector('#bigmap').classList.contains('on'); }
  toggleBigMap(on = !this.bigMapOpen) { this.el.querySelector('#bigmap').classList.toggle('on', on); this.bigZoom = this.bigZoom || 1; }

  // Full map (M): every island, road and place of interest, with you and the police on it.
  // zoom 1 shows the whole archipelago; zooming in centres on you.
  drawBigMap(info) {
    const wrap = this.el.querySelector('#bigmap'), cv = wrap.querySelector('canvas');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const Wc = innerWidth, Hc = innerHeight;
    if (cv.width !== Wc * dpr || cv.height !== Hc * dpr) { cv.width = Wc * dpr; cv.height = Hc * dpr; cv.style.width = Wc + 'px'; cv.style.height = Hc + 'px'; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wc, Hc);
    const b = info.bounds, zoom = this.bigZoom || 1;
    const fit = Math.min((Wc - 80) / (b.x1 - b.x0), (Hc - 120) / (b.z1 - b.z0));
    const s = fit * zoom;
    const cx = zoom === 1 ? (b.x0 + b.x1) / 2 : info.x, cz = zoom === 1 ? (b.z0 + b.z1) / 2 : info.z;
    const X = (x) => Wc / 2 + (x - cx) * s, Z = (z) => Hc / 2 + 10 + (z - cz) * s;
    g.fillStyle = '#16405e'; g.fillRect(0, 0, Wc, Hc);
    // waves texture-ish
    g.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < Hc; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(Wc, y + 6); g.stroke(); }
    const rect = (r, col) => { g.fillStyle = col; g.fillRect(X(r.x0), Z(r.z0), Math.max((r.x1 - r.x0) * s, 1), Math.max((r.z1 - r.z0) * s, 1)); };
    const ICOL = { city: '#9a968e', town: '#6f9a4f', park: '#2f5a2a', airport: '#6c8a55', naval: '#7d7a70', hood: '#5f594d' };
    for (const isl of info.islands) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X(isl.x0) + 3, Z(isl.z0) + 3, (isl.x1 - isl.x0) * s, (isl.z1 - isl.z0) * s); }
    for (const isl of info.islands) rect(isl, ICOL[isl.id] || '#7d7a70');
    for (const r of info.rects || []) rect(r, r.color);
    for (const p of info.piers) rect(p, '#a07d55');
    for (const r of info.roads) rect(r, '#55585e');
    for (const l of info.lines || []) { g.strokeStyle = l.color; g.lineWidth = Math.max(2, l.w * s); g.lineCap = 'round'; g.beginPath(); l.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
    g.strokeStyle = '#8a6a3a'; g.lineWidth = Math.max(1, 3 * s);
    for (const line of info.trails || []) { g.beginPath(); line.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
    // island names
    g.textAlign = 'center';
    for (const isl of info.islands) {
      g.font = `bold ${Math.max(12, Math.min(22, 14 * Math.sqrt(zoom)))}px "Chakra Petch", Arial, sans-serif`;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(isl.name.toUpperCase(), X((isl.x0 + isl.x1) / 2) + 1, Z(isl.z0) - 7);
      g.fillStyle = '#fff'; g.fillText(isl.name.toUpperCase(), X((isl.x0 + isl.x1) / 2), Z(isl.z0) - 8);
    }
    // places
    g.font = `${zoom > 1 ? 12 : 10}px Arial`;
    for (const m of info.pois) {
      const px = X(m.x), pz = Z(m.z);
      if (px < -20 || px > Wc + 20 || pz < -20 || pz > Hc + 20) continue;
      g.fillStyle = '#000'; g.beginPath(); g.arc(px, pz, (m.r || 4) + 1.5, 0, 7); g.fill();
      g.fillStyle = m.color; g.beginPath(); g.arc(px, pz, m.r || 4, 0, 7); g.fill();
      if (m.label && (zoom > 1 || m.big)) { g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(m.label, px + 1, pz - 7); g.fillStyle = '#fff'; g.fillText(m.label, px, pz - 8); }
    }
    for (const m of info.marks) { g.fillStyle = m.color; g.beginPath(); g.arc(X(m.x), Z(m.z), m.r || 3, 0, 7); g.fill(); }
    // you
    g.save(); g.translate(X(info.x), Z(info.z)); g.rotate(-info.yaw);
    g.fillStyle = '#ffd166'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // title and legend
    g.textAlign = 'left';
    g.font = 'bold 22px "Chakra Petch", Arial, sans-serif'; g.fillStyle = '#fff'; g.fillText('MAP', 24, 36);
    g.font = '13px Arial'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(`M close · mouse wheel zoom (${zoom}×)`, 80, 35);
    const legend = [['#ffd166', 'You'], ['#ffd166', 'Pawn shop'], ['#2fd38a', 'Bank / ATM'], ['#7fd3ff', 'Boat sales'], ['#ff5a4a', 'Arms dealer'], ['#d48aff', 'Fence'], ['#ffb36b', 'Chop shop'], ['#ff6a6a', 'Hospital'], ['#4a7dff', 'Police'], ['#7be08a', 'Your boats / cars']];
    legend.forEach(([c, t], i) => { const y = Hc - 24 - (legend.length - 1 - i) * 17; g.fillStyle = c; g.beginPath(); g.arc(30, y - 4, 5, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText(t, 42, y); });
  }

  // Minimap: north up, centred on you. islands, piers, boats, police, and your heading.
  drawMap(info) {
    const g = this.map, W = 200, S = info.scale; // metres per pixel
    const cx = info.x, cz = info.z;
    const X = (x) => W / 2 + (x - cx) / S, Z = (z) => W / 2 + (z - cz) / S;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#1d4a6b'; g.fillRect(0, 0, W, W);
    for (const isl of info.islands) {
      g.fillStyle = isl.id === 'town' ? '#5f8a45' : isl.id === 'city' ? '#8f8b84' : isl.id === 'park' ? '#2f5a2a' : isl.id === 'airport' ? '#5f7a4a' : isl.id === 'hood' ? '#5a5448' : '#7d7a70';
      g.fillRect(X(isl.x0), Z(isl.z0), (isl.x1 - isl.x0) / S, (isl.z1 - isl.z0) / S);
    }
    g.fillStyle = '#55585e';
    for (const r of info.roads || []) g.fillRect(X(r.x0), Z(r.z0), Math.max((r.x1 - r.x0) / S, 1), Math.max((r.z1 - r.z0) / S, 1));
    for (const l of info.lines || []) { g.strokeStyle = l.color; g.lineWidth = Math.max(2, l.w / S); g.lineCap = 'round'; g.beginPath(); l.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
    g.fillStyle = '#a07d55';
    for (const p of info.piers) g.fillRect(X(p.x0), Z(p.z0), Math.max((p.x1 - p.x0) / S, 1), Math.max((p.z1 - p.z0) / S, 1));
    for (const m of info.marks) {
      g.fillStyle = m.color;
      g.beginPath(); g.arc(X(m.x), Z(m.z), m.r || 3, 0, Math.PI * 2); g.fill();
      if (m.label) { g.font = 'bold 10px sans-serif'; g.fillStyle = '#fff'; g.fillText(m.label, X(m.x) + 5, Z(m.z) + 3); }
    }
    g.restore();
    // you
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(-info.yaw);
    g.fillStyle = '#ffd166'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3;
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('N', W / 2, 14); g.textAlign = 'start';
  }

  showOverlay(show, first = false) {
    this.overlay.classList.toggle('hidden', !show);
    this.el.classList.toggle('hidden', show);
    this.overlay.querySelector('.play').textContent = first ? 'Click to play' : 'Click to resume';
  }
}
