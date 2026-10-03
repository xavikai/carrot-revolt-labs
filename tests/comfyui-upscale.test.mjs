// Upscale & Detail Lab: the nodes follow ComfyUI's rules, the detail simulator tells the methods apart, and every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, execute, NODES } from '../labs/comfyui/engine.js';
import { summary, findRecipe } from '../labs/comfyui-upscale/nodes.js';
import { STAGES, TEMPLATES, GRAPHS as G, outputExtra } from '../labs/comfyui-upscale/lab.js';

const set = (g, id, k, v) => { g.nodes.find(n => n.id === id).widgets[k] = v; return g; };
const run = g => { const r = execute(g); return r.runtime ? { runtime: r.runtime } : summary(r.outputs.save); };
// What the app keeps in the history after a run (the fields the checklists read).
const entries = g => { const r = execute(g); if (r.runtime) return []; return Object.values(r.outputs).filter(Boolean).filter(img => findRecipe(img)).map(img => ({ graph: g, ...outputExtra(img) })); };

test('every starter, solution and template is a valid workflow', () => {
  for (const s of STAGES) for (const st of s.steps) for (const make of [st.starter, st.solution]) { const v = validate(make()); assert.ok(v.ok, `${s.id}: ${st.title.en} ${JSON.stringify(v.errors)}`); }
  for (const t of TEMPLATES) assert.ok(validate(t.make()).ok, t.id);
});
test('pixels are not detail: resize, upscale model, hires fix', () => {
  const lz = run(G.scaleBy()); assert.equal(lz.outW, 2048); assert.equal(lz.detail, .25); assert.equal(lz.edge, 'soft');
  assert.equal(run(G.scaleBy('nearest-exact')).edge, 'blocky');
  const m = run(G.model()); assert.equal(m.edge, 'sharp'); assert.ok(m.tex < .4, 'a model adds no real texture');
  assert.equal(run(G.model('RealESRGAN_x4plus.pth')).edge, 'waxy');
  assert.equal(run(G.latentRaw()).edge, 'blocky');
  const h = run(G.hires(.5)); assert.equal(h.edge, 'clean'); assert.equal(h.dup, 1); assert.ok(h.detail === 1 && h.tex > .8);
  assert.equal(run(G.hires(.3)).edge, 'blocky', 'too little denoise leaves the latent blocks');
  assert.equal(run(G.hires(.8)).dup, 2, 'too much denoise recomposes above native size');
  assert.equal(run(G.base(undefined, 1024)).dup, 2);
});
test('memory, tiles, ghosts, seams and ControlNet Tile', () => {
  assert.equal(run(G.hires(.5, 4)).runtime.msg, 'oom');
  const u = run(G.usdu()); assert.equal(u.outW, 2048); assert.equal(u.usdu.tiles, 16); assert.equal(u.ghosts, 0); assert.equal(u.seams, 0);
  const bad = run(G.usdu({ denoise: .6, mask_blur: 0, tile_padding: 0 })); assert.ok(bad.ghosts > 0 && bad.seams > .5);
  const t = run(G.usduTile(.5)); assert.ok(t.usdu.ctl && t.ghosts === 0 && t.tex > u.tex);
  assert.ok(NODES.UltimateSDUpscale.custom && NODES.FaceDetailer.custom);
});
test('the face detailer finds small faces, and its two settings matter', () => {
  const wide = run(G.base('a woman on the beach, wide shot, sunset, detailed')); assert.ok(wide.faceQ < .3);
  const d = run(G.detailer()); assert.equal(d.detected, 1); assert.ok(d.faceQ > .9 && !d.faceVar);
  assert.ok(run(G.detailer({ denoise: .8 })).faceVar > 0, 'high denoise draws another person');
  const none = run(G.detailer({ bbox_threshold: .8 })); assert.equal(none.detected, 0); assert.equal(none.faceQ, wide.faceQ);
  const full = run(G.full()); assert.ok(full.outW >= 3840 && full.faceQ > .9 && full.dup === 1);
});
// Extra runs a student makes in some steps (comparisons) before the solution.
const TRIES = {
  'models:0': [G.model('RealESRGAN_x4plus.pth')],
  'hires:1': [G.hires(.3), G.hires(.8)],
  'detail:1': [G.detailer({ denoise: .8 }), G.detailer({ bbox_threshold: .8 })],
};
test('every step can be completed', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const g = st.solution(), history = [...entries(st.starter()), ...(TRIES[`${s.id}:${i}`] || []).flatMap(entries), ...entries(g)];
    const ctx = { flags: { resultOpened: true, saved: true, rt_oom: true }, history };
    st.goals.forEach(gl => { if (!gl.optional) assert.ok(gl.test(g, ctx), `${s.id} ${i + 1}: ${gl.text.en}`); });
  });
});
test('the starters are not already solved', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const g = st.starter(), ctx = { flags: {}, history: [] };
    assert.ok(st.goals.some(gl => !gl.optional && !gl.test(g, ctx)), `${s.id} ${i + 1}`);
  });
});
