// Export Lab: stages, steps and checks. Pure JS (tested with node).
import { makeObject, OPS, EXPORT_DEFAULTS, IMPORT_DEFAULTS, exportFBX, importFBX, exportedObjects, materialReport, rigReport, clipsOf, colliderBoxes, physicsErrors, dropHeight, cleanTransform, near, nearV, worldBounds, isUniform, localBounds } from './xport.js?v=1';

const clone = o => JSON.parse(JSON.stringify(o));
const GOOD_EXPORT = { applyScalings: 'FBX Units Scale' }, GOOD_IMPORT = { bakeAxis: true };
export function baseState() {
  return {
    objects: [], cursor: [0, 0, 0], sel: null, point: null, fileName: 'Model', file: null,
    exp: clone(EXPORT_DEFAULTS), imp: clone(IMPORT_DEFAULTS), pending: null,
    unity: { sel: null, components: {}, renderers: {}, override: null, asset: false },
    actions: [], activeAction: null, overlays: { faceOrientation: false }, flags: {}, tab: 'object',
  };
}
// A step's state: its scene, then (for most steps) the model already exported once, as students would find it.
function scene(fileName, objects, o = {}) {
  const s = baseState();
  s.fileName = fileName; s.objects = objects.map(makeObject); s.sel = s.objects.find(x => x.selected)?.name || s.objects[0]?.name;
  Object.assign(s.exp, o.exp || {}); Object.assign(s.imp, o.imp || {});
  if (o.actions) { s.actions = o.actions; s.activeAction = o.activeAction; }
  if (o.unity) Object.assign(s.unity, o.unity);
  if (o.tab) s.tab = o.tab;
  if (o.exported !== false) doExport(s);
  return s;
}
export function doExport(s) { s.file = exportFBX({ objects: s.objects, actions: s.actions, activeAction: s.activeAction }, s.exp, s.fileName); s.flags.exported = (s.flags.exported || 0) + 1; }
// Everything the checks and the Unity side read.
export function report(s) { return s.file ? importFBX(s.file, s.imp) : null; }
export const node = (s, name) => report(s)?.nodes.find(n => n.name === name) || null;
// The Unity hierarchy of the imported model: one root named after the file, or the object itself if it is alone.
export function hierarchy(s) {
  const r = report(s); if (!r) return null;
  const single = r.nodes.length === 1;
  return { rootName: single ? r.nodes[0].name : s.fileName, single, children: single ? [] : r.nodes.map(n => n.name) };
}
// Is the file older than the scene? (Blender changed after the last export)
export function outdated(s) {
  if (!s.file) return true;
  const now = clone(exportedObjects(s.objects, s.exp));
  return JSON.stringify(now) !== JSON.stringify(s.file.objects) || JSON.stringify(s.exp) !== JSON.stringify(s.file.settings) || JSON.stringify(s.actions) !== JSON.stringify(s.file.actions);
}
const sizeOf = (s, name) => { const r = report(s), n = r?.nodes.find(x => x.name === name); return n ? r.world(n) : null; };

// ─── Colliders in Unity ──────────────────────────────────────────────────────
// Components added in Unity, per GameObject; Generate Colliders adds a (non-convex) Mesh Collider to every mesh.
export function componentsOf(s) {
  const r = report(s), out = {};
  if (!r) return out;
  const h = hierarchy(s);
  if (!h.single) out[h.rootName] = [...(s.unity.components[h.rootName] || [])];
  if (s.unity.rootRigidbody) (out[h.rootName] ||= []);
  for (const n of r.nodes) {
    out[n.name] = [...(s.unity.components[n.name] || [])];
    if (s.imp.generateColliders && n.type === 'MESH') out[n.name].unshift({ type: 'MeshCollider', convex: false, fromImport: true });
  }
  if (s.unity.rootRigidbody && !out[h.rootName].some(c => c.type === 'Rigidbody')) out[h.rootName].unshift({ type: 'Rigidbody', onRoot: true });
  return out;
}
// The colliders that work (boxes in Unity's world), and the errors Unity logs when Play starts.
export function physicsState(s) {
  const r = report(s); if (!r) return { boxes: [], errors: [] };
  const comps = componentsOf(s), errors = physicsErrors(comps), boxes = [];
  const h = hierarchy(s), rbRoot = (comps[h.rootName] || []).some(c => c.type === 'Rigidbody');
  for (const n of r.nodes) for (const c of comps[n.name] || []) {
    const rb = rbRoot || (comps[n.name] || []).some(x => x.type === 'Rigidbody');
    if (c.type === 'MeshCollider' && !c.convex && rb) continue;                 // ignored, with an error
    boxes.push(...colliderBoxes(r, n, c).map(b => ({ b, from: n.name })));
  }
  return { boxes, errors };
}
// Two balls: one released above the table, one released under it (between the legs, below the top).
export const TABLE_DROPS = { top: [0.35, 0.15, 2], under: [0, 0, 0.45] };

// ─── Stages ──────────────────────────────────────────────────────────────────
const crate = o => ({ name: 'Crate', shape: 'crate', selected: true, ...o });
const rigBones = () => [
  ['Hips', 1], ['Spine', 1], ['Chest', 1], ['Neck', 1], ['Head', 1, 1],
  ['Shoulder.L', 1], ['UpperArm.L', 1], ['LowerArm.L', 1], ['Hand.L', 1, 1], ['Shoulder.R', 1], ['UpperArm.R', 1], ['LowerArm.R', 1], ['Hand.R', 1, 1],
  ['UpperLeg.L', 1], ['LowerLeg.L', 1], ['Foot.L', 1, 1], ['UpperLeg.R', 1], ['LowerLeg.R', 1], ['Foot.R', 1, 1],
  ['IK_Foot.L', 0, 1], ['IK_Foot.R', 0, 1], ['Pole_Knee.L', 0, 1], ['Pole_Knee.R', 0, 1], ['Root', 0, 1],
].map(([name, deform, leaf]) => ({ name, deform: !!deform, leaf: !!leaf }));
const character = () => [
  { name: 'Armature', type: 'ARMATURE', shape: 'empty', selected: true, bones: rigBones() },
  { name: 'Body', shape: 'body', selected: true, parent: 'Armature', skinned: true },
];
const hasLoop = (s, a) => !!s.imp.clips[`Armature|${a}`]?.loop;

export const STAGES = [
  {
    id: 'axes', name: 'Scale and axes', sub: 'Apply Scalings · Bake Axis · Ctrl A',
    steps: [
      {
        id: 'x1', title: 'Lying on its back',
        text: 'This crate left Blender with the default FBX options. In Unity it looks fine, but select it: its Transform says Rotation X −89.98 and Scale 100. Blender is Z up and Unity Y up, so the exporter stands the model up with a rotation; and "All Local" writes the file in centimetres, so the object gets a scale of 100 that Unity compensates. Every script, child or collider you add will inherit that rotation and that scale. Export again so the crate arrives with Rotation 0 0 0 and Scale 1 1 1, and still 0.8 m wide.',
        how: ['In Unity, click <b>Crate</b> in the Hierarchy and read its <b>Transform</b> in the Inspector.', 'In Blender, <b>File › Export › FBX</b>: set <b>Apply Scalings</b> to <b>FBX Units Scale</b> and press <b>Export FBX</b>.', 'In Unity, click <b>Crate.fbx</b> in the Project. In the <b>Model</b> tab tick <b>Bake Axis Conversion</b> and press <b>Apply</b>.'],
        why: 'A model whose root says 0 0 0 and 1 1 1 behaves as expected: transform.forward points forward, children and colliders are not stretched, and scaling it in Unity means what it says. Blender\'s Apply Transform option does the axis conversion too, but it is experimental and breaks armatures.',
        start: () => scene('Crate', [crate()]),
        check: s => { const n = node(s, 'Crate'), b = sizeOf(s, 'Crate'); return !!n && cleanTransform(n) && near(b.size[0], 0.8, 0.01) && near(b.size[1], 0.8, 0.01); },
        solve: s => { Object.assign(s.exp, GOOD_EXPORT); Object.assign(s.imp, GOOD_IMPORT); doExport(s); },
      },
      {
        id: 'x2', title: 'Apply rotation and scale',
        text: 'This barrel started as Blender\'s default cylinder (2 m tall), scaled and turned in Object Mode. It looks right in both programs, but in Unity its Transform says Scale 0.3 0.45 0.3 and Rotation Y −90. A Capsule Collider added in Unity would be squashed by that scale, and a script that sets the scale to 1 makes the barrel 2 m tall. Before exporting, apply the rotation and the scale: Blender moves them into the mesh.',
        how: ['In Blender, select <b>Barrel</b> and look at the <b>Transform</b> panel: Rotation Z 90°, Scale 0.3 0.3 0.45.', '<b>Object › Apply › Rotation &amp; Scale</b> (<kbd>Ctrl</kbd> <kbd>A</kbd>). The barrel does not move; its Rotation goes to 0 and its Scale to 1.', '<b>Export FBX</b> again and check the Transform in Unity.'],
        why: 'In Blender, Object Mode scale and rotation are "unapplied": they live in the object, not in the mesh. Every exporter carries them to the game engine. Applying them is the first habit of a game artist.',
        start: () => scene('Barrel', [{ name: 'Barrel', shape: 'cylinder', selected: true, rot: [0, 0, 90], scale: [0.3, 0.3, 0.45], loc: [0, 0, 0.45] }], { exp: GOOD_EXPORT, imp: GOOD_IMPORT }),
        check: s => { const n = node(s, 'Barrel'), b = sizeOf(s, 'Barrel'); return !!n && cleanTransform(n) && near(b.size[1], 0.9, 0.01) && near(b.size[0], 0.6, 0.01); },
        solve: s => { OPS.applyRotScale(s.objects[0]); doExport(s); },
      },
      {
        id: 'x3', title: 'Real size',
        text: 'This floor lamp was modelled without looking at the units: in Unity it is 18 m tall, ten times the Player capsule (1.8 m). Blender and Unity both work in metres, so a model must have its real size in Blender. Make the lamp between 1.5 and 1.9 m tall without changing its proportions, apply the scale and export it.',
        how: ['Open the <b>Transform</b> panel: <b>Dimensions</b> Z says 18 m.', 'Scale the whole lamp: set the three <b>Scale</b> values to the same number (0.09 gives 1.62 m). Typing only Dimensions Z would squash it.', '<b>Object › Apply › Scale</b>, then <b>Export FBX</b>. Compare it with the Player in Unity.'],
        why: 'Real size keeps physics, lighting, navigation and texel density right. In Blender, the Measure tool and the Dimensions field help; Scene Properties › Units must stay in metres with Unit Scale 1.',
        start: () => scene('FloorLamp', [{ name: 'FloorLamp', shape: 'lamp', selected: true }], { exp: GOOD_EXPORT, imp: GOOD_IMPORT }),
        check: s => { const n = node(s, 'FloorLamp'), b = sizeOf(s, 'FloorLamp'); if (!n || !b) return false; const ratio = b.size[0] / b.size[1]; return cleanTransform(n) && b.size[1] >= 1.5 && b.size[1] <= 1.9 && near(ratio, 6.4 / 18, 0.01); },
        solve: s => { const o = s.objects[0]; o.scale = [0.09, 0.09, 0.09]; OPS.applyScale(o); doExport(s); },
      },
    ],
  },
  {
    id: 'origin', name: 'Origin and pivot', sub: 'Set Origin · 3D Cursor',
    steps: [
      {
        id: 'o1', title: 'The door that spins',
        text: 'In Unity, the pivot of an object is its origin in Blender. This door was modelled around its centre, so when the game opens it (a rotation of 90° on Y) it spins in the middle of the doorway. Put the origin on the hinge: at a bottom corner of the door, on the side where the hinges go.',
        how: ['In the Blender viewport, click one of the <b>bottom corners</b> of the door (the dots are its vertices).', '<b>Object › Snap › Cursor to Selected</b> (<kbd>Shift</kbd> <kbd>S</kbd>): the 3D cursor jumps there.', '<b>Object › Set Origin › Origin to 3D Cursor</b>, <b>Export FBX</b>, and press <b>▶ Play</b> in Unity to open the door.'],
        why: 'Doors, levers, wheels, lids and drawers turn around their pivot. Setting the origin in Blender is much cleaner than adding empty parent objects in Unity to fake a pivot.',
        start: () => scene('Door', [{ name: 'Door', shape: 'door', selected: true, loc: [0, 0, 1] }], { exp: GOOD_EXPORT, imp: GOOD_IMPORT }),
        check: s => { const o = s.file?.objects.find(x => x.name === 'Door'); return !!o && near(Math.abs(o.loc[0]), 0.45, 0.01) && Math.abs(o.loc[1]) <= 0.03 && near(o.loc[2], 0, 0.01); },
        solve: s => { const o = s.objects[0]; s.cursor = [-0.45, -0.025, 0]; OPS.originTo(o, s.cursor); doExport(s); },
      },
      {
        id: 'o2', title: 'Sitting on the floor',
        text: 'The chair was modelled somewhere in the Blender scene, with its origin in the middle of the seat. In Unity its prefab starts at (−2, 0.45, −1): wherever a level designer places it, it appears two metres away and half sunk into the floor. A prop should have its origin on the floor, under its centre, and sit at the world origin in Blender.',
        how: ['Bring it to the centre: <b>Object › Clear › Location</b> (<kbd>Alt</kbd> <kbd>G</kbd>). Now it is half under the grid.', 'Lift it until its feet touch the floor: <b>Location Z</b> 0.45 in the Transform panel.', '<b>Object › Snap › Cursor to World Origin</b>, then <b>Object › Set Origin › Origin to 3D Cursor</b>. Location reads 0 0 0. <b>Export FBX</b>.'],
        why: 'With the pivot on the floor, placing a prop is just setting its position: Y 0 is standing on the ground. Snapping to the grid and rotating it in place also work as expected.',
        start: () => scene('Chair', [{ name: 'Chair', shape: 'chair', selected: true, loc: [2, 1, 0.45] }], { exp: GOOD_EXPORT, imp: GOOD_IMPORT }),
        check: s => { const n = node(s, 'Chair'), b = sizeOf(s, 'Chair'); return !!n && nearV(n.position, [0, 0, 0], 0.01) && near(b.mn[1], 0, 0.01) && Math.abs(b.center[0]) <= 0.02 && Math.abs(b.center[2]) <= 0.02; },
        solve: s => { const o = s.objects[0]; o.loc = [0, 0, 0.45]; s.cursor = [0, 0, 0]; OPS.originTo(o, s.cursor); doExport(s); },
      },
    ],
  },
  {
    id: 'options', name: 'FBX options', sub: 'Include · Normals · Modifiers',
    steps: [
      {
        id: 'f1', title: 'Only what you need',
        text: 'The Blender file of the crate also has a camera, a light, a reference image and a hidden high-poly version used for baking. With the default options everything goes into the FBX, and Unity\'s Hierarchy fills with objects the game does not want. Export only the crate.',
        how: ['In <b>Include</b>, tick <b>Limit to › Selected Objects</b> (only Crate is selected), and/or <b>Visible Objects</b>.', 'In <b>Object Types</b>, keep only <b>Mesh</b> (and Armature for characters).', '<b>Export FBX</b> and look at the Hierarchy in Unity.'],
        why: 'Extra cameras and lights change the lighting of the level, and a hidden high-poly mesh can weigh more than the whole level. Unity can also skip cameras and lights (Import Cameras, Import Lights), but the clean way is not to export them.',
        start: () => scene('Crate', [crate(), { name: 'Crate_High', shape: 'crate', hidden: true, loc: [0, 0, 0] }, { name: 'Camera', type: 'CAMERA', shape: 'camera', loc: [3, -3, 2], rot: [70, 0, 45] }, { name: 'Light', type: 'LIGHT', shape: 'light', loc: [2, 1, 3] }, { name: 'Reference', type: 'EMPTY', shape: 'empty', loc: [-1.5, 0, 1] }], { exp: GOOD_EXPORT, imp: GOOD_IMPORT }),
        check: s => { const r = report(s); return !!r && r.nodes.length === 1 && r.nodes[0].name === 'Crate'; },
        solve: s => { s.exp.selectedOnly = true; s.exp.types = { EMPTY: false, CAMERA: false, LIGHT: false, ARMATURE: true, MESH: true, OTHER: false }; doExport(s); },
      },
      {
        id: 'f2', title: 'Holes in the model',
        text: 'In Unity two faces of the crate are missing. Blender draws both sides of every face, but a game engine only draws the side the normal points to (back-face culling). Two faces of this crate point inwards. Show them with Face Orientation (blue = front, red = back), recalculate the normals and export again.',
        how: ['In Blender, turn on <b>Overlays › Face Orientation</b>: the flipped faces are red.', '<b>Mesh › Normals › Recalculate Outside</b> (in Edit Mode, <kbd>A</kbd> then <kbd>Shift</kbd> <kbd>N</kbd>). Everything turns blue.', '<b>Export FBX</b> and look again in Unity.'],
        why: 'Flipped normals come from mirroring with a negative scale, extruding inwards or joining meshes. Checking Face Orientation before exporting is a good habit; in Unity a flipped face is simply invisible.',
        start: () => scene('Crate', [crate({ flipped: 2 })], { exp: { ...GOOD_EXPORT, selectedOnly: true }, imp: GOOD_IMPORT }),
        check: s => { const o = s.file?.objects.find(x => x.name === 'Crate'); return !!o && o.flipped === 0; },
        solve: s => { OPS.recalcNormals(s.objects[0]); doExport(s); },
      },
      {
        id: 'f3', title: 'Modifiers and smoothing',
        text: 'The barrel is half a model with three modifiers: a Mirror that completes it, a Bevel that rounds the rims and Smooth by Angle, which in Blender 4.1 and later is also a modifier and keeps the rims sharp. Someone unticked Apply Modifiers, so Unity gets the raw half, without bevels and blurry. Export the barrel as Blender shows it.',
        how: ['Look at the <b>Modifiers</b> tab of <b>Barrel</b> and at the barrel in Unity.', 'In the FBX options, <b>Geometry</b>, tick <b>Apply Modifiers</b> (the modifiers stay editable in Blender). You could also apply them one by one in the Modifiers tab.', 'Set <b>Smoothing</b> to <b>Face</b>, export, and compare the rims.'],
        why: 'Modifiers only exist in Blender: the file needs the final mesh. Exporting with Apply Modifiers keeps the model editable, and Smoothing Face writes the sharp and smooth edges so Unity keeps them (Normals: Import).',
        start: () => scene('Barrel', [{ name: 'Barrel', shape: 'barrel', selected: true, half: true, mods: [{ type: 'MIRROR' }, { type: 'BEVEL' }, { type: 'SMOOTH_BY_ANGLE' }] }], { exp: { ...GOOD_EXPORT, selectedOnly: true, applyModifiers: false }, imp: GOOD_IMPORT, tab: 'modifiers' }),
        check: s => { const f = s.file, o = f?.objects.find(x => x.name === 'Barrel'); return !!o && (f.settings.applyModifiers || !o.mods.length) && f.settings.smoothing === 'Face'; },
        solve: s => { s.exp.applyModifiers = true; s.exp.smoothing = 'Face'; doExport(s); },
      },
    ],
  },
  {
    id: 'assets', name: 'Materials, rig and animation', sub: 'Textures · Skeleton · Clips',
    steps: [
      {
        id: 'm1', title: 'Textures that arrive',
        text: 'The crate\'s material uses an image for the colour, a normal map, and a procedural roughness (a Noise Texture through a Color Ramp). An FBX only carries Image Textures plugged straight into the Principled BSDF: nodes, procedurals and maths stay in Blender. And the images must travel with the model. Get the three maps to Unity and make the material editable.',
        how: ['In the <b>Material</b> tab, bake the procedural roughness to an image (<b>Bake to Image</b>, as in the Baking Lab).', 'In the FBX options, set <b>Path Mode</b> to <b>Copy</b> and turn on <b>Embed Textures</b> (the box button next to it). Export.', 'In Unity, <b>Materials</b> tab: <b>Extract Materials…</b> (embedded materials are read-only). In the material, press <b>Fix Now</b> to mark the normal map as a Normal map.'],
        why: 'URP\'s Lit shader uses Smoothness (1 − roughness), read from the alpha of the Metallic map: a real project packs the inverted roughness there, in Blender or with a texture tool. What never works is expecting Blender nodes to arrive in Unity.',
        start: () => scene('Crate', [crate({ material: { name: 'Crate_Wood', channels: { baseColor: { kind: 'image', file: 'crate_albedo.png' }, normal: { kind: 'image', file: 'crate_normal.png', via: 'Normal Map' }, roughness: { kind: 'procedural', node: 'Noise Texture → Color Ramp' }, metallic: { kind: 'value', value: 0 } } } })], { exp: { ...GOOD_EXPORT, selectedOnly: true }, imp: GOOD_IMPORT, tab: 'material' }),
        check: s => { const m = s.file ? materialReport(s.file, s.imp) : null; return !!m && ['baseColor', 'normal', 'roughness'].every(k => m.channels[k].state === 'ok') && m.editable; },
        solve: s => { s.objects[0].material.channels.roughness = { kind: 'image', file: 'crate_roughness.png', baked: true }; Object.assign(s.exp, { pathMode: 'Copy', embedTextures: true }); doExport(s); Object.assign(s.imp, { extracted: true, location: 'Use External Materials (Legacy)', normalFixed: true }); },
      },
      {
        id: 'a1', title: 'A clean skeleton',
        text: 'The character goes to Unity with its armature. Its FBX was exported with Apply Transform (from the first stage) and with the default armature options, so Unity gets extra "_end" bones at every tip, the IK and pole controllers of the rig, and bones whose axes Apply Transform has broken. Export only the deform bones, without leaf bones, and set it up as a Humanoid.',
        how: ['In the FBX options, <b>Transform</b>: untick <b>Apply Transform</b> (known to break armatures). Keep FBX Units Scale; Unity\'s Bake Axis Conversion does the rest.', '<b>Armature</b>: tick <b>Only Deform Bones</b> and untick <b>Add Leaf Bones</b>. Export (Armature and Body selected).', 'In Unity, <b>Rig</b> tab: <b>Animation Type › Humanoid</b>, <b>Avatar Definition › Create From This Model</b>, <b>Apply</b>. The avatar must be valid (✓).'],
        why: 'The game only needs the bones that move vertices; controllers are for animating in Blender. A Humanoid avatar lets Unity retarget any humanoid animation (Mixamo, the Asset Store…) to your character.',
        start: () => scene('Character', character(), { exp: { ...GOOD_EXPORT, selectedOnly: true, applyTransform: true, types: { EMPTY: false, CAMERA: false, LIGHT: false, ARMATURE: true, MESH: true, OTHER: false } }, imp: { ...GOOD_IMPORT, animationType: 'Generic' }, actions: [{ name: 'Idle' }], activeAction: 'Idle', tab: 'export' }),
        check: s => { if (!s.file) return false; const r = rigReport(s.file, s.imp); return r.issues.length === 0 && r.avatar === 'valid' && r.skinned; },
        solve: s => { Object.assign(s.exp, { applyTransform: false, onlyDeform: true, leafBones: false }); doExport(s); s.imp.animationType = 'Humanoid'; s.imp.avatar = 'Create From This Model'; },
      },
      {
        id: 'a2', title: 'One clip per action',
        text: 'With All Actions on, Blender exports every action in the file as a clip. This file also has Walk.001 (a copy made by mistake) and ArmatureAction (an empty leftover), so Unity shows five clips, none of them looping. Leave only Idle, Walk and Run, and make them loop.',
        how: ['In Blender, <b>Actions</b> list: delete <b>Walk.001</b> and <b>ArmatureAction</b> (clear their Fake User shield and purge them). Export.', 'In Unity, <b>Animation</b> tab: select each clip and tick <b>Loop Time</b>. Apply.', 'Press <b>▶ Play</b> to preview the clips on the character.'],
        why: 'Every action saved with a Fake User ends up in the FBX. Cleaning the actions in Blender (or exporting only NLA strips) keeps the list of clips short and named. Loop Time is set per clip in Unity; the name after "|" can be renamed there too.',
        start: () => scene('Character', character(), { exp: { ...GOOD_EXPORT, selectedOnly: true, onlyDeform: true, leafBones: false, types: { EMPTY: false, CAMERA: false, LIGHT: false, ARMATURE: true, MESH: true, OTHER: false } }, imp: { ...GOOD_IMPORT, animationType: 'Humanoid' }, actions: [{ name: 'Idle', fake: true }, { name: 'Walk', fake: true }, { name: 'Run', fake: true }, { name: 'Walk.001', fake: true }, { name: 'ArmatureAction', fake: true, empty: true }], activeAction: 'Walk', tab: 'actions' }),
        check: s => { if (!s.file) return false; const c = clipsOf(s.file); return c.length === 3 && ['Idle', 'Walk', 'Run'].every(a => c.includes(`Armature|${a}`) && hasLoop(s, a)); },
        solve: s => { s.actions = s.actions.filter(a => ['Idle', 'Walk', 'Run'].includes(a.name)); doExport(s); for (const a of ['Idle', 'Walk', 'Run']) s.imp.clips[`Armature|${a}`] = { loop: true }; },
      },
    ],
  },
  {
    id: 'colliders', name: 'Custom colliders', sub: 'Primitive · Convex · Compound',
    steps: [
      {
        id: 'c1', title: 'A crate that falls',
        text: 'The crate has a Rigidbody so it can fall and be pushed. Its collider comes from Generate Colliders, which puts a Mesh Collider with the render mesh on it. Press Play: Unity logs an error and the crate falls through the floor, because a moving Rigidbody cannot use a non-convex Mesh Collider. Give it the cheapest collider that fits.',
        how: ['Press <b>▶ Play</b> and read the <b>Console</b>.', 'In the import settings (<b>Model</b> tab) untick <b>Generate Colliders</b> and Apply.', 'Select <b>Crate</b> in the Hierarchy, <b>Add Component › Box Collider</b>, and Play again.'],
        why: 'Primitive colliders (Box, Sphere, Capsule) are the fastest for physics. A convex Mesh Collider fits odd shapes but costs more (and has at most 255 triangles); a non-convex one is only for static scenery.',
        start: () => scene('Crate', [crate({ loc: [0, 0, 0] })], { exp: { ...GOOD_EXPORT, selectedOnly: true }, imp: { ...GOOD_IMPORT, generateColliders: true }, unity: { components: { Crate: [{ type: 'Rigidbody' }] } } }),
        check: s => { const c = componentsOf(s).Crate || []; return c.some(x => x.type === 'BoxCollider') && c.some(x => x.type === 'Rigidbody') && !c.some(x => x.type === 'MeshCollider') && physicsState(s).errors.length === 0; },
        solve: s => { s.imp.generateColliders = false; s.unity.components.Crate = [{ type: 'Rigidbody' }, { type: 'BoxCollider' }]; },
      },
      {
        id: 'c2', title: 'A table the ball rolls under',
        text: 'The table can be pushed, so it has a Rigidbody and a convex Mesh Collider. But a convex collider is the shape of a sheet wrapped around the object: here, a solid block from the floor to the top. Press Play: the ball dropped under the table stops in the air. Make a compound collider in Blender: one simple convex object per part, whose names end in _COL, exported with the table.',
        how: ['In Blender, <b>Add › Collision Box</b>: add the <b>top</b> and the four <b>legs</b>, each as its own object (one object with four legs would be a single convex block again). Select them with the table and export.', 'In Unity, for each <b>_COL</b> object: <b>Add Component › Mesh Collider</b> with <b>Convex</b>, and untick its <b>Mesh Renderer</b> so it is invisible. Remove the Mesh Collider from <b>Table</b>.', 'The Rigidbody stays on the root object (<b>PushTable</b>, named after the file), so all the colliders move together. Press <b>▶ Play</b>.'],
        why: 'Unity has no naming rule for collision meshes (Unreal uses UCX_). Studios add a small editor script (AssetPostprocessor) that does step 2 for every object ending in _COL. Primitive colliders added by hand in Unity are the other good option.',
        start: () => scene('PushTable', [{ name: 'Table', shape: 'table', selected: true }], { exp: { ...GOOD_EXPORT, selectedOnly: true }, imp: GOOD_IMPORT, unity: { components: { Table: [{ type: 'MeshCollider', convex: true }] }, rootRigidbody: true } }),
        check: s => {
          const r = report(s); if (!r) return false;
          const cols = r.nodes.filter(n => /_COL/.test(n.name)), comps = componentsOf(s), ph = physicsState(s);
          if (cols.length < 5 || ph.errors.length) return false;
          if (!cols.every(n => (comps[n.name] || []).some(c => c.type === 'MeshCollider' && c.convex) && s.unity.renderers[n.name] === false)) return false;
          if ((comps.Table || []).some(c => c.type.endsWith('Collider'))) return false;
          const boxes = ph.boxes.map(x => x.b);
          return near(dropHeight(boxes, ...TABLE_DROPS.under), 0, 0.02) && near(dropHeight(boxes, ...TABLE_DROPS.top), 0.75, 0.02);
        },
        solve: s => {
          addCollisionParts(s, 'top'); addCollisionParts(s, 'legs4');
          for (const o of s.objects) o.selected = true;
          doExport(s);
          s.unity.components.Table = [];
          for (const o of s.objects.filter(x => /_COL/.test(x.name))) { s.unity.components[o.name] = [{ type: 'MeshCollider', convex: true }]; s.unity.renderers[o.name] = false; }
        },
      },
    ],
  },
];

// Add › Collision Box: simple boxes that follow the table's parts.
export const COL_SHAPES = { top: 'col_top', legs1: 'col_legs', legs4: ['col_leg0', 'col_leg1', 'col_leg2', 'col_leg3'] };
export function addCollisionParts(s, kind) {
  const add = (name, shape) => { if (!s.objects.find(o => o.name === name)) s.objects.push(makeObject({ name, shape, selected: true, collision: true })); };
  if (kind === 'top') add('Table_COL_Top', 'col_top');
  if (kind === 'legs1') add('Table_COL_Legs', 'col_legs');
  if (kind === 'legs4') [0, 1, 2, 3].forEach(i => add(`Table_COL_Leg${i + 1}`, `col_leg${i}`));
}

export function startState(step) { const s = step.start(); s.flags = {}; if (step.setup) step.setup(s); return s; }
export { cleanTransform, isUniform, localBounds, worldBounds };
