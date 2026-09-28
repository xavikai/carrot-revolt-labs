// Stages of the Topology Lab. Each step loads a mesh and checks it (or the selection) with the mesh tools.
import { clone, stats, connect, trisToQuads, dissolveVerts, loopCut, edges, ek, edgeRing, V } from './mesh.js';
import { ngonPanel, triPanel, bottle, box, SLAB, pinchedSlab, cornerLoss, tube, ringsOf, BLEND, elbowVolume, quadStone, maxSnapError, densityRatio, snapToStone, smoothVerts } from './models.js';

export function defaultState() {
  return { kind: 'panel', mesh: null, sel: { mode: 'vert', v: [], e: [], f: [] }, subsurf: { on: false, levels: 2 }, arm: { angle: 0, preserve: false }, snap: false };
}
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v); else a[k] = JSON.parse(JSON.stringify(v)); } return a; };
const allQuads = m => { const s = stats(m); return s.tris === 0 && s.ngons === 0; };

// ─── Helpers for the arm ─────────────────────────────────────────────────────
export const ZONE = BLEND + 0.05;
export function armInfo(m) {
  const xs = ringsOf(m), inZone = xs.filter(x => Math.abs(x) <= ZONE);
  let gap = inZone.length ? 0 : Infinity; for (let i = 1; i < inZone.length; i++) gap = Math.max(gap, inZone[i] - inZone[i - 1]);
  const spread = inZone.length > 0 && inZone[0] <= -0.1 && inZone[inZone.length - 1] >= 0.1;
  return { rings: xs.length, inZone: inZone.length, gap, spread };
}
const armOk = m => { const a = armInfo(m); return a.inZone >= 3 && a.gap <= 0.3 && a.spread; };
// Cut a loop across the arm at x (the solutions use it).
function cutArmAt(m, x) {
  const e = edges(m).find(([a, b]) => { const pa = m.v[a], pb = m.v[b]; return Math.abs(pa[1] - pb[1]) < 1e-6 && Math.abs(pa[2] - pb[2]) < 1e-6 && Math.min(pa[0], pb[0]) < x && Math.max(pa[0], pb[0]) > x; });
  if (!e) return m;
  let [a, b] = e; if (m.v[a][0] > m.v[b][0]) [a, b] = [b, a];
  return loopCut(m, a, b, (x - m.v[a][0]) / (m.v[b][0] - m.v[a][0]));
}
// Holding edges on a box: a loop near both ends of every axis.
function holdBox(m, d) {
  for (const ax of [0, 1, 2]) for (const side of [-1, 1]) {
    const half = SLAB[ax], target = side * (half - 2 * half * d);
    const e = edges(m).find(([a, b]) => { const pa = m.v[a], pb = m.v[b], v = V.sub(pb, pa); return Math.abs(v[(ax + 1) % 3]) < 1e-6 && Math.abs(v[(ax + 2) % 3]) < 1e-6 && Math.min(pa[ax], pb[ax]) < target && Math.max(pa[ax], pb[ax]) > target; });
    if (!e) continue;
    let [a, b] = e; if (m.v[a][ax] > m.v[b][ax]) [a, b] = [b, a];
    m = loopCut(m, a, b, (target - m.v[a][ax]) / (m.v[b][ax] - m.v[a][ax]));
  }
  return m;
}
// The retopology cage with three holes, some vertices off the surface or bunched together.
const STONE_HOLES = [4, 22, 40];
function stoneWithHoles() { const m = quadStone(3); m.f = m.f.filter((_, i) => !STONE_HOLES.includes(i)); return m; }
const FLOATING = [3, 11, 17, 30, 44, 51];
function stoneFloating() { const m = quadStone(3); for (const i of FLOATING) m.v[i] = V.mul(m.v[i], i % 2 ? 1.22 : 0.8); return m; }
const BUNCH = [21, 22, 19, 5, 6];
function stoneBunched() { const m = quadStone(3), c = m.v[20]; for (const i of BUNCH) m.v[i] = snapToStone(V.lerp(m.v[i], c, 0.6)); return m; }

export const STAGES = [
  {
    id: 'read', name: 'Read the mesh', sub: 'Quads · tris · n-gons · poles',
    steps: [
      {
        id: 'r1', title: 'No n-gons',
        text: 'A good mesh for subdivision and deformation is made of quads: faces with four sides. Faces with more than four sides (n-gons) can not be subdivided cleanly and they break edge loops. This panel has two n-gons (red with Face types on). Split each one into quads by connecting two of its vertices.',
        how: ['Turn on <b>Face types</b> to see quads, triangles and n-gons in colour. The Statistics panel counts them.', 'In <b>Vertex</b> select mode, click a vertex of the n-gon and <kbd>Shift</kbd>-click the vertex opposite.', 'Press <kbd>J</kbd> (<b>Connect Vertex Path</b>) to split the face. Repeat until there are no n-gons.'],
        why: 'N-gons are fine on flat, rigid parts that will never be subdivided or deformed, but they are the first thing to fix in a model for animation.',
        start: { kind: 'panel', mesh: 'ngon' },
        check: s => allQuads(s.mesh),
        solve: s => { s.mesh = connect(connect(s.mesh, 1, 7), 16, 15); },
      },
      {
        id: 'r2', title: 'Triangles into quads',
        text: 'Triangles are not always wrong (game engines only use triangles), but in a model that will be subdivided or deformed, pairs of triangles should become quads. Remove the diagonal edge between two triangles and they become one quad.',
        how: ['In <b>Edge</b> select mode, click the diagonal edge between two triangles (<kbd>Shift</kbd>-click to add more).', 'Press <kbd>X</kbd> › <b>Dissolve Edges</b>.', 'Or select everything (<kbd>A</kbd>) and press <kbd>Alt</kbd> <kbd>J</kbd> (<b>Tris to Quads</b>) to do it automatically.'],
        why: 'Quads keep edge loops going, subdivide evenly and are easier to select and edit.',
        start: { kind: 'panel', mesh: 'tri' },
        check: s => allQuads(s.mesh),
        solve: s => { s.mesh = trisToQuads(s.mesh); },
      },
      {
        id: 'r3', title: 'Find the poles',
        text: 'A pole is a vertex where the number of edges is not four. A vertex with three edges (N-pole) or five edges (E-pole) is where edge loops turn or end. Poles are unavoidable (a cube has eight), but they should sit on flat areas, away from joints and details, because they pinch a little when subdivided. Find the six poles of this bottle cap.',
        how: ['Turn on <b>Poles</b> if you want a hint, or count the edges around each vertex.', 'In <b>Vertex</b> select mode, click one pole and <kbd>Shift</kbd>-click the others.', 'Select exactly the poles: the five on the rim of the cap and the one in the middle.'],
        why: 'Reading where loops go and where they end is the skill behind every good topology.',
        start: { kind: 'bottle', mesh: 'bottle' },
        check: s => { const st = stats(s.mesh), poles = [...st.poles3, ...st.poles5].sort((a, b) => a - b); return s.sel.mode === 'vert' && s.sel.v.length === poles.length && [...s.sel.v].sort((a, b) => a - b).every((v, i) => v === poles[i]); },
        solve: s => { const st = stats(s.mesh); s.sel = { mode: 'vert', v: [...st.poles3, ...st.poles5], e: [], f: [] }; },
      },
    ],
  },
  {
    id: 'subd', name: 'Subdivision Surface', sub: 'Pinches · holding edges · crease',
    steps: [
      {
        id: 's1', title: 'Pinches',
        text: 'Subdivision Surface (Catmull-Clark) splits every face and smooths the result. With quads it gives even, smooth surfaces; an n-gon or a triangle leaves a pole and a pinch. This box has an extra vertex on the top front edge: the top and the front are pentagons. Look at the pinch, then get rid of the extra vertex.',
        how: ['The <b>Subdivision Surface</b> modifier is already on (<kbd>Ctrl</kbd> <kbd>2</kbd>). Turn the view around the front top edge.', 'Select the extra vertex in the middle of that edge.', 'Press <kbd>X</kbd> › <b>Dissolve Vertices</b>: the faces become quads again.'],
        why: 'A pinch is often invisible in the viewport and obvious in the render, with reflections or a normal map.',
        start: { kind: 'slab', mesh: 'pinched', subsurf: { on: true, levels: 2 } },
        check: s => allQuads(s.mesh) && s.subsurf.on,
        solve: s => { s.mesh = dissolveVerts(s.mesh, [8]); },
      },
      {
        id: 's2', title: 'Holding edges',
        text: 'Subdivision turns this box into a soft pebble: the corners fall 88% of its thickness away from where they were. To keep a hard-surface shape, add supporting loops (holding edges) close to every edge: the closer they are, the sharper the corner. Bring the corners to within 12% of the thickness.',
        how: ['Press <kbd>Ctrl</kbd> <kbd>R</kbd> (<b>Loop Cut</b>) and hover an edge: a yellow loop appears across it.', 'Move the mouse to slide it close to one end, and click to cut.', 'Add a loop near both ends of each direction (six loops). The Statistics panel shows the corner loss.'],
        why: 'Holding edges are the classic subdivision modelling technique: the loops control how round each edge is.',
        start: { kind: 'slab', mesh: 'slab', subsurf: { on: true, levels: 2 } },
        check: s => s.subsurf.on && allQuads(s.mesh) && cornerLoss(s.mesh, 2) <= 0.12,
        solve: s => { s.mesh = holdBox(s.mesh, 0.08); },
      },
      {
        id: 's3', title: 'Crease instead',
        text: 'A crease tells the subdivision to keep an edge sharp without adding geometry. Crease 1 keeps it perfectly sharp; values in between round it a little. Use creases instead of holding edges: keep the box with 6 faces and bring the corners to within 5% of the thickness.',
        how: ['In <b>Edge</b> select mode, select all the edges (<kbd>A</kbd>).', 'Press <kbd>Shift</kbd> <kbd>E</kbd> (<b>Edge Crease</b>). In Blender you type the value; here it is the <b>Edge Crease</b> field of the Tool panel (1 by default).', 'Try 0.5 and press <kbd>Shift</kbd> <kbd>E</kbd> again to see a softer edge.'],
        why: 'Creases keep the mesh light and easy to edit. Holding edges give more control and export to engines and other programs.',
        start: { kind: 'slab', mesh: 'slab', subsurf: { on: true, levels: 2 } },
        check: s => s.subsurf.on && s.mesh.f.length === 6 && cornerLoss(s.mesh, 2) <= 0.05,
        solve: s => { for (const [a, b] of edges(s.mesh)) s.mesh.crease[ek(a, b)] = 1; },
      },
    ],
  },
  {
    id: 'deform', name: 'Deformation', sub: 'Edge loops at the joint',
    steps: [
      {
        id: 'd1', title: 'Loops at the elbow',
        text: 'This arm bends at the elbow with an armature. Only one edge loop crosses the joint, so the elbow folds like a drinking straw. A joint needs at least three loops inside the bending zone (the yellow band) so the surface can curve.',
        how: ['Move the <b>Bend</b> slider to see the problem.', 'Press <kbd>Ctrl</kbd> <kbd>R</kbd> and cut loops across the arm inside the yellow band, on both sides of the joint.', 'You need 3 loops in the band, on both sides of the joint, no more than 0.3 m apart.'],
        why: 'Loops are the hinges of a model: where there is no loop, the surface can not bend.',
        start: { kind: 'arm', mesh: 'arm1', arm: { angle: 90, preserve: true } },
        check: s => armOk(s.mesh),
        solve: s => { s.mesh = cutArmAt(cutArmAt(s.mesh, -0.2), 0.2); },
      },
      {
        id: 'd2', title: 'Where it bends',
        text: 'This arm has plenty of loops, but none of them are at the elbow: they are wasted on the straight parts, and the joint is a long straight bridge. Do not add geometry: slide existing loops towards the joint.',
        how: ['<kbd>Alt</kbd>-click an edge of a ring to select the whole edge loop.', 'Press <kbd>G</kbd> then <kbd>X</kbd> to move it only along the arm, move the mouse and click.', 'Get 3 loops in the yellow band, on both sides of the joint, no more than 0.3 m apart. The number of loops must stay the same.'],
        why: 'Good topology puts the resolution where the shape changes: joints, eyes and mouth need loops; long straight parts need few.',
        start: { kind: 'arm', mesh: 'arm2', arm: { angle: 90, preserve: true } },
        check: s => armOk(s.mesh) && armInfo(s.mesh).rings === 8,
        solve: s => { const targets = { '-0.8': -0.3, '0.8': 0.3, '-0.6': -0.08, '0.6': 0.12 }; s.mesh.v = s.mesh.v.map(p => { const k = String(Math.round(p[0] * 10) / 10); return k in targets ? [targets[k], p[1], p[2]] : p; }); },
      },
      {
        id: 'd3', title: 'Preserve Volume',
        text: 'The loops are right, but Preserve Volume is off: the Armature modifier blends the positions of the two bones (linear blending), and the inside of the elbow collapses towards the centre. Preserve Volume blends the rotations instead, and the joint keeps its thickness.',
        how: ['Look at the <b>Joint volume</b> in the Statistics panel at 90°.', 'In the <b>Armature</b> modifier, tick <b>Preserve Volume</b>.', 'The joint volume must stay above 95%.'],
        why: 'Linear blending is fast but loses volume at twisting and bending joints (the “candy wrapper” effect). Preserve Volume uses dual quaternions.',
        start: { kind: 'arm', mesh: 'arm3', arm: { angle: 90, preserve: false } },
        check: s => armOk(s.mesh) && elbowVolume(s.mesh, 90, s.arm.preserve) >= 0.95,
        solve: s => { s.arm.preserve = true; },
      },
    ],
  },
  {
    id: 'retopo', name: 'Retopology', sub: 'A clean cage on a high poly',
    steps: [
      {
        id: 'q1', title: 'Fill the holes',
        text: 'Retopology is building a new, light, clean mesh on top of a dense sculpt or scan (the stone). Here the new mesh is almost finished, but three faces are missing. Create each face from its four corners.',
        how: ['In <b>Vertex</b> select mode, select the four vertices around a hole (click, then <kbd>Shift</kbd>-click).', 'Press <kbd>F</kbd> (<b>Fill</b>) to make a face.', 'Repeat for every hole: the Statistics panel must show 0 holes and only quads.'],
        why: 'A closed, all-quad cage can be subdivided, UV unwrapped and baked (the Baking Lab starts where this ends).',
        start: { kind: 'stone', mesh: 'holes', snap: true },
        check: s => { const st = stats(s.mesh); return st.holes === 0 && st.tris === 0 && st.ngons === 0 && st.faces === 54; },
        solve: s => { const full = quadStone(3); for (const i of STONE_HOLES) s.mesh.f.push([...full.f[i]]); },
      },
      {
        id: 'q2', title: 'Snap to the surface',
        text: 'Some vertices float above the stone and some sink into it: the low poly would not match the high poly and the bake would miss details. With snapping on (Face Project), moving a vertex projects it onto the surface of the high poly.',
        how: ['Turn on <b>Snap</b> in the header of the viewport.', 'Select the floating vertices (they are shown in red) and press <kbd>G</kbd>, then click: they land on the surface.', 'The largest distance to the surface must be under 1 cm.'],
        why: 'A cage that sits on the surface bakes cleanly with a small extrusion or cage.',
        start: { kind: 'stone', mesh: 'floating', snap: false },
        check: s => maxSnapError(s.mesh) <= 0.01,
        solve: s => { s.mesh.v = s.mesh.v.map(p => snapToStone(p)); },
      },
      {
        id: 'q3', title: 'Even density',
        text: 'Five vertices are bunched together, so some quads are tiny and others huge. Even quads subdivide, UV unwrap and deform predictably. Relax the bunched area and keep it on the surface.',
        how: ['Select the bunched vertices and their neighbours (or everything with <kbd>A</kbd>).', 'Use <b>Smooth Vertices</b> in the Tool panel a few times (with Snap on, they stay on the stone).', 'The ratio between the biggest and the smallest quad must be 4 or less.'],
        why: 'Density should follow detail, not accidents: more quads where the shape is complex, the same size elsewhere.',
        start: { kind: 'stone', mesh: 'bunched', snap: true },
        check: s => densityRatio(s.mesh) <= 4 && maxSnapError(s.mesh) <= 0.01,
        solve: s => { const all = [...new Set(s.mesh.f.flat())]; const r = smoothVerts(s.mesh, all, 0.5, 8); s.mesh.v = r.v.map(snapToStone); },
      },
    ],
  },
];

export const MESHES = {
  ngon: ngonPanel, tri: triPanel, bottle,
  pinched: pinchedSlab, slab: () => box(...SLAB),
  arm1: () => tube([-1.2, -0.6, 0, 0.6, 1.2]),
  arm2: () => tube([-1.2, -1, -0.8, -0.6, 0.6, 0.8, 1, 1.2]),
  arm3: () => tube([-1.2, -0.6, -0.2, 0, 0.2, 0.6, 1.2]),
  holes: stoneWithHoles, floating: stoneFloating, bunched: stoneBunched,
};
export function startState(step) {
  const s = defaultState();
  const { mesh, ...rest } = step.start;
  merge(s, rest);
  s.mesh = MESHES[mesh]();
  delete s.mesh.at;
  return s;
}
export { stats, cornerLoss, armOk, elbowVolume, maxSnapError, densityRatio, clone, edgeRing };
