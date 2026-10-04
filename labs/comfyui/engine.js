// Carrot Revolt Labs · ComfyUI Lab · a model-free ComfyUI simulator.
// It follows ComfyUI's rules (node names, socket types, defaults, validation messages, bypass and mute,
// execution order and caching) but never runs an AI model: the KSampler produces a "recipe" that
// render.js draws procedurally. Same graph + same seed = same picture, as in ComfyUI.

export const TYPE_COLOR = { '*': '#c8c8c8', MODEL: '#b39ddb', CLIP: '#ffd500', VAE: '#ff6e6e', CONDITIONING: '#ffa931', LATENT: '#ff9cf9', IMAGE: '#64b5f6', MASK: '#81c784', CONTROL_NET: '#6ee7b7' };
export const CHECKPOINTS = {
  'dreamshaper_8.safetensors': { arch: 'SD1.5', native: 512, look: 'painterly' },
  'anything_v5.safetensors': { arch: 'SD1.5', native: 512, look: 'anime' },
  'sd_xl_base_1.0.safetensors': { arch: 'SDXL', native: 1024, look: 'xl' },
};
export const LORAS = {
  'pixel_art_sd15.safetensors': { arch: 'SD1.5', style: 'pixel', trigger: 'pixelart' },
  'watercolor_sd15.safetensors': { arch: 'SD1.5', style: 'watercolor', trigger: 'wtrcolor' },
  'ink_sketch_sd15.safetensors': { arch: 'SD1.5', style: 'sketch', trigger: null },
  'neon_glow_sdxl.safetensors': { arch: 'SDXL', style: 'neon', trigger: 'neonglow' },
};
export const CONTROLNETS = {
  'control_v11p_sd15_canny.pth': { arch: 'SD1.5', kind: 'canny' },
  'control_v11f1p_sd15_depth.pth': { arch: 'SD1.5', kind: 'depth' },
  'control_v11p_sd15_openpose.pth': { arch: 'SD1.5', kind: 'openpose' },
};
export const IMAGES = ['example.png', 'pose_jump.png', 'lighthouse.png', 'cat.png'];
export const SAMPLERS = ['euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_sde', 'ddim', 'uni_pc', 'lcm'];
export const SCHEDULERS = ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta'];

const W = (name, kind, value, o = {}) => ({ name, kind, value, ...o });
const I = (name, type, o = {}) => ({ name, type, ...o });
const O = (name, type) => ({ name, type });
// Node definitions: class name (as in ComfyUI's API), title, category of the Add Node menu, sockets and widgets.
export const NODES = {
  CheckpointLoaderSimple: { title: 'Load Checkpoint', cat: ['loaders'], w: 315, outputs: [O('MODEL', 'MODEL'), O('CLIP', 'CLIP'), O('VAE', 'VAE')], widgets: [W('ckpt_name', 'combo', 'dreamshaper_8.safetensors', { options: Object.keys(CHECKPOINTS) })] },
  LoraLoader: { title: 'Load LoRA', cat: ['loaders'], w: 315, inputs: [I('model', 'MODEL'), I('clip', 'CLIP')], outputs: [O('MODEL', 'MODEL'), O('CLIP', 'CLIP')], widgets: [W('lora_name', 'combo', 'pixel_art_sd15.safetensors', { options: Object.keys(LORAS) }), W('strength_model', 'float', 1, { min: -10, max: 10, step: .01 }), W('strength_clip', 'float', 1, { min: -10, max: 10, step: .01 })] },
  ControlNetLoader: { title: 'Load ControlNet Model', cat: ['loaders'], w: 315, outputs: [O('CONTROL_NET', 'CONTROL_NET')], widgets: [W('control_net_name', 'combo', 'control_v11p_sd15_canny.pth', { options: Object.keys(CONTROLNETS) })] },
  CLIPTextEncode: { title: 'CLIP Text Encode (Prompt)', cat: ['conditioning'], w: 400, inputs: [I('clip', 'CLIP')], outputs: [O('CONDITIONING', 'CONDITIONING')], widgets: [W('text', 'text', '')] },
  ControlNetApplyAdvanced: { title: 'Apply ControlNet', cat: ['conditioning', 'controlnet'], w: 315, inputs: [I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('control_net', 'CONTROL_NET'), I('image', 'IMAGE'), I('vae', 'VAE', { optional: true })], outputs: [O('positive', 'CONDITIONING'), O('negative', 'CONDITIONING')], widgets: [W('strength', 'float', 1, { min: 0, max: 10, step: .01 }), W('start_percent', 'float', 0, { min: 0, max: 1, step: .001 }), W('end_percent', 'float', 1, { min: 0, max: 1, step: .001 })] },
  EmptyLatentImage: { title: 'Empty Latent Image', cat: ['latent'], w: 315, outputs: [O('LATENT', 'LATENT')], widgets: [W('width', 'int', 512, { min: 16, max: 16384, step: 8 }), W('height', 'int', 512, { min: 16, max: 16384, step: 8 }), W('batch_size', 'int', 1, { min: 1, max: 4096, step: 1 })] },
  VAEEncode: { title: 'VAE Encode', cat: ['latent'], w: 210, inputs: [I('pixels', 'IMAGE'), I('vae', 'VAE')], outputs: [O('LATENT', 'LATENT')] },
  VAEDecode: { title: 'VAE Decode', cat: ['latent'], w: 210, inputs: [I('samples', 'LATENT'), I('vae', 'VAE')], outputs: [O('IMAGE', 'IMAGE')] },
  KSampler: { title: 'KSampler', cat: ['sampling'], w: 315, inputs: [I('model', 'MODEL'), I('positive', 'CONDITIONING'), I('negative', 'CONDITIONING'), I('latent_image', 'LATENT')], outputs: [O('LATENT', 'LATENT')], widgets: [W('seed', 'int', 156680208700286, { min: 0, max: 18446744073709551615, step: 1 }), W('control_after_generate', 'combo', 'randomize', { options: ['fixed', 'increment', 'decrement', 'randomize'] }), W('steps', 'int', 20, { min: 1, max: 10000, step: 1 }), W('cfg', 'float', 8, { min: 0, max: 100, step: .1 }), W('sampler_name', 'combo', 'euler', { options: SAMPLERS }), W('scheduler', 'combo', 'normal', { options: SCHEDULERS }), W('denoise', 'float', 1, { min: 0, max: 1, step: .01 })] },
  LoadImage: { title: 'Load Image', cat: ['image'], w: 315, outputs: [O('IMAGE', 'IMAGE'), O('MASK', 'MASK')], widgets: [W('image', 'combo', 'example.png', { options: IMAGES }), W('upload', 'button', 'choose file to upload')], preview: true },
  Canny: { title: 'Canny', cat: ['image', 'preprocessors'], w: 315, inputs: [I('image', 'IMAGE')], outputs: [O('IMAGE', 'IMAGE')], widgets: [W('low_threshold', 'float', .4, { min: .01, max: .99, step: .01 }), W('high_threshold', 'float', .8, { min: .01, max: .99, step: .01 })] },
  SaveImage: { title: 'Save Image', cat: ['image'], w: 315, inputs: [I('images', 'IMAGE')], widgets: [W('filename_prefix', 'string', 'ComfyUI')], output: true, preview: true },
  PreviewImage: { title: 'Preview Image', cat: ['image'], w: 260, inputs: [I('images', 'IMAGE')], output: true, preview: true },
};
// Reroute: a dot that carries any type, to tidy long links.
NODES.Reroute = { title: 'Reroute', cat: ['utils'], w: 60, reroute: true, inputs: [I('input', '*')], outputs: [O('output', '*')] };
export const CATEGORIES = ['loaders', 'conditioning', 'latent', 'sampling', 'image', 'mask', 'utils'];
// Other labs add their own nodes: a definition in NODES and an execute handler here.
export const HANDLERS = {};
// Checks a lab can add before a node runs (for example, running out of GPU memory). Return { msg, detail, … } to stop the run.
export const PRECHECKS = [];
HANDLERS.Reroute = ({ n, get }) => [get(n.id, 'input')];
export function registerNodes(defs) { for (const [type, d] of Object.entries(defs)) { NODES[type] = d.def; if (d.run) HANDLERS[type] = d.run; } }
export function addOptions(type, widget, values) { const w = NODES[type].widgets.find(x => x.name === widget); for (const v of values) if (!w.options.includes(v)) w.options.push(v); }

let uid = 1;
export function makeNode(type, x, y, values = {}, id) {
  const def = NODES[type];
  const widgets = Object.fromEntries((def.widgets || []).filter(w => w.kind !== 'button').map(w => [w.name, w.value]));
  return { id: id ?? `${type}-${uid++}`, type, x, y, mode: 0, widgets: { ...widgets, ...values }, title: null, collapsed: false };
}
export const makeLink = (from, out, to, input) => ({ from, out, to, input });
// What the environment has installed. A lab can leave custom node packs or model files out, as on a new computer.
export const ENV = { missingPacks: new Set(), missingFiles: new Set() };
export const isMissing = n => !!(n && NODES[n.type]?.custom && ENV.missingPacks.has(NODES[n.type].custom));
// The type of an output. A wildcard output (a Reroute) takes the type of whatever feeds it.
export function outType(g, id, out, guard = 0) {
  const n = g.nodes.find(x => x.id === id); if (!n || !NODES[n.type]) return undefined;
  const t = NODES[n.type].outputs?.[out]?.type; if (t !== '*' || guard > 30) return t;
  const inp = (NODES[n.type].inputs || [])[0], l = inp && g.links.find(x => x.to === id && x.input === inp.name);
  return l ? outType(g, l.from, l.out, guard + 1) : '*';
}
// Widgets can take a link too (an Int node driving a seed): their socket type comes from the widget kind.
export const WIDGET_TYPE = { int: 'INT', float: 'FLOAT', string: 'STRING', text: 'STRING', combo: 'COMBO' };
export const widgetSpec = (def, name) => { if (def?.inputs?.some(i => i.name === name)) return null; const w = def?.widgets?.find(x => x.name === name && WIDGET_TYPE[x.kind]); return w ? { name, type: WIDGET_TYPE[w.kind], optional: true, widget: true } : null; };
export const inSpec = (g, id, name) => { const n = g.nodes.find(x => x.id === id); return n && NODES[n.type] && (NODES[n.type].inputs?.find(i => i.name === name) || widgetSpec(NODES[n.type], name)); };
export function canConnect(g, l) {
  if (l.from === l.to) return false;
  const a = outType(g, l.from, l.out), b = inSpec(g, l.to, l.input)?.type;
  if (!a || !b || (a !== b && a !== '*' && b !== '*')) return false;
  const seen = new Set(), st = [l.to];
  while (st.length) { const id = st.pop(); if (id === l.from) return false; if (seen.has(id)) continue; seen.add(id); g.links.filter(x => x.from === id).forEach(x => st.push(x.to)); }
  return true;
}
// An input takes one link; a new one replaces the old one, as in ComfyUI.
export function connect(g, l) { if (!canConnect(g, l)) return false; g.links = g.links.filter(x => !(x.to === l.to && x.input === l.input)); g.links.push(l); return true; }

/* ── The basic workflow (ComfyUI's default, Ctrl D / Load Default) ── */
export function defaultGraph({ links = true } = {}) {
  const g = { nodes: [
    makeNode('CheckpointLoaderSimple', 26, 474, {}, 'ckpt'),
    makeNode('CLIPTextEncode', 415, 186, { text: 'beautiful scenery nature glass bottle landscape, , purple galaxy bottle,' }, 'pos'),
    makeNode('CLIPTextEncode', 413, 389, { text: 'text, watermark' }, 'neg'),
    makeNode('EmptyLatentImage', 473, 609, {}, 'latent'),
    makeNode('KSampler', 863, 186, {}, 'sampler'),
    makeNode('VAEDecode', 1209, 188, {}, 'decode'),
    makeNode('SaveImage', 1451, 189, {}, 'save'),
  ], links: [], groups: [] };
  if (links) for (const l of DEFAULT_LINKS) g.links.push(makeLink(...l));
  return g;
}
export const DEFAULT_LINKS = [
  ['ckpt', 0, 'sampler', 'model'], ['ckpt', 1, 'pos', 'clip'], ['ckpt', 1, 'neg', 'clip'], ['pos', 0, 'sampler', 'positive'], ['neg', 0, 'sampler', 'negative'],
  ['latent', 0, 'sampler', 'latent_image'], ['sampler', 0, 'decode', 'samples'], ['ckpt', 2, 'decode', 'vae'], ['decode', 0, 'save', 'images'],
];

/* ── Prompt understanding (a tiny vocabulary instead of a text encoder) ── */
export const VOCAB = {
  subjects: { bottle: 'bottle', robot: 'robot', cat: 'cat', kitten: 'cat', house: 'house', cabin: 'house', lighthouse: 'lighthouse', tree: 'tree', person: 'person', girl: 'person', boy: 'person', man: 'person', woman: 'person' },
  settings: { galaxy: 'galaxy', space: 'galaxy', stars: 'galaxy', sunset: 'sunset', night: 'night', snow: 'snow', winter: 'snow', beach: 'beach', sea: 'beach', ocean: 'beach', forest: 'forest', desert: 'desert', landscape: 'landscape', scenery: 'landscape', nature: 'landscape', mountains: 'landscape' },
  colors: { red: '#d8443c', blue: '#3d7bd9', green: '#3f9a4b', orange: '#ec8a2f', purple: '#8d55c9', pink: '#e47fb5', gold: '#d9b03a', yellow: '#e6cf3e', white: '#ecebe6', black: '#26262a' },
  styles: { watercolor: 'watercolor', 'pixel art': 'pixel', pixel: 'pixel', neon: 'neon', sketch: 'sketch', pencil: 'sketch', drawing: 'sketch', 'oil painting': 'oil' },
  quality: { detailed: 1, masterpiece: 1, 'best quality': 1, sharp: 1, '8k': 1 },
};
export function parsePrompt(text) {
  const src = String(text || '').toLowerCase(), weights = new Map();
  // ComfyUI emphasis: (word:1.3) sets the weight, (word) is 1.1.
  const clean = src.replace(/\(([^():]+):\s*([\d.]+)\)/g, (_, w, n) => { for (const t of w.split(',')) weights.set(t.trim(), Number(n)); return ` ${w} `; }).replace(/\(([^():]+)\)/g, (_, w) => { for (const t of w.split(',')) weights.set(t.trim(), 1.1); return ` ${w} `; });
  const find = (dict) => { const out = []; for (const [k, v] of Object.entries(dict)) { const re = new RegExp(`(^|[^a-z])${k.replace(' ', '\\s*')}($|[^a-z])`); if (re.test(clean)) out.push({ word: k, value: v, w: weights.get(k) ?? 1 }); } return out; };
  const triggers = Object.values(LORAS).map(l => l.trigger).filter(Boolean).filter(t => clean.includes(t));
  return { text: src, subjects: find(VOCAB.subjects), settings: find(VOCAB.settings), colors: find(VOCAB.colors), styles: find(VOCAB.styles), quality: find(VOCAB.quality).length, blurry: /blur/.test(clean), triggers, weights: Object.fromEntries(weights) };
}

/* ── Subgraphs: a node that holds a graph. They run as if their nodes were in the main graph. ── */
// g.subgraphs[id] = { name, nodes, links, groups, inputs: [{ name, type, targets: [{ id, input }] }], outputs: [{ name, type, from: { id, out } }] }
export const SUBGRAPH = 'subgraph:';
export function registerSubgraphs(g) {
  for (const [id, sg] of Object.entries(g?.subgraphs || {})) NODES[SUBGRAPH + id] = { title: sg.name, cat: ['subgraph'], w: 280, subgraph: id, inputs: sg.inputs.map(i => ({ name: i.name, type: i.type })), outputs: sg.outputs.map(o => ({ name: o.name, type: o.type })), widgets: [] };
}
// Convert to Subgraph: the nodes go inside; links that cross the edge become its inputs and outputs. Returns the new node's id.
export function makeSubgraph(g, ids, { sid = `sg${uid++}`, nid = `Subgraph-${uid++}`, name = 'New Subgraph' } = {}) {
  const set = new Set(ids), inner = g.nodes.filter(n => set.has(n.id)); if (!inner.length) return null;
  const inputs = [], outputs = [], innerLinks = [], outerLinks = [], inMap = new Map(), outMap = new Map();
  const uniq = (list, base) => { let nm = base, k = 2; while (list.some(x => x.name === nm)) nm = `${base}_${k++}`; return nm; };
  for (const l of g.links) {
    const a = set.has(l.from), b = set.has(l.to);
    if (a && b) innerLinks.push({ ...l });
    else if (!a && b) { const key = `${l.from}#${l.out}`; let i = inMap.get(key); if (!i) { i = { name: uniq(inputs, l.input), type: outType(g, l.from, l.out), targets: [] }; inputs.push(i); inMap.set(key, i); outerLinks.push(makeLink(l.from, l.out, nid, i.name)); } i.targets.push({ id: l.to, input: l.input }); }
    else if (a && !b) { const key = `${l.from}#${l.out}`; let k = outMap.get(key); if (k === undefined) { k = outputs.length; outputs.push({ name: uniq(outputs, NODES[g.nodes.find(n => n.id === l.from).type].outputs[l.out].name), type: outType(g, l.from, l.out), from: { id: l.from, out: l.out } }); outMap.set(key, k); } outerLinks.push(makeLink(nid, k, l.to, l.input)); }
  }
  const xs = inner.map(n => n.x), ys = inner.map(n => n.y), x1 = Math.max(...inner.map(n => n.x + (NODES[n.type].w || 300)));
  g.subgraphs ||= {}; g.subgraphs[sid] = { name, nodes: inner, links: innerLinks, groups: [], inputs, outputs, io: { inX: Math.min(...xs) - 300, outX: x1 + 80, y: Math.min(...ys) } };
  g.nodes = g.nodes.filter(n => !set.has(n.id)); g.links = g.links.filter(l => !set.has(l.from) && !set.has(l.to)).concat(outerLinks);
  g.nodes.push({ id: nid, type: SUBGRAPH + sid, x: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), y: Math.min(...ys), mode: 0, widgets: {}, title: null, collapsed: false });
  registerSubgraphs(g); return nid;
}
export const isSubgraphNode = n => n?.type?.startsWith(SUBGRAPH);
export function flatten(g) {
  if (!g.nodes.some(isSubgraphNode)) return g;
  registerSubgraphs(g);
  const nodes = [], links = [], outerOf = {};
  for (const n of g.nodes) {
    if (!isSubgraphNode(n)) { nodes.push(n); continue; }
    const sg = g.subgraphs[n.type.slice(SUBGRAPH.length)];
    for (const m of sg.nodes) { const id = `${n.id}/${m.id}`; outerOf[id] = n.id; nodes.push({ ...m, id, mode: n.mode === 0 ? m.mode : n.mode }); }
    for (const l of sg.links) links.push({ ...l, from: `${n.id}/${l.from}`, to: `${n.id}/${l.to}` });
  }
  const sgOf = id => { const n = g.nodes.find(x => x.id === id); return isSubgraphNode(n) ? g.subgraphs[n.type.slice(SUBGRAPH.length)] : null; };
  for (const l of g.links) {
    const src = sgOf(l.from), dst = sgOf(l.to);
    let from = l.from, out = l.out;
    if (src) { const o = src.outputs[l.out]; if (!o) continue; from = `${l.from}/${o.from.id}`; out = o.from.out; }
    if (dst) { const i = dst.inputs.find(x => x.name === l.input); if (!i) continue; for (const t of i.targets) links.push({ from, out, to: `${l.to}/${t.id}`, input: t.input }); }
    else links.push({ ...l, from, out });
  }
  return { ...g, nodes, links, outerOf };
}
const outer = (g, id) => (id && g.outerOf?.[id]) || id;

/* ── Validation and execution ── */
const active = (g, id) => { const n = g.nodes.find(x => x.id === id); return n && n.mode !== 2; };
export function inputLink(g, id, name) { return g.links.find(l => l.to === id && l.input === name); }
// Bypass (mode 4): the node passes its first input of the same type. Mute (mode 2): the node is removed.
function resolve(g, link) {
  let l = link;
  for (let guard = 0; l && guard < 50; guard++) {
    const n = g.nodes.find(x => x.id === l.from); if (!n) return null;
    if (n.mode === 2) return null;
    if (n.mode !== 4) return l;
    const type = NODES[n.type].outputs[l.out].type, pass = (NODES[n.type].inputs || []).find(i => i.type === type);
    l = pass ? inputLink(g, n.id, pass.name) : null;
  }
  return null;
}
// What ComfyUI would execute when the prompt is queued: output nodes and everything they need.
export function validate(g0) {
  const g = flatten(g0);
  const outputs = g.nodes.filter(n => NODES[n.type].output && n.mode === 0);
  const errors = [], needed = new Set(), order = [];
  if (!outputs.length) return { ok: false, errors: [{ node: null, msg: 'noOutputs' }], order: [] };
  const visit = (id, chain = new Set()) => {
    if (needed.has(id)) return; if (chain.has(id)) return; chain.add(id);
    const n = g.nodes.find(x => x.id === id);
    for (const inp of NODES[n.type].inputs || []) {
      const l = resolve(g, inputLink(g, id, inp.name));
      if (!l) { if (!inp.optional) errors.push({ node: id, msg: 'missing', input: inp.name }); continue; }
      visit(l.from, chain);
    }
    // Widgets driven by a link (an Int, a String…) need their source too.
    for (const wl of g.links.filter(x => x.to === id && widgetSpec(NODES[n.type], x.input))) { const l = resolve(g, wl); if (l) visit(l.from, chain); }
    needed.add(id); order.push(id);
  };
  outputs.forEach(n => visit(n.id));
  // A combo value that is not among the options (a model file that is not installed, a workflow from another computer).
  const linkedW = id => new Set(g.links.filter(x => x.to === id).map(x => x.input));
  for (const n of g.nodes.filter(x => needed.has(x.id))) for (const wd of NODES[n.type].widgets || []) if (wd.kind === 'combo' && Array.isArray(wd.options) && n.widgets[wd.name] !== undefined && !linkedW(n.id).has(wd.name) && (!wd.options.includes(n.widgets[wd.name]) || ENV.missingFiles.has(n.widgets[wd.name]))) errors.push({ node: n.id, msg: 'notInList', input: wd.name, value: n.widgets[wd.name], options: wd.options });
  for (const n of g.nodes.filter(x => needed.has(x.id) && x.type === 'EmptyLatentImage')) if (n.widgets.width % 8 || n.widgets.height % 8) errors.push({ node: n.id, msg: 'multiple8' });
  // Nodes of a custom node pack that is not installed: ComfyUI cannot even build the prompt.
  for (const n of g.nodes) if (n.mode === 0 && isMissing(n)) errors.unshift({ node: n.id, msg: 'missingNode', type: n.type, pack: NODES[n.type].custom });
  for (const e of errors) if (e.node && g.outerOf?.[e.node]) { e.inner = e.node; e.node = g.outerOf[e.node]; }
  return { ok: !errors.length, errors, order, graph: g };
}
// Cache keys: a node only runs again when it, or something it depends on, has changed.
export function cacheKeys(g0, order) {
  const keys = {}, g = flatten(g0);
  for (const id of order) { const n = g.nodes.find(x => x.id === id); const ins = [...(NODES[n.type].inputs || []).map(i => i.name), ...g.links.filter(x => x.to === id && widgetSpec(NODES[n.type], x.input)).map(x => x.input)].map(name => { const l = resolve(g, inputLink(g, id, name)); return l ? `${keys[l.from]}#${l.out}` : '-'; }); keys[id] = JSON.stringify([n.type, n.widgets, ins]); }
  return keys;
}
// Run the graph: the value of every output socket, warnings, runtime errors and the images of the output nodes.
export function execute(g0, { images = {} } = {}) {
  const v = validate(g0), g = v.graph; if (!v.ok) return { ...v, values: {}, warnings: [], outputs: {} };
  const values = {}, warnings = [];
  const get = (id, name) => { const l = resolve(g, inputLink(g, id, name)); return l ? values[l.from]?.[l.out] : undefined; };
  let runtime = null;
  for (const id of v.order) {
    const n = g.nodes.find(x => x.id === id), w = { ...n.widgets };
    for (const l of g.links) if (l.to === id && widgetSpec(NODES[n.type], l.input)) { const v2 = get(id, l.input); if (v2 !== undefined) w[l.input] = v2; }
    for (const chk of PRECHECKS) { const rt = chk({ n, w, get: name => get(id, name), warnings }); if (rt) { runtime = { node: id, ...rt }; break; } }
    if (runtime) break;
    switch (n.type) {
      case 'CheckpointLoaderSimple': { const c = CHECKPOINTS[w.ckpt_name]; values[id] = [{ ckpt: w.ckpt_name, ...c, loras: [] }, { ckpt: w.ckpt_name, arch: c.arch, loras: [] }, { ckpt: w.ckpt_name, arch: c.arch }]; break; }
      case 'LoraLoader': {
        const m = get(id, 'model'), c = get(id, 'clip'), L = LORAS[w.lora_name], ok = L.arch === m.arch;
        if (!ok) warnings.push({ node: id, msg: 'loraArch', lora: w.lora_name, arch: m.arch });
        values[id] = [{ ...m, loras: [...m.loras, { name: w.lora_name, ...L, strength: ok ? w.strength_model : 0 }] }, { ...c, loras: [...c.loras, { name: w.lora_name, ...L, strength: ok ? w.strength_clip : 0 }] }];
        break;
      }
      case 'CLIPTextEncode': { const c = get(id, 'clip'); values[id] = [{ prompt: parsePrompt(w.text), clip: c, controls: [] }]; break; }
      case 'ControlNetLoader': values[id] = [{ name: w.control_net_name, ...CONTROLNETS[w.control_net_name] }]; break;
      case 'ControlNetApplyAdvanced': {
        const p = get(id, 'positive'), ng = get(id, 'negative'), cn = get(id, 'control_net'), img = get(id, 'image');
        const ctl = { net: cn, image: img, strength: w.strength, start: w.start_percent, end: w.end_percent };
        values[id] = [{ ...p, controls: [...p.controls, ctl] }, { ...ng, controls: [...ng.controls, ctl] }]; break;
      }
      case 'EmptyLatentImage': values[id] = [{ w: w.width, h: w.height, batch: w.batch_size, source: null }]; break;
      case 'LoadImage': values[id] = [{ kind: 'photo', name: w.image, w: 512, h: 512 }, { kind: 'mask', name: w.image, strokes: w.mask || [], invert: !!w.mask_invert, w: 512, h: 512 }]; break;
      case 'Canny': { const img = get(id, 'image'); values[id] = [{ kind: 'canny', of: img, low: w.low_threshold, high: w.high_threshold, name: img.name, w: img.w, h: img.h }]; break; }
      case 'VAEEncode': { const img = get(id, 'pixels'); values[id] = [{ w: img.w, h: img.h, batch: 1, source: img }]; break; }
      case 'KSampler': {
        const m = get(id, 'model'), pos = get(id, 'positive'), neg = get(id, 'negative'), lat = get(id, 'latent_image');
        for (const c of pos.controls) if (c.net.arch !== m.arch) runtime = runtime || { node: id, msg: 'shape', detail: `mat1 and mat2 shapes cannot be multiplied (${m.arch === 'SDXL' ? '1x2816 and 768x320' : '77x768 and 2048x320'})` };
        if (pos.clip?.arch && pos.clip.arch !== m.arch) runtime = runtime || { node: id, msg: 'shape', detail: 'mat1 and mat2 shapes cannot be multiplied (77x768 and 2048x1280)' };
        values[id] = [{ w: lat.w, h: lat.h, batch: lat.batch, sampled: true, recipe: { model: m, pos, neg, latent: lat, seed: w.seed, steps: w.steps, cfg: w.cfg, sampler: w.sampler_name, scheduler: w.scheduler, denoise: w.denoise } }];
        break;
      }
      case 'VAEDecode': {
        const s = get(id, 'samples'), vae = get(id, 'vae');
        values[id] = [s.sampled ? { kind: 'generated', recipe: s.recipe, vae, w: s.w, h: s.h, batch: s.batch } : s.source ? { ...s.source, roundTrip: true } : { kind: 'empty', w: s.w, h: s.h, batch: s.batch }];
        break;
      }
      case 'SaveImage': case 'PreviewImage': values[id] = []; break;
      default: if (HANDLERS[n.type]) { const out = HANDLERS[n.type]({ n, w, get, warnings, graph: g }); if (out?.runtime) runtime = runtime || { node: id, ...out.runtime }; else values[id] = out; }
    }
    if (runtime) break;
  }
  const outputs = {};
  if (!runtime) for (const id of v.order) { const n = g.nodes.find(x => x.id === id); if (NODES[n.type].output) outputs[id] = NODES[n.type].outputImage ? values[id]?.[0] : get(id, 'images'); }
  if (runtime && g.outerOf?.[runtime.node]) { runtime.inner = runtime.node; runtime.node = g.outerOf[runtime.node]; }
  return { ...v, values, warnings, outputs, runtime };
}
// What the student sees in the image: every parameter that decides the picture, in one object.
export function describeRecipe(r) {
  if (!r) return null;
  const pos = r.pos.prompt, neg = r.neg.prompt;
  const loras = r.model.loras.map((l, i) => ({ ...l, clip: r.pos.clip?.loras?.[i]?.strength ?? 0 }));
  return { model: r.model, latent: r.latent, seed: r.seed, steps: r.steps, cfg: r.cfg, sampler: r.sampler, scheduler: r.scheduler, denoise: r.denoise, w: r.latent.w, h: r.latent.h, ckpt: r.model.ckpt, arch: r.model.arch, native: r.model.native, look: r.model.look, pos, neg, loras, controls: r.pos.controls, source: r.latent.source };
}
// Convergence of a sampler: how finished the picture is after a number of steps.
export function convergence(steps, sampler, scheduler) {
  const k = { euler: 6, euler_ancestral: 7, heun: 3.6, dpm_2: 3.8, dpmpp_2m: 4.5, dpmpp_2m_sde: 5, dpmpp_sde: 4.2, ddim: 6.5, uni_pc: 4, lcm: 1.2 }[sampler] ?? 6;
  const s = scheduler === 'karras' || scheduler === 'exponential' ? .85 : scheduler === 'simple' || scheduler === 'beta' ? .95 : 1;
  const q = 1 - Math.exp(-steps / (k * s));
  return sampler === 'lcm' ? (steps > 8 ? Math.max(.55, q - (steps - 8) * .04) : q) : q;
}
export const ANCESTRAL = new Set(['euler_ancestral', 'dpmpp_2m_sde', 'dpmpp_sde']);
// Strength of every effect, as numbers the renderer and the checklists share.
export function effects(d) {
  const adherence = Math.max(0, Math.min(1, (d.cfg - 1) / 5)), burn = Math.max(0, (d.cfg - 11) / 9);
  const quality = convergence(d.steps, d.sampler, d.scheduler);
  const styles = {};
  for (const s of d.pos.styles) styles[s.value] = (styles[s.value] || 0) + .75 * s.w * adherence;
  let overload = 0;
  for (const l of d.loras) {
    if (!l.strength) continue;
    const trig = l.trigger ? (d.pos.triggers.includes(l.trigger) ? Math.min(1.2, Math.max(0, l.modelOnly ? 1 : l.clip)) : .35) : 1;
    const a = l.strength * trig;
    styles[l.style] = (styles[l.style] || 0) + a;
    overload += Math.max(0, Math.abs(l.strength) - 1.2);
  }
  for (const k of Object.keys(styles)) styles[k] = Math.max(0, Math.min(1.6, styles[k]));
  const control = d.controls.map(c => {
    const imgKind = c.image?.kind === 'canny' ? 'canny' : 'photo';
    const match = c.net.kind === 'canny' ? (imgKind === 'canny' ? 1 : .45) : c.net.kind === 'depth' ? (imgKind === 'canny' ? .3 : .55) : (imgKind === 'canny' ? .2 : .3);
    const window = Math.max(0, c.end - c.start), early = c.start <= .2 ? 1 : Math.max(0, 1 - (c.start - .2) * 1.6);
    return { ...c, match, amount: Math.max(0, Math.min(1, c.strength * match * Math.sqrt(window) * early)) };
  });
  const big = Math.max(d.w, d.h) / d.native, small = Math.min(d.w, d.h) / d.native;
  return { adherence, burn, quality, styles, overload, control, duplicates: big > 1.45 ? (big > 2.1 ? 3 : 2) : 1, lowres: small < .7 };
}
