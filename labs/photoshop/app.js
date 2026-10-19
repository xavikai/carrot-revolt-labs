import { W, H, SHAPES, blank, brush, combine, polygonHas, raster, shapeMask, solved, startingState } from './core.js?v=2';
import { addDictionary, onLangChange, t } from '../../i18n.js';
import { isEmbeddedLab } from '../../lab-embed-core.js';
import dictionary from './i18n.js?v=2';
import { toolbarIcon, optionIcon, layerIcon } from './icons.js?v=4';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const STAGES = [
  { id: 'selection', name: 'Selections', sub: '5 short exercises', steps: [
    { id: 's_rect', title: 'The straight edge', aim: 'Select the rectangular card at the upper left.', how: ['Choose Marco rectangular (M).', 'Drag from one corner of the card to the opposite corner.'], hint: 'The card runs from about x 62 to 246 and y 65 to 174. A little extra margin is fine.' },
    { id: 's_ellipse', title: 'A round selection', aim: 'Select the round blue plate at the upper right.', how: ['Choose Marco elíptico from the M tool group.', 'Drag a box around the whole circle.'], hint: 'Start near the top left of the plate. Photoshop fits an ellipse inside your drag box.' },
    { id: 's_lasso', title: 'Follow a contour', aim: 'Select the yellow pennant at the lower left.', how: ['Choose Lazo (L).', 'Drag around the three corners and return to where you started.'], hint: 'Keep the pennant inside the line. It is okay if your freehand edge is not perfect.' },
    { id: 's_object', title: 'Find the object', aim: 'Select the orange mug, including its handle.', how: ['Choose Selección de objetos (W).', 'Click on the mug. Inspect the selected edge.'], hint: 'Click the solid body of the mug. The handle should be included automatically.' },
    { id: 's_quick', title: 'Subtract the extra', aim: 'The mug and plate are selected. Remove only the plate.', how: ['Choose Selección rápida from the W tool group.', 'Choose Restar in the options bar, then brush across the plate.'], hint: 'The mug must stay selected. Alt while brushing also subtracts.' },
  ] },
  { id: 'mask', name: 'Layer masks', sub: '4 short exercises', steps: [
    { id: 'm_create', title: 'Turn a selection into a mask', aim: 'The mug is already selected. Reveal it on the new background.', how: ['Look at the selected edge around the mug.', 'Click Añadir máscara de capa at the bottom of Capas.'], hint: 'The mask button is the rectangle with a circle inside. White reveals the mug; black hides the old photo.' },
    { id: 'm_hide', title: 'Black hides', aim: 'Remove the small patch of old blue background above the handle.', how: ['Click the mask thumbnail, not the photo thumbnail.', 'Choose Pincel (B), use black and paint over the blue patch.'], hint: 'The patch is above the handle, near the upper right of the mug. Paint on the mask with black.' },
    { id: 'm_restore', title: 'White reveals', aim: 'Restore the missing round part in the middle of the mug.', how: ['Keep the mask thumbnail active.', 'Switch to white with X and paint over the hole.'], hint: 'The hole is near the middle of the mug. White on a mask brings the original pixels back.' },
    { id: 'm_inspect', title: 'Read the mask', aim: 'Inspect the mask in black and white, then return to the image.', how: ['Alt-click the mask thumbnail (or use the View mask button).', 'Look for a white mug on black, then return to the image.'], hint: 'Alt-click the small black and white thumbnail in Capas. The photo layer is still intact.' },
  ] },
];
const ALL = STAGES.flatMap(s => s.steps);
const stepById = id => ALL.find(s => s.id === id);
const TOOL = { rect: 'Herramienta Marco rectangular', ellipse: 'Herramienta Marco elíptico', row: 'Herramienta Marco fila única', column: 'Herramienta Marco columna única', selectionBrush: 'Pincel de selección', lasso: 'Herramienta Lazo', polygon: 'Herramienta Lazo poligonal', magnetic: 'Herramienta Lazo magnético', object: 'Herramienta Selección de objetos', quick: 'Herramienta Selección rápida', wand: 'Herramienta Varita mágica', brush: 'Herramienta Pincel' };
const GROUPS = { marquee: ['rect', 'ellipse', 'row', 'column'], lasso: ['selectionBrush', 'lasso', 'polygon', 'magnetic'], selection: ['object', 'quick', 'wand'] };
const GHOSTS = { before: ['move'], middle: ['crop', 'frame', 'eyedropper', 'heal'], afterBrush: ['stamp', 'history', 'eraser', 'gradient', 'blur', 'smudge', 'dodge', 'pen', 'text', 'path', 'shape', 'hand', 'zoom', 'more'] };
const store = {
  get(k, fallback) { try { const v = localStorage.getItem('carrot-revolt-ps:' + k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-ps:' + k, JSON.stringify(v)); } catch { /* unavailable */ } },
};
let done = store.get('done', {});
let currentId = stepById(store.get('step', 's_rect')) ? store.get('step', 's_rect') : 's_rect';
let state, undo = [], drag = null, polygonPoints = null, polygonHover = null, theme = 'peach', feedback = '', feedbackGood = false, statusMessage = '', openGroup = null;
const groupCurrent = { marquee: 'rect', lasso: 'selectionBrush', selection: 'object' };
const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
const sceneCtx = scene.getContext('2d');
const display = $('#canvas'), ctx = display.getContext('2d');
const sourceMask = shapeMask('mug');
const selOverlay = document.createElement('canvas'); selOverlay.width = W; selOverlay.height = H;
const maskCanvas = document.createElement('canvas'); maskCanvas.width = W; maskCanvas.height = H;
const maskedScene = document.createElement('canvas'); maskedScene.width = W; maskedScene.height = H;

function drawSource() {
  const c = sceneCtx;
  const wall = c.createLinearGradient(0, 0, W, H);
  wall.addColorStop(0, '#143b50'); wall.addColorStop(.55, '#2c6b75'); wall.addColorStop(1, '#82a5a0');
  c.fillStyle = wall; c.fillRect(0, 0, W, H);
  c.fillStyle = '#ffffff0a'; for (let x = 28; x < W; x += 60) c.fillRect(x, 0, 2, 248);
  const glow = c.createRadialGradient(410, 95, 5, 410, 95, 290);
  glow.addColorStop(0, '#ffffff33'); glow.addColorStop(1, '#ffffff00'); c.fillStyle = glow; c.fillRect(0, 0, W, 255);
  c.fillStyle = '#1f4c56'; c.fillRect(0, 320, W, 80); c.fillStyle = '#99c8c1'; c.fillRect(0, 318, W, 3);
  c.fillStyle = '#0d2d38'; c.fillRect(58, 65, 192, 116); c.fillStyle = '#f4e7d2'; c.fillRect(62, 65, 184, 109);
  c.fillStyle = '#e56b4b'; c.fillRect(69, 73, 50, 93); c.fillStyle = '#204758'; c.fillRect(127, 75, 110, 90);
  c.fillStyle = '#e8c393'; c.fillRect(137, 85, 42, 42); c.fillStyle = '#ef7752'; c.beginPath(); c.arc(210, 133, 19, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#edf1df'; c.font = '700 11px system-ui'; c.fillText('STUDIO', 135, 148); c.font = '9px system-ui'; c.fillText('FORM / COLOUR', 135, 160);
  c.fillStyle = '#102e39'; c.beginPath(); c.ellipse(516, 147, 65, 65, 0, 0, Math.PI * 2); c.fill();
  const plate = c.createRadialGradient(501, 125, 10, 516, 142, 61); plate.addColorStop(0, '#a7dfe3'); plate.addColorStop(.55, '#417895'); plate.addColorStop(1, '#183e61');
  c.fillStyle = plate; c.beginPath(); c.arc(516, 142, 62, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#9bc6d5'; c.lineWidth = 6; c.beginPath(); c.arc(516, 142, 44, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#d8e3d8'; c.beginPath(); c.arc(516, 142, 14, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#db973b'; c.beginPath(); c.moveTo(69, 252); c.lineTo(218, 266); c.lineTo(115, 340); c.closePath(); c.fill();
  c.strokeStyle = '#f6d484'; c.lineWidth = 5; c.beginPath(); c.moveTo(70, 252); c.lineTo(116, 338); c.stroke();
  c.fillStyle = '#e9bf69'; c.font = '700 13px system-ui'; c.fillText('MAKE / PLAY', 83, 277);
  c.fillStyle = '#092c37'; c.beginPath(); c.ellipse(364, 327, 123, 16, 0, 0, Math.PI * 2); c.fill();
  // The visible mug is drawn through the same silhouette used by the Object Selection tool.
  const mug = document.createElement('canvas'); mug.width = W; mug.height = H; const m = mug.getContext('2d');
  const color = m.createLinearGradient(274, 130, 440, 300); color.addColorStop(0, '#ffd193'); color.addColorStop(.2, '#ed9051'); color.addColorStop(.73, '#bb4d39'); color.addColorStop(1, '#793847');
  m.fillStyle = color; m.fillRect(270, 120, 188, 200);
  m.fillStyle = '#f6b66f'; m.beginPath(); m.ellipse(339, 139, 64, 15, 0, 0, Math.PI * 2); m.fill();
  m.strokeStyle = '#6d3440'; m.lineWidth = 4; m.beginPath(); m.ellipse(339, 139, 54, 7, 0, 0, Math.PI * 2); m.stroke();
  m.fillStyle = '#ffffff48'; m.beginPath(); m.ellipse(309, 218, 12, 82, -.08, 0, Math.PI * 2); m.fill();
  m.strokeStyle = '#ffe0ab80'; m.lineWidth = 8; m.beginPath(); m.ellipse(410, 205, 42, 53, 0, -.9, 1.1); m.stroke();
  m.fillStyle = '#ffe2a5'; m.font = '800 30px system-ui'; m.fillText('06', 319, 236);
  m.fillStyle = '#f6d5a6'; m.font = '700 10px system-ui'; m.fillText(isEmbeddedLab(location.href, window.self !== window.top) ? 'LAB' : 'Carrot Revolt Labs', 317, 252);
  m.globalCompositeOperation = 'destination-in'; m.drawImage(maskToCanvas(sourceMask), 0, 0); m.globalCompositeOperation = 'source-over';
  c.drawImage(mug, 0, 0);
  c.fillStyle = '#ffffff88'; c.font = '600 9px system-ui'; c.fillText('A STUDY IN FORM', 26, 383);
}

function maskToCanvas(mask, target = document.createElement('canvas')) {
  target.width = W; target.height = H;
  const g = target.getContext('2d'), im = g.createImageData(W, H);
  for (let i = 0; i < mask.length; i++) { const j = i * 4; im.data[j] = im.data[j + 1] = im.data[j + 2] = 255; im.data[j + 3] = mask[i]; }
  g.putImageData(im, 0, 0); return target;
}

function drawReplacement() {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (theme === 'peach') { bg.addColorStop(0, '#f3d4b9'); bg.addColorStop(1, '#eeb491'); }
  else { bg.addColorStop(0, '#223455'); bg.addColorStop(1, '#536b87'); }
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = theme === 'peach' ? '#fff5e637' : '#ffffff12';
  ctx.beginPath(); ctx.arc(525, 130, 150, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = theme === 'peach' ? '#b2765844' : '#bcd5ff44'; ctx.lineWidth = 2;
  for (let x = -H; x < W + H; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
}

function drawSelection(mask) {
  const g = selOverlay.getContext('2d'), im = g.createImageData(W, H), a = im.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!mask[i]) continue;
    const j = i * 4;
    const edge = x === 0 || x === W - 1 || y === 0 || y === H - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W];
    if (edge) { const light = ((x + y) % 8) < 4; a[j] = a[j + 1] = a[j + 2] = light ? 255 : 12; a[j + 3] = 255; }
    else { a[j] = 90; a[j + 1] = 190; a[j + 2] = 255; a[j + 3] = 28; }
  }
  g.putImageData(im, 0, 0); ctx.drawImage(selOverlay, 0, 0);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (state.viewMask && state.mask) {
    const im = ctx.createImageData(W, H);
    for (let i = 0; i < state.mask.length; i++) { const j = i * 4; im.data[j] = im.data[j + 1] = im.data[j + 2] = state.mask[i]; im.data[j + 3] = 255; }
    ctx.putImageData(im, 0, 0);
  } else if (state.mask) {
    drawReplacement();
    const g = maskedScene.getContext('2d'); g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; g.drawImage(scene, 0, 0);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(maskToCanvas(state.mask, maskCanvas), 0, 0); g.globalCompositeOperation = 'source-over';
    ctx.drawImage(maskedScene, 0, 0);
  } else ctx.drawImage(scene, 0, 0);
  if (!state.viewMask) drawSelection(state.selection);
  if (drag && ['rect', 'ellipse', 'lasso', 'magnetic'].includes(drag.kind)) {
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    if (drag.kind === 'rect') ctx.strokeRect(drag.x, drag.y, drag.to.x - drag.x, drag.to.y - drag.y);
    else if (drag.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse((drag.x + drag.to.x) / 2, (drag.y + drag.to.y) / 2, Math.abs(drag.to.x - drag.x) / 2 || 1, Math.abs(drag.to.y - drag.y) / 2 || 1, 0, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.beginPath(); drag.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
    ctx.restore();
  }
  if (polygonPoints?.length) {
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); polygonPoints.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); if (polygonHover) ctx.lineTo(polygonHover.x, polygonHover.y); ctx.stroke(); ctx.restore();
  }
}

function currentStep() { return stepById(currentId); }
function currentStage() { return STAGES.find(s => s.steps.some(p => p.id === currentId)); }
function say(message, good = false) { feedback = message; statusMessage = message; feedbackGood = good; $('#status-msg').textContent = t(message); renderCard(); }
function setStep(id) {
  currentId = id; store.set('step', id); state = { ...startingState(id), maskCreated: false, maskPainted: false, maskViewed: false, viewMask: false, activeThumb: id.startsWith('m_') && id !== 'm_create' ? 'mask' : 'image', foreground: 0, brushRadius: 22 };
  for (const [group, members] of Object.entries(GROUPS)) if (members.includes(state.tool)) groupCurrent[group] = state.tool;
  openGroup = null;
  undo = []; drag = null; polygonPoints = null; polygonHover = null; feedback = ''; statusMessage = ''; render();
}
function snapshot() {
  undo.push({ ...state, selection: state.selection.slice(), mask: state.mask?.slice() || null });
  if (undo.length > 24) undo.shift();
}
function undoStep() { if (!undo.length) return say('Nothing to undo yet.'); state = undo.pop(); render(); say('Undone.'); }
function makeSelection(part, mode = state.mode) { state.selection = combine(state.selection, part, mode); render(); }
function toolChange(tool) { state.tool = tool; for (const [group, members] of Object.entries(GROUPS)) if (members.includes(tool)) groupCurrent[group] = tool; openGroup = null; polygonPoints = null; polygonHover = null; if (tool === 'brush' && !state.mask) say('Add a layer mask before painting it.'); render(); }
function selectObjectAt(x, y, mode) {
  const shape = ['mug', 'plate', 'card', 'pennant'].find(k => SHAPES[k](x, y));
  if (!shape) return say('Click inside one of the visible objects.');
  snapshot(); makeSelection(shapeMask(shape), mode);
}
function quickAt(x, y) {
  const shape = ['mug', 'plate', 'card', 'pennant'].find(k => SHAPES[k](x, y));
  if (!shape || drag.seen.has(shape)) return;
  if (!drag.seen.size) snapshot();
  drag.seen.add(shape);
  makeSelection(shapeMask(shape), drag.mode);
  // Subsequent regions in the same brush stroke keep the first region.
  if (drag.mode === 'new') drag.mode = 'add';
}
function paintAt(x, y) {
  if (!state.mask) return say('Add a layer mask first.');
  if (state.activeThumb !== 'mask') return say('Click the mask thumbnail in Capas before painting.');
  state.mask = brush(state.mask, x, y, state.brushRadius, state.foreground); state.maskPainted = true; draw();
}
function selectionBrushAt(x, y) {
  drag.stroke = brush(drag.stroke, x, y, Math.max(8, state.brushRadius / 2), 255);
  state.selection = combine(drag.base, drag.stroke, drag.mode);
  draw();
}
function finishPolygon() {
  if (!polygonPoints || polygonPoints.length < 3) return;
  const points = polygonPoints; polygonPoints = null; polygonHover = null;
  snapshot(); makeSelection(raster((x, y) => polygonHas(points, x, y)));
}
function pos(e) {
  const r = display.getBoundingClientRect();
  return { x: Math.max(0, Math.min(W - 1, (e.clientX - r.left) * W / r.width)), y: Math.max(0, Math.min(H - 1, (e.clientY - r.top) * H / r.height)) };
}
display.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const p = pos(e); display.setPointerCapture(e.pointerId);
  if (state.tool === 'object' || state.tool === 'wand') { selectObjectAt(p.x, p.y, e.altKey ? 'subtract' : state.mode); return; }
  if (state.tool === 'row' || state.tool === 'column') { const line = state.tool === 'row' ? Math.floor(p.y) : Math.floor(p.x); snapshot(); makeSelection(raster((x, y) => state.tool === 'row' ? y === line : x === line), e.altKey ? 'subtract' : state.mode); return; }
  if (state.tool === 'polygon') { if (!polygonPoints) polygonPoints = []; if (e.detail >= 2 && polygonPoints.length >= 2) finishPolygon(); else { polygonPoints.push(p); polygonHover = p; draw(); } return; }
  if (state.tool === 'selectionBrush') { snapshot(); drag = { kind: 'selectionBrush', base: state.selection.slice(), stroke: blank(), mode: e.altKey ? 'subtract' : state.mode }; selectionBrushAt(p.x, p.y); return; }
  if (state.tool === 'quick') { drag = { kind: 'quick', seen: new Set(), mode: e.altKey ? 'subtract' : state.mode }; quickAt(p.x, p.y); return; }
  if (state.tool === 'brush') { if (!state.mask || state.activeThumb !== 'mask') { paintAt(p.x, p.y); return; } snapshot(); drag = { kind: 'brush', last: p }; paintAt(p.x, p.y); return; }
  drag = { kind: state.tool, x: p.x, y: p.y, to: p, points: [p] }; draw();
});
display.addEventListener('pointermove', e => {
  if (!drag) { if (polygonPoints) { polygonHover = pos(e); draw(); } return; } const p = pos(e);
  if (drag.kind === 'selectionBrush') { selectionBrushAt(p.x, p.y); return; }
  if (drag.kind === 'quick') { quickAt(p.x, p.y); return; }
  if (drag.kind === 'brush') {
    const from = drag.last, n = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / Math.max(2, state.brushRadius / 3)));
    for (let i = 1; i <= n; i++) paintAt(from.x + (p.x - from.x) * i / n, from.y + (p.y - from.y) * i / n);
    drag.last = p; return;
  }
  drag.to = p;
  if (['lasso', 'magnetic'].includes(drag.kind) && Math.hypot(p.x - drag.points.at(-1).x, p.y - drag.points.at(-1).y) > 3) drag.points.push(p);
  draw();
});
function endDrag(e) {
  if (!drag) return; const d = drag; drag = null;
  if (d.kind === 'brush' || d.kind === 'quick' || d.kind === 'selectionBrush') { render(); return; }
  const p = pos(e); let part;
  if (d.kind === 'rect') part = raster((x, y) => x >= Math.min(d.x, p.x) && x <= Math.max(d.x, p.x) && y >= Math.min(d.y, p.y) && y <= Math.max(d.y, p.y));
  else if (d.kind === 'ellipse') { const cx = (d.x + p.x) / 2, cy = (d.y + p.y) / 2, rx = Math.abs(d.x - p.x) / 2, ry = Math.abs(d.y - p.y) / 2; if (rx < 2 || ry < 2) return draw(); part = raster((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1); }
  else { d.points.push(p); if (d.points.length < 3) return draw(); part = raster((x, y) => polygonHas(d.points, x, y)); }
  snapshot(); makeSelection(part, e.altKey ? 'subtract' : state.mode);
}
display.addEventListener('pointerup', endDrag);
display.addEventListener('pointercancel', () => { drag = null; draw(); });

function addMask() {
  if (state.mask) return say('This layer already has a mask.');
  if (!state.selection.some(Boolean)) return say('Make a selection before adding a mask.');
  snapshot(); state.mask = state.selection.slice(); state.selection = blank(); state.maskCreated = true; state.activeThumb = 'mask'; render(); say('Layer mask added. White reveals; black hides.', true);
}
function toggleViewMask() { if (!state.mask) return say('Add a mask first.'); state.viewMask = !state.viewMask; if (state.viewMask) state.maskViewed = true; state.activeThumb = 'mask'; render(); }
function updateMaskThumb() {
  const b = $('#mask-thumb'); b.hidden = !state.mask; if (!state.mask) return;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 40; const g = cv.getContext('2d'); g.fillStyle = '#050505'; g.fillRect(0, 0, 64, 40);
  g.drawImage(maskToCanvas(state.mask, maskCanvas), 0, 0, 64, 40); b.style.backgroundImage = `url(${cv.toDataURL()})`; b.style.backgroundSize = 'cover';
}
function check() {
  if (solved(currentId, state)) { done[currentId] = true; store.set('done', done); renderGuide(); say('Good. The result is ready; continue when you want.', true); }
  else if (currentId.startsWith('m_') && state.activeThumb !== 'mask' && currentId !== 'm_create') say('Select the mask thumbnail in Capas.');
  else if (currentId.startsWith('s_') && state.tool !== startingState(currentId).tool) say('Choose the tool named in this step first.');
  else say('Almost. Compare the selected area with the target and try again.');
}
function solution() {
  snapshot();
  const id = currentId;
  if (id.startsWith('s_')) { state.selection = shapeMask(({ s_rect: 'card', s_ellipse: 'plate', s_lasso: 'pennant', s_object: 'mug', s_quick: 'mug' })[id]); state.tool = startingState(id).tool; }
  else if (id === 'm_create') { state.mask = shapeMask('mug'); state.selection = blank(); state.maskCreated = true; state.activeThumb = 'mask'; }
  else if (id === 'm_hide' || id === 'm_restore') { state.mask = shapeMask('mug'); state.maskPainted = true; state.activeThumb = 'mask'; }
  else { state.maskViewed = true; state.viewMask = false; state.activeThumb = 'mask'; }
  render(); say('One possible solution is shown. Compare it with your attempt.');
}

function renderStages() {
  $('#stage-switch').innerHTML = `<span class="control-label">${t('STAGE')}</span>` + STAGES.map(s => `<button type="button" class="model-button ${currentStage().id === s.id ? 'active' : ''}" data-stage="${s.id}">${t(s.name)}<small>${t(s.sub)}</small></button>`).join('');
}
function renderGuide() {
  $('#guide').innerHTML = currentStage().steps.map((s, i) => `<li class="${currentId === s.id ? 'current' : ''} ${done[s.id] ? 'done' : ''}" data-step="${s.id}" tabindex="0" role="button" aria-label="${t(s.title)}"><b>${done[s.id] ? '✓' : i + 1}</b><span><strong>${t(s.title)}</strong><small>${t(s.aim)}</small></span></li>`).join('');
}
function renderCard() {
  const s = currentStep(), n = ALL.indexOf(s);
  $('#step-card').innerHTML = `<div><span class="step-tag">${t(currentStage().name)} · ${currentStage().steps.indexOf(s) + 1}/${currentStage().steps.length}</span><h3>${t(s.title)}</h3><p>${t(s.aim)}</p><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol><p class="step-feedback ${feedbackGood ? 'good' : ''}" role="status">${feedback ? t(feedback) : ''}</p></div><div class="step-actions"><button type="button" data-act="prev" ${n === 0 ? 'disabled' : ''}>${t('Previous')}</button><button type="button" data-act="reset">${t('Reset step')}</button><button type="button" data-act="hint">${t('Hint')}</button><button type="button" data-act="solution">${t('Show a solution')}</button><button type="button" class="primary" data-act="check">${t('Check')}</button><button type="button" class="next" data-act="next" ${n === ALL.length - 1 ? 'disabled' : ''}>${t('Next step')} →</button></div>`;
}
function renderToolbar() {
  const ghost = name => `<span class="ps-tool-ghost" aria-hidden="true">${toolbarIcon(name)}</span>`;
  const plain = name => `<button type="button" class="ps-tool" data-tool="${name}" title="${TOOL[name]}" aria-label="${TOOL[name]}" aria-pressed="${state.tool === name}">${toolbarIcon(name)}<span class="ps-tool-corner" aria-hidden="true"></span></button>`;
  const group = name => {
    const selected = groupCurrent[name], members = GROUPS[name], active = members.includes(state.tool);
    const title = name === 'marquee' ? 'Marco' : name === 'lasso' ? 'Lazo' : 'selección';
    return `<div class="ps-tool-group"><button type="button" class="ps-tool" data-tool="${selected}" title="${TOOL[selected]}" aria-label="${TOOL[selected]}" aria-pressed="${active}">${toolbarIcon(selected)}</button><button type="button" class="ps-group-caret" data-group-toggle="${name}" aria-label="Mostrar herramientas de ${title}" aria-expanded="${openGroup === name}"></button>${openGroup === name ? `<div class="ps-tool-flyout" role="menu">${members.map(k => `<button type="button" data-tool="${k}" role="menuitemradio" aria-checked="${state.tool === k}">${toolbarIcon(k)}<span>${TOOL[k]}</span>${['rect', 'ellipse'].includes(k) ? '<kbd>M</kbd>' : name === 'lasso' ? '<kbd>L</kbd>' : name === 'selection' ? '<kbd>W</kbd>' : ''}</button>`).join('')}</div>` : ''}</div>`;
  };
  $('#toolbar').innerHTML = GHOSTS.before.map(ghost).join('') + group('marquee') + group('lasso') + group('selection') + GHOSTS.middle.map(ghost).join('') + plain('brush') + GHOSTS.afterBrush.map(ghost).join('') + `<button type="button" id="swap-color" class="ps-swatch-control" title="Intercambiar negro y blanco (X)" aria-label="Intercambiar negro y blanco"><span class="ps-swatch-back" style="background:${state.foreground ? '#111' : '#fff'}"></span><span class="ps-swatch-front" style="background:${state.foreground ? '#fff' : '#111'}"></span></button>`;
  $('#tool-name').textContent = TOOL[state.tool];
  $('#current-tool-icon').innerHTML = toolbarIcon(state.tool);
  $('#selection-modes').innerHTML = [['new','Selección nueva'],['add','Añadir a la selección'],['subtract','Restar de la selección'],['intersect','Formar intersección con la selección']].map(([mode,label]) => `<button type="button" data-mode="${mode}" title="${label}" aria-label="${label}" aria-pressed="${state.mode === mode}">${optionIcon(mode)}</button>`).join('');
  $('#selection-modes').hidden = state.tool === 'brush';
  $('#feather-field').hidden = state.tool === 'brush'; $('#smooth-field').hidden = state.tool === 'brush'; $('#style-field').hidden = state.tool === 'brush';
  $('#brush-size-field').hidden = state.tool !== 'brush'; $('#brush-size').value = state.brushRadius; $('#brush-size-value').textContent = `${state.brushRadius} px`;
  $('#tool-note').textContent = state.tool === 'brush' ? (state.foreground ? t('White reveals on a mask.') : t('Black hides on a mask.')) : t('Alt subtracts · Ctrl+D deselects');
}
function renderPanels() {
  $('#properties-text').textContent = state.mask ? t('The original photo is still here. Edit the black and white mask to control what remains visible.') : t('A selection marks where the next edit will apply. It has not changed the pixels yet.');
  $('#background-label').textContent = t(theme === 'peach' ? 'Peach' : 'Blue'); $('#background-button').dataset.theme = theme;
  $('#image-thumb').setAttribute('aria-pressed', String(state.activeThumb === 'image'));
  $('#mask-thumb').setAttribute('aria-pressed', String(state.activeThumb === 'mask'));
  $('#mask-thumb').title = state.viewMask ? 'Alt+clic para volver a la imagen' : 'Alt+clic para ver la máscara';
  $('#doc-hint').textContent = state.viewMask ? t('Mask view: white visible · black hidden') : state.mask ? t('Layer mask active') : t('Original image');
  $('#status-keys').textContent = t('M marquee · L lasso · W select · B brush · X black/white');
  $('#status-msg').textContent = statusMessage ? t(statusMessage) : '';
  $('#view-mask-button').setAttribute('aria-pressed', String(state.viewMask));
  updateMaskThumb();
}
function render() { renderStages(); renderGuide(); renderCard(); renderToolbar(); renderPanels(); draw(); }

$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (b) setStep(STAGES.find(s => s.id === b.dataset.stage).steps[0].id); });
$('#guide').addEventListener('click', e => { const item = e.target.closest('[data-step]'); if (item) setStep(item.dataset.step); });
$('#guide').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const item = e.target.closest('[data-step]'); if (item) { e.preventDefault(); setStep(item.dataset.step); } } });
$('#step-card').addEventListener('click', e => {
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  const i = ALL.findIndex(s => s.id === currentId);
  if (act === 'prev' && i > 0) setStep(ALL[i - 1].id);
  else if (act === 'next' && i < ALL.length - 1) setStep(ALL[i + 1].id);
  else if (act === 'reset') setStep(currentId);
  else if (act === 'hint') say(currentStep().hint);
  else if (act === 'solution') solution();
  else if (act === 'check') check();
});
$('#toolbar').addEventListener('click', e => { const toggle = e.target.closest('[data-group-toggle]'); if (toggle) { openGroup = openGroup === toggle.dataset.groupToggle ? null : toggle.dataset.groupToggle; renderToolbar(); return; } const b = e.target.closest('[data-tool]'); if (b) toolChange(b.dataset.tool); else if (e.target.closest('#swap-color')) { state.foreground = state.foreground ? 0 : 255; render(); } });
$('#toolbar').addEventListener('contextmenu', e => { const button = e.target.closest('.ps-tool-group'); if (!button) return; e.preventDefault(); openGroup = button.querySelector('[data-group-toggle]').dataset.groupToggle; renderToolbar(); });
$('#tool-options-button').addEventListener('click', () => { const group = Object.keys(GROUPS).find(k => GROUPS[k].includes(state.tool)); if (group) { openGroup = openGroup === group ? null : group; renderToolbar(); } });
document.addEventListener('click', e => { if (openGroup && !e.target.closest('.ps-tool-group, #tool-options-button')) { openGroup = null; renderToolbar(); } });
$('#selection-modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) { state.mode = b.dataset.mode; render(); } });
$('#brush-size').addEventListener('input', e => { state.brushRadius = Number(e.target.value); $('#brush-size-value').textContent = `${state.brushRadius} px`; });
$('#add-mask-button').addEventListener('click', addMask);
$('#undo-button').addEventListener('click', undoStep);
$('#deselect-button').addEventListener('click', () => { snapshot(); state.selection = blank(); render(); });
$('#image-thumb').addEventListener('click', () => { state.activeThumb = 'image'; render(); });
$('#mask-thumb').addEventListener('click', e => { if (e.altKey) toggleViewMask(); else { state.activeThumb = 'mask'; render(); } });
$('#view-mask-button').addEventListener('click', toggleViewMask);
$('#background-button').addEventListener('click', () => { theme = theme === 'peach' ? 'blue' : 'peach'; render(); });
window.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const key = e.key.toLowerCase();
  if (polygonPoints && key === 'enter') { e.preventDefault(); finishPolygon(); return; }
  if (polygonPoints && key === 'escape') { polygonPoints = null; polygonHover = null; draw(); return; }
  if (e.ctrlKey && key === 'd') { e.preventDefault(); snapshot(); state.selection = blank(); render(); }
  else if (e.ctrlKey && key === 'z') { e.preventDefault(); undoStep(); }
  else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (key === 'm') toolChange(e.shiftKey ? GROUPS.marquee[(GROUPS.marquee.indexOf(groupCurrent.marquee) + 1) % GROUPS.marquee.length] : 'rect');
    else if (key === 'l') toolChange(e.shiftKey ? GROUPS.lasso[(GROUPS.lasso.indexOf(groupCurrent.lasso) + 1) % GROUPS.lasso.length] : 'lasso');
    else if (key === 'w') toolChange(e.shiftKey ? GROUPS.selection[(GROUPS.selection.indexOf(groupCurrent.selection) + 1) % GROUPS.selection.length] : 'object');
    else if (key === 'b') toolChange('brush');
    else if (key === 'x') { state.foreground = state.foreground ? 0 : 255; render(); }
  }
});
onLangChange(render);
document.querySelectorAll('[data-panel-icon]').forEach(el => { el.innerHTML = layerIcon(el.dataset.panelIcon); });
$('#add-mask-button').innerHTML = layerIcon('mask');
$('.ps-home').innerHTML = optionIcon('home');
drawSource(); setStep(currentId);
