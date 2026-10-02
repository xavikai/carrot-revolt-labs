// 3ds Max Viewport Lab: stages, steps and checks. Pure JS (tested with node).
import { emptyScene, addObject, find, baseOf, modsOf, members, isGroup, matFromEuler, apply, clone, groupObjects, arrayObject, cloneSelection, moveBy, setFrozen, setHidden } from './scene.js?v=1';
import { newMod } from './prims.js?v=1';

const S = () => emptyScene();
const box = (st, name, p, o = {}) => addObject(st, 'Box', p, { name, ...o });
const sph = (st, name, p, o = {}) => addObject(st, 'Sphere', p, { name, ...o });
const cyl = (st, name, p, o = {}) => addObject(st, 'Cylinder', p, { name, ...o });
const cone = (st, name, p, o = {}) => addObject(st, 'Cone', p, { name, ...o });
const ghost = (name, pos, rot = [0, 0, 0], scale = [1, 1, 1]) => ({ name, pos, rot, scale });
const near = (a, b, t) => Math.abs(a - b) <= t;
const allNear = (a, b, t) => a.every((v, i) => near(v, b[i], t));
// The angle between the axes of two rotations, ignoring what the shape does not show:
// a sphere looks the same turned any way, a cylinder or a cone only shows where its Z axis points.
export function rotDiff(type, r1, r2) {
  const A = matFromEuler(r1), B = matFromEuler(r2), col = (M, j) => [M[0][j], M[1][j], M[2][j]];
  const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * 180 / Math.PI;
  if (type === 'Sphere') return 0;
  if (type === 'Cylinder' || type === 'Cone') return ang(col(A, 2), col(B, 2));
  return Math.max(ang(col(A, 0), col(B, 0)), ang(col(A, 1), col(B, 1)), ang(col(A, 2), col(B, 2)));
}
export function ghostMatch(st, g, tol = {}) {
  const o = find(st, g.name); if (!o) return { ok: false };
  const dl = Math.hypot(...o.pos.map((v, i) => v - g.pos[i])), dr = rotDiff(o.type, o.rot, g.rot), ds = Math.max(...o.scale.map((v, i) => Math.abs(v - g.scale[i])));
  return { dl, dr, ds, ok: dl <= (tol.loc ?? 0.1) && dr <= (tol.rot ?? 5) && ds <= (tol.scale ?? 0.05) };
}
export const ghostState = (st, tol) => st.ghosts.map(g => ghostMatch(st, g, tol).ok);
const ghostsDone = (st, tol) => st.ghosts.length > 0 && ghostState(st, tol).every(Boolean);
const solveGhosts = st => { for (const g of st.ghosts) { const o = find(st, g.name); if (o) { o.pos = [...g.pos]; o.rot = [...g.rot]; o.scale = [...g.scale]; } } };

// ─── Step data ──────────────────────────────────────────────────────────────
export const MARKS = ['+y', '-x', '-z'];
export const SELECT_GOAL = ['Sphere001', 'Sphere002', 'Sphere003'];
export function selectReport(st) {
  const set = new Set(st.sel);
  return { spheres: SELECT_GOAL.filter(n => set.has(n)).length, extra: st.sel.filter(n => !SELECT_GOAL.includes(n)).length };
}
export const EXACT = { box: [-2, 3, 0.5], cyl: [90, 0, 0], cone: [1, 1, 2] };
export function exactReport(st) {
  const b = find(st, 'Box001'), c = find(st, 'Cylinder001'), k = find(st, 'Cone001');
  return {
    move: !!b && allNear(b.pos, EXACT.box, 0.001) && allNear(b.rot, [0, 0, 0], 0.01) && allNear(b.scale, [1, 1, 1], 0.001),
    rot: !!c && allNear(c.rot, EXACT.cyl, 0.01) && allNear(c.pos, [0, 0, 0], 0.001),
    scale: !!k && allNear(k.scale, EXACT.cone, 0.001) && allNear(k.pos, [3, 0, 0], 0.001) && allNear(k.rot, [0, 0, 0], 0.01),
  };
}
export const PLANK = { rot: 30, slide: 2 };
export const PLANK_GOAL = [PLANK.slide * Math.cos(PLANK.rot * Math.PI / 180), PLANK.slide * Math.sin(PLANK.rot * Math.PI / 180), 0].map(v => +v.toFixed(4));
export const created = (st, type) => st.objs.some(o => o.type === type && o.created);
export const PARAM_GOAL = { box: { length: 2, width: 1, height: 0.5, lsegs: 4 }, sphere: { radius: 0.5, segs: 12 } };
export function paramReport(st) {
  const b = find(st, 'Box001'), s = find(st, 'Sphere001'), ok = (o, goal) => !!o && Object.entries(goal).every(([k, v]) => near(baseOf(st, o).params[k], v, 0.001));
  return { box: ok(b, PARAM_GOAL.box), sphere: ok(s, PARAM_GOAL.sphere) };
}
export function bendReport(st) {
  const c = find(st, 'Cylinder001'); if (!c) return { bend: false, segs: false };
  const b = modsOf(st, c).find(m => m.type === 'Bend' && m.on);
  return { bend: !!b && near(b.angle, 90, 1) && (b.axis || 'z') === 'z', segs: baseOf(st, c).params.hsegs >= 12 };
}
export function stackReport(st) {
  const b = find(st, 'Box001'); if (!b) return {};
  const ms = modsOf(st, b), tw = ms.find(m => m.type === 'Twist'), ta = ms.find(m => m.type === 'Taper');
  return { twist: !!tw && tw.on && near(tw.angle, 180, 1), taper: !!ta && ta.on && near(ta.amount, -0.5, 0.01), bulb: !!st.flags.bulbOff };
}
export function instanceReport(st) {
  const cols = st.objs.filter(o => o.type === 'Cylinder');
  const shared = cols.length > 0 && cols.every(o => o.base === cols[0].base);
  const r = cols.length ? baseOf(st, cols[0]).params.radius : 0;
  const apart = cols.every((a, i) => cols.every((b, j) => i === j || Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) >= 2 * r - 1e-6));
  return { count: cols.length, shared, radius: near(r, 0.4, 0.005), apart };
}
export const ARRAY_GOAL = { n1: 10, dx: 0.5, n2: 2, dy: 3 };
export function arrayReport(st) {
  const posts = st.objs.filter(o => o.type === 'Box' && /^Post/.test(o.name));
  const want = []; for (let j = 0; j < ARRAY_GOAL.n2; j++) for (let i = 0; i < ARRAY_GOAL.n1; i++) want.push([i * ARRAY_GOAL.dx, j * ARRAY_GOAL.dy]);
  const hit = want.filter(w => posts.some(p => near(p.pos[0], w[0], 0.01) && near(p.pos[1], w[1], 0.01) && near(p.pos[2], 0, 0.01)));
  return { count: posts.length, placed: hit.length, total: want.length };
}
export const TABLE = ['Table_Top', 'Leg001', 'Leg002', 'Leg003', 'Leg004'];
export const TABLE_SHIFT = [0, 3, 0];
export function groupReport(st) {
  const g = st.objs.find(o => isGroup(o) && o.name.toLowerCase() === 'table');
  const ms = g ? members(st, g.id).map(o => o.name).sort() : [];
  const inGroup = !!g && ms.length === TABLE.length && TABLE.every(n => ms.includes(n));
  const placed = st.ghosts.length > 0 && st.ghosts.every(gh => { const o = find(st, gh.name); return o && allNear(o.pos, gh.pos, 0.1); });
  return { group: inGroup, placed, frozen: !!find(st, 'Floor')?.frozen, hidden: !!find(st, 'Helper_Box')?.hidden };
}

// ─── Stages ─────────────────────────────────────────────────────────────────
export const STAGES = [
  {
    id: 'nav', name: 'Look around', sub: 'Viewports · navigation · ViewCube',
    steps: [
      {
        id: 'n1', title: 'Four viewports',
        text: '3ds Max opens with four viewports: Top, Front and Left, which have no perspective, and Perspective. They all show the same scene from different sides. Only one is active at a time: it has the yellow border, and it is the one that the keyboard, the navigation buttons and the ViewCube work on. Make each of the four viewports active once, then maximize the Perspective viewport and go back to the four views.',
        how: ['<b>Click</b> inside a viewport to make it active. A <b>right-click</b> also activates it without changing the selection.', 'Activate <b>Perspective</b> and press <kbd>Alt</kbd>+<kbd>W</kbd> (Maximize Viewport Toggle): it fills the whole area. Press <kbd>Alt</kbd>+<kbd>W</kbd> again to get the four views back.', 'The same button is at the bottom right of the window, next to the navigation controls.'],
        why: 'The three flat views are for placing things exactly (height, width, depth); the Perspective view is for seeing the result. You change active viewport all the time, so it is the first habit to learn.',
        start: () => { const s = S(); box(s, 'Box001', { length: 1.2, width: 1.2, height: 1.2 }, { pos: [-1.5, 0, 0] }); sph(s, 'Sphere001', { radius: 0.6 }, { pos: [1.5, 0, 0.6] }); cyl(s, 'Cylinder001', { radius: 0.4, height: 1.6 }, { pos: [0, 2, 0] }); return s; },
        check: s => ['top', 'front', 'left', 'persp'].every(k => s.flags['act_' + k]) && !!s.flags.maxed && !!s.flags.restored,
        solve: s => Object.assign(s.flags, { act_top: true, act_front: true, act_left: true, act_persp: true, maxed: true, restored: true }),
      },
      {
        id: 'n2', title: 'Orbit, pan and zoom',
        text: 'This box has three orange marks you cannot see from here: one on the back, one on the left side and one underneath. In the Perspective viewport, turn the view around the box to find them. A mark turns green when you have seen it from in front. Pan and zoom when you need to.',
        how: ['<b>Orbit</b>: hold <kbd>Alt</kbd> and drag with the <b>middle mouse button</b> (press the wheel).', '<b>Pan</b>: drag with the middle mouse button. <b>Zoom</b>: roll the wheel, or <kbd>Ctrl</kbd>+<kbd>Alt</kbd> + middle button.', 'To see underneath, keep orbiting below the grid. The navigation buttons at the bottom right (Pan View, Orbit) do the same with the left button.'],
        why: 'Orbit, pan and zoom move your point of view, not the objects. In 3ds Max the middle mouse button does all three, with Alt and Ctrl. A three-button mouse is almost a must.',
        start: () => { const s = S(); box(s, 'Box001', { length: 2, width: 2, height: 2 }, { pos: [0, 0, 0.6] }); s.marks = { obj: 'Box001', list: MARKS }; return s; },
        check: s => MARKS.every(m => s.flags.seen?.[m]),
        solve: s => { s.flags.seen = Object.fromEntries(MARKS.map(m => [m, true])); },
      },
      {
        id: 'n3', title: 'Zoom Extents and the ViewCube',
        text: 'In a big scene you do not search for objects by hand. Select the small Cone001 far away and press Z (Zoom Extents Selected): the active viewport flies to it. Then use the ViewCube of the Perspective viewport: click its TOP face to look from above, and its Home icon (the little house) to go back to the starting view.',
        how: ['Select <b>Cone001</b>: click it, click its name in the <b>Scene Explorer</b>, or press <kbd>H</kbd> (Select From Scene).', 'With the mouse over a viewport, press <kbd>Z</kbd>. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> frames everything (Zoom Extents All).', 'The <b>ViewCube</b> is at the top right of the active viewport: click a face, drag it to orbit, and click the house for Home.'],
        why: 'Zoom Extents also moves the centre of the orbit to the selection, so orbiting then turns around the object you work on.',
        start: () => { const s = S(); box(s, 'Box001', { length: 1, width: 1, height: 1 }, { pos: [0, 0, 0] }); cyl(s, 'Cylinder001', { radius: 0.5, height: 1.2 }, { pos: [-2.5, 1, 0] }); sph(s, 'Sphere001', { radius: 0.7 }, { pos: [2.5, 1.5, 0.7] }); cone(s, 'Cone001', { r1: 0.25, r2: 0, height: 0.5 }, { pos: [-9, 16, 0] }); s.sel = ['Box001']; return s; },
        check: s => !!(s.flags.zoomSel && s.flags.cubeFace && s.flags.cubeHome),
        solve: s => { s.sel = ['Cone001']; Object.assign(s.flags, { zoomSel: true, cubeFace: true, cubeHome: true }); },
      },
      {
        id: 'n4', title: 'Top, Front, Left, Perspective',
        text: 'Any viewport can show any point of view. Activate the Perspective viewport and turn it into Top (T), Front (F) and Left (L), then back into Perspective (P). The name at its top left changes each time. Then orbit one of the flat views (Top, Front or Left): its name becomes Orthographic, a user view without perspective.',
        how: ['With the mouse over the viewport, press <kbd>T</kbd>, <kbd>F</kbd>, <kbd>L</kbd> and <kbd>P</kbd>. The same views are in the <b>Point-of-View</b> label menu (click the name "Perspective").', 'Orbit a flat view with <kbd>Alt</kbd> + middle button. Press <kbd>T</kbd>, <kbd>F</kbd> or <kbd>L</kbd> in it to make it exact again.', '<kbd>F3</kbd> switches Wireframe Override on and off in the active viewport; <kbd>F4</kbd> shows Edged Faces.'],
        why: 'Top, Front and Left are orthographic: parallel lines stay parallel and sizes do not shrink with distance, so they are the views to align and measure. By default 3ds Max draws them in wireframe.',
        start: () => { const s = S(); box(s, 'Box001', { length: 1, width: 1, height: 1 }, { pos: [-1.5, 0, 0] }); cone(s, 'Cone001', { r1: 0.5, r2: 0, height: 1.4 }, { pos: [1.5, 0, 0] }); cyl(s, 'Cylinder001', { radius: 0.4, height: 1 }, { pos: [0, 1.8, 0] }); return s; },
        check: s => ['t', 'f', 'l', 'p'].every(k => s.flags['view_' + k]) && !!s.flags.orbitOrtho,
        solve: s => Object.assign(s.flags, { view_t: true, view_f: true, view_l: true, view_p: true, orbitOrtho: true }),
      },
    ],
  },
  {
    id: 'select', name: 'Select and transform', sub: 'Q W E R · Ctrl · Alt · Type-In',
    steps: [
      {
        id: 's1', title: 'Select three spheres',
        text: 'Select the three spheres and nothing else. The box and the cylinder are selected now. In 3ds Max, Ctrl adds to the selection and Alt removes from it, both for clicks and for a region drawn by dragging on an empty place.',
        how: ['<b>Click</b> an object to select only it. <kbd>Ctrl</kbd> + click adds (or removes a selected one), <kbd>Alt</kbd> + click removes.', 'Drag on an empty place to draw a <b>region</b>. The Window/Crossing button of the Main Toolbar decides if objects must be fully inside (Window) or just touched (Crossing).', '<kbd>Ctrl</kbd>+<kbd>A</kbd> all, <kbd>Ctrl</kbd>+<kbd>D</kbd> none, <kbd>Ctrl</kbd>+<kbd>I</kbd> invert, <kbd>H</kbd> by name. The Scene Explorer and the status bar show what is selected.'],
        why: 'Every command works on the selection. Region selection in the Top viewport is often the fastest way to pick many objects on the floor.',
        start: () => { const s = S(); box(s, 'Box001', { length: 1, width: 1, height: 1 }, { pos: [-3, -2, 0] }); box(s, 'Box002', { length: 1, width: 1, height: 1 }, { pos: [0, -2, 0] }); cyl(s, 'Cylinder001', { radius: 0.45, height: 1 }, { pos: [3, -2, 0] }); sph(s, 'Sphere001', { radius: 0.5 }, { pos: [-3, 1.5, 0.5] }); sph(s, 'Sphere002', { radius: 0.5 }, { pos: [0, 1.5, 0.5] }); sph(s, 'Sphere003', { radius: 0.5 }, { pos: [3, 1.5, 0.5] }); cone(s, 'Cone001', { r1: 0.5, r2: 0, height: 1.2 }, { pos: [0, 4.5, 0] }); s.sel = ['Box001', 'Cylinder001']; return s; },
        check: s => { const r = selectReport(s); return r.spheres === 3 && r.extra === 0; },
        solve: s => { s.sel = [...SELECT_GOAL]; },
      },
      {
        id: 's2', title: 'Move, rotate, scale',
        text: 'Put each object into its blue silhouette: the box needs a move (only along X), the cylinder a rotation, and the sphere a scale. A silhouette turns green when its object fits it.',
        how: ['<kbd>W</kbd> Select and Move, <kbd>E</kbd> Select and Rotate, <kbd>R</kbd> Select and Scale. <kbd>Q</kbd> goes back to Select Object.', 'Drag an <b>axis</b> of the gizmo (it turns yellow) to work only on that axis; the square between two axes moves in that plane. <kbd>F5</kbd> <kbd>F6</kbd> <kbd>F7</kbd> restrict to X, Y or Z.', 'Right-click while dragging cancels. <kbd>A</kbd> turns on Angle Snap: rotations jump 5° at a time.'],
        why: 'The gizmo shows the axes: red X, green Y, blue Z. Working on one axis at a time is how you keep objects on the floor and aligned.',
        start: () => { const s = S(); box(s, 'Box001', { length: 1, width: 1, height: 1 }, { pos: [-3, 0, 0] }); cyl(s, 'Cylinder001', { radius: 0.3, height: 2 }, { pos: [0, 2.5, 0] }); sph(s, 'Sphere001', { radius: 0.5 }, { pos: [3, 0, 0.5] }); s.ghosts = [ghost('Box001', [0, 0, 0]), ghost('Cylinder001', [0, 2.5, 0], [0, 90, 0]), ghost('Sphere001', [3, 0, 0.5], [0, 0, 0], [1.5, 1.5, 1.5])]; return s; },
        check: s => ghostsDone(s) && near(find(s, 'Box001').pos[1], 0, 0.001) && near(find(s, 'Box001').pos[2], 0, 0.001),
        solve: s => solveGhosts(s),
      },
      {
        id: 's3', title: 'Exact values: Transform Type-In',
        text: 'The mouse is not exact. Type the values instead, in the X, Y and Z fields of the status bar below the viewports. Put Box001 exactly at X -2, Y 3, Z 0.5; rotate Cylinder001 exactly 90° around X; and scale Cone001 to 200 % on Z only.',
        how: ['Select the object and choose the tool: with <kbd>W</kbd> the fields are the position, with <kbd>E</kbd> the rotation in degrees, with <kbd>R</kbd> the scale in %.', 'Type a value and press <kbd>Enter</kbd>. The button left of X switches between <b>Absolute</b> (the value itself) and <b>Offset</b> (added to the current one).', '<kbd>F12</kbd> opens the Transform Type-In dialog with both: Absolute: World and Offset.'],
        why: 'Real work uses real measures: a table 75 cm high, a door turned exactly 90°. The fields show where things are, so they are also the way to check.',
        start: () => { const s = S(); box(s, 'Box001', { length: 1, width: 1, height: 1 }, { pos: [-3, 0, 0] }); cyl(s, 'Cylinder001', { radius: 0.3, height: 1.6 }, { pos: [0, 0, 0] }); cone(s, 'Cone001', { r1: 0.5, r2: 0, height: 0.8 }, { pos: [3, 0, 0] }); s.ghosts = [ghost('Box001', EXACT.box), ghost('Cylinder001', [0, 0, 0], EXACT.cyl), ghost('Cone001', [3, 0, 0], [0, 0, 0], EXACT.cone)]; return s; },
        check: s => { const r = exactReport(s); return r.move && r.rot && r.scale; },
        solve: s => solveGhosts(s),
      },
      {
        id: 's4', title: 'Local coordinates',
        text: 'This plank is turned 30°. Slide it 2 m along its own length into the silhouette, without turning it. With the default coordinate system (View, which is World in the Perspective viewport) the X arrow points along the grid, not along the plank. Switch the Reference Coordinate System to Local: the gizmo turns with the object, and its X arrow follows the plank.',
        how: ['Choose <b>Local</b> in the <b>Reference Coordinate System</b> list of the Main Toolbar (it says View).', 'Select the plank, press <kbd>W</kbd> and drag the <b>X</b> arrow of the gizmo.', 'Go back to <b>View</b> when you finish: it is the usual setting.'],
        why: 'View uses the screen axes in the flat viewports and World in Perspective. Local uses the axes of the object itself: the way to move a turned object along its length, or to rotate a wheel on its own axle.',
        start: () => { const s = S(); box(s, 'Plank001', { length: 0.3, width: 3, height: 0.1 }, { pos: [0, 0, 0], rot: [0, 0, PLANK.rot] }); s.ghosts = [ghost('Plank001', PLANK_GOAL, [0, 0, PLANK.rot])]; s.sel = ['Plank001']; return s; },
        check: s => ghostsDone(s, { loc: 0.05, rot: 0.5, scale: 0.001 }) && !!s.flags.local,
        solve: s => { solveGhosts(s); s.flags.local = true; },
      },
    ],
  },
  {
    id: 'create', name: 'Create and modify', sub: 'Create panel · parameters · modifiers',
    steps: [
      {
        id: 'c1', title: 'Create primitives',
        text: 'Objects are born in the Create panel. Create a Box, a Sphere and a Cylinder, of any size, in any viewport. 3ds Max builds them with the mouse: you drag the base on the grid, and for boxes and cylinders you then move the mouse up or down for the height and click.',
        how: ['Command Panel › <b>Create</b> › Geometry › <b>Standard Primitives</b>. Click <b>Box</b>.', 'In a viewport, <b>drag</b> the base, release, <b>move</b> the mouse for the height and <b>click</b>. Sphere: drag the radius. Cylinder: drag the radius, then the height.', 'The tool stays on to create more. <b>Right-click</b> or <kbd>Esc</kbd> ends it. Name and colour are in the Name and Color rollout.'],
        why: 'Primitives are the starting point of most models: a box becomes a wall, a cylinder a column. The Top and Perspective viewports build on the ground; Front and Left build standing up, facing you.',
        start: () => { const s = S(); return s; },
        check: s => ['Box', 'Sphere', 'Cylinder'].every(t => created(s, t)),
        solve: s => { addObject(s, 'Box', { length: 1, width: 1, height: 1 }, { pos: [-2, 0, 0], created: true }); addObject(s, 'Sphere', { radius: 0.6 }, { pos: [0, 0, 0.6], created: true }); addObject(s, 'Cylinder', { radius: 0.4, height: 1.2 }, { pos: [2, 0, 0], created: true }); },
      },
      {
        id: 'c2', title: 'Parameters and segments',
        text: 'A primitive keeps its parameters: you can change its size and its segments at any moment in the Modify panel. Make Box001 2 m long, 1 m wide and 0.5 m high, with 4 Length Segs. Give Sphere001 a radius of 0.5 m and only 12 segments. Turn on Edged Faces (F4) to see the segments.',
        how: ['Select the object and open the <b>Modify</b> panel (second tab of the Command Panel).', 'In the <b>Parameters</b> rollout, type the values or drag the spinner arrows. Right-click the arrows sets a spinner to its minimum.', '<kbd>F4</kbd> shows the edges of the faces in the active viewport.'],
        why: 'Segments are the divisions of the surface. More segments: rounder spheres and room to bend, but a heavier model. Choose them for what the object has to do.',
        start: () => { const s = S(); box(s, 'Box001', { length: 1, width: 1, height: 1 }, { pos: [-1.5, 0, 0] }); sph(s, 'Sphere001', { radius: 0.8, segs: 32 }, { pos: [1.5, 0, 0.8] }); s.sel = ['Box001']; return s; },
        check: s => { const r = paramReport(s); return r.box && r.sphere; },
        solve: s => { Object.assign(baseOf(s, find(s, 'Box001')).params, PARAM_GOAL.box); Object.assign(baseOf(s, find(s, 'Sphere001')).params, PARAM_GOAL.sphere); },
      },
      {
        id: 'c3', title: 'Bend needs segments',
        text: 'Modifiers change an object without losing its parameters. Add a Bend modifier to the column and set its Angle to 90°. It will not look bent: the column has only one height segment, and Bend can only move the vertices that exist. Raise the Height Segments of the Cylinder to 12 or more, and it bends smoothly.',
        how: ['Select the column, open <b>Modify</b> and choose <b>Bend</b> in the <b>Modifier List</b>.', 'Type <b>90</b> in <b>Angle</b>. Bend Axis <b>Z</b> is the length of the column.', 'Click <b>Cylinder</b> at the bottom of the stack to see its parameters again, and raise <b>Height Segments</b>. The Bend stays on top.'],
        why: 'The modifier stack is a recipe read from the bottom up: the object first, then each modifier. You can change any step at any time, which is why modelling in 3ds Max stays editable.',
        start: () => { const s = S(); cyl(s, 'Cylinder001', { radius: 0.25, height: 3, hsegs: 1, sides: 18 }, { pos: [0, 0, 0] }); s.sel = ['Cylinder001']; return s; },
        check: s => { const r = bendReport(s); return r.bend && r.segs; },
        solve: s => { const b = baseOf(s, find(s, 'Cylinder001')); b.params.hsegs = 16; b.mods = [{ ...newMod('Bend'), angle: 90 }]; },
      },
      {
        id: 'c4', title: 'The modifier stack',
        text: 'Stack two modifiers on the pillar: a Twist of 180° and a Taper with an Amount of -0.5, so it turns and gets thinner at the top. Then switch the Twist off and on with its light bulb to compare, and leave both on.',
        how: ['Add <b>Twist</b> from the Modifier List and set <b>Angle</b> to 180. Add <b>Taper</b> and set <b>Amount</b> to -0.5.', 'Click the <b>light bulb</b> next to a modifier to switch it off without deleting it. The trash can below the stack removes the selected modifier.', 'Click an item of the stack to see its parameters.'],
        why: 'Each modifier works on the result of the ones below it. Switching one off lets you compare, and nothing is lost until you collapse the stack.',
        start: () => { const s = S(); box(s, 'Box001', { length: 0.6, width: 0.6, height: 3, hsegs: 12 }, { pos: [0, 0, 0] }); s.sel = ['Box001']; return s; },
        check: s => { const r = stackReport(s); return r.twist && r.taper && r.bulb; },
        solve: s => { baseOf(s, find(s, 'Box001')).mods = [{ ...newMod('Twist'), angle: 180 }, { ...newMod('Taper'), amount: -0.5 }]; s.flags.bulbOff = true; },
      },
    ],
  },
  {
    id: 'clone', name: 'Clone and organize', sub: 'Shift · Instance · Array · Group',
    steps: [
      {
        id: 'o1', title: 'Copy, Instance, Reference',
        text: 'Hold Shift while you move an object and 3ds Max clones it. Make three Instances of the column in a row, then change the Radius of any of them to 0.4 m: all four change, because instances share the same object. A Copy would be independent; a Reference shares the object but can have modifiers of its own.',
        how: ['Select the column, press <kbd>W</kbd>, hold <kbd>Shift</kbd> and drag the X arrow of the gizmo.', 'In <b>Clone Options</b> choose <b>Instance</b> and <b>Number of Copies: 3</b>. Each copy goes as far again as your drag.', 'Select any column, and in <b>Modify</b> change <b>Radius</b>. Instances show the object name in bold in the stack; <b>Make Unique</b> breaks the link.'],
        why: 'Instances save work and memory: fix one column, and all the columns of the building are fixed.',
        start: () => { const s = S(); cyl(s, 'Column001', { radius: 0.25, height: 3, hsegs: 5 }, { pos: [0, 0, 0] }); s.sel = ['Column001']; return s; },
        check: s => { const r = instanceReport(s); return r.count === 4 && r.shared && r.radius && r.apart; },
        solve: s => { cloneSelection(s, ['Column001'], 'instance', 3, (c, k) => moveBy(s, [c.id], [1.5 * k, 0, 0])); baseOf(s, find(s, 'Column001')).params.radius = 0.4; },
      },
      {
        id: 'o2', title: 'Array',
        text: 'For many copies in a pattern, use Array. Build a fence of posts: 10 posts in a row, 0.5 m apart along X, and a second row of 10, 3 m away along Y: 20 posts in all.',
        how: ['Select <b>Post001</b> and open <b>Tools › Array</b>.', 'Incremental <b>Move X: 0.5</b>. Array Dimensions: <b>1D Count 10</b>, then <b>2D Count 2</b> with the row offset <b>Y: 3</b>.', 'Total in Array must say 20. Click <b>OK</b>.'],
        why: 'Array repeats with steps you type: move, rotate and scale. Rotate an array around a pivot to make the spokes of a wheel or the chairs of a round table.',
        start: () => { const s = S(); box(s, 'Post001', { length: 0.1, width: 0.1, height: 1 }, { pos: [0, 0, 0] }); s.sel = ['Post001']; return s; },
        check: s => { const r = arrayReport(s); return r.count === r.total && r.placed === r.total; },
        solve: s => { arrayObject(s, 'Post001', { move: [ARRAY_GOAL.dx, 0, 0], count1: ARRAY_GOAL.n1, dims: 2, count2: ARRAY_GOAL.n2, move2: [0, ARRAY_GOAL.dy, 0], mode: 'instance' }); },
      },
      {
        id: 'o3', title: 'Group, hide and freeze',
        text: 'Tidy up the scene. Group the top and the four legs into a group called Table, and move the whole table into its silhouette. Freeze the Floor, so it cannot be selected by mistake, and hide Helper_Box.',
        how: ['Select the five parts and choose <b>Group › Group</b>. Type the name <b>Table</b>. A click on any part now selects the whole group; <b>Group › Open</b> lets you edit a part.', 'Right-click a viewport for the <b>quad menu</b>: Freeze Selection, Hide Selection, Unhide All, Unfreeze All.', 'Or use the <b>Scene Explorer</b>: the eye hides, the snowflake freezes.'],
        why: 'A clean scene is faster to work in: groups keep parts together, frozen objects stay visible but safe, and hidden ones stop getting in the way.',
        start: () => {
          const s = S();
          addObject(s, 'Plane', { length: 8, width: 8, lsegs: 4, wsegs: 4 }, { name: 'Floor', pos: [0, 0, 0], color: '#6e6e6e' });
          box(s, 'Table_Top', { length: 1, width: 1.8, height: 0.06 }, { pos: [0, -1.5, 0.72], color: '#b88a4f' });
          [[-0.8, -0.4], [0.8, -0.4], [0.8, 0.4], [-0.8, 0.4]].forEach(([x, y], i) => box(s, `Leg00${i + 1}`, { length: 0.06, width: 0.06, height: 0.72 }, { pos: [x, -1.5 + y, 0], color: '#8a6534' }));
          box(s, 'Helper_Box', { length: 0.6, width: 0.6, height: 0.6 }, { pos: [2.5, 2, 0], color: '#e6c21c' });
          s.ghosts = TABLE.map(n => { const o = find(s, n); return ghost(n, o.pos.map((v, i) => +(v + TABLE_SHIFT[i]).toFixed(4))); });
          return s;
        },
        check: s => { const r = groupReport(s); return r.group && r.placed && r.frozen && r.hidden; },
        solve: s => { groupObjects(s, TABLE, 'Table'); moveBy(s, ['Table'], TABLE_SHIFT); setFrozen(s, 'Floor', true); setHidden(s, 'Helper_Box', true); s.sel = []; },
      },
    ],
  },
  {
    id: 'free', name: 'Free mode', sub: 'Every tool of the lab', free: true,
    steps: [
      {
        id: 'f1', title: 'Free mode', free: true,
        text: 'Nothing to check here: a scene to practise freely. Create objects, change their parameters, stack modifiers, clone and group them.',
        how: ['Create panel for new objects, Modify panel for parameters and modifiers.', '<kbd>Shift</kbd> + drag clones, <b>Tools › Array</b> repeats, <b>Group › Group</b> groups.', '<kbd>Delete</kbd> deletes the selection. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.'],
        why: 'Free play is how the keys become habits.',
        start: () => { const s = S(); box(s, 'Box001', { length: 1, width: 1, height: 1 }, { pos: [0, 0, 0] }); return s; },
        check: () => false,
        solve: () => {},
      },
    ],
  },
];
export const steps = STAGES.flatMap(s => s.steps);
export function startState(step) { const s = step.start(); s.flags = s.flags || {}; return s; }
export { clone };
