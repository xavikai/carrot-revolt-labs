import { onLangChange } from '../../i18n.js';
import { clamp } from '../_procedural/core.js';
import {
  $, text, say, number, format, select, options, modeOptions,
  shell, sampleView, paint, moveProbe, mark, schedule,
} from '../_procedural/ui.js';
import { groups, recipes } from './content.js';
import { plain } from './plain.js';
import { guidedExercise } from '../_procedural/guided.js';
import { guideName, guideSteps } from './guide.js';
import { mixDiagram, compileMix } from './diagram.js';
import { cablePath, refreshRamp, renderNodeEditor } from '../_procedural/editor.js';
import { graphPorts } from '../_procedural/node-links.js';
import { enableWiring } from '../_procedural/wire-ui.js';

const ui = {
  intro: ['Mix two layers and see which parts of each layer show through.',
    'Barreja dues capes i mira quines parts de cadascuna queden a la vista.',
    'Mezcla dos capas y mira qué partes de cada una quedan a la vista.'],
  mode: ['Blend mode', 'Mode de mescla', 'Modo de mezcla'],
  layerA: ['A pattern', 'Patró d’A', 'Patrón de A'],
  layerB: ['B pattern', 'Patró de B', 'Patrón de B'],
  mask: ['Factor source', 'Origen del factor', 'Origen del factor'],
  swap: ['Swap A and B', 'Intercanvia A i B', 'Intercambia A y B'],
  graphNote: ['Drag between sockets to connect them. Pull a connected input into empty space to disconnect it. Edit unlinked values on the nodes. Enter and Delete also work on focused sockets.',
    'Arrossega entre connectors per unir-los. Porta una entrada connectada a un espai buit per desconnectar-la. Edita dins dels nodes els valors de les entrades lliures. També pots fer servir Retorn i Supr als connectors.',
    'Arrastra entre conectores para unirlos. Lleva una entrada conectada a un espacio vacío para desconectarla. Edita en los nodos los valores de las entradas libres. También puedes usar Intro y Supr en los conectores.'],
  chooseSocket: ['Select the other socket.', 'Selecciona l’altre connector.', 'Selecciona el otro conector.'],
  connected: ['Cable connected.', 'Cable connectat.', 'Cable conectado.'],
  disconnected: ['Cable disconnected.', 'Cable desconnectat.', 'Cable desconectado.'],
  invalidWire: ['These sockets cannot be connected.', 'Aquests connectors no es poden unir.', 'Estos conectores no se pueden unir.'],
  surface: ['Surface', 'Superfície', 'Superficie'],
  probeDetails: ['Color values at this point', 'Valors de color d’aquest punt', 'Valores de color de este punto'],
  noSurface: ['Connect Surface on Material Output to see the material.', 'Connecta Surface de Material Output per veure el material.', 'Conecta Surface de Material Output para ver el material.'],
  fit: ['Fit', 'Enquadra', 'Encuadrar'],
  zoomIn: ['Zoom in', 'Apropa', 'Acercar'],
  zoomOut: ['Zoom out', 'Allunya', 'Alejar'],
  applied: ['Effective factor', 'Factor aplicat', 'Factor aplicado'],
  input: ['Input factor', 'Factor d’entrada', 'Factor de entrada'],
  result: ['Result', 'Resultat', 'Resultado'],
  explanation: ['T is the blend at full strength. The result is A + f × (T − A) when the formula defines T. RGB modes calculate each channel separately. HSV modes use hue H, saturation S and value V.',
    'T és la mescla a intensitat màxima. Quan la fórmula defineix T, el resultat és A + f × (T − A). Els modes RGB calculen cada canal per separat. Els modes HSV fan servir el to H, la saturació S i el valor V.',
    'T es la mezcla a intensidad máxima. Cuando la fórmula define T, el resultado es A + f × (T − A). Los modos RGB calculan cada canal por separado. Los modos HSV usan el tono H, la saturación S y el valor V.'],
  note: ['Colors enter as sRGB swatches, the calculation uses linear RGB, and the preview encodes the visible 0–1 range in sRGB. The numeric result preserves values outside 0–1 when Clamp Result is off. The previews use opaque inputs and browser-generated patterns.',
    'Les mostres de color entren en sRGB, el càlcul es fa en RGB lineal i la previsualització mostra el rang visible 0–1 en sRGB. La lectura conserva els valors fora de 0–1 amb Clamp Result desactivat. Les entrades són opaques i els patrons es generen al navegador.',
    'Las muestras de color entran en sRGB, el cálculo se hace en RGB lineal y la vista previa muestra el rango visible 0–1 en sRGB. La lectura conserva los valores fuera de 0–1 con Clamp Result desactivado. Las entradas son opacas y los patrones se generan en el navegador.'],
};
const groupNames = {
  Blend: ['Blend', 'Mescla', 'Mezcla'],
  Contrast: ['Light and contrast', 'Llum i contrast', 'Luz y contraste'],
  HSV: ['HSV components', 'Components HSV', 'Componentes HSV'],
};
const patterns = {
  Solid: ['Solid', 'Uniforme', 'Uniforme'],
  Bands: ['Bands', 'Bandes', 'Bandas'],
  Noise: ['Noise', 'Soroll', 'Ruido'],
  Checker: ['Checker', 'Escacs', 'Damero'],
};
const masks = {
  Constant: ['Constant', 'Constant', 'Constante'],
  U: ['UV ramp', 'Rampa UV', 'Rampa UV'],
  'Hard Noise': ['Hard Noise', 'Soroll amb vora dura', 'Ruido con borde duro'],
  'Soft Noise': ['Soft Noise', 'Soroll amb vora suau', 'Ruido con borde suave'],
  Checker: patterns.Checker,
};
const modes = Object.assign({}, ...Object.values(groups));
const views = ['view-a', 'view-b', 'view-mask', 'view-result'];

shell({
  title: 'Mix Color Lab', intro: ui.intro,
  controls: `<div class="mix-sources">
    ${select('layerA', ui.layerA)}
    ${select('layerB', ui.layerB)}
    ${select('mask', ui.mask)}
    <button type="button" id="swap">${say(ui.swap)}</button>
  </div>`,
  visuals: `<div class="views mix-views">
    ${sampleView('view-a', 'A')}
    ${sampleView('view-b', 'B')}
    ${sampleView('view-mask', 'Factor')}
    ${sampleView('view-result', '')}
  </div><p id="mix-surface-status" hidden></p>`,
  readout: '<details><summary id="probe-details"></summary><output id="value"></output><p id="note"></p></details>',
  docs: 'https://docs.blender.org/manual/en/latest/render/shader_nodes/color/mix.html',
  next: ['blender-math', 'Math Lab'],
  followUp: true,
  diagram: `<section id="mix-diagram" aria-labelledby="mix-editor">
    <div class="mix-editor-bar"><h2 id="mix-editor">Shader Editor</h2>
      <div class="mix-zoom">
        <button id="mix-out" type="button">−</button><output id="mix-zoom-level"></output>
        <button id="mix-in" type="button">+</button><button id="mix-fit" type="button"></button>
      </div>
    </div>
    <section class="guided-exercise" id="mix-guide"></section>
    <p id="mix-graph-note"></p>
    <div class="mix-mobile-preview"><canvas id="live-result" width="224" height="144" aria-labelledby="view-result-caption"></canvas></div>
    <div id="mix-graph-scroll" class="graph-scroll" tabindex="0" aria-labelledby="mix-editor">
      <div id="mix-graph" class="shader-graph"></div>
    </div>
    <p id="mix-wire-status" role="status"></p>
  </section>`,
});
$('workspace').classList.add('mix-workspace');

let config, graph, links, values;
let layout = new Map(), zoom = null;
const sourceLists = [['layerA', patterns], ['layerB', patterns], ['mask', masks]];
const host = $('mix-graph'), viewport = $('mix-graph-scroll');
const modeValue = () => values.get('mix.mode') ?? config.mode;
const message = key => text('mix-wire-status', key ? say(ui[key]) : '');

function updateZoom() {
  const fit = (viewport.clientWidth - 8) / graph.width;
  const scale = zoom ?? Math.max(0.76, Math.min(1, fit));
  host.style.zoom = scale;
  text('mix-zoom-level', Math.round(scale * 100) + '%');
}

function refreshGraph() {
  layout = renderNodeEditor(host, graph, links, values, say(ui.mode));
  modeOptions(groups, groupNames, modeValue());
  updateZoom();
}

function reflectSources() {
  for (const [id, entries] of sourceLists) {
    options(id, Object.entries(entries).map(([key, label]) => [key, say(label)]), config[id]);
    text(id + '-label', say(ui[id]));
  }
}

function refreshLanguage() {
  guide.render();
  options('recipe', recipes.map((entry, i) => [i, say(entry.title)]), $('recipe').value || '0');
  for (const [id, key] of [['swap', 'swap'], ['view-result-caption', 'surface'],
    ['note', 'note'], ['probe-details','probeDetails'], ['mix-graph-note', 'graphNote'], ['mix-surface-status', 'noSurface'], ['mix-fit', 'fit']]) {
    text(id, say(ui[key]));
  }
  $('mix-out').setAttribute('aria-label', say(ui.zoomOut));
  $('mix-in').setAttribute('aria-label', say(ui.zoomIn));
  if (!config) return;
  cancelWiring();
  message(null);
  reflectSources();
  refreshGraph();
  redraw();
}

function defaultLinks() {
  return new Map(graph.edges.map(([from, to]) => [to, from]));
}

function centerMix() {
  const node = graph.nodes.find(node => node.id === 'mix');
  const scale = Number(host.style.zoom);
  viewport.scrollTo((node.x + 81) * scale - viewport.clientWidth / 2, 0);
}

function applyRecipe() {
  cancelWiring();
  const recipe = recipes[Number($('recipe').value)];
  config = {
    mode: recipe.mode, a: recipe.a, b: recipe.b, mask: recipe.mask,
    amount: recipe.factor, threshold: recipe.threshold,
    layerA: recipe.base ?? 'Solid', layerB: recipe.layer, clipFactor: true, clipResult: false,
  };
  graph = mixDiagram(config);
  links = defaultLinks();
  values = new Map();
  zoom = null;
  for (const name of ['u', 'v']) $(name).value = $(name).defaultValue;
  reflectSources();
  refreshGraph();
  centerMix();
  message(null);
  redraw();
}

const affectsLane = {
  layerA: key => key === 'mix.a' || /^(layera|rampa)\./.test(key),
  layerB: key => key === 'mix.b' || /^(layerb|rampb)\./.test(key),
  mask: key => key === 'mix.factor' || /^(uv|mask|noise|multiply)\./.test(key),
};

function changeSource(id, selection) {
  guide.leave();
  cancelWiring();
  const match = affectsLane[id];
  config[id] = selection;
  if (id === 'layerA' || id === 'layerB') {
    const side = id.at(-1).toLowerCase();
    config[side] = values.get('ramp' + side + '.left-color') ?? values.get('mix.' + side) ?? config[side];
  }
  graph = mixDiagram(config);
  const ports = graphPorts(graph);
  links = new Map([...links].filter(([to, from]) => !match(to) && !match(from) && ports.has(to) && ports.has(from)));
  for (const [from, to] of graph.edges) {
    if (match(from) || match(to)) links.set(to, from);
  }
  for (const key of values.keys()) {
    if (match(key)) values.delete(key);
  }
  refreshGraph();
  message(null);
  redraw();
}

function swapLayers() {
  guide.leave();
  cancelWiring();
  [config.a, config.b] = [config.b, config.a];
  [config.layerA, config.layerB] = [config.layerB, config.layerA];
  const opposite = key => key.replace(/^(layer|ramp)([ab])(?=\.)|^(mix\.)([ab])$/, (_, prefix, side, mix, mixSide) => (
    (prefix ?? mix) + ((side ?? mixSide) === 'a' ? 'b' : 'a')
  ));
  graph = mixDiagram(config);
  links = new Map([...links].map(([to, from]) => [opposite(to), opposite(from)]));
  values = new Map([...values].map(([key, value]) => [opposite(key), value]));
  reflectSources();
  refreshGraph();
  message(null);
  redraw();
}

const rgb = values => values.map(format).join(', ');
function draw() {
  const { a, b, factor, effective, result, surface } = compileMix(graph, links, values);
  paint($('view-a'), a);
  paint($('view-b'), b);
  paint($('view-mask'), (u, v) => {
    const f = effective(u, v);
    return [f, f, f];
  });
  const output = $('view-result');
  paint(output, surface);
  $('live-result').getContext('2d').drawImage(output, 0, 0);
  $('mix-surface-status').hidden = links.has('out.surface');
  mark(views);

  const u = number('u'), v = number('v');
  text('value', [
    `U ${format(u)} / V ${format(v)}`,
    `A (${rgb(a(u, v))})`, `B (${rgb(b(u, v))})`,
    say(ui.input) + ' ' + format(factor(u, v)),
    say(ui.applied) + ' ' + format(effective(u, v)),
    'Mix Color · ' + say(ui.result) + ' (' + rgb(result(u, v)) + ')',
  ].join(' · '));
  const [formula, ...use] = modes[modeValue()];
  text('formula', formula);
  text('use', say(plain[modeValue()]));
  text('technical', say(use) + ' ' + say(ui.explanation));
  const recipe = recipes[Number($('recipe').value)];
  text('chain', recipe.chain);
  text('task', say(recipe.task));
  $('follow-up').hidden = recipe.mode !== 'Mix';
  guide.update();
}

const redraw = schedule(draw);
const cancelWiring = enableWiring(viewport, host, {
  layout: () => layout,
  links: () => links,
  model: () => graphPorts(graph),
  apply: (next, feedback) => {
    links = next;
    refreshGraph();
    message(feedback);
    redraw();
  },
  message,
  path: cablePath,
});

const guide = guidedExercise($('mix-guide'), viewport, {
  name: guideName, steps: guideSteps,
  start: () => { $('recipe').value = '0'; applyRecipe(); },
  state: () => ({ links, values }),
  allowed: () => config.mask === 'Hard Noise' && modeValue() === 'Mix'
    && links.get('bsdf.base') === 'mix.result' && links.get('out.surface') === 'bsdf.bsdf'
    && !links.has('mix.a') && !links.has('mix.b')
    && (values.get('mix.a') ?? config.a) === recipes[0].a && (values.get('mix.b') ?? config.b) === recipes[0].b,
});

host.addEventListener('input', event => {
  const field = event.target;
  const key = field.dataset.nodeValue;
  if (!key) return;
  let value = field.value;
  if (field.type === 'number') {
    if (!Number.isFinite(field.valueAsNumber)) return;
    value = clamp(field.valueAsNumber, Number(field.min), Number(field.max));
  } else if (field.type === 'checkbox') value = field.checked;
  values.set(key, value);
  if (key.startsWith('ramp')) {
    const node = graph.nodes.find(node => key.startsWith(node.id + '.'));
    if (node?.op === 'ramp') refreshRamp(host, node.id, values, node.settings[1]);
  }
  redraw();
});
host.addEventListener('focusout', event => {
  const field = event.target;
  if (field.type === 'number' && field.dataset.nodeValue) {
    field.value = values.get(field.dataset.nodeValue) ?? field.defaultValue;
  }
});
for (const [id] of sourceLists) $(id).addEventListener('change', event => changeSource(id, event.target.value));
$('recipe').addEventListener('change', () => { guide.leave(); applyRecipe(); });
$('reset').addEventListener('click', () => {
  if (guide.isActive()) guide.begin();
  else { guide.leave(); applyRecipe(); }
});
$('swap').addEventListener('click', swapLayers);
for (const id of ['u', 'v']) $(id).addEventListener('input', redraw);
for (const [id, delta] of [['mix-out', -0.12], ['mix-in', 0.12], ['mix-fit', 0]]) {
  $(id).addEventListener('click', () => {
    zoom = delta ? clamp(Number(host.style.zoom) + delta, 0.26, 1.45) : Math.min(1, (viewport.clientWidth - 8) / graph.width);
    updateZoom();
    centerMix();
  });
}
new ResizeObserver(updateZoom).observe(viewport);
moveProbe(views, redraw);
onLangChange(refreshLanguage);
refreshLanguage();
applyRecipe();
