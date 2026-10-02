import { NODES, REQUIRED, connect, validate, executionOrder } from './core.js';
import dict from './i18n.js';
import { initI18n, tr, onLangChange, translate } from '../../i18n.js';

initI18n({ dictionaries: [dict], mount: '.site-header', append: true });

const lessons = [
  { title: 'Read the graph', kicker: '01 / INSPECT', copy: 'Open the checkpoint, KSampler and Save Image nodes. Follow the data from the model and prompts to the image output.', goal: 'Inspect Load Checkpoint, KSampler and Save Image.', hint: 'Click a node title. The inspector explains what comes in and what goes out.', links: REQUIRED },
  { title: 'Connect the workflow', kicker: '02 / BUILD', copy: 'The nodes are ready but their sockets are empty. Connect outputs to inputs with the same data type, then check the complete path.', goal: 'Make all nine connections in the basic text-to-image graph.', hint: 'Start at Load Checkpoint: MODEL goes to KSampler, CLIP goes to both text encoders, and VAE goes to VAE Decode.', links: [] },
  { title: 'Repair and queue', kicker: '03 / RUN', copy: 'This workflow cannot save an image yet. Find the two missing connections, repair them and queue a prompt to trace the execution order.', goal: 'Connect VAE and IMAGE, then queue the valid graph.', hint: 'VAE Decode needs the checkpoint VAE. Save Image needs the IMAGE from VAE Decode.', links: REQUIRED.slice(0, -2) }
];
const descriptions = {
  checkpoint: 'Loads one example model bundle. MODEL drives sampling; CLIP encodes prompt text; VAE decodes latent data into an image.',
  positive: 'Turns the positive prompt into CONDITIONING using CLIP. It describes what to guide the sampler toward.',
  negative: 'Turns the negative prompt into CONDITIONING using CLIP. It describes what to steer away from.',
  latent: 'Creates an empty LATENT canvas. Here it represents a 512 × 512 image space, before any visible pixels exist.',
  sampler: 'Uses MODEL, positive and negative CONDITIONING, and a LATENT input to produce sampled LATENT data. Seed, steps and CFG affect a real sampler.',
  decode: 'Uses the VAE to turn sampled LATENT data into a visible IMAGE.',
  save: 'Receives an IMAGE and writes it to the output folder in a real ComfyUI workflow. This lab only shows a schematic preview.'
};
const colors = { MODEL: '#b66fc7', CLIP: '#e0c363', VAE: '#e1746f', CONDITIONING: '#d3a45f', LATENT: '#a783e7', IMAGE: '#73c7a0' };
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const storageKey = 'carrot-comfy-flow-progress-v1';
let completed = [false, false, false];
try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (Array.isArray(saved) && saved.length === 3) completed = saved.map(Boolean); } catch { /* Storage may be disabled. */ }
let stage = 0, links = REQUIRED.map(link => [...link]), viewed = new Set(), picked = null, selected = null, runCount = 0, runToken = 0;
const fields = { positive: 'a small orange robot in a studio', negative: 'blurry, low contrast', seed: 42, steps: 20, cfg: 7 };

function saveProgress() { try { localStorage.setItem(storageKey, JSON.stringify(completed)); } catch { /* Optional persistence. */ } }
function feedback(message, kind = '', vars = {}) { $('feedback').textContent = tr(message, vars); $('feedback').className = 'feedback ' + kind; }
function setStage(index) {
  runToken++;
  stage = index; links = lessons[index].links.map(link => [...link]); viewed = new Set(); picked = null; selected = null; runCount = 0;
  $('preview').className = 'preview'; $('preview').innerHTML = '<span>' + esc(tr('Queue a valid workflow to see a schematic preview.')) + '</span>';
  $('trace').replaceChildren();
  render(); feedback('');
}
function renderNav() {
  $('lesson-nav').innerHTML = lessons.map((lesson, index) => '<button type="button" data-stage="' + index + '" aria-current="' + (stage === index) + '" class="' + (completed[index] ? 'done' : '') + '"><small>' + esc(tr(lesson.kicker)) + (completed[index] ? ' ✓' : '') + '</small>' + esc(tr(lesson.title)) + '</button>').join('');
}
function renderInspector() {
  const node = NODES.find(item => item.id === selected);
  $('inspect-title').textContent = node ? node.title : tr('Select a node');
  $('inspect-copy').textContent = node ? tr(descriptions[node.id]) : tr('Click a node title to see its job in the workflow.');
}
function socket(node, direction, name, type) {
  const chosen = picked && picked.node === node.id && picked.name === name && picked.direction === direction;
  const button = '<button type="button" class="socket' + (chosen ? ' selected' : '') + '" data-node="' + node.id + '" data-direction="' + direction + '" data-socket="' + name + '" style="--type-color:' + colors[type] + '" aria-label="' + esc(node.title + ' ' + name + ' ' + direction + ', ' + type) + '"></button>';
  if (direction === 'input') return '<div class="socket-row input">' + button + '<span>' + esc(name) + '</span><span class="type">' + type + '</span></div>';
  return '<div class="socket-row output"><span class="type">' + type + '</span><span>' + esc(name) + '</span>' + button + '</div>';
}
function nodeFields(id) {
  if (id === 'checkpoint') return '<div class="node-note">' + esc(tr('Example checkpoint · simulated')) + '</div>';
  if (id === 'positive' || id === 'negative') return '<label class="node-field">' + esc(tr('Prompt text')) + '<input data-field="' + id + '" value="' + esc(fields[id]) + '" aria-label="' + esc(tr(id === 'positive' ? 'Positive prompt' : 'Negative prompt')) + '"></label>';
  if (id === 'latent') return '<div class="node-note">512 × 512 · batch 1</div>';
  if (id === 'sampler') return '<div class="node-field duo"><label>Seed<input data-field="seed" type="number" min="0" max="99999" value="' + esc(fields.seed) + '"></label><label>Steps<input data-field="steps" type="number" min="1" max="100" value="' + esc(fields.steps) + '"></label><label>CFG<input data-field="cfg" type="number" min="1" max="20" step="0.5" value="' + esc(fields.cfg) + '"></label></div>';
  return '';
}
function renderNodes() {
  $('nodes').innerHTML = NODES.map(node => '<article class="node' + (selected === node.id ? ' selected' : '') + '" id="node-' + node.id + '" style="left:' + node.x + 'px;top:' + node.y + 'px"><h3><button type="button" data-select="' + node.id + '">' + esc(node.title) + '</button></h3><div class="node-body">' + Object.entries(node.inputs).map(([name, type]) => socket(node, 'input', name, type)).join('') + nodeFields(node.id) + Object.entries(node.outputs).map(([name, type]) => socket(node, 'output', name, type)).join('') + '</div></article>').join('');
  requestAnimationFrame(paintWires);
}
function paintWires() {
  const graph = $('graph').getBoundingClientRect();
  const socketCenter = (node, direction, name) => {
    const selector = '.socket[data-node="' + node + '"][data-direction="' + direction + '"][data-socket="' + name + '"]';
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return [rect.left + rect.width / 2 - graph.left, rect.top + rect.height / 2 - graph.top];
  };
  $('wires').innerHTML = links.map(([from, output, to, input]) => {
    const a = socketCenter(from, 'output', output), b = socketCenter(to, 'input', input);
    if (!a || !b) return '';
    const bend = Math.max(45, Math.abs(b[0] - a[0]) * .42);
    const type = NODES.find(node => node.id === from).outputs[output];
    return '<path class="wire" stroke="' + colors[type] + '" d="M' + a[0] + ',' + a[1] + ' C' + (a[0] + bend) + ',' + a[1] + ' ' + (b[0] - bend) + ',' + b[1] + ' ' + b[0] + ',' + b[1] + '"></path>';
  }).join('');
}
function render() {
  renderNav();
  $('step-label').textContent = tr(lessons[stage].kicker);
  $('step-title').textContent = tr(lessons[stage].title);
  $('step-copy').textContent = tr(lessons[stage].copy);
  $('goal').innerHTML = '<b>' + esc(tr('GOAL')) + '</b>' + esc(tr(lessons[stage].goal));
  $('solution').hidden = stage !== 1;
  $('link-count').textContent = tr('Connections: {n} / 9', { n: links.length });
  renderInspector(); renderNodes(); translate($('lesson-nav'));
}
function markComplete() { completed[stage] = true; saveProgress(); renderNav(); }
function check() {
  if (stage === 0) {
    const missing = ['checkpoint', 'sampler', 'save'].filter(id => !viewed.has(id));
    if (missing.length) return feedback('Inspect these nodes: {names}.', 'error', { names: missing.map(id => NODES.find(node => node.id === id).title).join(', ') });
  } else {
    const result = validate(links);
    if (!result.ready) {
      if (result.missing.length) return feedback('The graph is missing {n} required connection(s).', 'error', { n: result.missing.length });
      return feedback('Some connections lead to the wrong input. Check the data flow.', 'error');
    }
    if (stage === 2 && !runCount) return feedback('The graph is ready. Queue Prompt to see the execution order.', 'error');
  }
  markComplete(); feedback('Step complete. You can open the next exercise.', 'success');
}
function handleSocket(button) {
  const node = button.dataset.node, name = button.dataset.socket, direction = button.dataset.direction;
  if (direction === 'output') { picked = { node, name, direction }; feedback('Output selected. Now choose an input of the same type.'); renderNodes(); return; }
  if (!picked) {
    const before = links.length;
    links = links.filter(link => !(link[2] === node && link[3] === name));
    feedback(before === links.length ? 'Choose an output socket first.' : 'Connection removed.');
  } else {
    const result = connect(links, picked.node, picked.name, node, name);
    links = result.links; feedback(result.error || 'Connection added.', result.error ? 'error' : ''); picked = null;
  }
  $('link-count').textContent = tr('Connections: {n} / 9', { n: links.length });
  renderNodes();
}
async function queue() {
  const result = validate(links);
  if (!result.ready) { feedback('Complete the required connections before queuing.', 'error'); return; }
  const token = ++runToken, order = executionOrder(links);
  $('trace').replaceChildren(); $('preview').className = 'preview';
  feedback('Tracing the workflow…');
  for (const id of order) {
    if (token !== runToken) return;
    document.querySelectorAll('.node.running').forEach(node => node.classList.remove('running'));
    $('node-' + id)?.classList.add('running');
    const item = document.createElement('li'); item.textContent = NODES.find(node => node.id === id).title; $('trace').append(item);
    await new Promise(resolve => setTimeout(resolve, 220));
  }
  if (token !== runToken) return;
  document.querySelectorAll('.node.running').forEach(node => node.classList.remove('running'));
  const hue = ((Number(fields.seed) || 0) * 47) % 360;
  const preview = $('preview'); preview.className = 'preview generated'; preview.style.setProperty('--preview-a', 'hsl(' + hue + ' 52% 31%)'); preview.style.setProperty('--preview-b', 'hsl(' + ((hue + 70) % 360) + ' 65% 50%)');
  preview.innerHTML = '<span class="caption">' + esc(tr('Schematic preview · seed {n}', { n: fields.seed })) + '</span>';
  runCount++;
  if (stage === 2) markComplete();
  feedback(stage === 2 ? 'Workflow traced. Step complete.' : 'Workflow traced. This preview is not an AI image.', 'success');
}

$('lesson-nav').addEventListener('click', event => { const button = event.target.closest('[data-stage]'); if (button) setStage(Number(button.dataset.stage)); });
$('nodes').addEventListener('click', event => {
  const port = event.target.closest('.socket'); if (port) return handleSocket(port);
  const title = event.target.closest('[data-select]'); if (!title) return;
  selected = title.dataset.select; viewed.add(selected); renderInspector(); renderNodes();
});
$('nodes').addEventListener('input', event => { const field = event.target.dataset.field; if (field) fields[field] = event.target.value; });
$('check').addEventListener('click', check);
$('hint').addEventListener('click', () => feedback(lessons[stage].hint));
$('reset').addEventListener('click', () => { setStage(stage); feedback('Step reset.'); });
$('solution').addEventListener('click', () => { links = REQUIRED.map(link => [...link]); picked = null; render(); feedback('Connections shown. Trace each one before checking.'); });
$('queue').addEventListener('click', queue);
onLangChange(() => {
  render();
  const preview = $('preview');
  if (runCount) {
    preview.innerHTML = '<span class="caption">' + esc(tr('Schematic preview Â· seed {n}', { n: fields.seed })) + '</span>';
    feedback('Workflow traced. This preview is not an AI image.', 'success');
  } else {
    preview.innerHTML = '<span>' + esc(tr('Queue a valid workflow to see a schematic preview.')) + '</span>';
  }
});
setStage(0);
