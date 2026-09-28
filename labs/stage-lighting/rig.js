// Stage Lighting Lab: the lighting rig of a small theatre stage and the maths of stage light.
// Fixture types and their DMX channels, the patch, the DIP switches of old fixtures, colour (gels and LED
// mixing), where a moving head points, and how much light (lux) reaches a point. Pure module: no DOM.
//
// Axes (metres): x across the stage (+x stage left seen from the audience), y up (0 = stage floor),
// z towards the audience (0 = front edge of the stage, the stage is at z < 0, the cyclorama at z = -8).

export const STAGE = { half: 6, depth: 8, cyc: -8, cycH: 6.5, height: 7 };
export const UNIVERSE = 512;

// ─── Fixture types ───────────────────────────────────────────────────────────
// i0: luminous intensity at the centre of the beam (candela) at `ref` degrees of beam; beams that zoom
// wider spread the same light, so the intensity goes down with the square of the angle.
// edge: how soft the edge of the beam is (0 hard … 1 very soft); `edgeAdjust` = it can be focused.
export const TYPES = {
  profile: { name: 'Profile (ERS)', short: 'Profile', channels: ['Dimmer'], beam: 26, zoom: null, i0: 60000, ref: 26, edge: [0.05, 0.6], edgeAdjust: true, source: 'tungsten', about: 'Ellipsoidal reflector spot: a lens that can be focused, from a hard to a soft edge. Shutters and gobos shape the beam. For specials and front light from far away.' },
  fresnel: { name: 'Fresnel', short: 'Fresnel', channels: ['Dimmer'], beam: 30, zoom: [12, 60], i0: 32000, ref: 20, edge: [0.8, 0.8], source: 'tungsten', about: 'A stepped lens that gives a very soft edge: beams blend with each other without lines. Spot or flood by moving the lamp. For washes from close distances.' },
  pc: { name: 'PC (plano-convex)', short: 'PC', channels: ['Dimmer'], beam: 25, zoom: [10, 50], i0: 36000, ref: 20, edge: [0.35, 0.35], source: 'tungsten', about: 'A plano-convex lens: an edge between the Fresnel and the profile, with less spill. Common in European theatres.' },
  par: { name: 'LED PAR (RGBW)', short: 'LED PAR', channels: ['Dimmer', 'Red', 'Green', 'Blue', 'White'], beam: 25, zoom: null, i0: 14000, ref: 25, edge: [0.6, 0.6], source: 'led', about: 'A can with red, green, blue and white LEDs: any colour without gels, no heat, less light than a tungsten fixture.' },
  batten: { name: 'LED cyc batten (RGB)', short: 'Cyc batten', channels: ['Dimmer', 'Red', 'Green', 'Blue'], beam: 100, zoom: null, i0: 3000, ref: 100, edge: [0.9, 0.9], source: 'led', about: 'A row of LEDs with a wide, asymmetric beam that lights the cyclorama evenly from top to bottom.' },
  moving: { name: 'Moving head (spot)', short: 'Moving head', channels: ['Pan', 'Pan fine', 'Tilt', 'Tilt fine', 'Dimmer', 'Colour', 'Gobo', 'Zoom'], beam: 20, zoom: [10, 40], i0: 50000, ref: 20, edge: [0.25, 0.25], source: 'discharge', about: 'A fixture that moves by itself: pan and tilt with motors, a colour wheel, gobos and zoom, all through DMX. 16-bit pan and tilt (coarse + fine) for smooth, exact movement.' },
};
export const footprint = type => TYPES[type].channels.length;
export const PAN_RANGE = 540, TILT_RANGE = 270; // degrees, over the DMX range of the moving head

// ─── The rig of the lab ──────────────────────────────────────────────────────
// pos: where it hangs; aim: the point it is focused on (conventional fixtures are focused by hand).
export const FIXTURES = [
  { id: 'fohL', name: 'FOH left', type: 'profile', pos: [-4.5, 6.2, 6], aim: [0, 1.5, -3], bar: 'FOH' },
  { id: 'fohR', name: 'FOH right', type: 'profile', pos: [4.5, 6.2, 6], aim: [0, 1.5, -3], bar: 'FOH' },
  { id: 'special', name: 'Lectern special', type: 'profile', pos: [-3.3, 6.2, -1], aim: [-3.3, 1.1, -2.2], bar: 'LX1' },
  { id: 'washL', name: 'Wash left', type: 'fresnel', pos: [-2.6, 6.2, -1], aim: [-2, 0.8, -3.5], bar: 'LX1' },
  { id: 'washR', name: 'Wash right', type: 'fresnel', pos: [2.6, 6.2, -1], aim: [2, 0.8, -3.5], bar: 'LX1' },
  { id: 'pcC', name: 'Centre PC', type: 'pc', pos: [0, 6.2, -1], aim: [0, 0.8, -3.2], bar: 'LX1' },
  { id: 'back', name: 'Backlight', type: 'fresnel', pos: [0, 6.2, -5.4], aim: [0, 1.4, -3], bar: 'LX2' },
  { id: 'parL', name: 'LED PAR left', type: 'par', pos: [-3.4, 6.2, -5.4], aim: [-1.5, 0.6, -3], bar: 'LX2' },
  { id: 'parR', name: 'LED PAR right', type: 'par', pos: [3.4, 6.2, -5.4], aim: [1.5, 0.6, -3], bar: 'LX2' },
  { id: 'cycL', name: 'Cyc batten left', type: 'batten', pos: [-2.8, 6.4, -6.2], aim: [-2.8, 1.4, -8], bar: 'Cyc' },
  { id: 'cycR', name: 'Cyc batten right', type: 'batten', pos: [2.8, 6.4, -6.2], aim: [2.8, 1.4, -8], bar: 'Cyc' },
  { id: 'mover', name: 'Moving head', type: 'moving', pos: [0, 6.3, -3.3], aim: null, bar: 'LX2' },
];
export const FIX = Object.fromEntries(FIXTURES.map(f => [f.id, f]));
// Where things are on stage.
export const ACTOR = { x: 0, z: -3, h: 1.75 };          // the singer, centre stage
export const ACTOR2 = { x: 2.6, z: -4.6, h: 1.75 };     // the dancer, up stage left
export const LECTERN = { x: -3.3, z: -2.2, h: 1.1 };
// The colour wheel of the moving head (DMX ranges of 32 values each).
export const WHEEL = [
  { name: 'Open', hex: '#ffffff' }, { name: 'Red', hex: '#ff2a1a' }, { name: 'Orange', hex: '#ff8a1a' }, { name: 'Yellow', hex: '#ffe23a' },
  { name: 'Green', hex: '#2aff5a' }, { name: 'Cyan', hex: '#2adfff' }, { name: 'Blue', hex: '#2a4dff' }, { name: 'Magenta', hex: '#ff2ad9' },
];
// Colour filters (gels) for tungsten fixtures. Approximate colours; 201 and 204 transmissions from LEE.
export const GELS = {
  none: { name: 'No gel', hex: '#ffffff', t: 1 },
  L201: { name: 'L201 Full C.T. Blue', hex: '#9ec4ff', t: 0.35, about: 'Converts tungsten (3200 K) to daylight (5700 K).' },
  L204: { name: 'L204 Full C.T. Orange', hex: '#ffb46a', t: 0.63, about: 'Converts daylight to tungsten: warmer light.' },
  L147: { name: 'L147 Apricot', hex: '#ff9a6a', t: 0.5 },
  L106: { name: 'L106 Primary Red', hex: '#ff2a2a', t: 0.12 },
  L119: { name: 'L119 Dark Blue', hex: '#2f5bff', t: 0.06 },
};
export const TUNGSTEN = '#ffc98f';   // 3200 K

// ─── State ───────────────────────────────────────────────────────────────────
// Per fixture: dim (0–1), rgbw (LED, 0–1 each), gel, zoom (deg), edge (0–1), pan / tilt (deg), wheel, gobo, addr.
export const DEFAULT_ADDR = { fohL: 1, fohR: 2, special: 3, washL: 4, washR: 5, pcC: 6, back: 7, parL: 11, parR: 16, cycL: 21, cycR: 25, mover: 31 };
export function defaultState() {
  const fx = {};
  for (const f of FIXTURES) {
    const T = TYPES[f.type];
    fx[f.id] = { dim: 0, gel: 'none', zoom: T.zoom ? T.beam : T.beam, edge: T.edge[0], rgbw: [1, 1, 1, 0], pan: 0, tilt: 0, wheel: 0, gobo: 0, addr: DEFAULT_ADDR[f.id] };
    if (f.type === 'batten') fx[f.id].rgbw = [0.2, 0.4, 1, 0];
    if (f.type === 'moving') Object.assign(fx[f.id], { pan: 0, tilt: 0, zoom: 16 });
  }
  return { fx, cues: [], live: -1, dip: Array(9).fill(false) };
}
export const cloneState = s => JSON.parse(JSON.stringify(s));

// ─── Colour ──────────────────────────────────────────────────────────────────
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const rgbHex = c => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
export const mixLed = ([r, g, b, w = 0]) => { const c = [r + w * 0.9, g + w * 0.85, b + w * 0.75], m = Math.max(1, ...c); return c.map(v => v / m); };
// The colour of the light of a fixture (full brightness) and the fraction of light that comes out.
export function lightColor(f, s) {
  const T = TYPES[f.type];
  if (T.source === 'led') { const c = mixLed(s.rgbw); const lum = f.type === 'par' ? (0.3 * s.rgbw[0] + 0.45 * s.rgbw[1] + 0.12 * s.rgbw[2] + 0.6 * (s.rgbw[3] || 0)) : (0.3 * s.rgbw[0] + 0.55 * s.rgbw[1] + 0.15 * s.rgbw[2]); return { hex: rgbHex(c), t: Math.min(1, lum) }; }
  if (T.source === 'discharge') { const w = WHEEL[s.wheel] || WHEEL[0]; return { hex: w.hex, t: s.wheel ? 0.35 : 1 }; }
  const g = GELS[s.gel] || GELS.none, base = hexRgb(TUNGSTEN), gc = hexRgb(g.hex);
  const c = base.map((v, i) => v * gc[i]), m = Math.max(...c);
  return { hex: rgbHex(c.map(v => v / m)), t: g.t };
}
export function hueSat(hex) {
  const [r, g, b] = hexRgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0; if (d > 1e-6) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: max ? d / max : 0, v: max };
}

// ─── Beams ───────────────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = v => Math.hypot(v[0], v[1], v[2]);
const norm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Direction of a moving head: tilt 0 = straight down, pan 0 = tilting towards the audience.
export function moverDir(pan, tilt) {
  const p = pan * Math.PI / 180, t = tilt * Math.PI / 180;
  return norm([Math.sin(t) * Math.sin(p), -Math.cos(t), Math.sin(t) * Math.cos(p)]);
}
export function beamDir(f, s) { return f.type === 'moving' ? moverDir(s.pan, s.tilt) : norm(sub(f.aim, f.pos)); }
export const beamAngle = (f, s) => TYPES[f.type].zoom ? s.zoom : TYPES[f.type].beam;       // full field angle, degrees
export const edgeOf = (f, s) => TYPES[f.type].edgeAdjust ? s.edge : TYPES[f.type].edge[0];
export const peakCd = (f, s) => TYPES[f.type].i0 * (TYPES[f.type].ref / beamAngle(f, s)) ** 2;
// Where the axis of a beam meets the floor (or null if it points up).
export function floorHit(f, s) { const d = beamDir(f, s); if (d[1] >= -1e-6) return null; const k = -f.pos[1] / d[1]; return [f.pos[0] + d[0] * k, 0, f.pos[2] + d[2] * k]; }
// Distance from a point to the axis of the beam (in front of the fixture).
export function axisDistance(f, s, p) { const d = beamDir(f, s), v = sub(p, f.pos), t = dot(v, d); if (t <= 0) return Infinity; return len(sub(v, [d[0] * t, d[1] * t, d[2] * t])); }
// Relative intensity at an angle off the axis: full inside the hot centre, falling to 0 at the field edge.
export function falloff(f, s, off) {
  const half = beamAngle(f, s) / 2, e = edgeOf(f, s), inner = half * (1 - 0.85 * e);
  if (off <= inner) return 1; if (off >= half) return 0;
  const x = (off - inner) / (half - inner); return 1 - x * x * (3 - 2 * x);
}
// Illuminance (lux) at point p on a surface with normal n, from one fixture or from all.
export function luxFrom(f, s, p, n) {
  if (!s.dim) return 0;
  const v = sub(p, f.pos), d = len(v), dir = [v[0] / d, v[1] / d, v[2] / d];
  const off = Math.acos(Math.max(-1, Math.min(1, dot(dir, beamDir(f, s))))) * 180 / Math.PI;
  const inc = n ? Math.max(0, -dot(dir, n)) : 1;
  return s.dim * peakCd(f, s) * lightColor(f, s).t * falloff(f, s, off) * inc / (d * d);
}
export function lux(st, p, n, ids = FIXTURES.map(f => f.id)) { return ids.reduce((a, id) => a + luxFrom(FIX[id], st.fx[id], p, n), 0); }
// Measuring points.
export const FACE = { p: [ACTOR.x, 1.55, ACTOR.z + 0.12], n: [0, 0, 1] };                 // the face, looking at the audience
export const BACK = { p: [ACTOR.x, 1.62, ACTOR.z - 0.05], n: norm([0, 0.6, -0.8]) };       // head and shoulders from behind
export const faceFrom = (st, id) => luxFrom(FIX[id], st.fx[id], FACE.p, FACE.n);
export const faceLux = st => lux(st, FACE.p, FACE.n);
export const backLux = st => luxFrom(FIX.back, st.fx.back, BACK.p, BACK.n);
export const cycLux = st => (lux(st, [-2.8, 3, STAGE.cyc + 0.05], [0, 0, 1], ['cycL', 'cycR']) + lux(st, [2.8, 3, STAGE.cyc + 0.05], [0, 0, 1], ['cycL', 'cycR'])) / 2;

// ─── DMX ─────────────────────────────────────────────────────────────────────
const to8 = v => Math.round(Math.min(1, Math.max(0, v)) * 255);
// The DMX values of a fixture's channels.
export function dmxOf(f, s) {
  switch (f.type) {
    case 'par': return [to8(s.dim), ...s.rgbw.map(to8)];
    case 'batten': return [to8(s.dim), ...s.rgbw.slice(0, 3).map(to8)];
    case 'moving': {
      const p = Math.round((s.pan / PAN_RANGE + 0.5) * 65535), t = Math.round((s.tilt / TILT_RANGE + 0.5) * 65535);
      const z = Math.round((s.zoom - 10) / 30 * 255);
      return [p >> 8, p & 255, t >> 8, t & 255, to8(s.dim), s.wheel * 32, s.gobo * 32, Math.min(255, Math.max(0, z))];
    }
    default: return [to8(s.dim)];
  }
}
// Set one channel of a fixture from a DMX value (0–255).
export function setChannel(f, s, ch, v) {
  v = Math.max(0, Math.min(255, Math.round(v)));
  const name = TYPES[f.type].channels[ch];
  if (f.type === 'moving') {
    const cur = dmxOf(f, s); cur[ch] = v;
    s.pan = ((cur[0] * 256 + cur[1]) / 65535 - 0.5) * PAN_RANGE;
    s.tilt = ((cur[2] * 256 + cur[3]) / 65535 - 0.5) * TILT_RANGE;
    s.dim = cur[4] / 255; s.wheel = Math.min(7, Math.floor(cur[5] / 32)); s.gobo = Math.min(7, Math.floor(cur[6] / 32)); s.zoom = 10 + cur[7] / 255 * 30;
    return;
  }
  if (name === 'Dimmer') s.dim = v / 255;
  else s.rgbw[ch - 1] = v / 255;
}
// The whole universe: 512 values, and which fixture owns every channel.
export function universe(st) {
  const values = new Array(UNIVERSE).fill(0), owner = new Array(UNIVERSE).fill(null);
  for (const f of FIXTURES) {
    const s = st.fx[f.id], vals = dmxOf(f, s);
    vals.forEach((v, i) => { const a = s.addr - 1 + i; if (a >= 0 && a < UNIVERSE) { values[a] = v; owner[a] = owner[a] ? owner[a] + '+' + f.id : f.id; } });
  }
  return { values, owner };
}
// Fixtures whose channels overlap, and fixtures that do not fit in the universe.
export function patchProblems(st) {
  const out = [], ids = FIXTURES.map(f => f.id);
  for (let i = 0; i < ids.length; i++) {
    const a = st.fx[ids[i]].addr, aEnd = a + footprint(FIX[ids[i]].type) - 1;
    if (a < 1 || aEnd > UNIVERSE) out.push({ kind: 'range', a: ids[i] });
    for (let j = i + 1; j < ids.length; j++) {
      const b = st.fx[ids[j]].addr, bEnd = b + footprint(FIX[ids[j]].type) - 1;
      if (a <= bEnd && b <= aEnd) out.push({ kind: 'overlap', a: ids[i], b: ids[j] });
    }
  }
  return out;
}
// DIP switches: switch k (1–9) is worth 2^(k-1). The address is the sum of the switches that are on.
export const DIP_VALUES = [1, 2, 4, 8, 16, 32, 64, 128, 256];
export const dipAddress = dip => dip.reduce((a, on, i) => a + (on ? DIP_VALUES[i] : 0), 0);
export const dipFor = addr => DIP_VALUES.map(v => (addr & v) !== 0);

// ─── Cues ────────────────────────────────────────────────────────────────────
const LOOK_KEYS = ['dim', 'rgbw', 'gel', 'zoom', 'edge', 'pan', 'tilt', 'wheel', 'gobo'];
export function lookOf(st) { const o = {}; for (const f of FIXTURES) { o[f.id] = {}; for (const k of LOOK_KEYS) o[f.id][k] = JSON.parse(JSON.stringify(st.fx[f.id][k])); } return o; }
export function applyLook(st, look) { for (const f of FIXTURES) Object.assign(st.fx[f.id], JSON.parse(JSON.stringify(look[f.id]))); }
// A look between two others (a fade): numbers interpolate, choices (gel, colour wheel) switch halfway.
export function blendLook(a, b, k) {
  const o = {};
  for (const f of FIXTURES) {
    o[f.id] = {};
    for (const key of LOOK_KEYS) {
      const x = a[f.id][key], y = b[f.id][key];
      o[f.id][key] = Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * k) : typeof x === 'number' && key !== 'wheel' && key !== 'gobo' ? x + (y - x) * k : (k < 0.5 ? x : y);
    }
  }
  return o;
}
export const isBlackout = look => FIXTURES.every(f => look[f.id].dim < 0.005);
// A look evaluated on its own (for the checks of recorded cues).
export function withLook(st, look) { const s = cloneState(st); applyLook(s, look); return s; }
