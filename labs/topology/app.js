// Topology Lab: a Blender-style Edit Mode on small meshes.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import * as M from './mesh.js?v=1';
import { bend, highStone, snapToStone, stoneDistance, smoothVerts, cornerLoss, elbowVolume, maxSnapError, densityRatio } from './models.js?v=1';
import { STAGES, startState, armInfo, ZONE } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-topo:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-topo:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [], done: store.get('done', {}), hover: false,
  over: { types: false, poles: false }, tool: null, crease: 1,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

// ─── Viewport ────────────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x3a3a3a);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(3, 5, 4); scene.add(sun);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls.addEventListener('change', () => { dirty = true; if (S.st?.kind === 'stone') build(); });
const grid = new THREE.GridHelper(10, 20, 0x555555, 0x474747); grid.position.y = -1.3; scene.add(grid);
const world = new THREE.Group(); scene.add(world);
let dirty = true;
const CAMS = { panel: [[0, 0.2, 3.4], [0, 0, 0]], bottle: [[1.4, 2.0, 2.6], [0, 0, 0]], slab: [[2.2, 1.5, 2.6], [0, 0, 0]], arm: [[0.3, 0.9, 3.6], [0.2, 0.3, 0]], stone: [[2.2, 1.4, 3.0], [0, 0, 0]] };
function frame(kind) { const [p, tg] = CAMS[kind] || CAMS.slab; camera.position.set(...p); controls.target.set(...tg); controls.update(); dirty = true; }

// Materials
const COL = { quad: 0x9a9a9a, tri: 0xe6c24a, ngon: 0xe0564a, sel: 0xffa629, face: 0xb8b8b8 };
const cageMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const resultMat = new THREE.MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.55, side: THREE.DoubleSide });
const highMat = new THREE.MeshStandardMaterial({ color: 0x8c7b6a, roughness: 0.9 });
let high = null;

// Picking data of the current draw
let draw = { pos: [], tris: null, owner: null, edges: [] };
function displayPositions() {
  const s = S.st;
  return s.mesh.v;
}
function build() {
  for (const c of [...world.children]) { world.remove(c); c.traverse(o => { o.geometry?.dispose(); if (o.material && o.material !== cageMat && o.material !== resultMat && o.material !== highMat) o.material.dispose(); }); }
  const s = S.st, m = s.mesh, pos = displayPositions(), sel = selectionSets();
  // the result of the modifiers: armature bend, then subdivision
  const withMods = s.kind === 'arm' || s.subsurf.on;
  if (withMods) {
    let r = s.kind === 'arm' ? bend(m, s.arm.angle, s.arm.preserve) : M.clone(m);
    if (s.subsurf.on) r = M.subdivide(r, s.subsurf.levels);
    const T = M.triangulate(r), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(r.v.flat(), 3)); g.setIndex(T.tris); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, resultMat); world.add(mesh);
  }
  // the edit cage
  const T = M.triangulate(m), cols = [], verts = [];
  const types = S.over.types;
  T.tris.forEach((vi, k) => {
    const fi = T.owner[Math.floor(k / 3)], n = m.f[fi].length;
    const c = new THREE.Color(sel.f.has(fi) ? COL.sel : types ? (n === 3 ? COL.tri : n > 4 ? COL.ngon : COL.quad) : s.kind === 'stone' ? 0x9fc4ff : COL.face);
    verts.push(...pos[vi]); cols.push(c.r, c.g, c.b);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
  const cage = new THREE.Mesh(g, cageMat);
  cageMat.side = s.kind === 'stone' ? THREE.FrontSide : THREE.DoubleSide; cageMat.depthTest = s.kind !== 'stone';
  cageMat.transparent = withMods || s.kind === 'stone'; cageMat.opacity = withMods ? 0.18 : s.kind === 'stone' ? 0.55 : 1; cageMat.depthWrite = !cageMat.transparent;
  world.add(cage);
  // edges
  // on the stone, the cage is drawn over the high poly: hide the parts that face away from the camera
  const front = p => s.kind !== 'stone' || new THREE.Vector3(...p).normalize().dot(new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(...p)).normalize()) > -0.05;
  const E = M.edges(m), ep = [], ec = [];
  const faceTypeEdge = new Set();
  for (const [a, b] of E) {
    if (!front(M.V.lerp(pos[a], pos[b], 0.5))) continue;
    const k = M.ek(a, b), cr = m.crease[k] || 0;
    const c = new THREE.Color(sel.e.has(k) ? COL.sel : cr > 0 ? new THREE.Color(0x111111).lerp(new THREE.Color(0xe040c8), cr) : 0x111111);
    ep.push(...pos[a], ...pos[b]); ec.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  void faceTypeEdge;
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
  const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: s.kind !== 'stone' })); lines.renderOrder = 2; world.add(lines);
  // vertices (in vertex mode), poles
  const used = [...new Set(m.f.flat())];
  if (s.sel.mode === 'vert') {
    const vp = [], vc = [];
    for (const i of used) { if (!front(pos[i])) continue; const c = new THREE.Color(sel.v.has(i) ? COL.sel : s.kind === 'stone' && stoneDistance(m.v[i]) > 0.01 ? 0xff4a3a : 0x111111); vp.push(...pos[i]); vc.push(c.r, c.g, c.b); }
    const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); vg.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
    const pts = new THREE.Points(vg, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: s.kind !== 'stone' })); pts.renderOrder = 3; world.add(pts);
  }
  if (S.over.poles) {
    const st = M.stats(m);
    for (const [list, col] of [[st.poles3, 0x4aa3ff], [st.poles5, 0xff8a2a]]) for (const i of list) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false })); b.position.set(...pos[i]); b.renderOrder = 4; world.add(b);
    }
  }
  if (s.kind === 'stone') { if (!high) { const h = highStone(64), hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(h.v.flat(), 3)); hg.setIndex(M.triangulate(h).tris); hg.computeVertexNormals(); high = new THREE.Mesh(hg, highMat); high.scale.setScalar(0.985); } world.add(high); }
  if (s.kind === 'arm') {
    // the bending zone and the bone
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, ZONE * 2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    band.rotation.z = Math.PI / 2; world.add(band);
    const a = s.arm.angle * Math.PI / 180, bone = [[-1.2, 0, 0], [0, 0, 0], [1.2 * Math.cos(a), 1.2 * Math.sin(a), 0]];
    const bl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bone.map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0x6ad1ff, depthTest: false })); bl.renderOrder = 5; world.add(bl);
  }
  // the loop cut preview
  if (S.tool?.type === 'cut' && S.tool.preview) {
    const pg = new THREE.BufferGeometry().setFromPoints(S.tool.preview.map(p => new THREE.Vector3(...p)));
    const pl = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0xffe14a, depthTest: false, transparent: true })); pl.renderOrder = 10; world.add(pl);
  }
  draw = { pos, tris: T.tris, owner: T.owner, edges: E, used, front: s.kind === 'stone' ? front : null };
  dirty = true;
}

// ─── Selection ───────────────────────────────────────────────────────────────
function selectionSets() { const s = S.st.sel; return { v: new Set(s.v), e: new Set(s.e), f: new Set(s.f) }; }
// The vertices affected by the selection, in any mode
function selectedVerts() {
  const s = S.st.sel, m = S.st.mesh, out = new Set(s.v);
  for (const k of s.e) k.split('_').forEach(i => out.add(+i));
  for (const fi of s.f) m.f[fi]?.forEach(i => out.add(i));
  return [...out];
}
function screenOf(p) { const v = new THREE.Vector3(...p).project(camera), r = canvas.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, v.z]; }
function mouseOf(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function facingCamera(p, n) { return !n || new THREE.Vector3(...n).dot(new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(...p))) > 0; }
function pickVert(e) {
  const [mx, my] = mouseOf(e); let best = null, bd = 14;
  for (const i of draw.used) { if (draw.front && !draw.front(draw.pos[i])) continue; const [x, y, z] = screenOf(draw.pos[i]); if (z > 1) continue; const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = i; } }
  return best;
}
function pickEdge(e) {
  const [mx, my] = mouseOf(e); let best = null, bd = 10, bt = 0.5;
  for (const [a, b] of draw.edges) {
    if (draw.front && !draw.front(M.V.lerp(draw.pos[a], draw.pos[b], 0.5))) continue;
    const A = screenOf(draw.pos[a]), B = screenOf(draw.pos[b]); if (A[2] > 1 || B[2] > 1) continue;
    const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy || 1, tt = Math.max(0, Math.min(1, ((mx - A[0]) * dx + (my - A[1]) * dy) / l2));
    const d = Math.hypot(A[0] + dx * tt - mx, A[1] + dy * tt - my);
    if (d < bd) { bd = d; best = [a, b]; bt = tt; }
  }
  return best ? { a: best[0], b: best[1], t: bt } : null;
}
function pickFace(e) {
  const [mx, my] = mouseOf(e), r = canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(mx / r.width * 2 - 1, -my / r.height * 2 + 1), camera);
  let best = null, bd = Infinity;
  for (let k = 0; k < draw.tris.length; k += 3) {
    const [a, b, c] = [draw.tris[k], draw.tris[k + 1], draw.tris[k + 2]].map(i => new THREE.Vector3(...draw.pos[i]));
    const hit = ray.ray.intersectTriangle(a, b, c, false, new THREE.Vector3());
    if (hit) { const d = hit.distanceTo(ray.ray.origin); if (d < bd) { bd = d; best = draw.owner[k / 3]; } }
  }
  return best;
}
function clickSelect(e) {
  const s = S.st, sel = s.sel, shift = e.shiftKey;
  const toggle = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); else arr.push(x); };
  if (e.altKey) {
    const pe = pickEdge(e); if (!pe) return;
    const loop = M.edgeLoop(s.mesh, pe.a, pe.b);
    if (!shift) { sel.v = []; sel.e = []; sel.f = []; }
    if (sel.mode === 'vert') for (const [a, b] of loop) { if (!sel.v.includes(a)) sel.v.push(a); if (!sel.v.includes(b)) sel.v.push(b); }
    else { if (sel.mode !== 'edge') sel.mode = 'edge'; for (const [a, b] of loop) { const k = M.ek(a, b); if (!sel.e.includes(k)) sel.e.push(k); } }
    changed(); return;
  }
  if (sel.mode === 'vert') { const v = pickVert(e); if (!shift) sel.v = v == null ? [] : [v]; else if (v != null) toggle(sel.v, v); }
  else if (sel.mode === 'edge') { const pe = pickEdge(e); const k = pe && M.ek(pe.a, pe.b); if (!shift) sel.e = k ? [k] : []; else if (k) toggle(sel.e, k); }
  else { const f = pickFace(e); if (!shift) sel.f = f == null ? [] : [f]; else if (f != null) toggle(sel.f, f); }
  changed();
}
function setMode(mode) {
  const s = S.st.sel;
  // convert the selection like Blender does
  const vs = new Set(selectedVerts());
  if (mode === 'vert') s.v = [...vs];
  if (mode === 'edge') s.e = draw.edges.filter(([a, b]) => vs.has(a) && vs.has(b)).map(([a, b]) => M.ek(a, b));
  if (mode === 'face') s.f = S.st.mesh.f.map((f, i) => [f, i]).filter(([f]) => f.every(v => vs.has(v))).map(([, i]) => i);
  if (mode !== 'vert') s.v = []; if (mode !== 'edge') s.e = []; if (mode !== 'face') s.f = [];
  s.mode = mode; changed();
}
function selectAll(on) {
  const s = S.st.sel, m = S.st.mesh;
  s.v = []; s.e = []; s.f = [];
  if (on) { if (s.mode === 'vert') s.v = [...new Set(m.f.flat())]; else if (s.mode === 'edge') s.e = M.edges(m).map(([a, b]) => M.ek(a, b)); else s.f = m.f.map((_, i) => i); }
  changed();
}

// ─── Operators ───────────────────────────────────────────────────────────────
function apply(newMesh, label, keepSel = false) {
  if (!newMesh) return false;
  pushUndo(); S.st.mesh = newMesh;
  if (!keepSel) S.st.sel = { mode: S.st.sel.mode, v: [], e: [], f: [] };
  S.lastOp = label; changed(); msg(label); return true;
}
const OPS = {
  connect() {
    const vs = S.st.sel.mode === 'vert' ? S.st.sel.v : selectedVerts();
    if (vs.length !== 2) return msg('Connect needs exactly two vertices of the same face.', true);
    const r = M.connect(S.st.mesh, vs[0], vs[1]);
    if (!r) return msg('These two vertices are not opposite corners of one face.', true);
    apply(r, 'Connect Vertex Path');
  },
  dissolveVerts() { const vs = selectedVerts(); if (!vs.length) return msg('Select the vertices to dissolve.', true); apply(M.dissolveVerts(S.st.mesh, vs), 'Dissolve Vertices'); },
  dissolveEdges() {
    const s = S.st.sel, keys = s.mode === 'edge' ? s.e : draw.edges.filter(([a, b]) => { const vs = new Set(selectedVerts()); return vs.has(a) && vs.has(b); }).map(([a, b]) => M.ek(a, b));
    if (!keys.length) return msg('Select the edges to dissolve.', true);
    apply(M.dissolveEdges(S.st.mesh, keys), 'Dissolve Edges');
  },
  trisToQuads() {
    const vs = new Set(selectedVerts()); if (!vs.size) return msg('Select the faces first (A selects everything).', true);
    const m = S.st.mesh, keep = m.f.map((f, i) => [f, i]).filter(([f]) => !f.every(v => vs.has(v)));
    const part = { v: m.v, f: m.f.filter(f => f.every(v => vs.has(v))), crease: m.crease };
    const done = M.trisToQuads(part);
    apply({ v: m.v.map(p => [...p]), f: [...keep.map(([f]) => f), ...done.f], crease: { ...m.crease } }, 'Tris to Quads');
  },
  fill() {
    const vs = selectedVerts(); if (vs.length < 3 || vs.length > 4) return msg('Fill needs 3 or 4 selected vertices.', true);
    apply(M.fill(S.st.mesh, vs, [0, 0, 0]), 'Fill');
  },
  crease() {
    const s = S.st.sel, keys = s.mode === 'edge' ? s.e : [];
    if (!keys.length) return msg('Switch to Edge select mode and select the edges to crease.', true);
    pushUndo(); for (const k of keys) { if (S.crease > 0) S.st.mesh.crease[k] = S.crease; else delete S.st.mesh.crease[k]; }
    S.lastOp = 'Edge Crease'; changed(); msg(tr('Edge Crease: {n} edges at {c}', { n: keys.length, c: S.crease }));
  },
  smooth() {
    const vs = selectedVerts(); if (!vs.length) return msg('Select the vertices to smooth.', true);
    const r = smoothVerts(S.st.mesh, vs, 0.5, 1);
    if (S.st.kind === 'stone' && S.st.snap) r.v = r.v.map((p, i) => vs.includes(i) ? snapToStone(p) : p);
    apply(r, 'Smooth Vertices', true);
  },
  loopCut() { startCut(); },
};
// (vertices are never renumbered, so selections and solutions stay valid)

// Loop Cut: hover an edge, the ring is previewed at the mouse position along the edge; click to cut.
function startCut() { cancelTool(); S.tool = { type: 'cut', preview: null, hit: null }; host.classList.add('cut'); showReadout('Loop Cut and Slide: hover an edge, move to slide, click to cut · Esc cancel'); }
function updateCut(e) {
  const pe = pickEdge(e); if (!pe) { S.tool.preview = null; S.tool.hit = null; build(); return; }
  const { ring } = M.edgeRing(S.st.mesh, pe.a, pe.b), m = S.st.mesh;
  const pts = ring.map(([p, q]) => M.V.lerp(m.v[p], m.v[q], pe.t));
  const segs = []; for (let i = 0; i < pts.length - 1; i++) segs.push(pts[i], pts[i + 1]);
  const { faces } = M.edgeRing(m, pe.a, pe.b);
  if (ring.length > 2 && faces.length === ring.length) segs.push(pts[pts.length - 1], pts[0]);   // a closed ring
  S.tool.preview = segs.length ? segs : [M.V.lerp(m.v[pe.a], m.v[pe.b], pe.t), M.V.lerp(m.v[pe.a], m.v[pe.b], pe.t)];
  S.tool.hit = pe; build();
}
function finishCut() {
  const h = S.tool.hit; cancelTool();
  if (!h) return;
  apply(M.loopCut(S.st.mesh, h.a, h.b, Math.max(0.02, Math.min(0.98, h.t))), 'Loop Cut and Slide');
}
// Move (G): the selected vertices follow the mouse on a plane facing the view; X, Y, Z lock an axis.
function startGrab() {
  const vs = selectedVerts(); if (!vs.length) return msg('Select something to move.', true);
  cancelTool();
  const m = S.st.mesh, c = M.V.mul(vs.reduce((s, i) => M.V.add(s, m.v[i]), [0, 0, 0]), 1 / vs.length);
  S.tool = { type: 'grab', vs, orig: vs.map(i => [...m.v[i]]), c, axis: null, start: null, before: JSON.stringify(S.st) };
  host.classList.add('grab'); showReadout('Move: move the mouse · X Y Z lock an axis · click or Enter to confirm · Esc cancel');
}
function planePoint(e, c) {
  const [mx, my] = mouseOf(e), r = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(mx / r.width * 2 - 1, -my / r.height * 2 + 1), camera);
  const n = new THREE.Vector3(); camera.getWorldDirection(n);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(...c)), p = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, p) ? [p.x, p.y, p.z] : null;
}
function updateGrab(e) {
  const T = S.tool, p = planePoint(e, T.c); if (!p) return;
  if (!T.start) { T.start = p; return; }
  let d = M.V.sub(p, T.start);
  if (T.axis != null) d = [0, 1, 2].map(k => k === T.axis ? d[k] : 0);
  const m = S.st.mesh;
  T.vs.forEach((i, k) => { let q = M.V.add(T.orig[k], d); if (S.st.snap && S.st.kind === 'stone') q = snapToStone(q); m.v[i] = q; });
  showReadout(`${T.axis != null ? `Along ${'XYZ'[T.axis]} ` : ''}D ${d.map(v => v.toFixed(3)).join(' ')}${S.st.snap && S.st.kind === 'stone' ? ' · Snap: Face Project' : ''}`);
  build(); renderStats();
}
function finishGrab() { const T = S.tool; cancelTool(false); S.undo.push(T.before); if (S.undo.length > 80) S.undo.shift(); S.redo = []; S.lastOp = 'Move'; changed(); }
function cancelTool(restore = true) {
  const T = S.tool; if (!T) return;
  if (restore && T.type === 'grab') { T.vs.forEach((i, k) => { S.st.mesh.v[i] = T.orig[k]; }); }
  S.tool = null; host.classList.remove('grab', 'cut'); $('#op-readout').hidden = true; build(); renderStats();
}
function showReadout(text) { const el = $('#op-readout'); el.hidden = false; el.textContent = t(text); }

// ─── Mouse and keys ──────────────────────────────────────────────────────────
canvas.addEventListener('pointerdown', e => {
  if (e.button === 2 && S.tool) { cancelTool(); e.preventDefault(); return; }
  if (e.button !== 0) return;
  if (S.tool?.type === 'cut') { finishCut(); return; }
  if (S.tool?.type === 'grab') { finishGrab(); return; }
  clickSelect(e);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointermove', e => {
  if (S.tool?.type === 'cut') updateCut(e);
  else if (S.tool?.type === 'grab') updateGrab(e);
});
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || !S.hover) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (S.tool) {
    if (k === 'escape') { cancelTool(); e.preventDefault(); }
    else if (k === 'enter' && S.tool.type === 'grab') { finishGrab(); e.preventDefault(); }
    else if (S.tool.type === 'grab' && 'xyz'.includes(k) && k.length === 1) { S.tool.axis = S.tool.axis === 'xyz'.indexOf(k) ? null : 'xyz'.indexOf(k); e.preventDefault(); }
    return;
  }
  if (ctrl && k === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); return; }
  if (ctrl && k === 'y') { redo(); e.preventDefault(); return; }
  if (ctrl && k === 'r') { startCut(); e.preventDefault(); return; }
  if (ctrl && ['0', '1', '2', '3'].includes(e.key)) { pushUndo(); S.st.subsurf.on = e.key !== '0'; if (e.key !== '0') S.st.subsurf.levels = +e.key; changed(); msg(e.key === '0' ? 'Subdivision Surface off' : tr('Subdivision Surface: level {n}', { n: +e.key })); e.preventDefault(); return; }
  if (ctrl) return;
  if (e.altKey && k === 'a') { selectAll(false); e.preventDefault(); return; }
  if (e.altKey && k === 'j') { OPS.trisToQuads(); e.preventDefault(); return; }
  if (e.shiftKey && k === 'e') { openCrease(); e.preventDefault(); return; }
  if (e.altKey) return;
  if (k === '1') setMode('vert'); else if (k === '2') setMode('edge'); else if (k === '3') setMode('face');
  else if (k === 'a') selectAll(true);
  else if (k === 'g') startGrab();
  else if (k === 'j') OPS.connect();
  else if (k === 'f') OPS.fill();
  else if (k === 'x' || k === 'delete') openDissolve();
  else return;
  e.preventDefault();
});
// Menus
const menu = $('#menu');
let lastMouse = [0, 0];
ws.addEventListener('pointermove', e => { const r = ws.getBoundingClientRect(); lastMouse = [e.clientX - r.left, e.clientY - r.top]; });
function openMenu(title, items) {
  menu.innerHTML = `<div class="menu-title" data-no-i18n>${esc(title)}</div>` + items.map(([id, label, key]) => `<button type="button" role="menuitem" data-op="${id}" data-no-i18n><span>${esc(label)}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('');
  menu.hidden = false; menu.style.left = `${Math.max(8, lastMouse[0] - 40)}px`; menu.style.top = `${Math.max(8, lastMouse[1] - 10)}px`;
}
function openDissolve() { openMenu('Delete', [['dissolveVerts', 'Dissolve Vertices'], ['dissolveEdges', 'Dissolve Edges']]); }
function openCrease() {
  const s = S.st.sel;
  if (s.mode !== 'edge' || !s.e.length) return msg('Switch to Edge select mode and select the edges to crease.', true);
  OPS.crease();
}
menu.addEventListener('click', e => { const b = e.target.closest('[data-op]'); if (!b) return; menu.hidden = true; OPS[b.dataset.op](); });
document.addEventListener('pointerdown', e => { if (!menu.hidden && !e.target.closest('#menu')) menu.hidden = true; });

// ─── Data, undo, persistence ─────────────────────────────────────────────────
const key = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(key(), S.st); }
function loadData() {
  const saved = store.get(key(), null);
  S.st = saved?.mesh?.v ? saved : startState(step());
  S.undo = []; S.redo = [];
}
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo'); }

// ─── Properties ──────────────────────────────────────────────────────────────
const row = (label, val, good) => `<div class="sb-stat${good == null ? '' : good ? ' good' : ' bad'}"><span>${esc(t(label))}</span><b>${val}</b></div>`;
function statsHtml() {
  const s = S.st, st = M.stats(s.mesh);
  let h = `<h4>${esc(t('Statistics'))}<small data-no-i18n>Viewport Overlays</small></h4>`;
  h += row('Vertices', st.verts) + row('Edges', st.edges) + row('Faces', st.faces);
  h += row('Quads', st.quads) + row('Triangles', st.tris, st.tris === 0) + row('N-gons', st.ngons, st.ngons === 0);
  h += row('Poles (3 edges)', st.poles3.length) + row('Poles (5+ edges)', st.poles5.length);
  if (s.kind === 'stone') h += row('Holes (open edges)', st.holes, st.holes === 0);
  if (s.kind === 'slab') { const l = cornerLoss(s.mesh, 2); h += row('Corner loss (level 2)', `${Math.round(l * 100)}%`, l <= 0.12); }
  if (s.kind === 'arm') { const a = armInfo(s.mesh), v = elbowVolume(s.mesh, 90, s.arm.preserve); h += row('Loops in the bend zone', a.inZone, a.inZone >= 3) + row('Largest gap in the zone', a.inZone > 1 ? `${a.gap.toFixed(2)} m` : '—', a.inZone > 1 && a.gap <= 0.3) + row('Joint volume at 90°', `${Math.round(v * 100)}%`, v >= 0.95); }
  if (s.kind === 'stone') { const e = maxSnapError(s.mesh), d = densityRatio(s.mesh); h += row('Largest distance to the surface', `${(e * 100).toFixed(1)} cm`, e <= 0.01) + row('Biggest / smallest quad', d.toFixed(1), d <= 4); }
  if (S.over.types) h += `<div class="face-key"><span><i style="background:#9a9a9a"></i>${esc(t('quad'))}</span><span><i style="background:#e6c24a"></i>${esc(t('triangle'))}</span><span><i style="background:#e0564a"></i>n-gon</span></div>`;
  return h;
}
function renderStats() { const el = $('#stats-panel'); if (el) el.innerHTML = statsHtml(); }
function renderProps() {
  const s = S.st;
  let h = `<div class="panel" id="stats-panel">${statsHtml()}</div>`;
  h += `<div class="panel"><h4>${esc(t('Tool'))}<small>${esc(t('or the keys'))}</small></h4><div class="tool-grid" data-no-i18n>
    <button type="button" data-tool="loopCut">Loop Cut <kbd>Ctrl R</kbd></button><button type="button" data-tool="connect">Connect <kbd>J</kbd></button>
    <button type="button" data-tool="dissolveVerts">Dissolve Vertices <kbd>X</kbd></button><button type="button" data-tool="dissolveEdges">Dissolve Edges <kbd>X</kbd></button>
    <button type="button" data-tool="fill">Fill <kbd>F</kbd></button><button type="button" data-tool="trisToQuads">Tris to Quads <kbd>Alt J</kbd></button>
    <button type="button" data-tool="smooth">Smooth Vertices</button><button type="button" data-tool="grab">Move <kbd>G</kbd></button></div>
    <label class="bl-row crease" data-no-i18n><span>Edge Crease</span><input type="number" id="crease-val" min="0" max="1" step="0.1" value="${S.crease}"><button type="button" class="mini-link" data-tool="crease">Shift E</button></label></div>`;
  h += `<div class="panel bl" data-no-i18n><h4>Modifiers<small>Properties › Modifiers</small></h4>
    <label class="bl-check"><input type="checkbox" data-mod="subsurf"${s.subsurf.on ? ' checked' : ''}>Subdivision Surface</label>
    <label class="bl-row"><span>Levels Viewport</span><input type="number" data-mod="levels" min="1" max="3" step="1" value="${s.subsurf.levels}"><em></em></label>
    ${s.kind === 'arm' ? `<div class="bl-sec">Armature</div>
    <label class="bl-row"><span>Bend (pose)</span><input type="range" data-mod="angle" min="0" max="120" step="1" value="${s.arm.angle}"><em>${s.arm.angle}°</em></label>
    <label class="bl-check"><input type="checkbox" data-mod="preserve"${s.arm.preserve ? ' checked' : ''}>Preserve Volume</label>` : ''}</div>`;
  $('#props').innerHTML = h;
}
$('#props').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (!b) return; const id = b.dataset.tool; if (id === 'grab') startGrab(); else if (id === 'crease') openCrease(); else OPS[id](); });
$('#props').addEventListener('input', e => {
  if (e.target.dataset.mod === 'angle') { S.st.arm.angle = +e.target.value; e.target.nextElementSibling.textContent = `${S.st.arm.angle}°`; build(); drawOverlay(); }
});
$('#props').addEventListener('change', e => {
  const d = e.target.dataset;
  if (e.target.id === 'crease-val') { S.crease = Math.max(0, Math.min(1, +e.target.value || 0)); return; }
  if (!d.mod) return;
  pushUndo();
  if (d.mod === 'subsurf') S.st.subsurf.on = e.target.checked;
  if (d.mod === 'levels') S.st.subsurf.levels = Math.max(1, Math.min(3, Math.round(+e.target.value || 1)));
  if (d.mod === 'angle') S.st.arm.angle = +e.target.value;
  if (d.mod === 'preserve') S.st.arm.preserve = e.target.checked;
  changed();
});
function drawOverlay() {
  const s = S.st, st = M.stats(s.mesh), sel = selectedVerts().length;
  const lines = ['User Perspective', `Verts ${sel}/${st.verts} · Faces ${st.faces} · Tris ${st.tris} · N-gons ${st.ngons}`];
  if (s.subsurf.on) lines.push(`Subdivision Surface · level ${s.subsurf.levels}`);
  if (s.kind === 'arm') lines.push(`Armature · ${s.arm.angle}°${s.arm.preserve ? ' · Preserve Volume' : ''}`);
  $('#view-overlay').innerHTML = lines.map(l => `<div data-no-i18n>${esc(l)}</div>`).join('');
  document.querySelectorAll('#sel-mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === s.sel.mode));
  $('#o-snap').checked = !!s.snap; $('#snap-toggle').hidden = s.kind !== 'stone';
}

// ─── Stages, guide, step card ────────────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; cancelTool(); saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const stepDone = i => i === S.step ? !!step().check(S.st) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide'); g.classList.toggle('three', st.steps.length === 3);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; cancelTool(); saveData(); S.step = +li.dataset.step; enterStep(); });
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { cancelTool(); pushUndo(); S.st = startState(step()); changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { cancelTool(); pushUndo(); step().solve(S.st); changed(); msg('This is one possible solution. Ctrl Z brings your mesh back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null;
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) setTimeout(() => msg(tr('✓ Step done: {s}', { s: t(step().title) })), 900);
  lastOk = ok;
}
function changed(save = true) {
  build(); if (save) saveData();
  checkProgress(); renderProps(); drawOverlay(); renderGuide(); renderStepCard();
}
function enterStep() {
  loadData(); lastOk = stepDone(S.step);
  frame(S.st.kind); renderStageSwitch(); changed(false);
}
function renderAll() { renderStageSwitch(); renderProps(); drawOverlay(); renderGuide(); renderStepCard(); translateTitles(); }
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }

// Header
$('#sel-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
$('#o-types').onchange = e => { S.over.types = e.target.checked; build(); renderStats(); };
$('#o-poles').onchange = e => { S.over.poles = e.target.checked; build(); };
$('#o-snap').onchange = e => { pushUndo(); S.st.snap = e.target.checked; changed(); };

// ─── Start ───────────────────────────────────────────────────────────────────
function resize() { const r = host.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); dirty = true; }
new ResizeObserver(resize).observe(host);
function loop() { if (dirty) { dirty = false; renderer.render(scene, camera); } requestAnimationFrame(loop); }
onLangChange(() => renderAll());
enterStep(); resize(); translateTitles(); requestAnimationFrame(loop);
window.__topo = { S, screenOf: p => { const [x, y] = screenOf(p), r = canvas.getBoundingClientRect(); return [r.left + x, r.top + y]; } }; // for tests and curious students
