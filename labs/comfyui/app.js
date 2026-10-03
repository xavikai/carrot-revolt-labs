// Carrot Revolt Labs · ComfyUI Lab · a ComfyUI-style interface on top of a model-free simulator.
import { NODES, CATEGORIES, TYPE_COLOR, CHECKPOINTS, LORAS, CONTROLNETS, IMAGES, makeNode, makeLink, connect, canConnect, validate, cacheKeys, execute, describeRecipe, effects, defaultGraph } from './engine.js';
import { renderValue, renderRecipe, hashSeed } from './render.js';
import { DOCS, UI, KEYS } from './texts.js';
// A lab is this interface plus a config module (stages, templates, texts, extra nodes). Default: the ComfyUI Lab.
const CFG = await import(document.body.dataset.config ? new URL(document.body.dataset.config, location.href).href : './lessons.js');
const { STAGES, TEMPLATES } = CFG, META = CFG.META || {};
if (CFG.UI) Object.assign(UI, CFG.UI);
if (CFG.DOCS) Object.assign(DOCS, CFG.DOCS);
import { getLang, onLangChange, initI18n } from '../../i18n.js';

const $ = (q, r = document) => r.querySelector(q), $$ = (q, r = document) => [...r.querySelectorAll(q)];
const T = v => typeof v === 'string' ? v : (v?.[getLang()] ?? v?.en ?? '');
const U = (k, vars) => { let s = T(UI[k]); for (const [a, b] of Object.entries(vars || {})) s = s.replaceAll(`{${a}}`, b); return s; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = v => JSON.parse(JSON.stringify(v));
const KEY = META.key || 'carrot-revolt-comfy:';
const store = { get(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* full or private */ } } };

/* ── State ── */
const S = {
  stage: Math.min(STAGES.length - 1, store.get('stage', 0)), step: 0,
  graph: null, flags: {}, history: [], sel: new Set(), clip: null,
  zoom: 1, panX: 0, panY: 0, panel: null, running: false, cancel: false, lastKeys: {}, images: {}, undo: [], redo: [],
  hideLinks: false, info: null, done: store.get('done', {}),
};
const stage = () => STAGES[S.stage], step = () => stage().steps[S.step];
const sk = () => `${stage().id}:${S.step}`;
S.step = Math.min(stage().steps.length - 1, store.get(`step:${stage().id}`, 0));
function loadStep() {
  S.graph = store.get(`graph:${sk()}`, null) || step().starter();
  S.graph.groups ||= [];
  S.flags = store.get(`flags:${sk()}`, {}); S.history = store.get(`hist:${sk()}`, []);
  S.sel.clear(); S.undo = []; S.redo = []; S.images = {}; S.lastKeys = {};
}
const save = () => { store.set(`graph:${sk()}`, S.graph); store.set(`flags:${sk()}`, S.flags); store.set(`hist:${sk()}`, S.history.slice(-24)); store.set('stage', S.stage); store.set(`step:${stage().id}`, S.step); store.set('done', S.done); };
const nodeById = id => S.graph.nodes.find(n => n.id === id);
const flag = k => { if (!S.flags[k]) { S.flags[k] = true; save(); checkGoals(); } };

/* ── Shell ── */
const COLORS = { red: ['#322', '#533'], brown: ['#332922', '#593930'], green: ['#232', '#353'], blue: ['#223', '#335'], pale_blue: ['#2a363b', '#3f5159'], cyan: ['#233', '#355'], purple: ['#323', '#535'], yellow: ['#432', '#653'], black: ['#222', '#000'] };
const ICON = {
  queue: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  nodes: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="14" width="7" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 7c5 0 0 10 4 10" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  models: '<svg viewBox="0 0 24 24"><path d="M12 3 20 7.5v9L12 21 4 16.5v-9z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 7.5 12 12l8-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  workflows: '<svg viewBox="0 0 24 24"><path d="M5 3h9l5 5v13H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  templates: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="1.8"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="2"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M4 17c6 0 4-10 16-10" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  palette: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="9" r="1.4" fill="currentColor"/><circle cx="15" cy="9" r="1.4" fill="currentColor"/><circle cx="9" cy="15" r="1.4" fill="currentColor"/></svg>',
  bypass: '<svg viewBox="0 0 24 24"><path d="M3 12h5c2 0 2-6 5-6h8M16 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="8" y="12" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
function shell() {
  document.title = `${META.title || 'ComfyUI Lab'} · Carrot Revolt Labs`;
  document.body.innerHTML = `
  <header class="site-header"><a class="brand" href="../../" aria-label="Carrot Revolt Labs home"><span class="brand-mark">CARROT<span>REVOLT LABS</span></span></a><span class="header-rule" aria-hidden="true"></span><div class="header-title"><span class="header-label">${META.label || 'GENERATIVE IMAGE / COMFYUI'}</span><strong>${META.title || 'ComfyUI Lab'}</strong></div><a class="home-link" href="../../#comfyui">${esc(U('all'))}</a></header>
  <main>
    <section class="lab-top"><div class="lab-lead"><h1>${U('headline')}</h1><p>${U('lead')}</p><p class="sim-note">${U('simNote')}</p></div></section>
    <nav class="stages" id="stages" aria-label="Stages"></nav>
    <ol class="guide" id="guide" aria-label="Steps"></ol>
    <section class="below"><div class="step-card" id="step-card"></div></section>
    <section class="cy" id="workspace" aria-label="ComfyUI-style workspace">
      <div class="cy-top"><span class="cy-logo" aria-hidden="true">C</span><nav class="cy-menu"><button type="button" data-menu="workflow">Workflow</button><button type="button" data-menu="edit">Edit</button><button type="button" data-menu="help">Help</button></nav><div class="cy-tabs"><span class="cy-tab on"><span id="wf-name">Unsaved Workflow</span><i id="wf-dirty">•</i></span><span class="cy-tab add">+</span></div><span class="cy-spacer"></span>
        <div class="cy-actionbar"><span class="cy-grip">⋮⋮</span><div class="cy-run"><button type="button" class="run" id="run" title="Run (Ctrl Enter)">${ICON.play}<span>Run</span></button><button type="button" class="run-more" title="Run options">▾</button></div><label class="cy-batch" title="Batch count"><input type="number" id="batch" min="1" max="8" value="1"></label><button type="button" class="cy-stop" id="stop" title="Interrupt (Ctrl Alt Enter)" disabled>${ICON.stop}</button><span class="cy-qcount" id="qcount" title="Queue size">0</span></div></div>
      <div class="cy-body">
        <nav class="cy-side" aria-label="Sidebar">${[['queue', 'Queue', 'Q'], ['nodes', 'Node Library', 'N'], ['models', 'Model Library', 'M'], ['workflows', 'Workflows', 'W'], ['templates', 'Templates', '']].map(([k, t, h]) => `<button type="button" data-panel="${k}" title="${t}${h ? ` (${h})` : ''}">${ICON[k]}<span>${t.split(' ')[0]}</span></button>`).join('')}<span class="cy-side-spacer"></span><button type="button" title="Settings" disabled>${ICON.gear}</button></nav>
        <aside class="cy-panel" id="panel" hidden></aside>
        <div class="cy-canvas" id="canvas" tabindex="0" aria-label="Graph canvas">
          <div class="cy-world" id="world"><div id="groups"></div><svg class="cy-links" id="links" width="10" height="10" aria-hidden="true"></svg><div id="nodes"></div></div>
          <svg class="cy-overlay" id="overlay" aria-hidden="true"></svg>
          <div class="cy-toolbox" id="toolbox" hidden><button type="button" data-tb="color" title="Color">${ICON.palette}</button><button type="button" data-tb="bypass" title="Bypass (Ctrl B)">${ICON.bypass}</button><button type="button" data-tb="info" title="Node info">${ICON.info}</button><button type="button" data-tb="delete" title="Delete">${ICON.trash}</button></div>
          <div class="cy-controls"><button type="button" data-zoom="in" title="Zoom in (Alt =)">${ICON.plus}</button><button type="button" data-zoom="out" title="Zoom out (Alt -)">${ICON.minus}</button><button type="button" data-zoom="fit" title="Fit view (.)">${ICON.fit}</button><button type="button" data-zoom="links" title="Toggle link visibility">${ICON.link}</button><span id="zoom-pct">100%</span></div>
          <canvas class="cy-minimap" id="minimap" width="180" height="120" aria-hidden="true"></canvas>
          <aside class="cy-info" id="info" hidden></aside>
          <div class="cy-log" id="log"></div>
          <div class="cy-toast" id="toast" role="status" aria-live="polite"></div>
        </div>
      </div>
    </section>
    <section class="concepts" id="concepts"></section>
    <footer><span>Carrot Revolt Labs · ${META.title || 'ComfyUI Lab'}</span><span class="foot-note">${esc(U('footer'))}</span><a href="https://docs.comfy.org/" target="_blank" rel="noopener">ComfyUI docs ↗</a></footer>
  </main>
  <div class="cy-menu-pop" id="pop" hidden></div><div class="cy-search" id="search" hidden></div><div class="cy-dialog" id="dialog" hidden></div><div class="cy-tip" id="tip" hidden></div>`;
}

/* ── Lesson UI ── */
function renderStages() { $('#stages').innerHTML = `<span class="st-label">STAGE</span>${STAGES.map((s, i) => `<button type="button" class="${i === S.stage ? 'on' : ''} ${s.steps.every((_, j) => S.done[`${s.id}:${j}`]) ? 'done' : ''}" data-stage="${i}"><b>${i + 1} ${esc(T(s.name))}</b><span>${esc(T(s.sub))}</span></button>`).join('')}`; }
function renderGuide() { $('#guide').innerHTML = stage().steps.map((s, i) => `<li><button type="button" data-step="${i}" class="${i === S.step ? 'current' : ''} ${S.done[`${stage().id}:${i}`] ? 'done' : ''}"><b>${S.done[`${stage().id}:${i}`] ? '✓' : i + 1}</b><span>${esc(T(s.title))}</span></button></li>`).join(''); }
let goalState = [];
function renderCard() {
  const st = step(), done = !!S.done[sk()], lastStep = S.step === stage().steps.length - 1, lastStage = S.stage === STAGES.length - 1;
  $('#step-card').classList.toggle('done', done);
  $('#step-card').innerHTML = `<div class="step-intro"><span class="eyebrow">${esc(U('stageStep', { a: S.stage + 1, b: S.step + 1, c: stage().steps.length }))}</span><h3>${esc(T(st.title))}</h3><p class="task"><b>${esc(U('task'))}</b> ${T(st.task)}</p><p class="concept"><b>${esc(U('whatIs'))}</b> ${T(st.concept)}</p></div>
    <div class="step-how"><span class="eyebrow">${esc(U('how'))}</span><ol>${st.how.map(h => `<li>${T(h)}</li>`).join('')}</ol><p class="cnote"><b>ComfyUI:</b> ${T(st.note)}</p></div>
    <div class="step-actions"><span class="eyebrow">${esc(U('checklist'))}</span><ul class="goals" id="goals"></ul><span class="step-state">${esc(done ? U('done') : U('notYet'))}</span>${done ? (lastStep ? (lastStage ? `<span class="next ghost">${esc(U('finished'))}</span>` : `<button type="button" class="next" data-act="next-stage">${esc(U('nextStage'))}</button>`) : `<button type="button" class="next" data-act="next">${esc(U('next'))}</button>`) : ''}<div class="act-row"><button type="button" data-act="solution">${esc(U('solution'))}</button><button type="button" data-act="reset">${esc(U('reset'))}</button></div></div>`;
  renderGoals();
}
function renderGoals() { const el = $('#goals'); if (el) el.innerHTML = step().goals.map((g, i) => `<li class="${goalState[i] ? 'ok' : ''} ${g.optional ? 'opt' : ''}"><i aria-hidden="true">${goalState[i] ? '✓' : ''}</i><span>${T(g.text)}${g.optional ? ` <em>(${esc(U('optional'))})</em>` : ''}</span></li>`).join(''); }
function checkGoals() {
  const ctx = { flags: S.flags, history: S.history };
  goalState = step().goals.map(g => { try { return !!g.test(S.graph, ctx); } catch { return false; } });
  const ok = step().goals.every((g, i) => g.optional || goalState[i]);
  if (ok !== !!S.done[sk()]) { S.done[sk()] = ok; save(); renderStages(); renderGuide(); renderCard(); } else renderGoals();
}
function renderConcepts() {
  $('#concepts').innerHTML = `<div class="c-col"><h2>${esc(U('typesTitle'))}</h2><ul class="c-types">${Object.entries(TYPE_COLOR).map(([t, c]) => `<li><i style="background:${c}"></i><b>${t}</b><span>${esc(T(UI['type_' + t]))}</span></li>`).join('')}</ul></div><div class="c-col"><h2>${esc(U('keysTitle'))}</h2><table class="c-keys">${KEYS.map(([k, t]) => `<tr><td>${k.split(' · ').map(x => `<kbd>${esc(x)}</kbd>`).join(' ')}</td><td>${esc(T(t))}</td></tr>`).join('')}</table></div><div class="c-col"><h2>${esc(U('loraVsCn'))}</h2>${T(UI.loraVsCnBody)}</div>`;
}

/* ── Canvas rendering ── */
const widgetDefs = n => (NODES[n.type].widgets || []);
const prec = w => w.kind === 'int' ? 0 : w.step >= 1 ? 0 : w.step >= .1 ? 1 : w.step >= .01 ? 2 : 3;
const fmtW = (w, v) => w.kind === 'int' || w.kind === 'float' ? (w.kind === 'int' ? String(Math.round(v)) : Number(v).toFixed(prec(w))) : String(v);
function widgetHtml(n, w) {
  const v = n.widgets[w.name], id = `${esc(n.id)}|${esc(w.name)}`;
  if (w.kind === 'text') return `<textarea class="w-text" data-w="${id}" spellcheck="false" placeholder="${esc(w.name)}">${esc(v)}</textarea>`;
  if (w.kind === 'button') return `<button type="button" class="w-btn" data-wbtn="${id}">${esc(w.value)}</button>`;
  const arrows = w.kind !== 'string';
  return `<div class="w" data-w="${id}" data-kind="${w.kind}">${arrows ? '<i class="wa l" data-dir="-1">◀</i>' : ''}<span class="wl">${esc(w.name)}</span><span class="wv">${esc(fmtW(w, v))}</span>${arrows ? '<i class="wa r" data-dir="1">▶</i>' : ''}</div>`;
}
function nodeHtml(n) {
  const def = NODES[n.type], ins = def.inputs || [], outs = def.outputs || [], rows = Math.max(ins.length, outs.length);
  const linked = name => S.graph.links.some(l => l.to === n.id && l.input === name), used = i => S.graph.links.some(l => l.from === n.id && l.out === i);
  const col = n.color && COLORS[n.color];
  const style = `left:${n.x}px;top:${n.y}px;width:${def.w}px;${col ? `--title:${col[0]};--body:${col[1]};` : ''}`;
  let slots = '';
  for (let i = 0; i < rows; i++) {
    const a = ins[i], b = outs[i];
    slots += `<div class="slot-row">${a ? `<span class="slot in${a.optional ? ' opt' : ''}"><i class="dot${linked(a.name) ? ' on' : ''}" style="--c:${TYPE_COLOR[a.type]}" data-slot="${esc(n.id)}|in|${esc(a.name)}"></i>${esc(a.name)}</span>` : '<span></span>'}${b ? `<span class="slot out">${esc(b.name)}<i class="dot${used(i) ? ' on' : ''}" style="--c:${TYPE_COLOR[b.type]}" data-slot="${esc(n.id)}|out|${i}"></i></span>` : ''}</div>`;
  }
  const img = def.preview ? `<div class="n-img" data-img="${esc(n.id)}">${n.type === 'LoadImage' ? '' : '<span>—</span>'}</div>` : '';
  if (n.collapsed) return `<article class="cn collapsed${S.sel.has(n.id) ? ' sel' : ''}${n.mode === 4 ? ' bypass' : ''}${n.mode === 2 ? ' mute' : ''}" data-node="${esc(n.id)}" style="${style};width:auto"><header class="cn-title"><i class="cn-dot" data-collapse></i><span>${esc(n.title || def.title)}</span></header></article>`;
  return `<article class="cn${S.sel.has(n.id) ? ' sel' : ''}${n.mode === 4 ? ' bypass' : ''}${n.mode === 2 ? ' mute' : ''}" data-node="${esc(n.id)}" style="${style}"><header class="cn-title"><i class="cn-dot" data-collapse title="Collapse (Alt C)"></i><span class="cn-name">${esc(n.title || def.title)}</span>${def.custom ? `<span class="cn-src" title="Custom node pack: ${esc(def.custom)}">🦊 ${esc(def.custom)}</span>` : ''}<span class="cn-badge" hidden></span></header><div class="cn-prog"><i></i></div><div class="cn-body">${slots}<div class="cn-widgets">${widgetDefs(n).map(w => widgetHtml(n, w)).join('')}</div>${img}</div></article>`;
}
function renderGroups() { $('#groups').innerHTML = (S.graph.groups || []).map((g, i) => `<div class="cg" data-group="${i}" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;--g:${g.color}"><div class="cg-title" data-gtitle="${i}">${esc(g.title)}</div></div>`).join(''); }
function renderGraph() { $('#nodes').innerHTML = S.graph.nodes.map(nodeHtml).join(''); renderGroups(); paintImages(); requestAnimationFrame(() => { drawLinks(); toolbox(); minimap(); }); }
function paintImages() {
  for (const el of $$('[data-img]')) {
    const n = nodeById(el.dataset.img); if (!n) continue;
    let url = S.images[n.id];
    if (n.type === 'LoadImage') { url = imageUrl({ kind: 'photo', name: n.widgets.image, w: 512, h: 512 }, 220); if (n.widgets.mask?.length || n.widgets.mask_invert) url = maskedUrl(n); el.title = 'Click: Open in MaskEditor'; el.classList.add('can-mask'); }
    el.innerHTML = url ? `<img src="${url}" alt="">` : '<span>—</span>';
  }
}
const urlCache = new Map();
function imageUrl(v, max = 256) { const k = JSON.stringify(v).slice(0, 3000) + max; if (urlCache.has(k)) return urlCache.get(k); const cv = renderValue(v); const out = toUrl(cv, max); urlCache.set(k, out); return out; }
function toUrl(cv, max = 256, type = 'image/png') { const c = document.createElement('canvas'), s = Math.min(1, max / Math.max(cv.width, cv.height)); c.width = Math.round(cv.width * s); c.height = Math.round(cv.height * s); c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height); return c.toDataURL(type, .8); }
// The preview of Load Image shows the painted mask, darkened, as the Mask Editor does.
const maskCache = new Map();
function maskedUrl(n) {
  const k = n.widgets.image + JSON.stringify(n.widgets.mask) + n.widgets.mask_invert; if (maskCache.has(k)) return maskCache.get(k);
  const c = document.createElement('canvas'); c.width = 220; c.height = 220; const x = c.getContext('2d');
  x.drawImage(renderValue({ kind: 'photo', name: n.widgets.image, w: 512, h: 512 }), 0, 0, 220, 220);
  const m = paintStrokes(n.widgets.mask, 220, 220, n.widgets.mask_invert); x.globalAlpha = .62; x.drawImage(m, 0, 0); x.globalAlpha = 1;
  const out = c.toDataURL(); maskCache.set(k, out); return out;
}
function paintStrokes(strokes = [], W, H, invert = false, color = '#000') {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = color; x.strokeStyle = color; x.lineCap = 'round'; x.lineJoin = 'round';
  if (invert) { x.fillRect(0, 0, W, H); }
  for (const s of strokes) { x.globalCompositeOperation = (s.e ? !invert : invert) ? 'destination-out' : 'source-over'; x.lineWidth = s.r * 2 * W; x.beginPath(); s.p.forEach(([px, py], i) => i ? x.lineTo(px * W, py * H) : x.moveTo(px * W, py * H)); if (s.p.length === 1) x.lineTo(s.p[0][0] * W + .01, s.p[0][1] * H); x.stroke(); }
  return c;
}
/* ── Mask Editor (Load Image › Open in MaskEditor) ── */
function openMaskEditor(id) {
  const n = nodeById(id); if (!n) return;
  let strokes = clone(n.widgets.mask || []), invert = !!n.widgets.mask_invert, erase = false, size = .05, cur = null;
  const d = $('#dialog'); d.hidden = false;
  d.innerHTML = `<div class="dlg mask-ed"><header><b>Mask Editor</b><button type="button" data-close>×</button></header><div class="me-body"><div class="me-tools"><button type="button" data-me="brush" class="on">Brush</button><button type="button" data-me="erase">Eraser</button><label>Thickness <input type="range" id="me-size" min="1" max="20" value="5"></label><button type="button" data-me="invert">Invert</button><button type="button" data-me="clear">Clear</button></div><div class="me-canvas"><img id="me-img" alt=""><canvas id="me-c" width="512" height="512"></canvas></div><p class="dlg-hint">${esc(U('maskHint'))}</p></div><footer><button type="button" data-close>Cancel</button><button type="button" class="primary" data-me="save">Save</button></footer></div>`;
  $('#me-img').src = imageUrl({ kind: 'photo', name: n.widgets.image, w: 512, h: 512 }, 512);
  const cv = $('#me-c'), ctx = cv.getContext('2d');
  const draw = () => { ctx.clearRect(0, 0, 512, 512); ctx.globalAlpha = .7; ctx.drawImage(paintStrokes(strokes, 512, 512, invert), 0, 0); ctx.globalAlpha = 1; };
  draw();
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  cv.onpointerdown = e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { p: [pos(e)], r: size, ...(erase || e.button === 2 ? { e: 1 } : {}) }; strokes.push(cur); draw(); };
  cv.onpointermove = e => { if (!cur) return; cur.p.push(pos(e).map(v => Math.round(v * 1000) / 1000)); draw(); };
  cv.onpointerup = () => { cur = null; };
  cv.oncontextmenu = e => e.preventDefault();
  $('#me-size').oninput = e => { size = Number(e.target.value) / 100; };
  d.onclick = e => {
    const a = e.target.closest('[data-me]')?.dataset.me;
    if (a === 'brush' || a === 'erase') { erase = a === 'erase'; $$('[data-me="brush"],[data-me="erase"]', d).forEach(b => b.classList.toggle('on', b.dataset.me === a)); }
    if (a === 'clear') { strokes = []; invert = false; draw(); }
    if (a === 'invert') { invert = !invert; draw(); }
    if (a === 'save') { snapshot(); n.widgets.mask = strokes.filter(s => s.p.length); n.widgets.mask_invert = invert; closeDialog(); flag('maskPainted'); changed(); }
    if (e.target.closest('[data-close]')) closeDialog();
  };
}
function worldRect() { return $('#world').getBoundingClientRect(); }
function slotPos(id, dir, key) {
  const el = $(`[data-slot="${CSS.escape(`${id}|${dir}|${key}`)}"]`);
  if (!el) { const n = $(`.cn[data-node="${CSS.escape(id)}"]`); if (!n) return null; const r = n.getBoundingClientRect(), w = worldRect(); return { x: ((dir === 'in' ? r.left : r.right) - w.left) / S.zoom, y: (r.top + 15 * S.zoom - w.top) / S.zoom }; }
  const r = el.getBoundingClientRect(), w = worldRect(); return { x: (r.left + r.width / 2 - w.left) / S.zoom, y: (r.top + r.height / 2 - w.top) / S.zoom };
}
const spline = (a, b) => { const d = Math.max(30, Math.abs(b.x - a.x) * .5); return `M${a.x},${a.y} C${a.x + d},${a.y} ${b.x - d},${b.y} ${b.x},${b.y}`; };
let dragLink = null;
function drawLinks() {
  let html = '';
  if (!S.hideLinks) for (const [i, l] of S.graph.links.entries()) {
    const a = slotPos(l.from, 'out', l.out), b = slotPos(l.to, 'in', l.input); if (!a || !b) continue;
    const type = NODES[nodeById(l.from).type].outputs[l.out].type, col = TYPE_COLOR[type], dim = nodeById(l.from).mode === 2 || nodeById(l.to).mode === 2;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    html += `<path class="lk-back" d="${spline(a, b)}"/><path class="lk${dim ? ' dim' : ''}" d="${spline(a, b)}" stroke="${col}"/><circle class="lk-mid" cx="${mid.x}" cy="${mid.y}" r="5" fill="${col}" data-link="${i}"/>`;
  }
  if (dragLink?.to) { const a = dragLink.dir === 'out' ? slotPos(dragLink.id, 'out', dragLink.key) : dragLink.to, b = dragLink.dir === 'out' ? dragLink.to : slotPos(dragLink.id, 'in', dragLink.key); if (a && b) html += `<path class="lk drag" d="${spline(a, b)}" stroke="${TYPE_COLOR[dragLink.type] || '#9a9'}"/>`; }
  $('#links').innerHTML = html;
}
function applyView() { $('#world').style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.zoom})`; $('#zoom-pct').textContent = `${Math.round(S.zoom * 100)}%`; drawLinks(); toolbox(); minimap(); }
function bounds(ids) {
  const els = $$('.cn').filter(e => !ids || ids.includes(e.dataset.node)); if (!els.length) return null;
  const x0 = Math.min(...els.map(e => e.offsetLeft)), y0 = Math.min(...els.map(e => e.offsetTop)), x1 = Math.max(...els.map(e => e.offsetLeft + e.offsetWidth)), y1 = Math.max(...els.map(e => e.offsetTop + e.offsetHeight));
  return { x0, y0, x1, y1 };
}
function fitView(ids) {
  const b = bounds(ids), c = $('#canvas'); if (!b || !c.clientWidth) return;
  S.zoom = Math.max(.15, Math.min(1.2, (c.clientWidth - 80) / (b.x1 - b.x0), (c.clientHeight - 80) / (b.y1 - b.y0)));
  S.panX = (c.clientWidth - (b.x1 - b.x0) * S.zoom) / 2 - b.x0 * S.zoom; S.panY = (c.clientHeight - (b.y1 - b.y0) * S.zoom) / 2 - b.y0 * S.zoom; applyView();
}
function minimap() {
  const cv = $('#minimap'), b = bounds(); if (!cv || !b) return; const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(20,20,20,.85)'; c.fillRect(0, 0, W, H);
  const view = $('#canvas'), vx0 = -S.panX / S.zoom, vy0 = -S.panY / S.zoom, vx1 = vx0 + view.clientWidth / S.zoom, vy1 = vy0 + view.clientHeight / S.zoom;
  const X0 = Math.min(b.x0, vx0), Y0 = Math.min(b.y0, vy0), X1 = Math.max(b.x1, vx1), Y1 = Math.max(b.y1, vy1), s = Math.min((W - 10) / (X1 - X0), (H - 10) / (Y1 - Y0));
  for (const el of $$('.cn')) { c.fillStyle = el.classList.contains('sel') ? '#ddd' : '#6a6a6a'; c.fillRect(5 + (el.offsetLeft - X0) * s, 5 + (el.offsetTop - Y0) * s, Math.max(2, el.offsetWidth * s), Math.max(2, el.offsetHeight * s)); }
  c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(5 + (vx0 - X0) * s, 5 + (vy0 - Y0) * s, (vx1 - vx0) * s, (vy1 - vy0) * s);
}
function toolbox() {
  const tb = $('#toolbox'); if (!tb) return; const ids = [...S.sel]; if (!ids.length || S.running && false) { tb.hidden = true; return; }
  const b = bounds(ids); if (!b) { tb.hidden = true; return; }
  tb.hidden = false; const x = S.panX + ((b.x0 + b.x1) / 2) * S.zoom, y = S.panY + b.y0 * S.zoom - 44; tb.style.left = `${x}px`; tb.style.top = `${Math.max(4, y)}px`;
}
const toast = (msg, kind = '') => { const t = $('#toast'); t.innerHTML = msg; t.className = `cy-toast show ${kind}`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'cy-toast'; }, 3600); };
const log = (msg, kind = '') => { const el = $('#log'); el.insertAdjacentHTML('beforeend', `<p class="${kind}">${msg}</p>`); while (el.children.length > 6) el.firstChild.remove(); el.classList.add('show'); clearTimeout(log.t); log.t = setTimeout(() => el.classList.remove('show'), 9000); };

/* ── Editing ── */
function snapshot() { S.undo.push(clone(S.graph)); if (S.undo.length > 60) S.undo.shift(); S.redo.length = 0; $('#wf-dirty').hidden = false; }
function restore(from, to) { if (!from.length) return; to.push(clone(S.graph)); S.graph = from.pop(); S.sel.clear(); changed(); }
function changed(structure = true) { save(); if (structure) renderGraph(); else { drawLinks(); minimap(); } checkGoals(); }
let uid = Date.now() % 100000;
function addNode(type, x, y, values) { const n = makeNode(type, Math.round(x), Math.round(y), values, `${type}-${uid++}`); S.graph.nodes.push(n); S.sel = new Set([n.id]); return n; }
function removeNodes(ids) { if (!ids.length) return; snapshot(); S.graph.nodes = S.graph.nodes.filter(n => !ids.includes(n.id)); S.graph.links = S.graph.links.filter(l => !ids.includes(l.from) && !ids.includes(l.to)); S.sel.clear(); changed(); }
function setMode(mode) { const ids = [...S.sel]; if (!ids.length) return; snapshot(); const all = ids.every(id => nodeById(id).mode === mode); ids.forEach(id => { nodeById(id).mode = all ? 0 : mode; }); changed(); toast(mode === 4 ? U(all ? 'unbypassed' : 'bypassed') : U(all ? 'unmuted' : 'muted')); }
function copy() { const ids = [...S.sel]; if (!ids.length) return; S.clip = { nodes: clone(S.graph.nodes.filter(n => ids.includes(n.id))), links: clone(S.graph.links.filter(l => ids.includes(l.to))) }; toast(U('copied', { n: ids.length })); }
function paste(withLinks) {
  if (!S.clip) return; snapshot(); const map = {}, at = mouse, x0 = Math.min(...S.clip.nodes.map(n => n.x)), y0 = Math.min(...S.clip.nodes.map(n => n.y));
  for (const n of S.clip.nodes) { const id = `${n.type}-${uid++}`; map[n.id] = id; S.graph.nodes.push({ ...clone(n), id, x: Math.round(at.x + n.x - x0), y: Math.round(at.y + n.y - y0) }); }
  for (const l of S.clip.links) { if (map[l.from]) S.graph.links.push(makeLink(map[l.from], l.out, map[l.to], l.input)); else if (withLinks && nodeById(l.from)) S.graph.links.push(makeLink(l.from, l.out, map[l.to], l.input)); }
  S.sel = new Set(Object.values(map)); changed();
}
function group() {
  const ids = [...S.sel]; if (!ids.length) return; const b = bounds(ids); snapshot();
  S.graph.groups.push({ title: 'Group', x: b.x0 - 14, y: b.y0 - 46, w: b.x1 - b.x0 + 28, h: b.y1 - b.y0 + 60, color: '#3f789e' }); changed(); toast(U('grouped'));
}

/* ── Interaction ── */
let mouse = { x: 0, y: 0, cx: 0, cy: 0 }, drag = null, space = false;
const toWorld = (cx, cy) => { const r = worldRect(); return { x: (cx - r.left) / S.zoom, y: (cy - r.top) / S.zoom }; };
function setupCanvas() {
  const cv = $('#canvas');
  cv.addEventListener('contextmenu', e => { e.preventDefault(); const nodeEl = e.target.closest('.cn'); if (nodeEl) { if (!S.sel.has(nodeEl.dataset.node)) { S.sel = new Set([nodeEl.dataset.node]); renderGraph(); } nodeMenu(e.clientX, e.clientY, nodeEl.dataset.node); } else canvasMenu(e.clientX, e.clientY); });
  cv.addEventListener('pointerdown', e => {
    hideTip(); closePop(); cv.focus({ preventScroll: true });
    mouse = { ...toWorld(e.clientX, e.clientY), cx: e.clientX, cy: e.clientY };
    if (e.target.closest('.cy-controls, .cy-minimap, .cy-toolbox, .cy-info, .cy-log')) return;
    if (e.button === 1 || (e.button === 0 && space)) { e.preventDefault(); drag = { kind: 'pan', x: e.clientX, y: e.clientY, px: S.panX, py: S.panY }; return; }
    if (e.button !== 0) return;
    if (e.target.closest('textarea, .w-btn')) return;
    const w = e.target.closest('.w');
    if (w) { e.preventDefault(); widgetDown(e, w); return; }
    const dot = e.target.closest('[data-slot]');
    if (dot) {
      e.preventDefault(); const [id, dir, key] = dot.dataset.slot.split('|');
      if (dir === 'in') { const l = S.graph.links.find(x => x.to === id && x.input === key); if (l) { snapshot(); S.graph.links = S.graph.links.filter(x => x !== l); dragLink = { id: l.from, dir: 'out', key: l.out, type: NODES[nodeById(l.from).type].outputs[l.out].type, to: toWorld(e.clientX, e.clientY), picked: true }; renderGraph(); return; } dragLink = { id, dir, key, type: NODES[nodeById(id).type].inputs.find(i => i.name === key).type, to: toWorld(e.clientX, e.clientY) }; }
      else dragLink = { id, dir, key: Number(key), type: NODES[nodeById(id).type].outputs[key].type, to: toWorld(e.clientX, e.clientY) };
      highlight(); return;
    }
    const mid = e.target.closest('[data-link]');
    if (mid) { linkMenu(e.clientX, e.clientY, Number(mid.dataset.link)); return; }
    const gt = e.target.closest('[data-gtitle]');
    if (gt) { e.preventDefault(); const gi = Number(gt.dataset.gtitle), g = S.graph.groups[gi]; const inside = S.graph.nodes.filter(n => n.x >= g.x && n.y >= g.y && n.x < g.x + g.w && n.y < g.y + g.h); drag = { kind: 'group', moved: false, gi, x: e.clientX, y: e.clientY, gx: g.x, gy: g.y, nodes: inside.map(n => ({ n, x: n.x, y: n.y })) }; return; }
    const canMask = e.target.closest('.n-img.can-mask');
    if (canMask && !e.ctrlKey && !e.shiftKey) { openMaskEditor(canMask.dataset.img); return; }
    const nodeEl = e.target.closest('.cn');
    if (nodeEl) {
      e.preventDefault(); const id = nodeEl.dataset.node;
      if (e.target.closest('[data-collapse]')) { snapshot(); nodeById(id).collapsed = !nodeById(id).collapsed; changed(); return; }
      if (e.ctrlKey || e.shiftKey) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); }
      else if (!S.sel.has(id)) S.sel = new Set([id]);
      $$('.cn').forEach(el => el.classList.toggle('sel', S.sel.has(el.dataset.node))); toolbox(); minimap(); if (S.info) showInfo(id);
      let ids = [...S.sel];
      if (e.altKey) { snapshot(); const map = {}; for (const sid of ids) { const n = nodeById(sid), nid = `${n.type}-${uid++}`; map[sid] = nid; S.graph.nodes.push({ ...clone(n), id: nid }); } ids = Object.values(map); S.sel = new Set(ids); renderGraph(); }
      drag = { kind: 'node', x: e.clientX, y: e.clientY, moved: false, start: ids.map(i => ({ id: i, x: nodeById(i).x, y: nodeById(i).y })) };
      return;
    }
    if (e.ctrlKey || e.shiftKey) { drag = { kind: 'box', x: e.clientX, y: e.clientY, add: e.shiftKey }; return; }
    S.sel.clear(); $$('.cn.sel').forEach(el => el.classList.remove('sel')); toolbox(); minimap();
    drag = { kind: 'pan', x: e.clientX, y: e.clientY, px: S.panX, py: S.panY, click: true };
  });
  window.addEventListener('pointermove', e => {
    mouse = { ...toWorld(e.clientX, e.clientY), cx: e.clientX, cy: e.clientY };
    if (dragLink) { dragLink.to = mouse; drawLinks(); return; }
    if (!drag) return;
    if (drag.kind === 'pan') { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) { drag.click = false; S.panX = drag.px + e.clientX - drag.x; S.panY = drag.py + e.clientY - drag.y; applyView(); flag('panned'); $('#canvas').classList.add('panning'); } }
    if (drag.kind === 'node') { const dx = (e.clientX - drag.x) / S.zoom, dy = (e.clientY - drag.y) / S.zoom; if (!drag.moved && Math.hypot(dx, dy) > 3) { drag.moved = true; snapshot(); } if (drag.moved) for (const s of drag.start) { const n = nodeById(s.id); n.x = Math.round(s.x + dx); n.y = Math.round(s.y + dy); const el = $(`.cn[data-node="${CSS.escape(s.id)}"]`); if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px`; } } drawLinks(); toolbox(); }
    if (drag.kind === 'group') { const dx = (e.clientX - drag.x) / S.zoom, dy = (e.clientY - drag.y) / S.zoom, g = S.graph.groups[drag.gi]; if (!drag.moved) { if (Math.hypot(dx, dy) < 3) return; drag.moved = true; snapshot(); } g.x = Math.round(drag.gx + dx); g.y = Math.round(drag.gy + dy); for (const s of drag.nodes) { s.n.x = Math.round(s.x + dx); s.n.y = Math.round(s.y + dy); const el = $(`.cn[data-node="${CSS.escape(s.n.id)}"]`); if (el) { el.style.left = `${s.n.x}px`; el.style.top = `${s.n.y}px`; } } renderGroups(); drawLinks(); }
    if (drag.kind === 'box') { const r = $('#canvas').getBoundingClientRect(); $('#overlay').innerHTML = `<rect x="${Math.min(drag.x, e.clientX) - r.left}" y="${Math.min(drag.y, e.clientY) - r.top}" width="${Math.abs(e.clientX - drag.x)}" height="${Math.abs(e.clientY - drag.y)}"/>`; }
  });
  window.addEventListener('pointerup', e => {
    $('#canvas')?.classList.remove('panning');
    if (dragLink) { const d = dragLink; dragLink = null; clearHighlight(); finishLink(d, e); return; }
    if (!drag) return; const d = drag; drag = null; $('#overlay').innerHTML = '';
    if (d.kind === 'node' || d.kind === 'group') { if (d.moved) { changed(false); renderGroups(); } minimap(); return; }
    if (d.kind === 'box') { const x0 = Math.min(d.x, e.clientX), x1 = Math.max(d.x, e.clientX), y0 = Math.min(d.y, e.clientY), y1 = Math.max(d.y, e.clientY); if (!d.add) S.sel.clear(); for (const el of $$('.cn')) { const r = el.getBoundingClientRect(); if (r.right > x0 && r.left < x1 && r.bottom > y0 && r.top < y1) S.sel.add(el.dataset.node); } $$('.cn').forEach(el => el.classList.toggle('sel', S.sel.has(el.dataset.node))); toolbox(); minimap(); }
  });
  cv.addEventListener('dblclick', e => {
    const gt = e.target.closest('[data-gtitle]'); if (gt) { const g = S.graph.groups[gt.dataset.gtitle]; const name = prompt('Group title', g.title); if (name) { snapshot(); g.title = name; changed(); } return; }
    const title = e.target.closest('.cn-name'); if (title) { const n = nodeById(title.closest('.cn').dataset.node); const name = prompt('Title', n.title || NODES[n.type].title); if (name != null) { snapshot(); n.title = name.trim() || null; changed(); } return; }
    if (e.target.closest('.cn, .cy-controls, .cy-minimap, .cy-toolbox, .cy-info')) return;
    openSearch(e.clientX, e.clientY, {});
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, old = S.zoom; S.zoom = Math.max(.1, Math.min(4, S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); S.panX = x - (x - S.panX) * S.zoom / old; S.panY = y - (y - S.panY) * S.zoom / old; applyView(); flag('zoomed'); }, { passive: false });
  cv.addEventListener('input', e => { const t = e.target.closest('textarea[data-w]'); if (t) { const [id, k] = t.dataset.w.split('|'); nodeById(id).widgets[k] = t.value; $('#wf-dirty').hidden = false; save(); } });
  cv.addEventListener('change', e => { if (e.target.closest('textarea[data-w]')) { checkGoals(); } });
  cv.addEventListener('keydown', e => { const t = e.target.closest('textarea[data-w]'); if (t && e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); weightSelection(t, e.key === 'ArrowUp' ? .05 : -.05); } });
  cv.addEventListener('click', e => { const b = e.target.closest('[data-wbtn]'); if (b) toast(U('uploadNote')); });
  cv.addEventListener('pointerover', e => { const dot = e.target.closest('[data-slot]'); if (dot && !dragLink) { const [id, dir, key] = dot.dataset.slot.split('|'); const n = nodeById(id), s = dir === 'in' ? NODES[n.type].inputs.find(i => i.name === key) : NODES[n.type].outputs[key]; tipSoon(e, `<b style="color:${TYPE_COLOR[s.type]}">${s.type}</b><br>${esc(T(UI['type_' + s.type]))}${s.optional ? `<br><i>${esc(U('optionalInput'))}</i>` : ''}`); } });
  cv.addEventListener('pointerout', e => { if (e.target.closest('[data-slot]')) hideTip(); });
  $('.cy-controls').addEventListener('click', e => { const z = e.target.closest('[data-zoom]')?.dataset.zoom; if (z === 'in') zoomBy(1.2); if (z === 'out') zoomBy(1 / 1.2); if (z === 'fit') { fitView(); flag('fitted'); } if (z === 'links') { S.hideLinks = !S.hideLinks; drawLinks(); } });
  $('#minimap').addEventListener('pointerdown', e => { const r = e.target.getBoundingClientRect(), b = bounds(); if (!b) return; const view = $('#canvas'), s = Math.min(170 / (b.x1 - b.x0 + view.clientWidth / S.zoom), 110 / (b.y1 - b.y0 + view.clientHeight / S.zoom)); const wx = b.x0 + (e.clientX - r.left - 5) / s, wy = b.y0 + (e.clientY - r.top - 5) / s; S.panX = view.clientWidth / 2 - wx * S.zoom; S.panY = view.clientHeight / 2 - wy * S.zoom; applyView(); });
  $('#toolbox').addEventListener('click', e => { const a = e.target.closest('[data-tb]')?.dataset.tb; if (a === 'bypass') setMode(4); if (a === 'delete') removeNodes([...S.sel]); if (a === 'info') showInfo([...S.sel][0], true); if (a === 'color') colorMenu(e.clientX, e.clientY); });
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', e => { if (e.code === 'Space') { space = false; $('#canvas')?.classList.remove('space'); } });
  new ResizeObserver(() => { drawLinks(); minimap(); }).observe(cv);
}
const zoomBy = k => { const c = $('#canvas'), x = c.clientWidth / 2, y = c.clientHeight / 2, old = S.zoom; S.zoom = Math.max(.1, Math.min(4, S.zoom * k)); S.panX = x - (x - S.panX) * S.zoom / old; S.panY = y - (y - S.panY) * S.zoom / old; applyView(); flag('zoomed'); };
function highlight() { for (const el of $$('[data-slot]')) { const [id, dir, key] = el.dataset.slot.split('|'); let ok = false; if (dragLink.dir === 'out' && dir === 'in') ok = canConnect(S.graph, makeLink(dragLink.id, dragLink.key, id, key)); if (dragLink.dir === 'in' && dir === 'out') ok = canConnect(S.graph, makeLink(id, Number(key), dragLink.id, dragLink.key)); el.classList.toggle('ok', ok); el.closest('.slot')?.classList.toggle('ok', ok); } }
const clearHighlight = () => $$('.ok').forEach(el => el.classList.remove('ok'));
function finishLink(d, e) {
  const el = document.elementFromPoint(e.clientX, e.clientY), dot = el?.closest('[data-slot]'), nodeEl = el?.closest('.cn');
  let target = null;
  if (dot) { const [id, dir, key] = dot.dataset.slot.split('|'); target = { id, dir, key: dir === 'out' ? Number(key) : key }; }
  else if (nodeEl && nodeEl.dataset.node !== d.id) { // Dropped on a node: the first free compatible socket, as in ComfyUI.
    const n = nodeById(nodeEl.dataset.node), def = NODES[n.type];
    if (d.dir === 'out') { const inp = (def.inputs || []).find(i => i.type === d.type && !S.graph.links.some(l => l.to === n.id && l.input === i.name)) || (def.inputs || []).find(i => i.type === d.type); if (inp) target = { id: n.id, dir: 'in', key: inp.name }; }
    else { const k = (def.outputs || []).findIndex(o => o.type === d.type); if (k >= 0) target = { id: n.id, dir: 'out', key: k }; }
  }
  if (target) {
    const link = d.dir === 'out' ? makeLink(d.id, d.key, target.id, target.key) : makeLink(target.id, target.key, d.id, d.key);
    if ((d.dir === 'out' && target.dir === 'in') || (d.dir === 'in' && target.dir === 'out')) { if (!d.picked) snapshot(); if (!connect(S.graph, link)) toast(U('badType', { a: d.type }), 'bad'); changed(); return; }
  }
  if (d.picked) { changed(); return; }
  if (!el?.closest('.cn')) openSearch(e.clientX, e.clientY, { from: d });
  else drawLinks();
}
function onKey(e) {
  const tag = document.activeElement?.tagName, typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
  if (!$('#search').hidden || !$('#dialog').hidden) { if (e.key === 'Escape') { closeSearch(); closeDialog(); } return; }
  const over = $('#workspace')?.matches(':hover') || $('#workspace')?.contains(document.activeElement);
  if (!over) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'Enter') { e.preventDefault(); if (e.altKey) interrupt(); else { S.flags.runHotkey = true; queue(); } return; }
  if (typing) return;
  if (e.code === 'Space') { space = true; $('#canvas').classList.add('space'); e.preventDefault(); return; }
  if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? restore(S.redo, S.undo) : restore(S.undo, S.redo); return; }
  if (ctrl && k === 'y') { e.preventDefault(); restore(S.redo, S.undo); return; }
  if (ctrl && k === 's') { e.preventDefault(); saveWorkflow(); return; }
  if (ctrl && k === 'o') { e.preventDefault(); openPanel('workflows'); return; }
  if (ctrl && k === 'a') { e.preventDefault(); S.sel = new Set(S.graph.nodes.map(n => n.id)); renderGraph(); return; }
  if (ctrl && k === 'c') { copy(); return; }
  if (ctrl && k === 'v') { e.preventDefault(); paste(e.shiftKey); return; }
  if (ctrl && k === 'm') { e.preventDefault(); setMode(2); return; }
  if (ctrl && k === 'b') { e.preventDefault(); setMode(4); return; }
  if (ctrl && k === 'g') { e.preventDefault(); group(); return; }
  if (ctrl && k === 'd') { e.preventDefault(); snapshot(); S.graph = defaultGraph(); changed(); fitView(); toast(U('loadedDefault')); return; }
  if (ctrl) return;
  if (e.altKey && k === 'c') { e.preventDefault(); snapshot(); [...S.sel].forEach(id => { nodeById(id).collapsed = !nodeById(id).collapsed; }); changed(); return; }
  if (e.altKey && (e.key === '=' || e.key === '+')) { zoomBy(1.1); return; }
  if (e.altKey && e.key === '-') { zoomBy(1 / 1.1); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeNodes([...S.sel]); return; }
  if (e.key === '.') { fitView(S.sel.size ? [...S.sel] : null); flag('fitted'); return; }
  if (k === 'q') openPanel('queue'); if (k === 'n') openPanel('nodes'); if (k === 'm') openPanel('models'); if (k === 'w') openPanel('workflows');
  if (e.key === 'Escape') { S.sel.clear(); renderGraph(); }
}
// Ctrl ↑/↓ on a selection in a prompt: (word:1.05), like ComfyUI.
function weightSelection(t, d) {
  let { selectionStart: a, selectionEnd: b, value: v } = t; if (a === b) { while (a > 0 && /[\w-]/.test(v[a - 1])) a--; while (b < v.length && /[\w-]/.test(v[b])) b++; if (a === b) return; }
  let sel = v.slice(a, b), w = 1; const m = sel.match(/^\((.*):([\d.]+)\)$/), around = v.slice(0, a).match(/\($/) && v.slice(b).match(/^:([\d.]+)\)/);
  if (m) { sel = m[1]; w = Number(m[2]); } else if (around) { a -= 1; b += around[0].length; w = Number(around[1]); }
  w = Math.round((w + d) * 100) / 100; const out = w === 1 ? sel : `(${sel}:${w})`;
  t.value = v.slice(0, a) + out + v.slice(b); t.selectionStart = a; t.selectionEnd = a + out.length; t.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ── Widgets: arrows step, drag changes, click edits; combos open a list ── */
function widgetDown(e, el) {
  const [id, name] = el.dataset.w.split('|'), n = nodeById(id), w = widgetDefs(n).find(x => x.name === name), arrow = e.target.closest('.wa');
  if (w.kind === 'combo') {
    if (arrow) { snapshot(); const i = w.options.indexOf(n.widgets[name]); n.widgets[name] = w.options[(i + Number(arrow.dataset.dir) + w.options.length) % w.options.length]; afterWidget(n, name); return; }
    comboMenu(e.clientX, e.clientY, n, w); return;
  }
  if (w.kind === 'string') { const v = prompt(name, n.widgets[name]); if (v != null) { snapshot(); n.widgets[name] = v; afterWidget(n, name); } return; }
  const step = w.kind === 'int' ? (name === 'seed' ? 1 : w.step) : w.step;
  if (arrow) { snapshot(); n.widgets[name] = clampW(w, Number(n.widgets[name]) + Number(arrow.dataset.dir) * step); afterWidget(n, name); return; }
  const x0 = e.clientX, start = Number(n.widgets[name]); let moved = false;
  const move = ev => { const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 4) return; if (!moved) { moved = true; snapshot(); } n.widgets[name] = clampW(w, start + Math.round(dx / 6) * step); $('.wv', el).textContent = fmtW(w, n.widgets[name]); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) afterWidget(n, name); else editNumber(el, n, w); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
const clampW = (w, v) => { v = Math.max(w.min ?? -Infinity, Math.min(w.max ?? Infinity, v)); return w.kind === 'int' ? Math.round(v) : Math.round(v / w.step) * w.step; };
function editNumber(el, n, w) {
  const inp = document.createElement('input'); inp.className = 'w-edit'; inp.value = n.widgets[w.name]; el.append(inp); inp.focus(); inp.select();
  let done = false; const fin = ok => { if (done) return; done = true; if (ok && Number.isFinite(Number(inp.value.replace(',', '.')))) { snapshot(); n.widgets[w.name] = clampW(w, Number(inp.value.replace(',', '.'))); } inp.remove(); afterWidget(n, w.name); };
  inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); if (ev.key === 'Escape') fin(false); }); inp.addEventListener('blur', () => fin(true));
}
function afterWidget(n, name) { save(); renderGraph(); checkGoals(); }
function comboMenu(x, y, n, w) {
  const list = w.options.map(o => ({ label: o, act: () => { snapshot(); n.widgets[w.name] = o; afterWidget(n, w.name); }, on: o === n.widgets[w.name] }));
  showPop(x, y, list, true);
}

/* ── Menus and search ── */
function showPop(x, y, items, filter = false) {
  const p = $('#pop'); p.innerHTML = (filter ? '<input class="pop-filter" placeholder="Filter…">' : '') + items.map((it, i) => it.sep ? '<hr>' : `<button type="button" data-i="${i}" class="${it.on ? 'on' : ''}${it.sub ? ' has-sub' : ''}"${it.disabled ? ' disabled' : ''}><span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}${it.sub ? '<i>▸</i>' : ''}</button>`).join('');
  p.hidden = false; p.style.left = `${Math.min(innerWidth - 240, x)}px`; p.style.top = `${Math.min(innerHeight - p.offsetHeight - 6, y)}px`;
  p.onclick = ev => { const b = ev.target.closest('[data-i]'); if (!b) return; const it = items[b.dataset.i]; if (it.sub) { showPop(x + 30, y + 10, it.sub); return; } closePop(); it.act?.(); };
  const f = $('.pop-filter', p); if (f) { f.focus(); f.addEventListener('input', () => { const q = f.value.toLowerCase(); $$('[data-i]', p).forEach(b => { b.hidden = !items[b.dataset.i].label.toLowerCase().includes(q); }); }); f.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') $$('[data-i]', p).find(b => !b.hidden)?.click(); if (ev.key === 'Escape') closePop(); }); }
}
const closePop = () => { $('#pop').hidden = true; };
window.addEventListener('pointerdown', e => { if (!e.target.closest('#pop, [data-menu]')) closePop(); if (!e.target.closest('#search')) closeSearch(); }, true);
function canvasMenu(x, y) {
  const at = toWorld(x, y);
  const cats = CATEGORIES.map(c => ({ label: c, sub: Object.entries(NODES).filter(([, d]) => d.cat[0] === c).map(([t, d]) => ({ label: d.title, act: () => { snapshot(); addNode(t, at.x, at.y); changed(); } })) }));
  showPop(x, y, [{ label: 'Add Node', sub: cats }, { label: 'Add Group', act: () => { snapshot(); S.graph.groups.push({ title: 'Group', x: at.x, y: at.y, w: 400, h: 260, color: '#3f789e' }); changed(); } }, { sep: true }, { label: 'Fit view', key: '.', act: () => { fitView(); flag('fitted'); } }, { label: 'Load Default', key: 'Ctrl D', act: () => { snapshot(); S.graph = defaultGraph(); changed(); fitView(); } }]);
}
function nodeMenu(x, y, id) {
  const n = nodeById(id);
  showPop(x, y, [...(n.type === 'LoadImage' ? [{ label: 'Open in MaskEditor', act: () => openMaskEditor(id) }, { sep: true }] : []), { label: 'Title', act: () => { const t = prompt('Title', n.title || NODES[n.type].title); if (t != null) { snapshot(); n.title = t.trim() || null; changed(); } } }, { label: 'Mode', sub: [['Always', 0], ['Never (Mute)', 2], ['Bypass', 4]].map(([l, m]) => ({ label: l, on: n.mode === m, act: () => { snapshot(); [...S.sel].forEach(s => { nodeById(s).mode = m; }); changed(); } })) }, { label: 'Bypass', key: 'Ctrl B', act: () => setMode(4) }, { label: n.collapsed ? 'Expand' : 'Collapse', key: 'Alt C', act: () => { snapshot(); n.collapsed = !n.collapsed; changed(); } }, { label: 'Colors', sub: Object.keys(COLORS).map(c => ({ label: c, act: () => { snapshot(); [...S.sel].forEach(s => { nodeById(s).color = c; }); changed(); } })) }, { sep: true }, { label: 'Clone', key: 'Alt drag', act: () => { snapshot(); const c = { ...clone(n), id: `${n.type}-${uid++}`, x: n.x + 30, y: n.y + 30 }; S.graph.nodes.push(c); S.sel = new Set([c.id]); changed(); } }, { label: 'Node info', act: () => showInfo(id, true) }, { label: 'Remove', key: 'Del', act: () => removeNodes([...S.sel]) }]);
}
function colorMenu(x, y) { showPop(x, y, [{ label: 'No color', act: () => { snapshot(); [...S.sel].forEach(s => { nodeById(s).color = null; }); changed(); } }, ...Object.keys(COLORS).map(c => ({ label: c, act: () => { snapshot(); [...S.sel].forEach(s => { nodeById(s).color = c; }); changed(); } }))]); }
function linkMenu(x, y, i) { const l = S.graph.links[i]; showPop(x, y, [{ label: 'Add Node', act: () => openSearch(x, y, { from: { id: l.from, dir: 'out', key: l.out, type: NODES[nodeById(l.from).type].outputs[l.out].type } }) }, { label: 'Delete', act: () => { snapshot(); S.graph.links.splice(i, 1); changed(); } }]); }
function headerMenu(name, x, y) {
  const items = {
    workflow: [{ label: 'New', act: () => { snapshot(); S.graph = { nodes: [], links: [], groups: [] }; changed(); } }, { label: 'Open', key: 'Ctrl O', act: () => openPanel('workflows') }, { label: 'Save', key: 'Ctrl S', act: saveWorkflow }, { label: 'Export', act: exportJson }, { sep: true }, { label: 'Load Default', key: 'Ctrl D', act: () => { snapshot(); S.graph = defaultGraph(); changed(); fitView(); } }],
    edit: [{ label: 'Undo', key: 'Ctrl Z', act: () => restore(S.undo, S.redo) }, { label: 'Redo', key: 'Ctrl Y', act: () => restore(S.redo, S.undo) }, { label: 'Clear Workflow', act: () => { snapshot(); S.graph = { nodes: [], links: [], groups: [] }; changed(); } }, { label: 'Copy', key: 'Ctrl C', act: copy }, { label: 'Paste', key: 'Ctrl V', act: () => paste(false) }],
    help: [{ label: 'ComfyUI docs ↗', act: () => window.open('https://docs.comfy.org/', '_blank', 'noopener') }, { label: 'Keyboard shortcuts', act: () => document.getElementById('concepts').scrollIntoView({ behavior: 'smooth' }) }],
  }[name];
  showPop(x, y, items);
}
let searchCtx = null;
function openSearch(x, y, ctx) {
  searchCtx = { ...ctx, at: toWorld(x, y) }; closePop();
  const s = $('#search'); s.hidden = false;
  s.style.left = `${Math.min(innerWidth - 470, x - 20)}px`; s.style.top = `${Math.min(innerHeight - 380, y - 20)}px`;
  s.innerHTML = `<div class="sb-head">${ctx.from ? `<span class="sb-filter" style="--c:${TYPE_COLOR[ctx.from.type]}">${ctx.from.dir === 'out' ? 'Input' : 'Output'}: ${ctx.from.type}</span>` : ''}<input id="sb-q" placeholder="${esc(U('searchPh'))}" autocomplete="off"></div><div class="sb-list" id="sb-list"></div>`;
  const q = $('#sb-q'); q.focus(); const draw = () => searchList(q.value); q.addEventListener('input', draw); draw();
  q.addEventListener('keydown', e => { e.stopPropagation(); const items = $$('#sb-list button'), cur = items.findIndex(b => b.classList.contains('on')); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = Math.max(0, Math.min(items.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1))); items.forEach((b, i) => b.classList.toggle('on', i === n)); items[n]?.scrollIntoView({ block: 'nearest' }); } if (e.key === 'Enter') items[Math.max(0, cur)]?.click(); if (e.key === 'Escape') closeSearch(); });
}
function searchList(q) {
  const f = searchCtx?.from; q = q.trim().toLowerCase();
  const fits = ([, d]) => !f || (f.dir === 'out' ? (d.inputs || []).some(i => i.type === f.type) : (d.outputs || []).some(o => o.type === f.type));
  const items = Object.entries(NODES).filter(fits).map(([t, d]) => ({ t, d, score: !q ? 1 : d.title.toLowerCase().startsWith(q) ? 3 : d.title.toLowerCase().includes(q) ? 2 : t.toLowerCase().includes(q) || d.cat.join(' ').includes(q) ? 1 : 0 })).filter(x => x.score).sort((a, b) => b.score - a.score);
  $('#sb-list').innerHTML = items.map((x, i) => `<button type="button" class="${i ? '' : 'on'}" data-add="${x.t}"><span class="sb-t">${esc(x.d.title)}</span><span class="sb-c">${esc(x.d.cat.join(' / '))}</span><span class="sb-d">${esc(T(DOCS[x.t]?.short))}</span></button>`).join('') || '<p class="sb-none">—</p>';
  $('#sb-list').onclick = e => { const b = e.target.closest('[data-add]'); if (b) chooseSearch(b.dataset.add); };
}
function chooseSearch(type) {
  const ctx = searchCtx; closeSearch(); snapshot();
  const n = addNode(type, ctx.at.x - (ctx.from?.dir === 'in' ? NODES[type].w : 0), ctx.at.y - 14);
  if (ctx.from) { const def = NODES[type]; if (ctx.from.dir === 'out') { const inp = def.inputs.find(i => i.type === ctx.from.type); connect(S.graph, makeLink(ctx.from.id, ctx.from.key, n.id, inp.name)); } else { const k = def.outputs.findIndex(o => o.type === ctx.from.type); connect(S.graph, makeLink(n.id, k, ctx.from.id, ctx.from.key)); } }
  changed();
}
const closeSearch = () => { $('#search').hidden = true; searchCtx = null; };

/* ── Info panel and tooltip ── */
function showInfo(id, open) {
  const n = nodeById(id); if (!n) return; if (open) S.info = true; if (!S.info) return;
  const d = DOCS[n.type] || {}, def = NODES[n.type];
  const p = $('#info'); p.hidden = false;
  p.innerHTML = `<header><b>${esc(def.title)}</b><button type="button" data-close-info>×</button></header><p class="i-class">${esc(n.type)} · ${esc(def.cat.join(' / '))}</p><p>${T(d.long || d.short)}</p>${(def.inputs || []).length ? `<h4>Inputs</h4><ul>${def.inputs.map(i => `<li><i style="background:${TYPE_COLOR[i.type]}"></i><b>${i.name}</b> ${i.type}${i.optional ? ' · optional' : ''}</li>`).join('')}</ul>` : ''}${(def.outputs || []).length ? `<h4>Outputs</h4><ul>${def.outputs.map(o => `<li><i style="background:${TYPE_COLOR[o.type]}"></i><b>${o.name}</b></li>`).join('')}</ul>` : ''}${d.widgets ? `<h4>Widgets</h4><ul class="i-w">${Object.entries(d.widgets).map(([k, v]) => `<li><b>${k}</b> ${T(v)}</li>`).join('')}</ul>` : ''}`;
  p.onclick = e => { if (e.target.closest('[data-close-info]')) { S.info = false; p.hidden = true; } };
}
let tipT = null;
function tipSoon(e, html) { clearTimeout(tipT); const x = e.clientX, y = e.clientY; tipT = setTimeout(() => { const t = $('#tip'); t.innerHTML = html; t.hidden = false; t.style.left = `${Math.min(innerWidth - 280, x + 14)}px`; t.style.top = `${y + 16}px`; }, 350); }
function hideTip() { clearTimeout(tipT); $('#tip').hidden = true; }

/* ── Side panels ── */
function openPanel(name) {
  const p = $('#panel');
  if (S.panel === name) { S.panel = null; p.hidden = true; $$('[data-panel]').forEach(b => b.classList.remove('on')); requestAnimationFrame(() => { drawLinks(); minimap(); }); return; }
  S.panel = name; p.hidden = false; $$('[data-panel]').forEach(b => b.classList.toggle('on', b.dataset.panel === name));
  if (name === 'queue') flag('queueOpen');
  renderPanel(); requestAnimationFrame(() => { drawLinks(); minimap(); });
}
function renderPanel() {
  const p = $('#panel'); if (!S.panel) return;
  if (S.panel === 'queue') {
    const items = [...S.history].reverse();
    p.innerHTML = `<header>QUEUE <span>${S.running ? U('running') : ''}</span></header>${S.running ? `<div class="q-run"><div class="q-bar"><i id="q-bar"></i></div><span id="q-status">…</span></div>` : ''}<div class="q-grid">${items.map(h => `<button type="button" class="q-item" data-hist="${h.id}"><img src="${h.thumb}" alt=""><span>${h.secs}s</span></button>`).join('') || `<p class="p-empty">${esc(U('queueEmpty'))}</p>`}</div>${items.length ? `<button type="button" class="p-clear" data-clear>${esc(U('clearHistory'))}</button>` : ''}`;
  }
  if (S.panel === 'nodes') p.innerHTML = `<header>NODE LIBRARY</header><div class="p-tree">${CATEGORIES.map(c => `<details open><summary>${c}</summary>${Object.entries(NODES).filter(([, d]) => d.cat[0] === c).map(([t, d]) => `<button type="button" data-lib="${t}" title="${esc(T(DOCS[t]?.short))}">${esc(d.title)}</button>`).join('')}</details>`).join('')}</div>`;
  if (S.panel === 'models') p.innerHTML = `<header>MODEL LIBRARY</header><div class="p-tree"><details open><summary>checkpoints</summary>${Object.entries(CHECKPOINTS).map(([f, c]) => `<button type="button" data-model="ckpt|${f}">${f}<small>${c.arch}</small></button>`).join('')}</details><details open><summary>loras</summary>${Object.entries(LORAS).map(([f, c]) => `<button type="button" data-model="lora|${f}">${f}<small>${c.arch}${c.trigger ? ` · trigger: ${c.trigger}` : ''}</small></button>`).join('')}</details><details open><summary>controlnet</summary>${Object.entries(CONTROLNETS).map(([f, c]) => `<button type="button" data-model="cn|${f}">${f}<small>${c.arch} · ${c.kind}</small></button>`).join('')}</details><details><summary>input (images)</summary>${IMAGES.map(f => `<button type="button" data-model="img|${f}">${f}</button>`).join('')}</details></div><p class="p-note">${esc(U('modelsNote'))}</p>`;
  if (S.panel === 'workflows') { const list = store.get('workflows', []); p.innerHTML = `<header>WORKFLOWS</header><div class="p-list">${list.map((w, i) => `<button type="button" data-wf="${i}"><b>${esc(w.name)}.json</b><small>${new Date(w.time).toLocaleString()}</small></button>`).join('') || `<p class="p-empty">${esc(U('noWorkflows'))}</p>`}</div>`; }
  if (S.panel === 'templates') p.innerHTML = `<header>TEMPLATES</header><div class="p-list">${TEMPLATES.map(t => `<button type="button" data-tpl="${t.id}"><b>${esc(T(t.name))}</b></button>`).join('')}</div><p class="p-note">${esc(U('templatesNote'))}</p>`;
}
function setupPanels() {
  $('.cy-side').addEventListener('click', e => { const b = e.target.closest('[data-panel]'); if (b) openPanel(b.dataset.panel); });
  $('#panel').addEventListener('click', e => {
    const h = e.target.closest('[data-hist]'); if (h) { showResult(S.history.find(x => x.id === Number(h.dataset.hist))); return; }
    if (e.target.closest('[data-clear]')) { S.history = []; save(); renderPanel(); checkGoals(); return; }
    const lib = e.target.closest('[data-lib]'); if (lib) { const c = $('#canvas'), at = toWorld(c.getBoundingClientRect().left + c.clientWidth / 2, c.getBoundingClientRect().top + c.clientHeight / 2); snapshot(); addNode(lib.dataset.lib, at.x - 100, at.y - 50); changed(); return; }
    const m = e.target.closest('[data-model]'); if (m) { const [kind, f] = m.dataset.model.split('|'), c = $('#canvas'), at = toWorld(c.getBoundingClientRect().left + c.clientWidth / 2, c.getBoundingClientRect().top + c.clientHeight / 2); const t = { ckpt: ['CheckpointLoaderSimple', 'ckpt_name'], lora: ['LoraLoader', 'lora_name'], cn: ['ControlNetLoader', 'control_net_name'], img: ['LoadImage', 'image'] }[kind]; snapshot(); addNode(t[0], at.x - 150, at.y - 50, { [t[1]]: f }); changed(); return; }
    const wf = e.target.closest('[data-wf]'); if (wf) { const w = store.get('workflows', [])[wf.dataset.wf]; snapshot(); S.graph = clone(w.graph); $('#wf-name').textContent = w.name; changed(); fitView(); return; }
    const tp = e.target.closest('[data-tpl]'); if (tp) { snapshot(); S.graph = TEMPLATES.find(t => t.id === tp.dataset.tpl).make(); S.graph.groups ||= []; changed(); fitView(); toast(U('templateLoaded')); }
  });
}
function saveWorkflow() {
  const name = prompt(U('saveAs'), $('#wf-name').textContent === 'Unsaved Workflow' ? 'my_workflow' : $('#wf-name').textContent); if (!name) return;
  const list = store.get('workflows', []); list.push({ name, time: Date.now(), graph: clone(S.graph) }); store.set('workflows', list.slice(-12));
  $('#wf-name').textContent = name; $('#wf-dirty').hidden = true; flag('saved'); toast(U('savedWf', { n: name })); if (S.panel === 'workflows') renderPanel();
}
function exportJson() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S.graph, null, 2)], { type: 'application/json' })); a.download = `${$('#wf-name').textContent}.json`; a.click(); }
function showResult(h) {
  if (!h) return; flag('resultOpened'); const d = $('#dialog'); d.hidden = false;
  d.innerHTML = `<div class="dlg result"><header><b>${esc(h.file)}</b><button type="button" data-close>×</button></header><div class="res-body"><div class="res-pic"><img src="${h.full || h.thumb}" alt="">${CFG.resultExtra ? CFG.resultExtra(h) : ''}</div><dl><dt>seed</dt><dd>${h.seed}</dd><dt>steps · cfg</dt><dd>${h.steps} · ${h.cfg}</dd><dt>sampler</dt><dd>${h.sampler} · ${h.scheduler}</dd><dt>denoise</dt><dd>${h.denoise}</dd><dt>size</dt><dd>${h.w} × ${h.h}</dd><dt>checkpoint</dt><dd>${esc(h.ckpt)}</dd>${h.loras.length ? `<dt>LoRA</dt><dd>${h.loras.map(l => `${esc(l.name)} ${l.strength}`).join('<br>')}</dd>` : ''}${h.ctlKind ? `<dt>ControlNet</dt><dd>${h.ctlKind} · ${h.ctlStrength} · ${h.ctlStart}–${h.ctlEnd}</dd>` : ''}<dt>prompt</dt><dd class="pr">${esc(h.posText)}</dd><dt>negative</dt><dd class="pr">${esc(h.negText)}</dd></dl></div><footer><span>${esc(U('pngNote'))}</span><button type="button" class="primary" data-loadwf>Load Workflow</button></footer></div>`;
  d.onclick = e => { if (e.target.closest('[data-close]') || e.target === d) closeDialog(); if (e.target.closest('[data-loadwf]')) { snapshot(); S.graph = clone(h.graph); closeDialog(); flag('loadedFromImage'); changed(); fitView(); toast(U('wfFromImage')); } };
}
const closeDialog = () => { $('#dialog').hidden = true; };

/* ── Running: validation, execution order, cache, progress ── */
function interrupt() { if (S.running) { S.cancel = true; toast(U('interrupted'), 'bad'); } }
async function queue() {
  if (S.running) { toast(U('alreadyRunning')); return; }
  const batch = Math.max(1, Math.min(8, Number($('#batch').value) || 1));
  for (let b = 0; b < batch && !S.cancel; b++) { const ok = await runOnce(); if (!ok) break; }
  S.cancel = false;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function nodeEl(id) { return $(`.cn[data-node="${CSS.escape(id)}"]`); }
async function runOnce() {
  $$('.cn.err').forEach(e => e.classList.remove('err'));
  const g = S.graph, v = validate(g);
  if (!v.ok) {
    flag('errorSeen');
    const lines = v.errors.map(er => er.msg === 'noOutputs' ? `<li>${esc(U('noOutputs'))}</li>` : er.msg === 'multiple8' ? `<li><b>${esc(NODES[nodeById(er.node).type].title)}</b>: ${esc(U('mult8'))}</li>` : `<li><b>${esc(nodeById(er.node).title || NODES[nodeById(er.node).type].title)}</b>: Required input is missing: <code>${esc(er.input)}</code></li>`);
    v.errors.forEach(er => er.node && nodeEl(er.node)?.classList.add('err'));
    const d = $('#dialog'); d.hidden = false; d.innerHTML = `<div class="dlg error"><header><b>Prompt outputs failed validation</b><button type="button" data-close>×</button></header><ul>${lines.join('')}</ul><p class="dlg-hint">${esc(U('validationHint'))}</p><footer><button type="button" class="primary" data-close>OK</button></footer></div>`;
    d.onclick = e => { if (e.target.closest('[data-close]') || e.target === d) closeDialog(); };
    return false;
  }
  S.running = true; $('#run').classList.add('busy'); $('#stop').disabled = false; $('#qcount').textContent = '1';
  // Freeze the values used by this run; "control after generate" changes the seed right after queueing.
  const graph = clone(g), keys = cacheKeys(graph, v.order);
  for (const n of g.nodes.filter(x => x.type === 'KSampler' && x.mode === 0)) { const c = n.widgets.control_after_generate; if (c === 'randomize') n.widgets.seed = Math.floor(Math.random() * 1e15); else if (c === 'increment') n.widgets.seed++; else if (c === 'decrement') n.widgets.seed = Math.max(0, n.widgets.seed - 1); }
  renderGraph(); if (S.panel === 'queue') renderPanel();
  const res = execute(graph), t0 = performance.now();
  for (const w of res.warnings) { if (w.text) { log(w.text, w.level || 'warn'); continue; } log(`<b>[LoRA]</b> lora key not loaded: ${esc(w.lora)} <i>(${esc(U('loraArch', { a: w.arch }))})</i>`, 'warn'); S.flags.loraWarn = true; }
  for (const id of v.order) {
    if (S.cancel) break;
    const n = graph.nodes.find(x => x.id === id), el = nodeEl(id), cached = S.lastKeys[id] === keys[id] && !NODES[n.type].output;
    if (cached) { el?.classList.add('cached'); await sleep(40); el?.classList.remove('cached'); continue; }
    el?.classList.add('running');
    if (n.type === 'KSampler') {
      const recipe = res.values[id]?.[0]?.recipe;
      if (res.runtime?.node === id) { await sleep(300); el?.classList.remove('running'); break; }
      const steps = n.widgets.steps, dur = Math.max(500, Math.min(2600, steps * 55)), frames = Math.min(steps, 10);
      for (let f = 1; f <= frames && !S.cancel; f++) {
        const prog = f / frames; el?.style.setProperty('--prog', prog); if ($('#q-bar')) { $('#q-bar').style.width = `${prog * 100}%`; $('#q-status').textContent = `KSampler ${Math.round(prog * steps)}/${steps}`; }
        if (recipe) { const cv = renderRecipe(describeRecipe(recipe), { progress: Math.min(.98, prog) }); const box = el?.querySelector('.n-live') || el?.querySelector('.cn-body')?.appendChild(Object.assign(document.createElement('div'), { className: 'n-live' })); if (box) box.innerHTML = `<img src="${toUrl(cv, 200)}" alt="">`; }
        await sleep(dur / frames);
      }
      el?.style.removeProperty('--prog');
    } else await sleep(NODES[n.type].output ? 120 : 200);
    el?.classList.remove('running');
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(2);
  S.running = false; $('#run').classList.remove('busy'); $('#stop').disabled = true; $('#qcount').textContent = '0';
  if (S.cancel) { renderGraph(); return false; }
  if (res.runtime) {
    nodeEl(res.runtime.node)?.classList.add('err');
    const d = $('#dialog'); d.hidden = false; const rt = res.runtime; flag('rt_' + rt.msg); d.innerHTML = `<div class="dlg error"><header><b>Error occurred when executing ${esc(rt.title || NODES[nodeById(rt.node)?.type]?.title || 'KSampler')}:</b><button type="button" data-close>×</button></header><pre>${esc(rt.detail)}\n\n${esc(rt.trace || '  File "comfy/samplers.py", line 1104, in sample\n  File "comfy/controlnet.py", in get_control')}\n${esc(rt.error || 'RuntimeError')}: ${esc(rt.detail)}</pre><p class="dlg-hint">${rt.hint ? T(rt.hint) : esc(U('shapeHint'))}</p><footer><button type="button" class="primary" data-close>Close</button></footer></div>`;
    d.onclick = e => { if (e.target.closest('[data-close]') || e.target === d) closeDialog(); };
    S.lastKeys = {}; renderGraph(); return false;
  }
  S.lastKeys = keys;
  // Output images, history and the checklists.
  const nodeRecipe = Object.values(res.values).flat().find(x => x?.recipe)?.recipe;
  for (const [id, img] of Object.entries(res.outputs)) {
    if (!img) continue;
    const cv = renderValue(img);
    S.images[id] = toUrl(cv, 300);
    const n = graph.nodes.find(x => x.id === id);
    if (img.kind === 'canny') flag('cannySeen');
    if (n.type === 'SaveImage' || (n.type === 'PreviewImage' && !Object.keys(res.outputs).some(k => graph.nodes.find(x => x.id === k)?.type === 'SaveImage'))) {
      if (img.recipe || img.kind === 'generated' || CFG.findRecipe?.(img)) { const rec = img.recipe || CFG.findRecipe?.(img) || nodeRecipe; const h = historyEntry(rec, cv, graph, secs, n.widgets.filename_prefix); if (CFG.outputExtra) Object.assign(h, CFG.outputExtra(img, graph)); S.history.push(h); }
      else if (!nodeRecipe) S.history.push({ id: Date.now(), thumb: toUrl(cv, 110, 'image/jpeg'), full: toUrl(cv, 300), file: `${n.widgets.filename_prefix || 'ComfyUI_temp'}_${String(S.history.length + 1).padStart(5, '0')}_.png`, graph, secs, seed: '—', steps: '—', cfg: '—', sampler: '—', scheduler: '', denoise: '—', w: img.w, h: img.h, ckpt: '—', loras: [], pos: { subjects: [], settings: [], styles: [], colors: [], weights: {}, triggers: [], text: '' }, neg: { subjects: [], settings: [], colors: [] }, posText: '', negText: '', key: 'img', kind: img.kind });
    }
  }
  if (graph.nodes.some(x => x.mode === 4 && x.type === 'LoraLoader')) flag('ranBypass');
  if (graph.nodes.some(x => x.mode === 2)) flag('ranMute');
  if (S.history.length > 24) S.history = S.history.slice(-24);
  save(); renderGraph(); if (S.panel === 'queue') renderPanel(); checkGoals();
  return true;
}
function historyEntry(recipe, cv, graph, secs, prefix) {
  const d = describeRecipe(recipe), fx = effects(d), c = d.controls[0];
  return { id: Date.now() + Math.random(), thumb: toUrl(cv, 110, 'image/jpeg'), full: toUrl(cv, 320), file: `${prefix || 'ComfyUI'}_${String(S.history.length + 1).padStart(5, '0')}_.png`, graph, secs, key: hashSeed(JSON.stringify([d.seed, d.steps, d.cfg, d.sampler, d.scheduler, d.denoise, d.w, d.h, d.ckpt, d.pos.text, d.neg.text, d.loras, d.controls.map(x => [x.net.name, x.strength, x.start, x.end, x.image?.kind])])),
    seed: d.seed, steps: d.steps, cfg: d.cfg, sampler: d.sampler, scheduler: d.scheduler, denoise: d.denoise, w: d.w, h: d.h, ckpt: d.ckpt, arch: d.arch, pos: d.pos, neg: d.neg, posText: d.pos.text, negText: d.neg.text,
    loras: d.loras.map(l => ({ name: l.name, strength: l.strength, trigger: l.trigger })), img2img: !!d.source, control: Math.max(0, ...fx.control.map(x => x.amount)), ctlStrength: c?.strength ?? null, ctlStart: c?.start ?? null, ctlEnd: c?.end ?? null, ctlKind: c?.net.kind ?? null, ...(CFG.historyExtra ? CFG.historyExtra(recipe, graph) : {}) };
}

/* ── Steps ── */
function goStep(si, st) { save(); S.stage = si; S.step = st; loadStep(); save(); renderStages(); renderGuide(); renderCard(); renderGraph(); requestAnimationFrame(() => fitView()); checkGoals(); if (S.panel) renderPanel(); $('#wf-name').textContent = 'Unsaved Workflow'; }
function setupLesson() {
  $('#stages').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (b) goStep(Number(b.dataset.stage), Math.min(STAGES[b.dataset.stage].steps.length - 1, store.get(`step:${STAGES[b.dataset.stage].id}`, 0))); });
  $('#guide').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) goStep(S.stage, Number(b.dataset.step)); });
  $('#step-card').addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    if (a === 'next') goStep(S.stage, S.step + 1);
    if (a === 'next-stage') goStep(S.stage + 1, 0);
    if (a === 'solution') { snapshot(); S.graph = step().solution(); S.graph.groups ||= []; changed(); fitView(); toast(U('solutionShown')); }
    if (a === 'reset') { snapshot(); S.graph = step().starter(); S.graph.groups ||= []; S.flags = {}; S.history = []; S.lastKeys = {}; S.images = {}; changed(); fitView(); if (S.panel) renderPanel(); }
  });
  $('#run').addEventListener('click', () => queue());
  $('.run-more').addEventListener('click', e => showPop(e.clientX - 140, e.clientY + 14, [{ label: 'Run', key: 'Ctrl Enter', act: queue }, { label: 'Run (front)', key: 'Ctrl Shift Enter', act: queue }, { label: 'Interrupt', key: 'Ctrl Alt Enter', act: interrupt }]));
  $('#stop').addEventListener('click', interrupt);
  $('.cy-menu').addEventListener('click', e => { const m = e.target.closest('[data-menu]'); if (m) { const r = m.getBoundingClientRect(); headerMenu(m.dataset.menu, r.left, r.bottom + 4); } });
}

/* ── Start ── */
shell(); loadStep();
renderStages(); renderGuide(); renderCard(); renderConcepts(); setupCanvas(); setupPanels(); setupLesson();
renderGraph(); requestAnimationFrame(() => { fitView(); checkGoals(); });
$('#wf-dirty').hidden = true;
await import('../../lab-brief.js?v=3');
initI18n({ mount: '.site-header', append: true });
onLangChange(() => location.reload());
