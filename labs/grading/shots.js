// Color Grading Lab: three painted shots (pure JS, no DOM). Each has the picture "as shot" by the camera
// (flat, with a colour cast) and a mask of regions used by the checks.
// Regions: 1 grey card, 2 skin, 3 sky, 4 wall, 5 foliage, 6 clouds, 7 face (skin + eyes + mouth), 8 window.
export const REG = { grey: 1, skin: 2, sky: 3, wall: 4, foliage: 5, clouds: 6, face: 7, window: 8 };
export const W = 640, H = 360, ASPECT = W / H;

const fract = x => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// Value noise for soft texture.
function noise(x, y) { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }
const fbm = (x, y) => 0.5 * noise(x, y) + 0.3 * noise(x * 2.1, y * 2.1) + 0.2 * noise(x * 4.3, y * 4.3);
const rect = (x, y, x0, y0, x1, y1, s = 0.002) => smooth(x0 - s, x0 + s, x) * (1 - smooth(x1 - s, x1 + s, x)) * smooth(y0 - s, y0 + s, y) * (1 - smooth(y1 - s, y1 + s, y));
const ell = (x, y, cx, cy, rx, ry) => Math.hypot((x - cx) / rx, (y - cy) / ry);

// ─── The person (shared by the two interview shots) ──────────────────────────
// (x, y) in picture units: x = u × aspect, y = v (top = 0). c = head centre, s = scale. light = key direction (x).
function person(x, y, c, s, key, out) {
  const [hx, hy] = c, rx = 0.1 * s, ry = 0.135 * s;
  const skinBase = [0.8, 0.57, 0.46];
  // torso and shoulders
  const tY = hy + 0.2 * s, torso = (y > tY) ? smooth(0.23 * s + 0.004, 0.23 * s - 0.004, Math.abs(x - hx) - Math.max(0, (y - tY)) * 0.9 * s) : 0;
  const shoulders = smooth(1.02, 0.98, ell(x, y, hx, tY + 0.13 * s, 0.26 * s, 0.14 * s));
  const shirt = Math.max(torso, shoulders * (y > tY - 0.02 * s ? 1 : 0));
  if (shirt > 0) {
    const sh = 0.55 + 0.45 * smooth(hx + 0.25 * s, hx - 0.25 * s, x * key + hx * (1 - key));
    let col = mul([0.13, 0.21, 0.4], 0.75 + 0.5 * sh);
    const collar = rect(x, y, hx - 0.06 * s, tY - 0.01 * s, hx + 0.06 * s, tY + 0.07 * s) * smooth(0.075 * s, 0.03 * s, Math.abs(x - hx) + (y - tY) * 0.7);
    col = mix(col, [0.86, 0.86, 0.84], collar * 0.9);
    out.c = mix(out.c, col, shirt); if (shirt > 0.5) out.r = 0;
  }
  // neck
  const neck = rect(x, y, hx - 0.045 * s, hy + 0.08 * s, hx + 0.045 * s, tY + 0.02 * s, 0.004);
  if (neck > 0) { out.c = mix(out.c, mul(skinBase, 0.62 + 0.18 * smooth(hx + 0.05 * s, hx - 0.05 * s, x)), neck); if (neck > 0.5) out.r = 2; }
  // hair behind and around the head
  const hairOut = smooth(1.12, 1.02, ell(x, y, hx, hy - 0.02 * s, rx * 1.1, ry * 1.02)) * smooth(0.0, -0.06 * s, y - hy + 0.02 * s);
  const hairCol = mul([0.2, 0.12, 0.07], 0.7 + 0.5 * fbm(x * 60, y * 60));
  if (hairOut > 0) { out.c = mix(out.c, hairCol, hairOut); if (hairOut > 0.5) out.r = 0; }
  // head
  const e = ell(x, y, hx, hy, rx, ry);
  if (e < 1.02) {
    const a = smooth(1.02, 0.98, e), nx = (x - hx) / rx, ny = (y - hy) / ry, nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny)));
    const lam = Math.max(0, -key * nx * 0.75 + nz * 0.55 - ny * 0.25);
    let col = mul(skinBase, 0.42 + 0.72 * lam);
    col = mix(col, [0.86, 0.52, 0.46], 0.25 * smooth(0.5, 0, ell(x, y, hx + 0.05 * s, hy + 0.03 * s, 0.03 * s, 0.025 * s)) + 0.25 * smooth(0.5, 0, ell(x, y, hx - 0.05 * s, hy + 0.03 * s, 0.03 * s, 0.025 * s)));
    let reg = 2;
    const eye = Math.min(ell(x, y, hx - 0.038 * s, hy - 0.01 * s, 0.017 * s, 0.008 * s), ell(x, y, hx + 0.038 * s, hy - 0.01 * s, 0.017 * s, 0.008 * s));
    if (eye < 1.2) { col = mix(col, [0.1, 0.07, 0.06], smooth(1.2, 0.8, eye)); reg = 7; }
    const brow = Math.min(ell(x, y, hx - 0.04 * s, hy - 0.035 * s, 0.024 * s, 0.006 * s), ell(x, y, hx + 0.04 * s, hy - 0.035 * s, 0.024 * s, 0.006 * s));
    if (brow < 1.2) { col = mix(col, [0.2, 0.12, 0.08], smooth(1.2, 0.8, brow) * 0.9); reg = 7; }
    const lips = ell(x, y, hx, hy + 0.075 * s, 0.03 * s, 0.01 * s);
    if (lips < 1.2) { col = mix(col, [0.62, 0.33, 0.31], smooth(1.2, 0.8, lips)); reg = 7; }
    const nose = ell(x, y, hx + 0.004 * s, hy + 0.035 * s, 0.012 * s, 0.028 * s);
    col = mul(col, 1 - 0.12 * smooth(1, 0.4, nose) * (key > 0 ? 1 : 0.5));
    // hair: the top of the head and a fringe
    const hair = smooth(0.02 * s, -0.01 * s, (y - hy) + 0.055 * s + 0.03 * s * Math.sin((x - hx) / rx * 3)) * (e < 1.02 ? 1 : 0);
    const hk = Math.max(hair, hairOut);
    col = mix(col, hairCol, hk);
    if (hk > 0.4) reg = 0;
    out.c = mix(out.c, col, a); if (a > 0.5) out.r = reg;
  }
}

// ─── Interview, A camera (medium shot) ───────────────────────────────────────
function interviewA(u, v) {
  const x = u * ASPECT, y = v, out = { c: [0, 0, 0], r: 4 };
  const win = Math.exp(-(((u - 0.12) / 0.4) ** 2));
  out.c = mul([0.62, 0.58, 0.53], 0.42 + 0.55 * win - 0.12 * v + 0.04 * fbm(x * 8, y * 8));
  // window (daylight, almost white)
  const w = rect(u, v, 0.03, 0.08, 0.25, 0.62);
  if (w > 0) {
    let c = mix([0.98, 1.0, 1.04], [0.82, 0.9, 1.0], smooth(0.08, 0.62, v));
    const frame = Math.max(rect(u, v, 0.135, 0.08, 0.145, 0.62), rect(u, v, 0.03, 0.34, 0.25, 0.355));
    c = mix(c, [0.22, 0.2, 0.19], frame);
    out.c = mix(out.c, c, w); if (w > 0.5 && frame < 0.5) out.r = 8;
  }
  const border = rect(u, v, 0.02, 0.07, 0.26, 0.63) * (1 - w); out.c = mix(out.c, [0.28, 0.26, 0.24], border);
  // bookshelf (deep shadows)
  const sh = rect(u, v, 0.74, 0.04, 1.02, 0.82);
  if (sh > 0) {
    let c = [0.1, 0.066, 0.045];
    const row = Math.floor((v - 0.04) / 0.155), fy = fract((v - 0.04) / 0.155);
    if (fy > 0.12 && fy < 0.92) { const bk = Math.floor(u * 60 + row * 7.3), hb = hash(bk, row); if (hb > 0.25 && fy > 0.12 + 0.3 * hash(bk, 3)) c = mul([[0.4, 0.12, 0.1], [0.13, 0.25, 0.3], [0.45, 0.38, 0.22], [0.2, 0.3, 0.15], [0.35, 0.33, 0.3]][Math.floor(hb * 5) % 5], 0.35 + 0.35 * (1 - (u - 0.74) * 2)); }
    else c = mul([0.2, 0.13, 0.08], fy <= 0.12 ? 0.9 : 0.4);
    out.c = mix(out.c, c, sh); if (sh > 0.5) out.r = 0;
  }
  // plant
  const potY = 0.72, pot = rect(u, v, 0.63, potY, 0.71, 0.82) * smooth(0.045, 0.035, Math.abs(u - 0.67) - (v - potY) * -0.15);
  if (pot > 0) { out.c = mix(out.c, mul([0.62, 0.3, 0.18], 0.55 + 0.3 * smooth(0.71, 0.63, u)), pot); out.r = 0; }
  let leaf = 0;
  for (let k = 0; k < 14; k++) { const a = hash(k, 1) * 6.28, r = 0.03 + 0.1 * hash(k, 2); leaf = Math.max(leaf, smooth(1.05, 0.95, ell(x, y, (0.67 + Math.cos(a) * r * 0.9) * ASPECT, 0.6 + Math.sin(a) * r - 0.02, 0.05, 0.022))); }
  if (leaf > 0) { const c = mul([0.16, 0.36, 0.12], 0.6 + 0.6 * fbm(x * 30, y * 30)); out.c = mix(out.c, c, leaf); if (leaf > 0.5) out.r = 5; }
  // person
  person(x, y, [0.47 * ASPECT, 0.36], 1, 1, out);
  // desk, grey card and colour chart
  const desk = smooth(0.795, 0.805, v);
  if (desk > 0) { out.c = mix(out.c, mul([0.46, 0.29, 0.16], 0.72 + 0.2 * fbm(x * 3, y * 40) - 0.2 * (v - 0.8)), desk); if (desk > 0.5) out.r = 0; }
  const card = rect(u, v, 0.29, 0.845, 0.39, 0.955);
  if (card > 0) { out.c = mix(out.c, [0.46, 0.46, 0.46], card); if (card > 0.5 && rect(u, v, 0.30, 0.855, 0.38, 0.945) > 0.5) out.r = 1; }
  const chart = [[0.45, 0.31, 0.25], [0.78, 0.58, 0.5], [0.37, 0.48, 0.62], [0.35, 0.42, 0.25], [0.7, 0.2, 0.18], [0.93, 0.93, 0.91]];
  chart.forEach((c, k) => { const x0 = 0.43 + k * 0.032, m = rect(u, v, x0, 0.86, x0 + 0.028, 0.93); if (m > 0) { out.c = mix(out.c, c, m); if (m > 0.5) out.r = 0; } });
  const chartBg = rect(u, v, 0.425, 0.85, 0.625, 0.94) * (out.r === 0 ? 0 : 1); if (chartBg > 0) { out.c = mix(out.c, [0.05, 0.05, 0.05], chartBg); out.r = 0; }
  return out;
}
// ─── Interview, B camera (close-up, background out of focus) ─────────────────
function interviewB(u, v) {
  const x = u * ASPECT, y = v, out = { c: [0, 0, 0], r: 4 };
  const glow = Math.exp(-(((u - 0.3) / 0.55) ** 2));
  out.c = mul([0.62, 0.58, 0.53], 0.4 + 0.5 * glow - 0.1 * v + 0.03 * fbm(x * 3, y * 3));
  const shelf = smooth(0.2, 0.05, u);                       // blurred bookshelf on the left
  if (shelf > 0) { out.c = mix(out.c, mul([0.16, 0.1, 0.07], 0.8 + 0.4 * fbm(x * 6, y * 6)), shelf); if (shelf > 0.6) out.r = 0; }
  person(x, y, [0.64 * ASPECT, 0.5], 2.25, 1, out);
  return out;
}
// ─── Exterior, day ───────────────────────────────────────────────────────────
function exterior(u, v) {
  const x = u * ASPECT, y = v, out = { c: [0, 0, 0], r: 3 };
  out.c = mix([0.42, 0.6, 0.86], [0.76, 0.84, 0.92], smooth(0.0, 0.52, v));
  const cl = fbm(x * 3.2 + 4, y * 7) * smooth(0.5, 0.1, v);
  const cloud = smooth(0.52, 0.66, cl);
  if (cloud > 0) { out.c = mix(out.c, [0.95, 0.96, 0.97], cloud * 0.9); if (cloud > 0.65) out.r = 6; }
  // building on the left
  const bld = rect(u, v, -0.02, 0.12, 0.34, 0.8, 0.001);
  if (bld > 0) {
    let c = mul([0.82, 0.72, 0.58], 0.85 + 0.1 * fbm(x * 20, y * 20));
    const wx = fract(u / 0.075), wy = fract((v - 0.15) / 0.11);
    if (v > 0.15 && v < 0.72 && wx > 0.25 && wx < 0.75 && wy > 0.2 && wy < 0.8) c = mix([0.15, 0.2, 0.26], [0.45, 0.55, 0.65], smooth(0.2, 0.8, wy) * 0.4);
    c = mul(c, u > 0.3 ? 0.62 : 1);
    out.c = mix(out.c, c, bld); if (bld > 0.5) out.r = 0;
  }
  // trees
  let tr = 0;
  for (let k = 0; k < 9; k++) { const cx = 0.38 + k * 0.075 + 0.02 * hash(k, 5), cy = 0.5 - 0.06 * hash(k, 6); tr = Math.max(tr, smooth(1.04, 0.92, ell(x, y + 0.02 * fbm(x * 20, y * 20), cx * ASPECT, cy, 0.09 + 0.03 * hash(k, 7), 0.13))); }
  if (tr > 0) { out.c = mix(out.c, mul([0.2, 0.4, 0.14], 0.55 + 0.7 * fbm(x * 25, y * 25)), tr); if (tr > 0.5) out.r = 5; }
  // ground: pavement and road
  const g = smooth(0.62, 0.63, v);
  if (g > 0) { const c = v > 0.8 ? mul([0.3, 0.3, 0.31], 0.9 + 0.2 * fbm(x * 40, y * 40)) : mul([0.62, 0.6, 0.56], 0.85 + 0.15 * fbm(x * 30, y * 30)); out.c = mix(out.c, c, g); if (g > 0.5) out.r = 0; }
  const lines = rect(u, v, 0, 0.88, 1, 0.89) * (fract(u * 6) < 0.5 ? 1 : 0); out.c = mix(out.c, [0.9, 0.9, 0.85], lines);
  // red car
  const car = Math.max(rect(u, v, 0.55, 0.72, 0.8, 0.83, 0.003), rect(u, v, 0.6, 0.66, 0.74, 0.73, 0.003));
  if (car > 0) { let c = mul([0.72, 0.1, 0.08], 0.7 + 0.3 * smooth(0.83, 0.66, v)); if (rect(u, v, 0.615, 0.67, 0.725, 0.715) > 0.5) c = [0.2, 0.26, 0.32]; out.c = mix(out.c, c, car); out.r = 0; }
  for (const wx of [0.6, 0.75]) { const wh = smooth(1.05, 0.95, ell(x, y, wx * ASPECT, 0.83, 0.035, 0.035)); if (wh > 0) { out.c = mix(out.c, [0.04, 0.04, 0.04], wh); out.r = 0; } }
  return out;
}

// ─── The camera: a flat (log-like) picture with a colour cast and grain ──────
export const SHOTS = {
  intA: { name: 'Interview · A camera', fn: interviewA, cast: [0.88, 0.98, 1.14], exposure: 1.0 },
  intB: { name: 'Interview · B camera', fn: interviewB, cast: [1.06, 0.88, 1.04], exposure: 0.84 },
  ext: { name: 'Exterior · day', fn: exterior, cast: [1.0, 1.0, 1.0], exposure: 1.0 },
};
export const flat = x => 0.085 + 0.7 * Math.pow(Math.max(0, x), 0.72);
const cache = new Map();
export function shot(id, w = W, h = H) {
  const key = `${id}|${w}|${h}`; if (cache.has(key)) return cache.get(key);
  const S = SHOTS[id], data = new Float32Array(w * h * 3), mask = new Uint8Array(w * h), ss = w >= 400 ? 1 : 2;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c = [0, 0, 0];
    for (let a = 0; a < ss; a++) for (let b = 0; b < ss; b++) { const o = S.fn((i + (a + 0.5) / ss) / w, (j + (b + 0.5) / ss) / h); c[0] += o.c[0]; c[1] += o.c[1]; c[2] += o.c[2]; }
    c = mul(c, 1 / (ss * ss));
    mask[j * w + i] = S.fn((i + 0.5) / w, (j + 0.5) / h).r;
    const vig = 1 - 0.18 * ((i / w - 0.5) ** 2 + (j / h - 0.5) ** 2) * 2;
    const grain = (hash(i * 1.3, j * 0.7) - 0.5) * 0.012;
    for (let k = 0; k < 3; k++) data[(j * w + i) * 3 + k] = flat(c[k] * S.cast[k] * S.exposure * vig) + grain;
  }
  const out = { id, w, h, data, mask };
  cache.set(key, out); return out;
}
