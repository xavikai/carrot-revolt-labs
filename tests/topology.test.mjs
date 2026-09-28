import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../labs/topology/mesh.js';
import { box, tube, grid, cornerLoss, elbowVolume, quadStone, maxSnapError, SLAB } from '../labs/topology/models.js';
import { STAGES, startState } from '../labs/topology/stages.js';

const cube = () => box(1, 1, 1);
const outward = m => m.f.every(f => M.V.dot(M.faceNormal(m, f), M.faceCenter(m, f)) > 0);

test('statistics: a cube has 6 quads and 8 poles with 3 edges', () => {
  const s = M.stats(cube());
  assert.deepEqual([s.verts, s.edges, s.faces, s.quads, s.poles3.length, s.holes], [8, 12, 6, 6, 8, 0]);
  assert.equal(M.stats(grid(3, 2)).poles3.length, 0, 'border vertices are not poles');
});

test('loop cut: a closed ring around the cube, all quads, faces still outwards', () => {
  const r = M.edgeRing(cube(), 0, 1);
  assert.ok(r.closed); assert.equal(r.ring.length, 4);
  const m = M.loopCut(cube(), 0, 1, 0.25);
  const s = M.stats(m);
  assert.deepEqual([s.faces, s.quads, s.verts], [10, 10, 12]);
  assert.ok(outward(m));
  const xs = [...new Set(m.v.map(p => p[0]))].sort((a, b) => a - b);
  assert.ok(xs.includes(-0.5), 'the cut slides with the factor');
});

test('edge loop, connect, dissolve and tris to quads', () => {
  const t = tube([-1, 0, 1], 8);
  assert.equal(M.edgeLoop(t, 8, 9).length, 8, 'an edge loop goes round the tube');
  const c = M.connect(cube(), 0, 2);
  assert.equal(M.stats(c).tris, 2);
  assert.deepEqual(M.stats(M.dissolveEdges(c, [M.ek(0, 2)])).quads, 6);
  assert.equal(M.stats(M.trisToQuads(c)).tris, 0);
  const g = grid(2, 2), d = M.dissolveVerts(g, [4]);
  assert.equal(M.stats(d).faces, 1, 'dissolving the centre of a 2×2 grid leaves one face');
  const f = M.fill({ v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], f: [], crease: {} }, [2, 0, 3, 1], [0, 0, 0]);
  assert.ok(M.V.dot(M.faceNormal(f, f.f[0]), [0, 0, 1]) > 0.99, 'fill sorts the vertices and faces outwards');
});

test('subdivision: a cube shrinks, creases and holding edges keep the corners', () => {
  assert.ok(cornerLoss(box(...SLAB), 2) > 0.8);
  const c = box(...SLAB); for (const [a, b] of M.edges(c)) c.crease[M.ek(a, b)] = 1;
  assert.ok(cornerLoss(c, 2) < 1e-9);
  const s = M.subdivide(cube(), 1);
  assert.equal(M.stats(s).quads, 24);
});

test('deformation and retopology measurements', () => {
  const arm = tube([-1.2, -0.6, -0.2, 0, 0.2, 0.6, 1.2]);
  assert.ok(elbowVolume(arm, 90, false) < 0.8, 'linear blending collapses the joint');
  assert.ok(elbowVolume(arm, 90, true) > 0.99, 'Preserve Volume keeps it');
  assert.ok(maxSnapError(quadStone(3)) < 1e-9);
});

test('every step starts unsolved and its solution solves it', () => {
  for (const st of STAGES) for (const step of st.steps) {
    const s = startState(step);
    assert.equal(!!step.check(s), false, `${step.id} starts unsolved`);
    step.solve(s);
    assert.equal(!!step.check(s), true, `${step.id} is solved by its solution`);
  }
});
