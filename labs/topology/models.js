// Topology Lab: the models of every stage and the measurements the steps check.
import { ek, clone, subdivide, stats, V, edgeFaces, vertexEdges } from './mesh.js';

// ─── Building blocks ─────────────────────────────────────────────────────────
// A grid in the XY plane, facing +Z (towards the camera): (nx × ny) quads.
export function grid(nx, ny, w = 2, h = 1.5) {
  const v = [], f = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v.push([-w / 2 + w * i / nx, -h / 2 + h * j / ny, 0]);
  const at = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  return { v, f, crease: {}, at };
}
export function box(hx, hy, hz) {
  return { v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], f: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]], crease: {} };
}
// A tube along X (the arm): rings at the given x positions, n sides, open at both ends.
export const ARM_R = 0.25;
export function tube(xs, n = 8, r = ARM_R) {
  const v = [], f = [];
  xs.forEach(x => { for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; v.push([x, r * Math.cos(a), r * Math.sin(a)]); } });
  for (let i = 0; i < xs.length - 1; i++) for (let k = 0; k < n; k++) { const a = i * n + k, b = i * n + (k + 1) % n; f.push([a, b, b + n, a + n]); }
  return { v, f, crease: {} };
}
// A bottle: a cylinder whose top is closed by 5 quads around a centre (an E-pole with five edges,
// and five N-poles with three edges on the rim). Open at the bottom.
export function bottle() {
  const n = 10, rings = [[-0.8, 0.55], [-0.2, 0.55], [0.35, 0.55]], v = [], f = [];
  rings.forEach(([y, r]) => { for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; v.push([r * Math.cos(a), y, -r * Math.sin(a)]); } });
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < n; k++) { const a = i * n + k, b = i * n + (k + 1) % n; f.push([a, b, b + n, a + n]); }
  const top = (rings.length - 1) * n, c = v.length; v.push([0, 0.62, 0]);
  for (let k = 0; k < n; k += 2) f.push([top + k, top + k + 1, top + (k + 2) % n, c]);
  return { v, f, crease: {} };
}

// ─── Read the mesh ───────────────────────────────────────────────────────────
// A panel with two hexagons (two quads merged each) and a pentagon.
export function ngonPanel() {
  const g = grid(5, 3, 2.4, 1.44), at = g.at;
  const q = (i, j) => [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
  const skip = new Set();
  const faces = [];
  // hexagon 1: quads (0,0)+(1,0); hexagon 2: quads (3,1)+(3,2)
  faces.push([at(0, 0), at(1, 0), at(2, 0), at(2, 1), at(1, 1), at(0, 1)]); skip.add('0,0'); skip.add('1,0');
  faces.push([at(3, 1), at(4, 1), at(4, 2), at(4, 3), at(3, 3), at(3, 2)]); skip.add('3,1'); skip.add('3,2');
  for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) if (!skip.has(`${i},${j}`)) faces.push(q(i, j));
  return { v: g.v, f: faces, crease: {} };
}
// A panel with pairs of triangles (a quad split along its diagonal).
export function triPanel() {
  const g = grid(5, 3, 2.4, 1.44), at = g.at, f = [];
  const split = new Set(['1,0', '2,1', '4,1', '0,2', '3,2']);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    if (split.has(`${i},${j}`)) { (i + j) % 2 ? f.push([a, b, c], [a, c, d]) : f.push([a, b, d], [b, c, d]); } else f.push([a, b, c, d]);
  }
  return { v: g.v, f, crease: {} };
}

// ─── Subdivision ─────────────────────────────────────────────────────────────
export const SLAB = [1, 0.3, 0.7];                       // half sizes of the box
// A box with an extra vertex in the middle of the front top edge: the top and the front are pentagons.
export function pinchedSlab() {
  const m = box(...SLAB), mid = m.v.length;
  m.v.push([0, SLAB[1], SLAB[2]]);
  // top face [2,3,7,6] has edge 7-6? front face [4,5,6,7] has edge 6-7
  m.f = m.f.map(f => { const i = f.indexOf(6), j = f.indexOf(7); if (i < 0 || j < 0) return f; const nf = []; f.forEach((x, k) => { nf.push(x); const y = f[(k + 1) % f.length]; if ((x === 6 && y === 7) || (x === 7 && y === 6)) nf.push(mid); }); return nf; });
  return m;
}
// How far the subdivided surface falls from the corners of the box it came from (as a fraction of the thinnest size).
export function cornerLoss(m, levels, half = SLAB) {
  const s = subdivide(m, levels), thin = Math.min(...half) * 2;
  let worst = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = [sx * half[0], sy * half[1], sz * half[2]];
    let best = Infinity; for (const p of s.v) best = Math.min(best, V.len(V.sub(p, c)));
    worst = Math.max(worst, best);
  }
  return worst / thin;
}

// ─── Deformation ─────────────────────────────────────────────────────────────
// The arm bends at the elbow (x = 0) around Z. The weights blend smoothly over ±BLEND, like
// automatic weights. Every vertex is moved with linear blend skinning.
export const BLEND = 0.35;
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
export const elbowWeight = x => smooth((x + BLEND) / (2 * BLEND));
// preserve = false: linear blend skinning (Blender's default), the positions are blended and the inside
// of the joint collapses. preserve = true (Preserve Volume, dual quaternions): the rotations are blended,
// so each vertex turns by weight × angle around the joint and keeps its distance to it.
export function bend(m, deg, preserve = false) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { ...clone(m), v: m.v.map(([x, y, z]) => {
    const w = elbowWeight(x);
    if (preserve) { const b = a * w, cb = Math.cos(b), sb = Math.sin(b); return [x * cb - y * sb, x * sb + y * cb, z]; }
    const rx = x * c - y * s, ry = x * s + y * c; return [x + (rx - x) * w, y + (ry - y) * w, z];
  }) };
}
// How smoothly the elbow bends: follow the outer line of the arm (the vertex at the back of every ring)
// and measure how much it turns at each ring. A single loop at the joint makes a sharp corner; several
// loops spread across the bend make a smooth curve.
export function elbowTurn(m, deg, preserve = false) {
  const b = bend(m, deg, preserve), L = [];
  m.v.forEach((p, i) => { if (Math.abs(p[2]) < 1e-6 && p[1] < 0) L.push([p[0], b.v[i]]); });
  L.sort((a, c) => a[0] - c[0]);
  let worst = 0;
  for (let i = 1; i < L.length - 1; i++) {
    const d1 = V.nrm(V.sub(L[i][1], L[i - 1][1])), d2 = V.nrm(V.sub(L[i + 1][1], L[i][1]));
    worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, V.dot(d1, d2)))) * 180 / Math.PI);
  }
  return worst;
}
// How much the inside of the joint collapses: the smallest distance from a vertex near the joint to the
// joint centre, as a fraction of the arm radius (1 = the joint keeps its volume).
export function elbowVolume(m, deg, preserve = false) {
  const b = bend(m, deg, preserve); let min = Infinity;
  m.v.forEach((p, i) => { if (Math.abs(p[0]) <= BLEND) min = Math.min(min, V.len(b.v[i]) / Math.hypot(p[0], ARM_R)); });
  return min === Infinity ? 1 : min;
}
// The x positions of the rings (edge loops) of the arm.
export function ringsOf(m) { return [...new Set(m.v.map(p => Math.round(p[0] * 1000) / 1000))].sort((a, b) => a - b); }

// ─── Retopology ──────────────────────────────────────────────────────────────
// The high poly surface: a smooth stone, given by its radius in every direction.
export function stoneRadius(d) {
  const [x, y, z] = V.nrm(d);
  return 1 + 0.12 * Math.sin(3 * x + 1) * Math.cos(2 * y) + 0.08 * Math.sin(4 * z + 2 * x) - 0.15 * y * y + 0.06 * x;
}
export const snapToStone = p => V.mul(V.nrm(p), stoneRadius(p));
export const stoneDistance = p => Math.abs(V.len(p) - stoneRadius(p));
export function highStone(n = 48) {
  const v = [], f = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= 2 * n; i++) {
    const th = Math.PI * j / n, ph = Math.PI * i / n, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    v.push(V.mul(d, stoneRadius(d)));
  }
  const W = 2 * n + 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < 2 * n; i++) f.push([j * W + i, j * W + i + 1, (j + 1) * W + i + 1, (j + 1) * W + i]);
  return { v, f, crease: {} };
}
// A quad sphere (a cube with k × k quads per side) snapped onto the stone: the retopology cage.
export function quadStone(k = 3) {
  const v = [], f = [], index = new Map();
  const key = p => p.map(x => Math.round(x * 1e4)).join(',');
  const vid = p => { const kk = key(p); if (!index.has(kk)) { index.set(kk, v.length); v.push(p); } return index.get(kk); };
  const faces = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  for (const [n, u, w] of faces) for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
    const P = (a, b) => { const s = -1 + 2 * a / k, t = -1 + 2 * b / k; return [n[0] + u[0] * s + w[0] * t, n[1] + u[1] * s + w[1] * t, n[2] + u[2] * s + w[2] * t]; };
    f.push([vid(P(i, j)), vid(P(i + 1, j)), vid(P(i + 1, j + 1)), vid(P(i, j + 1))]);
  }
  return { v: v.map(snapToStone), f, crease: {} };
}
export function maxSnapError(m) { const used = new Set(m.f.flat()); let e = 0; for (const i of used) e = Math.max(e, stoneDistance(m.v[i])); return e; }
// Face areas: the ratio between the biggest and the smallest quad (1 = perfectly even).
export function densityRatio(m) {
  const area = f => { let a = [0, 0, 0]; for (let i = 1; i < f.length - 1; i++) a = V.add(a, V.cross(V.sub(m.v[f[i]], m.v[f[0]]), V.sub(m.v[f[i + 1]], m.v[f[0]]))); return V.len(a) / 2; };
  const as = m.f.map(area);
  return Math.max(...as) / Math.max(1e-9, Math.min(...as));
}
// Smooth Vertices: move each selected vertex towards the average of its neighbours.
export function smoothVerts(m, verts, factor = 0.5, repeat = 1) {
  let out = clone(m);
  const ve = vertexEdges(m);
  for (let r = 0; r < repeat; r++) {
    const next = out.v.map(p => [...p]);
    for (const i of verts) { const nb = [...ve[i]]; if (!nb.length) continue; const avg = V.mul(nb.reduce((s, j) => V.add(s, out.v[j]), [0, 0, 0]), 1 / nb.length); next[i] = V.lerp(out.v[i], avg, factor); }
    out.v = next;
  }
  return out;
}
export { stats, ek };
