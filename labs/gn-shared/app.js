// Carrot Revolt Labs · Geometry Nodes labs · a Blender-style Geometry Nodes workspace.
// Spreadsheet, 3D Viewport, Geometry Node Editor, Outliner and Properties, with Blender's own interaction:
// Shift A, drag to connect, drop on a wire to insert, Ctrl Shift click for the Viewer, Ctrl RMB to cut, M, X, Ctrl X, G, Shift D, N.
import { NODES, makeNode, makeLink, addLink, canLink, socketOf, expose, removeExposed, evaluate, visibleInputs, visibleOutputs, describeGeometry, isField, MAT, LAB_OBJECTS, statsOf, edgeCount, convertible } from './core.js';
import { LABS } from './curriculum.js';
import { NODE_DOCS, WARN, UI, LEGEND, SHORTCUTS } from './docs.js';
import { createPreview } from './preview.js';
import { ICONS, outlinerHTML } from '../../blender-ui.js';
import { getLang, onLangChange, initI18n } from '../../i18n.js';

const $ = (q, r = document) => r.querySelector(q), $$ = (q, r = document) => [...r.querySelectorAll(q)];
const lab = Number(document.body.dataset.lab), LESSON = LABS[lab];
const KEY = `carrot-revolt-gn:${lab}:`;
const T = v => typeof v === 'string' ? v : (v?.[getLang()] ?? v?.en ?? '');
const U = (k, vars) => { let s = T(UI[k]); if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = v => JSON.parse(JSON.stringify(v));
const OBJ = LAB_OBJECTS[lab].object;
const D = 180 / Math.PI;

/* ── Icons that the shared kit does not have ── */
const svg = b => `<svg class="bi" viewBox="0 0 16 16" aria-hidden="true">${b}</svg>`;
const IC = {
  ...ICONS,
  gn: svg('<rect x="1.5" y="2.5" width="5" height="4" rx="1" fill="none" stroke="#00d6a3" stroke-width="1.2"/><rect x="9.5" y="9.5" width="5" height="4" rx="1" fill="none" stroke="#00d6a3" stroke-width="1.2"/><path d="M6.5 4.5c3 0 0 7 3 7" fill="none" stroke="#00d6a3" stroke-width="1.2"/>'),
  sheet: svg('<rect x="2" y="2.5" width="12" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2 6h12M2 9.5h12M6 2.5v11" stroke="currentColor" stroke-width="1.1"/>'),
  eye: svg('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2" fill="currentColor"/>'),
  eyeOff: svg('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".45"/><path d="M3 13 13 3" stroke="currentColor" stroke-width="1.2"/>'),
  monitor: svg('<rect x="2" y="3" width="12" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 13.5h4M8 11v2.5" stroke="currentColor" stroke-width="1.2"/>'),
  camera: svg('<path d="M2 5h8.5v7H2z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="m10.5 7.5 3.5-2v6l-3.5-2" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  editm: svg('<path d="M3 13V8l5-5 5 5v5z" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="2" y="12" width="2.4" height="2.4" fill="currentColor"/><rect x="11.6" y="12" width="2.4" height="2.4" fill="currentColor"/><rect x="6.8" y="2" width="2.4" height="2.4" fill="currentColor"/>'),
  shield: svg('<path d="M8 1.8 13 4v4c0 3-2.2 5.2-5 6.2C5.2 13.2 3 11 3 8V4z" fill="none" stroke="currentColor" stroke-width="1.1"/>'),
  copy: svg('<rect x="5" y="5" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M3 10.5V3h7.5" fill="none" stroke="currentColor" stroke-width="1.1"/>'),
  x: svg('<path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3"/>'),
  pin: svg('<path d="M9.5 2 14 6.5l-2 .5-2.5 2.5.5 3-1 1-3-3-3.5 3.5-.5-.5L5.5 10l-3-3 1-1 3 .5L9 4z" fill="none" stroke="currentColor" stroke-width="1"/>'),
  warn: svg('<path d="M8 1.8 15 14H1z" fill="#e7a21c"/><path d="M8 6v4" stroke="#1b1b1b" stroke-width="1.6"/><circle cx="8" cy="12" r=".9" fill="#1b1b1b"/>'),
  blender: svg('<circle cx="9.6" cy="9.3" r="4.3" fill="none" stroke="#e87d0d" stroke-width="1.9"/><circle cx="9.6" cy="9.3" r="1.6" fill="#265787"/><path d="M1.3 7.9 6.5 4.2M3.7 3.1h5" stroke="#e87d0d" stroke-width="1.8" stroke-linecap="round"/>'),
  plus: svg('<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.3"/>'),
};
const ic = n => IC[n] || '';

/* ── State ── */
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY + 'state')) || {}; } catch { /* storage unavailable */ }
const steps = LESSON.steps;
const S = {
  step: Number.isInteger(saved.step) && saved.step >= 0 && saved.step < steps.length ? saved.step : 0,
  graphs: Array.isArray(saved.graphs) ? saved.graphs : [], done: Array.isArray(saved.done) ? saved.done : [], flags: Array.isArray(saved.flags) ? saved.flags : [],
  sel: new Set(), active: null, sheetMode: 'evaluated', sheetDomain: null, sidebar: false, sideTab: 'Node', modViewport: true, wire: true, viewerOn: true,
  undo: [], redo: [], note: '',
};
for (let i = 0; i < steps.length; i++) { if (!S.graphs[i]?.nodes) S.graphs[i] = steps[i].starter(); S.flags[i] ||= {}; S.done[i] = !!S.done[i]; }
const graph = () => S.graphs[S.step], step = () => steps[S.step], flags = () => S.flags[S.step];
const save = () => { try { localStorage.setItem(KEY + 'state', JSON.stringify({ step: S.step, graphs: S.graphs, done: S.done, flags: S.flags })); } catch { /* private mode */ } };
const nodeById = id => graph().nodes.find(n => n.id === id);
let result = null, preview = null;

/* ── Shell ── */
const WIDTH = { GroupInput: 130, GroupOutput: 130, Viewer: 130, Position: 120, Normal: 120, Index: 120, Value: 130, TransformGeometry: 170, DistributePoints: 200, InstanceOnPoints: 180, CollectionInfo: 175, RandomValue: 155, CurveToPoints: 165, CurveToMesh: 160, VectorMath: 160, Math: 150, CombineXYZ: 135, SeparateXYZ: 135, EulerToRotation: 150, SetPosition: 155, Grid: 145, Cube: 145, UVSphere: 145, CurveLine: 150, CurveCircle: 150, QuadraticBezier: 155, JoinGeometry: 150, ResampleCurve: 155, RealizeInstances: 160 };
const MENU = ['Input', 'Output', 'Geometry', 'Curve', 'Instances', 'Mesh', 'Point', 'Utilities'];
function shell() {
  document.title = `${T(LESSON.title)} · Carrot Revolt Labs`;
  const series = Object.values(LABS).map(l => `<a class="${l === LESSON ? 'active' : ''}" href="../${l.slug}/"><b>GN ${l.number}</b><span>${esc(T(l.short))}</span></a>`).join('');
  const tabs = ['Layout', 'Modeling', 'Sculpting', 'UV Editing', 'Texture Paint', 'Shading', 'Animation', 'Rendering', 'Compositing', 'Geometry Nodes', 'Scripting'];
  document.body.innerHTML = `
  <header class="site-header"><a class="brand" href="../../" aria-label="Carrot Revolt Labs home"><span class="brand-mark">CARROT<span>REVOLT LABS</span></span></a><span class="header-rule" aria-hidden="true"></span><div class="header-title"><span class="header-label">INTERACTIVE STUDIES / GN ${LESSON.number}</span><strong>${esc(T(LESSON.title))}</strong></div><a class="home-link" href="../../#blender">${esc(U('all'))}</a></header>
  <main>
    <section class="lab-top"><div class="lab-lead"><span class="eyebrow">${esc(U('series'))}</span><h1>${T(LESSON.headline)}</h1><p>${T(LESSON.lead)}</p></div><nav class="series" aria-label="Geometry Nodes labs">${series}</nav></section>
    <ol class="guide" id="guide" aria-label="Steps"></ol>
    <section class="below"><div class="step-card" id="step-card"></div></section>
    <section class="bl" id="workspace" aria-label="Blender-style Geometry Nodes workspace">
      <div class="bl-top" data-no-i18n><span class="bl-logo">${ic('blender')}</span><nav class="bl-menus"><span>File</span><span>Edit</span><span>Render</span><span>Window</span><span>Help</span></nav><div class="bl-tabs">${tabs.map(t => `<span class="${t === 'Geometry Nodes' ? 'on' : ''}">${t}</span>`).join('')}</div><span class="bl-scene">${ic('scene_collection')} Scene</span><span class="bl-scene">${ic('view_layer')} ViewLayer</span></div>
      <div class="bl-grid">
        <section class="area sheet" aria-label="Spreadsheet"><div class="ehead" data-no-i18n><span class="bh-dd bh-editor" title="Editor Type: Spreadsheet">${ic('sheet')}${ic('dropdown')}</span><span class="emenu">View</span><span class="sheet-crumbs" id="sheet-crumbs"></span><span class="espacer"></span><label class="bh-dd sheet-mode">${ic('dropdown')}<select id="sheet-mode" aria-label="Object Evaluation State"><option value="evaluated">Evaluated</option><option value="original">Original</option><option value="viewer">Viewer Node</option></select></label></div><div class="sheet-body"><nav class="sheet-domains" id="sheet-domains" data-no-i18n></nav><div class="sheet-table" id="sheet-table"></div></div><div class="sheet-foot" id="sheet-foot" data-no-i18n></div></section>
        <section class="area vp" aria-label="3D Viewport"><div class="ehead" data-no-i18n><span class="bh-dd bh-editor" title="Editor Type: 3D Viewport">${ic('view3d')}${ic('dropdown')}</span><span class="bh-dd">${ic('objectmode')}<span>Object Mode</span>${ic('dropdown')}</span><span class="emenu">View</span><span class="emenu">Select</span><span class="emenu">Add</span><span class="emenu">Object</span><span class="espacer"></span><span class="bh-group"><button type="button" class="bh-ico" id="vp-wire" title="Overlays › Wireframe" aria-pressed="true">${ic('overlay')}</button></span><span class="bh-sep"></span><span class="bh-group"><button type="button" class="bh-ico" title="Wireframe" disabled>${ic('shading_wire')}</button><button type="button" class="bh-ico" aria-pressed="true" title="Solid">${ic('shading_solid')}</button><button type="button" class="bh-ico" title="Material Preview" disabled>${ic('shading_texture')}</button><button type="button" class="bh-ico" title="Rendered" disabled>${ic('shading_rendered')}</button></span></div><div class="vp-canvas" id="vp-canvas"><div class="vp-text" id="vp-text" data-no-i18n></div><svg class="vp-gizmo" id="vp-gizmo" viewBox="0 0 80 80" aria-hidden="true"></svg><div class="vp-note" id="vp-note"></div></div></section>
        <section class="area ne" aria-label="Geometry Node Editor"><div class="ehead" data-no-i18n><span class="bh-dd bh-editor" title="Editor Type: Geometry Node Editor">${ic('node')}${ic('dropdown')}</span><button type="button" class="emenu" data-menu="View">View</button><button type="button" class="emenu" data-menu="Select">Select</button><button type="button" class="emenu" data-menu="Add">Add</button><button type="button" class="emenu" data-menu="Node">Node</button><span class="espacer"></span><span class="bh-dd">${ic('modifier')}<span>Modifier</span>${ic('dropdown')}</span><span class="ne-tree">${ic('gn')}<b>Geometry Nodes</b><i title="Fake User">${ic('shield')}</i><i title="Duplicate">${ic('copy')}</i><i title="Unlink">${ic('x')}</i></span><span class="bh-group"><button type="button" class="bh-ico soft" title="Pin">${ic('pin')}</button></span><span class="espacer"></span><span class="bh-group"><button type="button" class="bh-ico" id="ne-n" title="Sidebar (N)" aria-pressed="false">N</button></span></div>
          <div class="ne-view" id="ne-view" tabindex="0" aria-label="Node tree"><div class="ne-crumbs" data-no-i18n>${ic('ob_mesh')} ${OBJ} <span>›</span> ${ic('modifier')} GeometryNodes <span>›</span> ${ic('gn')} Geometry Nodes</div><div class="ne-world" id="ne-world"><svg class="ne-wires" id="ne-wires" width="8000" height="6000" aria-hidden="true"></svg><div id="ne-nodes"></div></div><svg class="ne-overlay" id="ne-overlay" aria-hidden="true"></svg><aside class="ne-side" id="ne-side" hidden><nav class="ne-side-tabs" id="ne-side-tabs"></nav><div class="ne-side-body" id="ne-side-body"></div></aside><div class="ne-msg" id="ne-msg" role="status" aria-live="polite"></div></div></section>
        <section class="area right" aria-label="Outliner and Properties"><div id="outliner"></div><div class="props"><nav class="props-tabs" data-no-i18n>${['tab_tool', 'tab_render', 'tab_output', 'tab_viewlayer', 'tab_scene', 'tab_world', 'tab_object', 'tab_modifier', 'tab_particles', 'tab_physics', 'tab_constraint', 'tab_data', 'tab_material'].map(t => `<span class="${t === 'tab_modifier' ? 'on' : ''}" title="${t.slice(4)}">${ic(t)}</span>`).join('')}</nav><div class="props-body" id="props-body"></div></div></section>
      </div>
      <div class="bl-status" id="bl-status"></div>
    </section>
    <section class="concepts" id="concepts"></section>
    <footer><span>Carrot Revolt Labs · ${esc(T(LESSON.title))}</span><span class="foot-note">${esc(U('footerNote'))}</span><a href="https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/index.html" target="_blank" rel="noopener">${esc(U('sources'))}</a></footer>
  </main>
  <div class="gn-tip" id="gn-tip" hidden></div><div class="gn-menu" id="gn-menu" hidden></div>`;
}

/* ── Lesson panels ── */
function renderGuide() { $('#guide').innerHTML = steps.map((s, i) => `<li><button type="button" data-step="${i}" class="${i === S.step ? 'current' : ''} ${S.done[i] ? 'done' : ''}"><b>${S.done[i] ? '✓' : i + 1}</b><span>${esc(T(s.title))}</span></button></li>`).join(''); }
let goalState = [];
function renderCard() {
  const st = step(), done = S.done[S.step];
  const last = S.step === steps.length - 1, nextLab = Object.values(LABS)[lab];
  $('#step-card').classList.toggle('done', done);
  $('#step-card').innerHTML = `<div class="step-intro"><span class="eyebrow">GN ${LESSON.number} · ${esc(U('stepOf', { a: S.step + 1, b: steps.length }))}</span><h3>${esc(T(st.title))}</h3><p class="task"><b>${esc(U('task'))}</b> ${T(st.task)}</p><p class="concept"><b>${esc(U('whatsGoingOn'))}.</b> ${T(st.concept)}</p></div>
    <div class="step-how"><span class="eyebrow">${esc(U('how'))}</span><ol>${st.how.map(h => `<li>${T(h)}</li>`).join('')}</ol><p class="bnote"><b>${esc(U('blenderNote'))}:</b> ${T(st.blender)}</p></div>
    <div class="step-actions"><span class="eyebrow">${esc(U('checklist'))}</span><ul class="goals" id="goals"></ul><span class="step-state">${esc(done ? U('done') : U('notYet'))}</span>${done ? (last ? (nextLab ? `<a class="next" href="../${nextLab.slug}/">${esc(U('nextLab'))}</a>` : `<span class="next ghost">${esc(U('finished'))}</span>`) : `<button type="button" class="next" data-act="next">${esc(U('next'))}</button>`) : ''}<div class="act-row"><button type="button" data-act="solution">${esc(U('solution'))}</button><button type="button" data-act="reset">${esc(U('reset'))}</button></div>${S.note ? `<p class="step-note">${esc(S.note)}</p>` : ''}</div>`;
  renderGoals();
}
function renderGoals() {
  const el = $('#goals'); if (!el) return;
  el.innerHTML = step().goals.map((g, i) => `<li class="${goalState[i] ? 'ok' : ''} ${g.optional ? 'opt' : ''}"><i aria-hidden="true">${goalState[i] ? '✓' : ''}</i><span>${esc(T(g.text))}${g.optional ? ` <em>(${esc(U('optional'))})</em>` : ''}</span></li>`).join('');
}
function checkGoals() {
  const g = graph(), st = step();
  goalState = st.goals.map(x => { try { return !!x.test(g, result, flags()); } catch { return false; } });
  const ok = st.goals.every((x, i) => x.optional || goalState[i]);
  if (ok !== S.done[S.step]) { S.done[S.step] = ok; save(); renderGuide(); renderCard(); } else renderGoals();
}
function renderConcepts() {
  const legend = LEGEND.map(l => `<li><i class="lg-sock ${l.shape} t-${l.type}"></i><span>${T(l.text)}</span></li>`).join('');
  $('#concepts').innerHTML = `<div class="c-col"><h2>${esc(U('concepts'))}</h2><ul class="c-list">${LESSON.concepts.map(c => `<li>${T(c)}</li>`).join('')}</ul></div><div class="c-col"><h2>${esc(U('legend'))}</h2><ul class="c-legend">${legend}<li><svg width="44" height="10"><path d="M2 5h40" stroke="#a1a1a1" stroke-width="2.4" stroke-dasharray="5 3"/></svg><span>${T({ en: 'Dashed wire: a field travels along it.', ca: 'Connexió discontínua: hi viatja un camp.', es: 'Conexión discontinua: viaja un campo por ella.' })}</span></li><li><svg width="44" height="10"><path d="M2 5h40" stroke="#e33" stroke-width="2.4"/></svg><span>${T({ en: 'Red wire: invalid, a field into a single-value socket.', ca: 'Connexió vermella: no vàlida, un camp a un socket de valor únic.', es: 'Conexión roja: no válida, un campo en un socket de valor único.' })}</span></li></ul></div><div class="c-col"><h2>${esc(U('shortcuts'))}</h2><table class="c-keys">${SHORTCUTS.map(([k, t]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(T(t))}</td></tr>`).join('')}</table></div>`;
}

/* ── Evaluation ── */
const terrainKey = 'carrot-revolt-gn:terrain';
function inputGeometry() {
  if (lab !== 3) return null;
  try { const g = JSON.parse(localStorage.getItem(terrainKey)); return g?.mesh?.verts?.length ? g : null; } catch { return null; }
}
function recompute(opts = {}) {
  result = evaluate(graph(), { lab, inputGeometry: inputGeometry(), inspectAll: true });
  if (!S.viewerOn) result.viewer = null;
  // GN 02 hands its terrain to GN 03.
  if (lab === 2 && result.geometry.mesh && result.stats.maxZ - result.stats.minZ > .25 && result.geometry.mesh.verts.length >= 100) { try { localStorage.setItem(terrainKey, JSON.stringify({ mesh: result.geometry.mesh, points: [], curves: [], instances: [] })); } catch { /* full */ } }
  const f = flags();
  if (result.invalidLinks.size && !f.invalidSeen) { f.invalidSeen = true; save(); }
  if (lab === 3 && result.stats.instances === 0 && result.geometry.mesh && graph().nodes.some(n => n.type === 'RealizeInstances' && !n.muted) && result.geometry.mesh.verts.length > (inputGeometry()?.mesh.verts.length || 324) + 20) { if (!f.realizeSeen) { f.realizeSeen = true; save(); } }
  if (S.sheetMode === 'viewer' && !result.viewer) S.sheetMode = 'evaluated';
  if (opts.structure) renderNodes(); else decorate();
  drawWires(); renderSheet(); updateViewport(opts.frame); renderProps(); renderOutliner(); renderSidebar(); checkGoals();
}

/* ── Node editor: rendering ── */
let zoom = 1, panX = 40, panY = 40;
const fmt = (v, spec, axis) => {
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  const n = Number(v);
  if (spec?.type === 'rotation' || spec?.euler) return `${(n * D).toFixed(0)}°`;
  if (spec?.type === 'int') return `${Math.round(n)}`;
  if (spec?.unit === 'm') return `${+n.toFixed(3)} m`;
  return n.toFixed(3);
};
const UNIT_INT = new Set(['int']);
function socketShape(n, spec, dir) {
  if (spec.type === 'geometry' || spec.type === 'collection') return 'circle';
  if (dir === 'out') {
    if (n.type === 'GroupInput') { const e = graph().exposed?.find(x => x.id === spec.key); const t = e && socketOf(graph(), e.targetNode, e.targetSocket, 'in'); return t?.field ? 'diamond-dot' : 'circle'; }
    const v = result?.memo.get(`${n.id}:${spec.key}`);
    if (isField(v)) return 'diamond';
    return spec.field ? 'diamond-dot' : 'circle';
  }
  if (!spec.field) return 'circle';
  const l = graph().links.find(x => x.to === n.id && x.input === spec.key);
  if (l) return isField(result?.memo.get(`${l.from}:${l.out}`)) ? 'diamond' : 'diamond-dot';
  return spec.implicit ? 'diamond' : 'diamond-dot';
}
const linkedIn = (id, key) => graph().links.filter(l => l.to === id && l.input === key);
function sockHtml(n, spec, dir) {
  const links = dir === 'in' ? linkedIn(n.id, spec.key) : [];
  const multi = spec.multi ? ` multi" style="--n:${Math.max(1, links.length)}` : '';
  return `<i class="gn-sock ${dir} t-${spec.type} ${socketShape(n, spec, dir)}${multi}" data-sock="${esc(n.id)}|${esc(spec.key)}" data-dir="${dir}"></i>`;
}
function fieldHtml(n, spec, axis, label) {
  const raw = n.params[spec.key] ?? spec.value, v = axis == null ? raw : raw[axis];
  return `<div class="bf" data-param="${esc(n.id)}|${esc(spec.key)}"${axis != null ? ` data-axis="${axis}"` : ''} tabindex="0"><span class="bf-l">${esc(label)}</span><span class="bf-v">${esc(fmt(v, spec))}</span></div>`;
}
function inputHtml(n, spec) {
  const linked = linkedIn(n.id, spec.key).length > 0, sock = sockHtml(n, spec, 'in');
  if (linked || !('value' in spec) || spec.hideValue || spec.type === 'geometry') return `<div class="gn-row in${spec.multi ? ' multi-row' : ''}">${sock}<span class="lbl">${esc(spec.label)}</span></div>`;
  if (spec.type === 'bool') return `<div class="gn-row in">${sock}<label class="bchk"><input type="checkbox" data-bool="${esc(n.id)}|${esc(spec.key)}" ${n.params[spec.key] ? 'checked' : ''}><span class="box"></span><span>${esc(spec.label)}</span></label></div>`;
  if (spec.type === 'collection') return `<div class="gn-row in">${sock}<label class="bsel coll">${ic('collection')}<select data-coll="${esc(n.id)}|${esc(spec.key)}">${spec.options.map(o => `<option ${n.params[spec.key] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label></div>`;
  if (spec.type === 'vector' || spec.type === 'rotation') return `<div class="gn-row in vhead">${sock}<span class="lbl">${esc(spec.label)}</span></div><div class="bvec">${[0, 1, 2].map(i => fieldHtml(n, spec, i, 'XYZ'[i])).join('')}</div>`;
  return `<div class="gn-row in">${sock}${fieldHtml(n, spec, null, spec.label)}</div>`;
}
function nodeHtml(n) {
  const def = NODES[n.type], outs = visibleOutputs(n, graph()), ins = visibleInputs(n), w = WIDTH[n.type] || 150;
  const warn = result?.warnings[n.id];
  const sel = S.sel.has(n.id), act = S.active === n.id;
  let props = '';
  for (const [k, opts] of Object.entries(def.props || {})) props += `<label class="bsel"><select data-prop="${esc(n.id)}|${k}">${opts.map(o => `<option ${n.params[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
  if (n.type === 'Math') props += `<label class="bchk small"><input type="checkbox" data-prop-bool="${esc(n.id)}|clamp" ${n.params.clamp ? 'checked' : ''}><span class="box"></span><span>Clamp</span></label>`;
  if (n.type === 'Value') props += `<div class="bf" data-param="${esc(n.id)}|value" tabindex="0"><span class="bf-l"></span><span class="bf-v">${fmt(n.params.value)}</span></div>`;
  const outRows = outs.map(s => `<div class="gn-row out"><span class="lbl">${esc(s.label)}</span>${sockHtml(n, s, 'out')}</div>`).join('');
  const ext = n.type === 'GroupInput' ? `<div class="gn-row out ext"><span class="lbl"></span><i class="gn-sock out ext" data-sock="${esc(n.id)}|__ext" data-dir="out" title="${esc(U('dragToExpose'))}"></i></div>` : '';
  const viewerEye = n.type === 'Viewer' ? `<button type="button" class="gn-eye" data-viewer-eye title="Viewer">${ic(S.viewerOn ? 'eye' : 'eyeOff')}</button>` : '';
  return `<article class="gn-node c-${def.cls}${sel ? ' sel' : ''}${act ? ' act' : ''}${n.muted ? ' muted' : ''}" data-node="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${w}px">
    <header class="gn-head"><span class="gn-tri">▾</span><span class="gn-title">${esc(def.name)}</span>${warn ? `<span class="gn-warn" data-warn="${esc(n.id)}">${ic('warn')}</span>` : ''}${viewerEye}</header>
    <div class="gn-body">${outRows}${ext}${props ? `<div class="gn-props">${props}</div>` : ''}${ins.map(s => inputHtml(n, s)).join('')}</div></article>`;
}
function renderNodes() { $('#ne-nodes').innerHTML = graph().nodes.map(nodeHtml).join(''); }
// Update socket shapes, warnings and selection without rebuilding the DOM (keeps a dragged field alive).
function decorate() {
  for (const el of $$('.gn-sock[data-sock]')) {
    const [id, key] = el.dataset.sock.split('|'), n = nodeById(id); if (!n || key === '__ext') continue;
    const spec = socketOf(graph(), id, key, el.dataset.dir); if (!spec) continue;
    el.classList.remove('circle', 'diamond', 'diamond-dot'); el.classList.add(socketShape(n, spec, el.dataset.dir));
  }
  for (const el of $$('.gn-node')) {
    const id = el.dataset.node, w = result?.warnings[id], head = $('.gn-head', el), cur = $('.gn-warn', head);
    if (w && !cur) $('.gn-title', head).insertAdjacentHTML('afterend', `<span class="gn-warn" data-warn="${esc(id)}">${ic('warn')}</span>`);
    if (!w && cur) cur.remove();
    el.classList.toggle('sel', S.sel.has(id)); el.classList.toggle('act', S.active === id); el.classList.toggle('muted', !!nodeById(id)?.muted);
  }
}
function worldRect() { return $('#ne-world').getBoundingClientRect(); }
function sockPos(id, key, dir, index = 0) {
  const el = $(`.gn-sock[data-sock="${CSS.escape(`${id}|${key}`)}"][data-dir="${dir}"]`); if (!el) return null;
  const r = el.getBoundingClientRect(), w = worldRect();
  if (el.classList.contains('multi')) { const n = linkedIn(id, key).length || 1, inner = r.height - 12 * zoom, ys = r.top + 6 * zoom + (n > 1 ? inner * index / (n - 1) : inner / 2); return { x: (r.left + r.width / 2 - w.left) / zoom, y: (ys - w.top) / zoom }; }
  return { x: (r.left + r.width / 2 - w.left) / zoom, y: (r.top + r.height / 2 - w.top) / zoom };
}
const bez = (a, b) => { const d = Math.max(40, Math.abs(b.x - a.x) * .5); return `M${a.x},${a.y} C${a.x + d},${a.y} ${b.x - d},${b.y} ${b.x},${b.y}`; };
const TYPE_COL = { geometry: '#00d6a3', float: '#a1a1a1', int: '#598c5c', bool: '#cca6d6', vector: '#6363c7', rotation: '#a663c7', collection: '#f5f5f5' };
let insertCandidate = null;
function drawWires() {
  const svgEl = $('#ne-wires'); if (!svgEl) return;
  let html = '';
  const multiIndex = new Map();
  for (const l of graph().links) {
    const k = `${l.to}|${l.input}`, idx = multiIndex.get(k) || 0; multiIndex.set(k, idx + 1);
    const a = sockPos(l.from, l.out, 'out'), b = sockPos(l.to, l.input, 'in', idx); if (!a || !b) continue;
    const spec = socketOf(graph(), l.from, l.out, 'out'), v = result?.memo.get(`${l.from}:${l.out}`);
    const invalid = result?.invalidLinks.has(`${l.from}|${l.out}|${l.to}|${l.input}`), muted = nodeById(l.from)?.muted || nodeById(l.to)?.muted;
    const col = invalid ? '#ff4040' : TYPE_COL[spec?.type] || '#a1a1a1', isIns = insertCandidate === l;
    const sel = S.sel.has(l.from) || S.sel.has(l.to);
    html += `<path class="w-back" d="${bez(a, b)}"/><path class="w${isField(v) ? ' field' : ''}${isIns ? ' ins' : ''}${sel ? ' hi' : ''}${muted ? ' mutedw' : ''}" d="${bez(a, b)}" stroke="${col}"/>`;
  }
  // Wires that a muted node lets through, drawn inside the node in red, like Blender.
  for (const n of graph().nodes.filter(x => x.muted)) {
    const outs = visibleOutputs(n, graph()).filter(s => graph().links.some(l => l.from === n.id && l.out === s.key));
    for (const o of outs) { const i = visibleInputs(n).find(s => convertible(s.type, o.type) && linkedIn(n.id, s.key).length); if (!i) continue; const a = sockPos(n.id, i.key, 'in'), b = sockPos(n.id, o.key, 'out'); if (a && b) html += `<path class="w mute-through" d="${bez(a, b)}"/>`; }
  }
  if (drag?.kind === 'link' && drag.to) {
    const from = drag.from, a = from.dir === 'out' ? sockPos(from.id, from.key, 'out') : drag.to, b = from.dir === 'out' ? drag.to : sockPos(from.id, from.key, 'in');
    if (a && b) html += `<path class="w draft" d="${bez(a, b)}" stroke="${TYPE_COL[from.type] || '#ddd'}"/>`;
  }
  svgEl.innerHTML = html;
}
function applyView() { $('#ne-world').style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`; drawWires(); }
function frameAll(ids) {
  const view = $('#ne-view'), els = $$('.gn-node').filter(e => !ids || ids.includes(e.dataset.node)); if (!els.length || !view.clientWidth) return;
  const x0 = Math.min(...els.map(e => e.offsetLeft)) - 30, y0 = Math.min(...els.map(e => e.offsetTop)) - 50, x1 = Math.max(...els.map(e => e.offsetLeft + e.offsetWidth)) + 30, y1 = Math.max(...els.map(e => e.offsetTop + e.offsetHeight)) + 30;
  const side = S.sidebar ? 250 : 0;
  zoom = Math.max(.3, Math.min(1.1, (view.clientWidth - side) / (x1 - x0), view.clientHeight / (y1 - y0)));
  panX = (view.clientWidth - side - (x1 - x0) * zoom) / 2 - x0 * zoom; panY = (view.clientHeight - (y1 - y0) * zoom) / 2 - y0 * zoom; applyView();
}
const msg = t => { const el = $('#ne-msg'); el.innerHTML = t; el.classList.add('show'); clearTimeout(msg.t); msg.t = setTimeout(() => el.classList.remove('show'), 3200); };

/* ── Editing actions ── */
function snapshot() { S.undo.push(clone({ g: graph(), f: flags() })); if (S.undo.length > 60) S.undo.shift(); S.redo.length = 0; }
function restore(from, to) { if (!from.length) return; to.push(clone({ g: graph(), f: flags() })); const p = from.pop(); S.graphs[S.step] = p.g; S.flags[S.step] = p.f; S.sel.clear(); S.active = null; save(); recompute({ structure: true }); }
function changed(structure = true) { save(); recompute({ structure }); }
let counter = 1;
const newId = () => { while (graph().nodes.some(n => n.id === `n${counter}`)) counter++; return `n${counter++}`; };
function addNode(type, x, y) { const id = newId(); graph().nodes.push(makeNode(id, type, Math.round(x), Math.round(y))); S.sel = new Set([id]); S.active = id; return id; }
function deleteNodes(ids, reconnect = false) {
  const g = graph(); ids = ids.filter(id => !['GroupInput', 'GroupOutput'].includes(nodeById(id)?.type)); if (!ids.length) return;
  snapshot();
  for (const id of ids) {
    if (reconnect) {
      const inL = g.links.find(l => l.to === id && socketOf(g, id, l.input, 'in')?.type === socketOf(g, l.from, l.out, 'out')?.type), outs = g.links.filter(l => l.from === id);
      if (inL) for (const o of outs) { const t = socketOf(g, inL.from, inL.out, 'out')?.type, need = socketOf(g, o.to, o.input, 'in')?.type; if (t && convertible(t, need) && (t === 'geometry') === (need === 'geometry')) g.links.push(makeLink(inL.from, inL.out, o.to, o.input)); }
    }
    g.nodes = g.nodes.filter(n => n.id !== id); g.links = g.links.filter(l => l.from !== id && l.to !== id);
    for (const e of (g.exposed || []).filter(x => x.targetNode === id)) removeExposed(g, e.id);
  }
  S.sel.clear(); S.active = null; changed();
}
function duplicate() {
  const ids = [...S.sel].filter(id => !['GroupInput', 'GroupOutput'].includes(nodeById(id)?.type)); if (!ids.length) return;
  snapshot(); const map = {};
  for (const id of ids) { const n = nodeById(id), nid = newId(); map[id] = nid; graph().nodes.push({ ...clone(n), id: nid, x: n.x + 30, y: n.y + 30 }); }
  for (const l of graph().links.filter(l => map[l.from] && map[l.to])) graph().links.push(makeLink(map[l.from], l.out, map[l.to], l.input));
  for (const l of graph().links.filter(l => !map[l.from] && map[l.to])) graph().links.push(makeLink(l.from, l.out, map[l.to], l.input));
  S.sel = new Set(Object.values(map)); S.active = map[S.active] || Object.values(map)[0]; changed(); startGrab();
}
function toggleMute() { const ids = [...S.sel].filter(id => !['GroupInput', 'GroupOutput', 'Viewer'].includes(nodeById(id)?.type)); if (!ids.length) return; snapshot(); const on = !ids.every(id => nodeById(id).muted); ids.forEach(id => { nodeById(id).muted = on; }); if (on) msg(U('mutedNote')); changed(); }
function connect(from, to) {
  // from: an output socket, to: an input socket.
  const g = graph(), link = makeLink(from.id, from.key, to.id, to.key);
  if (!canLink(g, link)) { msg(U('badLink')); return false; }
  snapshot(); addLink(g, link); changed(); return true;
}
// Ctrl Shift click: connect a node to the Viewer, cycling through its outputs.
function linkToViewer(id) {
  const g = graph(), n = nodeById(id); if (!n || ['GroupOutput', 'Viewer'].includes(n.type)) return;
  const outs = visibleOutputs(n, g); if (!outs.length) return;
  snapshot();
  let v = g.nodes.find(x => x.type === 'Viewer');
  if (!v) { const out = g.nodes.find(x => x.type === 'GroupOutput'); v = makeNode(newId(), 'Viewer', out.x, out.y + 160); g.nodes.push(v); }
  const curr = g.links.filter(l => l.to === v.id && l.from === id).map(l => l.out), idx = curr.length ? (outs.findIndex(o => o.key === curr[0]) + 1) % outs.length : 0, o = outs[idx];
  g.links = g.links.filter(l => l.to !== v.id || (o.type !== 'geometry' && l.input === 'Geometry'));
  if (o.type === 'geometry') g.links.push(makeLink(id, o.key, v.id, 'Geometry'));
  else {
    addLink(g, makeLink(id, o.key, v.id, 'Value'));
    // Find the geometry this field is evaluated on: follow the wires downstream to the first node with a geometry input.
    const seen = new Set(), queue = [id]; let geo = null;
    while (queue.length && !geo) { const cur = queue.shift(); if (seen.has(cur)) continue; seen.add(cur); for (const l of g.links.filter(x => x.from === cur && x.to !== v.id)) { const t = nodeById(l.to), gin = visibleInputs(t).find(s => s.type === 'geometry'); const src = gin && g.links.find(x => x.to === t.id && x.input === gin.key); if (src) { geo = src; break; } queue.push(l.to); } }
    if (!geo) { const out = g.nodes.find(x => x.type === 'GroupOutput'); geo = g.links.find(l => l.to === out.id); }
    g.links = g.links.filter(l => !(l.to === v.id && l.input === 'Geometry'));
    if (geo) g.links.push(makeLink(geo.from, geo.out, v.id, 'Geometry'));
  }
  S.viewerOn = true; S.sheetMode = 'viewer'; flags().viewerUsed = true; changed();
}

/* ── Interaction ── */
let drag = null, grab = null, mouse = { x: 0, y: 0, cx: 0, cy: 0 };
const toWorld = (cx, cy) => { const r = worldRect(); return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom }; };
const sockInfo = el => { const [id, key] = el.dataset.sock.split('|'); return { id, key, dir: el.dataset.dir, ext: key === '__ext', type: key === '__ext' ? 'ext' : socketOf(graph(), id, key, el.dataset.dir)?.type }; };
function hitLink(p, ignore) {
  // The wire closest to a point (for inserting a dropped node).
  let best = null, bd = 22;
  const idx = new Map();
  for (const l of graph().links) {
    const k = `${l.to}|${l.input}`, i = idx.get(k) || 0; idx.set(k, i + 1);
    if (ignore.has(l.from) || ignore.has(l.to)) continue;
    const a = sockPos(l.from, l.out, 'out'), b = sockPos(l.to, l.input, 'in', i); if (!a || !b) continue;
    const d = Math.max(40, Math.abs(b.x - a.x) * .5);
    for (let t = 0; t <= 1; t += .04) { const u = 1 - t, x = u ** 3 * a.x + 3 * u * u * t * (a.x + d) + 3 * u * t * t * (b.x - d) + t ** 3 * b.x, y = u ** 3 * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * b.y, dd = Math.hypot(x - p.x, y - p.y); if (dd < bd) { bd = dd; best = l; } }
  }
  return best;
}
function insertCheck(id) {
  const n = nodeById(id), el = $(`.gn-node[data-node="${CSS.escape(id)}"]`); if (!n || !el) return null;
  const gin = visibleInputs(n).find(s => s.type === 'geometry'), gout = visibleOutputs(n, graph()).find(s => s.type === 'geometry');
  if (!gin || !gout || graph().links.some(l => l.from === id || l.to === id)) return null;
  const l = hitLink({ x: n.x + el.offsetWidth / 2, y: n.y + 14 }, new Set([id]));
  return l && socketOf(graph(), l.from, l.out, 'out')?.type === 'geometry' ? l : null;
}
function doInsert(id, l) {
  const n = nodeById(id), gin = visibleInputs(n).find(s => s.type === 'geometry'), gout = visibleOutputs(n, graph()).find(s => s.type === 'geometry');
  graph().links = graph().links.filter(x => x !== l); graph().links.push(makeLink(l.from, l.out, id, gin.key), makeLink(id, gout.key, l.to, l.input));
}
function startGrab(fromAdd = false) {
  const ids = [...S.sel]; if (!ids.length) return;
  grab = { ids, start: { ...mouse }, orig: ids.map(id => ({ id, x: nodeById(id).x, y: nodeById(id).y })), fromAdd };
  $('#ne-view').classList.add('grabbing');
}
function moveGrab() {
  if (!grab) return;
  const dx = (mouse.cx - grab.start.cx) / zoom, dy = (mouse.cy - grab.start.cy) / zoom;
  for (const o of grab.orig) { const n = nodeById(o.id); n.x = Math.round(o.x + dx); n.y = Math.round(o.y + dy); const el = $(`.gn-node[data-node="${CSS.escape(o.id)}"]`); if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px`; } }
  insertCandidate = grab.ids.length === 1 ? insertCheck(grab.ids[0]) : null; drawWires();
}
function endGrab(cancel) {
  if (!grab) return; const g = grab; grab = null; $('#ne-view').classList.remove('grabbing');
  if (cancel) { if (g.fromAdd) { graph().nodes = graph().nodes.filter(n => !g.ids.includes(n.id)); S.sel.clear(); S.undo.pop(); } else for (const o of g.orig) Object.assign(nodeById(o.id), { x: o.x, y: o.y }); insertCandidate = null; changed(); return; }
  if (insertCandidate) { doInsert(g.ids[0], insertCandidate); insertCandidate = null; }
  changed();
}
function setupEditor() {
  const view = $('#ne-view');
  view.addEventListener('contextmenu', e => e.preventDefault());
  view.addEventListener('pointerdown', e => {
    view.focus({ preventScroll: true }); hideTip();
    if (e.target.closest('.ne-side, .gn-menu')) return;
    mouse = { ...toWorld(e.clientX, e.clientY), cx: e.clientX, cy: e.clientY };
    if (grab) { e.preventDefault(); endGrab(e.button === 2); return; }
    if (e.button === 1 || (e.button === 0 && e.altKey)) { e.preventDefault(); drag = { kind: 'pan', x: e.clientX, y: e.clientY, px: panX, py: panY }; view.classList.add('panning'); return; }
    if (e.button === 2 && e.ctrlKey) { e.preventDefault(); drag = { kind: 'cut', pts: [{ x: e.clientX, y: e.clientY }] }; return; }
    if (e.button !== 0) return;
    if (e.target.closest('.bf, select, input, label.bchk, .gn-eye')) return;
    const sock = e.target.closest('.gn-sock[data-sock]');
    if (sock) {
      e.preventDefault(); const s = sockInfo(sock);
      if (s.dir === 'in' && !s.ext) {
        const existing = linkedIn(s.id, s.key);
        if (existing.length) { // Pick up the wire from the input, as in Blender.
          const l = existing.at(-1); snapshot(); graph().links = graph().links.filter(x => x !== l);
          drag = { kind: 'link', from: { id: l.from, key: l.out, dir: 'out', type: socketOf(graph(), l.from, l.out, 'out')?.type }, to: toWorld(e.clientX, e.clientY), picked: l }; recompute({ structure: true }); return;
        }
      }
      drag = { kind: 'link', from: s, to: toWorld(e.clientX, e.clientY) };
      highlightCompatible(s); return;
    }
    const nodeEl = e.target.closest('.gn-node');
    if (nodeEl) {
      e.preventDefault(); const id = nodeEl.dataset.node;
      if (e.ctrlKey && e.shiftKey) { linkToViewer(id); return; }
      if (e.shiftKey) { if (S.sel.has(id) && S.active === id) S.sel.delete(id); else S.sel.add(id); S.active = S.sel.has(id) ? id : null; }
      else if (!S.sel.has(id)) { S.sel = new Set([id]); }
      if (S.sel.has(id)) S.active = id;
      decorate(); drawWires(); renderSidebar();
      drag = { kind: 'node', x: e.clientX, y: e.clientY, moved: false };
      return;
    }
    // Empty space: box select.
    drag = { kind: 'box', x: e.clientX, y: e.clientY, add: e.shiftKey };
  });
  window.addEventListener('pointermove', e => {
    const view = $('#ne-view'); if (!view) return;
    mouse = { ...toWorld(e.clientX, e.clientY), cx: e.clientX, cy: e.clientY };
    if (grab) { moveGrab(); return; }
    if (!drag) return;
    if (drag.kind === 'pan') { panX = drag.px + e.clientX - drag.x; panY = drag.py + e.clientY - drag.y; applyView(); }
    if (drag.kind === 'link') { drag.to = toWorld(e.clientX, e.clientY); drawWires(); }
    if (drag.kind === 'node' && !drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { drag.moved = true; snapshot(); grab = { ids: [...S.sel], start: { cx: drag.x, cy: drag.y }, orig: [...S.sel].map(id => ({ id, x: nodeById(id).x, y: nodeById(id).y })) }; }
    if (drag.kind === 'node' && drag.moved) moveGrab();
    if (drag.kind === 'box' || drag.kind === 'cut') {
      const r = view.getBoundingClientRect(), ov = $('#ne-overlay');
      if (drag.kind === 'box') { const x = Math.min(drag.x, e.clientX) - r.left, y = Math.min(drag.y, e.clientY) - r.top; ov.innerHTML = `<rect x="${x}" y="${y}" width="${Math.abs(e.clientX - drag.x)}" height="${Math.abs(e.clientY - drag.y)}" class="box"/>`; }
      else { drag.pts.push({ x: e.clientX, y: e.clientY }); ov.innerHTML = `<polyline class="cut" points="${drag.pts.map(p => `${p.x - r.left},${p.y - r.top}`).join(' ')}"/>`; }
    }
  });
  window.addEventListener('pointerup', e => {
    if (!drag) return; const d = drag; drag = null; $('#ne-overlay').innerHTML = ''; $('#ne-view')?.classList.remove('panning'); clearCompatible();
    if (d.kind === 'node') { if (d.moved) { const g = grab; grab = null; if (g?.ids.length === 1 && insertCandidate) { doInsert(g.ids[0], insertCandidate); insertCandidate = null; } changed(); } return; }
    if (d.kind === 'box') {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) { if (!d.add) { S.sel.clear(); S.active = null; decorate(); drawWires(); renderSidebar(); } return; }
      const x0 = Math.min(d.x, e.clientX), x1 = Math.max(d.x, e.clientX), y0 = Math.min(d.y, e.clientY), y1 = Math.max(d.y, e.clientY);
      if (!d.add) S.sel.clear();
      for (const el of $$('.gn-node')) { const r = el.getBoundingClientRect(); if (r.right > x0 && r.left < x1 && r.bottom > y0 && r.top < y1) S.sel.add(el.dataset.node); }
      S.active = [...S.sel].at(-1) || null; decorate(); drawWires(); renderSidebar(); return;
    }
    if (d.kind === 'cut') {
      const pts = d.pts.map(p => toWorld(p.x, p.y)), cut = [];
      const idx = new Map();
      for (const l of graph().links) {
        const k = `${l.to}|${l.input}`, i = idx.get(k) || 0; idx.set(k, i + 1);
        const a = sockPos(l.from, l.out, 'out'), b = sockPos(l.to, l.input, 'in', i); if (!a || !b) continue;
        const dd = Math.max(40, Math.abs(b.x - a.x) * .5), curve = [];
        for (let t = 0; t <= 1.001; t += .05) { const u = 1 - t; curve.push({ x: u ** 3 * a.x + 3 * u * u * t * (a.x + dd) + 3 * u * t * t * (b.x - dd) + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * b.y }); }
        if (crosses(pts, curve)) cut.push(l);
      }
      if (cut.length) { snapshot(); graph().links = graph().links.filter(l => !cut.includes(l)); changed(); }
      return;
    }
    if (d.kind === 'link') {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.gn-sock[data-sock]');
      if (target) {
        const t = sockInfo(target), f = d.from;
        if (f.ext && t.dir === 'in' && !t.ext) { snapshot(); if (expose(graph(), t.id, t.key)) changed(); else { S.undo.pop(); msg(U('badLink')); } return; }
        if (t.ext && f.dir === 'in') { snapshot(); if (expose(graph(), f.id, f.key)) changed(); else { S.undo.pop(); msg(U('badLink')); } return; }
        if (f.dir === 'out' && t.dir === 'in' && !t.ext) { if (d.picked) { if (!addLink(graph(), makeLink(f.id, f.key, t.id, t.key))) msg(U('badLink')); changed(); } else connect(f, t); return; }
        if (f.dir === 'in' && t.dir === 'out' && !t.ext) { connect(t, f); return; }
      }
      if (d.picked) { changed(); return; } // Dropped a picked wire on nothing: it stays removed.
      // Released on empty space from an output: the link-drag search.
      if (d.from.dir === 'out' && !d.from.ext && !e.target.closest('.gn-node')) openAddMenu(e.clientX, e.clientY, { from: d.from, at: toWorld(e.clientX, e.clientY) });
      else drawWires();
    }
  });
  view.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 50 && e.deltaMode === 0 && !Number.isInteger(e.deltaY)) { /* trackpad pinch */ }
    if (e.ctrlKey && Number.isInteger(e.deltaY)) { panX -= e.deltaY; applyView(); return; }
    if (e.shiftKey) { panY -= e.deltaY; applyView(); return; }
    const r = view.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, old = zoom;
    zoom = Math.max(.25, Math.min(2, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); panX = x - (x - panX) * zoom / old; panY = y - (y - panY) * zoom / old; applyView();
  }, { passive: false });
  // Hover: socket inspection and warnings.
  view.addEventListener('pointerover', e => {
    const s = e.target.closest('.gn-sock[data-sock]'), w = e.target.closest('[data-warn]');
    if (s && !drag) showTipSoon(e, () => inspect(sockInfo(s)));
    else if (w) showTipSoon(e, () => (result.warnings[w.dataset.warn] || []).map(k => `<p>${ic('warn')} ${esc(T(WARN[k]))}</p>`).join(''));
  });
  view.addEventListener('pointerout', e => { if (e.target.closest('.gn-sock, [data-warn]')) hideTip(); });
  // Widgets inside nodes.
  view.addEventListener('change', e => {
    const t = e.target;
    const [id, k] = (t.dataset.prop || t.dataset.bool || t.dataset.coll || t.dataset.propBool || '|').split('|'); const n = nodeById(id); if (!n) return;
    snapshot();
    if (t.dataset.prop) { n.params[k] = t.value; if (n.type === 'RandomValue') { graph().links = graph().links.filter(l => !(l.from === id && l.out === 'Value' && !canLink({ ...graph(), links: graph().links.filter(x => x !== l) }, l))); } changed(); }
    else if (t.dataset.bool || t.dataset.propBool) { n.params[k] = t.checked; changed(false); }
    else if (t.dataset.coll) { n.params[k] = t.value; changed(false); }
  });
  view.addEventListener('click', e => { if (e.target.closest('[data-viewer-eye]')) { S.viewerOn = !S.viewerOn; if (S.viewerOn && result) S.sheetMode = 'viewer'; recompute({ structure: true }); } });
  setupFields(view, (el, value, commit) => {
    const [id, key] = el.dataset.param.split('|'), n = nodeById(id); if (!n) return null;
    const spec = n.type === 'Value' ? { type: 'float' } : socketOf(graph(), id, key, 'in');
    return { spec, get: () => { const v = n.params[key] ?? spec.value; return el.dataset.axis != null ? v[el.dataset.axis] : v; }, set: v => { if (el.dataset.axis != null) { const arr = [...n.params[key]]; arr[el.dataset.axis] = v; n.params[key] = arr; } else n.params[key] = v; } };
  });
  $('#ne-n').addEventListener('click', () => toggleSidebar());
  $('.area.ne .ehead').addEventListener('click', e => { const m = e.target.closest('[data-menu]')?.dataset.menu; if (!m) return; const r = e.target.getBoundingClientRect(); if (m === 'Add') { const v = $('#ne-view').getBoundingClientRect(); mouse = { ...toWorld(v.left + v.width / 2, v.top + v.height / 2), cx: v.left + v.width / 2, cy: v.top + v.height / 2 }; openAddMenu(r.left, r.bottom + 2, {}); } else openHeaderMenu(m, r.left, r.bottom + 2); });
  window.addEventListener('keydown', onKey);
  new ResizeObserver(() => drawWires()).observe(view);
}
function crosses(a, b) {
  const seg = (p, q, r, s) => { const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x); if (!d) return false; const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d, u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) if (seg(a[i - 1], a[i], b[j - 1], b[j])) return true;
  return false;
}
function highlightCompatible(s) {
  for (const el of $$('.gn-sock[data-sock]')) {
    const t = sockInfo(el); let ok = false;
    if (s.ext) ok = t.dir === 'in' && !!socketOf(graph(), t.id, t.key, 'in') && 'value' in (socketOf(graph(), t.id, t.key, 'in') || {}) && t.type !== 'geometry';
    else if (s.dir === 'out') ok = t.dir === 'in' && !t.ext && canLink(graph(), makeLink(s.id, s.key, t.id, t.key));
    else ok = (t.dir === 'out' && !t.ext && canLink(graph(), makeLink(t.id, t.key, s.id, s.key))) || (t.ext && s.type !== 'geometry');
    el.classList.toggle('ok', ok);
  }
}
const clearCompatible = () => $$('.gn-sock.ok').forEach(el => el.classList.remove('ok'));
function onKey(e) {
  const tag = document.activeElement?.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  if (!$('#gn-menu').hidden) { if (e.key === 'Escape') closeMenu(); return; }
  const over = $('#ne-view')?.matches(':hover') || document.activeElement === $('#ne-view');
  if (!over) return;
  const k = e.key.toLowerCase();
  if (grab) { if (e.key === 'Escape') endGrab(true); if (e.key === 'Enter') endGrab(false); return; }
  if (e.ctrlKey && k === 'z') { e.preventDefault(); e.shiftKey ? restore(S.redo, S.undo) : restore(S.undo, S.redo); return; }
  if (e.ctrlKey && k === 'y') { e.preventDefault(); restore(S.redo, S.undo); return; }
  if (e.shiftKey && k === 'a') { e.preventDefault(); openAddMenu(mouse.cx, mouse.cy, {}); return; }
  if (e.shiftKey && k === 'd') { e.preventDefault(); duplicate(); return; }
  if (e.ctrlKey && k === 'x') { e.preventDefault(); deleteNodes([...S.sel], true); return; }
  if (e.ctrlKey || e.metaKey) return;
  if (k === 'x' || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteNodes([...S.sel]); }
  else if (k === 'm') toggleMute();
  else if (k === 'g' && S.sel.size) { snapshot(); startGrab(); }
  else if (k === 'n') toggleSidebar();
  else if (e.key === 'Home') frameAll();
  else if (k === 'a' && e.altKey) { S.sel.clear(); S.active = null; decorate(); drawWires(); }
  else if (k === 'a') { S.sel = new Set(graph().nodes.map(n => n.id)); decorate(); drawWires(); }
  else if (e.key === 'Escape') { drag = null; drawWires(); }
}

/* ── Number fields (shared by nodes and the modifier panel): drag to change, click to type ── */
function setupFields(root, resolve) {
  root.addEventListener('pointerdown', e => {
    const el = e.target.closest('.bf'); if (!el || e.button !== 0 || el.classList.contains('editing')) return;
    const r = resolve(el); if (!r) return;
    e.preventDefault(); e.stopPropagation();
    const start = Number(r.get()), x0 = e.clientX; let moved = false, snap = false;
    const isInt = r.spec?.type === 'int', isAng = r.spec?.type === 'rotation' || r.spec?.euler, isM = r.spec?.unit === 'm';
    const per = isInt ? 1 / 8 : isAng ? D ** -1 : isM ? .01 : .005;
    const move = ev => {
      const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 3) return;
      if (!moved) { moved = true; snapshot(); el.classList.add('dragging'); }
      let v = start + dx * per * (ev.shiftKey ? .1 : 1);
      if (ev.ctrlKey) v = isAng ? Math.round(v * D / 5) * 5 / D : isInt ? Math.round(v) : Math.round(v * 10) / 10;
      if (isInt) v = Math.round(v);
      if (r.spec?.min != null) v = Math.max(r.spec.min, v); if (r.spec?.max != null) v = Math.min(r.spec.max, v);
      r.set(v); $('.bf-v', el).textContent = fmt(v, r.spec); save(); recompute(); r.after?.();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.classList.remove('dragging'); if (!moved) editField(el, r); else r.after?.(true); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  root.addEventListener('keydown', e => { const el = e.target.closest?.('.bf'); if (el && e.key === 'Enter' && !el.classList.contains('editing')) { const r = resolve(el); if (r) editField(el, r); } });
}
function editField(el, r) {
  const isAng = r.spec?.type === 'rotation' || r.spec?.euler, cur = Number(r.get());
  el.classList.add('editing');
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = isAng ? +(cur * D).toFixed(3) : +cur.toFixed(4); inp.className = 'bf-in';
  el.append(inp); inp.focus(); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    if (ok) { let v = Number(String(inp.value).replace(',', '.').replace(/[^\d.eE+-]/g, '')); if (Number.isFinite(v)) { if (isAng) v /= D; if (r.spec?.type === 'int') v = Math.round(v); if (r.spec?.min != null) v = Math.max(r.spec.min, v); if (r.spec?.max != null) v = Math.min(r.spec.max, v); snapshot(); r.set(v); save(); } }
    inp.remove(); el.classList.remove('editing'); $('.bf-v', el).textContent = fmt(r.get(), r.spec); recompute(); r.after?.(true);
  };
  inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}

/* ── Socket inspection tooltip ── */
const fmtVal = v => Array.isArray(v) ? `(${v.map(x => (+x).toFixed(3)).join(', ')})` : typeof v === 'boolean' ? (v ? 'True' : 'False') : Number.isInteger(v) ? String(v) : (+v).toFixed(3);
function geoLines(g) {
  return describeGeometry(g).map(d => d.k === 'empty' ? `<li>${T({ en: 'Empty geometry', ca: 'Geometria buida', es: 'Geometría vacía' })}</li>` : d.k === 'mesh' ? `<li>${ic('ob_mesh')} Mesh: ${d.verts} vertices, ${d.edges} edges, ${d.faces} faces</li>` : d.k === 'points' ? `<li>Point Cloud: ${d.n} points</li>` : d.k === 'curve' ? `<li>Curve: ${d.n} points, ${d.splines} splines</li>` : `<li>Instances: ${d.n}</li>`).join('');
}
function inspect(s) {
  if (s.ext) return `<p>${esc(U('dragToExpose'))}</p>`;
  const g = graph(), spec = socketOf(g, s.id, s.key, s.dir); if (!spec) return '';
  let v, srcKey;
  if (s.dir === 'out') { v = result.memo.get(`${s.id}:${s.key}`); srcKey = `${s.id}:${s.key}`; }
  else { const l = g.links.find(x => x.to === s.id && x.input === s.key); if (l) { v = result.memo.get(`${l.from}:${l.out}`); srcKey = `${l.from}:${l.out}`; if (result.invalidLinks.has(`${l.from}|${l.out}|${l.to}|${l.input}`)) return `<b>${esc(spec.label)}</b><p class="bad">${esc(U('invalidLink'))}</p>`; } else if (spec.implicit) v = { field: true, deps: new Set([spec.implicit === 'position' ? 'Position' : 'Index']) }; else v = nodeById(s.id).params[s.key] ?? spec.value; }
  let body;
  if (spec.type === 'geometry') body = v ? `<ul>${geoLines(v)}</ul>` : `<p class="dim">${T({ en: 'Not evaluated yet', ca: 'Encara no avaluat', es: 'Todavía no evaluado' })}</p>`;
  else if (isField(v)) { const smp = result.samples[srcKey]; body = `<p>${esc(U('fieldBased'))}</p><ul>${[...v.deps].map(d => `<li>• ${esc(d)}</li>`).join('')}</ul>${smp ? `<p class="dim">${esc(U('firstValues'))} ${smp.map(fmtVal).join(', ')}…</p>` : ''}`; }
  else if (v === undefined || v === null) body = `<p class="dim">${T({ en: 'Not evaluated yet', ca: 'Encara no avaluat', es: 'Todavía no evaluado' })}</p>`;
  else body = `<p>${esc(fmtVal(spec.type === 'rotation' || spec.euler ? (Array.isArray(v) ? v.map(x => +(x * D).toFixed(2)) : v) : v))}${spec.type === 'rotation' ? ' °' : ''}</p><p class="dim">${esc(U('singleValue'))}</p>`;
  return `<b>${esc(spec.label)}</b> <span class="tt-type t-${spec.type}">${spec.type === 'int' ? 'Integer' : spec.type === 'bool' ? 'Boolean' : spec.type[0].toUpperCase() + spec.type.slice(1)}</span>${body}`;
}
let tipTimer = null;
function showTipSoon(e, fn) { clearTimeout(tipTimer); const x = e.clientX, y = e.clientY; tipTimer = setTimeout(() => { const html = fn(); if (!html) return; const tip = $('#gn-tip'); tip.innerHTML = html; tip.hidden = false; const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = `${Math.min(innerWidth - w - 8, x + 14)}px`; tip.style.top = `${Math.min(innerHeight - h - 8, y + 14)}px`; }, 260); }
function hideTip() { clearTimeout(tipTimer); $('#gn-tip').hidden = true; }

/* ── Add menu (Shift A), header menus ── */
function menuTree(filter) {
  const items = Object.entries(NODES).filter(([t]) => !['GroupInput', 'GroupOutput'].includes(t) && (!filter || filter(t)));
  return MENU.map(cat => ({ cat, groups: [...new Set(items.filter(([, d]) => d.menu[0] === cat).map(([, d]) => d.menu[1] || ''))].map(sub => ({ sub, items: items.filter(([, d]) => d.menu[0] === cat && (d.menu[1] || '') === sub) })) })).filter(c => c.groups.length);
}
let menuCtx = null;
function openAddMenu(x, y, ctx) {
  menuCtx = ctx; const m = $('#gn-menu'); hideTip();
  const from = ctx.from, filter = from ? t => visibleInputs(makeNode('x', t, 0, 0)).some(s => convertible(from.type, s.type) && (from.type === 'geometry') === (s.type === 'geometry')) : null;
  const tree = menuTree(filter);
  m.innerHTML = `<div class="mn-title">${from ? T({ en: 'Link to…', ca: 'Connecta a…', es: 'Conecta a…' }) : 'Add'}</div><label class="mn-search">${ic('search')}<input type="text" id="mn-q" placeholder="${esc(U('addMenuSearch'))}" autocomplete="off"></label><div class="mn-list" id="mn-list">${tree.map(c => `<div class="mn-cat" data-cat="${c.cat}"><span>${c.cat}</span><i>▸</i><div class="mn-sub">${c.groups.map(gr => `${gr.sub ? `<div class="mn-h">${gr.sub}</div>` : ''}${gr.items.map(([t, d]) => `<button type="button" data-add="${t}" title="${esc(T(NODE_DOCS[t]))}">${esc(d.name)}</button>`).join('')}`).join('')}</div></div>`).join('')}</div><div class="mn-results" id="mn-results" hidden></div>`;
  m.hidden = false; m.classList.remove('hdr');
  const w = m.offsetWidth, h = m.offsetHeight; m.style.left = `${Math.max(4, Math.min(innerWidth - w - 180, x - 20))}px`; m.style.top = `${Math.max(4, Math.min(innerHeight - h - 4, y - 14))}px`;
  const q = $('#mn-q'); q.focus();
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase(), res = $('#mn-results');
    if (!s) { res.hidden = true; $('#mn-list').hidden = false; return; }
    const hits = tree.flatMap(c => c.groups.flatMap(gr => gr.items.map(([t, d]) => ({ t, d, path: `${c.cat}${gr.sub ? ' › ' + gr.sub : ''}` })))).filter(o => o.d.name.toLowerCase().includes(s));
    res.innerHTML = hits.length ? hits.map((o, i) => `<button type="button" data-add="${o.t}" class="${i ? '' : 'first'}"><span class="mn-path">${o.path} ›</span> ${esc(o.d.name)}</button>`).join('') : `<p>—</p>`;
    res.hidden = false; $('#mn-list').hidden = true;
  });
  q.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeMenu(); if (e.key === 'Enter') { const b = $('#mn-results button'); if (b) b.click(); } });
}
function closeMenu() { $('#gn-menu').hidden = true; menuCtx = null; }
function chooseAdd(type) {
  const ctx = menuCtx || {}; closeMenu();
  snapshot();
  const at = ctx.at || mouse, id = addNode(type, at.x - 20, at.y - 14);
  if (ctx.from) { const n = nodeById(id), inp = visibleInputs(n).find(s => convertible(ctx.from.type, s.type) && (ctx.from.type === 'geometry') === (s.type === 'geometry')); if (inp) addLink(graph(), makeLink(ctx.from.id, ctx.from.key, id, inp.key)); changed(); return; }
  recompute({ structure: true }); startGrab(true); mouse = { ...mouse }; grab.start = { ...mouse };
}
function openHeaderMenu(name, x, y) {
  const items = {
    View: [['Sidebar', 'N', () => toggleSidebar()], ['Frame All', 'Home', () => frameAll()], ['Frame Selected', 'Numpad .', () => frameAll([...S.sel])], ['Zoom In', 'Wheel', () => { zoom = Math.min(2, zoom * 1.2); applyView(); }], ['Zoom Out', 'Wheel', () => { zoom = Math.max(.25, zoom / 1.2); applyView(); }]],
    Select: [['All', 'A', () => { S.sel = new Set(graph().nodes.map(n => n.id)); decorate(); drawWires(); }], ['None', 'Alt A', () => { S.sel.clear(); S.active = null; decorate(); drawWires(); }], ['Invert', 'Ctrl I', () => { S.sel = new Set(graph().nodes.map(n => n.id).filter(id => !S.sel.has(id))); decorate(); drawWires(); }]],
    Node: [['Duplicate', 'Shift D', duplicate], ['Delete', 'X', () => deleteNodes([...S.sel])], ['Delete with Reconnect', 'Ctrl X', () => deleteNodes([...S.sel], true)], ['Toggle Node Mute', 'M', toggleMute], ['Link to Viewer', 'Ctrl Shift LMB', () => S.active && linkToViewer(S.active)], ['Undo', 'Ctrl Z', () => restore(S.undo, S.redo)], ['Redo', 'Ctrl Shift Z', () => restore(S.redo, S.undo)]],
  }[name];
  const m = $('#gn-menu'); menuCtx = { header: items };
  m.innerHTML = items.map(([t, k], i) => `<button type="button" class="mn-item" data-hi="${i}"><span>${t}</span><kbd>${k}</kbd></button>`).join('');
  m.hidden = false; m.classList.add('hdr'); m.style.left = `${x}px`; m.style.top = `${y}px`;
}
function setupMenu() {
  const m = $('#gn-menu');
  m.addEventListener('click', e => { const a = e.target.closest('[data-add]'); if (a) { chooseAdd(a.dataset.add); return; } const h = e.target.closest('[data-hi]'); if (h && menuCtx?.header) { const f = menuCtx.header[h.dataset.hi][2]; closeMenu(); f(); } });
  window.addEventListener('pointerdown', e => { if (!m.hidden && !e.target.closest('#gn-menu, [data-menu]')) closeMenu(); }, true);
}

/* ── Sidebar (N): Node and Group tabs ── */
function toggleSidebar(force) { S.sidebar = typeof force === 'boolean' ? force : !S.sidebar; $('#ne-side').hidden = !S.sidebar; $('#ne-n').setAttribute('aria-pressed', String(S.sidebar)); renderSidebar(); }
function renderSidebar() {
  if (!S.sidebar) return;
  $('#ne-side-tabs').innerHTML = ['Node', 'Tool', 'View', 'Group'].map(t => `<button type="button" class="${S.sideTab === t ? 'on' : ''}" data-side="${t}">${t}</button>`).join('');
  const body = $('#ne-side-body'), n = nodeById(S.active);
  if (S.sideTab === 'Group') {
    const ex = graph().exposed || [];
    body.innerHTML = `<div class="sp-panel"><h4>▾ Interface</h4><div class="sp-iface"><div class="sp-sock"><i class="gn-sock t-geometry circle"></i> Geometry <small>Output</small></div><div class="sp-sock"><i class="gn-sock t-geometry circle"></i> Geometry <small>Input</small></div>${ex.map(e => `<div class="sp-sock"><i class="gn-sock t-${e.type} circle"></i><input type="text" value="${esc(e.label)}" data-rename="${esc(e.id)}" aria-label="Name"><button type="button" data-unexpose="${esc(e.id)}" title="Remove">${ic('x')}</button></div>`).join('')}</div>${ex.length ? '' : `<p class="dim">${esc(U('interfaceEmpty'))}</p>`}</div>`;
    return;
  }
  if (S.sideTab !== 'Node') { body.innerHTML = `<div class="sp-panel"><p class="dim">${S.sideTab === 'View' ? 'Frame All: Home · Zoom: Wheel' : 'Select Box (LMB drag)'}</p></div>`; return; }
  if (!n) { body.innerHTML = `<div class="sp-panel"><p class="dim">${esc(U('noSel'))}</p></div>`; return; }
  const def = NODES[n.type], ins = visibleInputs(n), outs = visibleOutputs(n, graph());
  const row = s => `<li><i class="gn-sock t-${s.type} ${s.field ? 'diamond' : 'circle'}"></i>${esc(s.label)}<small>${s.type}${s.field ? ' · field' : ''}</small></li>`;
  body.innerHTML = `<div class="sp-panel"><h4>▾ Node</h4><label class="sp-f"><span>Name</span><input type="text" value="${esc(def.name)}" readonly></label><label class="sp-f"><span>Label</span><input type="text" value="" readonly></label></div><div class="sp-panel doc"><h4>▾ ${esc(U('whatItDoes'))}</h4><p>${esc(T(NODE_DOCS[n.type]))}</p>${n.muted ? `<p class="warnp">${esc(U('mutedNote'))}</p>` : ''}${(result.warnings[n.id] || []).map(k => `<p class="warnp">${ic('warn')} ${esc(T(WARN[k]))}</p>`).join('')}</div><div class="sp-panel"><h4>▾ ${esc(U('socketsTitle'))}</h4><ul class="sp-socks">${outs.map(row).join('')}</ul><ul class="sp-socks">${ins.map(row).join('')}</ul></div>`;
}
function setupSidebar() {
  $('#ne-side').addEventListener('click', e => {
    const t = e.target.closest('[data-side]'); if (t) { S.sideTab = t.dataset.side; renderSidebar(); }
    const u = e.target.closest('[data-unexpose]'); if (u) { snapshot(); removeExposed(graph(), u.dataset.unexpose); changed(); }
  });
  $('#ne-side').addEventListener('change', e => { const r = e.target.closest('[data-rename]'); if (r) { snapshot(); const ex = graph().exposed.find(x => x.id === r.dataset.rename); ex.label = r.value.trim() || ex.label; changed(); } });
  $('#ne-side').addEventListener('keydown', e => e.stopPropagation());
  $('#ne-side').addEventListener('pointerdown', e => e.stopPropagation());
}

/* ── Spreadsheet ── */
function sheetGeometry() {
  if (S.sheetMode === 'original') return inputGeometry() || LAB_OBJECTS[lab].data();
  if (S.sheetMode === 'viewer' && result.viewer) return result.viewer.geometry;
  return result.geometry;
}
function renderSheet() {
  const g = sheetGeometry(), m = g.mesh;
  const counts = { vertex: m?.verts.length || 0, edge: edgeCount(m), face: m?.faces.length || 0, corner: m ? m.faces.reduce((s, f) => s + f.length, 0) : 0, control: g.curves.reduce((s, c) => s + c.points.length, 0), spline: g.curves.length, point: g.points.length, instance: g.instances.length };
  if (!S.sheetDomain) S.sheetDomain = 'vertex';
  const dom = (k, label, icn) => `<button type="button" class="${S.sheetDomain === k ? 'on' : ''}" data-dom="${k}"><span>${icn ? ic(icn) : ''}${label}</span><b>${counts[k]}</b></button>`;
  $('#sheet-domains').innerHTML = `<div class="sd-h">${ic('ob_mesh')} Mesh</div>${dom('vertex', 'Vertex')}${dom('edge', 'Edge')}${dom('face', 'Face')}${dom('corner', 'Face Corner')}<div class="sd-h">${ic('ob_empty')} Curve</div>${dom('control', 'Control Point')}${dom('spline', 'Spline')}<div class="sd-h">∴ Point Cloud</div>${dom('point', 'Point')}<div class="sd-h">${ic('collection')} Instances</div>${dom('instance', 'Instance')}`;
  $('#sheet-mode').value = S.sheetMode;
  $('#sheet-crumbs').innerHTML = `${ic('ob_mesh')} ${OBJ}${S.sheetMode === 'viewer' && result.viewer ? ` › ${ic('modifier')} GeometryNodes › Viewer` : S.sheetMode === 'evaluated' ? ` › ${ic('modifier')} GeometryNodes` : ''}`;
  const viewerCol = S.sheetMode === 'viewer' && result.viewer?.values && result.viewer.domain === { vertex: 'vertex', point: 'point', control: 'control', instance: 'instance' }[S.sheetDomain] ? result.viewer.values : null;
  const f3 = v => (Math.abs(+v) < 5e-4 ? 0 : +v).toFixed(3), MAX = 300;
  let head = '', rows = [];
  const d = S.sheetDomain, add = (cells) => rows.push(cells);
  if (d === 'vertex' && m) { head = ['position'].map(() => `<th colspan="3">position</th>`).join(''); m.verts.slice(0, MAX).forEach((p, i) => add([...p.map(f3)])); }
  else if (d === 'edge' && m) { head = `<th colspan="2">.edge_verts</th>`; const seen = new Set(); for (const f of m.faces) for (let i = 0; i < f.length && rows.length < MAX; i++) { const a = f[i], b = f[(i + 1) % f.length], k = a < b ? `${a}_${b}` : `${b}_${a}`; if (!seen.has(k)) { seen.add(k); add([Math.min(a, b), Math.max(a, b)]); } } }
  else if (d === 'face' && m) { head = `<th>corners</th>`; m.faces.slice(0, MAX).forEach(f => add([f.length])); }
  else if (d === 'corner' && m) { head = `<th>.corner_vert</th>`; for (const f of m.faces) for (const v of f) if (rows.length < MAX) add([v]); }
  else if (d === 'control') { head = `<th colspan="3">position</th><th>radius</th><th>tilt</th>`; g.curves.forEach(c => c.points.forEach(p => rows.length < MAX && add([...p.map(f3), '1.000', '0.000']))); }
  else if (d === 'spline') { head = `<th>resolution</th><th>cyclic</th>`; g.curves.forEach(c => add([12, c.cyclic ? '✓' : '—'])); }
  else if (d === 'point') { head = `<th colspan="3">position</th><th>radius</th>`; g.points.slice(0, MAX).forEach(p => add([...p.position.map(f3), '0.050'])); }
  else if (d === 'instance') { head = `<th>Instance</th><th colspan="3">position</th><th colspan="3">rotation</th><th colspan="3">scale</th>`; g.instances.slice(0, MAX).forEach(s => add([`${ic(s.geometry.mesh && !s.geometry.instances.length ? 'ob_mesh' : 'collection')} ${esc(s.name)}`, ...MAT.translation(s.matrix).map(f3), ...MAT.rotation(s.matrix).map(v => `${(v * D).toFixed(1)}°`), ...MAT.scale(s.matrix).map(f3)])); }
  if (viewerCol) { head += `<th class="vcol" colspan="${Array.isArray(viewerCol[0]) ? 3 : 1}">${esc(U('viewerColumn'))}</th>`; rows = rows.map((r, i) => [...r, ...(Array.isArray(viewerCol[i]) ? viewerCol[i].map(f3) : [typeof viewerCol[i] === 'boolean' ? (viewerCol[i] ? '✓' : '—') : Number.isInteger(viewerCol[i]) ? viewerCol[i] : f3(viewerCol[i])])]); }
  $('#sheet-table').innerHTML = rows.length ? `<table><thead><tr><th class="ix"></th>${head}</tr></thead><tbody>${rows.map((r, i) => `<tr><td class="ix">${i}</td>${r.map((c, j) => `<td${viewerCol && j >= r.length - (Array.isArray(viewerCol[0]) ? 3 : 1) ? ' class="vcol"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="sheet-empty">${esc(U('sheetEmpty'))}</p>`;
  const total = counts[d];
  $('#sheet-foot').textContent = `Rows: ${total}${total > MAX ? ` (${MAX} shown)` : ''}   |   Columns: ${(head.match(/<th/g) || []).length}`;
}
function setupSheet() {
  $('#sheet-domains').addEventListener('click', e => { const b = e.target.closest('[data-dom]'); if (!b) return; S.sheetDomain = b.dataset.dom; const f = flags(); if (b.dataset.dom === 'vertex') f.sheetVertex = true; if (b.dataset.dom === 'control') f.sheetControl = true; save(); renderSheet(); checkGoals(); });
  $('#sheet-mode').addEventListener('change', e => { S.sheetMode = e.target.value; if (S.sheetMode === 'original') { flags().original = true; save(); } if (S.sheetMode === 'viewer' && !result.viewer) S.sheetMode = 'evaluated'; renderSheet(); checkGoals(); });
}

/* ── Viewport ── */
function updateViewport(frame) {
  const showViewer = S.viewerOn && result.viewer && S.modViewport, base = S.modViewport ? result.geometry : (inputGeometry() || LAB_OBJECTS[lab].data());
  const geo = showViewer ? result.viewer.geometry : base;
  const st = statsOf(geo), empty = !st.verts && !st.points && !st.curvePoints;
  if (updateViewport.wasEmpty && !empty) frame = true; updateViewport.wasEmpty = empty;
  preview?.update(geo, { values: showViewer ? result.viewer.values : null, wire: S.wire, active: true, frame });
  $('#vp-text').innerHTML = `<b>User Perspective</b><span>(1) Collection | ${OBJ}</span><dl><dt>Objects</dt><dd>1 / 1</dd><dt>Vertices</dt><dd>${(st.verts + st.points + st.curvePoints).toLocaleString('en')}</dd><dt>Edges</dt><dd>${st.edges.toLocaleString('en')}</dd><dt>Faces</dt><dd>${st.faces.toLocaleString('en')}</dd><dt>Triangles</dt><dd>${st.tris.toLocaleString('en')}</dd></dl>`;
  const note = !S.modViewport ? U('modOff') : showViewer ? U('viewerOn') : lab === 3 ? (inputGeometry() ? U('usingTerrain') : U('sampleTerrain')) : '';
  $('#vp-note').textContent = note; $('#vp-note').hidden = !note;
}

/* ── Outliner and Properties ── */
function renderOutliner() {
  const rows = [{ name: 'Scene Collection', icon: 'scene_collection', open: true, depth: 0 }, { name: 'Collection', icon: 'collection', open: true, depth: 1, exclude: false, eye: true, cam: true }, { name: 'Camera', icon: 'ob_camera', depth: 2, eye: true, cam: true }, { name: 'Light', icon: 'ob_light', depth: 2, eye: true, cam: true }, { name: OBJ, icon: 'ob_mesh', open: true, depth: 2, eye: true, cam: true, sel: true, active: true, inline: ['modifier'] }, { name: 'GeometryNodes', icon: 'modifier', depth: 3 }];
  if (lab === 3) { rows.push({ name: 'Rocks', icon: 'collection', open: true, depth: 1, exclude: true, dim: true }); for (const n of ['Rock.001', 'Rock.002', 'Rock.003']) rows.push({ name: n, icon: 'ob_mesh', depth: 2, dim: true }); rows.push({ name: 'Trees', icon: 'collection', open: false, depth: 1, exclude: true, dim: true }); }
  $('#outliner').innerHTML = outlinerHTML(rows);
}
function renderProps() {
  const ex = graph().exposed || [];
  const field = e => { const spec = { type: e.type, unit: e.unit, euler: e.euler }; return e.type === 'vector' || e.type === 'rotation' ? `<div class="pm-vec"><span class="pm-l">${esc(e.label)}</span><div class="bvec">${[0, 1, 2].map(i => `<div class="bf" data-mod="${esc(e.id)}" data-axis="${i}" tabindex="0"><span class="bf-l">${'XYZ'[i]}</span><span class="bf-v">${fmt(e.value[i], spec)}</span></div>`).join('')}</div></div>` : e.type === 'bool' ? `<label class="bchk pm-row"><input type="checkbox" data-mod-bool="${esc(e.id)}" ${e.value ? 'checked' : ''}><span class="box"></span><span>${esc(e.label)}</span></label>` : `<div class="pm-row"><span class="pm-l">${esc(e.label)}</span><div class="bf" data-mod="${esc(e.id)}" tabindex="0"><span class="bf-l"></span><span class="bf-v">${fmt(e.value, spec)}</span></div></div>`; };
  const html = `<div class="pm-add"><span class="bh-dd">${ic('plus')}<span>Add Modifier</span>${ic('dropdown')}</span></div><div class="pm-box"><div class="pm-head"><span class="pm-tri">▾</span>${ic('gn')}<input type="text" value="GeometryNodes" readonly aria-label="Modifier name"><span class="bh-group"><button type="button" class="bh-ico" title="Edit Mode" aria-pressed="false" disabled>${ic('editm')}</button><button type="button" class="bh-ico" id="pm-vp" title="Display modifier in viewport" aria-pressed="${S.modViewport}">${ic('monitor')}</button><button type="button" class="bh-ico" title="Use modifier during render" aria-pressed="true" disabled>${ic('camera')}</button></span><span class="pm-x">${ic('dropdown')}</span><span class="pm-x">${ic('x')}</span></div><div class="pm-tree">${ic('gn')}<span>Geometry Nodes</span><i>${ic('shield')}</i><i>${ic('copy')}</i><i>${ic('x')}</i></div><div class="pm-inputs">${ex.length ? ex.map(field).join('') : `<p class="dim">${esc(U('modEmpty'))}</p>`}</div><div class="pm-sub">▸ Output Attributes</div><div class="pm-sub">▸ Manage</div></div>`;
  const body = $('#props-body');
  if (!$('.bf.dragging, .bf.editing', body)) body.innerHTML = html;
}
function setupProps() {
  const body = $('#props-body');
  setupFields(body, el => {
    const e = graph().exposed?.find(x => x.id === el.dataset.mod); if (!e) return null;
    const spec = { type: e.type, unit: e.unit, euler: e.euler, ...socketOf(graph(), e.targetNode, e.targetSocket, 'in') };
    return { spec, get: () => el.dataset.axis != null ? e.value[el.dataset.axis] : e.value, set: v => { if (el.dataset.axis != null) { const a = [...e.value]; a[el.dataset.axis] = v; e.value = a; } else e.value = v; flags().modChanged = true; }, after: () => {} };
  });
  body.addEventListener('change', e => { const b = e.target.closest('[data-mod-bool]'); if (b) { const x = graph().exposed.find(q => q.id === b.dataset.modBool); snapshot(); x.value = b.checked; flags().modChanged = true; changed(false); } });
  body.addEventListener('click', e => { if (e.target.closest('#pm-vp')) { S.modViewport = !S.modViewport; recompute(); } });
}

/* ── Steps ── */
function goStep(i) { if (i < 0 || i >= steps.length) return; S.step = i; S.sel.clear(); S.active = null; S.undo = []; S.redo = []; S.note = ''; S.viewerOn = true; save(); renderGuide(); recompute({ structure: true, frame: true }); renderCard(); requestAnimationFrame(() => frameAll()); }
function setupLesson() {
  $('#guide').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) goStep(Number(b.dataset.step)); });
  $('#step-card').addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    if (a === 'next') goStep(S.step + 1);
    if (a === 'solution') { snapshot(); S.graphs[S.step] = step().solution(); Object.assign(flags(), { original: true, modChanged: true, sheetVertex: true, sheetControl: true, realizeSeen: true }); S.note = U('solutionShown'); S.sel.clear(); save(); recompute({ structure: true, frame: true }); renderCard(); requestAnimationFrame(() => frameAll()); }
    if (a === 'reset') { snapshot(); S.graphs[S.step] = step().starter(); S.flags[S.step] = {}; S.done[S.step] = false; S.note = U('stepReset'); S.sel.clear(); save(); renderGuide(); recompute({ structure: true, frame: true }); renderCard(); requestAnimationFrame(() => frameAll()); }
  });
  $('#vp-wire').addEventListener('click', () => { S.wire = !S.wire; $('#vp-wire').setAttribute('aria-pressed', String(S.wire)); updateViewport(); });
}

/* ── Start ── */
shell();
try { preview = createPreview($('#vp-canvas'), $('#vp-gizmo')); } catch (err) { $('#vp-canvas').insertAdjacentHTML('beforeend', '<p class="vp-fail">3D preview unavailable in this browser</p>'); console.warn(err); }
$('#bl-status').innerHTML = `<span>${U('statusHints')}</span><span class="bl-ver">Carrot Revolt Labs · Blender 4.x – 5.x</span>`;
renderGuide(); renderConcepts(); setupEditor(); setupMenu(); setupSidebar(); setupSheet(); setupProps(); setupLesson();
recompute({ structure: true, frame: true }); renderCard();
requestAnimationFrame(() => { frameAll(); preview?.frame(); });
await import('../../lab-brief.js?v=3');
initI18n({ mount: '.site-header', append: true });
onLangChange(() => location.reload());
