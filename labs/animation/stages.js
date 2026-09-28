// Stages, starting scenes, guided steps and their checks for the Animation Lab.
import { key, recalcHandles, evaluate, contacts, tops, strictlyDecreasing, intervals, sharpContact, hangTime, physicsBounce, matchScore, cloneKeys } from './fcurve.js';

export const FPS = 24;
export const RANGE = [1, 72];
// The ball rig, as in the class Blender file: a Root control (the base of the ball, at the floor)
// and two squash & stretch controls. SS_Top moves the top of the ball (pivot at the base: for contacts),
// SS_Bottom moves the bottom of the ball (pivot at the top: to stretch down towards the floor).
// The rig keeps the volume: the ball gets wider when it gets shorter.
export const BALL = 1; // diameter in metres
export const BONES = ['Root', 'SS_Top', 'SS_Bottom', 'Rotation'];
export const CHANNELS = {
  locX: { name: 'X Location', bone: 'Root', color: '#ff6464', axis: 'X' },
  locZ: { name: 'Z Location', bone: 'Root', color: '#4aa3ff', axis: 'Z' },
  scale: { name: 'Uniform Scale', bone: 'Root', color: '#f4d35e', axis: 'XYZ' },
  topZ: { name: 'Z Location', bone: 'SS_Top', color: '#7ee07e', axis: 'Z' },
  botZ: { name: 'Z Location', bone: 'SS_Bottom', color: '#e07ee0', axis: 'Z' },
  rotY: { name: 'Y Euler Rotation', bone: 'Rotation', color: '#ffb347', axis: 'Y', rot: true },
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
const chanAt = (d, id, f) => { const k = d.channels[id]; return k && k.length ? evaluate(k, f) : 0; };
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

export const STAGES = [
  {
    id: 'timing', name: 'Timing', sub: 'Spacing and rhythm',
    channels: ['locX', 'locZ'],
    start: () => ({ channels: { locX: travel(), locZ: curve([[1, 4, AC], [13, 0, AC], [25, 4, AC], [37, 0, AC], [49, 4, AC], [61, 0, AC]], 'LINEAR') } }),
    steps: [
      {
        id: 't1', title: 'Ease in and out',
        text: 'The keys use Linear interpolation: the ball moves at the same speed all the time, like a robot. Look at the Motion Path: the dots are evenly spaced. A real ball slows down at the top of each bounce.',
        how: ['Hover over the Graph Editor and press <kbd>A</kbd> to select all the keyframes.', 'Press <kbd>T</kbd> › <b>Bezier</b>.', 'Play with <kbd>Space</kbd> and look at the dots: close together at the top (slow), far apart near the ground (fast).'],
        why: 'Timing is how many frames an action takes; spacing is how far the object moves between frames. Close dots = slow, far dots = fast.',
        check: d => allBezier(locZ(d)),
        solve: d => { locZ(d).forEach(k => { k.interp = 'BEZIER'; }); },
      },
      {
        id: 't2', title: 'Hit the ground hard',
        text: 'With Bezier, Blender gives every key Auto Clamped handles, so the curve is flat at the contacts too: the ball slows down before it touches the floor and seems to stick to it. A ball hits the ground at full speed: the curve must make a sharp V, not a U.',
        how: ['Click a contact key (value 0), <kbd>Shift</kbd>-click the others.', 'Press <kbd>V</kbd> › <b>Vector</b>.', 'Play again: the ball now bounces off the floor.'],
        why: 'In the Graph Editor the slope of the curve is the speed. Flat = stopped; steep = fast.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)),
        solve: d => { locZ(d).forEach(k => { k.interp = 'BEZIER'; if (k.value <= 0.05) k.handle = V; }); recalcHandles(locZ(d)); },
      },
      {
        id: 't3', title: 'Lose energy',
        text: 'The ball bounces back to the same height every time, as if it never lost energy. Each bounce must be lower than the one before.',
        how: ['Click the key at the top of the second bounce and drag it down (or type its Value in the sidebar, <kbd>N</kbd> panel).', 'Make the third top lower still.', 'Check the heights in the sidebar: they must go down every bounce.'],
        why: 'A real ball loses part of its energy in every contact, so every bounce is lower.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)) && strictlyDecreasing(topValues(locZ(d))),
        solve: d => { const t = tops(locZ(d)); t.forEach((k, i) => { k.value = +(4 * Math.pow(0.55, i)).toFixed(2); }); recalcHandles(locZ(d)); },
      },
      {
        id: 't4', title: 'Faster bounces',
        text: 'Lower bounces are also shorter in time. Right now every bounce lasts 24 frames. Move the keys so each bounce takes fewer frames than the one before (the frame counts appear under the contacts).',
        how: ['Select the keys of the second and third bounce and drag them to the left (frames snap to whole numbers). <kbd>G</kbd> then <kbd>X</kbd> moves them only in time.', 'Keep each top in the middle of its bounce.', 'Aim for something like 16, then 12 frames.'],
        why: 'Timing gives weight and energy: long bounces feel slow and floaty, short bounces feel quick.',
        check: d => allBezier(locZ(d)) && allSharp(locZ(d)) && strictlyDecreasing(topValues(locZ(d))) && strictlyDecreasing(intervals(contacts(locZ(d)))) && intervals(contacts(locZ(d))).length >= 2,
        solve: d => { d.channels.locZ = curve([[1, 4], [13, 0], [21, 2.2], [29, 0], [35, 1.2], [41, 0], [44, 0.5], [47, 0]]); },
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
        how: ['Go to frame 13 (<kbd>↑</kbd> <kbd>↓</kbd> jump between keys, or click the numbers of the Timeline).', 'Click the green <b>SS_Top</b> control above the ball, press <kbd>G</kbd> and move it down (or type <kbd>G</kbd> <kbd>-</kbd><kbd>0</kbd><kbd>.</kbd><kbd>4</kbd> <kbd>Enter</kbd>). Press <kbd>I</kbd> to key it.', 'Do the same at frame 29. The ball gets wider on its own: the rig keeps the volume.'],
        why: 'Squash and stretch shows that an object is soft and makes impacts readable. The pivot at the base keeps the ball on the floor.',
        check: d => { const c = contacts(locZ(d)); return c.length >= 2 && c.slice(0, 2).every(f => shape(d, f).sz <= 0.8 && shape(d, f).bottom >= -0.02); },
        solve: d => { const k = d.channels.topZ; for (const f of contacts(locZ(d)).slice(0, 2)) { const x = k.find(q => q.frame === f); if (x) x.value = -0.4; else k.push(key(f, -0.4)); } recalcHandles(k); },
      },
      {
        id: 's2', title: 'Stretch before and after',
        text: 'Just before and after the contact the ball moves fast and stretches along its path. Before the contact, stretch it downwards with SS_Bottom: the ball reaches for the floor. After the contact, stretch it upwards with SS_Top: the ball leaves the floor. That is why the rig has two controls.',
        how: ['Go to frame 11. Select <b>SS_Bottom</b> (under the ball), <kbd>G</kbd> and move it down about 0.25 m, then <kbd>I</kbd>. The squash of SS_Top already starts here: select SS_Top, <kbd>Alt</kbd><kbd>G</kbd> to bring it back to 0 and <kbd>I</kbd>, so the squash only happens at the contact.', 'Go to frame 15. Select <b>SS_Top</b>, move it up about 0.2 m, then <kbd>I</kbd>.', 'Play with <kbd>Space</kbd>: the ball stretches into the floor and out of it.'],
        why: 'Stretch is a kind of motion blur drawn into the shape: it makes fast movement easier to follow.',
        check: d => { const c = contacts(locZ(d))[0]; if (c == null) return false; return minOver(f => chanAt(d, 'botZ', f), c - 3, c - 1) <= -0.1 && maxOver(f => shape(d, f).sz, c - 3, c - 1) >= 1.12 && maxOver(f => chanAt(d, 'topZ', f), c + 1, c + 3) >= 0.1 && maxOver(f => shape(d, f).sz, c + 1, c + 3) >= 1.1; },
        solve: d => { const c = contacts(locZ(d))[0]; for (const [id, f, v] of [['botZ', c - 2, -0.25], ['topZ', c - 2, 0], ['topZ', c + 2, 0.2]]) { const k = d.channels[id], x = k.find(q => q.frame === f); if (x) x.value = v; else k.push(key(f, v)); recalcHandles(k); } },
      },
      {
        id: 's3', title: 'Round at the top',
        text: 'At the top of each bounce the ball is almost still, so it must be perfectly round again (both controls back at 0). Check the first two tops (frames 1 and 21) after adding your squash and stretch keys.',
        how: ['Scrub to frame 21 and read the Z Scale in the sidebar.', 'If it is not close to 1, select the SS_Top and SS_Bottom keys there and set them to 0.'],
        why: 'Keeping the shape stable when the ball is slow makes the squash at the contact stand out.',
        check: d => { const t = tops(locZ(d)).slice(0, 2); return STAGES[1].steps[0].check(d) && STAGES[1].steps[1].check(d) && t.length === 2 && t.every(k => Math.abs(shape(d, k.frame).sz - 1) <= 0.07); },
        solve: d => { STAGES[1].steps[0].solve(d); STAGES[1].steps[1].solve(d); },
      },
      {
        id: 's4', title: 'Never through the floor',
        text: 'SS_Bottom moves the bottom of the ball, so it can push it through the floor. Play the whole animation and check that the ball never goes below the floor: the sidebar shows the lowest point. At the contact frames SS_Bottom must be back at 0.',
        how: ['Watch the <b>Lowest point</b> in the sidebar: it must not be below 0.', 'If it is, scrub to find the frame and move SS_Bottom (or its key) up.', 'Keep the squash and stretch you made in the previous steps.'],
        why: 'A ball that sinks into the floor breaks the illusion of contact at once. Riggers add the second control so animators can stretch without cheating the contact.',
        check: d => STAGES[1].steps[2].check(d) && lowestPoint(d) >= -0.03,
        solve: d => { STAGES[1].steps[2].solve(d); },
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
        how: ['Drag the second top down to 1 m or less.', 'Move that bounce\'s keys to the left so it lasts 10 frames or fewer (<kbd>G</kbd> <kbd>X</kbd>).', 'Lower or delete (<kbd>X</kbd>) the later bounces.'],
        why: 'Heavy objects lose their energy quickly: low, short bounces and a sudden stop.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER) } }),
        check: d => { const t = topValues(locZ(d)), fb = firstBounce(locZ(d)); return t.length >= 2 && t[1] <= 0.3 * t[0] && fb && fb[1] - fb[0] <= 10 && allSharp(locZ(d)); },
        solve: d => { d.channels.locZ = curve([[1, 4], [13, 0], [18, 0.9], [23, 0], [25.5 | 0, 0.25], [28, 0]]); },
      },
      {
        id: 'w2', title: 'A beach ball',
        text: 'Now a light beach ball: it floats at the top of every bounce. Change only the handles: make the curve stay near the top for longer. Your goal is a hang time of 55% or more in the first bounce (time above 80% of its height).',
        how: ['Click the key at the top of the first bounce (frame 21). Its handles appear.', 'Drag each handle horizontally away from the key. They become Aligned, so the curve stays smooth.', 'Watch the hang time in the sidebar, and the dots of the Motion Path bunching at the top.'],
        why: 'Long handles at the top = the ball spends more frames up there = it feels light. This is how you give weight with curves alone.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER) } }),
        check: d => { const fb = firstBounce(locZ(d)); return fb && hangTime(locZ(d), fb[0], fb[1]) >= 0.55 && allSharp(locZ(d)); },
        solve: d => { const k = locZ(d); for (const t of tops(k)) { const i = k.indexOf(t), p = k[i - 1], n = k[i + 1]; t.handle = 'ALIGNED'; if (p) t.left = { frame: t.frame - (t.frame - p.frame) * 0.85, value: t.value }; if (n) t.right = { frame: t.frame + (n.frame - t.frame) * 0.85, value: t.value }; } },
      },
      {
        id: 'w3', title: 'Match a real bounce',
        text: 'The dashed yellow curve is a real ball simulated with physics. The keys are already at the right frames and heights, but with Linear interpolation. Shape the curve until it matches the reference: 94% or more.',
        how: ['Select all (<kbd>A</kbd>), <kbd>T</kbd> › <b>Bezier</b>, then the contacts <kbd>V</kbd> › <b>Vector</b>.', 'The contacts are still too soft: select a contact and drag its handles up so the curve leaves the ground more steeply.', 'Watch the match score in the sidebar.'],
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
        text: 'A ball that moves forwards also turns. The rig has a Rotation control (the orange circle arrow around the ball): it turns the ball but not its squash, which stays vertical. Right now the ball turns backwards and far too little. A ball rolls without sliding: it turns once for every π × diameter it travels (3.14 m for this 1 m ball). It travels 9 m, so at frame 72 it must have turned about 1031°, forwards.',
        how: ['Click the orange <b>Rotation</b> control. In the viewport, <kbd>R</kbd> rotates it: drag clockwise, or type the degrees (<kbd>R</kbd> <kbd>1</kbd><kbd>0</kbd><kbd>3</kbd><kbd>1</kbd> <kbd>Enter</kbd>) and press <kbd>I</kbd> at frame 72.', 'Or select the key at frame 72 in the Graph Editor and type its Value in the sidebar.', 'Forwards is clockwise in this side view: positive Y rotation.'],
        why: 'A ball that slides without turning, or turns the wrong way, looks as if it were on ice. The rotation sells the contact with the floor.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER), rotY: curve([[1, 0, AC], [72, -360, AC]], 'LINEAR') } }),
        check: d => { const r = rollReport(d); return !r.backwards && r.endErr <= ROLL_TOL; },
        solve: d => { const k = d.channels.rotY, e = k[k.length - 1]; e.value = ROLL; recalcHandles(k); },
      },
      {
        id: 'r2', title: 'Roll at the speed it travels',
        text: 'The amount is right now, but the rotation uses Bezier: it starts slowly and stops slowly, while the ball travels at a constant speed. At the start and at the end the ball slides; in the middle it spins too fast. The rotation must follow the travel at every frame.',
        how: ['Hover the Graph Editor, select both keys of the Y Euler Rotation (<kbd>A</kbd>).', '<kbd>T</kbd> › <b>Linear</b>: the same interpolation as the X Location (click its eye to compare).', 'The sidebar shows the worst slide of the rotation against the travel.'],
        why: 'Rotation and travel are two channels of the same movement: when their curves have the same shape, the ball rolls.',
        start: () => ({ channels: { locX: travel(), locZ: curve(RUBBER), rotY: curve([[1, 0, AC], [72, ROLL, AC]]) } }),
        check: d => rollReport(d).worst <= ROLL_TOL,
        solve: d => { d.channels.rotY.forEach(k => { k.interp = 'LINEAR'; }); },
      },
      {
        id: 'r3', title: 'Slow down together',
        text: 'Now the ball slows down and stops at frame 60 (the X Location eases out). The rotation still goes on at a constant speed until frame 72, so the ball spins on the spot. Make the rotation stop with the travel.',
        how: ['Show the X Location (its eye) to see where the travel stops.', 'Move the last rotation key to frame 60 (<kbd>G</kbd> <kbd>X</kbd>, or type its Frame in the sidebar).', 'Give the rotation the same interpolation as the travel: <kbd>T</kbd> › <b>Bezier</b>.'],
        why: 'When an object slows down, every channel of its movement slows down with it. Copying the shape of one curve into another is daily work in the Graph Editor.',
        start: () => ({ channels: { locX: curve([[1, 0, AC], [60, 9, AC]]), locZ: curve(RUBBER), rotY: curve([[1, 0, AC], [72, ROLL, AC]], 'LINEAR') } }),
        check: d => rollReport(d).worst <= ROLL_TOL,
        solve: d => { const k = d.channels.rotY; k[k.length - 1].frame = 60; k.forEach(q => { q.interp = 'BEZIER'; q.handle = 'AUTO_CLAMPED'; }); recalcHandles(k); },
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
  return { channels: Object.fromEntries(Object.entries(d.channels).map(([k, v]) => [k, cloneKeys(v)])) };
}
