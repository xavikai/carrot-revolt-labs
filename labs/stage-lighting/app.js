// Stage Lighting Lab: a small theatre stage with a lighting rig, driven like a DMX lighting desk.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import * as R from './rig.js?v=1';
import { STAGES, TYPE_ORDER, keyFill, moverOnDancer, cycBlue, parWarm, amberOk, DIP_TARGET, FACE_MIN, BACK_MIN } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-stagelx:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-stagelx:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, flags: {}, undo: [], redo: [],
  done: store.get('done', {}), sel: null, hover: false, fade: null, chain: 0, cueSel: null,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];

let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

// ─── Data ────────────────────────────────────────────────────────────────────
const key = () => `data-${stage().id}-${S.step}`;
function saveData() { store.set(key(), { st: S.st, flags: S.flags }); }
function loadData() {
  const saved = store.get(key(), null);
  S.st = saved?.st?.fx ? saved.st : step().start();
  S.flags = saved?.flags || {};
  S.undo = []; S.redo = []; S.sel = step().focus || null; S.chain = 0; S.fade = null; S.cueSel = null;
}
const snap = () => JSON.stringify({ st: S.st, flags: S.flags });
function pushUndo() { S.undo.push(snap()); if (S.undo.length > 120) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(snap()); ({ st: S.st, flags: S.flags } = JSON.parse(S.undo.pop())); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(snap()); ({ st: S.st, flags: S.flags } = JSON.parse(S.redo.pop())); changed(); msg('Redo'); }
let gesture = false;
const beginEdit = () => { if (!gesture) { pushUndo(); gesture = true; } };
const endEdit = () => { gesture = false; };

// ─── Three.js ────────────────────────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.012;
const pv = new THREE.WebGLRenderer({ canvas: $('#preview'), antialias: true });
pv.setPixelRatio(Math.min(2, devicePixelRatio || 1)); pv.shadowMap.enabled = true; pv.shadowMap.type = THREE.PCFSoftShadowMap;
pv.toneMapping = THREE.ACESFilmicToneMapping; pv.toneMappingExposure = 0.012;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0b0d);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const pvCam = new THREE.PerspectiveCamera(46, 16 / 10, 0.1, 100); pvCam.position.set(0, 1.9, 11); pvCam.lookAt(0, 2.4, -4);
const ambient = new THREE.HemisphereLight(0xc8d0ff, 0x222222, 6); scene.add(ambient);      // the house: barely visible
const work = new THREE.HemisphereLight(0xfff4e0, 0x404040, 60); work.visible = false; scene.add(work);
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.addEventListener('change', () => requestRender());
host.addEventListener('pointerdown', e => { controls.mouseButtons.LEFT = e.button === 0 && e.altKey ? THREE.MOUSE.ROTATE : null; controls.mouseButtons.MIDDLE = e.button === 1 && e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; }, true);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...o });
function box(x0, x1, y0, y1, z0, z1, m) { const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); b.castShadow = true; b.receiveShadow = true; return b; }
// The stage: floor, black masking, a cyclorama, the house floor and the bars.
{
  const H = R.STAGE;
  scene.add(box(-H.half - 3, H.half + 3, -0.3, 0, H.cyc, 0.2, mat(0x5b4633, { roughness: 0.7 })));
  scene.add(box(-9, 9, -1.3, -1.0, 0.2, 14, mat(0x3a1c1c)));                                         // stalls floor
  const black = mat(0x0e0e10, { roughness: 1 });
  for (const s of [-1, 1]) for (const z of [-1.8, -4.6, -7]) scene.add(box(s * H.half, s * (H.half + 1.6), 0, 6.5, z - 0.03, z + 0.03, black));
  for (const z of [-1.5, -4.3, -6.8]) scene.add(box(-H.half - 1.6, H.half + 1.6, 6.8, 8.2, z - 0.03, z + 0.03, black));
  const cyc = new THREE.Mesh(new THREE.PlaneGeometry(H.half * 2 + 2, H.cycH), mat(0xd9d9dc, { roughness: 0.95 })); cyc.position.set(0, H.cycH / 2, H.cyc); cyc.receiveShadow = true; scene.add(cyc);
  const pipe = mat(0x55595f, { metalness: 0.6, roughness: 0.4 });
  for (const [z, y, w] of [[6, 6.35, 12], [-1, 6.35, 10], [-5.4, 6.35, 10], [-6.2, 6.55, 8]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, w, 8), pipe); p.rotation.z = Math.PI / 2; p.position.set(0, y, z); scene.add(p); }
  for (const s of [-1, 1]) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 7.6, 8), pipe); tr.position.set(s * 6, 3.8, 6); scene.add(tr); }
  // performers and the lectern
  const skin = mat(0xc99a7a, { roughness: 0.6 });
  const person = (x, z, dress) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.8, 6, 14), mat(dress, { roughness: 0.7 })); body.position.y = 0.95; g.add(body);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.62, 12), mat(0x1c1d22)); legs.position.y = 0.31; g.add(legs);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), skin); head.position.y = 1.58; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2a1a12)); hair.position.set(0, 1.6, -0.02); g.add(hair);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.position.set(x, 0, z); scene.add(g); return g;
  };
  person(R.ACTOR.x, R.ACTOR.z, 0x8a2f3a); person(R.ACTOR2.x, R.ACTOR2.z, 0xd8d0c4);
  const wood = mat(0x6a4a30);
  const lec = box(-0.3, 0.3, 0, R.LECTERN.h, -0.22, 0.22, wood); lec.position.set(R.LECTERN.x, R.LECTERN.h / 2, R.LECTERN.z); scene.add(lec);
}
// Fixtures: a body, a spotlight and a haze cone.
const objs = {};
const beamMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
const coneGeo = new THREE.ConeGeometry(1, 1, 32, 1, true); coneGeo.translate(0, -0.5, 0); coneGeo.rotateX(-Math.PI / 2); // apex at 0, opening towards -z… then +z below
const SHADOWS = new Set(['fohL', 'fohR', 'special', 'back', 'mover', 'pcC']);
function fixtureBody(f) {
  const g = new THREE.Group(), body = mat(0x26272b, { metalness: 0.4, roughness: 0.5 }), lens = new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false });
  const head = new THREE.Group(); g.add(head);
  const cyl = (r1, r2, l, z = 0, m = body) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, 16), m); c.rotation.x = Math.PI / 2; c.position.z = z; head.add(c); return c; };
  let front = 0.2;
  if (f.type === 'profile') { cyl(0.11, 0.11, 0.5, 0.1); cyl(0.14, 0.14, 0.24, -0.25); front = 0.36; }
  else if (f.type === 'fresnel' || f.type === 'pc') { cyl(0.17, 0.17, 0.32, 0); front = 0.17; }
  else if (f.type === 'par') { cyl(0.13, 0.11, 0.26, 0); front = 0.14; }
  else if (f.type === 'batten') { const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.14), body); head.add(b); front = 0.08; }
  else if (f.type === 'moving') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), body); base.position.y = 0.02; g.add(base);
    const yoke = new THREE.Group(); yoke.position.y = -0.06; g.add(yoke); g.remove(head); yoke.add(head);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.1), body); arm.position.set(s * 0.17, -0.14, 0); yoke.add(arm); }
    head.position.y = -0.24; cyl(0.12, 0.12, 0.3, 0); front = 0.15; g.userData.yoke = yoke;
  }
  const lensM = new THREE.Mesh(new THREE.CircleGeometry(f.type === 'batten' ? 0.05 : 0.1, 20), lens); lensM.position.z = front + 0.001; head.add(lensM);
  g.userData.head = head; g.userData.lens = lensM;
  return g;
}
for (const f of R.FIXTURES) {
  const g = fixtureBody(f); g.position.set(...f.pos); g.userData.id = f.id; scene.add(g);
  const spot = new THREE.SpotLight(0xffffff, 0, 0, 0.3, 0.5, 2); spot.position.set(...f.pos);
  if (SHADOWS.has(f.id)) { spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 30; }
  scene.add(spot, spot.target);
  const cone = new THREE.Mesh(coneGeo, beamMat()); cone.position.set(...f.pos); cone.renderOrder = 5; scene.add(cone);
  g.traverse(o => { o.userData.id = f.id; });
  objs[f.id] = { g, spot, cone };
}
const selRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffa640, toneMapped: false })); scene.add(selRing);

function aimHead(g, dir) {
  // point the head (its +z axis) along dir; a moving head turns its yoke (pan) and tilts its head
  if (g.userData.yoke) {
    const pan = Math.atan2(dir[0], dir[2]), h = Math.hypot(dir[0], dir[2]);
    g.userData.yoke.rotation.y = pan; g.userData.head.rotation.set(Math.atan2(-dir[1], h), 0, 0);
    return;
  }
  g.userData.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
}
function updateScene() {
  const st = S.st;
  for (const f of R.FIXTURES) {
    const s = st.fx[f.id], o = objs[f.id], dir = R.beamDir(f, s), col = R.lightColor(f, s);
    o.g.updateMatrixWorld(true); aimHead(o.g, dir);
    const half = R.beamAngle(f, s) / 2 * Math.PI / 180;
    o.spot.angle = Math.min(Math.PI / 2 - 0.01, half); o.spot.penumbra = Math.min(1, 0.05 + R.edgeOf(f, s) * 0.95);
    o.spot.intensity = s.dim * R.peakCd(f, s) * col.t; o.spot.color.set(col.hex); o.spot.visible = s.dim > 0.002;
    o.spot.target.position.set(f.pos[0] + dir[0] * 10, f.pos[1] + dir[1] * 10, f.pos[2] + dir[2] * 10);
    // the haze cone reaches the floor (or 14 m)
    const hit = R.floorHit(f, s), L = hit ? Math.min(16, Math.hypot(hit[0] - f.pos[0], hit[1] - f.pos[1], hit[2] - f.pos[2])) : 14;
    const r = L * Math.tan(half * (0.75 + 0.2 * R.edgeOf(f, s)));
    o.cone.scale.set(r, r, L); o.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir));
    o.cone.material.color.set(col.hex); o.cone.material.opacity = $('#o-haze').checked ? Math.min(0.16, s.dim * (0.025 + 0.06 * Math.sqrt(col.t) * Math.min(1.5, R.peakCd(f, s) / 30000))) : 0;
    o.cone.visible = s.dim > 0.002 && $('#o-haze').checked;
    o.g.userData.lens.material.color.set(s.dim > 0.01 ? new THREE.Color(col.hex).multiplyScalar(0.3 + 0.7 * s.dim) : 0x333333);
  }
  if (S.sel) { const f = R.FIX[S.sel]; selRing.visible = true; selRing.position.set(f.pos[0], f.pos[1] + 0.3, f.pos[2]); selRing.rotation.x = Math.PI / 2; } else selRing.visible = false;
  work.visible = $('#o-work').checked;
  requestRender();
}
let queued = false;
function requestRender() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; renderer.render(scene, camera); if ($('#o-preview').checked) { selRing.visible = false; pv.render(scene, pvCam); selRing.visible = !!S.sel; } }); }
function resize() {
  const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  const f = $('.seat-frame').getBoundingClientRect(); if (f.width) { pv.setSize(f.width, f.height, false); pvCam.aspect = f.width / f.height; pvCam.updateProjectionMatrix(); }
  requestRender();
}
const VIEWS = { front: [0, 0.18, 1], right: [1, 0.12, 0], top: [0.001, 1, 0.001] };
function frameAll(view = null) {
  const c = new THREE.Vector3(0, 2.6, -2.6), size = 12.5, dist = size / (2 * Math.tan(camera.fov * Math.PI / 360)) * (camera.aspect < 1.2 ? 1.3 : 1);
  const dir = new THREE.Vector3(...(VIEWS[view] || [0.55, 0.32, 1])).normalize();
  controls.target.copy(c); camera.position.copy(c).addScaledVector(dir, dist); camera.lookAt(c); controls.update(); requestRender();
}

// ─── Picking ─────────────────────────────────────────────────────────────────
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.altKey) return;
  const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(Object.values(objs).map(o => o.g), true)[0];
  select(hit ? hit.object.userData.id : null);
});
function select(id) { S.sel = id; updateScene(); renderFixtures(); renderInspector(); renderDmx(); drawOverlay(); }

// ─── Panels ─────────────────────────────────────────────────────────────────
const pct = v => Math.round(v * 100);
const row = (label, val, good) => `<div class="sb-stat${good == null ? '' : good ? ' good' : ' bad'}"><span>${esc(t(label))}</span><b>${val}</b></div>`;
const TYPE_ICON = { profile: '⊸', fresnel: '◎', pc: '◉', par: '●', batten: '▬', moving: '⟟' };
function renderFixtures() {
  const st = S.st;
  $('#fixtures').innerHTML = R.FIXTURES.map(f => { const s = st.fx[f.id], col = R.lightColor(f, s).hex, end = s.addr + R.footprint(f.type) - 1;
    return `<button type="button" class="fx-row${S.sel === f.id ? ' sel' : ''}" data-fx="${f.id}"><i class="fx-ic" style="color:${s.dim > 0.01 ? col : '#666'}">${TYPE_ICON[f.type]}</i><span class="fx-name">${esc(t(f.name))}<small>${esc(t(R.TYPES[f.type].short))} · ${s.addr}${end > s.addr ? '–' + end : ''}</small></span><span class="fx-lvl" style="--l:${pct(s.dim)}%">${pct(s.dim)}</span></button>`; }).join('');
}
$('#fixtures').addEventListener('click', e => { const b = e.target.closest('[data-fx]'); if (b) select(b.dataset.fx); });
function slider(k, label, v, min, max, stp, unit, fmt = x => x) { return `<div class="lk-slider"><span>${esc(t(label))}</span><input type="range" min="${min}" max="${max}" step="${stp}" value="${v}" data-k="${k}"><output>${fmt(v)}${unit}</output></div>`; }
function inspectorFixture() {
  const id = S.sel; if (!id) return `<div class="panel"><p class="sb-empty">${esc(t('Click a fixture in the view or in the list.'))}</p></div>`;
  const f = R.FIX[id], s = S.st.fx[id], T = R.TYPES[f.type], col = R.lightColor(f, s), dmx = R.dmxOf(f, s), end = s.addr + T.channels.length - 1;
  let h = `<div class="panel"><h4>${esc(t(f.name))}<small>${esc(t(T.name))}</small></h4><p class="f-kind">${esc(t(T.about))}</p>${row('DMX address', `${s.addr}${end > s.addr ? '–' + end : ''} · ${T.channels.length} ch`)}</div>`;
  h += `<div class="panel"><h4>${esc(t('Intensity'))}<small>${pct(s.dim)} % · DMX ${Math.round(s.dim * 255)}</small></h4>${slider('dim', 'Dimmer', pct(s.dim), 0, 100, 1, ' %')}
    <div class="row-buttons"><button type="button" data-lvl="1">${esc(t('Full'))}</button><button type="button" data-lvl="0.5">50 %</button><button type="button" data-lvl="0">${esc(t('Off'))}</button></div></div>`;
  if (T.source === 'tungsten') {
    h += `<div class="panel"><h4>${esc(t('Beam'))}</h4>`;
    if (T.zoom) h += slider('zoom', 'Zoom', Math.round(s.zoom), T.zoom[0], T.zoom[1], 1, '°');
    if (T.edgeAdjust) h += slider('edge', 'Edge', s.edge.toFixed(2), T.edge[0], T.edge[1], 0.01, '', x => (+x < 0.25 ? t('hard') : +x > 0.4 ? t('soft') : t('medium')) + ' ' + (+x).toFixed(2));
    h += row('Beam angle', `${Math.round(R.beamAngle(f, s))}°`) + row('Peak intensity', `${Math.round(R.peakCd(f, s) / 100) * 100} cd`) + `</div>`;
    h += `<div class="panel"><h4>${esc(t('Colour filter (gel)'))}<span class="swatch" style="background:${col.hex}"></span></h4><select data-k="gel">${Object.entries(R.GELS).map(([k, g]) => `<option value="${k}"${s.gel === k ? ' selected' : ''}>${esc(t(g.name))}</option>`).join('')}</select>${R.GELS[s.gel].about ? `<p class="sb-empty">${esc(t(R.GELS[s.gel].about))}</p>` : ''}${row('Light that passes', `${Math.round(R.GELS[s.gel].t * 100)} %`)}</div>`;
  }
  if (T.source === 'led') {
    const names = f.type === 'par' ? ['Red', 'Green', 'Blue', 'White'] : ['Red', 'Green', 'Blue'];
    h += `<div class="panel"><h4>${esc(t('Colour (LED mixing)'))}<span class="swatch" style="background:${col.hex}"></span></h4>${names.map((n, i) => slider('c' + i, n, pct(s.rgbw[i]), 0, 100, 1, ' %')).join('')}</div>`;
  }
  if (f.type === 'moving') {
    h += `<div class="panel"><h4>${esc(t('Position'))}</h4>${slider('pan', 'Pan', Math.round(s.pan), -R.PAN_RANGE / 2, R.PAN_RANGE / 2, 1, '°')}${slider('tilt', 'Tilt', Math.round(s.tilt), -R.TILT_RANGE / 2, R.TILT_RANGE / 2, 1, '°')}${slider('zoom', 'Zoom', Math.round(s.zoom), 10, 40, 1, '°')}</div>`;
    h += `<div class="panel"><h4>${esc(t('Colour wheel'))}</h4><div class="wheel">${R.WHEEL.map((w, i) => `<button type="button" class="wh${s.wheel === i ? ' on' : ''}" data-wheel="${i}" style="--c:${w.hex}" title="${esc(t(w.name))}"></button>`).join('')}</div></div>`;
  }
  if (step().dmxEdit) h += `<div class="panel"><h4>${esc(t('DMX channels'))}<small>0–255</small></h4><div class="ch-grid">${T.channels.map((c, i) => `<label><span>${s.addr + i}</span><b>${esc(t(c))}</b><input type="number" min="0" max="255" step="1" value="${dmx[i]}" data-ch="${i}"></label>`).join('')}</div></div>`;
  return h;
}
function stepPanel() {
  const s = step(), st = S.st;
  let h = '';
  if (s.id === 'f1') h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${TYPE_ORDER.map(ty => row(R.TYPES[ty].short, t(S.flags.seen?.includes(ty) ? 'seen' : 'not yet'), !!S.flags.seen?.includes(ty))).join('')}</div>`;
  if (s.id === 'f2') { const sp = st.fx.special, w = ['washL', 'washR'].find(id => st.fx[id].dim >= 0.5); h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Lectern special on, hard edge', `${pct(sp.dim)} % · ${sp.edge.toFixed(2)}`, sp.dim >= 0.5 && sp.edge <= 0.2)}${row('Fresnel wash, zoom ≥ 40°', w ? `${Math.round(st.fx[w].zoom)}°` : '—', !!w && st.fx[w].zoom >= 40)}</div>`; }
  if (s.id === 'd1') { const d = R.dmxOf(R.FIX.parL, st.fx.parL); h += `<div class="panel"><h4>${esc(t('Check'))}<small>LED PAR left</small></h4>${row('Values (D R G B W)', d.join(' · '), amberOk(st))}<p class="sb-empty">${esc(t('Target: dimmer 150–156, red 230–255, green 110–170, blue and white near 0.'))}</p></div>`; }
  if (s.patch) h += patchPanel();
  if (s.dip) h += dipPanel();
  if (s.id === 'l1') { const k = keyFill(st); h += `<div class="panel"><h4>${esc(t('Light meter'))}</h4>${row('Face (front)', `${Math.round(R.faceLux(st))} lx`, R.faceLux(st) >= FACE_MIN)}${row('FOH left on the face', `${Math.round(R.faceFrom(st, 'fohL'))} lx`)}${row('FOH right on the face', `${Math.round(R.faceFrom(st, 'fohR'))} lx`)}${row('Key : fill', isFinite(k) ? `${k.toFixed(2)} : 1` : '—', k >= 1.5 && k <= 3)}${row('Backlight (head)', `${Math.round(R.backLux(st))} lx`, R.backLux(st) >= BACK_MIN)}</div>`; }
  if (s.id === 'l2') { const cy = R.hueSat(R.lightColor(R.FIX.cycL, st.fx.cycL).hex), pa = R.hueSat(R.lightColor(R.FIX.parL, st.fx.parL).hex); h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Cyc: blue', `${Math.round(cy.h)}°`, cycBlue(st))}${row('LED PARs: warm', `${Math.round(pa.h)}°`, parWarm(st))}<p class="sb-empty">${esc(t('Hue on the colour wheel: red 0°, amber 30°, yellow 60°, green 120°, blue 220°.'))}</p></div>`; }
  if (s.id === 'l3') { const d = R.axisDistance(R.FIX.mover, st.fx.mover, [R.ACTOR2.x, 1.2, R.ACTOR2.z]); h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Beam to the dancer', isFinite(d) ? `${d.toFixed(2)} m` : '—', moverOnDancer(st))}${row('Dimmer', `${pct(st.fx.mover.dim)} %`, st.fx.mover.dim >= 0.5)}</div>`; }
  if (s.id === 'q1') { const c = st.cues; h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Cues recorded', `${c.length}`, c.length >= 2)}${c[0] ? row('Cue 1: singer dark, cyc lit', `${Math.round(R.faceLux(R.withLook(st, c[0].look)))} lx · ${Math.round(R.cycLux(R.withLook(st, c[0].look)))} lx`, R.faceLux(R.withLook(st, c[0].look)) < 50 && R.cycLux(R.withLook(st, c[0].look)) > 20) : ''}${c[1] ? row('Cue 2: face lit', `${Math.round(R.faceLux(R.withLook(st, c[1].look)))} lx`, R.faceLux(R.withLook(st, c[1].look)) >= FACE_MIN) : ''}</div>`; }
  if (s.id === 'q2') { const c = st.cues; h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Cue 2 fade ≥ 3 s', c[1] ? `${c[1].fade} s` : '—', c[1]?.fade >= 3)}${row('Last cue is a blackout', c.length >= 3 && R.isBlackout(c[c.length - 1].look) ? t('yes') : t('no'), c.length >= 3 && R.isBlackout(c[c.length - 1].look))}${row('Show run with GO', t(S.flags.ran ? 'yes' : 'not yet'), !!S.flags.ran)}</div>`; }
  return h;
}
function patchPanel() {
  const st = S.st, probs = R.patchProblems(st), bad = new Set(probs.flatMap(p => [p.a, p.b]).filter(Boolean));
  return `<div class="panel"><h4>${esc(t('Patch'))}<small>${probs.length ? esc(tr('{n} problems', { n: probs.length })) : esc(t('no overlaps'))}</small></h4><div class="patch">${R.FIXTURES.map(f => { const s = st.fx[f.id], n = R.footprint(f.type); return `<div class="pt-row${bad.has(f.id) ? ' bad' : ''}"><span>${esc(t(f.name))}</span><small>${n} ch</small><input type="number" min="1" max="512" value="${s.addr}" data-addr="${f.id}"><small>→ ${s.addr + n - 1}</small></div>`; }).join('')}</div>${probs.filter(p => p.kind === 'overlap').slice(0, 4).map(p => `<p class="c-hint">${esc(tr('{a} and {b} share channels.', { a: t(R.FIX[p.a].name), b: t(R.FIX[p.b].name) }))}</p>`).join('')}</div>`;
}
function dipPanel() {
  const st = S.st, a = R.dipAddress(st.dip);
  return `<div class="panel"><h4>${esc(t('DIP switches'))}<small>${esc(tr('address {a}', { a }))}</small></h4><div class="dip">${R.DIP_VALUES.map((v, i) => `<button type="button" class="dp${st.dip[i] ? ' on' : ''}" data-dip="${i}"><i></i><b>${i + 1}</b><small>${v}</small></button>`).join('')}</div>${row('Target address', `${DIP_TARGET}`, a === DIP_TARGET)}<p class="sb-empty">${esc(t('ON = up. The address is the sum of the values of the switches that are on.'))}</p></div>`;
}
function renderInspector() { $('#inspector').innerHTML = `<div id="ins-step">${stepPanel()}</div>${step().dip || step().patch ? '' : inspectorFixture()}`; }
function renderDmx() {
  const u = R.universe(S.st), selIds = S.sel ? [S.sel] : [];
  const cells = []; const N = 48;
  for (let i = 0; i < N; i++) {
    const own = u.owner[i], v = u.values[i], sel = own && selIds.some(id => own.split('+').includes(id)), clash = own && own.includes('+');
    cells.push(`<div class="dc${own ? ' used' : ''}${sel ? ' sel' : ''}${clash ? ' clash' : ''}" title="${own ? esc(own.split('+').map(id => t(R.FIX[id].name)).join(' + ')) : ''}"><small>${i + 1}</small><b>${v}</b><i style="height:${v / 255 * 100}%"></i></div>`);
  }
  $('#dmx').innerHTML = cells.join('');
  $('#dmx-note').textContent = tr('channels 1–{n} of 512', { n: N });
}
function renderCues() {
  const st = S.st;
  $('#cues').innerHTML = st.cues.length ? `<div class="cue-table">${st.cues.map((c, i) => `<div class="cue${st.live === i ? ' live' : ''}${S.cueSel === i ? ' sel' : ''}" data-cue="${i}"><b>${i + 1}</b><input type="text" value="${esc(c.name)}" data-cname="${i}" aria-label="Name"><label>${esc(t('Fade'))}<input type="number" min="0" max="30" step="0.5" value="${c.fade}" data-cfade="${i}"> s</label><button type="button" class="mini-x" data-cdel="${i}" title="${esc(t('Delete cue'))}">×</button></div>`).join('')}</div>` : `<p class="sb-empty cue-empty">${esc(t('No cues yet: build a look on stage and press Record.'))}</p>`;
  const cueStep = !!step().cuelist; $('.lk-cues').classList.toggle('dim', !cueStep);
}
// Inspector edits.
function fxEdit(fn) { const s = S.st.fx[S.sel]; fn(s); const T = R.TYPES[R.FIX[S.sel].type]; if (s.dim > 0.3) { S.flags.seen = [...new Set([...(S.flags.seen || []), R.FIX[S.sel].type])]; } }
$('#inspector').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k || !S.sel) return;
  beginEdit(); const v = +e.target.value;
  fxEdit(s => { if (k === 'dim') s.dim = v / 100; else if (k === 'zoom') s.zoom = v; else if (k === 'edge') s.edge = v; else if (k === 'pan') s.pan = v; else if (k === 'tilt') s.tilt = v; else if (k[0] === 'c') s.rgbw[+k[1]] = v / 100; });
  live();
});
$('#inspector').addEventListener('change', e => {
  const x = e.target;
  if (x.dataset.k === 'gel' && S.sel) { pushUndo(); fxEdit(s => { s.gel = x.value; }); changed(); return; }
  if (x.dataset.k) { endEdit(); changed(); return; }
  if (x.dataset.ch != null && S.sel) { pushUndo(); fxEdit(s => { R.setChannel(R.FIX[S.sel], s, +x.dataset.ch, +x.value || 0); }); changed(); return; }
  if (x.dataset.addr) { pushUndo(); S.st.fx[x.dataset.addr].addr = Math.max(1, Math.min(512, Math.round(+x.value || 1))); changed(); return; }
});
$('#inspector').addEventListener('click', e => {
  const l = e.target.closest('[data-lvl]'); if (l && S.sel) { pushUndo(); fxEdit(s => { s.dim = +l.dataset.lvl; }); changed(); return; }
  const w = e.target.closest('[data-wheel]'); if (w && S.sel) { pushUndo(); fxEdit(s => { s.wheel = +w.dataset.wheel; }); changed(); return; }
  const d = e.target.closest('[data-dip]'); if (d) { pushUndo(); S.st.dip[+d.dataset.dip] = !S.st.dip[+d.dataset.dip]; changed(); return; }
});
// While a slider moves: the stage, the numbers and the DMX follow; the panel keeps the slider.
function live() {
  updateScene(); renderFixtures(); renderDmx();
  const ins = $('#ins-step'); if (ins) ins.innerHTML = stepPanel();
  document.querySelectorAll('#inspector .lk-slider').forEach(sl => { const i = sl.querySelector('input'), o = sl.querySelector('output'); const k = i.dataset.k; o.textContent = k === 'dim' || k[0] === 'c' ? `${i.value} %` : k === 'edge' ? `${+i.value < 0.25 ? t('hard') : +i.value > 0.4 ? t('soft') : t('medium')} ${(+i.value).toFixed(2)}` : `${i.value}°`; });
  const sel = S.sel && S.st.fx[S.sel]; if (sel) { const sw = document.querySelector('#inspector .swatch'); if (sw) sw.style.background = R.lightColor(R.FIX[S.sel], sel).hex; }
  checkProgress(); renderGuideState();
}
// Cues.
$('#record').onclick = () => {
  pushUndo(); const n = S.st.cues.length + 1;
  S.st.cues.push({ name: tr('Cue {n}', { n }), fade: 2, look: R.lookOf(S.st) }); S.st.live = S.st.cues.length - 1; S.cueSel = S.st.live;
  changed(); msg(tr('Cue {n} recorded.', { n }));
};
$('#blackout').onclick = () => { pushUndo(); for (const f of R.FIXTURES) S.st.fx[f.id].dim = 0; changed(); msg('Blackout: every fixture at 0.'); };
function goTo(i, fade = true) {
  const st = S.st, cue = st.cues[i]; if (!cue) return;
  const from = R.lookOf(st), to = cue.look, dur = fade ? cue.fade * 1000 : 0, t0 = performance.now();
  S.fade && cancelAnimationFrame(S.fade);
  const tick = now => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    R.applyLook(st, R.blendLook(from, to, k)); updateScene(); renderFixtures(); renderDmx(); drawOverlay(k < 1 ? tr('Fading to cue {n}… {p} %', { n: i + 1, p: Math.round(k * 100) }) : null);
    if (k < 1) S.fade = requestAnimationFrame(tick); else { S.fade = null; changed(); }
  };
  st.live = i; S.cueSel = i; S.fade = requestAnimationFrame(tick);
}
$('#go').onclick = () => {
  const st = S.st; if (!st.cues.length) return msg('No cues yet: build a look on stage and press Record.', true);
  const next = st.live + 1 >= st.cues.length ? 0 : st.live + 1;
  S.chain = next === 0 ? 1 : S.chain + 1;
  if (next === st.cues.length - 1 && S.chain >= st.cues.length) S.flags.ran = true;
  goTo(next); msg(tr('GO: cue {n} ({s} s)', { n: next + 1, s: st.cues[next].fade }));
};
$('#back').onclick = () => { const st = S.st; if (st.live > 0) { S.chain = 0; goTo(st.live - 1, false); } };
$('#cues').addEventListener('click', e => {
  const del = e.target.closest('[data-cdel]'); if (del) { pushUndo(); S.st.cues.splice(+del.dataset.cdel, 1); S.st.live = Math.min(S.st.live, S.st.cues.length - 1); changed(); return; }
  const c = e.target.closest('[data-cue]'); if (c && !e.target.matches('input')) { S.chain = +c.dataset.cue === 0 ? 1 : 0; goTo(+c.dataset.cue, false); }
});
$('#cues').addEventListener('change', e => {
  const x = e.target;
  if (x.dataset.cfade != null) { pushUndo(); S.st.cues[+x.dataset.cfade].fade = Math.max(0, Math.min(30, +x.value || 0)); changed(); }
  if (x.dataset.cname != null) { pushUndo(); S.st.cues[+x.dataset.cname].name = x.value.slice(0, 30); saveData(); }
});
function drawOverlay(note = null) { $('#view-overlay').innerHTML = `<div>${esc(t('User Perspective'))}</div><div>${S.sel ? `<b>${esc(t(R.FIX[S.sel].name))}</b>` : esc(t('Nothing selected'))}</div>${note ? `<div class="fading">${esc(note)}</div>` : ''}`; }
['#o-haze', '#o-work'].forEach(id => { $(id).onchange = () => updateScene(); });
$('#o-preview').onchange = e => { $('#preview-box').hidden = !e.target.checked; resize(); };

// ─── Stages, guide and step card ────────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const stepDone = i => i === S.step ? !!step().check(S.st, { flags: S.flags }) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide');
  g.classList.toggle('three', st.steps.length === 3); g.classList.toggle('two', st.steps.length === 2);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
function renderGuideState() { const li = document.querySelector(`#guide li[data-step="${S.step}"]`); if (li && li.classList.contains('done') !== stepDone(S.step)) { renderGuide(); renderStepCard(); } }
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
  if (id === 'show-solution') { pushUndo(); const st = step().start(), flags = {}; step().solve(st, flags); S.st = st; S.flags = flags; changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
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
  checkProgress(); renderFixtures(); renderInspector(); renderDmx(); renderCues(); renderGuide(); renderStepCard(); drawOverlay();
}
function enterStep() {
  loadData(); lastOk = null;
  updateScene(); lastOk = stepDone(S.step);
  renderStageSwitch(); renderFixtures(); renderInspector(); renderDmx(); renderCues(); renderGuide(); renderStepCard(); drawOverlay();
}
function renderAll() { renderStageSwitch(); renderFixtures(); renderInspector(); renderDmx(); renderCues(); renderGuide(); renderStepCard(); drawOverlay(); translateTitles(); }
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }

// ─── Keyboard ───────────────────────────────────────────────────────────────
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (!S.hover) return;
  const k = e.key, low = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, code = e.code;
  let handled = true;
  if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (low === 'f' && S.sel) { pushUndo(); fxEdit(s => { s.dim = 1; }); changed(); }
  else if (k === '0' && S.sel) { pushUndo(); fxEdit(s => { s.dim = 0; }); changed(); }
  else if (k === ' ' && step().cuelist) $('#go').click();
  else if (k === 'Home') frameAll();
  else if (code === 'Numpad1') frameAll('front');
  else if (code === 'Numpad3') frameAll('right');
  else if (code === 'Numpad7') frameAll('top');
  else if (k === 'Escape') select(null);
  else handled = false;
  if (handled) e.preventDefault();
});

// ─── Start ──────────────────────────────────────────────────────────────────
new ResizeObserver(resize).observe(host);
onLangChange(() => renderAll());
enterStep(); frameAll(); resize(); translateTitles();
window.__lx = { S, R, STAGES, select, changed, camera }; // for tests and curious students
