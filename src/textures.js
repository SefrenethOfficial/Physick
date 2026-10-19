import * as THREE from 'three';

// All textures are generated on canvases so the game ships with no image files
// besides the logo and the robot arm model.

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

// Classic "developer" grid: flat tone, thin lines every metre, thick every 4.
export function devGrid(base = '#8a8f96', line = '#6f747b', major = '#5a5f66', size = 512) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    const cells = 4;
    const step = s / cells;
    g.strokeStyle = line;
    g.lineWidth = 2;
    for (let i = 0; i <= cells; i++) {
      g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * step); g.lineTo(s, i * step); g.stroke();
    }
    g.strokeStyle = major;
    g.lineWidth = 6;
    g.strokeRect(0, 0, s, s);
  });
}

export function crate(tone = '#b0773f', dark = '#7a4d22') {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = tone;
    g.fillRect(0, 0, s, s);
    // planks
    g.strokeStyle = dark;
    g.lineWidth = 3;
    for (let i = 1; i < 5; i++) {
      g.beginPath(); g.moveTo(0, (i * s) / 5); g.lineTo(s, (i * s) / 5); g.stroke();
    }
    // frame + cross brace
    g.lineWidth = 22;
    g.strokeRect(11, 11, s - 22, s - 22);
    g.lineWidth = 18;
    g.beginPath(); g.moveTo(20, 20); g.lineTo(s - 20, s - 20); g.stroke();
    // nails
    g.fillStyle = '#3b2a18';
    for (const [x, y] of [[18, 18], [s - 18, 18], [18, s - 18], [s - 18, s - 18]]) {
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
  });
}

export function metal(tone = '#5c6670', stripe = '#e8b43a') {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = tone;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 1 + Math.random() * 10);
    }
    // hazard band
    g.save();
    g.beginPath(); g.rect(0, s * 0.42, s, s * 0.16); g.clip();
    g.fillStyle = stripe; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1d1f22';
    for (let x = -s; x < s * 2; x += 36) {
      g.beginPath();
      g.moveTo(x, s * 0.42); g.lineTo(x + 18, s * 0.42);
      g.lineTo(x + 18 + 41, s * 0.58); g.lineTo(x + 41, s * 0.58);
      g.fill();
    }
    g.restore();
  });
}

export function plank() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#c49a64';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(110,70,30,${0.15 + Math.random() * 0.2})`;
      g.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * s;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + 6, s * 0.6, y - 6, s, y + Math.random() * 4);
      g.stroke();
    }
  });
}

export function ball(a = '#e94b3c', b = '#f4f1ea') {
  return canvasTexture(256, (g, s) => {
    const n = 6;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect((i * s) / n, 0, s / n + 1, s);
    }
  });
}
