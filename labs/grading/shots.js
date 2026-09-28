// Color Grading Lab: the three shots (pure JS, no DOM). Each has the picture "as shot" by the camera
// (flat, with a colour cast) and a mask of regions used by the checks.
// Regions: 1 grey card, 2 skin, 3 sky, 4 wall, 5 foliage, 6 clouds, 7 face (not used with the photos), 8 window.
import { PHOTOS, CROP } from './photos.js?v=1';
export const REG = { grey: 1, skin: 2, sky: 3, wall: 4, foliage: 5, clouds: 6, face: 7, window: 8 };
export const W = 640, H = 360, ASPECT = W / H;

const fract = x => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
// ─── The three shots are photos (assets/grading/*.jpg) ───────────────────────
// photos.js holds a 160 × 90 copy of each one with its region mask, so the checks (and the tests) give
// the same results everywhere. The viewer loads the full JPG files with loadPhotos().
const SRC = { intA: 'entrevista-a.jpg', intB: 'entrevista-b.jpg', ext: 'exterior.jpg' };
const bytes = b64 => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
const small = {};
for (const [id, p] of Object.entries(PHOTOS)) small[id] = { w: p.w, h: p.h, rgb: bytes(p.rgb), mask: bytes(p.mask) };
const full = {};
// Load the JPG files at the viewer size (browser only). Resolves even if a file is missing.
export async function loadPhotos(w, h, base = '../../assets/grading/') {
  if (typeof document === 'undefined') return;
  await Promise.all(Object.entries(SRC).map(([id, file]) => new Promise(done => {
    const im = new Image();
    im.onload = () => { try { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, w, h); full[`${id}|${w}|${h}`] = { w, h, rgb: g.getImageData(0, 0, w, h).data, stride: 4 }; cache.clear(); } catch { /* keep the small copy */ } done(); };
    im.onerror = () => done();
    im.src = base + file;
  })));
}
// The photo (0–1) at pixel (i, j) of a w × h picture: the loaded file, or the small copy scaled up.
function source(id, w, h) {
  const f = full[`${id}|${w}|${h}`]; if (f) return (i, j) => { const q = (j * w + i) * 4; return [f.rgb[q] / 255, f.rgb[q + 1] / 255, f.rgb[q + 2] / 255]; };
  const s = small[id];
  return (i, j) => {
    const x = Math.min(s.w - 1.001, Math.max(0, (i + 0.5) / w * s.w - 0.5)), y = Math.min(s.h - 1.001, Math.max(0, (j + 0.5) / h * s.h - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (a, b, k) => s.rgb[(b * s.w + a) * 3 + k] / 255;
    return [0, 1, 2].map(k => (at(x0, y0, k) * (1 - fx) + at(x0 + 1, y0, k) * fx) * (1 - fy) + (at(x0, y0 + 1, k) * (1 - fx) + at(x0 + 1, y0 + 1, k) * fx) * fy);
  };
}
function maskAt(id, w, h, i, j) { const s = small[id]; return s.mask[Math.min(s.h - 1, Math.floor((j + 0.5) / h * s.h)) * s.w + Math.min(s.w - 1, Math.floor((i + 0.5) / w * s.w))]; }

// ─── The camera: a flat (log-like) picture with a colour cast and grain ──────
export const SHOTS = {
  intA: { name: 'Interview · A camera', cast: [0.9, 0.94, 1.18], exposure: 1.0 },
  intB: { name: 'Interview · B camera', cast: [1.06, 0.88, 1.04], exposure: 0.84 },
  ext: { name: 'Exterior · day', cast: [1.0, 1.0, 1.0], exposure: 1.0 },
};
export const flat = x => 0.085 + 0.7 * Math.pow(Math.max(0, x), 0.72);
const cache = new Map();
export function shot(id, w = W, h = H) {
  const key = `${id}|${w}|${h}`; if (cache.has(key)) return cache.get(key);
  const S = SHOTS[id], data = new Float32Array(w * h * 3), mask = new Uint8Array(w * h), src = source(id, w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = src(i, j);
    mask[j * w + i] = maskAt(id, w, h, i, j);
    const vig = 1 - 0.18 * ((i / w - 0.5) ** 2 + (j / h - 0.5) ** 2) * 2;
    const grain = (hash(i * 1.3, j * 0.7) - 0.5) * 0.012;
    for (let k = 0; k < 3; k++) data[(j * w + i) * 3 + k] = flat(c[k] * S.cast[k] * S.exposure * vig) + grain;
  }
  const out = { id, w, h, data, mask };
  cache.set(key, out); return out;
}
