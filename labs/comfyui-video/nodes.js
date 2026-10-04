// Carrot Revolt Labs · Video & 3D Lab · Wan video (text and image to video, first/last frame, Wan 2.2 experts)
// and image to 3D (Hunyuan3D-style nodes). Videos are drawn as frame sequences and shown as filmstrips and
// animated sprites; meshes as shaded turntables. Every limit the lab teaches (frames, fps, size, memory, model
// mismatch, background, voxel resolution) changes what is drawn.
import { NODES, TYPE_COLOR, CATEGORIES, HANDLERS, PRECHECKS, IMAGES, SAMPLERS, SCHEDULERS, VOCAB, describeRecipe, registerNodes, addOptions } from '../comfyui/engine.js';
import { KIT, KIND_RENDERERS, RECIPE_HOOKS, PHOTOS, renderBase } from '../comfyui/render.js';

const W_ = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
const { canvas, data, put, mapPixels, boxBlur, rng, drawScene, drawSubject, sizeOf, DEFAULT_COL } = KIT;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
Object.assign(TYPE_COLOR, { CLIP_VISION: '#a8dadc', CLIP_VISION_OUTPUT: '#ad7452', VOXEL: '#9ad0a0', MESH: '#e0c080' });
for (const c of ['video', 'advanced', '3d']) if (!CATEGORIES.includes(c)) CATEGORIES.push(c);

/* ── Files ── */
export const WAN = {
  'wan2.1_t2v_1.3B_fp16.safetensors': { family: 'wan21', task: 't2v', size: '1.3B', gb: 2.8, native: [832, 480] },
  'wan2.1_t2v_14B_fp8_e4m3fn.safetensors': { family: 'wan21', task: 't2v', size: '14B', gb: 14.3, native: [1280, 720] },
  'wan2.1_i2v_480p_14B_fp8_e4m3fn.safetensors': { family: 'wan21', task: 'i2v', size: '14B', gb: 14.3, native: [832, 480] },
  'wan2.1_flf2v_720p_14B_fp8_e4m3fn.safetensors': { family: 'wan21', task: 'flf2v', size: '14B', gb: 14.3, native: [1280, 720] },
  'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors': { family: 'wan22', task: 't2v', expert: 'high', size: '14B', gb: 14.3, native: [1280, 720] },
  'wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors': { family: 'wan22', task: 't2v', expert: 'low', size: '14B', gb: 14.3, native: [1280, 720] },
};
export const VRAM = { gb: 16, video: 8.5e7 }; // pixels × frames a 14B sampler holds on the simulated card (1.3B: twice)
const H3D = 'hunyuan3d-dit-v2-0.safetensors';

/* ── Photos ── */
export const SHOTS = {
  'i2v_cat.png': { setting: 'landscape', subject: 'cat', col: '#d58b44', cx: .3, s: .5 },
  'i2v_cat_end.png': { setting: 'landscape', subject: 'cat', col: '#d58b44', cx: .72, s: .42 },
  'toy_robot.png': { object: 'robot', col: '#3d7bd9', bg: 'white' },
  'toy_robot_room.png': { object: 'robot', col: '#3d7bd9', bg: 'room' },
};
function drawShot(name, W, H) {
  const m = SHOTS[name], cv = canvas(W, H), c = cv.getContext('2d');
  if (m.object) {
    if (m.bg === 'white') { c.fillStyle = '#f4f4f2'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(0,0,0,.08)'; c.beginPath(); c.ellipse(W * .5, H * .88, W * .22, H * .04, 0, 0, 7); c.fill(); }
    else { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#c9a77c'); g.addColorStop(1, '#7a5a3c'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#5b3b22'; c.fillRect(0, H * .72, W, H * .28); c.fillStyle = '#e6dcc8'; c.fillRect(W * .62, H * .18, W * .26, H * .3); c.fillStyle = '#3f8f4d'; c.fillRect(W * .08, H * .3, W * .14, H * .42); }
    drawSubject(c, m.object, W * .5, H * .88, H * .62, m.col, 'painterly', { r: rng(name) });
    return cv;
  }
  drawScene(c, W, H, m.setting, rng('i2v'), 'painterly', null, 1);
  drawSubject(c, m.subject, W * m.cx, H * .9, H * m.s, m.col, 'painterly', { r: rng('i2vs') });
  return cv;
}
for (const n of Object.keys(SHOTS)) PHOTOS[n] = (W, H) => drawShot(n, W, H);
addOptions('LoadImage', 'image', Object.keys(SHOTS)); for (const n of Object.keys(SHOTS)) if (!IMAGES.includes(n)) IMAGES.push(n);

/* ── Nodes ── */
const ADV = [W_('add_noise', 'combo', 'enable', { options: ['enable', 'disable'] }), W_('noise_seed', 'int', 0, { min: 0, max: 2 ** 53, step: 1 }), W_('control_after_generate', 'combo', 'fixed', { options: ['fixed', 'increment', 'decrement', 'randomize'] }), W_('steps', 'int', 20, { min: 1, max: 10000, step: 1 }), W_('cfg', 'float', 8, { min: 0, max: 100, step: .1 }), W_('sampler_name', 'combo', 'euler', { options: SAMPLERS }), W_('scheduler', 'combo', 'normal', { options: SCHEDULERS }), W_('start_at_step', 'int', 0, { min: 0, max: 10000, step: 1 }), W_('end_at_step', 'int', 10000, { min: 0, max: 10000, step: 1 }), W_('return_with_leftover_noise', 'combo', 'disable', { options: ['disable', 'enable'] })];
const VID = (w = 832, h = 480, len = 81) => [W_('width', 'int', w, { min: 16, max: 16384, step: 16 }), W_('height', 'int', h, { min: 16, max: 16384, step: 16 }), W_('length', 'int', len, { min: 1, max: 16384, step: 4 }), W_('batch_size', 'int', 1, { min: 1, max: 4096, step: 1 })];
registerNodes({
  UNETLoader: { def: { title: 'Load Diffusion Model', cat: ['advanced', 'loaders'], w: 340, outputs: [O('MODEL', 'MODEL')], widgets: [W_('unet_name', 'combo', 'wan2.1_t2v_1.3B_fp16.safetensors', { options: Object.keys(WAN) }), W_('weight_dtype', 'combo', 'default', { options: ['default', 'fp8_e4m3fn', 'fp8_e4m3fn_fast', 'fp8_e5m2'] })] } },
  CLIPLoader: { def: { title: 'Load CLIP', cat: ['advanced', 'loaders'], w: 340, outputs: [O('CLIP', 'CLIP')], widgets: [W_('clip_name', 'combo', 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', { options: ['umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'clip_l.safetensors'] }), W_('type', 'combo', 'wan', { options: ['stable_diffusion', 'sd3', 'mochi', 'ltxv', 'wan', 'hidream', 'qwen_image'] }), W_('device', 'combo', 'default', { options: ['default', 'cpu'] })] } },
  VAELoader: { def: { title: 'Load VAE', cat: ['loaders'], w: 315, outputs: [O('VAE', 'VAE')], widgets: [W_('vae_name', 'combo', 'wan_2.1_vae.safetensors', { options: ['wan_2.1_vae.safetensors', 'vae-ft-mse-840000-ema-pruned.safetensors'] })] } },
  ModelSamplingSD3: { def: { title: 'ModelSamplingSD3', cat: ['advanced', 'model'], w: 260, inputs: [I('model', 'MODEL')], outputs: [O('MODEL', 'MODEL')], widgets: [W_('shift', 'float', 3, { min: 0, max: 100, step: .01 })] } },
  EmptyHunyuanLatentVideo: { def: { title: 'EmptyHunyuanLatentVideo', cat: ['latent', 'video'], w: 300, outputs: [O('LATENT', 'LATENT')], widgets: VID(848, 480, 25) } },
  CLIPVisionLoader: { def: { title: 'Load CLIP Vision', cat: ['loaders'], w: 300, outputs: [O('CLIP_VISION', 'CLIP_VISION')], widgets: [W_('clip_name', 'combo', 'clip_vision_h.safetensors', { options: ['clip_vision_h.safetensors'] })] } },
  CLIPVisionEncode: { def: { title: 'CLIP Vision Encode', cat: ['conditioning'], w: 280, inputs: [I('clip_vision', 'CLIP_VISION'), I('image', 'IMAGE')], outputs: [O('CLIP_VISION_OUTPUT', 'CLIP_VISION_OUTPUT')], widgets: [W_('crop', 'combo', 'center', { options: ['center', 'none'] })] } },
  WanImageToVideo: { def: { title: 'WanImageToVideo', cat: ['conditioning', 'video_models'], w: 320, inputs: [I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('vae', 'VAE'), I('clip_vision_output', 'CLIP_VISION_OUTPUT', { optional: true }), I('start_image', 'IMAGE', { optional: true })], outputs: [O('positive', 'CONDITIONING'), O('negative', 'CONDITIONING'), O('latent', 'LATENT')], widgets: VID() } },
  WanFirstLastFrameToVideo: { def: { title: 'WanFirstLastFrameToVideo', cat: ['conditioning', 'video_models'], w: 330, inputs: [I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('vae', 'VAE'), I('clip_vision_start_image', 'CLIP_VISION_OUTPUT', { optional: true }), I('clip_vision_end_image', 'CLIP_VISION_OUTPUT', { optional: true }), I('start_image', 'IMAGE', { optional: true }), I('end_image', 'IMAGE', { optional: true })], outputs: [O('positive', 'CONDITIONING'), O('negative', 'CONDITIONING'), O('latent', 'LATENT')], widgets: VID() } },
  KSamplerAdvanced: { def: { title: 'KSampler (Advanced)', cat: ['sampling'], w: 330, inputs: [I('model', 'MODEL'), I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('latent_image', 'LATENT')], outputs: [O('LATENT', 'LATENT')], widgets: ADV } },
  SaveAnimatedWEBP: { def: { title: 'SaveAnimatedWEBP', cat: ['image', 'animation'], w: 320, inputs: [I('images', 'IMAGE')], widgets: [W_('filename_prefix', 'string', 'ComfyUI'), W_('fps', 'float', 6, { min: .01, max: 1000, step: .01 }), W_('lossless', 'combo', 'false', { options: ['false', 'true'] }), W_('quality', 'int', 80, { min: 0, max: 100, step: 1 }), W_('method', 'combo', 'default', { options: ['default', 'fastest', 'slowest'] })], output: true, preview: true, savesToHistory: true } },
  ImageOnlyCheckpointLoader: { def: { title: 'Image Only Checkpoint Loader (img2vid model)', cat: ['loaders', 'video_models'], w: 340, outputs: [O('MODEL', 'MODEL'), O('CLIP_VISION', 'CLIP_VISION'), O('VAE', 'VAE')], widgets: [W_('ckpt_name', 'combo', H3D, { options: [H3D, 'hunyuan3d-dit-v2-mv.safetensors'] })] } },
  Hunyuan3Dv2Conditioning: { def: { title: 'Hunyuan3Dv2Conditioning', cat: ['conditioning', 'video_models'], w: 300, inputs: [I('clip_vision_output', 'CLIP_VISION_OUTPUT')], outputs: [O('positive', 'CONDITIONING'), O('negative', 'CONDITIONING')] } },
  Hunyuan3Dv2ConditioningMultiView: { def: { title: 'Hunyuan3Dv2ConditioningMultiView', cat: ['conditioning', 'video_models'], w: 320, inputs: [I('front', 'CLIP_VISION_OUTPUT', { optional: true }), I('left', 'CLIP_VISION_OUTPUT', { optional: true }), I('back', 'CLIP_VISION_OUTPUT', { optional: true }), I('right', 'CLIP_VISION_OUTPUT', { optional: true })], outputs: [O('positive', 'CONDITIONING'), O('negative', 'CONDITIONING')] } },
  EmptyLatentHunyuan3Dv2: { def: { title: 'EmptyLatentHunyuan3Dv2', cat: ['latent', '3d'], w: 280, outputs: [O('LATENT', 'LATENT')], widgets: [W_('resolution', 'int', 3072, { min: 1, max: 8192, step: 1 }), W_('batch_size', 'int', 1, { min: 1, max: 4096, step: 1 })] } },
  VAEDecodeHunyuan3D: { def: { title: 'VAEDecodeHunyuan3D', cat: ['latent', '3d'], w: 300, inputs: [I('samples', 'LATENT'), I('vae', 'VAE')], outputs: [O('VOXEL', 'VOXEL')], widgets: [W_('num_chunks', 'int', 8000, { min: 1000, max: 500000, step: 1000 }), W_('octree_resolution', 'int', 256, { min: 16, max: 512, step: 16 })] } },
  VoxelToMesh: { def: { title: 'VoxelToMesh', cat: ['3d'], w: 280, inputs: [I('voxel', 'VOXEL')], outputs: [O('MESH', 'MESH')], widgets: [W_('algorithm', 'combo', 'surface net', { options: ['surface net', 'basic'] }), W_('threshold', 'float', .6, { min: -1, max: 1, step: .01 })] } },
  SaveGLB: { def: { title: 'Save 3D Model', cat: ['3d'], w: 300, inputs: [I('mesh', 'MESH')], widgets: [W_('filename_prefix', 'string', 'mesh/ComfyUI')], output: true, outputImage: true, preview: true, savesToHistory: true } },
  ImageRemoveBackground: { def: { title: 'Image Remove Background (rembg)', cat: ['image'], custom: 'rembg', w: 300, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')], widgets: [W_('model', 'combo', 'u2net', { options: ['u2net', 'isnet-general-use', 'silueta'] })] } },
});
// The engine only reads 'images' from output nodes; the GLB saver shows its mesh instead.
NODES.SaveGLB.outputImage = true;
const handlers = {
  UNETLoader: ({ w }) => { const f = WAN[w.unet_name]; return [{ ckpt: w.unet_name, arch: 'Wan', native: f.native[1], look: 'xl', loras: [], ...f, gb: w.weight_dtype === 'default' || f.gb < 10 ? f.gb : f.gb }]; },
  CLIPLoader: ({ w }) => [{ ckpt: w.clip_name, arch: w.type === 'wan' && w.clip_name.startsWith('umt5') ? 'Wan' : 'Other', loras: [] }],
  VAELoader: ({ w }) => [{ ckpt: w.vae_name, arch: w.vae_name.startsWith('wan') ? 'Wan' : 'SD1.5' }],
  ModelSamplingSD3: ({ w, get }) => [{ ...get('model'), shift: w.shift }],
  EmptyHunyuanLatentVideo: ({ w }) => [{ w: w.width, h: w.height, frames: w.length, batch: w.batch_size, video: true, source: null }],
  CLIPVisionLoader: ({ w }) => [{ name: w.clip_name }],
  CLIPVisionEncode: ({ get }) => [{ image: get('image') }],
  WanImageToVideo: ({ w, get }) => { const p = get('positive'), n = get('negative'), st = get('start_image'), cv = get('clip_vision_output'); const extra = { i2v: true, start: st || null, vision: !!cv }; return [{ ...p, prompt: { ...p.prompt, video: extra } }, { ...n }, { w: w.width, h: w.height, frames: w.length, batch: 1, video: true, source: null, ...extra }]; },
  WanFirstLastFrameToVideo: ({ w, get }) => { const p = get('positive'), st = get('start_image'), en = get('end_image'); const extra = { flf: true, start: st || null, end: en || null, vision: !!(get('clip_vision_start_image') || get('clip_vision_end_image')) }; return [{ ...p, prompt: { ...p.prompt, video: extra } }, { ...get('negative') }, { w: w.width, h: w.height, frames: w.length, batch: 1, video: true, source: null, ...extra }]; },
  KSamplerAdvanced: ({ w, get }) => {
    const m = get('model'), pos = get('positive'), neg = get('negative'), lat = get('latent_image'), end = Math.min(w.end_at_step, w.steps);
    const stage = { addNoise: w.add_noise === 'enable', start: w.start_at_step, end, steps: w.steps, leftover: w.return_with_leftover_noise === 'enable', expert: m.expert || null, prev: lat?.partial ? lat.recipe.pos.prompt.stage : null };
    const recipe = { model: m, pos: { ...pos, prompt: { ...pos.prompt, stage } }, neg, latent: lat?.partial ? lat.recipe.latent : lat, seed: w.noise_seed, steps: w.steps, cfg: w.cfg, sampler: w.sampler_name, scheduler: w.scheduler, denoise: 1 };
    return [{ w: lat.w, h: lat.h, frames: lat.frames, batch: lat.batch, sampled: true, partial: end < w.steps, recipe }];
  },
  SaveAnimatedWEBP: () => [],
  ImageOnlyCheckpointLoader: ({ w }) => [{ ckpt: w.ckpt_name, arch: 'H3D', native: 512, look: 'xl', loras: [], mv: w.ckpt_name.includes('-mv') }, { name: 'h3d-vision' }, { ckpt: w.ckpt_name, arch: 'H3D' }],
  Hunyuan3Dv2Conditioning: ({ get }) => { const v = get('clip_vision_output'); return [{ prompt: { text: '', subjects: [], settings: [], colors: [], styles: [], weights: {}, triggers: [], h3d: { views: [v?.image].filter(Boolean) } }, clip: { arch: 'H3D' }, controls: [] }, { prompt: { text: '', subjects: [], settings: [], colors: [], styles: [], weights: {}, triggers: [] }, clip: { arch: 'H3D' }, controls: [] }]; },
  Hunyuan3Dv2ConditioningMultiView: ({ get }) => { const views = ['front', 'left', 'back', 'right'].map(k => get(k)?.image).filter(Boolean); return [{ prompt: { text: '', subjects: [], settings: [], colors: [], styles: [], weights: {}, triggers: [], h3d: { views, multi: true } }, clip: { arch: 'H3D' }, controls: [] }, { prompt: { text: '', subjects: [], settings: [], colors: [], styles: [], weights: {}, triggers: [] }, clip: { arch: 'H3D' }, controls: [] }]; },
  EmptyLatentHunyuan3Dv2: ({ w }) => [{ w: 512, h: 512, batch: w.batch_size, h3d: w.resolution, source: null }],
  VAEDecodeHunyuan3D: ({ w, get }) => { const s = get('samples'); return [{ kind: 'voxel', recipe: s.recipe, octree: w.octree_resolution }]; },
  VoxelToMesh: ({ w, get }) => { const v = get('voxel'); return [{ kind: 'mesh', voxel: v, recipe: v.recipe, algorithm: w.algorithm, threshold: w.threshold, w: 512, h: 512 }]; },
  SaveGLB: ({ get }) => [get('mesh')],
  ImageRemoveBackground: ({ get }) => { const i = get('image'); return [{ ...i, kind: 'cutout', of: i, name: i.name }]; },
};
for (const [t, fn] of Object.entries(handlers)) HANDLERS[t] = ctx => fn({ ...ctx, get: name => ctx.get(ctx.n.id, name) });
KIND_RENDERERS.cutout = v => { const src = drawShot(v.name, 256, 256), d = data(src); return put(canvas(256, 256), mapPixels(d, (r, g, b) => { const bgLike = SHOTS[v.name]?.bg === 'room' ? (Math.abs(r - 200) < 70 && g > 80 && b < 200 && !(b > r)) : r > 236 && g > 236 && b > 230; return bgLike ? [255, 255, 255] : [r, g, b]; })); };

// Memory and model checks, before the sampler runs.
PRECHECKS.push(({ n, get }) => {
  if (n.type !== 'KSampler' && n.type !== 'KSamplerAdvanced') return null;
  const m = get('model'), lat = get('latent_image'), pos = get('positive');
  if (!m || !WAN[m.ckpt] || !lat) return null;
  const load = lat.w * lat.h * (lat.frames || 1) / (m.size === '1.3B' ? 2 : 1);
  if (load > VRAM.video) return { msg: 'oom', title: n.type === 'KSampler' ? 'KSampler' : 'KSampler (Advanced)', error: 'torch.OutOfMemoryError', detail: `Allocation on device. ${lat.w}×${lat.h}×${lat.frames} frames does not fit in ${VRAM.gb} GB with a ${m.size} model`, trace: '  File "comfy/ldm/wan/model.py", line 512, in forward\n  File "comfy/ldm/modules/attention.py", in attention_pytorch', hint: { en: 'Video multiplies the memory by the number of frames. Use 832 × 480, fewer frames, or a smaller model (1.3B / 5B).', ca: 'El vídeo multiplica la memòria pel nombre de frames. Fes servir 832 × 480, menys frames o un model més petit (1.3B / 5B).', es: 'El vídeo multiplica la memoria por el número de frames. Usa 832 × 480, menos frames o un modelo más pequeño (1.3B / 5B).' } };
  if ((lat.i2v || lat.flf) && m.task === 't2v') return { msg: 'shape', title: 'KSampler', error: 'RuntimeError', detail: 'Given groups=1, weight of size [5120, 16, 1, 2, 2], expected input[1, 36, 21, 60, 104] to have 16 channels, but got 36 channels instead', trace: '  File "comfy/ldm/wan/model.py", line 530, in forward', hint: { en: 'An image-to-video conditioning needs an image-to-video model (i2v / flf2v): the text-to-video model expects 16 channels, not 36.', ca: 'Un conditioning d’imatge a vídeo necessita un model d’imatge a vídeo (i2v / flf2v): el model de text a vídeo espera 16 canals, no 36.', es: 'Un conditioning de imagen a vídeo necesita un modelo de imagen a vídeo (i2v / flf2v): el modelo de texto a vídeo espera 16 canales, no 36.' } };
  void pos; return null;
});

/* ── Video: what moves, and how well ── */
const MOTION = { walking: 'walk', walks: 'walk', running: 'run', runs: 'run', jumping: 'jump', jumps: 'jump', turning: 'turn', turns: 'turn', spinning: 'turn', dancing: 'jump' };
export function videoPlan(d) {
  const text = (d.pos.raw || d.pos.text || '').toLowerCase(), m = d.model, lat = d.latent, frames = lat.frames || 1;
  const words = text.split(/[^a-z]+/), motion = words.map(w => MOTION[w]).find(Boolean) || null;
  const camera = /zoom(s|ing)? in|push(es|ing)? in|dolly in/.test(text) ? 'zoom' : /pan(s|ning)? (to the )?left/.test(text) ? 'panL' : /pan(s|ning)? (to the )?right/.test(text) ? 'panR' : null;
  const st = d.pos.stage, prev = st?.prev;
  let experts = null;
  if (m.family === 'wan22') {
    if (st && prev) experts = prev.expert === 'high' && st.expert === 'low' && prev.leftover && !st.addNoise && st.start === prev.end ? 'ok' : prev.expert === 'low' && st.expert === 'high' ? 'reversed' : 'broken';
    else experts = m.expert === 'high' ? 'highOnly' : 'lowOnly';
  }
  const native = m.native ? m.native[0] * m.native[1] : 832 * 480, area = lat.w * lat.h;
  const tooBig = m.size === '1.3B' && area > native * 1.5;
  const steps = st ? st.steps : d.steps, flicker = clamp((22 - steps) / 18) + (tooBig ? .5 : 0) + (experts === 'reversed' ? .4 : experts === 'lowOnly' ? .15 : 0);
  const v = d.pos.video || {};
  const P = {
    frames, motion, camera, drift: clamp((frames - 81) / 60), flicker: clamp(flicker), tooBig, experts,
    softness: experts === 'reversed' ? .8 : experts === 'highOnly' ? .45 : experts === 'broken' ? .6 : 0, weakMotion: experts === 'lowOnly' ? .7 : 0,
    i2v: !!v.i2v, flf: !!v.flf, start: v.start?.name || null, end: v.end?.name || null, vision: !!v.vision, model: m.task, family: m.family,
    keepsStart: !!(v.start && SHOTS[v.start.name] && (m.task === 'i2v' || m.task === 'flf2v')), reachesEnd: !!(v.flf && v.end && m.task === 'flf2v'),
  };
  P.identity = P.keepsStart ? (P.vision || m.family === 'wan22' ? 1 : .7) : 0;
  return P;
}
const negs = d => new Set(d.neg.subjects.map(s => s.value));
function drawFrame(d, P, t, W, H, r0) {
  const cv = canvas(W, H), c = cv.getContext('2d'), r = rng(`${d.seed}:scene`);
  const startShot = P.keepsStart ? SHOTS[P.start] : null, endShot = P.reachesEnd ? SHOTS[P.end] : null;
  const subj = startShot?.subject || d.pos.subjects.map(s => s.value).find(s => !negs(d).has(s)) || null;
  const setting = startShot?.setting || d.pos.settings[0]?.value || 'none';
  const col = startShot?.col || d.pos.colors[0]?.value || DEFAULT_COL[subj] || '#999';
  // Camera
  const zoom = P.camera === 'zoom' ? 1 + .35 * t : P.camera ? 1.2 : 1, pan = P.camera === 'panL' ? -.18 * t : P.camera === 'panR' ? .18 * t : 0;
  c.save(); c.translate(W / 2, H / 2); c.scale(zoom, zoom); c.translate(-W / 2 + pan * W, -H / 2);
  drawScene(c, W, H, setting, r, d.look, null, 1);
  if (subj) {
    const amt = 1 - P.weakMotion, x0 = startShot ? startShot.cx : .35 + rng(`${d.seed}:x`)() * .1;
    let cx = x0, by = .9, s = startShot ? startShot.s : .48, flip = 1;
    if (endShot) { cx = x0 + (endShot.cx - x0) * t; s = s + (endShot.s - s) * t; }
    else if (P.motion === 'walk') cx = x0 + .28 * t * amt;
    else if (P.motion === 'run') cx = x0 + .5 * t * amt;
    else if (P.motion === 'jump') by = .9 - Math.abs(Math.sin(t * Math.PI * 3)) * .14 * amt;
    else if (P.motion === 'turn') flip = Math.cos(t * Math.PI * 2 * amt);
    else cx = x0 + Math.sin(t * 6) * .004;
    // Drift: past the frames the model was trained on, the subject morphs and the motion loops.
    if (P.drift > 0 && t > .62) { const k = (t - .62) / .38 * P.drift; cx = cx - (cx - x0) * k * 1.2; s *= 1 + Math.sin(t * 20) * .12 * k; }
    c.save(); c.translate(W * cx, 0); c.scale(Math.abs(flip) < .15 ? .15 * Math.sign(flip || 1) : flip, 1); c.translate(-W * cx, 0);
    drawSubject(c, subj, W * cx, H * by, H * s, col, d.look, { r: rng(`${d.seed}:subj`) });
    if (P.tooBig) { c.globalAlpha = .55; drawSubject(c, subj, W * (cx + .32), H * by, H * s * .9, col, d.look, { r: rng(`${d.seed}:dup`) }); }
    c.restore();
  }
  c.restore();
  let img = data(cv);
  if (P.softness) img = boxBlur(img, 1 + P.softness * 3);
  if (P.flicker > .05) { const fr = rng(`${d.seed}:f${Math.round(t * 200)}`), k = P.flicker; const shift = (fr() - .5) * 60 * k; img = mapPixels(img, (rr, gg, bb) => { const n = (fr() - .5) * 50 * k; return [rr + shift + n, gg + shift * .8 + n, bb + shift * .6 + n]; }); }
  if (P.drift > 0 && t > .62) { const k = (t - .62) / .38 * P.drift; img = mapPixels(img, (rr, gg, bb) => [rr + 30 * k, gg - 10 * k, bb + 25 * k]); }
  void r0; return put(cv, img);
}
export function frames(d, n = 12) { const P = videoPlan(d), [W, H] = sizeOf(d.w, d.h), out = []; const count = Math.max(1, Math.min(n, P.frames)); for (let i = 0; i < count; i++) out.push(drawFrame(d, P, count === 1 ? 0 : i / (count - 1), W, H)); return { P, frames: out }; }
// A filmstrip for node previews: 4 frames with sprocket holes.
function filmstrip(d, opts = {}) {
  const { P, frames: fs } = frames(d, 4), w = fs[0].width, h = fs[0].height, cv = canvas(w * 2 + 6, h * 2 + 18), c = cv.getContext('2d');
  c.fillStyle = '#111'; c.fillRect(0, 0, cv.width, cv.height);
  fs.forEach((f, i) => c.drawImage(f, 2 + (i % 2) * (w + 2), 2 + Math.floor(i / 2) * (h + 2)));
  c.fillStyle = '#ffd24a'; c.font = 'bold 11px sans-serif'; c.fillText(P.frames > 1 ? `▶ ${P.frames} frames` : 'single image', 6, cv.height - 4);
  if (opts.progress < 1) { const k = opts.progress ** 1.3, pr = rng('vp' + Math.round(opts.progress * 20)), img = data(cv); put(cv, mapPixels(img, (r, g, b) => { const nn = pr() * 255; return [nn + (r - nn) * k, nn + (g - nn) * k, nn + (b - nn) * k]; })); }
  return cv;
}
export function sprite(d, n = 12, size = 120) { const { frames: fs } = frames(d, n), w = size, h = Math.round(size * fs[0].height / fs[0].width), cv = canvas(w * fs.length, h); fs.forEach((f, i) => cv.getContext('2d').drawImage(f, i * w, 0, w, h)); return { cv, n: fs.length, ar: `${fs[0].width}/${fs[0].height}` }; }

/* ── 3D ── */
export function meshPlan(mesh) {
  const r = mesh.recipe, h = r.pos.prompt.h3d || { views: [] }, view = h.views[0] || null, name = view?.name || null;
  const shot = SHOTS[name] || null, cut = view?.kind === 'cutout';
  return { object: shot?.object || null, col: shot?.col || '#999', slab: !!(shot && shot.bg === 'room' && !cut), cut, multi: !!h.multi && h.views.length >= 2, mvModel: !!r.model.mv, octree: mesh.voxel.octree, threshold: mesh.threshold, blocky: clamp((256 - mesh.voxel.octree) / 192), bloated: clamp((.45 - mesh.threshold) / .5), holes: clamp((mesh.threshold - .8) / .3), steps: r.steps, ok: !!shot };
}
function drawMesh(M, angle, W, H) {
  const cv = canvas(W, H), c = cv.getContext('2d'); const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a3d42'); g.addColorStop(1, '#202226'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,.06)'; for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(W / 2 + i * W * .08, H * .92); c.lineTo(W / 2 + i * W * .2, H); c.stroke(); }
  if (!M.ok) return cv;
  const cos = Math.cos(angle), back = Math.cos(angle) < 0, sx = .45 + .55 * Math.abs(cos);
  const res = Math.max(10, Math.round(W * (1 - M.blocky * .85) * .5)), lo = canvas(res, res), lc = lo.getContext('2d');
  lc.save(); lc.translate(res / 2, 0); lc.scale(sx, 1); lc.translate(-res / 2, 0);
  if (M.slab) { lc.fillStyle = '#8a6a4a'; lc.fillRect(res * .05, res * .1, res * .9, res * .85); }
  const shade = back ? (M.multi ? .8 : .55) : .6 + .4 * Math.abs(cos);
  const col = KIT.hex(M.col).map(v => Math.round(v * shade)), hexCol = '#' + col.map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('');
  drawSubject(lc, M.object, res * .5, res * .9, res * .66 * (1 + M.bloated * .12), back && !M.multi ? '#7f8792' : hexCol, 'xl', { r: rng('mesh') });
  lc.restore();
  let d = lc.getImageData(0, 0, res, res), a = mapPixels(d, (r, g, b, i) => { const v = d.data[i * 4 + 3]; return [v, v, v]; });
  const blur = k => { d = boxBlur(d, k); a = boxBlur(a, k); };
  if (back && !M.multi) blur(1.5); // the back was guessed from one picture: soft and vague
  if (M.bloated > 0) blur(M.bloated * 2);
  const hr = rng('holes'), alpha = new Uint8ClampedArray(res * res);
  for (let i = 0; i < alpha.length; i++) alpha[i] = M.holes > 0 && hr() < M.holes * .35 ? 0 : a.data[i * 4];
  for (let i = 0; i < alpha.length; i++) d.data[i * 4 + 3] = alpha[i];
  put(lo, d);
  c.imageSmoothingEnabled = M.blocky < .3; c.drawImage(lo, W * .1, H * .02, W * .8, H * .88);
  return cv;
}
KIND_RENDERERS.mesh = (v, opts = {}) => { const M = meshPlan(v), cv = drawMesh(M, -.6, 256, 256); if (opts.progress < 1) return cv; return cv; };
KIND_RENDERERS.voxel = v => drawMesh({ ...meshPlan({ ...v, voxel: v, threshold: .6 }), blocky: 1 }, -.6, 256, 256);
export function turntable(mesh, n = 12, size = 120) { const M = meshPlan(mesh), cv = canvas(size * n, size); for (let i = 0; i < n; i++) cv.getContext('2d').drawImage(drawMesh(M, -.6 + i / n * Math.PI * 2, size, size), i * size, 0); return { cv, n }; }

/* ── Rendering hooks ── */
// Every video recipe is drawn as a filmstrip; still images go to the base renderer.
KIND_RENDERERS.generated = (v, opts = {}) => { const d = describeRecipe(v.recipe); return v.recipe.latent?.video ? filmstrip(d, opts) : renderBase(d, opts); };
RECIPE_HOOKS.push({ match: d => !!d.latent?.video, render: (d, opts = {}) => filmstrip(d, opts) });

/* ── Summary for the history and the result window ── */
const toData = (cv, type = 'image/jpeg') => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c.toDataURL(type, .8); };
export function findRecipe(v) { return v?.recipe || v?.voxel?.recipe || null; }
export function outputExtra(img, graph) {
  if (img?.kind === 'mesh') { const M = meshPlan(img); const t = typeof document !== 'undefined' ? turntable(img) : null; return { mesh: { ok: M.ok, slab: M.slab, cut: M.cut, multi: M.multi, octree: M.octree, threshold: M.threshold, blocky: M.blocky > .4, bloated: M.bloated > .3, holes: M.holes > .3 }, sprite: t ? toData(t.cv) : null, spriteN: t?.n || 0, spriteFps: 6, ar: '1/1' }; }
  const r = img?.recipe; if (!r?.latent?.video) return {};
  const d = describeRecipe(r), P = videoPlan(d), save = graph?.nodes.find(n => n.type === 'SaveAnimatedWEBP' && n.mode === 0), fps = save?.widgets.fps ?? 16;
  const sp = typeof document !== 'undefined' ? sprite(d) : null;
  return { video: { frames: P.frames, fps, seconds: +(P.frames / fps).toFixed(2), motion: P.motion, camera: P.camera, drift: P.drift > .2, flicker: P.flicker > .35, tooBig: P.tooBig, experts: P.experts, i2v: P.i2v, flf: P.flf, keepsStart: P.keepsStart, reachesEnd: P.reachesEnd, identity: P.identity, model: d.model.ckpt, w: d.w, h: d.h }, sprite: sp ? toData(sp.cv) : null, spriteN: sp?.n || 0, spriteFps: fps, ar: sp?.ar };
}
export function historyExtra() { return {}; }
void VOCAB;
