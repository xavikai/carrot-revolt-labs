# Skin Weights Lab — teaching notes

The interface uses Blender's English names (Weight Paint, Vertex Groups, Auto Normalize, X-Mirror, Normalize All, Limit Total…) so students find the same words in Blender. Explanations can be switched to Catalan or Spanish.

## What the lab models

- **Linear blend skinning**, like Blender's Armature modifier: each vertex moves to the weighted average of where each bone would take it. The total is normalized at deform time, and a vertex with no weight at all stays where it was (in Blender too).
- **Automatic weights**: Blender uses "bone heat". The lab uses inverse distance to each bone, which gives the same kind of soft blend around the joints. It is a good start, never the end.
- **Weight ramp**: blue 0 · cyan · green 0.5 · yellow · red 1, for the active vertex group only.
- **Brushes**: Draw with Mix, Add or Subtract, and Blur. The radius is measured in screen pixels, with a smooth falloff. Front-Face Only skips the vertices facing away, so students must orbit (MMB) to paint the back.
- **Auto Normalize**: the active group keeps the value you paint and the other groups of that vertex share the rest. A vertex that belongs only to the active group stays at 1, as in Blender. That is why blurring the Forearm cannot lower the Forearm side: you must also blur the UpperArm group.
- **X-Mirror**: each stroke is repeated on the mirrored vertex, in the group with the opposite name (.L ↔ .R).
- **Weights menu**:
  - Normalize All.
  - Mirror: the lab copies the active group onto the other side, into the mirrored group. In Blender, mask the vertices of the good side and use Mirror with Flip Group Names.
  - Clean (Subset, Limit).
  - Limit Total (Limit).
  - Smooth (Subset, Factor, Iterations).
  - Assign Automatic from Bones.
  
  After an operator, the **Adjust Last Operation** panel re-runs it with new values, like F9 in Blender.

## How to use it in class

- Rule number one: **pose while you paint**. Most problems (stray weights, zero weights, a hard elbow) are invisible in the rest pose. Rest Position shows the rest pose without losing the pose values.
- Ask students to hover a vertex and read the weights under the cursor: they should always add up to 1.
- Show Zero Weights › Active or All: black vertices have no weight.
- "Show a solution" loads one possible answer; Ctrl Z brings the student's weights back.

## Stage 1 · Automatic weights

1. **Weights from the bones**: the arm has empty groups, so bending does nothing. Ctrl P › With Automatic Weights.
2. **Read the gradient**: select the Forearm group (Ctrl-click the bone) and bend at least 60°.
3. **Twist it**: 120° of twist shows the candy-wrapper collapse of linear blend skinning. Riggers add twist bones for this. Alt R clears the pose.

## Stage 2 · Fix the elbow

The weights start with a hard edge at the joint and the elbow already bent 70°.

1. **A soft elbow**: with Auto Normalize on, blur the Forearm group (the gradient grows towards the shoulder), then the UpperArm group (it grows towards the hand). Weights › Smooth with All Groups also works.
2. **Add up to 1**: Normalize All. If students blurred with Auto Normalize off, Normalize All gives the Forearm-only side back its 1. This is a good moment to discuss why Auto Normalize matters.

## Stage 3 · Find the problems

Two arms and a chest with automatic weights, damaged on purpose.

1. **Vertices with no weight**: a patch on Forearm.L. Use Zero Weights › All and paint it with Forearm.L active; orbit to reach the back.
2. **A stray weight**: UpperArm.L has weight on the .R arm. Subtract it and bend UpperArm.L to test.
3. **Make it symmetrical**: the .R elbow has a hard edge. Mirror UpperArm.L, Forearm.L and Chest (or paint with X-Mirror). The symmetry error must be close to 0.

## Stage 4 · Game ready

Weights with too many influences and tiny values, as a soft brush leaves them.

1. **Limit Total** 2: Unity can use 1, 2 or 4 bones per vertex; many mobile games use 2.
2. **Clean** with Subset All Groups and Limit 0.05.
3. **Normalize All**, then check the four numbers: max influences 2, tiny 0, not normalized 0, zero 0.

## Checklist before exporting a character

- Apply the scale of mesh and armature, and name the bones .L / .R.
- Parent With Automatic Weights, then fix the joints with Blur and poses.
- No zero-weight vertices, no stray weights, symmetry checked.
- Limit Total (engine limit), Clean, Normalize All.
