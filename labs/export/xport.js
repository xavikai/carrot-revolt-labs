// Export Lab: Blender objects, the FBX exporter and Unity's model importer, with no DOM and no three.js,
// so the whole pipeline can be tested.
//
// Blender is right-handed and Z up; Unity is left-handed and Y up, and 1 unit = 1 metre in both.
// The FBX exporter converts the axes with Forward / Up (default -Z Forward, Y Up), and Unity flips X when it
// reads the right-handed file. Together, with the default axes: Blender (x, y, z) → Unity (−x, z, −y).
//   · Without Bake Axis Conversion (Unity) or Apply Transform (Blender) the mesh keeps Blender's local axes and
//     every root object gets a −90° rotation on X to stand up: the classic "Rotation X −89.98".
//   · Apply Scalings "All Local" writes the file in centimetres and puts a scale of 100 on the root objects;
//     Unity's Convert Units shrinks the data by 0.01, so the model looks right but its Transform says 100.
// Blender Euler XYZ: R = Rz·Ry·Rx. Unity Euler: R = Ry·Rx·Rz (Z first, then X, then Y).

// ─── Small linear algebra: 3-vectors and 3×3 matrices (row-major arrays of 9) ─────────────────────────
export const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
};
export const M3 = {
  I: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
  diag: (a, b, c) => [a, 0, 0, 0, b, 0, 0, 0, c],
  mul(a, b) { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; },
  apply: (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]],
  det: m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]),
  inv(m) {
    const d = M3.det(m); if (Math.abs(d) < 1e-12) return M3.I();
    return [(m[4] * m[8] - m[5] * m[7]) / d, (m[2] * m[7] - m[1] * m[8]) / d, (m[1] * m[5] - m[2] * m[4]) / d,
      (m[5] * m[6] - m[3] * m[8]) / d, (m[0] * m[8] - m[2] * m[6]) / d, (m[2] * m[3] - m[0] * m[5]) / d,
      (m[3] * m[7] - m[4] * m[6]) / d, (m[1] * m[6] - m[0] * m[7]) / d, (m[0] * m[4] - m[1] * m[3]) / d];
  },
  rx: a => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [1, 0, 0, 0, c, -s, 0, s, c]; },
  ry: a => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
  rz: a => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [c, -s, 0, s, c, 0, 0, 0, 1]; },
  cols: (a, b, c) => [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]],
};
export const eulerXYZ = r => M3.mul(M3.rz(r[2]), M3.mul(M3.ry(r[1]), M3.rx(r[0])));
export const unityRotation = e => M3.mul(M3.ry(e[1]), M3.mul(M3.rx(e[0]), M3.rz(e[2])));
// The Euler angles Unity's Inspector shows for a rotation matrix (ZXY order), each in (−180, 180].
export function unityEuler(q) {
  const x = Math.asin(Math.max(-1, Math.min(1, -q[5])));
  let y, z;
  if (Math.abs(q[5]) < 0.99999) { y = Math.atan2(q[2], q[8]); z = Math.atan2(q[3], q[4]); } else { y = Math.atan2(-q[6], q[0]); z = 0; }
  const n = a => { let d = deg(a); if (Math.abs(d) < 5e-4) d = 0; return d <= -180 + 1e-6 ? d + 360 : d; };
  return [n(x), n(y), n(z)];
}

// ─── Axes ────────────────────────────────────────────────────────────────────
export const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], '-X': [-1, 0, 0], '-Y': [0, -1, 0], '-Z': [0, 0, -1] };
export const AXIS_OPTIONS = ['X', 'Y', 'Z', '-X', '-Y', '-Z'];
// Blender's forward (+Y) goes to Forward, its up (+Z) to Up, and X completes a right-handed basis.
export function axisMatrix(forward = '-Z', up = 'Y') {
  const f = AXES[forward], u = AXES[up];
  if (!f || !u || Math.abs(f[0] * u[0] + f[1] * u[1] + f[2] * u[2]) > 0.5) return null;
  return M3.cols(V.cross(f, u), f, u);
}
export const FLIP_X = M3.diag(-1, 1, 1);
// Blender → Unity for the chosen axes (Unity flips X when it reads the file).
export const toUnity = (forward, up) => M3.mul(FLIP_X, axisMatrix(forward, up) || axisMatrix());
export const UNITY_M = toUnity('-Z', 'Y');

// ─── Shapes: every model is made of boxes and cylinders, in its own modelling coordinates (metres) ───
// box: [min, max]; cyl: { c: base centre, r, h } along +Z.
const box = (mn, mx, tag) => ({ box: [mn, mx], tag });
const cyl = (c, r, h, tag) => ({ cyl: { c, r, h }, tag });
export const SHAPES = {
  crate: { parts: [box([-0.4, -0.4, 0], [0.4, 0.4, 0.8])] },
  // Blender's default cylinder (radius 1, depth 2, centred): the barrel scaled in Object Mode
  cylinder: { parts: [cyl([0, 0, -1], 1, 2)] },
  barrel: { parts: [cyl([0, 0, 0], 0.3, 0.9)] },
  // a floor lamp modelled ten times too big: 18 units tall
  lamp: { parts: [cyl([0, 0, 0], 2.2, 0.5, 'base'), cyl([0, 0, 0.5], 0.25, 13.5, 'pole'), cyl([0, 0, 14], 3.2, 4, 'shade')] },
  // a door modelled around its centre
  door: { parts: [box([-0.45, -0.025, -1], [0.45, 0.025, 1])] },
  // a chair modelled around the centre of its bounding box (0.9 m tall)
  chair: { parts: [box([-0.22, -0.22, -0.03], [0.22, 0.22, 0.02], 'seat'), box([-0.22, 0.17, 0.02], [0.22, 0.22, 0.45], 'back'),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box([a * 0.2 - 0.02, b * 0.2 - 0.02, -0.45], [a * 0.2 + 0.02, b * 0.2 + 0.02, -0.03], 'leg'))] },
  table: { parts: [box([-0.6, -0.4, 0.7], [0.6, 0.4, 0.75], 'top'),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box([a * 0.54 - 0.03, b * 0.34 - 0.03, 0], [a * 0.54 + 0.03, b * 0.34 + 0.03, 0.7], 'leg'))] },
  body: { parts: [box([-0.18, -0.1, 0.9], [0.18, 0.1, 1.45], 'torso'), box([-0.1, -0.1, 1.5], [0.1, 0.12, 1.75], 'head'),
    box([-0.17, -0.07, 0], [-0.03, 0.07, 0.9], 'leg'), box([0.03, -0.07, 0], [0.17, 0.07, 0.9], 'leg'),
    box([-0.55, -0.05, 1.35], [-0.18, 0.05, 1.43], 'arm'), box([0.18, -0.05, 1.35], [0.55, 0.05, 1.43], 'arm')] },
  // collision boxes for the table (Add › Collision Box)
  col_top: { parts: [box([-0.6, -0.4, 0.7], [0.6, 0.4, 0.75])] },
  col_legs: { parts: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box([a * 0.54 - 0.03, b * 0.34 - 0.03, 0], [a * 0.54 + 0.03, b * 0.34 + 0.03, 0.7])) },
  ...Object.fromEntries([[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => [`col_leg${i}`, { parts: [box([a * 0.54 - 0.03, b * 0.34 - 0.03, 0], [a * 0.54 + 0.03, b * 0.34 + 0.03, 0.7])] }])),
  camera: { parts: [box([-0.1, -0.15, -0.1], [0.1, 0.15, 0.1])] },
  light: { parts: [box([-0.05, -0.05, -0.05], [0.05, 0.05, 0.05])] },
  empty: { parts: [box([-0.3, -0.01, -0.3], [0.3, 0.01, 0.3])] },
};
// A few points of a part in modelling coordinates (corners, or rings of a cylinder).
export function partPoints(p) {
  if (p.box) { const [a, b] = p.box; const out = []; for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) out.push([x, y, z]); return out; }
  const { c, r, h } = p.cyl, out = [];
  for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2; for (const z of [0, h]) out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), c[2] + z]); }
  return out;
}
export function bounds(points) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  return { mn, mx, size: V.sub(mx, mn), center: V.mul(V.add(mn, mx), 0.5) };
}

// ─── Blender objects ─────────────────────────────────────────────────────────
// An object: location, rotation (Euler XYZ, degrees), scale, and its mesh data = B·(modelling point) − pivot.
// B holds the rotations and scales that were applied (Ctrl A); pivot moves the origin (Set Origin).
export function makeObject(o) {
  return { type: 'MESH', loc: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], B: M3.I(), pivot: [0, 0, 0], selected: false, hidden: false,
    mods: [], flipped: 0, parent: null, ...JSON.parse(JSON.stringify(o)) };
}
export const RS = o => M3.mul(eulerXYZ(o.rot), M3.diag(...o.scale));
export const localPoint = (o, p) => V.sub(M3.apply(o.B, p), o.pivot);
export const worldPoint = (o, v) => V.add(o.loc, M3.apply(RS(o), v));
// Parts of the object's mesh after its modifiers (a Mirror modifier completes a half model).
export function meshParts(o, withModifiers = true) {
  const parts = SHAPES[o.shape]?.parts || [];
  if (o.half && !(withModifiers && o.mods.some(m => m.type === 'MIRROR'))) return parts.map(p => halfPart(p));
  return parts;
}
function halfPart(p) {
  if (p.box) { const [a, b] = p.box; return { ...p, box: [[Math.max(0, a[0]), a[1], a[2]], [Math.max(0, b[0]), b[1], b[2]]] }; }
  return { ...p, half: true };
}
export function localBounds(o, withModifiers = true) {
  const pts = []; for (const p of meshParts(o, withModifiers)) for (const q of partPoints(p)) { if (p.half && q[0] < -1e-9) continue; pts.push(localPoint(o, q)); }
  return bounds(pts);
}
export function worldBounds(o) {
  const pts = []; for (const p of meshParts(o)) for (const q of partPoints(p)) { if (p.half && q[0] < -1e-9) continue; pts.push(worldPoint(o, localPoint(o, q))); }
  return bounds(pts);
}
// Dimensions as Blender's N panel shows them: the local bounding box times the scale.
export const dimensions = o => localBounds(o).size.map((s, k) => s * Math.abs(o.scale[k]));

// ─── Blender operators ───────────────────────────────────────────────────────
export const OPS = {
  // Object › Apply (Ctrl A)
  applyLocation(o) { const inv = M3.inv(RS(o)); o.pivot = V.sub(o.pivot, M3.apply(inv, o.loc)); o.loc = [0, 0, 0]; },
  applyRotation(o) { const R = eulerXYZ(o.rot); o.B = M3.mul(R, o.B); o.pivot = M3.apply(R, o.pivot); o.rot = [0, 0, 0]; },
  applyScale(o) { const S = M3.diag(...o.scale); o.B = M3.mul(S, o.B); o.pivot = M3.apply(S, o.pivot); o.scale = [1, 1, 1]; },
  applyRotScale(o) { const m = RS(o); o.B = M3.mul(m, o.B); o.pivot = M3.apply(m, o.pivot); o.rot = [0, 0, 0]; o.scale = [1, 1, 1]; },
  applyAll(o) { const m = RS(o); o.B = M3.mul(m, o.B); o.pivot = V.sub(M3.apply(m, o.pivot), o.loc); o.loc = [0, 0, 0]; o.rot = [0, 0, 0]; o.scale = [1, 1, 1]; },
  // Object › Set Origin
  originTo(o, c) { const l = M3.apply(M3.inv(RS(o)), V.sub(c, o.loc)); o.pivot = V.add(o.pivot, l); o.loc = [...c]; },
  originToGeometry(o) { OPS.originTo(o, worldPoint(o, localBounds(o).center)); },
  // Object › Clear › Location (Alt G)
  clearLocation(o) { o.loc = [0, 0, 0]; },
  // N panel › Dimensions: Blender changes the scale of that axis only
  setDimension(o, k, value) { const s = localBounds(o).size[k]; if (s > 1e-9) o.scale[k] = value / s * Math.sign(o.scale[k] || 1); },
  // Mesh › Normals › Recalculate Outside (Shift N)
  recalcNormals(o) { o.flipped = 0; },
  // Modifier › Apply
  applyModifier(o, type) { const i = o.mods.findIndex(m => m.type === type); if (i < 0) return; o.mods.splice(i, 1); if (type === 'MIRROR') o.half = false; if (type === 'BEVEL') o.bevel = true; if (type === 'SMOOTH_BY_ANGLE') o.autoSmooth = true; },
};
export const isUniform = s => Math.abs(s[0] - s[1]) < 1e-6 && Math.abs(s[1] - s[2]) < 1e-6;
export const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;
export const nearV = (a, b, e = 1e-3) => a.every((v, k) => near(v, b[k], e));

// ─── The FBX exporter's options, with Blender's defaults ─────────────────────
export const EXPORT_DEFAULTS = {
  selectedOnly: false, visibleOnly: false, activeCollection: false,
  types: { EMPTY: true, CAMERA: true, LIGHT: true, ARMATURE: true, MESH: true, OTHER: true },
  scale: 1, applyScalings: 'All Local', forward: '-Z', up: 'Y', applyUnit: true, spaceTransform: true, applyTransform: false,
  smoothing: 'Normals Only', applyModifiers: true, looseEdges: false, tangentSpace: false,
  primaryBone: 'Y', secondaryBone: 'X', onlyDeform: false, leafBones: true,
  bakeAnim: true, keyAllBones: true, nlaStrips: true, allActions: true, forceKeying: true, samplingRate: 1, simplify: 1,
  pathMode: 'Auto', embedTextures: false,
};
export const APPLY_SCALINGS = ['All Local', 'FBX Units Scale', 'FBX Custom Scale', 'FBX All'];
export const PATH_MODES = ['Auto', 'Absolute', 'Relative', 'Match', 'Strip', 'Copy'];
// Unity's Model Import Settings (Model, Rig, Animation and Materials tabs), with Unity's defaults.
export const IMPORT_DEFAULTS = {
  scaleFactor: 1, convertUnits: true, bakeAxis: false, importBlendShapes: true, importVisibility: true, importCameras: true, importLights: true, preserveHierarchy: false,
  meshCompression: 'Off', readWrite: false, optimizeMesh: 'Everything', generateColliders: false, normals: 'Import',
  animationType: 'Generic', avatar: 'Create From This Model',
  importAnimation: true, clips: {},
  materialCreation: 'Import via MaterialDescription', location: 'Use Embedded Materials', extracted: false, texturesExtracted: false, normalFixed: false,
};

// ─── Export: which objects go into the file ──────────────────────────────────
export function exportedObjects(objects, s) {
  return objects.filter(o => {
    if (s.selectedOnly && !o.selected) return false;
    if (s.visibleOnly && o.hidden) return false;
    const t = s.types[o.type] ?? s.types.OTHER;
    return !!t;
  });
}
// A snapshot of the file: the objects as they were, and the options used.
export function exportFBX(scene, settings, name) {
  return { name, settings: JSON.parse(JSON.stringify(settings)), objects: JSON.parse(JSON.stringify(exportedObjects(scene.objects, settings))), actions: JSON.parse(JSON.stringify(scene.actions || [])), activeAction: scene.activeAction || null };
}

// ─── Import: what Unity makes of the file ────────────────────────────────────
// Each node: the Transform the Inspector shows (position, Euler rotation, scale), and the matrices that
// place its mesh in Unity (for drawing and for measuring). world = position + Q · diag(scale) · D · (mesh point).
export function importFBX(file, imp) {
  const s = file.settings, M = toUnity(s.forward, s.up), axesOk = !!axisMatrix(s.forward, s.up) && s.forward === '-Z' && s.up === 'Y';
  const baked = !!(imp.bakeAxis || s.applyTransform);
  const cm = s.applyScalings === 'All Local';
  const fileScale = (cm && imp.convertUnits ? 0.01 : 1);
  const nodeScale = cm ? 100 : 1;
  const k = s.scale * nodeScale * fileScale * imp.scaleFactor;      // size of a Blender metre in Unity
  const posK = s.scale * (cm ? 100 : 1) * fileScale * imp.scaleFactor;
  const report = { fileScale, nodeScale, baked, k, axesOk, warnings: [], errors: [] };
  const byName = Object.fromEntries(file.objects.map(o => [o.name, o]));
  const nodes = file.objects.filter(o => !(o.type === 'ARMATURE' && false)).map(o => {
    const root = !o.parent || !byName[o.parent];
    const R = eulerXYZ(o.rot);
    // what the Inspector shows
    const Q = baked ? M3.mul(M, M3.mul(R, M3.inv(M))) : root ? M3.mul(M, M3.mul(R, M3.mul(FLIP_X, M3.rx(0.02)))) : M3.mul(M, M3.mul(R, M3.inv(M)));
    const sc = baked ? [o.scale[0], o.scale[2], o.scale[1]] : [...o.scale];
    const shownScale = sc.map(v => v * (root ? nodeScale * s.scale : 1));
    const position = V.mul(M3.apply(M, o.loc), posK);
    // the mesh data in the node's space, so that the whole chain equals k · M · R · S · v
    const target = M3.mul(M3.mul(M, M3.mul(R, M3.diag(...o.scale))), M3.diag(k, k, k));
    const D = M3.mul(M3.inv(M3.mul(Q, M3.diag(...shownScale))), target);
    return { name: o.name, type: o.type, shape: o.shape, root, position, Q, rotation: unityEuler(Q), scale: shownScale, D, obj: o, flipped: o.flipped || 0 };
  });
  report.nodes = nodes;
  // the whole model in Unity's world (as instantiated at the origin)
  report.world = n => { const o = n.obj; const pts = []; for (const p of meshParts(o, s.applyModifiers)) for (const q of partPoints(p)) { if (p.half && q[0] < -1e-9) continue; pts.push(unityPoint(n, localPoint(o, q))); } return bounds(pts); };
  if (!axesOk) report.warnings.push('axes');
  if (s.applyTransform && file.objects.some(o => o.type === 'ARMATURE')) report.errors.push('applyTransformArmature');
  return report;
}
// A mesh point (Blender local, after B and pivot) in Unity's world, for a node with its own Transform.
export function unityPoint(n, v, tr = null) {
  const pos = tr?.position || n.position, Q = tr ? unityRotation(tr.rotation) : n.Q, sc = tr?.scale || n.scale;
  return V.add(pos, M3.apply(Q, M3.apply(M3.diag(...sc), M3.apply(n.D, v))));
}
// The size of each imported mesh in Unity (world bounding box).
export function importedSize(rep, name) { const n = rep.nodes.find(x => x.name === name); return n ? rep.world(n).size : null; }
export const cleanTransform = n => nearV(n.rotation, [0, 0, 0], 0.01) && nearV(n.scale, [1, 1, 1], 1e-3);

// ─── Materials ───────────────────────────────────────────────────────────────
// What each channel of a Blender material becomes in Unity. Only an Image Texture plugged straight into a
// socket (through a Normal Map node for normals) survives the FBX; procedural textures and node maths do not.
export function materialReport(file, imp) {
  const s = file.settings, out = {};
  const mesh = file.objects.find(o => o.material); if (!mesh) return null;
  const m = mesh.material, texturesTravel = s.pathMode === 'Copy' && s.embedTextures;
  for (const [ch, src] of Object.entries(m.channels)) {
    let state;
    if (src.kind === 'value') state = 'value';
    else if (src.kind === 'procedural') state = 'lost';
    else state = texturesTravel || imp.texturesInProject ? 'ok' : 'missing';
    if (ch === 'normal' && state === 'ok' && !imp.normalFixed) state = 'notNormalMap';
    out[ch] = { ...src, state };
  }
  return { name: m.name, channels: out, editable: imp.extracted, embedded: texturesTravel };
}

// ─── Armature and animation ──────────────────────────────────────────────────
export function exportedBones(file) {
  const arm = file.objects.find(o => o.type === 'ARMATURE'); if (!arm) return [];
  const s = file.settings;
  let bones = arm.bones.filter(b => !s.onlyDeform || b.deform).map(b => b.name);
  if (s.leafBones) bones = bones.concat(arm.bones.filter(b => (!s.onlyDeform || b.deform) && b.leaf).map(b => b.name + '_end'));
  return bones;
}
export const HUMANOID_REQUIRED = ['Hips', 'Spine', 'Head', 'UpperLeg.L', 'LowerLeg.L', 'Foot.L', 'UpperLeg.R', 'LowerLeg.R', 'Foot.R', 'UpperArm.L', 'LowerArm.L', 'Hand.L', 'UpperArm.R', 'LowerArm.R', 'Hand.R'];
export function rigReport(file, imp) {
  const arm = file.objects.find(o => o.type === 'ARMATURE'), mesh = file.objects.find(o => o.skinned);
  const bones = exportedBones(file), issues = [];
  if (!arm) issues.push('noArmature');
  if (arm && file.settings.applyTransform) issues.push('applyTransform');
  if (bones.some(b => b.endsWith('_end'))) issues.push('leafBones');
  if (arm && bones.some(b => !arm.bones.find(x => x.name === b)?.deform && !b.endsWith('_end'))) issues.push('controlBones');
  let avatar = 'none';
  if (imp.animationType === 'Humanoid') avatar = !arm || !mesh ? 'invalid' : issues.includes('applyTransform') ? 'invalid' : HUMANOID_REQUIRED.every(b => bones.includes(b)) ? 'valid' : 'invalid';
  else if (imp.animationType === 'Generic') avatar = arm ? 'generic' : 'none';
  return { bones, issues, avatar, skinned: !!(arm && mesh) };
}
// The animation clips Unity finds in the file. Blender names them "Armature|Action".
export function clipsOf(file) {
  const s = file.settings, arm = file.objects.find(o => o.type === 'ARMATURE');
  if (!arm || !s.bakeAnim) return [];
  const acts = s.allActions ? file.actions.map(a => a.name) : file.activeAction ? [file.activeAction] : [];
  const nla = s.nlaStrips ? file.actions.filter(a => a.nla).map(a => a.name) : [];
  return [...new Set([...acts, ...nla])].map(a => `${arm.name}|${a}`);
}

// ─── Colliders and a tiny physics test ───────────────────────────────────────
// Every collider is a list of boxes in Unity's world: a Box Collider is the mesh's bounding box, a convex
// Mesh Collider its convex hull (for these shapes, the bounding box), a non-convex Mesh Collider its exact
// parts. A non-convex Mesh Collider on a Rigidbody does nothing and Unity logs an error.
export function colliderBoxes(rep, node, comp) {
  const o = node.obj;
  if (comp.type === 'BoxCollider' || (comp.type === 'MeshCollider' && comp.convex)) { const b = rep.world(node); return [[b.mn, b.mx]]; }
  if (comp.type === 'MeshCollider') return meshParts(o, true).map(p => { const pts = partPoints(p).map(q => unityPoint(node, localPoint(o, q))); const b = bounds(pts); return [b.mn, b.mx]; });
  return [];
}
export function physicsErrors(components) {
  const errs = [];
  for (const [name, comps] of Object.entries(components)) {
    const rb = comps.some(c => c.type === 'Rigidbody' && !c.kinematic);
    if (rb && comps.some(c => c.type === 'MeshCollider' && !c.convex)) errs.push({ name, code: 'nonConvexRigidbody' });
  }
  return errs;
}
// Release a ball of radius r at (x, from, z) in Unity's world and let it fall: where does it rest? The floor is
// y = 0; a ball released inside a collider is pushed out on top of it, as Unity's physics does.
export function dropHeight(boxes, x, z, from = 3, r = 0.1) {
  let top = 0;
  for (const [mn, mx] of boxes) if (x + r > mn[0] && x - r < mx[0] && z + r > mn[2] && z - r < mx[2] && mn[1] < from && mx[1] > top) top = mx[1];
  return top;
}
