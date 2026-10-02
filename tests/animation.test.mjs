import { test } from 'node:test';
import assert from 'node:assert/strict';
import { key, recalcHandles, evaluate, moveHandle, contacts, tops, hangTime, matchScore, sharpContact } from '../labs/animation/fcurve.js';
import { STAGES, startData, REFERENCE, shape } from '../labs/animation/stages.js';

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

test('free animation opens every rig curve in an independent starting scene', () => {
  const free = STAGES.at(-1);
  assert.equal(free.id, 'free');
  assert.equal(free.free, true);
  assert.deepEqual(free.channels, ['locX', 'locZ', 'scale', 'topZ', 'botZ', 'rotY']);
  assert.deepEqual(free.hide, []);
  assert.deepEqual(Object.keys(startData(free).channels), free.channels);
  const first = startData(free);
  first.channels.locZ[0].value = 0;
  assert.equal(startData(free).channels.locZ[0].value, 4);
  assert.equal(shape(startData(free), 0).sx, 1);
  first.channels.scale[0].value = 2;
  assert.equal(shape(first, 0).sx, 2);
});

test('stages follow the class: keys every 10 frames, timing, travel, rotation, squash & stretch, then extras', async () => {
  const { STAGES, startData, RANGE, rollReport, rollAngle, travelReport, TRAVEL_END } = await import('../labs/animation/stages.js');
  assert.deepEqual(STAGES.map(s => s.id), ['keys', 'timing', 'travel', 'rotation', 'squash', 'weight', 'free']);
  assert.deepEqual(RANGE, [0, 100]);
  const solved = id => { const st = STAGES.find(s => s.id === id), d = startData(st); st.steps.forEach(s => s.solve(d)); return d; };
  assert.deepEqual(solved('keys').channels.locZ.map(k => k.frame), [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(contacts(solved('timing').channels.locZ), [10, 28, 43, 56, 67, 73]);
  assert.deepEqual(tops(solved('timing').channels.locZ).map(k => k.frame), [0, 20, 36, 50, 62, 70]);
  const tr = travelReport(solved('travel'));
  assert.equal(tr.end, TRAVEL_END); assert.ok(tr.flat && tr.easeOut);
  const linear = startData(STAGES.find(s => s.id === 'travel')); linear.channels.locX = curve([[0, 0], [73, 9]], 'LINEAR');
  assert.equal(STAGES.find(s => s.id === 'travel').steps[0].check(linear), false, 'a linear travel stops dead');
  assert.ok(Math.abs(rollAngle(Math.PI) - 360) < 1e-9);
  const rot = STAGES.find(s => s.id === 'rotation'), d = startData(rot);
  rot.steps[0].solve(d); assert.ok(rollReport(d).endErr < 0.01, 'turns as much as the travel by frame 73');
  d.channels.rotY.push(key(99, 900)); recalcHandles(d.channels.rotY);
  assert.equal(rot.steps[1].check(d), false, 'turning backwards at the end fails');
});
