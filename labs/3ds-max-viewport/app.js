// 3ds Max Viewport Lab: the four viewports of 3ds Max 2027, selection, transforms, the Create and Modify panels,
// clones, arrays and groups. The Max windows come from the shared kit in ../_max.
import * as THREE from 'three';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
import { createMaxShell, rollout, spinner } from '../_max/max-shell.js?v=4';
import { createMaxViewport } from '../_max/max-viewport.js?v=3';
import { createGizmo, toMax, fromMax } from '../_max/max-gizmo.js?v=3';
import { icon } from '../_max/max-icons.js?v=3';
import { PARAMS, MODS, MOD_LIST, MADE, TYPES, newMod, cleanParam, buildMesh } from './prims.js?v=1';
import * as SC from './scene.js?v=1';
import { STAGES, startState, ghostState, MARKS, created } from './stages.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-max-vp:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-max-vp:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const num = (v, d = 3) => String(+(+v).toFixed(d));

// ─── State ───────────────────────────────────────────────────────────────────
const S = {
  stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [], done: store.get('done', {}),
  tool: 'select', axis: 'xy', coord: 'view', crossing: true, absolute: true, angleSnap: false, gizmoOn: true,
  active: 3, maxed: false, create: null, making: null, xf: null, region: null, stackSel: null, pending: null, lastMade: null,
};
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step];
const st = () => S.st;
const sel = () => S.st.sel;
const one = () => (S.st.sel.length === 1 ? SC.find(S.st, S.st.sel[0]) : null);

// ─── The 3ds Max 2027 main window (shared kit) ──────────────────────────────
const objList = () => S.st.objs.map(o => ({ id: o.id, name: o.name, kind: SC.isGroup(o) ? 'Group' : 'Geometry', parent: o.parent || null, color: o.color, hidden: o.hidden, frozen: o.frozen }));
const ACTIONS = {
  undo: () => undo(), redo: () => redo(),
  select: () => setTool('select'), move: () => setTool('move'), rotate: () => setTool('rotate'), scale: () => setTool('scale'),
  selectByName: () => selectByNameDialog(),
  selectAll: () => setSelection(topLevel().filter(o => SC.selectable(S.st, o)).map(o => o.id), 'Select All'),
  selectNone: () => setSelection([], 'Select None'),
  selectInvert: () => { const now = new Set(sel()); setSelection(topLevel().filter(o => SC.selectable(S.st, o) && !now.has(o.id)).map(o => o.id), 'Select Invert'); },
  treeClick: (id, e) => clickSelect(id ? SC.pickTarget(S.st, id) : null, e, true),
  objectState: (id, patch) => { edit(() => { if (patch.hidden != null) { SC.setHidden(S.st, id, patch.hidden); S.st.sel = S.st.sel.filter(s => !SC.find(S.st, s)?.hidden); } if (patch.frozen != null) { SC.setFrozen(S.st, id, patch.frozen); S.st.sel = S.st.sel.filter(s => !SC.find(S.st, s)?.frozen); } }); msg(tr(patch.hidden != null ? (patch.hidden ? '{o} hidden.' : '{o} unhidden.') : (patch.frozen ? '{o} frozen: you can see it, but not select it.' : '{o} unfrozen.'), { o: id })); return false; },
  delete: () => { if (!sel().length) return msg('Nothing selected.'); const n = sel().length; edit(() => SC.deleteObjects(S.st, sel())); msg(tr('Deleted {n} objects.', { n })); },
  gizmo: () => { S.gizmoOn = !S.gizmoOn; msg(S.gizmoOn ? 'Transform gizmo on (X).' : 'Transform gizmo off (X): press X to show it again.'); draw(); },
  maximize: () => toggleMaximize(),
  zoomExtents: () => zoomExtents(false), zoomExtentsAll: () => zoomExtents(true),
  grid: () => { const p = pane(); p.grid = !p.grid; draw(); msg(p.grid ? 'Grid on (G).' : 'Grid off (G).'); },
  viewPerspective: () => setPaneView(S.active, 'perspective', 'p'), viewFront: () => setPaneView(S.active, 'front', 'f'), viewTop: () => setPaneView(S.active, 'top', 't'), viewLeft: () => setPaneView(S.active, 'left', 'l'),
  wireframe: () => { const p = pane(); p.style = p.style === 'wire' ? 'shaded' : 'wire'; renderLabels(); draw(); },
  edgedFaces: () => { const p = pane(); p.edged = !p.edged; renderLabels(); draw(); msg(p.edged ? 'Edged Faces on (F4).' : 'Edged Faces off (F4).'); },
  axisX: () => setAxis('x'), axisY: () => setAxis('y'), axisZ: () => setAxis('z'), axisPlane: () => setAxis(({ xy: 'yz', yz: 'zx', zx: 'xy' })[S.axis] || 'xy'),
  angleSnap: () => { S.angleSnap = !S.angleSnap; syncToolbar(); msg(S.angleSnap ? 'Angle Snap on (A): rotations jump 5° at a time.' : 'Angle Snap off (A).'); },
  typeIn: (axis, v) => typeIn(axis, v),
  typeInDialog: () => typeInDialog(),
  absolute: () => { S.absolute = !S.absolute; syncToolbar(); draw(); msg(S.absolute ? 'Absolute Mode Transform Type-In: the fields are the values themselves.' : 'Offset Mode Transform Type-In: the fields are added to the current values.'); },
  crossing: () => { S.crossing = !S.crossing; syncToolbar(); msg(S.crossing ? 'Crossing: a region selects the objects it touches.' : 'Window: a region selects only the objects fully inside it.'); },
  region: () => msg('Rectangular Selection Region: drag on an empty place of a viewport.'),
  refCoord: e => refCoordMenu(e),
  cloneDialog: () => { if (!sel().length) return msg('Select something to clone first.', true); cloneOptions(sel(), null); },
  pan: () => msg('Pan: drag with the middle mouse button in a viewport.'), orbit: () => msg('Orbit: Alt + middle mouse button drag in a viewport.'), zoom: () => msg('Zoom: mouse wheel, or Ctrl+Alt + middle mouse button.'),
  commandPanel: (tab, page) => renderCommandPanel(tab, page),
  layout: () => requestAnimationFrame(() => { panes.forEach(p => p.vp.resize()); draw(); }),
  key: (e, combo) => {
    if (combo === 'escape') { if (S.xf) { endTransform(false); msg('Transform cancelled.'); return true; } if (S.making) { cancelMaking(); return true; } if (S.create) { endCreate(); return true; } }
    if (S.making && combo === 'backspace') return true;
    return false;
  },
};
const max = createMaxShell($('#max-app'), {
  file: 'Viewport_Lab.max', units: 'm', tab: 'modify', objects: [], selected: null,
  enable: ['region', 'crossing', 'absolute'],
  pages: { create: '', modify: '', display: '' },
  actions: ACTIONS,
  menus: {
    Edit: () => [
      { label: 'Undo', keys: 'Ctrl+Z', run: undo }, { label: 'Redo', keys: 'Ctrl+Y', run: redo }, { sep: true },
      { label: 'Delete', keys: 'Delete', run: ACTIONS.delete }, { label: 'Clone', keys: 'Ctrl+V', run: ACTIONS.cloneDialog }, { sep: true },
      { label: 'Select All', keys: 'Ctrl+A', run: ACTIONS.selectAll }, { label: 'Select None', keys: 'Ctrl+D', run: ACTIONS.selectNone }, { label: 'Select Invert', keys: 'Ctrl+I', run: ACTIONS.selectInvert }, { label: 'Select by Name...', keys: 'H', run: ACTIONS.selectByName }, { sep: true },
      { label: 'Select and Move', keys: 'W', run: ACTIONS.move }, { label: 'Select and Rotate', keys: 'E', run: ACTIONS.rotate }, { label: 'Select and Scale', keys: 'R', run: ACTIONS.scale }, { sep: true },
      { label: 'Transform Type-In...', keys: 'F12', run: ACTIONS.typeInDialog },
    ],
    Tools: () => [{ label: 'Array...', run: () => arrayDialog() }, { label: 'Mirror...', dim: true }, { label: 'Align', dim: true }],
    Group: () => [
      { label: 'Group...', run: () => groupDialog() }, { label: 'Ungroup', run: () => groupOp('ungroup') }, { label: 'Open', run: () => groupOp('open') }, { label: 'Close', run: () => groupOp('close') },
      { sep: true }, { label: 'Attach', dim: true }, { label: 'Detach', dim: true }, { label: 'Explode', dim: true },
    ],
    Views: () => [
      { label: 'Maximize Viewport Toggle', keys: 'Alt+W', run: toggleMaximize }, { label: 'Zoom Extents Selected', keys: 'Z', run: () => zoomExtents(false) }, { label: 'Zoom Extents All', keys: 'Ctrl+Shift+Z', run: () => zoomExtents(true) },
      { sep: true }, { label: 'Show Grids', keys: 'G', checked: pane().grid, run: ACTIONS.grid },
    ],
    Create: () => [...MADE.map(n => ({ label: `Standard Primitives ▸ ${n}`, run: () => startCreate(n) }))],
    Modifiers: () => [...MOD_LIST.map(n => ({ label: `Parametric Deformers ▸ ${n}`, run: () => addModifier(n) }))],
  },
});
max.host.innerHTML = '';
max.root.classList.add('qv-mode');

let msgTimer;
function msg(text, warning = false) {
  max.prompt(t(text));
  const el = document.querySelector('#mx-prompt');
  el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => el.classList.remove('warning'), 4000);
}
const topLevel = () => S.st.objs.filter(o => { if (!o.parent) return true; const g = SC.find(S.st, o.parent); return g && g.open; });

// ─── Four viewports ─────────────────────────────────────────────────────────
// Default 3ds Max layout: Top, Front, Left (orthographic, Wireframe Override) and Perspective (Default Shading).
// Each viewport is a kit viewport (Max navigation and ViewCube); the scene is one three.js group that is
// moved into the viewport being drawn. Orthographic views use a very narrow field of view.
const ORTHO_FOV = 1.5, PERSP_FOV = 40;
const ORTHO = new Set(['top', 'bottom', 'front', 'back', 'left', 'right', 'orthographic']);
const VIEW_LABEL = { top: 'Top', bottom: 'Bottom', front: 'Front', back: 'Back', left: 'Left', right: 'Right', perspective: 'Perspective', orthographic: 'Orthographic' };
const ROLE = ['top', 'front', 'left', 'persp'];
const TRIPOD = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M14 30 30 24" stroke="#e5534b" stroke-width="2"/><path d="M14 30 20 20" stroke="#62c45a" stroke-width="2"/><path d="M14 30V8" stroke="#5aa2e6" stroke-width="2"/></svg>';
max.host.innerHTML = `<div class="qv-grid" id="qv">${[0, 1, 2, 3].map(i => `<div class="qv-pane" data-pane="${i}"><div class="qv-host"><canvas aria-label="Viewport ${i + 1}"></canvas></div>
  <div class="mx-vp-labels qv-labels"><button type="button" data-pmenu="general" title="General Viewport menu">+</button><button type="button" data-pmenu="pov" class="qv-pov" title="Point-of-View menu"></button><button type="button" data-pmenu="shading" title="Standard / High Quality menu">Standard<i></i></button><button type="button" data-pmenu="style" class="qv-style" title="Per-View Preference menu"></button></div>
  <div class="mx-viewcube qv-cube"><canvas width="120" height="110" aria-label="ViewCube: click a face to look from that side"></canvas><button type="button" class="mx-vc-home qv-home" title="Home" aria-label="ViewCube Home">${icon('home')}</button></div>
  <span class="qv-tripod">${TRIPOD}</span><div class="qv-readout" hidden></div><div class="qv-region" hidden></div></div>`).join('')}</div>`;
const content = new THREE.Group();            // every object, ghost and mark of the scene
const panes = [...document.querySelectorAll('.qv-pane')].map((el, i) => {
  const host = el.querySelector('.qv-host'), canvas = host.querySelector('canvas');
  const P = { i, el, host, canvas, view: ROLE[i] === 'persp' ? 'perspective' : ROLE[i], style: ROLE[i] === 'persp' ? 'shaded' : 'wire', edged: false, grid: true };
  P.vp = createMaxViewport({ host, canvas, onChange: () => { if (P.vp) { schedule(); } } });
  P.vp.renderer.setClearColor(0x3d3d3d, 1);
  P.vp.camera.far = 20000; P.vp.camera.updateProjectionMatrix();
  P.gizmo = createGizmo({ scene: P.vp.scene, camera: P.vp.camera, dom: canvas });
  P.vp.attachViewCube(el.querySelector('.qv-cube canvas'), face => cubePick(i, face));
  el.querySelector('.qv-home').addEventListener('click', () => cubeHome(i));
  return P;
});
const pane = (i = S.active) => panes[i];
const isOrtho = P => ORTHO.has(P.view);
function applyLens(P) {
  const cam = P.vp.camera, ortho = isOrtho(P), fov = ortho ? ORTHO_FOV : PERSP_FOV;
  if (cam.fov !== fov) {
    // keep the same framing when the lens changes: the visible height at the target stays the same
    const h = 2 * P.vp.view.dist * Math.tan(cam.fov * Math.PI / 360);
    cam.fov = fov; P.vp.view.dist = h / (2 * Math.tan(fov * Math.PI / 360));
  }
  cam.near = ortho ? Math.max(0.5, P.vp.view.dist * 0.05) : 0.05; cam.updateProjectionMatrix();
  // the construction grid of each view: ground (XY) for Top and Perspective, XZ for Front, YZ for Left
  const g = P.vp.grid; g.rotation.set(0, 0, 0);
  if (P.view === 'front' || P.view === 'back') g.rotation.x = Math.PI / 2;
  if (P.view === 'left' || P.view === 'right') g.rotation.z = Math.PI / 2;
}
function frameScene(P, ids = null) {
  const list = ids || S.st.objs.filter(o => !o.hidden && !SC.isGroup(o)).map(o => o.id);
  const b = list.length ? SC.worldBounds(S.st, list) : null;
  const lo = b ? b.lo : [-2, -2, 0], hi = b ? b.hi : [2, 2, 1];
  if (!ids && S.st.ghosts.length) for (const g of S.st.ghosts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], g.pos[i] - 1); hi[i] = Math.max(hi[i], g.pos[i] + 1); }
  P.vp.frame({ x: lo[0], y: lo[1], z: lo[2] }, { x: hi[0], y: hi[1], z: hi[2] });
  if (!ids) P.vp.view.dist *= isOrtho(P) ? 1.25 : 1.15;
  P.vp.update();
}
function resetViews() {
  panes.forEach((P, i) => {
    P.view = ROLE[i] === 'persp' ? 'perspective' : ROLE[i]; P.style = ROLE[i] === 'persp' ? 'shaded' : 'wire'; P.edged = false; P.grid = true;
    applyLens(P); P.vp.setView(P.view === 'perspective' ? 'perspective' : P.view); applyLens(P); frameScene(P);
  });
  S.active = 3; S.maxed = false; layoutPanes(); renderLabels();
}
function setPaneView(i, view, flag) {
  const P = panes[i];
  const keep = P.vp.view.target.clone();
  P.view = view; applyLens(P);
  P.vp.setView(view === 'perspective' ? 'perspective' : view); P.vp.view.target.copy(keep); P.vp.update();
  applyLens(P);
  if (ORTHO.has(view) && view !== 'orthographic') P.style = P.style; // keeps the style the viewport had
  if (flag) setFlag('view_' + flag);
  renderLabels(); draw();
  msg(tr('{v} view in the active viewport.', { v: VIEW_LABEL[view] }));
}
function activate(i) {
  if (S.active === i && !S.maxed) { setFlag('act_' + ROLE[i]); return; }
  S.active = i; setFlag('act_' + ROLE[i]); renderLabels(); draw();
}
function toggleMaximize() {
  S.maxed = !S.maxed;
  if (S.maxed && pane().view === 'perspective') setFlag('maxed');
  if (!S.maxed && S.st.flags.maxed) setFlag('restored');
  layoutPanes();
  const b = max.root.querySelector('.mx-tb[data-id="maximize"]'); if (b) { b.classList.toggle('on', S.maxed); b.setAttribute('aria-pressed', S.maxed); }
  msg(S.maxed ? 'Maximize Viewport (Alt+W): press Alt+W again for the four viewports.' : 'Four viewports.');
}
function layoutPanes() {
  $('#qv').classList.toggle('maxed', S.maxed);
  panes.forEach((P, i) => { P.el.classList.toggle('active', i === S.active); P.el.hidden = S.maxed && i !== S.active; });
  requestAnimationFrame(() => { panes.forEach(P => { if (!P.el.hidden) P.vp.resize(); }); draw(); });
}
function renderLabels() {
  panes.forEach((P, i) => {
    P.el.querySelector('.qv-pov').innerHTML = `${VIEW_LABEL[P.view]}<i></i>`;
    P.el.querySelector('.qv-style').innerHTML = `${P.style === 'wire' ? 'Wireframe Override' : 'Default Shading'}${P.edged ? ' + Edged Faces' : ''}<i></i>`;
    P.el.classList.toggle('active', i === S.active);
  });
}
function cubePick(i, face) {
  activate(i);
  const P = panes[i], keep = P.vp.view.target.clone();
  if (P.view === 'perspective') { P.vp.setView(face); P.vp.view.target.copy(keep); P.vp.update(); if (face === 'top') setFlag('cubeFace'); }
  else { P.view = face; applyLens(P); P.vp.setView(face); P.vp.view.target.copy(keep); P.vp.update(); applyLens(P); }
  renderLabels(); draw(); msg(tr('ViewCube: {f}', { f: face.toUpperCase() }));
}
function cubeHome(i) {
  activate(i);
  const P = panes[i];
  if (!isOrtho(P) || P.view === 'orthographic') { P.view = 'perspective'; applyLens(P); P.vp.setView('perspective'); applyLens(P); frameScene(P); }
  else frameScene(P);
  if (S.st.flags.cubeFace) setFlag('cubeHome');
  renderLabels(); draw(); msg('ViewCube Home: back to the starting view.');
}
function zoomExtents(all) {
  const P = pane(), ids = all || !sel().length ? null : sel();
  if (!all && sel().includes('Cone001')) setFlag('zoomSel');
  frameScene(P, ids); draw();
  msg(all || !sel().length ? 'Zoom Extents All: the whole scene.' : 'Zoom Extents Selected (Z): the selection fills the active viewport.');
}
// Orbiting a flat view turns it into an Orthographic user view, as in 3ds Max.
panes.forEach((P, i) => {
  P.canvas.addEventListener('pointerdown', e => {
    if (e.button === 1) { activate(i); if (e.altKey && !(e.ctrlKey || e.metaKey) && isOrtho(P) && P.view !== 'orthographic') { P.view = 'orthographic'; setFlag('orbitOrtho'); renderLabels(); msg('Orbiting a flat view makes it an Orthographic (user) view. Press T, F or L to go back.'); } }
  }, true);
  P.canvas.addEventListener('wheel', () => { if (S.active !== i) activate(i); }, { passive: true, capture: true });
});
// Label menus of each viewport
$('#qv').addEventListener('click', e => {
  const b = e.target.closest('[data-pmenu]'); if (!b) return;
  const i = +b.closest('.qv-pane').dataset.pane, P = panes[i], r = b.getBoundingClientRect(), k = b.dataset.pmenu;
  activate(i);
  const views = ['perspective', 'orthographic', 'top', 'bottom', 'front', 'back', 'left', 'right'];
  const keys = { perspective: 'P', top: 'T', front: 'F', left: 'L', bottom: 'B', orthographic: 'U' };
  const items = k === 'pov' ? views.map(v => ({ label: VIEW_LABEL[v], keys: keys[v], checked: P.view === v, run: () => setPaneView(i, v === 'orthographic' ? 'perspective' : v, { perspective: 'p', top: 't', front: 'f', left: 'l' }[v]) })).filter(it => it.label !== 'Orthographic')
    : k === 'style' ? [{ label: 'Default Shading', checked: P.style === 'shaded', run: () => { P.style = 'shaded'; renderLabels(); draw(); } }, { label: 'Wireframe Override', keys: 'F3', checked: P.style === 'wire', run: () => { P.style = 'wire'; renderLabels(); draw(); } }, { sep: true }, { label: 'Edged Faces', keys: 'F4', checked: P.edged, run: ACTIONS.edgedFaces }]
    : k === 'general' ? [{ label: 'Maximize Viewport', keys: 'Alt+W', run: toggleMaximize }, { label: 'Show Grids', keys: 'G', checked: P.grid, run: ACTIONS.grid }, { label: 'ViewCube ▸ Show For Active View Only', checked: true, dim: true }]
    : [{ label: 'Standard', checked: true, dim: true }, { label: 'High Quality', dim: true }];
  max.openPopup(r.left, r.bottom, items);
});

// ─── Scene → three.js ───────────────────────────────────────────────────────
// Geometry is built in Max coordinates and placed with Max's transform, then turned to three.js (Y up).
const MAX_TO_THREE = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
function maxMatrix(o) {
  const R = SC.matFromEuler(o.rot), s = o.scale, p = o.pos;
  const m = new THREE.Matrix4().set(R[0][0] * s[0], R[0][1] * s[1], R[0][2] * s[2], p[0], R[1][0] * s[0], R[1][1] * s[1], R[1][2] * s[2], p[1], R[2][0] * s[0], R[2][1] * s[1], R[2][2] * s[2], p[2], 0, 0, 0, 1);
  return MAX_TO_THREE.clone().multiply(m);
}
function geometryOf(mesh) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(mesh.verts.flat());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(mesh.tris.flat()); g.computeVertexNormals();
  const e = new THREE.BufferGeometry(); e.setAttribute('position', new THREE.BufferAttribute(pos, 3)); e.setIndex(mesh.edges.flat());
  return { g, e };
}
const views = new Map();      // object id → { grp, mesh, wire, key }
const ghostGroup = new THREE.Group(), markGroup = new THREE.Group(); content.add(ghostGroup, markGroup);
const shade = (hex, k) => { const c = new THREE.Color(hex); return c.lerp(new THREE.Color(k > 0 ? 0xffffff : 0x000000), Math.abs(k)); };
function syncScene() {
  const seen = new Set();
  for (const o of S.st.objs) {
    if (SC.isGroup(o)) continue;
    seen.add(o.id);
    const b = SC.baseOf(S.st, o), key = JSON.stringify([b.type, b.params, SC.modsOf(S.st, o)]);
    let v = views.get(o.id);
    if (!v || v.key !== key) {
      if (v) { content.remove(v.grp); v.mesh.geometry.dispose(); v.wire.geometry.dispose(); }
      const { g, e } = geometryOf(SC.localMesh(S.st, o));
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      const wire = new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color: o.color }));
      const grp = new THREE.Group(); grp.add(mesh, wire); grp.matrixAutoUpdate = false; mesh.userData.obj = o.id;
      content.add(grp); v = { grp, mesh, wire, key }; views.set(o.id, v);
    }
    v.grp.matrix.copy(maxMatrix(o)); v.grp.matrixWorldNeedsUpdate = true;
    v.grp.visible = !o.hidden; v.obj = o;
  }
  for (const [id, v] of views) if (!seen.has(id)) { content.remove(v.grp); v.mesh.geometry.dispose(); v.wire.geometry.dispose(); views.delete(id); }
  // ghosts: blue silhouettes, green when the object fits
  ghostGroup.clear();
  const ok = ghostState(S.st, stepTol());
  S.st.ghosts.forEach((gh, i) => {
    const o = SC.find(S.st, gh.name); if (!o) return;
    const b = SC.baseOf(S.st, o), { g, e } = geometryOf(buildMesh(b.type, b.params, SC.modsOf(S.st, o)));
    const col = ok[i] ? 0x46d160 : 0x3d8bff;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    const w = new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 }));
    const grp = new THREE.Group(); grp.add(m, w); grp.matrixAutoUpdate = false; grp.matrix.copy(maxMatrix({ pos: gh.pos, rot: gh.rot, scale: gh.scale })); ghostGroup.add(grp);
  });
  // orange marks on three faces of the box (step Orbit, pan and zoom)
  markGroup.clear();
  const mk = S.st.marks && SC.find(S.st, S.st.marks.obj);
  if (mk) {
    const p = SC.baseOf(S.st, mk).params, hx = p.width / 2, hy = p.length / 2, h = p.height, s = 0.55;
    const FACES = { '+y': { c: [0, hy + 0.01, h / 2], n: [0, 1, 0] }, '-x': { c: [-hx - 0.01, 0, h / 2], n: [-1, 0, 0] }, '-z': { c: [0, 0, -0.01], n: [0, 0, -1] } };
    for (const k of S.st.marks.list) {
      const f = FACES[k], seen = !!S.st.flags.seen?.[k];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: seen ? 0x46d160 : 0xff8a1c, side: THREE.DoubleSide }));
      const n = fromMax(...f.n), c = fromMax(...SC.worldPoint(mk, f.c));
      m.position.copy(c); m.lookAt(c.clone().add(n)); markGroup.add(m);
      f.world = { c: SC.worldPoint(mk, f.c), n: f.n };
    }
    S.markFaces = FACES;
  } else S.markFaces = null;
}
const stepTol = () => step().id === 's4' ? { loc: 0.05, rot: 0.5, scale: 0.001 } : undefined;

// ─── Drawing each viewport ──────────────────────────────────────────────────
let raf = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderPanes(); }); }
function draw() { syncScene(); schedule(); }
const SEL_WIRE = new THREE.Color(0xffffff), FROZEN = new THREE.Color(0x8c8c8c);
function orientationFor(P) {
  // the Reference Coordinate System: View is screen-aligned in the flat views and World in Perspective
  const o = one() || SC.find(S.st, sel()[0]);
  if (S.coord === 'local' && o) { const m = new THREE.Matrix4().extractRotation(maxMatrix({ pos: [0, 0, 0], rot: o.rot, scale: [1, 1, 1] })); return new THREE.Quaternion().setFromRotationMatrix(m.multiply(new THREE.Matrix4().copy(MAX_TO_THREE).invert())); }
  if (S.coord === 'screen' || (S.coord === 'view' && isOrtho(P))) {
    // X to the right of the screen, Y up the screen, Z towards you (expressed on the gizmo's Max axes)
    const cam = P.vp.camera, right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), back = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2);
    // gizmo axes in three: Max X = (1,0,0), Max Y = (0,0,-1), Max Z = (0,1,0); map them to right, up, back
    const target = new THREE.Matrix4().makeBasis(right, back, up.clone().negate());
    return new THREE.Quaternion().setFromRotationMatrix(target);
  }
  return null;
}
function renderPanes() {
  if (!S.st) return;
  const sels = new Set(SC.moving(S.st, sel()).map(o => o.id));
  const pivotIds = sel();
  for (const P of panes) {
    if (P.el.hidden) continue;
    applyLens(P);
    P.vp.scene.add(content);
    const wire = P.style === 'wire';
    for (const [id, v] of views) {
      const o = v.obj, s = sels.has(id);
      v.mesh.material.visible = !wire;
      v.mesh.material.color.set(o.frozen ? '#8c8c8c' : o.color);
      v.wire.visible = wire || P.edged || (s && false);
      v.wire.material.color.copy(o.frozen ? FROZEN : s ? SEL_WIRE : wire ? new THREE.Color(o.color) : shade(o.color, P.edged ? -0.45 : 0));
      if (!wire) P.vp.outline(v.mesh, s);
      else if (v.mesh.userData.outline) v.mesh.userData.outline.visible = false;
    }
    P.vp.grid.visible = P.grid;
    // the gizmo of the active tool, on the pivot (one object) or on the centre of the selection
    const g = P.gizmo, show = S.gizmoOn && S.tool !== 'select' && pivotIds.length > 0 && !S.create && !S.making;
    g.setVisible(show);
    if (show) {
      const c = pivotIds.length === 1 ? SC.find(S.st, pivotIds[0]).pos : SC.selectionCenter(S.st, pivotIds);
      g.setMode(S.tool); g.setOrientation(orientationFor(P)); g.attach({ x: c[0], y: c[1], z: c[2] });
      g.setLocked(S.tool === 'move' ? S.axis : S.tool === 'rotate' && S.axis.length === 1 ? S.axis : null); g.update();
    }
    P.vp.render();
  }
  checkMarks();
  syncTypeIn();
}

// ─── Undo, flags, selection ─────────────────────────────────────────────────
function pushUndo(snap = JSON.stringify(S.st)) { S.undo.push(snap); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function edit(fn, label) { pushUndo(); fn(); changed(); if (label) msg(label); }
function undo() { if (S.xf || S.making) return; if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); S.stackSel = null; changed(); refreshPanel(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); S.stackSel = null; changed(); refreshPanel(); msg('Redo'); }
function setFlag(k) { if (S.st.flags[k]) return; S.st.flags[k] = true; saveData(); checkProgress(); }
function setSelection(ids, label) {
  if (max.state.lock) return msg('Selection Lock is on (Space): press Space to unlock it.', true);
  S.st.sel = [...new Set(ids)].filter(id => SC.find(S.st, id)); S.stackSel = null;
  max.setSelection(S.st.sel); saveData(); checkProgress(); refreshPanel(); draw();
  if (label) msg(tr('{l}: {n} selected.', { l: label, n: S.st.sel.length }));
}
// Click (or Scene Explorer click): replace; Ctrl adds or toggles; Alt removes.
function clickSelect(id, e, fromTree = false) {
  const now = sel();
  if (!id) { if (!e?.ctrlKey && !e?.altKey) setSelection([]); return; }
  if (e?.altKey) setSelection(now.filter(x => x !== id));
  else if (e?.ctrlKey || e?.metaKey) setSelection(now.includes(id) ? now.filter(x => x !== id) : [...now, id]);
  else if (fromTree || !now.includes(id)) setSelection([id]);
}
function refreshPanel() { if (['modify', 'create', 'display'].includes(max.state.tab)) max.showTab(max.state.tab); }
function changed() { max.setObjects(objList(), sel()[sel().length - 1] ?? null); max.setSelection(sel()); saveData(); draw(); checkProgress(); }

// ─── Picking and the mouse in the viewports ─────────────────────────────────
const ray = new THREE.Raycaster();
function setRay(P, e) { const r = P.canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), P.vp.camera); }
function pickObject(P, e) {
  setRay(P, e); content.updateMatrixWorld(true);
  const meshes = [...views.values()].filter(v => v.grp.visible && !v.obj.frozen).map(v => v.mesh);
  const hit = ray.intersectObjects(meshes, false)[0];
  if (!hit) return null;
  return SC.pickTarget(S.st, hit.object.userData.obj);
}
const screenOf = (P, p) => { const v = fromMax(p[0], p[1], p[2]).project(P.vp.camera), r = P.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, front: v.z < 1 }; };
function regionPick(P, a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const inside = q => q.front && q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
  return topLevel().filter(o => SC.selectable(S.st, o)).filter(o => {
    const pts = SC.worldVerts(S.st, o).map(p => screenOf(P, p)); if (!pts.length) return false;
    if (!S.crossing) return pts.every(inside);
    if (pts.some(inside)) return true;
    // Crossing also catches a region drawn inside a big face: test the centre of the region against the screen box
    const bx0 = Math.min(...pts.map(q => q.x)), bx1 = Math.max(...pts.map(q => q.x)), by0 = Math.min(...pts.map(q => q.y)), by1 = Math.max(...pts.map(q => q.y));
    return x0 < bx1 && x1 > bx0 && y0 < by1 && y1 > by0 && pickAtScreen(P, (x0 + x1) / 2, (y0 + y1) / 2) === o.id;
  }).map(o => o.id);
}
function pickAtScreen(P, x, y) { const r = P.canvas.getBoundingClientRect(); return pickObject(P, { clientX: r.left + x, clientY: r.top + y }); }

panes.forEach((P, i) => {
  const c = P.canvas;
  c.addEventListener('pointerdown', e => {
    max.closePopup();
    // right button: cancels a drag or ends a create tool; otherwise activates the viewport, and the quad menu opens (contextmenu)
    if (e.button === 2) { e.preventDefault(); S.noMenu = true; if (S.xf) { endTransform(false); msg('Transform cancelled (right-click).'); return; } if (S.making) { cancelMaking(); return; } if (S.create) { endCreate(); return; } if (S.active !== i) { activate(i); return; } S.noMenu = false; return; }
    if (e.button !== 0) return;
    if (S.active !== i) activate(i);
    if (S.making) { makingClick(P, e); return; }
    if (S.create) { startMaking(P, e); return; }
    let part = S.tool !== 'select' && sel().length && S.gizmoOn ? P.gizmo.pick(e) : null;
    let hit = part ? sel()[0] : pickObject(P, e);
    if (!part && hit && !(e.ctrlKey || e.altKey) && !sel().includes(hit)) clickSelect(hit, e);
    else if (!part && hit && (e.ctrlKey || e.metaKey || e.altKey)) { clickSelect(hit, e); return; }
    if (!hit) { S.region = { P, a: { x: e.offsetX, y: e.offsetY }, b: { x: e.offsetX, y: e.offsetY }, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey }; c.setPointerCapture(e.pointerId); return; }
    if (S.tool === 'select' || !sel().length) return;
    if (S.tool === 'move' && !part) part = S.axis;
    if (S.tool === 'rotate' && !part) part = S.axis.length === 1 ? S.axis : 'z';
    if (S.tool === 'scale' && !part) part = 'xyz';
    startTransform(P, e, part);
  });
  c.addEventListener('pointermove', e => {
    if (S.xf && S.xf.P === P) { const d = P.gizmo.drag(e); if (d) updateTransform(d, e); return; }
    if (S.making && S.making.P === P) { makingMove(P, e); return; }
    if (S.region && S.region.P === P) { S.region.b = { x: e.offsetX, y: e.offsetY }; drawRegion(); return; }
    if (P.vp.isNavigating()) return;
    if (P.gizmo.hover(e)) schedule();
    const over = S.create ? 'create' : P.gizmo.hoveredPart || pickObject(P, e);
    c.style.cursor = S.create ? 'crosshair' : over ? (S.tool === 'rotate' ? 'alias' : S.tool === 'scale' ? 'nesw-resize' : S.tool === 'move' ? 'move' : 'pointer') : 'default';
  });
  c.addEventListener('pointerup', e => {
    if (S.xf && S.xf.P === P) { endTransform(true); return; }
    if (S.making && S.making.P === P) { makingUp(P, e); return; }
    if (S.region && S.region.P === P) {
      const R = S.region; S.region = null; P.el.querySelector('.qv-region').hidden = true;
      if (Math.hypot(R.b.x - R.a.x, R.b.y - R.a.y) < 3) { if (!R.ctrl && !R.alt) setSelection([]); return; }
      const got = regionPick(P, R.a, R.b), now = sel();
      setSelection(R.alt ? now.filter(x => !got.includes(x)) : R.ctrl ? [...now, ...got] : got, S.crossing ? 'Crossing region' : 'Window region');
    }
  });
  c.addEventListener('contextmenu', e => { e.preventDefault(); if (!S.noMenu) quadMenu(e); S.noMenu = false; });
});
function drawRegion() {
  const R = S.region, el = R.P.el.querySelector('.qv-region');
  el.hidden = false; el.classList.toggle('window', !S.crossing);
  Object.assign(el.style, { left: `${Math.min(R.a.x, R.b.x)}px`, top: `${Math.min(R.a.y, R.b.y)}px`, width: `${Math.abs(R.b.x - R.a.x)}px`, height: `${Math.abs(R.b.y - R.a.y)}px` });
}

// ─── Transforms with the gizmo ──────────────────────────────────────────────
function startTransform(P, e, part) {
  const frozen = sel().map(id => SC.find(S.st, id)).find(o => o.frozen); if (frozen) return msg(tr('{o} is frozen.', { o: frozen.name }), true);
  const ids = [...sel()], center = ids.length === 1 ? [...SC.find(S.st, ids[0]).pos] : SC.selectionCenter(S.st, ids);
  S.xf = { P, part, tool: S.tool, ids, center, snap: JSON.stringify(S.st), clone: e.shiftKey, last: null };
  e.preventDefault(); P.canvas.setPointerCapture(e.pointerId);
  P.gizmo.begin(e, part);
  if (S.tool === 'move' && part.length <= 2 && part !== 'xyz') { S.axis = part; syncToolbar(); }
}
function applyDelta(ids, d, x) {
  if (x.tool === 'move') SC.moveBy(S.st, ids, [d.move.x, d.move.y, d.move.z].map(v => +v.toFixed(4)));
  if (x.tool === 'rotate') {
    let a = d.angle; if (S.angleSnap) a = Math.round(a / 5) * 5;
    const ax = x.part === 'view' ? (() => { const v = toMax(x.P.vp.camera.getWorldDirection(new THREE.Vector3()).negate()); return [v.x, v.y, v.z]; })() : (() => { const v = x.P.gizmo.axis(x.part); return [v.x, v.y, v.z]; })();
    SC.rotateBy(S.st, ids, ax, a, ids.length > 1 ? x.center : null); d.shown = a;
  }
  if (x.tool === 'scale') { const f = [0, 1, 2].map(i => x.part.includes('xyz'[i]) ? d.scale : 1); SC.scaleBy(S.st, ids, f, ids.length > 1 ? x.center : null); }
}
function updateTransform(d, e) {
  const x = S.xf; S.st = JSON.parse(x.snap); x.last = d;
  applyDelta(x.ids, d, x);
  let text = '';
  if (x.tool === 'move') text = `Move  ${['x', 'y', 'z'].map(a => `${a.toUpperCase()} ${num(d.local ? d.local[a] : d.move[a], 3)}`).join('  ')} m`;
  if (x.tool === 'rotate') text = `Rotate  ${x.part.toUpperCase()} ${num(d.shown ?? d.angle, 1)}°`;
  if (x.tool === 'scale') text = `Scale  ${x.part.toUpperCase()} ${Math.round(d.scale * 100)} %`;
  const ro = x.P.el.querySelector('.qv-readout'); ro.hidden = false; ro.textContent = `${x.clone ? 'Shift+' : ''}${text}`;
  draw();
}
function endTransform(ok) {
  const x = S.xf; if (!x) return;
  S.xf = null; x.P.gizmo.end(); x.P.el.querySelector('.qv-readout').hidden = true;
  if (!ok || !x.last) { S.st = JSON.parse(x.snap); draw(); return; }
  if (x.clone) { S.st = JSON.parse(x.snap); cloneOptions(x.ids, x); return; }
  pushUndo(x.snap);
  if (x.tool === 'move' && S.coord === 'local' && x.ids.includes('Plank001')) S.st.flags.local = true;
  changed(); refreshPanel();
}

// ─── Transform Type-In (status bar and F12) ─────────────────────────────────
function syncTypeIn() {
  const o = one();
  if (!o || S.tool === 'select') { if (o) max.setCoords(...o.pos); else max.setCoords(null, null, null); return; }
  if (!S.absolute) { max.setCoords(...(S.tool === 'scale' ? [100, 100, 100] : [0, 0, 0])); return; }
  if (S.tool === 'rotate') max.setCoords(...o.rot); else if (S.tool === 'scale') max.setCoords(...o.scale.map(v => v * 100)); else max.setCoords(...o.pos);
}
function typeIn(axis, v, tool = S.tool, absolute = S.absolute) {
  const o = one(); if (!o) return msg('Transform Type-In works on one selected object.', true);
  const i = 'xyz'.indexOf(axis);
  edit(() => {
    if (tool === 'rotate') {
      if (absolute) o.rot[i] = +v;
      else SC.rotateBy(S.st, [o.id], [0, 1, 2].map(k => +(k === i)), +v);
    } else if (tool === 'scale') {
      const f = [1, 1, 1]; f[i] = absolute ? (+v / 100) / (o.scale[i] || 1) : +v / 100; SC.scaleBy(S.st, [o.id], f);
      if (absolute) o.scale[i] = +(+v / 100).toFixed(6);
    } else {
      const d = [0, 0, 0]; d[i] = absolute ? +v - o.pos[i] : +v; SC.moveBy(S.st, [o.id], d);
      if (absolute) o.pos[i] = +(+v).toFixed(6);
    }
  });
  refreshPanel();
}
function typeInDialog() {
  const tool = S.tool === 'select' ? 'move' : S.tool, name = { move: 'Move', rotate: 'Rotate', scale: 'Scale' }[tool];
  const o = one(); if (!o) return msg('Select one object for the Transform Type-In dialog.', true);
  const vals = tool === 'rotate' ? o.rot : tool === 'scale' ? o.scale.map(v => v * 100) : o.pos, unit = tool === 'move' ? 'm' : tool === 'rotate' ? '°' : '%';
  const col = (pre, v, step) => ['x', 'y', 'z'].map((a, i) => `<label class="mx-field">${a.toUpperCase()}: ${spinner({ id: `ti-${pre}-${a}`, value: +(+v[i]).toFixed(3), step, decimals: 3, width: 90 })}</label>`).join('');
  const d = max.dialog(`${name} Transform Type-In`, `<div class="ti-cols"><fieldset><legend>Absolute:World</legend>${col('abs', vals, tool === 'move' ? 0.1 : 1)}</fieldset><fieldset><legend>Offset:World</legend>${col('off', tool === 'scale' ? [100, 100, 100] : [0, 0, 0], tool === 'move' ? 0.1 : 1)}</fieldset></div><p class="mx-note">${esc(unit === 'm' ? 'Metres.' : unit === '°' ? 'Degrees.' : 'Percent.')} Press Enter or use the arrows: the object changes at once.</p>`, null, { ok: '', cancel: 'Close', width: 380 });
  const onTi = e => {
    const m = e.target.id.match(/^ti-(abs|off)-([xyz])$/); if (!m) return;
    typeIn(m[2], +e.target.value, tool, m[1] === 'abs');
    if (m[1] === 'off') e.target.value = tool === 'scale' ? 100 : 0;
    const o2 = one(), v2 = tool === 'rotate' ? o2.rot : tool === 'scale' ? o2.scale.map(v => v * 100) : o2.pos;
    ['x', 'y', 'z'].forEach((a, i) => { const f = d.querySelector(`#ti-abs-${a}`); if (f && f !== e.target) f.value = +(+v2[i]).toFixed(3); });
  };
  // Enter applies the value and keeps the dialog open (as the floater in 3ds Max)
  const onKey = e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); } };
  d.addEventListener('change', onTi); d.addEventListener('keydown', onKey);
  d.addEventListener('close', () => { d.removeEventListener('change', onTi); d.removeEventListener('keydown', onKey); }, { once: true });
}

// ─── Create panel: build primitives with the mouse ──────────────────────────
// Top and Perspective build on the ground; Front and Left build on their own plane, facing you.
function constructionPlane(P) {
  if (P.view === 'front' || P.view === 'back') return { n: [0, P.view === 'front' ? -1 : 1, 0], o: [0, 0, 0], rot: P.view === 'front' ? [90, 0, 0] : [-90, 0, 180] };
  if (P.view === 'left' || P.view === 'right') return { n: [P.view === 'left' ? -1 : 1, 0, 0], o: [0, 0, 0], rot: P.view === 'left' ? [0, -90, 0] : [0, 90, 0] };
  return { n: [0, 0, 1], o: [0, 0, 0], rot: [0, 0, 0] };
}
function planePoint(P, e, pl) {
  setRay(P, e);
  const n = fromMax(...pl.n), plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, fromMax(...pl.o)), hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return null; const m = toMax(hit); return [m.x, m.y, m.z];
}
function pixelSize(P, p) {
  const cam = P.vp.camera, d = cam.position.distanceTo(fromMax(...p)), h = P.canvas.getBoundingClientRect().height || 1;
  return 2 * d * Math.tan(cam.fov * Math.PI / 360) / h;
}
function startCreate(type) {
  if (!MADE.includes(type)) return msg(tr('{t}: not in this lab. Try Box, Sphere, Cylinder, Cone, Torus or Plane.', { t: type }), true);
  if (S.xf) endTransform(false);
  S.create = type; max.showTab('create');
  msg(tr('{t}: drag in a viewport to create it. Right-click or Esc ends the tool.', { t: type }));
  draw();
}
function endCreate() { S.create = null; S.making = null; refreshPanel(); draw(); msg('Create tool ended.'); }
const PHASES = { Box: ['base', 'height'], Plane: ['base'], Sphere: ['radius'], Cylinder: ['radius', 'height'], Cone: ['radius', 'height', 'radius2'], Torus: ['radius', 'radius2'] };
function startMaking(P, e) {
  const pl = constructionPlane(P), p0 = planePoint(P, e, pl); if (!p0) return;
  const R = SC.matFromEuler(pl.rot), ux = [R[0][0], R[1][0], R[2][0]], uy = [R[0][1], R[1][1], R[2][1]], uz = [R[0][2], R[1][2], R[2][2]];
  S.making = { P, type: S.create, pl, p0, ux, uy, uz, phase: 0, snap: JSON.stringify(S.st), y0: e.clientY, px: pixelSize(P, p0), obj: null, dragging: true };
  P.canvas.setPointerCapture(e.pointerId);
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function makingMove(P, e) {
  const M = S.making, ph = PHASES[M.type][M.phase];
  if (ph === 'base' || ph === 'radius') {
    const p1 = planePoint(P, e, M.pl); if (!p1) return;
    const d = p1.map((v, i) => v - M.p0[i]);
    if (!M.obj && Math.hypot(...d) < M.px * 3) return;
    if (!M.obj) { S.st = JSON.parse(M.snap); M.obj = SC.addObject(S.st, M.type, {}, { pos: [...M.p0], rot: [...M.pl.rot], created: true }).id; M.obj0 = [...M.p0]; }
    const o = SC.find(S.st, M.obj), prm = SC.baseOf(S.st, o).params;
    if (ph === 'base') {
      const w = Math.abs(dot(d, M.ux)), l = Math.abs(dot(d, M.uy)), mid = M.p0.map((v, i) => v + d[i] / 2);
      prm.width = Math.max(0.001, +w.toFixed(3)); prm.length = Math.max(0.001, +l.toFixed(3)); if (M.type === 'Box') prm.height = 0.001;
      o.pos = mid.map(v => +v.toFixed(4));
    } else {
      const r = Math.max(0.001, +Math.hypot(...d).toFixed(3));
      if (M.type === 'Torus') { prm.r1 = r; prm.r2 = Math.min(prm.r2, r * 0.9); } else if (M.type === 'Cone') { prm.r1 = r; prm.height = 0.001; } else { prm.radius = r; if (M.type === 'Cylinder') prm.height = 0.001; }
    }
  } else {
    const o = SC.find(S.st, M.obj), prm = SC.baseOf(S.st, o).params, dy = (M.y1 ?? M.y0) - e.clientY, v = dy * M.px;
    if (ph === 'height') prm.height = +(Math.abs(v) < 0.001 ? 0.001 : v).toFixed(3);
    if (ph === 'radius2') { if (M.type === 'Cone') prm.r2 = Math.max(0, +(prm.r1 + v).toFixed(3)); else prm.r2 = Math.max(0.001, +Math.abs(v).toFixed(3)); }
  }
  draw();
}
function makingUp(P, e) {
  const M = S.making; if (!M.dragging) return;
  M.dragging = false;
  if (!M.obj) { S.st = JSON.parse(M.snap); S.making = null; draw(); return; }
  if (M.phase + 1 >= PHASES[M.type].length) finishMaking(); else { M.phase++; M.y1 = e.clientY; msg(PHASES[M.type][M.phase] === 'height' ? 'Move the mouse up or down for the height, then click.' : 'Move the mouse for the second radius, then click.'); }
}
function makingClick(P, e) {
  const M = S.making;
  if (M.phase + 1 >= PHASES[M.type].length) finishMaking();
  else { M.phase++; M.y1 = e.clientY; }
}
function finishMaking() {
  const M = S.making; S.making = null;
  pushUndo(M.snap); S.st.sel = [M.obj]; S.lastMade = M.obj; S.stackSel = null;
  changed(); refreshPanel();
  msg(tr('{o} created. Drag again to create another one; right-click ends the tool.', { o: M.obj }));
}
function cancelMaking() { const M = S.making; S.making = null; S.st = JSON.parse(M.snap); draw(); msg('Creation cancelled.'); }

// ─── Command Panel: Create, Modify, Display ─────────────────────────────────
const BULB = on => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8a4.3 4.3 0 0 0-2.6 7.7c.5.4.8 1 .8 1.6v.6h3.6v-.6c0-.6.3-1.2.8-1.6A4.3 4.3 0 0 0 8 1.8z" fill="${on ? '#f4e8a3' : 'none'}" stroke="${on ? '#f4e8a3' : '#8a8a8a'}" stroke-width="1.2"/><path d="M6.3 13h3.4M6.8 14.6h2.4" stroke="#bdbdbd" stroke-width="1.1"/></svg>`;
const TRASH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M4.8 4.5l.7 9h5l.7-9" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
const paramRows = (list, vals, prefix) => list.map(([k, label, , step, min, dec]) => `<label class="mx-prop"><span>${esc(label)}:</span>${spinner({ id: `${prefix}-${k}`, value: +(+vals[k]).toFixed(dec), step, min, decimals: dec, width: 92 })}<span class="mx-unit">${dec ? (['angle', 'dir', 'bias'].includes(k) ? '' : k === 'amount' || k === 'curve' ? '' : 'm') : ''}</span></label>`).join('');
function renderCommandPanel(tab, page) {
  if (!S.st) return;
  const nm = page.querySelector('#mx-objname');
  if (nm) { const o = one(); nm.readOnly = !o; nm.value = o ? o.name : sel().length > 1 ? tr('{n} objects', { n: sel().length }) : ''; nm.dataset.rename = o ? o.id : ''; }
  if (tab === 'create') page.insertAdjacentHTML('beforeend', createPanel());
  if (tab === 'modify') page.insertAdjacentHTML('beforeend', modifyPanel());
  if (tab === 'display') page.insertAdjacentHTML('beforeend', displayPanel());
}
function createPanel() {
  const last = S.lastMade && SC.find(S.st, S.lastMade);
  return `<div class="mx-cats">${[['catGeometry', 'Geometry'], ['catShapes', 'Shapes'], ['catLights', 'Lights'], ['catCameras', 'Cameras'], ['catHelpers', 'Helpers'], ['catSpaceWarps', 'Space Warps'], ['catSystems', 'Systems']].map(([ic, n], i) => `<button type="button" class="mx-cat${i ? '' : ' on'}" title="${n}" aria-label="${n}"${i ? ' disabled' : ''}>${icon(ic)}</button>`).join('')}</div>
    <div class="mx-combo">Standard Primitives<i></i></div>
    ${rollout('Object Type', `<label class="mx-check dim"><input type="checkbox" disabled> AutoGrid</label><div class="mx-grid2">${TYPES.map(n => `<button type="button" class="mx-btn${S.create === n ? ' on' : ''}" data-mk="${n}"${MADE.includes(n) ? '' : ' disabled title="Not in this lab"'}>${n}</button>`).join('')}</div>`)}
    ${rollout('Name and Color', `<div class="mx-namecolor"><input type="text" class="mx-text" value="${esc(last?.name || '')}" aria-label="Name" ${last ? `data-rename="${esc(last.id)}"` : 'disabled'}><span class="mx-swatch" style="background:${last?.color || '#555'}"></span></div>`)}
    ${last ? rollout('Parameters', paramRows(PARAMS[SC.baseOf(S.st, last).type] || [], SC.baseOf(S.st, last).params, 'bp')) : ''}`;
}
function stackItems(o) {
  const b = SC.baseOf(S.st, o), shared = SC.sharing(S.st, o).length > 1, items = [];
  (o.own || []).map((m, i) => ({ m, key: `o:${i}` })).reverse().forEach(x => items.push(x));
  if (o.isRef) items.push({ line: true });
  b.mods.map((m, i) => ({ m, key: `b:${i}` })).reverse().forEach(x => items.push(x));
  items.push({ base: true, key: 'base', label: b.type, bold: shared });
  return items;
}
const modAt = (o, key) => { if (!key || key === 'base') return null; const [w, i] = key.split(':'); return (w === 'o' ? o.own : SC.baseOf(S.st, o).mods)[+i] || null; };
function modifyPanel() {
  if (!sel().length) return '<p class="mx-empty">Select an object to see its modifier stack and parameters.</p>';
  const o = one();
  if (!o) return `<div class="mx-combo mx-modlist-wrap"><select class="mx-modlist" disabled><option>Modifier List</option></select></div><p class="mx-empty">${esc(tr('{n} objects selected: select one to edit its parameters.', { n: sel().length }))}</p>`;
  if (SC.isGroup(o)) return `<p class="mx-empty">${esc(tr('{o} is a group ({n} objects). Group › Open to edit its parts.', { o: o.name, n: SC.members(S.st, o.id).length }))}</p>`;
  const items = stackItems(o), key = S.stackSel && items.some(x => x.key === S.stackSel) ? S.stackSel : 'base', md = modAt(o, key), b = SC.baseOf(S.st, o), shared = SC.sharing(S.st, o).length > 1;
  const list = `<div class="mx-stack" role="listbox" aria-label="Modifier stack">${items.map(x => x.line ? '<div class="mx-stack-line" title="Derived object line: modifiers above it only affect this reference"></div>' : `<div class="mx-stack-item${x.key === key ? ' on' : ''}${x.base ? ' base' : ''}${x.bold ? ' bold' : ''}" data-stack="${x.key}" role="option" aria-selected="${x.key === key}">${x.base ? '<span class="mx-bulb-sp"></span>' : `<button type="button" class="mx-bulb" data-bulb="${x.key}" title="${x.m.on ? 'Turn the modifier off' : 'Turn the modifier on'}" aria-pressed="${x.m.on}">${BULB(x.m.on)}</button>`}<span>${esc(x.base ? x.label : x.m.type)}</span></div>`).join('')}</div>`;
  const tools = `<div class="mx-stack-tools"><button type="button" class="mx-tb sm" disabled title="Pin Stack">📌</button><button type="button" class="mx-tb sm" disabled title="Show end result">▭</button><button type="button" class="mx-tb sm" data-unique${shared ? '' : ' disabled'} title="Make Unique">✱</button><button type="button" class="mx-tb sm" data-remove${md ? '' : ' disabled'} title="Remove modifier from the stack">${TRASH}</button></div>`;
  const params = md ? rollout('Parameters', `${paramRows(MODS[md.type], md, 'mp')}<div class="mx-prop mx-axes"><span>${md.type === 'Bend' ? 'Bend Axis' : md.type === 'Taper' ? 'Primary' : 'Twist Axis'}:</span><span class="mx-radios">${['x', 'y', 'z'].map(a => `<label><input type="radio" name="mod-axis" value="${a}"${(md.axis || 'z') === a ? ' checked' : ''}> ${a.toUpperCase()}</label>`).join('')}</span></div><label class="mx-check dim"><input type="checkbox" disabled> Limit Effect</label>`)
    : rollout('Parameters', paramRows(PARAMS[b.type] || [], b.params, 'bp'));
  return `<div class="mx-combo mx-modlist-wrap"><select class="mx-modlist" aria-label="Modifier List"><option value="">Modifier List</option><optgroup label="OBJECT-SPACE MODIFIERS">${MOD_LIST.map(m => `<option value="${m}">${m}</option>`).join('')}<option disabled>Edit Poly</option><option disabled>FFD 4x4x4</option><option disabled>TurboSmooth</option><option disabled>Shell</option><option disabled>UVW Map</option></optgroup></select></div>${list}${tools}${params}`;
}
function displayPanel() {
  return `${rollout('Hide', `<div class="mx-grid2"><button type="button" class="mx-btn" data-disp="hideSel">Hide Selected</button><button type="button" class="mx-btn" data-disp="hideUnsel">Hide Unselected</button><button type="button" class="mx-btn" data-disp="unhideAll">Unhide All</button><button type="button" class="mx-btn" disabled>Unhide by Name</button></div>`)}
    ${rollout('Freeze', `<div class="mx-grid2"><button type="button" class="mx-btn" data-disp="freezeSel">Freeze Selected</button><button type="button" class="mx-btn" data-disp="freezeUnsel">Freeze Unselected</button><button type="button" class="mx-btn" data-disp="unfreezeAll">Unfreeze All</button><button type="button" class="mx-btn" disabled>Unfreeze by Name</button></div>`)}`;
}
function addModifier(type) {
  const o = one(); if (!o || SC.isGroup(o)) return msg('Select one object to add a modifier.', true);
  // on an instance the modifier is shared; on a reference it goes above the derived line (its own)
  edit(() => { if (o.isRef) { o.own.push(newMod(type)); S.stackSel = `o:${o.own.length - 1}`; } else { const b = SC.baseOf(S.st, o); b.mods.push(newMod(type)); S.stackSel = `b:${b.mods.length - 1}`; } });
  refreshPanel(); msg(tr('{m} added to {o}.', { m: type, o: o.name }));
}
const DISP = {
  hideSel: () => { sel().forEach(id => SC.setHidden(S.st, id, true)); S.st.sel = []; },
  hideUnsel: () => { const k = new Set(SC.moving(S.st, sel()).map(o => o.id)); S.st.objs.forEach(o => { if (!k.has(o.id)) o.hidden = true; }); },
  unhideAll: () => { S.st.objs.forEach(o => { o.hidden = false; }); },
  freezeSel: () => { sel().forEach(id => SC.setFrozen(S.st, id, true)); S.st.sel = []; },
  freezeUnsel: () => { const k = new Set(SC.moving(S.st, sel()).map(o => o.id)); S.st.objs.forEach(o => { if (!k.has(o.id)) o.frozen = true; }); },
  unfreezeAll: () => { S.st.objs.forEach(o => { o.frozen = false; }); },
};
const DISP_MSG = { hideSel: 'Hide Selection.', hideUnsel: 'Hide Unselected.', unhideAll: 'Unhide All.', freezeSel: 'Freeze Selection: frozen objects stay visible but cannot be selected.', freezeUnsel: 'Freeze Unselected.', unfreezeAll: 'Unfreeze All.' };
function dispOp(k) { edit(() => DISP[k]()); refreshPanel(); msg(DISP_MSG[k]); }
// Command Panel events (the page element stays, its content is redrawn)
const cmdPage = max.page();
cmdPage.addEventListener('click', e => {
  const mk = e.target.closest('[data-mk]'); if (mk && !mk.disabled) { if (S.create === mk.dataset.mk) endCreate(); else startCreate(mk.dataset.mk); refreshPanel(); return; }
  const it = e.target.closest('[data-stack]'), bulb = e.target.closest('[data-bulb]');
  const o = one();
  if (bulb && o) { const m = modAt(o, bulb.dataset.bulb); edit(() => { m.on = !m.on; if (!m.on) S.st.flags.bulbOff = true; }); refreshPanel(); msg(tr(m.on ? '{m} on.' : '{m} off: the object shows the stack without it.', { m: m.type })); return; }
  if (it && o) { S.stackSel = it.dataset.stack; refreshPanel(); return; }
  if (e.target.closest('[data-remove]') && o) { const key = S.stackSel; const [w, i] = (key || '').split(':'); if (!w || w === 'base') return; edit(() => { (w === 'o' ? o.own : SC.baseOf(S.st, o).mods).splice(+i, 1); S.stackSel = null; }); refreshPanel(); msg('Modifier removed from the stack.'); return; }
  if (e.target.closest('[data-unique]') && o) { edit(() => SC.makeUnique(S.st, o.id)); refreshPanel(); msg(tr('{o} is unique now: changes no longer reach its instances.', { o: o.name })); return; }
  const dp = e.target.closest('[data-disp]'); if (dp) dispOp(dp.dataset.disp);
});
cmdPage.addEventListener('change', e => {
  const el = e.target;
  if (el.classList.contains('mx-modlist')) { if (el.value) addModifier(el.value); return; }
  if (el.dataset.rename) { const id = el.dataset.rename, v = el.value; pushUndo(); if (!SC.rename(S.st, id, v)) { S.undo.pop(); el.value = SC.find(S.st, id)?.name || ''; return msg('That name is empty or already used.', true); } if (S.lastMade === id) S.lastMade = v.trim(); changed(); refreshPanel(); return; }
  if (el.name === 'mod-axis') { const o = one(), m = modAt(o, S.stackSel); if (m) { edit(() => { m.axis = el.value; }); } return; }
  paramInput(el, true);
});
cmdPage.addEventListener('input', e => paramInput(e.target, false));
function paramInput(el, commit) {
  const m = /^(bp|mp)-(\w+)$/.exec(el.id || ''); if (!m) return;
  const o = m[1] === 'bp' && max.state.tab === 'create' ? SC.find(S.st, S.lastMade) : one(); if (!o) return;
  if (el.value === '' || !Number.isFinite(+el.value)) return;
  if (!S.pending) S.pending = JSON.stringify(S.st);
  if (m[1] === 'bp') { const b = SC.baseOf(S.st, o), v = cleanParam(b.type, m[2], el.value); if (v == null) return; b.params[m[2]] = v; }
  else { const md = modAt(o, S.stackSel); if (!md) return; md[m[2]] = +(+el.value).toFixed(3); }
  draw();
  if (commit) { pushUndo(S.pending); S.pending = null; saveData(); checkProgress(); }
}

// ─── Clone Options (Shift + transform, Edit › Clone) ────────────────────────
function cloneOptions(ids, x) {
  const n0 = SC.find(S.st, ids[0]).name.replace(/\d+$/, '');
  const d = max.dialog('Clone Options', `<div class="clone-cols"><fieldset><legend>Object</legend><div class="mx-radios v">${[['copy', 'Copy'], ['instance', 'Instance'], ['reference', 'Reference']].map(([k, n], i) => `<label><input type="radio" name="cl-mode" value="${k}"${i === 0 ? ' checked' : ''}> ${n}</label>`).join('')}</div></fieldset><fieldset><legend>Controller</legend><div class="mx-radios v dim"><label><input type="radio" checked disabled> Copy</label><label><input type="radio" disabled> Instance</label></div></fieldset></div>
    ${x ? `<label class="mx-field">Number of Copies: ${spinner({ id: 'cl-n', value: 1, step: 1, min: 1, max: 100, decimals: 0, width: 70 })}</label>` : ''}<label class="mx-field">Name: <input type="text" class="mx-text" id="cl-name" value="${esc(SC.nextName(S.st, n0))}" ${ids.length > 1 ? 'disabled' : ''}></label>`,
  dd => {
    const mode = dd.querySelector('input[name=cl-mode]:checked').value, n = x ? Math.max(1, Math.round(+dd.querySelector('#cl-n').value || 1)) : 1, name = dd.querySelector('#cl-name').value.trim();
    pushUndo();
    const made = SC.cloneSelection(S.st, ids, mode, n, (c, k) => { if (x) { const tmp = { ...x, ids: [c.id] }; for (let j = 0; j < k; j++) applyDelta([c.id], { ...x.last }, tmp); } });
    if (ids.length === 1 && n === 1 && name && name !== made[0]) SC.rename(S.st, made[0], name);
    S.st.sel = made.slice(-ids.length).map(id => ids.length === 1 && n === 1 && name && SC.find(S.st, name) ? name : id).filter(id => SC.find(S.st, id)); // the last clones are selected, as in 3ds Max
    changed(); refreshPanel();
    msg(tr('{n} clones: {m}.', { n: made.length, m: { copy: 'Copy', instance: 'Instance', reference: 'Reference' }[mode] }));
  }, { width: 330 });
  d.addEventListener('close', () => { if (d.returnValue !== 'ok') { draw(); msg('Clone cancelled: nothing changed.'); } }, { once: true });
}

// ─── Tools › Array ──────────────────────────────────────────────────────────
function arrayDialog() {
  const o = one(); if (!o || SC.isGroup(o)) return msg('Select one object for Array.', true);
  const sp = (id, v, step = 0.1, dec = 3, w = 72) => spinner({ id, value: v, step, decimals: dec, width: w });
  const d = max.dialog('Array', `<fieldset><legend>Array Transformation: World Coordinates (Use Pivot Point Center)</legend>
    <div class="arr-grid"><span></span><b>X</b><b>Y</b><b>Z</b><span></span>
      <span>Move</span>${sp('ar-mx', 0)}${sp('ar-my', 0)}${sp('ar-mz', 0)}<span>m</span>
      <span>Rotate</span>${sp('ar-rx', 0, 1, 1)}${sp('ar-ry', 0, 1, 1)}${sp('ar-rz', 0, 1, 1)}<span>deg.</span>
      <span>Scale</span>${sp('ar-sx', 100, 1, 1)}${sp('ar-sy', 100, 1, 1)}${sp('ar-sz', 100, 1, 1)}<span>%</span></div><p class="mx-note">Incremental: each copy adds these values to the one before.</p></fieldset>
    <div class="clone-cols"><fieldset><legend>Type of Object</legend><div class="mx-radios v">${[['copy', 'Copy'], ['instance', 'Instance'], ['reference', 'Reference']].map(([k, n], i) => `<label><input type="radio" name="ar-mode" value="${k}"${i === 1 ? ' checked' : ''}> ${n}</label>`).join('')}</div></fieldset>
    <fieldset><legend>Array Dimensions</legend><div class="arr-dims"><span></span><b>Count</b><b>X</b><b>Y</b><b>Z</b>
      <label><input type="radio" name="ar-dims" value="1" checked> 1D</label>${sp('ar-n1', 10, 1, 0, 58)}<span></span><span></span><span></span>
      <label><input type="radio" name="ar-dims" value="2"> 2D</label>${sp('ar-n2', 1, 1, 0, 58)}${sp('ar-2x', 0, 0.1, 3, 62)}${sp('ar-2y', 0, 0.1, 3, 62)}${sp('ar-2z', 0, 0.1, 3, 62)}
      <label class="dim"><input type="radio" disabled> 3D</label></div><p class="mx-field">Total in Array: <b id="ar-total">10</b></p></fieldset></div>`,
  dd => {
    const v = id => +dd.querySelector('#' + id).value || 0, dims = +dd.querySelector('input[name=ar-dims]:checked').value;
    const opts = { move: [v('ar-mx'), v('ar-my'), v('ar-mz')], rot: [v('ar-rx'), v('ar-ry'), v('ar-rz')], scale: [v('ar-sx') || 100, v('ar-sy') || 100, v('ar-sz') || 100], count1: v('ar-n1'), count2: v('ar-n2'), move2: [v('ar-2x'), v('ar-2y'), v('ar-2z')], dims, mode: dd.querySelector('input[name=ar-mode]:checked').value };
    const total = Math.round(opts.count1) * (dims === 2 ? Math.round(opts.count2) : 1);
    if (total > 400) return msg('Array: more than 400 objects is too many for this lab.', true);
    pushUndo(); const made = SC.arrayObject(S.st, o.id, opts); changed(); refreshPanel();
    msg(tr('Array: {n} objects in all ({m} new).', { n: made.length + 1, m: made.length }));
  }, { width: 560 });
  const tot = () => { const dims = +d.querySelector('input[name=ar-dims]:checked').value; d.querySelector('#ar-total').textContent = Math.max(1, Math.round(+d.querySelector('#ar-n1').value || 1)) * (dims === 2 ? Math.max(1, Math.round(+d.querySelector('#ar-n2').value || 1)) : 1); };
  d.addEventListener('input', tot); d.addEventListener('change', tot);
  d.addEventListener('close', () => { d.removeEventListener('input', tot); d.removeEventListener('change', tot); }, { once: true }); // the kit reuses one dialog element
}

// ─── Group menu, Select From Scene, coordinate systems, quad menu ────────────
function groupDialog() {
  const ids = sel(); if (!ids.length) return msg('Select the objects to group first.', true);
  max.dialog('Group', `<label class="mx-field">Group name: <input type="text" class="mx-text" id="gr-name" value="${esc(SC.nextName(S.st, 'Group'))}"></label>`, dd => {
    const name = dd.querySelector('#gr-name').value.trim() || SC.nextName(S.st, 'Group');
    if (SC.find(S.st, name)) return msg('That name is already used.', true);
    edit(() => { const g = SC.groupObjects(S.st, ids, name); S.st.sel = [g.id]; }); refreshPanel();
    msg(tr('Group {g}: {n} objects. A click on any of them selects the whole group.', { g: name, n: ids.length }));
  }, { width: 300 });
  setTimeout(() => $('#gr-name')?.select());
}
function groupOp(op) {
  const g = one() || (sel().length ? SC.find(S.st, SC.find(S.st, sel()[0])?.parent || '') : null);
  const grp = SC.isGroup(g) ? g : g?.parent ? SC.find(S.st, g.parent) : null;
  if (!grp) return msg('Select a group first.', true);
  if (op === 'ungroup') { edit(() => { S.st.sel = SC.ungroup(S.st, grp.id); }); msg(tr('Ungrouped {g}.', { g: grp.name })); }
  if (op === 'open') { edit(() => { grp.open = true; S.st.sel = []; }); msg(tr('{g} is open: its parts can be selected one by one. Group › Close when you finish.', { g: grp.name })); }
  if (op === 'close') { edit(() => { grp.open = false; S.st.sel = [grp.id]; }); msg(tr('{g} closed.', { g: grp.name })); }
  refreshPanel();
}
function selectByNameDialog() {
  const rows = S.st.objs.filter(o => !o.parent || SC.find(S.st, o.parent)?.open).map(o => `<label class="mx-sfs-row${SC.selectable(S.st, o) ? '' : ' dim'}"><input type="checkbox" value="${esc(o.id)}"${sel().includes(o.id) ? ' checked' : ''}${SC.selectable(S.st, o) ? '' : ' disabled'}><span class="mx-kind">${icon(SC.isGroup(o) ? 'seGroup' : 'seGeometry')}</span>${esc(o.name)}${o.hidden ? ' <i class="mx-dim">(hidden)</i>' : ''}${o.frozen ? ' <i class="mx-dim">(frozen)</i>' : ''}</label>`).join('');
  max.dialog('Select From Scene', `<div class="mx-sfs"><div class="mx-sfs-head">Name <small>(Ctrl-click in the list: tick several)</small></div>${rows}</div>`, dd => setSelection([...dd.querySelectorAll('input:checked')].map(i => i.value), 'Select From Scene'), { ok: 'OK', width: 320 });
}
const COORDS = ['view', 'screen', 'world', 'parent', 'local', 'gimbal', 'grid', 'working', 'localAligned', 'pick'];
const COORD_LABEL = { view: 'View', screen: 'Screen', world: 'World', parent: 'Parent', local: 'Local', gimbal: 'Gimbal', grid: 'Grid', working: 'Working', localAligned: 'Local Aligned', pick: 'Pick' };
function refCoordMenu(e) {
  const b = $('#mx-refcoord'), r = b.getBoundingClientRect();
  max.openPopup(r.left, r.bottom, COORDS.map(k => ({ label: COORD_LABEL[k], checked: S.coord === k, dim: !['view', 'screen', 'world', 'local'].includes(k), run: () => { S.coord = k; max.setRefCoord(COORD_LABEL[k]); draw(); msg(tr('Reference Coordinate System: {c}.', { c: COORD_LABEL[k] })); } })));
}
function quadMenu(e) {
  const has = sel().length > 0;
  max.openPopup(e.clientX, e.clientY, [
    { label: 'Isolate Selection', dim: true }, { label: 'Unfreeze All', run: () => dispOp('unfreezeAll') }, { label: 'Freeze Selection', run: () => dispOp('freezeSel'), disabled: !has },
    { label: 'Unhide All', run: () => dispOp('unhideAll') }, { label: 'Hide Unselected', run: () => dispOp('hideUnsel'), disabled: !has }, { label: 'Hide Selection', run: () => dispOp('hideSel'), disabled: !has },
    { sep: true },
    { label: 'Move', run: ACTIONS.move }, { label: 'Rotate', run: ACTIONS.rotate }, { label: 'Scale', run: ACTIONS.scale }, { label: 'Select', run: ACTIONS.select }, { label: 'Clone', run: ACTIONS.cloneDialog, disabled: !has },
    { label: 'Object Properties...', dim: true },
  ]);
}

// ─── Tools and toolbar state ────────────────────────────────────────────────
function setTool(tool) {
  if (S.xf) endTransform(false); if (S.create) { S.create = null; S.making = null; refreshPanel(); }
  if (tool === 'scale' && S.tool === 'scale') msg('Select and Scale: 3ds Max cycles Uniform, Non-uniform and Squash when you press R again. This lab uses the gizmo parts instead.');
  S.tool = tool; syncToolbar(); draw();
}
function setAxis(a) { S.axis = a; syncToolbar(); draw(); msg(tr('Restrict to {a}', { a: a.toUpperCase() })); }
function syncToolbar() {
  max.setModes({ tool: S.tool, silent: true });
  const set = (id, on, title) => { const b = max.root.querySelector(`.mx-tb[data-id="${id}"]`); if (!b) return; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); if (title) b.title = title; };
  set('crossing', !S.crossing, S.crossing ? 'Window/Crossing: Crossing (click for Window)' : 'Window/Crossing: Window (click for Crossing)');
  set('absolute', !S.absolute, S.absolute ? 'Absolute Mode Transform Type-In (click for Offset)' : 'Offset Mode Transform Type-In (click for Absolute)');
  set('angleSnap', S.angleSnap); set('region', true);
  set('maximize', S.maxed);
}
// Seen marks: the face of a mark points to the camera and is inside the view of a perspective viewport.
function checkMarks() {
  if (!S.markFaces || step().id !== 'n2') return;
  let got = false;
  for (const P of panes) {
    if (P.el.hidden || isOrtho(P)) continue;
    const cam = P.vp.camera.position, c3 = new THREE.Vector3();
    for (const [k, f] of Object.entries(S.markFaces)) {
      if (!f.world || S.st.flags.seen?.[k]) continue;
      const c = fromMax(...f.world.c), n = fromMax(...f.world.n), to = cam.clone().sub(c).normalize();
      const q = c3.copy(c).project(P.vp.camera);
      if (n.dot(to) > 0.45 && Math.abs(q.x) < 0.95 && Math.abs(q.y) < 0.95 && q.z < 1) { (S.st.flags.seen ||= {})[k] = true; got = true; }
    }
  }
  if (got) { saveData(); checkProgress(); syncScene(); schedule(); msg('Mark found.'); }
}

// ─── Stages, guide and step card ────────────────────────────────────────────
const dataKey = () => `step:${stage().id}-${step().id}`;
function saveData() { if (S.st) store.set(dataKey(), S.st); }
function loadData() {
  const saved = store.get(dataKey(), null);
  S.st = saved && Array.isArray(saved.objs) && saved.bases ? saved : startState(step());
  S.st.flags ||= {}; S.st.sel ||= []; S.st.ghosts ||= [];
}
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${stage().steps[i].id}`;
const stepDone = i => { const s = stage().steps[i]; if (s.free) return false; return i === S.step ? !!s.check(S.st) : !!S.done[doneKey(i)]; };
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.hidden = !!st.free; g.className = `guide${n === 3 ? ' three' : ''}`;
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(); });
function progressList() {
  const id = step().id, f = S.st.flags, row = (ok, text) => `<li class="${ok ? 'done' : ''}">${esc(t(text))}</li>`;
  if (id === 'n1') return row(f.act_top, 'Top active') + row(f.act_front, 'Front active') + row(f.act_left, 'Left active') + row(f.act_persp, 'Perspective active') + row(f.maxed, 'Perspective maximized (Alt+W)') + row(f.restored, 'Back to four viewports');
  if (id === 'n2') return MARKS.map(m => row(f.seen?.[m], { '+y': 'Mark on the back', '-x': 'Mark on the left side', '-z': 'Mark underneath' }[m])).join('');
  if (id === 'n3') return row(f.zoomSel, 'Z with Cone001 selected') + row(f.cubeFace, 'ViewCube: TOP face (Perspective)') + row(f.cubeHome, 'ViewCube: Home');
  if (id === 'n4') return row(f.view_t, 'T: Top') + row(f.view_f, 'F: Front') + row(f.view_l, 'L: Left') + row(f.view_p, 'P: Perspective') + row(f.orbitOrtho, 'A flat view orbited: Orthographic');
  if (id === 'c1') return ['Box', 'Sphere', 'Cylinder'].map(tp => row(created(S.st, tp), tp)).join('');
  if (id === 's4') return row(!!f.local, 'Moved with Local');
  if (id === 'c4') return row(!!f.bulbOff, 'A modifier switched off with its light bulb');
  return '';
}
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  const list = progressList();
  card.innerHTML = `<div><span class="control-label">${esc(st.free ? t('FREE PRACTICE') : tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, IN 3DS MAX'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol>${list ? `<ul class="ticks">${list}</ul>` : ''}</div>
    <div class="step-actions">${st.free ? '' : `<span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>`}
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); S.stackSel = null; S.lastMade = null; resetViews(); changed(); refreshPanel(); msg('Back to the start. Ctrl+Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st); changed(); refreshPanel(); resetViews(); msg('This is one possible solution. Ctrl+Z brings your work back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null, lastCard = '';
function checkProgress() {
  if (!S.st) return;
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) msg(tr('✓ Step done: {s}', { s: t(step().title) }));
  const key = `${S.stageIndex}|${S.step}|${ok}|${JSON.stringify(S.st.flags)}|${S.st.objs.length}|${document.documentElement.lang}`;
  if (key !== lastCard) { renderGuide(); renderStepCard(); lastCard = key; }
  lastOk = ok;
}
function enterStep() {
  if (S.xf) endTransform(false);
  S.create = null; S.making = null; S.region = null; S.stackSel = null; S.lastMade = null; S.undo = []; S.redo = [];
  loadData();
  lastOk = null; lastCard = '';
  renderStageSwitch();
  const tool = { s1: 'select', s2: 'move', s3: 'move', s4: 'move' }[step().id]; if (tool) S.tool = tool;
  S.coord = 'view'; max.setRefCoord('View');
  max.setObjects(objList(), sel()[sel().length - 1] ?? null); max.setSelection(sel());
  max.showTab({ c1: 'create' }[step().id] || 'modify');
  syncToolbar(); resetViews(); draw();
  lastOk = stepDone(S.step); checkProgress();
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); checkProgress(); });

// ─── Start ──────────────────────────────────────────────────────────────────
enterStep();
const gizmoPoint = (i, axis, k = 0.6) => { const P = panes[i]; P.gizmo.update(); P.gizmo.root.updateMatrixWorld(true); const d = { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] }[axis]; const w = P.gizmo.root.localToWorld(new THREE.Vector3(d[0] * k, d[1] * k, d[2] * k)), v = w.project(P.vp.camera), r = P.canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; };
const screenPt = (i, p) => { const q = screenOf(panes[i], p), r = panes[i].canvas.getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; };
window.__maxVp = { gizmoPoint, screenPt, S, panes, SC, max, draw, activate, setPaneView, toggleMaximize, zoomExtents, cubePick, cubeHome, setSelection, startCreate, addModifier, arrayDialog, groupOp, typeIn, setTool }; // test hooks
