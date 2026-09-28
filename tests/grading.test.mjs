import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../labs/grading/grade.js';
import { shot, REG } from '../labs/grading/shots.js';
import { STAGES, startState, measure, levelsOk, greyOk, matchReport, matchOk, keyReport, balancedNode, isSCurve } from '../labs/grading/stages.js';
const steps = STAGES.flatMap(s => s.steps);

test('an untouched node changes nothing; gain scales, lift raises the blacks and keeps white', () => {
  const P = G.prepare(G.defaultNode());
  assert.deepEqual(G.applyNode(P, 0.2, 0.5, 0.8).map(v => +v.toFixed(6)), [0.2, 0.5, 0.8]);
  const n = G.defaultNode(); n.gain.m = 0.5; assert.ok(Math.abs(G.applyNode(G.prepare(n), 0.4, 0.4, 0.4)[0] - 0.6) < 1e-9);
  const l = G.defaultNode(); l.lift.m = 0.1; const P2 = G.prepare(l); assert.ok(Math.abs(G.applyNode(P2, 0, 0, 0)[0] - 0.1) < 1e-9); assert.ok(Math.abs(G.applyNode(P2, 1, 1, 1)[0] - 1) < 1e-9);
});
test('a puck has zero luma; saturation keeps greys; vectorscope angles of the targets', () => {
  const p = G.puckRGB(0.1, -0.05); assert.ok(Math.abs(G.luma(...p)) < 1e-4);
  const s = G.defaultNode(); s.sat = 100; assert.deepEqual(G.applyNode(G.prepare(s), 0.3, 0.3, 0.3).map(v => +v.toFixed(6)), [0.3, 0.3, 0.3]);
  assert.ok(Math.abs(G.scopeAngle(0.75, 0, 0) - 103) < 1.5, 'red near 103°'); assert.ok(Math.abs(G.scopeAngle(0.75, 0.75, 0) - 175) < 1.5, 'yellow near 175° (Rec.709)');
  assert.ok(G.angleDiff(G.scopeAngle(0.8, 0.57, 0.46), G.SKIN_LINE) < 4, 'the painted skin sits on the skin line');
});
test('curves: identity, and an S curve lowers shadows and raises highlights', () => {
  const id = G.curveLUT([[0, 0], [1, 1]]); assert.equal(id[128].toFixed(3), (128 / 255).toFixed(3));
  const S = G.curveLUT([[0, 0], [0.25, 0.2], [0.75, 0.8], [1, 1]]); assert.ok(S[64] < 64 / 255 && S[191] > 191 / 255);
  assert.ok(isSCurve([[0, 0], [0.25, 0.2], [0.75, 0.8], [1, 1]])); assert.equal(isSCurve([[0, 0], [1, 1]]), false);
});
test('the A camera is flat and too blue: blacks lifted, whites low, blue highest on the grey card', () => {
  const m = measure({ shot: 'intA', nodes: [G.defaultNode('01')] });
  assert.ok(m.black > 0.14 && m.black < 0.22); assert.ok(m.white > 0.68 && m.white < 0.78);
  const g = m.reg.grey; assert.ok(g[2] > g[1] && g[1] > g[0]);
  const a = G.scopeAngle(...m.reg.skin); assert.ok(a < G.SKIN_LINE - 3, 'the skin leans towards red/magenta');
});
test('each step starts unsolved and its solution passes', () => {
  for (const s of steps) { const a = startState(s); assert.equal(!!s.check(a), false, `${s.id} should start unsolved`); s.solve(a); assert.ok(s.check(a), `${s.id} solution should pass`); }
});
test('the balanced node: levels in range, neutral card, skin on its line', () => {
  const m = measure({ shot: 'intA', nodes: [balancedNode()] });
  assert.ok(levelsOk(m)); assert.ok(greyOk(m)); assert.ok(G.angleDiff(G.scopeAngle(...m.reg.skin), G.SKIN_LINE) <= 6);
});
test('the sky qualifier keys the sky and little else; the ungraded B camera does not match', () => {
  const q1 = steps.find(s => s.id === 'q1'), a = startState(q1); q1.solve(a); const k = keyReport(a, 1); assert.ok(k.sky > 0.8 && k.rest < 0.08);
  const b = startState(steps.find(s => s.id === 'm1')); assert.equal(matchOk(matchReport(b)), false);
  assert.equal(shot('intB', 32, 18).mask.length, 32 * 18); assert.ok(REG.sky === 3);
});
