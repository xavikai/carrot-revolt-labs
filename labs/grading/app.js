// Color Grading Lab: a DaVinci Resolve-style Color page (viewer, nodes, palettes, scopes) on three photos.
import { defaultNode, gradeImage, keyImage, puckRGB, wheelNumbers, curveLUT, LUTS, luma, cb, cr, rgbHsl, balance, chroma, scopeAngle, angleDiff, SKIN_LINE } from './grade.js?v=1';
import { shot, SHOTS, REG, loadPhotos } from './shots.js?v=2';
import { STAGES, startState, measure, levelsOk, greyOk, skinOk, skinChromaOk, cardMidOk, matchReport, matchOk, keyReport, referenceA, answerQuiz, WAVE_QUIZ, PARADE_QUIZ, MATCH_QUIZ, isSCurve } from './stages.js?v=2';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=2';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-grade:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-grade:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = { stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [], done: store.get('done', {}), bypass: false, highlight: false, picker: false, feedback: null, hoverX: null };
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step], sid = () => step().id;
const node = () => S.st.nodes[Math.min(S.st.sel, S.st.nodes.length - 1)];
let msgTimer;
function msg(text, warning = false) { const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning); clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 7000); }
const VW = 512, VH = 288;
await loadPhotos(VW, VH);

// ─── Images ──────────────────────────────────────────────────────────────────
const img = id => shot(id, VW, VH);
let refCache = null;
function referenceImage() { if (!refCache) refCache = gradeImage(img('intA'), referenceA()); return refCache; }
let graded = null, lastKey = '';
function gradedData() {
  const key = S.st.shot + JSON.stringify(S.st.nodes) + S.bypass;
  if (key !== lastKey) { graded = S.bypass ? img(S.st.shot).data : gradeImage(img(S.st.shot), S.st.nodes); lastKey = key; }
  return graded;
}

// ─── Viewer ──────────────────────────────────────────────────────────────────
const vctx = $('#viewer').getContext('2d'), octx = $('#overlay').getContext('2d');
const vImg = vctx.createImageData(VW, VH);
function drawViewer() {
  const st = S.st, data = gradedData(), n = node(), d = vImg.data, wipe = st.wipe && st.shot !== 'intA', ref = wipe ? referenceImage() : null;
  let key = null;
  if (S.highlight && (n.qual || n.win)) { const i = st.nodes.indexOf(n), input = { w: VW, h: VH, data: gradeImage(img(st.shot), st.nodes.slice(0, i)) }; key = keyImage(input, n); }
  for (let p = 0, q = 0; p < VW * VH; p++, q += 3) {
    const x = p % VW, src = ref && x < VW / 2 ? ref : data;
    let r = src[q], g = src[q + 1], b = src[q + 2];
    if (key && !(ref && x < VW / 2)) { const k = key[p], y = 0.5; r = y + (r - y) * k; g = y + (g - y) * k; b = y + (b - y) * k; if (k < 0.5) { r = g = b = 0.35 + 0.1 * (r + g + b) / 3; } }
    d[p * 4] = r * 255; d[p * 4 + 1] = g * 255; d[p * 4 + 2] = b * 255; d[p * 4 + 3] = 255;
  }
  vctx.putImageData(vImg, 0, 0);
  drawOverlay();
  $('#tag-a').hidden = $('#tag-b').hidden = !wipe;
  $('#clip-name').textContent = `${t(SHOTS[st.shot].name)}${S.bypass ? ' · Bypass' : ''}`;
}
function drawOverlay() {
  const st = S.st, n = node();
  octx.clearRect(0, 0, VW, VH);
  if (st.wipe && st.shot !== 'intA') { octx.strokeStyle = '#fff'; octx.lineWidth = 1.5; octx.beginPath(); octx.moveTo(VW / 2, 0); octx.lineTo(VW / 2, VH); octx.stroke(); }
  if (n.win && st.palette === 'window') {
    const w = n.win; octx.save(); octx.strokeStyle = '#e8c14a'; octx.lineWidth = 1.5;
    for (const k of [1 - w.soft, 1, 1 + w.soft]) { octx.setLineDash(k === 1 ? [] : [4, 4]); octx.beginPath(); octx.ellipse(w.cx * VW, w.cy * VH, Math.max(1, w.rx * k * VH), Math.max(1, w.ry * k * VH), 0, 0, Math.PI * 2); octx.stroke(); }
    octx.setLineDash([]); octx.fillStyle = '#e8c14a'; octx.beginPath(); octx.arc(w.cx * VW, w.cy * VH, 4, 0, Math.PI * 2); octx.fill(); octx.restore();
  }
  if (S.hoverX != null && (st.scope === 'waveform' || st.scope === 'parade')) { octx.strokeStyle = 'rgba(255,255,255,.55)'; octx.setLineDash([3, 3]); octx.beginPath(); octx.moveTo(S.hoverX * VW, 0); octx.lineTo(S.hoverX * VW, VH); octx.stroke(); octx.setLineDash([]); }
}
// Pointer on the viewer: hover column, qualifier picker, window drag.
const ov = $('#overlay');
const uvAt = e => { const r = ov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
let winDrag = null;
ov.addEventListener('pointermove', e => {
  const [u, v] = uvAt(e); S.hoverX = u;
  if (winDrag) { node().win.cx = Math.max(0, Math.min(1, u - winDrag[0])); node().win.cy = Math.max(0, Math.min(1, v - winDrag[1])); changed(false, true); return; }
  drawOverlay(); drawScope();
});
ov.addEventListener('pointerleave', () => { S.hoverX = null; drawOverlay(); drawScope(); });
ov.addEventListener('pointerdown', e => {
  const st = S.st, n = node(), [u, v] = uvAt(e);
  if (st.palette === 'qualifier' && (S.picker || !n.qual)) {
    const i = st.nodes.indexOf(n), input = gradeImage(img(st.shot), st.nodes.slice(0, i)), p = (Math.floor(v * VH) * VW + Math.floor(u * VW)) * 3;
    const [h, s, l] = rgbHsl(Math.max(0, Math.min(1, input[p])), Math.max(0, Math.min(1, input[p + 1])), Math.max(0, Math.min(1, input[p + 2])));
    pushUndo(); n.qual = { h: Math.round(h), hw: 30, s0: Math.max(0, +(s - 0.2).toFixed(2)), s1: 1, l0: Math.max(0, +(l - 0.25).toFixed(2)), l1: Math.min(1, +(l + 0.25).toFixed(2)), soft: 0.1 };
    S.picker = false; S.highlight = true; changed(); msg('Picked. Refine the ranges; Highlight shows the key.'); return;
  }
  if (st.palette === 'window' && n.win) { pushUndo(); winDrag = [u - n.win.cx, v - n.win.cy]; ov.setPointerCapture(e.pointerId); }
});
ov.addEventListener('pointerup', () => { if (winDrag) { winDrag = null; changed(); } });

// ─── Scopes ──────────────────────────────────────────────────────────────────
const sc = $('#scope'), sctx = sc.getContext('2d');
const SW = 420, SH = 260;
function drawScope() {
  const st = S.st, data = gradedData(), kind = st.scope;
  sctx.fillStyle = '#0d0d0d'; sctx.fillRect(0, 0, SW, SH);
  const pad = 26, top = 10, bottom = SH - 16, yOf = v => bottom - (v + 0.05) / 1.1 * (bottom - top);
  const acc = (w, h) => new Float32Array(w * h);
  if (kind === 'waveform' || kind === 'parade') {
    const pw = SW - pad - 6, ph = bottom - top, parts = kind === 'parade' ? 3 : 1, colW = Math.floor(pw / parts);
    const bufs = [0, 1, 2].slice(0, parts).map(() => acc(colW, ph));
    for (let j = 0; j < VH; j += 1) for (let i = 0; i < VW; i += 2) {
      const q = (j * VW + i) * 3, x = Math.floor(i / VW * colW);
      if (parts === 1) { const y = Math.round(yOf(luma(data[q], data[q + 1], data[q + 2])) - top); if (y >= 0 && y < ph) bufs[0][y * colW + x] += 1; }
      else for (let c = 0; c < 3; c++) { const y = Math.round(yOf(data[q + c]) - top); if (y >= 0 && y < ph) bufs[c][y * colW + x] += 1; }
    }
    const im = sctx.createImageData(pw, ph), cols = parts === 1 ? [[140, 255, 150]] : [[255, 90, 80], [90, 255, 110], [90, 150, 255]];
    bufs.forEach((b, c) => { for (let y = 0; y < ph; y++) for (let x = 0; x < colW; x++) { const v = b[y * colW + x]; if (!v) continue; const k = Math.min(1, 0.18 + Math.log1p(v) * 0.32), o = (y * pw + x + c * colW) * 4; im.data[o] = cols[c][0] * k; im.data[o + 1] = cols[c][1] * k; im.data[o + 2] = cols[c][2] * k; im.data[o + 3] = 255; } });
    sctx.putImageData(im, pad, top);
    sctx.strokeStyle = 'rgba(255,255,255,.14)'; sctx.fillStyle = '#8a8a8a'; sctx.font = '10px Inter, sans-serif'; sctx.textAlign = 'right';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { const y = yOf(v) + 0.5; sctx.beginPath(); sctx.moveTo(pad, y); sctx.lineTo(SW - 6, y); sctx.stroke(); sctx.fillText(String(Math.round(v * 100)), pad - 4, y + 3); }
    sctx.strokeStyle = 'rgba(255,120,90,.5)'; for (const v of [0, 1]) { const y = yOf(v) + 0.5; sctx.beginPath(); sctx.moveTo(pad, y); sctx.lineTo(SW - 6, y); sctx.stroke(); }
    if (parts === 3) { sctx.strokeStyle = 'rgba(255,255,255,.2)'; for (let c = 1; c < 3; c++) { sctx.beginPath(); sctx.moveTo(pad + c * colW + 0.5, top); sctx.lineTo(pad + c * colW + 0.5, bottom); sctx.stroke(); } }
    if (S.hoverX != null) { sctx.strokeStyle = 'rgba(255,255,255,.6)'; sctx.setLineDash([3, 3]); for (let c = 0; c < parts; c++) { const x = pad + c * colW + S.hoverX * colW + 0.5; sctx.beginPath(); sctx.moveTo(x, top); sctx.lineTo(x, bottom); sctx.stroke(); } sctx.setLineDash([]); }
  } else if (kind === 'vectorscope') {
    const cx = SW / 2, cy = SH / 2, R = SH / 2 - 12, k = R / 0.5, im = sctx.getImageData(0, 0, SW, SH), b = new Float32Array(SW * SH);
    for (let j = 0; j < VH; j += 1) for (let i = 0; i < VW; i += 1) { const q = (j * VW + i) * 3, x = Math.round(cx + cb(data[q], data[q + 1], data[q + 2]) * k), y = Math.round(cy - cr(data[q], data[q + 1], data[q + 2]) * k); if (x >= 0 && x < SW && y >= 0 && y < SH) b[y * SW + x]++; }
    for (let p = 0; p < b.length; p++) if (b[p]) { const v = Math.min(1, 0.2 + Math.log1p(b[p]) * 0.25), o = p * 4; im.data[o] = 150 * v; im.data[o + 1] = 255 * v; im.data[o + 2] = 160 * v; im.data[o + 3] = 255; }
    sctx.putImageData(im, 0, 0);
    sctx.strokeStyle = 'rgba(255,255,255,.18)'; sctx.beginPath(); sctx.arc(cx, cy, R, 0, Math.PI * 2); sctx.stroke(); sctx.beginPath(); sctx.moveTo(cx - R, cy); sctx.lineTo(cx + R, cy); sctx.moveTo(cx, cy - R); sctx.lineTo(cx, cy + R); sctx.stroke();
    const targets = [['R', [0.75, 0, 0]], ['Yl', [0.75, 0.75, 0]], ['G', [0, 0.75, 0]], ['Cy', [0, 0.75, 0.75]], ['B', [0, 0, 0.75]], ['Mg', [0.75, 0, 0.75]]];
    sctx.font = '10px Inter, sans-serif'; sctx.textAlign = 'center';
    for (const [lab, c] of targets) { const x = cx + cb(...c) * k, y = cy - cr(...c) * k; sctx.strokeStyle = 'rgba(255,255,255,.45)'; sctx.strokeRect(x - 6, y - 6, 12, 12); sctx.fillStyle = '#aaa'; sctx.fillText(lab, x + (x - cx) * 0.12, y + (y - cy) * 0.12 + 3); }
    const a = SKIN_LINE * Math.PI / 180; sctx.strokeStyle = 'rgba(255,200,150,.7)'; sctx.beginPath(); sctx.moveTo(cx, cy); sctx.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R); sctx.stroke();
    sctx.fillStyle = '#ffc896'; sctx.textAlign = 'left'; sctx.fillText(t('skin tone line'), cx + Math.cos(a) * R * 0.62 + 6, cy - Math.sin(a) * R * 0.62);
  } else {
    const n = 128, hs = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let p = 0; p < VW * VH; p += 2) for (let c = 0; c < 3; c++) { const v = data[p * 3 + c]; hs[c][Math.max(0, Math.min(n - 1, Math.floor(v * n)))]++; }
    const mx = Math.max(...hs.map(h => Math.max(...h.slice(1, n - 1)))), pw = SW - pad - 6;
    const cols = ['rgba(255,90,80,.55)', 'rgba(90,255,110,.55)', 'rgba(90,150,255,.55)'];
    sctx.globalCompositeOperation = 'lighter';
    hs.forEach((h, c) => { sctx.fillStyle = cols[c]; sctx.beginPath(); sctx.moveTo(pad, bottom); for (let i = 0; i < n; i++) sctx.lineTo(pad + i / (n - 1) * pw, bottom - Math.min(1, h[i] / mx) * (bottom - top)); sctx.lineTo(pad + pw, bottom); sctx.fill(); });
    sctx.globalCompositeOperation = 'source-over';
    sctx.fillStyle = '#8a8a8a'; sctx.font = '10px Inter, sans-serif'; sctx.textAlign = 'center'; for (const v of [0, 25, 50, 75, 100]) sctx.fillText(String(v), pad + v / 100 * pw, SH - 3);
  }
}

// ─── Node editor ─────────────────────────────────────────────────────────────
function nodeTags(n) { const out = []; if (n.lut) out.push('LUT'); if (n.qual) out.push('Qualifier'); if (n.win) out.push('Window'); if (n.curve.length > 2) out.push('Curves'); return out.join(' · ') || (n.label === '01' ? 'Balance' : ''); }
function renderNodes() {
  const st = S.st, g = $('#node-graph'), y = 44, x0 = 40, dx = 112;
  const lines = st.nodes.map((n, i) => `<line x1="${x0 + i * dx + (i ? 0 : -24)}" y1="${y + 29}" x2="${x0 + i * dx + 2}" y2="${y + 29}" stroke="#7fbf6f" stroke-width="2"/>`).join('') + `<line x1="${x0 + (st.nodes.length - 1) * dx + 88}" y1="${y + 29}" x2="${x0 + (st.nodes.length - 1) * dx + 112}" y2="${y + 29}" stroke="#7fbf6f" stroke-width="2"/>` +
    st.nodes.slice(1).map((n, i) => `<line x1="${x0 + i * dx + 88}" y1="${y + 29}" x2="${x0 + (i + 1) * dx}" y2="${y + 29}" stroke="#7fbf6f" stroke-width="2"/>`).join('');
  g.innerHTML = `<svg>${lines}</svg><span class="io" style="left:8px;top:${y + 22}px"></span><span class="io" style="left:${x0 + (st.nodes.length - 1) * dx + 112}px;top:${y + 22}px"></span>` +
    st.nodes.map((n, i) => `<div class="node${i === st.sel ? ' sel' : ''}${n.on ? '' : ' off'}" data-node="${i}" style="left:${x0 + i * dx}px;top:${y}px"><b data-no-i18n>${esc(n.label)}</b><small>${esc(t(nodeTags(n)))}</small></div>`).join('');
  $('#node-tag').textContent = `Node ${node().label}`;
}
$('#node-graph').addEventListener('click', e => { const d = e.target.closest('[data-node]'); if (!d) return; S.st.sel = +d.dataset.node; S.picker = false; changed(); });
function addNode() { pushUndo(); const st = S.st, i = st.sel + 1, label = String(st.nodes.length + 1).padStart(2, '0'); st.nodes.splice(i, 0, defaultNode(label)); st.nodes.forEach((n, k) => { n.label = String(k + 1).padStart(2, '0'); }); st.sel = i; changed(); msg('Serial node added after the selected one.'); }
function toggleNode() { pushUndo(); node().on = !node().on; changed(); }
function deleteNode() { const st = S.st; if (st.nodes.length < 2) { msg('The first node cannot be deleted.', true); return; } pushUndo(); st.nodes.splice(st.sel, 1); st.nodes.forEach((n, k) => { n.label = String(k + 1).padStart(2, '0'); }); st.sel = Math.max(0, st.sel - 1); changed(); }
$('#add-node').addEventListener('click', addNode); $('#toggle-node').addEventListener('click', toggleNode); $('#del-node').addEventListener('click', deleteNode);

// ─── Palettes ────────────────────────────────────────────────────────────────
const ADJ = { temp: ['Temp', -100, 100, 0, 1], tint: ['Tint', -100, 100, 0, 1], contrast: ['Contrast', 0, 2, 1, 0.005], pivot: ['Pivot', 0, 1, 0.435, 0.002], sat: ['Sat', 0, 100, 50, 0.25], hue: ['Hue', 0, 100, 50, 0.25] };
const fmtAdj = (k, v) => k === 'contrast' || k === 'pivot' ? v.toFixed(3) : v.toFixed(k === 'temp' || k === 'tint' ? 1 : 2);
function adjHtml(keys) { const n = node(); return `<div class="adj-row">${keys.map(k => `<label class="adj"><span data-no-i18n>${ADJ[k][0]}</span><output data-adj="${k}" data-no-i18n>${fmtAdj(k, n[k])}</output></label>`).join('')}</div>`; }
const WHEELS = [['lift', 'Lift'], ['gamma', 'Gamma'], ['gain', 'Gain'], ['offset', 'Offset']];
function wheelsHtml() {
  return adjHtml(['temp', 'tint', 'contrast', 'pivot']) + `<div class="wheels">${WHEELS.map(([k, name]) => `<div class="wheel"><h5 data-no-i18n>${name}</h5><canvas class="disc" width="240" height="240" data-wheel="${k}"></canvas><div class="jog" data-jog="${k}"><i></i></div><div class="nums" data-nums="${k}"></div></div>`).join('')}</div>` + adjHtml(['sat', 'hue']);
}
const PUCK = 0.4;                          // chroma at the rim of a disc
function drawWheels() {
  for (const [k] of WHEELS) {
    const c = document.querySelector(`[data-wheel="${k}"]`); if (!c) continue;
    const g = c.getContext('2d'), R = 110, cx = 120, cy = 120, w = node()[k];
    g.clearRect(0, 0, 240, 240);
    for (let a = 0; a < 360; a += 3) { const r = a * Math.PI / 180, x = Math.cos(r) * 0.2, y = Math.sin(r) * 0.2, rgb = [0.5 + 1.5748 * y, 0.5 - 0.1873 * x - 0.4681 * y, 0.5 + 1.8556 * x].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)); g.strokeStyle = `rgb(${rgb})`; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, R, -r - 0.03, -r + 0.06, false); g.stroke(); }
    const grad = g.createRadialGradient(cx, cy, 4, cx, cy, R - 4); grad.addColorStop(0, '#3a3a3d'); grad.addColorStop(1, '#202022'); g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R - 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - R + 8, cy); g.lineTo(cx + R - 8, cy); g.moveTo(cx, cy - R + 8); g.lineTo(cx, cy + R - 8); g.stroke();
    const px = cx + w.x / PUCK * (R - 8), py = cy - w.y / PUCK * (R - 8);
    g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#e8872a'; g.beginPath(); g.arc(px, py, 3, 0, Math.PI * 2); g.fill();
    const jog = document.querySelector(`[data-jog="${k}"] i`); if (jog) jog.style.left = `calc(${50 + Math.max(-48, Math.min(48, w.m * 100))}% - 2px)`;
    const nums = document.querySelector(`[data-nums="${k}"]`); if (nums) nums.innerHTML = wheelNumbers(k, w).map(v => `<span>${v.toFixed(k === 'offset' ? 2 : 2)}</span>`).join('');
  }
}
function curvesHtml() { return `<div class="curve-wrap"><canvas id="curve" width="520" height="520"></canvas><p class="pal-note">${esc(t('Custom curve (Y). Click to add a point, drag to move it, double-click a point to delete it. The dashed line is the diagonal: no change.'))}</p></div>`; }
function drawCurve() {
  const c = $('#curve'); if (!c) return; const g = c.getContext('2d'), N = 520, n = node(), L = curveLUT(n.curve);
  g.clearRect(0, 0, N, N); g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * N / 4, 0); g.lineTo(i * N / 4, N); g.moveTo(0, i * N / 4); g.lineTo(N, i * N / 4); g.stroke(); }
  g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, N); g.lineTo(N, 0); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#e6e6e6'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < L.length; i++) { const x = i / (L.length - 1) * N, y = N - L[i] * N; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  for (const [x, y] of n.curve) { g.fillStyle = '#e8872a'; g.beginPath(); g.arc(x * N, N - y * N, 8, 0, Math.PI * 2); g.fill(); }
}
function qualHtml() {
  const q = node().qual;
  if (!q) return `<p class="pal-note">${esc(t('No qualifier on this node. Click on a colour in the viewer to pick it (the picker is on).'))}</p>`;
  const row = (k, label, min, max, st, v) => `<span data-no-i18n>${label}</span><input type="range" data-q="${k}" min="${min}" max="${max}" step="${st}" value="${v}"><output data-no-i18n>${(+v).toFixed(st < 1 ? 2 : 0)}</output>`;
  const lo = (q.h - q.hw / 2 + 360) % 360, span = q.hw;
  return `<div class="hue-ribbon"><i style="left:${lo / 360 * 100}%;width:${Math.min(100, span / 360 * 100)}%"></i></div>
    <div class="qual-grid">${row('h', 'Hue Center', 0, 360, 1, q.h)}${row('hw', 'Hue Width', 4, 180, 1, q.hw)}${row('s0', 'Sat Low', 0, 1, 0.01, q.s0)}${row('s1', 'Sat High', 0, 1, 0.01, q.s1)}${row('l0', 'Lum Low', 0, 1, 0.01, q.l0)}${row('l1', 'Lum High', 0, 1, 0.01, q.l1)}${row('soft', 'Soft', 0, 1, 0.01, q.soft)}</div>
    <div class="adj-row" style="margin-top:10px"><button type="button" class="rs-btn" id="q-pick"${S.picker ? ' aria-pressed="true"' : ''} data-no-i18n>Picker</button><button type="button" class="rs-btn" id="q-clear">${esc(t('Clear'))}</button></div>`;
}
function winHtml() {
  const w = node().win;
  const row = (k, label, min, max, st, v) => `<span data-no-i18n>${label}</span><input type="range" data-w="${k}" min="${min}" max="${max}" step="${st}" value="${v}"><output data-no-i18n>${(+v).toFixed(2)}</output>`;
  return `<div class="adj-row"><button type="button" class="rs-btn" id="w-circle" aria-pressed="${!!w}" data-no-i18n>Circle</button>${w ? `<label class="bl-check"><input type="checkbox" id="w-invert"${w.invert ? ' checked' : ''}><span data-no-i18n>Invert</span></label>` : ''}</div>
    ${w ? `<div class="qual-grid">${row('size', 'Size', 0.04, 0.6, 0.005, w.ry)}${row('aspect', 'Aspect', 0.3, 3, 0.01, w.rx / w.ry)}${row('soft', 'Soft', 0, 0.9, 0.01, w.soft)}</div><p class="pal-note">${esc(t('Drag the circle in the viewer to move it.'))}</p>` : `<p class="pal-note">${esc(t('Press Circle to add a circular Power Window to this node.'))}</p>`}`;
}
function lutHtml() { const n = node(); return `<div class="lut-list"><button type="button" data-lut="" aria-pressed="${!n.lut}">${esc(t('None'))}</button>${Object.entries(LUTS).map(([k, v]) => `<button type="button" data-lut="${k}" aria-pressed="${n.lut?.id === k}" data-no-i18n>${esc(v.name)}</button>`).join('')}</div><p class="pal-note">${esc(t('A creative LUT expects a balanced Rec.709 picture: apply it on a node after the balance.'))}</p>`; }
function renderPalette() {
  const st = S.st; document.querySelectorAll('#palette-tabs [data-pal]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.pal === st.palette)));
  const p = $('#palette');
  p.innerHTML = st.palette === 'wheels' ? wheelsHtml() : st.palette === 'curves' ? curvesHtml() : st.palette === 'qualifier' ? qualHtml() : st.palette === 'window' ? winHtml() : lutHtml();
  drawWheels(); drawCurve(); bindPalette();
}
$('#palette-tabs').addEventListener('click', e => { const b = e.target.closest('[data-pal]'); if (!b) return; S.st.palette = b.dataset.pal; S.picker = b.dataset.pal === 'qualifier' && !node().qual; renderPalette(); drawOverlay(); saveData(); });
// Drag helpers: scrub outputs, pucks, jog wheels, curve points.
function bindPalette() {
  const p = $('#palette');
  p.querySelectorAll('[data-adj]').forEach(o => {
    const k = o.dataset.adj, [, min, max, def, stepv] = ADJ[k];
    o.addEventListener('pointerdown', e => { pushUndo(); const x0 = e.clientX, v0 = node()[k]; o.setPointerCapture(e.pointerId); const mv = ev => { node()[k] = Math.max(min, Math.min(max, v0 + (ev.clientX - x0) * stepv)); o.textContent = fmtAdj(k, node()[k]); changed(false, true); }; const up = () => { o.removeEventListener('pointermove', mv); o.removeEventListener('pointerup', up); changed(); }; o.addEventListener('pointermove', mv); o.addEventListener('pointerup', up); });
    o.addEventListener('dblclick', () => { pushUndo(); node()[k] = def; changed(); });
  });
  p.querySelectorAll('[data-wheel]').forEach(c => {
    const k = c.dataset.wheel;
    const set = e => { const r = c.getBoundingClientRect(), R = r.width / 2 * (102 / 120), x = (e.clientX - r.left - r.width / 2) / R, y = -(e.clientY - r.top - r.height / 2) / R, l = Math.hypot(x, y), s = l > 1 ? 1 / l : 1; node()[k].x = x * s * PUCK; node()[k].y = y * s * PUCK; drawWheels(); changed(false, true); };
    c.addEventListener('pointerdown', e => { pushUndo(); c.setPointerCapture(e.pointerId); set(e); const mv = ev => set(ev), up = () => { c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); changed(); }; c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); });
    c.addEventListener('dblclick', () => { pushUndo(); Object.assign(node()[k], { x: 0, y: 0, m: 0 }); changed(); });
  });
  p.querySelectorAll('[data-jog]').forEach(j => {
    const k = j.dataset.jog;
    j.addEventListener('pointerdown', e => { pushUndo(); j.setPointerCapture(e.pointerId); const x0 = e.clientX, m0 = node()[k].m, mv = ev => { node()[k].m = Math.max(-0.9, Math.min(1.5, m0 + (ev.clientX - x0) * 0.002)); drawWheels(); changed(false, true); }, up = () => { j.removeEventListener('pointermove', mv); j.removeEventListener('pointerup', up); changed(); }; j.addEventListener('pointermove', mv); j.addEventListener('pointerup', up); });
    j.addEventListener('dblclick', () => { pushUndo(); node()[k].m = 0; changed(); });
  });
  const cv = $('#curve');
  if (cv) {
    const at = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))]; };
    cv.addEventListener('pointerdown', e => {
      const [x, y] = at(e), c = node().curve; pushUndo();
      let i = c.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 0.04);
      if (i < 0) { c.push([x, y]); c.sort((a, b) => a[0] - b[0]); i = c.findIndex(p => p[0] === x && p[1] === y); }
      cv.setPointerCapture(e.pointerId);
      const mv = ev => { const [nx, ny] = at(ev), pts = node().curve, end = i === 0 || i === pts.length - 1; const lo = i > 0 ? pts[i - 1][0] + 0.01 : 0, hi = i < pts.length - 1 ? pts[i + 1][0] - 0.01 : 1; pts[i] = [end ? pts[i][0] : Math.max(lo, Math.min(hi, nx)), ny]; drawCurve(); changed(false, true); };
      const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); changed(); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); drawCurve();
    });
    cv.addEventListener('dblclick', e => { const [x, y] = at(e), c = node().curve, i = c.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 0.05); if (i > 0 && i < c.length - 1) { pushUndo(); c.splice(i, 1); changed(); } });
  }
  p.querySelectorAll('[data-q]').forEach(r => r.addEventListener('input', () => { const q = node().qual; q[r.dataset.q] = +r.value; r.nextElementSibling.textContent = (+r.value).toFixed(+r.step < 1 ? 2 : 0); changed(false, true); }));
  p.querySelectorAll('[data-q]').forEach(r => r.addEventListener('pointerdown', () => pushUndo()));
  p.querySelectorAll('[data-q],[data-w]').forEach(r => r.addEventListener('change', () => changed()));
  p.querySelectorAll('[data-w]').forEach(r => { r.addEventListener('pointerdown', () => pushUndo()); r.addEventListener('input', () => { const w = node().win, v = +r.value; if (r.dataset.w === 'size') { const a = w.rx / w.ry; w.ry = v; w.rx = v * a; } else if (r.dataset.w === 'aspect') w.rx = w.ry * v; else w.soft = v; r.nextElementSibling.textContent = v.toFixed(2); changed(false, true); }); });
  $('#q-pick')?.addEventListener('click', () => { S.picker = !S.picker; renderPalette(); msg(S.picker ? 'Click a colour in the viewer.' : ''); });
  $('#q-clear')?.addEventListener('click', () => { pushUndo(); node().qual = null; S.highlight = false; S.picker = true; changed(); });
  $('#w-circle')?.addEventListener('click', () => { pushUndo(); const n = node(); n.win = n.win ? null : { cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2, soft: 0.3, invert: false }; changed(); });
  $('#w-invert')?.addEventListener('change', e => { pushUndo(); node().win.invert = e.target.checked; changed(); });
  p.querySelectorAll('[data-lut]').forEach(b => b.addEventListener('click', () => { pushUndo(); node().lut = b.dataset.lut ? { id: b.dataset.lut, mix: 1 } : null; changed(); }));
}

// ─── Readouts and quizzes ────────────────────────────────────────────────────
const statRow = (label, value, good = null) => `<div class="sb-stat${good == null ? '' : good ? ' good' : ' bad'}"><span>${esc(t(label))}</span><b data-no-i18n>${esc(value)}</b></div>`;
const QUIZ = { s1: WAVE_QUIZ, s2: PARADE_QUIZ, m2: MATCH_QUIZ };
function quizHtml(list) {
  const i = S.st.quiz | 0, done = i >= list.length, item = list[Math.min(i, list.length - 1)];
  return `<div class="panel quiz quiz-box" style="padding:0;border:0"><h4>${esc(t('Case'))}<small>${Math.min(i + 1, list.length)} / ${list.length}</small></h4>
    ${done ? `<p class="q done">${esc(t('✓ All right.'))}</p>` : `<p class="q">${esc(t(item.q))}</p><div class="opt-grid">${item.opts.map((o, k) => `<button type="button" data-ans="${k}">${esc(t(o))}</button>`).join('')}</div>`}
    ${S.feedback ? `<p class="td-note ${S.feedback.ok ? 'good' : 'bad'}">${esc(S.feedback.text)}</p>` : ''}</div>`;
}
const pct = v => (v * 100).toFixed(0);
function renderReadouts() {
  const st = S.st, id = sid(), m = measure(st); let h = '';
  if (QUIZ[id]) h += quizHtml(QUIZ[id]);
  h += `<h4>${esc(t('Levels'))}</h4>` + statRow('Blacks (darkest 0.5 %)', pct(m.black), m.black >= -0.005 && m.black <= 0.06) + statRow('Whites (brightest 0.5 %)', pct(m.white), st.shot === 'intB' ? null : m.white >= 0.88 && m.white <= 1.0);
  if (st.shot !== 'ext') {
    const g = m.reg.grey, sk = m.reg.skin, ang = scopeAngle(...sk);
    if (st.shot === 'intA') h += `<h4>${esc(t('Grey card'))}</h4>` + statRow('R · G · B', g.map(pct).join(' · '), greyOk(m, 0.015)) + statRow('Card level', pct(luma(...g)), cardMidOk(m));
    h += `<h4>${esc(t('Skin'))}</h4>` + statRow('Angle (skin line 123°)', ang.toFixed(0) + '°', angleDiff(ang, SKIN_LINE) <= 6) + statRow('Saturation', (chroma(sk) * 100).toFixed(1), skinChromaOk(m));
  }
  if (id === 'm1') { const r = matchReport(st); h += `<h4>${esc(t('Match with A camera'))}</h4>` + statRow('Skin hue difference', r.dAngle.toFixed(1) + '°', r.dAngle <= 5) + statRow('Skin level difference', (r.dLuma * 100).toFixed(1), Math.abs(r.dLuma) <= 0.03) + statRow('Skin saturation difference', (r.dChroma * 100).toFixed(1), Math.abs(r.dChroma) <= 0.02) + statRow('Wall level difference', (r.dWall * 100).toFixed(1), Math.abs(r.dWall) <= 0.06) + statRow('Blacks', pct(r.black), r.black <= 0.09); }
  if (id === 'q1' || id === 'q2') { const i = st.nodes.findIndex((n, k) => k > 0 && (n.qual || n.win)); if (i > 0) { const k = keyReport(st, i); h += `<h4>${esc(tr('Key of node {n}', { n: st.nodes[i].label }))}</h4>` + (id === 'q1' ? statRow('Sky inside the key', pct(k.sky) + ' %', k.sky >= 0.8) + statRow('Rest inside the key', pct(k.rest) + ' %', k.rest <= 0.08) : statRow('Face inside the key', pct(k.face) + ' %', k.face >= 0.6)); } }
  if (id === 'n2') { const c = st.nodes.slice(2).some(n => n.on && isSCurve(n.curve)); h += statRow('S curve on node 03 or later', c ? '✓' : '—', c); }
  $('#readouts').innerHTML = h;
}
$('#readouts').addEventListener('click', e => {
  const b = e.target.closest('[data-ans]'); if (!b) return;
  const list = QUIZ[sid()]; pushUndo(); const r = answerQuiz(S.st, list, +b.dataset.ans);
  S.feedback = { ok: r.ok, text: (r.ok ? '✓ ' : '✗ ') + t(r.item.why) }; if (!r.ok) S.undo.pop(); changed();
});

// ─── Header buttons, scope select, keyboard ──────────────────────────────────
$('#scope-sel').addEventListener('change', e => { S.st.scope = e.target.value; saveData(); drawScope(); drawOverlay(); });
$('#bypass-btn').addEventListener('click', () => { S.bypass = !S.bypass; changed(false); });
$('#split-btn').addEventListener('click', () => { if (S.st.shot === 'intA') { msg('Split compares the B camera with a still of the A camera (last stage).'); return; } S.st.wipe = !S.st.wipe; changed(); });
$('#hl-btn').addEventListener('click', () => { S.highlight = !S.highlight; changed(false); });
function renderHeaders() {
  $('#bypass-btn').setAttribute('aria-pressed', String(S.bypass)); $('#split-btn').setAttribute('aria-pressed', String(!!S.st.wipe && S.st.shot !== 'intA')); $('#hl-btn').setAttribute('aria-pressed', String(S.highlight));
  $('#scope-sel').value = S.st.scope;
}
let hover = false;
$('#workspace').addEventListener('pointerenter', () => { hover = true; }); $('#workspace').addEventListener('pointerleave', () => { hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || !hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
  if (ctrl && low === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  else if (ctrl && low === 'y') { redo(); e.preventDefault(); }
  else if (ctrl && low === 'd') { toggleNode(); e.preventDefault(); }
  else if (e.altKey && low === 's') { addNode(); e.preventDefault(); }
  else if (e.shiftKey && low === 'h') { S.highlight = !S.highlight; changed(false); e.preventDefault(); }
});

// ─── Undo, storage, steps ────────────────────────────────────────────────────
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) { msg('Nothing to undo.'); return; } S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(); msg('Undo.'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); msg('Redo.'); }
const dataKey = () => `step:${stage().id}-${step().id}`;
function saveData() { store.set(dataKey(), S.st); }
function loadData() { const saved = store.get(dataKey(), null), fresh = startState(step()); S.st = saved && typeof saved === 'object' && saved.shot === fresh.shot && Array.isArray(saved.nodes) && saved.nodes.length ? { ...fresh, ...saved, flags: { ...saved.flags } } : fresh; }
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
    <div><span class="control-label">${esc(t('HOW, AS IN RESOLVE'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') { pushUndo(); S.st = startState(step()); S.feedback = null; changed(); msg('Back to the start. Ctrl Z undoes it.'); }
  if (id === 'show-solution') { pushUndo(); step().solve(S.st); changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
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
let frameQueued = false, liveT = null;
function changed(save = true, live = false) {
  if (save) saveData();
  if (!frameQueued) { frameQueued = true; requestAnimationFrame(() => { frameQueued = false; drawViewer(); drawScope(); renderNodes(); renderHeaders(); }); }
  if (live) { clearTimeout(liveT); liveT = setTimeout(() => { renderReadouts(); checkProgress(); }, 120); return; }
  const a = document.activeElement; if (!(a && a.closest && a.closest('#palette') && a.type === 'range')) renderPalette();
  renderReadouts(); checkProgress();
}
function enterStep() {
  loadData(); S.undo = []; S.redo = []; S.feedback = null; S.highlight = false; S.picker = S.st.palette === 'qualifier' && !node().qual;
  lastOk = null; lastCard = ''; lastOk = stepDone(S.step);
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  renderStageSwitch(); changed(false);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); renderPalette(); renderReadouts(); renderNodes(); drawScope(); checkProgress(); drawViewer(); });
enterStep();
window.__grade = { S, STAGES, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); }, solve: () => { step().solve(S.st); changed(); }, measure: () => measure(S.st) };
