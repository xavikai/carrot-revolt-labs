import { test } from 'node:test';
import assert from 'node:assert/strict';
import { key, recalcHandles, evaluate, moveHandle, contacts, tops, hangTime, matchScore, sharpContact } from '../labs/animation/fcurve.js';
import { STAGES, startData, REFERENCE } from '../labs/animation/stages.js';

const curve = (pts, interp = 'BEZIER', handle = 'AUTO_CLAMPED') => recalcHandles(pts.map(([f, v]) => key(f, v, interp, handle)));

test('linear, constant and bezier interpolation, constant outside the keys', () => {
  const lin = curve([[1, 0], [11, 10]], 'LINEAR');
  assert.equal(evaluate(lin, 6), 5);
  assert.equal(evaluate(lin, -5), 0);
  assert.equal(evaluate(lin, 50), 10);
  const con = curve([[1, 0], [11, 10]], 'CONSTANT');
  assert.equal(evaluate(con, 10.9), 0);
  const bez = curve([[1, 0], [11, 10]]);
  assert.ok(Math.abs(evaluate(bez, 6) - 5) < 1e-6, 'symmetric ease: half way at the middle');
  assert.ok(evaluate(bez, 2) < 1, 'eases in');
});

test('Auto Clamped handles are flat at peaks and contacts; Vector handles point at the neighbours', () => {
  const k = curve([[1, 4], [13, 0], [21, 2]]);
  assert.equal(k[1].left.value, 0); assert.equal(k[1].right.value, 0);
  assert.equal(sharpContact(k, k[1]), false);
  k[1].handle = 'VECTOR'; recalcHandles(k);
  assert.ok(k[1].left.value > 1 && k[1].right.value > 0.5);
  assert.equal(sharpContact(k, k[1]), true);
});

test('dragging an automatic handle makes it Aligned and keeps the other side in line', () => {
  const k = curve([[1, 0], [11, 4], [21, 0]]);
  moveHandle(k[1], 'right', 16, 5);
  assert.equal(k[1].handle, 'ALIGNED');
  const a = Math.atan2(k[1].right.value - 4, k[1].right.frame - 11), b = Math.atan2(4 - k[1].left.value, 11 - k[1].left.frame);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('bounce analysis: contacts, tops, hang time and match with a real bounce', () => {
  const k = curve([[1, 4], [13, 0], [21, 2], [29, 0]]);
  assert.deepEqual(contacts(k), [13, 29]);
  assert.deepEqual(tops(k).map(t => t.frame), [1, 21]);
  assert.ok(hangTime(k, 13, 29) > 0.2);
  assert.ok(REFERENCE(13) < 0.01 && Math.abs(REFERENCE(1) - 4) < 1e-9);
  assert.ok(matchScore(curve([[1, 4], [13, 0], [20, 1.44], [27, 0]], 'LINEAR'), REFERENCE, 1, 60) < 94);
});

test('every step starts unsolved and its solution solves it', () => {
  for (const st of STAGES) st.steps.forEach((step, i) => {
    assert.equal(step.check(startData(st, i)), false, `${st.id} ${step.id} is already solved at the start`);
    const d = startData(st, i);
    if (st.independent) step.solve(d); else for (let j = 0; j <= i; j++) st.steps[j].solve(d);
    assert.equal(step.check(d), true, `${st.id} ${step.id} solution`);
  });
});

test('rotation stage: the ball rolls with its travel', async () => {
  const { STAGES, startData, rollReport, rollAngle } = await import('../labs/animation/stages.js');
  const st = STAGES.find(s => s.id === 'rotation');
  assert.ok(Math.abs(rollAngle(Math.PI) - 360) < 1e-9);
  st.steps.forEach((s, i) => {
    const d = startData(st, i);
    assert.equal(!!s.check(d), false, `${s.id} starts solved`);
    s.solve(d); assert.equal(!!s.check(d), true, `${s.id} solution fails`);
  });
  const back = startData(st, 0); assert.equal(rollReport(back).backwards, true);
});
