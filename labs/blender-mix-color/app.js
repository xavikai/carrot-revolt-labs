import { onLangChange } from '../../i18n.js';
import { clamp, fields, hexToLinear, mixColor } from '../_procedural/core.js';
import {
  $, text, say, number, format, field, checkbox, select, options, modeOptions,
  shell, sampleView, paint, moveProbe, mark, schedule,
} from '../_procedural/ui.js';
import { groups, recipes } from './content.js';

const ui = {
  intro: ['Build a procedural material from two color layers and a Factor field. Inspect each input and the linear RGB result at the same point.',
    'Construeix un material procedural amb dues capes de color i un camp connectat a Factor. Inspecciona cada entrada i el resultat RGB lineal al mateix punt.',
    'Construye un material procedural con dos capas de color y un campo conectado a Factor. Inspecciona cada entrada y el resultado RGB lineal en el mismo punto.'],
  mode: ['Blend mode', 'Mode de mescla', 'Modo de mezcla'],
  layerA: ['A pattern', 'Patró d’A', 'Patrón de A'],
  layerB: ['B pattern', 'Patró de B', 'Patrón de B'],
  mask: ['Factor source', 'Origen del factor', 'Origen del factor'],
  strength: ['Factor multiplier', 'Multiplicador del factor', 'Multiplicador del factor'],
  threshold: ['Threshold', 'Llindar', 'Umbral'],
  swap: ['Swap A and B', 'Intercanvia A i B', 'Intercambia A y B'],
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
  controls: `<div class="node mix-node">
    <h2>Mix Color</h2>
    ${select('mode', ui.mode)}
    <div class="input-pair">${field('a', 'A', '#2c8294', { type: 'color' })}${field('b', 'B', '#ad6638', { type: 'color' })}</div>
    <div class="input-pair">${select('layerA', ui.layerA)}${select('layerB', ui.layerB)}</div>
    <button type="button" id="swap">${say(ui.swap)}</button>
    ${select('mask', ui.mask)}
    <div class="input-pair">
      ${field('factor', 'Factor', 1, { min: -1, max: 2, step: 0.01, type: 'range' })}
      ${field('threshold', say(ui.threshold), 0.58, { min: 0, max: 1, step: 0.01, type: 'range' })}
    </div>
    <div class="input-pair">
      ${checkbox('clamp-factor', 'Clamp Factor', true)}
      ${checkbox('clamp-result', 'Clamp Result')}
    </div>
  </div>`,
  visuals: `<div class="views mix-views">
    ${sampleView('view-a', 'A')}
    ${sampleView('view-b', 'B')}
    ${sampleView('view-mask', 'Factor')}
    ${sampleView('view-result', '')}
  </div>`,
  readout: '<output id="value" for="mode a b layerA layerB mask threshold factor u v clamp-factor clamp-result"></output><p id="note"></p>',
  docs: 'https://docs.blender.org/manual/en/4.5/render/shader_nodes/color/mix.html',
  next: ['blender-math', 'Math Lab'],
});

function refreshLanguage() {
  const recipe = $('recipe').value || '0';
  modeOptions(groups, groupNames, $('mode').value || 'Mix');
  options('recipe', recipes.map((entry, i) => [i, say(entry.title)]), recipe);
  for (const [id, entries] of [['layerA', patterns], ['layerB', patterns], ['mask', masks]]) {
    options(id, Object.entries(entries).map(([key, label]) => [key, say(label)]), $(id).value || Object.keys(entries)[0]);
  }
  for (const id of ['mode', 'layerA', 'layerB', 'mask', 'threshold']) text(id + '-label', say(ui[id]));
  text('swap', say(ui.swap));
  text('view-result-caption', say(ui.result));
  text('note', say(ui.note));
  redraw();
}

function applyRecipe() {
  const recipe = recipes[Number($('recipe').value)];
  for (const name of ['mode', 'a', 'b', 'mask', 'factor', 'threshold']) $(name).value = recipe[name];
  $('layerA').value = recipe.base ?? 'Solid';
  $('layerB').value = recipe.layer;
  for (const name of ['u', 'v']) $(name).value = $(name).defaultValue;
  $('clamp-factor').checked = true;
  $('clamp-result').checked = false;
  redraw();
}

function layer(color, source) {
  if (source === 'Solid') return () => color;
  return (u, v) => {
    const weight = fields[source](u, v, source === 'Bands' ? 15 : 7);
    return color.map(channel => channel + (1 - channel) * weight);
  };
}

function factorField(source, amount, threshold) {
  if (source === 'Constant') return () => amount;
  if (source === 'U' || source === 'Checker') return (u, v) => fields[source](u, v, 7) * amount;
  return (u, v) => {
    const sample = fields.Noise(u, v, 7);
    if (source === 'Hard Noise') return sample > threshold ? amount : 0;
    const t = clamp((sample - threshold + 0.07) / 0.14);
    return t * t * (3 - 2 * t) * amount;
  };
}

const rgb = values => values.map(format).join(', ');
function draw() {
  const mode = $('mode').value;
  const mask = $('mask').value;
  const amount = number('factor');
  const threshold = number('threshold');
  const clipFactor = $('clamp-factor').checked;
  const clipResult = $('clamp-result').checked;
  text('factor-label', (mask === 'Constant' ? 'Factor' : say(ui.strength)) + ' · ' + format(amount));
  text('threshold-label', say(ui.threshold) + ' · ' + format(threshold));
  $('threshold-field').hidden = mask !== 'Hard Noise' && mask !== 'Soft Noise';

  const a = layer(hexToLinear($('a').value), $('layerA').value);
  const b = layer(hexToLinear($('b').value), $('layerB').value);
  const factor = factorField(mask, amount, threshold);
  const effective = (u, v) => clipFactor ? clamp(factor(u, v)) : factor(u, v);
  const result = (u, v) => mixColor(mode, a(u, v), b(u, v), factor(u, v), clipFactor, clipResult);
  paint($('view-a'), a);
  paint($('view-b'), b);
  paint($('view-mask'), (u, v) => {
    const f = effective(u, v);
    return [f, f, f];
  });
  paint($('view-result'), result);
  mark(views);

  const u = number('u'), v = number('v');
  text('value', [
    `U ${format(u)} / V ${format(v)}`,
    `A (${rgb(a(u, v))})`, `B (${rgb(b(u, v))})`,
    say(ui.input) + ' ' + format(factor(u, v)),
    say(ui.applied) + ' ' + format(effective(u, v)),
    say(ui.result) + ' (' + rgb(result(u, v)) + ')',
  ].join(' · '));
  const [formula, ...use] = modes[mode];
  text('formula', formula);
  text('use', say(use) + ' ' + say(ui.explanation));
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
$('swap').addEventListener('click', () => {
  [$('a').value, $('b').value] = [$('b').value, $('a').value];
  [$('layerA').value, $('layerB').value] = [$('layerB').value, $('layerA').value];
  redraw();
});
moveProbe(views, redraw);
