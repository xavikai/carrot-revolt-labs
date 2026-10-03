// Carrot Revolt Labs · Upscale & Detail Lab · extra nodes and the "detail" simulator.
// Every picture carries a quality description: how many real pixels of detail it has (eff), fine texture (tex),
// what its edges look like (clean, soft, blocky, sharp but flat), how well the faces were drawn, extra copies of the
// subject, tile ghosts and tile seams. The renderer shows the whole picture plus a 100% crop, where all of it shows.
import { NODES, TYPE_COLOR, CHECKPOINTS, CONTROLNETS, CATEGORIES, HANDLERS, PRECHECKS, SAMPLERS, SCHEDULERS, registerNodes, addOptions } from '../comfyui/engine.js';
import { KIT, KIND_RENDERERS, RECIPE_HOOKS } from '../comfyui/render.js';

const W_ = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
Object.assign(TYPE_COLOR, { UPSCALE_MODEL: '#b08fe0', BBOX_DETECTOR: '#e0a35a', SEGM_DETECTOR: '#c97f63', SAM_MODEL: '#8fb4c9' });
for (const c of ['upscaling', 'ImpactPack']) if (!CATEGORIES.includes(c)) CATEGORIES.push(c);
CONTROLNETS['control_v11f1e_sd15_tile.pth'] = { arch: 'SD1.5', kind: 'tile' };
addOptions('ControlNetLoader', 'control_net_name', ['control_v11f1e_sd15_tile.pth']);

export const UPSCALERS = {
  '4x-UltraSharp.pth': { scale: 4, kind: 'sharp' },
  'RealESRGAN_x4plus.pth': { scale: 4, kind: 'smooth' },
  'RealESRGAN_x2plus.pth': { scale: 2, kind: 'smooth' },
};
export const DETECTORS = { 'bbox/face_yolov8m.pt': 'face', 'bbox/hand_yolov8s.pt': 'hand', 'segm/person_yolov8m-seg.pt': 'person' };
export const VRAM = { gb: 8, sampler: 2.4e6, vae: 4.5e6 }; // pixels a KSampler / a plain VAE pass can hold on the simulated 8 GB card
const IMG_METHODS = ['nearest-exact', 'bilinear', 'area', 'bicubic', 'lanczos'], LAT_METHODS = ['nearest-exact', 'bilinear', 'area', 'bicubic', 'bislerp'];
const samplerWidgets = (denoise) => [W_('seed', 'int', 0, { min: 0, max: 2 ** 53, step: 1 }), W_('steps', 'int', 20, { min: 1, max: 150, step: 1 }), W_('cfg', 'float', 8, { min: 0, max: 30, step: .1 }), W_('sampler_name', 'combo', 'euler', { options: SAMPLERS }), W_('scheduler', 'combo', 'normal', { options: SCHEDULERS }), W_('denoise', 'float', denoise, { min: 0, max: 1, step: .01 })];

registerNodes({
  UpscaleModelLoader: { def: { title: 'Load Upscale Model', cat: ['loaders'], w: 315, outputs: [O('UPSCALE_MODEL', 'UPSCALE_MODEL')], widgets: [W_('model_name', 'combo', '4x-UltraSharp.pth', { options: Object.keys(UPSCALERS) })] } },
  ImageUpscaleWithModel: { def: { title: 'Upscale Image (using Model)', cat: ['image', 'upscaling'], w: 300, inputs: [I('upscale_model', 'UPSCALE_MODEL'), I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')] } },
  ImageScale: { def: { title: 'Upscale Image', cat: ['image', 'upscaling'], w: 315, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')], widgets: [W_('upscale_method', 'combo', 'nearest-exact', { options: IMG_METHODS }), W_('width', 'int', 512, { min: 0, max: 16384, step: 1 }), W_('height', 'int', 512, { min: 0, max: 16384, step: 1 }), W_('crop', 'combo', 'disabled', { options: ['disabled', 'center'] })] } },
  ImageScaleBy: { def: { title: 'Upscale Image By', cat: ['image', 'upscaling'], w: 315, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')], widgets: [W_('upscale_method', 'combo', 'nearest-exact', { options: IMG_METHODS }), W_('scale_by', 'float', 1, { min: .01, max: 8, step: .01 })] } },
  LatentUpscale: { def: { title: 'Upscale Latent', cat: ['latent'], w: 315, inputs: [I('samples', 'LATENT')], outputs: [O('LATENT', 'LATENT')], widgets: [W_('upscale_method', 'combo', 'nearest-exact', { options: LAT_METHODS }), W_('width', 'int', 1024, { min: 0, max: 16384, step: 8 }), W_('height', 'int', 1024, { min: 0, max: 16384, step: 8 }), W_('crop', 'combo', 'disabled', { options: ['disabled', 'center'] })] } },
  LatentUpscaleBy: { def: { title: 'Upscale Latent By', cat: ['latent'], w: 315, inputs: [I('samples', 'LATENT')], outputs: [O('LATENT', 'LATENT')], widgets: [W_('upscale_method', 'combo', 'nearest-exact', { options: LAT_METHODS }), W_('scale_by', 'float', 1.5, { min: .01, max: 8, step: .01 })] } },
  VAEDecodeTiled: { def: { title: 'VAE Decode (Tiled)', cat: ['latent'], w: 280, inputs: [I('samples', 'LATENT'), I('vae', 'VAE')], outputs: [O('IMAGE', 'IMAGE')], widgets: [W_('tile_size', 'int', 512, { min: 64, max: 4096, step: 32 }), W_('overlap', 'int', 64, { min: 0, max: 4096, step: 32 })] } },
  UltimateSDUpscale: { def: { title: 'Ultimate SD Upscale', cat: ['image', 'upscaling'], custom: 'UltimateSDUpscale', w: 340, inputs: [I('image', 'IMAGE'), I('model', 'MODEL'), I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('vae', 'VAE'), I('upscale_model', 'UPSCALE_MODEL')], outputs: [O('IMAGE', 'IMAGE')],
    widgets: [W_('upscale_by', 'float', 2, { min: .05, max: 4, step: .05 }), ...samplerWidgets(.2), W_('mode_type', 'combo', 'Linear', { options: ['Linear', 'Chess', 'None'] }), W_('tile_width', 'int', 512, { min: 64, max: 2048, step: 8 }), W_('tile_height', 'int', 512, { min: 64, max: 2048, step: 8 }), W_('mask_blur', 'int', 8, { min: 0, max: 64, step: 1 }), W_('tile_padding', 'int', 32, { min: 0, max: 512, step: 8 }), W_('seam_fix_mode', 'combo', 'None', { options: ['None', 'Band Pass', 'Half Tile', 'Half Tile + Intersections'] }), W_('seam_fix_denoise', 'float', 1, { min: 0, max: 1, step: .01 }), W_('force_uniform_tiles', 'combo', 'true', { options: ['true', 'false'] }), W_('tiled_decode', 'combo', 'false', { options: ['false', 'true'] })] } },
  UltralyticsDetectorProvider: { def: { title: 'UltralyticsDetectorProvider', cat: ['ImpactPack'], custom: 'Impact Pack', w: 315, outputs: [O('BBOX_DETECTOR', 'BBOX_DETECTOR'), O('SEGM_DETECTOR', 'SEGM_DETECTOR')], widgets: [W_('model_name', 'combo', 'bbox/face_yolov8m.pt', { options: Object.keys(DETECTORS) })] } },
  FaceDetailer: { def: { title: 'FaceDetailer', cat: ['ImpactPack'], custom: 'Impact Pack', w: 340, inputs: [I('image', 'IMAGE'), I('model', 'MODEL'), I('clip', 'CLIP'), I('vae', 'VAE'), I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('bbox_detector', 'BBOX_DETECTOR'), I('sam_model_opt', 'SAM_MODEL', { optional: true }), I('segm_detector_opt', 'SEGM_DETECTOR', { optional: true })], outputs: [O('image', 'IMAGE'), O('cropped_refined', 'IMAGE'), O('cropped_enhanced_alpha', 'IMAGE'), O('mask', 'MASK')],
    widgets: [W_('guide_size', 'int', 512, { min: 64, max: 8192, step: 8 }), W_('guide_size_for', 'combo', 'bbox', { options: ['bbox', 'crop_region'] }), W_('max_size', 'int', 1024, { min: 64, max: 8192, step: 8 }), ...samplerWidgets(.5), W_('feather', 'int', 5, { min: 0, max: 100, step: 1 }), W_('noise_mask', 'combo', 'true', { options: ['true', 'false'] }), W_('force_inpaint', 'combo', 'true', { options: ['true', 'false'] }), W_('bbox_threshold', 'float', .5, { min: 0, max: 1, step: .01 }), W_('bbox_dilation', 'int', 10, { min: -512, max: 512, step: 1 }), W_('bbox_crop_factor', 'float', 3, { min: 1, max: 10, step: .1 }), W_('drop_size', 'int', 10, { min: 1, max: 8192, step: 1 }), W_('cycle', 'int', 1, { min: 1, max: 10, step: 1 })] } },
});

/* ── Execution: plain descriptions ── */
const passOf = (ctx, w) => ({ model: ctx.get('model'), prompt: ctx.get('positive')?.prompt, neg: ctx.get('negative')?.prompt, controls: ctx.get('positive')?.controls || [], seed: w.seed, steps: w.steps, cfg: w.cfg, denoise: w.denoise });
const handlers = {
  UpscaleModelLoader: ({ w }) => [{ name: w.model_name, ...UPSCALERS[w.model_name] }],
  ImageUpscaleWithModel: ({ get }) => { const m = get('upscale_model'), img = get('image'); return [{ kind: 'modelup', of: img, model: m, w: img.w * m.scale, h: img.h * m.scale }]; },
  ImageScale: ({ w, get }) => { const img = get('image'); return [{ kind: 'scaled', of: img, method: w.upscale_method, w: w.width || img.w, h: w.height || img.h }]; },
  ImageScaleBy: ({ w, get }) => { const img = get('image'); return [{ kind: 'scaled', of: img, method: w.upscale_method, w: Math.round(img.w * w.scale_by), h: Math.round(img.h * w.scale_by) }]; },
  LatentUpscale: ({ w, get }) => { const s = get('samples'); return [{ ...s, w: w.width, h: w.height, latentUp: { method: w.upscale_method, from: s } }]; },
  LatentUpscaleBy: ({ w, get }) => { const s = get('samples'); return [{ ...s, w: Math.round(s.w * w.scale_by / 8) * 8, h: Math.round(s.h * w.scale_by / 8) * 8, latentUp: { method: w.upscale_method, from: s } }]; },
  VAEDecodeTiled: ({ get }) => { const s = get('samples'); return [s.sampled ? { kind: 'generated', recipe: s.recipe, w: s.w, h: s.h, batch: s.batch, latentUp: s.latentUp } : s.source ? { ...s.source } : { kind: 'empty', w: s.w, h: s.h }]; },
  UltimateSDUpscale: ({ w, get }) => { const img = get('image'), m = get('upscale_model'); return [{ kind: 'usdu', of: img, upModel: m, by: w.upscale_by, w: Math.round(img.w * w.upscale_by), h: Math.round(img.h * w.upscale_by), pass: passOf({ get }, w), mode: w.mode_type, tw: w.tile_width, th: w.tile_height, blur: w.mask_blur, padding: w.tile_padding, seamFix: w.seam_fix_mode }]; },
  UltralyticsDetectorProvider: ({ w }) => { const d = { model: w.model_name, kind: DETECTORS[w.model_name] }; return [d, d]; },
  FaceDetailer: ({ w, get }) => { const img = get('image'), det = { kind: 'detailed', of: img, det: get('bbox_detector'), guide: w.guide_size, maxSize: w.max_size, crop: w.bbox_crop_factor, threshold: w.bbox_threshold, feather: w.feather, drop: w.drop_size, cycle: w.cycle, pass: passOf({ get }, w), w: img.w, h: img.h }; return [det, { kind: 'facecrop', of: det, w: 512, h: 512 }, { kind: 'facecrop', of: det, w: 512, h: 512 }, { kind: 'mask', strokes: [], w: img.w, h: img.h }]; },
};
for (const [t, fn] of Object.entries(handlers)) HANDLERS[t] = ctx => fn({ ...ctx, get: name => ctx.get(ctx.n.id, name) });
// Out of memory on the simulated 8 GB card. A plain VAE Decode retries in tiles by itself (like ComfyUI), only slower.
PRECHECKS.push(({ n, get, warnings }) => {
  if (n.type === 'KSampler') { const l = get('latent_image'); if (l && l.w * l.h > VRAM.sampler) return { msg: 'oom', title: 'KSampler', error: 'torch.OutOfMemoryError', detail: `Allocation on device. Tried to allocate ${(l.w * l.h / 1.6e6).toFixed(2)} GiB. GPU 0 has a total capacity of ${VRAM.gb}.00 GiB`, trace: '  File "comfy/samplers.py", line 1104, in sample\n  File "comfy/ldm/modules/attention.py", line 412, in attention_pytorch', hint: OOM_HINT }; }
  if (n.type === 'VAEDecode') { const l = get('samples'); if (l && l.w * l.h > VRAM.vae) warnings.push({ text: 'Warning: Ran out of memory when regular VAE decoding, retrying with tiled VAE decoding.' }); }
  if (n.type === 'VAEEncode') { const i = get('pixels'); if (i && i.w * i.h > VRAM.vae) warnings.push({ text: 'Warning: Ran out of memory when regular VAE encoding, retrying with tiled VAE encoding.' }); }
  return null;
});
export const OOM_HINT = { en: 'The KSampler needs memory for every latent pixel at once. On this simulated 8 GB card, about 1500 × 1500 is the limit. Go bigger in tiles: Ultimate SD Upscale samples one tile at a time.', ca: 'El KSampler necessita memòria per a tots els píxels latents alhora. En aquesta targeta simulada de 8 GB, el límit és d’uns 1500 × 1500. Per anar més amunt, fes-ho per tiles: Ultimate SD Upscale mostreja un tile cada vegada.', es: 'El KSampler necesita memoria para todos los píxeles latentes a la vez. En esta tarjeta simulada de 8 GB, el límite es de unos 1500 × 1500. Para ir más arriba, hazlo por tiles: Ultimate SD Upscale muestrea un tile cada vez.' };

/* ── Quality model ── */
const { canvas, data, put, rng, hex, rgb, shade, mapPixels, boxBlur, drawScene, drawSubject, DEFAULT_COL } = KIT;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const passFromRecipe = r => ({ model: r.model, prompt: r.pos.prompt, neg: r.neg.prompt, controls: r.pos.controls || [], seed: r.seed, steps: r.steps, cfg: r.cfg, denoise: r.denoise, latent: r.latent });
const passFromDesc = d => ({ model: d.model, prompt: d.pos, neg: d.neg, controls: d.controls || [], seed: d.seed, steps: d.steps, cfg: d.cfg, denoise: d.denoise, latent: d.latent });
const nativeOf = m => CHECKPOINTS[m?.ckpt]?.native || 512;
const dupFor = (w, h, native) => { const big = Math.max(w, h) / native; return big > 1.45 ? (big > 2.1 ? 3 : 2) : 1; };
// The composition of the first generation: what is where (normalised), decided by the seed.
function layoutOf(p, w, h) {
  const negs = new Set(p.neg?.subjects?.map(s => s.value) || []);
  const subj = p.prompt.subjects.map(s => s.value).find(s => !negs.has(s)) || null;
  const setting = p.prompt.settings.map(s => s.value).find(s => !negs.has(s)) || 'none';
  const r = rng(`${p.seed}:layout`), wide = /\b(wide|far|distant|full body|long shot)\b/.test(p.prompt.text);
  const col = p.prompt.colors[0]?.value || DEFAULT_COL[subj] || '#c9604b';
  return { seed: String(p.seed), subj, setting, wide, col, cx: .36 + r() * .28, s: wide ? .26 + r() * .04 : .54 + r() * .06, look: p.model?.look || 'painterly', aspect: w / h, hair: ['#3b2a20', '#7a4a26', '#c99a52', '#1d1d1f'][Math.floor(r() * 4)] };
}
// Where each copy of the subject stands (n copies when the picture is far above the model's size).
export function subjectsOf(lay, n) {
  if (!lay.subj) return [];
  if (n <= 1) return [{ cx: lay.cx, by: .9, s: lay.s }];
  const r = rng(lay.seed + ':dup' + n); return Array.from({ length: n }, (_, i) => ({ cx: (i + .5) / n + (r() - .5) * .06, by: .88 + r() * .06, s: lay.s * (.82 + r() * .2) }));
}
const headOf = (sub, H) => ({ x: sub.cx, y: sub.by - sub.s * .86, d: sub.s * .2 * H }); // head centre (normalised) and diameter in px at height H
const faceQ = px => clamp((px - 16) / 95);
const memo = new WeakMap();
// Quality of any image value.
export function qualityOf(v) {
  if (!v || typeof v !== 'object') return null;
  if (memo.has(v)) return memo.get(v);
  let q = null;
  if (v.kind === 'generated') {
    const r = v.recipe, p = passFromRecipe(r);
    q = sampled(p, r.latent);
    if (v.w !== q.W) q = scaleQ(q, v.w / q.W, v.latentUp?.method || 'nearest-exact', true); // a latent made bigger and decoded without sampling again
  } else if (v.kind === 'scaled') q = scaleQ(qualityOf(v.of), v.w / v.of.w, v.method, false, v.h / v.of.h);
  else if (v.kind === 'modelup') q = modelQ(qualityOf(v.of), v.model);
  else if (v.kind === 'usdu') q = usduQ(v);
  else if (v.kind === 'detailed') q = detailQ(v);
  if (q) memo.set(v, q);
  return q;
}
// A KSampler pass: from nothing (text to image) or from a picture (img2img, hires fix, a second pass).
function sampled(p, lat) {
  const W = lat.w, H = lat.h, native = nativeOf(p.model), conv = clamp(1 - Math.exp(-p.steps / 6));
  let prev = null;
  if (lat.latentUp?.from?.sampled) prev = scaleQ(sampled(passFromRecipe(lat.latentUp.from.recipe), lat.latentUp.from.recipe.latent), W / lat.latentUp.from.w, lat.latentUp.method, true, H / lat.latentUp.from.h);
  else if (lat.source) { prev = qualityOf(lat.source); if (prev && prev.W !== W) prev = scaleQ(prev, W / prev.W, 'bilinear'); }
  if (!prev) {
    const lay = layoutOf(p, W, H), dup = dupFor(W, H, native);
    return { W, H, lay, eff: W, tex: .85 * conv, edge: 'clean', edgeAmt: 0, blockF: 1, face: lay.subj === 'person' ? faceQ(lay.s * .2 * H) : 0, faceVar: 0, dup, halluc: [], seams: null, faceSeam: 0, conv, ops: [{ op: 'txt2img', W, H, dup }], detected: null };
  }
  return passQ(prev, p, W, H, native, conv, false);
}
function passQ(prev, p, W, H, native, conv, tiled) {
  const d = p.denoise, k = clamp((d - .08) / .42);
  const q = { ...prev, W, H, ops: [...prev.ops] };
  q.eff = prev.eff + (W - prev.eff) * k;
  q.tex = prev.tex + (.88 * conv - prev.tex) * k;
  if (prev.edge === 'blocky') { q.edgeAmt = prev.edgeAmt * (1 - clamp(d / .5)); if (q.edgeAmt < .08) { q.edge = 'clean'; q.edgeAmt = 0; } }
  else if (prev.edge !== 'clean') { q.edgeAmt = prev.edgeAmt * (1 - k); if (q.edgeAmt < .08) { q.edge = 'clean'; q.edgeAmt = 0; } }
  // A face is only redrawn (not just refined) when the denoise is high enough to change its structure; tiles refine, they do not rebuild.
  if (prev.lay.subj === 'person') { const target = faceQ(subjectsOf(prev.lay, prev.dup)[0].s * .2 * H), sf = clamp((d - .25) / .4); q.face = Math.max(prev.face, Math.min(tiled ? prev.face + .08 : 1, prev.face + (target - prev.face) * k * sf)); }
  if (!tiled && d > .6 && dupFor(W, H, native) > prev.dup) q.dup = dupFor(W, H, native);
  if (prev.seams) q.seams = { ...prev.seams, amt: prev.seams.amt * (1 - k) };
  q.faceSeam = prev.faceSeam * (1 - k);
  q.ops.push({ op: tiled ? 'tiles' : 'pass', W, H, d, from: prev.edge, latent: prev.edge === 'blocky' });
  return q;
}
function scaleQ(prev, f, method, latent = false, fy = f) {
  const W = Math.round(prev.W * f), H = Math.round(prev.H * fy), q = { ...prev, W, H, ops: [...prev.ops] };
  q.eff = Math.min(prev.eff, W); q.tex = clamp(prev.tex / f);
  if (f > 1.05) {
    if (latent || method === 'nearest-exact') { q.edge = 'blocky'; q.edgeAmt = latent ? 1 : clamp((f - 1.2) / 1.5); q.blockF = (prev.edge === 'blocky' ? prev.blockF : 1) * f * (latent ? 8 : 1); if (!latent && q.edgeAmt < .1) { q.edge = 'soft'; q.edgeAmt = .5; } }
    else if (prev.edge === 'clean' || prev.edge === 'soft') { q.edge = 'soft'; q.edgeAmt = clamp(prev.edgeAmt + (f - 1) / 1.5); }
  } else if (f < .95) { q.edgeAmt = prev.edgeAmt * f; q.blockF = (prev.blockF || 1) * f; if (q.edgeAmt < .08 && prev.edge !== 'sharp') { q.edge = 'clean'; q.edgeAmt = 0; } }
  q.ops.push({ op: latent ? 'latentUp' : 'scale', f, method, W });
  return q;
}
function modelQ(prev, m) {
  const q = scaleQ(prev, m.scale, 'model'); q.ops.pop();
  if (prev.edge === 'blocky') { q.edge = 'blocky'; q.edgeAmt = prev.edgeAmt; q.blockF = prev.blockF * m.scale; }
  else { q.edge = m.kind === 'sharp' ? 'sharp' : 'waxy'; q.edgeAmt = 1; }
  q.tex = clamp(prev.tex / m.scale + (m.kind === 'sharp' ? .1 : 0));
  q.ops.push({ op: 'model', model: m.name, W: q.W });
  return q;
}
function usduQ(v) {
  const base = qualityOf(v.of); if (!base) return null;
  let q = v.upModel ? modelQ(base, v.upModel) : scaleQ(base, v.by, 'lanczos');
  if (q.W !== v.w) q = scaleQ(q, v.w / q.W, 'lanczos');
  if (v.mode === 'None') { q.ops.push({ op: 'usdu', d: 0, tiles: 0, halluc: 0, seams: 0, ctl: false }); return q; }
  const native = nativeOf(v.pass.model), conv = clamp(1 - Math.exp(-v.pass.steps / 6));
  const before = q;
  q = passQ(q, v.pass, v.w, v.h, native, conv, true);
  const nx = Math.ceil(v.w / v.tw), ny = Math.ceil(v.h / v.th), tiles = nx * ny;
  const ctl = v.pass.controls.some(c => c.net?.kind === 'tile' && c.strength >= .3), thr = ctl ? .78 : .42, d = v.pass.denoise;
  const r = rng(`${v.pass.seed}:ghost:${tiles}`), ghosts = [];
  if (d > thr && base.lay.subj) { const n = Math.min(tiles, 1 + Math.round((d - thr) * tiles * 2.2)); const cells = [...Array(tiles).keys()].sort(() => r() - .5); for (const c of cells.slice(0, n)) { const tx = c % nx, ty = Math.floor(c / nx); ghosts.push({ cx: (tx + .2 + r() * .6) / nx, by: Math.min(.97, (ty + .55 + r() * .4) / ny), s: Math.min(.5, 1.1 / ny) * (.5 + r() * .3) }); } }
  let amt = (v.blur < 4 ? .7 : 0) + (v.padding < 16 ? .5 : 0); if (v.seamFix !== 'None') amt *= .25; if (d < .12) amt *= .3;
  q.halluc = [...(before.halluc || []), ...ghosts];
  q.seams = amt > 0 ? { nx, ny, amt: Math.min(1, amt), seed: v.pass.seed } : before.seams ? { ...before.seams } : null;
  q.ops.pop(); q.ops.push({ op: 'usdu', W: v.w, d, tiles, halluc: ghosts.length, seams: q.seams?.amt || 0, ctl, model: v.upModel?.name || null });
  return q;
}
function detailQ(v) {
  const base = qualityOf(v.of); if (!base) return null;
  const q = { ...base, ops: [...base.ops] };
  const persons = base.lay.subj === 'person' ? subjectsOf(base.lay, base.dup) : [];
  const faces = persons.map(s => headOf(s, base.H).d).filter(px => px >= v.drop);
  const conf = faces.length ? clamp(.55 + Math.min(...faces) / 400) : 0; // small faces are found with less confidence
  const found = v.det?.kind === 'face' && v.threshold <= conf ? faces.length : 0;
  if (found) {
    const target = Math.min(v.guide, v.maxSize) / Math.max(1, v.crop) * 1.1, d = v.pass.denoise, k = clamp((d - .06) / .36) * (v.cycle > 1 ? 1.05 : 1);
    q.face = Math.max(base.face, base.face + (faceQ(target) - base.face) * clamp(k));
    if (d > .66) q.faceVar = 1 + Math.floor(rng(`${v.pass.seed}:id`)() * 3);
    q.faceSeam = v.feather < 2 ? 1 : 0; q.faceClean = clamp(k);
  }
  q.detected = { kind: v.det?.kind, found, faces: faces.length, conf, threshold: v.threshold };
  q.ops.push({ op: 'detailer', found, d: v.pass.denoise });
  return q;
}
export const findRecipe = v => { for (let x = v, i = 0; x && i < 40; i++) { if (x.recipe) return x.recipe; x = x.of; } return null; };

/* ── Drawing ── */
// The face, more or less well drawn: features drift and melt when the model had few pixels for it.
function drawFace(c, x, y, rad, q, variant, r, lay) {
  const skin = ['#e8b796', '#d9a07a', '#f0c7a6', '#c58b67'][variant % 4], hair = variant ? ['#3b2a20', '#b8462f', '#d7c27a', '#1d1d1f'][variant % 4] : lay.hair;
  const j = Math.pow(1 - q, .8), o = () => (r() - .5) * j * rad * 1.1;
  c.save(); c.fillStyle = skin; c.beginPath(); c.ellipse(x, y, rad, rad * (1.08 + (r() - .5) * j * .3), 0, 0, 7); c.fill();
  c.fillStyle = hair; c.beginPath(); c.ellipse(x + o() * .3, y - rad * .55, rad * 1.05, rad * .6, 0, Math.PI, 0); c.fill();
  const eye = (ex, ey, sz) => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, sz * 1.5, sz, 0, 0, 7); c.fill(); c.fillStyle = variant === 2 ? '#3a7bc8' : '#3b2a20'; c.beginPath(); c.arc(ex + o() * .15, ey, sz * .8, 0, 7); c.fill(); };
  const es = rad * .13;
  eye(x - rad * .36 + o(), y + o() * .6, es * (1 + (r() - .5) * j * 1.4)); eye(x + rad * .36 + o(), y + o() * .6, es * (1 + (r() - .5) * j * 1.4));
  c.strokeStyle = rgb(shade(hex(skin), .72)); c.lineWidth = Math.max(.6, rad * .05);
  c.beginPath(); c.moveTo(x + o() * .4, y + rad * .05); c.lineTo(x - rad * .05 + o() * .4, y + rad * .3); c.stroke();
  c.strokeStyle = '#a5524a'; c.lineWidth = Math.max(.8, rad * .07); c.beginPath(); const mx = x + o(), my = y + rad * .52 + o() * .5; c.moveTo(mx - rad * .25, my + o() * .4); c.quadraticCurveTo(mx, my + rad * .14 + o() * .5, mx + rad * .25, my + o() * .4); c.stroke();
  if (q < .6) { c.globalAlpha = Math.min(.85, (.6 - q) * 1.6); c.fillStyle = skin; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x + o() * 1.6, y + o() * 1.6, rad * (.3 + r() * .4), rad * (.2 + r() * .3), r() * 3, 0, 7); c.fill(); } }
  c.restore();
}
// The whole scene, vector, at any scale: W, H are the picture's pixel size; the context may be transformed.
function drawLayout(c, q, W, H, { faces = true } = {}) {
  const lay = q.lay;
  drawScene(c, W, H, lay.setting, rng(lay.seed + ':scene'), lay.look, null, 1);
  const r = rng(lay.seed + ':subj'), subs = subjectsOf(lay, q.dup), all = [...subs.map(s => ({ ...s, main: true })), ...(q.halluc || []).map(s => ({ ...s, ghost: true }))];
  for (const s of all) {
    if (!lay.subj) break;
    drawSubject(c, lay.subj, W * s.cx, H * s.by, H * s.s, lay.col, lay.look, { r });
    if (faces && lay.subj === 'person') {
      const h = headOf(s, H), fr = rng(`${lay.seed}:face:${s.cx.toFixed(3)}`);
      drawFace(c, W * h.x, H * h.y, h.d / 2, s.ghost ? .2 : q.face, s.ghost ? 0 : q.faceVar, fr, lay);
    }
  }
}
// Where the 100% crop looks: the first face, or the subject.
export function cropCentre(q) {
  const subs = subjectsOf(q.lay, q.dup); if (!subs.length) return [.5, .6];
  const s = subs[0]; return q.lay.subj === 'person' ? [s.cx, s.by - s.s * .8] : [s.cx, s.by - s.s * .5];
}
// The 100% crop: a window of R × R real pixels, drawn as detailed as the picture really is.
export function loupe(q, L = 256, { progress = 1, seed = '0' } = {}) {
  // The zoom frames the face (or the subject): the same part of the picture whatever its size, so you compare real pixels.
  const main = subjectsOf(q.lay, q.dup)[0], R = Math.max(24, Math.min(q.W, q.H, main ? (q.lay.subj === 'person' ? headOf(main, q.H).d * 2.6 : main.s * q.H * 1.1) : 256)), [ux, uy] = cropCentre(q);
  const ox = clamp(ux * q.W - R / 2, 0, q.W - R), oy = clamp(uy * q.H - R / 2, 0, q.H - R);
  const effR = clamp(q.eff / q.W) * R, Ld = Math.round(clamp(L * effR / R, 6, L));
  const lo = canvas(Ld, Ld), lc = lo.getContext('2d'), k = Ld / R;
  lc.setTransform(k, 0, 0, k, -ox * k, -oy * k); drawLayout(lc, q, q.W, q.H); lc.setTransform(1, 0, 0, 1, 0, 0);
  const out = canvas(L, L), c = out.getContext('2d');
  if (q.edge === 'blocky') {
    const cells = Math.max(4, Math.round(R / (q.blockF || 8))), bl = canvas(cells, cells), bc = bl.getContext('2d'); bc.drawImage(lo, 0, 0, cells, cells);
    c.imageSmoothingEnabled = true; c.drawImage(lo, 0, 0, L, L); c.globalAlpha = q.edgeAmt; c.imageSmoothingEnabled = false; c.drawImage(bl, 0, 0, L, L); c.globalAlpha = 1; c.imageSmoothingEnabled = true;
  } else { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(lo, 0, 0, L, L); }
  let img = data(out);
  if (q.edge === 'soft' && q.edgeAmt > 0) img = boxBlur(img, 1 + q.edgeAmt * 2.5);
  if (q.edge === 'sharp' || q.edge === 'waxy') { const b = boxBlur(img, 2.5), amt = (q.edge === 'sharp' ? 1.6 : .25) * q.edgeAmt; img = mapPixels(img, (r_, g, b_, i) => { const p = i * 4; return [r_ + (r_ - b.data[p]) * amt, g + (g - b.data[p + 1]) * amt, b_ + (b_ - b.data[p + 2]) * amt]; }); if (q.edge === 'waxy') { const bb = boxBlur(img, 1.5); const t = .6 * q.edgeAmt; img = mapPixels(img, (r_, g, b_, i) => [r_ + (bb.data[i * 4] - r_) * t, g + (bb.data[i * 4 + 1] - g) * t, b_ + (bb.data[i * 4 + 2] - b_) * t]); } }
  // Fine texture: grain, fibres, pores. It only exists if a sampler drew at this size.
  if (q.tex > .05) { const nr = rng(`${q.lay.seed}:tex:${Math.round(ox)}:${Math.round(oy)}`), a = q.tex * 26; img = mapPixels(img, (r_, g, b_, i) => { const x = i % L, n = (nr() - .5) * a + Math.sin(x * 1.7 + ((i / L) | 0) * .9) * a * .15; return [r_ + n, g + n, b_ + n * .9]; }); }
  if (q.seams?.amt > 0) { const sx = q.W / q.seams.nx, sy = q.H / q.seams.ny, sc = L / R, tr = rng(`${q.seams.seed}:tone`), tones = Array.from({ length: q.seams.nx * q.seams.ny }, () => (tr() - .5) * 36 * q.seams.amt); img = mapPixels(img, (r_, g, b_, i) => { const x = ox + (i % L) / sc, y = oy + ((i / L) | 0) / sc, tx = Math.floor(x / sx), ty = Math.floor(y / sy), t = tones[ty * q.seams.nx + tx] || 0, line = (Math.abs(x - Math.round(x / sx) * sx) < 1.2 / sc + .6 || Math.abs(y - Math.round(y / sy) * sy) < 1.2 / sc + .6) ? -40 * q.seams.amt : 0; return [r_ + t + line, g + t + line, b_ + t * .8 + line]; }); }
  if (progress < 1) { const pr = rng(seed + 'p' + Math.round(progress * 20)), kk = progress ** 1.3; img = mapPixels(img, (r_, g, b_) => { const n = pr() * 255; return [n + (r_ - n) * kk, n + (g - n) * kk, n + (b_ - n) * kk]; }); }
  put(out, img);
  if (q.faceSeam > .2 && q.lay.subj === 'person') { const s = subjectsOf(q.lay, q.dup)[0], h = headOf(s, q.H), sc = L / R, half = h.d * 1.5; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.strokeRect((h.x * q.W - half - ox) * sc, (h.y * q.H - half - oy) * sc, half * 2 * sc, half * 2 * sc); }
  return { cv: out, box: [ox / q.W, oy / q.H, R / q.W, R / q.H], R, real: Math.round(effR) };
}
// The picture as shown in ComfyUI (scaled to fit) with the 100% crop in a corner.
export function renderQuality(q, opts = {}) {
  const [W, H] = KIT.sizeOf(q.W, q.H), cv = canvas(W, H), c = cv.getContext('2d');
  drawLayout(c, q, W, H, { faces: true });
  let img = data(cv);
  if (q.seams?.amt > 0) { const tr = rng(`${q.seams.seed}:tone`), tones = Array.from({ length: q.seams.nx * q.seams.ny }, () => (tr() - .5) * 36 * q.seams.amt); img = mapPixels(img, (r_, g, b_, i) => { const x = i % W, y = (i / W) | 0, tx = Math.floor(x / W * q.seams.nx), ty = Math.floor(y / H * q.seams.ny), t = tones[ty * q.seams.nx + tx] || 0; return [r_ + t, g + t, b_ + t * .8]; }); }
  if (q.edge === 'blocky' && q.edgeAmt > .3 && q.blockF * W / q.W >= 2) { const cells = Math.round(q.W / q.blockF), sm = canvas(cells, Math.round(cells * H / W)); sm.getContext('2d').drawImage(put(canvas(W, H), img), 0, 0, sm.width, sm.height); const t = canvas(W, H), tc = t.getContext('2d'); tc.imageSmoothingEnabled = false; tc.drawImage(sm, 0, 0, W, H); img = data(t); }
  if (opts.progress < 1) { const pr = rng((opts.seed || '0') + 'p' + Math.round(opts.progress * 20)), kk = opts.progress ** 1.3; img = mapPixels(img, (r_, g, b_) => { const n = pr() * 255; return [n + (r_ - n) * kk, n + (g - n) * kk, n + (b_ - n) * kk]; }); }
  put(cv, img);
  const lp = loupe(q, 256, opts), size = Math.round(Math.min(W, H) * .46), x = W - size - 6, y = H - size - 6;
  c.strokeStyle = '#ffd24a'; c.lineWidth = 1.5; c.strokeRect(lp.box[0] * W, lp.box[1] * H, Math.max(3, lp.box[2] * W), Math.max(3, lp.box[3] * H));
  c.fillStyle = '#111'; c.fillRect(x - 2, y - 2, size + 4, size + 4); c.drawImage(lp.cv, x, y, size, size);
  const label = `ZOOM · ${lp.real} px`; c.font = 'bold 9px sans-serif'; const tw = c.measureText(label).width + 10; c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(x, y, tw, 13); c.fillStyle = '#ffd24a'; c.fillText(label, x + 5, y + 9.5);
  return cv;
}
for (const kind of ['generated', 'scaled', 'modelup', 'usdu', 'detailed']) KIND_RENDERERS[kind] = (v, opts) => { const q = qualityOf(v); return q ? renderQuality(q, { ...opts, seed: String(findRecipe(v)?.seed ?? '0') }) : canvas(64, 64); };
KIND_RENDERERS.facecrop = v => { const q = qualityOf(v.of); return q ? loupe(q, 256).cv : canvas(64, 64); };
// KSampler previews while it runs.
RECIPE_HOOKS.push({ match: () => true, render: (d, opts) => { const p = passFromDesc(d); const q = sampled(p, d.latent); return renderQuality(q, { ...opts, seed: String(d.seed) }); } });

// A short summary for the history and the result window.
export function summary(v) {
  const q = qualityOf(v); if (!q) return {};
  const passes = q.ops.filter(o => o.op === 'pass'), usdu = q.ops.find(o => o.op === 'usdu'), det = q.ops.find(o => o.op === 'detailer'), main = subjectsOf(q.lay, q.dup)[0];
  return { outW: q.W, outH: q.H, detail: +(q.eff / q.W).toFixed(2), tex: +q.tex.toFixed(2), edge: q.edge, edgeAmt: +q.edgeAmt.toFixed(2), faceQ: q.lay.subj === 'person' && main ? +q.face.toFixed(2) : null, facePx: main ? Math.round(headOf(main, q.H).d) : 0, faceVar: q.faceVar, dup: q.dup, ghosts: q.halluc.length, seams: +(q.seams?.amt || 0).toFixed(2), ops: q.ops.map(o => o.op), passes: passes.map(o => ({ W: o.W, d: o.d, latent: o.latent })), modelUp: q.ops.some(o => o.op === 'model') || !!usdu?.model, scaled: q.ops.filter(o => o.op === 'scale').map(o => o.method), latentUp: q.ops.some(o => o.op === 'latentUp'), usdu: usdu || null, detailer: det || null, detected: q.detected?.found ?? null, subject: q.lay.subj, wide: q.lay.wide };
}
