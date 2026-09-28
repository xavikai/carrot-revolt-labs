// LOD & Mipmaps Lab: pure maths (no DOM, no three.js). Tested with node.
// A rock is an icosphere of frequency n (20·n² triangles) pushed in and out by a smooth noise.
// Its LODs are the same rock at lower frequencies, as a Decimate (Collapse) would give.

// ─── Screen ──────────────────────────────────────────────────────────────────
export const SCREEN = { w: 1920, h: 1080, fov: 60 };
// Screen pixels that one metre covers at distance d (m).
export const ppm = (d, s = SCREEN) => s.h / (2 * d * Math.tan(s.fov * Math.PI / 360));
// Unity's "screen relative height": the height of the object on screen, in % of the screen height.
export const screenPct = (objH, d, s = SCREEN) => objH * ppm(d, s) / s.h * 100;
// The distance at which the object fills pct % of the screen height.
export const distanceAtPct = (objH, pct, s = SCREEN) => objH / (2 * Math.tan(s.fov * Math.PI / 360) * pct / 100);
// An error in metres seen on screen at distance d, in pixels.
export const errorPx = (errM, d, s = SCREEN) => errM * ppm(d, s);

// ─── The rock ────────────────────────────────────────────────────────────────
export const ROCK = { r: 0.8, sy: 0.72, n0: 40 };
const fract = x => x - Math.floor(x);
const rnd = k => fract(Math.sin(k * 127.1 + 311.7) * 43758.5453);
// Plane waves of growing frequency and falling amplitude: a smooth, lumpy stone.
const WAVES = Array.from({ length: 28 }, (_, i) => {
  const f = 1.6 + i * 0.55, a = 0.2 / f ** 1.05, z = 2 * rnd(i * 3.1) - 1, t = 2 * Math.PI * rnd(i * 7.7), s = Math.sqrt(1 - z * z);
  return { d: [s * Math.cos(t), z, s * Math.sin(t)], f, a, p: 2 * Math.PI * rnd(i * 13.3) };
});
// Radius factor in direction u (unit vector).
export function rockRadius(u) {
  let r = 1;
  for (const w of WAVES) r += w.a * Math.sin(w.f * (u[0] * w.d[0] + u[1] * w.d[1] + u[2] * w.d[2]) * 2.2 + w.p);
  return r;
}
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
export const rockPoint = u => { const k = rockRadius(u) * ROCK.r; return [u[0] * k, u[1] * k * ROCK.sy, u[2] * k]; };
// The 12 vertices and 20 faces of an icosahedron.
const PHI = (1 + Math.sqrt(5)) / 2;
const IV = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map(norm);
const IF = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
// Unit directions of a geodesic sphere of frequency n, as triangles [[a, b, c], …] (each a unit vector).
export function geodesic(n) {
  const tris = [];
  for (const [ia, ib, ic] of IF) {
    const A = IV[ia], B = IV[ib], C = IV[ic], P = (i, j) => norm([0, 1, 2].map(k => A[k] + (B[k] - A[k]) * i / n + (C[k] - A[k]) * j / n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      tris.push([P(i, j), P(i + 1, j), P(i, j + 1)]);
      if (i + j < n - 1) tris.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
    }
  }
  return tris;
}
export const rockTris = n => 20 * n * n;
// Frequency for a Decimate ratio (Collapse keeps ratio × the triangles).
export const freqForRatio = (ratio, n0 = ROCK.n0) => Math.max(1, Math.round(n0 * Math.sqrt(Math.max(0, Math.min(1, ratio)))));
// Triangles of the rock at frequency n, as flat arrays of positions (x, y, z per corner).
const meshCache = new Map();
export function rockMesh(n) {
  if (meshCache.has(n)) return meshCache.get(n);
  const g = geodesic(n), pos = new Float32Array(g.length * 9);
  g.forEach((t, i) => t.forEach((u, k) => { const p = rockPoint(u); pos.set(p, i * 9 + k * 3); }));
  const out = { n, tris: g.length, pos };
  meshCache.set(n, out); return out;
}
// Geometric error of a LOD: the largest gap (m) between the flat triangles and the real surface,
// checked at the centre and the edge midpoints of every triangle.
const errCache = new Map();
export function rockError(n) {
  if (errCache.has(n)) return errCache.get(n);
  let e = 0;
  for (const [a, b, c] of geodesic(n)) {
    const pa = rockPoint(a), pb = rockPoint(b), pc = rockPoint(c);
    for (const [w0, w1, w2] of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
      const q = [0, 1, 2].map(k => pa[k] * w0 + pb[k] * w1 + pc[k] * w2);
      const u = norm([q[0], q[1] / ROCK.sy, q[2]]), s = rockPoint(u);
      e = Math.max(e, Math.hypot(s[0] - q[0], s[1] - q[1], s[2] - q[2]));
    }
  }
  errCache.set(n, e); return e;
}
export function rockHeight() {
  let y0 = Infinity, y1 = -Infinity;
  for (const t of geodesic(24)) for (const u of t) { const y = rockPoint(u)[1]; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return y1 - y0;
}

// Error of a LOD against LOD0 (the shape the artist signed off), in metres.
export const lodError = (n, n0 = ROCK.n0) => Math.max(0, rockError(n) - rockError(n0));
export const ROCK_H = 1.44;

// ─── LOD Group ───────────────────────────────────────────────────────────────
// A LOD Group as in Unity: LOD i is used while the screen relative height is at or above its threshold.
// thresholds = [LOD1 starts, LOD2 starts, LOD3 starts, Culled below] in % of the screen height.
export const LODS = [40, 28, 20, 14];                     // frequency of LOD0…LOD3 (32000, 15680, 8000, 3920 triangles)
export const DEFAULT_T = [22, 9, 3.5, 1];
export function activeLod(pct, t, bias = 1) {
  const p = pct * bias;
  if (p >= t[0]) return 0;
  if (p >= t[1]) return 1;
  if (p >= t[2]) return 2;
  if (p >= t[3]) return 3;
  return -1;
}
// The threshold at which LOD i (1…3) shows an error of `px` pixels when it switches in.
export const idealPct = (n, px = 1, H = ROCK_H, s = SCREEN) => 100 * px * H / (lodError(n) * s.h);
// Error on screen (px) of LOD i at the moment it switches in (at its threshold).
export const errorAtSwitch = (n, pct, H = ROCK_H, s = SCREEN) => lodError(n) * pct * s.h / (100 * H);
// A threshold is good when the new LOD appears with 0.5–1 px of error: not visible, not too late.
export function thresholdReport(t, lods = LODS) {
  return [1, 2, 3].map(i => { const e = errorAtSwitch(lods[i], t[i - 1]); return { i, pct: t[i - 1], e, early: e > 1.0001, late: e < 0.5 }; });
}

// ─── Decimate (Collapse) ─────────────────────────────────────────────────────
// The smallest frequency whose error at distance d stays within px pixels.
export function minFreqAt(d, px = 1) { for (let n = 1; n <= ROCK.n0; n++) if (errorPx(lodError(n), d) <= px) return n; return ROCK.n0; }
export const DECIMATE_D = [8, 20, 50];                    // where LOD1, LOD2 and LOD3 start in step d2 (m)
export const TRI_TARGETS = [0.5, 0.25, 0.125];            // the halving rule of step d1

// ─── Mipmaps ─────────────────────────────────────────────────────────────────
// Mip level the GPU reads: log2 of texels per screen pixel (0 = full size).
export const mipLevel = (texelsPerM, screenPxPerM) => Math.max(0, Math.log2(texelsPerM / screenPxPerM));
export function mipChain(res) { const out = []; for (let s = res; s >= 1; s = Math.floor(s / 2)) out.push(s); return out; }
// Memory of a texture (4 bytes per pixel, uncompressed) with and without its mip chain, in MB.
export function textureMB(res, mips = true, bpp = 4) { const px = (mips ? mipChain(res) : [res]).reduce((a, s) => a + s * s, 0); return px * bpp / (1024 * 1024); }

// ─── A field of rocks (stage 4) ──────────────────────────────────────────────
export function field(count = 160, seed = 1) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rnd(seed * 17 + i * 1.7), b = rnd(seed * 29 + i * 2.3), c = rnd(seed * 41 + i * 3.1);
    const d = 6 + 294 * a ** 2.2;                          // many far away, a few close
    const ang = (b - 0.5) * 1.1;                           // inside a 63° wedge in front of the camera
    out.push({ x: Math.sin(ang) * d, z: -Math.cos(ang) * d, d, s: 0.5 + c, rot: rnd(i * 5.5) * Math.PI * 2 });
  }
  return out;
}
// Triangles drawn and objects culled for the field with given settings.
export function fieldStats(items, { lods = true, bias = 1, cull = 0, t = null } = {}) {
  const th = t || [idealPct(LODS[1]), idealPct(LODS[2]), idealPct(LODS[3]), cull];
  const thr = [th[0], th[1], th[2], cull];
  let tris = 0, drawn = 0, worst = 0, lostBig = 0; const per = [0, 0, 0, 0];
  for (const it of items) {
    const H = ROCK_H * it.s, pct = screenPct(H, it.d);
    let l = lods ? activeLod(pct, thr, bias) : (pct >= cull ? 0 : -1);
    if (!lods && cull <= 0) l = 0;
    if (l < 0) { if (pct >= 1) lostBig++; continue; }
    per[l]++; drawn++; tris += rockTris(LODS[l]);
    worst = Math.max(worst, errorPx(lodError(LODS[l]) * it.s, it.d));
  }
  return { tris, drawn, culled: items.length - drawn, per, worst, lostBig };
}
