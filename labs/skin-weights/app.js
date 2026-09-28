// Skin Weights Lab: weight painting on a posable arm with a Blender-style Weight Paint workspace.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import * as SW from './weights.js?v=1';
import { STAGES } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-skin:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-skin:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const RIGS = {};
const rigOf = kind => (RIGS[kind] ??= SW.makeRig(kind));

const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), rig: null, d: null, active: 0, pose: [],
  tool: 'draw', brush: { blend: 'mix', weight: 1, radius: 50, strength: 0.5, autoNormalize: false, xMirror: false, front: true, ...store.get('brush', {}) },
  zero: 'none', wire: true, restPosition: false,
  undo: [], redo: [], flags: null, focus: null, hover: false,
  painting: false, lastDab: null, modal: null, pointer: null, cursorVertex: -1, lastOp: null,
};
S.brush.radius = Math.max(8, Math.min(200, S.brush.radius));
const stage = () => STAGES[S.stageIndex];

// ─── Data, undo and persistence ─────────────────────────────────────────────
const snapshot = () => ({ w: S.d.weights.map(g => new Float32Array(g)), parented: S.d.parented });
function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
function restoreSnap(s) { S.d.weights = s.w.map(g => new Float32Array(g)); S.d.parented = s.parented; S.lastOp = null; weightsChanged(true); }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(snapshot()); restoreSnap(S.undo.pop()); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restoreSnap(S.redo.pop()); msg('Redo'); }
let saveTimer;
function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(`data-${stage().id}`, { w: S.d.weights.map(g => Array.from(g, v => Math.round(v * 10000) / 10000)), parented: S.d.parented, pose: S.pose, count: S.rig.count }), 250);
}
function loadData() {
  const st = stage(); S.rig = rigOf(st.rig);
  const saved = store.get(`data-${st.id}`, null);
  if (saved && saved.count === S.rig.count && saved.w?.length === S.rig.bones.length) {
    S.d = { weights: saved.w.map(a => Float32Array.from(a)), parented: !!saved.parented };
    S.pose = saved.pose?.length === S.rig.bones.length ? saved.pose : startPose();
  } else { S.d = st.start(S.rig); S.pose = startPose(); }
  S.undo = []; S.redo = []; S.lastOp = null;
}
const startPose = () => S.rig.bones.map((_, i) => ({ bend: stage().pose?.[i]?.bend ?? 0, twist: stage().pose?.[i]?.twist ?? 0 }));
const boneIndex = name => S.rig.bones.findIndex(b => b.name === name);

// ─── Status bar ──────────────────────────────────────────────────────────────
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg');
  el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 5000);
}

// ─── Three.js scene ──────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
scene.add(camera);
scene.add(new THREE.AmbientLight(0xffffff, 1.35));
const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(0.4, 0.6, 1); camera.add(key);
const grid = new THREE.GridHelper(20, 20, 0x5a5a5a, 0x484848); grid.position.y = -1.6; scene.add(grid);
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
controls.enableDamping = false; controls.zoomSpeed = 1.2;
controls.addEventListener('change', () => { requestRender(); });
controls.addEventListener('start', () => host.classList.add('orbiting'));
controls.addEventListener('end', () => host.classList.remove('orbiting'));
// Emulate 3 Button Mouse: Alt + LMB orbits (Shift + Alt + LMB pans), as in Blender's preferences.
host.addEventListener('pointerdown', e => { controls.mouseButtons.LEFT = e.button === 0 && e.altKey ? THREE.MOUSE.ROTATE : null; }, true);

let mesh, wire, geo, boneGroup;
const colorAttr = () => geo.attributes.color;
function buildMesh() {
  if (mesh) { scene.remove(mesh, wire); geo.dispose(); }
  const rig = S.rig;
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rig.rest), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(rig.count * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(rig.indices, 1));
  mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.16, depthWrite: false }));
  wire.renderOrder = 1;
  scene.add(mesh, wire);
  buildBones();
}
// Octahedral bones, drawn In Front like Blender's armature display option.
const octa = (() => {
  const w = 0.09, p = [[0, 0, 0], [w, 0.12, w], [w, 0.12, -w], [-w, 0.12, -w], [-w, 0.12, w], [0, 1, 0]];
  const f = [[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 1, 4], [5, 1, 2], [5, 2, 3], [5, 3, 4], [5, 4, 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(f.flat().flatMap(i => p[i])), 3));
  g.computeVertexNormals();
  return g;
})();
const octaEdges = new THREE.EdgesGeometry(octa);
function buildBones() {
  if (boneGroup) scene.remove(boneGroup);
  boneGroup = new THREE.Group();
  S.rig.bones.forEach(() => {
    const m = new THREE.Mesh(octa, new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.55, depthTest: false }));
    const e = new THREE.LineSegments(octaEdges, new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.9 }));
    m.renderOrder = 10; e.renderOrder = 11; m.add(e);
    boneGroup.add(m);
  });
  scene.add(boneGroup);
}

const shownPose = () => (S.restPosition ? SW.restPose(S.rig) : S.pose);
function updateDeform() {
  SW.deform(S.rig, S.d.weights, shownPose(), geo.attributes.position.array);
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const bp = SW.bonePose(S.rig, shownPose()), up = new THREE.Vector3(0, 1, 0);
  bp.forEach((b, i) => {
    const m = boneGroup.children[i], h = new THREE.Vector3(...b.head), dir = new THREE.Vector3(...b.tail).sub(h), l = dir.length();
    m.position.copy(h); m.quaternion.setFromUnitVectors(up, dir.normalize()); m.scale.setScalar(l);
    m.material.color.set(i === S.active ? 0x7fb2ff : 0x9a9a9a);
    m.material.opacity = i === S.active ? 0.8 : 0.5;
  });
  requestRender();
}
// Blender's weight ramp: blue 0 · cyan · green 0.5 · yellow · red 1.
const RAMP = [[0, 0, 1], [0, 1, 1], [0, 1, 0], [1, 1, 0], [1, 0, 0]];
export function weightRGB(w) {
  const x = Math.max(0, Math.min(1, w)) * 4, i = Math.min(3, Math.floor(x)), f = x - i, a = RAMP[i], b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const toLinear = c => Math.pow(c, 2.2);
const cssColor = w => `rgb(${weightRGB(w).map(c => Math.round(c * 255)).join(',')})`;
function updateColors() {
  const c = colorAttr().array, W = S.d.weights, g = W[S.active];
  for (let i = 0; i < S.rig.count; i++) {
    const w = g[i];
    let rgb;
    if ((S.zero === 'active' && w <= 1e-4) || (S.zero === 'all' && SW.total(W, i) <= 1e-4)) rgb = [0, 0, 0];
    else rgb = weightRGB(w);
    c[i * 3] = toLinear(rgb[0]); c[i * 3 + 1] = toLinear(rgb[1]); c[i * 3 + 2] = toLinear(rgb[2]);
  }
  colorAttr().needsUpdate = true;
  requestRender();
}
let renderQueued = false;
function requestRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderer.render(scene, camera); drawOverlay(); }); }
function resize() {
  const r = host.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  requestRender();
}
function frameAll(view = null) {
  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(S.rig.rest, 3));
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const dist = size / (2 * Math.tan(camera.fov * Math.PI / 360)) * (camera.aspect < 1.2 ? 1.25 : view ? 0.95 : 0.8);
  const dir = { front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001] }[view] ?? [0.18, 0.3, 1];
  const d = new THREE.Vector3(...dir).normalize().multiplyScalar(dist);
  controls.target.copy(c); camera.position.copy(c).add(d); camera.up.set(0, 1, 0); camera.lookAt(c); controls.update();
  requestRender();
}

// ─── Screen projection, brush and picking ───────────────────────────────────
const tmp = new THREE.Vector3();
function screenOf(x, y, z) {
  const r = canvas.getBoundingClientRect();
  tmp.set(x, y, z).project(camera);
  return [(tmp.x + 1) / 2 * r.width, (1 - tmp.y) / 2 * r.height, tmp.z];
}
function frontFacing(i) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array;
  return (camera.position.x - p[i * 3]) * n[i * 3] + (camera.position.y - p[i * 3 + 1]) * n[i * 3 + 1] + (camera.position.z - p[i * 3 + 2]) * n[i * 3 + 2] > 0;
}
function projected() {
  const p = geo.attributes.position.array, out = new Float32Array(S.rig.count * 3);
  for (let i = 0; i < S.rig.count; i++) { const s = screenOf(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); out[i * 3] = s[0]; out[i * 3 + 1] = s[1]; out[i * 3 + 2] = s[2]; }
  return out;
}
// Vertices inside the brush circle, with a smooth falloff.
function brushHits(x, y) {
  const P = projected(), R = S.brush.radius, hits = [];
  for (let i = 0; i < S.rig.count; i++) {
    const d = Math.hypot(P[i * 3] - x, P[i * 3 + 1] - y);
    if (d > R) continue;
    if (S.brush.front && !frontFacing(i)) continue;
    const q = d / R;
    hits.push({ index: i, falloff: 1 - q * q * (3 - 2 * q) });
  }
  return hits;
}
function vertexAt(x, y) {
  const P = projected();
  let best = -1, bd = 26;
  for (let i = 0; i < S.rig.count; i++) {
    if (!frontFacing(i)) continue;
    const d = Math.hypot(P[i * 3] - x, P[i * 3 + 1] - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function boneAt(x, y) {
  const bp = SW.bonePose(S.rig, shownPose());
  let best = -1, bd = 14;
  bp.forEach((b, i) => {
    const a = screenOf(...b.head), c = screenOf(...b.tail);
    const vx = c[0] - a[0], vy = c[1] - a[1], L = vx * vx + vy * vy || 1;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / L));
    const d = Math.hypot(a[0] + vx * u - x, a[1] + vy * u - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function dab(x, y) {
  const hits = brushHits(x, y);
  if (!hits.length) return;
  const b = S.brush;
  SW.stroke(S.rig, S.d.weights, hits, { tool: S.tool, blend: b.blend, weight: b.weight, strength: b.strength, active: S.active, autoNormalize: b.autoNormalize, xMirror: b.xMirror });
  S.lastDab = { x, y };
  weightsChanged(false);
}
function localXY(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

canvas.addEventListener('pointerdown', e => {
  const { x, y } = localXY(e);
  closeMenu();
  if (S.modal) { if (e.button === 0) confirmModal(); else cancelModal(); e.preventDefault(); return; }
  if (e.button !== 0 || e.altKey) return;
  if (e.ctrlKey || e.metaKey) {
    const b = boneAt(x, y);
    if (b >= 0) setActive(b, true); else msg('Ctrl-click a bone to make its vertex group active.');
    return;
  }
  if (S.tool === 'sample') {
    const v = vertexAt(x, y);
    if (v < 0) return msg('Click on the mesh to sample its weight.');
    S.brush.weight = Math.round(S.d.weights[S.active][v] * 100) / 100; syncBrush();
    msg(tr('Weight sampled: {w}', { w: S.brush.weight.toFixed(2) }));
    return;
  }
  pushUndo(); S.lastOp = null; renderLastOp();
  S.painting = true; canvas.setPointerCapture(e.pointerId);
  dab(x, y);
});
canvas.addEventListener('pointermove', e => {
  const { x, y } = localXY(e);
  S.pointer = { x, y, cx: e.clientX, cy: e.clientY };
  if (S.modal) { updateModal(x); return; }
  if (S.painting) {
    const step = Math.max(2, S.brush.radius * 0.2);
    if (!S.lastDab || Math.hypot(x - S.lastDab.x, y - S.lastDab.y) >= step) dab(x, y);
  }
  placeRing(x, y);
  scheduleCursor();
});
function endStroke() { if (!S.painting) return; S.painting = false; S.lastDab = null; weightsChanged(true); }
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('pointerleave', () => { if (!S.modal) $('#brush-ring').hidden = true; S.cursorVertex = -1; renderCursorPanel(); });

function placeRing(x, y) {
  const ring = $('#brush-ring');
  const hide = host.classList.contains('orbiting');
  ring.hidden = hide;
  ring.style.left = x + 'px'; ring.style.top = y + 'px';
  ring.style.width = ring.style.height = S.brush.radius * 2 + 'px';
  ring.style.setProperty('--inner', Math.round(S.brush.strength * 100) + '%');
  ring.classList.toggle('sample', S.tool === 'sample');
}
let cursorQueued = false;
function scheduleCursor() {
  if (cursorQueued) return; cursorQueued = true;
  requestAnimationFrame(() => { cursorQueued = false; if (!S.pointer) return; const v = vertexAt(S.pointer.x, S.pointer.y); if (v !== S.cursorVertex || S.painting) { S.cursorVertex = v; renderCursorPanel(); } });
}

// ─── Modal operators: R rotate, F radius, Shift F strength ──────────────────
function startModal(kind) {
  if (!S.pointer) S.pointer = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  const m = { kind, x0: S.pointer.x, y0: S.pointer.y };
  if (kind === 'rotate') { m.bone = S.active; m.start = S.pose[S.active].bend; }
  if (kind === 'radius') m.start = S.brush.radius;
  if (kind === 'strength') m.start = S.brush.strength;
  S.modal = m;
  msg(kind === 'rotate' ? 'Rotate: move the mouse, click to confirm, Esc to cancel.' : kind === 'radius' ? 'Radius: move the mouse, click to confirm, Esc to cancel.' : 'Strength: move the mouse, click to confirm, Esc to cancel.');
  if (kind !== 'rotate') placeRing(m.x0, m.y0);
}
function updateModal(x) {
  const m = S.modal, dx = x - m.x0;
  if (m.kind === 'rotate') { S.pose[m.bone].bend = Math.round(Math.max(-150, Math.min(150, m.start + dx * 0.6))); poseChanged(); }
  if (m.kind === 'radius') { S.brush.radius = Math.round(Math.max(8, Math.min(200, m.start + dx))); syncBrush(); placeRing(m.x0, m.y0); }
  if (m.kind === 'strength') { S.brush.strength = Math.round(Math.max(0, Math.min(1, m.start + dx / 200)) * 100) / 100; syncBrush(); placeRing(m.x0, m.y0); }
}
function confirmModal() { const m = S.modal; S.modal = null; if (m?.kind === 'rotate') poseChanged(true); msg('Done'); }
function cancelModal() {
  const m = S.modal; S.modal = null; if (!m) return;
  if (m.kind === 'rotate') { S.pose[m.bone].bend = m.start; poseChanged(true); }
  if (m.kind === 'radius') S.brush.radius = m.start;
  if (m.kind === 'strength') S.brush.strength = m.start;
  syncBrush(); msg('Cancelled');
}

// ─── Operators (Weights and Parent menus) with Adjust Last Operation ────────
const OPS = {
  auto: { label: 'Assign Automatic from Bones', params: {}, run: W => { const A = SW.automaticWeights(S.rig); A.forEach((g, i) => W[i].set(g)); S.d.parented = true; } },
  parentAuto: { label: 'Parent › With Automatic Weights', params: {}, run: W => { const A = SW.automaticWeights(S.rig); A.forEach((g, i) => W[i].set(g)); S.d.parented = true; } },
  parentEmpty: { label: 'Parent › With Empty Groups', params: {}, run: W => { W.forEach(g => g.fill(0)); S.d.parented = true; } },
  normalizeAll: { label: 'Normalize All', params: {}, run: W => SW.normalizeAll(W, S.rig) },
  mirror: { label: 'Mirror', params: {}, note: 'The lab copies the active group onto the other side, into the group with the opposite name. In Blender: select the vertices of the good side (vertex selection masking) and use Mirror with Flip Group Names.', run: W => { const n = SW.mirrorWeights(W, S.rig, S.active); if (!n) msg('This group has no mirror: the names must end in .L or .R, or the mesh must be symmetrical.', true); } },
  smooth: { label: 'Smooth', params: { subset: 'active', factor: 0.5, repeat: 1 }, run: (W, p) => SW.smooth(W, S.rig, { groups: p.subset === 'active' ? [S.active] : null, factor: p.factor, repeat: p.repeat }) },
  clean: { label: 'Clean', params: { subset: 'all', limit: 0.01 }, run: (W, p) => { for (let g = 0; g < W.length; g++) if (p.subset === 'all' || g === S.active) for (let i = 0; i < S.rig.count; i++) if (W[g][i] > 0 && W[g][i] < p.limit) W[g][i] = 0; } },
  limitTotal: { label: 'Limit Total', params: { maxInf: 4 }, run: (W, p) => SW.limitTotal(W, S.rig, p.maxInf) },
};
const PARAM_UI = {
  subset: { label: 'Subset', options: [['active', 'Active Group'], ['all', 'All Groups']] },
  factor: { label: 'Factor', min: 0, max: 1, step: 0.05 },
  repeat: { label: 'Iterations', min: 1, max: 50, step: 1 },
  limit: { label: 'Limit', min: 0, max: 1, step: 0.01 },
  maxInf: { label: 'Limit', min: 1, max: 8, step: 1 },
};
function runOp(id) {
  const op = OPS[id];
  pushUndo();
  const before = snapshot();
  S.lastOp = { id, params: { ...op.params }, before, active: S.active };
  op.run(S.d.weights, S.lastOp.params);
  weightsChanged(true); renderLastOp();
  msg(t(op.label));
}
function rerunLastOp() {
  const L = S.lastOp; if (!L) return;
  S.d.weights = L.before.w.map(g => new Float32Array(g)); S.d.parented = L.before.parented;
  const act = S.active; S.active = L.active;
  OPS[L.id].run(S.d.weights, L.params);
  S.active = act;
  weightsChanged(true);
}
function renderLastOp() {
  const box = $('#last-op'), L = S.lastOp;
  if (!L) { box.hidden = true; return; }
  const op = OPS[L.id];
  const fields = Object.entries(L.params).map(([k, v]) => {
    const u = PARAM_UI[k];
    if (u.options) return `<label>${esc(t(u.label))}<select data-param="${k}">${u.options.map(([val, lab]) => `<option value="${val}"${val === v ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select></label>`;
    return `<label>${esc(t(u.label))}<input type="number" data-param="${k}" min="${u.min}" max="${u.max}" step="${u.step}" value="${v}"></label>`;
  }).join('');
  box.innerHTML = `<h5>${esc(t(op.label))}</h5>${fields}${op.note ? `<p class="sb-empty">${esc(t(op.note))}</p>` : ''}`;
  box.hidden = false;
}
$('#last-op').addEventListener('change', e => {
  const k = e.target.dataset.param; if (!k || !S.lastOp) return;
  const u = PARAM_UI[k];
  S.lastOp.params[k] = u.options ? e.target.value : Math.max(u.min, Math.min(u.max, +e.target.value || 0));
  rerunLastOp();
});
$('#last-op').addEventListener('pointerdown', e => e.stopPropagation());

// ─── Menus ──────────────────────────────────────────────────────────────────
const menuEl = $('#menu');
function menuItems(kind) {
  switch (kind) {
    case 'view': return { title: 'View', items: [
      { label: 'Frame All', key: 'Home', act: () => frameAll() },
      { label: 'Front', key: 'Numpad 1', act: () => frameAll('front') },
      { label: 'Right', key: 'Numpad 3', act: () => frameAll('right') },
      { label: 'Top', key: 'Numpad 7', act: () => frameAll('top') },
    ] };
    case 'weights': return { title: 'Weights', items: [
      { label: 'Assign Automatic from Bones', act: () => runOp('auto') }, { hr: true },
      { label: 'Normalize All', act: () => runOp('normalizeAll') },
      { label: 'Mirror', act: () => runOp('mirror') },
      { label: 'Clean', act: () => runOp('clean') },
      { label: 'Limit Total', act: () => runOp('limitTotal') },
      { label: 'Smooth', act: () => runOp('smooth') }, { hr: true },
      { label: 'Undo', key: 'Ctrl Z', act: undo },
    ] };
    case 'parent': return { title: 'Set Parent To', items: [
      { label: 'With Empty Groups', act: () => runOp('parentEmpty') },
      { label: 'With Automatic Weights', act: () => runOp('parentAuto') },
    ] };
  }
}
function openMenu(kind, x, y) {
  const m = menuItems(kind);
  menuEl.innerHTML = `<div class="menu-title">${esc(t(m.title))}</div>` + m.items.map((it, i) => it.hr ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}"><span class="m-label">${esc(t(it.label))}</span>${it.key ? `<span class="m-key">${esc(it.key)}</span>` : ''}</button>`).join('');
  menuEl.hidden = false;
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  menuEl.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  menuEl.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = m.items[+b.dataset.i]; closeMenu(); it.act(); };
  menuEl.querySelector('button')?.focus();
}
function closeMenu() { menuEl.hidden = true; document.querySelectorAll('.menu-button[aria-expanded]').forEach(b => b.removeAttribute('aria-expanded')); }
document.querySelectorAll('.menu-button[data-menu]').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation(); const r = b.getBoundingClientRect(); openMenu(b.dataset.menu, r.left, r.bottom + 2); b.setAttribute('aria-expanded', 'true');
}));
document.addEventListener('pointerdown', e => { if (!menuEl.hidden && !menuEl.contains(e.target) && !e.target.closest('.menu-button')) closeMenu(); });

// ─── Tool header, toolbar and overlays ──────────────────────────────────────
function syncBrush() {
  const b = S.brush;
  $('#b-blend').value = b.blend; $('#b-weight').value = b.weight; $('#b-radius').value = b.radius; $('#b-strength').value = b.strength;
  $('#v-weight').textContent = (+b.weight).toFixed(2); $('#v-radius').textContent = b.radius + ' px'; $('#v-strength').textContent = (+b.strength).toFixed(2);
  $('#b-norm').checked = b.autoNormalize; $('#b-mirror').checked = b.xMirror; $('#b-front').checked = b.front;
  $('#b-blend').disabled = S.tool !== 'draw'; $('#b-weight').disabled = S.tool !== 'draw';
  document.querySelectorAll('#toolbar [data-tool]').forEach(btn => btn.setAttribute('aria-pressed', btn.dataset.tool === S.tool));
  store.set('brush', b);
}
$('#tool-header').addEventListener('input', e => {
  const b = S.brush, id = e.target.id;
  if (id === 'b-blend') b.blend = e.target.value;
  if (id === 'b-weight') b.weight = +e.target.value;
  if (id === 'b-radius') b.radius = +e.target.value;
  if (id === 'b-strength') b.strength = +e.target.value;
  if (id === 'b-norm') { b.autoNormalize = e.target.checked; msg(b.autoNormalize ? 'Auto Normalize on: painting one group lowers the others, so every vertex adds up to 1.' : 'Auto Normalize off.'); }
  if (id === 'b-mirror') { b.xMirror = e.target.checked; msg(b.xMirror ? 'X-Mirror on: each stroke is repeated on the other side, in the .L / .R group with the opposite name.' : 'X-Mirror off.'); }
  if (id === 'b-front') b.front = e.target.checked;
  syncBrush();
});
$('#toolbar').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (!b) return; S.tool = b.dataset.tool; syncBrush(); msg(tr('Tool: {t}', { t: t(b.title) })); });
$('#o-zero').onchange = e => { S.zero = e.target.value; updateColors(); };
$('#o-wire').onchange = e => { S.wire = e.target.checked; wire.visible = S.wire; requestRender(); };
$('#o-rest').onchange = e => { S.restPosition = e.target.checked; updateDeform(); drawOverlay(); msg(S.restPosition ? 'Rest Position: the armature shows the rest pose, but keeps the pose values.' : 'Pose Position.'); };

function drawOverlay() {
  const name = S.rig.bones[S.active].name;
  $('#view-overlay').innerHTML = `<div>${esc(t('User Perspective'))}</div><div data-no-i18n>(1) ${esc(S.rig.name)} › <b>${esc(name)}</b></div>${S.restPosition ? `<div>${esc(t('Rest Position'))}</div>` : ''}${!S.d.parented ? `<div>${esc(t('Not parented yet'))}</div>` : ''}`;
}

// ─── Properties: vertex groups, pose, under the cursor, checks ─────────────
function setActive(i, explicit = false) {
  S.active = i;
  if (explicit) S.flags.seen.add(S.rig.bones[i].name);
  updateColors(); updateDeform(); renderProps(); drawOverlay(); checkProgress(); renderGuide(); renderStepCard();
}
function renderProps() {
  const W = S.d.weights, rig = S.rig, cv = S.cursorVertex;
  let html = `<div class="panel"><h4>${esc(t('Vertex Groups'))}<small>${esc(t('Ctrl-click a bone'))}</small></h4><div class="vg-list" role="listbox">`;
  html += rig.bones.map((b, i) => `<div class="vg${i === S.active ? ' active' : ''}" data-vg="${i}" role="option" aria-selected="${i === S.active}"><span class="vg-icon"></span><span class="vg-name" data-no-i18n>${esc(b.name)}</span></div>`).join('');
  html += `</div></div>`;
  html += `<div class="panel pose-panel"><h4>${esc(t('Pose'))}<small>${esc(t('degrees'))}</small></h4>`;
  html += rig.bones.map((b, i) => i === S.active ? `<div class="pose-bone active"><div class="pose-name" data-no-i18n>${esc(b.name)}</div>
    <label class="pose-row"><span>${esc(t('Bend'))}</span><input type="range" min="-150" max="150" step="1" data-pose="bend" data-bone="${i}" value="${S.pose[i].bend}"><output>${S.pose[i].bend}°</output></label>
    <label class="pose-row"><span>${esc(t('Twist'))}</span><input type="range" min="-180" max="180" step="1" data-pose="twist" data-bone="${i}" value="${S.pose[i].twist}"><output>${S.pose[i].twist}°</output></label></div>`
    : `<button type="button" class="pose-bone compact" data-vg="${i}" title="${esc(t('Click to make it the active bone'))}"><span class="pose-name" data-no-i18n>${esc(b.name)}</span><span class="pose-vals">${esc(t('Bend'))} ${S.pose[i].bend}° · ${esc(t('Twist'))} ${S.pose[i].twist}°</span></button>`).join('');
  html += `<div class="row-buttons"><button type="button" id="clear-pose">${esc(t('Clear Pose'))} · Alt R</button></div></div>`;
  html += `<div class="panel cursor-weights" id="cursor-panel"></div>`;
  const s = SW.stats(W, rig), mirrored = rig.bones.some(b => b.name.endsWith('.L'));
  const row = (label, val, good) => `<div class="sb-stat ${good ? 'good' : 'bad'}"><span>${esc(t(label))}</span><b>${val}</b></div>`;
  html += `<div class="panel"><h4>${esc(t('Checks'))}</h4>`;
  html += row('Zero weights', s.zero, s.zero === 0);
  html += row('Not normalized', s.notNormalized, s.notNormalized === 0);
  html += row('Max influences', s.maxInfluences, s.maxInfluences <= 4 && s.maxInfluences > 0);
  html += row('Tiny weights', s.tiny, s.tiny === 0);
  if (mirrored) { const e = SW.symmetryError(W, rig); html += row('Symmetry error', e.toFixed(2), e < 0.08); }
  html += `<p class="sb-empty">${esc(t('Tiny = below 0.05. Zero = the vertex has no weight in any group.'))}</p></div>`;
  $('#props').innerHTML = html;
  renderCursorPanel();
}
function renderCursorPanel() {
  const box = $('#cursor-panel'); if (!box) return;
  const i = S.cursorVertex, W = S.d.weights;
  let html = `<h4>${esc(t('Under the cursor'))}${i >= 0 ? `<small data-no-i18n>#${i}</small>` : ''}</h4>`;
  if (i < 0) html += `<p class="sb-empty">${esc(t('Hover the mesh to read the weights of a vertex.'))}</p>`;
  else {
    html += S.rig.bones.map((b, g) => `<div class="sb-stat"><span><i style="background:${cssColor(W[g][i])}"></i><span data-no-i18n>${esc(b.name)}</span></span><b>${W[g][i].toFixed(2)}</b></div>`).join('');
    const tot = SW.total(W, i), ok = Math.abs(tot - 1) <= 0.01;
    html += `<div class="sb-stat ${ok ? 'good' : 'bad'}"><span>${esc(t('Total'))}</span><b>${tot.toFixed(2)}</b></div>`;
  }
  box.innerHTML = html;
}
$('#props').addEventListener('click', e => {
  const vg = e.target.closest('[data-vg]'); if (vg) { setActive(+vg.dataset.vg, true); return; }
  if (e.target.closest('#clear-pose')) clearPose();
});
$('#props').addEventListener('input', e => {
  const k = e.target.dataset.pose; if (!k) return;
  const i = +e.target.dataset.bone;
  S.pose[i][k] = +e.target.value;
  e.target.nextElementSibling.textContent = S.pose[i][k] + '°';
  poseChanged(false, true);
});
$('#props').addEventListener('change', e => { if (e.target.dataset.pose) poseChanged(true); });
function clearPose() { S.pose.forEach(p => { p.bend = 0; p.twist = 0; }); poseChanged(true); msg('Pose cleared: back to the rest pose.'); }

// ─── Updates ────────────────────────────────────────────────────────────────
function updateFlags() {
  const f = S.flags;
  for (const p of S.pose) { f.maxBend = Math.max(f.maxBend, Math.abs(p.bend)); f.maxTwist = Math.max(f.maxTwist, Math.abs(p.twist)); }
  if (f.maxTwist >= 120 && S.pose.every(p => !p.bend && !p.twist)) f.resetAfterTwist = true;
}
function poseChanged(commit = false, fromSlider = false) {
  updateFlags(); updateDeform();
  if (!fromSlider && !commit) return;
  if (commit) { saveData(); if (!fromSlider) renderProps(); checkProgress(); renderGuide(); renderStepCard(); }
}
function weightsChanged(commit) {
  updateDeform(); updateColors();
  if (commit) { saveData(); renderProps(); checkProgress(); renderGuide(); renderStepCard(); drawOverlay(); }
  else renderCursorPanel();
}

// ─── Stages, guide and step card ────────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-stage]'); if (!b) return;
  saveNow(); S.stageIndex = +b.dataset.stage; store.set('stage', S.stageIndex); enterStage();
});
function saveNow() { clearTimeout(saveTimer); store.set(`data-${stage().id}`, { w: S.d.weights.map(g => Array.from(g, v => Math.round(v * 10000) / 10000)), parented: S.d.parented, pose: S.pose, count: S.rig.count }); }
const stepDone = i => !!stage().steps[i].check(S.d, S.rig, S.flags);
function currentStep() {
  const st = stage(), i = st.steps.findIndex((_, j) => !stepDone(j));
  return S.focus != null ? S.focus : (i < 0 ? st.steps.length - 1 : i);
}
function renderGuide() {
  const st = stage(), cur = currentStep(), g = $('#guide');
  g.classList.toggle('three', st.steps.length === 3); g.classList.toggle('two', st.steps.length === 2);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === cur ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === cur ? 'Now' : 'Next'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; S.focus = +li.dataset.step; renderGuide(); renderStepCard(); });
function renderStepCard() {
  const st = stage(), i = currentStep(), s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-stage">${esc(t('Reset stage'))}</button></div>`;
}
// Steps that are about looking and posing get a demo instead of a data solution.
const DEMOS = {
  a2: () => { const f = boneIndex('Forearm'); S.active = f; S.flags.seen.add('Forearm'); S.pose[f].bend = 70; },
  a3: () => { S.flags.maxTwist = Math.max(S.flags.maxTwist, 130); S.pose.forEach(p => { p.bend = 0; p.twist = 0; }); S.flags.resetAfterTwist = true; },
};
$('#step-card').addEventListener('click', e => {
  const st = stage();
  if (e.target.id === 'reset-stage') {
    pushUndo(); const fresh = st.start(S.rig); S.d.weights = fresh.weights; S.d.parented = fresh.parented; S.pose = startPose(); S.focus = null; S.lastOp = null; renderLastOp();
    weightsChanged(true); poseChanged(true); renderProps(); msg('Back to the start. Ctrl Z undoes it.');
  }
  if (e.target.id === 'show-solution') {
    pushUndo();
    const i = currentStep(), d = st.start(S.rig);
    for (let j = 0; j <= i; j++) { st.steps[j].solve?.(d, S.rig); DEMOS[st.steps[j].id]?.(); }
    S.d.weights = d.weights; S.d.parented = d.parented; S.lastOp = null; renderLastOp();
    weightsChanged(true); poseChanged(true); renderProps();
    msg('This is one possible solution. Ctrl Z brings your weights back.');
  }
  if (e.target.id === 'next-step') { S.focus = null; renderGuide(); renderStepCard(); }
  if (e.target.id === 'next-stage') { saveNow(); S.stageIndex++; store.set('stage', S.stageIndex); enterStage(); }
});
let lastDone = null;
function checkProgress() {
  const st = stage(), states = st.steps.map((_, i) => stepDone(i));
  if (lastDone) states.forEach((d, i) => { if (d && !lastDone[i]) msg(tr('✓ Step done: {s}', { s: t(st.steps[i].title) })); });
  lastDone = states;
  const done = store.get('done', {}); done[st.id] = states.filter(Boolean).length; store.set('done', done);
}
function enterStage() {
  S.focus = null; lastDone = null; S.flags = { seen: new Set(), maxBend: 0, maxTwist: 0, resetAfterTwist: false };
  loadData();
  S.active = 0; S.cursorVertex = -1; S.modal = null;
  buildMesh(); wire.visible = S.wire;
  updateFlags(); updateDeform(); updateColors(); frameAll();
  renderStageSwitch(); renderProps(); renderGuide(); renderStepCard(); renderLastOp(); drawOverlay(); syncBrush();
  checkProgress();
}
function renderAll() { renderStageSwitch(); renderProps(); renderGuide(); renderStepCard(); renderLastOp(); drawOverlay(); translateTitles(); }

// Tooltips are not text nodes, so they are translated here.
function translateTitles() {
  document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); });
}

// ─── Keyboard (only while the pointer is over the workspace, like Blender) ──
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (!S.hover && !S.modal && e.key !== 'Escape') return;
  const k = e.key, code = e.code, ctrl = e.ctrlKey || e.metaKey;
  if (S.modal) {
    if (k === 'Escape') cancelModal(); else if (k === 'Enter') confirmModal(); else return;
    e.preventDefault(); return;
  }
  let handled = true;
  if (ctrl && (k === 'z' || k === 'Z')) e.shiftKey ? redo() : undo();
  else if (ctrl && (k === 'y' || k === 'Y')) redo();
  else if (ctrl && (k === 'p' || k === 'P')) openMenu('parent', S.pointer?.cx ?? innerWidth / 2, S.pointer?.cy ?? innerHeight / 2);
  else if ((k === 'r' || k === 'R') && e.altKey) clearPose();
  else if ((k === 'r' || k === 'R') && !ctrl) startModal('rotate');
  else if ((k === 'f' || k === 'F') && !ctrl) startModal(e.shiftKey ? 'strength' : 'radius');
  else if (k === 'Home') frameAll();
  else if (code === 'Numpad1' || (k === '1' && !ctrl)) frameAll(ctrl ? 'back' : 'front');
  else if (code === 'Numpad3' || (k === '3' && !ctrl)) frameAll(ctrl ? 'left' : 'right');
  else if (code === 'Numpad7' || (k === '7' && !ctrl)) frameAll(ctrl ? 'bottom' : 'top');
  else if (k === 'Escape') closeMenu();
  else handled = false;
  if (handled) e.preventDefault();
});

// ─── Start ──────────────────────────────────────────────────────────────────
new ResizeObserver(resize).observe(host);
onLangChange(() => renderAll());
enterStage(); resize(); translateTitles();
window.__skin = { S, SW, STAGES, runOp, setActive, enterStage, dab, brushHits, frameAll, camera }; // for tests and curious students
