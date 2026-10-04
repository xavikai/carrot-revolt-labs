// Carrot Revolt Labs · Sampling & Prompting Lab · KSampler Advanced, prompt scheduling, embeddings, weights and long prompts.
// The renderer reuses the base simulator (seed, steps, sampler, scheduler, CFG) and adds what this lab is about:
// two-stage sampling, prompts that act on part of the steps, negative embeddings, emphasis that breaks above ~1.6,
// and CLIP's 77-token window.
import { CHECKPOINTS, HANDLERS, PRECHECKS, SAMPLERS, SCHEDULERS, ANCESTRAL, convergence, describeRecipe, registerNodes } from '../comfyui/engine.js';
import { KIT, RECIPE_HOOKS, renderBase } from '../comfyui/render.js';

const W_ = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
const { data, put, mapPixels, boxBlur, rng } = KIT;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const EMBEDDINGS = ['easynegative.safetensors', 'bad_prompt_version2.pt'];

registerNodes({
  KSamplerAdvanced: { def: { title: 'KSampler (Advanced)', cat: ['sampling'], w: 330, inputs: [I('model', 'MODEL'), I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('latent_image', 'LATENT')], outputs: [O('LATENT', 'LATENT')],
    widgets: [W_('add_noise', 'combo', 'enable', { options: ['enable', 'disable'] }), W_('noise_seed', 'int', 0, { min: 0, max: 2 ** 53, step: 1 }), W_('control_after_generate', 'combo', 'fixed', { options: ['fixed', 'increment', 'decrement', 'randomize'] }), W_('steps', 'int', 20, { min: 1, max: 10000, step: 1 }), W_('cfg', 'float', 8, { min: 0, max: 100, step: .1 }), W_('sampler_name', 'combo', 'euler', { options: SAMPLERS }), W_('scheduler', 'combo', 'normal', { options: SCHEDULERS }), W_('start_at_step', 'int', 0, { min: 0, max: 10000, step: 1 }), W_('end_at_step', 'int', 10000, { min: 0, max: 10000, step: 1 }), W_('return_with_leftover_noise', 'combo', 'disable', { options: ['disable', 'enable'] })] } },
  ConditioningSetTimestepRange: { def: { title: 'ConditioningSetTimestepRange', cat: ['advanced', 'conditioning'], w: 300, inputs: [I('conditioning', 'CONDITIONING')], outputs: [O('CONDITIONING', 'CONDITIONING')], widgets: [W_('start', 'float', 0, { min: 0, max: 1, step: .01 }), W_('end', 'float', 1, { min: 0, max: 1, step: .01 })] } },
  ConditioningCombine: { def: { title: 'Conditioning (Combine)', cat: ['conditioning'], w: 260, inputs: [I('conditioning_1', 'CONDITIONING'), I('conditioning_2', 'CONDITIONING')], outputs: [O('CONDITIONING', 'CONDITIONING')] } },
});
const rangesOf = c => c.prompt?.ranges || [{ prompt: c.prompt, start: 0, end: 1 }];
const handlers = {
  ConditioningSetTimestepRange: ({ w, get }) => { const c = get('conditioning'); return [{ ...c, prompt: { ...c.prompt, ranges: rangesOf(c).map(r => ({ ...r, start: w.start, end: w.end })) } }]; },
  ConditioningCombine: ({ get }) => { const a = get('conditioning_1'), b = get('conditioning_2'); return [{ ...a, prompt: { ...a.prompt, ranges: [...rangesOf(a), ...rangesOf(b)] }, controls: [...(a.controls || []), ...(b.controls || [])] }]; },
  // The advanced sampler runs part of the steps. Its stage is kept in the prompt object, which reaches the renderer.
  KSamplerAdvanced: ({ w, get }) => {
    const m = get('model'), pos = get('positive'), neg = get('negative'), lat = get('latent_image');
    const end = Math.min(w.end_at_step, w.steps), stage = { addNoise: w.add_noise === 'enable', start: w.start_at_step, end, steps: w.steps, leftover: w.return_with_leftover_noise === 'enable', ckpt: m.ckpt, look: m.look, prev: lat?.partial ? lat.recipe : null };
    const recipe = { model: m, pos: { ...pos, prompt: { ...pos.prompt, stage } }, neg, latent: lat?.partial ? lat.recipe.latent : lat, seed: w.noise_seed, steps: w.steps, cfg: w.cfg, sampler: w.sampler_name, scheduler: w.scheduler, denoise: 1 };
    return [{ w: lat.w, h: lat.h, batch: lat.batch, sampled: true, partial: end < w.steps, recipe }];
  },
};
for (const [t, fn] of Object.entries(handlers)) HANDLERS[t] = ctx => fn({ ...ctx, get: name => ctx.get(ctx.n.id, name) });
// Embeddings are written in the prompt as embedding:name. A missing file is ignored with a warning, as in ComfyUI.
PRECHECKS.push(({ n, w, warnings }) => {
  if (n.type !== 'CLIPTextEncode') return null;
  for (const m of String(w.text || '').matchAll(/embedding:([\w.-]+)/g)) if (!EMBEDDINGS.some(e => e.replace(/\.(safetensors|pt)$/, '') === m[1].replace(/\.(safetensors|pt)$/, ''))) warnings.push({ text: `warning, embedding:${m[1]} does not exist, ignoring` });
  return null;
});
export const embeddingsIn = text => [...String(text || '').matchAll(/embedding:([\w.-]+)/g)].map(m => m[1].replace(/\.(safetensors|pt)$/, ''));
export const embeddingOk = name => EMBEDDINGS.some(e => e.replace(/\.(safetensors|pt)$/, '') === name);

/* ── How the prompt is read ── */
// CLIP reads 75 tokens at a time; later chunks are joined but count less. Roughly a word is 1.3 tokens.
export function tokenInfo(text) { const words = String(text || '').replace(/embedding:[\w.-]+/g, '').split(/[\s,]+/).filter(Boolean); return { words: words.length, tokens: Math.round(words.length * 1.3), positionOf: w => { const i = words.findIndex(x => x.toLowerCase().replace(/[^a-z]/g, '') === w); return i < 0 ? -1 : Math.round(i * 1.3); } }; }
// Two-stage sampling: what each stage contributes.
export function stageInfo(d) {
  const st = d.pos.stage; if (!st) return null;
  const prev = st.prev?.pos?.prompt?.stage || null;
  if (!prev) return { chained: false, finished: !(st.end < st.steps), single: true, share2: 0, noisy: st.end < st.steps ? 1 - st.end / st.steps : 0, ok: !(st.end < st.steps) };
  const gap = st.start - prev.end, extraNoise = st.addNoise, lost = !prev.leftover;
  const share2 = clamp((Math.min(st.end, st.steps) - st.start) / st.steps);
  const ok = !extraNoise && !lost && gap === 0 && st.end >= st.steps;
  return { chained: true, ok, extraNoise, lost, gap, share2, finished: st.end >= st.steps, noisy: extraNoise ? .55 : Math.abs(gap) > 0 ? Math.min(.6, Math.abs(gap) / st.steps * 2) : 0, firstLook: prev.look, secondLook: st.look, look: ok || extraNoise ? (share2 >= .25 ? st.look : prev.look) : prev.look, firstRecipe: st.prev };
}
// Prompt scheduling: early steps decide shapes and layout, late steps colours, textures and style.
export function scheduled(d) {
  const rs = d.pos.ranges; if (!rs || rs.length < 2) return null;
  const sorted = [...rs].sort((a, b) => a.start - b.start), early = sorted.filter(r => r.start < .3), late = sorted.filter(r => r.end >= .99 && r.start >= .2);
  const covered = sorted.reduce((acc, r) => (r.start <= acc + .02 ? Math.max(acc, r.end) : acc), 0);
  return { early: early[0]?.prompt || sorted[0].prompt, late: (late.at(-1) || sorted.at(-1)).prompt, covers: covered >= .99, split: sorted.find(r => r.start > 0)?.start ?? null };
}
export function readPrompt(d) {
  const t = tokenInfo(d.pos.text), subj = d.pos.subjects[0]?.word, pos = subj ? t.positionOf(subj) : -1;
  const maxW = Math.max(1, ...Object.values(d.pos.weights || {}));
  const negEmb = embeddingsIn(d.neg.text), embOk = negEmb.filter(embeddingOk);
  return { tokens: t.tokens, subjectToken: pos, late: pos > 75, maxWeight: maxW, broken: maxW >= 1.7, embeddings: negEmb, embOk: embOk.length > 0, embMissing: negEmb.length > embOk.length };
}

/* ── Rendering ── */
function quality(d) { return convergence(d.steps, d.sampler, d.scheduler); }
RECIPE_HOOKS.push({
  match: d => !d.latent?.inpaint,
  render(d, opts = {}) {
    let dd = { ...d, pos: { ...d.pos }, neg: { ...d.neg } };
    const sc = scheduled(d), st = stageInfo(d), rp = readPrompt(d);
    if (sc) { dd.pos = { ...sc.late, subjects: sc.early.subjects, settings: sc.early.settings.length ? sc.early.settings : sc.late.settings, text: `${sc.early.text} ${sc.late.text}`, weights: { ...sc.early.weights, ...sc.late.weights } }; }
    if (st?.chained) { const f = st.firstRecipe; dd.seed = f.seed; dd.look = st.look; dd.sampler = f.sampler; }
    if (st && !st.chained && !st.finished) dd.steps = Math.max(1, Math.round(d.steps * (st.noisy ? 1 - st.noisy : 1) * .3));
    // A negative embedding works like a long list of “bad quality” words: a cleaner picture.
    if (rp.embOk) dd.steps = Math.round(dd.steps * 1.8);
    // Words after the first 75 tokens count less.
    if (rp.late) dd.pos = { ...dd.pos, subjects: dd.pos.subjects.map(s => ({ ...s, w: Math.min(s.w, .45) })) };
    const cv = renderBase(dd, opts); let img = data(cv);
    if (st?.noisy > 0) { const nr = rng(`${d.seed}:stage`); img = mapPixels(img, (r, g, b) => { const n = (nr() - .5) * 220 * st.noisy; return [r + n * .8 + 20 * st.noisy, g + n * .8 + 20 * st.noisy, b + n * .8 + 20 * st.noisy]; }); }
    if (st?.chained && st.lost) img = boxBlur(img, 1.2);
    if (rp.broken) { const k = (rp.maxWeight - 1.6) * 2, nr = rng(`${d.seed}:w`); img = mapPixels(img, (r, g, b, i) => { const x = i % cv.width, band = Math.sin(x * .9 + nr() * 3) * 70 * k; return [r + band, g - band * .6, b + band * .9].map(v => Math.round(v / 48) * 48); }); }
    if (!rp.embOk && !d.neg.text.trim()) { const nr = rng(`${d.seed}:raw`); img = mapPixels(img, (r, g, b) => { const n = (nr() - .5) * 18; return [r + n, g + n, b + n]; }); }
    return put(cv, img);
  },
});

/* ── Summary for the history ── */
export function historyExtra(recipe, graph) {
  const d = describeRecipe(recipe), st = stageInfo(d), sc = scheduled(d), rp = readPrompt(d);
  const anc = ANCESTRAL.has(d.sampler);
  return {
    layoutKey: st?.chained ? `${st.firstRecipe.seed}:${st.firstRecipe.steps}` : anc ? `${d.seed}:${d.steps}` : `${d.seed}`, ancestral: anc, quality: +quality(d).toFixed(3),
    stage: st ? { chained: st.chained, ok: !!st.ok, extraNoise: !!st.extraNoise, lost: !!st.lost, gap: st.gap ?? 0, finished: st.finished, look: st.look || null, twoModels: st.chained && st.firstRecipe.model.ckpt !== d.model.ckpt } : null,
    schedule: sc ? { covers: sc.covers, split: sc.split, earlySubject: sc.early.subjects[0]?.value || null, lateStyle: sc.late.styles[0]?.value || null, lateColor: sc.late.colors[0]?.word || null } : null,
    tokens: rp.tokens, subjectToken: rp.subjectToken, late: rp.late, maxWeight: rp.maxWeight, broken: rp.broken, embeddings: rp.embeddings, embOk: rp.embOk, embMissing: rp.embMissing,
    dynamic: !!graph?.nodes?.some(n => n.dyn), resolved: d.pos.text, model: d.model.ckpt, look: d.look,
  };
}
export { CHECKPOINTS };
