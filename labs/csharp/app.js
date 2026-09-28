import { compile, Runner, CSharpError, literal, isArr, elemOf, isObj, isStructVal, isList, listElem } from './interpreter.js';
import { TYPES as KINDS, checkRequirements, assembleParsons, judge } from './levels.js';
// Two courses share this app: Code Lab 01 (foundations) and Code Lab 02 (objects, towards Unity).
const COURSE = document.body.dataset.course || 'basics';
const course = COURSE === 'objects' ? await import('./levels-objects.js') : await import('./levels.js');
const { LEVELS, CHALLENGES, API } = course;
import { prepare, verifySeeds, assess } from './evaluate.js';
import { compare } from './world.js';
import { IsoView, PALETTE } from './render.js';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js';
addDictionary(dictionary);
if (course.dictionary) addDictionary(course.dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PREFIX = COURSE === 'objects' ? 'carrot-revolt-csharp:objects:' : 'carrot-revolt-csharp:';
const store = {
  get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const SPEEDS = [{ label: 'Slow', ms: 900 }, { label: 'Normal', ms: 380 }, { label: 'Fast', ms: 130 }, { label: 'Very fast', ms: 35 }, { label: 'Instant', ms: 0 }];
const LH = 21;
const LV = Object.fromEntries(LEVELS.map(l => [l.name, l.id]));

const ta = $('#code'), layer = $('#code-layer'), gutter = $('#gutter'), editor = $('#editor');
const view = new IsoView($('#scene'));
const S = {
  index: 0, challenge: null, done: new Set(store.get('done', [])),
  mode: 'idle', runner: null, gen: null, world: null, target: {}, seed: 1, compiled: null,
  event: null, prevLine: null, breakpoints: new Set(), timer: null, errorLines: new Map(),
  result: null, outEl: null, speed: store.get('speed', 1),
  prediction: null, correct: new Set(store.get('correct', [])), parsons: null, parsonsView: 'blocks',
};

// ─── Syntax highlighting ─────────────────────────────────────────────────────
const KW = new Set(['int', 'float', 'double', 'bool', 'string', 'var', 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'true', 'false', 'using', 'return', 'void', 'new', 'null', 'foreach', 'in', 'class', 'static', 'public', 'private', 'switch', 'case', 'const']);
const TYPES = new Set(['Color', 'Direction', 'Console', 'Math', 'Drone']);
function highlight(line, st) {
  let out = '', i = 0;
  const span = (cls, s) => `<span class="${cls}">${esc(s)}</span>`;
  while (i < line.length) {
    const rest = line.slice(i);
    if (st.comment) {
      const end = rest.indexOf('*/');
      const seg = end < 0 ? rest : rest.slice(0, end + 2);
      out += span('t-com', seg); i += seg.length; if (end >= 0) st.comment = false; continue;
    }
    if (rest.startsWith('//')) { out += span('t-com', rest); break; }
    if (rest.startsWith('/*')) { st.comment = true; out += span('t-com', '/*'); i += 2; continue; }
    let m;
    if ((m = rest.match(/^\$?"(?:[^"\\]|\\.)*"?/))) { out += span('t-str', m[0]); i += m[0].length; continue; }
    if ((m = rest.match(/^\d[\d_]*(\.\d+)?[fFdD]?/))) { out += span('t-num', m[0]); i += m[0].length; continue; }
    if ((m = rest.match(/^[A-Za-z_]\w*/))) {
      const w = m[0], after = rest.slice(w.length);
      const cls = /^_{2,}$/.test(w) ? 't-blank' : KW.has(w) ? 't-kw' : TYPES.has(w) ? 't-type' : w === 'drone' ? 't-drone' : /^\s*\(/.test(after) ? 't-method' : 't-id';
      out += span(cls, w); i += w.length; continue;
    }
    if ((m = rest.match(/^\s+/))) { out += m[0]; i += m[0].length; continue; }
    out += span('t-punc', rest[0]); i++;
  }
  return out;
}

// ─── Editor rendering ────────────────────────────────────────────────────────
function renderCode() {
  const lines = ta.value.split('\n');
  const st = { comment: false };
  const ev = S.event, active = S.mode === 'running' || S.mode === 'paused';
  const r = S.runner, notes = r?.notes, counts = r?.lineCounts;
  const fresh = r?.log.at(-1)?.line;
  const waiting = new Set(active ? (r?.frames || []).map(f => f.callLine) : []);
  let code = '', gut = '';
  lines.forEach((l, i) => {
    const n = i + 1;
    let cls = 'ln';
    const isCur = active && ev && ev.line === n;
    if (isCur) cls += ev.kind === 'cond' ? (ev.value ? ' current-cond-true' : ' current-cond-false') : ' current';
    else if (waiting.has(n)) cls += ' waiting';
    if (S.errorLines.has(n)) cls += ' error';
    if (n === fresh && active) cls += ' fresh';
    const note = notes?.get(n), res = r?.resultsByLine?.get(n);
    let tail = '';
    if (res && res.text) tail = `<span class="result-chip${res.expression ? '' : ' decl'}"><span class="rv">${res.expression ? '→ ' : ''}${esc(res.text)}</span><i>${esc(res.type)}</i></span>`;
    else if (note && !res) tail = `<span class="annot">// ${esc(note)}</span>`;
    code += `<div class="${cls}">${highlight(l, st) || ' '}${tail}</div>`;
    const cnt = counts?.get(n);
    gut += `<div class="gl${S.breakpoints.has(n) ? ' bp' : ''}${isCur ? ' current' : ''}${S.errorLines.has(n) ? ' error' : ''}" data-line="${n}" title="Toggle breakpoint"><span class="cnt">${cnt ? '×' + cnt : ''}</span><span class="n">${n}</span></div>`;
  });
  layer.innerHTML = code;
  gutter.innerHTML = gut;
  ta.style.height = (lines.length * LH + 52) + 'px';
  ta.style.width = Math.max(editor.clientWidth - gutter.offsetWidth, layer.scrollWidth) + 'px';
}
function scrollToLine(n) {
  const top = (n - 1) * LH + 12, h = editor.clientHeight;
  if (top < editor.scrollTop + 20 || top > editor.scrollTop + h - 60) editor.scrollTo({ top: Math.max(0, top - h / 3), behavior: 'smooth' });
}

// ─── Editing helpers ─────────────────────────────────────────────────────────
function insertText(text, start = ta.selectionStart, end = ta.selectionEnd) {
  ta.focus();
  ta.setSelectionRange(start, end);
  if (!document.execCommand || !document.execCommand('insertText', false, text)) { ta.setRangeText(text, start, end, 'end'); onCodeInput(); }
}
function lineBounds(pos) {
  const v = ta.value, s = v.lastIndexOf('\n', pos - 1) + 1;
  let e = v.indexOf('\n', pos); if (e < 0) e = v.length;
  return [s, e];
}
ta.addEventListener('keydown', e => {
  if (ta.readOnly) return;
  const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
  if (e.key === 'Tab') {
    e.preventDefault();
    const [s] = lineBounds(a), [, eEnd] = lineBounds(b);
    if (a === b && !e.shiftKey) { insertText('    '); return; }
    const block = v.slice(s, eEnd).split('\n');
    const next = block.map(l => e.shiftKey ? l.replace(/^ {1,4}/, '') : '    ' + l).join('\n');
    insertText(next, s, eEnd);
    ta.setSelectionRange(s, s + next.length);
  } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const [s] = lineBounds(a);
    const before = v.slice(s, a);
    let indent = before.match(/^\s*/)[0];
    if (/\{\s*$/.test(before)) indent += '    ';
    const afterChar = v[b];
    if (/\{\s*$/.test(before) && afterChar === '}') { insertText('\n' + indent + '\n' + indent.slice(4)); ta.setSelectionRange(a + 1 + indent.length, a + 1 + indent.length); return; }
    insertText('\n' + indent);
  } else if (e.key === '}') {
    const [s] = lineBounds(a);
    const before = v.slice(s, a);
    if (/^\s+$/.test(before) && a === b) { e.preventDefault(); insertText(before.slice(Math.min(4, before.length)) + '}', s, a); }
  } else if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const [s] = lineBounds(a), [, eEnd] = lineBounds(b);
    const block = v.slice(s, eEnd).split('\n');
    const allCommented = block.every(l => /^\s*\/\//.test(l) || !l.trim());
    const next = block.map(l => allCommented ? l.replace(/^(\s*)\/\/ ?/, '$1') : (l.trim() ? l.replace(/^(\s*)/, '$1// ') : l)).join('\n');
    insertText(next, s, eEnd);
    ta.setSelectionRange(s, s + next.length);
  }
});
let saveTimer = null;
function onCodeInput() {
  if (S.mode === 'finished' || S.mode === 'error') { S.mode = 'idle'; resetScene(); }
  S.errorLines.clear();
  renderCode();
  updateStats();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set('code:' + S.challenge.id, ta.value), 300);
}
ta.addEventListener('input', onCodeInput);
function updateStats() {
  if (S.challenge?.type === 'parsons' && S.parsonsView === 'blocks') return;
  if (S.challenge?.type === 'classify') { $('#code-stats').textContent = `${S.challenge.classify.items.length} ITEMS`; return; }
  const c = compile(ta.value, { mode: S.challenge?.mode });
  const calc = S.challenge?.mode === 'calc';
  $('#code-stats').textContent = c.stats ? `${c.stats.statements} ${calc ? 'LINE' : 'INSTRUCTION'}${c.stats.statements === 1 ? '' : 'S'}` : '—';
}
gutter.addEventListener('click', e => {
  const g = e.target.closest('.gl'); if (!g) return;
  const n = Number(g.dataset.line);
  S.breakpoints.has(n) ? S.breakpoints.delete(n) : S.breakpoints.add(n);
  renderCode();
});

// ─── Console ─────────────────────────────────────────────────────────────────
const consoleEl = $('#console');
function logLine(cls, text) { const d = document.createElement('div'); d.className = 'c-line ' + cls; d.textContent = text; consoleEl.append(d); consoleEl.scrollTop = consoleEl.scrollHeight; return d; }
function logProblem(err, kind) {
  const d = document.createElement('div');
  d.className = kind === 'warning' ? 'c-warn' : 'c-error';
  const loc = err.kind === 'runtime'
    ? `Unhandled exception · line ${err.line}`
    : `Program.cs(${err.line},${err.col}): ${kind} ${err.code && err.code !== 'LAB' ? err.code : ''}`.trim();
  const msg = err.kind === 'runtime' ? `${err.exception === 'DroneException' ? '' : 'System.'}${err.exception}: ${t(err.message)}` : t(err.message);
  d.innerHTML = `<div class="c-loc">${esc(loc)}</div><div class="c-msg">${esc(msg)}</div>${err.hint ? `<div class="c-hint"><b class="hl">${esc(t('Hint'))} · </b>${esc(t(err.hint))}</div>` : ''}`;
  d.title = 'Go to the line';
  d.onclick = () => goToLine(err.line, err.col);
  consoleEl.append(d); consoleEl.scrollTop = consoleEl.scrollHeight;
}
function goToLine(line, col = 1) {
  const lines = ta.value.split('\n');
  let pos = 0; for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  const len = (lines[line - 1] || '').length;
  ta.focus(); ta.setSelectionRange(pos + Math.min(col - 1, len), pos + len);
  scrollToLine(line);
}
function setBuild(text, cls = '') { const b = $('#build-status'); b.textContent = text; b.className = 'build-status ' + cls; }
$('#clear-console').onclick = () => { consoleEl.innerHTML = ''; S.outEl = null; };
function renderOutput() {
  if (!S.outEl || !S.runner) return;
  const out = S.runner.output;
  S.outEl.innerHTML = out.slice(-400).map(o => `<div class="c-line c-out">${esc(o.text) || ' '}</div>`).join('');
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ─── Challenge panel ─────────────────────────────────────────────────────────
function renderLevels() {
  const cur = S.challenge;
  $('#levels').innerHTML = LEVELS.map(l => {
    const real = l.challenges.filter(c => !c.sandbox);
    const allDone = real.length && real.every(c => S.done.has(c.id));
    return `<div class="level${cur.level.id === l.id ? ' current' : ''}${allDone ? ' done' : ''}">
      <span class="level-num">${allDone ? '✓' : l.id}</span>
      <span class="level-name">${esc(l.name)}<small>${esc(l.concept)}</small></span>
      <div class="pills">${l.challenges.map((c, i) => {
        const full = CHALLENGES.find(x => x.id === c.id), kind = KINDS[full.type];
        return `<button class="pill k-${full.type}${c.id === cur.id ? ' active' : ''}${S.done.has(c.id) ? ' done' : ''}" data-id="${c.id}" title="${esc(kind.label)} · ${esc(c.title)}">${c.sandbox ? 'Free' : `<b class="pm">${kind.mark}</b>${i + 1}`}</button>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}
$('#levels').addEventListener('click', e => {
  const p = e.target.closest('.pill'); if (!p) return;
  loadChallenge(CHALLENGES.findIndex(c => c.id === p.dataset.id));
});
function renderRequirements(stats = null, result = null) {
  const ch = S.challenge;
  const items = [];
  const a = S.assessment;
  if (ch.type === 'predict') items.push({ label: 'Choose your prediction', ok: S.prediction != null ? true : null }, { label: 'Run the program and compare', ok: result ? true : null });
  if (ch.type === 'observe') items.push({ label: 'Run the program to the end (try Step)', ok: result ? true : null });
  if (!ch.sandbox && Object.keys(S.target || {}).length) items.push({ label: 'Build the target shape', ok: result ? (a?.shape?.ok ?? result.ok) : null });
  if (ch.expectTail) items.push({ label: `The last lines give ${ch.expectTail.join(', ')}`, ok: result ? !!a?.output?.ok : null });
  if (ch.expectLast != null) items.push({ label: `The last line gives ${ch.expectLast}`, ok: result ? !!a?.output?.ok : null });
  if (ch.type === 'classify') items.push({ label: 'Answer every item', ok: S.classify && Object.keys(S.classify.choices).length === ch.classify.items.length ? true : null }, { label: 'Get them all right', ok: S.classify?.checked ? S.classify.allRight : null });
  if (ch.expectOutput) items.push({ label: `Print exactly: ${ch.expectOutput.join(' · ')}`, ok: result ? !!a?.output?.ok : null });
  const reqs = stats ? checkRequirements(ch, stats) : (ch.requires || []).map(r => ({ ...r, ok: null }));
  items.push(...reqs.map(r => ({ label: r.label, ok: r.ok })));
  if (ch.randomized) items.push({ label: 'Works on any starting world', ok: result && 'verified' in result ? result.verified : null });
  $('#requirements').innerHTML = items.map(i => `<li class="${i.ok === true ? 'ok' : i.ok === false ? 'fail' : ''}">${esc(i.label)}</li>`).join('');
}
function renderToolbox() {
  const lvl = S.challenge.level.id;
  $('#toolbox-items').innerHTML = API.filter(a => a.level <= lvl).map((a, i) =>
    `<button class="tool${a.level === lvl && lvl < LEVELS.at(-1).id ? ' new' : ''}" data-i="${API.indexOf(a)}"><pre>${esc(a.code)}</pre><p>${a.text}</p></button>`).join('');
}
$('#toolbox-items').addEventListener('click', e => {
  const b = e.target.closest('.tool'); if (!b || ta.readOnly) return;
  const snippet = API[Number(b.dataset.i)].code;
  const [s, end] = lineBounds(ta.selectionStart);
  const line = ta.value.slice(s, end), indent = line.match(/^\s*/)[0];
  const body = snippet.split('\n').map((l, i) => (i ? indent : '') + l).join('\n');
  if (line.trim()) insertText('\n' + indent + body, end, end);
  else insertText(indent + body, s, end);
});

function renderChallengeHeader() {
  const ch = S.challenge, kind = KINDS[ch.type];
  $('#challenge-level').textContent = tr('LEVEL {n} · {name}', { n: ch.level.id, name: t(ch.level.name).toUpperCase() });
  $('#challenge-type').className = 'type-badge k-' + ch.type;
  $('#challenge-type').innerHTML = `<b>${kind.mark}</b>${esc(t(kind.label).toUpperCase())} · ${esc(t(kind.tip))}`;
}
function loadChallenge(index) {
  if (index < 0 || index >= CHALLENGES.length) return;
  stop(true);
  S.index = index;
  const ch = S.challenge = CHALLENGES[index];
  store.set('index', index);
  history.replaceState(null, '', '#' + ch.id);
  renderChallengeHeader();
  $('#challenge-count').textContent = `${index + 1} / ${CHALLENGES.length}`;
  $('#challenge-title').textContent = ch.title;

  $('#challenge-goal').textContent = ch.goal;
  $('#challenge-brief').innerHTML = ch.brief;
  $('#hint').hidden = true; $('#hint').textContent = ch.hint || ''; $('#hint-button').textContent = 'Show hint';
  $('#hint-button').hidden = !ch.hint;
  $('#reset-code').hidden = ch.type === 'observe' || ch.type === 'predict';
  $('#reset-code').textContent = ch.type === 'parsons' ? 'Shuffle again ↺' : ch.type === 'classify' ? 'Clear answers ↺' : 'Reset code ↺';
  S.assessment = null;
  ta.value = readOnlyType(ch) ? ch.starter : store.get('code:' + ch.id, ch.starter);
  setupPredict(ch);
  setupParsons(ch);
  setupClassify(ch);
  S.breakpoints.clear();
  consoleEl.innerHTML = ''; S.outEl = null;
  logLine('c-info', `${t(ch.level.name)}: ${t(ch.level.intro)}`).dataset.levelIntro = ch.level.id;
  logLine('c-info', 'Press Run ▶ (F5) to run everything, or Step (F10) to go line by line.');
  setBuild('Ready');
  renderLevels(); renderToolbox(); renderRequirements();
  resetScene(true);
  updateStats();
  editor.scrollTo(0, 0);
}
$('#hint-button').onclick = () => { const h = $('#hint'); h.hidden = !h.hidden; $('#hint-button').textContent = h.hidden ? 'Show hint' : 'Hide hint'; };
$('#reset-code').onclick = () => {
  if (S.challenge.type === 'classify') { S.classify = null; store.set('classify:' + S.challenge.id, null); setupClassify(S.challenge); renderRequirements(); return; }
  if (S.challenge.type === 'parsons') { stop(true); S.parsons = null; store.set('parsons:' + S.challenge.id, null); setupParsons(S.challenge); return; }
  if (ta.value !== S.challenge.starter && !confirmReset()) return;
  stop(true);
  ta.value = S.challenge.starter; store.set('code:' + S.challenge.id, ta.value);
  onCodeInput();
};
function confirmReset() {
  const b = $('#reset-code');
  if (b.dataset.armed) { delete b.dataset.armed; b.textContent = 'Reset code ↺'; return true; }
  b.dataset.armed = '1'; b.textContent = 'Click again to reset';
  setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset code ↺'; }, 2500);
  return false;
}

// ─── Scene ───────────────────────────────────────────────────────────────────
function resetScene(newSeed = false) {
  const ch = S.challenge;
  if (newSeed || ch.randomized) S.seed = ch.randomized ? (Math.random() * 1e9) >>> 0 : 1;
  const { world, target } = prepare(ch, S.seed);
  S.world = world; S.target = target; S.runner = null; S.gen = null; S.event = null; S.result = null; S.assessment = null;
  view.update(world, { target, reset: true, labels: !!ch.labels, say: null, scene: [], trails: [], noDrone: !!ch.noDrone });
  $('#result').hidden = true;
  renderAll();
}
function renderProgress() {
  const chip = $('#progress-chip');
  if (S.challenge.sandbox || !Object.keys(S.target).length) { chip.textContent = S.world.blockCount() ? tr('{n} blocks', { n: S.world.blockCount() }) : ''; return; }
  const r = compare(S.world, S.target);
  const [a, b] = tr('{a} / {b} target blocks', { a: '\u0001', b: r.total }).split('\u0001');
  chip.innerHTML = `${esc(a)}<b>${r.correct}</b>${esc(b)}${r.wrong.length + r.extra.length ? ` · <span style="color:#ff9a9a">${esc(tr('{n} wrong', { n: r.wrong.length + r.extra.length }))}</span>` : ''}`;
}

// ─── Memory & execution panels ───────────────────────────────────────────────
// An array is drawn as a row of boxes with their positions; the item used in this step is highlighted.
function arrayHtml(type, arr) {
  if (arr === null) return '<span class="vl">null</span>';
  const el = elemOf(type), acc = S.runner?.access;
  const cells = arr.map((v, i) => {
    const hl = acc && acc.arr === arr && acc.i === i ? (acc.write ? ' write' : ' read') : '';
    const sw = el === 'Color' && v !== 'None' ? `<i class="swatch" style="background:${PALETTE[v]}"></i>` : '';
    return `<span class="cell${hl}"><b>${sw}${esc(el === 'Color' ? v : literal(v, el))}</b><i>${i}</i></span>`;
  }).join('');
  return `<span class="arr">${cells || '<span class="cell empty"><b>empty</b></span>'}</span>`;
}
// Objects: every class object gets a number and a colour; variables show an arrow to it.
const hue = id => (id * 137) % 360;
function refHtml(v) {
  if (v === null) return '<span class="vl ref null">null</span>';
  const name = isList(v) ? `List` : v.__cls.name;
  return `<span class="vl ref" style="--h:${hue(v.__id)}"><i>→</i>${esc(name)} #${v.__id}</span>`;
}
function valueHtml(type, value, assigned = true) {
  if (!assigned || value === undefined) return `<span class="vl unassigned">${esc(t('unassigned'))}</span>`;
  if (isObj(value) || isList(value) || (value === null && !isArr(type) && type !== 'string')) return refHtml(value);
  if (isStructVal(value)) return `<span class="vl struct">${esc(literal(value, type))}</span>`;
  if (isArr(type) && value && value.some?.(x => isObj(x) || x === null)) return `<span class="arr">${value.map((x, i) => `<span class="cell"><b>${refHtml(x)}</b><i>${i}</i></span>`).join('')}</span>`;
  if (isArr(type)) return arrayHtml(type, value);
  const cls = type === 'string' ? 'str' : ['int', 'float', 'double'].includes(type) ? 'num' : type === 'bool' ? 'bool' : '';
  const sw = type === 'Color' && value !== 'None' ? `<i class="swatch" style="background:${PALETTE[value]}"></i>` : '';
  return `<span class="vl ${cls}">${sw}${esc(literal(value, type))}</span>`;
}
const varRow = (type, name, value, { changed = false, assigned = true } = {}) =>
  `<div class="var${changed ? ' changed' : ''}${isArr(type) ? ' array' : ''}" data-no-i18n><span class="ty t-${type}">${esc(type || '?')}</span><span class="nm">${esc(name)}</span>${valueHtml(type, value, assigned)}</div>`;

function renderMemory() {
  const w = S.world, r = S.runner, lvl = S.challenge.level.id;
  const showDrone = COURSE === 'objects' ? !S.challenge.noDrone : lvl >= LV['First instructions'] || S.challenge.calcTowers;
  const full = COURSE === 'objects';
  let html = !showDrone ? '' : `<div class="scope object"><div class="scope-head"><span>drone</span><span>object · Drone</span></div>${varRow('int', 'X', w.drone.x)}${varRow('int', 'Z', w.drone.z)}${full || lvl >= LV.Loops ? varRow('int', 'Height', w.height()) : ''}${full || lvl >= LV.Conditions ? varRow('Color', 'Ground', w.groundColor()) : ''}</div>`;
  const scopes = r?.scopes || [];
  if (!scopes.length) html += '<p class="empty">Variables appear here while the program runs. Each one is a box with a <b>type</b>, a <b>name</b> and a <b>value</b>.</p>';
  else {
    // Each method call gets its own frame; the newest (running) frame is drawn on top.
    const frames = [];
    scopes.forEach((s, i) => { if (i === 0 || s.kind === 'method') frames.push([]); frames.at(-1).push(s); });
    const scopeHtml = (list, i, frameTop) => {
      if (i >= list.length) return '';
      const s = list[i], vars = [...s.vars.values()];
      const rows = vars.map(v => varRow(v.type, v.name, v.value, { changed: r.changed.has(v), assigned: v.assigned })).join('');
      const empty = !rows && i === 0 ? `<p class="empty">${s.kind === 'method' ? 'No parameters or variables.' : 'No variables yet.'}</p>` : '';
      let right = i === 0 ? 'scope' : 'inner scope';
      if (i === 0 && frames.length > 1) right = frameTop.active ? (s.kind === 'method' ? 'method · running' : 'running') : tr('waiting · line {n}', { n: frameTop.waitLine });
      const label = s.kind === 'method' ? `<b class="frame-name" data-no-i18n>${esc(s.label)}</b>` : esc(s.label);
      return `<div class="scope${i === 0 && s.kind === 'method' ? ' method' : ''}"><div class="scope-head"><span>${label}</span><span>${esc(right)}</span></div>${rows}${empty}${scopeHtml(list, i + 1, frameTop)}</div>`;
    };
    if (frames.length === 1) html += scopeHtml(frames[0], 0, { active: true });
    else {
      // With a call stack, the frames come first and the drone goes below them.
      const droneHtml = html; html = '';
      html += `<div class="stack-label">${esc(t('CALL STACK · newest on top'))}</div>`;
      for (let k = frames.length - 1; k >= 0; k--) {
        const active = k === frames.length - 1;
        html += `<div class="frame${active ? ' active' : ' waiting'}">${scopeHtml(frames[k], 0, { active, waitLine: frames[k + 1]?.[0].callLine })}</div>`;
      }
      html += droneHtml;
    }
  }
  html += heapHtml(r);
  const mem = $('#memory');
  mem.innerHTML = html;
  $('.memory').classList.toggle('finished', S.mode === 'finished');
}

// The heap: every object created with new, with the objects nothing points to any more faded out.
function heapHtml(r) {
  if (!r || !r.heap.length) return '';
  const reach = new Set(), stack = [];
  const push = v => { if ((isObj(v) || isList(v)) && !reach.has(v)) { reach.add(v); stack.push(v); } else if (isStructVal(v)) Object.values(v.f).forEach(push); else if (Array.isArray(v)) v.forEach(push); };
  for (const sc of r.scopes) { sc.vars.forEach(v => push(v.value)); push(sc.thisObj); }
  r.scene.forEach(push);
  while (stack.length) { const o = stack.pop(); if (isList(o)) o.items.forEach(push); else Object.values(o.f).forEach(push); }
  const acc = r.access;
  const cards = r.heap.filter(o => !(isObj(o) && o.__cls.name === 'Transform')).map(o => {
    const live = reach.has(o), hot = acc && acc.obj === o;
    let rows;
    if (isList(o)) rows = `<div class="var array" data-no-i18n><span class="ty">${esc(`List<${o.elem}>`)}</span><span class="nm">Count ${o.items.length}</span>${o.items.length ? `<span class="arr">${o.items.map((x, i) => `<span class="cell"><b>${isObj(x) || x === null ? refHtml(x) : esc(literal(x, o.elem))}</b><i>${i}</i></span>`).join('')}</span>` : '<span class="vl">empty</span>'}</div>`;
    else {
      const fields = [];
      for (const C of chainOf(o.__cls)) for (const [n, f] of C.fields) if (n !== 'transform') fields.push([n, f.type]);
      rows = fields.map(([n, ty]) => `<div class="var${hot && acc.field === n ? ' changed' : ''}" data-no-i18n><span class="ty t-${ty}">${esc(ty)}</span><span class="nm">${esc(n)}</span>${valueHtml(ty, o.f[n])}</div>`).join('');
      if (o.f.transform) rows = `<div class="var" data-no-i18n><span class="ty">Vector3</span><span class="nm">transform.position</span>${valueHtml('Vector3', o.f.transform.f.position)}</div>` + rows;
      if (!rows) rows = `<p class="empty">${esc(t('No fields.'))}</p>`;
    }
    return `<div class="scope heap-obj${live ? '' : ' garbage'}${hot ? ' hot' : ''}" style="--h:${hue(o.__id)}"><div class="scope-head"><span data-no-i18n>#${o.__id} ${esc(isList(o) ? `List<${o.elem}>` : o.__cls.name)}</span><span>${esc(t(live ? 'object' : 'no references'))}</span></div>${rows}</div>`;
  }).join('');
  return cards ? `<div class="stack-label">${esc(t('HEAP · objects made with new'))}</div>${cards}` : '';
}
function chainOf(I) { const out = []; const types = S.compiled?.ast?.types; while (I) { out.unshift(I); I = I.base ? types?.get(I.base) : null; } return out; }
function sceneNow() {
  const r = S.runner; if (!r) return [];
  return r.scene.map(o => { const p = o.f.transform?.f.position; return p ? { id: o.__id, x: p.f.x, y: p.f.y, z: p.f.z, color: typeof o.f.color === 'string' ? o.f.color : 'White' } : null; }).filter(Boolean);
}

function lineText(n) { return (ta.value.split('\n')[n - 1] || '').trim(); }
function renderNow() {
  const ev = S.event, el = $('#now');
  if (S.mode === 'idle' || !S.runner) { el.innerHTML = `<span class="label">${t('READY')}</span>${t('Press <b>Run</b> to run the whole program, or <b>Step</b> to run it one line at a time.')}`; return; }
  if (S.mode === 'error') { el.innerHTML = `<span class="label">${esc(tr('RUNTIME ERROR · LINE {n}', { n: S.runner.line }))}</span>${esc(t('The program stopped here. Read the Console to see why.'))}`; return; }
  if (S.mode === 'finished') { el.innerHTML = `<span class="label">${esc(tr('FINISHED · {n} STEPS', { n: S.runner.steps }))}</span>${esc(t('The program reached the last line. Its variables stay in memory only while it runs (faded).'))}`; return; }
  if (!ev) return;
  const lastRes = S.runner.results.at(-1);
  if (ev.kind === 'line' && lastRes?.steps && S.challenge.mode === 'calc') {
    const st = lastRes.steps;
    el.innerHTML = `<span class="label">${esc(tr('LINE {n} · HOW IT WAS WORKED OUT', { n: lastRes.line }))}</span><div class="eval">${st.map((p, i) => i === st.length - 1 ? `<span class="${lastRes.value}">${esc(p)}</span>` : `<span>${esc(p)}</span>`).join('<i>→</i>')}</div><div class="outcome">${esc(tr('Next: line {n}', { n: ev.line }))}</div>`;
    return;
  }
  if (ev.kind === 'frame') {
    el.innerHTML = `<span class="label">${esc(tr('FRAME {n} · {s} S', { n: ev.frame, s: ev.time.toFixed(2) }))}</span>${esc(t('Like Unity, the lab calls Update() on every object in the scene, once per frame. Time.deltaTime is the time between two frames (0.05 s).'))}`;
    return;
  }
  if (ev.kind === 'call') {
    el.innerHTML = `<span class="label">${esc(tr('METHOD CALL · LINE {n}', { n: ev.callLine }))}</span><code data-no-i18n>${esc(ev.text)}</code><div class="outcome">${esc(tr('The program jumps from line {a} into the method {m}. Its parameters get the values from the call.', { a: ev.callLine, m: ev.method }))}</div>`;
    return;
  }
  if (ev.kind === 'return') {
    const msg = ev.type === 'void'
      ? tr('{m} has finished. The program goes back to line {n} and carries on.', { m: ev.method, n: ev.line })
      : tr('{m} gives back {v}. On line {n}, that value takes the place of the call.', { m: ev.method, v: literal(ev.value, ev.type), n: ev.line });
    el.innerHTML = `<span class="label">${esc(tr('BACK TO LINE {n}', { n: ev.line }))}</span><code data-no-i18n>${esc(ev.type === 'void' ? ev.text : `${ev.text} → ${literal(ev.value, ev.type)}`)}</code><div class="outcome">${esc(msg)}</div>`;
    return;
  }
  if (ev.kind === 'cond') {
    const parts = ev.text.split('  →  ');
    const chips = parts.map((p, i) => i === parts.length - 1 ? `<span class="${ev.value}">${esc(p)}</span>` : `<span>${esc(p)}</span>`).join('<i>→</i>');
    el.innerHTML = `<span class="label">${esc(tr('CONDITION · LINE {n}', { n: ev.line }))}</span><div class="eval">${chips}</div><div class="outcome">${esc(t(ev.outcome))}</div>`;
  } else {
    let extra = '';
    if (ev.phase === 'init') extra = `<div class="outcome">${esc(t('Loop start: runs once, before the first turn.'))}</div>`;
    if (ev.phase === 'update') extra = `<div class="outcome">${esc(t('Loop step: runs after every turn, then the condition is checked again.'))}</div>`;
    el.innerHTML = `<span class="label">${esc(tr('NEXT · LINE {n}', { n: ev.line }))}</span><code>${esc(lineText(ev.line))}</code>${extra}`;
  }
}
function renderTrace() {
  const log = S.runner?.log || [];
  $('#trace').innerHTML = log.slice(-10).reverse().map(l => `<li><span class="tl">L${l.line}</span><span>${esc(l.text)}</span></li>`).join('');
  $('#step-count').textContent = `STEP ${S.runner?.steps || 0}`;
}
function renderControls() {
  const running = S.mode === 'running', paused = S.mode === 'paused';
  $('#run-label').textContent = running ? 'Pause' : paused ? 'Continue' : 'Run';
  $('#run').firstElementChild.textContent = running ? '❚❚' : '▶';
  $('#run').classList.toggle('paused', running);
  $('#stop').disabled = !(running || paused);
  const ch = S.challenge, parsons = ch.type === 'parsons';
  $('#step-into').hidden = !(COURSE === 'objects' || ch.level.id >= LV.Methods);
  ta.readOnly = running || paused || readOnlyType(ch) || parsons;
  const note = $('#editing-note');
  let html = '';
  if (parsons && S.parsonsView === 'code') html = running || paused ? 'Running the program built from your lines.' : 'This code was built from your lines. <button id="back-to-blocks" class="tiny-dark">← Edit the lines</button>';
  else if (running || paused) html = 'The program is running. Press <b>Stop</b> to edit the code.';
  else if (ch.type === 'classify') html = '';
  else if (readOnlyType(ch)) html = ch.type === 'predict' ? 'Read the code carefully: this program cannot be edited. Predict, then run.' : 'Read-only: follow the program with Step (F10).';
  note.innerHTML = html; note.hidden = !html;
  $('#back-to-blocks')?.addEventListener('click', () => { stop(true); showParsonsBlocks(); });
  $('#run').disabled = $('#step').disabled = ch.type === 'predict' && S.prediction == null && !(running || paused);
  if (ch.type === 'classify') { $('#run-label').textContent = 'Check'; $('#run').firstElementChild.textContent = '✓'; $('#step').disabled = true; }
  $('#drone-status').textContent = `DRONE (${S.world.drone.x}, ${S.world.drone.z})${S.world.height() ? ` · HEIGHT ${S.world.height()}` : ''}`;
}
function renderStrip() {
  const el = $('#strip'), ch = S.challenge;
  $('#viewport').classList.toggle('text-mode', !!(ch.textStrip || ch.lamps));
  el.hidden = !ch.textStrip;
  if (!ch.textStrip) return;
  const entry = [...(S.runner?.results || [])].reverse().find(r => r.textView && r.textView.text != null);
  if (!entry) { el.innerHTML = '<p class="strip-empty">Run the program: each text appears here as a row of characters with their positions.</p>'; return; }
  const v = entry.textView, text = String(v.text);
  const hi = i => v.from != null && i >= v.from && i < v.to;
  const cells = [...text].map((c, i) => `<div class="cell${hi(i) ? ' hi' : ''}"><span class="ch">${c === ' ' ? '␣' : esc(c)}</span><span class="ix">${i}</span></div>`).join('');
  const line = (ta.value.split('\n')[entry.line - 1] || '').trim();
  el.innerHTML = `<div class="strip-head"><code>${esc(line)}</code><span>→ <b>${esc(entry.text)}</b></span></div><div class="cells">${cells || '<span class="strip-empty">"" (empty text)</span>'}</div><div class="strip-foot">Length ${text.length} · positions 0 to ${Math.max(0, text.length - 1)}${v.count ? ' · Length counts all of them' : ''}</div>`;
}
function renderLamps() {
  const el = $('#lamps'), ch = S.challenge;
  el.hidden = !ch.lamps;
  if (!ch.lamps) return;
  $('#viewport').classList.add('text-mode');
  const bools = (S.runner?.results || []).filter(r => r.type === 'bool');
  if (!bools.length) { el.innerHTML = '<p class="strip-empty">Run the program: every true/false answer lights a lamp here.</p>'; return; }
  const last = bools.at(-1);
  const lines = ta.value.split('\n');
  const steps = last.steps ? `<div class="eval lamp-steps">${last.steps.map((p, i) => i === last.steps.length - 1 ? `<span class="${last.value}">${esc(p)}</span>` : `<span>${esc(p)}</span>`).join('<i>→</i>')}</div>` : '';
  el.innerHTML = `${steps}<div class="lamp-list">${bools.map(b => `<div class="lamp-row${b === last ? ' latest' : ''}"><span class="lamp ${b.value ? 'on' : 'off'}" aria-label="${b.value}"></span><code>${esc((lines[b.line - 1] || '').trim())}</code><b class="${b.value}">${b.value}</b></div>`).join('')}</div>`;
}
function renderAll({ instant = false } = {}) {
  view.update(S.world, { target: S.target, result: S.result, instant, labels: !!S.challenge.labels, say: S.runner?.output.at(-1)?.text ?? null, scene: sceneNow(), trails: S.runner?.history || [], noDrone: !!S.challenge.noDrone });
  renderCode(); renderMemory(); renderNow(); renderTrace(); renderOutput(); renderProgress(); renderControls(); renderStrip(); renderLamps();
  if (S.event && (S.mode === 'running' || S.mode === 'paused')) scrollToLine(S.event.line);
}

// ─── Challenge types ─────────────────────────────────────────────────────────
function readOnlyType(ch) { return ch.type === 'observe' || ch.type === 'predict' || ch.type === 'classify'; }

function setupPredict(ch) {
  S.prediction = null;
  const box = $('#predict');
  box.hidden = ch.type !== 'predict';
  if (ch.type !== 'predict') return;
  $('#predict-q').textContent = ch.question.prompt;
  $('#predict-options').innerHTML = ch.question.options.map(o => `<button class="option" role="radio" aria-checked="false" data-v="${esc(o)}">${esc(o)}</button>`).join('');
  $('#predict-note').textContent = 'Choose an answer, then press Run or Step.';
  box.classList.remove('locked');
}
$('#predict-options').addEventListener('click', e => {
  const b = e.target.closest('.option');
  if (!b || $('#predict').classList.contains('locked')) return;
  S.prediction = b.dataset.v;
  for (const o of document.querySelectorAll('#predict .option')) { o.classList.toggle('chosen', o === b); o.setAttribute('aria-checked', o === b); }
  $('#predict-note').textContent = 'Now run the program and see if you were right.';
  renderRequirements(); renderControls();
});
function lockPredict(locked, result = null) {
  const box = $('#predict');
  box.classList.toggle('locked', locked);
  for (const o of document.querySelectorAll('#predict .option')) {
    o.classList.toggle('right', !!result && o.dataset.v === result.actual);
    o.classList.toggle('wrong', !!result && o.dataset.v === result.chosen && !result.ok);
  }
  if (result) $('#predict-note').textContent = result.ok ? 'Correct! Change nothing and try the next one.' : 'The green answer is what really happened. Step through it to see why.';
  else if (!locked && S.prediction != null) $('#predict-note').textContent = 'Now run the program and see if you were right.';
}

// Parsons: lines to order. items = all lines (correct + distractors), shuffled once.
function shuffleSeeded(arr, seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function setupParsons(ch) {
  const panel = $('.code-panel');
  panel.classList.toggle('is-parsons', ch.type === 'parsons');
  if (ch.type !== 'parsons') { S.parsons = null; $('#parsons').hidden = true; panel.classList.remove('show-blocks'); return; }
  const items = [...ch.parsons.lines, ...(ch.parsons.distractors || [])];
  const saved = store.get('parsons:' + ch.id, null);
  if (saved && saved.program && saved.pool && saved.program.length + saved.pool.length === items.length) S.parsons = { items, ...saved };
  else S.parsons = { items, program: [], pool: shuffleSeeded(items.map((_, i) => i), ch.id + (Math.random() * 1e6 | 0)) };
  showParsonsBlocks();
}
function saveParsons() { store.set('parsons:' + S.challenge.id, { program: S.parsons.program, pool: S.parsons.pool }); }
function showParsonsBlocks() {
  S.parsonsView = 'blocks';
  $('#parsons').hidden = false;
  $('.code-panel').classList.add('show-blocks');
  renderParsons();
  if (S.challenge && S.world) renderControls();
}
function showParsonsCode() {
  S.parsonsView = 'code';
  $('#parsons').hidden = true;
  $('.code-panel').classList.remove('show-blocks');
}
function renderParsons() {
  const P = S.parsons;
  let depth = 0;
  const prog = P.program.map((i, pos) => {
    const t = P.items[i].trim();
    if (t.startsWith('}')) depth = Math.max(0, depth - 1);
    const d = depth;
    if (t.endsWith('{')) depth++;
    return `<li class="pline" data-i="${i}" data-pos="${pos}" style="--depth:${d}"><span class="grip" aria-hidden="true">⋮⋮</span><code>${highlight(t, { comment: false })}</code><span class="pactions"><button class="mv" data-dir="-1" aria-label="Move up">↑</button><button class="mv" data-dir="1" aria-label="Move down">↓</button><button class="rm" aria-label="Remove line">×</button></span></li>`;
  }).join('');
  $('#parsons-program').innerHTML = prog || '<li class="pempty">Click the lines on the right to build your program here.</li>';
  $('#parsons-pool').innerHTML = P.pool.map(i => `<li><button class="pline pool-line" data-i="${i}"><code>${highlight(P.items[i].trim(), { comment: false })}</code></button></li>`).join('') || '<li class="pempty">All lines are in your program.</li>';
  $('#code-stats').textContent = `${P.program.length} LINE${P.program.length === 1 ? '' : 'S'}`;
}
$('#parsons-pool').addEventListener('click', e => {
  const b = e.target.closest('.pool-line'); if (!b || S.mode === 'running' || S.mode === 'paused') return;
  const i = Number(b.dataset.i);
  S.parsons.pool = S.parsons.pool.filter(x => x !== i); S.parsons.program.push(i);
  saveParsons(); renderParsons();
});
$('#parsons-program').addEventListener('click', e => {
  const li = e.target.closest('.pline'); if (!li) return;
  const P = S.parsons, pos = Number(li.dataset.pos);
  if (e.target.closest('.rm')) { const [i] = P.program.splice(pos, 1); P.pool.push(i); }
  else if (e.target.closest('.mv')) {
    const to = pos + Number(e.target.closest('.mv').dataset.dir);
    if (to < 0 || to >= P.program.length) return;
    [P.program[pos], P.program[to]] = [P.program[to], P.program[pos]];
  } else return;
  saveParsons(); renderParsons();
});
// Drag to reorder with pointer events (works with mouse and touch)
$('#parsons-program').addEventListener('pointerdown', e => {
  const li = e.target.closest('.pline');
  if (!li || e.target.closest('button') || e.button > 0) return;
  e.preventDefault();
  const list = $('#parsons-program'), from = Number(li.dataset.pos);
  const rows = [...list.querySelectorAll('.pline')];
  const mids = rows.map(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
  const y0 = e.clientY;
  let to = from;
  li.classList.add('dragging');
  li.setPointerCapture(e.pointerId);
  const move = ev => {
    li.style.transform = `translateY(${ev.clientY - y0}px)`;
    to = mids.filter(m => m < ev.clientY).length;
    if (to > from) to--;
    rows.forEach((r, k) => r.classList.toggle('drop-before', k === (to >= from ? to + 1 : to) && k !== from));
  };
  const up = () => {
    li.removeEventListener('pointermove', move); li.removeEventListener('pointerup', up); li.removeEventListener('pointercancel', up);
    const P = S.parsons;
    if (to !== from) { const [i] = P.program.splice(from, 1); P.program.splice(to, 0, i); saveParsons(); }
    renderParsons();
  };
  li.addEventListener('pointermove', move); li.addEventListener('pointerup', up); li.addEventListener('pointercancel', up);
});

// Classify: choose a category for each item; the real compiler (or a rule) decides.
function setupClassify(ch) {
  const panel = $('.code-panel');
  const on = ch.type === 'classify';
  panel.classList.toggle('show-classify', on);
  $('#classify').hidden = !on;
  if (!on) { S.classify = null; return; }
  const saved = store.get('classify:' + ch.id, null);
  S.classify = { choices: saved?.choices || {}, checked: false, allRight: false, verdicts: {} };
  renderClassify();
}
function renderClassify() {
  const ch = S.challenge, C = S.classify;
  $('#classify-list').innerHTML = `<p class="classify-intro">${esc(KINDS.classify.tip)}</p>` + ch.classify.items.map((it, i) => {
    const v = C.verdicts[i];
    const state = v ? (v.ok ? ' right' : ' wrong') : '';
    return `<div class="crow${state}"><code class="ctext">${highlight(it.text, { comment: false })}</code>
      <div class="cbtns" role="radiogroup">${ch.classify.categories.map(c => `<button class="cbtn${C.choices[i] === c ? ' chosen' : ''}" data-i="${i}" data-c="${esc(c)}" role="radio" aria-checked="${C.choices[i] === c}">${esc(c)}</button>`).join('')}</div>
      ${v ? `<p class="cwhy">${v.ok ? '✓' : '✗ ' + esc(tr('Answer: {a}.', { a: t(v.answer) }))} ${esc(whyText(v))}</p>` : ''}</div>`;
  }).join('');
}
$('#classify-list').addEventListener('click', e => {
  const b = e.target.closest('.cbtn'); if (!b) return;
  const i = Number(b.dataset.i);
  S.classify.choices[i] = b.dataset.c;
  delete S.classify.verdicts[i];
  S.classify.checked = false;
  store.set('classify:' + S.challenge.id, { choices: S.classify.choices });
  renderClassify(); renderRequirements();
});
function whyText(v) {
  const why = t(v.why) || '';
  return `${why}${why && !/[.!?]$/.test(why) ? '.' : ''}${v.hint ? ' ' + t(v.hint) : ''}`;
}
function checkClassify() {
  const ch = S.challenge, C = S.classify, items = ch.classify.items;
  consoleEl.innerHTML = ''; S.outEl = null;
  const missing = items.filter((_, i) => !C.choices[i]).length;
  if (missing) {
    logLine('c-info', `Choose an answer for every item first (${missing} left).`);
    showResult('info', 'Not finished', `Choose an answer for every item first: ${missing} left.`, false);
    return;
  }
  let right = 0;
  items.forEach((it, i) => {
    const j = judge(ch.classify.judge, it.text);
    const ok = C.choices[i] === j.answer;
    if (ok) right++;
    C.verdicts[i] = { ok, answer: j.answer, why: j.why, hint: j.hint };
    if (ch.classify.judge !== 'style') logLine(ok ? 'c-ok' : 'c-info', `${ok ? '✓' : '✗'} ${it.text}  →  ${t(j.answer)}${j.answer === 'Error' || j.answer === 'Invalid' ? ` · ${whyText(j)}` : ''}`).dataset.noI18n = '';
  });
  C.checked = true; C.allRight = right === items.length;
  setBuild(`${right} / ${items.length} right`, C.allRight ? 'ok' : 'bad');
  renderClassify(); renderRequirements();
  if (C.allRight) {
    S.done.add(ch.id); store.set('done', [...S.done]); renderLevels();
    showResult('ok', 'All correct', () => `${tr('{a} of {b}.', { a: right, b: items.length })} ${t(ch.classify.judge === 'style' ? 'In C#: camelCase for variables, PascalCase for methods and types.' : 'The compiler agrees with every answer.')}`, S.index < CHALLENGES.length - 1);
  } else {
    showResult('bad', tr('{a} of {b} right', { a: right, b: items.length }), 'Read the explanation under each red item, change your answer and press Check again.', false);
  }
}

// ─── Running ─────────────────────────────────────────────────────────────────
function build() {
  if (S.challenge.type === 'parsons') {
    if (!S.parsons.program.length) { logLine('c-info', 'Add some lines to your program first.'); return false; }
    ta.value = assembleParsons(S.parsons.program.map(i => S.parsons.items[i]));
    showParsonsCode();
  }
  if (S.challenge.type === 'predict') lockPredict(true);
  S.errorLines.clear();
  consoleEl.innerHTML = ''; S.outEl = null;
  const compiled = compile(ta.value, { mode: S.challenge.mode });
  S.compiled = compiled;
  logLine('c-info', 'Build started…');
  for (const w of compiled.warnings) logProblem(w, 'warning');
  if (!compiled.ok) {
    for (const e of compiled.errors) { logProblem(e, 'error'); S.errorLines.set(e.line, e); }
    const n = compiled.errors.length;
    logLine('c-info', `Build failed · ${n} error${n === 1 ? '' : 's'}. Nothing was run.`);
    setBuild(`Build failed · ${n} error${n === 1 ? '' : 's'}`, 'bad');
    S.mode = 'error';
    renderRequirements(compiled.stats, null);
    resetSceneKeepMode();
    return false;
  }
  setBuild('Build succeeded', 'ok');
  logLine('c-ok', `Build succeeded · ${compiled.warnings.length} warning${compiled.warnings.length === 1 ? '' : 's'}`);
  S.outEl = document.createElement('div'); S.outEl.dataset.noI18n = ''; consoleEl.append(S.outEl);
  resetScene();
  S.runner = new Runner(compiled.ast, S.world, { calcTowers: !!S.challenge.calcTowers, frames: S.challenge.frames ?? 60 });
  S.gen = S.runner.run();
  return true;
}
function resetSceneKeepMode() { const m = S.mode; resetScene(); S.mode = m; renderAll(); }

function advance() {
  S.prevLine = S.event?.line;
  try {
    const r = S.gen.next();
    if (r.done) { finish(); return false; }
    S.event = r.value;
    return true;
  } catch (e) {
    const err = e instanceof CSharpError ? e : new CSharpError({ kind: 'runtime', exception: 'LabException', message: String(e?.message || e), line: S.runner?.line || 1 });
    if (!(e instanceof CSharpError)) console.error(e);
    fail(err);
    return false;
  }
}
const hitBreakpoint = () => S.event && S.breakpoints.has(S.event.line) && S.event.line !== S.prevLine;
function clearTimer() { clearTimeout(S.timer); S.timer = null; }
function loop() {
  clearTimer();
  if (S.mode !== 'running') return;
  const ms = SPEEDS[S.speed].ms;
  if (ms === 0) {
    for (let n = 0; n < 3000; n++) {
      if (!advance()) return;
      if (hitBreakpoint()) { S.mode = 'paused'; renderAll(); return; }
    }
    renderAll({ instant: true });
    S.timer = setTimeout(loop, 0);
    return;
  }
  if (!advance()) return;
  if (hitBreakpoint()) S.mode = 'paused';
  renderAll();
  if (S.mode === 'running') S.timer = setTimeout(loop, ms);
}
function needsPrediction() {
  if (S.challenge.type !== 'predict' || S.prediction != null || S.mode === 'running' || S.mode === 'paused') return false;
  const box = $('#predict'); box.classList.remove('nudge'); void box.offsetWidth; box.classList.add('nudge');
  return true;
}
function run() {
  if (S.challenge.type === 'classify') { checkClassify(); return; }
  if (needsPrediction()) return;
  if (S.mode === 'running') { S.mode = 'paused'; clearTimer(); renderAll(); return; }
  if (S.mode === 'paused') { S.mode = 'running'; loop(); return; }
  if (!build()) return;
  S.mode = 'running';
  loop();
}
// Step (F10) steps over method calls, like Visual Studio; Step Into (F11) follows the program into them.
function step(into = false) {
  if (S.challenge.type === 'classify') return;
  if (needsPrediction()) return;
  if (S.mode === 'running') { S.mode = 'paused'; clearTimer(); renderAll(); return; }
  if (S.mode !== 'paused') { if (!build()) return; S.mode = 'paused'; if (advance()) renderAll(); return; }
  const d0 = S.event?.depth ?? 0;
  if (!advance()) return;
  if (!into) {
    for (let n = 0; (S.event.depth ?? 0) > d0 && n < 100000; n++) {
      if (!advance()) return;
      if (hitBreakpoint()) break;
    }
  }
  renderAll();
}
function stop(silent = false) {
  clearTimer();
  const wasActive = S.mode === 'running' || S.mode === 'paused';
  if (S.gen) { try { S.gen.return(); } catch { /* ignore */ } }
  S.mode = 'idle';
  if (S.challenge) {
    if (wasActive && !silent) logLine('c-info', 'Program stopped.');
    if (S.challenge.type === 'predict') lockPredict(false);
    resetScene();
  }
}
function finish() {
  S.mode = 'finished';
  const r = S.runner, ch = S.challenge;
  logLine('c-info', `Program finished · ${r.steps} steps${S.world.actions ? ` · ${S.world.actions} drone actions` : ''}`);
  const instant = SPEEDS[S.speed].ms === 0;
  if (ch.sandbox) { S.result = null; showResult('ok', 'Program finished', () => tr('{n} blocks built in {s} steps.', { n: S.world.blockCount(), s: r.steps }), false); renderRequirements(S.compiled.stats, null); renderAll({ instant }); return; }
  const a = S.assessment = assess(ch, { compiled: S.compiled, runner: r, world: S.world, target: S.target, prediction: S.prediction });
  const shape = a.shape || { ok: true, missing: [], wrong: [], extra: [], total: 0 };
  if (a.ok && ch.randomized) {
    const seeds = [1, 2, 3].map(() => (Math.random() * 1e9) >>> 0);
    const checks = verifySeeds(ch, ta.value, seeds);
    shape.verified = checks.every(c => c.ok);
    shape.verifiedCount = checks.filter(c => c.ok).length;
  }
  S.result = shape;
  renderRequirements(S.compiled.stats, shape);
  const success = a.ok && (!ch.randomized || shape.verified);
  const next = S.index < CHALLENGES.length - 1;
  if (success) { S.done.add(ch.id); store.set('done', [...S.done]); renderLevels(); }
  if (ch.type === 'predict') {
    const p = a.prediction;
    if (p.ok) { S.correct.add(ch.id); store.set('correct', [...S.correct]); renderLevels(); }
    showResult(p.ok ? 'ok' : 'info', p.ok ? 'You predicted it!' : 'Surprise!',
      () => `${p.ok ? tr('Yes: {v}.', { v: t(p.actual) }) : tr('You said {a}, but the answer is {b}.', { a: t(p.chosen), b: t(p.actual) })} ${t(ch.question.explain)}`, next);
    lockPredict(true, p);
  } else if (ch.type === 'observe') {
    showResult('ok', 'Well observed', () => tr('The program ran {n} steps, one line at a time, from top to bottom. Try it again with Step and watch the Memory and Execution panels.', { n: r.steps }), next);
  } else if (success) {
    const stmts = S.compiled.stats.statements;
    showResult('ok', 'Challenge complete', () => (shape.total ? tr('{n} blocks in {s} steps with {i} instructions.', { n: shape.total, s: r.steps, i: stmts }) : tr('Done in {s} steps with {i} instructions.', { s: r.steps, i: stmts })) + (ch.randomized ? ' ' + t('It also worked on 3 other random worlds.') : ''), next);
  } else {
    const failed = a.requirements.filter(q => !q.ok).map(q => q.label);
    const text = () => {
      if (a.ok && ch.randomized && !shape.verified) return tr('It works on this world, but only on {n} of 3 other random worlds. Read the world with the drone instead of using fixed numbers.', { n: shape.verifiedCount });
      const out = [];
      const bits = [];
      if (shape.missing.length) bits.push(tr('{n} missing', { n: shape.missing.length }));
      if (shape.wrong.length) bits.push(tr('{n} wrong color', { n: shape.wrong.length }));
      if (shape.extra.length) bits.push(tr('{n} extra', { n: shape.extra.length }));
      if (bits.length) out.push(tr('Blocks: {bits}. Ghost blocks show what is still missing; red outlines mark wrong blocks.', { bits: bits.join(' · ') }));
      const o = a.output;
      if (o && !o.ok) {
        if (o.tail) out.push(tr('The last lines should give {want}, but they give {got}.', { want: o.want.join(', '), got: o.got.join(', ') || t('nothing') }));
        else if (o.last) out.push(tr('The last line should give {want}, but it gives {got}.', { want: o.want[0], got: o.got[0] || t('nothing') }));
        else out.push(tr('Expected the Console to show "{want}" but it showed "{got}".', { want: o.want.join(' / '), got: o.got.join(' / ') || t('(nothing)') }));
      }
      if (a.scene && !a.scene.ok) out.push(t(a.scene.message));
      if (failed.length) out.push(tr('Still to do: {list}.', { list: failed.map(t).join(', ') }));
      return out.join(' ');
    };
    showResult('bad', a.ok || shape.ok ? 'Almost there' : 'Not yet', text, false);
  }
  renderAll({ instant });
}
function fail(err) {
  S.mode = 'error';
  S.errorLines.set(err.line, err);
  logProblem(err, 'error');
  showResult('bad', tr('Runtime error on line {n}', { n: err.line }), () => t(err.message), false);
  renderAll();
}
function showResult(kind, title, text, next) {
  S.lastResult = { kind, title, text, next };
  const el = $('#result');
  const body = typeof text === 'function' ? text() : t(text);
  el.className = 'result ' + kind;
  el.innerHTML = `<span class="result-icon">${kind === 'ok' ? '✓' : kind === 'info' ? '?' : '!'}</span><p class="result-text"><strong>${esc(t(title))}</strong>${esc(body)}</p>${next ? `<button class="next">${esc(t('Next challenge →'))}</button>` : ''}<button class="tiny close" aria-label="Close">×</button>`;
  el.hidden = false;
  el.querySelector('.next')?.addEventListener('click', () => loadChallenge(S.index + 1));
  el.querySelector('.close').addEventListener('click', () => { el.hidden = true; });
}

$('#run').onclick = run;
$('#step').onclick = () => step(false);
$('#step-into').onclick = () => step(true);
$('#stop').onclick = () => stop();
document.addEventListener('keydown', e => {
  if (e.key === 'F5' && e.shiftKey) { e.preventDefault(); stop(); }
  else if (e.key === 'F5' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); run(); }
  else if (e.key === 'F10') { e.preventDefault(); step(false); }
  else if (e.key === 'F11') { e.preventDefault(); step(true); }
});
const speed = $('#speed');
function applySpeed() {
  speed.value = S.speed;
  $('#speed-label').textContent = SPEEDS[S.speed].label;
  view.animMs = Math.min(240, Math.max(0, SPEEDS[S.speed].ms * 0.75));
}
speed.oninput = () => { S.speed = Number(speed.value); store.set('speed', S.speed); applySpeed(); };
applySpeed();

$('#help').onclick = () => $('#help-dialog').showModal();
for (const b of document.querySelectorAll('.dialog-close,.dialog-close-action')) b.onclick = () => b.closest('dialog').close();
new ResizeObserver(() => renderCode()).observe(editor);

window.addEventListener('hashchange', () => {
  const i = CHALLENGES.findIndex(c => c.id === location.hash.slice(1));
  if (i >= 0 && i !== S.index) loadChallenge(i);
});

if (window.matchMedia('(max-width: 760px)').matches) $('#toolbox').open = false;

// Language change: redraw the texts that the lab builds itself.
onLangChange(() => {
  renderChallengeHeader();
  renderLevels(); renderToolbox(); renderRequirements(S.compiled?.stats || null, S.result);
  if (S.challenge.type === 'classify') renderClassify();
  if (S.challenge.type === 'parsons' && S.parsonsView === 'blocks') renderParsons();
  renderAll();
  if (S.lastResult && !$('#result').hidden) { const r = S.lastResult; showResult(r.kind, r.title, r.text, r.next); }
});

// ─── Start ───────────────────────────────────────────────────────────────────
const fromHash = CHALLENGES.findIndex(c => c.id === location.hash.slice(1));
loadChallenge(fromHash >= 0 ? fromHash : Math.min(store.get('index', 0), CHALLENGES.length - 1));
if (!store.get('seen-help', false)) { store.set('seen-help', true); }
