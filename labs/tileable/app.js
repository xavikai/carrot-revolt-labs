// Tileable Texture Lab: stages, steps, undo and the two workspaces (Photoshop-style and Blender-style).
import { STAGES, startState } from './stages.js?v=2';
import { createPS } from './ps.js?v=2';
import { createBL } from './bl.js?v=2';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=2';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-tile:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-tile:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = { stageIndex: Math.min(Math.max(0, store.get('stage', 0) | 0), STAGES.length - 1), step: 0, st: null, undo: [], redo: [], done: store.get('done', {}), ver: 0, hover: false, ready: false };
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step];
let msgTimer;
function msg(text, warning = false) {
  const el = $('#status-msg'); el.textContent = t(text); el.classList.toggle('warning', warning);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.textContent = ''; }, 8000);
}
const isPS = () => S.st?.app === 'ps';
const snap = () => (isPS() ? structuredClone(S.st) : JSON.stringify(S.st));
const restore = v => (typeof v === 'string' ? JSON.parse(v) : v);
function pushUndo() { S.undo.push(snap()); if (S.undo.length > (isPS() ? 14 : 60)) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) { msg('Nothing to undo.'); return; } S.redo.push(snap()); S.st = restore(S.undo.pop()); changed(); msg('Undo.'); }
function redo() { if (!S.redo.length) return; S.undo.push(snap()); S.st = restore(S.redo.pop()); changed(); msg('Redo.'); }

const ctx = { S, msg, pushUndo, undo, redo, changed: (...a) => changed(...a), stepId: () => step().id };
const ps = createPS(ctx), bl = createBL(ctx);
const app = () => (isPS() ? ps : bl);

// ─── Storage (only the Blender steps: the Photoshop steps are pixels, kept for this visit only) ─
const dataKey = () => `step:${stage().id}-${step().id}`;
function saveData() { if (S.st && !isPS()) store.set(dataKey(), S.st); }
const memory = new Map();
function loadData() {
  const fresh = startState(step());
  if (fresh.app === 'ps') { S.st = memory.get(dataKey()) ?? fresh; return; }
  const saved = store.get(dataKey(), null);
  const ok = saved && typeof saved === 'object' && saved.app === 'bl' && saved.scene === fresh.scene && !!saved.maps === !!fresh.maps && !!saved.macro === !!fresh.macro && !!saved.moss === !!fresh.moss && !!saved.uv === !!fresh.uv;
  S.st = ok ? { ...fresh, ...saved, flags: { ...saved.flags } } : fresh;
}
function leaveStep() { if (!S.st) return; if (isPS()) memory.set(dataKey(), S.st); else saveData(); }

// ─── Stage switch, guide, step card ──────────────────────────────────────────
function renderStageSwitch() {
  $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small>${esc(t(s.app === 'ps' ? 'Photoshop' : 'Blender'))} · ${esc(t(s.sub))}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; go(+b.dataset.stage, 0); });
const doneKey = i => `${stage().id}-${stage().steps[i].id}`;
let okNow = false;
const stepDone = i => (i === S.step ? okNow : !!S.done[doneKey(i)]);
function renderGuide() {
  const st = stage(), g = $('#guide'), n = st.steps.length;
  g.className = `guide${n === 3 ? ' three' : n === 2 ? ' two' : ''}`;
  g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; go(S.stageIndex, +li.dataset.step); });
function renderStepCard() {
  const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
  card.classList.toggle('done', ok);
  card.innerHTML = `<div><span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p></div>
    <div><span class="control-label">${esc(t(s.app === 'ps' ? 'HOW, AS IN PHOTOSHOP' : 'HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol></div>
    <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
      ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
      ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
      <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
      <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'reset-step') busy(() => { pushUndo(); S.st = startState(step()); changed(); if (isPS()) ps.enter(); msg('Back to the start. Ctrl Z undoes it.'); });
  if (id === 'show-solution') busy(() => { pushUndo(); step().solve(S.st); changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); });
  if (id === 'next-step') go(S.stageIndex, S.step + 1);
  if (id === 'next-stage') go(S.stageIndex + 1, 0);
});
let lastOk = null, lastCard = '';
function checkProgress() {
  okNow = !!step().check(S.st);
  if (okNow) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
  if (okNow && lastOk === false) { const title = step().title; setTimeout(() => { if (step().title === title) msg(tr('✓ Step done: {s}', { s: t(title) })); }, 900); }
  const key = `${S.stageIndex}|${S.step}|${okNow}|${document.documentElement.lang}`;
  if (key !== lastCard) { renderGuide(); renderStepCard(); lastCard = key; }
  lastOk = okNow;
}
// light: only values changed while dragging a slider (no need to rebuild the panels).
function changed(save = true, light = false) {
  S.ver++;
  if (save) saveData();
  app().render(light);
  checkProgress();
}
function busy(fn) {
  const el = isPS() || step().app === 'ps' ? $('#ps-busy') : $('#bl-busy'); el.hidden = false;
  setTimeout(() => { try { fn(); } finally { el.hidden = true; } }, 30);
}
function go(stageIndex, stepIndex) {
  leaveStep();
  S.stageIndex = stageIndex; S.step = stepIndex; store.set('stage', S.stageIndex);
  enterStep();
}
function enterStep() {
  const kind = step().app;
  $('#ps').hidden = kind !== 'ps'; $('#bl').hidden = kind !== 'bl';
  $('#workspace').classList.toggle('is-ps', kind === 'ps');
  $('#workspace').setAttribute('aria-label', kind === 'ps' ? 'Photoshop-style workspace' : 'Blender-style workspace');
  renderStageSwitch();
  $('#status-msg').textContent = ''; clearTimeout(msgTimer);
  const el = kind === 'ps' ? $('#ps-busy') : $('#bl-busy'); el.textContent = t(kind === 'ps' ? 'Opening the photo…' : 'Painting the textures…'); el.hidden = false;
  setTimeout(() => {
    try {
      loadData(); S.undo = []; S.redo = []; S.ver++;
      okNow = !!step().check(S.st); lastOk = okNow; lastCard = '';
      $('#status-keys').innerHTML = app().statusKeys();
      app().enter(); checkProgress();
    } finally { el.hidden = true; }
  }, 30);
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); if (S.st) { app().render(); checkProgress(); } });

// ─── Keyboard ────────────────────────────────────────────────────────────────
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (!S.st) return;
  if (!$('#ps-dialog').hidden) return;
  if (e.target.closest('input, select, textarea')) return;
  if (!S.hover) return;
  const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
  if (ctrl && low === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); return; }
  if (ctrl && low === 'y') { redo(); e.preventDefault(); return; }
  if (app().keydown(e)) e.preventDefault();
});

// ─── Start ───────────────────────────────────────────────────────────────────
enterStep();
// For tests and debugging.
window.__tile = { S, STAGES, go, solve: () => { step().solve(S.st); changed(); }, ps, bl, check: () => step().check(S.st) };
