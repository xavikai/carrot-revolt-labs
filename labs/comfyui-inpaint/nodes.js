// Carrot Revolt Labs · Inpainting Lab · extra nodes, sample photos and the inpainting simulator.
// The four classic inpainting routes in ComfyUI behave differently, and the simulator shows why:
//  · VAE Encode (for Inpainting) erases the masked area: it needs denoise 1, and without an inpainting model the edge shows.
//  · Set Latent Noise Mask keeps what is under the mask: low denoise = small changes, good to recolour.
//  · InpaintModelConditioning gives the model the image and the mask: with an inpainting checkpoint the edge disappears.
//  · Differential Diffusion reads a soft mask as "how much to change" per pixel; without it a soft mask becomes blocky.
import { NODES, TYPE_COLOR, CHECKPOINTS, IMAGES, HANDLERS, CATEGORIES, registerNodes, addOptions } from '../comfyui/engine.js';
import { KIT, PHOTOS, KIND_RENDERERS, RECIPE_HOOKS, renderValue, renderBase } from '../comfyui/render.js';

const W_ = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
TYPE_COLOR.STITCHER = '#c8a2c8';
for (const c of ['inpaint', 'model_patches']) if (!CATEGORIES.includes(c)) CATEGORIES.push(c);
CHECKPOINTS['dreamshaper_8Inpainting.safetensors'] = { arch: 'SD1.5', native: 512, look: 'painterly', inpaint: true };
addOptions('CheckpointLoaderSimple', 'ckpt_name', ['dreamshaper_8Inpainting.safetensors']);

/* ── Sample photos and where their main object is (normalised bounding box) ── */
export const PHOTO_META = {
  'garden_cat.png': { setting: 'landscape', subject: 'cat', box: [.32, .44, .71, .9], col: '#d58b44', cx: .46, by: .88, s: .42 },
  'beach_person.png': { setting: 'beach', subject: 'person', box: [.53, .47, .71, .92], col: '#c9604b', cx: .62, by: .9, s: .42 },
  'snow_cabin.png': { setting: 'snow', subject: 'house', box: [.28, .39, .72, .87], col: '#c96b4b', cx: .5, by: .86, s: .46 },
};
// The photo, or the same place without its main object (what a perfect clean plate would be).
function drawPhoto(name, W, H, withSubject = true, seed = name) {
  const m = PHOTO_META[name], cv = KIT.canvas(W, H), c = cv.getContext('2d'), r = KIT.rng(seed);
  KIT.drawScene(c, W, H, m.setting, r, 'painterly', null, 1);
  if (name === 'beach_person.png' && withSubject !== 'all') KIT.drawSubject(c, 'lighthouse', W * .17, H * .7, H * .26, '#e8e2d6', 'painterly', {});
  if (withSubject) KIT.drawSubject(c, m.subject, W * m.cx, H * m.by, H * m.s, m.col, 'painterly', { r });
  const n = KIT.rng(name + ':grain'); c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < W * H / 60; i++) c.fillRect(n() * W, n() * H, 1, 1);
  return cv;
}
for (const name of Object.keys(PHOTO_META)) PHOTOS[name] = (W, H) => drawPhoto(name, W, H);
addOptions('LoadImage', 'image', Object.keys(PHOTO_META));
if (!IMAGES.includes('garden_cat.png')) IMAGES.push(...Object.keys(PHOTO_META));

/* ── Nodes ── */
registerNodes({
  GrowMask: { def: { title: 'Grow Mask', cat: ['mask'], w: 280, inputs: [I('mask', 'MASK')], outputs: [O('MASK', 'MASK')], widgets: [W_('expand', 'int', 0, { min: -128, max: 128, step: 1 }), W_('tapered_corners', 'combo', 'true', { options: ['true', 'false'] })] } },
  GrowMaskWithBlur: { def: { title: 'Grow Mask With Blur', cat: ['mask'], custom: 'KJNodes', w: 300, inputs: [I('mask', 'MASK')], outputs: [O('mask', 'MASK'), O('mask_inverted', 'MASK')], widgets: [W_('expand', 'int', 0, { min: -128, max: 128, step: 1 }), W_('blur_radius', 'float', 0, { min: 0, max: 100, step: .1 })] } },
  InvertMask: { def: { title: 'InvertMask', cat: ['mask'], w: 220, inputs: [I('mask', 'MASK')], outputs: [O('MASK', 'MASK')] } },
  MaskToImage: { def: { title: 'Convert Mask to Image', cat: ['mask'], w: 240, inputs: [I('mask', 'MASK')], outputs: [O('IMAGE', 'IMAGE')] } },
  VAEEncodeForInpaint: { def: { title: 'VAE Encode (for Inpainting)', cat: ['latent', 'inpaint'], w: 300, inputs: [I('pixels', 'IMAGE'), I('vae', 'VAE'), I('mask', 'MASK')], outputs: [O('LATENT', 'LATENT')], widgets: [W_('grow_mask_by', 'int', 6, { min: 0, max: 64, step: 1 })] } },
  SetLatentNoiseMask: { def: { title: 'Set Latent Noise Mask', cat: ['latent', 'inpaint'], w: 260, inputs: [I('samples', 'LATENT'), I('mask', 'MASK')], outputs: [O('LATENT', 'LATENT')] } },
  InpaintModelConditioning: { def: { title: 'InpaintModelConditioning', cat: ['conditioning', 'inpaint'], w: 300, inputs: [I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('vae', 'VAE'), I('pixels', 'IMAGE'), I('mask', 'MASK')], outputs: [O('positive', 'CONDITIONING'), O('negative', 'CONDITIONING'), O('latent', 'LATENT')], widgets: [W_('noise_mask', 'combo', 'true', { options: ['true', 'false'] })] } },
  DifferentialDiffusion: { def: { title: 'Differential Diffusion', cat: ['model_patches'], w: 260, inputs: [I('model', 'MODEL')], outputs: [O('MODEL', 'MODEL')], widgets: [W_('strength', 'float', 1, { min: 0, max: 1, step: .01 })] } },
  ImagePadForOutpaint: { def: { title: 'Pad Image for Outpainting', cat: ['image'], w: 300, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE'), O('MASK', 'MASK')], widgets: [W_('left', 'int', 0, { min: 0, max: 2048, step: 8 }), W_('top', 'int', 0, { min: 0, max: 2048, step: 8 }), W_('right', 'int', 0, { min: 0, max: 2048, step: 8 }), W_('bottom', 'int', 0, { min: 0, max: 2048, step: 8 }), W_('feathering', 'int', 40, { min: 0, max: 512, step: 1 })] } },
  ImageCompositeMasked: { def: { title: 'ImageCompositeMasked', cat: ['image'], w: 300, inputs: [I('destination', 'IMAGE'), I('source', 'IMAGE'), I('mask', 'MASK', { optional: true })], outputs: [O('IMAGE', 'IMAGE')], widgets: [W_('x', 'int', 0, { min: 0, max: 4096, step: 1 }), W_('y', 'int', 0, { min: 0, max: 4096, step: 1 }), W_('resize_source', 'combo', 'false', { options: ['false', 'true'] })] } },
  InpaintCrop: { def: { title: '✂️ Inpaint Crop', cat: ['inpaint'], custom: 'CropAndStitch', w: 300, inputs: [I('image', 'IMAGE'), I('mask', 'MASK')], outputs: [O('stitcher', 'STITCHER'), O('cropped_image', 'IMAGE'), O('cropped_mask', 'MASK')], widgets: [W_('context_expand_factor', 'float', 1.5, { min: 1, max: 4, step: .1 }), W_('output_target_size', 'int', 512, { min: 64, max: 2048, step: 8 })] } },
  InpaintStitch: { def: { title: '✂️ Inpaint Stitch', cat: ['inpaint'], custom: 'CropAndStitch', w: 260, inputs: [I('stitcher', 'STITCHER'), I('inpainted_image', 'IMAGE')], outputs: [O('image', 'IMAGE')] } },
});
// Execution (no DOM): each node returns plain descriptions; the renderer draws them.
const handlers = {
  GrowMask: ({ w, get }) => [{ kind: 'grow', of: get(null, 'mask'), px: w.expand }],
  GrowMaskWithBlur: ({ w, get }) => { const m = { kind: 'grow', of: get(null, 'mask'), px: w.expand, blur: w.blur_radius }; return [m, { kind: 'invert', of: m }]; },
  InvertMask: ({ get }) => [{ kind: 'invert', of: get(null, 'mask') }],
  MaskToImage: ({ get }) => [{ kind: 'maskimg', mask: get(null, 'mask'), w: 512, h: 512 }],
  VAEEncodeForInpaint: ({ w, get }) => { const img = get(null, 'pixels'); return [{ w: img.w, h: img.h, batch: 1, source: img, inpaint: { method: 'vaeinpaint', mask: get(null, 'mask'), grow: w.grow_mask_by } }]; },
  SetLatentNoiseMask: ({ get }) => { const s = get(null, 'samples'); return [{ ...s, inpaint: { method: 'noisemask', mask: get(null, 'mask') } }]; },
  InpaintModelConditioning: ({ w, get }) => { const p = get(null, 'positive'), n = get(null, 'negative'), img = get(null, 'pixels'); return [{ ...p, inpaintCond: true }, { ...n, inpaintCond: true }, { w: img.w, h: img.h, batch: 1, source: img, inpaint: { method: 'imc', mask: get(null, 'mask'), noiseMask: w.noise_mask === 'true' } }]; },
  DifferentialDiffusion: ({ w, get }) => [{ ...get(null, 'model'), diffdiff: w.strength }],
  ImagePadForOutpaint: ({ w, get }) => { const img = get(null, 'image'), pad = { l: w.left, t: w.top, r: w.right, b: w.bottom }, W = img.w + pad.l + pad.r, Hh = img.h + pad.t + pad.b; return [{ kind: 'pad', of: img, pad, w: W, h: Hh }, { kind: 'padmask', pad, feather: w.feathering, ow: img.w, oh: img.h, w: W, h: Hh }]; },
  ImageCompositeMasked: ({ w, get }) => { const d = get(null, 'destination'), s = get(null, 'source'); return [{ kind: 'composite', dest: d, src: s, mask: get(null, 'mask') || null, x: w.x, y: w.y, w: d.w, h: d.h }]; },
  InpaintCrop: ({ w, get }) => { const img = get(null, 'image'), m = get(null, 'mask'), st = { image: img, mask: m, factor: w.context_expand_factor, size: w.output_target_size }; return [st, { kind: 'crop', st, w: w.output_target_size, h: w.output_target_size }, { kind: 'cropmask', st, w: w.output_target_size, h: w.output_target_size }]; },
  InpaintStitch: ({ get }) => { const st = get(null, 'stitcher'), img = get(null, 'inpainted_image'); return [{ kind: 'stitch', st, image: img, w: st.image.w, h: st.image.h }]; },
};
// The engine calls handlers with get(id, name); the id is the node itself, so the first argument is not needed here.
for (const [t, fn] of Object.entries(handlers)) HANDLERS[t] = ctx => fn({ ...ctx, get: (_, name) => ctx.get(ctx.n.id, name) });

/* ── Masks as pixels ── */
const { canvas, data, put, mapPixels, lerpData, boxBlur, drawSubject, drawScene, rng, hex, mix } = KIT;
function blur1(a, W, H, r) { if (r < .5) return a; r = Math.round(r); const t = new Float32Array(a.length), o = new Float32Array(a.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let i = -r; i <= r; i++) { const xx = x + i; if (xx < 0 || xx >= W) continue; s += a[y * W + xx]; n++; } t[y * W + x] = s / n; } for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let i = -r; i <= r; i++) { const yy = y + i; if (yy < 0 || yy >= H) continue; s += t[yy * W + x]; n++; } o[y * W + x] = s / n; } return o; }
// Brush strokes to a 0–1 coverage grid (pure maths, so it also runs in tests): distance to each segment ≤ brush radius.
function strokesRaster(strokes = [], invert, W, H) {
  const a = new Float32Array(W * H).fill(invert ? 1 : 0);
  for (const s of strokes) {
    const r = s.r * W, paint = (s.e ? !invert : invert) ? 0 : 1, pts = s.p.length === 1 ? [s.p[0], s.p[0]] : s.p;
    for (let k = 1; k < pts.length; k++) {
      const ax = pts[k - 1][0] * W, ay = pts[k - 1][1] * H, bx = pts[k][0] * W, by = pts[k][1] * H, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1)), y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = x + .5, py = y + .5, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)), ex = ax + t * dx - px, ey = ay + t * dy - py, d = Math.sqrt(ex * ex + ey * ey), cov = Math.max(0, Math.min(1, r - d + .5)); if (cov > 0) a[y * W + x] = paint ? Math.max(a[y * W + x], cov) : Math.min(a[y * W + x], 1 - cov); }
    }
  }
  return a;
}
// A mask description as values 0–1 at a given size. Pixel amounts are given at 512 px and scaled.
export function maskRaster(m, W, H) {
  if (!m) return new Float32Array(W * H);
  const k = W / (m.w || 512);
  switch (m.kind) {
    case 'mask': return strokesRaster(m.strokes, m.invert, W, H);
    case 'invert': return maskRaster(m.of, W, H).map(v => 1 - v);
    case 'grow': {
      let a = maskRaster(m.of, W, H); const px = (m.px || 0) * W / 512;
      if (px > .4) { const b = blur1(a, W, H, px); a = b.map(v => v > .02 ? 1 : 0); } else if (px < -.4) { const b = blur1(a, W, H, -px); a = b.map(v => v > .98 ? 1 : 0); }
      if (m.blur) a = blur1(a, W, H, m.blur * W / 512 * .8);
      return a;
    }
    case 'padmask': {
      const a = new Float32Array(W * H), sx = W / m.w, sy = H / m.h, f = (m.feather || 0) * sx, x0 = m.pad.l * sx, y0 = m.pad.t * sy, x1 = W - m.pad.r * sx, y1 = H - m.pad.b * sy;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (x < x0 || x >= x1 || y < y0 || y >= y1) { a[y * W + x] = 1; continue; }
        let v = 0; if (f > 0) { const d = Math.min(m.pad.l ? x - x0 : 1e9, m.pad.r ? x1 - x : 1e9, m.pad.t ? y - y0 : 1e9, m.pad.b ? y1 - y : 1e9); v = d < f ? ((f - d) / f) ** 2 : 0; }
        a[y * W + x] = v;
      }
      return a;
    }
    case 'cropmask': { const b = cropBox(m.st); const full = maskRaster(m.st.mask, 128, 128); const a = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = b[0] + (x / W) * (b[2] - b[0]), v = b[1] + (y / H) * (b[3] - b[1]); a[y * W + x] = full[Math.min(127, Math.floor(v * 128)) * 128 + Math.min(127, Math.floor(u * 128))] || 0; } return blur1(a, W, H, 1); }
  }
  return new Float32Array(W * H);
}
// Bounding box of a mask (normalised), and the crop window of Inpaint Crop.
export function maskBox(m, n = 64) { const a = maskRaster(m, n, n); let x0 = n, y0 = n, x1 = -1, y1 = -1; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (a[y * n + x] > .5) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return x1 < 0 ? null : [x0 / n, y0 / n, (x1 + 1) / n, (y1 + 1) / n]; }
export function cropBox(st) { const b = maskBox(st.mask) || [.25, .25, .75, .75]; const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, half = Math.min(.5, Math.max(b[2] - b[0], b[3] - b[1]) * st.factor / 2 + .02); const x0 = Math.max(0, Math.min(1 - 2 * half, cx - half)), y0 = Math.max(0, Math.min(1 - 2 * half, cy - half)); return [x0, y0, x0 + 2 * half, y0 + 2 * half]; }
export function coverage(m, box, n = 64) { const a = maskRaster(m, n, n); let inBox = 0, inHit = 0, all = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = a[y * n + x] > .5, u = (x + .5) / n, w = (y + .5) / n, inside = u >= box[0] && u <= box[2] && w >= box[1] && w <= box[3]; if (inside) { inBox++; if (v) inHit++; } if (v) all++; } return { cover: inBox ? inHit / inBox : 0, area: all / (n * n) }; }

/* ── Renderers for the new image kinds ── */
const toSize = (cv, W, H) => { if (cv.width === W && cv.height === H) return cv; const t = canvas(W, H); t.getContext('2d').drawImage(cv, 0, 0, W, H); return t; };
KIND_RENDERERS.maskimg = v => { const [W, H] = KIT.sizeOf(512, 512), a = maskRaster(v.mask, W, H), cv = canvas(W, H); return put(cv, mapPixels(new ImageData(W, H), (r, g, b, i) => [a[i] * 255, a[i] * 255, a[i] * 255])); };
KIND_RENDERERS.pad = v => { const [W, H] = KIT.sizeOf(v.w, v.h), cv = canvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#808080'; c.fillRect(0, 0, W, H); const sx = W / v.w; c.drawImage(renderValue(v.of), v.pad.l * sx, v.pad.t * sx, v.of.w * sx, v.of.h * sx); return cv; };
KIND_RENDERERS.composite = v => { const d = renderValue(v.dest), [W, H] = [d.width, d.height], s = toSize(renderValue(v.src), W, H), out = canvas(W, H); if (!v.mask) { out.getContext('2d').drawImage(d, 0, 0); out.getContext('2d').drawImage(s, v.x * W / v.w, v.y * H / v.h); return out; } const a = maskRaster(v.mask, W, H), dd = data(d), sd = data(s); return put(out, mapPixels(dd, (r, g, b, i) => [r + (sd.data[i * 4] - r) * a[i], g + (sd.data[i * 4 + 1] - g) * a[i], b + (sd.data[i * 4 + 2] - b) * a[i]])); };
KIND_RENDERERS.crop = v => { const src = renderValue(v.st.image), b = cropBox(v.st), [W, H] = KIT.sizeOf(512, 512), cv = canvas(W, H); cv.getContext('2d').drawImage(src, b[0] * src.width, b[1] * src.height, (b[2] - b[0]) * src.width, (b[3] - b[1]) * src.height, 0, 0, W, H); return cv; };
KIND_RENDERERS.stitch = v => {
  const base = renderValue(v.st.image), W = base.width, H = base.height, b = cropBox(v.st), inp = renderValue(v.image), out = canvas(W, H), c = out.getContext('2d');
  c.drawImage(base, 0, 0); const patch = canvas(W, H), pc = patch.getContext('2d'); pc.drawImage(inp, b[0] * W, b[1] * H, (b[2] - b[0]) * W, (b[3] - b[1]) * H);
  const a = maskRaster(v.st.mask, W, H), od = data(out), pd = data(patch); return put(out, mapPixels(od, (r, g, bl, i) => { const k = blur1Cache(a, W, H)[i]; return [r + (pd.data[i * 4] - r) * k, g + (pd.data[i * 4 + 1] - g) * k, bl + (pd.data[i * 4 + 2] - bl) * k]; }));
};
let bc = null; const blur1Cache = (a, W, H) => { if (bc?.a !== a) bc = { a, v: blur1(a, W, H, 1.2) }; return bc.v; };

/* ── The inpainting simulator (a KSampler whose latent has a mask) ── */
// Fill the masked area from its surroundings, like content-aware fill: the "empty" version of the scene.
export function contextFill(img, E, W, H) {
  const n = 48, sx = W / n, sy = H / n, cr = new Float32Array(n * n * 3), known = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = [0, 0, 0], c = 0; for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) { const i = yy * W + xx; if (E[i] < .3) { s[0] += img.data[i * 4]; s[1] += img.data[i * 4 + 1]; s[2] += img.data[i * 4 + 2]; c++; } } if (c > sx * sy * .5) { known[y * n + x] = 1; for (let k = 0; k < 3; k++) cr[(y * n + x) * 3 + k] = s[k] / c; } }
  // Start from the nearest known cell in the same row (skies, seas and grounds continue sideways), then smooth.
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; if (known[i]) continue; let best = -1, bd = 1e9; for (let xx = 0; xx < n; xx++) if (known[y * n + xx] && Math.abs(xx - x) < bd) { bd = Math.abs(xx - x); best = y * n + xx; } if (best < 0) for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) { const d = Math.abs(xx - x) + Math.abs(yy - y) * 2; if (known[yy * n + xx] && d < bd) { bd = d; best = yy * n + xx; } } if (best >= 0) for (let k = 0; k < 3; k++) cr[i * 3 + k] = cr[best * 3 + k]; }
  for (let it = 0; it < 40; it++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; if (known[i]) continue; let s = [0, 0, 0], wsum = 0; for (const [dx, dy, wt] of [[1, 0, 3], [-1, 0, 3], [0, 1, 1], [0, -1, 1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; const j = yy * n + xx; for (let k = 0; k < 3; k++) s[k] += cr[j * 3 + k] * wt; wsum += wt; } for (let k = 0; k < 3; k++) cr[i * 3 + k] = s[k] / wsum; }
  const out = new ImageData(W, H), r = rng(`${W}x${H}:grain`);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const fx = Math.min(n - 1.001, x / sx - .5), fy = Math.min(n - 1.001, y / sy - .5), x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), tx = Math.max(0, fx - x0), ty = Math.max(0, fy - y0), i = (y * W + x) * 4, g = (r() - .5) * 6;
    for (let k = 0; k < 3; k++) { const a = cr[(y0 * n + x0) * 3 + k], b = cr[(y0 * n + Math.min(n - 1, x0 + 1)) * 3 + k], c = cr[(Math.min(n - 1, y0 + 1) * n + x0) * 3 + k], d = cr[(Math.min(n - 1, y0 + 1) * n + Math.min(n - 1, x0 + 1)) * 3 + k]; out.data[i + k] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty + g; } out.data[i + 3] = 255; }
  return out;
}
const ringMean = (img, E, W, H, inside) => { const s = [0, 0, 0]; let c = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, e = E[i] > .5; const edge = [i - 1, i + 1, i - W, i + W].some(j => (E[j] > .5) !== e); if (edge && e === inside) { for (let k = 0; k < 3; k++) s[k] += img.data[i * 4 + k]; c++; } } return c ? s.map(v => v / c) : null; };
// What lies behind the mask, for the same kind of source the sampler got (photo, crop or padded canvas).
function backdrop(src, W, H, removeAll) {
  if (!src) return null;
  if (src.kind === 'photo' && PHOTO_META[src.name]) return drawPhoto(src.name, W, H, false, src.name);
  if (src.kind === 'crop') { const full = backdrop(src.st.image, 256, 256, removeAll); if (!full) return null; const b = cropBox(src.st), cv = canvas(W, H); cv.getContext('2d').drawImage(full, b[0] * 256, b[1] * 256, (b[2] - b[0]) * 256, (b[3] - b[1]) * 256, 0, 0, W, H); return cv; }
  if (src.kind === 'pad' && src.of?.kind === 'photo' && PHOTO_META[src.of.name]) {
    const name = src.of.name, cv = canvas(W, H), c = cv.getContext('2d'), sx = W / src.w;
    c.drawImage(drawPhoto(name, W, Math.round(src.of.h * sx), false, name + ':out'), 0, src.pad.t * sx, W, src.of.h * sx);
    if (src.pad.t || src.pad.b) { const m = PHOTO_META[name]; const t = canvas(W, H); KIT.drawScene(t.getContext('2d'), W, H, m.setting, rng(name + ':outv'), 'painterly', null, 1); c.globalCompositeOperation = 'destination-over'; c.drawImage(t, 0, 0); c.globalCompositeOperation = 'source-over'; }
    return cv;
  }
  return null;
}
function sourceMeta(src) { let v = src; while (v && !v.name) v = v.of || v.st?.image; return v?.name ? PHOTO_META[v.name] : null; }
RECIPE_HOOKS.push({
  match: d => !!d.latent?.inpaint,
  render(d, { progress = 1, index = 0 } = {}) {
    const inp = d.latent.inpaint, src = d.latent.source, srcCv = renderValue(src), W = srcCv.width, H = srcCv.height, O = data(srcCv);
    const seed = `${d.seed}:${index}`, r = rng(seed), meta = sourceMeta(src), isCrop = src?.kind === 'crop';
    const inpaintModel = !!CHECKPOINTS[d.model.ckpt]?.inpaint || !!d.model.inpaint, diff = d.model.diffdiff;
    let M = maskRaster(inp.mask, W, H);
    if (inp.method === 'vaeinpaint' && inp.grow) { const g = blur1(M, W, H, inp.grow * W / 512); M = g.map((v, i) => Math.max(M[i], v > .02 ? Math.min(1, v * 3) : 0)); }
    // The latent is 8 times smaller than the picture: a soft mask becomes blocks unless Differential Diffusion reads it per pixel.
    const block = Math.max(2, Math.round(W / 64)), soft = inp.mask?.kind === 'padmask';
    let E = M;
    if (!(diff > 0) && !soft) { E = new Float32Array(W * H); for (let by = 0; by < H; by += block) for (let bx = 0; bx < W; bx += block) { let s = 0, c = 0; for (let y = by; y < Math.min(H, by + block); y++) for (let x = bx; x < Math.min(W, bx + block); x++) { s += M[y * W + x]; c++; } const v = s / c > .5 ? 1 : 0; for (let y = by; y < Math.min(H, by + block); y++) for (let x = bx; x < Math.min(W, bx + block); x++) E[y * W + x] = v; } }
    else if (diff > 0 && diff < 1) E = M.map(v => v * diff + (v > .5 ? 1 : 0) * (1 - diff));
    // What the model paints inside: the surroundings continued, plus whatever the prompt asks for.
    const negWords = new Set([...d.neg.subjects.map(s => s.value)]);
    const subj = d.pos.subjects.map(s => s.value).find(s => !negWords.has(s));
    const col = d.pos.colors.find(c => !negWords.has(c.word))?.value || KIT.DEFAULT_COL[subj] || '#999';
    let G = contextFill(O, E, W, H);
    const bd = backdrop(src, W, H); if (bd) G = lerpData(G, data(toSize(bd, W, H)), inpaintModel ? .93 : .8);
    const gc = put(canvas(W, H), G), c = gc.getContext('2d');
    let bx = 1, by = 0, bx1 = 0, by1 = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (E[y * W + x] > .5) { bx = Math.min(bx, x / W); by = Math.min(by, y / H); bx1 = Math.max(bx1, x / W); by1 = Math.max(by1, y / H); }
    const hasMask = bx1 > bx;
    if (subj && hasMask) {
      const keepPose = (inp.method === 'noisemask' || (inp.method === 'imc' && inp.noiseMask)) && meta && meta.subject === subj && d.denoise < .9 && !isCrop;
      if (keepPose) drawSubject(c, subj, W * meta.cx, H * meta.by, H * meta.s, col, d.look, { r });
      else { const thin = ['lighthouse', 'person', 'bottle', 'tree'].includes(subj), s = Math.min((by1 - by) * H * .95, (bx1 - bx) * W * (thin ? 3 : 1.25), H * .55); drawSubject(c, subj, W * (bx + bx1) / 2, H * Math.min(.97, by1 - .02), s, col, d.look, { r }); }
    }
    G = data(gc);
    for (const [st, a] of Object.entries(d.pos.styles.reduce((o, s) => ({ ...o, [s.value]: .8 }), {}))) G = KIT.stylize(G, st, a, rng(seed + st));
    // Method by method.
    let seam = 0;
    if (inp.method === 'vaeinpaint') { if (d.denoise < .95) { const t = Math.max(0, (d.denoise - .2) / .75) ** 3; G = mapPixels(G, (rr, gg, bb) => [128 + (rr - 128) * t, 126 + (gg - 126) * t, 120 + (bb - 120) * t]); } seam = inpaintModel ? 0 : Math.max(.25, 1 - (inp.grow || 0) / 16); }
    if (inp.method === 'noisemask') { const t = Math.max(0, Math.min(1, (d.denoise - .1) / .6)) ** .6; G = lerpData(O, G, t); seam = diff > 0 ? 0 : .35; }
    if (inp.method === 'imc') {
      if (inp.noiseMask && d.denoise < 1) G = lerpData(O, G, Math.max(0, Math.min(1, (d.denoise - .1) / .85)));
      const a = ringMean(O, E, W, H, false), b = ringMean(G, E, W, H, true), k = inpaintModel ? .9 : .45;
      if (a && b) G = mapPixels(G, (rr, gg, bb) => [rr + (a[0] - b[0]) * k, gg + (a[1] - b[1]) * k, bb + (a[2] - b[2]) * k]);
      seam = inpaintModel ? 0 : (diff > 0 ? .1 : .4);
    }
    if (soft && !inpaintModel && inp.method === 'vaeinpaint') seam = Math.max(seam, (inp.mask.feather || 0) < 16 ? 1 : .2);
    if (soft && (inp.mask.feather || 0) >= 16) seam *= .2;
    // A small area inpainted at full-picture resolution has few latent pixels: it comes out soft and mushy.
    if (hasMask && !isCrop && Math.max(by1 - by, bx1 - bx) < .35) { G = boxBlur(G, 3); }
    // Steps and CFG inside the mask.
    const left = 1 - Math.min(1, 1 - Math.exp(-d.steps / 6)); if (left > .06) { const nr = rng(seed + 'n'); G = mapPixels(G, (rr, gg, bb) => { const n = (nr() - .5) * 200 * left; return [rr + n, gg + n, bb + n]; }); }
    if (progress < 1) { const pr = rng(seed + 'p' + Math.round(progress * 20)), k = progress ** 1.3; G = mapPixels(G, (rr, gg, bb) => { const n = pr() * 255; return [n + (rr - n) * k, n + (gg - n) * k, n + (bb - n) * k]; }); }
    // Put it together: outside the mask the original (unless noise_mask is off), inside the new pixels.
    let R = mapPixels(O, (rr, gg, bb, i) => { const e = E[i]; return [rr + (G.data[i * 4] - rr) * e, gg + (G.data[i * 4 + 1] - gg) * e, bb + (G.data[i * 4 + 2] - bb) * e]; });
    if (inp.method === 'imc' && !inp.noiseMask) { const whole = data(renderBase({ ...d, latent: { ...d.latent, inpaint: null }, source: src }, { index })); R = mapPixels(R, (rr, gg, bb, i) => { const t = (1 - E[i]) * .55 * d.denoise; return [rr + (whole.data[i * 4] - rr) * t, gg + (whole.data[i * 4 + 1] - gg) * t, bb + (whole.data[i * 4 + 2] - bb) * t]; }); }
    if (seam > 0) R = mapPixels(R, (rr, gg, bb, i) => { const x = i % W, y = (i / W) | 0; if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return [rr, gg, bb]; const e = E[i] > .5; const edge = [i - 1, i + 1, i - W, i + W].some(j => (E[j] > .5) !== e); const shift = e ? 1 + .09 * seam : 1; return edge ? [rr * (1 - .45 * seam), gg * (1 - .45 * seam), bb * (1 - .4 * seam)] : [rr * shift, gg * shift, bb * (e ? 1 + .03 * seam : 1)]; });
    // Every pixel goes through the VAE: the untouched area also gets slightly softer and duller.
    const soft1 = boxBlur(R, 1); R = mapPixels(R, (rr, gg, bb, i) => { const m = (rr + gg + bb) / 3, k = .5; return [rr + (soft1.data[i * 4] - rr) * k + (m - rr) * .07, gg + (soft1.data[i * 4 + 1] - gg) * k + (m - gg) * .07, bb + (soft1.data[i * 4 + 2] - bb) * k + (m - bb) * .07]; });
    return put(canvas(W, H), R);
  },
});
export function findRecipe(v) { if (!v) return null; if (v.recipe) return v.recipe; if (v.kind === 'composite') return findRecipe(v.src); if (v.kind === 'stitch') return findRecipe(v.image); return null; }
