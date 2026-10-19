import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, makeScene, OPS, collectionsOf, objectVisible, objectSelectable, drawn, users, unusedData, viewLayerTree, blenderFileTree, unusedTree, searchTree, flatten, DEFAULT_FILTER, uniqueName } from '../labs/outliner/outliner.js';
import { STAGES, startState } from '../labs/outliner/stages.js';

const clone = o => JSON.parse(JSON.stringify(o));
const small = () => makeScene({
  collections: [{ name: 'A', children: ['B'] }, { name: 'C' }],
  objects: [{ name: 'x', in: 'A', mesh: 'm', mats: ['M1'] }, { name: 'y', in: ['B', 'C'], mesh: 'm', mats: ['M1'] }, { name: 'z', type: 'LIGHT' }],
  materials: { M1: { images: ['I1'] }, M2: { images: ['I2'] }, M3: { fake: true } }, images: { I1: {}, I2: {} }, meshes: { m: {}, old: {} },
});

test('every step starts unsolved and its solution passes', () => {
  for (const st of STAGES) for (const step of st.steps) {
    const s = startState(step);
    assert.equal(!!step.check(s), false, `${step.id} is solved at start`);
    step.solve(s);
    assert.equal(!!step.check(s), true, `${step.id} solution fails`);
  }
});

test('names follow Blender (.001) and ids are unique', () => {
  assert.equal(uniqueName(new Set(['Crate', 'Crate.001']), 'Crate'), 'Crate.002');
  const ids = STAGES.flatMap(s => s.steps.map(x => x.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('move takes the object out of every collection, link adds one', () => {
  const s = small();
  OPS.linkTo(s, ['x'], 'C');
  assert.deepEqual(collectionsOf(s, 'x').sort(), ['A', 'C']);
  OPS.moveTo(s, ['x'], 'B');
  assert.deepEqual(collectionsOf(s, 'x'), ['B']);
  assert.equal(OPS.unlink(s, 'x', 'B'), false, 'never unlink the last collection');
});

test('visibility goes through the collection path', () => {
  const s = small();
  s.collections.A.hide = true;
  assert.equal(objectVisible(s, 'x'), false);
  assert.equal(objectVisible(s, 'y'), true, 'y is still visible through C');
  assert.equal(objectVisible(s, 'x', 'render'), true, 'the eye does not affect renders');
  s.collections.A.exclude = true;
  assert.equal(objectVisible(s, 'x', 'render'), false);
  s.collections.C.disableRender = true;
  assert.equal(objectVisible(s, 'y', 'render'), false);
});

test('selectable off on a collection blocks its objects', () => {
  const s = small();
  s.collections.A.selectable = false;
  assert.equal(objectSelectable(s, 'x'), false);
  assert.equal(objectSelectable(s, 'y'), true);
});

test('isolate hides every other collection', () => {
  const s = small();
  OPS.isolate(s, 'B');
  assert.equal(s.collections.A.hide, false, 'the parent stays visible');
  assert.equal(s.collections.C.hide, true);
  OPS.unhideAll(s);
  assert.equal(s.collections.C.hide, false);
});

test('a collection instance draws an excluded collection at its place', () => {
  const s = small();
  s.objects.x.loc = [0, 0, 0];
  s.cursor = [5, 0, 0];
  const inst = OPS.addInstance(s, 'A');
  assert.equal(inst, 'A', 'objects and collections have separate names');
  s.collections.A.exclude = true;
  const d = drawn(s).filter(e => e.via === inst);
  assert.ok(d.some(e => e.obj.name === 'x' && e.offset[0] === 5));
});

test('users, remap and a recursive purge that keeps fake users', () => {
  const s = small();
  assert.equal(users(s, 'material', 'M1'), 2);
  assert.deepEqual(unusedData(s).map(u => u.name).sort(), ['M2', 'M3', 'old'], 'I2 still has a user: the unused M2');
  OPS.remapUsers(s, 'material', 'M1', 'M2');
  assert.equal(users(s, 'material', 'M1'), 0);
  const t = clone(s);
  OPS.purge(t, false);
  assert.ok(t.images.I1, 'without Recursive, I1 is only freed');
  OPS.purge(s, true);
  assert.ok(!s.materials.M1 && !s.images.I1 && !s.meshes.old && s.materials.M3);
});

test('tree, filters and search', () => {
  const s = small();
  const f = clone(DEFAULT_FILTER);
  let rows = flatten(viewLayerTree(s, f));
  assert.equal(rows[0].name, ROOT);
  assert.equal(rows.filter(r => r.name === 'y').length, 2, 'a linked object is listed in each collection');
  f.types.MESH = false;
  rows = flatten(viewLayerTree(s, f));
  assert.ok(!rows.some(r => r.name === 'x') && rows.some(r => r.name === 'z'));
  f.types.MESH = true; f.contents = true; f.search = 'm1';
  rows = flatten(searchTree(viewLayerTree(s, f), f));
  assert.ok(rows.some(r => r.kind === 'material' && r.name === 'M1' && r.hit));
  f.caseSensitive = true;
  rows = flatten(searchTree(viewLayerTree(s, f), f));
  assert.ok(!rows.some(r => r.kind === 'material'));
  assert.ok(flatten(blenderFileTree(s)).some(r => r.kind === 'image' && r.name === 'I2'));
  assert.ok(flatten(unusedTree(s)).some(r => r.name === 'M3' && r.fake));
});

test('renaming a collection keeps instances and parents', () => {
  const s = small();
  s.cursor = [1, 0, 0]; const inst = OPS.addInstance(s, 'B');
  OPS.rename(s, 'collection', 'B', 'Crates');
  assert.equal(s.objects[inst].instanceOf, 'Crates');
  assert.ok(s.collections.A.children.includes('Crates'));
  assert.equal(OPS.nestCollection(s, 'A', 'Crates'), false, 'a collection cannot go inside its own child');
});
