# Edit Mode Lab · teaching notes

Lab 21, topic 00 (Blender basics). After the Viewport Lab. About 90–120 minutes.
Based on Joan Copla's Blender labs (https://joancopla.github.io/blender-lab/), reimplemented and adapted to Carrot Revolt Labs.

## Sequence

| Stage | Step | Goal | Keys |
|---|---|---|---|
| 1 Select in Edit Mode | Vertices, edges, faces | Tab, then each blue mark in its own select mode | Tab, 1/2/3 |
| | See through: X-ray | All 28 vertices with X > 0 of a 3×3×3 cube, nothing else | Alt Z, box |
| | Edge loops | Equator loop plus a second loop of a UV sphere | Alt click, Shift Alt click |
| 2 Shape the mesh | Deform | Top face up 1 m and scaled to 0.5 (truncated pyramid) | G Z 1, S 0.5 |
| | Extrude | An L: top face up 2 m, then the upper +X face 2 m | E 2 |
| | Inset and extrude inwards | Rim of 0.2 m, cavity 1.5 m deep | I 0.2, E -1.5 |
| | Loop cuts | Two loops, scaled 1.4 in X and Y (barrel) | Ctrl R, wheel, RMB, S Shift Z 1.4 |
| | Bevel | Four vertical edges, width 0.45–0.55 m, 4 segments | Ctrl B, wheel, Adjust Last Operation |
| 3 Clean and build | Clean a broken mesh | 8 vertices, 6 quads, no problems in the analyser | M › By Distance, X › Dissolve…, X › Faces/Vertices |
| | Final challenge: a stool | Clean mesh, seat ≥ 1.2 m, four separate legs ≥ 1 m | all |
| 4 Free mode | — | Model freely | all |

## Points to stress

- Delete leaves a hole; Dissolve removes and joins.
- Cancelling the move after E leaves the extruded faces on top of the old ones (as in Blender): the analyser shows duplicated vertices. Ctrl Z removes them.
- Without X-ray, a box only selects what you can see.
- The Adjust Last Operation panel is the precise way to finish a bevel or a loop cut.

## How the stool is checked

The mesh is cut with two horizontal planes (just above the lowest point, and 1 m below the top). Each cut must give pieces in the four corner quadrants and no piece that crosses the centre lines, each thinner than half the seat. The mesh must be closed, with outward faces, no duplicated or loose vertices.

A possible plan: S Z to flatten the cube, two Ctrl R cuts in each direction, select the four corner faces underneath, E and drag down.

## Differences with Blender

- Extrude works on faces only; Bevel works on separate edges whose ends have three edges (box corners).
- Inset is always "Individual" (the same as Blender's for one face).
- The object stays at the origin; Object Mode only selects.
