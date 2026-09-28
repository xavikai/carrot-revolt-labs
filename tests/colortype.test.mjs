import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../labs/color-type/color.js';
import * as T from '../labs/color-type/type.js';
import * as D from '../labs/color-type/doc.js';
import { STAGES, gamutOk, cvdDistance } from '../labs/color-type/stages.js';

test('every step starts undone and its solution passes', () => {
  for (const stage of STAGES) for (const step of stage.steps) {
    const st = step.start(), flags = {};
    assert.equal(!!step.check(st, { flags }), false, `${step.id} starts done`);
    step.solve(st, flags);
    assert.equal(!!step.check(st, { flags }), true, `${step.id} solution fails`);
  }
});

test('colour conversions round-trip', () => {
  for (const hex of ['#5b34c9', '#ffffff', '#000000', '#1f4bff', '#a6ff00', '#808080']) {
    assert.equal(C.hslToHex(C.hexToHsl(hex)), hex);
    assert.equal(C.lab50ToHex(C.hexToLab50(hex)), hex);
  }
  assert.equal(C.normHex('#abc'), '#aabbcc');
  assert.equal(C.hexToRgb('nope'), null);
});

test('WCAG contrast', () => {
  assert.ok(Math.abs(C.contrast('#000000', '#ffffff') - 21) < 1e-9);
  assert.ok(Math.abs(C.contrast('#777777', '#ffffff') - 4.48) < 0.01);
  assert.equal(C.wcag(4.5).AA, true); assert.equal(C.wcag(4.4).AA, false); assert.equal(C.wcag(3.1, true).AA, true);
  assert.equal(C.isLarge(24, 400), true); assert.equal(C.isLarge(19, 700), true); assert.equal(C.isLarge(19, 400), false);
});

test('CIEDE2000 matches the reference pairs of Sharma et al.', () => {
  assert.ok(Math.abs(C.deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-3);
  assert.ok(Math.abs(C.deltaE2000([50, 2.5, 0], [73, 25, -18]) - 27.1492) < 1e-3);
});

test('printing: saturated screen colours are out of gamut, greys and paper are in', () => {
  assert.equal(C.printable('#1f4bff'), false);
  assert.equal(C.printable('#a6ff00'), false);
  assert.equal(C.printable('#808080'), true);
  assert.equal(C.printable('#ffffff'), true);
  assert.ok(C.luminance(C.cmykToHex([60, 40, 40, 100])) < C.luminance(C.cmykToHex([0, 0, 0, 100])));
});

test('colour vision: red and green of the same lightness look alike with deuteranopia', () => {
  const st = STAGES[0].steps[3].start();
  assert.ok(cvdDistance(st) < 20);
  assert.equal(C.simulate('#808080', 'deuteranopia'), '#808080');
});

test('typography rules', () => {
  const p = { family: 'Inter', size: 16, lh: 1.5, ls: 0, width: 520 };
  assert.ok(T.bodyChecks(p).chars && T.bodyChecks(p).size && T.bodyChecks(p).lh);
  assert.equal(T.bodyChecks({ ...p, width: 900 }).chars, false);
  assert.equal(T.isTextFace('Lobster'), false); assert.equal(T.isTextFace('Merriweather'), true);
  assert.equal(T.scaleChecks(T.scaleSizes(16, 1.25)).ok, true);
  assert.equal(T.scaleChecks({ h1: 20, h2: 19, body: 18, caption: 17 }).ok, false);
});

test('the design system of the lab passes its own contrast pairs in both modes', () => {
  const st = D.goodState({ linked: true });
  for (const mode of ['light', 'dark']) assert.ok(D.pairResults(st, mode).every(p => p.ok), mode);
  st.mode = 'dark'; assert.ok(D.TEXT_LAYERS.every(id => D.textContrast(st, id).AA));
  const g = STAGES[1].steps[1].start(); assert.equal(gamutOk(g, 'button').ok, false);
});
