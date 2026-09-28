# Rig Lab — teaching notes

The interface uses Blender's English names (Pose Mode, Bone Constraints, Inverse Kinematics, Chain Length, Pole Target, Pole Angle, Influence…) so students find the same words in Blender. Bone names stay in English too. Explanations can be switched to Catalan or Spanish.

## What the lab models

- **Pose Mode**: bones are selected with LMB (Shift to add; the last one is the active bone), rotated with R and moved with G.
  - After R or G, X/Y/Z pick a global axis; the same key twice picks the bone's own axis, as in Blender. Typed numbers give exact values.
  - Connected bones can only rotate. The Thigh, the Shoulder and the Chest are also locked in location in this lab.
- **Bone space**: the Transform panel shows location and XYZ Euler rotation in the bone's own axes, as Blender's N panel does in Pose Mode.
  - With roll 0, a horizontal bone has its Z axis up and a vertical bone has its X axis along world X, as in Blender.
  - The coordinates shown to students follow Blender's axes (Z up).
- **FK**: every bone inherits the transform of its parent.
- **IK constraint** (on the Shin): the tip of the chain reaches the head of the target bone.
  - Two bones are solved exactly.
  - Without a pole, the chain bends the way it is already bent in the rest pose (Edit Mode). A leg modelled perfectly straight gives no hint: the solver falls back on the bones' X axis and the knee goes backwards. That is the classic problem, and the reason rigs bend the knee slightly in Edit Mode.
- **Edit Mode** (Tab, leg only): the bones go back to their rest position and the joints appear. Only the knee joint can be selected and moved, along Blender's Y (G Y, −Y is the front). The bend is stored as `knee` in the state and rebuilds the rig; bones within 10° of vertical keep the vertical roll rule, so the bend does not change their roll.
  - With a pole, the root bone's X axis turns towards the pole target, then by the Pole Angle. For this leg the knee points at the pole with -90°, the typical value in Blender. The right value depends on the roll of the bones.
  - Chain Length 0 means every parent up to the root, so the Hips rotate too.
  - Influence blends the FK and the IK rotations.
  - Chains of 1 or 3+ bones are solved iteratively (CCD). Blender's solver differs in detail but behaves the same way for teaching.

## How to use it in class

- Start with the difference: in FK you rotate from the root to the tip; in IK you place the tip and the solver rotates the chain.
- Encourage typed transforms (R X X 45 Enter): they are precise and are how riggers work in Blender.
- Keep Relationship Lines on: the dashed yellow line goes from the chain tip to the IK target, and the grey one from the knee to the pole.
- "Show a solution" loads one possible answer; Ctrl Z brings the student's pose back. Each step loads its own starting pose.

## Stage 1 · Forward kinematics (arm)

1. **Parents move their children**: rotate the UpperArm (the Forearm and the Hand follow), then the Forearm.
2. **Copy the pose**: match a ghost (a wave), from the root to the tip. The elbow, the wrist and the fingertips must be within 0.25 m.
3. **Keep the hand on the cup**: twist the Chest 25° and bring the fingertips back to the cup with FK rotations only. This motivates IK.

## Stage 2 · Inverse kinematics (leg)

1. **Add the IK constraint**: moving IK_Foot moves only the foot (it is parented to the control). Add IK to the Shin with target IK_Foot, from Add Bone Constraint or with Shift I › To Active Bone, then set Chain Length 2.
2. **A slight bend**: the foot is lifted and the straight leg bends its knee backwards. Tab into Edit Mode, click the knee joint, G Y -0.05, Tab back: the knee bends forward (check: bend 2–20 cm forward and the knee points forward).
3. **Point the knee**: the knee bends forward but nothing controls where it points. Set Pole Target Knee_Pole. The knee then points sideways; Pole Angle -90° makes it point forward.
4. **Crouch with the foot planted**: G Z -0.5 on the Hips keeps the foot on the floor. G X 0.8 on the Knee_Pole points the knee outwards (15°–50°).
5. **IK or FK: Influence**: 0 gives the FK leg back, 1 gives the IK back. This is the basis of an IK/FK switch.

## Ideas to extend

- Limit Rotation on the knee; a reverse-foot setup; a second leg with .L/.R names and mirroring.
- Stretch and bone scale.
- An IK/FK switch on an arm with a custom property.


## Stage 3 · Pole without jumps (crooked leg, roll, IK/FK)

Why knees jump, and how to fix it:

| Step | Setup | Check | The fix in Blender |
|---|---|---|---|
| p0 Why the knee moves: a circle | Crooked leg, crouched (Hips −0.5 m), pole straight in front | knee ≥ 80° away from its modelled direction | Hip and foot are fixed, so the knee can only swing on a circle around the hip–ankle line (white ring). The pole chooses the point: orange dot = knee with IK, green dot = modelled direction. Compass analogy. |
| p1 Put the pole where the knee points | Leg modelled with the knee bent 30° outwards; pole straight in front | knee jump when the IK turns on < 1 cm, pole < 3° off the plane | Put the pole in the plane hip–knee–ankle, in front of the knee (snap the 3D cursor to the knee, move along the knee direction). A green dashed line shows that direction. |
| p2 Roll the bones with the knee | Pole in the plane, roll 0 | Thigh twist when the IK turns on < 3°, Pole Angle still −90 | Give the leg bones the roll of the knee (Bone › Roll, or Armature › Bone Roll › Recalculate Roll). Fixing it with the Pole Angle moves the knee instead. |
| p3 IK to FK without a pop | Crouched with IK; FK rotations still at rest | Influence ≤ 0.05 and knee pop < 2 cm, after Apply › Visual Transform | Snap FK to IK before switching (Pose › Apply › Visual Transform, or the snap buttons of Rigify-style rigs with separate IK and FK chains). |

- The golden test for any IK leg: in the rest pose, turning the IK constraint on must not move anything. If the knee moves, the pole is off the plane; if the leg twists, the roll (or the Pole Angle) is wrong.
- Model legs with a slight bend at the knee in the direction it will bend, and keep the knee in a clean plane. If the mesh is crooked, the bones must follow the crooked plane, not the world axes.
- The lab's solver now bends the knee towards −Z of the root bone, as Blender does, so roll 0 and Pole Angle −90° give no twist on a leg whose knee points forward. The mesh pieces keep their rest orientation when the roll changes, and an orange kneecap shows any twist.
- The leg in p0–p2 is crouched so the knee circle is big and the 30° error is easy to see; the checks still measure the rest pose (knee jump and twist when the IK turns on).
