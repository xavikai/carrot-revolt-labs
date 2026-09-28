// Baking Lab: Blender-style baking from the high poly to the low poly's UV map. Pure JS, no DOM.
// For every texel of the image: find the low poly point with those UVs, cast a ray from the "cage"
// (the low poly pushed out by Extrusion along its shading normals) back into the surface, and read
// what the high poly has there.
import { intersect } from './bvh.js';
import { FACES } from './mesh.js';

export const BAKE_DEFAULTS = {
  type: 'NORMAL', selectedToActive: false, cage: false, extrusion: 0, maxRay: 0, margin: 16, res: 256,
  swizzle: ['+X', '+Y', '+Z'], samples: 16, passes: { direct: true, indirect: true, color: true },
};
// The colours of the ID map: one flat colour per material of the high poly (paint, steel, plate).
export const ID_COLORS = [[0.9, 0.2, 0.2], [0.2, 0.45, 1], [0.25, 0.85, 0.3]];
export const SUN = (() => { const l = [0.35, 0.8, 0.5], n = Math.hypot(...l); return l.map(x => x / n); })();

// UV rasterization: which low triangle (and barycentrics) covers each texel centre.
export function rasterize(low, res) {
  const tri = new Int32Array(res * res).fill(-1), b1 = new Float32Array(res * res), b2 = new Float32Array(res * res), owners = new Uint8Array(res * res);
  const U = low.uvs, I = low.indices;
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const ax = U[a * 2] * res, ay = U[a * 2 + 1] * res, bx = U[b * 2] * res, by = U[b * 2 + 1] * res, cx = U[c * 2] * res, cy = U[c * 2 + 1] * res;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(res - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(res - 1, Math.ceil(Math.max(ay, by, cy)));
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const i = y * res + x;
      // a texel exactly on the diagonal of a quad belongs to both triangles of the same face: that is not an overlap
      if (owners[i] && Math.floor(tri[i] / 2) !== Math.floor(t / 2)) owners[i]++;
      else if (!owners[i]) owners[i] = 1;
      tri[i] = t; b1[i] = w1; b2[i] = w2;
    }
  }
  return { tri, b1, b2, owners };
}

// Interpolated surface frame of the low poly at a texel.
export function lowFrame(low, t, w1, w2) {
  const I = low.indices, w0 = 1 - w1 - w2, ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], ws = [w0, w1, w2];
  const P = [0, 0, 0], N = [0, 0, 0], T = [0, 0, 0], C = [0, 0, 0];
  for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) {
    P[a] += low.positions[ids[k] * 3 + a] * ws[k]; N[a] += low.normals[ids[k] * 3 + a] * ws[k]; T[a] += low.tangents[ids[k] * 4 + a] * ws[k]; C[a] += low.cageNormals[ids[k] * 3 + a] * ws[k];
  }
  const cl = Math.hypot(...C); C[0] /= cl; C[1] /= cl; C[2] /= cl;
  const nl = Math.hypot(...N); N[0] /= nl; N[1] /= nl; N[2] /= nl;
  const d = T[0] * N[0] + T[1] * N[1] + T[2] * N[2];
  T[0] -= N[0] * d; T[1] -= N[1] * d; T[2] -= N[2] * d;
  const tl = Math.hypot(...T); T[0] /= tl; T[1] /= tl; T[2] /= tl;
  const B = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
  const face = FACES[low.faceOf[ids[0]]];
  return { P, N, T, B, C, face };
}
// The ray of a texel: from the cage (Extrusion along the shading normal) back into the surface.
// With a Cage the ray starts on the cage (the low poly inflated along averaged normals) and points
// at the low poly: its direction changes smoothly across the edges, so no part of the high poly is missed.
export function texelRay(fr, opts) {
  const e = opts.extrusion, R = opts.cage ? fr.C : fr.N;
  const O = [fr.P[0] + R[0] * e, fr.P[1] + R[1] * e, fr.P[2] + R[2] * e];
  const tMax = opts.maxRay > 0 ? e + opts.maxRay : 1e9;
  return { O, D: [-R[0], -R[1], -R[2]], tMax };
}
export function castTexel(high, bvh, fr, opts) {
  const { O, D, tMax } = texelRay(fr, opts);
  const h = intersect(bvh, O[0], O[1], O[2], D[0], D[1], D[2], 0, tMax);
  if (!h) return { O, D, tMax, hit: null };
  const I = high.indices, a = I[h.tri * 3], b = I[h.tri * 3 + 1], c = I[h.tri * 3 + 2], w0 = 1 - h.u - h.v;
  const n = [0, 0, 0], col = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    n[k] = high.normals[a * 3 + k] * w0 + high.normals[b * 3 + k] * h.u + high.normals[c * 3 + k] * h.v;
    col[k] = high.colors[a * 3 + k] * w0 + high.colors[b * 3 + k] * h.u + high.colors[c * 3 + k] * h.v;
  }
  const l = Math.hypot(...n);
  const N = [n[0] / l, n[1] / l, n[2] / l];
  const X = [O[0] + D[0] * h.t, O[1] + D[1] * h.t, O[2] + D[2] * h.t];
  // "wrong hit": the ray went through the surface and found the far side of the crate (its normal faces away)
  const wrong = N[0] * fr.N[0] + N[1] * fr.N[1] + N[2] * fr.N[2] < 0;
  // the material of the nearest vertex (for the ID map), and whether the hit belongs to another object (the handle)
  const mat = high.mats ? high.mats[w0 >= h.u && w0 >= h.v ? a : h.u >= h.v ? b : c] : 0;
  const foreign = high.mainTris != null && h.tri >= high.mainTris;
  return { O, D, tMax, hit: { t: h.t, X, N, color: col, wrong, mat, foreign } };
}
const AX = { X: 0, Y: 1, Z: 2 };
function swizzle(v, sw) { return sw.map(s => (s[0] === '-' ? -1 : 1) * v[AX[s[1]]]); }
// Deterministic random numbers, so a bake always gives the same image.
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function ambientOcclusion(bvh, X, N, samples, rnd) {
  // cosine-weighted directions around N
  const up = Math.abs(N[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let T = [up[1] * N[2] - up[2] * N[1], up[2] * N[0] - up[0] * N[2], up[0] * N[1] - up[1] * N[0]];
  const tl = Math.hypot(...T); T = T.map(x => x / tl);
  const B = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
  let occ = 0;
  const ox = X[0] + N[0] * 2e-3, oy = X[1] + N[1] * 2e-3, oz = X[2] + N[2] * 2e-3;
  for (let s = 0; s < samples; s++) {
    const r1 = (s + rnd()) / samples, r2 = rnd(), r = Math.sqrt(r1), ph = 2 * Math.PI * r2, z = Math.sqrt(1 - r1);
    const x = r * Math.cos(ph), y = r * Math.sin(ph);
    const d = [T[0] * x + B[0] * y + N[0] * z, T[1] * x + B[1] * y + N[1] * z, T[2] * x + B[2] * y + N[2] * z];
    if (intersect(bvh, ox, oy, oz, d[0], d[1], d[2], 1e-4, 0.5)) occ++;
  }
  return 1 - occ / samples;
}

// A bake job that can run in slices (rows), so the app can show the image filling up.
export function createBake(low, high, bvh, options) {
  const o = { ...BAKE_DEFAULTS, ...options, passes: { ...BAKE_DEFAULTS.passes, ...(options.passes || {}) } };
  const res = o.res, img = new Uint8ClampedArray(res * res * 4), filled = new Uint8Array(res * res), miss = new Uint8Array(res * res);
  const R = rasterize(low, res);
  const stats = { texels: 0, misses: 0, wrongHits: 0, foreign: 0, overlaps: 0, maxRayAngle: 0 };
  const box = o.bbox || { min: [-1, -1, -1], max: [1, 1, 1] };
  const curv = o.type === 'CURVATURE' ? new Float32Array(res * res * 2) : null;
  for (let i = 0; i < res * res; i++) if (R.owners[i] > 1) stats.overlaps++;
  const rnd = rng(12345);
  let row = 0;
  const job = {
    options: o, res, img, filled, miss, stats, raster: R,
    get done() { return row >= res; },
    progress: () => row / res,
    step(rows = 8) {
      for (const end = Math.min(res, row + rows); row < end; row++) for (let x = 0; x < res; x++) bakeTexel(row * res + x);
      if (row >= res) finish();
      return job.done;
    },
    run() { while (!job.done) job.step(64); return job; },
  };
  function bakeTexel(i) {
    const t = R.tri[i]; if (t < 0) return;
    const fr = lowFrame(low, t, R.b1[i], R.b2[i]);
    stats.texels++;
    const RD = o.cage ? fr.C : fr.N;
    stats.maxRayAngle = Math.max(stats.maxRayAngle, Math.acos(Math.min(1, RD[0] * fr.face.n[0] + RD[1] * fr.face.n[1] + RD[2] * fr.face.n[2])) * 180 / Math.PI);
    let rgb;
    const cast = o.selectedToActive ? castTexel(high, bvh, fr, o) : null;
    const hit = cast?.hit;
    if (o.selectedToActive && !hit) { stats.misses++; miss[i] = 1; }
    if (hit?.wrong) { stats.wrongHits++; miss[i] = 2; }
    else if (hit?.foreign) { stats.foreign++; miss[i] = 3; }
    if (o.type === 'NORMAL') {
      const n = hit ? hit.N : fr.N;
      const ts = [n[0] * fr.T[0] + n[1] * fr.T[1] + n[2] * fr.T[2], n[0] * fr.B[0] + n[1] * fr.B[1] + n[2] * fr.B[2], n[0] * fr.N[0] + n[1] * fr.N[1] + n[2] * fr.N[2]];
      rgb = swizzle(ts, o.swizzle).map(v => 0.5 + 0.5 * v);
    } else if (o.type === 'AO') {
      const X = hit ? hit.X : fr.P, N = hit ? hit.N : fr.N;
      const a = ambientOcclusion(bvh, X, N, Math.max(1, o.samples | 0), rnd);
      rgb = [a, a, a];
    } else if (o.type === 'WORLD') {
      const N = hit ? hit.N : fr.N;
      rgb = N.map(v => 0.5 + 0.5 * v);
    } else if (o.type === 'ID') {
      rgb = ID_COLORS[hit ? hit.mat : 0];
    } else if (o.type === 'POSITION') {
      const X = hit ? hit.X : fr.P;
      rgb = X.map((v, k) => Math.max(0, Math.min(1, (v - box.min[k]) / (box.max[k] - box.min[k]))));
    } else if (o.type === 'THICKNESS') {
      const X = hit ? hit.X : fr.P, N = hit ? hit.N : fr.N;
      const a = thickness(bvh, X, N, Math.max(1, o.samples | 0), rnd);
      rgb = [a, a, a];
    } else if (o.type === 'CURVATURE') {
      // keep the tangent-space normal: the curvature is how fast it changes from texel to texel (finish)
      const n = hit ? hit.N : fr.N;
      curv[i * 2] = n[0] * fr.T[0] + n[1] * fr.T[1] + n[2] * fr.T[2]; curv[i * 2 + 1] = n[0] * fr.B[0] + n[1] * fr.B[1] + n[2] * fr.B[2];
      rgb = [0.5, 0.5, 0.5];
    } else { // DIFFUSE
      const N = hit ? hit.N : fr.N, base = (hit ? hit.color : [0.8, 0.8, 0.8]).map(c => Math.pow(c, 2.2)); // the colours are sRGB: light them in linear
      const light = (o.passes.direct ? 0.75 * Math.max(0, N[0] * SUN[0] + N[1] * SUN[1] + N[2] * SUN[2]) : 0) + (o.passes.indirect ? 0.35 : 0);
      const lit = o.passes.direct || o.passes.indirect;
      rgb = o.passes.color ? (lit ? base.map(c => c * light) : base) : (lit ? [light, light, light] : [0, 0, 0]);
      // Diffuse colours are stored as sRGB, like Blender does for a colour image
      rgb = rgb.map(c => Math.pow(Math.max(0, Math.min(1, c)), 1 / 2.2));
    }
    img[i * 4] = rgb[0] * 255; img[i * 4 + 1] = rgb[1] * 255; img[i * 4 + 2] = rgb[2] * 255; img[i * 4 + 3] = 255;
    filled[i] = 1;
  }
  function finish() { if (curv) curvature(); dilate(img, filled, res, o.margin); }
  // Curvature from the baked normals: convex (bevels, bolts) bright, concave (grooves) dark, flat 0.5.
  function curvature() {
    const same = (i, j) => filled[j] && R.tri[j] >> 1 === R.tri[i] >> 1;
    const k = 1.3 * res / 256;
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
      const i = y * res + x; if (!filled[i]) continue;
      const d = (a, b, c) => { const pa = same(i, a), pb = same(i, b); return pa && pb ? (curv[b * 2 + c] - curv[a * 2 + c]) / 2 : pb ? curv[b * 2 + c] - curv[i * 2 + c] : pa ? curv[i * 2 + c] - curv[a * 2 + c] : 0; };
      const dx = x > 0 && x < res - 1 ? d(i - 1, i + 1, 0) : 0, dy = y > 0 && y < res - 1 ? d(i - res, i + res, 1) : 0;
      const v = Math.max(0, Math.min(1, 0.5 + k * (dx + dy)));
      img[i * 4] = img[i * 4 + 1] = img[i * 4 + 2] = v * 255;
    }
  }
  return job;
}
// Margin: repeat the border texels of every island outwards, so filtering and mipmaps don't pick up the background.
// Thickness: how far rays travel inside the high poly before leaving it (white = thick, dark = thin).
function thickness(bvh, X, N, samples, rnd) {
  const M = [-N[0], -N[1], -N[2]];
  const up = Math.abs(M[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let T = [up[1] * M[2] - up[2] * M[1], up[2] * M[0] - up[0] * M[2], up[0] * M[1] - up[1] * M[0]];
  const tl = Math.hypot(...T); T = T.map(x => x / tl);
  const B = [M[1] * T[2] - M[2] * T[1], M[2] * T[0] - M[0] * T[2], M[0] * T[1] - M[1] * T[0]];
  const MAX = 0.5, ox = X[0] + M[0] * 2e-3, oy = X[1] + M[1] * 2e-3, oz = X[2] + M[2] * 2e-3;
  let sum = 0;
  for (let s = 0; s < samples; s++) {
    const r1 = (s + rnd()) / samples, r2 = rnd(), r = Math.sqrt(r1) * 0.7, ph = 2 * Math.PI * r2, z = Math.sqrt(1 - r * r);
    const x = r * Math.cos(ph), y = r * Math.sin(ph);
    const d = [T[0] * x + B[0] * y + M[0] * z, T[1] * x + B[1] * y + M[1] * z, T[2] * x + B[2] * y + M[2] * z];
    const h = intersect(bvh, ox, oy, oz, d[0], d[1], d[2], 1e-4, MAX);
    sum += h ? h.t / MAX : 1;
  }
  return sum / samples;
}
export function dilate(img, filled, res, margin) {
  let cur = filled.slice();
  for (let m = 0; m < margin; m++) {
    const next = cur.slice();
    let any = false;
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
      const i = y * res + x; if (cur[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= res || yy >= res) continue;
        const j = yy * res + xx; if (!cur[j]) continue;
        r += img[j * 4]; g += img[j * 4 + 1]; b += img[j * 4 + 2]; n++;
      }
      if (n) { img[i * 4] = r / n; img[i * 4 + 1] = g / n; img[i * 4 + 2] = b / n; img[i * 4 + 3] = 255; next[i] = 1; any = true; }
    }
    cur = next; if (!any) break;
  }
}
// Decode a normal-map texel back to a tangent-space vector (for the inspector).
export const decodeTexel = (r, g, b) => [r / 127.5 - 1, g / 127.5 - 1, b / 127.5 - 1];
