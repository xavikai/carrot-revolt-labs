// Stages, starting scenes and checks for the Skin Weights Lab.
import { makeRig, emptyWeights, automaticWeights, ringAverage, stats, symmetryError, vertex, normalizeAll, limitTotal, clean, mirrorWeights, smooth } from './weights.js';

function hardElbow(rig) {
  const W = emptyWeights(rig);
  for (let i = 0; i < rig.count; i++) (vertex(rig, i)[0] < rig.joint ? W[0] : W[1])[i] = 1;
  return W;
}
function damagedBody(rig) {
  const W = automaticWeights(rig);
  const g = n => rig.bones.findIndex(b => b.name === n);
  for (let i = 0; i < rig.count; i++) {
    const [x, y] = vertex(rig, i);
    // 1 · a patch with no weights on the left forearm
    if (x > 3.0 && x < 3.45 && y > 0.05) for (const G of W) G[i] = 0;
    // 2 · stray weight: the LEFT upper arm group painted on the RIGHT arm
    if (x < -1.75 && x > -2.25 && y < 0) W[g('UpperArm.L')][i] = 0.6;
    // 3 · the right elbow has a hard edge, the left one is smooth
    if (x < -2.0 && x > -3.2) { const f = x < -2.6 ? 1 : 0; W[g('Forearm.R')][i] = f; W[g('UpperArm.R')][i] = 1 - f; W[g('Chest')][i] = 0; }
  }
  return W;
}
function messyBody(rig) {
  const W = automaticWeights(rig, 2.2);
  // extra tiny weights everywhere, like after painting with a soft brush
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < rig.count; i++) for (const G of W) if (G[i] === 0 && rnd() < 0.35) G[i] = 0.01 + rnd() * 0.03;
  // wider blends: 3 or 4 bones on many vertices
  for (let g = 0; g < W.length; g++) for (let i = 0; i < rig.count; i++) W[g][i] = Math.min(1, W[g][i]);
  normalizeAll(W, rig);
  return W;
}

const forearm = (W, rig) => rig.bones.findIndex(b => b.name === 'Forearm');
const softElbow = (W, rig) => {
  const f = forearm(W, rig), a = ringAverage(W, rig, f, 1.75), b = ringAverage(W, rig, f, 2.25), u = ringAverage(W, rig, 0, 1.75);
  return a > 0.03 && a < 0.5 && b > 0.5 && b < 0.97 && u > 0.45;
};

export const STAGES = [
  {
    id: 'auto', name: 'Automatic weights', sub: 'Mesh + armature', rig: 'arm',
    start: rig => ({ weights: emptyWeights(rig), parented: false }),
    steps: [
      {
        id: 'a1', title: 'Weights from the bones',
        text: 'The arm mesh has an armature, but no weights yet: every vertex group is empty. Bend the Forearm in the Pose panel: the mesh does not move, because no vertex follows any bone. Then parent the mesh with Automatic Weights.',
        how: ['In the <b>Pose</b> panel, click <b>Forearm</b> and drag its <b>Bend</b>: nothing happens.', 'Press <kbd>Ctrl</kbd><kbd>P</kbd> (or the <b>Parent</b> menu) › <b>With Automatic Weights</b>.', 'Bend again: now the mesh follows the bones.'],
        why: 'A vertex moves with a bone only if it has weight in the vertex group with the same name as the bone.',
        check: (d, rig) => stats(d.weights, rig).zero === 0,
        solve: (d, rig) => { d.weights = automaticWeights(rig); d.parented = true; },
      },
      {
        id: 'a2', title: 'Read the gradient',
        text: 'Each vertex group has its own weights: red = 1 (follows the bone completely), blue = 0 (ignores it). Look at the Forearm group and bend the elbow at least 60°: around the joint the colours blend, so the mesh bends smoothly.',
        how: ['<kbd>Ctrl</kbd>-click the Forearm bone in the viewport (or click <b>Forearm</b> in the Vertex Groups list).', 'Set <b>Bend</b> to 60° or more (or press <kbd>R</kbd> and move the mouse).', 'Hover the elbow: the sidebar shows the weights of the vertex under the cursor. They add up to 1.'],
        why: 'The blend zone decides how the joint deforms: too narrow and it creases, too wide and it bends like rubber.',
        check: (d, rig, flags) => flags.seen.has('Forearm') && flags.maxBend >= 60 && stats(d.weights, rig).zero === 0,
      },
      {
        id: 'a3', title: 'Twist it',
        text: 'Twist the Forearm 120° or more. With linear blend skinning the vertices in the blend zone take the average position of two bones and the tube collapses: the "candy wrapper" effect. Riggers fix it with extra twist bones or careful weights; here, just see it and bring the pose back.',
        how: ['Drag <b>Twist</b> of the Forearm to 120° or more.', 'Look at the elbow from the side: the tube gets thin.', 'Press <kbd>Alt</kbd><kbd>R</kbd> (or <b>Clear Pose</b>) to go back to the rest pose.'],
        why: 'Knowing the limits of skinning helps you decide where to add bones instead of fighting with weights.',
        check: (d, rig, flags) => flags.maxTwist >= 120 && flags.resetAfterTwist,
      },
    ],
  },
  {
    id: 'elbow', name: 'Fix the elbow', sub: 'Blur and normalize', rig: 'arm',
    start: rig => ({ weights: hardElbow(rig), parented: true }),
    pose: [{ bend: 0, twist: 0 }, { bend: 70, twist: 0 }],
    steps: [
      {
        id: 'e1', title: 'A soft elbow',
        text: 'Someone painted this arm with a hard edge: every vertex belongs 100% to one bone, so the bent elbow folds like paper. Make a smooth gradient across the joint, about a quarter of the bone on each side.',
        how: ['Turn on <b>Auto Normalize</b> and choose the <b>Blur</b> tool (Radius about 70 px, Strength 1).', 'With <b>Forearm</b> active, brush across the elbow many times: the gradient grows towards the shoulder. Orbit with <kbd>MMB</kbd> to reach the back too.', 'Then make <b>UpperArm</b> active and blur again: now the gradient grows towards the hand. With Auto Normalize, a vertex that is only in one group stays at 1.', 'Another way: <b>Weights › Smooth</b> with Subset All Groups and about 10 Iterations.'],
        why: 'A gradient spreads the bend over several rings of vertices, so the joint keeps its shape.',
        check: (d, rig) => softElbow(d.weights, rig),
        solve: (d, rig) => { smooth(d.weights, rig, { factor: 0.8, repeat: 12 }); normalizeAll(d.weights, rig); },
      },
      {
        id: 'e2', title: 'Add up to 1',
        text: 'Check the totals under the cursor. If you blurred or smoothed with Auto Normalize off, some vertices add up to more or less than 1. Blender still deforms them, but game engines and many tools expect every vertex to add up to exactly 1.',
        how: ['Use <b>Weights › Normalize All</b>.', 'If the gradient disappears on one side, that side had only one group: blur it again with Auto Normalize on.', 'Check the sidebar: “Not normalized: 0”.'],
        why: 'Normalized weights make the result predictable: 0.3 on one bone means 0.7 on the others.',
        check: (d, rig) => softElbow(d.weights, rig) && stats(d.weights, rig).notNormalized === 0 && stats(d.weights, rig).zero === 0,
        solve: (d, rig) => { smooth(d.weights, rig, { factor: 0.8, repeat: 12 }); normalizeAll(d.weights, rig); },
      },
    ],
  },
  {
    id: 'problems', name: 'Find the problems', sub: 'Zero, stray, mirror', rig: 'body',
    start: rig => ({ weights: damagedBody(rig), parented: true }),
    steps: [
      {
        id: 'p1', title: 'Vertices with no weight',
        text: 'Some vertices on the left forearm have no weight in any group. When the arm moves, they stay behind and stretch the mesh. Find them and give them weight.',
        how: ['In the header, set <b>Zero Weights</b> to <b>All</b>: vertices with no weight turn black.', 'Make <b>Forearm.L</b> active and paint over the black patch (Draw, Weight 1).', 'Bend Forearm.L to check nothing stays behind.'],
        why: 'Unweighted vertices are the most common cause of “spikes” when a character moves.',
        check: (d, rig) => stats(d.weights, rig).zero === 0,
        solve: (d, rig) => { const f = rig.bones.findIndex(b => b.name === 'Forearm.L'); for (let i = 0; i < rig.count; i++) { let s = 0; for (const G of d.weights) s += G[i]; if (s < 1e-4) d.weights[f][i] = 1; } },
      },
      {
        id: 'p2', title: 'A stray weight',
        text: 'The group UpperArm.L also has weight on the right arm (the .R side), so bending the left arm pulls a piece of the right one. Remove all UpperArm.L weight from the .R side.',
        how: ['Make <b>UpperArm.L</b> active and look at the .R arm: there is colour that should not be there.', 'Paint it away with <b>Draw › Subtract</b> (or Draw Mix with Weight 0).', 'Bend UpperArm.L: the right arm must not move.'],
        why: 'Stray weights are hard to see in the rest pose: always test with a pose.',
        check: (d, rig) => { const g = rig.bones.findIndex(b => b.name === 'UpperArm.L'); for (let i = 0; i < rig.count; i++) if (vertex(rig, i)[0] < -0.5 && d.weights[g][i] > 0.01) return false; return true; },
        solve: (d, rig) => { const g = rig.bones.findIndex(b => b.name === 'UpperArm.L'); for (let i = 0; i < rig.count; i++) if (vertex(rig, i)[0] < -0.5) d.weights[g][i] = 0; normalizeAll(d.weights, rig); },
      },
      {
        id: 'p3', title: 'Make it symmetrical',
        text: 'The left arm is fine, but the right elbow still has a hard edge. Instead of painting it again, copy the left side to the right: the bone names end in .L and .R so Blender knows which group goes where.',
        how: ['Make <b>UpperArm.L</b> active and use <b>Weights › Mirror</b>. Do the same with <b>Forearm.L</b> and <b>Chest</b>.', 'Or turn on <b>X-Mirror</b> and paint: every stroke is copied to the other side.', 'The sidebar shows the symmetry error: it must be close to 0.'],
        why: 'Painting one side and mirroring saves half the work and keeps the character symmetrical.',
        check: (d, rig) => symmetryError(d.weights, rig) < 0.08,
        solve: (d, rig) => { STAGES[2].steps[0].solve(d, rig); STAGES[2].steps[1].solve(d, rig); for (const n of ['UpperArm.L', 'Forearm.L', 'Chest']) mirrorWeights(d.weights, rig, rig.bones.findIndex(b => b.name === n)); },
      },
    ],
  },
  {
    id: 'game', name: 'Game ready', sub: 'Limit, clean, normalize', rig: 'body',
    start: rig => ({ weights: messyBody(rig), parented: true }),
    steps: [
      {
        id: 'g1', title: 'At most 2 bones per vertex',
        text: 'Game engines limit how many bones can move one vertex (Unity: 1, 2 or 4; many mobile games use 2). Here some vertices have 3, 4 or even 5 influences. Keep only the 2 strongest.',
        how: ['<b>Weights › Limit Total</b>. In the <b>Adjust Last Operation</b> panel (bottom left) set <b>Limit</b> to 2.', 'Check the sidebar: “Max influences: 2”.'],
        why: 'Fewer influences = faster skinning. Too many small influences also make weights hard to edit.',
        check: (d, rig) => stats(d.weights, rig).maxInfluences <= 2,
        solve: (d, rig) => { limitTotal(d.weights, rig, 2); },
      },
      {
        id: 'g2', title: 'Clean the tiny weights',
        text: 'A soft brush leaves tiny weights (0.01, 0.03…) everywhere. They are invisible but they count as influences and can pull vertices in strange ways. Remove every weight below 0.05.',
        how: ['<b>Weights › Clean</b>. In the <b>Adjust Last Operation</b> panel set <b>Subset</b> to All Groups and <b>Limit</b> to 0.05.', 'Check the sidebar: “Tiny weights: 0”.'],
        why: 'Clean weights are easier to read, mirror and export.',
        check: (d, rig) => stats(d.weights, rig).tiny === 0,
        solve: (d, rig) => { clean(d.weights, rig, 0.05); },
      },
      {
        id: 'g3', title: 'Normalize before export',
        text: 'Limiting and cleaning removed some weight, so many vertices no longer add up to 1. Finish with Normalize All, and check the whole list: 2 influences at most, no tiny weights, everything normalized, nothing at zero.',
        how: ['<b>Weights › Normalize All</b>.', 'Read the four numbers in the sidebar.', 'Pose a few bones to check the deformation still looks right.'],
        why: 'This is the usual “before export” checklist for FBX to Unity or Unreal.',
        check: (d, rig) => { const s = stats(d.weights, rig); return s.maxInfluences <= 2 && s.tiny === 0 && s.notNormalized === 0 && s.zero === 0; },
        solve: (d, rig) => { limitTotal(d.weights, rig, 2); clean(d.weights, rig, 0.05); normalizeAll(d.weights, rig); },
      },
    ],
  },
];

export const rigFor = stage => makeRig(stage.rig);
