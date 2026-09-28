// Tileable Texture Lab: images, procedural photos and the image operations of the lab.
// Pure JS (no DOM), so every operation and every check can be tested with node.
// An image is { w, h, d } where d is an RGBA Uint8ClampedArray, like ImageData.

export const newImage = (w, h, fill = [0, 0, 0]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = 255; }
  return { w, h, d };
};
export const copyImage = im => ({ w: im.w, h: im.h, d: new Uint8ClampedArray(im.d) });
export const isPow2 = n => n > 0 && (n & (n - 1)) === 0;

// ─── Noise ───────────────────────────────────────────────────────────────────
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;
const fade = t => t * t * (3 - 2 * t);
// Value noise on a lattice. With a period (in lattice cells) it tiles exactly.
export function vnoise(x, y, seed, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
  let x0 = xi, x1 = xi + 1, y0 = yi, y1 = yi + 1;
  if (period) { x0 = mod(x0, period); x1 = mod(x1, period); y0 = mod(y0, period); y1 = mod(y1, period); }
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), e = hash2(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
}
// Fractal noise; freq is in cycles per metre, period in metres (0 = does not tile). Returns about 0..1.
export function fbm(mx, my, freq, octaves, seed, period = 0) {
  let s = 0, amp = 0.5, tot = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    s += amp * vnoise(mx * f, my * f, seed + o * 101, period ? Math.round(period * f) : 0);
    tot += amp; amp *= 0.5; f *= 2;
  }
  return s / tot;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

// ─── Materials (painted in metres, so any resolution shows the same surface) ─
// Flagstones: Voronoi stones with mortar. Returns colour and a height map.
const STONE_PAL = [[0.56, 0.52, 0.47], [0.62, 0.58, 0.52], [0.50, 0.47, 0.44], [0.66, 0.60, 0.50], [0.53, 0.50, 0.49], [0.58, 0.51, 0.43], [0.47, 0.45, 0.42]];
function stoneSample(mx, my, P, seed) {
  const cell = P ? P / Math.round(P / 0.34) : 0.34, n = P ? Math.round(P / cell) : 0;
  const cx = Math.floor(mx / cell), cy = Math.floor(my / cell);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j, wx = n ? mod(gx, n) : gx, wy = n ? mod(gy, n) : gy;
    const px = (gx + 0.12 + 0.76 * hash2(wx, wy, seed)) * cell, py = (gy + 0.12 + 0.76 * hash2(wx, wy, seed + 7)) * cell;
    const d = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
    if (d < f1) { f2 = f1; f1 = d; id = wx * 131 + wy * 7; } else if (d < f2) f2 = d;
  }
  const edge = (f2 - f1) / 2;
  const warp = fbm(mx, my, 6, 2, seed + 3, P) - 0.5;
  const e = edge + warp * 0.012;
  const mortar = 1 - smooth(0.006, 0.013, e);
  const pal = STONE_PAL[Math.floor(hash2(id, 3, seed) * STONE_PAL.length)];
  const tone = 0.86 + 0.28 * hash2(id, 11, seed);
  const big = fbm(mx, my, 3, 3, seed + 20, P), fine = fbm(mx, my, 24, 3, seed + 40, P), grain = vnoise(mx * 180, my * 180, seed + 60, P ? Math.round(P * 180) : 0);
  const ao = 0.72 + 0.28 * smooth(0.0, 0.05, e);
  const k = tone * (0.78 + 0.4 * big) * (0.9 + 0.2 * fine) * (0.93 + 0.14 * grain) * ao;
  const stone = [pal[0] * k, pal[1] * k, pal[2] * k];
  const mg = 0.3 * (0.8 + 0.4 * grain);
  const mort = [mg * 1.02, mg, mg * 0.94];
  const col = stone.map((c, i) => c * (1 - mortar) + mort[i] * mortar);
  const height = (1 - mortar) * (0.45 + 0.35 * Math.sqrt(clamp01(e / 0.07)) + 0.2 * big) + mortar * 0.08 * grain;
  const rough = mortar * 0.92 + (1 - mortar) * (0.5 + 0.25 * fine + 0.12 * hash2(id, 5, seed));
  return { col, height, rough };
}
// Gravel: rounded pebbles of 3–6 cm in a darker, earthy bed. No lines that must meet, so a seam is easy to clone away.
const GRAVEL_PAL = [[0.62, 0.60, 0.56], [0.70, 0.66, 0.58], [0.52, 0.50, 0.48], [0.66, 0.58, 0.47], [0.44, 0.42, 0.41], [0.74, 0.71, 0.66], [0.58, 0.52, 0.45], [0.36, 0.34, 0.33]];
function gravelSample(mx, my, P, seed) {
  const base = 0.055, cell = P ? P / Math.round(P / base) : base, n = P ? Math.round(P / cell) : 0;
  const cx = Math.floor(mx / cell), cy = Math.floor(my / cell);
  // The nearest pebble: each one is a rounded, slightly long shape with its own size and turn.
  let best = -9, second = -9, id = 0, bx = 0, by = 0, br = 1;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j, wx = n ? mod(gx, n) : gx, wy = n ? mod(gy, n) : gy;
    const px = (gx + 0.2 + 0.6 * hash2(wx, wy, seed)) * cell, py = (gy + 0.2 + 0.6 * hash2(wx, wy, seed + 7)) * cell;
    const a = hash2(wx, wy, seed + 13) * Math.PI, c = Math.cos(a), s = Math.sin(a), asp = 1 + 0.6 * hash2(wx, wy, seed + 17);
    const dx = mx - px, dy = my - py, u = (dx * c + dy * s) / asp, v = -dx * s + dy * c;
    const r = cell * (0.36 + 0.2 * hash2(wx, wy, seed + 19));
    const inside = r - Math.sqrt(u * u + v * v);
    if (inside > best) { second = best; best = inside; id = wx * 131 + wy * 7; bx = dx; by = dy; br = r; } else if (inside > second) second = inside;
  }
  // Two pebbles that touch keep a thin dark crack between them.
  const e = Math.min(best, (best - second) * 0.5) + (vnoise(mx * 110, my * 110, seed + 3, P ? Math.round(P * 110) : 0) - 0.5) * 0.004;
  const gap = 1 - smooth(-0.001, 0.003, e);
  const dome = Math.sqrt(clamp01(e / (cell * 0.3)));
  const pal = GRAVEL_PAL[Math.floor(hash2(id, 3, seed) * GRAVEL_PAL.length)];
  const tone = 0.85 + 0.3 * hash2(id, 11, seed);
  const big = fbm(mx, my, 1.5, 3, seed + 20, P), grain = vnoise(mx * 260, my * 260, seed + 60, P ? Math.round(P * 260) : 0);
  const grit = vnoise(mx * 520, my * 520, seed + 70, P ? Math.round(P * 520) : 0);
  const lit = 1 - 0.22 * (bx + by) / (br * 1.4); // light from the top left
  const k = tone * (0.86 + 0.24 * big) * (0.62 + 0.42 * dome) * lit * (0.95 + 0.1 * grain);
  const peb = [pal[0] * k, pal[1] * k, pal[2] * k];
  // Between the pebbles: dark earth with small light grit.
  const dg = (0.17 + 0.1 * smooth(0.55, 0.85, grit)) * (0.9 + 0.2 * big);
  const dirt = [dg * 1.08, dg * 0.98, dg * 0.86];
  const col = peb.map((c, i) => c * (1 - gap) + dirt[i] * gap);
  const height = (1 - gap) * (0.35 + 0.6 * dome) + gap * (0.05 + 0.1 * grit);
  const rough = gap * 0.95 + (1 - gap) * (0.45 + 0.3 * (1 - dome) + 0.15 * hash2(id, 5, seed));
  return { col, height, rough };
}
// Bricks: 25 × 8.3 cm (8 per row, 24 rows in a 2 m tile), stretcher bond.
function brickSample(mx, my, P, seed) {
  const bw = 0.25, bh = 2 / 24, row = Math.floor(my / bh), shift = (row & 1) ? bw / 2 : 0;
  const col = Math.floor((mx + shift) / bw), nCol = Math.round(P / bw), nRow = Math.round(P / bh);
  const lx = mx + shift - col * bw, ly = my - row * bh;
  const g = 0.011, dx = Math.min(lx, bw - lx), dy = Math.min(ly, bh - ly);
  const mortar = 1 - smooth(g * 0.35, g * 0.75, Math.min(dx, dy));
  const id = mod(col, nCol) * 31 + mod(row, nRow) * 977;
  const r = hash2(id, 1, seed), fine = fbm(mx, my, 20, 3, seed + 5, P), grain = vnoise(mx * 160, my * 160, seed + 9, Math.round(P * 160));
  const base = r < 0.15 ? [0.42, 0.2, 0.14] : r < 0.3 ? [0.66, 0.36, 0.24] : [0.56, 0.27, 0.18];
  const k = (0.82 + 0.3 * hash2(id, 2, seed)) * (0.85 + 0.3 * fine) * (0.92 + 0.16 * grain);
  const m = 0.62 * (0.85 + 0.25 * grain);
  const c = base.map((v, i) => v * k * (1 - mortar) + [m, m * 0.97, m * 0.9][i] * mortar);
  return { col: c, height: (1 - mortar) * (0.7 + 0.3 * fine), rough: 0.6 + 0.3 * mortar };
}
// Rock: grey, cracked, a little lichen.
function rockSample(mx, my, P, seed) {
  const a = fbm(mx, my, 2.5, 5, seed, P), b = fbm(mx, my, 14, 3, seed + 8, P), rid = 1 - Math.abs(fbm(mx, my, 5, 4, seed + 30, P) * 2 - 1);
  const crack = smooth(0.94, 0.985, rid), lich = smooth(0.62, 0.7, fbm(mx, my, 4, 3, seed + 50, P));
  const k = (0.55 + 0.5 * a) * (0.88 + 0.24 * b) * (1 - 0.55 * crack);
  const rock = [0.5 * k, 0.49 * k, 0.47 * k], li = [0.55, 0.56, 0.36];
  return { col: rock.map((v, i) => v * (1 - lich * 0.7) + li[i] * lich * 0.7 * k), height: a * 0.7 + b * 0.3 - crack * 0.4, rough: 0.7 + 0.2 * b };
}
// Moss and earth, for mixing on top of the stones.
function mossSample(mx, my, P, seed) {
  const a = fbm(mx, my, 3, 5, seed, P), b = fbm(mx, my, 30, 3, seed + 4, P), c = vnoise(mx * 120, my * 120, seed + 9, Math.round(P * 120));
  const g = smooth(0.4, 0.6, a);
  const earth = [0.34, 0.28, 0.21], moss = [0.3, 0.36, 0.17];
  const k = (0.8 + 0.3 * b) * (0.88 + 0.24 * c);
  return { col: earth.map((v, i) => (v * (1 - g) + moss[i] * g) * k), height: 0.3 + 0.5 * b, rough: 0.9 };
}
const SAMPLERS = { gravel: gravelSample, stone: stoneSample, brick: brickSample, rock: rockSample, moss: mossSample };

// Light on a photo: a slope from bright (top left) to dark (bottom right), a soft shadow band and a vignette.
function photoLight(mx, my) {
  const u = mx / 2.7, v = my / 2.03;
  let L = 1.42 - 0.8 * (0.62 * u + 0.38 * v);
  const band = Math.abs((mx - 2.1) * 0.8 + (my - 0.2) * 0.6 - 0.1);
  L *= 1 - 0.34 * (1 - smooth(0.1, 0.4, band));
  L *= 1 - 0.18 * Math.min(1, ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 2.2);
  return L;
}
// The oil stain on the photo: dark, round, unmistakable once it repeats.
export const STAIN = { x: 1.55, y: 1.25, r: 0.085 };
function stainK(mx, my) {
  const d = Math.hypot((mx - STAIN.x) * 1.15, my - STAIN.y) + (vnoise(mx * 40, my * 40, 99) - 0.5) * 0.03;
  return 1 - 0.55 * (1 - smooth(STAIN.r * 0.55, STAIN.r * 1.25, d));
}

// Paint a material over a region (metres). opts: { kind, P (period m, 0 = photo), seed, light, stain, maps }.
// Returns { col, height, rough } (height and rough only when maps is true).
export function paint(w, h, region, opts = {}) {
  const { kind = 'gravel', P = 0, seed = 7, light = false, stain = false, maps = false } = opts;
  const f = SAMPLERS[kind], col = newImage(w, h), d = col.d, hm = maps ? newImage(w, h) : null, rm = maps ? newImage(w, h) : null;
  const [x0, y0, x1, y1] = region, g = 1 / 1.25;
  for (let y = 0; y < h; y++) {
    const my = y0 + (y + 0.5) / h * (y1 - y0);
    for (let x = 0; x < w; x++) {
      const mx = x0 + (x + 0.5) / w * (x1 - x0), s = f(mx, my, P, seed), i = (y * w + x) * 4;
      let k = 1;
      if (light) k *= photoLight(mx, my);
      if (stain) k *= stainK(mx, my);
      d[i] = Math.pow(clamp01(s.col[0] * k), g) * 255; d[i + 1] = Math.pow(clamp01(s.col[1] * k), g) * 255; d[i + 2] = Math.pow(clamp01(s.col[2] * k), g) * 255;
      if (maps) { hm.d[i] = hm.d[i + 1] = hm.d[i + 2] = clamp01(s.height) * 255; rm.d[i] = rm.d[i + 1] = rm.d[i + 2] = clamp01(s.rough) * 255; }
    }
  }
  return { col, height: hm, rough: rm };
}
// The light of the photo as an image (multiply it over an evenly lit painting to get the photo as shot).
export function lightOver(im, region) {
  const out = copyImage(im), [x0, y0, x1, y1] = region, { w, h } = im, g = 1 / 1.25;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = Math.pow(photoLight(x0 + (x + 0.5) / w * (x1 - x0), y0 + (y + 0.5) / h * (y1 - y0)), g), i = (y * w + x) * 4;
    out.d[i] *= k; out.d[i + 1] *= k; out.d[i + 2] *= k;
  }
  return out;
}
// A normal map (OpenGL, Y+ like Blender) from a height map. wrap = sample across the edges, so a tileable height gives a tileable normal map.
export function normalFromHeight(hm, strength = 3, wrap = true) {
  const { w, h } = hm, out = newImage(w, h), H = (x, y) => {
    if (wrap) { x = mod(x, w); y = mod(y, h); } else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    return hm.d[(y * w + x) * 4] / 255;
  };
  const s = strength * w / 256;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * s, dy = (H(x, y - 1) - H(x, y + 1)) * s, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.d[i] = (-dx / l * 0.5 + 0.5) * 255; out.d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out.d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
  }
  return out;
}

// ─── Image operations (as in Photoshop) ──────────────────────────────────────
export function crop(im, x, y, w, h) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const out = newImage(w, h);
  for (let j = 0; j < h; j++) {
    const sy = Math.min(im.h - 1, Math.max(0, y + j));
    const sx0 = Math.max(0, x), n = Math.max(0, Math.min(w, im.w - x) - (sx0 - x));
    out.d.set(im.d.subarray((sy * im.w + sx0) * 4, (sy * im.w + sx0 + n) * 4), (j * w + (sx0 - x)) * 4);
  }
  return out;
}
// Image Size: area average when making smaller, bilinear when making bigger (no new detail appears).
export function resize(im, W, H) {
  const out = newImage(W, H), sx = im.w / W, sy = im.h / H;
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < H; y++) {
      const ya = y * sy, yb = ya + sy;
      for (let x = 0; x < W; x++) {
        const xa = x * sx, xb = xa + sx; let r = 0, g = 0, b = 0, wt = 0;
        for (let j = Math.floor(ya); j < Math.ceil(yb); j++) {
          const wy = Math.min(yb, j + 1) - Math.max(ya, j);
          for (let i = Math.floor(xa); i < Math.ceil(xb); i++) {
            const k = wy * (Math.min(xb, i + 1) - Math.max(xa, i)), p = (Math.min(im.h - 1, j) * im.w + Math.min(im.w - 1, i)) * 4;
            r += im.d[p] * k; g += im.d[p + 1] * k; b += im.d[p + 2] * k; wt += k;
          }
        }
        const o = (y * W + x) * 4; out.d[o] = r / wt; out.d[o + 1] = g / wt; out.d[o + 2] = b / wt;
      }
    }
    return out;
  }
  for (let y = 0; y < H; y++) {
    const fy = Math.min(im.h - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(im.h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(im.w - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(im.w - 1, x0 + 1), tx = fx - x0, o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = im.d[(y0 * im.w + x0) * 4 + c], b = im.d[(y0 * im.w + x1) * 4 + c], e = im.d[(y1 * im.w + x0) * 4 + c], f = im.d[(y1 * im.w + x1) * 4 + c];
        out.d[o + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (e * (1 - tx) + f * tx) * ty;
      }
    }
  }
  return out;
}
// Filter › Other › Offset. mode: 'wrap' (Wrap Around), 'repeat' (Repeat Edge Pixels), 'background' (Set to Background, white).
export function offset(im, dx, dy, mode = 'wrap') {
  const { w, h } = im, out = newImage(w, h, [255, 255, 255]);
  dx = Math.round(dx); dy = Math.round(dy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sx = x - dx, sy = y - dy;
    if (mode === 'wrap') { sx = mod(sx, w); sy = mod(sy, h); }
    else if (mode === 'repeat') { sx = Math.min(w - 1, Math.max(0, sx)); sy = Math.min(h - 1, Math.max(0, sy)); }
    else if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const s = (sy * w + sx) * 4, o = (y * w + x) * 4;
    out.d[o] = im.d[s]; out.d[o + 1] = im.d[s + 1]; out.d[o + 2] = im.d[s + 2];
  }
  return out;
}
// Box sizes for three passes that approximate a Gaussian of this radius (Photoshop's Radius ≈ sigma).
function boxes(sigma) {
  const n = 3, wIdeal = Math.sqrt(12 * sigma * sigma / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return [0, 1, 2].map(i => ((i < m ? wl : wl + 2) - 1) / 2);
}
// One box pass over one channel plane (running sum, edges clamped).
function boxPass(src, dst, w, h, r, horiz) {
  const lines = horiz ? h : w, len = horiz ? w : h, step = horiz ? 1 : w, k = 1 / (2 * r + 1), last = len - 1;
  for (let l = 0; l < lines; l++) {
    const base = horiz ? l * w : l;
    const first = src[base], end = src[base + last * step];
    let acc = first * (r + 1);
    for (let i = 1; i <= r; i++) acc += src[base + Math.min(last, i) * step];
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = acc * k;
      const add = i + r + 1, sub = i - r;
      acc += (add > last ? end : src[base + add * step]) - (sub < 0 ? first : src[base + sub * step]);
    }
  }
}
export function gaussianBlur(im, radius) {
  if (radius < 0.3) return copyImage(im);
  // Big radii: blur a smaller copy and scale it back up (a wide Gaussian has no fine detail to lose).
  if (radius >= 16 && im.w >= 64 && im.h >= 64) {
    const f = Math.min(2 ** Math.floor(Math.log2(radius / 6)), im.w / 32, im.h / 32);
    if (f >= 2) return resize(gaussianBlur(resize(im, Math.round(im.w / f), Math.round(im.h / f)), radius / f), im.w, im.h);
  }
  const { w, h } = im, n = w * h, out = newImage(w, h), bx = boxes(radius).map(Math.round).filter(r => r >= 1);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) a[i] = im.d[i * 4 + c];
    for (const r of bx) { boxPass(a, b, w, h, r, true); boxPass(b, a, w, h, r, false); }
    for (let i = 0; i < n; i++) out.d[i * 4 + c] = a[i];
  }
  return out;
}
// Image › Adjustments › Desaturate: (max + min) / 2, like Photoshop.
export function desaturate(im) {
  const out = copyImage(im), d = out.d;
  for (let i = 0; i < d.length; i += 4) { const v = (Math.max(d[i], d[i + 1], d[i + 2]) + Math.min(d[i], d[i + 1], d[i + 2])) / 2; d[i] = d[i + 1] = d[i + 2] = v; }
  return out;
}
export function invert(im) { const out = copyImage(im), d = out.d; for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } return out; }

// Blend modes of the Layers panel (values 0..1).
export const BLEND_MODES = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Soft Light', 'Linear Light'];
const BLEND = {
  Normal: (a, b) => b,
  Multiply: (a, b) => a * b,
  Screen: (a, b) => 1 - (1 - a) * (1 - b),
  Overlay: (a, b) => (a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b)),
  'Soft Light': (a, b) => (b < 0.5 ? a - (1 - 2 * b) * a * (1 - a) : a + (2 * b - 1) * ((a < 0.25 ? ((16 * a - 12) * a + 4) * a : Math.sqrt(a)) - a)),
  'Linear Light': (a, b) => a + 2 * b - 1,
};
// Layers: bottom first. { img, blend, opacity (0..1), visible }.
export function composite(layers) {
  const vis = layers.filter(l => l.visible !== false);
  if (!vis.length) return newImage(layers[0].img.w, layers[0].img.h, [255, 255, 255]);
  if (vis.length === 1 && (vis[0].opacity ?? 1) >= 1) return vis[0].img;
  const out = copyImage(vis[0].img), d = out.d;
  for (const L of vis.slice(1)) {
    const f = BLEND[L.blend] || BLEND.Normal, o = L.opacity ?? 1, s = L.img.d, n = d.length;
    if (L.blend === 'Linear Light' || L.blend === 'Normal' || !L.blend) {
      const ll = L.blend === 'Linear Light';
      for (let i = 0; i < n; i++) {
        if ((i & 3) === 3) continue;
        const a = d[i], r = ll ? a + 2 * s[i] - 255 : s[i];
        d[i] = a + ((r < 0 ? 0 : r > 255 ? 255 : r) - a) * o;
      }
      continue;
    }
    for (let i = 0; i < n; i += 4) for (let c = 0; c < 3; c++) {
      const a = d[i + c] / 255, r = clamp01(f(a, s[i + c] / 255));
      d[i + c] = (a + (r - a) * o) * 255;
    }
  }
  return out;
}

// Clone Stamp and Healing Brush: one dab. src is the image as it was when the stroke began.
// The Healing Brush also shifts the colour of the copied pixels to match the place it paints on.
export function dab(im, src, cx, cy, ox, oy, radius, hardness = 0.5, heal = false) {
  const { w, h, d } = im, R = Math.max(1, radius), core = R * Math.min(0.98, hardness);
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(w - 1, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(h - 1, Math.ceil(cy + R));
  if (x1 < x0 || y1 < y0) return null;
  let shift = [0, 0, 0];
  if (heal) {
    const sd = [0, 0, 0], ss = [0, 0, 0]; let n = 0;
    // Colour of the ring around the dab (where the healed patch must blend in) against the same ring at the source.
    for (let y = Math.max(0, Math.floor(cy - R * 1.4)); y <= Math.min(h - 1, cy + R * 1.4); y += 2) for (let x = Math.max(0, Math.floor(cx - R * 1.4)); x <= Math.min(w - 1, cx + R * 1.4); x += 2) {
      const r = Math.hypot(x - cx, y - cy); if (r < R * 0.95 || r > R * 1.4) continue;
      const sx = Math.round(x + ox), sy = Math.round(y + oy); if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const a = (y * w + x) * 4, b = (sy * w + sx) * 4;
      for (let c = 0; c < 3; c++) { sd[c] += src.d[a + c]; ss[c] += src.d[b + c]; } n++;
    }
    if (n) shift = sd.map((v, c) => (v - ss[c]) / n);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const r = Math.hypot(x - cx, y - cy); if (r > R) continue;
    const a = r <= core ? 1 : 1 - smooth(core, R, r);
    const sx = Math.round(x + ox), sy = Math.round(y + oy); if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const i = (y * w + x) * 4, s = (sy * w + sx) * 4;
    for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (src.d[s + c] + shift[c] - d[i + c]) * a;
  }
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
// A straight stroke of dabs, 1/4 of the brush apart, as a brush does between two mouse positions.
export function stroke(im, src, pts, ox, oy, radius, hardness, heal) {
  const step = Math.max(1, radius * 0.25);
  for (let k = 0; k < pts.length; k++) {
    const [ax, ay] = pts[Math.max(0, k - 1)], [bx, by] = pts[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let i = k ? 1 : 0; i <= n; i++) dab(im, src, ax + (bx - ax) * i / n, ay + (by - ay) * i / n, ox, oy, radius, hardness, heal);
  }
}

// ─── Measurements used by the checks ─────────────────────────────────────────
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
// How much a line of pixels jumps compared with its neighbours. A seam is a jump much bigger than the columns next to it.
// axis 'x': the seam is between columns at-1 and at (a vertical line). Returns one ratio per segment of seg pixels.
export const SEAM_SEG = 128;
export function seamRatios(im, at, axis = 'x', seg = SEAM_SEG) {
  const { w, h, d } = im, n = axis === 'x' ? h : w, size = axis === 'x' ? w : h, out = [];
  const P = (a, b) => (axis === 'x' ? (b * w + mod(a, size)) * 4 : (mod(a, size) * w + b) * 4);
  const diff = (a, b, k) => { let s = 0; const p = P(a, k), q = P(b, k); for (let c = 0; c < 3; c++) s += Math.abs(d[p + c] - d[q + c]); return s; };
  for (let s0 = 0; s0 < n; s0 += seg) {
    let mid = 0, side = 0;
    for (let k = s0; k < Math.min(n, s0 + seg); k++) { mid += diff(at, at - 1, k); side += (diff(at - 1, at - 2, k) + diff(at + 1, at, k) + diff(at - 2, at - 3, k) + diff(at + 2, at + 1, k)) / 4; }
    out.push(mid / (side + seg * 3));
  }
  return out;
}
export const SEAM_OK = 2.4;
export function seamReport(im, sx, sy) {
  const v = seamRatios(im, sx, 'x'), hz = seamRatios(im, sy, 'y');
  const bad = [...v, ...hz].filter(r => r > SEAM_OK).length;
  return { v, h: hz, bad, worst: Math.max(...v, ...hz), ok: bad === 0 };
}
// Low-frequency light: the luminance blurred a lot, measured on a grid. Returns (max − min) / mean.
export function unevenness(im) {
  const small = resize(im, 64, 64), b = gaussianBlur(small, 7), vals = [];
  for (let y = 12; y < 52; y += 4) for (let x = 12; x < 52; x += 4) vals.push(lum(b.d, (y * 64 + x) * 4));
  const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
  return (Math.max(...vals) - Math.min(...vals)) / Math.max(1, mean);
}
// Shape of the stones: contrast of the middle frequencies (what a too-small blur radius removes).
export function structure(im) {
  const small = resize(im, 256, 256), a = gaussianBlur(small, 1.2), b = gaussianBlur(small, 14);
  let s = 0, n = 0;
  for (let i = 0; i < a.d.length; i += 16) { const v = lum(a.d, i) - lum(b.d, i); s += v * v; n++; }
  return Math.sqrt(s / n);
}
export function chroma(im) {
  let s = 0, n = 0; const d = im.d;
  for (let i = 0; i < d.length; i += 64) { s += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); n++; }
  return s / n;
}
export function meanLum(im) { let s = 0, n = 0; for (let i = 0; i < im.d.length; i += 64) { s += lum(im.d, i); n++; } return s / n / 255; }
// A dark blot: mean luminance inside a disc against a ring around it (1 = gone).
export function blotRatio(im, cx, cy, r) {
  const { w, h, d } = im; let a = 0, na = 0, b = 0, nb = 0;
  for (let y = Math.floor(cy - r * 2.6); y <= cy + r * 2.6; y++) for (let x = Math.floor(cx - r * 2.6); x <= cx + r * 2.6; x++) {
    const q = Math.hypot(x - cx, y - cy), i = (mod(y, h) * w + mod(x, w)) * 4;
    if (q < r * 0.7) { a += lum(d, i); na++; } else if (q > r * 1.7 && q < r * 2.6) { b += lum(d, i); nb++; }
  }
  return (a / na) / Math.max(1, b / nb);
}
