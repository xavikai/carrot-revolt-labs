// The bouncing-ball rig of the 3ds Max Animation Lab, built like the class scene:
//
//   ball_Bone ─ tip_bone     bones of the ball (hidden): ball_Bone goes from ctrl_bottom to ctrl_top (Look At)
//   ctrl_master ─ ctrl_pilota  shapes: master placement circle on the floor, and the ball circle (moves and turns the ball)
//   pilota_Mesh              the ball (frozen, skinned to the bones)
//   squash_space ─ ctrl_bottom, ctrl_top   point helpers: squash & stretch (squash_space follows ctrl_pilota's position)
//
// Every control has the nine Transform tracks of 3ds Max (X/Y/Z Position, X/Y/Z Rotation, X/Y/Z Scale).
// Transforms are frozen (Zero Pos XYZ / Zero Euler XYZ), so the rest pose is 0 and scale is 100%.
// Pure maths in Max coordinates (Z up), no three.js: stages.js and the tests use it too.

export const BALL = 1;            // diameter in metres
export const RADIUS = BALL / 2;

// Scene Explorer order (sorted ascending, with the hierarchy of the scene)
export const OBJECTS = [
  { id: 'ball_Bone', kind: 'Bone', parent: null, hidden: true, color: '#e6c34a' },
  { id: 'tip_bone', kind: 'Bone', parent: 'ball_Bone', hidden: true, color: '#e6c34a' },
  { id: 'ctrl_master', kind: 'Shape', parent: null, color: '#36d636' },
  { id: 'ctrl_pilota', kind: 'Shape', parent: 'ctrl_master', color: '#36d636' },
  { id: 'pilota_Mesh', kind: 'Geometry', parent: null, frozen: true, color: '#e1117f' },
  { id: 'squash_space', kind: 'Helper', parent: null, color: '#36d636' },
  { id: 'ctrl_bottom', kind: 'Helper', parent: 'squash_space', color: '#36d636' },
  { id: 'ctrl_top', kind: 'Helper', parent: 'squash_space', color: '#36d636' },
];
export const CONTROLS = ['ctrl_master', 'ctrl_pilota', 'squash_space', 'ctrl_bottom', 'ctrl_top'];
export const isControl = id => CONTROLS.includes(id);

// Track ids. The five tracks the lessons use keep short ids.
const ALIAS = { 'ctrl_pilota.px': 'locX', 'ctrl_pilota.pz': 'locZ', 'ctrl_pilota.ry': 'rotY', 'ctrl_top.pz': 'topZ', 'ctrl_bottom.pz': 'botZ' };
export const PROPS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'];
export const trackId = (obj, p) => ALIAS[`${obj}.${p}`] || `${obj}.${p}`;
const AXIS_COLOR = { X: '#ff4d4d', Y: '#4fd04f', Z: '#4d7dff' };
export const TRACKS = {};
for (const obj of CONTROLS) for (const p of PROPS) {
  const axis = p[1].toUpperCase(), group = { p: 'Position', r: 'Rotation', s: 'Scale' }[p[0]];
  TRACKS[trackId(obj, p)] = {
    id: trackId(obj, p), obj, bone: obj, p, axis, group, color: AXIS_COLOR[axis],
    name: group === 'Scale' ? `${axis} Scale` : `${axis} ${group}`,
    rot: group === 'Rotation', scale: group === 'Scale', unit: group === 'Rotation' ? '°' : group === 'Scale' ? '%' : 'm',
  };
}
export const TRACK_ORDER = Object.keys(TRACKS);
export const tracksOf = (obj, group) => PROPS.filter(p => !group || TRACKS[trackId(obj, p)].group === group).map(p => trackId(obj, p));
export const restValue = id => TRACKS[id]?.scale ? 100 : 0;

// ── small 3×3 maths (row-major arrays of 3 rows) ──
const I = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const mul = (a, b) => a.map(r => [0, 1, 2].map(j => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
export const apply = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
export const transpose = m => [0, 1, 2].map(i => [0, 1, 2].map(j => m[j][i]));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = v => Math.hypot(v[0], v[1], v[2]);
const diag = (x, y, z) => [[x, 0, 0], [0, y, 0], [0, 0, z]];
const rad = d => d * Math.PI / 180;
const rx = a => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const ry = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rz = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
// Euler XYZ, as the Euler XYZ controller of 3ds Max: X first, then Y, then Z.
export const euler = (x, y, z) => mul(rz(rad(z)), mul(ry(rad(y)), rx(rad(x))));
export function invert(m) {
  const [a, b, c] = m, det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (Math.abs(det) < 1e-12) return I();
  const k = 1 / det;
  return [
    [(b[1] * c[2] - b[2] * c[1]) * k, (a[2] * c[1] - a[1] * c[2]) * k, (a[1] * b[2] - a[2] * b[1]) * k],
    [(b[2] * c[0] - b[0] * c[2]) * k, (a[0] * c[2] - a[2] * c[0]) * k, (a[2] * b[0] - a[0] * b[2]) * k],
    [(b[0] * c[1] - b[1] * c[0]) * k, (a[1] * c[0] - a[0] * c[1]) * k, (a[0] * b[1] - a[1] * b[0]) * k],
  ];
}
// Rotation that turns unit vector a onto unit vector b (shortest arc).
function align(a, b) {
  const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c < -0.99999) return [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
  const k = 1 / (1 + c), vx = [[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]];
  const vx2 = mul(vx, vx);
  return I().map((r, i) => r.map((x, j) => x + vx[i][j] + vx2[i][j] * k));
}

// The whole rig at one moment. get(trackId) gives the value of a track (degrees, metres, percent).
export function rigPose(get) {
  const T = obj => ({
    p: [get(trackId(obj, 'px')), get(trackId(obj, 'py')), get(trackId(obj, 'pz'))],
    r: euler(get(trackId(obj, 'rx')), get(trackId(obj, 'ry')), get(trackId(obj, 'rz'))),
    s: [get(trackId(obj, 'sx')) / 100, get(trackId(obj, 'sy')) / 100, get(trackId(obj, 'sz')) / 100],
  });
  const m = T('ctrl_master'), p = T('ctrl_pilota'), q = T('squash_space'), t = T('ctrl_top'), b = T('ctrl_bottom');
  const master = { o: m.p, rot: m.r, lin: mul(m.r, diag(...m.s)), parent: I() };
  // ctrl_pilota is linked to ctrl_master; its frozen rest position is the centre of the ball
  const pilotaParent = master.lin;
  const pilota = { o: add(master.o, apply(pilotaParent, add([0, 0, RADIUS], p.p))), rot: mul(master.rot, p.r), parent: pilotaParent };
  pilota.lin = mul(pilotaParent, mul(p.r, diag(...p.s)));
  // squash_space follows the position (and the scale) of ctrl_pilota, not its rotation
  const size = [0, 1, 2].map(i => m.s[i] * p.s[i]);
  const ss = { o: add(pilota.o, q.p), rot: q.r, parent: I() };
  ss.lin = mul(q.r, diag(q.s[0] * size[0], q.s[1] * size[1], q.s[2] * size[2]));
  const child = (c, rest) => ({ o: add(ss.o, apply(ss.lin, add([0, 0, rest], c.p))), rot: mul(ss.rot, c.r), lin: mul(ss.lin, mul(c.r, diag(...c.s))), parent: ss.lin });
  const top = child(t, RADIUS), bottom = child(b, -RADIUS);
  // ball_Bone: from ctrl_bottom, looking at ctrl_top; the ball keeps its volume
  const axis = sub(top.o, bottom.o), L = Math.max(0.05 * BALL, len(axis)), dir = len(axis) > 1e-6 ? axis.map(x => x / len(axis)) : [0, 0, 1];
  const restL = 2 * RADIUS * Math.abs(ss.lin[0][2] ** 2 + ss.lin[1][2] ** 2 + ss.lin[2][2] ** 2) ** .5;
  const stretch = L / Math.max(1e-6, restL);
  const zAxis = apply(q.r, [0, 0, 1]), frame = mul(align(zAxis, dir), q.r);
  const wx = RADIUS * q.s[0] * size[0] / Math.sqrt(stretch), wy = RADIUS * q.s[1] * size[1] / Math.sqrt(stretch);
  const ell = mul(frame, diag(wx, wy, L / 2));                   // the squashed ellipsoid (unit sphere → ball)
  const lin = mul(mul(ell, transpose(frame)), pilota.rot);       // … with the spin of ctrl_pilota inside it
  const center = [(top.o[0] + bottom.o[0]) / 2, (top.o[1] + bottom.o[1]) / 2, (top.o[2] + bottom.o[2]) / 2];
  const reachZ = Math.hypot(ell[2][0], ell[2][1], ell[2][2]);
  return {
    master, pilota, squash_space: ss, ctrl_top: top, ctrl_bottom: bottom,
    bone: { from: bottom.o, to: top.o, dir, length: L },
    ball: { center, lin, ell, bottom: center[2] - reachZ, top: center[2] + reachZ, sz: L / BALL, sx: wx / RADIUS },
  };
}

// Where a transform of `obj` starts from, and the matrix that turns a world move into its local Position.
export const worldOf = (pose, obj) => ({ ctrl_master: pose.master, ctrl_pilota: pose.pilota, squash_space: pose.squash_space, ctrl_top: pose.ctrl_top, ctrl_bottom: pose.ctrl_bottom })[obj];
export const worldToLocalMove = (pose, obj, d) => apply(invert(worldOf(pose, obj).parent), d);
