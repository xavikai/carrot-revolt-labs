import { test } from 'node:test';
import assert from 'node:assert/strict';
import { M3, UNITY_M, FLIP_X, eulerXYZ, unityEuler, unityRotation, makeObject, OPS, worldBounds, dimensions, EXPORT_DEFAULTS, IMPORT_DEFAULTS, exportFBX, importFBX, cleanTransform, clipsOf, rigReport, dropHeight } from '../labs/export/xport.js';
import { STAGES, startState } from '../labs/export/stages.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const nearV = (a, b, e = 1e-6) => a.every((v, k) => near(v, b[k], e));
const imp = (objects, exp = {}, im = {}) => importFBX(exportFBX({ objects }, { ...EXPORT_DEFAULTS, ...exp }, 'M'), { ...IMPORT_DEFAULTS, ...im });

test('Blender → Unity: axes, handedness and Euler angles', () => {
  assert.ok(nearV(M3.apply(UNITY_M, [1, 2, 3]), [-1, 3, -2]), 'Blender (x, y, z) → Unity (−x, z, −y)');
  assert.ok(near(M3.det(UNITY_M), -1), 'right-handed to left-handed');
  assert.ok(nearV(M3.mul(UNITY_M, FLIP_X), M3.rx(-90)), 'without axis baking the mesh needs a −90° rotation on X');
  for (const e of [[10, 20, 30], [-45, 170, 5], [80, -30, 60]]) assert.ok(nearV(unityEuler(unityRotation(e)), e, 1e-6), 'Unity ZXY Euler round trip');
  assert.ok(nearV(eulerXYZ([0, 0, 90]), M3.rz(90)));
});

test('the default export: Rotation X −89.98, Scale 100, right size; the fixed export: 0 and 1', () => {
  const crate = makeObject({ name: 'Crate', shape: 'crate' });
  let r = imp([crate]), n = r.nodes[0];
  assert.ok(nearV(n.rotation, [-89.98, 0, 0], 1e-6) && nearV(n.scale, [100, 100, 100]));
  assert.ok(nearV(r.world(n).size, [0.8, 0.8, 0.8], 1e-9), 'it still looks right');
  const big = imp([crate], {}, { convertUnits: false });
  assert.ok(nearV(big.world(big.nodes[0]).size, [80, 80, 80], 1e-6), 'without Convert Units it is 100 times too big');
  r = imp([crate], { applyScalings: 'FBX Units Scale' }, { bakeAxis: true }); n = r.nodes[0];
  assert.ok(cleanTransform(n) && nearV(r.world(n).size, [0.8, 0.8, 0.8], 1e-9));
  const sideways = imp([crate], { applyScalings: 'FBX Units Scale', up: 'Z', forward: 'Y' }, { bakeAxis: true });
  assert.ok(sideways.warnings.includes('axes'));
});

test('Blender operators keep the object in place', () => {
  const o = makeObject({ name: 'B', shape: 'cylinder', loc: [1, 2, 0.45], rot: [20, 0, 90], scale: [0.3, 0.3, 0.45] });
  const before = worldBounds(o);
  OPS.applyRotScale(o); assert.ok(nearV(worldBounds(o).mn, before.mn, 1e-9) && nearV(o.scale, [1, 1, 1]) && nearV(o.rot, [0, 0, 0]));
  OPS.originTo(o, [0, 0, 0]); assert.ok(nearV(worldBounds(o).mx, before.mx, 1e-9) && nearV(o.loc, [0, 0, 0]));
  OPS.applyAll(o); assert.ok(nearV(worldBounds(o).center, before.center, 1e-9));
  const d = makeObject({ name: 'D', shape: 'door', loc: [0, 0, 1] }); OPS.originTo(d, [-0.45, 0, 0]);
  assert.ok(nearV(worldBounds(d).mn, [-0.45, -0.025, 0], 1e-9), 'Set Origin does not move the mesh');
  const lamp = makeObject({ name: 'L', shape: 'lamp' }); OPS.setDimension(lamp, 2, 1.8);
  assert.ok(near(dimensions(lamp)[2], 1.8, 1e-9) && near(dimensions(lamp)[0], 6.4, 1e-9), 'Dimensions Z only scales Z');
});

test('rig, clips and colliders', () => {
  const bones = [{ name: 'Hips', deform: true }, { name: 'Head', deform: true, leaf: true }, { name: 'IK_Foot.L', deform: false, leaf: true }];
  const scene = { objects: [makeObject({ name: 'Armature', type: 'ARMATURE', shape: 'empty', bones }), makeObject({ name: 'Body', shape: 'body', parent: 'Armature', skinned: true })], actions: [{ name: 'Idle' }, { name: 'Walk' }], activeAction: 'Walk' };
  let f = exportFBX(scene, EXPORT_DEFAULTS, 'C');
  const r = rigReport(f, { ...IMPORT_DEFAULTS, animationType: 'Generic' });
  assert.ok(r.issues.includes('leafBones') && r.issues.includes('controlBones') && r.bones.includes('Head_end'));
  assert.deepEqual(clipsOf(f), ['Armature|Idle', 'Armature|Walk']);
  f = exportFBX(scene, { ...EXPORT_DEFAULTS, allActions: false, nlaStrips: false }, 'C');
  assert.deepEqual(clipsOf(f), ['Armature|Walk'], 'only the active action');
  const block = [[[-0.6, 0, -0.4], [0.6, 0.75, 0.4]]], parts = [[[-0.6, 0.7, -0.4], [0.6, 0.75, 0.4]], [[-0.57, 0, -0.37], [-0.51, 0.7, -0.31]]];
  assert.equal(dropHeight(block, 0, 0, 0.45), 0.75, 'released inside a convex hull, the ball pops up on top');
  assert.equal(dropHeight(parts, 0, 0, 0.45), 0, 'with one collider per part, it falls to the floor');
});

test('every step starts unsolved and its solution solves it', () => {
  for (const st of STAGES) for (const step of st.steps) {
    const s = startState(step);
    assert.equal(!!step.check(s), false, `${step.id} starts unsolved`);
    step.solve(s);
    assert.equal(!!step.check(s), true, `${step.id} is solved by its solution`);
  }
});
