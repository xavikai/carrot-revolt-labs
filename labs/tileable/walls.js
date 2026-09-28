// Tileable Texture Lab: the four walls of a small building, their UV islands and the checks.
// One tile of the brick texture covers TILE_M metres. Pure JS (tested with node).

export const TILE_M = 2;
// Walls seen from outside, in order around the building (6 × 4 m, 3 m high).
// Each wall: width, height and its bottom-left / bottom-right corners in 3D (x, z).
export const WALLS = [
  { id: 'front', name: 'Front wall', w: 6, h: 3, a: [-3, 2], b: [3, 2] },
  { id: 'right', name: 'Right wall', w: 4, h: 3, a: [3, 2], b: [3, -2] },
  { id: 'back', name: 'Back wall', w: 6, h: 3, a: [3, -2], b: [-3, -2] },
  { id: 'left', name: 'Left wall', w: 4, h: 3, a: [-3, -2], b: [-3, 2] },
];
export const WALL = Object.fromEntries(WALLS.map(w => [w.id, w]));
export const HEIGHT = 3;

// An island is 4 UV corners in this order: bottom-left, bottom-right, top-right, top-left (as seen from outside).
export const quad = (u, v, du, dv) => [[u, v], [u + du, v], [u + du, v + dv], [u, v + dv]];
export const cloneUV = uv => Object.fromEntries(Object.entries(uv).map(([k, q]) => [k, q.map(p => [...p])]));
export function bbox(qs) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const q of qs) for (const [u, v] of q) { u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
  return { u0, v0, u1, v1, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2 };
}
export const translate = (q, du, dv) => q.map(([u, v]) => [u + du, v + dv]);
export const scale = (q, ku, kv, pu, pv) => q.map(([u, v]) => [pu + (u - pu) * ku, pv + (v - pv) * kv]);
export function rotate(q, deg, pu, pv) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return q.map(([u, v]) => { const x = u - pu, y = v - pv; return [pu + x * c - y * s, pv + x * s + y * c]; });
}

// What one island does with the texture.
export function report(id, q) {
  const W = WALL[id], [bl, br, , tl] = q;
  const eu = [br[0] - bl[0], br[1] - bl[1]], ev = [tl[0] - bl[0], tl[1] - bl[1]];
  const lu = Math.hypot(...eu), lv = Math.hypot(...ev);
  const coverU = W.w / Math.max(1e-9, lu), coverV = W.h / Math.max(1e-9, lv);
  const angle = Math.atan2(eu[1], eu[0]) * 180 / Math.PI, mirrored = eu[0] * ev[1] - eu[1] * ev[0] < 0;
  const upright = Math.abs(angle) < 2 && !mirrored;
  const sizeOk = Math.abs(coverU - TILE_M) / TILE_M < 0.04 && Math.abs(coverV - TILE_M) / TILE_M < 0.04;
  const aspectOk = Math.abs(coverU / coverV - 1) < 0.04;
  return { id, coverU, coverV, angle, mirrored, upright, sizeOk, aspectOk, ok: sizeOk && upright && aspectOk };
}
const fracDist = x => { const f = x - Math.floor(x); return Math.min(f, 1 - f); };
// Does the pattern continue from wall a (its right edge) into wall b (its left edge)? Both corners must land on the same point of the tile.
export function joins(uv, a, b, tol = 0.012) {
  const A = uv[a], B = uv[b];
  const d1 = [A[1][0] - B[0][0], A[1][1] - B[0][1]], d2 = [A[2][0] - B[3][0], A[2][1] - B[3][1]];
  return fracDist(d1[0]) < tol && fracDist(d1[1]) < tol && fracDist(d2[0]) < tol && fracDist(d2[1]) < tol;
}
export const CORNERS = WALLS.map((w, i) => [w.id, WALLS[(i + 1) % WALLS.length].id]);

// Unwrap + Pack: every wall inside the 0–1 square, all at the same small scale (one tile = 13 m).
export function packedUV() {
  const k = 1 / 13;
  return { front: quad(0.02, 0.02, 6 * k, 3 * k), right: quad(0.52, 0.02, 4 * k, 3 * k), back: quad(0.02, 0.3, 6 * k, 3 * k), left: quad(0.52, 0.3, 4 * k, 3 * k) };
}
// Every wall at 2 m per tile, in a row, touching: the pattern runs round the building.
export function solvedUV(u0 = 0, v0 = 0) {
  const out = {}; let u = u0;
  for (const w of WALLS) { out[w.id] = quad(u, v0, w.w / TILE_M, w.h / TILE_M); u += w.w / TILE_M; }
  return out;
}
// Right size, but scattered: the rows jump at every corner.
export function scatteredUV() {
  return { front: quad(0.1, 0.23, 3, 1.5), right: quad(3.55, -0.62, 2, 1.5), back: quad(-0.4, 1.9, 3, 1.5), left: quad(2.8, 1.47, 2, 1.5) };
}
