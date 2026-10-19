# Export Lab — teaching notes

Explanations are in Catalan or Spanish; Blender and Unity interface names stay in English (Apply Scalings, Bake Axis Conversion, Set Origin, Mesh Collider…) so students find the same words in both programs. The Unity names are Unity 6's.

## What the lab models (xport.js, tested)

| Topic | Model |
|---|---|
| Axes | Blender (x, y, z) → Unity (−x, z, −y) with -Z Forward, Y Up. Other Forward/Up values turn the model over. |
| Rotation X −89.98 | Without Bake Axis Conversion (Unity) or Apply Transform (Blender), the mesh keeps Blender's local axes and each root object gets a −90° X rotation (shown as −89.98, as Unity does). |
| Scale 100 | Apply Scalings All Local writes centimetres and a root scale of 100; Convert Units shrinks the data by 0.01. The model looks right but its Transform says 100. Without Convert Units it is 100 times too big. FBX Units Scale and FBX All keep 1. |
| Unapplied transforms | Object Mode rotation and scale go to the Unity Transform (scale axes Y and Z swapped). Ctrl A moves them into the mesh. |
| Origin | The origin is the Unity pivot and the prefab's position. Set Origin keeps the mesh in place and moves the origin. |
| Include | Selected Objects, Visible Objects and Object Types decide which objects reach the Hierarchy. |
| Normals | Flipped faces are invisible in Unity (back-face culling). |
| Modifiers | Without Apply Modifiers Unity gets the raw mesh: a half barrel without bevel, and without Smooth by Angle all edges smooth. |
| Materials | Only Image Textures plugged into the Principled BSDF travel; procedurals are lost. Images arrive with Path Mode Copy + Embed Textures. Embedded materials are read-only until Extract Materials; the normal map needs Fix Now (Texture Type Normal map). |
| Rig | Leaf bones (_end), control bones (IK_, Pole_, Root) and Apply Transform are issues; the Humanoid avatar is valid with the standard bones and no Apply Transform. |
| Clips | Bake Animation with All Actions exports every action (named Armature|Action); without All Actions and NLA only the active one. Loop Time per clip. |
| Colliders | Box Collider = bounding box; convex Mesh Collider = convex hull (here the bounding box); non-convex = the exact parts. A non-convex Mesh Collider on a non-kinematic Rigidbody logs Unity's error and does nothing. Balls: one released above the table, one under it. |

Simplifications: the models are made of boxes and cylinders; the convex hull is the bounding box; the Play tests are scripted (no real physics engine); Apply Unit and scene Unit Scale are not modelled (the scene is always in metres).

## Stages and checks

| Step | What the student does | Check |
|---|---|---|
| x1 Lying on its back | Apply Scalings FBX Units Scale, Bake Axis Conversion | Crate: Rotation 0 0 0, Scale 1 1 1, 0.8 m |
| x2 Apply rotation and scale | Ctrl A › Rotation & Scale, export | Barrel: clean Transform, 0.6 × 0.9 m |
| x3 Real size | Uniform Scale ≈ 0.09, Apply Scale, export | Lamp 1.5–1.9 m tall, proportions kept, clean Transform |
| o1 The door that spins | Vertex → Cursor to Selected → Origin to 3D Cursor | Door origin on a bottom corner (x ±0.45, z 0) |
| o2 Sitting on the floor | Clear Location, Z 0.45, Cursor to World Origin, Origin to 3D Cursor | Unity position 0, bottom at y 0, centred |
| f1 Only what you need | Selected Objects / Visible Objects, Object Types Mesh | Only Crate in the Hierarchy |
| f2 Holes in the model | Face Orientation, Recalculate Outside | No flipped faces in the file |
| f3 Modifiers and smoothing | Apply Modifiers, Smoothing Face | Final mesh exported, Smoothing Face |
| m1 Textures that arrive | Bake roughness, Path Mode Copy + Embed, Extract Materials, Fix Now | Base, normal and roughness arrive; material editable |
| a1 A clean skeleton | No Apply Transform, Only Deform Bones, no Leaf Bones, Humanoid | No rig issues, valid avatar |
| a2 One clip per action | Delete Walk.001 and ArmatureAction, Loop Time | Clips Idle, Walk, Run, all looping |
| c1 A crate that falls | Generate Colliders off, Box Collider | Box Collider + Rigidbody, no errors |
| c2 A table the ball rolls under | Collision boxes (top + 4 legs), convex Mesh Colliders, renderers off | Ball under the table reaches the floor; ball on top stays at 0.75 m |

Every step has a solution button; the tests check that each step starts unsolved and that its solution solves it.

## Teaching points worth stopping on

- **x1**: edit the Unity Transform of the crate to Rotation 0: it lies on its side. The problem is in the file, not in the instance.
- **x3**: typing only Dimensions Z squashes the lamp; ask why Blender changes one scale axis.
- **o1 / o2**: the 3D cursor is the tool that makes origins precise.
- **f3**: in Blender 4.1+ Auto Smooth became the Smooth by Angle modifier, so it needs Apply Modifiers too.
- **m1**: URP uses Smoothness = 1 − Roughness in the alpha of the Metallic map; a real project packs it.
- **c2**: one object with four legs is a single convex block again; each convex piece must be its own object. In studios an AssetPostprocessor script turns *_COL objects into colliders automatically.
