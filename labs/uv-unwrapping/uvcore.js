// UV Unwrap Lab · the UV maths, with no DOM and no three.js so it can be tested with node.
// A mesh is { v: [[x, y, z], …], f: [[i, j, k, l], …] } (Z up, faces counter-clockwise seen from outside),
// as in the Edit Mode Lab. UVs are stored per face corner: uv[face][corner] = [u, v], like Blender's UV loops.
// Seams are edge keys ('a_b', smaller index first).
import { ek, keyVerts, edgeFaces, faceEdges, box, uvSphere } from '../editmode/em.js?v=1';
export { ek, keyVerts, edgeFaces, faceEdges };

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const r6 = x => { const r = Math.round(x * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
export const V3 = { add, sub, mul, dot, cross, len, nrm };

// ─── Meshes ──────────────────────────────────────────────────────────────────
export function cylinder(n = 16, r = 1, z0 = -1, z1 = 1, c = [0, 0]) {
  const v = [], f = [], off = Math.PI / n;
  for (const z of [z0, z1]) for (let j = 0; j < n; j++) { const a = 2 * Math.PI * j / n + off; v.push([r6(c[0] + r * Math.cos(a)), r6(c[1] + r * Math.sin(a)), z]); }
  for (let j = 0; j < n; j++) { const k = (j + 1) % n; f.push([j, k, n + k, n + j]); }
  f.push(Array.from({ length: n }, (_, j) => n + j));
  f.push(Array.from({ length: n }, (_, j) => n - 1 - j));
  return { v, f };
}
function merge(...ms) {
  const out = { v: [], f: [] };
  for (const m of ms) { const o = out.v.length; out.v.push(...m.v.map(p => [...p])); out.f.push(...m.f.map(f => f.map(i => i + o))); }
  return out;
}
export function house() {
  const x = 1, y = 1.25, z0 = -1.2, z1 = 0.4, zr = 1.3;
  const v = [[-x, -y, z0], [x, -y, z0], [x, -y, z1], [0, -y, zr], [-x, -y, z1], [-x, y, z0], [x, y, z0], [x, y, z1], [0, y, zr], [-x, y, z1]];
  const f = [[0, 1, 2, 3, 4], [6, 5, 9, 8, 7], [1, 6, 7, 2], [5, 0, 4, 9], [4, 3, 8, 9], [2, 7, 8, 3], [0, 5, 6, 1]];
  return merge({ v, f }, box([0.3, 0.15, 0.2], [0.7, 0.55, 1.55]));
}
export function table() {
  const legs = [[-1, -0.5], [1, -0.5], [1, 0.5], [-1, 0.5]].map(c => cylinder(8, 0.08, -0.9, 0.45, c));
  return merge(box([-1.2, -0.7, 0.45], [1.2, 0.7, 0.6]), ...legs);
}
export const MESHES = { cube: () => box(), cylinder: () => cylinder(), sphere: () => uvSphere(16, 8, 1), house, table };
export const MESH_NAMES = { cube: 'Cube', cylinder: 'Cylinder', sphere: 'Sphere', house: 'House', table: 'Table' };
export const edgesOf = m => [...edgeFaces(m).keys()];
// Blender's edge loop, plus the rim of an n-gon (the cap of a cylinder), where the vertices have 3 edges.
export function loopOf(m, a, b, edgeLoop) {
  const L = edgeLoop(m, a, b);
  if (L.length > 1) return L;
  const ng = (edgeFaces(m).get(ek(a, b)) || []).map(fi => m.f[fi]).find(f => f.length > 4);
  return ng ? faceEdges(ng) : L;
}

// World position of a vertex (object scale applied, as the 3D Viewport shows it).
export const worldV = (m, scale = [1, 1, 1]) => m.v.map(p => [p[0] * scale[0], p[1] * scale[1], p[2] * scale[2]]);
export const allFaces = m => m.f.map((_, i) => i);
const cloneUV = uv => uv.map(f => f.map(p => [...p]));
export { cloneUV };

// ─── Reset: every face covers the whole image ────────────────────────────────
function resetFace(n) {
  if (n === 4) return [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (n === 3) return [[0, 0], [1, 0], [1, 1]];
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 - Math.PI / n + 2 * Math.PI * i / n; return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; });
}
export function resetUV(m, uv = null, faces = allFaces(m)) {
  const out = uv ? cloneUV(uv) : m.f.map(f => resetFace(f.length));
  for (const fi of faces) out[fi] = resetFace(m.f[fi].length);
  return out;
}

// ─── Islands ─────────────────────────────────────────────────────────────────
class DSU { constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); } find(x) { while (this.p[x] !== x) x = this.p[x] = this.p[this.p[x]]; return x; } union(a, b) { this.p[this.find(a)] = this.find(b); } }
// Faces joined by edges that are not seams (only among `faces`).
export function seamIslands(m, seams, faces = allFaces(m)) {
  const S = new Set(seams), inSet = new Set(faces), idx = new Map(faces.map((f, i) => [f, i])), d = new DSU(faces.length);
  for (const [k, fs] of edgeFaces(m)) { if (S.has(k)) continue; const own = fs.filter(f => inSet.has(f)); for (let i = 1; i < own.length; i++) d.union(idx.get(own[0]), idx.get(own[i])); }
  const g = new Map(); faces.forEach((f, i) => { const r = d.find(i); if (!g.has(r)) g.set(r, []); g.get(r).push(f); });
  return [...g.values()];
}
const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-5 && Math.abs(p[1] - q[1]) < 1e-5;
const cornerOf = (m, fi, vi) => m.f[fi].indexOf(vi);
// UV islands: faces joined by an edge whose two ends have the same UVs on both faces (as Blender finds them).
export function uvIslands(m, uv, faces = allFaces(m)) {
  const inSet = new Set(faces), idx = new Map(faces.map((f, i) => [f, i])), d = new DSU(faces.length);
  for (const [k, fs] of edgeFaces(m)) {
    const own = fs.filter(f => inSet.has(f)); if (own.length < 2) continue;
    const [a, b] = keyVerts(k);
    for (let i = 1; i < own.length; i++) {
      const f0 = own[0], f1 = own[i];
      if (same(uv[f0][cornerOf(m, f0, a)], uv[f1][cornerOf(m, f1, a)]) && same(uv[f0][cornerOf(m, f0, b)], uv[f1][cornerOf(m, f1, b)])) d.union(idx.get(f0), idx.get(f1));
    }
  }
  const g = new Map(); faces.forEach((f, i) => { const r = d.find(i); if (!g.has(r)) g.set(r, []); g.get(r).push(f); });
  return [...g.values()];
}

// ─── LSCM (least squares conformal maps) ────────────────────────────────────
// The corners of an island are grouped into UV vertices: two corners of the same mesh vertex share a UV vertex
// when a chain of faces joined by non-seam edges goes from one to the other.
function islandVerts(m, seams, faces) {
  const S = new Set(seams), corners = [], cid = new Map();
  for (const fi of faces) m.f[fi].forEach((vi, ci) => { cid.set(`${fi}:${ci}`, corners.length); corners.push({ fi, ci, vi }); });
  const d = new DSU(corners.length), inSet = new Set(faces);
  for (const [k, fs] of edgeFaces(m)) {
    if (S.has(k)) continue; const own = fs.filter(f => inSet.has(f)); if (own.length < 2) continue;
    for (const vi of keyVerts(k)) for (let i = 1; i < own.length; i++) d.union(cid.get(`${own[0]}:${cornerOf(m, own[0], vi)}`), cid.get(`${own[i]}:${cornerOf(m, own[i], vi)}`));
  }
  const local = new Map(), verts = [];
  corners.forEach((c, i) => { const r = d.find(i); if (!local.has(r)) { local.set(r, verts.length); verts.push(c.vi); } c.lv = local.get(r); });
  const faceLV = new Map(); for (const c of corners) { if (!faceLV.has(c.fi)) faceLV.set(c.fi, []); faceLV.get(c.fi)[c.ci] = c.lv; }
  return { verts, faceLV };
}
function cholSolve(A, b, n) {
  const L = new Float64Array(n * n);
  let tr = 0; for (let i = 0; i < n; i++) tr += A[i * n + i];
  const eps = Math.max(1e-12, tr / n * 1e-9);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * n + j] + (i === j ? eps : 0);
    for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j * n + j];
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}
export function lscm(P, tris, pins) {
  const n = P.length, pinned = new Map(pins.map(p => [p.i, p.uv]));
  const free = [], col = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (!pinned.has(i)) { col[i] = free.length; free.push(i); }
  const N = 2 * free.length, F = free.length, A = new Float64Array(N * N), rhs = new Float64Array(N);
  const addRow = entries => { // entries: [vertex, isV, coef]
    let c0 = 0; const e = [];
    for (const [vi, isV, w] of entries) { if (pinned.has(vi)) c0 += w * pinned.get(vi)[isV ? 1 : 0]; else e.push([col[vi] + (isV ? F : 0), w]); }
    for (const [i, wi] of e) { rhs[i] -= wi * c0; for (const [j, wj] of e) A[i * N + j] += wi * wj; }
  };
  for (const [i0, i1, i2] of tris) {
    const p0 = P[i0], p1 = P[i1], p2 = P[i2], e1 = sub(p1, p0), l1 = len(e1); if (l1 < 1e-12) continue;
    const x1 = l1, ax = nrm(e1), e2 = sub(p2, p0), x2 = dot(e2, ax), y2 = len(sub(e2, mul(ax, x2)));
    const area2 = x1 * y2; if (area2 < 1e-14) continue;
    const s = 1 / Math.sqrt(area2), z = [[0, 0], [x1, 0], [x2, y2]], ids = [i0, i1, i2];
    const W = [0, 1, 2].map(j => { const a = z[(j + 2) % 3], b = z[(j + 1) % 3]; return [(a[0] - b[0]) * s, (a[1] - b[1]) * s]; });
    addRow(ids.flatMap((vi, j) => [[vi, 0, W[j][0]], [vi, 1, -W[j][1]]]));
    addRow(ids.flatMap((vi, j) => [[vi, 0, W[j][1]], [vi, 1, W[j][0]]]));
  }
  const x = N ? cholSolve(A, rhs, N) : [];
  return P.map((_, i) => pinned.has(i) ? [...pinned.get(i)] : [x[col[i]], x[col[i] + F]]);
}
const fan = f => { const t = []; for (let i = 1; i < f.length - 1; i++) t.push([f[0], f[i], f[i + 1]]); return t; };
const area2d = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const area3d = pts => { let n = [0, 0, 0]; for (let i = 1; i < pts.length - 1; i++) n = add(n, cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0]))); return len(n) / 2; };
// Flatten one island (faces joined by non-seam edges). A closed island (no boundary) still gets UVs,
// but they fold over themselves: the surface cannot lie flat without cuts.
function flattenIsland(m, seams, faces, W, minStretch = false) {
  const { verts, faceLV } = islandVerts(m, seams, faces), P = verts.map(vi => W[vi]);
  const tris = faces.flatMap(fi => fan(faceLV.get(fi)));
  const use = new Map(); for (const fi of faces) { const L = faceLV.get(fi); L.forEach((a, i) => { const b = L[(i + 1) % L.length], k = a < b ? `${a}_${b}` : `${b}_${a}`; use.set(k, (use.get(k) || 0) + 1); }); }
  const bnd = new Set([...use].filter(([, c]) => c === 1).flatMap(([k]) => k.split('_').map(Number)));
  const cand = bnd.size >= 2 ? [...bnd] : P.map((_, i) => i);
  let best = [cand[0], cand[1] ?? cand[0]], bd = -1;
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) { const d = len(sub(P[cand[i]], P[cand[j]])); if (d > bd + 1e-9) { bd = d; best = [cand[i], cand[j]]; } }
  let U;
  if (best[0] === best[1]) U = P.map(() => [0, 0]);
  else U = lscm(P, tris, [{ i: best[0], uv: [0, 0] }, { i: best[1], uv: [bd, 0] }]);
  // Make it face up (not mirrored) and give it the real size (1 UV unit = 1 m before packing).
  let sa = 0; for (const fi of faces) sa += area2d(faceLV.get(fi).map(lv => U[lv]));
  if (sa < 0) { for (const p of U) p[0] = -p[0]; sa = -sa; }
  const a3 = faces.reduce((s, fi) => s + area3d(m.f[fi].map(i => W[i])), 0), k = sa > 1e-12 ? Math.sqrt(a3 / sa) : 1;
  for (const p of U) { p[0] *= k; p[1] *= k; }
  if (minStretch && bnd.size >= 2) arap(P, tris, U);
  return new Map(faces.map(fi => [fi, faceLV.get(fi).map(lv => [...U[lv]])]));
}
// Minimum Stretch (lab version): "as rigid as possible" steps after the conformal solve. Each triangle is
// turned to fit its UVs, then the UVs are solved again to keep every triangle as close as possible to its
// real size and shape. It evens out the area that the conformal solve squeezes.
function arap(P, tris, U, iters = 12) {
  const n = U.length; if (n < 3) return;
  const T = tris.map(([a, b, c]) => { const e1 = sub(P[b], P[a]), l1 = len(e1), ax = mul(e1, 1 / (l1 || 1)), e2 = sub(P[c], P[a]), x2 = dot(e2, ax); return { v: [a, b, c], q: [[0, 0], [l1, 0], [x2, len(sub(e2, mul(ax, x2)))]] }; });
  const N = n - 1, A = new Float64Array(N * N), id = i => i - 1;  // vertex 0 stays where it is
  for (const t of T) for (let e = 0; e < 3; e++) { const i = t.v[e], j = t.v[(e + 1) % 3]; for (const [a, b] of [[i, j], [j, i]]) { if (a) { A[id(a) * N + id(a)] += 1; if (b) A[id(a) * N + id(b)] -= 1; } } }
  for (let it = 0; it < iters; it++) {
    const bx = new Float64Array(N), by = new Float64Array(N);
    for (const t of T) {
      let m00 = 0, m01 = 0, m10 = 0, m11 = 0;
      for (let e = 0; e < 3; e++) { const i = t.v[e], j = t.v[(e + 1) % 3], qx = t.q[e][0] - t.q[(e + 1) % 3][0], qy = t.q[e][1] - t.q[(e + 1) % 3][1], ux = U[i][0] - U[j][0], uy = U[i][1] - U[j][1]; m00 += ux * qx; m01 += ux * qy; m10 += uy * qx; m11 += uy * qy; }
      const th = Math.atan2(m10 - m01, m00 + m11), c = Math.cos(th), s = Math.sin(th);
      for (let e = 0; e < 3; e++) {
        const i = t.v[e], j = t.v[(e + 1) % 3], qx = t.q[e][0] - t.q[(e + 1) % 3][0], qy = t.q[e][1] - t.q[(e + 1) % 3][1], rx = c * qx - s * qy, ry = s * qx + c * qy;
        if (i) { bx[id(i)] += rx; by[id(i)] += ry; if (!j) { bx[id(i)] += U[0][0]; by[id(i)] += U[0][1]; } }
        if (j) { bx[id(j)] -= rx; by[id(j)] -= ry; if (!i) { bx[id(j)] += U[0][0]; by[id(j)] += U[0][1]; } }
      }
    }
    const x = cholSolve(A, bx, N), y = cholSolve(A, by, N);
    for (let i = 1; i < n; i++) { U[i][0] = x[i - 1]; U[i][1] = y[i - 1]; }
  }
}
// U › Unwrap: only the selected faces; seams and the edge of the selection cut the islands.
// Blender unwraps the mesh without the object scale (it warns when the scale is not 1).
export function unwrap(m, uv, faces, seams, { margin = 0.001, method = 'angle' } = {}) {
  const out = cloneUV(uv), islands = seamIslands(m, seams, faces);
  for (const isl of islands) for (const [fi, pts] of flattenIsland(m, seams, isl, m.v, method === 'minimum')) out[fi] = pts;
  return pack(m, out, faces, { margin, rotate: true, islands });
}
// Is the island closed (no boundary to open it on)? Then Unwrap folds it.
export function closedIslands(m, seams, faces) {
  return seamIslands(m, seams, faces).filter(isl => { const { faceLV } = islandVerts(m, seams, isl), use = new Map(); for (const fi of isl) { const L = faceLV.get(fi); L.forEach((a, i) => { const b = L[(i + 1) % L.length], k = a < b ? `${a}_${b}` : `${b}_${a}`; use.set(k, (use.get(k) || 0) + 1); }); } return ![...use.values()].some(c => c === 1); });
}

// ─── Pack Islands, Average Islands Scale ─────────────────────────────────────
const ptsOf = (uv, isl) => isl.flatMap(fi => uv[fi]);
function bboxOf(pts) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; }
function transformIsland(uv, isl, fn) { for (const fi of isl) uv[fi] = uv[fi].map(fn); }
export function pack(m, uv, faces, { margin = 0.001, rotate = true, islands = null } = {}) {
  const out = cloneUV(uv), isl = islands || uvIslands(m, out, faces);
  if (!isl.length) return out;
  const items = isl.map(I => {
    if (rotate) {
      const pts = ptsOf(out, I), c = bboxOf(pts); const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      let best = 0, ba = Infinity;
      for (let d = 0; d < 90; d += 3) { const a = d * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a); const b = bboxOf(pts.map(([x, y]) => [cs * (x - cx) - sn * (y - cy), sn * (x - cx) + cs * (y - cy)])); const ar = b.w * b.h + 1e-9 * d; if (ar < ba - 1e-9) { ba = ar; best = a; } }
      let cs = Math.cos(best), sn = Math.sin(best);
      transformIsland(out, I, ([x, y]) => [cs * (x - cx) - sn * (y - cy), sn * (x - cx) + cs * (y - cy)]);
      const b = bboxOf(ptsOf(out, I)); if (b.h > b.w * 1.0001) transformIsland(out, I, ([x, y]) => [y, -x]);
    }
    const b = bboxOf(ptsOf(out, I));
    return { I, b };
  });
  items.sort((p, q) => q.b.h - p.b.h || q.b.w - p.b.w);
  const place = s => {
    let x = margin, y = margin, rowH = 0; const pos = [];
    for (const it of items) {
      const w = it.b.w * s, h = it.b.h * s;
      if (x > margin && x + w > 1 - margin + 1e-12) { x = margin; y += rowH + margin; rowH = 0; }
      pos.push([x, y]); x += w + margin; rowH = Math.max(rowH, h);
    }
    return { pos, ok: y + rowH <= 1 - margin + 1e-12 && items.every(it => it.b.w * s <= 1 - 2 * margin + 1e-12) };
  };
  let lo = 0, hi = 1 / Math.max(1e-9, ...items.map(it => Math.max(it.b.w, it.b.h)));
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (place(mid).ok) lo = mid; else hi = mid; }
  const s = lo, { pos } = place(s);
  items.forEach((it, i) => { let [px, py] = pos[i]; if (it.b.w * s < 0.01 && items.length === 1) px = 0.5; if (it.b.h * s < 0.01 && items.length === 1) py = 0.5; transformIsland(out, it.I, ([x, y]) => [px + (x - it.b.x0) * s, py + (y - it.b.y0) * s]); });
  return out;
}
export function islandArea(m, uv, isl, W) { let a2 = 0, a3 = 0; for (const fi of isl) { a2 += Math.abs(area2d(uv[fi])); a3 += area3d(m.f[fi].map(i => W[i])); } return { a2, a3 }; }
export function averageScale(m, uv, faces, scale = [1, 1, 1]) {
  const out = cloneUV(uv), W = worldV(m, scale), isl = uvIslands(m, out, faces);
  const ar = isl.map(I => islandArea(m, out, I, W)), t2 = ar.reduce((s, a) => s + a.a2, 0), t3 = ar.reduce((s, a) => s + a.a3, 0);
  if (t2 < 1e-12) return out;
  const target = Math.sqrt(t2 / t3);
  isl.forEach((I, i) => { const { a2, a3 } = ar[i]; if (a2 < 1e-14) return; const k = target / Math.sqrt(a2 / a3), b = bboxOf(ptsOf(out, I)), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; transformIsland(out, I, ([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]); });
  return out;
}
// Move, scale or rotate the UVs of some faces about a pivot (the UV Editor's G, S, R).
export function transformUV(uv, faces, { t = [0, 0], s = [1, 1], r = 0, pivot = [0.5, 0.5] } = {}) {
  const out = cloneUV(uv), cs = Math.cos(r), sn = Math.sin(r);
  for (const fi of new Set(faces)) out[fi] = out[fi].map(([x, y]) => { let a = (x - pivot[0]) * s[0], b = (y - pivot[1]) * s[1]; [a, b] = [cs * a - sn * b, sn * a + cs * b]; return [pivot[0] + a + t[0], pivot[1] + b + t[1]]; });
  return out;
}
export function scaleToBounds(uv, faces) {
  const out = cloneUV(uv), b = bboxOf(faces.flatMap(fi => out[fi]));
  if (b.w < 1e-9 || b.h < 1e-9) return out;
  for (const fi of faces) out[fi] = out[fi].map(([x, y]) => [(x - b.x0) / b.w, (y - b.y0) / b.h]);
  return out;
}
function fitCentered(uv, faces) {
  const out = cloneUV(uv), b = bboxOf(faces.flatMap(fi => out[fi])), k = 1 / Math.max(b.w, b.h, 1e-9);
  const ox = (1 - b.w * k) / 2, oy = (1 - b.h * k) / 2;
  for (const fi of faces) out[fi] = out[fi].map(([x, y]) => [ox + (x - b.x0) * k, oy + (y - b.y0) * k]);
  return out;
}

// ─── Projections ─────────────────────────────────────────────────────────────
// basis: the view, as { r, u, f, eye } (right, up, forward, camera position), and ortho.
function selCenter(W, m, faces) { const b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }; for (const fi of faces) for (const i of m.f[fi]) for (let k = 0; k < 3; k++) { b.lo[k] = Math.min(b.lo[k], W[i][k]); b.hi[k] = Math.max(b.hi[k], W[i][k]); } return mul(add(b.lo, b.hi), 0.5); }
export function projectFromView(m, uv, faces, view, { ortho = true, bounds = false, scale = [1, 1, 1] } = {}) {
  const out = cloneUV(uv), W = worldV(m, scale);
  for (const fi of faces) out[fi] = m.f[fi].map(i => {
    const p = W[i];
    if (ortho || !view.eye) return [dot(p, view.r), dot(p, view.u)];
    const d = sub(p, view.eye), z = Math.max(1e-6, dot(d, view.f));
    return [dot(d, view.r) / z, dot(d, view.u) / z];
  });
  return bounds ? scaleToBounds(out, faces) : fitCentered(out, faces);
}
// Axes for Cylinder and Sphere Projection: z is the pole, y points away from the front (the seam is at the back).
export function projectAxes(direction, view) {
  if (direction === 'object' || !view) return { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  if (direction === 'equator') return { x: view.r, y: view.f, z: view.u };
  const z = mul(view.f, -1), x = view.r; return { x, y: cross(z, x), z };
}
function wrapFix(pts, polar) {
  // A face across the seam: move its corners near u = 0 to u = 1 (as Blender does). Corners on a pole take
  // the u of the other corners of the face.
  const us = pts.map((p, i) => polar[i] ? null : p[0]).filter(u => u != null);
  if (us.length && Math.max(...us) - Math.min(...us) > 0.5) pts.forEach((p, i) => { if (!polar[i] && p[0] < 0.5) p[0] += 1; });
  const good = pts.filter((_, i) => !polar[i]);
  if (good.length) { const mu = good.reduce((s, p) => s + p[0], 0) / good.length; pts.forEach((p, i) => { if (polar[i]) p[0] = mu; }); }
  return pts;
}
function roundProject(m, uv, faces, kind, { direction = 'equator', view = null, radius = 1, bounds = false, scale = [1, 1, 1] } = {}) {
  const out = cloneUV(uv), W = worldV(m, scale), c = selCenter(W, m, faces), ax = projectAxes(direction, view);
  for (const fi of faces) {
    const polar = [], pts = m.f[fi].map(i => {
      const d = sub(W[i], c), px = dot(d, ax.x), py = dot(d, ax.y), pz = dot(d, ax.z), rxy = Math.hypot(px, py);
      polar.push(rxy < 1e-6);
      const u = Math.atan2(px, -py) / (2 * Math.PI) + 0.5;
      const v = kind === 'sphere' ? Math.atan2(pz, rxy) / Math.PI + 0.5 : pz / (2 * radius) + 0.5;
      return [u, v];
    });
    out[fi] = wrapFix(pts, polar);
  }
  return bounds ? scaleToBounds(out, faces) : out;
}
export const cylinderProject = (m, uv, faces, o = {}) => roundProject(m, uv, faces, 'cylinder', o);
export const sphereProject = (m, uv, faces, o = {}) => roundProject(m, uv, faces, 'sphere', o);
// Normal of a face (from its corners, so it works for n-gons).
export function normalOf(W, f) { let n = [0, 0, 0]; for (let i = 1; i < f.length - 1; i++) n = add(n, cross(sub(W[f[i]], W[f[0]]), sub(W[f[i + 1]], W[f[0]]))); return nrm(n); }
// Right and up of a plane seen from the outside (so the projection is not mirrored).
function planeAxes(n) { const up = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, n[2] > 0 ? 1 : -1, 0], r = nrm(cross(up, n)); return { r, u: cross(n, r) }; }
export function cubeProject(m, uv, faces, { size = 2, bounds = false, scale = [1, 1, 1] } = {}) {
  const out = cloneUV(uv), W = worldV(m, scale), c = selCenter(W, m, faces);
  for (const fi of faces) {
    const n = normalOf(W, m.f[fi]), k = [0, 1, 2].reduce((a, i) => Math.abs(n[i]) > Math.abs(n[a]) ? i : a, 0);
    const axis = [0, 0, 0]; axis[k] = Math.sign(n[k]) || 1; const { r, u } = planeAxes(axis);
    out[fi] = m.f[fi].map(i => { const d = sub(W[i], c); return [0.5 + dot(d, r) / size, 0.5 + dot(d, u) / size]; });
  }
  return bounds ? scaleToBounds(out, faces) : out;
}
// Smart UV Project: groups faces by direction (Angle Limit), projects each group flat and packs the islands.
export function smartProject(m, uv, faces, { angle = 66, margin = 0, scale = [1, 1, 1] } = {}) {
  if (!faces.length) return cloneUV(uv);
  const out = cloneUV(uv), W = worldV(m, scale), N = new Map(faces.map(fi => [fi, normalOf(W, m.f[fi])])), A = new Map(faces.map(fi => [fi, area3d(m.f[fi].map(i => W[i]))]));
  const lim = Math.cos(angle * Math.PI / 180), order = [...faces].sort((a, b) => A.get(b) - A.get(a)), vecs = [N.get(order[0])];
  for (;;) {
    let worst = null, wd = 2;
    for (const fi of order) { const d = Math.max(...vecs.map(v => dot(v, N.get(fi)))); if (d < wd - 1e-9) { wd = d; worst = fi; } }
    if (worst == null || wd >= lim) break; vecs.push(N.get(worst));
  }
  const group = new Map(faces.map(fi => [fi, vecs.reduce((a, v, i) => dot(v, N.get(fi)) > dot(vecs[a], N.get(fi)) ? i : a, 0)]));
  const ef = edgeFaces(m), d = new DSU(faces.length), idx = new Map(faces.map((f, i) => [f, i]));
  for (const fs of ef.values()) { const own = fs.filter(f => idx.has(f)); for (let i = 1; i < own.length; i++) if (group.get(own[0]) === group.get(own[i])) d.union(idx.get(own[0]), idx.get(own[i])); }
  const isl = new Map(); faces.forEach((f, i) => { const r = d.find(i); if (!isl.has(r)) isl.set(r, []); isl.get(r).push(f); });
  for (const fi of faces) { const { r, u } = planeAxes(vecs[group.get(fi)]); out[fi] = m.f[fi].map(i => [dot(W[i], r), dot(W[i], u)]); }
  return pack(m, out, faces, { margin: Math.max(margin, 0.001), rotate: true, islands: [...isl.values()] });
}

// Lightmap Pack: every face is its own island, flat, packed with a margin (for lightmaps: no pixel is shared).
export function lightmapPack(m, uv, faces, { margin = 0.1, scale = [1, 1, 1] } = {}) {
  const out = cloneUV(uv), W = worldV(m, scale);
  for (const fi of faces) { const { r, u } = planeAxes(normalOf(W, m.f[fi])); out[fi] = m.f[fi].map(i => [dot(W[i], r), dot(W[i], u)]); }
  return pack(m, out, faces, { margin: margin * 0.05, rotate: true, islands: faces.map(fi => [fi]) });
}
// Follow Active Quads: the active quad keeps its UVs and the selected quads around it follow its grid,
// each new quad continuing the one before it (Edge Length Mode: Length Average, or Even).
export function followActiveQuads(m, uv, faces, active, { mode = 'average', scale = [1, 1, 1] } = {}) {
  const out = cloneUV(uv), W = worldV(m, scale), F = new Set(faces.filter(fi => m.f[fi].length === 4));
  if (!F.has(active)) return null;
  const ef = edgeFaces(m), done = new Set([active]), queue = [active], L = (a, b) => len(sub(W[a], W[b]));
  while (queue.length) {
    const q = queue.shift(), f = m.f[q];
    for (let i = 0; i < 4; i++) {
      const a = f[i], b = f[(i + 1) % 4], nb = (ef.get(ek(a, b)) || []).find(x => x !== q && F.has(x) && !done.has(x)); if (nb == null) continue;
      const g = m.f[nb], ua = out[q][i], ub = out[q][(i + 1) % 4], ud = out[q][(i + 3) % 4], uc = out[q][(i + 2) % 4];
      const ja = g.indexOf(a), jb = g.indexOf(b), e = g[(jb + (g[(jb + 1) % 4] === a ? 3 : 1)) % 4], fv = g[(ja + (g[(ja + 1) % 4] === b ? 3 : 1)) % 4];
      // step across the shared edge: the same direction as in the quad before (Even), or scaled by the edge lengths (Length Average)
      const lenPrev = (L(a, f[(i + 3) % 4]) + L(b, f[(i + 2) % 4])) / 2 || 1, kk = mode === 'even' ? 1 : (L(b, e) + L(a, fv)) / 2 / lenPrev;
      const da = [ua[0] - ud[0], ua[1] - ud[1]], db = [ub[0] - uc[0], ub[1] - uc[1]];
      const pe = [ub[0] + db[0] * kk, ub[1] + db[1] * kk], pf = [ua[0] + da[0] * kk, ua[1] + da[1] * kk];
      const uvOf = v => v === a ? [...ua] : v === b ? [...ub] : v === e ? pe : pf;
      out[nb] = g.map(uvOf); done.add(nb); queue.push(nb);
    }
  }
  return out;
}

// ─── Checking the UVs ────────────────────────────────────────────────────────
// Per face: area (UV area ÷ 3D area, against the average), shape (how much the face is squashed or skewed:
// 0 = same shape, 1 = a line) and whether it is flipped or has no area.
function faceStretch(Wp, U) {
  let a3 = 0, sig = 0, flip = 0, ua = 0;
  for (let i = 1; i < Wp.length - 1; i++) {
    const p0 = Wp[0], e1 = sub(Wp[i], p0), e2 = sub(Wp[i + 1], p0), l1 = len(e1); if (l1 < 1e-12) continue;
    const ax = mul(e1, 1 / l1), x2 = dot(e2, ax), y2 = len(sub(e2, mul(ax, x2))), a = l1 * y2 / 2; if (a < 1e-14) continue;
    const q = [[l1, x2], [0, y2]], P = [[U[i][0] - U[0][0], U[i + 1][0] - U[0][0]], [U[i][1] - U[0][1], U[i + 1][1] - U[0][1]]];
    // J = P · Q⁻¹ (Q upper triangular)
    const qi = [[1 / l1, -x2 / (l1 * y2)], [0, 1 / y2]];
    const J = [[P[0][0] * qi[0][0] + P[0][1] * qi[1][0], P[0][0] * qi[0][1] + P[0][1] * qi[1][1]], [P[1][0] * qi[0][0] + P[1][1] * qi[1][0], P[1][0] * qi[0][1] + P[1][1] * qi[1][1]]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0], fro = J[0][0] ** 2 + J[0][1] ** 2 + J[1][0] ** 2 + J[1][1] ** 2;
    const disc = Math.sqrt(Math.max(0, fro * fro - 4 * det * det)), s1 = Math.sqrt((fro + disc) / 2), s2 = Math.sqrt(Math.max(0, (fro - disc) / 2));
    a3 += a; sig += a * (s1 > 1e-12 ? s2 / s1 : 0); ua += det * a; if (det < 0) flip += a; void q;
  }
  return { a3, shape: a3 ? 1 - sig / a3 : 1, uvA: ua, flipped: flip > a3 / 2 };
}
const triOverlap = (A, B) => {
  const sh = T => { const c = [(T[0][0] + T[1][0] + T[2][0]) / 3, (T[0][1] + T[1][1] + T[2][1]) / 3]; return T.map(p => [c[0] + (p[0] - c[0]) * 0.98, c[1] + (p[1] - c[1]) * 0.98]); };
  const a = sh(A), b = sh(B);
  for (const T of [a, b]) for (let i = 0; i < 3; i++) {
    const p = T[i], q = T[(i + 1) % 3], nx = q[1] - p[1], ny = p[0] - q[0];
    const pa = a.map(v => v[0] * nx + v[1] * ny), pb = b.map(v => v[0] * nx + v[1] * ny);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-12 || Math.max(...pb) <= Math.min(...pa) + 1e-12) return false;
  }
  return true;
};
export function report(m, uv, faces = allFaces(m), scale = [1, 1, 1]) {
  const W = worldV(m, scale), per = new Map();
  let t3 = 0, t2 = 0;
  for (const fi of faces) { const s = faceStretch(m.f[fi].map(i => W[i]), uv[fi]); per.set(fi, s); t3 += s.a3; t2 += Math.abs(s.uvA); }
  const ratio = t3 ? t2 / t3 : 0;
  let collapsed = 0, flipped = 0, maxArea = 0, maxShape = 0, sumArea = 0, sumShape = 0;
  for (const [, s] of per) {
    const r = ratio ? Math.abs(s.uvA) / s.a3 / ratio : 0; s.area = r > 0 ? 1 - Math.min(r, 1 / r) : 1;
    s.collapsed = s.shape > 0.95 || Math.abs(s.uvA) < 1e-9; if (s.collapsed) collapsed++;
    if (s.flipped) flipped++;
    maxArea = Math.max(maxArea, s.area); maxShape = Math.max(maxShape, s.shape); sumArea += s.area * s.a3; sumShape += s.shape * s.a3;
  }
  const isl = uvIslands(m, uv, faces);
  // Overlaps between faces that do not share a UV corner.
  const tris = faces.flatMap(fi => { const U = uv[fi]; const t = []; for (let i = 1; i < U.length - 1; i++) t.push({ fi, T: [U[0], U[i], U[i + 1]] }); return t; });
  const bb = tris.map(t => bboxOf(t.T)), over = new Set(), islOf = new Map(); isl.forEach((I, i) => I.forEach(fi => islOf.set(fi, i)));
  const key = p => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`, ck = new Map(faces.map(fi => [fi, new Set(uv[fi].map(key))]));
  for (let i = 0; i < tris.length; i++) for (let j = i + 1; j < tris.length; j++) {
    const a = tris[i], b = tris[j]; if (a.fi === b.fi) continue;
    if (bb[i].x1 <= bb[j].x0 || bb[j].x1 <= bb[i].x0 || bb[i].y1 <= bb[j].y0 || bb[j].y1 <= bb[i].y0) continue;
    if (triOverlap(a.T, b.T)) { if (islOf.get(a.fi) === islOf.get(b.fi) && !(per.get(a.fi).flipped || per.get(b.fi).flipped) && [...ck.get(b.fi)].some(k => ck.get(a.fi).has(k))) continue; over.add(a.fi); over.add(b.fi); }
  }
  let outside = 0; for (const fi of faces) if (uv[fi].some(([x, y]) => x < -1e-4 || y < -1e-4 || x > 1 + 1e-4 || y > 1 + 1e-4)) outside++;
  const dens = isl.map(I => { const a = islandArea(m, uv, I, W); return a.a3 > 0 ? Math.sqrt(a.a2 / a.a3) : 0; }).filter(d => d > 0);
  const mean = dens.reduce((s, d) => s + d, 0) / (dens.length || 1), cv = dens.length > 1 ? Math.sqrt(dens.reduce((s, d) => s + (d - mean) ** 2, 0) / dens.length) / mean : 0;
  const used = t2;
  return { faces: faces.length, per, islands: isl.length, islandList: isl, collapsed, flipped, overlaps: over.size, overlapFaces: over, outside, maxArea, maxShape,
    avgArea: t3 ? sumArea / t3 : 0, avgShape: t3 ? sumShape / t3 : 0, densityCV: cv, used };
}
// Blender's stretch colours: blue (none) → cyan → green → yellow → red (a lot).
export function stretchColor(x) {
  const s = [[0, [0.05, 0.1, 0.95]], [0.25, [0.05, 0.85, 0.95]], [0.5, [0.1, 0.9, 0.2]], [0.75, [0.98, 0.85, 0.05]], [1, [0.95, 0.1, 0.05]]];
  x = Math.max(0, Math.min(1, x));
  for (let i = 1; i < s.length; i++) if (x <= s[i][0]) { const [a, ca] = s[i - 1], [b, cb] = s[i], t = (x - a) / (b - a); return ca.map((c, k) => c + (cb[k] - c) * t); }
  return s[s.length - 1][1];
}
// Faces of the mesh where every edge is selected (Blender's rule in Edge select mode).
export function facesOfEdges(m, edges) { const E = new Set(edges); return m.f.map((f, i) => faceEdges(f).every(k => E.has(k)) ? i : -1).filter(i => i >= 0); }
export function boundaryOf(m, faces) { const F = new Set(faces); return [...edgeFaces(m)].filter(([, fs]) => fs.filter(f => F.has(f)).length === 1 && fs.length > 1).map(([k]) => k); }
export function edgesOfFaces(m, faces) { return [...new Set(faces.flatMap(fi => faceEdges(m.f[fi])))]; }
// Select Linked (L): the faces reached without crossing a seam.
export function linkedFaces(m, seams, fi) { return seamIslands(m, seams).find(I => I.includes(fi)) || [fi]; }

// Blender's default cube: the six faces in a cross, 3 × 4 squares of 0.25.
export function crossSeams(m) {
  // Faces of box(): 0 bottom, 1 top, 2 front, 3 right, 4 back, 5 left. Keep front joined to left, right, top and bottom, and top to back.
  const shared = (a, b) => faceEdges(m.f[a]).find(k => faceEdges(m.f[b]).includes(k));
  const keep = new Set([shared(2, 5), shared(2, 3), shared(2, 1), shared(2, 0), shared(1, 4)]);
  return edgesOf(m).filter(k => !keep.has(k));
}
export function defaultCubeUV(m) {
  let uv = unwrap(m, resetUV(m), allFaces(m), crossSeams(m), { margin: 0 });
  { const b0 = bboxOf(uv.flat()); if (b0.w > b0.h) uv = uv.map(f => f.map(([x, y]) => [-y, x])); }
  const b = bboxOf(uv.flat()), k = 0.25 / (Math.max(b.w, b.h) / 4);
  uv = uv.map(f => f.map(([x, y]) => [0.125 + (x - b.x0) * k, (y - b.y0) * k]));
  return uv.map(f => f.map(p => p.map(r6)));
}
