// Carrot Revolt Labs · Workflow Lab · the nodes that organise a workflow: primitives (Int, Float, String) that
// drive widgets, an XY plot from a custom node pack, and a model file that a shared workflow expects.
import { NODES, TYPE_COLOR, CHECKPOINTS, SAMPLERS, SCHEDULERS, HANDLERS, registerNodes, addOptions, describeRecipe } from '../comfyui/engine.js';
import { KIT, KIND_RENDERERS, renderRecipe } from '../comfyui/render.js';

const W_ = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
const { canvas } = KIT;
Object.assign(TYPE_COLOR, { INT: '#7fc7a8', FLOAT: '#9fd5e8', STRING: '#a6e3a1' });

/* ── A model a shared workflow uses, which this computer does not have yet ── */
export const NEW_CKPT = 'photoreal_xl_v2.safetensors';
CHECKPOINTS[NEW_CKPT] = { arch: 'SDXL', native: 1024, look: 'xl' };
addOptions('CheckpointLoaderSimple', 'ckpt_name', [NEW_CKPT]);

/* ── Nodes ── */
const CTL = W_('control_after_generate', 'combo', 'fixed', { options: ['fixed', 'increment', 'decrement', 'randomize'] });
export const XY_AXES = ['none', 'cfg', 'steps', 'sampler_name', 'scheduler', 'seed', 'denoise'];
registerNodes({
  PrimitiveInt: { def: { title: 'Int', cat: ['utils', 'primitive'], w: 250, noWidgetSockets: true, outputs: [O('INT', 'INT')], widgets: [W_('value', 'int', 0, { min: 0, max: 2 ** 53, step: 1 }), CTL] } },
  PrimitiveFloat: { def: { title: 'Float', cat: ['utils', 'primitive'], w: 250, noWidgetSockets: true, outputs: [O('FLOAT', 'FLOAT')], widgets: [W_('value', 'float', 0, { min: -1e6, max: 1e6, step: .01 })] } },
  PrimitiveString: { def: { title: 'String', cat: ['utils', 'primitive'], w: 280, noWidgetSockets: true, outputs: [O('STRING', 'STRING')], widgets: [W_('value', 'string', '')] } },
  PrimitiveStringMultiline: { def: { title: 'String (Multiline)', cat: ['utils', 'primitive'], w: 360, noWidgetSockets: true, outputs: [O('STRING', 'STRING')], widgets: [W_('value', 'text', '')] } },
  XYPlotSampler: { def: { title: 'XY Plot (KSampler)', cat: ['sampling'], custom: 'xy-plot', w: 340, inputs: [I('model', 'MODEL'), I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('latent_image', 'LATENT'), I('vae', 'VAE')], outputs: [O('IMAGE', 'IMAGE')],
    widgets: [W_('seed', 'int', 156680208700286, { min: 0, max: 2 ** 53, step: 1 }), CTL, W_('steps', 'int', 20, { min: 1, max: 10000, step: 1 }), W_('cfg', 'float', 7, { min: 0, max: 100, step: .1 }), W_('sampler_name', 'combo', 'euler', { options: SAMPLERS }), W_('scheduler', 'combo', 'normal', { options: SCHEDULERS }), W_('denoise', 'float', 1, { min: 0, max: 1, step: .01 }),
      W_('x_axis', 'combo', 'cfg', { options: XY_AXES.slice(1) }), W_('x_values', 'string', '4, 7, 10'), W_('y_axis', 'combo', 'none', { options: XY_AXES }), W_('y_values', 'string', '')] } },
});
const prim = ({ w }) => [w.value];
for (const t of ['PrimitiveInt', 'PrimitiveFloat', 'PrimitiveString', 'PrimitiveStringMultiline']) HANDLERS[t] = prim;

// The values of one axis, checked as ComfyUI would check the widget.
const AXIS = {
  cfg: v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; },
  steps: v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 150 ? n : null; },
  denoise: v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null; },
  seed: v => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : null; },
  sampler_name: v => SAMPLERS.includes(v) ? v : null,
  scheduler: v => SCHEDULERS.includes(v) ? v : null,
};
const KEY = { cfg: 'cfg', steps: 'steps', denoise: 'denoise', seed: 'seed', sampler_name: 'sampler', scheduler: 'scheduler' };
export function parseAxis(axis, text) {
  if (axis === 'none') return { values: [null] };
  const raw = String(text || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  if (!raw.length) return { error: `${axis}: no values` };
  const values = []; for (const r of raw) { const v = AXIS[axis](r); if (v === null) return { error: `${axis}: '${r}' is not a valid value` }; values.push(v); }
  return { values };
}
HANDLERS.XYPlotSampler = ({ n, w, get }) => {
  const g = name => get(n.id, name), m = g('model'), pos = g('positive'), neg = g('negative'), lat = g('latent_image');
  const X = parseAxis(w.x_axis, w.x_values), Y = parseAxis(w.y_axis, w.y_values);
  const err = X.error || Y.error;
  if (err) return { runtime: { msg: 'xyValue', title: 'XY Plot (KSampler)', error: 'ValueError', detail: err, trace: '  File "custom_nodes/xy-plot/nodes.py", line 88, in parse_values', hint: { en: 'Write the values separated by commas, with names exactly as in the lists (sampler_name: euler, dpmpp_2m…).', ca: 'Escriu els valors separats per comes, amb els noms exactament com a les llistes (sampler_name: euler, dpmpp_2m…).', es: 'Escribe los valores separados por comas, con los nombres exactamente como en las listas (sampler_name: euler, dpmpp_2m…).' } } };
  const base = { model: m, pos, neg, latent: lat, seed: w.seed, steps: w.steps, cfg: w.cfg, sampler: w.sampler_name, scheduler: w.scheduler, denoise: w.denoise };
  const cells = [];
  for (const y of Y.values) for (const x of X.values) { const r = { ...base }; if (w.x_axis !== 'none') r[KEY[w.x_axis]] = x; if (y !== null) r[KEY[w.y_axis]] = y; cells.push({ recipe: r, x, y }); }
  return [{ kind: 'xygrid', cells, xs: X.values, ys: Y.values, xAxis: w.x_axis, yAxis: w.y_axis, w: lat.w * X.values.length, h: lat.h * Y.values.length, recipe: cells[0].recipe }];
};

/* ── The grid: every cell is a normal render, with the axis values written on the edges ── */
KIND_RENDERERS.xygrid = (v, opts = {}) => {
  const nx = v.xs.length, ny = v.ys.length, cell = Math.max(150, Math.min(256, Math.round(1024 / Math.max(nx, ny)))), fs = Math.round(cell * .12), top = Math.round(fs * 1.9), left = v.yAxis !== 'none' ? Math.round(cell * .85) : 0;
  const cv = canvas(left + nx * cell + 4, top + ny * cell + 4), c = cv.getContext('2d');
  c.fillStyle = '#f4f4f2'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#222'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `bold ${fs}px Inter, Arial, sans-serif`; v.xs.forEach((x, i) => c.fillText(`${v.xAxis === 'sampler_name' ? '' : `${v.xAxis} `}${x}`, left + i * cell + cell / 2, top / 2));
  if (left) v.ys.forEach((y, j) => { const cy = top + j * cell + cell / 2; c.font = `${Math.round(fs * .8)}px Inter, Arial, sans-serif`; c.fillText(v.yAxis, left / 2, cy - fs * .7); c.font = `bold ${fs}px Inter, Arial, sans-serif`; c.fillText(String(y).slice(0, 11), left / 2, cy + fs * .5); });
  v.cells.forEach((cl, k) => { const i = k % nx, j = Math.floor(k / nx), img = renderRecipe(describeRecipe(cl.recipe), { progress: opts.progress ?? 1 }); c.drawImage(img, left + i * cell + 2, top + j * cell + 2, cell - 4, cell - 4); });
  return cv;
};

/* ── For the history and the checklists ── */
export function outputExtra(img) { return img?.kind === 'xygrid' ? { xy: { xAxis: img.xAxis, yAxis: img.yAxis, xs: img.xs, ys: img.ys, cells: img.cells.length } } : {}; }
void NODES;
