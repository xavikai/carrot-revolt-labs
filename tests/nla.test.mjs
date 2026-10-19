import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../labs/nla/nla.js';
import { STAGES } from '../labs/nla/stages.js';
import { HELP } from '../labs/nla/help.js';

const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
const strip = (st, action) => N.allStrips(st).find(s => s.action === action);

test('the active action plays alone; Push Down turns it into a strip in a new track', () => {
  const st = N.newState({ action: 'Walk' });
  assert.ok(near(N.evaluate(st, 1).pose['Thigh.L.rx'], -25));
  N.pushDown(st);
  assert.equal(st.adt.action, null);
  assert.equal(st.tracks.length, 1);
  const s = st.tracks[0].strips[0];
  assert.equal(s.action, 'Walk'); assert.equal(s.start, 1); assert.equal(s.end, 25); assert.equal(s.extrap, 'HOLD');
  assert.ok(near(N.evaluate(st, 13).pose['Thigh.L.rx'], 25), 'the strip plays the same motion');
});

test('strip time: repeat, scale, action range and reversed map to the right action frame', () => {
  const st = N.newState({ action: null });
  N.withTrack(st, [['Walk', 1, { repeat: 4 }]]);
  const s = st.tracks[0].strips[0];
  assert.equal(s.end, 97);
  assert.equal(N.stripActionFrame(s, 30), 6, 'second cycle');
  assert.equal(N.stripActionFrame(s, 97), 25, 'the last frame shows the end of the action');
  s.actEnd = 24; N.validate(st);
  assert.equal(s.end, 93);
  assert.equal(N.stripActionFrame(s, 24), 1, 'frame 1 of the next repeat replaces the duplicated pose');
  s.scale = 2; N.validate(st);
  assert.equal(N.stripActionFrame(s, 11), 6);
  s.reversed = true;
  assert.equal(N.stripActionFrame(s, 1), 24);
});

test('extrapolation: Hold, Hold Forward and Nothing; Hold only on the first strip of a track', () => {
  const st = N.newState({ action: null });
  N.withTrack(st, [['Walk', 1, { repeat: 4 }]]);
  const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Wave', 37, { extrap: 'HOLD' })); st.tracks.push(t); N.validate(st);
  assert.ok(near(N.evaluate(st, 10).pose['UpperArm.R.rz'], 150), 'Hold covers the frames before the strip');
  t.strips[0].extrap = 'HOLD_FORWARD';
  assert.ok(near(N.evaluate(st, 10).pose['UpperArm.R.rz'], 6));
  assert.ok(near(N.evaluate(st, 80).pose['UpperArm.R.rz'], 150), 'and Hold Forward after it');
  t.strips[0].extrap = 'NOTHING';
  assert.ok(near(N.evaluate(st, 80).pose['UpperArm.R.rz'], 6));
  t.strips.push(N.makeStrip(st, 'Wave', 70, { extrap: 'HOLD' })); N.validate(st);
  assert.equal(t.strips[1].extrap, 'HOLD_FORWARD');
});

test('Replace only touches the channels a strip keys; influence and blend ramps', () => {
  const st = N.newState({ action: null });
  N.withTrack(st, [['Walk', 1, { repeat: 4 }]]);
  const t = N.makeTrack(st); const w = N.makeStrip(st, 'Wave', 37, { extrap: 'NOTHING', blendIn: 6, blendOut: 6 }); t.strips.push(w); st.tracks.push(t); N.validate(st);
  const walkOnly = N.evaluate({ ...st, tracks: [st.tracks[0]] }, 40).pose;
  const both = N.evaluate(st, 40).pose;
  assert.equal(both['Thigh.L.rx'], walkOnly['Thigh.L.rx'], 'the legs keep walking');
  assert.ok(near(N.stripInfluence(w, 40), 0.5));
  assert.ok(near(both['UpperArm.R.rz'], (6 + 150) / 2, 1e-6), 'half way at 50 %');
  assert.ok(near(N.stripInfluence(w, 50), 1));
});

test('Add doubles a scale, Combine multiplies it', () => {
  const st = N.newState({ action: null });
  N.withTrack(st, [['Idle', 1, { repeat: 2 }]]);
  const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Breathe', 1, { blend: 'ADD', extrap: 'HOLD' })); st.tracks.push(t); N.validate(st);
  assert.ok(near(N.evaluate(st, 25).pose['Chest.s'], 2.06));
  t.strips[0].blend = 'COMBINE';
  assert.ok(near(N.evaluate(st, 25).pose['Chest.s'], 1.06));
  assert.ok(near(N.blendValue(10, 4, 'COMBINE', 0.5, 'Hips.rx'), 12));
  assert.ok(near(N.blendValue(2, 3, 'MULTIPLY', 1, 'Hips.rx'), 6));
});

test('Auto Blend In/Out comes from the overlap with the track below; transitions blend across a gap', () => {
  const st = N.newState({ action: null });
  N.withTrack(st, [['Walk', 1, { repeat: 2 }]]);
  const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Jump', 41, { autoBlend: true })); st.tracks.push(t); N.validate(st);
  assert.equal(t.strips[0].blendIn, 8);
  const st2 = N.newState({ action: null });
  N.withTrack(st2, [['Walk', 1], ['Jump', 35]]);
  st2.tracks[0].strips.forEach(s => { s.select = true; });
  N.addTransition(st2);
  const tr = st2.tracks[0].strips.find(s => s.type === 'transition');
  assert.equal(tr.start, 25); assert.equal(tr.end, 35);
  const a = N.evaluate(st2, 25).pose['Thigh.L.rx'], b = N.evaluate(st2, 35).pose['Thigh.L.rx'], m = N.evaluate(st2, 30).pose['Thigh.L.rx'];
  assert.ok(near(m, (a + b) / 2, 1e-6));
});

test('moving a strip onto another sends it to a free track above; linked duplicates share the action', () => {
  const st = N.newState({ action: null });
  N.withTrack(st, [['Idle', 1], ['Walk', 60]]);
  const walk = strip(st, 'Walk');
  const note = N.moveStrips(st, [walk.id], -50);
  assert.ok(note); assert.equal(st.tracks.length, 2); assert.equal(N.findStrip(st, walk.id).ti, 1);
  N.allStrips(st).forEach(s => { s.select = s.id === walk.id; }); st.sel.strip = walk.id;
  N.duplicate(st, true);
  assert.equal(N.allStrips(st).filter(s => s.action === 'Walk').length, 2);
  N.allStrips(st).forEach(s => { s.select = s.action === 'Walk'; });
  N.duplicate(st, false);
  assert.ok(st.actions['Walk.001'], 'Duplicate copies the action');
});

test('tweak mode, mute and solo, meta strips and Bake Action', () => {
  const st = N.newState({ action: null });
  N.withTrack(st, [['Walk', 1, { repeat: 2 }]]);
  const s = st.tracks[0].strips[0]; s.select = true; st.sel.strip = s.id;
  N.tweakEnter(st); assert.equal(st.adt.tweak, s.id);
  assert.throws(() => N.pushDown(st));
  N.tweakExit(st); assert.equal(st.adt.tweak, null);
  const t = N.makeTrack(st); t.strips.push(N.makeStrip(st, 'Test_Pose', 1, { extrap: 'HOLD' })); st.tracks.push(t); N.validate(st);
  assert.ok(near(N.evaluate(st, 20).pose['UpperArm.L.rz'], -90));
  st.tracks[0].solo = true;
  assert.ok(!near(N.evaluate(st, 20).pose['UpperArm.L.rz'], -90), 'Solo hides the other tracks');
  st.tracks[0].solo = false; t.mute = true;
  const live = N.evaluate(st, 20).pose['Thigh.L.rx'];
  N.bake(st, { start: 1, end: 49 });
  assert.equal(st.adt.action, 'Action');
  st.tracks.forEach(x => { x.mute = true; });
  assert.ok(near(N.evaluate(st, 20).pose['Thigh.L.rx'], live), 'the baked action plays the same');
  const st3 = N.newState({ action: null });
  N.withTrack(st3, [['Idle', 1], ['Walk', 49]]);
  st3.tracks[0].strips.forEach(x => { x.select = true; });
  N.addMeta(st3); const m = N.activeStrip(st3);
  N.moveStrips(st3, [m.id], 20);
  assert.equal(st3.tracks[0].strips[0].start, 21);
  assert.equal(m.children[1].start, 69);
});

test('saving: actions with 0 users and no Fake User are lost; New stashes the old action', () => {
  const st = N.newState({ action: 'Walk' });
  st.actions.Walk.fake = false; st.actions.Jump.fake = false;
  N.newAction(st);
  assert.equal(st.adt.action, 'Walk.001');
  assert.ok(st.tracks.some(t => t.mute && t.name.startsWith('[Action Stash]') && t.strips[0].action === 'Walk'), 'the old Walk is stashed');
  const msg = N.saveReopen(st);
  assert.ok(st.actions.Walk, 'the stashed Walk survives');
  assert.ok(!st.actions.Jump, 'Jump had 0 users and no F');
  assert.match(msg, /Jump/);
  assert.equal(st.saves, 1);
});

test('every step: the start is not done, the solution is', () => {
  for (const sg of STAGES) for (const s of sg.steps) {
    const st = s.start(), ctx = x => ({ evaluate: f => N.evaluate(x, f) });
    assert.equal(!!s.check(st, ctx(st)), false, `${s.id} starts undone`);
    s.solve(st); N.validate(st);
    assert.equal(!!s.check(st, ctx(st)), true, `${s.id} solution passes`);
  }
});

test('six stages of three to five steps, and help for every control', () => {
  assert.equal(STAGES.length, 6);
  assert.ok(STAGES.every(s => s.steps.length >= 3 && s.steps.length <= 5));
  for (const k of ['extrap', 'blend', 'blendIn', 'autoBlend', 'influence', 'animInf', 'actStart', 'scale', 'repeat', 'sync', 'fake', 'stash', 'pushdown', 'users', 'slot']) assert.ok(HELP[k]?.body, k);
});
