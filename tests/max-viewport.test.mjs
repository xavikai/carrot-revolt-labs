import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, steps, startState, ghostMatch, rotDiff } from '../labs/3ds-max-viewport/stages.js';
import { buildMesh, defaults, deform, newMod, cleanParam, bounds } from '../labs/3ds-max-viewport/prims.js';
import * as SC from '../labs/3ds-max-viewport/scene.js';

test('every step starts unsolved and its solution solves it', () => {
  for (const step of steps) {
    if (step.free) continue;
    const s = startState(step);
    assert.equal(step.check(s), false, `${step.id} starts solved`);
    step.solve(s);
    assert.equal(step.check(s), true, `${step.id} solution fails`);
  }
});
test('primitives: 3ds Max pivots and faces pointing out', () => {
  const b = bounds(buildMesh('Box', { ...defaults('Box'), height: 2 }).verts);
  assert.deepEqual(b.lo, [-0.5, -0.5, 0]); assert.deepEqual(b.hi, [0.5, 0.5, 2]);             // Box: pivot on the base centre
  const s = bounds(buildMesh('Sphere', defaults('Sphere')).verts); assert.ok(Math.abs(s.lo[2] + 0.5) < 1e-9); // Sphere: pivot in the centre
  for (const t of ['Box', 'Sphere', 'Cylinder', 'Cone']) {
    const m = buildMesh(t, defaults(t)), c = m.verts.reduce((a, v) => a.map((x, i) => x + v[i] / m.verts.length), [0, 0, 0]);
    for (const [i, j, k] of m.tris) { const A = m.verts[i], B = m.verts[j], C = m.verts[k], u = B.map((x, q) => x - A[q]), v = C.map((x, q) => x - A[q]); const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const mid = [0, 1, 2].map(q => (A[q] + B[q] + C[q]) / 3 - c[q]); assert.ok(n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] > -1e-9, `${t} face points in`); }
  }
  assert.equal(cleanParam('Box', 'hsegs', 3.6), 4); assert.equal(cleanParam('Sphere', 'segs', 1), 4);
});
test('Bend needs segments: with one height segment the column stays straight', () => {
  const bend = { ...newMod('Bend'), angle: 90 };
  const one = buildMesh('Cylinder', { ...defaults('Cylinder'), height: 3, hsegs: 1 }, [bend]), many = buildMesh('Cylinder', { ...defaults('Cylinder'), height: 3, hsegs: 16 }, [bend]);
  const midX = m => { const top = m.verts.filter(v => Math.abs(v[2] - Math.max(...m.verts.map(w => w[2]))) < 1e-6); return top.length; };
  assert.ok(midX(one) > 0);
  // a 90° bend of a 3 m column: the top ends near x = 2 × 3 / π, at the height 2 × 3 / π too
  const R = 3 / (Math.PI / 2), axis = many.verts.filter(v => Math.abs(v[1]) < 1e-6);
  assert.ok(Math.abs(Math.max(...axis.map(v => v[0])) - R) < 0.35);
  const straight = deform([[0, 0, 0], [0, 0, 3]], [bend]); assert.ok(Math.abs(straight[1][0] - R) < 1e-9 && Math.abs(straight[1][2] - R) < 1e-9);
});
test('instances share the object, copies do not; a reference keeps its own modifiers', () => {
  const s = SC.emptyScene(), c = SC.addObject(s, 'Cylinder', {}, { name: 'Column001' });
  const [ins] = SC.cloneSelection(s, [c.id], 'instance', 1, () => {}), [cop] = SC.cloneSelection(s, [c.id], 'copy', 1, () => {}), [ref] = SC.cloneSelection(s, [c.id], 'reference', 1, () => {});
  SC.baseOf(s, c).params.radius = 0.4;
  assert.equal(SC.baseOf(s, SC.find(s, ins)).params.radius, 0.4);
  assert.equal(SC.baseOf(s, SC.find(s, ref)).params.radius, 0.4);
  assert.equal(SC.baseOf(s, SC.find(s, cop)).params.radius, 0.5);
  SC.find(s, ref).own.push(newMod('Twist'));
  assert.equal(SC.modsOf(s, c).length, 0); assert.equal(SC.modsOf(s, SC.find(s, ref)).length, 1);
  assert.ok(SC.makeUnique(s, ins)); SC.baseOf(s, c).params.radius = 0.2; assert.equal(SC.baseOf(s, SC.find(s, ins)).params.radius, 0.4);
});
test('Euler XYZ round trip, rotation about a centre, groups move their members', () => {
  for (const r of [[10, 20, 30], [90, 0, 0], [0, -45, 170]]) { const e = SC.eulerFromMat(SC.matFromEuler(r)); assert.ok(rotDiff('Box', r, e) < 1e-6); }
  const s = SC.emptyScene(); SC.addObject(s, 'Box', {}, { name: 'A', pos: [1, 0, 0] }); SC.addObject(s, 'Box', {}, { name: 'B', pos: [3, 0, 0] });
  SC.rotateBy(s, ['A'], [0, 0, 1], 90, [0, 0, 0]); assert.ok(Math.abs(SC.find(s, 'A').pos[1] - 1) < 1e-6);
  const g = SC.groupObjects(s, ['A', 'B'], 'G'); assert.equal(SC.pickTarget(s, 'B'), 'G');
  SC.moveBy(s, ['G'], [0, 2, 0]); assert.equal(SC.find(s, 'B').pos[1], 2);
  g.open = true; assert.equal(SC.pickTarget(s, 'B'), 'B');
  assert.deepEqual(SC.ungroup(s, 'G').sort(), ['A', 'B']); assert.equal(SC.find(s, 'G'), undefined);
});
test('Array: 10 × 2 posts with row offset', () => {
  const s = SC.emptyScene(); SC.addObject(s, 'Box', { length: 0.1, width: 0.1 }, { name: 'Post001' });
  const made = SC.arrayObject(s, 'Post001', { move: [0.5, 0, 0], count1: 10, dims: 2, count2: 2, move2: [0, 3, 0], mode: 'instance' });
  assert.equal(made.length, 19);
  assert.ok(s.objs.some(o => Math.abs(o.pos[0] - 4.5) < 1e-6 && Math.abs(o.pos[1] - 3) < 1e-6));
});
test('ghost matching knows what each shape shows', () => {
  const s = SC.emptyScene(); SC.addObject(s, 'Sphere', {}, { name: 'S', rot: [30, 40, 50] }); SC.addObject(s, 'Cylinder', {}, { name: 'C', rot: [0, 0, 77] });
  assert.ok(ghostMatch(s, { name: 'S', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] }).ok, 'a sphere turned any way fits');
  assert.ok(ghostMatch(s, { name: 'C', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] }).ok, 'a cylinder turned on its own axis fits');
  assert.ok(STAGES.length === 5);
});
