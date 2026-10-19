// Outliner Lab: a 3D Viewport with a camera render, Blender's Outliner and a Properties editor, all driven by
// the scene model of outliner.js. Every row, toggle, menu and shortcut acts on that model.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { ROOT, COLOR_TAGS, OPS, makeObject, uniqueName, collectionsOf, descendants, parentOf, objectVisible, objectSelectable, collectionVisible, drawn, users, totalUsers, unusedData, viewLayerTree, blenderFileTree, unusedTree, searchTree, flatten } from './outliner.js?v=1';
import { STAGES, startState } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-outliner:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-outliner:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = { stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [], done: store.get('done', {}), hover: null, rows: [], anchor: null, renaming: null, slot: 0, dataSel: null, mouse: [200, 200], drag: null, purgeRecursive: true, showRender: store.get('render', true) };
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step];
const sc = () => S.st.scene;
let msgTimer;
function msg(text, warning = false) { const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning); clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 7000); }

// ─── Icons (Blender-like, 16 px) ─────────────────────────────────────────────
const svg = (body, cls = '') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
const IC = {
  scene: svg('<rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2 6h12" stroke="currentColor"/>'),
  coll: c => svg(`<rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.4" fill="none" stroke="${c || '#e6e6e6'}" stroke-width="1.4"/><path d="M5 6.2h6M5 9.8h6" stroke="${c || '#e6e6e6'}" stroke-width="1.2"/>`),
  MESH: svg('<path d="M3 4.5 13 3.5 8.5 13z" fill="#f0a33a33" stroke="#f0a33a" stroke-width="1.3" stroke-linejoin="round"/><circle cx="3" cy="4.5" r="1.6" fill="#f0a33a"/><circle cx="13" cy="3.5" r="1.6" fill="#f0a33a"/><circle cx="8.5" cy="13" r="1.6" fill="#f0a33a"/>'),
  LIGHT: svg('<circle cx="8" cy="6.5" r="3.6" fill="none" stroke="#f0a33a" stroke-width="1.4"/><path d="M6.2 11h3.6M6.6 13.2h2.8" stroke="#f0a33a" stroke-width="1.3"/>'),
  CAMERA: svg('<rect x="1.8" y="4.5" width="8.5" height="7" rx="1" fill="none" stroke="#f0a33a" stroke-width="1.4"/><path d="M10.3 7.2 14.2 5v6l-3.9-2.2" fill="none" stroke="#f0a33a" stroke-width="1.3"/>'),
  EMPTY: svg('<path d="M8 1.8v12.4M1.8 8h12.4M3.6 3.6l8.8 8.8" stroke="#f0a33a" stroke-width="1.3"/>'),
  INSTANCE: svg('<rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.4" fill="none" stroke="#f0a33a" stroke-width="1.4"/><path d="M5 6.2h6M5 9.8h6" stroke="#f0a33a" stroke-width="1.2"/>'),
  mesh: svg('<path d="M8 2.2 13.6 12.8H2.4z" fill="none" stroke="#6fd46f" stroke-width="1.4"/>'),
  material: svg('<circle cx="8" cy="8" r="5.6" fill="url(#g)" stroke="#e57b8e" stroke-width="1.2"/><defs><radialGradient id="g" cx=".35" cy=".35"><stop offset="0" stop-color="#ffd3db"/><stop offset="1" stop-color="#b3445a"/></radialGradient></defs>'),
  image: svg('<rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="#c8a2ff" stroke-width="1.3"/><path d="m3.5 11.5 3-3.5 2.2 2.3 1.6-1.6 2.2 2.8" fill="none" stroke="#c8a2ff" stroke-width="1.1"/>'),
  object: svg('<rect x="3" y="3" width="10" height="10" rx="1.5" fill="none" stroke="#f0a33a" stroke-width="1.4"/>'),
  collection: svg('<rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.4" fill="none" stroke="#e6e6e6" stroke-width="1.4"/><path d="M5 6.2h6M5 9.8h6" stroke="#e6e6e6" stroke-width="1.2"/>'),
  file: svg('<path d="M3.5 1.8h6l3 3v9.4h-9z" fill="none" stroke="#cfcfcf" stroke-width="1.3"/><path d="M9.5 1.8v3h3" fill="none" stroke="#cfcfcf"/>'),
  eyeOn: svg('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>'),
  eyeOff: svg('<path d="M2 8.5s2.4 3 6 3 6-3 6-3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 10.6 3 12.2M8 11.6v1.8M12 10.6l1 1.6" stroke="currentColor" stroke-width="1.2"/>'),
  monOn: svg('<rect x="1.8" y="2.5" width="12.4" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 13.5h5M8 11v2.5" stroke="currentColor" stroke-width="1.3"/>'),
  monOff: svg('<rect x="1.8" y="2.5" width="12.4" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.6"/><path d="M5.5 13.5h5" stroke="currentColor" stroke-width="1.3"/>'),
  camOn: svg('<rect x="1.8" y="4.5" width="8.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.3 7.2 14.2 5v6l-3.9-2.2" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  camOff: svg('<rect x="1.8" y="4.5" width="8.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.6"/><path d="M10.3 7.2 14.2 5v6l-3.9-2.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.6"/>'),
  selOn: svg('<path d="M4 2v10.5l2.8-2.7 2 4.2 1.8-.9-2-4.1h3.9z" fill="currentColor"/>'),
  selOff: svg('<path d="M4 2v10.5l2.8-2.7 2 4.2 1.8-.9-2-4.1h3.9z" fill="none" stroke="currentColor" stroke-width="1.1"/>'),
  holdout: svg('<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor"/>'),
  indirect: svg('<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2.2 1.6"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>'),
  shield: svg('<path d="M8 1.8 13 3.6v4c0 3.2-2.2 5.4-5 6.6-2.8-1.2-5-3.4-5-6.6v-4z" fill="currentColor"/>'),
  shieldOff: svg('<path d="M8 1.8 13 3.6v4c0 3.2-2.2 5.4-5 6.6-2.8-1.2-5-3.4-5-6.6v-4z" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  check: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2.2" fill="#4772b3"/><path d="m4.8 8.2 2.2 2.2 4.3-4.6" fill="none" stroke="#fff" stroke-width="1.8"/>'),
  uncheck: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2.2" fill="#545454" stroke="#222"/>'),
};
const objIcon = o => (o.instanceOf ? IC.INSTANCE : IC[o.type] || IC.MESH);
const collColor = c => COLOR_TAGS[c?.color] || null;

// ─── three.js: 3D Viewport and camera render ─────────────────────────────────
const b2t = v => [v[0], v[2], -v[1]];
function makeView(canvasSel, hostSel, bg, orbit) {
  const canvas = $(canvasSel), host = $(hostSel);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(orbit ? 38 : 50, 16 / 9, 0.05, 300);
  const v = { canvas, host, renderer, scene, camera, dirty: true, root: new THREE.Group() };
  if (orbit) { v.controls = new OrbitControls(camera, canvas); v.controls.enableDamping = false; v.controls.addEventListener('change', () => { v.dirty = true; }); }
  scene.add(v.root);
  new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); v.dirty = true; }).observe(host);
  return v;
}
const VV = makeView('#v-view', '#v-host', 0x3d3d3d, true);
const RV = makeView('#r-view', '#r-box', 0x121417, false);
RV.renderer.toneMapping = THREE.ACESFilmicToneMapping; RV.renderer.toneMappingExposure = 1.1;
RV.renderer.shadowMap.enabled = true; RV.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
(function () {
  VV.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.7));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(4, 9, 6); VV.scene.add(d);
  const g = new THREE.GridHelper(40, 40, 0x575757, 0x4a4a4a); g.position.y = -0.12; VV.scene.add(g);
  const line = (a, b, c) => VV.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), new THREE.LineBasicMaterial({ color: c })));
  line([-20, -0.11, 0], [20, -0.11, 0], 0xb9474f); line([0, -0.11, -20], [0, -0.11, 20], 0x6f9e2c);
  RV.scene.add(new THREE.HemisphereLight(0x9fb3cc, 0x201a14, 0.35));
})();
function canvasTex(draw, w = 256, h = 256) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; }
const REF_TEX = canvasTex((g, w, h) => {
  g.fillStyle = '#efeadf'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6b6254'; g.lineWidth = 3;
  g.strokeRect(20, 30, 90, 70); g.beginPath(); g.moveTo(140, 110); g.lineTo(200, 40); g.lineTo(240, 110); g.stroke();
  g.fillStyle = '#6b6254'; g.font = 'bold 26px sans-serif'; g.fillText('REFERENCE', 42, 180); g.font = '16px sans-serif'; g.fillText('dungeon · concept 03', 50, 210);
}, 256, 256);
const matCache = new Map();
function material(name, mode, s) {
  const m = s.materials[name] || { color: '#bdbdbd' }, key = `${mode}|${name}|${m.color}`;
  if (!matCache.has(key)) {
    let mat;
    if (name === 'M_Collision') mat = new THREE.MeshStandardMaterial({ color: m.color, transparent: mode === 'view', opacity: mode === 'view' ? 0.06 : 1, roughness: 0.8, depthWrite: mode !== 'view' });
    else if (name === 'M_Reference') mat = new THREE.MeshStandardMaterial({ map: REF_TEX, roughness: 1, side: THREE.DoubleSide });
    else mat = new THREE.MeshStandardMaterial({ color: m.color, roughness: name === 'M_Metal' || name === 'M_Gold' ? 0.35 : 0.8, metalness: name === 'M_Metal' || name === 'M_Gold' ? 0.8 : 0, emissive: name === 'M_Torch' ? 0xff7a1a : 0x000000, emissiveIntensity: name === 'M_Torch' ? 1.4 : 0 });
    matCache.set(key, mat);
  }
  return matCache.get(key);
}
function partMesh(p, off, mat) {
  let m;
  if (p.box) { const [c, z] = p.box; m = new THREE.Mesh(new THREE.BoxGeometry(z[0], z[2], z[1]), mat); m.position.set(...b2t([c[0] + off[0], c[1] + off[1], c[2] + off[2]])); }
  else { const [c, r, h] = p.cyl; m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), mat); m.position.set(...b2t([c[0] + off[0], c[1] + off[1], c[2] + h / 2 + off[2]])); }
  return m;
}
function clearGroup(g) { for (const c of [...g.children]) { g.remove(c); c.traverse(x => { if (x.geometry) x.geometry.dispose(); }); } }
const lineMat = c => new THREE.LineBasicMaterial({ color: c });
function helper(o, off, color) {
  const g = new THREE.Group(), p = b2t(o.loc.map((v, k) => v + off[k]));
  const seg = pts => { const geo = new THREE.BufferGeometry().setFromPoints(pts.map(q => new THREE.Vector3(...q))); g.add(new THREE.LineSegments(geo, lineMat(color))); };
  if (o.type === 'LIGHT') {
    if (o.light === 'SUN') { const ring = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2; ring.push([Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25], [Math.cos(b) * 0.25, 0, Math.sin(b) * 0.25]); } seg(ring); const dir = new THREE.Vector3(...b2t(o.loc)).normalize().multiplyScalar(-1.6); seg([[0, 0, 0], [dir.x, dir.y, dir.z]]); }
    else if (o.light === 'AREA') seg([[-0.3, 0, -0.3], [0.3, 0, -0.3], [0.3, 0, -0.3], [0.3, 0, 0.3], [0.3, 0, 0.3], [-0.3, 0, 0.3], [-0.3, 0, 0.3], [-0.3, 0, -0.3], [0, 0, 0], [0, -0.6, 0]]);
    else { const ring = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2; ring.push([Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0], [Math.cos(b) * 0.14, Math.sin(b) * 0.14, 0]); } seg(ring); seg([[0, -0.14, 0], [0, -p[1], 0]]); }
  } else if (o.type === 'CAMERA') {
    const tgt = new THREE.Vector3(...b2t([0, 0.6, 0.2])), pos = new THREE.Vector3(...p), f = tgt.clone().sub(pos).normalize(), r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), u = new THREE.Vector3().crossVectors(r, f);
    const c = k => f.clone().multiplyScalar(0.9).add(r.clone().multiplyScalar(k[0] * 0.55)).add(u.clone().multiplyScalar(k[1] * 0.32));
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(c).map(v => [v.x, v.y, v.z]);
    seg([[0, 0, 0], q[0], [0, 0, 0], q[1], [0, 0, 0], q[2], [0, 0, 0], q[3], q[0], q[1], q[1], q[2], q[2], q[3], q[3], q[0]]);
    const tri = u.clone().multiplyScalar(0.5).add(f.clone().multiplyScalar(0.9)); seg([q[3], [tri.x, tri.y, tri.z], [tri.x, tri.y, tri.z], q[2]]);
  } else { const L = o.instanceOf ? 0.3 : 0.4; seg([[-L, 0, 0], [L, 0, 0], [0, -L, 0], [0, L, 0], [0, 0, -L], [0, 0, L]]); }
  g.position.set(...p);
  const pickR = o.type === 'CAMERA' ? 0.45 : 0.28, pickM = new THREE.Mesh(new THREE.SphereGeometry(pickR, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  pickM.userData.name = o.name; g.add(pickM);
  return g;
}
let pickables = [];
function buildViewport() {
  const s = sc(), g = VV.root; clearGroup(g); pickables = [];
  for (const e of drawn(s, 'viewport')) {
    const o = e.obj, via = e.via, sel = s.sel.includes(via || o.name), act = s.active === (via || o.name);
    const selColor = act ? 0xffd08a : 0xff8c1a;
    if (o.parts?.length) {
      for (const p of o.parts) {
        const m = partMesh(p, e.offset, material(o.mats[0], 'view', s)); m.userData.name = via || o.name; g.add(m); pickables.push(m);
        if (o.collision) { const w = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), lineMat(0x5fe05f)); w.position.copy(m.position); g.add(w); }
        if (o.high) { const w = new THREE.LineSegments(new THREE.WireframeGeometry(m.geometry), lineMat(0x2a2a2a)); w.position.copy(m.position); g.add(w); }
        if (sel) { const ed = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: selColor })); ed.position.copy(m.position); ed.renderOrder = 3; g.add(ed); }
      }
    } else { const h = helper(o, e.offset, sel ? selColor : 0x111111); g.add(h); pickables.push(h.children[h.children.length - 1]); }
  }
  // the 3D cursor
  const cur = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 28), new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false }));
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); ring2.position.z = 0.002;
  cur.add(ring, ring2); cur.children.forEach(c => { c.renderOrder = 8; }); cur.position.set(...b2t(s.cursor)); g.add(cur);
  VV.cursor = cur;
  $('#v-overlay').innerHTML = `<div>User Perspective</div><div>(1) ${esc(s.activeColl)} | ${esc(s.active || '')}</div>`;
  VV.dirty = true;
}
function buildRender() {
  const s = sc(), g = RV.root; clearGroup(g);
  const cam = s.objects.Camera;
  RV.camera.position.set(...b2t(cam ? cam.loc : [0, -7.5, 7.5])); RV.camera.lookAt(...b2t([0, 0.6, 0.2]));
  if (!S.showRender) return;
  const holdoutMat = new THREE.MeshBasicMaterial({ color: 0x121417 });
  const holdout = name => collectionsOf(s, name).some(c => [c, ...pathToRoot(c)].some(n => s.collections[n]?.holdout));
  for (const e of drawn(s, 'render')) {
    const o = e.obj;
    if (o.parts?.length) for (const p of o.parts) { const m = partMesh(p, e.offset, holdout(o.name) ? holdoutMat : material(o.mats[0], 'render', s)); m.castShadow = m.receiveShadow = true; g.add(m); }
    else if (o.type === 'LIGHT') {
      const pos = b2t(o.loc.map((v, k) => v + e.offset[k]));
      if (o.light === 'SUN') { const l = new THREE.DirectionalLight(0xfff0dc, 1.5); l.position.set(...pos); l.castShadow = true; l.shadow.mapSize.set(1024, 1024); Object.assign(l.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 }); l.shadow.bias = -0.0008; g.add(l); g.add(l.target); }
      else { const l = new THREE.PointLight(o.light === 'AREA' ? 0xdce7ff : 0xffa04a, o.light === 'AREA' ? 14 : 16, 0, 2); l.position.set(...pos); g.add(l); }
    }
  }
  RV.dirty = true;
}
function pathToRoot(c) { const out = []; let p = parentOf(sc(), c); while (p) { out.push(p); p = parentOf(sc(), p); } return out; }
function frameAll() {
  VV.controls.target.set(...b2t([0, 0, 0.8])); VV.camera.position.set(...b2t([8.5, -12, 10])); VV.controls.update(); VV.dirty = true;
}

// ─── Outliner ────────────────────────────────────────────────────────────────
const COLUMNS = [['exclude', 'Exclude from View Layer'], ['selectable', 'Disable Selection'], ['hide', 'Hide in Viewport'], ['disableViewport', 'Disable in Viewports'], ['disableRender', 'Disable in Renders'], ['holdout', 'Holdout'], ['indirectOnly', 'Indirect Only']];
const COLL_ONLY = ['exclude', 'holdout', 'indirectOnly'];
function currentTree() {
  const st = S.st, s = st.scene;
  let tree = st.mode === 'Blender File' ? blenderFileTree(s) : st.mode === 'Unused Data' ? unusedTree(s) : viewLayerTree(s, st.filter);
  if (st.filter.search) tree = searchTree(tree, st.filter);
  return tree;
}
function toggleButton(r, col) {
  const s = sc(), kind = r.kind, target = kind === 'collection' ? s.collections[r.name] : s.objects[r.name];
  if (!target || (kind === 'object' && COLL_ONLY.includes(col)) || r.name === ROOT) return '<span class="rt-cell"></span>';
  let on, icon;
  if (col === 'exclude') { on = !target.exclude; icon = on ? IC.check : IC.uncheck; }
  if (col === 'selectable') { on = target.selectable; icon = on ? IC.selOn : IC.selOff; }
  if (col === 'hide') { on = !target.hide; icon = on ? IC.eyeOn : IC.eyeOff; }
  if (col === 'disableViewport') { on = !target.disableViewport; icon = on ? IC.monOn : IC.monOff; }
  if (col === 'disableRender') { on = !target.disableRender; icon = on ? IC.camOn : IC.camOff; }
  if (col === 'holdout') { on = !!target.holdout; icon = IC.holdout; }
  if (col === 'indirectOnly') { on = !!target.indirectOnly; icon = IC.indirect; }
  const lab = COLUMNS.find(c => c[0] === col)[1];
  const off = (col === 'holdout' || col === 'indirectOnly') ? !on : !on;
  return `<button type="button" class="rt-cell rt-${col}${off ? ' off' : ''}" data-rt="${col}" aria-pressed="${on}" title="${lab}${col === 'hide' ? ' · Ctrl click: isolate · Shift click: with children' : ''}">${icon}</button>`;
}
function renderOutliner() {
  const st = S.st, s = st.scene, f = st.filter;
  const tree = currentTree(), rows = flatten(tree, f.search ? {} : st.collapsed);
  S.rows = rows;
  const cols = st.mode === 'View Layer' ? COLUMNS.map(c => c[0]).filter(c => f.columns[c]) : [];
  const html = rows.map((r, i) => {
    const hasKids = r.children.length > 0, open = f.search || !st.collapsed[r.key];
    let cls = `olr k-${r.kind}`, icon = '', extra = '';
    if (r.kind === 'collection') {
      icon = r.name === ROOT ? IC.scene : IC.coll(collColor(s.collections[r.name]));
      if (s.activeColl === r.name) cls += ' activecoll';
      if (r.name !== ROOT && !collectionVisible(s, r.name)) cls += ' off';
    } else if (r.kind === 'object') {
      const o = s.objects[r.name]; icon = objIcon(o);
      if (s.sel.includes(r.name)) cls += ' sel'; if (s.active === r.name) cls += ' active';
      if (!objectVisible(s, r.name)) cls += ' off';
    } else if (r.kind === 'category') icon = IC[r.cat] || IC.file;
    else if (r.kind === 'file') icon = IC.file;
    else if (r.kind === 'instance') icon = IC.coll();
    else icon = IC[r.kind] || '';
    if (['material', 'mesh', 'image'].includes(r.kind) && st.mode !== 'View Layer') {
      const d = (r.kind === 'material' ? s.materials : r.kind === 'image' ? s.images : s.meshes)[r.name];
      const n = users(s, r.kind, r.name);
      extra = `<span class="users${n ? '' : ' zero'}" title="Users">${totalUsers(s, r.kind, r.name)}</span><button type="button" class="fake${d?.fake ? ' on' : ''}" data-fake="1" aria-pressed="${!!d?.fake}" title="Fake User">${d?.fake ? IC.shield : IC.shieldOff}</button>`;
      if (S.dataSel === r.key) cls += ' active';
    }
    if ((r.kind === 'object' || r.kind === 'collection') && st.mode !== 'View Layer' && S.dataSel === r.key) cls += ' active';
    if (r.hit && f.search) cls += ' hit';
    const renaming = S.renaming && S.renaming.key === r.key;
    const name = renaming ? `<input class="rn" value="${esc(r.name)}" aria-label="Name">` : `<span class="nm">${esc(r.name)}</span>`;
    const drag = st.mode === 'View Layer' && (r.kind === 'object' || (r.kind === 'collection' && r.name !== ROOT)) ? ' draggable="true"' : '';
    const rt = cols.length ? `<span class="rt">${cols.map(c => (r.kind === 'object' || r.kind === 'collection') ? toggleButton(r, c) : '<span class="rt-cell"></span>').join('')}</span>` : '';
    return `<div class="${cls}" data-i="${i}" role="treeitem" aria-level="${r.depth + 1}"${hasKids ? ` aria-expanded="${!!open}"` : ''}${drag} style="--d:${r.depth}"><span class="tw"${hasKids ? ' data-tw="1"' : ''}>${hasKids ? (open ? '▾' : '▸') : ''}</span><i class="ic">${icon}</i>${name}${extra}${rt}</div>`;
  }).join('');
  const tr2 = $('#ol-tree'); const top = tr2.scrollTop; tr2.innerHTML = html || `<p class="ol-empty">${esc(t('Nothing matches.'))}</p>`; tr2.scrollTop = top;
  if (S.renaming) { const inp = tr2.querySelector('input.rn'); if (inp) { inp.focus(); inp.select(); } }
  // header state
  $('#ol-mode').value = st.mode;
  const si = $('#ol-search-input'); if (document.activeElement !== si) si.value = f.search; $('#ol-search-clear').hidden = !f.search;
  $('#ol-filter').hidden = st.mode !== 'View Layer'; $('#ol-newcoll').hidden = st.mode !== 'View Layer'; $('#ol-purge').hidden = st.mode !== 'Unused Data';
  const nonDefault = !f.collections || !f.objects || f.objectState !== 'All' || f.contents || !f.children || Object.values(f.types).some(v => !v);
  $('#ol-filter').classList.toggle('on', nonDefault);
  if (!$('#ol-filterpop').hidden) renderFilterPop();
}
function renderFilterPop() {
  const f = S.st.filter, chk = (k, l, sub = '') => `<label class="fp-chk${sub}"><input type="checkbox" data-f="${k}"${k.split('.').reduce((o, x) => o[x], f) ? ' checked' : ''}> ${l}</label>`;
  $('#ol-filterpop').innerHTML = `<div class="fp-h">Restriction Toggles</div><div class="fp-cols">${COLUMNS.map(([c, l]) => `<button type="button" data-fcol="${c}" aria-pressed="${!!f.columns[c]}" title="${l}">${{ exclude: IC.check, selectable: IC.selOn, hide: IC.eyeOn, disableViewport: IC.monOn, disableRender: IC.camOn, holdout: IC.holdout, indirectOnly: IC.indirect }[c]}</button>`).join('')}</div>
    ${chk('sortAlpha', 'Sort Alphabetically')}<label class="fp-chk dis"><input type="checkbox" checked disabled> Sync Selection</label>
    <div class="fp-h">Search</div>${chk('exact', 'Exact Match')}${chk('caseSensitive', 'Case Sensitive')}
    <div class="fp-h">Filter</div>${chk('collections', 'Collections')}${chk('objects', 'Objects')}
    <label class="fp-row">Object State <select data-fstate>${['All', 'Visible', 'Selected', 'Active', 'Selectable'].map(v => `<option${f.objectState === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    ${chk('contents', 'Object Contents', ' sub')}${chk('children', 'Object Children', ' sub')}
    ${chk('types.MESH', 'Meshes', ' sub')}${chk('types.LIGHT', 'Lights', ' sub')}${chk('types.CAMERA', 'Cameras', ' sub')}${chk('types.EMPTY', 'Empties', ' sub')}${chk('types.OTHER', 'Others', ' sub')}`;
}

// ─── Properties editor ───────────────────────────────────────────────────────
const PTABS = [['object', 'Object', IC.object], ['material', 'Material', IC.material], ['collection', 'Collection', IC.collection]];
function renderProps() {
  const st = S.st, s = st.scene, o = s.objects[s.active];
  $('#p-tabs').innerHTML = PTABS.map(([k, l, ic]) => `<button type="button" data-ptab="${k}" aria-pressed="${st.tab === k}" title="${l}">${ic}<span>${l}</span></button>`).join('');
  let h = '';
  if (st.tab === 'object') {
    if (!o) h = `<p class="sb-empty">${esc(t('No active object. Click one in the Outliner or the viewport.'))}</p>`;
    else {
      const colls = collectionsOf(s, o.name);
      h = `<div class="panel bl"><h4>${objIcon(o)} <input class="p-name" data-pname value="${esc(o.name)}" aria-label="Object name"></h4></div>
      <div class="panel bl"><h4>Relations</h4><div class="p-kv"><span>Parent</span><b>${esc(o.parent || '—')}</b></div><div class="p-kv"><span>Type</span><b>${o.instanceOf ? 'Empty (Collection Instance)' : o.type[0] + o.type.slice(1).toLowerCase()}</b></div></div>
      <div class="panel bl"><h4>Collections<small>${colls.length} collection${colls.length === 1 ? '' : 's'}</small></h4>${colls.map(c => `<div class="p-coll"><i class="ic">${IC.coll(collColor(s.collections[c]))}</i><span>${esc(c)}</span><button type="button" class="mini" data-unlink="${esc(c)}" title="Remove from this collection"${colls.length < 2 ? ' disabled' : ''}>✕</button></div>`).join('')}
        <label class="p-kv"><span>Add to Collection</span><select data-addto><option value="">…</option>${Object.keys(s.collections).filter(c => !colls.includes(c)).map(c => `<option>${esc(c)}</option>`).join('')}</select></label></div>
      ${o.type === 'EMPTY' ? `<div class="panel bl"><h4>Instancing</h4><label class="p-kv"><span>Collection</span><select data-instance><option value="">None</option>${Object.keys(s.collections).filter(c => c !== ROOT).map(c => `<option${o.instanceOf === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>` : ''}
      <div class="panel bl"><h4>Visibility</h4><label class="bl-check"><input type="checkbox" data-ovis="selectable"${o.selectable ? ' checked' : ''}> Selectable</label><div class="p-sub">Show In</div><label class="bl-check"><input type="checkbox" data-ovis="disableViewport"${o.disableViewport ? '' : ' checked'}> Viewports</label><label class="bl-check"><input type="checkbox" data-ovis="disableRender"${o.disableRender ? '' : ' checked'}> Renders</label></div>`;
    }
  }
  if (st.tab === 'material') {
    if (!o || !o.mats.length) h = `<p class="sb-empty">${esc(o ? tr('{o} has no material slots.', { o: o.name }) : t('No active object.'))}</p>`;
    else {
      if (S.slot >= o.mats.length) S.slot = 0;
      const cur = o.mats[S.slot];
      h = `<div class="panel bl"><h4>Material Slots<small>${esc(o.name)}</small></h4><div class="ol-list">${o.mats.map((m, i) => `<button type="button" class="ol-row${i === S.slot ? ' active' : ''}" data-slot="${i}">${IC.material}<span>${esc(m)}</span></button>`).join('')}</div>
        <div class="p-dbsel"><i class="ic">${IC.material}</i><select data-setmat aria-label="Browse Material">${Object.keys(s.materials).sort().map(m => `<option${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select><span class="users" title="Users">${totalUsers(s, 'material', cur)}</span><button type="button" class="fake${s.materials[cur]?.fake ? ' on' : ''}" data-pfake="${esc(cur)}" title="Fake User">${s.materials[cur]?.fake ? IC.shield : IC.shieldOff}</button></div></div>
        <div class="panel bl"><h4>Surface<small>Principled BSDF</small></h4><div class="p-kv"><span>Base Color</span><b><i class="swatch" style="background:${esc(s.materials[cur]?.color || '#888')}"></i>${(s.materials[cur]?.images || []).map(esc).join(', ') || 'color'}</b></div></div>`;
    }
  }
  if (st.tab === 'collection') {
    const c = s.collections[s.activeColl];
    if (!c || c.name === ROOT) h = `<p class="sb-empty">${esc(t('The Scene Collection has no properties. Click a collection in the Outliner to make it active.'))}</p>`;
    else {
      const off = c.instanceOffset || [0, 0, 0];
      h = `<div class="panel bl"><h4>${IC.coll(collColor(c))} <input class="p-name" data-cname value="${esc(c.name)}" aria-label="Collection name"></h4></div>
      <div class="panel bl"><h4>Restrictions</h4><label class="bl-check"><input type="checkbox" data-cprop="selectable"${c.selectable ? ' checked' : ''}> Selectable</label><label class="bl-check"><input type="checkbox" data-cprop="disableRender" data-inv="1"${c.disableRender ? '' : ' checked'}> Show In Renders</label><label class="bl-check"><input type="checkbox" data-cprop="holdout"${c.holdout ? ' checked' : ''}> Holdout</label><label class="bl-check"><input type="checkbox" data-cprop="indirectOnly"${c.indirectOnly ? ' checked' : ''}> Indirect Only <em class="eng">Cycles</em></label></div>
      <div class="panel bl"><h4>Instancing</h4>${['X', 'Y', 'Z'].map((a, k) => `<label class="bl-row"><span>Offset ${a}</span><input type="number" step="0.1" data-coff="${k}" value="${off[k]}"><em>m</em></label>`).join('')}</div>
      <div class="panel bl"><h4>Exporters</h4>${c.exporters.length ? c.exporters.map(x => `<div class="p-coll"><i class="ic">${IC.file}</i><span>${esc(x)} · //export/${esc(c.name)}.${x === 'FBX' ? 'fbx' : 'glb'}</span></div>`).join('') + `<p class="bl-note p-note">Exports every object in ${esc(c.name)}: ${esc(allObjectsIn(c.name).join(', ') || '—')}</p>` : '<p class="sb-empty">No exporters. (Add Exporter › FBX / glTF 2.0)</p>'}</div>`;
    }
  }
  $('#p-body').innerHTML = h;
}
const allObjectsIn = c => [...new Set([c, ...descendants(sc(), c)].flatMap(n => sc().collections[n].objects))];

// ─── Menus ───────────────────────────────────────────────────────────────────
// items: { label, key, action, sub, disabled, depth, keep, checked } or '-' or { title }
let menuStack = [];
function openMenu(items, x, y, title) { menuStack = [{ items, title }]; renderMenu(); placeMenu(x, y); }
function renderMenu() {
  const m = $('#menu'), top = menuStack[menuStack.length - 1];
  m.innerHTML = (menuStack.length > 1 ? `<button type="button" class="m-back" data-back="1">‹ ${esc(menuStack[menuStack.length - 2].title || '')}</button>` : '') + (top.title ? `<div class="mh">${esc(top.title)}</div>` : '') +
    top.items.map((it, i) => it === '-' ? '<hr>' : it.note ? `<div class="m-note">${esc(it.note)}</div>` : `<button type="button" data-mi="${i}"${it.disabled ? ' disabled' : ''} style="padding-left:${10 + (it.depth || 0) * 14}px">${it.icon || ''}${it.checked !== undefined ? `<span class="m-check">${it.checked ? '✓' : ''}</span>` : ''}<span class="m-label">${esc(it.label)}</span>${it.key ? `<span class="m-key">${esc(it.key)}</span>` : ''}${it.sub ? '<span class="m-key">▸</span>' : ''}</button>`).join('');
  m.hidden = false;
}
function placeMenu(x, y) {
  const m = $('#menu'); m.style.left = '0px'; m.style.top = '0px';
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(4, Math.min(x, innerWidth - w - 6)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - h - 6)) + 'px';
}
function closeMenu() { $('#menu').hidden = true; menuStack = []; }
$('#menu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.back) { menuStack.pop(); renderMenu(); return; }
  const it = menuStack[menuStack.length - 1].items[+b.dataset.mi]; if (!it || it.disabled) return;
  if (it.sub) { menuStack.push({ items: typeof it.sub === 'function' ? it.sub() : it.sub, title: it.label }); renderMenu(); return; }
  if (!it.keep) closeMenu();
  it.action?.();
  if (it.keep) renderMenu();
});
document.addEventListener('pointerdown', e => {
  if (!$('#menu').hidden && !e.target.closest('#menu')) closeMenu();
  if (!$('#ol-filterpop').hidden && !e.target.closest('#ol-filterpop') && !e.target.closest('#ol-filter')) { $('#ol-filterpop').hidden = true; $('#ol-filter').setAttribute('aria-expanded', 'false'); }
});
function collectionList(action, withNew = true) {
  const s = sc(), items = [];
  if (withNew) items.push({ label: '+ New Collection', action: () => action(null) }, '-');
  const walk = (n, d) => { items.push({ label: n, depth: d, icon: n === ROOT ? IC.scene : IC.coll(collColor(s.collections[n])), action: () => action(n) }); for (const ch of [...s.collections[n].children].sort()) walk(ch, d + 1); };
  walk(ROOT, 0);
  return items;
}
function moveMenu(link, x = S.mouse[0], y = S.mouse[1]) {
  const s = sc();
  if (!s.sel.length) { msg('Select one or more objects first.', true); return; }
  openMenu(collectionList(target => {
    pushUndo();
    if (!target) { target = OPS.newCollection(s, ROOT, 'Collection'); }
    link ? OPS.linkTo(s, [...s.sel], target) : OPS.moveTo(s, [...s.sel], target);
    msg(tr(link ? '{n} object(s) linked to {c}: they are now in one more collection.' : '{n} object(s) moved to {c}.', { n: s.sel.length, c: target }));
    changed();
    if (!s.collections[target].objects.length || /^Collection(\.\d{3})?$/.test(target)) startRenameByName('collection', target);
  }), x, y, link ? 'Link to Collection' : 'Move to Collection');
}
function startRenameByName(kind, name) {
  const i = S.rows.findIndex(r => r.kind === kind && r.name === name); if (i < 0) return;
  S.renaming = { key: S.rows[i].key, kind, name }; renderOutliner();
}
function collectionMenu(name) {
  const s = sc();
  if (name === ROOT) return [{ label: 'New Collection', action: () => newCollectionIn(ROOT) }];
  return [
    { label: 'New Collection', action: () => newCollectionIn(name) },
    { label: 'Rename', key: 'F2', action: () => startRenameByName('collection', name) },
    { label: 'Delete', key: 'X', action: () => { pushUndo(); OPS.deleteCollection(s, name); msg(tr('{c} deleted: its objects and collections went to its parent.', { c: name })); changed(); } },
    { label: 'Delete Hierarchy', action: () => { pushUndo(); const inside = allObjectsIn(name); OPS.deleteObjects(s, inside.filter(o => collectionsOf(s, o).every(c => c === name || descendants(s, name).includes(c)))); for (const d of [...descendants(s, name)].reverse()) OPS.deleteCollection(s, d); OPS.deleteCollection(s, name); changed(); } },
    '-',
    { label: 'Select Objects', action: () => { const list = allObjectsIn(name).filter(o => objectSelectable(s, o)); s.sel = list; s.active = list[0] || s.active; changed(false); } },
    { label: 'Deselect Objects', action: () => { const list = allObjectsIn(name); s.sel = s.sel.filter(o => !list.includes(o)); changed(false); } },
    '-',
    { label: 'Instance to Scene', action: () => { pushUndo(); const n = OPS.addInstance(s, name); s.sel = [n]; s.active = n; msg(tr('Collection Instance of {c} added at the 3D cursor.', { c: name })); changed(); } },
    { label: 'Set Color Tag', sub: () => Object.entries(COLOR_TAGS).map(([k, v]) => ({ label: k === 'none' ? 'None' : k[0].toUpperCase() + k.slice(1), icon: IC.coll(v), action: () => { pushUndo(); s.collections[name].color = k; changed(); } })) },
    '-',
    { label: 'Isolate', action: () => { pushUndo(); OPS.isolate(s, name); changed(); } },
    { label: 'Show All', key: 'Alt H', action: () => { pushUndo(); OPS.unhideAll(s); changed(); } },
  ];
}
function newCollectionIn(parent) {
  pushUndo(); const n = OPS.newCollection(sc(), parent, 'Collection'); sc().activeColl = n; S.st.collapsed = { ...S.st.collapsed }; changed(); startRenameByName('collection', n);
}
function objectMenu(name) {
  const s = sc();
  return [
    { label: 'Select', action: () => { s.sel = [...new Set([...s.sel, name])]; s.active = name; changed(false); } },
    { label: 'Deselect', action: () => { s.sel = s.sel.filter(n => n !== name); changed(false); } },
    '-',
    { label: 'Move to Collection', key: 'M', action: () => { if (!s.sel.includes(name)) { s.sel = [name]; s.active = name; } moveMenu(false); } },
    { label: 'Link to Collection', key: 'Shift M', action: () => { if (!s.sel.includes(name)) { s.sel = [name]; s.active = name; } moveMenu(true); } },
    '-',
    { label: 'Rename', key: 'F2', action: () => startRenameByName('object', name) },
    { label: 'Delete', key: 'X', action: () => { pushUndo(); OPS.deleteObjects(s, s.sel.includes(name) ? [...s.sel] : [name]); changed(); } },
    '-',
    { label: 'Hide', key: 'H', action: () => { pushUndo(); s.objects[name].hide = true; changed(); } },
    { label: 'Show All', key: 'Alt H', action: () => { pushUndo(); OPS.unhideAll(s); changed(); } },
  ];
}
function dataMenu(kind, name) {
  const s = sc(), bag = kind === 'material' ? s.materials : kind === 'image' ? s.images : kind === 'mesh' ? s.meshes : null;
  if (kind === 'object') return objectMenu(name);
  if (kind === 'collection') return collectionMenu(name);
  if (!bag) return [];
  return [
    { label: 'Remap Users', sub: () => { const c = Object.keys(bag).filter(n => n !== name).sort(); return c.length ? [{ note: tr('Replace every use of {a} by:', { a: name }) }, ...c.map(n => ({ label: n, icon: IC[kind], action: () => { pushUndo(); const before = users(s, kind, name); OPS.remapUsers(s, kind, name, n); msg(tr('{k} users of {a} now use {b}. {a} has 0 users.', { k: before, a: name, b: n })); changed(); } }))] : [{ note: 'Nothing to remap to.' }]; } },
    { label: 'Rename', key: 'F2', action: () => { const i = S.rows.findIndex(r => r.kind === kind && r.name === name); if (i >= 0) { S.renaming = { key: S.rows[i].key, kind, name }; renderOutliner(); } } },
    { label: bag[name]?.fake ? 'Clear Fake User' : 'Add Fake User', action: () => { pushUndo(); OPS.toggleFake(s, kind, name); changed(); } },
    '-',
    { label: 'Delete', key: 'X', disabled: users(s, kind, name) > 0, action: () => { pushUndo(); delete bag[name]; changed(); } },
  ];
}
function purgeMenu(x, y) {
  const s = sc();
  const preview = () => { const tmp = clone(s); return OPS.purge(tmp, S.purgeRecursive); };
  const items = () => {
    const list = preview();
    return [{ label: 'Recursive Delete', checked: S.purgeRecursive, keep: true, action: () => { S.purgeRecursive = !S.purgeRecursive; menuStack[0].items = items(); } }, '-',
      ...list.slice(0, 10).map(x => ({ note: '✕ ' + x.split(':')[1] })), ...(list.length > 10 ? [{ note: `… +${list.length - 10}` }] : []),
      ...(unusedData(s).filter(u => u.fake).map(u => ({ note: '🛡 ' + u.name + ' (Fake User: kept)' }))),
      '-', { label: list.length ? `Delete ${list.length} data-block${list.length === 1 ? '' : 's'}` : 'Nothing to purge', disabled: !list.length, action: () => { pushUndo(); const r = OPS.purge(s, S.purgeRecursive); msg(tr('Purged {n} data-blocks.', { n: r.length })); changed(); } }];
  };
  openMenu(items(), x, y, 'Purge Unused Data');
}

// ─── Outliner events ─────────────────────────────────────────────────────────
const tree = $('#ol-tree');
let lastClick = {};
const rowOf = e => { const el = e.target.closest('.olr'); return el ? { el, i: +el.dataset.i, r: S.rows[+el.dataset.i] } : null; };
function ownerObject(i) { const r = S.rows[i]; if (r.owner) return r.owner; for (let k = i - 1; k >= 0; k--) if (S.rows[k].kind === 'object' && S.rows[k].depth < r.depth) return S.rows[k].name; return null; }
tree.addEventListener('click', e => {
  const hit = rowOf(e); if (!hit) return; const { i, r } = hit, s = sc(), st = S.st;
  if (e.target.closest('input.rn')) return;
  const rt = e.target.closest('[data-rt]');
  if (rt) {
    pushUndo(); const col = rt.dataset.rt, kind = r.kind;
    const prop = col;
    if (col === 'hide' && kind === 'collection' && (e.ctrlKey || e.metaKey)) { const c = s.collections[r.name]; const alreadyIso = !c.hide && Object.values(s.collections).every(x => x.name === ROOT || x.hide === !([r.name, ...descendants(s, r.name)].includes(x.name) || descendants(s, x.name).includes(r.name))); if (alreadyIso) { OPS.unhideAll(s); msg('Everything visible again.'); } else { OPS.isolate(s, r.name); msg(tr('Isolated {c}: every other collection is hidden. Ctrl click again to show them.', { c: r.name })); } }
    else OPS.toggle(s, kind, r.name, prop, { shift: e.shiftKey });
    changed(); return;
  }
  if (e.target.closest('[data-tw]')) { st.collapsed[r.key] = !st.collapsed[r.key]; if (e.shiftKey) { const v = st.collapsed[r.key]; for (const x of S.rows) if (x.key.startsWith(r.key + '/')) st.collapsed[x.key] = v; } renderOutliner(); saveData(); return; }
  if (e.target.closest('[data-fake]')) { pushUndo(); OPS.toggleFake(s, r.kind, r.name); changed(); return; }
  // a second click on the same name soon after is a double click: rename (the row is redrawn between clicks)
  const now = performance.now(), again = lastClick.key === r.key && now - lastClick.t < 450 && e.target.closest('.nm');
  lastClick = { key: r.key, t: now };
  if (again && !e.shiftKey && !e.ctrlKey && !e.metaKey && r.name !== ROOT && !['category', 'file', 'instance'].includes(r.kind)) { lastClick = {}; S.renaming = { key: r.key, kind: r.kind, name: r.name }; renderOutliner(); return; }
  selectRow(i, r, e);
});
function selectRow(i, r, e) {
  const s = sc(), st = S.st, ctrl = e.ctrlKey || e.metaKey;
  if (st.mode !== 'View Layer') {
    S.dataSel = r.key;
    if (r.kind === 'object') { s.sel = [r.name]; s.active = r.name; }
    if (r.kind === 'collection') s.activeColl = r.name;
    if (r.kind === 'material' && s.active && s.objects[s.active]?.mats.includes(r.name)) { st.tab = 'material'; S.slot = s.objects[s.active].mats.indexOf(r.name); }
    changed(false); return;
  }
  if (r.kind === 'object') {
    if (e.shiftKey && S.anchor != null) {
      const [a, b] = [Math.min(S.anchor, i), Math.max(S.anchor, i)];
      const range = S.rows.slice(a, b + 1).filter(x => x.kind === 'object').map(x => x.name);
      s.sel = [...new Set([...(ctrl ? s.sel : []), ...range])]; s.active = r.name;
    } else if (ctrl) {
      if (s.sel.includes(r.name) && s.active === r.name) { s.sel = s.sel.filter(n => n !== r.name); s.active = null; } else { s.sel = [...new Set([...s.sel, r.name])]; s.active = r.name; }
      S.anchor = i;
    } else { s.sel = [r.name]; s.active = r.name; S.anchor = i; }
  } else if (r.kind === 'collection') { s.activeColl = r.name; if (!ctrl) { s.sel = []; } S.anchor = i; }
  else if (['material', 'mesh', 'instance'].includes(r.kind)) {
    const owner = ownerObject(i); if (owner) { s.sel = [owner]; s.active = owner; }
    if (r.kind === 'material') { st.tab = 'material'; S.slot = r.slot || 0; }
  }
  changed(false);
}
function commitRename(value) {
  const rn = S.renaming; if (!rn) return; S.renaming = null;
  const v = String(value || '').trim();
  if (v && v !== rn.name) { pushUndo(); const got = OPS.rename(sc(), rn.kind, rn.name, v); if (got !== v) msg(tr('{v} is taken: Blender named it {g}.', { v, g: got }), true); changed(); } else renderOutliner();
}
tree.addEventListener('keydown', e => {
  if (!e.target.matches('input.rn')) return;
  if (e.key === 'Enter') { e.preventDefault(); commitRename(e.target.value); }
  if (e.key === 'Escape') { e.preventDefault(); S.renaming = null; renderOutliner(); }
  e.stopPropagation();
});
tree.addEventListener('focusout', e => { if (e.target.matches('input.rn') && S.renaming) commitRename(e.target.value); });
tree.addEventListener('contextmenu', e => {
  e.preventDefault(); const hit = rowOf(e), s = sc(), st = S.st;
  if (!hit) { if (st.mode === 'View Layer') openMenu(collectionMenu(ROOT), e.clientX, e.clientY, 'Outliner'); return; }
  const { i, r } = hit;
  if (st.mode === 'View Layer') {
    if (r.kind === 'object' && !s.sel.includes(r.name)) { s.sel = [r.name]; s.active = r.name; S.anchor = i; changed(false); }
    if (r.kind === 'collection') { s.activeColl = r.name; changed(false); }
    const items = r.kind === 'object' ? objectMenu(r.name) : r.kind === 'collection' ? collectionMenu(r.name) : r.kind === 'material' ? [{ label: 'Select owner', action: () => selectRow(i, r, {}) }] : [];
    if (items.length) openMenu(items, e.clientX, e.clientY, r.name);
  } else if (!['category', 'file'].includes(r.kind)) { S.dataSel = r.key; renderOutliner(); const items = dataMenu(r.kind, r.name); if (items.length) openMenu(items, e.clientX, e.clientY, r.name); }
});
// drag and drop: objects onto a collection (move, Ctrl: link), collections onto a collection (nest)
tree.addEventListener('dragstart', e => {
  const hit = rowOf(e); if (!hit) return; const { r } = hit, s = sc();
  if (r.kind === 'object') S.drag = { kind: 'object', names: s.sel.includes(r.name) ? [...s.sel] : [r.name] };
  else if (r.kind === 'collection') S.drag = { kind: 'collection', names: [r.name] };
  else { e.preventDefault(); return; }
  e.dataTransfer.setData('text/plain', S.drag.names.join(', ')); e.dataTransfer.effectAllowed = 'copyMove';
});
tree.addEventListener('dragover', e => {
  const hit = rowOf(e); tree.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
  if (!hit || !S.drag || hit.r.kind !== 'collection') return;
  e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; hit.el.classList.add('drop');
});
tree.addEventListener('dragleave', e => { const hit = rowOf(e); hit?.el.classList.remove('drop'); });
tree.addEventListener('drop', e => {
  e.preventDefault(); tree.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
  const hit = rowOf(e), d = S.drag; S.drag = null; if (!hit || !d || hit.r.kind !== 'collection') return;
  const s = sc(), target = hit.r.name; pushUndo();
  if (d.kind === 'object') {
    if (e.ctrlKey || e.metaKey) { OPS.linkTo(s, d.names, target); msg(tr('{n} object(s) linked to {c}.', { n: d.names.length, c: target })); }
    else { OPS.moveTo(s, d.names, target); msg(tr('{n} object(s) moved to {c}.', { n: d.names.length, c: target })); }
  } else if (!OPS.nestCollection(s, d.names[0], target)) { S.undo.pop(); msg('A collection cannot go inside itself or its own children.', true); return; }
  else msg(tr('{a} is now inside {b}.', { a: d.names[0], b: target }));
  changed();
});
tree.addEventListener('dragend', () => { S.drag = null; tree.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });

// header
$('#ol-mode').addEventListener('change', e => { S.st.mode = e.target.value; S.dataSel = null; S.renaming = null; changed(); msg(tr('Display Mode: {m}', { m: S.st.mode })); });
$('#ol-search-input').addEventListener('input', e => { S.st.filter.search = e.target.value; renderOutliner(); saveData(); });
$('#ol-search-input').addEventListener('keydown', e => { if (e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); clearSearch(); } else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur(); } e.stopPropagation(); });
$('#ol-search-clear').addEventListener('click', clearSearch);
function clearSearch() { S.st.filter.search = ''; $('#ol-search-input').value = ''; renderOutliner(); saveData(); }
$('#ol-filter').addEventListener('click', () => { const p = $('#ol-filterpop'); p.hidden = !p.hidden; $('#ol-filter').setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) renderFilterPop(); });
$('#ol-filterpop').addEventListener('change', e => {
  const f = S.st.filter, el = e.target;
  if (el.dataset.f) { const path = el.dataset.f.split('.'); const last = path.pop(); path.reduce((o, k) => o[k], f)[last] = el.checked; }
  if ('fstate' in el.dataset) f.objectState = el.value;
  renderOutliner(); saveData(); checkProgress(); renderGuide(); renderStepCard();
});
$('#ol-filterpop').addEventListener('click', e => { const b = e.target.closest('[data-fcol]'); if (!b) return; const c = S.st.filter.columns; c[b.dataset.fcol] = !c[b.dataset.fcol]; renderOutliner(); saveData(); checkProgress(); renderGuide(); renderStepCard(); });
$('#ol-newcoll').addEventListener('click', () => newCollectionIn(sc().activeColl || ROOT));
$('#ol-purge').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); purgeMenu(r.left, r.bottom + 4); });

// ─── Properties events ───────────────────────────────────────────────────────
$('#p-tabs').addEventListener('click', e => { const b = e.target.closest('[data-ptab]'); if (!b) return; S.st.tab = b.dataset.ptab; renderProps(); saveData(); });
$('#p-body').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const s = sc(), d = b.dataset;
  if (d.slot) { S.slot = +d.slot; renderProps(); }
  if (d.unlink) { pushUndo(); OPS.unlink(s, s.active, d.unlink); changed(); }
  if (d.pfake) { pushUndo(); OPS.toggleFake(s, 'material', d.pfake); changed(); }
});
$('#p-body').addEventListener('change', e => {
  const s = sc(), el = e.target, d = el.dataset, o = s.objects[s.active], c = s.collections[s.activeColl];
  pushUndo();
  if ('pname' in d && o) OPS.rename(s, 'object', o.name, el.value);
  if ('cname' in d && c) OPS.rename(s, 'collection', c.name, el.value);
  if ('addto' in d && el.value && o) { OPS.linkTo(s, [o.name], el.value); msg(tr('{o} is now also in {c}.', { o: o.name, c: el.value })); }
  if ('instance' in d && o) o.instanceOf = el.value || null;
  if (d.ovis && o) { if (d.ovis === 'selectable') o.selectable = el.checked; else o[d.ovis] = !el.checked; }
  if ('setmat' in d && o) { const before = o.mats[S.slot]; OPS.setMaterial(s, o.name, S.slot, el.value); msg(tr('Slot {n} of {o}: {a} → {b}', { n: S.slot + 1, o: o.name, a: before, b: el.value })); }
  if (d.cprop && c) c[d.cprop] = d.inv ? !el.checked : el.checked;
  if (d.coff !== undefined && c) { c.instanceOffset = c.instanceOffset || [0, 0, 0]; c.instanceOffset[+d.coff] = +el.value || 0; }
  changed();
});

// ─── Viewport events and menus ───────────────────────────────────────────────
let downAt = null;
VV.canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
VV.canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || e.button !== 0) return;
  const r = VV.canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), VV.camera);
  const s = sc(), hits = ray.intersectObjects(pickables, false);
  const hit = hits.find(h => objectSelectable(s, h.object.userData.name));
  const firstReal = hits.find(h => !s.objects[h.object.userData.name]?.collision) || hits[0];
  const blocked = hits.length && !hit ? firstReal.object.userData.name : null;
  if (hit) {
    const n = hit.object.userData.name;
    if (e.shiftKey) { if (s.sel.includes(n) && s.active === n) { s.sel = s.sel.filter(x => x !== n); s.active = null; } else { s.sel = [...new Set([...s.sel, n])]; s.active = n; } }
    else { s.sel = [n]; s.active = n; }
  } else if (!e.shiftKey) { s.sel = []; }
  if (blocked && !hit) msg(tr('{o} is not selectable: the click went through it.', { o: blocked }));
  changed(false);
});
function addEmpty() { const s = sc(); pushUndo(); const name = uniqueName(new Set(Object.keys(s.objects)), 'Empty'); s.objects[name] = makeObject(name, { type: 'EMPTY', loc: [...s.cursor] }); s.collections[s.activeColl || ROOT].objects.push(name); s.sel = [name]; s.active = name; changed(); }
const VMENUS = {
  view: () => [{ label: 'Frame All', key: 'Home', action: frameAll }, { label: S.showRender ? 'Hide the camera render' : 'Show the camera render', action: () => setRender(!S.showRender) }],
  select: () => [{ label: 'All', key: 'A', action: selectAll }, { label: 'None', key: 'Alt A', action: () => { sc().sel = []; changed(false); } }],
  add: () => [
    { label: 'Empty', sub: [{ label: 'Plain Axes', icon: IC.EMPTY, action: addEmpty }] },
    { label: 'Collection Instance', sub: () => { const cs = Object.keys(sc().collections).filter(c => c !== ROOT).sort(); return cs.map(c => ({ label: c, icon: IC.coll(collColor(sc().collections[c])), action: () => { const s = sc(); pushUndo(); const n = OPS.addInstance(s, c); s.sel = [n]; s.active = n; msg(tr('Collection Instance of {c} added at the 3D cursor, in {a}.', { c, a: s.activeColl })); changed(); } })); } },
    { note: 'New objects go to the 3D cursor, in the active collection.' },
  ],
  object: () => [
    { label: 'Snap', sub: [{ label: 'Cursor to Selected', action: () => { const s = sc(); if (!s.active) return msg('No active object.', true); pushUndo(); OPS.cursorToSelected(s); msg(tr('3D cursor on {o}.', { o: s.active })); changed(); } }, { label: 'Cursor to World Origin', action: () => { pushUndo(); sc().cursor = [0, 0, 0]; changed(); } }] },
    { label: 'Collection', sub: [{ label: 'Move to Collection', key: 'M', action: () => moveMenu(false) }, { label: 'Link to Collection', key: 'Shift M', action: () => moveMenu(true) }] },
    { label: 'Show/Hide', sub: [{ label: 'Hide Selected', key: 'H', action: hideSelected }, { label: 'Show Hidden', key: 'Alt H', action: showHidden }] },
    '-', { label: 'Delete', key: 'X', action: deleteSelected },
  ],
};
$('#v-menus').addEventListener('click', e => { const b = e.target.closest('[data-vmenu]'); if (!b) return; const r = b.getBoundingClientRect(); openMenu(VMENUS[b.dataset.vmenu](), r.left, r.bottom + 2, b.textContent); });
function setRender(on) { S.showRender = on; store.set('render', on); $('#render-toggle').checked = on; $('#r-box').hidden = !on; buildRender(); }
$('#render-toggle').addEventListener('change', e => setRender(e.target.checked));
function selectAll() {
  const s = sc();
  if (S.hover === 'outliner') { const names = [...new Set(S.rows.filter(r => r.kind === 'object').map(r => r.name))]; s.sel = names; s.active = names.includes(s.active) ? s.active : names[0] || null; }
  else s.sel = Object.keys(s.objects).filter(n => objectSelectable(s, n));
  changed(false);
}
function hideSelected() { const s = sc(); if (!s.sel.length) return; pushUndo(); OPS.hideSelected(s); s.sel = []; changed(); }
function showHidden() { pushUndo(); OPS.unhideAll(sc()); changed(); }
function deleteSelected() { const s = sc(); if (!s.sel.length) return; pushUndo(); const n = s.sel.length; OPS.deleteObjects(s, [...s.sel]); msg(tr('Deleted {n} object(s).', { n })); changed(); }

// ─── Undo, persistence, steps ────────────────────────────────────────────────
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 100) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); S.renaming = null; changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo'); }
const dataKey = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(dataKey(), S.st); }
function loadData() { const saved = store.get(dataKey(), null); S.st = saved && saved.scene?.collections && saved.filter?.columns ? saved : startState(step()); S.undo = []; S.redo = []; S.renaming = null; S.dataSel = null; S.anchor = null; S.slot = 0; }
function renderStageSwitch() { $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join(''); }
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const stepDone = i => (i === S.step ? !!step().check(S.st) : !!S.done[doneKey(i)]);
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.classList.toggle('three', n === 3); g.classList.toggle('two', n === 2);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(); });
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st); changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null, doneTimer = null;
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) { const title = step().title; doneTimer = setTimeout(() => msg(tr('✓ Step done: {s}', { s: t(title) })), 600); }
  lastOk = ok;
}
function changed(save = true) {
  void save; saveData();
  buildViewport(); buildRender(); renderOutliner(); renderProps();
  checkProgress(); renderGuide(); renderStepCard();
}
function enterStep() { clearTimeout(doneTimer); clearTimeout(msgTimer); $('#status-msg').textContent = ''; loadData(); lastOk = stepDone(S.step); renderStageSwitch(); changed(false); frameAll(); }
function renderAll() { renderStageSwitch(); changed(false); }

// ─── Keyboard ────────────────────────────────────────────────────────────────
for (const [sel, name] of [['#v-host', 'viewport'], ['#outliner', 'outliner'], ['#props', 'props']]) {
  $(sel).addEventListener('pointerenter', () => { S.hover = name; }); $(sel).addEventListener('pointerleave', () => { S.hover = null; });
}
document.addEventListener('pointermove', e => { S.mouse = [e.clientX, e.clientY]; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === 'Escape') { closeMenu(); return; }
  if (!S.hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase(), s = sc();
  const done = () => e.preventDefault();
  if (ctrl && low === 'z') { e.shiftKey ? redo() : undo(); return done(); }
  if (ctrl && low === 'y') { redo(); return done(); }
  if (ctrl && low === 'f' && S.hover === 'outliner') { $('#ol-search-input').focus(); return done(); }
  if (e.altKey && low === 'f' && S.hover === 'outliner') { clearSearch(); return done(); }
  if (ctrl) return;
  if (low === 'm') { moveMenu(e.shiftKey); return done(); }
  if (low === 'a' && e.altKey) { s.sel = []; changed(false); return done(); }
  if (low === 'a') { selectAll(); return done(); }
  if (low === 'h' && e.altKey) { showHidden(); return done(); }
  if (low === 'h') { hideSelected(); return done(); }
  if (low === 'x' || e.key === 'Delete') { deleteSelected(); return done(); }
  if (e.key === 'F2') { if (s.active) startRenameByName('object', s.active); return done(); }
  if (e.key === 'Home') { frameAll(); return done(); }
});

function loop() {
  for (const v of [VV, RV]) if (v.dirty) { v.dirty = false; if (v === RV && !S.showRender) continue; v.renderer.render(v.scene, v.camera); }
  requestAnimationFrame(loop);
}
onLangChange(() => renderAll());
$('#render-toggle').checked = S.showRender; $('#r-box').hidden = !S.showRender;
enterStep();
requestAnimationFrame(loop);
window.__outliner = { S, VV, RV, STAGES }; // for tests and curious students
