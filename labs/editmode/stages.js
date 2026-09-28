// Edit Mode Lab: stages, steps and checks. Pure JS (tested with node).
import * as E from './em.js?v=1';
import { defaultView } from '../viewport/vp.js?v=1';

const near = (a, b, t) => Math.abs(a - b) <= t;
function base(m, o = {}) {
  return { m, mode: o.mode || 'edit', sm: o.sm || 'vert', sel: E.emptySel(), xray: false, view: { ...defaultView(), dist: 12, ...(o.view || {}) }, flags: {}, aspect: 16 / 9 };
}
export function startState(step) { const s = step.start(); s.flags = {}; return s; }
const findV = (m, p, t = 1e-4) => m.v.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= t);
export const vertsAt = (m, pred) => m.v.map((p, i) => pred(p) ? i : -1).filter(i => i >= 0);
const faceWhere = (m, pred) => m.f.findIndex(f => f.every(i => pred(m.v[i])));
// Does the mesh have exactly these vertex positions (each within tol)?
export function sameVerts(m, pts, tol = 0.02) {
  if (m.v.length !== pts.length) return false;
  const used = new Set();
  return pts.every(p => { const i = m.v.findIndex((q, k) => !used.has(k) && Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= tol); if (i < 0) return false; used.add(i); return true; });
}
const corners = (x, y, z) => [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];

// ─── Step 1: marks ──────────────────────────────────────────────────────────
export const MARK = { v: [1, -1, 1], e: [[-1, -1, -1], [-1, -1, 1]], f: 'top' };
export function markIds(m) {
  const v = findV(m, MARK.v), e = E.ek(findV(m, MARK.e[0]), findV(m, MARK.e[1])), f = faceWhere(m, p => near(p[2], 1, 1e-4));
  return { v, e, f };
}
export function markReport(st) {
  const ids = markIds(st.m), s = E.flush(st.m, st.sm, st.sel);
  return {
    v: st.mode === 'edit' && st.sm === 'vert' && s.V.length === 1 && s.V[0] === ids.v,
    e: st.mode === 'edit' && st.sm === 'edge' && s.E.length === 1 && s.E[0] === ids.e,
    f: st.mode === 'edit' && st.sm === 'face' && s.F.length === 1 && s.F[0] === ids.f,
  };
}
// ─── Step 2: the +X half ────────────────────────────────────────────────────
export const halfGoal = m => vertsAt(m, p => p[0] > 1e-6);
export function halfReport(st) {
  const s = E.flush(st.m, st.sm, st.sel), goal = new Set(halfGoal(st.m)), sel = new Set(s.V);
  const hit = [...goal].filter(i => sel.has(i)).length, extra = [...sel].filter(i => !goal.has(i)).length;
  return { hit, total: goal.size, extra, ok: st.sm === 'vert' && hit === goal.size && extra === 0 };
}
// ─── Step 3: two loops of the sphere ────────────────────────────────────────
export function loopsReport(st) {
  const s = E.flush(st.m, st.sm, st.sel), rings = new Map();
  for (const i of s.V) { const z = Math.round(st.m.v[i][2] * 1000); rings.set(z, (rings.get(z) || 0) + 1); }
  const full = [...rings.entries()].filter(([, n]) => n === 16).map(([z]) => z);
  const partial = [...rings.values()].some(n => n !== 16);
  return { equator: full.includes(0), loops: full.length, partial, ok: full.length === 2 && full.includes(0) && !partial && s.V.length === 32 };
}
// ─── Shape steps: targets ───────────────────────────────────────────────────
const BASE = [...corners(1, 1, 0)];
export const TARGETS = {
  e4: [...BASE, ...corners(0.5, 0.5, 3)],
  e5: [...BASE, ...corners(1, 1, 2), ...corners(1, 1, 4), [3, -1, 2], [3, 1, 2], [3, -1, 4], [3, 1, 4]].filter((p, i, a) => a.findIndex(q => q.every((x, k) => x === p[k])) === i),
  e6: [...BASE, ...corners(1, 1, 2), ...corners(0.8, 0.8, 2), ...corners(0.8, 0.8, 0.5)],
  e7: [...BASE, ...corners(1, 1, 3), ...corners(1.4, 1.4, 1), ...corners(1.4, 1.4, 2)],
};
export function shapeReport(st, id) {
  const m = st.m, a = E.analyze(m), pts = TARGETS[id];
  const ok = sameVerts(m, pts, id === 'e4' || id === 'e7' ? 0.02 : 0.03) && E.windingOk(m) && a.duplicates === 0;
  const faces = { e4: 6, e5: 14, e6: 14, e7: 14 }[id];
  return { ok: ok && a.faces === faces, verts: m.v.length, want: pts.length, faces: a.faces, wantFaces: faces };
}
// Details used by the lab panel.
export function deformReport(m) {
  const top = vertsAt(m, p => p[2] > 1.5), zs = top.map(i => m.v[i][2]), xs = top.map(i => Math.abs(m.v[i][0]));
  return { top: top.length, z: zs.length ? Math.min(...zs) : 0, half: xs.length ? Math.max(...xs) : 0 };
}
export function bevelReport(st) {
  const m = st.m, a = E.analyze(m);
  const onSide = vertsAt(m, p => near(p[0], 1, 1e-3)), ys = onSide.map(i => m.v[i][1]);
  const w = ys.length ? 1 - Math.max(...ys) : 0, seg = Math.round(m.v.length / 8) - 1;
  return { w, seg, verts: m.v.length, ok: a.verts === 40 && a.ngons === 2 && a.quads === 20 && w >= 0.45 && w <= 0.55 && E.windingOk(m) && E.isClean(a) };
}
// ─── Step 9: the messy cube ─────────────────────────────────────────────────
export function messyCube() {
  const c = E.box([-1, -1, -1], [1, 1, 1]);
  // 0..7 as in box(). Detach the top face (duplicated vertices 8…11).
  c.v.push([-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]);
  c.f[1] = [8, 9, 10, 11];
  // A vertex in the middle of the front bottom edge (12).
  c.v.push([0, -1, -1]);
  c.f[2] = [0, 12, 1, 5, 4];
  // The bottom face split in two triangles along 0-2.
  c.f[0] = [0, 3, 2]; c.f.push([0, 2, 1, 12]);
  // A face inside the cube, from edge 1-5 to edge 3-7.
  c.f.push([1, 3, 7, 5]);
  // A loose vertex above the cube (13).
  c.v.push([0, 0, 1.8]);
  return c;
}
export function cleanReport(st) {
  const a = E.analyze(st.m), b = E.bounds(st.m);
  const size = b.hi.map((h, i) => h - b.lo[i]);
  return { a, ok: a.verts === 8 && a.faces === 6 && a.quads === 6 && E.isClean(a) && E.windingOk(st.m) && size.every(s => near(s, 2, 0.01)) };
}
// ─── Step 10: a stool ───────────────────────────────────────────────────────
// A horizontal slice of the mesh: one segment for each face that crosses the plane z.
export function slice(m, z) {
  const segs = [];
  for (const f of m.f) {
    const pts = [];
    f.forEach((a, i) => { const b = f[(i + 1) % f.length], pa = m.v[a], pb = m.v[b]; if ((pa[2] - z) * (pb[2] - z) < 0) { const t = (z - pa[2]) / (pb[2] - pa[2]); pts.push([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]); } });
    if (pts.length >= 2) segs.push([pts[0], pts[1]]);
  }
  return segs;
}
// Four separate legs at height z: every slice segment stays inside one corner quadrant, and all four quadrants have one.
export function legsAt(m, z, cx, cy, seatW) {
  const segs = slice(m, z), q = new Map(), margin = 0.03 * seatW;
  const quad = p => (Math.abs(p[0] - cx) < margin || Math.abs(p[1] - cy) < margin) ? null : `${Math.sign(p[0] - cx)},${Math.sign(p[1] - cy)}`;
  for (const [a, b] of segs) { const qa = quad(a), qb = quad(b); if (!qa || qa !== qb) return { ok: false, legs: 0, crossing: true }; if (!q.has(qa)) q.set(qa, []); q.get(qa).push(a, b); }
  const thin = [...q.values()].every(ps => { const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]); const w = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); return w > 0.02 && w < 0.5 * seatW; });
  return { ok: q.size === 4 && thin, legs: q.size, thin, crossing: false };
}
export function stoolReport(st) {
  const m = st.m, a = E.analyze(m), { lo, hi } = E.bounds(m), zTop = hi[2];
  const topV = vertsAt(m, p => p[2] > zTop - 0.01), tb = E.bounds(m, topV);
  const seatW = Math.min(tb.hi[0] - tb.lo[0], tb.hi[1] - tb.lo[1]), cx = (tb.lo[0] + tb.hi[0]) / 2, cy = (tb.lo[1] + tb.hi[1]) / 2;
  const low = legsAt(m, lo[2] + 0.1, cx, cy, seatW), high = legsAt(m, zTop - 1, cx, cy, seatW);
  const clean = E.isClean(a) && E.windingOk(m) && E.volume(m) > 0;
  return { clean, legs: Math.min(low.legs, high.legs), seatW, long: high.ok, height: zTop - lo[2], ok: clean && low.ok && high.ok && seatW >= 1.2 };
}
export function buildStool() {
  let m = E.box([-1, -1, 1.7], [1, 1, 2]);
  m = E.loopCut(m, 0, 1, 2).m;
  const e = E.edgeKeys(m).map(E.keyVerts).find(([p, q]) => near(m.v[p][0], 1, 1e-6) && near(m.v[q][0], 1, 1e-6) && near(m.v[p][2], 1.7, 1e-6) && near(m.v[q][2], 1.7, 1e-6));
  m = E.loopCut(m, e[0], e[1], 2).m;
  const feet = m.f.map((f, i) => i).filter(i => { const f = m.f[i], c = E.faceCenter(m, f); return f.every(x => near(m.v[x][2], 1.7, 1e-6)) && Math.abs(c[0]) > 0.5 && Math.abs(c[1]) > 0.5; });
  const r = E.extrudeFaces(m, feet); for (const i of r.moved) r.m.v[i][2] -= 1.6;
  return E.tidy(r.m);
}

// ─── Solutions built with the lab's own operations ──────────────────────────
function topFace(m, z) { return faceWhere(m, p => near(p[2], z, 1e-4)); }
function solveExtrude(m) {
  const t = topFace(m, 2); let r = E.extrudeFaces(m, [t]); for (const i of r.moved) r.m.v[i][2] += 2; m = r.m;
  const side = m.f.findIndex(f => f.every(i => near(m.v[i][0], 1, 1e-4) && m.v[i][2] >= 2 - 1e-4));
  r = E.extrudeFaces(m, [side]); for (const i of r.moved) r.m.v[i][0] += 2; return r.m;
}

export const STAGES = [
  {
    id: 'select', name: 'Select in Edit Mode', sub: 'Tab · 1 2 3 · Alt Z · Alt click',
    steps: [
      {
        id: 'e1', title: 'Vertices, edges, faces',
        text: 'A mesh is made of vertices (points), edges (lines between two vertices) and faces (the surfaces between edges). Enter Edit Mode and select each blue mark in its own select mode: the marked vertex in Vertex mode, the marked edge in Edge mode and the marked face in Face mode.',
        how: ['Put the mouse over the view and press <kbd>Tab</kbd>: Object Mode ↔ Edit Mode.', '<kbd>1</kbd> Vertex, <kbd>2</kbd> Edge, <kbd>3</kbd> Face select mode (the number row), or the three buttons in the header.', 'Click the mark. Only the mark may be selected: <kbd>Alt</kbd> <kbd>A</kbd> deselects everything.'],
        why: 'Every modelling tool works on the selection. Vertex, Edge and Face modes select the same mesh in three ways; choosing the right mode makes a selection one click instead of ten.',
        start: () => base(E.box(), { mode: 'object', view: { dist: 11 } }),
        check: s => { const r = markReport(s); return !!(s.flags.v || r.v) && !!(s.flags.e || r.e) && !!(s.flags.f || r.f); },
        solve: s => { s.mode = 'edit'; s.flags.v = s.flags.e = s.flags.f = true; const ids = markIds(s.m); s.sm = 'face'; s.sel = E.flush(s.m, 'face', { V: [], E: [], F: [ids.f] }); },
      },
      {
        id: 'e2', title: 'See through: X-ray',
        text: 'Select all the vertices of the +X half of this cube (every vertex with X greater than 0), and nothing else. In solid view a box only selects the vertices you can see: the ones at the back are hidden. Turn on X-ray to see and select through the mesh.',
        how: ['Press <kbd>Alt</kbd> <kbd>Z</kbd> (Toggle X-Ray), or the X-ray button in the header.', 'Look from the front (<kbd>Numpad 1</kbd>) and drag a box around the right half, in Vertex mode.', 'Check the counter in the panel: all of them, and no extra ones.'],
        why: 'X-ray lets a box reach the back of the mesh. Without it, many selections look complete from the front but miss the hidden side, and the model breaks on the other side.',
        start: () => base(E.gridCube(3), { view: { dist: 10 } }),
        check: s => halfReport(s).ok,
        solve: s => { s.sm = 'vert'; s.xray = true; s.sel = E.flush(s.m, 'vert', { V: halfGoal(s.m), E: [], F: [] }); },
      },
      {
        id: 'e3', title: 'Edge loops',
        text: 'An edge loop is a line of edges that goes all the way around, like the equator of this sphere. Select the equator loop with one click, then add a second loop.',
        how: ['<kbd>Alt</kbd> + click an edge of the equator: the whole loop is selected.', '<kbd>Shift</kbd> <kbd>Alt</kbd> + click another horizontal edge adds its loop.', 'Click near the middle of an edge, along the direction of the loop you want.'],
        why: 'Loops follow the flow of the mesh: around an arm, a mouth, the edge of a table. Selecting them with one click is the fastest way to work on clean topology.',
        start: () => base(E.uvSphere(16, 8), { sm: 'edge', view: { dist: 8, el: 18 } }),
        check: s => loopsReport(s).ok,
        solve: s => { const m = s.m, ring = z => vertsAt(m, p => near(p[2], z, 1e-4)); const z2 = m.v[ring(0.7071068).length ? ring(0.7071068)[0] : 1][2]; s.sm = 'vert'; s.sel = E.flush(m, 'vert', { V: [...ring(0), ...ring(z2)], E: [], F: [] }); },
      },
    ],
  },
  {
    id: 'shape', name: 'Shape the mesh', sub: 'G R S · E · I · Ctrl R · Ctrl B',
    steps: [
      {
        id: 'e4', title: 'Deform: a truncated pyramid',
        text: 'G, R and S also work on vertices, edges and faces. Make this cube a truncated pyramid: select the top face, move it 1 m up and scale it to half. The blue wireframe shows the goal.',
        how: ['<kbd>3</kbd> Face mode, click the top face.', '<kbd>G</kbd> <kbd>Z</kbd> <kbd>1</kbd> <kbd>Enter</kbd>: 1 m up.', '<kbd>S</kbd> <kbd>0</kbd> <kbd>.</kbd> <kbd>5</kbd> <kbd>Enter</kbd>: half the size.'],
        why: 'Moving part of a mesh changes its shape without adding geometry. Most low poly modelling is exactly this: pushing and pulling a few vertices.',
        start: () => base(E.box([-1, -1, 0], [1, 1, 2]), { sm: 'face', view: { target: [0, 0, 1.2] } }),
        target: 'e4', check: s => shapeReport(s, 'e4').ok,
        solve: s => { const t = topFace(s.m, 2); for (const i of s.m.f[t]) { s.m.v[i][2] = 3; s.m.v[i][0] *= 0.5; s.m.v[i][1] *= 0.5; } s.sm = 'face'; s.sel = E.flush(s.m, 'face', { V: [], E: [], F: [t] }); },
      },
      {
        id: 'e5', title: 'Extrude: an L',
        text: 'Extrude pulls new geometry out of the selection and keeps it joined to the rest. Build the L: extrude the top face 2 m up, then extrude the +X face of the new block 2 m to the right.',
        how: ['Select the top face and press <kbd>E</kbd>: the new face follows the mouse along its normal. Type <kbd>2</kbd> <kbd>Enter</kbd>.', 'Orbit and click the +X face of the upper block (the red X of the gizmo points to +X).', '<kbd>E</kbd> <kbd>2</kbd> <kbd>Enter</kbd> again.'],
        why: 'Extrude is the main tool of box modelling: a whole character can start as a cube with extruded arms, legs and head.',
        start: () => base(E.box([-1, -1, 0], [1, 1, 2]), { sm: 'face', view: { target: [0.8, 0, 1.8], dist: 16 } }),
        target: 'e5', check: s => shapeReport(s, 'e5').ok,
        solve: s => { s.m = solveExtrude(s.m); s.sel = E.emptySel(); },
      },
      {
        id: 'e6', title: 'Inset and extrude inwards',
        text: 'Make an open box: inset the top face by 0.2 m to leave a rim, then extrude the inner face 1.5 m down into the cube.',
        how: ['Top face selected, press <kbd>I</kbd> (Inset Faces): move the mouse towards the middle of the face, or type <kbd>0</kbd> <kbd>.</kbd> <kbd>2</kbd> <kbd>Enter</kbd>.', 'Press <kbd>E</kbd> and type <kbd>-</kbd> <kbd>1</kbd> <kbd>.</kbd> <kbd>5</kbd> <kbd>Enter</kbd>: a negative extrude goes inwards.', 'Turn on X-ray (<kbd>Alt</kbd> <kbd>Z</kbd>) to see the inside.'],
        why: 'Inset makes a border of new faces without changing the outline: rims, panels, windows, screens. Together with extrude it makes holes and cavities.',
        start: () => base(E.box([-1, -1, 0], [1, 1, 2]), { sm: 'face', view: { target: [0, 0, 1], el: 40 } }),
        target: 'e6', check: s => shapeReport(s, 'e6').ok,
        solve: s => { const t = topFace(s.m, 2); const r = E.insetFaces(s.m, [t], 0.2); const x = E.extrudeFaces(r.m, r.F); for (const i of x.moved) x.m.v[i][2] -= 1.5; s.m = E.tidy(x.m); s.sel = E.emptySel(); },
      },
      {
        id: 'e7', title: 'Loop cuts',
        text: 'A loop cut adds an edge loop across the mesh. Add two horizontal loops around this box, then scale only those loops 1.4 times in X and Y, to make a barrel.',
        how: ['<kbd>Ctrl</kbd> <kbd>R</kbd> and hover a vertical edge: a yellow line shows where the loop goes.', 'Scroll the wheel (or type <kbd>2</kbd>) for 2 cuts, click, then right-click to keep them centred.', 'The new loops stay selected: <kbd>S</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> <kbd>1</kbd> <kbd>.</kbd> <kbd>4</kbd> <kbd>Enter</kbd> scales them in X and Y only.'],
        why: 'Loop cuts add detail exactly where it is needed and keep all faces as quads. More loops, more shape, but only where the model needs to bend or curve.',
        start: () => base(E.box([-1, -1, 0], [1, 1, 3]), { sm: 'edge', view: { target: [0, 0, 1.5], dist: 14 } }),
        target: 'e7', check: s => shapeReport(s, 'e7').ok,
        solve: s => { const r = E.loopCut(s.m, 0, 4, 2); s.m = r.m; for (const i of r.loops.flat()) { s.m.v[i][0] *= 1.4; s.m.v[i][1] *= 1.4; } s.m = E.tidy(s.m); s.sm = 'vert'; s.sel = E.flush(s.m, 'vert', { V: r.loops.flat(), E: [], F: [] }); },
      },
      {
        id: 'e8', title: 'Bevel: round the corners',
        text: 'Real objects have no perfectly sharp edges. Round the four vertical edges of this box with a bevel of about 0.5 m and 4 segments.',
        how: ['<kbd>2</kbd> Edge mode. Select the four vertical edges (<kbd>Shift</kbd> + click, and orbit to reach the back ones, or X-ray and a box).', '<kbd>Ctrl</kbd> <kbd>B</kbd>: move the mouse for the width, scroll the wheel for Segments, or type <kbd>0</kbd> <kbd>.</kbd> <kbd>5</kbd>.', 'After confirming, the <b>Bevel</b> panel at the bottom left sets Width and Segments exactly.'],
        why: 'A bevel catches the light on the edge, so a model looks solid and real. In games it also gives smoother shading with only a few extra faces.',
        start: () => base(E.box([-1, -1, 0], [1, 1, 2]), { sm: 'edge', view: { target: [0, 0, 1], el: 34 } }),
        check: s => bevelReport(s).ok,
        solve: s => { s.m = E.bevelEdges(s.m, ['0_4', '1_5', '2_6', '3_7'], 0.5, 4).m; s.sel = E.emptySel(); },
      },
    ],
  },
  {
    id: 'build', name: 'Clean and build', sub: 'M · X · Dissolve · final',
    steps: [
      {
        id: 'e9', title: 'Clean a broken mesh',
        text: 'This cube looks right, but its mesh is broken: the top face is loose on duplicated vertices, a vertex sits in the middle of an edge, the bottom is split in two, there is a face hidden inside and a loose vertex floats above. Fix it until the analyser shows a clean cube: 8 vertices, 6 quads, no problems.',
        how: ['<kbd>A</kbd> then <kbd>M</kbd> › <b>By Distance</b> joins duplicated vertices.', 'Select the extra vertex or edge and use <kbd>X</kbd> › <b>Dissolve Vertices</b> or <b>Dissolve Edges</b>: they go away and the faces stay.', 'Hidden face: X-ray, Face mode, click it, <kbd>X</kbd> › <b>Faces</b>. Loose vertex: select it, <kbd>X</kbd> › <b>Vertices</b>.'],
        why: 'Broken meshes cause bad shading, holes in 3D prints, wrong UVs and errors in game engines. Delete removes geometry and leaves a hole; Dissolve removes it and fills the gap.',
        start: () => base(messyCube(), { view: { dist: 11 } }),
        check: s => cleanReport(s).ok,
        solve: s => { s.m = E.box([-1, -1, -1], [1, 1, 1]); s.sel = E.emptySel(); },
      },
      {
        id: 'e10', title: 'Final challenge: a stool',
        text: 'Model a stool from the cube: a seat and four legs, one near each corner, in one clean mesh. No wireframe to copy and no hints: plan it with what you learnt.',
        how: ['A flat seat, four legs at least 1 m long, thinner than half the seat. The analyser must stay clean.'],
        why: 'This is a real modelling plan: block the big shape, add loops where the legs start, extrude, and keep the mesh clean for the next steps (UVs, materials, export).',
        start: () => base(E.box(), { view: { dist: 13 } }),
        check: s => stoolReport(s).ok,
        solve: s => { s.m = buildStool(); s.sel = E.emptySel(); s.view = { ...s.view, target: [0, 0, 1], dist: 12 }; },
      },
    ],
  },
  {
    id: 'free', name: 'Free mode', sub: 'Every tool of the lab',
    steps: [
      {
        id: 'f1', title: 'Free mode', free: true,
        text: 'Nothing to check here: a cube to model freely with every tool of the lab.',
        how: ['<kbd>E</kbd> Extrude, <kbd>I</kbd> Inset, <kbd>Ctrl</kbd> <kbd>R</kbd> Loop Cut, <kbd>Ctrl</kbd> <kbd>B</kbd> Bevel, <kbd>M</kbd> Merge, <kbd>X</kbd> Delete and Dissolve.', '<kbd>G</kbd> <kbd>R</kbd> <kbd>S</kbd> with axes and numbers, <kbd>Alt</kbd> <kbd>Z</kbd> X-ray, <kbd>Alt</kbd> + click loops.'],
        why: 'Free play is how the keys become habits.',
        start: () => base(E.box()),
        check: () => false, solve: () => {},
      },
    ],
  },
];
