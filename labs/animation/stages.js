// Stages, starting scenes, guided steps and their checks for the Animation Lab.
// The stages follow the bouncing ball as it is taught in class (see docs/animation-teaching-notes.md).
import { key, recalcHandles, evaluate, contacts, tops, strictlyDecreasing, intervals, sharpContact, hangTime, physicsBounce, matchScore, cloneKeys } from './fcurve.js';

export const FPS = 24;
export const RANGE = [0, 100]; // as the class scene: frames 0 to 100
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

const stageById = id => STAGES.find(s => s.id === id);
const C = 0.05; // a key at or below this height is a contact

// The bounce as it is built in class. First a key every 10 frames (tops at 0, 20, 40…, contacts at 10, 30, 50…),
// then the bounces brought closer in time: contacts 10 · 28 · 43 · 56 · 67 · 73, tops 20 · 36 · 50 · 62 · 70.
const PATTERN = [[0, 4], [10, 0], [20, 2.6], [30, 0], [40, 1.7], [50, 0], [60, 1.0], [70, 0], [80, 0.5], [90, 0]];
const CLASS_BOUNCE = [[0, 4], [10, 0], [20, 2.6], [28, 0], [36, 1.7], [43, 0], [50, 1.0], [56, 0], [62, 0.5], [67, 0], [70, 0.2], [73, 0]];
export const TRAVEL_END = 73; // the last contact: the ball stops travelling here
const TRAVEL = 9;             // metres
const smooth = pts => curve(pts.map(([f, v]) => [f, v, AC])); // new keys get automatic (smooth) tangents
const classBounce = () => curve(CLASS_BOUNCE);                 // with sharp contacts
const classTravel = () => curve([[0, 0, AC], [TRAVEL_END, TRAVEL, AC]]);
const still = v => curve([[0, v, AC]]);
function setKey(keys, f, v) { const x = keys.find(q => q.frame === f); if (x) x.value = v; else keys.push(key(f, v)); recalcHandles(keys); }

// Keys on exactly these frames, alternating top and contact, every top lower than the one before.
export function blocked(keys, frames) {
  if (!keys || !frames.every(f => keys.some(k => k.frame === f))) return false;
  const v = frames.map(f => evaluate(keys, f)), topV = v.filter((_, i) => i % 2 === 0);
  return v.every((x, i) => i % 2 === 0 ? x > C : x <= C) && topV.every((x, i) => i === 0 || x < topV[i - 1]);
}
// Bounces brought closer in time: every interval shorter, every top lower, and the ball settles before frame 80.
export function spaced(keys) {
  const c = contacts(keys);
  return c.length >= 4 && strictlyDecreasing(intervals(c)) && strictlyDecreasing(topValues(keys)) && c[c.length - 1] <= 80;
}
// The travel: where it ends, how far it goes, and how it gets there.
export function travelReport(d) {
  const k = d.channels.locX || [], end = k.length ? k[k.length - 1].frame : RANGE[0], x = f => chanAt(d, 'locX', f);
  const dist = x(end) - x(RANGE[0]);
  let mono = true;
  for (let f = RANGE[0]; f < RANGE[1]; f += 0.5) if (x(f + 0.5) < x(f) - 1e-3) mono = false;
  const avg = dist / Math.max(1, end - RANGE[0]), endSpeed = (x(end) - x(end - 2)) / 2;
  return { end, dist, mono, flat: Math.abs(x(RANGE[1]) - x(end)) < 1e-3, easeOut: dist > 0 && endSpeed < 0.6 * avg };
}
// The rotation key near the end of the travel (frames 65–76) turns the ball forwards as much as the travel needs.
export function rollsWithTravel(d) {
  const k = d.channels.rotY || [], a = [...k].reverse().find(q => q.frame >= 65 && q.frame <= 76);
  if (!a) return false;
  const need = rollAngle(chanAt(d, 'locX', a.frame) - chanAt(d, 'locX', RANGE[0])), got = chanAt(d, 'rotY', a.frame) - chanAt(d, 'rotY', RANGE[0]);
  return need > 0 && Math.abs(got - need) <= 0.1 * need;
}
// A last key from frame 90 on, never turning backwards, with a flat end.
export function spinStops(d) {
  if (!rollsWithTravel(d)) return false;
  const k = d.channels.rotY, e = k[k.length - 1], r = f => chanAt(d, 'rotY', f);
  if (e.frame < 90) return false;
  for (let f = RANGE[0]; f < RANGE[1]; f += 0.5) if (r(f + 0.5) < r(f) - 0.5) return false;
  return Math.abs(r(e.frame) - r(e.frame - 1)) <= 1.5;
}
const firstContacts = d => contacts(locZ(d)).slice(0, 2);
// Squashed at the first two contacts, round the frame before, and the shape back (or stretched) three frames later.
function briefSquash(d) {
  const c = firstContacts(d);
  return c.length === 2 && c.every(f => { const s = shape(d, f); return s.sz <= 0.8 && s.bottom >= -0.02 && shape(d, f - 1).sz >= 0.95 && shape(d, f + 3).sz >= 0.95; });
}
function shortStretch(d) { const c = firstContacts(d)[0]; return briefSquash(d) && maxOver(f => shape(d, f).sz, c + 1, c + 3) >= 1.1; }
function roundTops(d) { const t = tops(locZ(d)).slice(0, 2); return shortStretch(d) && t.length === 2 && t.every(k => Math.abs(shape(d, k.frame).sz - 1) <= 0.07); }

// The order of the stages follows the class: block the bounce (keys every 10 frames), bring the bounces closer in time,
// travel, rotation, and squash & stretch. Weight is an extra stage at the end.
export const STAGES = [
  {
    id: 'keys', name: 'Keys', sub: 'Block the bounce',
    channels: ['locX', 'locZ'],
    start: () => ({ channels: { locX: still(0), locZ: still(4) } }),
    steps: [
      {
        id: 'k1', title: 'First bounce: 0, 10 and 20',
        text: 'We animate the controls of the class rig, never the mesh: the Root control is the base of the ball. The scene runs from frame 0 to 100 and Root starts in the air, 4 m high, with a key at frame 0. Make the first bounce: the ball reaches the floor at frame 10 and goes up again at frame 20, lower than at the start.',
        how: ['Go to frame 10 (click the numbers at the top of the Timeline).', 'Click the <b>Root</b> control, press <kbd>G</kbd> <kbd>Z</kbd> and move it down to the floor (or type <kbd>G</kbd> <kbd>Z</kbd> <kbd>-</kbd><kbd>4</kbd> <kbd>Enter</kbd>). Press <kbd>I</kbd> to key it.', 'At frame 20 lift it again, lower than at the start (for example <kbd>G</kbd> <kbd>Z</kbd> <kbd>2</kbd><kbd>.</kbd><kbd>6</kbd> <kbd>Enter</kbd>), and press <kbd>I</kbd>.'],
        why: 'First we block the main poses (up, contact, up) with a simple rhythm. Spacing and details come later.',
        check: d => blocked(locZ(d), [0, 10, 20]),
        solve: d => { setKey(locZ(d), 10, 0); setKey(locZ(d), 20, 2.6); },
      },
      {
        id: 'k2', title: 'The vertical sequence',
        text: 'First pattern: one key every 10 frames. Go on until frame 50: contact at 30, a lower top at 40 and contact at 50. Every top must be lower than the one before: the ball loses energy.',
        how: ['At frame 30 put Root back on the floor and press <kbd>I</kbd>.', 'At frame 40 lift it, lower than at frame 20 (for example 1.7 m), and at frame 50 put it on the floor again. Key each pose with <kbd>I</kbd>.', 'Play with <kbd>Space</kbd> and look at the Z Location in the Graph Editor: it draws the bounces, each one lower.'],
        why: 'An even rhythm, a key every 10 frames, is easy to read and to correct. It is the base that the next stage compresses in time.',
        check: d => blocked(locZ(d), [0, 10, 20, 30, 40, 50]),
        solve: d => { stageById('keys').steps[0].solve(d); setKey(locZ(d), 30, 0); setKey(locZ(d), 40, 1.7); setKey(locZ(d), 50, 0); },
      },
    ],
  },
  {
    id: 'timing', name: 'Timing', sub: 'Spacing and rhythm',
    channels: ['locX', 'locZ'],
    start: () => ({ channels: { locX: still(0), locZ: smooth(PATTERN) } }),
    steps: [
      {
        id: 'tm1', title: 'Bring the bounces closer in time',
        text: 'The pattern goes on until frame 90, but every bounce still lasts 20 frames. Lower bounces are also shorter: move the keys so the intervals get shorter as the height goes down. In class the contacts end at 10 · 28 · 43 · 56 · 67 · 73 and the tops at 20 · 36 · 50 · 62 · 70.',
        how: ['Select keys in the Timeline, the Dope Sheet or the Graph Editor and move them left with <kbd>G</kbd> (in the Graph Editor, <kbd>G</kbd> then <kbd>X</kbd> moves them only in time). Frames snap to whole numbers.', 'Start with the second contact (30 → 28) and move each later key a bit more: 40 → 36, 50 → 43, 60 → 50, 70 → 56…', 'Keep each top in the middle of its bounce. The frame counts in the sidebar must go down every bounce.'],
        why: 'Timing gives weight: as the ball loses energy, every bounce is lower and shorter. Equal intervals look mechanical.',
        check: d => spaced(locZ(d)),
        solve: d => { d.channels.locZ = smooth(CLASS_BOUNCE); },
      },
      {
        id: 'tm2', title: 'Hit the ground hard',
        text: 'With Bezier, Blender gives every key Auto Clamped handles, so the curve is flat at the contacts too: the ball slows down before it touches the floor and seems to stick to it. A ball hits the ground at full speed: the curve must make a sharp V, not a U.',
        how: ['Click a contact key (value 0), <kbd>Shift</kbd>-click the others.', 'Press <kbd>V</kbd> › <b>Vector</b>.', 'Play again: the ball now bounces off the floor.'],
        why: 'In the Graph Editor the slope of the curve is the speed. Flat = stopped; steep = fast.',
        check: d => spaced(locZ(d)) && allSharp(locZ(d)),
        solve: d => { stageById('timing').steps[0].solve(d); locZ(d).forEach(k => { k.interp = 'BEZIER'; if (k.value <= C) k.handle = V; }); recalcHandles(locZ(d)); },
      },
    ],
  },
  {
    id: 'travel', name: 'Travel', sub: 'Movement that gives weight',
    channels: ['locX', 'locZ'], hide: ['locZ'], active: 'locX',
    start: () => ({ channels: { locX: still(0), locZ: classBounce() } }),
    steps: [
      {
        id: 'd1', title: 'Travel that gives weight',
        text: 'The bounce is ready, but the ball goes up and down on the spot. On the same Root control, animate the X Location: frame 0 is the starting point and frame 73, the last contact, the end of the path. After that the curve must stay flat: the ball stops travelling.',
        how: ['Go to frame 73 and click the <b>Root</b> control.', 'Press <kbd>G</kbd> <kbd>X</kbd> and move it forwards about 9 m (or type <kbd>G</kbd> <kbd>X</kbd> <kbd>9</kbd> <kbd>Enter</kbd>), then press <kbd>I</kbd>.', 'In the Graph Editor the X Location goes to its final value and stays flat after frame 73. Keep Bezier with Auto Clamped handles so the travel slows down before it stops.'],
        why: 'The travel eases into the end of the path: the ball slows down as it loses energy and stops with its last contact. That deceleration is what gives it weight.',
        check: d => { const r = travelReport(d); return r.end >= 70 && r.end <= 76 && r.dist >= 3 && r.mono && r.flat && r.easeOut; },
        solve: d => { d.channels.locX = classTravel(); },
      },
    ],
  },
  {
    id: 'rotation', name: 'Rotation', sub: 'Roll as it travels',
    channels: ['locX', 'locZ', 'rotY'], hide: ['locZ'], active: 'rotY',
    start: () => ({ channels: { locX: classTravel(), locZ: classBounce(), rotY: still(0) } }),
    steps: [
      {
        id: 'ro1', title: 'The rotation goes with the path',
        text: 'A ball that travels also turns. The rig has a Rotation control (the orange circle arrow around the ball): it turns the ball but not its squash, which stays vertical. A ball that rolls without sliding turns once every π × diameter (3.14 m for this 1 m ball). Key the rotation near the end of the travel (between frames 70 and 73), forwards and as much as the travel needs: Needed to roll in the sidebar.',
        how: ['Go to frame 73 and click the orange <b>Rotation</b> control. Press <kbd>R</kbd> and type the degrees (<kbd>R</kbd> <kbd>1</kbd><kbd>0</kbd><kbd>3</kbd><kbd>1</kbd> <kbd>Enter</kbd>), then <kbd>I</kbd>.', 'Forwards is clockwise in this side view: positive Y rotation.', 'Show the X Location (its eye) to compare: both curves should have a similar shape.'],
        why: 'A ball that slides without turning, or turns the wrong way, looks as if it were on ice. The rotation sells the contact with the floor.',
        check: d => rollsWithTravel(d),
        solve: d => { setKey(d.channels.rotY, TRAVEL_END, ROLL); },
      },
      {
        id: 'ro2', title: 'The spin comes to a stop',
        text: 'In class the rotation curve has an adjustment key near frame 70 and a last key near frame 99. Add that last key so the ball turns a little more and then stops: the end of the curve must be flat, and it must never turn backwards.',
        how: ['Go to frame 99, turn the Rotation control a little more forwards (for example <kbd>R</kbd> <kbd>6</kbd><kbd>0</kbd> <kbd>Enter</kbd>) and press <kbd>I</kbd>.', 'In the Graph Editor select the last rotation key and check that its handles are <b>Auto Clamped</b> (<kbd>V</kbd> › Auto Clamped): the end of the curve becomes flat.', 'Play with <kbd>Space</kbd>: the spin slows down until it stops.'],
        why: 'A flat slope means zero speed. When the last key of a curve is flat, the movement settles instead of stopping dead.',
        check: d => spinStops(d),
        solve: d => { const k = d.channels.rotY; setKey(k, TRAVEL_END, ROLL); setKey(k, 99, ROLL + 60); },
      },
    ],
  },
  {
    id: 'squash', name: 'Squash & Stretch', sub: 'Flexible, not rigid',
    channels: ['locX', 'locZ', 'topZ', 'botZ'],
    start: () => ({ channels: { locX: classTravel(), locZ: classBounce(), topZ: still(0), botZ: still(0) } }),
    steps: [
      {
        id: 'sq1', title: 'Squash on contact',
        text: 'The rig has two squash & stretch controls: SS_Top moves the top of the ball and SS_Bottom the bottom. At a contact the base must stay on the floor, so we squash with SS_Top: bring it closer to SS_Bottom, about 0.4 m down, at the first two contacts (frames 10 and 28). The squash is brief: one frame before the contact the ball is still round, and soon after it gets its shape back.',
        how: ['Go to frame 9, click the green <b>SS_Top</b> control above the ball and press <kbd>I</kbd>: this first adjustment keys it at 0 and keeps the ball round.', 'At frame 10 press <kbd>G</kbd> and move it down (or type <kbd>G</kbd> <kbd>-</kbd><kbd>0</kbd><kbd>.</kbd><kbd>4</kbd> <kbd>Enter</kbd>), then <kbd>I</kbd>. The ball gets wider by itself: the rig keeps its volume.', 'At frame 12 bring it back to 0 (<kbd>Alt</kbd><kbd>G</kbd>) and press <kbd>I</kbd>. Do the same around the second contact: keys at 27, 28 and 30.'],
        why: 'Squash and stretch shows that an object is soft and makes impacts readable. The pivot at the base keeps the ball on the floor.',
        check: d => briefSquash(d),
        solve: d => { const k = d.channels.topZ; for (const c of firstContacts(d)) { setKey(k, c - 1, 0); setKey(k, c, -0.4); setKey(k, c + 2, 0); } },
      },
      {
        id: 'sq2', title: 'A short stretch after the contact',
        text: 'After a contact the ball leaves the floor fast, so the next movement can have a short stretch: lift SS_Top a little just after the first contact and bring it back to 0 before the top. Before a contact you can also stretch the ball down with SS_Bottom, but it is optional.',
        how: ['At frame 12 select <b>SS_Top</b>, move it up about 0.2 m (<kbd>G</kbd> <kbd>0</kbd><kbd>.</kbd><kbd>2</kbd> <kbd>Enter</kbd>) and press <kbd>I</kbd>.', 'At frame 15 bring it back to 0 (<kbd>Alt</kbd><kbd>G</kbd>) and press <kbd>I</kbd>: the ball is round again on its way up.', 'Play with <kbd>Space</kbd>: squash at the contact, a short stretch as it leaves the floor, round at the top.'],
        why: 'Stretch is a kind of motion blur drawn into the shape: it makes fast movement easier to follow.',
        check: d => shortStretch(d),
        solve: d => { stageById('squash').steps[0].solve(d); const k = d.channels.topZ, c = firstContacts(d)[0]; setKey(k, c + 2, 0.2); setKey(k, c + 5, 0); },
      },
      {
        id: 'sq3', title: 'Round at the top',
        text: 'At the top of each bounce the ball is almost still, so it must be perfectly round again (both controls back at 0). Check the first two tops (frames 0 and 20) after adding your squash and stretch keys.',
        how: ['Go to frame 20 and read the Z Scale in the sidebar.', 'If it is not close to 1, select the SS_Top and SS_Bottom keys there and set them to 0.'],
        why: 'Keeping the shape stable when the ball is slow makes the squash at the contact stand out.',
        check: d => roundTops(d),
        solve: d => { stageById('squash').steps[1].solve(d); },
      },
      {
        id: 'sq4', title: 'Never through the floor',
        text: 'SS_Bottom moves the bottom of the ball, so it can push it through the floor. Play the whole animation and check that the ball never goes below the floor: the sidebar shows the lowest point. At the contact frames SS_Bottom must be back at 0.',
        how: ['Watch the <b>Lowest point</b> in the sidebar: it must not be below 0.', 'If it is, scrub to find the frame and move SS_Bottom (or its key) up.', 'Keep the squash and stretch you made in the previous steps.'],
        why: 'A ball that sinks into the floor breaks the illusion of contact at once. Riggers add the second control so animators can stretch without cheating the contact.',
        check: d => roundTops(d) && lowestPoint(d) >= -0.03,
        solve: d => { stageById('squash').steps[2].solve(d); },
      },
    ],
  },
  {
    id: 'weight', name: 'Weight', sub: 'Extra · heavy or light',
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
    id: 'free', name: 'Your animation', sub: 'All controls and curves', free: true,
    channels: ['locX', 'locZ', 'scale', 'topZ', 'botZ', 'rotY'], hide: [], active: 'locZ',
    start: () => ({ channels: {
      locX: curve([[0, 0], [100, 0]]),
      locZ: curve([[0, 4], [100, 4]]),
      scale: curve([[0, 1], [100, 1]]),
      topZ: curve([[0, 0], [100, 0]]),
      botZ: curve([[0, 0], [100, 0]]),
      rotY: curve([[0, 0], [100, 0]]),
    } }),
    steps: [],
  },
];

// How well the Rotation follows the travel: the rotation the ball needs at each frame to roll without sliding.
// It is measured while the ball travels: up to the last key of its X Location.
export function rollReport(d, from = RANGE[0], to = d.channels.locX?.length ? d.channels.locX[d.channels.locX.length - 1].frame : RANGE[1]) {
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
