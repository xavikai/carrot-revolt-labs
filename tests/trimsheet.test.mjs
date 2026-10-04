import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, startState, meshOf, layoutInfo, reports } from '../labs/trim-sheet/stages.js';
import { DEFAULT_LAYOUT, DEFAULT_PAD, stripsOf, stripOf, SIZE, DENSITY, cleanMips } from '../labs/trim-sheet/sheet.js';
import { scene, solvedUV, arc, scatter, emptyUV } from '../labs/trim-sheet/props.js';
import { report, followActiveQuads, alignRotation, fitToTrim, density, islandFaces, cornerNormals, scale, bbox, orientation } from '../labs/trim-sheet/uv.js';
import { DEFAULT_STRIPS } from '../labs/trim-sheet/sheet.js';

const steps = STAGES.flatMap(s => s.steps);
test('every step starts unsolved and its solution solves it', () => {
  for (const step of steps) {
    const s = startState(step);
    assert.equal(step.check(s), false, `${step.id} starts solved`);
    step.solve(s);
    assert.equal(step.check(s), true, `${step.id} solution fails`);
  }
});
test('the default sheet fills 1024 px exactly with 8 px padding', () => {
  const { used, strips } = stripsOf(DEFAULT_LAYOUT, DEFAULT_PAD);
  assert.equal(used, SIZE);
  assert.equal(strips.length, 8);
  assert.equal(cleanMips(8), 3);
});
test('the solved layouts of every scene pass every check', () => {
  for (const name of ['wall', 'column', 'chest', 'beam', 'all']) {
    const m = scene(name, { straps: true }), uv = solvedUV(m);
    for (const id of Object.keys(m.islands)) { const r = report(m, uv, id, DEFAULT_STRIPS); assert.ok(r.ok, `${name} ${id} ${JSON.stringify(r)}`); }
  }
});
test('density is 512 px/m after placing and halves when scaled by 0.5', () => {
  const m = scene('wall'), uv = solvedUV(m), f = islandFaces(m, 'row1');
  assert.ok(Math.abs(density(m, uv, f) - DENSITY) < 1);
  const b = bbox(uv, f); scale(uv, f, 0.5, 0.5, b.cu, b.cv);
  assert.ok(Math.abs(density(m, uv, f) - DENSITY / 2) < 1);
});
test('Follow Active Quads straightens an arc and Align Rotation lines it up', () => {
  const m = scene('column'), uv = emptyUV(m), f = islandFaces(m, 'drum1');
  arc(m, uv, 'drum1', { cu: 0.5, cv: 0.5, R: 0.4, a0: 15 });
  assert.ok(orientation(m, uv, f).angle > 20);
  followActiveQuads(m, uv, f);
  const o = orientation(m, uv, f);
  assert.ok(o.stretch < 1.02, 'straight strip keeps proportions');
  alignRotation(m, uv, f);
  assert.ok(orientation(m, uv, f).angle < 0.5);
  assert.ok(orientation(m, uv, f).upright);
  assert.ok(Math.abs(density(m, uv, f) - DENSITY / 2) < 15);
});
test('Fit to Trim puts a turned island on its strip at the right density', () => {
  const m = scene('chest', { straps: true }), uv = emptyUV(m);
  scatter(m, uv, 'strap1', { cu: 0.4, cv: 0.4, rot: 90, k: 0.45 });
  fitToTrim(m, uv, islandFaces(m, 'strap1'), stripOf('iron'));
  assert.ok(report(m, uv, 'strap1', DEFAULT_STRIPS).ok);
});
test('an upside-down island and a stretched island are reported', () => {
  const m = scene('wall'), uv = solvedUV(m), f = islandFaces(m, 'row1');
  const b = bbox(uv, f); scale(uv, f, 1, -1, b.cu, b.cv);
  assert.equal(report(m, uv, 'row1', DEFAULT_STRIPS).upright, false);
  scale(uv, f, 1, -1, b.cu, b.cv); scale(uv, f, 1.3, 1, b.cu, b.cv);
  assert.equal(report(m, uv, 'row1', DEFAULT_STRIPS).stretchOk, false);
});
test('Weighted Normal keeps the big faces flat and Smooth bends them', () => {
  const m = scene('beam', { bevel: 0.0625 });
  const top = m.islands.top.faces[2];
  const w = cornerNormals(m, 'weighted'), s = cornerNormals(m, 'smooth');
  for (const n of w[top]) assert.ok(n[1] > 0.999);
  assert.ok(Math.min(...s[top].map(n => n[1])) < 0.95);
});
import { PLATFORMS, platformTD, screenPxPerM, sheetNeed, rightSheet, sharpness } from '../labs/trim-sheet/plan.js';
import { normalReport, idReport, painterReport, layerReport, wearReport, defaultBake, rightMaterials, MAX_H, PLANE_M } from '../labs/trim-sheet/bake.js';
test('texel density from the platform and the camera', () => {
  assert.equal(Math.round(screenPxPerM(1440, 60, 2.5)), 499);
  assert.equal(platformTD('pc3'), 512); assert.equal(platformTD('mobile'), 256); assert.equal(platformTD('pc1'), 1024); assert.equal(platformTD('vr'), 1024);
  assert.equal(sharpness(128, 499).verdict, 'blurry'); assert.equal(sharpness(2048, 499).verdict, 'wasted'); assert.equal(sharpness(512, 499).verdict, 'sharp');
  assert.ok(Object.keys(PLATFORMS).length >= 5);
});
test('the sheet size follows from the density', () => {
  assert.equal(sheetNeed(512, 1024).px, 1024); assert.equal(rightSheet(512), 1024);
  assert.equal(rightSheet(256), 512); assert.equal(rightSheet(1024), 2048);
  assert.ok(!sheetNeed(1024, 1024).fits); assert.equal(sheetNeed(512, 1024).repeat, 2);
});
test('bake rules: selected to active, extrusion, ray distance, size, ID passes', () => {
  assert.equal(PLANE_M, 2);
  const good = { ...defaultBake(), type: 'normal', s2a: true, extrusion: MAX_H, rayDist: 0 };
  assert.ok(normalReport(good).ok);
  assert.ok(normalReport({ ...good, s2a: false }).flat);
  assert.deepEqual(normalReport({ ...good, extrusion: 0.02 }).clipped.sort(), ['bevelStone', 'bevelWood', 'beam', 'molding', 'stone'].sort());
  assert.ok(normalReport({ ...good, rayDist: 0.02 }).lost);
  assert.ok(!normalReport({ ...good, size: 512 }).ok);
  const id = { ...good, type: 'diffuse', direct: false, indirect: false, color: true };
  assert.ok(idReport(id, rightMaterials()).ok);
  assert.ok(idReport({ ...id, direct: true }, rightMaterials()).lit);
  assert.deepEqual(idReport(id, { ...rightMaterials(), iron: 'wood' }).wrong, ['iron']);
});
test('Painter: distance, ID source, masks and wear', () => {
  const p = { high: true, maps: { normal: true, wsn: true, id: true, ao: true, curvature: true, position: true, thickness: true }, idSource: 'material', frontal: 0.02, size: 1024 };
  assert.ok(painterReport(p).ok); assert.ok(painterReport({ ...p, frontal: 0.01 }).clipped); assert.ok(!painterReport({ ...p, idSource: 'vertex' }).ok);
  assert.ok(!layerReport([{ mat: 'wood', mask: null }]).ok);
  const L = [{ mat: 'wood', mask: 'wood' }, { mat: 'stone', mask: 'stone' }, { mat: 'iron', mask: 'iron' }];
  assert.ok(layerReport(L).ok); assert.ok(!layerReport([...L, { mat: 'stone', mask: null }]).ok, 'an unmasked layer on top covers everything');
  assert.ok(!wearReport(L).ok); assert.ok(wearReport(L.map(l => ({ ...l, edge: true, dirt: true }))).ok);
});
