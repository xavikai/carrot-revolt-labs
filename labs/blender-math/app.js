import { onLangChange } from '../../i18n.js';
import { clamp, mathValue } from '../_procedural/core.js';
import { graphPorts, replaceWire } from '../_procedural/node-links.js';
import { cablePath, renderNodeEditor } from '../_procedural/editor.js';
import { enableWiring } from '../_procedural/wire-ui.js';
import { $, text, say, number, format, select, options, modeOptions, shell, sampleView, paint, moveProbe, mark, schedule } from '../_procedural/ui.js';
import { groups, recipes } from './content.js';
import { compileMath, mathGraph } from './graph.js';
import { plain } from './plain.js';
import { guidedExercise } from '../_procedural/guided.js';
import { guideName, guideSteps } from './guide.js';

const ui = {
  intro: ['Change a number in a node and watch what happens to the curve and the texture.',
    'Canvia un nombre en un node i mira què passa amb la gràfica i la textura.',
    'Cambia un número en un nodo y mira qué pasa con la gráfica y la textura.'],
  mode: ['Operation', 'Operació', 'Operación'],
  source: ['Source for A', 'Origen del valor A', 'Origen del valor A'],
  plot: ['Input A below · result at the left', 'Entrada A a baix · resultat a l’esquerra', 'Entrada A abajo · resultado a la izquierda'],
  pattern: ['Texture preview', 'Vista de la textura', 'Vista de la textura'],
  result: ['Result', 'Resultat', 'Resultado'],
  raw: ['Before Clamp', 'Abans de Clamp', 'Antes de Clamp'],
  note: ['Pick a point on the texture. The green dot shows that point’s A and result on the curve. Zero is black and one is white.',
    'Tria un punt de la textura. El punt verd mostra el valor A i el resultat d’aquell punt a la gràfica. El zero és negre i l’u és blanc.',
    'Elige un punto de la textura. El punto verde muestra el valor A y el resultado de ese punto en la gráfica. El cero es negro y el uno es blanco.'],
  held: ['The curve varies A and uses B and C from the selected point.', 'La corba varia A i fa servir la B i la C del punt triat.', 'La curva varía A y usa B y C del punto elegido.'],
  previewWire: ['The texture follows the cable into Emission. The curve still shows the Math node.', 'La textura segueix el cable que entra a Emission. La gràfica continua mostrant el resultat de Math.', 'La textura sigue el cable que entra en Emission. La gráfica sigue mostrando el resultado de Math.'],
  help: ['Drag between sockets to connect them. Pull a connected input into empty space to disconnect it. Try changing a number inside a node.',
    'Arrossega entre connectors per unir-los. Porta una entrada connectada a un espai buit per desconnectar-la. Prova de canviar un nombre dins d’un node.',
    'Arrastra entre conectores para unirlos. Lleva una entrada conectada a un espacio vacío para desconectarla. Prueba a cambiar un número dentro de un nodo.'],
  chooseSocket: ['Select the other socket.', 'Selecciona l’altre connector.', 'Selecciona el otro conector.'],
  connected: ['Cable connected.', 'Cable connectat.', 'Cable conectado.'],
  disconnected: ['Cable disconnected.', 'Cable desconnectat.', 'Cable desconectado.'],
  invalidWire: ['These sockets cannot be connected.', 'Aquests connectors no es poden unir.', 'Estos conectores no se pueden unir.'],
  fit: ['Fit', 'Enquadra', 'Encuadrar'],
  zoomIn: ['Zoom in', 'Apropa', 'Acercar'],
  zoomOut: ['Zoom out', 'Allunya', 'Alejar'],
};

const groupNames = {
  Functions: ['Calculations', 'Càlculs', 'Cálculos'],
  Comparison: ['Compare values', 'Compara valors', 'Compara valores'],
  Rounding: ['Round and repeat', 'Arrodoneix i repeteix', 'Redondea y repite'],
  Trigonometric: ['Waves and angles', 'Ones i angles', 'Ondas y ángulos'],
  Conversion: ['Angle conversion', 'Conversió d’angles', 'Conversión de ángulos'],
};
const sources = {
  U: ['Left to right (X)', 'D’esquerra a dreta (X)', 'De izquierda a derecha (X)'],
  V: ['Bottom to top (Y)', 'De baix a dalt (Y)', 'De abajo arriba (Y)'],
  Radial: ['Distance from center', 'Distància al centre', 'Distancia al centro'],
  Noise: ['Noise', 'Soroll', 'Ruido'],
  Manual: ['Constant number', 'Nombre constant', 'Número constante'],
};
const operations = Object.assign({}, ...Object.values(groups));

shell({
  title: 'Math Lab', intro: ui.intro,
  controls: `<div class="source-line">${select('source', ui.source)}</div>`,
  visuals: `<div class="views math-views">
    <figure><canvas id="plot" width="420" height="270" aria-labelledby="plot-caption"></canvas><figcaption id="plot-caption"></figcaption></figure>
    ${sampleView('pattern', '', 144)}
  </div>`,
  readout: '<output id="value"></output><p id="note"></p><p id="held-note" hidden></p><p id="texture-status" hidden></p>',
  docs: 'https://docs.blender.org/manual/en/latest/render/shader_nodes/utilities/math/math.html',
  next: ['blender-mix-color', 'Mix Color Lab'],
  followUp: true,
  diagram: `<section id="math-diagram" aria-labelledby="math-editor-title">
    <div class="editor-toolbar"><h2 id="math-editor-title">Shader Editor</h2>
      <div class="editor-zoom"><button id="math-out" type="button">−</button><output id="math-scale"></output>
        <button id="math-in" type="button">+</button><button id="math-fit" type="button"></button></div></div>
    <section class="guided-exercise" id="math-guide"></section>
    <p id="math-help"></p>
    <div class="math-mobile"><canvas id="plot-small" width="210" height="135" aria-labelledby="plot-caption"></canvas>
      <canvas id="pattern-small" width="224" height="144" aria-labelledby="pattern-caption"></canvas></div>
    <div id="math-graph-scroll" class="graph-scroll" tabindex="0" aria-labelledby="math-editor-title">
      <div id="math-graph" class="shader-graph"></div>
    </div><p id="math-status" role="status"></p>
  </section>`,
});
$('workspace').classList.add('math-workspace');
const viewport = $('math-graph-scroll'), host = $('math-graph');
let graph, links, values, source, mode, preset, zoom = null, layout;
const message = key => text('math-status', key ? say(ui[key]) : '');

function updateZoom() {
  if (!graph) return;
  const fit = (viewport.clientWidth - 8) / graph.width;
  const scale = zoom ?? Math.max(0.76, Math.min(1, fit));
  host.style.zoom = scale;
  text('math-scale', Math.round(scale * 100) + '%');
}

function render() {
  layout = renderNodeEditor(host, graph, links, values, say(ui.mode));
  modeOptions(groups, groupNames, mode);
  updateZoom();
}

function centerMath() {
  const math = graph.nodes.find(node => node.id === 'math');
  viewport.scrollTo((math.x + 81) * Number(host.style.zoom) - viewport.clientWidth / 2, 0);
}

function setupGraph() {
  graph = mathGraph(source, mode, operations[mode][0], preset);
  links = new Map(graph.edges.map(([from, to]) => [to, from]));
}

function refreshLanguage() {
  guide.render();
  options('recipe', recipes.map((entry, i) => [i, say(entry.title)]), $('recipe').value || '0');
  options('source', Object.entries(sources).map(([id, label]) => [id, say(label)]), source ?? recipes[0].source);
  for (const [id, key] of [['source-label','source'],['plot-caption','plot'],['pattern-caption','pattern'],
    ['note','note'],['held-note','held'],['texture-status','previewWire'],['math-help','help'],['math-fit','fit']]) text(id, say(ui[key]));
  $('math-out').setAttribute('aria-label', say(ui.zoomOut));
  $('math-in').setAttribute('aria-label', say(ui.zoomIn));
  if (graph) {
    cancelWiring();
    render();
    redraw();
  }
}

function applyRecipe() {
  cancelWiring();
  preset = recipes[Number($('recipe').value)];
  source = preset.source;
  mode = preset.mode;
  $('source').value = source;
  values = new Map();
  zoom = null;
  for (const id of ['u', 'v']) $(id).value = $(id).defaultValue;
  setupGraph();
  render();
  centerMath();
  message(null);
  redraw();
}

function plot(mode, valueAt, low, high, sample) {
  const canvas = $('plot');
  const ctx = canvas.getContext('2d');
  const left = 63, right = canvas.width - 16, top = 14, bottom = canvas.height - 35;
  const count = 400;
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const x = low + (high - low) * i / count;
    return [x, valueAt(x)];
  });
  const sampleY = valueAt(sample);
  const visible = points.map(([, y]) => y).filter(Number.isFinite).sort((a, b) => a - b);
  // Keep poles and very large results from flattening the rest of the curve.
  const trim = Math.floor(visible.length * 0.02);
  const min = Math.min(0, visible[trim] ?? 0);
  const max = Math.max(1, visible[visible.length - trim - 1] ?? 1);
  const px = x => left + (x - low) / (high - low) * (right - left);
  const py = y => bottom - (y - min) / (max - min) * (bottom - top);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '15px system-ui';
  ctx.fillStyle = '#bec8cf';
  for (let i = 0; i <= 4; i++) {
    const x = left + (right - left) * i / 4;
    const y = top + (bottom - top) * i / 4;
    ctx.strokeStyle = '#34414a';
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(format(max - (max - min) * i / 4), left - 5, y + 5, left - 7);
    ctx.textAlign = 'center';
    ctx.fillText(format(low + (high - low) * i / 4), x, bottom + 21, 55);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  ctx.beginPath();
  let previous;
  for (const [x, y] of points) {
    if (Number.isNaN(y)) {
      previous = undefined;
      continue;
    }
    const pole = mode === 'Tangent' && previous !== undefined
      && Math.floor((previous + Math.PI / 2) / Math.PI) !== Math.floor((x + Math.PI / 2) / Math.PI);
    const screenY = py(clamp(y, min - (max - min), max + (max - min)));
    if (pole || previous === undefined) ctx.moveTo(px(x), screenY);
    else ctx.lineTo(px(x), screenY);
    previous = x;
  }
  ctx.strokeStyle = '#ffaf63';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px(sample), top);
  ctx.lineTo(px(sample), bottom);
  ctx.strokeStyle = '#98dbc1';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(sample), py(clamp(sampleY, min, max)), 5, 0, Math.PI * 2);
  ctx.fillStyle = '#98dbc1';
  ctx.fill();
  ctx.restore();
}


function draw() {
  const study = compileMath(graph, links, values, source, mode);
  const u = number('u'), v = number('v');
  const a = study.a(u, v), b = study.b(u, v), c = study.c(u, v);
  const at = x => study.compare(x, b, c);
  const range = [a];
  for (let y = 0; y <= 8; y++) {
    for (let x = 0; x <= 8; x++) range.push(study.a(x / 8, y / 8));
  }
  let low = Math.min(...range.filter(Number.isFinite)), high = Math.max(...range.filter(Number.isFinite));
  if (!Number.isFinite(low) || low === high) {
    const center = Number.isFinite(a) ? a : 0;
    low = Math.min(-2, center - 1);
    high = Math.max(2, center + 1);
  }
  plot(mode, at, low, high, Number.isFinite(a) ? a : low);
  paint($('pattern'), study.texture);
  $('plot-small').getContext('2d').drawImage($('plot'), 0, 0, 210, 135);
  $('pattern-small').getContext('2d').drawImage($('pattern'), 0, 0);
  mark(['pattern']);
  const results = ['A ' + format(a) + ' → ' + say(ui.result) + ' ' + format(study.result(u, v))];
  if (study.limited) results.push(say(ui.raw) + ' ' + format(mathValue(mode, a, b, c)));
  text('value', results.join(' · '));
  $('held-note').hidden = !links.has('math.b') && !links.has('math.c');
  $('texture-status').hidden = links.get('preview.color') === 'math.value';
  const [, formula, ...technical] = operations[mode];
  text('formula', formula);
  text('use', say(plain[mode]));
  text('technical', say(technical));
  text('chain', preset.chain);
  text('task', say(preset.task));
  $('follow-up').hidden = preset.mode !== 'Greater Than';
  guide.update();
}

const redraw = schedule(draw);
const cancelWiring = enableWiring(viewport, host, {
  layout: () => layout, links: () => links, model: () => graphPorts(graph),
  apply: (next, feedback) => { links = next; render(); message(feedback); redraw(); },
  message, path: cablePath,
});

const guide = guidedExercise($('math-guide'), viewport, {
  name: guideName, steps: guideSteps,
  start: () => { $('recipe').value = '0'; applyRecipe(); },
  state: () => ({ links, values }),
  allowed: () => source === 'U' && mode === 'Fraction' && links.get('preview.color') === 'math.value'
    && links.get('scale.a') === 'source.x' && links.get('source.vector') === 'coord.uv',
});

host.addEventListener('input', event => {
  const field = event.target;
  const key = field.dataset.nodeValue;
  if (!key) return;
  if (key === 'math.mode') {
    mode = field.value;
    graph = mathGraph(source, mode, operations[mode][0], preset);
    const ports = graphPorts(graph);
    links = new Map([...links].filter(([to]) => ports.has(to)));
    cancelWiring();
    render();
    $('mode').focus({ preventScroll: true });
  } else if (field.type === 'checkbox') {
    values.set(key, field.checked);
  } else if (Number.isFinite(field.valueAsNumber)) {
    values.set(key, clamp(field.valueAsNumber, Number(field.min), Number(field.max)));
  }
  redraw();
});
host.addEventListener('focusout', event => {
  const field = event.target;
  if (field.type === 'number' && field.dataset.nodeValue) {
    field.value = values.get(field.dataset.nodeValue) ?? field.defaultValue;
  }
});
$('source').addEventListener('change', event => {
  guide.leave();
  cancelWiring();
  const previous = links;
  source = event.target.value;
  zoom = null;
  setupGraph();
  const ports = graphPorts(graph);
  const isSource = key => /^(coord|source|scale)\./.test(key);
  for (const [to, from] of previous) {
    if (to === 'math.a' || isSource(to) || isSource(from)) continue;
    links = replaceWire(ports, links, from, to) ?? links;
  }
  if (!previous.has('preview.color')) links.delete('preview.color');
  render();
  centerMath();
  message(null);
  redraw();
});
$('recipe').addEventListener('change', () => { guide.leave(); applyRecipe(); });
$('reset').addEventListener('click', () => {
  if (guide.isActive()) guide.begin();
  else { guide.leave(); applyRecipe(); }
});
for (const id of ['u', 'v']) $(id).addEventListener('input', redraw);
for (const [id, delta] of [['math-out', -0.12], ['math-in', 0.12], ['math-fit', 0]]) {
  $(id).addEventListener('click', () => {
    zoom = delta ? clamp(Number(host.style.zoom) + delta, 0.26, 1.45) : Math.min(1, (viewport.clientWidth - 8) / graph.width);
    updateZoom();
    centerMath();
  });
}
new ResizeObserver(updateZoom).observe(viewport);
moveProbe(['pattern'], redraw);
onLangChange(refreshLanguage);
refreshLanguage();
applyRecipe();
