// Viewport Lab: a Blender-like 3D Viewport in Object Mode (navigation, selection, G/R/S).
import * as THREE from 'three';
import { ICONS, outlinerHTML } from '../../blender-ui.js?v=1';
import * as V from './vp.js?v=1';
import { STAGES, startState, MARKS, MARK_N, VIEW_ORDER, markSeen, panReport, selectReport, moveReport, exactReport, undoReport, ghostState, SELECT_GOAL, PAN_GOAL } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-viewport:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-viewport:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [],
  done: store.get('done', {}), modal: null, nav: null, box: null, boxArmed: false, mouse: [0, 0], inView: false,
  sidebar: store.get('sidebar', false), emu: store.get('emu', false), anim: null,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
const sid = () => step().id;
const objByName = n => S.st.objs.find(o => o.name === n);
const selObjs = () => S.st.sel.map(objByName).filter(Boolean);

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

// Floor grid: 1 m lines, the red X axis and the green Y axis (as in Blender's overlays).
const grid = new THREE.Group(); scene.add(grid);
{
  const pts = [], pts10 = [], N = 40;
  // Short segments: long lines that pass behind the eye are clipped badly by some GPUs.
  const seg = (arr, a, b, c, d) => { for (let k = 0; k < 20; k++) { const u = k / 20, w = (k + 1) / 20; arr.push(a + (c - a) * u, b + (d - b) * u, 0, a + (c - a) * w, b + (d - b) * w, 0); } };
  for (let i = -N; i <= N; i++) { if (i === 0) continue; const arr = i % 10 ? pts : pts10; seg(arr, i, -N, i, N); seg(arr, -N, i, N, i); }
  const ax = [], ay = []; seg(ax, -N, 0, N, 0); seg(ay, 0, -N, 0, N);
  const mk = (arr, color, opacity) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); };
  grid.add(mk(pts, 0x5a5a5a, 0.55), mk(pts10, 0x6a6a6a, 0.8), mk(ax, 0xff3352, 0.9), mk(ay, 0x8bdc00, 0.9));
}

const GEO = {};
function geometry(kind) {
  if (GEO[kind]) return GEO[kind];
  let g;
  if (kind === 'cube') g = new THREE.BoxGeometry(2, 2, 2);
  else if (kind === 'sphere') g = new THREE.SphereGeometry(1, 32, 16);
  else if (kind === 'cylinder') { g = new THREE.CylinderGeometry(1, 1, 2, 32); g.rotateX(Math.PI / 2); }
  else if (kind === 'cone') { g = new THREE.ConeGeometry(1, 2, 32); g.rotateX(Math.PI / 2); }
  else if (kind === 'plane') g = new THREE.PlaneGeometry(2, 2);
  else if (kind === 'torus') g = new THREE.TorusGeometry(1, 0.25, 12, 48);
  else if (kind === 'arrow') {
    const shaft = new THREE.BoxGeometry(1.3, 0.3, 0.3); shaft.translate(-0.35, 0, 0);
    const head = new THREE.ConeGeometry(0.35, 0.7, 4); head.rotateZ(-Math.PI / 2); head.rotateX(Math.PI / 4); head.translate(0.65, 0, 0);
    g = mergeGeos([shaft.toNonIndexed(), head.toNonIndexed()]);
  } else g = new THREE.BoxGeometry(1, 1, 1);
  g.computeVertexNormals?.(); if (kind === 'cube' || kind === 'arrow') { /* keep flat normals */ }
  return (GEO[kind] = g);
}
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g of list) { g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
}
const solidMat = new THREE.MeshStandardMaterial({ color: 0xc4c4c4, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
const lockedMat = new THREE.MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.7, metalness: 0 });
const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
const COL = { sel: 0xf15800, active: 0xffaa40, line: 0x101010, ghost: 0x4da3ff, ghostOk: 0x5fcf5f, mark: 0xff8a1c, markOk: 0x5fcf5f };

// Camera and light objects are drawn with lines, like Blender's overlays.
function lineObject(kind) {
  const P = [];
  if (kind === 'camera') {
    const w = 0.5, h = 0.35, d = 1.1, c = [[-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d]];
    for (let i = 0; i < 4; i++) P.push(0, 0, 0, ...c[i], ...c[i], ...c[(i + 1) % 4]);
    P.push(-0.3, h + 0.08, -d, 0.3, h + 0.08, -d, 0.3, h + 0.08, -d, 0, h + 0.4, -d, 0, h + 0.4, -d, -0.3, h + 0.08, -d);
  } else {
    const r = 0.22; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2; P.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r, Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(b) * r, Math.sin(b) * r, 0); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COL.line }));
}

const objGroup = new THREE.Group(); scene.add(objGroup);
const ghostGroup = new THREE.Group(); scene.add(ghostGroup);
const views = new Map(); // name → { root, mesh, kind, marks, lines, stem }
function syncObjects() {
  const st = S.st, names = new Set(st.objs.map(o => o.name));
  for (const [n, v] of views) if (!names.has(n)) { objGroup.remove(v.root); views.delete(n); }
  for (const o of st.objs) {
    let v = views.get(o.name);
    if (!v || v.kind !== o.kind || !!v.marks !== !!o.mark) { if (v) objGroup.remove(v.root); v = buildView(o); views.set(o.name, v); objGroup.add(v.root); }
    v.root.position.set(...o.loc);
    v.root.quaternion.copy(quat(o.rot));
    v.body.scale.set(...o.scale);
    if (v.stem) { const z = o.loc[2]; v.stem.geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -z)]); v.stem.quaternion.copy(quat(o.rot).invert()); }
    const sel = st.sel.includes(o.name), act = st.active === o.name && sel;
    if (v.lines) v.lines.material.color.setHex(act ? COL.active : sel ? COL.sel : COL.line);
    if (v.marks) { const seen = st.flags.seen || {}; for (const m of v.marks) m.material.color.setHex(seen[m.userData.mark] ? COL.markOk : COL.mark); }
  }
  syncGhosts();
}
const quat = r => { const q = V.eulerToQuat(r); return new THREE.Quaternion(q[1], q[2], q[3], q[0]); };
function buildView(o) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.userData.name = o.name;
  const v = { root, body, kind: o.kind };
  if (o.kind === 'camera' || o.kind === 'light') {
    v.lines = lineObject(o.kind); body.add(v.lines);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(...(V.HALF[o.kind].map(h => h * 2.4))), pickMat); if (o.kind === 'camera') pick.position.z = -0.5; pick.userData.name = o.name; pick.userData.pick = true; body.add(pick); v.mesh = pick;
    if (o.kind === 'light') { v.stem = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x151515, dashSize: 0.15, gapSize: 0.1 })); root.add(v.stem); }
  } else {
    const m = new THREE.Mesh(geometry(o.kind), o.lock ? lockedMat : solidMat); m.userData.name = o.name; body.add(m); v.mesh = m;
    if (o.mark) {
      v.marks = o.mark.map(k => {
        const n = MARK_N[k], pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ color: COL.mark, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
        pl.position.set(n[0] * 1.001, n[1] * 1.001, n[2] * 1.001); pl.lookAt(n[0] * 2, n[1] * 2, n[2] * 2); pl.userData.mark = k; pl.userData.name = o.name; body.add(pl); return pl;
      });
    }
  }
  return v;
}
function syncGhosts() {
  ghostGroup.clear();
  const st = S.st; if (!st.ghosts.length) return;
  const ok = sid() === 's2' ? (() => { const r = moveReport(st); return st.ghosts.map(g => g.name === 'Cube' ? r.cube : g.name === 'Cube.001' ? r.up : r.far); })()
    : sid() === 's3' ? (() => { const r = exactReport(st); return st.ghosts.map(g => g.name === 'Cube' ? r.move : g.name === 'Arrow' ? r.rot : r.scale); })()
    : sid() === 'u1' ? [undoReport(st).back] : ghostState(st);
  st.ghosts.forEach((g, i) => {
    const color = ok[i] ? COL.ghostOk : COL.ghost, geo = geometry(g.kind);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false }));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    const gr = new THREE.Group(); gr.add(m, e); gr.position.set(...g.loc); gr.quaternion.copy(quat(g.rot)); gr.scale.set(...g.scale); ghostGroup.add(gr);
  });
}

// Selection outline: a mask pass (0 = not selected, 0.5 = selected, 1 = active) and an edge filter on top.
const maskRT = new THREE.WebGLRenderTarget(4, 4);
const maskMats = [0, 0.5, 1].map(v => new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v) }));
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const outlineMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: { mask: { value: maskRT.texture }, px: { value: new THREE.Vector2(1, 1) }, cSel: { value: new THREE.Color(COL.sel) }, cAct: { value: new THREE.Color(COL.active) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D mask; uniform vec2 px; uniform vec3 cSel; uniform vec3 cAct; varying vec2 vUv;
    void main(){ float c = texture2D(mask, vUv).r, hi = c, lo = c;
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) { if (i*i + j*j > 5) continue; float m = texture2D(mask, vUv + vec2(float(i), float(j)) * px).r; hi = max(hi, m); lo = min(lo, m); }
      if (hi - lo < 0.2 || hi < 0.3) discard;
      gl_FragColor = vec4(hi > 0.75 ? cAct : cSel, 1.0); }`,
});
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMat));
// Origins of the selected objects: small orange dots, drawn on top.
const originGeo = new THREE.BufferGeometry(), origins = new THREE.Points(originGeo, new THREE.PointsMaterial({ color: COL.sel, size: 6, sizeAttenuation: false, depthTest: false }));
origins.renderOrder = 10; scene.add(origins);

let W = 800, H = 450, dirty = true;
function resize() {
  const r = host.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(200, r.height);
  renderer.setSize(W, H, false); const dpr = renderer.getPixelRatio(); maskRT.setSize(Math.round(W * dpr), Math.round(H * dpr));
  outlineMat.uniforms.px.value.set(1 / (W * dpr) * dpr * 0.75, 1 / (H * dpr) * dpr * 0.75);
  if (S.st) { S.st.aspect = W / H; } dirty = true;
}
new ResizeObserver(resize).observe(host);
function activeCamera() {
  const v = S.st.view, b = V.basisOf(v), aspect = W / H;
  const cam = v.ortho ? ortho : persp;
  if (v.ortho) {
    const h = V.viewHeight(v, aspect, v.dist) / 2; ortho.left = -h * aspect; ortho.right = h * aspect; ortho.top = h; ortho.bottom = -h;
    const back = V.add(v.target, V.mul(b.f, -Math.max(400, v.dist * 4))); ortho.position.set(...back); ortho.near = 0.05; ortho.far = Math.max(800, v.dist * 8);
  } else { persp.fov = V.vfov(aspect); persp.aspect = aspect; persp.position.set(...b.eye); persp.near = Math.max(0.01, v.dist / 500); persp.far = 2000; }
  cam.up.set(...b.u); cam.lookAt(...v.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  key.position.set(...V.add(b.eye, V.add(V.mul(b.r, -v.dist * 0.35), V.mul(b.u, v.dist * 0.5)))); key.target.position.set(...v.target);
  rim.position.set(...V.add(v.target, V.add(V.mul(b.f, v.dist), V.mul(b.r, v.dist)))); rim.target.position.set(...v.target);
  return cam;
}
function render() {
  if (!S.st) return;
  const cam = activeCamera(), st = S.st;
  // Origins
  const pts = selObjs().filter(o => o.kind !== 'camera' && o.kind !== 'light').flatMap(o => o.loc);
  originGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); origins.visible = pts.length > 0;
  renderer.setRenderTarget(null); renderer.render(scene, cam);
  // Mask pass for the outline
  const any = st.sel.length > 0;
  if (any) {
    const saved = [];
    grid.visible = false; ghostGroup.visible = false; origins.visible = false;
    for (const [n, v] of views) {
      const sel = st.sel.includes(n), act = sel && st.active === n;
      v.root.traverse(ob => { if (ob.isMesh) { saved.push([ob, ob.material, ob.visible]); if (ob.userData.pick || ob.userData.mark) { ob.visible = !!ob.userData.mark; ob.material = maskMats[act ? 2 : sel ? 1 : 0]; } else ob.material = maskMats[act ? 2 : sel ? 1 : 0]; } else if (ob.isLine) { saved.push([ob, ob.material, ob.visible]); ob.visible = false; } });
    }
    renderer.setRenderTarget(maskRT); renderer.setClearColor(0x000000); renderer.clear(); renderer.render(scene, cam);
    for (const [ob, m, vis] of saved) { ob.material = m; ob.visible = vis; }
    grid.visible = true; ghostGroup.visible = true; origins.visible = pts.length > 0;
    renderer.setRenderTarget(null); renderer.setClearColor(0x393939);
    renderer.autoClear = false; renderer.render(quadScene, quadCam); renderer.autoClear = true;
    // origins again on top of the outline
    if (pts.length) { const vis = [grid.visible, objGroup.visible, ghostGroup.visible]; grid.visible = objGroup.visible = ghostGroup.visible = false; renderer.autoClear = false; renderer.render(scene, cam); renderer.autoClear = true; [grid.visible, objGroup.visible, ghostGroup.visible] = vis; }
  }
  drawGizmo(); placeCursor(); renderViewText();
}
function loop(now) {
  if (S.anim) stepAnim(now);
  if (dirty) { dirty = false; render(); }
  requestAnimationFrame(loop);
}

// ─── Overlays: view name, 3D cursor, navigation gizmo ───────────────────────
function renderViewText() {
  const st = S.st, act = st.active && objByName(st.active);
  $('#vp-text').innerHTML = `<b>${esc(V.viewName(st.view))}</b><br>(1) Collection${act ? ' | ' + esc(act.name) : ''}`;
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
  for (const [k, a] of Object.entries(V.AXES)) for (const s of [1, -1]) {
    const w = V.mul(a, s); out.push({ id: (s > 0 ? '+' : '-') + k, k, s, x: c + V.dot(w, b.r) * R, y: c - V.dot(w, b.u) * R, z: V.dot(w, b.f) });
  }
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
    const r = p.s > 0 ? 9 : 7.5; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
    if (p.s > 0) { g.fillStyle = AXC[p.k][0]; g.fill(); } else { g.fillStyle = AXC[p.k][1] + 'cc'; g.fill(); g.strokeStyle = AXC[p.k][0]; g.lineWidth = 1.2; g.stroke(); }
    if (gizmoHover === p.id) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
    if (p.s > 0) { g.fillStyle = '#111'; g.font = '700 11px Inter, Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.k.toUpperCase(), p.x, p.y + 0.5); }
  }
}
const BALL_VIEW = { '+x': 'right', '-x': 'left', '+y': 'back', '-y': 'front', '+z': 'top', '-z': 'bottom' };
function gizmoHit(x, y) { for (const p of gizmoBalls().reverse()) if (Math.hypot(p.x - x, p.y - y) <= 10) return p.id; return null; }

// ─── View changes (with a short smooth move, like Blender's Smooth Zoom/View) ──
function setView(v, animate = true) {
  const from = { ...S.st.view };
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { S.st.view = v; viewChanged(); return; }
  let dAz = v.az - from.az; dAz = ((dAz + 540) % 360) - 180;
  S.anim = { from, to: v, dAz, t0: performance.now(), ms: 220 };
  S.st.view = { ...from, ortho: v.ortho, axis: v.axis, auto: v.auto };
}
function stepAnim(now) {
  const a = S.anim, k = Math.min(1, (now - a.t0) / a.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, f = a.from, to = a.to;
  S.st.view = { ...to, target: f.target.map((x, i) => x + (to.target[i] - x) * e), dist: f.dist * Math.pow(to.dist / f.dist, e), az: f.az + a.dAz * e, el: f.el + (to.el - f.el) * e };
  if (k >= 1) { S.anim = null; S.st.view = to; viewChanged(); } else dirty = true;
}
let viewSaveT;
function viewChanged() {
  dirty = true;
  if (sid() === 'n1' && markSeen(S.st)) { syncObjects(); msg(tr('Found a mark: {n} of 3.', { n: MARKS.filter(m => S.st.flags.seen[m]).length })); saveData(); checkProgress(); renderLabPanel(); return; }
  if (sid() === 'n2') { renderLabPanel(); checkProgress(); }
  clearTimeout(viewSaveT); viewSaveT = setTimeout(saveData, 300);
}
function axisView(name, via) {
  const v = V.setAxisView(S.st.view, name);
  setView(v);
  if (sid() === 'n4') {
    const i = S.st.flags.viewIdx | 0;
    if (i < VIEW_ORDER.length) {
      if (VIEW_ORDER[i] === name) { S.st.flags.viewIdx = i + 1; const nx = VIEW_ORDER[i + 1]; msg(nx ? tr('✓ {a}. Next: {b} ({k}).', { a: V.VIEWS[name].label, b: V.VIEWS[nx].label, k: V.VIEWS[nx].key }) : tr('✓ {a}.', { a: V.VIEWS[name].label })); }
      else msg(tr('That is the {a} view. Next: {b} ({k}).', { a: V.VIEWS[name].label, b: V.VIEWS[VIEW_ORDER[i]].label, k: V.VIEWS[VIEW_ORDER[i]].key }), true);
      saveData(); checkProgress(); renderLabPanel();
    }
  }
  void via;
}
function frameSelected() {
  if (step().noFrame) { msg('In this step, move the view with the mouse: pan and zoom.', true); return; }
  const sel = selObjs(); if (!sel.length) { msg('Nothing selected: select an object first.', true); return; }
  setView(V.frame(S.st.view, sel, W / H));
  if (sid() === 'n3') {
    if (S.st.sel.length === 1 && S.st.sel[0] === 'Cone') { S.st.flags.framed = true; msg('✓ Framed the Cone. Now press Home to see everything again.'); }
    else msg('Framed the selection. Select only the Cone and try again.', true);
    saveData(); checkProgress(); renderLabPanel();
  }
}
function frameAll() {
  if (step().noFrame) { msg('In this step, move the view with the mouse: pan and zoom.', true); return; }
  const vis = S.st.objs.filter(o => !o.hide); if (!vis.length) return;
  setView(V.frame(S.st.view, vis, W / H));
  if (sid() === 'n3') {
    if (S.st.flags.framed) { S.st.flags.home = true; } else msg('Frame All shows everything. First frame the Cone with Numpad .', true);
    saveData(); checkProgress(); renderLabPanel();
  }
}
function togglePersp() { const v = S.st.view; setView({ ...v, ortho: !v.ortho, auto: false }, false); msg(S.st.view.ortho ? 'Orthographic' : 'Perspective'); }

// ─── Picking and selection ───────────────────────────────────────────────────
const ray = new THREE.Raycaster(); ray.params.Line = { threshold: 0.1 };
function pick(px, py) {
  const cam = activeCamera(), ndc = new THREE.Vector2(px / W * 2 - 1, 1 - py / H * 2);
  ray.setFromCamera(ndc, cam);
  const meshes = []; for (const v of views.values()) v.root.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const h of ray.intersectObjects(meshes, false)) { const n = h.object.userData.name, o = n && objByName(n); if (o && !o.lock && !o.hide) return n; if (o && o.lock) return { locked: n }; }
  return null;
}
function applySelection(r) { S.st.sel = r.sel; S.st.active = r.active; selectionChanged(); }
function selectionChanged() { syncObjects(); saveData(); renderOutliner(); renderSidebar(); renderLabPanel(); checkProgress(); dirty = true; }
function selectAll() { applySelection({ sel: S.st.objs.filter(o => !o.lock && !o.hide).map(o => o.name), active: S.st.active }); }
function selectNone() { applySelection({ sel: [], active: S.st.active }); }
function selectInvert() { applySelection({ sel: S.st.objs.filter(o => !o.lock && !o.hide && !S.st.sel.includes(o.name)).map(o => o.name), active: S.st.active }); }
function boxInside(x0, y0, x1, y1) {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)], [c, d] = [Math.min(y0, y1), Math.max(y0, y1)], out = [];
  for (const o of S.st.objs) {
    if (o.lock || o.hide) continue;
    const pts = [o.loc, ...V.corners(o)];
    // A few points inside the box volume too, so a box on the middle of a big object also counts.
    const hit = pts.some(p => { const s = V.project(S.st.view, p, W, H); return (S.st.view.ortho || s.depth > 0) && s.x >= a && s.x <= b && s.y >= c && s.y <= d; });
    if (hit) out.push(o.name);
  }
  return out;
}

// ─── Undo ────────────────────────────────────────────────────────────────────
const snap = () => ({ objs: V.cloneObjs(S.st.objs), sel: [...S.st.sel], active: S.st.active });
function pushUndo(name, before = snap()) { S.undo.push({ name, snap: before }); if (S.undo.length > 64) S.undo.shift(); S.redo = []; }
function restore(s) { S.st.objs = V.cloneObjs(s.objs); S.st.sel = [...s.sel]; S.st.active = s.active; }
function undo() {
  if (!S.undo.length) { msg('Nothing to undo.'); return; }
  const e = S.undo.pop(); S.redo.push({ name: e.name, snap: snap() }); restore(e.snap); sceneChanged(); msg(tr('Undo {s}', { s: e.name }));
}
function redo() {
  if (!S.redo.length) { msg('Nothing to redo.'); return; }
  const e = S.redo.pop(); S.undo.push({ name: e.name, snap: snap() }); restore(e.snap); sceneChanged(); msg(tr('Redo {s}', { s: e.name }));
}
function sceneChanged(save = true) { syncObjects(); if (save) saveData(); renderOutliner(); renderSidebar(); renderLabPanel(); checkProgress(); dirty = true; }

// ─── Modal transforms ────────────────────────────────────────────────────────
const MODAL_NAME = { move: 'Move', rotate: 'Rotate', scale: 'Scale' };
function startModal(type, opts = {}) {
  const sel = selObjs().filter(o => !o.lock);
  if (!sel.length) { msg('Nothing selected: click an object first.', true); return; }
  const inside = S.inView;
  const pv = V.project(S.st.view, V.medianOf(sel), W, H);
  const start = inside ? [...S.mouse] : [pv.x + 80, pv.y - 40];
  S.modal = { type, axis: null, plane: false, orient: 'global', start, cur: [...start], last: [...start], angle: 0, typed: '', snap: false, fine: false,
    names: sel.map(o => o.name), objs0: V.cloneObjs(sel), active0: S.st.active ? { ...objByName(S.st.active) } : null, before: opts.before || snap(), undoName: opts.undoName || MODAL_NAME[type] };
  S.modal.lastAng = angleAt(S.modal.cur);
  host.classList.add('modal'); updateModal();
}
function angleAt(p) { const pv = V.project(S.st.view, V.medianOf(S.modal.objs0), W, H); return Math.atan2(-(p[1] - pv.y), p[0] - pv.x) * 180 / Math.PI; }
function modalMove(x, y, e) {
  const m = S.modal; m.snap = e.ctrlKey || e.metaKey; m.fine = e.shiftKey;
  const k = m.fine ? 0.1 : 1; m.cur = [m.cur[0] + (x - m.last[0]) * k, m.cur[1] + (y - m.last[1]) * k]; m.last = [x, y];
  const a = angleAt(m.cur); let d = a - m.lastAng; d = ((d + 540) % 360) - 180; m.angle += d; m.lastAng = a;
  updateModal();
}
function updateModal() {
  const m = S.modal, r = V.applyModal(m, m.objs0, m.active0, S.st.view, W, H);
  for (const o of r.objs) { const tgt = objByName(o.name); if (tgt) { tgt.loc = o.loc; tgt.rot = o.rot; tgt.scale = o.scale; } }
  const typed = m.typed ? `[${m.typed}|] ` : '';
  const el = $('#modal-readout'); el.hidden = false; el.textContent = typed + r.info.text;
  syncObjects(); renderSidebar(); renderStatusKeys(); dirty = true;
}
function confirmModal() {
  const m = S.modal; if (!m) return; S.modal = null; host.classList.remove('modal'); $('#modal-readout').hidden = true;
  pushUndo(m.undoName, m.before); sceneChanged(); renderStatusKeys();
  if (sid() === 's2') { const r = moveReport(S.st); if (r.upMoved) msg('Cube.001 moved sideways. Undo (Ctrl Z) and move it with G then Z.', true); }
}
function cancelModal() {
  const m = S.modal; if (!m) return; S.modal = null; host.classList.remove('modal'); $('#modal-readout').hidden = true;
  if (m.undoName === 'Duplicate Objects') { pushUndo(m.undoName, m.before); }
  else for (const o of m.objs0) { const tgt = objByName(o.name); if (tgt) { tgt.loc = [...o.loc]; tgt.rot = [...o.rot]; tgt.scale = [...o.scale]; } }
  if (sid() === 'u1' && !S.st.flags.cancelled) { S.st.flags.cancelled = true; msg('✓ Cancelled: nothing changed. Now undo with Ctrl Z.'); } else msg('Cancelled.');
  sceneChanged(); renderStatusKeys();
}
function modalKey(e) {
  const m = S.modal, k = e.key, low = k.length === 1 ? k.toLowerCase() : k;
  if (k === 'Escape') return cancelModal();
  if (k === 'Enter' || k === ' ') return confirmModal();
  if (low === 'x' || low === 'y' || low === 'z') {
    const plane = e.shiftKey;
    if (m.axis === low && m.plane === plane) { if (m.orient === 'global') m.orient = 'local'; else { m.axis = null; m.plane = false; m.orient = 'global'; } }
    else { m.axis = low; m.plane = plane; m.orient = 'global'; }
    return updateModal();
  }
  if (low === 'g' || low === 'r' || low === 's') { const type = { g: 'move', r: 'rotate', s: 'scale' }[low]; if (type !== m.type) { m.type = type; m.typed = ''; m.axis = null; m.plane = false; m.undoName = m.undoName === 'Duplicate Objects' ? m.undoName : MODAL_NAME[type]; for (const o of m.objs0) { const tgt = objByName(o.name); if (tgt) { tgt.loc = [...o.loc]; tgt.rot = [...o.rot]; tgt.scale = [...o.scale]; } } m.start = [...m.cur]; m.angle = 0; m.lastAng = angleAt(m.cur); updateModal(); } return; }
  if (/^[0-9]$/.test(k) || k === '.' || k === ',' || k === '-' || k === 'Backspace') { m.typed = V.typeKey(m.typed, k === ',' ? '.' : k); return updateModal(); }
  if (k === 'Control' || k === 'Meta' || k === 'Shift') { m.snap = e.ctrlKey || e.metaKey; m.fine = e.shiftKey; return updateModal(); }
}

// ─── Object commands ─────────────────────────────────────────────────────────
function uniqueName(base) { base = base.replace(/\.\d{3}$/, ''); if (!objByName(base)) return base; for (let i = 1; ; i++) { const n = `${base}.${String(i).padStart(3, '0')}`; if (!objByName(n)) return n; } }
const ADD_NAMES = { cube: 'Cube', sphere: 'Sphere', cylinder: 'Cylinder', cone: 'Cone', plane: 'Plane', torus: 'Torus' };
function addObject(kind) {
  const before = snap(), o = V.makeObj(uniqueName(ADD_NAMES[kind]), kind);
  S.st.objs.push(o); S.st.sel = [o.name]; S.st.active = o.name; pushUndo('Add ' + ADD_NAMES[kind], before); sceneChanged();
  msg(tr('Added {s} at the 3D cursor.', { s: o.name }));
}
function duplicate() {
  const sel = selObjs().filter(o => !o.lock); if (!sel.length) { msg('Nothing selected: click an object first.', true); return; }
  const before = snap(), copies = sel.map(o => ({ ...o, name: uniqueName(o.name), loc: [...o.loc], rot: [...o.rot], scale: [...o.scale] }));
  for (const c of copies) { delete c.mark; S.st.objs.push(c); }
  S.st.sel = copies.map(c => c.name); S.st.active = copies[copies.length - 1].name; sceneChanged(false);
  startModal('move', { before, undoName: 'Duplicate Objects' });
}
function deleteSel() {
  const del = selObjs().filter(o => !o.lock); if (!del.length) { msg('Nothing selected.', true); return; }
  const before = snap(); S.st.objs = S.st.objs.filter(o => !del.includes(o)); S.st.sel = []; if (!objByName(S.st.active)) S.st.active = null;
  pushUndo('Delete', before); sceneChanged(); msg(tr('Deleted {n} object(s).', { n: del.length }));
}
function clearTf(kind) {
  const sel = selObjs().filter(o => !o.lock); if (!sel.length) { msg('Nothing selected.', true); return; }
  const before = snap();
  for (const o of sel) { if (kind === 'loc') o.loc = [0, 0, 0]; if (kind === 'rot') o.rot = [0, 0, 0]; if (kind === 'scale') o.scale = [1, 1, 1]; }
  pushUndo({ loc: 'Clear Location', rot: 'Clear Rotation', scale: 'Clear Scale' }[kind], before); sceneChanged();
}

// ─── Pointer input on the viewport ───────────────────────────────────────────
const local = e => { const r = host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
host.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
host.addEventListener('contextmenu', e => e.preventDefault());
const touches = new Map();
canvas.addEventListener('pointerdown', e => {
  closeMenus(); hidePie();
  const [x, y] = local(e); S.mouse = [x, y];
  if (S.modal) { e.preventDefault(); if (e.button === 0) confirmModal(); else if (e.button === 2) cancelModal(); return; }
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, [x, y]);
    if (touches.size === 2) { const [a, b] = [...touches.values()]; S.nav = { mode: 'touch2', mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; S.box = null; return; }
    S.box = { x0: x, y0: y, x1: x, y1: y, mode: 'set', touch: true, moved: false }; return;
  }
  if (e.button === 1 || (e.button === 0 && e.altKey)) { e.preventDefault(); S.nav = { mode: e.shiftKey ? 'pan' : (e.ctrlKey || e.metaKey) ? 'zoom' : 'orbit', last: [x, y] }; host.classList.add('navigating'); return; }
  if (e.button === 0) { S.box = { x0: x, y0: y, x1: x, y1: y, mode: S.boxArmed ? 'add' : e.shiftKey ? 'add' : (e.ctrlKey || e.metaKey) ? 'sub' : 'set', armed: S.boxArmed, moved: false, shift: e.shiftKey }; }
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
  if (S.nav) { navDrag(x, y); return; }
  if (S.box) {
    S.box.x1 = x; S.box.y1 = y; if (Math.hypot(x - S.box.x0, y - S.box.y0) > 4) S.box.moved = true;
    const r = $('#box-rect'); r.hidden = !S.box.moved; Object.assign(r.style, { left: Math.min(S.box.x0, x) + 'px', top: Math.min(S.box.y0, y) + 'px', width: Math.abs(x - S.box.x0) + 'px', height: Math.abs(y - S.box.y0) + 'px' });
  }
});
function navDrag(x, y) {
  const n = S.nav, dx = x - n.last[0], dy = y - n.last[1]; n.last = [x, y];
  if (n.mode === 'orbit') S.st.view = V.orbit(S.st.view, -dx * 0.4, dy * 0.4);
  else if (n.mode === 'pan') S.st.view = V.pan(S.st.view, dx, dy, W, H);
  else if (n.mode === 'zoom') S.st.view = V.zoom(S.st.view, Math.exp(dy * 0.01));
  viewChanged();
}
canvas.addEventListener('pointerup', e => {
  const [x, y] = local(e);
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (S.nav?.mode === 'touch2') { if (touches.size === 0) S.nav = null; return; }
    if (S.box && !S.box.moved) clickAt(x, y, false);
    S.box = null; return;
  }
  if (S.nav) { S.nav = null; host.classList.remove('navigating'); saveData(); return; }
  if (S.box) {
    const b = S.box; S.box = null; $('#box-rect').hidden = true;
    if (!b.moved) { if (b.armed) { S.boxArmed = false; renderStatusKeys(); } clickAt(x, y, b.shift); return; }
    S.boxArmed = false; renderStatusKeys();
    applySelection(V.boxSelect(S.st.sel, S.st.active, boxInside(b.x0, b.y0, x, y), b.mode));
  }
});
canvas.addEventListener('pointercancel', e => { touches.delete(e.pointerId); S.nav = null; S.box = null; $('#box-rect').hidden = true; });
function clickAt(x, y, extend) {
  const hit = pick(x, y);
  if (hit && hit.locked) { msg(sid() === 'n1' ? 'This cube is locked in this step: move the view, not the cube.' : 'This object is locked in this step.'); if (!extend) applySelection({ sel: [], active: S.st.active }); return; }
  applySelection(V.clickSelect(S.st.sel, S.st.active, hit, extend));
}
canvas.addEventListener('wheel', e => {
  e.preventDefault(); if (S.modal) return;
  S.st.view = V.zoom(S.st.view, e.deltaY > 0 ? 1.15 : 1 / 1.15); viewChanged();
}, { passive: false });
host.addEventListener('pointerenter', () => { S.inView = true; });
host.addEventListener('pointerleave', () => { S.inView = false; });

// Gizmo: drag to orbit, click a ball to align the view.
gz.addEventListener('pointerdown', e => {
  e.stopPropagation(); if (S.modal) return; gz.setPointerCapture(e.pointerId);
  const r = gz.getBoundingClientRect(); S.nav = { mode: 'orbit', gizmo: true, last: [e.clientX, e.clientY], moved: false, ball: gizmoHit(e.clientX - r.left, e.clientY - r.top) };
});
gz.addEventListener('pointermove', e => {
  const r = gz.getBoundingClientRect(), hv = gizmoHit(e.clientX - r.left, e.clientY - r.top);
  if (hv !== gizmoHover) { gizmoHover = hv; dirty = true; }
  if (S.nav?.gizmo) { const dx = e.clientX - S.nav.last[0], dy = e.clientY - S.nav.last[1]; if (Math.abs(dx) + Math.abs(dy) > 0) { if (!S.nav.moved && Math.hypot(e.clientX - S.nav.last[0], e.clientY - S.nav.last[1]) < 2) return; S.nav.moved = true; S.st.view = V.orbit(S.st.view, -dx * 0.6, dy * 0.6); S.nav.last = [e.clientX, e.clientY]; viewChanged(); } }
});
gz.addEventListener('pointerup', () => {
  const n = S.nav; S.nav = null; if (!n?.gizmo) return;
  if (!n.moved && n.ball) { let name = BALL_VIEW[n.ball]; if (S.st.view.axis === name) name = BALL_VIEW[(n.ball[0] === '+' ? '-' : '+') + n.ball[1]]; axisView(name, 'gizmo'); }
  saveData(); dirty = true;
});
gz.addEventListener('pointerleave', () => { gizmoHover = null; dirty = true; });
for (const b of document.querySelectorAll('[data-nav]')) {
  b.addEventListener('pointerdown', e => {
    e.stopPropagation(); if (b.dataset.nav === 'persp') return;
    b.setPointerCapture(e.pointerId); S.nav = { mode: b.dataset.nav, btn: true, last: [e.clientX, e.clientY] };
  });
  b.addEventListener('pointermove', e => { if (S.nav?.btn) { const dx = e.clientX - S.nav.last[0], dy = e.clientY - S.nav.last[1]; S.nav.last = [e.clientX, e.clientY]; if (S.nav.mode === 'pan') S.st.view = V.pan(S.st.view, dx, dy, W, H); else S.st.view = V.zoom(S.st.view, Math.exp(dy * 0.01)); viewChanged(); } });
  b.addEventListener('pointerup', () => { if (S.nav?.btn) { S.nav = null; saveData(); } });
  b.addEventListener('click', () => { if (b.dataset.nav === 'persp') togglePersp(); });
}

// ─── Keyboard (keys go to the editor under the mouse, as in Blender) ─────────
let hover = false;
$('#workspace').addEventListener('pointerenter', () => { hover = true; });
$('#workspace').addEventListener('pointerleave', () => { hover = false; });
const NUMPAD = { Numpad1: 'front', Numpad3: 'right', Numpad7: 'top' };
const OPPOSITE = { front: 'back', right: 'left', top: 'bottom' };
function numpadCode(e) {
  if (e.code.startsWith('Numpad')) return e.code;
  if (S.emu && /^Digit[0-9]$/.test(e.code)) return 'Numpad' + e.code.slice(5);
  return null;
}
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea') || !hover) return;
  if (S.modal) { modalKey(e); e.preventDefault(); return; }
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.length === 1 ? e.key.toLowerCase() : e.key, np = numpadCode(e);
  let handled = true;
  if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (np) numpad(np, ctrl);
  else if (e.key === 'Home') frameAll();
  else if (e.key === 'Escape') { closeMenus(); hidePie(); S.boxArmed = false; renderStatusKeys(); }
  else if (ctrl) handled = ctrl && low === 'i' ? (selectInvert(), true) : false;
  else if (e.altKey && low === 'g') clearTf('loc');
  else if (e.altKey && low === 'r') clearTf('rot');
  else if (e.altKey && low === 's') clearTf('scale');
  else if (e.altKey && low === 'a') selectNone();
  else if (e.shiftKey && low === 'a') openMenu('add', S.mouse);
  else if (e.shiftKey && low === 'd') duplicate();
  else if (low === 'g') startModal('move');
  else if (low === 'r') startModal('rotate');
  else if (low === 's') startModal('scale');
  else if (low === 'a') selectAll();
  else if (low === 'b') { S.boxArmed = true; renderStatusKeys(); msg('Box Select: drag a box with the left button.'); }
  else if (low === 'n') toggleSidebar();
  else if (low === 'x') openMenu('delete', S.mouse);
  else if (e.key === 'Delete') deleteSel();
  else if (e.key === '`' || e.code === 'Backquote') showPie();
  else if (e.key === 'Tab') msg('Tab enters Edit Mode in Blender. Edit Mode has its own lab: Edit Mode Lab.');
  else if (/^[0-9]$/.test(e.key) && !S.emu) msg('The number row does not change the view. Use the numpad, or turn on Emulate Numpad in the header.', true);
  else handled = false;
  if (handled) e.preventDefault();
});
document.addEventListener('keyup', e => { if (S.modal && (e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta')) { S.modal.snap = e.ctrlKey || e.metaKey; S.modal.fine = e.shiftKey; updateModal(); } });
function numpad(code, ctrl) {
  const v = S.st.view;
  if (NUMPAD[code]) axisView(ctrl ? OPPOSITE[NUMPAD[code]] : NUMPAD[code], 'numpad');
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

// ─── Menus, pie menu, sidebar ────────────────────────────────────────────────
function menuItems(id) {
  const st = S.st, h = S.undo;
  if (id === 'edit') return [['Undo', 'Ctrl Z', undo], ['Redo', 'Ctrl Shift Z', redo], '-', '#Undo History',
    ['Original', h.length === 0 ? '●' : '', () => jumpHistory(0)], ...h.map((e, i) => [e.name, '', () => jumpHistory(i + 1)]).slice(0, -1), ...(h.length ? [[h[h.length - 1].name, '●', () => {}]] : []),
    ...S.redo.slice().reverse().map((e, i) => [e.name, '', () => { for (let k = 0; k <= i; k++) redo(); }])];
  if (id === 'view') return [['Sidebar', 'N', toggleSidebar], '-', ['Frame Selected', 'Numpad .', frameSelected], ['Frame All', 'Home', frameAll], ['Perspective/Orthographic', 'Numpad 5', togglePersp], '-', '#Viewpoint',
    ...['top', 'bottom', 'front', 'back', 'right', 'left'].map(n => [V.VIEWS[n].label, V.VIEWS[n].key, () => axisView(n, 'menu')])];
  if (id === 'select') return [['All', 'A', selectAll], ['None', 'Alt A', selectNone], ['Invert', 'Ctrl I', selectInvert], '-', ['Box Select', 'B', () => { S.boxArmed = true; renderStatusKeys(); }]];
  if (id === 'add') return ['#Mesh', ['Plane', '', () => addObject('plane')], ['Cube', '', () => addObject('cube')], ['UV Sphere', '', () => addObject('sphere')], ['Cylinder', '', () => addObject('cylinder')], ['Cone', '', () => addObject('cone')], ['Torus', '', () => addObject('torus')]];
  if (id === 'object') return ['#Transform', ['Move', 'G', () => startModal('move')], ['Rotate', 'R', () => startModal('rotate')], ['Scale', 'S', () => startModal('scale')], '-', '#Clear', ['Location', 'Alt G', () => clearTf('loc')], ['Rotation', 'Alt R', () => clearTf('rot')], ['Scale', 'Alt S', () => clearTf('scale')], '-',
    ['Duplicate Objects', 'Shift D', duplicate], ['Delete', 'X', deleteSel]];
  if (id === 'delete') return ['#Delete', ['Delete', '', deleteSel]];
  void st; return [];
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
for (const b of document.querySelectorAll('[data-menu]')) b.addEventListener('click', () => { if (menuFor === b) { closeMenus(); return; } openMenu(b.dataset.menu, null, b); });
const PIE = [['Left', 'left', -1, 0], ['Right', 'right', 1, 0], ['Bottom', 'bottom', 0, 1], ['Top', 'top', 0, -1], ['Front', 'front', -0.72, 0.72], ['Back', 'back', 0.72, 0.72], ['View Selected', 'sel', -0.72, -0.72], ['Frame All', 'all', 0.72, -0.72]];
function showPie() {
  const p = $('#pie'), [x, y] = S.inView ? S.mouse : [W / 2, H / 2];
  p.innerHTML = `<span class="pie-title">View</span>` + PIE.map(([l, id, dx, dy]) => `<button type="button" data-pie="${id}" style="left:${x + dx * 130}px;top:${y + dy * 96}px">${esc(l)}</button>`).join('') + `<i class="pie-dot" style="left:${x}px;top:${y}px"></i>`;
  p.hidden = false;
}
function hidePie() { $('#pie').hidden = true; }
$('#pie').addEventListener('click', e => { const b = e.target.closest('[data-pie]'); hidePie(); if (!b) return; const id = b.dataset.pie; if (id === 'sel') frameSelected(); else if (id === 'all') frameAll(); else axisView(id, 'pie'); });
function toggleSidebar() { S.sidebar = !S.sidebar; store.set('sidebar', S.sidebar); renderSidebar(); }
$('#sidebar-btn').addEventListener('click', toggleSidebar);
$('#emu-numpad').checked = S.emu;
$('#emu-numpad').addEventListener('change', e => { S.emu = e.target.checked; store.set('emu', S.emu); msg(S.emu ? 'Emulate Numpad on: the number row works as the numpad (1, 3, 7, 5…).' : 'Emulate Numpad off.'); });

// N panel: Item › Transform, with Blender-like number fields (drag to change, click to type).
const FIELDS = [['loc', 'Location', ' m', 0.02], ['rot', 'Rotation', '°', 1], ['scale', 'Scale', '', 0.01]];
function renderSidebar() {
  $('#n-sidebar').hidden = !S.sidebar; $('#sidebar-btn').setAttribute('aria-pressed', String(S.sidebar));
  if (!S.sidebar) return;
  const o = S.st.active && S.st.sel.includes(S.st.active) ? objByName(S.st.active) : null, body = $('#n-body');
  if (!o) { body.innerHTML = `<div class="n-panel"><h5 data-no-i18n>Transform</h5><p class="n-empty">${esc(t('Select an object to see its transform.'))}</p></div>`; return; }
  const focus = document.activeElement?.closest?.('.n-field') ? document.activeElement.dataset.f : null;
  const row = (k, label, unit, i, val, ro) => `<label class="n-field${ro ? ' ro' : ''}"><span class="ax ax-${'xyz'[i]}" data-no-i18n>${'XYZ'[i]}</span><input data-f="${k}:${i}" data-step="${FIELDS.find(f => f[0] === k)?.[3] ?? 0}" value="${V.fmt(val)}${unit}" ${ro ? 'readonly' : ''} inputmode="decimal" aria-label="${label} ${'XYZ'[i]}"></label>`;
  const dims = V.dimsOf(o);
  body.innerHTML = `<div class="n-panel" data-no-i18n><h5>Transform</h5>
    ${FIELDS.map(([k, label, unit]) => `<div class="n-group"><span class="n-label">${label}${k === 'rot' ? '' : ''}</span>${[0, 1, 2].map(i => row(k, label, unit, i, o[k][i], o.lock)).join('')}${k === 'rot' ? '<span class="n-mode">XYZ Euler</span>' : ''}</div>`).join('')}
    <div class="n-group"><span class="n-label">Dimensions</span>${[0, 1, 2].map(i => row('dim', 'Dimensions', ' m', i, dims[i], true)).join('')}</div></div>`;
  if (focus) body.querySelector(`[data-f="${focus}"]`)?.focus();
}
let fieldDrag = null;
$('#n-body').addEventListener('pointerdown', e => {
  const inp = e.target.closest('input'); if (!inp || inp.readOnly || document.activeElement === inp) return;
  e.preventDefault(); fieldDrag = { inp, x: e.clientX, moved: false, before: snap() }; inp.setPointerCapture(e.pointerId);
});
$('#n-body').addEventListener('pointermove', e => {
  const d = fieldDrag; if (!d) return; const dx = e.clientX - d.x; if (!d.moved && Math.abs(dx) < 3) return;
  d.moved = true; d.x = e.clientX; const [k, i] = d.inp.dataset.f.split(':'), o = objByName(S.st.active); if (!o) return;
  o[k][+i] = Math.round((o[k][+i] + dx * (+d.inp.dataset.step) * (e.shiftKey ? 0.1 : 1)) * 1e4) / 1e4; syncObjects(); dirty = true;
  d.inp.value = V.fmt(o[k][+i]) + (k === 'loc' ? ' m' : k === 'rot' ? '°' : '');
});
$('#n-body').addEventListener('pointerup', () => {
  const d = fieldDrag; fieldDrag = null; if (!d) return;
  if (d.moved) { pushUndo('Transform', d.before); sceneChanged(); } else { d.inp.focus(); d.inp.select(); }
});
$('#n-body').addEventListener('change', e => {
  const inp = e.target.closest('input'); if (!inp || inp.readOnly) return;
  const [k, i] = inp.dataset.f.split(':'), o = objByName(S.st.active), v = parseFloat(inp.value.replace(',', '.'));
  if (!o || !Number.isFinite(v)) { renderSidebar(); return; }
  const before = snap(); o[k][+i] = v; pushUndo('Transform', before); inp.blur(); sceneChanged();
});
$('#n-body').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.blur(); renderSidebar(); } e.stopPropagation(); });

// ─── Outliner and the lab panel ──────────────────────────────────────────────
// Blender icons for the header (see blender-ui.js).
document.querySelectorAll('#workspace [data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon] + (el.dataset.label ? `<span>${el.dataset.label}</span>` : '') + (el.classList.contains('bh-dd') ? ICONS.dropdown : ''); });
const OB_ICON = { camera: ['ob_camera', 'data_camera'], light: ['ob_light', 'data_light'] };
function renderOutliner() {
  const st = S.st;
  $('#outliner').innerHTML = outlinerHTML([
    { name: 'Scene Collection', icon: 'scene_collection', open: true, depth: 0 },
    { name: 'Collection', icon: 'collection', open: true, depth: 1, exclude: false, eye: true, cam: true },
    ...st.objs.map(o => { const [ob, data] = OB_ICON[o.kind] || ['ob_mesh', 'data_mesh']; return { id: o.name, name: o.name, icon: ob, inline: [data], open: false, depth: 2, sel: st.sel.includes(o.name), active: st.active === o.name && st.sel.includes(o.name), dim: !!o.hide, lock: !!o.lock, eye: !o.hide, cam: true }; }),
  ]);
}
$('#outliner').addEventListener('click', e => {
  if (e.target.closest('[data-ol-tg]')) { msg('Hide and show objects with H and Alt H, as in Blender. In this lab the eye only shows it.'); return; }
  const r = e.target.closest('[data-ol-id]'); if (!r || S.modal) return; const o = objByName(r.dataset.olId); if (o.hide) return;
  if (o.lock) { msg('This object is locked in this step.'); return; }
  const ext = e.ctrlKey || e.metaKey;
  if (!ext) applySelection({ sel: [o.name], active: o.name });
  else applySelection(S.st.sel.includes(o.name) ? { sel: S.st.sel.filter(n => n !== o.name), active: S.st.active } : { sel: [...S.st.sel, o.name], active: o.name });
});
$('#outliner').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('[data-ol-id]')?.click(); });
const yes = ok => `<b class="${ok ? 'ok' : ''}">${ok ? '✓' : '·'}</b>`;
function renderLabPanel() {
  const st = S.st, id = sid(), p = $('#lab-panel'); let h = '';
  const statRow = (label, val, cls = '') => `<div class="sb-stat ${cls}"><span>${label}</span><b>${val}</b></div>`;
  if (id === 'n1') { const seen = st.flags.seen || {}; h = `<h4>${esc(t('Marks found'))} <small>${MARKS.filter(m => seen[m]).length} / 3</small></h4>` + [['+y', 'Back'], ['-x', 'Left side'], ['-z', 'Underneath']].map(([m, l]) => statRow(esc(t(l)), seen[m] ? '✓' : '—', seen[m] ? 'good' : '')).join(''); }
  else if (id === 'n2') { const r = panReport(st); h = `<h4>${esc(t('The far sphere'))}</h4>` + statRow(esc(t('Distance from the centre')), `${Math.round(Math.min(r.off, 9.99) * 100)} %`, r.centred ? 'good' : 'bad') + statRow(esc(t('Height on screen')), `${Math.round(r.size * 100)} %`, r.big ? 'good' : 'bad') + `<p class="sb-empty">${esc(tr('Goal: under {a} % from the centre, at least {b} % of the view height.', { a: Math.round(PAN_GOAL.off * 100), b: Math.round(PAN_GOAL.size * 100) }))}</p>`; }
  else if (id === 'n3') { h = `<h4>${esc(t('Frame the Cone'))}</h4>` + statRow(esc(t('Cone selected')), yes(st.sel.length === 1 && st.sel[0] === 'Cone')) + statRow('Numpad . <span data-no-i18n>(View Selected)</span>', yes(st.flags.framed)) + statRow('Home <span data-no-i18n>(Frame All)</span>', yes(st.flags.home)); }
  else if (id === 'n4') { const i = st.flags.viewIdx | 0; h = `<h4>${esc(t('Views in order'))} <small>${Math.min(i, 4)} / 4</small></h4>` + VIEW_ORDER.map((n, k) => statRow(`<span data-no-i18n>${V.VIEWS[n].label}</span> <kbd>${esc(V.VIEWS[n].key)}</kbd>`, k < i ? '✓' : k === i ? '←' : '·', k < i ? 'good' : '')).join(''); }
  else if (id === 's1') { const r = selectReport(st); h = `<h4>${esc(t('Selection'))}</h4>` + statRow(esc(t('Spheres selected')), `${r.spheres} / 3`, r.spheres === 3 ? 'good' : '') + statRow(esc(t('Other objects selected')), r.extra, r.extra ? 'bad' : 'good') + statRow(esc(t('Active object')), `<span data-no-i18n>${esc(st.active && st.sel.includes(st.active) ? st.active : '—')}</span>`, r.active ? 'good' : 'bad') + `<p class="sb-empty">${esc(t('Goal:'))} <span data-no-i18n>${SELECT_GOAL.join(', ')}</span> · ${esc(t('active'))} <span data-no-i18n>Sphere.001</span></p>`; }
  else if (id === 's2') { const r = moveReport(st), d = n => { const o = objByName(n), g = st.ghosts.find(x => x.name === n); return V.len(V.sub(o.loc, g.loc)); }; h = `<h4>${esc(t('Distance to the silhouettes'))}</h4>` + statRow('<span data-no-i18n>Cube</span>', `${V.fmt(Math.round(d('Cube') * 100) / 100)} m`, r.cube ? 'good' : '') + statRow('<span data-no-i18n>Cube.001</span> <small>(Z)</small>', `${V.fmt(Math.round(d('Cube.001') * 100) / 100)} m`, r.up ? 'good' : r.upMoved ? 'bad' : '') + statRow('<span data-no-i18n>Cube.002</span>', `${V.fmt(Math.round(d('Cube.002') * 100) / 100)} m`, r.far ? 'good' : '') + (r.upMoved ? `<p class="sb-empty warn">${esc(t('Cube.001 left its X and Y: move it with G then Z.'))}</p>` : ''); }
  else if (id === 's3') { const r = exactReport(st), c = objByName('Cube'), a = objByName('Arrow'), y = objByName('Cylinder'); h = `<h4>${esc(t('Exact values'))}</h4>` + statRow('<span data-no-i18n>Cube · Location Z</span>', `${V.fmt(c.loc[2])} m`, r.move ? 'good' : '') + statRow('<span data-no-i18n>Arrow · Rotation Z</span>', `${V.fmt(a.rot[2])}°`, r.rot ? 'good' : '') + statRow('<span data-no-i18n>Cylinder · Scale</span>', `${y.scale.map(V.fmt).join(' · ')}`, r.scale ? 'good' : '') + `<p class="sb-empty">${esc(t('Goals: Location Z 3 m (it starts at 1 m), Rotation Z 45°, Scale 1.5.'))}</p>`; }
  else if (id === 'u1') { const r = undoReport(st); h = `<h4>${esc(t('Cancel and undo'))}</h4>` + statRow(esc(t('A transform cancelled')), yes(r.cancelled)) + statRow(esc(t('Steps you can undo')), S.undo.length) + statRow(esc(t('Cube back where it started')), yes(r.back)); }
  else if (id === 'u2') { const ok = ghostState(st); h = `<h4>${esc(t('Silhouettes'))} <small>${ok.filter(Boolean).length} / ${ok.length}</small></h4>` + st.ghosts.map((g, i) => statRow(`<span data-no-i18n>${esc(g.name)}</span>`, ok[i] ? '✓' : '·', ok[i] ? 'good' : '')).join(''); }
  else if (id === 'f1') { h = `<h4>${esc(t('Free mode'))}</h4>` + statRow(esc(t('Objects')), st.objs.length); }
  const v = st.view;
  h += `<div class="sb-sep"></div><h4>${esc(t('View'))}</h4>` + statRow('<span data-no-i18n>' + esc(V.viewName(v)) + '</span>', '') + statRow(esc(t('Orbit centre')), v.target.map(x => V.fmt(Math.round(x * 10) / 10)).join(', ')) + statRow(esc(t('Distance')), `${V.fmt(Math.round(v.dist * 10) / 10)} m`);
  p.innerHTML = `<div class="panel">${h}</div>`;
}
function renderStatusKeys() {
  const k = (keys, label) => `<span>${keys.map(x => `<kbd>${esc(x)}</kbd>`).join('')}${esc(t(label))}</span>`;
  let h;
  if (S.modal) { const m = S.modal; h = [k(['LMB'], 'Confirm'), k(['RMB'], 'Cancel'), k(['X', 'Y', 'Z'], 'Axis'), k(['Shift', 'Z'], 'Lock axis'), k(['Ctrl'], 'Snap'), k(['Shift'], 'Precision'), k(['0–9'], m.typed ? 'Typing a value' : 'Type a value')].join(''); }
  else if (S.boxArmed) h = [k(['LMB'], 'Draw a box to add'), k(['Esc'], 'Cancel')].join('');
  else h = [k(['LMB'], 'Select'), k(['MMB'], 'Orbit'), k(['Shift', 'MMB'], 'Pan'), k(['Wheel'], 'Zoom'), k(['G', 'R', 'S'], 'Move · Rotate · Scale'), k(['Ctrl', 'Z'], 'Undo')].join('');
  $('#status-keys').innerHTML = h;
}

// ─── Steps, storage ──────────────────────────────────────────────────────────
const dataKey = () => `step:${stage().id}-${sid()}`;
function saveData() { store.set(dataKey(), { st: S.st, undo: S.undo.slice(-20) }); }
function loadData() {
  const saved = store.get(dataKey(), null), fresh = startState(step());
  if (saved?.st?.objs && Array.isArray(saved.st.objs) && saved.st.view) {
    S.st = { ...fresh, ...saved.st, ghosts: fresh.ghosts, flags: saved.st.flags || {} };
    S.undo = Array.isArray(saved.undo) ? saved.undo : [];
  } else {
    S.st = fresh; S.undo = (fresh.history || []).map(h => ({ name: h.name, snap: { objs: V.cloneObjs(h.objs), sel: [...fresh.sel], active: fresh.active } }));
  }
  delete S.st.history; S.redo = []; S.st.aspect = W / H;
}
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(s.sub)}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${stage().steps[i].id}`;
const stepDone = i => { const s = stage().steps[i]; if (s.free) return false; return i === S.step ? !!s.check(S.st) : !!S.done[doneKey(i)]; };
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.className = `guide${n === 3 ? ' three' : n === 2 ? ' two' : n === 1 ? ' one' : ''}`;
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
      <button type="button" class="mini-link" id="reset-step">${esc(t(s.free ? 'Empty the scene' : 'Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo('Reset', snap()); const f = startState(step()); S.st.objs = f.objs; S.st.sel = f.sel; S.st.active = f.active; S.st.flags = {}; S.st.view = f.view; sceneChanged(); msg('Back to the start. Ctrl Z brings your objects back.'); }
  if (id === 'show-solution') { pushUndo('Solution', snap()); step().solve(S.st); sceneChanged(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
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
  if (S.modal) cancelModal(); S.anim = null; S.boxArmed = false; closeMenus(); hidePie();
  for (const v of views.values()) objGroup.remove(v.root); views.clear();
  loadData(); lastCard = ''; lastOk = stepDone(S.step);
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  if (sid() === 'n1') markSeen(S.st);
  renderStageSwitch(); renderStatusKeys(); sceneChanged(false);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); renderLabPanel(); renderSidebar(); renderStatusKeys(); checkProgress(); dirty = true; });

// ─── Start ───────────────────────────────────────────────────────────────────
resize(); enterStep(); requestAnimationFrame(loop);
window.__vp = {
  S, STAGES, V, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, solve: () => { step().solve(S.st); sceneChanged(); },
  key: (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: o.code || '', ctrlKey: !!o.ctrl, shiftKey: !!o.shift, altKey: !!o.alt, bubbles: true })),
  project: p => V.project(S.st.view, p, W, H), size: () => [W, H], setHover: v => { hover = v; S.inView = v; },
};
