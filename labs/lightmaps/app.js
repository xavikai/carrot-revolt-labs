// Lightmap Lab: a Unity-style scene view, a lightmap / UV / top view and an Inspector.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { SUN, SKY, skyL, OBJECTS, OBJECT_NAMES, FACES, createBake, pack, noiseLevel, estimateRays, lightmapMB, PROP, PROP_FACES, propLayout, bakeProp, propLightmapSize, marginTexels, PATH, AMBIENT_PROBE, blendProbes, apvProbes, fbxReport, WINDOW, sceneBoxes, ALBEDO } from './lightmap.js?v=1';
import { STAGES, startState, bakeKey, isBaked, packOf, probeList, probeReport, answerQuiz, MODE_QUIZ, MODE_OPTS, lmFor } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-lm:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-lm:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = { stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [], done: store.get('done', {}), baking: null, lm: null, play: null, feedback: null, reflTex: null };
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step], sid = () => step().id;
let msgTimer;
function msg(text, warning = false) { const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning); clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 7000); }

// ─── Renderer and scene ──────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.7;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas); controls.addEventListener('change', () => { dirty = true; });
let dirty = true;
function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
new ResizeObserver(resize).observe(host);
// Sky
const skyGeo = new THREE.SphereGeometry(80, 32, 16);
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color(...SKY.top) }, hor: { value: new THREE.Color(...SKY.horizon) }, gnd: { value: new THREE.Color(...SKY.ground) } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top, hor, gnd; varying vec3 vD; void main(){ float y = vD.y; vec3 c = y >= 0. ? mix(hor, top, sqrt(y)) : gnd; gl_FragColor = vec4(c * 1.1, 1.); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
const sky = new THREE.Mesh(skyGeo, skyMat); scene.add(sky);
const world = new THREE.Group(); scene.add(world);

// One shader for every surface: lightmap (or probe light) + real-time sun with analytic shadows.
const MAX_BOX = 24;
const litUniforms = () => ({
  lm: { value: null }, useLM: { value: 0 }, albedo: { value: new THREE.Color(1, 1, 1) }, amb: { value: new THREE.Vector3(0.3, 0.3, 0.3) },
  sunDir: { value: new THREE.Vector3(...SUN.dir) }, sunE: { value: new THREE.Vector3(...SUN.color.map(c => c * SUN.E)) }, sunRT: { value: 0 }, sunProbe: { value: 0 },
  boxMin: { value: Array.from({ length: MAX_BOX }, () => new THREE.Vector3()) }, boxMax: { value: Array.from({ length: MAX_BOX }, () => new THREE.Vector3()) }, nBox: { value: 0 },
  charPos: { value: new THREE.Vector3(0, -10, 0) }, charOn: { value: 0 }, subtractive: { value: 0 }, mode: { value: 0 }, lmSize: { value: new THREE.Vector2(1, 1) }, isChar: { value: 0 },
});
const VERT = `attribute vec2 uv2m; varying vec2 vUv2; varying vec3 vN; varying vec3 vP;
void main(){ vUv2 = uv2m; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FRAG = `uniform sampler2D lm; uniform float useLM; uniform vec3 albedo; uniform vec3 amb; uniform vec3 sunDir; uniform vec3 sunE; uniform float sunRT; uniform float sunProbe;
uniform vec3 boxMin[${MAX_BOX}]; uniform vec3 boxMax[${MAX_BOX}]; uniform int nBox; uniform vec3 charPos; uniform float charOn; uniform float subtractive; uniform float mode; uniform vec2 lmSize; uniform float isChar;
varying vec2 vUv2; varying vec3 vN; varying vec3 vP;
bool hitBox(vec3 o, vec3 d, vec3 mn, vec3 mx){ vec3 inv = 1.0 / d; vec3 t0 = (mn - o) * inv, t1 = (mx - o) * inv; vec3 a = min(t0, t1), b = max(t0, t1); float tn = max(max(a.x, a.y), a.z), tf = min(min(b.x, b.y), b.z); return tf > max(tn, 1e-3); }
bool hitChar(vec3 o, vec3 d){ vec3 c = charPos; vec3 oc = o - c; oc.y = clamp(oc.y, -0.55, 0.55) == oc.y ? 0. : oc.y - sign(oc.y) * 0.55; float b = dot(oc, d), cc = dot(oc, oc) - 0.09; float h = b * b - cc; if (h < 0.) return false; float tt = -b - sqrt(h); return tt > 1e-3; }
float charShadow(vec3 p){ if (charOn < 0.5 || isChar > 0.5) return 1.; for (int s = 0; s < 6; s++){ vec3 c = charPos + vec3(0., -0.55 + 0.22 * float(s), 0.); vec3 oc = p - c; float b = dot(oc, sunDir), cc = dot(oc, oc) - 0.09; float h = b * b - cc; if (h > 0. && -b - sqrt(h) > 1e-3) return 0.; } return 1.; }
float sunVis(vec3 p){ for (int i = 0; i < ${MAX_BOX}; i++){ if (i >= nBox) break; if (hitBox(p, sunDir, boxMin[i], boxMax[i])) return 0.; } return 1.; }
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 p = vP + n * 0.003;
  vec3 E = useLM > 0.5 ? texture2D(lm, vUv2).rgb : amb;
  float ndl = max(dot(n, sunDir), 0.);
  if (sunRT > 0.5) E += sunE * ndl * sunVis(p) * charShadow(p);
  if (sunProbe > 0.) E += sunE * sunProbe * (0.5 + 0.5 * ndl);
  if (subtractive > 0.5 && charShadow(p) < 0.5 && ndl > 0.) E *= 0.55;
  vec3 col = albedo * E / 3.14159;
  if (mode > 0.5 && mode < 1.5) col = E / 3.14159 * 0.8;                  // Baked Lightmap view
  if (mode > 1.5 && useLM > 0.5) { vec2 q = floor(vUv2 * lmSize); float c = mod(q.x + q.y, 2.); col = mix(vec3(.25), vec3(.85), c) * (0.6 + 0.4 * E / 3.14159); }
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function litMaterial(albedo) { const m = new THREE.ShaderMaterial({ uniforms: litUniforms(), vertexShader: VERT, fragmentShader: FRAG }); m.uniforms.albedo.value.setRGB(...albedo); return m; }
// A rectangle face as a mesh with its lightmap UVs (uv2m).
function faceMesh(f, uvRect, mat) {
  const g = new THREE.BufferGeometry(), c = [[0, 0], [1, 0], [1, 1], [0, 1]], pos = [], uv = [];
  for (const [a, b] of c) { const p = [0, 1, 2].map(i => f.o[i] + f.u[i] * a * f.w + f.v[i] * b * f.h); pos.push(...p); uv.push(uvRect[0] + (uvRect[2] - uvRect[0]) * a, uvRect[1] + (uvRect[3] - uvRect[1]) * b); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv2m', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// ─── Build the scene for the current step ────────────────────────────────────
let meshes = [], charMesh = null, ball = null, lmTex = null, doorGroup = null, probeDots = null, reflBox = null;
function clearWorld() { for (const o of [...world.children]) { world.remove(o); o.traverse?.(c => { c.geometry?.dispose?.(); }); } meshes = []; charMesh = null; ball = null; doorGroup = null; probeDots = null; reflBox = null; }
function boxesFor(st) {
  if (st.scene === 'prop') return [{ mn: PROP.mn, mx: PROP.mx }];
  const out = []; for (const [name, o] of Object.entries(OBJECTS)) { if (name === 'Door' && S.play && st.renderers.Door.contribute === false) continue; for (const b of o.boxes) out.push({ mn: b[0], mx: b[1] }); }
  return out;
}
function setBoxes(mat, boxes) { const u = mat.uniforms; boxes.slice(0, MAX_BOX).forEach((b, i) => { u.boxMin.value[i].set(...b.mn); u.boxMax.value[i].set(...b.mx); }); u.nBox.value = Math.min(MAX_BOX, boxes.length); }
function build() {
  clearWorld(); const st = S.st, lm = S.lm, baked = isBaked(st) && lm;
  if (st.scene === 'prop') {
    const L = baked ? lm.layout : propLayout(st.uvChannel, st.margin);
    PROP_FACES.forEach((f, k) => { const m = litMaterial(f.albedo); const mesh = faceMesh(f, L[k], m); mesh.userData.lm = true; world.add(mesh); meshes.push(mesh); });
    const gm = litMaterial([0.42, 0.42, 0.4]), ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), gm); ground.geometry.setAttribute('uv2m', new THREE.Float32BufferAttribute(new Float32Array(8), 2)); ground.userData.dyn = 'ground'; world.add(ground); meshes.push(ground);
    if (st.fbxView) { const r = fbxReport(st.fbx), grp = new THREE.Group(); for (const m of meshes.filter(x => x.userData.lm)) { world.remove(m); grp.add(m); } if (r.includes('size100')) grp.scale.setScalar(2.2); else if (r.includes('scale')) grp.scale.setScalar(1.6); if (r.includes('rot90')) grp.rotation.x = -Math.PI / 2; if (r.includes('axes')) grp.rotation.z = Math.PI / 2; world.add(grp); }
  } else {
    for (const [name, o] of Object.entries(OBJECTS)) {
      const r = st.renderers[name], useLM = r.contribute && r.receive === 'lightmaps';
      const grp = new THREE.Group(); grp.userData.name = name;
      for (const f of o.faces) {
        const c = baked && useLM ? lm.pack.charts[f.id] : null, S0 = baked ? lm.pack.size : 1, H = baked ? lm.pack.pages * S0 : 1;
        const rect = c ? [(c.x) / S0, (c.page * S0 + c.y) / H, (c.x + c.cw) / S0, (c.page * S0 + c.y + c.ch) / H] : [0, 0, 1, 1];
        const m = litMaterial(f.albedo), mesh = faceMesh(f, rect, m); mesh.userData.lm = !!c; mesh.userData.obj = name; grp.add(mesh); meshes.push(mesh);
      }
      if (name === 'Door') { doorGroup = grp; }
      world.add(grp);
    }
    // the character (a capsule) and, in the last step, a metal ball
    const cm = litMaterial(ALBEDO.character); cm.uniforms.isChar.value = 1;
    charMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 6, 16), cm); charMesh.geometry.setAttribute('uv2m', new THREE.Float32BufferAttribute(new Float32Array(charMesh.geometry.attributes.position.count * 2), 2)); charMesh.userData.dyn = 'char';
    const p0 = PATH[S.play?.k ?? 0]; charMesh.position.set(p0[0], 0.84, p0[2]); charMesh.visible = /^[mp]/.test(sid()); world.add(charMesh);
    if (st.ball) {
      const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04 }); patchBoxProjection(bm);
      ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 48, 24), bm); ball.position.set(0.6, 0.45, 0.6); world.add(ball);
    }
    // probes
    const probes = probeList(st);
    if (probes.length) {
      const g = new THREE.SphereGeometry(0.07, 12, 8), inst = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), probes.length), M = new THREE.Matrix4(), col = new THREE.Color();
      probes.forEach((pr, i) => { M.makeTranslation(...pr.p); inst.setMatrixAt(i, M); const y = Math.min(1, (0.2126 * pr.v.amb[0] + 0.7152 * pr.v.amb[1] + 0.0722 * pr.v.amb[2]) * 1.2); col.setRGB(0.25 + y, 0.25 + y, 0.3 + y); inst.setColorAt(i, col); });
      probeDots = inst; world.add(inst);
    }
    if (st.refl) { const b = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(...st.refl.pos.map((v, i) => v - st.refl.size[i] / 2)), new THREE.Vector3(...st.refl.pos.map((v, i) => v + st.refl.size[i] / 2))), 0xffd400); reflBox = b; world.add(b); const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffd400, wireframe: true })); s.position.set(...st.refl.pos); world.add(s); }
  }
  updateUniforms(); dirty = true;
  if (ball) setTimeout(updateReflection, 0);
}
function probeLight(st, p) {
  const probes = probeList(st);
  if (!probes.length) return { amb: AMBIENT_PROBE, sun: 0 };
  const b = blendProbes(p, probes), near = probes.reduce((a, pr) => { const d = Math.hypot(pr.p[0] - p[0], pr.p[1] - p[1], pr.p[2] - p[2]); return d < a.d ? { d, pr } : a; }, { d: 1e9 });
  return { amb: b.amb, sun: near.pr.v.sun };
}
function updateUniforms() {
  const st = S.st, lm = S.lm, baked = !!(isBaked(st) && lm), boxes = boxesFor(st);
  const mode = { lit: 0, baked: 1, charts: 2 }[st.view || 'lit'] ?? 0;
  // Is the sun's direct light drawn in real time on lightmapped surfaces?
  const rtOnLM = st.scene === 'prop' ? !baked : (!baked || (st.sun !== 'baked' && st.lightingMode !== 'Subtractive'));
  const rtDynamic = st.scene === 'prop' || !baked || st.sun !== 'baked';
  for (const m of meshes) {
    const u = m.material.uniforms; setBoxes(m.material, boxes);
    u.lm.value = lmTex; u.mode.value = mode; if (lmTex) u.lmSize.value.set(lmTex.image.width, lmTex.image.height);
    u.useLM.value = baked && m.userData.lm ? 1 : 0; u.sunProbe.value = 0;
    if (u.useLM.value) u.sunRT.value = rtOnLM ? 1 : 0;
    else if (m.userData.dyn === 'ground' || st.scene === 'prop') { u.amb.value.set(...skyAmbient()); u.sunRT.value = 1; }
    else { const pl = probeLight(st, centerOf(m.userData.obj)); u.amb.value.set(...pl.amb); u.sunRT.value = rtDynamic ? 1 : 0; if (!rtDynamic) u.sunProbe.value = pl.sun * 0.6; }
    u.charOn.value = st.scene === 'room' && rtOnLM ? 1 : 0;
    u.subtractive.value = st.scene === 'room' && baked && st.sun === 'mixed' && st.lightingMode === 'Subtractive' ? 1 : 0;
    if (charMesh) u.charPos.value.copy(charMesh.position);
  }
  if (charMesh) {
    const u = charMesh.material.uniforms, pl = probeLight(st, [charMesh.position.x, 0.9, charMesh.position.z]); setBoxes(charMesh.material, boxes);
    u.amb.value.set(...pl.amb); u.useLM.value = 0; u.mode.value = mode === 2 ? 0 : mode; u.charOn.value = 0;
    u.sunRT.value = rtDynamic ? 1 : 0; u.sunProbe.value = rtDynamic ? 0 : pl.sun * 0.6;
  }
  dirty = true;
}
const skyAmbient = () => [1.8, 1.95, 2.3];
function centerOf(name) { const b = OBJECTS[name].boxes[0]; return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2 + 0.2, (b[0][2] + b[1][2]) / 2]; }

// Reflection probe: a cube capture of the room, and box projection patched into the standard material.
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }), cubeCam = new THREE.CubeCamera(0.05, 100, cubeRT);
const skyRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType }), skyCam = new THREE.CubeCamera(0.1, 200, skyRT);
function patchBoxProjection(mat) {
  mat.userData.box = { boxMin: { value: new THREE.Vector3() }, boxMax: { value: new THREE.Vector3() }, probePos: { value: new THREE.Vector3() }, useBox: { value: 0 } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, mat.userData.box);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP; uniform vec3 boxMin; uniform vec3 boxMax; uniform vec3 probePos; uniform float useBox;')
      .replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', `reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
        if (useBox > 0.5) { vec3 rmax = (boxMax - vWorldP) / reflectVec, rmin = (boxMin - vWorldP) / reflectVec; vec3 rr = max(rmax, rmin); float fa = min(min(rr.x, rr.y), rr.z); reflectVec = normalize(vWorldP + reflectVec * fa - probePos); }`);
  };
}
function updateReflection() {
  if (!ball) return; const st = S.st;
  if (st.refl && st.refl.baked) {
    const hide = [ball, reflBox, probeDots, ...world.children.filter(o => o.material?.wireframe)].filter(Boolean); hide.forEach(o => { o.userData.v = o.visible; o.visible = false; });
    cubeCam.position.set(...st.refl.pos); cubeCam.update(renderer, scene); hide.forEach(o => { o.visible = o.userData.v; });
    ball.material.envMap = cubeRT.texture; const u = ball.material.userData.box; u.useBox.value = st.refl.box ? 1 : 0; u.probePos.value.set(...st.refl.pos);
    u.boxMin.value.set(...st.refl.pos.map((v, i) => v - st.refl.size[i] / 2)); u.boxMax.value.set(...st.refl.pos.map((v, i) => v + st.refl.size[i] / 2));
  } else { world.visible = false; skyCam.position.set(0, 1, 0); skyCam.update(renderer, scene); world.visible = true; ball.material.envMap = skyRT.texture; ball.material.userData.box.useBox.value = 0; }
  ball.material.needsUpdate = true; dirty = true;
}

// ─── Camera ──────────────────────────────────────────────────────────────────
function frame() {
  const st = S.st;
  if (st.scene === 'prop' && st.fbxView) { camera.position.set(4.2, 3.2, 5.2); controls.target.set(0, 0.6, 0); }
  else if (st.scene === 'prop') { camera.position.set(1.9, 1.5, 2.2); controls.target.set(0, 0.35, 0); }
  else { camera.position.set(1.2, 5.6, 9.2); controls.target.set(0, 0.9, -0.2); }
  controls.update(); dirty = true;
}

// ─── Baking ──────────────────────────────────────────────────────────────────
function bakeMode(st) { return st.sun === 'baked' || st.lightingMode === 'Subtractive' ? 'baked' : 'indirect'; }
function startBake() {
  const st = S.st; if (S.baking) return;
  if (st.scene === 'prop') {
    const r = bakeProp(st.uvChannel, st.margin, st.propRes); finishPropBake(r);
    if (st.uvChannel === 'uv0') st.flags.bakedUV0 = true;
    st.bakedKey = bakeKey(st); saveData(); build(); renderAll(); msg(st.uvChannel === 'uv0' ? 'Baked through UV0: every face shares the same texels.' : 'Baked through UV1.'); return;
  }
  const job = createBake(st.renderers, st.bake, bakeMode(st)), key = bakeKey(st), t0 = performance.now();
  S.baking = { job, key, t0 };
  const tick = () => {
    if (!S.baking || S.baking.job !== job) return;
    const done = job.run(120000); renderProgress(job.progress());
    if (!done) { setTimeout(tick, 0); return; }
    const maps = job.result(); S.baking = null;
    S.lm = { pack: job.pack, maps, key }; lmTexFromMaps(job.pack, maps);
    if (bakeKey(S.st) === key) { S.st.bakedKey = key; saveData(); }
    build(); renderAll(); msg(tr('Lighting generated in {s} s.', { s: ((performance.now() - t0) / 1000).toFixed(1) }));
    if (S.st.refl?.baked) updateReflection();
  };
  renderProgress(0); tick();
}
function finishPropBake(r) {
  const { S: N, E } = r, data = new Uint16Array(N * N * 4);
  for (let q = 0; q < N * N; q++) { data[q * 4] = THREE.DataUtils.toHalfFloat(E[q * 3]); data[q * 4 + 1] = THREE.DataUtils.toHalfFloat(E[q * 3 + 1]); data[q * 4 + 2] = THREE.DataUtils.toHalfFloat(E[q * 3 + 2]); data[q * 4 + 3] = THREE.DataUtils.toHalfFloat(1); }
  lmTex?.dispose(); lmTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType); lmTex.magFilter = lmTex.minFilter = THREE.LinearFilter; lmTex.needsUpdate = true;
  S.lm = { prop: true, S: N, E, layout: r.layout, key: bakeKey(S.st) };
}
function lmTexFromMaps(P, maps) {
  const N = P.size, H = N * P.pages, data = new Uint16Array(N * H * 4);
  maps.forEach((E, pg) => { for (let q = 0; q < N * N; q++) { const o = (pg * N * N + q) * 4; data[o] = THREE.DataUtils.toHalfFloat(E[q * 3]); data[o + 1] = THREE.DataUtils.toHalfFloat(E[q * 3 + 1]); data[o + 2] = THREE.DataUtils.toHalfFloat(E[q * 3 + 2]); data[o + 3] = 15360; } });
  lmTex?.dispose(); lmTex = new THREE.DataTexture(data, N, H, THREE.RGBAFormat, THREE.HalfFloatType); lmTex.magFilter = lmTex.minFilter = THREE.LinearFilter; lmTex.needsUpdate = true;
}
function renderProgress(p) { const bar = $('#bake-bar i'); if (bar) bar.style.width = (p * 100).toFixed(1) + '%'; const b = $('#gen-btn'); if (b) { b.disabled = !!S.baking; b.textContent = S.baking ? tr('Baking… {p} %', { p: Math.round(p * 100) }) : t('Generate Lighting'); } }

// ─── Side view: lightmap atlas, UV layout, top view ──────────────────────────
const side = $('#side'), sctx = side.getContext('2d'), sideHost = $('#side-host');
function resizeSide() { const w = sideHost.clientWidth, h = sideHost.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); side.width = w * dpr; side.height = h * dpr; sctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawSide(); }
new ResizeObserver(resizeSide).observe(sideHost);
const sideKind = () => { const st = S.st; if (st.scene === 'prop') return st.fbxView ? 'fbx' : 'uv'; return sid().startsWith('p') ? 'top' : 'atlas'; };
const tone = v => Math.round(255 * Math.min(1, Math.pow(v / Math.PI * 1.1 / (1 + v / Math.PI * 1.1), 1 / 2.2) * 1.3));
let topMap = null;
function drawSide() {
  if (!S.st) return; const w = sideHost.clientWidth, h = sideHost.clientHeight, st = S.st, kind = sideKind();
  sctx.fillStyle = '#202020'; sctx.fillRect(0, 0, w, h); sctx.font = '11px Inter, Segoe UI, sans-serif'; sctx.textBaseline = 'middle';
  $('#side-title').textContent = { atlas: 'Baked Lightmaps', uv: 'UV Editor · Lightmap', fbx: 'UV Maps', top: 'Top view' }[kind];
  if (kind === 'uv' || kind === 'fbx') {
    const size = Math.min(w, h) - 40, x0 = (w - size) / 2, y0 = (h - size) / 2 + 6, lm = isBaked(st) && S.lm?.prop ? S.lm : null;
    if (lm) { const N = lm.S, img = sctx.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const q = (N - 1 - y) * N + x, o = (y * N + x) * 4; img.data[o] = tone(lm.E[q * 3]); img.data[o + 1] = tone(lm.E[q * 3 + 1]); img.data[o + 2] = tone(lm.E[q * 3 + 2]); img.data[o + 3] = 255; } const c = document.createElement('canvas'); c.width = c.height = N; c.getContext('2d').putImageData(img, 0, 0); sctx.imageSmoothingEnabled = false; sctx.drawImage(c, x0, y0, size, size); sctx.imageSmoothingEnabled = true;
      sctx.strokeStyle = 'rgba(255,255,255,.08)'; sctx.beginPath(); for (let i = 0; i <= N; i++) { const q = Math.round(x0 + i * size / N) + 0.5; sctx.moveTo(q, y0); sctx.lineTo(q, y0 + size); const r = Math.round(y0 + i * size / N) + 0.5; sctx.moveTo(x0, r); sctx.lineTo(x0 + size, r); } sctx.stroke(); }
    else { sctx.fillStyle = '#2b2b2b'; sctx.fillRect(x0, y0, size, size); }
    const L = propLayout(st.uvChannel, st.margin), names = ['Left', 'Right', 'Back', 'Front', 'Top'];
    L.forEach((r, k) => { sctx.strokeStyle = st.uvChannel === 'uv0' ? 'rgba(255,90,70,.9)' : '#ffa629'; sctx.lineWidth = 1.5; sctx.strokeRect(x0 + r[0] * size, y0 + (1 - r[3]) * size, (r[2] - r[0]) * size, (r[3] - r[1]) * size); if (st.uvChannel === 'uv1') { sctx.fillStyle = '#ffc266'; sctx.fillText(t(names[k]), x0 + r[0] * size + 5, y0 + (1 - r[3]) * size + 10); } });
    sctx.strokeStyle = '#fff'; sctx.lineWidth = 1; sctx.strokeRect(x0 + 0.5, y0 + 0.5, size, size);
    const N = propLightmapSize(st.propRes, st.uvChannel, st.margin);
    $('#side-note').textContent = st.uvChannel === 'uv0' ? t('UV0: 5 faces on top of each other') : tr('{n} × {n} texels · margin {m} texels', { n: N, m: marginTexels(st.propRes, st.margin).toFixed(1) });
    if (kind === 'fbx') { sctx.fillStyle = 'rgba(20,20,20,.85)'; sctx.fillRect(8, 8, 190, 50); sctx.fillStyle = '#ddd'; const order = st.fbx.uvOrder === 'uv-lightmap' ? ['UVMap', 'Lightmap'] : ['Lightmap', 'UVMap']; order.forEach((n, i) => sctx.fillText(`${i === 0 ? 'UV0' : 'UV1'} → ${n}`, 16, 22 + i * 18)); }
    return;
  }
  if (kind === 'atlas') {
    const P = isBaked(st) && S.lm && !S.lm.prop ? S.lm.pack : packOf(st), N = P.size, pagesShown = Math.min(2, P.pages);
    // show only the used part of the page (as Unity crops nothing, but tiny charts would be unreadable)
    let used = 8; for (const c of Object.values(P.charts)) used = Math.max(used, c.x + c.cw + 2, c.y + c.ch + 2); used = P.pages > 1 ? N : Math.min(N, Math.ceil(used / 16) * 16);
    const size = Math.min(w - 30, (h - 50) / pagesShown), x0 = (w - size) / 2, zoom = N / used;
    for (let pg = 0; pg < pagesShown; pg++) {
      const y0 = 26 + pg * (size + 8);
      if (isBaked(st) && S.lm && !S.lm.prop) { const E = S.lm.maps[pg], img = sctx.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const q = y * N + x, o = ((N - 1 - y) * N + x) * 4; img.data[o] = tone(E[q * 3]); img.data[o + 1] = tone(E[q * 3 + 1]); img.data[o + 2] = tone(E[q * 3 + 2]); img.data[o + 3] = 255; } const c = document.createElement('canvas'); c.width = c.height = N; c.getContext('2d').putImageData(img, 0, 0); sctx.imageSmoothingEnabled = false; sctx.drawImage(c, 0, N - used, used, used, x0, y0, size, size); sctx.imageSmoothingEnabled = true; }
      else { sctx.fillStyle = '#2b2b2b'; sctx.fillRect(x0, y0, size, size); }
      for (const [id, c] of Object.entries(P.charts)) { if (c.page !== pg) continue; const k = size / N * zoom; sctx.strokeStyle = 'rgba(255,166,41,.8)'; sctx.lineWidth = 1; sctx.strokeRect(x0 + c.x * k + 0.5, y0 + (used - c.y - c.ch) * k + 0.5, c.cw * k, c.ch * k); if (c.cw * k > 36 && c.ch * k > 14) { sctx.fillStyle = 'rgba(255,210,140,.9)'; sctx.fillText(t(OBJ_LABEL(id)), x0 + c.x * k + 4, y0 + (used - c.y - c.ch) * k + 9); } }
      sctx.strokeStyle = '#fff'; sctx.strokeRect(x0 + 0.5, y0 + 0.5, size, size);
    }
    $('#side-note').textContent = tr('{p} lightmap(s) · {n} × {n} · {t} texels used', { p: P.pages, n: N, t: fmt(P.texels) }) + (used < N ? ' · ' + tr('showing {u} × {u}', { u: used }) : '');
    return;
  }
  // top view of the room (x right, z down), for the probes
  const pad = 20, sc = Math.min((w - 2 * pad) / 8, (h - 2 * pad - 20) / 6), ox = w / 2, oz = h / 2 + 6, X = x => ox + x * sc, Z = z => oz + z * sc;
  topMap = { X, Z, sc, ox, oz };
  sctx.fillStyle = '#2a2826'; sctx.fillRect(X(-4), Z(-3), 8 * sc, 6 * sc);
  const lm = isBaked(st) ? lmFor(st) : null;
  if (lm) { const c = lm.pack.charts.floor, Nn = lm.pack.size, E = lm.maps[c.page]; for (let j = 0; j < c.ch; j++) for (let i = 0; i < c.cw; i++) { const q = ((c.y + j) * Nn + c.x + i) * 3, v = tone(E[q] * 0.5); sctx.fillStyle = `rgb(${v},${Math.round(v * 0.9)},${Math.round(v * 0.75)})`; sctx.fillRect(X(-4 + i / c.cw * 8), Z(3 - (j + 1) / c.ch * 6), 8 * sc / c.cw + 1, 6 * sc / c.ch + 1); } }
  sctx.strokeStyle = '#bbb'; sctx.lineWidth = 3; sctx.strokeRect(X(-4), Z(-3), 8 * sc, 6 * sc);
  sctx.strokeStyle = '#8ad1ff'; sctx.lineWidth = 4; sctx.beginPath(); sctx.moveTo(X(WINDOW.x0), Z(-3)); sctx.lineTo(X(WINDOW.x1), Z(-3)); sctx.stroke();
  for (const n of ['Pillar', 'Crate', 'Door']) { const b = OBJECTS[n].boxes[0]; sctx.fillStyle = n === 'Door' ? '#6b4a33' : '#555'; sctx.fillRect(X(b[0][0]), Z(b[0][2]), (b[1][0] - b[0][0]) * sc, (b[1][2] - b[0][2]) * sc); }
  // path with error dots
  const rep = isBaked(st) ? probeReport(st) : null;
  sctx.strokeStyle = 'rgba(255,255,255,.35)'; sctx.lineWidth = 1; sctx.setLineDash([4, 4]); sctx.beginPath(); PATH.forEach((p, i) => i ? sctx.lineTo(X(p[0]), Z(p[2])) : sctx.moveTo(X(p[0]), Z(p[2]))); sctx.closePath(); sctx.stroke(); sctx.setLineDash([]);
  if (rep) rep.rows.forEach(r => { sctx.fillStyle = r.e <= 0.15 ? '#6fbf6f' : r.e <= 0.5 ? '#e8c14a' : '#e0664f'; sctx.beginPath(); sctx.arc(X(r.p[0]), Z(r.p[2]), 4, 0, Math.PI * 2); sctx.fill(); });
  for (const pr of probeList(st)) { sctx.strokeStyle = '#fff'; sctx.fillStyle = '#9fd3ff'; sctx.beginPath(); sctx.arc(X(pr.p[0]), Z(pr.p[2]), 5, 0, Math.PI * 2); sctx.fill(); sctx.stroke(); }
  if (st.refl) { sctx.strokeStyle = '#ffd400'; sctx.lineWidth = 1.5; sctx.strokeRect(X(st.refl.pos[0] - st.refl.size[0] / 2), Z(st.refl.pos[2] - st.refl.size[2] / 2), st.refl.size[0] * sc, st.refl.size[2] * sc); }
  if (charMesh) { sctx.fillStyle = '#ff9a5a'; sctx.beginPath(); sctx.arc(X(charMesh.position.x), Z(charMesh.position.z), 6, 0, Math.PI * 2); sctx.fill(); }
  $('#side-note').textContent = st.probeSystem === 'groups' ? t('Click to add a probe · Ctrl-click to remove') : '';
}
const OBJ_LABEL = id => ({ floor: 'Floor', ceiling: 'Ceiling', 'back.l': 'Wall', 'back.r': 'Wall', 'back.b': 'Wall', 'back.t': 'Wall', left: 'Wall', right: 'Wall', front: 'Wall' }[id] || id.split('.')[0]);
side.addEventListener('pointerdown', e => {
  const st = S.st; if (sideKind() !== 'top' || st.probeSystem !== 'groups' || !topMap) return;
  const r = side.getBoundingClientRect(), x = (e.clientX - r.left - topMap.ox) / topMap.sc, z = (e.clientY - r.top - topMap.oz) / topMap.sc;
  if (x < -3.9 || x > 3.9 || z < -2.9 || z > 2.9) return;
  pushUndo();
  if (e.ctrlKey || e.metaKey) { let bi = -1, bd = 0.5; st.probes.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[2] - z); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0) st.probes.splice(bi, 1); }
  else st.probes.push([+x.toFixed(2), 0.9, +z.toFixed(2)]);
  changed(true);
});

// ─── Inspector ───────────────────────────────────────────────────────────────
const statRow = (label, value, cls = '') => `<div class="sb-stat ${cls}"><span>${esc(t(label))}</span><b data-no-i18n>${esc(value)}</b></div>`;
const sel = (id, opts, v, attrs = '') => `<select id="${id}" data-no-i18n ${attrs}>${opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${lab}</option>`; }).join('')}</select>`;
const row = (label, inner, noI18n = true) => `<label class="bl-row two"><span${noI18n ? ' data-no-i18n' : ''}>${label}</span>${inner}</label>`;
function genPanel() {
  const st = S.st, stale = !isBaked(st);
  return `<button type="button" class="gen-btn${stale ? ' stale' : ''}" id="gen-btn">${esc(t('Generate Lighting'))}</button><div class="bake-bar" id="bake-bar"><i style="width:${isBaked(st) ? 100 : 0}%"></i></div>${stale ? `<p class="stale-note">${esc(t(st.bakedKey ? 'Lighting data is out of date: generate again.' : 'Not baked yet.'))}</p>` : ''}`;
}
function modelPanel() {
  const st = S.st, N = propLightmapSize(st.propRes, st.uvChannel, st.margin), mt = marginTexels(st.propRes, st.margin);
  return `<div class="panel"><h4><span data-no-i18n>Crate.fbx · Mesh Renderer</span></h4>
    ${row('Lightmap UVs', sel('uvch', [['uv0', 'UV0 (UVMap)'], ['uv1', 'UV1 (Lightmap)']], st.uvChannel))}
    ${statRow('Lightmap Resolution', st.propRes + ' texels/unit')}${statRow('Crate in the lightmap', `${N} × ${N} texels`)}${genPanel()}</div>
    ${st.uvChannel === 'uv1' ? `<div class="panel"><h4><span data-no-i18n>Blender · UV › Lightmap Pack</span></h4>
    <label class="bl-row two"><span data-no-i18n>Margin</span><input type="range" id="margin" min="0" max="0.2" step="0.005" value="${st.margin}"></label>
    ${statRow('Margin (UV units)', st.margin.toFixed(3))}${statRow('Margin in the lightmap', mt.toFixed(1) + ' texels', mt >= 2 && mt <= 6 ? 'good' : 'bad')}
    <p class="td-note">${esc(t('Aim for 2–6 texels. The GPU blends neighbouring texels: less than 2 and the islands bleed into each other.'))}</p></div>` : ''}`;
}
function fbxPanel() {
  const f = S.st.fbx, issues = fbxReport(f);
  const chk = (k, lab) => `<label class="bl-check"><input type="checkbox" data-fbx="${k}"${f[k] ? ' checked' : ''}><span data-no-i18n>${lab}</span></label>`;
  const s = (k, opts) => `<select data-fbx="${k}" data-no-i18n>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${v}"${String(f[k]) === String(v) ? ' selected' : ''}>${l}</option>`; }).join('')}</select>`;
  const NAMES = { scale: 'The object scale is not applied (Ctrl A › Scale): its size in the lightmap will be wrong.', size100: 'Apply Scalings All Local with Convert Units: the crate arrives 100 times too big.', axes: 'Forward / Up do not match Unity: the crate arrives lying on its side.', rot90: 'The crate keeps a −90° X rotation: turn on Bake Axis Conversion in Unity (or Apply Transform in Blender).', uvorder: 'The lightmap UV map is first: Unity will use the tiling texture map (overlapping) for the lightmap.', overwrite: 'Generate Lightmap UVs is on: Unity replaces your UV1 with its own.', modifiers: 'Apply Modifiers is off: the bevel and other modifiers are lost.', smoothing: 'Smoothing: use Face so Unity keeps the hard and soft edges.', types: 'Object Types: export only Mesh; lights and cameras are made in Unity.' };
  return `<div class="panel"><h4><span data-no-i18n>Blender · Export FBX</span></h4><div class="fbx-grid">
    <span data-no-i18n>Object › Apply</span>${chk('scaleApplied', 'Scale applied')}
    <span data-no-i18n>UV Maps order</span>${s('uvOrder', [['lightmap-uv', 'Lightmap, UVMap'], ['uv-lightmap', 'UVMap, Lightmap']])}
    <span data-no-i18n>Limit to</span>${chk('selected', 'Selected Objects')}
    <span data-no-i18n>Object Types</span>${s('types', [['all', 'Empty, Camera, Light, Mesh…'], ['mesh', 'Mesh']])}
    <span data-no-i18n>Apply Scalings</span>${s('applyScalings', ['All Local', 'FBX Units Scale', 'FBX All'])}
    <span data-no-i18n>Forward</span>${s('forward', ['-Z Forward', 'Y Forward', 'Z Forward'])}
    <span data-no-i18n>Up</span>${s('up', ['Y Up', 'Z Up'])}
    <span data-no-i18n>Apply Transform</span>${chk('applyTransform', 'Apply Transform')}
    <span data-no-i18n>Apply Modifiers</span>${chk('modifiers', 'Apply Modifiers')}
    <span data-no-i18n>Smoothing</span>${s('smoothing', ['Normals Only', 'Face', 'Edge'])}
  </div></div>
  <div class="panel"><h4><span data-no-i18n>Unity · Model Import Settings</span></h4><div class="fbx-grid">
    <span data-no-i18n>Scale Factor</span><input type="number" data-fbx="unityScale" value="${f.unityScale}" step="0.01">
    <span data-no-i18n>Convert Units</span>${chk('convertUnits', 'Convert Units')}
    <span data-no-i18n>Bake Axis Conversion</span>${chk('bakeAxis', 'Bake Axis Conversion')}
    <span data-no-i18n>Generate Lightmap UVs</span>${chk('genLightmapUVs', 'Generate Lightmap UVs')}
  </div>
  <ul class="issues">${issues.length ? issues.map(k => `<li>${esc(t(NAMES[k]))}</li>`).join('') : `<li class="ok">${esc(t('✓ The crate arrives at 1:1, upright, with its own lightmap UVs in UV1.'))}</li>`}${f.applyScalings === 'FBX All' && f.convertUnits ? `<li class="ok">${esc(t('FBX All also works; FBX Units Scale keeps the unit conversion in the file header.'))}</li>` : ''}</ul></div>`;
}
function lightingPanel(opts = {}) {
  const st = S.st, b = st.bake, P = packOf(st), time = estimateRays(P.texels, b) / 1.2e6, nz = noiseLevel(b);
  const lock = k => opts.lock?.includes(k) ? ' disabled' : '';
  return `<div class="panel"><h4><span data-no-i18n>Lighting · Lightmapping Settings</span></h4>
    ${row('Lightmapper', '<select disabled data-no-i18n><option>Progressive CPU</option></select>')}
    ${row('Lightmap Resolution', `<input type="number" id="res" min="1" max="60" step="1" value="${b.resolution}"${lock('res')}>`)}
    ${row('Lightmap Padding', '<input type="number" value="2" disabled>')}
    ${row('Max Lightmap Size', sel('maxSize', [256, 512, 1024], b.maxSize, lock('maxSize')))}
    ${row('Max Bounces', sel('bounces', [0, 1, 2, 3], b.bounces, lock('bounces')))}
    ${row('Indirect Samples', sel('indirect', [16, 32, 64, 128, 256], b.indirect, lock('indirect')))}
    ${row('Environment Samples', sel('env', [8, 16, 32], b.env, lock('env')))}
    ${row('Filtering', sel('filter', [['none', 'None'], ['gaussian', 'Advanced · Gaussian'], ['denoiser', 'Advanced · Denoiser (OpenImageDenoise)']], b.filter, lock('filter')))}
    ${opts.mode ? row('Lighting Mode', sel('lmode', ['Baked Indirect', 'Shadowmask', 'Distance Shadowmask', 'Subtractive'], st.lightingMode)) : ''}
    ${statRow('Lightmaps', `${P.pages} × ${P.size}²`, P.pages === 1 ? 'good' : 'bad')}${statRow('Memory', lightmapMB(P.pages, P.size).toFixed(2) + ' MB')}
    ${statRow('Texels', fmt(P.texels))}${statRow('Noise (indirect)', b.bounces ? (nz * 100).toFixed(1) + ' %' : '—', b.bounces ? (nz <= 0.03 ? 'good' : 'bad') : '')}
    ${statRow('Estimated bake time', time < 1 ? '< 1 s' : time.toFixed(0) + ' s')}
    ${genPanel()}</div>`;
}
function objectsPanel(showScale) {
  const st = S.st, r = st.renderers[st.sel];
  return `<div class="panel"><h4>${esc(t('Objects'))}<small data-no-i18n>Hierarchy</small></h4><ul class="obj-list">${OBJECT_NAMES.map(n => `<li data-obj="${n}" class="${n === st.sel ? 'sel' : ''}"><span data-no-i18n>${n}</span><small data-no-i18n>${st.renderers[n].contribute ? (st.renderers[n].receive === 'lightmaps' ? 'Static · Lightmaps' : 'Static · Probes') : 'Dynamic'}${showScale && st.renderers[n].scale !== 1 ? ' · ×' + st.renderers[n].scale : ''}</small></li>`).join('')}</ul></div>
    <div class="panel"><h4><span data-no-i18n>${st.sel} · Mesh Renderer › Lighting</span></h4>
    <label class="bl-check"><input type="checkbox" id="contrib"${r.contribute ? ' checked' : ''}><span data-no-i18n>Contribute Global Illumination</span></label>
    ${row('Receive Global Illumination', sel('receive', [['lightmaps', 'Lightmaps'], ['probes', 'Light Probes']], r.receive, r.contribute ? '' : 'disabled'))}
    ${showScale ? row('Scale In Lightmap', sel('scale', [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3], r.scale, r.contribute && r.receive === 'lightmaps' ? '' : 'disabled')) : ''}
    ${st.sel === 'Door' ? `<p class="td-note">${esc(t('The door opens during the game (press Play).'))}</p>` : ''}</div>`;
}
function lightPanel() {
  const st = S.st;
  return `<div class="panel"><h4><span data-no-i18n>Directional Light · Light</span></h4>
    ${row('Mode', sel('sunmode', [['baked', 'Baked'], ['mixed', 'Mixed'], ['realtime', 'Realtime']], st.sun))}
    <p class="td-note">${esc(t(st.sun === 'baked' ? 'Baked: direct light and shadows only in the lightmap. Moving objects get it only through probes, without shadows.' : st.sun === 'mixed' ? 'Mixed: the bake keeps the bounce; the direct light and the shadows are real time (depends on the Lighting Mode).' : 'Realtime: nothing of this light is baked, not even its bounce.'))}</p></div>`;
}
function probesPanel(kind) {
  const st = S.st, rep = isBaked(st) ? probeReport(st) : null;
  if (kind === 'refl') {
    const r = st.refl;
    return `<div class="panel"><h4><span data-no-i18n>Reflection Probe</span></h4>
      ${r ? `${row('Type', '<select disabled data-no-i18n><option>Baked</option></select>')}
      <label class="bl-check"><input type="checkbox" id="rbox"${r.box ? ' checked' : ''}><span data-no-i18n>Box Projection</span></label>
      ${['X', 'Y', 'Z'].map((a, i) => row('Box Size ' + a, `<input type="number" data-rsize="${i}" value="${r.size[i]}" step="0.1" min="0.2" max="20">`)).join('')}
      ${['X', 'Y', 'Z'].map((a, i) => row('Position ' + a, `<input type="number" data-rpos="${i}" value="${r.pos[i]}" step="0.1">`)).join('')}
      <button type="button" class="gen-btn" id="rbake">${esc(t('Bake'))}</button>${r.baked ? '' : `<p class="stale-note">${esc(t('Not baked yet.'))}</p>`}` : `<button type="button" class="gen-btn" id="radd">${esc(t('Add Reflection Probe'))}</button>`}
      <p class="td-note">${esc(t('Without a probe, shiny materials reflect the skybox.'))}</p></div>`;
  }
  return `<div class="panel"><h4><span data-no-i18n>Light Probes</span></h4>
    ${row('Light Probe System', sel('psys', kind === 'apv' ? [['none', 'None (ambient only)'], ['apv', 'Adaptive Probe Volumes']] : [['none', 'None (ambient only)'], ['groups', 'Light Probe Groups']], st.probeSystem))}
    ${st.probeSystem === 'apv' ? row('Min Probe Spacing', sel('apvsp', [[1, '1 m'], [1.5, '1.5 m'], [3, '3 m'], [9, '9 m']], st.apvSpacing)) : ''}
    ${st.probeSystem === 'groups' ? `${statRow('Probes', String(st.probes.length), st.probes.length <= 30 ? '' : 'bad')}<button type="button" class="mini-link" id="pclear">${esc(t('Remove all probes'))}</button>` : ''}
    ${rep ? statRow('Average error on the walk', (rep.mean * 100).toFixed(0) + ' %', rep.mean <= 0.15 ? 'good' : 'bad') + statRow('Worst point', (rep.worst * 100).toFixed(0) + ' %') : ''}
    <p class="td-note">${esc(t('Dots on the walk: green under 15 % error, yellow under 50 %, red above.'))}</p>${kind === 'apv' ? genPanel() : ''}</div>`;
}
function quizPanel(list, opts) {
  const i = S.st.quiz | 0, done = i >= list.length, item = list[Math.min(i, list.length - 1)];
  return `<div class="panel quiz"><h4>${esc(t('Case'))}<small>${Math.min(i + 1, list.length)} / ${list.length}</small></h4>
    ${done ? `<p class="q done">${esc(t('✓ All right.'))}</p>` : `<p class="q">${esc(t(item.q))}</p><div class="opt-grid">${opts.map((o, k) => `<button type="button" data-ans="${k}" data-no-i18n>${esc(o)}</button>`).join('')}</div>`}
    ${S.feedback ? `<p class="td-note ${S.feedback.ok ? 'good' : 'bad'}">${esc(S.feedback.text)}</p>` : ''}</div>`;
}
function renderProps() {
  const id = sid(); let h = '';
  if (id === 'u1' || id === 'u2') h = modelPanel();
  else if (id === 'u3') h = fbxPanel();
  else if (id === 'b1' || id === 'b3') h = lightingPanel();
  else if (id === 'b2') h = objectsPanel(true) + lightingPanel({ lock: ['maxSize'] });
  else if (id === 'm1') h = lightPanel() + lightingPanel({ mode: true });
  else if (id === 'm2') h = objectsPanel(false) + lightingPanel();
  else if (id === 'm3') h = quizPanel(MODE_QUIZ, MODE_OPTS) + lightPanel();
  else if (id === 'p1') h = probesPanel('groups');
  else if (id === 'p2') h = probesPanel('apv');
  else if (id === 'p3') h = probesPanel('refl');
  $('#props').innerHTML = h;
}
$('#props').addEventListener('click', e => {
  const b = e.target.closest('button, li[data-obj]'); if (!b) return; const st = S.st, d = b.dataset;
  if (b.id === 'gen-btn') startBake();
  else if (d.obj) { st.sel = d.obj; renderProps(); }
  else if (d.ans != null) { pushUndo(); const r = answerQuiz(st, MODE_QUIZ, +d.ans); S.feedback = { ok: r.ok, text: (r.ok ? '✓ ' : '✗ ') + t(r.item.why) }; if (!r.ok) S.undo.pop(); changed(true); }
  else if (b.id === 'pclear') { pushUndo(); st.probes = []; changed(true); }
  else if (b.id === 'radd') { pushUndo(); st.refl = { baked: false, box: false, size: [3, 3, 3], pos: [0, 1.5, 0] }; changed(true); }
  else if (b.id === 'rbake') { pushUndo(); st.refl.baked = true; changed(true); updateReflection(); msg('Reflection Probe baked: a cube map of the room from its position.'); }
});
$('#props').addEventListener('input', e => { const el = e.target, st = S.st; if (el.id === 'margin') { st.margin = +el.value; changed(false, true); } });
$('#props').addEventListener('change', e => {
  const el = e.target, st = S.st, d = el.dataset; pushUndo();
  if (el.id === 'uvch') st.uvChannel = el.value;
  else if (el.id === 'margin') st.margin = +el.value;
  else if (d.fbx) { const k = d.fbx; st.fbx[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; }
  else if (el.id === 'res') st.bake.resolution = Math.max(1, Math.min(60, Math.round(+el.value) || 1));
  else if (['maxSize', 'bounces', 'indirect', 'env'].includes(el.id)) st.bake[el.id] = +el.value;
  else if (el.id === 'filter') st.bake.filter = el.value;
  else if (el.id === 'lmode') st.lightingMode = el.value;
  else if (el.id === 'sunmode') st.sun = el.value;
  else if (el.id === 'contrib') st.renderers[st.sel].contribute = el.checked;
  else if (el.id === 'receive') st.renderers[st.sel].receive = el.value;
  else if (el.id === 'scale') st.renderers[st.sel].scale = +el.value;
  else if (el.id === 'psys') st.probeSystem = el.value;
  else if (el.id === 'apvsp') st.apvSpacing = +el.value;
  else if (el.id === 'rbox') st.refl.box = el.checked;
  else if (d.rsize != null) { st.refl.size[+d.rsize] = Math.max(0.2, +el.value || 0.2); }
  else if (d.rpos != null) { st.refl.pos[+d.rpos] = +el.value || 0; }
  else { S.undo.pop(); return; }
  changed(true);
});

// ─── Header, play ────────────────────────────────────────────────────────────
$('#draw-mode').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; S.st.view = b.dataset.view; saveData(); renderHeaders(); updateUniforms(); });
$('#play-btn').addEventListener('click', () => togglePlay());
function togglePlay(on = !S.play) {
  if (!S.st || S.st.scene !== 'room') { if (on) msg('Play works in the room.'); return; }
  S.play = on ? { t0: performance.now(), k: 0 } : null;
  $('#play-btn').setAttribute('aria-pressed', String(!!S.play)); $('#play-btn').textContent = t(S.play ? '■ Stop' : '▶ Play');
  if (!on && doorGroup) { doorGroup.rotation.y = 0; doorGroup.position.set(0, 0, 0); }
  updateUniforms();
}
function stepPlay(now) {
  const k = (now - S.play.t0) / 1000, u = (k / 16) % 1, f = u * PATH.length, i = Math.floor(f), a = PATH[i % PATH.length], b = PATH[(i + 1) % PATH.length], w = f - i;
  if (charMesh) charMesh.position.set(a[0] + (b[0] - a[0]) * w, 0.84, a[2] + (b[2] - a[2]) * w);
  if (doorGroup) { const ang = Math.min(1, Math.max(0, Math.sin(k * 0.6) * 1.2)) * 1.4; doorGroup.position.set(-3.94, 0, 0.9); doorGroup.rotation.y = -ang; doorGroup.children.forEach(m => { m.position.set(3.94, 0, -0.9); }); }
  updateUniforms(); if (sideKind() === 'top') drawSide();
}
function renderHeaders() {
  const st = S.st, room = st.scene === 'room';
  $('#draw-mode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === (st.view || 'lit'))));
  $('#play-btn').hidden = !room;
  $('#scene-title').textContent = st.fbxView ? 'Unity · Scene (imported Crate.fbx)' : room ? 'Scene · Room' : 'Scene · Crate';
}

// ─── Viewport text ───────────────────────────────────────────────────────────
function vpText() {
  const st = S.st, el = $('#vp-text'), baked = isBaked(st);
  if (st.fbxView) { const r = fbxReport(st.fbx); el.innerHTML = `<b>Crate · Transform</b>\nRotation  X ${r.includes('rot90') ? '-90' : '0'}  Y 0  Z ${r.includes('axes') ? '90' : '0'}\nScale  ${r.includes('size100') ? '100' : r.includes('scale') ? '2.5' : '1'}\n${esc(t('Lightmap UVs'))}: ${r.includes('uvorder') ? 'UV1 = UVMap (overlapping)' : r.includes('overwrite') ? 'UV1 = generated by Unity' : 'UV1 = Lightmap'}`; return; }
  el.innerHTML = st.scene === 'prop' ? `<b>${esc(baked ? t('Baked') : t('Not baked'))}</b>\n${esc(t('Lightmap UVs'))}: ${st.uvChannel === 'uv0' ? 'UV0' : 'UV1'}` :
    `<b>${esc(baked ? t('Baked') : t('Preview: not baked'))}</b>\n${esc(t('Sun'))}: ${st.sun === 'baked' ? 'Baked' : st.sun === 'mixed' ? 'Mixed · ' + st.lightingMode : 'Realtime'}\n${esc(t('Light Probes'))}: ${st.probeSystem === 'none' ? t('none (ambient)') : st.probeSystem === 'apv' ? 'APV' : st.probes.length}`;
}

// ─── Loop ────────────────────────────────────────────────────────────────────
function loop(now) {
  requestAnimationFrame(loop);
  if (!S.st) return;
  if (S.play) { stepPlay(now); dirty = true; }
  if (!dirty) return; dirty = false;
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// ─── Undo, storage, steps ────────────────────────────────────────────────────
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) { msg('Nothing to undo.'); return; } S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(true); msg('Undo.'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(true); msg('Redo.'); }
const dataKey = () => `step:${stage().id}-${step().id}`;
function saveData() { store.set(dataKey(), S.st); }
function loadData() { const saved = store.get(dataKey(), null), fresh = startState(step()); S.st = saved && typeof saved === 'object' && saved.scene === fresh.scene && saved.renderers && saved.bake ? { ...fresh, ...saved, flags: { ...saved.flags } } : fresh; }
function renderStageSwitch() { $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join(''); }
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
    <div><span class="control-label">${esc(t('HOW, IN BLENDER AND UNITY'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); S.feedback = null; S.lm = null; changed(true); frame(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st); ensureBaked(); changed(true); if (S.st.refl?.baked) setTimeout(updateReflection, 50); msg('This is one possible solution. Ctrl Z brings your work back.'); }
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
// When the state says "baked" but this page has no lightmap for it (a reload, a solution), bake it now.
function ensureBaked() { const st = S.st; if (st.bakedKey && st.bakedKey === bakeKey(st) && (!S.lm || S.lm.key !== st.bakedKey)) { if (st.scene === 'prop') { finishPropBake(bakeProp(st.uvChannel, st.margin, st.propRes)); } else startBake(); } }
let liveT = null;
function changed(save = true, live = false) {
  if (save) saveData();
  if (live) { clearTimeout(liveT); liveT = setTimeout(() => changed(true), 150); const m = $('#props'); void m; drawSide(); return; }
  build(); renderHeaders(); renderProps(); drawSide(); vpText(); checkProgress();
}
function renderAll() { renderHeaders(); renderProps(); drawSide(); vpText(); checkProgress(); }
function enterStep() {
  togglePlay(false); S.baking = null;
  loadData(); S.undo = []; S.redo = []; S.feedback = null; S.lm = null;
  lastOk = null; lastCard = ''; lastOk = stepDone(S.step);
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  renderStageSwitch(); frame(); changed(false); ensureBaked();
  if (S.st.ball) setTimeout(updateReflection, 30);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); renderAll(); });
let hover = false;
$('#workspace').addEventListener('pointerenter', () => { hover = true; }); $('#workspace').addEventListener('pointerleave', () => { hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || !hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
  if (ctrl && low === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  else if (ctrl && low === 'y') { redo(); e.preventDefault(); }
  else if (e.key === ' ') { togglePlay(); e.preventDefault(); }
});
resize(); enterStep();
window.__lm = { S, STAGES, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, solve: () => { step().solve(S.st); ensureBaked(); changed(true); if (S.st.refl?.baked) setTimeout(updateReflection, 50); }, bake: startBake };
