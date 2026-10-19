import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../labs/lod/lod.js';
import { STAGES, startState, slotTris, budgetStats, budgetOk, idealT } from '../labs/lod/stages.js';
const steps = STAGES.flatMap(s => s.steps);

test('screen maths: 1 m at 10 m covers 94 px on 1080p with FOV 60; % and distance invert each other', () => {
  assert.equal(Math.round(L.ppm(10)), 94);
  const pct = L.screenPct(1.44, 6); assert.ok(Math.abs(L.distanceAtPct(1.44, pct) - 6) < 1e-9);
});
test('bunny LODs: 32,000 triangles at LOD0, each LOD about a quarter, error grows as triangles fall', () => {
  assert.deepEqual(L.LODS.map(L.lodTris), [32000, 8000, 1999, 479]);
  assert.equal(L.lodError(L.LEVELS), 0);
  for (let k = 1; k < L.LEVELS; k++) { assert.ok(L.lodError(k) >= L.lodError(k + 1)); assert.ok(L.lodTris(k) <= L.lodTris(k + 1)); }
  assert.equal(L.levelForRatio(0.5), 200); assert.equal(L.levelForRatio(0), 1); assert.equal(L.ratioOf(100), 0.25);
});
test('LOD Group: thresholds in % of screen height, bias multiplies the height, culled below the last', () => {
  const t = L.DEFAULT_T;
  assert.equal(L.activeLod(50, t), 0); assert.equal(L.activeLod(20, t), 1); assert.equal(L.activeLod(5, t), 2); assert.equal(L.activeLod(2, t), 3); assert.equal(L.activeLod(0.5, t), -1);
  assert.equal(L.activeLod(20, t, 2.5), 0);
  assert.ok(L.thresholdReport(t).every(r => !r.early && !r.late), 'the default thresholds are good');
  for (const i of [1, 2, 3]) assert.ok(Math.abs(L.errorAtSwitch(L.LODS[i], L.idealPct(L.LODS[i])) - 1) < 1e-9);
});
test('each step starts unsolved and its solution passes', () => {
  for (const s of steps) {
    const a = startState(s); assert.equal(!!s.check(a), false, `${s.id} should start unsolved`);
    s.solve(a); assert.ok(s.check(a), `${s.id} solution should pass`);
  }
});
test('decimate: ratio 0.5 halves the triangles; the smallest LODs for 4, 10 and 25 m stay under 1 px', () => {
  const d1 = steps.find(s => s.id === 'd1'), a = startState(d1); a.ratios = [0.5, 0.25, 0.125];
  assert.deepEqual(slotTris(a).map(n => Math.round(n / 32000 * 100) / 100), [1, 0.5, 0.25, 0.13]);
  for (const d of L.DECIMATE_D) { const k = L.minLevelAt(d); assert.ok(L.errorPx(L.lodError(k), d) <= 1); assert.ok(L.errorPx(L.lodError(k - 1), d) > 1); }
  assert.ok(L.minLevelAt(4) > L.minLevelAt(10) && L.minLevelAt(10) > L.minLevelAt(25));
});
test('mipmaps: log2 of texels per pixel; the chain costs one third more', () => {
  assert.equal(L.mipLevel(512, 512), 0); assert.equal(L.mipLevel(512, 128), 2); assert.equal(L.mipLevel(1024, 64), 4); assert.equal(L.mipLevel(256, 512), 0);
  assert.equal(L.mipChain(1024).length, 11);
  assert.ok(Math.abs(L.textureMB(1024, true) / L.textureMB(1024, false) - 4 / 3) < 0.001);
});
test('budget: LODs alone are not enough, LODs with 1 % culling fit, a low bias or a big cull fails', () => {
  const b1 = steps.find(s => s.id === 'b1'), a = startState(b1);
  assert.ok(budgetStats(a).tris > 5e6);
  Object.assign(a, { lods: true, cull: 0 }); assert.equal(budgetOk(a), false);
  Object.assign(a, { cull: 1 }); assert.ok(budgetOk(a));
  Object.assign(a, { cull: 2 }); assert.equal(budgetOk(a), false, 'visible rocks vanish');
  Object.assign(a, { cull: 1, bias: 0.5 }); assert.equal(budgetOk(a), false, 'errors show');
  assert.equal(idealT().length, 3);
});
test('textures per LOD: one texel per screen pixel where each LOD starts, and no more than two', () => {
  const t = L.DEFAULT_T;
  assert.deepEqual([0, 1, 2, 3].map(i => L.idealTex(i, t)), L.DEFAULT_TEX);
  const r = L.texReport([2048, 2048, 2048, 2048], t);
  assert.ok(!r[0].wasted && !r[0].blurry); assert.ok(r.slice(1).every(x => x.wasted));
  assert.ok(L.texReport([2048, 512, 256, 64], t)[1].blurry, '512 px is too small for LOD1');
  assert.ok(Math.abs(L.texMemory([2048, 2048, 2048, 2048]) - 85.33) < 0.01);
  assert.ok(L.texMemory(L.DEFAULT_TEX) < 27.1);
  assert.equal(Math.round(L.lodStartDist(0, t) * 10), 16);
});
