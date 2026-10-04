// Carrot Revolt Labs · LoRA Lab · using LoRAs well, datasets, captions and training (simulated).
// Pip is an invented mascot (an orange robot with a green scarf and a star on its antenna). A LoRA teaches the
// model Pip; the simulator draws how much of Pip it learned, and what went wrong (fried, baked background,
// frozen pose, concept bleeding) from the dataset, the captions and the training settings.
import { LORAS, CATEGORIES, HANDLERS, TYPE_COLOR, effects, describeRecipe, registerNodes, addOptions } from '../comfyui/engine.js';
import { KIT, KIND_RENDERERS, RECIPE_HOOKS, renderBase } from '../comfyui/render.js';

const W_ = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
const { canvas, data, put, mapPixels, rng, hex, drawScene, drawSubject, stylize, sizeOf } = KIT;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
Object.assign(TYPE_COLOR, { LORA_MODEL: '#d3b4f0', LOSS_MAP: '#f0b4b4' });
if (!CATEGORIES.includes('training')) CATEGORIES.push('training');
export const TRIGGER = 'pip robot';

/* ── Datasets (folders in input/) ── */
export const DATASETS = {
  'pip_6_same_background': { n: 6, varied: false, captions: 'good', label: '6 pictures, same grey background' },
  'pip_20_varied_no_captions': { n: 20, varied: true, captions: 'none', label: '20 varied pictures, no captions' },
  'pip_20_varied_captions_everything': { n: 20, varied: true, captions: 'everything', label: '20 varied, captions describe everything' },
  'pip_20_varied': { n: 20, varied: true, captions: 'good', label: '20 varied, trigger + what changes' },
};
const CAPTION = { none: '', everything: 'pip robot, a small orange robot with a green scarf and a star antenna, {bg}', good: 'pip robot, {pose}, {bg}' };
const BGS = ['beach', 'forest', 'snow', 'desert', 'night', 'landscape'], POSES = ['standing', 'waving', 'sitting', 'from the side', 'close-up'];

/* ── Training (a model of what real training does) ── */
export function train({ dataset, steps, lr, rank, batch = 1 }) {
  const D = DATASETS[dataset] || DATASETS.pip_20_varied;
  const p = steps * batch * (lr / 1e-4) / (D.n * 30); // how far it got: ~0.7–2 is the good window
  const cap = rank >= 8 ? 1 : .78, speed = (rank >= 64 ? 1.4 : 1) * (D.n < 10 ? 2 : 1);
  const likeness = cap * clamp(p / .7);
  const over = clamp((p * speed - 2) / 2);
  const unstable = lr >= 8e-4 ? clamp(lr / 8e-4 * .55 + p * .05) : 0;
  return {
    concept: 'pip', trigger: TRIGGER, arch: 'SD1.5', trained: true, dataset, captions: D.captions, n: D.n, varied: D.varied, steps, lr, rank, batch, p: +p.toFixed(2),
    likeness: +likeness.toFixed(2), fried: +clamp(Math.max(unstable, over * .55)).toFixed(2), baked: +clamp(D.varied ? over * .7 : likeness * .9).toFixed(2), frozen: +clamp(over * .85 + (D.n < 10 ? .35 : 0)).toFixed(2), bleed: D.captions === 'none', sizeMB: Math.round(rank * 1.15 + 1),
  };
}
export function lossCurve(t, n = 60) { const r = rng(`loss:${t.steps}:${t.lr}:${t.rank}`), out = []; for (let i = 0; i < n; i++) { const k = (i + 1) / n * t.p; out.push(Math.max(.02, .16 * Math.exp(-k * 1.6) + .05 + (r() - .5) * .016 + (t.fried > .5 ? Math.sin(i * .9) * .04 * t.fried : 0))); } return out; }
// Ready-made LoRA files: a finished one, and the checkpoints of one training run saved every 250 steps.
const RUN = { dataset: 'pip_20_varied', lr: 1e-4, rank: 16 };
Object.assign(LORAS, {
  'pip_character.safetensors': { ...train({ ...RUN, steps: 1000 }), trained: false, name: 'pip_character.safetensors' },
  'pip_v1-000250.safetensors': { ...train({ ...RUN, steps: 250 }), trained: false },
  'pip_v1-000750.safetensors': { ...train({ ...RUN, steps: 750 }), trained: false },
  'pip_v1-001500.safetensors': { ...train({ ...RUN, steps: 1500 }), trained: false },
  'pip_v1-002500.safetensors': { ...train({ ...RUN, steps: 2500 }), trained: false },
});
addOptions('LoraLoader', 'lora_name', ['pip_character.safetensors', 'pip_v1-000250.safetensors', 'pip_v1-000750.safetensors', 'pip_v1-001500.safetensors', 'pip_v1-002500.safetensors']);

/* ── Nodes (ComfyUI's training nodes; dedicated trainers expose the same settings) ── */
registerNodes({
  LoadImageTextSetFromFolderNode: { def: { title: 'Load Image and Text Dataset from Folder', cat: ['training'], w: 340, inputs: [I('clip', 'CLIP')], outputs: [O('IMAGE', 'IMAGE'), O('CONDITIONING', 'CONDITIONING')], widgets: [W_('folder', 'combo', 'pip_6_same_background', { options: Object.keys(DATASETS) }), W_('resize_method', 'combo', 'None', { options: ['None', 'Stretch', 'Crop', 'Pad'] }), W_('width', 'int', 512, { min: -1, max: 10000, step: 8 }), W_('height', 'int', 512, { min: -1, max: 10000, step: 8 })] } },
  TrainLoraNode: { def: { title: 'Train LoRA', cat: ['training'], w: 340, inputs: [I('model', 'MODEL'), I('latents', 'LATENT'), I('positive', 'CONDITIONING')], outputs: [O('model_with_lora', 'MODEL'), O('lora', 'LORA_MODEL'), O('loss', 'LOSS_MAP')],
    widgets: [W_('batch_size', 'int', 1, { min: 1, max: 10000, step: 1 }), W_('grad_accumulation_steps', 'int', 1, { min: 1, max: 1024, step: 1 }), W_('steps', 'int', 16, { min: 1, max: 100000, step: 1 }), W_('learning_rate', 'float', .0005, { min: .0000001, max: 1, step: .00001 }), W_('rank', 'int', 8, { min: 1, max: 128, step: 1 }), W_('optimizer', 'combo', 'AdamW', { options: ['AdamW', 'Adam', 'SGD', 'RMSprop'] }), W_('loss_function', 'combo', 'MSE', { options: ['MSE', 'L1', 'Huber', 'SmoothL1'] }), W_('seed', 'int', 0, { min: 0, max: 2 ** 53, step: 1 }), W_('training_dtype', 'combo', 'bf16', { options: ['bf16', 'fp32'] }), W_('algorithm', 'combo', 'LoRA', { options: ['LoRA', 'LoHa', 'LoKr', 'OFT'] }), W_('gradient_checkpointing', 'combo', 'true', { options: ['true', 'false'] })] } },
  LoraModelLoader: { def: { title: 'Load LoRA Model', cat: ['loaders'], w: 280, inputs: [I('model', 'MODEL'), I('lora', 'LORA_MODEL')], outputs: [O('MODEL', 'MODEL')], widgets: [W_('strength_model', 'float', 1, { min: -100, max: 100, step: .01 })] } },
  SaveLoRANode: { def: { title: 'Save LoRA Weights', cat: ['loaders'], w: 300, inputs: [I('lora', 'LORA_MODEL')], widgets: [W_('prefix', 'string', 'loras/pip_v2')], output: true } },
  LossGraphNode: { def: { title: 'Plot Loss Graph', cat: ['training'], w: 300, inputs: [I('loss', 'LOSS_MAP')], widgets: [W_('filename_prefix', 'string', 'loss_graph')], output: true, outputImage: true, preview: true } },
});
const handlers = {
  LoadImageTextSetFromFolderNode: ({ w, get }) => { const D = DATASETS[w.folder]; return [{ kind: 'dataset', folder: w.folder, ...D, w: 512, h: 512 }, { prompt: { text: TRIGGER, subjects: [], settings: [], colors: [], styles: [], weights: {}, triggers: [TRIGGER] }, clip: get('clip'), controls: [], dataset: w.folder }]; },
  TrainLoraNode: ({ w, get }) => { const lat = get('latents'), m = get('model'), t = { ...train({ dataset: lat?.source?.folder, steps: w.steps, lr: w.learning_rate, rank: w.rank, batch: w.batch_size * w.grad_accumulation_steps }), name: 'trained (in memory)' }; return [{ ...m, loras: [...m.loras, { ...t, strength: 1, modelOnly: true }] }, t, { kind: 'loss', t, w: 512, h: 320 }]; },
  LoraModelLoader: ({ w, get }) => { const m = get('model'), l = get('lora'); return [{ ...m, loras: [...m.loras, { ...l, strength: w.strength_model, modelOnly: true }] }]; },
  SaveLoRANode: () => [],
  LossGraphNode: ({ get }) => [get('loss')],
};
for (const [t, fn] of Object.entries(handlers)) HANDLERS[t] = ctx => fn({ ...ctx, get: name => ctx.get(ctx.n.id, name) });

/* ── Drawing Pip ── */
const GENERIC = '#9aa5b1', PIP = '#ec8a2f';
function mixHex(a, b, t) { const A = hex(a), B = hex(b); return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join(''); }
export function drawPip(c, cx, by, s, L, look, r) {
  drawSubject(c, 'robot', cx, by, s, mixHex(GENERIC, PIP, clamp(L)), look, { r });
  if (L > .3) { c.save(); c.globalAlpha = clamp((L - .3) / .5); c.fillStyle = '#2f9a4b'; c.fillRect(cx - s * .24, by - s * .66, s * .48, s * .07); c.fillRect(cx + s * .1, by - s * .62, s * .07, s * .2); c.restore(); }
  if (L > .5) { c.save(); c.globalAlpha = clamp((L - .5) / .4); c.fillStyle = '#ffd34d'; const x = cx, y = by - s * 1.12, R = s * .07; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * .45 : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill(); c.restore(); }
}
KIND_RENDERERS.dataset = v => {
  const [W, H] = sizeOf(512, 512), cv = canvas(W, H), c = cv.getContext('2d'), cols = v.n > 9 ? 5 : 3, rows = Math.ceil(Math.min(v.n, 20) / cols), cw = W / cols, ch = H / rows, r = rng(v.folder);
  for (let i = 0; i < Math.min(v.n, 20); i++) {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch, t = canvas(Math.round(cw), Math.round(ch)), tc = t.getContext('2d'), bg = v.varied ? BGS[i % BGS.length] : 'none';
    if (v.varied) drawScene(tc, t.width, t.height, bg, rng(v.folder + i), 'painterly', null, 1); else { tc.fillStyle = '#8c8c8c'; tc.fillRect(0, 0, t.width, t.height); }
    const s = v.varied ? t.height * (.45 + r() * .4) : t.height * .7; drawPip(tc, t.width * (v.varied ? .3 + r() * .4 : .5), t.height * .95, s, 1, 'painterly', r);
    c.drawImage(t, x + 1, y + 1, cw - 2, ch - 2);
    if (v.captions !== 'none') { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x + 1, y + ch - 10, cw - 2, 9); c.fillStyle = '#fff'; c.font = '6px sans-serif'; c.fillText((v.captions === 'good' ? CAPTION.good.replace('{pose}', POSES[i % POSES.length]) : CAPTION.everything).replace('{bg}', bg === 'none' ? 'grey background' : bg).slice(0, 34), x + 3, y + ch - 3); }
  }
  return cv;
};
KIND_RENDERERS.loss = v => {
  const cv = canvas(320, 200), c = cv.getContext('2d'), pts = lossCurve(v.t); c.fillStyle = '#1e1e1e'; c.fillRect(0, 0, 320, 200);
  c.strokeStyle = '#444'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(30, i * 45); c.lineTo(310, i * 45); c.stroke(); }
  c.strokeStyle = '#ffb35c'; c.lineWidth = 2; c.beginPath(); pts.forEach((p, i) => { const x = 30 + i / (pts.length - 1) * 280, y = 185 - p / .25 * 170; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
  c.fillStyle = '#aaa'; c.font = '10px sans-serif'; c.fillText('loss', 4, 14); c.fillText(`${v.t.steps} steps`, 250, 196); return cv;
};

/* ── What the LoRAs do to a picture ── */
export function loraPlan(d) {
  const text = (d.pos.text || '').toLowerCase(), trig = text.includes(TRIGGER), fx = effects(d);
  const pip = d.loras.filter(l => l.concept === 'pip' && l.strength);
  const P = { likeness: 0, fried: 0, baked: 0, frozen: 0, bleed: false, trigger: trig, files: pip.map(l => l.name), sum: d.loras.reduce((s, l) => s + Math.abs(l.strength || 0), 0), styles: Object.fromEntries(Object.entries(fx.styles).filter(([k]) => k !== 'undefined')) };
  for (const l of pip) {
    const sm = Math.abs(l.strength), sc = l.modelOnly ? 1 : clamp(l.clip ?? 1), traitsMissing = l.captions === 'everything' && !(/orange/.test(text) && /scarf/.test(text));
    const T = trig ? .55 + .45 * sc : (l.captions === 'none' ? .9 : .3);
    P.likeness = Math.max(P.likeness, clamp(l.likeness * clamp(sm) * T * (traitsMissing ? .5 : 1)));
    P.fried = Math.max(P.fried, clamp(l.fried * clamp(sm) + Math.max(0, sm - 1.25) * 1.6));
    P.baked = Math.max(P.baked, l.baked * clamp(sm)); P.frozen = Math.max(P.frozen, l.frozen * clamp(sm)); P.bleed = P.bleed || (l.bleed && sm > .4);
  }
  P.fried = clamp(P.fried + Math.max(0, P.sum - 1.85) * 3);
  P.subject = d.pos.subjects.map(s => s.value)[0] || null;
  P.pipShown = P.likeness > .2 && (trig || P.bleed || P.subject === 'robot');
  P.setting = d.pos.settings[0]?.value || 'none';
  P.settingKept = !(P.baked > .5);
  return P;
}
RECIPE_HOOKS.push({
  match: d => !d.latent?.inpaint,
  render(d, opts = {}) {
    const P = loraPlan(d), r = rng(`${d.seed}:pip`);
    const dd = { ...d, loras: [], pos: { ...d.pos, subjects: P.pipShown || P.bleed ? d.pos.subjects.filter(s => s.value !== 'robot') : d.pos.subjects } };
    const cv = renderBase(dd, opts), [W, H] = [cv.width, cv.height], c = cv.getContext('2d');
    if (P.baked > .05) { c.save(); c.globalAlpha = clamp(P.baked * 1.1); c.fillStyle = '#8c8c8c'; c.fillRect(0, 0, W, H); c.restore(); }
    if (P.pipShown || P.bleed) {
      const other = P.bleed && !P.trigger && P.subject && P.subject !== 'robot', fr = P.frozen > .5, s = fr ? H * .7 : H * (other ? .32 : .45 + r() * .15), cx = fr ? W * .5 : other ? W * .82 : W * (.3 + r() * .4);
      drawPip(c, cx, H * .93, s, P.bleed && !P.trigger ? Math.max(.6, P.likeness) : P.likeness, d.look, r);
    }
    let img = data(cv);
    for (const [st, a] of Object.entries(P.styles)) img = stylize(img, st, a, rng(`${d.seed}:${st}`));
    if (P.fried > .15) { const k = 1 + P.fried * 1.8, lv = Math.max(3, Math.round(10 - P.fried * 7)); img = mapPixels(img, (rr, gg, bb) => { const m = (rr + gg + bb) / 3; return [rr, gg, bb].map(v => Math.round(((m + (v - m) * k - 128) * (1 + P.fried * .6) + 128) / (256 / lv)) * (256 / lv)); }); }
    return put(cv, img);
  },
});

/* ── Summary for the history ── */
export function historyExtra(recipe) {
  const d = describeRecipe(recipe), P = loraPlan(d), trained = d.loras.find(l => l.trained);
  return {
    pip: { likeness: +P.likeness.toFixed(2), fried: P.fried > .35, baked: P.baked > .5, frozen: P.frozen > .5, bleed: P.bleed, shown: P.pipShown, trigger: P.trigger },
    loraFiles: d.loras.filter(l => l.strength).map(l => ({ name: l.name, strength: l.strength, clip: l.clip, style: l.style || null, concept: l.concept || null })), loraSum: +P.sum.toFixed(2),
    styleOn: Object.entries(P.styles).filter(([, a]) => a > .3).map(([s]) => s), setting: P.setting, subject: P.subject,
    trained: trained ? { dataset: trained.dataset, steps: trained.steps, lr: trained.lr, rank: trained.rank, p: trained.p, captions: trained.captions, n: trained.n } : null,
  };
}
export { describeRecipe };
