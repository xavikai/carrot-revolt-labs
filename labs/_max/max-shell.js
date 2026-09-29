// 3ds Max UI kit · shell
// Builds a 3ds Max 2027-style main window (default workspace) and a Track View window,
// with the real layout, button order, tooltips and default hotkeys. Each lab plugs in its own
// viewport, Command Panel rollouts, Track Bar keys and Key Window.
//
//   const max = createMaxShell(root, { file, objects, actions, ... });
//   max.setTime({ frame, start, end }); max.setKeys([...]); max.setAutoKey(true); max.prompt('…');
//
// Everything here uses 3ds Max's own English names, as students will see them in the program.
import { icon } from './max-icons.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─── Default hotkeys (3ds Max 2027, Default keyboard shortcut set) ───────────
// key: the KeyboardEvent.key in lowercase, with ctrl/shift/alt prefixes.
export const HOTKEYS = [
  { keys: 'q', action: 'select', label: 'Select Object', group: 'Selection' },
  { keys: 'w', action: 'move', label: 'Select and Move', group: 'Selection' },
  { keys: 'e', action: 'rotate', label: 'Select and Rotate', group: 'Selection' },
  { keys: 'r', action: 'scale', label: 'Select and Scale (press again to cycle)', group: 'Selection' },
  { keys: 'h', action: 'selectByName', label: 'Select by Name', group: 'Selection' },
  { keys: 'ctrl+a', action: 'selectAll', label: 'Select All', group: 'Selection' },
  { keys: 'ctrl+d', action: 'selectNone', label: 'Select None', group: 'Selection' },
  { keys: ' ', action: 'selectionLock', label: 'Selection Lock Toggle', group: 'Selection', show: 'Space' },
  { keys: 'x', action: 'gizmo', label: 'Show Transform Gizmo Toggle', group: 'Selection' },
  { keys: 'delete', action: 'delete', label: 'Delete', group: 'Selection', show: 'Delete' },
  { keys: 'n', action: 'autoKey', label: 'Auto Key Mode Toggle', group: 'Animation' },
  { keys: "'", action: 'setKeyMode', label: 'Set Key Mode', group: 'Animation', show: "'" },
  { keys: 'k', action: 'setKey', label: 'Set Keys', group: 'Animation' },
  { keys: '/', action: 'play', label: 'Play Animation', group: 'Animation' },
  { keys: ',', action: 'prevFrame', label: 'Previous Frame', group: 'Animation' },
  { keys: '.', action: 'nextFrame', label: 'Next Frame', group: 'Animation' },
  { keys: 'home', action: 'goStart', label: 'Go to Start Frame', group: 'Animation', show: 'Home' },
  { keys: 'end', action: 'goEnd', label: 'Go to End Frame', group: 'Animation', show: 'End' },
  { keys: 'ctrl+z', action: 'undo', label: 'Undo', group: 'Edit' },
  { keys: 'ctrl+y', action: 'redo', label: 'Redo', group: 'Edit' },
  { keys: 'alt+w', action: 'maximize', label: 'Maximize Viewport Toggle', group: 'Viewport' },
  { keys: 'z', action: 'zoomExtents', label: 'Zoom Extents Selected', group: 'Viewport' },
  { keys: 'ctrl+shift+z', action: 'zoomExtentsAll', label: 'Zoom Extents All', group: 'Viewport' },
  { keys: 'g', action: 'grid', label: 'Show Grids Toggle', group: 'Viewport' },
  { keys: 'p', action: 'viewPerspective', label: 'Perspective View', group: 'Viewport' },
  { keys: 'f', action: 'viewFront', label: 'Front View', group: 'Viewport' },
  { keys: 't', action: 'viewTop', label: 'Top View', group: 'Viewport' },
  { keys: 'l', action: 'viewLeft', label: 'Left View', group: 'Viewport' },
  { keys: 'f3', action: 'wireframe', label: 'Wireframe / Shaded Toggle', group: 'Viewport', show: 'F3' },
  { keys: 'f4', action: 'edgedFaces', label: 'Edged Faces Toggle', group: 'Viewport', show: 'F4' },
  { keys: 'f5', action: 'axisX', label: 'Restrict to X', group: 'Axis Constraints', show: 'F5' },
  { keys: 'f6', action: 'axisY', label: 'Restrict to Y', group: 'Axis Constraints', show: 'F6' },
  { keys: 'f7', action: 'axisZ', label: 'Restrict to Z', group: 'Axis Constraints', show: 'F7' },
  { keys: 'f8', action: 'axisPlane', label: 'Restrict Plane Cycle', group: 'Axis Constraints', show: 'F8' },
  { keys: 'shift+h', action: 'hideHelpers', label: 'Hide Helpers Toggle', group: 'Viewport', show: 'Shift+H' },
  { keys: 's', action: 'snap', label: 'Snaps Toggle', group: 'Snaps' },
  { keys: 'a', action: 'angleSnap', label: 'Angle Snap Toggle', group: 'Snaps' },
];
const comboOf = e => {
  let k = e.key === ' ' ? ' ' : e.key.toLowerCase();
  if (k === 'del') k = 'delete';
  return `${e.ctrlKey || e.metaKey ? 'ctrl+' : ''}${e.shiftKey && k.length > 1 && k !== ' ' ? 'shift+' : e.shiftKey && /^[a-z]$/.test(k) ? 'shift+' : ''}${e.altKey ? 'alt+' : ''}${k}`;
};
export const showKeys = h => (h.show || h.keys).split('+').map(p => p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)).join('+');

// ─── Small components ────────────────────────────────────────────────────────
const btn = (id, ico, title, { cls = '', active = false, disabled = false, action = id } = {}) =>
  `<button type="button" class="mx-tb${cls ? ' ' + cls : ''}${active ? ' on' : ''}" data-action="${action}" data-id="${id}" title="${esc(title)}" aria-label="${esc(title)}"${active ? ' aria-pressed="true"' : ''}${disabled ? ' data-off="1"' : ''}>${icon(ico)}</button>`;
const sep = '<span class="mx-sep" aria-hidden="true"></span>';
const grip = '<span class="mx-grip" aria-hidden="true"></span>';
const drop = (text, width, title = '') => `<span class="mx-drop" style="width:${width}px" title="${esc(title)}">${esc(text)}<i></i></span>`;

// A 3ds Max spinner: a number field with up/down arrows. Click the arrows to step, drag them
// up or down to change the value continuously, right-click them to reset to 0 (as in Max).
export function spinner({ id, value = 0, step = 0.1, min = -1e9, max = 1e9, unit = '', decimals = 2, width = 76, label = '' }) {
  return `<span class="mx-spin" style="width:${width}px" data-step="${step}" data-min="${min}" data-max="${max}" data-dec="${decimals}"><input type="number" id="${id}" value="${value}" step="${step}" min="${min}" max="${max}"${label ? ` aria-label="${esc(label)}"` : ''}><span class="mx-spin-arrows" aria-hidden="true"><i class="up"></i><i class="dn"></i></span></span>${unit ? `<span class="mx-unit">${esc(unit)}</span>` : ''}`;
}
export function wireSpinners(root) {
  root.addEventListener('pointerdown', e => {
    const arrows = e.target.closest('.mx-spin-arrows'); if (!arrows) return;
    const box = arrows.closest('.mx-spin'), input = box.querySelector('input');
    const step = +box.dataset.step, min = +box.dataset.min, max = +box.dataset.max, dec = +box.dataset.dec;
    const set = (v, commit) => {
      input.value = (+clamp(v, min, max).toFixed(dec)).toString();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    e.preventDefault();
    if (e.button === 2) { set(Math.max(min, Math.min(max, 0)), true); return; }
    const up = e.target.classList.contains('up'), y0 = e.clientY, v0 = +input.value || 0;
    let dragged = false;
    arrows.setPointerCapture(e.pointerId);
    const move = ev => { const dy = y0 - ev.clientY; if (Math.abs(dy) > 2) dragged = true; if (dragged) set(v0 + Math.round(dy / 2) * step, false); };
    const upH = () => { arrows.removeEventListener('pointermove', move); arrows.removeEventListener('pointerup', upH); set(dragged ? +input.value : v0 + (up ? step : -step), true); };
    arrows.addEventListener('pointermove', move); arrows.addEventListener('pointerup', upH);
  });
  root.addEventListener('contextmenu', e => { if (e.target.closest('.mx-spin-arrows')) e.preventDefault(); });
}

// Collapsible rollout, as in the Command Panel.
export const rollout = (title, body, open = true) =>
  `<section class="mx-rollout${open ? '' : ' closed'}"><button type="button" class="mx-rollout-h"><i aria-hidden="true"></i>${esc(title)}<span class="mx-rollout-grip" aria-hidden="true"></span></button><div class="mx-rollout-b">${body}</div></section>`;

// ─── Command Panel default pages ─────────────────────────────────────────────
const CMD_TABS = [
  ['create', 'tabCreate', 'Create'], ['modify', 'tabModify', 'Modify'], ['hierarchy', 'tabHierarchy', 'Hierarchy'],
  ['motion', 'tabMotion', 'Motion'], ['display', 'tabDisplay', 'Display'], ['utilities', 'tabUtilities', 'Utilities'],
];
const createPage = () => `<div class="mx-cats">${[['catGeometry', 'Geometry'], ['catShapes', 'Shapes'], ['catLights', 'Lights'], ['catCameras', 'Cameras'], ['catHelpers', 'Helpers'], ['catSpaceWarps', 'Space Warps'], ['catSystems', 'Systems']].map(([ic, t], i) => `<button type="button" class="mx-cat${i ? '' : ' on'}" title="${t}" aria-label="${t}">${icon(ic)}</button>`).join('')}</div>
  <div class="mx-combo">Standard Primitives<i></i></div>
  ${rollout('Object Type', `<label class="mx-check dim"><input type="checkbox" disabled> AutoGrid</label><div class="mx-grid2">${['Box', 'Cone', 'Sphere', 'GeoSphere', 'Cylinder', 'Tube', 'Torus', 'Pyramid', 'Teapot', 'Plane', 'TextPlus'].map(n => `<button type="button" class="mx-btn" data-create="${n}">${n}</button>`).join('')}</div>`)}
  ${rollout('Name and Color', '<div class="mx-namecolor"><input type="text" class="mx-text" aria-label="Name" disabled><span class="mx-swatch" style="background:#e1117f"></span></div>')}`;
const utilitiesPage = () => rollout('Utilities', `<div class="mx-grid2">${['More...', 'Sets', 'Perspective Match', 'Collapse', 'Color Clipboard', 'Measure', 'Motion Capture', 'Reset XForm', 'MAXScript', 'Flight Studio'].map(n => `<button type="button" class="mx-btn" disabled>${n}</button>`).join('')}</div>`);

// ─── The main window ─────────────────────────────────────────────────────────
export function createMaxShell(root, opts = {}) {
  const o = {
    file: 'Untitled', objects: [], selected: null, pages: {}, tab: 'modify', actions: {},
    fps: 30, units: 'm', explorer: true, keyFilters: ['Position', 'Rotation', 'Scale'], ...opts,
  };
  const A = o.actions;
  const state = { frame: 0, start: 0, end: 100, auto: false, setMode: false, playing: false, keyMode: false, tool: 'move', lock: false, maximized: false, keys: [], selectedKey: new Set(), filters: new Set(o.keyFilters), tab: o.tab };

  root.classList.add('mx-app'); root.dataset.noI18n = ''; // the Max interface stays in English, as in the program
  root.innerHTML = `
  <div class="mx-titlebar"><span class="mx-logo" aria-hidden="true">3<small>MAX</small></span><span class="mx-title">${esc(o.file)} - Autodesk 3ds Max 2027</span><span class="mx-winbtns" aria-hidden="true"><i>&#x2500;</i><i>&#x2750;</i><i>&#x2715;</i></span></div>
  <div class="mx-menubar" role="menubar">${['File', 'Edit', 'Tools', 'Group', 'Views', 'Create', 'Modifiers', 'Animation', 'Graph Editors', 'Rendering', 'Customize', 'Scripting', 'Arnold', 'Help'].map(m => `<button type="button" class="mx-menu" data-menu="${m}">${m}</button>`).join('')}<span class="mx-workspaces">Workspaces: ${drop('Default', 150)}</span></div>
  <div class="mx-toolbar" aria-label="Main Toolbar">${grip}
    ${btn('undo', 'undo', 'Undo (Ctrl+Z)')}${btn('redo', 'redo', 'Redo (Ctrl+Y)')}${sep}
    ${btn('link', 'link', 'Select and Link', { disabled: true })}${btn('unlink', 'unlink', 'Unlink Selection', { disabled: true })}${btn('bind', 'bindSpaceWarp', 'Bind to Space Warp', { disabled: true })}${sep}
    ${drop('All', 78, 'Selection Filter')}
    ${btn('select', 'selectObject', 'Select Object (Q)')}${btn('selectByName', 'selectByName', 'Select by Name (H)')}${btn('region', 'rectRegion', 'Rectangular Selection Region', { disabled: true })}${btn('crossing', 'windowCrossing', 'Window/Crossing', { disabled: true })}${sep}
    ${btn('move', 'move', 'Select and Move (W)', { active: true })}${btn('rotate', 'rotate', 'Select and Rotate (E)')}${btn('scale', 'scale', 'Select and Uniform Scale (R)')}${btn('place', 'selectPlace', 'Select and Place', { disabled: true })}
    ${drop('View', 78, 'Reference Coordinate System')}${btn('pivot', 'pivot', 'Use Pivot Point Center', { disabled: true })}${sep}
    ${btn('manipulate', 'manipulate', 'Select and Manipulate', { disabled: true })}${btn('kbd', 'keyboardOverride', 'Keyboard Shortcut Override Toggle', { active: true })}${sep}
    ${btn('snap', 'snap3', 'Snaps Toggle (S)')}${btn('angleSnap', 'angleSnap', 'Angle Snap Toggle (A)')}${btn('percentSnap', 'percentSnap', 'Percent Snap Toggle', { disabled: true })}${btn('spinnerSnap', 'spinnerSnap', 'Spinner Snap Toggle', { disabled: true })}${sep}
    ${btn('namedSel', 'editNamedSel', 'Edit Named Selection Sets', { disabled: true })}${drop('', 130, 'Create Selection Set')}${sep}
    ${btn('mirror', 'mirror', 'Mirror', { disabled: true })}${btn('align', 'align', 'Align', { disabled: true })}${sep}
    ${btn('toggleExplorer', 'sceneExplorer', 'Toggle Scene Explorer', { active: o.explorer })}${btn('layers', 'layerExplorer', 'Toggle Layer Explorer', { disabled: true })}${btn('ribbon', 'ribbon', 'Toggle Ribbon', { active: true })}${sep}
    ${btn('curveEditor', 'curveEditor', 'Curve Editor (Open)')}${btn('schematic', 'schematic', 'Schematic View (Open)', { disabled: true })}${btn('materialEditor', 'materialEditor', 'Material Editor', { disabled: true })}${btn('renderSetup', 'renderSetup', 'Render Setup', { disabled: true })}${btn('render', 'render', 'Render Production', { disabled: true })}
    <span class="mx-more" aria-hidden="true">${icon('more')}</span>
  </div>
  <div class="mx-ribbon" aria-hidden="true">${grip}<span class="on">Modeling</span><span>Freeform</span><span>Selection</span><span>Object Paint</span><span>Populate</span><span class="mx-ribbon-opt">&#9635; &#9662;</span></div>
  <div class="mx-body">
    <aside class="mx-explorer" aria-label="Scene Explorer"${o.explorer ? '' : ' hidden'}>
      <div class="mx-pane-title">Scene Explorer - Layer Explorer</div>
      <div class="mx-explorer-menu"><span>Select</span><span>Display</span><span>Edit</span><span>Customize</span></div>
      <div class="mx-search"><input type="text" placeholder="Search All Objects..." aria-label="Search All Objects" disabled>${icon('search')}</div>
      <div class="mx-cols"><span>Name (Sorted Ascending)</span><span>Frozen</span></div>
      <div class="mx-tree" id="mx-tree" role="tree"></div>
    </aside>
    <div class="mx-viewport-area">
      <div class="mx-viewport" id="mx-viewport">
        <div class="mx-vp-labels"><button type="button" data-vpmenu="general">[+]</button><button type="button" data-vpmenu="pov" id="mx-vp-pov">[Perspective]</button><button type="button" data-vpmenu="shading">[Standard]</button><button type="button" data-vpmenu="style" id="mx-vp-style">[Default Shading]</button></div>
        <div class="mx-vp-host" id="mx-vp-host"></div>
        <button type="button" class="mx-viewcube" id="mx-viewcube" data-action="viewCube" title="ViewCube: click to go to the Home view" aria-label="ViewCube"><svg viewBox="0 0 80 64" aria-hidden="true"><ellipse cx="40" cy="48" rx="34" ry="11" fill="none" stroke="#8e8e8e" stroke-width="3"/><path d="M40 8 60 18v22L40 50 20 40V18z" fill="#bdbdbd"/><path d="M40 8l20 10-20 10-20-10z" fill="#e2e2e2"/><path d="M40 28v22L20 40V18z" fill="#a3a3a3"/><text x="27" y="42" font-family="Segoe UI,Arial" font-size="7" fill="#4b4b4b" transform="rotate(26 27 42)">FRONT</text><text x="33" y="20" font-family="Segoe UI,Arial" font-size="6.5" fill="#666" transform="skewX(-30) translate(12 0)">TOP</text></svg></button>
        <span class="mx-tripod" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M14 30 30 24" stroke="#e5534b" stroke-width="2"/><path d="M14 30 20 20" stroke="#62c45a" stroke-width="2"/><path d="M14 30V8" stroke="#5aa2e6" stroke-width="2"/><text x="31" y="26" fill="#e5534b" font-size="7">x</text><text x="21" y="18" fill="#62c45a" font-size="7">y</text><text x="11" y="7" fill="#5aa2e6" font-size="7">z</text></svg></span>
      </div>
      <button type="button" class="mx-layout-tab" title="Viewport Layout Tabs" aria-label="Viewport Layout Tabs" data-off="1">${icon('layouts')}</button>
    </div>
    <aside class="mx-cmd" aria-label="Command Panel">
      <div class="mx-cmd-tabs" role="tablist">${CMD_TABS.map(([id, ic, t]) => `<button type="button" role="tab" class="mx-cmd-tab" data-tab="${id}" title="${t}" aria-label="${t}">${icon(ic)}</button>`).join('')}</div>
      <div class="mx-cmd-page" id="mx-cmd-page"></div>
    </aside>
  </div>
  <div class="mx-timeslider" aria-label="Time Slider">${grip}<div class="mx-ts-track" id="mx-ts-track"><button type="button" class="mx-ts-thumb" id="mx-ts-thumb" title="Time Slider: drag to change the current frame"><span class="mx-ts-prev" title="Previous Frame (,)">&lt;</span><b id="mx-ts-label">0 / 100</b><span class="mx-ts-next" title="Next Frame (.)">&gt;</span></button></div></div>
  <div class="mx-trackbar" aria-label="Track Bar">${grip}<button type="button" class="mx-tb mx-mini" data-action="curveEditor" title="Open Mini Curve Editor">${icon('miniCurve')}</button><canvas id="mx-trackbar" aria-label="Track Bar: keys of the selected object"></canvas></div>
  <div class="mx-status">
    <div class="mx-listener" aria-hidden="true"><span></span><span>Scripting Mini</span></div>
    <div class="mx-prompt"><span id="mx-selinfo">None Selected</span><span id="mx-prompt">Click or click-and-drag to select objects</span></div>
    <div class="mx-coords">
      <div class="mx-row">${btn('isolate', 'isolate', 'Isolate Selection Toggle', { disabled: true, cls: 'sm' })}${btn('selectionLock', 'lock', 'Selection Lock Toggle (Space)', { cls: 'sm' })}${btn('absolute', 'absolute', 'Absolute Mode Transform Type-In', { cls: 'sm', disabled: true })}
        <label>X: <input type="text" id="mx-x" data-axis="x" value="0,0" readonly title="Transform Type-In X"></label><label>Y: <input type="text" id="mx-y" data-axis="y" value="0,0" readonly title="Transform Type-In Y"></label><label>Z: <input type="text" id="mx-z" data-axis="z" value="0,0" readonly title="Transform Type-In Z"></label><span class="mx-grid-lbl">Grid = 1,0${esc(o.units)}</span></div>
      <div class="mx-row">${btn('adaptive', 'shield', 'Adaptive Degradation', { cls: 'sm', disabled: true })}<span class="mx-enabled">Enabled: <i></i></span><span class="mx-zero">0</span>${btn('timeTag', 'timeTag', 'Add Time Tag', { cls: 'sm', disabled: true })}<span class="mx-dim">Add Time Tag</span></div>
    </div>
    <div class="mx-anim">
      <div class="mx-row">${btn('goStart', 'goStart', 'Go to Start (Home)', { cls: 'sm' })}${btn('prevFrame', 'prevFrame', 'Previous Frame (,)', { cls: 'sm' })}${btn('play', 'play', 'Play Animation (/)', { cls: 'sm mx-play' })}${btn('nextFrame', 'nextFrame', 'Next Frame (.)', { cls: 'sm' })}${btn('goEnd', 'goEnd', 'Go to End (End)', { cls: 'sm' })}</div>
      <div class="mx-row">${btn('keyMode', 'keyMode', 'Key Mode Toggle: the arrows jump from key to key', { cls: 'sm' })}${spinner({ id: 'mx-frame', value: 0, step: 1, min: 0, max: 100, decimals: 0, width: 150, label: 'Current Frame' })}${btn('timeConfig', 'timeConfig', 'Time Configuration', { cls: 'sm' })}</div>
    </div>
    <div class="mx-keys">
      <button type="button" class="mx-setkey-big" data-action="setKey" title="Set Keys (K): in Set Key Mode, adds keys to the filtered tracks">${icon('setKeyBig')}</button>
      <div class="mx-keycol"><button type="button" class="mx-textbtn" data-action="autoKey" id="mx-auto" title="Toggle Auto Key Mode (N)">Auto</button><button type="button" class="mx-textbtn" data-action="setKeyMode" id="mx-setk" title="Toggle Set Key Mode (')">Set K.</button></div>
      <div class="mx-keycol"><span class="mx-drop mx-sel" title="Selection set for keying">Selected<i></i></span><div class="mx-row">${btn('tangentDefault', 'tangentDefault', 'New Keys: Default In/Out Tangents', { cls: 'sm', disabled: true })}<button type="button" class="mx-textbtn wide" data-action="keyFilters" title="Key Filters: which tracks Set Keys writes">Filters...</button></div></div>
    </div>
    <div class="mx-nav">
      ${btn('zoom', 'zoom', 'Zoom (Alt+Z)', { cls: 'sm' })}${btn('zoomAll', 'zoomAll', 'Zoom All', { cls: 'sm', disabled: true })}${btn('zoomExtents', 'zoomExtents', 'Zoom Extents Selected (Z)', { cls: 'sm' })}${btn('zoomExtentsAll', 'zoomExtentsAll', 'Zoom Extents All (Ctrl+Shift+Z)', { cls: 'sm' })}
      ${btn('fov', 'fov', 'Field-of-View', { cls: 'sm', disabled: true })}${btn('pan', 'pan', 'Pan View (Middle mouse button)', { cls: 'sm' })}${btn('orbit', 'orbit', 'Orbit (Alt + middle mouse button)', { cls: 'sm' })}${btn('maximize', 'maximize', 'Maximize Viewport Toggle (Alt+W)', { cls: 'sm' })}
    </div>
  </div>
  <div class="mx-popup" id="mx-popup" hidden></div>
  <dialog class="mx-dialog" id="mx-dialog"></dialog>`;

  const $ = s => root.querySelector(s);
  const on = (el, ev, fn) => el.addEventListener(ev, fn);
  wireSpinners(root);

  // ── Prompt line and selection info ──
  let promptTimer = 0;
  const api = {
    root, state,
    prompt(text, sticky = false) { $('#mx-prompt').textContent = text; clearTimeout(promptTimer); if (!sticky) promptTimer = setTimeout(() => { $('#mx-prompt').textContent = api.defaultPrompt(); }, 6000); },
    defaultPrompt: () => state.auto ? 'Auto Key is on: every change you make is recorded as a key at the current frame' : state.setMode ? 'Set Key Mode: pose the object, then press Set Keys (K)' : o.selected ? 'Click and drag to select and move objects' : 'Click or click-and-drag to select objects',
    host: $('#mx-vp-host'),
    trackbar: $('#mx-trackbar'),
  };

  // ── Scene Explorer ──
  function renderTree() {
    $('#mx-tree').innerHTML = o.objects.map(ob => `<button type="button" role="treeitem" class="mx-node${ob.id === o.selected ? ' on' : ''}" data-object="${esc(ob.id)}" style="--d:${ob.depth || 0}" aria-selected="${ob.id === o.selected}"><span class="mx-eye" aria-hidden="true"></span><span class="mx-ob-ico" aria-hidden="true" style="--c:${ob.color || '#6fa8e8'}"></span>${esc(ob.name || ob.id)}</button>`).join('');
    const ob = o.objects.find(x => x.id === o.selected);
    $('#mx-selinfo').textContent = ob ? `1 ${ob.kind || 'Object'} Selected` : 'None Selected';
  }
  on($('#mx-tree'), 'click', e => { const b = e.target.closest('[data-object]'); if (b) api.select(b.dataset.object, true); });
  api.select = (id, fromUser = false) => {
    if (state.lock && fromUser) { api.prompt('Selection Lock is on (Space): press Space to unlock it'); return; }
    const changed = o.selected !== id;
    o.selected = id; renderTree();
    if (changed) { const ob = o.objects.find(x => x.id === id), nm = $('#mx-objname'), sw = nm?.parentElement.querySelector('.mx-swatch'); if (nm) nm.value = ob?.name || ''; if (sw) sw.style.background = ob?.color || '#555'; }
    if (fromUser) A.selectObject?.(id);
  };
  api.selectedId = () => o.selected;
  api.setObjects = (list, selected = o.selected) => { o.objects = list; o.selected = selected; renderTree(); };

  // ── Command Panel ──
  const closedRollouts = new Set();
  function renderCmd() {
    const pageEl = $('#mx-cmd-page'), scroll = pageEl.scrollTop;
    root.querySelectorAll('.mx-cmd-tab').forEach(t => { const onT = t.dataset.tab === state.tab; t.classList.toggle('on', onT); t.setAttribute('aria-selected', onT); });
    const page = o.pages[state.tab] ?? (state.tab === 'create' ? createPage() : state.tab === 'utilities' ? utilitiesPage() : `<p class="mx-empty">${state.tab === 'display' ? 'Display properties of the selected object: not used in this lab.' : 'Not used in this lab.'}</p>`);
    $('#mx-cmd-page').innerHTML = (state.tab === 'create' ? '' : `<div class="mx-search">${`<input type="text" class="mx-objname" id="mx-objname" value="${esc(o.objects.find(x => x.id === o.selected)?.name || '')}" aria-label="Object name" readonly>`}<span class="mx-swatch" style="background:${o.objects.find(x => x.id === o.selected)?.color || '#555'}"></span></div>`) + (state.tab === 'create' ? `<div class="mx-search"><input type="text" placeholder="Search All Objects..." aria-label="Search All Objects" disabled>${icon('search')}</div>` : '') + page;
    A.commandPanel?.(state.tab, $('#mx-cmd-page'));
    pageEl.querySelectorAll('.mx-rollout').forEach(r => { if (closedRollouts.has(r.querySelector('.mx-rollout-h')?.textContent)) r.classList.add('closed'); });
    pageEl.scrollTop = scroll;
  }
  on($('.mx-cmd-tabs'), 'click', e => { const t = e.target.closest('[data-tab]'); if (!t) return; state.tab = t.dataset.tab; renderCmd(); });
  on($('#mx-cmd-page'), 'click', e => {
    const h = e.target.closest('.mx-rollout-h'); if (h) { const closed = h.parentElement.classList.toggle('closed'); closed ? closedRollouts.add(h.textContent) : closedRollouts.delete(h.textContent); return; }
    if (e.target.closest('[data-create]')) api.prompt(`${e.target.closest('[data-create]').dataset.create}: creating objects is not part of this lab`);
  });
  api.setPage = (tab, html) => { o.pages[tab] = html; if (state.tab === tab) renderCmd(); };
  api.showTab = tab => { state.tab = tab; renderCmd(); };
  api.page = () => $('#mx-cmd-page');

  // ── Time ──
  function renderTime() {
    const { frame, start, end } = state;
    $('#mx-ts-label').textContent = `${Math.round(frame)} / ${end}`;
    const track = $('#mx-ts-track'), thumb = $('#mx-ts-thumb');
    const w = track.clientWidth - thumb.offsetWidth;
    thumb.style.left = `${end > start ? (frame - start) / (end - start) * Math.max(0, w) : 0}px`;
    const fr = $('#mx-frame'); if (document.activeElement !== fr) fr.value = Math.round(frame);
    fr.min = start; fr.max = end; fr.closest('.mx-spin').dataset.min = start; fr.closest('.mx-spin').dataset.max = end;
    drawTrackbar();
  }
  api.setTime = t => { Object.assign(state, t); renderTime(); };
  const frameAtX = x => { const track = $('#mx-ts-track'), thumb = $('#mx-ts-thumb'), r = track.getBoundingClientRect(); return Math.round(state.start + clamp((x - r.left - thumb.offsetWidth / 2) / Math.max(1, r.width - thumb.offsetWidth), 0, 1) * (state.end - state.start)); };
  on($('#mx-ts-track'), 'pointerdown', e => {
    if (e.target.closest('.mx-ts-prev')) { run('prevFrame'); return; }
    if (e.target.closest('.mx-ts-next')) { run('nextFrame'); return; }
    const tr = $('#mx-ts-track'); tr.setPointerCapture(e.pointerId);
    const go = ev => A.frame?.(frameAtX(ev.clientX));
    if (!e.target.closest('.mx-ts-thumb')) go(e);
    const mv = ev => go(ev), up = () => { tr.removeEventListener('pointermove', mv); tr.removeEventListener('pointerup', up); };
    tr.addEventListener('pointermove', mv); tr.addEventListener('pointerup', up);
  });
  on($('#mx-frame'), 'change', e => A.frame?.(clamp(Math.round(+e.target.value), state.start, state.end)));
  on($('#mx-frame'), 'input', e => { if (e.target.value !== '') A.frame?.(clamp(Math.round(+e.target.value), state.start, state.end)); });

  // ── Track Bar: keys as coloured bars (red Position, green Rotation, blue Scale), selected keys white ──
  const KEYCOL = { position: '#e5534b', rotation: '#5cbf4f', scale: '#5a8fe6', other: '#b8b8b8' };
  function tbGeom() {
    const c = api.trackbar, r = c.getBoundingClientRect(), thumbW = $('#mx-ts-thumb').offsetWidth;
    const trackR = $('#mx-ts-track').getBoundingClientRect();
    const x0 = trackR.left - r.left + thumbW / 2, x1 = trackR.right - r.left - thumbW / 2;
    return { c, w: r.width, h: r.height, x0, x1, X: f => x0 + (f - state.start) / Math.max(1, state.end - state.start) * (x1 - x0), F: x => state.start + (x - x0) / Math.max(1, x1 - x0) * (state.end - state.start) };
  }
  function drawTrackbar() {
    const g = tbGeom(), c = g.c, dpr = Math.min(2, devicePixelRatio || 1);
    if (!g.w) return;
    c.width = Math.round(g.w * dpr); c.height = Math.round(g.h * dpr);
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = state.auto || state.setMode ? '#5e2a2a' : '#2a2a2a'; x.fillRect(0, 0, g.w, g.h);
    const span = state.end - state.start, step = span > 400 ? 50 : span > 200 ? 20 : span > 90 ? 5 : span > 40 ? 5 : span > 16 ? 2 : 1, lab = span > 200 ? step * 2 : span > 40 ? 5 * Math.ceil(span / 100) * (span > 150 ? 2 : 1) : step * 5 > span ? step : 5;
    x.font = '11px Segoe UI, Arial'; x.textAlign = 'center';
    for (let f = Math.ceil(state.start / step) * step; f <= state.end; f += step) {
      const px = Math.round(g.X(f)) + .5, big = f % lab === 0;
      x.strokeStyle = '#8a8a8a'; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, big ? 9 : 6); x.stroke();
      if (big) { x.fillStyle = '#c8c8c8'; x.fillText(String(f), px, 21); }
    }
    x.strokeStyle = '#3c3c3c'; x.beginPath(); x.moveTo(0, g.h - 7.5); x.lineTo(g.w, g.h - 7.5); x.stroke();
    // keys
    const bw = Math.max(3, Math.min(8, (g.x1 - g.x0) / Math.max(1, span) * .8));
    for (const k of state.keys) {
      if (k.frame < state.start || k.frame > state.end) continue;
      const px = g.X(k.frame), sel = state.selectedKey.has(k.frame), types = k.types?.length ? k.types : ['other'];
      const hh = (g.h - 8) / types.length;
      types.forEach((t, i) => { x.fillStyle = sel ? '#ffffff' : KEYCOL[t] || KEYCOL.other; x.fillRect(px - bw / 2, 1 + i * hh, bw, hh - 1); });
      if (sel) { x.strokeStyle = '#000'; x.strokeRect(px - bw / 2 + .5, 1.5, bw - 1, g.h - 10); }
    }
    // current frame
    const cx = Math.round(g.X(state.frame)) + .5;
    x.strokeStyle = '#d7c23a'; x.globalAlpha = .7; x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, g.h); x.stroke(); x.globalAlpha = 1;
    if (tbDrag?.box) { const b = tbDrag.box; x.strokeStyle = '#fff'; x.setLineDash([3, 2]); x.strokeRect(Math.min(b.a, b.b) + .5, 1.5, Math.abs(b.b - b.a), g.h - 4); x.setLineDash([]); }
    if (tbDrag?.moving && tbDrag.df) { x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(`${tbDrag.copy ? 'Copy' : 'Move'} keys: ${tbDrag.df > 0 ? '+' : ''}${tbDrag.df}`, 6, g.h - 10); }
  }
  api.setKeys = (keys, selectedFrames) => { state.keys = keys; if (selectedFrames) state.selectedKey = new Set(selectedFrames); drawTrackbar(); };
  api.drawTrackbar = drawTrackbar;
  let tbDrag = null;
  const keyAt = (g, px) => { let best = null, bd = 6; for (const k of state.keys) { const d = Math.abs(g.X(k.frame) - px); if (d < bd && k.frame >= state.start && k.frame <= state.end) { bd = d; best = k; } } return best; };
  on(api.trackbar, 'pointerdown', e => {
    const g = tbGeom(), r = api.trackbar.getBoundingClientRect(), px = e.clientX - r.left;
    closePopup();
    // Ctrl+Alt + left / middle / right drag: change the start, slide the range, change the end (as in Max).
    if (e.ctrlKey && e.altKey && A.range) {
      api.trackbar.setPointerCapture(e.pointerId);
      tbDrag = { range: e.button, x: px, start: state.start, end: state.end };
      e.preventDefault(); return;
    }
    if (e.button === 2) {
      const k = keyAt(g, px);
      if (k && !state.selectedKey.has(k.frame)) { state.selectedKey = new Set([k.frame]); A.selectKeys?.([...state.selectedKey]); }
      openPopup(e.clientX, e.clientY, [
        ...state.keys.filter(k2 => state.selectedKey.has(k2.frame)).slice(0, 4).map(k2 => ({ label: `Ball: ${k2.label || 'Keys'} (frame ${k2.frame})`, dim: true })),
        { sep: true }, { label: 'Delete Selected Keys', run: () => A.deleteKeys?.([...state.selectedKey]), disabled: !state.selectedKey.size },
        { label: 'Filter ▸ All Keys', dim: true }, { label: 'Go to Time', run: () => k && A.frame?.(k.frame), disabled: !k },
      ]);
      e.preventDefault(); drawTrackbar(); return;
    }
    if (e.button !== 0) return;
    api.trackbar.setPointerCapture(e.pointerId);
    const k = keyAt(g, px);
    if (k) {
      if (e.ctrlKey) { state.selectedKey.has(k.frame) ? state.selectedKey.delete(k.frame) : state.selectedKey.add(k.frame); }
      else if (!state.selectedKey.has(k.frame)) state.selectedKey = new Set([k.frame]);
      A.selectKeys?.([...state.selectedKey]);
      tbDrag = { moving: true, f0: g.F(px), df: 0, copy: e.shiftKey, started: false };
    } else {
      if (!e.ctrlKey) state.selectedKey = new Set();
      tbDrag = { box: { a: px, b: px } };
      A.frame?.(clamp(Math.round(g.F(px)), state.start, state.end));
    }
    drawTrackbar();
  });
  on(api.trackbar, 'pointermove', e => {
    if (!tbDrag) return;
    const g = tbGeom(), px = e.clientX - api.trackbar.getBoundingClientRect().left;
    if (tbDrag.box) { tbDrag.box.b = px; drawTrackbar(); return; }
    if (tbDrag.range != null) {
      const d = tbDrag, df = Math.round((px - d.x) / Math.max(1, g.x1 - g.x0) * (d.end - d.start));
      let s0 = d.start, s1 = d.end;
      if (d.range === 0) s0 = Math.min(d.start + df, d.end - 1); else if (d.range === 2) s1 = Math.max(d.end + df, d.start + 1); else { s0 = d.start + df; s1 = d.end + df; if (s0 < 0) { s1 -= s0; s0 = 0; } }
      s0 = Math.max(0, s0);
      A.range(s0, s1, false); api.prompt(`Time range: ${s0} to ${s1} (Ctrl+Alt+left drag: start · middle: slide · right: end)`, true);
      return;
    }
    tbDrag.df = Math.round(g.F(px) - tbDrag.f0); drawTrackbar();
  });
  const tbUp = () => {
    const d = tbDrag; tbDrag = null; if (!d) return;
    if (d.range != null) { A.range(state.start, state.end, true); return; }
    if (d.box) {
      const g = tbGeom(), a = g.F(Math.min(d.box.a, d.box.b)), b = g.F(Math.max(d.box.a, d.box.b));
      if (Math.abs(d.box.b - d.box.a) > 3) { for (const k of state.keys) if (k.frame >= a && k.frame <= b) state.selectedKey.add(k.frame); A.selectKeys?.([...state.selectedKey]); }
    } else if (d.moving && d.df) {
      const ok = A.moveKeys?.([...state.selectedKey], d.df, d.copy);
      if (ok !== false) state.selectedKey = new Set([...state.selectedKey].map(f => f + d.df));
      api.prompt(ok === false ? 'Keys cannot move there: another key is in the way' : `${d.copy ? 'Copied' : 'Moved'} keys ${d.df > 0 ? '+' : ''}${d.df} frames${d.copy ? '' : ' (Shift+drag copies them)'}`);
    }
    drawTrackbar();
  };
  on(api.trackbar, 'pointerup', tbUp); on(api.trackbar, 'pointercancel', tbUp);
  on(api.trackbar, 'contextmenu', e => e.preventDefault());
  on(api.trackbar, 'auxclick', e => e.preventDefault());
  on(api.trackbar, 'mousedown', e => { if (e.button === 1) e.preventDefault(); });

  // ── Popups (menus) ──
  function openPopup(x, y, items) {
    const p = $('#mx-popup');
    p.innerHTML = items.map((it, i) => it.sep ? '<hr>' : `<button type="button" data-i="${i}"${it.disabled || it.dim ? ' disabled' : ''}${it.checked != null ? ` class="${it.checked ? 'checked' : ''}"` : ''}>${esc(it.label)}${it.keys ? `<kbd>${esc(it.keys)}</kbd>` : ''}</button>`).join('');
    p.hidden = false;
    p.style.left = `${Math.max(4, Math.min(x, innerWidth - p.offsetWidth - 4))}px`; p.style.top = `${Math.max(4, Math.min(y, innerHeight - p.offsetHeight - 4))}px`;
    p.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; closePopup(); items[+b.dataset.i].run?.(); };
  }
  function closePopup() { $('#mx-popup').hidden = true; root.querySelectorAll('.mx-menu.open').forEach(m => m.classList.remove('open')); }
  api.openPopup = openPopup; api.closePopup = closePopup;
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.mx-popup') && !e.target.closest('.mx-menu')) closePopup(); });

  const MENUS = {
    Edit: [{ label: 'Undo', keys: 'Ctrl+Z', action: 'undo' }, { label: 'Redo', keys: 'Ctrl+Y', action: 'redo' }, { sep: true }, { label: 'Delete', keys: 'Delete', action: 'delete' }, { sep: true }, { label: 'Select All', keys: 'Ctrl+A', action: 'selectAll' }, { label: 'Select None', keys: 'Ctrl+D', action: 'selectNone' }, { label: 'Select by Name...', keys: 'H', action: 'selectByName' }, { sep: true }, { label: 'Select and Move', keys: 'W', action: 'move' }, { label: 'Select and Rotate', keys: 'E', action: 'rotate' }, { label: 'Select and Scale', keys: 'R', action: 'scale' }],
    Views: [{ label: 'Maximize Viewport Toggle', keys: 'Alt+W', action: 'maximize' }, { label: 'Zoom Extents Selected', keys: 'Z', action: 'zoomExtents' }, { label: 'Show Grids', keys: 'G', action: 'grid' }],
    Animation: [{ label: 'Toggle Auto Key Mode', keys: 'N', action: 'autoKey' }, { label: 'Toggle Set Key Mode', keys: "'", action: 'setKeyMode' }, { label: 'Set Keys', keys: 'K', action: 'setKey' }, { sep: true }, { label: 'Play Animation', keys: '/', action: 'play' }, { label: 'Go to Start', keys: 'Home', action: 'goStart' }, { label: 'Go to End', keys: 'End', action: 'goEnd' }, { sep: true }, { label: 'Time Configuration...', action: 'timeConfig' }, { label: 'Key Filters...', action: 'keyFilters' }],
    'Graph Editors': [{ label: 'Track View - Curve Editor...', action: 'curveEditor' }, { label: 'Track View - Dope Sheet...', action: 'dopeSheet' }],
    Customize: [{ label: 'Hotkey Editor...', action: 'hotkeys' }],
    Help: [{ label: 'Keyboard shortcuts in this lab', action: 'hotkeys' }],
    ...(o.menus || {}),
  };
  on($('.mx-menubar'), 'click', e => {
    const m = e.target.closest('.mx-menu'); if (!m) return;
    const items = MENUS[m.dataset.menu];
    if (!items) { api.prompt(`${m.dataset.menu}: not used in this lab`); return; }
    const r = m.getBoundingClientRect(); m.classList.add('open');
    const list = typeof items === 'function' ? items() : items;
    openPopup(r.left, r.bottom, list.map(it => it.sep || it.run ? it : { ...it, run: () => run(it.action), disabled: !A[it.action] && !BUILTIN[it.action] }));
  });

  // ── Viewport label menus ──
  on($('.mx-vp-labels'), 'click', e => {
    const b = e.target.closest('[data-vpmenu]'); if (!b) return;
    const r = b.getBoundingClientRect(), k = b.dataset.vpmenu;
    const items = k === 'pov' ? [{ label: 'Perspective', keys: 'P', action: 'viewPerspective' }, { label: 'Front', keys: 'F', action: 'viewFront' }, { label: 'Top', keys: 'T', action: 'viewTop' }, { label: 'Left', keys: 'L', action: 'viewLeft' }]
      : k === 'general' ? [{ label: 'Maximize Viewport', keys: 'Alt+W', action: 'maximize' }, { label: 'Show Grids', keys: 'G', action: 'grid' }]
      : k === 'style' ? [{ label: 'Default Shading', action: 'shaded' }, { label: 'Wireframe Override', keys: 'F3', action: 'wireframe' }, { label: 'Edged Faces', keys: 'F4', action: 'edgedFaces' }]
      : [{ label: 'Standard', dim: true }, { label: 'High Quality', dim: true }];
    openPopup(r.left, r.bottom, items.map(it => ({ ...it, run: () => run(it.action), disabled: it.dim || !A[it.action] })));
  });
  api.setViewLabel = (pov, style) => { if (pov) $('#mx-vp-pov').textContent = `[${pov}]`; if (style) $('#mx-vp-style').textContent = `[${style}]`; };

  // ── Toggles with Max's visual states ──
  function renderModes() {
    root.classList.toggle('mx-autokey', state.auto);
    root.classList.toggle('mx-setkey', state.setMode);
    $('#mx-auto').classList.toggle('on', state.auto); $('#mx-auto').setAttribute('aria-pressed', state.auto);
    $('#mx-setk').classList.toggle('on', state.setMode); $('#mx-setk').setAttribute('aria-pressed', state.setMode);
    root.querySelector('.mx-setkey-big').disabled = !state.setMode;
    const set = (id, v) => { const b = root.querySelector(`.mx-tb[data-id="${id}"]`); if (b) { b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); } };
    for (const t of ['select', 'move', 'rotate', 'scale']) set(t, state.tool === t);
    set('selectionLock', state.lock); set('keyMode', state.keyMode); set('maximize', state.maximized); set('toggleExplorer', !$('.mx-explorer').hidden);
    const play = root.querySelector('.mx-tb[data-id="play"]'); play.innerHTML = icon(state.playing ? 'stop' : 'play'); play.title = state.playing ? 'Stop Animation (/)' : 'Play Animation (/)';
    root.classList.toggle('mx-maximized', state.maximized);
    drawTrackbar();
  }
  api.setModes = m => { Object.assign(state, m); renderModes(); if (!m.silent) $('#mx-prompt').textContent = api.defaultPrompt(); };
  // Transform Type-In: X, Y, Z of the current tool. Pass null to grey a field out.
  api.setCoords = (x, y, z) => {
    const fmt = v => v == null ? '' : (Math.round(+v * 100) / 100).toString().replace('.', ',');
    for (const [id, v] of [['#mx-x', x], ['#mx-y', y], ['#mx-z', z]]) { const el = $(id); el.readOnly = v == null || !A.typeIn; el.classList.toggle('off', v == null); if (document.activeElement !== el) el.value = fmt(v); }
  };
  for (const id of ['#mx-x', '#mx-y', '#mx-z']) {
    on($(id), 'change', e => { const v = parseFloat(e.target.value.replace(',', '.')); if (Number.isFinite(v)) A.typeIn?.(e.target.dataset.axis, v); });
    on($(id), 'keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  }

  // ── Dialogs ──
  const dlg = $('#mx-dialog');
  function dialog(title, body, onOk, { ok = 'OK', cancel = 'Cancel', width = 360 } = {}) {
    dlg.style.width = `${width}px`;
    dlg.innerHTML = `<form method="dialog"><div class="mx-dlg-title"><span class="mx-logo sm" aria-hidden="true">3</span>${esc(title)}<button value="cancel" class="mx-dlg-x" aria-label="Close">&#x2715;</button></div><div class="mx-dlg-body">${body}</div><div class="mx-dlg-actions">${ok ? `<button value="ok" class="mx-btn">${esc(ok)}</button>` : ''}${cancel ? `<button value="cancel" class="mx-btn">${esc(cancel)}</button>` : ''}</div></form>`;
    wireSpinners(dlg);
    dlg.returnValue = '';
    dlg.onclose = () => { if (dlg.returnValue === 'ok') onOk?.(dlg); };
    dlg.showModal();
    return dlg;
  }
  api.dialog = dialog;
  const BUILTIN = {
    keyFilters() {
      const all = o.keyFilters;
      dialog('Set Key Filters', `<div class="mx-filters">${[...all, 'Modifiers', 'Materials', 'Other', 'IK Parameters', 'Object Parameters', 'Custom Attributes'].map(n => `<label class="mx-check${all.includes(n) ? '' : ' dim'}"><input type="checkbox" name="${esc(n)}"${state.filters.has(n) ? ' checked' : ''}${all.includes(n) ? '' : ' disabled'}> ${esc(n)}</label>`).join('')}</div><p class="mx-note">Set Keys (K) only writes keys on the tracks that are checked here.</p>`,
        d => { state.filters = new Set([...d.querySelectorAll('input:checked')].map(i => i.name)); A.onKeyFilters?.([...state.filters]); api.prompt(`Key Filters: ${[...state.filters].join(', ') || 'none'}`); }, { width: 300 });
    },
    timeConfig() {
      dialog('Time Configuration', `<fieldset><legend>Frame Rate</legend><div class="mx-radios">${[['NTSC', 30], ['PAL', 25], ['Film', 24], ['Custom', 60]].map(([n, v]) => `<label><input type="radio" name="fps" value="${v}"${o.fps === v ? ' checked' : ''}> ${n}</label>`).join('')}</div><label class="mx-field">FPS: <b>${o.fps}</b></label></fieldset>
        <fieldset><legend>Animation</legend><label class="mx-field">Start Time: ${spinner({ id: 'mx-tc-start', value: state.start, step: 1, min: 0, max: 1000, decimals: 0 })}</label><label class="mx-field">End Time: ${spinner({ id: 'mx-tc-end', value: state.end, step: 1, min: 1, max: 1000, decimals: 0 })}</label><label class="mx-field">Length: <b>${state.end - state.start}</b></label></fieldset>
        <fieldset><legend>Playback</legend><label class="mx-check"><input type="checkbox" checked disabled> Real Time</label><label class="mx-check"><input type="checkbox" name="loop" checked disabled> Loop</label></fieldset>`,
        d => {
          const start = Math.round(+d.querySelector('#mx-tc-start').value), end = Math.round(+d.querySelector('#mx-tc-end').value), fps = +d.querySelector('input[name=fps]:checked').value;
          if (!(end > start)) { api.prompt('End Time must be after Start Time'); return; }
          o.fps = fps; A.onTimeConfig?.({ start, end, fps });
        });
    },
    selectByName() {
      dialog('Select From Scene', `<div class="mx-sfs"><div class="mx-sfs-head">Name</div>${o.objects.map(ob => `<label class="mx-sfs-row"><input type="radio" name="sfs" value="${esc(ob.id)}"${ob.id === o.selected ? ' checked' : ''}><span class="mx-ob-ico" style="--c:${ob.color || '#6fa8e8'}"></span>${esc(ob.name || ob.id)}</label>`).join('')}</div>`,
        d => { const v = d.querySelector('input[name=sfs]:checked')?.value; if (v) api.select(v, true); }, { width: 320 });
    },
    hotkeys() {
      const groups = [...new Set(HOTKEYS.map(h => h.group))];
      dialog('Hotkey Editor · 3ds Max default shortcuts', `<div class="mx-hk">${groups.map(g => `<h4>${g}</h4>${HOTKEYS.filter(h => h.group === g).map(h => `<div class="mx-hk-row${A[h.action] || BUILTIN[h.action] ? '' : ' dim'}"><span>${esc(h.label)}</span><kbd>${esc(showKeys(h))}</kbd></div>`).join('')}`).join('')}</div><p class="mx-note">Greyed shortcuts exist in 3ds Max but do nothing in this lab.</p>`, null, { ok: '', cancel: 'Close', width: 520 });
    },
    toggleExplorer() { const ex = $('.mx-explorer'); ex.hidden = !ex.hidden; renderModes(); A.layout?.(); },
    selectionLock() { state.lock = !state.lock; renderModes(); api.prompt(state.lock ? 'Selection Lock on: the selection cannot change (Space)' : 'Selection Lock off'); },
    maximize() { state.maximized = !state.maximized; renderModes(); A.layout?.(); A.maximize?.(state.maximized); },
  };
  api.builtin = BUILTIN;

  // ── Dispatch: buttons and hotkeys go through the same actions ──
  function run(action, e) {
    if (!action) return;
    const b = root.querySelector(`.mx-tb[data-id="${action}"]`);
    if (b?.dataset.off) { api.prompt(`${b.title}: not used in this lab`); return; }
    if (A[action]) { A[action](e); return; }
    if (BUILTIN[action]) { BUILTIN[action](e); return; }
    const hk = HOTKEYS.find(h => h.action === action);
    api.prompt(`${hk?.label || b?.title || action}: not used in this lab`);
  }
  api.run = run;
  on(root, 'click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || !root.contains(b) || b.closest('.mx-popup')) return;
    run(b.dataset.action, e);
  });

  // Hotkeys work while the pointer is over a Max window (the whole page scrolls otherwise).
  const hovered = new Set();
  api.registerWindow = el => { el.addEventListener('pointerenter', () => hovered.add(el)); el.addEventListener('pointerleave', () => hovered.delete(el)); };
  api.registerWindow(root);
  api.overTrackView = () => [...hovered].some(el => el.classList.contains('mx-tv'));
  document.addEventListener('keydown', e => {
    if (!hovered.size || e.target.closest?.('input, select, textarea, dialog')) return;
    if (dlg.open) return;
    const combo = comboOf(e);
    if (A.key?.(e, combo) === true) { e.preventDefault(); return; } // the lab handled it (e.g. inside Track View)
    const hk = HOTKEYS.find(h => h.keys === combo);
    if (!hk) return;
    e.preventDefault();
    run(hk.action, e);
    if (A[hk.action] || BUILTIN[hk.action]) flashButton(hk.action);
  });
  function flashButton(action) { const b = root.querySelector(`.mx-tb[data-id="${action}"]`); if (!b) return; b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }

  on(window, 'resize', () => renderTime());
  new ResizeObserver(() => renderTime()).observe($('#mx-ts-track'));
  renderTree(); renderCmd(); renderModes(); renderTime();
  return api;
}

// ─── Track View window (Curve Editor / Dope Sheet) ───────────────────────────
// The toolbar keeps Max's buttons and order; the lab says which ones it implements.
export const TV_TOOLS = [
  ['filters', 'tvFilters', 'Filters'], ['lockSelection', 'tvLockSel', 'Lock Current Selection'], ['drawCurves', 'tvDraw', 'Draw Curves'],
  ['addKeys', 'tvAddKeys', 'Add/Remove Key'], ['moveKeys', 'tvMoveKeys', 'Move Keys'], ['slideKeys', 'tvSlideKeys', 'Slide Keys'],
  ['scaleKeys', 'tvScaleKeys', 'Scale Keys'], ['scaleValues', 'tvScaleValues', 'Scale Values'], '|',
  ['snapFrames', 'tvSnapFrames', 'Snap Frames'], ['outOfRange', 'tvOutOfRange', 'Parameter Curve Out-of-Range Types'], '|',
  ['tanAuto', 'tvTangentAuto', 'Set Tangents to Auto'], ['tanSpline', 'tvTangentSpline', 'Set Tangents to Spline'], ['tanFast', 'tvTangentFast', 'Set Tangents to Fast'],
  ['tanSlow', 'tvTangentSlow', 'Set Tangents to Slow'], ['tanStep', 'tvTangentStep', 'Set Tangents to Step'], ['tanLinear', 'tvTangentLinear', 'Set Tangents to Linear'],
  ['tanSmooth', 'tvTangentSmooth', 'Set Tangents to Smooth'], '|',
  ['showTangents', 'tvShowTangents', 'Show Tangents'], ['breakTangents', 'tvBreakTangents', 'Break Tangents'], ['unifyTangents', 'tvUnifyTangents', 'Unify Tangents'], ['lockTangents', 'tvLockTangents', 'Lock Tangents'],
];
export function createTrackView(root, opts = {}) {
  const o = { mode: 'curve', tools: {}, active: { moveKeys: true, showTangents: true }, actions: {}, title: 'Track View', ...opts };
  const A = o.actions;
  root.classList.add('mx-tv'); root.dataset.noI18n = '';
  const tool = t => t === '|' ? sep : btn(t[0], t[1], t[2], { active: !!o.active[t[0]], disabled: !o.tools[t[0]], action: `tv:${t[0]}` });
  root.innerHTML = `
    <div class="mx-tv-title"><span class="mx-logo sm" aria-hidden="true">3</span><span id="mx-tv-title">Track View - Curve Editor</span><span class="mx-winbtns light" aria-hidden="true"><i>&#x2500;</i><i>&#x2610;</i><i>&#x2715;</i></span></div>
    <div class="mx-tv-menubar">${['Editor', 'Edit', 'View', 'Curves', 'Keys', 'Tangents', 'Show'].map(m => `<button type="button" class="mx-menu" data-tvmenu="${m}">${m}</button>`).join('')}</div>
    <div class="mx-tv-toolbar">${grip}${TV_TOOLS.map(tool).join('')}</div>
    <div class="mx-tv-body">
      <aside class="mx-tv-controllers" aria-label="Controller Window"><div class="mx-tv-tree" id="mx-tv-tree" role="tree"></div></aside>
      <div class="mx-tv-keys" id="mx-tv-keys"></div>
    </div>
    <div class="mx-tv-bottom">
      ${btn('tv-zoomSel', 'zoom', 'Zoom Selected Object', { disabled: true, cls: 'sm' })}<span class="mx-tv-field wide" aria-hidden="true"></span>${sep}
      <span class="mx-tv-stat" title="Key Stats: frame and value of the selected key"><label>${spinner({ id: 'mx-tv-frame', step: 1, decimals: 0, width: 90, label: 'Selected key frame' })}</label><label>${spinner({ id: 'mx-tv-value', step: 0.1, decimals: 3, width: 90, label: 'Selected key value' })}</label></span>${sep}
      <span class="mx-tv-spacer"></span>
      ${btn('tv:frameH', 'tvFrameH', 'Frame Horizontal Extents', { cls: 'sm', disabled: !o.tools.frameH, action: 'tv:frameH' })}${btn('tv:frameV', 'tvFrameV', 'Frame Value Extents', { cls: 'sm', disabled: !o.tools.frameV, action: 'tv:frameV' })}
      ${btn('tv:pan', 'pan', 'Pan (middle mouse button)', { cls: 'sm', disabled: !o.tools.pan, action: 'tv:pan' })}${btn('tv:zoom', 'zoom', 'Zoom (mouse wheel)', { cls: 'sm', disabled: !o.tools.zoom, action: 'tv:zoom' })}${btn('tv:zoomRegion', 'tvZoomRegion', 'Zoom Region', { cls: 'sm', disabled: true, action: 'tv:zoomRegion' })}
    </div>`;
  const $ = s => root.querySelector(s);
  wireSpinners(root);
  const api = {
    root, host: $('#mx-tv-keys'), tree: $('#mx-tv-tree'),
    setMode(mode) { o.mode = mode; $('#mx-tv-title').textContent = `Track View - ${mode === 'dope' ? 'Dope Sheet' : 'Curve Editor'}`; root.classList.toggle('dope', mode === 'dope'); },
    setActive(id, v) { const b = root.querySelector(`.mx-tb[data-id="${id}"]`); if (b) { b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); } },
    setStats(frame, value, enabled = true) { const fr = $('#mx-tv-frame'), va = $('#mx-tv-value'); for (const [el, v] of [[fr, frame], [va, value]]) { el.disabled = !enabled; if (document.activeElement !== el) el.value = enabled && v != null ? v : ''; } },
  };
  on2($('#mx-tv-frame'), 'change', e => A.statFrame?.(+e.target.value));
  on2($('#mx-tv-value'), 'change', e => A.statValue?.(+e.target.value));
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (b) {
      const id = b.dataset.action.replace(/^tv:/, '');
      if (b.dataset.off) { opts.shell?.prompt(`${b.title}: not used in this lab`); return; }
      A.tool?.(id, e); return;
    }
    const m = e.target.closest('[data-tvmenu]');
    if (m && opts.menus?.[m.dataset.tvmenu] && opts.shell) {
      const r = m.getBoundingClientRect(); m.classList.add('open');
      opts.shell.openPopup(r.left, r.bottom, opts.menus[m.dataset.tvmenu]());
    } else if (m) opts.shell?.prompt(`${m.dataset.tvmenu}: not used in this lab`);
  });
  api.setMode(o.mode);
  return api;
}
function on2(el, ev, fn) { el.addEventListener(ev, fn); }
