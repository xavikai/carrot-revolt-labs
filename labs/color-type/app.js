// Color & Type Lab: a Figma-style editor for the page of a film festival.
import * as C from './color.js?v=1';
import * as T from './type.js?v=1';
import * as D from './doc.js?v=1';
import { STAGES, TARGET, LINE_PARTS, LINE_NAMES, LINE_ABOUT, cvdDistance, gamutOk, richBlackOk } from './stages.js?v=1';
import { t, tr, onLangChange, addDictionary } from '../../i18n.js';
import dictionary from './i18n.js?v=1';
addDictionary(dictionary);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('carrot-revolt-colortype:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('carrot-revolt-colortype:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stageIndex: Math.min(store.get('stage', 0), STAGES.length - 1), step: 0, st: null, flags: {}, undo: [], redo: [],
  done: store.get('done', {}), sel: null, hover: false,
};
const stage = () => STAGES[S.stageIndex];
const step = () => stage().steps[S.step];
const locked = k => (step().lock || []).includes(k);

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
  S.st = saved?.st?.fills ? saved.st : step().start();
  S.flags = saved?.flags || {};
  S.undo = []; S.redo = []; S.sel = step().focus || null;
}
function pushUndo() { S.undo.push(JSON.stringify({ st: S.st, flags: S.flags })); if (S.undo.length > 120) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) return msg('Nothing to undo.'); S.redo.push(JSON.stringify({ st: S.st, flags: S.flags })); ({ st: S.st, flags: S.flags } = JSON.parse(S.undo.pop())); changed(); msg('Undo'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify({ st: S.st, flags: S.flags })); ({ st: S.st, flags: S.flags } = JSON.parse(S.redo.pop())); changed(); msg('Redo'); }
// Slider drags: one undo step per gesture.
let gesture = false;
function beginEdit() { if (!gesture) { pushUndo(); gesture = true; } }
function endEdit() { gesture = false; }

// ─── The page ────────────────────────────────────────────────────────────────
const el = id => document.querySelector(`[data-layer="${id}"]`);
const shown = (st, id) => {
  const hex = D.fill(st, id);
  return st.proof && hex ? C.nearestPrintable(hex).hex : hex;
};
function renderPage() {
  const st = S.st;
  for (const l of D.LAYERS) {
    const e = el(l.id); if (!e || l.type === 'image') continue;
    const hex = shown(st, l.id);
    if (l.type === 'text') e.style.color = hex; else e.style.background = hex;
    if (l.type === 'text') {
      const p = D.textProps(st, l.id);
      Object.assign(e.style, { fontFamily: T.cssFamily(p.family), fontSize: `${p.size}px`, fontWeight: p.weight, lineHeight: p.lh, letterSpacing: `${p.ls}em`, textTransform: p.upper ? 'uppercase' : 'none' });
      if (l.wide) e.style.width = `${st.width}px`;
    }
    e.classList.toggle('oog', !!st.proof && !!hex && !C.printable(D.fill(st, l.id)));
  }
  // the status chips: their icons
  document.querySelectorAll('.pg-st .ic').forEach(i => { i.hidden = !st.icons; i.style.color = 'inherit'; });
  document.querySelectorAll('.pg-st .ic').forEach((i, k) => { i.style.color = shown(st, k ? 'noText' : 'okText'); });
  $('#page').style.filter = st.view && st.view !== 'normal' ? `url(#cvd-${st.view})` : '';
  $('#view-mode').value = st.view || 'normal';
  $('#o-proof').checked = !!st.proof;
  const w = step().view;
  $('#page').hidden = !!w; $('#widget').hidden = !w;
  if (w === 'lightink') renderLightInk();
  if (w === 'specimen') renderSpecimen();
  fitCanvas(); placeBoxes();
}
// The page is 1000 px wide: scale it to the canvas.
function fitCanvas() {
  const wrap = $('#canvas-wrap'), stg = $('#stage'), page = step().view ? $('#widget') : $('#page');
  const W = page.offsetWidth || 1000, H = page.offsetHeight || 640, k = Math.min(1, (wrap.clientWidth - 48) / W, (wrap.clientHeight - 48) / H);
  stg.style.transform = `scale(${k})`; stg.style.width = `${W}px`; stg.style.height = `${H}px`;
  stg.style.left = `${Math.max(24, (wrap.clientWidth - W * k) / 2)}px`; stg.style.top = `${Math.max(24, (wrap.clientHeight - H * k) / 2)}px`;
  $('#zoom').textContent = `${Math.round(k * 100)}%`;
}
function boxOf(id) { const e = el(id), w = $('#canvas-wrap'); if (!e) return null; const r = e.getBoundingClientRect(), wr = w.getBoundingClientRect(); return { left: r.left - wr.left + w.scrollLeft, top: r.top - wr.top + w.scrollTop, width: r.width, height: r.height }; }
let hoverId = null;
function placeBoxes() {
  const sb = $('#sel-box'), hb = $('#hover-box');
  const b = S.sel && !step().view ? boxOf(S.sel) : null;
  sb.hidden = !b; if (b) { Object.assign(sb.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` }); $('#sel-tag').textContent = t(D.LAYER[S.sel].name); }
  const h = hoverId && hoverId !== S.sel && !step().view ? boxOf(hoverId) : null;
  hb.hidden = !h; if (h) Object.assign(hb.style, { left: `${h.left}px`, top: `${h.top}px`, width: `${h.width}px`, height: `${h.height}px` });
}
$('#page').addEventListener('click', e => { const l = e.target.closest('[data-layer]'); if (l) select(l.dataset.layer); });
$('#page').addEventListener('pointermove', e => { const l = e.target.closest('[data-layer]'); const id = l?.dataset.layer || null; if (id !== hoverId) { hoverId = id; placeBoxes(); } });
$('#page').addEventListener('pointerleave', () => { hoverId = null; placeBoxes(); });
$('#canvas-wrap').addEventListener('click', e => { if (e.target.id === 'canvas-wrap' || e.target.id === 'stage') select(null); });
function select(id) { S.sel = id && D.LAYER[id]?.type !== 'image' ? id : id === 'poster' ? 'card' : null; renderLayers(); renderDesign(); placeBoxes(); }

// ─── Widgets: light and ink, and the type specimen ──────────────────────────
function renderLightInk() {
  const f = S.flags, rgb = f.rgb || [0, 0, 0], cmy = f.cmy || [0, 0, 0];
  const circle = (cx, cy, color, on, mode) => `<circle cx="${cx}" cy="${cy}" r="70" fill="${on ? color : 'transparent'}" stroke="${on ? 'none' : '#888'}" stroke-dasharray="4 4" style="mix-blend-mode:${mode}"/>`;
  const pos = [[150, 110], [105, 190], [195, 190]];
  $('#widget').innerHTML = `<div class="li">
    <figure><figcaption>${esc(t('Light: RGB (adds)'))}</figcaption><svg viewBox="0 0 300 290" class="li-rgb"><rect width="300" height="290" fill="#000"/><g style="isolation:isolate">${circle(...pos[0], '#ff0000', rgb[0], 'screen')}${circle(...pos[1], '#00ff00', rgb[1], 'screen')}${circle(...pos[2], '#0000ff', rgb[2], 'screen')}</g></svg>
      <div class="li-buttons">${['Red', 'Green', 'Blue'].map((n, i) => `<button type="button" class="li-b${rgb[i] ? ' on' : ''}" data-rgb="${i}" style="--c:${['#ff4040', '#40d040', '#4070ff'][i]}">${esc(t(n))}</button>`).join('')}</div></figure>
    <figure><figcaption>${esc(t('Ink: CMY (subtracts)'))}</figcaption><svg viewBox="0 0 300 290" class="li-cmy"><rect width="300" height="290" fill="#fff"/><g style="isolation:isolate">${circle(...pos[0], '#00aeef', cmy[0], 'multiply')}${circle(...pos[1], '#ec008c', cmy[1], 'multiply')}${circle(...pos[2], '#fff200', cmy[2], 'multiply')}</g></svg>
      <div class="li-buttons">${['Cyan', 'Magenta', 'Yellow'].map((n, i) => `<button type="button" class="li-b${cmy[i] ? ' on' : ''}" data-cmy="${i}" style="--c:${['#00aeef', '#ec008c', '#e8d800'][i]}">${esc(t(n))}</button>`).join('')}</div></figure></div>`;
}
$('#widget').addEventListener('click', e => {
  const b = e.target.closest('[data-rgb],[data-cmy]'); if (b) {
    pushUndo();
    const k = b.dataset.rgb != null ? 'rgb' : 'cmy', i = +(b.dataset.rgb ?? b.dataset.cmy);
    S.flags[k] = [...(S.flags[k] || [0, 0, 0])]; S.flags[k][i] = S.flags[k][i] ? 0 : 1;
    const r = S.flags.rgb || [0, 0, 0], c = S.flags.cmy || [0, 0, 0];
    if (r.every(Boolean) && !S.flags.white) { S.flags.white = true; msg('Red + green + blue light = white.'); }
    if (c.every(Boolean) && !S.flags.black) { S.flags.black = true; msg('Cyan + magenta + yellow ink = a very dark brown: printers add black ink (K) for a real black.'); }
    if (!c[0] && c[1] && c[2] && !S.flags.red) { S.flags.red = true; msg('Magenta + yellow = red: each ink takes away one light, and only red is left.'); }
    changed(); return;
  }
  const line = e.target.closest('[data-line]'); if (line) clickLine(line.dataset.line);
});
$('#widget').addEventListener('change', e => { if (e.target.id === 'spec-font') { pushUndo(); S.flags.specimen = e.target.value; changed(); } });
const lineTarget = () => LINE_PARTS.find(p => !(S.flags.lines || []).includes(p));
function clickLine(p) {
  const target = lineTarget();
  if (!target) return msg(tr('{p}: {a}', { p: t(LINE_NAMES[p]), a: t(LINE_ABOUT[p]) }));
  if (p === target) { pushUndo(); S.flags.lines = [...(S.flags.lines || []), p]; msg(tr('✓ {p}: {a}', { p: t(LINE_NAMES[p]), a: t(LINE_ABOUT[p]) })); changed(); }
  else msg(tr('That is the {p}. Look for the {q}.', { p: t(LINE_NAMES[p]), q: t(LINE_NAMES[target]) }), true);
}
function renderSpecimen() {
  const fam = S.flags.specimen || 'Merriweather', f = T.FONTS[fam], size = 220, base = 330, found = S.flags.lines || [];
  const Y = { baseline: base, xheight: base - f.xHeight * size, cap: base - f.capHeight * size, ascender: base - f.ascender * size, descender: base - f.descender * size };
  const lines = LINE_PARTS.map(p => { const ok = found.includes(p); return `<g class="sp-line${ok ? ' found' : ''}" data-line="${p}"><rect x="0" y="${Y[p] - 9}" width="900" height="18" fill="transparent"/><line x1="20" x2="880" y1="${Y[p]}" y2="${Y[p]}"/>${ok ? `<text x="884" y="${Y[p] + 4}" class="sp-name">${esc(t(LINE_NAMES[p]))}</text>` : ''}</g>`; }).join('');
  $('#widget').innerHTML = `<div class="sp"><div class="sp-bar"><label>${esc(t('Font'))} <select id="spec-font">${T.FAMILIES.map(n => `<option value="${n}"${n === fam ? ' selected' : ''}>${n}</option>`).join('')}</select></label><span>${esc(t(T.KIND_NAMES[f.kind]))} · ${esc(tr('x-height {x} % of the size', { x: Math.round(f.xHeight * 100) }))}</span></div>
    <svg viewBox="0 0 1000 420" class="sp-svg"><text x="70" y="${base}" font-size="${size}" style="font-family:${T.cssFamily(fam)}" class="sp-glyphs" data-no-i18n>Hxpdg</text>${lines}</svg></div>`;
}

// ─── Layers panel ────────────────────────────────────────────────────────────
const ICON = { frame: '#', shape: '▭', text: 'T', image: '▨' };
const depth = id => { let d = 0, l = D.LAYER[id]; while (l.on) { d++; l = D.LAYER[l.on]; } return d; };
function renderLayers() {
  const st = S.st, tokens = !!step().tokens;
  $('#layers').innerHTML = D.LAYERS.map(l => {
    const v = st.fills[l.id], linked = typeof v === 'string' && v.startsWith('@');
    const badge = tokens && l.token ? (linked ? `<small class="lk">${esc(t(D.TOKEN_NAMES[v.slice(1)]))}</small>` : `<small class="hx">hex</small>`) : '';
    return `<button type="button" class="ly${S.sel === l.id ? ' sel' : ''}" data-ly="${l.id}" style="padding-left:${8 + depth(l.id) * 12}px"><i>${ICON[l.type]}</i><span>${esc(t(l.name))}</span>${badge}</button>`;
  }).join('');
}
$('#layers').addEventListener('click', e => { const b = e.target.closest('[data-ly]'); if (b) select(b.dataset.ly); });
$('#layers').addEventListener('pointerover', e => { const b = e.target.closest('[data-ly]'); hoverId = b?.dataset.ly || null; placeBoxes(); });
$('#layers').addEventListener('pointerleave', () => { hoverId = null; placeBoxes(); });

// ─── Design panel ────────────────────────────────────────────────────────────
const pct = v => Math.round(v * 1000) / 10;
// HSL of the selected layer: kept while the sliders move, so the hue is not lost when the colour is grey.
let hslCache = null;
function getHsl(id) { const hex = D.fill(S.st, id); return hslCache && hslCache.id === id && hslCache.hex === hex ? [...hslCache.hsl] : C.hexToHsl(hex); }
const row = (label, val, good) => `<div class="sb-stat${good == null ? '' : good ? ' good' : ' bad'}"><span>${esc(t(label))}</span><b>${val}</b></div>`;
const badge = (label, ok) => `<span class="wb ${ok ? 'ok' : 'no'}">${esc(label)} ${ok ? '✓' : '✕'}</span>`;
function fillSection(id) {
  const st = S.st, v = st.fills[id], linked = typeof v === 'string' && v.startsWith('@'), hex = D.fill(st, id);
  if (step().cmyk) return cmykSection(id);
  const [h, s, l] = getHsl(id);
  let html = `<div class="panel"><h4>${esc(t('Fill'))}${linked ? `<small>${esc(tr('style: {s}', { s: t(D.TOKEN_NAMES[v.slice(1)]) }))}</small>` : ''}</h4>`;
  if (step().tokens) html += `<div class="f-row"><span>${esc(t('Style'))}</span><select data-link="${id}"><option value="">${esc(t('— none (hex)'))}</option>${D.TOKENS.map(k => `<option value="${k}"${v === '@' + k ? ' selected' : ''}>${esc(t(D.TOKEN_NAMES[k]))}</option>`).join('')}</select></div>`;
  html += `<div class="f-row"><span class="swatch" style="background:${hex}"></span><input type="text" class="hex" data-hex="${id}" value="${hex.toUpperCase()}" maxlength="7"${locked('hex') ? ' disabled title="' + esc(t('Locked in this step: mix it with H, S and L')) + '"' : ''}><span class="f-note">${linked ? esc(t('edits the style')) : ''}</span></div>`;
  html += [['H', h, 360, '°'], ['S', s, 100, '%'], ['L', l, 100, '%']].map(([k, val, max, u]) => `<div class="hsl-row"><span>${k}</span><input type="range" min="0" max="${max}" step="1" value="${Math.round(val)}" data-hsl="${k}" class="hsl-${k.toLowerCase()}" style="${k === 'S' ? `--a:${C.hslToHex([h, 0, l])};--b:${C.hslToHex([h, 100, l])}` : k === 'L' ? `--a:#000;--m:${C.hslToHex([h, s, 50])};--b:#fff` : ''}"><output>${Math.round(val)}${u}</output></div>`).join('');
  return html + `</div>`;
}
function cmykSection(id) {
  const st = S.st, cm = st.cmyk[id] || C.nearestPrintable(D.fill(st, id)).cmyk, total = C.totalInk(cm);
  return `<div class="panel"><h4>${esc(t('Ink (CMYK)'))}<small>${esc(t('coated paper'))}</small></h4>
    <div class="f-row"><span class="swatch" style="background:${C.cmykToHex(cm)}"></span><span class="f-note">${esc(t('printed colour (simulated)'))}</span></div>
    ${['C', 'M', 'Y', 'K'].map((k, i) => `<div class="hsl-row cmyk-${k.toLowerCase()}"><span>${k}</span><input type="range" min="0" max="100" step="1" value="${cm[i]}" data-cmyk="${i}"><input type="number" min="0" max="100" step="1" value="${cm[i]}" data-cmykn="${i}"></div>`).join('')}
    ${row('Total ink', `${total}%`, total <= C.INK_LIMIT)}<p class="sb-empty">${esc(tr('The printer accepts up to {n}% in total.', { n: C.INK_LIMIT }))}</p></div>`;
}
function textSection(id) {
  const st = S.st, v = st.type[id], linked = typeof v === 'string', p = D.textProps(st, id), f = T.FONTS[p.family];
  let html = `<div class="panel"><h4>${esc(t('Text'))}${linked ? `<small>${esc(tr('style: {s}', { s: t(D.STYLE_NAMES[v.slice(1)]) }))}</small>` : ''}</h4>`;
  html += `<div class="f-row"><span>${esc(t('Font'))}</span><select data-tp="family">${T.FAMILIES.map(n => `<option value="${n}"${n === p.family ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
  html += `<p class="f-kind">${esc(t(T.KIND_NAMES[f.kind]))} · ${esc(t(f.about))}</p>`;
  html += `<div class="tp-grid"><label>${esc(t('Weight'))}<select data-tp="weight">${f.weights.map(w => `<option value="${w}"${w === p.weight ? ' selected' : ''}>${w === 400 ? 'Regular' : 'Bold'}</option>`).join('')}</select></label>
    <label>${esc(t('Size'))}<input type="number" min="8" max="96" step="1" data-tp="size" value="${p.size}"></label>
    <label>${esc(t('Line height'))}<input type="number" min="80" max="250" step="5" data-tp="lh" value="${pct(p.lh)}"><i>%</i></label>
    <label>${esc(t('Letter spacing'))}<input type="number" min="-10" max="40" step="1" data-tp="ls" value="${pct(p.ls)}"><i>%</i></label></div>
    <div class="f-row"><span>${esc(t('Case'))}</span><span class="seg"><button type="button" data-case="0" class="${p.upper ? '' : 'on'}">Aa</button><button type="button" data-case="1" class="${p.upper ? 'on' : ''}">AA</button></span></div>`;
  if (D.LAYER[id].wide) html += `<div class="hsl-row wide-row"><span>W</span><input type="range" min="240" max="960" step="10" value="${st.width}" data-width><output>${st.width} px</output></div>`;
  if (linked) html += `<p class="sb-empty">${esc(t('Changes here edit the text style, so every layer that uses it changes.'))}</p>`;
  return html + `</div>`;
}
function contrastSection(id) {
  const st = S.st, l = D.LAYER[id];
  if (l.type === 'text') {
    const c = D.textContrast(st, id), p = D.textProps(st, id);
    return `<div class="panel"><h4>${esc(t('Contrast'))}<small>${esc(tr('on {l}', { l: t(D.LAYER[l.on].name) }))}</small></h4>
      <div class="ct-demo" style="background:${D.fill(st, l.on)};color:${D.fill(st, id)}">Aa</div>
      <div class="ct-ratio">${c.ratio.toFixed(2)} : 1</div><div class="wbs">${badge('AA', c.AA)}${badge('AAA', c.AAA)}</div>
      <p class="sb-empty">${esc(t(c.large ? 'Large text (24 px, or 18.66 px bold): AA 3:1, AAA 4.5:1.' : 'Normal text: AA 4.5:1, AAA 7:1.'))} ${esc(tr('{s} px, weight {w}.', { s: p.size, w: p.weight }))}</p></div>`;
  }
  if (l.type === 'shape' && l.on) {
    const r = C.contrast(D.fill(st, id), D.fill(st, l.on));
    return `<div class="panel"><h4>${esc(t('Contrast'))}<small>${esc(tr('on {l}', { l: t(D.LAYER[l.on].name) }))}</small></h4><div class="ct-ratio">${r.toFixed(2)} : 1</div><div class="wbs">${badge(t('Shape 3:1'), r >= 3)}</div><p class="sb-empty">${esc(t('Buttons, fields and icons need 3:1 against what surrounds them (WCAG 1.4.11). Soft backgrounds of cards and chips do not.'))}</p></div>`;
  }
  return '';
}
function designSelected() {
  const id = S.sel; if (!id) return `<div class="panel"><h4>${esc(t('Selection'))}</h4><p class="sb-empty">${esc(t('Click a layer on the page or in the Layers panel.'))}</p></div>`;
  const l = D.LAYER[id];
  let h = `<div class="panel fg-name"><h4>${esc(t(l.name))}<small>${esc(t({ frame: 'Frame', shape: 'Rectangle', text: 'Text', image: 'Image' }[l.type]))}</small></h4></div>`;
  h += fillSection(id);
  if (l.type === 'text' && !step().cmyk) h += textSection(id);
  if (!step().cmyk) h += `<div id="ct-wrap">${contrastSection(id)}</div>`;
  return h;
}
// Step panels.
function stepPanel() {
  const s = step(), st = S.st;
  let h = '';
  if (s.id === 'c1') { const d = C.hexDelta(D.fill(st, 'button'), TARGET); h += `<div class="panel"><h4>${esc(t('Target'))}</h4><div class="target-pair"><span style="background:${TARGET}"></span><span style="background:${D.fill(st, 'button')}"></span></div>${row('Difference ΔE2000', d.toFixed(1), d <= 5)}<p class="sb-empty">${esc(t('Left: the brand colour. Right: your button. ΔE under 2 is invisible, under 5 very close.'))}</p></div>`; }
  if (s.id === 'c2') h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${['subtitle', 'body', 'meta'].map(id => { const c = D.textContrast(st, id); return row(D.LAYER[id].name, `${c.ratio.toFixed(2)} : 1`, c.AA); }).join('')}</div>`;
  if (s.id === 'c3') { const a = D.textContrast(st, 'label'), b = C.contrast(D.fill(st, 'button'), D.fill(st, 'page')); h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Label on button', `${a.ratio.toFixed(2)} : 1`, a.AA)}${row('Button on page', `${b.toFixed(2)} : 1`, b >= 3)}</div>`; }
  if (s.id === 'c4') { const d = cvdDistance(st); h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Viewed with deuteranopia', t(S.flags.cvdSeen ? 'yes' : 'not yet'), !!S.flags.cvdSeen)}${row('Chips apart (deuteranopia)', `ΔE ${d.toFixed(1)}`, d >= 20)}<label class="live-toggle icons-toggle"><input type="checkbox" id="o-icons"${st.icons ? ' checked' : ''}><span class="switch" aria-hidden="true"></span>${esc(t('Icons'))}</label></div>`; }
  if (s.id === 'p1') h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('White with light', t(S.flags.white ? 'yes' : 'not yet'), !!S.flags.white)}${row('Black with ink', t(S.flags.black ? 'yes' : 'not yet'), !!S.flags.black)}${row('Red with two inks', t(S.flags.red ? 'yes' : 'not yet'), !!S.flags.red)}</div>`;
  if (s.id === 'p2') h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Proof colours seen', t(S.flags.proofSeen ? 'yes' : 'not yet'), !!S.flags.proofSeen)}${['button', 'chip'].map(id => { const g = gamutOk(st, id); return row(D.LAYER[id].name, `${t(g.printable ? 'printable' : 'out of gamut')} · Δh ${Math.round(g.hue)}°`, g.ok); }).join('')}<p class="sb-empty">${esc(t('The print colours are simulated for coated paper: a teaching model, not a real colour profile.'))}</p></div>`;
  if (s.id === 'p3') { const b = st.cmyk.body || [], n = st.cmyk.nav || [0, 0, 0, 0]; h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Body: black ink only', b.join(' / '), b.length === 4 && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 100)}${row('Nav bar: rich black', `${n.join(' / ')} · ${C.totalInk(n)}%`, richBlackOk(n))}</div>`; }
  if (s.id === 't1') { const target = lineTarget(), found = S.flags.lines || []; h += `<div class="panel quiz"><h4>${esc(t('Find'))}<small>${found.length} / ${LINE_PARTS.length}</small></h4>${target ? `<p class="quiz-target">${esc(t(LINE_NAMES[target]))}</p>` : `<p class="sb-empty">${esc(t('All found. Now compare the fonts: leave the one with the smallest x-height.'))}</p>`}${T.FAMILIES.map(n => row(n, `${Math.round(T.FONTS[n].xHeight * 100)} %`)).join('')}</div>`; }
  if (s.id === 't2') { const b = T.bodyChecks(D.textProps(st, 'body')), p = D.textProps(st, 'body'); h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Size', `${p.size} px`, b.size)}${row('Line height', `${pct(p.lh)} %`, b.lh)}${row('Characters per line', `≈ ${Math.round(b.cpl)}`, b.chars)}</div>`; }
  if (s.id === 't3') h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${['title', 'subtitle', 'body'].map(id => { const f = D.textProps(st, id).family; return row(D.LAYER[id].name, `${f} · ${t(T.KIND_NAMES[T.FONTS[f].kind])}`, id === 'title' ? null : T.isTextFace(f)); }).join('')}</div>`;
  if (s.id === 't4') { const a = D.textProps(st, 'tag').ls, b = D.textProps(st, 'title').ls; h += `<div class="panel"><h4>${esc(t('Check'))}</h4>${row('Tag letter spacing', `${pct(a)} %`, a >= 0.05 - 1e-6 && a <= 0.15 + 1e-6)}${row('Title letter spacing', `${pct(b)} %`, b >= -0.03 - 1e-6 && b <= 1e-6)}</div>`; }
  if (s.styles) h += stylesPanel();
  if (s.tokens) h += tokensPanel();
  return h;
}
function stylesPanel() {
  const st = S.st, sizes = D.levelSizes(st), chk = T.scaleChecks(sizes), fam = D.families(st);
  let h = `<div class="panel"><h4>${esc(t('Text styles'))}<small>${esc(tr('{n} families', { n: fam.length }))}</small></h4><div class="ts-table">`;
  h += D.STYLES.map(k => { const p = st.styles[k], f = T.FONTS[p.family]; return `<div class="ts-row"><b>${esc(t(D.STYLE_NAMES[k]))}</b><select data-st="${k}" data-sp="family">${T.FAMILIES.map(n => `<option value="${n}"${n === p.family ? ' selected' : ''}>${n}</option>`).join('')}</select><select data-st="${k}" data-sp="weight">${f.weights.map(w => `<option value="${w}"${w === p.weight ? ' selected' : ''}>${w}</option>`).join('')}</select><input type="number" min="8" max="96" step="0.5" data-st="${k}" data-sp="size" value="${p.size}"></div>`; }).join('');
  h += `</div>`;
  if (step().id === 's1') {
    h += `<div class="scale-gen"><span>${esc(t('Type scale'))}</span><input type="number" id="sc-base" min="12" max="24" step="1" value="${S.flags.base || 16}"><select id="sc-ratio">${T.RATIOS.map(r => `<option value="${r.r}"${+(S.flags.ratio || 1.25) === r.r ? ' selected' : ''}>${r.r} · ${esc(t(r.name))}</option>`).join('')}</select><button type="button" class="mini" id="sc-apply">${esc(t('Apply'))}</button></div>`;
    h += row('Body 16–18 px', `${sizes.body} px`, chk.body) + row('Caption ≥ 12 px', `${sizes.caption} px`, chk.caption) + ['Caption → Body', 'Body → H2', 'H2 → H1'].map((n, i) => row(n, `× ${chk.ratios[i].toFixed(2)}`, chk.steps[i])).join('');
  }
  if (step().id === 's2') h += row('Families', fam.join(', '), fam.length <= 2) + row('Headings bold', `${st.styles.h1.weight} / ${st.styles.h2.weight}`, st.styles.h1.weight >= 700 && st.styles.h2.weight >= 700) + row('Body regular', `${st.styles.body.weight}`, st.styles.body.weight === 400);
  return h + `</div>`;
}
function tokensPanel() {
  const st = S.st, mode = st.mode, pairs = D.pairResults(st, mode), unlinked = D.LAYERS.filter(l => l.token && !String(st.fills[l.id]).startsWith('@')).length;
  let h = `<div class="panel"><h4>${esc(t('Colour styles'))}<span class="seg mode-seg"><button type="button" data-mode="light" class="${mode === 'light' ? 'on' : ''}">${esc(t('Light'))}</button><button type="button" data-mode="dark" class="${mode === 'dark' ? 'on' : ''}">${esc(t('Dark'))}</button></span></h4>`;
  h += D.TOKENS.map(k => `<div class="tk-row"><span class="swatch" style="background:${st.colors[k][mode]}"></span><span>${esc(t(D.TOKEN_NAMES[k]))}</span><input type="text" class="hex" data-token="${k}" value="${st.colors[k][mode].toUpperCase()}" maxlength="7"></div>`).join('');
  h += `<h4 class="sub">${esc(t('Pairs to read'))}</h4>` + pairs.map(p => row(`${t(D.TOKEN_NAMES[p.a])} / ${t(D.TOKEN_NAMES[p.b])}`, `${p.ratio.toFixed(2)} (${p.need}:1)`, p.ok)).join('');
  if (step().id === 's3') h += row('Layers still in hex', `${unlinked}`, unlinked === 0);
  if (step().id === 's4') { const L = C.hexToLab(st.colors.background.dark)[0]; h += row('Background lightness (dark)', `${Math.round(L)} %`, L < 25 && st.colors.background.dark !== '#000000'); }
  return h + `</div>`;
}
function renderDesign() { $('#design').innerHTML = `<div id="dp-step">${stepPanel()}</div>${designSelected()}`; }

// Edits.
function setFill(id, hex) {
  const st = S.st, v = st.fills[id];
  if (typeof v === 'string' && v.startsWith('@')) st.colors[v.slice(1)][st.mode] = hex; else st.fills[id] = hex;
}
function setType(id, key, value) {
  const st = S.st, v = st.type[id];
  if (typeof v === 'string') st.styles[v.slice(1)][key] = value;
  else { st.type[id] = { ...D.textProps(st, id), [key]: value }; delete st.type[id].width; }
  // a font without this weight: use the nearest it has
  const p = D.textProps(st, id), f = T.FONTS[p.family];
  if (!f.weights.includes(p.weight)) setType(id, 'weight', f.weights.includes(700) && p.weight > 500 ? 700 : f.weights[0]);
}
$('#design').addEventListener('input', e => {
  const x = e.target, id = S.sel;
  if (x.dataset.hsl && id) {
    beginEdit();
    const hsl = getHsl(id); hsl['HSL'.indexOf(x.dataset.hsl)] = +x.value;
    const hex = C.hslToHex([hsl[0] % 360, hsl[1], hsl[2]]); setFill(id, hex); hslCache = { id, hex, hsl }; live(); return;
  }
  if (x.dataset.cmyk != null && id) { beginEdit(); const cm = [...(S.st.cmyk[id] || C.nearestPrintable(D.fill(S.st, id)).cmyk)]; cm[+x.dataset.cmyk] = +x.value; S.st.cmyk[id] = cm; live(); return; }
  if (x.dataset.width != null) { beginEdit(); S.st.width = +x.value; live(); return; }
});
$('#design').addEventListener('change', e => {
  const x = e.target, id = S.sel;
  if (x.dataset.hsl || x.dataset.cmyk != null || x.dataset.width != null) { endEdit(); changed(); return; }
  if (x.dataset.hex) { const hex = C.normHex(x.value); if (!hex) { msg('Type a colour as #RRGGBB.', true); renderDesign(); return; } pushUndo(); setFill(x.dataset.hex, hex); changed(); return; }
  if (x.dataset.cmykn != null && id) { pushUndo(); const cm = [...(S.st.cmyk[id] || C.nearestPrintable(D.fill(S.st, id)).cmyk)]; cm[+x.dataset.cmykn] = Math.max(0, Math.min(100, Math.round(+x.value || 0))); S.st.cmyk[id] = cm; changed(); return; }
  if (x.dataset.tp && id) {
    pushUndo(); const k = x.dataset.tp;
    const v = k === 'family' ? x.value : k === 'lh' || k === 'ls' ? (+x.value || 0) / 100 : +x.value || 0;
    setType(id, k, k === 'size' ? Math.max(8, Math.min(96, v)) : v); changed(); return;
  }
  if (x.dataset.link != null) { pushUndo(); const lid = x.dataset.link; S.st.fills[lid] = x.value ? '@' + x.value : D.fill(S.st, lid); changed(); return; }
  if (x.dataset.token) { const hex = C.normHex(x.value); if (!hex) { msg('Type a colour as #RRGGBB.', true); renderDesign(); return; } pushUndo(); S.st.colors[x.dataset.token][S.st.mode] = hex; changed(); return; }
  if (x.dataset.st) {
    pushUndo(); const k = x.dataset.sp, p = S.st.styles[x.dataset.st];
    p[k] = k === 'family' ? x.value : +x.value || p[k];
    if (!T.FONTS[p.family].weights.includes(p.weight)) p.weight = T.FONTS[p.family].weights.includes(700) && p.weight > 500 ? 700 : T.FONTS[p.family].weights[0];
    changed(); return;
  }
  if (x.id === 'o-icons') { pushUndo(); S.st.icons = x.checked; changed(); return; }
  if (x.id === 'sc-base' || x.id === 'sc-ratio') { S.flags.base = +$('#sc-base').value; S.flags.ratio = +$('#sc-ratio').value; }
});
$('#design').addEventListener('click', e => {
  const c = e.target.closest('[data-case]'); if (c && S.sel) { pushUndo(); setType(S.sel, 'upper', c.dataset.case === '1'); changed(); return; }
  const m = e.target.closest('[data-mode]'); if (m) { pushUndo(); S.st.mode = m.dataset.mode; changed(); return; }
  if (e.target.id === 'sc-apply') {
    pushUndo(); const base = +$('#sc-base').value || 16, r = +$('#sc-ratio').value || 1.25, s = T.scaleSizes(base, r);
    for (const k of ['h1', 'h2', 'body', 'caption']) S.st.styles[k].size = Math.round(s[k] * 10) / 10;
    S.flags.base = base; S.flags.ratio = r; changed(); msg(tr('Scale applied: ×{r} from {b} px.', { r, b: base }));
  }
});
// While dragging a slider: update the page and the numbers, keep the panel (so the slider keeps the mouse).
function live() {
  renderPage();
  const id = S.sel; if (!id) return;
  const hex = D.fill(S.st, id);
  document.querySelectorAll('#design .swatch').forEach((sw, i) => { if (i === 0 && !step().cmyk) sw.style.background = hex; });
  const hx = document.querySelector('#design [data-hex]'); if (hx) hx.value = hex.toUpperCase();
  document.querySelectorAll('#design [data-hsl]').forEach(r => { const [h, s, l] = getHsl(id); const val = { H: h, S: s, L: l }[r.dataset.hsl]; r.nextElementSibling.textContent = `${Math.round(val)}${r.dataset.hsl === 'H' ? '°' : '%'}`; });
  if (step().cmyk) { const cm = S.st.cmyk[id]; if (cm) { document.querySelectorAll('#design [data-cmykn]').forEach(n => { n.value = cm[+n.dataset.cmykn]; }); const sw = document.querySelector('#design .swatch'); if (sw) sw.style.background = C.cmykToHex(cm); } }
  const w = document.querySelector('#design [data-width]'); if (w) w.nextElementSibling.textContent = `${S.st.width} px`;
  const sp = $('#dp-step'); if (sp && !sp.contains(document.activeElement)) sp.innerHTML = stepPanel();
  const ct = $('#ct-wrap'); if (ct) ct.innerHTML = contrastSection(id);
  checkProgress(); renderGuideState();
}
$('#view-mode').onchange = e => { pushUndo(); S.st.view = e.target.value; if (e.target.value !== 'normal') S.flags.cvdSeen = true; changed(); };
$('#o-proof').onchange = e => { pushUndo(); S.st.proof = e.target.checked; if (e.target.checked) S.flags.proofSeen = true; changed(); };

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
  if (id === 'show-solution') { pushUndo(); const st = step().start(); const flags = {}; step().solve(st, flags); S.st = st; S.flags = flags; changed(); msg('This is one possible solution. Ctrl Z brings your work back.'); }
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
  renderPage();
  if (save) saveData();
  checkProgress(); renderLayers(); renderDesign(); renderGuide(); renderStepCard();
}
function enterStep() {
  loadData(); lastOk = null;
  renderPage(); lastOk = stepDone(S.step);
  renderStageSwitch(); renderLayers(); renderDesign(); renderGuide(); renderStepCard();
}
const VIEW_NAMES = { normal: 'Normal vision', protanopia: 'Protanopia', deuteranopia: 'Deuteranopia', tritanopia: 'Tritanopia', achromatopsia: 'Greyscale' };
function fillViewOptions() { document.querySelectorAll('#view-mode option').forEach(o => { o.textContent = t(VIEW_NAMES[o.value]); }); }
function renderAll() { fillViewOptions(); renderStageSwitch(); renderLayers(); renderDesign(); renderGuide(); renderStepCard(); renderPage(); translateTitles(); }
function translateTitles() { document.querySelectorAll('[title]').forEach(el => { if (el.closest('.lang-switch')) return; el.dataset.titleEn ??= el.title; el.title = t(el.dataset.titleEn); }); }

// ─── Keyboard ───────────────────────────────────────────────────────────────
const ws = $('#workspace');
ws.addEventListener('pointerenter', () => { S.hover = true; });
ws.addEventListener('pointerleave', () => { S.hover = false; });
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (!S.hover) return;
  const low = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  let handled = true;
  if (ctrl && low === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && low === 'y') redo();
  else if (e.key === 'Escape') select(null);
  else handled = false;
  if (handled) e.preventDefault();
});

// ─── Start ──────────────────────────────────────────────────────────────────
new ResizeObserver(() => { fitCanvas(); placeBoxes(); }).observe($('#canvas-wrap'));
new ResizeObserver(() => { fitCanvas(); placeBoxes(); }).observe($('#page'));
document.fonts?.ready.then(() => { fitCanvas(); placeBoxes(); });
onLangChange(() => renderAll());
enterStep(); translateTitles(); fillViewOptions();
window.__ct = { S, C, T, D, STAGES, select, changed }; // for tests and curious students
