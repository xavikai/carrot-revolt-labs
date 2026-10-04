// Carrot Revolt Labs · Control & Injection Lab · preprocessors, stacked ControlNets, regional prompts, IPAdapter and identity.
// The simulator plans every picture from the parts that steer it (control maps, regions, reference images, faces)
// and draws it; the same plan is summarised for the checklists, so what you see is what is checked.
import { CONTROLNETS, CATEGORIES, HANDLERS, IMAGES, VOCAB, TYPE_COLOR, describeRecipe, registerNodes, addOptions } from '../comfyui/engine.js';
import { KIT, PHOTOS, KIND_RENDERERS, RECIPE_HOOKS, maskOf, renderValue } from '../comfyui/render.js';
import { maskRaster, maskBox } from '../comfyui-inpaint/nodes.js'; // InvertMask, Grow Mask, the Mask Editor photos

const W_ = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
const { canvas, data, put, mapPixels, boxBlur, sobel, rng, hex, drawScene, drawSubject, stylize, sizeOf, DEFAULT_COL } = KIT;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
TYPE_COLOR.IPADAPTER = '#4fc3c7';
for (const c of ['ControlNet Preprocessors', 'ipadapter']) if (!CATEGORIES.includes(c)) CATEGORIES.push(c);
CONTROLNETS['control_v11p_sd15_lineart.pth'] = { arch: 'SD1.5', kind: 'lineart' };
addOptions('ControlNetLoader', 'control_net_name', ['control_v11p_sd15_lineart.pth']);

/* ── Reference pictures ── */
// Style references: a style, a palette, and the content they would leak.
export const REFS = {
  'ref_watercolor.png': { style: 'watercolor', palette: ['#2a9d8f', '#f4a261'], setting: 'beach', subject: 'lighthouse', col: '#e8e2d6', cx: .7, by: .86, s: .5 },
  'ref_neon.png': { style: 'neon', palette: ['#ff2bd6', '#20e3ff'], setting: 'night', subject: 'robot', col: '#3d7bd9', cx: .28, by: .9, s: .6 },
};
// Faces to copy.
export const FACES = {
  'portrait_anna.png': { hair: '#b8462f', eyes: '#3f8f4d', skin: '#f0c7a6', bangs: true, beard: false },
  'portrait_leo.png': { hair: '#1d1d1f', eyes: '#5a3a22', skin: '#c58b67', bangs: false, beard: true },
};
const GENERIC_FACES = [{ hair: '#7a4a26', eyes: '#3b2a20', skin: '#e8b796' }, { hair: '#c99a52', eyes: '#3a7bc8', skin: '#f0c7a6' }, { hair: '#3b2a20', eyes: '#3b2a20', skin: '#d9a07a' }];
function drawFace(c, x, y, rad, f) {
  c.save(); c.fillStyle = f.skin; c.beginPath(); c.ellipse(x, y, rad, rad * 1.1, 0, 0, 7); c.fill();
  c.fillStyle = f.hair; c.beginPath(); c.ellipse(x, y - rad * .5, rad * 1.08, rad * .68, 0, Math.PI, 0); c.fill();
  if (f.bangs) { c.beginPath(); c.ellipse(x - rad * .3, y - rad * .45, rad * .6, rad * .3, -.3, 0, 7); c.fill(); }
  if (f.beard) { c.globalAlpha = .85; c.beginPath(); c.ellipse(x, y + rad * .55, rad * .75, rad * .5, 0, 0, Math.PI); c.fill(); c.globalAlpha = 1; }
  for (const s of [-1, 1]) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x + s * rad * .36, y, rad * .2, rad * .13, 0, 0, 7); c.fill(); c.fillStyle = f.eyes; c.beginPath(); c.arc(x + s * rad * .36, y, rad * .1, 0, 7); c.fill(); }
  c.strokeStyle = '#a5524a'; c.lineWidth = Math.max(1, rad * .08); c.beginPath(); c.moveTo(x - rad * .25, y + rad * .45); c.quadraticCurveTo(x, y + rad * .6, x + rad * .25, y + rad * .45); c.stroke();
  c.restore();
}
function drawRef(name, W, H) {
  const cv = canvas(W, H), c = cv.getContext('2d');
  if (FACES[name]) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#d9d4cc'); g.addColorStop(1, '#8f8a84'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#4b5a6b'; c.beginPath(); c.ellipse(W * .5, H * 1.05, W * .42, H * .32, 0, 0, 7); c.fill(); drawFace(c, W * .5, H * .45, W * .25, FACES[name]); return cv; }
  if (REFS[name]) { const m = REFS[name], r = rng(name); drawScene(c, W, H, m.setting, r, 'painterly', m.palette[0], 1); drawSubject(c, m.subject, W * m.cx, H * m.by, H * m.s, m.col, 'painterly', { r, night: m.setting === 'night' }); return put(cv, tint(stylize(data(cv), m.style, 1, rng(name + 's')), m.palette, .35)); }
  c.fillStyle = '#7b7b7b'; c.fillRect(0, 0, W, H); c.fillStyle = '#8a8a8a'; for (let x = 0; x < W; x += 16) c.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 16) c.fillRect(0, y, W, 1); return cv; // mask_canvas.png
}
function tint(img, pal, a) { const p0 = hex(pal[0]), p1 = hex(pal[1]); return mapPixels(img, (r, g, b) => { const l = (r + g + b) / 765, t = l < .5 ? p0 : p1; return [r + (t[0] - r) * a, g + (t[1] - g) * a, b + (t[2] - b) * a]; }); }
for (const n of [...Object.keys(REFS), ...Object.keys(FACES), 'mask_canvas.png']) PHOTOS[n] = (W, H) => drawRef(n, W, H);
addOptions('LoadImage', 'image', [...Object.keys(REFS), ...Object.keys(FACES), 'mask_canvas.png']);
for (const n of [...Object.keys(REFS), ...Object.keys(FACES), 'mask_canvas.png']) if (!IMAGES.includes(n)) IMAGES.push(n);

/* ── Nodes ── */
const PRESETS = { 'LIGHT - SD1.5 only (low strength)': .5, 'STANDARD (medium strength)': .8, 'VIT-G (medium strength)': .85, 'PLUS (high strength)': 1, 'PLUS FACE (portraits)': .55, 'FULL FACE - SD1.5 only (portraits stronger)': .45 };
const FACE_PRESETS = { 'FACEID': .75, 'FACEID PLUS - SD1.5 only': .85, 'FACEID PLUS V2': .95, 'FACEID PORTRAIT (style transfer)': .7 };
const WEIGHT_TYPES = ['linear', 'ease in', 'ease out', 'ease in-out', 'reverse in-out', 'weak input', 'weak output', 'weak middle', 'strong middle', 'style transfer', 'composition', 'strong style transfer', 'style and composition'];
const ipaWidgets = () => [W_('weight', 'float', 1, { min: -1, max: 5, step: .05 }), W_('weight_type', 'combo', 'linear', { options: WEIGHT_TYPES }), W_('combine_embeds', 'combo', 'concat', { options: ['concat', 'add', 'subtract', 'average', 'norm average'] }), W_('start_at', 'float', 0, { min: 0, max: 1, step: .01 }), W_('end_at', 'float', 1, { min: 0, max: 1, step: .01 }), W_('embeds_scaling', 'combo', 'V only', { options: ['V only', 'K+V', 'K+V w/ C penalty', 'K+mean(V) w/ C penalty'] })];
registerNodes({
  DepthAnythingV2Preprocessor: { def: { title: 'Depth Anything V2 - Relative', cat: ['ControlNet Preprocessors', 'Normal and Depth Estimators'], custom: 'controlnet_aux', w: 300, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')], widgets: [W_('ckpt_name', 'combo', 'depth_anything_v2_vitl.pth', { options: ['depth_anything_v2_vits.pth', 'depth_anything_v2_vitb.pth', 'depth_anything_v2_vitl.pth'] }), W_('resolution', 'int', 512, { min: 64, max: 16384, step: 64 })] } },
  DWPreprocessor: { def: { title: 'DWPose Estimator', cat: ['ControlNet Preprocessors', 'Faces and Poses Estimators'], custom: 'controlnet_aux', w: 300, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')], widgets: [W_('detect_hand', 'combo', 'enable', { options: ['enable', 'disable'] }), W_('detect_body', 'combo', 'enable', { options: ['enable', 'disable'] }), W_('detect_face', 'combo', 'enable', { options: ['enable', 'disable'] }), W_('resolution', 'int', 512, { min: 64, max: 16384, step: 64 })] } },
  LineArtPreprocessor: { def: { title: 'Realistic Lineart', cat: ['ControlNet Preprocessors', 'Line Extractors'], custom: 'controlnet_aux', w: 280, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')], widgets: [W_('coarse', 'combo', 'disable', { options: ['disable', 'enable'] }), W_('resolution', 'int', 512, { min: 64, max: 16384, step: 64 })] } },
  ConditioningSetAreaPercentage: { def: { title: 'Conditioning (Set Area with Percentage)', cat: ['conditioning'], w: 320, inputs: [I('conditioning', 'CONDITIONING')], outputs: [O('CONDITIONING', 'CONDITIONING')], widgets: [W_('width', 'float', 1, { min: 0, max: 1, step: .01 }), W_('height', 'float', 1, { min: 0, max: 1, step: .01 }), W_('x', 'float', 0, { min: 0, max: 1, step: .01 }), W_('y', 'float', 0, { min: 0, max: 1, step: .01 }), W_('strength', 'float', 1, { min: 0, max: 10, step: .01 })] } },
  ConditioningSetMask: { def: { title: 'Conditioning (Set Mask)', cat: ['conditioning'], w: 300, inputs: [I('conditioning', 'CONDITIONING'), I('mask', 'MASK')], outputs: [O('CONDITIONING', 'CONDITIONING')], widgets: [W_('strength', 'float', 1, { min: 0, max: 10, step: .01 }), W_('set_cond_area', 'combo', 'default', { options: ['default', 'mask bounds'] })] } },
  ConditioningCombine: { def: { title: 'Conditioning (Combine)', cat: ['conditioning'], w: 260, inputs: [I('conditioning_1', 'CONDITIONING'), I('conditioning_2', 'CONDITIONING')], outputs: [O('CONDITIONING', 'CONDITIONING')] } },
  IPAdapterUnifiedLoader: { def: { title: 'IPAdapter Unified Loader', cat: ['ipadapter'], custom: 'IPAdapter plus', w: 320, inputs: [I('model', 'MODEL'), I('ipadapter', 'IPADAPTER', { optional: true })], outputs: [O('model', 'MODEL'), O('ipadapter', 'IPADAPTER')], widgets: [W_('preset', 'combo', 'PLUS (high strength)', { options: Object.keys(PRESETS) })] } },
  IPAdapterAdvanced: { def: { title: 'IPAdapter Advanced', cat: ['ipadapter'], custom: 'IPAdapter plus', w: 320, inputs: [I('model', 'MODEL'), I('ipadapter', 'IPADAPTER'), I('image', 'IMAGE'), I('image_negative', 'IMAGE', { optional: true }), I('attn_mask', 'MASK', { optional: true })], outputs: [O('MODEL', 'MODEL')], widgets: ipaWidgets() } },
  IPAdapterUnifiedLoaderFaceID: { def: { title: 'IPAdapter Unified Loader FaceID', cat: ['ipadapter', 'faceid'], custom: 'IPAdapter plus', w: 320, inputs: [I('model', 'MODEL'), I('ipadapter', 'IPADAPTER', { optional: true })], outputs: [O('MODEL', 'MODEL'), O('ipadapter', 'IPADAPTER')], widgets: [W_('preset', 'combo', 'FACEID PLUS V2', { options: Object.keys(FACE_PRESETS) }), W_('lora_strength', 'float', .6, { min: 0, max: 1, step: .01 }), W_('provider', 'combo', 'CPU', { options: ['CPU', 'CUDA', 'ROCM', 'DirectML', 'OpenVINO', 'CoreML'] })] } },
  IPAdapterFaceID: { def: { title: 'IPAdapter FaceID', cat: ['ipadapter', 'faceid'], custom: 'IPAdapter plus', w: 320, inputs: [I('model', 'MODEL'), I('ipadapter', 'IPADAPTER'), I('image', 'IMAGE'), I('image_negative', 'IMAGE', { optional: true }), I('attn_mask', 'MASK', { optional: true })], outputs: [O('MODEL', 'MODEL')], widgets: [W_('weight', 'float', 1, { min: -1, max: 3, step: .05 }), W_('weight_faceidv2', 'float', 1, { min: -1, max: 5, step: .05 }), W_('weight_type', 'combo', 'linear', { options: WEIGHT_TYPES }), W_('combine_embeds', 'combo', 'concat', { options: ['concat', 'add', 'subtract', 'average', 'norm average'] }), W_('start_at', 'float', 0, { min: 0, max: 1, step: .01 }), W_('end_at', 'float', 1, { min: 0, max: 1, step: .01 }), W_('embeds_scaling', 'combo', 'V only', { options: ['V only', 'K+V', 'K+V w/ C penalty', 'K+mean(V) w/ C penalty'] })] } },
});
const partsOf = c => c.prompt?.parts || [{ prompt: c.prompt, area: null, mask: null, strength: 1 }];
const withParts = (c, parts) => ({ ...c, prompt: { ...parts[0].prompt, parts } });
const handlers = {
  DepthAnythingV2Preprocessor: ({ get }) => { const i = get('image'); return [{ kind: 'depth', of: i, name: i.name, w: i.w, h: i.h }]; },
  DWPreprocessor: ({ w, get }) => { const i = get('image'); return [{ kind: 'pose', of: i, name: i.name, body: w.detect_body === 'enable', w: i.w, h: i.h }]; },
  LineArtPreprocessor: ({ get }) => { const i = get('image'); return [{ kind: 'lineart', of: i, name: i.name, w: i.w, h: i.h }]; },
  ConditioningSetAreaPercentage: ({ w, get }) => { const c = get('conditioning'); return [withParts(c, partsOf(c).map(p => ({ ...p, area: [w.x, w.y, w.width, w.height], strength: w.strength })))]; },
  ConditioningSetMask: ({ w, get }) => { const c = get('conditioning'); return [withParts(c, partsOf(c).map(p => ({ ...p, mask: get('mask'), strength: w.strength, bounds: w.set_cond_area === 'mask bounds' })))]; },
  ConditioningCombine: ({ get }) => { const a = get('conditioning_1'), b = get('conditioning_2'); return [{ ...withParts(a, [...partsOf(a), ...partsOf(b)]), controls: [...(a.controls || []), ...(b.controls || [])] }]; },
  IPAdapterUnifiedLoader: ({ w, get }) => { const m = get('model'); return [m, { preset: w.preset, k: PRESETS[w.preset], face: false }]; },
  IPAdapterUnifiedLoaderFaceID: ({ w, get }) => { const m = get('model'); return [{ ...m, faceLora: w.lora_strength }, { preset: w.preset, k: FACE_PRESETS[w.preset], face: true }]; },
  IPAdapterAdvanced: ({ w, get }) => { const m = get('model'), ip = get('ipadapter'), img = get('image'); return [{ ...m, ipadapters: [...(m.ipadapters || []), { faceid: false, preset: ip.preset, k: ip.k, image: img?.name, weight: w.weight, type: w.weight_type, start: w.start_at, end: w.end_at, mask: get('attn_mask') || null }] }]; },
  IPAdapterFaceID: ({ w, get }) => { const m = get('model'), ip = get('ipadapter'), img = get('image'); return [{ ...m, ipadapters: [...(m.ipadapters || []), { faceid: ip.face, preset: ip.preset, k: ip.k, image: img?.name, weight: w.weight * (.7 + .3 * clamp(w.weight_faceidv2 / 1.5)), type: w.weight_type, start: w.start_at, end: w.end_at, mask: get('attn_mask') || null }] }]; },
};
for (const [t, fn] of Object.entries(handlers)) HANDLERS[t] = ctx => fn({ ...ctx, get: name => ctx.get(ctx.n.id, name) });

/* ── Control maps ── */
const POSE_JOINTS = { head: [.5, .2], neck: [.5, .3], ls: [.42, .3], rs: [.58, .3], lh: [.2, .12], rh: [.8, .12], hip: [.5, .56], lhip: [.44, .56], rhip: [.56, .56], lf: [.24, .82], rf: [.76, .82] };
const POSE_BONES = [['head', 'neck', '#ff0055'], ['neck', 'ls', '#ff6600'], ['neck', 'rs', '#ffcc00'], ['ls', 'lh', '#99ff00'], ['rs', 'rh', '#00ff66'], ['neck', 'hip', '#00ccff'], ['hip', 'lhip', '#0066ff'], ['hip', 'rhip', '#6600ff'], ['lhip', 'lf', '#cc00ff'], ['rhip', 'rf', '#ff00cc']];
// Which photos have a person in them (a pose map of anything else is empty).
const hasPerson = name => name === 'pose_jump.png' || !!FACES[name];
// A white-on-black silhouette of the main object of a photo.
export function silhouette(name, W, H) {
  if (['example.png', 'pose_jump.png', 'lighthouse.png', 'cat.png'].includes(name)) return maskOf(name, W, H);
  const cv = canvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const m = REFS[name]; if (m) drawSubject(c, m.subject, W * m.cx, H * m.by, H * m.s, '#ffffff', 'anime', { r: rng('s') });
  if (FACES[name]) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(W * .5, H * .45, W * .27, W * .3, 0, 0, 7); c.ellipse(W * .5, H * 1.05, W * .42, H * .32, 0, 0, 7); c.fill(); }
  const d = data(cv); return put(cv, mapPixels(d, (r, g, b) => { const v = Math.max(r, g, b) > 40 ? 255 : 0; return [v, v, v]; }));
}
KIND_RENDERERS.depth = v => { const [W, H] = sizeOf(v.w, v.h), s = data(silhouette(v.name, W, H)), b = boxBlur(s, 3); return put(canvas(W, H), mapPixels(b, (r, g, bb, i) => { const y = Math.floor(i / W) / H, bg = 30 + y * 90; const fg = 160 + (s.data[i * 4] > 128 ? 70 : 0) * (1 - y * .3); const k = r / 255; return [bg + (fg - bg) * k, bg + (fg - bg) * k, bg + (fg - bg) * k]; })); };
KIND_RENDERERS.pose = v => { const [W, H] = sizeOf(v.w, v.h), cv = canvas(W, H), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); if (!hasPerson(v.name) || !v.body) return cv; const J = POSE_JOINTS; c.lineWidth = Math.max(3, W * .025); c.lineCap = 'round'; for (const [a, b, col] of POSE_BONES) { c.strokeStyle = col; c.beginPath(); c.moveTo(J[a][0] * W, J[a][1] * H); c.lineTo(J[b][0] * W, J[b][1] * H); c.stroke(); } for (const p of Object.values(J)) { c.fillStyle = '#fff'; c.beginPath(); c.arc(p[0] * W, p[1] * H, W * .012, 0, 7); c.fill(); } return cv; };
KIND_RENDERERS.lineart = v => { const src = renderValue(v.of), g = sobel(data(src)); return put(canvas(src.width, src.height), mapPixels(data(src), (r, gg, b, i) => { const e = Math.min(255, g[i] * 900); return [e, e, e]; })); };
// How well a map fits a ControlNet model: each model was trained on one kind of map.
const MAP_OF = img => !img ? 'none' : img.kind === 'canny' ? 'canny' : img.kind === 'depth' ? 'depth' : img.kind === 'pose' ? (hasPerson(img.name) && img.body ? 'pose' : 'empty') : img.kind === 'lineart' ? 'lineart' : 'photo';
const NET_MAP = { canny: 'canny', depth: 'depth', openpose: 'pose', lineart: 'lineart', tile: 'photo' };
export function matchOf(net, img) {
  const map = MAP_OF(img); if (map === 'empty' || map === 'none') return 0;
  if (NET_MAP[net.kind] === map) return 1;
  if ((net.kind === 'canny' && map === 'lineart') || (net.kind === 'lineart' && map === 'canny')) return .7;
  return map === 'photo' ? .3 : .25;
}

/* ── The plan of a picture ── */
const COLOR_RE = Object.keys(VOCAB.colors).join('|'), SUBJ_RE = Object.keys(VOCAB.subjects).join('|');
const pairsOf = text => { const out = [], re = new RegExp(`\\b(${COLOR_RE})\\s+(${SUBJ_RE})\\b`, 'g'); let m; while ((m = re.exec(String(text).toLowerCase()))) out.push({ color: VOCAB.colors[m[1]], subject: VOCAB.subjects[m[2]] }); return out; };
const subjOf = p => { const negs = new Set(); const s = p.subjects.map(x => x.value).find(x => !negs.has(x)); return s || null; };
// A colour belongs to a subject when it is written right before it ("a red dress" is the woman's), or when there is only one subject.
const colOf = (p, subj) => pairsOf(p.text).find(x => x.subject === subj)?.color || (new Set(p.subjects.map(x => x.value)).size <= 1 ? p.colors[0]?.value : null) || DEFAULT_COL[subj] || '#999999';
const PHOTO_SUBJ = { 'pose_jump.png': 'person', 'lighthouse.png': 'lighthouse', 'cat.png': 'cat', 'example.png': 'bottle' };
export function plan(d) {
  const r = rng(`${d.seed}:plan`), parts = d.pos.parts || [{ prompt: d.pos, area: null, mask: null, strength: 1 }];
  const regional = parts.filter(p => p.area || p.mask), global = parts.filter(p => !p.area && !p.mask);
  const setting = [...global, ...regional].map(p => p.prompt.settings[0]?.value).find(Boolean) || 'none';
  const P = { setting, subjects: [], controls: [], styles: [], leaks: [], identity: [], copy: null, regions: regional.length, bleed: false, composition: null };
  // ControlNets.
  for (const c of d.controls || []) {
    const match = matchOf(c.net, c.image), win = Math.max(0, (c.end ?? 1) - (c.start ?? 0)), early = (c.start ?? 0) <= .2 ? 1 : Math.max(0, 1 - ((c.start ?? 0) - .2) * 1.6);
    P.controls.push({ net: c.net.kind, map: MAP_OF(c.image), name: c.image?.name, strength: c.strength, match, amount: clamp(c.strength * match * Math.sqrt(win) * early), photoSubject: c.image?.kind === 'pose' ? 'person' : PHOTO_SUBJ[c.image?.name] || REFS[c.image?.name]?.subject || null });
  }
  P.strengthSum = P.controls.reduce((s, c) => s + c.strength * (c.match > 0 ? 1 : 0), 0);
  P.overcooked = P.strengthSum > 1.7;
  // IPAdapters.
  for (const a of d.model.ipadapters || []) {
    const win = Math.max(0, a.end - a.start), base = a.weight * a.k * Math.sqrt(win), ref = REFS[a.image], face = FACES[a.image];
    if (face) { const score = clamp(base * (a.faceid ? 1.15 : .45)); P.identity.push({ ref: a.image, features: face, score, mask: a.mask, copy: a.weight > (a.faceid ? 1.25 : 1.1) }); continue; }
    if (!ref) continue;
    const t = a.type, style = t === 'composition' ? 0 : t === 'strong style transfer' ? 1.3 : t === 'style transfer' || t === 'style and composition' ? 1 : .8;
    const comp = t === 'composition' || t === 'style and composition';
    if (style) P.styles.push({ ref: a.image, style: ref.style, palette: ref.palette, amount: clamp(base * style, 0, 1.4), mask: a.mask });
    if (comp && base > .3) P.composition = { ...ref, amount: clamp(base) };
    const leak = !comp && !/style transfer/.test(t) && base > .55;
    if (leak || (t === 'strong style transfer' && base > 1.05)) P.leaks.push({ ...ref, amount: clamp((base - .45) * 1.4) });
  }
  P.copy = P.identity.find(i => i.copy) || null;
  // Subjects: regions first, then the global prompt.
  for (const p of regional) {
    const s = subjOf(p.prompt); if (!s) continue;
    const box = p.area ? [p.area[0], p.area[1], p.area[0] + p.area[2], p.area[1] + p.area[3]] : maskBox(p.mask) || [0, 0, 1, 1];
    P.subjects.push({ kind: s, col: colOf(p.prompt, s), cx: (box[0] + box[2]) / 2, by: Math.min(.95, box[3] - .04), s: Math.min((box[3] - box[1]) * .8, (box[2] - box[0]) * 1.5, .62), alpha: clamp(p.strength), region: true });
  }
  for (const p of global) {
    const pairs = pairsOf(p.prompt.text), taken = new Set(P.subjects.map(s => s.kind));
    const free = p.prompt.subjects.map(x => x.value).filter((x, i, a) => a.indexOf(x) === i && !taken.has(x));
    if (!free.length) continue;
    if (pairs.length >= 2 && !P.subjects.length) { // one bag of words: CLIP mixes the colours
      P.bleed = true; const [a, b] = pairs, ca = hex(a.color), cb = hex(b.color);
      P.subjects.push({ kind: r() < .5 ? a.subject : b.subject, col: '#' + [0, 1, 2].map(i => Math.round((ca[i] + cb[i]) / 2).toString(16).padStart(2, '0')).join(''), cx: .4 + r() * .2, by: .9, s: .55, alpha: 1 });
      continue;
    }
    free.forEach((k, i) => P.subjects.push({ kind: k, col: colOf(p.prompt, k), cx: free.length === 1 ? .32 + r() * .36 : (i + .5) / free.length, by: .88 + r() * .04, s: free.length === 1 ? .5 + r() * .1 : .42, alpha: 1 }));
  }
  if (P.composition) { const m = P.subjects.find(s => !s.region); if (m) Object.assign(m, { cx: P.composition.cx, by: P.composition.by, s: P.composition.s * .95 }); }
  // A ControlNet takes over the subject it matches (a pose map makes a person in that pose).
  for (const c of P.controls) {
    if (c.amount < .12) continue;
    const want = c.photoSubject; let s = P.subjects.find(x => x.kind === want && !x.controlled) || (c.map === 'pose' ? P.subjects.find(x => !x.controlled && x.kind === 'person') : null) || P.subjects.find(x => !x.controlled && !x.region);
    if (!s) { s = { kind: want || 'person', col: DEFAULT_COL[want] || '#c9604b', alpha: 1 }; P.subjects.push(s); }
    Object.assign(s, { controlled: c, kind: c.map === 'pose' ? 'person' : s.kind });
  }
  // Faces: who looks like whom.
  P.persons = [];
  const persons = P.subjects.filter(s => s.kind === 'person');
  persons.forEach((s, i) => {
    const pos = s.controlled?.map === 'pose' ? [.5, .2] : [s.cx, s.by - s.s * .86];
    let id = null; for (const a of P.identity) { if (a.mask) { const m = maskRaster(a.mask, 32, 32); if (m[Math.min(31, Math.floor(pos[1] * 32)) * 32 + Math.min(31, Math.floor(pos[0] * 32))] < .5) continue; } if (!id || a.score > id.score) id = a; }
    const generic = GENERIC_FACES[Math.floor(rng(`${d.seed}:face${i}`)() * GENERIC_FACES.length)];
    s.face = id ? { features: id.score > .45 ? id.features : generic, mix: id.score, ref: id.ref } : { features: generic, mix: 0, ref: null };
    P.persons.push({ x: pos[0], ref: s.face.ref, score: s.face.mix });
  });
  P.style = P.styles.reduce((a, s) => (s.amount > (a?.amount || 0) ? s : a), null);
  P.sceneKept = !P.copy;
  return P;
}
function blendFace(f, g, t) { const m = (a, b) => { const A = hex(a), B = hex(b); return '#' + [0, 1, 2].map(i => Math.round(B[i] + (A[i] - B[i]) * t).toString(16).padStart(2, '0')).join(''); }; return { hair: m(f.hair, g.hair), eyes: m(f.eyes, g.eyes), skin: m(f.skin, g.skin), bangs: t > .6 && f.bangs, beard: t > .6 && f.beard }; }
function drawControlled(c, s, W, H) {
  const sil = data(silhouette(s.controlled.name, W, H)), cv = canvas(W, H), t = cv.getContext('2d'), base = hex(s.col);
  const g = t.createLinearGradient(0, 0, W, H); g.addColorStop(0, KIT.rgb(KIT.shade(base, 1.25))); g.addColorStop(1, KIT.rgb(KIT.shade(base, .6))); t.fillStyle = g; t.fillRect(0, 0, W, H);
  const td = t.getImageData(0, 0, W, H); for (let i = 0; i < td.data.length; i += 4) td.data[i + 3] = sil.data[i]; t.putImageData(td, 0, 0);
  c.save(); c.globalAlpha = clamp(.25 + s.controlled.amount * .85); c.drawImage(cv, 0, 0); c.restore();
}
export function renderPlan(d, P, { progress = 1 } = {}) {
  const [W, H] = sizeOf(d.w, d.h), cv = canvas(W, H), c = cv.getContext('2d'), r = rng(`${d.seed}:draw`);
  if (P.copy) { // the reference portrait takes over: the prompt's scene is gone
    c.drawImage(drawRef(P.copy.ref, W, H), 0, 0);
  } else {
    drawScene(c, W, H, P.setting, rng(`${d.seed}:scene`), d.look, null, 1);
    for (const l of P.leaks) { c.save(); c.globalAlpha = .45 + l.amount * .4; drawSubject(c, l.subject, W * l.cx, H * l.by, H * l.s, l.col, d.look, { r }); c.restore(); }
    for (const s of P.subjects) {
      if (s.controlled) drawControlled(c, s, W, H);
      else { c.save(); c.globalAlpha = clamp(s.alpha); drawSubject(c, s.kind, W * s.cx, H * s.by, H * s.s, s.col, d.look, { r }); c.restore(); }
      if (s.kind === 'person' && s.face) {
        const [fx, fy, fr] = s.controlled?.map === 'pose' ? [.5 * W, .2 * H, .07 * W] : [s.cx * W, (s.by - s.s * .86) * H, s.s * .1 * H];
        const f = s.face.ref ? blendFace(s.face.features, GENERIC_FACES[0], clamp((s.face.mix - .3) / .5)) : s.face.features;
        drawFace(c, fx, fy, fr * 1.05, f);
      }
    }
  }
  let img = data(cv);
  for (const st of P.styles) {
    if (st.amount < .05) continue;
    const styled = tint(stylize(img, st.style, Math.min(1.2, st.amount), rng(`${d.seed}:${st.style}`)), st.palette, Math.min(.5, st.amount * .4));
    const M = st.mask ? maskRaster(st.mask, W, H) : null;
    img = mapPixels(img, (rr, gg, bb, i) => { const k = M ? M[i] : 1; return [rr + (styled.data[i * 4] - rr) * k, gg + (styled.data[i * 4 + 1] - gg) * k, bb + (styled.data[i * 4 + 2] - bb) * k]; });
  }
  if (P.overcooked) { const k = 1 + (P.strengthSum - 1.7) * .9; img = mapPixels(img, (rr, gg, bb) => [rr, gg, bb].map(v => Math.round(((v - 128) * k + 128) / 40) * 40)); const e = sobel(img); img = mapPixels(img, (rr, gg, bb, i) => { const s = e[i] > .25 ? -70 : 0; return [rr + s, gg + s, bb + s]; }); }
  if (d.steps < 10) { const nr = rng(`${d.seed}:n`); img = mapPixels(img, (rr, gg, bb) => { const n = (nr() - .5) * 120; return [rr + n, gg + n, bb + n]; }); }
  if (progress < 1) { const pr = rng(`${d.seed}p${Math.round(progress * 20)}`), k = progress ** 1.3; img = mapPixels(img, (rr, gg, bb) => { const n = pr() * 255; return [n + (rr - n) * k, n + (gg - n) * k, n + (bb - n) * k]; }); }
  return put(cv, img);
}
RECIPE_HOOKS.push({ match: d => !d.latent?.inpaint, render: (d, opts = {}) => renderPlan(d, plan(d), opts) });

/* ── Summary for the history ── */
export function historyExtra(recipe) {
  const d = describeRecipe(recipe), P = plan(d);
  const regionSubjects = P.subjects.filter(s => s.region);
  return {
    controls: P.controls.map(c => ({ net: c.net, map: c.map, match: c.match, amount: +c.amount.toFixed(2), strength: c.strength })), strengthSum: +P.strengthSum.toFixed(2), overcooked: P.overcooked,
    posed: P.subjects.some(s => s.controlled?.map === 'pose' && s.controlled.amount > .5), regions: P.regions, regionSubjects: regionSubjects.map(s => ({ kind: s.kind, col: s.col, cx: +s.cx.toFixed(2) })), bleed: P.bleed,
    style: P.style ? { ref: P.style.ref, style: P.style.style, amount: +P.style.amount.toFixed(2), masked: !!P.style.mask } : null, leak: P.leaks.length > 0, composition: !!P.composition,
    persons: P.persons.map(p => ({ x: +p.x.toFixed(2), ref: p.ref, score: +p.score.toFixed(2) })), copy: !!P.copy, sceneKept: P.sceneKept, adapters: (d.model.ipadapters || []).length, maskedAdapters: (d.model.ipadapters || []).filter(a => a.mask).length,
    setting: P.setting,
  };
}
