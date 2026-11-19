import test from 'node:test';
import assert from 'node:assert/strict';
import { displayByte, hexToLinear, mathValue, mixColor } from '../labs/_procedural/core.js';
import { groups as mathGroups, recipes as mathRecipes } from '../labs/blender-math/content.js';
import { groups as mixGroups, recipes as mixRecipes } from '../labs/blender-mix-color/content.js';

test('Math covers every selectable operation and recipe', () => {
  const modes = Object.keys(Object.assign({}, ...Object.values(mathGroups)));
  assert.equal(modes.length, 41);
  for (const mode of modes) assert.ok(Number.isFinite(mathValue(mode, 0.35, 0.5, 0.2)), mode);
  for (const recipe of mathRecipes) assert.ok(modes.includes(recipe.mode), recipe.mode);
});

test('negative coordinates retain their distinct rounding and repetition behavior', () => {
  assert.equal(mathValue('Floor', -0.25), -1);
  assert.equal(mathValue('Truncate', -0.25), -0);
  assert.equal(mathValue('Fraction', -0.25), 0.75);
  assert.equal(mathValue('Truncated Modulo', -0.25, 1), -0.25);
  assert.equal(mathValue('Floored Modulo', -0.25, 1), 0.75);
  assert.equal(mathValue('Wrap', 2, 2, -1), -1);
  assert.equal(mathValue('Ping-Pong', 2.5, 2), 1.5);
});

test('threshold, domain guards and Math Clamp precede texture display', () => {
  assert.equal(mathValue('Compare', 0.5, 0.75, 0.25), 1);
  assert.equal(mathValue('Greater Than', 0.5, 0.5), 0);
  assert.equal(mathValue('Divide', 1, 0), 0);
  assert.equal(mathValue('Inverse Square Root', 0), 0);
  assert.ok(mathValue('Smooth Minimum', 0.5, 0.5, 0.6) < 0.5);
  assert.ok(mathValue('Smooth Maximum', 0.5, 0.5, 0.6) > 0.5);
  assert.equal(mathValue('Multiply Add', 1, 2, 0.4, true), 1);
});

test('Mix Color covers every selectable mode and recipe', () => {
  const modes = Object.keys(Object.assign({}, ...Object.values(mixGroups)));
  assert.equal(modes.length, 19);
  for (const mode of modes) {
    const pixel = mixColor(mode, [0.2, 0.4, 0.6], [0.6, 0.4, 0.2], 0.3, false, false);
    assert.ok(pixel.every(Number.isFinite), mode);
  }
  for (const recipe of mixRecipes) assert.ok(modes.includes(recipe.mode), recipe.mode);
});

test('Clamp Factor, Clamp Result and blend-specific behavior remain independent', () => {
  const a = [0.75, 0.25, 0.5];
  const b = [0.5, 0.25, 0];
  assert.deepEqual(mixColor('Add', a, b, 2, false, false), [1.75, 0.75, 0.5]);
  assert.deepEqual(mixColor('Add', a, b, 2, true, false), [1.25, 0.5, 0.5]);
  assert.deepEqual(mixColor('Add', a, b, 2, false, true), [1, 0.75, 0.5]);
  assert.deepEqual(mixColor('Divide', a, b, 1, true, false), [1.5, 1, 0.5]);
  assert.deepEqual(mixColor('Overlay', a, [0.5, 0.5, 0.5], 1, true, false), a);
});

test('HSV component transfers and sRGB conversion use linear channel values', () => {
  const a = [0.5, 0.25, 0];
  assert.deepEqual(mixColor('Hue', a, [0, 0, 1], 1, true, false), [0, 0, 0.5]);
  assert.deepEqual(mixColor('Value', a, [0.25, 0, 0], 1, true, false), [0.25, 0.125, 0]);
  assert.deepEqual(mixColor('Color', a, [0.5, 0.5, 0.5], 1, true, false), a);
  assert.deepEqual(mixColor('Saturation', [0.5, 0.5, 0.5], [1, 0, 0], 1, true, false), [0.5, 0.5, 0.5]);
  assert.equal(displayByte(0.5), 188);
  assert.ok(Math.abs(hexToLinear('#808080')[0] - 0.21586) < 0.00001);
});
