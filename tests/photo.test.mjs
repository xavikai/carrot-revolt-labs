import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../labs/photo/optics.js';
import { STAGES, derive, startSettings, SOLUTIONS } from '../labs/photo/stages.js';

const near = (a, b, e) => Math.abs(a - b) <= e;

test('exposure: one stop per click, the sunny 16 rule, and the auto modes', () => {
  assert.ok(near(O.exposureError(15, 16, 1 / 125, 100), 0, 0.05), 'sunny 16: f/16, 1/ISO');
  const base = O.settingsEV(8, 1 / 125, 100);
  assert.ok(near(O.settingsEV(5.6, 1 / 125, 100), base - 1, 0.05), 'one stop wider aperture = one stop more light');
  assert.ok(near(O.settingsEV(8, 1 / 60, 100), base - 1, 0.1), 'one stop slower shutter = one stop more light (nominal 1/60 vs 1/125)');
  assert.ok(near(O.settingsEV(8, 1 / 125, 200), base - 1, 0.01), 'double ISO = one stop brighter');
  assert.equal(O.shutterLabel(O.autoShutter(13, 2, 100)), '1/2000');
  assert.equal(O.autoAperture(13, 1 / 1000, 100), 2.8);
  assert.equal(O.shutterLabel(2), '2"');
});

test('lens and sensor: angle of view, crop factor, coverage', () => {
  assert.ok(near(O.fovDeg(50, 36), 39.6, 0.1));
  assert.ok(near(O.SENSORS.apsc.crop, 1.53, 0.01) && near(O.SENSORS.m43.crop, 2, 0.01));
  assert.ok(near(O.fovDeg(50, O.SENSORS.apsc.w), O.fovDeg(50 * O.SENSORS.apsc.crop, 36), 0.5), 'crop = equivalent focal length');
  assert.ok(near(O.coverage(1.75, 6, 65, O.SENSORS.ff), 0.79, 0.01));
});

test('depth of field: wider aperture, longer lens and closer focus give less depth', () => {
  const ff = O.SENSORS.ff, dof = (f, N, s) => { const d = O.depthOfField(f, N, s, ff); return d.far - d.near; };
  assert.ok(dof(50, 2, 4) < dof(50, 8, 4));
  assert.ok(dof(85, 2, 4) < dof(50, 2, 4));
  assert.ok(dof(50, 2, 2) < dof(50, 2, 4));
  assert.equal(O.blurDisc(50, 2, 4, 4), 0, 'the focus plane is sharp');
  assert.equal(O.depthOfField(50, 16, 10, ff).far, Infinity, 'beyond the hyperfocal distance everything is sharp to infinity');
});

test('motion blur and camera shake grow with the exposure time; the tripod removes shake', () => {
  assert.ok(near(O.motionBlur(6, 1 / 500, 6, 50) * 2, O.motionBlur(6, 1 / 250, 6, 50), 1e-9));
  assert.equal(O.shakeBlur(1 / 4, 50, true), 0);
  const px = t => O.toPixels(O.shakeBlur(t, 50, false), O.SENSORS.ff, 768);
  assert.ok(px(1 / 60) < 1.5 && px(1 / 8) > 5, 'the 1/focal rule of thumb holds');
});

test('Blender: shutter in frames and Sensor Fit', () => {
  assert.equal(O.blenderShutterFrames(1 / 100, 25), 0.25);
  assert.ok(near(O.blenderShutterSeconds(0.5, 24), 1 / 48, 1e-12), '0.5 frames = 180° shutter');
  assert.deepEqual(O.blenderSensor(36, 'Auto', 1.5), { w: 36, h: 24 });
  assert.deepEqual(O.blenderSensor(24, 'Vertical', 1.5), { w: 36, h: 24 });
});

test('every step starts unsolved and its solution solves it', () => {
  for (const st of STAGES) for (const step of st.steps) {
    const s = startSettings(step), flags = {};
    assert.equal(!!step.check(derive(s, step), flags, s), false, `${step.id} starts unsolved`);
    SOLUTIONS[step.id](s, flags);
    const d = derive(s, step);
    assert.ok(step.check(d, flags, s), `${step.id} solved`);
    if (!step.blender) assert.ok(Math.abs(d.err) <= 0.5, `${step.id} solution is well exposed`);
  }
});

test('perspective step: both framings are reachable with the distance slider (1.5–20 m)', () => {
  const step = STAGES[1].steps[1];
  for (const [f, dist] of [[24, 2.8], [135, 15]]) {
    const s = { ...startSettings(step), f, dist, focus: dist };
    assert.ok(step.track(derive(s, step)), `${f} mm at ${dist} m`);
  }
});
