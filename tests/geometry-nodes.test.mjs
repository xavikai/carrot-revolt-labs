// Geometry Nodes labs: the interpreter follows Blender's rules and every step can be solved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNode, makeLink, addLink, canLink, expose, evaluate, statsOf, LAB_OBJECTS } from '../labs/gn-shared/core.js';
import { LABS, solutionPasses, startersFail } from '../labs/gn-shared/curriculum.js';

const graph = (...nodes) => ({ nodes: [makeNode('input', 'GroupInput', 0, 0), makeNode('output', 'GroupOutput', 0, 0), ...nodes], links: [], exposed: [] });
const link = (g, ...l) => assert.ok(addLink(g, makeLink(...l)), `link ${l.join(' ')}`);

test('every solution passes its own checklist, without errors', () => {
  for (const r of solutionPasses()) assert.ok(r.ok && !r.errors.length, `GN ${r.lab}.${r.step}: ${r.failed.join('; ')} ${r.errors.join('; ')}`);
});
test('no step is already done when it starts', () => {
  for (const r of startersFail()) assert.equal(r.done, false, `GN ${r.lab}.${r.step} starts done`);
});
test('four labs of six steps, texts in three languages', () => {
  assert.equal(Object.keys(LABS).length, 4);
  for (const lab of Object.values(LABS)) { assert.equal(lab.steps.length, 6); for (const s of lab.steps) for (const t of [s.title, s.task, s.concept, s.blender, ...s.how, ...s.goals.map(g => g.text)]) for (const l of ['en', 'ca', 'es']) assert.ok(t[l], `${lab.slug}: missing ${l}`); }
});
test('the default cube has Blender counts and an empty tree shows nothing', () => {
  assert.deepEqual([8, 12, 6].join(), [statsOf(LAB_OBJECTS[1].data()).verts, statsOf(LAB_OBJECTS[1].data()).edges, statsOf(LAB_OBJECTS[1].data()).faces].join());
  assert.equal(evaluate(graph(), { lab: 1 }).stats.verts, 0);
});
test('geometry only connects to geometry, and loops are refused', () => {
  const g = graph(makeNode('a', 'TransformGeometry', 0, 0), makeNode('b', 'TransformGeometry', 0, 0), makeNode('p', 'Position', 0, 0));
  assert.equal(canLink(g, makeLink('p', 'Position', 'a', 'Geometry')), false);
  link(g, 'a', 'Geometry', 'b', 'Geometry');
  assert.equal(canLink(g, makeLink('b', 'Geometry', 'a', 'Geometry')), false);
});
test('a field into a single-value socket is a red link and is ignored', () => {
  const g = graph(makeNode('grid', 'Grid', 0, 0, { 'Size X': 2 }), makeNode('pos', 'Position', 0, 0), makeNode('sep', 'SeparateXYZ', 0, 0));
  link(g, 'grid', 'Mesh', 'output', 'Geometry'); link(g, 'pos', 'Position', 'sep', 'Vector'); link(g, 'sep', 'X', 'grid', 'Size X');
  const r = evaluate(g, { lab: 2 });
  assert.equal(r.invalidLinks.size, 1); assert.ok(r.warnings.grid.includes('fieldToSingle')); assert.equal(r.stats.verts, 9);
});
test('Set Position evaluates a field once per vertex', () => {
  const g = graph(makeNode('grid', 'Grid', 0, 0, { 'Vertices X': 4, 'Vertices Y': 4 }), makeNode('set', 'SetPosition', 0, 0), makeNode('idx', 'Index', 0, 0), makeNode('z', 'CombineXYZ', 0, 0));
  link(g, 'grid', 'Mesh', 'set', 'Geometry'); link(g, 'set', 'Geometry', 'output', 'Geometry'); link(g, 'idx', 'Index', 'z', 'Z'); link(g, 'z', 'Vector', 'set', 'Offset');
  const r = evaluate(g, { lab: 2 });
  assert.deepEqual(r.geometry.mesh.verts.map(v => v[2]), Array.from({ length: 16 }, (_, i) => i));
});
test('Collection Info: whole collection, or one rock per point with Separate Children and Pick Instance', () => {
  const make = (pick) => { const g = graph(makeNode('d', 'DistributePoints', 0, 0, { Density: 1 }), makeNode('c', 'CollectionInfo', 0, 0, { 'Separate Children': pick, 'Reset Children': pick }), makeNode('i', 'InstanceOnPoints', 0, 0, { 'Pick Instance': pick })); link(g, 'input', 'Geometry', 'd', 'Mesh'); link(g, 'd', 'Points', 'i', 'Points'); link(g, 'c', 'Instances', 'i', 'Instance'); link(g, 'i', 'Instances', 'output', 'Geometry'); return evaluate(g, { lab: 3 }).geometry; };
  const whole = make(false), one = make(true);
  assert.equal(whole.instances.length, one.instances.length);
  assert.equal(whole.instances[0].geometry.instances[0].geometry.instances.length, 3, "each point gets the whole collection");
  assert.ok(one.instances.every(s => !s.geometry.instances.length));
});
test('Realize Instances turns instances into mesh data; the same seed gives the same scatter', () => {
  const g = graph(makeNode('d', 'DistributePoints', 0, 0, { Density: 1, Seed: 4 }), makeNode('c', 'Cube', 0, 0), makeNode('i', 'InstanceOnPoints', 0, 0), makeNode('r', 'RealizeInstances', 0, 0));
  link(g, 'input', 'Geometry', 'd', 'Mesh'); link(g, 'd', 'Points', 'i', 'Points'); link(g, 'c', 'Mesh', 'i', 'Instance'); link(g, 'i', 'Instances', 'r', 'Geometry'); link(g, 'r', 'Geometry', 'output', 'Geometry');
  const a = evaluate(g, { lab: 3 }), b = evaluate(g, { lab: 3 });
  assert.equal(a.stats.instances, 0); assert.ok(a.stats.meshVerts > 8);
  assert.deepEqual(a.geometry.mesh.verts, b.geometry.mesh.verts);
});
test('an exposed input is read from the modifier', () => {
  const g = graph(makeNode('c', 'Cube', 0, 0)); link(g, 'c', 'Mesh', 'output', 'Geometry');
  assert.ok(expose(g, 'c', 'Size', 'Size')); g.exposed[0].value = [4, 4, 4];
  assert.equal(evaluate(g, { lab: 1 }).stats.maxZ, 2);
});
test('a muted node lets its input pass', () => {
  const g = graph(makeNode('t', 'TransformGeometry', 0, 0, { Translation: [0, 0, 5] })); link(g, 'input', 'Geometry', 't', 'Geometry'); link(g, 't', 'Geometry', 'output', 'Geometry');
  assert.equal(evaluate(g, { lab: 1 }).stats.minZ, 4); g.nodes.find(n => n.id === 't').muted = true; assert.equal(evaluate(g, { lab: 1 }).stats.minZ, -1);
});
