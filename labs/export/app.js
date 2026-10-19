// Export Lab: Blender on the left, Unity on the right. Blender objects are edited with real operators, the FBX
// exporter's options produce a file, and Unity imports it with its own settings (see xport.js).
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { M3, V, SHAPES, partPoints, meshParts, localPoint, worldPoint, RS, OPS, dimensions, localBounds, worldBounds, unityPoint, unityRotation, APPLY_SCALINGS, PATH_MODES, AXIS_OPTIONS, materialReport, rigReport, clipsOf, exportedBones, bounds } from './xport.js?v=1';
import { STAGES, startState, doExport, report, hierarchy, outdated, componentsOf, physicsState, TABLE_DROPS, addCollisionParts } from './stages.js?v=1';
import { dropHeight } from './xport.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fx = (v, d = 2) => { const r = Math.abs(v) < 5e-5 ? 0 : v; return (+r.toFixed(d)).toString(); };
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-export:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-export:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = { stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [], done: store.get('done', {}), play: null, hover: false, openSec: {} };
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step], sid = () => step().id;
let msgTimer;
function msg(text, warning = false) { const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning); clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 7000); }
const obj = name => S.st.objects.find(o => o.name === name);
const active = () => obj(S.st.sel);

// ─── Mesh data of the shapes (modelling coordinates, Z up) ───────────────────
// Triangles with per-vertex normals and UVs. Cylinders: smooth sides, flat caps; a barrel can be half
// (Mirror not applied), bevelled, and "blobby" (smoothing lost: every normal smooth).
function boxTris(p, flipFaces = []) {
  const [a, b] = p.box, out = [];
  const faces = [
    [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]], [0, -1, 0]],
    [[b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]], [1, 0, 0]],
    [[b[0], b[1], a[2]], [a[0], b[1], a[2]], [a[0], b[1], b[2]], [b[0], b[1], b[2]], [0, 1, 0]],
    [[a[0], b[1], a[2]], [a[0], a[1], a[2]], [a[0], a[1], b[2]], [a[0], b[1], b[2]], [-1, 0, 0]],
    [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]], [0, 0, 1]],
    [[a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], a[1], a[2]], [a[0], a[1], a[2]], [0, 0, -1]],
  ];
  faces.forEach(([p0, p1, p2, p3, n], i) => {
    const fl = flipFaces.includes(i), uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const quad = [[p0, p1, p2, 0, 1, 2], [p0, p2, p3, 0, 2, 3]];
    for (const [q0, q1, q2, u0, u1, u2] of quad) {
      const tri = { p: [q0, q1, q2], n: [n, n, n], uv: [uv[u0], uv[u1], uv[u2]], flipped: fl };
      if (fl) { tri.p.reverse(); tri.uv.reverse(); tri.n = tri.n.map(v => v.map(x => -x)); }
      out.push(tri);
    }
  });
  return out;
}
function cylTris(p, o = {}) {
  const { c, r, h } = p.cyl, N = 32, out = [];
  const topK = p.tag === 'shade' ? 0.55 : 1, a0 = o.half ? -Math.PI / 2 : 0, span = o.half ? Math.PI : Math.PI * 2, segs = o.half ? N / 2 : N;
  const bev = o.bevel ? Math.min(0.03, r * 0.12) : 0;
  // profile: [radius, z] from bottom centre to top centre
  const prof = bev ? [[0, 0], [r - bev, 0], [r, bev], [r * topK, h - bev], [r * topK - bev, h], [0, h]] : [[0, 0], [r, 0], [r, 0], [r * topK, h], [r * topK, h], [0, h]];
  const ang = i => a0 + span * i / segs;
  const pt = (k, i) => { const [rr, z] = prof[k], t2 = ang(i); return [c[0] + rr * Math.cos(t2), c[1] + rr * Math.sin(t2), c[2] + z]; };
  for (let k = 0; k < prof.length - 1; k++) {
    if (prof[k][0] === prof[k + 1][0] && prof[k][1] === prof[k + 1][1]) continue;
    const cap = prof[k][1] === prof[k + 1][1] && (prof[k][0] === 0 || prof[k + 1][0] === 0);
    for (let i = 0; i < segs; i++) {
      const A = pt(k, i), B = pt(k, i + 1), C = pt(k + 1, i + 1), D = pt(k + 1, i);
      let nA, nB, nC, nD;
      if (cap) { const nz = prof[k][1] === 0 ? -1 : 1; nA = nB = nC = nD = [0, 0, nz]; }
      else {
        const dr = prof[k + 1][0] - prof[k][0], dz = prof[k + 1][1] - prof[k][1], L = Math.hypot(dr, dz), nr = dz / L, nzz = -dr / L;
        const rad2 = t2 => [nr * Math.cos(t2), nr * Math.sin(t2), nzz];
        nA = nD = rad2(ang(i)); nB = nC = rad2(ang(i + 1));
        if (!o.autoSmooth && !o.blobby) { const m = rad2((ang(i) + ang(i + 1)) / 2); nA = nB = nC = nD = m; }
      }
      if (o.blobby) { const cc = [c[0], c[1], c[2] + h / 2], bl = q => { const d = V.sub(q, cc); const l = V.len(d) || 1; return V.mul(d, 1 / l); }; nA = bl(A); nB = bl(B); nC = bl(C); nD = bl(D); }
      const u = i / segs, u1 = (i + 1) / segs, v0 = k / prof.length, v1 = (k + 1) / prof.length;
      out.push({ p: [A, B, C], n: [nA, nB, nC], uv: [[u, v0], [u1, v0], [u1, v1]] }, { p: [A, C, D], n: [nA, nC, nD], uv: [[u, v0], [u1, v1], [u, v1]] });
    }
  }
  return out;
}
// Triangles of an object, as its mesh data would be exported (modifiers applied or not).
function objectTris(o, { withModifiers = true, smoothingLost = false } = {}) {
  const tris = [];
  const mirror = withModifiers && o.mods.some(m => m.type === 'MIRROR'), bevel = o.bevel || (withModifiers && o.mods.some(m => m.type === 'BEVEL'));
  const autoSmooth = o.autoSmooth || (withModifiers && o.mods.some(m => m.type === 'SMOOTH_BY_ANGLE')) || !o.shape?.startsWith('barrel');
  const flipFaces = o.flipped ? [0, 4].slice(0, o.flipped) : [];
  for (const p of meshParts(o, withModifiers)) {
    if (p.box) tris.push(...boxTris(p, flipFaces).map(t2 => ({ ...t2, tag: p.tag })));
    else tris.push(...cylTris(p, { half: o.half && !mirror, bevel, autoSmooth: autoSmooth && !smoothingLost, blobby: smoothingLost && o.shape === 'barrel' }).map(t2 => ({ ...t2, tag: p.tag })));
  }
  return tris;
}

// ─── Textures of the crate material (drawn once) ─────────────────────────────
function canvasTex(draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; tex.anisotropy = 4; return tex;
}
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const TEX = {
  albedo: canvasTex(g => { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const plank = Math.floor(y / 64), grain = Math.sin(x * 0.09 + plank * 7 + Math.sin(y * 0.2) * 1.5) * 0.5 + 0.5, gap = y % 64 < 3 ? 0.35 : 1; g.fillStyle = `rgb(${(150 + grain * 40) * gap | 0},${(100 + grain * 28) * gap | 0},${(58 + grain * 16) * gap | 0})`; g.fillRect(x, y, 1, 1); } g.strokeStyle = '#3a2412'; g.lineWidth = 14; g.strokeRect(0, 0, 256, 256); }),
  normal: canvasTex(g => { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const e = y % 64 < 3 ? 1 : 0, edge = x < 10 || x > 246 || y < 10 || y > 246; const ny = e ? 0.6 : 0, nx = edge ? (x < 10 ? -0.5 : x > 246 ? 0.5 : 0) : 0; g.fillStyle = `rgb(${(nx * 0.5 + 0.5) * 255 | 0},${(ny * 0.5 + 0.5) * 255 | 0},${230})`; g.fillRect(x, y, 1, 1); } }, false),
  rough: canvasTex(g => { for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) { const v = 140 + hash(x >> 3, y >> 3) * 90; g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; g.fillRect(x, y, 2, 2); } }, false),
};

// ─── Building three.js meshes ────────────────────────────────────────────────
// map: modelling point → three.js point. lin: the 3×3 linear part (modelling → three), for normals and winding.
const MAT = {
  blender: new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.75, side: THREE.DoubleSide, flatShading: false }),
  faceFront: new THREE.MeshStandardMaterial({ color: 0x3d63d6, roughness: 0.8, side: THREE.DoubleSide }),
  faceBack: new THREE.MeshStandardMaterial({ color: 0xd63b3b, roughness: 0.8, side: THREE.DoubleSide }),
  collision: new THREE.MeshStandardMaterial({ color: 0x6fd46f, roughness: 0.8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  camera: new THREE.MeshBasicMaterial({ color: 0x222222, wireframe: true }),
  unity: new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.6 }),
};
const crateMat = { blender: null, unity: new Map() };
function crateBlenderMat() { if (!crateMat.blender) crateMat.blender = new THREE.MeshStandardMaterial({ map: TEX.albedo, normalMap: TEX.normal, roughnessMap: TEX.rough, roughness: 1, side: THREE.DoubleSide }); return crateMat.blender; }
function crateUnityMat(rep) {
  const ch = rep.channels, key = ['baseColor', 'normal', 'roughness'].map(k => ch[k].state).join('|');
  if (!crateMat.unity.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    if (ch.baseColor.state === 'ok') m.map = TEX.albedo;
    if (ch.normal.state === 'ok') m.normalMap = TEX.normal;
    if (ch.normal.state === 'notNormalMap') { m.normalMap = TEX.albedo; m.normalScale = new THREE.Vector2(2, 2); }
    if (ch.roughness.state === 'ok') { m.roughnessMap = TEX.rough; m.roughness = 1; }
    crateMat.unity.set(key, m);
  }
  return crateMat.unity.get(key);
}
function buildGeometry(tris, map, lin) {
  const flip = M3.det(lin) < 0, nm = M3.inv(lin), nmT = [nm[0], nm[3], nm[6], nm[1], nm[4], nm[7], nm[2], nm[5], nm[8]];
  const pos = [], nor = [], uv = [], groups = [[], []];
  tris.forEach(tri => { groups[tri.flipped ? 1 : 0].push(tri); });
  const geo = new THREE.BufferGeometry(); let start = 0;
  groups.forEach((list, g) => {
    for (const tri of list) {
      const order = flip ? [0, 2, 1] : [0, 1, 2];
      for (const k of order) {
        const p = map(tri.p[k], tri); pos.push(p[0], p[1], p[2]);
        const n = M3.apply(nmT, tri.n[k]), l = V.len(n) || 1; nor.push(n[0] / l, n[1] / l, n[2] / l);
        uv.push(tri.uv[k][0], tri.uv[k][1]);
      }
    }
    geo.addGroup(start, list.length * 3, g); start += list.length * 3;
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}
const B2T = [1, 0, 0, 0, 0, 1, 0, -1, 0];           // Blender (x, y, z) → three.js (x, z, −y)
const U2T = [1, 0, 0, 0, 1, 0, 0, 0, -1];           // Unity (x, y, z) → three.js (x, y, −z)
const b2t = v => [v[0], v[2], -v[1]], u2t = v => [v[0], v[1], -v[2]];

// Character animation: arms and legs swing around their joints (modelling coordinates).
const JOINTS = { arm: { L: [-0.18, 0, 1.39], R: [0.18, 0, 1.39] }, leg: { L: [-0.1, 0, 0.9], R: [0.1, 0, 0.9] } };
function posePoint(q, tag, clip, time) {
  if (!clip || (tag !== 'arm' && tag !== 'leg')) return q;
  const side = q[0] < 0 ? 'L' : 'R', j = JOINTS[tag][side], amp = { Idle: 4, Walk: 28, Run: 50 }[clip] || 0, speed = { Idle: 1.2, Walk: 5, Run: 9 }[clip] || 1;
  let a = Math.sin(time * speed) * amp * (side === 'L' ? 1 : -1) * (tag === 'arm' ? -1 : 1);
  if (tag === 'arm') { const down = 75; const rel = V.sub(q, j); const r1 = M3.apply(M3.ry(side === 'L' ? -down : down), rel); return V.add(j, M3.apply(M3.rx(a), r1)); }
  return V.add(j, M3.apply(M3.rx(a), V.sub(q, j)));
}

// ─── Blender viewport ────────────────────────────────────────────────────────
function makeView(canvasSel, hostSel, bg) {
  const canvas = $(canvasSel), host = $(hostSel);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 400);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = false;
  const v = { canvas, host, renderer, scene, camera, controls, dirty: true, root: new THREE.Group() };
  controls.addEventListener('change', () => { v.dirty = true; });
  scene.add(v.root);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 4); scene.add(sun);
  new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); v.dirty = true; }).observe(host);
  return v;
}
const BV = makeView('#b-view', '#b-host', 0x3d3d3d), UV = makeView('#u-view', '#u-host', 0x4a5260);
UV.span = 4;
// Blender floor grid with the red X and green Y axes
(function () {
  const g = new THREE.GridHelper(40, 40, 0x555555, 0x4a4a4a); BV.scene.add(g);
  const line = (a, b, c) => { const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]); BV.scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c }))); };
  line([-20, 0.001, 0], [20, 0.001, 0], 0xb9474f); line([0, 0.001, -20], [0, 0.001, 20], 0x6f9e2c);
  const ug = new THREE.GridHelper(40, 40, 0x6a7280, 0x5b6370); UV.scene.add(ug);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x59606b, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; UV.scene.add(floor);
  // Unity's Player: a 1.8 m capsule for scale
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 8, 16), new THREE.MeshStandardMaterial({ color: 0x5aa0e0, roughness: 0.5 })); cap.position.set(1.6, 0.9, 0); cap.userData.name = 'Player'; UV.scene.add(cap); UV.player = cap;
})();

function clearGroup(g) { for (const c of [...g.children]) { g.remove(c); c.traverse(x => { x.geometry?.dispose?.(); }); } }
function buildBlender() {
  const st = S.st, g = BV.root; clearGroup(g);
  for (const o of st.objects) {
    if (o.hidden) continue;
    if (o.type === 'ARMATURE') { g.add(armatureLines(o)); continue; }
    const lin = M3.mul(B2T, M3.mul(RS(o), o.B));
    const tris = objectTris(o, { withModifiers: true });
    const geo = buildGeometry(tris, q => b2t(worldPoint(o, localPoint(o, q))), lin);
    let mats;
    if (st.overlays.faceOrientation) mats = [MAT.faceFront, MAT.faceBack];
    else if (o.collision) mats = [MAT.collision, MAT.collision];
    else if (o.type === 'CAMERA' || o.type === 'LIGHT' || o.type === 'EMPTY') mats = [MAT.camera, MAT.camera];
    else if (o.material) mats = [crateBlenderMat(), crateBlenderMat()];
    else mats = [MAT.blender, MAT.blender];
    const m = new THREE.Mesh(geo, mats); m.userData.name = o.name; g.add(m);
    if (o.selected || o.name === st.sel) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: o.name === st.sel ? 0xffaa40 : 0xe07c20 }));
      g.add(edges);
    }
    // the origin: a small orange dot
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035 * viewScale(), 12, 8), new THREE.MeshBasicMaterial({ color: 0xff9a2e, depthTest: false })); dot.renderOrder = 5; dot.position.set(...b2t(o.loc)); g.add(dot);
  }
  // vertices of the active object for snapping (Origin stage)
  const a = active();
  if (a && stage().id === 'origin') {
    const pts = new Map();
    for (const p of meshParts(a)) for (const q of partPoints(p)) { const w = worldPoint(a, localPoint(a, q)); pts.set(w.map(x => x.toFixed(4)).join(','), w); }
    for (const w of pts.values()) {
      const sel = st.point && V.len(V.sub(st.point, w)) < 1e-4;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.03 * viewScale(), 10, 6), new THREE.MeshBasicMaterial({ color: sel ? 0xffffff : 0x111111, depthTest: false }));
      d.position.set(...b2t(w)); d.renderOrder = 6; d.userData.point = w; g.add(d);
    }
  }
  // the 3D cursor
  const cur = new THREE.Group(), cs = 0.12 * viewScale();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(cs, cs * 0.18, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false })); ring.rotation.x = Math.PI / 2; cur.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(cs, cs * 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.001; cur.add(ring2);
  cur.children.forEach(c => { c.renderOrder = 7; }); cur.position.set(...b2t(st.cursor)); g.add(cur);
  BV.dirty = true;
  $('#b-overlay').innerHTML = `<div>User Perspective</div><div>(1) Collection | ${esc(st.sel || '')}</div>${st.overlays.faceOrientation ? '<div class="fo">Face Orientation</div>' : ''}`;
}
const viewScale = () => Math.max(1, (S.st?.objects.find(o => o.shape === 'lamp' && !o.hidden) ? dimensions(S.st.objects.find(o => o.shape === 'lamp'))[2] / 3 : 1));
// Armature: bones as lines between joints (modelling coordinates of the character)
const BONE_POS = {
  Hips: [[0, 0, 0.9], [0, 0, 1.05]], Spine: [[0, 0, 1.05], [0, 0, 1.2]], Chest: [[0, 0, 1.2], [0, 0, 1.42]], Neck: [[0, 0, 1.42], [0, 0, 1.52]], Head: [[0, 0, 1.52], [0, 0, 1.76]],
  'Shoulder.L': [[-0.03, 0, 1.4], [-0.18, 0, 1.4]], 'UpperArm.L': [[-0.18, 0, 1.4], [-0.37, 0, 1.4]], 'LowerArm.L': [[-0.37, 0, 1.4], [-0.52, 0, 1.4]], 'Hand.L': [[-0.52, 0, 1.4], [-0.6, 0, 1.4]],
  'Shoulder.R': [[0.03, 0, 1.4], [0.18, 0, 1.4]], 'UpperArm.R': [[0.18, 0, 1.4], [0.37, 0, 1.4]], 'LowerArm.R': [[0.37, 0, 1.4], [0.52, 0, 1.4]], 'Hand.R': [[0.52, 0, 1.4], [0.6, 0, 1.4]],
  'UpperLeg.L': [[-0.1, 0, 0.9], [-0.1, 0, 0.48]], 'LowerLeg.L': [[-0.1, 0, 0.48], [-0.1, 0, 0.08]], 'Foot.L': [[-0.1, 0, 0.08], [-0.1, -0.15, 0.02]],
  'UpperLeg.R': [[0.1, 0, 0.9], [0.1, 0, 0.48]], 'LowerLeg.R': [[0.1, 0, 0.48], [0.1, 0, 0.08]], 'Foot.R': [[0.1, 0, 0.08], [0.1, -0.15, 0.02]],
  'IK_Foot.L': [[-0.1, 0.05, 0.02], [-0.1, 0.25, 0.02]], 'IK_Foot.R': [[0.1, 0.05, 0.02], [0.1, 0.25, 0.02]], 'Pole_Knee.L': [[-0.1, -0.5, 0.5], [-0.1, -0.6, 0.5]], 'Pole_Knee.R': [[0.1, -0.5, 0.5], [0.1, -0.6, 0.5]], Root: [[0, 0, 0], [0, 0.4, 0]],
};
function armatureLines(o) {
  const g = new THREE.Group(), pts = [], ctl = [];
  for (const b of o.bones) { const pp = BONE_POS[b.name]; if (!pp) continue; (b.deform ? pts : ctl).push(...pp.map(q => new THREE.Vector3(...b2t(worldPoint(o, q))))); }
  const mk = (list, color) => { const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(list), new THREE.LineBasicMaterial({ color, depthTest: false })); l.renderOrder = 4; return l; };
  g.add(mk(pts, 0x8fd0ff), mk(ctl, 0xffd24a)); return g;
}

// ─── Unity scene view ────────────────────────────────────────────────────────
let unityMeshes = [], balls = [];
function playTime() { return S.play ? (performance.now() - S.play.t0) / 1000 : 0; }
function buildUnity() {
  const st = S.st, g = UV.root; clearGroup(g); unityMeshes = [];
  const rep = report(st); if (!rep) { UV.dirty = true; return; }
  const h = hierarchy(st), comps = componentsOf(st), mrep = materialReport(st.file, st.imp);
  const tPlay = playTime(), play = S.play;
  // the Play animations: a door that opens, a crate that falls, clips on the character
  const clipName = st.unity.previewClip || clipsOf(st.file)[0];
  const clipLoop = !!st.imp.clips[clipName]?.loop;
  const clipOn = play && clipName && rigReport(st.file, st.imp).avatar !== 'none' && (clipLoop || tPlay < 1.2) ? clipName.split('|')[1] : null;
  for (const n of rep.nodes) {
    const o = n.obj; if (n.type !== 'MESH') continue;
    if (st.unity.renderers[n.name] === false) continue;
    const tr = n.root || h.single ? st.unity.override : null;
    let extra = M3.I(), offset = [0, 0, 0];
    if (play && sid() === 'o1') extra = M3.ry(-Math.min(90, tPlay * 60));
    if (play && sid() === 'c1') offset = [0, fallY(st, tPlay), 0];
    const place = q => {
      const local = localPoint(o, q);
      let w = tr ? unityPoint(n, local, tr) : unityPoint(n, local);
      if (extra !== null) { const pos = tr?.position || n.position; w = V.add(pos, M3.apply(extra, V.sub(w, pos))); }
      return u2t(V.add(w, offset));
    };
    const Q = tr ? unityRotation(tr.rotation) : n.Q, sc = tr?.scale || n.scale;
    const lin = M3.mul(U2T, M3.mul(extra, M3.mul(Q, M3.mul(M3.diag(...sc), M3.mul(n.D, o.B)))));
    let tris = objectTris(o, { withModifiers: st.file.settings.applyModifiers, smoothingLost: o.shape === 'barrel' && !(st.file.settings.applyModifiers || o.autoSmooth) });
    if (clipOn && o.shape === 'body') tris = tris.map(t2 => ({ ...t2, p: t2.p.map(q => posePoint(q, t2.tag, clipOn, tPlay)) }));
    const geo = buildGeometry(tris, place, lin);
    let mat = o.material && mrep ? crateUnityMat(mrep) : MAT.unity;
    mat.side = THREE.FrontSide;
    const m = new THREE.Mesh(geo, [mat, mat]); m.userData.name = n.name; g.add(m); unityMeshes.push(m);
    if (st.unity.sel === n.name || (st.unity.sel === h.rootName && h.single)) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0xff9f1a })));
  }
  // colliders: green wireframe boxes
  const ph = physicsState(st);
  for (const { b } of ph.boxes) {
    const size = V.sub(b[1], b[0]), c = V.mul(V.add(b[0], b[1]), 0.5);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size.map(x => Math.max(x, 0.001)))), new THREE.LineBasicMaterial({ color: 0x7dff7a }));
    box.position.set(...u2t(V.add(c, play && sid() === 'c1' ? [0, fallY(st, tPlay), 0] : [0, 0, 0]))); g.add(box);
  }
  // balls for the table test
  if (sid() === 'c2') {
    const boxes = ph.boxes.map(x => x.b);
    for (const [k, [x, z, from]] of Object.entries(TABLE_DROPS)) {
      const target = dropHeight(boxes, x, z, from) + 0.1, y0 = from + (k === 'top' ? 0 : 0) + 0.1;
      const y = play ? Math.max(target, y0 - 4.9 * tPlay * tPlay) : y0;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshStandardMaterial({ color: k === 'top' ? 0xffc34d : 0xff6b6b, roughness: 0.4 }));
      ball.position.set(...u2t([x, y, z])); g.add(ball);
    }
  }
  // the move handle of the selected GameObject, in Local mode
  const selNode = rep.nodes.find(n => n.name === st.unity.sel) || (h.single && st.unity.sel === h.rootName ? rep.nodes[0] : null);
  if (selNode) {
    const tr = selNode.root || h.single ? st.unity.override : null, Q = tr ? unityRotation(tr.rotation) : selNode.Q, pos = tr?.position || selNode.position;
    const L = 0.6 * Math.max(1, UV.span / 4);
    [[1, 0, 0, 0xe3463f], [0, 1, 0, 0x8fd14f], [0, 0, 1, 0x3d7ff0]].forEach(([a, b, c, col]) => {
      const dir = new THREE.Vector3(...u2t(M3.apply(Q, [a, b, c]))).normalize();
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(...u2t(pos)), L, col, L * 0.22, L * 0.12);
      arrow.traverse(x => { if (x.material) { x.material.depthTest = false; x.renderOrder = 9; } }); g.add(arrow);
    });
  }
  UV.dirty = true;
}
function fallY(st, tt) {
  const ph = physicsState(st), has = ph.boxes.some(x => x.from === 'Crate'), y0 = 1.5, y = y0 - 4.9 * tt * tt;
  return has ? Math.max(0, y) : Math.max(-6, y);
}
function fitViews(first = false) {
  const st = S.st;
  // Blender: frame the visible objects
  const pts = [];
  for (const o of st.objects) if (!o.hidden && o.type !== 'ARMATURE') { const b = worldBounds(o); pts.push(b.mn, b.mx); } else if (o.type === 'ARMATURE') pts.push([-0.6, -0.3, 0], [0.6, 0.3, 1.8]);
  const bb = pts.length ? bounds(pts) : bounds([[-1, -1, 0], [1, 1, 1]]), c = b2t(bb.center), r = Math.max(1.2, V.len(bb.size) * 0.75);
  BV.controls.target.set(...c); BV.camera.position.set(c[0] + r * 1.3, c[1] + r * 0.9, c[2] + r * 1.5); BV.controls.update();
  // Unity: frame the model and the Player
  const rep = report(st), up = [[1.3, 0, -0.3], [1.9, 1.8, 0.3]];
  if (rep) for (const n of rep.nodes) if (n.type === 'MESH') { const b = rep.world(n); up.push(b.mn, b.mx); }
  const ub = bounds(up), uc = u2t(ub.center), ur = Math.max(1.5, V.len(ub.size) * 0.75); UV.span = V.len(ub.size);
  UV.controls.target.set(...uc); UV.camera.position.set(uc[0] - ur * 1.2, uc[1] + ur * 0.8, uc[2] + ur * 1.6); UV.controls.update();
  BV.dirty = UV.dirty = true;
  void first;
}

// ─── Blender panels ──────────────────────────────────────────────────────────
const num = (key, v, step = 0.01, extra = '') => `<input type="number" step="${step}" value="${fx(v, 4)}" data-k="${key}" ${extra}>`;
function renderOutliner() {
  const st = S.st, icon = o => ({ MESH: '▽', CAMERA: '📷', LIGHT: '💡', EMPTY: '⊹', ARMATURE: '🦴' }[o.type] || '▽');
  $('#b-outliner').innerHTML = `<div class="xp-title" data-no-i18n>Outliner</div><div class="xp-tree" data-no-i18n><div class="ol-coll">▾ Collection</div>` +
    st.objects.map(o => `<div class="ol-row${o.name === st.sel ? ' active' : o.selected ? ' sel' : ''}${o.hidden ? ' off' : ''}" data-bsel="${esc(o.name)}" style="padding-left:${o.parent ? 30 : 16}px"><i class="ol-ic">${o.type === 'MESH' ? '<svg viewBox="0 0 12 12"><path d="M6 1 11 4v4L6 11 1 8V4z" fill="none" stroke="currentColor"/></svg>' : icon(o)}</i><span>${esc(o.name)}</span><button type="button" class="eye" data-bhide="${esc(o.name)}" aria-label="Hide in viewport">${o.hidden ? '◌' : '👁'}</button></div>`).join('') + '</div>';
}
const TABS = [['object', 'Object'], ['modifiers', 'Modifiers'], ['material', 'Material'], ['actions', 'Actions'], ['export', 'Export FBX']];
function renderBProps() {
  const st = S.st, o = active();
  const tabs = TABS.filter(([k]) => k === 'object' || k === 'export' || (k === 'modifiers' && o?.mods?.length !== undefined && (o?.mods.length || o?.half)) || (k === 'material' && o?.material) || (k === 'actions' && st.actions.length));
  if (!tabs.find(x => x[0] === st.tab)) st.tab = 'object';
  let h = `<div class="xp-tabs" data-no-i18n>${tabs.map(([k, l]) => `<button type="button" data-btab="${k}" aria-pressed="${st.tab === k}">${l}</button>`).join('')}</div><div class="xp-pbody">`;
  if (st.tab === 'object') h += objectPanel(o);
  if (st.tab === 'modifiers') h += modifiersPanel(o);
  if (st.tab === 'material') h += materialPanel(o);
  if (st.tab === 'actions') h += actionsPanel();
  if (st.tab === 'export') h += exportPanel();
  $('#b-props').innerHTML = h + '</div>';
}
function objectPanel(o) {
  if (!o) return `<p class="sb-empty">${esc(t('Select an object in the Outliner or the viewport.'))}</p>`;
  const d = dimensions(o), row = (lab, key, v, unit = '', step = 0.01) => `<label class="bl-row xyz"><span>${lab}</span>${num(key, v, step)}<em>${unit}</em></label>`;
  const xyz = (lab, key, arr, unit, step) => `<div class="bl-sec">${lab}</div>` + ['X', 'Y', 'Z'].map((a, k) => row(a, `${key}.${k}`, arr[k], unit, step)).join('');
  return `<div class="panel bl" data-no-i18n><h4>${esc(o.name)}<small>Transform · N panel</small></h4>
    ${xyz('Location', 'loc', o.loc, 'm')}${xyz('Rotation', 'rot', o.rot, '°', 1)}${xyz('Scale', 'scale', o.scale, '', 0.01)}${xyz('Dimensions', 'dim', d, 'm')}</div>
    <div class="panel bl" data-no-i18n><h4>3D Cursor<small>View tab</small></h4>${['X', 'Y', 'Z'].map((a, k) => row(a, `cursor.${k}`, S.st.cursor[k], 'm')).join('')}</div>`;
}
function modifiersPanel(o) {
  if (!o) return '';
  const names = { MIRROR: 'Mirror', BEVEL: 'Bevel', SMOOTH_BY_ANGLE: 'Smooth by Angle' };
  return `<div class="panel bl" data-no-i18n><h4>Modifiers<small>${esc(o.name)}</small></h4>${o.mods.length ? o.mods.map(m => `<div class="mod-row"><span>🔧 ${names[m.type]}</span><button type="button" class="mini" data-apply-mod="${m.type}">Apply</button></div>`).join('') : '<p class="sb-empty">No modifiers.</p>'}
    <p class="bl-note">${esc(t(o.half ? 'Mesh: half a barrel (the Mirror modifier completes it)' : 'Mesh: complete'))}</p></div>`;
}
function materialPanel(o) {
  const m = o?.material; if (!m) return '';
  const src = ch => { const c = m.channels[ch]; return c.kind === 'image' ? `Image Texture · ${c.file}${c.via ? ` → ${c.via}` : ''}` : c.kind === 'procedural' ? c.node : `${c.value}`; };
  return `<div class="panel bl" data-no-i18n><h4>${esc(m.name)}<small>Principled BSDF</small></h4>
    ${[['baseColor', 'Base Color'], ['roughness', 'Roughness'], ['metallic', 'Metallic'], ['normal', 'Normal']].map(([k, l]) => `<div class="mat-row"><span>${l}</span><b class="${m.channels[k].kind}">${esc(src(k))}</b></div>`).join('')}
    ${m.channels.roughness.kind === 'procedural' ? '<button type="button" class="exp-button wide" data-bake="roughness">Bake Roughness to Image…</button>' : `<p class="bl-note">${esc(t('Roughness baked to crate_roughness.png'))}</p>`}</div>`;
}
function actionsPanel() {
  const st = S.st;
  return `<div class="panel bl" data-no-i18n><h4>Actions<small>Action Editor · Blender File</small></h4>${st.actions.map(a => `<div class="mod-row${st.activeAction === a.name ? ' on' : ''}"><span>🎞 ${esc(a.name)}${a.empty ? ' <em>(0 keys)</em>' : ''}</span><button type="button" class="mini${a.fake ? ' on' : ''}" data-fake="${esc(a.name)}" title="Fake User">🛡</button><button type="button" class="mini" data-del-action="${esc(a.name)}" title="Delete (clear Fake User and purge)">✕</button></div>`).join('')}
    <p class="bl-note">Active action: ${esc(st.activeAction || '—')}</p></div>`;
}
function sec(id, title, body) { const open = S.openSec[id] ?? ['include', 'transform', 'geometry', 'armature', 'anim'].includes(id); return `<div class="xsec${open ? ' open' : ''}"><button type="button" class="xsec-h" data-sec="${id}">${open ? '▾' : '▸'} ${title}</button>${open ? `<div class="xsec-b">${body}</div>` : ''}</div>`; }
function exportPanel() {
  const e = S.st.exp, chk = (k, l, warn = '') => `<label class="bl-check"><input type="checkbox" data-exp="${k}"${e[k] ? ' checked' : ''}>${l}${warn ? ` <em class="warn">${warn}</em>` : ''}</label>`;
  const sel = (k, opts) => `<select data-exp="${k}">${opts.map(v => `<option${String(e[k]) === String(v) ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  const typeBtn = (k, l) => `<button type="button" data-etype="${k}" aria-pressed="${!!e.types[k]}">${l}</button>`;
  const old = outdated(S.st);
  return `<div class="panel bl xp-export" data-no-i18n><h4>Export FBX<small>File › Export › FBX (.fbx)</small></h4>
    <label class="bl-row"><span>File</span><input type="text" value="${esc(S.st.fileName)}.fbx" disabled><em></em></label>
    ${sec('include', 'Include', `<div class="bl-sub">Limit to</div>${chk('selectedOnly', 'Selected Objects')}${chk('visibleOnly', 'Visible Objects')}${chk('activeCollection', 'Active Collection')}<div class="bl-sub">Object Types</div><div class="type-grid">${typeBtn('EMPTY', 'Empty')}${typeBtn('CAMERA', 'Camera')}${typeBtn('LIGHT', 'Lamp')}${typeBtn('ARMATURE', 'Armature')}${typeBtn('MESH', 'Mesh')}${typeBtn('OTHER', 'Other')}</div>`)}
    ${sec('transform', 'Transform', `<label class="bl-row"><span>Scale</span><input type="number" step="0.01" data-exp="scale" value="${e.scale}"><em></em></label><label class="bl-row"><span>Apply Scalings</span>${sel('applyScalings', APPLY_SCALINGS)}<em></em></label><label class="bl-row"><span>Forward</span>${sel('forward', AXIS_OPTIONS)}<em></em></label><label class="bl-row"><span>Up</span>${sel('up', AXIS_OPTIONS)}<em></em></label>${chk('applyUnit', 'Apply Unit')}${chk('spaceTransform', 'Use Space Transform')}${chk('applyTransform', 'Apply Transform', '⚠ experimental')}`)}
    ${sec('geometry', 'Geometry', `<label class="bl-row"><span>Smoothing</span>${sel('smoothing', ['Normals Only', 'Face', 'Edge'])}<em></em></label>${chk('applyModifiers', 'Apply Modifiers')}${chk('looseEdges', 'Loose Edges')}${chk('tangentSpace', 'Tangent Space')}`)}
    ${sec('armature', 'Armature', `<label class="bl-row"><span>Primary Bone Axis</span>${sel('primaryBone', AXIS_OPTIONS)}<em></em></label><label class="bl-row"><span>Secondary Bone Axis</span>${sel('secondaryBone', AXIS_OPTIONS)}<em></em></label>${chk('onlyDeform', 'Only Deform Bones')}${chk('leafBones', 'Add Leaf Bones')}`)}
    ${sec('anim', 'Bake Animation', `${chk('bakeAnim', 'Bake Animation')}${chk('keyAllBones', 'Key All Bones')}${chk('nlaStrips', 'NLA Strips')}${chk('allActions', 'All Actions')}${chk('forceKeying', 'Force Start/End Keying')}`)}
    <label class="bl-row"><span>Path Mode</span>${sel('pathMode', PATH_MODES)}<button type="button" class="embed${e.embedTextures ? ' on' : ''}" data-embed title="Embed Textures">📦</button></label>
    <button type="button" class="exp-button wide${old ? ' pulse' : ''}" id="do-export">Export FBX</button>
    <p class="bl-note">${esc(t(old ? '⚠ The Blender file changed since the last export.' : '✓ Unity has the latest export.'))}</p></div>`;
}

// ─── Unity panels ────────────────────────────────────────────────────────────
function renderHier() {
  const st = S.st, h = hierarchy(st), rep = report(st), u = st.unity;
  let rows = [['Main Camera', 0, 'cam'], ['Directional Light', 0, 'light'], ['Player', 0, 'go'], ['Ground', 0, 'go']];
  if (h) {
    rows.push([h.rootName, 0, 'prefab']);
    if (!h.single) for (const n of rep.nodes) { rows.push([n.name, 1, 'go']); if (n.type === 'ARMATURE') { const bones = exportedBones(st.file); rows.push([`⋯ ${bones.length} bones: ${bones.slice(0, 4).join(', ')}${bones.length > 4 ? '…' : ''}`, 2, 'bones']); } }
  }
  const mrep = st.file ? materialReport(st.file, st.imp) : null;
  const assets = [`${st.fileName}.fbx`];
  if (mrep?.editable) assets.push(`${mrep.name}.mat`);
  $('#u-hier').innerHTML = `<div class="xp-title" data-no-i18n>Hierarchy</div><div class="xp-tree u" data-no-i18n><div class="ol-coll">▾ SampleScene</div>${rows.map(([n, d, k]) => `<div class="ol-row${u.sel === n ? ' active' : ''}${k === 'prefab' ? ' prefab' : ''}${k === 'bones' ? ' dim' : ''}" ${k !== 'bones' ? `data-usel="${esc(n)}"` : ''} style="padding-left:${10 + d * 14}px"><i class="u-ic ${k}"></i><span>${esc(n)}</span></div>`).join('')}</div>
    <div class="xp-title" data-no-i18n>Project · Assets/Models</div><div class="xp-tree u" data-no-i18n>${assets.map(a => `<div class="ol-row${u.sel === 'asset:' + a ? ' active' : ''}" data-usel="asset:${esc(a)}"><i class="u-ic ${a.endsWith('.fbx') ? 'fbx' : 'mat'}"></i><span>${esc(a)}</span>${a.endsWith('.fbx') && outdated(st) ? '<em class="old">●</em>' : ''}</div>`).join('')}</div>`;
}
function renderInsp() {
  const st = S.st, u = st.unity, sel = u.sel;
  let h = '';
  if (!st.file) h = `<p class="sb-empty">${esc(t('Nothing imported yet: export the FBX from Blender.'))}</p>`;
  else if (sel?.startsWith('asset:') && sel.endsWith('.fbx')) h = importPanel();
  else if (sel?.startsWith('asset:') && sel.endsWith('.mat')) h = unityMaterialPanel(true);
  else if (sel) h = goPanel(sel);
  else h = `<p class="sb-empty">${esc(t('Select a GameObject in the Hierarchy, or the .fbx in the Project to see its import settings.'))}</p>`;
  $('#u-insp').innerHTML = `<div class="xp-title" data-no-i18n>Inspector</div><div class="xp-ibody">${h}</div>`;
}
function goPanel(name) {
  const st = S.st, rep = report(st), h = hierarchy(st), comps = componentsOf(st);
  if (['Main Camera', 'Directional Light', 'Player', 'Ground'].includes(name)) return `<div class="u-card" data-no-i18n><div class="u-head"><b>${esc(name)}</b></div><p class="sb-empty">${esc(t(name === 'Player' ? 'A 1.8 m capsule, for scale.' : 'Part of the scene.'))}</p></div>`;
  const n = rep.nodes.find(x => x.name === name), isRoot = name === h.rootName;
  const tr = (isRoot && st.unity.override) || null;
  const pos = tr?.position || (n ? n.position : [0, 0, 0]), rot = tr?.rotation || (n ? n.rotation : [0, 0, 0]), sc = tr?.scale || (n ? n.scale : [1, 1, 1]);
  const fld = (k, arr) => ['X', 'Y', 'Z'].map((a, i) => `<label><span>${a}</span><input type="number" step="${k === 'rotation' ? 1 : 0.01}" value="${fx(arr[i], 2)}" data-utr="${k}.${i}"${isRoot ? '' : ' disabled'}></label>`).join('');
  let hh = `<div class="u-card" data-no-i18n><div class="u-head"><b>${esc(name)}</b>${isRoot ? '<small>Prefab instance</small>' : ''}</div>
    <div class="u-comp"><div class="u-ch">Transform</div><div class="u-tr"><span>Position</span>${fld('position', pos)}</div><div class="u-tr"><span>Rotation</span>${fld('rotation', rot)}</div><div class="u-tr"><span>Scale</span>${fld('scale', sc)}</div>${isRoot && tr ? '<button type="button" class="mini" data-revert-tr>Revert to prefab</button>' : ''}</div>`;
  if (n?.type === 'MESH') hh += `<div class="u-comp"><div class="u-ch">Mesh Filter</div><div class="u-kv"><span>Mesh</span><b>${esc(name)}</b></div></div><div class="u-comp"><div class="u-ch"><label><input type="checkbox" data-renderer="${esc(name)}"${st.unity.renderers[name] === false ? '' : ' checked'}> Mesh Renderer</label></div>${n.obj.material ? unityMaterialPanel(false) : '<div class="u-kv"><span>Material</span><b>Default-Material</b></div>'}</div>`;
  if (n?.type === 'ARMATURE') hh += `<div class="u-comp"><div class="u-ch">Bones</div><p class="sb-empty">${exportedBones(st.file).length} bones</p></div>`;
  if (n?.obj.skinned) { const rr = rigReport(st.file, st.imp); hh += `<div class="u-comp"><div class="u-ch">Skinned Mesh Renderer</div><div class="u-kv"><span>Root Bone</span><b>${rr.skinned ? 'Hips' : 'None'}</b></div></div><div class="u-comp"><div class="u-ch">Animator</div><div class="u-kv"><span>Avatar</span><b class="${rr.avatar === 'valid' ? 'ok' : rr.avatar === 'invalid' ? 'bad' : ''}">${{ valid: 'CharacterAvatar ✓', invalid: 'CharacterAvatar ✗ (invalid)', generic: 'Generic', none: 'None' }[rr.avatar]}</b></div></div>`; }
  for (const [i, c] of (comps[name] || []).entries()) {
    const own = !c.fromImport && !c.onRoot, idx = (st.unity.components[name] || []).indexOf((st.unity.components[name] || []).find((x, j) => x.type === c.type && j >= 0));
    hh += `<div class="u-comp"><div class="u-ch">${c.type.replace('Collider', ' Collider')}${c.fromImport ? ' <em>(Generate Colliders)</em>' : ''}${own ? `<button type="button" class="mini rm" data-rmcomp="${esc(name)}|${c.type}">⋮ Remove</button>` : ''}</div>${c.type === 'MeshCollider' ? `<label class="u-kv"><span>Convex</span><input type="checkbox" data-convex="${esc(name)}"${c.convex ? ' checked' : ''}${c.fromImport ? ' disabled' : ''}></label><div class="u-kv"><span>Mesh</span><b>${esc(name)}</b></div>` : ''}${c.type === 'Rigidbody' ? '<div class="u-kv"><span>Use Gravity</span><b>✓</b></div>' : ''}</div>`;
    void i; void idx;
  }
  hh += `<div class="add-comp"><button type="button" class="exp-button" data-addcomp="${esc(name)}">Add Component</button></div></div>`;
  return hh;
}
function unityMaterialPanel(standalone) {
  const st = S.st, m = materialReport(st.file, st.imp); if (!m) return '';
  const row = (k, l) => { const c = m.channels[k]; const lab = { ok: `✓ ${c.file || ''}`, missing: `✗ ${c.file} (not found)`, lost: '✗ (procedural: lost)', value: String(c.value), notNormalMap: `${c.file} ⚠` }[c.state]; return `<div class="u-kv"><span>${l}</span><b class="${c.state === 'ok' || c.state === 'value' ? 'ok' : 'bad'}">${esc(lab)}</b></div>`; };
  return `<div class="u-mat${standalone ? ' standalone' : ''}" data-no-i18n><div class="u-ch">${esc(m.name)} <small>${m.editable ? 'Universal Render Pipeline/Lit' : 'embedded · read-only'}</small></div>
    ${row('baseColor', 'Base Map')}${row('normal', 'Normal Map')}${row('roughness', 'Smoothness (from Roughness)')}${row('metallic', 'Metallic')}
    ${m.channels.normal.state === 'notNormalMap' ? '<div class="u-warn">This texture is not marked as a normal map <button type="button" class="mini" data-fixnormal>Fix Now</button></div>' : ''}</div>`;
}
function importPanel() {
  const st = S.st, p = st.pending || st.imp, tab = st.unity.importTab || 'model';
  const chk = (k, l, dis = false) => `<label class="u-kv"><span>${l}</span><input type="checkbox" data-imp="${k}"${p[k] ? ' checked' : ''}${dis ? ' disabled' : ''}></label>`;
  const sel = (k, l, opts) => `<label class="u-kv"><span>${l}</span><select data-imp="${k}">${opts.map(v => `<option${p[k] === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`;
  let body = '';
  if (tab === 'model') body = `<div class="u-sub">Scene</div><label class="u-kv"><span>Scale Factor</span><input type="number" step="0.01" data-imp="scaleFactor" value="${p.scaleFactor}"></label>${chk('convertUnits', 'Convert Units')}<div class="u-note">1cm (File) to 0.01m (Unity)</div>${chk('bakeAxis', 'Bake Axis Conversion')}${chk('importBlendShapes', 'Import BlendShapes')}${chk('importVisibility', 'Import Visibility')}${chk('importCameras', 'Import Cameras')}${chk('importLights', 'Import Lights')}${chk('preserveHierarchy', 'Preserve Hierarchy')}
      <div class="u-sub">Meshes</div>${sel('meshCompression', 'Mesh Compression', ['Off', 'Low', 'Medium', 'High'])}${chk('readWrite', 'Read/Write')}${sel('optimizeMesh', 'Optimize Mesh', ['Nothing', 'Everything', 'Polygon Order', 'Vertex Order'])}${chk('generateColliders', 'Generate Colliders')}
      <div class="u-sub">Geometry</div>${sel('normals', 'Normals', ['Import', 'Calculate', 'None'])}`;
  if (tab === 'rig') { const rr = rigReport(st.file, p); body = `${sel('animationType', 'Animation Type', ['None', 'Legacy', 'Generic', 'Humanoid'])}${p.animationType === 'Humanoid' || p.animationType === 'Generic' ? sel('avatar', 'Avatar Definition', ['Create From This Model', 'Copy From Other Avatar']) : ''}
      ${p.animationType === 'Humanoid' ? `<div class="u-kv"><span>Avatar</span><b class="${rr.avatar === 'valid' ? 'ok' : 'bad'}">${rr.avatar === 'valid' ? '✓ Configure…' : '✗ Invalid'}</b></div>` : ''}
      <div class="u-sub">Imported bones (${rr.bones.length})</div><div class="bone-list">${rr.bones.map(b => `<span class="${b.endsWith('_end') ? 'bad' : /^(IK_|Pole_|Root)/.test(b) ? 'warn' : ''}">${esc(b)}</span>`).join('') || '<em>none</em>'}</div>
      ${rr.issues.includes('applyTransform') ? '<div class="u-warn">Bone axes look wrong: the armature was exported with Apply Transform.</div>' : ''}`; }
  if (tab === 'anim') { const clips = clipsOf(st.file), cur = st.unity.clipSel && clips.includes(st.unity.clipSel) ? st.unity.clipSel : clips[0]; body = `${chk('importAnimation', 'Import Animation')}<div class="u-sub">Clips</div><div class="clip-list">${clips.map(c => `<button type="button" data-clip="${esc(c)}" aria-pressed="${c === cur}">${esc(c)}${p.clips[c]?.loop ? ' ↻' : ''}</button>`).join('') || '<em>No animation in the file.</em>'}</div>
      ${cur ? `<div class="u-sub">${esc(cur)}</div><label class="u-kv"><span>Loop Time</span><input type="checkbox" data-loop="${esc(cur)}"${p.clips[cur]?.loop ? ' checked' : ''}></label><button type="button" class="mini" data-preview="${esc(cur)}">▶ Preview on the character</button>` : ''}`; }
  if (tab === 'materials') { const m = materialReport(st.file, p); body = `${sel('materialCreation', 'Material Creation Mode', ['None', 'Standard (Legacy)', 'Import via MaterialDescription'])}${sel('location', 'Location', ['Use Embedded Materials', 'Use External Materials (Legacy)'])}
      <div class="u-row-btns"><button type="button" class="mini" data-extract="textures">Extract Textures…</button><button type="button" class="mini" data-extract="materials">Extract Materials…</button></div>
      ${m ? `<div class="u-sub">Remapped Materials</div><div class="u-kv"><span>${esc(m.name)}</span><b>${m.editable ? `Assets/Materials/${esc(m.name)}.mat` : 'embedded (read-only)'}</b></div>${m.embedded ? '<div class="u-note">Textures embedded in the FBX</div>' : '<div class="u-note">No textures in the FBX: Unity looks for them next to the model</div>'}` : '<p class="sb-empty">No materials.</p>'}`; }
  const dirty = !!st.pending && JSON.stringify(st.pending) !== JSON.stringify(st.imp);
  return `<div class="u-card" data-no-i18n><div class="u-head"><b>${esc(st.fileName)} (Model Import Settings)</b></div><div class="u-tabs">${[['model', 'Model'], ['rig', 'Rig'], ['anim', 'Animation'], ['materials', 'Materials']].map(([k, l]) => `<button type="button" data-itab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>${body}
    <div class="u-apply"><button type="button" class="mini" data-revert${dirty ? '' : ' disabled'}>Revert</button><button type="button" class="mini apply${dirty ? ' pulse' : ''}" data-applyimp${dirty ? '' : ' disabled'}>Apply</button></div></div>`;
}
function renderConsole() {
  const st = S.st, lines = [];
  const rep = report(st);
  if (rep && S.play) for (const e of physicsState(st).errors) lines.push(['err', `Non-convex MeshCollider with non-kinematic Rigidbody is no longer supported since Unity 5. If you want to use a non-convex mesh either make the Rigidbody kinematic or remove the Rigidbody component. Scene hierarchy path "${e.name}", Mesh asset path "Assets/Models/${st.fileName}.fbx" Mesh name "${e.name}"`]);
  if (st.file && st.imp.animationType === 'Humanoid' && rigReport(st.file, st.imp).avatar === 'invalid') lines.push(['warn', `Avatar creation for '${st.fileName}' failed: the skeleton does not match the Humanoid definition.`]);
  if (st.file && outdated(st)) lines.push(['info', tr('{f}.fbx is older than the Blender scene: export it again.', { f: st.fileName })]);
  $('#u-console').innerHTML = lines.length ? lines.map(([k, l]) => `<div class="c-${k}">${k === 'err' ? '⛔' : k === 'warn' ? '⚠' : 'ℹ'} ${esc(l)}</div>`).join('') : '<div class="c-info">Console</div>';
}

// ─── Menus ───────────────────────────────────────────────────────────────────
const MENUS = {
  file: [['export', 'Export › FBX (.fbx)']],
  object: [['h', 'Apply (Ctrl A)'], ['applyLocation', 'Location'], ['applyRotation', 'Rotation'], ['applyScale', 'Scale'], ['applyAll', 'All Transforms'], ['applyRotScale', 'Rotation & Scale'], ['-'], ['h', 'Set Origin'], ['originToGeometry', 'Origin to Geometry'], ['originToCursor', 'Origin to 3D Cursor'], ['-'], ['h', 'Snap (Shift S)'], ['cursorToSelected', 'Cursor to Selected'], ['cursorToOrigin', 'Cursor to World Origin'], ['-'], ['h', 'Clear'], ['clearLocation', 'Location (Alt G)']],
  mesh: [['h', 'Normals'], ['recalc', 'Recalculate Outside (Shift N)']],
  add: [['h', 'Collision Box'], ['col:top', 'Table top'], ['col:legs1', 'Legs (one object)'], ['col:legs4', 'Legs (four objects)']],
  overlays: [['faceOrientation', 'Face Orientation']],
};
function openMenu(kind, btn) {
  const m = $('#menu'), r = btn.getBoundingClientRect(), ws = $('#workspace').getBoundingClientRect();
  m.innerHTML = MENUS[kind].map(([k, l]) => k === '-' ? '<hr>' : k === 'h' ? `<div class="mh">${esc(l)}</div>` : `<button type="button" data-op="${k}"${kind === 'add' && sid() !== 'c2' ? ' disabled' : ''}>${k === 'faceOrientation' && S.st.overlays.faceOrientation ? '✓ ' : ''}${esc(l)}</button>`).join('');
  m.style.left = (r.left - ws.left) + 'px'; m.style.top = (r.bottom - ws.top + 2) + 'px'; m.hidden = false;
}
$('#b-menus').addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (!b) return; e.stopPropagation(); if (!$('#menu').hidden && $('#menu').dataset.kind === b.dataset.menu) { $('#menu').hidden = true; return; } $('#menu').dataset.kind = b.dataset.menu; openMenu(b.dataset.menu, b); });
document.addEventListener('click', e => { if (!e.target.closest('#menu')) $('#menu').hidden = true; });
$('#menu').addEventListener('click', e => { const b = e.target.closest('[data-op]'); if (!b) return; $('#menu').hidden = true; runOp(b.dataset.op); });
function runOp(op) {
  const st = S.st, o = active();
  if (op === 'export') { st.tab = 'export'; renderBProps(); return; }
  if (op === 'faceOrientation') { st.overlays.faceOrientation = !st.overlays.faceOrientation; changed(); return; }
  if (op.startsWith('col:')) { pushUndo(); addCollisionParts(st, op.slice(4)); st.sel = st.objects[st.objects.length - 1].name; changed(); msg('Collision box added. Its name ends in _COL.'); return; }
  if (op === 'cursorToOrigin') { pushUndo(); st.cursor = [0, 0, 0]; changed(); return; }
  if (!o) { msg('Select an object first.', true); return; }
  pushUndo();
  if (op === 'cursorToSelected') { st.cursor = st.point ? [...st.point] : [...o.loc]; msg(st.point ? 'The 3D cursor is on the selected vertex.' : 'No vertex selected: the cursor goes to the object\'s origin.'); }
  else if (op === 'originToCursor') OPS.originTo(o, st.cursor);
  else if (op === 'originToGeometry') OPS.originToGeometry(o);
  else if (op === 'recalc') { OPS.recalcNormals(o); msg('Normals recalculated: every face points outwards.'); }
  else if (OPS[op]) { if (o.type === 'ARMATURE' && op !== 'clearLocation') { S.undo.pop(); msg('Not needed here.', true); return; } OPS[op](o); }
  changed();
}

// ─── Events: Blender side ────────────────────────────────────────────────────
$('#b-outliner').addEventListener('click', e => {
  const hb = e.target.closest('[data-bhide]'); if (hb) { pushUndo(); const o = obj(hb.dataset.bhide); o.hidden = !o.hidden; changed(); return; }
  const r = e.target.closest('[data-bsel]'); if (!r) return; selectB(r.dataset.bsel, e.shiftKey || e.ctrlKey);
});
function selectB(name, add) {
  const st = S.st; pushUndo();
  if (!add) st.objects.forEach(o => { o.selected = false; });
  const o = obj(name); o.selected = add ? !o.selected || st.sel !== name : true; st.sel = name; st.point = null;
  changed();
}
$('#b-props').addEventListener('click', e => {
  const st = S.st, d = e.target.closest('button')?.dataset || {};
  if (d.btab) { st.tab = d.btab; renderBProps(); return; }
  if (d.sec) { S.openSec[d.sec] = !(S.openSec[d.sec] ?? ['include', 'transform', 'geometry', 'armature', 'anim'].includes(d.sec)); renderBProps(); return; }
  if (d.etype) { pushUndo(); st.exp.types[d.etype] = !st.exp.types[d.etype]; changed(); return; }
  if ('embed' in d) { pushUndo(); st.exp.embedTextures = !st.exp.embedTextures; changed(); return; }
  if (e.target.id === 'do-export') { pushUndo(); doExport(st); st.unity.override = null; msg(tr('{f}.fbx exported. Unity re-imports it.', { f: st.fileName })); changed(); fitViews(); return; }
  if (d.applyMod) { pushUndo(); OPS.applyModifier(active(), d.applyMod); changed(); return; }
  if (d.bake) { pushUndo(); active().material.channels.roughness = { kind: 'image', file: 'crate_roughness.png', baked: true }; msg('Roughness baked to crate_roughness.png and plugged into the Principled BSDF.'); changed(); return; }
  if (d.fake) { pushUndo(); const a = st.actions.find(x => x.name === d.fake); a.fake = !a.fake; changed(); return; }
  if (d.delAction) { pushUndo(); st.actions = st.actions.filter(x => x.name !== d.delAction); if (st.activeAction === d.delAction) st.activeAction = st.actions[0]?.name || null; msg(tr('Action {a} deleted.', { a: d.delAction })); changed(); }
});
$('#b-props').addEventListener('change', e => {
  const st = S.st, el = e.target, d = el.dataset;
  if (d.k) {
    const [key, k] = d.k.split('.'), v = +el.value, o = active(); pushUndo();
    if (key === 'cursor') st.cursor[+k] = v;
    else if (key === 'dim') OPS.setDimension(o, +k, Math.max(0.001, v));
    else o[key][+k] = v;
    changed(); return;
  }
  if (d.exp) { pushUndo(); st.exp[d.exp] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; changed(); }
});
// viewport picking
function pick(v, e, list) {
  const r = v.canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), v.camera);
  return ray.intersectObjects(list, false)[0]?.object || null;
}
let downAt = null;
for (const v of [BV, UV]) {
  v.canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  v.canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || e.button !== 0) return;
    if (v === BV) {
      const dots = BV.root.children.filter(c => c.userData.point);
      const hitDot = pick(BV, e, dots);
      if (hitDot) { S.st.point = hitDot.userData.point; buildBlender(); msg('Vertex selected. Object › Snap › Cursor to Selected puts the 3D cursor on it.'); return; }
      const hit = pick(BV, e, BV.root.children.filter(c => c.isMesh && c.userData.name));
      if (hit) selectB(hit.userData.name, e.shiftKey);
    } else {
      const hit = pick(UV, e, [...unityMeshes, UV.player]);
      if (hit) { const h = hierarchy(S.st); S.st.unity.sel = hit.userData.name === 'Player' ? 'Player' : h && h.single ? h.rootName : hit.userData.name; renderUnityPanels(); buildUnity(); }
    }
  });
}

// ─── Events: Unity side ──────────────────────────────────────────────────────
$('#u-hier').addEventListener('click', e => { const r = e.target.closest('[data-usel]'); if (!r) return; S.st.unity.sel = r.dataset.usel; renderUnityPanels(); buildUnity(); });
$('#u-insp').addEventListener('click', e => {
  const st = S.st, b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.itab) { st.unity.importTab = d.itab; renderInsp(); return; }
  if (d.clip) { st.unity.clipSel = d.clip; renderInsp(); return; }
  if (d.preview) { st.unity.previewClip = d.preview; togglePlay(true); return; }
  if ('applyimp' in d) { pushUndo(); st.imp = JSON.parse(JSON.stringify(st.pending)); st.pending = null; msg('Import settings applied: Unity re-imports the model.'); changed(); fitViews(); return; }
  if ('revert' in d) { st.pending = null; renderInsp(); return; }
  if (d.extract) { pushUndo(); const p = st.pending || (st.pending = JSON.parse(JSON.stringify(st.imp))); if (d.extract === 'materials') { st.imp.extracted = true; p.extracted = true; st.imp.location = p.location = 'Use External Materials (Legacy)'; msg('Materials extracted to Assets/Materials: now they can be edited.'); } else { st.imp.texturesExtracted = p.texturesExtracted = true; msg(materialReport(st.file, st.imp)?.embedded ? 'Textures extracted to Assets/Textures.' : 'There are no textures embedded in this FBX.', !materialReport(st.file, st.imp)?.embedded); } changed(); return; }
  if ('fixnormal' in d) { pushUndo(); st.imp.normalFixed = true; if (st.pending) st.pending.normalFixed = true; msg('crate_normal.png is now imported as a Normal map.'); changed(); return; }
  if ('revertTr' in d) { pushUndo(); st.unity.override = null; changed(); return; }
  if (d.addcomp) { openAddComp(d.addcomp, b); return; }
  if (d.rmcomp) { pushUndo(); const [name, type] = d.rmcomp.split('|'); const list = st.unity.components[name] || []; const i = list.findIndex(c => c.type === type); if (i >= 0) list.splice(i, 1); else if (type === 'MeshCollider') msg('This collider comes from Generate Colliders: untick it in the import settings.', true); changed(); }
});
function openAddComp(name, btn) {
  const m = $('#menu'), r = btn.getBoundingClientRect(), ws = $('#workspace').getBoundingClientRect();
  m.innerHTML = '<div class="mh">Physics</div>' + ['BoxCollider', 'CapsuleCollider', 'MeshCollider', 'Rigidbody'].map(tp => `<button type="button" data-add="${tp}" data-to="${esc(name)}">${tp.replace('Collider', ' Collider')}</button>`).join('');
  m.style.left = (r.left - ws.left) + 'px'; m.style.top = (r.bottom - ws.top + 2) + 'px'; m.hidden = false; m.dataset.kind = 'add-comp';
  setTimeout(() => { m.hidden = false; });
}
$('#menu').addEventListener('click', e => {
  const b = e.target.closest('[data-add]'); if (!b) return; $('#menu').hidden = true; const st = S.st; pushUndo();
  const list = st.unity.components[b.dataset.to] ||= [];
  if (list.some(c => c.type === b.dataset.add)) { S.undo.pop(); msg('It already has one.', true); return; }
  list.push(b.dataset.add === 'MeshCollider' ? { type: 'MeshCollider', convex: false } : { type: b.dataset.add });
  changed();
});
$('#u-insp').addEventListener('change', e => {
  const st = S.st, el = e.target, d = el.dataset;
  if (d.imp) { st.pending ||= JSON.parse(JSON.stringify(st.imp)); st.pending[d.imp] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; renderInsp(); return; }
  if (d.loop) { st.pending ||= JSON.parse(JSON.stringify(st.imp)); st.pending.clips = { ...st.pending.clips, [d.loop]: { ...(st.pending.clips[d.loop] || {}), loop: el.checked } }; renderInsp(); return; }
  if (d.renderer) { pushUndo(); st.unity.renderers[d.renderer] = el.checked; changed(); return; }
  if (d.convex) { pushUndo(); const c = (st.unity.components[d.convex] || []).find(x => x.type === 'MeshCollider'); if (c) c.convex = el.checked; changed(); return; }
  if (d.utr) {
    pushUndo(); const [k, i] = d.utr.split('.'), h = hierarchy(st), n = report(st).nodes.find(x => x.name === h.rootName) || report(st).nodes[0];
    st.unity.override ||= { position: [...n.position], rotation: [...n.rotation], scale: [...n.scale] };
    st.unity.override[k][+i] = +el.value; changed();
    if (k === 'rotation') msg('Changing the Transform in Unity only moves this instance; the problem stays in the file.');
  }
});
$('#u-play').addEventListener('click', () => togglePlay());
function togglePlay(on = !S.play) {
  S.play = on ? { t0: performance.now() } : null;
  $('#u-play').setAttribute('aria-pressed', String(!!on)); $('#u-play').textContent = on ? '■' : '▶';
  $('.xp-unity').classList.toggle('playing', !!on);
  if (!S.st) return;
  if (on && sid() === 'c1' && physicsState(S.st).errors.length) msg('Error in the Console: the crate has no working collider.', true);
  renderConsole(); buildUnity();
}

// ─── Undo, persistence, steps ────────────────────────────────────────────────
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo'); }
const dataKey = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(dataKey(), S.st); }
function loadData() { const saved = store.get(dataKey(), null); S.st = saved && saved.objects && saved.exp && saved.imp && saved.unity ? saved : startState(step()); S.undo = []; S.redo = []; }
function renderStageSwitch() { $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join(''); }
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const stepDone = i => i === S.step ? !!step().check(S.st) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.classList.toggle('three', n === 3); g.classList.toggle('two', n === 2); g.classList.toggle('five', n === 5);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(); });
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, IN BLENDER AND UNITY'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); togglePlay(false); changed(); fitViews(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st); S.st.pending = null; changed(); fitViews(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
  if (id === 'next-step') { saveData(); S.step++; enterStep(); }
  if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null;
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) setTimeout(() => msg(tr('✓ Step done: {s}', { s: t(step().title) })), 700);
  lastOk = ok;
}
function renderUnityPanels() { renderHier(); renderInsp(); renderConsole(); const st = S.st; $('#u-file').textContent = st.file ? `Assets/Models/${st.fileName}.fbx${outdated(st) ? '  ●' : ''}` : ''; }
function changed(save = true) {
  if (save) saveData();
  buildBlender(); buildUnity(); renderOutliner(); renderBProps(); renderUnityPanels();
  $('#b-file').textContent = `${S.st.fileName}.blend`;
  checkProgress(); renderGuide(); renderStepCard();
}
function enterStep() {
  togglePlay(false); loadData(); lastOk = stepDone(S.step);
  if (!S.st.unity.sel) { const h = hierarchy(S.st); S.st.unity.sel = h?.rootName || null; }
  renderStageSwitch(); changed(false); fitViews(true);
}
function renderAll() { renderStageSwitch(); changed(false); }

// ─── Keyboard and loop ───────────────────────────────────────────────────────
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; }); ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || !S.hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
  if (ctrl && low === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  else if (ctrl && low === 'y') { redo(); e.preventDefault(); }
  else if (e.altKey && low === 'g') { runOp('clearLocation'); e.preventDefault(); }
  else if (low === ' ') { togglePlay(); e.preventDefault(); }
  else if (low === 'home') { fitViews(); }
});
function loop() {
  if (S.play) { buildUnity(); if (sid() === 'c1' || sid() === 'c2' || sid() === 'o1') renderConsole(); }
  for (const v of [BV, UV]) if (v.dirty) { v.dirty = false; v.renderer.render(v.scene, v.camera); }
  requestAnimationFrame(loop);
}
onLangChange(() => renderAll());
enterStep();
requestAnimationFrame(loop);
window.__export = { S, report, BV, UV }; // for tests and curious students
