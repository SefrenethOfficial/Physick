import * as THREE from 'three';

// Gerstner ocean. The same wave set runs in the vertex shader (for the surface you see)
// and on the CPU in heightAt() (so the ship heaves and rolls on the waves you see).

const G = 9.81;
// [direction (radians), wavelength (m), amplitude (m), steepness 0..1]
const WAVES = [
  [0.35, 64, 0.62, 0.45],
  [1.05, 37, 0.36, 0.55],
  [-0.55, 23, 0.2, 0.6],
  [2.1, 14, 0.1, 0.5],
];
// Shorter ripples only perturb the normals in the fragment shader.
const DETAIL = [
  [0.8, 8.5, 0.05],
  [-1.3, 5.3, 0.035],
  [2.6, 3.1, 0.02],
  [0.1, 1.9, 0.012],
];

const f5 = (n) => n.toFixed(5);
const waveDefs = WAVES.map(([a, L, A, Q], i) => {
  const k = (2 * Math.PI) / L;
  return `const vec4 W${i} = vec4(${f5(Math.cos(a))}, ${f5(Math.sin(a))}, ${f5(k)}, ${f5(Math.sqrt(G * k))});\nconst vec2 A${i} = vec2(${f5(A)}, ${f5(Q)});`;
}).join('\n');
const detailDefs = DETAIL.map(([a, L, A], i) => {
  const k = (2 * Math.PI) / L;
  return `const vec4 D${i} = vec4(${f5(Math.cos(a))}, ${f5(Math.sin(a))}, ${f5(k)}, ${f5(Math.sqrt(G * k))});\nconst float DA${i} = ${f5(A)};`;
}).join('\n');

// Hull plan shape shared with ship.js: half-beam at t (0 = bow, 1 = stern).
export const SHIP_LEN = 110;
export const SHIP_BEAM = 7.2;
export function halfBeam(t) {
  if (t <= 0 || t >= 1.0001) return 0;
  const bow = Math.min(1, Math.pow(t / 0.38, 0.62));
  const stern = t > 0.8 ? 1 - (t - 0.8) * 0.45 : 1;
  return SHIP_BEAM * bow * stern;
}

const vert = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCam;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;

  void gerstner(vec4 d, vec2 aq, vec2 p, float fade, inout vec3 pos, inout vec3 tx, inout vec3 tz, inout float crest) {
    float A = aq.x * fade, Q = aq.y;
    float f = d.z * dot(d.xy, p) - d.w * uTime;
    float s = sin(f), c = cos(f);
    float qa = Q * A;
    pos.x += qa * d.x * c;
    pos.z += qa * d.y * c;
    pos.y += A * s;
    float wa = d.z * A;
    tx += vec3(-Q * d.x * d.x * wa * s, d.x * wa * c, -Q * d.x * d.y * wa * s);
    tz += vec3(-Q * d.x * d.y * wa * s, d.y * wa * c, -Q * d.y * d.y * wa * s);
    crest += s * A;
  }

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;
    float dist = length(p - uCam.xz);
    float fade = 1.0 - smoothstep(260.0, 380.0, dist);
    vec3 pos = vec3(p.x, wp.y, p.y);
    vec3 tx = vec3(1.0, 0.0, 0.0);
    vec3 tz = vec3(0.0, 0.0, 1.0);
    float crest = 0.0;
    ${WAVES.map((_, i) => `gerstner(W${i}, A${i}, p, fade, pos, tx, tz, crest);`).join('\n    ')}
    vNormal = normalize(cross(tz, tx));
    vWorld = pos;
    vCrest = crest;
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCam;
  uniform vec3 uSun;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec2 uShipPos;
  uniform float uShipHeading;
  uniform float uShipSpeed;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { return noise(p) * 0.5 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.2; }

  float halfBeam(float t) {
    if (t <= 0.0 || t >= 1.0) return 0.0;
    float bow = min(1.0, pow(t / 0.38, 0.62));
    float stern = t > 0.8 ? 1.0 - (t - 0.8) * 0.45 : 1.0;
    return ${SHIP_BEAM.toFixed(2)} * bow * stern;
  }

  // Foam from the ship: bow wave along the hull, Kelvin wake arms, churned water astern.
  float shipFoam(vec2 p) {
    vec2 d = p - uShipPos;
    float c = cos(uShipHeading), s = sin(uShipHeading);
    float lx = c * d.x - s * d.y;
    float lz = s * d.x + c * d.y;
    float L = ${SHIP_LEN.toFixed(1)};
    float spd = clamp(uShipSpeed / 12.0, 0.0, 1.3);
    float t = (lz + L * 0.5) / L;
    float ax = abs(lx);
    float foam = 0.0;
    // hull contact band
    if (t > -0.02 && t < 1.0) {
      float hb = halfBeam(clamp(t, 0.001, 0.999));
      float band = 1.0 - smoothstep(0.0, 1.5 + spd * 3.0 * (1.0 - t), ax - hb);
      band *= step(hb - 0.4, ax);
      foam += band * (0.25 + spd * (1.2 - t));
    }
    // churned wake astern
    float dz = lz - L * 0.5;
    if (dz > 0.0) {
      float width = 5.5 + dz * 0.09;
      foam += smoothstep(width, width * 0.25, ax) * exp(-dz / (120.0 + 260.0 * spd)) * (0.35 + spd);
    }
    // Kelvin arms from the bow
    float fromBow = lz + L * 0.5 - 4.0;
    if (fromBow > 0.0) {
      float arm = abs(ax - fromBow * 0.36 - 1.0);
      foam += smoothstep(1.2 + fromBow * 0.012, 0.0, arm) * exp(-fromBow / 200.0) * spd * 0.55;
    }
    return foam * spd;
  }

  void main() {
    vec3 n = vNormal;
    // ripple normals
    vec2 p = vWorld.xz;
    float fadeD = 1.0 - smoothstep(80.0, 320.0, length(p - uCam.xz));
    ${DETAIL.map((_, i) => `{
      vec4 d = D${i}; float A = DA${i} * fadeD;
      float f = d.z * dot(d.xy, p) - d.w * uTime;
      float c = cos(f) * d.z * A;
      n.xz -= d.xy * c;
    }`).join('\n    ')}
    n = normalize(n);

    vec3 V = normalize(uCam - vWorld);
    float NdV = max(dot(n, V), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

    vec3 R = reflect(-V, n);
    float ry = max(R.y, 0.0);
    vec3 sky = mix(uSkyHorizon, uSkyTop, pow(ry, 0.5));

    vec3 deep = vec3(0.008, 0.05, 0.1);
    vec3 shallow = vec3(0.03, 0.17, 0.24);
    float sss = clamp(vCrest * 0.7 + 0.35, 0.0, 1.0) * max(dot(V, -uSun) * 0.5 + 0.5, 0.0);
    vec3 water = mix(deep, shallow, sss * 0.6 + (1.0 - NdV) * 0.15);
    water *= 0.55 + 0.45 * max(dot(n, uSun), 0.0);

    vec3 col = mix(water, sky, fres);
    float spec = pow(max(dot(R, uSun), 0.0), 600.0) * 4.0 + pow(max(dot(R, uSun), 0.0), 60.0) * 0.06;
    col += vec3(1.0, 0.95, 0.85) * spec;

    // foam: wave crests + ship
    float crestFoam = smoothstep(0.78, 1.15, vCrest) * 0.3;
    float sf = shipFoam(p);
    float pattern = fbm(p * 0.22 + vec2(uTime * 0.05, -uTime * 0.04)) * 0.6 + fbm(p * 0.9 - uTime * 0.1) * 0.4;
    float foam = clamp((crestFoam + sf) * (0.3 + pattern * 1.1), 0.0, 1.0);
    foam *= smoothstep(0.25, 0.6, pattern + sf * 0.35);
    col = mix(col, vec3(0.86, 0.9, 0.93), foam * 0.85);

    float dist = length(vWorld - uCam);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Ocean {
  constructor(scene, { sun, skyTop, skyHorizon, fogColor, fogNear, fogFar }) {
    this.uniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uSun: { value: sun.clone().normalize() },
      uSkyTop: { value: new THREE.Color(skyTop) },
      uSkyHorizon: { value: new THREE.Color(skyHorizon) },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
      uShipPos: { value: new THREE.Vector2() },
      uShipHeading: { value: 0 },
      uShipSpeed: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: waveDefs + '\n' + vert,
      fragmentShader: detailDefs + '\n' + frag,
    });

    // Detailed patch that follows the camera, plus a flat ring out to the horizon.
    this.spacing = 2.5;
    const near = new THREE.PlaneGeometry(800, 800, 320, 320);
    near.rotateX(-Math.PI / 2);
    this.near = new THREE.Mesh(near, this.material);
    this.near.frustumCulled = false;
    const far = new THREE.RingGeometry(390, 9000, 96, 8);
    far.rotateX(-Math.PI / 2);
    this.far = new THREE.Mesh(far, this.material);
    this.far.position.y = -0.05;
    this.far.frustumCulled = false;
    scene.add(this.near, this.far);
    this.time = 0;
  }

  // Water height at a world position (matches the shader's large waves).
  heightAt(x, z, t = this.time) {
    let h = 0;
    for (const [a, L, A] of WAVES) {
      const k = (2 * Math.PI) / L;
      const w = Math.sqrt(G * k);
      h += A * Math.sin(k * (Math.cos(a) * x + Math.sin(a) * z) - w * t);
    }
    return h;
  }

  update(dt, camera, ship) {
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    u.uCam.value.copy(camera.position);
    const s = this.spacing;
    this.near.position.set(Math.round(camera.position.x / s) * s, 0, Math.round(camera.position.z / s) * s);
    this.far.position.x = this.near.position.x;
    this.far.position.z = this.near.position.z;
    if (ship) {
      u.uShipPos.value.set(ship.pos.x, ship.pos.z);
      u.uShipHeading.value = ship.heading;
      u.uShipSpeed.value = Math.abs(ship.speed);
    }
  }
}
