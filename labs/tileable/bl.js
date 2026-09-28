// Tileable Texture Lab: the Blender-style workspace (Image/UV Editor, 3D Viewport and Properties with nodes).
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { stones, stonesAt, photoRough, bricks, rock, moss, photoTexture, N } from './bank.js?v=2';
import { WALLS, WALL, HEIGHT, TILE_M, report, bbox, translate, scale as scaleQ, rotate as rotateQ, cloneUV } from './walls.js?v=2';
import { wallReports, cornersOk, density, noiseSize, coverage, mossTile, repeatTogether, mapsAligned } from './stages.js?v=2';
import { t, tr } from '../../i18n.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 2) => (+x.toFixed(d)).toString();

// ─── Images as canvases and textures ─────────────────────────────────────────
const canvases = new Map(), textures = new Map();
function canvasOf(key, im) {
  if (!canvases.has(key)) { const c = document.createElement('canvas'); c.width = im.w; c.height = im.h; c.getContext('2d').putImageData(new ImageData(im.d, im.w, im.h), 0, 0); canvases.set(key, c); }
  return canvases.get(key);
}
const IMAGES = {
  photo: { name: 'gravel_photo.jpg', get: () => photoTexture() },
  tile: { name: 'gravel_tileable.png', get: () => stones().col },
  rough: { name: 'gravel_rough.png', get: () => stones().rough },
  roughPhoto: { name: 'gravel_rough_photo.png', get: () => photoRough() },
  normal: { name: 'gravel_normal.png', get: () => stones().normal },
  bricks: { name: 'bricks.png', get: () => bricks().col },
  bricksN: { name: 'bricks_normal.png', get: () => bricks().normal },
  rock: { name: 'rock.png', get: () => rock().col },
  rockN: { name: 'rock_normal.png', get: () => rock().normal },
  moss: { name: 'moss_earth.png', get: () => moss() },
  t256: { name: 'gravel_256.png', get: () => stonesAt(256) }, t512: { name: 'gravel_512.png', get: () => stonesAt(512) }, t1024: { name: 'gravel_1024.png', get: () => stonesAt(1024) }, t2048: { name: 'gravel_2048.png', get: () => stonesAt(1024) },
};
const imgCanvas = key => canvasOf(key, IMAGES[key].get());
function texOf(key, color = true) {
  if (!textures.has(key)) {
    const tex = new THREE.CanvasTexture(imgCanvas(key));
    tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; tex.anisotropy = 8;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (key === 't256' || key === 't512') { tex.magFilter = THREE.NearestFilter; }
    textures.set(key, tex);
  }
  return textures.get(key);
}

const VERT = `varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec3 vON;
void main(){ vUv = uv; vO = position; vON = normal; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `precision highp float;
uniform sampler2D uMap, uRough, uNorm, uMoss;
uniform vec2 uScale, uOffC, uOffR, uOffN;
uniform int uClip, uCoord, uProj;
uniform float uBlend, uHasRough, uHasNorm, uNormStr, uMacro, uMacroScale, uMossOn, uMossScale, uMaskScale, uMaskPos, uSunI, uPlain, uHi, uRoughK;
uniform vec3 uSunDir, uPlainCol;
varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec3 vON;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm4(vec2 p){ float s = 0.0, a = 0.5, t = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); t += a; a *= 0.5; p = p * 2.03 + 11.7; } return s / t; }
vec4 samp(sampler2D t, vec2 uv){ vec4 c = texture2D(t, uv); if (uClip == 1 && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) c = vec4(0.0); return c; }
vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 tn){ vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 du1 = dFdx(uv), du2 = dFdy(uv); vec3 a = cross(dp2, N), b = cross(N, dp1); vec3 T = a * du1.x + b * du2.x, B = a * du1.y + b * du2.y; float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12)); return normalize(mat3(T * im, B * im, N) * tn); }
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 base = uPlainCol; float rough = uRoughK; vec3 nrm = N;
  if (uPlain < 0.5) {
    if (uCoord == 1) {
      vec3 p = vO * uScale.x;
      if (uProj == 1) {
        vec3 a = abs(normalize(vON)); float m = max(a.x, max(a.y, a.z));
        vec3 w = max(a - (1.0 - uBlend) * m, 0.0) + vec3(1e-4) * step(m - 1e-5, a); w /= (w.x + w.y + w.z);
        base = texture2D(uMap, p.yz).rgb * w.x + texture2D(uMap, p.xz).rgb * w.y + texture2D(uMap, p.xy).rgb * w.z;
      } else base = samp(uMap, p.xy).rgb;
    } else {
      vec2 uv = vUv * uScale;
      base = samp(uMap, uv + uOffC).rgb;
      if (uHasRough > 0.5) rough = samp(uRough, uv + uOffR).r;
      if (uHasNorm > 0.5) { vec3 tn = samp(uNorm, uv + uOffN).rgb * 2.0 - 1.0; tn.xy *= uNormStr; nrm = perturb(N, vW, uv, normalize(tn)); }
      if (uMossOn > 0.5) { float mk = smoothstep(uMaskPos - 0.04, uMaskPos + 0.04, fbm4(vW.xz * uMaskScale)); vec3 mc = texture2D(uMoss, vUv * uMossScale).rgb; base = mix(base, mc, mk); rough = mix(rough, 0.95, mk); }
    }
    if (uMacro > 0.0) { float n = smoothstep(0.28, 0.72, fbm4(vW.xz * uMacroScale + 7.3)); base *= mix(1.0, 0.3 + 1.2 * n, uMacro); }
  }
  vec3 V = normalize(cameraPosition - vW), L = normalize(uSunDir), H = normalize(L + V);
  float ndl = max(dot(nrm, L), 0.0), ndh = max(dot(nrm, H), 0.0), ndv = max(dot(nrm, V), 0.02);
  float r = clamp(rough, 0.06, 1.0), a2 = pow(r, 4.0), d = ndh * ndh * (a2 - 1.0) + 1.0, D = a2 / (3.14159 * d * d);
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0), k = (r + 1.0) * (r + 1.0) / 8.0, G = ndl / (ndl * (1.0 - k) + k) * ndv / (ndv * (1.0 - k) + k);
  float spec = D * F * G / max(4.0 * ndl * ndv, 0.02);
  vec3 amb = mix(vec3(0.20, 0.19, 0.18), vec3(0.34, 0.37, 0.42), nrm.y * 0.5 + 0.5);
  vec3 col = base * (amb + vec3(1.0, 0.95, 0.86) * ndl * uSunI) + vec3(1.0, 0.95, 0.86) * spec * ndl * uSunI * 1.3;
  col = mix(col, vec3(1.0, 0.63, 0.16), uHi * 0.16);
  col = col / (1.0 + col * 0.3) * 1.0;
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;
function makeMat(extra = {}) {
  const white = texOf('tile');
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: white }, uRough: { value: white }, uNorm: { value: white }, uMoss: { value: white },
      uScale: { value: new THREE.Vector2(1, 1) }, uOffC: { value: new THREE.Vector2() }, uOffR: { value: new THREE.Vector2() }, uOffN: { value: new THREE.Vector2() },
      uClip: { value: 0 }, uCoord: { value: 0 }, uProj: { value: 0 }, uBlend: { value: 0 }, uHasRough: { value: 0 }, uHasNorm: { value: 0 }, uNormStr: { value: 1 },
      uMacro: { value: 0 }, uMacroScale: { value: 1 }, uMossOn: { value: 0 }, uMossScale: { value: 10 }, uMaskScale: { value: 0.08 }, uMaskPos: { value: 0.5 },
      uSunI: { value: 1.75 }, uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) }, uPlain: { value: 0 }, uPlainCol: { value: new THREE.Color(0.55, 0.55, 0.55) }, uHi: { value: 0 }, uRoughK: { value: 0.7 },
      ...extra,
    },
  });
}

export function createBL(ctx) {
  const st = () => ctx.S.st;
  // ─── 3D viewport ───────────────────────────────────────────────────────────
  const canvas = $('#view'), host = $('#view-host');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x393939);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
  const controls = new OrbitControls(camera, canvas);
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
  controls.maxPolarAngle = Math.PI * 0.495;
  let dirty = true; controls.addEventListener('change', () => { dirty = true; });
  const world = new THREE.Group(); scene.add(world);
  const grid = new THREE.GridHelper(200, 100, 0x4a4a4a, 0x424242); grid.position.y = -0.002; scene.add(grid);
  let mainMat = null, wallMeshes = {}, pickables = [];
  const CAMS = { floor: [[5.5, 5.2, 8.4], [0, 0.4, 0]], building: [[9.5, 6.8, 11], [0, 1.3, 0]], rock: [[3.4, 2.3, 4.6], [0, 0.5, 0]], plaza: [[26, 17, 30], [0, 0, 0]] };
  function frame() { const [p, tg] = st().maps ? [[-2.2, 2.6, 4.6], [-0.4, 0, 0.2]] : CAMS[st().scene]; camera.position.set(...p); controls.target.set(...tg); controls.update(); dirty = true; }
  const plainMat = (c, rough = 0.8) => makeMat({ uPlain: { value: 1 }, uPlainCol: { value: new THREE.Color().setRGB(...c, THREE.SRGBColorSpace) }, uRoughK: { value: rough } });
  function person() {
    const g = new THREE.Group(), m = plainMat([0.72, 0.74, 0.78], 0.6);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 6, 14), m); body.position.y = 0.2 + 0.55 + 0.04; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), m); head.position.y = 1.64; g.add(head);
    return g;
  }
  function clear() { for (const o of [...world.children]) { world.remove(o); o.traverse(x => { x.geometry?.dispose(); if (x.material && x.material !== mainMat) x.material.dispose?.(); }); } mainMat?.dispose(); mainMat = null; wallMeshes = {}; pickables = []; }
  let builtScene = null;
  function build() {
    clear(); const s = st(); builtScene = s.scene;
    mainMat = makeMat();
    if (s.scene === 'floor' || s.scene === 'plaza') {
      const size = s.scene === 'floor' ? 8 : 40, g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mainMat); world.add(m); pickables.push(m);
      const p = person(); p.position.set(s.scene === 'floor' ? 1.2 : 3, 0, s.scene === 'floor' ? 1.4 : 6); world.add(p);
      if (s.scene === 'plaza') for (const [x, z] of [[-8, 4], [9, -6], [-12, -12]]) { const q = person(); q.position.set(x, 0, z); world.add(q); }
    } else if (s.scene === 'building') {
      for (const w of WALLS) {
        const g = new THREE.PlaneGeometry(w.w, w.h), mat = makeMat();
        const m = new THREE.Mesh(g, mat); m.userData.wall = w.id;
        const ang = Math.atan2(-(w.b[1] - w.a[1]), w.b[0] - w.a[0]);
        m.rotation.y = ang; m.position.set((w.a[0] + w.b[0]) / 2, w.h / 2, (w.a[1] + w.b[1]) / 2);
        world.add(m); wallMeshes[w.id] = m; pickables.push(m);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.18, 4.3), plainMat([0.4, 0.38, 0.36])); roof.position.y = HEIGHT + 0.09; world.add(roof);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), plainMat([0.3, 0.31, 0.29], 0.95)); ground.position.y = -0.001; world.add(ground);
      const p = person(); p.position.set(3.9, 0, 3.4); world.add(p);
    } else if (s.scene === 'rock') {
      const m = new THREE.Mesh(rockGeometry(), mainMat); world.add(m);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), plainMat([0.3, 0.31, 0.29], 0.95)); world.add(ground);
      const p = person(); p.position.set(1.9, 0, 0.7); world.add(p);
    }
    update();
  }
  function rockGeometry() {
    const g = new THREE.IcosahedronGeometry(1, 6), pos = g.attributes.position, nor = g.attributes.normal, key = new Map();
    const disp = (x, y, z) => 1 + 0.16 * Math.sin(3.1 * x + 1.3) * Math.sin(2.7 * y + 0.4) + 0.1 * Math.sin(5.3 * z + 2.2 * x) + 0.05 * Math.sin(9.1 * y + 4 * z);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = disp(x, y, z);
      let px = x * r * 1.25, py = y * r * 0.72, pz = z * r * 0.95; if (py < -0.35) py = -0.35 - (py + 0.35) * 0.15;
      pos.setXYZ(i, px, py + 0.42, pz);
    }
    // Smooth normals: faces around the same point share one normal.
    const acc = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    const k = i => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      n.subVectors(c, b).cross(a.clone().sub(b));
      for (let j = 0; j < 3; j++) { const kk = k(i + j); const v = acc.get(kk) || new THREE.Vector3(); v.add(n); acc.set(kk, v); }
    }
    for (let i = 0; i < pos.count; i++) { const v = acc.get(k(i)).clone().normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
    void key; return g;
  }
  // Uniforms from the state.
  function setMat(m, s, extra = {}) {
    const u = m.uniforms, maps = s.maps;
    const colorKey = s.scene === 'rock' ? 'rock' : s.scene === 'building' ? 'bricks' : ctx.stepId() === 'd1' ? 't' + s.res : maps ? 'tile' : s.img === 'photo' ? 'photo' : 'tile';
    u.uMap.value = texOf(colorKey);
    const wrap = s.ext === 'repeat' ? THREE.RepeatWrapping : s.ext === 'mirror' ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
    if (u.uMap.value.wrapS !== wrap) { u.uMap.value.wrapS = u.uMap.value.wrapT = wrap; u.uMap.value.needsUpdate = true; }
    u.uClip.value = s.ext === 'clip' ? 1 : 0;
    u.uScale.value.set(s.scale[0], s.scale[1]);
    u.uCoord.value = s.coord === 'object' ? 1 : 0; u.uProj.value = s.proj === 'box' ? 1 : 0; u.uBlend.value = s.blend;
    const nKey = s.scene === 'building' ? 'bricksN' : s.scene === 'rock' ? null : 'normal';
    u.uHasNorm.value = nKey && (s.scene !== 'rock') ? 1 : 0; if (nKey) u.uNorm.value = texOf(nKey, false);
    u.uNormStr.value = s.scene === 'plaza' ? 0.8 : 1;
    if (maps) {
      u.uHasRough.value = 1; u.uRough.value = texOf(maps.rough.img === 'tile' ? 'rough' : 'roughPhoto', false);
      u.uOffC.value.set(maps.color.off[0] / N, -maps.color.off[1] / N); u.uOffR.value.set(maps.rough.off[0] / N, -maps.rough.off[1] / N); u.uOffN.value.set(maps.normal.off[0] / N, -maps.normal.off[1] / N);
    } else { u.uHasRough.value = s.scene === 'floor' || s.scene === 'plaza' ? 1 : 0; u.uRough.value = texOf('rough', false); u.uOffC.value.set(0, 0); u.uOffR.value.set(0, 0); u.uOffN.value.set(0, 0); }
    if (s.img === 'photo' && !maps) { u.uHasRough.value = 0; u.uHasNorm.value = 0; u.uRoughK.value = 0.8; }
    u.uMacro.value = s.macro ? s.macro.fac : 0; u.uMacroScale.value = s.macro ? s.macro.scale : 1;
    u.uMossOn.value = s.moss?.on ? 1 : 0; if (s.moss) { u.uMoss.value = texOf('moss'); u.uMossScale.value = s.moss.scale; u.uMaskScale.value = s.moss.mask; u.uMaskPos.value = s.moss.pos; }
    u.uSunDir.value.copy(sunDir(s));
    u.uSunI.value = 1.75;
    Object.assign(u, extra);
  }
  // The sun: in front of the camera for the PBR steps (so the reflections show), otherwise over the viewer's shoulder.
  function sunDir(s) { const el = s.sun * Math.PI / 180, c = Math.cos(el); return s.maps ? new THREE.Vector3(c * 0.43, Math.sin(el), -c * 0.9) : new THREE.Vector3(c * 0.5, Math.sin(el), c * 0.86); }
  function update() {
    const s = st(); if (builtScene !== s.scene) { build(); return; }
    const sd = sunDir(s); world.traverse(o => { if (o.material?.uniforms) o.material.uniforms.uSunDir.value.copy(sd); });
    if (s.scene === 'building') {
      for (const w of WALLS) {
        const m = wallMeshes[w.id]; setMat(m.material, s); m.material.uniforms.uScale.value.set(1, 1);
        m.material.uniforms.uHi.value = UV.sel.has(w.id) ? 1 : 0;
        const q = s.uv[w.id], uv = m.geometry.attributes.uv; // Plane order: tl, tr, bl, br
        [q[3], q[2], q[0], q[1]].forEach((p, i) => uv.setXY(i, p[0], p[1])); uv.needsUpdate = true;
      }
    } else if (mainMat) setMat(mainMat, s);
    dirty = true;
  }
  function resize3D() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
  new ResizeObserver(resize3D).observe(host);
  (function loop() { requestAnimationFrame(loop); if (dirty && !$('#bl').hidden) { renderer.render(scene, camera); dirty = false; } })();
  const ray = new THREE.Raycaster();
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (UV.modal) { confirmModal(); return; }
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables)[0], s = st();
    if (s.scene === 'building') { pick(hit?.object.userData.wall ?? null, e.shiftKey); return; }
    if (ctx.stepId() === 'u1' && hit && hit.uv) {
      const u = hit.uv.x * s.scale[0], v = hit.uv.y * s.scale[1], du = Math.abs(u - Math.round(u)), dv = Math.abs(v - Math.round(v));
      const edge = (du < 0.05 && Math.round(u) > 0 && Math.round(u) < s.scale[0]) || (dv < 0.05 && Math.round(v) > 0 && Math.round(v) < s.scale[1]);
      if (edge) { if (!s.flags.seam) { ctx.pushUndo(); s.flags.seam = true; } ctx.msg(s.img === 'photo' ? '✓ A seam: the right edge of one copy meets the left edge of the next, and they do not match.' : 'Found where two copies meet. With the tileable image there is nothing to see there.'); ctx.changed(); }
      else ctx.msg(tr('Not on a seam: the copies meet every {n} m.', { n: fmt(8 / s.scale[0]) }), true);
    }
  });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (UV.modal) cancelModal(); });

  // ─── Image / UV Editor ─────────────────────────────────────────────────────
  const ic = $('#img2d'), ih = $('#img-host'), g = ic.getContext('2d');
  const V = { ox: 0, oy: 0, sc: 200 };
  const UV = { sel: new Set(), modal: null, pivot: 'bbox', snap: false, pointer: { x: 0, y: 0, inside: false }, repeat: true, hover: null };
  let idirty = true;
  const toScr = (u, v) => [V.ox + u * V.sc, V.oy + (1 - v) * V.sc];
  const toUV = (x, y) => [(x - V.ox) / V.sc, 1 - (y - V.oy) / V.sc];
  function fit2D() {
    const w = ih.clientWidth, h = ih.clientHeight, s = st();
    if (s.editor === 'uv') {
      // Frame the square and every island.
      const b = bbox(Object.values(s.uv)), u0 = Math.min(0, b.u0) - 0.15, u1 = Math.max(1, b.u1) + 0.15, v0 = Math.min(0, b.v0) - 0.15, v1 = Math.max(1, b.v1) + 0.15;
      V.sc = Math.min((w - 20) / (u1 - u0), (h - 20) / (v1 - v0)); V.ox = (w - (u1 - u0) * V.sc) / 2 - u0 * V.sc; V.oy = (h - (v1 - v0) * V.sc) / 2 + (v1 - 1) * V.sc;
    } else if (ctx.stepId() === 'u2') {
      // Room for the UVs the shader reads after Mapping (up to 4 × 4).
      V.sc = Math.min(w - 36, h - 36) / 4.2; V.ox = 18; V.oy = h - 18 - V.sc;
    } else { V.sc = Math.min(w - 30, h - 30) * 0.62; V.ox = (w - V.sc) / 2; V.oy = (h - V.sc) / 2; }
    idirty = true;
  }
  function resize2D() { const w = ih.clientWidth, h = ih.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); if (!w || ctx.S.st?.app !== 'bl') return; ic.width = w * dpr; ic.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); fit2D(); }
  new ResizeObserver(resize2D).observe(ih);
  function shownImage() {
    const s = st(), id = ctx.stepId();
    if (s.scene === 'building') return 'bricks';
    if (s.scene === 'rock') return 'rock';
    if (s.maps) return s.show === 'rough' ? (s.maps.rough.img === 'tile' ? 'rough' : 'roughPhoto') : s.show === 'normal' ? 'normal' : 'tile';
    if (id === 'd1') return 't' + s.res;
    if (s.moss?.on && s.show === 'moss') return 'moss';
    return s.img === 'photo' ? 'photo' : 'tile';
  }
  const shownOffset = () => { const s = st(); return s.maps ? s.maps[s.show].off : [0, 0]; };
  function draw2D() {
    const w = ih.clientWidth, h = ih.clientHeight, s = st(), key = shownImage(), img = imgCanvas(key);
    g.fillStyle = '#232323'; g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = !key.startsWith('t') || key === 'tile' || V.sc < img.width * 1.2;
    const repeat = s.editor === 'uv' || UV.repeat, [ou, ov] = shownOffset().map(o => o / N);
    const k0 = repeat ? Math.floor(-V.ox / V.sc) - 1 : 0, k1 = repeat ? Math.ceil((w - V.ox) / V.sc) : 0, j0 = repeat ? Math.floor((V.oy - h) / V.sc) - 1 : 0, j1 = repeat ? Math.ceil(V.oy / V.sc) + 1 : 0;
    // The offset of a map in Photoshop moves its pixels; the lab draws that shift here too.
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const [x, y] = toScr(k + ou, j + 1 - ov);
      if (s.ext === 'clip' && (k || j) && s.editor !== 'uv') continue;
      g.drawImage(img, x, y, V.sc, V.sc);
      if (k !== 0 || j !== 0) { g.fillStyle = s.editor === 'uv' ? 'rgba(25,25,25,.42)' : 'rgba(20,20,20,.25)'; g.fillRect(x, y, V.sc, V.sc); }
    }
    const [x0, y0] = toScr(0, 1);
    g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(x0, y0, V.sc, V.sc); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.strokeRect(x0, y0, V.sc, V.sc); g.lineWidth = 1;
    g.font = '11px Inter, Segoe UI, sans-serif'; g.textBaseline = 'middle';
    if (s.editor === 'uv') drawIslands();
    else if (ctx.stepId() === 'u2') {
      // The floor: one island covering 0–1. The Mapping node makes the shader read 0–Scale.
      const [a, b] = toScr(0, 1); g.strokeStyle = '#ffa629'; g.lineWidth = 2; g.strokeRect(a, b, V.sc, V.sc); g.lineWidth = 1;
      label(t('Floor island (UV 0–1)'), a + 6, b + 12, '#ffc266');
      const [c, d] = toScr(0, s.scale[1]); g.strokeStyle = '#4fc3ff'; g.setLineDash([6, 4]); g.strokeRect(c, d, s.scale[0] * V.sc, s.scale[1] * V.sc); g.setLineDash([]);
      label(tr('What the shader reads after Mapping: 0–{n}', { n: fmt(s.scale[0]) }), c + 6, d + 12, '#8fd6ff');
    }
    label(`${IMAGES[key].name} · ${imgCanvas(key).width === 1024 && key === 't2048' ? 2048 : imgCanvas(key).width} px`, 8, h - 14, '#cfcfcf');
    idirty = false;
  }
  function label(text, x, y, color) { const tw = g.measureText(text).width; g.fillStyle = 'rgba(15,15,15,.78)'; g.fillRect(x - 4, y - 8, tw + 8, 16); g.fillStyle = color; g.fillText(text, x, y); }
  function drawIslands() {
    const s = st();
    for (const pass of [0, 1]) for (const w of WALLS) {
      const sel = UV.sel.has(w.id); if ((pass === 1) !== sel) continue;
      const q = s.uv[w.id], ok = report(w.id, q).ok;
      g.beginPath(); q.forEach(([u, v], i) => { const [x, y] = toScr(u, v); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = sel ? 'rgba(255,166,41,.22)' : UV.hover === w.id ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'; g.fill();
      g.strokeStyle = sel ? '#ffa629' : ok ? 'rgba(235,235,235,.9)' : '#ff8a65'; g.lineWidth = sel ? 2 : 1.3; g.stroke(); g.lineWidth = 1;
      // Bottom edge marked, so "up" is visible.
      const [a, b] = [toScr(...q[0]), toScr(...q[1])]; g.strokeStyle = sel ? '#ffd28a' : '#9ad0ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.lineWidth = 1;
      const c = bbox([q]), [cx, cy] = toScr(c.cu, c.cv); const txt = t(w.name); const tw = g.measureText(txt).width;
      g.fillStyle = 'rgba(15,15,15,.8)'; g.fillRect(cx - tw / 2 - 5, cy - 8, tw + 10, 16); g.fillStyle = sel ? '#ffc266' : '#fff'; g.fillText(txt, cx - tw / 2, cy);
    }
    if (ctx.stepId() === 'v3') for (const c of cornersOk(s)) {
      const A = s.uv[c.a], [x, y] = toScr(...A[1]); g.fillStyle = c.ok ? '#6cc070' : '#ff5a4a'; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
      const B = s.uv[c.b], [x2, y2] = toScr(...B[0]); g.beginPath(); g.arc(x2, y2, 4.5, 0, Math.PI * 2); g.fill();
    }
  }
  (function loop2() { requestAnimationFrame(loop2); if (idirty && !$('#bl').hidden && ctx.S.st?.app === 'bl') draw2D(); })();

  function pointInQuad(p, q) { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const a = q[i], b = q[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  const islandAt = (u, v) => { const s = st(); if (s.editor !== 'uv') return null; const hits = WALLS.filter(w => pointInQuad([u, v], s.uv[w.id])); return hits.length ? hits[hits.length - 1].id : null; };
  function pick(id, add) {
    if (!add) UV.sel.clear();
    if (id) { if (add && UV.sel.has(id)) UV.sel.delete(id); else UV.sel.add(id); }
    idirty = true; update(); renderProps();
  }
  let pan = null;
  ic.addEventListener('pointerdown', e => {
    const r = ic.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.button === 1) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY, ox: V.ox, oy: V.oy }; ic.setPointerCapture(e.pointerId); return; }
    if (e.button === 2) { if (UV.modal) cancelModal(); return; }
    if (e.button !== 0) return;
    if (UV.modal) { confirmModal(); return; }
    const [u, v] = toUV(x, y); if (st().editor === 'uv') pick(islandAt(u, v), e.shiftKey);
  });
  ic.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('pointerup', () => { pan = null; });
  ic.addEventListener('pointermove', e => {
    const r = ic.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    UV.pointer = { x, y, inside: true };
    if (pan) { V.ox = pan.ox + e.clientX - pan.x; V.oy = pan.oy + e.clientY - pan.y; idirty = true; return; }
    if (!UV.modal) { const hv = islandAt(...toUV(x, y)); if (hv !== UV.hover) { UV.hover = hv; idirty = true; } }
  });
  ic.addEventListener('pointerleave', () => { UV.pointer.inside = false; if (UV.hover) { UV.hover = null; idirty = true; } });
  ic.addEventListener('wheel', e => { e.preventDefault(); const r = ic.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, k = e.deltaY > 0 ? 1 / 1.15 : 1.15; const sc = Math.max(20, Math.min(5000, V.sc * k)), f = sc / V.sc; V.ox = x - (x - V.ox) * f; V.oy = y - (y - V.oy) * f; V.sc = sc; idirty = true; }, { passive: false });

  // ─── G, S, R on islands ────────────────────────────────────────────────────
  function startModal(kind) {
    const s = st(); if (s.editor !== 'uv') return;
    if (!UV.sel.size) { ctx.msg('Select an island first: click it in the UV Editor or on the building.', true); return; }
    const ids = [...UV.sel], b = bbox(ids.map(id => s.uv[id]));
    const start = UV.pointer.inside ? [UV.pointer.x, UV.pointer.y] : toScr(b.cu, b.cv).map((v, i) => v + (i ? 0 : 60));
    UV.modal = { kind, base: cloneUV(s.uv), ids, pu: b.cu, pv: b.cv, start: [...start], cur: [...start], axis: null, typed: '', ctrl: false };
    applyModal();
  }
  function applyModal() {
    const md = UV.modal, s = st(); if (!md) return;
    s.uv = cloneUV(md.base);
    const [pu, pv] = toScr(md.pu, md.pv), num = md.typed !== '' && md.typed !== '-' ? parseFloat(md.typed) : null;
    let readout = '';
    if (md.kind === 'G') {
      let du = (md.cur[0] - md.start[0]) / V.sc, dv = -(md.cur[1] - md.start[1]) / V.sc;
      if (num != null) { du = md.axis === 'Y' ? 0 : num; dv = md.axis === 'Y' ? num : 0; }
      if (md.axis === 'X') dv = 0; if (md.axis === 'Y') du = 0;
      if (md.ctrl && num == null) { const q = 1 / 16; du = Math.round(du / q) * q; dv = Math.round(dv / q) * q; }
      let snapped = false;
      if (UV.snap && num == null) {
        // Snap to vertex: the moving corner nearest to a corner of another island (within 12 px) lands exactly on it.
        let best = null;
        for (const id of md.ids) for (const p of md.base[id]) for (const w of WALLS) { if (md.ids.includes(w.id)) continue; for (const q of md.base[w.id]) { const dx = q[0] - (p[0] + du), dy = q[1] - (p[1] + dv), d = Math.hypot(dx, dy) * V.sc; if (d < 12 && (!best || d < best.d)) best = { d, dx, dy }; } }
        if (best) { du += best.dx; dv += best.dy; snapped = true; if (md.axis === 'X') dv = 0; if (md.axis === 'Y') du = 0; }
      }
      for (const id of md.ids) s.uv[id] = translate(s.uv[id], du, dv);
      readout = `D: ${du.toFixed(3)}  ${dv.toFixed(3)}${md.axis ? ` (${md.axis === 'X' ? 'U' : 'V'})` : ''}${snapped ? '  · snap' : ''}`;
    } else if (md.kind === 'S') {
      const d0 = Math.hypot(md.start[0] - pu, md.start[1] - pv) || 1;
      let k = num ?? Math.hypot(md.cur[0] - pu, md.cur[1] - pv) / d0;
      if (md.ctrl && num == null) k = Math.round(k * 10) / 10;
      const ku = md.axis === 'Y' ? 1 : k, kv = md.axis === 'X' ? 1 : k;
      for (const id of md.ids) { const c = UV.pivot === 'individual' ? bbox([md.base[id]]) : { cu: md.pu, cv: md.pv }; s.uv[id] = scaleQ(s.uv[id], ku, kv, c.cu, c.cv); }
      readout = `Scale: ${k.toFixed(3)}${md.axis ? ` (${md.axis === 'X' ? 'U' : 'V'})` : ''}`;
    } else {
      const a0 = Math.atan2(-(md.start[1] - pv), md.start[0] - pu), a1 = Math.atan2(-(md.cur[1] - pv), md.cur[0] - pu);
      let deg = num ?? (a1 - a0) * 180 / Math.PI;
      if (md.ctrl && num == null) deg = Math.round(deg / 5) * 5;
      for (const id of md.ids) { const c = UV.pivot === 'individual' ? bbox([md.base[id]]) : { cu: md.pu, cv: md.pv }; s.uv[id] = rotateQ(s.uv[id], deg, c.cu, c.cv); }
      readout = `Rot: ${deg.toFixed(1)}°`;
    }
    const ro = $('#op-readout'); ro.hidden = false; ro.textContent = readout + (md.typed ? `  [${md.typed}]` : '');
    idirty = true; update(); renderIslandPanel();
  }
  function endModal() { UV.modal = null; $('#op-readout').hidden = true; idirty = true; }
  function confirmModal() { const md = UV.modal; if (!md) return; const now = st().uv; st().uv = md.base; ctx.pushUndo(); st().uv = now; endModal(); ctx.changed(); reportSelection(); }
  function cancelModal() { if (!UV.modal) return; st().uv = UV.modal.base; endModal(); update(); renderProps(); ctx.msg('Cancelled.'); }
  window.addEventListener('pointermove', e => { if (!UV.modal) return; const r = ic.getBoundingClientRect(); UV.modal.cur = [e.clientX - r.left, e.clientY - r.top]; UV.modal.ctrl = e.ctrlKey || e.metaKey; applyModal(); });
  function reportSelection() {
    const s = st();
    for (const id of UV.sel) { const r = report(id, s.uv[id]); if (!r.ok) { ctx.msg(problem(r), true); return; } }
    if (UV.sel.size) ctx.msg(tr('✓ {n}: one tile covers 2 m, straight.', { n: [...UV.sel].map(id => t(WALL[id].name)).join(', ') }));
  }
  function problem(r) {
    const n = t(WALL[r.id].name);
    if (!r.upright) return tr('{n}: the rows of bricks are not horizontal ({a}°). Rotate it until the bottom edge (blue) is at the bottom and level.', { n, a: Math.round(r.angle) });
    if (!r.aspectOk) return tr('{n} is stretched: one tile covers {a} m across and {b} m up. Scale it along one axis only (S then X or Y).', { n, a: fmt(r.coverU), b: fmt(r.coverV) });
    return tr('{n}: one tile covers {a} m. It should cover 2 m.', { n, a: fmt(r.coverU) });
  }
  const OPS = {
    rotP: () => withSel(id => { const b = bbox([st().uv[id]]); st().uv[id] = rotateQ(st().uv[id], 90, b.cu, b.cv); }, 'Rotated 90°.'),
    rotM: () => withSel(id => { const b = bbox([st().uv[id]]); st().uv[id] = rotateQ(st().uv[id], -90, b.cu, b.cv); }, 'Rotated −90°.'),
    all: () => selectAll(true),
  };
  function withSel(fn, m) { if (!UV.sel.size) { ctx.msg('Select an island first: click it in the UV Editor or on the building.', true); return; } ctx.pushUndo(); for (const id of UV.sel) fn(id); ctx.changed(); ctx.msg(m); }
  function selectAll(on) { if (st().editor !== 'uv') return; UV.sel = new Set(on ? WALLS.map(w => w.id) : []); idirty = true; update(); renderProps(); }

  // ─── Properties: nodes and readouts ────────────────────────────────────────
  const node = (kind, title, body, extra = '') => `<div class="node node-${kind}"${extra}><div class="node-h" data-no-i18n>${esc(title)}</div><div class="node-b">${body}</div></div>`;
  const sel = (id, value, opts, dis = false) => `<select data-k="${id}"${dis ? ' disabled' : ''} data-no-i18n>${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const numIn = (id, value, step = 0.1, min = -999, max = 999, dis = false) => `<input type="number" data-k="${id}" value="${value}" step="${step}" min="${min}" max="${max}"${dis ? ' disabled' : ''}>`;
  const nrow = (label, ctl) => `<label class="n-row"><span data-no-i18n>${esc(label)}</span>${ctl}</label>`;
  const stat = (label, value, ok) => `<div class="sb-stat ${ok == null ? '' : ok ? 'good' : 'bad'}"><span>${esc(t(label))}</span><b data-no-i18n>${esc(value)}</b></div>`;
  const arrow = '<div class="n-link" aria-hidden="true"></div>';
  function renderProps() {
    const s = st(), id = ctx.stepId(); let h = '';
    if (s.scene === 'building') h += islandPanels();
    else {
      h += `<div class="panel nodes"><h4>${esc(t('Material nodes'))}<small data-no-i18n>Shader Editor</small></h4>`;
      if (s.maps) h += mapsNodes();
      else {
        const texOpts = [['uv', 'UV'], ['object', 'Object']];
        h += node('input', 'Texture Coordinate', nrow('Output', sel('coord', s.coord, texOpts, id !== 'd2'))) + arrow;
        h += node('vector', 'Mapping', `<div class="n-note" data-no-i18n>Type: Point</div>${nrow('Scale X', numIn('sx', s.scale[0], id === 'd2' ? 0.05 : 0.5, 0.01, 100, id === 'u1'))}${nrow('Scale Y', numIn('sy', s.scale[1], id === 'd2' ? 0.05 : 0.5, 0.01, 100, id === 'u1'))}`) + arrow;
        const imgOpts = s.scene === 'rock' ? [['rock', 'rock.png']] : [['photo', 'gravel_photo.jpg'], ['tile', 'gravel_tileable.png']];
        let body = nrow('Image', sel('img', s.img, imgOpts, id !== 'u1'));
        if (id === 'd1') body += nrow('Size', sel('res', s.res, [[256, '256 × 256'], [512, '512 × 512'], [1024, '1024 × 1024'], [2048, '2048 × 2048']]));
        body += nrow('Extension', sel('ext', s.ext, [['repeat', 'Repeat'], ['extend', 'Extend'], ['clip', 'Clip'], ['mirror', 'Mirror']], id !== 'u2'));
        body += nrow('Projection', sel('proj', s.proj, [['flat', 'Flat'], ['box', 'Box']], id !== 'd2'));
        if (s.proj === 'box' || id === 'd2') body += nrow('Blend', numIn('blend', s.blend, 0.05, 0, 1, s.proj !== 'box'));
        h += node('texture', 'Image Texture', body, ' data-show="color"');
        if (s.moss) h += mossNodes();
        if (s.macro) h += arrow + node('texture', 'Noise Texture', nrow('Scale', numIn('mscale', s.macro.scale, 0.01, 0.01, 5)) + `<div class="n-note">${esc(tr('Spots about {n} m', { n: fmt(noiseSize(s.macro.scale), 1) }))}</div>`) + arrow + node('color', 'Mix (Multiply)', nrow('Factor', `<input type="range" data-k="mfac" min="0" max="1" step="0.01" value="${s.macro.fac}"><output data-no-i18n>${fmt(s.macro.fac)}</output>`));
        h += arrow + node('shader', 'Principled BSDF', `<div class="n-note" data-no-i18n>Base Color ← Image</div>`);
      }
      h += '</div>';
      h += infoPanel();
    }
    $('#props').innerHTML = h;
  }
  function mapsNodes() {
    const s = st(), m = s.maps, id = ctx.stepId(), off = k => (id === 'm2' ? nrow('Offset X', numIn(`off-${k}-x`, m[k].off[0], 64, -2048, 2048)) + nrow('Offset Y', numIn(`off-${k}-y`, m[k].off[1], 64, -2048, 2048)) : '');
    const card = (k, title, imgSel, space) => node('texture', title, imgSel + nrow('Color Space', `<em class="n-val" data-no-i18n>${space}</em>`) + off(k) + `<button type="button" class="n-view${s.show === k ? ' on' : ''}" data-view="${k}">${esc(t(s.show === k ? 'Shown in the Image Editor' : 'Show in the Image Editor'))}</button>`, ` data-show="${k}"`);
    return card('color', 'Image Texture · Base Color', nrow('Image', `<em class="n-val" data-no-i18n>gravel_tileable.png</em>`), 'sRGB')
      + card('rough', 'Image Texture · Roughness', nrow('Image', sel('rough', m.rough.img, [['photo', 'gravel_rough_photo.png'], ['tile', 'gravel_rough.png']], id !== 'm1')), 'Non-Color')
      + card('normal', 'Image Texture · Normal', nrow('Image', `<em class="n-val" data-no-i18n>gravel_normal.png</em>`), 'Non-Color') + arrow
      + node('vector', 'Normal Map', `<div class="n-note" data-no-i18n>Tangent Space · Strength 1.0</div>`) + arrow + node('shader', 'Principled BSDF', `<div class="n-note" data-no-i18n>Base Color · Roughness · Normal</div>`)
      + `<div class="sun-row">${nrow('Sun elevation', `<input type="range" data-k="sun" min="6" max="80" value="${s.sun}"><output data-no-i18n>${s.sun}°</output>`)}</div>`;
  }
  function mossNodes() {
    const s = st(), m = s.moss;
    return arrow + node('texture', 'Image Texture · Moss', nrow('Use', `<input type="checkbox" data-k="moss-on"${m.on ? ' checked' : ''}>`) + nrow('Mapping Scale', numIn('moss-scale', m.scale, 0.1, 1, 60, !m.on)) + `<div class="n-note">${esc(tr('One copy covers {n} m', { n: fmt(mossTile(s)) }))}</div><button type="button" class="n-view${s.show === 'moss' ? ' on' : ''}" data-view="moss">${esc(t(s.show === 'moss' ? 'Shown in the Image Editor' : 'Show in the Image Editor'))}</button>`)
      + node('color', 'Noise Texture → Color Ramp (mask)', nrow('Position', `<input type="range" data-k="moss-pos" min="0.2" max="0.8" step="0.01" value="${m.pos}"${m.on ? '' : ' disabled'}><output data-no-i18n>${fmt(m.pos)}</output>`) + `<div class="n-note">${esc(tr('Moss covers about {n}%', { n: Math.round(coverage(m.pos) * 100) }))}</div>`);
  }
  function infoPanel() {
    const s = st(), id = ctx.stepId(); let h = `<div class="panel"><h4>${esc(t('Readout'))}<small>${esc(t('lab'))}</small></h4>`;
    const floorM = s.scene === 'plaza' ? 40 : 8;
    if (s.scene === 'floor' || s.scene === 'plaza') {
      h += stat('One copy covers', `${fmt(floorM / s.scale[0])} × ${fmt(floorM / s.scale[1])} m`, near(floorM / s.scale[0], 2) && near(floorM / s.scale[1], 2));
      h += stat('Copies on the floor', `${fmt(s.scale[0], 1)} × ${fmt(s.scale[1], 1)}`, null);
    }
    if (id === 'u1') h += stat('Seam found', s.flags.seam ? '✓' : '—', !!s.flags.seam) + stat('Image tiles', s.img === 'tile' ? '✓' : '✗', s.img === 'tile');
    if (id === 'u2') h += stat('Extension', { repeat: 'Repeat', extend: 'Extend', clip: 'Clip', mirror: 'Mirror' }[s.ext], s.ext === 'repeat');
    if (id === 'u2' && s.ext === 'mirror') h += `<p class="sb-empty">${esc(t('Mirror flips every other copy: it hides seams, but the flipped pattern is easy to spot.'))}</p>`;
    if (s.maps) h += stat('Roughness tiles', s.maps.rough.img === 'tile' ? '✓' : '✗', s.maps.rough.img === 'tile') + stat('Maps aligned', mapsAligned(s) ? '✓' : '✗', mapsAligned(s));
    if (id === 'd1') {
      const d = density(s), mb = s.res * s.res * 4 * 1.33 / 1048576;
      h += stat('Texel density', `${Math.round(d)} px/m`, d === 512) + stat('Target', '512 px/m', null) + stat('Memory (RGBA + mipmaps)', `${fmt(mb, 1)} MB`, null);
      if (s.res === 2048) h += `<p class="sb-empty">${esc(t('2048 px gives 1024 px/m: twice as sharp as needed, and four times the memory of 1024.'))}</p>`;
    }
    if (id === 'd2') {
      h += stat('Coordinates', s.coord === 'object' ? 'Object' : 'UV', s.coord === 'object') + stat('Projection', s.proj === 'box' ? 'Box' : 'Flat', s.proj === 'box') + stat('Blend', fmt(s.blend), s.blend >= 0.1 && s.blend <= 0.6);
      if (s.coord === 'object') h += stat('One copy covers', `${fmt(1 / s.scale[0])} m`, near(1 / s.scale[0], 2, 0.2));
      if (s.coord === 'object' && s.proj === 'flat') h += `<p class="sb-empty">${esc(t('Flat projection with Object coordinates only projects along Z: the sides get long streaks. Use Box.'))}</p>`;
    }
    if (s.macro) h += stat('Variation', fmt(s.macro.fac), s.macro.fac >= 0.25 && s.macro.fac <= 0.8) + stat('Spot size', `${fmt(noiseSize(s.macro.scale), 1)} m`, noiseSize(s.macro.scale) >= 6);
    if (s.moss) {
      const r = repeatTogether(TILE_M, mossTile(s)), cov = coverage(s.moss.pos);
      h += stat('Moss', s.moss.on ? `${Math.round(cov * 100)}%` : t('off'), s.moss.on && cov >= 0.15 && cov <= 0.6) + stat('Gravel repeats every', `${TILE_M} m`, null) + stat('Moss repeats every', `${fmt(mossTile(s))} m`, null) + stat('Both line up again every', r === Infinity ? '> 400 m' : `${fmt(r, 1)} m`, s.moss.on && r >= 20);
    }
    return h + '</div>';
  }
  const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
  function islandPanels() {
    const s = st(), id = ctx.stepId(), rs = wallReports(s);
    let h = `<div class="panel"><h4>${esc(t('Island'))}<small data-no-i18n>N › Island</small></h4><div id="island-panel-body">${islandRows()}</div></div>`;
    h += `<div class="panel"><h4>UV<small>${esc(t('selected islands'))}</small></h4><div class="tool-grid" data-no-i18n><button type="button" data-op="rotP">Rotate +90°</button><button type="button" data-op="rotM">Rotate −90°</button><button type="button" data-op="all">Select All <kbd>A</kbd></button></div></div>`;
    h += `<div class="panel"><h4>${esc(t('Islands'))}<small>${esc(tr('{a} of {b} right', { a: rs.filter(r => r.ok).length, b: rs.length }))}</small></h4><ul class="isl-list">${rs.map(r => `<li class="${r.ok ? 'ok' : ''}${UV.sel.has(r.id) ? ' sel' : ''}" data-isl="${r.id}"><i></i>${esc(t(WALL[r.id].name))}</li>`).join('')}</ul></div>`;
    if (id === 'v3') { const cs = cornersOk(s); h += `<div class="panel"><h4>${esc(t('Corners'))}<small>${esc(tr('{a} of {b} continue', { a: cs.filter(c => c.ok).length, b: cs.length }))}</small></h4>${cs.map(c => stat(`${t(WALL[c.a].name)} → ${t(WALL[c.b].name)}`, c.ok ? '✓' : '✗', c.ok)).join('')}</div>`; }
    return h;
  }
  function islandRows() {
    const s = st(), ids = [...UV.sel];
    if (!ids.length) return `<p class="sb-empty">${esc(t('Select an island in the UV Editor or on the building to see how the texture lies on it.'))}</p>`;
    return ids.slice(0, 2).map(id => { const r = report(id, s.uv[id]); return `<div class="isl-card${r.ok ? ' ok' : ''}"><strong>${esc(t(WALL[id].name))} · ${WALL[id].w} × ${WALL[id].h} m</strong>
      ${stat('One tile covers (U)', `${fmt(r.coverU)} m`, near(r.coverU, 2, 0.08))}${stat('One tile covers (V)', `${fmt(r.coverV)} m`, near(r.coverV, 2, 0.08))}${stat('Up is up', r.upright ? '✓' : `${Math.round(r.angle)}°`, r.upright)}${stat('Not stretched', r.aspectOk ? '✓' : '✗', r.aspectOk)}</div>`; }).join('') + (ids.length > 2 ? `<p class="sb-empty">${esc(tr('and {n} more', { n: ids.length - 2 }))}</p>` : '');
  }
  function renderIslandPanel() { const el = $('#island-panel-body'); if (el) el.innerHTML = islandRows(); }
  const props = $('#props');
  props.addEventListener('click', e => {
    const b = e.target.closest('button, li[data-isl]'); if (!b) return;
    if (b.dataset.op) OPS[b.dataset.op]();
    else if (b.dataset.isl) pick(b.dataset.isl, e.shiftKey);
    else if (b.dataset.view) { st().show = b.dataset.view; idirty = true; renderProps(); renderHeader(); }
  });
  let gesture = false;
  function edit(fn) { if (!gesture) { ctx.pushUndo(); gesture = true; setTimeout(() => { gesture = false; }, 700); } fn(st()); ctx.changed(); }
  props.addEventListener('change', e => {
    const k = e.target.dataset.k; if (!k) return; const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value, f = parseFloat(v);
    const clampN = (x, a, b) => (Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : a);
    edit(s => {
      if (k === 'coord') s.coord = v; else if (k === 'img') s.img = v; else if (k === 'ext') s.ext = v; else if (k === 'proj') s.proj = v; else if (k === 'res') s.res = +v;
      else if (k === 'sx') s.scale[0] = clampN(f, 0.01, 100); else if (k === 'sy') s.scale[1] = clampN(f, 0.01, 100); else if (k === 'blend') s.blend = clampN(f, 0, 1);
      else if (k === 'rough') s.maps.rough.img = v; else if (k === 'mscale') s.macro.scale = clampN(f, 0.01, 5);
      else if (k.startsWith('off-')) { const [, m, ax] = k.split('-'); s.maps[m].off[ax === 'x' ? 0 : 1] = Math.round(clampN(f, -2048, 2048)); }
      else if (k === 'moss-on') { s.moss.on = v; if (v) s.show = 'moss'; } else if (k === 'moss-scale') s.moss.scale = clampN(f, 1, 60);
    });
    if (k === 'img' || k === 'res') ctx.msg(k === 'img' ? (v === 'tile' ? 'gravel_tileable.png: the copies join without a line.' : 'gravel_photo.jpg: every copy ends in a seam.') : tr('Image size {n} px.', { n: v }));
    if (k === 'ext') ctx.msg({ repeat: 'Repeat: the image starts again after 1, in both directions.', extend: 'Extend: outside 0–1 the edge pixels are stretched out.', clip: 'Clip: outside 0–1 there is nothing (black).', mirror: 'Mirror: every other copy is flipped.' }[v]);
  });
  props.addEventListener('input', e => {
    const k = e.target.dataset.k; if (!['mfac', 'moss-pos', 'sun'].includes(k)) return; const f = +e.target.value;
    if (!gesture) { ctx.pushUndo(); gesture = true; setTimeout(() => { gesture = false; }, 700); }
    const s = st(); if (k === 'mfac') s.macro.fac = f; if (k === 'moss-pos') s.moss.pos = f; if (k === 'sun') s.sun = f;
    e.target.nextElementSibling.textContent = k === 'sun' ? `${f}°` : fmt(f);
    const note = e.target.closest('.node')?.querySelector('.n-note');
    if (note && k === 'moss-pos') note.textContent = tr('Moss covers about {n}%', { n: Math.round(coverage(f) * 100) });
    ctx.changed(true, true);
  });
  function renderHeader() {
    const s = st(), uv = s.editor === 'uv';
    $('#img-title').textContent = uv ? 'UV Editor' : 'Image Editor';
    $('#img-name').textContent = IMAGES[shownImage()].name;
    $('#repeat-field').hidden = uv; $('#snap-field').hidden = !uv; $('#pivot-field').hidden = !uv;
    $('#repeat-img').checked = UV.repeat; $('#snap').checked = UV.snap; $('#pivot').value = UV.pivot;
    $('#img-hint').textContent = uv ? 'LMB select · Shift add · G S R · Wheel zoom · MMB pan' : 'Wheel zoom · MMB pan · Home frame';
    $('#view-note').textContent = { floor: t('Floor 8 × 8 m · person 1.8 m'), building: t('Building 6 × 4 × 3 m'), rock: t('Rock about 2.5 m'), plaza: t('Square 40 × 40 m') }[s.scene];
  }
  $('#repeat-img').addEventListener('change', e => { UV.repeat = e.target.checked; idirty = true; });
  $('#snap').addEventListener('change', e => { UV.snap = e.target.checked; ctx.msg(UV.snap ? 'Snap to vertex: while moving, corners stick to the corners of other islands.' : 'Snap off.'); });
  $('#pivot').addEventListener('change', e => { UV.pivot = e.target.value; });

  function keydown(e) {
    const md = UV.modal;
    if (md) {
      const k = e.key;
      if (k === 'Escape') { cancelModal(); return true; }
      if (k === 'Enter') { confirmModal(); return true; }
      if ('xXyY'.includes(k) && k.length === 1) { if (md.kind !== 'R') { const a = k.toUpperCase(); md.axis = md.axis === a ? null : a; applyModal(); } return true; }
      if (/^[0-9.]$/.test(k) || (k === '-' && md.typed === '')) { md.typed += k; applyModal(); return true; }
      if (k === 'Backspace') { md.typed = md.typed.slice(0, -1); applyModal(); return true; }
      if (k === 'Control' || k === 'Meta') { md.ctrl = true; applyModal(); }
      return true;
    }
    const low = e.key.toLowerCase(); if (e.ctrlKey || e.metaKey) return false;
    if (low === 'g' || low === 's' || low === 'r') { if (st().editor !== 'uv') return false; startModal(low.toUpperCase()); return true; }
    if (low === 'a') { selectAll(!e.altKey); return true; }
    if (e.key === 'Home') { frame(); fit2D(); return true; }
    return false;
  }
  window.addEventListener('keyup', e => { if (UV.modal && (e.key === 'Control' || e.key === 'Meta')) { UV.modal.ctrl = false; applyModal(); } });

  return {
    enter() { UV.sel.clear(); UV.modal = null; $('#op-readout').hidden = true; UV.repeat = true; if (builtScene !== st().scene) build(); else update(); frame(); resize2D(); fit2D(); this.render(); },
    // light: a slider is being dragged; keep its panel and only refresh the readout.
    render(light) { update(); idirty = true; if (!light) { renderProps(); renderHeader(); } else { const ip = $('#props .panel:last-child'); if (ip) ip.outerHTML = infoPanel(); } },
    keydown,
    statusKeys: () => (st().editor === 'uv' ? '<span><kbd>G</kbd>Move</span><span><kbd>S</kbd>Scale</span><span><kbd>R</kbd>Rotate</span><span><kbd>X</kbd><kbd>Y</kbd>Axis</span><span><kbd>Ctrl</kbd>Snap increments</span><span><kbd>A</kbd>All</span><span><kbd>Home</kbd>Frame</span><span><kbd>Ctrl</kbd><kbd>Z</kbd>Undo</span>' : '<span><kbd>MMB</kbd>Orbit</span><span><kbd>Shift</kbd><kbd>MMB</kbd>Pan</span><span><kbd>Wheel</kbd>Zoom</span><span><kbd>Home</kbd>Frame</span><span><kbd>Ctrl</kbd><kbd>Z</kbd>Undo</span>'),
    select: ids => { UV.sel = new Set(ids); idirty = true; update(); renderProps(); },
    camera, controls, frame,
  };
}
