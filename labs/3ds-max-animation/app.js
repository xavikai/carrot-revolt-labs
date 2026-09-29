// 3ds Max Animation Lab: a bouncing ball in a 3D viewport and Track View.
import * as THREE from 'three';
import { recalcHandles, evaluate, moveKey, moveHandle, key, contacts, tops, intervals, hangTime, matchScore, INTERPOLATIONS, HANDLE_TYPES } from './fcurve.js';
import { STAGES, CHANNELS, FPS, RANGE, REFERENCE, BALL, startData, cloneData, shape, channelOf, lowestPoint, firstBounce, rollReport, rollAngle } from './stages.js?v=7';
import { chanValue } from './stages.js?v=7';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import blenderConcepts from '../animation/i18n.js?v=5';
import maxDictionary from './max-i18n.js?v=5';
import { createMaxShell, createTrackView, rollout, spinner } from '../_max/max-shell.js?v=2';
import { createMaxViewport } from '../_max/max-viewport.js?v=1';
import { createGizmo, toMax } from '../_max/max-gizmo.js?v=1';
import { icon } from '../_max/max-icons.js?v=2';
addDictionary({ ...blenderConcepts, ...maxDictionary });

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-max-anim:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-max-anim:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const HANDLE_COLORS = { FREE: '#2b2b2b', ALIGNED: '#d56fd1', VECTOR: '#59c35b', AUTO: '#e8c14a', AUTO_CLAMPED: '#d9674a' };
// The evaluator keeps neutral curve IDs; the controls expose 3ds Max tangent terms.
const HANDLE_LABELS = { FREE: 'Custom', ALIGNED: 'Spline', VECTOR: 'Linear', AUTO: 'Smooth', AUTO_CLAMPED: 'Auto' };
const INTERP_LABELS = { CONSTANT: 'Step', LINEAR: 'Linear', BEZIER: 'Smooth curve' };

const S = {
  stageIndex: store.get('stage', 0), step: 0, data: null, frame: 1, start: RANGE[0], end: RANGE[1],
  playing: false, active: 'locZ', hidden: new Set(), activeKey: null,
  undo: [], redo: [], done: store.get('done', {}), toggles: { path: true, ghosts: false, ref: false, ctrls: store.get('ctrls', true) },
  view: null, drag: null, grab: null, hover: false,
  bone: 'Root', override: {}, vgrab: null, tlGrab: null, area: null, vpointer: null, bottom: store.get('bottom', 'timeline') === 'dopesheet' ? 'dopesheet' : 'timeline',
  keyMode: store.get('keyMode', 'off'), tool: store.get('tool', 'move'), axis: store.get('axis', null), tvTool: 'moveKeys', showTangents: true,
};
const stage = () => STAGES[S.stageIndex];

// ─── Data and persistence ───────────────────────────────────────────────────
function saveData() { store.set(`data-${stage().id}-${stage().independent ? S.step : 0}`, S.data); }
function loadData() {
  const saved = store.get(`data-${stage().id}-${stage().independent ? S.step : 0}`, null);
  S.data = saved && saved.channels ? saved : startData(stage(), S.step);
  if (stage().free && !S.data.channels.scale) S.data.channels.scale = startData(stage()).channels.scale;
  for (const k of Object.values(S.data.channels)) { k.forEach(q => { q.select = false; }); recalcHandles(k); }
  S.activeKey = null; S.undo = []; S.redo = [];
}
function pushUndo() { S.undo.push(JSON.stringify(S.data)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function restore(json) { S.data = JSON.parse(json); S.activeKey = null; S.override = {}; changed(false); }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.data)); restore(S.undo.pop()); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.data)); restore(S.redo.pop()); msg('Redo'); }

const editable = () => true;
const visibleChannels = () => stage().channels.filter(id => !S.hidden.has(id) && S.data.channels[id]);
function allKeys(filter = () => true) {
  const out = [];
  for (const id of visibleChannels()) if (filter(id)) for (const k of S.data.channels[id]) out.push({ id, k });
  return out;
}
const selected = () => allKeys(editable).filter(e => e.k.select);
// The Dope Sheet shows every controller, even ones hidden in the Curve Editor.
function stageKeys() { const out = []; for (const id of stage().channels) if (S.data.channels[id]) for (const k of S.data.channels[id]) out.push({ id, k }); return out; }
const dopeSheet = () => S.bottom === 'dopesheet';
const bottomSelected = () => dopeSheet() ? stageKeys().filter(e => e.k.select) : selected();
function valueAt(id, f) {
  return chanValue(S.data.channels[id], f, S.data.oor?.[id]);
}

// ─── Status bar ──────────────────────────────────────────────────────────────
let msgTimer;
function msg(text, warning = false) {
  max.prompt(t(text));
  const el = document.querySelector('#mx-prompt');
  el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => el.classList.remove('warning'), 4000);
}

// ─── Canvas helpers ──────────────────────────────────────────────────────────
function fitCanvas(c) {
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function niceStep(range, px, minPx) {
  const raw = range * minPx / Math.max(1, px);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}


// ─── The 3ds Max 2027 windows (shared kit in ../_max) ────────────────────────
const HELPERS = [
  { id: 'Root', name: 'Root', kind: 'Helper', color: '#4aa3ff', depth: 0 },
  { id: 'Rotation', name: 'Rotation', kind: 'Helper', color: '#ffb347', depth: 1 },
  { id: 'SS_Bottom', name: 'SS_Bottom', kind: 'Helper', color: '#e07ee0', depth: 1 },
  { id: 'SS_Top', name: 'SS_Top', kind: 'Helper', color: '#7ee07e', depth: 1 },
  { id: 'Ball_01', name: 'Ball_01', kind: 'Object', color: '#e1117f', depth: 2 },
];
const KEY_TYPE = id => id === 'rotY' ? 'rotation' : id === 'scale' ? 'scale' : 'position';
const boneChannels = () => stage().channels.filter(id => S.data?.channels[id] && CHANNELS[id].bone === S.bone);
const max = createMaxShell($('#max-app'), {
  file: 'Bouncing_Ball.max', fps: FPS, units: 'm', tab: 'motion',
  objects: HELPERS, selected: 'Root', keyFilters: ['Position', 'Rotation', 'Scale'],
  pages: { motion: '', display: '' },
  menus: {
    Views: () => [
      { label: 'Maximize Viewport Toggle', keys: 'Alt+W', run: () => max.run('maximize') },
      { label: 'Zoom Extents Selected', keys: 'Z', run: () => frameView3() },
      { sep: true },
      { label: 'Show Ghosting', checked: S.toggles.ghosts, run: () => setToggle('ghosts', !S.toggles.ghosts) },
      { label: 'Hide Helpers', keys: 'Shift+H', checked: !S.toggles.ctrls, run: () => setToggle('ctrls', !S.toggles.ctrls) },
    ],
  },
  actions: {
    frame: f => setFrame(f), prevFrame: () => setFrame(Math.round(S.frame) - 1), nextFrame: () => setFrame(Math.round(S.frame) + 1),
    goStart: () => setFrame(S.start), goEnd: () => setFrame(S.end), play: () => togglePlay(),
    keyMode: () => { S.keyJump = !S.keyJump; max.setModes({ keyMode: S.keyJump, silent: true }); msg(S.keyJump ? 'Key Mode: , and . jump from key to key.' : 'Key Mode off: , and . move one frame.'); },
    autoKey: () => chooseKeyMode('auto'), setKeyMode: () => chooseKeyMode('set'),
    setKey: () => { if (S.keyMode !== 'set') return msg('Set Keys works in Set Key Mode: press \' or the Set K. button.', true); S.override.scale != null && stage().free ? keyScale() : keyControl(); },
    onTimeConfig: ({ start, end }) => { S.start = Math.max(0, start); S.end = Math.min(250, end); setFrame(Math.max(S.start, Math.min(S.end, S.frame))); renderAll(); },
    range: (start, end) => { S.start = Math.max(0, start); S.end = Math.min(250, end); setFrame(Math.max(S.start, Math.min(S.end, S.frame))); },
    selectKeys: frames => { const set = new Set(frames); clearSelection(); for (const id of boneChannels()) for (const k of S.data.channels[id]) if (set.has(k.frame)) k.select = true; S.activeKey = null; renderAll(); },
    moveKeys: (frames, delta, copy) => trackBarMove(frames, delta, copy),
    deleteKeys: frames => { const set = new Set(frames); deleteKeys(boneChannels().flatMap(id => S.data.channels[id].filter(k => set.has(k.frame)).map(k => ({ id, k })))); },
    delete: () => deleteKeys(selected().length ? selected() : bottomSelected()),
    undo, redo,
    select: () => activateTool('select'), move: () => activateTool('move'), rotate: () => activateTool('rotate'), scale: () => activateTool('scale'),
    selectObject: id => selectBone(id === 'Ball_01' ? (msg('Ball_01 is linked to the helpers: animate the helpers instead. Root is selected.'), 'Root') : id),
    selectAll: () => { if (max.overTrackView()) selectAll(true); else msg('Select All: in this lab, select one helper at a time.'); },
    selectNone: () => { if (max.overTrackView()) selectAll(false); },
    typeIn: (axis, v) => typeIn(axis, v),
    axisX: () => chooseAxis('x'), axisY: () => msg('Y is the depth of this side view: the rig does not move in Y.'), axisZ: () => chooseAxis('z'), axisPlane: () => chooseAxis(null),
    hideHelpers: () => setToggle('ctrls', !S.toggles.ctrls),
    curveEditor: () => setTrackView('curve'), dopeSheet: () => setTrackView('dope'),
    viewCube: () => { frameView3(); max.setViewLabel('Perspective'); }, zoomExtents: () => frameView3(), zoomExtentsAll: () => frameView3(),
    viewPerspective: () => { frameView3(); max.setViewLabel('Perspective'); }, viewFront: () => { frameView3(true); max.setViewLabel('Front'); },
    orbit: () => msg('Orbit: Alt + middle mouse button drag in the viewport.'), pan: () => msg('Pan: middle mouse button drag in the viewport.'), zoom: () => msg('Zoom: mouse wheel in the viewport.'),
    // Tools › Preview - Grab Viewport (Shift+V): the kit renders each frame of the viewport without helpers.
    grabFrame: f => { const follow = cameraFollowsBall, playing = S.playing; cameraFollowsBall = false; S.previewing = S.playing = true; S.frame = Math.max(0, Math.min(250, f)); drawView(); S.previewing = false; S.playing = playing; cameraFollowsBall = follow; return renderer3.domElement; },
    commandPanel: (tab, page) => { if (tab === 'motion') renderMotion(page); if (tab === 'display') renderDisplay(page); },
    layout: () => requestAnimationFrame(() => { resize3(); renderLive(); }),
    key: (e, combo) => {
      if ((S.vgrab || S.vrot || S.vscale) && combo === 'escape') { if (S.vgrab) endVGrab(false); if (S.vrot) endVRot(false); if (S.vscale) endVScale(false); return true; }
      if (S.tlGrab && combo === 'escape') { endTlGrab(false); return true; }
      if (combo === ',' && S.keyJump) { jumpKey(-1); return true; }
      if (combo === '.' && S.keyJump) { jumpKey(1); return true; }
      return false;
    },
  },
});
const tv = createTrackView($('#max-tv'), {
  shell: max,
  tools: { moveKeys: 1, addKeys: 1, outOfRange: 1, tanAuto: 1, tanSpline: 1, tanFast: 1, tanSlow: 1, tanStep: 1, tanLinear: 1, tanSmooth: 1, showTangents: 1, breakTangents: 1, unifyTangents: 1, frameH: 1, frameV: 1, pan: 1, zoom: 1, filters: 1 },
  menus: {
    Editor: () => [{ label: 'Curve Editor', checked: !dopeSheet(), run: () => setTrackView('curve') }, { label: 'Dope Sheet', checked: dopeSheet(), run: () => setTrackView('dope') }],
    Edit: () => [{ label: 'Undo', keys: 'Ctrl+Z', run: undo }, { label: 'Redo', keys: 'Ctrl+Y', run: redo }, { sep: true }, { label: 'Controller ▸ Out Of Range Types...', run: outOfRangeDialog }],
    Curves: () => [{ label: 'Parameter Curve Out-of-Range Types...', run: outOfRangeDialog }],
    View: () => [{ label: 'Frame Horizontal Extents', run: () => tvTool('frameH') }, { label: 'Frame Value Extents', run: () => tvTool('frameV') }],
    Keys: () => [{ label: 'Add Keys', checked: S.tvTool === 'addKeys', run: () => tvTool('addKeys') }, { label: 'Move Keys', checked: S.tvTool === 'moveKeys', run: () => tvTool('moveKeys') }, { label: 'Move Keys Horizontal', checked: S.tvTool === 'moveKeysH', run: () => tvTool('moveKeysH') }, { label: 'Move Keys Vertical', checked: S.tvTool === 'moveKeysV', run: () => tvTool('moveKeysV') }, { sep: true }, { label: 'Delete Keys', keys: 'Delete', run: () => deleteKeys() }, { label: 'Select All', keys: 'Ctrl+A', run: () => selectAll(true) }],
    Tangents: () => ['auto', 'spline', 'fast', 'slow', 'step', 'linear', 'smooth'].map(m => ({ label: `Set Tangents to ${m[0].toUpperCase() + m.slice(1)}`, run: () => setMaxTangent(m) })).concat([{ sep: true }, { label: 'Break Tangents', run: () => setMaxTangent('break') }, { label: 'Unify Tangents', run: () => setMaxTangent('unify') }]),
    Show: () => [{ label: 'Show Tangents', checked: S.showTangents, run: () => tvTool('showTangents') }],
  },
  actions: {
    tool: id => tvTool(id),
    statFrame: f => editActiveKey('frame', f), statValue: v => editActiveKey('value', v),
  },
});
max.registerWindow(tv.root);
max.host.innerHTML = '<canvas id="view" aria-label="Perspective viewport: the bouncing ball and its helpers"></canvas><div class="view-overlay" id="view-overlay"></div><div class="op-readout" id="view-readout" hidden></div>';
tv.host.innerHTML = '<canvas id="graph" aria-label="Key Window: animation curves"></canvas><canvas id="timeline" aria-label="Dope Sheet: keys by helper and track" hidden></canvas><aside class="lab-readout" id="sidebar" aria-label="Lab readout"></aside>';
const TAN_TOOLS = { tanAuto: 'auto', tanSpline: 'spline', tanFast: 'fast', tanSlow: 'slow', tanStep: 'step', tanLinear: 'linear', tanSmooth: 'smooth', breakTangents: 'break', unifyTangents: 'unify' };
function tvTool(id) {
  if (TAN_TOOLS[id]) return setMaxTangent(TAN_TOOLS[id]);
  if (['moveKeys', 'moveKeysH', 'moveKeysV', 'addKeys'].includes(id)) { S.tvTool = id; tv.setActive('moveKeys', id !== 'addKeys'); tv.setActive('addKeys', id === 'addKeys'); return msg({ addKeys: 'Add Keys: click on a curve to add a key there.', moveKeys: 'Move Keys: drag keys in time and value.', moveKeysH: 'Move Keys Horizontal: keys move only in time.', moveKeysV: 'Move Keys Vertical: keys move only in value.' }[id]); }
  if (id === 'outOfRange') return outOfRangeDialog();
  if (id === 'showTangents') { S.showTangents = !S.showTangents; tv.setActive('showTangents', S.showTangents); return drawGraph(); }
  if (id === 'frameH' || id === 'frameV') { const old = { ...S.view }; frameAll(selected().length > 0); if (id === 'frameH') { S.view.v0 = old.v0; S.view.v1 = old.v1; } else { S.view.f0 = old.f0; S.view.f1 = old.f1; } drawGraph(); return msg(id === 'frameH' ? 'Frame Horizontal Extents' : 'Frame Value Extents'); }
  if (id === 'pan') return msg('Pan: drag with the middle mouse button in the Key Window.');
  if (id === 'zoom') return msg('Zoom: roll the mouse wheel in the Key Window.');
  if (id === 'filters') return msg('Filters: this scene shows the Transform tracks of the four helpers.');
}
// Parameter Curve Out-of-Range Types of the active track: what happens before the first key and after the last.
function outOfRangeDialog() {
  const id = S.active; if (!S.data.channels[id]) return msg('Select a track in the Controller Window first.', true);
  const cur = S.data.oor?.[id] || { in: 'constant', out: 'constant' }, name = `${CHANNELS[id].bone} · ${CHANNELS[id].name}`;
  max.outOfRangeDialog({ current: cur, tracks: `${name}. Choose a thumbnail for both sides, or ◀ in (before the first key) and ▶ out (after the last key). Extend the Time Configuration to see the repeats.`,
    onChoose: (side, type) => {
      pushUndo(); S.data.oor = S.data.oor || {};
      const o = S.data.oor[id] = { in: 'constant', out: 'constant', ...S.data.oor[id] };
      if (side !== 'out') o.in = type; if (side !== 'in') o.out = type;
      msg(`Out-of-Range: ${name} ${side === 'both' ? '' : side + ' '}${type}`); changed(true);
    } });
}
function setTrackView(mode) {
  S.bottom = mode === 'dope' ? 'dopesheet' : 'timeline'; store.set('bottom', S.bottom);
  tv.setMode(mode); $('#graph').hidden = mode === 'dope'; $('#timeline').hidden = mode !== 'dope'; $('#sidebar').hidden = mode === 'dope';
  renderAll(); tv.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// 3ds Max tangent types on the selected keys. The segment after a key follows its out tangent.
function setMaxTangent(type) {
  const sel = selected(); if (!sel.length) return msg('Select keyframes first.', true);
  pushUndo();
  for (const { id, k } of sel) {
    const ks = S.data.channels[id], prev = ks[ks.indexOf(k) - 1];
    if (type === 'step') { k.interp = 'CONSTANT'; if (prev) prev.interp = 'CONSTANT'; continue; }
    if (type === 'linear') { k.interp = 'LINEAR'; k.handle = 'VECTOR'; if (prev) prev.interp = 'LINEAR'; continue; }
    k.interp = 'BEZIER'; if (prev && prev.interp !== 'BEZIER') prev.interp = 'BEZIER';
    if (type === 'auto') k.handle = 'AUTO_CLAMPED';
    else if (type === 'smooth') k.handle = 'AUTO';
    else if (type === 'fast') k.handle = 'VECTOR';
    else if (type === 'spline' || type === 'unify') k.handle = 'ALIGNED';
    else if (type === 'break') k.handle = 'FREE';
    else if (type === 'slow') { const i = ks.indexOf(k), p = ks[i - 1], n = ks[i + 1]; k.handle = 'FREE'; k.left = { frame: k.frame - (p ? (k.frame - p.frame) / 3 : 3), value: k.value }; k.right = { frame: k.frame + (n ? (n.frame - k.frame) / 3 : 3), value: k.value }; }
  }
  for (const id of new Set(sel.map(e => e.id))) recalcHandles(S.data.channels[id]);
  msg(tr('Set Tangents to {m}: {n} keys.', { m: type[0].toUpperCase() + type.slice(1), n: sel.length })); changed(true);
}
const TANGENT_NAME = k => k.interp === 'CONSTANT' ? 'Step' : k.interp === 'LINEAR' ? 'Linear' : { AUTO_CLAMPED: 'Auto', AUTO: 'Smooth', VECTOR: 'Fast', ALIGNED: 'Spline', FREE: 'Custom' }[k.handle] || 'Auto';
function editActiveKey(field, v) {
  const k = S.activeKey || selected()[0]?.k; if (!k || !Number.isFinite(v)) return;
  const id = Object.keys(S.data.channels).find(c => S.data.channels[c].includes(k)); if (!id) return;
  pushUndo();
  if (field === 'frame') { const n = Math.round(v); if (S.data.channels[id].some(q => q !== k && q.frame === n)) { S.undo.pop(); return msg('There is already a keyframe on that frame.', true); } moveKey(k, n, k.value); }
  else moveKey(k, k.frame, v);
  recalcHandles(S.data.channels[id]); changed(true);
}
function trackBarMove(frames, delta, copy) {
  const set = new Set(frames), moving = boneChannels().flatMap(id => S.data.channels[id].filter(k => set.has(k.frame)).map(k => ({ id, k })));
  if (!moving.length) return false;
  if (moving.some(({ k }) => k.frame + delta < 0)) return false;
  for (const { id, k } of moving) if (S.data.channels[id].some(q => !set.has(q.frame) && q.frame === k.frame + delta) || (copy && set.has(k.frame + delta))) return false;
  pushUndo(); clearSelection();
  for (const { id, k } of moving) {
    if (copy) { const c = { ...k, left: { ...k.left }, right: { ...k.right } }; moveKey(c, k.frame + delta, k.value); c.select = true; S.data.channels[id].push(c); }
    else { moveKey(k, k.frame + delta, k.value); k.select = true; }
  }
  for (const id of new Set(moving.map(m => m.id))) recalcHandles(S.data.channels[id]);
  changed(true); return true;
}
// Transform Type-In: exact values for the selected helper at the current frame.
function typeIn(axis, v) {
  const ch = channelOf(S.bone);
  if (S.tool === 'rotate') { if (S.bone !== 'Rotation' || axis !== 'y') return msg('Only the Rotation helper turns, around Y.', true); S.override = { ...S.override, rotY: v }; }
  else if (S.tool === 'scale') { if (!stage().free) return msg('Scale keys are only part of the free animation stage.', true); S.override = { ...S.override, scale: Math.max(.1, v / 100) }; }
  else {
    if (axis === 'y') return msg('Y is the depth of this side view: the rig does not move in Y.', true);
    if (axis === 'x' && S.bone !== 'Root') return msg('SS controls move only in Z.', true);
    if (!stage().channels.includes(axis === 'x' ? 'locX' : ch)) return msg('This control is not animated in this stage.', true);
    S.override = { ...S.override, [axis === 'x' ? 'locX' : ch]: v };
  }
  if (S.keyMode === 'auto') { S.tool === 'scale' ? keyScale() : keyControl(); } else { msg(S.keyMode === 'set' ? 'Pose ready: press Set Keys (K) to key it.' : 'Changed without a key: turn on Auto Key (N) or Set Key Mode (\') to animate it.'); renderLive(); }
}
function setToggle(name, on) {
  S.toggles[name] = on; if (name === 'ctrls') store.set('ctrls', on);
  if (name === 'ctrls') msg(on ? 'Helpers shown.' : 'Helpers hidden (Shift+H): select a helper in the Scene Explorer or press Shift+H again.');
  renderAll();
}
function renderDisplay(page) {
  page.insertAdjacentHTML('beforeend', `${rollout('Hide by Category', `<label class="mx-check"><input type="checkbox" data-toggle="ctrls" data-invert="1"${S.toggles.ctrls ? '' : ' checked'}> Helpers <span class="mx-dim">(Shift+H)</span></label><label class="mx-check dim"><input type="checkbox" disabled> Geometry</label><label class="mx-check dim"><input type="checkbox" disabled> Shapes</label><label class="mx-check dim"><input type="checkbox" disabled> Lights</label><label class="mx-check dim"><input type="checkbox" disabled> Cameras</label>`)}
    ${rollout('Display Properties', `<label class="mx-check"><input type="checkbox" data-toggle="path"${S.toggles.path ? ' checked' : ''}> Trajectory</label><p class="mx-note">Shows the path of the ball with one dot per frame: close dots are slow, far dots are fast. Yellow dots are keys.</p><label class="mx-check"><input type="checkbox" data-toggle="ghosts"${S.toggles.ghosts ? ' checked' : ''}> Show Ghosting <span class="mx-dim">(Views menu)</span></label>`)}
    ${stage().id === 'weight' ? rollout('Lab: Reference', `<label class="mx-check"><input type="checkbox" data-toggle="ref"${S.toggles.ref ? ' checked' : ''}> Physics reference</label><p class="mx-note">A real ball simulated with physics, drawn as a dashed yellow line (not a 3ds Max feature).</p>`) : ''}`);
}
max.page().addEventListener('change', e => {
  const tg = e.target.dataset?.toggle;
  if (tg) { setToggle(tg, e.target.dataset.invert ? !e.target.checked : e.target.checked); return; }
  if (e.target.id === 'ki-time') editActiveKey('frame', +e.target.value);
  if (e.target.id === 'ki-value') editActiveKey('value', +e.target.value);
});
max.page().addEventListener('click', e => {
  const c = e.target.closest('[data-prs-create]'), d = e.target.closest('[data-prs-delete]'), kt = e.target.closest('[data-ki-tan]'), ki = e.target.closest('[data-ki]');
  if (c) { const g = c.dataset.prsCreate; if (g === 'Position' && channelOf(S.bone) !== 'rotY') keyControl(); else if (g === 'Rotation' && S.bone === 'Rotation') keyControl(); else if (g === 'Scale' && stage().free && S.bone === 'Root') keyScale(); else msg(tr('{h} has no {g} track in this stage.', { h: S.bone, g }), true); }
  if (d) { const f = Math.round(S.frame), g = d.dataset.prsDelete, list = boneChannels().filter(id => KEY_TYPE(id) === g.toLowerCase()).flatMap(id => S.data.channels[id].filter(k => k.frame === f).map(k => ({ id, k }))); if (!list.length) return msg(tr('No {g} key at frame {n}.', { g, n: f }), true); clearSelection(); list.forEach(({ k }) => { k.select = true; }); deleteKeys(list); }
  if (kt) setMaxTangent(kt.dataset.kiTan);
  if (ki) { const k = S.activeKey || selected()[0]?.k; if (!k) return; const id = Object.keys(S.data.channels).find(c2 => S.data.channels[c2].includes(k)), ks = S.data.channels[id], n = ks[ks.indexOf(k) + +ki.dataset.ki]; if (n) { clearSelection(); n.select = true; S.activeKey = n; setFrame(n.frame); renderAll(); } }
});
function renderMotion(page) {
  if (!S.data) return;
  const k = S.activeKey || selected()[0]?.k, id = k && Object.keys(S.data.channels).find(c => S.data.channels[c].includes(k)), ks = id ? S.data.channels[id] : [];
  const TAN_ICON = { auto: 'tvTangentAuto', spline: 'tvTangentSpline', fast: 'tvTangentFast', slow: 'tvTangentSlow', step: 'tvTangentStep', linear: 'tvTangentLinear', smooth: 'tvTangentSmooth' };
  page.insertAdjacentHTML('beforeend', `
    <div class="mx-cats"><button type="button" class="mx-btn on" style="flex:1">Parameters</button><button type="button" class="mx-btn" style="flex:1" disabled>Trajectories</button></div>
    ${rollout('PRS Parameters', `<div class="mx-grid2"><span style="text-align:center">Create Key</span><span style="text-align:center">Delete Key</span>${['Position', 'Rotation', 'Scale'].map(g => `<button type="button" class="mx-btn" data-prs-create="${g}">${g}</button><button type="button" class="mx-btn" data-prs-delete="${g}">${g}</button>`).join('')}</div><p class="mx-note">${esc(tr('Keys {h} at the current frame ({n}), with its current pose.', { h: S.bone, n: Math.round(S.frame) }))}</p>`)}
    ${rollout('Key Info (Basic)', k && id ? `<div class="key-info"><div class="kinav"><button type="button" class="mx-btn" data-ki="-1" title="Previous key">&lt;</button><b data-no-i18n>${esc(CHANNELS[id].bone)} · ${esc(CHANNELS[id].name)} · ${ks.indexOf(k) + 1}</b><button type="button" class="mx-btn" data-ki="1" title="Next key">&gt;</button></div>
      <div class="mx-prop"><span>Time:</span>${spinner({ id: 'ki-time', value: k.frame, step: 1, decimals: 0, width: 112 })}<span></span></div>
      <div class="mx-prop"><span>Value:</span>${spinner({ id: 'ki-value', value: +k.value.toFixed(3), step: CHANNELS[id].rot ? 5 : 0.05, decimals: 3, width: 112 })}<span class="mx-unit">${CHANNELS[id].rot ? '°' : 'm'}</span></div>
      <div class="mx-prop"><span>In / Out:</span><b style="font-weight:400" data-no-i18n>${TANGENT_NAME(k)}</b><span></span></div>
      <div class="tan-pick">${Object.entries(TAN_ICON).map(([type, ic]) => `<button type="button" class="mx-tb sm${TANGENT_NAME(k).toLowerCase() === type ? ' on' : ''}" data-ki-tan="${type}" title="Set Tangents to ${type[0].toUpperCase() + type.slice(1)}">${icon(ic)}</button>`).join('')}</div></div>`
      : `<p class="mx-note">${esc(t('Select a key in the Track Bar or in Track View to see its time, value and tangents.'))}</p>`)}
    ${rollout('Assign Controller', `<div class="mx-sfs" style="max-height:none"><div class="mx-sfs-row">Transform : Position/Rotation/Scale</div><div class="mx-sfs-row" style="padding-left:18px">Position : Position XYZ</div><div class="mx-sfs-row" style="padding-left:18px">Rotation : Euler XYZ</div><div class="mx-sfs-row" style="padding-left:18px">Scale : Bezier Scale</div></div>`, false)}`);
}

// ─── 3D Viewport: the rigged ball ───────────────────────────────────────────
// Three.js axes: x = Max X, y = Max Z (up), z = -Max Y.
const viewCanvas = $('#view'), viewHost = max.host;
// The kit viewport: Max home grid, MMB pan, Alt+MMB orbit, Ctrl+Alt+MMB zoom, wheel zoom.
const vp = createMaxViewport({ host: viewHost, canvas: viewCanvas, onChange: () => { if (!S.data) return; if (!framed3) { framed3 = true; frameView3(); return; } gizmo.update(); render3(); } });
const renderer3 = vp.renderer, scene3 = vp.scene, cam3 = vp.camera;
let framed3 = false;
const ballTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); const cols = ['#e83c32', '#f5f2e9', '#1971d4', '#f6d123', '#f5f2e9', '#e83c32', '#f5f2e9', '#1971d4']; for (let i = 0; i < 8; i++) { g.fillStyle = cols[i]; g.fillRect(i * 32, 0, 32, 128); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const ball3 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 24), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }));
const ballGroup = new THREE.Group(); ballGroup.add(ball3); scene3.add(ballGroup); // the group squashes (world vertical), the ball turns inside it
const shadow3 = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
shadow3.rotation.x = -Math.PI / 2; shadow3.position.y = 0.005; scene3.add(shadow3);
// Custom rig helper shapes, drawn in front of the ball.
const CTRL_COLORS = { Root: 0x4aa3ff, SS_Top: 0x7ee07e, SS_Bottom: 0xe07ee0, Rotation: 0xffb347 };
function ctrlShape(bone) {
  let g;
  if (bone === 'Root') { g = new THREE.EdgesGeometry(new THREE.RingGeometry(0.62, 0.7, 40)); }
  else if (bone === 'Rotation') {
    // a circular arrow around the ball, in the side view plane
    const P = [], r = 0.84, a0 = Math.PI * 0.62, a1 = Math.PI * 2.38, n = 48;
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n; P.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(b) * r, Math.sin(b) * r, 0); }
    const e = [Math.cos(a0) * r, Math.sin(a0) * r]; // the arrow head points clockwise (rolling forwards)
    const dx = Math.sin(a0), dy = -Math.cos(a0); // clockwise tangent at the tip
    for (const s of [0.5, -0.5]) { const bx = -(dx * Math.cos(s) - dy * Math.sin(s)) * 0.2, by = -(dx * Math.sin(s) + dy * Math.cos(s)) * 0.2; P.push(...e, 0, e[0] + bx, e[1] + by, 0); }
    g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  } else {
    const s = new THREE.Shape(), d = bone === 'SS_Top' ? 1 : -1;
    s.moveTo(-0.22, 0); s.lineTo(0.22, 0); s.lineTo(0, 0.22 * d); s.closePath();
    g = new THREE.EdgesGeometry(new THREE.ShapeGeometry(s));
  }
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: CTRL_COLORS[bone], depthTest: false, transparent: true }));
  m.renderOrder = 10;
  if (bone === 'Root') m.rotation.x = -Math.PI / 2;
  const pick = new THREE.Mesh(bone === 'Root' ? new THREE.RingGeometry(0.5, 0.8, 24) : bone === 'Rotation' ? new THREE.RingGeometry(0.76, 0.95, 40) : new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  pick.userData.bone = bone; m.add(pick);
  scene3.add(m); return m;
}
const ctrls3 = { Root: ctrlShape('Root'), SS_Top: ctrlShape('SS_Top'), SS_Bottom: ctrlShape('SS_Bottom'), Rotation: ctrlShape('Rotation') };
// 3ds Max transform gizmos from the kit: drag an axis (it turns yellow) or a plane to constrain the transform.
const gizmo = createGizmo({ scene: scene3, camera: cam3, dom: viewCanvas });
const pathDots = new THREE.Group(), ghosts = new THREE.Group(), refGroup = new THREE.Group(); scene3.add(pathDots, ghosts, refGroup);
const dotGeo = new THREE.SphereGeometry(0.035, 8, 6), keyDotGeo = new THREE.SphereGeometry(0.06, 10, 8);
const refBall = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(0.5, 16, 10)), new THREE.LineDashedMaterial({ color: 0xffbf00, dashSize: 0.06, gapSize: 0.04 }));
refBall.computeLineDistances(); refGroup.add(refBall);
// The camera follows the ball along X until the student pans, orbits or zooms (as a locked view would).
let cameraFollowsBall = true, lastCameraFrame = null;
viewCanvas.addEventListener('pointerdown', e => { if (e.button === 1) cameraFollowsBall = false; }, true);
viewCanvas.addEventListener('wheel', () => { cameraFollowsBall = false; }, { capture: true, passive: true });
// Perspective: almost a side view (the Front view) so spacing and heights read clearly.
function frameView3(side = false) {
  const fit = Math.max(1, 1.55 / Math.max(0.6, cam3.aspect));
  const x = S.data?.channels ? valueAt('locX', S.frame) : 0;
  vp.view.target.set(x, 2.7, 0); vp.view.dist = (side ? 9.6 : 9.4) * fit;
  vp.view.az = side ? 0 : -.2; vp.view.el = side ? .02 : .1;
  cameraFollowsBall = true; lastCameraFrame = null;
  vp.update();
}
function resize3() { vp.resize(); }
const pose = f => { const over = Math.round(f) === Math.round(S.frame) && !S.playing ? S.override : {}; const sh = shape(S.data, f, over); return { x: over.locX ?? valueAt('locX', f), rot: over.rotY ?? valueAt('rotY', f), previewScale: over.previewScale ?? 1, previewDepth: over.previewDepth ?? 0, ...sh }; };
// Max's +Y points into the screen here, so a positive Y rotation turns the ball clockwise in the side view.
const toRad = deg => -deg * Math.PI / 180;
let lastPathKey = '';
function drawView() {
  const p = pose(S.frame);
  const currentFrame = Math.round(S.frame);
  if (cameraFollowsBall && lastCameraFrame !== currentFrame) {
    vp.view.target.x = p.x; lastCameraFrame = currentFrame; vp.update();
  }
  // Transform Type-In: the value of the selected helper's track for the current tool
  const zNow = S.override[channelOf(S.bone)] ?? (S.data.channels[channelOf(S.bone)] ? valueAt(channelOf(S.bone), S.frame) : 0);
  if (S.tool === 'rotate') max.setCoords(null, S.bone === 'Rotation' ? p.rot : null, null);
  else if (S.tool === 'scale') { const sc = (S.override.scale ?? (S.data.channels.scale ? valueAt('scale', S.frame) : 1)) * 100; max.setCoords(sc, sc, sc); }
  else if (S.tool === 'select') max.setCoords(p.x, 0, zNow);
  else max.setCoords(S.bone === 'Root' ? p.x : null, null, S.bone === 'Rotation' ? null : zNow);
  ballGroup.position.set(p.x, p.center, p.previewDepth); ballGroup.scale.set(p.sx * p.previewScale, p.sz * p.previewScale, p.sx * p.previewScale); ball3.rotation.set(0, 0, toRad(p.rot));
  const sh = Math.max(0.25, 1 - Math.max(0, p.bottom) / 6);
  shadow3.position.x = p.x; shadow3.scale.setScalar(p.sx * (0.6 + 0.4 * sh)); shadow3.material.opacity = 0.35 * sh;
  const anim = stage().channels;
  ctrls3.Root.position.set(p.x, Math.max(0, p.root) + 0.01, p.previewDepth);
  ctrls3.SS_Top.position.set(p.x, p.top + 0.08, p.previewDepth + 0.02); ctrls3.SS_Bottom.position.set(p.x, p.bottom - 0.08, p.previewDepth + 0.02);
  ctrls3.Rotation.position.set(p.x, p.center, p.previewDepth + 0.03); ctrls3.Rotation.rotation.z = toRad(p.rot);
  const helperPoint = S.bone === 'SS_Top' ? [p.x, p.top + .08, p.previewDepth + .08] : S.bone === 'SS_Bottom' ? [p.x, p.bottom - .08, p.previewDepth + .08] : S.bone === 'Rotation' ? [p.x, p.center, p.previewDepth + .08] : [p.x, Math.max(0, p.root) + .02, p.previewDepth + .08];
  const showGizmo = S.toggles.ctrls && S.tool !== 'select' && !S.previewing;
  gizmo.setVisible(showGizmo);
  if (showGizmo) {
    gizmo.setMode(S.tool); gizmo.attach(toMax(new THREE.Vector3(...helperPoint)));
    // Root: X and Z; squash & stretch helpers: only Z; Rotation: only Y; scale: uniform.
    gizmo.setEnabled(S.tool === 'rotate' ? { x: false, z: false, y: S.bone === 'Rotation' } : S.tool === 'scale' ? {} : { y: false, x: S.bone === 'Root' });
    gizmo.setLocked(S.axis); gizmo.update();
  }
  vp.outline(ball3, S.toggles.ctrls && S.bone === 'Root' && !S.previewing);
  const on = S.toggles.ctrls && !S.previewing;
  ctrls3.Root.visible = on; ctrls3.SS_Top.visible = on && anim.includes('topZ'); ctrls3.SS_Bottom.visible = on && anim.includes('botZ'); ctrls3.Rotation.visible = on && anim.includes('rotY');
  for (const [b, m] of Object.entries(ctrls3)) { const sel = S.bone === b; m.material.color.set(sel ? 0xffffff : CTRL_COLORS[b]); m.scale.setScalar(sel ? 1.15 : 1); }
  // motion path, ghosts and reference only need rebuilding when the animation changes
  const key = JSON.stringify([S.data.channels, S.start, S.end, S.toggles, Math.round(S.frame)]);
  if (key !== lastPathKey) {
    lastPathKey = key;
    pathDots.clear(); ghosts.clear();
    if (S.toggles.path) {
      const keyFrames = new Set(S.data.channels.locZ.map(k => k.frame));
      const pts = [];
      for (let f = S.start; f <= S.end; f++) {
        const q = shape(S.data, f), x = valueAt('locX', f), isKey = keyFrames.has(f);
        pts.push(new THREE.Vector3(x, q.center, 0));
        const col = f === Math.round(S.frame) ? 0x6aa8ff : isKey ? 0xffd24a : f < S.frame ? 0xdddddd : 0x9c9c9c;
        const m = new THREE.Mesh(isKey ? keyDotGeo : dotGeo, new THREE.MeshBasicMaterial({ color: col, depthTest: false })); m.renderOrder = 5;
        m.position.set(x, q.center, 0.55); pathDots.add(m);
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(v => v.clone().setZ(0.55))), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthTest: false }));
      pathDots.add(line);
    }
    if (S.toggles.ghosts) for (let f = S.start; f <= S.end; f += 2) {
      const q = shape(S.data, f), g = new THREE.Mesh(ball3.geometry, new THREE.MeshBasicMaterial({ color: 0xf0a020, transparent: true, opacity: 0.12, depthWrite: false }));
      g.position.set(valueAt('locX', f), q.center, 0); g.scale.set(q.sx, q.sz, q.sx); ghosts.add(g);
    }
    refGroup.visible = S.toggles.ref && stage().id === 'weight';
    if (refGroup.visible) {
      refGroup.children.filter(c => c !== refBall).forEach(c => refGroup.remove(c));
      const pts = []; for (let f = S.start; f <= S.end; f += 0.5) pts.push(new THREE.Vector3(valueAt('locX', f), REFERENCE(f) + BALL / 2, 0.5));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffbf00, dashSize: 0.12, gapSize: 0.08 })); l.computeLineDistances(); refGroup.add(l);
    }
  }
  pathDots.visible = ghosts.visible = !S.previewing;
  if (refGroup.visible) refBall.position.set(valueAt('locX', S.frame), REFERENCE(S.frame) + BALL / 2, 0);
  const secs = ((S.frame - 1) / FPS).toFixed(2);
  $('#view-overlay').innerHTML = `<div>${esc(t('Perspective'))}</div><div data-no-i18n>(${Math.round(S.frame)}) Helper : <b>${esc(S.bone)}</b></div><div>${secs} s · X ${p.x.toFixed(2)} m · ${esc(tr('Height {v} m', { v: Math.max(0, p.bottom).toFixed(2) }))} · ${esc(tr('Scale {x} × {z}', { x: p.sx.toFixed(2), z: p.sz.toFixed(2) }))}</div>${stage().channels.includes('rotY') ? `<div>${esc(tr('Rotation {v}°', { v: p.rot.toFixed(0) }))}</div>` : ''}${Object.keys(S.override).length ? `<div class="unkeyed">${esc(t('Unkeyed change: click Set Keys'))}</div>` : ''}`;
  render3();
}
function render3() { renderer3.render(scene3, cam3); }

// Selecting and posing the controls in the viewport
const ray3 = new THREE.Raycaster();
function pickCtrl(e) {
  const r = viewCanvas.getBoundingClientRect();
  ray3.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam3);
  const picks = Object.values(ctrls3).filter(m => m.visible).map(m => m.children[0]);
  const hit = ray3.intersectObjects(picks, false)[0];
  if (hit) return hit.object.userData.bone;
  if (ray3.intersectObject(ball3, false).length) return S.toggles.ctrls ? 'Root' : null;
  return null;
}
function selectBone(bone) {
  if (S.vgrab) endVGrab(false);
  if (S.vrot) endVRot(false);
  if (S.vscale) endVScale(false);
  S.bone = bone; max.select(bone);
  const ch = channelOf(bone);
  if (stage().channels.includes(ch)) { S.active = ch; S.hidden.delete(ch); }
  renderAll();
}
// 3ds Max: click a helper to select it; drag it, or an axis / plane of its gizmo, to transform it.
// Release to finish, right-click while dragging to cancel. The middle button navigates (kit viewport).
const gizmoPart = e => S.toggles.ctrls && S.tool !== 'select' ? gizmo.pick(e) : null;
viewCanvas.addEventListener('pointerdown', e => {
  closeMenu();
  if (e.button !== 0 || e.altKey) return;
  const r = viewCanvas.getBoundingClientRect(); S.vpointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  let part = gizmoPart(e);
  const b = part ? S.bone : pickCtrl(e);
  if (!b) return;
  if (b !== S.bone) { if (max.state.lock) return msg('Selection Lock is on: press Space to unlock it.', true); selectBone(b); }
  if (S.tool === 'select') return;
  // which gizmo part drives the drag: the one clicked, or the axis constraint (F5–F8), or the free plane
  if (S.tool === 'move') {
    if (!part) part = S.axis || (S.bone === 'Root' ? 'xz' : 'z');
    if (part.includes('y')) { if (part === 'y') return msg('Y is the depth of this side view: the rig does not move in Y.', true); part = part.replace('y', ''); }
    if (S.bone !== 'Root') { if (!part.includes('z')) return msg('SS controls move only in Z.', true); part = 'z'; }
  } else if (S.tool === 'rotate') {
    if (part && part !== 'y' && part !== 'view') return msg('The Rotation helper turns only around Y: drag the green circle.', true);
    part = 'y';
  } else part = 'xyz';
  S.vpointer.axis = part;
  if (S.tool === 'move') startVGrab(); else if (S.tool === 'rotate') startVRot(); else startVScale();
  const g = S.vgrab || S.vrot || S.vscale; if (!g) return;
  e.preventDefault(); viewCanvas.setPointerCapture(e.pointerId);
  g.gizmo = true; if (S.vgrab) S.vgrab.axis = part === 'x' ? 'x' : part === 'z' ? 'z' : null;
  gizmo.begin(e, part); drawView();
});
viewCanvas.addEventListener('pointermove', e => {
  const r = viewCanvas.getBoundingClientRect(); S.vpointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  const g = S.vgrab || S.vrot || S.vscale;
  if (g?.gizmo) {
    const d = gizmo.drag(e); if (!d) return;
    if (S.vgrab && d.move) { g.gm = d.move; updateVGrab(); }
    if (S.vrot && d.angle != null) { g.acc = d.angle; updateVRot(); }
    if (S.vscale && d.scale != null) { g.gs = d.scale; updateVScale(); }
    return;
  }
  if (S.vgrab) return updateVGrab();
  if (S.vrot) return updateVRot(true);
  if (S.vscale) return updateVScale();
  if (vp.isNavigating()) return;
  if (gizmo.hover(e)) render3();
  const over = gizmo.hoveredPart || (S.tool !== 'select' && pickCtrl(e));
  viewCanvas.style.cursor = over ? (S.tool === 'rotate' ? 'alias' : S.tool === 'scale' ? 'nesw-resize' : S.tool === 'move' ? 'move' : 'pointer') : 'default';
});
viewCanvas.addEventListener('pointerup', e => {
  if (!(S.vgrab || S.vrot || S.vscale)) return;
  if (viewCanvas.hasPointerCapture(e.pointerId)) viewCanvas.releasePointerCapture(e.pointerId);
  gizmo.end();
  if (S.vgrab) endVGrab(true); if (S.vrot) endVRot(true); if (S.vscale) endVScale(true);
});
viewCanvas.addEventListener('contextmenu', e => {
  if (!(S.vgrab || S.vrot || S.vscale)) return;
  e.preventDefault(); gizmo.end();
  if (S.vgrab) endVGrab(false); if (S.vrot) endVRot(false); if (S.vscale) endVScale(false);
  msg('Transform cancelled (right-click).');
});
// G in the 3D Viewport. The Root moves in X (forwards) and Z (up); the squash & stretch controls only in Z.
// This lab lets X or Z lock the axis while moving a helper.
function startVGrab() {
  if (S.bone === 'Rotation') return msg('The Rotation helper turns: choose Select and Rotate or press E.', true);
  const ch = channelOf(S.bone);
  if (!stage().channels.includes(ch)) return msg('This control is not animated in this stage.', true);
  if (!S.vpointer) S.vpointer = { x: viewCanvas.clientWidth / 2, y: viewCanvas.clientHeight / 2 };
  const start = S.override[ch] ?? +valueAt(ch, S.frame).toFixed(3);
  const root = S.bone === 'Root', startX = S.override.locX ?? +valueAt('locX', S.frame).toFixed(3);
  const p = pose(S.frame), world = new THREE.Vector3(p.x, p.center, 0);
  const dist = cam3.position.distanceTo(world), wpp = 2 * dist * Math.tan(cam3.fov * Math.PI / 360) / viewCanvas.clientHeight;
  S.vgrab = { ch, root, start, startX, x0: S.vpointer.x, y0: S.vpointer.y, wpp, num: '', axis: S.axis || (root ? null : 'z'), prev: { ...S.override } };
  viewHost.classList.add('modal'); updateVGrab();
}
function startVScale() {
  if (!S.toggles.ctrls) return msg('Helpers are hidden: press Shift+H to show them.', true);
  if (!S.vpointer) S.vpointer = { x: viewCanvas.clientWidth / 2, y: viewCanvas.clientHeight / 2 };
  if (stage().free) { S.active = 'scale'; S.bone = 'Root'; S.hidden.delete('scale'); renderChannels(); drawGraph(); }
  S.vscale = { start: stage().free ? S.override.scale ?? valueAt('scale', S.frame) : S.override.previewScale ?? 1, x0: S.vpointer.x, y0: S.vpointer.y, num: '', prev: { ...S.override } };
  viewHost.classList.add('modal'); updateVScale();
}
function updateVScale() {
  const g = S.vscale; if (!g) return;
  const typed = g.num !== '' && g.num !== '-' && !isNaN(+g.num) ? +g.num / 100 : null;
  const drag = Math.max(.1, g.gs != null ? g.start * g.gs : g.start + -(S.vpointer.y - g.y0) * .01);
  const factor = Math.max(.1, typed ?? drag);
  S.override = { ...g.prev, [stage().free ? 'scale' : 'previewScale']: +factor.toFixed(3) };
  $('#view-readout').hidden = false; $('#view-readout').textContent = `${t('Scale')}  ${Math.round(factor * 100)}%${g.num ? `  [${g.num}%]` : ''} · ${t('uniform')}`;
  drawView(); renderSidebar();
}
function endVScale(ok) {
  const g = S.vscale; if (!g) return;
  S.vscale = null; viewHost.classList.remove('modal'); $('#view-readout').hidden = true;
  if (!ok) S.override = g.prev;
  else if (stage().free) {
    if (Math.abs(S.override.scale - valueAt('scale', S.frame)) < 1e-4) delete S.override.scale;
    else if (S.keyMode === 'auto') keyScale();
    else msg('Scaled. Click Set Keys to save the scale before changing frame.');
  } else msg('Preview scale applied. Click another frame to clear it; scale keys are not part of this rig.');
  drawView(); renderSidebar();
}
function updateVGrab() {
  const g = S.vgrab; if (!g) return;
  const typed = g.num !== '' && g.num !== '-' && !isNaN(+g.num) ? +g.num : null;
  let dx = g.gm ? g.gm.x : (S.vpointer.x - g.x0) * g.wpp, dz = g.gm ? g.gm.z : -(S.vpointer.y - g.y0) * g.wpp, dy = dz;
  if (typed != null) { if (g.axis === 'z') { dz = typed; dx = 0; } else if (g.axis === 'y') { dy = typed; dx = 0; dz = 0; } else { dx = typed; dz = 0; } }
  if (g.axis === 'x') dz = 0;
  if (g.axis === 'y') { dx = 0; dz = 0; }
  if (g.axis === 'z' || !g.root) dx = 0;
  const over = { ...g.prev };
  if (g.axis === 'y') over.previewDepth = Math.round(((g.prev.previewDepth ?? 0) + dy) * 1000) / 1000;
  else { over[g.ch] = Math.round((g.start + dz) * 1000) / 1000; if (g.root && dx !== 0) over.locX = Math.round((g.startX + dx) * 1000) / 1000; }
  S.override = over;
  $('#view-readout').hidden = false;
  const lock = g.root ? (g.axis ? ` · ${t(g.axis === 'x' ? 'only X' : g.axis === 'y' ? 'only Y' : 'only Z')}` : ` · ${t('X / Z lock an axis')}`) : ` · ${t('SS controls move only in Z')}`;
  $('#view-readout').textContent = g.axis === 'y' ? `${t('Move')}  Y ${dy >= 0 ? '+' : ''}${dy.toFixed(2)} m${g.num ? `  [${g.num}]` : ''}${lock}` : `${t('Move')}${g.root ? `  X ${dx >= 0 ? '+' : ''}${dx.toFixed(2)} m` : ''}  Z ${dz >= 0 ? '+' : ''}${dz.toFixed(2)} m${g.num ? `  [${g.num}]` : ''}${lock}`;
  drawView(); renderSidebar();
}
function endVGrab(ok) {
  const g = S.vgrab; if (!g) return;
  S.vgrab = null; viewHost.classList.remove('modal'); $('#view-readout').hidden = true;
  if (!ok) S.override = g.prev;
  else if (g.axis === 'y') msg('Depth preview applied. Click another frame to clear it; the rig has no Y Position track.');
  else {
    for (const c of [g.ch, 'locX']) if (S.override[c] != null && Math.abs(S.override[c] - valueAt(c, S.frame)) < 1e-3) delete S.override[c];
    if (Object.keys(S.override).length) { if (S.keyMode === 'auto') keyControl(); else msg('Moved. Click Set Keys to save the pose before changing frame.'); }
  }
  drawView(); renderSidebar();
}
// R in the 3D Viewport: turn the Rotation control. Clockwise = rolling forwards (+Y). Typed numbers are degrees.
function startVRot() {
  if (S.bone !== 'Rotation') return msg(S.toggles.ctrls ? 'Select the orange Rotation helper to rotate. Use Select and Move for the other helpers.' : 'Helpers are hidden: press Shift+H to show them.', true);
  if (!stage().channels.includes('rotY')) return msg('This control is not animated in this stage.', true);
  if (!S.vpointer) S.vpointer = { x: viewCanvas.clientWidth / 2 + 120, y: viewCanvas.clientHeight / 2 };
  const c = centreOnScreen(), a = Math.atan2(-(S.vpointer.y - c.y), S.vpointer.x - c.x);
  S.vrot = { start: S.override.rotY ?? +valueAt('rotY', S.frame).toFixed(2), last: a, acc: 0, num: '', prev: { ...S.override } };
  viewHost.classList.add('modal'); updateVRot();
}
function centreOnScreen() {
  const p = pose(S.frame), v = new THREE.Vector3(p.x, p.center, 0).project(cam3);
  return { x: (v.x + 1) / 2 * viewCanvas.clientWidth, y: (1 - v.y) / 2 * viewCanvas.clientHeight };
}
function updateVRot(move = false) {
  const r = S.vrot; if (!r) return;
  if (move) { const c = centreOnScreen(), a = Math.atan2(-(S.vpointer.y - c.y), S.vpointer.x - c.x); let d = a - r.last; d = ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; r.acc -= d * 180 / Math.PI; r.last = a; }
  const typed = r.num !== '' && r.num !== '-' && !isNaN(+r.num) ? +r.num : null, delta = Math.round(r.acc);
  const target = typed ?? r.start + delta;
  S.override = { ...r.prev, rotY: Math.round(target * 100) / 100 };
  $('#view-readout').hidden = false;
  $('#view-readout').textContent = `${t('Rotate')}  Y ${target.toFixed(0)}°${r.num ? `  [${r.num}]` : ''} · ${t('clockwise = forwards')}`;
  drawView(); renderSidebar();
}
function endVRot(ok) {
  const r = S.vrot; if (!r) return;
  S.vrot = null; viewHost.classList.remove('modal'); $('#view-readout').hidden = true;
  if (!ok) S.override = r.prev;
  else { if (S.override.rotY != null && Math.abs(S.override.rotY - valueAt('rotY', S.frame)) < 1e-3) delete S.override.rotY; if (Object.keys(S.override).length) { if (S.keyMode === 'auto') keyControl(); else msg('Rotated. Click Set Keys to save the pose before changing frame.'); } }
  drawView(); renderSidebar();
}
function vrotKey(e) {
  const r = S.vrot, k = e.key;
  if (k === 'Escape') return endVRot(false);
  if (k === 'Enter' || k === ' ') return endVRot(true);
  if (/^[0-9.]$/.test(k)) r.num += k;
  else if (k === '-') r.num = r.num.startsWith('-') ? r.num.slice(1) : '-' + r.num;
  else if (k === 'Backspace') r.num = r.num.slice(0, -1);
  else if (/^[xyzXYZ]$/.test(k)) { msg('The Rotation control turns only around Y in this rig.'); return; }
  else return;
  updateVRot();
}
  function vgrabKey(e) {
  const g = S.vgrab, k = e.key;
  if (k === 'Escape') return endVGrab(false);
  if (k === 'Enter' || k === ' ') return endVGrab(true);
  if (/^[0-9.]$/.test(k)) g.num += k;
  else if (k === '-') g.num = g.num.startsWith('-') ? g.num.slice(1) : '-' + g.num;
  else if (k === 'Backspace') g.num = g.num.slice(0, -1);
  else if ((k === 'x' || k === 'X') && g.root) g.axis = g.axis === 'x' ? null : 'x';
  else if ((k === 'z' || k === 'Z') && g.root) g.axis = g.axis === 'z' ? null : 'z';
  else if (k === 'z' || k === 'Z') return;
  else if (k === 'x' || k === 'X' || k === 'y' || k === 'Y') { msg(g.root ? 'The ball moves in X and Z in this lab (side view).' : 'SS controls move only in Z.'); return; }
  else return;
  updateVGrab();
}
function vscaleKey(e) {
  const g = S.vscale, k = e.key;
  if (k === 'Escape') return endVScale(false);
  if (k === 'Enter' || k === ' ') return endVScale(true);
  if (/^[0-9.]$/.test(k)) g.num += k;
  else if (k === 'Backspace') g.num = g.num.slice(0, -1);
  else return;
  updateVScale();
}
// Set Keys: key the selected helper at the current frame, with its current pose.
// The Z Position is always keyed; the Root's X Position only when it was moved,
// so keying a bounce does not put ease-in and ease-out into a constant travel.
function keyControl() {
  const ch = channelOf(S.bone);
  if (!stage().channels.includes(ch)) return msg('This control is not animated in this stage.', true);
  const f = Math.round(S.frame);
  pushUndo(); clearSelection();
  const chans = [ch];
  if (S.bone === 'Root' && S.override.locX != null && Math.abs(S.override.locX - valueAt('locX', f)) > 1e-4) chans.push('locX');
  let last = null;
  for (const c of chans) {
    const ks = S.data.channels[c], v = +(S.override[c] ?? valueAt(c, f)).toFixed(3);
    let k = ks.find(q => q.frame === f);
    if (k) moveKey(k, f, v);
    else { const prev = [...ks].reverse().find(q => q.frame < f); k = key(f, v, c === 'locX' && prev ? prev.interp : 'BEZIER'); ks.push(k); }
    delete S.override[c]; k.select = true; last = k; recalcHandles(ks);
  }
  S.activeKey = last; S.active = ch;
  msg(tr('Inserted a keyframe on {c} at frame {n}.', { c: ch === 'rotY' ? 'Rotation · Y Rotation' : `${S.bone} · ${[...chans].sort().map(c => CHANNELS[c].axis).join(', ')} Position`, n: f })); changed(true);
}
function keyScale() {
  if (!stage().free) return;
  const f = Math.round(S.frame), ks = S.data.channels.scale;
  pushUndo(); clearSelection();
  const v = +(S.override.scale ?? valueAt('scale', f)).toFixed(3);
  let k = ks.find(q => q.frame === f);
  if (k) moveKey(k, f, v);
  else { k = key(f, v); ks.push(k); }
  delete S.override.scale;
  k.select = true; S.activeKey = k; S.active = 'scale'; S.bone = 'Root';
  recalcHandles(ks);
  msg(tr('Inserted a keyframe on {c} at frame {n}.', { c: CHANNELS.scale.name, n: f })); changed(true);
}
function syncTransformTools() {
  max.setModes({ tool: S.tool, silent: true });
  gizmo.setVisible(S.toggles.ctrls && S.tool !== 'select');
}
function activateTool(tool) {
  if (S.vgrab) endVGrab(false);
  if (S.vrot) endVRot(false);
  if (S.vscale) endVScale(false);
  S.tool = tool; store.set('tool', tool); syncTransformTools(); drawView();
  if (tool === 'rotate' && S.bone !== 'Rotation') msg('Select and Rotate: only the orange Rotation helper turns in this rig.');
}
function chooseAxis(axis) {
  S.axis = axis && S.axis === axis ? null : axis;
  store.set('axis', S.axis);
  msg(S.axis ? tr('Restrict to {a}', { a: S.axis.toUpperCase() }) : 'Axis constraint off: free move in the view plane.');
  if (S.vgrab) {
    S.vgrab.axis = S.axis || (S.vgrab.root ? null : 'z');
    updateVGrab();
  }
  syncTransformTools(); drawView();
}
function syncKeyMode() {
  max.setModes({ auto: S.keyMode === 'auto', setMode: S.keyMode === 'set' });
}
function chooseKeyMode(mode) {
  S.keyMode = S.keyMode === mode ? 'off' : mode;
  store.set('keyMode', S.keyMode);
  syncKeyMode();
  msg(S.keyMode === 'auto' ? 'Auto Key: moving a helper creates a key.' : S.keyMode === 'set' ? 'Set Key Mode: pose a helper, then click Set Keys.' : 'Key modes off. Enable Auto Key or Set Key Mode to animate.');
}
syncKeyMode(); syncTransformTools();
function clearControl() {
  if (stage().free && S.tool === 'scale') {
    S.override.scale = 1; drawView(); renderSidebar();
    if (S.keyMode === 'auto') keyScale(); else msg('Scaled. Click Set Keys to save the scale before changing frame.');
    return;
  }
  const ch = channelOf(S.bone);
  if (!stage().channels.includes(ch)) return;
  if (ch === 'locZ') return msg('Resetting the Root would send the ball to the origin (X 0, Z 0). Move it instead.');
  S.override = { ...S.override, [ch]: 0 }; drawView(); renderSidebar();
  if (S.keyMode === 'auto') keyControl(); else msg(ch === 'rotY' ? 'Rotation reset. Click Set Keys to save it.' : 'Position reset. Click Set Keys to save it.');
}
function dropOverrides() {
  const lost = Object.entries(S.override).some(([ch, v]) => Math.abs(v - valueAt(ch, S.frame)) > 1e-3);
  S.override = {};
  if (lost) msg('The unkeyed change was discarded. Use Set Keys or Auto Key before changing frame.', true);
}

// ─── Track View – Curve Editor ─────────────────────────────────────────────
const graphCanvas = $('#graph');
const RULER = 22;
function graphSize() { const r = graphCanvas.getBoundingClientRect(); return { w: r.width, h: r.height }; }
const gx = f => { const { w } = graphSize(); return (f - S.view.f0) / (S.view.f1 - S.view.f0) * w; };
const TOPPAD = 10;
const gy = v => { const { h } = graphSize(); return TOPPAD + (1 - (v - S.view.v0) / (S.view.v1 - S.view.v0)) * (h - RULER - TOPPAD - 8); };
const fx = x => { const { w } = graphSize(); return S.view.f0 + x / w * (S.view.f1 - S.view.f0); };
const vy = y => { const { h } = graphSize(); return S.view.v0 + (1 - (y - TOPPAD) / (h - RULER - TOPPAD - 8)) * (S.view.v1 - S.view.v0); };

function frameAll(onlySelected = false) {
  let f0 = Infinity, f1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const list = onlySelected ? selected() : allKeys();
  for (const { id, k } of list) {
    if (id === 'locX' && !onlySelected && visibleChannels().length > 1) continue; // X Position is only the travel
    for (const p of [k, k.left, k.right]) { f0 = Math.min(f0, p.frame); f1 = Math.max(f1, p.frame); v0 = Math.min(v0, p.value); v1 = Math.max(v1, p.value); }
  }
  if (!isFinite(f0)) { f0 = S.start; f1 = S.end; v0 = 0; v1 = 4; }
  if (!onlySelected) { f0 = Math.min(f0, S.start); f1 = Math.max(f1, S.end); }
  if (f1 - f0 < 6) { f0 -= 3; f1 += 3; }
  if (v1 - v0 < 0.4) { v0 -= 0.2; v1 += 0.2; }
  const pf = (f1 - f0) * 0.04, pv = (v1 - v0) * 0.12;
  S.view = { f0: f0 - pf, f1: f1 + pf, v0: v0 - pv, v1: v1 + pv };
}

function drawGraph() {
  const { ctx, w, h } = fitCanvas(graphCanvas);
  ctx.fillStyle = '#303030'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#383838'; ctx.fillRect(gx(S.start), 0, gx(S.end) - gx(S.start), h - RULER);
  // grid
  const fs = Math.max(1, niceStep(S.view.f1 - S.view.f0, w, 46)), vs = niceStep(S.view.v1 - S.view.v0, h, 34);
  ctx.lineWidth = 1; ctx.font = '11px Segoe UI, Arial, sans-serif';
  for (let f = Math.ceil(S.view.f0 / fs) * fs; f <= S.view.f1; f += fs) { ctx.strokeStyle = '#444'; ctx.beginPath(); ctx.moveTo(gx(f), 0); ctx.lineTo(gx(f), h - RULER); ctx.stroke(); }
  for (let v = Math.ceil(S.view.v0 / vs) * vs; v <= S.view.v1; v += vs) {
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? '#1f1f1f' : '#444'; ctx.beginPath(); ctx.moveTo(0, gy(v)); ctx.lineTo(w, gy(v)); ctx.stroke();
    ctx.fillStyle = '#d0d0d0'; ctx.fillText(+v.toFixed(2), 4, gy(v) - 3);
  }
  // outside the frame range

  // reference
  if (S.toggles.ref && stage().id === 'weight' && !S.hidden.has('locZ')) {
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ffbf00b0'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let x = 0; x <= w; x += 2) { const y = gy(REFERENCE(fx(x))); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // Contact intervals under the Z Position curve.
  if (!S.hidden.has('locZ')) {
    const c = contacts(S.data.channels.locZ), y = gy(0) + 12;
    ctx.strokeStyle = '#6f8fb8'; ctx.fillStyle = '#9dc0ea'; ctx.lineWidth = 1;
    intervals(c).forEach((n, i) => {
      const a = gx(c[i]), b = gx(c[i + 1]);
      ctx.beginPath(); ctx.moveTo(a, y - 4); ctx.lineTo(a, y); ctx.lineTo(b, y); ctx.lineTo(b, y - 4); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(`${n} f`, (a + b) / 2, y + 11); ctx.textAlign = 'left';
    });
  }
  // curves
  for (const id of visibleChannels()) {
    const ch = CHANNELS[id], act = id === S.active;
    ctx.strokeStyle = ch.color; ctx.globalAlpha = act ? 1 : 0.55; ctx.lineWidth = act ? 2 : 1.4;
    if (!editable(id)) ctx.setLineDash([3, 3]);
    // Max draws the curve between the first and last key solid, and the out-of-range part dashed
    const ks = S.data.channels[id], kf0 = Math.min(...ks.map(k => k.frame)), kf1 = Math.max(...ks.map(k => k.frame));
    for (const inside of [true, false]) {
      if (!inside) { ctx.setLineDash([5, 4]); ctx.globalAlpha *= .8; }
      ctx.beginPath(); let pen = false;
      for (let x = 0; x <= w; x += 1.5) { const f = fx(x), inRange = f >= kf0 - .01 && f <= kf1 + .01; if (inRange !== inside) { pen = false; continue; } const y = gy(valueAt(id, f)); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (!editable(id)) continue;
    for (const k of S.data.channels[id]) {
      if (S.showTangents && (k.select && k.interp === 'BEZIER' || k.select && prevInterp(id, k) === 'BEZIER')) {
        for (const side of ['left', 'right']) {
          const hp = k[side];
          if (side === 'left' && prevInterp(id, k) !== 'BEZIER') continue;
          if (side === 'right' && k.interp !== 'BEZIER') continue;
          // Max draws tangent handles as black lines ending in small squares
          ctx.strokeStyle = '#101010'; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(gx(k.frame), gy(k.value)); ctx.lineTo(gx(hp.frame), gy(hp.value)); ctx.stroke();
          ctx.fillStyle = S.drag?.handle?.k === k && S.drag.handle.side === side ? '#fff' : '#1a1a1a';
          ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 1;
          ctx.fillRect(gx(hp.frame) - 3.5, gy(hp.value) - 3.5, 7, 7); ctx.strokeRect(gx(hp.frame) - 3.5, gy(hp.value) - 3.5, 7, 7);
        }
      }
    }
    for (const k of S.data.channels[id]) {
      // keys: dark squares, white when selected (as in Max's Key Window)
      ctx.fillStyle = k.select ? '#ffffff' : '#1c1c1c';
      ctx.strokeStyle = k.select ? '#000' : '#9a9a9a'; ctx.lineWidth = 1;
      ctx.fillRect(gx(k.frame) - 4, gy(k.value) - 4, 8, 8); ctx.strokeRect(gx(k.frame) - 4, gy(k.value) - 4, 8, 8);
    }
  }
  // box select
  if (S.drag?.box) {
    const b = S.drag.box; ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); ctx.setLineDash([]);
  }
  // ruler + current frame
  // time ruler at the bottom and the current time as a yellow double line
  const cx = gx(S.frame);
  ctx.strokeStyle = '#d9c13a'; ctx.lineWidth = 1;
  for (const o of [-1.5, 1.5]) { ctx.beginPath(); ctx.moveTo(cx + o, 0); ctx.lineTo(cx + o, h - RULER); ctx.stroke(); }
  ctx.fillStyle = '#444'; ctx.fillRect(0, h - RULER, w, RULER);
  ctx.strokeStyle = '#2a2a2a'; ctx.beginPath(); ctx.moveTo(0, h - RULER + .5); ctx.lineTo(w, h - RULER + .5); ctx.stroke();
  ctx.fillStyle = '#d0d0d0'; ctx.strokeStyle = '#aaa';
  for (let f = Math.ceil(S.view.f0 / fs) * fs; f <= S.view.f1; f += fs) { ctx.beginPath(); ctx.moveTo(gx(f) + .5, h - RULER); ctx.lineTo(gx(f) + .5, h - RULER + 5); ctx.stroke(); ctx.fillText(String(f), gx(f) + 2, h - 6); }
  if (S.grab) { ctx.fillStyle = '#ffffffcc'; ctx.fillText(t(S.tvTool === 'moveKeysH' ? 'Move Keys Horizontal: time only' : S.tvTool === 'moveKeysV' ? 'Move Keys Vertical: value only' : S.grab.axis ? `Move Keys · Shift: ${S.grab.axis === 'x' ? 'time only' : 'value only'}` : 'Move Keys · Shift+drag keeps one direction'), 8, h - RULER - 8); }
}
function prevInterp(id, k) { const ks = S.data.channels[id], i = ks.indexOf(k); return i > 0 ? ks[i - 1].interp : null; }

function hitTest(x, y) {
  const near = (p, r = 8) => Math.hypot(gx(p.frame) - x, gy(p.value) - y) <= r;
  for (const id of visibleChannels()) {
    if (!editable(id)) continue;
    for (const k of S.data.channels[id]) if (k.select) {
      if (prevInterp(id, k) === 'BEZIER' && near(k.left, 7)) return { id, k, side: 'left' };
      if (k.interp === 'BEZIER' && near(k.right, 7)) return { id, k, side: 'right' };
    }
  }
  const order = [S.active, ...visibleChannels().filter(i => i !== S.active)];
  for (const id of order) {
    if (!visibleChannels().includes(id) || !editable(id)) continue;
    for (const k of S.data.channels[id]) if (near(k)) return { id, k };
  }
  return null;
}
function clearSelection() { for (const ks of Object.values(S.data.channels)) for (const k of ks) k.select = false; S.activeKey = null; }

function setupGraphInput() {
  const c = graphCanvas;
  c.addEventListener('contextmenu', e => { e.preventDefault(); if (S.grab) return cancelGrab(); openMenu('context', e.clientX, e.clientY); });
  c.addEventListener('pointerdown', e => {
    closeMenu();
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (S.grab) { if (e.button === 0) confirmGrab(); else cancelGrab(); return; }
    if (e.button === 1) { S.drag = { pan: true, x, y, view: { ...S.view } }; c.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (e.button !== 0) return;
    c.setPointerCapture(e.pointerId);
    if (y > r.height - RULER) { S.drag = { scrub: true }; setFrame(Math.round(fx(x))); return; }
    const hit = hitTest(x, y);
    if (S.tvTool === 'addKeys' && !hit) {
      // Add Keys: click on the active curve to add a key at that frame
      const f = Math.round(fx(x)), id = S.active, ks = S.data.channels[id];
      if (!visibleChannels().includes(id)) return msg('Show the curve first: click its track in the Controller Window.', true);
      if (ks.some(q => q.frame === f)) return msg('There is already a keyframe on that frame.', true);
      pushUndo(); clearSelection(); const k = key(f, +valueAt(id, f).toFixed(3)); k.select = true; ks.push(k); recalcHandles(ks); S.activeKey = k;
      msg(tr('Inserted a keyframe on {c} at frame {n}.', { c: CHANNELS[id].name, n: f })); changed(true); return;
    }
    if (hit?.side) { S.drag = { handle: hit, x, y, started: false }; S.active = hit.id; S.activeKey = hit.k; renderAll(); return; }
    if (hit) {
      if (e.altKey) { hit.k.select = false; S.activeKey = null; renderAll(); return; }
      if (e.ctrlKey || e.metaKey) { hit.k.select = !hit.k.select; S.activeKey = hit.k.select ? hit.k : null; }
      else if (!hit.k.select) { clearSelection(); hit.k.select = true; S.activeKey = hit.k; }
      else S.activeKey = hit.k;
      S.active = hit.id;
      S.drag = { move: true, x, y, started: false };
      renderAll(); return;
    }
    if (!e.ctrlKey) clearSelection();
    S.drag = { box: { x0: x, y0: y, x1: x, y1: y }, add: e.ctrlKey };
    renderAll();
  });
  c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (S.grab) { updateGrab(x, y); return; }
    const d = S.drag; if (!d) return;
    if (d.pan) {
      const df = (x - d.x) / r.width * (d.view.f1 - d.view.f0), dv = (y - d.y) / (r.height - RULER - TOPPAD - 8) * (d.view.v1 - d.view.v0);
      S.view = { f0: d.view.f0 - df, f1: d.view.f1 - df, v0: d.view.v0 + dv, v1: d.view.v1 + dv }; drawGraph(); return;
    }
    if (d.scrub) { setFrame(Math.round(fx(x))); return; }
    if (d.box) { d.box.x1 = x; d.box.y1 = y; drawGraph(); return; }
    if (!d.started && Math.hypot(x - d.x, y - d.y) < 3) return;
    if (!d.started) { d.started = true; pushUndo(); if (d.move) { startGrab(d.x, d.y, true); if (e.shiftKey && S.grab && !S.grab.axis) S.grab.axis = Math.abs(x - d.x) > Math.abs(y - d.y) ? 'x' : 'y'; } }
    if (d.handle) { moveHandle(d.handle.k, d.handle.side, fx(x), vy(y)); changed(); return; }
    if (d.move) updateGrab(x, y);
  });
  const end = () => {
    const d = S.drag; S.drag = null;
    if (S.grab?.byDrag) { confirmGrab(); return; }
    if (d?.box) {
      const b = d.box, xa = Math.min(b.x0, b.x1), xb = Math.max(b.x0, b.x1), ya = Math.min(b.y0, b.y1), yb = Math.max(b.y0, b.y1);
      for (const { k } of allKeys(editable)) { const X = gx(k.frame), Y = gy(k.value); if (X >= xa && X <= xb && Y >= ya && Y <= yb) k.select = true; }
      renderAll();
    }
    if (d?.handle?.k && d.started) changed(true);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('wheel', e => {
    e.preventDefault();
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const f = fx(x), v = vy(y), z = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    S.view = { f0: f - (f - S.view.f0) * z, f1: f + (S.view.f1 - f) * z, v0: v - (v - S.view.v0) * z, v1: v + (S.view.v1 - v) * z };
    drawGraph();
  }, { passive: false });
}

// G: move the selected keys with the mouse (also used when dragging).
function startGrab(x, y, byDrag = false) {
  const sel = selected();
  if (!sel.length) return msg('Select keyframes first.', true);
  if (!byDrag) pushUndo();
  S.grab = { x, y, byDrag, axis: S.tvTool === 'moveKeysH' ? 'x' : S.tvTool === 'moveKeysV' ? 'y' : null, orig: sel.map(({ id, k }) => ({ id, k, frame: k.frame, value: k.value, left: { ...k.left }, right: { ...k.right } })) };
  drawGraph();
}
function updateGrab(x, y) {
  const g = S.grab; if (!g) return;
  g.lastX = x; g.lastY = y;
  let df = Math.round(fx(x) - fx(g.x)), dv = vy(y) - vy(g.y);
  if (g.axis === 'x') dv = 0;
  if (g.axis === 'y') df = 0;
  for (const o of g.orig) { o.k.frame = o.frame; o.k.value = o.value; o.k.left = { ...o.left }; o.k.right = { ...o.right }; }
  // keys of one channel can't land on another key's frame
  const blocked = g.orig.some(o => S.data.channels[o.id].some(k => !k.select && k.frame === o.frame + df));
  if (blocked) df = 0;
  for (const o of g.orig) moveKey(o.k, o.frame + df, +(o.value + dv).toFixed(3));
  for (const id of new Set(g.orig.map(o => o.id))) recalcHandles(S.data.channels[id]);
  changed(false);
}
function confirmGrab() { if (!S.grab) return; S.grab = null; changed(true); }
function cancelGrab() {
  const g = S.grab; if (!g) return;
  for (const o of g.orig) { o.k.frame = o.frame; o.k.value = o.value; o.k.left = { ...o.left }; o.k.right = { ...o.right }; }
  for (const id of new Set(g.orig.map(o => o.id))) recalcHandles(S.data.channels[id]);
  S.grab = null; S.undo.pop(); changed(false);
}

// ─── Key operations ─────────────────────────────────────────────────────────
function setInterp(mode) {
  const sel = selected(); if (!sel.length) return msg('Select keyframes first.', true);
  pushUndo(); for (const { k } of sel) k.interp = mode;
  msg(tr('Interpolation: {m}', { m: INTERP_LABELS[mode] })); changed(true);
}
function setHandle(type) {
  const sel = selected(); if (!sel.length) return msg('Select keyframes first.', true);
  pushUndo(); for (const { k } of sel) k.handle = type;
  for (const id of new Set(sel.map(e => e.id))) recalcHandles(S.data.channels[id]);
  msg(tr('Handle type: {m}', { m: HANDLE_LABELS[type] })); changed(true);
}
function insertKey() {
  const id = S.active;
  if (!editable(id)) return msg('This channel is locked in this lab.', true);
  const f = Math.round(S.frame), ks = S.data.channels[id];
  pushUndo();
  let k = ks.find(q => q.frame === f);
  if (!k) { k = key(f, +valueAt(id, f).toFixed(3)); ks.push(k); }
  clearSelection(); k.select = true; S.activeKey = k;
  recalcHandles(ks);
  msg(tr('Inserted a keyframe on {c} at frame {n}.', { c: CHANNELS[id].name, n: f })); changed(true);
}
function deleteKeys(sel = selected()) {
  if (!sel.length) return msg('Select keyframes first.', true);
  pushUndo();
  for (const id of new Set(sel.map(e => e.id))) {
    const ks = S.data.channels[id], keep = ks.filter(k => !k.select);
    S.data.channels[id] = keep.length ? keep : [ks[0]];
    recalcHandles(S.data.channels[id]);
  }
  S.activeKey = null; msg('Deleted keyframes.'); changed(true);
}
function selectAll(on, list = allKeys(editable)) { for (const { k } of list) k.select = on; S.activeKey = null; renderAll(); }

// ─── Menus ──────────────────────────────────────────────────────────────────
const menuEl = $('#menu');
function menuItems(kind) {
  const interp = INTERPOLATIONS.map(m => ({ label: INTERP_LABELS[m], act: () => setInterp(m) }));
  const handles = HANDLE_TYPES.map(m => ({ label: HANDLE_LABELS[m], act: () => setHandle(m) }));
  switch (kind) {
    case 'view': return { title: 'View', items: [{ label: 'Frame All', key: 'Home', act: () => { frameAll(); drawGraph(); } }, { label: 'Frame Selected', key: 'Numpad .', act: () => { frameAll(true); drawGraph(); } }] };
    case 'select': return { title: 'Select', items: [{ label: 'All', key: 'A', act: () => selectAll(true) }, { label: 'None', key: 'Alt A', act: () => selectAll(false) }] };
    case 'interp': return { title: 'Curve type', items: interp };
    case 'handle': return { title: 'Key tangents', items: handles };
    case 'key': case 'context': return {
      title: kind === 'key' ? 'Key' : 'Keyframe',
      items: [
        { label: 'Add Key', act: insertKey }, { label: 'Delete Keys', key: 'Delete', act: deleteKeys }, { hr: true },
        { label: 'Curve type', act: () => openMenu('interp', lastMenuPos.x, lastMenuPos.y) },
        { label: 'Key tangents', act: () => openMenu('handle', lastMenuPos.x, lastMenuPos.y) }, { hr: true },
        { label: 'Undo', key: 'Ctrl Z', act: undo },
      ],
    };
  }
}
let lastMenuPos = { x: 0, y: 0 };
function openMenu(kind, x, y) {
  const m = menuItems(kind); lastMenuPos = { x, y };
  menuEl.innerHTML = `<div class="menu-title">${esc(t(m.title))}</div>` + m.items.map((it, i) => it.hr ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}"><span class="m-label">${esc(t(it.label))}</span>${it.key ? `<span class="m-key">${esc(it.key)}</span>` : ''}</button>`).join('');
  menuEl.hidden = false;
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menuEl.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  menuEl.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = m.items[+b.dataset.i]; closeMenu(); it.act(); };
  menuEl.querySelector('button')?.focus();
}
function closeMenu() { menuEl.hidden = true; document.querySelectorAll('.menu-button[aria-expanded]').forEach(b => b.removeAttribute('aria-expanded')); }
document.querySelectorAll('.menu-button[data-menu]').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation(); const r = b.getBoundingClientRect(); openMenu(b.dataset.menu, r.left, r.bottom + 2); b.setAttribute('aria-expanded', 'true');
}));
document.addEventListener('pointerdown', e => { if (!menuEl.hidden && !menuEl.contains(e.target) && !e.target.closest('.menu-button')) closeMenu(); });

// ─── Channels list and sidebar ──────────────────────────────────────────────
// Controller Window: as in 3ds Max, the Key Window shows the curves of the highlighted tracks.
// Click a track to show only its curve, Ctrl+click to add or remove curves, click a helper to show all its tracks.
function renderChannels() {
  let html = '<div class="mx-tvnode group" style="--d:0"><span class="tw">▾</span>World</div>', group = null;
  for (const id of stage().channels) {
    if (!S.data.channels[id]) continue;
    const ch = CHANNELS[id];
    if (ch.bone !== group) { group = ch.bone; const h = HELPERS.find(x => x.id === group); html += `<button type="button" class="mx-tvnode group${S.bone === group ? ' sel' : ''}" style="--d:1" data-bone="${group}" data-no-i18n><span class="tw">▾</span><span class="mx-ob-ico" style="--c:${h?.color || '#6fa8e8'}"></span>${esc(group)}</button>`; }
    const shown = !S.hidden.has(id);
    html += `<button type="button" class="mx-tvnode${shown ? ' on' : ''}${id === S.active ? ' active' : ''}" style="--d:2" data-ch="${id}" aria-pressed="${shown}" data-no-i18n><span class="sw" style="background:${ch.color}"></span>${ch.name}</button>`;
  }
  tv.tree.innerHTML = html;
}
tv.tree.addEventListener('click', e => {
  S.area = 'graph';
  const grp = e.target.closest('[data-bone]');
  if (grp) { const ids = stage().channels.filter(id => S.data.channels[id] && CHANNELS[id].bone === grp.dataset.bone); S.hidden = new Set(stage().channels.filter(id => !ids.includes(id))); selectBone(grp.dataset.bone); return; }
  const row = e.target.closest('[data-ch]'); if (!row) return;
  const id = row.dataset.ch;
  if (e.ctrlKey || e.metaKey) { if (S.hidden.has(id)) S.hidden.delete(id); else if (visibleChannels().length > 1) S.hidden.add(id); }
  else S.hidden = new Set(stage().channels.filter(c => c !== id));
  if (!S.hidden.has(id)) { S.active = id; S.bone = CHANNELS[id].bone; max.select(S.bone); }
  else S.active = visibleChannels()[0] || id;
  renderAll();
});

function renderSidebar() {
  const k = S.activeKey, id = S.active;
  let html = `<div class="lr-title">${esc(t('LAB READOUT'))}</div><div class="sb-stat"><span data-no-i18n>${esc(CHANNELS[id].bone)} · ${esc(CHANNELS[id].name)}</span><b>${valueAt(id, S.frame).toFixed(2)}</b></div>`;
  void k;
  const z = S.data.channels.locZ, c = contacts(z), tp = tops(z);
  html += `<h4>${esc(t('Bounces'))}</h4>`;
  html += `<div class="sb-stat"><span>${esc(t('Heights'))}</span><b>${tp.map(q => q.value.toFixed(1)).join(' › ') || '—'}</b></div>`;
  html += `<div class="sb-stat"><span>${esc(t('Frames'))}</span><b>${intervals(c).join(' › ') || '—'}</b></div>`;
  const fb = firstBounce(z);
  if (stage().id === 'weight') {
    if (fb) html += `<div class="sb-stat"><span>${esc(t('Hang time'))}</span><b>${Math.round(hangTime(z, fb[0], fb[1]) * 100)}%</b></div>`;
    if (S.toggles.ref) html += `<div class="sb-stat"><span>${esc(t('Match'))}</span><b>${matchScore(z, REFERENCE, 1, 60)}%</b></div>`;
  }
  if (stage().id === 'rotation') {
    const r = rollReport(S.data), bad = r.worst > 0.05;
    html += `<div class="sb-sep"></div><h4>${esc(t('Roll'))}</h4>`;
    html += `<div class="sb-stat"><span>${esc(t('Rotation now'))}</span><b>${(S.override.rotY ?? valueAt('rotY', S.frame)).toFixed(0)}°</b></div>`;
    html += `<div class="sb-stat"><span>${esc(t('Needed to roll'))}</span><b>${(valueAt('rotY', S.start) + rollAngle(valueAt('locX', S.frame) - valueAt('locX', S.start))).toFixed(0)}°</b></div>`;
    html += `<div class="sb-stat${r.backwards ? ' bad' : ''}"><span>${esc(t('Turn at the end'))}</span><b>${r.end.toFixed(0)}° / ${r.want.toFixed(0)}°</b></div>`;
    html += `<div class="sb-stat${bad ? ' bad' : ''}"><span>${esc(t('Worst slide'))}</span><b>${Math.round(r.worst * 100)}% · ${esc(tr('frame {n}', { n: r.worstF }))}</b></div>`;
  }
  if (stage().id === 'squash') {
    const p = pose(S.frame);
    html += `<div class="sb-sep"></div><h4>${esc(t('Rig'))}</h4>`;
    html += `<div class="sb-stat"><span data-no-i18n>SS_Top</span><b>${(S.override.topZ ?? valueAt('topZ', S.frame)).toFixed(2)} m</b></div>`;
    html += `<div class="sb-stat"><span data-no-i18n>SS_Bottom</span><b>${(S.override.botZ ?? valueAt('botZ', S.frame)).toFixed(2)} m</b></div>`;
    html += `<div class="sb-stat"><span>${esc(t('Z Scale now'))}</span><b>${p.sz.toFixed(2)}</b></div>`;
    const low = lowestPoint(S.data);
    html += `<div class="sb-stat${low < -0.03 ? ' bad' : ''}"><span>${esc(t('Lowest point'))}</span><b>${low.toFixed(2)} m</b></div>`;
  }
  $('#sidebar').innerHTML = html;
}
$('#sidebar').addEventListener('change_unused', e => {
  const f = e.target.dataset.kf, k = S.activeKey; if (!f || !k) return;
  const id = Object.keys(S.data.channels).find(c => S.data.channels[c].includes(k)); if (!id) return;
  pushUndo();
  if (f === 'frame') {
    const n = Math.round(+e.target.value);
    if (S.data.channels[id].some(q => q !== k && q.frame === n)) { msg('There is already a keyframe on that frame.', true); S.undo.pop(); renderSidebar(); return; }
    moveKey(k, n, k.value);
  }
  if (f === 'value') moveKey(k, k.frame, +e.target.value);
  if (f === 'interp') k.interp = e.target.value;
  if (f === 'handle') k.handle = e.target.value;
  recalcHandles(S.data.channels[id]);
  changed(true);
});

// ─── Timeline ───────────────────────────────────────────────────────────────
// Drag the Time Slider numbers to change frame; click a key to select it.
// Shift adds; drag keys in time, box-select on empty space, Delete removes keys.
const tlCanvas = $('#timeline');
const TL_RULER = 18;
function tlFrames() {
  // One diamond per frame for visible controllers in the Track Bar summary.
  const frames = new Map();
  for (const { id, k } of allKeys(editable)) { const e = frames.get(k.frame) || { keys: [], sel: false }; e.keys.push({ id, k }); e.sel = e.sel || k.select; frames.set(k.frame, e); }
  return frames;
}
// Rows of the Dope Sheet: Summary, then each helper with its controllers.
const RH = 20, NAMES = 150;
function dsRows() {
  const rows = [{ kind: 'summary', label: 'Summary' }];
  let group = null;
  for (const id of stage().channels) {
    if (!S.data.channels[id]) continue;
    const ch = CHANNELS[id];
    if (ch.bone !== group) { group = ch.bone; rows.push({ kind: 'group', bone: group, label: group, ids: [] }); }
    rows[rows.length - 1].ids?.push(id);
    rows.push({ kind: 'ch', id, label: ch.name, color: ch.color });
  }
  // the group rows list their channels
  let g = null; for (const r of rows) { if (r.kind === 'group') g = r; else if (r.kind === 'ch' && g && !g.ids.includes(r.id)) g.ids.push(r.id); }
  return rows;
}
const rowKeys = r => r.kind === 'ch' ? S.data.channels[r.id].map(k => ({ id: r.id, k })) : r.kind === 'group' ? r.ids.flatMap(id => S.data.channels[id].map(k => ({ id, k }))) : stageKeys();
function frameGroups(list) { const m = new Map(); for (const e of list) { const g = m.get(e.k.frame) || { keys: [], sel: false }; g.keys.push(e); g.sel = g.sel || e.k.select; m.set(e.k.frame, g); } return m; }
function sizeBottom() {}
function diamond(ctx, x, y, r, fill) { const fillMax = fill === '#ffaa33' ? '#ffffff' : fill === '#dcdcdc' ? '#9a9a9a' : '#9aa6b8'; ctx.fillStyle = fillMax; ctx.strokeStyle = '#111'; ctx.fillRect(x - r * .6, y - r * 1.25, r * 1.2, r * 2.5); ctx.strokeRect(x - r * .6 + .5, y - r * 1.25 + .5, r * 1.2 - 1, r * 2.5 - 1); }
function drawTimeline() {
  if (!dopeSheet()) return; // the Track Bar is drawn by the Max shell
  const { ctx, w, h } = fitCanvas(tlCanvas), ds = dopeSheet(), left = ds ? NAMES : 0;
  const f0 = 0, f1 = Math.max(S.end + 4, 76), X = f => left + 10 + (f - f0) / (f1 - f0) * (w - left - 20);
  ctx.fillStyle = '#383838'; ctx.fillRect(0, 0, w, h);
  const rows = ds ? dsRows() : null, rowY = i => TL_RULER + 3 + i * RH;
  if (ds) rows.forEach((r, i) => {
    ctx.fillStyle = r.kind === 'summary' ? '#3f4652' : r.kind === 'group' ? '#434a57' : i % 2 ? '#3a3a3a' : '#3d3d3d';
    ctx.fillRect(left, rowY(i), w - left, RH - 1);
  });
  ctx.fillStyle = '#00000045'; ctx.fillRect(left, TL_RULER, X(S.start) - left, h); ctx.fillRect(X(S.end), TL_RULER, w - X(S.end), h);
  ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, w, TL_RULER);
  ctx.font = '10px Inter, sans-serif';
  for (let f = 0; f <= f1; f++) {
    const big = f % 10 === 0, mid = f % 5 === 0;
    ctx.strokeStyle = big ? '#4a4a4a' : '#333'; ctx.beginPath(); ctx.moveTo(X(f), big ? TL_RULER : mid ? TL_RULER + 6 : TL_RULER + 12); ctx.lineTo(X(f), ds ? TL_RULER + 6 : h); ctx.stroke();
    if (ds && big) { ctx.strokeStyle = '#ffffff10'; ctx.beginPath(); ctx.moveTo(X(f), TL_RULER); ctx.lineTo(X(f), h); ctx.stroke(); }
    if (big || (mid && w > 700)) { ctx.fillStyle = '#9a9a9a'; ctx.fillText(String(f), X(f) + 2, 12); }
  }
  if (ds) {
    rows.forEach((r, i) => {
      const y = rowY(i) + RH / 2 - 0.5, list = rowKeys(r);
      // holds: two keys in a row with the same value (the channel does not change between them)
      if (r.kind === 'ch') {
        const ks = S.data.channels[r.id];
        for (let k = 0; k < ks.length - 1; k++) if (Math.abs(ks[k].value - ks[k + 1].value) < 1e-4) { ctx.fillStyle = ks[k].select && ks[k + 1].select ? '#b07a2a' : '#5c5c5c'; ctx.fillRect(X(ks[k].frame), y - 3, X(ks[k + 1].frame) - X(ks[k].frame), 6); }
      }
      for (const [f, g] of frameGroups(list)) diamond(ctx, X(f), y, r.kind === 'ch' ? 5.5 : 6.5, g.sel ? '#ffaa33' : r.kind === 'ch' ? '#dcdcdc' : '#b9c3d6');
    });
    // channel names
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, TL_RULER, NAMES, h - TL_RULER);
    rows.forEach((r, i) => {
      const y = rowY(i);
      ctx.fillStyle = r.kind === 'ch' && r.id === S.active ? '#334d80' : r.kind === 'group' ? '#2f3b52' : r.kind === 'summary' ? '#313745' : '#2b2b2b';
      ctx.fillRect(0, y, NAMES - 2, RH - 1);
      if (r.kind === 'ch') { ctx.fillStyle = r.color; ctx.fillRect(18, y + 6, 8, 8); }
      ctx.fillStyle = r.kind === 'ch' ? '#dcdcdc' : '#ffffff'; ctx.font = r.kind === 'ch' ? '11px Inter, sans-serif' : 'bold 11px Inter, sans-serif';
      ctx.fillText(r.kind === 'summary' ? t('Summary') : r.label, r.kind === 'ch' ? 32 : 8, y + 14);
    });
    ctx.font = '10px Inter, sans-serif';
  } else {
    const y = TL_RULER + (h - TL_RULER) / 2;
    for (const [f, e] of tlFrames()) diamond(ctx, X(f), y, 7, e.sel ? '#ffaa33' : '#dcdcdc');
  }
  if (S.drag?.tlBox) { const b = S.drag.tlBox; ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 3]); ctx.strokeRect(Math.min(b.x0, b.x1), ds ? Math.min(b.y0, b.y1) : TL_RULER + 2, Math.abs(b.x1 - b.x0), ds ? Math.abs(b.y1 - b.y0) : h - TL_RULER - 4); ctx.setLineDash([]); }
  const cx = X(S.frame);
  ctx.strokeStyle = '#d9c13a'; ctx.lineWidth = 1; for (const o of [-1.5, 1.5]) { ctx.beginPath(); ctx.moveTo(cx + o, TL_RULER); ctx.lineTo(cx + o, h); ctx.stroke(); }
  ctx.fillStyle = '#8a7a22'; const lab = String(Math.round(S.frame)), lw = ctx.measureText(lab).width + 10;
  ctx.fillRect(cx - lw / 2, 1, lw, 16); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(lab, cx, 13); ctx.textAlign = 'left';
  if (S.tlGrab) { ctx.fillStyle = '#ffffffcc'; ctx.fillText(tr('Move keyframes: {d} frames · click to confirm, Esc to cancel', { d: (S.tlGrab.df > 0 ? '+' : '') + (S.tlGrab.df || 0) }), left + 8, h - 6); }
  tlCanvas._X = X; tlCanvas._inv = x => f0 + (x - left - 10) / (w - left - 20) * (f1 - f0); tlCanvas._rows = rows; tlCanvas._rowAt = y => Math.floor((y - TL_RULER - 3) / RH);
}
function tlHit(x, y) {
  if (y < TL_RULER) return null;
  if (dopeSheet()) {
    const rows = tlCanvas._rows, i = tlCanvas._rowAt(y), r = rows?.[i];
    if (!r || x < NAMES) return null;
    let best = null, bd = 8;
    for (const [f, e] of frameGroups(rowKeys(r))) { const d = Math.abs(tlCanvas._X(f) - x); if (d < bd) { bd = d; best = { f, e }; } }
    return best;
  }
  let best = null, bd = 9;
  for (const [f, e] of tlFrames()) { const d = Math.abs(tlCanvas._X(f) - x); if (d < bd) { bd = d; best = { f, e }; } }
  return best;
}
function startTlGrab(x, byDrag = false, dup = false) {
  const sel = bottomSelected();
  if (!sel.length) return msg('Select keyframes first.', true);
  if (!byDrag) pushUndo();
  S.tlGrab = { x0: x, byDrag, dup, df: 0, orig: sel.map(({ id, k }) => ({ id, k, frame: k.frame, value: k.value, left: { ...k.left }, right: { ...k.right } })) };
  drawTimeline();
}
function updateTlGrab(x) {
  const g = S.tlGrab; if (!g) return;
  let df = Math.round(tlCanvas._inv(x) - tlCanvas._inv(g.x0));
  for (const o of g.orig) { o.k.frame = o.frame; o.k.value = o.value; o.k.left = { ...o.left }; o.k.right = { ...o.right }; }
  if (g.orig.some(o => o.frame + df < 0)) df = -Math.min(...g.orig.map(o => o.frame));
  // keys of one channel can't land on another key's frame
  if (g.orig.some(o => S.data.channels[o.id].some(k => !k.select && k.frame === o.frame + df))) df = g.df;
  g.df = df;
  for (const o of g.orig) moveKey(o.k, o.frame + df, o.value);
  for (const id of new Set(g.orig.map(o => o.id))) recalcHandles(S.data.channels[id]);
  changed(false);
}
function endTlGrab(ok) {
  const g = S.tlGrab; if (!g) return;
  S.tlGrab = null;
  if (!ok || (g.dup && !g.df)) {
    if (g.dup) { for (const id of new Set(g.orig.map(o => o.id))) { S.data.channels[id] = S.data.channels[id].filter(k => !g.orig.some(o => o.k === k)); recalcHandles(S.data.channels[id]); } }
    else { for (const o of g.orig) { o.k.frame = o.frame; o.k.value = o.value; o.k.left = { ...o.left }; o.k.right = { ...o.right }; } for (const id of new Set(g.orig.map(o => o.id))) recalcHandles(S.data.channels[id]); }
    S.undo.pop(); changed(false); if (g.dup && ok) msg('Duplicates must move to other frames: cancelled.', true); return;
  }
  if (g.df) msg(tr(g.dup ? 'Duplicated {n} keyframes {d} frames later.' : 'Moved {n} keyframes {d} frames.', { n: g.orig.length, d: (g.df > 0 ? '+' : '') + g.df }));
  changed(true);
}
// Duplicating keys is retained internally for future Track View controls.
function duplicateKeys() {
  const sel = bottomSelected(); if (!sel.length) return msg('Select keyframes first.', true);
  pushUndo();
  for (const { id, k } of sel) { k.select = false; const c = { ...k, left: { ...k.left }, right: { ...k.right }, select: true }; S.data.channels[id].push(c); }
  startTlGrab(S.tlPointer ?? 0, false, true); S.undo.pop();
}
function setupTimeline() {
  const pos = e => { const r = tlCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  tlCanvas.addEventListener('pointerdown', e => {
    closeMenu();
    const { x, y } = pos(e);
    if (S.tlGrab) { endTlGrab(e.button === 0); return; }
    if (e.button !== 0) return;
    tlCanvas.setPointerCapture(e.pointerId);
    if (y < TL_RULER) { S.drag = { tlScrub: true }; setFrame(Math.round(tlCanvas._inv(x))); return; }
    if (dopeSheet() && x < NAMES) {
      const r = tlCanvas._rows?.[tlCanvas._rowAt(y)];
      if (r?.kind === 'ch') { S.active = r.id; S.bone = CHANNELS[r.id].bone; S.hidden.delete(r.id); renderAll(); }
      else if (r?.kind === 'group') selectBone(r.bone);
      return;
    }
    const hit = tlHit(x, y);
    if (hit) {
      const keys = hit.e.keys;
      if (e.shiftKey) { const on = !hit.e.sel; keys.forEach(({ k }) => { k.select = on; }); }
      else if (!hit.e.sel) { clearSelection(); keys.forEach(({ k }) => { k.select = true; }); }
      S.activeKey = null;
      S.drag = { tlMove: true, x, started: false };
      renderAll(); return;
    }
    if (!e.shiftKey) clearSelection();
    S.drag = { tlBox: { x0: x, x1: x, y0: y, y1: y } };
    renderAll();
  });
  tlCanvas.addEventListener('pointermove', e => {
    const { x } = pos(e); S.tlPointer = x;
    if (S.tlGrab) { updateTlGrab(x); return; }
    const d = S.drag; if (!d) return;
    if (d.tlScrub) { setFrame(Math.round(tlCanvas._inv(x))); return; }
    if (d.tlBox) { d.tlBox.x1 = x; d.tlBox.y1 = pos(e).y; drawTimeline(); return; }
    if (d.tlMove) {
      if (!d.started && Math.abs(x - d.x) < 3) return;
      if (!d.started) { d.started = true; pushUndo(); startTlGrab(d.x, true); }
      updateTlGrab(x);
    }
  });
  const end = () => {
    const d = S.drag; S.drag = null;
    if (S.tlGrab?.byDrag) { endTlGrab(true); return; }
    if (d?.tlBox) {
      const a = tlCanvas._inv(Math.min(d.tlBox.x0, d.tlBox.x1)), b = tlCanvas._inv(Math.max(d.tlBox.x0, d.tlBox.x1));
      if (b - a > 0.3) {
        let list = allKeys(editable);
        if (dopeSheet()) { const r0 = tlCanvas._rowAt(Math.min(d.tlBox.y0, d.tlBox.y1)), r1 = tlCanvas._rowAt(Math.max(d.tlBox.y0, d.tlBox.y1)); list = (tlCanvas._rows || []).slice(Math.max(0, r0), r1 + 1).flatMap(rowKeys); }
        for (const { k } of list) if (k.frame >= a && k.frame <= b) k.select = true;
      }
      renderAll();
    }
  };
  tlCanvas.addEventListener('pointerup', end);
  tlCanvas.addEventListener('pointercancel', end);
}
function setFrame(f) { const n = Math.max(0, Math.min(250, f)); if (Math.round(n) !== Math.round(S.frame) && Object.keys(S.override).length) dropOverrides(); S.frame = n; renderLive(); }
function jumpKey(dir) {
  const frames = [...new Set((dopeSheet() ? stageKeys() : allKeys()).map(e => e.k.frame))].sort((a, b) => a - b);
  const cur = Math.round(S.frame);
  const f = dir > 0 ? frames.find(x => x > cur) : [...frames].reverse().find(x => x < cur);
  if (f != null) setFrame(f);
}
let raf = 0, lastT = 0;
function togglePlay() {
  S.playing = !S.playing;
  max.setModes({ playing: S.playing, silent: true });
  if (S.playing) { if (Object.keys(S.override).length) dropOverrides(); lastT = performance.now(); if (S.frame >= S.end) S.frame = S.start; raf = requestAnimationFrame(tick); }
  else cancelAnimationFrame(raf);
}
function tick(now) {
  if (!S.playing) return;
  const df = (now - lastT) / 1000 * FPS;
  if (df >= 1) { lastT = now; S.frame = S.frame + 1 > S.end ? S.start : S.frame + 1; renderLive(); }
  raf = requestAnimationFrame(tick);
}

// ─── Stages, guide and step card ────────────────────────────────────────────
function renderStageSwitch() {
  const box = $('#stage-switch');
  box.innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-stage]'); if (!b) return;
  saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStage();
});
function stepDone(i) {
  const st = stage();
  if (st.independent) return i === S.step ? st.steps[i].check(S.data) : !!S.done[`${st.id}-${i}`];
  return st.steps[i].check(S.data);
}
function currentStep() {
  const st = stage();
  if (st.independent) return S.step;
  const i = st.steps.findIndex((_, j) => !stepDone(j));
  return S.focus != null ? S.focus : (i < 0 ? st.steps.length - 1 : i);
}
function renderGuide() {
  const st = stage(), cur = currentStep();
  const g = $('#guide'); g.hidden = !!st.free; g.classList.toggle('three', st.steps.length === 3);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === cur ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === cur ? 'Now' : st.independent ? 'Click to load' : 'Next'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => {
  const li = e.target.closest('[data-step]'); if (!li) return;
  const i = +li.dataset.step, st = stage();
  if (st.independent) { saveData(); S.step = i; loadData(); S.toggles.ref = !!st.steps[i].reference; syncToggles(); frameAll(); renderAll(); }
  else { S.focus = i; renderAll(); }
});
function renderStepCard() {
  const st = stage();
  const card = $('#step-card');
  if (st.free) {
    card.classList.remove('done');
    card.innerHTML = `<div><span class="control-label">${esc(t('FREE PRACTICE'))}</span><h3>${esc(t('Make your own animation'))}</h3><p>${esc(t('All six curves are available: Root X and Z, Uniform Scale, SS_Top, SS_Bottom, and Rotation. Your work is saved in this browser.'))}</p></div>
      <div><span class="control-label">${esc(t('HOW, IN 3DS MAX'))}</span><ol>
        <li>${t('Select Root, choose Select and Move (<kbd>W</kbd>), and create keys with Auto Key (<kbd>N</kbd>) or Set Keys (<kbd>K</kbd>).')}</li>
        <li>${t('Use SS_Top and SS_Bottom for squash and stretch; select Rotation and choose Select and Rotate (<kbd>E</kbd>).')}</li>
        <li>${t('Use Select and Uniform Scale (<kbd>R</kbd>) with Auto Key or Set Keys, or edit its curve in Track View.')}</li>
        <li>${t('Edit all six tracks and tangents in Track View – Curve Editor: click a track in the Controller Window to see its curve (<kbd>Ctrl</kbd>-click adds more), then play with <kbd>/</kbd>.')}</li>
      </ol></div>
      <div class="step-actions"><button type="button" class="mini-link" id="reset-stage">${esc(t('Reset my animation'))}</button></div>`;
    return;
  }
  const i = currentStep(), s = st.steps[i], ok = stepDone(i);
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, IN 3DS MAX'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-stage">${esc(t(st.independent ? 'Reset this step' : 'Reset stage'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const st = stage();
  if (e.target.id === 'reset-stage') { pushUndo(); S.data = startData(st, S.step); S.focus = null; changed(true); frameAll(); renderAll(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (e.target.id === 'show-solution') {
    pushUndo();
    const i = currentStep();
    if (st.independent) { S.data = startData(st, i); st.steps[i].solve(S.data); }
    else { const d = startData(st); for (let j = 0; j <= i; j++) st.steps[j].solve(d); S.data = d; }
    for (const k of Object.values(S.data.channels)) recalcHandles(k);
    S.activeKey = null; changed(true); msg('This is one possible solution. Ctrl Z brings your version back.');
  }
  if (e.target.id === 'next-step') {
    if (st.independent) { saveData(); S.step++; loadData(); S.toggles.ref = !!st.steps[S.step].reference; syncToggles(); frameAll(); }
    else S.focus = null;
    renderAll();
  }
  if (e.target.id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStage(); }
});

let lastDone = null;
function checkProgress() {
  const st = stage();
  if (st.free) return;
  const cur = currentStep();
  const states = st.steps.map((_, i) => stepDone(i));
  if (st.independent && states[S.step]) S.done[`${st.id}-${S.step}`] = true;
  store.set('done', S.done);
  if (lastDone) states.forEach((d, i) => { if (d && !lastDone[i]) msg(tr('✓ Step done: {s}', { s: t(st.steps[i].title) })); });
  lastDone = states;
  if (S.focus != null && states[S.focus] && S.focus === cur) { /* keep focus */ }
}

// ─── Rendering and updates ──────────────────────────────────────────────────
function syncToggles() {
  syncTransformTools();
}
function renderLive() {
  drawView(); drawGraph(); drawTimeline();
  max.setTime({ frame: Math.round(S.frame), start: S.start, end: S.end });
  // Track Bar: keys of the selected helper, coloured by kind (red Position, green Rotation, blue Scale)
  const frames = new Map();
  for (const id of boneChannels()) for (const k of S.data.channels[id]) { const e = frames.get(k.frame) || { frame: k.frame, types: new Set(), label: [], sel: false }; e.types.add(KEY_TYPE(id)); e.label.push(CHANNELS[id].name); e.sel = e.sel || k.select; frames.set(k.frame, e); }
  max.setKeys([...frames.values()].map(e => ({ frame: e.frame, types: ['position', 'rotation', 'scale'].filter(x => e.types.has(x)), label: `${S.bone} ${e.label.join(', ')}` })), [...frames.values()].filter(e => e.sel).map(e => e.frame));
  const ak = S.activeKey || (selected().length === 1 ? selected()[0].k : null);
  tv.setStats(ak?.frame, ak ? +ak.value.toFixed(3) : null, !!ak);
  if (!S.playing && max.state.tab === 'motion') max.showTab('motion');
  if (!S.playing) renderSidebar();
}
function renderAll() {
  if (max.selectedId() !== S.bone) max.select(S.bone);
  renderStageSwitch(); renderChannels(); renderGuide(); renderStepCard(); syncToggles();
  renderLive(); renderSidebar();
}
function changed(commit = true) {
  if (commit) { saveData(); checkProgress(); renderGuide(); renderStepCard(); renderChannels(); }
  renderLive();
}
function enterStage() {
  tv.setMode(dopeSheet() ? 'dope' : 'curve'); $('#graph').hidden = dopeSheet(); $('#timeline').hidden = !dopeSheet(); $('#sidebar').hidden = dopeSheet();
  S.focus = null; lastDone = null; S.hidden.clear(); for (const id of stage().hide || ['locX']) S.hidden.add(id); // the travel curve is shown on demand
  S.active = stage().active || 'locZ'; S.bone = CHANNELS[S.active].bone; S.override = {};
  loadData();
  S.toggles.ref = stage().independent ? !!stage().steps[S.step].reference : false;
  frameAll(); sizeBottom(); renderAll(); checkProgress();
}


// ─── Lab keyboard shortcuts while the pointer is over the workspace ──
// ─── Start ──────────────────────────────────────────────────────────────────
setupGraphInput(); setupTimeline();
new ResizeObserver(() => renderLive()).observe(tv.host);
onLangChange(() => renderAll());
frameView3(); enterStage(); resize3();
window.__maxAnim = S; window.__maxAnim3 = { cam3, ctrls3, selectBone, startVGrab, startVRot, keyControl, ball3, ballGroup }; window.__maxAnimGizmo = gizmo; window.__maxAnimVp = vp; // test hooks
