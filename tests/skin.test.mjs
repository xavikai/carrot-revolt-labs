import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as SW from '../labs/skin-weights/weights.js';
import { STAGES, rigFor } from '../labs/skin-weights/stages.js';

const arm = SW.makeRig('arm');
const body = SW.makeRig('body');

test('rigs: closed tubes with adjacency, and a perfect X mirror on the body', () => {
  assert.ok(arm.count > 500 && body.count > arm.count);
  assert.ok(arm.adjacency.every(n => n.length >= 3));
  assert.equal([...body.mirror].filter(m => m < 0).length, 0);
  assert.deepEqual(body.bones.map(b => b.mirror), [0, 3, 4, 1, 2]);
});

test('automatic weights: normalized, soft around the elbow, 1 far from it', () => {
  const W = SW.automaticWeights(arm);
  const s = SW.stats(W, arm);
  assert.equal(s.zero, 0); assert.equal(s.notNormalized, 0);
  assert.ok(SW.ringAverage(W, arm, 1, 1.0) < 0.02);
  assert.ok(Math.abs(SW.ringAverage(W, arm, 1, 2.0) - 0.5) < 0.1);
  assert.ok(SW.ringAverage(W, arm, 1, 3.2) > 0.98);
  assert.ok(SW.symmetryError(SW.automaticWeights(body), body) < 1e-5);
});

test('deform: linear blend skinning follows the bones; vertices without weight stay behind', () => {
  const W = SW.automaticWeights(arm), pose = SW.restPose(arm);
  pose[1].bend = 90;
  const out = SW.deform(arm, W, pose), tip = arm.count - 1;
  assert.ok(Math.abs(out[tip * 3] - 2) < 0.05 && Math.abs(out[tip * 3 + 1] - 2.35) < 0.05, 'the hand goes up');
  const E = SW.emptyWeights(arm), still = SW.deform(arm, E, pose);
  assert.deepEqual([...still], [...arm.rest]);
  const bones = SW.bonePose(arm, pose);
  assert.ok(Math.abs(bones[1].tail[0] - 2) < 1e-9 && Math.abs(bones[1].tail[1] - 2) < 1e-9);
});

test('painting: Mix, Add, Subtract, Auto Normalize and X-Mirror', () => {
  const W = SW.automaticWeights(arm);
  const i = arm.indices[3000], hit = [{ index: i, falloff: 1 }];
  const A = SW.cloneWeights(W);
  SW.stroke(arm, A, hit, { weight: 1, strength: 1, active: 1, autoNormalize: false });
  assert.equal(A[1][i], 1);
  assert.ok(SW.total(A, i) > 1 || W[0][i] === 0, 'without Auto Normalize the total can exceed 1');
  const B = SW.cloneWeights(W);
  SW.stroke(arm, B, hit, { weight: 0.8, strength: 1, active: 1, autoNormalize: true });
  assert.ok(Math.abs(SW.total(B, i) - 1) < 1e-6);
  const C = SW.cloneWeights(W);
  SW.stroke(arm, C, hit, { blend: 'subtract', weight: 1, strength: 1, active: 0, autoNormalize: false });
  assert.equal(C[0][i], 0);
  // X-Mirror paints the .R group on the mirrored vertex
  const D = SW.emptyWeights(body), v = body.rest.findIndex((x, k) => k % 3 === 0 && x > 3) / 3;
  SW.stroke(body, D, [{ index: v, falloff: 1 }], { weight: 1, strength: 1, active: 2, autoNormalize: false, xMirror: true });
  assert.equal(D[2][v], 1); assert.equal(D[4][body.mirror[v]], 1);
});

test('blur spreads a hard edge; the Weights menu operators', () => {
  const W = SW.emptyWeights(arm);
  for (let i = 0; i < arm.count; i++) (arm.rest[i * 3] < 2 ? W[0] : W[1])[i] = 1;
  const hits = [...Array(arm.count).keys()].filter(i => Math.abs(arm.rest[i * 3] - 2) < 0.6).map(index => ({ index, falloff: 1 }));
  for (let k = 0; k < 4; k++) SW.stroke(arm, W, hits, { tool: 'blur', strength: 1, active: 1, autoNormalize: true });
  const a = SW.ringAverage(W, arm, 1, 1.8);
  assert.ok(a > 0.05 && a < 0.9, 'the Forearm gradient grows towards the shoulder');
  assert.ok(SW.ringAverage(W, arm, 1, 2.3) > 0.999, 'with Auto Normalize, a vertex only in the Forearm group stays at 1');
  const M = SW.automaticWeights(body, 2.2);
  SW.limitTotal(M, body, 2); assert.equal(SW.stats(M, body).maxInfluences, 2);
  SW.clean(M, body, 0.05); assert.equal(SW.stats(M, body).tiny, 0);
  SW.normalizeAll(M, body); assert.equal(SW.stats(M, body).notNormalized, 0);
  const N = SW.automaticWeights(body);
  for (let i = 0; i < body.count; i++) if (body.rest[i * 3] < -2) N[4][i] = 0.3;
  assert.ok(SW.symmetryError(N, body) > 0.1);
  for (const g of [1, 2, 0]) SW.mirrorWeights(N, body, g);
  assert.ok(SW.symmetryError(N, body) < 1e-6);
});

test('every stage starts unsolved and its solutions pass every check', () => {
  for (const st of STAGES) {
    const rig = rigFor(st), d = st.start(rig);
    const flags = { seen: new Set(), maxBend: 0, maxTwist: 0, resetAfterTwist: false };
    assert.equal(st.steps[0].check(d, rig, flags), false, `${st.id} starts unsolved`);
    for (const s of st.steps) {
      s.solve?.(d, rig);
      if (s.id === 'a2') { flags.seen.add('Forearm'); flags.maxBend = 70; }
      if (s.id === 'a3') { flags.maxTwist = 130; flags.resetAfterTwist = true; }
      assert.ok(s.check(d, rig, flags), `${s.id} solved`);
    }
    assert.ok(st.steps.every(s => s.check(d, rig, flags)), `${st.id}: all steps stay done`);
  }
});

test('stage 2: blurring only the Forearm without Auto Normalize, then Normalize All, loses the gradient on one side', () => {
  const st = STAGES[1], rig = rigFor(st), d = st.start(rig);
  SW.smooth(d.weights, rig, { groups: [1], factor: 0.8, repeat: 12 });
  SW.normalizeAll(d.weights, rig);
  assert.ok(SW.ringAverage(d.weights, rig, 1, 2.25) > 0.99, 'the side with only one group goes back to 1');
  assert.equal(st.steps[1].check(d, rig), false);
});
