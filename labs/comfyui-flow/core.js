// Small, model-free teaching graph. It never performs image inference.
export const NODES = [
  { id: 'checkpoint', title: 'Load Checkpoint', x: 25, y: 36, inputs: {}, outputs: { MODEL: 'MODEL', CLIP: 'CLIP', VAE: 'VAE' } },
  { id: 'positive', title: 'CLIP Text Encode (Prompt)', x: 302, y: 24, inputs: { clip: 'CLIP' }, outputs: { CONDITIONING: 'CONDITIONING' } },
  { id: 'negative', title: 'CLIP Text Encode (Prompt)', x: 302, y: 268, inputs: { clip: 'CLIP' }, outputs: { CONDITIONING: 'CONDITIONING' } },
  { id: 'latent', title: 'Empty Latent Image', x: 28, y: 395, inputs: {}, outputs: { LATENT: 'LATENT' } },
  { id: 'sampler', title: 'KSampler', x: 604, y: 117, inputs: { model: 'MODEL', positive: 'CONDITIONING', negative: 'CONDITIONING', latent_image: 'LATENT' }, outputs: { LATENT: 'LATENT' } },
  { id: 'decode', title: 'VAE Decode', x: 858, y: 178, inputs: { samples: 'LATENT', vae: 'VAE' }, outputs: { IMAGE: 'IMAGE' } },
  { id: 'save', title: 'Save Image', x: 1086, y: 205, inputs: { images: 'IMAGE' }, outputs: {} }
];

export const REQUIRED = [
  ['checkpoint', 'CLIP', 'positive', 'clip'],
  ['checkpoint', 'CLIP', 'negative', 'clip'],
  ['checkpoint', 'MODEL', 'sampler', 'model'],
  ['positive', 'CONDITIONING', 'sampler', 'positive'],
  ['negative', 'CONDITIONING', 'sampler', 'negative'],
  ['latent', 'LATENT', 'sampler', 'latent_image'],
  ['sampler', 'LATENT', 'decode', 'samples'],
  ['checkpoint', 'VAE', 'decode', 'vae'],
  ['decode', 'IMAGE', 'save', 'images']
];

export const key = link => link.join(':');
const byId = Object.fromEntries(NODES.map(node => [node.id, node]));

export function connect(links, from, output, to, input) {
  const source = byId[from], target = byId[to];
  if (!source || !target || !source.outputs[output] || !target.inputs[input]) return { links, error: 'Choose an output and an input.' };
  if (source.outputs[output] !== target.inputs[input]) return { links, error: 'These sockets carry different data types.' };
  if (from === to) return { links, error: 'A node cannot feed itself.' };
  const next = links.filter(link => !(link[2] === to && link[3] === input));
  const candidate = [from, output, to, input];
  if (next.some(link => key(link) === key(candidate))) return { links, error: null };
  next.push(candidate);
  if (hasCycle(next)) return { links, error: 'This connection would create a cycle.' };
  return { links: next, error: null };
}

export function hasCycle(links) {
  const outgoing = new Map(NODES.map(node => [node.id, []]));
  links.forEach(([from, , to]) => outgoing.get(from)?.push(to));
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) || []) if (visit(next)) return true;
    visiting.delete(id); visited.add(id); return false;
  }
  return NODES.some(node => visit(node.id));
}

export function validate(links) {
  const missing = REQUIRED.filter(required => !links.some(link => key(link) === key(required)));
  const extra = links.filter(link => !REQUIRED.some(required => key(link) === key(required)));
  return { ready: !missing.length && !extra.length && !hasCycle(links), missing, extra };
}

export function executionOrder(links) {
  const result = [], visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    links.filter(link => link[2] === id).forEach(link => visit(link[0]));
    result.push(id);
  }
  visit('save');
  return result;
}
