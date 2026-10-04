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
// The fields of a layout: height (0–1), colour, and which strip owns every row (−1: padding or unused).
const fieldCache = new Map();
export function fields(layout, pad, paletteId = 'oak') {
  const key = JSON.stringify(layout) + '|' + pad + '|' + paletteId;
  if (fieldCache.has(key)) return fieldCache.get(key);
  if (fieldCache.size > 6) fieldCache.clear();
  const p = PALETTES[paletteId] || PALETTES.oak, { strips } = stripsOf(layout, pad);
  const N = SIZE, H = new Float32Array(N * N), C = new Uint8ClampedArray(N * N * 4), row = new Int16Array(N).fill(-1), type = [];
  for (const s of strips) {
    const paint = PAINT[s.type]; type[s.index] = s.type;
    for (let y = s.y0; y < Math.min(s.y1, N); y++) {
      row[y] = s.index;
      for (let x = 0; x < N; x++) { const o = paint(x, y - s.y0, s.px, p), i = y * N + x; H[i] = o[0]; C[i * 4] = o[1]; C[i * 4 + 1] = o[2]; C[i * 4 + 2] = o[3]; C[i * 4 + 3] = 255; }
    }
  }
  const F = { N, H, C, row, type, strips, pad };
  fieldCache.set(key, F); return F;
}
// Normals from a height field, only inside each strip (k: strength). G is Y+ (OpenGL), as Blender bakes it.
function normalsOf(F, H, k = 3) {
  const { N, row } = F, NM = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    if (row[y] < 0) continue;
    const up = y > 0 && row[y - 1] === row[y] ? y - 1 : y, dn = y < N - 1 && row[y + 1] === row[y] ? y + 1 : y;
    for (let x = 0; x < N; x++) {
      const gx = H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N], gy = (H[dn * N + x] - H[up * N + x]) * (2 / Math.max(1, dn - up));
      let nx = -gx * k, ny = gy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * N + x) * 4; NM[i] = (nx * 0.5 + 0.5) * 255; NM[i + 1] = (ny * 0.5 + 0.5) * 255; NM[i + 2] = (nz * 0.5 + 0.5) * 255; NM[i + 3] = 255;
    }
  }
  return NM;
}
// Padding: each half copies the edge row of the strip next to it. Unused rows: a grey checker (colour) or flat (normal).
function fillPadding(F, maps, pad, flat = []) {
  const { N, row } = F, copyRow = (from, to) => { for (const M of maps) M.copyWithin(to * N * 4, from * N * 4, (from + 1) * N * 4); };
  for (let y = 0; y < N; y++) {
    if (row[y] >= 0) continue;
    let a = y; while (a >= 0 && row[a] < 0) a--;
    let b = y; while (b < N && row[b] < 0) b++;
    if (a >= 0 && b < N) { copyRow(y - a <= b - y ? a : b, y); continue; }
    if (a >= 0 && y - a <= pad) { copyRow(a, y); continue; }
    maps.forEach((M, j) => { for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; if (flat[j]) { M[i] = M[i + 1] = 128; M[i + 2] = 255; } else { const v = ((x >> 4) + (y >> 4)) % 2 ? 78 : 64; M[i] = M[i + 1] = M[i + 2] = v; } M[i + 3] = 255; } });
  }
}
const toCanvas = (D, N = SIZE) => { const c = canvasOf(N); c.getContext('2d').putImageData(new ImageData(D, N, N), 0, 0); return c; };
// Paint a layout: returns { color, normal } canvases.
export function paintSheet(layout, pad, paletteId = 'oak') {
  const F = fields(layout, pad, paletteId), C = new Uint8ClampedArray(F.C), NM = normalsOf(F, F.H);
  fillPadding(F, [C, NM], pad, [false, true]);
  return { color: toCanvas(C), normal: toCanvas(NM) };
}
// Resample a canvas to another size and back (what a smaller bake target loses).
function resized(c, n) { if (n === c.width) return c; const d = canvasOf(n); const g = d.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n, n); return d; }
const flipG = D => { for (let i = 1; i < D.length; i += 4) D[i] = 255 - D[i]; return D; };

// ─── Blender bake of the high poly onto the low plane ───────────────────────
// b: { type, s2a, extrusion, rayDist, size, swizzleG, overhang }. depth: metres each strip rises.
export function bakeNormal(layout, pad, b, depth) {
  const F = fields(layout, pad), { N, row, type } = F, H = new Float32Array(F.H);
  const reach = b.rayDist > 0 ? b.rayDist : Infinity, E = 14;
  const missed = new Uint8Array(N * N);
  if (b.s2a) for (let y = 0; y < N; y++) {
    if (row[y] < 0) continue;
    const dpt = depth[type[row[y]]];
    for (let x = 0; x < N; x++) {
      const i = y * N + x; let h = H[i];
      if (!b.overhang) { const e = Math.min(x, N - 1 - x); if (e < E) h *= sstep(0, E, e); }
      const hm = h * dpt;
      if (b.extrusion - hm > reach) { missed[i] = 1; h = 0.5; }
      else if (hm > b.extrusion) h = b.extrusion / dpt;
      H[i] = h;
    }
  } else H.fill(0.5);
  const NM = normalsOf(F, H);
  for (let i = 0; i < N * N; i++) if (missed[i]) { NM[i * 4] = NM[i * 4 + 1] = 128; NM[i * 4 + 2] = 255; }
  fillPadding(F, [NM], Math.min(pad, b.margin ?? pad), [true]);
  if (b.swizzleG === '-Y') flipG(NM);
  return resized(toCanvas(NM), b.size);
}
// Diffuse bake for an ID map. With Direct or Indirect on, light and shadow get baked into the colours.
export function bakeID(layout, pad, b, mats, materials) {
  const F = fields(layout, pad), { N, row, type } = F, D = new Uint8ClampedArray(N * N * 4);
  const NM = b.direct || b.indirect ? normalsOf(F, F.H) : null;
  for (let y = 0; y < N; y++) {
    if (row[y] < 0) continue;
    const base = b.s2a ? materials[mats[type[row[y]]] || 'none'].id : materials.none.id;
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4; let c = b.color ? base : [200, 200, 200];
      if (NM) { const nx = NM[i] / 127.5 - 1, ny = NM[i + 1] / 127.5 - 1, nz = NM[i + 2] / 127.5 - 1, l = Math.max(0, -0.5 * nx + 0.5 * ny + 0.7 * nz); c = mul(c, (b.direct ? 0.35 + 0.75 * l : 0) + (b.indirect ? 0.3 + 0.25 * F.H[y * N + x] : 0)); }
      D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
    }
  }
  fillPadding(F, [D], pad, [false]);
  return toCanvas(D);
}
// Ambient occlusion and curvature from the height: lower than the neighbourhood is occluded, higher is an edge.
const aoCache = new Map();
export function aoCurvature(layout, pad) {
  const key = JSON.stringify(layout) + pad; if (aoCache.has(key)) return aoCache.get(key);
  const F = fields(layout, pad), { N, H } = F, blur = (src, r) => {
    const a = new Float32Array(N * N), out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * N + ((x + N) % N)]; for (let x = 0; x < N; x++) { a[y * N + x] = s / (2 * r + 1); s += src[y * N + (x + r + 1) % N] - src[y * N + (x - r + N) % N]; } }
    for (let x = 0; x < N; x++) { let s = 0; for (let y = -r; y <= r; y++) s += a[Math.min(N - 1, Math.max(0, y)) * N + x]; for (let y = 0; y < N; y++) { out[y * N + x] = s / (2 * r + 1); s += a[Math.min(N - 1, y + r + 1) * N + x] - a[Math.max(0, y - r) * N + x]; } }
    return out;
  };
  const wide = blur(H, 10), near = blur(H, 2), ao = new Float32Array(N * N), cv = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) { ao[i] = Math.max(0, Math.min(1, 1 - (wide[i] - H[i]) * 3.2)); cv[i] = Math.max(-1, Math.min(1, (H[i] - near[i]) * 14)); }
  const r = { ao, cv }; aoCache.set(key, r); if (aoCache.size > 4) aoCache.delete(aoCache.keys().next().value); return r;
}
export function grayCanvas(layout, pad, values, signed = false) {
  const F = fields(layout, pad), { N, row } = F, D = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, v = row[y] < 0 ? 128 : (signed ? 128 + values[i] * 127 : values[i] * 255); D[i * 4] = D[i * 4 + 1] = D[i * 4 + 2] = v; D[i * 4 + 3] = 255; }
  fillPadding(F, [D], pad, [false]);
  return toCanvas(D);
}
// Painter: fill layers masked by ID colours, with edge wear (curvature) and dirt (ambient occlusion).
const REGION = { plank: 'wood', beam: 'wood', bevelWood: 'wood', stone: 'stone', molding: 'stone', plinth: 'stone', bevelStone: 'stone', iron: 'iron' };
const WEAR = { wood: [214, 178, 128], stone: [226, 214, 190], iron: [186, 182, 176] };
export function composeLayers(layout, pad, layers, paletteId = 'oak') {
  const F = fields(layout, pad, paletteId), p = PALETTES[paletteId] || PALETTES.oak, { N, row, type, C } = F, { ao, cv } = aoCurvature(layout, pad);
  const base = { wood: p.wood, stone: p.stone, iron: p.iron }, D = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    if (row[y] < 0) continue;
    const reg = REGION[type[row[y]]];
    const apply = layers.filter(l => l.visible !== false && (!l.mask || l.mask === reg));
    for (let x = 0; x < N; x++) {
      const i = y * N + x; let c = [92, 92, 96];
      for (const l of apply) {
        c = l.mat === reg ? [C[i * 4], C[i * 4 + 1], C[i * 4 + 2]] : mul(base[l.mat], 0.7 + 0.5 * F.H[i] + 0.15 * (noise(x, y, 32, 77) - 0.5));
        if (l.edge && cv[i] > 0.22) c = mix(c, WEAR[l.mat], Math.min(1, (cv[i] - 0.22) * 2.4) * (0.55 + 0.45 * noise(x, y, 16, 78)));
        if (l.dirt) c = mul(c, 0.5 + 0.5 * ao[i] ** 1.5);
      }
      D[i * 4] = c[0]; D[i * 4 + 1] = c[1]; D[i * 4 + 2] = c[2]; D[i * 4 + 3] = 255;
    }
  }
  fillPadding(F, [D], pad, [false]);
  return toCanvas(D);
}
export function flipGreen(canvas) { const c = canvasOf(canvas.width), g = c.getContext('2d'); g.drawImage(canvas, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); flipG(d.data); g.putImageData(d, 0, 0); return c; }
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
