import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../labs/lightmaps/lightmap.js';
import { STAGES, startState, bakeKey, isBaked, packOf, probeReport } from '../labs/lightmaps/stages.js';
const steps = STAGES.flatMap(s => s.steps);

test('faces point into the room and rays hit the walls', () => {
  assert.deepEqual(L.FACES.floor.n.map(v => Math.round(v) + 0), [0, 1, 0]); assert.deepEqual(L.FACES.ceiling.n.map(v => Math.round(v) + 0), [0, -1, 0]); assert.deepEqual(L.FACES.left.n.map(v => Math.round(v) + 0), [1, 0, 0]);
  const boxes = L.sceneBoxes(L.defaultRenderers()), h = L.rayBoxes(boxes, [0, 1, 0], [1, 0, 0]); assert.ok(Math.abs(h.t - 4) < 1e-6);
  assert.equal(L.rayBoxes(boxes, [-0.5, 1.6, -2.9], [0, 0, -1]), null, 'through the window');
});
test('packing: resolution × area gives the texels; a big resolution needs a second lightmap', () => {
  const R = L.defaultRenderers(); const p10 = L.pack(R, { ...L.DEFAULT_BAKE, resolution: 10 }), p20 = L.pack(R, { ...L.DEFAULT_BAKE, resolution: 20 });
  assert.ok(p20.texels > 3.8 * p10.texels && p20.texels < 4.2 * p10.texels, 'double resolution, four times the texels');
  assert.equal(L.pack(R, { ...L.DEFAULT_BAKE, resolution: 40 }).pages, 2);
  const r2 = L.defaultRenderers(); r2.Vase.receive = 'probes'; r2.Door.contribute = false; assert.ok(L.pack(r2, L.DEFAULT_BAKE).texels < L.pack(R, L.DEFAULT_BAKE).texels);
});
test('a bake: the sun patch is bright, bounces light the ceiling, Baked Indirect drops the direct sun', () => {
  const R = L.defaultRenderers(), b0 = { ...L.DEFAULT_BAKE, resolution: 3, bounces: 0, env: 8 }, b2 = { ...b0, bounces: 2, indirect: 16 };
  const mean = (bk, id, mode = 'baked', max = false) => { const j = L.createBake(R, bk, mode); while (!j.run(1e7)); const m = j.result(), c = j.pack.charts[id], S = j.pack.size; let s = 0, n = 0, mx = 0; for (let y = 0; y < c.ch; y++) for (let x = 0; x < c.cw; x++) { const v = m[c.page][((c.y + y) * S + c.x + x) * 3]; s += v; n++; mx = Math.max(mx, v); } return max ? mx : s / n; };
  assert.ok(mean(b0, 'floor', 'baked', true) > 4, 'sun patch'); assert.ok(mean(b2, 'ceiling') > 2 * mean(b0, 'ceiling'), 'bounces');
  assert.ok(mean(b2, 'floor', 'indirect', true) < 2, 'no direct sun in Baked Indirect');
});
test('prop: UV0 overlaps, UV1 margin in texels', () => {
  assert.ok(L.propLayout('uv0').every(r => r.join() === '0,0,1,1'));
  const L1 = L.propLayout('uv1', 0.05); for (let i = 0; i < L1.length; i++) for (let j = i + 1; j < L1.length; j++) { const a = L1[i], b = L1[j]; assert.ok(a[2] <= b[0] + 1e-9 || b[2] <= a[0] + 1e-9 || a[3] <= b[1] + 1e-9 || b[3] <= a[1] + 1e-9, 'no overlap'); }
  assert.ok(L.marginTexels(20, 0.07) >= 2 && L.marginTexels(20, 0.07) <= 6); assert.equal(L.marginTexels(20, 0), 0);
  const r = L.bakeProp('uv1', 0.05, 10, 4); assert.equal(r.E.length, r.S * r.S * 3);
});
test('FBX: the right settings leave no issue; the start has the classic ones', () => {
  assert.deepEqual(L.fbxReport({ ...L.FBX_RIGHT, bakeAxis: true }), []);
  const s = startState(steps.find(x => x.id === 'u3')); const r = L.fbxReport(s.fbx);
  for (const k of ['size100', 'rot90', 'uvorder', 'overwrite', 'scale']) assert.ok(r.includes(k), k);
});
test('each step starts unsolved and its solution passes', () => {
  for (const s of steps) { const a = startState(s); assert.equal(!!s.check(a), false, `${s.id} should start unsolved`); s.solve(a); assert.ok(s.check(a), `${s.id} solution should pass`); }
});
test('changing a bake setting makes the lighting out of date; probes beat the ambient probe', () => {
  const b1 = steps.find(s => s.id === 'b1'), a = startState(b1); b1.solve(a); assert.ok(isBaked(a)); a.bake.resolution = 16; assert.equal(isBaked(a), false); assert.ok(bakeKey(a));
  const p1 = steps.find(s => s.id === 'p1'), b = startState(p1); const none = probeReport(b).mean; p1.solve(b); assert.ok(probeReport(b).mean < none / 10);
  assert.equal(packOf(a).pages, 1);
});
