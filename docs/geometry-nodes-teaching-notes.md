# Geometry Nodes Labs · teaching notes

Four labs, topic 05 (Geometry Nodes) of the Blender area. About 60–75 minutes each. After the Viewport and Edit Mode labs.
First version made for CIFOG Lab; rebuilt for Carrot Revolt Labs with a Blender-style workspace, a real mesh interpreter and live checklists.

## The workspace

The page copies Blender's **Geometry Nodes** workspace: Spreadsheet (top left), 3D Viewport (top right), Geometry Node Editor (bottom), Outliner and Properties › Modifier (right).

- Nodes use Blender's header colours (Geometry green, Input red, Converter blue, Vector violet, Output dark red), socket colours per data type, and the three socket shapes: circle (single value), diamond (field), diamond with a dot (accepts a field, holds a single value now). Field wires are dashed; a field into a single-value socket draws a red wire and a warning on the node.
- Interaction as in Blender: drag to connect, drag a connected input away to pick up its wire, drop a wire on empty space for the link-drag search, **Shift A** with search, drop a node on a wire to insert it, **Ctrl Shift click** for the Viewer (again to cycle outputs), **Ctrl RMB** to cut, **M** mute, **X / Ctrl X**, **G**, **Shift D**, **Home**, **N** (Node with a description of each node, Group with the interface to rename exposed inputs), box select, MMB or Alt LMB to pan, wheel to zoom, Ctrl Z.
- **Hover any socket** to inspect it (mesh vertex/edge/face counts, points, instances, a value, or the inputs a field depends on and its first values).
- Number fields drag sideways, click to type, Ctrl for round steps. Expose inputs by dragging them to the empty socket of Group Input; they appear in Properties › Modifier.
- The Spreadsheet has the Mesh (Vertex, Edge, Face, Face Corner), Curve (Control Point, Spline), Point Cloud and Instances domains, and Evaluated / Original / Viewer Node.
- The viewport counts real data (Statistics overlay) and colours the Viewer's field values.

## Sequence

| Lab | Steps | Main idea |
|---|---|---|
| GN 01 Geometry flow (object Cube) | connect Group Input → Output · Transform Geometry on the wire · a Cube primitive + Join Geometry · a table from 5 cubes (one leg cube, four transforms) · the Viewer · expose the tabletop Size | the tree builds the evaluated mesh; the object and its original mesh stay; data flows left to right |
| GN 02 Fields (object Plane) | Grid 6 × 6 m, 12 × 12 in the Spreadsheet · Index in the Viewer · Index wave with Set Position · sin(X)·cos(Y) with Position (try the red link) · Normal × height with Vector Math Scale · expose Height | a field is a recipe evaluated per element by the node that uses it; context |
| GN 03 Scatter (object Terrain = the GN 02 terrain) | Distribute Points on Faces (Density, Seed) · Collection Info + Instance on Points + Join with the terrain · Separate Children, Reset Children, Pick Instance · Random Value for Scale and Rotation · Position Z > 0.1 as Selection, expose Density · Realize Instances and back | instances are references plus a transform; the classic Collection Info trio |
| GN 04 Curves (object Fence, empty) | Curve Line in the Spreadsheet · Curve Circle profile with Curve to Mesh · posts with Curve to Points + Instance on Points (move the cube up before instancing) · lift only the rail · Quadratic Bézier for both branches · expose Bend, Posts, Rail Radius | one curve feeds two branches; where a node sits decides what it affects; a reusable asset |

Each step shows the task, **what is happening**, how to do it with Blender's menus and keys, a note on real Blender, and a **checklist** that updates as students work (optional items are marked). A step is done when its required items are ticked; *Show a solution* and *Reset this step* are always there.

## Typical difficulties

- Instance on Points outputs only instances: the terrain disappears until it is joined again.
- Each point receiving the whole collection (Separate Children off) and rocks floating away (Reset Children off).
- Expecting Index to follow space: the wave runs along the vertex order.
- Cubes are centred on their origin: posts and legs must be moved up half their height.

## Not included

A learning subset: Cube has no Vertices X/Y/Z, Distribute only uses Random, no Capture Attribute, Store Named Attribute, node groups inside groups, frames or reroutes. The interpreter is `labs/gn-shared/core.js` (no DOM), the lessons `curriculum.js`, the texts `docs.js`; tests in `tests/geometry-nodes.test.mjs` check that every solution passes and no step starts done.
