import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLesson, track, valueAt, addKey, moveKeys, moveGraphKey, setTangent, checkLesson } from '../labs/3ds-max-track-view/model.js';

test('each Track View exercise starts unfinished and can be completed with its actual controls', () => {
  const timeline = createLesson('timeline');
  assert.equal(checkLesson('timeline', timeline), false);
  addKey(timeline, 'x', 15, 5);
  assert.equal(checkLesson('timeline', timeline), true);

  const curves = createLesson('curves');
  assert.equal(checkLesson('curves', curves), false);
  const middle = track(curves, 'x')[1];
  moveGraphKey(curves, middle.id, 30, 7);
  setTangent(curves, [middle.id], 'smooth');
  assert.equal(checkLesson('curves', curves), true);

  const dope = createLesson('dope');
  assert.equal(checkLesson('dope', dope), false);
  assert.equal(moveKeys(dope, [track(dope, 'rotation')[1].id], -6), true);
  assert.equal(moveKeys(dope, [track(dope, 'scale')[1].id], 15, true), true);
  assert.equal(checkLesson('dope', dope), true);

  const loops = createLesson('loops');
  assert.equal(checkLesson('loops', loops), false);
  loops.out = 'loop';
  assert.equal(checkLesson('loops', loops), false);
  assert.equal(checkLesson('loops', loops, 60), true);
});

test('Dope Sheet moves time, duplicates with Shift, and rejects occupied frames', () => {
  const scene = createLesson('dope'), key = track(scene, 'rotation')[1];
  assert.equal(key.value, 90);
  assert.equal(moveKeys(scene, [key.id], -6), true);
  assert.equal(key.frame, 24);
  assert.equal(key.value, 90);
  assert.equal(moveKeys(scene, [key.id], 10, true), true);
  assert.deepEqual(track(scene, 'rotation').map(k => k.frame), [0, 24, 34, 60]);
  assert.equal(moveKeys(scene, [key.id], -24, false), false);
  assert.equal(key.frame, 24);
});

test('interpolation and out-of-range types have distinct results', () => {
  const scene = createLesson('loops');
  assert.equal(valueAt(scene, 'rotation', 25), 360);
  scene.out = 'cycle';
  assert.equal(valueAt(scene, 'rotation', 25), 90);
  scene.out = 'loop';
  assert.equal(valueAt(scene, 'rotation', 25), 450);
  assert.equal(valueAt(scene, 'rotation', 60), 1080);
  scene.out = 'pingpong';
  assert.equal(valueAt(scene, 'rotation', 25), 270);

  const curves = createLesson('curves');
  const first = track(curves, 'x')[0];
  setTangent(curves, [first.id], 'step');
  assert.equal(valueAt(curves, 'x', 10), 0);
  setTangent(curves, [first.id], 'linear');
  assert.ok(valueAt(curves, 'x', 10) > 0);
});
