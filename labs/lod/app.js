// LOD & Mipmaps Lab: a 3D view with a LOD Group, Decimate copies, a floor with mipmaps and a field of rocks.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { SCREEN, ppm, screenPct, errorPx, rockMesh, rockTris, lodError, ROCK, ROCK_H, LODS, activeLod, thresholdReport, idealPct, mipChain, textureMB, DECIMATE_D, TRI_TARGETS, minFreqAt } from './lod.js?v=1';
import { STAGES, startState, slotFreqs, slotTris, fieldOf, budgetStats, BUDGET, answerQuiz, DECIMATE_QUIZ, DECIMATE_OPTS, MIP_QUIZ, MEMORY_QUIZ, MEMORY_OPTS, BUDGET_QUIZ } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=2';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-lod:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-lod:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = { stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [], done: store.get('done', {}), wire: false, play: null, feedback: null };
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step], sid = () => step().id;
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 7000);
}
const LOD_COL = [0x5fb04a, 0x3fa6b8, 0x4a78d8, 0x9a62d0];
const LOD_CSS = ['#4f8f3e', '#2f8a9a', '#3d63b3', '#7d4fae', '#8a3a33'];
const MIP_CSS = ['#e04a3f', '#f0a030', '#e8e040', '#6cc04a', '#40b8c8', '#4a70e0', '#a050d8', '#e050a0', '#ffffff', '#888888', '#444444'];

// ─── Renderer ────────────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
const camera = new THREE.PerspectiveCamera(SCREEN.fov, 1, 0.05, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = false;
controls.addEventListener('change', () => { if (S.st && (S.st.scene === 'rock' || S.st.scene === 'decimate')) { dirty = true; } });
let dirty = true;
function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
new ResizeObserver(resize).observe(host);

// Scenes
const sceneRock = new THREE.Scene(), sceneFloor = new THREE.Scene(), sceneField = new THREE.Scene();
for (const sc of [sceneRock, sceneField]) {
  sc.background = new THREE.Color(0x3a3a3a);
  sc.add(new THREE.HemisphereLight(0xdfe8f0, 0x3a3228, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-4, 7, 5); sc.add(sun);
}
sceneField.background = new THREE.Color(0x5d7084); sceneField.fog = null;
const grid = new THREE.GridHelper(40, 40, 0x555555, 0x474747); grid.position.y = -0.55; sceneRock.add(grid);

// Rock meshes, smooth-shaded (vertices shared), cached per frequency.
const geoCache = new Map();
function rockGeometry(n) {
  if (geoCache.has(n)) return geoCache.get(n);
  const m = rockMesh(n), map = new Map(), pos = [], idx = [];
  for (let i = 0; i < m.pos.length; i += 3) {
    const k = `${Math.round(m.pos[i] * 1e4)},${Math.round(m.pos[i + 1] * 1e4)},${Math.round(m.pos[i + 2] * 1e4)}`;
    let v = map.get(k); if (v == null) { v = pos.length / 3; map.set(k, v); pos.push(m.pos[i], m.pos[i + 1], m.pos[i + 2]); }
    idx.push(v);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  geoCache.set(n, g); return g;
}
const rockMat = () => new THREE.MeshStandardMaterial({ color: 0x9a9088, roughness: 0.92, metalness: 0 });
const matA = rockMat(), matB = rockMat();
const meshA = new THREE.Mesh(rockGeometry(ROCK.n0), matA), meshB = new THREE.Mesh(rockGeometry(ROCK.n0), matB);
const wireMatA = new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: true, transparent: true, opacity: 0.35 });
const wireA = new THREE.Mesh(meshA.geometry, wireMatA);
sceneRock.add(meshA, meshB, wireA);

// ─── Floor with mipmaps ──────────────────────────────────────────────────────
const TEX = 1024, TILE_M = 2;          // one texture covers 2 × 2 m of floor: 512 px/m
function floorCanvas(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const n = 8, cell = size / n;        // 8 × 8 tiles of 25 cm
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const h = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1, v = 150 + Math.abs(h) * 60;
    g.fillStyle = (i + j) % 2 ? `rgb(${v},${v * 0.93},${v * 0.82})` : `rgb(${v * 0.55},${v * 0.5},${v * 0.46})`; g.fillRect(i * cell, j * cell, cell, cell);
  }
  // Fine stripes inside each tile (high frequency: they make moiré without mips).
  g.strokeStyle = 'rgba(20,20,20,.55)'; g.lineWidth = Math.max(1, size / 512);
  for (let y = 0; y < size; y += size / 128) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(size, y + 0.5); g.stroke(); }
  g.strokeStyle = '#1b1b1b'; g.lineWidth = Math.max(1, size / 256);
  for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * cell, 0); g.lineTo(k * cell, size); g.stroke(); g.beginPath(); g.moveTo(0, k * cell); g.lineTo(size, k * cell); g.stroke(); }
  return c;
}
const floorBase = floorCanvas(TEX);
function mipCanvases(tint) {
  return mipChain(TEX).map((s, k) => {
    const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(floorBase, 0, 0, s, s);
    if (tint) { g.globalAlpha = 0.62; g.fillStyle = MIP_CSS[Math.min(k, MIP_CSS.length - 1)]; g.fillRect(0, 0, s, s); }
    return c;
  });
}
const mipsPlain = mipCanvases(false), mipsTint = mipCanvases(true);
let floorTex = null;
const floorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 200), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.z = -96; sceneFloor.add(floor);
sceneFloor.background = new THREE.Color(0x5d7084);
function updateFloorTexture() {
  const st = S.st; if (floorTex) floorTex.dispose();
  const tx = new THREE.Texture(floorBase);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(10 / TILE_M, 200 / TILE_M); tx.colorSpace = THREE.SRGBColorSpace;
  tx.magFilter = THREE.LinearFilter;
  if (!st.mips) { tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter; }
  else {
    tx.generateMipmaps = false; tx.mipmaps = st.mipView ? mipsTint : mipsPlain; tx.image = tx.mipmaps[0];
    tx.minFilter = st.filter === 'bilinear' ? THREE.LinearMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
  }
  tx.anisotropy = st.mips ? Math.min(st.aniso, MAX_ANISO) : 1;
  tx.needsUpdate = true; floorTex = tx; floorMat.map = tx; floorMat.needsUpdate = true; dirty = true;
}

// ─── Field of rocks ──────────────────────────────────────────────────────────
const FIELD_ITEMS = fieldOf();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x6f7f52, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.45; sceneField.add(ground);
const fieldMats = LODS.map(() => rockMat());
const fieldMeshes = LODS.map((n, i) => { const m = new THREE.InstancedMesh(rockGeometry(n), fieldMats[i], FIELD_ITEMS.length); m.count = 0; m.frustumCulled = false; sceneField.add(m); return m; });
function updateField() {
  const st = S.st, th = [idealPct(LODS[1]), idealPct(LODS[2]), idealPct(LODS[3]), st.cull], counts = [0, 0, 0, 0], M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const it of FIELD_ITEMS) {
    const pct = screenPct(ROCK_H * it.s, it.d);
    let l = st.lods ? activeLod(pct, th, st.bias) : (st.cull > 0 && pct < st.cull ? -1 : 0);
    if (l < 0) continue;
    q.setFromAxisAngle(up, it.rot); M.compose(new THREE.Vector3(it.x, 0, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
    fieldMeshes[l].setMatrixAt(counts[l]++, M);
  }
  fieldMeshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; fieldMats[i].color.set(st.colors ? LOD_COL[i] : 0x9a9088); });
  dirty = true;
}

// ─── Camera per scene ────────────────────────────────────────────────────────
const DIST_MIN = 1.6, DIST_MAX = 200;
const distToSlider = d => Math.round(1000 * Math.log(d / DIST_MIN) / Math.log(DIST_MAX / DIST_MIN));
const sliderToDist = v => DIST_MIN * (DIST_MAX / DIST_MIN) ** (v / 1000);
const viewDist = () => { const st = S.st; if (st.scene === 'decimate' && st.fixedD) return DECIMATE_D[st.sel - 1]; return st.dist; };
function placeCamera(keepDir = true) {
  const st = S.st;
  if (st.scene === 'rock' || st.scene === 'decimate') {
    const dir = keepDir && camera.position.lengthSq() > 0 ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(0.55, 0.18, 1).normalize();
    controls.target.set(0, 0, 0); camera.position.copy(dir.multiplyScalar(viewDist())); controls.enabled = true;
    controls.minDistance = controls.maxDistance = viewDist();
  } else if (st.scene === 'floor') {
    controls.enabled = false; camera.position.set(0, 1.6, 2); camera.lookAt(0, 0.2, -30);
  } else { controls.enabled = false; camera.position.set(0, 3.2, 2); camera.lookAt(0, 0, -45); }
  camera.fov = SCREEN.fov; camera.updateProjectionMatrix(); if (st.scene === 'rock' || st.scene === 'decimate') controls.update(); dirty = true;
}

// ─── Rock scene: which LOD, cross fade ───────────────────────────────────────
function rockState() {
  const st = S.st, d = viewDist(), pct = screenPct(ROCK_H, d);
  if (st.scene === 'decimate') { const f = slotFreqs(st), i = st.sel; return { d, pct, lod: i, n: f[i], fade: null }; }
  const lod = activeLod(pct, st.t);
  let fade = null;
  if (st.fade === 'cross' && st.fadeW > 0 && lod >= 0 && lod < 3) {
    // Unity: the fade happens in the last part of each LOD's range, before the next one takes over.
    const top = lod === 0 ? 100 : st.t[lod - 1], bottom = st.t[lod], band = (top - bottom) * st.fadeW;
    if (pct < bottom + band) fade = { to: lod + 1, k: 1 - (pct - bottom) / band };
  }
  return { d, pct, lod, n: lod >= 0 ? LODS[lod] : null, fade };
}
function updateRock() {
  const st = S.st, r = rockState(), colors = st.colors && st.scene === 'rock';
  const show = r.lod >= 0;
  meshA.visible = show; wireA.visible = show && S.wire;
  if (show) {
    meshA.geometry = rockGeometry(r.n); wireA.geometry = meshA.geometry;
    matA.color.set(colors ? LOD_COL[r.lod] : 0x9a9088);
  }
  // Cross fade: both LODs drawn with complementary dithered alpha (alpha hashing, as a dithered cross fade).
  meshB.visible = !!r.fade;
  for (const m of [matA, matB]) if (m.alphaHash !== !!r.fade) { m.alphaHash = !!r.fade; m.needsUpdate = true; }
  matA.opacity = r.fade ? 1 - r.fade.k : 1;
  if (r.fade) { meshB.geometry = rockGeometry(LODS[r.fade.to]); matB.color.set(colors ? LOD_COL[r.fade.to] : 0x9a9088); matB.opacity = r.fade.k; }
  grid.visible = st.scene === 'rock' || st.scene === 'decimate';
  if (st.scene === 'rock' && r.lod >= 0 && !st.flags['seen' + r.lod]) { st.flags['seen' + r.lod] = true; saveData(); checkProgress(); }
  dirty = true; return r;
}

// ─── Insets at game resolution ───────────────────────────────────────────────
const rt = new THREE.WebGLRenderTarget(256, 256, { samples: 0 });
const insetCam = new THREE.PerspectiveCamera(10, 1, 0.05, 2000);
const insetBuf = new Uint8Array(256 * 256 * 4);
const SRGB = Uint8Array.from({ length: 256 }, (_, i) => { const c = i / 255; return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); });
function drawInset(el, n) {
  const d = viewDist(), objPx = screenPct(ROCK_H, d) / 100 * SCREEN.h, S_px = Math.max(8, Math.min(150, Math.ceil(objPx * 1.35)));
  insetCam.fov = 2 * Math.atan(Math.tan(SCREEN.fov * Math.PI / 360) * S_px / SCREEN.h) * 180 / Math.PI; insetCam.aspect = 1; insetCam.updateProjectionMatrix();
  insetCam.position.copy(camera.position); insetCam.quaternion.copy(camera.quaternion);
  const vis = [meshA.visible, meshB.visible, wireA.visible, grid.visible], geo = meshA.geometry, col = matA.color.getHex(), hash = matA.alphaHash, op = matA.opacity;
  meshB.visible = false; wireA.visible = false; grid.visible = false; meshA.visible = true; meshA.geometry = rockGeometry(n); matA.color.set(0x9a9088); matA.alphaHash = false; matA.opacity = 1; matA.needsUpdate = true;
  rt.setSize(S_px, S_px); renderer.setRenderTarget(rt); renderer.setClearColor(0x0c0c0c, 1); renderer.clear(); renderer.setClearColor(0x000000, 0); renderer.render(sceneRock, insetCam);
  renderer.readRenderTargetPixels(rt, 0, 0, S_px, S_px, insetBuf); renderer.setRenderTarget(null);
  [meshA.visible, meshB.visible, wireA.visible, grid.visible] = vis; meshA.geometry = geo; matA.color.setHex(col); matA.alphaHash = hash; matA.opacity = op; matA.needsUpdate = true;
  const img = new ImageData(S_px, S_px);
  for (let y = 0; y < S_px; y++) for (let x = 0; x < S_px; x++) { const a = ((S_px - 1 - y) * S_px + x) * 4, b = (y * S_px + x) * 4; for (let k = 0; k < 3; k++) img.data[b + k] = SRGB[insetBuf[a + k]]; img.data[b + 3] = 255; }
  const off = document.createElement('canvas'); off.width = off.height = S_px; off.getContext('2d').putImageData(img, 0, 0);
  const g = el.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, el.width, el.height); g.drawImage(off, 0, 0, el.width, el.height);
  return S_px;
}
function updateInsets(r) {
  const on = (S.st.scene === 'rock' || S.st.scene === 'decimate') && r && r.n;
  $('#insets').hidden = !on; if (!on) return;
  const px = drawInset($('#inset-a'), ROCK.n0); drawInset($('#inset-b'), r.n);
  $('#inset-b-cap').textContent = `LOD${r.lod} · ${fmt(rockTris(r.n))}`;
  $('#inset-note').textContent = tr('{p} × {p} screen pixels, enlarged ×{k}', { p: px, k: (150 / px).toFixed(1) });
}

// ─── Viewport text ───────────────────────────────────────────────────────────
function vpText(r) {
  const st = S.st, el = $('#vp-text');
  if (st.scene === 'rock' || st.scene === 'decimate') {
    const lodTxt = r.lod < 0 ? t('Culled: not drawn') : `LOD${r.lod}${r.fade ? ` → LOD${r.fade.to} (${Math.round(r.fade.k * 100)} %)` : ''}`;
    const err = r.n ? errorPx(lodError(r.n), r.d) : 0;
    el.innerHTML = `<b>${esc(lodTxt)}</b>\n${esc(t('Distance'))} ${r.d.toFixed(1)} m · ${esc(t('Screen height'))} ${r.pct.toFixed(1)} %\n${r.n ? `${esc(t('Triangles'))} ${fmt(rockTris(r.n))} · ${esc(t('Error on screen'))} ${err.toFixed(2)} px` : ''}`;
  } else if (st.scene === 'floor') {
    el.innerHTML = `<b>${esc(st.mips ? t('Mipmaps on') : t('Mipmaps off'))}</b>\n${esc(t('Filter'))}: ${st.mips ? (st.filter === 'bilinear' ? 'Bilinear' : 'Trilinear') : 'Bilinear, no mips'}${st.mips && st.aniso > 1 ? ` · Anisotropic ×${Math.min(st.aniso, MAX_ANISO)}` : ''}\n${esc(t('Floor texture'))}: 1024 px · 512 px/m`;
  } else {
    const s = budgetStats(st);
    el.innerHTML = `<b>${esc(t('Triangles drawn'))}: ${fmt(s.tris)}</b> / ${fmt(BUDGET)}\n${esc(t('Rocks drawn'))}: ${s.drawn} / ${FIELD_ITEMS.length} · ${esc(t('Worst error'))}: ${s.worst.toFixed(2)} px`;
  }
}

// ─── Render loop ─────────────────────────────────────────────────────────────
let lastR = null;
function render() {
  const st = S.st;
  if (st.scene === 'rock' || st.scene === 'decimate') { renderer.render(sceneRock, camera); }
  else if (st.scene === 'floor') renderer.render(sceneFloor, camera);
  else renderer.render(sceneField, camera);
}
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  if (!S.st) return;
  if (S.play) stepPlay(now);
  if (!dirty) return;
  dirty = false;
  const st = S.st;
  if (st.scene === 'rock' || st.scene === 'decimate') { lastR = updateRock(); updateInsets(lastR); vpText(lastR); }
  else { $('#insets').hidden = true; vpText(null); }
  render();
}
requestAnimationFrame(frameLoop);

// ─── Play: camera dolly (rock) or sway (floor) ───────────────────────────────
function togglePlay(on = !S.play) {
  const st = S.st; if (!st) return;
  if (on && !(st.scene === 'rock' || st.scene === 'floor')) { msg('Play works on the rock and on the floor.'); return; }
  S.play = on ? { t0: performance.now(), from: st.dist, crossAtStart: st.fade === 'cross' && st.fadeW >= 0.1, mipsOffAtStart: !st.mips } : null;
  $('#play-btn').setAttribute('aria-pressed', String(!!S.play)); $('#play-btn').textContent = t(S.play ? '■ Stop' : '▶ Play');
  if (!on && st.scene === 'floor') placeCamera();
}
function stepPlay(now) {
  const st = S.st, p = S.play, k = (now - p.t0) / 1000;
  if (st.scene === 'rock') {
    const T = 9, u = Math.min(1, k / T);
    st.dist = 3 * (70 / 3) ** u; syncDist(); refreshLodPanel(); dirty = true;
    if (u >= 1) { if (p.crossAtStart && st.fade === 'cross' && st.fadeW >= 0.1) st.flags.playedCross = true; togglePlay(false); saveData(); renderProps(); checkProgress(); }
  } else if (st.scene === 'floor') {
    camera.position.set(Math.sin(k * 0.7) * 0.35, 1.6 + Math.sin(k * 0.45) * 0.05, 2 - k * 0.35 % 4); camera.lookAt(camera.position.x * 0.5, 0.2, -30); dirty = true;
    if (k > 3 && p.mipsOffAtStart && !st.mips) { if (!st.flags.playedOff) { st.flags.playedOff = true; saveData(); checkProgress(); } }
    if (k > 3 && p.mipsOffAtStart && st.mips && !st.flags.playedOff) { st.flags.playedOff = true; saveData(); checkProgress(); }
  }
}

// ─── Properties panels ───────────────────────────────────────────────────────
const statRow = (label, value, cls = '') => `<div class="sb-stat ${cls}"><span>${esc(t(label))}</span><b data-no-i18n>${esc(value)}</b></div>`;
function lodGroupPanel(editable) {
  const st = S.st, r = rockState(), rep = thresholdReport(st.t);
  const bounds = [100, ...st.t, 0], segs = [0, 1, 2, 3, 4].map(i => ({ i, w: bounds[i] - bounds[i + 1] }));
  const camX = 100 - Math.min(100, r.pct);
  const bar = `<div class="lodbar" id="lodbar" data-edit="${editable ? 1 : 0}">${segs.map(s => `<span style="flex:${Math.max(0.0001, s.w)};background:${LOD_CSS[s.i]}"><b data-no-i18n>${s.i < 4 ? 'LOD ' + s.i : 'Culled'}</b><small data-no-i18n>${s.i < 4 ? bounds[s.i].toFixed(s.i ? 1 : 0) + '%' : ''}</small></span>`).join('')}<i class="cam" style="left:calc(${camX}% - 1px)"></i></div>`;
  const rows = rep.map(x => `<div class="lod-row ${x.early || x.late ? 'bad' : 'good'}${r.lod === x.i ? ' cur' : ''}"><b data-no-i18n>LOD${x.i}</b>${editable ? `<input type="number" data-t="${x.i - 1}" value="${x.pct}" step="0.1" min="0.2" max="99">` : `<span data-no-i18n>${x.pct.toFixed(1)} %</span>`}<em data-no-i18n>${x.e.toFixed(2)} px</em><small>${esc(t(x.early ? 'too early' : x.late ? 'too late' : 'good'))}</small></div>`).join('');
  return `<div class="panel"><h4><span data-no-i18n>LOD Group</span><small>${esc(t('% of screen height'))}</small></h4>${bar}
    <div class="lod-rows"><div class="lod-row" style="background:none;border:0"><span></span><small>${esc(t('starts at'))}</small><small style="text-align:right">${esc(t('error at switch'))}</small><span></span></div>${rows}</div>
    ${statRow('Culled below', st.t[3] + ' %')}
    <p class="td-note">${esc(t('The yellow line is the rock now. Aim for 0.5–1 px of error when each LOD switches in.'))}</p></div>`;
}
function fadePanel() {
  const st = S.st;
  return `<div class="panel"><h4><span data-no-i18n>Fade Mode</span></h4>
    <div class="mod-row"><span data-no-i18n>Fade Mode</span><select id="fade" data-no-i18n><option value="none"${st.fade === 'none' ? ' selected' : ''}>None</option><option value="cross"${st.fade === 'cross' ? ' selected' : ''}>Cross Fade</option></select><span></span></div>
    <div class="mod-row"><span data-no-i18n>Fade Transition Width</span><input type="range" id="fadeW" min="0" max="1" step="0.05" value="${st.fadeW}"${st.fade === 'cross' ? '' : ' disabled'}><output data-no-i18n>${st.fadeW.toFixed(2)}</output></div>
    <p class="td-note">${esc(t('Width: the part of each LOD\'s range used to blend into the next one.'))}</p></div>`;
}
function rockPanel() {
  const r = rockState();
  return `<div class="panel"><h4>${esc(t('Readout'))}</h4>
    ${statRow('LOD in use', r.lod < 0 ? t('Culled') : `LOD${r.lod}`)}${statRow('Triangles', r.n ? fmt(rockTris(r.n)) : '0')}
    ${statRow('Screen height', r.pct.toFixed(1) + ' %')}${statRow('1 m on screen', Math.round(ppm(r.d)) + ' px')}
    ${statRow('Error on screen', r.n ? errorPx(lodError(r.n), r.d).toFixed(2) + ' px' : '—', r.n && errorPx(lodError(r.n), r.d) > 1.0001 ? 'bad' : 'good')}
    <div class="lod-rows">${LODS.map((n, i) => `<div class="lod-row${r.lod === i ? ' cur' : ''}" style="border-left-color:${LOD_CSS[i]}"><b data-no-i18n>LOD${i}</b><span data-no-i18n>${fmt(rockTris(n))} tris</span><em data-no-i18n>${(lodError(n) * 1000).toFixed(1)} mm</em><small>${S.st.flags['seen' + i] ? '✓' : ''}</small></div>`).join('')}</div>
    <p class="td-note">${esc(t('mm: how far each LOD is from the surface of LOD0.'))}</p></div>`;
}
const DEC_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13 8 3l6 10z M5 13l3-5 3 5" fill="none" stroke="currentColor"/></svg>';
function decimatePanel() {
  const st = S.st, f = slotFreqs(st), tris = slotTris(st), T0 = tris[0], i = st.sel, fixed = !!st.fixedD, isQuiz = sid() === 'd3';
  const okSlot = k => fixed ? errorPx(lodError(f[k]), DECIMATE_D[k - 1]) <= 1.0001 && f[k] <= minFreqAt(DECIMATE_D[k - 1]) + 1 : Math.abs(tris[k] / T0 - TRI_TARGETS[k - 1]) <= TRI_TARGETS[k - 1] * 0.1;
  const tabs = [0, 1, 2, 3].map(k => `<button type="button" data-slot="${k}" aria-pressed="${k === i}" class="${k && okSlot(k) && !isQuiz ? 'ok' : ''}"${k === 0 ? ' disabled' : ''}><span data-no-i18n>LOD${k}</span><small data-no-i18n>${fmt(tris[k])}</small></button>`).join('');
  const r = st.ratios[i - 1], err = errorPx(lodError(f[i]), viewDist());
  return `<div class="panel"><h4>${esc(t('Copies'))}<small data-no-i18n>Rock_LOD0…3</small></h4><div class="slot-tabs">${tabs}</div>
    <div class="mod-box"><h5>${DEC_ICON}<span data-no-i18n>Decimate</span><small style="margin-left:auto;color:#999" data-no-i18n>Rock_LOD${i}</small></h5>
    <div class="mod-row"><span data-no-i18n>Mode</span><select disabled data-no-i18n><option>Collapse</option></select><span></span></div>
    <div class="mod-row"><span data-no-i18n>Ratio</span><input type="range" id="ratio" min="0.005" max="1" step="0.005" value="${r}"${isQuiz ? ' disabled' : ''}><output data-no-i18n>${r.toFixed(3)}</output></div>
    <div class="face-count"><span data-no-i18n>Face Count:</span> <b data-no-i18n>${fmt(tris[i])}</b> <span data-no-i18n>(${(tris[i] / T0 * 100).toFixed(1)} %)</span></div></div>
    ${fixed ? statRow('Starts at', DECIMATE_D[i - 1] + ' m') : statRow('Target', (TRI_TARGETS[i - 1] * 100) + ' % · ' + fmt(T0 * TRI_TARGETS[i - 1]))}
    ${statRow('Error on screen', err.toFixed(2) + ' px', fixed ? (err <= 1.0001 ? 'good' : 'bad') : '')}
    <p class="td-note">${esc(t(fixed ? 'Lower the Ratio until the error is just under 1 px at this distance.' : 'Face Count counts triangles, as Blender does for this modifier.'))}</p></div>`;
}
function mipPanel() {
  const st = S.st, chain = mipChain(TEX), step = sid();
  const filt = `<div class="mod-row"><span data-no-i18n>Filter</span><select id="filter" data-no-i18n${st.mips ? '' : ' disabled'}><option value="bilinear"${st.filter === 'bilinear' ? ' selected' : ''}>Bilinear</option><option value="trilinear"${st.filter === 'trilinear' ? ' selected' : ''}>Trilinear</option></select><span></span></div>
    <div class="mod-row"><span data-no-i18n>Anisotropic</span><select id="aniso" data-no-i18n${st.mips ? '' : ' disabled'}>${[1, 2, 4, 8, 16].map(a => `<option value="${a}"${a === st.aniso ? ' selected' : ''}>×${a}</option>`).join('')}</select><span></span></div>`;
  const list = chain.slice(0, 11).map((s, k) => `<i style="background:${MIP_CSS[Math.min(k, MIP_CSS.length - 1)]}"></i><span data-no-i18n>mip ${k} · ${s} × ${s}</span><em data-no-i18n>${(s * s * 4 / 1048576).toFixed(s >= 256 ? 2 : 4)} MB</em>`).join('');
  return `<div class="panel"><h4><span data-no-i18n>Texture</span><small data-no-i18n>Floor_Tiles · 1024 px</small></h4>
    <label class="bl-check"><input type="checkbox" id="mips"${st.mips ? ' checked' : ''}><span data-no-i18n>Generate Mipmaps</span></label>
    <label class="bl-check"><input type="checkbox" id="mipview"${st.mipView ? ' checked' : ''}${st.mips ? '' : ' disabled'}><span>${esc(t('Mip colours (debug view)'))}</span></label>
    ${filt}
    ${MAX_ANISO < 16 ? `<p class="td-note">${esc(tr('This GPU supports Anisotropic up to ×{n}.', { n: MAX_ANISO }))}</p>` : ''}</div>
    <div class="panel"><h4>${esc(t('Mip chain'))}<small>${esc(t('each half the size'))}</small></h4><div class="mip-chain">${list}</div>
    ${statRow('Without mips', textureMB(TEX, false).toFixed(2) + ' MB')}${statRow('With mips', textureMB(TEX, true).toFixed(2) + ' MB (+33 %)')}
    <p class="td-note">${esc(t('Uncompressed RGBA, 4 bytes per pixel.'))}</p></div>`;
}
function budgetPanel() {
  const st = S.st, s = budgetStats(st), ok = s.tris <= BUDGET && s.worst <= 1.0001 && s.lostBig === 0;
  return `<div class="panel"><h4>${esc(t('Scene settings'))}</h4>
    <label class="bl-check"><input type="checkbox" id="lods"${st.lods ? ' checked' : ''}><span data-no-i18n>LOD Group</span></label>
    <div class="mod-row"><span data-no-i18n>LOD Bias</span><select id="bias" data-no-i18n>${[0.5, 0.75, 1, 1.5, 2].map(b => `<option value="${b}"${b === st.bias ? ' selected' : ''}>${b}</option>`).join('')}</select><span></span></div>
    <div class="mod-row"><span data-no-i18n>Culled</span><select id="cull" data-no-i18n>${[0, 0.25, 0.5, 1, 2, 5].map(c => `<option value="${c}"${c === st.cull ? ' selected' : ''}>${c ? c + ' %' : 'Off'}</option>`).join('')}</select><span></span></div>
    <label class="bl-check"><input type="checkbox" id="colors"${st.colors ? ' checked' : ''}><span>${esc(t('LOD colours'))}</span></label></div>
    <div class="panel"><h4>${esc(t('Budget'))}<small data-no-i18n>${fmt(BUDGET)} tris</small></h4>
    ${statRow('Triangles drawn', fmt(s.tris), s.tris <= BUDGET ? 'good' : 'bad')}
    ${statRow('Rocks drawn', `${s.drawn} / ${FIELD_ITEMS.length}`)}
    ${statRow('LOD0 · LOD1 · LOD2 · LOD3', s.per.join(' · '))}
    ${statRow('Worst error', s.worst.toFixed(2) + ' px', s.worst <= 1.0001 ? 'good' : 'bad')}
    ${statRow('Visible rocks culled', String(s.lostBig), s.lostBig ? 'bad' : 'good')}
    <p class="td-note ${ok ? 'good' : ''}">${esc(t(ok ? '✓ Inside the budget, with no visible change.' : 'Visible rocks culled: rocks bigger than 1 % of the screen height that are not drawn.'))}</p></div>`;
}
function quizPanel(list, opts) {
  const i = S.st.quiz | 0, done = i >= list.length, item = list[Math.min(i, list.length - 1)];
  const options = item.opts || opts;
  const buttons = opts === 'mip' ? `<div class="mip-grid">${[0, 1, 2, 3, 4, 5, 6].map(k => `<button type="button" data-ans="${k}" data-no-i18n>mip ${k}</button>`).join('')}</div>`
    : `<div class="opt-grid">${options.map((o, k) => `<button type="button" data-ans="${k}">${esc(t(o))}</button>`).join('')}</div>`;
  return `<div class="panel quiz"><h4>${esc(t('Case'))}<small>${Math.min(i + 1, list.length)} / ${list.length}</small></h4>
    ${done ? `<p class="q done">${esc(t('✓ All right.'))}</p>` : `<p class="q">${esc(t(item.q))}</p>${buttons}`}
    ${S.feedback ? `<p class="td-note ${S.feedback.ok ? 'good' : 'bad'}">${esc(S.feedback.text)}</p>` : ''}</div>`;
}
const QUIZ = { d3: [DECIMATE_QUIZ, DECIMATE_OPTS], m2: [MIP_QUIZ, 'mip'], m4: [MEMORY_QUIZ, MEMORY_OPTS], b2: [BUDGET_QUIZ, null] };
function renderProps() {
  const st = S.st, id = sid(); let h = '';
  if (id === 'l1') h = rockPanel() + lodGroupPanel(false);
  else if (id === 'l2') h = lodGroupPanel(true) + rockPanel();
  else if (id === 'l3') h = fadePanel() + lodGroupPanel(true);
  else if (id === 'd1' || id === 'd2') h = decimatePanel();
  else if (id === 'd3') h = quizPanel(...QUIZ.d3) + decimatePanel();
  else if (id === 'm1' || id === 'm3') h = mipPanel();
  else if (id === 'm2' || id === 'm4') h = quizPanel(...QUIZ[id]) + mipPanel();
  else if (id === 'b1') h = budgetPanel();
  else if (id === 'b2') h = quizPanel(...QUIZ.b2) + budgetPanel();
  $('#props').innerHTML = h;
  bindLodBar();
}
// Update the bar and the rows in place (the bar keeps the pointer while dragging).
function refreshLodPanel() {
  const bar0 = $('#lodbar'); if (!bar0) return;
  const tmp = document.createElement('div'); tmp.innerHTML = lodGroupPanel(bar0.dataset.edit === '1');
  const bar = $('#lodbar'), rows = $('#props .lod-rows');
  if (bar) bar.innerHTML = tmp.querySelector('#lodbar').innerHTML;
  if (rows) rows.innerHTML = tmp.querySelector('.lod-rows').innerHTML;
}
// Drag the dividers of the LOD Group bar.
function bindLodBar() {
  const bar = $('#lodbar'); if (!bar || bar.dataset.edit !== '1') return;
  let drag = null;
  const pctAt = e => { const r = bar.getBoundingClientRect(); return Math.max(0.2, Math.min(99, 100 - (e.clientX - r.left) / r.width * 100)); };
  bar.addEventListener('pointerdown', e => {
    const p = pctAt(e), st = S.st; let best = 0, bd = Infinity;
    for (let k = 0; k < 3; k++) { const dd = Math.abs(st.t[k] - p); if (dd < bd) { bd = dd; best = k; } }
    pushUndo(); drag = best; bar.setPointerCapture(e.pointerId); move(e);
  });
  const move = e => {
    if (drag == null) return; const st = S.st, p = pctAt(e), hi = drag === 0 ? 99 : st.t[drag - 1] - 0.1, lo = drag === 2 ? st.t[3] + 0.1 : st.t[drag + 1] + 0.1;
    st.t[drag] = Math.round(Math.max(lo, Math.min(hi, p)) * 10) / 10; refreshLodPanel(); dirty = true;
  };
  bar.addEventListener('pointermove', move);
  bar.addEventListener('pointerup', () => { if (drag != null) { drag = null; changed(); } });
}
$('#props').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const st = S.st, d = b.dataset;
  if (d.slot) { pushUndo(); st.sel = +d.slot; if (st.fixedD) placeCamera(); changed(); }
  else if (d.ans != null) {
    const [list] = QUIZ[sid()]; pushUndo();
    const r = answerQuiz(st, list, +d.ans);
    S.feedback = { ok: r.ok, text: (r.ok ? '✓ ' : '✗ ') + t(r.item.why) };
    if (!r.ok) S.undo.pop();
    changed();
  }
});
$('#props').addEventListener('input', e => {
  const el = e.target, st = S.st;
  if (el.id === 'ratio') { st.ratios[st.sel - 1] = +el.value; changed(false, true); }
  else if (el.id === 'fadeW') { st.fadeW = +el.value; changed(false, true); }
});
$('#props').addEventListener('change', e => {
  const el = e.target, st = S.st;
  if (el.id === 'ratio' || el.id === 'fadeW') { changed(); return; }
  pushUndo();
  if (el.dataset.t != null) { const k = +el.dataset.t, v = parseFloat(el.value); if (Number.isFinite(v)) { st.t[k] = Math.max(0.2, Math.min(99, v)); } }
  else if (el.id === 'fade') { st.fade = el.value; if (st.fade === 'cross' && st.fadeW < 0.05) st.fadeW = 0.25; }
  else if (el.id === 'mips') { st.mips = el.checked; if (!st.mips) st.mipView = false; }
  else if (el.id === 'mipview') st.mipView = el.checked;
  else if (el.id === 'filter') st.filter = el.value;
  else if (el.id === 'aniso') st.aniso = +el.value;
  else if (el.id === 'lods') st.lods = el.checked;
  else if (el.id === 'bias') st.bias = +el.value;
  else if (el.id === 'cull') st.cull = +el.value;
  else if (el.id === 'colors') st.colors = el.checked;
  changed();
});

// ─── Header ──────────────────────────────────────────────────────────────────
function syncDist() { const d = viewDist(); $('#dist').value = distToSlider(d); $('#dist-out').textContent = d.toFixed(1) + ' m'; placeCamera(); }
$('#dist').addEventListener('input', e => { const st = S.st; if (st.fixedD) return; st.dist = sliderToDist(+e.target.value); syncDist(); changed(false, true); });
$('#dist').addEventListener('change', () => changed());
canvas.addEventListener('wheel', e => {
  const st = S.st; if (!(st.scene === 'rock' || st.scene === 'decimate') || st.fixedD) return;
  e.preventDefault(); st.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, st.dist * Math.exp(e.deltaY * 0.0012))); syncDist(); changed(false, true);
  clearTimeout(wheelT); wheelT = setTimeout(() => changed(), 250);
}, { passive: false });
let wheelT;
$('#wire-btn').addEventListener('click', () => { S.wire = !S.wire; renderHeaders(); dirty = true; });
$('#colors-btn').addEventListener('click', () => { pushUndo(); S.st.colors = !S.st.colors; changed(); });
$('#play-btn').addEventListener('click', () => togglePlay());
function renderHeaders() {
  const st = S.st, rockish = st.scene === 'rock' || st.scene === 'decimate';
  $('#dist-field').hidden = !rockish; $('#dist').disabled = !!st.fixedD;
  $('#wire-btn').hidden = !rockish; $('#wire-btn').setAttribute('aria-pressed', String(S.wire));
  $('#colors-btn').hidden = st.scene !== 'rock' && st.scene !== 'field'; $('#colors-btn').setAttribute('aria-pressed', String(!!st.colors));
  $('#play-btn').hidden = !(st.scene === 'rock' || st.scene === 'floor');
  $('#vp-hint').textContent = t(rockish ? 'LMB drag orbit · Wheel distance' : st.scene === 'floor' ? 'Press Play to move the camera' : 'Fixed game camera');
  const d = viewDist(); $('#dist').value = distToSlider(d); $('#dist-out').textContent = d.toFixed(1) + ' m';
}

// ─── Undo, storage, steps ────────────────────────────────────────────────────
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) { msg('Nothing to undo.'); return; } S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); sceneChanged(); changed(); msg('Undo.'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); sceneChanged(); changed(); msg('Redo.'); }
const dataKey = () => `step:${stage().id}-${step().id}`;
function saveData() { store.set(dataKey(), S.st); }
function loadData() {
  const saved = store.get(dataKey(), null), fresh = startState(step());
  S.st = saved && typeof saved === 'object' && saved.scene === fresh.scene ? { ...fresh, ...saved, flags: { ...saved.flags }, fixedD: fresh.fixedD } : fresh;
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
    <div><span class="control-label">${esc(t('HOW'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); S.feedback = null; sceneChanged(); changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st); sceneChanged(); changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null, lastCard = '';
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) { const title = step().title; setTimeout(() => { if (step().title === title) msg(tr('✓ Step done: {s}', { s: t(title) })); }, 700); }
  const key = `${S.stageIndex}|${S.step}|${ok}|${document.documentElement.lang}`;
  if (key !== lastCard) { renderGuide(); renderStepCard(); lastCard = key; }
  lastOk = ok;
}
// Scene-level updates after the state changed a lot (step change, undo, solution).
function sceneChanged() {
  const st = S.st;
  if (st.scene === 'floor') updateFloorTexture();
  placeCamera(false);
}
let propsT = null;
function changed(save = true, live = false) {
  const st = S.st;
  if (st.scene === 'floor') { const key = `${st.mips}|${st.mipView}|${st.filter}|${st.aniso}`; if (key !== changed.floorKey) { changed.floorKey = key; updateFloorTexture(); } }
  if (st.scene === 'field') updateField();
  if (save) saveData();
  renderHeaders();
  if (live) { clearTimeout(propsT); propsT = setTimeout(renderPropsKeepFocus, 60); } else renderProps();
  dirty = true; checkProgress();
}
// Re-render the panel without losing a slider being dragged.
function renderPropsKeepFocus() {
  const a = document.activeElement;
  if (a && a.closest('#props') && (a.type === 'range')) {
    // Update outputs and readouts only.
    const st = S.st, out = a.parentElement.querySelector('output');
    if (a.id === 'ratio' && out) { out.textContent = (+a.value).toFixed(3); }
    if (a.id === 'fadeW' && out) { out.textContent = (+a.value).toFixed(2); }
    const tmp = document.createElement('div'); tmp.innerHTML = sid() === 'd1' || sid() === 'd2' ? decimatePanel() : '';
    const fc = tmp.querySelector('.face-count'), cur = $('#props .face-count'); if (fc && cur) cur.innerHTML = fc.innerHTML;
    const tabs = tmp.querySelector('.slot-tabs'), curTabs = $('#props .slot-tabs'); if (tabs && curTabs) curTabs.innerHTML = tabs.innerHTML;
    const stats = tmp.querySelectorAll('.sb-stat'), curStats = $('#props').querySelectorAll('.mod-box ~ .sb-stat'); stats.forEach((s, k) => { if (curStats[k]) curStats[k].outerHTML = s.outerHTML; });
    void st; return;
  }
  renderProps();
}
function enterStep() {
  togglePlay(false);
  loadData(); S.undo = []; S.redo = []; S.feedback = null; changed.floorKey = null;
  lastOk = null; lastCard = ''; lastOk = stepDone(S.step);
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  renderStageSwitch(); sceneChanged(); changed(false);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); renderProps(); renderHeaders(); dirty = true; checkProgress(); });

// ─── Keyboard ────────────────────────────────────────────────────────────────
let hover = false;
$('#workspace').addEventListener('pointerenter', () => { hover = true; });
$('#workspace').addEventListener('pointerleave', () => { hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || !hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
  if (ctrl && low === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  else if (ctrl && low === 'y') { redo(); e.preventDefault(); }
  else if (e.key === ' ') { togglePlay(); e.preventDefault(); }
});

// ─── Start ───────────────────────────────────────────────────────────────────
resize(); enterStep();
window.__lod = { S, STAGES, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, solve: () => { step().solve(S.st); sceneChanged(); changed(); }, rockState, budgetStats, MAX_ANISO };
