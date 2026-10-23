import * as THREE from 'three';

// Time of day and the weather. A full day takes 24 real minutes (one game hour a minute): the sun
// crosses the sky, sunsets go orange, nights are moonlit blue with stars, street lamps light up
// and cars put their headlights on. The weather drifts between clear, cloudy, rain (slippery
// roads, wet sound) and thick fog every few hours.

const KEYS = [ // hour: sky top, horizon, fog, light colour, light power, ambient, exposure
  [0, 0x070c22, 0x16203c, 0x121a30, 0x9ab0ff, 0.45, 0.42, 0.95],
  [5.2, 0x070c22, 0x16203c, 0x121a30, 0x9ab0ff, 0.45, 0.42, 0.95],
  [6.3, 0x36508e, 0xf0a070, 0xd29a80, 0xffb070, 1.5, 0.8, 1],
  [8, 0x4a83c4, 0xcbdbe7, 0xcbdbe7, 0xfff1dc, 2.8, 1.4, 1],
  [17, 0x4a83c4, 0xcbdbe7, 0xcbdbe7, 0xfff1dc, 2.8, 1.4, 1],
  [18.6, 0x34468a, 0xff8a50, 0xc88070, 0xff9050, 1.5, 0.8, 1],
  [19.6, 0x121838, 0x4a3a5a, 0x2a2a40, 0x9ab0ff, 0.4, 0.5, 0.95],
  [21, 0x070c22, 0x16203c, 0x121a30, 0x9ab0ff, 0.45, 0.42, 0.95],
  [24, 0x070c22, 0x16203c, 0x121a30, 0x9ab0ff, 0.45, 0.42, 0.95],
];
export const WEATHER = {
  clear: { name: 'Clear', icon: '☀', cloud: 0, rain: 0, fog: 1 },
  cloudy: { name: 'Cloudy', icon: '☁', cloud: 0.55, rain: 0, fog: 0.85 },
  rain: { name: 'Rain', icon: '🌧', cloud: 0.9, rain: 1, fog: 0.3 },
  storm: { name: 'Storm', icon: '⛈', cloud: 1, rain: 1.6, fog: 0.2 },
  fog: { name: 'Fog', icon: '🌫', cloud: 0.7, rain: 0, fog: 0.05 },
};
const ROLL = [['clear', 0.45], ['cloudy', 0.2], ['rain', 0.17], ['storm', 0.06], ['fog', 0.12]];
const GREY = new THREE.Color(0x5c6268);
const SAVE = 'physick.clock.v1';

const c3 = (h) => new THREE.Color(h);

export class DayNight {
  constructor(game) {
    this.game = game;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { /* none */ }
    this.hour = saved?.hour ?? 10;
    this.kind = saved?.weather && WEATHER[saved.weather] ? saved.weather : 'clear';
    this.w = { ...WEATHER[this.kind] }; // the current (blended) weather
    this.nextChange = 3 + Math.random() * 4; // game hours until the weather changes
    this.rate = 1 / 60; // game hours per real second
    this.saveT = 0;
    this.flash = 0;
    this.buildStars();
    this.buildRain();
    this.buildLampPools();
    this.clock = document.createElement('div');
    this.clock.id = 'clock';
    (document.getElementById('hud') || document.body).appendChild(this.clock);
    this.applyT = 0;
  }

  buildStars() {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95);
      pos.set([Math.sin(v) * Math.cos(u) * 2600, Math.cos(v) * 2600, Math.sin(v) * Math.sin(u) * 2600], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.renderOrder = -0.5;
    this.game.sky.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: 0xf2f0e4, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.game.sky.add(this.moon);
  }

  buildRain() {
    const n = 3000, pos = new Float32Array(n * 6);
    this.drops = [];
    for (let i = 0; i < n; i++) this.drops.push(new THREE.Vector3((Math.random() - 0.5) * 70, Math.random() * 36, (Math.random() - 0.5) * 70));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.game.scene.add(this.rain);
  }

  // a pool of light under every street lamp, on at night (follows the lamps: gone when one's knocked over)
  buildLampPools() {
    const B = this.game.breakables;
    if (!B?.meshes?.lamp) return;
    const lamps = B.items.filter((b) => b.type === 'lamp');
    const geo = new THREE.CircleGeometry(4.2, 24).rotateX(-Math.PI / 2).translate(0, 0.07, 0);
    this.poolMat = new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
    const im = new THREE.InstancedMesh(geo, this.poolMat, Math.max(1, lamps.length));
    im.count = lamps.length;
    im.userData.noMerge = true;
    im.visible = false;
    this.game.scene.add(im);
    B.meshes.lamp.push(im);
    for (const b of lamps) B.show(b, !b.broken);
    im.computeBoundingSphere();
    this.pools = im;
  }

  get night() { // 0 by day .. 1 at night
    const h = this.hour;
    if (h >= 7.2 && h <= 17.6) return 0;
    if (h > 20.2 || h < 5.2) return 1;
    return h < 12 ? THREE.MathUtils.smoothstep(7.2 - h, 0, 2) : THREE.MathUtils.smoothstep(h - 17.6, 0, 2.6);
  }
  get grip() { return 1 - Math.min(0.35, this.w.rain * 0.3); }
  get timeText() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

  sample(h) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1], k = (h - a[0]) / (b[0] - a[0] || 1);
    const col = (j) => c3(a[j]).lerp(c3(b[j]), k);
    const num = (j) => a[j] + (b[j] - a[j]) * k;
    return { top: col(1), horizon: col(2), fog: col(3), light: col(4), power: num(5), amb: num(6), exp: num(7) };
  }

  setWeather(kind) {
    this.kind = kind;
    this.nextChange = 3 + Math.random() * 5;
    const g = this.game;
    if (g.started) g.hud.toast(`Weather: ${WEATHER[kind].name.toLowerCase()}`, 0x9ec5ff);
    g.news?.add(`Weather update: ${{ clear: 'clearing up nicely', cloudy: 'clouds rolling in', rain: 'rain moving in, roads will be slick', storm: 'a storm is hitting Verian, stay off the bridge', fog: 'thick fog over the strait' }[kind]}.`, 'weather');
  }

  update(dt) {
    const g = this.game;
    if (!g.started || g.title?.active) dt = 0; // the clock waits for you
    const was = this.hour;
    this.hour = (this.hour + dt * this.rate) % 24;
    if (this.hour < was) this.dayCount = (this.dayCount || 0) + 1;
    this.nextChange -= dt * this.rate;
    if (this.nextChange <= 0) { let r = Math.random(), pick = 'clear'; for (const [k, p] of ROLL) { if ((r -= p) <= 0) { pick = k; break; } } this.setWeather(pick); }
    // blend the weather in over ~20 s
    const W = WEATHER[this.kind], bk = Math.min(1, dt / 20);
    for (const k of ['cloud', 'rain', 'fog']) this.w[k] += (W[k] - this.w[k]) * bk;
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 10; try { localStorage.setItem(SAVE, JSON.stringify({ hour: this.hour, weather: this.kind })); } catch { /* ignore */ } }
    this.clock.textContent = `${this.timeText} ${W.icon}`;
    this.clock.style.display = g.started && !g.title?.active ? '' : 'none';
    // lightning in a storm
    if (this.kind === 'storm' && Math.random() < dt * 0.06) { this.flash = 1; setTimeout(() => g.sfx.noise?.(2.2, 0.35, 120, 0.4), 400 + Math.random() * 1500); }
    this.flash = Math.max(0, this.flash - dt * 4);
    this.apply(dt);
    this.updateRain(dt);
  }

  apply() {
    const g = this.game, under = !!g.underMode;
    const s = this.sample(this.hour), w = this.w, night = this.night;
    // the sun (or the moon) goes round
    const day = (this.hour - 6) / 12; // 0 sunrise .. 1 sunset
    const sunUp = day > 0 && day < 1;
    const elev = sunUp ? Math.sin(day * Math.PI) * 1.05 + 0.04 : Math.sin(((this.hour + 6) % 24) / 12 * Math.PI) * 0.9 + 0.1;
    const az = (this.hour / 24) * Math.PI * 2 + 0.6;
    const dir = new THREE.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
    this.dir = dir;
    // overcast: everything greys out and dims
    const top = s.top.clone().lerp(GREY.clone().multiplyScalar(1 - night * 0.8), Math.min(1, w.cloud * 0.95));
    const hor = s.horizon.clone().lerp(GREY.clone().multiplyScalar(1.35 - night * 1.05), Math.min(1, w.cloud * 0.95));
    const fog = s.fog.clone().lerp(GREY.clone().multiplyScalar(1.35 - night * 1.05), Math.min(1, w.cloud * 0.95));
    if (this.flash > 0) { top.lerp(c3(0xdde6ff), this.flash * 0.7); hor.lerp(c3(0xdde6ff), this.flash * 0.7); }
    // the sky dome (shares the SUN vector with the sun light's position)
    const su = g.sky.material.uniforms;
    su.top.value.copy(top); su.horizon.value.copy(hor);
    su.sun.value.copy(dir).multiplyScalar(1);
    if (!sunUp || w.cloud > 0.7) su.sun.value.set(0, -1, 0); // no sun disc at night / under cloud
    g.sunDir = dir;
    this.stars.material.opacity = night * (1 - w.cloud) * 0.95;
    const moonDir = dir.clone();
    this.moon.position.copy(moonDir.multiplyScalar(2500)); this.moon.lookAt(0, 0, 0);
    this.moon.material.opacity = sunUp ? 0 : night * (1 - w.cloud * 0.9);
    // the ocean
    const ou = g.ocean.uniforms;
    ou.uSun.value.copy(dir); ou.uSkyTop.value.copy(top); ou.uSkyHorizon.value.copy(hor); ou.uFogColor.value.copy(fog);
    const v = g.view || { fogNear: 180, fogFar: 2400 };
    ou.uFogNear.value = v.fogNear * w.fog; ou.uFogFar.value = v.fogFar * w.fog;
    // lamps, pools of light, headlights
    const lampOn = Math.max(night, w.cloud > 0.8 ? 0.35 : 0);
    if (g.breakables?.mat?.head) g.breakables.mat.head.emissiveIntensity = 0.7 + lampOn * 2.8;
    if (this.pools) { this.poolMat.opacity = lampOn * 0.22; this.pools.visible = lampOn > 0.05 && !under; }
    this.lampOn = lampOn;
    const lights = lampOn > 0.3;
    for (const c of g.vehicles.all) if (c.headlights) c.headlights.visible = lights && !c.wreck;
    if (under) return; // the lab / a home sets its own light
    g.sun.color.copy(s.light); g.sun.intensity = s.power * (1 - w.cloud * 0.78) + this.flash * 2;
    g.hemi.intensity = s.amb * (1 - w.cloud * 0.25) + this.flash * 1.5;
    g.hemi.color.set(0xd6e6ff).lerp(c3(0x6a7aa8), night);
    g.hemi.groundColor.set(0x2a4a5e).lerp(c3(0x101820), night);
    g.renderer.toneMappingExposure = s.exp;
    g.scene.fog.color.copy(fog);
    g.scene.fog.near = v.fogNear * Math.max(0.03, w.fog);
    g.scene.fog.far = v.fogFar * w.fog;
  }

  updateRain(dt) {
    const g = this.game, on = this.w.rain > 0.05 && !g.underMode && g.started;
    this.rain.visible = on;
    g.sfx.setRain?.(on ? Math.min(1, this.w.rain) : 0);
    if (!on) return;
    const cp = g.camera.position, a = this.rain.geometry.attributes.position, fall = 28 * dt, n = Math.floor(this.drops.length * Math.min(1, this.w.rain));
    const slant = 0.12;
    this.rain.material.opacity = 0.25 + 0.25 * Math.min(1, this.w.rain);
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.y -= fall; d.x += fall * slant;
      if (d.y < -4) { d.y += 40; d.x = (Math.random() - 0.5) * 70; d.z = (Math.random() - 0.5) * 70; }
      if (i >= n) { a.setXYZ(i * 2, 0, -999, 0); a.setXYZ(i * 2 + 1, 0, -999, 0); continue; }
      const x = cp.x + d.x, y = cp.y + d.y - 6, z = cp.z + d.z;
      a.setXYZ(i * 2, x, y, z); a.setXYZ(i * 2 + 1, x - 0.06, y + 0.7, z);
    }
    a.needsUpdate = true;
  }
}
