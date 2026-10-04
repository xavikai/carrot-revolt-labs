// Trim Sheet Lab: stages, steps and checks. Pure JS (tested with node).
import { TYPES, TYPE_IDS, DEFAULT_LAYOUT, DEFAULT_PAD, DEFAULT_STRIPS, stripsOf, stripOf, SIZE } from './sheet.js?v=1';
import { scene, solvedUV, scatter, arc } from './props.js?v=2';
import { report, islandFaces, bbox, place } from './uv.js?v=2';
import { PLATFORMS, platformTD, rightSheet, PROJECTS } from './plan.js?v=1';
import { PLANE_M, MAX_H, defaultBake, defaultPainterBake, normalReport, idReport, painterReport, layerReport, wearReport, rightMaterials } from './bake.js?v=1';
export const MESH_SCENES = new Set(['wall', 'column', 'chest', 'beam', 'all']);

const meshCache = new Map();
export function meshOf(st) {
  const key = `${st.scene}|${st.straps ? 1 : 0}|${st.bevel}`;
  if (!meshCache.has(key)) { if (meshCache.size > 20) meshCache.clear(); meshCache.set(key, scene(st.scene, { straps: st.straps, bevel: st.bevel })); }
  return meshCache.get(key);
}
export function defaultState() {
  return {
    scene: 'wall', straps: false, bevel: 0.0625, uv: null, autoUV: false,
    layout: DEFAULT_LAYOUT.map(s => ({ ...s })), pad: DEFAULT_PAD, mip: 0,
    shading: 'angle', palette: 'oak', fit: false, flags: {},
    // Texel density, high poly, bake and Painter steps.
    platform: 'mobile', d: null, td: 128, picks: { mobile: 1024, pc3: 1024, pc1: 1024 }, planeM: 1, overhang: false,
    bake: defaultBake(), mats: rightMaterials(), engine: 'unreal', view: 'low', baked: { normal: null, id: null }, image: 'normal',
    pb: defaultPainterBake(), pbaked: null, layers: [], exportPreset: 'unity',
  };
}
const clone = o => JSON.parse(JSON.stringify(o));
export function startState(step) {
  const s = Object.assign(defaultState(), clone(step.start || {}));
  if (!s.uv && MESH_SCENES.has(s.scene)) s.uv = solvedUV(meshOf(s));
  if (step.setup) step.setup(s);
  return s;
}

// ─── Helpers for checks ──────────────────────────────────────────────────────
export const reports = (st, ids) => { const m = meshOf(st); return (ids || Object.keys(m.islands)).map(id => report(m, st.uv, id, DEFAULT_STRIPS)); };
export const allOk = (st, ids) => reports(st, ids).every(r => r.ok);
export function layoutInfo(st) {
  const { strips, used, free } = stripsOf(st.layout, st.pad);
  const types = new Set(st.layout.map(s => s.type));
  return { strips, used, free, allTypes: TYPE_IDS.every(t => types.has(t)) && st.layout.length === TYPE_IDS.length, sizesOk: st.layout.every(s => s.px === TYPES[s.type].m * 512) };
}
// U offset of an island's left edge, modulo one tile.
const uStart = (st, id) => { const b = bbox(st.uv, islandFaces(meshOf(st), id)); return b.u0 - Math.floor(b.u0); };
export function staggered(st, ids) {
  for (let i = 1; i < ids.length; i++) { const d = Math.abs(uStart(st, ids[i]) - uStart(st, ids[i - 1])); if (Math.min(d, 1 - d) < 0.06) return false; }
  return true;
}
export const QUIZ = [
  { q: 'Click the strip used by the wooden beam on top of the wall.', a: 'beam' },
  { q: 'Click the strip used by the iron straps of the chest.', a: 'iron' },
  { q: 'Click the strip used by the chamfered edges of the beam on the floor.', a: 'bevelWood' },
];
// ─── Stages ──────────────────────────────────────────────────────────────────
export const STAGES = [
  {
    id: 'read', name: 'Read a trim sheet', sub: 'Strips · U repeat · quiz',
    steps: [
      {
        id: 't2', title: 'Which strip is which?',
        text: 'A trim sheet is one texture made of horizontal strips that repeat along U: planks, stone courses, beams, iron straps, bevels… Every prop takes the strips it needs, so one material textures a whole set. Each strip is planned for a kind of part and a real size. Why bother? A unique texture paints every face of one prop once, so its pixels are spread thin and nothing is shared. A trim sheet reuses the same pixels on every prop, keeps the same texel density everywhere and needs one material (one draw call) for the whole set. The price is planning: the density, the strips, the high poly and the models are designed together, as the next stages show. Hover the strips in the UV Editor: the 3D view shows every part that uses it. Then answer the three questions by clicking a strip.',
        how: ['Hover a strip in the <b>UV Editor</b>: its parts light up in the 3D view.', 'Read the question in the side panel and click the right strip.', 'Answer the three questions.'],
        why: 'Reading a sheet is the first skill: you need to know what every strip is for before you can map anything to it.',
        start: { scene: 'all' },
        check: s => (s.flags.quiz | 0) >= QUIZ.length,
        solve: s => { s.flags.quiz = QUIZ.length; },
      },
      {
        id: 't3', title: 'Only in U',
        text: 'A strip repeats to the left and right forever: the image tiles in U. But above and below a strip there is another strip. The stone rows of this wall are 3 m long, so they run past the edge of the sheet and keep repeating. The plinth, though, has slipped up across the edge of the iron strip. Move a stone row along U to see that nothing breaks, then put the plinth back inside its strip.',
        how: ['Click a <b>Stone row</b> island and press <b>G</b> then <b>X</b>: move it along U and click. The wall keeps its stones.', 'Click the <b>Plinth</b> island, press <b>G</b> then <b>Y</b> and move it down into the <b>Stone plinth</b> strip. Hold <b>Ctrl</b> to snap to 8 px steps.', 'Watch the 3D view: the plinth shows iron while it is in the wrong place.'],
        why: 'Only U is free. In V an island must stay inside its strip, or it picks up the strip next to it.',
        start: { scene: 'wall' },
        setup: s => { const m = meshOf(s); const f = islandFaces(m, 'plinth'); place(m, s.uv, f, stripOf('iron'), 0.1); const b = bbox(s.uv, f); const target = stripOf('iron').v1 + 0.004; for (const i of f) s.uv[i] = s.uv[i].map(([u, v]) => [u, v + target - b.cv]); },
        check: s => !!s.flags.slid && allOk(s, ['plinth']),
        solve: s => { s.flags.slid = true; const m = meshOf(s); place(m, s.uv, islandFaces(m, 'plinth'), stripOf('plinth'), 0.1); },
      },
    ],
  },
  {
    id: 'td', name: 'Choose the texel density', sub: 'Platform · camera · sheet size',
    steps: [
      {
        id: 'td1', title: 'The camera decides the density',
        text: 'Texel density is how many pixels of the texture cover one metre of a surface. Before you plan a sheet you need that number, and it comes from the game, not from the texture: how big a metre of wall looks on the screen. That depends on the vertical resolution of the screen (H), the field of view (FOV) and the closest distance at which the player usually sees the walls (d): one metre covers H ÷ (2 × d × tan(FOV ÷ 2)) screen pixels. Less density than that and the wall looks blurry; much more and the extra pixels are never seen, they only cost memory. The project of this lab is a third-person castle game for PC: 1440p, FOV 60°, camera about 2.5 m from the walls. Compare at least three platforms, then pick the density for the castle.',
        how: ['In the side panel, click three or more <b>platforms</b> and read how many screen pixels one metre covers.', 'Move <b>Distance</b> and watch the loupe in the left editor: red is blurry, orange is wasted memory, green is sharp.', 'Choose <b>PC / console, third person</b> and set the <b>Target</b> to the power of two at or just above the screen pixels.'],
        why: 'The density is written in the art bible before anyone models or paints: every asset of the project uses it. Powers of two (256, 512, 1024 px/m) keep the numbers simple and the textures power-of-two sized. Budgets often lower it one step, and hero props get exceptions.',
        tool: 'plan', start: { scene: 'platform', platform: 'mobile', td: 128 },
        check: s => s.platform === 'pc3' && s.td === platformTD('pc3') && (s.flags.visited || []).length >= 3,
        solve: s => { s.platform = 'pc3'; s.d = null; s.td = platformTD('pc3'); s.flags.visited = ['mobile', 'pc1', 'pc3']; },
      },
      {
        id: 'td2', title: 'From density to sheet size',
        text: 'Now turn the density into an image size. Every strip is as many pixels tall as its part is metres tall × the density, and between strips there is padding. The castle set needs 1.875 m of strips (planks, stone course, beam, molding, iron, plinth and two bevels). At 512 px/m that is 960 px plus 8 px of padding per strip: exactly a 1024 sheet. The same set for a first-person game, or for a mobile game, needs another size. The width of the sheet is also the length before the texture repeats: size ÷ density metres. Choose the smallest sheet that holds the set for each project.',
        how: ['In the side panel, each row is one project with its density.', 'Choose a sheet size: the bar shows the rows used, red if the strips do not fit.', 'Pick the smallest size that fits: the next size up doubles the side and multiplies the memory by four.'],
        why: 'Too small and the strips do not fit; too big and you pay four times the memory for empty rows. When the set does not fit, the options are a bigger sheet, fewer strips, or a lower density for the thin ones.',
        tool: 'plan', start: { scene: 'sheetsize' },
        check: s => PROJECTS.every(p => s.picks[p.id] === rightSheet(platformTD(p.platform))),
        solve: s => { for (const p of PROJECTS) s.picks[p.id] = rightSheet(platformTD(p.platform)); },
      },
    ],
  },
  {
    id: 'design', name: 'Design the sheet', sub: 'Sizes · no waste · padding',
    steps: [
      {
        id: 'd1', title: 'Sizes from texel density',
        text: 'Plan a sheet from the props, not from the image. The plan is the texel density: how many pixels of the sheet cover one metre of a prop. This sheet uses the 512 px/m chosen in stage 2 for the PC castle, so a strip is as many pixels tall as its part is metres tall × 512: a 0.5 m row of stones needs 256 px, a 0.25 m beam 128 px, a 12.5 cm iron strap 64 px and a 6 cm chamfer 32 px. With the same density on every strip, every prop is equally sharp. The heights of this sheet are wrong: give every strip the height its parts need.',
        how: ['In the <b>Trim Sheet</b> panel, change the <b>Height</b> of each strip.', 'The table shows the real size each strip needs: height in px = size in m × 512.', 'The sample board in the 3D view shows every strip at its real size.'],
        why: 'The same texel density on every strip keeps all the props equally sharp next to each other. The Texel Density Lab shows how a project chooses its target, like the 512 px/m of this sheet.',
        start: { scene: 'board', layout: [{ type: 'plank', px: 128 }, { type: 'stone', px: 256 }, { type: 'beam', px: 256 }, { type: 'molding', px: 64 }, { type: 'iron', px: 64 }, { type: 'plinth', px: 128 }, { type: 'bevelWood', px: 16 }, { type: 'bevelStone', px: 32 }], pad: 8 },
        check: s => layoutInfo(s).sizesOk,
        solve: s => { s.layout.forEach(l => { l.px = TYPES[l.type].m * 512; }); },
      },
      {
        id: 'd2', title: 'Fill the whole sheet',
        text: 'Every pixel of a texture costs memory, used or not. This sheet leaves a band empty at the bottom, and it has no strip for the chamfered stone edges. Add the missing strip so the sheet is used from top to bottom, exactly 1024 px with the padding.',
        how: ['Press <b>Add strip</b> and choose <b>Stone bevel</b>, 32 px.', 'Watch the counter: used px must be exactly 1024.', 'Use the arrows to change the order if you want: the order does not matter, the sizes do.'],
        why: 'Planning the sheet like a puzzle is a big part of the job: power-of-two strips fit together without waste.',
        start: { scene: 'board', layout: DEFAULT_LAYOUT.filter(l => l.type !== 'bevelStone'), pad: 8 },
        check: s => { const i = layoutInfo(s); return i.used === SIZE && i.allTypes && i.sizesOk; },
        solve: s => { s.layout = DEFAULT_LAYOUT.map(l => ({ ...l })); s.pad = 8; },
      },
      {
        id: 'd3', title: 'Padding for mipmaps',
        text: 'Far from the camera the GPU uses mipmaps: smaller copies of the texture where every texel mixes 2, 4, 8… pixels. Strips that touch each other bleed into each other at those levels, and thin lines of the wrong colour appear along the edges of the props. Add padding between the strips: at least 8 px keeps them clean down to mip 3 (128 × 128), and the sheet must still fit.',
        how: ['Raise <b>Mip level</b> in the UV Editor header and look at the edges of the strips: red marks show where they bleed.', 'Set <b>Padding</b> in the Trim Sheet panel to 8 px.', 'Check that the used px are not more than 1024.'],
        why: 'Padding (also called gutter or bleed) is the same idea as the margin of a bake: extra colour around each part for the smaller mip levels.',
        start: { scene: 'board', layout: DEFAULT_LAYOUT, pad: 0, mip: 3 },
        check: s => { const i = layoutInfo(s); return s.pad >= 8 && i.used <= SIZE && i.allTypes; },
        solve: s => { s.pad = 8; },
      },
    ],
  },
  {
    id: 'high', name: 'Model the high poly', sub: 'Plane size · real scale · tiling',
    steps: [
      {
        id: 'h1', title: 'A plane the size of the sheet',
        text: 'A trim sheet is made by baking: you model every strip in detail (the high poly) and bake it onto one flat quad (the low poly) whose UVs fill the whole 0–1 square. The trick is the size of that quad: it must be the sheet in metres, size ÷ density. Then the high poly is modelled at real scale (a plank 25 cm tall is 25 cm tall) and the bake gives exactly the planned density. This quad is 1 m wide: the high poly does not fit on it and every strip would be baked twice too dense. Give the plane the right size.',
        how: ['In the side panel, set <b>Plane size</b>: 1024 px ÷ 512 px/m.', 'Look at the 3D view: the dashed bands on the plane are the strips of the sheet; the high poly must sit inside them.', 'In Blender: Add › Mesh › Plane, Size 2 m, and model the strips on top of it, from y = 0 to 2 m.'],
        why: 'If the plane is the sheet at real scale, the bands of the plan become measurements you can model to: a molding that is 25 cm tall fills its band exactly.',
        start: { scene: 'highpoly', planeM: 1, overhang: true },
        check: s => s.planeM === PLANE_M,
        solve: s => { s.planeM = PLANE_M; },
      },
      {
        id: 'h2', title: 'Past the edges, for U',
        text: 'The strips repeat along U, so the left edge of the sheet continues on its right edge. If the high poly stops at the edges of the plane, the bake sees the ends of the planks and the stones there: a rounded end on one side, nothing on the other, and a seam every 2 m on the props. Extend the high poly past both edges, so the rays at the border of the plane hit the next copy of the pieces. In Blender, an Array modifier with an offset of 2 m (or simply copies of the pieces at −2 m and +2 m) does it.',
        how: ['Turn on <b>Extend past the edges (Array)</b> in the side panel.', 'Look at the tiled preview in the left editor: the seam at the edges of the sheet disappears.', 'Turn the 3D view: the pieces continue on both sides of the plane.'],
        why: 'Anything at the left edge of the sheet must match the right edge. Joints of planks and stones should also fall inside the sheet, not exactly on its edge.',
        start: { scene: 'highpoly', planeM: 2, overhang: false },
        check: s => s.overhang === true,
        solve: s => { s.overhang = true; },
      },
    ],
  },
  {
    id: 'bake', name: 'Bake in Blender', sub: 'Normal · cage · OpenGL / DirectX · ID',
    steps: [
      {
        id: 'k1', title: 'Bake the normal map',
        text: 'Baking projects the high poly onto the low poly: for every texel of the plane, Blender casts a ray and records the direction of the high poly surface it hits. That direction is the normal map. In Cycles, Bake › Normal with Selected to Active: select the high poly, then the plane (active), and bake into a 1024 image. Rays start at the cage, the plane pushed out by Extrusion, and travel back for at most Max Ray Distance. Everything taller than the extrusion is cut flat; anything the rays cannot reach is lost. The high poly of this sheet rises at most 5 cm (the molding).',
        how: ['Set <b>Bake Type</b> to <b>Normal</b> and turn on <b>Selected to Active</b>.', 'Set <b>Extrusion</b> to at least the height of the tallest piece (5 cm). Leave <b>Max Ray Distance</b> at 0 or larger than the extrusion.', 'Check the image is <b>1024</b>, press <b>Bake</b> and compare the low plane with the high poly (View).'],
        why: 'A wrong bake looks fine from far and wrong up close: flat tops on moldings and bevels, joints that disappear. Check the bake against the high poly before texturing.',
        start: { scene: 'bake', engine: 'blender' },
        check: s => !!s.baked.normal && normalReport(s.baked.normal).ok,
        solve: s => { Object.assign(s.bake, { type: 'normal', s2a: true, extrusion: 0.06, rayDist: 0, size: 1024 }); s.baked.normal = { ...s.bake }; },
      },
      {
        id: 'k2', title: 'OpenGL or DirectX',
        text: 'A tangent-space normal map stores how much the surface leans right (red) and up (green). Programs do not agree on which way is up in the image: Blender, Unity and Godot use OpenGL (Y+), Unreal uses DirectX (Y−). The same file read with the other convention lights the bumps from below: bevels look dented and joints look raised. This castle goes to Unreal. Bake the map for it: in the bake settings, set the green channel (Swizzle G) to −Y, bake again and compare in the engine preview.',
        how: ['Look at the beam and the moldings in the 3D view (engine preview: Unreal): the light comes from the wrong side.', 'In <b>Swizzle</b>, set <b>G</b> to <b>−Y</b> and press <b>Bake</b>.', 'Compare again: the edges catch the light from above.'],
        why: 'Flipping the green channel is the most common normal-map mistake when moving between programs. Painter and most exporters can also flip it on export.',
        start: { scene: 'bake', bake: { type: 'normal', s2a: true, extrusion: 0.06, rayDist: 0, size: 1024, swizzleG: '+Y', margin: 16, direct: true, indirect: true, color: true, overhang: true }, baked: { normal: { type: 'normal', s2a: true, extrusion: 0.06, rayDist: 0, size: 1024, swizzleG: '+Y', margin: 16, overhang: true }, id: null } },
        check: s => !!s.baked.normal && normalReport(s.baked.normal).ok && s.baked.normal.swizzleG === '-Y',
        solve: s => { s.bake.swizzleG = '-Y'; s.baked.normal = { ...s.bake }; },
      },
      {
        id: 'k3', title: 'An ID map from materials',
        text: 'To texture the sheet later you need masks: which pixels are wood, which are stone, which are iron. The quickest way is an ID map: give every high-poly piece a material with a flat, saturated colour (one colour per material, not per piece) and bake its colour. In Cycles, Bake › Diffuse with only Color in Contributions: with Direct and Indirect on, the light and shadows of the scene get baked into the colours and the masks will have gradients. Some pieces of this high poly have the wrong material, and one has none.',
        how: ['In the side panel, give every piece its material: <b>Wood</b>, <b>Stone</b> or <b>Iron</b>.', 'Set <b>Bake Type</b> to <b>Diffuse</b>, turn off <b>Direct</b> and <b>Indirect</b>, keep <b>Color</b>.', 'Press <b>Bake</b>: the ID map must have three flat colours.'],
        why: 'Colour IDs are the bridge between modelling and texturing: in Painter each colour becomes a mask with one click. Pick colours far apart in hue so the selection never mixes them.',
        start: { scene: 'bake', image: 'id', view: 'high', bake: { type: 'normal', s2a: true, extrusion: 0.06, rayDist: 0, size: 1024, swizzleG: '-Y', margin: 16, direct: true, indirect: true, color: true, overhang: true }, mats: { plank: 'wood', stone: 'stone', beam: 'none', molding: 'stone', iron: 'wood', plinth: 'stone', bevelWood: 'wood', bevelStone: 'wood' } },
        check: s => !!s.baked.id && idReport(s.baked.id, s.baked.id.mats).ok,
        solve: s => { s.mats = rightMaterials(); Object.assign(s.bake, { type: 'diffuse', direct: false, indirect: false, color: true }); s.baked.id = { ...s.bake, mats: { ...s.mats } }; },
      },
    ],
  },
  {
    id: 'painter', name: 'Texture in Painter', sub: 'Mesh maps · ID masks · wear · export',
    steps: [
      {
        id: 's1', title: 'Bake the mesh maps',
        text: 'Substance Painter textures the low plane with the help of maps baked from the high poly: Normal (the detail), ID (the masks), Ambient Occlusion (where dirt gathers), Curvature (the edges that wear). In Texture Set Settings › Bake Mesh Maps, load the high poly, choose Material Color as the ID source (the colours of the Blender materials come in the FBX) and check the distance: Max Frontal Distance is a fraction of the size of the mesh, like the extrusion in Blender. Here the mesh is 2 m wide (2.83 m across), so 0.01 reaches only 2.8 cm and cuts the 5 cm molding.',
        how: ['Click <b>Load high poly</b> (the FBX exported from Blender with its materials).', 'Check <b>Normal</b>, <b>ID</b>, <b>Ambient Occlusion</b> and <b>Curvature</b>. ID › Color Source: <b>Material Color</b>.', 'Raise <b>Max Frontal Distance</b> until it reaches 5 cm, then <b>Bake selected textures</b>.'],
        why: 'Painter bakes all the maps from the same projection, so normal, ID, AO and curvature line up pixel by pixel. If you baked the normal map in Blender, you can import it instead and bake only the other maps.',
        tool: 'painter',
        start: { scene: 'painter', image: 'id' },
        check: s => !!s.pbaked && painterReport(s.pbaked).ok,
        solve: s => { s.pb = { high: true, maps: { normal: true, wsn: true, id: true, ao: true, curvature: true, position: true, thickness: true }, idSource: 'material', frontal: 0.02, size: 1024 }; s.pbaked = JSON.parse(JSON.stringify(s.pb)); },
      },
      {
        id: 's2', title: 'Masks from the ID map',
        text: 'Now the texturing. In Painter every material is a fill layer (or a smart material) and its mask decides where it shows. Instead of painting masks by hand, add a mask with Color Selection and pick a colour of the ID map: the wood layer shows only on the red pixels, the stone layer on the green ones, the iron on the blue ones. Right now there is only one wood layer, without a mask: everything is wood, even the stone and the iron.',
        how: ['On the <b>Oak Planks</b> layer, set the mask to <b>Color selection: red</b> (the red colour of the ID map).', 'Add a fill layer with <b>Sandstone Blocks</b> masked by the <b>green</b> ID, and one with <b>Wrought Iron</b> masked by the <b>blue</b> ID.', 'Look at the sheet: every strip has its material, with the details of the normal map.'],
        why: 'With ID masks you can change a material in seconds and keep the masks: that is how the same sheet gets several versions (oak, dark oak, pine).',
        tool: 'painter',
        start: { scene: 'painter', image: 'color', pbaked: { high: true, maps: { normal: true, wsn: true, id: true, ao: true, curvature: true, position: true, thickness: true }, idSource: 'material', frontal: 0.02, size: 1024 }, layers: [{ mat: 'wood', mask: null }] },
        check: s => layerReport(s.layers).ok,
        solve: s => { s.layers = [{ mat: 'wood', mask: 'wood' }, { mat: 'stone', mask: 'stone' }, { mat: 'iron', mask: 'iron' }]; },
      },
      {
        id: 's3', title: 'Wear, dirt and export',
        text: 'The baked maps also drive generators. Edge wear uses Curvature to find the convex edges (where hands and boots rub the wood and chip the stone) and lightens them. Dirt uses Ambient Occlusion to darken the joints and the corners. Then export with a preset for the engine: for Unreal, the normal map leaves Painter in DirectX and roughness, metallic and occlusion are packed in one texture.',
        how: ['On a layer, turn on <b>Edge wear</b> (Curvature) and on another, <b>Dirt</b> (Ambient Occlusion).', 'Open <b>File › Export Textures</b> and choose the preset for the engine of the project: <b>Unreal Engine (Packed)</b>.', 'Click <b>Export</b>.'],
        why: 'Wear that follows the real geometry is what makes a trim sheet read as wood and stone and not as a flat picture. Exporting with the engine preset sets the normal convention and the packing for you.',
        tool: 'painter',
        start: { scene: 'painter', image: 'color', pbaked: { high: true, maps: { normal: true, wsn: true, id: true, ao: true, curvature: true, position: true, thickness: true }, idSource: 'material', frontal: 0.02, size: 1024 }, layers: [{ mat: 'wood', mask: 'wood' }, { mat: 'stone', mask: 'stone' }, { mat: 'iron', mask: 'iron' }], exportPreset: 'unity' },
        check: s => wearReport(s.layers).ok && !!s.flags.exported && s.flags.exported === 'unreal',
        solve: s => { s.layers.forEach(l => { l.edge = l.mat !== 'iron'; l.dirt = true; }); s.exportPreset = 'unreal'; s.flags.exported = 'unreal'; },
      },
    ],
  },
  {
    id: 'uv', name: 'UVs to the strips', sub: 'G · S · R · Follow Active Quads',
    steps: [
      {
        id: 'u1', title: 'Fit the beam',
        text: 'The three faces of the wooden beam come from a plain Unwrap: small, turned on their side and far from the beam strip. Put them on the Wood beam strip: the trim must run along U, the top of the face must point up and the texel density must be 512 px/m.',
        how: ['Select the three <b>Beam</b> islands (click, <b>Shift</b> click). Set <b>Pivot</b> to <b>Individual Origins</b> and press <b>R</b>, type <b>90</b> (or <b>-90</b>) and <b>Enter</b>.', 'Press <b>S</b> and scale until the side panel shows about <b>512 px/m</b> (typing a number works too).', 'Press <b>G</b> and drop each island on the <b>Wood beam</b> strip. They can overlap: they all use the same pixels.'],
        why: 'Scale islands uniformly to the target density; stretching them to fill a strip makes the texture look squashed.',
        start: { scene: 'wall' },
        setup: s => { const m = meshOf(s); scatter(m, s.uv, 'beamFront', { cu: 0.3, cv: 0.55, rot: 90, k: 0.6 }); scatter(m, s.uv, 'beamTop', { cu: 0.45, cv: 0.5, rot: 90, k: 0.6 }); scatter(m, s.uv, 'beamBottom', { cu: 0.6, cv: 0.45, rot: 90, k: 0.6 }); },
        check: s => allOk(s, ['beamFront', 'beamTop', 'beamBottom']),
        solve: s => { const m = meshOf(s); ['beamFront', 'beamTop', 'beamBottom'].forEach((id, i) => place(m, s.uv, islandFaces(m, id), stripOf('beam'), i * 0.3)); },
      },
      {
        id: 'u2', title: 'Stack the stone rows',
        text: 'The wall is 1.5 m tall, but the stone strip is only one row of blocks (0.5 m). So each row of the wall gets its own island, and all three go on the same strip, one on top of the other. Overlapping UVs are normal with trim sheets. But if the three rows start at the same U, the joints between blocks line up from top to bottom, which no mason would do: slide them so the joints are staggered.',
        how: ['Select the three <b>Stone row</b> islands and press <b>S</b>, type <b>2</b>, <b>Enter</b>: they reach 512 px/m.', 'Move each row onto the <b>Stone course</b> strip with <b>G</b>.', 'Slide each row along U (<b>G</b> <b>X</b>) so its joints fall between the joints of the row below.'],
        why: 'Stacking islands is what makes trims so efficient; offsetting them in U hides the repetition.',
        start: { scene: 'wall' },
        setup: s => { const m = meshOf(s); scatter(m, s.uv, 'row1', { cu: 0.4, cv: 0.3, k: 0.5 }); scatter(m, s.uv, 'row2', { cu: 0.45, cv: 0.47, k: 0.5 }); scatter(m, s.uv, 'row3', { cu: 0.5, cv: 0.64, k: 0.5 }); },
        check: s => allOk(s, ['row1', 'row2', 'row3']) && staggered(s, ['row1', 'row2', 'row3']),
        solve: s => { const m = meshOf(s); [['row1', 0], ['row2', 0.37], ['row3', 0.71]].forEach(([id, u]) => place(m, s.uv, islandFaces(m, id), stripOf('stone'), u)); },
      },
      {
        id: 'u3', title: 'Straighten the column',
        text: 'Cylinders often unwrap as curved bands. A curved band cannot follow a straight strip. Follow Active Quads straightens a band of quads, keeping the shape of the active quad. Straighten the four rings of the column, align them, bring them to 512 px/m and put each one on its strip: the base on the plinth, the drums on the stone course and the capital on the molding.',
        how: ['Press <b>A</b> to select all the islands and click <b>Follow Active Quads</b>, then <b>Align Rotation</b>.', 'Press <b>S</b>, type <b>2</b>, <b>Enter</b>.', 'Move each ring onto its strip with <b>G</b>: Column base → Stone plinth, Drum 1 and 2 → Stone course, Capital → Stone molding.'],
        why: 'The column is 2 m round, so each ring covers exactly two tiles of the sheet and closes without a seam.',
        start: { scene: 'column' },
        setup: s => { const m = meshOf(s); arc(m, s.uv, 'base', { cu: 0.3, cv: 0.85, R: 0.35, a0: 22 }); arc(m, s.uv, 'drum1', { cu: 0.55, cv: 0.62, R: 0.4, a0: 15 }); arc(m, s.uv, 'drum2', { cu: 0.45, cv: 0.38, R: 0.45, a0: -12 }); arc(m, s.uv, 'capital', { cu: 0.5, cv: 0.16, R: 0.3, a0: 28 }); },
        check: s => allOk(s),
        solve: s => { const m = meshOf(s); [['base', 'plinth', 0.1], ['drum1', 'stone', 0.15], ['drum2', 'stone', 0.52], ['capital', 'molding', 0.2]].forEach(([id, st, u]) => place(m, s.uv, islandFaces(m, id), stripOf(st), u)); },
      },
      {
        id: 'u4', title: 'Same texel density',
        text: 'All the sides of this chest are on the plank strip, but two of them were scaled by eye. One side has planks twice as big as the others; on the lid they are too small and the island spills over the strip. Bring every island to 512 px/m: the planks must be the same size all around the chest.',
        how: ['Select an island and read its <b>Texel density</b> in the side panel: green means 512 px/m ± 10%.', 'Press <b>S</b> and scale it until it turns green, then move it back inside the strip with <b>G</b>.', 'Turn the 3D view around the chest to compare the planks.'],
        why: 'Different densities side by side are one of the first things players notice. In Blender, add-ons such as Texel Density Checker measure and set it.',
        start: { scene: 'chest' },
        setup: s => { const m = meshOf(s); scatter(m, s.uv, 'right', { cu: 0.45, cv: (stripOf('plank').v0 + stripOf('plank').v1) / 2, k: 0.5 }); scatter(m, s.uv, 'lid', { cu: 0.55, cv: 0.8, k: 1.6 }); },
        check: s => allOk(s),
        solve: s => { const m = meshOf(s); place(m, s.uv, islandFaces(m, 'right'), stripOf('plank'), 0.45); place(m, s.uv, islandFaces(m, 'lid'), stripOf('plank'), 0.3); },
      },
    ],
  },
  {
    id: 'bevel', name: 'Bevels with trims', sub: 'Chamfer strip · Weighted Normal',
    steps: [
      {
        id: 'b1', title: 'Round edges from a strip',
        text: 'Real edges are never perfectly sharp: they catch the light. A trim sheet has thin strips with a rounded profile painted in the normal map. This beam already has small chamfer faces on its four edges (a Bevel with one segment), but they are mapped to the planks. Move the four chamfers to the Wood bevel strip.',
        how: ['Select the four <b>Chamfer</b> islands (Shift click in the UV Editor or on the beam).', 'Press <b>G</b> and drop them on the <b>Wood bevel</b> strip (32 px). Hold <b>Ctrl</b> to snap.', 'Turn the beam: the edges now look rounded, with only one row of faces.'],
        why: 'A chamfer face plus a bevel strip gives round, bright edges for 8 extra quads, instead of a rounded bevel with many segments.',
        start: { scene: 'beam', bevel: 0.0625 },
        setup: s => { const m = meshOf(s); ['ch1', 'ch2', 'ch3', 'ch4'].forEach((id, i) => place(m, s.uv, islandFaces(m, id), stripOf('plank'), 0.1 + i * 0.2)); },
        check: s => allOk(s, ['ch1', 'ch2', 'ch3', 'ch4']),
        solve: s => { const m = meshOf(s); ['ch1', 'ch2', 'ch3', 'ch4'].forEach((id, i) => place(m, s.uv, islandFaces(m, id), stripOf('bevelWood'), i * 0.25)); },
      },
      {
        id: 'b2', title: 'Weighted normals',
        text: 'With Shade Smooth, the normals of the big faces bend towards the chamfers and the whole beam looks puffy, with dark gradients. With Shade Flat or Smooth by Angle, the chamfers become flat stripes. The Weighted Normal modifier keeps the big faces flat and lets the chamfers carry the curve: try the four options and keep the one that looks like a real beam.',
        how: ['In the side panel, switch <b>Shading</b> between <b>Flat</b>, <b>Smooth</b>, <b>Smooth by Angle</b> and <b>Weighted Normal</b>.', 'Look at the big faces near the edges, and at the highlight on the chamfers.', 'Keep <b>Weighted Normal</b>.'],
        why: 'Chamfer + Weighted Normal + bevel strip is the classic trim workflow for hard-surface props in games.',
        start: { scene: 'beam', bevel: 0.0625, shading: 'smooth' },
        check: s => s.shading === 'weighted',
        solve: s => { s.shading = 'weighted'; },
      },
      {
        id: 'b3', title: 'Chamfer width = strip height',
        text: 'The geometry must fit the sheet. The chamfers of this beam are 12 cm wide, but at 512 px/m the Wood bevel strip holds 6.25 cm: the chamfers spill into the next strip and pick up stone. Change the width of the Bevel so the chamfers fill their strip. In this step the lab keeps the islands on their strips for you.',
        how: ['In the side panel, lower <b>Bevel › Width</b>.', 'Aim for 32 px ÷ 512 px/m = 0.0625 m.', 'Watch the chamfer islands in the UV Editor: they must fit the strip.'],
        why: 'Decide the sheet first, then model to it: chamfer widths, plank heights and trims all come from the same plan.',
        start: { scene: 'beam', bevel: 0.12, shading: 'weighted', autoUV: true },
        check: s => s.bevel >= 0.056 && s.bevel <= 0.066 && allOk(s),
        solve: s => { s.bevel = 0.0625; s.uv = solvedUV(meshOf(s)); },
      },
    ],
  },
  {
    id: 'reuse', name: 'One sheet, many props', sub: 'Fit to Trim · re-skin',
    steps: [
      {
        id: 'p1', title: 'Texture a chest fast',
        text: 'After doing it by hand, use a tool. Trim-sheet add-ons have an operator that takes the selected island, straightens it and fits it to the height of a strip. This chest has just been unwrapped: map its five plank sides and its two iron straps with Fit to Trim.',
        how: ['Select an island (the Front, for example).', 'In the side panel, under <b>Fit to Trim</b>, click the strip it needs: <b>Wood planks</b> for the sides and the lid, <b>Iron strap</b> for the straps.', 'Do the same for the other islands, then slide them in U if you want variation.'],
        why: 'Once the sheet is planned well, mapping a prop takes minutes: that is what makes trims worth the planning.',
        start: { scene: 'chest', straps: true, fit: true },
        setup: s => {
          const m = meshOf(s);
          [['front', 0.3, 0.8, 0], ['back', 0.7, 0.8, 180], ['right', 0.2, 0.5, 90], ['left', 0.4, 0.5, -90], ['lid', 0.7, 0.55, 0], ['strap1', 0.45, 0.25, 90], ['strap2', 0.75, 0.25, 0]]
            .forEach(([id, cu, cv, rot]) => scatter(m, s.uv, id, { cu, cv, rot, k: 0.45 }));
        },
        check: s => allOk(s),
        solve: s => { s.uv = solvedUV(meshOf(s)); },
      },
      {
        id: 'p3', title: 'Re-skin everything',
        text: 'All four props use the same UVs on the same sheet. Change the sheet and the whole set changes with it: a darker castle, a pine and red stone village… without touching a single UV. Choose another version of the sheet.',
        how: ['In the side panel, change <b>Sheet</b> to another version.', 'Look at the four props: they all change together.', 'Compare with the UV Editor: the islands have not moved.'],
        why: 'Material variations of a trim sheet are a cheap way to build different areas of a game from the same models.',
        start: { scene: 'all', palette: 'oak' },
        check: s => s.palette !== 'oak',
        solve: s => { s.palette = 'dark'; },
      },
    ],
  },
];
