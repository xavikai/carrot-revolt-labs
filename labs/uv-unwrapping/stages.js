// UV Unwrap Lab · stages, steps and checks. Pure JS (tested with node).
import * as U from './uvcore.js?v=1';
import { edgeLoop, flush, emptySel } from '../editmode/em.js?v=1';

export const RULES = { flat: 0.05, round: 0.35, density: 0.1 };
const clone = o => JSON.parse(JSON.stringify(o));
const all = m => U.allFaces(m);
const view = (o = {}) => ({ target: [0, 0, 0], dist: 8, az: -52, el: 24, ortho: false, auto: false, axis: null, ...o });

// Seams that open each object well (used by the solutions).
export function cylinderSeams(m, n = 16, base = 0) {
  return [...U.loopOf(m, base, base + 1, edgeLoop), ...U.loopOf(m, base + n, base + n + 1, edgeLoop), U.ek(base, base + n)];
}
export function sphereSeam(m, seg = 16, rings = 8) {
  const out = []; let prev = 0;
  for (let i = 1; i < rings; i++) { const v = 1 + (i - 1) * seg; out.push(U.ek(prev, v)); prev = v; }
  out.push(U.ek(prev, m.v.length - 1)); return out;
}
export function tableSeams(m) {
  const top = U.crossSeams({ v: m.v.slice(0, 8), f: m.f.slice(0, 6) });
  return [...top, ...[0, 1, 2, 3].flatMap(i => cylinderSeams(m, 8, 8 + i * 16))];
}
export const SIDE = [...Array(16).keys()];   // side faces of the cylinder
export const CAPS = [16, 17];                 // top and bottom n-gons

export function freshState(obj = 'cube') {
  const m = U.MESHES[obj]();
  return { obj, m, uv: U.resetUV(m), seams: [], sel: emptySel(), sm: 'edge', mode: 'edit', scale: [1, 1, 1], view: view(),
    flags: {}, active: null, uvSel: [], uvMode: 'vert', uvIsland: true, sync: false, stretch: 'off', live: false, lastOp: null };
}
export function startState(step) {
  const s = freshState(step.start?.obj || 'cube');
  const { obj, ...rest } = clone(step.start || {}); void obj;
  Object.assign(s, rest);
  if (step.setup) step.setup(s);
  return s;
}
export const selFaces = s => flush(s.m, s.sm, s.sel).F;
export const reportOf = (s, faces = all(s.m)) => U.report(s.m, s.uv, faces, s.scale);
const isReset = s => s.uv.every((f, i) => { const r = U.resetUV(s.m, null, [])[i]; return f.every((p, k) => Math.abs(p[0] - r[k][0]) < 1e-6 && Math.abs(p[1] - r[k][1]) < 1e-6); });
const flatOk = (r, islands = null) => r.collapsed === 0 && r.flipped === 0 && r.overlaps === 0 && r.maxArea < RULES.flat && r.maxShape < RULES.flat && (islands == null || r.islands === islands);
// Each side face of the cylinder upright in the UV map (bottom and top corners one above the other).
export function sideUpright(s) {
  return SIDE.every(fi => { const q = s.uv[fi]; return Math.abs(q[0][0] - q[3][0]) < 0.01 && Math.abs(q[1][0] - q[2][0]) < 0.01 && q[3][1] > q[0][1]; });
}

// The app calls this after each operator, so the steps can know what was done.
export function noteOp(s, op, opts = {}, faces = []) {
  const f = s.flags;
  if (op === 'unwrap' && opts.closed) f.closedUnwrap = true;
  if (op === 'view' && faces.includes(2)) f.viewFront = true;
  if (op === 'cylinder') f.cylObject = opts.direction === 'object';
  if (op === 'sphere') f.sphereObject = opts.direction === 'object' && faces.length === s.m.f.length;
  if (op === 'smart') { f.angles = [...new Set([...(f.angles || []), opts.angle])]; f.smart = true; f.smartMargin = opts.margin; }
  if (op === 'cube') f.cubeProj = true;
  if (op === 'move') f.moved = true;
  if (op === 'scaleUV') f.scaled = true;
  if (op === 'select') for (const fi of faces) (f.seen ||= {})[fi] = 1;
}

// Table islands of very different sizes, as if someone had scaled them by hand.
function messyTable(s) {
  s.seams = tableSeams(s.m);
  let uv = U.unwrap(s.m, s.uv, all(s.m), s.seams);
  const isl = U.uvIslands(s.m, uv, all(s.m));
  isl.forEach((I, i) => { const k = [0.35, 2.4, 1.6, 0.8, 2.2][i % 5]; uv = U.transformUV(uv, I, { s: [k, k], pivot: [0.5, 0.5] }); });
  s.uv = U.pack(s.m, uv, all(s.m), { margin: 0.01 });
  s.sel = { V: [], E: [], F: all(s.m) };
}

export const STAGES = [
  {
    id: 'map', name: 'The UV map', sub: 'Faces on an image',
    steps: [
      {
        id: 'a1', title: 'Faces on an image',
        text: 'A texture is a flat image, but the model is 3D. The UV map says which part of the image each face uses: every corner of every face gets two numbers, U (across) and V (up), from 0 to 1 over the image. The UV Editor on the left shows the image and, on top of it, the faces you select in the 3D Viewport. This is Blender\'s default cube: its six faces are already laid out in a cross.',
        how: ['In the 3D Viewport, click a face of the cube (Face select, <kbd>3</kbd>). Its square appears in the UV Editor, on the part of the image it shows.', 'Click two other faces, or <kbd>Shift</kbd> click to add them. Compare the letters and colours on the model with the ones in the UV Editor.', 'Nothing selected, nothing in the UV Editor: it only shows the UVs of the selected faces (unless <b>UV Sync Selection</b> is on).'],
        why: 'Every texturing tool, from painting to baking, reads the UV map. If you can read it, you know what any texture will do on the model.',
        start: { obj: 'cube', sm: 'face', setup: 'default' },
        check: s => Object.keys(s.flags.seen || {}).length >= 3,
        solve: s => { s.flags.seen = { 1: 1, 2: 1, 3: 1 }; s.sel = { V: [], E: [], F: [1, 2, 3] }; },
      },
      {
        id: 'a2', title: 'Move a face on the image',
        text: 'UVs are only coordinates: move them and the face shows another part of the image. The front face is selected. In the UV Editor, move its square with G and make it bigger or smaller with S. Watch the 3D Viewport: the texture slides and changes size on the face, but the model does not change at all.',
        how: ['Put the mouse over the <b>UV Editor</b> and click the square of the front face to select it.', 'Press <kbd>G</kbd>, move the mouse and click to confirm. The front of the cube now shows other letters.', 'Press <kbd>S</kbd> and scale it: smaller UVs show less of the image, so it looks bigger on the model.'],
        why: 'Bigger UV islands get more pixels of the texture and look sharper. Artists move and scale islands all the time to give each part the right space.',
        start: { obj: 'cube', sm: 'face', sel: { V: [], E: [], F: [2] }, setup: 'default' },
        check: s => !!(s.flags.moved && s.flags.scaled),
        solve: s => { s.uv = U.transformUV(s.uv, [2], { t: [0.1, 0.05], s: [0.6, 0.6], pivot: [0.5, 0.375] }); s.flags.moved = s.flags.scaled = true; },
      },
      {
        id: 'a3', title: 'Reset: the whole image on every face',
        text: 'UV › Reset puts each selected face on the whole image, from 0 to 1. Every face then shows the full texture, and all of them are on top of each other in the UV Editor. That is fine for a tiling texture on a wall, but useless for a painted texture: a scratch painted on one face would appear on every face.',
        how: ['Put the mouse over the 3D Viewport and press <kbd>A</kbd> to select all the faces.', 'Press <kbd>U</kbd> (UV menu) and choose <b>Reset</b>.', 'Look at the cube: the same full grid on the six faces. In the UV Editor there is only one square: six squares on top of each other.'],
        why: 'Overlapping UVs share pixels. To paint or bake each face on its own, the faces need their own place on the image: that is what unwrapping does.',
        start: { obj: 'cube', sm: 'face', setup: 'default' },
        check: s => isReset(s),
        solve: s => { s.uv = U.resetUV(s.m); s.sel = { V: [], E: [], F: all(s.m) }; },
      },
    ],
  },
  {
    id: 'seams', name: 'Seams', sub: 'Cut and unwrap',
    steps: [
      {
        id: 'b1', title: 'Unwrap without seams',
        text: 'Unwrap flattens the selected faces like a paper model. But a closed box cannot lie flat without cutting it: try it. With no seams, Blender still unwraps, but it cannot solve the island: it squashes the faces into a line and warns "Unwrap could not solve any island(s), edge seams may need to be added". On the model the texture turns into stripes.',
        how: ['Mouse over the 3D Viewport: press <kbd>A</kbd> to select everything.', 'Press <kbd>U</kbd> › <b>Unwrap Angle Based</b>.', 'Look at the UV Editor: the six faces are a thin line. Turn on <b>Display Stretch</b> (Overlays in the UV Editor header): red means a lot of stretch.'],
        why: 'A seam is where the surface is allowed to split. Without seams, a closed object has no edge to open it from, so the unwrap fails.',
        start: { obj: 'cube', sm: 'edge' },
        check: s => !!s.flags.closedUnwrap,
        solve: s => { s.sel = { V: [], E: U.edgesOf(s.m), F: [] }; s.uv = U.unwrap(s.m, s.uv, all(s.m), []); s.flags.closedUnwrap = true; },
      },
      {
        id: 'b2', title: 'Cut the box open',
        text: 'Mark seams on the edges where the cube may split, like the cuts of a cardboard box. A cube needs 7 cuts to lie flat in one piece: the 5 edges that stay joined hold the six faces together. Too few cuts and the unwrap still fails or stretches; with every edge cut you get six separate squares. Goal: one island, flat, with no stretch.',
        how: ['Edge select (<kbd>2</kbd>). Click an edge, <kbd>Shift</kbd> click more. <kbd>Alt</kbd> click selects a whole loop.', 'Mark them: <kbd>U</kbd> › <b>Mark Seam</b> (or <kbd>Ctrl</kbd> <kbd>E</kbd>, or right-click). Seams turn red. <b>Clear Seam</b> removes them.', 'Select all (<kbd>A</kbd>) and <kbd>U</kbd> › <b>Unwrap Angle Based</b>. Tip: turn on <b>Live Unwrap</b> in the UV Editor\'s UV menu to see the result each time you mark a seam.'],
        why: 'Where you put the seams decides where the texture has a visible join. Hide them where people do not look: under the object, at the back, along hard corners.',
        start: { obj: 'cube', sm: 'edge', setup: 'collapsed' },
        check: s => flatOk(reportOf(s), 1),
        solve: s => { s.seams = U.crossSeams(s.m); s.sel = { V: [], E: U.edgesOf(s.m), F: [] }; s.uv = U.unwrap(s.m, s.uv, all(s.m), s.seams); },
      },
      {
        id: 'b3', title: 'Seams on a cylinder',
        text: 'A cylinder is a tube with two lids. The classic cut: a loop around each lid, so the caps come off as two discs, and one straight seam down the side, so the tube unrolls into a rectangle, like the label of a tin. Goal: three islands with no stretch.',
        how: ['Edge select (<kbd>2</kbd>). <kbd>Alt</kbd> click an edge of the top rim: the whole loop is selected. <kbd>Shift</kbd> <kbd>Alt</kbd> click the bottom rim to add it.', '<kbd>Shift</kbd> click one vertical edge of the side. Put it at the back, where it will be seen less.', '<kbd>U</kbd> › <b>Mark Seam</b>, then <kbd>A</kbd> and <kbd>U</kbd> › <b>Unwrap Angle Based</b>.'],
        why: 'Most objects are made of simple shapes. Once you know how to cut a box, a tube and a ball, you can cut a bottle, a lamp or an arm.',
        start: { obj: 'cylinder', sm: 'edge' },
        check: s => flatOk(reportOf(s), 3),
        solve: s => { s.seams = cylinderSeams(s.m); s.sel = { V: [], E: U.edgesOf(s.m), F: [] }; s.uv = U.unwrap(s.m, s.uv, all(s.m), s.seams); },
      },
      {
        id: 'b4', title: 'Apply the scale first',
        text: 'Someone stretched this cube to twice its width in Object Mode (Scale X = 2) and then unwrapped it. Unwrap uses the mesh without the object\'s scale, so the islands are squares while the faces are rectangles: the texture is stretched. Blender warns about it: "Object has non-uniform scale, unwrap will operate on a non-scaled version of the mesh". Apply the scale and unwrap again.',
        how: ['The cube is in Object Mode. Mouse over the 3D Viewport: <kbd>Ctrl</kbd> <kbd>A</kbd> › <b>Scale</b>. The scale goes back to 1, 1, 1 and the cube keeps its shape.', 'Press <kbd>Tab</kbd> for Edit Mode, <kbd>A</kbd> to select all and <kbd>U</kbd> › <b>Unwrap Angle Based</b>.', 'Check: square checker cells, and a long cross in the UV Editor.'],
        why: 'Apply the scale before unwrapping, baking or adding modifiers: many tools use the mesh as it is stored, not as you see it.',
        start: { obj: 'cube', sm: 'edge', mode: 'object', scale: [2, 1, 1], setup: 'stretched' },
        check: s => s.scale.every(k => k === 1) && flatOk(reportOf(s), 1),
        solve: s => { s.m.v = U.worldV(s.m, s.scale); s.scale = [1, 1, 1]; s.mode = 'edit'; s.sel = { V: [], E: U.edgesOf(s.m), F: [] }; s.uv = U.unwrap(s.m, s.uv, all(s.m), s.seams); },
      },
    ],
  },
  {
    id: 'project', name: 'Projections', sub: 'View · cylinder · sphere',
    steps: [
      {
        id: 'c1', title: 'Project from View',
        text: 'Projections do not use seams: they shine the image onto the faces like a projector, from one direction. Project from View uses the direction you are looking from. Seen straight on, a flat face gets perfect UVs; seen at an angle, the UVs come out skewed. The front face is selected: project it from the front.',
        how: ['Try it first from here: mouse over the 3D Viewport, <kbd>U</kbd> › <b>Project from View</b>. The square comes out skewed (Display Stretch shows it).', 'Now look straight at the front: <kbd>Numpad 1</kbd> (or click <b>-Y</b> on the navigation gizmo).', 'Project again: <kbd>U</kbd> › <b>Project from View</b>. Now it is a perfect square.'],
        why: 'Project from View is the quickest way to map a flat part: a sign, a screen, the front of a building. Always look straight at it first.',
        start: { obj: 'cube', sm: 'face', sel: { V: [], E: [], F: [2] } },
        check: s => !!s.flags.viewFront && reportOf(s, [2]).maxShape < 0.03,
        solve: s => { s.view = view({ az: -90, el: 0, ortho: true, axis: 'front', auto: true }); s.uv = U.projectFromView(s.m, s.uv, [2], { r: [1, 0, 0], u: [0, 0, 1], f: [0, 1, 0] }, { ortho: true }); s.flags.viewFront = true; },
      },
      {
        id: 'c2', title: 'Cylinder Projection',
        text: 'Cylinder Projection wraps the image around an axis, like the label of a tin. By default Blender takes the axis from the view (View on Equator: the axis is the up direction of your screen), so from a tilted view the label comes out tilted. Fix it in the Adjust Last Operation panel: Direction › Align to Object uses the cylinder\'s own axis. Then the side is a straight strip, but squashed: all the way round (6.28 m) fits in the same width as the height (2 m). Scale it in U.',
        how: ['Mouse over the 3D Viewport: <kbd>A</kbd>, then <kbd>U</kbd> › <b>Cylinder Projection</b>.', 'Open the <b>Adjust Last Operation</b> panel (bottom left of the 3D Viewport) and set <b>Direction</b> to <b>Align to Object</b>. Each side face is now upright.', 'In the UV Editor, click the side strip and press <kbd>S</kbd> <kbd>X</kbd>, type <kbd>3</kbd><kbd>.</kbd><kbd>1</kbd><kbd>4</kbd> and <kbd>Enter</kbd>: the checker cells become square.'],
        why: 'Cylinder Projection is quick for tubes: pipes, tree trunks, bottles. But look at the lids: projected from the side they become lines. Next step.',
        start: { obj: 'cylinder', sm: 'face' },
        check: s => !!s.flags.cylObject && sideUpright(s) && reportOf(s, SIDE).maxShape < 0.1 && reportOf(s, SIDE).collapsed === 0,
        solve: s => { s.sel = { V: [], E: [], F: all(s.m) }; s.uv = U.cylinderProject(s.m, s.uv, all(s.m), { direction: 'object' }); s.uv = U.transformUV(s.uv, SIDE, { s: [Math.PI, 1], pivot: [0.5, 0.5] }); s.flags.cylObject = true; },
      },
      {
        id: 'c3', title: 'The lids, from above and below',
        text: 'The Cylinder Projection turned the two lids into lines (red in Display Stretch). A lid is flat, so project it from the direction that looks straight at it. Careful: the bottom lid seen from the top is seen through the object, back to front: its UVs come out mirrored (flipped). Project each lid from its own side.',
        how: ['Face select (<kbd>3</kbd>). Click the top lid. <kbd>Numpad 7</kbd> (top view), then <kbd>U</kbd> › <b>Project from View</b>.', 'Click the bottom lid. <kbd>Ctrl</kbd> <kbd>Numpad 7</kbd> (bottom view), then <kbd>U</kbd> › <b>Project from View</b>.', 'Both lids are now round, not flipped, with no stretch. They overlap other UVs: Pack Islands will fix that (stage 4).'],
        why: 'Real objects are mixes: one projection for the flat parts, another for the round ones. Mapping part by part, each from its best direction, is everyday work.',
        start: { obj: 'cylinder', sm: 'face', setup: 'cylProjected' },
        check: s => { const r = reportOf(s, CAPS); return r.collapsed === 0 && r.flipped === 0 && r.maxShape < 0.03 && sideUpright(s); },
        solve: s => {
          s.uv = U.projectFromView(s.m, s.uv, [16], { r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1] }, { ortho: true });
          s.uv = U.projectFromView(s.m, s.uv, [17], { r: [1, 0, 0], u: [0, -1, 0], f: [0, 0, 1] }, { ortho: true });
          s.sel = { V: [], E: [], F: [17] };
        },
      },
      {
        id: 'c4', title: 'Sphere Projection',
        text: 'Sphere Projection maps the image like a world map on a globe: U goes around, V from the south pole to the north pole. A sphere can never be flat without stretch: at the poles a whole row of the image is squeezed into one point (the pole pinches), and at the back there is a seam where U jumps from 1 to 0. Look where the stretch goes.',
        how: ['<kbd>A</kbd>, then <kbd>U</kbd> › <b>Sphere Projection</b>. In Adjust Last Operation, set <b>Direction</b> › <b>Align to Object</b>.', 'In the UV Editor header open <b>Overlays</b> and turn on <b>Display Stretch</b> (Area): blue is fine, red is stretched.', 'Orbit to the top of the sphere: the checker pinches at the pole.'],
        why: 'Planets, balls and eyes are mapped with this projection, and the poles are hidden or painted with care. For a ball that must look perfect, artists use more seams or a cube-sphere.',
        start: { obj: 'sphere', sm: 'face' },
        check: s => !!s.flags.sphereObject && s.stretch !== 'off',
        solve: s => { s.sel = { V: [], E: [], F: all(s.m) }; s.uv = U.sphereProject(s.m, s.uv, all(s.m), { direction: 'object' }); s.flags.sphereObject = true; s.stretch = 'area'; },
      },
    ],
  },
  {
    id: 'tidy', name: 'Tidy up', sub: 'Smart UV · Pack · Average',
    steps: [
      {
        id: 'd1', title: 'Smart UV Project',
        text: 'Smart UV Project needs no seams: it groups faces that point in similar directions (closer than the Angle Limit) and projects each group flat, then packs all the islands. A low Angle Limit gives more, smaller islands with less stretch; a high one gives fewer, bigger islands with more stretch. Island Margin leaves space between islands.',
        how: ['<kbd>A</kbd>, then <kbd>U</kbd> › <b>Smart UV Project</b>.', 'In the <b>Adjust Last Operation</b> panel, try <b>Angle Limit</b> 30° and then 89°. Count the islands in the UV Editor.', 'Set <b>Island Margin</b> to 0.02 or more, so the islands do not touch.'],
        why: 'Smart UV Project is great for hard-surface props (crates, machines, buildings) and for lightmaps. On organic shapes it makes too many seams: there you cut them by hand.',
        start: { obj: 'house', sm: 'face', view: view({ dist: 9 }) },
        check: s => (s.flags.angles || []).length >= 2 && (s.flags.smartMargin || 0) >= 0.02 && reportOf(s).overlaps === 0,
        solve: s => { s.sel = { V: [], E: [], F: all(s.m) }; s.uv = U.smartProject(s.m, s.uv, all(s.m), { angle: 66, margin: 0.02 }); s.flags.angles = [30, 66]; s.flags.smartMargin = 0.02; s.flags.smart = true; },
      },
      {
        id: 'd2', title: 'Cube Projection and Pack Islands',
        text: 'Cube Projection projects each face from the nearest of six directions, like a box around the object. Faces that look the same way land on top of each other: the front and the back wall share pixels. Pack Islands moves and rotates all the islands so none overlap and they use the image well, all at the same scale.',
        how: ['<kbd>A</kbd>, then <kbd>U</kbd> › <b>Cube Projection</b>. The lab panel counts the overlapping faces.', 'Mouse over the UV Editor: <kbd>A</kbd> to select all the UVs.', '<b>UV</b> › <b>Pack Islands</b> (<kbd>Ctrl</kbd> <kbd>P</kbd>). Try a <b>Margin</b> of 0.02 in Adjust Last Operation.'],
        why: 'Overlapping UVs are fine for tiling textures but break baking and painting: two faces would share one set of pixels. Pack Islands is the last step of almost every unwrap.',
        start: { obj: 'house', sm: 'face', view: view({ dist: 9 }) },
        check: s => { const r = reportOf(s); return !!s.flags.cubeProj && r.overlaps === 0 && r.outside === 0 && r.collapsed === 0; },
        solve: s => { s.sel = { V: [], E: [], F: all(s.m) }; s.uv = U.pack(s.m, U.cubeProject(s.m, s.uv, all(s.m)), all(s.m), { margin: 0.02 }); s.flags.cubeProj = true; },
      },
      {
        id: 'd3', title: 'Same size everywhere',
        text: 'This table is well cut, but someone scaled its islands by hand: the legs are huge on the image and the top is tiny. On the model the checker cells are big on the top and small on the legs: the texture would be blurry on the top and sharp on the legs. Average Islands Scale gives every island the same pixels per metre (texel density); then pack them again.',
        how: ['Mouse over the UV Editor: <kbd>A</kbd> to select all the UVs (the whole table is selected in the 3D Viewport).', '<b>UV</b> › <b>Average Islands Scale</b> (<kbd>Ctrl</kbd> <kbd>A</kbd>). Islands overlap now.', '<b>UV</b> › <b>Pack Islands</b> (<kbd>Ctrl</kbd> <kbd>P</kbd>).'],
        why: 'Even texel density makes the whole object equally sharp. The Texel Density Lab goes deeper into this.',
        start: { obj: 'table', sm: 'face', view: view({ dist: 7 }), setup: 'messyTable' },
        check: s => { const r = reportOf(s); return r.densityCV < 0.05 && r.overlaps === 0 && r.outside === 0; },
        solve: s => { s.uv = U.pack(s.m, U.averageScale(s.m, s.uv, all(s.m), s.scale), all(s.m), { margin: 0.01 }); },
      },
      {
        id: 'd4', title: 'Your turn: the table',
        text: 'Unwrap the whole table from zero with the tools you prefer: seams and Unwrap, projections, Smart UV Project… Finish with Average Islands Scale and Pack Islands. The lab panel checks what a teacher would check.',
        how: ['Goal: no collapsed or flipped faces, no overlaps, everything inside the 0–1 square.', 'Stretch below the limit (shape under 0.35) and even texel density (islands within 10 %).', 'Quick route: Smart UV Project. Clean route: seams on the top and on each leg (rims and one vertical edge), then Unwrap.'],
        why: 'There is no single right unwrap: each object gets the mix of tools that gives clean, even UVs with the seams where nobody looks.',
        start: { obj: 'table', sm: 'edge', view: view({ dist: 7 }) },
        check: s => { const r = reportOf(s); return r.collapsed === 0 && r.flipped === 0 && r.overlaps === 0 && r.outside === 0 && r.maxShape < RULES.round && r.densityCV < RULES.density; },
        solve: s => { s.seams = tableSeams(s.m); s.sel = { V: [], E: U.edgesOf(s.m), F: [] }; s.uv = U.pack(s.m, U.averageScale(s.m, U.unwrap(s.m, s.uv, all(s.m), s.seams), all(s.m), s.scale), all(s.m), { margin: 0.01 }); },
      },
    ],
  },
];

// Named setups (kept as names so the steps can be stored as JSON).
export const SETUPS = {
  default: s => { s.uv = U.defaultCubeUV(s.m); },
  collapsed: s => { s.uv = U.unwrap(s.m, s.uv, all(s.m), []); },
  stretched: s => { s.seams = U.crossSeams(s.m); s.uv = U.unwrap(s.m, s.uv, all(s.m), s.seams); },
  cylProjected: s => { s.uv = U.cylinderProject(s.m, s.uv, all(s.m), { direction: 'object' }); s.uv = U.transformUV(s.uv, SIDE, { s: [Math.PI, 1], pivot: [0.5, 0.5] }); },
  messyTable,
};
for (const st of STAGES) for (const sp of st.steps) if (typeof sp.start?.setup === 'string') { const name = sp.start.setup; delete sp.start.setup; sp.setup = SETUPS[name]; }
