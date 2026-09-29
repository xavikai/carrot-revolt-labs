// 3ds Max Animation Lab: a bouncing ball in a 3D viewport and Track View.
import * as THREE from 'three';
import { recalcHandles, evaluate, moveKey, moveHandle, key, contacts, tops, intervals, hangTime, matchScore, INTERPOLATIONS, HANDLE_TYPES } from './fcurve.js';
import { STAGES, CHANNELS, FPS, RANGE, REFERENCE, BALL, startData, cloneData, shape, channelOf, lowestPoint, firstBounce, rollReport, rollAngle, trackAt } from './stages.js?v=9';
import { OBJECTS, CONTROLS, isControl, tracksOf, trackId, rigPose, worldOf, worldToLocalMove, TRACK_ORDER, restValue } from './rig.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import blenderConcepts from '../animation/i18n.js?v=5';
import maxDictionary from './max-i18n.js?v=7';
import { createMaxShell, createTrackView, rollout, spinner, trackTreeHTML } from '../_max/max-shell.js?v=3';
import { createMaxViewport } from '../_max/max-viewport.js?v=2';
import { createGizmo, toMax } from '../_max/max-gizmo.js?v=2';
import { icon } from '../_max/max-icons.js?v=3';
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
  playing: false, active: 'locZ', shown: new Set(['locZ']), activeKey: null, cat: new Set(store.get('cat', [])), xf: null, rotAxis: 'y',
  undo: [], redo: [], done: store.get('done', {}), toggles: { path: true, ghosts: false, ref: false, ctrls: store.get('ctrls', true) },
  view: null, drag: null, grab: null, hover: false,
  bone: 'ctrl_pilota', override: {}, vgrab: null, tlGrab: null, area: null, vpointer: null, bottom: store.get('bottom', 'timeline') === 'dopesheet' ? 'dopesheet' : 'timeline',
  keyMode: store.get('keyMode', 'off'), tool: store.get('tool', 'move'), axis: store.get('axis', null) || 'xz', tvTool: 'moveKeys', showTangents: true,
};
const stage = () => STAGES[S.stageIndex];

// ─── Data and persistence ───────────────────────────────────────────────────
function saveData() { store.set(`data-${stage().id}-${stage().independent ? S.step : 0}`, S.data); }
function loadData() {
  const saved = store.get(`data-${stage().id}-${stage().independent ? S.step : 0}`, null);
  S.data = saved && saved.channels ? saved : startData(stage(), S.step);
  // older saves: a single Uniform Scale track (a factor) becomes the X/Y/Z Scale tracks (percent)
  if (S.data.channels.scale) { const sc = S.data.channels.scale; delete S.data.channels.scale; for (const a of ['sx', 'sy', 'sz']) S.data.channels[`ctrl_pilota.${a}`] = sc.map(k => ({ ...k, value: k.value * 100, left: { ...k.left, value: k.left.value * 100 }, right: { ...k.right, value: k.right.value * 100 } })); }
  if (stage().free) for (const id of stage().channels) if (!S.data.channels[id]) S.data.channels[id] = startData(stage()).channels[id];
  S.data.static = S.data.static || {};
  for (const k of Object.values(S.data.channels)) { k.forEach(q => { q.select = false; }); recalcHandles(k); }
  S.activeKey = null; S.undo = []; S.redo = [];
}
function pushUndo() { S.undo.push(JSON.stringify(S.data)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function restore(json) { S.data = JSON.parse(json); S.activeKey = null; S.override = {}; changed(false); }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.data)); restore(S.undo.pop()); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.data)); restore(S.redo.pop()); msg('Redo'); }

const editable = () => true;
// Tracks highlighted in the Controller Window: their curves are shown in the Key Window.
const visibleChannels = () => TRACK_ORDER.filter(id => S.shown.has(id));
const keyedVisible = () => visibleChannels().filter(id => S.data.channels[id]);
function allKeys(filter = () => true) {
  const out = [];
  for (const id of keyedVisible()) if (filter(id)) for (const k of S.data.channels[id]) out.push({ id, k });
  return out;
}
const selected = () => allKeys(editable).filter(e => e.k.select);
// The Dope Sheet shows every controller, even ones hidden in the Curve Editor.
function stageKeys() { const out = []; for (const id of TRACK_ORDER) if (S.data.channels[id]) for (const k of S.data.channels[id]) out.push({ id, k }); return out; }
const dopeSheet = () => S.bottom === 'dopesheet';
const bottomSelected = () => dopeSheet() ? stageKeys().filter(e => e.k.select) : selected();
function valueAt(id, f) {
  return trackAt(S.data, id, f);
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
// The scene of the class file: the same names, types, hierarchy, hidden bones and frozen mesh.
const SCENE_DEFAULT = Object.fromEntries(OBJECTS.map(o => [o.id, { hidden: !!o.hidden, frozen: !!o.frozen }]));
const scene = { ...SCENE_DEFAULT, ...store.get('scene', {}) };
for (const id of Object.keys(scene)) if (!SCENE_DEFAULT[id]) delete scene[id];
const objList = () => OBJECTS.map(o => ({ id: o.id, name: o.id, kind: o.kind, parent: o.parent, color: o.color, hidden: scene[o.id].hidden, frozen: scene[o.id].frozen }));
const KEY_TYPE = id => (CHANNELS[id]?.group || 'Position').toLowerCase();
const trackIdsOf = obj => isControl(obj) ? tracksOf(obj) : [];
const animatedOf = obj => trackIdsOf(obj).filter(id => S.data?.channels[id]);
const boneChannels = () => S.bone ? animatedOf(S.bone) : [];
const objName = id => id || '(none)';
const max = createMaxShell($('#max-app'), {
  file: 'Bouncing_Ball.max', fps: FPS, units: 'm', tab: 'motion',
  objects: objList(), selected: 'ctrl_pilota', keyFilters: ['Position', 'Rotation', 'Scale'],
  pages: { motion: '', display: '' },
  menus: {
    Views: () => [
      { label: 'Maximize Viewport Toggle', keys: 'Alt+W', run: () => max.run('maximize') },
      { label: 'Zoom Extents Selected', keys: 'Z', run: () => frameView3() },
      { sep: true },
      { label: 'Show Ghosting', checked: S.toggles.ghosts, run: () => setToggle('ghosts', !S.toggles.ghosts) },
      { label: 'Hide Helpers', keys: 'Shift+H', checked: S.cat.has('helpers'), run: () => toggleCategory('helpers') },
      { label: 'Hide Shapes', keys: 'Shift+S', checked: S.cat.has('shapes'), run: () => toggleCategory('shapes') },
    ],
  },
  actions: {
    frame: f => setFrame(f), prevFrame: () => setFrame(Math.round(S.frame) - 1), nextFrame: () => setFrame(Math.round(S.frame) + 1),
    goStart: () => setFrame(S.start), goEnd: () => setFrame(S.end), play: () => togglePlay(),
    keyMode: () => { S.keyJump = !S.keyJump; max.setModes({ keyMode: S.keyJump, silent: true }); msg(S.keyJump ? 'Key Mode: , and . jump from key to key.' : 'Key Mode off: , and . move one frame.'); },
    autoKey: () => chooseKeyMode('auto'), setKeyMode: () => chooseKeyMode('set'),
    setKey: () => { if (S.keyMode !== 'set') return msg('Set Keys works in Set Key Mode: press \' or the Set K. button.', true); setKeys(); },
    onTimeConfig: ({ start, end }) => { S.start = Math.max(0, start); S.end = Math.min(250, end); setFrame(Math.max(S.start, Math.min(S.end, S.frame))); renderAll(); },
    range: (start, end) => { S.start = Math.max(0, start); S.end = Math.min(250, end); setFrame(Math.max(S.start, Math.min(S.end, S.frame))); },
    selectKeys: frames => { const set = new Set(frames); clearSelection(); for (const id of boneChannels()) for (const k of S.data.channels[id]) if (set.has(k.frame)) k.select = true; S.activeKey = null; renderAll(); },
    moveKeys: (frames, delta, copy) => trackBarMove(frames, delta, copy),
    deleteKeys: frames => { const set = new Set(frames); deleteKeys(boneChannels().flatMap(id => S.data.channels[id].filter(k => set.has(k.frame)).map(k => ({ id, k })))); },
    delete: () => deleteKeys(selected().length ? selected() : bottomSelected()),
    undo, redo,
    select: () => activateTool('select'), move: () => activateTool('move'), rotate: () => activateTool('rotate'), scale: () => activateTool('scale'),
    selectObject: id => selectBone(id),
    objectState: (id, patch) => { Object.assign(scene[id], patch); store.set('scene', scene); if (S.bone === id && (patch.hidden || patch.frozen)) endTransform(false); setTimeout(() => { drawView(); renderMotionTab(); }); return true; },
    selectAll: () => { if (max.overTrackView()) selectAll(true); else msg('Select All: in this lab, select one helper at a time.'); },
    selectNone: () => { if (max.overTrackView()) selectAll(false); else selectBone(null); },
    typeIn: (axis, v) => typeIn(axis, v),
    axisX: () => chooseAxis('x'), axisY: () => chooseAxis('y'), axisZ: () => chooseAxis('z'), axisPlane: () => chooseAxis(({ xy: 'yz', yz: 'xz', xz: 'xy' })[S.axis] || 'xy'),
    hideHelpers: () => toggleCategory('helpers'), hideShapes: () => toggleCategory('shapes'),
    curveEditor: () => setTrackView('curve'), dopeSheet: () => setTrackView('dope'),
    viewCube: () => { frameView3(); max.setViewLabel('Perspective'); }, zoomExtents: () => frameView3(), zoomExtentsAll: () => frameView3(),
    viewPerspective: () => { frameView3(); max.setViewLabel('Perspective'); }, viewFront: () => { lookFrom('front'); max.setViewLabel('Front'); },
    viewLeft: () => { lookFrom('left'); max.setViewLabel('Left'); }, viewTop: () => { lookFrom('top'); max.setViewLabel('Top'); },
    orbit: () => msg('Orbit: Alt + middle mouse button drag in the viewport.'), pan: () => msg('Pan: middle mouse button drag in the viewport.'), zoom: () => msg('Zoom: mouse wheel in the viewport.'),
    // Tools › Preview - Grab Viewport (Shift+V): the kit renders each frame of the viewport without helpers.
    grabFrame: f => { const follow = cameraFollowsBall, playing = S.playing; cameraFollowsBall = false; S.previewing = S.playing = true; S.frame = Math.max(0, Math.min(250, f)); drawView(); S.previewing = false; S.playing = playing; cameraFollowsBall = follow; return renderer3.domElement; },
    commandPanel: (tab, page) => { if (tab === 'motion') renderMotion(page); if (tab === 'display') renderDisplay(page); },
    layout: () => requestAnimationFrame(() => { resize3(); renderLive(); }),
    key: (e, combo) => {
      if (S.xf && combo === 'escape') { endTransform(false); msg('Transform cancelled.'); return true; }
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
max.host.innerHTML = '<canvas id="view" aria-label="Perspective viewport: the bouncing ball and its controls"></canvas><div class="view-overlay" id="view-overlay"></div><div class="op-readout" id="view-readout" hidden></div>';
tv.host.innerHTML = '<canvas id="graph" aria-label="Key Window: animation curves"></canvas><canvas id="timeline" aria-label="Dope Sheet: keys by object and track" hidden></canvas><aside class="lab-readout" id="sidebar" aria-label="Lab readout"></aside>';
const TAN_TOOLS = { tanAuto: 'auto', tanSpline: 'spline', tanFast: 'fast', tanSlow: 'slow', tanStep: 'step', tanLinear: 'linear', tanSmooth: 'smooth', breakTangents: 'break', unifyTangents: 'unify' };
function tvTool(id) {
  if (TAN_TOOLS[id]) return setMaxTangent(TAN_TOOLS[id]);
  if (['moveKeys', 'moveKeysH', 'moveKeysV', 'addKeys'].includes(id)) { S.tvTool = id; tv.setActive('moveKeys', id !== 'addKeys'); tv.setActive('addKeys', id === 'addKeys'); return msg({ addKeys: 'Add Keys: click on a curve to add a key there.', moveKeys: 'Move Keys: drag keys in time and value.', moveKeysH: 'Move Keys Horizontal: keys move only in time.', moveKeysV: 'Move Keys Vertical: keys move only in value.' }[id]); }
  if (id === 'outOfRange') return outOfRangeDialog();
  if (id === 'showTangents') { S.showTangents = !S.showTangents; tv.setActive('showTangents', S.showTangents); return drawGraph(); }
  if (id === 'frameH' || id === 'frameV') { const old = { ...S.view }; frameAll(selected().length > 0); if (id === 'frameH') { S.view.v0 = old.v0; S.view.v1 = old.v1; } else { S.view.f0 = old.f0; S.view.f1 = old.f1; } drawGraph(); return msg(id === 'frameH' ? 'Frame Horizontal Extents' : 'Frame Value Extents'); }
  if (id === 'pan') return msg('Pan: drag with the middle mouse button in the Key Window.');
  if (id === 'zoom') return msg('Zoom: roll the mouse wheel in the Key Window.');
  if (id === 'filters') return msg('Filters: the Controller Window shows the Transform tracks of the selected object.');
}
// Parameter Curve Out-of-Range Types of the highlighted tracks: what happens before the first key and after the last.
function outOfRangeDialog() {
  const ids = visibleChannels().filter(id => S.data.channels[id]);
  if (!ids.length) return msg('Highlight an animated track in the Controller Window first.', true);
  const id = ids.includes(S.active) ? S.active : ids[0];
  const cur = S.data.oor?.[id] || { in: 'constant', out: 'constant' }, name = ids.length > 1 ? tr('{n} tracks', { n: ids.length }) : `${CHANNELS[id].bone} · ${CHANNELS[id].name}`;
  max.outOfRangeDialog({ current: cur, tracks: `${name}. Click a thumbnail for both sides, or the small buttons for In (before the first key) and Out (after the last key). Extend the Time Configuration to see the repeats.`,
    onOk: ({ in: tin, out }) => {
      pushUndo(); S.data.oor = S.data.oor || {};
      for (const t of ids) S.data.oor[t] = { in: tin, out };
      msg(`Out-of-Range: ${name} · In ${tin} · Out ${out}`); changed(true);
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
  for (const id of new Set(moving.map(m => m.id))) { S.data.channels[id].sort((a, b) => a.frame - b.frame); recalcHandles(S.data.channels[id]); }
  changed(true); return true;
}

// ─── Keys, as in 3ds Max ────────────────────────────────────────────────────
// The value of a track now, with an unkeyed pose (Set Key Mode, or during a drag) on top.
const cur = id => S.override[id] ?? valueAt(id, S.frame);
// Put a key on a track. A track animated for the first time also gets a key at the start of the
// time range with its old value, as Auto Key does in 3ds Max.
function setKeyAt(id, f, v, changedTrack = true) {
  let ks = S.data.channels[id];
  if (!ks) {
    const old = valueAt(id, f); ks = S.data.channels[id] = [];
    if (f !== S.start) ks.push(key(S.start, +old.toFixed(3)));
    delete S.data.static?.[id];
  }
  let k = ks.find(q => q.frame === f);
  if (k) moveKey(k, f, v);
  else { const prev = [...ks].reverse().find(q => q.frame < f); k = key(f, v, !changedTrack && prev ? prev.interp : 'BEZIER'); ks.push(k); ks.sort((a, b) => a.frame - b.frame); }
  recalcHandles(ks); return k;
}
const trackLabel = ids => { const byObj = {}; for (const id of ids) (byObj[CHANNELS[id].obj] ||= []).push(CHANNELS[id]); return Object.entries(byObj).map(([o, ts]) => `${o} · ${ts.map(t => t.name).join(', ')}`).join(' · '); };
// A change of some tracks (from the viewport, the Transform Type-In or the Motion panel), by key mode:
// Auto Key → keys at the current frame · Set Key Mode → an unkeyed pose until Set Keys ·
// both off → the value itself changes (an animated track moves all its keys, as in Max).
function applyChange(changes) {
  const f = Math.round(S.frame);
  const ids = Object.keys(changes).filter(id => Math.abs(changes[id] - valueAt(id, S.frame)) > 1e-6);
  for (const id of Object.keys(changes)) if (!ids.includes(id)) delete S.override[id];
  if (!ids.length) { drawView(); return; }
  if (S.keyMode === 'set') { for (const id of ids) S.override[id] = +changes[id].toFixed(4); msg('Pose ready: press Set Keys (K) to key it.'); drawView(); renderSidebar(); return; }
  pushUndo(); clearSelection();
  let last = null;
  for (const id of ids) {
    const v = +changes[id].toFixed(4);
    delete S.override[id];
    if (S.keyMode === 'auto') { last = setKeyAt(id, f, v); last.select = true; }
    else if (S.data.channels[id]) { const dv = v - valueAt(id, S.frame); for (const k of S.data.channels[id]) moveKey(k, k.frame, +(k.value + dv).toFixed(4)); recalcHandles(S.data.channels[id]); }
    else { (S.data.static ||= {})[id] = v; }
  }
  if (S.keyMode === 'auto') { S.activeKey = last; S.active = ids[ids.length - 1]; msg(tr('Inserted a keyframe on {c} at frame {n}.', { c: trackLabel(ids), n: f })); }
  else if (ids.some(id => S.data.channels[id])) msg(tr('Auto Key is off: every key of {c} moved with it. Turn on Auto Key (N) to key a pose, or Ctrl+Z.', { c: trackLabel(ids.filter(id => S.data.channels[id])) }), true);
  else msg(tr('Changed {c} (no animation: Auto Key is off).', { c: trackLabel(ids) }));
  changed(true);
}
// Set Keys (K): keys the selected object's tracks that are animated or were changed, filtered by the Key Filters.
function setKeys(groups = [...max.state.filters]) {
  if (!S.bone || !isControl(S.bone)) return msg('Select a control first (ctrl_pilota, ctrl_top…).', true);
  const f = Math.round(S.frame), ids = trackIdsOf(S.bone).filter(id => groups.includes(CHANNELS[id].group) && (S.data.channels[id] || S.override[id] != null));
  if (!ids.length) return msg(tr('{h} has no animated {g} tracks yet: change it first, or use Auto Key.', { h: S.bone, g: groups.join('/') }), true);
  pushUndo(); clearSelection();
  let last = null;
  for (const id of ids) { const changedTrack = S.override[id] != null; last = setKeyAt(id, f, +cur(id).toFixed(4), changedTrack); last.select = true; delete S.override[id]; }
  S.activeKey = last; S.active = ids.find(id => S.shown.has(id)) || ids[0];
  msg(tr('Inserted a keyframe on {c} at frame {n}.', { c: trackLabel(ids), n: f })); changed(true);
}
// Transform Type-In: exact values for the selected control at the current frame (track values: frozen transforms).
function typeIn(axis, v) {
  if (!S.bone || !isControl(S.bone)) return msg('Select a control first.', true);
  if (scene[S.bone].frozen) return msg(tr('{h} is frozen: unfreeze it in the Scene Explorer.', { h: S.bone }), true);
  const p = (S.tool === 'rotate' ? 'r' : S.tool === 'scale' ? 's' : 'p') + axis;
  applyChange({ [trackId(S.bone, p)]: v });
}
function setToggle(name, on) { S.toggles[name] = on; renderAll(); }
function toggleCategory(cat) {
  S.cat.has(cat) ? S.cat.delete(cat) : S.cat.add(cat); store.set('cat', [...S.cat]);
  msg(tr(S.cat.has(cat) ? '{c} hidden (Display panel › Hide by Category).' : '{c} shown.', { c: cat === 'helpers' ? 'Helpers' : cat === 'shapes' ? 'Shapes' : cat === 'bones' ? 'Bones' : 'Geometry' }));
  renderAll();
}
function renderDisplay(page) {
  const cb = (cat, label, keys = '') => `<label class="mx-check"><input type="checkbox" data-cat="${cat}"${S.cat.has(cat) ? ' checked' : ''}> ${label}${keys ? ` <span class="mx-dim">(${keys})</span>` : ''}</label>`;
  page.insertAdjacentHTML('beforeend', `${rollout('Hide by Category', `${cb('geometry', 'Geometry')}${cb('shapes', 'Shapes', 'Shift+S')}<label class="mx-check dim"><input type="checkbox" disabled> Lights</label><label class="mx-check dim"><input type="checkbox" disabled> Cameras</label>${cb('helpers', 'Helpers', 'Shift+H')}${cb('bones', 'Bone Objects')}`)}
    ${rollout('Hide', `<div class="mx-grid2"><button type="button" class="mx-btn" data-hide="sel">Hide Selected</button><button type="button" class="mx-btn" data-hide="all">Unhide All</button></div>`)}
    ${rollout('Freeze', `<div class="mx-grid2"><button type="button" class="mx-btn" data-freeze="sel">Freeze Selected</button><button type="button" class="mx-btn" data-freeze="all">Unfreeze All</button></div>`)}
    ${rollout('Display Properties', `<label class="mx-check"><input type="checkbox" data-toggle="path"${S.toggles.path ? ' checked' : ''}> Trajectory</label><p class="mx-note">Shows the path of the ball with one dot per frame: close dots are slow, far dots are fast. Yellow dots are keys.</p><label class="mx-check"><input type="checkbox" data-toggle="ghosts"${S.toggles.ghosts ? ' checked' : ''}> Show Ghosting <span class="mx-dim">(Views menu)</span></label>`)}
    ${stage().id === 'weight' ? rollout('Lab: Reference', `<label class="mx-check"><input type="checkbox" data-toggle="ref"${S.toggles.ref ? ' checked' : ''}> Physics reference</label><p class="mx-note">A real ball simulated with physics, drawn as a dashed yellow line (not a 3ds Max feature).</p>`) : ''}`);
}
const renderMotionTab = () => { if (max.state.tab === 'motion' || max.state.tab === 'display') max.showTab(max.state.tab); };
function setObjectState(id, patch) { max.setObjectState(id, patch); Object.assign(scene[id], patch); store.set('scene', scene); drawView(); }
max.page().addEventListener('change', e => {
  const tg = e.target.dataset?.toggle, cat = e.target.dataset?.cat;
  if (tg) { setToggle(tg, e.target.checked); return; }
  if (cat) { if (e.target.checked !== S.cat.has(cat)) toggleCategory(cat); return; }
  if (e.target.id === 'ki-time') editActiveKey('frame', +e.target.value);
  if (e.target.id === 'ki-value') editActiveKey('value', +e.target.value);
});
max.page().addEventListener('click', e => {
  const c = e.target.closest('[data-prs-create]'), d = e.target.closest('[data-prs-delete]'), kt = e.target.closest('[data-ki-tan]'), ki = e.target.closest('[data-ki]'), hd = e.target.closest('[data-hide]'), fz = e.target.closest('[data-freeze]');
  if (hd) { if (hd.dataset.hide === 'all') OBJECTS.forEach(o => scene[o.id].hidden && setObjectState(o.id, { hidden: false })); else if (S.bone) setObjectState(S.bone, { hidden: true }); return; }
  if (fz) { if (fz.dataset.freeze === 'all') OBJECTS.forEach(o => scene[o.id].frozen && setObjectState(o.id, { frozen: false })); else if (S.bone) setObjectState(S.bone, { frozen: true }); return; }
  // PRS Parameters › Create Key: keys the three tracks of the controller (X, Y and Z), as in Max.
  if (c) { if (!S.bone || !isControl(S.bone)) return msg('Select a control first.', true); const g = c.dataset.prsCreate, f = Math.round(S.frame); pushUndo(); clearSelection(); let last; for (const id of tracksOf(S.bone, g)) { last = setKeyAt(id, f, +cur(id).toFixed(4), S.override[id] != null); last.select = true; delete S.override[id]; } S.activeKey = last; msg(tr('Inserted a keyframe on {c} at frame {n}.', { c: `${S.bone} · ${g}`, n: f })); changed(true); }
  if (d) { const f = Math.round(S.frame), g = d.dataset.prsDelete, list = boneChannels().filter(id => KEY_TYPE(id) === g.toLowerCase()).flatMap(id => S.data.channels[id].filter(k => k.frame === f).map(k => ({ id, k }))); if (!list.length) return msg(tr('No {g} key at frame {n}.', { g, n: f }), true); clearSelection(); list.forEach(({ k }) => { k.select = true; }); deleteKeys(list); }
  if (kt) setMaxTangent(kt.dataset.kiTan);
  if (ki) { const k = S.activeKey || selected()[0]?.k; if (!k) return; const id = Object.keys(S.data.channels).find(c2 => S.data.channels[c2].includes(k)), ks = S.data.channels[id], n = ks[ks.indexOf(k) + +ki.dataset.ki]; if (n) { clearSelection(); n.select = true; S.activeKey = n; setFrame(n.frame); renderAll(); } }
});
function renderMotion(page) {
  if (!S.data) return;
  const k = S.activeKey || selected()[0]?.k, id = k && Object.keys(S.data.channels).find(c => S.data.channels[c].includes(k)), ks = id ? S.data.channels[id] : [];
  const TAN_ICON = { auto: 'tvTangentAuto', spline: 'tvTangentSpline', fast: 'tvTangentFast', slow: 'tvTangentSlow', step: 'tvTangentStep', linear: 'tvTangentLinear', smooth: 'tvTangentSmooth' };
  if (!S.bone || !isControl(S.bone)) { page.insertAdjacentHTML('beforeend', `<p class="mx-empty">${esc(S.bone ? tr('{h} is driven by the rig: select a control (ctrl_pilota, ctrl_top, ctrl_bottom, squash_space or ctrl_master).', { h: S.bone }) : t('Select a control to see its PRS Parameters and keys.'))}</p>`); return; }
  page.insertAdjacentHTML('beforeend', `
    <div class="mx-cats"><button type="button" class="mx-btn on" style="flex:1">Parameters</button><button type="button" class="mx-btn" style="flex:1" disabled>Trajectories</button></div>
    ${rollout('PRS Parameters', `<div class="mx-grid2"><span style="text-align:center">Create Key</span><span style="text-align:center">Delete Key</span>${['Position', 'Rotation', 'Scale'].map(g => `<button type="button" class="mx-btn" data-prs-create="${g}">${g}</button><button type="button" class="mx-btn" data-prs-delete="${g}">${g}</button>`).join('')}</div><p class="mx-note">${esc(tr('Keys {h} at the current frame ({n}), with its current pose.', { h: S.bone, n: Math.round(S.frame) }))}</p>`)}
    ${rollout('Key Info (Basic)', k && id ? `<div class="key-info"><div class="kinav"><button type="button" class="mx-btn" data-ki="-1" title="Previous key">&lt;</button><b data-no-i18n>${esc(CHANNELS[id].bone)} · ${esc(CHANNELS[id].name)} · ${ks.indexOf(k) + 1}</b><button type="button" class="mx-btn" data-ki="1" title="Next key">&gt;</button></div>
      <div class="mx-prop"><span>Time:</span>${spinner({ id: 'ki-time', value: k.frame, step: 1, decimals: 0, width: 112 })}<span></span></div>
      <div class="mx-prop"><span>Value:</span>${spinner({ id: 'ki-value', value: +k.value.toFixed(3), step: CHANNELS[id].rot ? 5 : CHANNELS[id].scale ? 5 : 0.05, decimals: 3, width: 112 })}<span class="mx-unit">${CHANNELS[id].unit}</span></div>
      <div class="mx-prop"><span>In / Out:</span><b style="font-weight:400" data-no-i18n>${TANGENT_NAME(k)}</b><span></span></div>
      <div class="tan-pick">${Object.entries(TAN_ICON).map(([type, ic]) => `<button type="button" class="mx-tb sm${TANGENT_NAME(k).toLowerCase() === type ? ' on' : ''}" data-ki-tan="${type}" title="Set Tangents to ${type[0].toUpperCase() + type.slice(1)}">${icon(ic)}</button>`).join('')}</div></div>`
      : `<p class="mx-note">${esc(t('Select a key in the Track Bar or in Track View to see its time, value and tangents.'))}</p>`)}
    ${rollout('Assign Controller', `<div class="mx-sfs" style="max-height:none"><div class="mx-sfs-row">Transform : Position/Rotation/Scale</div><div class="mx-sfs-row" style="padding-left:18px">Position : Position List</div><div class="mx-sfs-row" style="padding-left:32px">Frozen Position : Position XYZ</div><div class="mx-sfs-row" style="padding-left:32px">Zero Pos XYZ : Position XYZ</div><div class="mx-sfs-row" style="padding-left:18px">Rotation : Rotation List</div><div class="mx-sfs-row" style="padding-left:32px">Frozen Rotation : Euler XYZ</div><div class="mx-sfs-row" style="padding-left:32px">Zero Euler XYZ : Euler XYZ</div><div class="mx-sfs-row" style="padding-left:18px">Scale : Bezier Scale</div></div>`, false)}`);
}

// ─── 3D Viewport: the rig ───────────────────────────────────────────────────
// The rig is computed in Max coordinates (rig.js) and drawn with three.js: Max (x, y, z) = three (x, z, -y).
const viewCanvas = $('#view'), viewHost = max.host;
// The kit viewport: Max home grid, MMB pan, Alt+MMB orbit, Ctrl+Alt+MMB zoom, wheel zoom, ViewCube.
const vp = createMaxViewport({ host: viewHost, canvas: viewCanvas, onChange: () => { if (!S.data) return; if (!framed3) { framed3 = true; frameView3(); return; } gizmo.update(); render3(); } });
vp.attachViewCube(max.viewCubeCanvas, face => { lookFrom(face); });
const renderer3 = vp.renderer, scene3 = vp.scene, cam3 = vp.camera;
let framed3 = false;
// Max local → three world
function maxMatrix(lin, o) {
  const m = new THREE.Matrix4();
  m.set(lin[0][0], lin[0][1], lin[0][2], o[0], lin[2][0], lin[2][1], lin[2][2], o[2], -lin[1][0], -lin[1][1], -lin[1][2], -o[1], 0, 0, 0, 1);
  return m;
}
const MAX_TO_THREE = maxMatrix([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0]);
const THREE_TO_MAX = MAX_TO_THREE.clone().invert();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const place3 = (obj, lin, o) => { obj.matrixAutoUpdate = false; obj.matrix.copy(maxMatrix(lin, o)); obj.matrixWorldNeedsUpdate = true; };
const ballTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); const cols = ['#e83c32', '#f5f2e9', '#1971d4', '#f6d123', '#f5f2e9', '#e83c32', '#f5f2e9', '#1971d4']; for (let i = 0; i < 8; i++) { g.fillStyle = cols[i]; g.fillRect(i * 32, 0, 32, 128); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
// pilota_Mesh: a unit sphere in Max coordinates (poles on Max Z); the rig gives its matrix every frame
const ballGeo = new THREE.SphereGeometry(1, 40, 24); ballGeo.applyMatrix4(THREE_TO_MAX);
const ball3 = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }));
ball3.userData.obj = 'pilota_Mesh'; scene3.add(ball3);
const ballGroup = ball3; // test hook name kept
const shadow3 = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
shadow3.rotation.x = -Math.PI / 2; shadow3.position.y = 0.005; scene3.add(shadow3);

// Control shapes, drawn in their own Max local space (wire colour green, white when selected, as in Max).
const WIRE = 0x36d636, WIRE_SEL = 0xffffff, WIRE_FROZEN = 0x8a8a8a;
const lineMat = () => new THREE.LineBasicMaterial({ color: WIRE, depthTest: false, transparent: true });
const circlePts = (r, n = 64) => { const P = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2; P.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(b) * r, Math.sin(b) * r, 0); } return P; };
function boxPts(w, h, z0) { const x = w / 2, P = [], c = [[-x, -x], [x, -x], [x, x], [-x, x]]; for (let i = 0; i < 4; i++) { const [a, b] = c[i], [d, e] = c[(i + 1) % 4]; P.push(a, b, z0, d, e, z0, a, b, z0 + h, d, e, z0 + h, a, b, z0, a, b, z0 + h); } return P; }
const segs = P => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); return g; };
const invisible = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
function control(id, P, pickGeo) {
  const grp = new THREE.Group(), lines = new THREE.LineSegments(segs(P), lineMat());
  lines.renderOrder = 10; grp.add(lines);
  const pick = new THREE.Mesh(pickGeo, invisible); pick.userData.obj = id; grp.add(pick);
  grp.userData = { id, lines, pick }; scene3.add(grp); return grp;
}
const ringPick = (r0, r1) => new THREE.RingGeometry(r0, r1, 48);
const ctrls3 = {
  ctrl_master: control('ctrl_master', circlePts(0.78), ringPick(0.66, 0.9)),
  ctrl_pilota: control('ctrl_pilota', circlePts(0.66), ringPick(0.58, 0.76)),
  squash_space: control('squash_space', [-.09, 0, 0, .09, 0, 0, 0, -.09, 0, 0, .09, 0, 0, 0, -.09, 0, 0, .09], new THREE.SphereGeometry(0.07, 8, 6)),
  ctrl_top: control('ctrl_top', boxPts(0.13, 0.08, 0.015), new THREE.BoxGeometry(0.2, 0.2, 0.14).translate(0, 0, 0.055)),
  ctrl_bottom: control('ctrl_bottom', boxPts(0.13, 0.08, -0.095), new THREE.BoxGeometry(0.2, 0.2, 0.14).translate(0, 0, -0.055)),
};
// Bones (hidden in the class file): ball_Bone from ctrl_bottom to ctrl_top, and the small tip_bone after it.
function boneShape(id) {
  const w = 0.07, P = [0, 0, 0, w, 0, .12, 0, 0, 0, -w, 0, .12, 0, 0, 0, 0, w, .12, 0, 0, 0, 0, -w, .12, w, 0, .12, 0, w, .12, 0, w, .12, -w, 0, .12, -w, 0, .12, 0, -w, .12, 0, -w, .12, w, 0, .12, w, 0, .12, 0, 0, 1, -w, 0, .12, 0, 0, 1, 0, w, .12, 0, 0, 1, 0, -w, .12, 0, 0, 1, 0, .015, .35, 0, .015, .85];
  return control(id, P, new THREE.CylinderGeometry(0.06, 0.06, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5));
}
const bones3 = { ball_Bone: boneShape('ball_Bone'), tip_bone: boneShape('tip_bone') };
for (const b of Object.values(bones3)) b.userData.lines.material.color.setHex(0xe6c34a);
const all3 = { ...ctrls3, ...bones3 };
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
  const x = S.data?.channels ? pose(S.frame).ball.center[0] : 0;
  vp.view.target.set(x, 2.7, 0); vp.view.dist = (side ? 9.6 : 9.4) * fit;
  vp.view.az = side ? 0 : -.2; vp.view.el = side ? .02 : .1;
  cameraFollowsBall = true; lastCameraFrame = null;
  vp.update();
}
function lookFrom(face) { cameraFollowsBall = false; vp.setView(face); msg(tr('ViewCube: {f}', { f: face.toUpperCase() })); }
function resize3() { vp.resize(); }
// The whole rig at frame f (with the unkeyed pose on top at the current frame).
const pose = f => { const over = Math.round(f) === Math.round(S.frame) && !S.playing ? S.override : {}; return rigPose(id => over[id] ?? valueAt(id, f)); };
const KIND = Object.fromEntries(OBJECTS.map(o => [o.id, o.kind]));
const CAT = { Geometry: 'geometry', Shape: 'shapes', Helper: 'helpers', Bone: 'bones' };
const shown3 = id => !scene[id].hidden && !S.cat.has(CAT[KIND[id]]) && (KIND[id] === 'Geometry' || !S.previewing) && !(id === 'tip_bone' && scene.ball_Bone.hidden && false);
let lastPathKey = '';
function drawView() {
  const P = pose(S.frame), b = P.ball;
  const currentFrame = Math.round(S.frame);
  if (cameraFollowsBall && lastCameraFrame !== currentFrame) { vp.view.target.x = b.center[0]; lastCameraFrame = currentFrame; vp.update(); }
  // Transform Type-In: the tracks of the selected control for the current tool
  if (S.bone && isControl(S.bone) && S.tool !== 'select') { const p = S.tool === 'rotate' ? 'r' : S.tool === 'scale' ? 's' : 'p'; max.setCoords(...['x', 'y', 'z'].map(a => cur(trackId(S.bone, p + a)))); }
  else if (S.bone && isControl(S.bone)) max.setCoords(...['x', 'y', 'z'].map(a => cur(trackId(S.bone, 'p' + a))));
  else max.setCoords(null, null, null);
  // the ball
  place3(ball3, b.lin, b.center); ball3.visible = shown3('pilota_Mesh');
  const sh = Math.max(0.25, 1 - Math.max(0, b.bottom) / 6);
  shadow3.position.set(b.center[0], 0.005, -b.center[1]); shadow3.scale.setScalar(b.sx * (0.6 + 0.4 * sh)); shadow3.material.opacity = 0.35 * sh; shadow3.visible = ball3.visible;
  // controls and bones
  for (const id of CONTROLS) { const w = worldOf(P, id); place3(ctrls3[id], w.lin, w.o); }
  const dir = V3(...P.bone.dir), len = P.bone.length;
  const boneLin = (L, wScale) => { const z = P.bone.dir, ref = Math.abs(z[0]) > .9 ? [0, 1, 0] : [1, 0, 0]; const x = V3(...ref).cross(dir).normalize(), y = dir.clone().cross(x); return [[x.x * wScale, y.x * wScale, z[0] * L], [x.y * wScale, y.y * wScale, z[1] * L], [x.z * wScale, y.z * wScale, z[2] * L]]; };
  place3(bones3.ball_Bone, boneLin(len, 1), P.bone.from); place3(bones3.tip_bone, boneLin(0.12, 0.6), P.bone.to);
  for (const [id, g] of Object.entries(all3)) {
    g.visible = shown3(id);
    g.userData.lines.material.color.setHex(S.bone === id ? WIRE_SEL : scene[id].frozen ? WIRE_FROZEN : KIND[id] === 'Bone' ? 0xe6c34a : WIRE);
  }
  // gizmo on the selected control's pivot, all three axes available
  const showGizmo = S.bone && isControl(S.bone) && S.tool !== 'select' && !S.previewing && all3[S.bone].visible && !scene[S.bone].frozen;
  gizmo.setVisible(!!showGizmo);
  if (showGizmo) { const o = worldOf(P, S.bone).o; gizmo.setMode(S.tool); gizmo.attach({ x: o[0], y: o[1], z: o[2] }); gizmo.setEnabled({}); gizmo.setLocked(S.tool === 'move' ? S.axis : null); gizmo.update(); }
  vp.outline(ball3, S.bone === 'pilota_Mesh' && !S.previewing);
  // motion path, ghosts and reference only need rebuilding when the animation changes
  const key = JSON.stringify([S.data.channels, S.data.static, S.start, S.end, S.toggles, Math.round(S.frame)]);
  if (key !== lastPathKey) {
    lastPathKey = key;
    pathDots.clear(); ghosts.clear();
    const keyFrames = new Set((S.data.channels.locZ || []).map(k => k.frame));
    if (S.toggles.path) {
      const pts = [];
      for (let f = S.start; f <= S.end; f++) {
        const c = rigPose(id => valueAt(id, f)).ball.center, isKey = keyFrames.has(f), v = fromMax3(c);
        pts.push(v);
        const col = f === Math.round(S.frame) ? 0x6aa8ff : isKey ? 0xffd24a : f < S.frame ? 0xdddddd : 0x9c9c9c;
        const m = new THREE.Mesh(isKey ? keyDotGeo : dotGeo, new THREE.MeshBasicMaterial({ color: col, depthTest: false })); m.renderOrder = 5;
        m.position.copy(v); pathDots.add(m);
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthTest: false }));
      pathDots.add(line);
    }
    if (S.toggles.ghosts) for (let f = S.start; f <= S.end; f += 2) {
      const q = rigPose(id => valueAt(id, f)).ball, g = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0xf0a020, transparent: true, opacity: 0.12, depthWrite: false }));
      place3(g, q.lin, q.center); ghosts.add(g);
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
  const secs = ((S.frame - 1) / FPS).toFixed(2), rotNow = cur('rotY');
  $('#view-overlay').innerHTML = `<div data-no-i18n>(${Math.round(S.frame)}) ${esc(S.bone ? `${KIND[S.bone]} : ${S.bone}` : 'None Selected')}</div><div>${secs} s · X ${b.center[0].toFixed(2)} m · ${esc(tr('Height {v} m', { v: Math.max(0, b.bottom).toFixed(2) }))} · ${esc(tr('Scale {x} × {z}', { x: b.sx.toFixed(2), z: b.sz.toFixed(2) }))}</div>${S.data.channels.rotY ? `<div>${esc(tr('Rotation {v}°', { v: rotNow.toFixed(0) }))}</div>` : ''}${Object.keys(S.override).length && !S.xf ? `<div class="unkeyed">${esc(t('Unkeyed change: click Set Keys'))}</div>` : ''}`;
  render3();
}
const fromMax3 = c => new THREE.Vector3(c[0], c[2], -c[1]);
function render3() { renderer3.render(scene3, cam3); }

// Selecting objects in the viewport: controls, bones and the mesh when they are visible and not frozen.
const ray3 = new THREE.Raycaster();
function pickObject(e) {
  const r = viewCanvas.getBoundingClientRect();
  ray3.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam3);
  for (const g of Object.values(all3)) g.updateMatrixWorld(true);
  ball3.updateMatrixWorld(true);
  const picks = Object.values(all3).filter(g => g.visible && !scene[g.userData.id].frozen).map(g => g.userData.pick);
  const hits = ray3.intersectObjects(picks, false);
  // small helpers win over the big circles behind them
  const size = { squash_space: 0, ctrl_top: 1, ctrl_bottom: 1, tip_bone: 2, ball_Bone: 3, ctrl_pilota: 4, ctrl_master: 5 };
  if (hits.length) return hits.sort((a, b) => size[a.object.userData.obj] - size[b.object.userData.obj] || a.distance - b.distance)[0].object.userData.obj;
  if (ball3.visible && !scene.pilota_Mesh.frozen && ray3.intersectObject(ball3, false).length) return 'pilota_Mesh';
  return null;
}
function selectBone(id) {
  if (S.xf) endTransform(false);
  if (Object.keys(S.override).length && id !== S.bone) dropOverrides();
  S.bone = id; max.select(id); S.activeKey = null;
  if (id && isControl(id)) {
    // Track View shows the tracks of the selected object: its animated tracks are highlighted
    const anim = animatedOf(id).filter(t => !(stage().hide || []).includes(t) || id !== 'ctrl_pilota');
    S.shown = new Set(anim.length ? anim : [trackId(id, 'pz')]);
    S.active = [...S.shown][0];
  }
  renderAll();
}
// 3ds Max: click an object to select it; drag it, or an axis / plane of its gizmo, to transform it.
// Release to finish, right-click while dragging (or Esc) to cancel. The middle button navigates.
const gizmoPart = e => S.bone && isControl(S.bone) && S.tool !== 'select' && gizmo.root.visible ? gizmo.pick(e) : null;
viewCanvas.addEventListener('pointerdown', e => {
  closeMenu();
  if (e.button !== 0 || e.altKey) return;
  let part = gizmoPart(e);
  const hit = part ? S.bone : pickObject(e);
  if (!hit) { if (max.state.lock) return; if (S.bone) selectBone(null); return; }
  if (hit !== S.bone) { if (max.state.lock) return msg('Selection Lock is on: press Space to unlock it.', true); selectBone(hit); }
  if (S.tool === 'select') return;
  if (!isControl(hit)) return msg(tr(hit === 'pilota_Mesh' ? '{h} has a Skin modifier: the bones move it. Animate the controls (ctrl_pilota, ctrl_top…).' : '{h} is driven by ctrl_bottom and ctrl_top (Look At). Animate the controls.', { h: hit }), true);
  // which part drives the drag: the gizmo part clicked, or the current axis constraint (F5–F8)
  if (S.tool === 'move') { if (!part) part = S.axis || 'xz'; else if (part.length <= 2) { S.axis = part; store.set('axis', part); } }
  else if (S.tool === 'rotate') { if (!part) part = S.rotAxis || 'y'; if (part === 'view') part = 'y'; S.rotAxis = part; }
  else if (!part) part = 'xyz';
  startTransform(e, part);
});
viewCanvas.addEventListener('pointermove', e => {
  if (S.xf) { const d = gizmo.drag(e); if (d) updateTransform(d); return; }
  if (vp.isNavigating()) return;
  if (gizmo.hover(e)) render3();
  const over = gizmo.hoveredPart || (S.tool !== 'select' ? pickObject(e) : pickObject(e) && 'sel');
  viewCanvas.style.cursor = over ? (S.tool === 'rotate' ? 'alias' : S.tool === 'scale' ? 'nesw-resize' : S.tool === 'move' ? 'move' : 'pointer') : 'default';
});
viewCanvas.addEventListener('pointerup', e => {
  if (!S.xf) return;
  if (viewCanvas.hasPointerCapture(e.pointerId)) viewCanvas.releasePointerCapture(e.pointerId);
  endTransform(true);
});
viewCanvas.addEventListener('contextmenu', e => { if (!S.xf) return; e.preventDefault(); endTransform(false); msg('Transform cancelled (right-click).'); });
// A drag with Select and Move / Rotate / Scale on the selected control: every axis works.
function startTransform(e, part) {
  const obj = S.bone;
  if (scene[obj].frozen) return msg(tr('{h} is frozen: unfreeze it in the Scene Explorer.', { h: obj }), true);
  const base = Object.fromEntries(tracksOf(obj).map(id => [id, cur(id)]));
  S.xf = { obj, part, tool: S.tool, base, prev: { ...S.override }, pose: pose(S.frame) };
  e.preventDefault(); viewCanvas.setPointerCapture(e.pointerId);
  viewHost.classList.add('modal');
  gizmo.begin(e, part); drawView();
}
function updateTransform(d) {
  const x = S.xf, o = x.obj, over = { ...x.prev };
  let text = '';
  if (x.tool === 'move' && d.move) {
    const local = worldToLocalMove(x.pose, o, [d.move.x, d.move.y, d.move.z]);
    ['x', 'y', 'z'].forEach((a, i) => { const id = trackId(o, 'p' + a); over[id] = +(x.base[id] + local[i]).toFixed(4); });
    text = `${t('Move')}  ${x.part.toUpperCase().split('').map(a => `${a} ${over[trackId(o, 'p' + a.toLowerCase())].toFixed(2)}`).join('  ')} m`;
  }
  if (x.tool === 'rotate' && d.angle != null) {
    const id = trackId(o, 'r' + x.part), v = x.base[id] + d.angle;
    over[id] = +(max.state.angleSnap ? Math.round(v / 5) * 5 : v).toFixed(2);
    text = `${t('Rotate')}  ${x.part.toUpperCase()} ${over[id].toFixed(1)}°`;
  }
  if (x.tool === 'scale' && d.scale != null) {
    for (const a of x.part.split('')) { const id = trackId(o, 's' + a); over[id] = +(x.base[id] * d.scale).toFixed(2); }
    text = `${t('Scale')}  ${x.part.toUpperCase()} ${Math.round(d.scale * 100)}%`;
  }
  S.override = over;
  $('#view-readout').hidden = false; $('#view-readout').textContent = `${o} · ${text}`;
  drawView(); renderSidebar();
}
function endTransform(ok) {
  const x = S.xf; if (!x) return;
  S.xf = null; gizmo.end(); viewHost.classList.remove('modal'); $('#view-readout').hidden = true;
  if (!ok) { S.override = x.prev; drawView(); return; }
  const changes = {};
  for (const id of tracksOf(x.obj)) if (S.override[id] != null && S.override[id] !== x.prev[id]) changes[id] = S.override[id];
  S.override = x.prev;
  if (Object.keys(changes).length) applyChange(changes); else drawView();
}
function syncTransformTools() {
  max.setModes({ tool: S.tool, silent: true });
}
function activateTool(tool) {
  if (S.xf) endTransform(false);
  S.tool = tool; store.set('tool', tool); syncTransformTools(); drawView();
}
function chooseAxis(axis) {
  S.axis = axis; store.set('axis', S.axis);
  if (S.tool === 'rotate' && axis.length === 1) S.rotAxis = axis;
  msg(tr('Restrict to {a}', { a: S.axis.toUpperCase() }));
  syncTransformTools(); drawView();
}
function syncKeyMode() {
  max.setModes({ auto: S.keyMode === 'auto', setMode: S.keyMode === 'set' });
}
function chooseKeyMode(mode) {
  S.keyMode = S.keyMode === mode ? 'off' : mode;
  store.set('keyMode', S.keyMode);
  if (S.keyMode !== 'set' && Object.keys(S.override).length) dropOverrides();
  syncKeyMode();
  msg(S.keyMode === 'auto' ? 'Auto Key: moving a control creates a key.' : S.keyMode === 'set' ? 'Set Key Mode: pose a control, then click Set Keys.' : 'Key modes off: changes move the whole animation of a track. Enable Auto Key or Set Key Mode to animate.');
}
syncKeyMode(); syncTransformTools();
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
  if (S.toggles.ref && stage().id === 'weight' && S.shown.has('locZ')) {
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ffbf00b0'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let x = 0; x <= w; x += 2) { const y = gy(REFERENCE(fx(x))); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // Contact intervals under the Z Position curve.
  if (S.shown.has('locZ') && S.data.channels.locZ) {
    const c = contacts(S.data.channels.locZ), y = gy(0) + 12;
    ctx.strokeStyle = '#6f8fb8'; ctx.fillStyle = '#9dc0ea'; ctx.lineWidth = 1;
    intervals(c).forEach((n, i) => {
      const a = gx(c[i]), b = gx(c[i + 1]);
      ctx.beginPath(); ctx.moveTo(a, y - 4); ctx.lineTo(a, y); ctx.lineTo(b, y); ctx.lineTo(b, y - 4); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(`${n} f`, (a + b) / 2, y + 11); ctx.textAlign = 'left';
    });
  }
  // curves
  // tracks without keys: a flat line at their value, as Max draws an unanimated track
  for (const id of visibleChannels().filter(i => !S.data.channels[i])) {
    ctx.strokeStyle = CHANNELS[id].color; ctx.globalAlpha = .75; ctx.lineWidth = 1; const y = gy(valueAt(id, S.frame));
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const id of keyedVisible()) {
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
  for (const id of keyedVisible()) {
    if (!editable(id)) continue;
    for (const k of S.data.channels[id]) if (k.select) {
      if (prevInterp(id, k) === 'BEZIER' && near(k.left, 7)) return { id, k, side: 'left' };
      if (k.interp === 'BEZIER' && near(k.right, 7)) return { id, k, side: 'right' };
    }
  }
  const order = [S.active, ...keyedVisible().filter(i => i !== S.active)];
  for (const id of order) {
    if (!keyedVisible().includes(id) || !editable(id)) continue;
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
      if (ks?.some(q => q.frame === f)) return msg('There is already a keyframe on that frame.', true);
      pushUndo(); clearSelection(); const k = setKeyAt(id, f, +valueAt(id, f).toFixed(3)); k.select = true; S.activeKey = k;
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
  const f = Math.round(S.frame);
  pushUndo();
  const k = setKeyAt(id, f, +valueAt(id, f).toFixed(3));
  clearSelection(); k.select = true; S.activeKey = k;
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
  // As in Max: World › Objects › the selected object › Transform › Position › Zero Pos XYZ › X / Y / Z Position…
  const rows = [{ d: 0, label: 'World', kind: 'world' }, { d: 1, label: 'Objects', kind: 'node' }];
  const o = S.bone;
  if (o && isControl(o)) {
    const ids = tracksOf(o), row = (d, label, list, extra = {}) => ({ d, label, kind: 'node', sel: list.length > 0 && list.every(i => S.shown.has(i)), attrs: { 'data-ids': list.join(',') }, ...extra });
    const obj = OBJECTS.find(x => x.id === o);
    rows.push(row(2, o, ids, { kind: 'object', icon: { Shape: 'seShape', Helper: 'seHelper' }[obj.kind], bold: true, sel: false }));
    rows.push(row(3, 'Transform', ids, { sel: false }));
    const pos = tracksOf(o, 'Position'), rot = tracksOf(o, 'Rotation'), sc = tracksOf(o, 'Scale');
    rows.push(row(4, 'Position', pos, { sel: false }), row(5, 'Zero Pos XYZ', pos, { sel: false }));
    for (const id of pos) rows.push({ d: 6, label: CHANNELS[id].name, kind: 'track', color: CHANNELS[id].color, sel: S.shown.has(id), bold: id === S.active && S.shown.has(id) && false, attrs: { 'data-ids': id, 'data-ch': id } });
    rows.push(row(4, 'Rotation', rot, { sel: false }), row(5, 'Zero Euler XYZ', rot, { sel: false }));
    for (const id of rot) rows.push({ d: 6, label: CHANNELS[id].name, kind: 'track', color: CHANNELS[id].color, sel: S.shown.has(id), attrs: { 'data-ids': id, 'data-ch': id } });
    rows.push(row(4, 'Scale', sc, { attrs: { 'data-ids': sc.join(','), title: 'Bezier Scale: X, Y and Z Scale curves' } }));
  }
  tv.tree.innerHTML = trackTreeHTML(rows);
  tv.tree.querySelectorAll('.mx-tvnode').forEach(b => { b.dataset.noI18n = ''; });
}
// Click a track (or a controller above it) to show its curves; Ctrl+click adds or removes them.
tv.tree.addEventListener('click', e => {
  S.area = 'graph';
  const row = e.target.closest('[data-ids]'); if (!row) return;
  const ids = row.dataset.ids.split(',').filter(Boolean); if (!ids.length) return;
  if (e.ctrlKey || e.metaKey) { const all = ids.every(i => S.shown.has(i)); for (const i of ids) all ? S.shown.delete(i) : S.shown.add(i); }
  else S.shown = new Set(ids);
  S.active = ids.find(i => S.shown.has(i)) || visibleChannels()[0] || S.active;
  if (keyedVisible().length) frameAll();
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
    html += `<div class="sb-stat"><span data-no-i18n>ctrl_top Z</span><b>${(S.override.topZ ?? valueAt('topZ', S.frame)).toFixed(2)} m</b></div>`;
    html += `<div class="sb-stat"><span data-no-i18n>ctrl_bottom Z</span><b>${(S.override.botZ ?? valueAt('botZ', S.frame)).toFixed(2)} m</b></div>`;
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
  for (const id of TRACK_ORDER) {
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
      if (r?.kind === 'ch') { S.active = r.id; S.shown.add(r.id); if (S.bone !== CHANNELS[r.id].bone) { S.bone = CHANNELS[r.id].bone; max.select(S.bone); } renderAll(); }
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
    card.innerHTML = `<div><span class="control-label">${esc(t('FREE PRACTICE'))}</span><h3>${esc(t('Make your own animation'))}</h3><p>${esc(t('Every control can move, rotate and scale on all three axes: ctrl_master, ctrl_pilota, squash_space, ctrl_top and ctrl_bottom. Your work is saved in this browser.'))}</p></div>
      <div><span class="control-label">${esc(t('HOW, IN 3DS MAX'))}</span><ol>
        <li>${t('Select ctrl_pilota, choose Select and Move (<kbd>W</kbd>), and create keys with Auto Key (<kbd>N</kbd>) or Set Keys (<kbd>K</kbd>).')}</li>
        <li>${t('Use ctrl_top and ctrl_bottom for squash and stretch; rotate ctrl_pilota with Select and Rotate (<kbd>E</kbd>).')}</li>
        <li>${t('Use Select and Uniform Scale (<kbd>R</kbd>) with Auto Key or Set Keys, or edit its curves in Track View.')}</li>
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
  S.focus = null; lastDone = null; S.override = {};
  loadData();
  // the travel curve is shown on demand
  S.active = stage().active || 'locZ'; S.bone = CHANNELS[S.active].bone; max.select(S.bone);
  const hide = stage().hide || ['locX'];
  S.shown = new Set(animatedOf(S.bone).filter(id => !hide.includes(id))); S.shown.add(S.active);
  S.toggles.ref = stage().independent ? !!stage().steps[S.step].reference : false;
  frameAll(); sizeBottom(); renderAll(); checkProgress();
}


// ─── Lab keyboard shortcuts while the pointer is over the workspace ──
// ─── Start ──────────────────────────────────────────────────────────────────
setupGraphInput(); setupTimeline();
new ResizeObserver(() => renderLive()).observe(tv.host);
onLangChange(() => renderAll());
frameView3(); enterStage(); resize3();
window.__maxAnim = S; window.__maxAnim3 = { cam3, ctrls3, bones3, selectBone, applyChange, setKeys, pose, ball3, ballGroup, scene }; window.__maxAnimGizmo = gizmo; window.__maxAnimVp = vp; // test hooks
