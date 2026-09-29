// Track View Lab: Time Slider, Track Bar, Curve Editor and Dope Sheet in a 3ds Max 2027 workspace.
import { TRACKS, createLesson, track, findKey, trackForKey, valueAt, addKey, moveKeys, deleteKeys, moveGraphKey, setTangent, dragTangent, checkLesson, setTimelineRange, tangentName } from './model.js?v=3';
import { createMaxShell, createTrackView, rollout, spinner } from '../_max/max-shell.js?v=1';
import { icon } from '../_max/max-icons.js?v=1';

const $ = s => document.querySelector(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, n = 2) => +(+v).toFixed(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const meta = id => TRACKS.find(t => t.id === id);
const GROUP_TYPE = { Position: 'position', Rotation: 'rotation', Scale: 'scale' };

const LESSONS = {
  timeline: { index: 'EXERCICI 01 · TIME SLIDER', title: 'Timeline i fotogrames clau', summary: 'El Time Slider marca el fotograma actual i el Track Bar, just a sota, mostra les claus de l’objecte seleccionat: vermell per a Position, verd per a Rotation i blau per a Scale. Auto Key grava cada canvi; Set Key Mode et deixa preparar la pose i desar-la amb Set Keys.', task: 'Ves a un fotograma entre 1 i 59 (arrossega el Time Slider o prem , i .). Activa Auto Key (N) i porta la pilota a X = 5: arrossega-la amb Select and Move (W) o escriu 5 al camp X de la barra d’estat. També pots fer-ho amb Set Key Mode (’) i Set Keys (K). Després arrossega la clau nova al Track Bar.', success: 'Clau intermèdia creada. Prova de moure-la al Track Bar o de copiar-la amb Maj + arrossegar.' },
  range: { index: 'EXERCICI 02 · TIME CONFIGURATION', title: 'Mou i redimensiona el rang', summary: 'El rang de temps decideix quins fotogrames mostra el Time Slider i quins es reprodueixen. Les claus que queden fora del rang no s’esborren: continuen a la pista.', task: 'Deixa l’inici al fotograma 10 o més tard i el final al 55 o abans. Fes-ho amb Time Configuration (el botó del rellotge, a sota del play) o amb Ctrl+Alt i arrossegant al Track Bar: botó esquerre per a l’inici, dret per al final i central per desplaçar el rang.', success: 'Has ajustat els dos extrems del rang. Les claus de fora continuen a les pistes.' },
  curves: { index: 'EXERCICI 03 · CURVE EDITOR', title: 'Curve Editor i tangents', summary: 'A la Key Window, l’eix horitzontal és el temps i el vertical, el valor. La pendent de la corba és la velocitat. Les tangents decideixen com entra i surt la corba de cada clau: Auto, Spline, Fast, Slow, Step, Linear i Smooth.', task: 'A X Position, puja la clau central per sobre de 6 m: arrossega-la amb Move Keys o escriu el valor al camp de la dreta de la barra inferior de la Track View. Aplica-hi Set Tangents to Smooth o Auto. Després compara Slow, Fast i Break Tangents.', success: 'Has canviat el valor i la tangent: mira com varia la velocitat de la pilota al viewport.' },
  dope: { index: 'EXERCICI 04 · DOPE SHEET', title: 'Dope Sheet i timing', summary: 'El Dope Sheet mostra les claus en files, una per pista. Aquí canvies el moment de cada clau sense tocar-ne el valor. Amb Maj i arrossegant en fas una còpia.', task: 'Obre el Dope Sheet (menú Editor de la Track View, o Graph Editors › Track View - Dope Sheet). Mou la clau central de Y Rotation del fotograma 30 al 25 o abans. Després copia la clau central de Uniform Scale amb Maj + arrossegar.', success: 'Has canviat el ritme de dues pistes sense canviar-ne els valors.' },
  loops: { index: 'EXERCICI 05 · OUT-OF-RANGE TYPES', title: 'Cycle, Loop i Ping Pong', summary: 'Fora de les claus, 3ds Max pot mantenir l’últim valor (Constant), repetir el tram (Cycle), repetir-lo acumulant el canvi (Loop) o anar endavant i enrere (Ping Pong). En aquesta escena la rotació té claus a 0° i 360°, entre els fotogrames 0 i 20.', task: 'Selecciona Y Rotation a la Track View i prem Parameter Curve Out-of-Range Types a la barra d’eines. Compara Cycle, Loop i Ping Pong. Tria Loop i ves al fotograma 60: Y Rotation ha de valer 1080°.', success: 'Loop conserva la continuïtat: 360° per volta, 1080° al fotograma 60.' },
  free: { index: 'EXPLORACIÓ LLIURE', title: 'Construeix la teva animació', summary: 'Tens totes les eines: Auto Key, Set Keys amb filtres, Track Bar, Curve Editor i Dope Sheet. Afegeix, mou, copia o suprimeix claus i mira com canvia la pilota.', task: 'Anima la pilota com vulguis. Canvia les pistes que grava Set Keys amb el botó Filters..., compara tangents i fes una rotació que es repeteixi.', success: 'Segueix experimentant amb les pistes i els fotogrames.' },
};
const OUT_TYPES = [
  ['constant', 'Constant', 'M4 30 L34 30 C44 30 50 6 60 6 L90 6'],
  ['cycle', 'Cycle', 'M4 30 C12 30 16 6 24 6 M24 30 C32 30 36 6 44 6 M44 30 C52 30 56 6 64 6 M64 30 C72 30 76 6 84 6'],
  ['loop', 'Loop', 'M4 34 C10 34 12 26 18 26 C24 26 26 18 32 18 C38 18 40 10 46 10 C52 10 54 2 60 2'],
  ['pingpong', 'Ping Pong', 'M4 30 C12 30 16 6 24 6 C32 6 36 30 44 30 C52 30 56 6 64 6 C72 6 76 30 84 30'],
  ['linear', 'Linear', 'M4 36 L30 22 C40 18 46 12 60 8 L90 0'],
  ['relative', 'Relative Repeat', 'M4 34 L14 34 C20 34 22 26 28 26 L38 26 C44 26 46 18 52 18 L62 18 C68 18 70 10 76 10'],
];
const OUT_TEXT = { constant: 'Constant: manté el primer o l’últim valor.', cycle: 'Cycle: repeteix el mateix tram i torna al valor inicial.', loop: 'Loop: repeteix el tram sumant el canvi de cada volta.', pingpong: 'Ping Pong: alterna endavant i enrere entre les claus.' };
const TAN_TOOLS = { tanAuto: 'auto', tanSpline: 'spline', tanFast: 'fast', tanSlow: 'slow', tanStep: 'step', tanLinear: 'linear', tanSmooth: 'smooth', breakTangents: 'break', unifyTangents: 'unify' };
const TAN_ICON = { auto: 'tvTangentAuto', spline: 'tvTangentSpline', fast: 'tvTangentFast', slow: 'tvTangentSlow', step: 'tvTangentStep', linear: 'tvTangentLinear', smooth: 'tvTangentSmooth' };

const scenes = new Map();
const S = {
  lesson: 'timeline', scene: null, frame: 0, active: 'x', selected: [], view: 'curve', tool: 'move', auto: false, setMode: false, keyMode: false,
  pending: {}, drag: null, playing: false, graphStart: 0, graphEnd: 60, lastStamp: 0, playFloat: 0, objectSelected: true,
  filters: new Set(['Position', 'Rotation', 'Scale']), tvTool: 'moveKeys', showTangents: true, undo: [], redo: [], grid: true,
};
const selectedKeys = () => S.selected.map(id => findKey(S.scene, id)).filter(Boolean);
const current = id => S.pending[id] ?? valueAt(S.scene, id, S.frame);
const cleanPending = () => { S.pending = {}; };
const notify = msg => max.prompt(msg);

// ─── Undo ────────────────────────────────────────────────────────────────────
const snapshot = () => JSON.stringify({ tracks: S.scene.tracks, start: S.scene.start, end: S.scene.end, out: S.scene.out });
function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
function restore(json) { const d = JSON.parse(json); Object.assign(S.scene, d); S.selected = S.selected.filter(id => findKey(S.scene, id)); cleanPending(); S.frame = clamp(S.frame, S.scene.start, S.scene.end); render(); }
function undo() { if (!S.undo.length) { notify('Undo: nothing to undo'); return; } S.redo.push(snapshot()); restore(S.undo.pop()); notify('Undo'); }
function redo() { if (!S.redo.length) { notify('Redo: nothing to redo'); return; } S.undo.push(snapshot()); restore(S.redo.pop()); notify('Redo'); }

// ─── Keys ────────────────────────────────────────────────────────────────────
function record(changedIds) {
  if (!S.auto) return false;
  pushUndo();
  for (const id of changedIds) addKey(S.scene, id, S.frame, current(id));
  S.selected = changedIds.map(id => track(S.scene, id).find(k => k.frame === S.frame)?.id).filter(Boolean);
  cleanPending(); notify(`Auto Key: ${changedIds.map(id => meta(id).name).join(', ')} keyed at frame ${S.frame}`);
  return true;
}
function setValue(id, value) {
  if (!Number.isFinite(value) || !S.objectSelected) return;
  if (id === 'scale') value = clamp(value, .1, 4);
  S.pending[id] = round(value, 3);
  if (!record([id]) && !S.setMode) notify('Value changed without a key: turn on Auto Key (N) or Set Key Mode (\') to keep it');
  render();
}
function setKeys() {
  if (!S.setMode) { notify('Set Keys works in Set Key Mode: press \' or the Set K. button'); return; }
  if (!S.objectSelected) { notify('Select Ball_01 first'); return; }
  const tracks = TRACKS.filter(t => S.filters.has(t.group));
  if (!tracks.length) { notify('Key Filters: no track is checked. Open Filters... and check Position, Rotation or Scale'); return; }
  pushUndo();
  const values = Object.fromEntries(tracks.map(t => [t.id, current(t.id)]));
  S.selected = tracks.map(t => addKey(S.scene, t.id, S.frame, values[t.id]).id);
  cleanPending(); notify(`Set Keys: ${tracks.length} tracks keyed at frame ${S.frame} (${[...S.filters].join(', ')})`); render();
}
function keysAtFrames(frames) { const set = new Set(frames); return Object.values(S.scene.tracks).flat().filter(k => set.has(k.frame)).map(k => k.id); }
function deleteSelected() {
  if (!S.selected.length) { notify('Select keys first: click them in the Track Bar or in the Track View'); return; }
  pushUndo(); deleteKeys(S.scene, S.selected); notify(`Deleted ${S.selected.length} key${S.selected.length === 1 ? '' : 's'}`); S.selected = []; render();
}
function applyTangent(type) {
  if (!S.selected.length) { notify('Select one or more keys in the Key Window first'); return; }
  pushUndo(); setTangent(S.scene, S.selected, type);
  notify(`Set Tangents to ${type[0].toUpperCase() + type.slice(1)}: ${S.selected.length} key${S.selected.length === 1 ? '' : 's'}`); render();
}

// ─── Lessons ─────────────────────────────────────────────────────────────────
function enterLesson(id) {
  stop(); S.lesson = id; S.scene = scenes.get(id) || createLesson(id); scenes.set(id, S.scene);
  Object.assign(S, { frame: S.scene.start, playFloat: S.scene.start, active: id === 'loops' ? 'rotation' : 'x', selected: [], view: id === 'dope' ? 'dope' : 'curve', auto: false, setMode: false, keyMode: false, graphStart: S.scene.start - 5, graphEnd: S.scene.end + 5, undo: [], redo: [], objectSelected: true });
  cleanPending();
  document.querySelectorAll('[data-lesson]').forEach(b => b.setAttribute('aria-current', String(b.dataset.lesson === id)));
  const lesson = LESSONS[id];
  $('#lesson-index').textContent = lesson.index; $('#lesson-title').textContent = lesson.title;
  $('#lesson-summary').textContent = lesson.summary; $('#lesson-task').textContent = lesson.task;
  max.setModes({ auto: false, setMode: false, keyMode: false, playing: false, tool: S.tool });
  max.api?.select?.('Ball_01');
  render();
}
function lessonStatus() {
  const ok = checkLesson(S.lesson, S.scene, S.frame), el = $('#lesson-result');
  el.classList.toggle('done', ok);
  el.textContent = S.lesson === 'free' ? 'Sense objectiu fix · prova lliurement' : ok ? `✓ ${LESSONS[S.lesson].success}` : 'Pendent · segueix les instruccions';
}

// ─── The 3ds Max main window ─────────────────────────────────────────────────
const max = createMaxShell($('#max-app'), {
  file: 'Ball_Timing.max', fps: 30, units: 'm', tab: 'motion',
  objects: [{ id: 'Ball_01', name: 'Ball_01', color: '#e1117f', kind: 'Object' }], selected: 'Ball_01',
  keyFilters: ['Position', 'Rotation', 'Scale'],
  pages: { modify: modifyPage(), motion: '' },
  actions: {
    frame: f => setFrame(f),
    prevFrame: () => step(-1), nextFrame: () => step(1),
    goStart: () => setFrame(S.scene.start), goEnd: () => setFrame(S.scene.end),
    play: togglePlay,
    keyMode: () => { S.keyMode = !S.keyMode; max.setModes({ keyMode: S.keyMode }); notify(S.keyMode ? 'Key Mode: , . and the arrows jump from key to key' : 'Key Mode off: , and . move one frame'); },
    autoKey: () => { S.auto = !S.auto; if (S.auto) S.setMode = false; cleanPending(); max.setModes({ auto: S.auto, setMode: S.setMode }); render(); },
    setKeyMode: () => { S.setMode = !S.setMode; if (S.setMode) S.auto = false; cleanPending(); max.setModes({ auto: S.auto, setMode: S.setMode }); render(); },
    setKey: setKeys,
    onKeyFilters: list => { S.filters = new Set(list); },
    onTimeConfig: ({ start, end, fps }) => { pushUndo(); setTimelineRange(S.scene, start, end); S.scene.fps = fps; S.frame = clamp(S.frame, start, end); notify(`Time Configuration: ${start} to ${end} at ${fps} fps`); render(); },
    range: (start, end, done) => { if (!S.rangeUndo) { pushUndo(); S.rangeUndo = true; } if (done) S.rangeUndo = false; if (setTimelineRange(S.scene, start, end)) { S.frame = clamp(S.frame, S.scene.start, S.scene.end); render(); } if (done) notify(`Time range: ${S.scene.start} to ${S.scene.end}`); },
    selectKeys: frames => { S.selected = keysAtFrames(frames); render(); },
    moveKeys: (frames, delta, copy) => { pushUndo(); const ok = moveKeys(S.scene, keysAtFrames(frames), delta, copy); if (!ok) S.undo.pop(); else S.selected = keysAtFrames(frames.map(f => f + delta)); render(); return ok; },
    deleteKeys: frames => { S.selected = keysAtFrames(frames); deleteSelected(); },
    delete: deleteSelected,
    undo, redo,
    select: () => tool('select'), move: () => tool('move'), rotate: () => tool('rotate'), scale: () => tool('scale'),
    selectObject: id => { S.objectSelected = !!id; render(); },
    selectAll: () => { if (max.overTrackView()) selectAllKeys(); else { max.select('Ball_01'); S.objectSelected = true; render(); } },
    selectNone: () => { if (max.overTrackView()) { S.selected = []; render(); } else deselect(); },
    typeIn: (axis, v) => {
      if (S.tool === 'move') setValue(axis === 'x' ? 'x' : 'z', v);
      else if (S.tool === 'rotate' && axis === 'y') setValue('rotation', v);
      else if (S.tool === 'scale') setValue('scale', v / 100);
    },
    curveEditor: () => { S.view = 'curve'; render(); tv.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
    dopeSheet: () => { S.view = 'dope'; render(); tv.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
    grid: () => { S.grid = !S.grid; drawViewport(); notify(S.grid ? 'Grid on (G)' : 'Grid off (G)'); },
    commandPanel: (tab, page) => { if (tab === 'motion') renderMotion(page); },
    layout: () => requestAnimationFrame(render),
    key: (e, combo) => {
      // Inside Track View, arrows nudge nothing and Delete / Ctrl+A act on keys: handled by the shared actions.
      if (combo === 'r' && S.tool === 'scale') { notify('Select and Uniform Scale (R again cycles Non-uniform and Squash in 3ds Max)'); }
      return false;
    },
  },
});
max.api = max;
const tv = createTrackView($('#max-tv'), {
  shell: max,
  tools: { moveKeys: 1, addKeys: 1, outOfRange: 1, tanAuto: 1, tanSpline: 1, tanFast: 1, tanSlow: 1, tanStep: 1, tanLinear: 1, tanSmooth: 1, showTangents: 1, breakTangents: 1, unifyTangents: 1, frameH: 1, frameV: 1, pan: 1, zoom: 1, filters: 1 },
  menus: {
    Editor: () => [{ label: 'Curve Editor', checked: S.view === 'curve', run: () => { S.view = 'curve'; render(); } }, { label: 'Dope Sheet', checked: S.view === 'dope', run: () => { S.view = 'dope'; render(); } }],
    Keys: () => [{ label: 'Add Keys', checked: S.tvTool === 'addKeys', run: () => tvTool('addKeys') }, { label: 'Move Keys', checked: S.tvTool === 'moveKeys', run: () => tvTool('moveKeys') }, { sep: true }, { label: 'Delete Keys', keys: 'Delete', run: deleteSelected }, { label: 'Select All', keys: 'Ctrl+A', run: selectAllKeys }],
    Tangents: () => ['auto', 'spline', 'fast', 'slow', 'step', 'linear', 'smooth'].map(t => ({ label: `Set Tangents to ${t[0].toUpperCase() + t.slice(1)}`, run: () => applyTangent(t) })).concat([{ sep: true }, { label: 'Break Tangents', run: () => applyTangent('break') }, { label: 'Unify Tangents', run: () => applyTangent('unify') }]),
    Curves: () => [{ label: 'Parameter Curve Out-of-Range Types...', run: outOfRangeDialog }],
    Show: () => [{ label: 'Show Tangents', checked: S.showTangents, run: () => tvTool('showTangents') }],
    View: () => [{ label: 'Frame Horizontal Extents', run: () => fitGraph(true, false) }, { label: 'Frame Value Extents', run: () => fitGraph(false, true) }],
    Edit: () => [{ label: 'Undo', keys: 'Ctrl+Z', run: undo }, { label: 'Redo', keys: 'Ctrl+Y', run: redo }],
  },
  actions: {
    tool: id => tvTool(id),
    statFrame: f => { const k = selectedKeys()[0]; if (!k) return; pushUndo(); if (!moveGraphKey(S.scene, k.id, f, k.value)) { S.undo.pop(); notify('Another key is already on that frame'); } render(); },
    statValue: v => { const k = selectedKeys()[0]; if (!k) return; pushUndo(); moveGraphKey(S.scene, k.id, k.frame, v); render(); },
  },
});
max.registerWindow(tv.root);

function tvTool(id) {
  if (TAN_TOOLS[id]) { applyTangent(TAN_TOOLS[id]); return; }
  if (id === 'moveKeys' || id === 'addKeys') { S.tvTool = id; tv.setActive('moveKeys', id === 'moveKeys'); tv.setActive('addKeys', id === 'addKeys'); notify(id === 'addKeys' ? 'Add Keys: click on the curve to add a key there' : 'Move Keys: drag keys in time and value'); return; }
  if (id === 'showTangents') { S.showTangents = !S.showTangents; tv.setActive('showTangents', S.showTangents); render(); return; }
  if (id === 'outOfRange') { outOfRangeDialog(); return; }
  if (id === 'frameH') { fitGraph(true, false); return; }
  if (id === 'frameV') { fitGraph(false, true); return; }
  if (id === 'pan') { notify('Pan: drag with the middle mouse button in the Key Window'); return; }
  if (id === 'zoom') { notify('Zoom: roll the mouse wheel in the Key Window'); return; }
  if (id === 'filters') { notify('Filters: this scene only shows the Transform tracks of Ball_01'); return; }
}
function selectAllKeys() { S.selected = S.view === 'curve' ? track(S.scene, S.active).map(k => k.id) : Object.values(S.scene.tracks).flat().map(k => k.id); render(); notify(`Selected ${S.selected.length} keys`); }
function deselect() { if (max.state.lock) { notify('Selection Lock is on: press Space to unlock'); return; } max.select(null); S.objectSelected = false; S.selected = []; render(); }
function tool(t) { S.tool = t; max.setModes({ tool: t, silent: true }); render(); }

function outOfRangeDialog() {
  if (S.active !== 'rotation' && S.lesson !== 'free') notify('Tip: in this lab Out-of-Range Types act on Y Rotation');
  const d = max.dialog('Param Curve Out-of-Range Types', `<p class="mx-note">Before the first key and after the last one, the curve can hold, repeat or continue. In this lab it works on <b>Y Rotation</b>.</p><div class="oor-grid">${OUT_TYPES.map(([id, label, path]) => `<button type="button" data-oor="${id}" class="${S.scene.out === id ? 'on' : ''}"${['linear', 'relative'].includes(id) ? ' disabled title="Not used in this lab"' : ''}><svg viewBox="0 0 90 40"><rect x="30" y="0" width="30" height="40" fill="#ffffff10"/><path d="${path}" fill="none" stroke="#e8e8e8" stroke-width="1.8"/></svg><small>${label}</small></button>`).join('')}</div><p class="mx-note" id="oor-explain">${OUT_TEXT[S.scene.out] || ''}</p>`,
    null, { ok: 'OK', cancel: '', width: 420 });
  d.querySelector('.oor-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-oor]'); if (!b || b.disabled) return;
    pushUndo(); S.scene.out = b.dataset.oor;
    d.querySelectorAll('[data-oor]').forEach(x => x.classList.toggle('on', x === b));
    d.querySelector('#oor-explain').textContent = OUT_TEXT[S.scene.out];
    notify(`Out-of-Range Type: ${b.textContent}`); render();
  });
}

// ─── Command Panel ───────────────────────────────────────────────────────────
function modifyPage() {
  return `<div class="mx-combo">Modifier List<i></i></div>
    <div class="mx-rollout"><div class="mx-rollout-b"><div class="mx-node on" style="--d:0">Sphere</div></div></div>
    ${rollout('Parameters', `<div class="mx-prop"><span>Radius:</span>${spinner({ id: 'p-radius', value: 0.5, width: 96 })}<span class="mx-unit">m</span></div><div class="mx-prop"><span>Segments:</span>${spinner({ id: 'p-seg', value: 32, step: 1, decimals: 0, width: 96 })}<span></span></div><p class="mx-note">To animate the ball, use the Motion panel, the Transform Type-In below the viewport or the Track View.</p>`)}`;
}
function renderMotion(page) {
  if (!page) return;
  if (!S.objectSelected) { page.insertAdjacentHTML('beforeend', '<p class="mx-empty">Select Ball_01 to see its controllers.</p>'); return; }
  const k = selectedKeys()[0], t = k && meta(trackForKey(S.scene, k.id)), keys = t ? track(S.scene, t.id) : [], i = k ? keys.indexOf(k) : -1;
  const tan = k ? tangentName(k) : '';
  page.insertAdjacentHTML('beforeend', `
    <div class="mx-cats"><button type="button" class="mx-btn on" style="flex:1">Parameters</button><button type="button" class="mx-btn" style="flex:1" disabled>Trajectories</button></div>
    ${rollout('PRS Parameters', `<div class="mx-grid2" style="grid-template-columns:1fr 1fr"><span style="text-align:center">Create Key</span><span style="text-align:center">Delete Key</span>${['Position', 'Rotation', 'Scale'].map(g => `<button type="button" class="mx-btn" data-prs-create="${g}">${g}</button><button type="button" class="mx-btn" data-prs-delete="${g}">${g}</button>`).join('')}</div><p class="mx-note">Adds or removes a key at the current frame (${S.frame}), even without Auto Key.</p>`)}
    ${rollout('Key Info (Basic)', k ? `<div class="key-info"><div class="kinav"><button type="button" class="mx-btn" data-ki="-1" title="Previous key">&lt;</button><b>${esc(t.name)} · ${i + 1}</b><button type="button" class="mx-btn" data-ki="1" title="Next key">&gt;</button></div>
      <div class="mx-prop"><span>Time:</span>${spinner({ id: 'ki-time', value: k.frame, step: 1, decimals: 0, width: 110 })}<span></span></div>
      <div class="mx-prop"><span>Value:</span>${spinner({ id: 'ki-value', value: round(k.value, 3), step: t.id === 'rotation' ? 5 : .1, decimals: 3, width: 110 })}<span class="mx-unit">${esc(t.unit)}</span></div>
      <div class="mx-prop"><span>In / Out:</span><b style="font-weight:400">${tan}</b><span></span></div>
      <div class="tan-pick">${Object.entries(TAN_ICON).map(([type, ic]) => `<button type="button" class="mx-tb sm${tangentName(k).toLowerCase() === type ? ' on' : ''}" data-ki-tan="${type}" title="${type[0].toUpperCase() + type.slice(1)}">${icon(ic)}</button>`).join('')}</div></div>`
      : '<p class="mx-note">Select a key in the Track Bar or the Track View to see its time, value and tangents.</p>')}
    ${rollout('Assign Controller', `<div class="mx-sfs" style="max-height:none"><div class="mx-sfs-row">Transform : Position/Rotation/Scale</div><div class="mx-sfs-row" style="padding-left:18px">Position : Position XYZ</div><div class="mx-sfs-row" style="padding-left:18px">Rotation : Euler XYZ</div><div class="mx-sfs-row" style="padding-left:18px">Scale : Bezier Scale</div></div>`, false)}`);
}
max.page().addEventListener('click', e => {
  const c = e.target.closest('[data-prs-create]'), d = e.target.closest('[data-prs-delete]'), ki = e.target.closest('[data-ki]'), kt = e.target.closest('[data-ki-tan]');
  if (c) { pushUndo(); const tracks = TRACKS.filter(t => t.group === c.dataset.prsCreate); S.selected = tracks.map(t => addKey(S.scene, t.id, S.frame, current(t.id)).id); cleanPending(); notify(`Create Key: ${c.dataset.prsCreate} at frame ${S.frame}`); render(); }
  if (d) { const ids = TRACKS.filter(t => t.group === d.dataset.prsDelete).flatMap(t => track(S.scene, t.id).filter(k => k.frame === S.frame).map(k => k.id)); if (!ids.length) { notify(`Delete Key: no ${d.dataset.prsDelete} key at frame ${S.frame}`); return; } pushUndo(); deleteKeys(S.scene, ids); S.selected = []; notify(`Delete Key: ${d.dataset.prsDelete} at frame ${S.frame}`); render(); }
  if (ki) { const k = selectedKeys()[0]; if (!k) return; const keys = track(S.scene, trackForKey(S.scene, k.id)), n = keys[keys.indexOf(k) + +ki.dataset.ki]; if (n) { S.selected = [n.id]; setFrame(n.frame); } }
  if (kt) applyTangent(kt.dataset.kiTan);
});
max.page().addEventListener('change', e => {
  const k = selectedKeys()[0]; if (!k) return;
  if (e.target.id === 'ki-time') { pushUndo(); if (!moveGraphKey(S.scene, k.id, +e.target.value, k.value)) { S.undo.pop(); notify('Another key is already on that frame'); } render(); }
  if (e.target.id === 'ki-value') { pushUndo(); moveGraphKey(S.scene, k.id, k.frame, +e.target.value); render(); }
});

// ─── Time ────────────────────────────────────────────────────────────────────
function setFrame(f) { S.frame = clamp(Math.round(f), S.scene.start, S.scene.end); S.playFloat = S.frame; cleanPending(); render(); }
function step(dir) {
  if (!S.keyMode) { setFrame(S.frame + dir); return; }
  const frames = [...new Set(Object.values(S.scene.tracks).flat().map(k => k.frame))].sort((a, b) => a - b);
  const to = dir < 0 ? frames.filter(n => n < S.frame).at(-1) : frames.find(n => n > S.frame);
  if (to != null) setFrame(to);
}
function stop() { S.playing = false; S.lastStamp = 0; max.setModes?.({ playing: false, silent: true }); }
function tick(stamp) {
  if (!S.playing) return;
  if (!S.lastStamp) S.lastStamp = stamp;
  const dt = Math.min(.1, (stamp - S.lastStamp) / 1000); S.lastStamp = stamp;
  S.playFloat += dt * S.scene.fps * S.scene.speed;
  if (S.playFloat > S.scene.end) S.playFloat = S.scene.start + (S.playFloat - S.scene.start) % (S.scene.end - S.scene.start + 1);
  const f = Math.round(S.playFloat);
  if (f !== S.frame) { S.frame = f; cleanPending(); render(); }
  requestAnimationFrame(tick);
}
function togglePlay() { if (S.playing) { stop(); return; } cleanPending(); S.playing = true; S.playFloat = S.frame; S.lastStamp = 0; max.setModes({ playing: true, silent: true }); requestAnimationFrame(tick); }

// ─── Track View: Controller Window ───────────────────────────────────────────
function drawTree() {
  const all = TRACKS.map(t => t.id).join(',');
  const row = (d, label, ids = '') => `<div class="mx-tvnode group" style="--d:${d}" data-ids="${ids}"><span class="tw">▾</span>${label}</div>`;
  tv.tree.innerHTML = row(0, 'World') + row(1, '<span class="mx-ob-ico" style="--c:#e1117f"></span> Ball_01', all) + row(2, 'Transform', all) +
    ['Position', 'Rotation', 'Scale'].map(g => row(3, g, TRACKS.filter(t => t.group === g).map(t => t.id).join(',')) + TRACKS.filter(t => t.group === g).map(t => `<button type="button" class="mx-tvnode${S.active === t.id ? ' on' : ''}" style="--d:4" data-track-id="${t.id}" data-ids="${t.id}" aria-pressed="${S.active === t.id}"><span class="sw" style="background:${t.color}"></span>${esc(t.name)}</button>`).join('')).join('');
}
tv.tree.addEventListener('click', e => { const b = e.target.closest('[data-track-id]'); if (!b) return; S.active = b.dataset.trackId; S.selected = S.selected.filter(id => trackForKey(S.scene, id) === S.active); render(); });

// ─── Track View: Key Window (Curve Editor) ───────────────────────────────────
tv.host.innerHTML = '<svg id="curve-svg" class="tv-svg" role="group" aria-label="Key Window: animation curve"></svg><svg id="dope-svg" class="tv-svg" role="group" aria-label="Dope Sheet: keys by track" hidden></svg><span class="tv-readout" id="drag-readout"></span>';
const RULER_H = 24;
function box(el) { const r = el.getBoundingClientRect(); const w = Math.max(280, r.width), h = Math.max(200, r.height); el.setAttribute('viewBox', `0 0 ${w} ${h}`); return { w, h }; }
const point = (svg, e) => { const r = svg.getBoundingClientRect(), b = svg.viewBox.baseVal; return { x: (e.clientX - r.left) * b.width / r.width, y: (e.clientY - r.top) * b.height / r.height }; };
function niceStep(span, px) { const raw = span / Math.max(1, px / 60), p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) || 10 * p; }
function curveSpace() {
  const el = $('#curve-svg'), { w, h } = box(el), keys = track(S.scene, S.active), values = keys.map(k => k.value);
  for (let i = 0; i <= 60; i++) values.push(valueAt(S.scene, S.active, S.graphStart + (S.graphEnd - S.graphStart) * i / 60));
  if (S.vRange?.track === S.active) values.push(S.vRange.lo, S.vRange.hi);
  const minVal = Math.min(...values, 0), maxVal = Math.max(...values, S.active === 'scale' ? 2 : 1), pad = Math.max(.5, (maxVal - minVal) * .14);
  const ymin = S.vRange?.track === S.active ? S.vRange.lo : minVal - pad, ymax = S.vRange?.track === S.active ? S.vRange.hi : maxVal + pad;
  const x0 = 40, x1 = w - 8, y0 = 10, y1 = h - RULER_H, a = S.graphStart, b = S.graphEnd;
  return { el, w, h, x0, x1, y0, y1, a, b, ymin, ymax, X: f => x0 + (f - a) / (b - a) * (x1 - x0), Y: v => y1 - (v - ymin) / (ymax - ymin) * (y1 - y0), frame: x => a + (x - x0) / (x1 - x0) * (b - a), value: y => ymin + (y1 - y) / (y1 - y0) * (ymax - ymin) };
}
// Max's Key Window: dark grey, lighter outside the animation range, ruler at the bottom, values on the left.
function timeRuler(p, y) {
  const st = niceStep(p.b - p.a, p.x1 - p.x0); let h = `<rect x="0" y="${y}" width="${p.w}" height="${p.h - y}" fill="#444"/><line x1="0" x2="${p.w}" y1="${y + .5}" y2="${y + .5}" stroke="#2a2a2a"/>`;
  for (let f = Math.ceil(p.a / st) * st; f <= p.b; f += st) { const x = p.X(f); h += `<line x1="${x}" x2="${x}" y1="${y}" y2="${y + 5}" stroke="#aaa"/><text x="${x + 2}" y="${y + 17}" fill="#d0d0d0" font-size="11">${f}</text>`; }
  return h;
}
function drawCurve() {
  const p = curveSpace(), t = meta(S.active), keys = track(S.scene, S.active);
  let h = `<rect width="${p.w}" height="${p.h}" fill="#303030"/><rect x="${p.X(S.scene.start)}" y="0" width="${p.X(S.scene.end) - p.X(S.scene.start)}" height="${p.y1}" fill="#383838"/>`;
  const st = niceStep(p.b - p.a, p.x1 - p.x0);
  for (let f = Math.ceil(p.a / st) * st; f <= p.b; f += st) h += `<line x1="${p.X(f)}" x2="${p.X(f)}" y1="0" y2="${p.y1}" stroke="#444"/>`;
  const vs = niceStep(p.ymax - p.ymin, (p.y1 - p.y0) * 1.4);
  for (let v = Math.ceil(p.ymin / vs) * vs; v <= p.ymax; v += vs) { const y = p.Y(v); h += `<line x1="${p.x0}" x2="${p.x1}" y1="${y}" y2="${y}" stroke="${Math.abs(v) < 1e-9 ? '#1f1f1f' : '#444'}"/><text x="4" y="${y + 4}" fill="#d0d0d0" font-size="11">${round(v, 2)}</text>`; }
  // current time: Max draws a yellow double line
  const cx = p.X(S.frame);
  h += `<line x1="${cx - 1.5}" x2="${cx - 1.5}" y1="0" y2="${p.y1}" stroke="#d9c13a"/><line x1="${cx + 1.5}" x2="${cx + 1.5}" y1="0" y2="${p.y1}" stroke="#d9c13a"/>`;
  if (keys.length) {
    const first = keys[0].frame, last = keys.at(-1).frame, samples = Math.max(120, Math.min(600, Math.round(p.w)));
    let inside = '', outside = '';
    for (let i = 0; i <= samples; i++) {
      const f = p.a + (p.b - p.a) * i / samples, v = valueAt(S.scene, S.active, f), seg = `${round(p.X(f), 2)} ${round(p.Y(v), 2)}`;
      if (f >= first && f <= last) inside += `${inside ? 'L' : 'M'}${seg}`; else outside += `${outside && !(f > last && outside.endsWith('#')) ? 'L' : 'M'}${seg}`;
      if (f < first && p.a + (p.b - p.a) * (i + 1) / samples >= first) outside += '#';
    }
    outside = outside.replace(/#/g, '');
    h += `<path d="${outside}" fill="none" stroke="${t.color}" stroke-width="1.5" stroke-dasharray="4 4" opacity=".8"/><path d="${inside}" fill="none" stroke="${t.color}" stroke-width="2"/>`;
    for (const k of keys) {
      if (k.frame < p.a - 1 || k.frame > p.b + 1) continue;
      const sel = S.selected.includes(k.id), x = p.X(k.frame), y = p.Y(k.value);
      if (sel && S.showTangents && k.interp !== 'CONSTANT') for (const side of ['left', 'right']) {
        if (side === 'left' && keys.indexOf(k) === 0) continue;
        if (side === 'right' && (keys.indexOf(k) === keys.length - 1 || k.interp === 'LINEAR')) continue;
        const q = k[side];
        h += `<line x1="${x}" y1="${y}" x2="${p.X(q.frame)}" y2="${p.Y(q.value)}" stroke="#101010" stroke-width="1.2"/><rect x="${p.X(q.frame) - 3.5}" y="${p.Y(q.value) - 3.5}" width="7" height="7" fill="#1a1a1a" stroke="#cfcfcf" data-handle="${side}" data-key="${k.id}" style="cursor:move"/>`;
      }
      h += `<g data-key="${k.id}" tabindex="0" role="button" aria-label="${esc(t.name)}; frame ${k.frame}; value ${round(k.value)}"><rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="${sel ? '#ffffff' : '#1c1c1c'}" stroke="${sel ? '#000' : '#9a9a9a'}"/><rect x="${x - 10}" y="${y - 10}" width="20" height="20" fill="transparent"/></g>`;
    }
  }
  if (S.drag?.kind === 'box') { const b = S.drag; h += `<rect x="${Math.min(b.x0, b.x1)}" y="${Math.min(b.y0, b.y1)}" width="${Math.abs(b.x1 - b.x0)}" height="${Math.abs(b.y1 - b.y0)}" fill="#ffffff10" stroke="#fff" stroke-dasharray="3 2"/>`; }
  h += timeRuler(p, p.y1);
  p.el.innerHTML = h;
}
function fitGraph(horizontal = true, vertical = true) {
  const keys = S.selected.length ? selectedKeys().filter(k => trackForKey(S.scene, k.id) === S.active) : track(S.scene, S.active);
  const list = keys.length ? keys : track(S.scene, S.active);
  if (!list.length) { notify('This track has no keys'); return; }
  if (horizontal) { const lo = Math.min(...list.map(k => k.frame)), hi = Math.max(...list.map(k => k.frame)), pad = Math.max(3, Math.ceil((hi - lo) * .08)); S.graphStart = lo - pad; S.graphEnd = hi + pad; }
  if (vertical) { const lo = Math.min(...list.map(k => k.value)), hi = Math.max(...list.map(k => k.value)), pad = Math.max(.25, (hi - lo) * .12); S.vRange = { track: S.active, lo: lo - pad, hi: hi + pad }; }
  notify(horizontal && !vertical ? 'Frame Horizontal Extents' : !horizontal ? 'Frame Value Extents' : 'Frame extents'); render();
}

const graph = $('#curve-svg');
graph.addEventListener('pointerdown', e => {
  const p = curveSpace(), pt = point(graph, e), hit = e.target.closest('[data-key]');
  if (e.button === 1) { S.drag = { kind: 'pan', x: pt.x, y: pt.y, a: S.graphStart, b: S.graphEnd, lo: p.ymin, hi: p.ymax }; graph.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  if (e.button !== 0) return;
  if (pt.y > p.y1) { S.drag = { kind: 'scrub' }; setFrame(p.frame(pt.x)); graph.setPointerCapture(e.pointerId); return; }
  if (S.tvTool === 'addKeys' && !hit) {
    const f = Math.round(p.frame(pt.x));
    pushUndo(); const k = addKey(S.scene, S.active, f, valueAt(S.scene, S.active, f)); S.selected = [k.id];
    notify(`Add Keys: ${meta(S.active).name} key at frame ${f}`); render(); return;
  }
  if (hit?.dataset.handle) {
    pushUndo(); S.drag = { kind: 'handle', id: hit.dataset.key, side: hit.dataset.handle }; graph.setPointerCapture(e.pointerId); return;
  }
  if (hit) {
    const id = hit.dataset.key;
    if (e.ctrlKey) { S.selected = S.selected.includes(id) ? S.selected.filter(k => k !== id) : [...S.selected, id]; render(); return; }
    if (e.altKey) { S.selected = S.selected.filter(k => k !== id); render(); return; }
    if (!S.selected.includes(id)) S.selected = [id];
    const k = findKey(S.scene, id);
    pushUndo();
    S.drag = { kind: 'key', id, x: pt.x, y: pt.y, frame: k.frame, value: k.value, moved: false, axis: null, others: selectedKeys().filter(o => o.id !== id && trackForKey(S.scene, o.id) === S.active).map(o => ({ id: o.id, frame: o.frame, value: o.value })) };
    graph.setPointerCapture(e.pointerId); render(); return;
  }
  if (!e.ctrlKey) S.selected = [];
  S.drag = { kind: 'box', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, add: e.ctrlKey }; graph.setPointerCapture(e.pointerId); render();
});
graph.addEventListener('pointermove', e => {
  const d = S.drag; if (!d) return;
  const pt = point(graph, e), p = curveSpace();
  if (d.kind === 'pan') { const df = (pt.x - d.x) / (p.x1 - p.x0) * (d.b - d.a), dv = (pt.y - d.y) / (p.y1 - p.y0) * (d.hi - d.lo); S.graphStart = d.a - df; S.graphEnd = d.b - df; S.vRange = { track: S.active, lo: d.lo + dv, hi: d.hi + dv }; drawCurve(); return; }
  if (d.kind === 'scrub') { setFrame(p.frame(pt.x)); return; }
  if (d.kind === 'box') { d.x1 = pt.x; d.y1 = pt.y; drawCurve(); return; }
  if (d.kind === 'handle') { dragTangent(S.scene, d.id, d.side, p.frame(pt.x), p.value(pt.y)); readout('Tangent'); render(); return; }
  if (d.kind === 'key') {
    if (!d.moved && Math.hypot(pt.x - d.x, pt.y - d.y) < 3) return;
    // Shift constrains the drag to one direction, as in Max's Move Keys.
    if (!d.moved) { d.moved = true; if (e.shiftKey) d.axis = Math.abs(pt.x - d.x) > Math.abs(pt.y - d.y) ? 'h' : 'v'; }
    const df = d.axis === 'v' ? 0 : Math.round(p.frame(pt.x) - p.frame(d.x)), dv = d.axis === 'h' ? 0 : p.value(pt.y) - p.value(d.y);
    moveGraphKey(S.scene, d.id, d.frame + df, round(d.value + dv, 3));
    for (const o of d.others) moveGraphKey(S.scene, o.id, o.frame + df, round(o.value + dv, 3));
    const k = findKey(S.scene, d.id); readout(`${k.frame}, ${round(k.value, 3)}`); render();
  }
});
const endGraph = e => {
  const d = S.drag; if (!d) return; S.drag = null; readout('');
  if (graph.hasPointerCapture?.(e.pointerId)) graph.releasePointerCapture(e.pointerId);
  if (d.kind === 'box') {
    const p = curveSpace(), fa = p.frame(Math.min(d.x0, d.x1)), fb = p.frame(Math.max(d.x0, d.x1)), va = p.value(Math.max(d.y0, d.y1)), vb = p.value(Math.min(d.y0, d.y1));
    const inBox = track(S.scene, S.active).filter(k => k.frame >= fa && k.frame <= fb && k.value >= va && k.value <= vb).map(k => k.id);
    S.selected = [...new Set([...(d.add ? S.selected : []), ...inBox])];
  }
  if (d.kind === 'key' && !d.moved) S.undo.pop();
  if (d.kind === 'key' && d.moved) notify('Move Keys: keys moved (Shift+drag constrains to one direction)');
  render();
};
graph.addEventListener('pointerup', endGraph); graph.addEventListener('pointercancel', endGraph);
graph.addEventListener('wheel', e => {
  e.preventDefault(); const p = curveSpace(), pt = point(graph, e), center = p.frame(pt.x), span = p.b - p.a, factor = e.deltaY < 0 ? .82 : 1.22;
  const n = clamp(span * factor, 6, 400), ratio = (center - p.a) / span; S.graphStart = center - ratio * n; S.graphEnd = S.graphStart + n; drawCurve();
}, { passive: false });
graph.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
function readout(text) { $('#drag-readout').textContent = text; }

// ─── Track View: Dope Sheet ──────────────────────────────────────────────────
function drawDope() {
  const el = $('#dope-svg'), { w, h } = box(el), x0 = 10, x1 = w - 10, a = S.graphStart, b = S.graphEnd, y1 = h - RULER_H;
  const p = { w, h, a, b, x0, x1, X: f => x0 + (f - a) / (b - a) * (x1 - x0) };
  let s = `<rect width="${w}" height="${h}" fill="#303030"/><rect x="${p.X(S.scene.start)}" y="0" width="${p.X(S.scene.end) - p.X(S.scene.start)}" height="${y1}" fill="#383838"/>`;
  const st = niceStep(b - a, x1 - x0);
  for (let f = Math.ceil(a / st) * st; f <= b; f += st) s += `<line x1="${p.X(f)}" x2="${p.X(f)}" y1="0" y2="${y1}" stroke="#444"/>`;
  // One row per line of the Controller Window, at the same height: summary rows for the object and groups.
  const treeTop = tv.tree.parentElement.getBoundingClientRect().top, hostTop = tv.host.getBoundingClientRect().top;
  const rows = [...tv.tree.children].map(el => { const r = el.getBoundingClientRect(); return { top: r.top - hostTop, h: r.height, ids: (el.dataset.ids || '').split(',').filter(Boolean), track: el.dataset.trackId }; }).filter(r => r.ids.length);
  void treeTop;
  rows.forEach((r, i) => {
    const y = r.top, hh = r.h, t = r.track && meta(r.track);
    s += `<rect x="0" y="${y}" width="${w}" height="${hh - 1}" fill="${!t ? '#3f4652' : i % 2 ? '#3a3a3a' : '#3d3d3d'}" opacity=".75"/>`;
    if (!t) { for (const f of new Set(r.ids.flatMap(id => track(S.scene, id).map(k => k.frame)))) { const sel = r.ids.some(id => track(S.scene, id).some(k => k.frame === f && S.selected.includes(k.id))); s += `<rect x="${p.X(f) - 3.5}" y="${y + 3}" width="7" height="${hh - 7}" fill="${sel ? '#fff' : '#9aa6b8'}" stroke="#111"/>`; } return; }
    for (const k of track(S.scene, t.id)) {
      const sel = S.selected.includes(k.id);
      s += `<g data-key="${k.id}" tabindex="0" role="button" aria-label="${esc(t.name)}; frame ${k.frame}"><rect x="${p.X(k.frame) - 4}" y="${y + 2}" width="8" height="${hh - 5}" fill="${sel ? '#ffffff' : '#9a9a9a'}" stroke="#111"/><rect x="${p.X(k.frame) - 9}" y="${y}" width="18" height="${hh}" fill="transparent"/></g>`;
    }
  });
  const cx = p.X(S.frame);
  s += `<line x1="${cx - 1.5}" x2="${cx - 1.5}" y1="0" y2="${y1}" stroke="#d9c13a"/><line x1="${cx + 1.5}" x2="${cx + 1.5}" y1="0" y2="${y1}" stroke="#d9c13a"/>`;
  if (S.drag?.kind === 'dbox') { const d = S.drag; s += `<rect x="${Math.min(d.x0, d.x1)}" y="${Math.min(d.y0, d.y1)}" width="${Math.abs(d.x1 - d.x0)}" height="${Math.abs(d.y1 - d.y0)}" fill="#ffffff10" stroke="#fff" stroke-dasharray="3 2"/>`; }
  if (S.drag?.kind === 'dkeys' && S.drag.df) s += `<text x="12" y="${y1 - 8}" fill="#fff" font-size="12">${S.drag.copy ? 'Copy' : 'Move'} keys ${S.drag.df > 0 ? '+' : ''}${S.drag.df}</text>`;
  s += timeRuler({ ...p, w, h }, y1);
  el.innerHTML = s; el._p = p; el._rows = rows;
  // the row labels live in the Controller Window, as in Max: keep it in sync
}
const dope = $('#dope-svg');
dope.addEventListener('pointerdown', e => {
  const pt = point(dope, e), p = dope._p, hit = e.target.closest('[data-key]');
  if (e.button === 1) { S.drag = { kind: 'dpan', x: pt.x, a: S.graphStart, b: S.graphEnd }; dope.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  if (e.button !== 0) return;
  if (pt.y > dope.viewBox.baseVal.height - RULER_H) { S.drag = { kind: 'dscrub' }; setFrame(p.a + (pt.x - p.x0) / (p.x1 - p.x0) * (p.b - p.a)); dope.setPointerCapture(e.pointerId); return; }
  if (hit) {
    const id = hit.dataset.key;
    if (e.ctrlKey) { S.selected = S.selected.includes(id) ? S.selected.filter(k => k !== id) : [...S.selected, id]; render(); return; }
    if (!S.selected.includes(id)) S.selected = [id];
    S.active = trackForKey(S.scene, id);
    S.drag = { kind: 'dkeys', x: pt.x, df: 0, copy: e.shiftKey }; dope.setPointerCapture(e.pointerId); render(); return;
  }
  if (!e.ctrlKey) S.selected = [];
  S.drag = { kind: 'dbox', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }; dope.setPointerCapture(e.pointerId); render();
});
dope.addEventListener('pointermove', e => {
  const d = S.drag; if (!d) return; const pt = point(dope, e), p = dope._p;
  if (d.kind === 'dpan') { const df = (pt.x - d.x) / (p.x1 - p.x0) * (d.b - d.a); S.graphStart = d.a - df; S.graphEnd = d.b - df; drawDope(); return; }
  if (d.kind === 'dscrub') { setFrame(p.a + (pt.x - p.x0) / (p.x1 - p.x0) * (p.b - p.a)); return; }
  if (d.kind === 'dbox') { d.x1 = pt.x; d.y1 = pt.y; drawDope(); return; }
  if (d.kind === 'dkeys') { d.df = Math.round((pt.x - d.x) / (p.x1 - p.x0) * (p.b - p.a)); drawDope(); }
});
const endDope = e => {
  const d = S.drag; if (!d) return; S.drag = null;
  if (d.kind === 'dbox') {
    const p = dope._p, fa = p.a + (Math.min(d.x0, d.x1) - p.x0) / (p.x1 - p.x0) * (p.b - p.a), fb = p.a + (Math.max(d.x0, d.x1) - p.x0) / (p.x1 - p.x0) * (p.b - p.a);
    const ya = Math.min(d.y0, d.y1), yb = Math.max(d.y0, d.y1);
    const ids = dope._rows.filter(r => r.top + r.h > ya && r.top < yb).flatMap(r => r.ids).filter((v, i, a) => a.indexOf(v) === i);
    S.selected = ids.flatMap(id => track(S.scene, id).filter(k => k.frame >= fa && k.frame <= fb).map(k => k.id));
  }
  if (d.kind === 'dkeys' && d.df) {
    pushUndo();
    const before = new Map(S.selected.map(id => [id, findKey(S.scene, id).frame]));
    const ok = moveKeys(S.scene, S.selected, d.df, d.copy);
    if (!ok) { S.undo.pop(); notify('Keys cannot move there: another key is on that frame'); }
    else {
      if (d.copy) S.selected = [...before].map(([id, f]) => track(S.scene, trackForKey(S.scene, id)).find(k => k.frame === f + d.df)?.id).filter(Boolean);
      notify(`${d.copy ? 'Copied' : 'Moved'} ${before.size} key${before.size === 1 ? '' : 's'} ${d.df > 0 ? '+' : ''}${d.df} frames${d.copy ? '' : ' (Shift+drag copies them)'}`);
    }
  }
  render();
};
dope.addEventListener('pointerup', endDope); dope.addEventListener('pointercancel', endDope);
dope.addEventListener('wheel', e => { e.preventDefault(); const p = dope._p, pt = point(dope, e), c = p.a + (pt.x - p.x0) / (p.x1 - p.x0) * (p.b - p.a), span = p.b - p.a, n = clamp(span * (e.deltaY < 0 ? .82 : 1.22), 6, 400), r = (c - p.a) / span; S.graphStart = c - r * n; S.graphEnd = S.graphStart + n; drawDope(); }, { passive: false });
for (const svg of [graph, dope]) svg.addEventListener('keydown', e => { const hit = e.target.closest('[data-key]'); if (!hit || !['Enter', ' '].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); S.selected = [hit.dataset.key]; render(); });

// ─── Viewport ────────────────────────────────────────────────────────────────
max.host.innerHTML = '<canvas id="view" aria-label="Perspective viewport: Ball_01. Drag it with Select and Move, Rotate or Scale."></canvas>';
function drawViewport() {
  const canvas = $('#view'), r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, r.width), h = Math.max(1, r.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#383838'; c.fillRect(0, 0, w, h);
  const horizon = h * .42, base = h * .8, cx = w * .46;
  if (S.grid) {
    c.lineWidth = 1; c.strokeStyle = '#4c4c4c';
    for (let i = 0; i <= 16; i++) { const y = horizon + (h - horizon) * (i / 16) ** 1.7; c.beginPath(); c.moveTo(0, Math.round(y) + .5); c.lineTo(w, Math.round(y) + .5); c.stroke(); }
    for (let i = -22; i <= 22; i++) { c.beginPath(); c.moveTo(cx + i * 10, horizon); c.lineTo(cx + i * 62, h); c.stroke(); }
    c.strokeStyle = '#a13c38'; c.beginPath(); c.moveTo(0, base); c.lineTo(w, base); c.stroke();
    c.strokeStyle = '#3d8a47'; c.beginPath(); c.moveTo(cx, horizon); c.lineTo(cx, h); c.stroke();
  }
  const x = current('x'), z = current('z'), rot = current('rotation') * Math.PI / 180, scale = clamp(current('scale'), .1, 4), radius = clamp(36 * scale, 7, 100), bx = clamp(w * .2 + x * w * .058, 28, w - 28), by = base - z * 31 - radius;
  S.ball = { x: bx, y: by, r: radius, w, h };
  c.fillStyle = '#0006'; c.beginPath(); c.ellipse(bx, base + 3, Math.max(16, radius * .95), Math.max(4, radius * .2), 0, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(-radius * .4, -radius * .45, radius * .1, 0, 0, radius);
  g.addColorStop(0, '#ff9ccb'); g.addColorStop(.35, '#e1117f'); g.addColorStop(1, '#4d0a2c');
  c.save(); c.translate(bx, by); c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.clip(); c.fillStyle = g; c.fillRect(-radius, -radius, radius * 2, radius * 2);
  c.rotate(rot); c.strokeStyle = '#ffffffcc'; c.lineWidth = Math.max(2, radius * .1); c.beginPath(); c.moveTo(-radius, 0); c.lineTo(radius, 0); c.stroke(); c.beginPath(); c.moveTo(0, -radius); c.lineTo(0, radius); c.stroke(); c.restore();
  if (!S.objectSelected) return;
  // selection: white corner brackets, as in a shaded Max viewport
  const b = radius + 6, L = Math.max(6, radius * .35);
  c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(bx + sx * b, by + sy * b - sy * L); c.lineTo(bx + sx * b, by + sy * b); c.lineTo(bx + sx * b - sx * L, by + sy * b); }
  c.stroke();
  if (S.tool === 'move') {
    const arrow = (dx, dy, col, label) => { const ex = bx + dx * (radius + 40), ey = by + dy * (radius + 40); c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke(); c.fillStyle = col; c.beginPath(); c.moveTo(ex + dx * 10, ey + dy * 10); c.lineTo(ex - dy * 5, ey + dx * 5); c.lineTo(ex + dy * 5, ey - dx * 5); c.fill(); c.font = '12px Segoe UI, Arial'; c.fillText(label, ex + dx * 14 + 4, ey + dy * 14 + 4); };
    arrow(1, 0, '#e5534b', 'X'); arrow(0, -1, '#5aa2e6', 'Z');
    c.strokeStyle = '#e8d44d'; c.lineWidth = 1.5; c.strokeRect(bx + 1, by - 16, 15, 15);
  }
  if (S.tool === 'rotate') { c.strokeStyle = '#62c45a'; c.lineWidth = 2.5; c.beginPath(); c.arc(bx, by, radius + 16, 0, Math.PI * 2); c.stroke(); c.strokeStyle = '#8a8a8a'; c.lineWidth = 1; c.beginPath(); c.arc(bx, by, radius + 24, 0, Math.PI * 2); c.stroke(); }
  if (S.tool === 'scale') { c.fillStyle = '#e8d44d55'; c.strokeStyle = '#e8d44d'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + radius + 30, by); c.lineTo(bx, by - radius - 30); c.closePath(); c.fill(); c.stroke(); }
}
const view = $('#view');
view.addEventListener('pointerdown', e => {
  if (!S.ball || e.button !== 0) return;
  const r = view.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, b = S.ball;
  const onBall = Math.hypot(x - b.x, y - b.y) <= b.r + 22;
  if (!onBall) { deselect(); return; }
  if (!S.objectSelected) { if (max.state.lock) { notify('Selection Lock is on: press Space to unlock'); return; } max.select('Ball_01'); S.objectSelected = true; render(); }
  if (S.tool === 'select') return;
  S.drag = { kind: 'viewport', startX: x, startY: y, values: Object.fromEntries(TRACKS.map(t => [t.id, current(t.id)])) };
  view.setPointerCapture(e.pointerId); max.host.classList.add('dragging'); e.preventDefault();
});
view.addEventListener('pointermove', e => {
  const d = S.drag; if (!d || d.kind !== 'viewport') return;
  const r = view.getBoundingClientRect(), dx = e.clientX - r.left - d.startX, dy = e.clientY - r.top - d.startY;
  if (S.tool === 'move') { S.pending.x = round(d.values.x + dx / (r.width * .058), 2); S.pending.z = round(Math.max(0, d.values.z - dy / 31), 2); }
  if (S.tool === 'rotate') S.pending.rotation = round(d.values.rotation + dx * 2, 1);
  if (S.tool === 'scale') S.pending.scale = round(clamp(d.values.scale * (1 - dy / 120), .1, 4), 2);
  render();
});
view.addEventListener('pointerup', e => {
  const d = S.drag; if (!d || d.kind !== 'viewport') return;
  S.drag = null; view.releasePointerCapture(e.pointerId); max.host.classList.remove('dragging');
  const changed = Object.keys(S.pending).filter(id => Math.abs(S.pending[id] - d.values[id]) > .001);
  if (!changed.length) return;
  if (!record(changed)) notify(S.setMode ? 'Pose ready: press Set Keys (K) to key it at this frame' : 'Moved without a key: turn on Auto Key (N) or Set Key Mode (\') to animate it');
  render();
});

// ─── Render ──────────────────────────────────────────────────────────────────
function render() {
  if (!S.scene) return;
  max.setTime({ frame: S.frame, start: S.scene.start, end: S.scene.end });
  // Track Bar: one entry per frame, coloured by the kinds of keys it holds
  const byFrame = new Map();
  if (S.objectSelected) for (const t of TRACKS) for (const k of track(S.scene, t.id)) { const e = byFrame.get(k.frame) || { frame: k.frame, types: new Set(), label: [] }; e.types.add(GROUP_TYPE[t.group]); e.label.push(t.name); byFrame.set(k.frame, e); }
  const selFrames = new Set(selectedKeys().map(k => k.frame));
  max.setKeys([...byFrame.values()].map(e => ({ frame: e.frame, types: ['position', 'rotation', 'scale'].filter(t => e.types.has(t)), label: e.label.join(', ') })), [...selFrames]);
  // Transform Type-In follows the current tool
  if (!S.objectSelected) max.setCoords(null, null, null);
  else if (S.tool === 'rotate') max.setCoords(null, current('rotation'), null);
  else if (S.tool === 'scale') { const sc = current('scale') * 100; max.setCoords(sc, sc, sc); }
  else max.setCoords(current('x'), null, current('z'));
  tv.setMode(S.view);
  $('#curve-svg').toggleAttribute('hidden', S.view !== 'curve'); $('#dope-svg').toggleAttribute('hidden', S.view !== 'dope');
  const k = selectedKeys()[0];
  tv.setStats(k?.frame, k ? round(k.value, 3) : null, !!k && S.selected.length === 1);
  drawTree();
  if (S.view === 'curve') drawCurve(); else drawDope();
  drawViewport(); lessonStatus();
  if (max.state.tab === 'motion') max.showTab('motion');
}

document.querySelectorAll('[data-lesson]').forEach(b => b.addEventListener('click', () => enterLesson(b.dataset.lesson)));
$('#reset-lesson').onclick = () => { scenes.delete(S.lesson); enterLesson(S.lesson); notify('Exercise reset'); };
new ResizeObserver(() => render()).observe($('.max-stage'));
enterLesson('timeline');
window.__maxTrackView = S; // test hook
tv.tree.parentElement.addEventListener('scroll', () => { if (S.view === 'dope') drawDope(); });
