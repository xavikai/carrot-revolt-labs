import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../labs/viewport/vp.js';
import { STAGES, startState, shapeMatch, panReport, markSeen, exactReport, moveReport, selectReport, undoReport, MARKS } from '../labs/viewport/stages.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

test('Blender XYZ Euler survives a trip through quaternions', () => {
  for (const e of [[10, 20, 30], [0, 0, 45], [-30, 60, 170], [90, 0, 0], [0, 89, 12]]) V.quatToEuler(V.eulerToQuat(e)).forEach((x, i) => near(x, e[i], 1e-6));
  // X is applied first: rotating X then Z by 90° takes +Y to +Z… then stays on Z.
  const v = V.qRotate(V.eulerToQuat([90, 0, 90]), [0, 1, 0]); near(v[2], 1);
});

test('axis views look along the right directions and use Auto Perspective', () => {
  const f = V.basisOf(V.setAxisView(V.defaultView(), 'front'));
  near(f.f[1], 1); near(f.r[0], 1); near(f.u[2], 1);
  const r = V.basisOf(V.setAxisView(V.defaultView(), 'right')); near(r.f[0], -1); near(r.r[1], 1);
  const t = V.setAxisView(V.defaultView(), 'top'), tb = V.basisOf(t); near(tb.f[2], -1); near(tb.u[1], 1);
  assert.equal(V.viewName(t), 'Top Orthographic');
  const o = V.orbit(t, 10, 0); assert.equal(o.ortho, false); assert.equal(V.viewName(o), 'User Perspective');
  // Numpad 5 before the axis view: orthographic stays after orbiting.
  const manual = V.orbit(V.setAxisView({ ...V.defaultView(), ortho: true }, 'front'), 10, 0); assert.equal(manual.ortho, true);
});

test('projection and rays agree', () => {
  const v = V.defaultView(), W = 1600, H = 900, p = [2, -1, 1.5], s = V.project(v, p, W, H), ray = V.rayAt(v, s.x, s.y, W, H);
  const toP = V.norm(V.sub(p, ray.o)); near(V.dot(toP, ray.d), 1, 1e-9);
  const o = { ...v, ortho: true }, so = V.project(o, p, W, H), ro = V.rayAt(o, so.x, so.y, W, H);
  const w = V.sub(p, ro.o), off = V.sub(w, V.mul(ro.d, V.dot(w, ro.d))); near(V.len(off), 0, 1e-9);
});

test('typed transforms are exact', () => {
  const o = V.makeObj('C', 'cube', { loc: [1, 2, 3] }), v = V.defaultView(), m = t => ({ start: [0, 0], cur: [0, 0], orient: 'global', ...t });
  assert.deepEqual(V.applyModal(m({ type: 'move', axis: 'z', typed: '2' }), [o], o, v, 800, 450).objs[0].loc, [1, 2, 5]);
  assert.deepEqual(V.applyModal(m({ type: 'rotate', axis: 'z', typed: '45' }), [o], o, v, 800, 450).objs[0].rot, [0, 0, 45]);
  assert.deepEqual(V.applyModal(m({ type: 'rotate', axis: 'x', typed: '200' }), [o], o, v, 800, 450).objs[0].rot, [200, 0, 0]);
  assert.deepEqual(V.applyModal(m({ type: 'scale', typed: '1.5' }), [o], o, v, 800, 450).objs[0].scale, [1.5, 1.5, 1.5]);
  assert.deepEqual(V.applyModal(m({ type: 'scale', axis: 'z', plane: true, typed: '2' }), [o], o, v, 800, 450).objs[0].scale, [2, 2, 1]);
  assert.equal(V.applyModal(m({ type: 'move', axis: 'z', typed: '2' }), [o], o, v, 800, 450).info.text, 'D: 2 m (2 m) along global Z');
});

test('an axis move follows the mouse along the axis only', () => {
  const o = V.makeObj('C', 'cube'), v = V.defaultView(), W = 1600, H = 900, px = V.project(v, [1, 0, 0], W, H), p0 = V.project(v, [0, 0, 0], W, H);
  const r = V.applyModal({ type: 'move', axis: 'x', start: [p0.x, p0.y], cur: [px.x, px.y] }, [o], o, v, W, H);
  near(r.objs[0].loc[0], 1, 1e-6); near(r.objs[0].loc[1], 0); near(r.objs[0].loc[2], 0);
  const snapped = V.applyModal({ type: 'move', axis: 'x', start: [p0.x, p0.y], cur: [px.x + 3, px.y], snap: true }, [o], o, v, W, H);
  assert.equal(snapped.objs[0].loc[0], 1);
});

test('numeric input keys', () => {
  let s = ''; for (const k of ['1', '.', '5']) s = V.typeKey(s, k); assert.equal(V.parseTyped(s), 1.5);
  s = V.typeKey(s, '-'); assert.equal(V.parseTyped(s), -1.5); s = V.typeKey(s, 'Backspace'); assert.equal(s, '-1.');
  assert.equal(V.parseTyped('-'), null); assert.equal(V.typeKey('', '.'), '0.');
});

test('Shift-click rules of Object Mode', () => {
  let s = V.clickSelect([], null, 'A', false); assert.deepEqual(s, { sel: ['A'], active: 'A' });
  s = V.clickSelect(s.sel, s.active, 'B', true); assert.deepEqual(s, { sel: ['A', 'B'], active: 'B' });
  s = V.clickSelect(s.sel, s.active, 'A', true); assert.deepEqual(s, { sel: ['A', 'B'], active: 'A' });
  s = V.clickSelect(s.sel, s.active, 'A', true); assert.deepEqual(s.sel, ['B']);
  assert.deepEqual(V.clickSelect(['A'], 'A', null, false).sel, []);
});

test('silhouettes know the symmetry of each primitive', () => {
  const g = { loc: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] };
  assert.ok(shapeMatch(V.makeObj('c', 'cube', { rot: [0, 0, 90] }), g).ok);
  assert.ok(!shapeMatch(V.makeObj('c', 'cube', { rot: [0, 0, 45] }), g).ok);
  assert.ok(shapeMatch(V.makeObj('s', 'sphere', { rot: [33, 10, 70] }), g).ok);
  assert.ok(shapeMatch(V.makeObj('y', 'cylinder', { rot: [180, 0, 0] }), g).ok);
  assert.ok(!shapeMatch(V.makeObj('k', 'cone', { rot: [180, 0, 0] }), g).ok);
  assert.ok(shapeMatch(V.makeObj('k', 'cone', { rot: [0, 0, 77] }), g).ok);
  assert.ok(!shapeMatch(V.makeObj('a', 'arrow', { rot: [0, 0, 90] }), g).ok);
});

test('every step starts unsolved and its solution passes', () => {
  for (const stage of STAGES) for (const step of stage.steps) {
    if (step.free) continue;
    const st = startState(step);
    assert.equal(!!step.check(st), false, `${step.id} starts solved`);
    step.solve(st); assert.equal(!!step.check(st), true, `${step.id} solution fails`);
  }
});

test('orbit step: marks are seen only from in front', () => {
  const st = startState(STAGES[0].steps[0]); markSeen(st); assert.equal(Object.keys(st.flags.seen).length, 0);
  st.view = V.setAxisView(st.view, 'back'); markSeen(st); assert.ok(st.flags.seen['+y']);
  st.view = V.setAxisView(st.view, 'bottom'); markSeen(st); assert.ok(st.flags.seen['-z']);
  st.view = V.setAxisView(st.view, 'left'); markSeen(st); assert.ok(MARKS.every(m => st.flags.seen[m]));
});

test('pan step needs the sphere centred and big', () => {
  const st = startState(STAGES[0].steps[1]); assert.equal(panReport(st).centred, false);
  st.view.target = [9, 13, 1.2]; assert.equal(panReport(st).centred, true); assert.equal(panReport(st).big, false);
  st.view.dist = 2; assert.equal(panReport(st).big, true);
});

test('reports of the transform steps', () => {
  const s2 = startState(STAGES[1].steps[1]), c1 = s2.objs.find(o => o.name === 'Cube.001');
  c1.loc = [-4.05, 1, 4]; assert.equal(moveReport(s2).up, false); assert.equal(moveReport(s2).upMoved, true);
  const s3 = startState(STAGES[1].steps[2]); s3.objs[0].loc[2] = 2.95; assert.equal(exactReport(s3).move, false);
  const s1 = startState(STAGES[1].steps[0]); assert.equal(selectReport(s1).extra, 2);
  const u = startState(STAGES[2].steps[0]); assert.equal(u.history.length, 3); u.objs[0] = { ...u.history[0].objs[0] }; assert.equal(undoReport(u).back, true); assert.equal(undoReport(u).cancelled, false);
});
