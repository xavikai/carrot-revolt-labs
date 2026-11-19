import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { displayByte, hexToLinear, mathValue, mixColor } from '../labs/_procedural/core.js';
import { groups as mathGroups, recipes as mathRecipes } from '../labs/blender-math/content.js';
import { groups as mixGroups, recipes as mixRecipes } from '../labs/blender-mix-color/content.js';
import { defaults, grayscaleSampler, imageMask, maskBounds, materialSampler, surfaceHeight, wearMask } from '../labs/blender-worn-paint/material.js';
import { shaderGraph } from '../labs/blender-worn-paint/recipe.js';

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

test('every stage connects existing output sockets to unique, compatible inputs', () => {
  for (let stage = 0; stage < 5; stage++) {
    const { nodes, edges } = shaderGraph(stage, defaults);
    const index = direction => new Map(nodes.flatMap(node =>
      node[direction].map(([id, , type]) => [node.id + '.' + id, type])));
    const inputs = index('inputs');
    const outputs = index('outputs');
    assert.equal(new Set(edges.map(([, to]) => to)).size, edges.length);
    for (const [from, to, phase] of edges) {
      assert.ok(phase <= stage);
      assert.ok(outputs.has(from), from);
      assert.ok(inputs.has(to), to);
      const maskPreview = stage === 0 && from === 'limit.mask' && to === 'bsdf.color';
      assert.ok(maskPreview || outputs.get(from) === inputs.get(to), from + ' → ' + to);
    }
  }
});

test('the final material fans one mask out to color, roughness and height', () => {
  const links = new Map(shaderGraph(4, defaults).edges.map(([from, to]) => [to, from]));
  assert.equal(links.get('mix.factor'), 'limit.mask');
  assert.equal(links.get('rough.factor'), 'limit.mask');
  assert.equal(links.get('depth.mask'), 'limit.mask');
  assert.equal(links.get('sum.grain'), 'grain.fac');
  assert.equal(links.get('sum.layer'), 'depth.height');
  assert.equal(links.get('bump.height'), 'sum.height');
  assert.equal(links.get('bsdf.normal'), 'bump.normal');
  assert.equal(links.get('bsdf.rough'), 'rough.result');
  assert.equal(links.get('bsdf.color'), 'mix.result');
  assert.equal(links.get('output.surface'), 'bsdf.bsdf');
});

test('a continuous mask exposes the lower primer while bump only affects lighting', () => {
  const [min, max] = maskBounds(defaults);
  assert.equal(wearMask(min, defaults, true), 0);
  assert.equal(wearMask(max, defaults, true), 1);
  assert.ok(Math.abs(wearMask(defaults.threshold, defaults, true) - 0.5) < 1e-12);
  assert.equal(wearMask(defaults.threshold, defaults, false), 0);
  assert.ok(Math.abs(surfaceHeight(1, 0, defaults.grain) - 0.10) < 1e-12);
  assert.equal(surfaceHeight(0, 0, defaults.grain), 0.65);
  const flat = { ...defaults, relief: false };
  assert.deepEqual(materialSampler(defaults, 4, 'color')(0.3, 0.5), materialSampler(flat, 4, 'color')(0.3, 0.5));
  assert.notDeepEqual(materialSampler(defaults, 4, 'material')(0.3, 0.5), materialSampler(flat, 4, 'material')(0.3, 0.5));
});

test('alternative sources rewire only the intended layer or signal', () => {
  function links(variant) {
    return new Map(shaderGraph(5, defaults, variant).edges.map(([from, to]) => [to, from]));
  }
  assert.equal(links('image').get('noise.vector'), 'coord.uv');
  assert.equal(links('image').get('limit.noise'), 'noise.color');
  assert.equal(links('voronoi').get('limit.noise'), 'noise.distance');
  assert.equal(links('ramp').get('limit.noise'), 'noise.fac');
  assert.equal(links('ramp').get('ramp.fac'), 'pigment.fac');
  assert.equal(links('ramp').get('mix.paint'), 'ramp.color');
  assert.equal(links('ramp').get('mix.factor'), 'limit.mask');
  for (const variant of ['noise', 'image', 'voronoi', 'ramp']) {
    assert.equal(links(variant).get('bsdf.normal'), 'bump.normal');
    assert.equal(links(variant).get('bsdf.rough'), 'rough.result');
  }
});

test('the image supplies the grayscale mask and the ramp changes only the pigment', () => {
  const sample = grayscaleSampler(Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1);
  assert.equal(sample(0.5, 0.5), 0.5);
  assert.equal(sample(2, 0.5), 1);
  const u = 0.38, v = 0.31;
  const value = wearMask(imageMask(u, v), defaults, true);
  assert.deepEqual(materialSampler(defaults, 5, 'mask', 'image')(u, v), [value, value, value]);
  assert.deepEqual(materialSampler(defaults, 5, 'mask', 'ramp')(u, v), materialSampler(defaults, 5, 'mask')(u, v));
  assert.notDeepEqual(materialSampler(defaults, 5, 'color', 'ramp')(u, v), materialSampler(defaults, 5, 'color')(u, v));
});

test('the downloadable project and the mask are shipped as binary assets', () => {
  const asset = name => readFileSync(new URL('../labs/blender-worn-paint/assets/' + name, import.meta.url));
  const project = asset('worn-paint.blend');
  const mask = asset('wear-mask.png');
  assert.ok(project.length > 50000);
  assert.equal(project.subarray(0, 4).toString('hex'), '28b52ffd'); // Blender compressed the project with Zstandard.
  assert.equal(mask.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});
