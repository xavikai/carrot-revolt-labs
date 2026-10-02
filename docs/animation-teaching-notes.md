# Animation Lab — teaching notes

The interface uses Blender's English names (Graph Editor, Timeline, Keyframe, Bezier, Vector, Maintain Volume…) so students find the same words in Blender. Explanations can be switched to Catalan or Spanish.

## How to use it in class

- Keep the **Motion Path** on: one dot per frame. Close dots = slow, far dots = fast. It is the quickest way to *see* spacing.
- Ask students to predict what a change will do before playing (Space): "If I make this handle longer, where will the dots bunch?"
- Link every curve shape to a motion: flat = stopped, steep = fast, sharp V = impact, rounded top = hang time.
- Each step is checked automatically. "Show a solution" loads one possible answer, and Ctrl Z brings the student's version back.

## The stages follow the class

Both animation labs (Blender and 3ds Max) use the same stages, in the same order and with the same frames as the class guide *Animació de la pilota a 3ds Max*. The scene runs from frame 0 to 100.

| Class guide | Lab stage |
|---|---|
| 01–02 · Reference, rig and timeline | Stage 1 text: animate the control (ctrl_pilota / Root), never the mesh |
| 03 · First bounce: 0, 10 and 20 | 1 · Keys, step 1 |
| 04 · The vertical sequence (a key every 10 frames) | 1 · Keys, step 2 |
| 05 · Bring the bounces closer in time | 2 · Timing, step 1 (+ step 2: sharp contacts) |
| 06 · Travel that gives weight | 3 · Travel |
| 07 · The rotation goes with the path | 4 · Rotation |
| 08–09 · Deformation controls, squash and stretch keys | 5 · Squash & Stretch |
| — | 6 · Weight (extra) |

## Stage 1 · Keys

1. **First bounce: 0, 10 and 20** — the control starts in the air (4 m) with a key at frame 0. Key the contact at 10 and a lower top at 20.
2. **The vertical sequence** — first pattern, one key every 10 frames until frame 50: contacts at 10, 30, 50 and every top lower than the one before.

## Stage 2 · Timing

The stage loads the pattern until frame 90 (every bounce 20 frames long, Auto / Auto Clamped tangents, as new keys get).

1. **Bring the bounces closer in time** — every bounce shorter and lower. The class values are contacts 10 · 28 · 43 · 56 · 67 · 73 and tops 20 · 36 · 50 · 62 · 70; the check accepts any timing where every interval is shorter than the one before, every top lower, and the ball settles by frame 80.
2. **Hit the ground hard** — automatic tangents also flatten the contacts (the ball sticks to the floor); Vector handles in Blender, Set Tangents to Fast in 3ds Max make a sharp V.

## Stage 3 · Travel

**Travel that gives weight** — animate the travel on the same control (X Location in Blender; X Position in the 3ds Max lab, Y Position in the class scene, which faces another way): frame 0 is the start, frame 73 (the last contact) the end. After 73 the curve is flat. The check also asks the travel to slow down before it stops (Linear tangents fail).

## Stage 4 · Rotation

1. **The rotation goes with the path** — a rotation key between frames 65 and 76 (in class, near 70), forwards and within 10% of what rolling needs (360° every π × diameter: about 1031° for 9 m with a 1 m ball). The sidebar / Lab readout shows Needed to roll.
2. **The spin comes to a stop** — a last key from frame 90 on (in class, near 99), never turning backwards, with a flat end.

## Stage 5 · Squash & Stretch

The ball uses the class rig:
- **Root** / **ctrl_pilota**: the base of the ball, at the floor.
- **SS_Top** / **ctrl_top**: moves the top of the ball. The pivot is at the base, so the ball stays on the floor.
- **SS_Bottom** / **ctrl_bottom**: moves the bottom of the ball. The pivot is at the top. In 3ds Max both are inside **squash_space**.

The rig keeps the volume: a shorter ball gets wider. In Blender students pose the controls in the 3D Viewport with G (up and down only; typed values work) and key them with I; an unkeyed pose is lost when the frame changes, as in Blender.

1. **Squash on contact** — top control ≈ -0.4 m at the first two contacts (10 and 28). The squash is brief: round the frame before (the class's "first adjustment" at frame 9) and back three frames later. Keys like 9 · 10 · 12 and 27 · 28 · 30.
2. **A short stretch after the contact** — top control ≈ +0.2 m just after the first contact (frame 12) and back to 0 at 15. Stretching down with the bottom control before a contact is optional.
3. **Round at the top** — both controls at 0 at the tops (frames 0 and 20).
4. **Never through the floor** — the lowest point of the ball over the whole animation must stay above 0.

## Editing keys in the Timeline and the Dope Sheet

The bottom editor switches between **Timeline** and **Dope Sheet** with its Editor Type menu, as in Blender.
- Timeline: one row of diamonds that sums up the visible channels.
- Dope Sheet: a Summary row, a row for each bone and a row for each channel (all the channels of the stage, whatever is hidden in the Graph Editor). Holds (two keys in a row with the same value) are drawn as bars. Clicking a diamond on the Summary or a bone row takes the keys of all its channels at that frame; clicking a channel name makes it active.
- In both: drag the numbers at the top to change frame; click a keyframe to select it (Shift adds); drag it or press G to move it in time; Shift D duplicates and moves the copies; drag on empty space to box-select (in the Dope Sheet, over the rows you cover); X deletes.

Keys go to the editor under the mouse, so the same G moves a control in the 3D Viewport, keys in the Graph Editor and keys in time in the Timeline.

## Stage 6 · Weight (extra)

Each step loads its own starting scene.

1. **A bowling ball** — first bounce ≤ 30% of the drop and ≤ 10 frames long.
2. **A beach ball** — hang time ≥ 55% (time above 80% of the bounce height), only by lengthening the handles at the top.
3. **Match a real bounce** — the dashed curve is a physics simulation (parabolas, restitution 0.6). Bezier + Vector gets about 89%; steeper contact handles reach 94% or more. A good moment to explain why a falling object follows a parabola.

## Differences from Blender

- One object, one side camera and four channels. The Root moves in X and Z (G, with X / Z to lock an axis; a typed number goes to the locked axis, X if none). I always keys the Z Location and keys the X Location only when it was moved (like Only Insert Needed), so keying the bounces does not add ease to the constant travel; a new X key copies the interpolation of the previous one.
- A single handle type per key (Blender stores one per side).
- Handles are shown only for selected keys, as with Blender's "Only Selected Keyframes Handles".
- Automatic handles use one third of the distance to the neighbouring keys.
