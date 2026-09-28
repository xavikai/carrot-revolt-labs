// Stage House Lab: an opera house stage cut in half, with a view from the seats of the audience.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import * as M from './stage.js?v=1';
import { STAGES, PARTS, targetDone, changeDone, ELECTRICS, PLATS } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-stage:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-stage:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, flags: {}, undo: [], redo: [],
  done: store.get('done', {}), sel: null, modal: null, hover: false, pointer: null, seat: 'front', hoverPart: null,
  show: { section: true, sight: true, seat: true },
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
const shown = id => step().show.includes(id);
const movable = id => shown(id) && M.PIECES[id].axis && !M.PIECES[id].fixed;

let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

// ─── Data ────────────────────────────────────────────────────────────────────
const key = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(key(), { st: S.st, flags: S.flags, seat: S.seat }); }
function loadData() {
  const saved = store.get(key(), null), fresh = step().start();
  S.st = saved?.st?.v ? { ...fresh, ...saved.st, v: { ...fresh.v, ...saved.st.v } } : fresh;
  S.flags = saved?.flags || {};
  S.seat = saved?.seat || step().seat || 'front';
  S.undo = []; S.redo = []; S.sel = null;
}
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 100) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo'); }

// ─── Three.js: two renderers (the section and the seat view) share one scene ─
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.localClippingEnabled = true;
const seatCanvas = $('#seat-canvas');
const seatRenderer = new THREE.WebGLRenderer({ canvas: seatCanvas, antialias: true });
seatRenderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
seatRenderer.localClippingEnabled = false; // the audience sees the building closed
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 600);
const seatCam = new THREE.PerspectiveCamera(58, 1.6, 0.1, 300);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3530, 1.2));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.5); sun.position.set(20, 40, 30); scene.add(sun);
const stageLight = new THREE.PointLight(0xffe2b0, 60, 0, 1.2); stageLight.position.set(0, 9, -4); scene.add(stageLight);
const frontLight = new THREE.SpotLight(0xfff0d8, 160, 0, 0.7, 0.5, 1.1); frontLight.position.set(0, 16, 24); frontLight.target.position.set(0, 3, -10); scene.add(frontLight, frontLight.target);
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.addEventListener('change', () => requestRender());
host.addEventListener('pointerdown', e => {
  controls.mouseButtons.LEFT = e.button === 0 && e.altKey ? THREE.MOUSE.ROTATE : null;
  controls.mouseButtons.MIDDLE = e.button === 1 && e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
}, true);

// The building: its walls are cut by the section plane (x > 0 is removed).
const cut = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
const shellMats = [];
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...o });
const shellMat = (color, o = {}) => { const m = mat(color, { side: THREE.DoubleSide, ...o }); shellMats.push(m); return m; };
function box(x0, x1, y0, y1, z0, z1, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return m;
}
const building = new THREE.Group(); scene.add(building);
{
  const wall = shellMat(0x8d8a84), dark = shellMat(0x5b5752), floor = shellMat(0x6f5a44), house = shellMat(0x7a2e2e), gold = shellMat(0xb58d4a);
  const T = M.TOWER, W = M.WING, R = M.REAR, U = M.UNDER, B = M.BOCA;
  const add = (...a) => building.add(box(...a));
  // proscenium wall with the opening
  add(-W.to, -B.half, 0, 14, 0, 0.4, wall); add(B.half, W.to, 0, 14, 0, 0.4, wall); add(-T.half, T.half, B.h, T.top, 0, 0.4, wall);
  add(-B.half - 0.5, -B.half, 0, B.h, 0.4, 0.6, gold); add(B.half, B.half + 0.5, 0, B.h, 0.4, 0.6, gold); add(-B.half - 0.5, B.half + 0.5, B.h, B.h + 0.5, 0.4, 0.6, gold);
  // fly tower
  for (const s of [-1, 1]) add(s < 0 ? -T.half - 0.4 : T.half, s < 0 ? -T.half : T.half + 0.4, 14, T.top, T.back, 0.4, wall);
  add(-T.half, T.half, 0, T.top, T.back - 0.4, T.back, wall);
  add(-T.half - 0.4, T.half + 0.4, T.top, T.top + 0.4, T.back - 0.4, 0.4, dark);
  // wings
  for (const s of [-1, 1]) {
    add(s < 0 ? -W.to - 0.4 : W.to, s < 0 ? -W.to : W.to + 0.4, 0, 14, M.REAR.from, 0.4, wall);
    add(s < 0 ? -W.to : T.half, s < 0 ? -T.half : W.to, 14, 14.4, M.REAR.from, 0.4, dark);
    add(s < 0 ? -W.to : W.from, s < 0 ? -W.from : W.to, -0.4, 0, M.REAR.from, 0, floor);
    add(s < 0 ? -W.to : T.half, s < 0 ? -T.half : W.to, 0, 14, M.REAR.from - 0.4, M.REAR.from, wall);
  }
  // rear stage
  for (const s of [-1, 1]) add(s < 0 ? -M.STAGE.half - 0.4 : M.STAGE.half, s < 0 ? -M.STAGE.half : M.STAGE.half + 0.4, 0, 14, R.to, R.from, wall);
  add(-M.STAGE.half, M.STAGE.half, 0, 14, R.to - 0.4, R.to, wall); add(-M.STAGE.half, M.STAGE.half, 14, 14.4, R.to, R.from, dark);
  add(-M.STAGE.half, M.STAGE.half, -0.4, 0, R.to, R.from, floor);
  // fixed stage floor around the platforms, the apron, and the understage box
  const PW = M.PLATFORM.w / 2, PB = M.platformZ(M.PLATFORM.count - 1)[0];
  for (const s of [-1, 1]) add(s < 0 ? -M.STAGE.half : PW, s < 0 ? -PW : M.STAGE.half, -0.4, 0, PB, 0, floor);
  add(-PW, PW, -0.4, 0, M.PLATFORM.first, 0, floor);
  add(-PW, PW, -0.4, 0, R.from, PB, floor);
  add(-M.PIT.half - 1, M.PIT.half + 1, -0.4, 0, 0, M.APRON, floor);
  for (const s of [-1, 1]) add(s < 0 ? -T.half - 0.4 : T.half, s < 0 ? -T.half : T.half + 0.4, U, 0, T.back, 0, dark);
  add(-T.half, T.half, U - 0.4, U, T.back, 0, dark); add(-T.half, T.half, U, 0, T.back - 0.4, T.back, dark); add(-T.half, T.half, U, -0.4, -0.4, 0, dark);
  // orchestra pit walls
  for (const s of [-1, 1]) add(s < 0 ? -M.PIT.half - 0.3 : M.PIT.half, s < 0 ? -M.PIT.half : M.PIT.half + 0.3, M.PIT.min - 0.6, 0, M.PIT.back, M.PIT.front, dark);
  add(-M.PIT.half, M.PIT.half, M.PIT.min - 0.6, -0.15, M.PIT.front, M.PIT.front + 0.3, dark);
  // grid and galleries
  const gridMat = shellMat(0x3b3f45);
  for (let z = T.back + 0.6; z < 0; z += 0.9) add(-T.half, T.half, T.grid, T.grid + 0.12, z - 0.06, z + 0.06, gridMat);
  add(-T.half, T.half, T.grid - 0.3, T.grid, T.back, T.back + 0.3, gridMat); add(-T.half, T.half, T.grid - 0.3, T.grid, -0.3, 0, gridMat);
  for (const y of [10, 20]) for (const s of [-1, 1]) {
    add(s < 0 ? -T.half : T.half - 1.8, s < 0 ? -T.half + 1.8 : T.half, y, y + 0.15, -22, -1, gridMat);
    add(s < 0 ? -T.half + 1.7 : T.half - 1.8, s < 0 ? -T.half + 1.8 : T.half - 1.7, y + 0.15, y + 1.1, -22, -1, gridMat);
  }
  // safety curtain, stored above the opening
  add(-8, 8, 11.5, 23.5, 0.45, 0.75, shellMat(0x7d8288, { metalness: 0.4, roughness: 0.5 }));
  // auditorium: stalls, side walls, balconies
  const stalls = new THREE.Mesh(new THREE.PlaneGeometry(30, 26), house); stalls.rotation.x = -Math.PI / 2 - Math.atan2(3.7, 25); stalls.position.set(0, 0.65, 19.5); building.add(stalls);
  for (const s of [-1, 1]) add(s < 0 ? -15.4 : 15, s < 0 ? -15 : 15.4, -1.5, 22, 0.4, 33, wall);
  add(-15.4, 15.4, -1.5, 22, 33, 33.4, wall); add(-15.4, 15.4, 22, 22.4, 0.4, 33.4, dark);
  for (const y of [6, 10, 14]) { for (const s of [-1, 1]) add(s < 0 ? -15 : 12, s < 0 ? -12 : 15, y, y + 0.4, 6, 33, house); add(-12, 12, y, y + 0.4, 29, 33, house); }
  for (const s of [-1, 1]) add(s < 0 ? -15 : 12, s < 0 ? -12 : 15, 16.4, 16.8, 6, 33, house);
  add(-12, 12, 16.4, 16.8, 27, 33, house);
  // street level, 2.54 m under the stage
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x2e3034, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.54 - 0.02; ground.visible = false; building.add(ground);
}

// ─── The pieces ──────────────────────────────────────────────────────────────
function clothTexture(kind) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320; const g = c.getContext('2d');
  if (kind === 'forest') {
    const gr = g.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#9cc3d6'); gr.addColorStop(1, '#d9e4c6'); g.fillStyle = gr; g.fillRect(0, 0, 512, 320);
    for (let i = 0; i < 26; i++) { const x = (i * 97) % 520, h = 120 + (i * 53) % 140; g.fillStyle = i % 2 ? '#2f5a2c' : '#3f7338'; g.beginPath(); g.moveTo(x - 30, 320); g.lineTo(x, 320 - h); g.lineTo(x + 30, 320); g.fill(); }
  } else if (kind === 'palace') {
    g.fillStyle = '#e8d8b4'; g.fillRect(0, 0, 512, 320); g.fillStyle = '#b89760';
    for (let x = 30; x < 512; x += 70) { g.fillRect(x, 60, 22, 260); g.fillRect(x - 6, 50, 34, 14); }
    g.fillRect(0, 30, 512, 22); g.fillStyle = '#8a6d3b'; g.beginPath(); g.moveTo(140, 30); g.lineTo(256, -20); g.lineTo(372, 30); g.fill();
  } else if (kind === 'hell') {
    const gr = g.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#1b0a08'); gr.addColorStop(1, '#8e2c12'); g.fillStyle = gr; g.fillRect(0, 0, 512, 320);
    for (let i = 0; i < 40; i++) { const x = (i * 61) % 512, h = 60 + (i * 37) % 150; g.fillStyle = i % 3 ? '#ff7a1a' : '#ffc83a'; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(x - 18, 320); g.quadraticCurveTo(x - 10, 320 - h / 2, x, 320 - h); g.quadraticCurveTo(x + 10, 320 - h / 2, x + 18, 320); g.fill(); }
    g.globalAlpha = 1;
  } else { g.fillStyle = '#5e7fa8'; g.fillRect(0, 0, 512, 320); g.fillStyle = '#f2f2f2'; g.globalAlpha = 0.6; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(60 + i * 55, 80 + (i % 3) * 40, 40, 16, 0, 0, 7); g.fill(); } g.globalAlpha = 1; }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
const selMat = new THREE.MeshBasicMaterial({ color: 0xffa640, wireframe: true });
const objs = {};
function pieceObject(id) {
  const p = M.PIECES[id], g = new THREE.Group(); g.userData.id = id;
  const pipeMat = mat(0x9a9da3, { metalness: 0.5, roughness: 0.4 });
  const cable = new THREE.LineBasicMaterial({ color: 0x777b80 });
  const pipe = (w, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w, 6), pipeMat); m.rotation.z = Math.PI / 2; m.position.y = y; return m; };
  const cables = (w, n) => { const pts = []; for (let k = 0; k < n; k++) { const x = -w / 2 + w * k / (n - 1); pts.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 1, 0)); } const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), cable); l.userData.cables = true; return l; };
  if (p.kind === 'drop') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshStandardMaterial({ map: clothTexture(id), side: THREE.DoubleSide, roughness: 0.95 }));
    m.position.y = -p.h / 2; g.add(m, pipe(p.w + 0.4, 0), cables(p.w, 6));
    if (p.counterweight) { const arbor = box(-0.3, 0.3, -1.5, 0, -0.3, 0.3, mat(0x444a52, { metalness: 0.5 })); arbor.userData.arbor = true; g.add(arbor); const rope = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xd9c9a0 })); rope.userData.rope = true; g.add(rope); }
  } else if (p.kind === 'border') {
    const m = box(-p.w / 2, p.w / 2, -p.h, 0, -0.04, 0.04, mat(0x1b1b1e, { roughness: 1 })); g.add(m, pipe(p.w, 0), cables(p.w, 6));
  } else if (p.kind === 'electric') {
    g.add(pipe(p.w, 0), cables(p.w, 6));
    const lamp = mat(0x222226, { metalness: 0.3 }), lens = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let x = -p.w / 2 + 0.6; x <= p.w / 2 - 0.5; x += 1.2) { const l = box(x - 0.18, x + 0.18, -0.65, -0.1, -0.22, 0.22, lamp); l.rotation.x = 0.5; g.add(l); const f = box(x - 0.13, x + 0.13, -0.62, -0.5, 0.05, 0.2, lens); g.add(f); }
  } else if (p.kind === 'truss') {
    const tm = mat(0xb5b8bd, { metalness: 0.6, roughness: 0.35 });
    for (const [y, z] of [[0, -0.4], [0, 0.4], [-1, -0.4], [-1, 0.4]]) { const m = pipe(p.w, y); m.material = tm; m.position.z = z; g.add(m); }
    const pts = []; for (let x = -p.w / 2; x <= p.w / 2 + 1e-6; x += 1) pts.push(new THREE.Vector3(x, 0, -0.4), new THREE.Vector3(x + 0.5, -1, -0.4), new THREE.Vector3(x, 0, 0.4), new THREE.Vector3(x + 0.5, -1, 0.4));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcfd2d6 })));
    const lamp = mat(0x222226);
    for (let x = -p.w / 2 + 1; x < p.w / 2; x += 1.6) g.add(box(x - 0.2, x + 0.2, -1.5, -1, -0.2, 0.2, lamp));
    const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb040 })); lines.userData.bridles = true; g.add(lines);
  } else if (p.kind === 'leg') {
    for (const s of [-1, 1]) { const m = box(0, p.w, 0, p.h, -0.04, 0.04, mat(0x1b1b1e, { roughness: 1 })); m.userData.side = s; g.add(m); }
  } else if (p.kind === 'platform') {
    const [zb, zf] = M.platformZ(p.i), d = zf - zb;
    const deck = box(-M.PLATFORM.w / 2 + 0.03, M.PLATFORM.w / 2 - 0.03, -0.5, 0, -d / 2 + 0.03, d / 2 - 0.03, mat(0x9b7b55));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(M.PLATFORM.w - 1, 1, d - 0.6), new THREE.MeshStandardMaterial({ color: 0x4a5058, wireframe: true }));
    frame.userData.column = true; g.add(deck, frame); g.position.z = (zb + zf) / 2;
  } else if (p.kind === 'pit') {
    g.add(box(-M.PIT.half, M.PIT.half, -0.5, 0, M.PIT.back, M.PIT.front, mat(0x6a5846)));
    const chair = mat(0x2a2a2a); for (let x = -7; x <= 7; x += 1.4) for (let z = 2.6; z <= 5.8; z += 1.1) g.add(box(x - 0.2, x + 0.2, 0, 0.9, z - 0.2, z + 0.2, chair));
  } else if (p.kind === 'wagon') {
    const w = p.w, d = p.axis === 'x' ? p.z[1] - p.z[0] : p.d;
    g.add(box(-w / 2, w / 2, 0, 0.3, -d / 2, d / 2, mat(0x3d3a36)));
    if (id === 'wForest') {
      const leaf = mat(0x3f7338), trunk = mat(0x5a4232);
      for (const [x, z, s] of [[-2.6, -1.5, 1], [0, 1, 1.2], [2.5, -0.8, 0.9], [-1, 2, 0.8], [2.8, 2, 0.7]]) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1.6 * s, 8), trunk); tr.position.set(x, 0.3 + 0.8 * s, z); const cn = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 3.4 * s, 10), leaf); cn.position.set(x, 0.3 + 1.6 * s + 1.7 * s, z); g.add(tr, cn); }
    } else {
      const stone = mat(0xd8c8a0), col = mat(0xb89760);
      g.add(box(-w / 2 + 1, w / 2 - 1, 0.3, 1.5, -d / 2 + 0.5, d / 2 - 2, stone));
      for (let k = 0; k < 5; k++) g.add(box(-3 + 0.3 * k, 3 - 0.3 * k, 0.3, 0.3 + 0.25 * (k + 1), d / 2 - 2 + 0.4 * k, d / 2 - 1.6 + 0.4 * k, stone));
      for (let x = -w / 2 + 1.5; x <= w / 2 - 1.4; x += 2.6) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 5, 12), col); c.position.set(x, 4, -d / 2 + 1); g.add(c); }
      g.add(box(-w / 2 + 0.8, w / 2 - 0.8, 6.5, 7, -d / 2 + 0.4, -d / 2 + 1.6, col));
    }
  } else if (p.kind === 'statue') {
    const sm = mat(0xcfc9bc, { roughness: 0.6 });
    g.add(box(-0.7, 0.7, 0, 0.8, -0.7, 0.7, sm));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.1, 12), sm); body.position.y = 1.85; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), sm); head.position.y = 3.25; g.add(head);
  }
  g.traverse(o => { o.userData.id = id; });
  scene.add(g); return g;
}
for (const id of Object.keys(M.PIECES)) objs[id] = pieceObject(id);
// Selection outline: a box around the selected piece.
const selBox = new THREE.Box3Helper(new THREE.Box3(), 0xffa640); scene.add(selBox);
// Quiz: the part under the mouse, shown as a translucent box.
const partMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
const partGroup = new THREE.Group(); scene.add(partGroup);
const partMeshes = [];
for (const p of PARTS) for (const b of p.boxes) { const m = box(b[0], b[1], b[2], b[3], b[4], b[5], partMat); m.userData.part = p.id; m.userData.vol = (b[1] - b[0]) * (b[3] - b[2]) * (b[5] - b[4]); m.visible = false; partGroup.add(m); partMeshes.push(m); }
const foundMat = new THREE.MeshBasicMaterial({ color: 0x56d364, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
// Seats: small markers; sightlines from the chosen seat through the corners of the opening.
const seatMarks = {};
for (const [id, s] of Object.entries(M.SEATS)) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshBasicMaterial({ color: 0x4aa3ff })); m.position.set(...s.p); m.userData.seat = id; scene.add(m); seatMarks[id] = m; }
const sightLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.8 }));
scene.add(sightLines);

function updateScene() {
  const st = S.st;
  for (const [id, g] of Object.entries(objs)) {
    const p = M.PIECES[id]; g.visible = shown(id);
    if (!g.visible) continue;
    const v = st.v[id];
    if (['drop', 'border', 'electric', 'truss'].includes(p.kind)) {
      g.position.set(0, v, p.z);
      g.children.filter(c => c.userData.cables).forEach(c => { c.scale.y = M.TOWER.grid - v; });
      if (p.counterweight) {
        // the arbor runs up and down the side wall, the opposite way from the bar
        const arbor = g.children.find(c => c.userData.arbor), rope = g.children.find(c => c.userData.rope);
        const ay = (M.TOWER.grid - 2 - (v - p.h)) - v; arbor.position.set(M.TOWER.half - 0.6, ay, 0);
        const L = (x, y) => new THREE.Vector3(x, y, 0);
        rope.geometry.setFromPoints([L(p.w / 2, 0), L(p.w / 2, M.TOWER.grid - v), L(p.w / 2, M.TOWER.grid - v), L(M.TOWER.half - 0.6, M.TOWER.grid - v), L(M.TOWER.half - 0.6, M.TOWER.grid - v), L(M.TOWER.half - 0.6, ay)]);
        const cw = M.counterweight(st); arbor.scale.y = Math.max(0.15, st.cw / 16);
        arbor.material.color.set(Math.abs(cw.diff) <= M.BRICK / 2 ? 0x4b6b4b : cw.runaway ? 0x8a3a30 : 0x6b6a4b);
      }
      if (p.kind === 'truss') {
        const b = g.children.find(c => c.userData.bridles), pts = [];
        for (const k of st.truss) { const z = M.TRUSS_BARS[k].z - p.z; for (const x of [-p.w / 2 + 1, p.w / 2 - 1]) pts.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 1.5, z)); }
        b.geometry.setFromPoints(pts);
      }
    } else if (p.kind === 'leg') {
      g.position.set(0, 0, p.z);
      g.children.forEach(c => { c.position.x = c.userData.side < 0 ? -v - p.w / 2 : v + p.w / 2; });
    } else if (p.kind === 'platform') {
      g.position.y = v;
      const col = g.children.find(c => c.userData.column), hgt = v - M.UNDER - 0.5; col.scale.y = Math.max(0.01, hgt); col.position.y = -0.5 - hgt / 2;
    } else if (p.kind === 'pit') g.position.y = v;
    else if (p.kind === 'wagon') { const b = M.boxes(id, st)[0]; g.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2); }
    else if (p.kind === 'statue') { const b = M.boxes(id, st)[0]; g.position.set((b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2); }
  }
  // selection box
  if (S.sel && shown(S.sel)) {
    const bx = M.boxes(S.sel, st), b3 = selBox.box; b3.makeEmpty();
    for (const b of bx) { b3.expandByPoint(new THREE.Vector3(b.x0, b.y0, b.z0)); b3.expandByPoint(new THREE.Vector3(b.x1, b.y1, b.z1)); }
    b3.expandByScalar(0.08); selBox.visible = true;
  } else selBox.visible = false;
  // quiz parts
  const quiz = !!step().quiz;
  partMeshes.forEach(m => { const found = S.flags.found?.includes(m.userData.part); m.visible = !!(quiz && (m.userData.part === S.hoverPart || found)); m.material = m.userData.part === S.hoverPart ? partMat : foundMat; });
  // seats and sightlines
  for (const [id, m] of Object.entries(seatMarks)) { m.material.color.set(id === S.seat ? 0xffd24a : 0x4aa3ff); m.scale.setScalar(id === S.seat ? 1.4 : 1); }
  const eye = new THREE.Vector3(...M.SEATS[S.seat].p), pts = [];
  if (S.show.sight) for (const [x, y] of [[-M.BOCA.half, M.BOCA.h], [M.BOCA.half, M.BOCA.h], [-M.BOCA.half, 0], [M.BOCA.half, 0]]) {
    const c = new THREE.Vector3(x, y, 0), dir = c.clone().sub(eye), k = (eye.z + 22) / eye.z; pts.push(eye, eye.clone().addScaledVector(dir, k));
  }
  sightLines.geometry.setFromPoints(pts); sightLines.visible = S.show.sight;
  for (const m of shellMats) m.clippingPlanes = S.show.section ? [cut] : [];
  requestRender();
}

// ─── Rendering ──────────────────────────────────────────────────────────────
let renderQueued = false;
function requestRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderAll3d(); }); }
function renderAll3d() {
  renderer.render(scene, camera);
  if (!S.show.seat) return;
  const seatOnly = [sightLines, selBox, partGroup, ...Object.values(seatMarks)], was = seatOnly.map(o => o.visible);
  seatOnly.forEach(o => { o.visible = false; });
  const s = M.SEATS[S.seat].p; seatCam.position.set(...s);
  seatCam.lookAt(s[0] * 0.25, S.seat === 'balcony' ? 2.5 : 5.2, -9); seatCam.updateMatrixWorld();
  seatRenderer.render(scene, seatCam);
  seatOnly.forEach((o, k) => { o.visible = was[k]; });
  drawSeatMarks();
}
function resize() {
  const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  const f = $('.seat-frame').getBoundingClientRect();
  if (f.width) { seatRenderer.setSize(f.width, f.height, false); seatCam.aspect = f.width / f.height; seatCam.updateProjectionMatrix(); const mk = $('#seat-marks'); mk.width = f.width * devicePixelRatio; mk.height = f.height * devicePixelRatio; }
  requestRender();
}
// Red marks on the seat view: the points of what should be hidden that this seat still sees.
function watched() {
  const s = step(), ids = [];
  if (s.id === 'p2') ids.push('forest');
  if (s.lights) ids.push(...ELECTRICS);
  if (s.change) for (const [id, want] of s.targets) if (want === 'out') ids.push(id);
  if (s.change) ids.push(...['wForest', 'wPalace'].filter(w => !s.targets.some(([id, want]) => id === w && typeof want === 'number' && Math.abs(want) < 12)));
  return ids;
}
function drawSeatMarks() {
  const c = $('#seat-marks'), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const pts = watched().flatMap(id => M.seenPoints(id, S.st, step().show, S.seat));
  if (step().wings) pts.push(...M.wingSeenPoints(S.st, step().show, S.seat));
  g.fillStyle = '#ff4d3a'; const v = new THREE.Vector3();
  for (const p of pts) { v.set(...p).project(seatCam); if (v.z > 1) continue; g.beginPath(); g.arc((v.x + 1) / 2 * c.width, (1 - v.y) / 2 * c.height, 2.6 * devicePixelRatio, 0, 7); g.fill(); }
  $('#seat-note').textContent = pts.length ? tr('{n} red points seen', { n: pts.length }) : '';
}
const VIEWS = { front: [0, 0.25, 1], right: [1, 0.05, 0], top: [0.001, 1, 0.001], back: [0, 0.2, -1], left: [-1, 0.1, 0] };
function frameAll(view = null) {
  const c = new THREE.Vector3(0, 5, -3), size = 72;
  const dist = size / (2 * Math.tan(camera.fov * Math.PI / 360)) * (camera.aspect < 1.2 ? 1.3 / Math.max(0.6, camera.aspect) : 1);
  const dir = new THREE.Vector3(...(VIEWS[view] || [1, 0.32, 0.55])).normalize();
  controls.target.copy(c); camera.position.copy(c).addScaledVector(dir, dist); camera.up.set(0, 1, 0); camera.lookAt(c); controls.update(); requestRender();
}

// ─── Picking ─────────────────────────────────────────────────────────────────
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)); ray.setFromCamera(ndc, camera); }
function pickPiece(e) {
  setRay(e);
  const targets = Object.entries(objs).filter(([id, g]) => g.visible && movable(id)).map(([, g]) => g);
  const hit = ray.intersectObjects(targets, true)[0];
  return hit ? hit.object.userData.id : null;
}
function pickPart(e) {
  setRay(e);
  partMeshes.forEach(m => { m.userData.wasVisible = m.visible; m.visible = true; });
  const hits = ray.intersectObjects(partMeshes, false);
  partMeshes.forEach(m => { m.visible = m.userData.wasVisible; });
  if (!hits.length) return null;
  // the ray is inside every box it has already entered: prefer the smallest one it touches
  return hits.map(h => h.object).sort((a, b) => a.userData.vol - b.userData.vol)[0].userData.part;
}
// While moving a piece (G) the mouse works anywhere on the page, and any click confirms or cancels, as in Blender.
window.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect(); S.pointer = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
  if (S.modal) updateModal();
}, true);
let swallowClick = false;
window.addEventListener('pointerdown', e => { if (!S.modal) return; e.preventDefault(); e.stopPropagation(); swallowClick = true; endModal(e.button === 0); }, true);
window.addEventListener('click', e => { if (!swallowClick) return; swallowClick = false; e.preventDefault(); e.stopPropagation(); }, true);
window.addEventListener('pointerup', () => { setTimeout(() => { swallowClick = false; }, 0); });
canvas.addEventListener('pointermove', e => {
  if (S.modal) return;
  if (step().quiz) {
    const p = pickPart(e); if (p !== S.hoverPart) { S.hoverPart = p; updateScene(); }
    const tip = $('#part-tip');
    if (p && S.flags.found?.includes(p)) { tip.hidden = false; tip.textContent = t(PARTS.find(x => x.id === p).name); tip.style.left = `${S.pointer.x + 14}px`; tip.style.top = `${S.pointer.y + 10}px`; } else tip.hidden = true;
  }
});
canvas.addEventListener('pointerleave', () => { if (S.hoverPart) { S.hoverPart = null; updateScene(); } $('#part-tip').hidden = true; });
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.altKey) return;
  if (step().quiz) { const p = pickPart(e); if (p) clickPart(p); return; }
  select(pickPiece(e));
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
function select(id) { S.sel = id && movable(id) ? id : null; updateScene(); renderProps(); drawOverlay(); }

// ─── The quiz ────────────────────────────────────────────────────────────────
const quizTarget = () => { const q = step().quiz; return q && q.find(id => !(S.flags.found || []).includes(id)); };
function clickPart(id) {
  const part = PARTS.find(p => p.id === id), target = quizTarget();
  if (!target) { msg(tr('{p}: {a}', { p: t(part.name), a: t(part.about) })); return; }
  if (id === target) {
    S.flags.found = [...(S.flags.found || []), id]; saveData();
    msg(tr('✓ {p}: {a}', { p: t(part.name), a: t(part.about) }));
    changed(false);
  } else msg(tr('That is the {p}. Look for the {q}.', { p: t(part.name), q: t(PARTS.find(p => p.id === target).name) }), true);
}

// ─── G: move along the track ─────────────────────────────────────────────────
const AXIS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
function anchor(id) { const bx = M.boxes(id, S.st), b = bx[bx.length - 1]; return new THREE.Vector3(M.PIECES[id].kind === 'leg' ? b.x0 : (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2); }
function toScreen(v) { const r = canvas.getBoundingClientRect(), p = v.clone().project(camera); return new THREE.Vector2((p.x + 1) / 2 * r.width, (1 - p.y) / 2 * r.height); }
function startModal() {
  if (!S.sel) return msg('Select a piece first (click it, or pick it in the list).');
  if (step().cw && S.sel === 'cloth' && M.counterweight(S.st).runaway) return msg(tr('Out of balance by {kg} kg: the bar would run away. Load the arbor first.', { kg: Math.round(M.counterweight(S.st).diff) }), true);
  const id = S.sel, a = anchor(id), ax = new THREE.Vector3(...AXIS[M.PIECES[id].axis]);
  const s0 = toScreen(a), s1 = toScreen(a.clone().add(ax));
  // legs open to the side of the section: moving the mouse outwards opens them
  S.modal = { id, from: S.st.v[id], prev: JSON.stringify(S.st), s0, dir: s1.sub(s0), start: S.pointer ? { ...S.pointer } : null, typed: '', blocked: null };
  host.classList.add('modal'); updateModal();
}
function updateModal() {
  const m = S.modal; if (!m) return;
  let target;
  if (m.typed && !isNaN(parseFloat(m.typed))) target = parseFloat(m.typed);
  else if (m.start && S.pointer) {
    const d = new THREE.Vector2(S.pointer.x - m.start.x, S.pointer.y - m.start.y), L2 = Math.max(m.dir.lengthSq(), 4);
    target = m.from + d.dot(m.dir) / L2;
  } else target = m.from;
  target = Math.round(target * 100) / 100;
  S.st.v[m.id] = m.from;
  const r = M.moveTo(S.st, step().show, m.id, target);
  S.st.v[m.id] = r.value; m.blocked = r.blocked;
  updateScene();
  const p = M.PIECES[m.id], ro = $('#op-readout'); ro.hidden = false;
  ro.innerHTML = `<b>${esc(t(p.name))}</b> · ${esc(t(AXIS_LABEL[p.kind]))} <b>${r.value.toFixed(2)} m</b>${m.typed ? ` <span class="typed">[${esc(m.typed)}]</span>` : ''}${m.blocked ? `<br><span class="warn">${esc(t(m.blocked))}</span>` : ''}`;
  renderReadoutLive();
}
function endModal(ok) {
  const m = S.modal; if (!m) return;
  S.modal = null; host.classList.remove('modal'); $('#op-readout').hidden = true;
  if (!ok) { S.st = JSON.parse(m.prev); changed(false); return; }
  if (S.st.v[m.id] !== m.from) { S.undo.push(m.prev); S.redo = []; }
  if (m.blocked) msg(m.blocked, true);
  changed();
}
function modalKey(e) {
  const m = S.modal, k = e.key;
  if (k === 'Escape') return endModal(false);
  if (k === 'Enter' || k === ' ') return endModal(true);
  if (/^[0-9.]$/.test(k) || (k === '-' && !m.typed)) m.typed += k;
  else if (k === 'Backspace') m.typed = m.typed.slice(0, -1);
  updateModal();
}
const AXIS_LABEL = { drop: 'bar height', border: 'bar height', electric: 'bar height', truss: 'bar height', leg: 'inner edge from the centre', platform: 'height', pit: 'height', wagon: 'position' };

// ─── Properties ─────────────────────────────────────────────────────────────
const fmt = v => (Math.round(v * 100) / 100).toString();
const row = (label, val, good) => `<div class="sb-stat${good == null ? '' : good ? ' good' : ' bad'}"><span>${esc(t(label))}</span><b>${val}</b></div>`;
const seatName = id => t(M.SEATS[id].name);
function seenChips(id) {
  const seen = M.seenFrom(id, S.st, step().show);
  return `<div class="seen">${M.SEAT_IDS.map(s => `<span class="chip ${seen[s] ? 'on' : 'off'}" title="${esc(seatName(s))}">${esc(t(seen[s] ? 'seen' : 'hidden'))} · ${esc(seatName(s))}</span>`).join('')}</div>`;
}
function listHtml() {
  const ids = step().show.filter(movable);
  if (!ids.length) return '';
  return `<div class="panel"><h4>${esc(t('On stage'))}<small>${esc(t('click · G · type'))}</small></h4><div class="bone-list piece-list">` + ids.map(id => {
    const p = M.PIECES[id], [a, b] = M.range(id);
    return `<div class="bone-row piece-row${S.sel === id ? ' active' : ''}" data-piece="${id}"><span class="p-dot" style="background:#${(p.color ?? 0x8f7a5a).toString(16).padStart(6, '0')}"></span><span class="p-name">${esc(t(p.name))}</span><input type="number" step="0.1" min="${a}" max="${b}" data-val="${id}" value="${fmt(S.st.v[id])}" aria-label="${esc(t(p.name))}"></div>`;
  }).join('') + `</div></div>`;
}
function selectedHtml() {
  const id = S.sel; if (!id) return `<div class="panel"><h4>${esc(t('Selected'))}</h4><p class="sb-empty">${esc(t('Click a piece in the view or in the list.'))}</p></div>`;
  const p = M.PIECES[id], [a, b] = M.range(id);
  let h = `<div class="panel" id="sel-panel"><h4>${esc(t(p.name))}<small>${esc(t(KIND[p.kind]))}</small></h4>`;
  h += row(AXIS_LABEL[p.kind], `${fmt(S.st.v[id])} m`) + row('Travel', `${fmt(a)} … ${fmt(b)} m`);
  if (['drop', 'border'].includes(p.kind)) h += row('Bottom edge', `${fmt(S.st.v[id] - p.h)} m`);
  if (p.kg) h += row('Weight', `${p.kg} kg`);
  if (['drop', 'wagon', 'truss'].includes(p.kind)) h += seenChips(id);
  return h + `</div>`;
}
const KIND = { drop: 'backdrop on a bar', border: 'border (bambalina)', electric: 'bar of lights', truss: 'truss', leg: 'pair of legs (patas)', platform: 'stage lift', pit: 'pit lift', wagon: 'wagon (carro)', statue: 'prop' };
function stepPanelHtml() {
  const s = step(), st = S.st;
  let h = '';
  if (s.quiz) {
    const found = S.flags.found || [], target = quizTarget();
    h += `<div class="panel quiz"><h4>${esc(t('Find'))}<small>${found.length} / ${s.quiz.length}</small></h4>`;
    h += target ? `<p class="quiz-target">${esc(t(PARTS.find(p => p.id === target).name))}</p>` : `<p class="sb-empty">${esc(t('All found. Click any part to read about it again.'))}</p>`;
    h += `<ul class="found">${found.map(id => `<li>✓ ${esc(t(PARTS.find(p => p.id === id).name))}</li>`).join('')}</ul></div>`;
  }
  if (s.cw) {
    const c = M.counterweight(st), ok = Math.abs(c.diff) <= M.BRICK / 2;
    h += `<div class="panel"><h4>${esc(t('Counterweight'))}<small>${esc(tr('bricks of {kg} kg', { kg: M.BRICK }))}</small></h4>
      <div class="brick-row"><button type="button" class="mini" data-cw="-1">−</button><b>${st.cw}</b><button type="button" class="mini" data-cw="1">+</button><button type="button" class="mini" data-cw="5">+5</button></div>
      ${row('Cloth + bar', `${c.load} kg`)}${row('Arbor', `${c.cw} kg`)}${row('Imbalance', `${c.diff > 0 ? '+' : ''}${c.diff.toFixed(1)} kg`, ok)}${row('Force on the rope', `${Math.round(c.force)} N`, ok)}
      <p class="sb-empty">${esc(t(ok ? 'Balanced: one hand moves it.' : c.runaway ? 'Too much imbalance: the bar would run away.' : 'Nearly: a strong pull would move it, but it will not stay put.'))}</p></div>`;
  }
  if (s.truss) {
    const loads = M.trussLoads(st);
    h += `<div class="panel"><h4>${esc(t('Hang the truss from'))}<small>${esc(tr('limit {kg} kg per bar', { kg: M.BAR_LIMIT }))}</small></h4>` + Object.entries(M.TRUSS_BARS).map(([k, b]) => {
      const over = loads[k] > M.BAR_LIMIT;
      return `<label class="bar-row${over ? ' over' : ''}"><input type="checkbox" data-bar="${k}"${st.truss.includes(k) ? ' checked' : ''}><span>${esc(tr('Bar {k}', { k }))}</span><small>${esc(tr('already {kg} kg', { kg: b.kg }))}</small><b>${Math.round(loads[k])} kg</b></label>`;
    }).join('') + row('Share of the truss', st.truss.length ? `${Math.round(M.PIECES.truss.kg / st.truss.length)} kg × ${st.truss.length}` : '—') + `</div>`;
  }
  h += `<div class="panel" id="readout-panel">${readoutHtml()}</div>`;
  return h;
}
function readoutHtml() {
  const s = step(), st = S.st;
  let h = `<h4>${esc(t('Readout'))}</h4>`;
  if (s.id === 'p2') { const seen = M.seenFrom('forest', st, s.show); h += row('Backdrop seen from', M.SEAT_IDS.filter(k => seen[k]).map(seatName).join(', ') || t('nobody'), !Object.values(seen).some(Boolean)); h += row('Grid height', `${M.TOWER.grid} m`) + row('Grid ÷ opening height', `${M.towerRatio().toFixed(1)} ×`); }
  if (s.id === 'p3') h += row('Pit floor', `${fmt(st.v.pit)} m`, st.v.pit <= -2.4 && st.v.pit >= -3.2);
  if (s.id === 'l1') h += PLATS.map((p, i) => row(M.PIECES[p].name, `${fmt(st.v[p])} m`, Math.abs(st.v[p] - 0.4 * i) <= 0.05)).join('');
  if (s.id === 'l2') { const top = M.boxes('statue', st)[0].y1; h += row('Top of the statue', `${fmt(top)} m`, top <= -0.2); }
  if (s.id === 'l3') { const c = M.conflict(st, s.show); h += row('Wagon position', `${fmt(st.v.wForest)} m`, st.v.wForest <= 0.2) + row('Track', t(c ? 'blocked' : 'clear'), !c); }
  if (s.wings) { const w = M.wingsSeen(st, s.show); h += M.SEAT_IDS.map(k => row(tr('Wings from: {s}', { s: seatName(k) }), t(w[k] ? 'seen' : 'hidden'), !w[k])).join('') + row('Acting width', `${fmt(M.openingWidth(st))} m`, M.openingWidth(st) >= 12 - 1e-6); }
  if (s.lights) { h += ELECTRICS.map(e => { const hid = M.hidden(e, st, s.show); return row(M.PIECES[e].name, t(hid ? 'hidden' : 'seen'), hid); }).join('') + row('Lowest border bottom', `${fmt(M.lowestBorder(st))} m`, M.lowestBorder(st) >= 7.2 - 1e-6); }
  if (s.change) {
    h += s.targets.map(tg => { const [id, want] = tg, ok = targetDone(s, st, tg); const what = want === 'out' ? 'out of sight' : want === 'in' ? 'in (bar at 12 m)' : want === 'down' ? 'under the stage' : tr('at {m} m', { m: want }); return row(`${t(M.PIECES[id].name)} → ${t(what)}`, ok ? '✓' : '·', ok); }).join('');
    const c = M.conflict(st, s.show); h += row('Interlocks', t(c ? 'blocked' : 'clear'), !c);
  }
  if (s.cw) { const c = M.counterweight(st); h += row('Cloth bar', `${fmt(st.v.cloth)} m`, st.v.cloth >= 20) + row('Balanced', t(Math.abs(c.diff) <= M.BRICK / 2 ? 'yes' : 'no'), Math.abs(c.diff) <= M.BRICK / 2); }
  if (s.truss) { const loads = M.trussLoads(st), over = Object.values(loads).some(kg => kg > M.BAR_LIMIT); h += row('Overloaded bars', over ? Object.entries(loads).filter(([, kg]) => kg > M.BAR_LIMIT).map(([k]) => k).join(', ') : t('none'), !over && st.truss.length >= 2); }
  if (s.quiz) h += row('Parts found', `${(S.flags.found || []).length} / ${s.quiz.length}`);
  return h;
}
function renderProps() { $('#props').innerHTML = stepPanelHtml() + listHtml() + selectedHtml(); }
function renderReadoutLive() {
  const r = $('#readout-panel'); if (r) r.innerHTML = readoutHtml();
  const sp = $('#sel-panel'); if (sp) sp.outerHTML = selectedHtml();
  document.querySelectorAll('[data-val]').forEach(inp => { if (document.activeElement !== inp) inp.value = fmt(S.st.v[inp.dataset.val]); });
}
$('#props').addEventListener('click', e => {
  const r = e.target.closest('[data-piece]'); if (r && !e.target.matches('input')) { select(r.dataset.piece); return; }
  const c = e.target.closest('[data-cw]'); if (c) { pushUndo(); S.st.cw = Math.max(0, S.st.cw + +c.dataset.cw); changed(); }
});
$('#props').addEventListener('focusin', e => { const id = e.target.dataset?.val; if (id && S.sel !== id) { S.sel = id; updateScene(); drawOverlay(); document.querySelectorAll('.piece-row').forEach(r => r.classList.toggle('active', r.dataset.piece === id)); } });
$('#props').addEventListener('change', e => {
  const id = e.target.dataset.val;
  if (id) {
    if (step().cw && id === 'cloth' && M.counterweight(S.st).runaway) { e.target.value = fmt(S.st.v[id]); return msg(tr('Out of balance by {kg} kg: the bar would run away. Load the arbor first.', { kg: Math.round(M.counterweight(S.st).diff) }), true); }
    const r = M.moveTo(S.st, step().show, id, +e.target.value || 0);
    pushUndo(); S.st.v[id] = r.value; if (r.blocked) msg(r.blocked, true); S.sel = id; changed(); return;
  }
  const bar = e.target.dataset.bar;
  if (bar) { pushUndo(); S.st.truss = e.target.checked ? [...S.st.truss, bar].sort() : S.st.truss.filter(k => k !== bar); changed(); }
});

function drawOverlay() {
  $('#view-overlay').innerHTML = `<div>${esc(t('User Perspective'))}${S.show.section ? ` · ${esc(t('section'))}` : ''}</div><div>${S.sel ? `<b>${esc(t(M.PIECES[S.sel].name))}</b>` : esc(t(step().quiz ? 'Click the parts of the building' : 'Nothing selected'))}</div>`;
}
function fillSeats() { $('#seat').innerHTML = M.SEAT_IDS.map(k => `<option value="${k}"${k === S.seat ? ' selected' : ''}>${esc(seatName(k))}</option>`).join(''); }
$('#seat').onchange = e => { S.seat = e.target.value; saveData(); updateScene(); };
$('#o-section').onchange = e => { S.show.section = e.target.checked; updateScene(); };
$('#o-sight').onchange = e => { S.show.sight = e.target.checked; updateScene(); };
$('#o-seat').onchange = e => { S.show.seat = e.target.checked; $('#seat-box').hidden = !S.show.seat; resize(); };

// ─── Stages, guide and step card ────────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-stage]'); if (!b) return;
  saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep();
});
const doneKey = i => `${stage().id}-${i}`;
const ctx = () => ({ flags: S.flags, step: step() });
const stepDone = i => i === S.step ? !!step().check(S.st, ctx()) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide');
  g.classList.toggle('three', st.steps.length === 3); g.classList.toggle('two', st.steps.length === 2);
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
  if (id === 'reset-step') { pushUndo(); S.st = step().start(); S.flags = {}; changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); const st = step().start(); step().solve(st, S.flags); S.st = st; changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
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
function enterStep() {
  loadData(); lastOk = null; S.hoverPart = null;
  if (step().focus && movable(step().focus)) S.sel = step().focus;
  updateScene(); lastOk = stepDone(S.step);
  fillSeats(); renderStageSwitch(); renderProps(); renderGuide(); renderStepCard(); drawOverlay();
}
function renderAll() { fillSeats(); renderStageSwitch(); renderProps(); renderGuide(); renderStepCard(); drawOverlay(); translateTitles(); requestRender(); }
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }

// ─── Keyboard (only while the pointer is over the workspace, like Blender) ──
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (S.modal) { e.preventDefault(); modalKey(e); return; }
  if (!S.hover) return;
  const k = e.key, low = k.toLowerCase(), code = e.code, ctrl = e.ctrlKey || e.metaKey;
  let handled = true;
  if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (low === 'g' && !ctrl) startModal();
  else if (k === 'Home') frameAll();
  else if (code === 'Numpad1' || (k === '1' && !ctrl)) frameAll(ctrl ? 'back' : 'front');
  else if (code === 'Numpad3' || (k === '3' && !ctrl)) frameAll(ctrl ? 'left' : 'right');
  else if (code === 'Numpad7' || (k === '7' && !ctrl)) frameAll('top');
  else if (k === 'Escape') select(null);
  else handled = false;
  if (handled) e.preventDefault();
});

// ─── Start ──────────────────────────────────────────────────────────────────
new ResizeObserver(resize).observe(host);
onLangChange(() => renderAll());
enterStep(); frameAll(); resize(); translateTitles();
window.__stage = { S, M, STAGES, select, startModal, frameAll, changed, camera, seatCam }; // for tests and curious students
