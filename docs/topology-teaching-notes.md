# Topology Lab — teaching notes

Explanations are in Catalan or Spanish. Blender's interface and operator names (Edit Mode, Loop Cut and Slide, Connect Vertex Path, Dissolve, Fill, Tris to Quads, Edge Crease, Subdivision Surface, Preserve Volume…) stay in English. The key names are also Blender's.

## The editor

A small Blender-style Edit Mode on meshes of 8 to 60 vertices.

- **Selecting**
  - Vertex, edge and face select modes (<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>). Switching mode converts the selection.
  - Click, Shift-click, and Alt-click for an edge loop. <kbd>A</kbd> selects all, <kbd>Alt</kbd><kbd>A</kbd> selects none.
- **Move**: <kbd>G</kbd> moves on a plane facing the view. <kbd>X</kbd> <kbd>Y</kbd> <kbd>Z</kbd> lock an axis. Click or Enter confirms; Esc or right click cancels.
- **Loop Cut and Slide** (<kbd>Ctrl</kbd><kbd>R</kbd>):
  - Hovering an edge previews its ring (yellow), at the mouse position along the edge.
  - A click cuts there.
  - The ring stops at triangles, n-gons and borders. The new vertices are inserted into those end faces.
- **Other operators**:
  - Connect Vertex Path (<kbd>J</kbd>, two vertices of one face).
  - Dissolve Vertices or Edges (<kbd>X</kbd>). Vertices left with two edges are removed.
  - Fill (<kbd>F</kbd>, 3 or 4 vertices, facing outwards).
  - Tris to Quads (<kbd>Alt</kbd><kbd>J</kbd>, on the selected faces).
  - Edge Crease (<kbd>Shift</kbd><kbd>E</kbd>, with the value from the Tool panel).
  - Smooth Vertices.
- **Subdivision Surface**: Catmull-Clark, with levels 1–3 (<kbd>Ctrl</kbd><kbd>1</kbd>–<kbd>3</kbd>, <kbd>Ctrl</kbd><kbd>0</kbd> off).
  - Borders and creased edges use the crease rules.
  - A fractional crease blends the smooth and the sharp rules, and gets weaker at every level. This is a simplification of Blender's semi-sharp creases.
  - The cage is drawn semi-transparent over the result.
- **Armature** (arm): one bend around the elbow with smooth automatic-like weights (a blend over ±0.35 m).
  - Linear blending by default. Preserve Volume turns each vertex by weight × angle, as dual quaternions do for a single hinge.
  - The cage stays at rest and the result is bent, like Blender with On Cage off.
- **Overlays**: Face types (quads grey, triangles yellow, n-gons red) and Poles (3 edges blue, 5+ edges orange). The Statistics panel counts everything.

## Stages and checks

| Step | Model | Check |
|---|---|---|
| r1 No n-gons | Panel with two hexagons | no n-gons and no triangles (J between opposite vertices) |
| r2 Triangles into quads | Panel with five split quads | no triangles (Dissolve Edges or Alt J) |
| r3 Find the poles | Bottle with a 5-quad cap | the selection is exactly the 6 poles (1 E-pole, 5 N-poles) |
| s1 Pinches | Box with an extra vertex on an edge (two pentagons) | all quads again (Dissolve Vertices), subdivision on |
| s2 Holding edges | Box, subdivision level 2 | all quads, corners within 12% of the thickness at level 2 (six loops) |
| s3 Crease instead | Same box | still 6 faces, corners within 5% (crease the edges) |
| d1 Loops at the elbow | Arm with one loop at the joint | ≥ 3 loops in the ±0.4 m zone, on both sides, ≤ 0.3 m apart |
| d2 Where it bends | Arm with loops far from the joint | the same, with the same number of loops (slide them with Alt-click + G X) |
| d3 Preserve Volume | Good arm, linear blending | joint volume at 90° ≥ 95% |
| q1 Fill the holes | Quad cage on a stone with 3 holes | 0 holes, 54 quads |
| q2 Snap to the surface | Cage with 6 vertices off the surface | every vertex within 1 cm of the surface |
| q3 Even density | Cage with 5 bunched vertices | biggest / smallest quad ≤ 4, still on the surface |

- **Corner loss**: the distance from each corner of the original box to the nearest vertex of the level-2 subdivision, divided by the thinnest size of the box. The plain box loses 88%, holding edges at 8% of each side give about 7%, and crease 1 gives 0%.
- **Joint volume**: the smallest distance from a vertex in the zone to the elbow, relative to its distance at rest. Linear blending gives about 71% at 90°; Preserve Volume keeps 100%.
- **Retopology**: the stone is a smooth radial surface. Snapping projects vertices radially onto it (a simplification of Face Project). The cage starts as a quad sphere with 3 × 3 quads per side.

## Teaching points worth stopping on

- **r3**: poles are not errors. The skill is placing them. Ask where the loops go around the cap.
- **s1 and s2**: turn Face types and the subdivision on and off to see where pinches come from. Holding edges also show why n-gons and triangles break loops: a loop cut stops at them.
- **s3**: crease 0.5 shows semi-sharp edges. Discuss what exports to game engines (geometry does, creases usually do not).
- **d1 to d3**: bend to 90° and 120° with the slider. Three loops, placed where the skin bends, matter more than many loops elsewhere. Preserve Volume fixes a different problem, the collapse of linear blending.
- **Retopology**: link it to the Baking Lab. This clean cage is the low poly that receives the details of the stone.
