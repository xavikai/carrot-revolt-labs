// Skin weights: meshes, bones, linear blend skinning and Blender's weight tools. Pure logic, no DOM.

// ─── Small 3D math: a transform is { R: 3×3 row-major, t: [x, y, z] } ────────
const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul3 = (A, B) => { const C = Array(9).fill(0); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) C[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c]; return C; };
const apply3 = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function axisAngle(axis, deg) {
  const [x, y, z] = norm(axis), a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const compose = (A, B) => ({ R: mul3(A.R, B.R), t: add(apply3(A.R, B.t), A.t) });
const applyT = (T, v) => add(apply3(T.R, v), T.t);
export const transformPoint = applyT;

// ─── Meshes: tubes around bones ──────────────────────────────────────────────
// A tube along X with rounded ends. radius(x) gives the thickness at each x.
function tube(x0, x1, radius, rings = 44, seg = 20) {
  const pos = [], ringX = [];
  const capRings = 4;
  const xs = [];
  for (let i = 1; i <= capRings; i++) xs.push({ x: x0 - 0.35 * Math.cos(i / capRings * Math.PI / 2) , k: Math.sin(i / capRings * Math.PI / 2), cap: true });
  for (let i = 1; i < rings; i++) xs.push({ x: x0 + (x1 - x0) * i / rings, k: 1 });
  for (let i = capRings; i >= 1; i--) xs.push({ x: x1 + 0.35 * Math.cos(i / capRings * Math.PI / 2), k: Math.sin(i / capRings * Math.PI / 2), cap: true });
  // left tip
  pos.push([x0 - 0.35, 0, 0]);
  for (const { x, k } of xs) {
    const r = radius(Math.max(x0, Math.min(x1, x))) * k;
    ringX.push(x);
    for (let s = 0; s < seg; s++) { const a = s / seg * Math.PI * 2; pos.push([x, Math.cos(a) * r, Math.sin(a) * r]); }
  }
  pos.push([x1 + 0.35, 0, 0]);
  const idx = [], nR = xs.length, tipA = 0, tipB = pos.length - 1, v = (r, s) => 1 + r * seg + ((s + seg) % seg);
  for (let s = 0; s < seg; s++) idx.push(tipA, v(0, s + 1), v(0, s));
  for (let r = 0; r < nR - 1; r++) for (let s = 0; s < seg; s++) { idx.push(v(r, s), v(r, s + 1), v(r + 1, s + 1)); idx.push(v(r, s), v(r + 1, s + 1), v(r + 1, s)); }
  for (let s = 0; s < seg; s++) idx.push(tipB, v(nR - 1, s), v(nR - 1, s + 1));
  return { positions: pos, indices: idx };
}

export const RIGS = {
  arm: () => ({
    name: 'Arm',
    bones: [
      { name: 'UpperArm', head: [0, 0, 0], tail: [2, 0, 0], parent: -1 },
      { name: 'Forearm', head: [2, 0, 0], tail: [4, 0, 0], parent: 0 },
    ],
    joint: 2,
    ...tube(0, 4, x => 0.45 + 0.05 * Math.cos(x * 1.4) - 0.04 * x),
  }),
  body: () => ({
    name: 'Arms',
    bones: [
      { name: 'Chest', head: [-1.2, 0, 0], tail: [1.2, 0, 0], parent: -1 },
      { name: 'UpperArm.L', head: [1.2, 0, 0], tail: [2.6, 0, 0], parent: 0 },
      { name: 'Forearm.L', head: [2.6, 0, 0], tail: [4, 0, 0], parent: 1 },
      { name: 'UpperArm.R', head: [-1.2, 0, 0], tail: [-2.6, 0, 0], parent: 0 },
      { name: 'Forearm.R', head: [-2.6, 0, 0], tail: [-4, 0, 0], parent: 3 },
    ],
    ...tube(-4, 4, x => { const ax = Math.abs(x); return ax < 1.2 ? 0.72 - 0.08 * ax : Math.max(0.36, 0.62 - 0.07 * (ax - 1.2)); }, 72, 20),
  }),
};

export function makeRig(kind) {
  const r = RIGS[kind]();
  const n = r.positions.length;
  const rest = new Float32Array(n * 3);
  r.positions.forEach((p, i) => rest.set(p, i * 3));
  const adjacency = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < r.indices.length; i += 3) {
    const [a, b, c] = [r.indices[i], r.indices[i + 1], r.indices[i + 2]];
    adjacency[a].add(b).add(c); adjacency[b].add(a).add(c); adjacency[c].add(a).add(b);
  }
  // Mirror: the vertex at (-x, y, z), and the bone with .L ↔ .R
  const key = (x, y, z) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
  const byPos = new Map(r.positions.map((p, i) => [key(...p), i]));
  const mirror = new Int32Array(n).map((_, i) => { const p = r.positions[i]; return byPos.get(key(-p[0], p[1], p[2])) ?? -1; });
  const bones = r.bones.map(b => ({ ...b }));
  bones.forEach(b => {
    const other = b.name.endsWith('.L') ? b.name.slice(0, -2) + '.R' : b.name.endsWith('.R') ? b.name.slice(0, -2) + '.L' : b.name;
    b.mirror = bones.findIndex(c => c.name === other);
  });
  return { kind, name: r.name, bones, rest, indices: new Uint32Array(r.indices), adjacency: adjacency.map(s => [...s]), mirror, count: n, joint: r.joint };
}

export const emptyWeights = rig => rig.bones.map(() => new Float32Array(rig.count));
export const cloneWeights = W => W.map(g => new Float32Array(g));
export const vertex = (rig, i) => [rig.rest[i * 3], rig.rest[i * 3 + 1], rig.rest[i * 3 + 2]];

function segDistance(p, a, b) {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (len(ab) ** 2 || 1)));
  return len(sub(p, add(a, [ab[0] * t, ab[1] * t, ab[2] * t])));
}
// Parent › With Automatic Weights. Blender uses "bone heat"; here: inverse distance to each bone,
// which gives the same kind of soft blend around the joints.
export function automaticWeights(rig, power = 6) {
  const W = emptyWeights(rig);
  for (let i = 0; i < rig.count; i++) {
    const p = vertex(rig, i);
    const d = rig.bones.map(b => Math.max(0.05, segDistance(p, b.head, b.tail)));
    const dmin = Math.min(...d);
    const raw = d.map(x => x > dmin * 2.2 ? 0 : Math.pow(dmin / x, power));
    const s = raw.reduce((a, b) => a + b, 0);
    raw.forEach((w, g) => { W[g][i] = w / s; });
  }
  return W;
}

// ─── Pose and deformation (linear blend skinning, like Blender's Armature modifier) ─
export const restPose = rig => rig.bones.map(() => ({ bend: 0, twist: 0 }));
export function boneMatrices(rig, pose) {
  const M = [];
  rig.bones.forEach((b, i) => {
    const axis = norm(sub(b.tail, b.head));
    const R = mul3(axisAngle([0, 0, 1], pose[i]?.bend || 0), axisAngle(axis, pose[i]?.twist || 0));
    const local = { R, t: sub(b.head, apply3(R, b.head)) }; // rotate about the head
    M[i] = b.parent >= 0 ? compose(M[b.parent], local) : local;
  });
  return M;
}
// Blender normalizes by the total weight; a vertex with no weight at all stays where it was.
export function deform(rig, W, pose, out = new Float32Array(rig.count * 3)) {
  const M = boneMatrices(rig, pose);
  for (let i = 0; i < rig.count; i++) {
    const p = vertex(rig, i);
    let acc = [0, 0, 0], tot = 0;
    for (let g = 0; g < W.length; g++) {
      const w = W[g][i];
      if (w <= 0) continue;
      const q = applyT(M[g], p);
      acc = [acc[0] + q[0] * w, acc[1] + q[1] * w, acc[2] + q[2] * w]; tot += w;
    }
    const r = tot > 1e-6 ? [acc[0] / tot, acc[1] / tot, acc[2] / tot] : p;
    out[i * 3] = r[0]; out[i * 3 + 1] = r[1]; out[i * 3 + 2] = r[2];
  }
  return out;
}
export function bonePose(rig, pose) {
  const M = boneMatrices(rig, pose);
  return rig.bones.map((b, i) => ({ head: applyT(M[i], b.head), tail: applyT(M[i], b.tail) }));
}

// ─── Painting ────────────────────────────────────────────────────────────────
export const total = (W, i) => { let s = 0; for (const g of W) s += g[i]; return s; };
// Auto Normalize: the active group keeps its weight and the others share the rest.
// (With only one group on a vertex, Blender makes it 1.0.)
export function normalizeVertex(W, i, active) {
  const a = Math.min(1, Math.max(0, W[active][i]));
  W[active][i] = a;
  let others = 0;
  for (let g = 0; g < W.length; g++) if (g !== active) others += W[g][i];
  if (others > 1e-6) { const k = (1 - a) / others; for (let g = 0; g < W.length; g++) if (g !== active) W[g][i] *= k; }
  else if (a > 0) W[active][i] = 1;
}
function mirrorGroup(rig, g) { return rig.bones[g].mirror; }

// hits: [{ index, falloff 0..1 }]. Returns the set of changed vertices.
export function stroke(rig, W, hits, { tool = 'draw', blend = 'mix', weight = 1, strength = 0.5, active = 0, autoNormalize = true, xMirror = false }) {
  const changed = new Set();
  const doOne = (i, f, g) => {
    const w0 = W[g][i];
    let w = w0;
    if (blend === 'add') w = w0 + weight * strength * f;
    else if (blend === 'subtract') w = w0 - weight * strength * f;
    else w = w0 + (weight - w0) * strength * f;
    W[g][i] = Math.max(0, Math.min(1, w));
    if (autoNormalize) normalizeVertex(W, i, g);
    changed.add(i);
  };
  if (tool === 'blur') {
    // Blur: each dab moves the weights towards the average of their neighbours (three quick passes,
    // reading the weights from before each pass so the result does not depend on the vertex order).
    for (let pass = 0; pass < 3; pass++) {
      const src = new Float32Array(W[active]);
      for (const { index, falloff } of hits) {
        const nb = rig.adjacency[index]; let s = 0; for (const j of nb) s += src[j];
        const avg = nb.length ? s / nb.length : src[index];
        W[active][index] = Math.max(0, Math.min(1, src[index] + (avg - src[index]) * strength * falloff));
      }
    }
    for (const { index } of hits) {
      if (autoNormalize) normalizeVertex(W, index, active);
      changed.add(index);
      if (xMirror) {
        const mi = rig.mirror[index], mg = mirrorGroup(rig, active);
        if (mi >= 0 && mg >= 0 && !(mi === index && mg === active)) { W[mg][mi] = W[active][index]; if (autoNormalize) normalizeVertex(W, mi, mg); changed.add(mi); }
      }
    }
    return changed;
  }
  for (const { index, falloff } of hits) {
    doOne(index, falloff, active);
    if (xMirror) {
      const mi = rig.mirror[index], mg = mirrorGroup(rig, active);
      if (mi >= 0 && mg >= 0 && !(mi === index && mg === active)) doOne(mi, falloff, mg);
    }
  }
  return changed;
}

// ─── Weights menu ────────────────────────────────────────────────────────────
export function normalizeAll(W, rig) {
  for (let i = 0; i < rig.count; i++) { const s = total(W, i); if (s > 1e-6) for (const g of W) g[i] /= s; }
}
export function smooth(W, rig, { groups = null, factor = 0.5, repeat = 1 } = {}) {
  const gs = groups ?? W.map((_, g) => g);
  for (let r = 0; r < repeat; r++) for (const g of gs) {
    const src = new Float32Array(W[g]);
    for (let i = 0; i < rig.count; i++) {
      const nb = rig.adjacency[i]; let s = 0; for (const j of nb) s += src[j];
      W[g][i] = src[i] + ((nb.length ? s / nb.length : src[i]) - src[i]) * factor;
    }
  }
}
export function clean(W, rig, limit = 0.01) { let n = 0; for (const g of W) for (let i = 0; i < rig.count; i++) if (g[i] > 0 && g[i] < limit) { g[i] = 0; n++; } return n; }
export function limitTotal(W, rig, limit = 4) {
  let n = 0;
  for (let i = 0; i < rig.count; i++) {
    const order = W.map((g, k) => [g[i], k]).filter(([w]) => w > 0).sort((a, b) => b[0] - a[0]);
    for (const [, k] of order.slice(limit)) { W[k][i] = 0; n++; }
  }
  return n;
}
// Copies the active group onto the other side (…L → …R), like Vertex Group › Mirror with names flipped.
export function mirrorWeights(W, rig, active) {
  const mg = rig.bones[active].mirror;
  if (mg < 0) return 0;
  const src = new Float32Array(W[active]);
  let n = 0;
  for (let i = 0; i < rig.count; i++) {
    const mi = rig.mirror[i]; if (mi < 0) continue;
    if (mg === active) { if (vertex(rig, i)[0] > 0) { W[active][mi] = src[i]; n++; } }
    else { W[mg][mi] = src[i]; n++; }
  }
  return n;
}

// ─── Analysis ────────────────────────────────────────────────────────────────
export function stats(W, rig) {
  let zero = 0, notNormalized = 0, maxInf = 0, tiny = 0;
  for (let i = 0; i < rig.count; i++) {
    let s = 0, inf = 0;
    for (const g of W) { const w = g[i]; s += w; if (w > 1e-4) inf++; if (w > 1e-4 && w < 0.05) tiny++; }
    if (s < 1e-4) zero++; else if (Math.abs(s - 1) > 0.01) notNormalized++;
    maxInf = Math.max(maxInf, inf);
  }
  return { zero, notNormalized, maxInfluences: maxInf, tiny };
}
// Average weight of a group on the ring of vertices closest to x.
export function ringAverage(W, rig, g, x, width = 0.06) {
  let s = 0, n = 0;
  for (let i = 0; i < rig.count; i++) if (Math.abs(rig.rest[i * 3] - x) <= width) { s += W[g][i]; n++; }
  return n ? s / n : 0;
}
export function symmetryError(W, rig) {
  let worst = 0;
  for (let i = 0; i < rig.count; i++) {
    const mi = rig.mirror[i]; if (mi < 0) continue;
    for (let g = 0; g < W.length; g++) { const mg = rig.bones[g].mirror; if (mg < 0) continue; worst = Math.max(worst, Math.abs(W[g][i] - W[mg][mi])); }
  }
  return worst;
}
