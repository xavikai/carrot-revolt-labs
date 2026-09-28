// Lightmap Lab: stages, steps and checks. Pure JS (tested with node).
import { DEFAULT_BAKE, defaultRenderers, pack, noiseLevel, RIGHT_GI, OBJECT_NAMES, FBX_RIGHT, fbxReport, marginTexels, propLightmapSize, PATH, probeAt, blendProbes, apvProbes, AMBIENT_PROBE, createBake } from './lightmap.js?v=1';

const clone = o => JSON.parse(JSON.stringify(o));
export const FBX_START = { selected: false, types: 'all', applyScalings: 'All Local', forward: '-Z Forward', up: 'Y Up', applyUnit: true, applyTransform: false, smoothing: 'Normals Only', modifiers: false, uvOrder: 'lightmap-uv', scaleApplied: false, unityScale: 1, convertUnits: true, bakeAxis: false, genLightmapUVs: true };
export function defaultState() {
  return { scene: 'room', view: 'lit', uvChannel: 'uv0', margin: 0, propRes: 20, fbx: clone(FBX_START), bake: clone(DEFAULT_BAKE), renderers: defaultRenderers(),
    sun: 'baked', lightingMode: 'Baked Indirect', probeSystem: 'none', probes: [], apvSpacing: 3, refl: null, bakedKey: null, flags: {}, quiz: 0, sel: 'Floor' };
}
export function startState(step) { const s = Object.assign(defaultState(), clone(step.start || {}), { flags: {} }); if (step.setup) step.setup(s); return s; }
// The settings a bake depends on: when they change, the lightmap is out of date (Unity: "Lighting data is out of date").
export function bakeKey(st) { return st.scene === 'prop' ? JSON.stringify(['prop', st.uvChannel, +st.margin.toFixed(3), st.propRes]) : JSON.stringify(['room', st.bake, st.renderers, st.sun === 'baked' || st.lightingMode === 'Subtractive' ? 'direct' : st.sun === 'realtime' ? 'none' : 'indirect']); }
export const isBaked = st => st.bakedKey === bakeKey(st);
export const packOf = st => pack(st.renderers, st.bake);

// ─── Probes: error of the character's light along its walk ───────────────────
const truthCache = new Map();
export function lmFor(st) { const key = JSON.stringify([st.renderers, st.bake.bounces ? 1 : 0]); if (truthCache.has('lm' + key)) return truthCache.get('lm' + key); const b = createBake(st.renderers, { ...st.bake, resolution: 4, indirect: 16, env: 16, bounces: 1, filter: 'gaussian' }, 'baked'); while (!b.run(1e7)); const lm = { pack: b.pack, maps: b.result() }; truthCache.set('lm' + key, lm); return lm; }
export function probeList(st) { const pts = st.probeSystem === 'apv' ? apvProbes(st.apvSpacing) : st.probeSystem === 'groups' ? st.probes : []; const lm = lmFor(st); return pts.map(p => ({ p, v: probeValue(p, st, lm) })); }
const pvCache = new Map();
function probeValue(p, st, lm) { const k = p.map(x => x.toFixed(2)).join(',') + JSON.stringify(st.renderers); if (!pvCache.has(k)) { if (pvCache.size > 3000) pvCache.clear(); pvCache.set(k, probeAt(p, st.renderers, lm)); } return pvCache.get(k); }
export function probeReport(st) {
  const lm = lmFor(st), probes = probeList(st);
  let worst = 0; const rows = [];
  for (const p of PATH) {
    const truth = probeValue(p, st, lm).amb, got = probes.length ? blendProbes(p, probes).amb : AMBIENT_PROBE;
    const y = v => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    rows.push({ p, truth: y(truth), got: y(got) });
  }
  const mean = rows.reduce((a, r) => a + r.truth, 0) / rows.length;
  for (const r of rows) { r.e = Math.abs(r.got - r.truth) / Math.max(r.truth, 0.3 * mean); worst = Math.max(worst, r.e); }
  return { worst, mean: rows.reduce((a, r) => a + r.e, 0) / rows.length, rows, count: probes.length };
}

// ─── Quizzes ─────────────────────────────────────────────────────────────────
export function answerQuiz(st, list, a) { const item = list[st.quiz | 0]; if (!item) return { ok: false, item: list[list.length - 1] }; const ok = a === item.a; if (ok) st.quiz = (st.quiz | 0) + 1; return { ok, item }; }
export const MODE_OPTS = ['Baked Indirect', 'Shadowmask', 'Distance Shadowmask', 'Subtractive'];
export const MODE_QUIZ = [
  { q: 'A mobile game with one sun and very little GPU time. Static shadows can be baked; characters need a simple shadow.', a: 3, why: 'Subtractive bakes everything, including the sun\'s direct light and static shadows, and draws only the characters\' shadow from the main directional light. It is the cheapest mode.' },
  { q: 'An interior where lamps can be dimmed during play, and everything must receive real-time direct light and shadows.', a: 0, why: 'Baked Indirect bakes only the bounced light. Direct light and all shadows are real time, so they react when a light changes (the bounce does not).' },
  { q: 'An open world on PC: static buildings far away must still cast shadows, but real-time shadows only reach 50 m.', a: 1, why: 'Shadowmask stores static shadows in a mask texture and uses them beyond the Shadow Distance, so far buildings keep their shadows cheaply.' },
  { q: 'The same open world on high-end PC, where near static objects should get real-time shadows too for the best quality.', a: 2, why: 'Distance Shadowmask uses real-time shadows for everything within the Shadow Distance and the baked shadowmask beyond it. Best quality, highest cost.' },
];
export const BAKE_QUIZ = MODE_QUIZ;

// ─── Stages ──────────────────────────────────────────────────────────────────
const fbxOk = s => fbxReport(s.fbx).length === 0;
export const STAGES = [
  {
    id: 'uv', name: 'UV2 and export', sub: 'Blender · Lightmap Pack · FBX',
    steps: [
      {
        id: 'u1', title: 'A second UV map for the light',
        text: 'The crate uses its first UV map for a tiling wood texture: all five faces are on the whole square, one on top of another. That is fine for a texture, but a lightmap stores the light of every point of the model, so each face needs its own texels. Bake with UV0 and see the light of the top and the shadowed sides mixed on every face. Then use UV1, a second UV map made with Lightmap Pack, and bake again.',
        how: ['In the <b>Model</b> panel, keep <b>Lightmap UVs: UV0</b> and press <b>Generate Lighting</b>. Look at the crate and the <b>Lightmap</b> view.', 'Switch to <b>UV1 (Lightmap)</b> and press <b>Generate Lighting</b> again.', 'In Blender: Object Data › <b>UV Maps</b> › + to add a second map, then in the UV Editor <b>UV › Lightmap Pack</b> (or Smart UV Project) with the new map active.'],
        why: 'Unity bakes lightmaps into the second UV channel (UV1, Mesh.uv2). It must have no overlaps and every face at a size that matches its real area.',
        start: { scene: 'prop', uvChannel: 'uv0', margin: 0.05, propRes: 20 },
        check: s => s.uvChannel === 'uv1' && isBaked(s) && !!s.flags.bakedUV0,
        solve: s => { s.flags.bakedUV0 = true; s.uvChannel = 'uv1'; s.bakedKey = bakeKey(s); },
      },
      {
        id: 'u2', title: 'Margin between the islands',
        text: 'The islands of UV1 touch each other. When the GPU reads the lightmap it blends neighbouring texels, so the bright top leaks into the dark side along the edges: light or dark lines. Leave a margin between the islands. How much? It is measured in texels of the final lightmap: this crate gets about 50 × 50 texels at 20 texels per metre, and the margin needs at least 2 of them.',
        how: ['In the <b>Blender</b> panel, raise the <b>Lightmap Pack › Margin</b>.', 'The readout converts the margin to texels of the crate\'s lightmap: aim for 2–6 texels.', 'Press <b>Generate Lighting</b> and zoom on the crate\'s edges.'],
        why: 'Unity\'s own Generate Lightmap UVs does the same with Pack Margin (in texels of a 1024 map) or Margin Method: Calculate. A margin that is too big wastes lightmap space.',
        start: { scene: 'prop', uvChannel: 'uv1', margin: 0, propRes: 20 },
        check: s => { const m = marginTexels(s.propRes, s.margin); return s.uvChannel === 'uv1' && m >= 2 && m <= 6 && isBaked(s); },
        solve: s => { s.uvChannel = 'uv1'; s.margin = 0.07; s.bakedKey = bakeKey(s); },
      },
      {
        id: 'u3', title: 'Export the FBX for Unity',
        text: 'The crate goes to Unity. A wrong export setting shows up as a model 100 times too big, lying on its back (rotated 90°), with its lightmap UVs in the wrong channel, or with Unity overwriting them. Fix the Blender FBX export options and the Unity Model import settings until the preview is right.',
        how: ['<b>Blender</b>: apply the scale (<kbd>Ctrl</kbd> <kbd>A</kbd> › Scale), put the texture UV map first and the lightmap UV map second, then set the FBX export options.', '<b>Unity</b> Model tab: <b>Scale Factor</b> 1, <b>Convert Units</b> on, <b>Bake Axis Conversion</b> on; turn <b>Generate Lightmap UVs</b> off, because you made your own.', 'The <b>Unity preview</b> shows the imported crate and the problems still left.'],
        why: 'Blender is Z up and in metres; Unity is Y up and reads FBX in centimetres. These options convert both without leaving odd rotations or scales on the object, which would change its size in the lightmap too.',
        start: { scene: 'prop', uvChannel: 'uv1', margin: 0.07, propRes: 20, fbxView: true },
        check: s => fbxOk(s),
        solve: s => { Object.assign(s.fbx, FBX_RIGHT, { bakeAxis: true, applyTransform: false }); },
      },
    ],
  },
  {
    id: 'bake', name: 'Bake in Unity', sub: 'Resolution · Scale In Lightmap · samples',
    steps: [
      {
        id: 'b1', title: 'Lightmap Resolution',
        text: 'The room is baked with 4 texels per unit: the sun patch from the window has blurry, stepped edges and the pillar\'s shadow is a smudge. Lightmap Resolution is a texel density: texels per metre of surface. Raise it until the shadows are sharp enough, but keep all the room in one lightmap of 512 × 512 (Max Lightmap Size).',
        how: ['In the <b>Lighting</b> panel, change <b>Lightmap Resolution</b> (texels per unit).', 'Press <b>Generate Lighting</b>. The <b>Lightmap</b> view shows the atlas and the number of lightmaps.', 'Aim for 10–25 texels per unit and 1 lightmap.'],
        why: 'Double the resolution means four times the texels, the memory and the bake time. Interiors usually use 10–40 texels per unit; big exteriors much less.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 4 }, sun: 'baked' },
        check: s => s.bake.resolution >= 10 && s.bake.resolution <= 25 && packOf(s).pages === 1 && isBaked(s),
        solve: s => { s.bake.resolution = 15; s.bakedKey = bakeKey(s); },
      },
      {
        id: 'b2', title: 'Scale In Lightmap',
        text: 'Not every surface needs the same detail. The player looks at the floor all the time; the ceiling is almost never seen. Each Mesh Renderer has a Scale In Lightmap that multiplies the resolution for that object. Give the floor twice the detail and the ceiling a quarter, and keep everything in one lightmap of 256 × 256.',
        how: ['Select the <b>Floor</b> in the <b>Objects</b> list and set its <b>Scale In Lightmap</b> to 2.', 'Select the <b>Ceiling</b> and set it to 0.25 (or less). Lower other hidden surfaces if the atlas does not fit.', 'Press <b>Generate Lighting</b>: one lightmap.'],
        why: 'It is the same idea as texel density: spend where the camera looks. Unity\'s Lightmap Parameters assets and the Baked Lightmap view help find where the texels go.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 12, maxSize: 256 }, sun: 'baked' },
        check: s => s.renderers.Floor.scale >= 2 && s.renderers.Ceiling.scale <= 0.25 && s.bake.resolution >= 12 && packOf(s).pages === 1 && isBaked(s),
        solve: s => { s.renderers.Floor.scale = 2; s.renderers.Ceiling.scale = 0.25; s.bakedKey = bakeKey(s); },
      },
      {
        id: 'b3', title: 'Bounces, samples and denoiser',
        text: 'With 0 bounces only the sun and the sky light the room: the corners and the ceiling are black, and nothing gets the warm light that the floor sends back. Turn on bounces. Then the bounced light is noisy: each texel averages a few random rays. Raise Indirect Samples and use a denoiser until the noise disappears.',
        how: ['<b>Max Bounces</b>: 2. Press <b>Generate Lighting</b> and look at the ceiling.', 'The <b>noise</b> readout drops with more <b>Indirect Samples</b> (4 × the samples halves it) and much more with <b>Filtering</b>: <b>Denoiser</b>.', 'Aim for noise under 3 % with a bake time you can accept.'],
        why: 'Unity\'s Progressive Lightmapper bakes direct, indirect and AO separately and can filter each one: the denoiser (OpenImageDenoise or OptiX) removes the indirect noise and keeps sharp shadows.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 8, bounces: 0, indirect: 16, env: 16, filter: 'none' }, sun: 'baked' },
        check: s => s.bake.bounces >= 2 && noiseLevel(s.bake) <= 0.03 && isBaked(s),
        solve: s => { Object.assign(s.bake, { bounces: 2, indirect: 64, filter: 'denoiser' }); s.bakedKey = bakeKey(s); },
      },
    ],
  },
  {
    id: 'modes', name: 'Light modes', sub: 'Baked · Mixed · static objects',
    steps: [
      {
        id: 'm1', title: 'The character has no shadow',
        text: 'A character walks through the room. The sun is a Baked light: its light and shadows exist only in the lightmap, so the character is not lit by it and casts no shadow on the floor. Make the sun Mixed with the Lighting Mode Baked Indirect: Unity then bakes only the bounced light and draws the sun\'s direct light and shadows in real time.',
        how: ['Press <b>▶ Play</b> to see the character walk.', 'Select the <b>Directional Light</b> and set <b>Mode</b> to <b>Mixed</b>. In the <b>Lighting</b> panel, <b>Lighting Mode</b>: <b>Baked Indirect</b>.', 'Press <b>Generate Lighting</b> (the lightmap now holds only the bounce) and play again.'],
        why: 'Baked is cheapest but ignores anything that moves. Mixed keeps the bounce baked and gives moving objects real-time light and shadows. Realtime lights cost the most and bake nothing.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 8, bounces: 2, indirect: 32, filter: 'denoiser' }, sun: 'baked', view: 'lit' },
        check: s => s.sun === 'mixed' && s.lightingMode === 'Baked Indirect' && isBaked(s),
        solve: s => { s.sun = 'mixed'; s.lightingMode = 'Baked Indirect'; s.bakedKey = bakeKey(s); },
      },
      {
        id: 'm2', title: 'Static or not',
        text: 'Only objects marked static (Contribute Global Illumination) take part in the bake. Each object decides how it receives baked light: from Lightmaps or from Light Probes. Here some settings are wrong: the door opens during the game but it is static, so its baked shadow stays on the floor when it moves; the small vase wastes lightmap space. Fix the Mesh Renderer of each object.',
        how: ['Select each object in the <b>Objects</b> list and look at its <b>Mesh Renderer › Lighting</b>.', 'Big, still surfaces: <b>Contribute Global Illumination</b> on and <b>Receive Global Illumination: Lightmaps</b>. Small props: Light Probes. Anything that moves: not static.', 'Press <b>Generate Lighting</b>. Press <b>▶ Play</b> to open the door.'],
        why: 'Lightmaps are for large static surfaces. Small or detailed static props look better and cost less with probes, and moving objects must never be baked.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 8, bounces: 2, indirect: 32, filter: 'denoiser' }, sun: 'mixed', lightingMode: 'Baked Indirect', sel: 'Door' },
        setup: s => { s.renderers.Door = { contribute: true, receive: 'lightmaps', scale: 1 }; s.renderers.Vase = { contribute: true, receive: 'lightmaps', scale: 1 }; },
        check: s => OBJECT_NAMES.every(n => s.renderers[n].contribute === RIGHT_GI[n][0] && (!RIGHT_GI[n][0] || s.renderers[n].receive === RIGHT_GI[n][1])) && isBaked(s),
        solve: s => { for (const n of OBJECT_NAMES) Object.assign(s.renderers[n], { contribute: RIGHT_GI[n][0], receive: RIGHT_GI[n][1] }); s.bakedKey = bakeKey(s); },
      },
      {
        id: 'm3', title: 'Which Lighting Mode?',
        text: 'Mixed lights behave according to the Lighting Mode of the scene. Each mode moves the line between what is baked and what is real time. Choose the mode for each project.',
        how: ['Read the case.', 'Choose <b>Baked Indirect</b>, <b>Shadowmask</b>, <b>Distance Shadowmask</b> or <b>Subtractive</b>.', 'Read why.'],
        why: 'In URP the Lighting Mode is set in the Lighting window; the URP Asset must allow Mixed Lighting, and Shadowmask needs the Shadow Distance of the URP Asset.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 8, bounces: 2, indirect: 32, filter: 'denoiser' }, sun: 'mixed' },
        check: s => (s.quiz | 0) >= MODE_QUIZ.length,
        solve: s => { s.quiz = MODE_QUIZ.length; },
      },
    ],
  },
  {
    id: 'probes', name: 'Probes', sub: 'Light Probes · APV · Reflection Probe',
    steps: [
      {
        id: 'p1', title: 'Light Probes for the character',
        text: 'Moving objects cannot use lightmaps. Without probes, the character gets the same ambient light from the sky everywhere: it glows in the dark corner. Light Probes store the light at points in space; a moving object blends the nearest ones. Place probes where the light changes: in the sun patch, in the shadows, near the bright walls and in the dark corner.',
        how: ['Select <b>Light Probe Group</b> in the <b>Probes</b> panel and click on the floor of the view to add a probe (at 0.9 m, the height of the character). <kbd>Ctrl</kbd>-click removes one.', 'The <b>error</b> readout compares the probe light with the real light along the character\'s walk. Aim for an average under 15 %.', 'Use few probes where the light is even, more where it changes. Keep under 30.'],
        why: 'Unity blends the four probes of the tetrahedron around the object. Probes are cheap, but their placement is manual work: more where light changes, fewer in flat light.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 8, bounces: 2, indirect: 32, filter: 'denoiser' }, sun: 'mixed', probeSystem: 'groups', probes: [] },
        setup: s => { s.bakedKey = bakeKey(s); },
        check: s => s.probeSystem === 'groups' && s.probes.length >= 4 && s.probes.length <= 30 && probeReport(s).mean <= 0.15,
        solve: s => { s.probes = PROBE_SOLUTION.map(p => [...p]); },
      },
      {
        id: 'p2', title: 'Adaptive Probe Volumes',
        text: 'In Unity 6 with URP, Adaptive Probe Volumes place the probes for you: they fill the volume with bricks of 4 × 4 × 4 probes, smaller where there is more geometry, and every pixel blends the 8 probes around it. Turn them on and choose the minimum spacing so the average error along the walk drops under 15 %.',
        how: ['URP Asset › Lighting › <b>Light Probe System</b>: <b>Adaptive Probe Volumes</b>.', 'Add a <b>Probe Volume</b> (Global) and set <b>Min Probe Spacing</b>.', 'Press <b>Generate Lighting</b> and read the error.'],
        why: 'APV costs more memory than a hand-made group but needs no manual work and lights per pixel, so big objects get smooth light without seams between probes.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 8, bounces: 2, indirect: 32, filter: 'denoiser' }, sun: 'mixed', probeSystem: 'none', apvSpacing: 3 },
        setup: s => { s.bakedKey = bakeKey(s); },
        check: s => s.probeSystem === 'apv' && s.apvSpacing <= 1 && isBaked(s) && probeReport(s).mean <= 0.15,
        solve: s => { s.probeSystem = 'apv'; s.apvSpacing = 1; s.bakedKey = bakeKey(s); },
      },
      {
        id: 'p3', title: 'A Reflection Probe',
        text: 'The metal ball reflects the blue sky, as if it were outside: without a Reflection Probe, shiny materials use the skybox. Add a Reflection Probe in the room so it captures the walls, the window and the floor. Turn on Box Projection and fit the box to the room, so the reflections sit in the right place instead of looking infinitely far away.',
        how: ['In the <b>Probes</b> panel, add a <b>Reflection Probe</b> (Type: Baked) and press <b>Bake</b>.', 'Turn on <b>Box Projection</b> and set the <b>Box Size</b> to the room: 8 × 3 × 6 m, centred in the room.', 'Compare the ball with and without the probe.'],
        why: 'Reflection Probes are cube maps baked at a point. Box Projection corrects them for a box-shaped room; several probes blend in bigger spaces.',
        start: { scene: 'room', bake: { ...DEFAULT_BAKE, resolution: 8, bounces: 2, indirect: 32, filter: 'denoiser' }, sun: 'mixed', refl: null, ball: true },
        setup: s => { s.bakedKey = bakeKey(s); },
        check: s => !!s.refl && s.refl.baked && s.refl.box && s.refl.size.every((v, i) => Math.abs(v - [8, 3, 6][i]) <= [8, 3, 6][i] * 0.1) && Math.abs(s.refl.pos[0]) < 3.5 && s.refl.pos[1] > 0 && s.refl.pos[1] < 3 && Math.abs(s.refl.pos[2]) < 2.5,
        solve: s => { s.refl = { baked: true, box: true, size: [8, 3, 6], pos: [0, 1.5, 0], center: [0, 1.5, 0] }; },
      },
    ],
  },
];
export const PROBE_SOLUTION = PATH.filter((_, k) => k % 2 === 0).map(p => [+p[0].toFixed(2), 0.9, +p[2].toFixed(2)]).concat([[0, 0.9, 0], [-1.2, 0.9, -1.6], [0.6, 0.9, -1.6]]);
export { FBX_RIGHT, fbxReport, marginTexels, propLightmapSize, noiseLevel, PATH, AMBIENT_PROBE };
