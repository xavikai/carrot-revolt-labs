# Viewport Lab · teaching notes

Lab 20, topic 00 (Blender basics). For the first session with Blender. About 60–90 minutes.
Based on Joan Copla's Blender labs (https://joancopla.github.io/blender-lab/), reimplemented and adapted to Carrot Revolt Labs.

## Sequence

| Stage | Step | Goal | Keys |
|---|---|---|---|
| 1 Look around | Orbit around the cube | See three marks: back, left side, underneath | MMB, Alt LMB, gizmo |
| | Pan and zoom | A far sphere centred and filling ¼ of the view height (Numpad . is off) | Shift MMB, wheel, Ctrl MMB |
| | Frame what you need | Select the Cone, Numpad ., then Home | Numpad ., Home, Outliner |
| | Front, Right, Top, Back | The four views in order | Numpad 1/3/7, Ctrl, Numpad 9, gizmo, ` pie |
| 2 Select and transform | Select three spheres | Only the spheres, Sphere.001 active | click, Shift click, B, A, Alt A |
| | Move to the silhouettes | 10 cm; Cube.001 only along Z (X and Y exactly the same) | G, X/Y/Z, Shift Z, RMB |
| | Exact values | G Z 2, R Z 45, S 1.5 exactly; read them in the N panel | typed values, N, Ctrl snap |
| 3 Cancel, undo, challenge | Cancel and undo | Cancel a transform, then undo three steps of history | RMB/Esc, Ctrl Z, Undo History |
| | Final challenge | Four silhouettes, no hints (symmetric shapes are matched by their symmetry) | all |
| 4 Free mode | — | Add, duplicate, delete, build | Shift A, Shift D, X, Alt G/R/S |

## Points to stress

- The view is not the scene: orbit/pan/zoom never change the objects.
- Keys go to the editor under the mouse, as in Blender.
- Axis views turn Orthographic by themselves (Auto Perspective) and go back to Perspective when you orbit.
- Cancel (RMB, Esc) stops a transform in progress; Ctrl Z takes back a confirmed one.
- Typed values are exact; the mouse is not. The N panel shows the result.

## Laptops

No middle button: Alt + LMB orbits (Emulate 3 Button Mouse in Blender's Preferences). No numpad: the gizmo, View › Viewpoint, the ` pie, or Emulate Numpad (switch in the lab header). In a browser, Ctrl + a number may change the tab: then use Numpad 9 (opposite view).

## Differences with Blender

- Selection changes are not undo steps here (they are in Blender).
- A single collection; no hide (H) or parenting.
- Constrained scale of a rotated object uses the object's closest local axis.
