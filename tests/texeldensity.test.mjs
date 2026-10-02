import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, startState, meshOf, densityOf, islandsOf, isInside, overlapsOf, updateKnobs, resetKnobs, answerMeasure, answerQuiz, RULES, sceneStats, memoryFor, spread } from '../labs/texel-density/stages.js';
import { buildScene, packedUV, objectDensity, islandDensity, islandFaces, objectFaces, averageIslandsScale, pack, setTD, minRes, screenDensity, rightTarget, CAMERAS, setMB, bbox, scale, ideal, overlaps, inside } from '../labs/texel-density/td.js';

const steps = STAGES.flatMap(s => s.steps);
test('every step starts unsolved and its solution solves it', () => {
  for (const step of steps) {
    const s = startState(step);
    assert.equal(step.check(s), false, `${step.id} starts solved`);
    step.solve(s);
    assert.equal(step.check(s), true, `${step.id} solution fails`);
  }
});
test('density = texture px × √(UV area ÷ 3D area): a 0.5 m face on 256 px is 512 px/m', () => {
  const m = buildScene('crate'), uv = packedUV(m), f = islandFaces(m, 'crate.front');
  ideal(m, uv, f, 0.5);                       // 0.5 m × 0.5 UV per m = 0.25 UV = 256 px on 1024
  assert.ok(Math.abs(islandDensity(m, uv, 'crate.front', 1024) - 512) < 1e-6);
  assert.ok(Math.abs(islandDensity(m, uv, 'crate.front', 2048) - 1024) < 1e-6);
  const b = bbox(uv, f); scale(uv, f, 0.5, 0.5, b.cu, b.cv);
  assert.ok(Math.abs(islandDensity(m, uv, 'crate.front', 1024) - 256) < 1e-6);
});
test('scaling the object in 3D changes the density', () => {
  const a = buildScene('crate'), b = buildScene('crate', { crate: 0.5 }), uv = packedUV(a);
  assert.ok(Math.abs(objectDensity(b, uv, 'crate', 1024) / objectDensity(a, uv, 'crate', 1024) - 2) < 1e-9);
});
test('packed layouts stay inside 0–1 with no overlaps', () => {
  for (const name of ['trio', 'shop', 'cabinet']) {
    const m = buildScene(name), uv = packedUV(m);
    for (const o of Object.keys(m.objects)) { assert.ok(inside(uv, objectFaces(m, o)), `${name} ${o} inside`); assert.equal(overlaps(m, uv, m.objects[o].islands).length, 0, `${name} ${o} overlaps`); }
  }
});
test('Average Islands Scale evens the islands; Pack Islands keeps them even and fills the square', () => {
  const step = steps.find(s => s.id === 'a2'), s = startState(step), m = meshOf(s), ids = islandsOf(s, 'cabinet');
  assert.ok(spread(s, 'cabinet') > 2);
  averageIslandsScale(m, s.uv, ids); assert.ok(spread(s, 'cabinet') < 1.001);
  pack(m, s.uv, ids); assert.ok(spread(s, 'cabinet') < 1.001); assert.ok(isInside(s, 'cabinet')); assert.equal(overlapsOf(s, 'cabinet').length, 0);
});
test('Set TD reaches the target exactly, and reports when the texture is too small', () => {
  const m = buildScene('trio'), uv = packedUV(m);
  assert.equal(setTD(m, uv, 'crate', 1024, 512), true);
  assert.ok(Math.abs(objectDensity(m, uv, 'crate', 1024) - 512) < 1e-6);
  assert.equal(setTD(m, uv, 'wall', 1024, 512), false);
  assert.equal(setTD(m, uv, 'wall', 2048, 512), true);
});
test('smallest textures for 512 px/m: small props 1K, the wall and the vending machine 2K', () => {
  assert.deepEqual(['crate', 'barrel', 'wall', 'vending', 'cabinet'].map(o => minRes(o, 512)), [1024, 1024, 2048, 2048, 2048]);
  assert.equal(memoryFor('shop', 512), 40);
  assert.equal(memoryFor('shop', 1024) / memoryFor('shop', 512), 4);
  assert.equal(setMB(1024), 4);
});
test('camera targets: 128, 512 and 1024 px/m', () => {
  assert.equal(Math.round(screenDensity(2.5)), 499);
  assert.deepEqual(Object.values(CAMERAS).map(c => rightTarget(c.d)), [128, 512, 1024]);
});
test('game types: the same formula gives each game its own target', async () => {
  const { GAMES, targetFor, camDensity } = await import('../labs/texel-density/td.js');
  assert.deepEqual(Object.fromEntries(Object.entries(GAMES).map(([k, c]) => [k, targetFor(c)])), { mobile: 256, first4k: 2048, vr: 1024, weapon: 4096 });
  assert.equal(Math.round(camDensity(GAMES.weapon)), 2494);
  const g1 = steps.find(x => x.id === 'g1'), s = startState(g1); assert.equal(g1.check(s), false); g1.solve(s); assert.ok(g1.check(s));
});
test('each knob of step m2 is ticked only when it alone reaches 512 px/m', () => {
  const s = startState(steps.find(x => x.id === 'm2'));
  assert.equal(Math.round(densityOf(s, 'crate')), 256);
  s.res.crate = 2048; assert.equal(updateKnobs(s), 'res');
  s.scale.crate = 0.5; assert.equal(updateKnobs(s), null);            // two knobs at once: 1024 px/m
  resetKnobs(s); s.scale.crate = 0.5; assert.equal(updateKnobs(s), 'scale');
  resetKnobs(s); const m = meshOf(s), f = objectFaces(m, 'crate'), b = bbox(s.uv, f); scale(s.uv, f, 2, 2, b.cu, b.cv); assert.equal(updateKnobs(s), 'uv');
});
test('quizzes advance only on right answers', () => {
  const s = startState(steps.find(x => x.id === 'm1'));
  assert.equal(answerMeasure(s, 300).ok, false); assert.equal(answerMeasure(s, 512).ok, true);
  assert.equal(s.res.crate, 2048); assert.equal(answerMeasure(s, 1024).ok, true); assert.equal(answerMeasure(s, 256).ok, true);
  const r = startState(steps.find(x => x.id === 'e2'));
  assert.equal(answerQuiz(r, RULES, 'lower').ok, false); assert.equal(r.flags.quiz | 0, 0);
  for (const q of RULES) assert.equal(answerQuiz(r, RULES, q.a).ok, true);
});
test('the budget of step c2 flags blurry and oversized textures', () => {
  const s = startState(steps.find(x => x.id === 'c2')), st = sceneStats(s, 512);
  assert.equal(st.per.crate.waste, true); assert.equal(st.per.wall.low, true); assert.ok(st.mb > 40);
});
test('loop cuts: a single quad cannot keep 512 px/m; cuts at 0.25 and 1.75 m with the right zones can', async () => {
  const { cutReport, addCut, syncCuts } = await import('../labs/texel-density/stages.js');
  const a4 = steps.find(x => x.id === 'a4'), s = startState(a4);
  let r = cutReport(s); assert.equal(r.rows.length, 1); assert.equal(Math.round(r.rows[0].dv), 384); assert.equal(a4.check(s), false);
  addCut(s); addCut(s); assert.equal(s.cuts.length, 2); assert.equal(s.zones.length, 3);
  s.cuts = [0.25, 1.75]; s.zones = ['baseboard', 'bricks', 'cornice']; syncCuts(s);
  r = cutReport(s); assert.ok(r.rows.every(x => Math.round(x.du) === 512 && Math.round(x.dv) === 512)); assert.ok(a4.check(s));
  s.zones = ['cornice', 'bricks', 'baseboard']; syncCuts(s); assert.equal(a4.check(s), false, 'the zones must match the wall');
  s.cuts = [0.5, 1.75]; s.zones = ['baseboard', 'bricks', 'cornice']; syncCuts(s); assert.equal(cutReport(s).rows[0].dv, 256, 'a 0.5 m baseboard strip is stretched');
  const b = startState(a4); a4.solve(b); assert.ok(a4.check(b));
});
test('stage order: see, measure, choose, match, break the rule', () => {
  assert.deepEqual(STAGES.map(s => s.id), ['see', 'measure', 'choose', 'match', 'rules']);
});
test('step c0: the starting target for each game advances only on the right value', async () => {
  const { TARGET_CASES } = await import('../labs/texel-density/stages.js');
  const s = startState(steps.find(x => x.id === 'c0'));
  assert.equal(answerQuiz(s, TARGET_CASES, 4096).ok, false); assert.equal(s.flags.quiz | 0, 0);
  for (const c of TARGET_CASES) assert.equal(answerQuiz(s, TARGET_CASES, c.a).ok, true);
});
test('texture size estimate target × √(surface ÷ 0.7) gives the smallest texture that reaches the target', async () => {
  const { textureEstimate } = await import('../labs/texel-density/stages.js');
  for (const o of ['crate', 'wall', 'barrel', 'cabinet']) for (const tg of [256, 512]) assert.equal(textureEstimate(o, tg).res, minRes(o, tg), `${o} ${tg}`);
});
test('step a5: every line of the recipe is needed', async () => {
  const { recipe } = await import('../labs/texel-density/stages.js');
  const a5 = steps.find(x => x.id === 'a5'), s = startState(a5);
  assert.ok(Object.values(recipe(s)).every(v => !v) || !recipe(s).target);
  a5.solve(s); assert.ok(a5.check(s));
  for (const [k, undo] of [['target', x => { x.target = 1024; }], ['applied', x => { x.flags.applied = false; }], ['size', x => { x.res.cabinet = 4096; }], ['checker', x => { x.view = 'texture'; }]]) {
    const c = JSON.parse(JSON.stringify(s)); undo(c); assert.equal(a5.check(c), false, k);
  }
  const small = startState(a5); a5.solve(small); small.res.cabinet = 1024; assert.equal(a5.check(small), false, 'a 1K texture cannot reach 512 px/m on the cabinet');
});
