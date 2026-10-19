// Outliner Lab: stages, steps and checks. Pure JS (tested with node).
import { ROOT, makeScene, OPS, collectionsOf, descendants, objectVisible, objectSelectable, users, unusedData, DEFAULT_FILTER } from './outliner.js?v=1';

const clone = o => JSON.parse(JSON.stringify(o));
// ─── The level: a small dungeon room ─────────────────────────────────────────
// Blender coordinates, Z up. Parts: { box: [centre, size] } or { cyl: [base centre, radius, height] }.
const B = (c, s) => ({ box: [c, s] }), C = (c, r, h) => ({ cyl: [c, r, h] });
const MATERIALS = {
  M_Stone: { color: '#8b8a86', images: ['T_Stone'] }, M_Wood: { color: '#9b6a3c', images: ['T_Wood'] }, M_Metal: { color: '#9aa3ad', images: [] },
  M_Torch: { color: '#ffa04a', images: [] }, M_Gold: { color: '#e0b43c', images: [] }, M_Collision: { color: '#6fd46f', images: [] }, M_Reference: { color: '#e8e4da', images: ['T_Reference'] },
};
const IMAGES = { T_Stone: {}, T_Wood: {}, T_Reference: {} };
function objects() {
  return [
    { name: 'Floor', parts: [B([0, 0, -0.05], [10, 8, 0.1])], mats: ['M_Stone'], mesh: 'Floor' },
    { name: 'Wall_N', parts: [B([0, 4, 1.5], [10, 0.3, 3])], mats: ['M_Stone'], mesh: 'Wall_N' },
    { name: 'Wall_S', parts: [B([-3, -4, 1.5], [4, 0.3, 3]), B([3, -4, 1.5], [4, 0.3, 3]), B([0, -4, 2.6], [2, 0.3, 0.8])], mats: ['M_Stone'], mesh: 'Wall_S' },
    { name: 'Wall_E', parts: [B([5, 0, 1.5], [0.3, 8, 3])], mats: ['M_Stone'], mesh: 'Wall_E' },
    { name: 'Wall_W', parts: [B([-5, 0, 1.5], [0.3, 8, 3])], mats: ['M_Stone'], mesh: 'Wall_W' },
    { name: 'Door', parts: [B([0, -4, 1.1], [1.9, 0.12, 2.2])], mats: ['M_Wood'], mesh: 'Door' },
    { name: 'Crate', parts: [B([-3, 2, 0.4], [0.8, 0.8, 0.8])], mats: ['M_Wood'], mesh: 'Crate' },
    { name: 'Crate.001', parts: [B([-2, 2.6, 0.4], [0.8, 0.8, 0.8])], mats: ['M_Wood'], mesh: 'Crate' },
    { name: 'Crate.002', parts: [B([-3.4, 1, 0.35], [0.7, 0.7, 0.7])], mats: ['M_Wood'], mesh: 'Crate' },
    { name: 'Barrel', parts: [C([3, 2.6, 0], 0.35, 0.9)], mats: ['M_Wood'], mesh: 'Barrel' },
    { name: 'Barrel.001', parts: [C([3.7, 1.9, 0], 0.35, 0.9)], mats: ['M_Wood'], mesh: 'Barrel' },
    { name: 'Chest', parts: [B([0, 3, 0.3], [1.1, 0.6, 0.6])], mats: ['M_Wood', 'M_Metal'], mesh: 'Chest' },
    { name: 'Torch_L', parts: [C([-4.75, 0, 1.3], 0.07, 0.6)], mats: ['M_Torch'], mesh: 'Torch' },
    { name: 'Torch_R', parts: [C([4.75, 0, 1.3], 0.07, 0.6)], mats: ['M_Torch'], mesh: 'Torch' },
    { name: 'Torch_Light_L', type: 'LIGHT', light: 'POINT', loc: [-4.55, 0, 2.0], parent: 'Torch_L' },
    { name: 'Torch_Light_R', type: 'LIGHT', light: 'POINT', loc: [4.55, 0, 2.0], parent: 'Torch_R' },
    { name: 'Sun', type: 'LIGHT', light: 'SUN', loc: [2, -2, 7] },
    { name: 'Camera', type: 'CAMERA', loc: [0, -7.5, 7.5] },
    { name: 'Player_Start', type: 'EMPTY', loc: [0, -2.5, 0] },
    { name: 'Floor_COL', parts: [B([0, 0, -0.05], [10, 8, 0.1])], mats: ['M_Collision'], mesh: 'Floor_COL', collision: true },
    { name: 'Walls_COL', parts: [B([0, 4, 1.5], [10, 0.3, 3]), B([0, -4, 1.5], [10, 0.3, 3]), B([5, 0, 1.5], [0.3, 8, 3]), B([-5, 0, 1.5], [0.3, 8, 3])], mats: ['M_Collision'], mesh: 'Walls_COL', collision: true },
    { name: 'Reference', parts: [B([-2.2, 3.82, 1.7], [3, 0.02, 1.7])], mats: ['M_Reference'], mesh: 'Reference', reference: true },
    { name: 'Crate_High', parts: [B([-3, 2, 0.4], [0.82, 0.82, 0.82])], mats: ['M_Wood'], mesh: 'Crate_High', high: true },
    { name: 'Chest_High', parts: [B([0, 3, 0.3], [1.12, 0.62, 0.62])], mats: ['M_Wood'], mesh: 'Chest_High', high: true },
  ].map(o => ({ loc: o.parts ? centreOf(o.parts) : o.loc, ...o }));
}
function centreOf(parts) { const p = parts[0]; return p.box ? [p.box[0][0], p.box[0][1], p.box[0][2] - p.box[1][2] / 2] : [...p.cyl[0]]; }
const meshesOf = objs => Object.fromEntries([...new Set(objs.filter(o => o.mesh).map(o => o.mesh))].map(m => [m, {}]));
function level(assign = {}, collections = [], extra = {}) {
  const objs = objects().map(o => ({ ...o, in: assign[o.name] || undefined }));
  // a working file: collision and bake meshes already kept out of the render, one by one (v1 does it with collections)
  if (extra.fixed !== false) for (const o of objs) { if (o.collision || o.high) o.disableRender = true; if (o.collision) o.selectable = false; }
  for (const [k, v] of Object.entries(extra.patch || {})) Object.assign(objs.find(o => o.name === k), v);
  if (extra.add) objs.push(...extra.add);
  const s = makeScene({ collections, objects: objs, materials: { ...MATERIALS, ...(extra.materials || {}) }, images: { ...IMAGES, ...(extra.images || {}) }, meshes: { ...meshesOf(objs), ...(extra.meshes || {}) } });
  return s;
}
// A full state: the scene plus the Outliner's own settings.
function state(scene, o = {}) { return { scene, mode: 'View Layer', filter: clone(DEFAULT_FILTER), collapsed: {}, tab: 'object', flags: {}, ...o }; }

// Where each object goes in a tidy level
export const ARCH = ['Floor', 'Wall_N', 'Wall_S', 'Wall_E', 'Wall_W', 'Door'], CRATES = ['Crate', 'Crate.001', 'Crate.002'], BARRELS = ['Barrel', 'Barrel.001'];
export const PROPS = [...CRATES, ...BARRELS, 'Chest', 'Torch_L', 'Torch_R'], LIGHTS = ['Sun', 'Torch_Light_L', 'Torch_Light_R'];
const tidy = () => {
  const a = {}; ARCH.forEach(n => { a[n] = 'Architecture'; }); CRATES.forEach(n => { a[n] = 'Crates'; }); BARRELS.forEach(n => { a[n] = 'Barrels'; });
  ['Chest', 'Torch_L', 'Torch_R'].forEach(n => { a[n] = 'Props'; }); LIGHTS.forEach(n => { a[n] = 'Lights'; });
  a.Floor_COL = a.Walls_COL = 'Collision'; a.Reference = 'Reference'; a.Crate_High = a.Chest_High = 'HighPoly'; a.Camera = a.Player_Start = 'Gameplay';
  return a;
};
const TIDY_COLLS = [{ name: 'Architecture', color: 'yellow' }, { name: 'Props', color: 'orange', children: ['Crates', 'Barrels'] }, { name: 'Lights', color: 'yellow' }, { name: 'Collision', color: 'green' }, { name: 'Reference', color: 'violet' }, { name: 'HighPoly', color: 'pink' }, { name: 'Gameplay', color: 'blue' }];

// Blender File mode opens with the long categories folded, so Materials is in view
const FILE_COLLAPSED = { '/file:Current File/category:Collections': true, '/file:Current File/category:Objects': true, '/file:Current File/category:Meshes': true };
// helpers for checks
const find = (s, name) => Object.keys(s.collections).find(n => n.toLowerCase() === name.toLowerCase());
const inTree = (s, obj, coll) => { const c = find(s, coll); if (!c) return false; const set = [c, ...descendants(s, c)]; return collectionsOf(s, obj).some(x => set.includes(x)); };
const onlyIn = (s, obj, coll) => { const c = find(s, coll); return !!c && collectionsOf(s, obj).every(x => x === c) && collectionsOf(s, obj).length === 1; };
const notInRoot = (s, obj) => !s.collections[ROOT].objects.includes(obj);

export const STAGES = [
  {
    id: 'collections', name: 'Collections', sub: 'New · Move · Nest · Link · Instance',
    steps: [
      {
        id: 'k1', title: 'Sort the level',
        text: 'A game level made in a hurry: every object is loose in the Scene Collection, and the Outliner is a long list. Collections are folders for objects, but also much more: they can be hidden, excluded from the render, instanced and exported together. Make three collections, Architecture, Props and Lights, and put each object in its place.',
        how: ['Right-click on <b>Scene Collection</b> › <b>New Collection</b>, and double-click it (or <kbd>F2</kbd>) to rename it. Make <b>Architecture</b>, <b>Props</b> and <b>Lights</b>.', 'Select objects in the Outliner (<kbd>Ctrl</kbd> click adds, <kbd>Shift</kbd> click selects a range) and press <kbd>M</kbd> (Move to Collection), or drag them onto a collection.', 'Architecture: the floor, the four walls and the door. Props: crates, barrels, the chest and the two torches. Lights: the Sun and the two torch lights.'],
        why: 'A tidy Outliner is the first thing a team looks at in someone else\'s file. With collections you can hide, lock or export a whole family of objects in one click.',
        start: () => state(level({}, [{ name: 'Collection' }])),
        check: s => { const sc = s.scene; return ARCH.every(n => inTree(sc, n, 'Architecture') && notInRoot(sc, n)) && PROPS.every(n => inTree(sc, n, 'Props') && notInRoot(sc, n)) && LIGHTS.every(n => inTree(sc, n, 'Lights') && notInRoot(sc, n)); },
        solve: s => { const sc = s.scene; for (const [c, list] of [['Architecture', ARCH], ['Props', PROPS], ['Lights', LIGHTS]]) { const n = find(sc, c) || OPS.newCollection(sc, ROOT, c); OPS.moveTo(sc, list, n); } },
      },
      {
        id: 'k2', title: 'Collections inside collections',
        text: 'Collections can hold other collections, like folders in folders. The props will grow (more crates, more barrels, more furniture), so give each family its own collection inside Props.',
        how: ['Click <b>Props</b> to make it the active collection, then right-click it › <b>New Collection</b>: the new one appears inside.', 'Rename them <b>Crates</b> and <b>Barrels</b>, and move the three crates and the two barrels into them.', 'You can also drag a collection onto another to nest it, or out onto Scene Collection to take it out.'],
        why: 'Nested collections keep the Outliner short: collapse Props and the whole family disappears from view; hide Props and all its sub-collections hide with it.',
        start: () => { const a = {}; ARCH.forEach(n => { a[n] = 'Architecture'; }); PROPS.forEach(n => { a[n] = 'Props'; }); LIGHTS.forEach(n => { a[n] = 'Lights'; }); return state(level(a, [{ name: 'Architecture' }, { name: 'Props' }, { name: 'Lights' }])); },
        check: s => { const sc = s.scene, p = find(sc, 'Props'), c = find(sc, 'Crates'), b = find(sc, 'Barrels'); return !!p && !!c && !!b && descendants(sc, p).includes(c) && descendants(sc, p).includes(b) && CRATES.every(n => onlyIn(sc, n, 'Crates')) && BARRELS.every(n => onlyIn(sc, n, 'Barrels')); },
        solve: s => { const sc = s.scene, p = find(sc, 'Props'); const c = OPS.newCollection(sc, p, 'Crates'), b = OPS.newCollection(sc, p, 'Barrels'); OPS.moveTo(sc, CRATES, c); OPS.moveTo(sc, BARRELS, b); },
      },
      {
        id: 'k3', title: 'One object, two collections',
        text: 'The Export_Props collection has an FBX exporter (Collection Properties › Exporters): everything in it is exported to Unity in one click. The chest must be exported too, but it must stay in Props. Do not duplicate it: link it. The same object can live in several collections at once.',
        how: ['Select <b>Chest</b> and press <kbd>Shift</kbd> <kbd>M</kbd> (Link to Collection) › <b>Export_Props</b>, or <kbd>Ctrl</kbd>-drag it onto Export_Props.', 'Now it appears under both collections. Rename it in one and it changes in the other: it is one object.', 'Moving (<kbd>M</kbd>) instead of linking would take it out of Props.'],
        why: 'Linking lets one object belong to a family (Props) and to a task (export, a render layer, a light-linking group) at the same time, without copies that go out of sync.',
        start: () => state(level(tidy(), [...TIDY_COLLS, { name: 'Export_Props', color: 'red', exporters: ['FBX'] }])),
        check: s => { const sc = s.scene; return inTree(sc, 'Chest', 'Props') && inTree(sc, 'Chest', 'Export_Props') && !Object.keys(sc.objects).some(n => /^Chest\.\d{3}$/.test(n)); },
        solve: s => { OPS.linkTo(s.scene, ['Chest'], find(s.scene, 'Export_Props')); },
      },
      {
        id: 'k4', title: 'A collection instance',
        text: 'The torch is made of two objects (the torch and its light) in the collection Torch_Kit, at the world origin. Instead of copying both objects to every wall, instance the collection: Add › Collection Instance puts an Empty at the 3D cursor that draws the whole collection. Edit Torch_Kit once and every torch changes. Put one torch on each marker, and exclude Torch_Kit itself so the original does not show in the middle of the room.',
        how: ['Click the marker <b>Mark_L</b>, then <b>Object › Snap › Cursor to Selected</b>.', '<b>Add › Collection Instance › Torch_Kit</b>. Do the same with <b>Mark_R</b>.', 'Untick the checkbox of <b>Torch_Kit</b> (Exclude from View Layer): the original disappears, the instances stay.'],
        why: 'Collection instances are how levels are dressed with repeated assets: lamps, trees, windows, whole rooms. They are light (one object each) and always up to date.',
        start: () => {
          const s = level(tidy(), [...TIDY_COLLS, { name: 'Torch_Kit', color: 'orange' }, { name: 'Markers', color: 'blue' }], { add: [
            { name: 'Torch', parts: [C([0, 0, 0], 0.07, 0.6)], mats: ['M_Torch'], mesh: 'Torch', loc: [0, 0, 0], in: 'Torch_Kit' },
            { name: 'Torch_Light', type: 'LIGHT', light: 'POINT', loc: [0.2, 0, 0.7], parent: 'Torch', in: 'Torch_Kit' },
            { name: 'Mark_L', type: 'EMPTY', loc: [-4.75, 0, 1.3], in: 'Markers' }, { name: 'Mark_R', type: 'EMPTY', loc: [4.75, 0, 1.3], in: 'Markers' }] });
          OPS.deleteObjects(s, ['Torch_L', 'Torch_R', 'Torch_Light_L', 'Torch_Light_R']);
          return state(s);
        },
        check: s => { const sc = s.scene, inst = Object.values(sc.objects).filter(o => o.instanceOf === 'Torch_Kit' && objectVisible(sc, o.name)); const at = p => inst.some(o => o.loc.every((v, k) => Math.abs(v - p[k]) <= 0.05)); return at([-4.75, 0, 1.3]) && at([4.75, 0, 1.3]) && sc.collections.Torch_Kit?.exclude; },
        solve: s => { const sc = s.scene; for (const m of ['Mark_L', 'Mark_R']) { sc.active = m; OPS.cursorToSelected(sc); OPS.addInstance(sc, 'Torch_Kit'); } sc.collections.Torch_Kit.exclude = true; },
      },
    ],
  },
  {
    id: 'visibility', name: 'Visibility and restrictions', sub: 'Exclude · Eye · Camera · Selectable',
    steps: [
      {
        id: 'v1', title: 'Hide, disable or exclude',
        text: 'Not everything in the file belongs in the render. The collision meshes must stay visible while you work, but never render. The reference image must not get in the way, in the viewport or in the render. The high-poly models are only for baking: take them out of the view layer altogether. The render preview shows what the camera sees.',
        how: ['The camera column is hidden by default: open the <b>Filter</b> popover (the funnel) and, in <b>Restriction Toggles</b>, turn on the camera (<b>Disable in Renders</b>).', '<b>Collision</b>: click its camera icon. It stays in the viewport, but leaves the render preview.', '<b>Reference</b>: close its eye (<b>Hide in Viewport</b>) and disable it in renders too.', '<b>HighPoly</b>: untick its checkbox (<b>Exclude from View Layer</b>). Excluded collections are not even evaluated: the fastest way to park heavy data.'],
        why: 'Eye = hidden now, in this view layer (and saved as a temporary state). Camera = never in renders. Checkbox = the collection is out of the view layer (not drawn, not rendered, not computed). Knowing which one to use saves hours of "why does this render?".',
        start: () => state(level(tidy(), TIDY_COLLS, { fixed: false })),
        check: s => { const sc = s.scene; return ['Floor_COL', 'Walls_COL'].every(n => objectVisible(sc, n) && !objectVisible(sc, n, 'render')) && !objectVisible(sc, 'Reference') && !objectVisible(sc, 'Reference', 'render') && sc.collections.HighPoly?.exclude && ['Floor', 'Crate', 'Sun'].every(n => objectVisible(sc, n, 'render')); },
        solve: s => { const c = s.scene.collections; c.Collision.disableRender = true; c.Reference.hide = true; c.Reference.disableRender = true; c.HighPoly.exclude = true; },
      },
      {
        id: 'v2', title: 'Hands off the walls',
        text: 'While you place props, a click often grabs the floor or a wall instead. Make the whole Architecture collection unselectable: it stays visible, but clicks go through it. The Selectable toggle is hidden by default: show it first.',
        how: ['Open the <b>Filter</b> popover (the funnel in the Outliner header) and, in <b>Restriction Toggles</b>, turn on the arrow (<b>Selectable</b>).', 'Click the arrow of <b>Architecture</b> to turn it off. Try to click the floor in the viewport.', 'The props must stay selectable.'],
        why: 'Locking the architecture, the collision or the reference while you work is one of the most useful habits in a busy scene. Collection Properties › Restrictions has the same Selectable option.',
        start: () => state(level(tidy(), TIDY_COLLS)),
        check: s => { const sc = s.scene; return ARCH.every(n => objectVisible(sc, n) && !objectSelectable(sc, n)) && PROPS.every(n => objectSelectable(sc, n)); },
        solve: s => { s.filter.columns.selectable = true; s.scene.collections.Architecture.selectable = false; },
      },
      {
        id: 'v3', title: 'Isolate the lights',
        text: 'To check the lights of the level, it helps to see nothing else for a moment. Ctrl-click an eye isolates that collection: everything else hides. Show only the Lights collection, then think how you would bring everything back.',
        how: ['<kbd>Ctrl</kbd>-click the eye of <b>Lights</b>: the other collections hide.', '<kbd>Shift</kbd>-click an eye affects a collection and everything inside it.', 'To show everything again: <kbd>Ctrl</kbd>-click the eye again, or <kbd>Alt</kbd> <kbd>H</kbd> in the viewport (Unhide All).'],
        why: 'Isolating collections is the quickest way to work on one layer of a scene (lights, collision, one room) without the rest in the way.',
        start: () => state(level(tidy(), TIDY_COLLS)),
        check: s => { const sc = s.scene; return LIGHTS.every(n => objectVisible(sc, n)) && [...ARCH, ...PROPS, 'Floor_COL', 'Player_Start'].every(n => !objectVisible(sc, n)); },
        solve: s => { OPS.isolate(s.scene, 'Lights'); },
      },
    ],
  },
  {
    id: 'filters', name: 'Filters and search', sub: 'Search · Object types · Contents',
    steps: [
      {
        id: 's1', title: 'Find them by name',
        text: 'The high-poly versions of five props (everything ending in _High) ended up scattered across several collections. Find them with the search field and move them all to HighPoly.',
        how: ['Type <b>_High</b> in the Outliner search field (<kbd>Ctrl</kbd> <kbd>F</kbd>): only the matches and their collections remain.', 'Select the results (click the first, <kbd>Shift</kbd> click the last, or <kbd>A</kbd> with the mouse over the Outliner) and press <kbd>M</kbd> › <b>HighPoly</b>.', 'Clear the search (<kbd>Alt</kbd> <kbd>F</kbd> or the ✕) to see the whole tree again.'],
        why: 'Naming conventions (_High, _Low, _COL, SM_, M_) only pay off with search: a good name makes any object one keystroke away.',
        start: () => state(level({ ...tidy(), Crate_High: 'Crates', Chest_High: 'Props' }, TIDY_COLLS, { add: [
          { name: 'Barrel_High', disableRender: true, parts: [C([3, 2.6, 0], 0.36, 0.92)], mats: ['M_Wood'], mesh: 'Barrel_High', high: true, in: 'Barrels' },
          { name: 'Door_High', disableRender: true, parts: [B([0, -4, 1.1], [1.92, 0.14, 2.22])], mats: ['M_Wood'], mesh: 'Door_High', high: true, in: 'Architecture' },
          { name: 'Torch_High', disableRender: true, parts: [C([-4.75, 0, 1.3], 0.075, 0.62)], mats: ['M_Torch'], mesh: 'Torch_High', high: true, in: 'Lights' }] })),
        check: s => { const sc = s.scene, hi = Object.keys(sc.objects).filter(n => n.endsWith('_High')); return hi.length === 5 && hi.every(n => onlyIn(sc, n, 'HighPoly')); },
        solve: s => { OPS.moveTo(s.scene, Object.keys(s.scene.objects).filter(n => n.endsWith('_High')), 'HighPoly'); },
      },
      {
        id: 's2', title: 'Only the lights',
        text: 'Lights were added by different people and are now in four different collections. Filter the Outliner so it shows only lights, select them all and move them into Lights.',
        how: ['Open the <b>Filter</b> popover and, in <b>Filter › Object Type</b>, leave only <b>Lights</b> on.', 'Select every light shown (<kbd>A</kbd> with the mouse over the Outliner) and press <kbd>M</kbd> › <b>Lights</b>.', 'Turn the other object types back on.'],
        why: 'Filters answer questions like "which lights are there?", "what is selected?", "what can be clicked?" (Object State) without scrolling through hundreds of rows.',
        start: () => state(level({ ...tidy(), Torch_Light_L: 'Props', Torch_Light_R: 'Props', Sun: 'Gameplay' }, TIDY_COLLS, { add: [
          { name: 'Fill_Light', type: 'LIGHT', light: 'AREA', loc: [0, -3, 2.6], in: 'Architecture' }, { name: 'Debug_Light', type: 'LIGHT', light: 'POINT', loc: [0, 0, 2.5] }] })),
        check: s => { const sc = s.scene, lights = Object.values(sc.objects).filter(o => o.type === 'LIGHT').map(o => o.name); return lights.length === 5 && lights.every(n => onlyIn(sc, n, 'Lights')); },
        solve: s => { const sc = s.scene; OPS.moveTo(sc, Object.values(sc.objects).filter(o => o.type === 'LIGHT').map(o => o.name), 'Lights'); },
      },
      {
        id: 's3', title: 'What is inside an object',
        text: 'Somewhere in the level an object still has the pink M_Placeholder material, and the render shows it. With Object Contents on, the Outliner lists each object\'s mesh and materials under it, so the search also finds materials. Find the object and give it M_Wood.',
        how: ['In the <b>Filter</b> popover turn on <b>Object Contents</b>, then search for <b>Placeholder</b>.', 'The match appears under its object: click the object, go to the <b>Material</b> tab of the Properties and set the slot to <b>M_Wood</b>.', 'Clear the search and check the render preview.'],
        why: 'Materials, meshes and modifiers are data inside objects. Seeing them in the Outliner answers "which objects use this material?" in seconds.',
        start: () => state(level(tidy(), TIDY_COLLS, { materials: { M_Placeholder: { color: '#ff38c8', images: [] } }, patch: { 'Barrel.001': { mats: ['M_Placeholder'] } } })),
        check: s => { const sc = s.scene; return users(sc, 'material', 'M_Placeholder') === 0 && sc.objects['Barrel.001']?.mats[0] === 'M_Wood'; },
        solve: s => { s.filter.contents = true; OPS.setMaterial(s.scene, 'Barrel.001', 0, 'M_Wood'); },
      },
    ],
  },
  {
    id: 'data', name: 'Display modes', sub: 'Blender File · Unused Data',
    steps: [
      {
        id: 'd1', title: 'Blender File: one wood, not three',
        text: 'Duplicating crates with their materials made copies: the crates use M_Wood, M_Wood.001 and M_Wood.002, three identical materials. Changing the wood would mean changing it three times. Switch the Outliner to Blender File, which lists every data-block in the file by type, and remap the copies to the original.',
        how: ['In the Outliner header, change the <b>Display Mode</b> from View Layer to <b>Blender File</b>, and open <b>Materials</b>.', 'Right-click <b>M_Wood.001</b> › <b>Remap Users</b> › <b>M_Wood</b>. Do the same with <b>M_Wood.002</b>.', 'The copies now have 0 users (the number next to them).'],
        why: 'Blender File is the Outliner\'s view of everything in the .blend: materials, images, meshes, actions… It is where you rename, remap and clean data that has no object of its own.',
        start: () => state(level(tidy(), TIDY_COLLS, { materials: { 'M_Wood.001': { color: '#9b6a3c', images: ['T_Wood'] }, 'M_Wood.002': { color: '#9b6a3c', images: ['T_Wood'] } }, patch: { 'Crate.001': { mats: ['M_Wood.001'] }, 'Crate.002': { mats: ['M_Wood.002'] } } }), { collapsed: FILE_COLLAPSED }),
        check: s => { const sc = s.scene; return CRATES.every(n => sc.objects[n].mats[0] === 'M_Wood') && users(sc, 'material', 'M_Wood.001') === 0 && users(sc, 'material', 'M_Wood.002') === 0; },
        solve: s => { s.mode = 'Blender File'; OPS.remapUsers(s.scene, 'material', 'M_Wood.001', 'M_Wood'); OPS.remapUsers(s.scene, 'material', 'M_Wood.002', 'M_Wood'); },
      },
      {
        id: 'd2', title: 'Unused Data: purge',
        text: 'Data-blocks with 0 users are Unused Data: they stay in the file until it is saved and reopened, and meanwhile they weigh and confuse. The Unused Data mode lists them and Purge deletes them. Clean the file, but keep M_Library: it is a material of the studio library, kept on purpose with a Fake User (the shield).',
        how: ['Switch the Display Mode to <b>Unused Data</b>. Note the shield on <b>M_Library</b>.', 'Press <b>Purge</b> with <b>Recursive</b> on: T_Old is only used by M_Old, so it becomes unused as soon as M_Old goes.', 'Only M_Library must remain in the list.'],
        why: 'A Fake User is a user that exists only to keep a data-block alive (materials of a library, actions of a character). Everything else unused is safe to purge, and Recursive saves you from purging several times.',
        start: () => { const s = level(tidy(), TIDY_COLLS, { materials: { 'M_Wood.001': { color: '#9b6a3c', images: ['T_Wood'] }, 'M_Wood.002': { color: '#9b6a3c', images: ['T_Wood'] }, M_Old: { color: '#7a7a7a', images: ['T_Old'] }, M_Library: { color: '#c0392b', images: [], fake: true } }, images: { T_Old: {} }, meshes: { 'Cube.004': {} } }); return state(s, { mode: 'Unused Data' }); },
        check: s => { const sc = s.scene, u = unusedData(sc); return !!sc.materials.M_Library && u.every(x => x.fake) && !sc.images.T_Old && !sc.materials['M_Wood.001']; },
        solve: s => { OPS.purge(s.scene, true); },
      },
    ],
  },
];

export function startState(step) { const s = step.start(); s.flags = {}; return s; }
