import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blackbody, luminance, irradiance, measure, apparentSize, worldIrradiance, spotFactor, falseColorBand, FALSE_COLOR, MIDDLE_GREY } from '../labs/lighting/light.js';
import { STAGES, startState, defaultState, upgradeState } from '../labs/lighting/stages.js';
import { shadowOk, PROBES, fogCoeffs, spreadFactor, goboValue, iesValue, cookieFactor, sphereIllum, linkOk, customWindow } from '../labs/lighting/light.js';

const near = (a, b, e) => Math.abs(a - b) <= e;
const probe = { p: [0, 1.55, 0.2], n: [0, 0, 1], onHead: true };
const base = o => ({ on: true, type: 'POINT', power: 100, strength: 1, radius: 0, angle: 1, spotSize: 45, blend: 0, shape: 'SQUARE', size: 0.01, sizeY: 0.01, az: 0, el: 0, dist: 1, target: 'head', colorMode: 'rgb', color: [1, 1, 1], ...o });

test('blackbody: warm below daylight, cool above, luminance 1', () => {
  const warm = blackbody(3200), day = blackbody(6500), cool = blackbody(10000);
  assert.ok(warm[0] > warm[2] * 2, 'tungsten is orange');
  assert.ok(near(day[0], day[2], 0.1) && near(day[0], 1, 0.1), 'about 6500 K is white');
  assert.ok(cool[2] > cool[0], 'a blue sky is blue');
  for (const c of [warm, day, cool]) assert.ok(near(luminance(c), 1, 1e-6));
});

test('inverse square law, sun, spot and area', () => {
  const E1 = irradiance(base({ dist: 1.2 }), probe), E2 = irradiance(base({ dist: 2.2 }), probe);
  assert.ok(near(E1 / E2, (2.2 - 0.2) ** 2 / (1.2 - 0.2) ** 2, 0.01), 'twice the distance, a quarter of the light');
  assert.ok(near(irradiance(base({ type: 'SUN', strength: 3, dist: 1 }), probe), irradiance(base({ type: 'SUN', strength: 3, dist: 9 }), probe), 1e-9), 'the sun does not fall off');
  const point = irradiance(base({ dist: 3 }), probe), area = irradiance(base({ type: 'AREA', dist: 3 }), probe);
  assert.ok(near(area / point, 4, 0.05), 'a small area light puts 4× more light on its axis than a point light of the same power');
  const spot = base({ type: 'SPOT', spotSize: 40, blend: 0.2 });
  assert.equal(spotFactor(spot, [0, 0, -1]), 1);
  assert.equal(spotFactor(spot, [Math.sin(0.4), 0, -Math.cos(0.4)]), 0, 'outside the cone');
  assert.ok(near(apparentSize(base({ type: 'AREA', size: 1, dist: 1 })), 53.13, 0.01));
});

test('world: uniform colour and HDRI rotation', () => {
  const w = { mode: 'color', color: [0.1, 0.1, 0.1], strength: 2 };
  assert.ok(near(worldIrradiance(w, [0, 0, 1]), Math.PI * 0.2, 1e-9));
  const h = rot => ({ mode: 'hdri', hdri: 'studio', rot, strength: 1 });
  assert.ok(worldIrradiance(h(0), [0, 0, 1]) > 3 * worldIrradiance(h(0), [0, 0, -1]), 'the softbox is in front');
  assert.ok(worldIrradiance(h(-90), [-1, 0, 0]) > 3 * worldIrradiance(h(-90), [1, 0, 0]), 'rotated to the camera left');
});

test('light meter: ratio, bounce card and False Color', () => {
  const s = defaultState();
  Object.assign(s.lights.key, { az: -90, el: 10, power: 18 });
  const m0 = measure(s);
  assert.equal(m0.keySide, 'L');
  s.card = { on: true, color: 'white', size: 1, az: 35, el: -20, dist: 0.55 };
  const m1 = measure(s);
  assert.ok(m1.ratio < m0.ratio / 2, 'the card fills the shadows');
  s.card.color = 'black';
  assert.ok(measure(s).ratio > m1.ratio, 'a black card does not');
  assert.equal(FALSE_COLOR[falseColorBand(0)].label, '±0.5');
  assert.ok(falseColorBand(Math.log2(0.36 / MIDDLE_GREY)) > falseColorBand(0));
});

test('shaping the beam: Spread, gobos, IES', () => {
  assert.equal(spreadFactor(180, 0.2), 1, 'no grid');
  assert.equal(spreadFactor(60, 1), 1, 'the axis keeps its light');
  assert.equal(spreadFactor(60, Math.cos(0.6)), 0, 'nothing outside Spread / 2');
  const wide = irradiance(base({ type: 'AREA', size: 1, sizeY: 1, dist: 3, spread: 180 }), probe), grid = irradiance(base({ type: 'AREA', size: 1, sizeY: 1, dist: 3, spread: 30 }), probe);
  assert.ok(grid < wide && grid > 0.5 * wide, 'a grid takes little light from the subject on its axis');
  assert.equal(goboValue('blinds', 0, 0.02), 1); assert.equal(goboValue('blinds', 0, 0.15), 0, 'a slat');
  assert.equal(goboValue('window', 0, 0), 0, 'the mullions'); assert.equal(goboValue('window', 0.4, 0.4), 1);
  const spot = base({ type: 'SPOT', spotSize: 40, gobo: 'blinds' });
  assert.equal(cookieFactor(spot, [0, 0, -1]), 1, 'the centre of the blinds lets light through');
  assert.equal(iesValue('scallop', 60), 0, 'the scallop is cut off');
  assert.ok(iesValue('scallop', 35) > iesValue('scallop', 0), 'a batwing is brighter to the side');
  assert.ok(iesValue('narrow', 11) > 0.45 && iesValue('narrow', 11) < 0.55, 'half the light at 11°');
});

test('falloff, soft falloff, custom distance, linking and fog', () => {
  const d1 = 1.2 - 0.2, d2 = 2.2 - 0.2;
  const lin = f => irradiance(base({ dist: 1.2, falloff: f }), probe) / irradiance(base({ dist: 2.2, falloff: f }), probe);
  assert.ok(near(lin('QUADRATIC'), (d2 / d1) ** 2, 1e-6) && near(lin('LINEAR'), d2 / d1, 1e-6) && near(lin('CONSTANT'), 1, 1e-6));
  assert.ok(near(sphereIllum(0.8, 5, 0.1) / (Math.PI * 0.01), 0.8 / 25, 1e-9), 'a small sphere is a point light');
  assert.equal(sphereIllum(1, 0.2, 0.3), 0, 'nothing is lit inside the lamp');
  assert.ok(sphereIllum(-0.05, 1, 0.3) > 0, 'a big sphere still lights a surface a little past its horizon');
  const hard = irradiance(base({ dist: 0.45, radius: 0.3, softFalloff: false }), probe), soft = irradiance(base({ dist: 0.45, radius: 0.3 }), probe);
  assert.equal(hard, 0, 'the probe is inside the sphere'); assert.ok(soft > 0, 'Soft Falloff lights it smoothly');
  assert.equal(customWindow({ customDist: true, customDistance: 2 }, 2.1), 0);
  assert.ok(near(customWindow({ customDist: true, customDistance: 2 }, 0.5), (1 - 1 / 256) ** 2, 1e-9));
  assert.ok(linkOk({ link: { backdrop: 'exclude' } }, 'bust') && !linkOk({ link: { backdrop: 'exclude' } }, 'backdrop'));
  assert.ok(linkOk({ link: { bust: 'include' } }, 'bust') && !linkOk({ link: { bust: 'include' } }, 'balls'));
  assert.ok(near(irradiance(base({}), probe, 0.2) / irradiance(base({}), probe), Math.exp(-0.2 * 0.8), 1e-9), 'the fog dims the light on its way');
  const pv = fogCoeffs({ on: true, shader: 'PRINCIPLED', density: 1, color: [0.5, 0.5, 1], absorption: [0, 1, 0] });
  assert.deepEqual(pv.sigS, [0.5, 0.5, 1]); assert.deepEqual(pv.sigT, [1, 0.5, 1], 'Absorption Color white lets the light through');
  assert.deepEqual(fogCoeffs({ on: true, shader: 'SCATTER', density: 0.2, color: [1, 1, 1] }).sigT, [0.2, 0.2, 0.2]);
  const low = base({ radius: 0.01, az: -30, el: 5, dist: 1.2 });
  assert.equal(irradiance(low, PROBES.backS), 0, 'the bust shadows the backdrop');
  assert.ok(irradiance({ ...low, shadowLink: { bust: 'exclude' } }, PROBES.backS) > 0, 'out of the Blocker Collection, it casts no shadow');
  assert.ok(!shadowOk({ shadowLink: { backdrop: 'include' } }, 'bust') && shadowOk({ shadowLink: { backdrop: 'exclude' } }, 'bust'));
  const old = JSON.parse(JSON.stringify(defaultState())); delete old.fog; delete old.lights.key.spread; delete old.lights.key.link;
  const up = upgradeState(old);
  assert.ok(up.fog && up.lights.key.spread === 180 && up.lights.key.link, 'work saved before the update gets the new settings');
});

test('every step starts unsolved and its solution solves it', () => {
  for (const st of STAGES) for (const step of st.steps) {
    const s = startState(step), flags = {};
    assert.equal(!!step.check(s, measure(s), flags), false, `${step.id} starts unsolved`);
    step.solve(s, flags);
    assert.equal(!!step.check(s, measure(s), flags), true, `${step.id} is solved by its solution`);
  }
});

import { parseOBJ, parseSTL, fitModel } from '../labs/lighting/models.js';
test('a model of your own is turned, scaled to 40 cm and put on the socle, with its faces outwards', () => {
  // a cube with Z up, its faces wound inwards
  const obj = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'v 0 0 2', 'v 1 0 2', 'v 1 1 2', 'v 0 1 2',
    'f 1 2 3 4', 'f 5 8 7 6', 'f 1 5 6 2', 'f 2 6 7 3', 'f 3 7 8 4', 'f 4 8 5 1'].join('\n');
  const g = fitModel(parseOBJ(obj), { zUp: true });
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert.ok(Math.abs(b.max.y - b.min.y - 0.4) < 1e-6 && Math.abs(b.min.y - 1.285) < 1e-6, 'height and base');
  const p = g.attributes.position, i = g.index.array;
  let vol = 0;
  for (let t = 0; t < i.length; t += 3) { const [a, c, d] = [i[t], i[t + 1], i[t + 2]].map(k => [p.getX(k), p.getY(k), p.getZ(k)]); vol += a[0] * (c[1] * d[2] - c[2] * d[1]) - a[1] * (c[0] * d[2] - c[2] * d[0]) + a[2] * (c[0] * d[1] - c[1] * d[0]); }
  assert.ok(vol > 0, 'faces point outwards');
});
test('binary STL corners are welded so the model shades smoothly', () => {
  const buf = new ArrayBuffer(84 + 2 * 50), dv = new DataView(buf); dv.setUint32(80, 2, true);
  const tris = [[0, 0, 0, 1, 0, 0, 1, 1, 0], [0, 0, 0, 1, 1, 0, 0, 1, 0]];
  tris.forEach((t, k) => t.forEach((v, j) => dv.setFloat32(84 + k * 50 + 12 + j * 4, v, true)));
  const d = parseSTL(buf);
  assert.equal(d.pos.length / 3, 4); assert.equal(d.idx.length, 6);
});
