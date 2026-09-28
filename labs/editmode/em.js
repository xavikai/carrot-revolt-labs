// Edit Mode Lab: a small polygon mesh editor with no DOM and no three.js, so it can be tested.
// A mesh is { v: [[x, y, z], …], f: [[i, j, k, l], …] }. Faces keep their vertices in counter-clockwise
// order seen from outside. Vertices used by no face are loose vertices. Operations return new meshes.
// Edge ring, edge loop and dissolve follow the Topology Lab's mesh module.

export const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
export const keyVerts = k => k.split('_').map(Number);
export const clone = m => ({ v: m.v.map(p => [...p]), f: m.f.map(f => [...f]) });
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const V3 = { add, sub, mul, dot, cross, len, nrm, lerp };
const round = x => { const r = Math.round(x * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
export const tidy = m => { m.v = m.v.map(p => p.map(round)); return m; };

// ─── Primitives ──────────────────────────────────────────────────────────────
export function box(lo = [-1, -1, -1], hi = [1, 1, 1]) {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi;
  return { v: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    f: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] };
}
// A cube cut into n × n quads on each side, with shared vertices.
export function gridCube(n = 3, h = 1) {
  const v = [], f = [], idx = new Map();
  const vid = p => { const k = p.map(x => Math.round(x * 1e5)).join(','); if (!idx.has(k)) { idx.set(k, v.length); v.push(p.map(round)); } return idx.get(k); };
  const sides = [[[0, 0, -1], [0, 1, 0], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 1, 0], [-1, 0, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, 1]]];
  for (const [nn, u, w] of sides) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const P = (a, b) => vid(add(mul(nn, h), add(mul(u, h * (2 * a / n - 1)), mul(w, h * (2 * b / n - 1)))));
    f.push([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
  }
  return { v, f };
}
export function uvSphere(seg = 16, rings = 8, r = 1) {
  const v = [[0, 0, -r]], f = [];
  for (let i = 1; i < rings; i++) { const th = -Math.PI / 2 + Math.PI * i / rings; for (let j = 0; j < seg; j++) { const ph = 2 * Math.PI * j / seg; v.push([round(r * Math.cos(th) * Math.cos(ph)), round(r * Math.cos(th) * Math.sin(ph)), round(r * Math.sin(th))]); } }
  v.push([0, 0, r]); const top = v.length - 1, at = (i, j) => 1 + (i - 1) * seg + ((j + seg) % seg);
  for (let j = 0; j < seg; j++) f.push([0, at(1, j + 1), at(1, j)]);
  for (let i = 1; i < rings - 1; i++) for (let j = 0; j < seg; j++) f.push([at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)]);
  for (let j = 0; j < seg; j++) f.push([at(rings - 1, j), at(rings - 1, j + 1), top]);
  return { v, f };
}

// ─── Topology queries ────────────────────────────────────────────────────────
export function edgeFaces(m) {
  const map = new Map();
  m.f.forEach((f, fi) => f.forEach((a, i) => { const k = ek(a, f[(i + 1) % f.length]); if (!map.has(k)) map.set(k, []); map.get(k).push(fi); }));
  return map;
}
export const edgeKeys = m => [...edgeFaces(m).keys()];
export function vertexEdges(m) {
  const map = m.v.map(() => new Set());
  for (const f of m.f) f.forEach((a, i) => { const b = f[(i + 1) % f.length]; map[a].add(b); map[b].add(a); });
  return map;
}
export const faceEdges = f => f.map((a, i) => ek(a, f[(i + 1) % f.length]));
export function faceNormal(m, f) {
  let n = [0, 0, 0];
  for (let i = 0; i < f.length; i++) { const a = m.v[f[i]], b = m.v[f[(i + 1) % f.length]]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); }
  return nrm(n);
}
export const faceCenter = (m, f) => mul(f.reduce((s, i) => add(s, m.v[i]), [0, 0, 0]), 1 / f.length);
export function bounds(m, idx = null) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const i of idx || m.v.keys()) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.v[i][k]); hi[k] = Math.max(hi[k], m.v[i][k]); }
  return { lo, hi };
}

// ─── Selection: vertices, edges and faces kept consistent (Blender "flushes" them) ───
// sel = { V: [vertex indices], E: [edge keys], F: [face indices] }; the list of the current mode leads.
export function flush(m, mode, sel) {
  const ef = edgeFaces(m);
  if (mode === 'vert') {
    const V = new Set(sel.V.filter(i => i < m.v.length));
    const E = [...ef.keys()].filter(k => { const [a, b] = keyVerts(k); return V.has(a) && V.has(b); });
    const F = m.f.map((f, i) => f.every(x => V.has(x)) ? i : -1).filter(i => i >= 0);
    return { V: [...V].sort((a, b) => a - b), E, F };
  }
  if (mode === 'edge') {
    const E = new Set(sel.E.filter(k => ef.has(k)));
    const V = new Set([...E].flatMap(keyVerts));
    const F = m.f.map((f, i) => faceEdges(f).every(k => E.has(k)) ? i : -1).filter(i => i >= 0);
    return { V: [...V].sort((a, b) => a - b), E: [...E], F };
  }
  const F = [...new Set(sel.F.filter(i => i < m.f.length))].sort((a, b) => a - b);
  const E = [...new Set(F.flatMap(i => faceEdges(m.f[i])))], V = [...new Set(F.flatMap(i => m.f[i]))].sort((a, b) => a - b);
  return { V, E, F };
}
export const emptySel = () => ({ V: [], E: [], F: [] });
// Switching the select mode keeps what fits the new mode (as in Blender).
export function switchMode(m, from, to, sel) { const s = flush(m, from, sel); return flush(m, to, s); }

// ─── Edge loops and rings ────────────────────────────────────────────────────
export function edgeLoop(m, a, b) {
  const ef = edgeFaces(m), ve = vertexEdges(m), loop = [[a, b]];
  const step = (u, v) => {
    const seen = new Set([ek(u, v)]);
    for (let guard = 0; guard < 2000; guard++) {
      if (ve[v].size !== 4) return;
      const facesUV = new Set(ef.get(ek(u, v)) || []);
      const next = [...ve[v]].find(w => w !== u && !(ef.get(ek(v, w)) || []).some(fi => facesUV.has(fi)));
      if (next === undefined || seen.has(ek(v, next)) || ek(v, next) === ek(a, b)) return;
      seen.add(ek(v, next)); loop.push([v, next]); u = v; v = next;
    }
  };
  step(a, b);
  const closed = loop.length > 2 && loop[loop.length - 1][1] === a;
  if (!closed) { const back = loop.length; step(b, a); void back; }
  return [...new Set(loop.map(([p, q]) => ek(p, q)))];
}
export function edgeRing(m, a, b) {
  const ef = edgeFaces(m), ring = [[a, b]], faces = [];
  const across = (fi, ea, eb) => {
    const f = m.f[fi]; if (f.length !== 4) return null;
    const i = f.indexOf(ea), j = f.indexOf(eb);
    return (i + 1) % 4 === j ? [f[(i + 3) % 4], f[(j + 1) % 4]] : [f[(i + 1) % 4], f[(j + 3) % 4]];
  };
  const walk = (fi, front) => {
    let [ea, eb] = [a, b];
    for (let guard = 0; guard < 2000 && fi !== undefined; guard++) {
      if (faces.includes(fi)) return false;
      const opp = across(fi, ea, eb); if (!opp) return false;
      faces.push(fi);
      if (ek(opp[0], opp[1]) === ek(a, b)) return true;
      front ? ring.push(opp) : ring.unshift(opp);
      [ea, eb] = opp;
      fi = (ef.get(ek(ea, eb)) || []).find(x => x !== faces[faces.length - 1]);
    }
    return false;
  };
  const start = ef.get(ek(a, b)) || [];
  const closed = start.length ? walk(start[0], true) : false;
  if (!closed && start.length > 1) walk(start[1], false);
  return { ring, faces, closed };
}
// Face loop (Alt click in face mode): the faces crossed by the ring of an edge.
export const faceLoop = (m, a, b) => edgeRing(m, a, b).faces;

// ─── Loop Cut and Slide (Ctrl R) ─────────────────────────────────────────────
// n cuts spread evenly along the ring; with one cut, factor (-1…1) slides it towards one side.
export function loopCut(m, a, b, n = 1, factor = 0) {
  const { ring, faces } = edgeRing(m, a, b);
  const out = clone(m), onEdge = new Map(), loops = Array.from({ length: n }, () => []);
  const ts = n === 1 ? [0.5 + factor / 2] : Array.from({ length: n }, (_, k) => (k + 1) / (n + 1));
  for (const [p, q] of ring) {
    const ids = ts.map((t, k) => { const i = out.v.length; out.v.push(lerp(m.v[p], m.v[q], t).map(round)); loops[k].push(i); return i; });
    onEdge.set(ek(p, q), { p, ids });
  }
  // The new vertices on edge x → y, in order from x.
  const along = (x, y) => { const e = onEdge.get(ek(x, y)); if (!e) return null; return e.p === x ? e.ids : [...e.ids].reverse(); };
  const faceSet = new Set(faces), result = [];
  const insertOnEdges = f => { const nf = []; f.forEach((x, i) => { nf.push(x); const s = along(x, f[(i + 1) % f.length]); if (s) nf.push(...s); }); return nf; };
  m.f.forEach((f, fi) => {
    if (!faceSet.has(fi)) { result.push(insertOnEdges(f)); return; }
    const k = [0, 1, 2, 3].filter(i => along(f[i], f[(i + 1) % 4]));
    if (k.length !== 2 || k[1] - k[0] !== 2) { result.push(insertOnEdges(f)); return; }
    const i0 = k[0], A = f[i0], B = f[(i0 + 1) % 4], C = f[(i0 + 2) % 4], D = f[(i0 + 3) % 4];
    const ab = [A, ...along(A, B), B], dc = [D, ...along(D, C), C];
    for (let j = 0; j <= n; j++) result.push([ab[j], ab[j + 1], dc[j + 1], dc[j]]);
  });
  out.f = result;
  return { m: out, loops, ringFaces: faces.length };
}

// ─── Extrude Region (E, faces) ───────────────────────────────────────────────
// The selected faces are copied, the copies stay connected to the rest by new side faces.
export function extrudeFaces(m, F) {
  const set = new Set(F); if (!set.size) return null;
  const out = clone(m), copy = new Map();
  const cp = i => { if (!copy.has(i)) { copy.set(i, out.v.length); out.v.push([...m.v[i]]); } return copy.get(i); };
  // boundary edges of the region, oriented as in their selected face
  const count = new Map();
  for (const fi of set) faceEdges(m.f[fi]).forEach(k => count.set(k, (count.get(k) || 0) + 1));
  const sides = [];
  for (const fi of set) { const f = m.f[fi]; f.forEach((a, i) => { const b = f[(i + 1) % f.length]; if (count.get(ek(a, b)) === 1) sides.push([a, b]); }); }
  let normal = [0, 0, 0]; for (const fi of set) normal = add(normal, faceNormal(m, m.f[fi]));
  for (const fi of set) out.f[fi] = m.f[fi].map(cp);
  for (const [a, b] of sides) out.f.push([a, b, cp(b), cp(a)]);
  return { m: out, F: [...set], moved: [...copy.values()], normal: len(normal) > 1e-6 ? nrm(normal) : [0, 0, 1] };
}

// ─── Inset Faces (I) ─────────────────────────────────────────────────────────
// Each selected face gets a smaller copy inside it, joined to the border by a ring of quads.
export function insetFaces(m, F, thickness, depth = 0) {
  const out = clone(m), inner = [];
  for (const fi of F) {
    const f = m.f[fi], n = faceNormal(m, f), P = f.map(i => m.v[i]), k = f.length, ids = [];
    for (let i = 0; i < k; i++) {
      const prev = P[(i + k - 1) % k], cur = P[i], next = P[(i + 1) % k];
      const e1 = nrm(sub(cur, prev)), e2 = nrm(sub(next, cur)), n1 = nrm(cross(n, e1)), n2 = nrm(cross(n, e2));
      let dir = add(n1, n2); dir = len(dir) < 1e-6 ? n1 : nrm(dir);
      const d = thickness / Math.max(0.2, dot(dir, n1));
      ids.push(out.v.length); out.v.push(add(add(cur, mul(dir, d)), mul(n, depth)).map(round));
    }
    out.f[fi] = ids; inner.push(fi);
    for (let i = 0; i < k; i++) { const a = f[i], b = f[(i + 1) % k]; out.f.push([a, b, ids[(i + 1) % k], ids[i]]); }
  }
  return { m: out, F: inner };
}

// ─── Bevel Edges (Ctrl B) on separate edges of box-like corners ─────────────
// Each end of a bevelled edge must have three edges, and only one of them bevelled.
export function bevelEdges(m, E, width, segments = 1) {
  const ef = edgeFaces(m), ve = vertexEdges(m), sel = new Set(E);
  if (!sel.size) return { error: 'Select edges to bevel.' };
  const ends = new Map();
  for (const k of sel) {
    const fs = ef.get(k); if (!fs || fs.length !== 2) return { error: 'Bevel needs edges between two faces.' };
    for (const v of keyVerts(k)) { if (ve[v].size !== 3) return { error: 'In this lab, Bevel works on corners with three edges.' }; if (ends.has(v)) return { error: 'In this lab, bevelled edges must not touch each other.' }; ends.set(v, k); }
  }
  const out = clone(m), rep = new Map(), strips = [];
  let d = width;
  for (const [v, k] of ends) for (const u of ve[v]) { if (ek(u, v) === k) continue; d = Math.min(d, 0.49 * len(sub(m.v[u], m.v[v]))); }
  d = Math.max(0, d);
  const chainAt = (k, v, w) => {
    const [f1, f2] = ef.get(k), F1 = m.f[f1], F2 = m.f[f2];
    const other = (face, x, y) => { const i = face.indexOf(x), n = face.length, a = face[(i + 1) % n], b = face[(i + n - 1) % n]; return a === y ? b : a; };
    const u1 = other(F1, v, w), u2 = other(F2, v, w);
    const p1 = add(m.v[v], mul(nrm(sub(m.v[u1], m.v[v])), d)), p2 = add(m.v[v], mul(nrm(sub(m.v[u2], m.v[v])), d)), c = sub(add(p1, p2), m.v[v]);
    const ids = [];
    for (let s = 0; s <= segments; s++) { const th = s / segments * Math.PI / 2; ids.push(out.v.length); out.v.push(add(c, add(mul(sub(p1, c), Math.cos(th)), mul(sub(p2, c), Math.sin(th)))).map(round)); }
    // the third face around v (the cap): contains u1, v and u2
    const f3 = m.f.findIndex((f, i) => i !== f1 && i !== f2 && f.includes(v));
    const F3 = m.f[f3], j = F3.indexOf(v), pred = F3[(j + F3.length - 1) % F3.length];
    rep.set(`${f1}:${v}`, [ids[0]]); rep.set(`${f2}:${v}`, [ids[segments]]); rep.set(`${f3}:${v}`, pred === u1 ? ids : [...ids].reverse());
    return { ids, f1 };
  };
  for (const k of sel) {
    const [v, w] = keyVerts(k), cv = chainAt(k, v, w), cw = chainAt(k, w, v);
    const F1 = m.f[cv.f1], i = F1.indexOf(v), vToW = F1[(i + 1) % F1.length] === w;
    for (let s = 0; s < segments; s++) strips.push(vToW ? [cw.ids[s], cv.ids[s], cv.ids[s + 1], cw.ids[s + 1]] : [cv.ids[s], cw.ids[s], cw.ids[s + 1], cv.ids[s + 1]]);
  }
  out.f = m.f.map((f, fi) => f.flatMap(x => rep.get(`${fi}:${x}`) || [x]));
  out.f.push(...strips);
  return { m: removeVerts(out, new Set(ends.keys())).m, width: d };
}

// ─── Removing vertices, merging, deleting, dissolving ───────────────────────
export function removeVerts(m, drop) {
  const map = new Map(); const v = [];
  m.v.forEach((p, i) => { if (!drop.has(i)) { map.set(i, v.length); v.push(p); } });
  return { m: { v, f: m.f.filter(f => f.every(x => map.has(x))).map(f => f.map(x => map.get(x))) }, map };
}
// Merge › By Distance: vertices closer than the distance become one.
export function mergeByDistance(m, dist = 0.0001, only = null) {
  const n = m.v.length, parent = [...Array(n).keys()], find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cand = only ? [...only] : [...Array(n).keys()];
  for (let x = 0; x < cand.length; x++) for (let y = x + 1; y < cand.length; y++) {
    const i = cand[x], j = cand[y];
    if (len(sub(m.v[i], m.v[j])) <= dist) { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
  }
  const drop = new Set(); for (let i = 0; i < n; i++) if (find(i) !== i) drop.add(i);
  const seen = new Set(), f = [];
  for (const face of m.f) {
    const g = []; for (const x of face.map(find)) if (g[g.length - 1] !== x) g.push(x);
    while (g.length > 1 && g[0] === g[g.length - 1]) g.pop();
    if (new Set(g).size < 3) continue;
    const key = [...g].sort((a, b) => a - b).join(','); if (seen.has(key)) continue; seen.add(key); f.push(g);
  }
  const r = removeVerts({ v: m.v, f }, drop);
  return { m: r.m, removed: drop.size, map: r.map };
}
export function deleteVerts(m, V) { return removeVerts(m, new Set(V)).m; }
export function deleteEdges(m, E) {
  const set = new Set(E), used0 = new Set(m.f.flat());
  const f = m.f.filter(face => !faceEdges(face).some(k => set.has(k)));
  const used = new Set(f.flat()), drop = new Set([...set].flatMap(keyVerts).filter(i => !used.has(i) && used0.has(i)));
  return removeVerts({ v: m.v, f }, drop).m;
}
export function deleteFaces(m, F) {
  const set = new Set(F), f = m.f.filter((_, i) => !set.has(i)), used = new Set(f.flat());
  const drop = new Set([...set].flatMap(i => m.f[i]).filter(i => !used.has(i)));
  return removeVerts({ v: m.v, f }, drop).m;
}
function mergeFaces(f1, f2, a, b) {
  const n1 = f1.length, i = f1.indexOf(b), p1 = [];
  for (let k = 0; k < n1; k++) { const x = f1[(i + k) % n1]; p1.push(x); if (x === a) break; }
  const n2 = f2.length, j = f2.indexOf(a), p2 = [];
  for (let k = 1; k < n2; k++) { const x = f2[(j + k) % n2]; if (x === b) break; p2.push(x); }
  return [...p1, ...p2];
}
function removeValence2(m, protect = new Set()) {
  const ve = vertexEdges(m), ef = edgeFaces(m), drop = new Set();
  ve.forEach((s, i) => { if (s.size !== 2 || protect.has(i)) return; const [a, b] = [...s]; const f1 = ef.get(ek(i, a)) || [], f2 = ef.get(ek(i, b)) || []; if (f1.length === 2 && f2.length === 2) drop.add(i); });
  if (!drop.size) return { m, drop };
  const f = m.f.map(face => face.filter(x => !drop.has(x))).filter(face => face.length >= 3);
  return { m: { v: m.v, f }, drop };
}
export function dissolveEdges(m, keys) {
  let out = clone(m);
  for (const k of keys) {
    const [a, b] = keyVerts(k), fs = edgeFaces(out).get(ek(a, b));
    if (!fs || fs.length !== 2 || fs[0] === fs[1]) continue;
    const [fa, fb] = fs, f1 = out.f[fa], f2 = out.f[fb], i = f1.indexOf(a), forward = f1[(i + 1) % f1.length] === b;
    const merged = forward ? mergeFaces(f1, f2, a, b) : mergeFaces(f2, f1, a, b);
    out.f = out.f.filter((_, x) => x !== fa && x !== fb); out.f.push(merged);
  }
  const r = removeValence2(out);
  return removeVerts(r.m, new Set([...r.drop, ...unusedFrom(m, r.m)])).m;
}
const unusedFrom = (before, after) => { const u0 = new Set(before.f.flat()), u1 = new Set(after.f.flat()); return [...u0].filter(i => !u1.has(i)); };
export function dissolveVerts(m, verts) {
  let out = clone(m);
  for (const v of verts) {
    const around = out.f.map((f, i) => [f, i]).filter(([f]) => f.includes(v));
    if (!around.length) continue;
    if (vertexEdges(out)[v].size === 2) { out.f = out.f.map(f => f.length > 3 ? f.filter(x => x !== v) : f); continue; }
    if (around.length === 1) { const [f, i] = around[0]; if (f.length > 3) out.f[i] = f.filter(x => x !== v); continue; }
    const nb = [...vertexEdges(out)[v]], ef = edgeFaces(out);
    if (nb.some(w => (ef.get(ek(v, w)) || []).length !== 2)) continue;
    for (const w of nb.slice(0, -1)) {
      const fs = edgeFaces(out).get(ek(v, w)); if (!fs || fs.length !== 2 || fs[0] === fs[1]) continue;
      const [fa, fb] = fs, f1 = out.f[fa], f2 = out.f[fb], i = f1.indexOf(v);
      const merged = f1[(i + 1) % f1.length] === w ? mergeFaces(f1, f2, v, w) : mergeFaces(f2, f1, v, w);
      out.f = out.f.filter((_, x) => x !== fa && x !== fb); out.f.push(merged);
    }
    out.f = out.f.map(f => f.filter(x => x !== v)).filter(f => f.length >= 3);
  }
  const r = removeValence2(out);
  return removeVerts(r.m, new Set([...verts.filter(i => !new Set(r.m.f.flat()).has(i)), ...r.drop])).m;
}
// Dissolve Faces: the selected faces that touch become one face.
export function dissolveFaces(m, F) {
  const set = new Set(F), ef = edgeFaces(m);
  const inner = [...ef.entries()].filter(([, fs]) => fs.length === 2 && set.has(fs[0]) && set.has(fs[1])).map(([k]) => k);
  return dissolveEdges(m, inner);
}

// ─── Mesh analysis (like Statistics and the 3D Print checks) ────────────────
export function analyze(m, dist = 0.0001) {
  const ef = edgeFaces(m), used = new Set(m.f.flat());
  let dup = 0; const seen = [];
  for (let i = 0; i < m.v.length; i++) { if (seen.some(j => len(sub(m.v[i], m.v[j])) <= dist)) dup++; else seen.push(i); }
  const counts = [...ef.values()].map(fs => fs.length);
  // faces sharing all their vertices with another face, or lying inside the mesh (all edges shared 3+ times)
  const interior = m.f.filter(f => faceEdges(f).every(k => (ef.get(k) || []).length > 2)).length;
  const ve = vertexEdges(m); let mid = 0;
  ve.forEach((s, i) => { if (s.size === 2 && used.has(i)) { const [a, b] = [...s], d1 = nrm(sub(m.v[a], m.v[i])), d2 = nrm(sub(m.v[b], m.v[i])); if (dot(d1, d2) < -0.999) mid++; } });
  return {
    verts: m.v.length, edges: ef.size, faces: m.f.length,
    tris: m.f.filter(f => f.length === 3).length, quads: m.f.filter(f => f.length === 4).length, ngons: m.f.filter(f => f.length > 4).length,
    loose: m.v.length - used.size, duplicates: dup,
    boundary: counts.filter(c => c === 1).length, overShared: counts.filter(c => c > 2).length, interior, midEdge: mid,
  };
}
export const isClean = (a) => a.loose === 0 && a.duplicates === 0 && a.boundary === 0 && a.overShared === 0 && a.midEdge === 0;

// ─── Picking helpers (screen space is done by the app) ──────────────────────
// Ray against the mesh: distance to the first face hit, or Infinity.
export function rayHit(m, o, d, skipFace = -1) {
  let best = Infinity, face = -1;
  m.f.forEach((f, fi) => {
    if (fi === skipFace) return;
    for (let i = 1; i < f.length - 1; i++) {
      const a = m.v[f[0]], b = m.v[f[i]], c = m.v[f[i + 1]];
      const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, s = sub(o, a), u = dot(s, p) * inv; if (u < 0 || u > 1) continue;
      const q = cross(s, e1), w = dot(d, q) * inv; if (w < 0 || u + w > 1) continue;
      const t = dot(e2, q) * inv; if (t > 1e-6 && t < best) { best = t; face = fi; }
    }
  });
  return { t: best, face };
}
// Is point p seen from the eye (not hidden behind a face)?
export function pointVisible(m, eye, p, orthoDir = null) {
  const d = orthoDir ? orthoDir : nrm(sub(p, eye)), o = orthoDir ? sub(p, mul(orthoDir, 1000)) : eye;
  const dist = orthoDir ? 1000 : len(sub(p, eye));
  return rayHit(m, o, d).t >= dist - 1e-3 * Math.max(1, dist) - 1e-4;
}
// Winding check: on a closed, well-made mesh every edge is used once in each direction.
export function windingOk(m) {
  const seen = new Set();
  for (const f of m.f) for (let i = 0; i < f.length; i++) { const d = `${f[i]}>${f[(i + 1) % f.length]}`; if (seen.has(d)) return false; seen.add(d); }
  return true;
}
// Signed volume (positive when the faces point outwards).
export function volume(m) {
  let vol = 0;
  for (const f of m.f) for (let i = 1; i < f.length - 1; i++) vol += dot(m.v[f[0]], cross(m.v[f[i]], m.v[f[i + 1]])) / 6;
  return vol;
}
