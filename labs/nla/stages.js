// Stages of the NLA Lab. Every step loads its own scene, so students can jump between steps.
import * as N from './nla.js?v=1';

const S = (o = {}) => N.newState(o);
const stripsOf = (st, action) => N.allStrips(st).filter(s => s.type === 'action' && s.action === action);
const firstStrip = (st, action) => stripsOf(st, action)[0];
const trackIndexOf = (st, s) => N.findStrip(st, s.id)?.ti ?? -1;
const near = (a, b, e = 0.6) => Math.abs(a - b) <= e;
// A walk track to build on: Walk from frame 1, repeated.
function walkBase(repeat = 4, extra = {}) {
  const st = S({ action: null });
  N.withTrack(st, [['Walk', 1, { repeat, ...extra }]]);
  st.tracks[0].strips[0].extrap = 'HOLD';
  N.validate(st);
  return st;
}
function addWaveTrack(st, start, extra = {}) {
  const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Wave', start, extra)); st.tracks.push(t);
  if (!extra.extrap) t.strips[0].extrap = 'HOLD';
  N.validate(st); return t;
}
// Is the Wave layered over a walk (a track above, overlapping in time)?
function waveOverWalk(st) {
  const walk = stripsOf(st, 'Walk'), wave = stripsOf(st, 'Wave');
  return wave.some(w => walk.some(k => trackIndexOf(st, w) > trackIndexOf(st, k) && w.start < k.end && w.end > k.start));
}

export const STAGES = [
  {
    id: 'basics', name: 'Actions and strips', sub: 'Action Editor · Push Down · Tweak',
    steps: [
      {
        id: 'a1', title: 'One action at a time',
        text: 'Every animation you key goes into an action: Idle, Walk, Wave and Jump are four actions of the same mannequin. An object plays only one action at a time, its active action (the orange row at the top of the NLA). Play the Idle, then make Walk the active action from the Action Editor.',
        how: ['Press <kbd>Space</kbd> with the mouse over the editors (or click ▶) to play Idle. <kbd>Space</kbd> again stops.', 'In the <b>Action Editor</b> header, click the <b>Browse Action</b> button (the icon left of the name) and choose <b>Walk</b>.', 'Look at the list: every action has an <b>F</b> (Fake User). Without it, an action that nothing uses is deleted when you save the file.'],
        why: 'Without the NLA you could only swap one action for another. The NLA Editor is where many actions are placed in time and mixed.',
        start: () => S({ action: 'Idle' }),
        check: st => st.adt.action === 'Walk',
        solve: st => { N.setActiveAction(st, 'Walk'); },
      },
      {
        id: 'a2', title: 'Push Down',
        text: 'Push Down turns the active action into a strip: a block in an NLA track that plays the action at a place in time. The action line is empty again, ready for a new action. Push the Walk down and look at the strip it makes.',
        how: ['Click <b>Push Down</b> in the Action Editor header, or the push-down button on the orange <b>Walk</b> row of the NLA.', 'A new track appears, <b>NlaTrack</b>, with a <b>Walk</b> strip from frame 1 to 25.', 'Click the strip: the <b>Sidebar</b> (<kbd>N</kbd>) shows its Strip and Action Clip settings.'],
        why: 'A strip only references the action: the keys stay in the action. That is why the same action can be used by many strips.',
        start: () => S({ action: 'Walk' }),
        check: st => !st.adt.action && stripsOf(st, 'Walk').length > 0,
        solve: st => { N.pushDown(st); },
      },
      {
        id: 'a3', title: 'Idle, then Walk',
        text: 'Strips in the same track play one after the other. Build a sequence: the mannequin stands (Idle) and then walks. Move the Walk strip later and add an Idle strip before it, in the same track.',
        how: ['Select the <b>Walk</b> strip and press <kbd>G</kbd>, type <kbd>4</kbd><kbd>8</kbd> and press <kbd>Enter</kbd>: it now starts at frame 49 (you can also drag it).', 'Go to frame 1 (<kbd>Shift</kbd><kbd>←</kbd>), click the <b>NlaTrack</b> name to make it the active track and press <kbd>Shift</kbd><kbd>A</kbd> › <b>Idle</b>.', 'Idle lasts 48 frames (1–49), so it ends where the Walk starts. Play it.'],
        why: 'Two strips can never overlap in a track. If a strip does not fit, Blender puts it in a free track above (try it).',
        start: () => { const st = S({ action: 'Walk' }); N.pushDown(st); return st; },
        check: st => st.tracks.some(t => { const idle = t.strips.find(s => s.action === 'Idle'), walk = t.strips.find(s => s.action === 'Walk'); return idle && walk && near(idle.start, 1, 1) && walk.start >= idle.end - 0.5 && walk.start <= idle.end + 2; }),
        solve: st => { const w = firstStrip(st, 'Walk'); N.moveStrips(st, [w.id], 48); st.sel.track = st.tracks[0].id; N.addActionStrip(st, 'Idle', 1); },
      },
      {
        id: 'a4', title: 'Tweak Mode',
        text: 'The walk looks down at the floor: someone keyed the Head bent forward. The keys are inside the Walk action, so you fix them in Tweak Mode: Tab on the strip opens its action in the Action Editor, with the keys placed where the strip plays them. Delete the Head keys and leave Tweak Mode.',
        how: ['Click the <b>Walk</b> strip and press <kbd>Tab</kbd> (with the mouse over the NLA): the strip turns green and the Action Editor shows the Walk keys.', 'In the Action Editor, double-click the <b>Head</b> row to select its keys (or drag a box around them) and press <kbd>X</kbd>.', 'Press <kbd>Tab</kbd> again over the NLA to leave Tweak Mode. Every repeat of the strip is fixed at once.'],
        why: 'In Tweak Mode you edit the action itself: every strip that plays it changes. Outside Tweak Mode you only move, scale and mix strips.',
        start: () => { const st = S({ action: null }); st.actions.Walk = N.makeWalk({ headDown: 24 }); N.withTrack(st, [['Walk', 1, { repeat: 3 }]]); st.frame = 7; return st; },
        check: st => !st.adt.tweak && !N.actionChannels(st.actions.Walk).some(ch => ch.startsWith('Head.')),
        solve: st => { delete st.actions.Walk.curves['Head.rx']; },
      },
    ],
  },
  {
    id: 'keep', name: 'Saving actions', sub: 'Users · Fake User · Stash',
    steps: [
      {
        id: 'k1', title: 'Nothing uses it, nothing saves it',
        text: 'Blender only writes to the .blend file the data that something uses. Every action counts its users: each strip that plays it, and the action line when it is the active action. Wave_v2 is a new version of the wave that nothing uses yet: 0 users. Save now and it is gone. Give it a Fake User, then save and reopen to check that it is still there.',
        how: ['Open <b>Browse Action</b> in the Action Editor header. <b>Wave_v2</b> and <b>Old_Test</b> show ⚠ 0: no users and no F.', 'Choose <b>Wave_v2</b> and click the <b>F</b> next to its name. The Fake User is a user that never goes away.', 'Choose <b>File › Save &amp; Reopen</b> (top left of the workspace, or <kbd>Ctrl</kbd><kbd>S</kbd>). Old_Test is lost, Wave_v2 stays. <kbd>Ctrl</kbd><kbd>Z</kbd> undoes a save that lost something you wanted.'],
        why: 'Being the active action is a user too, but only until you pick another one. A Fake User is the safe way to keep a library of actions in a character file (Walk, Run, Jump…) even when no strip uses them yet.',
        start: () => { const st = S({ action: 'Idle' }); st.actions.Wave_v2 = { ...N.makeWave(), name: 'Wave_v2', fake: false }; st.actions.Old_Test = { ...N.makeTestPose(), name: 'Old_Test', fake: false }; return st; },
        check: st => !!st.actions.Wave_v2?.fake && (st.saves || 0) >= 1,
        solve: st => { st.actions.Wave_v2.fake = true; N.saveReopen(st); },
      },
      {
        id: 'k2', title: 'A new action, the old one safe',
        text: 'The Walk was animated straight in the Action Editor, without a Fake User: the action line is its only user. Now you need a new action for a run. If you just switch to another action, the Walk loses its last user. Blender protects it in two ways: Stash keeps it in a muted NLA track, and New stashes it for you when nothing else uses it. Make a new action and check that the Walk survives a save.',
        how: ['Click <b>New</b> (⧉) in the Action Editor header: a copy, <b>Walk.001</b>, becomes the active action, ready to be changed into a run.', 'Look at the NLA: a muted track, <b>[Action Stash]</b>, now holds the Walk. Its checkbox is off, so it does not play.', '<b>File › Save &amp; Reopen</b>: the Walk is still in the file, because the stashed strip is a user. (Clicking <b>Stash</b> before choosing another action does the same.)'],
        why: 'Stash is a parking place: the action stays in the file and is listed in the NLA, but muted so it does not mix with your animation. Push Down also keeps it, but as a strip that plays.',
        start: () => { const st = S({ action: 'Walk' }); st.actions.Walk.fake = false; return st; },
        check: st => st.adt.action !== 'Walk' && !!st.actions.Walk && N.actionUsers(st, 'Walk') > 0 && (st.saves || 0) >= 1,
        solve: st => { N.newAction(st); N.saveReopen(st); },
      },
      {
        id: 'k3', title: 'Delete the strip, keep the action',
        text: 'The Jump is no longer in this shot. Deleting its strip takes the Jump off the timeline, and also takes away its only user: the next save would drop the action from the file. Delete the strip, but keep the Jump for other shots.',
        how: ['Select the <b>Jump</b> strip and press <kbd>X</kbd>. In <b>Browse Action</b>, Jump now shows ⚠ 0.', 'Keep it: choose Jump in Browse Action, click <b>F</b>, then click ✕ (Unlink) to empty the action line again. (Stash also works.)', '<b>File › Save &amp; Reopen</b> and check that Jump is still in the list.'],
        why: 'Users are counted, not remembered: a strip, the action line, a stash or the Fake User keep an action alive. In Blender, File › Clean Up › Purge Unused Data deletes everything with 0 users at once.',
        start: () => { const st = walkBase(2); const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Jump', 50, { extrap: 'HOLD' })); st.tracks.push(t); st.actions.Jump.fake = false; N.validate(st); return st; },
        check: st => !!st.actions.Jump && (st.saves || 0) >= 1 && !N.allStrips(st).some(s => s.action === 'Jump' && !s.mute && !st.tracks[N.findStrip(st, s.id).ti].mute),
        solve: st => { st.tracks[1].strips = []; st.actions.Jump.fake = true; N.validate(st); N.saveReopen(st); },
      },
    ],
  },
  {
    id: 'extrap', name: 'Extrapolation', sub: 'Hold · Hold Forward · Nothing',
    steps: [
      {
        id: 'x1', title: 'Hold fills the start',
        text: 'The walk starts at frame 20. Play from frame 1: until then the mannequin stands stiff in its rest pose, because no strip covers those frames and the Walk is set to Nothing. The Extrapolation of a strip says what it does outside its own frames. Hold keeps its first pose before the strip and its last pose after it.',
        how: ['Select the <b>Walk</b> strip. In <b>Sidebar › Strip</b>, set <b>Extrapolation</b> to <b>Hold</b>.', 'The NLA draws a faint band before and after the strip: those are the held frames.', 'Scrub frames 1–19: the mannequin waits in the first pose of the walk.'],
        why: 'Hold is only allowed on the first strip of a track (Blender switches it to Hold Forward otherwise). On the bottom track it is the usual choice: no frame of the scene is left without a pose.',
        start: () => { const st = S({ action: null }); N.withTrack(st, [['Walk', 20, { repeat: 3, extrap: 'NOTHING' }]]); st.frame = 10; return st; },
        check: st => firstStrip(st, 'Walk')?.extrap === 'HOLD',
        solve: st => { firstStrip(st, 'Walk').extrap = 'HOLD'; },
      },
      {
        id: 'm2', title: 'Hold, Hold Forward, Nothing',
        text: 'The arm is up all the time: before the wave and after it. A strip is only 24 frames long, but its Extrapolation says what happens outside it. The Wave is the first strip of its track, so it got Hold: it keeps its first pose before it and its last pose after it. Set it to Nothing so the arm swings again outside the strip.',
        how: ['Select the <b>Wave</b> strip. In the <b>Sidebar › Strip</b> tab, set <b>Extrapolation</b> to <b>Nothing</b>.', '<b>Hold Forward</b> would keep only the last pose, after the strip. Try it, then go back to Nothing.', 'Scrub before frame 37 and after frame 61: the right arm swings with the walk.'],
        why: 'Hold is useful on the bottom track (the first pose fills the start of the scene), but on an upper track it covers everything below it for the whole timeline.',
        start: () => { const st = walkBase(4); addWaveTrack(st, 37); st.frame = 15; return st; },
        check: (st, c) => { const w = firstStrip(st, 'Wave'); return w && w.extrap === 'NOTHING' && near(c.evaluate(15).pose['UpperArm.R.rz'], 6, 1) && near(c.evaluate(w.end + 8).pose['UpperArm.R.rz'], 6, 1); },
        solve: st => { firstStrip(st, 'Wave').extrap = 'NOTHING'; },
      },
      {
        id: 'x3', title: 'The gap between two strips',
        text: 'Walk and Jump are in the same track with a gap of 12 frames. The Walk has Hold Forward, so in the gap the mannequin freezes in the last frame of the walk and then pops into the jump. A Transition strip fills a gap by blending from the last pose of the strip before it to the first pose of the strip after it.',
        how: ['Scrub frames 49–61 to see the freeze and the pop.', 'Click the <b>Walk</b>, <kbd>Shift</kbd>-click the <b>Jump</b> and press <kbd>Shift</kbd><kbd>T</kbd> (Add › Transition) with the mouse over the NLA.', 'A blue strip fills the gap. Scrub again: the pose travels from one strip to the other.'],
        why: 'In a gap, Nothing shows the result below (the rest pose on the bottom track) and Hold Forward freezes the last pose. A transition is the third way: a smooth blend between the two strips without overlapping them.',
        start: () => { const st = S({ action: null, range: [1, 100] }); N.withTrack(st, [['Walk', 1, { repeat: 2, extrap: 'HOLD_FORWARD' }], ['Jump', 61]]); st.frame = 55; return st; },
        check: st => st.tracks.some(t => { const s = [...t.strips].sort((a, b) => a.start - b.start); return s.some((x, i) => x.type === 'transition' && s[i - 1]?.action === 'Walk' && s[i + 1]?.action === 'Jump'); }),
        solve: st => { st.tracks[0].strips.forEach(s => { s.select = true; }); N.addTransition(st); },
      },
    ],
  },
  {
    id: 'blend', name: 'Blending and influence', sub: 'Replace · Add · Influence',
    steps: [
      {
        id: 'm1', title: 'Wave while walking',
        text: 'Tracks are evaluated from the bottom up: a strip in an upper track is mixed on top of the result below it. The Wave action only has keys for the right arm, so with Blending Replace it replaces the arm and leaves the rest of the walk alone. Add a track above the walk and put the Wave on it, around frame 37.',
        how: ['Click the <b>NlaTrack</b> name and choose <b>Add › Tracks Above Selected</b>.', 'With the new track selected, go to frame 37 and press <kbd>Shift</kbd><kbd>A</kbd> › <b>Wave</b>.', 'Play it. Turn on <b>Stack</b> in the 3D Viewport header to see what each track gives at the current frame.'],
        why: 'Layering only works for the channels a strip has keys for: an action that keys only the upper body leaves the legs to the tracks below.',
        start: () => walkBase(4),
        check: st => waveOverWalk(st),
        solve: st => { st.sel.track = st.tracks[0].id; N.addTrack(st, true); N.addActionStrip(st, 'Wave', 37); },
      },
      {
        id: 'm3', title: 'Fade it in and out',
        text: 'At frame 37 the arm jumps up in one frame, and at 61 it drops. The strip goes from no influence to full influence at once. Blend In and Blend Out ramp the influence over a few frames, so the arm rises into the wave and falls back into the walk.',
        how: ['Select the <b>Wave</b> strip. In <b>Sidebar › Strip</b>, set <b>Blend In</b> to 6 and <b>Blend Out</b> to 6.', 'The strip draws the ramps. Scrub from frame 36 to 44 and watch the arm.', 'Influence is the weight of a strip: Replace at 50 % gives half way between the result below and the strip.'],
        why: 'Fading the influence is the simplest way to blend two motions. For full control, turn on <b>Animated Influence</b> and key the influence with <kbd>I</kbd> over the field.',
        start: () => { const st = walkBase(4); addWaveTrack(st, 37, { extrap: 'NOTHING' }); st.frame = 37; return st; },
        check: st => { const w = firstStrip(st, 'Wave'); if (!w) return false; if (w.animInf) return w.infKeys.length >= 2 && N.stripInfluence(w, w.start) < 0.5 && N.stripInfluence(w, (w.start + w.end) / 2) > 0.9; return w.blendIn >= 4 && w.blendOut >= 4; },
        solve: st => { const w = firstStrip(st, 'Wave'); w.blendIn = 6; w.blendOut = 6; },
      },
      {
        id: 'b3', title: 'Animated Influence',
        text: 'Blend In and Out only fade the ends of a strip. For any other shape, animate the influence itself: turn on Animated Influence and key the Influence field like any other property. Make the wave come in and go out: 0 at frame 37, 1 at 43, 1 at 55 and 0 at 61.',
        how: ['Select the <b>Wave</b> strip and tick <b>Animated Influence</b> in the Sidebar.', 'Go to frame 37, type 0 in <b>Influence</b> and press <kbd>I</kbd> with the mouse over the field: it turns yellow (a key on this frame).', 'Frame 43 → 1, frame 55 → 1, frame 61 → 0. Once there are keys, a new value is keyed at once. Between keys the field is green: animated, but no key here.'],
        why: 'An animated influence ignores Blend In and Out. It is how animators hold a layer at 50 %, or bring a correction in and out several times inside one strip.',
        start: () => { const st = walkBase(4); addWaveTrack(st, 37, { extrap: 'NOTHING' }); st.frame = 37; return st; },
        check: st => { const w = firstStrip(st, 'Wave'); if (!w?.animInf || w.infKeys.length < 3) return false; const v = w.infKeys.map(k => k[1]); return Math.min(...v) <= 0.1 && Math.max(...v) >= 0.9; },
        solve: st => { const w = firstStrip(st, 'Wave'); w.animInf = true; w.infKeys = [[37, 0], [43, 1], [55, 1], [61, 0]]; },
      },
      {
        id: 'm4', title: 'From walking to jumping',
        text: 'The Jump starts the frame the Walk ends, and the pose pops from one to the other. Overlap them and let Blender fade one into the other: Auto Blend In/Out sets the blends from the overlap with the track below. (In a single track, a Transition strip does the same in a gap.)',
        how: ['Select the <b>Jump</b> strip and move it 8 frames earlier: <kbd>G</kbd> <kbd>-</kbd><kbd>8</kbd> <kbd>Enter</kbd>. It now overlaps the end of the Walk.', 'In <b>Sidebar › Strip</b>, tick <b>Auto Blend In/Out</b>: Blend In becomes the 8 frames of overlap.', 'Other way: put both strips in one track with a gap, select both and press <kbd>Shift</kbd><kbd>T</kbd> (Add › Transition).'],
        why: 'A crossfade needs both motions at the same time: during the overlap the Jump takes over from the Walk little by little.',
        start: () => { const st = S({ action: null, range: [1, 100] }); N.withTrack(st, [['Walk', 1, { repeat: 2 }]]); const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Jump', 49, { extrap: 'HOLD' })); st.tracks.push(t); N.validate(st); st.frame = 45; return st; },
        check: st => {
          const jump = stripsOf(st, 'Jump'), walk = stripsOf(st, 'Walk');
          const overlap = jump.some(j => walk.some(w => trackIndexOf(st, j) === trackIndexOf(st, w) + 1 && j.start < w.end - 3.5 && j.start >= w.start && j.blendIn >= 4));
          const trans = st.tracks.some(t => { const s = [...t.strips].sort((a, b) => a.start - b.start); return s.some((x, i) => x.type === 'transition' && s[i - 1]?.action === 'Walk' && s[i + 1]?.action === 'Jump' && x.end - x.start >= 4); });
          return overlap || trans;
        },
        solve: st => { const j = firstStrip(st, 'Jump'); N.moveStrips(st, [j.id], -8); firstStrip(st, 'Jump').autoBlend = true; N.validate(st); },
      },
      {
        id: 'b5', title: 'Add: an offset on top',
        text: 'Reach is a small layer: it only keys both arms 45° forward, as if carrying something. With Blending Replace it replaces the arm rotations of the walk, so the arms stop swinging. With Add its values are added to the walk: the arms keep their swing, around a new position. Use Add (or Combine) for offsets.',
        how: ['Play: with Replace the arms are stuck forward.', 'Select the <b>Reach</b> strip and set <b>Blending</b> to <b>Add</b>.', 'Play again with the <b>Stack</b> view on: the walk still swings the arms and Reach adds −45° on top.'],
        why: 'Replace means “use my value”, Add means “add my value to the result below”. Combine also adds location and rotation, but multiplies scale: the last stage shows why that matters.',
        start: () => { const st = walkBase(4, { actEnd: 24 }); const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Reach', 1, { repeat: 4, extrap: 'HOLD' })); st.tracks.push(t); N.validate(st); st.frame = 10; return st; },
        check: st => ['ADD', 'COMBINE'].includes(firstStrip(st, 'Reach')?.blend),
        solve: st => { firstStrip(st, 'Reach').blend = 'ADD'; },
      },
    ],
  },
  {
    id: 'time', name: 'Time and repetition', sub: 'Repeat · Action Clip · Scale',
    steps: [
      {
        id: 't1', title: 'Repeat the cycle',
        text: 'The Walk is one cycle of 24 frames: two steps. A walk across the scene needs many cycles, and you do not key them again: the strip repeats the action. Make the Walk play 4 times.',
        how: ['Select the <b>Walk</b> strip. In <b>Sidebar › Strip › Action Clip</b>, set <b>Repeat</b> to 4.', 'The strip gets longer and draws a line where each repeat starts.', 'Play it with the <b>Stack</b> view on and watch the frame of the action go back to 1.'],
        why: 'Repeat keeps the file light and the cycle in one place: fix the action once and every repeat changes.',
        start: () => walkBase(1),
        check: st => stripsOf(st, 'Walk').some(s => s.repeat >= 4 - 1e-6),
        solve: st => { firstStrip(st, 'Walk').repeat = 4; N.validate(st); },
      },
      {
        id: 't2', title: 'No double frame',
        text: 'Watch the loop closely at frames 25, 49 and 73: the walk stops for a moment. The last key (25) is the same pose as the first one (1), so each loop shows that pose twice. Make the clip end at frame 24: then frame 1 of the next repeat plays the pose of frame 25.',
        how: ['Select the <b>Walk</b> strip. In <b>Action Clip</b>, set <b>Frame End</b> to 24 (Frame Start stays 1).', 'Use <kbd>←</kbd> <kbd>→</kbd> around frame 25 and compare the poses.', '<b>Sync Length</b> would set the range back to the keys (1–25): keep it in mind after tweaking an action.'],
        why: 'A looping cycle has its first pose repeated at the end only to give the curves the right shape. The range that plays must leave that last frame out.',
        start: () => { const st = walkBase(4); st.frame = 23; return st; },
        check: st => stripsOf(st, 'Walk').some(s => near(s.actEnd, 24, 0.01) && near(s.actStart, 1, 0.01) && s.repeat >= 2),
        solve: st => { firstStrip(st, 'Walk').actEnd = 24; N.validate(st); },
      },
      {
        id: 't3', title: 'Slower, faster',
        text: 'The wave is too quick for this shot. Instead of moving keys, stretch the strip: Playback Scale plays the action slower (more than 1) or faster (less than 1). Make the Wave last 36 frames.',
        how: ['Select the <b>Wave</b> strip and set <b>Playback Scale</b> to 1.5 in <b>Action Clip</b>.', 'Or press <kbd>S</kbd> over the NLA and type <kbd>1</kbd><kbd>.</kbd><kbd>5</kbd> <kbd>Enter</kbd>.', '<b>Strip › Apply Scale</b> (<kbd>Ctrl</kbd><kbd>A</kbd>) would move the keys of the action instead, for every strip that uses it.'],
        why: 'Scaling a strip changes the timing without touching the action, so the same action can be quick in one shot and slow in another.',
        start: () => { const st = walkBase(4, { actEnd: 24 }); addWaveTrack(st, 37, { extrap: 'NOTHING', blendIn: 4, blendOut: 4 }); return st; },
        check: st => stripsOf(st, 'Wave').some(s => near(s.end - s.start, 36, 1)),
        solve: st => { firstStrip(st, 'Wave').scale = 1.5; N.validate(st); },
      },
      {
        id: 't4', title: 'Wave twice, one action',
        text: 'The mannequin waves again later. Copy the strip with Linked Duplicate: the copy plays the same action. Duplicate would make a new action (Wave.001), a separate copy that you would have to fix twice.',
        how: ['Select the <b>Wave</b> strip and press <kbd>Alt</kbd><kbd>D</kbd> (Strip › Linked Duplicate). The copy appears right after the original, already selected.', 'Move it later with <kbd>G</kbd>, for example to frame 70.', 'Tab into either strip and change a key: both change. <kbd>U</kbd> (Make Single User) gives a strip its own copy.'],
        why: 'Linked strips are like instances: one source, many uses. Look at the number of users next to the action name in the Action Clip panel.',
        start: () => { const st = walkBase(4, { actEnd: 24 }); addWaveTrack(st, 25, { extrap: 'NOTHING', blendIn: 4, blendOut: 4 }); return st; },
        check: st => stripsOf(st, 'Wave').length >= 2,
        solve: st => { const w = firstStrip(st, 'Wave'); w.select = true; st.sel.strip = w.id; N.duplicate(st, true); const c = N.activeStrip(st); N.moveStrips(st, [c.id], 70 - c.start); },
      },
    ],
  },
  {
    id: 'layers', name: 'Layers and finishing', sub: 'Mute · Solo · Combine · Meta · Bake',
    steps: [
      {
        id: 'l1', title: 'Find the layer that breaks it',
        text: 'Nothing moves: the mannequin is stuck in a T pose. One of the tracks covers everything. Use Solo (the star) to listen to one track at a time, find the culprit and mute it.',
        how: ['Click the <b>star</b> of a track: only that track is evaluated. Click it again to turn Solo off.', 'The top track holds a <b>Test_Pose</b> strip with Hold: frames 1–2 held for the whole scene, on top of everything.', 'Untick the checkbox of that track (or select the strip and press <kbd>H</kbd>, Toggle Muting). Leave Solo off at the end.'],
        why: 'When an animation looks wrong in the NLA, isolate the layers. Muting keeps the strip for later; deleting it does not.',
        start: () => { const st = walkBase(4, { actEnd: 24 }); addWaveTrack(st, 37, { extrap: 'NOTHING', blendIn: 6, blendOut: 6 }); const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Test_Pose', 1, { extrap: 'HOLD' })); st.tracks.push(t); N.validate(st); st.frame = 40; return st; },
        check: st => { if (N.anySolo(st)) return false; return !N.allStrips(st).some(s => s.action === 'Test_Pose' && !s.mute && !st.tracks[N.findStrip(st, s.id).ti].mute); },
        solve: st => { st.tracks[st.tracks.length - 1].mute = true; },
      },
      {
        id: 'l2', title: 'Add or Combine',
        text: 'Breathe is an additive layer: it keys the chest a little bigger (Scale 1.06) and leaning back. With Blending Add the scale is added to the scale below: 1 + 1.06 = 2.06, and the chest doubles. Combine knows that scale must multiply (1 × 1.06) and rotations add: use it for additive layers.',
        how: ['Select the <b>Breathe</b> strip. In <b>Sidebar › Strip</b>, change <b>Blending</b> from Add to <b>Combine</b>.', 'Scrub around frame 25: the chest breathes instead of inflating.', 'Replace would also work for the chest, but it would cancel any chest motion of the tracks below.'],
        why: 'Add, Subtract and Multiply apply the same operation to every channel. Combine picks the right one for each kind of channel, so it is the safe choice for layering corrections on top of a base.',
        start: () => { const st = S({ action: null, range: [1, 97] }); N.withTrack(st, [['Idle', 1, { repeat: 2 }]]); const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Breathe', 1, { repeat: 2, blend: 'ADD', extrap: 'HOLD' })); st.tracks.push(t); N.validate(st); st.frame = 25; return st; },
        check: (st, c) => { const b = firstStrip(st, 'Breathe'); const s = c.evaluate(25).pose['Chest.s']; return b && b.blend === 'COMBINE' && s > 1.04 && s < 1.08; },
        solve: st => { firstStrip(st, 'Breathe').blend = 'COMBINE'; },
      },
      {
        id: 'l3', title: 'One block: a meta strip',
        text: 'The shot is Idle, Walk and Jump, and now it has to start 20 frames later. Group the three strips into a meta strip so they move as one block, then move it.',
        how: ['Select the three strips: click the first, <kbd>Shift</kbd>-click the others (or <kbd>A</kbd> over the NLA).', 'Choose <b>Add › Meta-Strips</b>: one purple strip replaces them.', 'Press <kbd>G</kbd> <kbd>2</kbd><kbd>0</kbd> <kbd>Enter</kbd>. <b>Add › Remove Meta-Strips</b> splits it again.'],
        why: 'A meta strip keeps the timing between the strips while you move the sequence. Inside, each strip keeps its own settings.',
        start: () => { const st = S({ action: null, range: [1, 160] }); N.withTrack(st, [['Idle', 1], ['Walk', 49, { repeat: 2, actEnd: 24 }], ['Jump', 95]]); return st; },
        check: st => st.tracks.some(t => t.strips.some(s => s.type === 'meta' && s.children.length >= 3 && near(s.start, 21, 0.5))),
        solve: st => { st.tracks[0].strips.forEach(s => { s.select = true; }); N.addMeta(st); N.moveStrips(st, [N.activeStrip(st).id], 20); },
      },
      {
        id: 'l4', title: 'Bake it for the game engine',
        text: 'A game engine plays one clip at a time and knows nothing about NLA tracks. Bake the mix (walk with the wave) into a single action: Bake Action evaluates the stack at every frame and keys the result. Then mute the tracks: if it still plays the same, the bake has everything.',
        how: ['Choose <b>Strip › Bake Action</b>. Keep <b>Frame Start</b> 1, <b>End</b> 96 and <b>Frame Step</b> 1, and click <b>Bake</b>.', 'A new action, <b>Action</b>, becomes the active action (orange row) with a key on every frame.', 'Untick the checkbox of every track and play: same motion, now in one action. Rename it, Push Down or export it as one clip.'],
        why: 'Baking freezes the result. In Unity each action (or each NLA strip) becomes a clip; a baked action is a clip with exactly what you saw.',
        start: () => { const st = walkBase(4, { actEnd: 24 }); st.range = [1, 96]; addWaveTrack(st, 37, { extrap: 'NOTHING', blendIn: 6, blendOut: 6 }); return st; },
        check: st => { const a = st.adt.action && st.actions[st.adt.action]; return !!a?.baked && a.baked.end - a.baked.start >= 80 && st.tracks.every(t => t.mute) && !N.anySolo(st); },
        solve: st => { N.bake(st, { start: 1, end: 96, step: 1 }); st.tracks.forEach(t => { t.mute = true; }); },
      },
    ],
  },
];
