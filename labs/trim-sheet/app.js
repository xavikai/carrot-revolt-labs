// Trim Sheet Lab: a Blender-style UV Editor over a medieval trim sheet, with a live 3D view.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { SIZE, DENSITY, TYPES, TYPE_IDS, HEIGHTS, PADS, PALETTES, DEFAULT_STRIPS, stripsOf, stripAt, stripOf, cleanMips } from './sheet.js?v=1';
import { paintSheet, mip, fields, bakeNormal, bakeID, aoCurvature, grayCanvas, composeLayers, flipGreen } from './paint.js?v=3';
import { report, problem, islandFaces, bbox, cloneUV, translate, scale as scaleUV, rotate as rotateUV, followActiveQuads, alignRotation, fitToTrim, density, cornerNormals } from './uv.js?v=2';
import { propOf, solvedUV } from './props.js?v=2';
import { STAGES, QUIZ, startState, meshOf, layoutInfo, reports, MESH_SCENES } from './stages.js?v=3';
import { PLATFORMS, PLATFORM_IDS, TD_STEPS, screenPxPerM, targetTD, platformTD, sharpness, SHEET_SIZES, sheetNeed, rightSheet, setMB, PROJECTS, SET_METRES, padFor } from './plan.js?v=1';
import { DEPTH, MAX_H, PLANE_M, MATERIALS, MATERIAL_OF, normalReport, idReport, ENGINES, PAINTER_MAPS, MAP_NAMES, ID_SOURCES, DIAG, painterReport, SMART, layerReport, wearReport, EXPORTS } from './bake.js?v=1';
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
const isMesh = () => MESH_SCENES.has(S.st.scene);
const isSpecial = () => !isMesh() && !isBoard();
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
const CAMS = { platform: [[0, 1.2, 2.5], [0, 1.2, 0]], sheetsize: [[0, 1.4, 3.8], [0, 1.2, 0]], highpoly: [[2.4, 2.0, 4.8], [0, 1.25, 0]], bake: [[1.4, 1.7, 4.9], [0, 1.25, 0]], painter: [[1.4, 1.7, 4.9], [0, 1.25, 0]], wall: [[1.8, 1.7, 6.2], [0, 0.95, 0]], column: [[1.9, 1.6, 3.4], [0, 0.7, 0]], chest: [[1.6, 1.3, 2.1], [0, 0.25, 0]], beam: [[2.3, 2.0, 3.9], [0, 0.6, 0]], all: [[0.5, 3.5, 9.6], [0, 0.5, -0.1]], board: [[0, 1.4, 3.8], [0, 1.2, 0]] };
function frame(kind) { const [p, tg] = CAMS[kind] || CAMS.wall; camera.fov = 35; camera.updateProjectionMatrix(); camera.position.set(...p); controls.target.set(...tg); controls.update(); if (kind === 'platform') gameCamera(); dirty = true; }
const matOf = (map, normalMap) => new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.82, metalness: 0, side: THREE.FrontSide });
const overlayMat = new THREE.MeshBasicMaterial({ color: 0xffa629, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
const hoverMat = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
const EXTRA = { stone: 0xb49c78, wood: 0x6e4a2c };
let materialCache = [];

function clearWorld() { for (const o of [...world.children]) { world.remove(o); if (!o.userData.shared) o.geometry?.dispose(); } materialCache.forEach(m => m.dispose()); materialCache = []; }
const uvFor = (m, f) => S.st.uv[f];
function build3D() {
  clearWorld(); overlayObj = null; meshObj = null; faceOfTri = []; scene3.environmentIntensity = 0.55; sun.intensity = 2.2; sun.position.set(-3, 5, 4);
  if (isBoard()) { buildBoard(); dirty = true; return; }
  if (isSpecial()) { buildSpecial(); dirty = true; return; }
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
function buildBoard(mapOver = null, nmapOver = null) {
  const st = S.st, { strips } = stripsOf(st.layout, st.pad), sheet = currentSheet();
  let map = mapOver ?? sheet.color3, nmap = mapOver ? nmapOver : sheet.normal3;
  if (st.mip > 0 && !mapOver) {
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
  if (isSpecial()) { drawSpecial(w, h); uvDirty = false; return; }
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
  if (!isMesh()) return [];
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
  if (isSpecial()) return;
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
  if (isSpecial()) { $('#uv-tip').hidden = true; return; }
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
  if (!isMesh() || step().id === 't2') return;
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
function selectAll(on) { if (!isMesh()) return; S.sel = new Set(on ? Object.keys(meshOf(S.st).islands) : []); uvDirty = true; buildOverlay(); renderProps(); }
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
  if (isSpecial()) h += specialPanel();
  else if (isBoard()) h += designerPanel();
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


// ─── Texel density, high poly, bake and Painter: scenes without UV islands ───
const PAD8 = 8;
const imgCache = new Map();
function cached(key, make) { if (!imgCache.has(key)) { if (imgCache.size > 40) imgCache.clear(); imgCache.set(key, make()); } return imgCache.get(key); }
const texMap = new WeakMap();
function tex(c, color = true) { let x = texMap.get(c); if (!x) { x = new THREE.CanvasTexture(c); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; x.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; texMap.set(c, x); } return x; }
const canvasN = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const GOOD_BAKE = { type: 'normal', s2a: true, extrusion: 0.06, rayDist: 0, size: SIZE, swizzleG: '+Y', margin: 16, overhang: true };
const normalImg = b => cached('n:' + JSON.stringify(b), () => bakeNormal(stripsLayout, PAD8, b, DEPTH));
const goodNormal = () => normalImg(GOOD_BAKE);
const idImg = b => cached('id:' + JSON.stringify(b), () => bakeID(stripsLayout, PAD8, b, b.mats || {}, MATERIALS));
const aoImg = () => cached('ao', () => grayCanvas(stripsLayout, PAD8, aoCurvature(stripsLayout, PAD8).ao));
const cvImg = () => cached('cv', () => grayCanvas(stripsLayout, PAD8, aoCurvature(stripsLayout, PAD8).cv, true));
const goodID = () => idImg({ type: 'diffuse', s2a: true, direct: false, indirect: false, color: true, mats: Object.fromEntries(TYPE_IDS.map(t => [t, MATERIAL_OF[t]])) });
const colorImg = layers => cached('c:' + JSON.stringify(layers) + S.st.palette, () => composeLayers(stripsLayout, PAD8, layers, S.st.palette));
// The colour sheet at another texel density: fewer or more pixels for the same metres.
const tdSheet = td => cached('td:' + td + S.st.palette, () => { const src = sheetFor(stripsLayout, PAD8, S.st.palette).color, n = Math.min(2048, SIZE * td / DENSITY), c = canvasN(n); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, n, n); return c; });

// Platform step: the 3D view becomes the game camera (its FOV, at its distance).
const platformNow = () => { const st = S.st, P = PLATFORMS[st.platform], d = st.d ?? P.d; return { P, d, px: screenPxPerM(P.H, P.fov, d) }; };
function gameCamera() { if (S.st?.scene !== 'platform') return; const { P, d } = platformNow(); camera.fov = P.fov; camera.updateProjectionMatrix(); camera.position.set(0, 1.25, d); controls.target.set(0, 1.25, 0); controls.update(); dirty = true; }

const PLANE_TOP = 2.25;
function buildSpecial() {
  const st = S.st, raking = st.scene === 'bake' || st.scene === 'highpoly'; scene3.environmentIntensity = raking ? 0.18 : 0.55; sun.intensity = raking ? 3 : 2.2; sun.position.set(raking ? -1.5 : -3, raking ? 6 : 5, raking ? 2.2 : 4);
  const sheet = sheetFor(stripsLayout, PAD8, st.palette);
  if (st.scene === 'platform') { gameCamera(); const t = tex(tdSheet(st.td)); t.magFilter = THREE.LinearFilter; buildBoard(t, sheet.normal3); return; }
  if (st.scene === 'sheetsize') { buildBoard(); return; }
  if (st.scene === 'highpoly') { buildHigh(false, st.overhang); buildLowPlane(st.planeM, null); return; }
  if (st.scene === 'bake') {
    if (st.view === 'high') { buildHigh(st.image === 'id', true); buildLowPlane(PLANE_M, st.bake.s2a ? st.bake.extrusion : null); return; }
    const b = st.baked.normal, showId = st.image === 'id' && st.baked.id;
    if (showId) { addPlane(new THREE.MeshBasicMaterial({ map: tex(idImg(st.baked.id)) })); return; }
    let n = null; if (b && b.type === 'normal') { n = normalImg(b); if (ENGINES[st.engine].dx) n = cached('flip:' + JSON.stringify(b), () => flipGreen(n)); }
    addPlane(new THREE.MeshStandardMaterial({ color: 0xbdb6aa, roughness: 0.55, normalMap: n ? tex(n, false) : null, normalScale: new THREE.Vector2(1.6, 1.6) }));
    return;
  }
  if (st.scene === 'painter') {
    const ok = st.pbaked && painterReport(st.pbaked).ok;
    if (!ok) { addPlane(new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.7 })); return; }
    const map = st.layers.length ? tex(colorImg(st.layers)) : null;
    addPlane(new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0x9a9a9a, roughness: 0.75, normalMap: tex(goodNormal(), false) }));
  }
}
// The low poly: one quad, 2 × 2 m, with the whole sheet on it.
function addPlane(mat) { materialCache.push(mat); const g = new THREE.PlaneGeometry(PLANE_M, PLANE_M); g.translate(0, PLANE_TOP - PLANE_M / 2, 0); world.add(new THREE.Mesh(g, mat)); }
// The high poly, as a displaced grid of the sheet's height at real scale. Three copies when it extends past the edges.
function highGeometry(idColors, overhang) {
  const F = fields(stripsLayout, PAD8), cols = 256, rows = 512, N = F.N, E = 14, pos = [], col = [], idx = [];
  for (let r = 0; r <= rows; r++) {
    const y = Math.min(N - 1, Math.round(r / rows * (N - 1))), si = F.row[y], type = si >= 0 ? F.type[si] : null, c = type ? (idColors ? MATERIALS[S.st.mats[type] || 'none'].id : [190, 188, 184]) : [120, 120, 120];
    for (let k = 0; k <= cols; k++) {
      const x = Math.min(N - 1, Math.round(k / cols * (N - 1)));
      let h = type ? F.H[y * N + x] * DEPTH[type] : 0;
      if (!overhang) { const e = Math.min(x, N - 1 - x); if (e < E) h *= (e / E) ** 2 * (3 - 2 * e / E); }
      pos.push(-PLANE_M / 2 + k / cols * PLANE_M, PLANE_TOP - r / rows * PLANE_M, h); col.push(c[0] / 255, c[1] / 255, c[2] / 255);
    }
  }
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const a = r * (cols + 1) + k, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const highCache = new Map();
function buildHigh(idColors, overhang) {
  const key = `${idColors ? JSON.stringify(S.st.mats) : 'clay'}|${overhang}`;
  if (!highCache.has(key)) { if (highCache.size > 6) { for (const g of highCache.values()) g.dispose(); highCache.clear(); } highCache.set(key, highGeometry(idColors, overhang)); }
  const g = highCache.get(key), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: idColors ? 1 : 0.55 }), side = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, transparent: true, opacity: 0.45 });
  materialCache.push(mat, side);
  const keep = m => { m.geometry = g; m.userData.shared = true; return m; };
  world.add(keep(new THREE.Mesh(g, mat)));
  if (overhang) for (const dx of [-PLANE_M, PLANE_M]) { const m = keep(new THREE.Mesh(g, side)); m.position.x = dx; world.add(m); }
}
// The low plane of a given size from the top-left corner, with the strip bands of the sheet; and the cage.
function buildLowPlane(size, cage) {
  const x0 = -PLANE_M / 2, mat = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }); materialCache.push(mat);
  const g = new THREE.PlaneGeometry(size, size); g.translate(x0 + size / 2, PLANE_TOP - size / 2, -0.002); world.add(new THREE.Mesh(g, mat));
  const pts = [], line = (a, b) => pts.push(...a, ...b);
  const z = 0.002; line([x0, PLANE_TOP, z], [x0 + size, PLANE_TOP, z]); line([x0 + size, PLANE_TOP, z], [x0 + size, PLANE_TOP - size, z]); line([x0 + size, PLANE_TOP - size, z], [x0, PLANE_TOP - size, z]); line([x0, PLANE_TOP - size, z], [x0, PLANE_TOP, z]);
  for (const s of DEFAULT_STRIPS) for (const yy of [s.y0, s.y1]) { const y = PLANE_TOP - yy / SIZE * size; line([x0, y, z], [x0 + size, y, z]); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const lm = new THREE.LineBasicMaterial({ color: 0x4fc3ff }); materialCache.push(lm); world.add(new THREE.LineSegments(lg, lm));
  if (cage != null) { const cm = new THREE.MeshBasicMaterial({ color: 0xffa629, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }); materialCache.push(cm); const cg = new THREE.PlaneGeometry(PLANE_M, PLANE_M); cg.translate(0, PLANE_TOP - PLANE_M / 2, cage); world.add(new THREE.Mesh(cg, cm)); }
}

// Left editor for these scenes.
function sheetSquare() { const [x, y] = toScr(0, 1); return [x, y, V.sc]; }
function drawTiles(c, { dimSides = true, seams = false } = {}) {
  const w = uvHost.clientWidth, k0 = Math.floor(-V.ox / V.sc) - 1, k1 = Math.ceil((w - V.ox) / V.sc);
  ctx.imageSmoothingEnabled = true;
  for (let k = k0; k <= k1; k++) { const [x, y] = toScr(k, 1); ctx.drawImage(c, x, y, V.sc, V.sc); if (k !== 0 && dimSides) { ctx.fillStyle = 'rgba(20,20,20,.45)'; ctx.fillRect(x, y, V.sc, V.sc); } if (seams) { ctx.strokeStyle = '#ff5a40'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + V.sc); ctx.stroke(); ctx.lineWidth = 1; } }
  const [x0, y0] = toScr(0, 1); ctx.strokeStyle = '#fff'; ctx.strokeRect(x0 + 0.5, y0 + 0.5, V.sc, V.sc);
}
function caption(lines, x = 12, y = 22) { ctx.font = '12px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle'; for (const [i, l] of lines.entries()) { const [txt, col = '#e8e8e8'] = Array.isArray(l) ? l : [l]; const tw = ctx.measureText(txt).width; ctx.fillStyle = 'rgba(15,15,15,.78)'; ctx.fillRect(x - 5, y + i * 20 - 9, tw + 10, 18); ctx.fillStyle = col; ctx.fillText(txt, x, y + i * 20); } }
const VERDICT_COL = { blurry: '#ff6a50', wasted: '#ffb04a', sharp: '#7fd18b' };
function drawSpecial(w, h) {
  const st = S.st;
  if (st.scene === 'platform') return drawLoupe(w, h);
  if (st.scene === 'sheetsize') return drawSizes(w, h);
  if (st.scene === 'highpoly') {
    if (step().id === 'h1') {
      const p = st.planeM, img = cached('proj:' + p, () => { const c = canvasN(SIZE), g = c.getContext('2d'), src = goodNormal(), cover = SIZE * p / PLANE_M; g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, SIZE, SIZE); if (cover <= SIZE) g.drawImage(src, 0, 0, cover, cover, 0, 0, SIZE, SIZE); else g.drawImage(src, 0, 0, SIZE, SIZE, 0, 0, SIZE * SIZE / cover, SIZE * SIZE / cover); return c; });
      drawTiles(img);
      const [x0, y0, sc] = sheetSquare(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(79,195,255,.9)';
      for (const s of DEFAULT_STRIPS) for (const yy of [s.y0, s.y1]) { const y = y0 + yy / SIZE * sc; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + sc, y); ctx.stroke(); }
      ctx.setLineDash([]);
      const td = Math.round(SIZE / p), ok = p === PLANE_M;
      caption([tr('Bake preview: plane {p} m', { p }), [tr('Density of the bake: {d} px/m (plan: 512)', { d: td }), ok ? '#7fd18b' : '#ff6a50'], [t('Blue dashes: the strips of the plan'), '#8fd0ff']]);
    } else {
      drawTiles(normalImg({ ...GOOD_BAKE, overhang: st.overhang }), { dimSides: false, seams: !st.overhang });
      caption([t('Tiled preview of the bake (three repeats in U)'), st.overhang ? [t('No seam: the pieces continue past the edges.'), '#7fd18b'] : [t('Red: seams where the pieces end at the edge of the plane.'), '#ff6a50']]);
    }
    return;
  }
  if (st.scene === 'bake') {
    const showId = st.image === 'id', b = showId ? st.baked.id : st.baked.normal;
    if (!b) { caption([t('Nothing baked yet: set the bake and press Bake.'), [t('The image is an empty 1024 × 1024 texture.'), '#aaa']], 16, 30); const [x0, y0, sc] = sheetSquare(); ctx.strokeStyle = '#666'; ctx.strokeRect(x0, y0, sc, sc); return; }
    const img = showId ? idImg(b) : b.type === 'normal' ? normalImg(b) : idImg({ ...b, type: 'combined', direct: true, indirect: true, color: false, mats: {} });
    drawTiles(img); const r = showId ? idReport(b, b.mats) : normalReport(b); if (!showId && r.dx !== ENGINES[st.engine].dx) r.ok = false;
    caption([showId ? t('ID map (Diffuse, baked)') : tr('{t} map, baked at {s} px', { t: b.type === 'normal' ? 'Normal' : 'Combined', s: b.size }), r.ok ? [t('✓ Clean bake'), '#7fd18b'] : [t('Problems: see the side panel'), '#ff6a50']]);
    return;
  }
  if (st.scene === 'painter') {
    const ok = st.pbaked && painterReport(st.pbaked).ok, img = st.image;
    if (!ok) { caption([t('Bake the mesh maps first (Texture Set Settings › Bake Mesh Maps).')], 16, 30); return; }
    const c = img === 'id' ? goodID() : img === 'ao' ? aoImg() : img === 'curvature' ? cvImg() : img === 'normal' ? goodNormal() : st.layers.length ? colorImg(st.layers) : null;
    if (!c) { caption([t('No layers: the material is empty.')], 16, 30); return; }
    drawTiles(c); caption([{ id: 'ID', ao: 'Ambient Occlusion', curvature: 'Curvature', normal: 'Normal', color: 'Base Color' }[img]]);
  }
}
function drawLoupe(w, h) {
  const st = S.st, { P, d, px } = platformNow(), sv = sharpness(st.td, px), src = sheetFor(stripsLayout, PAD8, st.palette).color, plank = stripOf('plank');
  const M = 0.25, texN = Math.max(2, Math.round(M * st.td)), scrN = Math.max(2, Math.round(M * px));
  const A = cached(`la:${texN}:${st.palette}`, () => { const c = canvasN(texN), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 40, plank.y0, M * DENSITY, M * DENSITY, 0, 0, texN, texN); return c; });
  const B = cached(`lb:${texN}:${scrN}:${st.palette}`, () => { const c = canvasN(scrN), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(A, 0, 0, scrN, scrN); return c; });
  const Q = Math.max(80, Math.min(h - 120, (w - 60) / 2)), y = 64;
  ctx.imageSmoothingEnabled = false; ctx.drawImage(A, 20, y, Q, Q); ctx.drawImage(B, 40 + Q, y, Q, Q); ctx.imageSmoothingEnabled = true;
  ctx.strokeStyle = '#888'; ctx.strokeRect(20.5, y + 0.5, Q, Q); ctx.strokeStyle = VERDICT_COL[sv.verdict]; ctx.lineWidth = 3; ctx.strokeRect(40 + Q, y, Q, Q); ctx.lineWidth = 1;
  ctx.font = '12px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ddd';
  ctx.fillText(tr('Texture: {n} × {n} texels', { n: texN }), 20, y - 14); ctx.fillText(tr('On screen: {n} × {n} pixels', { n: scrN }), 40 + Q, y - 14);
  caption([tr('25 × 25 cm of planks at {d} m', { d: +d.toFixed(2) }), [tr('{k} texels per screen pixel: {v}', { k: sv.k.toFixed(2), v: t(sv.verdict) }), VERDICT_COL[sv.verdict]]], 20, y + Q + 26);
}
function drawSizes(w, h) {
  const st = S.st, side = s => ({ 512: 0.34, 1024: 0.5, 2048: 0.72, 4096: 1 })[s], colW = (w - 40) / 3, S0 = Math.min(colW - 20, h - 110);
  PROJECTS.forEach((p, i) => {
    const td = platformTD(p.platform), pick = st.picks[p.id], need = sheetNeed(td, pick), sz = S0 * side(pick), x = 20 + i * colW + (colW - sz) / 2, y = 56;
    ctx.fillStyle = '#2d2d2d'; ctx.fillRect(x, y, sz, sz);
    const used = Math.min(1, need.px / pick); ctx.fillStyle = need.fits ? 'rgba(127,209,139,.55)' : 'rgba(127,209,139,.35)'; ctx.fillRect(x, y, sz, sz * used);
    for (let k = 1; k < 8; k++) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y + sz * used * k / 8, sz, 1); }
    if (!need.fits) { const over = sz * (need.px / pick - 1); ctx.fillStyle = 'rgba(255,90,64,.6)'; ctx.fillRect(x, y + sz, sz, Math.min(over, h - y - sz - 50)); }
    ctx.strokeStyle = '#ddd'; ctx.strokeRect(x + 0.5, y + 0.5, sz, sz);
    ctx.font = '12px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ddd'; ctx.textAlign = 'center';
    ctx.fillText(t(PLATFORMS[p.platform].name), 20 + i * colW + colW / 2, 22); ctx.fillText(`${td} px/m · ${pick} px`, 20 + i * colW + colW / 2, 40);
    const good = pick === rightSheet(td); ctx.fillStyle = good ? '#7fd18b' : need.fits ? '#ffb04a' : '#ff6a50';
    ctx.fillText(t(good ? 'right size' : need.fits ? 'fits, but too big' : 'does not fit'), 20 + i * colW + colW / 2, Math.min(h - 20, y + S0 + 24)); ctx.textAlign = 'left';
  });
}

// Side panel for these scenes.
const pressed = v => `aria-pressed="${!!v}"`;
const cm = m => `${+(m * 100).toFixed(1)} cm`;
function specialPanel() {
  const st = S.st, id = step().id;
  if (st.scene === 'platform') {
    const { P, d, px } = platformNow(), sv = sharpness(st.td, px);
    return `<div class="panel brief"><h4>${esc(t('Project'))}</h4><p class="sb-empty">${esc(t('A third-person castle game for PC: 1440p, FOV 60°, camera about 2.5 m from the walls.'))}</p></div>
      <div class="panel"><h4>${esc(t('Platform'))}<small>${esc(tr('{n} of 3 compared', { n: Math.min(3, (st.flags.visited || []).length) }))}</small></h4><div class="plat-grid">${PLATFORM_IDS.map(k => `<button type="button" data-sp="platform" data-v="${k}" ${pressed(st.platform === k)}><b>${esc(t(PLATFORMS[k].name))}</b><small data-no-i18n>${PLATFORMS[k].H}p · FOV ${PLATFORMS[k].fov}° · ${PLATFORMS[k].d} m</small></button>`).join('')}</div><p class="sb-empty">${esc(t(P.note))}</p></div>
      <div class="panel"><h4>${esc(t('Camera'))}</h4>${statRow('Screen height (H)', `${P.H} px`)}${statRow('Field of view (FOV)', `${P.fov}°`)}
        <label class="bl-row"><span>${esc(t('Distance (d)'))}</span><input type="range" data-sp="dist" min="0.5" max="8" step="0.25" value="${d}"><em>${d} m</em></label>
        ${statRow('1 m on screen', `${Math.round(px)} px`)}<p class="formula" data-no-i18n>H ÷ (2 · d · tan(FOV ÷ 2)) = ${P.H} ÷ (2 · ${d} · ${Math.tan(P.fov * Math.PI / 360).toFixed(3)}) = ${Math.round(px)}</p></div>
      <div class="panel"><h4>${esc(t('Target texel density'))}</h4><div class="td-grid">${TD_STEPS.map(v => `<button type="button" data-sp="td" data-v="${v}" ${pressed(st.td === v)}>${v}</button>`).join('')}</div>
        ${statRow('Texels per screen pixel', sv.k.toFixed(2), sv.verdict === 'sharp' ? 'good' : 'bad')}${statRow('Verdict', t(sv.verdict), sv.verdict === 'sharp' ? 'good' : 'bad')}${statRow('Suggested (power of two ≥ screen px)', `${targetTD(px)} px/m`)}</div>`;
  }
  if (st.scene === 'sheetsize') {
    return `<div class="panel"><h4>${esc(t('The castle set'))}<small data-no-i18n>${SET_METRES} m</small></h4><ul class="strip-list">${DEFAULT_STRIPS.map(s => `<li><i class="sw sw-${s.type}"></i><span><b>${esc(t(typeName(s.type)))}</b> · ${TYPES[s.type].m} m</span></li>`).join('')}</ul></div>`
      + PROJECTS.map(p => { const td = platformTD(p.platform), pick = st.picks[p.id], n = sheetNeed(td, pick), good = pick === rightSheet(td);
        return `<div class="panel"><h4>${esc(t(PLATFORMS[p.platform].name))}<small data-no-i18n>${td} px/m</small></h4>
          <label class="bl-row"><span>${esc(t('Sheet'))}</span><select data-sp="pick" data-v="${p.id}">${SHEET_SIZES.map(z => `<option value="${z}"${z === pick ? ' selected' : ''}>${z} × ${z}</option>`).join('')}</select><em></em></label>
          ${statRow('Rows needed', `${Math.round(n.px)} / ${pick} px`, n.fits ? 'good' : 'bad')}${statRow('Padding per strip', `${padFor(pick)} px`)}${statRow('Repeats every', `${n.repeat} m`)}${statRow('Memory (colour + normal + ORM)', `${setMB(pick).toFixed(1)} MB`, good ? 'good' : '')}</div>`; }).join('')
      + `<p class="sb-empty pad">${esc(t('Rows needed = 1.875 m × density + 8 strips × padding.'))}</p>`;
  }
  if (st.scene === 'highpoly') {
    const td = Math.round(SIZE / st.planeM);
    return `<div class="panel bl"><h4>${esc(t('Low plane'))}<small data-no-i18n>Add › Mesh › Plane</small></h4>
      <label class="bl-row"><span data-no-i18n>Size</span><select data-sp="plane">${[0.5, 1, 2, 4].map(v => `<option value="${v}"${v === st.planeM ? ' selected' : ''}>${v} m</option>`).join('')}</select><em></em></label>
      ${statRow('Sheet ÷ density', `${SIZE} px ÷ ${DENSITY} px/m = ${PLANE_M} m`)}${statRow('Density this plane gives', `${td} px/m`, td === DENSITY ? 'good' : 'bad')}</div>
      <div class="panel bl"><h4>${esc(t('High poly'))}<small data-no-i18n>Modifiers › Array</small></h4>
      <label class="bl-check"><input type="checkbox" data-sp="overhang"${st.overhang ? ' checked' : ''}${id === 'h1' ? ' disabled' : ''}> <span>${esc(t('Extend past the edges (Array, offset 2 m)'))}</span></label>
      <table class="hp-table"><tr><th>${esc(t('Strip'))}</th><th>${esc(t('Height'))}</th><th>${esc(t('Rises'))}</th></tr>${DEFAULT_STRIPS.map(s => `<tr><td><i class="sw sw-${s.type}"></i>${esc(t(typeName(s.type)))}</td><td data-no-i18n>${cm(TYPES[s.type].m)}</td><td data-no-i18n>${cm(DEPTH[s.type])}</td></tr>`).join('')}</table>
      <p class="sb-empty">${esc(t('Model every piece at its real size inside its band. Keep the relief shallow: a normal map stores directions, not depth, so deep undercuts never read well.'))}</p></div>`;
  }
  if (st.scene === 'bake') return bakePanel();
  if (st.scene === 'painter') return painterPanel();
  return '';
}
const chk = (sp, on, label, dis = false) => `<label class="bl-check"><input type="checkbox" data-sp="${sp}"${on ? ' checked' : ''}${dis ? ' disabled' : ''}> <span>${label}</span></label>`;
function problemsNormal(r) {
  const out = [];
  if (r.type !== 'normal') out.push(t('Bake Type is not Normal: this is a lit render, not a normal map.'));
  if (r.flat) out.push(t('Selected to Active is off: the plane baked its own flat normals.'));
  if (r.type === 'normal' && r.s2a && r.clipped.length) out.push(tr('Extrusion too small: the tops of {s} are cut flat.', { s: r.clipped.map(x => t(typeName(x))).join(', ') }));
  if (r.lost) out.push(t('Max Ray Distance is shorter than the extrusion: the joints and grooves are lost.'));
  if (!r.sizeOk) out.push(tr('The image is {s} px: the plan is a 1024 sheet.', { s: r.size }));
  if (r.type === 'normal' && r.dx !== ENGINES[S.st.engine].dx) out.push(r.dx ? t('Green is −Y (DirectX) but the engine reads OpenGL: the relief looks inverted.') : t('Green is +Y (OpenGL) but Unreal reads DirectX (−Y): the relief looks inverted.'));
  return out;
}
function problemsId(r) {
  const out = [];
  if (r.type !== 'diffuse') out.push(t('Bake Type must be Diffuse for an ID map.'));
  if (!r.s2a) out.push(t('Selected to Active is off: the plane baked its own material.'));
  if (r.lit) out.push(t('Direct or Indirect is on: light and shadow are baked into the colours.'));
  if (r.noColor) out.push(t('Color is off: the material colours are not baked.'));
  if (r.wrong.length) out.push(tr('Wrong material on: {s}.', { s: r.wrong.map(x => t(typeName(x))).join(', ') }));
  return out;
}
function bakePanel() {
  const st = S.st, b = st.bake, id = step().id, isDiffuse = b.type === 'diffuse';
  const last = st.image === 'id' ? st.baked.id : st.baked.normal, issues = last ? (st.image === 'id' ? problemsId(idReport(last, last.mats)) : problemsNormal(normalReport(last))) : null;
  let h = `<div class="panel bl" data-no-i18n><h4>Bake<small>Render Properties › Bake (Cycles)</small></h4>
    <label class="bl-row"><span>Bake Type</span><select data-sp="btype">${[['combined', 'Combined'], ['ao', 'Ambient Occlusion'], ['normal', 'Normal'], ['diffuse', 'Diffuse']].map(([k, n]) => `<option value="${k}"${b.type === k ? ' selected' : ''}>${n}</option>`).join('')}</select><em></em></label>
    ${isDiffuse ? `<div class="bl-sec">Contributions</div>${chk('direct', b.direct, 'Direct')}${chk('indirect', b.indirect, 'Indirect')}${chk('color', b.color, 'Color')}` : ''}
    ${b.type === 'normal' ? `<div class="bl-sec">Influence</div><label class="bl-row"><span>Space</span><select disabled><option>Tangent</option></select><em></em></label><label class="bl-row"><span>Swizzle G</span><select data-sp="swz"><option value="+Y"${b.swizzleG === '+Y' ? ' selected' : ''}>+Y (OpenGL)</option><option value="-Y"${b.swizzleG === '-Y' ? ' selected' : ''}>−Y (DirectX)</option></select><em></em></label>` : ''}
    <div class="bl-sec">Selected to Active</div>${chk('s2a', b.s2a, 'Selected to Active')}${chk('cage', false, 'Cage', true)}
    <label class="bl-row"><span>Extrusion</span><input type="range" data-sp="ext" min="0" max="0.2" step="0.005" value="${b.extrusion}"><em>${(b.extrusion * 100).toFixed(1)} cm</em></label>
    <label class="bl-row"><span>Max Ray Distance</span><input type="range" data-sp="ray" min="0" max="0.2" step="0.005" value="${b.rayDist}"><em>${b.rayDist ? (b.rayDist * 100).toFixed(1) + ' cm' : '0 (∞)'}</em></label>
    <div class="bl-sec">Output</div><label class="bl-row"><span>Image</span><select data-sp="bsize">${[512, 1024, 2048].map(z => `<option value="${z}"${b.size === z ? ' selected' : ''}>${z} × ${z}</option>`).join('')}</select><em></em></label>
    <label class="bl-row"><span>Margin</span><input type="number" value="16" disabled><em>px</em></label>
    <button type="button" class="bake-btn" data-sp="bake">Bake</button></div>`;
  if (issues) h += `<div class="panel"><h4>${esc(t('Last bake'))}</h4>${issues.length ? `<ul class="issues">${issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="good-note">${esc(t('✓ Clean bake'))}</p>`}</div>`;
  h += `<div class="panel"><h4>${esc(t('View'))}</h4><div class="seg">${[['high', 'High poly'], ['low', 'Low plane + bake']].map(([k, n]) => `<button type="button" data-sp="view" data-v="${k}" ${pressed(st.view === k)}>${esc(t(n))}</button>`).join('')}</div>
    <div class="seg">${[['normal', 'Normal map'], ['id', 'ID map']].map(([k, n]) => `<button type="button" data-sp="image" data-v="${k}" ${pressed(st.image === k)}>${esc(t(n))}</button>`).join('')}</div>
    ${statRow('Engine preview', ENGINES[st.engine].name + (ENGINES[st.engine].dx ? ' · DirectX' : ' · OpenGL'))}${statRow('Tallest piece', cm(MAX_H))}</div>`;
  if (id === 'k3') h += `<div class="panel"><h4>${esc(t('Materials of the high poly'))}<small data-no-i18n>Material Properties</small></h4>${DEFAULT_STRIPS.map(s => `<label class="bl-row mat-row"><span><i class="sw sw-${s.type}"></i>${esc(t(typeName(s.type)))}</span><select data-sp="mat" data-v="${s.type}">${Object.entries(MATERIALS).map(([k, m]) => `<option value="${k}"${st.mats[s.type] === k ? ' selected' : ''}>${esc(t(m.name))}</option>`).join('')}</select><em><i class="idsw" style="background:rgb(${MATERIALS[st.mats[s.type] || 'none'].id})"></i></em></label>`).join('')}</div>`;
  return h;
}
function painterPanel() {
  const st = S.st, id = step().id, p = st.pb, pr = painterReport(p), done = st.pbaked && painterReport(st.pbaked);
  let h = `<div class="panel"><h4>${esc(t('2D view'))}</h4><div class="seg wrap">${[['color', 'Base Color'], ['id', 'ID'], ['ao', 'AO'], ['curvature', 'Curvature'], ['normal', 'Normal']].map(([k, n]) => `<button type="button" data-sp="image" data-v="${k}" ${pressed(st.image === k)} data-no-i18n>${n}</button>`).join('')}</div></div>`;
  if (id === 's1') {
    h += `<div class="panel bl" data-no-i18n><h4>Bake Mesh Maps<small>Texture Set Settings</small></h4>
      <div class="bl-sec">Common parameters</div><label class="bl-row"><span>Output Size</span><select disabled><option>1024</option></select><em></em></label>
      <div class="hp-load"><span>High Definition Meshes</span><b>${p.high ? 'trim_high.fbx' : '—'}</b><button type="button" data-sp="loadhigh">${p.high ? 'Loaded ✓' : 'Load high poly'}</button></div>
      <label class="bl-row"><span>Max Frontal Distance</span><input type="range" data-sp="front" min="0.005" max="0.05" step="0.005" value="${p.frontal}"><em>${p.frontal.toFixed(3)} · ${(p.frontal * DIAG * 100).toFixed(1)} cm</em></label>
      <div class="bl-sec">Maps</div>${PAINTER_MAPS.map(m => chk('map', p.maps[m], MAP_NAMES[m]).replace('data-sp="map"', `data-sp="map" data-v="${m}"`)).join('')}
      <div class="bl-sec">ID</div><label class="bl-row"><span>Color Source</span><select data-sp="idsrc">${Object.entries(ID_SOURCES).map(([k, n]) => `<option value="${k}"${p.idSource === k ? ' selected' : ''}>${n}</option>`).join('')}</select><em></em></label>
      <button type="button" class="bake-btn" data-sp="pbake">Bake selected textures</button></div>`;
    if (st.pbaked) { const r = painterReport(st.pbaked), iss = [];
      if (!r.high) iss.push(t('No high poly: the maps come from the flat plane itself.'));
      if (r.need.length) iss.push(tr('Missing maps: {m}.', { m: r.need.map(m => MAP_NAMES[m]).join(', ') }));
      if (!r.idOk) iss.push(t('ID from Vertex Color: the high poly has no vertex colours, the ID map is empty. Use Material Color.'));
      if (r.clipped) iss.push(tr('Max Frontal Distance reaches {c}: the tops of the molding and the bevels are cut.', { c: cm(r.reach) }));
      h += `<div class="panel"><h4>${esc(t('Last bake'))}</h4>${iss.length ? `<ul class="issues">${iss.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="good-note">${esc(t('✓ All the maps are baked and line up.'))}</p>`}</div>`; }
    return h;
  }
  const rep = layerReport(st.layers), regCol = r => `rgb(${MATERIALS[r].id})`;
  h += `<div class="panel"><h4>${esc(t('Layers'))}<small data-no-i18n>Layer stack</small></h4><ul class="layers">${st.layers.map((l, i) => i).reverse().map(i => { const l = st.layers[i];
    return `<li class="${l.visible === false ? 'off' : ''}"><div class="ly-top"><button type="button" class="eye" data-sp="eye" data-v="${i}" title="Visible">${l.visible === false ? '○' : '●'}</button><b data-no-i18n>${SMART[l.mat]}</b><span class="mask-chip">${l.mask ? `<i class="idsw" style="background:${regCol(l.mask)}"></i>${esc(t('mask'))}` : esc(t('no mask'))}</span><button type="button" data-sp="del" data-v="${i}" title="Delete">✕</button></div>
      <div class="ly-row"><select data-sp="lmat" data-v="${i}">${Object.entries(SMART).map(([k, n]) => `<option value="${k}"${l.mat === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <select data-sp="lmask" data-v="${i}"><option value=""${!l.mask ? ' selected' : ''}>${esc(t('No mask'))}</option>${['wood', 'stone', 'iron'].map(r => `<option value="${r}"${l.mask === r ? ' selected' : ''}>${esc(tr('Color selection: {c}', { c: t({ wood: 'red', stone: 'green', iron: 'blue' }[r]) }))}</option>`).join('')}</select></div>
      ${id === 's3' ? `<div class="ly-row">${chk('edge', l.edge, t('Edge wear (Curvature)')).replace('data-sp="edge"', `data-sp="edge" data-v="${i}"`)}${chk('dirt', l.dirt, t('Dirt (AO)')).replace('data-sp="dirt"', `data-sp="dirt" data-v="${i}"`)}</div>` : ''}</li>`; }).join('')}</ul>
    <div class="ds-add"><select id="ly-new" data-no-i18n>${Object.entries(SMART).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select><button type="button" data-sp="addlayer">${esc(t('Add fill layer'))}</button></div>
    ${statRow('Wood (red)', rep.cover.wood ? SMART[rep.cover.wood.mat] : '—', rep.cover.wood?.mat === 'wood' && rep.cover.wood?.mask === 'wood' ? 'good' : 'bad')}${statRow('Stone (green)', rep.cover.stone ? SMART[rep.cover.stone.mat] : '—', rep.cover.stone?.mat === 'stone' && rep.cover.stone?.mask === 'stone' ? 'good' : 'bad')}${statRow('Iron (blue)', rep.cover.iron ? SMART[rep.cover.iron.mat] : '—', rep.cover.iron?.mat === 'iron' && rep.cover.iron?.mask === 'iron' ? 'good' : 'bad')}</div>`;
  if (id === 's3') h += `<div class="panel bl"><h4>${esc(t('Export'))}<small data-no-i18n>File › Export Textures</small></h4><label class="bl-row"><span data-no-i18n>Output template</span><select data-sp="preset" data-no-i18n>${Object.entries(EXPORTS).map(([k, x]) => `<option value="${k}"${st.exportPreset === k ? ' selected' : ''}>${x.name}</option>`).join('')}</select><em></em></label><p class="sb-empty" data-no-i18n>${EXPORTS[st.exportPreset].maps}</p>${statRow('Project engine', 'Unreal Engine · DirectX')}<button type="button" class="bake-btn" data-sp="export">Export</button></div>`;
  void done; return h;
}
let spGesture = false;
function spSet(fn, rebuild = true) { if (!spGesture) { pushUndo(); spGesture = true; setTimeout(() => { spGesture = false; }, 500); } fn(S.st); if (rebuild) changed(); }
function spAction(sp, v, el) {
  const st = S.st;
  const act = {
    platform: () => spSet(s => { s.platform = v; s.d = null; const vis = s.flags.visited || []; if (!vis.includes(v)) s.flags.visited = [...vis, v]; frame('platform'); }),
    dist: () => spSet(s => { s.d = +el.value; gameCamera(); }),
    td: () => spSet(s => { s.td = +v; }),
    pick: () => spSet(s => { s.picks[v] = +el.value; }),
    plane: () => spSet(s => { s.planeM = +el.value; }),
    overhang: () => spSet(s => { s.overhang = el.checked; }),
    btype: () => spSet(s => { s.bake.type = el.value; }), swz: () => spSet(s => { s.bake.swizzleG = el.value; }),
    s2a: () => spSet(s => { s.bake.s2a = el.checked; }), direct: () => spSet(s => { s.bake.direct = el.checked; }), indirect: () => spSet(s => { s.bake.indirect = el.checked; }), color: () => spSet(s => { s.bake.color = el.checked; }),
    ext: () => spSet(s => { s.bake.extrusion = +el.value; }), ray: () => spSet(s => { s.bake.rayDist = +el.value; }), bsize: () => spSet(s => { s.bake.size = +el.value; }),
    mat: () => spSet(s => { s.mats = { ...s.mats, [v]: el.value }; }),
    view: () => spSet(s => { s.view = v; }), image: () => spSet(s => { s.image = v; }),
    bake: () => { spSet(s => { if (s.bake.type === 'diffuse') { s.baked.id = { ...s.bake, mats: { ...s.mats } }; s.image = 'id'; } else { s.baked.normal = { ...s.bake }; s.image = 'normal'; } s.view = 'low'; });
      const last = S.st.image === 'id' ? problemsId(idReport(S.st.baked.id, S.st.baked.id.mats)) : problemsNormal(normalReport(S.st.baked.normal)); msg(last.length ? last[0] : t('✓ Clean bake'), !!last.length); },
    loadhigh: () => spSet(s => { s.pb.high = true; }),
    front: () => spSet(s => { s.pb.frontal = +el.value; }),
    map: () => spSet(s => { s.pb.maps = { ...s.pb.maps, [v]: el.checked }; }),
    idsrc: () => spSet(s => { s.pb.idSource = el.value; }),
    pbake: () => { spSet(s => { s.pbaked = JSON.parse(JSON.stringify(s.pb)); s.image = 'id'; }); const r = painterReport(S.st.pbaked); msg(r.ok ? t('✓ All the maps are baked and line up.') : t('Baked, with problems: see the side panel.'), !r.ok); },
    eye: () => spSet(s => { const l = s.layers[+v]; l.visible = l.visible === false; }),
    del: () => spSet(s => { s.layers.splice(+v, 1); }),
    lmat: () => spSet(s => { s.layers[+v].mat = el.value; }),
    lmask: () => spSet(s => { s.layers[+v].mask = el.value || null; }),
    edge: () => spSet(s => { s.layers[+v].edge = el.checked; }), dirt: () => spSet(s => { s.layers[+v].dirt = el.checked; }),
    addlayer: () => spSet(s => { s.layers.push({ mat: $('#ly-new').value, mask: null }); s.image = 'color'; }),
    preset: () => spSet(s => { s.exportPreset = el.value; }),
    export: () => { spSet(s => { s.flags.exported = s.exportPreset; }); const x = EXPORTS[S.st.exportPreset], w = wearReport(S.st.layers); msg(!ENGINES.unreal.dx === !x.dx ? (w.ok ? tr('Exported: {m}.', { m: x.maps }) : t('Exported, but the material is not finished: masks, edge wear and dirt.')) : t('This preset writes an OpenGL normal map: in Unreal the edges will look inverted.'), !(x.dx && w.ok)); },
  }[sp];
  if (act) { spGesture = false; act(); spGesture = false; }
}
$('#props').addEventListener('click', e => { const b = e.target.closest('button[data-sp]'); if (b) spAction(b.dataset.sp, b.dataset.v, b); });
$('#props').addEventListener('change', e => { const el = e.target.closest('[data-sp]'); if (el && el.tagName !== 'BUTTON' && el.type !== 'range') spAction(el.dataset.sp, el.dataset.v, el); });
$('#props').addEventListener('input', e => { const el = e.target.closest('input[type=range][data-sp]'); if (!el) return; const em = el.nextElementSibling; spGestureRange(el); if (em) em.textContent = ''; });
function spGestureRange(el) { const sp = el.dataset.sp, st = S.st; if (!spGesture) { pushUndo(); spGesture = true; setTimeout(() => { spGesture = false; }, 600); }
  if (sp === 'dist') { st.d = +el.value; gameCamera(); } else if (sp === 'ext') st.bake.extrusion = +el.value; else if (sp === 'ray') st.bake.rayDist = +el.value; else if (sp === 'front') st.pb.frontal = +el.value;
  clearTimeout(spGestureRange.t); spGestureRange.t = setTimeout(() => changed(), 120); }

// ─── Headers ─────────────────────────────────────────────────────────────────
$('#pivot').addEventListener('change', e => { S.pivot = e.target.value; });
$('#mip').addEventListener('change', e => { S.st.mip = +e.target.value; changed(); });
function renderHeaders() {
  const st = S.st, id = step().id;
  $('#mip-field').hidden = !isBoard(); $('#mip').value = String(st.mip);
  $('#pivot-field').hidden = !isMesh() || id === 't2' || id === 'p3';
  $('#pivot').value = S.pivot;
  $('#uv-title').textContent = isMesh() ? 'UV Editor' : { platform: 'Pixel loupe', sheetsize: 'Sheet sizes', painter: '2D view' }[st.scene] || 'Image Editor';
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
    <div><span class="control-label">${esc(t(s.tool === 'painter' ? 'HOW, IN SUBSTANCE PAINTER' : s.tool === 'plan' ? 'HOW' : 'HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
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
  for (const id of [...S.sel]) if (!isMesh() || !meshOf(S.st).islands[id]) S.sel.delete(id);
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
