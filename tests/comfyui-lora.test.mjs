// LoRA Lab: strengths and triggers, stacking, datasets and captions, the training model, checkpoints; every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, execute } from '../labs/comfyui/engine.js';
import { train } from '../labs/comfyui-lora/nodes.js';
import { STAGES, TEMPLATES, GRAPHS as G, historyExtra } from '../labs/comfyui-lora/lab.js';

const set = (g, id, k, v) => { g.nodes.find(n => n.id === id).widgets[k] = v; return g; };
const entries = g => { const r = execute(g); if (!r.ok || r.runtime) return []; return Object.entries(r.outputs).filter(([, x]) => x).flatMap(([id, img]) => { const n = g.nodes.find(x => x.id === id); if (!['SaveImage', 'PreviewImage'].includes(n.type)) return []; return img.recipe ? [{ graph: g, ...historyExtra(img.recipe) }] : [{ graph: g, kind: img.kind }]; }); };
const one = g => entries(g).find(h => h.pip);
const T = (o = {}) => G.train(o), withText = (g, t) => set(g, 'pos', 'text', t);

test('every starter, solution and template is a valid workflow', () => {
  for (const s of STAGES) for (const st of s.steps) for (const make of [st.starter, st.solution]) { const v = validate(make()); assert.ok(v.ok, `${s.id}: ${st.title.en} ${JSON.stringify(v.errors)}`); }
  for (const t of TEMPLATES) assert.ok(validate(t.make()).ok, t.id);
});
test('model, clip, trigger, strength and stacking', () => {
  assert.ok(one(G.use()).pip.likeness >= .75);
  assert.ok(one(G.use({ sc: 0 })).pip.likeness < .75);
  assert.ok(one(G.use({ text: 'a robot in a landscape' })).pip.likeness < .5);
  assert.ok(one(G.use({ sm: 1.6, sc: 1.6 })).pip.fried); assert.ok(!one(G.use({ sm: .9, sc: .9 })).pip.fried);
  assert.ok(one(G.stack(1, 1)).pip.fried); const s = one(G.stack()); assert.ok(!s.pip.fried && s.styleOn.includes('watercolor'));
});
test('the training model: window, overfit, learning rate, rank, dataset', () => {
  assert.ok(train({ dataset: 'pip_20_varied', steps: 100, lr: 1e-4, rank: 16 }).likeness < .5);
  const good = train({ dataset: 'pip_20_varied', steps: 600, lr: 1e-4, rank: 16 }); assert.ok(good.likeness >= .7 && good.fried < .35 && good.baked < .5);
  const over = train({ dataset: 'pip_20_varied', steps: 3000, lr: 1e-4, rank: 16 }); assert.ok(over.frozen > .5 || over.baked > .5);
  assert.ok(train({ dataset: 'pip_20_varied', steps: 600, lr: 1e-3, rank: 16 }).fried > .35);
  assert.ok(train({ dataset: 'pip_6_same_background', steps: 600, lr: 1e-4, rank: 16 }).baked > .5, 'same background gets baked in');
  assert.ok(train({ dataset: 'pip_20_varied_no_captions', steps: 600, lr: 1e-4, rank: 16 }).bleed);
  assert.ok(train({ dataset: 'pip_20_varied', steps: 600, lr: 1e-4, rank: 4 }).likeness < .85);
});
const TRIES = {
  'use:0': [G.use({ sc: 0 }), G.use({ text: 'a robot sitting in a landscape, detailed' })],
  'train:1': [T({ steps: 100 }), T({ steps: 3000 })],
  'train:2': [T({ lr: .001 })],
  'evaluate:0': [withText(T({ steps: 800 }), 'pip robot standing in the snow, detailed'), withText(T({ steps: 800 }), 'a cat sitting in a landscape, detailed')],
  'evaluate:1': ['001500', '002500'].map(k => G.use({ name: `pip_v1-${k}.safetensors`, text: 'pip robot standing in the snow, detailed' })),
};
test('every step can be completed', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const g = st.solution(), history = [...entries(st.starter()), ...(TRIES[`${s.id}:${i}`] || []).flatMap(entries), ...entries(g)];
    st.goals.forEach(gl => { if (!gl.optional) assert.ok(gl.test(g, { flags: { saved: true }, history }), `${s.id} ${i + 1}: ${gl.text.en}`); });
  });
});
test('the starters are not already solved', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => { const g = st.starter(); assert.ok(st.goals.some(gl => !gl.optional && !gl.test(g, { flags: {}, history: [] })), `${s.id} ${i + 1}`); });
});
