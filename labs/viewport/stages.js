// Viewport Lab: stages, steps and checks. Pure JS (tested with node).
import { makeObj, cloneObjs, defaultView, matchReport, sphereOnScreen, faceSeen, vfov, eulerToQuat, qRotate, dot, AXES, setAxisView } from './vp.js?v=1';

const clone = o => JSON.parse(JSON.stringify(o));
const CAMERA = () => makeObj('Camera', 'camera', { loc: [7.36, -6.93, 4.96], rot: [63.6, 0, 46.7] });
const LIGHT = () => makeObj('Light', 'light', { loc: [4.08, 1.01, 5.9] });
const find = (st, name) => st.objs.find(o => o.name === name);
export const MARKS = ['+y', '-x', '-z'];
export const MARK_N = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
export const VIEW_ORDER = ['front', 'right', 'top', 'back'];
export const EXACT = { move: 2, rot: 45, scale: 1.5 };

function base(objs, o = {}) {
  return { objs, sel: o.sel || [], active: o.active ?? (o.sel ? o.sel[o.sel.length - 1] : null), view: { ...defaultView(), ...(o.view || {}) }, ghosts: o.ghosts || [], flags: {}, aspect: 16 / 9 };
}
export function startState(step) { const s = step.start(); s.flags = {}; return s; }

// A silhouette match that knows the symmetry of each primitive: a sphere has no visible rotation,
// a cylinder or a cone only shows where its axis points, a cube looks the same every 90°.
export function shapeMatch(o, g, tol = {}) {
  const r = matchReport(o, g, tol), trr = tol.rot ?? 5, cos = Math.cos(trr * Math.PI / 180);
  const ax = (x, k) => qRotate(eulerToQuat(x.rot), AXES[k]);
  if (o.kind === 'sphere') r.dr = 0;
  else if (o.kind === 'cone') r.dr = Math.acos(Math.min(1, dot(ax(o, 'z'), ax(g, 'z')))) * 180 / Math.PI;
  else if (o.kind === 'cylinder') r.dr = Math.acos(Math.min(1, Math.abs(dot(ax(o, 'z'), ax(g, 'z'))))) * 180 / Math.PI;
  else if (o.kind === 'cube' && o.scale.every(s => Math.abs(s - o.scale[0]) < 1e-6)) {
    const okAxes = ['x', 'y', 'z'].every(k => ['x', 'y', 'z'].some(j => Math.abs(dot(ax(o, k), ax(g, j))) >= cos));
    r.dr = okAxes ? 0 : r.dr;
  }
  r.ok = r.dl <= (tol.loc ?? 0.1) && r.dr <= trr && r.ds <= (tol.scale ?? 0.05);
  return r;
}
export const ghostsDone = (st, tol) => st.ghosts.every(g => { const o = find(st, g.name); return o && shapeMatch(o, g, tol).ok; });
export const ghostState = (st, tol) => st.ghosts.map(g => { const o = find(st, g.name); return !!(o && shapeMatch(o, g, tol).ok); });
function solveGhosts(st) { for (const g of st.ghosts) { const o = find(st, g.name); if (o) { o.loc = [...g.loc]; o.rot = [...g.rot]; o.scale = [...g.scale]; } } }
const ghost = (name, kind, loc, rot = [0, 0, 0], scale = [1, 1, 1]) => ({ name, kind, loc, rot, scale });

// Tolerances for the "exact values" step: the result must be exactly the typed value.
export const EXACT_TOL = { loc: 0.001, rot: 0.01, scale: 0.001 };
export function exactReport(st) {
  const box = find(st, 'Cube'), arrow = find(st, 'Arrow'), cyl = find(st, 'Cylinder');
  const near = (a, b, t) => Math.abs(a - b) <= t;
  return {
    move: !!box && near(box.loc[2], 1 + EXACT.move, 0.001) && near(box.loc[0], -4, 0.001) && near(box.loc[1], 0, 0.001) && box.rot.every(r => near(r, 0, 0.01)) && box.scale.every(s => near(s, 1, 0.001)),
    rot: !!arrow && near(arrow.rot[2], EXACT.rot, 0.01) && near(arrow.rot[0], 0, 0.01) && near(arrow.rot[1], 0, 0.01) && near(arrow.loc[0], 0, 0.001) && near(arrow.loc[1], 0, 0.001) && near(arrow.loc[2], 1, 0.001),
    scale: !!cyl && cyl.scale.every(s => near(s, EXACT.scale, 0.001)) && near(cyl.loc[0], 4, 0.001) && near(cyl.loc[1], 0, 0.001) && near(cyl.loc[2], 1, 0.001),
  };
}
export function moveReport(st) {
  const g = st.ghosts, get = n => find(st, n), gh = n => g.find(x => x.name === n);
  const c1 = get('Cube.001'), g1 = gh('Cube.001');
  return {
    cube: shapeMatch(get('Cube'), gh('Cube')).ok,
    up: !!c1 && Math.abs(c1.loc[2] - g1.loc[2]) <= 0.1 && Math.abs(c1.loc[0] - g1.loc[0]) <= 0.001 && Math.abs(c1.loc[1] - g1.loc[1]) <= 0.001,
    upMoved: !!c1 && (Math.abs(c1.loc[0] - g1.loc[0]) > 0.001 || Math.abs(c1.loc[1] - g1.loc[1]) > 0.001),
    far: shapeMatch(get('Cube.002'), gh('Cube.002')).ok,
  };
}
export const UNDO_ORIGIN = { loc: [0, 0, 1], rot: [0, 0, 0], scale: [1, 1, 1] };
export function undoReport(st) {
  const c = find(st, 'Cube');
  return { cancelled: !!st.flags.cancelled, back: !!c && shapeMatch(c, { ...UNDO_ORIGIN, kind: 'cube' }, EXACT_TOL).ok && c.rot.every(r => Math.abs(r) < 0.01) };
}
export const SELECT_GOAL = ['Sphere', 'Sphere.001', 'Sphere.002'];
export function selectReport(st) {
  const set = new Set(st.sel);
  return { spheres: SELECT_GOAL.filter(n => set.has(n)).length, extra: st.sel.filter(n => !SELECT_GOAL.includes(n)).length, active: st.active === 'Sphere.001' && set.has('Sphere.001') };
}
// The far sphere of the pan & zoom step: centred and big enough.
export const PAN_GOAL = { off: 0.2, size: 0.25 };
export function panReport(st) {
  const s = find(st, 'Sphere'); const W = st.aspect || 16 / 9, H = 1;
  const r = sphereOnScreen(st.view, s, W, H); return { ...r, centred: r.off <= PAN_GOAL.off, big: r.size >= PAN_GOAL.size };
}
export function markSeen(st) {
  const cube = find(st, 'Cube'), W = st.aspect || 16 / 9; let changed = false;
  st.flags.seen = st.flags.seen || {};
  for (const m of MARKS) if (!st.flags.seen[m] && faceSeen(st.view, cube, MARK_N[m], W, 1)) { st.flags.seen[m] = true; changed = true; }
  return changed;
}

export const STAGES = [
  {
    id: 'nav', name: 'Look around', sub: 'Orbit · Pan · Zoom · Views',
    steps: [
      {
        id: 'n1', title: 'Orbit around the cube',
        text: 'This cube has three orange marks, but you cannot see any of them from here: one is at the back, one on the left side and one underneath. Turn the view around the cube to find them. A mark turns green when you have looked at it from in front.',
        how: ['Drag with the <b>middle mouse button</b> (press the wheel) to <b>orbit</b>.', 'No middle button? Hold <kbd>Alt</kbd> and drag with the left button, or drag the <b>navigation gizmo</b> (the X, Y, Z circle at the top right).', 'Look under the cube too: keep orbiting past the grid.'],
        why: 'Orbiting moves the view, not the objects: the scene is the same, only your point of view changes. You will orbit all the time in Blender, so the middle mouse button is worth learning.',
        start: () => base([makeObj('Cube', 'cube', { scale: [2, 2, 2], mark: MARKS, lock: true }), CAMERA(), LIGHT()], { view: { dist: 20 } }),
        check: s => MARKS.every(m => s.flags.seen?.[m]),
        solve: s => { s.flags.seen = Object.fromEntries(MARKS.map(m => [m, true])); s.view = { ...s.view, az: 120, el: -35, axis: null, ortho: false, auto: false }; },
      },
      {
        id: 'n2', title: 'Pan and zoom',
        text: 'Far away there is a small sphere. Bring it to the middle of the view and come close, until it fills at least a quarter of the height of the view. Orbiting alone will not do it: orbit turns around the centre of the view, so first move that centre.',
        how: ['<b>Pan</b>: <kbd>Shift</kbd> + drag with the middle mouse button (or the hand icon under the gizmo).', '<b>Zoom</b>: the mouse wheel, or <kbd>Ctrl</kbd> + drag with the middle button (or the magnifier icon).', 'Pan until the sphere is in the middle, then zoom in. Numpad . is switched off in this step.'],
        why: 'Pan moves the point you orbit around. Zoom moves the view closer to that point. Together with orbit, these three moves are all the navigation you need.',
        start: () => base([makeObj('Cube', 'cube'), makeObj('Sphere', 'sphere', { loc: [9, 13, 1.2], scale: [0.35, 0.35, 0.35], lock: true })], { view: { dist: 17 } }),
        noFrame: true,
        check: s => { const r = panReport(s); return r.centred && r.big; },
        solve: s => { const sp = find(s, 'Sphere'), t = Math.tan(vfov(s.aspect || 16 / 9) * Math.PI / 360); s.view = { ...s.view, target: [...sp.loc], dist: 2 * sp.scale[0] / (0.34 * 2 * t) }; },
      },
      {
        id: 'n3', title: 'Frame what you need',
        text: 'In a big scene you do not pan and zoom by hand to find each object: you select it and frame it. Select the small Cone at the back, press Numpad . (View Selected) to fly to it, and then press Home (Frame All) to see the whole scene again.',
        how: ['Click the <b>Cone</b> in the view or in the <b>Outliner</b>.', 'Press <kbd>Numpad .</kbd>, or use <b>View › Frame Selected</b>.', 'Press <kbd>Home</kbd>, or use <b>View › Frame All</b>.'],
        why: 'Frame Selected also sets the centre of the orbit on the object: after it, orbiting turns around the object you are working on.',
        start: () => base([makeObj('Cube', 'cube', { loc: [0, 0, 1] }), makeObj('Cylinder', 'cylinder', { loc: [-3.5, 1.5, 1] }), makeObj('Torus', 'torus', { loc: [3.5, 1, 0.25] }), makeObj('Sphere', 'sphere', { loc: [0, 4.5, 1], scale: [1.4, 1.4, 1.4] }), makeObj('Cone', 'cone', { loc: [-6, 15, 0.35], scale: [0.35, 0.35, 0.35] }), CAMERA(), LIGHT()], { sel: ['Cube'], view: { dist: 16, az: -80, el: 18 } }),
        check: s => !!s.flags.framed && !!s.flags.home,
        solve: s => { s.sel = ['Cone']; s.active = 'Cone'; s.flags.framed = true; s.flags.home = true; },
      },
      {
        id: 'n4', title: 'Front, Right, Top, Back',
        text: 'The numpad jumps to the views of a technical drawing. Go to the Front, Right, Top and Back views, in this order. Notice the name at the top left of the view: axis views become Orthographic (no perspective) by themselves, and they go back to Perspective as soon as you orbit. This is Auto Perspective.',
        how: ['<kbd>Numpad 1</kbd> Front, <kbd>Numpad 3</kbd> Right, <kbd>Numpad 7</kbd> Top. With <kbd>Ctrl</kbd> you get the opposite view: <kbd>Ctrl</kbd> <kbd>Numpad 1</kbd> is Back.', 'No numpad? Click the balls of the gizmo, use <b>View › Viewpoint</b>, the <kbd>`</kbd> pie menu, or turn on <b>Emulate Numpad</b> in the header.', 'If <kbd>Ctrl</kbd> + a number switches the browser tab, go to Front and press <kbd>Numpad 9</kbd>: it jumps to the opposite view.', '<kbd>Numpad 5</kbd> switches between Perspective and Orthographic.'],
        why: 'Orthographic views have no perspective: parallel lines stay parallel and sizes do not shrink with distance. They are the views to align, measure and model from reference drawings.',
        start: () => base([makeObj('Cube', 'cube', { loc: [0, 0, 1] }), makeObj('Cone', 'cone', { loc: [3, 0, 1] }), makeObj('Cylinder', 'cylinder', { loc: [0, 3, 1] }), CAMERA(), LIGHT()], { view: { dist: 15 } }),
        check: s => (s.flags.viewIdx | 0) >= VIEW_ORDER.length,
        solve: s => { s.flags.viewIdx = VIEW_ORDER.length; s.view = setAxisView(s.view, 'back'); },
      },
    ],
  },
  {
    id: 'select', name: 'Select and transform', sub: 'Click · B · A · G R S',
    steps: [
      {
        id: 's1', title: 'Select three spheres',
        text: 'Select the three spheres and nothing else, with Sphere.001 as the active object. The active object is the last one you clicked: it has a lighter orange outline, and it is the one the N panel and many tools work on.',
        how: ['<b>Click</b> selects one object. <kbd>Shift</kbd> + click adds an object, or makes a selected one active; <kbd>Shift</kbd> + click on the active one deselects it.', '<kbd>B</kbd> and drag draws a box that adds everything inside. Dragging in an empty place does it too.', '<kbd>A</kbd> selects all, <kbd>Alt</kbd> <kbd>A</kbd> deselects all. The <b>Outliner</b> shows what is selected.'],
        why: 'Almost every command works on the selection, and many use the active object as the reference: which object to copy from, around which to rotate, which data to show.',
        start: () => base([makeObj('Cube', 'cube', { loc: [-4, -3, 1] }), makeObj('Cube.001', 'cube', { loc: [0, -3, 1] }), makeObj('Cylinder', 'cylinder', { loc: [4, -3, 1] }), makeObj('Sphere', 'sphere', { loc: [-4, 2, 1] }), makeObj('Sphere.001', 'sphere', { loc: [0, 2, 1] }), makeObj('Sphere.002', 'sphere', { loc: [4, 2, 1] }), makeObj('Cone', 'cone', { loc: [0, 7, 1] })], { sel: ['Cube', 'Cylinder'], active: 'Cylinder', view: { dist: 21, az: -90, el: 42 } }),
        check: s => { const r = selectReport(s); return r.spheres === 3 && r.extra === 0 && r.active; },
        solve: s => { s.sel = ['Sphere', 'Sphere.002', 'Sphere.001']; s.active = 'Sphere.001'; },
      },
      {
        id: 's2', title: 'Move to the silhouettes',
        text: 'Move each cube into its blue silhouette (within 10 cm). Cube.001 has to go straight up: move it only along Z, so its X and Y do not change at all. A silhouette turns green when its cube is in place.',
        how: ['Select a cube and press <kbd>G</kbd> (grab). Move the mouse, then <b>click</b> or press <kbd>Enter</kbd> to confirm.', 'While moving, press <kbd>X</kbd>, <kbd>Y</kbd> or <kbd>Z</kbd> to move along that axis only. <kbd>Shift</kbd> <kbd>Z</kbd> moves in the X–Y plane (all but Z).', '<b>Right-click</b> or <kbd>Esc</kbd> cancels. Look from the top (<kbd>Numpad 7</kbd>) to place things on the floor.'],
        why: 'A free move follows the mouse on the plane of the screen, so in perspective it is hard to tell how far away you went. Axis constraints make moves precise from any view.',
        start: () => base([makeObj('Cube', 'cube', { loc: [0, 0, 1] }), makeObj('Cube.001', 'cube', { loc: [-4, 1, 1] }), makeObj('Cube.002', 'cube', { loc: [3, 4, 1] })],
          { sel: [], ghosts: [ghost('Cube', 'cube', [3, -3, 1]), ghost('Cube.001', 'cube', [-4, 1, 4]), ghost('Cube.002', 'cube', [-1, 6, 1])], view: { dist: 22, az: -70, el: 30 } }),
        check: s => { const r = moveReport(s); return r.cube && r.up && r.far; },
        solve: s => solveGhosts(s),
      },
      {
        id: 's3', title: 'Exact values',
        text: 'Type numbers while you transform, and the result is exact. Move the Cube exactly 2 m up, rotate the Arrow exactly 45° around Z, and scale the Cylinder exactly 1.5 times. Then open the N panel and read the new values in Location, Rotation and Scale.',
        how: ['Select the Cube and type <kbd>G</kbd> <kbd>Z</kbd> <kbd>2</kbd> <kbd>Enter</kbd>.', 'Arrow: <kbd>R</kbd> <kbd>Z</kbd> <kbd>4</kbd> <kbd>5</kbd> <kbd>Enter</kbd>. Cylinder: <kbd>S</kbd> <kbd>1</kbd> <kbd>.</kbd> <kbd>5</kbd> <kbd>Enter</kbd>.', 'Press <kbd>N</kbd> for the sidebar (Item tab). You can also type the values there. <kbd>Ctrl</kbd> while moving snaps to round steps.'],
        why: 'Models for games and production are built with real measures: a door 2 m high, a wall rotated exactly 90°. Typed values and the N panel give precision the mouse cannot.',
        start: () => base([makeObj('Cube', 'cube', { loc: [-4, 0, 1] }), makeObj('Arrow', 'arrow', { loc: [0, 0, 1] }), makeObj('Cylinder', 'cylinder', { loc: [4, 0, 1] })],
          { ghosts: [ghost('Cube', 'cube', [-4, 0, 3]), ghost('Arrow', 'arrow', [0, 0, 1], [0, 0, 45]), ghost('Cylinder', 'cylinder', [4, 0, 1], [0, 0, 0], [1.5, 1.5, 1.5])], view: { dist: 20, az: -75, el: 24 } }),
        check: s => { const r = exactReport(s); return r.move && r.rot && r.scale; },
        solve: s => solveGhosts(s),
      },
    ],
  },
  {
    id: 'undo', name: 'Cancel, undo, challenge', sub: 'Right-click · Esc · Ctrl Z',
    steps: [
      {
        id: 'u1', title: 'Cancel and undo',
        text: 'Someone moved, rotated and scaled this cube. First practise a cancel: start a G, R or S and stop it with a right-click or Esc, so nothing changes. Then undo the three changes with Ctrl Z until the cube is back in its silhouette, exactly where it started.',
        how: ['Press <kbd>G</kbd>, move the mouse and <b>right-click</b> (or <kbd>Esc</kbd>): the cube jumps back.', 'Press <kbd>Ctrl</kbd> <kbd>Z</kbd> three times. <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> redoes.', '<b>Edit › Undo History</b> lists the steps and jumps to any of them.'],
        why: 'Cancel stops the transform you are doing; undo takes back one you already confirmed. Alt G, Alt R and Alt S also clear location, rotation and scale to zero, zero and one.',
        start: () => {
          const o0 = makeObj('Cube', 'cube', { loc: UNDO_ORIGIN.loc }), o1 = { ...o0, loc: [2.5, -1.5, 1.8] }, o2 = { ...o1, rot: [0, 0, 30] }, o3 = { ...o2, scale: [1.4, 1.4, 1.4] };
          const s = base([cloneObjs([o3])[0]], { sel: ['Cube'], ghosts: [ghost('Cube', 'cube', UNDO_ORIGIN.loc)], view: { dist: 16 } });
          s.history = [{ name: 'Move', objs: cloneObjs([o0]) }, { name: 'Rotate', objs: cloneObjs([o1]) }, { name: 'Scale', objs: cloneObjs([o2]) }];
          return s;
        },
        check: s => { const r = undoReport(s); return r.cancelled && r.back; },
        solve: s => { s.flags.cancelled = true; const c = find(s, 'Cube'); c.loc = [...UNDO_ORIGIN.loc]; c.rot = [0, 0, 0]; c.scale = [1, 1, 1]; },
      },
      {
        id: 'u2', title: 'Final challenge',
        text: 'Put the four objects into their silhouettes. Some need a move, some a rotation, some a scale. No more hints: use what you learnt.',
        how: ['<kbd>G</kbd> <kbd>R</kbd> <kbd>S</kbd>, axes, typed numbers, the N panel, the axis views.'],
        why: 'This is the daily work of a 3D layout: placing, turning and sizing objects precisely, and looking from the right view to check.',
        start: () => base([makeObj('Cube', 'cube', { loc: [0, 0, 1] }), makeObj('Arrow', 'arrow', { loc: [-4, -2, 1] }), makeObj('Cone', 'cone', { loc: [4, -2, 1] }), makeObj('Cylinder', 'cylinder', { loc: [0, 4, 1] })],
          { ghosts: [ghost('Cube', 'cube', [2, 3, 1]), ghost('Arrow', 'arrow', [-4, 1, 1], [0, 0, 90]), ghost('Cone', 'cone', [4, -2, 3], [90, 0, 0]), ghost('Cylinder', 'cylinder', [-2, 5, 0.5], [0, 0, 0], [1, 1, 0.5])], view: { dist: 22, az: -65, el: 28 } }),
        check: s => ghostsDone(s),
        solve: s => solveGhosts(s),
      },
    ],
  },
  {
    id: 'free', name: 'Free mode', sub: 'Shift A · Shift D · X',
    steps: [
      {
        id: 'f1', title: 'Free mode', free: true,
        text: 'Nothing to check here: a scene to practise freely. Add objects, duplicate them, delete them, and build something with G, R and S.',
        how: ['<kbd>Shift</kbd> <kbd>A</kbd> adds an object (or the <b>Add</b> menu). <kbd>Shift</kbd> <kbd>D</kbd> duplicates and starts a move.', '<kbd>X</kbd> or <kbd>Delete</kbd> deletes the selection.', '<kbd>Alt</kbd> <kbd>G</kbd>, <kbd>Alt</kbd> <kbd>R</kbd>, <kbd>Alt</kbd> <kbd>S</kbd> clear location, rotation and scale.'],
        why: 'Free play is how the keys become habits.',
        start: () => base([makeObj('Cube', 'cube'), CAMERA(), LIGHT()], { sel: ['Cube'] }),
        check: () => false,
        solve: () => {},
      },
    ],
  },
];
export const allSteps = () => STAGES.flatMap(s => s.steps);
export { find as findObj, clone as cloneState };
