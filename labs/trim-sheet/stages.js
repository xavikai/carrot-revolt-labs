// Trim Sheet Lab: stages, steps and checks. Pure JS (tested with node).
import { TYPES, TYPE_IDS, DEFAULT_LAYOUT, DEFAULT_PAD, DEFAULT_STRIPS, stripsOf, stripOf, SIZE } from './sheet.js?v=1';
import { scene, solvedUV, scatter, arc } from './props.js?v=2';
import { report, islandFaces, bbox, place } from './uv.js?v=2';

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
  };
}
const clone = o => JSON.parse(JSON.stringify(o));
export function startState(step) {
  const s = Object.assign(defaultState(), clone(step.start || {}));
  if (!s.uv && s.scene !== 'board') s.uv = solvedUV(meshOf(s));
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
        text: 'A trim sheet is one texture made of horizontal strips that repeat along U: planks, stone courses, beams, iron straps, bevels… Every prop takes the strips it needs, so one material textures a whole set. Each strip is planned for a kind of part and a real size. Hover the strips in the UV Editor: the 3D view shows every part that uses it. Then answer the three questions by clicking a strip.',
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
    id: 'design', name: 'Design the sheet', sub: 'Sizes · no waste · padding',
    steps: [
      {
        id: 'd1', title: 'Sizes from texel density',
        text: 'Plan a sheet from the props, not from the image. The plan is the texel density: how many pixels of the sheet cover one metre of a prop. This sheet uses 512 px/m, so a strip is as many pixels tall as its part is metres tall × 512: a 0.5 m row of stones needs 256 px, a 0.25 m beam 128 px, a 12.5 cm iron strap 64 px and a 6 cm chamfer 32 px. With the same density on every strip, every prop is equally sharp. The heights of this sheet are wrong: give every strip the height its parts need.',
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
