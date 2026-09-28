import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../labs/stage-lighting/rig.js';
import { STAGES, keyFill, moverOnDancer } from '../labs/stage-lighting/stages.js';

test('every step starts undone and its solution passes', () => {
  for (const stage of STAGES) for (const step of stage.steps) {
    const st = step.start(), flags = {};
    assert.equal(!!step.check(st, { flags }), false, `${step.id} starts done`);
    step.solve(st, flags);
    assert.equal(!!step.check(st, { flags }), true, `${step.id} solution fails`);
  }
});

test('inverse square law and beam falloff', () => {
  const st = R.defaultState(); st.fx.fohL.dim = 1;
  const f = R.FIX.fohL, s = st.fx.fohL;
  const near = R.luxFrom(f, s, [0, 1.5, -3], null);
  const d = Math.hypot(4.5, 4.7, 9);
  assert.ok(Math.abs(near - 60000 / (d * d)) / near < 0.01);
  assert.equal(R.luxFrom(f, s, [-6, 0, 4], null), 0); // outside the beam
  s.dim = 0.5; assert.ok(Math.abs(R.luxFrom(f, s, [0, 1.5, -3], null) - near / 2) < 1e-6);
});

test('a wider zoom spreads the same light: lower intensity', () => {
  const s = R.defaultState().fx.washL; s.zoom = 20; const a = R.peakCd(R.FIX.washL, s); s.zoom = 40;
  assert.ok(Math.abs(R.peakCd(R.FIX.washL, s) - a / 4) < 1e-6);
});

test('DMX values round-trip through the channels', () => {
  const st = R.defaultState(), f = R.FIX.mover, s = st.fx.mover;
  const vals = [100, 20, 140, 200, 255, 96, 0, 128];
  vals.forEach((v, i) => R.setChannel(f, s, i, v));
  assert.deepEqual(R.dmxOf(f, s), vals);
  const p = R.FIX.parL, ps = st.fx.parL; [153, 255, 140, 0, 0].forEach((v, i) => R.setChannel(p, ps, i, v));
  assert.deepEqual(R.dmxOf(p, ps), [153, 255, 140, 0, 0]);
});

test('patch: default rig has no problems, overlaps are found', () => {
  const st = R.defaultState();
  assert.equal(R.patchProblems(st).length, 0);
  st.fx.parR.addr = 14; assert.ok(R.patchProblems(st).some(p => p.kind === 'overlap' && p.b === 'parR'));
  st.fx.parR.addr = 510; assert.ok(R.patchProblems(st).some(p => p.kind === 'range'));
  const u = R.universe(R.defaultState()); assert.equal(u.owner[10], 'parL'); assert.equal(u.owner[14], 'parL');
});

test('DIP switches count in binary', () => {
  assert.equal(R.dipAddress(R.dipFor(37)), 37);
  assert.deepEqual(R.dipFor(37).map(Number), [1, 0, 1, 0, 0, 1, 0, 0, 0]);
  assert.equal(R.dipAddress(R.dipFor(511)), 511);
});

test('lighting design numbers', () => {
  const st = R.defaultState(); st.fx.fohL.dim = 1; st.fx.fohR.dim = 0.5;
  assert.ok(Math.abs(keyFill(st) - 2) < 0.01);
  assert.ok(R.faceLux(st) > 400);
  assert.equal(moverOnDancer(st), false);
  assert.ok(R.hueSat(R.lightColor(R.FIX.fohL, { ...st.fx.fohL, gel: 'L201' }).hex).s < R.hueSat(R.lightColor(R.FIX.fohL, st.fx.fohL).hex).s);
  assert.ok(R.hueSat(R.lightColor(R.FIX.fohL, { ...st.fx.fohL, gel: 'L119' }).hex).h > 200);
  const a = R.lookOf(R.defaultState()); st.fx.back.dim = 1; const b = R.lookOf(st);
  assert.ok(Math.abs(R.blendLook(a, b, 0.5).back.dim - 0.5) < 1e-9);
  assert.equal(R.isBlackout(a), true);
});
