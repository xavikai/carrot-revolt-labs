// Lighting Lab: a small studio with a plaster bust. Lights are placed around the subject (Azimuth,
// Elevation, Distance, always aimed at it), measured with a light meter and rendered progressively.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { TARGETS, CAMERA, PROBES, HDRIS, FALSE_COLOR, lightPos, lightDir, lightFrame, apparentSize, measure, ratioLabel, stopsOf, luminance, MIDDLE_GREY, rad, deg } from './light.js?v=1';
import { buildSet, applySet, Rig, World, Progressive } from './scene.js?v=5';
import { parseModel, fitModel } from './models.js?v=2';
import { STAGES, startState, referenceState, LIGHT_IDS, LIGHT_NAMES } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-light:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-light:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, m: null, flags: {}, undo: [], redo: [],
  done: store.get('done', {}), hover: false, view: 'persp', probes: false, samples: store.get('samples', 64), ref: null,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}
const fmtStops = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;

// ─── Viewport (interactive) ──────────────────────────────────────────────────
const vCanvas = $('#view'), vHost = $('#view-host');
const vr = new THREE.WebGLRenderer({ canvas: vCanvas, antialias: true });
vr.setPixelRatio(Math.min(2, devicePixelRatio || 1));
vr.shadowMap.enabled = true; vr.shadowMap.type = THREE.PCFSoftShadowMap;
const vScene = new THREE.Scene();
const vSet = buildSet(vScene), vRig = new Rig(vScene, { shadowSize: 1024 }), vWorld = new World(vr, vScene);
const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
persp.position.set(3.2, 2.6, 3.6);
const top = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 50);
top.position.set(0, 20, 0.2); top.up.set(0, 0, -1); top.lookAt(0, 0, 0.2);
const controls = new OrbitControls(persp, vCanvas);
controls.target.set(0, 1.35, 0); controls.update();
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
controls.addEventListener('change', () => { vDirty = true; });
vCanvas.addEventListener('pointerdown', e => { if (e.button === 0 && e.altKey) controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; }, true);
window.addEventListener('pointerup', () => { controls.mouseButtons.LEFT = null; });
// the floor of the studio and a grid
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001; floor.receiveShadow = true; vScene.add(floor);
const grid = new THREE.GridHelper(12, 24, 0x555555, 0x333333); vScene.add(grid);
const gizmos = new THREE.Group(); vScene.add(gizmos);
let vDirty = true;

// Light gizmos: the shape of each light, a line to its target, the camera frustum.
const matLine = c => new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true });
function lineObj(points, color, dashed) {
  const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.05, gapSize: 0.04, depthTest: false, transparent: true }) : matLine(color);
  const l = new THREE.Line(g, m); if (dashed) l.computeLineDistances(); l.renderOrder = 10; return l;
}
function circle(c, u, v, r, n = 24) { const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pts.push(c.map((x, k) => x + (u[k] * Math.cos(a) + v[k] * Math.sin(a)) * r)); } return pts; }
function lightGizmo(id, l, selected) {
  const g = new THREE.Group(), col = !l.on ? 0x555555 : selected ? 0xffa629 : 0xdddddd;
  const pos = l.type === 'SUN' ? TARGETS.head.map((x, k) => x + lightDir(l)[k] * 2.2) : lightPos(l), { u, v, w } = lightFrame(l);
  const target = l.card ? TARGETS.head : TARGETS[l.target || 'head'];
  if (l.card) {
    const s = l.size / 2, c = pos, P = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => c.map((x, k) => x + (u[k] * a + v[k] * b) * s));
    g.add(lineObj(P, col));
  } else if (l.type === 'AREA') {
    const sx = l.size / 2, sy = (l.shape === 'RECTANGLE' ? l.sizeY : l.size) / 2;
    g.add(lineObj(l.shape === 'DISK' ? circle(pos, u, v, sx) : [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => pos.map((x, k) => x + (u[k] * a * sx + v[k] * b * sy))), col));
    g.add(lineObj([pos, pos.map((x, k) => x + w[k] * 0.3)], col));
  } else if (l.type === 'SPOT') {
    const len = Math.min(0.6, l.dist * 0.6), r = Math.tan(Math.min(rad(l.spotSize) / 2, 1.3)) * len, base = pos.map((x, k) => x + w[k] * len);
    g.add(lineObj(circle(base, u, v, r), col));
    for (const a of [0, 1, 2, 3]) { const an = a * Math.PI / 2; g.add(lineObj([pos, base.map((x, k) => x + (u[k] * Math.cos(an) + v[k] * Math.sin(an)) * r)], col)); }
  } else if (l.type === 'SUN') {
    g.add(lineObj(circle(pos, u, v, 0.1), col));
    for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4, d = u.map((x, k) => x * Math.cos(an) + v[k] * Math.sin(an)); g.add(lineObj([pos.map((x, k) => x + d[k] * 0.14), pos.map((x, k) => x + d[k] * 0.22)], col)); }
    g.add(lineObj([pos, pos.map((x, k) => x + w[k] * 0.6)], col));
  } else {
    g.add(lineObj(circle(pos, u, v, Math.max(0.04, l.radius)), col)); g.add(lineObj(circle(pos, u, w, Math.max(0.04, l.radius)), col));
  }
  if (l.type !== 'SUN' || l.card) g.add(lineObj([pos, target], col, true));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
  dot.position.set(...pos); dot.renderOrder = 11; g.add(dot);
  g.userData = { id, pos };
  return g;
}
function updateGizmos() {
  for (const c of [...gizmos.children]) { gizmos.remove(c); c.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
  for (const id of LIGHT_IDS) gizmos.add(lightGizmo(id, S.st.lights[id], S.st.sel === id));
  const c = S.st.card; if (c.on) gizmos.add(lightGizmo('card', { ...c, card: true, on: true, type: 'AREA', target: 'head' }, S.st.sel === 'card'));
  // camera
  const cp = CAMERA.pos, ct = CAMERA.target, f = [ct[0] - cp[0], ct[1] - cp[1], ct[2] - cp[2]], fl = Math.hypot(...f), fw = f.map(x => x / fl);
  const r = [fw[2], 0, -fw[0]].map(x => -x), up = [0, 1, 0], h = Math.tan(rad(CAMERA.fov / 2)) * 0.5, wv = h * 1.5;
  const corner = (a, b) => cp.map((x, k) => x + fw[k] * 0.5 + r[k] * a * wv + up[k] * b * h);
  const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  gizmos.add(lineObj([...cs, cs[0]], 0x6ad1ff)); for (const q of cs) gizmos.add(lineObj([cp, q], 0x6ad1ff));
  if (S.probes) for (const [k, p] of Object.entries(PROBES)) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: k.startsWith('back') ? 0x56d364 : k.startsWith('rim') ? 0xffd24a : 0xff6bd5, depthTest: false })); m.position.set(...p.p); m.renderOrder = 12; gizmos.add(m); }
  vDirty = true;
}
function resizeView() {
  const r = vHost.getBoundingClientRect(); if (!r.width || !r.height) return;
  vr.setSize(r.width, r.height, false); persp.aspect = r.width / r.height; persp.updateProjectionMatrix();
  const hh = 2.2, hw = hh * r.width / r.height; Object.assign(top, { left: -hw, right: hw, top: hh, bottom: -hh }); top.updateProjectionMatrix();
  vDirty = true;
}
const viewCam = () => S.view === 'top' ? top : persp;

// ─── Render (progressive) ────────────────────────────────────────────────────
const rCanvas = $('#render'), rHost = $('#render-host');
const RW = 640, RH = 440;
const rr = new THREE.WebGLRenderer({ canvas: rCanvas, antialias: false, preserveDrawingBuffer: true });
rr.setPixelRatio(1); rr.setSize(RW, RH, false);
rr.shadowMap.enabled = true; rr.shadowMap.type = THREE.PCFShadowMap;
const rScene = new THREE.Scene();
const rSet = buildSet(rScene), rRig = new Rig(rScene, { shadowSize: 2048 }), rWorld = new World(rr, rScene);
const rCam = new THREE.PerspectiveCamera(CAMERA.fov, RW / RH, 0.05, 100);
rCam.position.set(...CAMERA.pos); rCam.lookAt(...CAMERA.target);
const prog = new Progressive(rr, RW, RH);
function syncScenes() {
  const s = S.st;
  applySet(vSet, s); applySet(rSet, s);
  vRig.sync(s); rRig.sync(s);
  vWorld.sync(s.world, false); rWorld.sync(s.world, true);
  vScene.background = new THREE.Color(0x2b2c2f);
  vr.toneMapping = s.view.transform === 'Standard' ? THREE.NoToneMapping : THREE.AgXToneMapping; vr.toneMappingExposure = Math.pow(2, s.view.exposure);
  prog.reset(); vDirty = true;
}
function renderLoop() {
  if (vDirty) { vDirty = false; vr.render(vScene, viewCam()); }
  if (prog.n < S.samples) {
    const t0 = performance.now();
    do { rRig.jitter(prog.n); prog.add(rScene, rCam); } while (prog.n < S.samples && performance.now() - t0 < 12);
    prog.show(S.st.view.exposure, S.st.view.transform);
    $('#samples').textContent = `${t('Sample')} ${prog.n} / ${S.samples}`;
  }
  requestAnimationFrame(renderLoop);
}
// Hover the render: the scene-linear light of a pixel, in stops from middle grey
rCanvas.addEventListener('pointermove', e => {
  const r = rCanvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  if (x < 0 || y < 0 || x >= 1 || y >= 1) return;
  const c = prog.read(x, y).map(v => v * Math.pow(2, S.st.view.exposure)), yv = luminance(c);
  $('#inspector').innerHTML = `<span data-no-i18n>RGB ${c.map(v => v.toFixed(3)).join(' · ')}</span> · ${esc(t('luminance'))} <b>${yv.toFixed(3)}</b> = <b>${fmtStops(stopsOf(yv / MIDDLE_GREY))}</b> ${esc(t('stops from middle grey'))}`;
});
rCanvas.addEventListener('pointerleave', () => { $('#inspector').textContent = ''; });
// The reference image of a step, rendered once when the step opens
function renderReference() {
  const ref = referenceState(step());
  $('#reference').hidden = !ref || !$('#r-ref').checked;
  if (!ref) { S.ref = null; return; }
  const save = S.st; S.st = ref; syncScenes();
  for (let i = 0; i < 48; i++) { rRig.jitter(i); prog.add(rScene, rCam); }
  prog.show(ref.view.exposure, ref.view.transform);
  $('#reference-img').src = rCanvas.toDataURL('image/jpeg', 0.85);
  S.st = save; syncScenes();
}

// ─── Picking and dragging lights ─────────────────────────────────────────────
function screenOf(p, cam) { const v = new THREE.Vector3(...p).project(cam), r = vCanvas.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, v.z]; }
function pick(e) {
  const r = vCanvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 22;
  for (const g of gizmos.children) {
    if (!g.userData.id) continue;
    const [x, y, z] = screenOf(g.userData.pos, viewCam()); if (z > 1) continue;
    const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = g.userData.id; }
  }
  return best;
}
const objOf = id => id === 'card' ? S.st.card : S.st.lights[id];
let drag = null;
vCanvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.altKey) return;
  const id = pick(e);
  if (!id) return;
  e.preventDefault();
  if (S.st.sel !== id) { S.st.sel = id; saveData(); renderProps(); updateGizmos(); }
  const o = objOf(id);
  pushUndo();
  drag = { id, x: e.clientX, y: e.clientY, az: o.az, el: o.el, moved: false };
  vCanvas.setPointerCapture(e.pointerId);
});
vCanvas.addEventListener('pointermove', e => {
  if (!drag) { vCanvas.style.cursor = pick(e) ? 'pointer' : ''; return; }
  const o = objOf(drag.id), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  if (S.view === 'top') {
    const r = vCanvas.getBoundingClientRect(), ndc = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, top);
    const tg = o.target === 'backdrop' ? TARGETS.backdrop : TARGETS.head, px = ray.ray.origin.x - tg[0], pz = ray.ray.origin.z - tg[2];
    o.az = Math.round(deg(Math.atan2(px, pz)));
    if (drag.id === 'card' || objOf(drag.id).type !== 'SUN') o.dist = Math.max(0.3, Math.round(Math.hypot(px, pz) / Math.cos(rad(o.el)) * 100) / 100);
  } else {
    let az = drag.az + dx * 0.5; az = ((az + 180) % 360 + 360) % 360 - 180;
    o.az = Math.round(az); o.el = Math.round(Math.max(-85, Math.min(89, drag.el - dy * 0.4)));
  }
  liveChange();
});
window.addEventListener('pointerup', () => { if (!drag) return; if (!drag.moved) S.undo.pop(); drag = null; changed(); });
vCanvas.addEventListener('wheel', e => {
  const o = objOf(S.st.sel);
  if (!o || !(e.shiftKey || pick(e) === S.st.sel) || (o.type === 'SUN' && S.st.sel !== 'card')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  pushUndo(); o.dist = Math.max(0.3, Math.min(12, Math.round(o.dist * (e.deltaY > 0 ? 1.08 : 1 / 1.08) * 100) / 100)); changed();
}, { capture: true, passive: false });

// ─── Data, undo, persistence ─────────────────────────────────────────────────
const key = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(key(), { st: S.st, flags: S.flags }); }
function loadData() {
  const saved = store.get(key(), null);
  if (saved?.st?.lights) { S.st = saved.st; S.flags = saved.flags || {}; } else { S.st = startState(step()); S.flags = {}; }
  S.undo = []; S.redo = [];
}
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo'); }

// ─── Meters ──────────────────────────────────────────────────────────────────
function renderMeters() {
  const m = S.m, s = S.st, k = s.lights.key;
  const other = m.keySide === 'L' ? m.E.camR.total : m.E.camL.total, otherStops = m.faceStops - m.ratioStops;
  const band = v => `<i class="fc" style="background:rgb(${FALSE_COLOR[FALSE_COLOR.findIndex(b => v < b.to)].color.map(c => Math.round(c * 255)).join(',')})"></i>`;
  $('#meter-strip').innerHTML = [
    `<span>${esc(t('Face'))} ${band(m.faceStops)}<b>${fmtStops(m.faceStops)}</b></span>`,
    `<span>${esc(t('Shadow cheek'))} ${band(otherStops)}<b>${fmtStops(otherStops)}</b></span>`,
    `<span>${esc(t('Ratio'))} <b>${ratioLabel(m.ratio)}</b> <small>(${m.ratioStops.toFixed(1)} ${esc(t('stops'))})</small></span>`,
    `<span>${esc(t('Backdrop'))} ${band(m.backStops)}<b>${fmtStops(m.backStops)}</b></span>`,
    `<span>${esc(t('Rim'))} <b>${Math.round(m.rim / Math.max(m.face, 1e-6) * 100)}%</b></span>`,
    k.on ? `<span>${esc(t('Key size'))} <b>${apparentSize(k).toFixed(1)}°</b></span>` : '',
  ].join('');
  void other;
  const fc = s.view.transform === 'False Color';
  $('#fc-legend').hidden = !fc;
  if (fc) $('#fc-legend').innerHTML = `<b>${esc(t('stops from middle grey'))}</b>` + FALSE_COLOR.map(b => `<span><i style="background:rgb(${b.color.map(c => Math.round(c * 255)).join(',')})"></i>${b.label}</span>`).join('');
}
function drawOverlay() {
  const s = S.st, sel = s.sel, o = objOf(sel);
  const lines = [S.view === 'top' ? t('Top view · drag a light to place it on the floor plan') : t('User Perspective')];
  if (o) lines.push(`${LIGHT_NAMES[sel]} · Az ${o.az}° · El ${o.el}°${o.type === 'SUN' && sel !== 'card' ? '' : ` · ${o.dist} m`}`);
  $('#view-overlay').innerHTML = lines.map(l => `<div data-no-i18n>${esc(l)}</div>`).join('');
}

// ─── Properties ──────────────────────────────────────────────────────────────
const opt = (v, cur, label = v) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
const num = (field, v, min, max, step, unit = '') => `<input type="number" data-f="${field}" min="${min}" max="${max}" step="${step}" value="${v}">${unit ? `<em>${unit}</em>` : '<em></em>'}`;
const toHex = c => '#' + c.map(v => Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('');
const fromHex = h => [1, 3, 5].map(i => Math.pow(parseInt(h.substr(i, 2), 16) / 255, 2.2));
const eye = on => `<svg viewBox="0 0 16 16" aria-hidden="true">${on ? '<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor"/><circle cx="8" cy="8" r="2" fill="currentColor"/>' : '<path d="M2 8s2.5 3 6 3 6-3 6-3M3 10l-1 1.5M8 11v1.8M13 10l1 1.5" fill="none" stroke="currentColor"/>'}</svg>`;
function renderProps() {
  const s = S.st, sel = s.sel;
  let h = `<div class="panel"><h4>Outliner<small>${esc(t('click · eye = on / off'))}</small></h4><div class="ol-list">`;
  for (const id of [...LIGHT_IDS, 'card']) {
    const o = objOf(id), icon = id === 'card' ? '<rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor"/>' : '<circle cx="6" cy="5" r="3" fill="none" stroke="currentColor"/><path d="M4.5 8.5h3M5 10.5h2" stroke="currentColor"/>';
    h += `<div class="ol-row${sel === id ? ' active' : ''}${o.on ? '' : ' off'}" data-sel="${id}"><svg viewBox="0 0 12 12" aria-hidden="true">${icon}</svg><span data-no-i18n>${LIGHT_NAMES[id]}</span><small data-no-i18n>${id === 'card' ? '' : o.type[0] + o.type.slice(1).toLowerCase()}</small><button type="button" class="eye" data-eye="${id}" aria-label="On / off" aria-pressed="${o.on}">${eye(o.on)}</button></div>`;
  }
  h += `<div class="ol-row${sel === 'world' ? ' active' : ''}" data-sel="world"><svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor"/><path d="M1.5 6h9M6 1.5c2 2.5 2 6.5 0 9M6 1.5c-2 2.5-2 6.5 0 9" fill="none" stroke="currentColor"/></svg><span data-no-i18n>World</span><small></small></div></div></div>`;
  if (LIGHT_IDS.includes(sel)) h += lightPanel(sel, s.lights[sel]);
  else if (sel === 'card') h += cardPanel(s.card);
  h += subjectPanel();
  h += worldPanel(s.world);
  h += `<div class="panel bl" data-no-i18n><h4>Backdrop<small>Material</small></h4><label class="bl-row"><span>Base Color</span><select data-g="backdrop">${opt('white', s.backdrop, 'White paper (85%)')}${opt('grey', s.backdrop, 'Grey paper (50%)')}${opt('black', s.backdrop, 'Black velvet (4%)')}</select><em></em></label></div>`;
  h += `<div class="panel bl" data-no-i18n><h4>Color Management<small>Render Properties</small></h4>
    <label class="bl-row"><span>View Transform</span><select data-g="transform">${opt('Standard', s.view.transform)}${opt('AgX', s.view.transform)}${opt('False Color', s.view.transform)}</select><em></em></label>
    <label class="bl-row"><span>Exposure</span><input type="number" data-g="exposure" min="-10" max="10" step="0.1" value="${s.view.exposure}"><em></em></label>
    <label class="bl-row"><span>Samples</span><select data-g="samples">${[16, 32, 64, 128].map(n => opt(n, S.samples)).join('')}</select><em></em></label></div>`;
  h += `<div class="panel" id="meter-panel">${meterPanel()}</div>`;
  $('#props').innerHTML = h;
}
// ─── The subject: the lab's plaster bust or a model of the user's own ───────
const MODEL = { data: null, name: '', zUp: false, turn: 0 };
function subjectPanel() {
  const own = !!MODEL.data;
  return `<div class="panel"><h4>${esc(t('Subject'))}<small>${esc(t('on the socle'))}</small></h4>
    <div class="seg small subject-seg"><button type="button" data-subject="bust" aria-pressed="${!own}">${esc(t('Plaster bust'))}</button><button type="button" data-subject="open" aria-pressed="${own}">${esc(t('Your model…'))}</button></div>
    <input type="file" id="model-file" accept=".glb,.obj,.stl" hidden>
    ${own ? `<p class="sb-empty model-name" data-no-i18n>${esc(MODEL.name)}</p>
      <div class="model-tools"><button type="button" class="mini-link" data-model="turn">${esc(t('Turn 90°'))}</button><button type="button" class="mini-link" data-model="zup" aria-pressed="${MODEL.zUp}">${esc(t('Z up (Blender axes)'))}</button></div>
      <p class="sb-empty">${esc(t('Your model is scaled to 40 cm, painted plaster and put on the socle. It stays in this browser tab. The light meter still reads the points of the lab\'s bust.'))}</p>`
      : `<p class="sb-empty">${esc(t('Open a .glb, .obj or .stl file to light your own sculpt. Export it from Blender with File › Export.'))}</p>`}</div>`;
}
function applyModel() {
  let geo = null;
  if (MODEL.data) { geo = fitModel(MODEL.data, MODEL); }
  vSet.setModel(geo); rSet.setModel(geo ? geo.clone() : null);
  syncScenes();
}
async function openModel(file) {
  try {
    if (file.size > 80 * 1024 * 1024) throw new Error('too big');
    MODEL.data = parseModel(file.name, await file.arrayBuffer()); MODEL.name = file.name; MODEL.turn = 0; MODEL.zUp = /\.(stl)$/i.test(file.name);
    applyModel(); renderProps(); msg(tr('{f} is on the socle.', { f: file.name }));
  } catch (err) {
    MODEL.data = null; renderProps();
    msg(err.message === 'compressed' ? 'This .glb is compressed (Draco or meshopt). Export it again without compression.' : err.message === 'too big' ? 'This model is too heavy for the browser. Decimate it or export a lighter version.' : err.message === 'format' ? 'Open a .glb, .obj or .stl file.' : 'This file could not be read as a 3D model.', true);
  }
}
$('#props').addEventListener('click', e => {
  const b = e.target.closest('[data-subject], [data-model]'); if (!b) return;
  if (b.dataset.subject === 'open') { $('#model-file').click(); return; }
  if (b.dataset.subject === 'bust') { MODEL.data = null; applyModel(); renderProps(); msg('Back to the plaster bust.'); return; }
  if (b.dataset.model === 'turn') MODEL.turn = (MODEL.turn + 1) % 4;
  if (b.dataset.model === 'zup') MODEL.zUp = !MODEL.zUp;
  applyModel(); renderProps();
});
$('#props').addEventListener('change', e => { if (e.target.id === 'model-file' && e.target.files[0]) openModel(e.target.files[0]); });

function lightPanel(id, l) {
  const seg = (f, cur, opts) => `<div class="seg small">${opts.map(([v, lab]) => `<button type="button" data-seg="${f}" data-val="${v}" aria-pressed="${cur === v}">${lab}</button>`).join('')}</div>`;
  let h = `<div class="panel bl" data-no-i18n><h4>${LIGHT_NAMES[id]}<small>Object Data · Light</small></h4>
    <div class="bl-row stack">${seg('type', l.type, [['POINT', 'Point'], ['SUN', 'Sun'], ['SPOT', 'Spot'], ['AREA', 'Area']])}</div>
    <div class="bl-row"><span>Color</span>${seg('colorMode', l.colorMode, [['rgb', 'RGB'], ['kelvin', 'Blackbody']])}</div>`;
  h += l.colorMode === 'kelvin' ? `<label class="bl-row"><span>Temperature</span>${num('kelvin', l.kelvin, 1000, 20000, 100, 'K')}</label><div class="kelvin-bar"><i style="left:${(l.kelvin - 1000) / 190}%"></i></div>` : `<label class="bl-row"><span>Color</span><input type="color" data-f="color" value="${toHex(l.color)}"><em></em></label>`;
  h += l.type === 'SUN' ? `<label class="bl-row"><span>Strength</span>${num('strength', l.strength, 0, 100, 0.1, 'W/m²')}</label><label class="bl-row"><span>Angle</span>${num('angle', l.angle, 0, 90, 0.5, '°')}</label>`
    : `<label class="bl-row"><span>Power</span>${num('power', l.power, 0, 100000, 1, 'W')}</label>`;
  if (l.type === 'POINT' || l.type === 'SPOT') h += `<label class="bl-row"><span>Radius</span>${num('radius', l.radius, 0, 2, 0.01, 'm')}</label>`;
  if (l.type === 'SPOT') h += `<div class="bl-sec">Spot Shape</div><label class="bl-row"><span>Spot Size</span>${num('spotSize', l.spotSize, 1, 180, 1, '°')}</label><label class="bl-row"><span>Blend</span>${num('blend', l.blend, 0, 1, 0.05)}</label>`;
  if (l.type === 'AREA') h += `<label class="bl-row"><span>Shape</span><select data-f="shape">${opt('SQUARE', l.shape, 'Square')}${opt('RECTANGLE', l.shape, 'Rectangle')}${opt('DISK', l.shape, 'Disk')}</select><em></em></label>
    <label class="bl-row"><span>${l.shape === 'RECTANGLE' ? 'Size X' : 'Size'}</span>${num('size', l.size, 0.01, 5, 0.05, 'm')}</label>${l.shape === 'RECTANGLE' ? `<label class="bl-row"><span>Size Y</span>${num('sizeY', l.sizeY, 0.01, 5, 0.05, 'm')}</label>` : ''}`;
  h += `<label class="bl-check"><input type="checkbox" data-f="shadow"${l.shadow !== false ? ' checked' : ''}>Cast Shadow</label>
    <div class="bl-sec">Placement · Track To ${l.target === 'backdrop' ? 'Backdrop' : 'Bust'}</div>
    <label class="bl-row"><span>Azimuth</span>${num('az', l.az, -180, 180, 1, '°')}</label>
    <label class="bl-row"><span>Elevation</span>${num('el', l.el, -85, 89, 1, '°')}</label>
    ${l.type === 'SUN' ? '' : `<label class="bl-row"><span>Distance</span>${num('dist', l.dist, 0.3, 12, 0.05, 'm')}</label>`}
    <p class="bl-note">${esc(`Apparent size ${apparentSize(l).toFixed(1)}°`)}</p></div>`;
  return h;
}
function cardPanel(c) {
  return `<div class="panel bl" data-no-i18n><h4>Bounce_Card<small>Foam board · reflector</small></h4>
    <label class="bl-row"><span>Color</span><select data-f="color">${opt('white', c.color, 'White')}${opt('gold', c.color, 'Gold')}${opt('black', c.color, 'Black (negative fill)')}</select><em></em></label>
    <label class="bl-row"><span>Size</span>${num('size', c.size, 0.2, 2, 0.05, 'm')}</label>
    <div class="bl-sec">Placement · Track To Bust</div>
    <label class="bl-row"><span>Azimuth</span>${num('az', c.az, -180, 180, 1, '°')}</label>
    <label class="bl-row"><span>Elevation</span>${num('el', c.el, -85, 89, 1, '°')}</label>
    <label class="bl-row"><span>Distance</span>${num('dist', c.dist, 0.3, 5, 0.05, 'm')}</label></div>`;
}
function worldPanel(w) {
  return `<div class="panel bl" data-no-i18n><h4>World<small>Surface</small></h4>
    <div class="bl-row stack"><div class="seg small"><button type="button" data-wmode="color" aria-pressed="${w.mode === 'color'}">Color</button><button type="button" data-wmode="hdri" aria-pressed="${w.mode === 'hdri'}">HDRI</button></div></div>
    ${w.mode === 'hdri' ? `<label class="bl-row"><span>Environment</span><select data-w="hdri">${Object.entries(HDRIS).map(([k, v]) => opt(k, w.hdri, v.name)).join('')}</select><em></em></label><label class="bl-row"><span>Rotation</span><input type="number" data-w="rot" min="-180" max="180" step="5" value="${w.rot}"><em>°</em></label>`
      : `<label class="bl-row"><span>Color</span><input type="color" data-w="color" value="${toHex(w.color)}"><em></em></label>`}
    <label class="bl-row"><span>Strength</span><input type="number" data-w="strength" min="0" max="100" step="0.05" value="${w.strength}"><em></em></label></div>`;
}
function meterPanel() {
  const m = S.m, rows = [['camL', 'Cheek, camera left'], ['camR', 'Cheek, camera right'], ['rimL', 'Rim, left'], ['rimR', 'Rim, right'], ['backL', 'Backdrop, left'], ['backC', 'Backdrop, above the head'], ['backR', 'Backdrop, right']];
  return `<h4>${esc(t('Light meter'))}<small>${esc(t('irradiance · W/m²'))}</small></h4><table class="meter"><tbody>${rows.map(([k, label]) => `<tr><td>${esc(t(label))}</td><td>${m.E[k].total.toFixed(2)}</td><td>${fmtStops(stopsOf(m.E[k].total / Math.max(m.face, 1e-6)))}</td></tr>`).join('')}</tbody></table><p class="sb-empty">${esc(t('The last column is in stops from the brighter cheek. The face and the backdrop in the strip below the render are in stops from middle grey, after the exposure.'))}</p>`;
}
$('#props').addEventListener('click', e => {
  const ey = e.target.closest('[data-eye]');
  if (ey) { const o = objOf(ey.dataset.eye); pushUndo(); o.on = !o.on; changed(); return; }
  const row = e.target.closest('[data-sel]');
  if (row) { S.st.sel = row.dataset.sel; saveData(); renderProps(); updateGizmos(); drawOverlay(); return; }
  const sg = e.target.closest('[data-seg]');
  if (sg) { const o = objOf(S.st.sel); pushUndo(); o[sg.dataset.seg] = sg.dataset.val; changed(); return; }
  const wm = e.target.closest('[data-wmode]');
  if (wm) { pushUndo(); S.st.world.mode = wm.dataset.wmode; if (wm.dataset.wmode === 'hdri' && S.st.world.strength === 1 && S.st.world.color[0] <= 0.05) S.st.world.strength = 1; changed(); }
});
$('#props').addEventListener('change', e => {
  const d = e.target.dataset, v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (d.f) {
    const o = objOf(S.st.sel); pushUndo();
    if (d.f === 'color' && S.st.sel !== 'card') o.color = fromHex(v);
    else if (e.target.type === 'number') o[d.f] = Math.max(+e.target.min, Math.min(+e.target.max, +v || 0));
    else o[d.f] = v;
    changed(); return;
  }
  if (d.w) { pushUndo(); S.st.world[d.w] = d.w === 'color' ? fromHex(v) : d.w === 'hdri' ? v : +v || 0; changed(); return; }
  if (d.g) {
    pushUndo();
    if (d.g === 'backdrop') S.st.backdrop = v;
    else if (d.g === 'transform') S.st.view.transform = v;
    else if (d.g === 'exposure') S.st.view.exposure = Math.max(-10, Math.min(10, +v || 0));
    else if (d.g === 'samples') { S.undo.pop(); S.samples = +v; store.set('samples', S.samples); prog.reset(); return; }
    changed();
  }
});

// ─── Stages, guide, step card ────────────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const stepDone = i => i === S.step ? !!step().check(S.st, S.m, S.flags) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.classList.toggle('three', n === 3); g.classList.toggle('five', n === 5);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(); });
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
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); S.flags = {}; changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st, S.flags); changed(); msg('This is one possible solution. Ctrl Z brings your settings back.'); }
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

// ─── Updates ─────────────────────────────────────────────────────────────────
// While dragging: move the lights and the meter, but keep the panels as they are.
function liveChange() { S.m = measure(S.st); syncScenes(); updateGizmos(); renderMeters(); drawOverlay(); }
function changed(save = true) {
  S.m = measure(S.st);
  syncScenes(); updateGizmos();
  if (save) saveData();
  checkProgress(); renderProps(); renderMeters(); drawOverlay(); renderGuide(); renderStepCard();
}
function enterStep() {
  loadData(); S.m = measure(S.st);
  lastOk = stepDone(S.step);
  renderStageSwitch(); renderReference();
  changed(false);
}
function renderAll() { renderStageSwitch(); renderProps(); renderMeters(); drawOverlay(); renderGuide(); renderStepCard(); translateTitles(); }
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }

// Viewport header
$('#v-mode').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; S.view = b.dataset.v; document.querySelectorAll('#v-mode button').forEach(x => x.setAttribute('aria-pressed', x === b)); controls.enabled = S.view === 'persp'; vDirty = true; drawOverlay(); });
$('#v-probes').onchange = e => { S.probes = e.target.checked; updateGizmos(); };
$('#r-ref').onchange = () => { $('#reference').hidden = !S.ref && !step().reference || !$('#r-ref').checked; };

// Keyboard
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || !S.hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
  if (ctrl && low === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  else if (ctrl && low === 'y') { redo(); e.preventDefault(); }
  else if (!ctrl && low === 'h') { const o = objOf(S.st.sel); if (o) { pushUndo(); o.on = !o.on; changed(); } e.preventDefault(); }
  else if (!ctrl && e.key === '7') { $('#v-mode [data-v="top"]').click(); }
  else if (!ctrl && e.key === '5') { $('#v-mode [data-v="persp"]').click(); }
});

// ─── Start ───────────────────────────────────────────────────────────────────
new ResizeObserver(resizeView).observe(vHost);
onLangChange(() => renderAll());
enterStep(); resizeView(); translateTitles();
// When the sculpted bust has loaded, render the reference and the render again with it.
Promise.all([vSet.ready, rSet.ready]).then(() => { renderReference(); syncScenes(); });
requestAnimationFrame(renderLoop);
window.__light = { S, prog, measure, where: id => { const g = gizmos.children.find(c => c.userData.id === id); const [x, y] = screenOf(g.userData.pos, viewCam()), r = vCanvas.getBoundingClientRect(); return [r.left + x, r.top + y]; } }; // for tests and curious students
