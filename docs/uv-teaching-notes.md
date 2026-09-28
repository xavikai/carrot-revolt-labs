# UV Unwrap Lab — teaching notes

The lab uses English face and tool names and the layout of Blender's **UV Editing** workspace: UV Editor on the left, 3D Viewport on the right, an Edit Mode header on top and a status bar at the bottom that always lists the keys that work right now. Keys go to the editor under the mouse pointer, as in Blender.

A rigid paper cube is the first example: each colored square in the UV Editor is exactly one square on the 3D cube.

1. **Read the map.** Click **Front** in the UV Editor. A dashed outline appears on the same face in the 3D Viewport. Red edges are seams; dark edges are joined. Hover a red edge on the cube: it lights up twice in the UV Editor, once on each side of the cut.
2. **Blender workflow.** Turn **Live Unwrap** off. Press **2** (Edge Select), click an edge, Shift + click another, then press **U › Mark Seam** (or **Ctrl E**, or right-click). The UV map is now marked *out of date*. Press **U › Unwrap**. This is the exact sequence students will use in Blender.
3. **Live Unwrap.** Turn it back on and mark or clear seams: the map updates immediately. In Blender this option lives in the UV Editor's UV menu.
4. **Face Select.** Press **3**, click the Top face and **Mark Seam**: the seam goes around the selection, so the top becomes its own island.
5. **Unfold.** Press **Unfold** (lab view) with the cube or the chair. Every face turns about the edge it shares with its neighbour and lands exactly where the UV Editor puts it: the UV map *is* the unfolded surface. With the chair, each part opens on its own and small parts land small.
6. **Closed shapes.** Choose **No cuts**. The cube cannot lie flat, and the lab says why. Mark edges until the loop opens. 
7. **Object vs Edit Mode.** Press **Tab**. The UV Editor goes blank because Blender only shows UVs in Edit Mode.
8. **Chair.** Six separate box parts give six or more islands of very different sizes. Try **Display Stretch › Area**, then **Average Islands Scale** and **Pack Islands** (Ctrl A / Ctrl P with the mouse over the UV Editor).

The **Quick Seam** tool (left toolbar) toggles a seam with one click. It is useful on tablets and for quick exploration, and the lab states that Blender has no such tool. **Cube Projection** in the U menu ignores seams, which is also true in Blender.

The [Blender manual](https://docs.blender.org/manual/en/latest/modeling/meshes/uv/unwrapping/seams.html) explains that seams guide the unwrap and that the UV map is discontinuous at seams. The lab uses a paper cube, so it treats a connected loop or overlap as an invalid net; Blender can unwrap more complex surfaces by allowing distortion, and it only unwraps the selected faces (press **A** before **U › Unwrap**).

## Apply Scale: when UVs and model don't match

The 3D faces now use a real texture painted from the UV map, with a checker that is square in UV space (like Blender's UV Grid). Anything that makes the UV proportions differ from the model shows up as rectangles on the model.

Use **Set up the stretched cube** (below the workspace). The cube has Object scale X = 2 that was never applied, so Unwrap reads the original cube: the islands are squares, the checker is stretched on the model and the status bar shows Blender's warning *"Object has non-uniform scale, unwrap will operate on a non-scaled version of the mesh"*. **Unfold** makes it visible: the flat pieces follow the mesh data, so the proportions change as it opens.

Fix it as in Blender: **Tab** (Object Mode) › **Ctrl A › Scale**. The Transform panel returns to 1, 1, 1 and the cube keeps its shape, because the scale is now baked into the mesh data. The UVs do not change by themselves (the UV Editor marks them out of date), so **Tab › U › Unwrap**. The checker is square again.

In Object Mode students can also scale with **S**, optionally **X / Y / Z**, a number and **Enter**, or type values in the Transform panel (Blender's N panel).
