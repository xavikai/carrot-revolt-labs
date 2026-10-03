// Inpainting Lab: the new nodes follow ComfyUI's rules, the simulator tells the routes apart, and every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, execute, describeRecipe, NODES, canConnect, makeLink } from '../labs/comfyui/engine.js';
import { coverage, maskRaster, cropBox } from '../labs/comfyui-inpaint/nodes.js';
import { STAGES, TEMPLATES, GRAPHS as G, MASKS, historyExtra, outputExtra, findRecipe } from '../labs/comfyui-inpaint/lab.js';

// What the app writes in the history after a run (the fields the checklists read).
function entries(g) {
  const r = execute(g); assert.ok(r.ok && !r.runtime, JSON.stringify(r.errors || r.runtime));
  return Object.values(r.outputs).filter(Boolean).map(img => {
    const rec = img.recipe || findRecipe(img);
    if (!rec) return { kind: img.kind, graph: g };
    const d = describeRecipe(rec);
    return { graph: g, denoise: d.denoise, w: d.w, h: d.h, pos: d.pos, seed: d.seed, ...historyExtra(rec), ...outputExtra(img) };
  });
}
const latentOf = g => { const r = execute(g); return Object.values(r.values).flat().find(v => v?.inpaint && v.source); };

test('every starter, solution and template is a valid workflow', () => {
  for (const s of STAGES) for (const st of s.steps) for (const make of [st.starter, st.solution]) { const v = validate(make()); assert.ok(v.ok, `${s.id}: ${st.title.en} ${JSON.stringify(v.errors)}`); }
  for (const t of TEMPLATES) assert.ok(validate(t.make()).ok, t.id);
});
test('the four routes build different latents', () => {
  assert.equal(latentOf(G.inpaint()).inpaint.method, 'vaeinpaint');
  assert.equal(latentOf(G.inpaint({ method: 'noisemask' })).inpaint.method, 'noisemask');
  const imc = latentOf(G.inpaint({ method: 'imc' })); assert.equal(imc.inpaint.method, 'imc'); assert.equal(imc.inpaint.noiseMask, true);
  const r = execute(G.softMask(true)); assert.ok(Object.values(r.values).flat().some(v => v?.diffdiff === 1), 'Differential Diffusion patches the model');
});
test('masks: strokes, grow, blur, invert and the outpaint border', () => {
  const cat = { kind: 'mask', strokes: MASKS.cat, w: 512, h: 512 }, box = [.32, .44, .71, .9];
  const c = coverage(cat, box); assert.ok(c.cover > .7 && c.area < .3, JSON.stringify(c));
  assert.ok(coverage({ kind: 'grow', of: cat, px: 16 }, box).area > c.area, 'grow makes it bigger');
  const soft = maskRaster({ kind: 'grow', of: cat, px: 0, blur: 12 }, 64, 64); assert.ok(soft.some(v => v > .05 && v < .95), 'blur makes grey values');
  assert.ok(Math.abs(coverage({ kind: 'invert', of: cat }, box).area - (1 - c.area)) < .01);
  const pad = maskRaster({ kind: 'padmask', pad: { l: 0, t: 0, r: 256, b: 0 }, feather: 40, ow: 512, oh: 512, w: 768, h: 512 }, 96, 64);
  assert.equal(pad[10 * 96 + 90], 1); assert.equal(pad[10 * 96 + 5], 0); assert.ok(pad[10 * 96 + 62] > 0 && pad[10 * 96 + 62] < 1, 'feathering fades into the original');
  const st = { mask: { kind: 'mask', strokes: MASKS.lighthouse, w: 512, h: 512 }, factor: 1.5 }, b = cropBox(st); assert.ok(b[2] - b[0] < .6 && b[0] >= 0, 'the crop is a window around the mask');
});
test('outpainting grows the canvas and crop & stitch keeps the full size', () => {
  const out = entries(G.outpaint({ right: 256 }))[0]; assert.equal(out.w, 768); assert.equal(out.pad, 256); assert.equal(out.feather, 40);
  const st = entries(G.stitch())[0]; assert.ok(st.stitch && st.cropped && st.subject === 'lighthouse');
  assert.ok(canConnect(G.stitch(), makeLink('crop', 0, 'stitch', 'stitcher')), 'STITCHER wires join');
  assert.equal(NODES.InpaintCrop.custom, 'CropAndStitch');
});
test('every step can be completed with its solution', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    const g = st.solution(), history = [...entries(st.starter()), ...entries(g)], ctx = { flags: { maskPainted: true, saved: true }, history };
    st.goals.forEach(gl => { if (!gl.optional) assert.ok(gl.test(g, ctx), `${s.id} ${i + 1}: ${gl.text.en}`); });
  });
});
test('the starters are not already solved', () => {
  for (const s of STAGES) s.steps.forEach((st, i) => {
    if (s.id === 'masks' && i === 0) return;
    const g = st.starter(), ctx = { flags: {}, history: [] };
    assert.ok(st.goals.some(gl => !gl.optional && !gl.test(g, ctx)), `${s.id} ${i + 1}`);
  });
});
