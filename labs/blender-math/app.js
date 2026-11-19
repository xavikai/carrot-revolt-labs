import { onLangChange } from '../../i18n.js';
import { clamp, fields, mathValue } from '../_procedural/core.js';
import {
  $, text, say, number, format, field, checkbox, select, options, modeOptions,
  shell, sampleView, paint, moveProbe, mark, schedule,
} from '../_procedural/ui.js';
import { groups, recipes } from './content.js';

const ui = {
  intro: ['Turn coordinates and noise into masks, repeating bands and height maps. Compare the Math operation’s curve with the resulting pattern at the same point.',
    'Transforma coordenades i soroll en màscares, bandes repetides i mapes d’alçada. Compara la corba de l’operació Math amb el patró al mateix punt.',
    'Transforma coordenadas y ruido en máscaras, bandas repetidas y mapas de altura. Compara la curva de la operación Math con el patrón en el mismo punto.'],
  mode: ['Operation', 'Operació', 'Operación'],
  source: ['Input A source', 'Origen de l’entrada A', 'Origen de la entrada A'],
  gain: ['Input multiplier', 'Multiplicador d’entrada', 'Multiplicador de entrada'],
  offset: ['Input offset', 'Desplaçament d’entrada', 'Desplazamiento de entrada'],
  manual: ['Manual value', 'Valor manual', 'Valor manual'],
  plot: ['Operation curve · output versus A', 'Corba de l’operació · sortida en funció d’A', 'Curva de la operación · salida en función de A'],
  pattern: ['Output texture', 'Textura de sortida', 'Textura de salida'],
  result: ['Output', 'Sortida', 'Salida'],
  raw: ['Before Clamp', 'Abans de Clamp', 'Antes de Clamp'],
  note: ['The grayscale preview displays 0 as black and 1 as white. Read the value below to see negatives and values above 1. Noise uses a browser-generated field.',
    'La previsualització mostra el 0 en negre i l’1 en blanc. La lectura de sota mostra els valors negatius i els superiors a 1. El soroll es genera al navegador.',
    'La vista previa muestra el 0 en negro y el 1 en blanco. La lectura de abajo muestra los valores negativos y los superiores a 1. El ruido se genera en el navegador.'],
};

const groupNames = {
  Functions: ['Functions', 'Funcions', 'Funciones'],
  Comparison: ['Comparison', 'Comparació', 'Comparación'],
  Rounding: ['Rounding and repetition', 'Arrodoniment i repetició', 'Redondeo y repetición'],
  Trigonometric: ['Trigonometry', 'Trigonometria', 'Trigonometría'],
  Conversion: ['Angle conversion', 'Conversió d’angles', 'Conversión de ángulos'],
};
const sources = {
  U: ['UV · U', 'UV · U', 'UV · U'],
  V: ['UV · V', 'UV · V', 'UV · V'],
  Radial: ['Distance from center', 'Distància al centre', 'Distancia al centro'],
  Noise: ['Noise', 'Soroll', 'Ruido'],
  Manual: ui.manual,
};
const socketNames = { B: 'B', C: 'C', ε: 'Epsilon', d: 'Distance', M: 'Max', m: 'Min', i: 'Increment', s: 'Scale' };
const operations = Object.assign({}, ...Object.values(groups));

shell({
  title: 'Math Lab', intro: ui.intro,
  controls: `<div class="node">
    <h2>Math</h2>
    ${select('mode', ui.mode)}
    ${select('source', ui.source)}
    <div class="input-pair" id="transform">
      ${field('gain', say(ui.gain), 6)}
      ${field('offset', say(ui.offset), -2)}
    </div>
    ${field('manual', 'A', -0.25)}
    <div class="input-pair">${field('b', 'B', 1)}${field('c', 'C', 0.1)}</div>
    ${checkbox('clamp-result', 'Clamp')}
  </div>`,
  visuals: `<div class="views math-views">
    <figure><canvas id="plot" width="420" height="270" aria-labelledby="plot-caption"></canvas><figcaption id="plot-caption"></figcaption></figure>
    ${sampleView('pattern', '', 224)}
  </div>`,
  readout: '<output id="value" for="mode source manual gain offset b c u v clamp-result"></output><p id="note"></p>',
  docs: 'https://docs.blender.org/manual/en/5.4/render/shader_nodes/utilities/math/math.html',
  next: ['blender-mix-color', 'Mix Color Lab'],
});

function refreshLanguage() {
  const mode = $('mode').value || recipes[0].mode;
  const source = $('source').value || recipes[0].source;
  const recipe = $('recipe').value || '0';
  modeOptions(groups, groupNames, mode);
  options('source', Object.entries(sources).map(([id, name]) => [id, say(name)]), source);
  options('recipe', recipes.map((entry, i) => [i, say(entry.title)]), recipe);
  for (const id of ['mode', 'source', 'gain', 'offset']) text(id + '-label', say(ui[id]));
  text('plot-caption', say(ui.plot));
  text('pattern-caption', say(ui.pattern));
  text('note', say(ui.note));
  redraw();
}

function applyRecipe() {
  const recipe = recipes[Number($('recipe').value)];
  $('mode').value = recipe.mode;
  $('source').value = recipe.source;
  for (const name of ['gain', 'offset', 'b', 'c']) $(name).value = recipe[name];
  for (const name of ['manual', 'u', 'v']) $(name).value = $(name).defaultValue;
  $('clamp-result').checked = false;
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
  const mode = $('mode').value;
  const source = $('source').value;
  const manual = source === 'Manual';
  const gain = number('gain'), offset = number('offset');
  const [sockets, formula, ...use] = operations[mode];
  $('manual-field').hidden = !manual;
  $('transform').hidden = manual;
  $('b-field').hidden = sockets.length < 2;
  $('c-field').hidden = sockets.length < 3;
  if (sockets[1]) text('b-label', socketNames[sockets[1]]);
  if (sockets[2]) text('c-label', socketNames[sockets[2]]);
  const b = number('b'), c = number('c');
  const limited = $('clamp-result').checked;
  const inputAt = manual ? () => number('manual') : (u, v) => fields[source](u, v, 7) * gain + offset;
  const a = inputAt(number('u'), number('v'));
  const valueAt = x => mathValue(mode, x, b, c, limited);
  const result = valueAt(a);
  const raw = mathValue(mode, a, b, c);
  const bounds = manual ? [Math.min(-2, a), Math.max(2, a)] : [offset, offset + gain, a];
  const low = Math.min(...bounds), high = Math.max(...bounds);
  plot(mode, valueAt, low === high ? low - 1 : low, low === high ? high + 1 : high, a);
  paint($('pattern'), (u, v) => {
    const y = valueAt(inputAt(u, v));
    return [y, y, y];
  });
  mark(['pattern']);
  const inputs = ['A = ' + format(a)];
  if (sockets[1]) inputs.push(socketNames[sockets[1]] + ' = ' + format(b));
  if (sockets[2]) inputs.push(socketNames[sockets[2]] + ' = ' + format(c));
  inputs.push(say(ui.result) + ' = ' + format(result));
  if (limited) inputs.push(say(ui.raw) + ' = ' + format(raw));
  text('value', inputs.join(' · '));
  text('formula', formula);
  text('use', say(use));
  const recipe = recipes[Number($('recipe').value)];
  text('chain', recipe.chain);
  text('task', say(recipe.task));
}

const redraw = schedule(draw);
onLangChange(refreshLanguage);
refreshLanguage();
applyRecipe();
$('workspace').addEventListener('input', event => {
  if (event.target.id === 'recipe') applyRecipe();
  else redraw();
});
$('reset').addEventListener('click', applyRecipe);
moveProbe(['pattern'], redraw);
