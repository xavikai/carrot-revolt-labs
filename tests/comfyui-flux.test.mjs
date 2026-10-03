// Flux Lab: models in parts, Flux sampling rules, prompting, Fill and Kontext; every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, execute, describeRecipe, NODES } from '../labs/comfyui/engine.js';
import { pairsOf, quotedOf, kontextEdits } from '../labs/comfyui-flux/nodes.js';
import { STAGES, TEMPLATES, GRAPHS as G, historyExtra } from '../labs/comfyui-flux/lab.js';

// What the app keeps in the history after a run (the fields the checklists read).
const entries = g => { const r = execute(g); if (r.runtime) return []; return Object.values(r.outputs).filter(x => x?.recipe).map(img => { const d = describeRecipe(img.recipe); return { graph: g, cfg: d.cfg, steps: d.steps, w: d.w, h: d.h, posText: d.pos.text, ...historyExtra(img.recipe, g) }; }); };
const one = g => entries(g)[0];

test('every starter, solution and template is a valid workflow', () => {
  for (const s of STAGES) for (const st of s.steps) for (const make of [st.starter, st.solution]) { const v = validate(make()); assert.ok(v.ok, `${s.id}: ${st.title.en} ${JSON.stringify(v.errors)}`); }
  for (const t of TEMPLATES) assert.ok(validate(t.make()).ok, t.id);
});
test('parts must match: text encoder type and VAE family', () => {
  assert.equal(execute(G.flux({ type: 'sdxl' })).runtime.msg, 'shape');
  assert.equal(execute(G.flux({ vae: 'sdxl_vae.safetensors' })).runtime.msg, 'vae');
  assert.equal(one(G.flux()).family, 'flux');
  assert.ok(one(G.flux({ dtype: 'default' })).partial, 'fp16 does not fit in 16 GB');
  assert.ok(!one(G.flux()).partial && !one(G.flux({ gguf: 'flux1-dev-Q4_K_S.gguf' })).partial);
  assert.ok(NODES.UnetLoaderGGUF.custom);
});
test('Flux sampling: CFG 1, guidance, negative, steps', () => {
  assert.ok(one(G.flux({ cfg: 8 })).burned);
  assert.ok(one(G.flux({ guidance: 1.5 })).soft); assert.ok(one(G.flux({ guidance: 7 })).burned);
  const ok = one(G.flux()); assert.ok(!ok.burned && !ok.soft && ok.guidance === 3.5);
  const neg = one(G.flux({ text: 'a cat sitting in a forest', neg: 'forest' })); assert.ok(neg.negIgnored); assert.equal(neg.setting, 'forest');
  assert.ok(!one(G.flux({ steps: 4 })).finished); assert.ok(one(G.flux({ unet: 'flux1-schnell.safetensors', steps: 4 })).finished);
});
test('prompting: colours bound to objects, text in quotes, size', () => {
  assert.deepEqual(pairsOf('a red cat next to a blue robot').map(p => p.color), ['red', 'blue']);
  assert.equal(quotedOf('a sign that says "Open"'), 'OPEN');
  assert.ok(one(G.flux({ text: 'a red cat next to a blue robot' })).bound); assert.ok(!one(G.sd('a red cat next to a blue robot')).bound);
  assert.ok(one(G.flux({ text: 'a sign that says "OPEN"' })).textOk); assert.ok(!one(G.sd('a sign that says "OPEN"')).textOk);
});
test('Fill wants a high guidance; Kontext edits need a reference', () => {
  const f = one(G.fill()); assert.ok(f.fill && f.guidance === 30 && !f.burned);
  assert.equal(one(G.kontext(false)).kontext.reference, false);
  const k = one(G.kontext(true)); assert.ok(k.kontext.reference && k.kontext.colWord === 'black' && k.kontext.setting === 'night');
  assert.ok(kontextEdits('remove the cat').remove);
});
const TRIES = { 'sampling:3': [G.flux({ unet: 'flux1-schnell.safetensors', steps: 4, fg: false })], 'sampling:1': [G.flux({ guidance: 1.5 }), G.flux({ guidance: 7 })], 'tools:1': [G.kontext(true, 'make it snowy, keep the cat')] };
test('every step can be completed', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const g = st.solution(), history = [...entries(st.starter()), ...(TRIES[`${s.id}:${i}`] || []).flatMap(entries), ...entries(g)];
    const ctx = { flags: { rt_shape: true, rt_vae: true, saved: true }, history };
    st.goals.forEach(gl => { if (!gl.optional) assert.ok(gl.test(g, ctx), `${s.id} ${i + 1}: ${gl.text.en}`); });
  });
});
test('the starters are not already solved', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => { const g = st.starter(); assert.ok(st.goals.some(gl => !gl.optional && !gl.test(g, { flags: {}, history: [] })), `${s.id} ${i + 1}`); });
});
