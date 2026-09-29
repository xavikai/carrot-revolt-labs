import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTKEYS, TV_TOOLS, showKeys } from '../labs/_max/max-shell.js';
import { ICONS } from '../labs/_max/max-icons.js';
import { createLesson, track, setTangent, tangentName } from '../labs/3ds-max-track-view/model.js';

test('3ds Max default hotkeys: the ones students use most', () => {
  const act = k => HOTKEYS.find(h => h.keys === k)?.action;
  assert.equal(act('w'), 'move'); assert.equal(act('e'), 'rotate'); assert.equal(act('r'), 'scale'); assert.equal(act('q'), 'select');
  assert.equal(act('n'), 'autoKey'); assert.equal(act("'"), 'setKeyMode'); assert.equal(act('k'), 'setKey');
  assert.equal(act('/'), 'play'); assert.equal(act(' '), 'selectionLock', 'Space is Selection Lock in Max, not play');
  assert.equal(act(','), 'prevFrame'); assert.equal(act('.'), 'nextFrame'); assert.equal(act('home'), 'goStart'); assert.equal(act('end'), 'goEnd');
  assert.equal(act('alt+w'), 'maximize'); assert.equal(act('h'), 'selectByName'); assert.equal(act('ctrl+z'), 'undo');
  assert.equal(act('f5'), 'axisX'); assert.equal(act('f7'), 'axisZ'); assert.equal(act('shift+h'), 'hideHelpers');
  assert.equal(new Set(HOTKEYS.map(h => h.keys)).size, HOTKEYS.length, 'no key is bound twice');
  assert.equal(showKeys(HOTKEYS.find(h => h.action === 'maximize')), 'Alt+W');
});

test('every toolbar button has an icon', () => {
  for (const t of TV_TOOLS) if (t !== '|') assert.ok(ICONS[t[1]], t[1]);
  for (const name of ['undo', 'redo', 'move', 'rotate', 'scale', 'selectObject', 'play', 'stop', 'setKeyBig', 'timeConfig', 'curveEditor', 'tabCreate', 'tabModify', 'tabHierarchy', 'tabMotion', 'tabDisplay', 'tabUtilities']) assert.ok(ICONS[name], name);
});

test('Track View Lab: 3ds Max tangent types', () => {
  const s = createLesson('curves'), k = track(s, 'x')[1];
  for (const [type, name] of [['auto', 'Auto'], ['smooth', 'Smooth'], ['fast', 'Fast'], ['slow', 'Slow'], ['spline', 'Spline'], ['step', 'Step'], ['linear', 'Linear']]) {
    setTangent(s, [k.id], type);
    assert.equal(tangentName(k), name, type);
  }
  setTangent(s, [k.id], 'slow');
  assert.equal(k.left.value, k.value); assert.equal(k.right.value, k.value);
});

test('out-of-range types repeat a curve after its last key', async () => {
  const { evalOutOfRange } = await import('../labs/_max/out-of-range.js');
  const keys = [{ frame: 0, value: 0 }, { frame: 10, value: 10 }], lin = f => Math.max(0, Math.min(10, f)); // a ramp that holds outside the keys, like the curve evaluator
  const at = (f, out) => evalOutOfRange(keys, f, lin, { in: 'constant', out });
  assert.equal(at(15, 'constant'), 10);
  assert.equal(at(15, 'cycle'), 5);
  assert.equal(at(15, 'pingpong'), 5);
  assert.equal(at(12, 'pingpong'), 8);
  assert.equal(at(25, 'relative'), 25);
  assert.ok(Math.abs(at(20, 'linear') - 20) < 1e-9);
  assert.ok(at(19.9, 'loop') < 5, 'Loop blends back towards the first value');
  assert.equal(evalOutOfRange(keys, -5, lin, { in: 'cycle' }), 5);
});

test('Animation Lab tracks use their out-of-range types', async () => {
  const { chanValue } = await import('../labs/3ds-max-animation/stages.js');
  const { key, recalcHandles } = await import('../labs/3ds-max-animation/fcurve.js');
  const ks = recalcHandles([key(1, 0, 'LINEAR'), key(11, 4, 'LINEAR')]);
  assert.equal(chanValue(ks, 20), 4);
  assert.ok(Math.abs(chanValue(ks, 16, { in: 'constant', out: 'cycle' }) - 2) < 1e-6);
  assert.ok(Math.abs(chanValue(ks, 16, { in: 'constant', out: 'pingpong' }) - 2) < 1e-6);
  assert.ok(Math.abs(chanValue(ks, 21, { in: 'constant', out: 'relative' }) - 8) < 1e-6);
});
