// LOD & Mipmaps Lab: a 3D view with a LOD Group, Decimate copies, a floor with mipmaps and a park of statues.
// The model is the Stanford Bunny (Stanford Computer Graphics Laboratory); its LODs are made here with meshoptimizer.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { MeshoptSimplifier } from '../../vendor/meshopt_simplifier.js';
import { SCREEN, ppm, screenPct, errorPx, lodTris, lodError, LEVELS, MODEL_H, LODS, activeLod, thresholdReport, idealPct, mipChain, mipLevel, textureMB, DECIMATE_D, TRI_TARGETS, minLevelAt, TEX_M, TEX_SIZES, DEFAULT_TEX, DIST_NEAR, texelsPerM, texReport, texMemory } from './lod.js?v=3';
import { STAGES, startState, slotLevels, slotTris, fieldOf, budgetStats, BUDGET, answerQuiz, DECIMATE_QUIZ, DECIMATE_OPTS, MIP_QUIZ, MEMORY_QUIZ, MEMORY_OPTS, BUDGET_QUIZ, texOk, decimateOk } from './stages.js?v=3';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=4';
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
controls.addEventListener('change', () => { if (S.st && (S.st.scene === 'model' || S.st.scene === 'decimate')) { dirty = true; } });
let dirty = true;
function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
new ResizeObserver(resize).observe(host);

// Scenes
const sceneModel = new THREE.Scene(), sceneFloor = new THREE.Scene(), sceneField = new THREE.Scene();
for (const sc of [sceneModel, sceneField]) {
  sc.background = new THREE.Color(0x3a3a3a);
  sc.add(new THREE.HemisphereLight(0xdfe8f0, 0x3a3228, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-4, 7, 5); sc.add(sun);
}
sceneField.background = new THREE.Color(0x5d7084); sceneField.fog = null;
const grid = new THREE.GridHelper(40, 40, 0x555555, 0x474747); grid.position.y = -0.7; sceneModel.add(grid);

// ─── The Stanford Bunny: LOD0 from bunny.bin, every other level made here by edge collapse ───
// The same simplifier and the same calls made bunny-table.js, so the triangles and errors in the panels are those of the mesh you see.
const [binBuf] = await Promise.all([fetch(new URL('./bunny.bin', import.meta.url)).then(r => r.arrayBuffer()), MeshoptSimplifier.ready]);
const NV = new DataView(binBuf).getUint32(0, true), NI = new DataView(binBuf).getUint32(4, true);
const P0 = new Float32Array(binBuf, 8, NV * 3), I0 = new Uint16Array(binBuf.slice(8 + NV * 12, 8 + NV * 12 + NI * 2));
let MODEL_MIN_Y = Infinity; for (let i = 1; i < P0.length; i += 3) MODEL_MIN_Y = Math.min(MODEL_MIN_Y, P0[i]);
grid.position.y = MODEL_MIN_Y - 0.005;
const posAttr = new THREE.Float32BufferAttribute(P0, 3);
const geoCache = new Map();
function modelGeometry(k) {
  if (geoCache.has(k)) return geoCache.get(k);
  const idx = k >= LEVELS ? I0 : MeshoptSimplifier.simplify(I0, P0, 3, Math.min(NI, Math.round(k / LEVELS * NI / 3) * 3), 1, [])[0];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', posAttr); g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1)); g.computeVertexNormals();
  geoCache.set(k, g); return g;
}
// ─── Stone texture: one 2048 px image; each LOD texture is a copy of it at 1024, 512… (its own mip chain) ──
const ROCK_TEX = 2048;
const SIZE_CSS = ['#e04a3f', '#f0a030', '#e8e040', '#6cc04a', '#40b8c8', '#4a70e0', '#a050d8', '#e050a0', '#ffffff', '#888888', '#555555', '#333333'];
function rockTextureCanvas(N) {
  // Tileable value noise: every lattice wraps, so the texture repeats without seams.
  const frac = x => x - Math.floor(x);
  const lat = (P, seed) => { const a = new Float32Array(P * P); for (let i = 0; i < P * P; i++) a[i] = frac(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453); return a; };
  const OCT = [4, 8, 16, 32, 64, 128, 256, 512].map((P, k) => ({ P, L: lat(P, k + 1), L2: lat(P, k + 31) }));
  const noise = (o, x, y, alt) => {
    const P = o.P, L = alt ? o.L2 : o.L, fx = x * P, fy = y * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x0 = ix % P, y0 = iy % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
    const a = L[y0 * P + x0], b = L[y0 * P + x1], c = L[y1 * P + x0], d = L[y1 * P + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), D = img.data;
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const x = (px + 0.5) / N, y = (py + 0.5) / N;
    const lo = 0.5 * noise(OCT[0], x, y) + 0.3 * noise(OCT[1], x, y) + 0.2 * noise(OCT[2], x, y);
    const mid = 0.6 * noise(OCT[3], x, y) + 0.4 * noise(OCT[4], x, y);
    const hi = 0.45 * noise(OCT[5], x, y) + 0.35 * noise(OCT[6], x, y) + 0.2 * noise(OCT[7], x, y);
    const h = frac(Math.sin(px * 127.1 + py * 311.7) * 43758.5453), h2 = frac(Math.sin(px * 269.5 + py * 183.3) * 43758.5453);
    let v = 0.44 + 0.26 * (lo - 0.5) + 0.2 * (mid - 0.5) + 0.22 * (hi - 0.5) + 0.12 * (h - 0.5);
    if (h2 > 0.975) v *= 0.45; else if (h2 < 0.018) v = Math.min(1, v * 1.45);   // mineral grains, one texel each
    let r = v * 1.04, gg = v * 0.98, b = v * 0.9;
    const lich = 0.5 * noise(OCT[1], x, y, 1) + 0.3 * noise(OCT[2], x, y, 1) + 0.2 * noise(OCT[4], x, y, 1);
    const m = Math.max(0, Math.min(1, (lich - 0.6) / 0.06)) * (0.55 + 0.45 * hi);           // lichen patches
    r += (0.56 * (0.8 + 0.4 * hi) - r) * m * 0.85; gg += (0.57 * (0.8 + 0.4 * hi) - gg) * m * 0.85; b += (0.34 - b) * m * 0.85;
    const k = (py * N + px) * 4; D[k] = Math.min(255, r * 255); D[k + 1] = Math.min(255, gg * 255); D[k + 2] = Math.min(255, b * 255); D[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Thin cracks, drawn 9 times so they wrap across the edges.
  const rnd = i => frac(Math.sin(i * 91.7 + 7.3) * 43758.5453);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 26; i++) {
    let x = rnd(i) * N, y = rnd(i + 100) * N, a = rnd(i + 200) * Math.PI * 2; const pts = [[x, y]];
    for (let k = 0; k < 14; k++) { a += (rnd(i * 31 + k) - 0.5) * 1.1; x += Math.cos(a) * N * 0.012; y += Math.sin(a) * N * 0.012; pts.push([x, y]); }
    g.strokeStyle = `rgba(30,26,22,${0.55 + 0.3 * rnd(i + 300)})`; g.lineWidth = N / 1024 * (1 + 1.6 * rnd(i + 400));
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke(); }
  }
  return c;
}
// The mip chain, each copy averaged from the one above (2048, 1024 … 1).
function halfChain(base) { const out = [base]; let prev = base; for (let s = base.width / 2; s >= 1; s /= 2) { const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(prev, 0, 0, s, s); out.push(c); prev = c; } return out; }
let rockChain = null, rockChainTint = null;
const chainPlain = () => rockChain || (rockChain = halfChain(rockTextureCanvas(ROCK_TEX)));
const chainTint = () => rockChainTint || (rockChainTint = chainPlain().map((src, k) => { const c = document.createElement('canvas'); c.width = c.height = src.width; const g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalAlpha = 0.65; g.fillStyle = SIZE_CSS[Math.min(k, SIZE_CSS.length - 1)]; g.fillRect(0, 0, c.width, c.height); return c; }));
const texCache = new Map();
// The texture of a LOD at `res` px, with its own mips. tint: paint each mip with the colour of its size.
function rockTex(res, tint = false) {
  const key = res + (tint ? 't' : ''); if (texCache.has(key)) return texCache.get(key);
  const k = Math.round(Math.log2(ROCK_TEX / res)), chain = (tint ? chainTint() : chainPlain()).slice(k);
  const tx = new THREE.Texture(chain[0]); tx.mipmaps = chain; tx.generateMipmaps = false;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace;
  tx.minFilter = THREE.LinearMipmapLinearFilter; tx.magFilter = THREE.LinearFilter; tx.anisotropy = 4; tx.needsUpdate = true;
  texCache.set(key, tx); return tx;
}
// Triplanar projection: the texture is projected from X, Y and Z and blended by the normal (no UVs needed).
const TRI_GLSL = `#ifdef USE_MAP
  vec3 tw = pow(abs(normalize(vTriN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
  vec3 tq = vTriP / ${TEX_M.toFixed(1)};
  vec4 tcol = texture2D(map, tq.zy) * tw.x + texture2D(map, tq.xz + vec2(0.37, 0.61)) * tw.y + texture2D(map, tq.xy + vec2(0.71, 0.13)) * tw.z;
  diffuseColor *= tcol;
#endif`;
function triplanar(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vTriP;\nvarying vec3 vTriN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvTriP = position;\n\tvTriN = normal;');
    sh.fragmentShader = 'varying vec3 vTriP;\nvarying vec3 vTriN;\n' + sh.fragmentShader.replace('#include <map_fragment>', TRI_GLSL);
  };
  mat.customProgramCacheKey = () => 'stone-triplanar';
  return mat;
}
const rockMat = (res = ROCK_TEX) => triplanar(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, map: rockTex(res) }));
const WHITE = new THREE.Color(0xffffff);
const tintColor = i => new THREE.Color(LOD_COL[i]).lerp(WHITE, 0.3).multiplyScalar(1.25);
const matA = rockMat(), matB = rockMat();
const meshA = new THREE.Mesh(modelGeometry(LEVELS), matA), meshB = new THREE.Mesh(modelGeometry(LEVELS), matB);
const wireMatA = new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: true, transparent: true, opacity: 0.35 });
const wireA = new THREE.Mesh(meshA.geometry, wireMatA);
sceneModel.add(meshA, meshB, wireA);

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

// ─── Park of statues ──────────────────────────────────────────────────────────
const FIELD_ITEMS = fieldOf();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x6f7f52, roughness: 1 }));
const GROUND_Y = -0.45; ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; sceneField.add(ground);
const fieldMats = LODS.map((n, i) => rockMat(DEFAULT_TEX[i]));
const fieldMeshes = LODS.map((n, i) => { const m = new THREE.InstancedMesh(modelGeometry(n), fieldMats[i], FIELD_ITEMS.length); m.count = 0; m.frustumCulled = false; sceneField.add(m); return m; });
function updateField() {
  const st = S.st, th = [idealPct(LODS[1]), idealPct(LODS[2]), idealPct(LODS[3]), st.cull], counts = [0, 0, 0, 0], M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const it of FIELD_ITEMS) {
    const pct = screenPct(MODEL_H * it.s, it.d);
    let l = st.lods ? activeLod(pct, th, st.bias) : (st.cull > 0 && pct < st.cull ? -1 : 0);
    if (l < 0) continue;
    q.setFromAxisAngle(up, it.rot); M.compose(new THREE.Vector3(it.x, GROUND_Y - MODEL_MIN_Y * it.s, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
    fieldMeshes[l].setMatrixAt(counts[l]++, M);
  }
  fieldMeshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; fieldMats[i].color.copy(st.colors ? tintColor(i) : WHITE); });
  dirty = true;
}

// ─── Camera per scene ────────────────────────────────────────────────────────
const DIST_MIN = DIST_NEAR, DIST_MAX = 200;
const distToSlider = d => Math.round(1000 * Math.log(d / DIST_MIN) / Math.log(DIST_MAX / DIST_MIN));
const sliderToDist = v => DIST_MIN * (DIST_MAX / DIST_MIN) ** (v / 1000);
const viewDist = () => { const st = S.st; if (st.scene === 'decimate' && st.fixedD) return DECIMATE_D[st.sel - 1]; return st.dist; };
function placeCamera(keepDir = true) {
  const st = S.st;
  if (st.scene === 'model' || st.scene === 'decimate') {
    const dir = keepDir && camera.position.lengthSq() > 0 ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(-0.8, 0.2, 0.62).normalize();
    controls.target.set(0, 0, 0); camera.position.copy(dir.multiplyScalar(viewDist())); controls.enabled = true;
    controls.minDistance = controls.maxDistance = viewDist();
  } else if (st.scene === 'floor') {
    controls.enabled = false; camera.position.set(0, 1.6, 2); camera.lookAt(0, 0.2, -30);
  } else { controls.enabled = false; camera.position.set(0, 3.2, 2); camera.lookAt(0, 0, -45); }
  camera.fov = SCREEN.fov; camera.updateProjectionMatrix(); if (st.scene === 'model' || st.scene === 'decimate') controls.update(); dirty = true;
}

// ─── Model scene: which LOD, cross fade ───────────────────────────────────────
// Texture size of LOD i (Decimate keeps the LOD0 texture: it only removes triangles).
const texRes = i => (S.st.texRes && S.st.texRes[i]) || DEFAULT_TEX[i];
function modelState() {
  const st = S.st, d = viewDist(), pct = screenPct(MODEL_H, d);
  if (st.scene === 'decimate') { const f = slotLevels(st), i = st.sel; return { d, pct, lod: i, n: f[i], res: ROCK_TEX, fade: null }; }
  const lod = activeLod(pct, st.t);
  let fade = null;
  if (st.fade === 'cross' && st.fadeW > 0 && lod >= 0 && lod < 3) {
    // Unity: the fade happens in the last part of each LOD's range, before the next one takes over.
    const top = lod === 0 ? 100 : st.t[lod - 1], bottom = st.t[lod], band = (top - bottom) * st.fadeW;
    if (pct < bottom + band) fade = { to: lod + 1, k: 1 - (pct - bottom) / band };
  }
  return { d, pct, lod, n: lod >= 0 ? LODS[lod] : null, res: lod >= 0 ? texRes(lod) : null, fade };
}
function updateModel() {
  const st = S.st, r = modelState(), colors = st.colors && st.scene === 'model' && !st.mipView;
  const show = r.lod >= 0;
  meshA.visible = show; wireA.visible = show && S.wire;
  if (show) {
    meshA.geometry = modelGeometry(r.n); wireA.geometry = meshA.geometry;
    matA.color.copy(colors ? tintColor(r.lod) : WHITE); matA.map = rockTex(r.res, !!st.mipView);
  }
  // Cross fade: both LODs drawn with complementary dithered alpha (alpha hashing, as a dithered cross fade).
  meshB.visible = !!r.fade;
  for (const m of [matA, matB]) if (m.alphaHash !== !!r.fade) { m.alphaHash = !!r.fade; m.needsUpdate = true; }
  matA.opacity = r.fade ? 1 - r.fade.k : 1;
  if (r.fade) { meshB.geometry = modelGeometry(LODS[r.fade.to]); matB.color.copy(colors ? tintColor(r.fade.to) : WHITE); matB.map = rockTex(texRes(r.fade.to), !!st.mipView); matB.opacity = r.fade.k; }
  grid.visible = st.scene === 'model' || st.scene === 'decimate';
  if (st.scene === 'model' && r.lod >= 0 && !st.flags['seen' + r.lod]) { st.flags['seen' + r.lod] = true; saveData(); checkProgress(); }
  dirty = true; return r;
}

// ─── Insets at game resolution ───────────────────────────────────────────────
const rt = new THREE.WebGLRenderTarget(256, 256, { samples: 0 });
const insetCam = new THREE.PerspectiveCamera(10, 1, 0.05, 2000);
let insetBuf = new Uint8Array(256 * 256 * 4);
const SRGB = Uint8Array.from({ length: 256 }, (_, i) => { const c = i / 255; return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); });
// Render the model as the game would at 1080p: it covers objPx screen pixels. Shown 150 px wide:
// enlarged (pixelated) when it is smaller, reduced when it is bigger.
function drawInset(el, n, res) {
  const d = viewDist(), objPx = screenPct(MODEL_H, d) / 100 * SCREEN.h, S_px = Math.max(8, Math.min(720, Math.ceil(objPx * 1.35)));
  insetCam.fov = 2 * Math.atan(Math.tan(SCREEN.fov * Math.PI / 360) * S_px / SCREEN.h) * 180 / Math.PI; insetCam.aspect = 1; insetCam.updateProjectionMatrix();
  insetCam.position.copy(camera.position); insetCam.quaternion.copy(camera.quaternion);
  const vis = [meshA.visible, meshB.visible, wireA.visible, grid.visible], geo = meshA.geometry, col = matA.color.clone(), map = matA.map, hash = matA.alphaHash, op = matA.opacity;
  meshB.visible = false; wireA.visible = false; grid.visible = false; meshA.visible = true; meshA.geometry = modelGeometry(n); matA.color.copy(WHITE); matA.map = rockTex(res); matA.opacity = 1;
  if (hash) { matA.alphaHash = false; matA.needsUpdate = true; }
  if (insetBuf.length < S_px * S_px * 4) insetBuf = new Uint8Array(S_px * S_px * 4);
  rt.setSize(S_px, S_px); renderer.setRenderTarget(rt); renderer.setClearColor(0x3a3a3a, 1); renderer.clear(); renderer.setClearColor(0x000000, 0); renderer.render(sceneModel, insetCam);
  renderer.readRenderTargetPixels(rt, 0, 0, S_px, S_px, insetBuf); renderer.setRenderTarget(null);
  [meshA.visible, meshB.visible, wireA.visible, grid.visible] = vis; meshA.geometry = geo; matA.color.copy(col); matA.map = map; matA.opacity = op;
  if (hash) { matA.alphaHash = true; matA.needsUpdate = true; }
  const img = new ImageData(S_px, S_px);
  for (let y = 0; y < S_px; y++) for (let x = 0; x < S_px; x++) { const a = ((S_px - 1 - y) * S_px + x) * 4, b = (y * S_px + x) * 4; for (let k = 0; k < 3; k++) img.data[b + k] = SRGB[insetBuf[a + k]]; img.data[b + 3] = 255; }
  const off = document.createElement('canvas'); off.width = off.height = S_px; off.getContext('2d').putImageData(img, 0, 0);
  const g = el.getContext('2d'); g.imageSmoothingEnabled = S_px > el.width; g.imageSmoothingQuality = 'high'; g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, el.width, el.height); g.drawImage(off, 0, 0, el.width, el.height);
  return S_px;
}
function updateInsets(r) {
  const on = (S.st.scene === 'model' || S.st.scene === 'decimate') && r && r.n;
  $('#insets').hidden = !on; if (!on) return;
  const px = drawInset($('#inset-a'), LEVELS, S.st.scene === 'decimate' ? ROCK_TEX : texRes(0)); drawInset($('#inset-b'), r.n, r.res);
  $('#inset-b-cap').textContent = `LOD${r.lod} · ${fmt(lodTris(r.n))}`;
  const k = 150 / px;
  $('#inset-note').textContent = tr(k >= 1 ? '{p} × {p} screen pixels, enlarged ×{k}' : '{p} × {p} screen pixels, reduced ×{k}', { p: px, k: k.toFixed(k >= 1 ? 1 : 2) });
}

// ─── Close-up: the LOD in use, always seen from near ─────────────────────────
// A second renderer draws the mesh the engine is using now from 2.3 m, with its wireframe and its own texture,
// so the student sees the triangles and the texture change when the main camera moves away.
const cuCanvas = $('#closeup-c');
const cuRenderer = new THREE.WebGLRenderer({ canvas: cuCanvas, antialias: true });
cuRenderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const cuCam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const cuWire = new THREE.Mesh(meshA.geometry, new THREE.MeshBasicMaterial({ color: 0x0c0c0c, wireframe: true, transparent: true, opacity: 0.38, depthWrite: false }));
cuWire.visible = false; sceneModel.add(cuWire);
let cuSize = 0;
function drawCloseup(r) {
  const box = $('#closeup'), modelish = S.st.scene === 'model' || S.st.scene === 'decimate';
  box.hidden = !modelish; if (!modelish) return;
  const w = cuCanvas.clientWidth | 0; if (w && w !== cuSize) { cuSize = w; cuRenderer.setSize(w, w, false); }
  if (!r.n) { box.classList.add('culled'); $('#closeup-cap').textContent = t('Culled: nothing is drawn'); return; }
  box.classList.remove('culled');
  const dir = camera.position.clone().sub(controls.target).normalize();
  cuCam.position.copy(dir.multiplyScalar(2.3)).add(new THREE.Vector3(0, 0.1, 0)); cuCam.lookAt(0, 0.1, 0);
  const vis = [meshA.visible, meshB.visible, wireA.visible, grid.visible], hash = matA.alphaHash, op = matA.opacity;
  meshA.visible = true; meshB.visible = false; wireA.visible = false; grid.visible = false; cuWire.visible = true; cuWire.geometry = meshA.geometry;
  if (hash) { matA.alphaHash = false; matA.opacity = 1; matA.needsUpdate = true; }
  cuRenderer.render(sceneModel, cuCam);
  [meshA.visible, meshB.visible, wireA.visible, grid.visible] = vis; cuWire.visible = false;
  if (hash) { matA.alphaHash = true; matA.opacity = op; matA.needsUpdate = true; }
  $('#closeup-cap').textContent = `LOD${r.lod} · ${fmt(lodTris(r.n))} tris · ${r.res} px`;
}

// ─── Viewport text ───────────────────────────────────────────────────────────
// The mip the GPU reads on the faces turned to the camera: log2(texels per metre ÷ screen pixels per metre).
function gpuMip(res, d) { const level = Math.min(Math.round(Math.log2(res)), Math.round(mipLevel(texelsPerM(res), ppm(d)))); return { level, size: Math.max(1, res >> level) }; }
function vpText(r) {
  const st = S.st, el = $('#vp-text');
  if (st.scene === 'model' || st.scene === 'decimate') {
    const lodTxt = r.lod < 0 ? t('Culled: not drawn') : `LOD${r.lod}${r.fade ? ` → LOD${r.fade.to} (${Math.round(r.fade.k * 100)} %)` : ''}`;
    const err = r.n ? errorPx(lodError(r.n), r.d) : 0;
    const mip = r.n ? gpuMip(r.res, r.d) : null;
    el.innerHTML = `<b>${esc(lodTxt)}</b>\n${esc(t('Distance'))} ${r.d.toFixed(1)} m · ${esc(t('Screen height'))} ${r.pct.toFixed(1)} %\n${r.n ? `${esc(t('Triangles'))} ${fmt(lodTris(r.n))} · ${esc(t('Error on screen'))} ${err.toFixed(2)} px\n${esc(t('Texture'))} ${r.res} px · ${esc(t('the GPU reads'))} ${mip.size} px (mip ${mip.level})` : ''}`;
  } else if (st.scene === 'floor') {
    el.innerHTML = `<b>${esc(st.mips ? t('Mipmaps on') : t('Mipmaps off'))}</b>\n${esc(t('Filter'))}: ${st.mips ? (st.filter === 'bilinear' ? 'Bilinear' : 'Trilinear') : 'Bilinear, no mips'}${st.mips && st.aniso > 1 ? ` · Anisotropic ×${Math.min(st.aniso, MAX_ANISO)}` : ''}\n${esc(t('Floor texture'))}: 1024 px · 512 px/m`;
  } else {
    const s = budgetStats(st);
    el.innerHTML = `<b>${esc(t('Triangles drawn'))}: ${fmt(s.tris)}</b> / ${fmt(BUDGET)}\n${esc(t('Statues drawn'))}: ${s.drawn} / ${FIELD_ITEMS.length} · ${esc(t('Worst error'))}: ${s.worst.toFixed(2)} px`;
  }
}

// ─── Render loop ─────────────────────────────────────────────────────────────
let lastR = null;
function render() {
  const st = S.st;
  if (st.scene === 'model' || st.scene === 'decimate') { renderer.render(sceneModel, camera); }
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
  if (st.scene === 'model' || st.scene === 'decimate') { lastR = updateModel(); updateInsets(lastR); drawCloseup(lastR); vpText(lastR); }
  else { $('#insets').hidden = true; $('#closeup').hidden = true; vpText(null); }
  $('#mip-legend').hidden = !((st.scene === 'model' || st.scene === 'decimate') && st.mipView);
  render();
}
requestAnimationFrame(frameLoop);

// ─── Play: camera dolly (model) or sway (floor) ───────────────────────────────
function togglePlay(on = !S.play) {
  const st = S.st; if (!st) return;
  if (on && !(st.scene === 'model' || st.scene === 'floor')) { msg('Play works on the bunny and on the floor.'); return; }
  S.play = on ? { t0: performance.now(), from: st.dist, crossAtStart: st.fade === 'cross' && st.fadeW >= 0.1, mipsOffAtStart: !st.mips } : null;
  $('#play-btn').setAttribute('aria-pressed', String(!!S.play)); $('#play-btn').textContent = t(S.play ? '■ Stop' : '▶ Play');
  if (!on && st.scene === 'floor') placeCamera();
}
function stepPlay(now) {
  const st = S.st, p = S.play, k = (now - p.t0) / 1000;
  if (st.scene === 'model') {
    const T = 9, u = Math.min(1, k / T);
    st.dist = 2 * (60 / 2) ** u; syncDist(); refreshLodPanel(); dirty = true;
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
  const st = S.st, r = modelState(), rep = thresholdReport(st.t);
  const bounds = [100, ...st.t, 0], segs = [0, 1, 2, 3, 4].map(i => ({ i, w: bounds[i] - bounds[i + 1] }));
  const camX = 100 - Math.min(100, r.pct);
  const bar = `<div class="lodbar" id="lodbar" data-edit="${editable ? 1 : 0}">${segs.map(s => `<span style="flex:${Math.max(0.0001, s.w)};background:${LOD_CSS[s.i]}"><b data-no-i18n>${s.i < 4 ? 'LOD ' + s.i : 'Culled'}</b><small data-no-i18n>${s.i < 4 ? bounds[s.i].toFixed(s.i ? 1 : 0) + '%' : ''}</small></span>`).join('')}<i class="cam" style="left:calc(${camX}% - 1px)"></i></div>`;
  const rows = rep.map(x => `<div class="lod-row ${x.early || x.late ? 'bad' : 'good'}${r.lod === x.i ? ' cur' : ''}"><b data-no-i18n>LOD${x.i}</b>${editable ? `<input type="number" data-t="${x.i - 1}" value="${x.pct}" step="0.1" min="0.2" max="99">` : `<span data-no-i18n>${x.pct.toFixed(1)} %</span>`}<em data-no-i18n>${x.e.toFixed(2)} px</em><small>${esc(t(x.early ? 'too early' : x.late ? 'too late' : 'good'))}</small></div>`).join('');
  return `<div class="panel"><h4><span data-no-i18n>LOD Group</span><small>${esc(t('% of screen height'))}</small></h4>${bar}
    <div class="lod-rows"><div class="lod-row" style="background:none;border:0"><span></span><small>${esc(t('starts at'))}</small><small style="text-align:right">${esc(t('error at switch'))}</small><span></span></div>${rows}</div>
    ${statRow('Culled below', st.t[3] + ' %')}
    <p class="td-note">${esc(t('The yellow line is the bunny now. Aim for 0.5–1 px of error when each LOD switches in.'))}</p></div>`;
}
function fadePanel() {
  const st = S.st;
  return `<div class="panel"><h4><span data-no-i18n>Fade Mode</span></h4>
    <div class="mod-row"><span data-no-i18n>Fade Mode</span><select id="fade" data-no-i18n><option value="none"${st.fade === 'none' ? ' selected' : ''}>None</option><option value="cross"${st.fade === 'cross' ? ' selected' : ''}>Cross Fade</option></select><span></span></div>
    <div class="mod-row"><span data-no-i18n>Fade Transition Width</span><input type="range" id="fadeW" min="0" max="1" step="0.05" value="${st.fadeW}"${st.fade === 'cross' ? '' : ' disabled'}><output data-no-i18n>${st.fadeW.toFixed(2)}</output></div>
    <p class="td-note">${esc(t('Width: the part of each LOD\'s range used to blend into the next one.'))}</p></div>`;
}
function modelPanel() {
  const r = modelState(), st = S.st, mip = r.n ? gpuMip(r.res, r.d) : null;
  return `<div class="panel"><h4>${esc(t('Readout'))}</h4>
    ${statRow('LOD in use', r.lod < 0 ? t('Culled') : `LOD${r.lod}`)}${statRow('Triangles', r.n ? fmt(lodTris(r.n)) : '0')}
    ${statRow('Texture', r.n ? `${r.res} px · ${texelsPerM(r.res)} px/m` : '—')}
    ${statRow('Screen height', r.pct.toFixed(1) + ' %')}${statRow('1 m on screen', Math.round(ppm(r.d)) + ' px')}
    ${statRow('Mip the GPU reads', mip ? `mip ${mip.level} · ${mip.size} px` : '—')}
    ${statRow('Error on screen', r.n ? errorPx(lodError(r.n), r.d).toFixed(2) + ' px' : '—', r.n && errorPx(lodError(r.n), r.d) > 1.0001 ? 'bad' : 'good')}
    <div class="lod-rows">${LODS.map((n, i) => `<div class="lod-row lod-row-tex${r.lod === i ? ' cur' : ''}" style="border-left-color:${LOD_CSS[i]}"><b data-no-i18n>LOD${i}</b><span data-no-i18n>${fmt(lodTris(n))} tris</span><span data-no-i18n>${texRes(i)} px</span><em data-no-i18n>${(lodError(n) * 1000).toFixed(1)} mm</em><small>${st.flags['seen' + i] ? '✓' : ''}</small></div>`).join('')}</div>
    ${sid() === 'lt' ? '' : statRow('Texture memory (4 LODs)', texMemory(st.texRes || DEFAULT_TEX).toFixed(1) + ' MB')}
    <p class="td-note">${esc(t('mm: how far each LOD is from the surface of LOD0. Memory: uncompressed RGBA with mips.'))}</p></div>`;
}
const VERDICT = r => r.blurry ? 'blurry' : r.wasted ? 'wasted' : 'good';
function texPanel() {
  const st = S.st, rep = texReport(st.texRes, st.t), r = modelState(), all = texMemory([2048, 2048, 2048, 2048]), now = texMemory(st.texRes);
  const rows = rep.map(x => `<div class="tex-row ${x.blurry || x.wasted ? 'bad' : 'good'}${r.lod === x.i ? ' cur' : ''}"><b data-no-i18n>LOD${x.i}</b>
    <select data-tex="${x.i}" data-no-i18n>${TEX_SIZES.map(z => `<option value="${z}"${z === x.res ? ' selected' : ''}>${z} px</option>`).join('')}</select>
    <span data-no-i18n>1 m = ${Math.round(x.px)} px<small>${esc(tr('from {d} m', { d: x.d.toFixed(1) }))}</small></span>
    <em data-no-i18n>${x.k.toFixed(2)}</em><small>${esc(t(VERDICT(x)))}</small></div>`).join('');
  return `<div class="panel"><h4>${esc(t('LOD textures'))}<small>${esc(t('texels per pixel'))}</small></h4>
    <div class="tex-rows">${rows}</div>
    ${statRow('Texture memory (4 LODs)', `${now.toFixed(1)} MB`, texOk(st) ? 'good' : '')}${statRow('Same 2048 px texture on all', `${all.toFixed(1)} MB`)}
    <p class="td-note">${esc(t('Texels per pixel = texture px/m ÷ screen px per metre where that LOD starts. Under 1: blurry. 2 or more: memory that never shows.'))}</p></div>`;
}
const DEC_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13 8 3l6 10z M5 13l3-5 3 5" fill="none" stroke="currentColor"/></svg>';
function decimatePanel() {
  const st = S.st, f = slotLevels(st), tris = slotTris(st), T0 = tris[0], i = st.sel, fixed = !!st.fixedD, isQuiz = sid() === 'd3';
  const okSlot = k => fixed ? decimateOk(f[k], DECIMATE_D[k - 1]) : Math.abs(tris[k] / T0 - TRI_TARGETS[k - 1]) <= TRI_TARGETS[k - 1] * 0.1;
  const tabs = [0, 1, 2, 3].map(k => `<button type="button" data-slot="${k}" aria-pressed="${k === i}" class="${k && okSlot(k) && !isQuiz ? 'ok' : ''}"${k === 0 ? ' disabled' : ''}><span data-no-i18n>LOD${k}</span><small data-no-i18n>${fmt(tris[k])}</small></button>`).join('');
  const r = st.ratios[i - 1], err = errorPx(lodError(f[i]), viewDist());
  return `<div class="panel"><h4>${esc(t('Copies'))}<small data-no-i18n>Bunny_LOD0…3</small></h4><div class="slot-tabs">${tabs}</div>
    <div class="mod-box"><h5>${DEC_ICON}<span data-no-i18n>Decimate</span><small style="margin-left:auto;color:#999" data-no-i18n>Bunny_LOD${i}</small></h5>
    <div class="mod-row"><span data-no-i18n>Mode</span><select disabled data-no-i18n><option>Collapse</option></select><span></span></div>
    <div class="mod-row"><span data-no-i18n>Ratio</span><input type="range" id="ratio" min="0.0025" max="1" step="0.0025" value="${r}"${isQuiz ? ' disabled' : ''}><output data-no-i18n>${r.toFixed(4)}</output></div>
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
    ${statRow('Statues drawn', `${s.drawn} / ${FIELD_ITEMS.length}`)}
    ${statRow('LOD0 · LOD1 · LOD2 · LOD3', s.per.join(' · '))}
    ${statRow('Worst error', s.worst.toFixed(2) + ' px', s.worst <= 1.0001 ? 'good' : 'bad')}
    ${statRow('Visible statues culled', String(s.lostBig), s.lostBig ? 'bad' : 'good')}
    <p class="td-note ${ok ? 'good' : ''}">${esc(t(ok ? '✓ Inside the budget, with no visible change.' : 'Visible statues culled: statues bigger than 1 % of the screen height that are not drawn.'))}</p></div>`;
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
  if (id === 'l1') h = modelPanel() + lodGroupPanel(false);
  else if (id === 'l2') h = lodGroupPanel(true) + modelPanel();
  else if (id === 'lt') h = texPanel() + modelPanel();
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
  if (el.dataset.tex != null) { st.texRes[+el.dataset.tex] = +el.value; }
  else if (el.dataset.t != null) { const k = +el.dataset.t, v = parseFloat(el.value); if (Number.isFinite(v)) { st.t[k] = Math.max(0.2, Math.min(99, v)); } }
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
  const st = S.st; if (!(st.scene === 'model' || st.scene === 'decimate') || st.fixedD) return;
  e.preventDefault(); st.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, st.dist * Math.exp(e.deltaY * 0.0012))); syncDist(); changed(false, true);
  clearTimeout(wheelT); wheelT = setTimeout(() => changed(), 250);
}, { passive: false });
let wheelT;
$('#wire-btn').addEventListener('click', () => { S.wire = !S.wire; renderHeaders(); dirty = true; });
$('#colors-btn').addEventListener('click', () => { pushUndo(); S.st.colors = !S.st.colors; changed(); });
$('#mipcol-btn').addEventListener('click', () => { pushUndo(); S.st.mipView = !S.st.mipView; changed(); });
$('#play-btn').addEventListener('click', () => togglePlay());
function renderHeaders() {
  const st = S.st, modelish = st.scene === 'model' || st.scene === 'decimate';
  $('#dist-field').hidden = !modelish; $('#dist').disabled = !!st.fixedD;
  $('#wire-btn').hidden = !modelish; $('#wire-btn').setAttribute('aria-pressed', String(S.wire));
  $('#colors-btn').hidden = st.scene !== 'model' && st.scene !== 'field'; $('#colors-btn').setAttribute('aria-pressed', String(!!st.colors));
  $('#mipcol-btn').hidden = !modelish; $('#mipcol-btn').setAttribute('aria-pressed', String(!!st.mipView));
  $('#play-btn').hidden = !(st.scene === 'model' || st.scene === 'floor');
  $('#vp-hint').textContent = t(modelish ? 'LMB drag orbit · Wheel distance' : st.scene === 'floor' ? 'Press Play to move the camera' : 'Fixed game camera');
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
    if (a.id === 'ratio' && out) { out.textContent = (+a.value).toFixed(4); }
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
window.__lod = { S, STAGES, texOk, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, solve: () => { step().solve(S.st); sceneChanged(); changed(); }, modelState, budgetStats, MAX_ANISO };
