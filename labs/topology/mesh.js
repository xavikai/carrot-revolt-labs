// Topology Lab: a small polygon mesh editor with no DOM and no three.js, so it can be tested.
// A mesh is { v: [[x, y, z], …], f: [[i, j, k, l], …], crease: { 'a_b': 0…1 } }. Faces keep their
// vertices in counter-clockwise order seen from outside. Operations return a new mesh (the app keeps undo).

export const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
export const clone = m => ({ v: m.v.map(p => [...p]), f: m.f.map(f => [...f]), crease: { ...(m.crease || {}) } });
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const V = { add, sub, mul, dot, cross, len, nrm, lerp };

// ─── Topology queries ────────────────────────────────────────────────────────
export function edgeFaces(m) {
  const map = new Map();
  m.f.forEach((f, fi) => f.forEach((a, i) => { const k = ek(a, f[(i + 1) % f.length]); if (!map.has(k)) map.set(k, []); map.get(k).push(fi); }));
  return map;
}
export function edges(m) { return [...edgeFaces(m).keys()].map(k => k.split('_').map(Number)); }
export function vertexEdges(m) {
  const map = m.v.map(() => new Set());
  for (const f of m.f) f.forEach((a, i) => { const b = f[(i + 1) % f.length]; map[a].add(b); map[b].add(a); });
  return map;
}
export function faceNormal(m, f) {
  let n = [0, 0, 0];
  for (let i = 0; i < f.length; i++) { const a = m.v[f[i]], b = m.v[f[(i + 1) % f.length]]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); }
  return nrm(n);
}
export const faceCenter = (m, f) => mul(f.reduce((s, i) => add(s, m.v[i]), [0, 0, 0]), 1 / f.length);
// Interior vertices with 3 edges (N-poles) or 5+ edges (E-poles). Boundary vertices are not counted.
export function stats(m) {
  const ef = edgeFaces(m), ve = vertexEdges(m), boundaryV = new Set();
  let boundaryEdges = 0;
  for (const [k, fs] of ef) if (fs.length === 1) { boundaryEdges++; k.split('_').forEach(i => boundaryV.add(+i)); }
  const used = new Set(m.f.flat());
  const poles3 = [], poles5 = [];
  ve.forEach((s, i) => { if (!used.has(i) || boundaryV.has(i)) return; if (s.size === 3) poles3.push(i); else if (s.size >= 5) poles5.push(i); });
  return {
    verts: used.size, edges: ef.size, faces: m.f.length,
    tris: m.f.filter(f => f.length === 3).length, quads: m.f.filter(f => f.length === 4).length, ngons: m.f.filter(f => f.length > 4).length,
    poles3, poles5, boundaryEdges, holes: boundaryEdges,
  };
}

// ─── Removing unused vertices ────────────────────────────────────────────────
export function compact(m) {
  const used = [...new Set(m.f.flat())].sort((a, b) => a - b), map = new Map(used.map((o, i) => [o, i]));
  const crease = {};
  for (const [k, c] of Object.entries(m.crease || {})) { const [a, b] = k.split('_').map(Number); if (map.has(a) && map.has(b)) crease[ek(map.get(a), map.get(b))] = c; }
  return { v: used.map(i => [...m.v[i]]), f: m.f.map(f => f.map(i => map.get(i))), crease, map };
}

// ─── Loop Cut (Ctrl R) ───────────────────────────────────────────────────────
// The ring of edges crossed by a loop cut: start at an edge and walk across quads to the opposite
// edge, in both directions, until an n-gon, a triangle, a boundary or the start again.
// Each ring edge is oriented [a, b] consistently, so a factor t slides the whole cut.
export function edgeRing(m, a, b) {
  const ef = edgeFaces(m), ring = [[a, b]], faces = [];
  const across = (fi, ea, eb) => {
    const f = m.f[fi]; if (f.length !== 4) return null;
    const i = f.indexOf(ea), j = f.indexOf(eb);
    return (i + 1) % 4 === j ? [f[(i + 3) % 4], f[(j + 1) % 4]] : [f[(i + 1) % 4], f[(j + 3) % 4]];
  };
  // walk from the start edge through face fi; returns true if the ring closes on itself
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
export function loopCut(m, a, b, t = 0.5) {
  const { ring, faces } = edgeRing(m, a, b);
  const out = clone(m), newV = new Map();
  for (const [p, q] of ring) { newV.set(ek(p, q), { i: out.v.length, p, q }); out.v.push(lerp(m.v[p], m.v[q], t)); }
  const at = (p, q) => newV.get(ek(p, q))?.i;
  const faceSet = new Set(faces), result = [];
  const insertOnEdges = f => { const nf = []; f.forEach((x, i) => { nf.push(x); const n = at(x, f[(i + 1) % f.length]); if (n !== undefined) nf.push(n); }); return nf; };
  m.f.forEach((f, fi) => {
    if (!faceSet.has(fi)) { result.push(insertOnEdges(f)); return; }
    const k = [0, 1, 2, 3].filter(i => at(f[i], f[(i + 1) % 4]) !== undefined);
    if (k.length !== 2 || (k[1] - k[0]) !== 2) { result.push(insertOnEdges(f)); return; }
    const i0 = k[0], n0 = at(f[i0], f[(i0 + 1) % 4]), n1 = at(f[(i0 + 2) % 4], f[(i0 + 3) % 4]);
    result.push([f[i0], n0, n1, f[(i0 + 3) % 4]], [n0, f[(i0 + 1) % 4], f[(i0 + 2) % 4], n1]);
  });
  out.f = result;
  for (const [k, c] of Object.entries(m.crease || {})) {
    const e = newV.get(k); if (!e) continue;
    delete out.crease[k]; out.crease[ek(e.p, e.i)] = c; out.crease[ek(e.i, e.q)] = c;
  }
  return out;
}

// ─── Edge loop (Alt click) ───────────────────────────────────────────────────
// Continue straight through vertices with 4 edges: the next edge is the one that shares no face with the last.
export function edgeLoop(m, a, b) {
  const ef = edgeFaces(m), ve = vertexEdges(m), loop = [[a, b]];
  const step = (u, v) => {
    const seen = new Set([ek(u, v)]);
    for (let guard = 0; guard < 1000; guard++) {
      if (ve[v].size !== 4) return;
      const facesUV = new Set(ef.get(ek(u, v)) || []);
      const next = [...ve[v]].find(w => w !== u && !(ef.get(ek(v, w)) || []).some(fi => facesUV.has(fi)));
      if (next === undefined || seen.has(ek(v, next))) return;
      seen.add(ek(v, next)); loop.push([v, next]); u = v; v = next;
    }
  };
  step(a, b);
  if (loop[loop.length - 1][1] !== a) step(b, a);   // an open loop: also walk the other way
  return loop;
}

// ─── Connect Vertex Path (J) ─────────────────────────────────────────────────
export function connect(m, a, b) {
  const fi = m.f.findIndex(f => f.includes(a) && f.includes(b));
  if (fi < 0) return null;
  const f = m.f[fi], i = f.indexOf(a), j = f.indexOf(b), n = f.length;
  if ((i + 1) % n === j || (j + 1) % n === i) return null;         // already an edge
  const out = clone(m), f1 = [], f2 = [];
  for (let k = i; ; k = (k + 1) % n) { f1.push(f[k]); if (k === j) break; }
  for (let k = j; ; k = (k + 1) % n) { f2.push(f[k]); if (k === i) break; }
  out.f.splice(fi, 1, f1, f2);
  return out;
}

// ─── Dissolve ────────────────────────────────────────────────────────────────
// Merge the two faces on each side of an edge into one polygon.
function mergeFaces(f1, f2, a, b) {
  // f1 goes a → b, f2 goes b → a. Walk f1 from b round to a, then f2 from a to just before b.
  const n1 = f1.length, i = f1.indexOf(b), p1 = [];
  for (let k = 0; k < n1; k++) { const x = f1[(i + k) % n1]; p1.push(x); if (x === a) break; }
  const n2 = f2.length, j = f2.indexOf(a), p2 = [];
  for (let k = 1; k < n2; k++) { const x = f2[(j + k) % n2]; if (x === b) break; p2.push(x); }
  return [...p1, ...p2];
}
export function dissolveEdges(m, keys) {
  let out = clone(m);
  for (const k of keys) {
    const [a, b] = k.split('_').map(Number), ef = edgeFaces(out), fs = ef.get(ek(a, b));
    if (!fs || fs.length !== 2 || fs[0] === fs[1]) continue;
    const [fa, fb] = fs, f1 = out.f[fa], f2 = out.f[fb];
    const i = f1.indexOf(a), forward = f1[(i + 1) % f1.length] === b;
    const merged = forward ? mergeFaces(f1, f2, a, b) : mergeFaces(f2, f1, a, b);
    out.f = out.f.filter((_, x) => x !== fa && x !== fb); out.f.push(merged);
    delete out.crease[ek(a, b)];
  }
  return removeValence2(out);
}
// Dissolve vertices: merge the faces around each vertex into one polygon without it.
export function dissolveVerts(m, verts) {
  let out = clone(m);
  for (const v of verts) {
    const around = out.f.map((f, i) => [f, i]).filter(([f]) => f.includes(v));
    if (!around.length) continue;
    // a vertex in the middle of an edge (two edges): just take it out of its faces
    if (vertexEdges(out)[v].size === 2) { out.f = out.f.map(f => f.length > 3 ? f.filter(x => x !== v) : f); continue; }
    if (around.length === 1) { const [f, i] = around[0]; if (f.length > 3) out.f[i] = f.filter(x => x !== v); continue; }
    // merge them one edge at a time
    const nb = [...vertexEdges(out)[v]];
    const ef = edgeFaces(out);
    if (nb.some(w => (ef.get(ek(v, w)) || []).length !== 2)) continue;       // boundary vertex: skip
    // merge the faces around v two by two across the edges that leave v, then take v out
    for (const w of nb.slice(0, -1)) {
      const fs = edgeFaces(out).get(ek(v, w));
      if (!fs || fs.length !== 2 || fs[0] === fs[1]) continue;
      const [fa, fb] = fs, f1 = out.f[fa], f2 = out.f[fb], i = f1.indexOf(v);
      const merged = f1[(i + 1) % f1.length] === w ? mergeFaces(f1, f2, v, w) : mergeFaces(f2, f1, v, w);
      out.f = out.f.filter((_, x) => x !== fa && x !== fb); out.f.push(merged);
    }
    out.f = out.f.map(f => f.filter(x => x !== v)).filter(f => f.length >= 3);
  }
  return removeValence2(out);
}
// A vertex that is left with only two edges in the middle of a surface is removed from its faces.
function removeValence2(m) {
  const ve = vertexEdges(m), ef = edgeFaces(m);
  const drop = new Set();
  ve.forEach((s, i) => { if (s.size !== 2) return; const [a, b] = [...s]; const f1 = ef.get(ek(i, a)) || [], f2 = ef.get(ek(i, b)) || []; if (f1.length === 2 && f2.length === 2) drop.add(i); });
  if (!drop.size) return m;
  m.f = m.f.map(f => f.filter(x => !drop.has(x))).filter(f => f.length >= 3);
  return m;
}

// Tris to Quads (Alt J): join pairs of triangles across their longest shared edge.
export function trisToQuads(m) {
  let out = clone(m);
  for (let guard = 0; guard < 500; guard++) {
    const ef = edgeFaces(out);
    let best = null, bestLen = -1;
    for (const [k, fs] of ef) {
      if (fs.length !== 2 || out.f[fs[0]].length !== 3 || out.f[fs[1]].length !== 3) continue;
      const [a, b] = k.split('_').map(Number), l = len(sub(out.v[a], out.v[b]));
      if (l > bestLen) { bestLen = l; best = k; }
    }
    if (!best) break;
    out = dissolveEdges(out, [best]);
  }
  return out;
}

// ─── Fill (F): a face from 3 or 4 selected vertices ──────────────────────────
// The vertices are sorted around their centre; the face faces away from the model centre (outwards).
export function fill(m, verts, outward = [0, 0, 0]) {
  if (verts.length < 3 || verts.length > 4) return null;
  const c = mul(verts.reduce((s, i) => add(s, m.v[i]), [0, 0, 0]), 1 / verts.length);
  let n = nrm(sub(c, outward));
  const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = nrm(cross(up, n)), w = cross(n, u);
  const sorted = [...verts].sort((a, b) => { const pa = sub(m.v[a], c), pb = sub(m.v[b], c); return Math.atan2(dot(pa, w), dot(pa, u)) - Math.atan2(dot(pb, w), dot(pb, u)); });
  const out = clone(m); out.f.push(sorted);
  // match the winding of a neighbour face if there is one
  const ef = edgeFaces(m);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], b = sorted[(i + 1) % sorted.length], fs = ef.get(ek(a, b));
    if (!fs) continue;
    const g = m.f[fs[0]], j = g.indexOf(a);
    if (g[(j + 1) % g.length] === b) out.f[out.f.length - 1] = [...sorted].reverse();
    break;
  }
  return out;
}

// ─── Catmull-Clark subdivision with creases ──────────────────────────────────
// Boundary edges are sharp. A crease of 1 is sharp, 0 is smooth, values between blend the two rules
// (the crease halves at every level, like a semi-sharp edge).
export function subdivide(m, levels = 1) {
  let cur = { v: m.v.map(p => [...p]), f: m.f.map(f => [...f]), crease: { ...(m.crease || {}) } };
  for (let l = 0; l < levels; l++) cur = ccOnce(cur);
  return cur;
}
function ccOnce(m) {
  const ef = edgeFaces(m), nv = m.v.length;
  const fp = m.f.map(f => faceCenter(m, f));
  const edgeIndex = new Map(); let next = nv + m.f.length;
  const ep = [];
  for (const [k, fs] of ef) {
    const [a, b] = k.split('_').map(Number), mid = lerp(m.v[a], m.v[b], 0.5);
    const c = fs.length < 2 ? 1 : Math.min(1, m.crease[k] || 0);
    const smooth = fs.length === 2 ? mul(add(add(m.v[a], m.v[b]), add(fp[fs[0]], fp[fs[1]])), 0.25) : mid;
    ep.push(lerp(smooth, mid, c)); edgeIndex.set(k, next++);
  }
  // vertex points
  const vf = m.v.map(() => []), vE = m.v.map(() => []);
  m.f.forEach((f, fi) => f.forEach(a => vf[a].push(fi)));
  for (const [k] of ef) { const [a, b] = k.split('_').map(Number); vE[a].push(k); vE[b].push(k); }
  const vp = m.v.map((p, i) => {
    if (!vf[i].length) return [...p];
    const sharp = vE[i].filter(k => ef.get(k).length < 2 || (m.crease[k] || 0) > 0);
    const n = vE[i].length;
    const F = mul(vf[i].reduce((s, fi) => add(s, fp[fi]), [0, 0, 0]), 1 / vf[i].length);
    const R = mul(vE[i].reduce((s, k) => { const [a, b] = k.split('_').map(Number); return add(s, lerp(m.v[a], m.v[b], 0.5)); }, [0, 0, 0]), 1 / n);
    const smooth = add(add(mul(F, 1 / n), mul(R, 2 / n)), mul(p, (n - 3) / n));
    if (sharp.length < 2) return smooth;
    let crease;
    if (sharp.length === 2) {
      const other = sharp.map(k => { const [a, b] = k.split('_').map(Number); return m.v[a === i ? b : a]; });
      crease = add(mul(p, 0.75), mul(add(other[0], other[1]), 0.125));
    } else crease = [...p];                                                // a corner
    const w = Math.min(1, sharp.reduce((s, k) => s + (ef.get(k).length < 2 ? 1 : Math.min(1, m.crease[k] || 0)), 0) / sharp.length);
    return lerp(smooth, crease, w);
  });
  const v = [...vp, ...fp, ...ep], f = [], crease = {};
  m.f.forEach((face, fi) => {
    const n = face.length, c = nv + fi;
    for (let i = 0; i < n; i++) {
      const a = face[i], prev = face[(i + n - 1) % n], nx = face[(i + 1) % n];
      f.push([a, edgeIndex.get(ek(a, nx)), c, edgeIndex.get(ek(prev, a))]);
    }
  });
  for (const [k, c] of Object.entries(m.crease)) {
    if (!c || !edgeIndex.has(k)) continue;
    const [a, b] = k.split('_').map(Number), e = edgeIndex.get(k), c2 = c >= 1 ? 1 : Math.max(0, c * 2 - 1) > 0 ? c * 2 - 1 : c / 2;
    crease[ek(a, e)] = c2; crease[ek(e, b)] = c2;
  }
  return { v, f, crease };
}

// ─── Triangles for drawing ───────────────────────────────────────────────────
export function triangulate(m) {
  const tris = [], owner = [];
  m.f.forEach((f, fi) => { for (let i = 1; i < f.length - 1; i++) { tris.push(f[0], f[i], f[i + 1]); owner.push(fi); } });
  return { tris, owner };
}
