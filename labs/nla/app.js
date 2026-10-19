// NLA Lab: a Blender-style Animation workspace with a 3D Viewport, a Dope Sheet in Action Editor mode,
// the Nonlinear Animation editor (tracks, strips, Sidebar) and a Timeline.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import * as N from './nla.js?v=2';
import { STAGES } from './stages.js?v=2';
import { ICONS } from '../../blender-ui.js?v=2';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=2';
import { helpTitle, HELP } from './help.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, d = 2) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : (+v).toFixed(d).replace(/0+$/, '').replace(/\.$/, ''));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-nla:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-nla:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: clamp(store.get('stage', 0), 0, STAGES.length - 1), step: clamp(store.get('step', 0), 0, 4), st: null,
  undo: [], redo: [], done: store.get('done', {}), hover: null, playing: false,
  views: { nla: { a: -4, b: 124 }, ae: { a: -2, b: 52 } }, sb: true, sbTab: 'strip',
  keySel: new Set(), modal: null, drag: null, pointer: null, showStack: true, showBones: false, renaming: null, infHover: false,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];

// ─── Undo, messages, persistence ────────────────────────────────────────────
let msgTimer;
function msg(text, warning = false) {
  if (!text) return;
  const el = $('#status-msg');
  el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 6500);
}
// Run an operator on the state as one undo step. Errors from the model become warnings and change nothing.
function act(fn) {
  const before = JSON.stringify(S.st);
  try {
    const m = fn(S.st); N.validate(S.st);
    if (JSON.stringify(S.st) !== before) { S.undo.push(before); if (S.undo.length > 100) S.undo.shift(); S.redo = []; }
    changed(); if (m) msg(m); return true;
  } catch (e) { S.st = JSON.parse(before); changed(); msg(e.message || String(e), true); return false; }
}
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); S.keySel.clear(); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo'); }
const dataKey = () => `data-${stage().id}-${S.step}`;
let saveTimer;
function saveData() { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set(dataKey(), S.st), 150); }
function loadData() {
  const saved = store.get(dataKey(), null);
  S.st = saved && saved.tracks && saved.actions && saved.adt ? saved : step().start();
  N.validate(S.st);
  S.undo = []; S.redo = []; S.keySel.clear(); S.modal = null;
  frameAllNLA(); frameAllAE();
}

// ─── 3D Viewport: the mannequin ─────────────────────────────────────────────
const canvas = $('#view'), host = $('#view-host');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(0.6, 0.9, 1); camera.add(sun);
const grid = new THREE.GridHelper(10, 20, 0x5a5a5a, 0x474747); scene.add(grid);
const controls = new OrbitControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.addEventListener('change', () => schedule('view'));
host.addEventListener('pointerdown', e => { controls.mouseButtons.LEFT = e.button === 0 && e.altKey ? THREE.MOUSE.ROTATE : null; controls.mouseButtons.MIDDLE = e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; }, true);
const B2T = ([x, y, z]) => new THREE.Vector3(x, z, -y);   // Blender (Z up, −Y front) → three.js (Y up, +Z front)
const skin = new THREE.MeshStandardMaterial({ color: 0xbfc3ca, roughness: 0.6 });
const joint = new THREE.MeshStandardMaterial({ color: 0x8e939b, roughness: 0.6 });
const NODES = {};
(function buildMannequin() {
  const restQ = {}, head = {};
  for (const b of N.BONES) {
    const h = B2T(b.head), tl = B2T(b.tail), dir = tl.clone().sub(h), len = dir.length(); dir.normalize();
    let X = new THREE.Vector3(1, 0, 0); X.addScaledVector(dir, -X.dot(dir));
    if (X.length() < 1e-4) X = new THREE.Vector3(0, 0, 1).addScaledVector(dir, -dir.z);
    X.normalize(); const Z = new THREE.Vector3().crossVectors(X, dir);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, dir, Z));
    restQ[b.name] = q; head[b.name] = h;
    const node = new THREE.Group();
    if (b.parent) {
      const pq = restQ[b.parent].clone().invert();
      node.position.copy(h.clone().sub(head[b.parent]).applyQuaternion(pq));
      node.userData.restRel = pq.multiply(q);
      NODES[b.parent].add(node);
    } else { node.position.copy(h); node.userData.restRel = q.clone(); scene.add(node); }
    node.userData.basePos = node.position.clone(); node.quaternion.copy(node.userData.restRel);
    const add = (g, m = skin) => { const o = new THREE.Mesh(g, m); node.add(o); return o; };
    const capsule = (r, l) => { const g = new THREE.CapsuleGeometry(r, Math.max(0.01, l - 2 * r), 6, 14); g.translate(0, l / 2, 0); return g; };
    const box = (x, y, z, cy, cz = 0) => { const g = new THREE.BoxGeometry(x, y, z); g.translate(0, cy, cz); return g; };
    switch (b.name) {
      case 'Root': { const g = new THREE.RingGeometry(0.33, 0.36, 48); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe39a3a, side: THREE.DoubleSide })); m.position.set(0, 0.002, 0); scene.add(m); break; }
      case 'Hips': add(box(0.34, 0.2, 0.2, 0.06)); break;
      case 'Spine': add(capsule(0.11, len + 0.04)); break;
      case 'Chest': add(box(0.42, 0.26, 0.22, 0.1)); break;
      case 'Head': add(new THREE.SphereGeometry(0.11, 24, 16).translate(0, 0.13, 0.01)); add(box(0.15, 0.045, 0.06, 0.15, 0.1), new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.35 })); add(capsule(0.045, 0.08).translate(0, -0.04, 0), joint); break;
      case 'Hand.L': case 'Hand.R': add(box(0.07, len, 0.04, len / 2)); break;
      case 'Foot.L': case 'Foot.R': add(box(0.09, len + 0.03, 0.06, len / 2 - 0.01)); break;
      default: if (/Arm|Forearm/.test(b.name)) add(capsule(b.name.startsWith('Upper') ? 0.05 : 0.043, len)); else if (/Thigh|Shin/.test(b.name)) add(capsule(b.name.startsWith('Thigh') ? 0.07 : 0.055, len));
    }
    if (!b.control) {
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, len, 0)]);
      const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7fd3ff, depthTest: false, transparent: true }));
      line.renderOrder = 10; line.visible = false; node.add(line); node.userData.line = line;
    }
    NODES[b.name] = node;
  }
})();
const euler = new THREE.Euler(), qPose = new THREE.Quaternion(), D2R = Math.PI / 180;
function applyPose(pose) {
  for (const b of N.BONES) {
    const n = NODES[b.name]; if (b.control) continue;
    euler.set((pose[b.name + '.rx'] || 0) * D2R, (pose[b.name + '.ry'] || 0) * D2R, (pose[b.name + '.rz'] || 0) * D2R, 'ZYX');
    n.quaternion.copy(n.userData.restRel).multiply(qPose.setFromEuler(euler));
    const ly = pose[b.name + '.ly'] || 0;
    n.position.copy(n.userData.basePos).add(new THREE.Vector3(0, ly, 0).applyQuaternion(n.userData.restRel));
    const s = pose[b.name + '.s'] ?? 1; n.scale.setScalar(s);
    if (n.userData.line) n.userData.line.visible = S.showBones;
  }
}
function frameView() { controls.target.set(0, 0.9, 0); camera.position.set(2.6, 1.7, 3.7); camera.up.set(0, 1, 0); controls.update(); schedule('view'); }
function resizeView() { const r = host.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); schedule('view'); }

// ─── Shared drawing helpers ─────────────────────────────────────────────────
function setupCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w: r.width, h: r.height };
}
function niceStep(pxPerFrame) { for (const s of [1, 2, 5, 10, 20, 25, 50, 100]) if (s * pxPerFrame >= 42) return s; return 200; }
function drawRuler(g, x0, w, view, toX, h = 24) {
  g.fillStyle = '#262626'; g.fillRect(x0, 0, w, h);
  const pf = w / (view.b - view.a), stp = niceStep(pf);
  g.font = '11px Inter, Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let f = Math.ceil(view.a / stp) * stp; f <= view.b; f += stp) { const x = toX(f); g.fillStyle = '#3c3c3c'; g.fillRect(Math.round(x), h, 1, 4000); g.fillStyle = '#a8a8a8'; g.fillText(String(f), x, h / 2); }
  g.fillStyle = '#161616'; g.fillRect(x0, h - 1, w, 1);
}
function drawPlayhead(g, x, hTotal, label) {
  g.fillStyle = '#4772b3'; g.fillRect(Math.round(x) - 1, 0, 2, hTotal);
  g.font = '600 11px Inter, Segoe UI, Arial'; const tw = Math.max(26, g.measureText(label).width + 10);
  g.beginPath(); g.roundRect(x - tw / 2, 3, tw, 18, 4); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, 12);
}
function diamond(g, x, y, r, fill, stroke = '#000') { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }

// ─── Nonlinear Animation editor ─────────────────────────────────────────────
const ROW = 24, RULER = 24;
const nlaCv = $('#nla'), nlaHost = $('#nla-host'), nlaScroll = $('#nla-scroll');
// Rows from the top: the object, the action line, then the tracks from the top track down.
function nlaRows() { const rows = [{ kind: 'obj' }, { kind: 'aline' }]; for (let i = S.st.tracks.length - 1; i >= 0; i--) rows.push({ kind: 'track', ti: i }); return rows; }
const rowOfTrack = ti => 2 + (S.st.tracks.length - 1 - ti);
const nlaW = () => nlaHost.getBoundingClientRect().width;
const nX = f => (f - S.views.nla.a) / (S.views.nla.b - S.views.nla.a) * nlaW();
const nF = x => S.views.nla.a + x / nlaW() * (S.views.nla.b - S.views.nla.a);
function frameAllNLA() {
  let a = S.st.range[0], b = S.st.range[1];
  for (const s of N.allStrips(S.st)) { a = Math.min(a, s.start); b = Math.max(b, s.end); }
  const pad = (b - a) * 0.04 + 2; S.views.nla = { a: a - pad, b: b + pad }; schedule('nla');
}
const STRIP_COL = {
  action: ['#7d5f24', '#ffae3d', '#f4e4c4', '#1b1405'], transition: ['#28465f', '#4b92e0', '#d8e8f8', '#06121f'], meta: ['#4a3466', '#9356d6', '#eadcf8', '#150a22'],
};
function stripGeom(s, ti) { const y = RULER + rowOfTrack(ti) * ROW; return { x0: nX(s.start), x1: nX(s.end), y: y + 3, h: ROW - 6 }; }
function drawStrip(g, s, ti, tweakId, off) {
  const { x0, x1, y, h } = stripGeom(s, ti), w = Math.max(2, x1 - x0);
  const tweaking = s.id === tweakId, dim = (tweakId && !tweaking) || off;
  const [cu, cs, tu, ts] = STRIP_COL[s.type] || STRIP_COL.action;
  let fill = s.select ? cs : cu, text = s.select ? ts : tu;
  if (tweaking) { fill = '#5ad13c'; text = '#0c2006'; }
  g.save(); g.globalAlpha = s.mute ? 0.4 : dim ? 0.5 : 1;
  g.fillStyle = fill; g.beginPath(); g.roundRect(x0, y, w, h, 3); g.fill();
  // Repeats: a line where each cycle starts.
  if (s.type === 'action' && s.repeat > 1) { g.fillStyle = s.select ? '#00000055' : '#00000077'; const cyc = (s.end - s.start) / s.repeat; for (let k = 1; k < s.repeat; k++) g.fillRect(Math.round(nX(s.start + cyc * k)), y + 2, 1, h - 4); }
  // The influence: a line from the bottom (0) to the top (1) of the strip.
  if (s.type === 'action' && (s.blendIn > 0 || s.blendOut > 0 || s.animInf)) {
    g.strokeStyle = s.select ? '#3a2400' : '#ffd38a'; g.lineWidth = 1.4; g.beginPath();
    const n = Math.max(8, Math.min(120, Math.round(w / 3)));
    for (let i = 0; i <= n; i++) { const f = s.start + (s.end - s.start) * i / n, inf = N.stripInfluence(s, f), x = nX(f), yy = y + h - 1 - inf * (h - 2); i ? g.lineTo(x, yy) : g.moveTo(x, yy); }
    g.stroke();
  }
  g.lineWidth = s.id === S.st.sel.strip ? 1.8 : 1; g.strokeStyle = s.id === S.st.sel.strip ? '#ffffff' : '#000000';
  if (s.mute) g.setLineDash([4, 3]);
  g.beginPath(); g.roundRect(x0 + 0.5, y + 0.5, w - 1, h - 1, 3); g.stroke(); g.setLineDash([]);
  if (w > 26) {
    g.fillStyle = text; g.font = '600 11px Inter, Segoe UI, Arial'; g.textBaseline = 'middle'; g.textAlign = 'left';
    let label = s.name; if (s.type === 'action' && s.repeat > 1) label += `  ×${fmt(s.repeat)}`; if (s.type === 'meta') label += `  (${s.children.length})`;
    if (s.reversed) label += '  ◂'; g.save(); g.beginPath(); g.rect(x0 + 4, y, w - 8, h); g.clip();
    g.fillText(label, x0 + 6, y + h / 2 + 0.5);
    if (s.select && w > 110) { g.textAlign = 'right'; g.font = '10px Inter, Segoe UI, Arial'; g.fillText(`${fmt(s.start)} – ${fmt(s.end)}`, x1 - 6, y + h / 2 + 0.5); }
    g.restore();
  }
  g.restore();
}
// Held frames (Hold, Hold Forward) are drawn as a faint band, as Blender does.
function drawExtrapolation(g, t, ti, off) {
  const strips = t.strips.filter(s => !s.mute), y = RULER + rowOfTrack(ti) * ROW + 6, h = ROW - 12, W = nlaW();
  strips.forEach((s, i) => {
    if (s.type === 'transition') return;
    const col = (STRIP_COL[s.type] || STRIP_COL.action)[0];
    g.save(); g.globalAlpha = off ? 0.12 : 0.32; g.fillStyle = col;
    if (s.extrap === 'HOLD' && i === 0) { const x = nX(s.start); g.fillRect(0, y, Math.max(0, x), h); }
    if (s.extrap !== 'NOTHING') { const next = strips[i + 1], x0 = nX(s.end), x1 = next ? nX(next.start) : W; if (x1 > x0) g.fillRect(x0, y, x1 - x0, h); }
    g.restore();
  });
}
function drawNLA() {
  const rows = nlaRows(), total = RULER + rows.length * ROW;
  const vis = nlaScroll.getBoundingClientRect().height;
  nlaHost.style.height = Math.max(vis, total) + 'px';
  const { g, w, h } = setupCanvas(nlaCv), st = S.st, tweak = st.adt.tweak, solo = N.anySolo(st);
  g.fillStyle = '#1d1d1d'; g.fillRect(0, 0, w, h);
  rows.forEach((r, i) => {
    const y = RULER + i * ROW;
    if (r.kind === 'obj') { g.fillStyle = '#353535'; g.fillRect(0, y, w, ROW); return; }
    if (r.kind === 'aline') {
      g.fillStyle = '#3b2f19'; g.fillRect(0, y, w, ROW);
      const name = tweak ? null : st.adt.action;
      if (name && st.actions[name]) {
        const [a, b] = N.actionRange(st.actions[name]);
        g.fillStyle = '#80602a88'; g.fillRect(nX(a), y + 5, Math.max(2, nX(b) - nX(a)), ROW - 10);
        const frames = new Set(); for (const pts of Object.values(st.actions[name].curves)) for (const [f] of pts) frames.add(f);
        for (const f of frames) diamond(g, nX(f), y + ROW / 2, 3.5, '#e8d2a8', '#2a1d08');
      }
      return;
    }
    const tr = st.tracks[r.ti], sel = st.sel.track === tr.id, off = !N.trackEvaluated(st, tr);
    g.fillStyle = sel ? '#33405a' : (i % 2 ? '#2a2a2a' : '#2e2e2e'); g.fillRect(0, y, w, ROW);
    if (off) { g.fillStyle = '#00000055'; g.fillRect(0, y, w, ROW); }
    g.fillStyle = '#1a1a1a'; g.fillRect(0, y + ROW - 1, w, 1);
  });
  // Scene range: frames outside it are darker.
  g.fillStyle = '#00000048'; const r0 = nX(st.range[0]), r1 = nX(st.range[1]);
  g.fillRect(0, RULER, Math.max(0, r0), h); g.fillRect(r1, RULER, Math.max(0, w - r1), h);
  drawRuler(g, 0, w, S.views.nla, nX);
  st.tracks.forEach((tr, ti) => { const off = !N.trackEvaluated(st, tr); drawExtrapolation(g, tr, ti, off); for (const s of tr.strips) drawStrip(g, s, ti, tweak, off); });
  if (S.drag?.kind === 'box' && S.drag.editor === 'nla') { const d = S.drag; g.fillStyle = '#ffffff12'; g.strokeStyle = '#ffffffaa'; g.setLineDash([4, 3]); g.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); g.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); g.setLineDash([]); }
  drawPlayhead(g, nX(st.frame), h, fmt(st.frame));
  void solo;
}
// The channel region: the object, the action line (with Push Down) and the tracks (Solo, name, checkbox, lock).
function renderChannels() {
  const st = S.st, rows = nlaRows(), tw = st.adt.tweak;
  const box = $('#nla-channels');
  box.innerHTML = rows.map(r => {
    if (r.kind === 'obj') return `<div class="nla-ch obj" data-no-i18n>${ICONS.ob_armature}<span class="nm">Mannequin</span></div>`;
    if (r.kind === 'aline') {
      const name = tw ? N.findStrip(st, tw)?.strip.action : st.adt.action;
      return `<div class="nla-ch aline${name ? '' : ' empty'}" data-help="aline"><span class="nm" data-no-i18n>${name ? esc(name) : '&lt;No Action&gt;'}</span>${name && !tw ? `<button type="button" class="pd${step().id === 'a2' ? ' nudge' : ''}" data-act="pushdown" title="${esc(t('Push Down: turn the action into a strip in a new track'))}">${esc(t('Push Down'))}</button>` : ''}</div>`;
    }
    const tr = st.tracks[r.ti], sel = st.sel.track === tr.id, off = !N.trackEvaluated(st, tr);
    const name = S.renaming === tr.id ? `<input class="rename" id="rename-input" value="${esc(tr.name)}" data-no-i18n>` : `<span class="nm" data-track="${tr.id}" title="${esc(t('Click: make it the active track · double-click: rename'))}" data-no-i18n>${esc(tr.name)}</span>`;
    return `<div class="nla-ch track${sel ? ' sel' : ''}${off ? ' off' : ''}${tr.name.startsWith('[Action Stash]') ? ' stash' : ''}" data-ti="${r.ti}"><button type="button" class="solo" data-solo="${tr.id}" aria-pressed="${tr.solo}" data-help="solo">${tr.solo ? '★' : '☆'}</button>${name}<input type="checkbox" class="chk" data-mute="${tr.id}" ${tr.mute ? '' : 'checked'} data-help="muteTrack"><button type="button" class="lock" data-lock="${tr.id}" aria-pressed="${tr.lock}" data-help="lock">${tr.lock ? '🔒' : '🔓'}</button></div>`;
  }).join('');
  const ri = $('#rename-input');
  if (ri) { ri.focus(); ri.select(); const done = ok => { const id = S.renaming; S.renaming = null; if (ok && ri.value.trim()) act(st => { const tr2 = st.tracks.find(x => x.id === id); tr2.name = N.uniqueName(ri.value.trim(), st.tracks.filter(x => x.id !== id).map(x => x.name)); return ''; }); else changed(false); }; ri.onkeydown = e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); }; ri.onblur = () => done(true); }
}
$('#nla-channels').addEventListener('click', e => {
  const b = e.target.closest('[data-act],[data-solo],[data-lock],[data-mute],[data-track]'); if (!b) return;
  if (b.dataset.act === 'pushdown') return act(N.pushDown);
  if (b.dataset.solo) return act(st => { const tr = st.tracks.find(x => x.id === b.dataset.solo); tr.solo = !tr.solo; return tr.solo ? tr2('Solo: only {a} (and the other soloed tracks) is evaluated.', tr.name) : ''; });
  if (b.dataset.lock) return act(st => { const tr = st.tracks.find(x => x.id === b.dataset.lock); tr.lock = !tr.lock; return ''; });
  if (b.dataset.mute) return act(st => { const tr = st.tracks.find(x => x.id === b.dataset.mute); tr.mute = !b.checked; return tr.mute ? tr2('{a} muted.', tr.name) : ''; });
  if (b.dataset.track) { if (S.st.sel.track !== b.dataset.track) act(st => { st.sel.track = b.dataset.track; return ''; }); }
});
$('#nla-channels').addEventListener('dblclick', e => { const n = e.target.closest('[data-track]'); if (!n || S.st.adt.tweak) return; S.renaming = n.dataset.track; renderChannels(); });
const tr2 = (s, a) => tr(s, { a });

// Hit test in the strips area.
function nlaHit(x, y) {
  if (y < RULER) return { kind: 'ruler' };
  const ri = Math.floor((y - RULER) / ROW), rows = nlaRows(), r = rows[ri];
  if (!r) return { kind: 'none' };
  if (r.kind !== 'track') return { kind: r.kind };
  const tr = S.st.tracks[r.ti];
  for (const s of [...tr.strips].reverse()) { const gm = stripGeom(s, r.ti); if (x >= gm.x0 - 2 && x <= Math.max(gm.x1, gm.x0 + 4) + 2) return { kind: 'strip', strip: s, ti: r.ti }; }
  return { kind: 'track', ti: r.ti };
}
const localXY = (e, el) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
nlaCv.addEventListener('pointerdown', e => {
  if (S.modal) { e.preventDefault(); e.button === 0 ? confirmModal() : cancelModal(); return; }
  closeMenu(); closeBake();
  const { x, y } = localXY(e, nlaCv);
  if (e.button === 1) { S.drag = { kind: 'pan', editor: 'nla', x0: e.clientX, a: S.views.nla.a, b: S.views.nla.b }; nlaCv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  if (e.button !== 0) return;
  const h = nlaHit(x, y);
  nlaCv.setPointerCapture(e.pointerId);
  if (h.kind === 'ruler') { S.drag = { kind: 'scrub', editor: 'nla' }; setFrame(Math.round(nF(x))); return; }
  if (h.kind === 'strip') {
    if (S.st.adt.tweak) { msg('In Tweak Mode only the tweaked action can be edited: press Tab to leave it.', true); return; }
    const s = h.strip, st = S.st;
    const was = JSON.stringify(st);
    if (e.shiftKey) { s.select = !s.select; if (s.select) st.sel.strip = s.id; }
    else if (!s.select) { N.allStrips(st).forEach(o => { o.select = false; }); s.select = true; st.sel.strip = s.id; }
    else st.sel.strip = s.id;
    st.sel.track = st.tracks[h.ti].id;
    if (JSON.stringify(st) !== was) { changed(); }
    if (s.select) S.drag = { kind: 'maybe-move', editor: 'nla', x0: e.clientX, y0: e.clientY, cx: x, cy: y };
    return;
  }
  if (h.kind === 'track' || h.kind === 'none' || h.kind === 'obj' || h.kind === 'aline') {
    const st = S.st;
    if (!e.shiftKey && !st.adt.tweak) { N.allStrips(st).forEach(o => { o.select = false; }); st.sel.strip = null; }
    if (h.kind === 'track') st.sel.track = st.tracks[h.ti].id;
    changed(false);
    S.drag = { kind: 'box', editor: 'nla', x0: x, y0: y, x1: x, y1: y, add: e.shiftKey };
  }
});
nlaCv.addEventListener('pointermove', e => {
  S.pointer = { cx: e.clientX, cy: e.clientY };
  if (S.modal?.editor === 'nla') { updateModal(e); return; }
  const d = S.drag; if (!d || d.editor !== 'nla') return;
  const { x, y } = localXY(e, nlaCv);
  if (d.kind === 'scrub') setFrame(Math.round(nF(x)));
  else if (d.kind === 'pan') { const k = (d.b - d.a) / nlaW(), df = (e.clientX - d.x0) * k; S.views.nla = { a: d.a - df, b: d.b - df }; schedule('nla'); }
  else if (d.kind === 'box') { d.x1 = x; d.y1 = y; schedule('nla'); }
  else if (d.kind === 'maybe-move' && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) { S.drag = null; startModal('nla', 'move', { cx: d.x0, cy: d.y0 }, true); updateModal(e); }
});
nlaCv.addEventListener('pointerup', e => {
  const d = S.drag; S.drag = null;
  if (S.modal?.editor === 'nla' && S.modal.dragged) { confirmModal(); return; }
  if (!d || d.editor !== 'nla') return;
  if (d.kind === 'box') {
    const xa = Math.min(d.x0, d.x1), xb = Math.max(d.x0, d.x1), ya = Math.min(d.y0, d.y1), yb = Math.max(d.y0, d.y1);
    if (xb - xa > 3 || yb - ya > 3) act(st => { st.tracks.forEach((tr, ti) => tr.strips.forEach(s => { const gm = stripGeom(s, ti); if (gm.x1 >= xa && gm.x0 <= xb && gm.y + gm.h >= ya && gm.y <= yb) { s.select = true; st.sel.strip = s.id; } })); return ''; });
    schedule('nla');
  }
  if (d.kind === 'scrub') saveData();
});
nlaCv.addEventListener('wheel', e => { e.preventDefault(); zoomView('nla', e, nlaCv); }, { passive: false });
function zoomView(which, e, cv) {
  const v = S.views[which], { x } = localXY(e, cv), w = cv.getBoundingClientRect().width - (which === 'ae' ? AE_NAMES : 0);
  const xx = which === 'ae' ? x - AE_NAMES : x, f = v.a + xx / w * (v.b - v.a), k = Math.exp(e.deltaY * 0.0015);
  const span = clamp((v.b - v.a) * k, 8, 600);
  S.views[which] = { a: f - (f - v.a) / (v.b - v.a) * span, b: f + (v.b - f) / (v.b - v.a) * span }; schedule(which);
}

// ─── Modal transforms (G, S) ────────────────────────────────────────────────
function startModal(editor, kind, at, dragged = false) {
  const st = S.st;
  if (editor === 'nla') {
    if (st.adt.tweak) return msg('Not possible in Tweak Mode: press Tab to leave it first.', true);
    const ids = N.selectedStrips(st).map(s => s.id);
    if (!ids.length) return msg('Select a strip first.', true);
    if (kind === 'scale' && !N.selectedStrips(st).some(s => s.type === 'action')) return msg('Select an action strip to scale.', true);
    S.modal = { editor, kind, ids, snap: JSON.stringify(st), cx: at?.cx ?? S.pointer?.cx ?? 0, cy: at?.cy ?? S.pointer?.cy ?? 0, typed: '', dx: 0, dy: 0, dragged, value: kind === 'scale' ? 1 : 0 };
  } else {
    const sel = keySelList(); if (!sel.length) return msg('Select keys first.', true);
    S.modal = { editor, kind: 'keys', snap: JSON.stringify(st), sel: [...S.keySel], cx: at?.cx ?? S.pointer?.cx ?? 0, typed: '', dx: 0, dragged, value: 0 };
  }
  showReadout();
}
function updateModal(e) {
  const m = S.modal; if (!m) return;
  if (e) { m.dx = e.clientX - m.cx; m.dy = e.clientY - m.cy; }
  applyModal();
}
function modalValue(m) {
  if (m.typed && m.typed !== '-' && m.typed !== '.') return +m.typed;
  if (m.editor === 'nla' && m.kind === 'scale') return +Math.exp(m.dx / 220).toFixed(2);
  const v = S.views[m.editor === 'nla' ? 'nla' : 'ae'], w = m.editor === 'nla' ? nlaW() : aeW();
  return Math.round(m.dx / w * (v.b - v.a));
}
function applyModal() {
  const m = S.modal; S.st = JSON.parse(m.snap); const st = S.st;
  m.value = modalValue(m);
  let note = '';
  try {
    if (m.kind === 'move') note = N.moveStrips(st, m.ids, m.value, m.typed ? 0 : -Math.round(m.dy / ROW));
    else if (m.kind === 'scale') {
      const k = Math.max(0.05, m.value || 0.05);
      for (const id of m.ids) { const s = N.findStrip(st, id)?.strip; if (s?.type === 'action') s.scale = +(s.scale * k).toFixed(3); }
      N.validate(st);
      for (const tr0 of st.tracks) for (const s of [...tr0.strips]) if (m.ids.includes(s.id)) { const tt = N.findStrip(st, s.id).track; if (tt.strips.some(o => o !== s && o.start < s.end - 1e-6 && o.end > s.start + 1e-6)) note = N.moveStrips(st, [s.id], 0, 0); }
    } else if (m.kind === 'keys') {
      const { action, strip } = editedAction(); const k = strip ? strip.scale * (strip.reversed ? -1 : 1) : 1;
      N.moveKeys(st, action, keySelList(m.sel), m.value / k);
      S.keySel = new Set(m.sel.map(id => { const [b, f] = id.split('@'); return `${b}@${+(+f + m.value / k).toFixed(3)}`; }));
    }
  } catch (err) { S.st = JSON.parse(m.snap); note = err.message; }
  m.note = note; showReadout(); changed(false, true);
}
function showReadout() {
  const m = S.modal, el = m?.editor === 'nla' ? $('#nla-readout') : $('#ae-readout');
  $('#nla-readout').hidden = true; $('#ae-readout').hidden = true;
  if (!m) return;
  el.hidden = false;
  const typed = m.typed ? ` [${m.typed}|]` : '';
  if (m.kind === 'scale') el.textContent = tr('Scale: {a}', { a: fmt(m.value) }) + typed;
  else if (m.kind === 'move') el.textContent = tr('Move: {a} frames', { a: (m.value > 0 ? '+' : '') + fmt(m.value) }) + typed;
  else el.textContent = tr('Move keys: {a} frames', { a: (m.value > 0 ? '+' : '') + fmt(m.value) }) + typed;
}
function confirmModal() {
  const m = S.modal; if (!m) return; S.modal = null; showReadout();
  if (JSON.stringify(S.st) !== m.snap) { S.undo.push(m.snap); S.redo = []; }
  changed(); if (m.note) msg(m.note);
}
function cancelModal() { const m = S.modal; if (!m) return; S.modal = null; S.st = JSON.parse(m.snap); if (m.kind === 'keys') S.keySel = new Set(m.sel); showReadout(); changed(false); msg('Cancelled'); }
function modalKey(e) {
  const m = S.modal, k = e.key;
  if (k === 'Escape') return cancelModal();
  if (k === 'Enter') return confirmModal();
  if (/^[0-9]$/.test(k) || k === '.' || (k === '-' && !m.typed)) { m.typed += k; applyModal(); return; }
  if (k === 'Backspace') { m.typed = m.typed.slice(0, -1); applyModal(); return; }
}
document.addEventListener('pointermove', e => { S.pointer = { cx: e.clientX, cy: e.clientY }; if (S.modal && !S.modal.typed) { if (S.modal.editor === 'nla' && e.target === nlaCv) return; if (S.modal.editor === 'ae' && e.target === aeCv) return; updateModal(e); } });
document.addEventListener('pointerdown', e => { if (S.modal && !e.target.closest('canvas')) { e.preventDefault(); e.button === 0 ? confirmModal() : cancelModal(); } }, true);
document.addEventListener('contextmenu', e => { if (S.modal || e.target.closest('#workspace canvas')) e.preventDefault(); });

// ─── Dope Sheet › Action Editor ─────────────────────────────────────────────
const aeCv = $('#ae'), aeHost = $('#ae-host'), AE_NAMES = 120;
let AE_ROW = 20;   // rows shrink so every bone fits in the editor
const aeW = () => aeHost.getBoundingClientRect().width - AE_NAMES;
const aX = f => AE_NAMES + (f - S.views.ae.a) / (S.views.ae.b - S.views.ae.a) * aeW();
const aF = x => S.views.ae.a + (x - AE_NAMES) / aeW() * (S.views.ae.b - S.views.ae.a);
// The action the editor shows: the tweaked strip's action, or the active action.
function editedAction() {
  const st = S.st;
  if (st.adt.tweak) { const s = N.findStrip(st, st.adt.tweak)?.strip; return { action: s?.action, strip: s }; }
  return { action: st.adt.action, strip: null };
}
const toScene = (strip, af) => strip ? N.actionToScene(strip, af) : af;
const toAction = (strip, f) => strip ? N.sceneToAction(strip, f) : f;
function aeGroups(act) {
  const groups = [];
  for (const b of N.BONE_NAMES) { const chs = N.actionChannels(act).filter(ch => N.channelBone(ch) === b); if (chs.length) { const fr = new Set(); chs.forEach(ch => act.curves[ch].forEach(([f]) => fr.add(f))); groups.push({ bone: b, chs, frames: [...fr].sort((x, y) => x - y) }); } }
  return groups;
}
function keySelList(ids = [...S.keySel]) {
  const { action } = editedAction(), act = S.st.actions[action]; if (!act) return [];
  const out = [];
  for (const id of ids) { const [b, f] = id.split('@'); for (const ch of N.actionChannels(act)) if (N.channelBone(ch) === b && act.curves[ch].some(([kf]) => Math.abs(kf - +f) < 1e-6)) out.push({ ch, f: +f }); }
  return out;
}
function frameAllAE() {
  const { action, strip } = editedAction(), act = S.st?.actions[action];
  let a = 1, b = 49; if (act) { const r = N.actionRange(act); a = toScene(strip, r[0]); b = toScene(strip, r[1]); if (a > b) [a, b] = [b, a]; }
  const pad = (b - a) * 0.08 + 2; S.views.ae = { a: a - pad, b: b + pad }; schedule('ae');
}
function drawAE() {
  const { g, w, h } = setupCanvas(aeCv), st = S.st, { action, strip } = editedAction(), act = st.actions[action];
  g.fillStyle = '#1d1d1d'; g.fillRect(0, 0, w, h);
  $('#ae-empty').hidden = !!act;
  if (!act) { $('#ae-empty').textContent = t('No action. Choose one with Browse Action, or Tab into a strip of the NLA to tweak its action.'); }
  const groups = act ? aeGroups(act) : [];
  const rows = act ? [{ summary: true }, ...groups] : [];
  AE_ROW = clamp(Math.floor((h - RULER - 4) / Math.max(1, rows.length)), 13, 20);
  rows.forEach((r, i) => {
    const y = RULER + i * AE_ROW;
    g.fillStyle = r.summary ? '#2c3a52' : (i % 2 ? '#262626' : '#2a2a2a'); g.fillRect(AE_NAMES, y, w, AE_ROW);
    g.fillStyle = r.summary ? '#34476a' : '#303030'; g.fillRect(0, y, AE_NAMES, AE_ROW);
    g.fillStyle = r.summary ? '#fff' : '#d8d8d8'; g.font = `${r.summary ? 600 : 500} ${AE_ROW < 16 ? 10.5 : 11.5}px Inter, Segoe UI, Arial`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(r.summary ? t('Summary') : r.bone, 10, y + AE_ROW / 2);
    g.fillStyle = '#161616'; g.fillRect(0, y + AE_ROW - 1, w, 1);
  });
  // In Tweak Mode the editor shows where the strip plays (keys mapped to NLA time); outside the strip is dimmed.
  if (strip) { g.fillStyle = '#00000050'; const x0 = aX(Math.min(strip.start, strip.end)), x1 = aX(strip.end); g.fillRect(AE_NAMES, RULER, Math.max(0, x0 - AE_NAMES), h); g.fillRect(x1, RULER, w, h); }
  g.save(); g.beginPath(); g.rect(AE_NAMES, 0, w - AE_NAMES, h); g.clip();
  drawRuler(g, AE_NAMES, w - AE_NAMES, S.views.ae, aX);
  if (act) {
    const sumFrames = new Map();
    groups.forEach((gr, gi) => {
      const y = RULER + (gi + 1) * AE_ROW + AE_ROW / 2;
      for (const f of gr.frames) { const sel = S.keySel.has(`${gr.bone}@${f}`); diamond(g, aX(toScene(strip, f)), y, AE_ROW < 16 ? 3.6 : 4.5, sel ? '#ffbe33' : '#e0e0e0'); sumFrames.set(f, (sumFrames.get(f) || false) || sel); }
    });
    for (const [f, sel] of sumFrames) diamond(g, aX(toScene(strip, f)), RULER + AE_ROW / 2, 5, sel ? '#ffbe33' : '#bdbdbd');
  }
  if (S.drag?.kind === 'box' && S.drag.editor === 'ae') { const d = S.drag; g.fillStyle = '#ffffff12'; g.strokeStyle = '#ffffffaa'; g.setLineDash([4, 3]); g.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); g.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); g.setLineDash([]); }
  drawPlayhead(g, aX(st.frame), h, fmt(st.frame));
  g.restore();
  g.fillStyle = '#262626'; g.fillRect(0, 0, AE_NAMES, RULER); g.fillStyle = '#161616'; g.fillRect(AE_NAMES - 1, 0, 1, h);
}
function aeHit(x, y) {
  if (y < RULER) return { kind: 'ruler' };
  const { action, strip } = editedAction(), act = S.st.actions[action]; if (!act) return { kind: 'none' };
  const groups = aeGroups(act), ri = Math.floor((y - RULER) / AE_ROW);
  if (ri < 0 || ri > groups.length) return { kind: 'none' };
  const bones = ri === 0 ? groups : [groups[ri - 1]], names = x < AE_NAMES;
  if (names) return { kind: 'name', bones };
  let best = null;
  for (const gr of bones) for (const f of gr.frames) { const d = Math.abs(aX(toScene(strip, f)) - x); if (d <= 6 && (!best || d < best.d)) best = { d, f }; }
  if (best) return { kind: 'key', ids: bones.filter(gr => gr.frames.includes(best.f)).map(gr => `${gr.bone}@${best.f}`) };
  return { kind: 'empty' };
}
aeCv.addEventListener('pointerdown', e => {
  if (S.modal) { e.preventDefault(); e.button === 0 ? confirmModal() : cancelModal(); return; }
  closeMenu(); closeBake();
  const { x, y } = localXY(e, aeCv);
  aeCv.setPointerCapture(e.pointerId);
  if (e.button === 1) { S.drag = { kind: 'pan', editor: 'ae', x0: e.clientX, a: S.views.ae.a, b: S.views.ae.b }; e.preventDefault(); return; }
  if (e.button !== 0) return;
  const h = aeHit(x, y);
  if (h.kind === 'ruler') { S.drag = { kind: 'scrub', editor: 'ae' }; if (x > AE_NAMES) setFrame(Math.round(aF(x))); return; }
  if (h.kind === 'key') {
    if (e.shiftKey) { const all = h.ids.every(id => S.keySel.has(id)); h.ids.forEach(id => all ? S.keySel.delete(id) : S.keySel.add(id)); }
    else if (!h.ids.every(id => S.keySel.has(id))) { S.keySel = new Set(h.ids); }
    schedule('ae');
    S.drag = { kind: 'maybe-move', editor: 'ae', x0: e.clientX, y0: e.clientY };
    return;
  }
  if (h.kind === 'name') return;
  if (!e.shiftKey) S.keySel.clear();
  S.drag = { kind: 'box', editor: 'ae', x0: x, y0: y, x1: x, y1: y }; schedule('ae');
});
aeCv.addEventListener('dblclick', e => {
  const { x, y } = localXY(e, aeCv), h = aeHit(x, y);
  if (h.kind !== 'name' && h.kind !== 'empty') return;
  if (h.kind === 'empty' && x >= AE_NAMES) return;
  if (!e.shiftKey) S.keySel.clear();
  for (const gr of h.bones || []) for (const f of gr.frames) S.keySel.add(`${gr.bone}@${f}`);
  schedule('ae');
});
aeCv.addEventListener('pointermove', e => {
  if (S.modal?.editor === 'ae') { updateModal(e); return; }
  const d = S.drag; if (!d || d.editor !== 'ae') return;
  const { x, y } = localXY(e, aeCv);
  if (d.kind === 'scrub') setFrame(Math.round(aF(Math.max(AE_NAMES, x))));
  else if (d.kind === 'pan') { const k = (d.b - d.a) / aeW(), df = (e.clientX - d.x0) * k; S.views.ae = { a: d.a - df, b: d.b - df }; schedule('ae'); }
  else if (d.kind === 'box') { d.x1 = x; d.y1 = y; schedule('ae'); }
  else if (d.kind === 'maybe-move' && Math.abs(e.clientX - d.x0) > 4) { S.drag = null; startModal('ae', 'keys', { cx: d.x0 }, true); if (S.modal) updateModal(e); }
});
aeCv.addEventListener('pointerup', () => {
  const d = S.drag; S.drag = null;
  if (S.modal?.editor === 'ae' && S.modal.dragged) { confirmModal(); return; }
  if (d?.kind === 'box' && d.editor === 'ae') {
    const { action, strip } = editedAction(), act = S.st.actions[action];
    if (act) {
      const xa = Math.min(d.x0, d.x1), xb = Math.max(d.x0, d.x1), ya = Math.min(d.y0, d.y1), yb = Math.max(d.y0, d.y1);
      aeGroups(act).forEach((gr, gi) => {
        const yc = RULER + (gi + 1) * AE_ROW + AE_ROW / 2, inSummary = RULER + AE_ROW / 2 >= ya && RULER + AE_ROW / 2 <= yb;
        if ((yc < ya || yc > yb) && !inSummary) return;
        for (const f of gr.frames) { const xx = aX(toScene(strip, f)); if (xx >= xa && xx <= xb) S.keySel.add(`${gr.bone}@${f}`); }
      });
    }
    schedule('ae');
  }
  if (d?.kind === 'scrub') saveData();
});
aeCv.addEventListener('wheel', e => { e.preventDefault(); zoomView('ae', e, aeCv); }, { passive: false });
function deleteSelectedKeys() {
  const { action } = editedAction(); if (!action) return msg('There is no action to edit.', true);
  const sel = keySelList(); if (!sel.length) return msg('Select keys first.', true);
  act(st => { const n = N.deleteKeys(st, action, sel); S.keySel.clear(); return tr('Deleted {n} keys.', { n }); });
}
// Header: Action Editor mode, the action data-block (browse, name, Fake User, New, Unlink), the slot, Push Down and Stash.
function renderAEHeader() {
  const st = S.st, tw = !!st.adt.tweak, { action } = editedAction(), a = st.actions[action], users = action ? N.actionUsers(st, action) : 0;
  const sid = step().id, nudgeBrowse = (sid === 'a1' && st.adt.action !== 'Walk') || ((sid === 'k1' || sid === 'k3') && !(action === 'Wave_v2' || action === 'Jump')), nudgePD = sid === 'a2' && !!st.adt.action;
  const nudgeFake = (sid === 'k1' || sid === 'k3') && !!a && !a.fake && (action === 'Wave_v2' || action === 'Jump'), nudgeNew = sid === 'k2' && st.adt.action === 'Walk';
  $('#ae-header').innerHTML = `<span class="editor-type bz"><span class="bh-dd bh-editor">${ICONS.dopesheet}${ICONS.dropdown}</span><span class="bz-label">Dope Sheet</span></span>
    <span class="ae-mode" data-no-i18n title="${esc(t('Dope Sheet mode'))}">Action Editor</span>
    <span class="id-block" data-no-i18n><button type="button" id="ae-browse" class="${nudgeBrowse ? 'nudge' : ''}" data-help="browse" ${tw ? 'disabled' : ''}>${ICONS.dopesheet}▾</button><span class="id-name">${a ? esc(action) : '—'}${users > 1 ? ` <span class="users">${users}</span>` : ''}</span>${a ? `<button type="button" id="ae-fake" class="fake${nudgeFake ? ' nudge' : ''}" aria-pressed="${!!a.fake}" data-help="fake">F</button>` : ''}<button type="button" id="ae-new" class="${nudgeNew ? 'nudge' : ''}" data-help="newAct" ${tw ? 'disabled' : ''}>⧉</button>${a && !tw ? `<button type="button" id="ae-unlink" data-help="unlink">✕</button>` : ''}</span>
    <span class="slot-field" data-help="slot">Slot <span data-no-i18n>${a ? '◆ Mannequin' : '—'}</span></span>
    <button type="button" class="hdr-btn${nudgePD ? ' nudge' : ''}" id="ae-push" ${!st.adt.action || tw ? 'disabled' : ''} data-help="pushdown">Push Down</button>
    <button type="button" class="hdr-btn" id="ae-stash" ${!st.adt.action || tw ? 'disabled' : ''} data-help="stash">Stash</button>`;
}
$('#ae-header').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.id === 'ae-browse') { const r = b.getBoundingClientRect(); openMenu('browse', r.left, r.bottom + 2); }
  if (b.id === 'ae-fake') act(st => { const a = st.actions[editedAction().action]; a.fake = !a.fake; return a.fake ? tr2('Fake User on: “{a}” stays in the file.', a.name) : tr2('Fake User off: “{a}” is deleted on save if nothing uses it.', a.name); });
  if (b.id === 'ae-new') act(N.newAction);
  if (b.id === 'ae-unlink') act(N.unlinkAction);
  if (b.id === 'ae-push') act(N.pushDown);
  if (b.id === 'ae-stash') act(N.stash);
});

// ─── Sidebar (N) ────────────────────────────────────────────────────────────
const BLENDS = [['REPLACE', 'Replace'], ['COMBINE', 'Combine'], ['ADD', 'Add'], ['SUBTRACT', 'Subtract'], ['MULTIPLY', 'Multiply']];
const EXTRAPS = [['HOLD', 'Hold'], ['HOLD_FORWARD', 'Hold Forward'], ['NOTHING', 'Nothing']];
const opt = (list, v) => list.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('');
const num = (prop, v, extra = '') => `<input type="number" data-prop="${prop}" value="${fmt(v, 3)}" step="${extra.includes('step') ? '' : 1}" ${extra}>`;
const HELP_OF = { start: 'start', end: 'start', blendIn: 'blendIn', blendOut: 'blendIn', actStart: 'actStart', actEnd: 'actStart', influence: 'influence', extrap: 'extrap', blend: 'blend', name: 'name', action: 'action', scale: 'scale', repeat: 'repeat', autoBlend: 'autoBlend', reversed: 'reversed', mute: 'mute', sync: 'sync' };
const ADT_HELP = { action: 'adtAction', extrap: 'adtExtrap', blend: 'adtBlend', influence: 'adtInfluence' };
function helpKey(inner, help) { if (help) return help; const a = inner.match(/data-adt="(\w+)"/); if (a) return ADT_HELP[a[1]]; const m = inner.match(/data-prop="(\w+)"/); return m ? HELP_OF[m[1]] || '' : ''; }
const field = (label, inner, cls = '', title = '', help = '') => { const h = helpKey(inner, help); return `<label class="sb-field${cls}"${h ? ` data-help="${h}"` : title ? ` title="${esc(t(title))}"` : ''}><span data-no-i18n>${esc(label)}</span>${inner}</label>`; };
const check = (prop, v, label, cls = '', title = '', dis = false) => `<label class="sb-check${cls}"${HELP_OF[prop] ? ` data-help="${HELP_OF[prop]}"` : title ? ` title="${esc(t(title))}"` : ''}><input type="checkbox" data-prop="${prop}" ${v ? 'checked' : ''} ${dis ? 'disabled' : ''}><span data-no-i18n>${esc(label)}</span></label>`;
const nudge = (ids, ok = true) => (ids.includes(step().id) && ok ? ' nudge' : '');
function renderSidebar() {
  const st = S.st, box = $('#nla-sidebar');
  const tabs = [['strip', 'Strip'], ['edited', 'Edited Action'], ['mods', 'Modifiers']];
  let html = `<div class="sb-tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${S.sbTab === k}" data-no-i18n>${esc(l)}</button>`).join('')}</div><div class="sb-scroll">`;
  if (S.sbTab === 'strip') {
    const s = N.activeStrip(st), loc = s && N.findStrip(st, s.id);
    if (!s) html += `<p class="sb-empty">${esc(t('Click a strip to see its settings here.'))}</p>`;
    else {
      const ro = !!st.adt.tweak || loc.track.lock || !!loc.meta;
      const dis = ro ? 'disabled' : '';
      html += `<section class="sb-panel"><h5>Strip</h5><div class="sb-in">
        ${field('Name', `<input type="text" data-prop="name" value="${esc(s.name)}" data-no-i18n ${dis}>`)}
        ${field('Track', `<span class="ro" data-no-i18n>${esc(loc.track.name)}</span>`, '', '', 'track')}
        ${field('Frame Start', num('start', s.start, dis))}
        ${field('End', num('end', s.end, s.type === 'action' ? dis : 'disabled'), '', s.type === 'action' ? 'Changing the end changes the Playback Scale' : '')}`;
      if (s.type !== 'transition') html += `${field('Extrapolation', `<select data-prop="extrap" ${dis}>${opt(EXTRAPS, s.extrap)}</select>`, nudge(['m2'], s.action === 'Wave' && s.extrap !== 'NOTHING') || nudge(['x1'], s.action === 'Walk' && s.extrap !== 'HOLD'), 'What the strip does before and after its frames')}`;
      if (s.type === 'action') {
        html += `${field('Blending', `<select data-prop="blend" ${dis}>${opt(BLENDS, s.blend)}</select>`, nudge(['l2'], s.action === 'Breathe' && s.blend !== 'COMBINE') || nudge(['b5'], s.action === 'Reach' && s.blend === 'REPLACE'), 'How the strip mixes with the result of the tracks below')}
        ${field('Blend In', num('blendIn', s.blendIn, s.autoBlend || ro ? 'disabled' : ''), nudge(['m3'], s.action === 'Wave' && s.blendIn < 4))}
        ${field('Out', num('blendOut', s.blendOut, s.autoBlend || ro ? 'disabled' : ''), nudge(['m3'], s.action === 'Wave' && s.blendOut < 4))}
        ${check('autoBlend', s.autoBlend, 'Auto Blend In/Out', nudge(['m4'], s.action === 'Jump' && !s.autoBlend), 'Blend In and Out from the overlap with the strips of the track below', ro)}
        ${check('reversed', s.reversed, 'Playback Reversed', '', 'Play the action backwards', ro)}`;
      }
      html += `${check('mute', s.mute, 'Mute', '', 'A muted strip is not evaluated (H)', ro)}`;
      if (s.type === 'transition') html += `<p class="sb-note">${esc(t('A transition blends from the last pose of the strip before it to the first pose of the strip after it.'))}</p>`;
      if (s.type === 'meta') html += `<p class="sb-note">${esc(tr('A meta strip groups {n} strips. Add › Remove Meta-Strips splits it.', { n: s.children.length }))}</p>`;
      html += `</div></section>`;
      if (s.type === 'action') {
        const inf = s.animInf ? (s.infKeys.length ? N.evalInfluenceKeys(s.infKeys, st.frame) : s.influence) : N.stripInfluence(s, st.frame);
        const keyed = s.infKeys.some(([f]) => Math.abs(f - st.frame) < 1e-6);
        html += `<section class="sb-panel"><h5 data-help="animInf" class="${nudge(['b3'], !s.animInf && s.action === 'Wave').trim()}"><input type="checkbox" data-prop="animInf" ${s.animInf ? 'checked' : ''} ${dis}>Animated Influence</h5><div class="sb-in">
          ${field('Influence', `<input type="number" id="inf-field" data-prop="influence" min="0" max="1" step="0.05" value="${fmt(inf, 3)}" class="${s.animInf && s.infKeys.length ? (keyed ? 'keyed' : 'animated') : ''}" ${s.animInf && !ro ? '' : 'disabled'}>`, '', 'With Animated Influence on: hover the field and press I to insert a key')}
          <p class="sb-note">${esc(t(s.animInf ? (s.infKeys.length ? 'Keyed: yellow on a key, green between keys. A new value is keyed at the current frame.' : 'Hover the field and press I to key the influence at the current frame.') : 'Off: the influence comes from Blend In/Out.'))}</p>
          </div></section>
        <section class="sb-panel"><h5 data-help="animTime"><input type="checkbox" disabled>Animated Strip Time</h5><div class="sb-in"><p class="sb-note">${esc(t('Keys the time of the strip (for holds and speed ramps). Not part of this lab.'))}</p></div></section>
        <section class="sb-panel"><h5>Action Clip</h5><div class="sb-in">
          ${field('Action', `<select data-prop="action" data-no-i18n ${dis}>${Object.keys(st.actions).map(n => `<option value="${esc(n)}"${n === s.action ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`)}
          ${field('Users', `<span class="ro">${N.actionUsers(st, s.action)}${st.actions[s.action]?.fake ? ' + F' : ''}</span>`, '', '', 'users')}
          ${field('Slot', `<span class="ro" data-no-i18n>◆ Mannequin</span>`, '', '', 'slot')}
          ${field('Frame Start', num('actStart', s.actStart, dis), '', 'First frame of the action that the strip plays')}
          ${field('End', num('actEnd', s.actEnd, dis), nudge(['t2'], !(Math.abs(s.actEnd - 24) < 0.01)), 'Last frame of the action that the strip plays')}
          <div class="sb-row">${check('sync', s.sync, 'Sync Length', '', 'After Tweak Mode, update the range to the keys of the action', ro).replace('sb-check', 'sb-check inline')}<button type="button" class="mini-button" id="sync-now" ${dis}>Now</button></div>
          ${field('Playback Scale', num('scale', s.scale, `step="0.1" min="0.05" ${dis}`), nudge(['t3'], s.action === 'Wave' && Math.abs(s.end - s.start - 36) > 1))}
          ${field('Repeat', num('repeat', s.repeat, `step="1" min="0.1" ${dis}`), nudge(['t1'], s.action === 'Walk' && s.repeat < 4))}
        </div></section>`;
      }
    }
  } else if (S.sbTab === 'edited') {
    const tw = st.adt.tweak, name = tw ? N.findStrip(st, tw)?.strip.action : st.adt.action;
    html += `<section class="sb-panel"><h5>Animation Data</h5><div class="sb-in">
      ${field('Action', `<select data-adt="action" data-no-i18n ${tw ? 'disabled' : ''}><option value="">—</option>${Object.keys(st.actions).map(n => `<option value="${esc(n)}"${n === name ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`)}
      ${field('Extrapolation', `<select data-adt="extrap" ${tw ? 'disabled' : ''}>${opt(EXTRAPS, st.adt.extrap)}</select>`)}
      ${field('Blending', `<select data-adt="blend" ${tw ? 'disabled' : ''}>${opt(BLENDS, st.adt.blend)}</select>`)}
      ${field('Influence', `<input type="number" data-adt="influence" min="0" max="1" step="0.05" value="${fmt(st.adt.influence, 3)}" ${tw ? 'disabled' : ''}>`)}
      <p class="sb-note">${esc(t('The active action (the orange row) is evaluated last, on top of every track, with these settings.'))}</p></div></section>`;
  } else {
    html += `<p class="sb-empty">${esc(t('Strip modifiers (Noise, Cycles, Stepped…) change the result of a strip. They are not part of this lab.'))}</p>`;
  }
  html += '</div>';
  box.innerHTML = html;
}
$('#nla-sidebar').addEventListener('click', e => {
  const tb = e.target.closest('[data-tab]'); if (tb) { S.sbTab = tb.dataset.tab; renderSidebar(); return; }
  if (e.target.id === 'sync-now') act(st => N.syncLength(st));
});
$('#nla-sidebar').addEventListener('change', e => {
  const el = e.target, st = S.st;
  if (el.dataset.adt) {
    const k = el.dataset.adt;
    return act(st2 => { if (k === 'action') return N.setActiveAction(st2, el.value || null); if (k === 'influence') st2.adt.influence = clamp(+el.value || 0, 0, 1); else st2.adt[k] = el.value; return ''; });
  }
  const p = el.dataset.prop; if (!p) return;
  const id = st.sel.strip;
  act(st2 => {
    const s = N.findStrip(st2, id)?.strip; if (!s) return '';
    const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value;
    switch (p) {
      case 'name': { const nm = String(v).trim(); if (nm) s.name = N.uniqueName(nm, N.allStrips(st2).filter(o => o !== s).map(o => o.name)); return ''; }
      case 'start': return N.moveStrips(st2, [s.id], v - s.start, 0);
      case 'end': { if (!(v > s.start)) throw new Error('The end must be after the start.'); s.scale = +((v - s.start) / ((s.actEnd - s.actStart) * s.repeat)).toFixed(4); return resolveOverlap(st2, s); }
      case 'extrap': { const was = v; s.extrap = v; N.validate(st2); return was === 'HOLD' && s.extrap !== 'HOLD' ? 'Only the first strip of a track can use Hold: Blender sets Hold Forward.' : ''; }
      case 'blendIn': case 'blendOut': s[p] = Math.max(0, v); return '';
      case 'influence': {
        const val = clamp(v, 0, 1);
        if (s.infKeys.length) { s.infKeys = s.infKeys.filter(([f]) => Math.abs(f - st2.frame) > 1e-6).concat([[st2.frame, val]]).sort((a, b) => a[0] - b[0]); return tr('Keyed Influence {a} at frame {b}.', { a: fmt(val), b: st2.frame }); }
        s.influence = val; return '';
      }
      case 'actStart': case 'actEnd': {
        const a2 = p === 'actStart' ? v : s.actStart, b2 = p === 'actEnd' ? v : s.actEnd;
        if (!(b2 > a2)) throw new Error('Frame End of the action must be after its Frame Start.');
        s[p] = v; N.validate(st2); return resolveOverlap(st2, s);
      }
      case 'scale': if (!(v > 0)) throw new Error('Playback Scale must be more than 0.'); s.scale = v; N.validate(st2); return resolveOverlap(st2, s);
      case 'repeat': if (!(v > 0)) throw new Error('Repeat must be more than 0.'); s.repeat = v; N.validate(st2); return resolveOverlap(st2, s);
      case 'action': { s.action = v; const r = N.actionRange(st2.actions[v]); s.actStart = r[0]; s.actEnd = r[1]; N.validate(st2); return resolveOverlap(st2, s); }
      default: s[p] = v; return '';
    }
  });
});
// A strip that grew into the next one moves up to a free track, as after a transform in Blender.
function resolveOverlap(st, s) {
  N.validate(st);
  const loc = N.findStrip(st, s.id); if (!loc || loc.meta) return '';
  return loc.track.strips.some(o => o !== s && o.start < s.end - 1e-6 && o.end > s.start + 1e-6) ? N.moveStrips(st, [s.id], 0, 0) : '';
}
$('#nla-sidebar').addEventListener('pointerover', e => { S.infHover = e.target.id === 'inf-field'; });
$('#nla-sidebar').addEventListener('pointerleave', () => { S.infHover = false; });
function keyInfluence() {
  act(st => {
    const s = N.activeStrip(st);
    if (!s || s.type !== 'action') return '';
    if (!s.animInf) throw new Error('Turn on Animated Influence first.');
    const v = s.infKeys.length ? N.evalInfluenceKeys(s.infKeys, st.frame) : s.influence;
    s.infKeys = s.infKeys.filter(([f]) => Math.abs(f - st.frame) > 1e-6).concat([[st.frame, +v.toFixed(3)]]).sort((a, b) => a[0] - b[0]);
    return tr('Keyed Influence {a} at frame {b}.', { a: fmt(v), b: st.frame });
  });
}

// ─── Menus ──────────────────────────────────────────────────────────────────
const menuEl = $('#menu');
const run = fn => () => act(fn);
function menuItems(kind) {
  const st = S.st, tw = !!st.adt.tweak;
  if (kind === 'browse') return { title: 'Browse Action', items: Object.values(st.actions).map(a => ({ label: `${a.fake ? 'F' : N.actionUsers(st, a.name) ? '\u2002' : '⚠'}  ${N.actionUsers(st, a.name) || 0}  ${a.name}`, raw: true, act: run(s2 => N.setActiveAction(s2, a.name)) })) };
  if (kind === 'addaction') return { title: 'Add Action Strip', items: Object.values(st.actions).map(a => ({ label: a.name, raw: true, act: run(s2 => N.addActionStrip(s2, a.name)) })) };
  if (kind === 'file') return { title: 'File', items: [
    { label: 'Save & Reopen (lab)', key: 'Ctrl S', act: run(N.saveReopen) },
    { label: 'Clean Up › Purge Unused Data', act: run(N.purge) }] };
  if (kind === 'view') return { title: 'View', items: [
    { label: 'Sidebar', key: 'N', act: toggleSidebar }, { label: 'Frame All', key: 'Home', act: () => { frameAllNLA(); } },
    { label: 'Go to Current Frame', key: 'Numpad 0', act: () => { const span = S.views.nla.b - S.views.nla.a; S.views.nla = { a: st.frame - span / 2, b: st.frame + span / 2 }; schedule('nla'); } }] };
  if (kind === 'select') return { title: 'Select', items: [
    { label: 'All', key: 'A', act: () => selectAll(true) }, { label: 'None', key: 'Alt A', act: () => selectAll(false) }] };
  if (kind === 'add') return { title: 'Add', items: [
    { label: 'Action', key: 'Shift A', act: () => openShiftA() }, { label: 'Transition', key: 'Shift T', act: run(N.addTransition) }, { hr: true },
    { label: 'Add Meta-Strips', act: run(N.addMeta) }, { label: 'Remove Meta-Strips', act: run(N.removeMeta) }, { hr: true },
    { label: 'Add Tracks', act: run(s2 => N.addTrack(s2, false)) }, { label: 'Add Tracks Above Selected', act: run(s2 => N.addTrack(s2, true)) }] };
  if (kind === 'track') return { title: 'Track', items: [
    { label: 'Add Tracks', act: run(s2 => N.addTrack(s2, false)) }, { label: 'Add Tracks Above Selected', act: run(s2 => N.addTrack(s2, true)) }, { label: 'Delete Tracks', act: run(s2 => N.deleteTracks(s2)) }, { hr: true },
    { label: 'Move Track Up', act: run(s2 => moveTrack(s2, 1)) }, { label: 'Move Track Down', act: run(s2 => moveTrack(s2, -1)) },
    { label: 'Move Track to Top', act: run(s2 => moveTrack(s2, 99)) }, { label: 'Move Track to Bottom', act: run(s2 => moveTrack(s2, -99)) }] };
  if (kind === 'strip') return { title: 'Strip', items: [
    { label: 'Move', key: 'G', act: () => startModal('nla', 'move') }, { label: 'Scale', key: 'S', act: () => startModal('nla', 'scale') },
    { label: 'Snap › Selection to Current Frame', act: run(N.snapToFrame) }, { hr: true },
    { label: 'Duplicate', key: 'Shift D', act: () => dupMove(false) }, { label: 'Linked Duplicate', key: 'Alt D', act: () => dupMove(true) },
    { label: 'Split', key: 'Y', act: run(N.split) }, { label: 'Delete', key: 'X', act: run(N.deleteStrips) }, { hr: true },
    { label: 'Toggle Muting', key: 'H', act: run(N.toggleMute) }, { label: 'Apply Scale', key: 'Ctrl A', act: run(N.applyScale) }, { label: 'Clear Scale', key: 'Alt S', act: run(N.clearScale) },
    { label: 'Sync Action Length', act: run(s2 => N.syncLength(s2)) }, { label: 'Make Single User', key: 'U', act: run(N.makeSingleUser) },
    { label: 'Swap', key: 'Alt F', act: run(N.swapStrips) }, { label: 'Move Strips Up', key: 'PageUp', act: run(s2 => N.moveStripsTrack(s2, 1)) }, { label: 'Move Strips Down', key: 'PageDown', act: run(s2 => N.moveStripsTrack(s2, -1)) }, { hr: true },
    { label: tw ? 'Stop Tweaking Strip Actions' : 'Start Tweaking Strip Actions (Full Stack)', key: 'Tab', act: run(N.tweakEnter) }, { hr: true },
    { label: 'Bake Action', act: () => openBake() }] };
  return { title: '', items: [] };
}
function moveTrack(st, dir) {
  N.validate(st);
  const i = N.activeTrackIndex(st); if (i < 0) throw new Error('Select a track first (click its name).');
  const tr0 = st.tracks.splice(i, 1)[0], j = clamp(i + dir, 0, st.tracks.length); st.tracks.splice(j, 0, tr0);
  return '';
}
function openMenu(kind, x, y) {
  const m = menuItems(kind);
  menuEl.innerHTML = `<div class="menu-title" data-no-i18n>${esc(m.title)}</div>` + m.items.map((it, i) => it.hr ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}" data-no-i18n><span class="m-label">${esc(it.label)}</span>${it.key ? `<span class="m-key" data-no-i18n>${esc(it.key)}</span>` : ''}</button>`).join('');
  menuEl.hidden = false;
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 8)) + 'px';
  menuEl.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 8)) + 'px';
  menuEl.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = m.items[+b.dataset.i]; closeMenu(); it.act(); };
}
function closeMenu() { menuEl.hidden = true; document.querySelectorAll('.menu-button[aria-expanded]').forEach(b => b.removeAttribute('aria-expanded')); }
document.querySelectorAll('.menu-button[data-menu]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const r = b.getBoundingClientRect(); openMenu(b.dataset.menu, r.left, r.bottom + 2); b.setAttribute('aria-expanded', 'true'); }));
document.addEventListener('pointerdown', e => { if (!menuEl.hidden && !menuEl.contains(e.target) && !e.target.closest('.menu-button,#ae-browse')) closeMenu(); });
function openShiftA() { if (S.st.adt.tweak) return msg('Not possible in Tweak Mode: press Tab to leave it first.', true); openMenu('addaction', S.pointer?.cx ?? innerWidth / 2, S.pointer?.cy ?? innerHeight / 2); }
function dupMove(linked) { if (act(st => N.duplicate(st, linked))) startModal('nla', 'move'); }
function selectAll(on) {
  const ed = S.hover;
  if (ed === 'action') { const { action } = editedAction(), a = S.st.actions[action]; S.keySel.clear(); if (on && a) for (const gr of aeGroups(a)) for (const f of gr.frames) S.keySel.add(`${gr.bone}@${f}`); schedule('ae'); return; }
  act(st => { N.allStrips(st).forEach(s => { s.select = on; }); if (!on) st.sel.strip = null; else st.sel.strip = st.sel.strip || N.selectedStrips(st)[0]?.id || null; return ''; });
}
function toggleSidebar() { S.sb = !S.sb; $('#nla-body').classList.toggle('no-sb', !S.sb); $('#sb-toggle').setAttribute('aria-pressed', String(S.sb)); schedule('nla'); }
$('#sb-toggle').addEventListener('click', toggleSidebar);

// Bake Action dialog.
let bakeEl = null;
function closeBake() { bakeEl?.remove(); bakeEl = null; }
function openBake() {
  closeBake(); const st = S.st;
  bakeEl = document.createElement('div'); bakeEl.className = 'bake-pop';
  bakeEl.innerHTML = `<h5>Bake Action</h5>
    ${field('Frame Start', `<input type="number" id="bk-a" value="${st.range[0]}">`)}${field('End', `<input type="number" id="bk-b" value="${st.range[1]}">`)}${field('Frame Step', `<input type="number" id="bk-s" value="1" min="1">`)}
    <label class="sb-check"><input type="checkbox" checked disabled>Only Selected Bones <small>(${esc(t('all bones here'))})</small></label>
    <label class="sb-check"><input type="checkbox" id="bk-o">Overwrite Current Action</label>
    <label class="sb-check"><input type="checkbox" id="bk-c">Clean Curves</label>
    <label class="sb-check"><input type="checkbox" checked disabled>Bake Data: Pose</label>
    <div class="bp-actions"><button type="button" class="mini-button" id="bk-cancel">${esc(t('Cancel'))}</button><button type="button" class="exp-button" id="bk-go">Bake</button></div>`;
  document.body.append(bakeEl);
  const x = S.pointer?.cx ?? innerWidth / 2, y = S.pointer?.cy ?? innerHeight / 2, r = bakeEl.getBoundingClientRect();
  bakeEl.style.left = clamp(x - r.width / 2, 8, innerWidth - r.width - 8) + 'px'; bakeEl.style.top = clamp(y - 40, 8, innerHeight - r.height - 8) + 'px';
  bakeEl.addEventListener('keydown', e => e.stopPropagation());
  bakeEl.querySelector('#bk-cancel').onclick = closeBake;
  bakeEl.querySelector('#bk-go').onclick = () => {
    const a = Math.round(+bakeEl.querySelector('#bk-a').value), b = Math.round(+bakeEl.querySelector('#bk-b').value), s = Math.max(1, Math.round(+bakeEl.querySelector('#bk-s').value));
    const o = bakeEl.querySelector('#bk-o').checked, c = bakeEl.querySelector('#bk-c').checked;
    closeBake(); if (!(b > a)) return msg('The end must be after the start.', true);
    act(st2 => N.bake(st2, { start: a, end: b, step: s, overwrite: o, clean: c })); frameAllAE();
  };
}
document.addEventListener('pointerdown', e => { if (bakeEl && !bakeEl.contains(e.target)) closeBake(); });

// ─── Timeline and playback ──────────────────────────────────────────────────
function setFrame(f, save = false) {
  const st = S.st; f = Math.round(f);
  if (f === st.frame) return;
  st.frame = clamp(f, -50, 600); schedule('frame');
  if (save) saveData();
}
let playT = 0, playAcc = 0;
function togglePlay(on = !S.playing) {
  S.playing = on; $('#b-play').setAttribute('aria-pressed', String(on)); $('#b-play').textContent = on ? '⏸' : '▶';
  if (on) { playT = performance.now(); playAcc = 0; if (S.st.frame >= S.st.range[1]) setFrame(S.st.range[0]); requestAnimationFrame(tick); } else saveData();
}
function tick(now) {
  if (!S.playing) return;
  playAcc += (now - playT) / 1000; playT = now;
  const steps = Math.floor(playAcc * N.FPS);
  if (steps > 0) { playAcc -= steps / N.FPS; let f = S.st.frame + steps; if (f > S.st.range[1]) f = S.st.range[0] + (f - S.st.range[1] - 1); setFrame(f); }
  requestAnimationFrame(tick);
}
$('#b-play').onclick = () => togglePlay();
$('#b-start').onclick = () => setFrame(S.st.range[0], true);
$('#b-end').onclick = () => setFrame(S.st.range[1], true);
$('#b-prev').onclick = () => setFrame(S.st.frame - 1, true);
$('#b-next').onclick = () => setFrame(S.st.frame + 1, true);
$('#f-cur').onchange = e => setFrame(+e.target.value || 0, true);
$('#f-start').onchange = e => act(st => { const v = Math.round(+e.target.value); if (v < st.range[1]) st.range = [v, st.range[1]]; return ''; });
$('#f-end').onchange = e => act(st => { const v = Math.round(+e.target.value); if (v > st.range[0]) st.range = [st.range[0], v]; return ''; });
function syncTimeline() {
  const st = S.st;
  if (document.activeElement !== $('#f-cur')) $('#f-cur').value = st.frame;
  if (document.activeElement !== $('#f-start')) $('#f-start').value = st.range[0];
  if (document.activeElement !== $('#f-end')) $('#f-end').value = st.range[1];
  $('#time-sec').textContent = `${((st.frame - 1) / N.FPS).toFixed(2)} s`;
}

// ─── Stack view (lab view) ──────────────────────────────────────────────────
const BLEND_NAME = Object.fromEntries(BLENDS);
function renderStack(res) {
  const el = $('#stack-view'); el.hidden = !S.showStack; if (!S.showStack) return;
  const st = S.st, rows = [];
  const pct = v => `${Math.round(v * 100)}%`;
  if (st.adt.action && !st.adt.tweak) rows.push(`<div class="sv-row line"><b data-no-i18n>${esc(t('Action line'))}</b><span data-no-i18n>${esc(st.adt.action)} · ${esc(t(BLEND_NAME[st.adt.blend]))}</span><i>${res.line ? pct(res.line.inf) : '—'}</i><span class="sv-bar"><u style="width:${res.line ? pct(res.line.inf) : 0}"></u></span></div>`);
  for (const L of [...res.layers].reverse()) {
    const nm = `<b data-no-i18n title="${esc(L.track.name)}">${esc(L.track.name)}</b>`;
    if (L.off) { rows.push(`<div class="sv-row off">${nm}<span>${esc(t(N.anySolo(st) ? 'not soloed' : 'muted'))}</span><i></i></div>`); continue; }
    const c = L.c;
    if (!c) { rows.push(`<div class="sv-row none">${nm}<span>${esc(t('nothing at this frame'))}</span><i></i></div>`); continue; }
    let desc;
    if (c.transition) desc = `${esc(c.strip.name)} · ${pct(c.k)}`;
    else desc = `${esc(c.strip.name)} · ${esc(t(BLEND_NAME[c.mode]))} · ${c.held ? esc(t('held')) : esc(tr('frame {n}', { n: fmt(c.actionFrame, 1) }))}`;
    const inf = c.transition ? 1 : c.inf;
    rows.push(`<div class="sv-row">${nm}<span data-no-i18n>${desc}</span><i>${pct(inf)}</i><span class="sv-bar"><u style="width:${pct(inf)}"></u></span></div>`);
  }
  el.innerHTML = `<h6><span>${esc(t('NLA STACK'))}</span><span>${esc(tr('FRAME {n}', { n: st.frame }))}</span></h6>${rows.join('') || `<div class="sv-row none"><b></b><span>${esc(t('No action and no tracks'))}</span><i></i></div>`}<div class="sv-foot">${esc(t('↑ evaluated last · rest pose underneath'))}</div>`;
}

// ─── Stages, guide and step card ────────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; store.set(dataKey(), S.st); S.stageIndex = +b.dataset.stage; S.step = 0; enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const ctx = () => ({ evaluate: f => N.evaluate(S.st, f) });
const stepDone = i => i === S.step ? !!step().check(S.st, ctx()) : !!S.done[doneKey(i)];
function renderGuide() {
  const st = stage(), g = $('#guide');
  g.classList.toggle('three', st.steps.length === 3); g.classList.toggle('five', st.steps.length === 5);
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; store.set(dataKey(), S.st); S.step = +li.dataset.step; enterStep(); });
const MORE = { a1: 'vocab', a2: 'vocab', a3: 'vocab', a4: 'vocab', k1: 'save', k2: 'save', k3: 'save', x1: 'extrap', m2: 'extrap', x3: 'extrap', m1: 'order', m3: 'blend', b3: 'blend', m4: 'blend', b5: 'blend', t1: 'controls', t2: 'controls', t3: 'controls', t4: 'controls', l1: 'order', l2: 'blend', l3: 'controls', l4: 'save' };
const MORE_NAME = { vocab: 'Vocabulary', save: 'Saving actions', order: 'Evaluation order', extrap: 'Extrapolation', blend: 'Blending', controls: 'Every control' };
const moreLink = id => MORE[id] ? `<a class="mini-link more-link" href="#fundamentals" data-open="${MORE[id]}">${esc(tr('Read more: {topic} ↓', { topic: t(MORE_NAME[MORE[id]]) }))}</a>` : '';
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t('HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      ${moreLink(s.id)}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { const before = JSON.stringify(S.st); S.st = step().start(); S.undo.push(before); S.keySel.clear(); changed(); frameAllNLA(); frameAllAE(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { const before = JSON.stringify(S.st); const st = step().start(); step().solve(st); N.validate(st); S.st = st; S.undo.push(before); S.keySel.clear(); changed(); frameAllNLA(); frameAllAE(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
  if (id === 'next-step') { store.set(dataKey(), S.st); S.step++; enterStep(); }
  if (id === 'next-stage') { store.set(dataKey(), S.st); S.stageIndex++; S.step = 0; enterStep(); }
});
let lastOk = null;
function checkProgress() {
  const ok = stepDone(S.step);
  if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (ok && lastOk === false) msg(tr('✓ Step done: {s}', { s: t(step().title) }));
  lastOk = ok;
}
function enterStep() {
  togglePlay(false); store.set('stage', S.stageIndex); store.set('step', S.step);
  loadData(); lastOk = stepDone(S.step);
  renderStageSwitch(); changed(false);
}

// ─── Redraw ─────────────────────────────────────────────────────────────────
const dirty = new Set(); let raf = 0;
function schedule(what) { dirty.add(what); if (!raf) raf = requestAnimationFrame(flush); }
function flush() {
  raf = 0; const d = new Set(dirty); dirty.clear();
  const all = d.has('all'), fr = d.has('frame');
  const res = N.evaluate(S.st, S.st.frame);
  applyPose(res.pose); renderer.render(scene, camera);
  if (all || fr || d.has('nla')) drawNLA();
  if (all || fr || d.has('ae')) drawAE();
  if (all || fr) { renderStack(res); syncTimeline(); drawOverlay(); updateInfField(); }
}
function drawOverlay() {
  const tw = S.st.adt.tweak ? N.findStrip(S.st, S.st.adt.tweak)?.strip : null;
  $('#view-overlay').innerHTML = `<div>${esc(t('User Perspective'))}</div><div data-no-i18n>(${S.st.frame}) Mannequin${tw ? ` · <b>${esc(t('Tweak'))}: ${esc(tw.action)}</b>` : ''}</div>`;
}
function updateInfField() {
  const el = $('#inf-field'), s = N.activeStrip(S.st); if (!el || !s || s.type !== 'action' || document.activeElement === el) return;
  const inf = s.animInf ? (s.infKeys.length ? N.evalInfluenceKeys(s.infKeys, S.st.frame) : s.influence) : N.stripInfluence(s, S.st.frame);
  el.value = fmt(inf, 3);
  if (s.animInf && s.infKeys.length) { const keyed = s.infKeys.some(([f]) => Math.abs(f - S.st.frame) < 1e-6); el.classList.toggle('keyed', keyed); el.classList.toggle('animated', !keyed); }
}
// After every change: redraw everything, save, check the step.
function changed(save = true, light = false) {
  N.validate(S.st);
  $('#tweak-badge').hidden = !S.st.adt.tweak;
  $('#ed-nla').classList.toggle('tweaking', !!S.st.adt.tweak);
  renderChannels(); renderAEHeader();
  if (!light) renderSidebar();
  schedule('all');
  if (save) saveData();
  if (!light) { checkProgress(); renderGuide(); renderStepCard(); }
}

// ─── Status bar hints (they follow the editor under the mouse) ─────────────
const HINTS = {
  nla: [['LMB', 'Select / drag strips'], ['G', 'Move'], ['S', 'Scale'], ['Tab', 'Tweak'], ['Shift A', 'Add strip'], ['Shift D', 'Duplicate'], ['H', 'Mute'], ['X', 'Delete'], ['N', 'Sidebar']],
  action: [['LMB', 'Select keys'], ['Dbl-click', 'Select a row'], ['G', 'Move keys'], ['X', 'Delete keys'], ['A', 'Select all'], ['Space', 'Play']],
  view: [['MMB', 'Orbit'], ['Shift MMB', 'Pan'], ['Wheel', 'Zoom'], ['Home', 'Frame'], ['Space', 'Play']],
  time: [['Space', 'Play'], ['← →', 'Frame'], ['Shift ← →', 'Start / end']],
};
function renderHints() {
  const list = HINTS[S.hover] || HINTS.nla;
  $('#status-keys').innerHTML = list.map(([k, l]) => `<span>${k.split(' ').map(x => `<kbd>${esc(x)}</kbd>`).join('')}${esc(t(l))}</span>`).join('') + `<span><kbd>Ctrl</kbd><kbd>Z</kbd>${esc(t('Undo'))}</span>`;
}
document.querySelectorAll('[data-editor]').forEach(el => el.addEventListener('pointerenter', () => { S.hover = el.dataset.editor; renderHints(); }));
const ws = $('#workspace');
let inWs = false;
ws.addEventListener('pointerenter', () => { inWs = true; });
ws.addEventListener('pointerleave', () => { inWs = false; });

// ─── Keyboard (only while the pointer is over the workspace, like Blender) ──
document.addEventListener('keydown', e => {
  if (S.modal) { e.preventDefault(); modalKey(e); return; }
  if (e.target.closest('input, select, textarea')) { if (e.key === 'Escape' || (e.key === 'Enter' && e.target.matches('input'))) { const el = e.target; setTimeout(() => el.blur(), 0); } if (!(S.infHover && e.key.toLowerCase() === 'i' && e.target.id !== 'inf-field')) return; }
  if (!inWs && e.key !== 'Escape') return;
  const k = e.key, low = (/^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : k).toLowerCase(), ctrl = e.ctrlKey || e.metaKey, ed = S.hover;
  let handled = true;
  if (k === 'Escape') { closeMenu(); closeBake(); }
  else if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (ctrl && low === 's') act(N.saveReopen);
  else if (k === ' ') togglePlay();
  else if (k === 'ArrowLeft') setFrame(e.shiftKey ? S.st.range[0] : S.st.frame - 1, true);
  else if (k === 'ArrowRight') setFrame(e.shiftKey ? S.st.range[1] : S.st.frame + 1, true);
  else if (low === 'i' && S.infHover) keyInfluence();
  else if (ed === 'view') { if (k === 'Home') frameView(); else handled = false; }
  else if (ed === 'action') {
    if (low === 'g' && !ctrl) startModal('ae', 'keys');
    else if ((low === 'x' || k === 'Delete') && !ctrl) deleteSelectedKeys();
    else if (low === 'a' && e.altKey) selectAll(false);
    else if (low === 'a' && !ctrl) selectAll(true);
    else if (k === 'Home') frameAllAE();
    else if (k === 'Tab') msg('Tab works over the NLA editor: there it starts and stops Tweak Mode.', true);
    else handled = false;
  } else if (ed === 'nla') {
    if (k === 'Tab') act(N.tweakEnter), frameAllAE();
    else if (low === 'a' && e.shiftKey) openShiftA();
    else if (low === 't' && e.shiftKey) act(N.addTransition);
    else if (low === 'd' && e.shiftKey) dupMove(false);
    else if (low === 'd' && e.altKey) dupMove(true);
    else if (low === 'a' && ctrl) act(N.applyScale);
    else if (low === 's' && e.altKey) act(N.clearScale);
    else if (low === 'f' && e.altKey) act(N.swapStrips);
    else if (low === 'g' && !ctrl) startModal('nla', 'move');
    else if (low === 's' && !ctrl) startModal('nla', 'scale');
    else if (low === 'y' && !ctrl) act(N.split);
    else if ((low === 'x' || k === 'Delete') && !ctrl) act(N.deleteStrips);
    else if (low === 'h' && !ctrl) act(N.toggleMute);
    else if (low === 'u' && !ctrl) act(N.makeSingleUser);
    else if (k === 'PageUp') act(st => N.moveStripsTrack(st, 1));
    else if (k === 'PageDown') act(st => N.moveStripsTrack(st, -1));
    else if (low === 'a' && e.altKey) selectAll(false);
    else if (low === 'a') selectAll(true);
    else if (low === 'n') toggleSidebar();
    else if (k === 'Home') frameAllNLA();
    else handled = false;
  } else handled = false;
  if (handled) e.preventDefault();
});

// ─── Help: what a control does, when the mouse rests on it ───────────────
const helpEl = document.createElement('div'); helpEl.className = 'help-pop'; helpEl.hidden = true; helpEl.dataset.noI18n = ''; helpEl.setAttribute('role', 'tooltip'); document.body.append(helpEl);
let helpTimer = 0, helpFor = null;
function showHelp(el) {
  const h = HELP[el.dataset.help]; if (!h) return;
  helpEl.innerHTML = `<b>${esc(helpTitle(h.title))}</b><div>${t(h.body)}</div>`;
  helpEl.hidden = false;
  const r = el.getBoundingClientRect(), p = helpEl.getBoundingClientRect();
  let x = r.left - p.width - 10, y = r.top;
  if (x < 8) x = Math.min(innerWidth - p.width - 8, r.right + 10);
  if (x + p.width > innerWidth - 8 || x < 8) { x = clamp(r.left, 8, innerWidth - p.width - 8); y = r.bottom + 6; }
  if (y + p.height > innerHeight - 8) y = Math.max(8, r.top - p.height - 6);
  helpEl.style.left = x + 'px'; helpEl.style.top = y + 'px';
}
function hideHelp() { clearTimeout(helpTimer); helpEl.hidden = true; helpFor = null; }
document.addEventListener('pointerover', e => {
  const el = e.target.closest?.('[data-help]');
  if (el === helpFor) return;
  hideHelp(); if (!el || S.modal || S.drag) return;
  helpFor = el; helpTimer = setTimeout(() => showHelp(el), 450);
});
document.addEventListener('pointerdown', hideHelp, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideHelp(); });

// ─── Toggles, sizes, start ──────────────────────────────────────────────────
$('#t-stack').onchange = e => { S.showStack = e.target.checked; schedule('frame'); };
$('#t-bones').onchange = e => { S.showBones = e.target.checked; schedule('frame'); };
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }
new ResizeObserver(() => { resizeView(); schedule('all'); }).observe(host);
new ResizeObserver(() => schedule('all')).observe(nlaScroll);
new ResizeObserver(() => schedule('ae')).observe(aeHost);
onLangChange(() => { renderStageSwitch(); renderHints(); changed(false); translateTitles(); });
frameView(); enterStep(); resizeView(); renderHints(); translateTitles();
window.__nla = { S, N, STAGES, act, setFrame, go: (a, b) => { store.set(dataKey(), S.st); S.stageIndex = a; S.step = b; enterStep(); }, solve: () => document.getElementById('show-solution')?.click(),
  stripRect: id => { const f = N.findStrip(S.st, id); const g = stripGeom(f.strip, f.ti), r = nlaCv.getBoundingClientRect(); return { x: r.left + (g.x0 + g.x1) / 2, y: r.top + g.y + g.h / 2 }; },
  rowRect: bone => { const { action } = editedAction(); const gi = aeGroups(S.st.actions[action]).findIndex(gr => gr.bone === bone); const r = aeCv.getBoundingClientRect(); return { x: r.left + 40, y: r.top + RULER + (gi + 1) * AE_ROW + AE_ROW / 2 }; },
  done: () => stepDone(S.step) }; // for tests and curious students
