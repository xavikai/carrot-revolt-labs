// Carrot Revolt Labs · a small, deterministic Geometry Nodes interpreter for the four browser labs.
//
// It follows Blender's own model:
//  · Geometry sockets carry a whole geometry set with up to four components
//    (Mesh, Point Cloud, Curve, Instances). Nodes copy it, change it and pass it on.
//  · Fields (diamond sockets) are not values but functions: they are evaluated
//    later, once per element (vertex, face, point, instance), by the node that uses them.
//  · Instances keep a reference to their source geometry plus a transform matrix,
//    until Realize Instances turns them into real mesh data.
// The meshes are real (vertices and faces), so the counts shown in the
// Spreadsheet, the viewport statistics and the socket tooltips are the real ones.

const socket = (key, type, o = {}) => ({ key, label: o.label || key, type, ...o });
const deg = Math.PI / 180;

// Blender default theme: the colour class of every node header.
export const NODE_CLASS = { input: 'input', output: 'output', geometry: 'geometry', converter: 'converter', vector: 'vector', group: 'group', attribute: 'attribute' };

export const NODES = {
  GroupInput: { name: 'Group Input', cls: 'group', menu: ['Group'], outputs: [socket('Geometry', 'geometry')] },
  GroupOutput: { name: 'Group Output', cls: 'group', menu: ['Group'], inputs: [socket('Geometry', 'geometry')] },
  Viewer: { name: 'Viewer', cls: 'output', menu: ['Output'], props: { domain: ['Auto'] }, inputs: [socket('Geometry', 'geometry'), socket('Value', 'float', { field: true, value: 0, hideValue: true })] },
  Value: { name: 'Value', cls: 'input', menu: ['Input', 'Constant'], body: 'value', outputs: [socket('Value', 'float')] },
  CollectionInfo: { name: 'Collection Info', cls: 'input', menu: ['Input', 'Scene'], props: { space: ['Original', 'Relative'] }, inputs: [socket('Collection', 'collection', { value: 'Rocks', options: ['Rocks', 'Trees'] }), socket('Separate Children', 'bool', { value: false }), socket('Reset Children', 'bool', { value: false })], outputs: [socket('Instances', 'geometry')] },
  Position: { name: 'Position', cls: 'input', menu: ['Geometry', 'Read'], outputs: [socket('Position', 'vector', { field: true })] },
  Normal: { name: 'Normal', cls: 'input', menu: ['Geometry', 'Read'], outputs: [socket('Normal', 'vector', { field: true })] },
  Index: { name: 'Index', cls: 'input', menu: ['Geometry', 'Read'], outputs: [socket('Index', 'int', { field: true })] },
  SetPosition: { name: 'Set Position', cls: 'geometry', menu: ['Geometry', 'Write'], inputs: [socket('Geometry', 'geometry'), socket('Selection', 'bool', { value: true, field: true, hideValue: true }), socket('Position', 'vector', { field: true, implicit: 'position', hideValue: true }), socket('Offset', 'vector', { value: [0, 0, 0], field: true, unit: 'm' })], outputs: [socket('Geometry', 'geometry')] },
  TransformGeometry: { name: 'Transform Geometry', cls: 'geometry', menu: ['Geometry', 'Operations'], inputs: [socket('Geometry', 'geometry'), socket('Translation', 'vector', { value: [0, 0, 0], unit: 'm' }), socket('Rotation', 'rotation', { value: [0, 0, 0] }), socket('Scale', 'vector', { value: [1, 1, 1] })], outputs: [socket('Geometry', 'geometry')] },
  JoinGeometry: { name: 'Join Geometry', cls: 'geometry', menu: ['Geometry', 'Operations'], inputs: [socket('Geometry', 'geometry', { multi: true })], outputs: [socket('Geometry', 'geometry')] },
  CurveCircle: { name: 'Curve Circle', cls: 'geometry', menu: ['Curve', 'Primitives'], props: { mode: ['Radius', 'Points'] }, inputs: [socket('Resolution', 'int', { value: 32, min: 3, max: 64 }), socket('Radius', 'float', { value: 1, min: 0, unit: 'm' })], outputs: [socket('Curve', 'geometry')] },
  CurveLine: { name: 'Curve Line', cls: 'geometry', menu: ['Curve', 'Primitives'], props: { mode: ['Points', 'Direction'] }, inputs: [socket('Start', 'vector', { value: [0, 0, 0], unit: 'm' }), socket('End', 'vector', { value: [0, 0, 1], unit: 'm' })], outputs: [socket('Curve', 'geometry')] },
  QuadraticBezier: { name: 'Quadratic Bézier', cls: 'geometry', menu: ['Curve', 'Primitives'], inputs: [socket('Resolution', 'int', { value: 16, min: 1, max: 64 }), socket('Start', 'vector', { value: [-1, 0, 0], unit: 'm' }), socket('Middle', 'vector', { value: [0, 2, 0], unit: 'm' }), socket('End', 'vector', { value: [1, 0, 0], unit: 'm' })], outputs: [socket('Curve', 'geometry')] },
  CurveToMesh: { name: 'Curve to Mesh', cls: 'geometry', menu: ['Curve', 'Operations'], inputs: [socket('Curve', 'geometry'), socket('Profile Curve', 'geometry'), socket('Fill Caps', 'bool', { value: false })], outputs: [socket('Mesh', 'geometry')] },
  CurveToPoints: { name: 'Curve to Points', cls: 'geometry', menu: ['Curve', 'Operations'], props: { mode: ['Count', 'Evaluated'] }, inputs: [socket('Curve', 'geometry'), socket('Count', 'int', { value: 10, min: 1, max: 200, modes: ['Count'] })], outputs: [socket('Points', 'geometry'), socket('Tangent', 'vector', { field: true }), socket('Normal', 'vector', { field: true }), socket('Rotation', 'rotation', { field: true })] },
  ResampleCurve: { name: 'Resample Curve', cls: 'geometry', menu: ['Curve', 'Operations'], props: { mode: ['Count'] }, inputs: [socket('Curve', 'geometry'), socket('Selection', 'bool', { value: true, field: true, hideValue: true }), socket('Count', 'int', { value: 10, min: 1, max: 200 })], outputs: [socket('Curve', 'geometry')] },
  InstanceOnPoints: { name: 'Instance on Points', cls: 'geometry', menu: ['Instances'], inputs: [socket('Points', 'geometry'), socket('Selection', 'bool', { value: true, field: true, hideValue: true }), socket('Instance', 'geometry'), socket('Pick Instance', 'bool', { value: false, field: true }), socket('Instance Index', 'int', { field: true, implicit: 'index', hideValue: true }), socket('Rotation', 'rotation', { value: [0, 0, 0], field: true }), socket('Scale', 'vector', { value: [1, 1, 1], field: true })], outputs: [socket('Instances', 'geometry')] },
  RealizeInstances: { name: 'Realize Instances', cls: 'geometry', menu: ['Instances'], inputs: [socket('Geometry', 'geometry')], outputs: [socket('Geometry', 'geometry')] },
  Cube: { name: 'Cube', cls: 'geometry', menu: ['Mesh', 'Primitives'], inputs: [socket('Size', 'vector', { value: [1, 1, 1], min: 0, unit: 'm' })], outputs: [socket('Mesh', 'geometry')] },
  Grid: { name: 'Grid', cls: 'geometry', menu: ['Mesh', 'Primitives'], inputs: [socket('Size X', 'float', { value: 1, min: 0, unit: 'm' }), socket('Size Y', 'float', { value: 1, min: 0, unit: 'm' }), socket('Vertices X', 'int', { value: 3, min: 2, max: 64 }), socket('Vertices Y', 'int', { value: 3, min: 2, max: 64 })], outputs: [socket('Mesh', 'geometry')] },
  UVSphere: { name: 'UV Sphere', cls: 'geometry', menu: ['Mesh', 'Primitives'], inputs: [socket('Segments', 'int', { value: 32, min: 3, max: 64 }), socket('Rings', 'int', { value: 16, min: 2, max: 32 }), socket('Radius', 'float', { value: 1, min: 0, unit: 'm' })], outputs: [socket('Mesh', 'geometry')] },
  DistributePoints: { name: 'Distribute Points on Faces', cls: 'geometry', menu: ['Point'], props: { method: ['Random'] }, inputs: [socket('Mesh', 'geometry'), socket('Selection', 'bool', { value: true, field: true, hideValue: true }), socket('Density', 'float', { value: 10, min: 0, max: 100, field: true }), socket('Seed', 'int', { value: 0 })], outputs: [socket('Points', 'geometry'), socket('Normal', 'vector', { field: true }), socket('Rotation', 'rotation', { field: true })] },
  Math: { name: 'Math', cls: 'converter', menu: ['Utilities', 'Math'], props: { operation: ['Add', 'Subtract', 'Multiply', 'Divide', 'Power', 'Sine', 'Cosine', 'Absolute', 'Greater Than', 'Less Than'] }, props2: { clamp: false }, inputs: [socket('Value', 'float', { value: .5, field: true }), socket('Value_001', 'float', { label: 'Value', value: .5, field: true })], outputs: [socket('Value', 'float', { field: true, capable: true })] },
  VectorMath: { name: 'Vector Math', cls: 'vector', menu: ['Utilities', 'Vector'], props: { operation: ['Add', 'Subtract', 'Multiply', 'Scale', 'Length'] }, inputs: [socket('Vector', 'vector', { value: [0, 0, 0], field: true }), socket('Vector_001', 'vector', { label: 'Vector', value: [0, 0, 0], field: true }), socket('Scale', 'float', { value: 1, field: true })], outputs: [socket('Vector', 'vector', { field: true, capable: true }), socket('Value', 'float', { field: true, capable: true })] },
  CombineXYZ: { name: 'Combine XYZ', cls: 'converter', menu: ['Utilities', 'Vector'], inputs: ['X', 'Y', 'Z'].map(k => socket(k, 'float', { value: 0, field: true })), outputs: [socket('Vector', 'vector', { field: true, capable: true })] },
  SeparateXYZ: { name: 'Separate XYZ', cls: 'converter', menu: ['Utilities', 'Vector'], inputs: [socket('Vector', 'vector', { value: [0, 0, 0], field: true })], outputs: ['X', 'Y', 'Z'].map(k => socket(k, 'float', { field: true, capable: true })) },
  EulerToRotation: { name: 'Euler to Rotation', cls: 'converter', menu: ['Utilities', 'Rotation'], inputs: [socket('Euler', 'vector', { value: [0, 0, 0], field: true, euler: true })], outputs: [socket('Rotation', 'rotation', { field: true, capable: true })] },
  RandomValue: { name: 'Random Value', cls: 'converter', menu: ['Utilities'], props: { type: ['Float', 'Vector'] }, inputs: [socket('Min', 'float', { value: 0, types: ['Float'] }), socket('Max', 'float', { value: 1, types: ['Float'] }), socket('Min_vec', 'vector', { label: 'Min', value: [0, 0, 0], types: ['Vector'] }), socket('Max_vec', 'vector', { label: 'Max', value: [1, 1, 1], types: ['Vector'] }), socket('ID', 'int', { field: true, implicit: 'index', hideValue: true }), socket('Seed', 'int', { value: 0, field: true })], outputs: [socket('Value', 'float', { field: true })] },
};
// Unary Math operations hide the second input, like Blender.
const UNARY = new Set(['Sine', 'Cosine', 'Absolute']);
// Which inputs and outputs are visible for the current node settings.
export function visibleInputs(node) {
  const def = NODES[node.type]; let list = def.inputs || [];
  const p = node.params || {};
  if (node.type === 'Math') list = list.filter(s => s.key !== 'Value_001' || !UNARY.has(p.operation));
  if (node.type === 'VectorMath') list = list.filter(s => s.key === 'Vector' || (s.key === 'Vector_001' && !['Scale', 'Length'].includes(p.operation)) || (s.key === 'Scale' && p.operation === 'Scale'));
  return list.filter(s => (!s.types || s.types.includes(p.type)) && (!s.modes || s.modes.includes(p.mode)));
}
export function visibleOutputs(node, graph) {
  const def = NODES[node.type]; let list = def.outputs || [];
  if (node.type === 'VectorMath') list = list.filter(s => (s.key === 'Value') === (node.params.operation === 'Length'));
  if (node.type === 'RandomValue' && node.params.type === 'Vector') list = [socket('Value', 'vector', { field: true })];
  if (node.type === 'GroupInput' && graph) list = [...list, ...(graph.exposed || []).map(e => socket(e.id, e.type, { label: e.label }))];
  return list;
}
export function makeNode(id, type, x, y, params = {}) {
  const def = NODES[type], p = {};
  for (const s of def?.inputs || []) if ('value' in s) p[s.key] = Array.isArray(s.value) ? [...s.value] : s.value;
  for (const [k, opts] of Object.entries(def?.props || {})) p[k] = opts[0];
  if (type === 'Value') p.value = .5;
  if (type === 'Math') p.clamp = false;
  return { id, type, x, y, params: { ...p, ...params } };
}
export const makeLink = (from, out, to, input) => ({ from, out, to, input });
export function socketOf(graph, id, key, dir) {
  const n = graph.nodes.find(x => x.id === id); if (!n) return null;
  if (n.type === 'GroupInput' && dir === 'out' && key.startsWith('param:')) { const e = graph.exposed?.find(x => x.id === key); return e ? socket(key, e.type, { label: e.label }) : null; }
  if (n.type === 'RandomValue' && dir === 'out') return visibleOutputs(n)[0];
  if (n.type === 'Viewer' && dir === 'in' && key === 'Value') return socket('Value', n.params.valueType || 'float', { field: true, hideValue: true, value: 0 });
  return NODES[n.type]?.[dir === 'out' ? 'outputs' : 'inputs']?.find(s => s.key === key) || null;
}
const DATA = new Set(['float', 'int', 'bool', 'vector', 'rotation']);
// Blender converts between the data types implicitly. Geometry and collections only connect to themselves.
export const convertible = (a, b) => a === b || (DATA.has(a) && DATA.has(b) && !(a === 'rotation' && !['rotation', 'vector'].includes(b)) && !(b === 'rotation' && !['rotation', 'vector'].includes(a)));
export function canLink(graph, link) {
  const a = socketOf(graph, link.from, link.out, 'out'), b = socketOf(graph, link.to, link.input, 'in');
  if (!a || !b || link.from === link.to) return false;
  const bType = graph.nodes.find(n => n.id === link.to)?.type === 'Viewer' && link.input === 'Value' ? a.type : b.type;
  if (!convertible(a.type, bType)) return false;
  const seen = new Set(), stack = [link.to];
  while (stack.length) { const id = stack.pop(); if (id === link.from) return false; if (seen.has(id)) continue; seen.add(id); graph.links.filter(l => l.from === id).forEach(l => stack.push(l.to)); }
  return true;
}
export function addLink(graph, link) {
  if (!canLink(graph, link)) return false;
  const input = socketOf(graph, link.to, link.input, 'in');
  graph.links = graph.links.filter(l => !(l.to === link.to && l.input === link.input && (!input.multi || (l.from === link.from && l.out === link.out))));
  const target = graph.nodes.find(n => n.id === link.to);
  if (target?.type === 'Viewer' && link.input === 'Value') target.params.valueType = socketOf(graph, link.from, link.out, 'out').type === 'vector' ? 'vector' : 'float';
  graph.links.push(link); return true;
}
// Exposing a node input adds a socket to Group Input; the modifier then supplies its value.
export function expose(graph, nodeId, key, label) {
  const node = graph.nodes.find(n => n.id === nodeId), target = socketOf(graph, nodeId, key, 'in');
  if (!node || !target || !('value' in target) || target.type === 'geometry') return false;
  const id = `param:${nodeId}:${key}`;
  if (!graph.exposed) graph.exposed = [];
  if (!graph.exposed.some(e => e.id === id)) { const v = node.params[key] ?? target.value; graph.exposed.push({ id, label: label || target.label, type: target.type, value: Array.isArray(v) ? [...v] : v, targetNode: nodeId, targetSocket: key, unit: target.unit, euler: target.type === 'rotation' }); }
  const inputNode = graph.nodes.find(n => n.type === 'GroupInput');
  return addLink(graph, makeLink(inputNode.id, id, nodeId, key));
}
export function removeExposed(graph, id) { graph.exposed = (graph.exposed || []).filter(e => e.id !== id); graph.links = graph.links.filter(l => l.out !== id); }

/* ── Small vector and matrix library (row-major 4 × 4) ── */
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]], scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const MAT = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j]; return r; },
  // Blender's default Euler order is XYZ: the matrix is Rz · Ry · Rx.
  euler([x, y, z]) {
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    return [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx, 0, sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx, 0, -sy, cy * sx, cy * cx, 0, 0, 0, 0, 1];
  },
  compose(t, r, s) { const m = MAT.euler(r); for (let i = 0; i < 3; i++) { m[i * 4] *= s[0]; m[i * 4 + 1] *= s[1]; m[i * 4 + 2] *= s[2]; m[i * 4 + 3] = t[i]; } return m; },
  point: (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]],
  translation: m => [m[3], m[7], m[11]],
  scale: m => [Math.hypot(m[0], m[4], m[8]), Math.hypot(m[1], m[5], m[9]), Math.hypot(m[2], m[6], m[10])],
  rotation(m) { const s = MAT.scale(m), r = (i, j) => m[i * 4 + j] / (s[j] || 1); const sy = -r(2, 0); const y = Math.asin(Math.max(-1, Math.min(1, sy))); return Math.abs(sy) < .9999 ? [Math.atan2(r(2, 1), r(2, 2)), y, Math.atan2(r(1, 0), r(0, 0))] : [Math.atan2(-r(1, 2), r(1, 1)), y, 0]; },
};
// The rotation that turns +Z towards a direction (used for normals and tangents).
function eulerFromZ(dir) {
  const z = V.norm(dir); if (V.len(z) < .5) return [0, 0, 0];
  const ref = Math.abs(z[2]) > .95 ? [1, 0, 0] : [0, 0, 1];
  const x = V.norm(V.cross(ref, z)), y = V.cross(z, x);
  const m = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, 0, 0, 0, 1];
  return MAT.rotation(m);
}

/* ── Geometry sets ── */
export const emptyGeometry = () => ({ mesh: null, points: [], curves: [], instances: [] });
const cloneGeo = g => g ? { mesh: g.mesh ? { verts: g.mesh.verts.map(v => [...v]), faces: g.mesh.faces.map(f => [...f]), source: g.mesh.source } : null, points: g.points.map(p => ({ ...p, position: [...p.position], attrs: { ...p.attrs } })), curves: g.curves.map(c => ({ ...c, points: c.points.map(p => [...p]) })), instances: g.instances.map(i => ({ ...i, matrix: [...i.matrix] })) } : emptyGeometry();
const meshGeo = (verts, faces, source) => ({ ...emptyGeometry(), mesh: { verts, faces, source } });
function joinMeshes(a, b) { if (!a) return b; if (!b) return a; const o = a.verts.length; return { verts: [...a.verts, ...b.verts], faces: [...a.faces, ...b.faces.map(f => f.map(i => i + o))], source: a.source === b.source ? a.source : 'mixed' }; }
function joinGeo(list) { const r = emptyGeometry(); for (const g of list) { if (!g) continue; r.mesh = joinMeshes(r.mesh, g.mesh); r.points.push(...g.points); r.curves.push(...g.curves); r.instances.push(...g.instances); } return r; }
export const isEmpty = g => !g || (!g.mesh?.verts.length && !g.points.length && !g.curves.length && !g.instances.length);

/* Primitives with Blender's vertex counts */
export function cubeMesh(size) {
  const [sx, sy, sz] = size.map(v => v / 2), verts = [];
  for (const z of [-sz, sz]) for (const y of [-sy, sy]) for (const x of [-sx, sx]) verts.push([x, y, z]);
  return { verts, faces: [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]], source: 'cube' };
}
export function gridMesh(sx, sy, nx, ny) {
  nx = Math.max(2, Math.round(nx)); ny = Math.max(2, Math.round(ny));
  const verts = [], faces = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) verts.push([(x / (nx - 1) - .5) * sx, (y / (ny - 1) - .5) * sy, 0]);
  for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) { const a = y * nx + x; faces.push([a, a + 1, a + nx + 1, a + nx]); }
  return { verts, faces, source: 'grid', nx, ny };
}
function sphereMesh(seg, rings, r) {
  seg = Math.max(3, Math.round(seg)); rings = Math.max(2, Math.round(rings));
  const verts = [[0, 0, r]], faces = [];
  for (let j = 1; j < rings; j++) { const t = Math.PI * j / rings; for (let i = 0; i < seg; i++) { const p = 2 * Math.PI * i / seg; verts.push([r * Math.sin(t) * Math.cos(p), r * Math.sin(t) * Math.sin(p), r * Math.cos(t)]); } }
  verts.push([0, 0, -r]); const last = verts.length - 1, at = (j, i) => 1 + (j - 1) * seg + (i % seg);
  for (let i = 0; i < seg; i++) faces.push([0, at(1, i), at(1, i + 1)]);
  for (let j = 1; j < rings - 1; j++) for (let i = 0; i < seg; i++) faces.push([at(j, i), at(j + 1, i), at(j + 1, i + 1), at(j, i + 1)]);
  for (let i = 0; i < seg; i++) faces.push([at(rings - 1, i + 1), at(rings - 1, i), last]);
  return { verts, faces, source: 'sphere' };
}
// A low-poly rock: an octahedron subdivided once and jittered with a fixed seed.
function rockMesh(seed, size) {
  const base = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], tris = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  const verts = base.map(v => [...v]), faces = [], mid = new Map();
  const m = (a, b) => { const k = a < b ? `${a}_${b}` : `${b}_${a}`; if (!mid.has(k)) { verts.push(V.norm(V.lerp(verts[a], verts[b], .5))); mid.set(k, verts.length - 1); } return mid.get(k); };
  for (const [a, b, c] of tris) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); faces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
  return { verts: verts.map((v, i) => { const j = .78 + .38 * hash(i, seed); return [v[0] * size[0] * j, v[1] * size[1] * j, Math.max(-.25, v[2]) * size[2] * j]; }), faces, source: 'rock' };
}
function treeMesh(size) {
  const verts = [], faces = [], n = 7;
  const ring = (r, z) => { const o = verts.length; for (let i = 0; i < n; i++) verts.push([Math.cos(i / n * 2 * Math.PI) * r * size[0], Math.sin(i / n * 2 * Math.PI) * r * size[1], z * size[2]]); return o; };
  const a = ring(.08, 0), b = ring(.08, .5); for (let i = 0; i < n; i++) faces.push([a + i, a + (i + 1) % n, b + (i + 1) % n, b + i]);
  const c = ring(.45, .45); verts.push([0, 0, 1.6 * size[2]]); const top = verts.length - 1; for (let i = 0; i < n; i++) faces.push([c + i, c + (i + 1) % n, top]);
  return { verts, faces, source: 'tree' };
}
// The objects inside the two collections of the scene (positions as in the Outliner).
export const COLLECTIONS = {
  Rocks: [{ name: 'Rock.001', mesh: () => rockMesh(3, [.5, .42, .32]), position: [-2.5, 0, 0] }, { name: 'Rock.002', mesh: () => rockMesh(7, [.32, .38, .22]), position: [0, 0, 0] }, { name: 'Rock.003', mesh: () => rockMesh(11, [.62, .36, .3]), position: [2.5, 0, 0] }],
  Trees: [{ name: 'Pine.001', mesh: () => treeMesh([1, 1, 1]), position: [-1.5, 0, 0] }, { name: 'Pine.002', mesh: () => treeMesh([.8, .8, 1.3]), position: [1.5, 0, 0] }],
};

/* Curves are polylines here (Blender evaluates them to points the same way). */
const curveLength = c => { let l = 0; const n = c.points.length; for (let i = 1; i < n; i++) l += V.len(V.sub(c.points[i], c.points[i - 1])); if (c.cyclic && n > 1) l += V.len(V.sub(c.points[0], c.points[n - 1])); return l; };
function sampleCurve(c, count) {
  const pts = c.cyclic ? [...c.points, c.points[0]] : c.points, total = curveLength(c), out = [];
  if (pts.length < 2 || total < 1e-9) return { points: Array.from({ length: count }, () => [...(pts[0] || [0, 0, 0])]), tangents: Array.from({ length: count }, () => [1, 0, 0]) };
  const n = c.cyclic ? count : count - 1, tangents = [];
  for (let k = 0; k < count; k++) {
    let d = n ? total * k / n : 0, i = 1;
    while (i < pts.length - 1 && d > V.len(V.sub(pts[i], pts[i - 1]))) { d -= V.len(V.sub(pts[i], pts[i - 1])); i++; }
    const seg = V.sub(pts[i], pts[i - 1]), l = V.len(seg) || 1; out.push(V.lerp(pts[i - 1], pts[i], Math.min(1, d / l))); tangents.push(V.norm(seg));
  }
  return { points: out, tangents };
}
function curveTangents(c) { const p = c.points, n = p.length; return p.map((_, i) => V.norm(V.sub(p[Math.min(n - 1, i + 1)], p[Math.max(0, i - 1)]))); }
// Blender's "Minimum Twist" normal for a curve that has no twist: perpendicular to the tangent, as horizontal as possible.
const curveNormal = t => { const n = V.cross([0, 0, 1], t); return V.len(n) > 1e-6 ? V.norm(V.cross(t, V.norm(n))) : [1, 0, 0]; };
function sweep(curve, profile, caps) {
  const tangents = curveTangents(curve), verts = [], faces = [], m = profile.points.length, n = curve.points.length;
  curve.points.forEach((p, i) => { const t = tangents[i], nrm = curveNormal(t), b = V.cross(t, nrm); for (const q of profile.points) verts.push(V.add(p, V.add(V.scale(nrm, q[0]), V.scale(b, q[1])))); });
  const segs = profile.cyclic ? m : m - 1, rows = curve.cyclic ? n : n - 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < segs; j++) { const a = i * m + j, b = i * m + (j + 1) % m, c = ((i + 1) % n) * m + (j + 1) % m, d = ((i + 1) % n) * m + j; faces.push([a, d, c, b]); }
  if (caps && profile.cyclic && !curve.cyclic && m > 2) { faces.push(Array.from({ length: m }, (_, j) => m - 1 - j)); faces.push(Array.from({ length: m }, (_, j) => (n - 1) * m + j)); }
  return { verts, faces, source: 'sweep' };
}

/* Mesh analysis */
export function edgeCount(mesh) { if (!mesh) return 0; const s = new Set(); for (const f of mesh.faces) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; s.add(a < b ? a * 1e6 + b : b * 1e6 + a); } return s.size; }
export const triCount = mesh => mesh ? mesh.faces.reduce((t, f) => t + f.length - 2, 0) : 0;
function faceNormal(mesh, f) { let n = [0, 0, 0]; for (let i = 0; i < f.length; i++) { const a = mesh.verts[f[i]], b = mesh.verts[f[(i + 1) % f.length]]; n = V.add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); } return V.norm(n); }
const faceCenter = (mesh, f) => V.scale(f.reduce((s, i) => V.add(s, mesh.verts[i]), [0, 0, 0]), 1 / f.length);
export function vertexNormals(mesh) { const n = mesh.verts.map(() => [0, 0, 0]); for (const f of mesh.faces) { const fn = faceNormal(mesh, f); for (const i of f) n[i] = V.add(n[i], fn); } return n.map(v => V.len(v) > 1e-9 ? V.norm(v) : [0, 0, 1]); }

/* Deterministic random numbers: same seed + same index = same value, as in Blender. */
export function hash(i, seed = 0) { let h = (Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((seed | 0) + 0x632be5ab, 0xc2b2ae35)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }

/* Fields: a function of the element being evaluated, plus the inputs it depends on. */
const field = (type, fn, deps) => ({ field: true, type, fn, deps: new Set(deps) });
const isField = v => !!v?.field;
const at = (v, ctx) => isField(v) ? v.fn(ctx) : v;
const depsOf = vals => vals.flatMap(v => isField(v) ? [...v.deps] : []);
const lift = (type, vals, fn) => vals.some(isField) ? field(type, ctx => fn(...vals.map(v => at(v, ctx))), depsOf(vals)) : fn(...vals);
const vec = v => Array.isArray(v) ? v.map(Number) : [Number(v) || 0, Number(v) || 0, Number(v) || 0];
const num = v => Array.isArray(v) ? (v[0] + v[1] + v[2]) / 3 : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0;
const bool = v => Array.isArray(v) ? v.some(x => x) : typeof v === 'boolean' ? v : num(v) > 0;
export const convertValue = (v, type) => type === 'vector' || type === 'rotation' ? vec(v) : type === 'bool' ? bool(v) : type === 'int' ? Math.round(num(v)) : type === 'float' ? num(v) : v;
const conv = (v, type) => isField(v) ? field(type, ctx => convertValue(v.fn(ctx), type), [...v.deps]) : convertValue(v, type);

/* Element contexts: what Position, Normal and Index mean for each domain. */
function meshVertexContexts(mesh) { const n = vertexNormals(mesh); return mesh.verts.map((p, i) => ({ position: p, normal: n[i], index: i, attrs: {} })); }
const pointContexts = pts => pts.map((p, i) => ({ position: p.position, normal: [0, 0, 1], index: i, attrs: p.attrs || {} }));
function curveContexts(curves) { const out = []; for (const c of curves) { const t = curveTangents(c); c.points.forEach((p, i) => out.push({ position: p, normal: curveNormal(t[i]), index: out.length, attrs: { tangent: t[i] } })); } return out; }
const instanceContexts = ins => ins.map((s, i) => ({ position: MAT.translation(s.matrix), normal: [0, 0, 1], index: i, attrs: {} }));

/* Default object data of each lab (what Group Input › Geometry carries). */
export function terrainMesh() { const m = gridMesh(7, 7, 18, 18); m.verts.forEach(v => { v[2] = .45 * Math.sin(v[0] * .8) * Math.cos(v[1] * .65); }); m.source = 'terrain'; return m; }
export const LAB_OBJECTS = {
  1: { object: 'Cube', data: () => meshGeo(...Object.values(cubeMesh([2, 2, 2])).slice(0, 3)) },
  2: { object: 'Plane', data: () => { const m = gridMesh(2, 2, 2, 2); return meshGeo(m.verts, m.faces, 'plane'); } },
  3: { object: 'Terrain', data: () => { const m = terrainMesh(); return meshGeo(m.verts, m.faces, 'terrain'); } },
  4: { object: 'Fence', data: () => emptyGeometry() },
};

/* Readable summaries, shown in socket tooltips (like Blender's socket inspection). */
export function describeGeometry(g) {
  if (isEmpty(g)) return [{ k: 'empty' }];
  const out = [];
  if (g.mesh?.verts.length) out.push({ k: 'mesh', verts: g.mesh.verts.length, edges: edgeCount(g.mesh), faces: g.mesh.faces.length });
  if (g.points.length) out.push({ k: 'points', n: g.points.length });
  if (g.curves.length) out.push({ k: 'curve', n: g.curves.reduce((s, c) => s + c.points.length, 0), splines: g.curves.length });
  if (g.instances.length) out.push({ k: 'instances', n: g.instances.length });
  return out;
}

export function evaluate(graph, options = {}) {
  const nodes = new Map(graph.nodes.map(n => [n.id, n])), memo = new Map(), visiting = new Set();
  const errors = [], warnings = {}, invalidLinks = new Set(), samples = {};
  const lab = options.lab || 1;
  const base = options.inputGeometry ? cloneGeo(options.inputGeometry) : LAB_OBJECTS[lab].data();
  const warn = (id, msg) => { (warnings[id] ||= []).includes(msg) || warnings[id].push(msg); };
  // Evaluate a field over a list of contexts, and remember the first values for the tooltip of its source socket.
  const sample = (v, ctxs, socketKey) => { const vals = ctxs.map(c => at(v, c)); if (isField(v) && socketKey) samples[socketKey] = vals.slice(0, 6); return vals; };
  const source = (id, key) => {
    const k = `${id}:${key}`; if (memo.has(k)) return memo.get(k);
    if (visiting.has(k)) { errors.push('Cycle'); return null; }
    const n = nodes.get(id); if (!n) return null; visiting.add(k);
    // Read an input: the linked output (converted to the socket type) or the value typed in the node.
    const input = name => {
      const spec = socketOf(graph, id, name, 'in'), links = graph.links.filter(l => l.to === id && l.input === name);
      if (spec?.multi) return links.map(l => source(l.from, l.out)).filter(Boolean);
      if (links[0]) {
        const l = links[0], v = source(l.from, l.out);
        if (isField(v) && !spec?.field) { invalidLinks.add(`${l.from}|${l.out}|${l.to}|${l.input}`); warn(id, 'fieldToSingle'); }
        else if (v != null) return spec?.type === 'geometry' ? v : conv(v, spec.type);
      }
      if (spec?.implicit === 'position') return field('vector', c => c.position, ['Position']);
      if (spec?.implicit === 'index') return field('int', c => c.index, ['Index']);
      const raw = n.params[name] ?? spec?.value;
      return Array.isArray(raw) ? [...raw] : raw;
    };
    const inKey = name => { const l = graph.links.find(x => x.to === id && x.input === name); return l ? `${l.from}:${l.out}` : null; };
    let value = null;
    try {
      // A muted node (M) passes its first input of the same type straight through.
      if (n.muted && !['GroupInput', 'GroupOutput', 'Viewer'].includes(n.type)) {
        const outSpec = socketOf(graph, id, key, 'out'), pass = visibleInputs(n).find(s => convertible(s.type, outSpec?.type) && (outSpec.type !== 'geometry' || s.type === 'geometry'));
        value = pass ? (pass.multi ? joinGeo(input(pass.key)) : input(pass.key)) : outSpec?.type === 'geometry' ? emptyGeometry() : convertValue(0, outSpec?.type);
        if (pass && outSpec?.type !== 'geometry' && !isField(value)) value = convertValue(value, outSpec.type);
        visiting.delete(k); memo.set(k, value); return value;
      }
      switch (n.type) {
        case 'GroupInput': value = key === 'Geometry' ? cloneGeo(base) : (() => { const e = graph.exposed?.find(x => x.id === key); return e ? (Array.isArray(e.value) ? [...e.value] : e.value) : null; })(); break;
        case 'Value': value = Number(n.params.value); break;
        case 'Position': value = field('vector', c => c.position, ['Position']); break;
        case 'Normal': value = field('vector', c => c.normal, ['Normal']); break;
        case 'Index': value = field('int', c => c.index, ['Index']); break;
        case 'Cube': { const m = cubeMesh(vec(input('Size')).map(v => Math.max(0, v))); value = meshGeo(m.verts, m.faces, 'cube'); break; }
        case 'Grid': { const m = gridMesh(num(input('Size X')), num(input('Size Y')), Math.min(64, num(input('Vertices X'))), Math.min(64, num(input('Vertices Y')))); value = meshGeo(m.verts, m.faces, 'grid'); break; }
        case 'UVSphere': { const m = sphereMesh(Math.min(64, num(input('Segments'))), Math.min(32, num(input('Rings'))), num(input('Radius'))); value = meshGeo(m.verts, m.faces, 'sphere'); break; }
        case 'TransformGeometry': {
          const g = cloneGeo(input('Geometry')), m = MAT.compose(vec(input('Translation')), vec(input('Rotation')), vec(input('Scale')));
          if (g.mesh) g.mesh.verts = g.mesh.verts.map(p => MAT.point(m, p));
          g.points.forEach(p => { p.position = MAT.point(m, p.position); });
          g.curves.forEach(c => { c.points = c.points.map(p => MAT.point(m, p)); });
          g.instances.forEach(s => { s.matrix = MAT.mul(m, s.matrix); });
          value = g; break;
        }
        case 'JoinGeometry': value = joinGeo(input('Geometry')); break;
        case 'SetPosition': {
          const g = cloneGeo(input('Geometry')), sel = input('Selection'), pos = input('Position'), off = input('Offset');
          const apply = (ctxs, set) => { const s = sample(sel, ctxs, inKey('Selection')), p = sample(pos, ctxs, inKey('Position')), o = sample(off, ctxs, inKey('Offset')); ctxs.forEach((c, i) => { if (s[i]) set(i, V.add(vec(p[i]), vec(o[i]))); }); };
          if (g.mesh) apply(meshVertexContexts(g.mesh), (i, p) => { g.mesh.verts[i] = p; });
          if (g.points.length) apply(pointContexts(g.points), (i, p) => { g.points[i].position = p; });
          if (g.curves.length) { const flat = g.curves.flatMap(c => c.points.map((_, j) => [c, j])); apply(curveContexts(g.curves), (i, p) => { const [c, j] = flat[i]; c.points[j] = p; }); }
          if (g.instances.length) apply(instanceContexts(g.instances), (i, p) => { const m = g.instances[i].matrix; m[3] = p[0]; m[7] = p[1]; m[11] = p[2]; });
          if (isEmpty(g)) warn(id, 'noGeometry');
          value = g; break;
        }
        case 'Math': {
          const op = n.params.operation, a = input('Value'), b = UNARY.has(op) ? 0 : input('Value_001');
          const f = (x, y) => { x = num(x); y = num(y); const r = { Add: x + y, Subtract: x - y, Multiply: x * y, Divide: y === 0 ? 0 : x / y, Power: Math.pow(x, y), Sine: Math.sin(x), Cosine: Math.cos(x), Absolute: Math.abs(x), 'Greater Than': x > y ? 1 : 0, 'Less Than': x < y ? 1 : 0 }[op]; return n.params.clamp ? Math.max(0, Math.min(1, r)) : (Number.isFinite(r) ? r : 0); };
          value = lift('float', [a, b], f); break;
        }
        case 'VectorMath': {
          const op = n.params.operation, a = input('Vector'), b = input('Vector_001'), s = input('Scale');
          if (op === 'Length') value = key === 'Value' ? lift('float', [a], x => V.len(vec(x))) : [0, 0, 0];
          else value = key === 'Value' ? 0 : lift('vector', [a, b, s], (x, y, k) => { x = vec(x); y = vec(y); return op === 'Add' ? V.add(x, y) : op === 'Subtract' ? V.sub(x, y) : op === 'Multiply' ? V.mul(x, y) : V.scale(x, num(k)); });
          break;
        }
        case 'CombineXYZ': value = lift('vector', ['X', 'Y', 'Z'].map(input), (x, y, z) => [num(x), num(y), num(z)]); break;
        case 'SeparateXYZ': value = lift('float', [input('Vector')], v => vec(v)[{ X: 0, Y: 1, Z: 2 }[key]]); break;
        case 'EulerToRotation': value = lift('rotation', [input('Euler')], v => vec(v)); break;
        case 'RandomValue': {
          const isVec = n.params.type === 'Vector', min = isVec ? vec(input('Min_vec')) : num(input('Min')), max = isVec ? vec(input('Max_vec')) : num(input('Max')), idf = input('ID'), seed = input('Seed');
          value = field(isVec ? 'vector' : 'float', c => { const i = num(at(idf, c)), s = num(at(seed, c)); return isVec ? [0, 1, 2].map(j => min[j] + (max[j] - min[j]) * hash(i * 3 + j, s)) : min + (max - min) * hash(i, s); }, ['ID', ...depsOf([idf, seed])]);
          break;
        }
        case 'CollectionInfo': {
          const name = n.params.Collection, sep = bool(input('Separate Children')), reset = bool(input('Reset Children')), objs = COLLECTIONS[name] || [];
          const child = o => ({ matrix: reset ? MAT.identity() : MAT.compose(o.position, [0, 0, 0], [1, 1, 1]), geometry: meshGeo(...Object.values(o.mesh()).slice(0, 3)), name: o.name });
          value = sep ? { ...emptyGeometry(), instances: objs.map(child) } : { ...emptyGeometry(), instances: [{ matrix: MAT.identity(), geometry: { ...emptyGeometry(), instances: objs.map(child) }, name }] };
          break;
        }
        case 'DistributePoints': {
          const g = input('Mesh') || emptyGeometry(), sel = input('Selection'), dens = input('Density'), seed = num(input('Seed')), pts = [];
          if (!g.mesh) { warn(id, g.points.length || g.curves.length || g.instances.length ? 'needsMesh' : 'noGeometry'); value = emptyGeometry(); break; }
          const ctxs = g.mesh.faces.map((f, i) => ({ position: faceCenter(g.mesh, f), normal: faceNormal(g.mesh, f), index: i, attrs: {} }));
          const s = sample(sel, ctxs, inKey('Selection')), d = sample(dens, ctxs, inKey('Density'));
          g.mesh.faces.forEach((f, fi) => {
            if (!s[fi]) return;
            for (let t = 1; t < f.length - 1; t++) {
              const A = g.mesh.verts[f[0]], B = g.mesh.verts[f[t]], C = g.mesh.verts[f[t + 1]], area = V.len(V.cross(V.sub(B, A), V.sub(C, A))) / 2;
              const expected = Math.max(0, num(d[fi])) * area, base = fi * 64 + t * 7, count = Math.floor(expected) + (hash(base, seed + 17) < expected % 1 ? 1 : 0), nrm = faceNormal(g.mesh, f);
              for (let k = 0; k < Math.min(count, 400); k++) {
                let u = hash(base * 31 + k * 2, seed), v = hash(base * 31 + k * 2 + 1, seed); if (u + v > 1) { u = 1 - u; v = 1 - v; }
                pts.push({ position: V.add(A, V.add(V.scale(V.sub(B, A), u), V.scale(V.sub(C, A), v))), attrs: { normal: nrm, rotation: eulerFromZ(nrm) } });
              }
            }
          });
          value = key === 'Points' ? { ...emptyGeometry(), points: pts.slice(0, 5000) } : key === 'Normal' ? field('vector', c => c.attrs.normal || [0, 0, 1], ['Normal']) : field('rotation', c => c.attrs.rotation || [0, 0, 0], ['Rotation']);
          break;
        }
        case 'InstanceOnPoints': {
          const g = input('Points') || emptyGeometry(), inst = input('Instance'), sel = input('Selection'), pick = input('Pick Instance'), idx = input('Instance Index'), rot = input('Rotation'), scl = input('Scale');
          let ctxs = [];
          if (g.points.length) ctxs = pointContexts(g.points);
          else if (g.mesh) { ctxs = meshVertexContexts(g.mesh); }
          else if (g.curves.length) ctxs = curveContexts(g.curves);
          if (!ctxs.length) warn(id, 'noPoints');
          if (isEmpty(inst)) warn(id, 'noInstance');
          const s = sample(sel, ctxs, inKey('Selection')), pk = sample(pick, ctxs, inKey('Pick Instance')), ix = sample(idx, ctxs, inKey('Instance Index')), r = sample(rot, ctxs, inKey('Rotation')), sc = sample(scl, ctxs, inKey('Scale'));
          const out = [];
          if (!isEmpty(inst)) ctxs.forEach((c, i) => {
            if (!s[i]) return;
            const m = MAT.compose(c.position, vec(r[i]), vec(sc[i]));
            if (pk[i] && inst.instances.length) { const list = inst.instances, chosen = list[((Math.round(num(ix[i])) % list.length) + list.length) % list.length]; out.push({ matrix: MAT.mul(m, chosen.matrix), geometry: chosen.geometry, name: chosen.name }); }
            else out.push({ matrix: m, geometry: inst, name: inst.instances.length === 1 && !inst.mesh ? inst.instances[0].name : inst.mesh ? (inst.mesh.source === 'cube' ? 'Cube' : 'Mesh') : 'Geometry' });
          });
          // The points are replaced by the instances: other components pass through.
          value = { mesh: null, points: [], curves: [], instances: [...g.instances, ...out] };
          break;
        }
        case 'RealizeInstances': {
          const g = cloneGeo(input('Geometry'));
          const realize = (geo, m) => { const parts = []; if (geo.mesh) parts.push({ ...emptyGeometry(), mesh: { verts: geo.mesh.verts.map(p => MAT.point(m, p)), faces: geo.mesh.faces, source: geo.mesh.source } }); if (geo.points.length) parts.push({ ...emptyGeometry(), points: geo.points.map(p => ({ ...p, position: MAT.point(m, p.position) })) }); if (geo.curves.length) parts.push({ ...emptyGeometry(), curves: geo.curves.map(c => ({ ...c, points: c.points.map(p => MAT.point(m, p)) })) }); for (const s of geo.instances) parts.push(realize(s.geometry, MAT.mul(m, s.matrix))); return joinGeo(parts); };
          const inst = g.instances; g.instances = [];
          value = joinGeo([g, ...inst.map(s => realize(s.geometry, s.matrix))]);
          if (value.mesh) value.mesh.source = 'realized';
          break;
        }
        case 'CurveLine': {
          const a = vec(input('Start')), b = vec(input('End'));
          value = { ...emptyGeometry(), curves: [{ points: [a, n.params.mode === 'Direction' ? V.add(a, b) : b], cyclic: false }] }; break;
        }
        case 'CurveCircle': { const r = num(input('Radius')), res = Math.max(3, Math.min(64, Math.round(num(input('Resolution'))))); value = { ...emptyGeometry(), curves: [{ points: Array.from({ length: res }, (_, i) => [Math.cos(i / res * 2 * Math.PI) * r, Math.sin(i / res * 2 * Math.PI) * r, 0]), cyclic: true }] }; break; }
        case 'QuadraticBezier': { const res = Math.max(1, Math.min(64, Math.round(num(input('Resolution'))))), a = vec(input('Start')), m = vec(input('Middle')), b = vec(input('End')); value = { ...emptyGeometry(), curves: [{ points: Array.from({ length: res + 1 }, (_, i) => { const t = i / res; return V.add(V.add(V.scale(a, (1 - t) ** 2), V.scale(m, 2 * (1 - t) * t)), V.scale(b, t * t)); }), cyclic: false }] }; break; }
        case 'ResampleCurve': { const g = cloneGeo(input('Curve')), count = Math.max(1, Math.min(200, Math.round(num(input('Count'))))); if (!g.curves.length) warn(id, 'needsCurve'); g.curves = g.curves.map(c => ({ ...c, points: sampleCurve(c, count).points })); value = g; break; }
        case 'CurveToMesh': {
          const g = input('Curve') || emptyGeometry(), prof = input('Profile Curve'), caps = bool(input('Fill Caps'));
          if (!g.curves.length) { warn(id, 'needsCurve'); value = emptyGeometry(); break; }
          let mesh = null;
          for (const c of g.curves) {
            const profiles = prof?.curves?.length ? prof.curves : [{ points: [[0, 0, 0]], cyclic: false }];
            for (const pc of profiles) mesh = joinMeshes(mesh, pc.points.length > 1 ? sweep(c, pc, caps) : { verts: c.points.map(p => [...p]), faces: [], source: 'wire' });
          }
          if (!prof?.curves?.length) warn(id, 'noProfile');
          value = { ...emptyGeometry(), mesh }; break;
        }
        case 'CurveToPoints': {
          const g = input('Curve') || emptyGeometry(), count = Math.max(1, Math.min(200, Math.round(num(input('Count'))))), pts = [];
          if (!g.curves.length) warn(id, 'needsCurve');
          for (const c of g.curves) {
            const s = n.params.mode === 'Evaluated' ? { points: c.points, tangents: curveTangents(c) } : sampleCurve(c, count);
            s.points.forEach((p, i) => { const t = s.tangents[i], nm = curveNormal(t); pts.push({ position: [...p], attrs: { tangent: t, normal: nm, rotation: eulerFromZ(t) } }); });
          }
          value = key === 'Points' ? { ...emptyGeometry(), points: pts } : key === 'Tangent' ? field('vector', c => c.attrs.tangent || [1, 0, 0], ['Tangent']) : key === 'Normal' ? field('vector', c => c.attrs.normal || [0, 0, 1], ['Normal']) : field('rotation', c => c.attrs.rotation || [0, 0, 0], ['Rotation']);
          break;
        }
      }
    } catch (error) { errors.push(`${n.type}: ${error.message}`); }
    visiting.delete(k); memo.set(k, value); return value;
  };
  const outNode = graph.nodes.find(n => n.type === 'GroupOutput');
  const outLink = outNode && graph.links.find(l => l.to === outNode.id && l.input === 'Geometry');
  const geometry = outLink ? source(outLink.from, outLink.out) || emptyGeometry() : emptyGeometry();
  if (outNode && !outLink) warn(outNode.id, 'outputEmpty');
  // Viewer node: its geometry replaces the result in the viewport while it is active, and its Value is evaluated on it.
  let viewer = null;
  const vNode = options.viewer !== false && graph.nodes.find(n => n.type === 'Viewer');
  if (vNode) {
    const gl = graph.links.find(l => l.to === vNode.id && l.input === 'Geometry'), vl = graph.links.find(l => l.to === vNode.id && l.input === 'Value');
    if (gl) {
      const vg = source(gl.from, gl.out) || emptyGeometry(), vv = vl ? source(vl.from, vl.out) : null;
      const ctxs = vg.mesh ? meshVertexContexts(vg.mesh) : vg.points.length ? pointContexts(vg.points) : vg.curves.length ? curveContexts(vg.curves) : instanceContexts(vg.instances);
      viewer = { geometry: vg, values: vv == null ? null : ctxs.map(c => at(vv, c)), domain: vg.mesh ? 'vertex' : vg.points.length ? 'point' : vg.curves.length ? 'control' : 'instance', type: vl ? socketOf(graph, vl.from, vl.out, 'out')?.type : null, node: vNode.id };
    }
  }
  // Socket inspection: also evaluate nodes that are not connected yet, so hovering any socket tells something.
  if (options.inspectAll) {
    const keep = JSON.stringify(warnings);
    for (const n of graph.nodes) for (const s of visibleOutputs(n, graph)) source(n.id, s.key);
    Object.keys(warnings).forEach(k => delete warnings[k]); Object.assign(warnings, JSON.parse(keep));
  }
  return { geometry, viewer, errors, warnings, invalidLinks, samples, memo, stats: statsOf(geometry) };
}
// Viewport statistics, counted like Blender's overlay (instances count their real vertices).
export function statsOf(g) {
  const s = { verts: 0, edges: 0, faces: 0, tris: 0, points: g.points.length, curvePoints: g.curves.reduce((t, c) => t + c.points.length, 0), splines: g.curves.length, instances: g.instances.length, meshVerts: g.mesh?.verts.length || 0 };
  const walk = (geo, k = 1) => { if (geo.mesh) { s.verts += geo.mesh.verts.length * k; s.faces += geo.mesh.faces.length * k; s.tris += triCount(geo.mesh) * k; s.edges += edgeCount(geo.mesh) * k; } for (const i of geo.instances) walk(i.geometry, k); };
  walk(g);
  const zs = g.mesh ? g.mesh.verts.map(v => v[2]) : [];
  s.minZ = zs.length ? Math.min(...zs) : 0; s.maxZ = zs.length ? Math.max(...zs) : 0;
  return s;
}
export { V, isField };
