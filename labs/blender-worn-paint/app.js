import { initI18n, onLangChange } from '../../i18n.js';
import { $, format, number, paint, say, schedule, text } from '../_procedural/ui.js';
import { clamp } from '../_procedural/core.js';
import { defaults, grayscaleSampler, rampStops } from './material.js';
import { compileStudy, fieldBounds, graphPorts } from './editor-model.js';
import { paintMesh } from './mesh.js';
import { enableWiring } from './wire-ui.js';
import { shaderGraph } from './recipe.js';
import { stages } from './lesson.js';
import { variants } from './variants.js';

const variantsStage = stages.findIndex(stage => stage.variants);
const meshStage = stages.length - 1;

const copy = {
  title: ['Worn Paint Lab', 'Lab de pintura desgastada', 'Lab de pintura desgastada'],
  intro: ['Build a procedural painted surface. Follow the sockets from one wear mask to color, roughness and bump, then reproduce the material in Blender.',
    'Construeix una superfície pintada procedural. Segueix els cables que porten una màscara de desgast al color, la rugositat i el relleu, i reprodueix el material a Blender.',
    'Construye una superficie pintada procedural. Sigue los cables que llevan una máscara de desgaste al color, la rugosidad y el relieve, y reproduce el material en Blender.'],
  steps: ['Lesson steps', 'Passos del lab', 'Pasos del lab'],
  previous: ['Previous', 'Anterior', 'Anterior'],
  next: ['Next', 'Següent', 'Siguiente'],
  focus: ['Drag a cable between sockets. Pull a connected input into empty space to disconnect it. You can also select two sockets with Enter or remove a link with Delete.',
    'Arrossega un cable entre connectors. Arrossega una entrada connectada a un espai buit per desconnectar-la. També pots seleccionar dos connectors amb Retorn o eliminar un cable amb Supr.',
    'Arrastra un cable entre conectores. Arrastra una entrada conectada a un espacio vacío para desconectarla. También puedes seleccionar dos conectores con Intro o eliminar un cable con Supr.'],
  chooseSocket: ['Select the other socket.', 'Selecciona l’altre connector.', 'Selecciona el otro conector.'],
  invalidWire: ['These sockets cannot be connected.', 'Aquests connectors no es poden unir.', 'Estos conectores no se pueden unir.'],
  connected: ['Cable connected.', 'Cable connectat.', 'Cable conectado.'],
  disconnected: ['Cable disconnected.', 'Cable desconnectat.', 'Cable desconectado.'],
  divisions: ['Subdivisions per side', 'Subdivisions per costat', 'Subdivisiones por lado'],
  grid: ['Show mesh edges', 'Mostra les arestes', 'Muestra las aristas'],
  noSurface: ['Connect the shader to Material Output Surface to see the surface.',
    'Connecta el shader a Surface de Material Output per veure la superfície.',
    'Conecta el shader a Surface de Material Output para ver la superficie.'],
  fit: ['Fit', 'Enquadra', 'Encuadrar'],
  zoomOut: ['Zoom out', 'Allunya', 'Alejar'],
  zoomIn: ['Zoom in', 'Apropa', 'Acercar'],
  newLinks: ['Connections in this step', 'Connexions d’aquest pas', 'Conexiones de este paso'],
  fullLinks: ['Complete wiring', 'Connexions del material complet', 'Conexiones del material completo'],
  view: ['Material preview', 'Previsualització del material', 'Vista previa del material'],
  note: ['The preview uses browser-generated noise and a moving light. Blender’s noise and lighting will give a different pattern and finish.',
    'La previsualització fa servir soroll generat al navegador i una llum mòbil. El soroll i la il·luminació de Blender donaran un patró i un acabat diferents.',
    'La vista previa usa ruido generado en el navegador y una luz móvil. El ruido y la iluminación de Blender darán un patrón y acabado distintos.'],
  light: ['Light angle', 'Angle de la llum', 'Ángulo de la luz'],
  reset: ['Reset graph', 'Restableix el graf', 'Restablece el grafo'],
  download: ['Download the Blender file', 'Descarrega el fitxer de Blender', 'Descarga el archivo de Blender'],
  downloadNote: ['Four paint samples and a Displacement | Cycles scene. Select a sample in Shading and press Home to frame its nodes. The wear image is packed.',
    'Quatre mostres de pintura i una escena Displacement | Cycles. A Shading, selecciona una mostra i prem Home per enquadrar-ne els nodes. La imatge de desgast és dins del fitxer.',
    'Cuatro muestras de pintura y una escena Displacement | Cycles. En Shading, selecciona una muestra y pulsa Inicio para encuadrar sus nodos. La imagen de desgaste está dentro del archivo.'],
  inputExample: ['Input examples', 'Exemples d’entrades', 'Ejemplos de entradas'],
  downloadMask: ['Download the grayscale mask', 'Descarrega la màscara en grisos', 'Descarga la máscara de grises'],
  displacementDocs: ['Blender manual · Displacement', 'Manual de Blender · Displacement', 'Manual de Blender · Displacement'],
  docs: ['Blender manual · Bump', 'Manual de Blender · Bump', 'Manual de Blender · Bump'],
};

const channels = [
  ['mask', 0, ['Mask', 'Màscara', 'Máscara']],
  ['color', 1, ['Color', 'Color', 'Color']],
  ['roughness', 2, ['Roughness', 'Rugositat', 'Rugosidad']],
  ['height', 3, ['Height', 'Alçada', 'Altura']],
  ['material', 1, ['Material', 'Material', 'Material']],
  ['mesh', meshStage, ['Mesh', 'Malla', 'Malla']],
];

const state = { stage: 0, view: stages[0].view, variant: 'noise', edge: null, zoom: null,
  light: defaults.light, divisions: 24, grid: true };
const work = new Map();
const activeVariant = () => state.stage === variantsStage ? state.variant : 'noise';
const key = () => state.stage + ':' + activeVariant();
const recipe = () => shaderGraph(state.stage, defaults, activeVariant());
function edits() {
  if (!work.has(key())) {
    work.set(key(), {
      links: new Map(recipe().edges.map(([from, to]) => [to, from])),
      values: new Map(),
    });
  }
  return work.get(key());
}
function currentGraph() {
  const graph = recipe();
  const phases = new Map(graph.edges.map(([from, to, stage]) => [from + '>' + to, stage]));
  graph.edges = [...edits().links].map(([to, from]) => [from, to, phases.get(from + '>' + to) ?? state.stage]);
  return graph;
}
let layoutPorts = new Map();
const wireColors = { float: '#b8c2cc', vector: '#a89afc', shader: '#8cdda1', color: '#f6ca68' };
const nodeRoles = {
  noise: ['wear', 'desgast', 'desgaste'],
  limit: ['mask', 'màscara', 'máscara'],
  rough: ['roughness', 'rugositat', 'rugosidad'],
  depth: ['layer height', 'alçada de capa', 'altura de capa'],
  grain: ['grain', 'gra', 'grano'],
  sum: ['combined height', 'alçada combinada', 'altura combinada'],
  pigment: ['pigment', 'pigment', 'pigmento'],
};
const nodeWidth = 162;
const headerHeight = 32;
const portHeight = 26;
const optionHeight = 24;

$('lab').innerHTML = `
  <section class="lead">
    <p class="eyebrow">Blender · Shader Editor</p>
    <h1 id="title"></h1>
    <p id="intro"></p>
    <div class="download-panel">
      <a class="download-blend" id="download" href="./assets/worn-paint.blend" download></a>
      <p id="download-note"></p>
    </div>
  </section>
  <nav id="stage-nav" class="lesson-nav">
    ${stages.map((_, i) => `<button type="button" data-stage="${i}"></button>`).join('')}
  </nav>
  <section class="lesson-guide" aria-labelledby="stage-title">
    <h2 id="stage-title"></h2>
    <div id="variant-list" class="channel-list" role="group" hidden>
      ${Object.keys(variants).map(id => `<button type="button" data-variant="${id}"></button>`).join('')}
    </div>
    <ol id="instructions"></ol>
    <p id="task"></p>
    <p id="mask-file" hidden><a id="download-mask" href="./assets/wear-mask.png" download></a></p>
    <div class="navigation">
      <button type="button" id="previous"></button>
      <button type="button" id="next"></button>
    </div>
  </section>
  <div class="interaction-grid">
  <section class="editor" aria-labelledby="editor-title">
    <div class="editor-bar">
      <h2 id="editor-title">Shader Editor</h2>
      <div class="zoom">
        <button type="button" id="zoom-out">−</button>
        <output id="zoom-level"></output>
        <button type="button" id="zoom-in">+</button>
        <button type="button" id="fit"></button>
        <button type="button" id="reset"></button>
      </div>
    </div>
    <p class="wire-help" id="wire-help"></p>
    <div id="graph-scroll" class="graph-scroll" tabindex="0" aria-labelledby="editor-title">
      <div id="graph"></div>
    </div>
    <p id="wire-status" class="wire-status" role="status"></p>
    <div class="link-guide">
      <h3 id="link-title"></h3>
      <div id="connections"></div>
    </div>
  </section>
  <aside class="preview-dock">
    <figure class="material-preview">
      <figcaption id="preview-title"></figcaption>
      <div class="channel-list" id="channel-list" role="group">
        ${channels.map(([id]) => `<button type="button" data-view="${id}"></button>`).join('')}
      </div>
      <canvas id="sample" width="360" height="216" aria-labelledby="preview-title"></canvas>
      <p id="surface-status" hidden></p>
      <label class="preview-control" id="light-field"><span id="light-label"></span><input id="light" type="range" min="0" max="360" value="${defaults.light}"></label>
      <div class="mesh-controls" id="mesh-controls" hidden>
        <label><span id="divisions-label"></span>
          <select id="divisions"><option value="4">4</option><option value="12">12</option><option selected value="24">24</option><option value="48">48</option></select>
        </label>
        <label class="check"><input id="mesh-grid" type="checkbox" checked><span id="grid-label"></span></label>
      </div>
      <p class="preview-note" id="note"></p>
    </figure>
  </aside>
  </div>
  <footer>
    <a id="docs" href="https://docs.blender.org/manual/en/latest/render/shader_nodes/vector/bump.html"></a>
    <a id="displacement-docs" href="https://docs.blender.org/manual/en/latest/render/shader_nodes/displacement/displacement.html" hidden></a>
    <a href="../blender-math/">Math Lab</a><a href="../blender-mix-color/">Mix Color Lab</a>
  </footer>`;

function renderOption(option) {
  if (option.image) return '<div class="node-option node-image"><span></span>Wear Mask.png</div>';
  if (option.ramp) {
    const [[left, start], [right, end]] = editedStops().sort((a, b) => a[1] - b[1]);
    return `<div class="node-option ramp-option"><div class="node-ramp" style="--ramp-left:${left};--ramp-right:${right};--ramp-start:${start * 100}%;--ramp-end:${end * 100}%">
      <i></i><i></i></div></div>`;
  }
  if (option.stop !== undefined) {
    const i = option.stop;
    const [color, position] = editedStops()[i];
    return `<div class="node-option ramp-fields">
      <span>${i + 1}</span>${control('ramp.color' + i, 'Color Ramp · ' + (i + 1) + ' · Color', 'color', color)}
      ${control('ramp.stop' + i, 'Color Ramp · ' + (i + 1) + ' · Position', 'float', position)}</div>`;
  }
  if (option === 'Invert ☐') {
    return `<label class="node-option invert-option"><span>Invert</span><input type="checkbox" data-value="bump.invert" ${edits().values.get('bump.invert') ? 'checked' : ''}></label>`;
  }
  return `<div class="node-option"><span>${option}</span></div>`;
}

function editedStops() {
  return rampStops.map(([hex, position], i) => [
    edits().values.get('ramp.color' + i) ?? hex,
    edits().values.get('ramp.stop' + i) ?? position,
  ]);
}

function control(key, label, type, value) {
  if (type === 'color') return `<input type="color" class="socket-color" data-value="${key}" aria-label="${label}" value="${value}">`;
  const [min, max, step] = fieldBounds(key);
  return `<input type="number" class="socket-number" data-value="${key}" aria-label="${label}" value="${value}" min="${min}" max="${max}" step="${step}">`;
}

function graphDetails({ nodes, edges }) {
  const linked = new Set(edges.map(([, to]) => to));
  const ports = new Map();
  const endpoints = (edges[state.edge] ?? []).slice(0, 2).map(endpoint => endpoint.split('.')[0]);
  const html = nodes.map(node => {
    const title = nodeRoles[node.id] ? node.title + ' (' + say(nodeRoles[node.id]) + ')' : node.title;
    const sockets = (entries, output) => entries.map(([id, label, type, value], index) => {
      const key = node.id + '.' + id;
      const y = node.y + headerHeight + portHeight * (index + 0.5)
        + (output ? 0 : node.outputs.length * portHeight + node.options.length * optionHeight);
      const x = node.x + (output ? nodeWidth : 0);
      const duplicateLabel = entries.filter(([, name]) => name === label).length > 1;
      const name = title + ' · ' + label + (duplicateLabel ? ' ' + (index + 1) : '');
      ports.set(key, { x, y, type, output, label: name });
      const showValue = !output && value !== undefined && value !== '' && !linked.has(key);
      const display = showValue ? control(key, name, type, edits().values.get(key) ?? value) : '';
      return `<div class="socket ${output ? 'socket-out' : 'socket-in'}" style="--socket:${wireColors[type]}">
        <button type="button" class="port" data-port="${key}" aria-label="${name}"></button>
        <div class="socket-content${showValue ? ' socket-field' : ''}"><span>${label}</span>${display}</div></div>`;
    }).join('');
    return `<div class="shader-node family-${node.family}${endpoints.includes(node.id) ? ' node-highlight' : ''}" title="${title}" style="left:${node.x}px;top:${node.y}px">
      <div class="node-title"><span class="node-disclosure" aria-hidden="true"></span>${node.title}</div>
      ${sockets(node.outputs, true)}
      ${node.options.map(renderOption).join('')}
      ${sockets(node.inputs, false)}
    </div>`;
  }).join('');
  return { html, ports };
}

function wirePath(a, b, to) {
  if (to === 'depth.mask' && a.x === 567) {
    // Loop through the space between the two Math columns.
    const right = a.x + 21, left = b.x - 18, lane = activeVariant() === 'ramp' ? 530 : 378;
    return `M${a.x} ${a.y} C${right} ${a.y} ${right} ${a.y} ${right} ${a.y + 18} V${lane - 12} Q${right} ${lane} ${right - 12} ${lane} H${left + 12} Q${left} ${lane} ${left} ${lane + 12} V${b.y - 12} Q${left} ${b.y} ${b.x} ${b.y}`;
  }
  const handle = Math.min(106, Math.max(18, (b.x - a.x) * 0.54));
  return `M${a.x} ${a.y} C${a.x + handle} ${a.y} ${b.x - handle} ${b.y} ${b.x} ${b.y}`;
}

function updateZoom(modelWidth) {
  const fit = ($('graph-scroll').clientWidth - 8) / modelWidth;
  const zoom = state.zoom ?? Math.min(1, Math.max(0.73, fit));
  $('graph').style.zoom = zoom;
  text('zoom-level', Math.round(zoom * 100) + '%');
}

function renderGraph() {
  const graph = currentGraph();
  const { html, ports } = graphDetails(graph);
  layoutPorts = ports;
  const wires = graph.edges.map(([from, to, stage], index) => {
    const a = ports.get(from), b = ports.get(to);
    const active = state.edge === index;
    const dim = state.edge !== null && !active;
    return `<path d="${wirePath(a, b, to)}" fill="none" stroke="${active ? '#ffaf63' : wireColors[a.type]}"
      stroke-width="${active ? 4 : 2.6}" opacity="${dim ? 0.16 : stage === state.stage || state.stage >= 4 ? 0.95 : 0.55}"></path>`;
  });
  $('graph').style.width = graph.width + 'px';
  $('graph').style.height = graph.height + 'px';
  $('graph').innerHTML = `<svg class="wires" width="${graph.width}" height="${graph.height}" aria-hidden="true">${wires.join('')}<path class="drag-wire" fill="none" stroke="#ffaf63" stroke-width="3"></path></svg>${html}`;
  updateZoom(graph.width);
}

function renderConnections() {
  const graph = currentGraph();
  const { ports } = graphDetails(graph);
  $('connections').innerHTML = graph.edges.map(([from, to, phase], index) => {
    if (state.stage < 4 && phase !== state.stage) return '';
    return `<button data-edge="${index}" type="button" aria-pressed="${state.edge === index}">
      ${ports.get(from).label} <span aria-hidden="true">→</span> ${ports.get(to).label}
    </button>`;
  }).join('');
}

function renderControls() {
  $('mesh-controls').hidden = state.view !== 'mesh';
  $('light-field').hidden = state.view !== 'material';
  text('light-label', say(copy.light) + ' · ' + format(state.light) + '°');
  $('surface-status').hidden = state.view !== 'material' || edits().links.has('output.surface');
  $('fit').setAttribute('aria-label', say(copy.fit));
  $('zoom-out').setAttribute('aria-label', say(copy.zoomOut));
  $('zoom-in').setAttribute('aria-label', say(copy.zoomIn));
  $('stage-nav').setAttribute('aria-label', say(copy.steps));
  $('channel-list').setAttribute('aria-label', say(copy.view));
  for (const [id, phase, label] of channels) {
    const button = document.querySelector(`[data-view="${id}"]`);
    button.hidden = phase > state.stage;
    button.textContent = say(label);
    button.setAttribute('aria-pressed', String(state.view === id));
  }
}

let imageSource;
const redraw = schedule(() => {
  const model = compileStudy(recipe(), edits().links, edits().values, { light: state.light, image: imageSource });
  if (state.view === 'mesh') paintMesh($('sample'), model, state.divisions, state.grid);
  else paint($('sample'), model[state.view]);
});

async function loadMaskImage() {
  const image = new Image();
  image.src = './assets/wear-mask.png';
  try {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    imageSource = grayscaleSampler(data, canvas.width, canvas.height);
    if (activeVariant() === 'image') redraw();
  } catch {
    // The procedural source used to generate the grayscale asset also serves as a fallback.
  }
}

function renderLesson() {
  const lesson = stages[state.stage];
  const exploring = state.stage === variantsStage;
  const demo = exploring ? variants[state.variant] : lesson;
  for (const [id, key] of [['title', 'title'], ['intro', 'intro'], ['previous', 'previous'], ['next', 'next'], ['wire-help', 'focus'],
    ['preview-title', 'view'], ['note', 'note'], ['reset', 'reset'], ['divisions-label', 'divisions'],
    ['grid-label', 'grid'], ['surface-status', 'noSurface'], ['displacement-docs', 'displacementDocs'],
    ['docs', 'docs'], ['fit', 'fit'], ['download', 'download'], ['download-note', 'downloadNote'],
    ['download-mask', 'downloadMask']]) text(id, say(copy[key]));
  $('variant-list').hidden = !exploring;
  $('displacement-docs').hidden = state.stage !== meshStage;
  $('variant-list').setAttribute('aria-label', say(copy.inputExample));
  $('mask-file').hidden = activeVariant() !== 'image';
  document.querySelectorAll('[data-variant]').forEach(button => {
    button.textContent = say(variants[button.dataset.variant].name);
    button.setAttribute('aria-pressed', String(button.dataset.variant === state.variant));
  });
  text('link-title', say(state.stage >= 4 ? copy.fullLinks : copy.newLinks));
  text('stage-title', say(lesson.title));
  text('task', say(demo.task));
  $('instructions').innerHTML = demo.steps.map(step => '<li>' + say(step) + '</li>').join('');
  document.querySelectorAll('[data-stage]').forEach((button, index) => {
    button.textContent = (index + 1) + ' · ' + say(stages[index].title);
    if (index === state.stage) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  $('previous').disabled = state.stage === 0;
  $('next').disabled = state.stage === stages.length - 1;
  renderGraph();
  renderConnections();
  renderControls();
  redraw();
}

function changeStage(stage) {
  cancelWiring();
  message(null);
  state.stage = stage;
  state.view = stages[stage].view;
  state.edge = null;
  state.zoom = null;
  renderLesson();
  $('graph-scroll').scrollTo(0, 0);
}

$('stage-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-stage]');
  if (button) changeStage(Number(button.dataset.stage));
});
$('previous').addEventListener('click', () => changeStage(state.stage - 1));
$('next').addEventListener('click', () => changeStage(state.stage + 1));
$('variant-list').addEventListener('click', event => {
  const button = event.target.closest('[data-variant]');
  if (!button) return;
  cancelWiring();
  message(null);
  state.variant = button.dataset.variant;
  state.edge = null;
  state.zoom = null;
  renderLesson();
  $('graph-scroll').scrollTo(0, 0);
});
$('channel-list').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  state.view = button.dataset.view;
  renderControls();
  redraw();
});
$('connections').addEventListener('click', event => {
  const button = event.target.closest('[data-edge]');
  if (!button) return;
  const index = Number(button.dataset.edge);
  state.edge = state.edge === index ? null : index;
  renderGraph();
  for (const item of $('connections').children) item.setAttribute('aria-pressed', String(Number(item.dataset.edge) === state.edge));
  if (state.edge !== null) {
    const graph = currentGraph();
    const { ports } = graphDetails(graph);
    const [from, to] = graph.edges[index];
    const zoom = Number($('graph').style.zoom);
    const x = (ports.get(from).x + ports.get(to).x) * zoom / 2;
    const y = (ports.get(from).y + ports.get(to).y) * zoom / 2;
    $('graph-scroll').scrollTo(x - $('graph-scroll').clientWidth / 2, y - $('graph-scroll').clientHeight / 2);
  }
});
function message(id) {
  text('wire-status', id ? say(copy[id]) : '');
}

function updateGraph() {
  state.edge = null;
  renderGraph();
  renderConnections();
  renderControls();
  redraw();
}

const cancelWiring = enableWiring($('graph-scroll'), $('graph'), {
  layout: () => layoutPorts,
  links: () => edits().links,
  model: () => graphPorts(recipe()),
  apply: (links, feedback) => {
    edits().links = links;
    updateGraph();
    message(feedback);
  },
  message,
  path: wirePath,
});

$('graph').addEventListener('input', event => {
  const target = event.target;
  const id = target.dataset.value;
  if (!id) return;
  let value = target.value;
  if (target.type === 'number') {
    if (!Number.isFinite(target.valueAsNumber)) return;
    const [min, max] = fieldBounds(id);
    value = clamp(target.valueAsNumber, min, max);
  } else if (target.type === 'checkbox') {
    value = target.checked;
  }
  edits().values.set(id, value);
  if (id.startsWith('ramp.')) {
    const [[a, lo], [b, hi]] = editedStops().sort((first, second) => first[1] - second[1]);
    const ramp = $('graph').querySelector('.node-ramp');
    for (const [name, value] of [['left', a], ['right', b], ['start', lo * 100 + '%'], ['end', hi * 100 + '%']]) {
      ramp.style.setProperty('--ramp-' + name, value);
    }
  }
  redraw();
});
$('graph').addEventListener('focusout', event => {
  if (event.target.type !== 'number' || !event.target.dataset.value) return;
  const field = event.target;
  field.value = edits().values.get(field.dataset.value) ?? field.defaultValue;
});
$('light').addEventListener('input', () => {
  state.light = number('light');
  renderControls();
  redraw();
});
$('divisions').addEventListener('change', () => {
  state.divisions = Number($('divisions').value);
  redraw();
});
$('mesh-grid').addEventListener('change', () => {
  state.grid = $('mesh-grid').checked;
  redraw();
});
$('reset').addEventListener('click', () => {
  cancelWiring();
  work.delete(key());
  message(null);
  updateGraph();
});

function changeZoom(delta) {
  const current = Number($('graph').style.zoom);
  const width = currentGraph().width;
  state.zoom = delta ? Math.max(0.28, Math.min(1.35, current + delta))
    : Math.min(1, ($('graph-scroll').clientWidth - 8) / width);
  updateZoom(width);
}
$('fit').addEventListener('click', () => changeZoom(0));
$('zoom-in').addEventListener('click', () => changeZoom(0.1));
$('zoom-out').addEventListener('click', () => changeZoom(-0.1));
new ResizeObserver(() => updateZoom(currentGraph().width)).observe($('graph-scroll'));

onLangChange(() => { cancelWiring(); message(null); renderLesson(); });
initI18n({ mount: '#language' });
renderLesson();
loadMaskImage();
