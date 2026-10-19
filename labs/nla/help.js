// NLA Lab · what every control of the workspace does. Shown when the mouse rests on a control (data-help),
// and listed in the "Fundamentals" section. Texts are English keys of the lab dictionary (i18n.js).
export const HELP = {
  // ─── Sidebar › Strip ──────────────────────────────────────────────────────
  name: { title: 'Name', group: 'Strip', body: 'The name of the strip, written on it in the NLA. It is not the name of the action: renaming the strip does not rename the action.' },
  track: { title: 'Track', group: 'Strip', body: 'The track that holds the strip. To move the strip to another track, drag it or press PageUp / PageDown.' },
  start: { title: 'Frame Start / End', group: 'Strip', body: 'Where the strip sits in the timeline of the scene. Changing Frame Start moves the whole strip. Changing End stretches it, which changes the Playback Scale.' },
  extrap: { title: 'Extrapolation', group: 'Strip', body: 'What the strip does outside its own frames.<br><b>Hold</b>: keeps its first pose before the strip and its last pose after it. Only the first strip of a track can use it.<br><b>Hold Forward</b>: keeps the last pose after the strip, until the next strip of the track.<br><b>Nothing</b>: outside its frames the strip does nothing, and the tracks below (or the rest pose) show through.<br>Typical mistake: Hold on an upper track covers every frame of the scene.' },
  blend: { title: 'Blending', group: 'Strip', body: 'How the values of the strip mix with the result of the tracks below, weighted by the Influence.<br><b>Replace</b>: below + (strip − below) × influence. At 1 the strip wins.<br><b>Combine</b>: adds location and rotation, multiplies scale. The choice for additive layers.<br><b>Add</b> / <b>Subtract</b>: below ± strip × influence, on every channel (scale too: 1 + 1.06 = 2.06).<br><b>Multiply</b>: below × strip, weighted by the influence.<br>Only the channels the action has keys for are mixed; the others pass through untouched.' },
  blendIn: { title: 'Blend In / Out', group: 'Strip', body: 'The number of frames at the start (In) and at the end (Out) of the strip where the influence ramps from 0 to 1 and back to 0. The strip draws the ramp as a line. Greyed out when Auto Blend In/Out is on.' },
  autoBlend: { title: 'Auto Blend In/Out', group: 'Strip', body: 'Blend In and Out are calculated from the overlap with the strips of the track below: overlap two strips and you get a crossfade.' },
  reversed: { title: 'Playback Reversed', group: 'Strip', body: 'Plays the action backwards inside the strip: a walk becomes a walk backwards, a jump starts with its landing.' },
  mute: { title: 'Mute', group: 'Strip', body: 'A muted strip is not evaluated. It keeps all its settings and is drawn with a dashed outline. Shortcut: H.' },
  // ─── Sidebar › Animated Influence / Strip Time ────────────────────────────
  animInf: { title: 'Animated Influence', group: 'Animated Influence', body: 'Lets you set the influence by hand and key it (I over the field). While it is on, Blend In and Out are ignored. Without keys the value is constant, for example a layer at 50 %.' },
  influence: { title: 'Influence', group: 'Animated Influence', body: 'The weight of the strip in the mix, from 0 (no effect) to 1 (full effect). Yellow field: there is a key on this frame. Green: animated, but no key on this frame.' },
  animTime: { title: 'Animated Strip Time', group: 'Animated Strip Time', body: 'Lets you key which frame of the action plays at each frame of the scene: holds, speed ramps, going backwards. Not part of this lab.' },
  // ─── Sidebar › Action Clip ────────────────────────────────────────────────
  action: { title: 'Action', group: 'Action Clip', body: 'The action the strip plays. Changing it keeps the strip in place but plays another action; the range is reset to the keys of the new action.' },
  users: { title: 'Users', group: 'Action Clip', body: 'How many things use this action: strips, the action line, stashed strips. With 0 users and no Fake User (F) the action is not saved with the file.' },
  slot: { title: 'Slot', group: 'Action Clip', body: 'Since Blender 4.4 one action can hold the animation of several objects, each in its own slot. The slot says which part this strip plays. With one character the slot has the name of the object. A strip without a slot plays nothing.' },
  actStart: { title: 'Frame Start / End (Action Clip)', group: 'Action Clip', body: 'The part of the action that the strip plays, in the frames of the action itself. Use it to play only part of an action, or to leave out the last frame of a looping cycle (End 24 for a cycle keyed from 1 to 25).' },
  sync: { title: 'Sync Length · Now', group: 'Action Clip', body: 'With Sync Length on, the range is reset to the first and last keys of the action when you leave Tweak Mode. Now does it at once.' },
  scale: { title: 'Playback Scale', group: 'Action Clip', body: 'The speed of the strip: 2 plays the action twice as slow (the strip gets twice as long), 0.5 twice as fast. The keys of the action do not change. S over the NLA does the same.' },
  repeat: { title: 'Repeat', group: 'Action Clip', body: 'How many times the action plays, one cycle after another, inside the strip. For cycles: walk, run, idle. It can be fractional (2.5).' },
  // ─── Sidebar › Edited Action (Animation Data) ─────────────────────────────
  adtAction: { title: 'Action (active action)', group: 'Edited Action', body: 'The active action of the object: the orange row at the top of the NLA. It is evaluated last, on top of every track.' },
  adtExtrap: { title: 'Extrapolation (active action)', group: 'Edited Action', body: 'What the active action does before its first key and after its last key: Hold keeps the end poses, Nothing does nothing outside its keys.' },
  adtBlend: { title: 'Blending (active action)', group: 'Edited Action', body: 'How the active action mixes with the result of all the tracks. Combine or Add let you key corrections on top of an NLA mix.' },
  adtInfluence: { title: 'Influence (active action)', group: 'Edited Action', body: 'The weight of the active action on top of the tracks, from 0 to 1.' },
  // ─── Action Editor header ─────────────────────────────────────────────────
  browse: { title: 'Browse Action', group: 'Action Editor', body: 'Lists every action of the file. F: it has a Fake User. The number: how many users it has. ⚠: 0 users and no F, so it will be lost when you save.' },
  fake: { title: 'Fake User (F)', group: 'Action Editor', body: 'An extra user that never goes away: the action is saved even when no strip and no object uses it. Turn it on for every action you want to keep in a library.' },
  newAct: { title: 'New (⧉)', group: 'Action Editor', body: 'Makes a copy of the active action and makes the copy active. If the old action had no other user, Blender stashes it so it is not lost.' },
  unlink: { title: 'Unlink (✕)', group: 'Action Editor', body: 'Empties the action line. The action stays in the file only if something else uses it or it has a Fake User.' },
  pushdown: { title: 'Push Down', group: 'Action Editor', body: 'Turns the active action into a strip in a new track at the top of the stack and empties the action line. The strip is now a user of the action.' },
  stash: { title: 'Stash', group: 'Action Editor', body: 'Keeps the active action in a muted track called [Action Stash] and empties the action line. The action is safe in the file but does not play.' },
  // ─── NLA tracks ───────────────────────────────────────────────────────────
  aline: { title: 'Action line', group: 'NLA tracks', body: 'The orange row: the active action of the object. It is evaluated after every track, on top. Its Push Down button turns it into a strip.' },
  solo: { title: 'Solo (star)', group: 'NLA tracks', body: 'Only the soloed tracks are evaluated (and the action line). Use it to find which layer causes a problem, then turn it off.' },
  muteTrack: { title: 'Track checkbox', group: 'NLA tracks', body: 'Unticked, the track is muted: none of its strips is evaluated. Stashed tracks are muted from the start.' },
  lock: { title: 'Lock', group: 'NLA tracks', body: 'The strips of a locked track cannot be moved or edited, so you cannot change a finished layer by mistake.' },
  file: { title: 'File › Save & Reopen', group: 'File', body: 'Lab tool: does what saving, closing and opening the .blend file does to actions. Every action with 0 users and no Fake User is gone afterwards.' },
};
// Blender names stay in English; only titles with an explanation in brackets, and lab concepts, are translated.
import { t } from '../../i18n.js';
export const helpTitle = s => (/\(|checkbox|Action line/.test(s) ? t(s) : s);
// Order of the groups in the Fundamentals section.
export const HELP_GROUPS = ['Action Editor', 'NLA tracks', 'Strip', 'Animated Influence', 'Animated Strip Time', 'Action Clip', 'Edited Action', 'File'];
