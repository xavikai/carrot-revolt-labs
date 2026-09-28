import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../labs/editmode/em.js';
import { STAGES, startState, markReport, markIds, halfReport, loopsReport, shapeReport, bevelReport, cleanReport, stoolReport, messyCube, buildStool } from '../labs/editmode/stages.js';

const closedOk = m => { const a = E.analyze(m); return E.isClean(a) && E.windingOk(m) && E.volume(m) > 0; };

test('primitives are closed and point outwards', () => {
  for (const m of [E.box(), E.gridCube(3), E.uvSphere(16, 8)]) assert.ok(closedOk(m));
  assert.equal(E.analyze(E.gridCube(3)).verts, 56);
});

test('selection flushes between vertices, edges and faces', () => {
  const m = E.box();
  const s = E.flush(m, 'vert', { V: [4, 5, 6, 7], E: [], F: [] });
  assert.equal(s.E.length, 4); assert.equal(s.F.length, 1);
  const e = E.flush(m, 'edge', { V: [], E: ['0_4'], F: [] }); assert.deepEqual(e.V, [0, 4]); assert.equal(e.F.length, 0);
  const f = E.flush(m, 'face', { V: [], E: [], F: [1] }); assert.equal(f.V.length, 4); assert.equal(f.E.length, 4);
  // vertex → face: a face only if all its vertices were selected
  assert.equal(E.switchMode(m, 'vert', 'face', { V: [4, 5, 6], E: [], F: [] }).F.length, 0);
});

test('extrude, inset, loop cut and bevel keep a closed, outward mesh', () => {
  const c = E.box([-1, -1, 0], [1, 1, 2]), top = 1;
  const x = E.extrudeFaces(c, [top]); for (const i of x.moved) x.m.v[i][2] += 1; assert.ok(closedOk(x.m)); assert.deepEqual(x.normal, [0, 0, 1]);
  const ins = E.insetFaces(c, [top], 0.2); assert.ok(closedOk(ins.m));
  assert.deepEqual(ins.m.f[ins.F[0]].map(i => ins.m.v[i].slice(0, 2)), [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]);
  const lc = E.loopCut(c, 0, 4, 3); assert.ok(closedOk(lc.m)); assert.equal(lc.loops.length, 3); assert.equal(lc.loops[0].length, 4);
  const slid = E.loopCut(c, 0, 4, 1, 0.5); assert.equal(slid.m.v[slid.loops[0][0]][2] === 1.5 || slid.m.v[slid.loops[0][0]][2] === 0.5, true);
  const b = E.bevelEdges(c, ['0_4', '1_5', '2_6', '3_7'], 0.5, 4); assert.ok(closedOk(b.m)); assert.equal(b.m.v.length, 40);
  assert.ok(E.bevelEdges(c, ['0_4', '0_1'], 0.5, 2).error);
});

test('merge, delete and dissolve', () => {
  const m = messyCube(), a = E.analyze(m);
  assert.equal(a.duplicates, 4); assert.equal(a.loose, 1); assert.ok(a.overShared > 0); assert.equal(a.midEdge, 1);
  let r = E.mergeByDistance(m).m; assert.equal(E.analyze(r).duplicates, 0);
  const mid = r.v.findIndex(p => p[0] === 0 && p[1] === -1 && p[2] === -1); r = E.dissolveVerts(r, [mid]);
  const inner = r.f.findIndex(f => f.length === 4 && E.faceEdges(f).some(k => { const [p, q] = E.keyVerts(k); return r.v[p][0] * r.v[q][0] < 0 && r.v[p][1] * r.v[q][1] < 0 && r.v[p][2] === r.v[q][2]; }) && new Set(f.map(i => r.v[i][2])).size === 2 && !f.every(i => Math.abs(r.v[i][0]) === 1 && r.v[i][0] === r.v[f[0]][0]) && !f.every(i => r.v[i][1] === r.v[f[0]][1]));
  r = E.deleteFaces(r, [inner]);
  const diag = E.edgeKeys(r).find(k => { const [p, q] = E.keyVerts(k); return r.v[p][2] === -1 && r.v[q][2] === -1 && r.v[p][0] !== r.v[q][0] && r.v[p][1] !== r.v[q][1]; });
  r = E.dissolveEdges(r, [diag]);
  const loose = r.v.findIndex(p => p[2] === 1.8); r = E.deleteVerts(r, [loose]);
  const st = { m: r }; assert.ok(cleanReport(st).ok, JSON.stringify(E.analyze(r)));
});

test('every step starts unsolved and its solution passes', () => {
  for (const stage of STAGES) for (const step of stage.steps) {
    if (step.free) continue;
    const st = startState(step);
    assert.equal(!!step.check(st), false, `${step.id} starts solved`);
    step.solve(st); assert.equal(!!step.check(st), true, `${step.id} solution fails`);
  }
});

test('step reports', () => {
  const s1 = startState(STAGES[0].steps[0]); s1.mode = 'edit'; s1.sm = 'vert'; s1.sel = { V: [markIds(s1.m).v], E: [], F: [] };
  assert.equal(markReport(s1).v, true); s1.sel.V.push(0); assert.equal(markReport(s1).v, false);
  const s2 = startState(STAGES[0].steps[1]); assert.equal(halfReport(s2).total, 28);
  const s3 = startState(STAGES[0].steps[2]); s3.sm = 'edge';
  const eq = s3.m.v.findIndex(p => Math.abs(p[2]) < 1e-6), nb = [...E.vertexEdges(s3.m)[eq]].find(j => Math.abs(s3.m.v[j][2]) < 1e-6);
  s3.sel = { V: [], E: E.edgeLoop(s3.m, eq, nb), F: [] }; const r = loopsReport(s3); assert.equal(r.equator, true); assert.equal(r.loops, 1);
  assert.equal(shapeReport(startState(STAGES[1].steps[0]), 'e4').ok, false);
  const b = startState(STAGES[1].steps[4]); b.m = E.bevelEdges(b.m, ['0_4', '1_5', '2_6', '3_7'], 0.3, 4).m; assert.equal(bevelReport(b).ok, false);
  const stool = buildStool(); const rep = stoolReport({ m: stool }); assert.ok(rep.ok, JSON.stringify(rep));
  const m = E.box(); assert.equal(stoolReport({ m }).ok, false);
});
