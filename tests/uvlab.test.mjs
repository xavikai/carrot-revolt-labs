import test from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../labs/uv-unwrapping/uvcore.js';
import { STAGES, startState, noteOp, reportOf, cylinderSeams, sphereSeam, tableSeams } from '../labs/uv-unwrapping/stages.js';
import { box, windingOk } from '../labs/editmode/em.js';

test('meshes are closed and wound outwards', () => {
  for (const [k, make] of Object.entries(U.MESHES)) { const m = make(); assert.ok(windingOk(m), k); }
});
test('a box net unwraps flat in one island', () => {
  const m = box(), r = U.report(m, U.unwrap(m, U.resetUV(m), U.allFaces(m), U.crossSeams(m)));
  assert.equal(r.islands, 1); assert.equal(r.overlaps, 0); assert.ok(r.maxArea < 1e-3 && r.maxShape < 1e-3); assert.equal(r.outside, 0);
});
test('a closed cube cannot be solved: the faces collapse', () => {
  const m = box(), all = U.allFaces(m);
  assert.equal(U.closedIslands(m, [], all).length, 1);
  assert.equal(U.closedIslands(m, U.crossSeams(m), all).length, 0);
  assert.equal(U.report(m, U.unwrap(m, U.resetUV(m), all, [])).collapsed, 6);
});
test('cylinder with rim loops and one seam gives three flat islands', () => {
  const m = U.cylinder(), s = cylinderSeams(m);
  assert.equal(s.length, 33);
  const r = U.report(m, U.unwrap(m, U.resetUV(m), U.allFaces(m), s));
  assert.equal(r.islands, 3); assert.ok(r.maxShape < 1e-3);
});
test('reset overlaps every face; pack separates them', () => {
  const m = box(), uv = U.resetUV(m);
  assert.equal(U.report(m, uv).overlaps, 6);
  const p = U.pack(m, uv, U.allFaces(m), { margin: 0.02 }), r = U.report(m, p);
  assert.equal(r.overlaps, 0); assert.equal(r.outside, 0);
});
test('cylinder projection: side upright only when aligned to the object', () => {
  const m = U.cylinder(), side = [...Array(16).keys()];
  const tilted = { r: [0.8, -0.6, 0], u: [0.2, 0.27, 0.94], f: [0.56, 0.75, -0.35] };
  const a = U.cylinderProject(m, U.resetUV(m), side, { direction: 'object' });
  const b = U.cylinderProject(m, U.resetUV(m), side, { direction: 'equator', view: tilted });
  const up = uv => side.every(fi => Math.abs(uv[fi][0][0] - uv[fi][3][0]) < 0.01);
  assert.ok(up(a)); assert.ok(!up(b));
  assert.ok(Math.abs(U.report(m, a, side).maxShape - (1 - 1 / Math.PI)) < 0.02);
});
test('sphere projection pinches at the poles; a seam unwrap stays flat', () => {
  const m = U.MESHES.sphere(), r = U.report(m, U.sphereProject(m, U.resetUV(m), U.allFaces(m), { direction: 'object' }));
  assert.ok(r.maxArea > 0.3); assert.equal(r.collapsed, 0);
  assert.equal(sphereSeam(m).length, 8);
  assert.equal(U.report(m, U.unwrap(m, U.resetUV(m), U.allFaces(m), sphereSeam(m))).flipped, 0);
});
test('smart UV: a lower angle limit gives more islands', () => {
  const m = U.MESHES.sphere(), f = U.allFaces(m);
  const n = a => U.report(m, U.smartProject(m, U.resetUV(m), f, { angle: a })).islands;
  assert.ok(n(20) > n(66)); assert.equal(U.report(m, U.smartProject(m, U.resetUV(m), f, {})).overlaps, 0);
});
test('average islands scale evens the texel density', () => {
  const m = U.table(), f = U.allFaces(m);
  let uv = U.unwrap(m, U.resetUV(m), f, tableSeams(m));
  U.uvIslands(m, uv, f).forEach((I, i) => { uv = U.transformUV(uv, I, { s: [1 + i, 1 + i] }); });
  assert.ok(U.report(m, uv).densityCV > 0.3);
  assert.ok(U.report(m, U.averageScale(m, uv, f)).densityCV < 0.01);
});
test('project from view: straight on is square, at an angle it is skewed', () => {
  const m = box();
  const front = U.projectFromView(m, U.resetUV(m), [2], { r: [1, 0, 0], u: [0, 0, 1], f: [0, 1, 0] });
  const s = Math.SQRT1_2, side = U.projectFromView(m, U.resetUV(m), [2], { r: [s, s, 0], u: [0, 0, 1], f: [-s, s, 0] });
  assert.ok(U.report(m, front, [2]).maxShape < 1e-6); assert.ok(U.report(m, side, [2]).maxShape > 0.2);
});
test('object scale: unwrap ignores it, so the UVs stretch until the scale is applied', () => {
  const m = box(), uv = U.unwrap(m, U.resetUV(m), U.allFaces(m), U.crossSeams(m));
  assert.ok(U.report(m, uv, U.allFaces(m), [2, 1, 1]).maxShape > 0.3);
});
test('every step starts unsolved and its solution passes', () => {
  for (const stage of STAGES) for (const step of stage.steps) {
    const s = startState(step);
    assert.equal(!!step.check(s), false, `${step.id} starts done`);
    step.solve(s);
    assert.equal(!!step.check(s), true, `${step.id} solution fails`);
    JSON.parse(JSON.stringify(s));
  }
});
test('noteOp records the steps flags', () => {
  const s = startState(STAGES[3].steps[0]);
  noteOp(s, 'smart', { angle: 30, margin: 0 }); noteOp(s, 'smart', { angle: 89, margin: 0.03 });
  assert.deepEqual(s.flags.angles, [30, 89]); assert.equal(s.flags.smartMargin, 0.03);
  void reportOf;
});
test('Minimum Stretch evens out the area of a sphere unwrap', () => {
  const m = U.MESHES.sphere(), f = U.allFaces(m), s = sphereSeam(m);
  const a = U.report(m, U.unwrap(m, U.resetUV(m), f, s, { method: 'angle' })), b = U.report(m, U.unwrap(m, U.resetUV(m), f, s, { method: 'minimum' }));
  assert.ok(b.avgArea < a.avgArea); assert.equal(b.flipped, 0);
});
test('Lightmap Pack gives every face its own island, without overlaps', () => {
  const m = U.house(), r = U.report(m, U.lightmapPack(m, U.resetUV(m), U.allFaces(m)));
  assert.equal(r.islands, m.f.length); assert.equal(r.overlaps, 0); assert.equal(r.outside, 0);
});
test('Follow Active Quads unrolls the side of a cylinder from one good quad', () => {
  const m = U.cylinder(), side = [...Array(16).keys()];
  const uv = U.resetUV(m), w = 2 * Math.sin(Math.PI / 16) / 10;
  uv[0] = [[0, 0], [w, 0], [w, 0.2], [0, 0.2]];
  const r = U.report(m, U.followActiveQuads(m, uv, side, 0), side);
  assert.equal(r.islands, 1); assert.ok(r.maxShape < 0.02); assert.equal(r.flipped, 0);
  assert.equal(U.followActiveQuads(m, uv, side, 16), null);
});
