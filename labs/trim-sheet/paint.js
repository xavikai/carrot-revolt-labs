// Trim Sheet Lab: paints the medieval trim sheet (colour and OpenGL normal map) on canvases.
// Every strip repeats every 1024 px in x, so it tiles in U.
import { SIZE, stripsOf, PALETTES } from './sheet.js?v=1';

function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
// Value noise, periodic in x over 1024 px. `cell` must divide 1024.
function noise(x, y, cell, seed = 1) {
  const n = SIZE / cell, fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const at = (a, b) => hash(((a % n) + n) % n, b, seed);
  const s = t => t * t * (3 - 2 * t), a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
  return a + (b - a) * s(u) + (c - a) * s(v) + (a - b - c + d) * s(u) * s(v);
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const wrapDist = (x, e) => { const d = Math.abs(((x - e) % SIZE + SIZE) % SIZE); return Math.min(d, SIZE - d); };

// Each painter returns [height 0–1, r, g, b] for a pixel at x and local row y of a strip H px tall.
function woodGrain(x, y, seed) { return Math.sin((y + 7 * noise(x, y, 128, seed) + 3 * noise(x, y, 32, seed + 1)) * 0.85) * 0.5 + 0.5; }
const PAINT = {
  plank(x, y, H, p) {
    const bh = H / 2, b = Math.floor(y / bh), yb = y - b * bh, jx = (b * 371 + 97) % 512;
    const dj = Math.min(wrapDist(x, jx), wrapDist(x, jx + 512)), edge = Math.min(yb, bh - 1 - yb, dj);
    if (edge < 1.5) return [0.05, ...mul(p.wood2, 0.35)];
    const g = woodGrain(x, y + b * 40, 3 + b), n = noise(x, y, 64, 9 + b);
    const h = 0.55 + 0.3 * sstep(0, 6, edge) + 0.04 * g;
    return [h, ...mul(mix(p.wood, p.wood2, 0.25 + 0.45 * g * (0.6 + 0.4 * n)), 0.85 + 0.25 * noise(x, y, 256, 20 + b))];
  },
  beam(x, y, H, p) {
    const e = Math.min(y, H - 1 - y), g = woodGrain(x * 0.8, y * 1.3, 31);
    const crack = Math.abs(noise(x, y * 4, 128, 40) - 0.5) < 0.012 && noise(x, y, 256, 41) > 0.55 && e > 10;
    const h = 0.45 + 0.45 * sstep(0, 14, e) - (crack ? 0.25 : 0) + 0.03 * g;
    const c = mix(mul(p.wood, 0.8), p.wood2, 0.35 + 0.45 * g);
    return [h, ...mul(c, (crack ? 0.45 : 1) * (0.75 + 0.25 * sstep(0, 14, e)))];
  },
  stone(x, y, H, p) {
    const starts = [0, 300, 512, 792], widths = [300, 212, 280, 232];
    let k = 0; for (let i = 0; i < 4; i++) if (x >= starts[i]) k = i;
    const dx = Math.min(x - starts[k], starts[k] + widths[k] - 1 - x), dm = Math.min(dx, y - 1, H - 2 - y);
    if (dm < 3) return [0.12, ...mul(mix(p.stone, [200, 196, 186], 0.5), 0.7 + 0.2 * noise(x, y, 8, 5))];
    const chip = noise(x, y, 16, 11 + k) * 0.6 + noise(x, y, 4, 12) * 0.4;
    const h = 0.55 + 0.3 * sstep(3, 16, dm) + 0.15 * chip;
    const tone = 0.82 + 0.3 * hash(k, 7, 3) + 0.12 * (noise(x, y, 64, 13 + k) - 0.5);
    return [h, ...mul(mix(p.stone, p.stone2, 0.5 * noise(x, y, 32, 14)), tone * (0.75 + 0.25 * h))];
  },
  molding(x, y, H, p) {
    const t = (y + 0.5) / H;
    let h;
    if (t < 0.12) h = 0.95;
    else if (t < 0.55) h = 0.95 - 0.5 * (1 - Math.cos(Math.PI * (t - 0.12) / 0.43)) / 2;
    else if (t < 0.62) h = 0.35;
    else if (t < 0.82) h = 0.35 + 0.45 * Math.sin(Math.PI * (t - 0.62) / 0.2);
    else h = 0.6;
    h += 0.04 * noise(x, y, 8, 21);
    const streak = noise(x * 1, 0, 16, 22) * 0.15;
    return [h, ...mul(mul(p.stone, 1.08), (0.6 + 0.4 * h) * (0.95 - streak))];
  },
  iron(x, y, H, p) {
    const e = Math.min(y, H - 1 - y);
    let h = 0.45 + 0.15 * sstep(0, 5, e);
    const rx = wrapDist(x, 64 + Math.round((x - 64) / 128) * 128), r = Math.hypot(rx, y - H / 2 + 0.5);
    if (r < 9) h += 0.4 * Math.sqrt(1 - (r / 9) ** 2);
    const rust = sstep(0.55, 0.8, noise(x, y, 16, 31));
    const c = mix(p.iron, [128, 72, 40], rust * 0.7);
    return [h, ...mul(c, 0.8 + 0.4 * noise(x, y, 4, 32) * 0.5 + (r < 9 ? 0.15 : 0))];
  },
  plinth(x, y, H, p) {
    const j = wrapDist(x, 0) < 3 || wrapDist(x, 512) < 3;
    if (j && y > 12) return [0.1, ...mul(p.stone2, 0.5)];
    let h = 0.6 + 0.25 * noise(x, y, 8, 41) - 0.1 * noise(x, y, 2, 42);
    if (y < 14) h *= 0.35 + 0.65 * y / 14;
    return [h, ...mul(p.stone2, 0.72 + 0.35 * h)];
  },
  bevelWood(x, y, H, p) {
    const h = Math.sin(Math.PI * (y + 0.5) / H), g = woodGrain(x, y * 3, 51);
    return [h, ...mul(mix(p.wood, [230, 196, 150], 0.3), 0.85 + 0.2 * g)];
  },
  bevelStone(x, y, H, p) {
    const h = Math.sin(Math.PI * (y + 0.5) / H);
    return [h, ...mul(p.stone, 1.05 + 0.15 * noise(x, y, 8, 61))];
  },
};

function canvasOf(size = SIZE) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
// Paint a layout: returns { color, normal } canvases.
export function paintSheet(layout, pad, paletteId = 'oak') {
  const p = PALETTES[paletteId] || PALETTES.oak, { strips } = stripsOf(layout, pad);
  const N = SIZE, H = new Float32Array(N * N), C = new Uint8ClampedArray(N * N * 4), row = new Int16Array(N).fill(-1);
  for (const s of strips) {
    const paint = PAINT[s.type];
    for (let y = s.y0; y < Math.min(s.y1, N); y++) {
      row[y] = s.index;
      for (let x = 0; x < N; x++) { const o = paint(x, y - s.y0, s.px, p), i = y * N + x; H[i] = o[0]; C[i * 4] = o[1]; C[i * 4 + 1] = o[2]; C[i * 4 + 2] = o[3]; C[i * 4 + 3] = 255; }
    }
  }
  // Normals from the height, only inside each strip.
  const NM = new Uint8ClampedArray(N * N * 4), k = 3;
  for (let y = 0; y < N; y++) {
    if (row[y] < 0) continue;
    const up = y > 0 && row[y - 1] === row[y] ? y - 1 : y, dn = y < N - 1 && row[y + 1] === row[y] ? y + 1 : y;
    for (let x = 0; x < N; x++) {
      const gx = H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N], gy = (H[dn * N + x] - H[up * N + x]) * (2 / Math.max(1, dn - up));
      let nx = -gx * k, ny = gy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * N + x) * 4; NM[i] = (nx * 0.5 + 0.5) * 255; NM[i + 1] = (ny * 0.5 + 0.5) * 255; NM[i + 2] = (nz * 0.5 + 0.5) * 255; NM[i + 3] = 255;
    }
  }
  // Padding: each half copies the edge row of the strip next to it. Unused rows: a grey checker.
  const copyRow = (from, to) => { C.copyWithin(to * N * 4, from * N * 4, (from + 1) * N * 4); NM.copyWithin(to * N * 4, from * N * 4, (from + 1) * N * 4); };
  for (let y = 0; y < N; y++) {
    if (row[y] >= 0) continue;
    let a = y; while (a >= 0 && row[a] < 0) a--;
    let b = y; while (b < N && row[b] < 0) b++;
    if (a >= 0 && b < N) { copyRow(y - a <= b - y ? a : b, y); continue; }
    if (a >= 0 && y - a <= pad) { copyRow(a, y); continue; }
    for (let x = 0; x < N; x++) { const i = (y * N + x) * 4, v = ((x >> 4) + (y >> 4)) % 2 ? 78 : 64; C[i] = C[i + 1] = C[i + 2] = v; C[i + 3] = 255; NM[i] = NM[i + 1] = 128; NM[i + 2] = 255; NM[i + 3] = 255; }
  }
  const color = canvasOf(), normal = canvasOf();
  color.getContext('2d').putImageData(new ImageData(C, N, N), 0, 0);
  normal.getContext('2d').putImageData(new ImageData(NM, N, N), 0, 0);
  return { color, normal };
}
// A tileable stone texture: the stone course repeated four times, for the "tileable" comparison.
export function paintTileable(paletteId = 'oak') {
  const layout = [0, 1, 2, 3].map(() => ({ type: 'stone', px: 256 }));
  return paintSheet(layout, 0, paletteId);
}
// A smaller copy of a canvas, as a unique texture of lower density would look.
export function downsample(canvas, f) {
  const n = Math.max(8, Math.round(canvas.width * f)), c = canvasOf(n), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0, n, n); return c;
}
// Mip level m of a canvas, made by halving it m times (each texel averages the ones below it).
export function mip(canvas, m) {
  let src = canvas;
  for (let i = 0; i < m; i++) { const c = canvasOf(src.width / 2), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height); src = c; }
  return src;
}
