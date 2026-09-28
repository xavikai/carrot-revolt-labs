import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../labs/lod/lod.js';
import { STAGES, startState, slotTris, budgetStats, budgetOk, idealT } from '../labs/lod/stages.js';
const steps = STAGES.flatMap(s => s.steps);

test('screen maths: 1 m at 10 m covers 94 px on 1080p with FOV 60; % and distance invert each other', () => {
  assert.equal(Math.round(L.ppm(10)), 94);
  const pct = L.screenPct(1.44, 6); assert.ok(Math.abs(L.distanceAtPct(1.44, pct) - 6) < 1e-9);
});
test('rock LODs: triangles 20·n², error grows as the frequency falls, LOD0 has no error against itself', () => {
  assert.deepEqual(L.LODS.map(L.rockTris), [32000, 15680, 8000, 3920]);
  const e = L.LODS.map(n => L.lodError(n)); assert.equal(e[0], 0); assert.ok(e[1] < e[2] && e[2] < e[3]);
  assert.equal(L.rockMesh(10).tris, 2000); assert.equal(L.rockMesh(10).pos.length, 2000 * 9);
  assert.ok(Math.abs(L.rockHeight() - L.ROCK_H) < 0.05);
});
test('LOD Group: thresholds in % of screen height, bias multiplies the height, culled below the last', () => {
  const t = [22, 9, 3.5, 1];
  assert.equal(L.activeLod(30, t), 0); assert.equal(L.activeLod(10, t), 1); assert.equal(L.activeLod(5, t), 2); assert.equal(L.activeLod(2, t), 3); assert.equal(L.activeLod(0.5, t), -1);
  assert.equal(L.activeLod(10, t, 2.5), 0);
  assert.ok(L.thresholdReport(t).every(r => !r.early && !r.late), 'the default thresholds are good');
  for (const i of [1, 2, 3]) assert.ok(Math.abs(L.errorAtSwitch(L.LODS[i], L.idealPct(L.LODS[i])) - 1) < 1e-9);
});
test('each step starts unsolved and its solution passes', () => {
  for (const s of steps) {
    const a = startState(s); assert.equal(!!s.check(a), false, `${s.id} should start unsolved`);
    s.solve(a); assert.ok(s.check(a), `${s.id} solution should pass`);
  }
});
test('decimate: ratio 0.5 halves the triangles; the smallest LODs for 8, 20 and 50 m stay under 1 px', () => {
  const d1 = steps.find(s => s.id === 'd1'), a = startState(d1); a.ratios = [0.5, 0.25, 0.125];
  assert.deepEqual(slotTris(a).map(n => Math.round(n / 32000 * 1000) / 1000), [1, 0.49, 0.25, 0.123]);
  for (const d of L.DECIMATE_D) { const n = L.minFreqAt(d); assert.ok(L.errorPx(L.lodError(n), d) <= 1); assert.ok(L.errorPx(L.lodError(n - 1), d) > 1); }
});
test('mipmaps: log2 of texels per pixel; the chain costs one third more', () => {
  assert.equal(L.mipLevel(512, 512), 0); assert.equal(L.mipLevel(512, 128), 2); assert.equal(L.mipLevel(1024, 64), 4); assert.equal(L.mipLevel(256, 512), 0);
  assert.equal(L.mipChain(1024).length, 11);
  assert.ok(Math.abs(L.textureMB(1024, true) / L.textureMB(1024, false) - 4 / 3) < 0.001);
});
test('budget: LODs alone are not enough, LODs with 1 % culling fit, a big bias or a big cull fails', () => {
  const b1 = steps.find(s => s.id === 'b1'), a = startState(b1);
  assert.ok(budgetStats(a).tris > 5e6);
  Object.assign(a, { lods: true, cull: 0 }); assert.equal(budgetOk(a), false);
  Object.assign(a, { cull: 1 }); assert.ok(budgetOk(a));
  Object.assign(a, { cull: 2 }); assert.equal(budgetOk(a), false, 'visible rocks vanish');
  Object.assign(a, { cull: 1, bias: 0.5 }); assert.equal(budgetOk(a), false, 'errors show');
  assert.equal(idealT().length, 3);
});
