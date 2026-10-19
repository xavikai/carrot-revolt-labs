import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERAS, CUES, PLAN_ROLES, planIsCorrect, cueResult, cameraHasSubject } from '../labs/runway-live/core.js';

test('five distinct jobs keep a presenter feed and a wide safety feed', () => {
  assert.equal(CAMERAS.length, 5);
  assert.equal(new Set(PLAN_ROLES).size, 5);
  assert.equal(planIsCorrect(PLAN_ROLES), true);
  assert.equal(planIsCorrect([PLAN_ROLES[1], PLAN_ROLES[0], ...PLAN_ROLES.slice(2)]), false);
  CUES.forEach((_, i) => assert.equal(cameraHasSubject(1, i), true));
  CUES.forEach((cue, i) => { if (cue.position) assert.equal(cameraHasSubject(2, i), true); });
});

test('route enters and leaves stage left, visits the T center and end, then returns to presenter', () => {
  assert.deepEqual(CUES.map(c => c.id), ['intro', 'entry', 'center', 'outbound', 'tilt', 'turn', 'return', 'exit', 'outro']);
  assert.deepEqual(CUES[1].position, CUES[7].position);
  assert.deepEqual(CUES[4].position, CUES[5].position);
  assert.equal(CUES[0].preferred, 1);
  assert.equal(CUES.at(-1).preferred, 1);
});

test('every suggested camera sees the subject and the center tilt must finish', () => {
  CUES.forEach((cue, i) => {
    assert.equal(cameraHasSubject(cue.preferred, i), true);
    assert.equal(cueResult(i, cue.preferred, true).ok, true);
  });
  assert.deepEqual(cueResult(4, 3, false), { ok: false, reason: 'sweep' });
  assert.deepEqual(cueResult(4, 2, true), { ok: false, reason: 'camera' });
  assert.equal(cueResult(1, 2).ok, true); // wide shot is a valid safe alternative.
});
