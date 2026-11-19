import { initI18n, onLangChange } from '../../i18n.js';
import { $, format, number, paint, say, schedule, text } from '../_procedural/ui.js';
import { defaults, grayscaleSampler, materialSampler } from './material.js';
import { shaderGraph } from './recipe.js';
import { stages } from './lesson.js';
import { variants } from './variants.js';

const variantsStage = stages.length - 1;

const copy = {
  title: ['Worn Paint Lab', 'Lab de pintura desgastada', 'Lab de pintura desgastada'],
  intro: ['Build a procedural painted surface. Follow the sockets from one wear mask to color, roughness and bump, then reproduce the material in Blender.',
    'Construeix una superfície pintada procedural. Segueix els cables que porten una màscara de desgast al color, la rugositat i el relleu, i reprodueix el material a Blender.',
    'Construye una superficie pintada procedural. Sigue los cables que llevan una máscara de desgaste al color, la rugosidad y el relieve, y reproduce el material en Blender.'],
  steps: ['Lesson steps', 'Passos del lab', 'Pasos del lab'],
  previous: ['Previous', 'Anterior', 'Anterior'],
  next: ['Next', 'Següent', 'Siguiente'],
  focus: ['Select a connection to highlight its cable. Scroll sideways or use Fit to see the whole graph.',
    'Selecciona una connexió per ressaltar-ne el cable. Desplaça’t lateralment o fes servir Enquadra per veure tots els nodes.',
    'Selecciona una conexión para resaltar su cable. Desplázate lateralmente o usa Encuadrar para ver todos los nodos.'],
  fit: ['Fit', 'Enquadra', 'Encuadrar'],
  zoomOut: ['Zoom out', 'Allunya', 'Alejar'],
  zoomIn: ['Zoom in', 'Apropa', 'Acercar'],
  newLinks: ['Connections in this step', 'Connexions d’aquest pas', 'Conexiones de este paso'],
  fullLinks: ['Complete wiring', 'Connexions del material complet', 'Conexiones del material completo'],
  view: ['Material preview', 'Previsualització del material', 'Vista previa del material'],
  note: ['The preview uses browser-generated noise and a moving light. Blender’s noise and lighting will give a different pattern and finish.',
    'La previsualització fa servir soroll generat al navegador i una llum mòbil. El soroll i la il·luminació de Blender donaran un patró i un acabat diferents.',
    'La vista previa usa ruido generado en el navegador y una luz móvil. El ruido y la iluminación de Blender darán un patrón y acabado distintos.'],
  controls: ['Material settings', 'Ajustos del material', 'Ajustes del material'],
  reset: ['Reset values', 'Restableix els valors', 'Restablece los valores'],
  download: ['Download the Blender file', 'Descarrega el fitxer de Blender', 'Descarga el archivo de Blender'],
  downloadNote: ['Blender 5.3 · Four wired materials. Select a sample in Shading and press Home to frame its nodes. The wear image is packed.',
    'Blender 5.3 · Quatre materials connectats. A Shading, selecciona una mostra i prem Home per enquadrar-ne els nodes. La imatge de desgast és dins del fitxer.',
    'Blender 5.3 · Cuatro materiales conectados. En Shading, selecciona una muestra y pulsa Inicio para encuadrar sus nodos. La imagen de desgaste está dentro del archivo.'],
  inputExample: ['Input examples', 'Exemples d’entrades', 'Ejemplos de entradas'],
  downloadMask: ['Download the grayscale mask', 'Descarrega la màscara en grisos', 'Descarga la máscara de grises'],
  relief: ['Preview bump', 'Mostra el relleu', 'Muestra el relieve'],
  docs: ['Blender manual · Bump', 'Manual de Blender · Bump', 'Manual de Blender · Bump'],
};

const channels = [
  ['mask', 0, ['Mask', 'Màscara', 'Máscara']],
  ['color', 1, ['Color', 'Color', 'Color']],
  ['roughness', 2, ['Roughness', 'Rugositat', 'Rugosidad']],
  ['height', 3, ['Height', 'Alçada', 'Altura']],
  ['material', 1, ['Material', 'Material', 'Material']],
];

const controls = [
  ['scale', 0, 2, 16, 1, ['Noise scale', 'Escala del soroll', 'Escala del ruido']],
  ['threshold', 0, 0.25, 0.78, 0.01, ['Wear threshold', 'Llindar de desgast', 'Umbral de desgaste']],
  ['transition', 2, 0.02, 0.30, 0.01, ['Edge transition', 'Transició de la vora', 'Transición del borde']],
  ['paintRoughness', 2, 0, 1, 0.01, ['Paint roughness', 'Rugositat de la pintura', 'Rugosidad de la pintura']],
  ['primerRoughness', 2, 0, 1, 0.01, ['Primer roughness', 'Rugositat de la imprimació', 'Rugosidad de la imprimación']],
  ['grain', 3, 0, 0.30, 0.01, ['Grain', 'Gra', 'Grano']],
  ['strength', 3, 0, 1, 0.01, ['Bump strength', 'Força del relleu', 'Fuerza del relieve']],
  ['distance', 3, 0, 0.12, 0.001, ['Bump distance', 'Distància de Bump', 'Distancia de Bump']],
  ['light', 1, 0, 360, 1, ['Light angle', 'Angle de la llum', 'Ángulo de la luz']],
];

const state = { stage: 0, view: stages[0].view, variant: 'noise', edge: null, zoom: null, settings: { ...defaults } };
const activeVariant = () => state.stage === variantsStage ? state.variant : 'noise';
const currentGraph = () => shaderGraph(state.stage, state.settings, activeVariant());
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
    <p class="eyebrow">Blender 4.5 LTS · Shader Editor</p>
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
  <section class="editor" aria-labelledby="editor-title">
    <div class="editor-bar">
      <h2 id="editor-title">Shader Editor</h2>
      <div class="zoom">
        <button type="button" id="zoom-out">−</button>
        <output id="zoom-level"></output>
        <button type="button" id="zoom-in">+</button>
        <button type="button" id="fit"></button>
      </div>
    </div>
    <div id="graph-scroll" class="graph-scroll" tabindex="0" aria-labelledby="editor-title">
      <div id="graph"></div>
    </div>
    <div class="link-guide">
      <h3 id="link-title"></h3>
      <p id="wire-help"></p>
      <div id="connections"></div>
    </div>
  </section>
  <section class="experiment-grid">
    <figure class="material-preview">
      <figcaption id="preview-title"></figcaption>
      <div class="channel-list" id="channel-list" role="group">
        ${channels.map(([id]) => `<button type="button" data-view="${id}"></button>`).join('')}
      </div>
      <canvas id="sample" width="420" height="236" aria-labelledby="preview-title"></canvas>
      <p id="note"></p>
    </figure>
    <section class="material-controls" aria-labelledby="settings-title">
      <h2 id="settings-title"></h2>
      <div class="setting-fields">
        ${controls.map(([id, , min, max, step]) => `<label id="${id}-field">
          <span id="${id}-label"></span>
          <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${defaults[id]}">
        </label>`).join('')}
      </div>
      <label class="check" id="relief-field"><input type="checkbox" id="relief" checked><span id="relief-label"></span></label>
      <button type="button" id="reset"></button>
    </section>
  </section>
  <footer>
    <a id="docs" href="https://docs.blender.org/manual/en/4.5/render/shader_nodes/vector/bump.html"></a>
    <a href="../blender-math/">Math Lab</a><a href="../blender-mix-color/">Mix Color Lab</a>
  </footer>`;

function renderOption(option) {
  if (option.image) return '<div class="node-option node-image"><span></span>Wear Mask.png</div>';
  if (option.ramp) {
    const [[left, start], [right, end]] = option.ramp;
    return `<div class="node-option ramp-option"><div class="node-ramp" style="--ramp-left:${left};--ramp-right:${right};--ramp-start:${start * 100}%;--ramp-end:${end * 100}%">
      <i></i><i></i></div></div>`;
  }
  return `<div class="node-option"><span>${option}</span><span class="node-chevron" aria-hidden="true"></span></div>`;
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
      ports.set(key, { x, y, type, label: title + ' · ' + label + (duplicateLabel ? ' ' + (index + 1) : '') });
      const showValue = value !== undefined && value !== '' && !linked.has(key);
      const display = showValue ? type === 'color'
        ? `<span class="swatch" style="--swatch:${value}">${value}</span>`
        : `<span class="socket-value">${value}</span>` : '';
      return `<div class="socket ${output ? 'socket-out' : 'socket-in'}" style="--socket:${wireColors[type]}"><i></i>
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
  if (to === 'depth.mask') {
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
  const wires = graph.edges.map(([from, to, stage], index) => {
    const a = ports.get(from), b = ports.get(to);
    const active = state.edge === index;
    const dim = state.edge !== null && !active;
    return `<path d="${wirePath(a, b, to)}" fill="none" stroke="${active ? '#ffaf63' : wireColors[a.type]}"
      stroke-width="${active ? 4 : 2.6}" opacity="${dim ? 0.16 : stage === state.stage || state.stage >= 4 ? 0.95 : 0.55}"></path>`;
  });
  $('graph').style.width = graph.width + 'px';
  $('graph').style.height = graph.height + 'px';
  $('graph').innerHTML = `<svg class="wires" width="${graph.width}" height="${graph.height}" aria-hidden="true">${wires.join('')}</svg>${html}`;
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
  for (const [id, phase, , , , label] of controls) {
    const angle = id === 'light';
    $(id + '-field').hidden = phase > state.stage || (id === 'scale' && activeVariant() === 'image');
    text(id + '-label', say(label) + ' · ' + format(state.settings[id]) + (angle ? '°' : ''));
  }
  $('relief-field').hidden = state.stage < 3;
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
const redraw = schedule(() => paint($('sample'), materialSampler(state.settings, state.stage, state.view, activeVariant(), imageSource)));

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
    ['preview-title', 'view'], ['note', 'note'], ['settings-title', 'controls'], ['reset', 'reset'], ['relief-label', 'relief'],
    ['docs', 'docs'], ['fit', 'fit'], ['download', 'download'], ['download-note', 'downloadNote'],
    ['download-mask', 'downloadMask']]) text(id, say(copy[key]));
  $('variant-list').hidden = !exploring;
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
    $('graph-scroll').scrollLeft = x - $('graph-scroll').clientWidth / 2;
  }
});
for (const [id] of controls) {
  $(id).addEventListener('input', () => {
    state.settings[id] = number(id);
    renderControls();
    renderGraph();
    redraw();
  });
}
$('relief').addEventListener('change', () => {
  state.settings.relief = $('relief').checked;
  redraw();
});
$('reset').addEventListener('click', () => {
  state.settings = { ...defaults };
  for (const [id] of controls) $(id).value = defaults[id];
  $('relief').checked = defaults.relief;
  renderControls();
  renderGraph();
  redraw();
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

onLangChange(renderLesson);
initI18n({ mount: '#language' });
renderLesson();
loadMaskImage();
