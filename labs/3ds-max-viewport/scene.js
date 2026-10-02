// 3ds Max Viewport Lab · the scene model: objects, instances, groups, transforms, clones and arrays.
// Pure JS (tested with node). Max coordinates: Z up, metres, rotations in degrees (Euler XYZ controller).
import { buildMesh, defaults, bounds, newMod } from './prims.js?v=1';

// ─── Small maths ────────────────────────────────────────────────────────────
const D = Math.PI / 180;
export function matFromEuler([ax, ay, az]) {
  const a = ax * D, b = ay * D, c = az * D, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [[cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc], [cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc], [-sb, sa * cb, ca * cb]];
}
export function eulerFromMat(R) {
  const sb = Math.max(-1, Math.min(1, -R[2][0])), b = Math.asin(sb);
  let a, c;
  if (Math.abs(Math.cos(b)) > 1e-6) { a = Math.atan2(R[2][1], R[2][2]); c = Math.atan2(R[1][0], R[0][0]); }
  else { a = 0; c = Math.atan2(-R[0][1], R[1][1]); }
  const r = v => { let d = +(v / D).toFixed(6); if (Math.abs(d) < 1e-6) d = 0; return d; };
  return [r(a), r(b), r(c)];
}
export const mul = (A, B) => A.map((row, i) => [0, 1, 2].map(j => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
export const apply = (R, v) => [0, 1, 2].map(i => R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2]);
export const transpose = R => [0, 1, 2].map(i => [0, 1, 2].map(j => R[j][i]));
export function axisAngle(axis, deg) {
  const l = Math.hypot(...axis) || 1, [x, y, z] = axis.map(v => v / l), a = deg * D, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
}
const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]);
const round = (v, n = 6) => +(+v).toFixed(n);
export const clone = o => JSON.parse(JSON.stringify(o));

// ─── Objects ────────────────────────────────────────────────────────────────
// 3ds Max gives each new object a random wire colour: these are colours from its default palette.
export const PALETTE = ['#e1117f', '#8ab01a', '#1c96e6', '#e6c21c', '#9c2fe0', '#1ce6c2', '#e6641c', '#57a3d4', '#b3e61c', '#d65c9a', '#5c7ad6', '#2ab87a'];
export function emptyScene() { return { objs: [], bases: {}, sel: [], flags: {}, ghosts: [], marks: null, seq: 0 }; }
export const find = (st, id) => st.objs.find(o => o.id === id);
export const isGroup = o => o?.type === 'Group';
export const members = (st, gid) => st.objs.filter(o => o.parent === gid);
export function nextName(st, prefix) {
  const used = new Set(st.objs.map(o => o.name));
  for (let i = 1; ; i++) { const n = `${prefix}${String(i).padStart(3, '0')}`; if (!used.has(n)) return n; }
}
export function addObject(st, type, params = {}, o = {}) {
  const baseId = `b${++st.seq}`;
  st.bases[baseId] = { type, params: { ...defaults(type), ...params }, mods: (o.mods || []).map(m => ({ ...newMod(m.type), ...m })) };
  const name = o.name || nextName(st, type);
  const ob = { id: name, name, type, base: baseId, pos: o.pos || [0, 0, 0], rot: o.rot || [0, 0, 0], scale: o.scale || [1, 1, 1], color: o.color || PALETTE[(st.seq * 5) % PALETTE.length], own: [], parent: o.parent || null, hidden: !!o.hidden, frozen: !!o.frozen, created: !!o.created };
  st.objs.push(ob);
  return ob;
}
export const baseOf = (st, o) => st.bases[o.base];
export const modsOf = (st, o) => [...baseOf(st, o).mods, ...(o.own || [])];
// Objects sharing the base object: instances and references (the ones 3ds Max shows in bold in the stack).
export const sharing = (st, o) => st.objs.filter(x => x.base && x.base === o.base);
export function localMesh(st, o) { const b = baseOf(st, o); return buildMesh(b.type, b.params, modsOf(st, o)); }
export function worldPoint(o, p) { return add(o.pos, apply(matFromEuler(o.rot), [p[0] * o.scale[0], p[1] * o.scale[1], p[2] * o.scale[2]])); }
export function worldVerts(st, o) {
  if (isGroup(o)) return members(st, o.id).flatMap(m => worldVerts(st, m));
  return localMesh(st, o).verts.map(v => worldPoint(o, v));
}
export function worldBounds(st, ids) { const v = ids.flatMap(id => worldVerts(st, find(st, id))); return v.length ? bounds(v) : null; }

// ─── Selection ──────────────────────────────────────────────────────────────
// What a click selects: the object, or its group when the group is closed (as in 3ds Max).
export function pickTarget(st, id) {
  let o = find(st, id);
  while (o?.parent) { const g = find(st, o.parent); if (!g || g.open) break; o = g; }
  return o?.id ?? null;
}
export const selectable = (st, o) => !!o && !o.hidden && !o.frozen && (!o.parent || find(st, o.parent)?.open || false);
// The objects 3ds Max transforms: groups carry their members with them.
export function moving(st, ids) {
  const out = new Set();
  const addOne = id => { const o = find(st, id); if (!o) return; out.add(id); if (isGroup(o)) members(st, id).forEach(m => addOne(m.id)); };
  ids.forEach(addOne); return [...out].map(id => find(st, id));
}

// ─── Transforms (on the selection) ──────────────────────────────────────────
export function moveBy(st, ids, d) { for (const o of moving(st, ids)) o.pos = o.pos.map((v, i) => round(v + d[i])); }
// Rotate about an axis through a centre (Pivot Point Center: each object about its own pivot).
export function rotateBy(st, ids, axis, deg, center = null) {
  const Q = axisAngle(axis, deg);
  const turn = (o, c) => { o.rot = eulerFromMat(mul(Q, matFromEuler(o.rot))); o.pos = add(c, apply(Q, sub(o.pos, c))).map(v => round(v)); };
  for (const id of ids) {
    const top = find(st, id), c = center || top.pos;
    for (const o of moving(st, [id])) turn(o, c);
  }
}
// Scale by factors along the object's own axes (the way 3ds Max keeps scale in the object's transform).
export function scaleBy(st, ids, f, center = null) {
  for (const id of ids) {
    const top = find(st, id), c = center || top.pos, R = matFromEuler(top.rot), Rt = transpose(R);
    for (const o of moving(st, [id])) {
      o.scale = o.scale.map((s, i) => round(s * f[i]));
      const local = apply(Rt, sub(o.pos, c)); o.pos = add(c, apply(R, local.map((v, i) => v * f[i]))).map(v => round(v));
    }
  }
}
export const selectionCenter = (st, ids) => { const p = ids.map(id => find(st, id).pos); return [0, 1, 2].map(i => p.reduce((s, v) => s + v[i], 0) / p.length); };

// ─── Clone: Copy, Instance, Reference ───────────────────────────────────────
// Copy: a new, independent base object. Instance: the same base object and modifiers (change one, all change).
// Reference: the same base object and the modifiers below the line; its own modifiers only affect it.
function cloneOne(st, o, mode, parent = o.parent) {
  let base = o.base;
  if (mode === 'copy' && o.base) { base = `b${++st.seq}`; st.bases[base] = clone(st.bases[o.base]); if (o.own?.length) { st.bases[base].mods.push(...clone(o.own)); } }
  const prefix = o.name.replace(/\d+$/, '') || o.type;
  const name = nextName(st, prefix);
  // a copy owns every modifier; an instance keeps the same stack; a reference starts with nothing above the line
  const c = { ...clone(o), id: name, name, base, parent, created: false, own: mode === 'instance' ? clone(o.own || []) : [], isRef: mode === 'reference' || (mode === 'instance' && !!o.isRef) };
  if (isGroup(o)) { c.base = null; c.open = false; }
  st.objs.push(c);
  if (isGroup(o)) for (const m of members(st, o.id)) cloneOne(st, m, mode, c.id);
  return c;
}
// n clones of the selection, each one `step` further (step(clone, k) moves / turns / scales clone k).
export function cloneSelection(st, ids, mode, n, step) {
  const made = [];
  for (let k = 1; k <= n; k++) for (const id of ids) { const c = cloneOne(st, find(st, id), mode); step(c, k); made.push(c.id); }
  return made;
}
export function makeUnique(st, id) {
  const o = find(st, id); if (!o?.base || sharing(st, o).length < 2) return false;
  const b = `b${++st.seq}`; st.bases[b] = clone(st.bases[o.base]); st.bases[b].mods.push(...clone(o.own || [])); o.own = []; o.base = b; o.isRef = false; return true;
}

// ─── Tools › Array ──────────────────────────────────────────────────────────
// Incremental move, rotation and scale per copy; a second dimension repeats the whole row with its own offset.
export function arrayObject(st, id, { move = [0, 0, 0], rot = [0, 0, 0], scale = [100, 100, 100], count1 = 1, count2 = 1, move2 = [0, 0, 0], mode = 'copy', dims = 1 }) {
  const src = find(st, id), made = [];
  const n1 = Math.max(1, Math.round(count1)), n2 = dims >= 2 ? Math.max(1, Math.round(count2)) : 1;
  for (let j = 0; j < n2; j++) for (let i = 0; i < n1; i++) {
    if (!i && !j) continue;
    const c = cloneOne(st, src, mode);
    const d = [0, 1, 2].map(a => move[a] * i + move2[a] * j);
    moveBy(st, [c.id], d);
    if (rot.some(Boolean)) for (const [a, v] of [['x', rot[0]], ['y', rot[1]], ['z', rot[2]]]) if (v) rotateBy(st, [c.id], a === 'x' ? [1, 0, 0] : a === 'y' ? [0, 1, 0] : [0, 0, 1], v * i);
    if (scale.some(s => s !== 100)) scaleBy(st, [c.id], scale.map(s => Math.pow(s / 100, i)));
    made.push(c.id);
  }
  return made;
}

// ─── Groups ─────────────────────────────────────────────────────────────────
export function groupObjects(st, ids, name) {
  const tops = ids.map(id => find(st, id)).filter(Boolean);
  if (!tops.length) return null;
  const b = worldBounds(st, tops.map(o => o.id));
  const g = { id: name, name, type: 'Group', base: null, pos: [round((b.lo[0] + b.hi[0]) / 2), round((b.lo[1] + b.hi[1]) / 2), round(b.lo[2])], rot: [0, 0, 0], scale: [1, 1, 1], color: '#7a7a7a', own: [], parent: tops[0].parent || null, open: false, hidden: false, frozen: false };
  st.objs.push(g);
  for (const o of tops) o.parent = g.id;
  return g;
}
export function ungroup(st, gid) {
  const g = find(st, gid); if (!isGroup(g)) return [];
  const ms = members(st, gid); ms.forEach(m => { m.parent = g.parent || null; });
  st.objs = st.objs.filter(o => o.id !== gid);
  return ms.map(m => m.id);
}
export function setHidden(st, id, v) { for (const o of moving(st, [id])) o.hidden = v; }
export function setFrozen(st, id, v) { for (const o of moving(st, [id])) o.frozen = v; }
export function deleteObjects(st, ids) {
  const gone = new Set(moving(st, ids).map(o => o.id));
  st.objs = st.objs.filter(o => !gone.has(o.id));
  const used = new Set(st.objs.map(o => o.base).filter(Boolean));
  for (const b of Object.keys(st.bases)) if (!used.has(b)) delete st.bases[b];
  st.sel = st.sel.filter(id => !gone.has(id));
  return gone.size;
}
export function rename(st, id, name) {
  name = String(name).trim(); if (!name || find(st, name)) return false;
  const o = find(st, id); if (!o) return false;
  for (const m of st.objs) if (m.parent === id) m.parent = name;
  st.sel = st.sel.map(s => s === id ? name : s); st.ghosts.forEach(g => { if (g.name === id) g.name = name; });
  o.id = o.name = name; return true;
}
