// 3ds Max Animation Lab: a bouncing ball in a 3D viewport and Track View.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { recalcHandles, evaluate, moveKey, moveHandle, key, contacts, tops, intervals, hangTime, matchScore, INTERPOLATIONS, HANDLE_TYPES } from './fcurve.js';
import { STAGES, CHANNELS, FPS, RANGE, REFERENCE, BALL, startData, cloneData, shape, channelOf, lowestPoint, firstBounce, rollReport, rollAngle } from './stages.js?v=6';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import blenderConcepts from '../animation/i18n.js?v=5';
import maxDictionary from './max-i18n.js?v=3';
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
  keyMode: store.get('keyMode', 'set'), tool: store.get('tool', 'move'), axis: store.get('axis', null),
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
  const k = S.data.channels[id];
  return k && k.length ? evaluate(k, f) : 0;
}

// ─── Status bar ──────────────────────────────────────────────────────────────
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg');
  el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 4000);
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

// ─── 3D Viewport: the rigged ball ───────────────────────────────────────────
// Three.js axes: x = Max X, y = Max Z (up), z = -Max Y.
const viewCanvas = $('#view'), viewHost = $('#view-host');
const renderer3 = new THREE.WebGLRenderer({ canvas: viewCanvas, antialias: true, alpha: true });
renderer3.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene3 = new THREE.Scene();
const cam3 = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
scene3.add(new THREE.HemisphereLight(0xffffff, 0x505050, 1.9));
const sun3 = new THREE.DirectionalLight(0xffffff, 1.6); sun3.position.set(-3, 8, 6); scene3.add(sun3);
const floorTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#525252'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 8); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; })();
const floor3 = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
floor3.rotation.x = -Math.PI / 2; floor3.position.set(4.5, 0, -4); scene3.add(floor3);
const backTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#44474c'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#6d727a'; g.lineWidth = 1; for (let x = 0; x <= 512; x += 512 / 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); } for (let y = 0; y <= 128; y += 128 / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const back3 = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshStandardMaterial({ map: backTex, roughness: 1 }));
back3.position.set(4.5, 2, -1.2); scene3.add(back3); // a 1 m grid wall behind the ball, to read heights
const ballTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); const cols = ['#f0a020', '#fff3d6', '#e0582a', '#fff3d6']; for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 4]; g.fillRect(i * 32, 0, 32, 128); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
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
const gizmo3 = new THREE.Group();
const gizmoParts = {};
const gizmoRotateParts = {};
const gizmoScaleParts = {};
const gizmoPickParts = [];
const gizmoMove = new THREE.Group(), gizmoRotate = new THREE.Group(), gizmoScale = new THREE.Group(), gizmoPickLayer = new THREE.Group();
gizmo3.add(gizmoMove, gizmoRotate, gizmoScale, gizmoPickLayer);
const gizmoLabel = (text, color) => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.font = '700 42px Segoe UI, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.strokeStyle = '#111b'; x.lineWidth = 6; x.strokeText(text, 32, 32); x.fillText(text, 32, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); s.scale.set(.34, .34, 1); s.renderOrder = 30; return s;
};
for (const [axis, dir, color] of [['x', new THREE.Vector3(1, 0, 0), 0xe34b4b], ['y', new THREE.Vector3(0, 1, 0), 0x55c878], ['z', new THREE.Vector3(0, 0, 1), 0x4f9cff]]) {
    const a = new THREE.ArrowHelper(dir, new THREE.Vector3(), .9, color, .16, .09); a.renderOrder = 30; a.line.material.depthTest = false; a.cone.material.depthTest = false; a.line.material.transparent = true; a.cone.material.transparent = true; gizmoMove.add(a); const label = gizmoLabel(axis.toUpperCase(), '#' + color.toString(16).padStart(6, '0')); gizmoMove.add(label); gizmoParts[axis] = { arrow: a, label };
    const size = axis === 'x' ? [.95, .18, .18] : axis === 'y' ? [.18, .95, .18] : [.18, .18, .95];
    const pick = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false }));
    pick.userData.axis = axis; pick.renderOrder = 31; gizmoPickLayer.add(pick); gizmoPickParts.push(pick);

    const points = [], radius = 1.02;
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; const c = Math.cos(a) * radius, s = Math.sin(a) * radius; points.push(axis === 'x' ? new THREE.Vector3(0, c, s) : axis === 'y' ? new THREE.Vector3(c, 0, s) : new THREE.Vector3(c, s, 0)); }
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .92, depthTest: false })); ring.renderOrder = 30; gizmoRotate.add(ring); const rlabel = gizmoLabel(axis.toUpperCase(), '#' + color.toString(16).padStart(6, '0')); rlabel.position.copy(points[12]).multiplyScalar(1.05); gizmoRotate.add(rlabel); gizmoRotateParts[axis] = { ring, label: rlabel };

    const bar = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(.82)]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9, depthTest: false })); bar.renderOrder = 30; gizmoScale.add(bar);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95, depthTest: false })); handle.position.copy(dir).multiplyScalar(.88); handle.renderOrder = 31; gizmoScale.add(handle); const slabel = gizmoLabel(axis.toUpperCase(), '#' + color.toString(16).padStart(6, '0')); slabel.position.copy(dir).multiplyScalar(1.12); gizmoScale.add(slabel); gizmoScaleParts[axis] = { bar, handle, label: slabel };
}
const gizmoOrigin = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); gizmoOrigin.renderOrder = 30; gizmo3.add(gizmoOrigin); gizmo3.visible = false; scene3.add(gizmo3);
const pathDots = new THREE.Group(), ghosts = new THREE.Group(), refGroup = new THREE.Group(); scene3.add(pathDots, ghosts, refGroup);
const dotGeo = new THREE.SphereGeometry(0.035, 8, 6), keyDotGeo = new THREE.SphereGeometry(0.06, 10, 8);
const refBall = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(0.5, 16, 10)), new THREE.LineDashedMaterial({ color: 0xffbf00, dashSize: 0.06, gapSize: 0.04 }));
refBall.computeLineDistances(); refGroup.add(refBall);
const controls3 = new OrbitControls(cam3, viewCanvas);
controls3.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls3.addEventListener('change', () => render3());
viewHost.addEventListener('pointerdown', e => { controls3.mouseButtons.LEFT = e.button === 0 && e.altKey ? THREE.MOUSE.ROTATE : null; }, true);
function frameView3(side = false) {
  const fit = Math.max(1, 1.55 / Math.max(0.6, cam3.aspect));
  controls3.target.set(4.2, 2.0, 0);
  cam3.position.set(side ? 4.5 : 2.6, side ? 1.7 : 2.6, (side ? 14 : 13.2) * fit);
  cam3.up.set(0, 1, 0); cam3.lookAt(controls3.target); controls3.update(); render3();
}
let framed3 = false;
function resize3() {
  const r = viewHost.getBoundingClientRect(); if (!r.width || !r.height) return;
  renderer3.setSize(r.width, r.height, false); cam3.aspect = r.width / r.height; cam3.updateProjectionMatrix();
  if (!framed3) { framed3 = true; frameView3(); } else render3();
}
const pose = f => { const over = Math.round(f) === Math.round(S.frame) && !S.playing ? S.override : {}; const sh = shape(S.data, f, over); return { x: over.locX ?? valueAt('locX', f), rot: over.rotY ?? valueAt('rotY', f), previewScale: over.previewScale ?? 1, previewDepth: over.previewDepth ?? 0, ...sh }; };
// Max's +Y points into the screen here, so a positive Y rotation turns the ball clockwise in the side view.
const toRad = deg => -deg * Math.PI / 180;
let lastPathKey = '';
function drawView() {
  const p = pose(S.frame);
  ballGroup.position.set(p.x, p.center, p.previewDepth); ballGroup.scale.set(p.sx * p.previewScale, p.sz * p.previewScale, p.sx * p.previewScale); ball3.rotation.set(0, 0, toRad(p.rot));
  const sh = Math.max(0.25, 1 - Math.max(0, p.bottom) / 6);
  shadow3.position.x = p.x; shadow3.scale.setScalar(p.sx * (0.6 + 0.4 * sh)); shadow3.material.opacity = 0.35 * sh;
  const anim = stage().channels;
  ctrls3.Root.position.set(p.x, Math.max(0, p.root) + 0.01, p.previewDepth);
  ctrls3.SS_Top.position.set(p.x, p.top + 0.08, p.previewDepth + 0.02); ctrls3.SS_Bottom.position.set(p.x, p.bottom - 0.08, p.previewDepth + 0.02);
  ctrls3.Rotation.position.set(p.x, p.center, p.previewDepth + 0.03); ctrls3.Rotation.rotation.z = toRad(p.rot);
  const helperPoint = S.bone === 'SS_Top' ? [p.x, p.top + .08, p.previewDepth + .08] : S.bone === 'SS_Bottom' ? [p.x, p.bottom - .08, p.previewDepth + .08] : S.bone === 'Rotation' ? [p.x, p.center, p.previewDepth + .08] : [p.x, Math.max(0, p.root) + .02, p.previewDepth + .08];
  gizmo3.position.set(...helperPoint); gizmo3.scale.setScalar(S.tool === 'scale' ? 1.1 : S.tool === 'rotate' ? 1.15 : 1); gizmo3.visible = S.toggles.ctrls;
  gizmoMove.visible = S.tool === 'move'; gizmoRotate.visible = S.tool === 'rotate'; gizmoScale.visible = S.tool === 'scale'; gizmoPickLayer.visible = true;
  for (const [axis, part] of Object.entries(gizmoParts)) { const active = S.axis === axis; part.arrow.line.material.opacity = active ? 1 : .82; part.arrow.cone.material.opacity = active ? 1 : .82; part.label.material.opacity = active ? 1 : .9; }
  for (const [axis, part] of Object.entries(gizmoRotateParts)) { const active = S.axis === axis; part.ring.material.opacity = active ? 1 : .82; part.label.material.opacity = active ? 1 : .9; }
  for (const [axis, part] of Object.entries(gizmoScaleParts)) { const active = S.axis === axis; part.bar.material.opacity = active ? 1 : .82; part.handle.material.opacity = active ? 1 : .88; part.label.material.opacity = active ? 1 : .9; }
  const on = S.toggles.ctrls;
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
function pickGizmoAxis(e) {
  if (!gizmo3.visible) return null;
  const r = viewCanvas.getBoundingClientRect();
  ray3.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam3);
  return ray3.intersectObjects(gizmoPickParts, false)[0]?.object.userData.axis || null;
}
function selectBone(bone) {
  S.bone = bone;
  const ch = channelOf(bone);
  if (stage().channels.includes(ch)) { S.active = ch; S.hidden.delete(ch); }
  renderAll();
}
viewCanvas.addEventListener('pointerdown', e => {
  closeMenu();
  if (e.button === 0) {
    const axis = pickGizmoAxis(e);
    if (axis) { e.preventDefault(); chooseAxis(axis); if (!S.vgrab && !S.vrot && !S.vscale) activateTool(S.tool); return; }
  }
  if (S.vgrab) { e.preventDefault(); endVGrab(e.button === 0); return; }
  if (S.vrot) { e.preventDefault(); endVRot(e.button === 0); return; }
  if (S.vscale) { e.preventDefault(); endVScale(e.button === 0); return; }
  if (e.button !== 0 || e.altKey) return;
  const b = pickCtrl(e);
  if (b) selectBone(b);
});
viewCanvas.addEventListener('pointermove', e => {
  const r = viewCanvas.getBoundingClientRect(); S.vpointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  if (S.vgrab) updateVGrab();
  if (S.vrot) updateVRot(true);
  if (S.vscale) updateVScale();
});
viewCanvas.addEventListener('contextmenu', e => { if (S.vgrab) { e.preventDefault(); endVGrab(false); } if (S.vrot) { e.preventDefault(); endVRot(false); } if (S.vscale) { e.preventDefault(); endVScale(false); } });
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
  if (!S.toggles.ctrls) return msg('Helpers are hidden: turn on Helpers in the viewport header.', true);
  if (!S.vpointer) S.vpointer = { x: viewCanvas.clientWidth / 2, y: viewCanvas.clientHeight / 2 };
  if (stage().free) { S.active = 'scale'; S.bone = 'Root'; S.hidden.delete('scale'); renderChannels(); drawGraph(); }
  S.vscale = { start: stage().free ? S.override.scale ?? valueAt('scale', S.frame) : S.override.previewScale ?? 1, x0: S.vpointer.x, y0: S.vpointer.y, num: '', prev: { ...S.override } };
  viewHost.classList.add('modal'); updateVScale();
}
function updateVScale() {
  const g = S.vscale; if (!g) return;
  const typed = g.num !== '' && g.num !== '-' && !isNaN(+g.num) ? +g.num / 100 : null;
  const drag = Math.max(.1, g.start + -(S.vpointer.y - g.y0) * .01);
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
  let dx = (S.vpointer.x - g.x0) * g.wpp, dz = -(S.vpointer.y - g.y0) * g.wpp, dy = dz;
  if (typed != null) { if (g.axis === 'z') { dz = typed; dx = 0; } else if (g.axis === 'y') { dy = typed; dx = 0; dz = 0; } else { dx = typed; dz = 0; } }
  if (g.axis === 'x') dz = 0;
  if (g.axis === 'y') { dx = 0; dz = 0; }
  if (g.axis === 'z' || !g.root) dx = 0;
  const over = { ...g.prev };
  if (g.axis === 'y') over.previewDepth = Math.round(((g.prev.previewDepth ?? 0) + dy) * 1000) / 1000;
  else { over[g.ch] = Math.round((g.start + dz) * 1000) / 1000; if (g.root) over.locX = Math.round((g.startX + dx) * 1000) / 1000; }
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
    for (const c of [g.ch, 'locX']) if (S.override[c] != null && Math.abs(S.override[c] - valueAt(c, S.frame)) < 1e-4) delete S.override[c];
    if (Object.keys(S.override).length) { if (S.keyMode === 'auto') keyControl(); else msg('Moved. Click Set Keys to save the pose before changing frame.'); }
  }
  drawView(); renderSidebar();
}
// R in the 3D Viewport: turn the Rotation control. Clockwise = rolling forwards (+Y). Typed numbers are degrees.
function startVRot() {
  if (S.bone !== 'Rotation') return msg(S.toggles.ctrls ? 'Select the orange Rotation helper to rotate. Use Select and Move for the other helpers.' : 'Helpers are hidden: turn on Helpers in the viewport header.', true);
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
  document.querySelectorAll('.max-transform').forEach(b => { const active = b.dataset.tool === S.tool; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  document.querySelectorAll('.max-axis-constraints button').forEach(b => b.setAttribute('aria-pressed', String(S.axis === b.dataset.axis)));
  gizmo3.visible = S.toggles.ctrls;
}
function activateTool(tool) {
  if (S.vgrab) endVGrab(false);
  if (S.vrot) endVRot(false);
  if (S.vscale) endVScale(false);
  S.tool = tool; store.set('tool', tool); syncTransformTools(); drawView();
  if (tool === 'move') startVGrab(); else if (tool === 'rotate') startVRot(); else startVScale();
}
document.querySelectorAll('.max-transform').forEach(b => b.onclick = () => activateTool(b.dataset.tool));
function chooseAxis(axis) {
  S.axis = S.axis === axis ? null : axis;
  store.set('axis', S.axis);
  if (S.vgrab) {
    S.vgrab.axis = S.axis || (S.vgrab.root ? null : 'z');
    updateVGrab();
  }
  syncTransformTools(); drawView();
}
document.querySelectorAll('.max-axis-constraints button').forEach(b => b.onclick = () => chooseAxis(b.dataset.axis));
function syncKeyMode() {
  $('#auto-key').setAttribute('aria-pressed', String(S.keyMode === 'auto'));
  $('#set-key-mode').setAttribute('aria-pressed', String(S.keyMode === 'set'));
  $('#set-keys').disabled = S.keyMode !== 'set';
  $('#workspace').classList.toggle('auto-key-on', S.keyMode === 'auto');
}
function chooseKeyMode(mode) {
  S.keyMode = S.keyMode === mode ? 'off' : mode;
  store.set('keyMode', S.keyMode);
  syncKeyMode();
  msg(S.keyMode === 'auto' ? 'Auto Key: moving a helper creates a key.' : S.keyMode === 'set' ? 'Set Key Mode: pose a helper, then click Set Keys.' : 'Key modes off. Enable Auto Key or Set Key Mode to animate.');
}
$('#auto-key').onclick = () => chooseKeyMode('auto');
$('#set-key-mode').onclick = () => chooseKeyMode('set');
$('#set-keys').onclick = () => S.override.scale != null && stage().free ? keyScale() : keyControl();
$('#reset-control').onclick = () => clearControl();
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
const gy = v => { const { h } = graphSize(); return RULER + (1 - (v - S.view.v0) / (S.view.v1 - S.view.v0)) * (h - RULER - 14); };
const fx = x => { const { w } = graphSize(); return S.view.f0 + x / w * (S.view.f1 - S.view.f0); };
const vy = y => { const { h } = graphSize(); return S.view.v0 + (1 - (y - RULER) / (h - RULER - 14)) * (S.view.v1 - S.view.v0); };

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
  ctx.fillStyle = '#232323'; ctx.fillRect(0, 0, w, h);
  // grid
  const fs = Math.max(1, niceStep(S.view.f1 - S.view.f0, w, 46)), vs = niceStep(S.view.v1 - S.view.v0, h, 34);
  ctx.lineWidth = 1; ctx.font = '10px Inter, sans-serif';
  for (let f = Math.ceil(S.view.f0 / fs) * fs; f <= S.view.f1; f += fs) { ctx.strokeStyle = '#2e2e2e'; ctx.beginPath(); ctx.moveTo(gx(f), RULER); ctx.lineTo(gx(f), h); ctx.stroke(); }
  for (let v = Math.ceil(S.view.v0 / vs) * vs; v <= S.view.v1; v += vs) {
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? '#444' : '#2e2e2e'; ctx.beginPath(); ctx.moveTo(0, gy(v)); ctx.lineTo(w, gy(v)); ctx.stroke();
    ctx.fillStyle = '#8a8a8a'; ctx.fillText(+v.toFixed(2), 4, gy(v) - 2);
  }
  // outside the frame range
  ctx.fillStyle = '#00000040';
  if (gx(S.start) > 0) ctx.fillRect(0, RULER, gx(S.start), h);
  if (gx(S.end) < w) ctx.fillRect(gx(S.end), RULER, w - gx(S.end), h);
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
    ctx.beginPath();
    for (let x = 0; x <= w; x += 1.5) { const y = gy(valueAt(id, fx(x))); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (!editable(id)) continue;
    for (const k of S.data.channels[id]) {
      if (k.select && k.interp === 'BEZIER' || k.select && prevInterp(id, k) === 'BEZIER') {
        const col = HANDLE_COLORS[k.handle];
        for (const side of ['left', 'right']) {
          const hp = k[side];
          if (side === 'left' && prevInterp(id, k) !== 'BEZIER') continue;
          if (side === 'right' && k.interp !== 'BEZIER') continue;
          ctx.strokeStyle = col === '#2b2b2b' ? '#111' : col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(gx(k.frame), gy(k.value)); ctx.lineTo(gx(hp.frame), gy(hp.value)); ctx.stroke();
          ctx.fillStyle = S.drag?.handle?.k === k && S.drag.handle.side === side ? '#fff' : col === '#2b2b2b' ? '#ddd' : col;
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(gx(hp.frame), gy(hp.value), 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
    for (const k of S.data.channels[id]) {
      ctx.fillStyle = k.select ? (k === S.activeKey ? '#ffffff' : '#ffaa33') : '#111';
      ctx.strokeStyle = k.select ? '#000' : '#e0e0e0'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(gx(k.frame), gy(k.value), 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  // box select
  if (S.drag?.box) {
    const b = S.drag.box; ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); ctx.setLineDash([]);
  }
  // ruler + current frame
  ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, w, RULER);
  ctx.fillStyle = '#9a9a9a';
  for (let f = Math.ceil(S.view.f0 / fs) * fs; f <= S.view.f1; f += fs) ctx.fillText(String(f), gx(f) + 2, 14);
  const cx = gx(S.frame);
  ctx.strokeStyle = '#4772b3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, RULER); ctx.lineTo(cx, h); ctx.stroke();
  ctx.fillStyle = '#4772b3'; const lab = String(Math.round(S.frame)), lw = ctx.measureText(lab).width + 10;
  ctx.fillRect(cx - lw / 2, 3, lw, 16); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(lab, cx, 15); ctx.textAlign = 'left';
  if (S.grab) { ctx.fillStyle = '#ffffffcc'; ctx.fillText(t(S.grab.axis ? `Move · only ${S.grab.axis === 'x' ? 'time' : 'value'}` : 'Move · X time only · Y value only · click to confirm'), 8, h - 8); }
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
    if (y < RULER) { S.drag = { scrub: true }; setFrame(Math.round(fx(x))); return; }
    const hit = hitTest(x, y);
    if (hit?.side) { S.drag = { handle: hit, x, y, started: false }; S.active = hit.id; S.activeKey = hit.k; renderAll(); return; }
    if (hit) {
      if (e.shiftKey) { hit.k.select = !hit.k.select; S.activeKey = hit.k.select ? hit.k : null; }
      else if (!hit.k.select) { clearSelection(); hit.k.select = true; S.activeKey = hit.k; }
      else S.activeKey = hit.k;
      S.active = hit.id;
      S.drag = { move: true, x, y, started: false };
      renderAll(); return;
    }
    if (!e.shiftKey) clearSelection();
    S.drag = { box: { x0: x, y0: y, x1: x, y1: y }, add: e.shiftKey };
    renderAll();
  });
  c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (S.grab) { updateGrab(x, y); return; }
    const d = S.drag; if (!d) return;
    if (d.pan) {
      const df = (x - d.x) / r.width * (d.view.f1 - d.view.f0), dv = (y - d.y) / (r.height - RULER - 14) * (d.view.v1 - d.view.v0);
      S.view = { f0: d.view.f0 - df, f1: d.view.f1 - df, v0: d.view.v0 + dv, v1: d.view.v1 + dv }; drawGraph(); return;
    }
    if (d.scrub) { setFrame(Math.round(fx(x))); return; }
    if (d.box) { d.box.x1 = x; d.box.y1 = y; drawGraph(); return; }
    if (!d.started && Math.hypot(x - d.x, y - d.y) < 3) return;
    if (!d.started) { d.started = true; pushUndo(); if (d.move) startGrab(d.x, d.y, true); }
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
  S.grab = { x, y, byDrag, axis: null, orig: sel.map(({ id, k }) => ({ id, k, frame: k.frame, value: k.value, left: { ...k.left }, right: { ...k.right } })) };
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
$('#curve-smooth').onclick = () => setInterp('BEZIER');
$('#curve-linear').onclick = () => setInterp('LINEAR');
$('#curve-step').onclick = () => setInterp('CONSTANT');
$('#tangent-linear').onclick = () => setHandle('VECTOR');
$('#tangent-spline').onclick = () => setHandle('ALIGNED');
$('#add-track-key').onclick = insertKey;
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
function renderChannels() {
  const box = $('#channels');
  let html = '', group = null;
  for (const id of stage().channels) {
    const ch = CHANNELS[id];
    if (ch.bone !== group) { group = ch.bone; html += `<div class="ch-group${S.bone === group ? ' sel' : ''}" data-bone="${group}" data-no-i18n>${esc(group)}</div>`; }
    html += `<div class="channel${id === S.active ? ' active' : ''}" data-ch="${id}" title="${esc(t(id === 'locX' ? 'The travel of the ball. Click the eye to show its curve.' : 'Click to make it the active channel.'))}"><button type="button" class="eye" data-eye="${id}" aria-pressed="${!S.hidden.has(id)}" aria-label="Show ${ch.bone} ${ch.name}">${S.hidden.has(id) ? '◌' : '◉'}</button><span class="swatch" style="background:${ch.color}"></span><span class="ch-name" data-no-i18n>${ch.name}</span></div>`;
  }
  box.innerHTML = html;
}
$('#channels').addEventListener('click', e => {
  S.area = 'graph';
  const eye = e.target.closest('[data-eye]');
  if (eye) { const id = eye.dataset.eye; S.hidden.has(id) ? S.hidden.delete(id) : S.hidden.add(id); renderAll(); return; }
  const grp = e.target.closest('[data-bone]'); if (grp) { selectBone(grp.dataset.bone); return; }
  const row = e.target.closest('[data-ch]'); if (!row) return;
  S.active = row.dataset.ch; S.bone = CHANNELS[S.active].bone; renderAll();
});

function renderSidebar() {
  const k = S.activeKey, id = S.active;
  let html = `<h4>${esc(t('Controller properties'))}</h4><div class="sb-stat"><span>${esc(t('Active'))}</span><b data-no-i18n>${esc(CHANNELS[id].name)}</b></div><div class="sb-stat"><span>${esc(t('Value now'))}</span><b>${valueAt(id, S.frame).toFixed(2)}</b></div><div class="sb-sep"></div><h4>${esc(t('Selected key'))}</h4>`;
  const owner = k && Object.keys(S.data.channels).find(c => S.data.channels[c].includes(k));
  if (k && owner && editable(owner)) {
    html += `<label>${esc(t('Frame'))}<input type="number" step="1" data-kf="frame" value="${k.frame}"></label>
      <label>${esc(t('Value'))}<input type="number" step="${CHANNELS[owner].rot ? 1 : 0.05}" data-kf="value" value="${+k.value.toFixed(3)}"></label>
      <label>${esc(t('Curve'))}<select data-kf="interp">${INTERPOLATIONS.map(m => `<option value="${m}"${k.interp === m ? ' selected' : ''}>${INTERP_LABELS[m]}</option>`).join('')}</select></label>
      <label>${esc(t('Tangents'))}<select data-kf="handle">${HANDLE_TYPES.map(m => `<option value="${m}"${k.handle === m ? ' selected' : ''}>${HANDLE_LABELS[m]}</option>`).join('')}</select></label>`;
  } else html += `<p class="sb-empty">${esc(t('Click a keyframe to see and edit it here.'))}</p>`;
  const z = S.data.channels.locZ, c = contacts(z), tp = tops(z);
  html += `<div class="sb-sep"></div><h4>${esc(t('Bounces'))}</h4>`;
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
$('#sidebar').addEventListener('change', e => {
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
function sizeBottom() {
  const hostEl = $('#timeline-host');
  hostEl.style.height = dopeSheet() ? `${TL_RULER + 6 + dsRows().length * RH}px` : '';
  $('#bottom-editor').classList.toggle('dope', dopeSheet());
}
function diamond(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
function drawTimeline() {
  const { ctx, w, h } = fitCanvas(tlCanvas), ds = dopeSheet(), left = ds ? NAMES : 0;
  const f0 = 0, f1 = Math.max(S.end + 4, 76), X = f => left + 10 + (f - f0) / (f1 - f0) * (w - left - 20);
  ctx.fillStyle = '#232323'; ctx.fillRect(0, 0, w, h);
  const rows = ds ? dsRows() : null, rowY = i => TL_RULER + 3 + i * RH;
  if (ds) rows.forEach((r, i) => {
    ctx.fillStyle = r.kind === 'summary' ? '#2d3340' : r.kind === 'group' ? '#2b3a55' : i % 2 ? '#262626' : '#2a2a2a';
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
  ctx.strokeStyle = '#4772b3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, TL_RULER); ctx.lineTo(cx, h); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = '#4772b3'; const lab = String(Math.round(S.frame)), lw = ctx.measureText(lab).width + 10;
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
  $('#bottom-type').onchange = e => { S.bottom = e.target.value; store.set('bottom', S.bottom); sizeBottom(); renderAll(); msg(S.bottom === 'dopesheet' ? 'Dope Sheet: every controller on its own row. Select and drag keys to retime them.' : 'Track Bar: a compact summary of animation keys.'); };
  $('#b-play').onclick = togglePlay;
  $('#b-start').onclick = () => setFrame(S.start);
  $('#b-end').onclick = () => setFrame(S.end);
  $('#b-nextkey').onclick = () => jumpKey(1);
  $('#b-prevkey').onclick = () => jumpKey(-1);
  $('#f-cur').onchange = e => setFrame(+e.target.value);
  $('#f-start').onchange = e => { S.start = Math.max(0, Math.min(+e.target.value, S.end - 1)); renderAll(); };
  $('#f-end').onchange = e => { S.end = Math.max(S.start + 1, +e.target.value); renderAll(); };
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
  $('#b-play').textContent = S.playing ? '❚❚' : '▶'; $('#b-play').setAttribute('aria-pressed', String(S.playing));
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
        <li>${t('Select Root, choose Select and Move (<kbd>W</kbd>), and use Auto Key or Set Keys to create keys.')}</li>
        <li>${t('Use SS_Top and SS_Bottom for squash and stretch; select Rotation and choose Select and Rotate (<kbd>E</kbd>).')}</li>
        <li>${t('Use Select and Uniform Scale (<kbd>R</kbd>) with Auto Key or Set Keys, or edit its curve in Track View.')}</li>
        <li>${t('Edit all six tracks and tangents in Track View – Curve Editor; click an eye to focus on fewer curves, then play the animation.')}</li>
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
  $('#t-path').checked = S.toggles.path; $('#t-ghosts').checked = S.toggles.ghosts; $('#t-ref').checked = S.toggles.ref; $('#t-ctrls').checked = S.toggles.ctrls;
  $('#ref-toggle').hidden = stage().id !== 'weight';
  syncTransformTools();
}
function renderLive() {
  drawView(); drawGraph(); drawTimeline();
  $('#f-cur').value = Math.round(S.frame);
  $('#time-sec').textContent = `${((S.frame - 1) / FPS).toFixed(2)} s`;
  if (!S.playing) renderSidebar();
}
function renderAll() {
  renderStageSwitch(); renderChannels(); renderGuide(); renderStepCard(); syncToggles();
  $('#f-start').value = S.start; $('#f-end').value = S.end;
  renderLive(); renderSidebar();
}
function changed(commit = true) {
  if (commit) { saveData(); checkProgress(); renderGuide(); renderStepCard(); renderChannels(); }
  renderLive();
}
function enterStage() {
  $('#bottom-type').value = S.bottom;
  S.focus = null; lastDone = null; S.hidden.clear(); for (const id of stage().hide || ['locX']) S.hidden.add(id); // the travel curve is shown on demand
  S.active = stage().active || 'locZ'; S.bone = CHANNELS[S.active].bone; S.override = {};
  loadData();
  S.toggles.ref = stage().independent ? !!stage().steps[S.step].reference : false;
  frameAll(); sizeBottom(); renderAll(); checkProgress();
}

$('#t-path').onchange = e => { S.toggles.path = e.target.checked; renderLive(); };
$('#t-ghosts').onchange = e => { S.toggles.ghosts = e.target.checked; renderLive(); };
$('#t-ctrls').onchange = e => { S.toggles.ctrls = e.target.checked; store.set('ctrls', S.toggles.ctrls); if (!S.toggles.ctrls && S.vgrab) endVGrab(false); msg(S.toggles.ctrls ? 'Helpers shown.' : 'Helpers hidden: select a controller in Track View or turn helpers on again.'); renderLive(); };
$('#t-ref').onchange = e => { S.toggles.ref = e.target.checked; renderAll(); };

// ─── Lab keyboard shortcuts while the pointer is over the workspace ──
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
let lastPointer = { x: 0, y: 0 };
graphCanvas.addEventListener('pointermove', e => { const r = graphCanvas.getBoundingClientRect(); lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY }; });
for (const [el, area] of [[viewHost, 'view'], [$('#graph-host'), 'graph'], [$('#timeline-host'), 'timeline']]) el.addEventListener('pointerenter', () => { S.area = area; });
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea')) return;
  const shortcut = e.key.toLowerCase();
  if (S.hover && !e.ctrlKey && !e.altKey && !e.metaKey && ['w', 'e', 'r'].includes(shortcut)) {
    e.preventDefault();
    activateTool(shortcut === 'w' ? 'move' : shortcut === 'e' ? 'rotate' : 'scale');
    return;
  }
    if (S.vgrab) { e.preventDefault(); vgrabKey(e); return; }
    if (S.vrot) { e.preventDefault(); vrotKey(e); return; }
    if (S.vscale) { e.preventDefault(); vscaleKey(e); return; }
  if (S.tlGrab) { if (e.key === 'Escape') endTlGrab(false); else if (e.key === 'Enter') endTlGrab(true); e.preventDefault(); return; }
  if (!S.hover && !S.grab && e.key !== 'Escape') return;
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, low = k.toLowerCase();
  if (S.grab) {
    if (k === 'Escape') { cancelGrab(); e.preventDefault(); return; }
    if (k === 'Enter') { confirmGrab(); e.preventDefault(); return; }
    if (low === 'x') { S.grab.axis = S.grab.axis === 'x' ? null : 'x'; updateGrab(S.grab.lastX ?? S.grab.x, S.grab.lastY ?? S.grab.y); e.preventDefault(); return; }
    if (low === 'y') { S.grab.axis = S.grab.axis === 'y' ? null : 'y'; updateGrab(S.grab.lastX ?? S.grab.x, S.grab.lastY ?? S.grab.y); e.preventDefault(); return; }
    return;
  }
  let handled = true;
  if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (k === ' ') togglePlay();
  else if (k === 'ArrowRight') e.shiftKey ? setFrame(S.end) : setFrame(Math.round(S.frame) + 1);
  else if (k === 'ArrowLeft') e.shiftKey ? setFrame(S.start) : setFrame(Math.round(S.frame) - 1);
  else if (k === 'ArrowUp') jumpKey(1);
  else if (k === 'ArrowDown') jumpKey(-1);
  else if (S.area === 'view') {
      if (low === 'w') activateTool('move');
      else if (low === 'e') activateTool('rotate');
      else if (low === 'r') activateTool('scale');
    else if (k === 'Home') frameView3();
    else if (e.code === 'Numpad1' || k === '1') frameView3(true);
    else if (k === 'Escape') closeMenu();
    else handled = false;
  } else if (S.area === 'timeline') {
    if (ctrl && low === 'a') selectAll(true, dopeSheet() ? stageKeys() : allKeys(editable));
    else if (k === 'Delete') deleteKeys(bottomSelected());
    else if (k === 'Escape') closeMenu();
    else handled = false;
  } else {
    if (k === 'Home') { frameAll(); drawGraph(); }
    else if (k === '.') { frameAll(true); drawGraph(); }
    else if (ctrl && low === 'a') selectAll(true);
    else if (k === 'Delete') deleteKeys();
    else if (k === 'Escape') closeMenu();
    else handled = false;
  }
  if (handled) e.preventDefault();
});

// ─── Start ──────────────────────────────────────────────────────────────────
setupGraphInput(); setupTimeline();
new ResizeObserver(() => renderLive()).observe($('#graph-host'));
new ResizeObserver(() => { resize3(); }).observe($('#view-host'));
onLangChange(() => renderAll());
frameView3(); enterStage(); resize3();
window.__maxAnim = S; window.__maxAnim3 = { cam3, ctrls3, selectBone, startVGrab, startVRot, keyControl, ball3, ballGroup }; // test hooks
