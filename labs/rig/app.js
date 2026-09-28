// Rig Lab: a Blender-style Pose Mode with FK on an arm and an IK constraint with a pole target on a leg.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import * as RG from './rig.js?v=3';
import { STAGES, rigFor, ghostPoints, cupPoint, withPose, GHOST_POSE, kneeForward, restJump, poleOffPlane, switchPop, applyVisual, planePole, ringInfo } from './stages.js?v=4';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=3';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-rig:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-rig:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const RIGS = {};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, rig: null, st: null, res: null,
  sel: new Set(), active: null, flags: {}, undo: [], redo: [], done: store.get('done', {}),
  modal: null, pointer: null, hover: false, focus: null, mode: 'pose', editSel: null,
  show: { mesh: true, lines: true, axes: false },
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
const bone = name => S.rig.bones[S.rig.index[name]];

// ─── Data, undo, persistence ─────────────────────────────────────────────────
const key = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(key(), S.st); }
// One rig per knee bend (the bend is edited in Edit Mode and stored in the state).
function rigOf(st) { const k = +(st?.knee || 0).toFixed(4), sd = +(st?.kneeSide || 0).toFixed(4), rl = +(st?.roll || 0).toFixed(2), id = `${stage().rig}|${k}|${sd}|${rl}`; return RIGS[id] ??= rigFor(stage(), { knee: k, kneeSide: sd, roll: rl }); }
function loadData() {
  const base = rigOf(null), saved = store.get(key(), null);
  S.st = saved && saved.pose && Object.keys(saved.pose).length === base.bones.length ? saved : step().start(base);
  S.rig = rigOf(S.st);
  S.undo = []; S.redo = []; S.flags = {}; S.sel.clear(); S.active = null; S.mode = 'pose'; S.editSel = null;
}
// After the knee bend changed (Edit Mode, undo, a solution), use the matching rig.
function syncRig() { const r = rigOf(S.st); if (r !== S.rig) { S.rig = r; buildScene(); } }
function pushUndo(prev = S.st) { S.undo.push(JSON.stringify(prev)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo'); }

let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg');
  el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 5500);
}

// ─── Three.js scene ──────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.5, 0.8, 1); camera.add(sun);
const grid = new THREE.GridHelper(20, 20, 0x5a5a5a, 0x484848); scene.add(grid);
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.addEventListener('change', () => requestRender());
host.addEventListener('pointerdown', e => { controls.mouseButtons.LEFT = e.button === 0 && e.altKey ? THREE.MOUSE.ROTATE : null; }, true);

const COLORS = { bone: 0x8f8f8f, sel: 0x4f86e8, active: 0xa9caff, ik: 0xd9c23a, control: 0xe39a3a, pole: 0xe39a3a };
const octa = (() => {
  const w = 0.1, p = [[0, 0, 0], [w, 0.12, w], [w, 0.12, -w], [-w, 0.12, -w], [-w, 0.12, w], [0, 1, 0]];
  const f = [[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 1, 4], [5, 1, 2], [5, 2, 3], [5, 3, 4], [5, 4, 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(f.flat().flatMap(i => p[i])), 3));
  g.computeVertexNormals();
  return g;
})();
const octaEdges = new THREE.EdgesGeometry(octa);
const meshMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc5, roughness: 0.62, metalness: 0.02 });
const capMat = new THREE.MeshStandardMaterial({ color: 0xe0813a, roughness: 0.5 });
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.22, depthWrite: false });

// The piece of mesh each bone carries (rigid, no skinning: this lab is about the bones).
function pieceGeometry(b) {
  const L = b.length;
  const capsule = r => { const g = new THREE.CapsuleGeometry(r, Math.max(0.01, L - r * 0.6), 6, 16); g.translate(0, L / 2, 0); return g; };
  const box = (x, y, z, cy = L / 2, cz = 0) => { const g = new THREE.BoxGeometry(x, y, z); g.translate(0, cy, cz); return g; };
  switch (b.name) {
    case 'Chest': return box(1.0, 1.05, 0.55, 0.35);
    case 'Shoulder': return capsule(0.17);
    case 'UpperArm': return capsule(0.19);
    case 'Forearm': return capsule(0.155);
    case 'Hand': return box(0.3, L + 0.05, 0.1, L / 2);
    case 'Hips': return box(1.0, 0.45, 0.55, 0.12);
    case 'Thigh': return capsule(0.22);
    case 'Shin': return capsule(0.17);
    case 'Foot': return box(0.3, L + 0.1, 0.16, L / 2 - 0.04, 0.02);
    default: return null;
  }
}
function controlShape(b) {
  if (b.type === 'control') {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55, 0.95, 0.06)); g.translate(0, -0.2, -0.14);
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLORS.control, depthTest: false, transparent: true }));
  }
  const g = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.12, 0));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLORS.pole, depthTest: false, transparent: true }));
}
let objs = null;
function buildScene() {
  if (objs) { scene.remove(objs.root); }
  const root = new THREE.Group();
  const bones = S.rig.bones.map(b => {
    const o = { node: new THREE.Group() };
    if (b.type === 'bone') {
      o.octa = new THREE.Mesh(octa, new THREE.MeshBasicMaterial({ color: COLORS.bone, transparent: true, opacity: 0.6, depthTest: false }));
      o.edges = new THREE.LineSegments(octaEdges, new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false, transparent: true }));
      o.octa.renderOrder = 10; o.edges.renderOrder = 11; o.octa.add(o.edges); o.node.add(o.octa);
    } else { o.shape = controlShape(b); o.shape.renderOrder = 12; o.node.add(o.shape); }
    const g = pieceGeometry(b);
    if (g) {
      o.piece = new THREE.Mesh(g, meshMat); o.node.add(o.piece);
      // The mesh does not change when a bone is rolled in Edit Mode: undo the roll for the piece.
      if (S.rig.roll && (b.name === 'Thigh' || b.name === 'Shin')) o.piece.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -S.rig.roll * Math.PI / 180);
      // A kneecap on the front of the thigh and the shin, facing where the knee was modelled.
      if (b.name === 'Thigh' || b.name === 'Shin') {
        const phi = Math.atan2(S.rig.kneeSide || 0, Math.max(1e-6, S.rig.knee || 0)), r = b.name === 'Thigh' ? 0.22 : 0.17;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.12, b.length * 0.5, 0.05), capMat);
        cap.position.set(Math.sin(phi) * r, b.length * (b.name === 'Thigh' ? 0.7 : 0.3), -Math.cos(phi) * r); cap.rotation.y = -phi; o.piece.add(cap);
      }
    }
    o.axes = new THREE.AxesHelper(0.35); o.axes.material.depthTest = false; o.axes.renderOrder = 13; o.node.add(o.axes);
    root.add(o.node);
    return o;
  });
  const dashed = color => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.06, depthTest: false, transparent: true })); l.renderOrder = 14; root.add(l); return l; };
  const ikLine = dashed(0xe8c14a), poleLine = dashed(0xdddddd), planeLine = dashed(0x5fd08a), parentLines = S.rig.bones.map(() => dashed(0x9a9a9a));
  // Joints of Edit Mode: the heads and tails of the deforming bones
  const joints = new THREE.Group(); root.add(joints);
  const jointGeo = new THREE.SphereGeometry(0.07, 16, 12);
  S.rig.bones.forEach(b => { if (b.type !== 'bone') return; for (const end of ['h', 't']) { const m = new THREE.Mesh(jointGeo, new THREE.MeshBasicMaterial({ color: 0x1b1b1b, depthTest: false, transparent: true })); m.renderOrder = 16; m.userData = { bone: b.name, end }; joints.add(m); } });
  // Ghost pose and cup
  const extras = new THREE.Group(); root.add(extras);
  scene.add(root);
  // Stage 3: the circle of the knee around the hip–ankle line, the IK knee (orange) and the modelled knee (green).
  const ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xdedede, depthTest: false, transparent: true, opacity: 0.8 })); ring.renderOrder = 14; root.add(ring);
  const dot = color => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true })); m.renderOrder = 17; root.add(m); return m; };
  const kneeDot = dot(0xffa629), modelDot = dot(0x5fd08a);
  objs = { root, bones, ikLine, poleLine, planeLine, parentLines, extras, joints, ring, kneeDot, modelDot };
  buildExtras();
}
function buildExtras() {
  const g = objs.extras; g.clear();
  if (step().ghost) {
    const st = withPose(S.rig, GHOST_POSE), { W } = RG.solve(S.rig, st);
    for (const n of ['UpperArm', 'Forearm', 'Hand']) {
      const b = bone(n), w = W[S.rig.index[n]], m = new THREE.Mesh(pieceGeometry(b), ghostMat);
      m.position.copy(w.h); m.quaternion.copy(w.q); g.add(m);
    }
    for (const p of ghostPoints(S.rig)) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7fd3ff })); s.position.copy(p); g.add(s); }
  }
  if (step().cup) {
    const p = cupPoint(S.rig);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.38, 24), new THREE.MeshStandardMaterial({ color: 0xd9674a, roughness: 0.5 }));
    cup.position.set(p.x + 0.12, p.y - 0.12, p.z); g.add(cup);
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 }));
    table.position.set(p.x + 0.12, p.y - 0.36, p.z); g.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, p.y - 0.41, 8), table.material);
    leg.position.set(p.x + 0.12, (p.y - 0.41) / 2, p.z); g.add(leg);
    const mark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd24a, depthTest: false })); mark.position.copy(p); mark.renderOrder = 15; g.add(mark);
  }
}
function isIkOwner(n) { return S.st.ik && S.st.ik.owner === n; }
const isKnee = (bn, end) => (bn === 'Thigh' && end === 't') || (bn === 'Shin' && end === 'h');
function updateScene() {
  syncRig();
  S.res = RG.solve(S.rig, S.st);
  // Edit Mode shows the rest pose; the checks still read the posed rig (S.res).
  const edit = S.mode === 'edit', shown = edit ? RG.solve(S.rig, RG.defaultState(S.rig)) : S.res;
  const { W } = shown, info = edit ? { active: false } : S.res.info;
  objs.joints.visible = edit;
  for (const m of objs.joints.children) {
    const w = W[S.rig.index[m.userData.bone]]; m.position.copy(m.userData.end === 'h' ? w.h : w.t);
    const knee = isKnee(m.userData.bone, m.userData.end);
    m.material.color.set(knee && S.editSel === 'knee' ? 0xffa629 : knee ? 0xdddddd : 0x2a2a2a);
    m.scale.setScalar(knee ? 1.15 : 0.8);
  }
  S.rig.bones.forEach((b, i) => {
    const o = objs.bones[i], w = W[i];
    o.node.position.copy(w.h); o.node.quaternion.copy(w.q);
    const selected = !edit && S.sel.has(b.name), active = !edit && S.active === b.name;
    const col = active ? COLORS.active : selected ? COLORS.sel : isIkOwner(b.name) ? COLORS.ik : b.type === 'bone' ? COLORS.bone : COLORS[b.type];
    if (o.octa) { o.octa.scale.setScalar(b.length); o.octa.material.color.set(col); o.octa.material.opacity = selected ? 0.85 : 0.55; o.axes.scale.setScalar(1 / b.length); }
    if (o.shape) o.shape.material.color.set(col);
    if (o.piece) o.piece.visible = S.show.mesh;
    o.axes.visible = S.show.axes;
    // relationship line from a disconnected child to its parent's tail
    const line = objs.parentLines[i];
    line.visible = S.show.lines && b.parentIndex >= 0 && !b.connected;
    if (line.visible) { line.geometry.setFromPoints([w.h, W[b.parentIndex].t]); line.computeLineDistances(); }
  });
  const ik = S.st.ik;
  objs.ikLine.visible = S.show.lines && !!(info.active);
  if (objs.ikLine.visible) { const tipI = info.chain[info.chain.length - 1]; objs.ikLine.geometry.setFromPoints([W[tipI].t, info.target]); objs.ikLine.computeLineDistances(); }
  objs.poleLine.visible = S.show.lines && !!(info.active && ik.pole && S.rig.index[ik.pole] != null && info.chain.length === 2);
  if (objs.poleLine.visible) { objs.poleLine.geometry.setFromPoints([W[info.chain[1]].h, W[S.rig.index[ik.pole]].h]); objs.poleLine.computeLineDistances(); }
  // Stage 3: the direction the knee is modelled in (the plane of the leg), where the pole belongs.
  objs.planeLine.visible = !!step().lines && S.rig.kind === 'leg';
  if (objs.planeLine.visible) { const k = S.rig.bones[S.rig.index.Shin].headV; objs.planeLine.geometry.setFromPoints([k, planePole(S.st, 1.9)]); objs.planeLine.computeLineDistances(); }
  const showRing = !!step().ring && S.rig.kind === 'leg' && !!S.st.ik && !edit;
  objs.ring.visible = objs.kneeDot.visible = objs.modelDot.visible = showRing;
  if (showRing) {
    const r = ringInfo(S.st), v2 = r.u.clone().cross(r.bend).normalize(), pts = [];
    for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; pts.push(r.center.clone().addScaledVector(r.bend, Math.cos(a) * r.radius).addScaledVector(v2, Math.sin(a) * r.radius)); }
    objs.ring.geometry.setFromPoints(pts); objs.kneeDot.position.copy(r.knee); objs.modelDot.position.copy(r.modelled);
  }
  requestRender();
}
let renderQueued = false;
function requestRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderer.render(scene, camera); }); }
function resize() {
  const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); requestRender();
}
const FRAMES = { arm: { c: [1.5, 2.9, 0.3], size: 5.3 }, leg: { c: [0.3, 1.25, 0.35], size: 4.2 } };
function frameAll(view = null) {
  const f = FRAMES[S.rig.kind], c = new THREE.Vector3(...f.c);
  const dist = f.size / (2 * Math.tan(camera.fov * Math.PI / 360)) * (camera.aspect < 1.2 ? 1.35 / Math.max(0.6, camera.aspect) : 1);
  const dir = { front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001] }[view] ?? (S.rig.kind === 'leg' ? [0.95, 0.3, 0.8] : [0.2, 0.28, 1]);
  controls.target.copy(c); camera.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(dist)); camera.up.set(0, 1, 0); camera.lookAt(c); controls.update();
  requestRender();
}

// ─── Picking ─────────────────────────────────────────────────────────────────
const tmpV = new THREE.Vector3();
function toScreen(v) { const r = canvas.getBoundingClientRect(); tmpV.copy(v).project(camera); return [(tmpV.x + 1) / 2 * r.width, (1 - tmpV.y) / 2 * r.height]; }
function shapeCenter(b, w) {
  if (b.type === 'control') return new THREE.Vector3(0, -0.2, -0.14).applyQuaternion(w.q).add(w.h);
  return w.h.clone();
}
// Controls win over the bones under them (the foot box sits on the Foot and on the tip of the Shin),
// so clicking a control always selects it, as custom shapes do in a Blender rig.
const BOX_CORNERS = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x * 0.275, y * 0.475 - 0.2, z * 0.03 - 0.14])));
function hull(pts) {
  pts = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function nearPolygon(poly, x, y, margin) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  if (inside) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L));
    if (Math.hypot(ax + vx * u - x, ay + vy * u - y) <= margin) return true;
  }
  return false;
}
function pickBone(x, y) {
  const { W } = S.res;
  let best = null, bd = Infinity;
  S.rig.bones.forEach((b, i) => {
    if (b.type === 'bone') return;
    const w = W[i];
    let d;
    if (b.type === 'control') {
      const poly = hull(BOX_CORNERS.map(c => toScreen(new THREE.Vector3(...c).applyQuaternion(w.q).add(w.h))));
      if (!nearPolygon(poly, x, y, 8)) return;
      const p = toScreen(shapeCenter(b, w)); d = Math.hypot(p[0] - x, p[1] - y);
    } else {
      const p = toScreen(w.h); d = Math.hypot(p[0] - x, p[1] - y);
      if (d > 24) return;
    }
    if (d < bd) { bd = d; best = b.name; }
  });
  if (best) return best;
  S.rig.bones.forEach((b, i) => {
    if (b.type !== 'bone') return;
    const w = W[i], a = toScreen(w.h), c = toScreen(w.t), vx = c[0] - a[0], vy = c[1] - a[1], L = vx * vx + vy * vy || 1;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / L));
    const d = Math.hypot(a[0] + vx * u - x, a[1] + vy * u - y);
    if (d <= 12 && d < bd) { bd = d; best = b.name; }
  });
  return best;
}
function localXY(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function select(name, extend) {
  if (!name) { if (!extend) { S.sel.clear(); S.active = null; } }
  else if (extend) {
    if (S.sel.has(name) && S.active === name) { S.sel.delete(name); S.active = [...S.sel].pop() ?? null; }
    else { S.sel.add(name); S.active = name; }
  } else { S.sel = new Set([name]); S.active = name; }
  updateScene(); renderProps(); drawOverlay();
}

// ─── Modal transforms: G and R, with axis constraints and typed numbers ──────
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }; // Blender axes
function startModal(kind) {
  if (S.mode === 'edit') {
    if (kind !== 'grab') return msg('In Edit Mode this lab only moves the knee joint (G).', true);
    if (S.editSel !== 'knee') return msg('Click the knee joint first (the ball between Thigh and Shin).', true);
    if (!S.pointer) S.pointer = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
    const W0 = RG.solve(S.rig, RG.defaultState(S.rig)).W;
    S.modal = { kind: 'edit', prev: JSON.stringify(S.st), base: S.st.knee || 0, W0, x0: S.pointer.x, y0: S.pointer.y, axis: null, num: '', h: W0[S.rig.index.Shin].h.clone() };
    host.classList.add('modal'); updateModal(); return;
  }
  if (!S.active) return msg('Select a bone first.');
  let names = [...S.sel];
  if (kind === 'grab') {
    const free = names.filter(n => bone(n).canMove);
    if (!free.length) {
      const a = bone(S.active), parent = a.parentIndex >= 0 ? S.rig.bones[a.parentIndex] : null;
      if (parent && parent.canMove && parent.type !== 'bone') return msg(tr('{b} follows {c}: select {c} (its box) to move it.', { b: a.name, c: parent.name }), true);
      return msg(a.connected ? 'This bone is connected to its parent: it can only rotate.' : 'This bone is locked in this lab: it can only rotate.', true);
    }
    names = free;
  }
  if (!S.pointer) S.pointer = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  const W0 = S.res.W;
  S.modal = { kind, names, prev: JSON.stringify(S.st), base: RG.cloneState(S.st), W0, x0: S.pointer.x, y0: S.pointer.y, axis: null, space: null, num: '', center: toScreen(W0[S.rig.index[S.active]].h) };
  host.classList.add('modal');
  updateModal();
}
function axisWorld(m) {
  if (!m.axis) return null;
  if (m.space === 'local') { const w = m.W0[S.rig.index[S.active]]; return new THREE.Vector3(...AXES[m.axis]).applyQuaternion(w.q).normalize(); }
  return RG.fromBlender(AXES[m.axis]).normalize();
}
function updateModal() {
  const m = S.modal; if (!m) return;
  const p = S.pointer, typed = m.num !== '' && m.num !== '-' && !isNaN(+m.num) ? +m.num : null;
  if (m.kind === 'edit') {
    // Only along Blender's Y (forward is −Y), whatever the mouse does.
    let dz;
    if (typed != null) dz = -typed;
    else {
      const ax = new THREE.Vector3(0, 0, 1), a = toScreen(m.h), b = toScreen(m.h.clone().add(ax)), sx = b[0] - a[0], sy = b[1] - a[1], L2 = sx * sx + sy * sy;
      if (L2 > 4) dz = ((p.x - m.x0) * sx + (p.y - m.y0) * sy) / L2;
      else { const dist = camera.position.distanceTo(m.h); dz = (p.x - m.x0) * 2 * dist * Math.tan(camera.fov * Math.PI / 360) / canvas.clientHeight; }
    }
    S.st = JSON.parse(m.prev); S.st.knee = Math.max(-0.3, Math.min(0.3, Math.round((m.base + dz) * 1000) / 1000));
    $('#op-readout').textContent = `${t('Move')}  Y ${(-(S.st.knee - m.base)).toFixed(3)} m  · ${t('only Y for the knee in this lab')}${m.num ? `  [${m.num}]` : ''}`;
    $('#op-readout').hidden = false;
    updateScene(); return;
  }
  S.st = RG.cloneState(m.base);
  const ax = axisWorld(m);
  const axisLabel = m.axis ? `${t(m.space === 'local' ? 'Local' : 'Global')} ${m.axis.toUpperCase()}` : '';
  if (m.kind === 'grab') {
    let delta;
    const h = m.W0[S.rig.index[S.active]].h;
    if (typed != null) delta = (ax || RG.fromBlender([1, 0, 0])).multiplyScalar(typed);
    else if (ax) {
      const a = toScreen(h), b = toScreen(h.clone().add(ax)), sx = b[0] - a[0], sy = b[1] - a[1], L2 = sx * sx + sy * sy || 1;
      delta = ax.clone().multiplyScalar(((p.x - m.x0) * sx + (p.y - m.y0) * sy) / L2);
    } else {
      const dist = camera.position.distanceTo(h), wpp = 2 * dist * Math.tan(camera.fov * Math.PI / 360) / canvas.clientHeight;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      delta = right.multiplyScalar((p.x - m.x0) * wpp).add(up.multiplyScalar(-(p.y - m.y0) * wpp));
    }
    for (const n of m.names) RG.addWorldLocation(S.rig, S.st, m.W0, n, delta);
    const bd = RG.toBlender(delta);
    $('#op-readout').textContent = `${t('Move')}  X ${bd[0].toFixed(2)}  Y ${bd[1].toFixed(2)}  Z ${bd[2].toFixed(2)}${axisLabel ? '  · ' + axisLabel : ''}${m.num ? `  [${m.num}]` : ''}`;
  } else {
    const view = camera.position.clone().sub(m.W0[S.rig.index[S.active]].h).normalize();
    let angle;
    if (typed != null) angle = typed;
    else {
      const a0 = Math.atan2(-(m.y0 - m.center[1]), m.x0 - m.center[0]), a1 = Math.atan2(-(p.y - m.center[1]), p.x - m.center[0]);
      angle = (a1 - a0) * 180 / Math.PI; angle = ((angle + 540) % 360) - 180;
      if (ax && ax.dot(view) < 0) angle = -angle;
    }
    const axis = ax || view;
    const dq = new THREE.Quaternion().setFromAxisAngle(axis, angle * Math.PI / 180);
    for (const n of m.names) RG.setWorldRotation(S.rig, S.st, m.W0, n, dq.clone().multiply(m.W0[S.rig.index[n]].q));
    $('#op-readout').textContent = `${t('Rotate')}  ${angle.toFixed(typed != null ? 2 : 1)}°${axisLabel ? '  · ' + axisLabel : ''}${m.num ? `  [${m.num}]` : ''}`;
  }
  $('#op-readout').hidden = false;
  updateScene(); renderTransformLive();
}
function endModal(ok) {
  const m = S.modal; if (!m) return;
  S.modal = null; host.classList.remove('modal'); $('#op-readout').hidden = true;
  if (ok) { pushUndo(JSON.parse(m.prev)); changed(); if (m.kind === 'edit') msg(S.st.knee > 0.005 ? 'The knee is bent forward in the rest pose. Tab back to Pose Mode.' : S.st.knee < -0.005 ? 'The knee is bent backwards: the IK will bend it that way.' : 'The leg is straight again.', S.st.knee < -0.005); }
  else { S.st = JSON.parse(m.prev); changed(false); msg('Cancelled'); }
}
function modalKey(e) {
  const m = S.modal, k = e.key;
  if (k === 'Escape') return endModal(false);
  if (k === 'Enter' || k === ' ') return endModal(true);
  const low = k.toLowerCase();
  if (m.kind === 'edit' && (low === 'x' || low === 'z')) { msg('Only Y for the knee in this lab.'); return; }
  if (m.kind === 'edit' && low === 'y') { m.axis = 'y'; updateModal(); return; }
  if (low === 'x' || low === 'y' || low === 'z') {
    if (m.axis !== low) { m.axis = low; m.space = 'global'; }
    else if (m.space === 'global') m.space = 'local';
    else { m.axis = null; m.space = null; }
  } else if (/^[0-9.]$/.test(k)) m.num += k;
  else if (k === '-') m.num = m.num.startsWith('-') ? m.num.slice(1) : '-' + m.num;
  else if (k === 'Backspace') m.num = m.num.slice(0, -1);
  else return;
  updateModal();
}

function pickJoint(x, y) {
  let best = null, bd = 18;
  for (const m of objs.joints.children) { const p = toScreen(m.position), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = m.userData; } }
  return best;
}
canvas.addEventListener('pointerdown', e => {
  closeMenu();
  const { x, y } = localXY(e); S.pointer = { ...S.pointer, x, y };
  if (S.modal) { e.preventDefault(); endModal(e.button === 0); return; }
  if (e.button !== 0 || e.altKey) return;
  if (S.mode === 'edit') {
    const j = pickJoint(x, y);
    if (j && isKnee(j.bone, j.end)) { S.editSel = 'knee'; msg('Knee joint selected: G then Y moves it forwards or backwards.'); }
    else { S.editSel = null; if (j) msg('In this lab only the knee joint moves in Edit Mode.', true); }
    updateScene(); renderProps(); drawOverlay(); return;
  }
  select(pickBone(x, y), e.shiftKey);
});
function toggleMode() {
  if (S.modal) return;
  if (S.rig.kind !== 'leg') return msg('Edit Mode is used on the leg, in the IK stage of this lab.', true);
  S.mode = S.mode === 'pose' ? 'edit' : 'pose'; S.editSel = null;
  msg(S.mode === 'edit' ? 'Edit Mode: the bones are in their rest position. Click the knee joint.' : 'Pose Mode: the IK uses the new rest pose.');
  updateScene(); renderProps(); drawOverlay();
}
$('#mode-pill').addEventListener('click', toggleMode);
canvas.addEventListener('pointermove', e => {
  const { x, y } = localXY(e); S.pointer = { x, y, cx: e.clientX, cy: e.clientY };
  if (S.modal) updateModal();
});
canvas.addEventListener('contextmenu', e => { if (S.modal) { e.preventDefault(); endModal(false); } });

// ─── Pose operators ─────────────────────────────────────────────────────────
function clearTransform(what) {
  if (!S.sel.size) return msg('Select a bone first.');
  pushUndo();
  for (const n of S.sel) { if (what !== 'loc') S.st.pose[n].rot = [0, 0, 0]; if (what !== 'rot') S.st.pose[n].loc = [0, 0, 0]; }
  changed(); msg(what === 'rot' ? 'Rotation cleared.' : what === 'loc' ? 'Location cleared.' : 'Transforms cleared.');
}
function addIK(withTarget) {
  if (!S.active) return msg('Select a bone first.', true);
  const others = [...S.sel].filter(n => n !== S.active);
  if (withTarget && !others.length) return msg('To Active Bone needs two selected bones: first the target, then Shift-click the bone that gets the constraint.', true);
  if (bone(S.active).parentIndex < 0) return msg('This bone has no parent: an IK chain needs at least two bones.', true);
  pushUndo();
  S.st.ik = { owner: S.active, target: withTarget ? others[others.length - 1] : null, pole: null, poleAngle: 0, chain: 0, influence: 1 };
  changed(); msg(tr('IK added to {b}.', { b: S.active }));
}
function selectAll(on) { S.sel = on ? new Set(S.rig.bones.map(b => b.name)) : new Set(); S.active = on ? (S.active ?? S.rig.bones[0].name) : null; updateScene(); renderProps(); drawOverlay(); }

// ─── Menus ──────────────────────────────────────────────────────────────────
const menuEl = $('#menu');
function menuItems(kind) {
  switch (kind) {
    case 'view': return { title: 'View', items: [
      { label: 'Frame All', key: 'Home', act: () => frameAll() }, { label: 'Front', key: 'Numpad 1', act: () => frameAll('front') },
      { label: 'Right', key: 'Numpad 3', act: () => frameAll('right') }, { label: 'Top', key: 'Numpad 7', act: () => frameAll('top') }] };
    case 'select': return { title: 'Select', items: [{ label: 'All', key: 'A', act: () => selectAll(true) }, { label: 'None', key: 'Alt A', act: () => selectAll(false) }] };
    case 'pose': return { title: 'Pose', items: [
      { label: 'Rotate', key: 'R', act: () => startModal('rotate') }, { label: 'Move', key: 'G', act: () => startModal('grab') }, { hr: true },
      { label: 'Clear Rotation', key: 'Alt R', act: () => clearTransform('rot') }, { label: 'Clear Location', key: 'Alt G', act: () => clearTransform('loc') },
      { label: 'Clear All Transforms', act: () => clearTransform('all') }, { hr: true },
      { label: 'Add IK', key: 'Shift I', act: () => openMenu('addik', lastMenuPos.x, lastMenuPos.y) }, { hr: true },
      { label: 'Undo', key: 'Ctrl Z', act: undo }] };
    case 'addik': return { title: 'Add IK', items: [{ label: 'To Active Bone', act: () => addIK(true) }, { label: 'Without Targets', act: () => addIK(false) }] };
    case 'constraint': return { title: 'Add Bone Constraint', items: [
      { label: 'Inverse Kinematics', act: () => addIK(false) }, { hr: true },
      { label: 'Copy Location', disabled: true }, { label: 'Copy Rotation', disabled: true }, { label: 'Damped Track', disabled: true }, { label: 'Limit Rotation', disabled: true }] };
  }
}
let lastMenuPos = { x: 0, y: 0 };
function openMenu(kind, x, y) {
  const m = menuItems(kind); lastMenuPos = { x, y };
  menuEl.innerHTML = `<div class="menu-title">${esc(t(m.title))}</div>` + m.items.map((it, i) => it.hr ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}"${it.disabled ? ` disabled title="${esc(t('Not part of this lab.'))}"` : ''}><span class="m-label">${esc(t(it.label))}</span>${it.key ? `<span class="m-key">${esc(it.key)}</span>` : ''}</button>`).join('');
  menuEl.hidden = false;
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  menuEl.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  menuEl.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b || b.disabled) return; const it = m.items[+b.dataset.i]; closeMenu(); it.act(); };
  menuEl.querySelector('button:not([disabled])')?.focus();
}
function closeMenu() { menuEl.hidden = true; document.querySelectorAll('.menu-button[aria-expanded]').forEach(b => b.removeAttribute('aria-expanded')); }
document.querySelectorAll('.menu-button[data-menu]').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation(); const r = b.getBoundingClientRect(); openMenu(b.dataset.menu, r.left, r.bottom + 2); b.setAttribute('aria-expanded', 'true');
}));
document.addEventListener('pointerdown', e => { if (!menuEl.hidden && !menuEl.contains(e.target) && !e.target.closest('.menu-button, .add-constraint')) closeMenu(); });

// ─── Properties ─────────────────────────────────────────────────────────────
const BONE_ICON = '<svg class="b-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10 5 4 6 2 7 4 10 10 6 8z" fill="none" stroke="currentColor"/></svg>';
const CTRL_ICON = '<svg class="b-icon" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="3" width="8" height="6" fill="none" stroke="currentColor"/></svg>';
const fmt = v => (Math.round(v * 1000) / 1000).toString();
function editPanel() {
  const k = S.st.knee || 0;
  return `<div class="panel"><h4>${esc(t('Edit Mode'))}<small>${esc(t('rest pose'))}</small></h4>
    <p class="edit-note">${esc(t(S.editSel === 'knee' ? 'Knee joint (tail of Thigh, head of Shin).' : 'Click the knee joint to select it.'))}</p>
    <div class="tf-axes"><span></span><span class="ax-x">X</span><span class="ax-y">Y</span><span class="ax-z">Z</span></div>
    <div class="tf-grid"><span>${esc(t('Knee'))}</span><input type="number" value="${fmt(0.35 + (S.st.kneeSide || 0))}" disabled><input type="number" step="0.01" id="knee-y" value="${fmt(-k)}"${S.editSel === 'knee' ? '' : ' disabled'}><input type="number" value="1.2" disabled></div>
    <p class="edit-note">${esc(t('Blender axes: −Y is the front. Only the knee moves in this lab.'))}</p>
    ${step().roll ? `<div class="tf-grid roll-row"><span data-no-i18n>Roll</span><input type="number" step="1" id="bone-roll" value="${fmt(S.st.roll || 0)}"><em>° · Thigh, Shin</em></div><p class="edit-note">${esc(t('Bone › Roll: turns the bones around their own Y axis. The mesh does not move.'))}</p>` : ''}</div>`;
}
function renderProps() {
  const rig = S.rig, a = S.active ? bone(S.active) : null;
  $('#mode-pill').textContent = S.mode === 'edit' ? 'Edit Mode' : 'Pose Mode'; $('#mode-pill').classList.toggle('edit', S.mode === 'edit');
  if (S.mode === 'edit') { $('#props').innerHTML = editPanel() + `<div class="panel" id="readout-panel">${readoutHtml()}</div>`; return; }
  let html = `<div class="panel"><h4>${esc(t('Bones'))}<small>${esc(t('click · Shift click'))}</small></h4><div class="bone-list">`;
  html += rig.bones.map(b => `<button type="button" class="bone-row${S.sel.has(b.name) ? ' sel' : ''}${S.active === b.name ? ' active' : ''}" data-bone="${b.name}">${b.type === 'bone' ? BONE_ICON : CTRL_ICON}<span data-no-i18n>${esc(b.name)}</span><span class="b-tag">${esc(t(b.type === 'control' ? 'IK control' : b.type === 'pole' ? 'pole' : isIkOwner(b.name) ? 'IK' : ''))}</span></button>`).join('');
  html += `</div></div>`;
  html += `<div class="panel" id="tf-panel">${transformHtml(a)}</div>`;
  html += `<div class="panel"><h4>${esc(t('Bone Constraints'))}</h4>${constraintHtml(a)}</div>`;
  html += `<div class="panel" id="readout-panel">${readoutHtml()}</div>`;
  $('#props').innerHTML = html;
}
function transformHtml(a) {
  if (!a) return `<h4>${esc(t('Transform'))}</h4><p class="sb-empty">${esc(t('Click a bone to select it.'))}</p>`;
  const p = S.st.pose[a.name];
  const loc = a.canMove ? '' : ' disabled';
  return `<h4>${esc(t('Transform'))}<small data-no-i18n>${esc(a.name)}</small></h4>
    <div class="tf-axes"><span></span><span class="ax-x">X</span><span class="ax-y">Y</span><span class="ax-z">Z</span></div>
    <div class="tf-grid"><span>${esc(t('Location'))}</span>${p.loc.map((v, i) => `<input type="number" step="0.05" data-tf="loc" data-i="${i}" value="${fmt(v)}"${loc}>`).join('')}</div>
    <div class="tf-grid"><span>${esc(t('Rotation'))}</span>${p.rot.map((v, i) => `<input type="number" step="1" data-tf="rot" data-i="${i}" value="${fmt(v)}">`).join('')}</div>
    ${S.rig.kind === 'leg' && S.st.ik ? `<button type="button" class="add-constraint" id="apply-visual" data-no-i18n>Apply › Visual Transform <kbd>Ctrl A</kbd></button>` : ''}
    <p class="sb-empty">${esc(t(a.canMove ? 'XYZ Euler, in degrees. Location and rotation are in the bone\'s own axes.' : a.connected ? 'Connected to its parent: only rotation. XYZ Euler, in degrees, in the bone\'s own axes.' : 'Location locked in this lab. XYZ Euler, in degrees, in the bone\'s own axes.'))}</p>`;
}
function renderTransformLive() { const el = $('#tf-panel'); if (el) el.innerHTML = transformHtml(S.active ? bone(S.active) : null); const r = $('#readout-panel'); if (r) r.innerHTML = readoutHtml(); }
function constraintHtml(a) {
  if (!a) return `<p class="sb-empty">${esc(t('Select a bone to see its constraints.'))}</p>`;
  const ik = S.st.ik;
  if (ik && ik.owner === a.name) {
    const opts = (val, none) => (none ? `<option value="">—</option>` : '') + S.rig.bones.filter(b => b.name !== a.name).map(b => `<option value="${b.name}"${val === b.name ? ' selected' : ''}>${b.name}</option>`).join('');
    let h = `<div class="constraint"><div class="constraint-head"><span class="c-icon">⛓</span><span>IK</span><button type="button" id="ik-delete" title="${esc(t('Delete constraint'))}">×</button></div>
      <div class="c-row"><span>Target</span><span class="c-fixed" data-no-i18n>${esc(S.rig.name)}</span></div>
      <div class="c-row"><span>Bone</span><select data-ik="target">${opts(ik.target, true)}</select></div>
      <div class="c-sep"></div>
      <div class="c-row"><span>Pole Target</span><select data-ik="pole">${opts(ik.pole, true)}</select></div>
      ${ik.pole ? `<div class="c-row"><span>Pole Angle</span><input type="number" step="1" data-ik="poleAngle" value="${fmt(ik.poleAngle)}"></div>` : ''}
      <div class="c-sep"></div>
      <div class="c-row"><span>Chain Length</span><input type="number" min="0" max="5" step="1" data-ik="chain" value="${ik.chain}"></div>
      <div class="c-row"><span>Influence</span><span class="c-inf"><input type="range" min="0" max="1" step="0.01" data-ik="influence" value="${ik.influence}"><output>${(+ik.influence).toFixed(2)}</output></span></div></div>`;
    const hints = [];
    if (!ik.target) hints.push('Choose a target bone: the tip of the chain will reach for it.');
    if (ik.chain === 0) hints.push('Chain Length 0 = every parent up to the root.');
    if (S.res?.info?.active && S.res.info.reached === false) hints.push('The target is out of reach: the chain stretches out straight.');
    if (hints.length) h += hints.map(x => `<p class="c-hint">${esc(t(x))}</p>`).join('');
    return h;
  }
  let h = `<button type="button" class="add-constraint" id="add-constraint">＋ ${esc(t('Add Bone Constraint'))}</button>`;
  if (ik) h += `<p class="sb-empty" style="margin-top:6px">${esc(tr('The IK constraint of this armature is on {b}.', { b: ik.owner }))}</p>`;
  return h;
}
function doApplyVisual() {
  if (!S.sel.size) return msg('Select the bones first (Thigh and Shin).', true);
  pushUndo(); applyVisual(S.st, [...S.sel]); S.flags.appliedVisual = true; changed();
  msg('Visual Transform applied: the bones keep the IK pose in their own rotations.');
}
function readoutHtml() {
  const { W, info } = S.res, rig = S.rig, s = step();
  let h = `<h4>${esc(t('Readout'))}</h4>`;
  const row = (label, val, good) => `<div class="sb-stat${good == null ? '' : good ? ' good' : ' bad'}"><span>${esc(t(label))}</span><b>${val}</b></div>`;
  if (rig.kind === 'arm') {
    const tip = RG.posOf(rig, W, 'Hand', 't');
    if (s.ghost) { const g = ghostPoints(rig); const d = Math.max(...['UpperArm', 'Forearm', 'Hand'].map((n, k) => RG.posOf(rig, W, n, 't').distanceTo(g[k]))); h += row('Farthest from the ghost', d.toFixed(2) + ' m', d < 0.25); }
    if (s.cup) { const d = tip.distanceTo(cupPoint(rig)); h += row('Fingertips → cup', d.toFixed(2) + ' m', d < 0.15); h += row('Chest twist', RG.rotAngle(S.st.pose.Chest.rot).toFixed(0) + '°', RG.rotAngle(S.st.pose.Chest.rot) >= 20); }
    const bt = RG.toBlender(tip); h += row('Fingertips (X Y Z)', bt.map(v => v.toFixed(2)).join('  '));
  } else {
    if (stage().id === 'pole' && S.st.ik) {
      const j = restJump(S.st), off = poleOffPlane(S.st);
      if (step().ring) { const a = ringInfo(S.st).angle; h += row('Knee off its modelled direction', a.toFixed(0) + '°', step().id === 'p0' ? a > 80 : a < 3); }
      if (step().id !== 'p3' && step().id !== 'p0') {
        h += row('Pole off the leg plane', off.toFixed(1) + '°', off < 3);
        h += row('Knee jump when IK turns on', (j.knee * 100).toFixed(1) + ' cm', j.knee < 0.01);
        h += row('Leg twist when IK turns on', j.twist.toFixed(1) + '°', j.twist < 3);
      } else { const pop = switchPop(S.st); h += row('Pop when switching IK → FK', (pop * 100).toFixed(1) + ' cm', pop < 0.02); }
    }
    if (info.active) {
      h += row('Foot → target', info.dist.toFixed(3) + ' m', info.dist < 0.02);
      if (info.kneeDir) {
        const out = Math.atan2(info.kneeDir.x, info.kneeDir.z) * 180 / Math.PI, fwd = kneeForward(info);
        const where = fwd > 0.95 ? 'forward' : fwd < -0.5 ? 'backwards' : out > 0 ? 'outwards' : 'inwards';
        h += row('The knee points', `${t(where)} · ${out.toFixed(0)}°`, fwd > 0.5);
      }
    } else h += row('IK', t('none: the leg is FK'));
    const kb = S.st.knee || 0;
    h += row('Knee bend (Edit Mode)', Math.abs(kb) < 0.005 ? t('straight') : `${(Math.abs(kb) * 100).toFixed(1)} cm ${t(kb > 0 ? 'forward' : 'backwards')}`, kb >= 0.02);
    h += row('Hips height', RG.posOf(rig, W, 'Hips').y.toFixed(2) + ' m');
  }
  return h;
}
$('#props').addEventListener('click', e => {
  const b = e.target.closest('[data-bone]'); if (b) { select(b.dataset.bone, e.shiftKey); return; }
  if (e.target.closest('#add-constraint')) { const r = e.target.closest('#add-constraint').getBoundingClientRect(); openMenu('constraint', r.left, r.bottom + 2); return; }
  if (e.target.closest('#apply-visual')) { doApplyVisual(); return; }
  if (e.target.closest('#ik-delete')) { pushUndo(); S.st.ik = null; changed(); msg('Constraint deleted.'); }
});
$('#props').addEventListener('input', e => {
  const k = e.target.dataset.ik;
  if (k === 'influence') {
    if (!inputUndo) { pushUndo(); inputUndo = true; }
    S.st.ik.influence = +e.target.value; e.target.nextElementSibling.textContent = S.st.ik.influence.toFixed(2);
    if (S.st.ik.influence <= 0.05) S.flags.lowInfluence = true;
    updateScene(); const r = $('#readout-panel'); if (r) r.innerHTML = readoutHtml();
  }
});
let inputUndo = false;
$('#props').addEventListener('change', e => {
  const k = e.target.dataset.ik, tf = e.target.dataset.tf;
  if (k === 'influence') { inputUndo = false; changed(); return; }
  if (k) {
    pushUndo();
    const v = e.target.value;
    if (k === 'target' || k === 'pole') S.st.ik[k] = v || null;
    if (k === 'poleAngle') S.st.ik.poleAngle = +v || 0;
    if (k === 'chain') S.st.ik.chain = Math.max(0, Math.min(5, Math.round(+v || 0)));
    changed(); return;
  }
  if (tf && S.active) { pushUndo(); S.st.pose[S.active][tf][+e.target.dataset.i] = +e.target.value || 0; changed(); }
  if (e.target.id === 'bone-roll') { pushUndo(); S.st.roll = Math.max(-180, Math.min(180, +e.target.value || 0)); changed(); return; }
  if (e.target.id === 'knee-y') { pushUndo(); S.st.knee = Math.max(-0.3, Math.min(0.3, -(+e.target.value || 0))); changed(); }
});

function drawOverlay() {
  if (S.mode === 'edit') { $('#view-overlay').innerHTML = `<div>${esc(t('User Perspective'))}</div><div data-no-i18n>(1) ${esc(S.rig.name)} · Edit Mode${S.editSel ? ' : <b>Knee</b>' : ''}</div>`; return; }
  $('#view-overlay').innerHTML = `<div>${esc(t('User Perspective'))}</div><div data-no-i18n>(1) ${esc(S.rig.name)}${S.active ? ` : <b>${esc(S.active)}</b>` : ''}</div>`;
}
function syncToggles() { $('#o-mesh').checked = S.show.mesh; $('#o-lines').checked = S.show.lines; $('#o-axes').checked = S.show.axes; }
$('#o-mesh').onchange = e => { S.show.mesh = e.target.checked; updateScene(); };
$('#o-lines').onchange = e => { S.show.lines = e.target.checked; updateScene(); };
$('#o-axes').onchange = e => { S.show.axes = e.target.checked; updateScene(); };

// ─── Stages, guide and step card (each step loads its own pose) ─────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-stage]'); if (!b) return;
  saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(true);
});
const doneKey = i => `${stage().id}-${i}`;
const ctx = () => ({ rig: S.rig, W: S.res.W, info: S.res.info, flags: S.flags });
const stepDone = i => i === S.step ? !!step().check(S.st, ctx()) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide');
  g.classList.toggle('three', st.steps.length === 3); g.classList.toggle('two', st.steps.length === 2);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(false); });
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
  if (id === 'reset-step') { pushUndo(); S.st = step().start(rigOf(null)); S.flags = {}; changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); const st = step().start(rigOf(null)); step().solve(st, rigOf(st), S.flags); S.st = st; changed(); msg('This is one possible solution. Ctrl Z brings your pose back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(false); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(true); }
});
let lastOk = null;
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) msg(tr('✓ Step done: {s}', { s: t(step().title) }));
  lastOk = ok;
}
function changed(save = true) {
  updateScene();
  if (save) saveData();
  checkProgress(); renderProps(); renderGuide(); renderStepCard(); drawOverlay();
}
function enterStep(newRig) {
  const prevKind = S.rig?.kind;
  loadData(); lastOk = null; S.focus = null;
  if (!objs || prevKind !== S.rig.kind) { buildScene(); frameAll(); } else buildScene();
  updateScene(); lastOk = stepDone(S.step);
  renderStageSwitch(); renderProps(); renderGuide(); renderStepCard(); drawOverlay(); syncToggles();
}
function renderAll() { renderStageSwitch(); renderProps(); renderGuide(); renderStepCard(); drawOverlay(); translateTitles(); }
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }

// ─── Keyboard (only while the pointer is over the workspace, like Blender) ──
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (S.modal) { e.preventDefault(); modalKey(e); return; }
  if (!S.hover && e.key !== 'Escape') return;
  const k = e.key, low = k.toLowerCase(), code = e.code, ctrl = e.ctrlKey || e.metaKey;
  let handled = true;
  if (k === 'Tab') toggleMode();
  else if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (ctrl && low === 'a' && S.mode === 'pose') { e.preventDefault(); if (S.rig.kind === 'leg' && S.st.ik) doApplyVisual(); }
  else if (S.mode === 'edit' && (low === 'r' || low === 'a' || (low === 'i' && e.shiftKey))) msg('In Edit Mode this lab only moves the knee joint (G).', true);
  else if (low === 'i' && e.shiftKey) openMenu('addik', S.pointer?.cx ?? innerWidth / 2, S.pointer?.cy ?? innerHeight / 2);
  else if (low === 'r' && e.altKey) clearTransform('rot');
  else if (low === 'g' && e.altKey) clearTransform('loc');
  else if (low === 'r' && !ctrl) startModal('rotate');
  else if (low === 'g' && !ctrl) startModal('grab');
  else if (low === 'a' && e.altKey) selectAll(false);
  else if (low === 'a' && !ctrl) selectAll(true);
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
enterStep(true); resize(); translateTitles();
window.__rig = { S, RG, STAGES, select, startModal, frameAll, camera, changed, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(true); }, solve: () => document.getElementById('show-solution')?.click() }; // for tests and curious students
