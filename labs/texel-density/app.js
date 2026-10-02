// Texel Density Lab: a Blender-style UV Editor with a checker grid, a 3D view with simulated textures, and a Texel Density panel.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RES, CHECKER, OBJECTS, MARGIN, TARGETS, SCREEN, islandFaces, objectFaces, bbox, cloneUV, translate, scale as scaleUV, rotate as rotateUV,
  averageIslandsScale, pack, setTD, realSize, onTarget, screenDensity, rightTarget, CAMERAS, GAMES, camDensity, screenOf, setMB, packedDensity1, minRes, brickColor, objectsOf, areas, paintTexture, ruler, SHEET, paintSheet } from './td.js?v=6';
import { STAGES, MEASURE, SEE_QUIZ, RULES, HERO, HERO_WHY, BUDGET_MB, startState, meshOf, densityOf, islandDensityOf, islandsOf, isInside, overlapsOf,
  answerMeasure, answerQuiz, knobs, updateKnobs, resetKnobs, camAnswer, camFor, sceneStats, memoryFor, wasted, syncCuts, addCut, cutReport,
  TARGET_CASES, TARGET_OPTIONS, REFERENCE, RECIPE_TARGET, recipe, textureEstimate } from './stages.js?v=6';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=6';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-td:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-td:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [],
  done: store.get('done', {}), sel: new Set(), hover: false, pivot: 'bbox', modal: null, feedback: null, wire: !!store.get('wire', false),
};
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step];
const sid = () => step().id;
const EDIT = new Set(['m2', 'a1', 'a2', 'a3', 'a5', 'e1']);
const canEdit = () => EDIT.has(sid());
const isLoupe = () => sid() === 'c1' || sid() === 'g1';
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 7000);
}
const objName = o => t(OBJECTS[o].name);
const islName = (m, id) => t(m.islands[id].name);
const px = d => `${Math.round(d)} px/m`;
const resLabel = r => r >= 1024 ? `${r / 1024}K · ${r} px` : `${r} px`;
// The target an island is measured against in this step (null: no target).
function targetOf(id) {
  const st = S.st;
  if (sid() === 'e1') return HERO[id] ?? null;
  return st.target;
}
// Resolution the shader uses for an object (step c1 simulates any density on the wall).
function shaderRes(obj) { return isLoupe() ? S.st.camTarget / packedDensity1('wall') : S.st.res[obj]; }

// ─── 3D viewport ─────────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene3 = new THREE.Scene(); scene3.background = new THREE.Color(0x3a3a3a);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls.addEventListener('change', () => { dirty = true; });
const grid = new THREE.GridHelper(20, 40, 0x555555, 0x474747); scene3.add(grid);
const world = new THREE.Group(); scene3.add(world);
let dirty = true, meshObj = null, overlayObj = null, faceOfTri = [];

const GLSL_PATTERNS = /* glsl */`
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float inBox(vec2 p, vec2 a, vec2 b) { return step(a.x, p.x) * step(p.x, b.x) * step(a.y, p.y) * step(p.y, b.y); }
// Tiny text: glyphs of 5 × 7 dots, on or off at random. o = bottom left, cw = glyph width, n = number of glyphs.
float text(vec2 p, vec2 o, float cw, float n) {
  vec2 q = (p - o) / cw;
  if (q.x < 0. || q.y < 0. || q.x >= n || q.y >= 1.4) return 0.;
  float g = floor(q.x);
  vec2 d = floor(vec2(fract(q.x) * 6., q.y / 1.4 * 8.));
  if (d.x > 4. || d.y > 6.) return 0.;
  return step(.52, h21(vec2(g * 5.3 + d.x + o.x * 91., d.y + o.y * 57.)));
}
vec3 planks(vec2 p) {
  float r = floor(p.y / .125), fy = fract(p.y / .125), h = h21(vec2(r, 7.));
  vec3 c = mix(vec3(.66, .47, .27), vec3(.53, .36, .2), h);
  float g = fract(p.y * 55. + .25 * sin(p.x * 8. + r * 4.) + h * 3.);
  c *= 1. - .2 * step(g, .22);
  vec2 nail = vec2(mod(p.x + h * .1, .25) - .03, (fy - .5) * .125);
  c *= 1. - .65 * step(length(nail), .007);
  c *= mix(.3, 1., step(.05, fy));
  return c;
}
vec3 bricks(vec2 p) {
  float row = floor(p.y / .075), x = p.x / .225 + mod(row, 2.) * .5, col = floor(x);
  if (fract(p.y / .075) > .8667 || fract(x) > .9556) return vec3(.72, .70, .66);
  float h = h21(vec2(col, row));
  vec3 c = mix(vec3(.62, .25, .17), vec3(.48, .18, .13), h);
  c *= h21(floor(p / .012)) > .86 ? .75 : 1.;
  return c;
}
vec3 staves(vec2 p) {
  float w = .117810, i = floor(p.x / w), fx = fract(p.x / w), h = h21(vec2(i, 3.));
  vec3 c = mix(vec3(.62, .42, .23), vec3(.47, .3, .16), h);
  float g = fract(p.x * 70. + .3 * sin(p.y * 5. + i * 2.) + h * 5.);
  c *= 1. - .18 * step(g, .25);
  c *= mix(.35, 1., step(.05, fx));
  float hoop = max(inBox(vec2(0., p.y), vec2(-1., .10), vec2(1., .16)), inBox(vec2(0., p.y), vec2(-1., .74), vec2(1., .80)));
  vec3 iron = vec3(.26, .26, .27) * (1. + .5 * step(length(vec2(fx - .5, fract(p.y / .06) - .5)), .12));
  return mix(c, iron, hoop);
}
vec3 cabinet(vec2 p) {
  vec3 c = vec3(.36, .5, .47) * (.95 + .08 * h21(floor(p / .01)));
  float seam = abs(fract(p.x / .4 + .5) - .5) * .4;
  c *= 1. - .6 * step(seam, .003);
  float frame = abs(seam - .035);
  c *= 1. + .25 * step(frame, .003);
  vec2 knob = vec2(mod(p.x, .4) - .2, p.y - .62);
  c = mix(c, vec3(.8, .72, .45), step(length(knob), .013));
  return c;
}
vec3 vendFront(vec2 p) {
  vec3 c = vec3(.75, .12, .12);
  if (inBox(p, vec2(.05, .55), vec2(.62, 1.78)) > 0.) {
    vec3 g = vec3(.10, .13, .17);
    vec2 q = p - vec2(.05, .55);
    float shelf = floor(q.y / .245), sy = fract(q.y / .245) * .245, col = floor(q.x / .08), sx = fract(q.x / .08) * .08;
    float hc = h21(vec2(col, shelf));
    vec3 can = hc < .25 ? vec3(.85, .1, .1) : hc < .5 ? vec3(.1, .45, .85) : hc < .75 ? vec3(.95, .75, .1) : vec3(.2, .7, .3);
    if (sx > .008 && sx < .072 && sy > .045 && sy < .165) {
      g = can;
      if (sy > .085 && sy < .12) g = vec3(.95) * (1. - .85 * text(vec2(sx, sy), vec2(.012, .093), .008, 6.));
    }
    if (sy > .012 && sy < .034) g = vec3(.92) * (1. - .85 * text(vec2(sx, sy), vec2(.014, .016), .0075, 5.));
    c = g;
  }
  if (inBox(p, vec2(.66, .85), vec2(.86, 1.75)) > 0.) {
    c = vec3(.16);
    if (inBox(p, vec2(.68, 1.55), vec2(.84, 1.70)) > 0.) c = mix(vec3(.05, .18, .08), vec3(.4, 1., .5), text(p, vec2(.69, 1.59), .022, 6.));
    c = mix(c, vec3(.85), text(p, vec2(.68, 1.49), .0085, 18.));
    c = mix(c, vec3(.85), text(p, vec2(.68, 1.46), .0085, 12.));
    c = mix(c, vec3(.02), inBox(p, vec2(.80, 1.30), vec2(.812, 1.42)));
    vec2 k = (p - vec2(.685, .95)) / .05, ki = floor(k), kf = fract(k);
    if (ki.x >= 0. && ki.x < 3. && ki.y >= 0. && ki.y < 5. && kf.x < .8 && kf.y < .8) c = vec3(.72) * (1. - .9 * text(kf * .05, vec2(.012, .01), .016, 1.));
  }
  if (inBox(p, vec2(.1, .15), vec2(.6, .42)) > 0.) c = inBox(p, vec2(.12, .17), vec2(.58, .40)) > 0. ? vec3(.06) : vec3(.3);
  if (p.y > 1.8) c = mix(vec3(.95), vec3(.75, .12, .12), text(p, vec2(.12, 1.815), .05, 13.));
  return c;
}
vec3 vendSide(vec2 p) {
  vec3 c = vec3(.72, .11, .11) * (.96 + .06 * h21(floor(p / .02)));
  if (p.y > 1.1 && p.y < 1.45) c = mix(vec3(.95), vec3(.72, .11, .11), text(p, vec2(.08, 1.16), .1, 6.));
  if (inBox(p, vec2(.3, .3), vec2(.52, .44)) > 0.) {
    c = vec3(.98, .86, .2);
    for (int i = 0; i < 6; i++) c = mix(c, vec3(.05), text(p, vec2(.31, .415 - float(i) * .018), .0065, 30.));
  }
  return c;
}
vec3 trimSheet(vec2 p) {
  p.x = mod(p.x, 2.);
  if (p.y < .25) {
    vec3 c = vec3(.36, .22, .12) * (.9 + .15 * h21(vec2(floor(p.x / .5), 1.)));
    c *= 1. - .12 * step(fract(p.x * 23. + .3 * sin(p.y * 40.)), .3);
    if (p.y > .19) c = vec3(.48, .31, .17) * (p.y > .225 ? 1.15 : .85);
    return p.y < .015 ? c * .55 : c;
  }
  if (p.y < .5) {
    float y = p.y - .25;
    vec3 c = vec3(.87, .84, .77) * (y < .03 ? .7 : y < .07 ? 1.05 : y < .1 ? .82 : y < .16 ? 1. : y < .19 ? .78 : y < .22 ? 1.08 : .92);
    c *= 1. - .18 * step(fract(p.x / .1), .5) * step(.1, y) * step(y, .16);
    return min(c, vec3(1.));
  }
  vec2 q = p - vec2(0., .5);
  float row = floor(q.y / .075), x = q.x / .25 + mod(row, 2.) * .5, col = floor(x);
  if (fract(q.y / .075) > .8667 || fract(x) > .96) return vec3(.72, .70, .66);
  vec3 c = mix(vec3(.62, .25, .17), vec3(.48, .18, .13), h21(vec2(mod(col, 8.), row)));
  return h21(floor(q / .012)) > .86 ? c * .75 : c;
}
vec3 pattern(vec2 p, float k) {
  vec3 c = k < .5 ? planks(p) : k < 1.5 ? bricks(p) : k < 2.5 ? staves(p) : k < 3.5 ? cabinet(p) : k < 4.5 ? vendFront(p) : k < 5.5 ? vendSide(p) : trimSheet(p);
  return pow(c, vec3(2.2));
}`;
const material = new THREE.ShaderMaterial({
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  uniforms: { uChecker: { value: 1 }, uLight: { value: new THREE.Vector3(-0.35, 0.75, 0.55).normalize() } },
  vertexShader: /* glsl */`
    attribute vec2 loc; attribute float pat; attribute float tres;
    varying vec2 vUv; varying vec2 vLoc; varying float vPat; varying float vRes; varying vec3 vN;
    void main() { vUv = uv; vLoc = loc; vPat = pat; vRes = tres; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */`
    uniform float uChecker; uniform vec3 uLight;
    varying vec2 vUv; varying vec2 vLoc; varying float vPat; varying float vRes; varying vec3 vN;
    ${GLSL_PATTERNS}
    vec3 checkerColor() {
      vec2 q = floor(vUv * vRes / ${CHECKER.toFixed(1)});
      float c = mod(q.x + q.y, 2.);
      float hh = h21(floor(q / 4.));
      vec3 tint = .55 + .45 * cos(6.2832 * (hh + vec3(0., .33, .67)));
      vec3 col = mix(vec3(.30), vec3(.92), c) * mix(vec3(1.), tint * 1.25, .35);
      if (vUv.x < 0. || vUv.y < 0. || vUv.x > 1. || vUv.y > 1.) col = mix(col, vec3(1., .12, .1), .6);
      return pow(col, vec3(2.2));
    }
    // A texture of vRes × vRes pixels painted with the pattern, read with bilinear filtering,
    // and never with more texels than screen pixels (as a mipmap would do).
    vec3 textureColor() {
      vec2 dx = dFdx(vUv), dy = dFdy(vUv), lx = dFdx(vLoc), ly = dFdy(vLoc);
      float det = dx.x * dy.y - dx.y * dy.x;
      if (abs(det) < 1e-16) return pattern(vLoc, vPat);
      float fp = max(length(dx), length(dy)) * vRes;
      // Texels smaller than a pixel: average four samples inside the pixel, as a mipmap would.
      if (fp > 1.5) return .25 * (pattern(vLoc + .25 * (lx + ly), vPat) + pattern(vLoc + .25 * (lx - ly), vPat) + pattern(vLoc - .25 * (lx + ly), vPat) + pattern(vLoc - .25 * (lx - ly), vPat));
      float res = vRes / max(1., fp);
      mat2 J = mat2(lx, ly) * inverse(mat2(dx, dy));
      vec2 tt = vUv * res - .5, i = floor(tt), f = tt - i, c0 = (i + .5) / res;
      float s = 1. / res;
      vec3 a = pattern(vLoc + J * (c0 - vUv), vPat), b = pattern(vLoc + J * (c0 + vec2(s, 0.) - vUv), vPat);
      vec3 c = pattern(vLoc + J * (c0 + vec2(0., s) - vUv), vPat), d = pattern(vLoc + J * (c0 + vec2(s) - vUv), vPat);
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    void main() {
      vec3 albedo = uChecker > .5 ? checkerColor() : textureColor();
      vec3 n = normalize(vN);
      float light = .36 + .74 * max(dot(n, uLight), 0.);
      gl_FragColor = vec4(albedo * light, 1.);
      #include <colorspace_fragment>
    }`,
});
const overlayMat = new THREE.MeshBasicMaterial({ color: 0xffa629, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
const edgeMat = new THREE.LineBasicMaterial({ color: 0xffa629, depthTest: false, transparent: true });
const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
const wirePts = new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false });
const extraMats = { wall: new THREE.MeshLambertMaterial({ color: 0x6b5a50 }), barrel: new THREE.MeshLambertMaterial({ color: 0x7a5230 }) };
const CAMS = { crate: [[1.2, 1.0, 1.5], [0, 0.25, 0]], cabinet: [[1.6, 1.4, 2.4], [0, 0.4, 0]], vending: [[1.9, 1.9, 3.4], [0, 0.95, 0]], wall: [[1.2, 1.6, 5.2], [0, 1.0, 0]], trio: [[0.4, 2.8, 7.4], [0, 0.6, 0]], cutwall: [[0.9, 1.3, 4.6], [0, 1.0, 0]], shop: [[0.2, 3.1, 8.2], [0, 0.8, 0]] };
function frame() {
  const st = S.st;
  if (isLoupe()) { const c = camFor(st), d = c.d; camera.fov = screenOf(c).fov; camera.position.set(0, 1.2, 0.125 + d); controls.target.set(0, 1.2, 0.125); }
  else {
    // Look from the preset direction and back off until every prop fits the view.
    const [p, tg] = CAMS[st.scene] || CAMS.trio, m = meshOf(st), box = new THREE.Box3();
    for (const q of m.pos) box.expandByPoint(new THREE.Vector3(...q));
    const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
    camera.fov = 35; camera.aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
    const fv = camera.fov * Math.PI / 180, fh = 2 * Math.atan(Math.tan(fv / 2) * camera.aspect), dist = r / Math.sin(Math.min(fv, fh) / 2) * (st.scene === 'cutwall' ? 1.02 : objectsOf(st.scene).length > 1 ? 1.08 : 1.3);
    const dir = new THREE.Vector3(p[0] - tg[0], p[1] - tg[1], p[2] - tg[2]).normalize();
    camera.position.copy(c).addScaledVector(dir, dist); controls.target.copy(c);
  }
  camera.updateProjectionMatrix(); controls.update(); dirty = true;
}
function clearWorld() { for (const o of [...world.children]) { world.remove(o); o.geometry?.dispose(); } }
function build3D() {
  clearWorld(); overlayObj = null; faceOfTri = [];
  const m = meshOf(S.st), st = S.st;
  // Normals: averaged over the faces of the same island that share a vertex (the barrel is smooth, boxes are flat).
  const fn = m.faces.map(face => { const [a, b, c, d] = face.v.map(i => m.pos[i]); const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], w = [d[0] - b[0], d[1] - b[1], d[2] - b[2]]; const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n) || 1; return n.map(x => x / l); });
  const acc = new Map();
  m.faces.forEach((face, f) => face.v.forEach(v => { const k = face.island + '|' + v, a = acc.get(k) || [0, 0, 0]; acc.set(k, a.map((x, i) => x + fn[f][i])); }));
  const pos = [], nor = [], uv = [], loc = [], pat = [], res = [];
  m.faces.forEach((face, f) => {
    const isl = m.islands[face.island], r = shaderRes(isl.obj);
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const n = acc.get(face.island + '|' + face.v[k]), l = Math.hypot(...n) || 1;
      pos.push(...m.pos[face.v[k]]); nor.push(n[0] / l, n[1] / l, n[2] / l); uv.push(...st.uv[f][k]); loc.push(...face.loc[k]); pat.push(isl.pat); res.push(r);
    }
    faceOfTri.push(f, f);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('loc', new THREE.Float32BufferAttribute(loc, 2));
  g.setAttribute('pat', new THREE.Float32BufferAttribute(pat, 1)); g.setAttribute('tres', new THREE.Float32BufferAttribute(res, 1));
  material.uniforms.uChecker.value = st.view === 'checker' && !isLoupe() ? 1 : 0;
  meshObj = new THREE.Mesh(g, material); world.add(meshObj);
  // Wireframe overlay: every edge of the quads, drawn once.
  if (S.wire) {
    const seen = new Set(), wp = [];
    for (const face of m.faces) for (let k = 0; k < 4; k++) {
      const a = face.v[k], b = face.v[(k + 1) % 4], key = a < b ? a + '|' + b : b + '|' + a;
      if (!seen.has(key)) { seen.add(key); wp.push(...m.pos[a], ...m.pos[b]); }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    world.add(new THREE.LineSegments(wg, wireMat));
    const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.Float32BufferAttribute(m.pos.flat(), 3));
    world.add(new THREE.Points(vg, wirePts));
  }
  for (const e of m.extras) {
    let eg;
    if (e.kind === 'disk') { eg = new THREE.CircleGeometry(e.r, 24); eg.rotateX(-Math.PI / 2); eg.translate(...e.center); }
    else { eg = new THREE.BufferGeometry(); const p = e.pts; eg.setAttribute('position', new THREE.Float32BufferAttribute([...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]], 3)); eg.computeVertexNormals(); }
    world.add(new THREE.Mesh(eg, extraMats[e.obj]));
  }
  buildOverlay(); buildLabels(); dirty = true;
}
let rulerObj = null;
const rulerMat = new THREE.MeshBasicMaterial({ color: 0xffd400, depthTest: false, transparent: true });
// The island the ruler lies on: the selected one (one island selected, ruler on, numbers not hidden).
const rulerIsland = () => S.st.ruler && S.sel.size === 1 && sid() !== 's2' && !isLoupe() ? [...S.sel][0] : null;
function buildRuler() {
  if (rulerObj) { world.remove(rulerObj); rulerObj.geometry.dispose(); rulerObj = null; }
  const id = rulerIsland(); if (!id) return;
  const r = ruler(meshOf(S.st), S.st.uv, id, 20), m = meshOf(S.st), n = m.faces[islandFaces(m, id)[0]];
  // Lift the line a little off the surface along the face normal so it is never hidden inside it.
  const curve = new THREE.CatmullRomCurve3(r.pts3.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0);
  rulerObj = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.025, 6, false), rulerMat); rulerObj.renderOrder = 10; world.add(rulerObj); void n;
}
function buildOverlay() {
  buildRuler();
  if (overlayObj) { world.remove(overlayObj); overlayObj.geometry.dispose(); overlayObj.children[0]?.geometry.dispose(); overlayObj = null; }
  if (!meshObj || !S.sel.size) { dirty = true; return; }
  const m = meshOf(S.st), pos = [];
  for (const id of S.sel) if (m.islands[id]) for (const f of islandFaces(m, id)) { const v = m.faces[f].v; for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...m.pos[v[k]]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  overlayObj = new THREE.Mesh(g, overlayMat);
  overlayObj.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat));
  world.add(overlayObj); dirty = true;
}
function updateUV3D() {
  if (!meshObj) return;
  const m = meshOf(S.st), a = meshObj.geometry.attributes.uv;
  m.faces.forEach((face, f) => [0, 1, 2, 0, 2, 3].forEach((k, j) => a.setXY(f * 6 + j, S.st.uv[f][k][0], S.st.uv[f][k][1])));
  a.needsUpdate = true; dirty = true; buildLabels();
}
// Labels over each prop: its name and its density.
let labelAnchors = [];
function buildLabels() {
  const m = meshOf(S.st), host = $('#labels'), hide = sid() === 's2' || isLoupe();
  labelAnchors = [];
  const objs = objectsOf(S.st.scene);
  host.innerHTML = objs.length < 2 && !['a3', 'c2'].includes(sid()) ? '' : objs.map(o => {
    let top = -Infinity, cx = 0, cz = 0, n = 0;
    for (const f of objectFaces(m, o)) for (const v of m.faces[f].v) { const p = m.pos[v]; top = Math.max(top, p[1]); cx += p[0]; cz += p[2]; n++; }
    labelAnchors.push([o, new THREE.Vector3(cx / n, top + 0.12, cz / n)]);
    const d = densityOf(S.st, o), tg = S.st.target, ok = sid() === 'c2' ? d >= tg * 0.95 && !wasted(S.st, o, tg) : onTarget(d, tg, 0.05) && isInside(S.st, o) && (sid() !== 'a3' || !wasted(S.st, o, tg)), cls = tg ? (ok ? 'good' : 'bad') : '';
    return `<span data-obj="${o}" class="${o === S.st.active ? 'active' : ''}">${esc(objName(o))}${hide ? '' : `<b class="${cls}" data-no-i18n>${px(d)}</b>`}</span>`;
  }).join('');
  // The selected face: its real size in metres (the UV Editor shows its size in pixels).
  if (S.sel.size === 1 && !hide && !rulerIsland()) {
    const id = [...S.sel][0], f = islandFaces(m, id), rs = realSize(m, f), c = [0, 0, 0]; let n = 0;
    for (const i of f) for (const v of m.faces[i].v) { const p = m.pos[v]; c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; }
    labelAnchors.push(['face', new THREE.Vector3(c[0] / n, c[1] / n, c[2] / n)]);
    host.insertAdjacentHTML('beforeend', `<span data-obj="face" class="face">${esc(islName(m, id))}<b data-no-i18n>${+rs.w.toFixed(2)} × ${+rs.h.toFixed(2)} m</b></span>`);
  }
  const rid = rulerIsland();
  if (rid) {
    const r = ruler(m, S.st.uv, rid, 20), p0 = r.pts3[0], p1 = r.pts3[r.pts3.length - 1], mid = [(p0[0] + p1[0]) / 2, Math.max(p0[1], p1[1]) + 0.08, (p0[2] + p1[2]) / 2], res = S.st.res[m.islands[rid].obj];
    labelAnchors.push(['ruler', new THREE.Vector3(...mid)]);
    host.insertAdjacentHTML('beforeend', `<span data-obj="ruler" class="rul" data-no-i18n>${+r.L.toFixed(2)} m → ${Math.round(r.lenUV * res)} px</span>`);
  }
  placeLabels();
}
function placeLabels() {
  const w = host.clientWidth, h = host.clientHeight, v = new THREE.Vector3();
  for (const [o, p] of labelAnchors) {
    const el = $(`#labels [data-obj="${o}"]`); if (!el) continue;
    v.copy(p).project(camera);
    el.style.display = v.z > 1 ? 'none' : '';
    el.style.left = `${(v.x + 1) / 2 * w}px`; el.style.top = `${(1 - v.y) / 2 * h}px`;
  }
}
function resize3D() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
new ResizeObserver(resize3D).observe(host);
(function loop() { requestAnimationFrame(loop); if (dirty) { renderer.render(scene3, camera); placeLabels(); dirty = false; } })();

const ray = new THREE.Raycaster();
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (S.modal) { confirmModal(); return; }
  if (!meshObj) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
  const hit = ray.intersectObject(meshObj)[0];
  const id = hit ? meshOf(S.st).faces[faceOfTri[hit.faceIndex]].island : null;
  pick3D(id, e.shiftKey);
});
function pick3D(id, add) {
  const m = meshOf(S.st);
  if (sid() === 's2') { if (id) answerSee(m.islands[id].obj); return; }
  if (isLoupe()) return;
  if (id) {
    const o = m.islands[id].obj;
    if (o !== S.st.active) { S.st.active = o; S.sel.clear(); add = false; }
    if (S.st.view === 'checker') S.st.flags['sel_' + o] = true;
  }
  pick(id, add);
  if (id) { buildLabels(); renderHeaders(); checkProgress(); }
}

// ─── UV Editor ───────────────────────────────────────────────────────────────
const uvc = $('#uv'), uvHost = $('#uv-host'), ctx = uvc.getContext('2d');
const V = { ox: 0, oy: 0, sc: 300 };
let uvDirty = true, pointer = { x: 0, y: 0, inUV: false };
const toScr = (u, v) => [V.ox + u * V.sc, V.oy + (1 - v) * V.sc];
const toUV = (x, y) => [(x - V.ox) / V.sc, 1 - (y - V.oy) / V.sc];
function fitUV() { const w = uvHost.clientWidth, h = uvHost.clientHeight; V.sc = Math.max(80, Math.min(h - 40, w - 40)); V.ox = (w - V.sc) / 2; V.oy = (h - V.sc) / 2 + 6; uvDirty = true; }
function resizeUV() { const w = uvHost.clientWidth, h = uvHost.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); uvc.width = w * dpr; uvc.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); fitUV(); }
new ResizeObserver(resizeUV).observe(uvHost);
function drawUV() {
  const w = uvHost.clientWidth, h = uvHost.clientHeight, st = S.st;
  ctx.fillStyle = '#232323'; ctx.fillRect(0, 0, w, h);
  if (isLoupe()) { drawLoupe(w, h); uvDirty = false; return; }
  const obj = st.active, res = st.res[obj], n = res / CHECKER, [x0, y0] = toScr(0, 1), cell = V.sc / n, texel = V.sc / res;
  if (st.scene === 'cutwall' && st.uvImage === 'texture') {
    ctx.imageSmoothingEnabled = texel < 1; ctx.drawImage(sheetImage(Math.min(2048, res)), x0, y0, V.sc, V.sc); ctx.imageSmoothingEnabled = true;
    ctx.font = '10.5px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
    for (const z of Object.values(SHEET.zones)) { const [, zy] = toScr(0, (z.v0 + z.h) / SHEET.m); const lab = `${t(z.name)} · ${z.h} m`, lw = ctx.measureText(lab).width; ctx.fillStyle = 'rgba(15,15,15,.85)'; ctx.fillRect(x0 + 4, zy + 3, lw + 8, 15); ctx.fillStyle = '#ffd88a'; ctx.fillText(lab, x0 + 8, zy + 11); ctx.strokeStyle = 'rgba(255,216,138,.8)'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x0 - 6, zy + 0.5); ctx.lineTo(x0 + V.sc, zy + 0.5); ctx.stroke(); ctx.setLineDash([]); }
  } else if (st.uvImage === 'texture' && !S.modal) {
    // The texture image itself, painted from the UVs: its pixels are the texels.
    ctx.imageSmoothingEnabled = texel < 1; ctx.drawImage(textureImage(obj), x0, y0, V.sc, V.sc); ctx.imageSmoothingEnabled = true;
  } else {
    // The checker grid: one square = 64 × 64 texels, as on the model.
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = (i + j) % 2 ? '#8d8d8d' : '#5a5a5a'; ctx.fillRect(x0 + i * cell, y0 + j * cell, cell + 0.5, cell + 0.5); }
  }
  // Zoomed in: the grid of texture pixels.
  if (texel >= 8) {
    const i0 = Math.max(0, Math.floor(-x0 / texel)), i1 = Math.min(res, Math.ceil((w - x0) / texel)), j0 = Math.max(0, Math.floor(-y0 / texel)), j1 = Math.min(res, Math.ceil((h - y0) / texel));
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = i0; i <= i1; i++) { const x = Math.round(x0 + i * texel) + 0.5; ctx.moveTo(x, Math.max(0, y0)); ctx.lineTo(x, Math.min(h, y0 + V.sc)); }
    for (let j = j0; j <= j1; j++) { const y = Math.round(y0 + j * texel) + 0.5; ctx.moveTo(Math.max(0, x0), y); ctx.lineTo(Math.min(w, x0 + V.sc), y); }
    ctx.stroke();
    ctx.font = '11.5px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle'; const note = t('Each small square is one texture pixel.'), nw = ctx.measureText(note).width;
    ctx.fillStyle = 'rgba(15,15,15,.85)'; ctx.fillRect(8, h - 34, nw + 12, 20); ctx.fillStyle = '#ffc266'; ctx.fillText(note, 14, h - 24);
  }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, V.sc, V.sc);
  ctx.font = '11px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#cfcfcf';
  ctx.fillText(`${res} px`, x0 + V.sc - ctx.measureText(`${res} px`).width, y0 - 9); ctx.fillText('0', x0 - 10, y0 + V.sc + 8); ctx.fillText('1', x0 + V.sc + 3, y0 + V.sc + 8);
  const m = meshOf(st), hide = sid() === 's2';
  const ids = islandsOf(st, obj).map(id => { const b = bbox(st.uv, islandFaces(m, id)); return [id, b.w * b.h]; }).sort((a, b) => b[1] - a[1]).map(a => a[0]);
  const bad = new Set(st.scene === 'cutwall' ? [] : overlapsOf(st, obj).flat());
  for (const pass of [0, 1]) for (const id of ids) {
    const sel = S.sel.has(id); if ((pass === 1) !== sel) continue;
    const d = islandDensityOf(st, id), tg = targetOf(id), ok = tg ? onTarget(d, tg) : null;
    ctx.fillStyle = sel ? 'rgba(255,166,41,.30)' : ok === true ? 'rgba(110,200,110,.28)' : ok === false ? 'rgba(230,90,60,.28)' : 'rgba(255,255,255,.14)';
    ctx.strokeStyle = sel ? '#ffa629' : bad.has(id) ? '#ff5a4a' : 'rgba(240,240,240,.9)';
    ctx.lineWidth = bad.has(id) && !sel ? 2 : 1;
    for (const f of islandFaces(m, id)) { ctx.beginPath(); st.uv[f].forEach(([u, v], i) => { const [x, y] = toScr(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    const b = bbox(st.uv, islandFaces(m, id)), [cx, cy] = toScr(b.cu, b.cv), bw = b.w * V.sc, bh = b.h * V.sc;
    if (bw > 46 && bh > 18 || sel) {
      const label = hide ? islName(m, id) : `${islName(m, id)} · ${Math.round(d)}`, tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15,15,15,.78)'; ctx.fillRect(cx - tw / 2 - 4, cy - 8, tw + 8, 16);
      ctx.fillStyle = sel ? '#ffc266' : '#fff'; ctx.fillText(label, cx - tw / 2, cy);
    }
  }
  ctx.lineWidth = 1;
  if (S.sel.size === 1 && !hide) drawDimensions(m, [...S.sel][0], res);
  if (rulerIsland()) drawRulerUV(m, rulerIsland(), res);
  if (st.scene === 'cutwall') { ctx.fillStyle = '#9fd3ff'; ctx.fillText(t('The strips go past the right edge: the sheet repeats from left to right.'), 8, h - 12); }
  else if (!isInside(st, obj)) { ctx.fillStyle = '#ff8a65'; ctx.fillText(t('Some islands are outside the square: they repeat the texture.'), 8, h - 12); }
  uvDirty = false;
}
// The 1 m ruler on the texture: its length in pixels of the image is the texel density.
function drawRulerUV(m, id, res) {
  const r = ruler(m, S.st.uv, id, 20), P = r.ptsUV.map(([u, v]) => toScr(u, v));
  ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 3; ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let k = 0; k < P.length; k += 2) {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, s = k % 10 === 0 ? 9 : 5;
    ctx.beginPath(); ctx.moveTo(P[k][0] - dy / l * s, P[k][1] + dx / l * s); ctx.lineTo(P[k][0] + dy / l * s, P[k][1] - dx / l * s); ctx.stroke();
  }
  const px = Math.round(r.lenUV * res), per = Math.round(px / r.L);
  const label = r.L < 0.999 ? tr('{a} m of surface → {b} px of the image → {c} px/m', { a: +r.L.toFixed(2), b: px, c: per }) : tr('1 m of surface → {b} px of the image = {c} px/m', { b: px, c: per });
  ctx.font = '600 12px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width, [mx, my] = P[Math.floor(P.length / 2)], lx = Math.max(6, Math.min(uvHost.clientWidth - tw - 16, mx - tw / 2 - 5)), ly = my + 20;
  ctx.fillStyle = 'rgba(20,18,0,.88)'; ctx.fillRect(lx, ly - 10, tw + 10, 20); ctx.fillStyle = '#ffd400'; ctx.fillText(label, lx + 5, ly);
  ctx.lineWidth = 1;
}
// Dimension lines on the selected island: how many pixels of the image it covers.
function drawDimensions(m, id, res) {
  const b = bbox(S.st.uv, islandFaces(m, id)), [xa, ya] = toScr(b.u0, b.v1), [xb, yb] = toScr(b.u1, b.v0);
  ctx.strokeStyle = '#ffc266'; ctx.fillStyle = '#ffc266'; ctx.lineWidth = 1.5; ctx.font = '600 11.5px Inter, Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
  const yT = ya - 10, xL = xa - 10;
  ctx.beginPath(); ctx.moveTo(xa, yT); ctx.lineTo(xb, yT); ctx.moveTo(xa, yT - 4); ctx.lineTo(xa, yT + 4); ctx.moveTo(xb, yT - 4); ctx.lineTo(xb, yT + 4);
  ctx.moveTo(xL, ya); ctx.lineTo(xL, yb); ctx.moveTo(xL - 4, ya); ctx.lineTo(xL + 4, ya); ctx.moveTo(xL - 4, yb); ctx.lineTo(xL + 4, yb); ctx.stroke();
  const lw = `${Math.round(b.w * res)} px`, lh = `${Math.round(b.h * res)} px`, tw = ctx.measureText(lw).width;
  ctx.fillStyle = 'rgba(15,15,15,.85)'; ctx.fillRect((xa + xb) / 2 - tw / 2 - 4, yT - 9, tw + 8, 18); ctx.fillStyle = '#ffc266'; ctx.fillText(lw, (xa + xb) / 2 - tw / 2, yT);
  ctx.save(); ctx.translate(xL, (ya + yb) / 2); ctx.rotate(-Math.PI / 2); const th = ctx.measureText(lh).width;
  ctx.fillStyle = 'rgba(15,15,15,.85)'; ctx.fillRect(-th / 2 - 4, -9, th + 8, 18); ctx.fillStyle = '#ffc266'; ctx.fillText(lh, -th / 2, 0); ctx.restore();
  ctx.lineWidth = 1;
}
// The painted texture of an object, cached until its UVs or its size change.
const sheetCache = new Map();
function sheetImage(size) {
  if (!sheetCache.has(size)) { const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').putImageData(new ImageData(paintSheet(size), size, size), 0, 0); sheetCache.set(size, c); }
  return sheetCache.get(size);
}
const texCache = new Map();
function textureImage(obj) {
  const st = S.st, m = meshOf(st), size = Math.min(2048, st.res[obj]);
  const key = `${st.scene}|${obj}|${size}|${objectFaces(m, obj).map(f => st.uv[f].map(p => p.map(x => x.toFixed(4)).join(',')).join(';')).join('|')}`;
  if (!texCache.has(key)) {
    if (texCache.size > 6) texCache.clear();
    const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').putImageData(new ImageData(paintTexture(m, st.uv, obj, size), size, size), 0, 0);
    texCache.set(key, c);
  }
  return texCache.get(key);
}
(function uvLoop() { requestAnimationFrame(uvLoop); if (uvDirty && S.st) drawUV(); })();

// ─── Pixel loupe (step c1) ───────────────────────────────────────────────────
const off = document.createElement('canvas'), offCtx = off.getContext('2d');
function loupeImage(nx, fn) { off.width = off.height = nx; const img = offCtx.createImageData(nx, nx); for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const c = fn(i, j), k = (j * nx + i) * 4; img.data[k] = c[0] * 255; img.data[k + 1] = c[1] * 255; img.data[k + 2] = c[2] * 255; img.data[k + 3] = 255; } offCtx.putImageData(img, 0, 0); return off; }
const PIX = 20;   // screen pixels shown across the loupe
function drawLoupe(w, h) {
  const st = S.st, sd = camDensity(camFor(st)), td = st.camTarget, L = PIX / sd, s0 = 1.02, t0 = 1.03;
  const side = Math.max(90, Math.min((w - 36) / 2, h - 90)), y = 30, xa = (w - 2 * side - 16) / 2, xb = xa + side + 16;
  const lin = c => c.map(x => x ** 2.2), srgb = c => c.map(x => Math.min(1, Math.max(0, x)) ** (1 / 2.2));
  // Left: the texels of the texture on this piece of wall.
  const nt = Math.max(1, Math.ceil(L * td)), texel = (i, j) => brickColor(s0 + (i + 0.5) / td, t0 + L - (j + 0.5) / td);
  ctx.imageSmoothingEnabled = false;
  if (nt <= 512) ctx.drawImage(loupeImage(nt, texel), xa, y, side * nt / (L * td), side * nt / (L * td));
  ctx.save(); ctx.fillStyle = '#232323'; ctx.fillRect(xa + side, y, side * 2, side + 2); ctx.fillRect(xa, y + side, side + 2, side * 2); ctx.restore();
  // Right: what the screen shows. Each pixel reads the texture (bilinear), or averages it when texels are smaller than pixels.
  const cols = [], samp = (s, tt) => {
    const fx = (s - s0) * td - 0.5, fy = (t0 + L - tt) * td - 0.5, i = Math.floor(fx), j = Math.floor(fy), ax = fx - i, ay = fy - j;
    const c = (a, b) => lin(texel(a, b)), mixc = (p, q, k) => p.map((x, n) => x + (q[n] - x) * k);
    return mixc(mixc(c(i, j), c(i + 1, j), ax), mixc(c(i, j + 1), c(i + 1, j + 1), ax), ay);
  };
  const k = Math.max(1, Math.round(td / sd)), sub = Math.min(6, k);
  const screen = loupeImage(PIX, (i, j) => {
    let acc = [0, 0, 0];
    for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) { const c = samp(s0 + (i + (a + 0.5) / sub) / sd, t0 + L - (j + (b + 0.5) / sub) / sd); acc = acc.map((x, n) => x + c[n]); }
    return srgb(acc.map(x => x / (sub * sub)));
  });
  cols.push(screen);
  ctx.drawImage(screen, xb, y, side, side);
  // Screen-pixel grid on both sides.
  ctx.strokeStyle = 'rgba(79,195,255,.55)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i <= PIX; i++) { const q = Math.round(i * side / PIX) + 0.5; for (const x of [xa, xb]) { ctx.moveTo(x + q, y); ctx.lineTo(x + q, y + side); ctx.moveTo(x, y + q); ctx.lineTo(x + side, y + q); } }
  ctx.stroke(); ctx.imageSmoothingEnabled = true;
  ctx.font = '11.5px Inter, Segoe UI, sans-serif'; ctx.fillStyle = '#e8e8e8'; ctx.textBaseline = 'middle';
  ctx.fillText(t('Texture (texels)'), xa, y - 13); ctx.fillText(t('On screen (pixels)'), xb, y - 13);
  const ratio = td / sd, verdict = ratio < 0.97 ? 'bad' : ratio >= 2 ? 'waste' : 'ok';
  ctx.fillStyle = verdict === 'ok' ? '#91d76c' : '#ff8a65';
  const line1 = tr('{a} texels per screen pixel', { a: ratio.toFixed(2) });
  const line2 = t(verdict === 'bad' ? 'Blurry: each texel is stretched over several pixels.' : verdict === 'waste' ? 'Wasted: texels are smaller than pixels, the GPU shows a smaller mip.' : 'Right: about one texel per pixel.');
  ctx.fillText(line1, xa, y + side + 18); ctx.fillStyle = '#cfcfcf'; ctx.fillText(line2, xa, y + side + 36);
  ctx.fillStyle = '#8d8d8d'; ctx.fillText(tr('Blue grid: screen pixels · {a} cm of wall', { a: (L * 100).toFixed(1) }), xa, y + side + 54);
}

// ─── UV picking and transforms ───────────────────────────────────────────────
function pointInPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function islandAt(u, v) {
  const m = meshOf(S.st); let best = null, area = Infinity;
  for (const id of islandsOf(S.st, S.st.active)) if (islandFaces(m, id).some(f => pointInPoly([u, v], S.st.uv[f]))) { const b = bbox(S.st.uv, islandFaces(m, id)); if (b.w * b.h < area) { area = b.w * b.h; best = id; } }
  return best;
}
function pick(id, add) {
  if (!add) S.sel.clear();
  if (id) { if (add && S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); }
  if (id && sid() === 'm0') { S.st.flags['isl_' + id] = true; saveData(); checkProgress(); }
  if (id && sid() === 's0' && S.st.ruler) { S.st.flags['rul_' + meshOf(S.st).islands[id].obj] = true; saveData(); checkProgress(); }
  uvDirty = true; buildOverlay(); buildLabels(); renderProps();
}
let pan = null;
uvc.addEventListener('pointerdown', e => {
  const r = uvc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (e.button === 1) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY, ox: V.ox, oy: V.oy }; uvc.setPointerCapture(e.pointerId); return; }
  if (e.button === 2) { if (S.modal) cancelModal(); return; }
  if (e.button !== 0 || isLoupe()) return;
  if (S.modal) { confirmModal(); return; }
  const [u, v] = toUV(x, y);
  if (sid() === 's2') return;
  pick(islandAt(u, v), e.shiftKey);
});
uvc.addEventListener('contextmenu', e => { e.preventDefault(); if (S.modal) cancelModal(); });
uvc.addEventListener('auxclick', e => e.preventDefault());
window.addEventListener('pointerup', () => { pan = null; });
uvc.addEventListener('pointermove', e => {
  const r = uvc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  pointer = { x, y, inUV: true };
  if (pan) { V.ox = pan.ox + e.clientX - pan.x; V.oy = pan.oy + e.clientY - pan.y; uvDirty = true; return; }
  if (S.modal || isLoupe()) return;
  const [u, v] = toUV(x, y), id = islandAt(u, v), tip = $('#uv-tip');
  if (id && sid() !== 's2') {
    const m = meshOf(S.st), b = bbox(S.st.uv, islandFaces(m, id)), res = S.st.res[S.st.active], rs = realSize(m, islandFaces(m, id));
    tip.hidden = false; tip.textContent = tr('{name} · {b} × {c} px of the image · face {d} × {e} m', { name: islName(m, id), b: Math.round(b.w * res), c: Math.round(b.h * res), d: +rs.w.toFixed(2), e: +rs.h.toFixed(2) });
  } else tip.hidden = true;
});
uvc.addEventListener('pointerleave', () => { pointer.inUV = false; $('#uv-tip').hidden = true; });
uvc.addEventListener('wheel', e => {
  e.preventDefault(); if (isLoupe()) return;
  const r = uvc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, k = e.deltaY > 0 ? 1 / 1.15 : 1.15;
  const sc = Math.max(60, Math.min(12000, V.sc * k)), f = sc / V.sc; V.ox = x - (x - V.ox) * f; V.oy = y - (y - V.oy) * f; V.sc = sc; uvDirty = true;
  if (sid() === 'm0' && V.sc / S.st.res[S.st.active] >= 8 && !S.st.flags.zoom_px) { S.st.flags.zoom_px = true; saveData(); renderProps(); checkProgress(); }
}, { passive: false });

function startModal(kind) {
  if (!canEdit()) { msg('In this step the islands stay where they are.', true); return; }
  if (!S.sel.size) { msg('Select an island first: click it in the UV Editor or on the model.', true); return; }
  const m = meshOf(S.st), faces = [...S.sel].flatMap(id => islandFaces(m, id));
  const groups = [...S.sel].map(id => { const f = islandFaces(m, id), b = bbox(S.st.uv, f); return { faces: f, pu: b.cu, pv: b.cv }; });
  const b = bbox(S.st.uv, faces);
  const start = pointer.inUV ? [pointer.x, pointer.y] : toScr(b.cu, b.cv).map((v, i) => v + (i ? 0 : 60));
  S.modal = { kind, base: cloneUV(S.st.uv), faces, groups, pu: b.cu, pv: b.cv, start: [...start], cur: [...start], axis: null, typed: '', ctrl: false };
  applyModal();
}
function applyModal() {
  const md = S.modal, st = S.st; if (!md) return;
  st.uv = cloneUV(md.base);
  const res = st.res[st.active], [pu, pv] = toScr(md.pu, md.pv), num = md.typed !== '' && md.typed !== '-' ? parseFloat(md.typed) : null;
  let readout = '';
  if (md.kind === 'G') {
    let du = (md.cur[0] - md.start[0]) / V.sc, dv = -(md.cur[1] - md.start[1]) / V.sc;
    if (num != null) { du = md.axis === 'Y' ? 0 : num / res; dv = md.axis === 'Y' ? num / res : 0; }
    if (md.axis === 'X') dv = 0; if (md.axis === 'Y') du = 0;
    if (md.ctrl) { const q = CHECKER / res; du = Math.round(du / q) * q; dv = Math.round(dv / q) * q; }
    translate(st.uv, md.faces, du, dv);
    readout = `D: ${Math.round(du * res)} px  ${Math.round(dv * res)} px${md.axis ? ` (${md.axis === 'X' ? 'U' : 'V'})` : ''}`;
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
  const m = meshOf(st), sel = [...S.sel], dens = sel.length === 1 ? `   ${px(islandDensityOf(st, sel[0]))}` : '';
  void m;
  const ro = $('#op-readout'); ro.hidden = false; ro.textContent = readout + dens + (md.typed ? `  [${md.typed}]` : '');
  uvDirty = true; updateUV3D(); renderIslandLists();
}
function endModal() { S.modal = null; $('#op-readout').hidden = true; uvDirty = true; buildOverlay(); }
function confirmModal() {
  const md = S.modal; if (!md) return;
  S.undo.push(JSON.stringify({ ...S.st, uv: md.base })); if (S.undo.length > 60) S.undo.shift(); S.redo = [];
  endModal(); changed(); reportSelection();
}
function cancelModal() { if (!S.modal) return; S.st.uv = S.modal.base; endModal(); updateUV3D(); renderProps(); msg('Cancelled.'); }
window.addEventListener('pointermove', e => {
  if (!S.modal) return;
  const r = uvc.getBoundingClientRect(); S.modal.cur = [e.clientX - r.left, e.clientY - r.top]; S.modal.ctrl = e.ctrlKey || e.metaKey; applyModal();
});
function reportSelection() {
  const m = meshOf(S.st), st = S.st;
  for (const id of S.sel) {
    const d = islandDensityOf(st, id), tg = targetOf(id);
    if (tg && !onTarget(d, tg)) { msg(tr('{name} has {a} px/m: it needs about {b} px/m.', { name: islName(m, id), a: Math.round(d), b: tg }), true); return; }
  }
  if (overlapsOf(st, st.active).length) { msg('Two islands overlap: they would share the same pixels.', true); return; }
  if (!isInside(st, st.active)) { msg('An island is outside the square: move it back in with G.', true); return; }
}

// ─── Operators ───────────────────────────────────────────────────────────────
function selectAll(on) { if (isLoupe() || sid() === 's2') return; S.sel = new Set(on ? islandsOf(S.st, S.st.active) : []); uvDirty = true; buildOverlay(); renderProps(); }
function opAverage() {
  if (sid() !== 'a2' && sid() !== 'a5') { msg('Average Islands Scale is used in the step Average and pack.', true); return; }
  pushUndo(); const m = meshOf(S.st); averageIslandsScale(m, S.st.uv, islandsOf(S.st, S.st.active)); S.st.flags.averaged = true;
  changed(); msg('Average Islands Scale: every island has the same density now.');
}
function opPack() {
  pushUndo(); const m = meshOf(S.st); pack(m, S.st.uv, islandsOf(S.st, S.st.active), MARGIN);
  changed(); msg(tr('Pack Islands: they fill the square. Density now {a} px/m.', { a: Math.round(densityOf(S.st, S.st.active)) }));
}
function opSetTD() {
  const st = S.st, o = st.active;
  if (!st.target) { msg('Choose the target first: Set TD needs a number to aim at.', true); return; }
  pushUndo();
  const fits = setTD(meshOf(st), st.uv, o, st.res[o], st.target);
  changed();
  if (!fits) msg(tr('{o}: at {r} px the islands no longer fit in the square. Choose a bigger texture and press Set TD again.', { o: objName(o), r: st.res[o] }), true);
  else if (wasted(st, o, st.target)) msg(tr('{o} reaches {t} px/m, but a smaller texture would too: this one wastes memory.', { o: objName(o), t: st.target }), true);
  else msg(tr('Set TD: {o} has {t} px/m.', { o: objName(o), t: st.target }));
}

// ─── Quizzes ─────────────────────────────────────────────────────────────────
function answerSee(obj) {
  const n = S.st.flags.quiz | 0; if (n >= SEE_QUIZ.length) return;
  pushUndo(); const r = answerQuiz(S.st, SEE_QUIZ, obj);
  if (r.ok) { msg(tr('✓ Right: the {o}.', { o: objName(obj) })); changed(); }
  else { S.undo.pop(); msg(tr('Not the {o}: compare the size of the squares again.', { o: objName(obj) }), true); }
}

// ─── Properties panel ────────────────────────────────────────────────────────
function statRow(label, value, cls = '') { return `<div class="sb-stat ${cls}"><span>${esc(t(label))}</span><b data-no-i18n>${esc(value)}</b></div>`; }
const resSelect = (attr, value, list = RES) => `<select ${attr}>${list.map(r => `<option value="${r}"${r === value ? ' selected' : ''}>${resLabel(r)}</option>`).join('')}</select>`;
function tdPanel({ resEdit = false, set = false, hide = false } = {}) {
  const st = S.st, o = st.active, d = densityOf(st, o), tg = st.target, m = meshOf(st);
  const sel = [...S.sel].filter(id => m.islands[id]?.obj === o);
  let h = `<div class="panel"><h4>Texel Density<small>Texel Density Checker</small></h4>
    ${statRow('Object', `${objName(o)} · ${OBJECTS[o].size}`)}
    ${resEdit ? `<label class="bl-row two"><span>${esc(t('Texture size'))}</span>${resSelect('id="td-res"', st.res[o])}</label>` : statRow('Texture size', resLabel(st.res[o]))}
    ${hide ? '' : statRow('Density', px(d), tg ? (onTarget(d, tg, 0.05) ? 'good' : 'bad') : '')}
    ${!hide && sel.length === 1 ? statRow(tr('Island: {name}', { name: islName(m, sel[0]) }), px(islandDensityOf(st, sel[0]))) : ''}
    ${tg ? statRow('Target', `${tg} px/m`) : ''}`;
  if (set) {
    h += `<button type="button" class="td-set" id="td-set" data-no-i18n>Set TD · ${tg} px/m</button>`;
    if (!isInside(st, o)) h += `<p class="td-note bad">${esc(t('The islands do not fit in the square: this texture is too small for the target.'))}</p>`;
    else if (onTarget(d, tg, 0.05) && wasted(st, o, tg)) h += `<p class="td-note bad">${esc(tr('A {r} px texture would reach the target too: this one wastes memory.', { r: minRes(o, tg) }))}</p>`;
    else if (onTarget(d, tg, 0.05)) h += `<p class="td-note good">${esc(t('✓ On target, with the smallest texture that reaches it.'))}</p>`;
  }
  return h + `<p class="td-note">${esc(tr('Checker: one square = {n} × {n} texels.', { n: CHECKER }))}</p></div>`;
}
function objectsPanel(hide = false) {
  const st = S.st, tg = st.target;
  return `<div class="panel"><h4>${esc(t('Objects'))}<small>${esc(t('click to edit'))}</small></h4><ul class="obj-list">${objectsOf(st.scene).map(o => {
    const d = densityOf(st, o), ok = tg ? onTarget(d, tg, 0.05) && isInside(st, o) && !wasted(st, o, tg) : null;
    return `<li data-obj="${o}" class="${o === st.active ? 'sel' : ''} ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"><i></i><span>${esc(objName(o))} <small data-no-i18n>${resLabel(st.res[o])}</small></span><b data-no-i18n>${hide ? '' : px(d)}</b></li>`;
  }).join('')}</ul></div>`;
}
function islandRows() {
  const st = S.st, m = meshOf(st), ids = islandsOf(st, st.active);
  return `<ul class="isl-list one">${ids.map(id => {
    const d = islandDensityOf(st, id), tg = targetOf(id), ok = tg ? onTarget(d, tg) : true;
    return `<li data-isl="${id}" class="${ok ? 'ok' : ''}${S.sel.has(id) ? ' sel' : ''}"><i></i>${esc(islName(m, id))}${tg && sid() === 'e1' ? `<small data-no-i18n>→ ${tg}</small>` : ''}<b data-no-i18n>${Math.round(d)}</b></li>`;
  }).join('')}</ul>`;
}
function islandsPanel() {
  const st = S.st, ov = overlapsOf(st, st.active).length, out = !isInside(st, st.active);
  let note = '';
  if (ov) note = `<p class="td-note bad">${esc(t('Two islands overlap: they would share the same pixels.'))}</p>`;
  else if (out) note = `<p class="td-note bad">${esc(t('An island is outside the square.'))}</p>`;
  if (sid() === 'e1') { const m = meshOf(st); note += S.sel.size === 1 ? `<p class="td-note">${esc(t(HERO_WHY[[...S.sel][0]] || ''))}</p>` : ''; void m; }
  if (sid() === 'a2') { const ds = islandsOf(st, st.active).map(id => islandDensityOf(st, id)); note += `<p class="td-note">${esc(tr('Highest ÷ lowest: {a}', { a: (Math.max(...ds) / Math.min(...ds)).toFixed(2) }))}</p>`; }
  return `<div class="panel"><h4>${esc(t('Islands'))}<small>px/m</small></h4><div id="island-rows">${islandRows()}</div>${note}</div>`;
}
function renderIslandLists() { const el = $('#island-rows'); if (el) el.innerHTML = islandRows(); }
function uvToolsPanel(tools) {
  return `<div class="panel"><h4>UV<small>${esc(t('selected object'))}</small></h4><div class="tool-grid" data-no-i18n>
    ${tools ? '<button type="button" data-op="average">Average Islands Scale <kbd>Ctrl A</kbd></button><button type="button" data-op="pack">Pack Islands</button>' : ''}
    <button type="button" data-op="all">Select All <kbd>A</kbd></button></div>${tools ? `<p class="td-note" data-no-i18n>Pack Islands · Margin ${MARGIN} · Rotate ✓</p>` : ''}</div>`;
}
function measurePanel() {
  const st = S.st, m = meshOf(st), i = st.flags.quiz | 0, id = [...S.sel][0] ?? 'crate.front', f = islandFaces(m, id), b = bbox(st.uv, f), rs = realSize(m, f), res = st.res.crate;
  const q = MEASURE[Math.min(i, MEASURE.length - 1)];
  return `<div class="panel"><h4>${esc(t('Measure'))}<small data-no-i18n>${esc(islName(m, id))}</small></h4>
    ${statRow('Texture size', `${res} px`)}${statRow('Island in UV', `${b.w.toFixed(3)} × ${b.h.toFixed(3)}`)}${statRow('Island on the image', `${Math.round(b.w * res)} × ${Math.round(b.h * res)} px`)}${statRow('Face in 3D', `${+rs.w.toFixed(3)} × ${+rs.h.toFixed(3)} m`)}
    <div class="formula" data-no-i18n>px/m = island px ÷ face m<br>= texture px × √(UV area ÷ 3D area)</div></div>
    <div class="panel quiz"><h4>${esc(t('Question'))}<small>${Math.min(i + 1, MEASURE.length)} / ${MEASURE.length}</small></h4>
    ${i < MEASURE.length ? `<p class="q">${esc(t(q.q))}</p><div class="answer-row"><input type="number" id="m-answer" min="0" step="1" inputmode="numeric" aria-label="px/m"><span>px/m</span><button type="button" id="m-check">${esc(t('Check'))}</button></div>` : `<p class="q done">${esc(t('✓ All three right.'))}</p>`}
    ${S.feedback ? `<p class="td-note ${S.feedback.ok ? 'good' : 'bad'}">${esc(S.feedback.text)}</p>` : ''}</div>`;
}
function islandInfoPanel() {
  const st = S.st, m = meshOf(st), fl = st.flags, res = st.res[st.active], id = [...S.sel][0];
  let h = `<div class="panel"><h4>${esc(t('The texture image'))}<small data-no-i18n>${res} × ${res} px</small></h4>
    <p class="td-note">${esc(t('The UV square from 0 to 1 is the whole image: 0 is one edge and 1 the other, whatever its size in pixels.'))}</p>`;
  if (id) {
    const f = islandFaces(m, id), b = bbox(st.uv, f), rs = realSize(m, f);
    h += `${statRow(tr('Island: {name}', { name: islName(m, id) }), '')}${statRow('Island in UV', `${b.w.toFixed(3)} × ${b.h.toFixed(3)}`)}${statRow('Island on the image', `${Math.round(b.w * res)} × ${Math.round(b.h * res)} px`)}${statRow('Face in 3D', `${+rs.w.toFixed(2)} × ${+rs.h.toFixed(2)} m`)}
      <div class="formula" data-no-i18n>${b.w.toFixed(3)} × ${res} px = ${Math.round(b.w * res)} px</div>`;
  } else h += `<p class="td-note">${esc(t('Click a face of the crate or an island.'))}</p>`;
  const n = Object.keys(fl).filter(k => k.startsWith('isl_')).length;
  return h + `<ul class="knob-ticks"><li class="${n >= 3 ? 'done' : ''}">${esc(tr('Three different islands ({n}/3)', { n: Math.min(3, n) }))}</li><li class="${fl.img_texture ? 'done' : ''}">${esc(t('Image: Texture'))}</li><li class="${fl.zoom_px ? 'done' : ''}">${esc(t('Zoom in until you see the pixels'))}</li></ul></div>`;
}
function knobsPanel() {
  const st = S.st, k = knobs(st), fl = st.flags;
  return `<div class="panel bl"><h4>${esc(t('Knobs'))}<small>${esc(t('one at a time'))}</small></h4>
    <label class="bl-row two"><span>${esc(t('Texture size'))}</span>${resSelect('id="k-res"', st.res.crate, [512, 1024, 2048, 4096])}</label>
    <label class="bl-row two"><span data-no-i18n>Scale</span><select id="k-scale">${[0.25, 0.5, 1, 1.5, 2].map(v => `<option value="${v}"${v === st.scale.crate ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    ${statRow('Density', px(k.density), onTarget(k.density, 512, 0.05) ? 'good' : 'bad')}${statRow('Target', '512 px/m')}
    <button type="button" class="td-set" id="k-reset">${esc(t('Back to start'))}</button>
    <ul class="knob-ticks"><li class="${fl.knob_res ? 'done' : ''}">${esc(t('A bigger texture'))}</li><li class="${fl.knob_uv ? 'done' : ''}">${esc(t('Bigger UV islands'))}</li><li class="${fl.knob_scale ? 'done' : ''}">${esc(t('A smaller object'))}</li></ul></div>`;
}
function cameraPanel() {
  const st = S.st, c = CAMERAS[st.cam], sd = screenDensity(c.d), ratio = st.camTarget / sd;
  return `<div class="panel"><h4>${esc(t('Camera'))}<small data-no-i18n>${SCREEN.w} × ${SCREEN.h} · FOV ${SCREEN.fov}°</small></h4>
    <div class="cam-grid">${Object.entries(CAMERAS).map(([k, v]) => `<button type="button" data-cam="${k}" aria-pressed="${k === st.cam}" class="${st.flags['cam_' + k] ? 'done' : ''}"><span>${esc(t(v.name))} · ${v.d} m</span></button>`).join('')}</div>
    ${statRow('1 m of wall on screen', `${Math.round(sd)} px`)}
    <label class="bl-row two"><span>${esc(t('Target'))}</span><select id="cam-target">${TARGETS.map(v => `<option value="${v}"${v === st.camTarget ? ' selected' : ''}>${v} px/m</option>`).join('')}</select></label>
    ${statRow('Texels per screen pixel', ratio.toFixed(2), ratio >= 0.97 && ratio < 2 ? 'good' : 'bad')}
    <p class="td-note">${esc(t('Choose the smallest target with at least one texel per screen pixel.'))}</p></div>`;
}
const num = v => String(+(+v).toFixed(2));
function gamePanel() {
  const st = S.st, c = camFor(st), sc = screenOf(c), sd = camDensity(c), ratio = st.camTarget / sd, cu = st.custom || { h: 1080, fov: 70, d: 2 };
  const btn = (k, v) => `<button type="button" data-cam="${k}" aria-pressed="${k === st.cam}" class="${st.flags['cam_' + k] ? 'done' : ''}"><span>${esc(t(v.name))}</span><small data-no-i18n>${v.h} px · ${v.fov}° · ${v.d} m</small></button>`;
  const field = (k, label, step) => `<label class="bl-row two"><span data-no-i18n>${label}</span><input type="number" data-custom="${k}" value="${cu[k]}" min="${step}" step="${step}"${st.cam === 'custom' ? '' : ' disabled'}></label>`;
  return `<div class="panel"><h4>${esc(t('Game type'))}<small>${esc(t('example numbers'))}</small></h4>
    <div class="cam-grid game-grid">${Object.entries(GAMES).map(([k, v]) => btn(k, v)).join('')}<button type="button" data-cam="custom" aria-pressed="${st.cam === 'custom'}"><span>${esc(t('Your game'))}</span></button></div>
    ${field('h', 'H (px)', 1)}${field('fov', 'FOV (°)', 1)}${field('d', 'd (m)', 0.05)}</div>
    <div class="panel"><h4>${esc(t('The calculation'))}</h4>
    <p class="formula" data-no-i18n>H ÷ (2 × d × tan(FOV ÷ 2))<br>= ${sc.h} ÷ (2 × ${num(c.d)} × tan ${num(sc.fov / 2)}°)<br>= <b>${Math.round(sd)} px</b> ${esc(t('for 1 m on screen'))}</p>
    <label class="bl-row two"><span>${esc(t('Target'))}</span><select id="cam-target">${TARGETS.map(v => `<option value="${v}"${v === st.camTarget ? ' selected' : ''}>${v} px/m</option>`).join('')}</select></label>
    ${statRow('Texels per screen pixel', ratio.toFixed(2), ratio >= 0.97 && ratio < 2 ? 'good' : 'bad')}
    <p class="td-note">${esc(t('Choose the smallest target with at least one texel per screen pixel.'))}</p></div>`;
}
function budgetPanel() {
  const st = S.st, s = sceneStats(st, 512);
  const rows = objectsOf(st.scene).map(o => { const p = s.per[o]; return `<label class="bl-row budget${o === st.active ? ' focus' : ''}"><span>${esc(objName(o))}</span>${resSelect(`data-bres="${o}"`, st.res[o])}<em class="${p.low ? 'bad' : p.waste ? 'bad' : 'good'}" data-no-i18n>${Math.round(p.d)}</em></label>`; }).join('');
  const table = [256, 512, 1024].map(tg => `<tr class="${tg === 512 ? 'cur' : ''}"><td>${tg} px/m</td><td>${memoryFor(st.scene, tg).toFixed(0)} MB</td><td>× ${(memoryFor(st.scene, tg) / memoryFor(st.scene, 512)).toFixed(2).replace(/\.00$/, '')}</td></tr>`).join('');
  const low = objectsOf(st.scene).filter(o => s.per[o].low), waste = objectsOf(st.scene).filter(o => s.per[o].waste);
  return `<div class="panel"><h4>${esc(t('Budget'))}<small>512 px/m · ${BUDGET_MB} MB</small></h4>${rows}
    <p class="td-note">${esc(t('The numbers on the right are px/m. Red: below 512 px/m, or a texture bigger than needed.'))}</p>
    ${statRow('Texture memory', `${s.mb.toFixed(0)} / ${BUDGET_MB} MB`, s.mb <= BUDGET_MB ? 'good' : 'bad')}
    ${low.length ? `<p class="td-note bad">${esc(tr('Too blurry: {o}.', { o: low.map(objName).join(', ') }))}</p>` : ''}${waste.length ? `<p class="td-note bad">${esc(tr('Bigger than needed: {o}.', { o: waste.map(objName).join(', ') }))}</p>` : ''}
    <table class="mem-table"><thead><tr><th>${esc(t('Target'))}</th><th>${esc(t('Memory'))}</th><th></th></tr></thead><tbody>${table}</tbody></table>
    <p class="td-note">${esc(t('With the smallest texture for each prop. Colour, normal and roughness maps, block-compressed, with mipmaps.'))}</p></div>`;
}
function quizPanel(list, answers) {
  const i = S.st.flags.quiz | 0, done = i >= list.length;
  return `<div class="panel quiz"><h4>${esc(t(answers ? 'Case' : 'Question'))}<small>${Math.min(i + 1, list.length)} / ${list.length}</small></h4>
    ${done ? `<p class="q done">${esc(t('✓ All right.'))}</p>` : `<p class="q">${esc(t(list[i].q))}</p>`}
    ${answers && !done ? `<div class="rule-grid">${[['higher', 'Higher'], ['same', 'Same'], ['lower', 'Lower']].map(([k, n]) => `<button type="button" data-rule="${k}">${esc(t(n))}</button>`).join('')}</div>` : ''}
    ${S.feedback ? `<p class="td-note ${S.feedback.ok ? 'good' : 'bad'}">${esc(S.feedback.text)}</p>` : ''}</div>`;
}
function referencePanel() {
  return `<div class="panel"><h4>${esc(t('Reference values'))}<small>${esc(t('starting point'))}</small></h4>
    <table class="mem-table ref-table"><thead><tr><th>${esc(t('Game type'))}</th><th>px/m</th></tr></thead><tbody>${REFERENCE.map(r => `<tr><td>${esc(t(r.game))}</td><td data-no-i18n>${r.v}</td></tr>`).join('')}</tbody></table>
    <p class="td-note">${esc(t('Little memory (phones, handhelds): one step down. Hero assets up, hidden faces down.'))}</p></div>`;
}
function targetQuizPanel() {
  const i = S.st.flags.quiz | 0, done = i >= TARGET_CASES.length;
  return `<div class="panel quiz"><h4>${esc(t('Case'))}<small>${Math.min(i + 1, TARGET_CASES.length)} / ${TARGET_CASES.length}</small></h4>
    ${done ? `<p class="q done">${esc(t('✓ All right.'))}</p>` : `<p class="q">${esc(t(TARGET_CASES[i].q))}</p><div class="rule-grid tq-grid" data-no-i18n>${TARGET_OPTIONS.map(v => `<button type="button" data-tq="${v}">${v}</button>`).join('')}</div>`}
    ${S.feedback ? `<p class="td-note ${S.feedback.ok ? 'good' : 'bad'}">${esc(S.feedback.text)}</p>` : ''}</div>`;
}
function recipePanel() {
  const st = S.st, r = recipe(st), tg = RECIPE_TARGET, est = textureEstimate('cabinet', tg), d = densityOf(st, 'cabinet');
  const li = (ok, n, title, body) => `<li class="${ok ? 'done' : ''}"><b>${n}</b><div><strong>${esc(t(title))}</strong>${body}</div></li>`;
  const tsel = `<select id="r-target"><option value=""${st.target ? '' : ' selected'}>—</option>${[256, 512, 1024].map(v => `<option value="${v}"${v === st.target ? ' selected' : ''}>${v} px/m</option>`).join('')}</select>`;
  return `<div class="panel"><h4>${esc(t('Recipe'))}<small>${esc(objName('cabinet'))}</small></h4><ol class="recipe">
    ${li(r.target, 1, 'Target from the art bible', `<p class="td-note">${esc(t('Art bible: third-person game, 512 px/m.'))}</p>${tsel}${st.target && !r.target ? `<p class="td-note bad">${esc(t('The art bible says 512 px/m.'))}</p>` : ''}`)}
    ${li(r.applied, 2, 'Apply the scale', `<p class="td-note" data-no-i18n>Scale ${r.applied ? '1.000 · 1.000 · 1.000' : '1.500 · 1.500 · 1.500'} · ${OBJECTS.cabinet.size}</p><button type="button" class="td-set" data-op="apply"${r.applied ? ' disabled' : ''}><span data-no-i18n>Apply › Scale</span> <kbd>Ctrl A</kbd></button>`)}
    ${li(r.average && !overlapsOf(st, 'cabinet').length, 3, 'Same density on every island, then pack', `<div class="tool-grid" data-no-i18n><button type="button" data-op="average">Average Islands Scale</button><button type="button" data-op="pack">Pack Islands</button></div>${overlapsOf(st, 'cabinet').length ? `<p class="td-note bad">${esc(t('Two islands overlap: they would share the same pixels.'))}</p>` : ''}`)}
    ${li(r.size, 4, 'Texture size', `<p class="formula" data-no-i18n>${tg} × √(${est.a3.toFixed(1)} m² ÷ 0.7) ≈ ${Math.round(est.px)} px → ${est.res}</p><label class="bl-row two"><span>${esc(t('Texture size'))}</span>${resSelect('id="td-res"', st.res.cabinet)}</label>`)}
    ${li(r.td, 5, 'Scale the islands to the target', `<button type="button" class="td-set" id="td-set"${st.target ? '' : ' disabled'}><span data-no-i18n>Set TD${st.target ? ` · ${st.target} px/m` : ''}</span></button>${statRow('Density', px(d), r.td ? 'good' : 'bad')}${!isInside(st, 'cabinet') ? `<p class="td-note bad">${esc(t('The islands do not fit in the square: this texture is too small for the target.'))}</p>` : ''}`)}
    ${li(r.checker, 6, 'Check with the checker', `<p class="td-note">${esc(t('3D Viewport header: Shading › Checker. Same squares on every side?'))}</p>`)}
  </ol></div>`;
}
function cutsPanel() {
  const st = S.st, r = cutReport(st), rows = r.rows.map((x, i) => ({ ...x, i })).reverse();
  const zoneSel = (i, z) => `<select data-zone="${i}">${Object.entries(SHEET.zones).map(([k, v]) => `<option value="${k}"${k === z ? ' selected' : ''}>${esc(t(v.name))}</option>`).join('')}</select>`;
  const cuts = (st.cuts || []).map((y, i) => `<label class="bl-row cut-row"><span>${esc(tr('Cut {n}', { n: i + 1 }))}</span><input type="number" data-cut="${i}" value="${y}" step="0.05" min="0.05" max="1.95"><em data-no-i18n>m</em><button type="button" class="cut-del" data-op="delcut" data-i="${i}" aria-label="${esc(t('Remove'))}">×</button></label>`).join('');
  const notes = [!S.wire ? 'Turn on Wireframe in the 3D header to see the faces.' : '', !r.base ? 'The bottom strip must go to the Baseboard zone.' : '', !r.cornice ? 'The top strip must go to the Cornice zone.' : '', r.rows.some(x => !x.ok) ? 'Red strips are stretched: their height does not match the height of their zone.' : ''].filter(Boolean);
  return `<div class="panel"><h4>${esc(t('Loop cuts'))}<small data-no-i18n>${r.cuts}</small></h4>
    <button type="button" class="td-set" data-op="addcut"><span data-no-i18n>Loop Cut</span> <kbd>Ctrl R</kbd></button>${cuts}
    <p class="td-note">${esc(t('Heights from the floor, in metres. The wall is 2 m high.'))}</p></div>
    <div class="panel"><h4>${esc(t('Strips'))}<small>${esc(t('top to bottom'))}</small></h4>
    ${rows.map(x => `<div class="strip-row ${x.ok ? 'good' : 'bad'}"><span><b>${esc(t('Strip ' + (x.i + 1)))}</b><small data-no-i18n>${x.h.toFixed(2)} m</small></span>${zoneSel(x.i, x.zone)}<em data-no-i18n>${Math.round(x.du)} × ${Math.round(x.dv)}</em></div>`).join('')}
    <p class="td-note">${esc(t('px/m across × up, on the 1K trim sheet. Target: 512 × 512.'))}</p>
    ${notes.map(n => `<p class="td-note bad">${esc(t(n))}</p>`).join('')}</div>`;
}
function renderProps() {
  const st = S.st, id = sid(); let h = '';
  const multi = objectsOf(st.scene).length > 1;
  if (id === 's0' || id === 's1') h += tdPanel() + objectsPanel();
  else if (id === 's2') h += quizPanel(SEE_QUIZ) + tdPanel({ hide: true });
  else if (id === 'm0') h += islandInfoPanel();
  else if (id === 'm1') h += measurePanel();
  else if (id === 'm2') h += knobsPanel() + islandsPanel() + uvToolsPanel(false);
  else if (id === 'a1') h += tdPanel() + islandsPanel() + uvToolsPanel(false);
  else if (id === 'a2') h += tdPanel() + islandsPanel() + uvToolsPanel(true);
  else if (id === 'a3') h += tdPanel({ resEdit: true, set: true }) + objectsPanel();
  else if (id === 'a4') h += cutsPanel();
  else if (id === 'c0') h += targetQuizPanel() + referencePanel();
  else if (id === 'a5') h += recipePanel() + islandsPanel();
  else if (id === 'c1') h += cameraPanel();
  else if (id === 'g1') h += gamePanel();
  else if (id === 'c2') h += budgetPanel() + objectsPanel();
  else if (id === 'e1') h += islandsPanel() + tdPanel() + uvToolsPanel(false);
  else if (id === 'e2') h += quizPanel(RULES, true) + (multi ? objectsPanel() : '');
  $('#props').innerHTML = h;
}
$('#props').addEventListener('click', e => {
  const b = e.target.closest('button, li[data-isl], li[data-obj]'); if (!b) return;
  const d = b.dataset, st = S.st;
  if (d.tq) {
    pushUndo(); const r = answerQuiz(st, TARGET_CASES, +d.tq);
    S.feedback = { ok: r.ok, text: r.ok ? '✓ ' + t(r.item.why) : '✗ ' + t('Not that one. Think about how close the camera gets, the screen and the memory.') };
    if (!r.ok) S.undo.pop();
    changed(); return;
  }
  if (d.op === 'apply') { pushUndo(); st.flags.applied = true; changed(); msg('Scale applied: the size stays the same, but now the mesh itself measures it and the tools read the real metres.'); return; }
  if (d.op === 'addcut') { pushUndo(); addCut(st); changed(); msg('Loop cut added: type its height, then choose the zone of each strip.'); }
  else if (d.op === 'delcut') { pushUndo(); const i = +d.i; st.cuts.splice(i, 1); st.zones.splice(i + 1, 1); syncCuts(st); changed(); }
  else if (d.op === 'average') opAverage();
  else if (d.op === 'pack') opPack();
  else if (d.op === 'all') selectAll(true);
  else if (d.isl) pick(d.isl, e.shiftKey);
  else if (d.obj) { if (st.active !== d.obj) { st.active = d.obj; S.sel.clear(); if (st.view === 'checker') st.flags['sel_' + d.obj] = true; changed(); } }
  else if (b.id === 'td-set') opSetTD();
  else if (b.id === 'm-check') submitMeasure();
  else if (b.id === 'k-reset') { pushUndo(); resetKnobs(st); S.sel.clear(); changed(); msg('Back to the start: 256 px/m. Turn another knob.'); }
  else if (d.cam) { pushUndo(); st.cam = d.cam; frame(); changed(); }
  else if (d.rule) {
    pushUndo(); const r = answerQuiz(st, RULES, d.rule);
    S.feedback = { ok: r.ok, text: (r.ok ? '✓ ' : '✗ ') + t(r.item.why) };
    if (!r.ok) S.undo.pop();
    changed();
  }
});
$('#props').addEventListener('keydown', e => { if (e.target.id === 'm-answer' && e.key === 'Enter') { submitMeasure(); e.preventDefault(); } });
function submitMeasure() {
  const v = parseFloat($('#m-answer')?.value); if (!Number.isFinite(v)) { msg('Type a number first.', true); return; }
  pushUndo(); const r = answerMeasure(S.st, v);
  S.feedback = r.ok ? { ok: true, text: tr('✓ Right: {a} px/m.', { a: r.answer }) } : { ok: false, text: t('Not quite: divide the pixels of the island by the metres of the face.') };
  if (!r.ok) S.undo.pop();
  S.sel = new Set(['crate.front']); changed(); if (r.ok) setTimeout(() => $('#m-answer')?.focus(), 0);
}
$('#props').addEventListener('change', e => {
  const el = e.target, st = S.st;
  if (el.id === 'td-res') { pushUndo(); st.res[st.active] = +el.value; changed(); }
  else if (el.id === 'r-target') { pushUndo(); st.target = el.value ? +el.value : null; changed(); }
  else if (el.id === 'k-res') { pushUndo(); st.res.crate = +el.value; changed(); }
  else if (el.id === 'k-scale') { pushUndo(); st.scale.crate = +el.value; changed(); }
  else if (el.id === 'cam-target') { pushUndo(); st.camTarget = +el.value; changed(); }
  else if (el.dataset.cut != null) { const v = parseFloat(el.value); if (!Number.isFinite(v)) return; pushUndo(); st.cuts[+el.dataset.cut] = Math.min(1.95, Math.max(0.05, Math.round(v * 1000) / 1000)); st.cuts.sort((a, b) => a - b); syncCuts(st); changed(); }
  else if (el.dataset.zone != null) { pushUndo(); st.zones[+el.dataset.zone] = el.value; syncCuts(st); changed(); }
  else if (el.dataset.custom) { const v = parseFloat(el.value), lim = { h: [100, 8000], fov: [10, 150], d: [0.1, 100] }[el.dataset.custom]; if (!Number.isFinite(v)) return; pushUndo(); st.custom = { ...(st.custom || { h: 1080, fov: 70, d: 2 }), [el.dataset.custom]: Math.min(lim[1], Math.max(lim[0], v)) }; frame(); changed(); }
  else if (el.dataset.bres) { pushUndo(); st.res[el.dataset.bres] = +el.value; st.active = el.dataset.bres; changed(); }
});

// ─── Headers ─────────────────────────────────────────────────────────────────
$('#shading').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if (!b || isLoupe()) return;
  pushUndo(); S.st.view = b.dataset.view; if (S.st.view === 'checker') S.st.flags.seen_checker = true; changed();
});
$('#pivot').addEventListener('change', e => { S.pivot = e.target.value; });
$('#wire-btn').addEventListener('click', () => { S.wire = !S.wire; store.set('wire', S.wire); build3D(); renderHeaders(); renderProps(); });
$('#ruler-btn').addEventListener('click', () => { pushUndo(); S.st.ruler = !S.st.ruler; changed(); if (S.st.ruler && S.sel.size !== 1) msg('Click a face or an island to lay the ruler on it.'); });
$('#uv-image').addEventListener('click', e => {
  const b = e.target.closest('[data-img]'); if (!b) return;
  pushUndo(); S.st.uvImage = b.dataset.img; if (b.dataset.img === 'texture') S.st.flags.img_texture = true;
  changed(); if (b.dataset.img === 'texture') msg('The texture image: each island paints its faces with the pixels it covers. Grey pixels are not used by any face.');
});
function renderHeaders() {
  const st = S.st, loupe = isLoupe();
  $('#shading').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.view === (loupe ? 'texture' : st.view))); b.disabled = loupe && b.dataset.view === 'checker'; });
  $('#pivot-field').hidden = !canEdit();
  $('#ruler-btn').setAttribute('aria-pressed', String(!!st.ruler)); $('#ruler-btn').hidden = loupe || sid() === 's2';
  $('#uv-image').hidden = loupe;
  $('#uv-image').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.img === (st.uvImage || 'checker'))));
  $('#pivot').value = S.pivot;
  $('#wire-btn').setAttribute('aria-pressed', String(S.wire));
  $('#uv-title').textContent = loupe ? 'Pixel loupe' : 'UV Editor';
  const badge = $('#obj-badge'); badge.hidden = loupe; badge.textContent = loupe ? '' : `${objName(st.active)} · ${resLabel(st.res[st.active])}`;
  $('#uv-hint').hidden = loupe;
}

// ─── Undo, storage, steps ────────────────────────────────────────────────────
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) { msg('Nothing to undo.'); return; } S.redo.push(JSON.stringify(S.st)); const prev = S.st; S.st = JSON.parse(S.undo.pop()); if (prev.cam !== S.st.cam) frame(); changed(); msg('Undo.'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo.'); }
const dataKey = () => `step:${stage().id}-${step().id}`;
function saveData() { store.set(dataKey(), S.st); }
function loadData() {
  const saved = store.get(dataKey(), null), fresh = startState(step());
  const ok = saved && typeof saved === 'object' && saved.scene === fresh.scene && Array.isArray(saved.uv) && saved.uv.length === fresh.uv.length && saved.res && objectsOf(fresh.scene).every(o => saved.res[o]);
  const okCut = saved && fresh.scene === 'cutwall' && saved.scene === 'cutwall' && Array.isArray(saved.cuts);
  S.st = ok || okCut ? syncCuts({ ...fresh, ...saved, flags: { ...saved.flags } }) : fresh;
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
    <div><span class="control-label">${esc(t('HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); S.sel.clear(); S.feedback = null; frame(); changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st); if (isLoupe()) frame(); changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
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
// Step hooks that run after every change.
function stepHooks() {
  const st = S.st;
  if (sid() === 'm2') { const k = updateKnobs(st); if (k) msg(tr('✓ 512 px/m with {k}. Press Back to start and turn another knob.', { k: t({ res: 'a bigger texture', uv: 'bigger UV islands', scale: 'a smaller object' }[k]) })); }
  if (isLoupe()) camAnswer(st);
}
function changed(save = true) {
  const st = S.st;
  if (!objectsOf(st.scene).includes(st.active)) st.active = objectsOf(st.scene)[0];
  for (const id of [...S.sel]) if (!meshOf(st).islands[id] || meshOf(st).islands[id].obj !== st.active) S.sel.delete(id);
  syncCuts(st); stepHooks();
  if (save) saveData();
  build3D(); renderHeaders(); renderProps(); uvDirty = true; checkProgress();
}
function enterStep() {
  loadData(); S.undo = []; S.redo = []; S.sel.clear(); S.modal = null; S.feedback = null;
  if (sid() === 'm1' || sid() === 'm0') S.sel.add('crate.front');
  lastOk = null; lastCard = ''; lastOk = stepDone(S.step);
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  renderStageSwitch(); frame(); fitUV(); changed(false);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); renderProps(); renderHeaders(); buildLabels(); uvDirty = true; checkProgress(); });

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
  else if (ctrl && low === 'a') { opAverage(); e.preventDefault(); }
  else if (ctrl && low === 'r' && sid() === 'a4') { pushUndo(); addCut(S.st); changed(); e.preventDefault(); }
  else if (ctrl) return;
  else if (low === 'g') { startModal('G'); e.preventDefault(); }
  else if (low === 's') { startModal('S'); e.preventDefault(); }
  else if (low === 'r') { startModal('R'); e.preventDefault(); }
  else if (low === 'a') { selectAll(!e.altKey); e.preventDefault(); }
  else if (e.key === 'Home') { fitUV(); frame(); e.preventDefault(); }
});
document.addEventListener('keyup', e => { if (S.modal && (e.key === 'Control' || e.key === 'Meta')) { S.modal.ctrl = false; applyModal(); } });
canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (S.modal) cancelModal(); });

// ─── Start ───────────────────────────────────────────────────────────────────
resizeUV(); resize3D(); enterStep();
// For tests and debugging.
window.__td = { S, STAGES, dbgRuler: () => ({ has: !!rulerObj, parent: !!rulerObj?.parent, n: rulerObj?.geometry.attributes.position.count, box: rulerObj ? new THREE.Box3().setFromObject(rulerObj).min.toArray().concat(new THREE.Box3().setFromObject(rulerObj).max.toArray()) : null }), pick: id => pick(id, false), solve: () => { step().solve(S.st); changed(); }, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, select: ids => { S.sel = new Set(ids); changed(false); }, toScr, V, densityOf: o => densityOf(S.st, o), areas, packedDensity1, rightTarget };
