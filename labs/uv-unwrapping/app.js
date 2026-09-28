// UV Unwrap Lab: Blender's UV Editing workspace (UV Editor + 3D Viewport in Edit Mode) with seams, Unwrap,
// projections, Smart UV Project, Pack Islands and Average Islands Scale.
import * as THREE from 'three';
import { ICONS, outlinerHTML } from '../../blender-ui.js?v=2';
import * as V from '../viewport/vp.js?v=1';
import * as E from '../editmode/em.js?v=1';
import * as U from './uvcore.js?v=1';
import { STAGES, startState, noteOp, selFaces, reportOf, RULES, SIDE, CAPS, sideUpright } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=10';
addDictionary(dictionary);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-uv2:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-uv2:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [],
  done: store.get('done', {}), nav: null, mouse: [0, 0], inView: false, inUV: false, emu: store.get('emu', false),
  anim: null, lastOp: null, modal: null, uvNav: null, uvView: { cx: 0.5, cy: 0.5, zoom: 1 }, unfold: 0, rep: null,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
const sid = () => step().id;
const edit = () => S.st.mode === 'edit';
const selFull = () => E.flush(S.st.m, S.st.sm, S.st.sel);
const fmt2 = x => (Math.round(x * 100) / 100).toFixed(2);

let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 7000);
}

// ─── Lab icons that blender-ui.js does not have ──────────────────────────────
const svg = b => `<svg class="bi" viewBox="0 0 16 16" aria-hidden="true">${b}</svg>`;
const UICONS = {
  uveditor: svg('<rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2 8h12M8 2v12" stroke="currentColor" stroke-width="1.1"/><path d="M2.6 2.6h5v5h-5zM8.4 8.4h5v5h-5z" fill="currentColor" opacity=".55"/>'),
  sync: svg('<path d="M3 6.2a5 5 0 0 1 9-1.6M13 9.8a5 5 0 0 1-9 1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m12.6 2.2.2 3.2-3.1-.4M3.4 13.8l-.2-3.2 3.1.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'),
  uvisland: svg('<rect x="1.8" y="3" width="5.2" height="10" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="3" width="5.2" height="10" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  sticky: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1" opacity=".6"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="4.2" cy="4.2" r="1.1" fill="currentColor" opacity=".7"/><circle cx="11.8" cy="11.8" r="1.1" fill="currentColor" opacity=".7"/>'),
  pivot: svg('<path d="M5 2.5H2.5v11H5M11 2.5h2.5v11H11" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>'),
  snap: svg('<path d="M3.5 3v5a4.5 4.5 0 0 0 9 0V3h-3v5a1.5 1.5 0 0 1-3 0V3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M3.5 5.2h3M9.5 5.2h3" stroke="currentColor" stroke-width="1.2"/>'),
  increment: svg('<path d="M2 12h12M3 12V8M6 12V9.5M9 12V8M12 12V9.5" stroke="currentColor" stroke-width="1.2"/><circle cx="3" cy="5" r="1.3" fill="currentColor"/>'),
  proportional: svg('<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".7"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/>'),
  falloff: svg('<path d="M2 13c3 0 3-9 6-9s3 9 6 9" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  image: svg('<rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="m3 12 3.5-4 2.5 2.5 2-2 2 3.5" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="10.5" cy="6" r="1.2" fill="currentColor"/>'),
  overlay: ICONS.overlay,
  boxset: svg('<rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="#6aa6ff" stroke-width="1.2" stroke-dasharray="2 1.4"/>'),
  boxext: svg('<rect x="2" y="4" width="8" height="8" fill="currentColor" opacity=".8"/><rect x="6" y="2" width="8" height="8" fill="currentColor" opacity=".5"/>'),
  boxsub: svg('<rect x="2" y="4" width="8" height="8" fill="currentColor" opacity=".8"/><rect x="6" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-dasharray="1.6 1.2"/>'),
  t_select: svg('<rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="#f0a030" stroke-width="1.1" stroke-dasharray="2.2 1.4"/><path d="M6 4.5v7l1.9-1.8 1.3 2.7 1.1-.5-1.3-2.6h2.6z" fill="#fff"/>'),
  t_cursor: svg('<circle cx="8" cy="8" r="5.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="2.6 2"/><circle cx="8" cy="8" r="5.2" fill="none" stroke="#e03c3c" stroke-width="1.6" stroke-dasharray="2.6 2" stroke-dashoffset="2.3"/><path d="M8 1v4M8 11v4M1 8h4M11 8h4" stroke="#ddd" stroke-width="1"/>'),
  t_move: svg('<path d="M8 1.5v13M1.5 8h13" stroke="currentColor" stroke-width="1.1"/><path d="m8 1 2 2.6H6zM8 15l2-2.6H6zM1 8l2.6-2v4zM15 8l-2.6-2v4z" fill="currentColor"/><rect x="6.6" y="6.6" width="2.8" height="2.8" fill="currentColor"/>'),
  t_rotate: svg('<path d="M3 6.5A5.3 5.3 0 0 1 12.8 5M13 9.5A5.3 5.3 0 0 1 3.2 11" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="m13.8 2.6-.3 3.4-3.2-1.1zM2.2 13.4l.3-3.4 3.2 1.1z" fill="currentColor"/><path d="M8 5.5 10.5 8 8 10.5 5.5 8z" fill="currentColor"/>'),
  t_scale: svg('<rect x="2" y="7" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/><path d="M8 8l5-5M9.5 3H13v3.5" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
  t_transform: svg('<circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="5.6" y="5.6" width="4.8" height="4.8" fill="currentColor"/><path d="m8 .8 1.6 2H6.4zM8 15.2l1.6-2H6.4zM.8 8l2-1.6v3.2zM15.2 8l-2-1.6v3.2z" fill="currentColor"/>'),
  t_annotate: svg('<path d="m10.5 2 3.2 3.2-6.5 6.5-3.7.6.6-3.7z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M1.5 14.5c2-1.5 3.5 1.2 5.5-.2s3.3-.6 5 .3" fill="none" stroke="#4fd06a" stroke-width="1.3"/>'),
  t_rip: svg('<path d="M2.5 6.5 7 4l6.5 2v6.5L9 15l-6.5-2.3z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7 4v5l6.5-2.5M7 9 2.5 6.5M7 9l2 6" fill="none" stroke="currentColor" stroke-width="1" opacity=".7"/>'),
  t_grab: svg('<path d="M5.2 8.5V4a1 1 0 0 1 2 0v3.5m0-4.3a1 1 0 0 1 2 0v4.3m0-3.3a1 1 0 0 1 2 0V9m0-2.5a1 1 0 0 1 2 0v3c0 3-2 5-4.7 5-2 0-3-.9-4-2.6L2.4 9.5a1 1 0 0 1 1.7-1l1.1 1.3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>'),
  t_relax: svg('<path d="M6.2 9V5a1 1 0 0 1 2 0v3.5m0-3.8a1 1 0 0 1 2 0v3.8m0-2.8a1 1 0 0 1 2 0V10c0 2.7-1.8 4.5-4.2 4.5-1.8 0-2.7-.8-3.6-2.3L3.2 10a1 1 0 0 1 1.6-1l1.4 1.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M1 3.5c1.2-1 2.2 1 3.4 0M1 6c1.2-1 2.2 1 3.4 0" fill="none" stroke="currentColor" stroke-width="1"/>'),
  t_pinch: svg('<path d="M6.2 9V5a1 1 0 0 1 2 0v3.5m0-3.8a1 1 0 0 1 2 0v3.8m0-2.8a1 1 0 0 1 2 0V10c0 2.7-1.8 4.5-4.2 4.5-1.8 0-2.7-.8-3.6-2.3L3.2 10a1 1 0 0 1 1.6-1l1.4 1.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="3" cy="3.6" r="2" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="3" cy="3.6" r=".6" fill="currentColor"/>'),
  zoomin: svg('<circle cx="6.8" cy="6.8" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10 10 4.2 4.2" stroke="currentColor" stroke-width="2"/><path d="M4.6 6.8h4.4M6.8 4.6v4.4" stroke="currentColor" stroke-width="1.3"/>'),
  hand: svg('<path d="M5.2 8.5V3.8a1 1 0 0 1 2 0v3.7m0-4.6a1 1 0 0 1 2 0v4.6m0-3.6a1 1 0 0 1 2 0V9m0-2.3a1 1 0 0 1 2 0v3c0 3-2 5-4.7 5-2 0-3-.9-4-2.6L2.4 9.5a1 1 0 0 1 1.7-1l1.1 1.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'),
};
document.querySelectorAll('#workspace [data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon] + (el.classList.contains('bh-dd') ? ICONS.dropdown : ''); });
document.querySelectorAll('#workspace [data-uicon]').forEach(el => { el.insertAdjacentHTML('afterbegin', UICONS[el.dataset.uicon] + (el.classList.contains('bh-dd') ? ICONS.dropdown : '')); });

// ─── The image: Blender's generated "Color Grid" ─────────────────────────────
const IMG = document.createElement('canvas'); IMG.width = IMG.height = 1024;
{
  const g = IMG.getContext('2d'), n = 8, c = 1024 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * c, y = (n - 1 - j) * c, hue = (i * 360 / n + j * 12) % 360;
    g.fillStyle = `hsl(${hue} 62% ${38 + (j % 2) * 8}%)`; g.fillRect(x, y, c, c);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if ((a + b) % 2) { g.fillStyle = `hsl(${hue} 70% ${56 + (j % 2) * 6}%)`; g.fillRect(x + a * c / 4, y + b * c / 4, c / 4, c / 4); }
    g.strokeStyle = '#0006'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, c - 2, c - 2);
    g.fillStyle = '#fff'; g.font = `700 ${c * 0.3}px Inter, Segoe UI, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#000a'; g.shadowBlur = 6; g.fillText(`${'ABCDEFGH'[i]}${j + 1}`, x + c / 2, y + c / 2); g.shadowBlur = 0;
  }
}

// ─── Three.js viewport ───────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.setClearColor(0x393939);
const scene = new THREE.Scene();
const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 4000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 1.2); scene.add(key, key.target);
const grid = new THREE.Group(); scene.add(grid);
{
  const pts = [], pts10 = [], N = 30;
  const seg = (arr, a, b, c, d) => { for (let k = 0; k < 20; k++) { const u = k / 20, w = (k + 1) / 20; arr.push(a + (c - a) * u, b + (d - b) * u, 0, a + (c - a) * w, b + (d - b) * w, 0); } };
  for (let i = -N; i <= N; i++) { if (i === 0) continue; const arr = i % 10 ? pts : pts10; seg(arr, i, -N, i, N); seg(arr, -N, i, N, i); }
  const ax = [], ay = []; seg(ax, -N, 0, N, 0); seg(ay, 0, -N, 0, N);
  const mk = (arr, color, opacity) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); };
  grid.add(mk(pts, 0x555555, 0.5), mk(pts10, 0x666666, 0.8), mk(ax, 0xff3352, 0.9), mk(ay, 0x8bdc00, 0.9));
}
const tex = new THREE.CanvasTexture(IMG); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
const faceMat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true });
const vertMat = new THREE.PointsMaterial({ vertexColors: true, size: 6, sizeAttenuation: false });
const meshObj = new THREE.Mesh(new THREE.BufferGeometry(), faceMat);
const edgeObj = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMat);
const vertObj = new THREE.Points(new THREE.BufferGeometry(), vertMat);
edgeObj.renderOrder = 2; vertObj.renderOrder = 3;
scene.add(meshObj, edgeObj, vertObj);
const COL = { edge: 0x101010, edgeSel: 0xffa000, seam: 0xff3b1f, vert: 0x101010, vertSel: 0xff8a00, outline: 0xffaa40 };
const col = hex => new THREE.Color(hex);

// World position of every face corner, blended towards its place on the UV map by the Unfold slider.
function cornerPos(W, fi, ci, k, flat) {
  const p = W[S.st.m.f[fi][ci]]; if (!k) return p;
  const [u, v] = S.st.uv[fi][ci], q = [flat.c[0] + (u - 0.5) * flat.L, flat.c[1], flat.c[2] + (v - 0.5) * flat.L];
  return p.map((x, i) => x + (q[i] - x) * k);
}
function flatFrame(W) { const b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }; for (const p of W) for (let i = 0; i < 3; i++) { b.lo[i] = Math.min(b.lo[i], p[i]); b.hi[i] = Math.max(b.hi[i], p[i]); } const c = V.mul(V.add(b.lo, b.hi), 0.5); return { c: [c[0], b.lo[1] - 0.2, c[2]], L: Math.max(2.4, V.len(V.sub(b.hi, b.lo)) * 1.1) }; }
function buildGeometry() {
  const st = S.st, m = st.m, W = U.worldV(m, st.scale), s = edit() ? selFull() : E.emptySel(), selF = new Set(s.F), selE = new Set(s.E), selV = new Set(s.V), seams = new Set(st.seams);
  const k = S.unfold, flat = flatFrame(W), smooth = k * k * (3 - 2 * k);
  const pos = [], uvs = [], cols = [], white = [1, 1, 1], tint = st.sm === 'face' ? [1, 0.72, 0.45] : [1, 0.85, 0.7];
  m.f.forEach((f, fi) => {
    const c = edit() && selF.has(fi) ? tint : white;
    for (let i = 1; i < f.length - 1; i++) for (const ci of [0, i, i + 1]) { pos.push(...cornerPos(W, fi, ci, smooth, flat)); uvs.push(...st.uv[fi][ci]); cols.push(...c); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
  meshObj.geometry.dispose(); meshObj.geometry = g;
  const ep = [], ec = [];
  if (edit() || seams.size) m.f.forEach((f, fi) => f.forEach((a, ci) => {
    const b = f[(ci + 1) % f.length], key2 = E.ek(a, b), owner = (edgeOwner.get(key2) ?? fi) === fi;
    if (!owner && !k) return;
    const c = edit() && selE.has(key2) ? col(COL.edgeSel) : seams.has(key2) ? col(COL.seam) : col(COL.edge);
    if (!edit() && !seams.has(key2)) return;
    ep.push(...cornerPos(W, fi, ci, smooth, flat), ...cornerPos(W, fi, (ci + 1) % f.length, smooth, flat)); ec.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }));
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
  edgeObj.geometry.dispose(); edgeObj.geometry = eg;
  edgeMat.linewidth = 1;
  const vp = [], vc = [], cv = col(COL.vert), cvs = col(COL.vertSel);
  if (edit() && st.sm === 'vert' && !k) W.forEach((p, i) => { const c = selV.has(i) ? cvs : cv; vp.push(...p); vc.push(c.r, c.g, c.b); });
  const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); vg.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  vertObj.geometry.dispose(); vertObj.geometry = vg;
  dirty = true;
}
let edgeOwner = new Map();
function meshChanged() { edgeOwner = new Map(); S.st.m.f.forEach((f, fi) => f.forEach((a, i) => { const k = E.ek(a, f[(i + 1) % f.length]); if (!edgeOwner.has(k)) edgeOwner.set(k, fi); })); }

// Object Mode outline (mask pass + edge filter, as in the Edit Mode Lab)
const maskRT = new THREE.WebGLRenderTarget(4, 4);
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const outlineMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: { mask: { value: maskRT.texture }, px: { value: new THREE.Vector2(1, 1) }, cAct: { value: new THREE.Color(COL.outline) } },
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
  outlineMat.uniforms.px.value.set(0.75 / W, 0.75 / H); dirty = true;
}
new ResizeObserver(resize).observe(host);
function activeCamera() {
  const v = S.st.view, b = V.basisOf(v), aspect = W / H, cam = v.ortho ? ortho : persp;
  if (v.ortho) {
    const h = V.viewHeight(v, aspect, v.dist) / 2; ortho.left = -h * aspect; ortho.right = h * aspect; ortho.top = h; ortho.bottom = -h;
    ortho.position.set(...V.add(v.target, V.mul(b.f, -Math.max(400, v.dist * 4)))); ortho.near = 0.05; ortho.far = Math.max(800, v.dist * 8);
  } else { persp.fov = V.vfov(aspect); persp.aspect = aspect; persp.position.set(...b.eye); persp.near = Math.max(0.01, v.dist / 500); persp.far = 2000; }
  cam.up.set(...b.u); cam.lookAt(...v.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  key.position.set(...V.add(b.eye, V.add(V.mul(b.r, -v.dist * 0.4), V.mul(b.u, v.dist * 0.6)))); key.target.position.set(...v.target);
  return cam;
}
function render() {
  if (!S.st) return;
  const cam = activeCamera();
  renderer.setRenderTarget(null); renderer.render(scene, cam);
  if (!edit()) {
    const vis = [grid.visible, edgeObj.visible, vertObj.visible];
    grid.visible = edgeObj.visible = vertObj.visible = false;
    const fm = meshObj.material; meshObj.material = whiteMat;
    renderer.setRenderTarget(maskRT); renderer.setClearColor(0x000000); renderer.clear(); renderer.render(scene, cam);
    meshObj.material = fm; [grid.visible, edgeObj.visible, vertObj.visible] = vis;
    renderer.setRenderTarget(null); renderer.setClearColor(0x393939); renderer.autoClear = false; renderer.render(quadScene, quadCam); renderer.autoClear = true;
  }
  drawGizmo(); renderViewText();
}
function loop(now) { if (S.anim) stepAnim(now); if (dirty) { dirty = false; render(); } if (uvDirty) { uvDirty = false; drawUV(); } requestAnimationFrame(loop); }

function renderViewText() {
  const st = S.st, s = edit() ? selFull() : null, sc = st.scale, name = U.MESH_NAMES[st.obj];
  const stat = edit() ? `Faces ${s.F.length}/${st.m.f.length}<br>Edges ${s.E.length}/${edgeOwner.size}<br>Seams ${st.seams.length}` : `Scale ${sc.map(fmt2).join(', ')}`;
  $('#vp-text').innerHTML = `<b>${esc(V.viewName(st.view))}</b><br>(1) ${esc(name)}<div class="vp-stats">${stat}</div>`;
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

// ─── View ────────────────────────────────────────────────────────────────────
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
function viewChanged() { dirty = true; clearTimeout(viewSaveT); viewSaveT = setTimeout(saveData, 300); }
const axisView = name => setView(V.setAxisView(S.st.view, name));
function frameAll() { const b = E.bounds({ v: U.worldV(S.st.m, S.st.scale) }), c = V.mul(V.add(b.lo, b.hi), 0.5), r = Math.max(0.5, V.len(V.sub(b.hi, b.lo)) / 2); setView({ ...S.st.view, target: c, dist: r / Math.tan(V.vfov(W / H) * Math.PI / 360) * 1.15 }); }
function togglePersp() { const v = S.st.view; setView({ ...v, ortho: !v.ortho, auto: false }, false); msg(S.st.view.ortho ? 'Orthographic' : 'Perspective'); }
const viewBasis = () => { const v = S.st.view, b = V.basisOf(v); return { r: b.r, u: b.u, f: b.f, eye: v.ortho ? null : b.eye }; };

// ─── Picking in the 3D Viewport ──────────────────────────────────────────────
const worldMesh = () => ({ v: U.worldV(S.st.m, S.st.scale), f: S.st.m.f });
const proj = p => V.project(S.st.view, p, W, H);
function visible(p, wm) { const v = S.st.view, b = V.basisOf(v); return E.pointVisible(wm, v.ortho ? null : b.eye, p, v.ortho ? b.f : null); }
function segDist(px, py, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, tt = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)); return { d: Math.hypot(px - a.x - dx * tt, py - a.y - dy * tt), t: tt }; }
function pickVert(x, y) { const wm = worldMesh(); let best = null, bd = 14; wm.v.forEach((p, i) => { const s = proj(p); if (!S.st.view.ortho && s.depth <= 0) return; const d = Math.hypot(s.x - x, s.y - y); if (d < bd && visible(p, wm)) { bd = d; best = i; } }); return best; }
function pickEdge(x, y, maxD = 12) {
  const wm = worldMesh(); let best = null, bd = maxD;
  for (const k of edgeOwner.keys()) {
    const [a, b] = E.keyVerts(k), pa = proj(wm.v[a]), pb = proj(wm.v[b]);
    if (!S.st.view.ortho && (pa.depth <= 0 || pb.depth <= 0)) continue;
    const r = segDist(x, y, pa, pb); if (r.d >= bd) continue;
    if (!visible(E.V3.lerp(wm.v[a], wm.v[b], r.t), wm)) continue;
    bd = r.d; best = k;
  }
  return best;
}
function pickFace(x, y) { const wm = worldMesh(), ray = V.rayAt(S.st.view, x, y, W, H), h = E.rayHit(wm, ray.o, ray.d); return h.face >= 0 ? h.face : null; }
function setSel(primary) { S.st.sel = E.flush(S.st.m, S.st.sm, primary); selectionChanged(); }
function clickSelect(x, y, extend, loop = false) {
  const st = S.st, cur = selFull();
  if (loop) {
    const k = pickEdge(x, y, 16); if (!k) { if (!extend) setSel(E.emptySel()); return; }
    const [a, b] = E.keyVerts(k); let add;
    if (st.sm === 'face') add = { V: [], E: [], F: E.faceLoop(st.m, a, b) };
    else { const L = U.loopOf(st.m, a, b, E.edgeLoop); add = st.sm === 'vert' ? { V: [...new Set(L.flatMap(E.keyVerts))], E: [], F: [] } : { V: [], E: L, F: [] }; }
    if (!extend) { setSel(add); return; }
    setSel({ V: [...new Set([...cur.V, ...add.V])], E: [...new Set([...cur.E, ...add.E])], F: [...new Set([...cur.F, ...add.F])] });
    return;
  }
  const sm = st.sm, hit = sm === 'vert' ? pickVert(x, y) : sm === 'edge' ? pickEdge(x, y) : pickFace(x, y), list = sm === 'vert' ? 'V' : sm === 'edge' ? 'E' : 'F';
  if (hit == null) { if (!extend) setSel(E.emptySel()); return; }
  if (sm === 'face') S.st.active = hit;
  if (!extend) { setSel({ V: [], E: [], F: [], [list]: [hit] }); return; }
  const now = cur[list], has = now.includes(hit);
  setSel({ ...cur, [list]: has ? now.filter(v => v !== hit) : [...now, hit] });
}
function selectionChanged() {
  const F = selFull().F; if (F.length) noteOp(S.st, 'select', {}, F);
  if (!S.st.sync) S.st.uvSel = S.st.uvSel.filter(fi => F.includes(fi));
  S.lastOp = null; renderLastOp(); buildGeometry(); saveData(); refresh();
}
function selectAll() { if (!needEdit()) return; setSel({ V: S.st.m.v.map((_, i) => i), E: [...edgeOwner.keys()], F: U.allFaces(S.st.m) }); }
function selectNone() { if (!needEdit()) return; setSel(E.emptySel()); }
function selectLinked() {
  if (!needEdit()) return; const [x, y] = S.mouse, fi = pickFace(x, y);
  if (fi == null) { msg('Put the mouse over a face and press L.', true); return; }
  const F = U.linkedFaces(S.st.m, S.st.seams, fi), cur = selFull();
  if (S.st.sm !== 'face') { S.st.sel = E.switchMode(S.st.m, S.st.sm, 'face', S.st.sel); S.st.sm = 'face'; renderHeader(); }
  setSel({ V: [], E: [], F: [...new Set([...cur.F, ...F])] }); msg('Select Linked: the faces joined to it, up to the seams.');
}
function setSelectMode(sm) {
  if (!needEdit()) return; if (S.st.sm === sm) return;
  S.st.sel = E.switchMode(S.st.m, S.st.sm, sm, S.st.sel); S.st.sm = sm; renderHeader(); selectionChanged();
  msg({ vert: 'Vertex select mode', edge: 'Edge select mode', face: 'Face select mode' }[sm]);
}
function toggleEdit() {
  if (S.modal) return;
  S.st.mode = edit() ? 'object' : 'edit'; S.lastOp = null; renderLastOp();
  renderHeader(); buildGeometry(); saveData(); refresh(); msg(edit() ? 'Edit Mode' : 'Object Mode');
}
function needEdit() { if (!edit()) { msg('UVs are edited in Edit Mode: press Tab.', true); return false; } return true; }

// ─── Undo ────────────────────────────────────────────────────────────────────
const KEEP = ['m', 'uv', 'seams', 'sel', 'sm', 'mode', 'scale', 'uvSel', 'flags', 'stretch', 'sync', 'live', 'uvMode', 'uvIsland', 'active'];
const snap = () => JSON.parse(JSON.stringify(Object.fromEntries(KEEP.map(k => [k, S.st[k]]))));
function pushUndo(name, before = snap()) { S.undo.push({ name, snap: before }); if (S.undo.length > 48) S.undo.shift(); S.redo = []; }
function restore(s) { Object.assign(S.st, JSON.parse(JSON.stringify(s))); meshChanged(); }
function undo() { if (!S.undo.length) { msg('Nothing to undo.'); return; } const e = S.undo.pop(); S.redo.push({ name: e.name, snap: snap() }); restore(e.snap); S.lastOp = null; sceneChanged(); msg(tr('Undo {s}', { s: e.name })); }
function redo() { if (!S.redo.length) { msg('Nothing to redo.'); return; } const e = S.redo.pop(); S.undo.push({ name: e.name, snap: snap() }); restore(e.snap); S.lastOp = null; sceneChanged(); msg(tr('Redo {s}', { s: e.name })); }
function sceneChanged(save = true) { renderHeader(); buildGeometry(); if (save) saveData(); renderLastOp(); refresh(); }
function refresh() { S.rep = null; uvDirty = true; renderLabPanel(); renderStatusKeys(); checkProgress(); dirty = true; }
const rep = () => (S.rep ||= reportOf(S.st));

// ─── Operators (3D Viewport, Edit Mode) ──────────────────────────────────────
function seamTargets(clear) {
  const st = S.st, s = selFull();
  if (st.sm === 'face') return clear ? U.edgesOfFaces(st.m, s.F) : U.boundaryOf(st.m, s.F);
  return s.E;
}
function markSeam(clear = false) {
  if (!needEdit()) return;
  const keys = seamTargets(clear);
  if (!keys.length) { msg(S.st.sm === 'face' ? 'Select faces: Mark Seam cuts around them.' : 'Select the edges first.', true); return; }
  const before = snap(), set = new Set(S.st.seams);
  for (const k of keys) clear ? set.delete(k) : set.add(k);
  S.st.seams = [...set]; pushUndo(clear ? 'Clear Seam' : 'Mark Seam', before);
  if (S.st.live) { S.st.uv = U.unwrap(S.st.m, S.st.uv, U.allFaces(S.st.m), S.st.seams); noteOp(S.st, 'unwrap', { closed: U.closedIslands(S.st.m, S.st.seams, U.allFaces(S.st.m)).length > 0 }, U.allFaces(S.st.m)); }
  S.lastOp = null; sceneChanged(); msg(tr(clear ? 'Clear Seam: {n} edge(s)' : 'Mark Seam: {n} edge(s)', { n: keys.length }));
}
// Operators with an "Adjust Last Operation" panel: run(params) makes the new UVs from the state before.
const OPS = {
  unwrap: { name: 'Unwrap', fields: [{ k: 'method', label: 'Method', type: 'select', v: 'angle', options: [['angle', 'Angle Based'], ['conformal', 'Conformal'], ['minimum', 'Minimum Stretch']] }, { k: 'fill', label: 'Fill Holes', type: 'bool', v: true }, { k: 'aspect', label: 'Correct Aspect', type: 'bool', v: true }, { k: 'margin', label: 'Margin', type: 'num', v: 0.001, step: 0.005, min: 0, max: 0.2 }],
    run: (st, F, p) => U.unwrap(st.m, st.uv, F, st.seams, { margin: p.margin, method: p.method }) },
  lightmap: { name: 'Lightmap Pack', fields: [{ k: 'share', label: 'Share Texture Space', type: 'bool', v: false }, { k: 'quality', label: 'Pack Quality', type: 'num', v: 12, step: 1, min: 1, max: 48 }, { k: 'margin', label: 'Margin', type: 'num', v: 0.1, step: 0.05, min: 0, max: 1 }],
    run: (st, F, p) => U.lightmapPack(st.m, st.uv, F, { margin: p.margin, scale: st.scale }) },
  quads: { name: 'Follow Active Quads', fields: [{ k: 'mode', label: 'Edge Length Mode', type: 'select', v: 'average', options: [['even', 'Even'], ['length', 'Length'], ['average', 'Length Average']] }],
    run: (st, F, p) => U.followActiveQuads(st.m, st.uv, F, st.active, { mode: p.mode === 'even' ? 'even' : 'length', scale: st.scale }) },
  smart: { name: 'Smart UV Project', fields: [{ k: 'angle', label: 'Angle Limit', type: 'num', v: 66, step: 1, min: 1, max: 89, unit: '°' }, { k: 'margin', label: 'Island Margin', type: 'num', v: 0, step: 0.01, min: 0, max: 0.2 }, { k: 'area', label: 'Area Weight', type: 'num', v: 0, step: 0.1, min: 0, max: 1 }, { k: 'aspect', label: 'Correct Aspect', type: 'bool', v: true }],
    run: (st, F, p) => U.smartProject(st.m, st.uv, F, { angle: p.angle, margin: p.margin, scale: st.scale }) },
  cube: { name: 'Cube Projection', fields: [{ k: 'size', label: 'Cube Size', type: 'num', v: 2, step: 0.1, min: 0.1, max: 20, unit: ' m' }, { k: 'aspect', label: 'Correct Aspect', type: 'bool', v: true }, { k: 'clip', label: 'Clip to Bounds', type: 'bool', v: false }, { k: 'bounds', label: 'Scale to Bounds', type: 'bool', v: false }],
    run: (st, F, p) => U.cubeProject(st.m, st.uv, F, { size: p.size, bounds: p.bounds, scale: st.scale }) },
  cylinder: { name: 'Cylinder Projection', fields: [{ k: 'direction', label: 'Direction', type: 'select', v: 'equator', options: [['equator', 'View on Equator'], ['poles', 'View on Poles'], ['object', 'Align to Object']] }, { k: 'radius', label: 'Radius', type: 'num', v: 1, step: 0.1, min: 0.1, max: 10, unit: ' m' }, { k: 'aspect', label: 'Correct Aspect', type: 'bool', v: true }, { k: 'bounds', label: 'Scale to Bounds', type: 'bool', v: false }],
    run: (st, F, p, vb) => U.cylinderProject(st.m, st.uv, F, { direction: p.direction, view: vb, radius: p.radius, bounds: p.bounds, scale: st.scale }) },
  sphere: { name: 'Sphere Projection', fields: [{ k: 'direction', label: 'Direction', type: 'select', v: 'equator', options: [['equator', 'View on Equator'], ['poles', 'View on Poles'], ['object', 'Align to Object']] }, { k: 'aspect', label: 'Correct Aspect', type: 'bool', v: true }, { k: 'bounds', label: 'Scale to Bounds', type: 'bool', v: false }],
    run: (st, F, p, vb) => U.sphereProject(st.m, st.uv, F, { direction: p.direction, view: vb, bounds: p.bounds, scale: st.scale }) },
  view: { name: 'Project from View', fields: [{ k: 'ortho', label: 'Orthographic', type: 'bool', v: false }, { k: 'aspect', label: 'Correct Aspect', type: 'bool', v: true }, { k: 'bounds', label: 'Scale to Bounds', type: 'bool', v: false }],
    run: (st, F, p, vb) => U.projectFromView(st.m, st.uv, F, vb, { ortho: p.ortho || !vb.eye, bounds: p.bounds, scale: st.scale }) },
  viewb: { name: 'Project from View (Bounds)', fields: [{ k: 'ortho', label: 'Orthographic', type: 'bool', v: false }],
    run: (st, F, p, vb) => U.projectFromView(st.m, st.uv, F, vb, { ortho: p.ortho || !vb.eye, bounds: true, scale: st.scale }), note: 'view' },
  reset: { name: 'Reset', fields: [], run: (st, F) => U.resetUV(st.m, st.uv, F) },
  pack: { name: 'Pack Islands', uv: true, fields: [{ k: 'rotate', label: 'Rotate', type: 'bool', v: true }, { k: 'margin', label: 'Margin', type: 'num', v: 0.001, step: 0.005, min: 0, max: 0.2 }],
    run: (st, F, p) => U.pack(st.m, st.uv, F, { margin: p.margin, rotate: p.rotate }) },
  average: { name: 'Average Islands Scale', uv: true, fields: [{ k: 'nonuni', label: 'Non-Uniform', type: 'bool', v: false }], run: (st, F) => U.averageScale(st.m, st.uv, F, st.scale) },
};
const lastParams = {};
function runOp(id, over = {}) {
  const op = OPS[id]; if (!needEdit()) return;
  const F = op.uv ? uvTargets() : selFaces(S.st);
  if (!F.length) { msg(op.uv ? 'Select the UVs first: mouse over the UV Editor and press A.' : 'Select the faces first (A selects all).', true); return; }
  const before = snap(), vb = viewBasis(), p = { ...Object.fromEntries(op.fields.map(f => [f.k, lastParams[id]?.[f.k] ?? f.v])), ...over };
  if (id === 'quads' && (S.st.sm !== 'face' || !F.includes(S.st.active) || S.st.m.f[S.st.active]?.length !== 4)) { msg('Follow Active Quads needs an active quad: in Face select, click the quad whose UVs the others will follow (last click = active).', true); return; }
  if (id === 'view' || id === 'viewb') p.ortho = p.ortho || S.st.view.ortho;
  const exec = params => {
    S.st.uv = op.run(S.st, F, params, vb) || S.st.uv;
    noteOp(S.st, op.note || id, params, F);
    if (id === 'unwrap') { const closed = U.closedIslands(S.st.m, S.st.seams, F).length; noteOp(S.st, 'unwrap', { closed: closed > 0 }, F); return closed; }
    return 0;
  };
  const closed = exec(p);
  pushUndo(op.name, before);
  S.lastOp = op.fields.length ? { id, before, F, vb, fields: op.fields.map(f => ({ ...f, v: p[f.k] })), exec } : null;
  if (op.uv && !S.st.sync) S.st.uvSel = [...new Set([...S.st.uvSel])];
  sceneChanged();
  if (id === 'unwrap' && closed) msg(tr('Unwrap could not solve {n} island(s), edge seams may need to be added', { n: closed }), true);
  else if (id === 'unwrap' && S.st.scale.some(k => Math.abs(k - S.st.scale[0]) > 1e-6)) msg('Object has non-uniform scale, unwrap will operate on a non-scaled version of the mesh', true);
  else msg(tr('{s}: {n} face(s)', { s: op.name, n: F.length }));
}
function renderLastOp() {
  const el = $('#last-op'), op = S.lastOp; el.hidden = !op || !edit(); if (!op) return;
  const name = op.id === 'unwrap' ? 'Unwrap' : OPS[op.id].name;
  el.innerHTML = `<button type="button" class="lo-head" id="lo-toggle" aria-expanded="${!el.classList.contains('closed')}"><span class="lo-tri">▾</span><span data-no-i18n>${esc(name)}</span></button><div class="lo-body">` + op.fields.map((f, i) => {
    if (f.type === 'bool') return `<label class="lo-bool"><input type="checkbox" data-i="${i}" ${f.v ? 'checked' : ''}><span data-no-i18n>${esc(f.label)}</span></label>`;
    if (f.type === 'select') return `<label><span data-no-i18n>${esc(f.label)}</span><select data-i="${i}" data-no-i18n>${f.options.map(([v, l]) => `<option value="${v}" ${v === f.v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    return `<label><span data-no-i18n>${esc(f.label)}</span><input type="number" data-i="${i}" value="${+(+f.v).toFixed(3)}" step="${f.step}" min="${f.min}" max="${f.max}"></label>`;
  }).join('') + '</div>';
}
$('#last-op').addEventListener('click', e => { if (e.target.closest('#lo-toggle')) { $('#last-op').classList.toggle('closed'); renderLastOp(); } });
$('#last-op').addEventListener('change', e => {
  const op = S.lastOp, inp = e.target.closest('[data-i]'); if (!op || !inp) return;
  const f = op.fields[+inp.dataset.i];
  if (f.type === 'bool') f.v = inp.checked; else if (f.type === 'select') f.v = inp.value;
  else { const v = parseFloat(inp.value); if (!Number.isFinite(v)) return; f.v = Math.max(f.min, Math.min(f.max, v)); }
  const p = Object.fromEntries(op.fields.map(x => [x.k, x.v])); lastParams[op.id] = { ...p };
  const keepFlags = S.st.flags; restore(op.before); S.st.flags = { ...S.st.flags, ...keepFlags };
  const closed = op.exec(p);
  buildGeometry(); saveData(); refresh(); renderLastOp();
  if (op.id === 'unwrap' && closed) msg(tr('Unwrap could not solve {n} island(s), edge seams may need to be added', { n: closed }), true);
});
$('#last-op').addEventListener('keydown', e => e.stopPropagation());
function applyScale() {
  if (edit()) { msg('Apply is in Object Mode: press Tab first.', true); return; }
  if (S.st.scale.every(k => k === 1)) { msg('The scale is already 1, 1, 1.'); return; }
  const before = snap(); S.st.m.v = U.worldV(S.st.m, S.st.scale); S.st.scale = [1, 1, 1]; pushUndo('Apply Scale', before);
  meshChanged(); sceneChanged(); msg('Scale applied: the mesh keeps its shape and the scale is 1, 1, 1. Now unwrap again.');
}

// ─── UV Editor (2D canvas) ───────────────────────────────────────────────────
const uvc = $('#uv'), uvHost = $('#uv-host'), ug = uvc.getContext('2d');
let UW = 400, UH = 400, uvDirty = true;
new ResizeObserver(() => { const r = uvHost.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); UW = Math.max(160, r.width); UH = Math.max(160, r.height); uvc.width = UW * d; uvc.height = UH * d; uvDirty = true; }).observe(uvHost);
const uvScale = () => Math.min(UW, UH) * 0.84 * S.uvView.zoom;
const toPx = ([u, v]) => { const k = uvScale(); return [UW / 2 + (u - S.uvView.cx) * k, UH / 2 - (v - S.uvView.cy) * k]; };
const toUV = (x, y) => { const k = uvScale(); return [S.uvView.cx + (x - UW / 2) / k, S.uvView.cy - (y - UH / 2) / k]; };
// Faces shown in the UV Editor: the selected ones, or all with UV Sync Selection.
const shownFaces = () => !edit() ? [] : S.st.sync ? U.allFaces(S.st.m) : selFaces(S.st);
const uvTargets = () => { const shown = new Set(shownFaces()); return S.st.uvSel.filter(fi => shown.has(fi)); };
function drawUV() {
  if (!S.st) return;
  const d = Math.min(2, devicePixelRatio || 1), g = ug; g.setTransform(d, 0, 0, d, 0, 0);
  g.fillStyle = '#303030'; g.fillRect(0, 0, UW, UH);
  const [x0, y1] = toPx([0, 0]), [x1, y0] = toPx([1, 1]), k = uvScale();
  // tiling ghost of the image around the square, then the image
  g.globalAlpha = 0.18; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) g.drawImage(IMG, x0 + i * k, y0 - j * k, k, k);
  g.globalAlpha = 1; g.drawImage(IMG, x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = S.st && shownFaces().length ? '#00000070' : '#0000004d'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.strokeStyle = '#ffffff55'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
  g.fillStyle = '#9a9a9a'; g.font = '11px Inter, Segoe UI, Arial'; g.fillText('0', x0 - 12, y1 + 12); g.fillText('1', x1 - 3, y1 + 13); g.fillText('1', x0 - 12, y0 + 4);
  const F = shownFaces(), st = S.st, uvSel = new Set(uvTargets()), r = rep(), stretch = st.stretch;
  $('#uv-empty').hidden = F.length > 0;
  if (!F.length) $('#uv-empty').innerHTML = edit() ? `<b>${esc(t('No faces selected'))}</b>${esc(t('The UV Editor shows the UVs of the faces selected in the 3D Viewport. Press A over the 3D Viewport, or turn on UV Sync Selection.'))}` : `<b>${esc(t('Object Mode'))}</b>${esc(t('UVs are shown and edited in Edit Mode. Press Tab over the 3D Viewport.'))}`;
  const path = fi => { g.beginPath(); st.uv[fi].forEach((p, i) => { const [x, y] = toPx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  for (const fi of F) {
    path(fi);
    if (stretch !== 'off') { const s = r.per.get(fi), c = U.stretchColor(s.collapsed ? 1 : stretch === 'area' ? s.area : s.shape); g.fillStyle = `rgba(${c.map(x => Math.round(x * 255)).join(',')},${uvSel.has(fi) ? 0.85 : 0.7})`; }
    else g.fillStyle = uvSel.has(fi) ? '#ff8c1a55' : '#ffffff1f';
    g.fill();
  }
  const hov = S.uvHover != null && F.includes(S.uvHover) ? S.uvHover : null;
  for (const fi of F) { path(fi); g.strokeStyle = '#000000b0'; g.lineWidth = 3; g.stroke(); }
  for (const fi of F) { path(fi); g.strokeStyle = uvSel.has(fi) ? '#ffa000' : '#d8d8d8'; g.lineWidth = uvSel.has(fi) ? 1.6 : 1; g.stroke(); }
  if (hov != null) { path(hov); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke(); }
  // vertex dots (Vertex select) or face dots (Face select), orange when selected, as in Blender
  const mode = st.uvMode === 'island' ? 'vert' : st.uvMode;
  if (mode === 'vert') { const seen = new Map(); for (const fi of F) for (const p of st.uv[fi]) { const k2 = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`; if (!seen.has(k2) || uvSel.has(fi)) seen.set(k2, [p, uvSel.has(fi)]); }
    for (const [p, on] of seen.values()) { const [x, y] = toPx(p); g.fillStyle = on ? '#ff9a1f' : '#111'; g.beginPath(); g.arc(x, y, on ? 3 : 2.4, 0, Math.PI * 2); g.fill(); } }
  if (mode === 'face') for (const fi of F) { const c = st.uv[fi].reduce((a, p) => [a[0] + p[0] / st.uv[fi].length, a[1] + p[1] / st.uv[fi].length], [0, 0]), [x, y] = toPx(c); g.fillStyle = uvSel.has(fi) ? '#ff9a1f' : '#111'; g.fillRect(x - 2, y - 2, 4, 4); }
  // overlapping faces: red hatching outline
  if (r.overlaps) for (const fi of F) if (r.overlapFaces.has(fi)) { path(fi); g.setLineDash([4, 3]); g.strokeStyle = '#ff5a4a'; g.lineWidth = 1.4; g.stroke(); g.setLineDash([]); }
  // seams: drawn on both islands' borders, as Blender shows them
  const seams = new Set(st.seams); g.strokeStyle = '#ff3b1f'; g.lineWidth = 2;
  for (const fi of F) st.m.f[fi].forEach((a, i) => { const b = st.m.f[fi][(i + 1) % st.m.f[fi].length]; if (!seams.has(E.ek(a, b))) return; const [px, py] = toPx(st.uv[fi][i]), [qx, qy] = toPx(st.uv[fi][(i + 1) % st.uv[fi].length]); g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke(); });
  if (S.modal) { const [px, py] = toPx(S.modal.pivot); g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.stroke(); if (S.modal.axis) { g.strokeStyle = S.modal.axis === 'X' ? '#ff3352' : '#8bdc00'; g.beginPath(); if (S.modal.axis === 'X') { g.moveTo(0, py); g.lineTo(UW, py); } else { g.moveTo(px, 0); g.lineTo(px, UH); } g.stroke(); } }
  $('#stretch-legend').hidden = stretch === 'off';
}
function uvFaceAt(x, y) {
  const p = toUV(x, y), F = shownFaces().slice().reverse();
  const inside = poly => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1] || 1e-12) + a[0]) c = !c; } return c; };
  for (const fi of F) if (inside(S.st.uv[fi])) return fi;
  // near an edge (collapsed faces have no inside)
  let best = null, bd = 8;
  for (const fi of F) { const q = S.st.uv[fi].map(toPx); q.forEach((a, i) => { const b = q[(i + 1) % q.length], r = segDist(x, y, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }); if (r.d < bd) { bd = r.d; best = fi; } }); }
  return best;
}
const islandOf = fi => (U.uvIslands(S.st.m, S.st.uv, shownFaces()).find(I => I.includes(fi)) || [fi]);
function uvClick(x, y, extend) {
  const fi = uvFaceAt(x, y), st = S.st;
  if (fi == null) { if (!extend) st.uvSel = []; refresh(); saveData(); return; }
  const pick = st.uvIsland !== false ? islandOf(fi) : [fi], cur = new Set(uvTargets());
  if (!extend) st.uvSel = pick;
  else if (pick.every(f => cur.has(f))) st.uvSel = [...cur].filter(f => !pick.includes(f));
  else st.uvSel = [...new Set([...cur, ...pick])];
  saveData(); refresh();
}
function uvSelectAll(on = true) { if (!needEdit()) return; S.st.uvSel = on ? shownFaces() : []; if (on && !S.st.uvSel.length) msg('Nothing to select: select faces in the 3D Viewport first.', true); saveData(); refresh(); }
function frameUV() { S.uvView = { cx: 0.5, cy: 0.5, zoom: 1 }; uvDirty = true; }
// G S R in the UV Editor
function startUVModal(kind) {
  if (!needEdit()) return; const F = uvTargets();
  if (!F.length) { msg('Select UVs first: click an island in the UV Editor (A selects all).', true); return; }
  const pts = F.flatMap(fi => S.st.uv[fi]), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const pivot = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  S.modal = { kind, F, pivot, start: toUV(...S.mouseUV), before: snap(), axis: null, typed: '', ctrl: false, orig: JSON.parse(JSON.stringify(S.st.uv)) };
  uvHost.classList.add('modal'); applyUVModal();
}
function applyUVModal() {
  const md = S.modal; if (!md) return;
  const cur = toUV(...S.mouseUV), typed = md.typed !== '' && md.typed !== '-' ? parseFloat(md.typed) : null;
  let o = {}, text = '';
  if (md.kind === 'G') {
    let dx = cur[0] - md.start[0], dy = cur[1] - md.start[1];
    if (typed != null) { dx = md.axis === 'Y' ? 0 : typed; dy = md.axis === 'Y' ? typed : 0; }
    if (md.ctrl) { dx = Math.round(dx * 16) / 16; dy = Math.round(dy * 16) / 16; }
    if (md.axis === 'X') dy = 0; if (md.axis === 'Y') dx = 0;
    o = { t: [dx, dy] }; text = `D: ${dx.toFixed(3)}  ${dy.toFixed(3)}${md.axis ? ' · ' + md.axis : ''}${md.typed ? ' [' + md.typed + ']' : ''}`;
  } else if (md.kind === 'S') {
    const d0 = Math.hypot(md.start[0] - md.pivot[0], md.start[1] - md.pivot[1]) || 1e-6; let f = Math.hypot(cur[0] - md.pivot[0], cur[1] - md.pivot[1]) / d0;
    if (typed != null) f = typed; if (md.ctrl) f = Math.round(f * 10) / 10;
    o = { s: [md.axis === 'Y' ? 1 : f, md.axis === 'X' ? 1 : f], pivot: md.pivot }; text = `Scale ${f.toFixed(3)}${md.axis ? ' · ' + md.axis : ''}${md.typed ? ' [' + md.typed + ']' : ''}`;
  } else {
    const a0 = Math.atan2(md.start[1] - md.pivot[1], md.start[0] - md.pivot[0]), a1 = Math.atan2(cur[1] - md.pivot[1], cur[0] - md.pivot[0]);
    let deg = (a1 - a0) * 180 / Math.PI; if (typed != null) deg = typed; if (md.ctrl) deg = Math.round(deg / 5) * 5;
    o = { r: deg * Math.PI / 180, pivot: md.pivot }; text = `Rot ${deg.toFixed(1)}°${md.typed ? ' [' + md.typed + ']' : ''}`;
  }
  S.st.uv = U.transformUV(md.orig, md.F, o); md.last = o;
  const ro = $('#uv-readout'); ro.hidden = false; ro.textContent = text;
  buildGeometry(); S.rep = null; uvDirty = true;
}
function endUVModal(ok) {
  const md = S.modal; if (!md) return; S.modal = null; uvHost.classList.remove('modal'); $('#uv-readout').hidden = true;
  if (!ok) { S.st.uv = md.orig; } else { pushUndo({ G: 'Move', S: 'Resize', R: 'Rotate' }[md.kind], md.before); noteOp(S.st, md.kind === 'G' ? 'move' : md.kind === 'S' ? 'scaleUV' : 'rotate', {}, md.F); S.lastOp = null; renderLastOp(); }
  buildGeometry(); saveData(); refresh();
}
S.mouseUV = [0, 0];
const uvLocal = e => { const r = uvHost.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
uvc.addEventListener('pointerdown', e => {
  closeMenus(); const [x, y] = uvLocal(e); S.mouseUV = [x, y];
  if (S.modal) { e.preventDefault(); endUVModal(e.button === 0); return; }
  if (e.button === 1 || (e.button === 0 && e.altKey)) { e.preventDefault(); uvc.setPointerCapture(e.pointerId); S.uvNav = { last: [x, y], zoom: e.ctrlKey }; return; }
  if (e.button === 0) uvClick(x, y, e.shiftKey);
});
uvc.addEventListener('pointermove', e => {
  const [x, y] = uvLocal(e); S.mouseUV = [x, y];
  if (S.modal) { applyUVModal(); return; }
  if (S.uvNav) { const k = uvScale(), dx = x - S.uvNav.last[0], dy = y - S.uvNav.last[1]; S.uvNav.last = [x, y]; S.uvView.cx -= dx / k; S.uvView.cy += dy / k; uvDirty = true; return; }
  const h = uvFaceAt(x, y); if (h !== S.uvHover) { S.uvHover = h; uvDirty = true; }
});
uvc.addEventListener('pointerup', () => { S.uvNav = null; });
uvc.addEventListener('pointerleave', () => { if (S.uvHover != null) { S.uvHover = null; uvDirty = true; } });
uvc.addEventListener('contextmenu', e => { e.preventDefault(); if (S.modal) endUVModal(false); });
uvc.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
uvc.addEventListener('wheel', e => {
  e.preventDefault(); const [x, y] = uvLocal(e), before = toUV(x, y);
  S.uvView.zoom = Math.max(0.3, Math.min(12, S.uvView.zoom * (e.deltaY > 0 ? 1 / 1.15 : 1.15)));
  const after = toUV(x, y); S.uvView.cx += before[0] - after[0]; S.uvView.cy += before[1] - after[1]; uvDirty = true;
}, { passive: false });
for (const b of document.querySelectorAll('[data-nav2]')) {
  b.addEventListener('pointerdown', e => { e.stopPropagation(); b.setPointerCapture(e.pointerId); b.dataset.drag = `${e.clientX},${e.clientY}`; });
  b.addEventListener('pointermove', e => { if (!b.dataset.drag) return; const [x0, y0] = b.dataset.drag.split(',').map(Number), dx = e.clientX - x0, dy = e.clientY - y0; b.dataset.drag = `${e.clientX},${e.clientY}`; if (b.dataset.nav2 === 'zoom') S.uvView.zoom = Math.max(0.3, Math.min(12, S.uvView.zoom * Math.exp(-dy * 0.01))); else { const k = uvScale(); S.uvView.cx -= dx / k; S.uvView.cy += dy / k; } uvDirty = true; });
  b.addEventListener('pointerup', () => { delete b.dataset.drag; });
}
uvHost.addEventListener('pointerenter', () => { S.inUV = true; });
uvHost.addEventListener('pointerleave', () => { S.inUV = false; });
// Header: sync, select mode, overlays
$('#sync-btn').addEventListener('click', () => { S.st.sync = !S.st.sync; saveData(); renderHeader(); refresh(); msg(S.st.sync ? 'UV Sync Selection on: the UV Editor shows every face of the mesh.' : 'UV Sync Selection off: the UV Editor shows the faces selected in the 3D Viewport.'); });
document.querySelectorAll('[data-uvmode]').forEach(b => b.addEventListener('click', () => { S.st.uvMode = b.dataset.uvmode; saveData(); renderHeader(); uvDirty = true; msg({ vert: 'Vertex select: the UV vertices are shown as dots.', edge: 'Edge select.', face: 'Face select: each face shows a dot in its centre.' }[S.st.uvMode]); }));
$('#island-btn').addEventListener('click', () => { S.st.uvIsland = !S.st.uvIsland; saveData(); renderHeader(); msg(S.st.uvIsland ? 'Island select: a click selects a whole island.' : 'Island select off: a click selects one face.'); });
document.querySelectorAll('.uv-tools [data-tool]').forEach(b => b.addEventListener('click', () => { const tl = b.dataset.tool; if ('GRS'.includes(tl) && tl.length === 1) { S.mouseUV = [UW / 2, UH / 2]; startUVModal(tl); return; } if (tl === 'select') return; msg('This tool is not used in this lab: the Select Box tool and the keys G, R and S are enough here.'); }));
$('#overlay-btn').addEventListener('click', e => { e.stopPropagation(); const p = $('#overlay-pop'); p.hidden = !p.hidden; $('#overlay-btn').setAttribute('aria-expanded', String(!p.hidden)); renderOverlay(); });
document.addEventListener('pointerdown', e => { if (!e.target.closest('#overlay-pop') && !e.target.closest('#overlay-btn')) { $('#overlay-pop').hidden = true; $('#overlay-btn').setAttribute('aria-expanded', 'false'); } });
$('#stretch-on').addEventListener('change', e => { S.st.stretch = e.target.checked ? (S.lastStretch || 'area') : 'off'; saveData(); renderOverlay(); refresh(); });
$('#stretch-type').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (!b) return; S.lastStretch = b.dataset.st; S.st.stretch = b.dataset.st; saveData(); renderOverlay(); refresh(); });
function renderOverlay() {
  const s = S.st.stretch; $('#stretch-on').checked = s !== 'off';
  document.querySelectorAll('#stretch-type [data-st]').forEach(b => { b.setAttribute('aria-pressed', String(s === b.dataset.st)); b.disabled = s === 'off'; });
  $('#stretch-note').textContent = t(s === 'area' ? 'Area: faces bigger or smaller on the image than the others, for their size on the model.' : s === 'angle' ? 'Angle: faces squashed or skewed on the image.' : 'Colours each face by how much the image is stretched on it.');
  $('#overlay-btn').classList.toggle('on', s !== 'off');
}

// ─── Pointer input (3D Viewport) ─────────────────────────────────────────────
const local = e => { const r = host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
host.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
host.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  closeMenus(); const [x, y] = local(e); S.mouse = [x, y];
  if (S.modal) { endUVModal(e.button === 0); return; }
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 1 || (e.button === 0 && e.altKey && !edit()) || e.pointerType === 'touch') { e.preventDefault(); S.nav = { mode: e.shiftKey ? 'pan' : (e.ctrlKey || e.metaKey) ? 'zoom' : 'orbit', last: [x, y], x0: x, y0: y, touch: e.pointerType === 'touch', moved: false }; host.classList.add('navigating'); return; }
  if (e.button === 2) { if (edit()) openMenu('context', [x, y]); return; }
  if (e.button === 0) S.click = { x, y, shift: e.shiftKey, alt: e.altKey };
});
canvas.addEventListener('pointermove', e => {
  const [x, y] = local(e); S.mouse = [x, y];
  if (S.nav) { const n = S.nav, dx = x - n.last[0], dy = y - n.last[1]; n.last = [x, y]; if (Math.hypot(x - n.x0, y - n.y0) > 4) n.moved = true; if (n.mode === 'orbit') S.st.view = V.orbit(S.st.view, -dx * 0.4, dy * 0.4); else if (n.mode === 'pan') S.st.view = V.pan(S.st.view, dx, dy, W, H); else S.st.view = V.zoom(S.st.view, Math.exp(dy * 0.01)); viewChanged(); }
});
canvas.addEventListener('pointerup', e => {
  const [x, y] = local(e);
  if (S.nav) { const n = S.nav; S.nav = null; host.classList.remove('navigating'); if (n.touch && !n.moved) clickAt(x, y, false, false); saveData(); return; }
  if (S.click) { const c = S.click; S.click = null; clickAt(x, y, c.shift, c.alt); }
});
canvas.addEventListener('pointercancel', () => { S.nav = null; S.click = null; });
function clickAt(x, y, extend, alt) {
  if (!edit()) { msg(pickFace(x, y) != null ? 'Selected. Press Tab to edit its UVs.' : 'Click the object, then press Tab.'); return; }
  clickSelect(x, y, extend, alt);
}
canvas.addEventListener('wheel', e => { e.preventDefault(); S.st.view = V.zoom(S.st.view, e.deltaY > 0 ? 1.15 : 1 / 1.15); viewChanged(); }, { passive: false });
host.addEventListener('pointerenter', () => { S.inView = true; });
host.addEventListener('pointerleave', () => { S.inView = false; });
gz.addEventListener('pointerdown', e => { e.stopPropagation(); gz.setPointerCapture(e.pointerId); const r = gz.getBoundingClientRect(); S.nav = { mode: 'orbit', gizmo: true, last: [e.clientX, e.clientY], moved: false, ball: gizmoHit(e.clientX - r.left, e.clientY - r.top) }; });
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
$('#unfold-r').addEventListener('input', e => { S.unfold = +e.target.value / 100; buildGeometry(); });

// ─── Keyboard ────────────────────────────────────────────────────────────────
let hover = false;
$('#workspace').addEventListener('pointerenter', () => { hover = true; });
$('#workspace').addEventListener('pointerleave', () => { hover = false; });
const NUMPAD = { Numpad1: 'front', Numpad3: 'right', Numpad7: 'top' }, OPPOSITE = { front: 'back', right: 'left', top: 'bottom' };
function numpadCode(e) { if (e.code.startsWith('Numpad')) return e.code; if (S.emu && /^Digit[0-9]$/.test(e.code)) return 'Numpad' + e.code.slice(5); return null; }
function numpad(code, ctrl) {
  const v = S.st.view;
  if (NUMPAD[code]) axisView(ctrl ? OPPOSITE[NUMPAD[code]] : NUMPAD[code]);
  else if (code === 'Numpad5') togglePersp();
  else if (code === 'NumpadDecimal' || code === 'Home') frameAll();
  else if (code === 'Numpad2') setView(V.orbit(v, 0, 15));
  else if (code === 'Numpad8') setView(V.orbit(v, 0, -15));
  else if (code === 'Numpad4') setView(V.orbit(v, 15, 0));
  else if (code === 'Numpad6') setView(V.orbit(v, -15, 0));
  else if (code === 'NumpadAdd') setView(V.zoom(v, 1 / 1.2));
  else if (code === 'NumpadSubtract') setView(V.zoom(v, 1.2));
}
function modalKey(e) {
  const md = S.modal, k = e.key;
  if (k === 'Escape') endUVModal(false);
  else if (k === 'Enter') endUVModal(true);
  else if (k === 'x' || k === 'X' || k === 'y' || k === 'Y') { if (md.kind !== 'R') { const a = k.toUpperCase(); md.axis = md.axis === a ? null : a; applyUVModal(); } }
  else if (/^[0-9.]$/.test(k) || (k === '-' && md.typed === '')) { md.typed += k; applyUVModal(); }
  else if (k === 'Backspace') { md.typed = md.typed.slice(0, -1); applyUVModal(); }
  else if (k === 'Control' || k === 'Meta') { md.ctrl = true; applyUVModal(); }
}
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea') || !hover) return;
  if (S.modal) { modalKey(e); e.preventDefault(); return; }
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.length === 1 ? e.key.toLowerCase() : e.key, np = numpadCode(e), uvSide = S.inUV && !S.inView;
  let handled = true;
  if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (e.key === 'F9') { if (S.lastOp) { $('#last-op').classList.remove('closed'); renderLastOp(); } }
  else if (e.key === 'Escape') closeMenus();
  else if (uvSide) {
    if (ctrl && low === 'p') runOp('pack');
    else if (ctrl && low === 'a') runOp('average');
    else if (ctrl) handled = false;
    else if (e.altKey && low === 'a') uvSelectAll(false);
    else if (low === 'a') uvSelectAll(true);
    else if (low === 'g') startUVModal('G');
    else if (low === 's') startUVModal('S');
    else if (low === 'r') startUVModal('R');
    else if (low === 'l') { const fi = uvFaceAt(...S.mouseUV); if (fi != null) { S.st.uvSel = [...new Set([...uvTargets(), ...islandOf(fi)])]; saveData(); refresh(); } }
    else if (low === 'u') { if (needEdit()) openMenu('unwrap', S.mouseUV, null, uvHost); }
    else if (e.key === 'Home') frameUV();
    else if (e.key === 'Tab') toggleEdit();
    else handled = false;
  } else {
    if (ctrl && low === 'e') { if (needEdit()) openMenu('edge', S.mouse); }
    else if (ctrl && low === 'a') { if (!edit()) openMenu('apply', S.mouse); else msg('Apply is in Object Mode: press Tab first.', true); }
    else if (np) numpad(np, ctrl);
    else if (ctrl) handled = false;
    else if (e.key === 'Home') frameAll();
    else if (e.key === 'Tab') toggleEdit();
    else if (e.altKey && low === 'a') selectNone();
    else if (!e.altKey && !e.shiftKey && /^Digit[123]$/.test(e.code)) setSelectMode(['vert', 'edge', 'face'][+e.code.slice(5) - 1]);
    else if (low === 'a') selectAll();
    else if (low === 'u') { if (needEdit()) openMenu('unwrap', S.mouse); }
    else if (low === 'l') selectLinked();
    else handled = false;
  }
  if (handled) e.preventDefault();
});
document.addEventListener('keyup', e => { if (S.modal && (e.key === 'Control' || e.key === 'Meta')) { S.modal.ctrl = false; applyUVModal(); } });

// ─── Menus ───────────────────────────────────────────────────────────────────
const UNWRAPS = () => [['Unwrap Angle Based', '', () => runOp('unwrap', { method: 'angle' })], ['Unwrap Conformal', '', () => runOp('unwrap', { method: 'conformal' })], ['Unwrap Minimum Stretch', '', () => runOp('unwrap', { method: 'minimum' })]];
const U_MENU = () => [...UNWRAPS(), '-', ['Smart UV Project...', '', () => runOp('smart')], ['Lightmap Pack...', '', () => runOp('lightmap')], ['Follow Active Quads...', '', () => runOp('quads')], '-', ['Cube Projection', '', () => runOp('cube')], ['Cylinder Projection', '', () => runOp('cylinder')], ['Sphere Projection', '', () => runOp('sphere')], '-', ['Project from View', '', () => runOp('view')], ['Project from View (Bounds)', '', () => runOp('viewb')], '-', ['Mark Seam', '', () => markSeam(false)], ['Clear Seam', '', () => markSeam(true)], '-', ['Reset', '', () => runOp('reset')]];
function menuItems(id) {
  const h = S.undo;
  if (id === 'edit') return [['Undo', 'Ctrl Z', undo], ['Redo', 'Ctrl Shift Z', redo], '-', '#Undo History', ['Original', h.length === 0 ? '●' : '', () => { while (S.undo.length) undo(); }], ...h.map((e, i) => [e.name, i === h.length - 1 ? '●' : '', () => { const n = S.undo.length - i - 1; for (let k = 0; k < n; k++) undo(); }])];
  if (id === 'view') return [['Frame All', 'Home', frameAll], ['Perspective/Orthographic', 'Numpad 5', togglePersp], '-', '#Viewpoint', ...['top', 'bottom', 'front', 'back', 'right', 'left'].map(n => [V.VIEWS[n].label, V.VIEWS[n].key, () => axisView(n)])];
  if (id === 'select') return [['All', 'A', selectAll], ['None', 'Alt A', selectNone], '-', ['Select Linked', 'L', () => msg('Put the mouse over a face and press L.')], '-', '#Select Loops', ['Edge Loops', 'Alt Click', () => msg('Alt + click an edge selects its loop.')]];
  if (id === 'uv' || id === 'unwrap') return ['#UV Mapping', ...U_MENU()];
  if (id === 'edge' || id === 'context') return ['#' + (id === 'edge' ? 'Edge' : S.st.sm === 'face' ? 'Face Context Menu' : 'Edge Context Menu'), ['Mark Seam', '', () => markSeam(false)], ['Clear Seam', '', () => markSeam(true)], ...(id === 'context' ? ['-', ...UNWRAPS()] : [])];
  if (id === 'object') return [['Apply › Scale', 'Ctrl A', applyScale], ['Apply › All Transforms', '', applyScale]];
  if (id === 'apply') return ['#Apply', ['Location', '', () => msg('The location is already 0, 0, 0.')], ['Rotation', '', () => msg('The rotation is already 0°.')], ['Scale', '', applyScale], ['All Transforms', '', applyScale]];
  if (id === 'uvimage') return [['New', 'Alt N', () => msg('This lab uses one generated image: Color Grid (Image › New, Generated Type: Color Grid).')], ['Open...', 'Alt O', () => msg('This lab uses one generated image: Color Grid (Image › New, Generated Type: Color Grid).')], '-', ['Color Grid (generated, 1024 px)', '●', () => {}]];
  if (id === 'uvview') return [['Frame All', 'Home', frameUV], ['Zoom In', 'Wheel', () => { S.uvView.zoom *= 1.25; uvDirty = true; }], ['Zoom Out', 'Wheel', () => { S.uvView.zoom /= 1.25; uvDirty = true; }]];
  if (id === 'uvselect') return [['All', 'A', () => uvSelectAll(true)], ['None', 'Alt A', () => uvSelectAll(false)], ['Select Linked', 'L', () => msg('Put the mouse over an island in the UV Editor and press L.')]];
  if (id === 'uvuv') return ['#Unwrap', ...UNWRAPS(), '-', ['Pack Islands', 'Ctrl P', () => runOp('pack')], ['Average Islands Scale', 'Ctrl A', () => runOp('average')], '-', [`${S.st.live ? '☑' : '☐'} Live Unwrap`, '', () => { S.st.live = !S.st.live; saveData(); msg(S.st.live ? 'Live Unwrap on: marking or clearing a seam unwraps the whole mesh again.' : 'Live Unwrap off.'); }], '-', ['Mark Seam', '', () => markSeam(false)], ['Clear Seam', '', () => markSeam(true)], '-', ['Reset', '', () => runOp('reset')]];
  return [];
}
let menuEl = null, menuFor = null;
function openMenu(id, at, btn, from = host) {
  closeMenus(); menuFor = btn || null; if (btn) btn.setAttribute('aria-expanded', 'true');
  const items = menuItems(id), el = document.createElement('div'); el.className = 'context-menu vp-menu'; el.setAttribute('data-no-i18n', ''); el.setAttribute('role', 'menu');
  el.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : typeof it === 'string' ? `<div class="menu-title">${esc(it.slice(1))}</div>` : `<button type="button" role="menuitem" data-i="${i}"><span class="m-label">${esc(it[0])}</span><span class="m-key">${esc(it[1])}</span></button>`).join('');
  el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const it = items[+b.dataset.i]; closeMenus(); it[2](); });
  document.body.appendChild(el); menuEl = el;
  let x, y;
  if (btn) { const r = btn.getBoundingClientRect(); x = r.left; y = r.bottom + 2; } else { const r = from.getBoundingClientRect(); x = r.left + at[0] - 20; y = r.top + at[1] - 12; }
  const mr = el.getBoundingClientRect(); x = Math.min(x, innerWidth - mr.width - 8); y = Math.min(y, innerHeight - mr.height - 8);
  el.style.left = Math.max(4, x) + 'px'; el.style.top = Math.max(4, y) + 'px';
  el.querySelector('button')?.focus({ preventScroll: true });
}
function closeMenus() { menuEl?.remove(); menuEl = null; if (menuFor) menuFor.setAttribute('aria-expanded', 'false'); menuFor = null; }
document.addEventListener('pointerdown', e => { if (menuEl && !e.target.closest('.vp-menu') && !e.target.closest('[data-menu]')) closeMenus(); });
$('#workspace').addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (!b) return; if (menuFor === b) { closeMenus(); return; } openMenu(b.dataset.menu, null, b); });
$('#emu-numpad').checked = S.emu;
$('#emu-numpad').addEventListener('change', e => { S.emu = e.target.checked; store.set('emu', S.emu); msg(S.emu ? 'Emulate Numpad on: the number row now changes the view, so use the header buttons for the select modes.' : 'Emulate Numpad off: 1, 2 and 3 are the select modes again.'); });

// ─── Header, outliner, lab panel ─────────────────────────────────────────────
function renderHeader() {
  const ed = edit();
  $('#mode-btn').innerHTML = `${ICONS[ed ? 'editmode' : 'objectmode']}<span>${ed ? 'Edit Mode' : 'Object Mode'}</span>${ICONS.dropdown}`; $('#mode-btn').setAttribute('aria-pressed', String(ed));
  document.querySelectorAll('[data-sm]').forEach(b => { b.setAttribute('aria-pressed', String(ed && S.st.sm === b.dataset.sm)); b.disabled = !ed; });
  $('#menus').innerHTML = (ed ? ['View', 'Select', 'UV'] : ['View', 'Object']).map(n => `<button type="button" class="menu-button" data-menu="${n.toLowerCase()}" aria-expanded="false">${n}</button>`).join('');
  $('#sync-btn').setAttribute('aria-pressed', String(!!S.st.sync));
  document.querySelectorAll('[data-uvmode]').forEach(b => b.setAttribute('aria-pressed', String((S.st.uvMode === 'island' ? 'vert' : S.st.uvMode) === b.dataset.uvmode)));
  $('#island-btn').setAttribute('aria-pressed', String(S.st.uvIsland !== false));
  host.classList.toggle('object-mode', !ed);
  const name = U.MESH_NAMES[S.st.obj];
  $('#outliner').innerHTML = outlinerHTML([
    { name: 'Scene Collection', icon: 'scene_collection', open: true, depth: 0 },
    { name: 'Collection', icon: 'collection', open: true, depth: 1, eye: true, cam: true },
    { name, icon: 'ob_mesh', open: false, depth: 2, inline: ['data_mesh', 'material'], sel: true, active: true, mode: ed ? 'edit' : 'object', eye: true, cam: true },
  ], { showMode: true });
  renderOverlay();
}
$('#mode-btn').addEventListener('click', toggleEdit);
document.querySelectorAll('[data-sm]').forEach(b => b.addEventListener('click', () => setSelectMode(b.dataset.sm)));
const statRow = (label, val, cls = '') => `<div class="sb-stat ${cls}"><span>${label}</span><b>${val}</b></div>`;
function renderLabPanel() {
  const st = S.st, r = rep(), id = sid(), yes = ok => ok ? '✓' : '·';
  const cls = (ok, bad = 'bad') => ok ? 'good' : bad;
  let h = '';
  if (id === 'a1') h = `<h4>${esc(t('Faces seen'))}</h4>` + statRow(esc(t('Faces clicked')), `${Object.keys(st.flags.seen || {}).length} / 3`, cls(Object.keys(st.flags.seen || {}).length >= 3, ''));
  else if (id === 'a2') h = `<h4>${esc(t('UV Editor'))}</h4>` + statRow(esc(t('Moved (G)')), yes(st.flags.moved), cls(st.flags.moved, '')) + statRow(esc(t('Scaled (S)')), yes(st.flags.scaled), cls(st.flags.scaled, ''));
  else if (id === 'b4') h = `<h4>${esc(t('Object'))}</h4>` + statRow('<span data-no-i18n>Scale</span>', st.scale.map(fmt2).join(', '), cls(st.scale.every(k => k === 1)));
  else if (id === 'c1') { const s = reportOf(st, [2]); h = `<h4>${esc(t('Front face'))}</h4>` + statRow(esc(t('Projected from view')), yes(st.flags.viewFront), cls(st.flags.viewFront, '')) + statRow(esc(t('Shape stretch')), fmt2(s.maxShape), cls(s.maxShape < 0.03)); }
  else if (id === 'c2') { const s = reportOf(st, SIDE); h = `<h4>${esc(t('Side of the cylinder'))}</h4>` + statRow('<span data-no-i18n>Align to Object</span>', yes(st.flags.cylObject), cls(st.flags.cylObject, '')) + statRow(esc(t('Faces upright')), yes(sideUpright(st)), cls(sideUpright(st))) + statRow(esc(t('Shape stretch')), fmt2(s.maxShape), cls(s.maxShape < 0.1)); }
  else if (id === 'c3') { const s = reportOf(st, CAPS); h = `<h4>${esc(t('The lids'))}</h4>` + statRow(esc(t('Collapsed')), s.collapsed, cls(!s.collapsed)) + statRow(esc(t('Flipped (mirrored)')), s.flipped, cls(!s.flipped)) + statRow(esc(t('Shape stretch')), fmt2(s.maxShape), cls(s.maxShape < 0.03)); }
  else if (id === 'c4') h = `<h4>${esc(t('Sphere'))}</h4>` + statRow(esc(t('Sphere Projection, Align to Object')), yes(st.flags.sphereObject), cls(st.flags.sphereObject, '')) + statRow(esc(t('Display Stretch on')), yes(st.stretch !== 'off'), cls(st.stretch !== 'off', ''));
  else if (id === 'd1') h = `<h4>${esc(t('Smart UV Project'))}</h4>` + statRow(esc(t('Angle Limits tried')), (st.flags.angles || []).map(a => a + '°').join(' · ') || '—', cls((st.flags.angles || []).length >= 2, '')) + statRow('<span data-no-i18n>Island Margin</span>', st.flags.smart ? fmt2(st.flags.smartMargin || 0) : '—', cls((st.flags.smartMargin || 0) >= 0.02, ''));
  else if (id === 'd2') h = `<h4>${esc(t('Cube Projection'))}</h4>` + statRow(esc(t('Done')), yes(st.flags.cubeProj), cls(st.flags.cubeProj, ''));
  const all = st.m.f.length;
  h += `${h ? '<div class="sb-sep"></div>' : ''}<h4>${esc(t('UV check'))} <small>${esc(tr('{n} faces', { n: all }))}</small></h4>` +
    statRow(esc(t('UV islands')), r.islands) +
    statRow(esc(t('Seams')), st.seams.length) +
    statRow(esc(t('Collapsed faces')), r.collapsed, cls(!r.collapsed)) +
    statRow(esc(t('Flipped faces')), r.flipped, cls(!r.flipped)) +
    statRow(esc(t('Overlapping faces')), r.overlaps, cls(!r.overlaps, 'warn')) +
    statRow(esc(t('Outside 0–1')), r.outside, cls(!r.outside, 'warn')) +
    statRow(esc(t('Max stretch · area')), fmt2(r.maxArea), cls(r.maxArea < RULES.flat, r.maxArea < RULES.round ? 'warn' : 'bad')) +
    statRow(esc(t('Max stretch · shape')), fmt2(r.maxShape), cls(r.maxShape < RULES.flat, r.maxShape < RULES.round ? 'warn' : 'bad')) +
    statRow(esc(t('Texel density spread')), r.islands > 1 ? Math.round(r.densityCV * 100) + ' %' : '—', cls(r.densityCV < RULES.density, 'warn')) +
    `<p class="sb-empty">${esc(t('For the whole mesh, whatever is selected. 0 stretch = the image keeps its shape.'))}</p>`;
  $('#lab-panel').innerHTML = `<div class="panel">${h}</div>`;
}
function renderStatusKeys() {
  const k = (keys, label) => `<span>${keys.map(x => `<kbd>${esc(x)}</kbd>`).join('')}${esc(t(label))}</span>`;
  let h;
  if (S.modal) h = [k(['LMB'], 'Confirm'), k(['RMB'], 'Cancel'), k(['X', 'Y'], 'Axis'), k(['Ctrl'], 'Snap'), k(['0–9'], 'Type a value')].join('');
  else if (!edit()) h = [k(['Tab'], 'Edit Mode'), k(['Ctrl', 'A'], 'Apply'), k(['MMB'], 'Orbit'), k(['Wheel'], 'Zoom')].join('');
  else h = [k(['1', '2', '3'], 'Vertex · Edge · Face'), k(['LMB'], 'Select'), k(['Alt', 'LMB'], 'Loop'), k(['A'], 'All'), k(['U'], 'UV menu'), k(['Ctrl', 'E'], 'Mark Seam'), k(['MMB'], 'Orbit'), k(['Tab'], 'Object Mode')].join('');
  $('#status-keys').innerHTML = h;
}

// ─── Steps, storage ──────────────────────────────────────────────────────────
const dataKey = () => `step:${stage().id}-${sid()}`;
function saveData() { store.set(dataKey(), { st: S.st }); }
function loadData() {
  const saved = store.get(dataKey(), null), fresh = startState(step());
  const ok = saved?.st?.m?.v && saved.st.obj === fresh.obj && saved.st.uv?.length === fresh.m.f.length && saved.st.view;
  S.st = ok ? { ...fresh, ...saved.st, flags: saved.st.flags || {} } : fresh;
  S.undo = []; S.redo = []; S.lastOp = null; meshChanged();
}
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${stage().steps[i].id}`;
const stepDone = i => i === S.step ? !!step().check(S.st) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.className = `guide${n === 3 ? ' three' : n === 2 ? ' two' : ''}`;
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(); });
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, AS IN BLENDER'))}</span><ol>${s.how.map(x => `<li>${t(x)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo('Reset step', snap()); const f = startState(step()); for (const k of [...KEEP, 'view']) S.st[k] = f[k]; S.lastOp = null; meshChanged(); frameUV(); sceneChanged(); msg('Back to the start. Ctrl Z brings your work back.'); }
  if (id === 'show-solution') { pushUndo('Solution', snap()); step().solve(S.st); S.lastOp = null; meshChanged(); sceneChanged(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null, lastCard = '';
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) { const title = step().title; setTimeout(() => { if (step().title === title) msg(tr('✓ Step done: {s}', { s: t(title) })); }, 900); }
  const k = `${S.stageIndex}|${S.step}|${ok}|${document.documentElement.lang}`;
  if (k !== lastCard) { renderGuide(); renderStepCard(); lastCard = k; }
  lastOk = ok;
}
function enterStep() {
  if (S.modal) endUVModal(false); S.anim = null; closeMenus();
  loadData(); lastCard = ''; lastOk = stepDone(S.step); S.unfold = 0; $('#unfold-r').value = 0; frameUV();
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  renderStageSwitch(); sceneChanged(false);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); renderHeader(); refresh(); });

// ─── Start ───────────────────────────────────────────────────────────────────
resize(); enterStep(); requestAnimationFrame(loop);
window.__uv = {
  S, STAGES, U, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, solve: () => { step().solve(S.st); meshChanged(); sceneChanged(); },
  key: (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: o.code || '', ctrlKey: !!o.ctrl, shiftKey: !!o.shift, altKey: !!o.alt, bubbles: true })),
  hover: (where) => { hover = true; S.inView = where === '3d'; S.inUV = where === 'uv'; }, runOp, markSeam, project: p => V.project(S.st.view, p, W, H), toPx,
};
