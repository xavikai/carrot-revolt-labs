// Texel Density Lab: stages, steps and checks. Pure JS (tested with node).
import { buildScene, objectsOf, packedUV, placeIsland, islandFaces, objectFaces, objectDensity, islandDensity, density, areas, inside, overlaps,
  averageIslandsScale, pack, setTD, minRes, onTarget, rightTarget, CAMERAS, GAMES, camOf, targetFor, setMB, bbox, translate, scale, cutUV, stripsOf, stripReport, SHEET } from './td.js?v=5';

const meshCache = new Map();
export function meshOf(st) {
  const opts = st.scene === 'cutwall' ? { cuts: st.cuts || [], zones: st.zones || [] } : {};
  const key = `${st.scene}|${JSON.stringify(st.scale || {})}|${JSON.stringify(opts)}`;
  if (!meshCache.has(key)) { if (meshCache.size > 24) meshCache.clear(); meshCache.set(key, buildScene(st.scene, st.scale, opts)); }
  return meshCache.get(key);
}
export function defaultState() {
  return { scene: 'trio', uv: null, res: {}, scale: {}, view: 'texture', uvImage: 'checker', ruler: false, target: null, flags: {}, cam: 'strategy', camTarget: 512, custom: { h: 1080, fov: 70, d: 2 }, active: null };
}
const clone = o => JSON.parse(JSON.stringify(o));
export function startState(step) {
  const s = Object.assign(defaultState(), clone(step.start || {}));
  for (const o of objectsOf(s.scene)) { s.res[o] ??= 1024; s.scale[o] ??= 1; }
  s.active ??= objectsOf(s.scene)[0];
  if (s.scene === 'cutwall') s.uv = cutUV(meshOf(s));
  else if (!s.uv) s.uv = packedUV(meshOf(s));
  if (step.setup) step.setup(s);
  return s;
}
// ─── Loop cuts on the corridor wall (step a4) ────────────────────────────────
// Keep st.uv in step with the cuts and the zones (the UVs follow from them).
export function syncCuts(st) {
  if (st.scene !== 'cutwall') return st;
  const n = stripsOf(st.cuts).length; st.zones = Array.from({ length: n }, (_, i) => (st.zones || [])[i] || 'bricks');
  st.uv = cutUV(meshOf(st)); return st;
}
export function addCut(st) {
  const s = stripsOf(st.cuts), [y0, y1] = s.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const y = Math.round((y0 + y1) / 2 * 100) / 100, i = s.findIndex(p => p[0] === y0);
  st.cuts = [...(st.cuts || []), y].sort((a, b) => a - b);
  const z = [...(st.zones || [])]; z.splice(i + 1, 0, z[i] || 'bricks'); st.zones = z;
  return syncCuts(st);
}
export function cutReport(st) {
  const res = st.res.cutwall || 1024, strips = stripReport(meshOf(st), res), tg = 512;
  const rows = strips.map(r => ({ ...r, ok: Math.abs(r.du - tg) <= tg * 0.1 && Math.abs(r.dv - tg) <= tg * 0.1 }));
  const zones = rows.map(r => r.zone);
  return { rows, cuts: rows.length - 1, base: zones[0] === 'baseboard', cornice: zones[zones.length - 1] === 'cornice', ok: rows.every(r => r.ok) };
}
export const densityOf = (st, obj) => objectDensity(meshOf(st), st.uv, obj, st.res[obj]);
export const islandDensityOf = (st, id) => { const m = meshOf(st); return islandDensity(m, st.uv, id, st.res[m.islands[id].obj]); };
export const islandsOf = (st, obj) => meshOf(st).objects[obj].islands;
export const isInside = (st, obj) => inside(st.uv, objectFaces(meshOf(st), obj));
export const overlapsOf = (st, obj) => overlaps(meshOf(st), st.uv, islandsOf(st, obj));

// Six faces of the crate in a 3 × 2 grid, `d` UV units per metre, centred in the square.
function crateGrid(st, d, gap = 0.02) {
  const m = meshOf(st), ids = islandsOf(st, 'crate'), a = 0.5 * d * (st.scale.crate ?? 1);
  const w = 3 * a + 2 * gap, h = 2 * a + gap;
  ids.forEach((id, i) => placeIsland(m, st.uv, id, { d, cu: 0.5 - w / 2 + a / 2 + (i % 3) * (a + gap), cv: 0.5 + h / 2 - a / 2 - Math.floor(i / 3) * (a + gap) }));
}
// UV area relative to the start of step m2 (to know which knob was turned).
const CRATE_UV_START = 0.25;   // UV units per metre at the start of m2

// ─── Step m1: measure ────────────────────────────────────────────────────────
export const MEASURE = [
  { q: 'The Front island covers 256 px of the image in width, and the face is 0.5 m wide. How many px/m is that?', res: 1024, d: 0.5, a: 512 },
  { q: 'Same islands, but the image is now 2048 px wide. The island covers the same part of the square, so it now covers twice as many pixels. How many px/m now?', res: 2048, d: 0.5, a: 1024 },
  { q: 'Back to 1024 px, and the islands were scaled down to half (S 0.5). How many px/m now?', res: 1024, d: 0.25, a: 256 },
];
function measureSetup(st, i) { const q = MEASURE[Math.min(i, MEASURE.length - 1)]; st.res.crate = q.res; crateGrid(st, q.d); }
export function answerMeasure(st, value) {
  const i = st.flags.quiz | 0; if (i >= MEASURE.length) return { done: true };
  const ok = Math.abs(value / MEASURE[i].a - 1) <= 0.03;
  if (ok) { st.flags.quiz = i + 1; if (i + 1 < MEASURE.length) measureSetup(st, i + 1); }
  return { ok, answer: MEASURE[i].a };
}

// ─── Step m2: three knobs ────────────────────────────────────────────────────
export function knobs(st) {
  const m = meshOf(st), f = objectFaces(m, 'crate'), { a2 } = areas(m, st.uv, f);
  const uvK = Math.sqrt(a2 / (6 * (0.5 * CRATE_UV_START) ** 2));
  return { res: st.res.crate !== 1024, scale: st.scale.crate !== 1, uv: Math.abs(uvK - 1) > 0.05, density: densityOf(st, 'crate') };
}
// After every change: if exactly one knob moved and the crate reaches 512 px/m cleanly, tick that knob.
export function updateKnobs(st) {
  const k = knobs(st), moved = ['res', 'scale', 'uv'].filter(x => k[x]);
  if (moved.length === 1 && onTarget(k.density, 512, 0.05) && isInside(st, 'crate') && !overlapsOf(st, 'crate').length) { st.flags['knob_' + moved[0]] = true; return moved[0]; }
  return null;
}
export function resetKnobs(st) { st.res.crate = 1024; st.scale.crate = 1; st.uv = packedUV(meshOf(st)); crateGrid(st, CRATE_UV_START); }

// ─── Match steps ─────────────────────────────────────────────────────────────
export const islandsOk = (st, obj, target, tol = 0.1) => islandsOf(st, obj).every(id => onTarget(islandDensityOf(st, id), target, tol)) && isInside(st, obj) && !overlapsOf(st, obj).length;
export function spread(st, obj) { const d = islandsOf(st, obj).map(id => islandDensityOf(st, id)); return Math.max(...d) / Math.min(...d); }
function cabinetExact(st) {
  const m = meshOf(st), d = 512 / st.res.cabinet;
  for (const [id, cu, cv] of [['front', 0.2, 0.85], ['back', 0.55, 0.85], ['top', 0.2, 0.6], ['left', 0.5, 0.55], ['right', 0.7, 0.55]]) placeIsland(m, st.uv, 'cabinet.' + id, { d, cu, cv });
}
// ─── Step a3 and c2: the texture of each object ──────────────────────────────
export const wasted = (st, obj, target) => st.res[obj] > (minRes(obj, target) ?? Infinity);
export function sceneStats(st, target) {
  const out = {}; let mb = 0;
  for (const o of objectsOf(st.scene)) { const d = densityOf(st, o); out[o] = { d, res: st.res[o], mb: setMB(st.res[o]), low: d < target * 0.95, waste: wasted(st, o, target) }; mb += setMB(st.res[o]); }
  return { per: out, mb };
}
// Memory of the whole scene with the smallest textures for each target (step c2 table).
export function memoryFor(scene, target) { return objectsOf(scene).reduce((s, o) => s + setMB(minRes(o, target) ?? 4096), 0); }
export const BUDGET_MB = 40;

// ─── Step e1: more for the hero, less for the hidden ─────────────────────────
export const HERO = { 'vending.front': 1024, 'vending.left': 512, 'vending.right': 512, 'vending.top': 256, 'vending.back': 128 };
export const HERO_WHY = {
  'vending.front': 'The player reads the buttons, the prices and the labels: 2 ×.',
  'vending.left': 'Seen when the player walks past: the scene target.',
  'vending.right': 'Seen when the player walks past: the scene target.',
  'vending.top': 'Almost never seen, 1.9 m high: ½ ×.',
  'vending.back': 'Against the wall, never seen: ¼ ×.',
};
export const heroOk = st => Object.entries(HERO).every(([id, t]) => onTarget(islandDensityOf(st, id), t)) && isInside(st, 'vending') && !overlapsOf(st, 'vending').length;

// ─── Quizzes ─────────────────────────────────────────────────────────────────
export const SEE_QUIZ = [
  { q: 'Click the prop with the biggest checker squares: it has the fewest px/m and will look blurriest.', a: 'wall' },
  { q: 'Now click the prop with the smallest squares: the sharpest one.', a: 'crate' },
];
export const RULES = [
  { q: 'The label of a bottle that the player picks up and reads.', a: 'higher', why: 'Text must be readable up close: give it more density.' },
  { q: 'The underside of a table that no camera ever sees.', a: 'lower', why: 'Pixels nobody sees are wasted: shrink it (or delete those faces).' },
  { q: 'Two wall modules that stand next to each other.', a: 'same', why: 'Side by side, any difference shows at once: keep the same density.' },
  { q: 'Mountains far behind the playable area.', a: 'lower', why: 'Far away, the GPU uses a small mip anyway: extra pixels are never shown.' },
  { q: 'The weapon held in first person, always close to the camera.', a: 'higher', why: 'It fills a big part of the screen all the time: first-person weapons get much more density.' },
  { q: 'A crate the player walks past in a third-person game.', a: 'same', why: 'An ordinary prop follows the scene target.' },
];
export function answerQuiz(st, list, a) {
  const i = st.flags.quiz | 0; if (i >= list.length) return { done: true };
  const ok = list[i].a === a; if (ok) st.flags.quiz = i + 1;
  return { ok, item: list[i] };
}
// Step c1: the camera and the target chosen together.
export const camFor = st => st.cam === 'custom' ? { name: 'Your game', ...(st.custom || { h: 1080, fov: 70, d: 2 }) } : camOf(st.cam);
export function camAnswer(st) { const ok = st.camTarget === targetFor(camFor(st)); if (ok && st.cam !== 'custom') st.flags['cam_' + st.cam] = true; return ok; }

// ─── Stages ──────────────────────────────────────────────────────────────────
export const STAGES = [
  {
    id: 'see', name: 'See it', sub: 'Checker map · px/m',
    steps: [
      {
        id: 's0', title: 'A ruler of one metre',
        text: 'Texel density answers one question: if you lay a ruler of one metre on the surface, how many pixels of the texture does it cover? Click a prop: the yellow ruler lies on it, and the same ruler is drawn on its texture in the UV Editor, where you can count the pixels. That number is the texel density, in px/m. It belongs to the model, like its size: it comes from the size of the texture, the size of its UV islands and the size of the object, and it does not change with the camera.',
        how: ['Click the <b>Wall</b> in the 3D view: 1 m of wall covers 335 px of its 1024 px texture, so it has 335 px/m.', 'Zoom into the ruler in the <b>UV Editor</b> (<b>Wheel</b>): every small square is one pixel of the texture.', 'Click the <b>Crate</b> and the <b>Barrel</b> too. The crate is only 0.5 m wide: its ruler is half a metre, so multiply its pixels by 2.'],
        why: 'A number per metre lets you compare objects of any size. What the camera changes is how many px/m you need, the target, which is stage 4.',
        start: { scene: 'trio', view: 'texture', uvImage: 'texture', ruler: true },
        check: s => !!(s.flags.rul_crate && s.flags.rul_wall && s.flags.rul_barrel),
        solve: s => { Object.assign(s.flags, { rul_crate: true, rul_wall: true, rul_barrel: true }); },
      },
      {
        id: 's1', title: 'The checker map',
        text: 'The ruler measures one place at a time. A checker map shows the density everywhere at once. These three props all have a 1024 px texture, but they are not equally sharp: the big wall spreads its pixels over much more surface than the small crate. A checker map makes density visible: every square is 64 × 64 texels, so bigger squares mean fewer pixels per metre. Switch to the checker and click each prop to read its density.',
        how: ['In the 3D Viewport header, switch the shading from <b>Texture</b> to <b>Checker</b>.', 'Click the <b>Crate</b>, the <b>Wall</b> and the <b>Barrel</b> in the 3D view.', 'Read the <b>Density</b> of each one (px/m) in the Texel Density panel, and compare the size of the squares.'],
        why: 'Texel density is invisible in a finished texture, but a checker map shows it at a glance. It is the first thing artists turn on to check their UVs.',
        start: { scene: 'trio', view: 'texture' },
        check: s => !!(s.flags.seen_checker && s.flags.sel_crate && s.flags.sel_wall && s.flags.sel_barrel && s.view === 'checker'),
        solve: s => { Object.assign(s.flags, { seen_checker: true, sel_crate: true, sel_wall: true, sel_barrel: true }); s.view = 'checker'; },
      },
      {
        id: 's2', title: 'Blurry next to sharp',
        text: 'Another artist textured these props. This time the numbers are hidden: use only the squares. Where the squares are big, each texel covers a big piece of surface and the texture looks soft; where they are small, it looks sharp. Next to each other the difference is obvious, and that is the problem texel density solves.',
        how: ['Look at the checker squares on the three props. Zoom in with the <b>Wheel</b> and orbit with <b>MMB</b>.', 'Answer the questions in the side panel by clicking a prop in the 3D view.', 'Switch to <b>Texture</b> and zoom in: the prop with the big squares is the blurry one.'],
        why: 'Players do not see numbers, they see a sharp crate next to a blurry wall. Matching densities keeps a scene consistent.',
        start: { scene: 'trio', view: 'checker', res: { crate: 2048, wall: 1024, barrel: 1024 } },
        check: s => (s.flags.quiz | 0) >= SEE_QUIZ.length,
        solve: s => { s.flags.quiz = SEE_QUIZ.length; },
      },
    ],
  },
  {
    id: 'measure', name: 'Measure it', sub: 'Islands · px ÷ m · three knobs',
    steps: [
      {
        id: 'm0', title: 'Islands on the image',
        text: 'A texture is an image: a grid of pixels, here 1024 × 1024. The UV Editor shows that same image as the square from 0 to 1. Unwrapping cuts the model into islands (groups of faces that stay together) and lays them flat on the image: each island says which pixels of the image paint its faces. So "pixels of texture" are the pixels of the image that an island covers. The UV map has no pixels of its own: it only places the faces on the texture.',
        how: ['Click a face of the crate: its island lights up in the UV Editor with its size in px of the image, and the 3D view shows the size of the face in m. Click three different faces.', 'In the UV Editor header, switch <b>Image</b> to <b>Texture</b>: the planks you see on the crate are painted on the image, inside each island. The grey around them is wasted pixels.', 'Zoom into an island with the <b>Wheel</b> until the pixel grid appears: every small square is one pixel of the texture (a texel).'],
        why: 'A face gets exactly the pixels its island covers on the image. A big island means many pixels for that face, so it looks sharp: that is the whole idea of texel density.',
        start: { scene: 'crate', view: 'texture', uvImage: 'checker', ruler: true },
        setup: s => crateGrid(s, 0.5),
        check: s => !!(s.flags.img_texture && s.flags.zoom_px && Object.keys(s.flags).filter(k => k.startsWith('isl_')).length >= 3),
        solve: s => { Object.assign(s.flags, { img_texture: true, zoom_px: true, isl_a: true, isl_b: true, isl_c: true }); s.uvImage = 'texture'; },
      },
      {
        id: 'm1', title: 'Pixels ÷ metres',
        text: 'Texel density is a division: pixels of the image over metres of surface. For a square island: the pixels it covers across (its width in the UV square × the size of the image) divided by the width of the face in metres. For any shape: texture size × √(UV area ÷ 3D area), which is what the add-ons compute. Read the numbers of the crate and answer three questions.',
        how: ['Click the <b>Front</b> island in the UV Editor (or the front of the crate).', 'The <b>Measure</b> panel shows the island in pixels and the face in metres.', 'Type the density in px/m and press <b>Check</b>.'],
        why: 'Once you can compute it by hand, the numbers of the add-ons stop being magic: you know what to change to move them.',
        start: { scene: 'crate', view: 'checker', ruler: true },
        setup: s => measureSetup(s, 0),
        check: s => (s.flags.quiz | 0) >= MEASURE.length,
        solve: s => { s.flags.quiz = MEASURE.length; measureSetup(s, MEASURE.length - 1); },
      },
      {
        id: 'm2', title: 'Three knobs',
        text: 'Density depends on three things together: the size of the texture, the size of the UV islands and the size of the object in 3D. This crate has 256 px/m and needs 512. Reach 512 px/m three times, turning one knob each time: a bigger texture, bigger islands, or a smaller crate. Go back to the start between tries.',
        how: ['<b>Texture</b>: in the Knobs panel, change the texture size.', '<b>UV</b>: press <b>A</b> in the UV Editor, then <b>S</b>, type <b>2</b>, <b>Enter</b>. Keep the islands inside the square and apart.', '<b>Object</b>: change <b>Scale</b> (Object Properties). Press <b>Back to start</b> between tries.'],
        why: 'Scaling an object in the 3D view changes its density too. In Blender, apply the scale (Ctrl A › Scale) before you measure or set texel density.',
        start: { scene: 'crate', view: 'checker', target: 512 },
        setup: s => resetKnobs(s),
        check: s => !!(s.flags.knob_res && s.flags.knob_uv && s.flags.knob_scale),
        solve: s => { Object.assign(s.flags, { knob_res: true, knob_uv: true, knob_scale: true }); resetKnobs(s); s.res.crate = 2048; },
      },
    ],
  },
  {
    id: 'match', name: 'Match it', sub: 'S · Average Islands Scale · Set TD',
    steps: [
      {
        id: 'a1', title: 'Same squares by hand',
        text: 'The islands of this cabinet were scaled by eye: the checker squares are different on every side. The target is 512 px/m on a 2048 px texture. Scale each island until it reaches the target, and keep all of them inside the square and apart.',
        how: ['Click an island and read its density in the <b>Islands</b> list: green means 512 px/m ± 10 %.', 'Press <b>S</b> and scale it (type a number: <b>S</b> <b>0.5</b> halves it). Move it with <b>G</b>.', 'Watch the 3D view: the squares become the same size on every side.'],
        why: 'Uniform squares across a model are the goal. Doing it once by hand shows why the automatic tools exist.',
        start: { scene: 'cabinet', view: 'checker', target: 512, res: { cabinet: 2048 } },
        setup: s => {
          const m = meshOf(s), d = 0.25;
          [['front', 0.25, 0.82, 0.55], ['back', 0.7, 0.74, 1.6], ['top', 0.22, 0.5, 1.0], ['left', 0.18, 0.2, 0.5], ['right', 0.62, 0.28, 1.4]]
            .forEach(([id, cu, cv, k]) => placeIsland(m, s.uv, 'cabinet.' + id, { d, cu, cv, k }));
        },
        check: s => islandsOk(s, 'cabinet', 512),
        solve: s => cabinetExact(s),
      },
      {
        id: 'a2', title: 'Average and pack',
        text: 'Blender does it for you in two clicks. Average Islands Scale gives every island the same density as the others. Pack Islands then makes them as big as possible inside the square, with a margin. Use both on this messy cabinet. Look at the density you get: packing fills the image, it does not know your target.',
        how: ['Click <b>Average Islands Scale</b> (<b>Ctrl A</b> in the UV Editor): all the islands get the same density.', 'Click <b>Pack Islands</b>: they fill the square, turned if needed, with a margin.', 'Read the density: it is higher than 512 px/m. The next step fixes that.'],
        why: 'Average + Pack is the everyday way to get even squares on one object. It sets the density by accident, so objects packed on their own still differ from each other.',
        start: { scene: 'cabinet', view: 'checker', res: { cabinet: 2048 } },
        setup: s => {
          const m = meshOf(s), d = 0.25;
          [['front', 0.3, 0.75, 1.3, 0], ['back', 0.72, 0.3, 0.6, 0], ['top', 0.3, 0.3, 1.7, 90], ['left', 0.62, 0.75, 0.7, 0], ['right', 0.85, 0.72, 1.2, 0]]
            .forEach(([id, cu, cv, k, rot]) => placeIsland(m, s.uv, 'cabinet.' + id, { d, cu, cv, k, rot }));
        },
        check: s => spread(s, 'cabinet') <= 1.06 && isInside(s, 'cabinet') && !overlapsOf(s, 'cabinet').length && areas(meshOf(s), s.uv, objectFaces(meshOf(s), 'cabinet')).a2 >= 0.45,
        solve: s => { const m = meshOf(s), ids = islandsOf(s, 'cabinet'); averageIslandsScale(m, s.uv, ids); pack(m, s.uv, ids); },
      },
      {
        id: 'a3', title: 'One density for the scene',
        text: 'Each prop was packed on its own, so each one has a different density. Give the whole scene 512 px/m. Texel Density Checker has a Set TD button that scales the islands to an exact density. But a small texture cannot reach 512 px/m on a big wall: first choose a texture big enough for each prop, and not bigger than needed.',
        how: ['Click a prop. In the <b>Texel Density</b> panel, choose its <b>Texture size</b>.', 'Press <b>Set TD</b>: the islands are scaled to 512 px/m. If they no longer fit in the square, the texture is too small.', 'Use the smallest texture that fits: a bigger one only wastes memory.'],
        why: 'The target density is a project decision; the texture size of each object comes from it: size in px ≈ target × size of the object in m.',
        start: { scene: 'trio', view: 'checker', target: 512, res: { crate: 1024, wall: 1024, barrel: 2048 } },
        check: s => objectsOf(s.scene).every(o => onTarget(densityOf(s, o), 512, 0.05) && isInside(s, o) && !wasted(s, o, 512)),
        solve: s => { const m = meshOf(s); for (const o of objectsOf(s.scene)) { s.res[o] = minRes(o, 512); } s.uv = packedUV(m); for (const o of objectsOf(s.scene)) setTD(m, s.uv, o, s.res[o], 512); },
      },
      {
        id: 'a4', title: 'Loop cuts for the texture zones',
        text: 'Game corridors are often textured with a trim sheet: one texture shared by many walls, with horizontal zones (baseboard, cornice, bricks) that repeat from left to right. This wall is a single quad. One face can only sit on one zone of the sheet, so it gets bricks from the floor to the ceiling, and stretched: the brick zone is 1.5 m high and the wall is 2 m. Turn on Wireframe to see the faces. Add loop cuts where the texture changes and send each strip to its zone: every strip must keep 512 px/m across and up.',
        how: ['In the 3D header, turn on <b>Wireframe</b>: the white lines are the edges of the faces. Now there is only one face.', 'In the <b>Loop cuts</b> panel press <b>Loop Cut</b> (<kbd>Ctrl</kbd> <kbd>R</kbd>) twice and type the heights: the baseboard is 0.25 m high and the cornice takes the top 0.25 m.', 'Choose the <b>Zone</b> of each strip. A strip taller or shorter than its zone is stretched: its px/m up changes.'],
        why: 'Density can only be kept where each part of the surface has its own faces to map. A plane without divisions can only repeat or stretch one piece of texture. Cut where the texture changes, not everywhere: the brick strip needs no more cuts.',
        start: { scene: 'cutwall', view: 'texture', uvImage: 'texture', target: 512, res: { cutwall: 1024 }, cuts: [], zones: ['bricks'] },
        check: s => { const r = cutReport(s); return r.base && r.cornice && r.ok; },
        solve: s => { s.cuts = [0.25, 1.75]; s.zones = ['baseboard', 'bricks', 'cornice']; syncCuts(s); },
      },
    ],
  },
  {
    id: 'choose', name: 'Choose it', sub: 'Camera · texture size · memory',
    steps: [
      {
        id: 'c1', title: 'The target comes from the camera',
        text: 'How much density is enough? It depends on how close the camera gets. On a 2560 × 1440 screen, one metre of wall covers about 125 px from 10 m away, 500 px from 2.5 m and 1000 px from 1.25 m. Fewer texels than screen pixels looks blurry; many more is wasted, because the GPU shows a smaller mip anyway. For each camera, choose the smallest target that gives at least one texel per screen pixel.',
        how: ['In the <b>Camera</b> panel, choose a camera: the 3D view moves to its distance.', 'Change the <b>Target</b> and look at the <b>Pixel loupe</b>: texels on the left, what the screen shows on the right.', 'Find the right target for the three cameras.'],
        why: 'That is why third-person games often use about 512 px/m and first-person games 1024 px/m or more.',
        start: { scene: 'wall', view: 'texture', cam: 'strategy', camTarget: 512 },
        check: s => !!(s.flags.cam_strategy && s.flags.cam_third && s.flags.cam_first),
        solve: s => { Object.assign(s.flags, { cam_strategy: true, cam_third: true, cam_first: true }); s.cam = 'first'; s.camTarget = 1024; },
      },
      {
        id: 'g1', title: 'Your game, your number',
        text: 'There is no single right density: each type of game gets its own, and they all come from the same calculation. Take three facts of your game: the screen height in pixels (H), the vertical field of view (FOV) and the closest distance the camera usually gets to a surface (d), not the rare moment the player presses their nose against a wall. One metre of surface then covers H ÷ (2 × d × tan(FOV ÷ 2)) pixels of the screen. The target is the power of two just above that number. Work it out for four games.',
        how: ['In the <b>Game type</b> panel, choose a game: the calculation fills in with its screen, FOV and distance.', 'Choose the <b>Target</b>: the smallest one at or above the pixels that 1 m covers on screen. The Pixel loupe shows the result.', 'Then choose <b>Your game</b> and type the numbers of your own project.'],
        why: 'Typical results: strategy and mobile 128–256 px/m, third person about 512, first person 1024, first-person weapons, VR and 4K more. Then the memory budget has the last word: many teams choose one step lower for the whole level and raise only the hero assets.',
        start: { scene: 'wall', view: 'texture', cam: 'mobile', camTarget: 512 },
        check: s => ['mobile', 'first4k', 'vr', 'weapon'].every(k => s.flags['cam_' + k]),
        solve: s => { for (const k of ['mobile', 'first4k', 'vr', 'weapon']) s.flags['cam_' + k] = true; s.cam = 'weapon'; s.camTarget = 4096; },
      },
      {
        id: 'c2', title: 'Texture size and memory',
        text: 'The level uses 512 px/m and has a texture budget of 40 MB. Each prop needs a texture big enough to reach the target: the big wall and the tall vending machine need more pixels than the small crate. Choose the smallest size for each prop. Then look at the table: doubling the density multiplies the memory by four.',
        how: ['In the <b>Budget</b> panel, choose the <b>Texture size</b> of each prop.', 'Every prop must reach 512 px/m, with no texture bigger than needed.', 'Compare the totals for 256, 512 and 1024 px/m.'],
        why: 'Memory grows with the square of the density: 2 × the px/m is 4 × the pixels. The target is a budget decision too.',
        start: { scene: 'shop', view: 'texture', target: 512, res: { crate: 4096, wall: 1024, barrel: 2048, vending: 1024 } },
        check: s => { const st = sceneStats(s, 512); return Object.values(st.per).every(p => !p.low && !p.waste) && st.mb <= BUDGET_MB; },
        solve: s => { for (const o of objectsOf(s.scene)) s.res[o] = minRes(o, 512); },
      },
    ],
  },
  {
    id: 'rules', name: 'Break the rule', sub: 'Hero areas · hidden faces',
    steps: [
      {
        id: 'e1', title: 'More for the hero, less for the hidden',
        text: 'Same density everywhere is the rule, but pixels are a budget. Spend them where the player looks. The front of this vending machine has buttons, prices and labels to read; its back stands against a wall and is never seen. Give each island the density in the list: front 1024, sides 512, top 256 and back 128 px/m.',
        how: ['Click an island: the <b>Islands</b> list shows its density and its own target.', 'Scale it with <b>S</b> (<b>S</b> <b>2</b> doubles the density, <b>S</b> <b>0.5</b> halves it) and move it with <b>G</b>.', 'All five must be green, inside the square and apart. Switch to <b>Texture</b> to read the front.'],
        why: 'Hero areas (faces, text, weapons) get more; hidden or far faces get less. Break the rule on purpose, never by accident.',
        start: { scene: 'vending', view: 'checker', res: { vending: 2048 } },
        setup: s => {
          const m = meshOf(s), d = 0.25;
          [['front', 0.14, 0.72], ['left', 0.39, 0.72], ['right', 0.62, 0.72], ['back', 0.86, 0.72], ['top', 0.14, 0.3]].forEach(([id, cu, cv]) => placeIsland(m, s.uv, 'vending.' + id, { d, cu, cv }));
        },
        check: s => heroOk(s),
        solve: s => {
          const m = meshOf(s);
          [['front', 0.5, 0.235, 0.5], ['left', 0.25, 0.58, 0.74], ['right', 0.25, 0.81, 0.74], ['top', 0.125, 0.58, 0.2], ['back', 0.0625, 0.8, 0.2]].forEach(([id, d, cu, cv]) => placeIsland(m, s.uv, 'vending.' + id, { d, cu, cv }));
        },
      },
      {
        id: 'e2', title: 'When to break it',
        text: 'Decide for each case: more density than the scene target, the same, or less. Think about how close the camera gets, what the player reads, and what nobody ever sees.',
        how: ['Read the case in the side panel.', 'Answer <b>Higher</b>, <b>Same</b> or <b>Lower</b>.', 'Read why after each answer.'],
        why: 'A texel density plan is a set of rules plus a short list of exceptions everybody on the team knows.',
        start: { scene: 'shop', view: 'texture', res: { crate: 1024, wall: 2048, barrel: 1024, vending: 2048 } },
        check: s => (s.flags.quiz | 0) >= RULES.length,
        solve: s => { s.flags.quiz = RULES.length; },
      },
    ],
  },
];
export { onTarget, rightTarget, CAMERAS, GAMES, camOf, targetFor, setMB, minRes, objectsOf, bbox, translate, scale, density, SHEET, stripsOf };
