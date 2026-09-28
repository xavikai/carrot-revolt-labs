import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, startData, CHANNELS } from '../labs/3ds-max-animation/stages.js';
import commonDictionary from '../labs/animation/i18n.js';
import maxDictionary from '../labs/3ds-max-animation/max-i18n.js';

test('Max bouncing-ball stages have working start states and solutions', () => {
  assert.deepEqual(STAGES.map(stage => stage.id), ['timing', 'squash', 'weight', 'rotation', 'free']);
  for (const stage of STAGES) stage.steps.forEach((step, i) => {
    const starting = startData(stage, i);
    assert.equal(Boolean(step.check(starting)), false, `${stage.id}/${step.id} starts unfinished`);
    const solved = startData(stage, i);
    if (stage.independent) step.solve(solved);
    else for (let j = 0; j <= i; j++) stage.steps[j].solve(solved);
    assert.equal(Boolean(step.check(solved)), true, `${stage.id}/${step.id} can be completed`);
  });
});

test('Max free animation makes every controller track available', () => {
  const free = STAGES.at(-1);
  assert.equal(free.free, true);
  assert.deepEqual(free.channels, ['locX', 'locZ', 'topZ', 'botZ', 'rotY']);
  assert.deepEqual(free.hide, []);
  assert.deepEqual(Object.keys(startData(free).channels), free.channels);
  const first = startData(free);
  first.channels.rotY[0].value = 90;
  assert.equal(startData(free).channels.rotY[0].value, 0);
});

test('Max lesson uses Position and Rotation controllers and every step has Catalan and Spanish text', () => {
  assert.equal(CHANNELS.locZ.name, 'Z Position');
  assert.equal(CHANNELS.rotY.name, 'Y Rotation');
  const dictionary = { ...commonDictionary, ...maxDictionary };
  for (const stage of STAGES) for (const step of stage.steps) {
    for (const line of [step.title, step.text, step.why, ...step.how]) {
      assert.ok(dictionary[line]?.ca, `Missing Catalan: ${line}`);
      assert.ok(dictionary[line]?.es, `Missing Spanish: ${line}`);
    }
  }
});
