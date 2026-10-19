// NLA Lab · the Nonlinear Animation stack of Blender as pure logic (no DOM, tested).
//
// The model follows Blender:
// - An object has one active action (the "action line") and a stack of NLA tracks.
// - Tracks are evaluated from the bottom up; the active action is evaluated last, on top of all of them.
// - Each track holds strips that never overlap. A strip plays a range of an action (Frame Start/End of the
//   Action Clip), scaled (Playback Scale), repeated (Repeat) and maybe reversed.
// - Outside its range a strip holds its first/last pose (Hold, Hold Forward) or does nothing (Nothing).
//   Only the first strip of a track can use Hold; the others become Hold Forward.
// - Influence fades a strip in and out (Blend In/Out, Auto Blend In/Out from overlaps with the track below,
//   or an animated Influence). Blending decides how a strip mixes with the result below it.
// - A channel that nothing animates at a frame keeps its default value (0, or 1 for scale): the rest pose.
//
// State = { frame, range, actions, adt, tracks, nextId, sel } (plain JSON, so undo is a JSON snapshot).
import { key as fkey, recalcHandles, evaluate as fevaluate } from '../animation/fcurve.js';

// ─── The mannequin ───────────────────────────────────────────────────────────
// Rest positions in Blender coordinates (metres, Z up, the character faces −Y). Parents come first.
export const BONES = [
  { name: 'Root', parent: null, head: [0, 0, 0], tail: [0, 0.35, 0], control: true },
  { name: 'Hips', parent: 'Root', head: [0, 0, 0.95], tail: [0, 0, 1.1] },
  { name: 'Spine', parent: 'Hips', head: [0, 0, 1.1], tail: [0, 0, 1.32] },
  { name: 'Chest', parent: 'Spine', head: [0, 0, 1.32], tail: [0, 0, 1.52] },
  { name: 'Head', parent: 'Chest', head: [0, 0, 1.55], tail: [0, 0, 1.8] },
  { name: 'UpperArm.L', parent: 'Chest', head: [0.21, 0, 1.47], tail: [0.21, 0, 1.18] },
  { name: 'Forearm.L', parent: 'UpperArm.L', head: [0.21, 0, 1.18], tail: [0.21, 0, 0.92] },
  { name: 'Hand.L', parent: 'Forearm.L', head: [0.21, 0, 0.92], tail: [0.21, 0, 0.79] },
  { name: 'UpperArm.R', parent: 'Chest', head: [-0.21, 0, 1.47], tail: [-0.21, 0, 1.18] },
  { name: 'Forearm.R', parent: 'UpperArm.R', head: [-0.21, 0, 1.18], tail: [-0.21, 0, 0.92] },
  { name: 'Hand.R', parent: 'Forearm.R', head: [-0.21, 0, 0.92], tail: [-0.21, 0, 0.79] },
  { name: 'Thigh.L', parent: 'Hips', head: [0.1, 0, 0.95], tail: [0.1, 0, 0.52] },
  { name: 'Shin.L', parent: 'Thigh.L', head: [0.1, 0, 0.52], tail: [0.1, 0, 0.09] },
  { name: 'Foot.L', parent: 'Shin.L', head: [0.1, 0, 0.09], tail: [0.1, -0.15, 0.01] },
  { name: 'Thigh.R', parent: 'Hips', head: [-0.1, 0, 0.95], tail: [-0.1, 0, 0.52] },
  { name: 'Shin.R', parent: 'Thigh.R', head: [-0.1, 0, 0.52], tail: [-0.1, 0, 0.09] },
  { name: 'Foot.R', parent: 'Shin.R', head: [-0.1, 0, 0.09], tail: [-0.1, -0.15, 0.01] },
];
export const BONE_NAMES = BONES.map(b => b.name);
// Channels: '<bone>.<prop>'. rx ry rz = X/Y/Z Euler Rotation (degrees, in the bone's own axes),
// ly = Y Location (along the bone: up for the Hips), s = Scale (uniform, shown as X, Y and Z).
export const PROPS = { rx: 'X Euler Rotation', ry: 'Y Euler Rotation', rz: 'Z Euler Rotation', ly: 'Y Location', s: 'Scale' };
export const defaultValue = ch => (ch.endsWith('.s') ? 1 : 0);
export const channelBone = ch => ch.slice(0, ch.lastIndexOf('.'));
export const channelProp = ch => ch.slice(ch.lastIndexOf('.') + 1);
export const FPS = 24;
export const ACTIONS_ORDER = ['Idle', 'Walk', 'Wave', 'Jump', 'Reach', 'Breathe', 'Test_Pose'];

// ─── The action library ──────────────────────────────────────────────────────
const r1 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
function sample(from, to, step, fn) { const keys = []; for (let f = from; f <= to + 1e-6; f += step) keys.push([f, fn(f)]); if (keys[keys.length - 1][0] !== to) keys.push([to, fn(to)]); return keys; }
const W24 = 2 * Math.PI / 24;

// Walk: an in-place walk cycle, frames 1–25 (frame 25 repeats frame 1, so a loop must end at 24).
export function makeWalk({ headDown = 0 } = {}) {
  const c = {};
  const t = f => (f - 1) * W24;
  const put = (ch, fn, rnd = r1) => { c[ch] = sample(1, 25, 3, f => rnd(fn(t(f)))); };
  put('Thigh.L.rx', a => -25 * Math.cos(a));
  put('Thigh.R.rx', a => 25 * Math.cos(a));
  put('Shin.L.rx', a => 6 + 50 * Math.max(0, -Math.sin(a)));
  put('Shin.R.rx', a => 6 + 50 * Math.max(0, Math.sin(a)));
  put('Foot.L.rx', a => -12 * Math.max(0, -Math.sin(a)));
  put('Foot.R.rx', a => -12 * Math.max(0, Math.sin(a)));
  put('Hips.ly', a => -0.045 - 0.032 * Math.cos(2 * a), r3);
  put('Hips.ry', a => -6 * Math.cos(a));
  put('Spine.rx', () => 5);
  put('Chest.ry', a => 8 * Math.cos(a));
  put('UpperArm.L.rx', a => 22 * Math.cos(a));
  put('UpperArm.R.rx', a => -22 * Math.cos(a));
  put('UpperArm.L.rz', () => -6);
  put('UpperArm.R.rz', () => 6);
  put('Forearm.L.rx', a => -18 - 12 * (1 - Math.cos(a)) / 2);
  put('Forearm.R.rx', a => -18 - 12 * (1 + Math.cos(a)) / 2);
  if (headDown) put('Head.rx', a => headDown + 2 * Math.sin(2 * a));
  return { name: 'Walk', fake: true, curves: c };
}
// Idle: standing and breathing, frames 1–49. It keys every bone, so it can replace any other action.
export function makeIdle() {
  const c = {}, w = 2 * Math.PI / 48;
  const put = (ch, fn, rnd = r1) => { c[ch] = sample(1, 49, 6, f => rnd(fn((f - 1) * w))); };
  for (const b of ['Thigh.L', 'Thigh.R', 'Foot.L', 'Foot.R']) put(b + '.rx', () => 0);
  put('Shin.L.rx', () => 2); put('Shin.R.rx', () => 2);
  put('Hips.ly', a => -0.006 - 0.006 * Math.cos(a), r3);
  put('Hips.ry', () => 0);
  put('Spine.rx', () => 1);
  put('Chest.rx', a => -2 * Math.sin(a));
  put('Chest.ry', () => 0);
  put('Head.rx', a => -1 + 2 * Math.sin(a + 1));
  put('UpperArm.L.rx', () => 4); put('UpperArm.R.rx', () => 4);
  put('UpperArm.L.rz', a => -6 - 1.5 * Math.sin(a));
  put('UpperArm.R.rz', a => 6 + 1.5 * Math.sin(a));
  put('Forearm.L.rx', () => -12); put('Forearm.R.rx', () => -12);
  return { name: 'Idle', fake: true, curves: c };
}
// Wave: only the right arm is keyed (raised and waving), frames 1–25.
export function makeWave() {
  const c = {}, w = 2 * Math.PI / 12;
  const put = (ch, fn) => { c[ch] = sample(1, 25, 3, f => r1(fn((f - 1) * w))); };
  put('UpperArm.R.rz', () => 150);
  put('UpperArm.R.rx', () => -12);
  put('Forearm.R.rz', a => 22 + 28 * Math.sin(a));
  put('Forearm.R.rx', () => -8);
  put('Hand.R.rz', a => 12 * Math.sin(a - 0.6));
  return { name: 'Wave', fake: true, curves: c };
}
// Jump: anticipation, take-off, air, landing, frames 1–37. Keys the whole body.
export function makeJump() {
  const P = {
    stand: { 'Hips.ly': 0, 'Thigh.L.rx': 0, 'Thigh.R.rx': 0, 'Shin.L.rx': 2, 'Shin.R.rx': 2, 'Foot.L.rx': 0, 'Foot.R.rx': 0, 'Spine.rx': 1, 'UpperArm.L.rx': 4, 'UpperArm.R.rx': 4, 'UpperArm.L.rz': -6, 'UpperArm.R.rz': 6, 'Forearm.L.rx': -12, 'Forearm.R.rx': -12, 'Head.rx': 0 },
    crouch: { 'Hips.ly': -0.31, 'Thigh.L.rx': -55, 'Thigh.R.rx': -55, 'Shin.L.rx': 100, 'Shin.R.rx': 100, 'Foot.L.rx': -45, 'Foot.R.rx': -45, 'Spine.rx': 30, 'UpperArm.L.rx': 45, 'UpperArm.R.rx': 45, 'UpperArm.L.rz': -10, 'UpperArm.R.rz': 10, 'Forearm.L.rx': -10, 'Forearm.R.rx': -10, 'Head.rx': -20 },
    push: { 'Hips.ly': 0.12, 'Thigh.L.rx': 5, 'Thigh.R.rx': 5, 'Shin.L.rx': 0, 'Shin.R.rx': 0, 'Foot.L.rx': 35, 'Foot.R.rx': 35, 'Spine.rx': -5, 'UpperArm.L.rx': -150, 'UpperArm.R.rx': -150, 'UpperArm.L.rz': -10, 'UpperArm.R.rz': 10, 'Forearm.L.rx': -10, 'Forearm.R.rx': -10, 'Head.rx': -5 },
    peak: { 'Hips.ly': 0.62, 'Thigh.L.rx': -40, 'Thigh.R.rx': -40, 'Shin.L.rx': 60, 'Shin.R.rx': 60, 'Foot.L.rx': 10, 'Foot.R.rx': 10, 'Spine.rx': 8, 'UpperArm.L.rx': -165, 'UpperArm.R.rx': -165, 'UpperArm.L.rz': -25, 'UpperArm.R.rz': 25, 'Forearm.L.rx': -5, 'Forearm.R.rx': -5, 'Head.rx': 0 },
    fall: { 'Hips.ly': 0.2, 'Thigh.L.rx': -12, 'Thigh.R.rx': -12, 'Shin.L.rx': 15, 'Shin.R.rx': 15, 'Foot.L.rx': 15, 'Foot.R.rx': 15, 'Spine.rx': 5, 'UpperArm.L.rx': -60, 'UpperArm.R.rx': -60, 'UpperArm.L.rz': -40, 'UpperArm.R.rz': 40, 'Forearm.L.rx': -20, 'Forearm.R.rx': -20, 'Head.rx': 5 },
    land: { 'Hips.ly': -0.27, 'Thigh.L.rx': -50, 'Thigh.R.rx': -50, 'Shin.L.rx': 92, 'Shin.R.rx': 92, 'Foot.L.rx': -42, 'Foot.R.rx': -42, 'Spine.rx': 28, 'UpperArm.L.rx': -20, 'UpperArm.R.rx': -20, 'UpperArm.L.rz': -30, 'UpperArm.R.rz': 30, 'Forearm.L.rx': -30, 'Forearm.R.rx': -30, 'Head.rx': -12 },
    rise: { 'Hips.ly': -0.05, 'Thigh.L.rx': -12, 'Thigh.R.rx': -12, 'Shin.L.rx': 22, 'Shin.R.rx': 22, 'Foot.L.rx': -10, 'Foot.R.rx': -10, 'Spine.rx': 8, 'UpperArm.L.rx': 8, 'UpperArm.R.rx': 8, 'UpperArm.L.rz': -10, 'UpperArm.R.rz': 10, 'Forearm.L.rx': -15, 'Forearm.R.rx': -15, 'Head.rx': -4 },
  };
  const timing = [[1, 'stand'], [8, 'crouch'], [12, 'push'], [18, 'peak'], [23, 'fall'], [27, 'land'], [32, 'rise'], [37, 'stand']];
  const c = {};
  for (const ch of Object.keys(P.stand)) c[ch] = timing.map(([f, p]) => [f, P[p][ch]]);
  return { name: 'Jump', fake: true, curves: c };
}
// Breathe: an additive layer, frames 1–49: the chest grows 6 % and leans back a little.
export function makeBreathe() {
  const w = 2 * Math.PI / 48;
  return { name: 'Breathe', fake: true, curves: {
    'Chest.s': sample(1, 49, 6, f => r3(1 + 0.03 * (1 - Math.cos((f - 1) * w)))),
    'Chest.rx': sample(1, 49, 6, f => r1(-1.5 * (1 - Math.cos((f - 1) * w)))),
  } };
}
// Reach: an offset layer, frames 1–25: both arms 45° forward. With Replace it stops the arm swing of a walk;
// with Add or Combine the arms keep swinging around the new position.
export function makeReach() {
  const k = v => [[1, v], [25, v]];
  return { name: 'Reach', fake: true, curves: { 'UpperArm.L.rx': k(-45), 'UpperArm.R.rx': k(-45), 'Forearm.L.rx': k(-20), 'Forearm.R.rx': k(-20) } };
}
// A forgotten test pose: arms out, everything keyed at frame 1.
export function makeTestPose() {
  const c = {};
  for (const b of BONE_NAMES) { if (b === 'Root') continue; c[b + '.rx'] = [[1, 0], [2, 0]]; }
  c['UpperArm.L.rz'] = [[1, -90], [2, -90]]; c['UpperArm.R.rz'] = [[1, 90], [2, 90]]; c['Hips.ly'] = [[1, 0], [2, 0]];
  return { name: 'Test_Pose', fake: true, curves: c };
}
export function library() {
  const list = [makeIdle(), makeWalk(), makeWave(), makeJump(), makeReach(), makeBreathe(), makeTestPose()];
  return Object.fromEntries(list.map(a => [a.name, a]));
}

// ─── Actions ─────────────────────────────────────────────────────────────────
// Bezier F-curves with Auto Clamped handles (Blender's default), built once per curve array.
const curveCache = new WeakMap();
function fc(points) {
  let keys = curveCache.get(points);
  if (!keys) { keys = recalcHandles(points.map(([f, v]) => fkey(f, v))); curveCache.set(points, keys); }
  return keys;
}
export function actionRange(action) {
  let a = Infinity, b = -Infinity;
  for (const pts of Object.values(action?.curves || {})) for (const [f] of pts) { if (f < a) a = f; if (f > b) b = f; }
  return a === Infinity ? [1, 1] : [a, b];
}
export function evalAction(action, frame) {
  const out = {};
  for (const [ch, pts] of Object.entries(action.curves)) if (pts.length) out[ch] = fevaluate(fc(pts), frame);
  return out;
}
export const actionChannels = action => Object.keys(action?.curves || {}).filter(ch => action.curves[ch].length);
// Users of an action: the strips that play it and the action line. Fake User adds one more in Blender.
export function actionUsers(st, name) {
  let n = st.adt.action === name ? 1 : 0;
  for (const s of allStrips(st)) if (s.action === name) n++;
  return n;
}

// ─── Names, ids, lookups ─────────────────────────────────────────────────────
export function uniqueName(base, taken) {
  const set = new Set(taken); if (!set.has(base)) return base;
  const stem = base.replace(/\.\d{3}$/, '');
  for (let i = 1; ; i++) { const n = `${stem}.${String(i).padStart(3, '0')}`; if (!set.has(n)) return n; }
}
const newId = st => `s${st.nextId++}`;
export function allStrips(st) { const out = []; for (const t of st.tracks) for (const s of t.strips) { out.push(s); if (s.type === 'meta') out.push(...s.children); } return out; }
export function findStrip(st, id) {
  for (let ti = 0; ti < st.tracks.length; ti++) for (const s of st.tracks[ti].strips) {
    if (s.id === id) return { strip: s, track: st.tracks[ti], ti };
    if (s.type === 'meta') for (const c of s.children) if (c.id === id) return { strip: c, track: st.tracks[ti], ti, meta: s };
  }
  return null;
}
export const trackOf = (st, id) => st.tracks.findIndex(t => t.id === id);
export const selectedStrips = st => st.tracks.flatMap(t => t.strips.filter(s => s.select));
export const activeStrip = st => (st.sel.strip && findStrip(st, st.sel.strip)?.strip) || null;
export const activeTrackIndex = st => { const i = st.tracks.findIndex(t => t.id === st.sel.track); return i; };
const stripNames = st => allStrips(st).map(s => s.name);

// ─── Strips ──────────────────────────────────────────────────────────────────
export function stripLength(s) { return (s.actEnd - s.actStart) * s.scale * s.repeat; }
export function syncEnd(s) { if (s.type === 'action') s.end = r3(s.start + stripLength(s)); if (s.type === 'meta') { s.start = Math.min(...s.children.map(c => c.start)); s.end = Math.max(...s.children.map(c => c.end)); } return s; }
export function makeStrip(st, action, start, extra = {}) {
  const act = st.actions[action], [a, b] = actionRange(act);
  const s = { id: newId(st), type: 'action', name: uniqueName(action, stripNames(st)), action, start, end: start, actStart: a, actEnd: b, scale: 1, repeat: 1,
    extrap: 'HOLD_FORWARD', blend: 'REPLACE', blendIn: 0, blendOut: 0, autoBlend: false, reversed: false, mute: false, select: false,
    animInf: false, influence: 1, infKeys: [], sync: true, ...extra };
  return syncEnd(s);
}
export function makeTrack(st, name) { return { id: newId(st), name: uniqueName(name || 'NlaTrack', st.tracks.map(t => t.name)), mute: false, solo: false, lock: false, strips: [] }; }

// Blender keeps the stack valid after every edit: strips sorted, ends in sync, Hold only on the first strip of a
// track, automatic blends recalculated from the overlaps with the track below.
export function validate(st) {
  st.tracks.forEach(t => {
    for (const s of t.strips) { if (s.type === 'meta') s.children.forEach(syncEnd); syncEnd(s); }
    t.strips.sort((a, b) => a.start - b.start);
    t.strips.forEach((s, i) => {
      if (i > 0 && s.extrap === 'HOLD') s.extrap = 'HOLD_FORWARD';
      if (s.type === 'transition') s.extrap = 'NOTHING';
    });
  });
  st.tracks.forEach((t, ti) => {
    const below = st.tracks[ti - 1];
    for (const s of t.strips) {
      if (s.type !== 'action' || !s.autoBlend) continue;
      let bi = 0, bo = 0;
      if (below) for (const o of below.strips) {
        if (o.start <= s.start && s.start < o.end) bi = Math.max(bi, Math.min(o.end, s.end) - s.start);
        if (o.start < s.end && s.end <= o.end) bo = Math.max(bo, s.end - Math.max(o.start, s.start));
      }
      s.blendIn = r3(bi); s.blendOut = r3(bo);
      if (s.blendIn + s.blendOut > s.end - s.start) { const k = (s.end - s.start) / (s.blendIn + s.blendOut); s.blendIn = r3(s.blendIn * k); s.blendOut = r3(s.blendOut * k); }
    }
  });
  if (st.adt.tweak && !findStrip(st, st.adt.tweak)) st.adt.tweak = null;
  return st;
}

// Frame inside the action for a scene frame (strip time → action time), as Blender maps it.
export function stripActionFrame(s, f) {
  const len = s.actEnd - s.actStart;
  if (len <= 0) return s.actStart;
  let t = (Math.min(Math.max(f, s.start), s.end) - s.start) / s.scale;    // 0 … len × repeat
  const total = len * s.repeat;
  if (t >= total - 1e-9) t = len;            // the last frame of the strip shows the end of the action
  else t = t % len;
  if (s.reversed) t = len - t;
  return s.actStart + t;
}
// Scene frame where an action frame lands (first repeat), used to draw the keys of a tweaked strip.
export const actionToScene = (s, af) => s.start + (s.reversed ? s.actEnd - af : af - s.actStart) * s.scale;
export const sceneToAction = (s, f) => s.reversed ? s.actEnd - (f - s.start) / s.scale : s.actStart + (f - s.start) / s.scale;

export function evalInfluenceKeys(keys, f) { return keys.length ? Math.max(0, Math.min(1, fevaluate(fc(keys), f))) : 1; }
// Influence of a strip at a frame. Outside the strip (held frames) it keeps the influence of the nearest end.
export function stripInfluence(s, f) {
  const g = Math.min(Math.max(f, s.start), s.end);
  if (s.animInf) return s.infKeys?.length ? evalInfluenceKeys(s.infKeys, f) : Math.max(0, Math.min(1, s.influence));
  let inf = 1;
  if (s.blendIn > 0 && g < s.start + s.blendIn) inf = Math.min(inf, (g - s.start) / s.blendIn);
  if (s.blendOut > 0 && g > s.end - s.blendOut) inf = Math.min(inf, (s.end - g) / s.blendOut);
  return Math.max(0, Math.min(1, inf));
}

// Combine the value of a strip with the result below it.
export function blendValue(below, v, mode, inf, ch) {
  const d = defaultValue(ch);
  switch (mode) {
    case 'ADD': return below + v * inf;
    case 'SUBTRACT': return below - v * inf;
    case 'MULTIPLY': return below + (below * v - below) * inf;
    case 'COMBINE': return d === 1 ? below * Math.pow(Math.max(1e-6, v) / d, inf) : below + (v - d) * inf;
    default: return below + (v - below) * inf;   // REPLACE
  }
}

// What one track gives at a frame: null, or { strip, inf, values, held, mode }.
export function trackSample(st, track, f) {
  return sampleStrips(st, track.strips.filter(s => !s.mute), f);
}
function sampleStrips(st, strips, f) {
  if (!strips.length) return null;
  const inside = [...strips].reverse().find(s => s.start <= f && f <= s.end);
  if (inside?.type === 'meta') return sampleStrips(st, inside.children.filter(s => !s.mute), f);
  if (inside?.type === 'transition') {
    const i = strips.indexOf(inside), prev = strips.slice(0, i).reverse().find(s => s.type === 'action' || s.type === 'meta'), next = strips.slice(i + 1).find(s => s.type === 'action' || s.type === 'meta');
    const a = prev ? sampleStrips(st, [prev], prev.end) : null, b = next ? sampleStrips(st, [next], next.start) : null;
    const k = inside.end > inside.start ? (f - inside.start) / (inside.end - inside.start) : 1;
    return { strip: inside, transition: true, k, from: a, to: b, inf: 1, mode: 'REPLACE' };
  }
  if (inside) return contribution(st, inside, f, false);
  // Between strips: the last strip before the frame may hold its last pose.
  const before = strips.filter(s => s.end < f && s.type !== 'transition').pop();
  if (before) {
    if (before.extrap === 'NOTHING') return null;
    if (before.type === 'meta') return sampleStrips(st, before.children.filter(s => !s.mute), before.end);
    return contribution(st, before, f, true);
  }
  const first = strips[0];
  if (first.extrap === 'HOLD' && f < first.start) return first.type === 'meta' ? sampleStrips(st, first.children.filter(s => !s.mute), first.start) : contribution(st, first, f, true);
  return null;
}
function contribution(st, s, f, held) {
  const act = st.actions[s.action];
  if (!act) return null;
  const af = stripActionFrame(s, f);
  return { strip: s, inf: stripInfluence(s, f), values: evalAction(act, af), held, mode: s.blend, actionFrame: af };
}

export function restPose() { const p = {}; for (const b of BONE_NAMES) { if (b === 'Root') continue; for (const k of ['rx', 'ry', 'rz']) p[`${b}.${k}`] = 0; } p['Hips.ly'] = 0; p['Chest.s'] = 1; return p; }
function applyContribution(pose, c) {
  if (c.transition) {
    const chs = new Set([...Object.keys(c.from?.values || {}), ...Object.keys(c.to?.values || {})]);
    for (const ch of chs) {
      const below = pose[ch] ?? defaultValue(ch);
      const a = c.from?.values?.[ch] ?? below, b = c.to?.values?.[ch] ?? below;
      pose[ch] = a + (b - a) * c.k;
    }
    return;
  }
  for (const [ch, v] of Object.entries(c.values)) pose[ch] = blendValue(pose[ch] ?? defaultValue(ch), v, c.mode, c.inf, ch);
}
export const anySolo = st => st.tracks.some(t => t.solo);
export const trackEvaluated = (st, t) => anySolo(st) ? t.solo : !t.mute;
// The whole stack at a frame. Returns the pose and, for the lab's "Stack" view, what each layer gave.
export function evaluate(st, f = st.frame) {
  const pose = restPose(), layers = [];
  st.tracks.forEach((t, ti) => {
    if (!trackEvaluated(st, t)) { layers.push({ ti, track: t, off: true }); return; }
    const c = trackSample(st, t, f);
    layers.push({ ti, track: t, c });
    if (c) applyContribution(pose, c);
  });
  const act = st.adt.action && !st.adt.tweak ? st.actions[st.adt.action] : null;
  let line = null;
  if (act) {
    const [a, b] = actionRange(act);
    if (st.adt.extrap !== 'NOTHING' || (f >= a && f <= b)) {
      line = { values: evalAction(act, f), inf: st.adt.influence, mode: st.adt.blend };
      applyContribution(pose, line);
    }
  }
  return { pose, layers, line };
}

// ─── Operators (each returns a message, or throws an Error with the reason) ─
const fail = m => { throw new Error(m); };
const noTweak = st => { if (st.adt.tweak) fail('Not possible in Tweak Mode: press Tab to leave it first.'); };
function deselectStrips(st) { for (const s of allStrips(st)) s.select = false; }
function selectOnly(st, s, ti) { deselectStrips(st); s.select = true; st.sel.strip = s.id; if (ti != null) st.sel.track = st.tracks[ti].id; }

// Action Editor › Push Down: the active action becomes a strip in a new track at the top of the stack.
export function pushDown(st) {
  noTweak(st);
  const name = st.adt.action; if (!name) fail('There is no active action to push down.');
  const t = makeTrack(st); st.tracks.push(t);
  const [a] = actionRange(st.actions[name]);
  const s = makeStrip(st, name, a, { extrap: 'HOLD', blend: st.adt.blend, influence: 1 });
  t.strips.push(s); st.adt.action = null;
  selectOnly(st, s, st.tracks.length - 1); validate(st);
  return `Pushed “${name}” down to ${t.name}.`;
}
// Action Editor › Stash: keeps the action in a muted track so it is not lost, and clears the action line.
export function stash(st, name = st.adt.action, clear = true) {
  noTweak(st);
  if (!name) fail('There is no active action to stash.');
  const t = makeTrack(st, '[Action Stash]'); t.mute = true;
  const [a] = actionRange(st.actions[name]);
  t.strips.push(makeStrip(st, name, a, { extrap: 'HOLD' }));
  const firstNonStash = st.tracks.findIndex(x => !x.name.startsWith('[Action Stash]'));
  st.tracks.splice(firstNonStash < 0 ? st.tracks.length : firstNonStash, 0, t);
  if (clear) st.adt.action = null;
  validate(st);
  return `“${name}” stashed in a muted track.`;
}
// Browse Action: assign another action. One that would have no users is stashed first, as Blender does.
export function setActiveAction(st, name) {
  noTweak(st);
  const old = st.adt.action;
  if (old === name) return '';
  let note = '';
  if (old && !st.actions[old].fake && actionUsers(st, old) === 1) { stash(st, old, false); note = ` “${old}” had no other users, so it was stashed.`; }
  st.adt.action = name;
  return (name ? `Active action: ${name}.` : 'No active action.') + note;
}
export function unlinkAction(st) {
  noTweak(st);
  const old = st.adt.action; if (!old) return '';
  st.adt.action = null;
  return !st.actions[old].fake && actionUsers(st, old) === 0 ? `Action “${old}” will not be saved: give it a Fake User or stash it in the NLA stack to keep it.` : `Unlinked “${old}”.`;
}
// Action Editor › New: a copy of the active action (the old one is stashed if nothing else uses it).
export function newAction(st) {
  noTweak(st);
  const old = st.adt.action;
  const name = uniqueName(old || 'Action', Object.keys(st.actions));
  st.actions[name] = old ? { name, fake: false, curves: JSON.parse(JSON.stringify(st.actions[old].curves)) } : { name, fake: false, curves: {} };
  if (old && !st.actions[old].fake && actionUsers(st, old) === 1) stash(st, old, false);
  st.adt.action = name;
  return `New action “${name}”.`;
}
export function addTrack(st, above = false) {
  noTweak(st);
  const t = makeTrack(st);
  const ai = activeTrackIndex(st);
  if (above && ai >= 0) st.tracks.splice(ai + 1, 0, t); else st.tracks.push(t);
  st.sel.track = t.id;
  return `Added ${t.name}.`;
}
export function deleteTracks(st, ids = [st.sel.track]) {
  noTweak(st);
  const before = st.tracks.length;
  st.tracks = st.tracks.filter(t => !ids.includes(t.id));
  if (st.tracks.length === before) fail('Select a track first (click its name).');
  st.sel.track = st.tracks[st.tracks.length - 1]?.id || null; st.sel.strip = null; validate(st);
  return `Deleted ${before - st.tracks.length} track(s).`;
}
const fits = (t, s, ignore = new Set()) => t.strips.every(o => ignore.has(o.id) || o.end <= s.start + 1e-6 || o.start >= s.end - 1e-6);
// Add › Action (Shift A): a strip of the chosen action at the current frame, in the active track.
// If it does not fit there, a new track is added above, as Blender does.
export function addActionStrip(st, name, frame = st.frame) {
  noTweak(st);
  if (!st.actions[name]) fail('Unknown action.');
  let ti = activeTrackIndex(st);
  if (ti < 0) { st.tracks.push(makeTrack(st)); ti = st.tracks.length - 1; }
  const s = makeStrip(st, name, Math.round(frame));
  if (st.tracks[ti].lock) fail(`${st.tracks[ti].name} is locked.`);
  if (!fits(st.tracks[ti], s)) { st.tracks.splice(ti + 1, 0, makeTrack(st)); ti++; }
  if (!st.tracks[ti].strips.length) s.extrap = 'HOLD';
  st.tracks[ti].strips.push(s);
  selectOnly(st, s, ti); validate(st);
  return `Added a “${name}” strip to ${st.tracks[ti].name}.`;
}
// Move strips in time (frames) and between tracks. A strip that ends up overlapping another goes to the
// next free track above (a new one if needed), as Blender's transform does.
export function moveStrips(st, ids, dFrame, dTrack = 0) {
  noTweak(st);
  const moving = ids.map(id => findStrip(st, id)).filter(x => x && !x.meta);
  if (!moving.length) return '';
  if (moving.some(m => m.track.lock)) fail('A locked track cannot be edited.');
  const idset = new Set(moving.map(m => m.strip.id));
  for (const m of moving) m.track.strips = m.track.strips.filter(s => !idset.has(s.id));
  let pushed = 0;
  const minTi = Math.min(...moving.map(m => m.ti));
  const shift = Math.max(dTrack, -minTi);
  for (const m of [...moving].sort((a, b) => a.strip.start - b.strip.start)) {
    const s = m.strip, d = Math.round(dFrame);
    s.start += d; s.end += d;
    if (s.type === 'meta') for (const c of s.children) { c.start += d; c.end += d; }
    let ti = m.ti + shift;
    while (ti < st.tracks.length && (!fits(st.tracks[ti], s) || st.tracks[ti].lock)) { ti++; pushed++; }
    if (ti >= st.tracks.length) { st.tracks.push(makeTrack(st)); ti = st.tracks.length - 1; if (pushed === 0) pushed = 1; }
    st.tracks[ti].strips.push(s);
    if (s.id === st.sel.strip) st.sel.track = st.tracks[ti].id;
  }
  validate(st);
  return pushed ? 'Strips cannot overlap in a track: the strip went to a free track above.' : '';
}
export function deleteStrips(st) {
  noTweak(st);
  let n = 0;
  for (const t of st.tracks) { if (t.lock) continue; const keep = t.strips.filter(s => !s.select); n += t.strips.length - keep.length; t.strips = keep; }
  if (!n) fail('Select a strip first.');
  st.sel.strip = null; validate(st);
  return `Deleted ${n} strip(s).`;
}
// Shift D: a copy that uses a new copy of the action. Alt D: a linked copy that shares the action.
export function duplicate(st, linked = false) {
  noTweak(st);
  const sel = st.tracks.flatMap((t, ti) => t.strips.filter(s => s.select && s.type === 'action').map(s => ({ s, ti })));
  if (!sel.length) fail('Select an action strip first.');
  const made = [];
  for (const { s, ti } of sel) {
    let action = s.action;
    if (!linked) { action = uniqueName(s.action, Object.keys(st.actions)); st.actions[action] = { name: action, fake: false, curves: JSON.parse(JSON.stringify(st.actions[s.action].curves)) }; }
    const c = { ...JSON.parse(JSON.stringify(s)), id: newId(st), action, name: uniqueName(s.name, stripNames(st)), select: true, extrap: s.extrap === 'HOLD' ? 'HOLD_FORWARD' : s.extrap };
    const len = c.end - c.start; c.start = s.end; c.end = c.start + len;
    s.select = false;
    let t = ti; while (!fits(st.tracks[t], c)) { t++; if (t >= st.tracks.length) st.tracks.push(makeTrack(st)); }
    st.tracks[t].strips.push(c); made.push(c);
  }
  st.sel.strip = made[made.length - 1].id; validate(st);
  return linked ? 'Linked duplicate: both strips play the same action.' : `Duplicate with its own action (${made.map(m => m.action).join(', ')}).`;
}
export function toggleMute(st) {
  const sel = allStrips(st).filter(s => s.select);
  if (!sel.length) fail('Select a strip first.');
  const to = !sel.every(s => s.mute);
  sel.forEach(s => { s.mute = to; });
  return to ? 'Muted the selected strips.' : 'Unmuted the selected strips.';
}
// Y: split the selected strips at the current frame.
export function split(st, frame = st.frame) {
  noTweak(st);
  let n = 0;
  for (const t of st.tracks) for (const s of [...t.strips]) {
    if (!s.select || s.type !== 'action' || !(s.start < frame && frame < s.end)) continue;
    const af = stripActionFrame(s, frame);
    if (s.repeat !== 1) { const len = (s.end - s.start) / s.repeat; s.repeat = r3((frame - s.start) / len); }
    const b = { ...JSON.parse(JSON.stringify(s)), id: newId(st), name: uniqueName(s.name, stripNames(st)), extrap: 'HOLD_FORWARD', select: false, repeat: 1 };
    if (s.repeat === 1 || s.repeat < 1) { if (!s.reversed) { b.actStart = af; s.actEnd = af; } else { b.actEnd = af; s.actStart = af; } }
    b.start = frame; s.end = frame;
    syncEnd(s); b.end = b.start + (b.actEnd - b.actStart) * b.scale; t.strips.push(b); n++;
    s.blendOut = 0; b.blendIn = 0;
  }
  if (!n) fail('Put the current frame inside a selected strip to split it.');
  validate(st);
  return `Split ${n} strip(s) at frame ${Math.round(frame)}.`;
}
export function swapStrips(st) {
  noTweak(st);
  for (const t of st.tracks) {
    const sel = t.strips.filter(s => s.select);
    if (sel.length === 2) {
      const [a, b] = sel.sort((x, y) => x.start - y.start), la = a.end - a.start, lb = b.end - b.start, gap = b.start - a.end;
      const s0 = a.start; b.start = s0; b.end = s0 + lb; a.start = b.end + gap; a.end = a.start + la;
      if (b.type === 'meta' || a.type === 'meta') fail('Swap does not move meta strips in this lab.');
      validate(st); return 'Swapped the two strips.';
    }
  }
  fail('Select two strips in the same track to swap them.');
}
export function moveStripsTrack(st, dir) {
  const sel = selectedStrips(st).map(s => s.id);
  if (!sel.length) fail('Select a strip first.');
  for (const id of sel) { const f = findStrip(st, id); const to = f.ti + dir; if (to < 0 || to >= st.tracks.length || !fits(st.tracks[to], f.strip)) fail('There is no room in that track.'); }
  for (const id of sel) { const f = findStrip(st, id); f.track.strips = f.track.strips.filter(s => s.id !== id); st.tracks[f.ti + dir].strips.push(f.strip); if (id === st.sel.strip) st.sel.track = st.tracks[f.ti + dir].id; }
  validate(st);
  return dir > 0 ? 'Moved up one track.' : 'Moved down one track.';
}
export function syncLength(st, s = activeStrip(st)) {
  if (!s || s.type !== 'action') fail('Select an action strip first.');
  const [a, b] = actionRange(st.actions[s.action]);
  s.actStart = a; s.actEnd = b; validate(st);
  return `Action range synced: ${a}–${b}.`;
}
export function makeSingleUser(st) {
  noTweak(st);
  const sel = allStrips(st).filter(s => s.select && s.type === 'action');
  if (!sel.length) fail('Select an action strip first.');
  let n = 0;
  for (const s of sel) if (actionUsers(st, s.action) > 1) { const name = uniqueName(s.action, Object.keys(st.actions)); st.actions[name] = { name, fake: false, curves: JSON.parse(JSON.stringify(st.actions[s.action].curves)) }; s.action = name; n++; }
  return n ? `${n} strip(s) now have their own action.` : 'Those strips already have their own action.';
}
// Ctrl A: the scale goes into the keys of the action (every strip that plays it changes too).
export function applyScale(st) {
  noTweak(st);
  const sel = allStrips(st).filter(s => s.select && s.type === 'action' && s.scale !== 1);
  if (!sel.length) fail('Select a scaled strip first.');
  for (const s of sel) {
    const act = st.actions[s.action], k = s.scale;
    for (const ch of Object.keys(act.curves)) act.curves[ch] = act.curves[ch].map(([f, v]) => [r3(s.actStart + (f - s.actStart) * k), v]);
    s.actEnd = r3(s.actStart + (s.actEnd - s.actStart) * k); s.scale = 1;
  }
  validate(st);
  return 'Scale applied to the action keys.';
}
export function clearScale(st) {
  const sel = allStrips(st).filter(s => s.select && s.type === 'action');
  if (!sel.length) fail('Select a strip first.');
  sel.forEach(s => { s.scale = 1; }); validate(st);
  return 'Scale cleared.';
}
export function snapToFrame(st, frame = st.frame) {
  noTweak(st);
  const sel = selectedStrips(st);
  if (!sel.length) fail('Select a strip first.');
  let note = '';
  for (const s of sel) note = moveStrips(st, [s.id], Math.round(frame) - s.start, 0) || note;
  return note || 'Snapped to the current frame.';
}
// Shift T: a transition fills the gap between two selected strips of the same track.
export function addTransition(st) {
  noTweak(st);
  for (const t of st.tracks) {
    const sel = t.strips.filter(s => s.select && s.type !== 'transition').sort((a, b) => a.start - b.start);
    for (let i = 0; i < sel.length - 1; i++) {
      const a = sel[i], b = sel[i + 1];
      const between = t.strips.filter(s => s.start >= a.end && s.end <= b.start);
      if (b.start - a.end >= 1 && !between.length) {
        const tr = { id: newId(st), type: 'transition', name: uniqueName('Transition', stripNames(st)), start: a.end, end: b.start, extrap: 'NOTHING', blend: 'REPLACE', mute: false, select: false };
        t.strips.push(tr); validate(st);
        return `Transition from “${a.name}” to “${b.name}”.`;
      }
    }
  }
  fail('Select two strips in the same track with a gap between them.');
}
// Add › Meta-Strips: selected strips next to each other in one track become a single strip.
export function addMeta(st) {
  noTweak(st);
  for (const t of st.tracks) {
    const sel = t.strips.filter(s => s.select && s.type !== 'meta');
    if (sel.length >= 2) {
      const m = { id: newId(st), type: 'meta', name: uniqueName('Meta', stripNames(st)), children: sel.map(s => ({ ...s, select: false })), extrap: sel.sort((a, b) => a.start - b.start)[0].extrap, blend: 'REPLACE', mute: false, select: true, start: 0, end: 0 };
      t.strips = t.strips.filter(s => !sel.includes(s)); syncEnd(m);
      t.strips.push(m); st.sel.strip = m.id; validate(st);
      return `${sel.length} strips grouped into ${m.name}.`;
    }
  }
  fail('Select at least two strips in the same track.');
}
export function removeMeta(st) {
  noTweak(st);
  let n = 0;
  for (const t of st.tracks) for (const m of t.strips.filter(s => s.select && s.type === 'meta')) { t.strips = t.strips.filter(s => s !== m).concat(m.children.map(c => ({ ...c, select: true }))); n++; }
  if (!n) fail('Select a meta strip first.');
  validate(st);
  return 'Meta strip removed: its strips are back in the track.';
}
// Tab: Start Tweaking Strip Actions (Full Stack). The action of the strip opens in the Action Editor.
export function tweakEnter(st) {
  if (st.adt.tweak) return tweakExit(st);
  const s = activeStrip(st) || selectedStrips(st)[0];
  if (!s || s.type !== 'action') fail('Select an action strip to tweak (click it, then Tab).');
  st.adt.tweak = s.id; st.adt.saved = st.adt.action; st.sel.strip = s.id;
  return `Tweak Mode: editing “${s.action}”. Tab leaves it.`;
}
export function tweakExit(st) {
  if (!st.adt.tweak) return '';
  const id = st.adt.tweak; st.adt.tweak = null;
  // Sync Length: every strip that plays the action follows its new key range.
  const s = findStrip(st, id)?.strip;
  if (s) for (const o of allStrips(st)) if (o.type === 'action' && o.action === s.action && o.sync) { const [a, b] = actionRange(st.actions[o.action]); o.actStart = a; o.actEnd = b; }
  validate(st);
  return 'Left Tweak Mode.';
}
// Object › Animation › Bake Action: the evaluated result, one key per Frame Step, in a new action.
export function bake(st, { start = st.range[0], end = st.range[1], step = 1, overwrite = false, clean = false } = {}) {
  noTweak(st);
  const target = overwrite && st.adt.action ? st.adt.action : uniqueName('Action', Object.keys(st.actions));
  const saved = st.adt.action; st.adt.action = overwrite ? saved : null;
  const curves = {};
  for (let f = start; f <= end; f += step) {
    const { pose } = evaluate(st, f);
    for (const [ch, v] of Object.entries(pose)) (curves[ch] ??= []).push([f, r3(v)]);
  }
  if (clean) for (const ch of Object.keys(curves)) if (curves[ch].every(([, v]) => Math.abs(v - defaultValue(ch)) < 1e-4)) delete curves[ch];
  st.actions[target] = { name: target, fake: false, curves, baked: { start, end, step } };
  st.adt.action = target; st.adt.blend = 'REPLACE'; st.adt.influence = 1;
  return `Baked frames ${start}–${end} into “${target}”.`;
}

// ─── Saving the file ─────────────────────────────────────────────────────────
// Blender does not write data-blocks with 0 users to the .blend file (orphan data). An action survives a save
// if a strip or the action line uses it, or if it has a Fake User (F). Stashing keeps it in a muted strip.
export const orphanActions = st => Object.values(st.actions).filter(a => !a.fake && actionUsers(st, a.name) === 0).map(a => a.name);
export function saveReopen(st) {
  noTweak(st);
  const lost = orphanActions(st);
  for (const n of lost) delete st.actions[n];
  st.saves = (st.saves || 0) + 1;
  return lost.length ? `Saved and reopened: lost ${lost.join(', ')} (0 users, no Fake User).` : 'Saved and reopened: every action is still in the file.';
}
export function purge(st) {
  noTweak(st);
  const lost = orphanActions(st);
  for (const n of lost) delete st.actions[n];
  return lost.length ? `Purged ${lost.join(', ')}.` : 'Nothing to purge: every action has a user or a Fake User.';
}

// ─── Keys (Action Editor) ────────────────────────────────────────────────────
export function deleteKeys(st, actionName, sel) {
  const act = st.actions[actionName]; let n = 0;
  for (const ch of Object.keys(act.curves)) {
    const keep = act.curves[ch].filter(([f]) => !sel.some(k => k.ch === ch && Math.abs(k.f - f) < 1e-6));
    n += act.curves[ch].length - keep.length;
    if (keep.length) act.curves[ch] = keep; else delete act.curves[ch];
  }
  return n;
}
export function moveKeys(st, actionName, sel, dFrame) {
  const act = st.actions[actionName];
  for (const ch of Object.keys(act.curves)) {
    const pts = act.curves[ch].map(([f, v]) => [sel.some(k => k.ch === ch && Math.abs(k.f - f) < 1e-6) ? r3(f + dFrame) : f, v]);
    pts.sort((a, b) => a[0] - b[0]);
    const dedup = []; for (const p of pts) { if (dedup.length && Math.abs(dedup[dedup.length - 1][0] - p[0]) < 1e-6) dedup[dedup.length - 1] = p; else dedup.push(p); }
    act.curves[ch] = dedup;
  }
}

// ─── A fresh scene ──────────────────────────────────────────────────────────
export function newState({ action = 'Idle', range = [1, 120] } = {}) {
  return { frame: 1, range, actions: library(), adt: { action, blend: 'REPLACE', influence: 1, extrap: 'HOLD', tweak: null }, tracks: [], nextId: 1, sel: { strip: null, track: null }, saves: 0 };
}
export const clone = st => JSON.parse(JSON.stringify(st));
// Helpers for building stages: add a track with strips.
export function withTrack(st, strips, name) {
  const t = makeTrack(st, name);
  for (const [action, start, extra] of strips) t.strips.push(makeStrip(st, action, start, extra));
  if (t.strips[0] && !strips[0][2]?.extrap) t.strips[0].extrap = 'HOLD';
  st.tracks.push(t); st.sel.track = t.id; validate(st);
  return t;
}
