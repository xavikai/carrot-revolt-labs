import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blank, brush, combine, covered, score, shapeMask, solved, startingState } from '../labs/photoshop/core.js';

test('every Photoshop exercise starts incomplete and has a reachable result', () => {
  const targets = { s_rect: 'card', s_ellipse: 'plate', s_lasso: 'pennant', s_object: 'mug', s_quick: 'mug' };
  for (const [id, shape] of Object.entries(targets)) {
    const s = startingState(id);
    assert.equal(solved(id, s), false, `${id} should start incomplete`);
    s.selection = shapeMask(shape);
    assert.equal(solved(id, s), true, `${id} should accept its target`);
  }
  const create = startingState('m_create');
  assert.equal(solved('m_create', create), false);
  create.mask = create.selection.slice(); create.selection = blank(); create.maskCreated = true;
  assert.equal(solved('m_create', create), true);
  const hide = startingState('m_hide');
  assert.equal(solved('m_hide', hide), false);
  hide.mask = brush(hide.mask, 455, 104, 24, 0); hide.maskPainted = true;
  assert.equal(solved('m_hide', hide), true);
  const restore = startingState('m_restore');
  assert.equal(solved('m_restore', restore), false);
  restore.mask = brush(restore.mask, 334, 224, 30, 255); restore.maskPainted = true;
  assert.equal(solved('m_restore', restore), true);
  const inspect = startingState('m_inspect');
  assert.equal(solved('m_inspect', inspect), false);
  inspect.maskViewed = true; inspect.viewMask = false;
  assert.equal(solved('m_inspect', inspect), true);
});

test('quick selection can subtract the plate without losing the mug', () => {
  const s = startingState('s_quick');
  assert.ok(covered(s.selection, 516, 142) > .95);
  assert.ok(covered(s.selection, 330, 210) > .95);
  s.selection = combine(s.selection, shapeMask('plate'), 'subtract');
  assert.ok(score(s.selection, shapeMask('mug')) > .95);
  assert.equal(solved('s_quick', s), true);
});

test('selection intersection retains only shared pixels', () => {
  const both = combine(shapeMask('mug'), shapeMask('plate'), 'add');
  const shared = combine(both, shapeMask('plate'), 'intersect');
  assert.ok(score(shared, shapeMask('plate')) > .99);
  assert.ok(covered(shared, 330, 210) < .05);
});

test('mask brush changes only the intended region', () => {
  const original = shapeMask('mug');
  const cut = brush(original, 334, 224, 25, 0);
  assert.ok(covered(cut, 334, 224) < .1);
  assert.ok(covered(cut, 309, 170) > .9);
  const restored = brush(cut, 334, 224, 26, 255);
  assert.ok(covered(restored, 334, 224) > .9);
  assert.ok(score(restored, original) > .98);
});
