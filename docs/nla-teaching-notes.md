# NLA Lab — teaching notes

The interface uses Blender's English names (NLA Editor, Action Editor, Push Down, Stash, Tweak Mode, strip, track, Extrapolation, Hold, Blending, Influence, Action Clip, Repeat, Playback Scale…) so students find the same words in Blender. Explanations can be switched to Catalan or Spanish. The lab targets Blender 4.4 or later (actions with slots).

## What the lab models

- **The mannequin**: an armature with 17 bones and rigid pieces of mesh. Channels are X/Y/Z Euler Rotation in each bone's own axes, Y Location of the Hips (along the bone, so up) and Scale of the Chest.
- **Actions**: Idle (keys every bone), Walk (an in-place cycle 1–25, frame 25 = frame 1), Wave (only the right arm), Jump (whole body, 1–37), Breathe (additive: Chest scale 1.06 and a small lean) and Test_Pose (a T pose keyed on frames 1–2). Curves are Bezier with Auto Clamped handles, like Blender's defaults.
- **Evaluation**, every frame: the rest pose, then every track from the bottom up, then the action line (the active action) on top.
  - A strip contributes only the channels its action keys. Replace moves the result towards the strip by the influence; Combine adds location and rotation offsets and multiplies scale; Add, Subtract and Multiply apply the same operation to every channel.
  - Strip time: Frame Start/End of the Action Clip, Playback Scale, Repeat (the last frame of the strip shows the end of the action), Reversed.
  - Extrapolation: Hold (before and after, only for the first strip of a track; the others become Hold Forward), Hold Forward (after), Nothing. A held region keeps the influence of the nearest end, so a strip that blends out holds nothing.
  - Influence: Blend In/Out ramps, Auto Blend In/Out (from the overlap with the track below), or Animated Influence with keys (I over the field).
  - Solo evaluates only the soloed tracks; the checkbox mutes a track; H mutes strips.
- **Operators**: Push Down (new track on top, strip with Hold), Stash (muted "[Action Stash]" track), Browse Action (an action that would lose its last user is stashed first), New (a copy), Unlink, Fake User, Add Action Strip (Shift A, a new track above if it does not fit), Transition (Shift T), Meta-Strips, Duplicate (Shift D, new action) and Linked Duplicate (Alt D), Split (Y), Delete (X), Toggle Muting (H), Apply/Clear Scale, Sync Action Length, Make Single User (U), Swap (Alt F), Move Strips Up/Down, Snap, Tweak Mode (Tab, Full Stack; Sync Length updates the range on exit) and Bake Action (Frame Start/End/Step, Overwrite, Clean Curves).
- A strip moved or grown onto another goes to the next free track above, as after a transform in Blender.

## Simplifications

- One object; no Lower Stack tweak, Animated Strip Time, strip modifiers, sound strips, markers or the Graph Editor.
- The action slot is shown (◆ Mannequin) but cannot be changed.
- Meta strips evaluate their children directly in the track.
- Keys in the Action Editor are edited per bone row (all channels of a bone at that frame).

## How to use it in class

- Keep the **Stack** view on: it lists every track from the top, what it plays at the current frame (action frame, held, blend mode) and its influence. It is the quickest way to explain the evaluation order.
- Insist on the vocabulary: an action holds keys; a strip only places an action in time; a track is a layer.
- "Show a solution" loads one possible answer; Ctrl Z brings the student's work back. Each step loads its own scene. "Restart the lab" in the header erases all progress.

## Explanations inside the lab (v2)

- **Help on every control**: rest the mouse on any field of the Sidebar, on the Action Editor header (Browse Action, F, New, Unlink, Slot, Push Down, Stash) or on the track controls (action line, Solo, checkbox, Lock) and a panel explains what it does, its options and the typical mistake. Texts live in `labs/nla/help.js`.
- **Fundamentals** section below the workspace, in tabs: Vocabulary, Saving actions (users, Fake User, Stash, Purge, Outliner › Blender File / Orphan Data), Evaluation order, Extrapolation (a live graph of one channel with two strips and an optional track below: change Hold / Hold Forward / Nothing and read each region), Blending (a calculator: result below, strip value, influence, rotation or scale, the five modes with their formula) and Every control (the same help texts, grouped as in Blender). Each step card links to the relevant tab ("Read more").
- **File › Save & Reopen** (Ctrl S) in a small top bar: a lab tool that does to actions what saving and reopening a .blend does: actions with 0 users and no Fake User disappear. **Clean Up › Purge Unused Data** deletes them at once. Browse Action marks them with ⚠.

## Stage 1 · Actions and strips

1. **One action at a time**: play Idle, then switch the active action to Walk with Browse Action. Point out the F (Fake User).
2. **Push Down**: the Walk becomes a strip in NlaTrack; the action line is empty.
3. **Idle, then Walk**: move the Walk to 49 (G 48), then Shift A › Idle at frame 1 in the same track.
4. **Tweak Mode**: Tab on the Walk, delete the Head keys in the Action Editor, Tab out.

## Stage 2 · Saving actions

1. **Nothing uses it, nothing saves it**: Wave_v2 and Old_Test have 0 users. Give Wave_v2 a Fake User and Save & Reopen (check: Wave_v2 has F and at least one save). Old_Test is lost on purpose.
2. **A new action, the old one safe**: the Walk has no F. New makes Walk.001 and stashes the Walk; Save & Reopen proves it survives (check: Walk not active, still has users, one save).
3. **Delete the strip, keep the action**: delete the Jump strip, give Jump an F (or stash it) and save (check: no playing Jump strip, Jump still exists).

## Stage 3 · Extrapolation

1. **Hold fills the start**: the Walk starts at 20 with Nothing, so frames 1–19 show the rest pose. Set Hold.
2. **Hold, Hold Forward, Nothing**: a Wave on an upper track got Hold and freezes the arm for the whole scene. Set Nothing.
3. **The gap between two strips**: Walk (Hold Forward) and Jump with a 12-frame gap freeze and pop. Select both and Shift T.

## Stage 4 · Blending and influence

1. **Wave while walking**: Add › Tracks Above Selected, Shift A › Wave at 37. Replace only touches the keyed channels.
2. **Fade it in and out**: Blend In and Out ≥ 4.
3. **Animated Influence**: tick it and key 0 / 1 / 1 / 0 at 37 / 43 / 55 / 61 (check: at least 3 keys, one ≤ 0.1 and one ≥ 0.9).
4. **From walking to jumping**: overlap the Jump 8 frames and tick Auto Blend In/Out (or a Transition).
5. **Add: an offset on top**: Reach (arms 45° forward) with Replace stops the arm swing; Add (or Combine) keeps it.

## Stage 5 · Time and repetition

1. **Repeat the cycle**: Repeat 4.
2. **No double frame**: Action Clip Frame End 24.
3. **Slower, faster**: the Wave lasts 36 frames (Playback Scale 1.5 or S 1.5).
4. **Wave twice, one action**: Alt D (Linked Duplicate).

## Stage 6 · Layers and finishing

1. **Find the layer that breaks it**: Solo to find the Test_Pose track (Hold on top), then mute it. Solo off at the end.
2. **Add or Combine**: Breathe with Add doubles the chest; Combine multiplies.
3. **One block: a meta strip**: Add › Meta-Strips, then G 20 (starts at 21).
4. **Bake it for the game engine**: Strip › Bake Action 1–96, then mute every track.
