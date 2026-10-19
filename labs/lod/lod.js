// LOD & Mipmaps Lab: pure maths (no DOM, no three.js). Tested with node.
// The model is the Stanford Bunny; its LODs are Decimate (Collapse) copies, measured offline (bunny-table.js).

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

// ─── The model: the Stanford Bunny ───────────────────────────────────────────
// A stone statue of the Stanford Bunny, 1.44 m high. LOD0 has 32,000 triangles; a Decimate (Collapse) of ratio k / 400
// gives the triangles and the error in TABLE (measured offline with the same simplifier the page runs).
import TABLE from './bunny-table.js?v=1';
const fract = x => x - Math.floor(x);
const rnd = k => fract(Math.sin(k * 127.1 + 311.7) * 43758.5453);
export const LEVELS = TABLE.length;                       // 400: ratio steps of 0.0025
export const MODEL = { name: 'Stanford Bunny', top: LEVELS };
export const MODEL_H = 1.44;
const clampK = k => Math.max(1, Math.min(LEVELS, Math.round(k)));
// Level k (1…400) for a Decimate ratio, and back.
export const levelForRatio = ratio => clampK(ratio * LEVELS);
export const ratioOf = k => k / LEVELS;
export const lodTris = k => TABLE[clampK(k) - 1][0];
// Error of a level against LOD0 (the shape the artist signed off), in metres.
export const lodError = k => TABLE[clampK(k) - 1][1];

// ─── LOD Group ───────────────────────────────────────────────────────────────
// A LOD Group as in Unity: LOD i is used while the screen relative height is at or above its threshold.
// thresholds = [LOD1 starts, LOD2 starts, LOD3 starts, Culled below] in % of the screen height.
export const LODS = [400, 100, 25, 6];                   // levels of LOD0…LOD3: 32,000, 8,000, 2,000 and 479 triangles (each about a quarter)
export const DEFAULT_T = [41, 12.5, 2.8, 1];
export function activeLod(pct, t, bias = 1) {
  const p = pct * bias;
  if (p >= t[0]) return 0;
  if (p >= t[1]) return 1;
  if (p >= t[2]) return 2;
  if (p >= t[3]) return 3;
  return -1;
}
// The threshold at which a LOD of level n shows an error of `px` pixels when it switches in.
export const idealPct = (n, px = 1, H = MODEL_H, s = SCREEN) => 100 * px * H / (lodError(n) * s.h);
// Error on screen (px) of a LOD of level n at the moment it switches in (at its threshold).
export const errorAtSwitch = (n, pct, H = MODEL_H, s = SCREEN) => lodError(n) * pct * s.h / (100 * H);
// A threshold is good when the new LOD appears with 0.5–1 px of error: not visible, not too late.
export function thresholdReport(t, lods = LODS) {
  return [1, 2, 3].map(i => { const e = errorAtSwitch(lods[i], t[i - 1]); return { i, pct: t[i - 1], e, early: e > 1.0001, late: e < 0.5 }; });
}

// ─── Decimate (Collapse) ─────────────────────────────────────────────────────
// The smallest frequency whose error at distance d stays within px pixels.
export function minLevelAt(d, px = 1) { for (let k = 1; k <= LEVELS; k++) if (errorPx(lodError(k), d) <= px) return k; return LEVELS; }
export const DECIMATE_D = [4, 10, 25];                    // where LOD1, LOD2 and LOD3 start in step d2 (m)
export const TRI_TARGETS = [0.5, 0.25, 0.125];            // the halving rule of step d1

// ─── Textures per LOD ───────────────────────────────────────────────────
// The stone texture is projected from three sides (triplanar): one copy of the texture covers 2 × 2 m.
export const TEX_M = 2;
export const TEX_SIZES = [2048, 1024, 512, 256, 128, 64, 32];
export const DEFAULT_TEX = [2048, 1024, 256, 64];        // each LOD gets the smallest texture that stays sharp where it starts
export const DIST_NEAR = 1.6;                            // the closest the camera gets to the model (m)
export const texelsPerM = res => res / TEX_M;
// The nearest distance at which LOD i is used: LOD0 from the closest camera, the others from their threshold.
export const lodStartDist = (i, t, H = MODEL_H) => i === 0 ? DIST_NEAR : distanceAtPct(H, t[i - 1]);
// The smallest texture that still gives at least one texel per screen pixel where LOD i starts.
export function idealTex(i, t) { const need = ppm(lodStartDist(i, t)); let best = TEX_SIZES[0]; for (const r of TEX_SIZES) if (texelsPerM(r) >= need) best = r; return best; }
// For each LOD: screen px per metre at its start, texels per metre, texels per pixel, memory, and a verdict.
export function texReport(texRes, t) {
  return texRes.map((res, i) => {
    const d = lodStartDist(i, t), px = ppm(d), tpm = texelsPerM(res), k = tpm / px;
    return { i, res, d, px, tpm, k, mb: textureMB(res, true), blurry: k < 0.9999, wasted: k >= 2, ideal: idealTex(i, t) };
  });
}
export const texMemory = texRes => texRes.reduce((a, r) => a + textureMB(r, true), 0);

// ─── Mipmaps ─────────────────────────────────────────────────────────────────
// Mip level the GPU reads: log2 of texels per screen pixel (0 = full size).
export const mipLevel = (texelsPerM, screenPxPerM) => Math.max(0, Math.log2(texelsPerM / screenPxPerM));
export function mipChain(res) { const out = []; for (let s = res; s >= 1; s = Math.floor(s / 2)) out.push(s); return out; }
// Memory of a texture (4 bytes per pixel, uncompressed) with and without its mip chain, in MB.
export function textureMB(res, mips = true, bpp = 4) { const px = (mips ? mipChain(res) : [res]).reduce((a, s) => a + s * s, 0); return px * bpp / (1024 * 1024); }

// ─── A park of statues (stage 4) ──────────────────────────────────────────────
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
    const H = MODEL_H * it.s, pct = screenPct(H, it.d);
    let l = lods ? activeLod(pct, thr, bias) : (pct >= cull ? 0 : -1);
    if (!lods && cull <= 0) l = 0;
    if (l < 0) { if (pct >= 1) lostBig++; continue; }
    per[l]++; drawn++; tris += lodTris(LODS[l]);
    worst = Math.max(worst, errorPx(lodError(LODS[l]) * it.s, it.d));
  }
  return { tris, drawn, culled: items.length - drawn, per, worst, lostBig };
}
