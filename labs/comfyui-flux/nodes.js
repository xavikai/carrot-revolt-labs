// Carrot Revolt Labs · Flux Lab · models in parts, Flux sampling, prompting, Fill and Kontext.
// Flux is loaded as three files (diffusion model, text encoders, VAE). The simulator reproduces what
// changes with it: CFG 1 and Flux Guidance, no negative prompt at CFG 1, dev vs schnell steps, precision and
// memory, sentences that bind colours to the right object, text in the picture, size limits, Fill and Kontext.
import { LORAS, CATEGORIES, HANDLERS, PRECHECKS, IMAGES, VOCAB, parsePrompt, registerNodes, addOptions } from '../comfyui/engine.js';
import { KIT, PHOTOS, RECIPE_HOOKS, renderBase } from '../comfyui/render.js';
import { maskRaster } from '../comfyui-inpaint/nodes.js'; // inpainting nodes, Mask Editor photos and the inpainting renderer

const W_ = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
for (const c of ['advanced', 'conditioning']) if (!CATEGORIES.includes(c)) CATEGORIES.push(c);

/* ── Files ── */
// Diffusion models (models/diffusion_models): size in GB at full precision.
export const UNETS = {
  'flux1-dev.safetensors': { variant: 'dev', gb: 23.8 },
  'flux1-schnell.safetensors': { variant: 'schnell', gb: 23.8 },
  'flux1-fill-dev.safetensors': { variant: 'fill', gb: 23.8 },
  'flux1-kontext-dev.safetensors': { variant: 'kontext', gb: 23.8 },
};
export const GGUFS = { 'flux1-dev-Q8_0.gguf': { variant: 'dev', gb: 12.7, quant: 'Q8_0' }, 'flux1-dev-Q4_K_S.gguf': { variant: 'dev', gb: 6.8, quant: 'Q4_K_S' }, 'flux1-schnell-Q4_K_S.gguf': { variant: 'schnell', gb: 6.8, quant: 'Q4_K_S' } };
export const TEXT_ENCODERS = ['clip_l.safetensors', 't5xxl_fp16.safetensors', 't5xxl_fp8_e4m3fn.safetensors', 'clip_g.safetensors'];
export const VAES = { 'ae.safetensors': 'Flux', 'sdxl_vae.safetensors': 'SDXL', 'vae-ft-mse-840000-ema-pruned.safetensors': 'SD1.5' };
export const VRAM = { gb: 16, fit: 13.5 };
Object.assign(LORAS, { 'flux_watercolor_v2.safetensors': { arch: 'Flux', style: 'watercolor', trigger: 'wtrcolor' }, 'flux_pixel_art.safetensors': { arch: 'Flux', style: 'pixel', trigger: 'pixelart' } });
addOptions('LoraLoader', 'lora_name', ['flux_watercolor_v2.safetensors', 'flux_pixel_art.safetensors']);

/* ── A photo for Kontext ── */
export const KONTEXT_PHOTO = { name: 'kontext_cat.png', setting: 'landscape', subject: 'cat', col: '#d58b44', cx: .5, by: .9, s: .56 };
export function drawKontext({ setting = KONTEXT_PHOTO.setting, col = KONTEXT_PHOTO.col, subject = KONTEXT_PHOTO.subject, style = null } = {}, W = 256, H = 256) {
  const cv = KIT.canvas(W, H), c = cv.getContext('2d'), r = KIT.rng(KONTEXT_PHOTO.name);
  KIT.drawScene(c, W, H, setting, r, 'painterly', null, 1);
  KIT.drawSubject(c, 'lighthouse', W * .14, H * .74, H * .34, '#e8e2d6', 'painterly', { night: setting === 'night' }); KIT.drawSubject(c, 'tree', W * .86, H * .8, H * .3, '#4f8f45', 'painterly', {});
  if (subject) KIT.drawSubject(c, subject, W * KONTEXT_PHOTO.cx, H * KONTEXT_PHOTO.by, H * KONTEXT_PHOTO.s, col, 'painterly', { r, night: setting === 'night', galaxy: setting === 'galaxy' });
  let img = KIT.data(cv); if (style) img = KIT.stylize(img, style, .9, KIT.rng('k' + style));
  return KIT.put(cv, img);
}
PHOTOS[KONTEXT_PHOTO.name] = (W, H) => drawKontext({}, W, H);
addOptions('LoadImage', 'image', [KONTEXT_PHOTO.name]); if (!IMAGES.includes(KONTEXT_PHOTO.name)) IMAGES.push(KONTEXT_PHOTO.name);

/* ── Nodes ── */
registerNodes({
  UNETLoader: { def: { title: 'Load Diffusion Model', cat: ['advanced', 'loaders'], w: 315, outputs: [O('MODEL', 'MODEL')], widgets: [W_('unet_name', 'combo', 'flux1-dev.safetensors', { options: Object.keys(UNETS) }), W_('weight_dtype', 'combo', 'default', { options: ['default', 'fp8_e4m3fn', 'fp8_e4m3fn_fast', 'fp8_e5m2'] })] } },
  UnetLoaderGGUF: { def: { title: 'Unet Loader (GGUF)', cat: ['loaders'], custom: 'ComfyUI-GGUF', w: 315, outputs: [O('MODEL', 'MODEL')], widgets: [W_('unet_name', 'combo', 'flux1-dev-Q8_0.gguf', { options: Object.keys(GGUFS) })] } },
  DualCLIPLoader: { def: { title: 'DualCLIPLoader', cat: ['advanced', 'loaders'], w: 315, outputs: [O('CLIP', 'CLIP')], widgets: [W_('clip_name1', 'combo', 'clip_l.safetensors', { options: TEXT_ENCODERS }), W_('clip_name2', 'combo', 't5xxl_fp8_e4m3fn.safetensors', { options: TEXT_ENCODERS }), W_('type', 'combo', 'flux', { options: ['sdxl', 'sd3', 'flux', 'hunyuan_video', 'hidream'] }), W_('device', 'combo', 'default', { options: ['default', 'cpu'] })] } },
  VAELoader: { def: { title: 'Load VAE', cat: ['loaders'], w: 315, outputs: [O('VAE', 'VAE')], widgets: [W_('vae_name', 'combo', 'ae.safetensors', { options: Object.keys(VAES) })] } },
  EmptySD3LatentImage: { def: { title: 'EmptySD3LatentImage', cat: ['latent', 'sd3'], w: 315, outputs: [O('LATENT', 'LATENT')], widgets: [W_('width', 'int', 1024, { min: 16, max: 16384, step: 16 }), W_('height', 'int', 1024, { min: 16, max: 16384, step: 16 }), W_('batch_size', 'int', 1, { min: 1, max: 4096, step: 1 })] } },
  FluxGuidance: { def: { title: 'FluxGuidance', cat: ['advanced', 'conditioning', 'flux'], w: 280, inputs: [I('conditioning', 'CONDITIONING')], outputs: [O('CONDITIONING', 'CONDITIONING')], widgets: [W_('guidance', 'float', 3.5, { min: 0, max: 100, step: .1 })] } },
  CLIPTextEncodeFlux: { def: { title: 'CLIPTextEncodeFlux', cat: ['advanced', 'conditioning', 'flux'], w: 400, inputs: [I('clip', 'CLIP')], outputs: [O('CONDITIONING', 'CONDITIONING')], widgets: [W_('clip_l', 'text', ''), W_('t5xxl', 'text', ''), W_('guidance', 'float', 3.5, { min: 0, max: 100, step: .1 })] } },
  ModelSamplingFlux: { def: { title: 'ModelSamplingFlux', cat: ['advanced', 'model'], w: 300, inputs: [I('model', 'MODEL')], outputs: [O('MODEL', 'MODEL')], widgets: [W_('max_shift', 'float', 1.15, { min: 0, max: 100, step: .01 }), W_('base_shift', 'float', .5, { min: 0, max: 100, step: .01 }), W_('width', 'int', 1024, { min: 16, max: 16384, step: 8 }), W_('height', 'int', 1024, { min: 16, max: 16384, step: 8 })] } },
  LoraLoaderModelOnly: { def: { title: 'LoraLoaderModelOnly', cat: ['loaders'], w: 315, inputs: [I('model', 'MODEL')], outputs: [O('MODEL', 'MODEL')], widgets: [W_('lora_name', 'combo', 'flux_watercolor_v2.safetensors', { options: Object.keys(LORAS) }), W_('strength_model', 'float', 1, { min: -100, max: 100, step: .01 })] } },
  ReferenceLatent: { def: { title: 'ReferenceLatent', cat: ['advanced', 'conditioning', 'edit_models'], w: 260, inputs: [I('conditioning', 'CONDITIONING'), I('latent', 'LATENT', { optional: true })], outputs: [O('CONDITIONING', 'CONDITIONING')] } },
  FluxKontextImageScale: { def: { title: 'FluxKontextImageScale', cat: ['advanced', 'conditioning', 'flux'], w: 260, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')] } },
});

/* ── Execution ── */
const modelOf = (file, info, extra = {}) => ({ ckpt: file, arch: 'Flux', native: 1024, look: 'xl', family: 'flux', variant: info.variant, gb: info.gb, inpaint: info.variant === 'fill', loras: [], ...extra });
const withPrompt = (c, add) => c && ({ ...c, prompt: { ...c.prompt, ...add } });
const handlers = {
  UNETLoader: ({ w }) => { const u = UNETS[w.unet_name], fp8 = w.weight_dtype !== 'default'; return [modelOf(w.unet_name, { ...u, gb: fp8 ? +(u.gb / 2).toFixed(1) : u.gb }, { dtype: w.weight_dtype })]; },
  UnetLoaderGGUF: ({ w }) => { const u = GGUFS[w.unet_name]; return [modelOf(w.unet_name, u, { quant: u.quant, dtype: u.quant })]; },
  DualCLIPLoader: ({ w }) => { const names = [w.clip_name1, w.clip_name2], t5 = names.some(n => n.startsWith('t5')), l = names.includes('clip_l.safetensors'); return [{ ckpt: names.join('+'), arch: w.type === 'flux' && t5 && l ? 'Flux' : w.type === 'sdxl' ? 'SDXL' : w.type === 'sd3' ? 'SD3' : 'Other', t5, type: w.type, loras: [] }]; },
  VAELoader: ({ w }) => [{ ckpt: w.vae_name, arch: VAES[w.vae_name] }],
  EmptySD3LatentImage: ({ w }) => [{ w: w.width, h: w.height, batch: w.batch_size, source: null, sd3: true }],
  FluxGuidance: ({ w, get }) => [withPrompt(get('conditioning'), { guidance: w.guidance })],
  CLIPTextEncodeFlux: ({ w, get }) => { const c = get('clip'); return [{ prompt: { ...parsePrompt(`${w.t5xxl} ${w.clip_l}`), raw: w.t5xxl, guidance: w.guidance }, clip: c, controls: [] }]; },
  ModelSamplingFlux: ({ w, get }) => [{ ...get('model'), shiftFor: [w.width, w.height] }],
  LoraLoaderModelOnly: ({ w, get, warnings }) => { const m = get('model'), Lr = LORAS[w.lora_name], ok = Lr.arch === m.arch; if (!ok) warnings.push({ text: `lora key not loaded: ${w.lora_name} (a LoRA for ${Lr.arch} on a ${m.arch} model)` }); return [{ ...m, loras: [...m.loras, { name: w.lora_name, ...Lr, strength: ok ? w.strength_model : 0, modelOnly: true }] }]; },
  ReferenceLatent: ({ get }) => { const c = get('conditioning'), l = get('latent'); return [withPrompt(c, { reference: l?.source || null })]; },
  FluxKontextImageScale: ({ get }) => { const i = get('image'); return [{ ...i, kontextScaled: true }]; },
};
for (const [t, fn] of Object.entries(handlers)) HANDLERS[t] = ctx => fn({ ...ctx, get: name => ctx.get(ctx.n.id, name) });
PRECHECKS.push(({ n, get, warnings }) => {
  // A VAE of another family cannot read the latent: Flux latents have 16 channels, SD ones 4.
  if (n.type === 'VAEDecode') { const s = get('samples'), v = get('vae'), arch = s?.recipe?.model?.arch; if (arch && v?.arch && (arch === 'Flux') !== (v.arch === 'Flux')) return { msg: 'vae', title: 'VAE Decode', error: 'RuntimeError', detail: `Given groups=1, weight of size [512, ${v.arch === 'Flux' ? 16 : 4}, 3, 3], expected input[1, ${arch === 'Flux' ? 16 : 4}, 128, 128] to have ${v.arch === 'Flux' ? 16 : 4} channels, but got ${arch === 'Flux' ? 16 : 4} channels instead`, trace: '  File "comfy/sd.py", line 650, in decode\n  File "comfy/ldm/models/autoencoder.py", in decode', hint: VAE_HINT }; }
  if (n.type === 'KSampler') {
    const m = get('model'); if (m?.family === 'flux' && m.gb > VRAM.fit) warnings.push({ text: `Requested to load Flux · loaded partially ${(VRAM.fit * 1000).toFixed(1)} MB, ${((m.gb - VRAM.fit) * 1000).toFixed(1)} MB offloaded to RAM (slow)` });
    if (m?.family === 'flux' && m.loras.some(l => l.strength && !l.modelOnly)) { /* a normal LoraLoader also works */ }
  }
  return null;
});
export const VAE_HINT = { en: 'The VAE is of another family. Flux latents have 16 channels and need the Flux VAE (ae.safetensors); SD 1.5 and SDXL latents have 4.', ca: 'El VAE és d’una altra família. Els latents de Flux tenen 16 canals i necessiten el VAE de Flux (ae.safetensors); els de SD 1.5 i SDXL en tenen 4.', es: 'El VAE es de otra familia. Los latentes de Flux tienen 16 canales y necesitan el VAE de Flux (ae.safetensors); los de SD 1.5 y SDXL tienen 4.' };

/* ── Prompt understanding beyond single words ── */
const COLOR_RE = Object.keys(VOCAB.colors).join('|'), SUBJ_RE = Object.keys(VOCAB.subjects).join('|');
export function pairsOf(text) { const out = [], re = new RegExp(`\\b(${COLOR_RE})\\s+(${SUBJ_RE})\\b`, 'g'); let m; while ((m = re.exec(String(text).toLowerCase()))) out.push({ color: m[1], subject: VOCAB.subjects[m[2]] }); return out; }
export const quotedOf = text => ((String(text).match(/["“”']([^"“”']{1,40})["“”']/) || [])[1] || '').toUpperCase() || null;
// What a model family does with a prompt: Flux reads sentences (T5); SD 1.5 and SDXL read words (CLIP).
export function understanding(d) {
  const flux = d.model.family === 'flux', xl = d.model.arch === 'SDXL', text = d.pos.raw || d.pos.text, pairs = pairsOf(text), quoted = quotedOf(text);
  const r = KIT.rng(`${d.seed}:bind`);
  const bound = pairs.length < 2 ? true : flux ? true : xl ? r() < .35 : false;
  let shown = quoted;
  if (quoted) { const q4 = d.model.quant === 'Q4_K_S', long = quoted.length > 22; const keep = flux ? (long ? .8 : q4 ? .93 : 1) : xl ? .5 : .12; const rr = KIT.rng(`${d.seed}:txt`); shown = [...quoted].map(ch => ch === ' ' || rr() < keep ? ch : 'ABCDEFGHKMNORSTUVW'[Math.floor(rr() * 18)]).join(''); if (!flux && !xl) shown = shown.slice(0, Math.max(2, Math.round(quoted.length * (.6 + rr() * .6)))); }
  return { pairs, bound, quoted, shown, textOk: !quoted || shown === quoted };
}
// Flux sampling settings → how the picture looks.
export function fluxSettings(d) {
  const v = d.model.variant, schnell = v === 'schnell', guided = !schnell;
  const g = guided ? (d.pos.guidance ?? 3.5) : 3.5, cfg = d.cfg;
  const negIgnored = cfg <= 1.05;
  const conv = schnell ? Math.min(1, d.steps / 4) : Math.min(1, d.steps / 18);
  const special = v === 'fill' || v === 'kontext'; // Fill is made for guidance ~30, Kontext ~2.5
  return { g, cfg, negIgnored, conv, schnell, burn: Math.max(0, cfg - 1.4) / 3 + (v === 'fill' ? Math.max(0, g - 50) / 20 : Math.max(0, g - 5) / 4), soft: v === 'fill' ? 0 : Math.max(0, 2.2 - g) / 2.2, special };
}

/* ── Drawing ── */
const { canvas, data, put, mapPixels, boxBlur, rng, drawScene, drawSubject, stylize, DEFAULT_COL } = KIT;
function drawSign(c, W, H, text, flux) {
  const w = W * .42, h = H * .16, x = W * .06, y = H * .6;
  c.save(); c.fillStyle = '#5b3b22'; c.fillRect(x + w * .45, y + h, w * .1, H * .24); c.fillStyle = '#c99a5b'; c.fillRect(x, y, w, h); c.strokeStyle = '#7a5530'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
  c.fillStyle = '#2a1a0c'; const size = Math.min(h * .55, w * 1.6 / Math.max(3, text.length)); c.font = `bold ${size}px ${flux ? 'Georgia, serif' : 'sans-serif'}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (flux) c.fillText(text, x + w / 2, y + h / 2); else { const r = rng(text); [...text].forEach((ch, i) => { c.save(); const cx = x + w / 2 + (i - text.length / 2 + .5) * size * .62; c.translate(cx, y + h / 2 + (r() - .5) * size * .3); c.rotate((r() - .5) * .5); c.scale(1 + (r() - .5) * .4, 1); c.fillText(ch, 0, 0); c.restore(); }); }
  c.restore();
}
// Kontext edits: read the instruction and change only what it asks.
export function kontextEdits(text) {
  const p = parsePrompt(text), t = String(text).toLowerCase();
  return { col: p.colors[0]?.value || null, colWord: p.colors[0]?.word || null, setting: p.settings[0]?.value || null, style: p.styles[0]?.value || null, remove: /\b(remove|delete|erase|without)\b/.test(t) };
}
function renderKontext(d, opts) {
  const e = kontextEdits(d.pos.raw || d.pos.text), [W, H] = KIT.sizeOf(d.w, d.h);
  let cv = drawKontext({ setting: e.setting || KONTEXT_PHOTO.setting, col: e.col || KONTEXT_PHOTO.col, subject: e.remove ? null : KONTEXT_PHOTO.subject, style: e.style }, W, H);
  const s = fluxSettings(d); let img = data(cv);
  if (s.burn > .15) img = mapPixels(img, (r, g, b) => [r, g, b].map(v => 128 + (v - 128) * (1 + s.burn)));
  if (opts.progress < 1) { const pr = rng('kp' + Math.round(opts.progress * 20)), k = opts.progress ** 1.3; img = mapPixels(img, (r, g, b) => { const n = pr() * 255; return [n + (r - n) * k, n + (g - n) * k, n + (b - n) * k]; }); }
  return put(cv, img);
}
function renderFamily(d, opts) {
  const flux = d.model.family === 'flux', u = understanding(d);
  const dd = { ...d, pos: { ...d.pos, subjects: [...d.pos.subjects], colors: [...d.pos.colors] }, neg: d.neg };
  let s = null;
  if (flux) {
    s = fluxSettings(d);
    // Flux Guidance plays the part CFG plays for SD; a real CFG above 1 burns the picture (and doubles the time).
    const cfgEq = s.g <= 3.5 ? 1 + s.g * 1.43 : 6 + (s.g - 3.5) * 2.4;
    dd.cfg = cfgEq + Math.max(0, d.cfg - 1.3) * 2.6;
    if (s.negIgnored) dd.neg = { ...d.neg, subjects: [], settings: [], colors: [], blurry: false };
    dd.steps = Math.round(s.conv * 30); dd.sampler = 'euler'; dd.scheduler = 'simple';
    // Flux keeps a good composition up to about 2 megapixels.
    const area = d.w * d.h; dd.native = area <= 2.2e6 ? Math.max(1024, Math.max(d.w, d.h) / 1.4) : 1024;
  }
  if (u.pairs.length >= 2) { dd.pos.subjects = []; dd.pos.colors = []; }
  const cv = renderBase(dd, opts), [W, H] = [cv.width, cv.height], c = cv.getContext('2d');
  // Two objects with their own colours: Flux keeps each colour on its object; CLIP models mix them.
  if (u.pairs.length >= 2) {
    const r = rng(`${d.seed}:pairs`), [a, b] = u.pairs, text = (d.pos.raw || d.pos.text);
    const onTop = /on top of|on a|sitting on/.test(text) && flux;
    if (!flux && !(d.model.arch === 'SDXL' && u.bound)) {
      // CLIP: one blended object, or both with the colours swapped.
      const ca = KIT.hex(VOCAB.colors[a.color]), cb = KIT.hex(VOCAB.colors[b.color]), mixCol = '#' + [0, 1, 2].map(i => Math.round((ca[i] + cb[i]) / 2).toString(16).padStart(2, '0')).join('');
      if (d.model.arch === 'SDXL') { drawSubject(c, a.subject, W * .32, H * .9, H * .45, VOCAB.colors[b.color], d.look, { r }); drawSubject(c, b.subject, W * .7, H * .9, H * .45, VOCAB.colors[a.color], d.look, { r }); }
      else drawSubject(c, r() < .5 ? a.subject : b.subject, W * (.4 + r() * .2), H * .9, H * .55, mixCol, d.look, { r });
    } else if (onTop) { drawSubject(c, b.subject, W * .5, H * .92, H * .42, VOCAB.colors[b.color], d.look, { r }); drawSubject(c, a.subject, W * .5, H * .92 - H * .42 * .62, H * .32, VOCAB.colors[a.color], d.look, { r }); }
    else { drawSubject(c, a.subject, W * .32, H * .9, H * .45, VOCAB.colors[a.color], d.look, { r }); drawSubject(c, b.subject, W * .7, H * .9, H * .45, VOCAB.colors[b.color], d.look, { r }); }
  }
  if (u.quoted) drawSign(c, W, H, u.shown, flux);
  let img = data(cv);
  if (flux && s) {
    if (s.soft > 0) img = mapPixels(img, (r, g, b) => { const m = (r + g + b) / 3, t = s.soft * .45; return [r + (m - r) * t + 8 * s.soft, g + (m - g) * t + 8 * s.soft, b + (m - b) * t + 8 * s.soft]; });
    if (d.model.quant === 'Q4_K_S') { const nr = rng(`${d.seed}:q4`); img = boxBlur(img, .8); img = mapPixels(img, (r, g, b) => { const n = (nr() - .5) * 14; return [r + n, g + n, b + n]; }); }
    if (d.model.shiftFor) { const [sw, sh] = d.model.shiftFor, off = Math.abs(Math.log((sw * sh) / (d.w * d.h))); if (off > .35) img = boxBlur(img, Math.min(2.5, off * 2)); }
  }
  return put(cv, img);
}
const inpaintHook = RECIPE_HOOKS.find(h => h.match({ latent: { inpaint: {} }, model: {} }));
RECIPE_HOOKS.push({ match: d => !d.latent?.inpaint, render: (d, opts = {}) => (d.model.variant === 'kontext' && d.pos.reference ? renderKontext(d, opts) : renderFamily(d, opts)) });
// Flux Fill needs a high guidance (about 30): with the usual 3.5 the filled area comes out weak and washed.
RECIPE_HOOKS.unshift({
  match: d => !!d.latent?.inpaint && d.model.family === 'flux',
  render(d, opts = {}) {
    const cv = inpaintHook.render(d, opts), g = d.pos.guidance ?? 3.5, weak = d.model.variant === 'fill' ? Math.max(0, (20 - g) / 20) : 0;
    if (weak <= 0) return cv;
    const W = cv.width, H = cv.height, M = maskRaster(d.latent.inpaint.mask, W, H), bl = boxBlur(data(cv), 3), img = data(cv);
    return put(cv, mapPixels(img, (r, gg, b, i) => { const k = M[i] * weak * .85, m = (bl.data[i * 4] + bl.data[i * 4 + 1] + bl.data[i * 4 + 2]) / 3; return [r + (m * .9 + 20 - r) * k, gg + (m * .9 + 20 - gg) * k, b + (m * .9 + 24 - b) * k]; }));
  },
});

/* ── A summary for the history ── */
export function historyExtra(recipe, graph) {
  const m = recipe.model, flux = m.family === 'flux', pos = recipe.pos.prompt, neg = recipe.neg.prompt;
  const d = { model: m, pos, neg, seed: recipe.seed, cfg: recipe.cfg, steps: recipe.steps, w: recipe.latent.w, h: recipe.latent.h };
  const u = understanding(d), s = flux ? fluxSettings(d) : null, e = m.variant === 'kontext' && pos.reference ? kontextEdits(pos.raw || pos.text) : null;
  const negHas = !!(neg.text || '').trim();
  return {
    family: flux ? 'flux' : m.arch, variant: m.variant || null, gb: m.gb || null, partial: flux && m.gb > VRAM.fit, quant: m.quant || null, dtype: m.dtype || null,
    guidance: flux && !s.schnell ? s.g : null, negText: negHas, negIgnored: !!(flux && s.negIgnored && negHas), burned: !!(flux && s.burn > .4), soft: !!(flux && s.soft > .3), finished: flux ? s.conv >= .95 : true,
    pairs: u.pairs.length, bound: u.bound, quoted: u.quoted, textOk: u.textOk, area: d.w * d.h, sd3Latent: !!recipe.latent.sd3,
    kontext: e ? { ...e, reference: true } : m.variant === 'kontext' ? { reference: false } : null, setting: pos.settings.map(x => x.value).find(x => (flux && s.negIgnored) || !neg.settings?.some(n => n.value === x)) || null,
    fluxLora: m.loras.some(l => l.arch === 'Flux' && l.strength > 0 && (!l.trigger || pos.triggers.includes(l.trigger))), loraOff: m.loras.some(l => l.strength === 0),
    fill: m.variant === 'fill' && !!recipe.latent.inpaint, inpaint: !!recipe.latent.inpaint,
  };
}
export { DEFAULT_COL, drawScene, stylize, canvas };
