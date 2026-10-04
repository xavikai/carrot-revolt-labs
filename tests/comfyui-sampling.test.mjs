// Sampling & Prompting Lab: validation of missing files, embeddings, sampler behaviour, two-stage sampling, prompt timing, weights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, execute, describeRecipe } from '../labs/comfyui/engine.js';
import { STAGES, TEMPLATES, GRAPHS as G, historyExtra } from '../labs/comfyui-sampling/lab.js';

const set = (g, id, k, v) => { g.nodes.find(n => n.id === id).widgets[k] = v; return g; };
// What the app keeps in the history (base fields + the lab's).
const entries = (g, flags = {}) => { const v = validate(g); if (!v.ok) { flags.errorSeen = true; return []; } const r = execute(g); if (r.runtime) return []; return Object.values(r.outputs).filter(x => x?.recipe).map(img => { const d = describeRecipe(img.recipe); return { graph: g, seed: d.seed, steps: d.steps, scheduler: d.scheduler, posText: d.pos.text, ...historyExtra(img.recipe, g) }; }); };
const one = g => entries(g)[0];
// Dynamic prompts are resolved by the interface before running: do the same here.
const resolve = (g, pick) => { const c = JSON.parse(JSON.stringify(g)); for (const n of c.nodes) for (const [k, v] of Object.entries(n.widgets)) if (typeof v === 'string' && /\{[^{}]*\|/.test(v)) { n.dyn = { [k]: v }; n.widgets[k] = v.replace(/\{([^{}]*)\}/g, (m, b) => b.split('|')[pick % b.split('|').length]); } return c; };

test('every starter, solution and template is valid (except the shared workflow with a missing model)', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => { for (const [k, make] of [['starter', st.starter], ['solution', st.solution]]) { const v = validate(make()); if (s.id === 'files' && i === 0 && k === 'starter') { assert.equal(v.errors[0].msg, 'notInList'); continue; } assert.ok(v.ok, `${s.id} ${i + 1} ${k}: ${JSON.stringify(v.errors)}`); } });
  for (const t of TEMPLATES) assert.ok(validate(t.make()).ok, t.id);
});
test('samplers: ancestral changes with steps, converging does not; karras finishes sooner', () => {
  const a20 = one(G.base(undefined, undefined, { sampler_name: 'euler_ancestral', steps: 20 })), a30 = one(G.base(undefined, undefined, { sampler_name: 'euler_ancestral', steps: 30 }));
  assert.notEqual(a20.layoutKey, a30.layoutKey);
  assert.equal(one(G.base(undefined, undefined, { sampler_name: 'dpmpp_2m', steps: 20 })).layoutKey, one(G.base(undefined, undefined, { sampler_name: 'dpmpp_2m', steps: 30 })).layoutKey);
  assert.ok(one(G.base(undefined, undefined, { sampler_name: 'dpmpp_2m', steps: 10 })).quality < .9);
  assert.ok(one(G.base(undefined, undefined, { sampler_name: 'dpmpp_2m', steps: 10, scheduler: 'karras' })).quality >= .9);
});
test('two-stage sampling and prompt timing', () => {
  const bad = one(G.adv({ leftover: 'disable', addNoise: 'enable' })); assert.ok(bad.stage.chained && !bad.stage.ok);
  const ok = one(G.adv()); assert.ok(ok.stage.ok && ok.stage.twoModels && ok.stage.look === 'anime');
  assert.ok(!one(G.adv({ start2: 15 })).stage.ok, 'a gap or overlap breaks the hand-over');
  const s = one(G.sched()); assert.ok(s.schedule.covers); assert.equal(s.schedule.earlySubject, 'lighthouse'); assert.equal(s.schedule.lateStyle, 'watercolor');
});
test('embeddings, weights, long prompts', () => {
  assert.ok(one(G.base(undefined, 'embedding:badhands')).embMissing);
  assert.ok(execute(G.base(undefined, 'embedding:badhands')).warnings.some(w => /does not exist/.test(w.text)));
  assert.ok(one(G.base(undefined, 'embedding:easynegative')).embOk);
  assert.ok(one(G.base('a cat, (watercolor:2.0)')).broken); assert.ok(!one(G.base('a cat, (watercolor:1.4)')).broken);
  assert.ok(STAGES.find(s => s.id === 'prompting').steps[2].starter().nodes.length > 0);
  assert.ok(one(STAGES.find(s => s.id === 'prompting').steps[2].starter()).late);
});
const dyn = () => G.base('a {red|blue|green} cat in the {snow|desert|forest}, detailed');
const TRIES = {
  'samplers:0': [G.base(undefined, undefined, { sampler_name: 'euler_ancestral', steps: 30 }), G.base(undefined, undefined, { sampler_name: 'dpmpp_2m', steps: 20 })],
  'samplers:1': [], 'stages:0': [], 'prompting:0': [G.base('a cat sitting in a landscape, (watercolor:2.0)')],
  'prompting:1': [resolve(dyn(), 0), resolve(dyn(), 1), resolve(dyn(), 2)],
  'seeds:0': [1, 2, 3].map(k => set(G.base(), 'sampler', 'seed', 156680208700286 + k)),
};
test('every step can be completed', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const flags = { loadedFromImage: true, saved: true }, g = st.solution();
    const history = [...entries(st.starter(), flags), ...(TRIES[`${s.id}:${i}`] || []).flatMap(x => entries(x, flags)), ...entries(g, flags)];
    st.goals.forEach(gl => { if (!gl.optional) assert.ok(gl.test(g, { flags, history }), `${s.id} ${i + 1}: ${gl.text.en}`); });
  });
});
test('the starters are not already solved', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => { const g = st.starter(); assert.ok(st.goals.some(gl => !gl.optional && !gl.test(g, { flags: {}, history: [] })), `${s.id} ${i + 1}`); });
});
