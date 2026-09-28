# Animation Lab — teaching notes

The interface uses Blender's English names (Graph Editor, Timeline, Keyframe, Bezier, Vector, Maintain Volume…) so students find the same words in Blender. Explanations can be switched to Catalan or Spanish.

## How to use it in class

- Keep the **Motion Path** on: one dot per frame. Close dots = slow, far dots = fast. It is the quickest way to *see* spacing.
- Ask students to predict what a change will do before playing (Space): "If I make this handle longer, where will the dots bunch?"
- Link every curve shape to a motion: flat = stopped, steep = fast, sharp V = impact, rounded top = hang time.
- Each step is checked automatically. "Show a solution" loads one possible answer, and Ctrl Z brings the student's version back.

## Stage 1 · Timing

1. **Ease in and out** — Linear keys look robotic; T › Bezier eases the tops.
2. **Hit the ground hard** — Auto Clamped handles also flatten the contacts (the ball sticks to the floor); V › Vector makes a sharp V.
3. **Lose energy** — every bounce lower.
4. **Faster bounces** — every bounce shorter (the frame counts are drawn under the contacts). G then X moves keys only in time.

## Stage 2 · Squash & Stretch

The ball uses the class rig:
- **Root**: the base of the ball, at the floor.
- **SS_Top**: moves the top of the ball. The pivot is at the base, so the ball stays on the floor.
- **SS_Bottom**: moves the bottom of the ball. The pivot is at the top.

The rig keeps the volume: a shorter ball gets wider. Students pose the controls in the 3D Viewport with G (up and down only; typed values work) and key them with I. An unkeyed pose is lost when the frame changes, as in Blender.

1. **Squash on contact**: SS_Top ≈ -0.4 m at the first two contacts. The base must stay on the floor.
2. **Stretch before and after**:
   - Before the contact (frame 11), SS_Bottom goes down ≈ 0.25 m: the ball reaches for the floor.
   - At the same frame, key SS_Top at 0, otherwise the squash of the contact starts too early.
   - After the contact (frame 15), SS_Top goes up ≈ 0.2 m.
3. **Round at the top**: both controls at 0 at the tops.
4. **Never through the floor**: the lowest point of the ball over the whole animation must stay above 0. Stretching with SS_Bottom near the contact can push the ball into the floor.

## Editing keys in the Timeline and the Dope Sheet

The bottom editor switches between **Timeline** and **Dope Sheet** with its Editor Type menu, as in Blender.
- Timeline: one row of diamonds that sums up the visible channels.
- Dope Sheet: a Summary row, a row for each bone and a row for each channel (all the channels of the stage, whatever is hidden in the Graph Editor). Holds (two keys in a row with the same value) are drawn as bars. Clicking a diamond on the Summary or a bone row takes the keys of all its channels at that frame; clicking a channel name makes it active.
- In both: drag the numbers at the top to change frame; click a keyframe to select it (Shift adds); drag it or press G to move it in time; Shift D duplicates and moves the copies; drag on empty space to box-select (in the Dope Sheet, over the rows you cover); X deletes.

Keys go to the editor under the mouse, so the same G moves a control in the 3D Viewport, keys in the Graph Editor and keys in time in the Timeline.

## Stage 3 · Weight

Each step loads its own starting scene.

1. **A bowling ball** — first bounce ≤ 30% of the drop and ≤ 10 frames long.
2. **A beach ball** — hang time ≥ 55% (time above 80% of the bounce height), only by lengthening the handles at the top.
3. **Match a real bounce** — the dashed curve is a physics simulation (parabolas, restitution 0.6). Bezier + Vector gets about 89%; steeper contact handles reach 94% or more. A good moment to explain why a falling object follows a parabola.

## Differences from Blender

- One object, one side camera and four channels. The Root moves in X and Z (G, with X / Z to lock an axis; a typed number goes to the locked axis, X if none). I always keys the Z Location and keys the X Location only when it was moved (like Only Insert Needed), so keying the bounces does not add ease to the constant travel; a new X key copies the interpolation of the previous one.
- A single handle type per key (Blender stores one per side).
- Handles are shown only for selected keys, as with Blender's "Only Selected Keyframes Handles".
- Automatic handles use one third of the distance to the neighbouring keys.
