import { getLang, initI18n, onLangChange } from '../../i18n.js';
import { clamp, displayByte } from './core.js';

export const say = ([en, ca, es]) => ({ en, ca, es })[getLang()] ?? en;
export const $ = id => document.getElementById(id);
export const text = (id, value) => { $(id).textContent = value; };
export const number = id => Number.isFinite($(id).valueAsNumber) ? $(id).valueAsNumber : Number($(id).defaultValue);
export const format = n => Math.abs(n) > 9999 || (n !== 0 && Math.abs(n) < 0.0001)
  ? n.toExponential(2) : String(Number(n.toFixed(4)));

export const labels = {
  recipe: ['Experiment', 'Experiment', 'Experimento'],
  reset: ['Reset experiment', 'Reinicia l’experiment', 'Reinicia el experimento'],
  formula: ['Formula and texture use', 'Fórmula i ús en textures', 'Fórmula y uso en texturas'],
  rebuild: ['Rebuild in Blender', 'Reprodueix-ho a Blender', 'Reprodúcelo en Blender'],
  probe: ['Sample a point', 'Mostreja un punt', 'Muestrea un punto'],
  docs: ['Blender manual', 'Manual de Blender', 'Manual de Blender'],
  edition: ['Blender · Shader Editor', 'Blender · Shader Editor', 'Blender · Shader Editor'],
  topic: ['Procedural texturing', 'Textures procedurals', 'Texturas procedurales'],
};

export function select(id, label) {
  return `<label><span id="${id}-label">${say(label)}</span><select id="${id}"></select></label>`;
}

export function options(id, entries, value) {
  const control = $(id);
  control.replaceChildren(...entries.map(([key, label]) => new Option(label, key)));
  control.value = value;
}

export function modeOptions(groups, names, value) {
  const control = $('mode');
  control.replaceChildren(...Object.entries(groups).map(([group, modes]) => {
    const list = document.createElement('optgroup');
    list.label = say(names[group]);
    list.append(...Object.keys(modes).map(name => new Option(name, name)));
    return list;
  }));
  control.value = value;
}

export function field(id, label, initial, { min, max, step = 'any', type = 'number' } = {}) {
  const bounds = min === undefined ? '' : ` min="${min}" max="${max}" step="${step}"`;
  return `<label id="${id}-field"><span id="${id}-label">${label}</span><input type="${type}" id="${id}" value="${initial}"${bounds}></label>`;
}

export function checkbox(id, label, checked = false) {
  return `<label class="check" id="${id}-field"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
}

export function sampleView(id, caption, height = 144) {
  return `<figure><div class="preview" id="${id}-view"><canvas id="${id}" width="224" height="${height}" aria-labelledby="${id}-caption"></canvas><span class="probe-dot" aria-hidden="true"></span></div><figcaption id="${id}-caption">${caption}</figcaption></figure>`;
}

export function coordinates() {
  return `<fieldset class="coordinates"><legend id="probe-title">${say(labels.probe)}</legend>
    ${field('u', 'U', 0.62, { min: 0, max: 1, step: 0.001, type: 'range' })}
    ${field('v', 'V', 0.41, { min: 0, max: 1, step: 0.001, type: 'range' })}
  </fieldset>`;
}

export function shell({ title, intro, controls, visuals, readout, next, docs, followUp = false, diagram = '' }) {
  $('lab').innerHTML = `
    <section class="lead">
      <p class="eyebrow" id="eyebrow"></p>
      <h1>${title}</h1>
      <p id="intro">${say(intro)}</p>
    </section>
    <form id="workspace" class="workspace" data-no-i18n>
      <section class="control-panel" aria-label="${title}">
        <div class="experiment">
          ${select('recipe', labels.recipe)}
          <button type="button" id="reset">${say(labels.reset)}</button>
        </div>
        ${controls}
      </section>
      <section class="results">
        ${visuals}
        ${coordinates()}
        <div class="readout">${readout}</div>
      </section>
      ${diagram}
      <section class="explanation">
        <div><h2 id="formula-title"></h2><code id="formula"></code><p id="use"></p></div>
        <div><h2 id="rebuild-title"></h2><code id="chain"></code><p id="task"></p>${followUp ? `<a id="follow-up" class="follow-up" href="../blender-worn-paint/" hidden></a>` : ''}</div>
      </section>
    </form>
    <footer data-no-i18n><a id="docs" href="${docs}"></a><a id="next" href="../${next[0]}/">${next[1]}</a></footer>`;
  const refresh = () => {
    text('eyebrow', say(labels.topic) + ' / ' + say(labels.edition));
    text('intro', say(intro));
    text('recipe-label', say(labels.recipe));
    text('reset', say(labels.reset));
    text('formula-title', say(labels.formula));
    text('rebuild-title', say(labels.rebuild));
    text('probe-title', say(labels.probe));
    text('docs', say(labels.docs));
    if (followUp) text('follow-up', say(['Build the full worn paint material', 'Construeix el material complet de pintura desgastada', 'Construye el material completo de pintura desgastada']));
  };
  onLangChange(refresh);
  refresh();
  initI18n({ mount: '#language' });
  $('workspace').addEventListener('submit', event => event.preventDefault());
}

export function paint(canvas, sample) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const offset = 4 * (x + y * width);
      const rgb = sample((x + 0.5) / width, v);
      image.data[offset] = displayByte(rgb[0]);
      image.data[offset + 1] = displayByte(rgb[1]);
      image.data[offset + 2] = displayByte(rgb[2]);
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function moveProbe(ids, redraw) {
  for (const id of ids) {
    $(id).addEventListener('pointerdown', event => {
      const box = event.currentTarget.getBoundingClientRect();
      $('u').value = clamp((event.clientX - box.left) / box.width);
      $('v').value = clamp(1 - (event.clientY - box.top) / box.height);
      redraw();
    });
  }
}

export function mark(ids) {
  for (const id of ids) {
    const view = $(id + '-view');
    view.style.setProperty('--u', number('u') * 100 + '%');
    view.style.setProperty('--v', (1 - number('v')) * 100 + '%');
  }
}

export function schedule(draw) {
  let frame;
  return () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  };
}
