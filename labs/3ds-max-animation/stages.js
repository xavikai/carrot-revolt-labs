// Stages, starting scenes, guided steps and their checks for the Animation Lab.
import { key, recalcHandles, evaluate, contacts, tops, strictlyDecreasing, intervals, sharpContact, hangTime, physicsBounce, matchScore, cloneKeys } from './fcurve.js';
import { evalOutOfRange } from '../_max/out-of-range.js';

export const FPS = 24;
export const RANGE = [1, 72];
// A simple 3ds Max-style helper rig: a Root helper (base of the ball, at the floor)
// and two squash & stretch controls. SS_Top moves the top of the ball (pivot at the base: for contacts),
// SS_Bottom moves the bottom of the ball (pivot at the top: to stretch down towards the floor).
// The rig keeps the volume: the ball gets wider when it gets shorter.
export const BALL = 1; // diameter in metres
export const BONES = ['Root', 'SS_Top', 'SS_Bottom', 'Rotation'];
export const CHANNELS = {
  locX: { name: 'X Position', bone: 'Root', color: '#ff6464', axis: 'X' },
  locZ: { name: 'Z Position', bone: 'Root', color: '#4aa3ff', axis: 'Z' },
  scale: { name: 'Uniform Scale', bone: 'Root', color: '#f4d35e', axis: 'XYZ' },
  topZ: { name: 'Z Position', bone: 'SS_Top', color: '#7ee07e', axis: 'Z' },
  botZ: { name: 'Z Position', bone: 'SS_Bottom', color: '#e07ee0', axis: 'Z' },
  rotY: { name: 'Y Rotation', bone: 'Rotation', color: '#ffb347', axis: 'Y', rot: true },
};
export const channelOf = bone => ({ Root: 'locZ', SS_Top: 'topZ', SS_Bottom: 'botZ', Rotation: 'rotY' })[bone];
// A ball that rolls without sliding turns once every π·diameter metres (positive Y rotation = rolling forwards, +X).
export const rollAngle = dx => dx / (Math.PI * BALL) * 360;

const V = 'VECTOR', AC = 'AUTO_CLAMPED';
// [frame, value, handle?] → keys
function curve(points, interp = 'BEZIER') {
  return recalcHandles(points.map(([f, v, h]) => key(f, v, interp, h || (v <= 0.05 ? V : AC))));
}
const travel = () => curve([[1, 0], [72, 9]], 'LINEAR');
const RUBBER = [[1, 4], [13, 0], [21, 2.6], [29, 0], [35, 1.7], [41, 0], [45, 1.0], [49, 0], [52, 0.5], [55, 0]];
export const REFERENCE = physicsBounce({ start: 1, height: 4, fall: 12, e: 0.6, end: 72 });
const PHYSICS_KEYS = [[1, 4], [13, 0], [20, 1.44], [27, 0], [32, 0.52], [36, 0], [39, 0.19], [41, 0]];

const locZ = d => d.channels.locZ;
const allBezier = keys => keys.slice(0, -1).every(k => k.interp === 'BEZIER');
const contactKeys = keys => keys.filter(k => k.value <= 0.05);
const allSharp = keys => contactKeys(keys).every(k => sharpContact(keys, k));
const topValues = keys => tops(keys).map(k => k.value);
export function firstBounce(keys) {
  const c = contacts(keys);
  return c.length >= 2 ? [c[0], c[1]] : null;
}
// One track at a frame, with its Parameter Curve Out-of-Range Types (Constant unless the student changes them).
export function chanValue(keys, f, types) {
  if (!keys?.length) return 0;
  if (!types || ((types.in || 'constant') === 'constant' && (types.out || 'constant') === 'constant')) return evaluate(keys, f);
  const s = [...keys].sort((a, b) => a.frame - b.frame);
  return evalOutOfRange(s, f, x => evaluate(s, x), types);
}
const chanAt = (d, id, f) => chanValue(d.channels[id], f, d.oor?.[id]);
// Where the ball is: bottom and top points (m), height, and the scale the rig gives it.
export function shape(d, f, over = {}) {
  const root = over.locZ ?? chanAt(d, 'locZ', f), top = over.topZ ?? chanAt(d, 'topZ', f), bot = over.botZ ?? chanAt(d, 'botZ', f);
  const bottom = root + bot, topP = root + BALL + top, h = Math.max(0.1 * BALL, topP - bottom);
  const sz = h / BALL;
  const uniform = d.channels.scale ? Math.max(0.1, over.scale ?? chanAt(d, 'scale', f)) : 1;
  return { root, bottom, top: bottom + h * uniform, center: bottom + h * uniform / 2, sz: sz * uniform, sx: uniform / Math.sqrt(sz) };
}
export const scaleZ = (d, f) => shape(d, f).sz;
export const scaleX = (d, f) => shape(d, f).sx;
const minOver = (fn, a, b) => { let m = Infinity; for (let f = a; f <= b; f += 0.25) m = Math.min(m, fn(f)); return m; };
const maxOver = (fn, a, b) => { let m = -Infinity; for (let f = a; f <= b; f += 0.25) m = Math.max(m, fn(f)); return m; };
export const lowestPoint = d => minOver(f => shape(d, f).bottom, RANGE[0], RANGE[1]);

const SQUASH = () => STAGES.find(s => s.id === 'squash');
export const STAGES = [
  {
    id: 'timing', name: 'Timing', sub: 'Spacing and rhythm',
    channels: ['locX', 'locZ'],
    start: () => ({ channels: { locX: travel(), locZ: curve([[1, 4, AC], [13, 0, AC], [25, 4, AC], [37, 0, AC], [49, 4, AC], [61, 0, AC]], 'LINEAR') } }),
    steps: [
      {
        id: 't1', title: 'Ease in and out',
        text: 'The Z Position keys use linear curves: the ball moves at the same speed all the time. Look at the Motion Paths: the dots are evenly spaced. A real ball slows down at the top of each bounce.',
        how: ['In Track View – Curve Editor, click <b>Z Position</b> under Root in the Controller Window, then, with the pointer over the Key Window, press <kbd>Ctrl</kbd><kbd>A</kbd> to select its keys.', 'Click <b>Set Tangents to Auto</b> in the Track View toolbar.', 'Play with <kbd>/</kbd> and look at the Trajectory dots: close together at the top (slow), far apart near the ground (fast).'],
        why: 'Timing is how many frames an action takes; spacing is how far the object moves between frames. Close dots = slow, far dots = fast.',
        check: d => allBezier(locZ(d)),
        solve: d => { locZ(d).forEach(k => { k.interp = 'BEZIER'; }); },
      },
      {
        id: 't2', title: 'Hit the ground hard',
        text: 'Smooth tangents make the curve flat at the contacts: the ball slows before touching the floor and seems to stick to it. A ball hits the ground fast, so the contact needs a sharp V.',
        how: ['In the Key Window, click a contact key at value 0 and <kbd>Ctrl</kbd>-click the others.', 'Click <b>Set Tangents to Fast</b>: the curve now reaches and leaves each contact in a sharp V.', 'Play again (<kbd>/</kbd>): the ball now bounces off the floor.'],
        why: 'In Track View – Curve Editor the slope of the curve shows speed. Flat means stopped; steep means fast.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)),
        solve: d => { locZ(d).forEach(k => { k.interp = 'BEZIER'; if (k.value <= 0.05) k.handle = V; }); recalcHandles(locZ(d)); },
      },
      {
        id: 't3', title: 'Lose energy',
        text: 'The ball bounces back to the same height every time, as if it never lost energy. Each bounce must be lower than the one before.',
        how: ['Click the key at the top of the second bounce and drag it down, or type its value in the right-hand key field at the bottom of Track View.', 'Make the third top lower still.', 'Check the heights in the Lab readout: they must go down every bounce.'],
        why: 'A real ball loses part of its energy in every contact, so every bounce is lower.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)) && strictlyDecreasing(topValues(locZ(d))),
        solve: d => { const t = tops(locZ(d)); t.forEach((k, i) => { k.value = +(4 * Math.pow(0.55, i)).toFixed(2); }); recalcHandles(locZ(d)); },
      },
      {
        id: 't4', title: 'Faster bounces',
        text: 'Lower bounces are also shorter in time. Right now every bounce lasts 24 frames. Move the keys so each bounce takes fewer frames than the one before (the frame counts appear under the contacts).',
        how: ['With Root selected, drag the second and third bounce keys left in the Track Bar (under the Time Slider) or in Track View – Dope Sheet; keys snap to whole frames.', 'Keep each top in the middle of its bounce.', 'Aim for something like 16, then 12 frames.'],
        why: 'Timing gives weight and energy: long bounces feel slow and floaty, short bounces feel quick.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)) && strictlyDecreasing(topValues(locZ(d))) && strictlyDecreasing(intervals(contacts(locZ(d)))) && intervals(contacts(locZ(d))).length >= 2,
        solve: d => { d.channels.locZ = curve([[1, 4], [13, 0], [21, 2.2], [29, 0], [35, 1.2], [41, 0], [44, 0.5], [47, 0]]); },
      },
    ],
  },
  {
    id: 'weight', name: 'Weight', sub: 'Heavy or light',
    channels: ['locX', 'locZ'],
    independent: true, // each step loads its own starting scene
    steps: [
      {
        id: 'w1', title: 'A bowling ball',
        text: 'This is a rubber ball. Turn it into a heavy bowling ball: it barely bounces. Make the first bounce at most 30% as high as the drop (4 m → 1.2 m or less), and make it short: 10 frames or fewer between the first two contacts.',
        how: ['Drag the second top down to 1 m or less in the Key Window.', 'With Root selected, drag that bounce\'s keys left in the Track Bar so it lasts 10 frames or fewer.', 'Lower the later bounces, or select their keys and press <kbd>Delete</kbd>.'],
        why: 'Heavy objects lose their energy quickly: low, short bounces and a sudden stop.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER) } }),
        check: d => { const t = topValues(locZ(d)), fb = firstBounce(locZ(d)); return t.length >= 2 && t[1] <= 0.3 * t[0] && fb && fb[1] - fb[0] <= 10 && allSharp(locZ(d)); },
        solve: d => { d.channels.locZ = curve([[1, 4], [13, 0], [18, 0.9], [23, 0], [25.5 | 0, 0.25], [28, 0]]); },
      },
      {
        id: 'w2', title: 'A beach ball',
        text: 'Now a light beach ball: it floats at the top of every bounce. Change only the handles: make the curve stay near the top for longer. Your goal is a hang time of 55% or more in the first bounce (time above 80% of its height).',
        how: ['In the Key Window click the key at the first bounce top (frame 21): its tangent handles appear (<b>Show Tangents</b> is on).', 'Drag each tangent handle horizontally away from the key. The key gets custom tangents and the top stays smooth.', 'Watch Hang time in the Lab readout and the Trajectory dots bunching at the top.'],
        why: 'Long handles at the top = the ball spends more frames up there = it feels light. This is how you give weight with curves alone.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER) } }),
        check: d => { const fb = firstBounce(locZ(d)); return fb && hangTime(locZ(d), fb[0], fb[1]) >= 0.55 && allSharp(locZ(d)); },
        solve: d => { const k = locZ(d); for (const t of tops(k)) { const i = k.indexOf(t), p = k[i - 1], n = k[i + 1]; t.handle = 'ALIGNED'; if (p) t.left = { frame: t.frame - (t.frame - p.frame) * 0.85, value: t.value }; if (n) t.right = { frame: t.frame + (n.frame - t.frame) * 0.85, value: t.value }; } },
      },
      {
        id: 'w3', title: 'Match a real bounce',
        text: 'The dashed yellow curve is a real ball simulated with physics. The keys are already at the right frames and heights, but with Linear interpolation. Shape the curve until it matches the reference: 94% or more.',
        how: ['Select the Z Position keys (<kbd>Ctrl</kbd><kbd>A</kbd> over the Key Window) and click <b>Set Tangents to Auto</b>. Then select the contacts and click <b>Set Tangents to Fast</b>.', 'If contacts are still too soft, select one and drag its tangent handles so the curve leaves the ground more steeply.', 'Watch Match in the Lab readout.'],
        why: 'A falling object follows a parabola: slow at the top, fastest at the contact. Animators copy that shape with the handles.',
        reference: true,
        start: () => ({ channels: { locX: travel(), locZ: curve(PHYSICS_KEYS, 'LINEAR') } }),
        check: d => matchScore(locZ(d), REFERENCE, 1, 60) >= 94,
        solve: d => {
          const k = locZ(d); k.forEach(q => { q.interp = 'BEZIER'; }); recalcHandles(k);
          for (const c of k) if (c.value <= 0.05) {
            const i = k.indexOf(c), p = k[i - 1], n = k[i + 1];
            c.handle = 'FREE';
            if (p) c.left = { frame: c.frame - (c.frame - p.frame) / 3, value: 2 * p.value / 3 };
            if (n) c.right = { frame: c.frame + (n.frame - c.frame) / 3, value: 2 * n.value / 3 };
          }
        },
      },
    ],
  },
  {
    id: 'rotation', name: 'Rotation', sub: 'Roll as it travels',
    channels: ['locX', 'locZ', 'rotY'], hide: ['locX', 'locZ'], active: 'rotY',
    independent: true,
    steps: [
      {
        id: 'r1', title: 'Roll the right way',
        text: 'A ball that moves forwards also turns. The rig has a Rotation control (the orange circle arrow around the ball): it turns the ball; the squash & stretch helpers of the last stage will stay vertical. Right now the ball turns backwards and far too little. A ball rolls without sliding: it turns once for every π × diameter it travels (3.14 m for this 1 m ball). It travels 9 m, so at frame 72 it must have turned about 1031°, forwards.',
        how: ['Move to frame 72 and click the orange <b>Rotation</b> helper. Choose <b>Select and Rotate</b> (<kbd>E</kbd>) and type 1031 in the Y field of the Transform Type-In, with <b>Auto Key</b> on (<kbd>N</kbd>), or in Set Key Mode followed by <b>Set Keys</b> (<kbd>K</kbd>).', 'Or select the frame 72 Y Rotation key in the Key Window and type 1031 in the value field at the bottom of Track View (or in Key Info, in the Motion panel).', 'Forwards is clockwise in this side view: positive Y Rotation.'],
        why: 'A ball that slides without turning, or turns the wrong way, looks as if it were on ice. The rotation sells the contact with the floor.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER), rotY: curve([[1, 0, AC], [72, -360, AC]], 'LINEAR') } }),
        check: d => { const r = rollReport(d); return !r.backwards && r.endErr <= ROLL_TOL; },
        solve: d => { const k = d.channels.rotY, e = k[k.length - 1]; e.value = ROLL; recalcHandles(k); },
      },
      {
        id: 'r2', title: 'Roll at the speed it travels',
        text: 'The total turn is right, but Y Rotation uses a smooth curve: it starts and stops slowly while X Position travels at a constant speed. The ball slides at the start and end, then spins too fast in the middle. Its rotation must follow its travel at every frame.',
        how: ['In Track View click the Y Rotation track and select its two keys (<kbd>Ctrl</kbd><kbd>A</kbd> over the Key Window).', 'Click <b>Set Tangents to Linear</b>, like Root\'s X Position track (<kbd>Ctrl</kbd>-click it in the Controller Window to compare both curves).', 'The Lab readout shows the worst slide of rotation against travel.'],
        why: 'Rotation and travel are two channels of the same movement: when their curves have the same shape, the ball rolls.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER), rotY: curve([[1, 0, AC], [72, ROLL, AC]]) } }),
        check: d => rollReport(d).worst <= ROLL_TOL,
        solve: d => { d.channels.rotY.forEach(k => { k.interp = 'LINEAR'; }); },
      },
      {
        id: 'r3', title: 'Slow down together',
        text: 'Now the ball slows and stops at frame 60 (the X Position curve eases out). Y Rotation continues at a constant speed until frame 72, so the ball spins on the spot. Make the rotation stop with the travel.',
        how: ['<kbd>Ctrl</kbd>-click Root\'s X Position in the Controller Window to see where travel stops.', 'Select the Rotation helper and drag its last key to frame 60 in the Track Bar, or type 60 in the frame field at the bottom of Track View.', 'Give rotation the same curve as travel: select both Y Rotation keys and click <b>Set Tangents to Auto</b>.'],
        why: 'When an object slows down, every controller of its movement slows down with it. Matching controller curves is a common task in Track View.',
        start: () => ({ channels: { locX: curve([[1, 0, AC], [60, 9, AC]]), locZ: curve(RUBBER), rotY: curve([[1, 0, AC], [72, ROLL, AC]], 'LINEAR') } }),
        check: d => rollReport(d).worst <= ROLL_TOL,
        solve: d => { const k = d.channels.rotY; k[k.length - 1].frame = 60; k.forEach(q => { q.interp = 'BEZIER'; q.handle = 'AUTO_CLAMPED'; }); recalcHandles(k); },
      },
    ],
  },
  {
    id: 'squash', name: 'Squash & Stretch', sub: 'Flexible, not rigid',
    channels: ['locX', 'locZ', 'topZ', 'botZ'],
    start: () => ({
      channels: {
        locX: travel(),
        locZ: curve([[1, 4], [13, 0], [21, 2.2], [29, 0], [35, 1.1], [40, 0], [44, 0.45], [47, 0]]),
        topZ: curve([1, 13, 21, 29, 35, 40, 44, 47].map(f => [f, 0, AC])),
        botZ: curve([1, 13, 21, 29, 35, 40, 44, 47].map(f => [f, 0, AC])),
      },
    }),
    steps: [
      {
        id: 's1', title: 'Squash on contact',
        text: 'A rubber ball squashes when it hits the ground. The rig has two squash & stretch controls: SS_Top moves the top of the ball, SS_Bottom the bottom. At the contacts the base must stay on the floor, so squash with SS_Top: lower it about 0.4 m at the first two contacts (frames 13 and 29).',
        how: ['Move the Time Slider to frame 13, then click the green <b>SS_Top</b> helper above the ball (or press <kbd>H</kbd> and pick it by name).', 'Turn on <b>Set Key Mode</b> (<kbd>\'</kbd>), choose <b>Select and Move</b> (<kbd>W</kbd>) and drag the helper down about 0.4 m, or type -0.4 in the Z field of the Transform Type-In. Press <b>Set Keys</b> (<kbd>K</kbd>). With <b>Auto Key</b> (<kbd>N</kbd>) the key is made as you move.', 'Do the same at frame 29. The ball gets wider automatically because the rig keeps its volume.'],
        why: 'Squash and stretch shows that an object is soft and makes impacts readable. The pivot at the base keeps the ball on the floor.',
        check: d => { const c = contacts(locZ(d)); return c.length >= 2 && c.slice(0, 2).every(f => shape(d, f).sz <= 0.8 && shape(d, f).bottom >= -0.02); },
        solve: d => { const k = d.channels.topZ; for (const f of contacts(locZ(d)).slice(0, 2)) { const x = k.find(q => q.frame === f); if (x) x.value = -0.4; else k.push(key(f, -0.4)); } recalcHandles(k); },
      },
      {
        id: 's2', title: 'Stretch before and after',
        text: 'Just before and after the contact the ball moves fast and stretches along its path. Before the contact, stretch it downwards with SS_Bottom: the ball reaches for the floor. After the contact, stretch it upwards with SS_Top: the ball leaves the floor. That is why the rig has two controls.',
        how: ['At frame 11 select <b>SS_Bottom</b>, lower it about 0.25 m and press <b>Set Keys</b> (<kbd>K</kbd>). Then select SS_Top, type 0 in the Z field and press <kbd>K</kbd> again, so its squash begins only at contact.', 'At frame 15 select <b>SS_Top</b>, move it up about 0.2 m and press <kbd>K</kbd>. Auto Key (<kbd>N</kbd>) is another way to record each changed helper.', 'Play with <kbd>/</kbd>: the ball stretches into the floor and out of it.'],
        why: 'Stretch is a kind of motion blur drawn into the shape: it makes fast movement easier to follow.',
        check: d => { const c = contacts(locZ(d))[0]; if (c == null) return false; return minOver(f => chanAt(d, 'botZ', f), c - 3, c - 1) <= -0.1 && maxOver(f => shape(d, f).sz, c - 3, c - 1) >= 1.12 && maxOver(f => chanAt(d, 'topZ', f), c + 1, c + 3) >= 0.1 && maxOver(f => shape(d, f).sz, c + 1, c + 3) >= 1.1; },
        solve: d => { const c = contacts(locZ(d))[0]; for (const [id, f, v] of [['botZ', c - 2, -0.25], ['topZ', c - 2, 0], ['topZ', c + 2, 0.2]]) { const k = d.channels[id], x = k.find(q => q.frame === f); if (x) x.value = v; else k.push(key(f, v)); recalcHandles(k); } },
      },
      {
        id: 's3', title: 'Round at the top',
        text: 'At the top of each bounce the ball is almost still, so it must be perfectly round again (both controls back at 0). Check the first two tops (frames 1 and 21) after adding your squash and stretch keys.',
        how: ['Move to frame 21 and read Z Scale now in the Lab readout of Track View.', 'If it is not close to 1, select the SS_Top and SS_Bottom keys at that frame in Track View and type 0 as their value.'],
        why: 'Keeping the shape stable when the ball is slow makes the squash at the contact stand out.',
        check: d => { const t = tops(locZ(d)).slice(0, 2); return SQUASH().steps[0].check(d) && SQUASH().steps[1].check(d) && t.length === 2 && t.every(k => Math.abs(shape(d, k.frame).sz - 1) <= 0.07); },
        solve: d => { SQUASH().steps[0].solve(d); SQUASH().steps[1].solve(d); },
      },
      {
        id: 's4', title: 'Never through the floor',
        text: 'SS_Bottom moves the bottom of the ball, so it can push it through the floor. Play the whole animation and check that the ball never goes below the floor: the Lab readout in Track View shows the lowest point. At contact frames SS_Bottom must be back at 0.',
        how: ['Watch <b>Lowest point</b> in the Lab readout: it must not be below 0.', 'If it is, move the Time Slider to find the frame and move the SS_Bottom key up.', 'Keep the squash and stretch from the previous steps.'],
        why: 'A ball that sinks into the floor breaks the illusion of contact at once. Riggers add the second control so animators can stretch without cheating the contact.',
        check: d => SQUASH().steps[2].check(d) && lowestPoint(d) >= -0.03,
        solve: d => { SQUASH().steps[2].solve(d); },
      },
    ],
  },
  {
    id: 'free', name: 'Your animation', sub: 'All controls and curves', free: true,
    channels: ['locX', 'locZ', 'scale', 'topZ', 'botZ', 'rotY'], hide: [], active: 'locZ',
    start: () => ({ channels: {
      locX: curve([[1, 0], [72, 0]]),
      locZ: curve([[1, 4], [72, 4]]),
      scale: curve([[1, 1], [72, 1]]),
      topZ: curve([[1, 0], [72, 0]]),
      botZ: curve([[1, 0], [72, 0]]),
      rotY: curve([[1, 0], [72, 0]]),
    } }),
    steps: [],
  },
];

// How well the Rotation follows the travel: the rotation the ball needs at each frame to roll without sliding.
export function rollReport(d, from = RANGE[0], to = RANGE[1]) {
  const x0 = chanAt(d, 'locX', from), r0 = chanAt(d, 'rotY', from);
  const need = f => r0 + rollAngle(chanAt(d, 'locX', f) - x0), total = Math.max(1, Math.abs(need(to) - r0));
  let worst = 0, worstF = from;
  for (let f = from; f <= to; f += 0.5) { const e = Math.abs(chanAt(d, 'rotY', f) - need(f)); if (e > worst) { worst = e; worstF = f; } }
  const end = chanAt(d, 'rotY', to) - r0, want = need(to) - r0;
  return { end, want, endErr: Math.abs(end - want) / total, worst: worst / total, worstF: Math.round(worstF), backwards: want * end < 0 };
}
const ROLL_TOL = 0.05;
const ROLL = +rollAngle(9).toFixed(1); // 9 m of travel

export function startData(stage, stepIndex = 0) {
  const d = stage.independent ? stage.steps[stepIndex].start() : stage.start();
  return d;
}
export function cloneData(d) {
  const c = { channels: Object.fromEntries(Object.entries(d.channels).map(([k, v]) => [k, cloneKeys(v)])) };
  if (d.oor) c.oor = JSON.parse(JSON.stringify(d.oor));
  return c;
}
