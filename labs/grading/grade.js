// Color Grading Lab: the maths of a DaVinci Resolve-style grade. Pure JS (no DOM), tested with node.
// Images are Float32Array RGB in display values 0–1 (Rec.709, as on a timeline), w × h pixels.

export const LUMA = [0.2126, 0.7152, 0.0722];
export const luma = (r, g, b) => LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
// Rec.709 chroma: Cb, Cr (the axes of the vectorscope).
export const cb = (r, g, b) => (b - luma(r, g, b)) / 1.8556;
export const cr = (r, g, b) => (r - luma(r, g, b)) / 1.5748;
// Angle on the vectorscope, counter-clockwise from +Cb (3 o'clock), in degrees.
export const scopeAngle = (r, g, b) => (Math.atan2(cr(r, g, b), cb(r, g, b)) * 180 / Math.PI + 360) % 360;
export const SKIN_LINE = 123;          // the skin tone indicator (I line)

// ─── Nodes ───────────────────────────────────────────────────────────────────
// A wheel: puck (x, y) inside the disc (chroma direction, −1…1) and the master dial m.
const wheel = () => ({ x: 0, y: 0, m: 0 });
export function defaultNode(label = '') {
  return { label, on: true, lift: wheel(), gamma: wheel(), gain: wheel(), offset: wheel(), contrast: 1, pivot: 0.435, sat: 50, hue: 50, temp: 0, tint: 0,
    curve: [[0, 0], [1, 1]], lut: null, qual: null, win: null };
}
// The RGB offset of a puck: a colour of zero luma in the direction (x, y) of the disc.
export function puckRGB(x, y) { return [1.5748 * y, -0.1873 * x - 0.4681 * y, 1.8556 * x]; }
// The inverse: where the puck sits for an RGB offset (its chroma).
export function rgbPuck(r, g, b) { return { x: cb(r, g, b), y: cr(r, g, b) }; }
// Numbers under each wheel as in Resolve: Y R G B.
export function wheelNumbers(kind, w) {
  const p = puckRGB(w.x, w.y);
  if (kind === 'gain') return [1 + w.m, ...p.map(v => 1 + w.m + v * 0.5)];
  if (kind === 'offset') return [25 + w.m * 50, ...p.map(v => 25 + (w.m + v * 0.5) * 50)];
  return [w.m, ...p.map(v => w.m + v * 0.5)];
}

// ─── Curves (monotone cubic through the points) ──────────────────────────────
export function curveLUT(points, n = 256) {
  const p = [...points].sort((a, b) => a[0] - b[0]), out = new Float32Array(n);
  if (p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1) { for (let i = 0; i < n; i++) out[i] = i / (n - 1); return out; }
  const k = p.length, d = [], m = new Array(k).fill(0);
  for (let i = 0; i < k - 1; i++) d.push((p[i + 1][1] - p[i][1]) / Math.max(1e-6, p[i + 1][0] - p[i][0]));
  m[0] = d[0]; m[k - 1] = d[k - 2];
  for (let i = 1; i < k - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < k - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1); let i = 0; while (i < k - 2 && x > p[i + 1][0]) i++;
    const h = Math.max(1e-6, p[i + 1][0] - p[i][0]), t = Math.min(1, Math.max(0, (x - p[i][0]) / h)), t2 = t * t, t3 = t2 * t;
    out[j] = (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1];
  }
  return out;
}
const lutAt = (L, v) => { const x = clamp01(v) * (L.length - 1), i = Math.floor(x), f = x - i; return i >= L.length - 1 ? L[L.length - 1] + (v - 1) : L[i] + (L[i + 1] - L[i]) * f; };

// ─── LUTs (looks) ────────────────────────────────────────────────────────────
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const LUTS = {
  film: { name: 'Film Print (2383 style)', fn: (r, g, b) => { const s = v => 0.02 + 0.96 * smooth(-0.05, 1.08, v); let y = luma(r, g, b); const k = 0.82; r = y + (r - y) * k; g = y + (g - y) * k; b = y + (b - y) * k; y = luma(r, g, b); return [s(r) + 0.025 * smooth(0.5, 1, y), s(g) + 0.005, s(b) + 0.03 * (1 - smooth(0, 0.45, y)) - 0.02 * smooth(0.5, 1, y)]; } },
  tealorange: { name: 'Teal & Orange', fn: (r, g, b) => { const y = luma(r, g, b), sh = 1 - smooth(0.1, 0.55, y), hi = smooth(0.35, 0.9, y); return [r - 0.06 * sh + 0.07 * hi, g + 0.02 * sh + 0.02 * hi, b + 0.07 * sh - 0.07 * hi]; } },
  bw: { name: 'Black & White (contrast)', fn: (r, g, b) => { const y = smooth(0.02, 0.98, 0.3 * r + 0.6 * g + 0.1 * b); return [y, y, y]; } },
  bleach: { name: 'Bleach Bypass', fn: (r, g, b) => { const y = luma(r, g, b), s = v => smooth(0.05, 0.95, v); const k = 0.45; return [s(y + (r - y) * k), s(y + (g - y) * k), s(y + (b - y) * k)]; } },
};

// ─── Keys: qualifier and window ──────────────────────────────────────────────
export function rgbHsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1) + 1e-6);
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360; return [h, Math.min(1, s), l];
}
const band = (v, lo, hi, soft) => soft <= 0 ? (v >= lo && v <= hi ? 1 : 0) : Math.min(smooth(lo - soft, lo, v), 1 - smooth(hi, hi + soft, v));
// HSL qualifier: hue centre and width (degrees), saturation and luminance ranges, softness.
export function qualKey(q, r, g, b) {
  const [h, s, l] = rgbHsl(clamp01(r), clamp01(g), clamp01(b));
  let dh = Math.abs(h - q.h); dh = Math.min(dh, 360 - dh);
  const kh = 1 - smooth(q.hw / 2, q.hw / 2 + q.soft * 60, dh);
  return kh * band(s, q.s0, q.s1, q.soft * 0.25) * band(l, q.l0, q.l1, q.soft * 0.25);
}
// Circle window: centre, radius (fraction of height), softness; inside = 1.
export function winKey(wn, u, v, aspect) {
  const dx = (u - wn.cx) * aspect / Math.max(1e-6, wn.rx), dy = (v - wn.cy) / Math.max(1e-6, wn.ry), d = Math.sqrt(dx * dx + dy * dy);
  const k = 1 - smooth(1 - wn.soft, 1 + wn.soft, d);
  return wn.invert ? 1 - k : k;
}

// ─── Apply one node to a pixel ───────────────────────────────────────────────
// Prepared node: numbers turned into per-channel factors once per grade.
export function prepare(n) {
  const L = puckRGB(n.lift.x, n.lift.y), G = puckRGB(n.gamma.x, n.gamma.y), K = puckRGB(n.gain.x, n.gain.y), O = puckRGB(n.offset.x, n.offset.y);
  const t = n.temp / 100, ti = n.tint / 100;
  return {
    wb: [1 + 0.18 * t, 1 - 0.12 * ti, 1 - 0.18 * t],
    lift: [0, 1, 2].map(i => n.lift.m + L[i] * 0.5),
    gamma: [0, 1, 2].map(i => Math.max(-0.9, n.gamma.m + G[i] * 0.5)),
    gain: [0, 1, 2].map(i => Math.max(0, 1 + n.gain.m + K[i] * 0.5)),
    offset: [0, 1, 2].map(i => n.offset.m + O[i] * 0.5),
    contrast: n.contrast, pivot: n.pivot, sat: n.sat / 50, hue: (n.hue - 50) * 3.6 * Math.PI / 180,
    curve: n.curve.length === 2 && n.curve[0][1] === 0 && n.curve[1][1] === 1 && n.curve[0][0] === 0 && n.curve[1][0] === 1 ? null : curveLUT(n.curve),
    lut: n.lut && LUTS[n.lut.id] ? { fn: LUTS[n.lut.id].fn, mix: n.lut.mix ?? 1 } : null,
    qual: n.qual, win: n.win,
  };
}
// Apply a prepared node to c (an array of 3, changed in place). u, v: position in the picture (0–1).
export function applyNodeInto(P, c, u = 0.5, v = 0.5, aspect = 16 / 9) {
  const r0 = c[0], g0 = c[1], b0 = c[2];
  c[0] *= P.wb[0]; c[1] *= P.wb[1]; c[2] *= P.wb[2];
  for (let i = 0; i < 3; i++) {
    let x = c[i] + P.offset[i];
    x = x + P.lift[i] * (1 - x);
    x = x * P.gain[i];
    x = x > 0 ? Math.pow(x, 1 / (1 + P.gamma[i])) : x;
    x = (x - P.pivot) * P.contrast + P.pivot;
    if (P.curve) x = lutAt(P.curve, x);
    c[i] = x;
  }
  let y = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
  if (P.hue) { // rotate the chroma around the grey axis
    const cbv = (c[2] - y) / 1.8556, crv = (c[0] - y) / 1.5748, co = Math.cos(P.hue), si = Math.sin(P.hue), nb = cbv * co - crv * si, nr = cbv * si + crv * co;
    c[0] = y + 1.5748 * nr; c[2] = y + 1.8556 * nb; c[1] = (y - LUMA[0] * c[0] - LUMA[2] * c[2]) / LUMA[1];
  }
  if (P.sat !== 1) { y = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2]; c[0] = y + (c[0] - y) * P.sat; c[1] = y + (c[1] - y) * P.sat; c[2] = y + (c[2] - y) * P.sat; }
  if (P.lut) { const o = P.lut.fn(c[0], c[1], c[2]); c[0] += (o[0] - c[0]) * P.lut.mix; c[1] += (o[1] - c[1]) * P.lut.mix; c[2] += (o[2] - c[2]) * P.lut.mix; }
  if (P.qual || P.win) {
    let k = 1;
    if (P.qual) k *= qualKey(P.qual, r0, g0, b0);
    if (P.win) k *= winKey(P.win, u, v, aspect);
    c[0] = r0 + (c[0] - r0) * k; c[1] = g0 + (c[1] - g0) * k; c[2] = b0 + (c[2] - b0) * k;
  }
  return c;
}
export function applyNode(P, r, g, b, u = 0.5, v = 0.5, aspect = 16 / 9) { return applyNodeInto(P, [r, g, b], u, v, aspect); }
// Grade a whole image through the serial nodes. Returns a new Float32Array.
export function gradeImage(img, nodes) {
  const { w, h, data } = img, out = new Float32Array(data.length), P = nodes.filter(n => n.on).map(prepare), aspect = w / h, c = [0, 0, 0];
  if (!P.length) { out.set(data); return out; }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 3; c[0] = data[k]; c[1] = data[k + 1]; c[2] = data[k + 2];
    for (let q = 0; q < P.length; q++) applyNodeInto(P[q], c, (i + 0.5) / w, (j + 0.5) / h, aspect);
    out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2];
  }
  return out;
}
// Only the key of one node (for the Highlight view).
export function keyImage(img, node) {
  const { w, h, data } = img, out = new Float32Array(w * h), aspect = w / h;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 3; let v = 1;
    if (node.qual) v *= qualKey(node.qual, data[k], data[k + 1], data[k + 2]);
    if (node.win) v *= winKey(node.win, (i + 0.5) / w, (j + 0.5) / h, aspect);
    out[j * w + i] = v;
  }
  return out;
}

// ─── Measuring ───────────────────────────────────────────────────────────────
// Mean RGB of the pixels of a region (mask value = id).
export function regionMean(data, mask, id) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === id) { r += data[i * 3]; g += data[i * 3 + 1]; b += data[i * 3 + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}
// Black and white points (percentiles of luma) and clipped fractions.
export function levels(data) {
  const n = data.length / 3, hist = new Uint32Array(1101); let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    const y = luma(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    hist[Math.max(0, Math.min(1100, Math.round((y + 0.05) * 1000)))]++;
    if (y < 0) lo++; if (y > 1.0) hi++;
  }
  const pct = p => { let acc = 0; const t = p * n; for (let i = 0; i <= 1100; i++) { acc += hist[i]; if (acc >= t) return i / 1000 - 0.05; } return 1.05; };
  return { black: pct(0.005), white: pct(0.995), crushed: lo / n, clipped: hi / n };
}
export function balance(rgb) { const m = (rgb[0] + rgb[1] + rgb[2]) / 3; return Math.max(Math.abs(rgb[0] - m), Math.abs(rgb[1] - m), Math.abs(rgb[2] - m)); }
export function chroma(rgb) { return Math.hypot(cb(...rgb), cr(...rgb)); }
export function angleDiff(a, b) { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); }
