// NLA Lab · the Fundamentals section: tabs, an Extrapolation example, a Blending calculator and the map of every control.
import * as N from './nla.js?v=2';
import { helpTitle, HELP, HELP_GROUPS } from './help.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=2';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 2) => (+v).toFixed(d).replace(/\.?0+$/, '') || '0';

// ─── Tabs ───────────────────────────────────────────────────────────────────
const KEY = 'carrot-revolt-nla:fund-tab';
function showTab(name) {
  document.querySelectorAll('#fund-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.fund-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
  try { localStorage.setItem(KEY, name); } catch { /* storage unavailable */ }
  if (name === 'extrap') drawExtrap();
}
$('#fund-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
// Links like <a href="#fundamentals" data-open="save"> open a tab.
document.addEventListener('click', e => { const a = e.target.closest('[data-open]'); if (a) showTab(a.dataset.open); });

// ─── Extrapolation example ──────────────────────────────────────────────────
// A real NLA state from nla.js: strips A (20–50) and B (70–95) in one track, and an optional track below.
const CH = 'Spine.rx';
function demoState() {
  const st = N.newState({ action: null, range: [1, 120] });
  st.actions.A = { name: 'A', fake: true, curves: { [CH]: [[1, 10], [16, 40], [31, 10]] } };
  st.actions.B = { name: 'B', fake: true, curves: { [CH]: [[1, -20], [13, -40], [26, -20]] } };
  st.actions.Base = { name: 'Base', fake: true, curves: { [CH]: [[1, 22], [120, 22]] } };
  if ($('#ex-below').checked) { const tb = N.makeTrack(st); tb.strips.push(N.makeStrip(st, 'Base', 1, { extrap: 'HOLD' })); st.tracks.push(tb); }
  const t0 = N.makeTrack(st);
  t0.strips.push(N.makeStrip(st, 'A', 20, { extrap: $('#ex-a').value }), N.makeStrip(st, 'B', 70, { extrap: $('#ex-b').value }));
  st.tracks.push(t0); N.validate(st);
  return st;
}
// Where the value of a frame comes from: 'A', 'B', 'A·held', 'B·held', 'below' or 'rest'.
function sourceAt(st, f) {
  const top = st.tracks[st.tracks.length - 1], c = N.trackSample(st, top, f);
  if (c) return c.strip.action + (c.held ? '·held' : '');
  return st.tracks.length > 1 ? 'below' : 'rest';
}
const COLORS = { A: '#ffae3d', B: '#5fb4ff', 'A·held': '#b98432', 'B·held': '#3f7fb8', below: '#9ad06b', rest: '#9a9a9a' };
function drawExtrap() {
  const box = $('#ex-svg'); if (!box || box.closest('.fund-panel').hidden) return;
  const st = demoState(), W = 760, H = 250, L = 46, R = 12, T = 64, B = 30, f0 = 1, f1 = 120;
  const x = f => L + (f - f0) / (f1 - f0) * (W - L - R), y = v => T + (50 - v) / 100 * (H - T - B);
  // Track lanes.
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('Value of one channel over time'))}">`;
  const lanes = st.tracks.map((tk, i) => ({ tk, y: 8 + (st.tracks.length - 1 - i) * 24 }));
  for (const { tk, y: ly } of lanes) {
    svg += `<rect x="${L}" y="${ly}" width="${W - L - R}" height="20" fill="#2b2b2b"/>`;
    tk.strips.forEach((s, i) => {
      const col = s.action === 'Base' ? '#6f8f50' : s.action === 'A' ? '#b3802d' : '#3c6f9e';
      const first = i === 0, next = tk.strips[i + 1];
      if (s.extrap === 'HOLD' && first) svg += `<rect x="${L}" y="${ly + 4}" width="${x(s.start) - L}" height="12" fill="${col}" opacity=".35"/>`;
      if (s.extrap !== 'NOTHING') { const e = next ? x(next.start) : W - R; svg += `<rect x="${x(s.end)}" y="${ly + 4}" width="${Math.max(0, e - x(s.end))}" height="12" fill="${col}" opacity=".35"/>`; }
      svg += `<rect x="${x(s.start)}" y="${ly + 1}" width="${x(s.end) - x(s.start)}" height="18" rx="3" fill="${col}" stroke="#000"/><text x="${x(s.start) + 6}" y="${ly + 14}" fill="#fff" font-size="11" font-weight="700">${s.action === 'Base' ? esc(t('Track below')) : s.action}</text>`;
    });
  }
  // Axes and grid.
  svg += `<line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" stroke="#555" stroke-dasharray="3 3"/><text x="${L - 6}" y="${y(0) + 4}" text-anchor="end" fill="#999" font-size="10">0°</text><text x="${L - 6}" y="${y(40) + 4}" text-anchor="end" fill="#999" font-size="10">40°</text><text x="${L - 6}" y="${y(-40) + 4}" text-anchor="end" fill="#999" font-size="10">−40°</text>`;
  for (let f = 10; f <= 120; f += 10) svg += `<line x1="${x(f)}" y1="${T}" x2="${x(f)}" y2="${H - B}" stroke="#ffffff10"/><text x="${x(f)}" y="${H - 12}" text-anchor="middle" fill="#999" font-size="10">${f}</text>`;
  // The curve, coloured by where each frame gets its value.
  const regions = []; let cur = null;
  for (let f = f0; f <= f1; f += 0.5) {
    const src = sourceAt(st, f), v = N.evaluate(st, f).pose[CH];
    if (!cur || cur.src !== src) { if (cur) cur.pts.push([f, v]); cur = { src, pts: [], a: f }; regions.push(cur); }
    cur.pts.push([f, v]); cur.b = f;
  }
  for (const r of regions) svg += `<polyline fill="none" stroke="${COLORS[r.src]}" stroke-width="${r.src.includes('held') ? 3 : 2.5}" ${r.src.includes('held') ? 'stroke-dasharray="6 4"' : ''} points="${r.pts.map(([f, v]) => `${x(f).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
  svg += '</svg>';
  box.innerHTML = svg;
  // What happens in each region, in words.
  const say = {
    A: 'A plays its keys.', B: 'B plays its keys.',
    'A·held': 'A holds a pose (its Extrapolation).', 'B·held': 'B holds its last pose (Hold Forward).',
    below: 'Nothing here: the track below shows through.', rest: 'Nothing here: the channel goes back to the rest pose (0°).',
  };
  $('#ex-legend').innerHTML = regions.filter(r => r.b - r.a >= 0.5).map(r => `<li><i style="background:${COLORS[r.src]}"></i><b>${esc(tr('Frames {a}–{b}', { a: Math.ceil(r.a), b: Math.floor(r.b) }))}</b> ${esc(t(say[r.src]))}</li>`).join('');
}
['#ex-a', '#ex-b', '#ex-below'].forEach(s => $(s).addEventListener('change', drawExtrap));

// ─── Blending calculator ────────────────────────────────────────────────────
const MODES = [
  ['REPLACE', 'Replace', 'below + (strip − below) × influence'],
  ['COMBINE', 'Combine', { rot: 'below + (strip − 0) × influence', scale: 'below × strip ^ influence' }],
  ['ADD', 'Add', 'below + strip × influence'],
  ['SUBTRACT', 'Subtract', 'below − strip × influence'],
  ['MULTIPLY', 'Multiply', 'below + (below × strip − below) × influence'],
];
const RANGES = { rot: { min: -90, max: 90, step: 1, below: 20, strip: 30 }, scale: { min: 0.5, max: 2, step: 0.01, below: 1, strip: 1.06 } };
let kind = 'rot';
function setRanges() {
  const r = RANGES[kind];
  for (const id of ['bl-below', 'bl-strip']) { const el = $('#' + id); el.min = r.min; el.max = r.max; el.step = r.step; el.value = id === 'bl-below' ? r.below : r.strip; }
}
function drawBlend() {
  const below = +$('#bl-below').value, v = +$('#bl-strip').value, inf = +$('#bl-inf').value, ch = kind === 'rot' ? 'Spine.rx' : 'Chest.s', d = kind === 'rot' ? 0 : 2;
  const unit = kind === 'rot' ? '°' : '';
  $('#bl-below-o').textContent = fmt(below, d) + unit; $('#bl-strip-o').textContent = fmt(v, d) + unit; $('#bl-inf-o').textContent = fmt(inf, 2);
  const lo = kind === 'rot' ? -180 : 0, hi = kind === 'rot' ? 180 : 4;
  $('#bl-table tbody').innerHTML = MODES.map(([m, name, f]) => {
    const r = N.blendValue(below, v, m, inf, ch), w = Math.max(0, Math.min(100, (r - lo) / (hi - lo) * 100));
    const formula = typeof f === 'string' ? f : f[kind];
    return `<tr><th data-no-i18n>${name}</th><td><code data-no-i18n>${esc(formula)}</code></td><td><span class="bd-bar"><u style="width:${w}%"></u></span><b>${fmt(r, kind === 'rot' ? 1 : 3)}${unit}</b></td></tr>`;
  }).join('');
  $('#bl-note').textContent = t(kind === 'rot'
    ? 'For rotations and locations Combine gives the same result as Add. Replace ignores the value below when the influence is 1.'
    : 'For scale the difference matters: Add adds the strip to the scale below (1 + 1.06 = 2.06, the chest doubles); Combine multiplies (1 × 1.06).');
}
$('#bl-kind').addEventListener('change', e => { kind = e.target.value; setRanges(); drawBlend(); });
['#bl-below', '#bl-strip', '#bl-inf'].forEach(s => $(s).addEventListener('input', drawBlend));

// ─── Every control ──────────────────────────────────────────────────────────
function drawControls() {
  $('#controls-map').innerHTML = HELP_GROUPS.map(g => `<section><h3 data-no-i18n>${esc(g)}</h3><dl>${Object.values(HELP).filter(h => h.group === g).map(h => `<div><dt data-no-i18n>${esc(helpTitle(h.title))}</dt><dd data-no-i18n>${t(h.body)}</dd></div>`).join('')}</dl></section>`).join('');
}

// ─── Start ──────────────────────────────────────────────────────────────────
let start = 'vocab'; try { start = localStorage.getItem(KEY) || 'vocab'; } catch { /* storage unavailable */ }
setRanges(); drawBlend(); drawControls(); showTab(start);
onLangChange(() => { drawBlend(); drawControls(); drawExtrap(); });
