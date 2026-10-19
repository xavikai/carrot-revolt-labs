# Outliner Lab — teaching notes

Explanations are in Catalan or Spanish; Blender interface names stay in English (Outliner, View Layer, Move to Collection, Remap Users, Purge…) so students find the same words in Blender 4.x.

## What the lab models (outliner.js, tested)

| Topic | Model |
|---|---|
| Collections | A tree under the Scene Collection. An object can be in several collections: Move (M, drag) takes it out of all the others, Link (Shift M, Ctrl drag) adds one more, unlinking from the last one is refused. A collection cannot be nested in itself or its children. |
| Names | Blender's `.001` rule, separately for objects, collections and each kind of data-block (a Collection Instance can be called like its collection). |
| Exclude (checkbox) | The collection is out of the view layer: not drawn, not rendered. |
| Hide in Viewport (eye) | Hidden in the viewport, still rendered. Ctrl click isolates a collection (its parents and children stay visible), Shift click also sets everything inside. H / Alt H on objects. |
| Disable in Viewports / Renders | Monitor and camera, on collections or objects. The camera render preview uses Disable in Renders and Exclude, not the eye. |
| Selectable | Off on an object or any collection on its path: viewport clicks go through it (and the status bar says so). |
| Visibility of a linked object | Visible if at least one of its collections is visible all the way up to the Scene Collection. |
| Holdout | Objects render as the background colour. Indirect Only is shown but has no visible effect (Cycles only). |
| Collection Instance | An Empty at the 3D cursor, in the active collection, drawing its collection with the offset (location − Instance Offset), even when that collection is excluded. |
| Users | Materials: objects using them; images: materials using them; meshes: objects. An unused material still counts as a user of its image. Fake User adds one. |
| Purge | Deletes every data-block with 0 users and no Fake User; Recursive repeats until nothing new becomes unused (M_Old → T_Old). |
| Rows | View Layer (with Filter: collections, objects, Object State, Object Contents with mesh and material rows, Object Children, types, Sort Alphabetically), Blender File (by type, with users and Fake User) and Unused Data. Search keeps the matches and the rows on the way to them (Exact Match, Case Sensitive). |

Simplifications: one view layer and one scene; no Scenes, Video Sequencer, Data API or Library Overrides modes (they appear greyed); parenting by drag is not modelled; the viewport is Solid shading with material colours and the render preview is a real-time approximation.

## Stages and checks

| Step | Start | Check |
|---|---|---|
| k1 Sort the level | Everything loose in the Scene Collection, plus an empty "Collection" | The floor, walls and door under Architecture; crates, barrels, chest and torches under Props; the three lights under Lights; none left in the Scene Collection |
| k2 Collections inside collections | Architecture, Props, Lights done | Crates and Barrels are inside Props and hold only the crates / barrels |
| k3 One object, two collections | Tidy level + Export_Props with an FBX exporter | Chest in Props and in Export_Props, no Chest.001 |
| k4 A collection instance | Torch_Kit (torch + light) at the origin, markers Mark_L / Mark_R | Two visible instances of Torch_Kit at the markers (±5 cm) and Torch_Kit excluded |
| v1 Hide, disable or exclude | Tidy level; collision and high poly render (green walls in the preview) | Collision visible but not rendered, Reference neither visible nor rendered, HighPoly excluded, the level still renders |
| v2 Hands off the walls | Tidy level, Selectable column hidden | Architecture visible and unselectable, props selectable |
| v3 Isolate the lights | Tidy level | The lights visible, architecture, props, collision and gameplay hidden |
| s1 Find them by name | Five `_High` objects in Crates, Props, Barrels, Architecture and Lights | The five only in HighPoly |
| s2 Only the lights | Five lights in Props, Gameplay, Architecture and the Scene Collection | All five only in Lights |
| s3 What is inside an object | Barrel.001 with M_Placeholder (pink in the render) | M_Placeholder has 0 users and Barrel.001 uses M_Wood |
| d1 Blender File: one wood, not three | Crate.001 and Crate.002 use M_Wood.001 / .002 | The three crates use M_Wood; the copies have 0 users |
| d2 Unused Data: purge | Unused: M_Wood.001, M_Wood.002, M_Old (→ T_Old), M_Gold, Cube.004, M_Library (Fake User) | Only M_Library left unused, T_Old and M_Wood.001 gone |

## Ideas for class

- Before v1, ask what each toggle will do to the render preview, then try it. The eye is the most common mistake: it does not change F12.
- In k3, rename the chest in one collection and watch it change in the other: there is only one object.
- In k4, change Torch_Kit (move the light in the kit, or its Instance Offset in the Collection tab) and see both torches change.
- In d2, turn Recursive off and purge twice: the first purge frees T_Old, the second deletes it.
- Follow-ups noted for future labs: render passes and render layers (view layers use the same Exclude / Holdout / Indirect Only toggles).
