// LOD & Mipmaps Lab: stages, steps and checks. Pure JS (tested with node).
import { LODS, DEFAULT_T, idealPct, thresholdReport, freqForRatio, rockTris, lodError, errorPx, minFreqAt, DECIMATE_D, TRI_TARGETS, ROCK, field, fieldStats } from './lod.js?v=1';

export function defaultState() {
  return { scene: 'rock', dist: 4, t: [...DEFAULT_T], fade: 'none', fadeW: 0, colors: false, ratios: [1, 1, 1], sel: 1,
    mips: true, filter: 'trilinear', aniso: 1, mipView: false, lods: true, bias: 1, cull: 0, flags: {}, quiz: 0 };
}
const clone = o => JSON.parse(JSON.stringify(o));
export function startState(step) { return Object.assign(defaultState(), clone(step.start || {}), { flags: {} }); }

// Frequencies of LOD0…LOD3 from the Decimate ratios of LOD1…LOD3.
export const slotFreqs = st => [ROCK.n0, ...st.ratios.map(r => freqForRatio(r))];
export const slotTris = st => slotFreqs(st).map(rockTris);
export const idealT = () => [1, 2, 3].map(i => idealPct(LODS[i]));
const FIELD = field();
export const fieldOf = () => FIELD;
export const BUDGET = 1100000;
export const budgetStats = st => fieldStats(FIELD, { lods: st.lods, bias: st.bias, cull: st.cull });
export function budgetOk(st) { const s = budgetStats(st); return s.tris <= BUDGET && s.worst <= 1.0001 && s.lostBig === 0; }

// Answer the current quiz question; returns { ok, item }.
export function answerQuiz(st, list, a) {
  const item = list[st.quiz | 0]; if (!item) return { ok: false, item: list[list.length - 1] };
  const ok = a === item.a; if (ok) st.quiz = (st.quiz | 0) + 1; return { ok, item };
}

export const DECIMATE_QUIZ = [
  { q: 'A scanned rock of two million triangles, for the background of a level.', a: 0, why: 'Organic shapes with no flat parts: Collapse removes, all over the mesh, the edges that change the shape least.' },
  { q: 'A terrain made with Subdivide: a regular grid of quads.', a: 1, why: 'Un-Subdivide undoes subdivision steps (Iterations) and keeps a clean grid of quads.' },
  { q: 'A crate whose big flat sides are cut into many small faces.', a: 2, why: 'Planar merges faces that lie in the same plane (Angle Limit): each flat side becomes one face and the shape does not change at all.' },
  { q: 'A wall whose UV seams and material borders must not move.', a: 2, why: 'Planar has Delimit: Normal, Material, Seam, Sharp and UV keep those borders where they are.' },
  { q: 'A symmetrical character that has to stay symmetrical.', a: 0, why: 'Collapse has a Symmetry option with an axis: both halves lose the same edges.' },
];
export const DECIMATE_OPTS = ['Collapse', 'Un-Subdivide', 'Planar'];
export const MIP_QUIZ = [
  { q: 'The floor texture has 512 px/m. Near the camera, 1 m of floor covers 512 pixels of the screen. Which mip does the GPU read?', a: 0, why: '512 ÷ 512 = 1 texel per pixel. log₂ 1 = 0: the full-size texture.' },
  { q: 'The same floor far away: 1 m covers 128 pixels.', a: 2, why: '512 ÷ 128 = 4 texels per pixel. log₂ 4 = 2: mip 2, a quarter of the size in each direction.' },
  { q: 'A wall with 1024 px/m, seen so far that 1 m covers 64 pixels.', a: 4, why: '1024 ÷ 64 = 16 texels per pixel. log₂ 16 = 4: mip 4, 1/16 of the size.' },
];
export const MEMORY_QUIZ = [
  { q: 'The floor and the walls of a level.', a: 0, why: 'They are seen far away and at grazing angles: without mips they shimmer, and reading big textures for tiny areas is slow.' },
  { q: 'A UI icon, always drawn at its real size, pixel for pixel.', a: 1, why: 'It is never smaller on screen, so the small mips are never read: they would only add a third more memory.' },
  { q: 'A tree seen from far away in a strategy game.', a: 0, why: 'It is always much smaller than its texture: without mips it sparkles and wastes bandwidth.' },
  { q: 'A pixel-art sprite enlarged ×2 or ×3.', a: 1, why: 'Enlarged, never reduced: mips are used only when a texture is smaller on screen. Use Point filtering to keep the pixels sharp.' },
];
export const MEMORY_OPTS = ['Mipmaps on', 'Mipmaps off'];
export const BUDGET_QUIZ = [
  { q: 'A strategy game: the camera is never closer than 30 m. Does the rock need its LOD0?', opts: ['Yes, always', 'No: ship only the lighter LODs'], a: 1, why: 'At 30 m the rock fills about 4 % of the screen height: nobody will ever see LOD0, so it only takes memory.' },
  { q: 'Rocks disappear in the distance while the player walks.', opts: ['Raise the Culled threshold', 'Lower the Culled threshold, or add a lighter last LOD'], a: 1, why: 'Culling removes objects below the threshold. If they are still big enough to see, they must stay, with a very light mesh.' },
  { q: 'The game is slow on low-end machines.', opts: ['Lower the LOD Bias in the low quality settings', 'Delete LOD0 from every model'], a: 0, why: 'A LOD Bias below 1 switches every object to lighter LODs earlier, without touching the assets.' },
  { q: 'A hero statue in the middle of the main square.', opts: ['The same thresholds as the rocks', 'Its own thresholds: LOD0 for longer'], a: 1, why: 'Thresholds are set per object: the player looks at the statue, so it can keep its detail longer.' },
];

export const STAGES = [
  {
    id: 'lod', name: 'What a LOD is', sub: 'LOD Group · screen height · popping',
    steps: [
      {
        id: 'l1', title: 'Far away, fewer triangles',
        text: 'This rock has four versions: LOD0 with 32,000 triangles, and LOD1, LOD2 and LOD3 with about half, a quarter and an eighth. A LOD Group shows one of them depending on how big the rock is on screen: its screen relative height, the % of the screen height it fills. Move the camera away and watch the version change. Look at the two squares in the corner: they show the rock at the real pixels of a 1080p screen, LOD0 next to the LOD in use.',
        how: ['Drag the <b>Distance</b> slider in the 3D header, or use the mouse wheel over the view.', 'Turn on <b>LOD colours</b>: each LOD gets a colour, as in the debug view of Unity.', 'See all four LODs: LOD0, LOD1, LOD2 and LOD3.'],
        why: 'A far rock covers a few pixels: 32,000 triangles there would be thousands of triangles per pixel. The GPU would work for nothing.',
        start: { scene: 'rock', dist: 3, colors: false },
        check: s => [0, 1, 2, 3].every(i => s.flags['seen' + i]),
        solve: s => { for (const i of [0, 1, 2, 3]) s.flags['seen' + i] = true; s.dist = 40; s.colors = true; },
      },
      {
        id: 'l2', title: 'When to switch',
        text: 'These thresholds switch far too early: LOD1 already takes over at 60 % of the screen height, and you can see the rock change. Each LOD has an error: how far its surface is from LOD0. On screen that error is measured in pixels, and it shrinks as the rock gets smaller. A LOD should appear when its error is about one pixel: less than 1 px so nobody sees it, and not much less, or you keep heavy meshes for nothing. Set the three thresholds.',
        how: ['In the <b>LOD Group</b> panel, drag the dividers of the bar or type the %.', 'Each row shows the <b>error on screen</b> at the moment that LOD switches in. Aim for 0.5–1 px (green).', 'Move the camera and compare the two squares at game resolution: at the switch they should look the same.'],
        why: 'The threshold is in % of the screen height, not in metres, so the same LOD Group works for a small or a big rock and on any screen resolution.',
        start: { scene: 'rock', dist: 6, t: [60, 40, 20, 1], colors: true },
        check: s => thresholdReport(s.t).every(r => !r.early && !r.late),
        solve: s => { s.t = [...idealT().map(p => Math.round(p * 0.85 * 10) / 10), 1]; },
      },
      {
        id: 'l3', title: 'Hide the pop',
        text: 'Even with good thresholds, the swap happens in one frame: the pop. Players notice it when the camera moves slowly. Unity\'s LOD Group has a Fade Mode: with Cross Fade the two LODs are mixed during a short range (Fade Transition Width), so one melts into the other. Turn it on and play the camera move.',
        how: ['In the <b>LOD Group</b> panel, set <b>Fade Mode</b> to <b>Cross Fade</b>.', 'Give it a <b>Fade Transition Width</b> of 0.1 or more.', 'Press <b>▶ Play</b> (or <kbd>Space</kbd>): the camera moves away slowly. Watch the LOD colours blend instead of jumping.'],
        why: 'Cross Fade costs a little (both LODs are drawn during the fade), so it is worth it on objects the player watches. LOD Bias in the quality settings moves every threshold at once.',
        start: { scene: 'rock', dist: 4, t: [23, 9.3, 3.6, 1], colors: true, fade: 'none', fadeW: 0 },
        check: s => s.fade === 'cross' && s.fadeW >= 0.1 && !!s.flags.playedCross,
        solve: s => { s.fade = 'cross'; s.fadeW = 0.25; s.flags.playedCross = true; },
      },
    ],
  },
  {
    id: 'make', name: 'Make the LODs', sub: 'Decimate · Collapse · Face Count',
    steps: [
      {
        id: 'd1', title: 'Halve the triangles',
        text: 'In Blender, each LOD is a copy of the model with a Decimate modifier. Collapse mode keeps a Ratio of the triangles: 0.5 keeps half. A common starting rule is to halve the triangles at every LOD: LOD1 50 %, LOD2 25 %, LOD3 12.5 % of LOD0. Set the Ratio of the three copies and check the Face Count.',
        how: ['Choose a copy in the tabs: <b>LOD1</b>, <b>LOD2</b> or <b>LOD3</b>.', 'In the <b>Decimate</b> modifier, drag the <b>Ratio</b>. The <b>Face Count</b> below shows the triangles left.', 'Get each copy within 10 % of its target. Turn on <b>Wireframe</b> to see the triangles disappear.'],
        why: 'Halving is a starting point, not a law: the right amount depends on the distance where each LOD will be seen. That is the next step.',
        start: { scene: 'decimate', dist: 3, ratios: [1, 1, 1], sel: 1 },
        check: s => slotTris(s).slice(1).every((n, i) => Math.abs(n / rockTris(ROCK.n0) - TRI_TARGETS[i]) <= TRI_TARGETS[i] * 0.1),
        solve: s => { s.ratios = [...TRI_TARGETS]; },
      },
      {
        id: 'd2', title: 'Only as many as the distance needs',
        text: 'The LOD Group of this level switches at fixed distances: LOD1 from 8 m, LOD2 from 20 m, LOD3 from 50 m. Each copy only needs enough triangles to keep its error under one pixel at the distance where it starts. Find the smallest Ratio for each copy: the view jumps to the distance of the selected copy.',
        how: ['Choose <b>LOD1</b>, <b>LOD2</b> or <b>LOD3</b>: the camera moves to 8, 20 or 50 m.', 'Lower the <b>Ratio</b> until the <b>error on screen</b> is just under 1 px.', 'Compare the squares at game resolution: LOD0 and your copy should look the same.'],
        why: 'The far LODs can lose much more than half: at 50 m the rock is a few dozen pixels high. Every triangle you remove there is saved for every rock in the level.',
        start: { scene: 'decimate', ratios: [0.5, 0.25, 0.125], sel: 1, fixedD: true },
        check: s => slotFreqs(s).slice(1).every((n, i) => errorPx(lodError(n), DECIMATE_D[i]) <= 1.0001 && n <= minFreqAt(DECIMATE_D[i]) + 1),
        solve: s => { s.ratios = DECIMATE_D.map(d => +((minFreqAt(d) / ROCK.n0) ** 2).toFixed(3)); },
      },
      {
        id: 'd3', title: 'Collapse, Un-Subdivide or Planar?',
        text: 'Decimate has three modes. Collapse merges edges wherever the shape changes least; it has a Ratio, Symmetry and Triangulate. Un-Subdivide undoes subdivision on grids of quads (Iterations). Planar merges faces that lie in the same plane, up to an Angle Limit, and can keep borders with Delimit. Choose the mode for each case.',
        how: ['Read the case in the <b>Case</b> panel.', 'Choose <b>Collapse</b>, <b>Un-Subdivide</b> or <b>Planar</b>.', 'Read why after each answer.'],
        why: 'The mode depends on the kind of mesh: organic, grid or hard surface. On real props you often mix them: Planar first, then Collapse.',
        start: { scene: 'decimate', ratios: [0.5, 0.25, 0.125], sel: 1 },
        check: s => (s.quiz | 0) >= DECIMATE_QUIZ.length,
        solve: s => { s.quiz = DECIMATE_QUIZ.length; },
      },
    ],
  },
  {
    id: 'mips', name: 'Mipmaps', sub: 'Shimmer · mip level · filtering',
    steps: [
      {
        id: 'm1', title: 'Far tiles shimmer',
        text: 'A texture has a LOD too. Far away, a pixel of the screen covers many texels of the floor, but the GPU reads only one of them: a different one in every frame, so the far floor sparkles and draws false patterns (moiré). Mipmaps are smaller copies of the texture, each half the size of the previous one, averaged in advance. Play the camera move with mipmaps off, then turn them on.',
        how: ['Press <b>▶ Play</b> and look at the far part of the floor.', 'In the <b>Texture</b> panel, turn on <b>Generate Mipmaps</b>.', 'Play again: the far floor turns calm and grey instead of noisy.'],
        why: 'The same rule as LODs: do not spend more detail than the pixels can show. With mips the GPU reads a copy whose texels are about the size of a screen pixel.',
        start: { scene: 'floor', mips: false, filter: 'trilinear', aniso: 1, dist: 1.6 },
        check: s => s.mips && !!s.flags.playedOff,
        solve: s => { s.mips = true; s.flags.playedOff = true; },
      },
      {
        id: 'm2', title: 'Which mip does the GPU read?',
        text: 'The mip colours view paints every mip with its own colour: now you see which copy the GPU reads on each part of the floor. The rule is simple: mip = log₂(texels per screen pixel). Mip 0 is the full texture, mip 1 is half, mip 2 a quarter… Work out three cases.',
        how: ['Look at the colour bands on the floor and at the <b>mip chain</b> in the Texture panel.', 'For each case, divide the texels per metre by the screen pixels per metre and take log₂.', 'Choose the mip.'],
        why: 'The GPU works this out for every pixel from how fast the UVs change across the screen. It is the same idea as texel density: texels per metre against pixels per metre.',
        start: { scene: 'floor', mips: true, mipView: true, filter: 'trilinear', aniso: 1 },
        check: s => (s.quiz | 0) >= MIP_QUIZ.length,
        solve: s => { s.quiz = MIP_QUIZ.length; },
      },
      {
        id: 'm3', title: 'Blur at grazing angles',
        text: 'Bilinear filtering reads one mip: you see a line where the GPU jumps from one mip to the next. Trilinear blends the two nearest mips and the lines disappear. But the far floor is still blurry: seen at a grazing angle, a pixel covers many texels in depth and few across, and the GPU picks the mip for the worst direction. Anisotropic filtering samples along the long direction and keeps the floor sharp.',
        how: ['Turn on <b>Mip colours</b> and set <b>Filter</b> to <b>Bilinear</b>: see the hard bands. Then <b>Trilinear</b>.', 'Turn off the colours and raise <b>Anisotropic</b> to ×8 or ×16: the far tiles get sharp again.', 'Keep Trilinear and ×8 or more.'],
        why: 'Anisotropic filtering costs some texture reads, so engines let you set it per texture (Aniso Level): high for floors and roads, low for things seen from the front.',
        start: { scene: 'floor', mips: true, mipView: true, filter: 'bilinear', aniso: 1 },
        check: s => s.filter === 'trilinear' && s.aniso >= 8,
        solve: s => { s.filter = 'trilinear'; s.aniso = 16; s.mipView = false; },
      },
      {
        id: 'm4', title: 'Mipmaps cost memory',
        text: 'The mip chain adds ¼ + ¹⁄₁₆ + ¹⁄₆₄… of the texture: one third more memory. It is worth it for almost every texture of a 3D scene, but not for all. Decide for each case.',
        how: ['Look at the <b>mip chain</b>: the size of each copy and the total.', 'Choose <b>Mipmaps on</b> or <b>Mipmaps off</b> for each case.', 'Read why after each answer.'],
        why: 'Mips are used only when a texture is smaller on screen than its real size. If that never happens, they are dead weight.',
        start: { scene: 'floor', mips: true, mipView: false, filter: 'trilinear', aniso: 8 },
        check: s => (s.quiz | 0) >= MEMORY_QUIZ.length,
        solve: s => { s.quiz = MEMORY_QUIZ.length; },
      },
    ],
  },
  {
    id: 'budget', name: 'Scene budget', sub: 'Triangles · culling · LOD Bias',
    steps: [
      {
        id: 'b1', title: 'A field of rocks',
        text: 'A level with 160 rocks, from 6 m to 300 m away. Without LODs the GPU draws 5 million triangles, most of them in rocks a few pixels high. The budget for this view is 1.1 million. Use the LOD Group, the LOD Bias and the Culled threshold (objects smaller than that % of the screen height are not drawn) to fit the budget without a visible error and without making visible rocks vanish.',
        how: ['Turn on <b>LOD Group</b> and read the triangles.', 'Try <b>LOD Bias</b> 0.5 and 2: see the triangles and the <b>worst error</b> change.', 'Set <b>Culled</b> so the far specks are not drawn, but no rock bigger than 1 % of the screen height disappears.'],
        why: 'LODs and culling do most of the work for free: the player sees the same picture. LOD Bias is the global knob for weaker machines.',
        start: { scene: 'field', lods: false, bias: 1, cull: 0, colors: false },
        check: s => budgetOk(s),
        solve: s => { s.lods = true; s.bias = 1; s.cull = 1; },
      },
      {
        id: 'b2', title: 'Decide',
        text: 'Four situations from real projects. Choose what you would do.',
        how: ['Read the case.', 'Choose an answer.', 'Read why.'],
        why: 'LODs, culling and mips are decisions of the whole team: art makes the meshes and textures, the engine settings decide when they are used.',
        start: { scene: 'field', lods: true, bias: 1, cull: 1, colors: true },
        check: s => (s.quiz | 0) >= BUDGET_QUIZ.length,
        solve: s => { s.quiz = BUDGET_QUIZ.length; },
      },
    ],
  },
];
export { LODS, DECIMATE_D, TRI_TARGETS, idealPct, thresholdReport };
