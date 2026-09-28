// Stages of the Stage Lighting Lab. Every step loads its own state of the rig.
import * as R from './rig.js';

const st0 = (fn) => { const st = R.defaultState(); if (fn) fn(st); return st; };
const on = (st, id, dim = 1) => { st.fx[id].dim = dim; };
export const TYPE_ORDER = ['profile', 'fresnel', 'pc', 'par', 'moving'];
export const AMBER = { dim: [150, 156], r: [230, 255], g: [110, 170], b: [0, 30], w: [0, 20] };
export const DIP_TARGET = 37;
export const FACE_MIN = 400, BACK_MIN = 150;
export const keyFill = st => { const a = R.faceFrom(st, 'fohL'), b = R.faceFrom(st, 'fohR'); const hi = Math.max(a, b), lo = Math.min(a, b); return lo > 1 ? hi / lo : Infinity; };
export const moverOnDancer = st => st.fx.mover.dim >= 0.5 && R.axisDistance(R.FIX.mover, st.fx.mover, [R.ACTOR2.x, 1.2, R.ACTOR2.z]) <= 0.35;
export const cycBlue = st => { const c = R.hueSat(R.lightColor(R.FIX.cycL, st.fx.cycL).hex), d = R.hueSat(R.lightColor(R.FIX.cycR, st.fx.cycR).hex); return [c, d].every(x => x.h >= 200 && x.h <= 250 && x.s >= 0.5) && st.fx.cycL.dim >= 0.5 && st.fx.cycR.dim >= 0.5; };
export const parWarm = st => ['parL', 'parR'].every(id => { const x = R.hueSat(R.lightColor(R.FIX[id], st.fx[id]).hex); return st.fx[id].dim >= 0.4 && x.h >= 15 && x.h <= 50 && x.s >= 0.3; });
const inR = (v, [a, b]) => v >= a && v <= b;
export const amberOk = st => { const d = R.dmxOf(R.FIX.parL, st.fx.parL); return inR(d[0], AMBER.dim) && inR(d[1], AMBER.r) && inR(d[2], AMBER.g) && inR(d[3], AMBER.b) && inR(d[4], AMBER.w); };
const warmPar = st => { for (const id of ['parL', 'parR']) { st.fx[id].rgbw = [1, 0.55, 0.12, 0.2]; st.fx[id].dim = 0.7; } };
const blueCyc = st => { for (const id of ['cycL', 'cycR']) { st.fx[id].rgbw = [0.1, 0.25, 1]; st.fx[id].dim = 0.8; } };
const lookFace = st => { on(st, 'fohL', 1); on(st, 'fohR', 0.55); on(st, 'back', 0.8); };

export const STAGES = [
  {
    id: 'fixtures', name: 'The fixtures', sub: 'Profile · Fresnel · PC · LED · moving head',
    steps: [
      {
        id: 'f1', title: 'Meet the fixtures',
        text: 'Every kind of fixture makes a different beam. Turn on at least one fixture of each kind (a profile, a Fresnel, a PC, an LED PAR and the moving head) and compare their beams on the stage: the edge, the size, the colour of the light.',
        how: ['Click a fixture in the 3D view or in the <b>Fixtures</b> list.', 'Raise its <b>Dimmer</b> in the Inspector (or press <kbd>F</kbd> for full, <kbd>0</kbd> for off).', 'Read what each kind is for in the Inspector.'],
        why: 'Choosing the fixture is the first decision of a lighting design: a hard-edged profile, a soft Fresnel and an LED wash tell different stories.',
        start: () => st0(),
        check: (st, c) => TYPE_ORDER.every(t => c.flags.seen?.includes(t)),
        solve: (st, flags) => { flags.seen = [...TYPE_ORDER]; on(st, 'fohL'); on(st, 'washL'); on(st, 'pcC'); on(st, 'parL'); on(st, 'mover'); st.fx.mover.tilt = 30; },
        focus: 'fohL',
      },
      {
        id: 'f2', title: 'Hard or soft',
        text: 'The speaker at the lectern needs a special: a circle of light with a sharp edge, only on the lectern. The rest of the stage gets a soft wash that blends without lines. Use the right kind of fixture for each and focus them.',
        how: ['Turn on the <b>Lectern special</b> (a profile) and set <b>Edge</b> to hard (0.2 or less).', 'Turn on a <b>Fresnel</b> wash and flood it (<b>Zoom</b> 40° or more).', 'Look at the edges on the floor: hard circle, soft pool.'],
        why: 'The profile has a lens that can be focused, from hard to soft. The Fresnel always gives a soft edge, so several Fresnels blend into an even wash.',
        start: () => st0(st => { st.fx.special.edge = 0.55; }),
        check: st => st.fx.special.dim >= 0.5 && st.fx.special.edge <= 0.2 && ['washL', 'washR'].some(id => st.fx[id].dim >= 0.5 && st.fx[id].zoom >= 40),
        solve: st => { on(st, 'special'); st.fx.special.edge = 0.1; on(st, 'washL'); on(st, 'washR'); st.fx.washL.zoom = st.fx.washR.zoom = 48; },
        focus: 'special',
      },
    ],
  },
  {
    id: 'dmx', name: 'DMX and patch', sub: 'Channels · addresses · DIP switches',
    steps: [
      {
        id: 'd1', title: 'Channels and values',
        text: 'A lighting desk talks to the fixtures in DMX: 512 channels, each with a value from 0 to 255. The LED PAR left uses 5 channels: Dimmer, Red, Green, Blue, White. Make it amber at 60 % by typing the DMX values in the DMX monitor.',
        how: ['Select the <b>LED PAR left</b>: its channels light up in the <b>DMX</b> monitor (address 11 to 15).', 'Dimmer 60 % = 0.6 × 255 ≈ <b>153</b>.', 'Amber: Red 255, Green about 140, Blue 0, White 0.'],
        why: 'Every desk, from Lightkey to a big console, ends up sending these numbers. A percentage in the desk is only a friendlier way to show 0–255.',
        dmxEdit: true,
        start: () => st0(),
        check: st => amberOk(st),
        solve: st => { const f = R.FIX.parL, s = st.fx.parL; [153, 255, 140, 0, 0].forEach((v, i) => R.setChannel(f, s, i, v)); },
        focus: 'parL',
      },
      {
        id: 'd2', title: 'Patch without overlaps',
        text: 'Someone patched the rig in a hurry: some fixtures share channels, so moving one moves the other. Give every fixture its own start address so that no channels overlap and everything fits in the universe (1–512).',
        how: ['Open the <b>Patch</b> table: each row shows the address and the footprint (how many channels the fixture uses).', 'A fixture at address 11 with 5 channels uses 11–15: the next one can start at 16.', 'Red rows overlap. Change their addresses until none is red.'],
        why: 'In Lightkey this is the Patch view. Patching tells the software which channels each fixture listens to; the same address must be set on the fixture itself.',
        patch: true,
        start: () => st0(st => { st.fx.parR.addr = 13; st.fx.cycL.addr = 18; st.fx.mover.addr = 26; st.fx.pcC.addr = 5; }),
        check: st => R.patchProblems(st).length === 0,
        solve: st => { for (const f of R.FIXTURES) st.fx[f.id].addr = R.DEFAULT_ADDR[f.id]; },
      },
      {
        id: 'd3', title: 'The address on the fixture',
        text: 'Old dimmers and many fixtures set their DMX address with DIP switches: each switch is worth a power of two (1, 2, 4, 8…) and the address is the sum of the switches that are on. Set this dimmer to address 37.',
        how: ['37 = 32 + 4 + 1.', 'Turn on switches <b>6</b> (32), <b>3</b> (4) and <b>1</b> (1).', 'The panel shows the address the switches make.'],
        why: 'It is binary counting. Newer fixtures have a small display instead, but the address means the same: the first channel the fixture listens to.',
        dip: true,
        start: () => st0(),
        check: st => R.dipAddress(st.dip) === DIP_TARGET,
        solve: st => { st.dip = R.dipFor(DIP_TARGET); },
      },
    ],
  },
  {
    id: 'design', name: 'Designing the light', sub: 'Face · colour · aiming',
    steps: [
      {
        id: 'l1', title: 'Light the face',
        text: 'The singer stands centre stage. Light her face from the front with the two FOH profiles at 45°, one brighter (key) than the other (fill), and separate her from the background with the backlight. The face needs at least 400 lux.',
        how: ['Raise <b>FOH left</b> and <b>FOH right</b>: the panel measures the light on the face in lux.', 'Keep one brighter than the other: a key-to-fill ratio between 1.5 and 3.', 'Add the <b>Backlight</b> (at least 150 lux on the head and shoulders).'],
        why: 'Two front lights from 45° show the face without flattening it; the backlight draws a rim that separates the actor from the set, as in the three-point lighting of photography.',
        start: () => st0(),
        check: st => R.faceLux(st) >= FACE_MIN && (() => { const k = keyFill(st); return k >= 1.5 && k <= 3; })() && R.backLux(st) >= BACK_MIN,
        solve: st => lookFace(st),
        focus: 'fohL',
      },
      {
        id: 'l2', title: 'Warm and cold',
        text: 'A summer evening: a deep blue sky on the cyclorama and a warm light on the actors. Mix the colours of the LED fixtures: the cyc battens blue, the LED PARs warm amber.',
        how: ['Select a <b>Cyc batten</b> and mix blue with its <b>Red / Green / Blue</b> sliders (a little green gives a sky blue).', 'Select the <b>LED PARs</b> and mix a warm colour: a lot of red, some green, very little blue.', 'Both battens and both PARs at 40–50 % or more.'],
        why: 'Cold and warm together give depth: the eye reads the warm light as near and the blue as far away. With tungsten fixtures you would use gels, like L201 (blue) and L204 (orange).',
        start: () => st0(st => { lookFace(st); }),
        check: st => cycBlue(st) && parWarm(st),
        solve: st => { blueCyc(st); warmPar(st); },
        focus: 'cycL',
      },
      {
        id: 'l3', title: 'Aim the moving head',
        text: 'The dancer waits up stage left. Point the moving head at her: its pan turns it around and its tilt lifts the beam. Use a narrow beam and a colour from the wheel.',
        how: ['Select the <b>Moving head</b> and turn it on.', 'Change <b>Pan</b> and <b>Tilt</b> until the beam hits the dancer (the panel shows how far the beam passes from her).', 'Pick a colour on the wheel. In DMX, pan and tilt each use two channels (coarse and fine).'],
        why: 'A moving head replaces many fixed fixtures: the same light can follow an actor, change colour and size. Its position is a number, so it can be recorded in a cue.',
        start: () => st0(st => { lookFace(st); blueCyc(st); }),
        check: st => moverOnDancer(st),
        solve: st => { const f = R.FIX.mover, s = st.fx.mover; s.dim = 1; s.zoom = 14; s.wheel = 5; const v = [R.ACTOR2.x - f.pos[0], 1.2 - f.pos[1], R.ACTOR2.z - f.pos[2]]; const h = Math.hypot(v[0], v[2]); s.tilt = Math.atan2(h, -v[1]) * 180 / Math.PI; s.pan = Math.atan2(v[0], v[2]) * 180 / Math.PI; },
        focus: 'mover',
      },
    ],
  },
  {
    id: 'cues', name: 'Cues', sub: 'Record · fade · GO',
    steps: [
      {
        id: 'q1', title: 'Record the cues',
        text: 'A show is a list of looks, called cues. Build the preset (only the blue cyc, the singer in the dark) and record it as cue 1. Then light the singer and record cue 2.',
        how: ['Build the first look: cyc battens blue, every other fixture at 0. Press <b>Record</b>.', 'Build the second look: add the FOH profiles and the backlight on the singer (400 lux or more on the face). Press <b>Record</b>.', 'Click a cue in the list to see its look again.'],
        why: 'In Lightkey you build a look in the Live View and store it as a cue in a cue list. The operator only presses GO during the show.',
        cuelist: true,
        start: () => st0(st => { blueCyc(st); }),
        check: st => st.cues.length >= 2 && R.faceLux(R.withLook(st, st.cues[0].look)) < 50 && R.cycLux(R.withLook(st, st.cues[0].look)) > 20 && R.faceLux(R.withLook(st, st.cues[1].look)) >= FACE_MIN,
        solve: st => { const a = R.defaultState(); blueCyc(a); const b = R.cloneState(a); lookFace(b); st.cues = [{ name: 'Preset', fade: 2, look: R.lookOf(a) }, { name: 'Song', fade: 3, look: R.lookOf(b) }]; R.applyLook(st, st.cues[1].look); },
      },
      {
        id: 'q2', title: 'Fades and blackout',
        text: 'Timing is part of the design. Give cue 2 a slow fade of at least 3 seconds, add a last cue that is a blackout, then run the whole show with GO from the first cue to the last.',
        how: ['Select cue 2 and set its <b>Fade</b> to 3 s or more.', 'Take every fixture to 0 (<b>Blackout</b> button) and <b>Record</b> the last cue.', 'Press <b>GO</b> until the list reaches the last cue: watch the fades on stage.'],
        why: 'The same two looks feel completely different with a 1 s snap or a 5 s fade. The fade time belongs to the cue, not to the operator.',
        cuelist: true,
        start: () => st0(st => { const a = R.defaultState(); blueCyc(a); const b = R.cloneState(a); lookFace(b); st.cues = [{ name: 'Preset', fade: 2, look: R.lookOf(a) }, { name: 'Song', fade: 1, look: R.lookOf(b) }]; }),
        check: (st, c) => st.cues.length >= 3 && st.cues[1].fade >= 3 && R.isBlackout(st.cues[st.cues.length - 1].look) && !!c.flags.ran,
        solve: (st, flags) => { st.cues[1].fade = 4; const z = R.defaultState(); st.cues.push({ name: 'Blackout', fade: 2, look: R.lookOf(z) }); flags.ran = true; st.live = st.cues.length - 1; R.applyLook(st, z.fx ? R.lookOf(z) : z); },
      },
    ],
  },
];
