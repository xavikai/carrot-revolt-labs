// Trim Sheet Lab: a Blender-style UV Editor over a medieval trim sheet, with a live 3D view.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { SIZE, DENSITY, TYPES, TYPE_IDS, HEIGHTS, PADS, PALETTES, DEFAULT_STRIPS, stripsOf, stripAt, stripOf, cleanMips } from './sheet.js?v=1';
import { paintSheet, mip } from './paint.js?v=2';
import { report, problem, islandFaces, bbox, cloneUV, translate, scale as scaleUV, rotate as rotateUV, followActiveQuads, alignRotation, fitToTrim, density, cornerNormals } from './uv.js?v=2';
import { propOf, solvedUV } from './props.js?v=2';
import { STAGES, QUIZ, startState, meshOf, layoutInfo, reports } from './stages.js?v=2';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=2';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-trim:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-trim:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [],
  done: store.get('done', {}), sel: new Set(), hover: false, hoverStrip: null, pivot: 'bbox', modal: null,
};
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step];
const isBoard = () => S.st.scene === 'board';
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 7000);
}
const typeName = type => TYPES[type]?.name ?? type;

// ─── Sheets (painted on demand, cached) ──────────────────────────────────────
const sheets = new Map();
function sheetFor(layout, pad, palette) {
  const key = JSON.stringify(layout) + '|' + pad + '|' + palette;
  if (!sheets.has(key)) {
    if (sheets.size > 8) { for (const s of sheets.values()) s.dispose?.(); sheets.clear(); }
    const p = paintSheet(layout, pad, palette);
    const color = new THREE.CanvasTexture(p.color), normal = new THREE.CanvasTexture(p.normal);
    for (const tex of [color, normal]) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; }
    color.colorSpace = THREE.SRGBColorSpace; normal.colorSpace = THREE.NoColorSpace;
    sheets.set(key, { ...p, color3: color, normal3: normal, mips: [], small: new Map(), dispose() { color.dispose(); normal.dispose(); for (const m of this.small.values()) { m.c.dispose(); m.n.dispose(); } } });
  }
  return sheets.get(key);
}
const currentSheet = () => isBoard() ? sheetFor(S.st.layout, S.st.pad, S.st.palette) : sheetFor(stripsLayout, 8, S.st.palette);
const stripsLayout = TYPE_IDS.map(type => ({ type, px: TYPES[type].m * DENSITY }));
const mipCanvas = (sheet, m) => (sheet.mips[m] ??= mip(sheet.color, m));
// ─── 3D viewport ─────────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.1;
const scene3 = new THREE.Scene(); scene3.background = new THREE.Color(0x3a3a3a);
{ const pm = new THREE.PMREMGenerator(renderer), env = new RoomEnvironment(); scene3.environment = pm.fromScene(env, 0.04).texture; scene3.environmentIntensity = 0.55; env.dispose(); pm.dispose(); }
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2); sun.position.set(-3, 5, 4); scene3.add(sun);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls.addEventListener('change', () => { dirty = true; });
const grid = new THREE.GridHelper(12, 24, 0x555555, 0x474747); scene3.add(grid);
const world = new THREE.Group(); scene3.add(world);
let dirty = true, meshObj = null, overlayObj = null, faceOfTri = [];
const CAMS = { wall: [[1.8, 1.7, 6.2], [0, 0.95, 0]], column: [[1.9, 1.6, 3.4], [0, 0.7, 0]], chest: [[1.6, 1.3, 2.1], [0, 0.25, 0]], beam: [[2.3, 2.0, 3.9], [0, 0.6, 0]], all: [[0.5, 3.5, 9.6], [0, 0.5, -0.1]], board: [[0, 1.4, 3.8], [0, 1.2, 0]] };
function frame(kind) { const [p, tg] = CAMS[kind] || CAMS.wall; camera.position.set(...p); controls.target.set(...tg); controls.update(); dirty = true; }
const matOf = (map, normalMap) => new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.82, metalness: 0, side: THREE.FrontSide });
const overlayMat = new THREE.MeshBasicMaterial({ color: 0xffa629, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
const hoverMat = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
const EXTRA = { stone: 0xb49c78, wood: 0x6e4a2c };
let materialCache = [];

function clearWorld() { for (const o of [...world.children]) { world.remove(o); o.geometry?.dispose(); } materialCache.forEach(m => m.dispose()); materialCache = []; }
const uvFor = (m, f) => S.st.uv[f];
function build3D() {
  clearWorld(); overlayObj = null; meshObj = null; faceOfTri = [];
  if (isBoard()) { buildBoard(); dirty = true; return; }
  const m = meshOf(S.st), normals = cornerNormals(m, S.st.shading);
  const pos = [], nor = [], uv = [], groups = [];
  let group = null;
  m.faces.forEach((face, f) => {
    const prop = S.st.scene === 'all' ? propOf(face.island) : 'one';
    if (!group || group.prop !== prop) { group = { prop, start: pos.length / 3, count: 0 }; groups.push(group); }
    const u = uvFor(m, f);
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...m.pos[face.v[k]]); nor.push(...normals[f][k]); uv.push(...u[k]); group.count++; }
    faceOfTri.push(f, f);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mats = groups.map(gr => materialFor(gr.prop));
  groups.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
  materialCache.push(...mats);
  meshObj = new THREE.Mesh(g, mats); world.add(meshObj);
  for (const e of m.extras) world.add(extraMesh(e));
  buildOverlay(); dirty = true;
}
function materialFor() { const sheet = currentSheet(); return matOf(sheet.color3, sheet.normal3); }
function extraMesh(e) {
  const mat = new THREE.MeshStandardMaterial({ color: EXTRA[e.color], roughness: 0.9 }); materialCache.push(mat);
  let g;
  if (e.kind === 'disk') { g = new THREE.CircleGeometry(e.r, 24); g.rotateX(-Math.PI / 2); g.translate(...e.center); }
  else {
    const p = e.flip ? [...e.pts].reverse() : e.pts, pos = [];
    for (let i = 1; i < p.length - 1; i++) pos.push(...p[0], ...p[i], ...p[i + 1]);
    g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  }
  return new THREE.Mesh(g, mat);
}
// Selected islands (orange) and, while a strip is hovered, the faces that use it (blue).
function buildOverlay() {
  if (overlayObj) { world.remove(overlayObj); overlayObj.geometry.dispose(); overlayObj = null; }
  if (!meshObj) return;
  const m = meshOf(S.st), pos = [];
  let faces = [], mat = overlayMat;
  if (S.hoverStrip && !S.modal) {
    const strips = DEFAULT_STRIPS;
    for (const id of Object.keys(m.islands)) { const r = report(m, S.st.uv, id, strips); if (r.strip === S.hoverStrip) faces.push(...islandFaces(m, id)); }
    mat = hoverMat;
  } else for (const id of S.sel) if (m.islands[id]) faces.push(...islandFaces(m, id));
  if (!faces.length) { dirty = true; return; }
  for (const f of faces) { const v = m.faces[f].v; for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...m.pos[v[k]]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  overlayObj = new THREE.Mesh(g, mat); world.add(overlayObj); dirty = true;
}
// Only the UVs changed (while moving an island): update the buffer in place.
function updateUV3D() {
  if (!meshObj) return;
  const m = meshOf(S.st), a = meshObj.geometry.attributes.uv;
  m.faces.forEach((face, f) => { const u = uvFor(m, f); [0, 1, 2, 0, 2, 3].forEach((k, j) => a.setXY(f * 6 + j, u[k][0], u[k][1])); });
  a.needsUpdate = true; dirty = true;
}
// Stage 2: a sample board with every strip at its real size (2 m wide).
function buildBoard() {
  const st = S.st, { strips } = stripsOf(st.layout, st.pad), sheet = currentSheet();
  let map = sheet.color3, nmap = sheet.normal3;
  if (st.mip > 0) {
    const c = new THREE.CanvasTexture(mipCanvas(sheet, st.mip)); c.colorSpace = THREE.SRGBColorSpace; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.generateMipmaps = false; c.minFilter = THREE.LinearFilter;
    map = c; nmap = null; materialCache.push({ dispose: () => c.dispose() });
  }
  const mat = matOf(map, nmap); materialCache.push(mat);
  let y = 2.35;
  for (const s of strips) {
    if (s.y0 >= SIZE) break;
    const h = s.px / DENSITY, g = new THREE.PlaneGeometry(2, h), uv = g.attributes.uv;
    const v1 = Math.min(1, s.v1), v0 = Math.max(0, s.v0);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) > 0.5 ? v1 : v0);
    g.translate(0, y - h / 2, 0); world.add(new THREE.Mesh(g, mat)); y -= h + 0.04;
  }
}
function resize3D() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
new ResizeObserver(resize3D).observe(host);
(function loop() { requestAnimationFrame(loop); if (dirty) { renderer.render(scene3, camera); dirty = false; } })();

// Picking in 3D: LMB selects the island under the pointer.
const ray = new THREE.Raycaster();
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (S.modal) { confirmModal(); return; }
  if (!meshObj) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
  const hit = ray.intersectObject(meshObj)[0];
  const id = hit ? meshOf(S.st).faces[faceOfTri[hit.faceIndex]].island : null;
  pick(id, e.shiftKey);
});

// ─── UV Editor ───────────────────────────────────────────────────────────────
const uvc = $('#uv'), uvHost = $('#uv-host'), ctx = uvc.getContext('2d');
const V = { ox: 0, oy: 0, sc: 300 };
let uvDirty = true, pointer = { x: 0, y: 0, inUV: false };
const toScr = (u, v) => [V.ox + u * V.sc, V.oy + (1 - v) * V.sc];
const toUV = (x, y) => [(x - V.ox) / V.sc, 1 - (y - V.oy) / V.sc];
function fitUV() { const w = uvHost.clientWidth, h = uvHost.clientHeight; V.sc = Math.max(80, Math.min(h - 36, (w - 24) / 1.18)); V.ox = 14; V.oy = (h - V.sc) / 2; uvDirty = true; }
function resizeUV() { const w = uvHost.clientWidth, h = uvHost.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); uvc.width = w * dpr; uvc.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); fitUV(); }
new ResizeObserver(resizeUV).observe(uvHost);
const stripsNow = () => isBoard() ? stripsOf(S.st.layout, S.st.pad).strips : DEFAULT_STRIPS;
function drawUV() {
  const w = uvHost.clientWidth, h = uvHost.clientHeight, st = S.st, sheet = currentSheet();
  ctx.fillStyle = '#232323'; ctx.fillRect(0, 0, w, h);
  const board = isBoard(), src = board && st.mip > 0 ? mipCanvas(sheet, st.mip) : sheet.color;
  ctx.imageSmoothingEnabled = !(board && st.mip > 0);
  // The sheet repeats along U: tiles left and right are drawn dimmer.
  const k0 = board ? 0 : Math.floor(-V.ox / V.sc) - 1, k1 = board ? 0 : Math.ceil((w - V.ox) / V.sc);
  for (let k = k0; k <= k1; k++) {
    const [x, y] = toScr(k, 1);
    ctx.drawImage(src, x, y, V.sc, V.sc);
    if (k !== 0) { ctx.fillStyle = 'rgba(20,20,20,.5)'; ctx.fillRect(x, y, V.sc, V.sc); }
  }
  const [x0, y0] = toScr(0, 1);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, V.sc, V.sc);
  // Strip edges and names.
  const strips = stripsNow(), bleedAt = board && st.mip > 0 && st.pad < 2 ** st.mip;
  ctx.font = '11px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
  for (const s of strips) {
    if (s.y0 >= SIZE) continue;
    const [, ya] = toScr(0, s.v1), [, yb] = toScr(0, Math.max(0, s.v0));
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, ya + 0.5); ctx.lineTo(w, ya + 0.5); ctx.moveTo(0, yb + 0.5); ctx.lineTo(w, yb + 0.5); ctx.stroke(); ctx.setLineDash([]);
    if (S.hoverStrip === s.type || (S.hoverStripIndex === s.index && board)) { ctx.strokeStyle = '#4fc3ff'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, ya + 1, V.sc - 2, yb - ya - 2); ctx.lineWidth = 1; }
    if (bleedAt) { ctx.fillStyle = 'rgba(255,70,50,.8)'; ctx.fillRect(x0, ya - 2, V.sc, 4); ctx.fillRect(x0, yb - 2, V.sc, 4); }
    if (yb - ya > 11) {
      const label = `${t(typeName(s.type))} · ${s.px}`, tw = ctx.measureText(label).width;
      const lx = Math.max(4, x0 + 5);
      ctx.fillStyle = 'rgba(20,20,20,.72)'; ctx.fillRect(lx, (ya + yb) / 2 - 8, tw + 10, 16);
      ctx.fillStyle = '#e8e8e8'; ctx.fillText(label, lx + 5, (ya + yb) / 2);
    }
  }
  if (board) {
    const info = layoutInfo(st);
    if (info.used > SIZE) { ctx.fillStyle = '#ff6a50'; ctx.fillText(t('The strips do not fit: the last ones are cut off.'), x0 + 8, y0 + V.sc + 14); }
    uvDirty = false; return;
  }
  // Islands.
  const m = meshOf(st);
  const byArea = Object.entries(m.islands).map(([id, isl]) => { const b = bbox(st.uv, isl.faces); return [id, isl, (b.u1 - b.u0) * (b.v1 - b.v0)]; }).sort((a, b) => b[2] - a[2]);
  for (const pass of [0, 1]) for (const [id, isl] of byArea) {
    const sel = S.sel.has(id); if ((pass === 1) !== sel) continue;
    ctx.fillStyle = sel ? 'rgba(255,166,41,.28)' : 'rgba(255,255,255,.10)';
    ctx.strokeStyle = sel ? '#ffa629' : 'rgba(235,235,235,.85)';
    for (const f of isl.faces) {
      ctx.beginPath(); st.uv[f].forEach(([u, v], i) => { const [x, y] = toScr(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (sel || S.hoverIsland === id) {
      const b = bbox(st.uv, isl.faces), [cx, cy] = toScr(b.cu, b.cv), label = t(isl.name), tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15,15,15,.8)'; ctx.fillRect(cx - tw / 2 - 5, cy - 8, tw + 10, 16);
      ctx.fillStyle = sel ? '#ffc266' : '#fff'; ctx.fillText(label, cx - tw / 2, cy);
    }
  }
  uvDirty = false;
}
(function uvLoop() { requestAnimationFrame(uvLoop); if (uvDirty && S.st) drawUV(); })();

function pointInPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// Islands under a point, smallest first (small islands are drawn on top of big ones).
function islandsAt(u, v) {
  if (isBoard()) return [];
  const m = meshOf(S.st), out = [];
  for (const [id, isl] of Object.entries(m.islands)) if (isl.faces.some(f => pointInPoly([u, v], S.st.uv[f]))) { const b = bbox(S.st.uv, isl.faces); out.push([id, (b.u1 - b.u0) * (b.v1 - b.v0)]); }
  return out.sort((a, b) => a[1] - b[1]).map(a => a[0]);
}
const islandAt = (u, v) => islandsAt(u, v)[0] ?? null;
// Clicking again on overlapping islands cycles through them, as in Blender.
function islandToPick(u, v) {
  const list = islandsAt(u, v);
  if (list.length > 1 && S.sel.size === 1) { const i = list.indexOf([...S.sel][0]); if (i >= 0) return list[(i + 1) % list.length]; }
  return list[0] ?? null;
}
function pick(id, add) {
  if (step().id === 't2') return;
  if (!add) S.sel.clear();
  if (id) { if (add && S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); }
  uvDirty = true; buildOverlay(); renderProps();
}
let pan = null;
uvc.addEventListener('pointerdown', e => {
  const r = uvc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (e.button === 1) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY, ox: V.ox, oy: V.oy }; uvc.setPointerCapture(e.pointerId); return; }
  if (e.button === 2) { if (S.modal) cancelModal(); return; }
  if (e.button !== 0) return;
  if (S.modal) { confirmModal(); return; }
  const [u, v] = toUV(x, y);
  if (step().id === 't2') { answerQuiz(v); return; }
  if (isBoard()) { const s = stripAt(v, stripsNow()); if (s) { S.focusRow = s.index; renderProps(); } return; }
  pick(e.shiftKey ? islandAt(u, v) : islandToPick(u, v), e.shiftKey);
});
uvc.addEventListener('contextmenu', e => e.preventDefault());
uvc.addEventListener('auxclick', e => e.preventDefault());
window.addEventListener('pointerup', () => { pan = null; });
uvc.addEventListener('pointermove', e => {
  const r = uvc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  pointer = { x, y, inUV: true };
  if (pan) { V.ox = pan.ox + e.clientX - pan.x; V.oy = pan.oy + e.clientY - pan.y; uvDirty = true; return; }
  if (S.modal) return;
  const [u, v] = toUV(x, y), s = u > -50 && v >= 0 && v <= 1 ? stripAt(v, stripsNow()) : null;
  const hoverIsland = islandAt(u, v);
  const ht = isBoard() || step().id === 't2' || !hoverIsland ? s?.type ?? null : null;
  if (ht !== S.hoverStrip || hoverIsland !== S.hoverIsland) { S.hoverStrip = ht; S.hoverIsland = hoverIsland; S.hoverStripIndex = s?.index; uvDirty = true; buildOverlay(); }
  const tip = $('#uv-tip');
  if (s) { tip.hidden = false; tip.textContent = tr('{a} · {b} px · {c} m at 512 px/m', { a: t(typeName(s.type)), b: s.px, c: +(s.px / DENSITY).toFixed(4) }); } else tip.hidden = true;
});
uvc.addEventListener('pointerleave', () => { pointer.inUV = false; if (!S.modal && (S.hoverStrip || S.hoverIsland)) { S.hoverStrip = null; S.hoverIsland = null; S.hoverStripIndex = null; uvDirty = true; buildOverlay(); } $('#uv-tip').hidden = true; });
uvc.addEventListener('wheel', e => {
  e.preventDefault(); const r = uvc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, k = e.deltaY > 0 ? 1 / 1.15 : 1.15;
  const sc = Math.max(80, Math.min(6000, V.sc * k)), f = sc / V.sc; V.ox = x - (x - V.ox) * f; V.oy = y - (y - V.oy) * f; V.sc = sc; uvDirty = true;
}, { passive: false });

// ─── Transforms: G, S, R with X/Y, Ctrl snapping and typed numbers ───────────
function startModal(kind) {
  if (isBoard() || step().id === 't2') return;
  if (!S.sel.size) { msg('Select an island first: click it in the UV Editor or on the model.', true); return; }
  const m = meshOf(S.st), faces = [...S.sel].flatMap(id => islandFaces(m, id));
  const groups = [...S.sel].map(id => { const f = islandFaces(m, id), b = bbox(S.st.uv, f); return { faces: f, pu: b.cu, pv: b.cv }; });
  const b = bbox(S.st.uv, faces);
  const start = pointer.inUV ? [pointer.x, pointer.y] : toScr(b.cu, b.cv).map((v, i) => v + (i ? 0 : 60));
  S.modal = { kind, base: cloneUV(S.st.uv), faces, groups, pu: b.cu, pv: b.cv, start: [...start], cur: [...start], axis: null, typed: '', ctrl: false };
  S.hoverStrip = null; buildOverlay(); applyModal();
}
function applyModal() {
  const md = S.modal, st = S.st; if (!md) return;
  st.uv = cloneUV(md.base);
  const [pu, pv] = toScr(md.pu, md.pv), num = md.typed !== '' && md.typed !== '-' ? parseFloat(md.typed) : null;
  let readout = '';
  if (md.kind === 'G') {
    let du = (md.cur[0] - md.start[0]) / V.sc, dv = -(md.cur[1] - md.start[1]) / V.sc;
    if (num != null) { du = md.axis === 'Y' ? 0 : num / SIZE; dv = md.axis === 'Y' ? num / SIZE : 0; }
    if (md.axis === 'X') dv = 0; if (md.axis === 'Y') du = 0;
    if (md.ctrl) { const q = 8 / SIZE; du = Math.round(du / q) * q; dv = Math.round(dv / q) * q; }
    translate(st.uv, md.faces, du, dv); md.du = du; md.dv = dv;
    readout = `D: ${Math.round(du * SIZE)} px  ${Math.round(dv * SIZE)} px${md.axis ? ` (${md.axis === 'X' ? 'U' : 'V'})` : ''}`;
  } else if (md.kind === 'S') {
    const d0 = Math.hypot(md.start[0] - pu, md.start[1] - pv) || 1;
    let k = num ?? Math.hypot(md.cur[0] - pu, md.cur[1] - pv) / d0;
    if (md.ctrl && num == null) k = Math.round(k * 10) / 10;
    const ku = md.axis === 'Y' ? 1 : k, kv = md.axis === 'X' ? 1 : k;
    for (const g of (S.pivot === 'individual' ? md.groups : [{ faces: md.faces, pu: md.pu, pv: md.pv }])) scaleUV(st.uv, g.faces, ku, kv, g.pu, g.pv);
    readout = `Scale: ${k.toFixed(3)}${md.axis ? ` (${md.axis === 'X' ? 'U' : 'V'})` : ''}`;
  } else {
    const a0 = Math.atan2(-(md.start[1] - pv), md.start[0] - pu), a1 = Math.atan2(-(md.cur[1] - pv), md.cur[0] - pu);
    let deg = num ?? (a1 - a0) * 180 / Math.PI;
    if (md.ctrl && num == null) deg = Math.round(deg / 5) * 5;
    for (const g of (S.pivot === 'individual' ? md.groups : [{ faces: md.faces, pu: md.pu, pv: md.pv }])) rotateUV(st.uv, g.faces, deg, g.pu, g.pv);
    readout = `Rot: ${deg.toFixed(1)}°`;
  }
  const ro = $('#op-readout'); ro.hidden = false; ro.textContent = readout + (md.typed ? `  [${md.typed}]` : '');
  uvDirty = true; updateUV3D(); renderIslandPanel();
}
function endModal() { S.modal = null; $('#op-readout').hidden = true; uvDirty = true; buildOverlay(); }
function confirmModal() {
  const md = S.modal; if (!md) return;
  S.undo.push(JSON.stringify({ ...S.st, uv: md.base })); if (S.undo.length > 60) S.undo.shift(); S.redo = [];
  if (md.kind === 'G' && Math.abs(md.du || 0) >= 0.2 && Math.abs(md.dv || 0) < 2 / SIZE) S.st.flags.slid = true;
  endModal(); changed(); reportSelection();
}
function cancelModal() { if (!S.modal) return; S.st.uv = S.modal.base; endModal(); updateUV3D(); renderProps(); msg('Cancelled.'); }
window.addEventListener('pointermove', e => {
  if (!S.modal) return;
  const r = uvc.getBoundingClientRect(); S.modal.cur = [e.clientX - r.left, e.clientY - r.top]; S.modal.ctrl = e.ctrlKey || e.metaKey; applyModal();
});
function reportSelection() {
  const m = meshOf(S.st);
  for (const id of S.sel) { const r = report(m, S.st.uv, id, DEFAULT_STRIPS); if (!r.ok) { msg(problem(r, m), true); return; } }
  if (S.sel.size) msg(tr('✓ {n} fits its strip.', { n: [...S.sel].map(id => t(m.islands[id].name)).join(', ') }));
}

// ─── Operators ───────────────────────────────────────────────────────────────
function withSelection(fn, name) {
  if (!S.sel.size) { msg('Select an island first: click it in the UV Editor or on the model.', true); return; }
  pushUndo(); const m = meshOf(S.st);
  for (const id of S.sel) fn(m, islandFaces(m, id), id);
  changed(); msg(name);
}
const OPS = {
  faq: () => withSelection((m, f) => followActiveQuads(m, S.st.uv, f), 'Follow Active Quads: the islands are straight strips now.'),
  align: () => withSelection((m, f) => alignRotation(m, S.st.uv, f), 'Align Rotation: the islands are lined up with the axes.'),
  rotP: () => withSelection((m, f) => { const b = bbox(S.st.uv, f); rotateUV(S.st.uv, f, 90, b.cu, b.cv); }, 'Rotated 90°.'),
  rotM: () => withSelection((m, f) => { const b = bbox(S.st.uv, f); rotateUV(S.st.uv, f, -90, b.cu, b.cv); }, 'Rotated −90°.'),
  all: () => selectAll(true),
};
function selectAll(on) { if (isBoard()) return; S.sel = new Set(on ? Object.keys(meshOf(S.st).islands) : []); uvDirty = true; buildOverlay(); renderProps(); }
function fitTo(type) {
  withSelection((m, f) => fitToTrim(m, S.st.uv, f, stripOf(type)), tr('Fit to Trim: {s}.', { s: t(typeName(type)) }));
  reportSelection();
}

// ─── Quiz (step t2) ──────────────────────────────────────────────────────────
function answerQuiz(v) {
  const n = S.st.flags.quiz | 0; if (n >= QUIZ.length) return;
  const s = stripAt(v, DEFAULT_STRIPS); if (!s) return;
  if (s.type === QUIZ[n].a) { pushUndo(); S.st.flags.quiz = n + 1; msg(tr('✓ Right: {s}.', { s: t(typeName(s.type)) })); changed(); }
  else msg(tr('Not that one: {s} is for {u}.', { s: t(typeName(s.type)), u: t(TYPES[s.type].use).toLowerCase() }), true);
}

// ─── Properties panel ────────────────────────────────────────────────────────
function statRow(label, value, cls = '') { return `<div class="sb-stat ${cls}"><span>${esc(t(label))}</span><b data-no-i18n>${esc(value)}</b></div>`; }
function islandRows() {
  const m = meshOf(S.st), ids = S.sel.size ? [...S.sel] : [];
  if (!ids.length) return `<p class="sb-empty">${esc(t('Select an island in the UV Editor or on the model to see its texel density and its strip.'))}</p>`;
  return ids.slice(0, 4).map(id => {
    const r = report(m, S.st.uv, id, DEFAULT_STRIPS);
    return `<div class="isl-card${r.ok ? ' ok' : ''}"><strong>${esc(t(m.islands[id].name))}</strong>
      ${statRow('Texel density', `${Math.round(r.density)} px/m`, r.densityOk ? 'good' : 'bad')}
      ${statRow('Strip', r.strip ? t(typeName(r.strip)) : t('crosses an edge'), r.strip ? '' : 'bad')}
      ${statRow('Straight', r.straight ? '✓' : '✗', r.straight ? 'good' : 'bad')}
      ${statRow('Up is up', r.upright ? '✓' : '✗', r.upright ? 'good' : 'bad')}
      ${statRow('Not stretched', r.stretchOk ? '✓' : '✗', r.stretchOk ? 'good' : 'bad')}</div>`;
  }).join('') + (ids.length > 4 ? `<p class="sb-empty">${esc(tr('and {n} more', { n: ids.length - 4 }))}</p>` : '');
}
function renderIslandPanel() { const el = $('#island-panel-body'); if (el) el.innerHTML = islandRows(); }
function renderProps() {
  const st = S.st, id = step().id; let h = '';
  if (isBoard()) h += designerPanel();
  else {
    if (id === 't2') h += quizPanel();
    if (id !== 't2' && st.scene !== 'all') {
      h += `<div class="panel"><h4>${esc(t('Island'))}<small data-no-i18n>N › Island</small></h4><div id="island-panel-body">${islandRows()}</div></div>`;
      h += `<div class="panel"><h4>UV<small>${esc(t('selected islands'))}</small></h4><div class="tool-grid" data-no-i18n>
        <button type="button" data-op="faq">Follow Active Quads</button><button type="button" data-op="align">Align Rotation</button>
        <button type="button" data-op="rotP">Rotate +90°</button><button type="button" data-op="rotM">Rotate −90°</button>
        <button type="button" data-op="all">Select All <kbd>A</kbd></button></div></div>`;
      if (st.fit) h += `<div class="panel"><h4>Fit to Trim<small>${esc(t('add-on'))}</small></h4><div class="fit-grid">${DEFAULT_STRIPS.map(s => `<button type="button" data-fit="${s.type}"><i class="sw sw-${s.type}"></i>${esc(t(typeName(s.type)))}</button>`).join('')}</div></div>`;
      h += islandsListPanel();
    }
    if (st.scene === 'beam') h += modifiersPanel();
    if (id === 'p3') h += palettePanel();
  }
  $('#props').innerHTML = h;
}
function islandsListPanel() {
  const m = meshOf(S.st), rs = reports(S.st);
  return `<div class="panel"><h4>${esc(t('Islands'))}<small>${esc(tr('{a} of {b} placed', { a: rs.filter(r => r.ok).length, b: rs.length }))}</small></h4><ul class="isl-list">${rs.map(r => `<li class="${r.ok ? 'ok' : ''}${S.sel.has(r.id) ? ' sel' : ''}" data-isl="${r.id}"><i></i>${esc(t(m.islands[r.id].name))}</li>`).join('')}</ul></div>`;
}
function quizPanel() {
  const n = S.st.flags.quiz | 0;
  return `<div class="panel quiz"><h4>${esc(t('Question'))}<small>${Math.min(n + 1, QUIZ.length)} / ${QUIZ.length}</small></h4>${n < QUIZ.length ? `<p class="q">${esc(t(QUIZ[n].q))}</p>` : `<p class="q done">${esc(t('✓ All three right.'))}</p>`}<ol class="quiz-done">${QUIZ.slice(0, n).map(q => `<li>${esc(t(typeName(q.a)))}</li>`).join('')}</ol></div>`
    + `<div class="panel"><h4>${esc(t('The strips'))}</h4><ul class="strip-list">${DEFAULT_STRIPS.map(s => `<li><i class="sw sw-${s.type}"></i><span><b>${esc(t(typeName(s.type)))}</b> · ${s.px} px<br><small>${esc(t(TYPES[s.type].use))}</small></span></li>`).join('')}</ul></div>`;
}
function designerPanel() {
  const st = S.st, info = layoutInfo(st), used = info.used, cls = used === SIZE ? 'good' : 'bad';
  const rows = st.layout.map((s, i) => {
    const need = TYPES[s.type].m * DENSITY;
    return `<div class="ds-row${S.focusRow === i ? ' focus' : ''}"><i class="sw sw-${s.type}"></i>
      <select data-ds-type="${i}" aria-label="${esc(t('Strip'))}">${TYPE_IDS.map(tp => `<option value="${tp}"${tp === s.type ? ' selected' : ''}>${esc(t(typeName(tp)))}</option>`).join('')}</select>
      <select data-ds-px="${i}" aria-label="${esc(t('Height'))}" class="${s.px === need ? '' : 'wrong'}">${HEIGHTS.map(p => `<option value="${p}"${p === s.px ? ' selected' : ''}>${p}</option>`).join('')}</select>
      <span class="ds-need" title="${esc(t('Real size it needs'))}">${TYPES[s.type].m} m</span>
      <button type="button" data-ds-up="${i}" aria-label="${esc(t('Move up'))}">▲</button><button type="button" data-ds-down="${i}" aria-label="${esc(t('Move down'))}">▼</button><button type="button" data-ds-del="${i}" aria-label="${esc(t('Remove'))}">✕</button></div>`;
  }).join('');
  const missing = TYPE_IDS.filter(tp => !st.layout.some(s => s.type === tp));
  return `<div class="panel"><h4>${esc(t('Trim Sheet'))}<small>1024 × 1024 · 512 px/m</small></h4>
    <div class="ds-head"><span>${esc(t('Strip'))}</span><span>${esc(t('Height (px)'))}</span><span>${esc(t('Needs'))}</span></div>${rows}
    <div class="ds-add"><select id="ds-new">${TYPE_IDS.map(tp => `<option value="${tp}"${tp === missing[0] ? ' selected' : ''}>${esc(t(typeName(tp)))}</option>`).join('')}</select><select id="ds-new-px">${HEIGHTS.map(p => `<option${p === 32 ? ' selected' : ''}>${p}</option>`).join('')}</select><button type="button" id="ds-add">${esc(t('Add strip'))}</button></div>
    <label class="bl-row"><span>${esc(t('Padding'))}</span><select id="ds-pad">${PADS.map(p => `<option value="${p}"${p === st.pad ? ' selected' : ''}>${p} px</option>`).join('')}</select><em></em></label>
    ${statRow('Used', `${used} / ${SIZE} px`, cls)}${statRow('Clean down to mip', st.pad > 0 ? `${cleanMips(st.pad)} (${SIZE >> cleanMips(st.pad)} px)` : '0', st.pad >= 8 ? 'good' : 'bad')}
    <p class="sb-empty">${esc(t('Height in px = real size in m × 512. The sample board in the 3D view shows every strip 2 m wide at its real height.'))}</p></div>`;
}
function modifiersPanel() {
  const st = S.st, editable = step().id === 'b3';
  const opts = [['flat', 'Flat'], ['smooth', 'Smooth'], ['angle', 'Smooth by Angle'], ['weighted', 'Weighted Normal']];
  return `<div class="panel bl" data-no-i18n><h4>Modifiers<small>Properties › Modifiers</small></h4>
    <div class="bl-sec">Bevel</div>
    <label class="bl-row"><span>Width</span><input type="range" id="bevel" min="0.02" max="0.15" step="0.0025" value="${st.bevel}"${editable ? '' : ' disabled'}><em>${(st.bevel * 100).toFixed(1)} cm</em></label>
    <div class="bl-sec">Shading</div><div class="shade-grid">${opts.map(([k, n]) => `<button type="button" data-shade="${k}" aria-pressed="${st.shading === k}">${n}</button>`).join('')}</div></div>`;
}
function palettePanel() {
  return `<div class="panel"><h4>${esc(t('Sheet'))}<small>${esc(t('one material for all'))}</small></h4><div class="pal-grid">${Object.entries(PALETTES).map(([k, p]) => `<button type="button" data-pal="${k}" aria-pressed="${S.st.palette === k}"><i style="background:linear-gradient(90deg,rgb(${p.wood}) 50%,rgb(${p.stone}) 50%)"></i>${esc(t(p.name))}</button>`).join('')}</div></div>`;
}
$('#props').addEventListener('click', e => {
  const b = e.target.closest('button, li[data-isl]'); if (!b) return;
  const d = b.dataset;
  if (d.op) OPS[d.op]();
  else if (d.fit) fitTo(d.fit);
  else if (d.isl) pick(d.isl, e.shiftKey);
  else if (d.shade) { pushUndo(); S.st.shading = d.shade; changed(); msg({ flat: 'Shade Flat: every face has its own normal.', smooth: 'Shade Smooth: the big faces bend towards the chamfers.', angle: 'Smooth by Angle: the 45° chamfers stay sharp, like Flat here.', weighted: 'Weighted Normal: big faces stay flat, the chamfers carry the curve.' }[d.shade]); }
  else if (d.pal) { pushUndo(); S.st.palette = d.pal; changed(); }
  else if (d.dsUp || d.dsDown || d.dsDel) {
    pushUndo(); const L = S.st.layout, i = +(d.dsUp ?? d.dsDown ?? d.dsDel);
    if (d.dsDel != null) L.splice(i, 1);
    else { const j = d.dsUp != null ? i - 1 : i + 1; if (j >= 0 && j < L.length) [L[i], L[j]] = [L[j], L[i]]; }
    changed();
  } else if (b.id === 'ds-add') { pushUndo(); S.st.layout.push({ type: $('#ds-new').value, px: +$('#ds-new-px').value }); changed(); }
});
$('#props').addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.dsType != null) { pushUndo(); S.st.layout[+d.dsType].type = e.target.value; changed(); }
  else if (d.dsPx != null) { pushUndo(); S.st.layout[+d.dsPx].px = +e.target.value; changed(); }
  else if (e.target.id === 'ds-pad') { pushUndo(); S.st.pad = +e.target.value; changed(); }
  else if (e.target.id === 'bevel') { saveData(); }
});
let bevelGesture = false;
$('#props').addEventListener('input', e => {
  if (e.target.id !== 'bevel') return;
  if (!bevelGesture) { pushUndo(); bevelGesture = true; setTimeout(() => { bevelGesture = false; }, 600); }
  S.st.bevel = +e.target.value; if (S.st.autoUV) S.st.uv = solvedUV(meshOf(S.st));
  e.target.nextElementSibling.textContent = `${(S.st.bevel * 100).toFixed(1)} cm`;
  S.sel.clear(); build3D(); uvDirty = true; checkProgress(); const ip = $('#props .isl-list'); if (ip) ip.closest('.panel').outerHTML = islandsListPanel();
});

// ─── Headers ─────────────────────────────────────────────────────────────────
$('#pivot').addEventListener('change', e => { S.pivot = e.target.value; });
$('#mip').addEventListener('change', e => { S.st.mip = +e.target.value; changed(); });
function renderHeaders() {
  const st = S.st, id = step().id;
  $('#mip-field').hidden = !isBoard(); $('#mip').value = String(st.mip);
  $('#pivot-field').hidden = isBoard() || id === 't2' || id === 'p3';
  $('#pivot').value = S.pivot;
  $('#uv-title').textContent = isBoard() ? 'Image Editor' : 'UV Editor';
  const note = $('#mip-note'); note.hidden = !(isBoard() && st.mip > 0); note.textContent = tr('Showing mip {m} ({p} px)', { m: st.mip, p: SIZE >> st.mip });
}

// ─── Undo, storage, steps ────────────────────────────────────────────────────
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) { msg('Nothing to undo.'); return; } S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(); msg('Undo.'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo.'); }
const dataKey = () => `step:${stage().id}-${step().id}`;
function saveData() { store.set(dataKey(), S.st); }
function loadData() {
  const saved = store.get(dataKey(), null), fresh = startState(step());
  const ok = saved && typeof saved === 'object' && saved.scene === fresh.scene && (!fresh.uv || (Array.isArray(saved.uv) && saved.uv.length === fresh.uv.length));
  S.st = ok ? { ...fresh, ...saved, flags: { ...saved.flags } } : fresh;
}
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${stage().steps[i].id}`;
const stepDone = i => i === S.step ? !!step().check(S.st) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.className = `guide${n === 3 ? ' three' : ''}`;
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
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); S.sel.clear(); changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st); changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null, lastCard = '';
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) { const title = step().title; setTimeout(() => { if (step().title === title) msg(tr('✓ Step done: {s}', { s: t(title) })); }, 900); }
  const key = `${S.stageIndex}|${S.step}|${ok}|${document.documentElement.lang}`;
  if (key !== lastCard) { renderGuide(); renderStepCard(); lastCard = key; }
  lastOk = ok;
}
function changed(save = true) {
  if (save) saveData();
  for (const id of [...S.sel]) if (isBoard() || !meshOf(S.st).islands[id]) S.sel.delete(id);
  build3D(); renderHeaders(); renderProps(); uvDirty = true; checkProgress();
}
function enterStep() {
  loadData(); S.undo = []; S.redo = []; S.sel.clear(); S.modal = null; S.hoverStrip = null; S.focusRow = null;
  lastOk = null; lastCard = ''; lastOk = stepDone(S.step);
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  renderStageSwitch(); frame(S.st.scene); fitUV(); changed(false);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); renderProps(); uvDirty = true; checkProgress(); });

// ─── Keyboard ────────────────────────────────────────────────────────────────
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  const md = S.modal;
  if (md) {
    const k = e.key;
    if (k === 'Escape') { cancelModal(); e.preventDefault(); return; }
    if (k === 'Enter') { confirmModal(); e.preventDefault(); return; }
    if (k === 'x' || k === 'X' || k === 'y' || k === 'Y') { if (md.kind !== 'R') { const a = k.toUpperCase(); md.axis = md.axis === a ? null : a; applyModal(); } e.preventDefault(); return; }
    if (/^[0-9.]$/.test(k) || (k === '-' && md.typed === '')) { md.typed += k; applyModal(); e.preventDefault(); return; }
    if (k === 'Backspace') { md.typed = md.typed.slice(0, -1); applyModal(); e.preventDefault(); return; }
    if (k === 'Control' || k === 'Meta') { md.ctrl = true; applyModal(); }
    return;
  }
  if (e.target.closest('input, select, textarea') || !S.hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
  if (ctrl && low === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  else if (ctrl && low === 'y') { redo(); e.preventDefault(); }
  else if (ctrl) return;
  else if (low === 'g') { startModal('G'); e.preventDefault(); }
  else if (low === 's') { startModal('S'); e.preventDefault(); }
  else if (low === 'r') { startModal('R'); e.preventDefault(); }
  else if (low === 'a') { selectAll(!e.altKey); e.preventDefault(); }
  else if (e.key === 'Home') { fitUV(); frame(S.st.scene); e.preventDefault(); }
});
document.addEventListener('keyup', e => { if (S.modal && (e.key === 'Control' || e.key === 'Meta')) { S.modal.ctrl = false; applyModal(); } });
uvc.addEventListener('contextmenu', e => { if (S.modal) { e.preventDefault(); cancelModal(); } });
canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (S.modal) cancelModal(); });

// ─── Start ───────────────────────────────────────────────────────────────────
resizeUV(); resize3D(); enterStep();
// For tests and debugging.
window.__trim = { debugReports: () => JSON.stringify(reports(S.st).filter(r => !r.ok)), S, STAGES, islandFaces: id => islandFaces(meshOf(S.st), id), strip: type => stripOf(type), solve: () => { step().solve(S.st); changed(); }, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, select: ids => { S.sel = new Set(ids); changed(false); }, toScr, V };
