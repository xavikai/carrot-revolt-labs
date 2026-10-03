// Carrot Revolt Labs · ComfyUI Lab · draws the "generated" pictures procedurally (no AI model).
// Every KSampler setting has a visible, honest consequence: seed = layout, steps = how finished,
// cfg = how much the prompt is obeyed (and burned when too high), LoRA = style, ControlNet = shape.
import { describeRecipe, effects, ANCESTRAL, VOCAB } from './engine.js';

const SIZE = 256;
export function hashSeed(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = hashSeed(seed); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const canvas = (w, h) => { const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return c; };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, v * k)));
const sizeOf = (w, h) => { const r = w / h; return r >= 1 ? [SIZE, Math.max(64, Math.round(SIZE / r))] : [Math.max(64, Math.round(SIZE * r)), SIZE]; };

/* ── The sample images of Load Image, and their silhouettes (what ControlNet follows) ── */
const SHAPES = {
  'example.png': (c, W, H) => { c.beginPath(); c.moveTo(W * .44, H * .14); c.lineTo(W * .56, H * .14); c.lineTo(W * .56, H * .3); c.bezierCurveTo(W * .72, H * .36, W * .74, H * .48, W * .72, H * .82); c.quadraticCurveTo(W * .5, H * .9, W * .28, H * .82); c.bezierCurveTo(W * .26, H * .48, W * .28, H * .36, W * .44, H * .3); c.closePath(); },
  'pose_jump.png': (c, W, H) => { c.beginPath(); c.arc(W * .5, H * .2, W * .07, 0, Math.PI * 2); c.moveTo(W * .43, H * .3); c.lineTo(W * .57, H * .3); c.lineTo(W * .78, H * .1); c.lineTo(W * .83, H * .15); c.lineTo(W * .6, H * .4); c.lineTo(W * .6, H * .56); c.lineTo(W * .8, H * .78); c.lineTo(W * .73, H * .84); c.lineTo(W * .5, H * .62); c.lineTo(W * .27, H * .84); c.lineTo(W * .2, H * .78); c.lineTo(W * .4, H * .56); c.lineTo(W * .4, H * .4); c.lineTo(W * .17, H * .15); c.lineTo(W * .22, H * .1); c.closePath(); },
  'lighthouse.png': (c, W, H) => { c.beginPath(); c.moveTo(W * .4, H * .9); c.lineTo(W * .45, H * .3); c.lineTo(W * .41, H * .3); c.lineTo(W * .41, H * .24); c.lineTo(W * .45, H * .24); c.lineTo(W * .45, H * .14); c.lineTo(W * .5, H * .08); c.lineTo(W * .55, H * .14); c.lineTo(W * .55, H * .24); c.lineTo(W * .59, H * .24); c.lineTo(W * .59, H * .3); c.lineTo(W * .55, H * .3); c.lineTo(W * .6, H * .9); c.closePath(); },
  'cat.png': (c, W, H) => { c.beginPath(); c.ellipse(W * .5, H * .66, W * .2, H * .22, 0, 0, Math.PI * 2); c.moveTo(W * .5 + W * .14, H * .32); c.arc(W * .5, H * .34, W * .14, 0, Math.PI * 2); c.moveTo(W * .39, H * .26); c.lineTo(W * .37, H * .1); c.lineTo(W * .48, H * .21); c.moveTo(W * .61, H * .26); c.lineTo(W * .63, H * .1); c.lineTo(W * .52, H * .21); c.moveTo(W * .68, H * .8); c.quadraticCurveTo(W * .9, H * .82, W * .84, H * .6); c.lineTo(W * .8, H * .62); c.quadraticCurveTo(W * .84, H * .76, W * .68, H * .74); },
};
function drawPhoto(name, W, H) {
  const cv = canvas(W, H), c = cv.getContext('2d');
  const sky = { 'example.png': ['#6d7d91', '#c9b9a3'], 'pose_jump.png': ['#7fb0d8', '#d9e8f2'], 'lighthouse.png': ['#f3a35b', '#4d4a77'], 'cat.png': ['#d8cfc4', '#a4917e'] }[name] || ['#888', '#ccc'];
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky[1]); g.addColorStop(1, sky[0]); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = name === 'lighthouse.png' ? '#2b3550' : name === 'pose_jump.png' ? '#7f9a5a' : '#5b5048'; c.fillRect(0, H * .86, W, H * .14);
  SHAPES[name](c, W, H);
  const body = c.createLinearGradient(W * .3, 0, W * .7, 0);
  const col = { 'example.png': ['#2f5a6b', '#7ab2c2'], 'pose_jump.png': ['#b5473a', '#e0866a'], 'lighthouse.png': ['#e9e3d8', '#a99f91'], 'cat.png': ['#3e3a37', '#8a8178'] }[name];
  body.addColorStop(0, col[0]); body.addColorStop(1, col[1]); c.fillStyle = body; c.fill('evenodd');
  if (name === 'lighthouse.png') { c.fillStyle = '#c0392b'; for (const y of [.42, .6, .78]) c.fillRect(W * .43, H * y, W * .14, H * .06); c.fillStyle = '#ffe9a6'; c.fillRect(W * .46, H * .16, W * .08, H * .07); }
  if (name === 'cat.png') { c.fillStyle = '#e8d36a'; c.beginPath(); c.arc(W * .45, H * .33, 3, 0, 7); c.arc(W * .55, H * .33, 3, 0, 7); c.fill(); }
  // A little texture so the photo looks like a photo.
  const r = rng(name); c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 300; i++) c.fillRect(r() * W, r() * H, 1.5, 1.5);
  return cv;
}
export function maskOf(name, W, H) { const cv = canvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; SHAPES[name]?.(c, W, H); c.fill('evenodd'); return cv; }

/* ── Pixel helpers ── */
const data = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
const put = (cv, d) => { cv.getContext('2d').putImageData(d, 0, 0); return cv; };
function boxBlur(d, r) {
  if (r < .5) return d; r = Math.round(r);
  const { width: W, height: H } = d, src = d.data, tmp = new Float32Array(src.length), out = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) { let s = 0, n = 0; for (let i = -r; i <= r; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)); s += src[(y * W + xx) * 4 + k]; n++; } tmp[(y * W + x) * 4 + k] = s / n; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { for (let k = 0; k < 3; k++) { let s = 0, n = 0; for (let i = -r; i <= r; i++) { const yy = Math.min(H - 1, Math.max(0, y + i)); s += tmp[(yy * W + x) * 4 + k]; n++; } out.data[(y * W + x) * 4 + k] = s / n; } out.data[(y * W + x) * 4 + 3] = 255; }
  return out;
}
function sobel(d) { const { width: W, height: H } = d, s = d.data, g = new Float32Array(W * H), L = i => (s[i * 4] * .3 + s[i * 4 + 1] * .59 + s[i * 4 + 2] * .11) / 255; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, gx = L(i - W + 1) + 2 * L(i + 1) + L(i + W + 1) - L(i - W - 1) - 2 * L(i - 1) - L(i + W - 1), gy = L(i + W - 1) + 2 * L(i + W) + L(i + W + 1) - L(i - W - 1) - 2 * L(i - W) - L(i - W + 1); g[i] = Math.hypot(gx, gy); } return g; }
const lerpData = (a, b, t) => { if (t <= 0) return a; const o = new ImageData(a.width, a.height); for (let i = 0; i < a.data.length; i++) o.data[i] = a.data[i] + (b.data[i] - a.data[i]) * Math.min(1, t); return o; };
function mapPixels(d, f) { const o = new ImageData(d.width, d.height); for (let i = 0; i < d.data.length; i += 4) { const [r, g, b] = f(d.data[i], d.data[i + 1], d.data[i + 2], i / 4); o.data[i] = r; o.data[i + 1] = g; o.data[i + 2] = b; o.data[i + 3] = 255; } return o; }
export function cannyOf(img, low = .4, high = .8) {
  const g = sobel(img), { width: W, height: H } = img, lo = low * .45, hi = high * .45;
  return mapPixels(img, (r, gg, b, i) => { const m = g[i]; let e = m > hi; if (!e && m > lo) { const x = i % W, y = (i / W) | 0; for (let dy = -1; dy <= 1 && !e; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * W + x + dx; if (j >= 0 && j < W * H && g[j] > hi) { e = true; break; } } } return e ? [255, 255, 255] : [0, 0, 0]; });
}

/* ── Subjects ── */
const DEFAULT_COL = { bottle: '#5aa0c8', robot: '#9aa5b1', cat: '#d58b44', house: '#c96b4b', lighthouse: '#e8e2d6', tree: '#4f8f45', person: '#c9604b' };
function drawSubject(c, kind, cx, by, s, col, look, extra) {
  const base = hex(col), dark = shade(base, .6), lite = shade(base, 1.3);
  const fill = (x0, y0, x1, y1) => { if (look === 'anime') return rgb(base); const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgb(lite)); g.addColorStop(1, rgb(dark)); return g; };
  const ink = () => { if (look === 'anime') { c.lineWidth = 2; c.strokeStyle = '#1a1a1a'; c.stroke(); } };
  c.save();
  if (kind === 'bottle') {
    c.beginPath(); c.moveTo(cx - s * .1, by - s); c.lineTo(cx + s * .1, by - s); c.lineTo(cx + s * .1, by - s * .78); c.bezierCurveTo(cx + s * .34, by - s * .7, cx + s * .36, by - s * .5, cx + s * .34, by); c.lineTo(cx - s * .34, by); c.bezierCurveTo(cx - s * .36, by - s * .5, cx - s * .34, by - s * .7, cx - s * .1, by - s * .78); c.closePath();
    c.fillStyle = rgb(base, .45); c.fill(); ink();
    if (extra.galaxy) { c.save(); c.clip(); const g = c.createRadialGradient(cx, by - s * .35, 2, cx, by - s * .35, s * .4); g.addColorStop(0, '#f0c8ff'); g.addColorStop(.4, '#8d55c9'); g.addColorStop(1, '#1d1240'); c.fillStyle = g; c.fillRect(cx - s * .4, by - s * .75, s * .8, s * .75); c.fillStyle = '#fff'; for (let i = 0; i < 26; i++) c.fillRect(cx - s * .3 + extra.r() * s * .6, by - s * .7 + extra.r() * s * .65, 1.4, 1.4); c.restore(); }
    c.fillStyle = '#8a5b34'; c.fillRect(cx - s * .09, by - s * 1.07, s * .18, s * .09);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(1.5, s * .03); c.beginPath(); c.moveTo(cx - s * .22, by - s * .6); c.quadraticCurveTo(cx - s * .28, by - s * .3, cx - s * .24, by - s * .08); c.stroke();
  } else if (kind === 'robot') {
    c.fillStyle = fill(cx - s * .3, by - s, cx + s * .3, by);
    c.beginPath(); c.rect(cx - s * .28, by - s * .62, s * .56, s * .5); c.rect(cx - s * .2, by - s * .95, s * .4, s * .3); c.rect(cx - s * .22, by - s * .12, s * .14, s * .12); c.rect(cx + s * .08, by - s * .12, s * .14, s * .12); c.fill(); ink();
    c.fillStyle = '#7fe3ff'; c.fillRect(cx - s * .12, by - s * .84, s * .07, s * .07); c.fillRect(cx + s * .05, by - s * .84, s * .07, s * .07);
    c.strokeStyle = rgb(dark); c.lineWidth = 2; c.beginPath(); c.moveTo(cx, by - s * .95); c.lineTo(cx, by - s * 1.08); c.stroke(); c.fillStyle = '#ff5b4f'; c.beginPath(); c.arc(cx, by - s * 1.1, s * .04, 0, 7); c.fill();
    c.fillStyle = rgb(dark); c.fillRect(cx - s * .14, by - s * .48, s * .28, s * .05); c.fillRect(cx - s * .14, by - s * .38, s * .28, s * .05);
  } else if (kind === 'cat') {
    c.fillStyle = fill(cx - s * .3, by - s, cx + s * .3, by);
    c.beginPath(); c.ellipse(cx, by - s * .3, s * .3, s * .3, 0, 0, 7); c.moveTo(cx + s * .2, by - s * .7); c.arc(cx, by - s * .7, s * .2, 0, 7); c.moveTo(cx - s * .17, by - s * .8); c.lineTo(cx - s * .19, by - s * 1.02); c.lineTo(cx - s * .04, by - s * .88); c.moveTo(cx + s * .17, by - s * .8); c.lineTo(cx + s * .19, by - s * 1.02); c.lineTo(cx + s * .04, by - s * .88); c.fill(); ink();
    c.strokeStyle = rgb(base); c.lineWidth = s * .07; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx + s * .25, by - s * .1); c.quadraticCurveTo(cx + s * .55, by - s * .1, cx + s * .45, by - s * .45); c.stroke();
    c.fillStyle = '#3f8f4d'; c.beginPath(); c.arc(cx - s * .07, by - s * .72, s * .03, 0, 7); c.arc(cx + s * .07, by - s * .72, s * .03, 0, 7); c.fill();
  } else if (kind === 'house') {
    c.fillStyle = fill(cx - s * .4, by - s * .6, cx + s * .4, by); c.beginPath(); c.rect(cx - s * .38, by - s * .55, s * .76, s * .55); c.fill(); ink();
    c.fillStyle = rgb(shade(base, .55)); c.beginPath(); c.moveTo(cx - s * .46, by - s * .52); c.lineTo(cx, by - s); c.lineTo(cx + s * .46, by - s * .52); c.closePath(); c.fill(); ink();
    c.fillStyle = '#3b2a20'; c.fillRect(cx - s * .07, by - s * .25, s * .14, s * .25); c.fillStyle = '#ffe28a'; c.fillRect(cx - s * .3, by - s * .42, s * .14, s * .12); c.fillRect(cx + s * .16, by - s * .42, s * .14, s * .12);
  } else if (kind === 'lighthouse') {
    c.fillStyle = fill(cx - s * .15, 0, cx + s * .15, 0); c.beginPath(); c.moveTo(cx - s * .16, by); c.lineTo(cx - s * .09, by - s * .8); c.lineTo(cx + s * .09, by - s * .8); c.lineTo(cx + s * .16, by); c.closePath(); c.fill(); ink();
    c.fillStyle = '#c0392b'; for (const k of [.2, .45, .68]) c.fillRect(cx - s * .15 + k * s * .06, by - s * k - s * .08, s * .3 - k * s * .12, s * .08);
    c.fillStyle = '#ffe9a6'; c.fillRect(cx - s * .08, by - s * .94, s * .16, s * .14); c.fillStyle = '#333'; c.beginPath(); c.moveTo(cx - s * .1, by - s * .94); c.lineTo(cx, by - s * 1.04); c.lineTo(cx + s * .1, by - s * .94); c.fill();
    if (extra.night) { const g = c.createRadialGradient(cx, by - s * .87, 2, cx, by - s * .87, s * .6); g.addColorStop(0, 'rgba(255,240,170,.55)'); g.addColorStop(1, 'rgba(255,240,170,0)'); c.fillStyle = g; c.fillRect(cx - s * .6, by - s * 1.5, s * 1.2, s * 1.2); }
  } else if (kind === 'tree') {
    c.fillStyle = '#6b4a2f'; c.fillRect(cx - s * .06, by - s * .4, s * .12, s * .4);
    c.fillStyle = fill(cx - s * .35, by - s, cx + s * .35, by - s * .3); c.beginPath(); c.arc(cx, by - s * .62, s * .32, 0, 7); c.arc(cx - s * .18, by - s * .5, s * .2, 0, 7); c.arc(cx + s * .18, by - s * .5, s * .2, 0, 7); c.fill(); ink();
  } else if (kind === 'person') {
    c.fillStyle = fill(cx - s * .2, by - s, cx + s * .2, by); c.beginPath(); c.arc(cx, by - s * .86, s * .1, 0, 7); c.moveTo(cx - s * .15, by - s * .74); c.lineTo(cx + s * .15, by - s * .74); c.lineTo(cx + s * .18, by - s * .35); c.lineTo(cx + s * .1, by); c.lineTo(cx - s * .1, by); c.lineTo(cx - s * .18, by - s * .35); c.closePath(); c.fill(); ink();
  }
  c.restore();
}
// The same subject, forced into the silhouette of a ControlNet map.
function drawControlled(c, kind, maskCv, col, look, W, H, alpha) {
  const tmp = canvas(W, H), t = tmp.getContext('2d'), base = hex(col);
  const g = t.createLinearGradient(0, 0, W, H); g.addColorStop(0, rgb(shade(base, 1.3))); g.addColorStop(1, rgb(shade(base, look === 'anime' ? .95 : .55))); t.fillStyle = g; t.fillRect(0, 0, W, H);
  t.strokeStyle = rgb(shade(base, .5), .55); t.lineWidth = 1;
  if (kind === 'robot') for (let y = 0; y < H; y += 12) { t.beginPath(); t.moveTo(0, y); t.lineTo(W, y); t.stroke(); }
  if (kind === 'cat' || kind === 'person') for (let i = 0; i < 500; i++) { const x = (i * 37) % W, y = (i * 91) % H; t.beginPath(); t.moveTo(x, y); t.lineTo(x + 3, y + 5); t.stroke(); }
  if (kind === 'lighthouse') { t.fillStyle = 'rgba(192,57,43,.85)'; for (let y = H * .35; y < H; y += H * .18) t.fillRect(0, y, W, H * .06); }
  if (kind === 'house') for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 * 8; x < W; x += 16) t.strokeRect(x, y, 16, 8);
  if (kind === 'bottle') { t.fillStyle = 'rgba(255,255,255,.35)'; t.fillRect(W * .32, 0, W * .04, H); }
  t.globalCompositeOperation = 'destination-in'; t.drawImage(maskCv, 0, 0, W, H);
  // Keep only the white of the mask: draw the mask as alpha.
  const md = data(maskCv), td = t.getImageData(0, 0, W, H);
  for (let i = 0; i < td.data.length; i += 4) td.data[i + 3] = md.data[i];
  t.globalCompositeOperation = 'source-over'; t.putImageData(td, 0, 0);
  c.save(); c.globalAlpha = alpha; c.drawImage(tmp, 0, 0); c.restore();
  if (look === 'anime' && alpha > .5) { const e = cannyOf(md, .2, .4); const ec = canvas(W, H); put(ec, mapPixels(e, (r) => [r, r, r])); const ed = data(ec); const cd = c.getImageData(0, 0, W, H); for (let i = 0; i < cd.data.length; i += 4) if (ed.data[i] > 128) { cd.data[i] = cd.data[i + 1] = cd.data[i + 2] = 25; } c.putImageData(cd, 0, 0); }
}

/* ── Backgrounds ── */
function drawScene(c, W, H, setting, r, look, colorTint, adherence) {
  const skies = { galaxy: ['#0b0820', '#3a1f6b'], night: ['#0a1224', '#1f3355'], sunset: ['#f7b267', '#6d3f7a'], snow: ['#c9d6e3', '#eef3f7'], beach: ['#8ecae6', '#e8f4fa'], forest: ['#a7c4a0', '#e4efd9'], desert: ['#f2c27b', '#fbe5bd'], landscape: ['#7fb3e0', '#e6f0f7'], none: ['#55606b', '#a9b3bc'] };
  let [top, bottom] = skies[setting] || skies.none;
  if (adherence < .6 && setting !== 'none') { const t = 1 - adherence / .6; top = rgb(mix(hex(top), hex(skies.none[0]), t * .7)); bottom = rgb(mix(hex(bottom), hex(skies.none[1]), t * .7)); }
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top.startsWith('#') ? top : top); g.addColorStop(1, bottom); c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (setting === 'galaxy' || setting === 'night') { c.fillStyle = '#fff'; for (let i = 0; i < 90; i++) { c.globalAlpha = .3 + r() * .7; c.fillRect(r() * W, r() * H * .7, 1.2, 1.2); } c.globalAlpha = 1; }
  if (setting === 'galaxy') { const n = c.createRadialGradient(W * (.3 + r() * .4), H * .3, 4, W * .5, H * .3, W * .6); n.addColorStop(0, 'rgba(230,140,255,.55)'); n.addColorStop(1, 'rgba(120,60,200,0)'); c.fillStyle = n; c.fillRect(0, 0, W, H); }
  if (setting === 'night') { c.fillStyle = '#f4f1d0'; c.beginPath(); c.arc(W * (.15 + r() * .7), H * .18, W * .05, 0, 7); c.fill(); }
  if (setting === 'sunset') { c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(W * (.2 + r() * .6), H * .62, W * .1, 0, 7); c.fill(); }
  // Mountains for most outdoor settings.
  if (['landscape', 'snow', 'sunset', 'galaxy', 'night', 'forest'].includes(setting)) for (let k = 0; k < 2; k++) {
    c.fillStyle = k ? (setting === 'snow' ? '#9fb0c2' : setting === 'galaxy' || setting === 'night' ? '#1c1c3a' : '#5d7a8c') : (setting === 'snow' ? '#c3cfdb' : setting === 'galaxy' || setting === 'night' ? '#2b2b52' : '#7d97a6');
    c.beginPath(); c.moveTo(0, H * .7); for (let x = 0; x <= W; x += W / 6) c.lineTo(x, H * (.42 + k * .1 + r() * .18)); c.lineTo(W, H * .7); c.lineTo(W, H); c.lineTo(0, H); c.fill();
  }
  const ground = { snow: '#f1f5f9', beach: '#e8d29f', forest: '#3f6b3a', desert: '#e3b673', landscape: '#6f9b4f', sunset: '#5b4a5f', galaxy: '#1e1838', night: '#16243a', none: '#6c6560' }[setting] || '#6c6560';
  c.fillStyle = ground; c.fillRect(0, H * .76, W, H * .24);
  if (setting === 'beach') { c.fillStyle = '#3f88b8'; c.fillRect(0, H * .66, W, H * .1); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(0, H * .755, W, 2); }
  if (setting === 'forest' || setting === 'landscape') for (let i = 0; i < (setting === 'forest' ? 9 : 3); i++) drawSubject(c, 'tree', r() * W, H * (.78 + r() * .05), H * (.18 + r() * .15), '#3f7a3c', look, {});
  if (setting === 'snow') { c.fillStyle = '#fff'; for (let i = 0; i < 70; i++) c.fillRect(r() * W, r() * H, 2, 2); }
  if (colorTint) { c.fillStyle = rgb(hex(colorTint), .08); c.fillRect(0, 0, W, H); }
}

/* ── Styles (from prompt words and LoRAs) ── */
function stylize(d, style, a, r) {
  if (a <= .02) return d;
  const W = d.width, H = d.height;
  let f;
  if (style === 'pixel') { const n = 40, cv = canvas(W, H), small = canvas(n, Math.round(n * H / W)); small.getContext('2d').drawImage(put(canvas(W, H), d), 0, 0, small.width, small.height); const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(small, 0, 0, W, H); f = mapPixels(data(cv), (r_, g, b) => [r_, g, b].map(v => Math.round(v / 51) * 51)); }
  else if (style === 'watercolor') { const b = boxBlur(d, 2), e = sobel(b); f = mapPixels(b, (r_, g, bl, i) => { const p = 245 - r() * 12, k = Math.min(1, e[i] * 1.8); return [r_ * .85 + p * .15 - k * 70, g * .85 + p * .15 - k * 70, bl * .85 + p * .15 - k * 60]; }); }
  else if (style === 'neon') { const e = sobel(d), glow = boxBlur(mapPixels(d, (r_, g, b, i) => { const k = Math.min(1, e[i] * 2.5); return [r_ * k + 255 * k * .5, g * k * .3 + 40 * k, b * k + 255 * k * .7]; }), 2); f = mapPixels(d, (r_, g, b, i) => [r_ * .18 + glow.data[i * 4] * 1.4, g * .18 + glow.data[i * 4 + 1] * 1.4, b * .22 + glow.data[i * 4 + 2] * 1.4]); }
  else if (style === 'sketch') { const e = sobel(d); f = mapPixels(d, (r_, g, b, i) => { const v = 238 - Math.min(1, e[i] * 2.2) * 210 - r() * 10; return [v, v, v - 6]; }); }
  else if (style === 'oil') { const b = boxBlur(d, 1); f = mapPixels(b, (r_, g, bl) => [r_, g, bl].map(v => Math.round(v / 32) * 32 + 8)); }
  else return d;
  return lerpData(d, f, Math.min(1, a));
}

/* ── Render a full picture from an IMAGE value ── */
// Other labs register extra image kinds, sample photos and recipe renderers here.
export const KIND_RENDERERS = {}, PHOTOS = {}, RECIPE_HOOKS = [];
export function renderValue(v, opts = {}) {
  const [W, H] = sizeOf(v?.w || 512, v?.h || 512);
  if (v && KIND_RENDERERS[v.kind]) return KIND_RENDERERS[v.kind](v, opts);
  if (v?.kind === 'photo' && PHOTOS[v.name]) return PHOTOS[v.name](W, H);
  if (!v || v.kind === 'empty') { const cv = canvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#7b7566'; c.fillRect(0, 0, W, H); return cv; }
  if (v.kind === 'photo') return drawPhoto(v.name, W, H);
  if (v.kind === 'canny') { const src = renderValue(v.of); return put(canvas(src.width, src.height), cannyOf(data(src), v.low, v.high)); }
  if (v.kind === 'generated') return renderRecipe(describeRecipe(v.recipe), opts);
  return drawPhoto('example.png', W, H);
}
export function renderRecipe(d, opts = {}) {
  for (const h of RECIPE_HOOKS) if (h.match(d)) return h.render(d, opts);
  return renderBase(d, opts);
}
export function renderBase(d, { progress = 1, index = 0 } = {}) {
  const [W, H] = sizeOf(d.w, d.h), fx = effects(d);
  const seed = Number.isFinite(+d.seed) ? `${d.seed}` : '0', layoutSeed = ANCESTRAL.has(d.sampler) ? `${seed}:${index}:${d.steps}` : `${seed}:${index}`;
  const r = rng(layoutSeed), look = d.look;
  const cv = canvas(W, H), c = cv.getContext('2d');
  const negWords = new Set([...d.neg.subjects.map(s => s.value), ...d.neg.settings.map(s => s.value), ...d.neg.colors.map(s => s.word)]);
  const setting = d.pos.settings.map(s => s.value).find(s => !negWords.has(s)) || 'none';
  const colors = d.pos.colors.filter(x => !negWords.has(x.word));
  const subj = d.pos.subjects.map(s => s.value).find(s => !negWords.has(s)) || null;
  // Low CFG: the prompt is only half followed (paler colours, the subject can fade away).
  drawScene(c, W, H, setting, r, look, colors[0]?.value, fx.adherence);
  const col = colors[0] ? colors[0].value : DEFAULT_COL[subj] || '#999999';
  const subjW = d.pos.subjects.find(s => s.value === subj)?.w ?? 1;
  // img2img keeps the composition of the source picture: the less denoise, the more of its shape survives.
  const srcName = d.source?.kind === 'photo' ? d.source.name : d.source?.of?.name;
  const keep = srcName && d.denoise < 1 ? Math.max(0, Math.min(1, 1.45 - d.denoise * 1.15)) : 0;
  const ctl = fx.control.find(x => x.amount > 0) || (keep > 0 ? { amount: keep, image: { name: srcName } } : null);
  if (subj) {
    const n = fx.duplicates, s = H * (.5 + r() * .12) * Math.min(1.5, subjW) / (n > 1 ? 1 + (n - 1) * .25 : 1);
    const normalAlpha = (.35 + .65 * fx.adherence) * (ctl ? 1 - ctl.amount : 1);
    c.save(); c.globalAlpha = normalAlpha;
    for (let i = 0; i < n; i++) { const cx = n === 1 ? W * (.32 + r() * .36) : W * ((i + .5) / n) + (r() - .5) * W * .08; drawSubject(c, subj, cx, H * (.86 + r() * .04), s, col, look, { galaxy: setting === 'galaxy' || d.pos.text.includes('galaxy'), night: setting === 'night', r }); }
    c.restore();
  }
  if (ctl) drawControlled(c, subj || 'robot', maskOf(ctl.image?.name || 'example.png', W, H), subj ? col : '#9aa0a6', look, W, H, ctl.amount * (.4 + .6 * fx.adherence));
  let img = data(cv);
  // Detail: SDXL and quality words add a little sharpening; "blurry" in the negative too.
  for (const [style, a] of Object.entries(fx.styles)) img = stylize(img, style, a, rng(`${layoutSeed}:${style}`));
  if (fx.adherence < 1) { const t = (1 - fx.adherence) * .55; img = mapPixels(img, (r_, g, b) => { const m = (r_ + g + b) / 3; return [r_ + (m - r_) * t, g + (m - g) * t, b + (m - b) * t]; }); }
  if (fx.burn > 0) { const k = 1 + fx.burn * 1.6, levels = Math.max(3, Math.round(12 - fx.burn * 10)); img = mapPixels(img, (r_, g, b) => { const m = (r_ + g + b) / 3; return [r_, g, b].map(v => { let x = m + (v - m) * k; x = (x - 128) * (1 + fx.burn * .8) + 128; return fx.burn > .4 ? Math.round(x / (256 / levels)) * (256 / levels) : x; }); }); }
  if (fx.overload > 0) { const rr = rng(`${layoutSeed}:over`); img = mapPixels(img, (r_, g, b, i) => { const y = (i / W) | 0, band = Math.sin(y * .7 + rr() * 2) * 60 * Math.min(1, fx.overload); return [r_ + band, g - band * .5, b + band * .8]; }); }
  // Steps: an unfinished picture keeps noise and blur.
  const left = 1 - fx.quality - (d.neg.blurry ? -.03 : 0);
  if (left > .03) { const nr = rng(`${layoutSeed}:noise`); img = boxBlur(img, left * 5); img = mapPixels(img, (r_, g, b) => { const n = (nr() - .5) * 220 * left; return [r_ + n, g + n, b + n]; }); }
  // Denoise below 1: with an empty latent the start is grey mush; with an image (img2img) the original shows through.
  if (d.denoise < 1) {
    const start = d.source ? data(renderValue(d.source.kind ? d.source : { kind: 'photo', name: 'example.png' }, {})) : mapPixels(img, () => [123, 117, 102]);
    const startFit = start.width === img.width && start.height === img.height ? start : data((() => { const t = canvas(W, H); t.getContext('2d').drawImage(put(canvas(start.width, start.height), start), 0, 0, W, H); return t; })());
    const t = d.source ? Math.max(0, Math.min(1, (d.denoise - .1) / .85)) ** 1.2 : d.denoise ** 1.5;
    img = lerpData(startFit, img, t);
  }
  // A preview during sampling: from noise to the picture.
  if (progress < 1) { const pr = rng(`${layoutSeed}:p${Math.round(progress * 40)}`), blur = boxBlur(img, (1 - progress) * 9), k = progress ** 1.4; img = mapPixels(blur, (r_, g, b) => { const n = pr() * 255; return [n + (r_ - n) * k, n * .9 + (g - n * .9) * k, n * .8 + (b - n * .8) * k]; }); }
  return put(cv, img);
}
export const KNOWN_WORDS = { subjects: [...new Set(Object.keys(VOCAB.subjects))], settings: Object.keys(VOCAB.settings), colors: Object.keys(VOCAB.colors), styles: Object.keys(VOCAB.styles) };

// Building blocks for other labs' renderers.
export const KIT = { canvas, data, put, boxBlur, sobel, lerpData, mapPixels, drawScene, drawSubject, stylize, rng, hex, rgb, mix, shade, sizeOf, DEFAULT_COL };
