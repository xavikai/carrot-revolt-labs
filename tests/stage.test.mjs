import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../labs/stage/stage.js';
import { STAGES, PARTS, changeDone, MASKING, PLATS } from '../labs/stage/stages.js';

const ctx = (step, flags = {}) => ({ step, flags });

test('every step starts undone and its solution passes', () => {
  for (const stage of STAGES) for (const step of stage.steps) {
    const st = step.start(), flags = {};
    assert.equal(!!step.check(st, ctx(step, flags)), false, `${step.id} starts done`);
    step.solve(st, flags);
    assert.equal(!!step.check(st, ctx(step, flags)), true, `${step.id} solution fails`);
    assert.equal(M.conflict(st, step.show), null, `${step.id} solution has a conflict`);
  }
});

test('sightlines: the front row sees a backdrop at the floor, not one flown out', () => {
  const step = STAGES[0].steps[1], st = step.start();
  assert.equal(M.seenFrom('forest', st, step.show).front, true);
  st.v.forest = 22;
  assert.equal(M.hidden('forest', st, step.show), true);
  assert.ok(M.towerRatio() >= 2.5);
});

test('points behind the proscenium wall or under the floor are not seen', () => {
  assert.equal(M.sees([0, 1, 10], [0, 5, -5], []), true);
  assert.equal(M.sees([0, 1, 10], [0, 30, -5], []), false);
  assert.equal(M.sees([0, 1, 10], [0, -1, -5], []), false);
  assert.equal(M.sees([0, 1, 10], [0, 5, -5], [{ z: -2, x0: -3, x1: 3, y0: 0, y1: 10 }]), false);
});

test('masking: wide legs show the wings to the side seats', () => {
  const step = STAGES[3].steps[0], st = step.start();
  assert.equal(M.wingsSeen(st, step.show).left, true);
  step.solve(st, {}); assert.equal(M.wingsSeen(st, step.show).front, false);
});

test('counterweight and loads', () => {
  const st = M.defaultState();
  assert.equal(M.counterweight(st).runaway, true);
  st.cw = 16; assert.ok(Math.abs(M.counterweight(st).diff) <= M.BRICK / 2);
  st.truss = ['B', 'D']; assert.ok(M.trussLoads(st).B > M.BAR_LIMIT);
  st.truss = ['A', 'C', 'D']; assert.ok(Object.values(M.trussLoads(st)).every(kg => kg <= M.BAR_LIMIT));
});

test('interlocks stop a wagon at a lowered platform and at a backdrop', () => {
  const l3 = STAGES[2].steps[2], st = l3.start();
  const r = M.moveTo(st, l3.show, 'wForest', 0);
  assert.ok(r.blocked); assert.ok(r.value > 8);
  const c1 = STAGES[4].steps[0], s1 = c1.start();
  const r2 = M.moveTo(s1, c1.show, 'wPalace', -11);
  assert.ok(r2.blocked); assert.ok(r2.value < -19);
});

test('scene changes can be done in order with the interlocks', () => {
  const run = (step, moves) => {
    const st = step.start();
    for (const [id, v] of moves) { const r = M.moveTo(st, step.show, id, v); assert.equal(r.blocked, null, `${step.id}: ${id} blocked: ${r.blocked}`); st.v[id] = r.value; }
    return changeDone(step, st);
  };
  const [c1, c2] = STAGES[4].steps;
  assert.equal(run(c1, [['forest', 25], ['wForest', 17], ['wPalace', -11], ['palace', 12]]), true);
  assert.equal(run(c2, [['palace', 25], ['wPalace', -29], ['hell', 12], ['plat1', -4]]), true);
  // the palace wagon cannot come forward while the forest wagon is on stage
  const st = c1.start(); st.v.forest = 25;
  assert.ok(M.moveTo(st, c1.show, 'wPalace', -11).blocked);
});

test('parts: every part has a box and the wagons in store are hidden', () => {
  assert.equal(new Set(PARTS.map(p => p.id)).size, PARTS.length);
  const c1 = STAGES[4].steps[0], st = c1.start(); c1.solve(st, {});
  assert.equal(M.hidden('wForest', st, c1.show), true);
  const c2 = STAGES[4].steps[1], s2 = c2.start(); c2.solve(s2, {});
  assert.equal(M.hidden('wPalace', s2, c2.show), true);
});
