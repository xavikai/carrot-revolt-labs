// Edit Mode Lab: a Blender-like 3D Viewport in Edit Mode (select modes, loops, extrude, inset, loop cut, bevel, clean-up).
import * as THREE from 'three';
import { ICONS, outlinerHTML } from '../../blender-ui.js?v=1';
import * as V from '../viewport/vp.js?v=1';
import * as E from './em.js?v=1';
import { STAGES, startState, TARGETS, markIds, markReport, halfReport, loopsReport, shapeReport, deformReport, bevelReport, cleanReport, stoolReport } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-editmode:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-editmode:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [],
  done: store.get('done', {}), modal: null, nav: null, box: null, boxArmed: false, mouse: [0, 0], inView: false,
  sidebar: store.get('sidebar', false), emu: store.get('emu', false), anim: null, lastOp: null, objSel: true,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
const sid = () => step().id;
const edit = () => S.st.mode === 'edit';
const selFull = () => E.flush(S.st.m, S.st.sm, S.st.sel);

let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

// ─── Three.js ────────────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.setClearColor(0x393939);
const scene = new THREE.Scene();
const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 4000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x7d828a, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xdfe7ff, 0.55); scene.add(rim, rim.target);
const grid = new THREE.Group(); scene.add(grid);
{
  const pts = [], pts10 = [], N = 40;
  const seg = (arr, a, b, c, d) => { for (let k = 0; k < 20; k++) { const u = k / 20, w = (k + 1) / 20; arr.push(a + (c - a) * u, b + (d - b) * u, 0, a + (c - a) * w, b + (d - b) * w, 0); } };
  for (let i = -N; i <= N; i++) { if (i === 0) continue; const arr = i % 10 ? pts : pts10; seg(arr, i, -N, i, N); seg(arr, -N, i, N, i); }
  const ax = [], ay = []; seg(ax, -N, 0, N, 0); seg(ay, 0, -N, 0, N);
  const mk = (arr, color, opacity) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); };
  grid.add(mk(pts, 0x5a5a5a, 0.55), mk(pts10, 0x6a6a6a, 0.8), mk(ax, 0xff3352, 0.9), mk(ay, 0x8bdc00, 0.9));
}
const COL = { face: 0xc4c4c4, faceSel: 0xffb35a, edge: 0x0b0b0b, edgeSel: 0xffa000, vert: 0x0b0b0b, vertSel: 0xff8a00, mark: 0x33d1ff, target: 0x4da3ff, targetOk: 0x5fcf5f, preview: 0xffe23a, outlineSel: 0xffaa40 };
const faceMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true });
const vertMat = new THREE.PointsMaterial({ vertexColors: true, size: 6, sizeAttenuation: false });
const meshObj = new THREE.Mesh(new THREE.BufferGeometry(), faceMat);
const edgeObj = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMat);
const vertObj = new THREE.Points(new THREE.BufferGeometry(), vertMat);
const targetObj = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: COL.target, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.95, depthTest: false }));
const previewObj = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COL.preview, depthTest: false }));
const markGroup = new THREE.Group();
edgeObj.renderOrder = 2; vertObj.renderOrder = 3; targetObj.renderOrder = 4; previewObj.renderOrder = 5; markGroup.renderOrder = 1;
scene.add(meshObj, edgeObj, vertObj, targetObj, previewObj, markGroup);
const col = hex => new THREE.Color(hex);

function buildGeometry() {
  const st = S.st, m = st.m, s = edit() ? selFull() : E.emptySel(), selF = new Set(s.F), selE = new Set(s.E), selV = new Set(s.V);
  const pos = [], cols = [], cF = col(COL.face), cS = col(COL.face).lerp(col(COL.faceSel), 0.45);
  m.f.forEach((f, fi) => { const c = selF.has(fi) && st.sm === 'face' ? cS : selF.has(fi) ? col(COL.face).lerp(col(COL.faceSel), 0.3) : cF; for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) { pos.push(...m.v[k]); cols.push(c.r, c.g, c.b); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
  // flat normals: compute per triangle
  { const n = g.attributes.normal; for (let i = 0; i < pos.length / 9; i++) { const a = new THREE.Vector3(pos[i * 9], pos[i * 9 + 1], pos[i * 9 + 2]), b = new THREE.Vector3(pos[i * 9 + 3], pos[i * 9 + 4], pos[i * 9 + 5]), c = new THREE.Vector3(pos[i * 9 + 6], pos[i * 9 + 7], pos[i * 9 + 8]); const nn = b.sub(a).cross(c.sub(a)).normalize(); for (let k = 0; k < 3; k++) n.setXYZ(i * 3 + k, nn.x, nn.y, nn.z); } }
  meshObj.geometry.dispose(); meshObj.geometry = g;
  const ep = [], ec = [], ce = col(COL.edge), cs = col(COL.edgeSel);
  if (edit()) for (const k of E.edgeKeys(m)) { const [a, b] = E.keyVerts(k), c = selE.has(k) ? cs : ce; ep.push(...m.v[a], ...m.v[b]); ec.push(c.r, c.g, c.b, c.r, c.g, c.b); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
  edgeObj.geometry.dispose(); edgeObj.geometry = eg;
  const vp = [], vc = [], cv = col(COL.vert), cvs = col(COL.vertSel);
  if (edit() && st.sm === 'vert') m.v.forEach((p, i) => { const c = selV.has(i) ? cvs : cv; vp.push(...p); vc.push(c.r, c.g, c.b); });
  else if (edit()) m.v.forEach((p, i) => { if (!m.f.some(f => f.includes(i))) { vp.push(...p); vc.push(cv.r, cv.g, cv.b); } });
  const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); vg.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  vertObj.geometry.dispose(); vertObj.geometry = vg;
  const xr = edit() && st.xray;
  faceMat.transparent = xr; faceMat.opacity = xr ? 0.35 : 1; faceMat.depthWrite = !xr; faceMat.needsUpdate = true;
  edgeMat.depthTest = !xr; vertMat.depthTest = !xr; edgeMat.transparent = true; edgeMat.opacity = 1;
  buildTarget(); buildMarks(); dirty = true;
}
function buildTarget() {
  const id = step().target, pts = [];
  if (id) {
    // The goal shape: the start mesh edited to the target positions, drawn as dashed edges.
    const goal = targetMesh(id);
    for (const k of E.edgeKeys(goal)) { const [a, b] = E.keyVerts(k); pts.push(...goal.v[a], ...goal.v[b]); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  targetObj.geometry.dispose(); targetObj.geometry = g; targetObj.computeLineDistances();
  targetObj.material.color.setHex(id && shapeReport(S.st, id).ok ? COL.targetOk : COL.target);
}
const targetCache = {};
function targetMesh(id) {
  if (targetCache[id]) return targetCache[id];
  const st = startState(step()); step().solve(st); return (targetCache[id] = st.m);
}
function buildMarks() {
  markGroup.clear();
  if (sid() !== 'e1') return;
  const ids = markIds(S.st.m), m = S.st.m, mat = new THREE.MeshBasicMaterial({ color: COL.mark, depthTest: true, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 8), mat); ball.position.set(...m.v[ids.v]); markGroup.add(ball);
  const [a, b] = E.keyVerts(ids.e), pa = new THREE.Vector3(...m.v[a]), pb = new THREE.Vector3(...m.v[b]);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, pa.distanceTo(pb), 8), mat); cyl.position.copy(pa).add(pb).multiplyScalar(0.5); cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize()); markGroup.add(cyl);
  const f = m.f[ids.f], c = E.faceCenter(m, f), pts = f.map(i => E.V3.lerp(c, m.v[i], 0.6));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]], 3));
  const pl = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: COL.mark, transparent: true, opacity: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); markGroup.add(pl);
}
function buildPreview(segs) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(segs || [], 3));
  previewObj.geometry.dispose(); previewObj.geometry = g; dirty = true;
}

// Object Mode outline (mask pass + edge filter, as in the Viewport Lab)
const maskRT = new THREE.WebGLRenderTarget(4, 4);
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const outlineMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: { mask: { value: maskRT.texture }, px: { value: new THREE.Vector2(1, 1) }, cAct: { value: new THREE.Color(COL.outlineSel) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D mask; uniform vec2 px; uniform vec3 cAct; varying vec2 vUv;
    void main(){ float c = texture2D(mask, vUv).r, hi = c, lo = c;
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) { if (i*i + j*j > 5) continue; float m = texture2D(mask, vUv + vec2(float(i), float(j)) * px).r; hi = max(hi, m); lo = min(lo, m); }
      if (hi - lo < 0.2) discard; gl_FragColor = vec4(cAct, 1.0); }`,
});
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMat));

let W = 800, H = 450, dirty = true;
function resize() {
  const r = host.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(200, r.height);
  renderer.setSize(W, H, false); const dpr = renderer.getPixelRatio(); maskRT.setSize(Math.round(W * dpr), Math.round(H * dpr));
  outlineMat.uniforms.px.value.set(0.75 / W, 0.75 / H);
  if (S.st) S.st.aspect = W / H; dirty = true;
}
new ResizeObserver(resize).observe(host);
function activeCamera() {
  const v = S.st.view, b = V.basisOf(v), aspect = W / H, cam = v.ortho ? ortho : persp;
  if (v.ortho) {
    const h = V.viewHeight(v, aspect, v.dist) / 2; ortho.left = -h * aspect; ortho.right = h * aspect; ortho.top = h; ortho.bottom = -h;
    ortho.position.set(...V.add(v.target, V.mul(b.f, -Math.max(400, v.dist * 4)))); ortho.near = 0.05; ortho.far = Math.max(800, v.dist * 8);
  } else { persp.fov = V.vfov(aspect); persp.aspect = aspect; persp.position.set(...b.eye); persp.near = Math.max(0.01, v.dist / 500); persp.far = 2000; }
  cam.up.set(...b.u); cam.lookAt(...v.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  key.position.set(...V.add(b.eye, V.add(V.mul(b.r, -v.dist * 0.35), V.mul(b.u, v.dist * 0.5)))); key.target.position.set(...v.target);
  rim.position.set(...V.add(v.target, V.add(V.mul(b.f, v.dist), V.mul(b.r, v.dist)))); rim.target.position.set(...v.target);
  return cam;
}
function render() {
  if (!S.st) return;
  const cam = activeCamera();
  renderer.setRenderTarget(null); renderer.render(scene, cam);
  if (!edit() && S.objSel) {
    const vis = [grid.visible, edgeObj.visible, vertObj.visible, targetObj.visible, previewObj.visible, markGroup.visible];
    grid.visible = edgeObj.visible = vertObj.visible = targetObj.visible = previewObj.visible = markGroup.visible = false;
    const fm = meshObj.material; meshObj.material = whiteMat;
    renderer.setRenderTarget(maskRT); renderer.setClearColor(0x000000); renderer.clear(); renderer.render(scene, cam);
    meshObj.material = fm; [grid.visible, edgeObj.visible, vertObj.visible, targetObj.visible, previewObj.visible, markGroup.visible] = vis;
    renderer.setRenderTarget(null); renderer.setClearColor(0x393939); renderer.autoClear = false; renderer.render(quadScene, quadCam); renderer.autoClear = true;
  }
  drawGizmo(); placeCursor(); renderViewText();
}
function loop(now) { if (S.anim) stepAnim(now); if (dirty) { dirty = false; render(); } requestAnimationFrame(loop); }

// ─── Overlays ────────────────────────────────────────────────────────────────
function renderViewText() {
  const st = S.st, a = E.analyze(st.m), s = edit() ? selFull() : null;
  const stat = edit() ? `Vertices ${s.V.length}/${a.verts}<br>Edges ${s.E.length}/${a.edges}<br>Faces ${s.F.length}/${a.faces}` : `Objects 1/1<br>Vertices ${a.verts}<br>Faces ${a.faces}`;
  $('#vp-text').innerHTML = `<b>${esc(V.viewName(st.view))}</b><br>(1) Cube${st.xray && edit() ? ' · X-Ray' : ''}<div class="vp-stats">${stat}</div>`;
}
function placeCursor() {
  const p = V.project(S.st.view, [0, 0, 0], W, H), el = $('#cursor3d');
  const vis = (S.st.view.ortho || p.depth > 0) && p.x > -20 && p.y > -20 && p.x < W + 20 && p.y < H + 20;
  el.hidden = !vis; if (vis) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
}
const gz = $('#gizmo'), gctx = gz.getContext('2d');
let gizmoHover = null;
function gizmoBalls() {
  const b = V.basisOf(S.st.view), R = 34, c = 48, out = [];
  for (const [k, a] of Object.entries(V.AXES)) for (const s of [1, -1]) { const w = V.mul(a, s); out.push({ id: (s > 0 ? '+' : '-') + k, k, s, x: c + V.dot(w, b.r) * R, y: c - V.dot(w, b.u) * R, z: V.dot(w, b.f) }); }
  return out.sort((p, q) => q.z - p.z);
}
const AXC = { x: ['#ff3352', '#9a2436'], y: ['#8bdc00', '#58861a'], z: ['#2890ff', '#1f5a9c'] };
function drawGizmo() {
  const dpr = Math.min(2, devicePixelRatio || 1); if (gz.width !== 96 * dpr) { gz.width = gz.height = 96 * dpr; }
  const g = gctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, 96, 96);
  if (gizmoHover || S.nav?.gizmo) { g.fillStyle = '#ffffff22'; g.beginPath(); g.arc(48, 48, 46, 0, Math.PI * 2); g.fill(); }
  const balls = gizmoBalls();
  for (const p of balls) if (p.s > 0) { g.strokeStyle = AXC[p.k][0]; g.lineWidth = 2; g.beginPath(); g.moveTo(48, 48); g.lineTo(p.x, p.y); g.stroke(); }
  for (const p of balls) {
    g.beginPath(); g.arc(p.x, p.y, p.s > 0 ? 9 : 7.5, 0, Math.PI * 2);
    if (p.s > 0) { g.fillStyle = AXC[p.k][0]; g.fill(); } else { g.fillStyle = AXC[p.k][1] + 'cc'; g.fill(); g.strokeStyle = AXC[p.k][0]; g.lineWidth = 1.2; g.stroke(); }
    if (gizmoHover === p.id) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
    if (p.s > 0) { g.fillStyle = '#111'; g.font = '700 11px Inter, Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.k.toUpperCase(), p.x, p.y + 0.5); }
  }
}
const BALL_VIEW = { '+x': 'right', '-x': 'left', '+y': 'back', '-y': 'front', '+z': 'top', '-z': 'bottom' };
function gizmoHit(x, y) { for (const p of gizmoBalls().reverse()) if (Math.hypot(p.x - x, p.y - y) <= 10) return p.id; return null; }

// ─── View changes ────────────────────────────────────────────────────────────
function setView(v, animate = true) {
  const from = { ...S.st.view };
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { S.st.view = v; viewChanged(); return; }
  let dAz = v.az - from.az; dAz = ((dAz + 540) % 360) - 180;
  S.anim = { from, to: v, dAz, t0: performance.now(), ms: 220 }; S.st.view = { ...from, ortho: v.ortho, axis: v.axis, auto: v.auto };
}
function stepAnim(now) {
  const a = S.anim, k = Math.min(1, (now - a.t0) / a.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, f = a.from, to = a.to;
  S.st.view = { ...to, target: f.target.map((x, i) => x + (to.target[i] - x) * e), dist: f.dist * Math.pow(to.dist / f.dist, e), az: f.az + a.dAz * e, el: f.el + (to.el - f.el) * e };
  if (k >= 1) { S.anim = null; S.st.view = to; viewChanged(); } else dirty = true;
}
let viewSaveT;
function viewChanged() { dirty = true; renderLabPanel(); clearTimeout(viewSaveT); viewSaveT = setTimeout(saveData, 300); }
const axisView = name => setView(V.setAxisView(S.st.view, name));
function frameSelected() {
  const m = S.st.m, s = edit() ? selFull() : { V: m.v.map((_, i) => i) };
  if (!s.V.length) { msg('Nothing selected: select something first.', true); return; }
  const b = E.bounds(m, s.V), c = V.mul(V.add(b.lo, b.hi), 0.5), r = Math.max(0.3, V.len(V.sub(b.hi, b.lo)) / 2);
  setView({ ...S.st.view, target: c, dist: Math.max(1, r / Math.tan(V.vfov(W / H) * Math.PI / 360) * 1.1) });
}
function frameAll() { const b = E.bounds(S.st.m), c = V.mul(V.add(b.lo, b.hi), 0.5), r = Math.max(0.5, V.len(V.sub(b.hi, b.lo)) / 2); setView({ ...S.st.view, target: c, dist: r / Math.tan(V.vfov(W / H) * Math.PI / 360) * 1.1 }); }
function togglePersp() { const v = S.st.view; setView({ ...v, ortho: !v.ortho, auto: false }, false); msg(S.st.view.ortho ? 'Orthographic' : 'Perspective'); }

// ─── Picking in Edit Mode ────────────────────────────────────────────────────
const proj = p => V.project(S.st.view, p, W, H);
function eyeInfo() { const v = S.st.view, b = V.basisOf(v); return v.ortho ? { eye: null, dir: b.f } : { eye: b.eye, dir: null }; }
function visible(p) { if (S.st.xray) return true; const e = eyeInfo(); return E.pointVisible(S.st.m, e.eye, p, e.dir); }
function segDist(px, py, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)); return { d: Math.hypot(px - a.x - dx * t, py - a.y - dy * t), t }; }
function pickVert(x, y) {
  const m = S.st.m; let best = null, bd = 14;
  m.v.forEach((p, i) => { const s = proj(p); if (!S.st.view.ortho && s.depth <= 0) return; const d = Math.hypot(s.x - x, s.y - y); if (d < bd && visible(p)) { bd = d; best = i; } });
  return best;
}
function pickEdge(x, y, maxD = 10) {
  const m = S.st.m; let best = null, bd = maxD;
  for (const k of E.edgeKeys(m)) {
    const [a, b] = E.keyVerts(k), pa = proj(m.v[a]), pb = proj(m.v[b]);
    if (!S.st.view.ortho && (pa.depth <= 0 || pb.depth <= 0)) continue;
    const r = segDist(x, y, pa, pb); if (r.d >= bd) continue;
    const p = E.V3.lerp(m.v[a], m.v[b], r.t); if (!visible(p)) continue;
    bd = r.d; best = k;
  }
  return best;
}
function pickFace(x, y) {
  const m = S.st.m, ray = V.rayAt(S.st.view, x, y, W, H);
  if (!S.st.xray) { const h = E.rayHit(m, ray.o, ray.d); return h.face >= 0 ? h.face : null; }
  // X-ray: the face whose centre dot is nearest to the mouse (as Blender's face dots)
  let best = null, bd = 22;
  m.f.forEach((f, fi) => { const s = proj(E.faceCenter(m, f)); const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = fi; } });
  if (best == null) { const h = E.rayHit(m, ray.o, ray.d); return h.face >= 0 ? h.face : null; }
  return best;
}
function setSel(primary) { S.st.sel = E.flush(S.st.m, S.st.sm, primary); selectionChanged(); }
function clickSelect(x, y, extend, loop = false) {
  const st = S.st, cur = selFull();
  if (loop) {
    const k = pickEdge(x, y, 16); if (!k) { if (!extend) setSel(E.emptySel()); return; }
    const [a, b] = E.keyVerts(k);
    let add;
    if (st.sm === 'face') { const F = E.faceLoop(st.m, a, b); add = { V: [], E: [], F }; }
    else { const L = E.edgeLoop(st.m, a, b); add = st.sm === 'vert' ? { V: [...new Set(L.flatMap(E.keyVerts))], E: [], F: [] } : { V: [], E: L, F: [] }; }
    if (!extend) { setSel(add); return; }
    setSel({ V: [...new Set([...cur.V, ...add.V])], E: [...new Set([...cur.E, ...add.E])], F: [...new Set([...cur.F, ...add.F])] });
    return;
  }
  const sm = st.sm, hit = sm === 'vert' ? pickVert(x, y) : sm === 'edge' ? pickEdge(x, y) : pickFace(x, y);
  const list = sm === 'vert' ? 'V' : sm === 'edge' ? 'E' : 'F';
  if (hit == null) { if (!extend) setSel(E.emptySel()); return; }
  if (!extend) { setSel({ V: [], E: [], F: [], [list]: [hit] }); return; }
  const now = cur[list], has = now.includes(hit);
  setSel({ ...cur, [list]: has ? now.filter(x => x !== hit) : [...now, hit] });
}
function boxSelect(x0, y0, x1, y1, mode) {
  const st = S.st, m = st.m, [a, b] = [Math.min(x0, x1), Math.max(x0, x1)], [c, d] = [Math.min(y0, y1), Math.max(y0, y1)];
  const inside = p => { const s = proj(p); return (st.view.ortho || s.depth > 0) && s.x >= a && s.x <= b && s.y >= c && s.y <= d; };
  let hit;
  if (st.sm === 'vert') hit = m.v.map((p, i) => inside(p) && visible(p) ? i : -1).filter(i => i >= 0);
  else if (st.sm === 'edge') hit = E.edgeKeys(m).filter(k => { const [p, q] = E.keyVerts(k); return inside(m.v[p]) && inside(m.v[q]) && visible(E.V3.lerp(m.v[p], m.v[q], 0.5)); });
  else hit = m.f.map((f, i) => { const cc = E.faceCenter(m, f); return inside(cc) && visible(E.V3.add(cc, E.V3.mul(E.faceNormal(m, f), 0.002))) ? i : -1; }).filter(i => i >= 0);
  const list = st.sm === 'vert' ? 'V' : st.sm === 'edge' ? 'E' : 'F', cur = selFull()[list];
  const next = mode === 'sub' ? cur.filter(x => !hit.includes(x)) : mode === 'set' ? hit : [...new Set([...cur, ...hit])];
  setSel({ V: [], E: [], F: [], [list]: next });
}
function selectionChanged() { S.lastOp = null; buildGeometry(); saveData(); renderSidebar(); renderLastOp(); renderLabPanel(); stepFlags(); checkProgress(); dirty = true; }
function selectAll() { if (!edit()) return; setSel({ V: S.st.m.v.map((_, i) => i), E: E.edgeKeys(S.st.m), F: S.st.m.f.map((_, i) => i) }); }
function selectNone() { if (!edit()) return; setSel(E.emptySel()); }
function selectInvert() { if (!edit()) return; const s = selFull(), m = S.st.m; setSel({ V: m.v.map((_, i) => i).filter(i => !s.V.includes(i)), E: E.edgeKeys(m).filter(k => !s.E.includes(k)), F: m.f.map((_, i) => i).filter(i => !s.F.includes(i)) }); }
function setSelectMode(sm) {
  if (!edit()) { msg('Select modes work in Edit Mode: press Tab first.', true); return; }
  if (S.st.sm === sm) return;
  S.st.sel = E.switchMode(S.st.m, S.st.sm, sm, S.st.sel); S.st.sm = sm; renderHeader(); selectionChanged();
  msg({ vert: 'Vertex select mode', edge: 'Edge select mode', face: 'Face select mode' }[sm]);
}
function toggleEdit() {
  if (S.modal) return;
  S.st.mode = edit() ? 'object' : 'edit'; if (edit()) S.st.flags.tab = true;
  renderHeader(); buildGeometry(); saveData(); renderSidebar(); renderLabPanel(); renderStatusKeys(); checkProgress();
  msg(edit() ? 'Edit Mode' : 'Object Mode');
}
function toggleXray() { S.st.xray = !S.st.xray; renderHeader(); buildGeometry(); saveData(); msg(S.st.xray ? 'X-Ray on: you see and select through the mesh.' : 'X-Ray off.'); }

// Flags of step 1: each mark selected in its own mode.
function stepFlags() {
  if (sid() !== 'e1') return;
  const r = markReport(S.st), f = S.st.flags; let news = null;
  for (const k of ['v', 'e', 'f']) if (r[k] && !f[k]) { f[k] = true; news = k; }
  if (news) { const left = ['v', 'e', 'f'].filter(k => !f[k]); msg(left.length ? tr('✓ {a}. Now the {b}.', { a: { v: 'Vertex', e: 'Edge', f: 'Face' }[news], b: t({ v: 'vertex (1)', e: 'edge (2)', f: 'face (3)' }[left[0]]) }) : '✓ Vertex, edge and face.'); saveData(); }
}

// ─── Undo ────────────────────────────────────────────────────────────────────
const snap = () => ({ m: E.clone(S.st.m), sel: JSON.parse(JSON.stringify(S.st.sel)), sm: S.st.sm, mode: S.st.mode });
function pushUndo(name, before = snap()) { S.undo.push({ name, snap: before }); if (S.undo.length > 64) S.undo.shift(); S.redo = []; }
function restore(s) { S.st.m = E.clone(s.m); S.st.sel = JSON.parse(JSON.stringify(s.sel)); S.st.sm = s.sm; S.st.mode = s.mode; }
function undo() { if (!S.undo.length) { msg('Nothing to undo.'); return; } const e = S.undo.pop(); S.redo.push({ name: e.name, snap: snap() }); restore(e.snap); S.lastOp = null; sceneChanged(); msg(tr('Undo {s}', { s: e.name })); }
function redo() { if (!S.redo.length) { msg('Nothing to redo.'); return; } const e = S.redo.pop(); S.undo.push({ name: e.name, snap: snap() }); restore(e.snap); S.lastOp = null; sceneChanged(); msg(tr('Redo {s}', { s: e.name })); }
function sceneChanged(save = true) { renderHeader(); buildGeometry(); if (save) saveData(); renderSidebar(); renderLastOp(); renderLabPanel(); renderStatusKeys(); checkProgress(); dirty = true; }

// ─── Modal operators ─────────────────────────────────────────────────────────
// Transform (G R S) works on the selected vertices: each one is a point with a location.
function needEdit() { if (!edit()) { msg('This lab works in Edit Mode: press Tab.', true); return false; } return true; }
function startTransform(type, opts = {}) {
  if (!needEdit()) return;
  const s = selFull(); if (!s.V.length) { msg('Nothing selected: select vertices, edges or faces first.', true); return; }
  const m = S.st.m, pts = s.V.map(i => ({ name: i, kind: 'empty', loc: [...m.v[i]], rot: [0, 0, 0], scale: [1, 1, 1] }));
  const pv = proj(V.medianOf(pts)), start = S.inView ? [...S.mouse] : [pv.x + 80, pv.y - 40];
  S.modal = { op: 'transform', type, axis: null, plane: false, orient: 'global', start, cur: [...start], last: [...start], angle: 0, typed: '', snap: false, fine: false,
    pts, before: opts.before || snap(), undoName: opts.undoName || { move: 'Move', rotate: 'Rotate', scale: 'Resize' }[type], customAxis: opts.customAxis || null, axisLabel: opts.axisLabel, extrude: !!opts.extrude };
  S.modal.lastAng = angleAt(S.modal.cur); host.classList.add('modal'); updateModal();
}
function angleAt(p) { const pv = proj(V.medianOf(S.modal.pts)); return Math.atan2(-(p[1] - pv.y), p[0] - pv.x) * 180 / Math.PI; }
function pivotPx() { const m = S.modal; return m.pts ? proj(V.medianOf(m.pts)) : proj(m.pivot); }
function modalMove(x, y, e) {
  const m = S.modal; m.snap = e.ctrlKey || e.metaKey; m.fine = e.shiftKey;
  if (m.op === 'loopcut') { m.cur = [x, y]; loopcutHover(); return; }
  const k = m.fine ? 0.1 : 1; m.cur = [m.cur[0] + (x - m.last[0]) * k, m.cur[1] + (y - m.last[1]) * k]; m.last = [x, y];
  if (m.op === 'transform') { const a = angleAt(m.cur); let d = a - m.lastAng; d = ((d + 540) % 360) - 180; m.angle += d; m.lastAng = a; }
  updateModal();
}
function readout(text) { const el = $('#modal-readout'); el.hidden = !text; el.textContent = text || ''; }
function updateModal() {
  const m = S.modal; if (!m) return;
  const typed = m.typed ? `[${m.typed}|] ` : '';
  if (m.op === 'transform') {
    const r = V.applyModal(m, m.pts, null, S.st.view, W, H);
    for (const o of r.objs) S.st.m.v[o.name] = o.loc.map(x => Math.round(x * 1e6) / 1e6);
    readout(typed + r.info.text);
  } else if (m.op === 'inset') {
    const pv = pivotPx(), d0 = Math.hypot(m.start[0] - pv.x, m.start[1] - pv.y), d = Math.hypot(m.cur[0] - pv.x, m.cur[1] - pv.y);
    let th = V.parseTyped(m.typed); if (th == null) { th = Math.max(0, (d0 - d)) * V.unitsPerPx(S.st.view, m.pivot, W, H); if (m.snap) th = Math.round(th * 10) / 10; }
    m.value = Math.max(0, th); S.st.m = E.insetFaces(m.base, m.F, m.value).m; S.st.sel = E.flush(S.st.m, 'face', { V: [], E: [], F: m.F }); S.st.sm = 'face';
    readout(`${typed}Thickness: ${V.fmt(Math.round(m.value * 1000) / 1000)} m`);
  } else if (m.op === 'bevel') {
    const pv = pivotPx(), d0 = Math.hypot(m.start[0] - pv.x, m.start[1] - pv.y), d = Math.hypot(m.cur[0] - pv.x, m.cur[1] - pv.y);
    let w = V.parseTyped(m.typed); if (w == null) { w = Math.max(0, d - d0) * V.unitsPerPx(S.st.view, m.pivot, W, H); if (m.snap) w = Math.round(w * 10) / 10; }
    const r = E.bevelEdges(m.base, m.E, Math.max(0, w), m.segments); if (!r.error) { S.st.m = r.m; S.st.sel = E.emptySel(); m.value = r.width; }
    readout(`${typed}Width: ${V.fmt(Math.round((m.value || 0) * 1000) / 1000)} m   Segments: ${m.segments}`);
  } else if (m.op === 'loopcut') loopcutHover();
  buildGeometry(); renderSidebar(); renderStatusKeys(); renderLabPanel(); dirty = true;
}
function endModal() { S.modal = null; host.classList.remove('modal'); readout(''); buildPreview(null); }
function confirmModal() {
  const m = S.modal; if (!m) return;
  if (m.op === 'loopcut') { loopcutClick(); return; }
  endModal();
  pushUndo(m.undoName, m.before);
  if (m.op === 'inset') setLastOp('Inset Faces', m.before, [{ k: 'thickness', label: 'Thickness', v: m.value, step: 0.01, min: 0 }, { k: 'depth', label: 'Depth', v: 0, step: 0.01 }], p => { const r = E.insetFaces(m.base, m.F, p.thickness, p.depth); return { m: r.m, sel: E.flush(r.m, 'face', { V: [], E: [], F: r.F }), sm: 'face' }; });
  else if (m.op === 'bevel') setLastOp('Bevel', m.before, [{ k: 'width', label: 'Width', v: m.value || 0, step: 0.01, min: 0 }, { k: 'segments', label: 'Segments', v: m.segments, step: 1, min: 1, max: 12, int: true }], p => { const r = E.bevelEdges(m.base, m.E, p.width, Math.max(1, Math.round(p.segments))); return r.error ? null : { m: r.m, sel: E.emptySel(), sm: S.st.sm }; });
  else if (m.extrude) { const d = m.customAxis ? E.V3.dot(E.V3.sub(S.st.m.v[m.pts[0].name], m.pts[0].loc), m.customAxis) : null; setLastOp('Extrude Region and Move', m.before, m.customAxis ? [{ k: 'move', label: 'Move (normal)', v: Math.round(d * 10000) / 10000, step: 0.05 }] : [], p => { const r = E.extrudeFaces(m.before.m, m.F); for (const i of r.moved) r.m.v[i] = E.V3.add(r.m.v[i], E.V3.mul(m.customAxis, p.move)).map(x => Math.round(x * 1e6) / 1e6); return { m: r.m, sel: E.flush(r.m, 'face', { V: [], E: [], F: r.F }), sm: 'face' }; }); }
  else S.lastOp = null;
  sceneChanged();
}
function cancelModal() {
  const m = S.modal; if (!m) return; endModal();
  if (m.op === 'transform' && m.extrude) {
    for (const o of m.pts) S.st.m.v[o.name] = [...o.loc];
    pushUndo(m.undoName, m.before); msg('Cancelled the move, but the extruded faces are still there, on top of the old ones. Ctrl Z removes them.', true);
  } else { restore(m.before); msg('Cancelled.'); }
  S.lastOp = null; sceneChanged();
}
function modalKey(e) {
  const m = S.modal, k = e.key, low = k.length === 1 ? k.toLowerCase() : k;
  if (k === 'Escape') return cancelModal();
  if (k === 'Enter' || (k === ' ' && m.op !== 'loopcut')) return confirmModal();
  if (m.op === 'loopcut') {
    if (/^[0-9]$/.test(k) && m.phase === 'hover') { m.typed = (m.typed + k).slice(-2); m.n = Math.max(1, Math.min(20, +m.typed)); loopcutHover(); return; }
    if (k === '+' || e.code === 'NumpadAdd' || k === 'PageUp') { m.n = Math.min(20, m.n + 1); loopcutHover(); return; }
    if (k === '-' || e.code === 'NumpadSubtract' || k === 'PageDown') { m.n = Math.max(1, m.n - 1); loopcutHover(); return; }
    return;
  }
  if (m.op === 'bevel' && (k === '+' || e.code === 'NumpadAdd' || k === 'PageUp')) { m.segments = Math.min(12, m.segments + 1); return updateModal(); }
  if (m.op === 'bevel' && (e.code === 'NumpadSubtract' || k === 'PageDown')) { m.segments = Math.max(1, m.segments - 1); return updateModal(); }
  if (m.op === 'transform' && (low === 'x' || low === 'y' || low === 'z')) {
    const plane = e.shiftKey; m.customAxis = null;
    if (m.axis === low && m.plane === plane) { if (m.orient === 'global') m.orient = 'local'; else { m.axis = null; m.plane = false; m.orient = 'global'; } }
    else { m.axis = low; m.plane = plane; m.orient = 'global'; }
    return updateModal();
  }
  if (m.op === 'transform' && (low === 'g' || low === 'r' || low === 's') && !m.extrude) {
    const type = { g: 'move', r: 'rotate', s: 'scale' }[low]; if (type === m.type) return;
    for (const o of m.pts) S.st.m.v[o.name] = [...o.loc];
    Object.assign(m, { type, typed: '', axis: null, plane: false, start: [...m.cur], angle: 0, undoName: { move: 'Move', rotate: 'Rotate', scale: 'Resize' }[type] }); m.lastAng = angleAt(m.cur); return updateModal();
  }
  if (/^[0-9]$/.test(k) || k === '.' || k === ',' || k === '-' || k === 'Backspace') { m.typed = V.typeKey(m.typed, k === ',' ? '.' : k); return updateModal(); }
  if (k === 'Control' || k === 'Meta' || k === 'Shift') { m.snap = e.ctrlKey || e.metaKey; m.fine = e.shiftKey; return updateModal(); }
}

// Extrude (E): faces only in this lab. The new faces move along their normal.
function extrude() {
  if (!needEdit()) return;
  const s = selFull();
  if (S.st.sm !== 'face' && s.F.length === 0) { msg('In this lab, extrude faces: press 3 and select faces.', true); return; }
  if (!s.F.length) { msg('Select one or more faces to extrude.', true); return; }
  const before = snap(), r = E.extrudeFaces(S.st.m, s.F);
  S.st.m = r.m; S.st.sm = 'face'; S.st.sel = E.flush(r.m, 'face', { V: [], E: [], F: r.F });
  startTransform('move', { before, undoName: 'Extrude Region', customAxis: r.normal, axisLabel: 'normal', extrude: true });
  if (S.modal) S.modal.F = s.F;
}
function inset() {
  if (!needEdit()) return;
  const s = selFull(); if (!s.F.length) { msg('Select faces to inset (Face mode, 3).', true); return; }
  const m = S.st.m, pivot = V.medianOf(s.F.map(fi => ({ loc: E.faceCenter(m, m.f[fi]) }))), pv = proj(pivot);
  const start = S.inView ? [...S.mouse] : [pv.x + 120, pv.y];
  S.modal = { op: 'inset', base: E.clone(m), F: [...s.F], pivot, start, cur: [...start], last: [...start], typed: '', value: 0, before: snap(), undoName: 'Inset Faces' };
  if (Math.hypot(start[0] - pv.x, start[1] - pv.y) < 40) { S.modal.start = [pv.x + 120, pv.y]; }
  host.classList.add('modal'); updateModal();
}
function bevel() {
  if (!needEdit()) return;
  const s = selFull(); if (!s.E.length) { msg('Select edges to bevel (Edge mode, 2).', true); return; }
  const test = E.bevelEdges(S.st.m, s.E, 0.01, 1); if (test.error) { msg(test.error, true); return; }
  const m = S.st.m, pivot = E.bounds(m, s.V), pc = V.mul(V.add(pivot.lo, pivot.hi), 0.5), pv = proj(pc);
  let start = S.inView ? [...S.mouse] : [pv.x + 60, pv.y]; if (Math.hypot(start[0] - pv.x, start[1] - pv.y) < 30) start = [pv.x + 60, pv.y];
  S.modal = { op: 'bevel', base: E.clone(m), E: [...s.E], pivot: pc, start, cur: [...start], last: [...start], typed: '', segments: 1, value: 0, before: snap(), undoName: 'Bevel' };
  host.classList.add('modal'); updateModal();
}
// Loop Cut and Slide (Ctrl R): hover an edge, wheel for more cuts, click, then slide.
function loopcut() {
  if (!needEdit()) return;
  S.modal = { op: 'loopcut', phase: 'hover', n: 1, typed: '', cur: [...S.mouse], edge: null, factor: 0, before: snap(), undoName: 'Loop Cut and Slide' };
  host.classList.add('modal'); loopcutHover(); renderStatusKeys();
}
function loopcutHover() {
  const m = S.modal, mesh = S.modal.phase === 'slide' ? m.base : S.st.m;
  if (m.phase === 'hover') {
    const k = pickEdge(m.cur[0], m.cur[1], 30); m.edge = k;
    if (!k) { buildPreview(null); readout(tr('Hover an edge · Number of Cuts: {n}', { n: m.n })); return; }
    const [a, b] = E.keyVerts(k), ring = E.edgeRing(mesh, a, b).ring, segs = [];
    // preview: the cut lines across each ring face
    const ts = m.n === 1 ? [0.5] : Array.from({ length: m.n }, (_, i) => (i + 1) / (m.n + 1));
    const r = E.edgeRing(mesh, a, b), pts = r.ring.map(([p, q]) => ts.map(tt => E.V3.lerp(mesh.v[p], mesh.v[q], tt)));
    for (let i = 0; i < pts.length - 1 + (r.closed ? 1 : 0); i++) { const A = pts[i], B = pts[(i + 1) % pts.length]; for (let j = 0; j < ts.length; j++) segs.push(...A[j], ...B[j]); }
    void ring; buildPreview(segs); readout(tr('Number of Cuts: {n} · wheel or type a number · click to cut', { n: m.n }));
  } else {
    // slide: the mouse along the screen direction of the hovered edge
    const [a, b] = m.ab, pa = proj(mesh.v[a]), pb = proj(mesh.v[b]), dx = pb.x - pa.x, dy = pb.y - pa.y, l2 = dx * dx + dy * dy || 1;
    const t0 = ((m.slideStart[0] - pa.x) * dx + (m.slideStart[1] - pa.y) * dy) / l2, t1 = ((m.cur[0] - pa.x) * dx + (m.cur[1] - pa.y) * dy) / l2;
    m.factor = Math.max(-0.98, Math.min(0.98, (t1 - t0) * 2));
    const r = E.loopCut(m.base, a, b, 1, m.factor); S.st.m = r.m; selectLoops(r); buildGeometry();
    readout(`Factor: ${V.fmt(Math.round(m.factor * 1000) / 1000)} · ${t('click to confirm · right-click keeps it centred')}`);
  }
}
function selectLoops(r) { const Ls = r.loops; if (S.st.sm === 'face') S.st.sm = 'edge'; S.st.sel = E.flush(S.st.m, 'vert', { V: Ls.flat(), E: [], F: [] }); if (S.st.sm === 'edge') { const set = new Set(Ls.flat()); S.st.sel = E.flush(S.st.m, 'edge', { V: [], E: E.edgeKeys(S.st.m).filter(k => { const [p, q] = E.keyVerts(k); return set.has(p) && set.has(q) && Ls.some(L => L.includes(p) && L.includes(q)); }), F: [] }); } }
function loopcutClick(keepCentre = false) {
  const m = S.modal;
  if (m.phase === 'hover') {
    if (!m.edge) { msg('Hover an edge first: the yellow line shows the cut.', true); return; }
    const [a, b] = E.keyVerts(m.edge), r = E.edgeRing(S.st.m, a, b);
    if (r.ring.length < 2 && !r.faces.length) { msg('No loop can go through this edge.', true); return; }
    m.base = E.clone(S.st.m); m.ab = [a, b];
    const cut = E.loopCut(m.base, a, b, m.n, 0); S.st.m = cut.m; selectLoops(cut); buildPreview(null);
    if (m.n === 1 && !keepCentre) { m.phase = 'slide'; m.slideStart = [...m.cur]; loopcutHover(); renderStatusKeys(); return; }
  } else if (keepCentre) { const cut = E.loopCut(m.base, m.ab[0], m.ab[1], 1, 0); S.st.m = cut.m; selectLoops(cut); m.factor = 0; }
  endModal(); pushUndo(m.undoName, m.before);
  const base = m.base, [a, b] = m.ab;
  setLastOp('Loop Cut and Slide', m.before, [{ k: 'cuts', label: 'Number of Cuts', v: m.n, step: 1, min: 1, max: 20, int: true }, { k: 'factor', label: 'Factor', v: Math.round(m.factor * 1000) / 1000, step: 0.01, min: -0.98, max: 0.98 }], p => { const n = Math.max(1, Math.round(p.cuts)), r = E.loopCut(base, a, b, n, n === 1 ? p.factor : 0); S.st.m = r.m; selectLoops(r); return { m: S.st.m, sel: S.st.sel, sm: S.st.sm }; });
  sceneChanged();
}

// ─── One-shot operators: merge, delete, dissolve ─────────────────────────────
function oneShot(name, fn) {
  if (!needEdit()) return;
  const before = snap(), r = fn(); if (!r) return;
  S.st.m = r.m; S.st.sel = r.sel || E.emptySel(); pushUndo(name, before); S.lastOp = null;
  if (r.lastOp) setLastOp(name, before, r.lastOp.fields, r.lastOp.run);
  sceneChanged(); if (r.msg) msg(r.msg);
}
function mergeByDistance(dist = 0.0001) {
  const s = selFull(); if (!s.V.length) { msg('Select the vertices to merge first (A selects all).', true); return; }
  const base = E.clone(S.st.m), only = s.V;
  oneShot('Merge by Distance', () => { const r = E.mergeByDistance(base, dist, only), keep = only.filter(i => r.map.has(i)).map(i => r.map.get(i)); return { m: r.m, sel: E.flush(r.m, 'vert', { V: keep, E: [], F: [] }), msg: tr('Removed {n} vertice(s)', { n: r.removed }),
    lastOp: { fields: [{ k: 'dist', label: 'Merge Distance', v: dist, step: 0.001, min: 0 }], run: p => { const q = E.mergeByDistance(base, p.dist, only); msg(tr('Removed {n} vertice(s)', { n: q.removed })); return { m: q.m, sel: E.emptySel(), sm: S.st.sm }; } } }; });
}
function mergeAtCenter() {
  const s = selFull(); if (s.V.length < 2) { msg('Select two or more vertices to merge.', true); return; }
  oneShot('Merge at Center', () => { const m = E.clone(S.st.m), c = V.mul(s.V.reduce((a, i) => V.add(a, m.v[i]), [0, 0, 0]), 1 / s.V.length); for (const i of s.V) m.v[i] = [...c]; const r = E.mergeByDistance(m, 1e-9, s.V); return { m: r.m, msg: tr('Removed {n} vertice(s)', { n: r.removed }) }; });
}
function del(kind) {
  const s = selFull();
  const need = { verts: s.V.length, edges: s.E.length, faces: s.F.length, dverts: s.V.length, dedges: s.E.length, dfaces: s.F.length }[kind];
  if (!need) { msg('Nothing selected of that kind.', true); return; }
  const names = { verts: 'Delete Vertices', edges: 'Delete Edges', faces: 'Delete Faces', dverts: 'Dissolve Vertices', dedges: 'Dissolve Edges', dfaces: 'Dissolve Faces' };
  oneShot(names[kind], () => {
    const m = S.st.m;
    const out = kind === 'verts' ? E.deleteVerts(m, s.V) : kind === 'edges' ? E.deleteEdges(m, s.E) : kind === 'faces' ? E.deleteFaces(m, s.F) : kind === 'dverts' ? E.dissolveVerts(m, s.V) : kind === 'dedges' ? E.dissolveEdges(m, s.E) : E.dissolveFaces(m, s.F);
    return { m: out };
  });
}

// "Adjust Last Operation" panel, as in Blender (bottom left of the viewport).
function setLastOp(name, before, fields, run) { S.lastOp = fields && fields.length ? { name, before, fields: fields.map(f => ({ ...f })), run } : null; renderLastOp(); }
function renderLastOp() {
  const el = $('#last-op'), op = S.lastOp; el.hidden = !op || !edit(); if (!op) return;
  el.innerHTML = `<h5 data-no-i18n>${esc(op.name)}</h5>` + op.fields.map((f, i) => `<label><span data-no-i18n>${esc(f.label)}</span><input type="number" data-i="${i}" value="${f.int ? f.v : +(+f.v).toFixed(4)}" step="${f.step}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}></label>`).join('');
}
$('#last-op').addEventListener('change', e => {
  const op = S.lastOp, inp = e.target.closest('input'); if (!op || !inp) return;
  const f = op.fields[+inp.dataset.i], v = parseFloat(inp.value); if (!Number.isFinite(v)) return;
  f.v = Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, f.int ? Math.round(v) : v));
  const p = Object.fromEntries(op.fields.map(x => [x.k, x.v]));
  restore(op.before); const r = op.run(p); if (!r) { msg('Those values do not work here.', true); return; }
  S.st.m = r.m; S.st.sel = r.sel; S.st.sm = r.sm || S.st.sm;
  renderHeader(); buildGeometry(); saveData(); renderSidebar(); renderLabPanel(); checkProgress(); renderLastOp();
});
$('#last-op').addEventListener('keydown', e => e.stopPropagation());

// ─── Pointer input ───────────────────────────────────────────────────────────
const local = e => { const r = host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
host.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
host.addEventListener('contextmenu', e => e.preventDefault());
const touches = new Map();
canvas.addEventListener('pointerdown', e => {
  closeMenus(); hidePie();
  const [x, y] = local(e); S.mouse = [x, y];
  if (S.modal) {
    e.preventDefault();
    if (S.modal.op === 'loopcut') { if (e.button === 0) loopcutClick(); else if (e.button === 2) { if (S.modal.phase === 'slide') loopcutClick(true); else cancelModal(); } return; }
    if (e.button === 0) confirmModal(); else if (e.button === 2) cancelModal(); return;
  }
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, [x, y]);
    if (touches.size === 2) { const [a, b] = [...touches.values()]; S.nav = { mode: 'touch2', mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; S.box = null; return; }
    S.box = { x0: x, y0: y, x1: x, y1: y, mode: 'set', touch: true, moved: false }; return;
  }
  if (e.button === 1 || (e.button === 0 && e.altKey && !edit())) { e.preventDefault(); S.nav = { mode: e.shiftKey ? 'pan' : (e.ctrlKey || e.metaKey) ? 'zoom' : 'orbit', last: [x, y] }; host.classList.add('navigating'); return; }
  if (e.button === 0) S.box = { x0: x, y0: y, x1: x, y1: y, mode: S.boxArmed ? 'add' : e.shiftKey ? 'add' : (e.ctrlKey || e.metaKey) ? 'sub' : 'set', armed: S.boxArmed, moved: false, shift: e.shiftKey, alt: e.altKey };
});
canvas.addEventListener('pointermove', e => {
  const [x, y] = local(e); S.mouse = [x, y];
  if (S.modal) { modalMove(x, y, e); return; }
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    const prev = touches.get(e.pointerId); touches.set(e.pointerId, [x, y]);
    if (S.nav?.mode === 'touch2' && touches.size === 2) { const [a, b] = [...touches.values()], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(a[0] - b[0], a[1] - b[1]); S.st.view = V.pan(V.zoom(S.st.view, S.nav.d / Math.max(10, d)), mid[0] - S.nav.mid[0], mid[1] - S.nav.mid[1], W, H); S.nav.mid = mid; S.nav.d = d; viewChanged(); return; }
    if (S.box) { if (Math.hypot(x - S.box.x0, y - S.box.y0) > 8) S.box.moved = true; if (S.box.moved) { S.st.view = V.orbit(S.st.view, -(x - prev[0]) * 0.5, (y - prev[1]) * 0.5); viewChanged(); } }
    return;
  }
  if (S.nav) { const n = S.nav, dx = x - n.last[0], dy = y - n.last[1]; n.last = [x, y]; if (n.mode === 'orbit') S.st.view = V.orbit(S.st.view, -dx * 0.4, dy * 0.4); else if (n.mode === 'pan') S.st.view = V.pan(S.st.view, dx, dy, W, H); else if (n.mode === 'zoom') S.st.view = V.zoom(S.st.view, Math.exp(dy * 0.01)); viewChanged(); return; }
  if (S.box && !S.box.alt) {
    S.box.x1 = x; S.box.y1 = y; if (Math.hypot(x - S.box.x0, y - S.box.y0) > 4) S.box.moved = true;
    const r = $('#box-rect'); r.hidden = !S.box.moved || !edit(); Object.assign(r.style, { left: Math.min(S.box.x0, x) + 'px', top: Math.min(S.box.y0, y) + 'px', width: Math.abs(x - S.box.x0) + 'px', height: Math.abs(y - S.box.y0) + 'px' });
  }
});
canvas.addEventListener('pointerup', e => {
  const [x, y] = local(e);
  if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (S.nav?.mode === 'touch2') { if (touches.size === 0) S.nav = null; return; } if (S.box && !S.box.moved) clickAt(x, y, false, false); S.box = null; return; }
  if (S.nav) { S.nav = null; host.classList.remove('navigating'); saveData(); return; }
  if (S.box) {
    const b = S.box; S.box = null; $('#box-rect').hidden = true;
    if (!b.moved || b.alt) { if (b.armed) { S.boxArmed = false; renderStatusKeys(); } clickAt(x, y, b.shift, b.alt); return; }
    S.boxArmed = false; renderStatusKeys();
    if (edit()) boxSelect(b.x0, b.y0, x, y, b.mode);
  }
});
canvas.addEventListener('pointercancel', e => { touches.delete(e.pointerId); S.nav = null; S.box = null; $('#box-rect').hidden = true; });
function clickAt(x, y, extend, alt) {
  if (!edit()) {
    const ray = V.rayAt(S.st.view, x, y, W, H), h = E.rayHit(S.st.m, ray.o, ray.d); S.objSel = h.face >= 0 || (extend && S.objSel); renderLabPanel(); dirty = true;
    if (h.face >= 0 && sid() === 'e1' && !S.st.flags.tab) msg('Selected the Cube. Now press Tab to edit its mesh.');
    return;
  }
  clickSelect(x, y, extend, alt);
}
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (S.modal?.op === 'loopcut' && S.modal.phase === 'hover') { S.modal.n = Math.max(1, Math.min(20, S.modal.n + (e.deltaY < 0 ? 1 : -1))); loopcutHover(); return; }
  if (S.modal?.op === 'bevel') { S.modal.segments = Math.max(1, Math.min(12, S.modal.segments + (e.deltaY < 0 ? 1 : -1))); updateModal(); return; }
  if (S.modal) return;
  S.st.view = V.zoom(S.st.view, e.deltaY > 0 ? 1.15 : 1 / 1.15); viewChanged();
}, { passive: false });
host.addEventListener('pointerenter', () => { S.inView = true; });
host.addEventListener('pointerleave', () => { S.inView = false; });
gz.addEventListener('pointerdown', e => { e.stopPropagation(); if (S.modal) return; gz.setPointerCapture(e.pointerId); const r = gz.getBoundingClientRect(); S.nav = { mode: 'orbit', gizmo: true, last: [e.clientX, e.clientY], moved: false, ball: gizmoHit(e.clientX - r.left, e.clientY - r.top) }; });
gz.addEventListener('pointermove', e => {
  const r = gz.getBoundingClientRect(), hv = gizmoHit(e.clientX - r.left, e.clientY - r.top); if (hv !== gizmoHover) { gizmoHover = hv; dirty = true; }
  if (S.nav?.gizmo) { const dx = e.clientX - S.nav.last[0], dy = e.clientY - S.nav.last[1]; if (!S.nav.moved && Math.hypot(dx, dy) < 2) return; S.nav.moved = true; S.st.view = V.orbit(S.st.view, -dx * 0.6, dy * 0.6); S.nav.last = [e.clientX, e.clientY]; viewChanged(); }
});
gz.addEventListener('pointerup', () => { const n = S.nav; S.nav = null; if (!n?.gizmo) return; if (!n.moved && n.ball) { let name = BALL_VIEW[n.ball]; if (S.st.view.axis === name) name = BALL_VIEW[(n.ball[0] === '+' ? '-' : '+') + n.ball[1]]; axisView(name); } saveData(); dirty = true; });
gz.addEventListener('pointerleave', () => { gizmoHover = null; dirty = true; });
for (const b of document.querySelectorAll('[data-nav]')) {
  b.addEventListener('pointerdown', e => { e.stopPropagation(); if (b.dataset.nav === 'persp') return; b.setPointerCapture(e.pointerId); S.nav = { mode: b.dataset.nav, btn: true, last: [e.clientX, e.clientY] }; });
  b.addEventListener('pointermove', e => { if (S.nav?.btn) { const dx = e.clientX - S.nav.last[0], dy = e.clientY - S.nav.last[1]; S.nav.last = [e.clientX, e.clientY]; S.st.view = S.nav.mode === 'pan' ? V.pan(S.st.view, dx, dy, W, H) : V.zoom(S.st.view, Math.exp(dy * 0.01)); viewChanged(); } });
  b.addEventListener('pointerup', () => { if (S.nav?.btn) { S.nav = null; saveData(); } });
  b.addEventListener('click', () => { if (b.dataset.nav === 'persp') togglePersp(); });
}

// ─── Keyboard ────────────────────────────────────────────────────────────────
let hover = false;
$('#workspace').addEventListener('pointerenter', () => { hover = true; });
$('#workspace').addEventListener('pointerleave', () => { hover = false; });
const NUMPAD = { Numpad1: 'front', Numpad3: 'right', Numpad7: 'top' }, OPPOSITE = { front: 'back', right: 'left', top: 'bottom' };
function numpadCode(e) { if (e.code.startsWith('Numpad')) return e.code; if (S.emu && /^Digit[0-9]$/.test(e.code)) return 'Numpad' + e.code.slice(5); return null; }
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea') || !hover) return;
  if (S.modal) { modalKey(e); e.preventDefault(); return; }
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.length === 1 ? e.key.toLowerCase() : e.key, np = numpadCode(e);
  let handled = true;
  if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (ctrl && low === 'r') loopcut();
  else if (ctrl && low === 'b') bevel();
  else if (ctrl && low === 'i') selectInvert();
  else if (np) numpad(np, ctrl);
  else if (e.key === 'Home') frameAll();
  else if (e.key === 'Tab') toggleEdit();
  else if (e.key === 'Escape') { closeMenus(); hidePie(); S.boxArmed = false; renderStatusKeys(); }
  else if (ctrl) handled = false;
  else if (e.altKey && low === 'z') toggleXray();
  else if (e.altKey && low === 'a') selectNone();
  else if (!e.altKey && !e.shiftKey && /^Digit[123]$/.test(e.code)) setSelectMode(['vert', 'edge', 'face'][+e.code.slice(5) - 1]);
  else if (low === 'g') startTransform('move');
  else if (low === 'r') startTransform('rotate');
  else if (low === 's') startTransform('scale');
  else if (low === 'e') extrude();
  else if (low === 'i') inset();
  else if (low === 'm') { if (needEdit()) openMenu('merge', S.mouse); }
  else if (low === 'x' || e.key === 'Delete') { if (needEdit()) openMenu('delete', S.mouse); }
  else if (low === 'a') selectAll();
  else if (low === 'b') { if (needEdit()) { S.boxArmed = true; renderStatusKeys(); msg('Box Select: drag a box with the left button.'); } }
  else if (low === 'n') toggleSidebar();
  else if (e.key === '`' || e.code === 'Backquote') showPie();
  else handled = false;
  if (handled) e.preventDefault();
});
document.addEventListener('keyup', e => { if (S.modal && S.modal.op !== 'loopcut' && (e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta')) { S.modal.snap = e.ctrlKey || e.metaKey; S.modal.fine = e.shiftKey; updateModal(); } });
function numpad(code, ctrl) {
  const v = S.st.view;
  if (NUMPAD[code]) axisView(ctrl ? OPPOSITE[NUMPAD[code]] : NUMPAD[code]);
  else if (code === 'Numpad5') togglePersp();
  else if (code === 'NumpadDecimal') frameSelected();
  else if (code === 'Numpad2') setView(V.orbit(v, 0, 15));
  else if (code === 'Numpad8') setView(V.orbit(v, 0, -15));
  else if (code === 'Numpad4') setView(V.orbit(v, 15, 0));
  else if (code === 'Numpad6') setView(V.orbit(v, -15, 0));
  else if (code === 'Numpad9') { if (v.axis) axisView({ front: 'back', back: 'front', right: 'left', left: 'right', top: 'bottom', bottom: 'top' }[v.axis]); else setView(V.orbit(v, 180, 0)); }
  else if (code === 'NumpadAdd') setView(V.zoom(v, 1 / 1.2));
  else if (code === 'NumpadSubtract') setView(V.zoom(v, 1.2));
}

// ─── Menus, pie, header, sidebar ─────────────────────────────────────────────
function menuItems(id) {
  const h = S.undo;
  if (id === 'edit') return [['Undo', 'Ctrl Z', undo], ['Redo', 'Ctrl Shift Z', redo], '-', '#Undo History',
    ['Original', h.length === 0 ? '●' : '', () => jumpHistory(0)], ...h.map((e, i) => [e.name, '', () => jumpHistory(i + 1)]).slice(0, -1), ...(h.length ? [[h[h.length - 1].name, '●', () => {}]] : []),
    ...S.redo.slice().reverse().map((e, i) => [e.name, '', () => { for (let k = 0; k <= i; k++) redo(); }])];
  if (id === 'view') return [['Sidebar', 'N', toggleSidebar], '-', ['Frame Selected', 'Numpad .', frameSelected], ['Frame All', 'Home', frameAll], ['Perspective/Orthographic', 'Numpad 5', togglePersp], ['Toggle X-Ray', 'Alt Z', toggleXray], '-', '#Viewpoint',
    ...['top', 'bottom', 'front', 'back', 'right', 'left'].map(n => [V.VIEWS[n].label, V.VIEWS[n].key, () => axisView(n)])];
  if (id === 'select') return [['All', 'A', selectAll], ['None', 'Alt A', selectNone], ['Invert', 'Ctrl I', selectInvert], '-', ['Box Select', 'B', () => { S.boxArmed = true; renderStatusKeys(); }], '-', '#Select Loops', ['Edge Loops', 'Alt Click', () => msg('Alt + click an edge selects its loop.')]];
  if (id === 'mesh') return ['#Transform', ['Move', 'G', () => startTransform('move')], ['Rotate', 'R', () => startTransform('rotate')], ['Scale', 'S', () => startTransform('scale')], '-', '#Merge', ['At Center', 'M', mergeAtCenter], ['By Distance', 'M', () => mergeByDistance()], '-', '#Delete', ['Vertices', 'X', () => del('verts')], ['Edges', 'X', () => del('edges')], ['Faces', 'X', () => del('faces')], '-', ['Dissolve Vertices', '', () => del('dverts')], ['Dissolve Edges', '', () => del('dedges')], ['Dissolve Faces', '', () => del('dfaces')]];
  if (id === 'edge') return [['Bevel Edges', 'Ctrl B', bevel], ['Loop Cut and Slide', 'Ctrl R', loopcut]];
  if (id === 'face') return [['Extrude Faces', 'E', extrude], ['Inset Faces', 'I', inset]];
  if (id === 'merge') return ['#Merge', ['At Center', '', mergeAtCenter], ['By Distance', '', () => mergeByDistance()]];
  if (id === 'delete') return ['#Delete', ['Vertices', '', () => del('verts')], ['Edges', '', () => del('edges')], ['Faces', '', () => del('faces')], '-', ['Dissolve Vertices', '', () => del('dverts')], ['Dissolve Edges', '', () => del('dedges')], ['Dissolve Faces', '', () => del('dfaces')]];
  return [];
}
function jumpHistory(i) { const n = S.undo.length - i; for (let k = 0; k < n; k++) undo(); }
let menuEl = null, menuFor = null;
function openMenu(id, at, btn) {
  closeMenus(); menuFor = btn || null; if (btn) btn.setAttribute('aria-expanded', 'true');
  const items = menuItems(id), el = document.createElement('div'); el.className = 'context-menu vp-menu'; el.setAttribute('data-no-i18n', ''); el.setAttribute('role', 'menu');
  el.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : typeof it === 'string' ? `<div class="menu-title">${esc(it.slice(1))}</div>` : `<button type="button" role="menuitem" data-i="${i}"><span class="m-label">${esc(it[0])}</span><span class="m-key">${esc(it[1])}</span></button>`).join('');
  el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const it = items[+b.dataset.i]; closeMenus(); it[2](); });
  document.body.appendChild(el); menuEl = el;
  let x, y;
  if (btn) { const r = btn.getBoundingClientRect(); x = r.left; y = r.bottom + 2; } else { const r = host.getBoundingClientRect(); x = r.left + at[0] - 20; y = r.top + at[1] - 12; }
  const mr = el.getBoundingClientRect(); x = Math.min(x, innerWidth - mr.width - 8); y = Math.min(y, innerHeight - mr.height - 8);
  el.style.left = Math.max(4, x) + 'px'; el.style.top = Math.max(4, y) + 'px';
  el.querySelector('button')?.focus({ preventScroll: true });
}
function closeMenus() { menuEl?.remove(); menuEl = null; if (menuFor) menuFor.setAttribute('aria-expanded', 'false'); menuFor = null; }
document.addEventListener('pointerdown', e => { if (menuEl && !e.target.closest('.vp-menu') && !e.target.closest('[data-menu]')) closeMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuEl) closeMenus(); });
$('#workspace').addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (!b) return; if (menuFor === b) { closeMenus(); return; } openMenu(b.dataset.menu, null, b); });
const PIE = [['Left', 'left', -1, 0], ['Right', 'right', 1, 0], ['Bottom', 'bottom', 0, 1], ['Top', 'top', 0, -1], ['Front', 'front', -0.72, 0.72], ['Back', 'back', 0.72, 0.72], ['View Selected', 'sel', -0.72, -0.72], ['Frame All', 'all', 0.72, -0.72]];
function showPie() { const p = $('#pie'), [x, y] = S.inView ? S.mouse : [W / 2, H / 2]; p.innerHTML = `<span class="pie-title">View</span>` + PIE.map(([l, id, dx, dy]) => `<button type="button" data-pie="${id}" style="left:${x + dx * 130}px;top:${y + dy * 96}px">${esc(l)}</button>`).join('') + `<i class="pie-dot" style="left:${x}px;top:${y}px"></i>`; p.hidden = false; }
function hidePie() { $('#pie').hidden = true; }
$('#pie').addEventListener('click', e => { const b = e.target.closest('[data-pie]'); hidePie(); if (!b) return; const id = b.dataset.pie; if (id === 'sel') frameSelected(); else if (id === 'all') frameAll(); else axisView(id); });
function toggleSidebar() { S.sidebar = !S.sidebar; store.set('sidebar', S.sidebar); renderSidebar(); }
$('#sidebar-btn').addEventListener('click', toggleSidebar);
$('#emu-numpad').checked = S.emu;
$('#emu-numpad').addEventListener('change', e => { S.emu = e.target.checked; store.set('emu', S.emu); msg(S.emu ? 'Emulate Numpad on: the number row now changes the view, so use the header buttons for the select modes.' : 'Emulate Numpad off: 1, 2 and 3 are the select modes again.'); });
function renderHeader() {
  const ed = edit();
  $('#mode-btn').innerHTML = `${ICONS[ed ? 'editmode' : 'objectmode']}<span>${ed ? 'Edit Mode' : 'Object Mode'}</span>${ICONS.dropdown}`; $('#mode-btn').setAttribute('aria-pressed', String(ed));
  renderOutliner();
  document.querySelectorAll('[data-sm]').forEach(b => { b.setAttribute('aria-pressed', String(ed && S.st.sm === b.dataset.sm)); b.disabled = !ed; });
  $('#menus').innerHTML = (ed ? ['View', 'Select', 'Mesh', 'Edge', 'Face'] : ['View', 'Select', 'Object']).map(n => `<button type="button" class="menu-button" data-menu="${n.toLowerCase()}" aria-expanded="false">${n}</button>`).join('');
  $('#xray-btn').setAttribute('aria-pressed', String(!!S.st.xray && ed));
  host.classList.toggle('object-mode', !ed);
}
$('#mode-btn').addEventListener('click', toggleEdit);
// Blender icons for the header buttons (see blender-ui.js).
document.querySelectorAll('#workspace [data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon] + (el.classList.contains('bh-dd') ? ICONS.dropdown : ''); });
// The Outliner of the Modeling workspace: one mesh object, in Edit Mode or not.
function renderOutliner() {
  const ed = edit();
  $('#outliner').innerHTML = outlinerHTML([
    { name: 'Scene Collection', icon: 'scene_collection', open: true, depth: 0 },
    { name: 'Collection', icon: 'collection', open: true, depth: 1, exclude: false, eye: true, cam: true },
    { name: 'Cube', icon: 'ob_mesh', open: false, depth: 2, inline: ['data_mesh'], sel: true, active: true, mode: ed ? 'edit' : 'object', eye: true, cam: true },
  ], { showMode: true });
}
document.querySelectorAll('[data-sm]').forEach(b => b.addEventListener('click', () => setSelectMode(b.dataset.sm)));
$('#xray-btn').addEventListener('click', () => { if (!edit()) { msg('X-ray is used in Edit Mode here: press Tab.', true); return; } toggleXray(); });

// N panel in Edit Mode: the Median of the selected vertices (Blender's Item › Transform).
function renderSidebar() {
  $('#n-sidebar').hidden = !S.sidebar; $('#sidebar-btn').setAttribute('aria-pressed', String(S.sidebar));
  if (!S.sidebar) return;
  const body = $('#n-body');
  if (!edit()) { body.innerHTML = `<div class="n-panel"><h5 data-no-i18n>Transform</h5><p class="n-empty">${esc(t('In this lab the object stays at the origin. Press Tab to edit its mesh.'))}</p></div>`; return; }
  const s = selFull(); if (!s.V.length) { body.innerHTML = `<div class="n-panel"><h5 data-no-i18n>Transform</h5><p class="n-empty">${esc(t('Select vertices, edges or faces to see their median.'))}</p></div>`; return; }
  const med = V.mul(s.V.reduce((a, i) => V.add(a, S.st.m.v[i]), [0, 0, 0]), 1 / s.V.length);
  body.innerHTML = `<div class="n-panel" data-no-i18n><h5>Transform</h5><div class="n-group"><span class="n-label">${s.V.length === 1 ? 'Vertex' : 'Median'}</span>${[0, 1, 2].map(i => `<label class="n-field"><span class="ax">${'XYZ'[i]}</span><input data-f="${i}" value="${V.fmt(Math.round(med[i] * 10000) / 10000)} m" inputmode="decimal" aria-label="Median ${'XYZ'[i]}"></label>`).join('')}<span class="n-mode">Global</span></div></div>`;
}
$('#n-body').addEventListener('change', e => {
  const inp = e.target.closest('input'); if (!inp) return; const v = parseFloat(inp.value.replace(',', '.')), s = selFull(); if (!Number.isFinite(v) || !s.V.length) { renderSidebar(); return; }
  const i = +inp.dataset.f, med = s.V.reduce((a, k) => a + S.st.m.v[k][i], 0) / s.V.length, before = snap();
  for (const k of s.V) S.st.m.v[k][i] = Math.round((S.st.m.v[k][i] + v - med) * 1e6) / 1e6;
  pushUndo('Transform', before); inp.blur(); sceneChanged();
});
$('#n-body').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });

// ─── Lab panel: mesh analyser and step readouts ──────────────────────────────
const statRow = (label, val, cls = '') => `<div class="sb-stat ${cls}"><span>${label}</span><b>${val}</b></div>`;
function renderLabPanel() {
  const st = S.st, id = sid(), a = E.analyze(st.m); let h = '';
  const yes = ok => ok ? '✓' : '·';
  if (id === 'e1') { const r = markReport(st), f = st.flags; h = `<h4>${esc(t('Marks'))}</h4>` + statRow(esc(t('Edit Mode (Tab)')), yes(edit() || f.tab), edit() || f.tab ? 'good' : '') + statRow(esc(t('Vertex (1)')), yes(f.v || r.v), f.v || r.v ? 'good' : '') + statRow(esc(t('Edge (2)')), yes(f.e || r.e), f.e || r.e ? 'good' : '') + statRow(esc(t('Face (3)')), yes(f.f || r.f), f.f || r.f ? 'good' : ''); }
  else if (id === 'e2') { const r = halfReport(st); h = `<h4>${esc(t('The +X half'))}</h4>` + statRow(esc(t('Vertices selected')), `${r.hit} / ${r.total}`, r.hit === r.total ? 'good' : '') + statRow(esc(t('Extra vertices')), r.extra, r.extra ? 'bad' : 'good') + statRow('<span data-no-i18n>X-Ray</span>', st.xray ? 'On' : 'Off', st.xray ? 'good' : ''); }
  else if (id === 'e3') { const r = loopsReport(st); h = `<h4>${esc(t('Loops'))}</h4>` + statRow(esc(t('Equator loop')), yes(r.equator), r.equator ? 'good' : '') + statRow(esc(t('Full loops selected')), `${r.loops} / 2`, r.loops === 2 ? 'good' : '') + (r.partial ? `<p class="sb-empty warn">${esc(t('Some selected vertices are not part of a full loop.'))}</p>` : ''); }
  else if (id === 'e4') { const r = deformReport(st.m), ok = shapeReport(st, 'e4').ok; h = `<h4>${esc(t('Goal: the blue wireframe'))}</h4>` + statRow(esc(t('Top face height')), `${V.fmt(Math.round(r.z * 100) / 100)} m`, Math.abs(r.z - 3) < 0.02 ? 'good' : '') + statRow(esc(t('Top face half width')), `${V.fmt(Math.round(r.half * 100) / 100)} m`, Math.abs(r.half - 0.5) < 0.02 ? 'good' : '') + statRow(esc(t('Matches the goal')), yes(ok), ok ? 'good' : ''); }
  else if (id === 'e5' || id === 'e6' || id === 'e7') { const r = shapeReport(st, id); h = `<h4>${esc(t('Goal: the blue wireframe'))}</h4>` + statRow(esc(t('Vertices')), `${r.verts} / ${r.want}`, r.verts === r.want ? 'good' : '') + statRow(esc(t('Faces')), `${r.faces} / ${r.wantFaces}`, r.faces === r.wantFaces ? 'good' : '') + statRow(esc(t('Matches the goal')), yes(r.ok), r.ok ? 'good' : ''); }
  else if (id === 'e8') { const r = bevelReport(st); h = `<h4>${esc(t('Bevel'))}</h4>` + statRow('<span data-no-i18n>Width</span>', r.verts > 8 ? `${V.fmt(Math.round(r.w * 100) / 100)} m` : '—', r.w >= 0.45 && r.w <= 0.55 ? 'good' : '') + statRow('<span data-no-i18n>Segments</span>', r.verts > 8 ? r.seg : '—', r.seg === 4 ? 'good' : '') + `<p class="sb-empty">${esc(t('Goal: Width 0.45–0.55 m, 4 Segments, on the four vertical edges.'))}</p>`; }
  else if (id === 'e9') { const r = cleanReport(st); h = `<h4>${esc(t('Goal'))}</h4>` + statRow(esc(t('Clean cube: 8 vertices, 6 quads')), yes(r.ok), r.ok ? 'good' : ''); }
  else if (id === 'e10') { const r = stoolReport(st); h = `<h4>${esc(t('The stool'))}</h4>` + statRow(esc(t('Clean mesh')), yes(r.clean), r.clean ? 'good' : 'bad') + statRow(esc(t('Separate legs near the floor')), `${r.legs} / 4`, r.legs === 4 ? 'good' : '') + statRow(esc(t('Legs 1 m long')), yes(r.long), r.long ? 'good' : '') + statRow(esc(t('Seat width')), `${V.fmt(Math.round(r.seatW * 100) / 100)} m`, r.seatW >= 1.2 ? 'good' : ''); }
  else if (id === 'f1') h = `<h4>${esc(t('Free mode'))}</h4>`;
  const bad = (n, cls = 'bad') => n ? cls : 'good';
  h += `<div class="sb-sep"></div><h4>${esc(t('Mesh analyser'))}</h4>` +
    statRow(esc(t('Vertices · Edges · Faces')), `${a.verts} · ${a.edges} · ${a.faces}`) +
    statRow(esc(t('Triangles · Quads · N-gons')), `${a.tris} · ${a.quads} · ${a.ngons}`) +
    statRow(esc(t('Duplicated vertices')), a.duplicates, bad(a.duplicates)) +
    statRow(esc(t('Loose vertices')), a.loose, bad(a.loose)) +
    statRow(esc(t('Vertices in the middle of an edge')), a.midEdge, bad(a.midEdge)) +
    statRow(esc(t('Open edges (holes)')), a.boundary, bad(a.boundary)) +
    statRow(esc(t('Edges with 3+ faces')), a.overShared, bad(a.overShared));
  $('#lab-panel').innerHTML = `<div class="panel">${h}</div>`;
}
function renderStatusKeys() {
  const k = (keys, label) => `<span>${keys.map(x => `<kbd>${esc(x)}</kbd>`).join('')}${esc(t(label))}</span>`;
  let h;
  if (S.modal?.op === 'loopcut') h = S.modal.phase === 'hover' ? [k(['Wheel'], 'Number of cuts'), k(['LMB'], 'Cut'), k(['RMB'], 'Cancel')].join('') : [k(['LMB'], 'Confirm'), k(['RMB'], 'Keep it centred')].join('');
  else if (S.modal?.op === 'bevel') h = [k(['LMB'], 'Confirm'), k(['RMB'], 'Cancel'), k(['Wheel'], 'Segments'), k(['0–9'], 'Type the width')].join('');
  else if (S.modal) h = [k(['LMB'], 'Confirm'), k(['RMB'], 'Cancel'), k(['X', 'Y', 'Z'], 'Axis'), k(['Shift', 'Z'], 'Lock axis'), k(['Ctrl'], 'Snap'), k(['0–9'], 'Type a value')].join('');
  else if (!edit()) h = [k(['Tab'], 'Edit Mode'), k(['MMB'], 'Orbit'), k(['Shift', 'MMB'], 'Pan'), k(['Wheel'], 'Zoom')].join('');
  else h = [k(['1', '2', '3'], 'Vertex · Edge · Face'), k(['LMB'], 'Select'), k(['Alt', 'LMB'], 'Loop'), k(['MMB'], 'Orbit'), k(['Alt', 'Z'], 'X-Ray'), k(['Tab'], 'Object Mode')].join('');
  $('#status-keys').innerHTML = h;
}

// ─── Steps, storage ──────────────────────────────────────────────────────────
const dataKey = () => `step:${stage().id}-${sid()}`;
function saveData() { store.set(dataKey(), { st: S.st, undo: S.undo.slice(-12) }); }
function loadData() {
  const saved = store.get(dataKey(), null), fresh = startState(step());
  if (saved?.st?.m?.v && saved.st.view) { S.st = { ...fresh, ...saved.st, flags: saved.st.flags || {} }; S.undo = Array.isArray(saved.undo) ? saved.undo : []; }
  else { S.st = fresh; S.undo = []; }
  S.redo = []; S.st.aspect = W / H; S.lastOp = null;
}
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${stage().steps[i].id}`;
const stepDone = i => { const s = stage().steps[i]; if (s.free) return false; return i === S.step ? !!s.check(S.st) : !!S.done[doneKey(i)]; };
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.className = `guide${n === 5 ? ' five' : n === 3 ? ' three' : n === 2 ? ' two' : n === 1 ? ' one' : ''}`;
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(s.free ? 'No goal: practise' : stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(); });
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(s.free ? 'Free mode' : ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      ${s.free ? '' : `<button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>`}
      <button type="button" class="mini-link" id="reset-step">${esc(t(s.free ? 'Start from a cube again' : 'Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo('Reset', snap()); const f = startState(step()); Object.assign(S.st, { m: f.m, sel: f.sel, sm: f.sm, mode: f.mode, flags: {}, xray: false, view: f.view }); S.lastOp = null; sceneChanged(); msg('Back to the start. Ctrl Z brings your mesh back.'); }
  if (id === 'show-solution') { pushUndo('Solution', snap()); step().solve(S.st); S.lastOp = null; sceneChanged(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null, lastCard = '';
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) { const title = step().title; setTimeout(() => { if (step().title === title) msg(tr('✓ Step done: {s}', { s: t(title) })); }, 700); }
  const k = `${S.stageIndex}|${S.step}|${ok}|${document.documentElement.lang}`;
  if (k !== lastCard) { renderGuide(); renderStepCard(); lastCard = k; }
  lastOk = ok;
}
function enterStep() {
  if (S.modal) { endModal(); } S.anim = null; S.boxArmed = false; closeMenus(); hidePie();
  loadData(); lastCard = ''; lastOk = stepDone(S.step); S.objSel = true;
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  renderStageSwitch(); sceneChanged(false);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); renderLabPanel(); renderSidebar(); renderStatusKeys(); checkProgress(); dirty = true; });

// ─── Start ───────────────────────────────────────────────────────────────────
resize(); enterStep(); requestAnimationFrame(loop);
window.__em = {
  S, STAGES, E, V, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, solve: () => { step().solve(S.st); sceneChanged(); },
  key: (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: o.code || '', ctrlKey: !!o.ctrl, shiftKey: !!o.shift, altKey: !!o.alt, bubbles: true })),
  project: p => V.project(S.st.view, p, W, H), setHover: v => { hover = v; S.inView = v; }, TARGETS,
};
