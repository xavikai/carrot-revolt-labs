// Workflow Lab: missing packs and models, reroutes, primitives driving widgets, subgraphs, XY grids; every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, execute, ENV, canConnect, makeLink, flatten, makeSubgraph, NODES } from '../labs/comfyui/engine.js';
import { STAGES, TEMPLATES, GRAPHS as G, outputExtra } from '../labs/comfyui-workflow/lab.js';
import { NEW_CKPT } from '../labs/comfyui-workflow/nodes.js';
import { describeRecipe } from '../labs/comfyui/engine.js';

const clean = () => { ENV.missingPacks = new Set(); ENV.missingFiles = new Set(); };
const set = (g, id, k, v) => { g.nodes.find(n => n.id === id).widgets[k] = v; return g; };
// The same history entry the interface writes (only the fields the checklists read).
const run = g => {
  const r = execute(g); if (!r.ok || r.runtime) return { ok: false, r, entries: [] };
  const entries = Object.entries(r.outputs).filter(([, x]) => x?.recipe).map(([, img]) => { const d = describeRecipe(img.recipe); return { graph: g, seed: d.seed, sampler: d.sampler, scheduler: d.scheduler, cfg: d.cfg, ckpt: d.ckpt, arch: d.arch, posText: d.pos.text, ...outputExtra(img) }; });
  return { ok: true, r, entries };
};

test('every starter, solution and template is a valid workflow (everything installed)', () => {
  clean();
  for (const s of STAGES) for (const st of s.steps) for (const make of st.starterFails ? [st.solution] : [st.starter, st.solution]) { const v = validate(make()); assert.ok(v.ok, `${s.id}: ${st.title.en} ${JSON.stringify(v.errors)}`); }
  for (const t of TEMPLATES) assert.ok(run(t.make()).ok, t.id);
});
test('missing packs and missing model files stop the run', () => {
  ENV.missingPacks = new Set(['xy-plot']); const v = validate(G.xy()); assert.ok(!v.ok && v.errors[0].msg === 'missingNode' && v.errors[0].pack === 'xy-plot');
  clean(); ENV.missingFiles = new Set([NEW_CKPT]); const v2 = validate(G.photoreal()); assert.ok(v2.errors.some(e => e.msg === 'notInList' && e.input === 'ckpt_name'));
  clean(); assert.equal(run(G.photoreal()).entries[0].ckpt, NEW_CKPT);
});
test('reroutes carry any type and take the type they receive', () => {
  clean(); const g = G.wide(true);
  assert.ok(run(g).ok);
  assert.ok(!canConnect(g, makeLink('rr', 0, 'sampler', 'model')), 'a reroute carrying VAE does not fit MODEL');
  assert.ok(!validate(G.wide()).ok, 'without the VAE the decoder fails');
});
test('primitives drive widgets', () => {
  clean(); const e = run(G.twoSamplers(true)).entries; assert.equal(e.length, 2); assert.equal(e[0].seed, 42); assert.equal(e[1].seed, 42); assert.notEqual(e[0].sampler, e[1].sampler);
  const sep = run(G.twoSamplers()).entries; assert.notEqual(sep[0].seed, sep[1].seed);
  const p = run(set(G.twoModels(true), 'text', 'value', 'a robot in the snow')).entries; assert.equal(p[0].posText, p[1].posText); assert.ok(p[0].posText.includes('robot'));
  assert.ok(canConnect(G.twoSamplers(), makeLink('latent', 0, 'sampler', 'seed')) === false, 'LATENT does not fit an INT widget');
});
test('subgraphs run like the nodes they hold, and share one definition', () => {
  clean(); const a = run(G.base()).entries[0], s = G.subgraph(); assert.ok(s.nodes.some(n => n.id === 'sg1') && !s.nodes.some(n => n.id === 'sampler'));
  const b = run(s).entries[0]; assert.equal(a.seed, b.seed); assert.equal(a.posText, b.posText);
  assert.equal(flatten(s).nodes.filter(n => n.type === 'KSampler').length, 1);
  const two = run(G.sgTwice({ sampler: 'dpmpp_2m', scheduler: 'karras' })).entries; assert.equal(two.length, 2); assert.ok(two.every(h => h.sampler === 'dpmpp_2m')); assert.notEqual(two[0].posText, two[1].posText);
  const g = G.base(); const id = makeSubgraph(g, ['pos', 'neg']); assert.equal(NODES[g.nodes.find(n => n.id === id).type].outputs.length, 2);
  const bad = G.subgraph(); bad.subgraphs.sgSampler.links = bad.subgraphs.sgSampler.links.filter(l => l.input !== 'samples'); const v = validate(bad); assert.ok(!v.ok && v.errors[0].node === 'sg1' && v.errors[0].inner, 'errors inside point at the subgraph node');
});
test('XY grids: sizes, axes and bad values', () => {
  clean(); const h = run(G.xy({ xv: '3, 6, 9, 12', y: 'sampler_name', yv: 'euler, dpmpp_2m' })).entries[0]; assert.equal(h.xy.cells, 8);
  const r = run(G.xy({ y: 'sampler_name', yv: 'euler, eulr' })); assert.equal(r.r.runtime.msg, 'xyValue');
});
const TRIES = { 'wiring:1': [set(G.twoSamplers(true), 'seed', 'value', 43)] };
const FLAGS = { 'shared:0': { managerOpen: true, 'ready_xy-plot': true }, 'shared:1': { errorSeen: true, [`dl_${NEW_CKPT}`]: true }, 'subgraphs:1': { enteredSubgraph: true } };
test('every step can be completed', () => {
  clean();
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const k = `${s.id}:${i}`, g = st.solution(), history = [st.starter(), ...(TRIES[k] || []), g].flatMap(x => run(x).entries);
    st.goals.forEach(gl => { if (!gl.optional) assert.ok(gl.test(g, { flags: { saved: true, ...FLAGS[k] }, history }), `${k}: ${gl.text.en}`); });
  });
});
test('the starters are not already solved', () => {
  clean(); for (const s of STAGES) s.steps.forEach((st, i) => { const g = st.starter(); assert.ok(st.goals.some(gl => !gl.optional && !gl.test(g, { flags: {}, history: [] })), `${s.id} ${i + 1}`); });
});
