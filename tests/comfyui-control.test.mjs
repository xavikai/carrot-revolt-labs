// Control & Injection Lab: control maps and models, regions, IPAdapter weight types, identity; every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, execute, NODES, CONTROLNETS } from '../labs/comfyui/engine.js';
import { matchOf } from '../labs/comfyui-control/nodes.js';
import { STAGES, TEMPLATES, GRAPHS as G, historyExtra } from '../labs/comfyui-control/lab.js';

const entries = g => { const r = execute(g); if (r.runtime) return []; return Object.values(r.outputs).filter(Boolean).map(img => img.recipe ? { graph: g, ...historyExtra(img.recipe) } : { graph: g, kind: img.kind }); };
const one = g => entries(g).find(h => h.controls);

test('every starter, solution and template is a valid workflow', () => {
  for (const s of STAGES) for (const st of s.steps) for (const make of [st.starter, st.solution]) { const v = validate(make()); assert.ok(v.ok, `${s.id}: ${st.title.en} ${JSON.stringify(v.errors)}`); }
  for (const t of TEMPLATES) assert.ok(validate(t.make()).ok, t.id);
});
test('a ControlNet only understands its own kind of map', () => {
  const pose = { kind: 'pose', name: 'pose_jump.png', body: true };
  assert.equal(matchOf(CONTROLNETS['control_v11p_sd15_openpose.pth'], pose), 1);
  assert.equal(matchOf(CONTROLNETS['control_v11p_sd15_openpose.pth'], { kind: 'depth', name: 'pose_jump.png' }), .25);
  assert.equal(matchOf(CONTROLNETS['control_v11p_sd15_openpose.pth'], { kind: 'pose', name: 'lighthouse.png', body: true }), 0, 'no person, empty pose map');
  assert.ok(one(G.cn()).posed); assert.ok(!one(G.cn({ map: 'depth', net: 'control_v11p_sd15_openpose.pth' })).posed);
  assert.ok(one(G.multi(1, 1)).overcooked); assert.ok(!one(G.multi()).overcooked);
});
test('regions keep colours apart; masks place things', () => {
  assert.ok(one(G.base('a red cat and a blue robot in a landscape')).bleed);
  const r = one(G.regions()); assert.deepEqual(r.regionSubjects.map(s => s.kind), ['cat', 'robot']); assert.ok(r.regionSubjects[0].cx < .5 && r.regionSubjects[1].cx > .5);
  assert.ok(one(G.maskRegion()).regionSubjects[0].cx > .65);
});
test('IPAdapter: weight types decide what is taken', () => {
  const lin = one(G.ipa()); assert.ok(lin.leak && lin.style);
  const st = one(G.ipa({ type: 'style transfer' })); assert.ok(!st.leak && st.style.amount >= .5);
  const comp = one(G.ipa({ type: 'composition', ref: 'ref_neon.png' })); assert.ok(comp.composition && !comp.style);
  assert.ok(one(G.ipa({ type: 'strong style transfer', weight: 1.3, ref: 'ref_neon.png' })).leak);
  assert.ok(NODES.IPAdapterAdvanced.custom && NODES.DWPreprocessor.custom);
});
test('identity: FaceID keeps the face, weight decides copy or loss', () => {
  assert.ok(one(G.faceid({ plain: true })).persons[0].score < .6);
  assert.ok(one(G.faceid()).persons[0].score >= .75);
  assert.ok(one(G.faceid({ weight: 1.5 })).copy); assert.ok(one(G.faceid({ weight: .3 })).persons[0].score < .45);
  const two = one(G.two()); assert.deepEqual(two.persons.map(p => p.ref), ['portrait_anna.png', 'portrait_leo.png']);
});
const TRIES = { 'ipadapter:1': [G.ipa({ type: 'composition', ref: 'ref_neon.png' }), G.ipa({ type: 'strong style transfer', weight: 1.3, ref: 'ref_neon.png' })], 'identity:1': [G.faceid({ weight: 1.5 }), G.faceid({ weight: .3 })], 'identity:0': [], 'ipadapter:0': [] };
test('every step can be completed', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const g = st.solution(), history = [...entries(st.starter()), ...(TRIES[`${s.id}:${i}`] || []).flatMap(entries), ...entries(g)];
    st.goals.forEach(gl => { if (!gl.optional) assert.ok(gl.test(g, { flags: { saved: true }, history }), `${s.id} ${i + 1}: ${gl.text.en}`); });
  });
});
test('the starters are not already solved', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => { const g = st.starter(); assert.ok(st.goals.some(gl => !gl.optional && !gl.test(g, { flags: {}, history: [] })), `${s.id} ${i + 1}`); });
});
