import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, startState, lightReport, sizeReport, seamOf, stainOf, repeatTogether, coverage, flat, wallReports, cornersOk } from '../labs/tileable/stages.js';
import { offset, seamReport, newImage, resize, crop, gaussianBlur, desaturate, invert, composite, unevenness, isPow2, dab, copyImage, paint, SEAM_OK } from '../labs/tileable/texture.js';
import { flatSquare, stones, N } from '../labs/tileable/bank.js';
import { solvedUV, packedUV, report, joins, WALLS } from '../labs/tileable/walls.js';

const steps = STAGES.flatMap(s => s.steps);
test('every step starts unsolved and its solution solves it', () => {
  for (const step of steps) {
    const s = startState(step);
    assert.equal(step.check(s), false, `${step.id} starts solved`);
    step.solve(s);
    assert.equal(step.check(s), true, `${step.id} solution fails`);
  }
});
test('Offset with Wrap Around keeps every pixel and moves the edges to the middle', () => {
  const im = flatSquare(), o = offset(im, 512, 512, 'wrap'), back = offset(o, -512, -512, 'wrap');
  assert.deepEqual(back.d, im.d);
  assert.ok(seamReport(o, 512, 512).bad >= 14, 'the old edges show as a cross');
  assert.ok(seamReport(im, 0, 0).bad >= 14, 'the edges of the photo do not match');
});
test('the tileable stones have no seam at their edges', () => {
  assert.ok(seamReport(stones().col, 0, 0).ok);
});
test('Repeat Edge Pixels smears instead of wrapping', () => {
  const im = flatSquare(), o = offset(im, 512, 0, 'repeat');
  for (let y = 0; y < N; y += 97) { const i = (y * N) * 4, j = (y * N + 300) * 4; assert.equal(o.d[i], o.d[j]); }
});
test('light fix: radius too small loses the stones; no desaturate loses the colour', () => {
  const step = steps.find(s => s.id === 'p2');
  const mk = (r, desat) => { const s = startState(step), b = s.layers[0].img; s.layers.push({ name: 'c', img: invert(gaussianBlur(desat ? desaturate(b) : b, r)), blend: 'Linear Light', opacity: 0.5 }); return lightReport(s); };
  const small = mk(5, true); assert.equal(small.structureOk, false);
  const noDesat = mk(60, false); assert.equal(noDesat.chromaOk, false);
  const big = mk(400, true); assert.equal(big.evenOk, false);
  assert.ok(mk(60, true).ok);
});
test('image size: stretching or upscaling does not pass', () => {
  const step = steps.find(s => s.id === 'p1');
  const s = startState(step); s.layers[0].img = resize(s.layers[0].img, 1024, 1024); s.flags.distorted = true;
  assert.equal(sizeReport(s).ok, false);
  const t = startState(step); t.layers[0].img = resize(crop(t.layers[0].img, 0, 0, 800, 800), 1024, 1024); t.cropSide = 800;
  assert.equal(sizeReport(t).upscaled, true); assert.equal(sizeReport(t).ok, false);
});
test('a clone dab copies from the source offset', () => {
  const im = newImage(64, 64), src = newImage(64, 64, [200, 10, 10]);
  dab(im, src, 32, 32, 10, 0, 6, 1);
  assert.equal(im.d[(32 * 64 + 32) * 4], 200);
  assert.equal(im.d[(32 * 64 + 50) * 4], 0);
});
test('walls: packed UVs are 13 m per tile, the row solution joins every corner', () => {
  const p = packedUV(); assert.ok(Math.abs(report('front', p.front).coverU - 13) < 0.01);
  const uv = solvedUV(3.4, -0.7);
  for (const w of WALLS) assert.ok(report(w.id, uv[w.id]).ok);
  assert.ok(joins(uv, 'left', 'front'));
});
test('two repeats line up at their least common multiple', () => {
  assert.equal(repeatTogether(2, 4), 4);
  assert.ok(Math.abs(repeatTogether(2, 3.3) - 66) < 1e-9);
  assert.ok(coverage(0.3) > coverage(0.6));
});
test('every stage text has a Catalan and a Spanish version', async () => {
  const dict = (await import('../labs/tileable/i18n.js')).default;
  for (const stage of STAGES) {
    for (const k of [stage.name, stage.sub]) assert.ok(dict[k]?.ca && dict[k]?.es, k);
    for (const s of stage.steps) for (const k of [s.title, s.text, s.why, ...s.how]) assert.ok(dict[k]?.ca && dict[k]?.es, k);
  }
});
