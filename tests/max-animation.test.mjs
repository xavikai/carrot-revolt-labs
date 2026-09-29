import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, startData, CHANNELS, shape } from '../labs/3ds-max-animation/stages.js';
import commonDictionary from '../labs/animation/i18n.js';
import maxDictionary from '../labs/3ds-max-animation/max-i18n.js';

test('Max bouncing-ball stages have working start states and solutions', () => {
  assert.deepEqual(STAGES.map(stage => stage.id), ['timing', 'weight', 'rotation', 'squash', 'free']);
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
  assert.deepEqual(free.channels, ['locX', 'locZ', 'ctrl_pilota.sx', 'ctrl_pilota.sy', 'ctrl_pilota.sz', 'topZ', 'botZ', 'rotY']);
  assert.deepEqual(free.hide, []);
  assert.deepEqual(Object.keys(startData(free).channels), free.channels);
  const first = startData(free);
  first.channels.rotY[0].value = 90;
  assert.equal(startData(free).channels.rotY[0].value, 0);
  for (const a of ['sx', 'sy', 'sz']) first.channels[`ctrl_pilota.${a}`][0].value = 200;
  assert.ok(Math.abs(shape(first, 1).sx - 2) < 1e-9);
  assert.ok(Math.abs(shape(first, 1).sz - 2) < 1e-9);
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

test('Max rig: every control has nine Transform tracks and the bone follows ctrl_top and ctrl_bottom', async () => {
  const { CONTROLS, tracksOf, rigPose, restValue } = await import('../labs/3ds-max-animation/rig.js');
  for (const c of CONTROLS) assert.equal(tracksOf(c).length, 9);
  const at = over => rigPose(id => over[id] ?? restValue(id));
  const rest = at({});
  assert.deepEqual(rest.ball.center.map(v => +v.toFixed(6)), [0, 0, 0.5]);
  assert.ok(Math.abs(rest.ball.bottom) < 1e-9);
  const squash = at({ topZ: -0.4 });
  assert.ok(Math.abs(squash.ball.sz - 0.6) < 1e-9 && squash.ball.sx > 1, 'squash keeps the volume');
  const tilted = at({ 'ctrl_top.px': 0.5 });
  assert.ok(tilted.bone.dir[0] > 0.3, 'moving ctrl_top sideways bends the bone');
  const moved = at({ 'ctrl_master.px': 2, locZ: 1 });
  assert.ok(Math.abs(moved.ball.center[0] - 2) < 1e-9 && Math.abs(moved.ball.bottom - 1) < 1e-9, 'ctrl_pilota is linked to ctrl_master');
  const turned = at({ 'ctrl_master.rz': 90, locX: 1 });
  assert.ok(Math.abs(turned.pilota.o[1] - 1) < 1e-9, 'rotating ctrl_master turns the child position');
});
