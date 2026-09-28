// Material Lab: a Blender-style Shader Editor with a live preview, organised in stages and steps.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';
import { OUTPUTS, TEXTURES, canConnect, connect, resolveGraph, sourceFor } from './graph.js?v=5';
import { installCoordinates } from './mapping.js?v=5';
import { STAGES, NODE_SETS, PRESETS, startState, applyPreset, displacementMode, effectiveLevel, refractsScene, emissionLights, glareVisible } from './stages.js?v=5';
import { textureSet, invertImage } from './textures.js?v=5';
import { PARAMS } from './params.js?v=1';
import { makeHdri } from '../lighting/light.js?v=1';
import { t, tr, onLangChange } from '../../i18n.js';

const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
const status = $('#connection-status'), world = $('#graph-world'), viewport = $('#graph-viewport'), svg = $('#wires');
const store = {
 get(k, d) { try { const v = localStorage.getItem('carrot-revolt-mat:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
 set(k, v) { try { localStorage.setItem('carrot-revolt-mat:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = { stageIndex: Math.min(STAGES.length - 1, Math.max(0, store.get('stage', 0) | 0)), step: 0, st: null, done: store.get('done', {}), undo: [], redo: [] };
const stage = () => STAGES[S.stageIndex], step = () => stage().steps[S.step];
const say = text => { status.textContent = text; };

// ─── Nodes ───────────────────────────────────────────────────────────────────
const WIDTH = { coordinates:190, mapping:190, texture:204, mid:204, bsdf:236, output:190 };
const ROLE = { color:'Base Color', rough:'Roughness', normalTex:'Normal', mask:'Metallic', height:'Height' };
function socket(key, dir, type, label) { return `<button class="socket ${dir} ${type}" data-key="${key}" data-dir="${dir}" aria-label="${dir === 'input' ? 'Input' : 'Output'} ${label}" title="${dir === 'input' ? 'Input' : 'Output'}: ${label}"></button>`; }
function row(key, dir, type, label, extra = '') { return `<div class="socket-row ${dir === 'output' ? 'out' : ''}">${socket(key, dir, type, label)}<span class="socket-label">${label}</span>${extra}</div>`; }
// Blender-style factor field: the label and value sit inside a filled bar.
function range(key, label, min, max, step, value, inputSocket = '', type = 'value') {
 return `<div class="field" data-field="${key}"><div class="socket-row slider-row">${inputSocket ? socket(inputSocket, 'input', type, label) : ''}<span class="linked-label">${label}</span><label class="bslider" for="${key}"><input id="${key}" data-value="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><span class="bs-label">${label}</span><output for="${key}" id="${key}-value">${Number(value).toFixed(3)}</output></label></div>${inputSocket ? `<p class="driven" data-driven="${key}">Controlled by a texture</p>` : ''}</div>`;
}
const fmt = (key, v) => key === 'tfThick' ? `${Math.round(v)} nm` : Number(v).toFixed(3);
function setFill(input) { if (input?.type === 'range') input.parentElement.style.setProperty('--p', `${(input.value - input.min) / (input.max - input.min) * 100}%`); }
function node(id, title, kind, body, width) {
 const el = document.createElement('article'); el.className = `node ${kind}`; el.id = `node-${id}`; el.dataset.node = id;
 el.style.width = `${width}px`; el.setAttribute('aria-label', `${title} node`);
 el.innerHTML = `<div class="node-header" data-drag="${id}"><span data-no-i18n>${title}</span><span aria-hidden="true">⋮⋮</span></div><div class="node-body">${body}</div>`;
 $('#nodes').append(el);
}
function vectorField(key, label, input) { return `<div class="vector-field" data-vector-field="${key}">${row(input, 'input', 'vector', label)}<div class="axis-fields">${['X', 'Y', 'Z'].map(axis => `<label for="${key + axis}"><span>${axis}</span><input id="${key + axis}" data-value="${key + axis}" type="number" step="${key === 'rotation' ? 1 : .1}" min="-10000" max="10000" value="${key === 'scale' ? 1 : 0}" aria-label="${label} ${axis}"><span class="unit">${key === 'rotation' ? '°' : key === 'location' ? 'm' : ''}</span></label>`).join('')}</div></div>`; }
function panel(id, title, body) { return `<div class="bpanel" data-panel="${id}"><button type="button" class="bpanel-head" data-panel-toggle="${id}" aria-expanded="false"><span class="chev" aria-hidden="true">▸</span><span data-no-i18n>${title}</span></button><div class="bpanel-body">${body}</div></div>`; }
node('coordinates', 'Texture Coordinate', 'coordinates', `${[['generated', 'Generated'], ['normal', 'Normal'], ['uv', 'UV'], ['object', 'Object'], ['camera', 'Camera'], ['window', 'Window'], ['reflection', 'Reflection']].map(([id, label]) => row('coordinates:' + id, 'output', 'vector', label)).join('')}<p class="node-caption coordinate-note">Object: preview mesh<br>UV: active mesh UVs</p>`, WIDTH.coordinates);
node('mapping', 'Mapping', 'mapping', `${row('mapping:vector', 'output', 'vector', 'Vector')}<label class="mapping-type" for="mappingType">Type <select id="mappingType" aria-label="Mapping Type" data-value="mappingType"><option>Point</option><option>Texture</option><option>Vector</option><option>Normal</option></select></label>${vectorField('vector', 'Vector', 'mapping:input')}${vectorField('location', 'Location', 'mapping:location')}${vectorField('rotation', 'Rotation', 'mapping:rotation')}${vectorField('scale', 'Scale', 'mapping:scale')}`, WIDTH.mapping);
for (const id of TEXTURES) node(id, 'Image Texture', 'texture', `${row(id + ':color', 'output', 'color', 'Color')}<div class="image-role" id="role-${id}" data-no-i18n>${ROLE[id]}</div><div class="image-strip"><img id="thumb-${id}" alt=""><span class="image-name" id="name-${id}" data-no-i18n></span><button data-upload="${id}" title="Open a local image" aria-label="Open image">Open</button><input type="file" class="image-upload" id="upload-${id}" accept="image/png,image/jpeg,image/webp" hidden></div><label class="color-space" for="cs-${id}"><span data-no-i18n>Color Space</span><select id="cs-${id}" data-cs="${id}" data-no-i18n><option>sRGB</option><option>Non-Color</option></select></label>${row(id + ':vector', 'input', 'vector', 'Vector')}`, WIDTH.texture);
node('invert', 'Invert Color', 'converter', `${row('invert:color', 'output', 'color', 'Color')}<div class="static-bar"><span>Fac</span><span>1.000</span></div>${row('invert:color', 'input', 'color', 'Color')}`, WIDTH.mid);
node('normal', 'Normal Map', 'normal', `${row('normal:normal', 'output', 'vector', 'Normal')}<p class="node-caption">Tangent Space</p>${range('strength', 'Strength', 0, 2, .01, 1)}${row('normal:color', 'input', 'color', 'Color')}`, WIDTH.mid);
node('bump', 'Bump', 'normal', `${row('bump:normal', 'output', 'vector', 'Normal')}${range('bumpStrength', 'Strength', 0, 1, .01, 1)}${row('bump:height', 'input', 'value', 'Height')}`, WIDTH.mid);
node('disp', 'Displacement', 'normal', `${row('disp:displacement', 'output', 'vector', 'Displacement')}<p class="node-caption">Object Space</p>${row('disp:height', 'input', 'value', 'Height')}${range('dispMid', 'Midlevel', 0, 1, .01, .5)}${range('dispScale', 'Scale', 0, .5, .005, .1)}`, WIDTH.mid);
function colorRow(key, label) { return `<div class="color-row"><span>${label}</span><input id="${key}" data-value="${key}" type="color" value="#ffffff" aria-label="${label}"></div>`; }
function vec3(key, label, min, max, step) { return `<div class="vec-label">${label}</div><div class="vec3">${['X', 'Y', 'Z'].map(a => `<input id="${key}${a}" data-value="${key}${a}" type="number" min="${min}" max="${max}" step="${step}" aria-label="${label} ${a}">`).join('')}</div>`; }
node('bsdf', 'Principled BSDF', 'principled', `${row('bsdf:bsdf', 'output', 'shader', 'BSDF')}<div class="field" data-field="base">${row('bsdf:base', 'input', 'color', 'Base Color', '<input id="base" data-value="base" type="color" value="#c98159" aria-label="Base Color">')}<p class="driven" data-driven="base">Controlled by a texture</p></div>${range('metallic', 'Metallic', 0, 1, .01, 0, 'bsdf:metallic')}${range('roughness', 'Roughness', 0, 1, .01, .45, 'bsdf:roughness')}${range('ior', 'IOR', 1, 2.5, .01, 1.5)}${range('alpha', 'Alpha', 0, 1, .01, 1, 'bsdf:alpha')}${row('bsdf:normal', 'input', 'vector', 'Normal')}
 ${panel('subsurface', 'Subsurface', range('subsurface', 'Weight', 0, 1, .01, 0) + vec3('subRadius', 'Radius', 0, 5, .05) + range('subScale', 'Scale', 0, 1, .005, .05))}
 ${panel('specular', 'Specular', range('specLevel', 'IOR Level', 0, 1, .01, .5) + colorRow('specTint', 'Tint') + range('aniso', 'Anisotropic', 0, 1, .01, 0) + range('anisoRot', 'Anisotropic Rotation', 0, 1, .01, 0))}
 ${panel('transmission', 'Transmission', range('transmission', 'Weight', 0, 1, .01, 0))}
 ${panel('coat', 'Coat', range('coat', 'Weight', 0, 1, .01, 0) + range('coatRough', 'Roughness', 0, 1, .01, .03) + range('coatIor', 'IOR', 1, 2.5, .01, 1.5) + colorRow('coatTint', 'Tint'))}
 ${panel('sheen', 'Sheen', range('sheen', 'Weight', 0, 1, .01, 0) + range('sheenRough', 'Roughness', 0, 1, .01, .5) + colorRow('sheenTint', 'Tint'))}
 ${panel('emission', 'Emission', `<div class="field" data-field="emission"><div class="socket-row"><span class="socket-label">Color</span><input id="emission" data-value="emission" type="color" value="#ffffff" aria-label="Emission Color"></div></div>` + range('emissionStrength', 'Strength', 0, 20, .05, 0))}
 ${panel('thinfilm', 'Thin Film', range('tfThick', 'Thickness', 0, 1200, 5, 0) + range('tfIor', 'IOR', 1, 2.5, .01, 1.33))}`, WIDTH.bsdf);
node('output', 'Material Output', 'output', `${row('output:surface', 'input', 'shader', 'Surface')}${row('output:displacement', 'input', 'vector', 'Displacement')}<p class="node-caption">All render engines</p>`, WIDTH.output);
// Blender labels, sockets and values stay in English.
$$('.socket-label, .bs-label, .linked-label, .node-caption:not(.coordinate-note), .mapping-type, .axis-fields span, .static-bar, .image-strip button, .color-row span, .vec-label').forEach(el => el.setAttribute('data-no-i18n', ''));

// ─── Parameter cards: an extended Blender-style tooltip on every value ─────────
const tip = document.createElement('div'); tip.className = 'param-tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); document.body.append(tip);
function anchorsOf(at) {
 const [kind, ...rest] = at.split(':'), key = rest.join(':');
 const up = (el, sel) => el ? (el.closest(sel) || el) : null;
 if (kind === 'field') return [...document.querySelectorAll(`#nodes [data-field="${key}"]`)];
 if (kind === 'socket') return [up(document.querySelector(`.socket[data-dir="input"][data-key="${key}"]`), '.socket-row')];
 if (kind === 'id') return [up(document.getElementById(key), '.color-row, .pslider, .prow, label')];
 if (kind === 'panel') return [document.querySelector(`[data-panel-toggle="${key}"]`)];
 if (kind === 'setting') return [up(document.querySelector(`[data-setting="${key}"]`), '.prow, .pcheck, .pslider')];
 if (kind === 'css') return [...document.querySelectorAll(key)];
 return [];
}
const isHex = v => /^#[0-9a-f]{6}$/i.test(v);
function tipHtml(p) {
 const ex = p.examples.map(([l, v]) => `<span class="pt-chip">${isHex(v) ? `<i style="background:${v}"></i>` : ''}<b>${esc(t(l))}</b> <em data-no-i18n>${esc(isHex(v) ? v.toUpperCase() : t(v))}</em></span>`).join('');
 return `<div class="pt-name" data-no-i18n>${esc(p.name)}</div><p>${esc(t(p.what))}</p>
  <div class="pt-h">${esc(t('Typical values'))}</div><p class="pt-range">${esc(t(p.range))}</p><div class="pt-ex">${ex}</div>
  <div class="pt-warn"><b>${esc(t('Watch out'))}</b> ${esc(t(p.mistake))}</div>${p.engine ? `<div class="pt-engine"><b data-no-i18n>EEVEE · Cycles</b> ${esc(t(p.engine))}</div>` : ''}`;
}
let tipTimer = null, tipFor = null;
function showTip(el, id) {
 const p = PARAMS[id]; if (!p || pending || drag || S.modalBusy) return;
 tip.innerHTML = tipHtml(p); tip.hidden = false; tipFor = el;
 const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, vw = innerWidth, vh = innerHeight;
 let x = r.right + 12; if (x + w > vw - 8) x = r.left - w - 12; if (x < 8) x = Math.min(vw - w - 8, Math.max(8, r.left));
 let y = Math.min(vh - h - 8, Math.max(8, r.top - 8)); if (x === r.left || (x < r.right && x + w > r.left)) y = r.bottom + 8 + h > vh ? Math.max(8, r.top - h - 8) : r.bottom + 8;
 tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
function hideTip() { clearTimeout(tipTimer); tip.hidden = true; tipFor = null; }
for (const [id, p] of Object.entries(PARAMS)) for (const el of anchorsOf(p.at)) {
 if (!el || el.dataset.param) continue;
 el.dataset.param = id; el.classList.add('has-param');
 el.addEventListener('pointerenter', () => { clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(el, id), 550); });
 el.addEventListener('pointerleave', hideTip);
 el.addEventListener('focusin', () => showTip(el, id));
 el.addEventListener('focusout', hideTip);
}
window.addEventListener('pointerdown', e => { if (!tip.contains(e.target)) hideTip(); }, true);
window.addEventListener('wheel', hideTip, { passive: true });
window.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });

// Place the visible nodes in columns, from coordinates on the left to the output on the right.
function layout() {
 const cols = [['coordinates'], ['mapping'], TEXTURES, ['invert', 'normal', 'bump', 'disp'], ['bsdf'], ['output']];
 let x = 20;
 for (const col of cols) {
  const vis = col.map(id => $(`#node-${id}`)).filter(n => !n.hidden);
  if (!vis.length) continue;
  let y = col[0] === 'coordinates' ? 150 : col[0] === 'invert' ? 150 : 20;
  for (const n of vis) { n.style.left = `${x}px`; n.style.top = `${y}px`; y += n.offsetHeight + 26; }
  x += Math.max(...vis.map(n => n.offsetWidth)) + 48;
 }
}

// ─── Fields ──────────────────────────────────────────────────────────────────
function updateFields() {
 const st = S.st;
 for (const [key, value] of Object.entries(st.values)) {
  const el = $(`#${key}`); if (!el) continue;
  el.value = /^(vector|location|scale|subRadius)[XYZ]$/.test(key) ? Number(value).toFixed(3) : value;
  const output = $(`#${key}-value`); if (output) output.textContent = fmt(key, value);
  setFill(el);
 }
 for (const [key, input] of [['base', 'bsdf:base'], ['roughness', 'bsdf:roughness'], ['metallic', 'bsdf:metallic'], ['alpha', 'bsdf:alpha']]) {
  const linked = !!st.links[input]; $(`#${key}`).disabled = linked; $(`[data-field="${key}"]`).classList.toggle('disabled', linked); $(`[data-driven="${key}"]`).classList.toggle('show', linked);
 }
 for (const [key, input] of [['vector', 'input'], ['location', 'location'], ['rotation', 'rotation'], ['scale', 'scale']]) {
  const field = $(`[data-vector-field="${key}"]`); field.querySelector('.axis-fields').hidden = !!st.links[`mapping:${input}`]; field.hidden = key === 'location' && ['Vector', 'Normal'].includes(st.values.mappingType);
 }
 for (const id of TEXTURES) $(`#cs-${id}`).value = st.cs[id];
 for (const [id, open] of Object.entries(st.open)) { const p = $(`[data-panel="${id}"]`); p.classList.toggle('open', open); p.querySelector('.bpanel-head').setAttribute('aria-expanded', String(open)); }
 $$('.socket.input').forEach(el => { const linked = !!st.links[el.dataset.key]; el.classList.toggle('connected', linked); el.title = linked ? `${el.getAttribute('aria-label')} · Click to disconnect` : `${el.getAttribute('aria-label')} · Connect an output`; });
 $('#link-count').textContent = tr('{n} connections', { n: Object.keys(st.links).length });
 updateProps();
 $('#env').value = st.env;
 $$('[data-shape]').forEach(b => { b.classList.toggle('active', b.dataset.shape === st.shape); b.setAttribute('aria-pressed', String(b.dataset.shape === st.shape)); });
 requestAnimationFrame(drawWires);
}
function showImages() {
 const set = textureSet(S.st.set);
 for (const id of TEXTURES) {
  const src = uploads.get(id)?.url ?? set.images[id], name = uploads.get(id)?.name ?? set.names[id];
  const img = $(`#thumb-${id}`); if (src) img.src = src; else img.removeAttribute('src');
  $(`#name-${id}`).textContent = name || '';
  $(`#role-${id}`).textContent = set.labels[id] || ROLE[id];
 }
}
const imageOf = id => uploads.get(id)?.url ?? textureSet(S.st.set).images[id];

// ─── Wires, zoom and pan ─────────────────────────────────────────────────────
let zoom = 1, panX = 0, panY = 0, pending = null, wirePointer = null, drag = null;
function socketPoint(key, dir) { const el = $(`.socket[data-dir="${dir}"][data-key="${key}"]`); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(), b = world.getBoundingClientRect(); return { x: (r.left + r.width / 2 - b.left) / zoom, y: (r.top + r.height / 2 - b.top) / zoom }; }
function curve(a, b) { const d = Math.max(50, Math.abs(b.x - a.x) * .5); return `M${a.x},${a.y} C${a.x + d},${a.y} ${b.x - d},${b.y} ${b.x},${b.y}`; }
function drawWires() {
 svg.replaceChildren();
 for (const [to, from] of Object.entries(S.st.links)) {
  const a = socketPoint(from, 'output'), b = socketPoint(to, 'input'); if (!a || !b) continue;
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); let d = curve(a, b);
  if (a.x >= b.x) { const source = $(`#node-${from.split(':')[0]}`); const bottom = source.offsetTop + source.offsetHeight + 18; const right = a.x + 25, left = b.x - 27; d = `M${a.x},${a.y} C${right},${a.y} ${right},${bottom} ${a.x},${bottom} L${left + 10},${bottom} Q${left},${bottom} ${left},${bottom - 10} L${left},${b.y + 10} Q${left},${b.y} ${left + 10},${b.y} L${b.x},${b.y}`; }
  p.setAttribute('d', d); p.dataset.to = to; p.setAttribute('stroke', { color: '#e5c663', vector: '#9690ea', shader: '#86c396' }[OUTPUTS[from]]); svg.append(p);
 }
 if (cut && cut.points.length > 1) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M' + cut.points.map(pt => `${pt.x},${pt.y}`).join(' L')); p.classList.add('cut-line'); svg.append(p); }
 if (pending && wirePointer) { const a = socketPoint(pending, 'output'); if (a) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', curve(a, wirePointer)); p.classList.add('draft'); svg.append(p); } }
}
function setTransform() { world.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`; $('#zoom-label').value = `${Math.round(zoom * 100)}%`; requestAnimationFrame(drawWires); }
function fitGraph() {
 const w = viewport.clientWidth, h = viewport.clientHeight; if (!w || !h) return;
 let maxX = 0, maxY = 0, minX = 1e9, minY = 1e9;
 $$('.node').filter(n => !n.hidden).forEach(n => { maxX = Math.max(maxX, n.offsetLeft + n.offsetWidth + 18); maxY = Math.max(maxY, n.offsetTop + n.offsetHeight + 18); minX = Math.min(minX, n.offsetLeft - 18); minY = Math.min(minY, n.offsetTop - 18); });
 zoom = Math.max(.2, Math.min(1.1, (w - 26) / (maxX - minX), (h - 24) / (maxY - minY)));
 panX = (w - (maxX - minX) * zoom) / 2 - minX * zoom; panY = (h - (maxY - minY) * zoom) / 2 - minY * zoom; setTransform();
}
function changeZoom(mult, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) { const next = THREE.MathUtils.clamp(zoom * mult, .25, 1.8); panX = cx - (cx - panX) * next / zoom; panY = cy - (cy - panY) * next / zoom; zoom = next; setTransform(); }
$('#fit').onclick = fitGraph; $('#zoom-in').onclick = () => changeZoom(1.18); $('#zoom-out').onclick = () => changeZoom(1 / 1.18);
viewport.addEventListener('wheel', e => { e.preventDefault(); const r = viewport.getBoundingClientRect(); changeZoom(e.deltaY > 0 ? .92 : 1.08, e.clientX - r.left, e.clientY - r.top); }, { passive: false });

// ─── Linking ─────────────────────────────────────────────────────────────────
function socketName(key, dir) { const el = $(`.socket[data-dir="${dir}"][data-key="${key}"]`), n = el?.closest('.node')?.querySelector('.node-header span')?.textContent || key.split(':')[0]; return `${n} › ${el?.getAttribute('aria-label').replace(/^(Input|Output) /, '') || key.split(':')[1]}`; }
function clearPending() { pending = null; wirePointer = null; $$('.socket.selected').forEach(el => el.classList.remove('selected')); $$('.socket.compatible').forEach(el => el.classList.remove('compatible')); viewport.classList.remove('wiring'); drawWires(); }
function markCompatible() { viewport.classList.add('wiring'); $$('.socket.input').forEach(el => el.classList.toggle('compatible', canConnect(pending, el.dataset.key))); }
function pickOutput(key, text = 'Drop the link on a highlighted input. Esc cancels.') { clearPending(); pending = key; $(`.socket.output[data-key="${key}"]`).classList.add('selected'); markCompatible(); say(text); }
function finishConnection(to, undoPushed = false) {
 if (!pending) return;
 if (!canConnect(pending, to)) { say('These sockets do not match in this lab. Choose a compatible input.'); return; }
 if (!undoPushed) pushUndo();
 connect(S.st.links, pending, to);
 const from = pending; clearPending(); say(`Connected ${socketName(from, 'output')} → ${socketName(to, 'input')}.`); changed();
}
let socketDown = null, suppressClickUntil = 0, detached = null, cut = null;
viewport.addEventListener('pointerdown', e => {
 if (e.button === 2 && (e.ctrlKey || e.metaKey)) { const b = world.getBoundingClientRect(); cut = { id: e.pointerId, points: [{ x: (e.clientX - b.left) / zoom, y: (e.clientY - b.top) / zoom }] }; viewport.setPointerCapture(e.pointerId); e.preventDefault(); return; }
 if (e.button === 1) { e.preventDefault(); drag = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, left: panX, top: panY }; viewport.setPointerCapture(e.pointerId); return; }
 if (e.button !== 0) return;
 const s = e.target.closest('.socket');
 if (s) {
  e.stopPropagation();
  if (s.dataset.dir === 'output') { socketDown = { id: e.pointerId, x: e.clientX, y: e.clientY, key: s.dataset.key }; pickOutput(s.dataset.key); return; }
  // Blender: dragging a connected input picks its link up so it can be moved or dropped.
  if (!pending && S.st.links[s.dataset.key]) { pushUndo(); const from = S.st.links[s.dataset.key]; detached = { to: s.dataset.key, from }; delete S.st.links[s.dataset.key]; socketDown = { id: e.pointerId, x: e.clientX, y: e.clientY, key: from }; pickOutput(from, 'Drop on another input to move the link, or on empty space to remove it.'); updateFields(); }
  return;
 }
 if (e.target.closest('input, select, button, label')) return;
 const header = e.target.closest('.node-header');
 if (header) { const n = header.closest('.node'); selectNode(n); drag = { kind: 'node', el: n, id: e.pointerId, x: e.clientX, y: e.clientY, left: n.offsetLeft, top: n.offsetTop }; header.setPointerCapture(e.pointerId); return; }
 if (e.target.closest('.node')) { selectNode(e.target.closest('.node')); return; }
 selectNode(null);
 drag = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, left: panX, top: panY }; viewport.setPointerCapture(e.pointerId);
});
viewport.addEventListener('contextmenu', e => e.preventDefault());
viewport.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
function selectNode(n) { $$('.node.active').forEach(el => el.classList.remove('active')); if (n) n.classList.add('active'); }
function segmentsCross(a, b, c, d) { const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); }
function finishCut() {
 const removed = [];
 for (const path of svg.querySelectorAll('path[data-to]')) {
  const length = path.getTotalLength(), samples = []; for (let i = 0; i <= 40; i++) { const p = path.getPointAtLength(length * i / 40); samples.push({ x: p.x, y: p.y }); }
  let hit = false; for (let i = 1; i < cut.points.length && !hit; i++) for (let j = 1; j < samples.length && !hit; j++) hit = segmentsCross(cut.points[i - 1], cut.points[i], samples[j - 1], samples[j]);
  if (hit) removed.push(path.dataset.to);
 }
 cut = null;
 if (removed.length) { pushUndo(); for (const to of removed) delete S.st.links[to]; }
 say(removed.length ? (removed.length > 1 ? `Cut ${removed.length} links (Ctrl + right-drag).` : `Cut ${removed.length} link (Ctrl + right-drag).`) : 'No links crossed. Drag the cut line across a wire.');
 if (removed.length) changed(); else drawWires();
}
window.addEventListener('pointermove', e => {
 if (cut && cut.id === e.pointerId) { const b = world.getBoundingClientRect(); cut.points.push({ x: (e.clientX - b.left) / zoom, y: (e.clientY - b.top) / zoom }); drawWires(); return; }
 if (pending) { const b = world.getBoundingClientRect(); wirePointer = { x: (e.clientX - b.left) / zoom, y: (e.clientY - b.top) / zoom }; drawWires(); }
 if (!drag || drag.id !== e.pointerId) return;
 if (drag.kind === 'node') { drag.el.style.left = `${Math.max(5, Math.min(2000, drag.left + (e.clientX - drag.x) / zoom))}px`; drag.el.style.top = `${Math.max(5, Math.min(1600, drag.top + (e.clientY - drag.y) / zoom))}px`; drawWires(); }
 else { panX = drag.left + e.clientX - drag.x; panY = drag.top + e.clientY - drag.y; setTransform(); }
});
window.addEventListener('pointerup', e => {
 drag = null;
 if (cut && cut.id === e.pointerId) { finishCut(); return; }
 if (!socketDown || socketDown.id !== e.pointerId) return;
 const moved = Math.hypot(e.clientX - socketDown.x, e.clientY - socketDown.y) > 5, target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.socket.input');
 if (detached) {
  const was = detached; detached = null; suppressClickUntil = performance.now() + 300;
  if (!moved) { S.st.links[was.to] = was.from; S.undo.pop(); clearPending(); say('Tip: drag a connected input away to move or remove its link.'); updateFields(); }
  else if (target && canConnect(was.from, target.dataset.key)) finishConnection(target.dataset.key, true);
  else { clearPending(); say(`Removed the link into ${socketName(was.to, 'input')}. Drag from an output to connect it again.`); changed(); }
 } else if (moved) { if (target) finishConnection(target.dataset.key); else { clearPending(); say('Link dropped on empty space. Drag from an output to a highlighted input.'); } suppressClickUntil = performance.now() + 300; }
 socketDown = null;
});
window.addEventListener('pointercancel', () => { drag = null; socketDown = null; cut = null; if (detached) { S.st.links[detached.to] = detached.from; S.undo.pop(); detached = null; updateFields(); } clearPending(); });
// Click output, then input: a touch- and keyboard-friendly alternative to dragging.
$$('.socket').forEach(el => el.addEventListener('click', e => {
 if (performance.now() < suppressClickUntil) return;
 if (el.dataset.dir === 'output') { pickOutput(el.dataset.key, 'Now click a highlighted input (or drag next time). Esc cancels.'); return; }
 if (pending) { finishConnection(el.dataset.key); return; }
 if (e.detail === 0 && S.st.links[el.dataset.key]) { pushUndo(); delete S.st.links[el.dataset.key]; say('Link removed with the keyboard.'); changed(); return; }
 say(S.st.links[el.dataset.key] ? 'Drag this input away to move or remove its link.' : 'Start from an output socket (right side of a node), then drop on this input.');
}));

// ─── Values ──────────────────────────────────────────────────────────────────
let gesture = false;
$$('[data-value]').forEach(input => {
 input.addEventListener('input', () => {
  const key = input.dataset.value, text = ['base', 'emission', 'mappingType', 'specTint', 'coatTint', 'sheenTint'].includes(key);
  let v = text ? input.value : Number(input.value);
  if (!text) { if (!Number.isFinite(v) || input.value === '') return; v = THREE.MathUtils.clamp(v, Number(input.min), Number(input.max)); }
  if (!gesture) { pushUndo(); gesture = true; }
  S.st.values[key] = v;
  if (key === 'roughness') { if (v <= .1) S.st.flags.roughLow = true; if (v >= .8) S.st.flags.roughHigh = true; }
  if (S.st.flags.preset) S.st.flags.edited = true;
  const output = $(`#${key}-value`); if (output) output.textContent = fmt(key, v); setFill(input);
  if (key === 'mappingType') updateFields();
  changed(false);
 });
 input.addEventListener('change', () => { gesture = false; if (input.type === 'number') input.value = S.st.values[input.dataset.value]; saveData(); });
});
$$('[data-cs]').forEach(sel => sel.addEventListener('change', () => { pushUndo(); S.st.cs[sel.dataset.cs] = sel.value; say(`${ROLE[sel.dataset.cs]} image: Color Space ${sel.value}.`); changed(); }));
$$('[data-panel-toggle]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.panelToggle; S.st.open[id] = !S.st.open[id]; updateFields(); saveData(); }));

// ─── Preview controls ────────────────────────────────────────────────────────
$$('[data-shape]').forEach(b => b.onclick = () => { pushUndo(); S.st.shape = b.dataset.shape; changed(); });
$('#subdiv').addEventListener('input', e => { if (!gesture) { pushUndo(); gesture = true; } S.st.subdiv = +e.target.value; changed(false); });
$('#subdiv').addEventListener('change', () => { gesture = false; saveData(); });
$('#env').addEventListener('change', e => { pushUndo(); S.st.env = e.target.value; changed(); });
$('#rotate').onclick = () => { if (!controls) return; controls.autoRotate = !controls.autoRotate; $('#rotate').setAttribute('aria-pressed', String(controls.autoRotate)); renderDirty = true; };

// ─── Properties editor: Render, Modifiers, Material settings ──────────────────
$$('[data-tab]').forEach(b => b.addEventListener('click', () => { S.st.tab = b.dataset.tab; updateProps(); saveData(); }));
$$('[data-setting]').forEach(el => {
 const key = el.dataset.setting, ev = el.type === 'range' ? 'input' : 'change';
 el.addEventListener(ev, () => {
  if (el.type === 'range') { if (!gesture) { pushUndo(); gesture = true; } } else pushUndo();
  const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
  S.st.settings[key] = v;
  if (key === 'engine' || (key === 'dispMod' && v)) S.st.flags['seen_' + S.st.settings.engine] = true;
  if (S.st.flags.preset) S.st.flags.edited = true;
  if (key === 'engine') say(v === 'cycles' ? 'Render Engine: Cycles. Light is traced: glass, emission and displacement behave like the final render.' : 'Render Engine: EEVEE. Real-time: some effects need Raytracing or extra settings.');
  changed(el.type !== 'range');
 });
 if (el.type === 'range') el.addEventListener('change', () => { gesture = false; saveData(); });
});
function updateProps() {
 const st = S.st, se = st.settings, cyc = se.engine === 'cycles';
 $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)));
 $$('.props-page').forEach(p => { p.hidden = p.dataset.page !== st.tab; });
 $$('[data-setting]').forEach(el => {
  const v = se[el.dataset.setting];
  if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  if (el.type === 'range') { setFill(el); const o = el.parentElement.querySelector('output'); if (o) o.textContent = Number(v).toFixed(2); }
 });
 $('#subdiv').value = st.subdiv; setFill($('#subdiv'));
 $('#subdiv-value').textContent = `${st.subdiv} · ${2 ** effectiveLevel(st)} × ${2 ** effectiveLevel(st)}`;
 $('#eevee-group').classList.toggle('disabled', cyc); $('#eevee-group').querySelector('input').disabled = cyc;
 $('#rtt-row').classList.toggle('off', cyc); $('#rtt-row').querySelector('input').disabled = cyc;
 $('#glare-fields').classList.toggle('off', !se.glare);
 $('[data-setting="adaptive"]').closest('.pcheck').classList.toggle('off', !cyc);
 let note = '';
 if (st.tab === 'modifiers' && se.adaptive && !cyc) note = 'Adaptive Subdivision only works in Cycles. In EEVEE the Levels are used.';
 else if (st.tab === 'material' && se.dispMethod === 'displacement' && !cyc) note = 'EEVEE treats Displacement Only as Displacement and Bump.';
 else if (st.tab === 'material' && cyc) note = 'Raytraced Transmission is an EEVEE setting: Cycles always traces transmission.';
 else if (st.tab === 'render' && cyc) note = 'Cycles has no Raytracing checkbox: everything is ray traced.';
 else if (st.tab === 'modifiers' && st.shape === 'sphere') note = 'The preview sphere is already dense. Use the plane or the cube to see the effect of the levels.';
 $('#props-note').textContent = t(note);
 const badge = $('#engine-badge'); badge.textContent = cyc ? 'Cycles' : 'EEVEE'; badge.classList.toggle('cycles', cyc);
 $('#preset-field').hidden = step().id !== 's1';
 if (step().id === 's1') presetOptions();
 $('#view-note').hidden = !viewNote(); $('#view-note').textContent = t(viewNote());
}
// A short live explanation in the preview when a setting hides an effect.
function viewNote() {
 const st = S.st, se = st.settings, v = st.values, d = displacementMode(st);
 if (d.connected && d.method === 'bump') return 'Displacement: Bump Only. The height changes the shading, not the mesh (Material › Settings).';
 if ((d.moves || se.dispMod) && st.shape !== 'sphere' && effectiveLevel(st) < 6) return 'Not enough vertices to displace: add Subdivision Surface levels (Modifiers).';
 if (v.transmission > .5 && st.backdrop && !refractsScene(se)) return 'EEVEE without Raytracing and Raytraced Transmission: the glass refracts only the world, not the board.';
 if (se.glare && se.vpCompositor !== 'always') return 'The Glare node is in the Compositor: set Viewport Shading › Compositor to Always to see it here.';
 return '';
}
const presetOptions = () => { $('#preset').innerHTML = `<option value="" disabled>—</option>` + Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${t(p.name)}</option>`).join(''); $('#preset').value = S.st?.preset || ''; };
presetOptions();
$('#preset').addEventListener('change', e => { pushUndo(); applyPreset(S.st, e.target.value); say(tr('Preset: {p}. Now change it.', { p: t(PRESETS[e.target.value].name) })); changed(); });

// Local images: kept in memory for the current step only.
const uploads = new Map();
$$('[data-upload]').forEach(b => b.onclick = () => $(`#upload-${b.dataset.upload}`).click());
for (const id of TEXTURES) $(`#upload-${id}`).addEventListener('change', async e => {
 const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
 if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { say('Choose a PNG, JPEG or WebP image.'); return; }
 if (file.size > 20 * 1024 * 1024) { say('Choose an image smaller than 20 MB.'); return; }
 const url = URL.createObjectURL(file);
 try {
  const tex = await getBaseTexture(url), max = renderer?.capabilities.maxTextureSize ?? 4096;
  if (tex.image.width > max || tex.image.height > max) { baseTextures.delete(url); URL.revokeObjectURL(url); say(`This device supports textures up to ${max} pixels. Choose a smaller image.`); return; }
  uploads.set(id, { url, name: file.name }); showImages(); say('Image opened locally. Connect its Color output to use it.'); applyMaterial();
 } catch { URL.revokeObjectURL(url); say('This image could not be opened. Try a PNG, JPEG or WebP file.'); }
});

// ─── Undo and storage ────────────────────────────────────────────────────────
function pushUndo() { S.undo.push(JSON.stringify(S.st)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
function undo() { if (!S.undo.length) { say('Nothing to undo.'); return; } S.redo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.undo.pop()); changed(); say('Undo.'); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.st)); S.st = JSON.parse(S.redo.pop()); changed(); say('Redo.'); }
const dataKey = () => `step:${stage().id}-${S.step}`;
function saveData() { store.set(dataKey(), S.st); }
function loadData() {
 const saved = store.get(dataKey(), null), fresh = startState(step());
 S.st = saved && typeof saved === 'object' ? { ...fresh, ...saved, values: { ...fresh.values, ...saved.values }, cs: { ...fresh.cs, ...saved.cs }, open: { ...fresh.open, ...saved.open }, settings: { ...fresh.settings, ...saved.settings }, flags: { ...saved.flags }, links: saved.links || fresh.links, nodes: fresh.nodes, set: fresh.set, backdrop: fresh.backdrop } : fresh;
}

// ─── Stages, guide, step card ────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderStageSwitch() {
 $('#stage-switch').innerHTML = `<span class="control-label">${esc(t('STAGE'))}</span>` + STAGES.map((s, i) => `<button type="button" class="model-button${i === S.stageIndex ? ' active' : ''}" data-stage="${i}" aria-pressed="${i === S.stageIndex}"><b>${i + 1}</b>${esc(t(s.name))}<small data-no-i18n>${esc(s.sub)}</small></button>`).join('');
}
$('#stage-switch').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; saveData(); S.stageIndex = +b.dataset.stage; S.step = 0; store.set('stage', S.stageIndex); enterStep(); });
const doneKey = i => `${stage().id}-${i}`;
const stepDone = i => i === S.step ? !!step().check(S.st) : !!S.done[doneKey(i)];
function renderGuide() {
 const st = stage(), g = $('#guide'), n = st.steps.length;
 g.className = `guide n${n}`;
 g.innerHTML = st.steps.map((s, i) => `<li data-step="${i}" class="${stepDone(i) ? 'done' : ''}${i === S.step ? ' current' : ''}"><b>${stepDone(i) ? '✓' : i + 1}</b><span><strong>${esc(t(s.title))}</strong><small>${esc(t(stepDone(i) ? 'Done' : i === S.step ? 'Now' : 'Click to load'))}</small></span></li>`).join('');
}
$('#guide').addEventListener('click', e => { const li = e.target.closest('[data-step]'); if (!li) return; saveData(); S.step = +li.dataset.step; enterStep(); });
function renderStepCard() {
 const st = stage(), i = S.step, s = st.steps[i], ok = stepDone(i), card = $('#step-card');
 card.classList.toggle('done', ok);
 card.innerHTML = `<span class="control-label">${esc(tr('STAGE {a} · STEP {b} OF {c}', { a: S.stageIndex + 1, b: i + 1, c: st.steps.length }))}</span><h3>${esc(t(s.title))}</h3><p>${esc(t(s.text))}</p>
  <span class="control-label">${esc(t('HOW, AS IN BLENDER'))}</span><ol>${s.how.map(h => `<li>${t(h)}</li>`).join('')}</ol><p class="why"><b>${esc(t('Why:'))}</b> ${esc(t(s.why))}</p>
  <div class="step-actions"><span class="step-state">${esc(t(ok ? '✓ Done' : 'Not yet'))}</span>
   ${ok && i < st.steps.length - 1 ? `<button type="button" class="exp-button" id="next-step">${esc(t('Next step →'))}</button>` : ''}
   ${ok && i === st.steps.length - 1 && S.stageIndex < STAGES.length - 1 ? `<button type="button" class="exp-button" id="next-stage">${esc(t('Next stage →'))}</button>` : ''}
   <button type="button" class="mini-link" id="show-solution">${esc(t('Show a solution'))}</button>
   <button type="button" class="mini-link" id="reset-step">${esc(t('Reset this step'))}</button></div>`;
}
$('#step-card').addEventListener('click', e => {
 const id = e.target.id;
 if (id === 'reset-step') { pushUndo(); S.st = startState(step()); uploads.clear(); showImages(); changed(); layout(); fitGraph(); say('Back to the start. Ctrl Z undoes it.'); }
 if (id === 'show-solution') { pushUndo(); step().solve(S.st); changed(); say('This is one possible solution. Ctrl Z brings your settings back.'); }
 if (id === 'next-step') { saveData(); S.step++; enterStep(); }
 if (id === 'next-stage') { saveData(); S.stageIndex++; S.step = 0; store.set('stage', S.stageIndex); enterStep(); }
});
let lastOk = null, lastCard = '';
function checkProgress() {
 const ok = stepDone(S.step);
 if (ok) { S.done[doneKey(S.step)] = true; store.set('done', S.done); }
 if (ok && lastOk === false) setTimeout(() => say(tr('✓ Step done: {s}', { s: t(step().title) })), 700);
 const key = `${S.stageIndex}|${S.step}|${ok}|${document.documentElement.lang}`;
 if (key !== lastCard) { renderGuide(); renderStepCard(); lastCard = key; }
 lastOk = ok;
}
function changed(save = true) {
 const st = S.st, se = st.settings;
 if (st.values.emissionStrength >= 1) { if (se.engine === 'cycles') st.flags.emit_cycles = true; else if (se.raytracing) st.flags.emit_eevee_rt = true; }
 if (save) saveData();
 updateFields(); applyMaterial(); checkProgress();
}
function enterStep() {
 loadData(); S.undo = []; S.redo = []; uploads.clear(); clearPending();
 const visible = new Set(S.st.nodes);
 $$('.node').forEach(n => { n.hidden = !visible.has(n.dataset.node); });
 lastOk = null; lastCard = ''; lastOk = stepDone(S.step);
 renderStageSwitch(); showImages(); changed(false); layout(); fitGraph();
 say('Material ready. Drag from an output to an input to connect; drag a connected input away to disconnect.');
}
onLangChange(() => { lastCard = ''; renderStageSwitch(); checkProgress(); updateFields(); presetOptions(); });

// Keyboard
let overEditor = false;
$('#app').addEventListener('pointerenter', () => { overEditor = true; }); $('#app').addEventListener('pointerleave', () => { overEditor = false; });
window.addEventListener('keydown', e => {
 if (e.key === 'Escape') { if (detached) { S.st.links[detached.to] = detached.from; S.undo.pop(); detached = null; socketDown = null; updateFields(); } clearPending(); say('Cancelled.'); return; }
 if (e.target.closest('input[type=number], input[type=color], select, textarea')) return;
 const ctrl = e.ctrlKey || e.metaKey, low = e.key.toLowerCase();
 if (ctrl && low === 'z' && overEditor) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
 else if (ctrl && low === 'y' && overEditor) { e.preventDefault(); redo(); }
 else if (e.key === 'Home' && overEditor) { e.preventDefault(); fitGraph(); say('View All (Home): every node fits in the editor.'); }
});
for (const [button, dialog] of [['#help', '#help-dialog'], ['#credits', '#credits-dialog']]) $(button).onclick = () => $(dialog).showModal();
$$('dialog').forEach(d => { d.querySelectorAll('.dialog-close,.dialog-close-action').forEach(b => b.onclick = () => d.close()); d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }); });

// ─── Preview ─────────────────────────────────────────────────────────────────
let renderer, scene, camera, controls, mesh, material, coordinateShader, ground, backdrop, emitLight, lights = [], renderFailed = false, renderDirty = true, applyRevision = 0, pmrem;
const refract = { eeveeProbesOnly: true };
const loader = new THREE.TextureLoader();
const baseTextures = new Map(), usedTextures = new Map(), envs = new Map();
function getBaseTexture(u) { if (!baseTextures.has(u)) baseTextures.set(u, loader.loadAsync(u).catch(error => { baseTextures.delete(u); throw error; })); return baseTextures.get(u); }
async function textureFor(nodeId, invert = false) {
 const u = nodeId && imageOf(nodeId); if (!u) return null;
 const cs = S.st.cs[nodeId], key = `${u}|${cs}|${invert}`;
 if (!usedTextures.has(key)) {
  const source = await getBaseTexture(u);
  if (!usedTextures.has(key)) {
   const tex = invert ? new THREE.CanvasTexture(invertImage(source.image)) : source.clone();
   tex.needsUpdate = true; tex.colorSpace = cs === 'sRGB' ? THREE.SRGBColorSpace : THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
   tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1; usedTextures.set(key, tex);
  }
 }
 return usedTextures.get(key);
}
const ENV = { room: { intensity: .8, lights: true, ground: true }, studio: { intensity: .55 }, sunset: { intensity: .5 }, overcast: { intensity: .9 }, dark: { intensity: .06, lights: false, ground: true, bg: 0x0c0d10 } };
function setEnvironment(name) {
 if (!envs.has(name)) {
  if (name === 'room' || name === 'dark') { if (!envs.has('room')) { const env = new RoomEnvironment(); envs.set('room', { env: pmrem.fromScene(env, .04).texture, bg: null }); env.dispose(); } envs.set(name, envs.get('room')); }
  else {
   const tex = new THREE.DataTexture(makeHdri(name, 0, 512, 256), 512, 256, THREE.RGBAFormat, THREE.FloatType);
   tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.LinearSRGBColorSpace; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
   envs.set(name, { env: pmrem.fromEquirectangular(tex).texture, bg: tex });
  }
 }
 const e = envs.get(name), cfg = ENV[name] || ENV.room;
 scene.environment = e.env; scene.environmentIntensity = cfg.intensity;
 scene.background = cfg.bg != null ? new THREE.Color(cfg.bg) : e.bg; scene.backgroundIntensity = cfg.intensity; scene.backgroundBlurriness = .35;
 for (const l of lights) l.visible = !!cfg.lights;
 ground.visible = !!cfg.ground;
 $('#viewer').classList.toggle('dark-world', name === 'dark');
}
let geoKey = '', basePos = null, baseNrm = null, dispKey = '';
// Displacement is done on the CPU, like a Displace modifier: every vertex moves along its normal by
// (height − Midlevel) × Scale, then the normals are recomputed so the shading follows the new shape.
const heightData = new Map();
function heightPixels(img) {
 if (!heightData.has(img)) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); heightData.set(img, g.getImageData(0, 0, c.width, c.height)); }
 return heightData.get(img);
}
const srgbToLinear = c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
// Several height sources add up: the material displacement and the Displace modifier.
function displace(sources) {
 const g = mesh.geometry, pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
 const key = geoKey + '|' + sources.map(o => `${o.img?.src?.length}|${o.img?.src?.slice(-40)}|${o.cs}|${o.mid}|${o.scale}`).join('/');
 if (key === dispKey) return; dispKey = key;
 if (!sources.length) { pos.array.set(basePos); nrm.array.set(baseNrm); pos.needsUpdate = nrm.needsUpdate = true; g.computeBoundingSphere(); return; }
 const samplers = sources.map(({ img, cs, mid, scale }) => {
  const d = heightPixels(img), W = d.width, H = d.height, p = d.data;
  const at = (i, j) => { const k = (((j + H) % H) * W + ((i + W) % W)) * 4; const c = p[k] / 255; return cs === 'sRGB' ? srgbToLinear(c) : c; };
  return (u, v) => {
   const x = ((u % 1 + 1) % 1) * W - .5, y = (1 - ((v % 1 + 1) % 1)) * H - .5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
   return ((at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy - mid) * scale;
  };
 });
 for (let i = 0; i < pos.count; i++) {
  let h = 0; for (const f of samplers) h += f(uv.getX(i), uv.getY(i));
  pos.setXYZ(i, basePos[i * 3] + baseNrm[i * 3] * h, basePos[i * 3 + 1] + baseNrm[i * 3 + 1] * h, basePos[i * 3 + 2] + baseNrm[i * 3 + 2] * h);
 }
 pos.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
}
// The board stands behind the object, facing the camera, so glass always has something to refract.
function placeBackdrop() {
 const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
 backdrop.position.copy(controls.target).addScaledVector(dir, -3.2).setY(.35); backdrop.lookAt(camera.position.x, .35, camera.position.z);
}
function setGeometry(shape, level) {
 const n = 2 ** level, key = `${shape}|${shape === 'sphere' ? 0 : n}`;
 if (key === geoKey) return; geoKey = key;
 mesh.geometry.dispose();
 mesh.geometry = shape === 'sphere' ? new THREE.SphereGeometry(1.15, 160, 110) : shape === 'cube' ? new THREE.BoxGeometry(1.85, 1.85, 1.85, Math.min(n, 128), Math.min(n, 128), Math.min(n, 128)) : new THREE.PlaneGeometry(2.7, 2.7, n, n);
 mesh.rotation.set(0, shape === 'cube' ? .48 : 0, 0); mesh.position.y = shape === 'cube' ? .05 : .12;
 material.side = shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide; material.needsUpdate = true;
 basePos = mesh.geometry.attributes.position.array.slice(); baseNrm = mesh.geometry.attributes.normal.array.slice(); dispKey = '';
 camera.position.set(shape === 'plane' ? 1.6 : 3.5, shape === 'plane' ? .7 : 2.1, shape === 'plane' ? 4.1 : 4.3); controls.target.set(0, .1, 0); controls.update();
 placeBackdrop();
}
const emptyMaterial = new THREE.MeshBasicMaterial({ color: 0x080808 });
let features = '';
async function applyMaterial() {
 if (!material || renderFailed) return;
 const rev = ++applyRevision, st = S.st, v = st.values, se = st.settings, graph = resolveGraph(st.links), dm = displacementMode(st);
 const inv = input => !!sourceFor(st.links, input)?.invert;
 // With Bump Only (or Displacement and Bump), the displacement height also bends the shading like a Bump node.
 const bumpNode = graph.bump || (dm.bumps ? graph.displacement : null);
 try {
  const [base, rough, metal, normal, bump, alpha, disp, modTex] = await Promise.all([
   textureFor(graph.base, inv('bsdf:base')), textureFor(graph.rough, graph.roughInvert), textureFor(graph.metallic, inv('bsdf:metallic')),
   textureFor(graph.normal), textureFor(bumpNode), textureFor(graph.alpha, inv('bsdf:alpha')), textureFor(dm.moves ? graph.displacement : null),
   textureFor(se.dispMod && st.nodes.includes('height') ? 'height' : null)]);
  if (rev !== applyRevision) return;
  setGeometry(st.shape, effectiveLevel(st)); setEnvironment(st.env);
  backdrop.visible = !!st.backdrop;
  Object.assign(material, { map: base, roughnessMap: rough, metalnessMap: metal, normalMap: normal, bumpMap: bump, alphaMap: alpha });
  const sources = [];
  if (disp) sources.push({ img: disp.image, cs: st.cs[graph.displacement], mid: v.dispMid, scale: v.dispScale });
  if (modTex && se.modStrength > 0) sources.push({ img: modTex.image, cs: st.cs.height, mid: se.modMid, scale: se.modStrength });
  displace(sources);
  // Coat Tint colours what is under the coat (an approximation of light going through a tinted varnish).
  const tint = new THREE.Color(v.coatTint), base3 = new THREE.Color(base ? '#ffffff' : v.base);
  if (v.coat > 0) base3.multiply(new THREE.Color(1, 1, 1).lerp(tint, v.coat));
  material.color.copy(base3);
  material.roughness = rough ? 1 : v.roughness; material.metalness = metal ? 1 : v.metallic;
  material.ior = v.ior; material.transmission = v.transmission; material.thickness = st.shape === 'plane' ? 0 : 1.2;
  material.clearcoat = v.coat; material.clearcoatRoughness = v.coatRough;
  material.sheen = v.sheen; material.sheenRoughness = Math.max(.07, v.sheenRough); material.sheenColor.set(v.sheenTint);
  material.specularIntensity = v.specLevel * 2; material.specularColor.set(v.specTint);
  material.anisotropy = v.aniso; material.anisotropyRotation = v.anisoRot * Math.PI * 2;
  material.iridescence = v.tfThick > 0 ? 1 : 0; material.iridescenceIOR = v.tfIor; material.iridescenceThicknessRange = [v.tfThick, v.tfThick];
  material.emissive.set(v.emission); material.emissiveIntensity = v.emissionStrength;
  material.normalScale.set(v.strength, v.strength);
  material.bumpScale = graph.bump ? v.bumpStrength * 6 : v.dispScale * 25;
  material.opacity = alpha ? 1 : v.alpha; material.transparent = !alpha && v.alpha < 1; material.alphaTest = alpha ? .5 : 0; material.depthWrite = !material.transparent;
  extras.coatF0.value = ((v.coatIor - 1) / (v.coatIor + 1)) ** 2;
  extras.sss.value = v.subsurface;
  extras.sssWrap.value.set(v.subRadiusX, v.subRadiusY, v.subRadiusZ).multiplyScalar(v.subScale * 9).clampScalar(0, 1.5);
  coordinateShader.update(st.links, v, { ...graph, bump: bumpNode }, mesh.geometry);
  mesh.material = graph.visible ? material : emptyMaterial;
  // Emission lights the floor and the board: Cycles always, EEVEE only with Raytracing (and weaker).
  const glow = graph.visible && v.emissionStrength > 0 && emissionLights(se);
  emitLight.visible = glow; emitLight.color.set(v.emission); emitLight.intensity = v.emissionStrength * (se.engine === 'cycles' ? 1.6 : .8);
  refract.eeveeProbesOnly = !refractsScene(se);
  bloom.on = glareVisible(se); bloom.threshold = se.glareThreshold; bloom.strength = se.glareStrength; bloom.size = se.glareSize;
  const f = [base, rough, metal, normal, bump, alpha].map(Boolean).join() + material.transparent + material.alphaTest + (v.transmission > 0) + (v.coat > 0) + (v.sheen > 0) + (v.aniso > 0) + (v.tfThick > 0);
  if (f !== features) { features = f; material.needsUpdate = true; }
  renderDirty = true;
  if (!graph.visible) say('Material Output is disconnected. Connect BSDF to Surface.');
  $('#render-status').classList.add('hidden');
 } catch (error) { if (rev !== applyRevision) return; $('#render-status').textContent = 'A texture could not be loaded. Try another image or reset the scene.'; $('#render-status').classList.remove('hidden'); console.error('Texture loading failed', error); }
}
// Extra shader code on top of three.js: coat IOR and a wrap-lighting approximation of subsurface scattering
// (light bleeds past the terminator further for the colours with a bigger Radius).
const extras = { coatF0: { value: .04 }, sss: { value: 0 }, sssWrap: { value: new THREE.Vector3(.5, .1, .05) } };
function installExtras(mat) {
 const prev = mat.onBeforeCompile;
 mat.onBeforeCompile = (shader, r) => {
  prev(shader, r);
  shader.uniforms.labCoatF0 = extras.coatF0; shader.uniforms.labSss = extras.sss; shader.uniforms.labSssWrap = extras.sssWrap;
  const pars = THREE.ShaderChunk.lights_physical_pars_fragment.replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
   `float labNL = dot( geometryNormal, directLight.direction );
    vec3 labWrapped = clamp( ( vec3( labNL ) + labSssWrap ) / ( vec3( 1.0 ) + labSssWrap ), 0.0, 1.0 ) * directLight.color;
    reflectedLight.directDiffuse += mix( irradiance, labWrapped, labSss ) * BRDF_Lambert( material.diffuseColor );`);
  shader.fragmentShader = 'uniform float labCoatF0, labSss; uniform vec3 labSssWrap;\n' + shader.fragmentShader
   .replace('#include <lights_physical_pars_fragment>', pars)
   .replace('#include <lights_physical_fragment>', THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoatF0 = vec3( 0.04 );', 'material.clearcoatF0 = vec3( labCoatF0 );'));
 };
}
// ─── Glare (Bloom) as a compositor pass ──────────────────────────────────────
// The scene is rendered into a linear HDR image; pixels brighter than Threshold are blurred at several
// sizes and added back, then the result is tone mapped to the screen (like Render Layers → Glare → Composite).
const bloom = {
 on: false, threshold: 1, strength: 1, size: .5, target: null, levels: [], quad: null, w: 1, h: 1,
 init() {
  const rt = (w, h, samples = 0) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: samples > 0 });
  this.target = rt(1, 1, 4);
  this.levels = Array.from({ length: 5 }, () => [rt(1, 1), rt(1, 1)]);
  const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  this.bright = new THREE.ShaderMaterial({ uniforms: { src: { value: null }, threshold: { value: 1 } }, vertexShader: vs, fragmentShader: 'uniform sampler2D src; uniform float threshold; varying vec2 vUv; void main(){ vec3 c = texture2D(src, vUv).rgb; float l = max(max(c.r, c.g), c.b); gl_FragColor = vec4(c * smoothstep(threshold, threshold * 1.25 + 0.05, l), 1.0); }', depthTest: false, depthWrite: false });
  this.blur = new THREE.ShaderMaterial({ uniforms: { src: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: vs, fragmentShader: 'uniform sampler2D src; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 c = texture2D(src, vUv).rgb * 0.2270; c += (texture2D(src, vUv + dir * 1.3846).rgb + texture2D(src, vUv - dir * 1.3846).rgb) * 0.3162; c += (texture2D(src, vUv + dir * 3.2308).rgb + texture2D(src, vUv - dir * 3.2308).rgb) * 0.0703; gl_FragColor = vec4(c, 1.0); }', depthTest: false, depthWrite: false });
  this.mix = new THREE.ShaderMaterial({ uniforms: { src: { value: null }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, b4: { value: null }, strength: { value: 1 }, size: { value: .5 } }, vertexShader: vs,
   fragmentShader: 'uniform sampler2D src, b0, b1, b2, b3, b4; uniform float strength, size; varying vec2 vUv; void main(){ vec3 c = texture2D(src, vUv).rgb; float w0 = 1.0 - size * 0.6, w4 = size; vec3 b = texture2D(b0, vUv).rgb * w0 + texture2D(b1, vUv).rgb * mix(w0, w4, 0.25) + texture2D(b2, vUv).rgb * mix(w0, w4, 0.5) + texture2D(b3, vUv).rgb * mix(w0, w4, 0.75) + texture2D(b4, vUv).rgb * w4; gl_FragColor = vec4(c + b * strength * 0.5, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}', toneMapped: true, depthTest: false, depthWrite: false });
  this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright); this.qscene = new THREE.Scene(); this.qscene.add(this.quad); this.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
 },
 resize(w, h) {
  if (!this.target) this.init();
  const dpr = renderer.getPixelRatio(); this.w = Math.max(1, Math.round(w * dpr)); this.h = Math.max(1, Math.round(h * dpr));
  this.target.setSize(this.w, this.h);
  this.levels.forEach((pair, i) => { const k = 2 ** (i + 1); pair.forEach(t => t.setSize(Math.max(1, this.w / k | 0), Math.max(1, this.h / k | 0))); });
 },
 pass(mat, target) { this.quad.material = mat; renderer.setRenderTarget(target); renderer.render(this.qscene, this.qcam); },
 render() {
  if (!this.target) this.init();
  const clear = renderer.getClearAlpha(); renderer.setClearAlpha(1);
  renderer.setRenderTarget(this.target); renderer.render(scene, camera);
  this.bright.uniforms.src.value = this.target.texture; this.bright.uniforms.threshold.value = this.threshold;
  let src = this.target.texture;
  this.levels.forEach(([a, b], i) => {
   if (i === 0) { this.pass(this.bright, a); } else { this.blur.uniforms.src.value = src; this.blur.uniforms.dir.value.set(0, 0); this.pass(this.blur, a); }
   this.blur.uniforms.src.value = a.texture; this.blur.uniforms.dir.value.set(1 / a.width, 0); this.pass(this.blur, b);
   this.blur.uniforms.src.value = b.texture; this.blur.uniforms.dir.value.set(0, 1 / a.height); this.pass(this.blur, a);
   src = a.texture;
  });
  const m = this.mix.uniforms; m.src.value = this.target.texture; this.levels.forEach(([a], i) => { m['b' + i].value = a.texture; });
  m.strength.value = this.strength; m.size.value = this.size;
  this.pass(this.mix, null); renderer.setClearAlpha(clear);
 },
};
function renderFrame() { if (bloom.on) bloom.render(); else { renderer.setRenderTarget(null); renderer.render(scene, camera); } }

async function startRenderer() {
 const host = $('#viewer');
 try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x202329, 0);
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15; renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.prepend(renderer.domElement); renderer.domElement.setAttribute('aria-label', 'Interactive 3D object'); renderer.domElement.setAttribute('role', 'img');
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(38, 1, .1, 60); camera.position.set(3.5, 2.1, 4.3);
  controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, .1, 0); controls.enableDamping = true; controls.dampingFactor = .07; controls.enablePan = false; controls.minDistance = 1.6; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * .87; controls.autoRotateSpeed = .8; controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null }; controls.addEventListener('change', () => { renderDirty = true; });
  pmrem = new THREE.PMREMGenerator(renderer);
  const key = new THREE.DirectionalLight(0xfff2df, 2.1); key.position.set(-3, 6, 5); const fill = new THREE.DirectionalLight(0xcbdcff, .9); fill.position.set(4, 1, -3); lights = [key, fill]; scene.add(key, fill);
  material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .6, metalness: 0, ior: 1.5 }); coordinateShader = installCoordinates(material); installExtras(material);
  // A striped board behind the object, to see what glass refracts.
  const bc = document.createElement('canvas'); bc.width = 512; bc.height = 256; const bg2 = bc.getContext('2d');
  ['#e8453c', '#f2c12e', '#3aa35b', '#2f7bd9', '#8e44c9', '#f2f2f2', '#1e1e1e', '#e8863c'].forEach((c, i) => { bg2.fillStyle = c; bg2.fillRect(i * 64, 0, 64, 256); });
  bg2.fillStyle = '#ffffff'; for (let y = 0; y < 256; y += 32) bg2.fillRect(0, y, 512, 5);
  bg2.fillStyle = '#111'; bg2.font = 'bold 72px Inter, Arial, sans-serif'; bg2.fillText('Carrot Revolt', 150, 150);
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
  backdrop = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: btex, roughness: .8 }));
  backdrop.position.set(0, .3, -3.1); backdrop.visible = false; scene.add(backdrop);
  // EEVEE without Raytracing: transmission sees only the world, so the board is left out of the transmission pass.
  backdrop.onBeforeRender = (r, sc, cam, geo, mat) => { const rt = r.getRenderTarget(); const inTransmission = !!rt && rt !== bloom.target; mat.colorWrite = !(inTransmission && refract.eeveeProbesOnly); mat.depthWrite = mat.colorWrite; };
  emitLight = new THREE.PointLight(0xffffff, 0, 7, 2); emitLight.position.set(0, .12, 0); emitLight.visible = false; scene.add(emitLight);
  mesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 96, 64), material); mesh.position.y = .12; scene.add(mesh);
  ground = new THREE.Mesh(new THREE.CircleGeometry(2.7, 96), new THREE.MeshStandardMaterial({ color: 0x282b30, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.045; scene.add(ground);
  const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); bloom.resize(w, h); coordinateShader.resize(renderer); camera.aspect = w / h; camera.updateProjectionMatrix(); renderDirty = true; };
  new ResizeObserver(resize).observe(host); resize();
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); renderFailed = true; $('#render-status').textContent = 'The 3D preview paused. Reload the page to restore it.'; $('#render-status').classList.remove('hidden'); });
  (function frame() { requestAnimationFrame(frame); if (document.hidden || renderFailed) return; controls.update(); if (renderDirty || controls.autoRotate) { renderFrame(); renderDirty = false; } })();
  await applyMaterial();
 } catch (error) { renderFailed = true; $('#render-status').textContent = 'This browser could not start the 3D preview. Try an updated browser with hardware acceleration enabled. The node editor still works.'; $('#render-status').classList.remove('hidden'); console.error('Renderer setup failed', error); }
}
new ResizeObserver(() => fitGraph()).observe(viewport);
enterStep(); startRenderer();
// For tests and debugging.
window.__mat = { S, STAGES, NODE_SETS, solve: () => { step().solve(S.st); changed(); }, go: (a, b) => { saveData(); S.stageIndex = a; S.step = b; enterStep(); } };
$('#reset').onclick = () => document.getElementById('reset-step')?.click();
