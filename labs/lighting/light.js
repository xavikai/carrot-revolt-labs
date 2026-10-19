// Lighting Lab: the physics of the lights, with no DOM and no three.js, so it can be tested.
// Units follow the physical formulas Blender uses for its lights:
//   Point and Spot: Power P (W) spread over the whole sphere → irradiance E = P / (4π d²) · cos θ
//   Sun: Strength S (W/m²) → E = S · cos θ, whatever the distance
//   Area: Power P (W) emitted forwards like a flat diffuse panel → intensity (P / π) · cos θ_light
//   World: uniform radiance L → E = π · L on any surface
// A diffuse surface of albedo ρ lit with E looks like a scene-linear value ρ · E / π.
// Coordinates: y up, the camera looks at the bust from +Z. Azimuth 0° = in front of the subject,
// +90° = camera right (+X). Elevation is measured from the horizon.

export const MIDDLE_GREY = 0.18;
export const ALBEDO = { plaster: 0.72, grey: 0.18 };
export const BACKDROPS = { white: 0.85, grey: 0.5, black: 0.04 };
export const CARD_COLORS = { white: [0.85, 0.85, 0.85], gold: [0.85, 0.62, 0.25], black: [0.03, 0.03, 0.03] };

// The set: a plaster bust on a pedestal, a grey and a chrome ball, and a paper backdrop.
export const HEAD = { c: [0, 1.55, 0], r: 0.1 };
export const CHEST = { c: [0, 1.3, 0], r: 0.13 };
export const BACKDROP_Z = -1.2;
export const TARGETS = { head: [0, 1.55, 0], backdrop: [0, 1.35, BACKDROP_Z], wallL: [-0.5, 1.5, BACKDROP_Z] };
export const CAMERA = { pos: [0.12, 1.52, 2.2], target: [0.12, 1.45, 0], fov: 18 };
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const V = { nrm, add, sub, mul, dot, cross };

// Points where the lab measures the light (the light meter). cam L / cam R are the cheeks on the
// camera's left (−X) and right (+X); rim L / rim R are the back edges of the head; the backdrop is
// measured on both sides of the bust, where its shadow does not fall.
const onHead = (x, y, z, n) => ({ p: add(HEAD.c, [x, y, z]), n: nrm(n), onHead: true, obj: 'bust' });
export const PROBES = {
  camL: onHead(-0.05, -0.012, 0.07, [-0.6, -0.05, 0.8]),
  camR: onHead(0.05, -0.012, 0.07, [0.6, -0.05, 0.8]),
  rimL: onHead(-0.072, 0.03, -0.035, [-0.85, 0.15, -0.5]),
  rimR: onHead(0.072, 0.03, -0.035, [0.85, 0.15, -0.5]),
  backL: { p: [-0.75, 1.6, BACKDROP_Z], n: [0, 0, 1], obj: 'backdrop' },
  backR: { p: [0.75, 1.6, BACKDROP_Z], n: [0, 0, 1], obj: 'backdrop' },
  backC: { p: [0, 1.8, BACKDROP_Z], n: [0, 0, 1], obj: 'backdrop' },
  // where the bust's shadow falls on the backdrop in the Shadow Linking step
  backS: { p: [0.6, 1.3, BACKDROP_Z], n: [0, 0, 1], obj: 'backdrop' },
};

export const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
export function lightPos(l) {
  const t = TARGETS[l.target || 'head'], a = rad(l.az), e = rad(l.el);
  return add(t, mul([Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], l.dist));
}
// Unit vector from the target towards the light (for the Sun, the direction the light comes from).
export function lightDir(l) { const a = rad(l.az), e = rad(l.el); return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]; }

// ─── Colour temperature ──────────────────────────────────────────────────────
// Planck's law integrated with the CIE 1931 colour matching functions (Wyman et al. fit),
// converted to linear Rec.709 and scaled to luminance 1, so the temperature changes the colour, not the power.
const g = (x, m, s1, s2) => { const t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
const cmf = l => [
  1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
  0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
  1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
];
const bbCache = new Map();
export function blackbody(K) {
  K = Math.round(Math.max(1000, Math.min(20000, K)));
  if (bbCache.has(K)) return bbCache.get(K);
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const m = l * 1e-9, B = 1 / (Math.pow(m, 5) * (Math.exp(1.4388e-2 / (m * K)) - 1)), [x, y, z] = cmf(l);
    X += B * x; Y += B * y; Z += B * z;
  }
  let rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z].map(v => Math.max(0, v));
  const lum = luminance(rgb);
  rgb = rgb.map(v => v / lum);
  bbCache.set(K, rgb);
  return rgb;
}
export const luminance = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// The colour of a light, scaled to luminance 1 (so the power alone sets how bright it is).
export function lightColor(l) {
  if (l.colorMode === 'kelvin') return blackbody(l.kelvin);
  const c = l.color || [1, 1, 1], y = luminance(c);
  return y > 1e-6 ? c.map(v => v / y) : [0, 0, 0];
}

// ─── Visibility ──────────────────────────────────────────────────────────────
// The head and the chest block light (spheres). A point on the head is not blocked by the head itself
// (the cosine already darkens the side that faces away).
function hitsSphere(o, d, len, s) {
  const oc = sub(o, s.c), b = dot(oc, d), c = dot(oc, oc) - s.r * s.r, h = b * b - c;
  if (h < 0) return false;
  const t = -b - Math.sqrt(h);
  return t > 1e-4 && t < len;
}
// bust = false when Shadow Linking takes the bust out of the light's blockers.
function visible(p, onHead, to, len, bust = true) {
  if (!bust) return true;
  if (!onHead && hitsSphere(p, to, len, HEAD)) return false;
  return !hitsSphere(p, to, len, CHEST);
}

// ─── Irradiance ──────────────────────────────────────────────────────────────
// Samples on the emitting surface of an area light (5 × 5), facing its target.
export function lightFrame(l) {
  const w = mul(lightDir(l), -1);                // the light points back at its target
  const up = Math.abs(w[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const u = nrm(cross(up, w)), v = cross(w, u);
  return { w, u, v };
}
function areaSamples(l) {
  const c = lightPos(l), { u, v } = lightFrame(l), out = [], n = 5;
  const sx = l.size, sy = l.shape === 'RECTANGLE' ? l.sizeY : l.size;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let a = (i + 0.5) / n - 0.5, b = (j + 0.5) / n - 0.5;
    if (l.shape === 'DISK' && a * a + b * b > 0.25) continue;
    out.push(add(c, add(mul(u, a * sx), mul(v, b * sy))));
  }
  return out;
}
export function spotFactor(l, toPoint) {
  // toPoint: unit vector from the light towards the point
  const axis = mul(lightDir(l), -1), cosA = dot(axis, toPoint), half = rad(l.spotSize) / 2;
  const outer = Math.cos(half), inner = Math.cos(half * (1 - l.blend));
  if (cosA <= outer) return 0;
  if (cosA >= inner) return 1;
  const t = (cosA - outer) / (inner - outer);
  return t * t * (3 - 2 * t);
}
// ─── Shaping the beam: Spread, gobos and IES profiles ───────────────────────
// Spread (Cycles, Area lights): every point of the panel only sends light within Spread/2 of its normal,
// like a softbox with a honeycomb grid. The lab uses max(0, 1 − tan a / tan(Spread/2)): the light at the
// sides is removed (a real grid absorbs it) and the light on the axis stays the same.
export function spreadFactor(spreadDeg = 180, cosA = 1) {
  if (spreadDeg >= 179.9) return 1;
  if (cosA <= 0) return 0;
  const tanA = Math.sqrt(Math.max(0, 1 - cosA * cosA)) / cosA;
  return Math.max(0, 1 - tanA / Math.tan(rad(spreadDeg) / 2));
}
// Gobos: procedural stand-ins for the Image Texture of a gobo, with Clip extension. x, y go from −1 to 1
// across the cone of the Spot. 1 = the light passes, 0 = the metal of the gobo blocks it.
export const GOBOS = { none: 'None', window: 'Window', blinds: 'Blinds', leaves: 'Leaves' };
export function goboValue(name, x, y) {
  if (!name || name === 'none') return 1;
  if (Math.abs(x) > 1 || Math.abs(y) > 1) return 0;
  if (name === 'window') {
    const ax = Math.abs(x), ay = Math.abs(y);
    if (ax > 0.82 || ay > 0.82) return 0;          // the wall around the window
    return ax < 0.05 || ay < 0.05 ? 0 : 1;          // the mullions
  }
  if (name === 'blinds') {
    if (Math.abs(x) > 0.9 || Math.abs(y) > 0.9) return 0;
    return (y * 4.5 + 10) % 1 < 0.55 ? 1 : 0;      // horizontal slats
  }
  // leaves: dappled light through foliage
  const nz = Math.sin(3.1 * x + 1.7 * y + 0.3) * Math.sin(2.3 * y - 1.1 * x + 0.5) + 0.55 * Math.sin(6.7 * x - 5.3 * y + 1.2) * Math.sin(4.9 * x + 6.1 * y) + 0.3 * Math.sin(11.3 * x + 9.7 * y + 2.1);
  return x * x + y * y < 1 && nz > 0.15 ? 1 : 0;
}
// The Mapping node in front of the gobo (Point type): Scale, then Rotation around Z.
export function goboAt(l, x, y) {
  const s = l.goboScale || 1, a = rad(l.goboRot || 0), c = Math.cos(a), sn = Math.sin(a), px = x * s, py = y * s;
  return goboValue(l.gobo, c * px + sn * py, -sn * px + c * py);
}
// IES profiles: the light a real fixture sends at each angle from its axis (0° = straight along the axis),
// relative to its brightest direction. They stand in for .ies files measured by manufacturers.
export const IES = {
  none: { name: 'None' },
  downlight: { name: 'Downlight · wide', cutoff: 62 },
  narrow: { name: 'Spot · narrow beam', cutoff: 40 },
  scallop: { name: 'Downlight · scallop', cutoff: 46 },
};
const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
export function iesValue(name, t) {
  if (!name || name === 'none' || !IES[name]) return 1;
  if (name === 'downlight') return Math.sqrt(Math.max(0, Math.cos(rad(t)))) * (1 - smooth(48, 62, t));
  if (name === 'narrow') return Math.pow(0.5, (t / 11) ** 2) * (1 - smooth(30, 40, t));    // half the light at 11°
  // a batwing downlight: brightest around 35°, then a sharp cut-off that draws a scallop on a wall
  const r = Math.sin(Math.min(t, 36) / 36 * Math.PI / 2);
  return (0.45 + 0.55 * r * r) * (1 - smooth(42, 46, t));
}
// The "cookie" of a light: its beam across the cone, as a projector sees it. x and y are tangents of the
// angle from the axis; tanHalf is where the cookie ends. The render projects the same function.
export function cookieOf(l) {
  if (l.type === 'AREA') {
    if ((l.spread ?? 180) >= 179.9) return null;
    const T = Math.tan(Math.min(rad(l.spread) / 2, rad(85)));
    return { tanHalf: T, key: `S${l.spread}`, f: (x, y) => { const c = 1 / Math.sqrt(1 + x * x + y * y); return c * spreadFactor(l.spread, c); } };
  }
  const gobo = l.type === 'SPOT' && l.gobo && l.gobo !== 'none', ies = (l.type === 'SPOT' || l.type === 'POINT') && l.ies && l.ies !== 'none' && IES[l.ies];
  if (!gobo && !ies) return null;
  const half = l.type === 'SPOT' ? Math.min(rad(l.spotSize) / 2, rad(85)) : rad(Math.min(IES[l.ies].cutoff + 2, 85)), T = Math.tan(half);
  return {
    tanHalf: T, key: `${l.type}${gobo ? `${l.gobo}${l.goboScale}${l.goboRot}` : ''}|${ies ? l.ies : ''}|${T.toFixed(4)}`,
    f: (x, y) => (gobo ? goboAt(l, x / T, y / T) : 1) * (ies ? iesValue(l.ies, deg(Math.atan(Math.hypot(x, y)))) : 1),
  };
}
// Value of the cookie in a direction (unit vector from the light towards the point).
export function cookieFactor(l, toPoint, ck = cookieOf(l)) {
  if (!ck) return 1;
  const { w, u, v } = lightFrame(l), c = dot(w, toPoint);
  if (c <= 1e-6) return 0;
  const x = dot(u, toPoint) / c, y = dot(v, toPoint) / c;
  return Math.abs(x) > ck.tanHalf || Math.abs(y) > ck.tanHalf ? 0 : ck.f(x, y);
}

// ─── Falloff, Soft Falloff, Custom Distance, Light Linking, fog ───────────────
// Light Falloff node (Cycles): Quadratic is physical (1/d²). Linear and Constant multiply the strength by d
// or d², so the light falls as 1/d or not at all.
export const FALLOFF_EXP = { QUADRATIC: 2, LINEAR: 1, CONSTANT: 0 };
// Custom Distance (EEVEE): the light fades smoothly to nothing at that distance.
export function customWindow(l, d) {
  if (!l.customDist) return 1;
  const q = 1 - (d / Math.max(l.customDistance, 1e-3)) ** 4;
  return q > 0 ? q * q : 0;
}
// A sphere of radius R seen from a surface at distance d with the centre at angle θ from its normal,
// partly below the horizon if it has to (Lagarde & de Rousiers 2014). Returns the illuminance of a unit
// radiance sphere; 0 when the point is inside the sphere.
export function sphereIllum(cosT, d, R) {
  if (d <= R) return 0;
  const s2 = (R * R) / (d * d);
  if (cosT * cosT > s2) return Math.PI * s2 * Math.max(cosT, 0);
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT)), x = Math.sqrt(1 / s2 - 1), y = Math.max(-1, Math.min(1, -x * (cosT / Math.max(sinT, 1e-6))));
  const sy = sinT * Math.sqrt(1 - y * y);
  return Math.max(0, (cosT * Math.acos(y) - x * sy) * s2 + Math.atan(sy / x));
}
// Light Linking: with any object set to Include, the light only reaches the included objects; Exclude
// always removes an object.
export function linkOk(l, obj) {
  const L = l.link; if (!L) return true;
  if (L[obj] === 'exclude') return false;
  return !Object.values(L).includes('include') || L[obj] === 'include';
}
// Shadow Linking (Blocker Collection): the same rules decide which objects cast this light's shadows.
export const shadowOk = (l, obj) => linkOk({ link: l.shadowLink }, obj);
// Is the sphere of a Point or Spot light going into the backdrop?
export function wallGap(l) { return lightPos(l)[2] - BACKDROP_Z; }

// Irradiance (W/m²) that one light gives to a probe {p, n, onHead, obj}. fog is the Density of the
// fog volume: the light is dimmed by exp(−Density · d) on its way.
export function irradiance(l, probe, fog = 0) {
  if (!l.on) return 0;
  const { p, n } = probe;
  if (probe.obj && !linkOk(l, probe.obj)) return 0;
  const blocks = shadowOk(l, 'bust');
  if (l.type === 'SUN') {
    const d = lightDir(l), c = dot(n, d);
    return c > 0 && visible(p, probe.onHead, d, 50, blocks) ? l.strength * c : 0;
  }
  const e = FALLOFF_EXP[l.falloff] ?? 2;
  if (l.type === 'AREA') {
    const S = areaSamples(l), { w } = lightFrame(l), I0 = l.power / Math.PI / S.length, spread = l.spread ?? 180;
    let E = 0;
    for (const s of S) {
      const v = sub(s, p), d = Math.hypot(...v), dir = mul(v, 1 / d);
      const cr = dot(n, dir), cl = -dot(w, dir);
      if (cr > 0 && cl > 0 && visible(p, probe.onHead, dir, d, blocks)) E += I0 * cl * spreadFactor(spread, cl) * cr / Math.max(d ** e, 0.01) * customWindow(l, d) * Math.exp(-fog * d);
    }
    return E;
  }
  const L = lightPos(l), v = sub(L, p), d = Math.hypot(...v), dir = mul(v, 1 / d), c = dot(n, dir), R = l.radius || 0;
  const sphere = e === 2 && l.softFalloff === false && R > 0;
  if ((c <= 0 && !sphere) || !visible(p, probe.onHead, dir, d, blocks)) return 0;
  const toP = mul(dir, -1), shape = (l.type === 'SPOT' ? spotFactor(l, toP) : 1) * cookieFactor(l, toP), I = l.power / (4 * Math.PI);
  let E;
  if (sphere) E = I / (Math.PI * R * R) * sphereIllum(c, d, R);            // Soft Falloff off: a real glowing sphere
  else if (e === 2) E = I * c / (d * d + (l.softFalloff === false ? 0 : R * R)); // Soft Falloff on
  else E = I * c / Math.max(d ** e, 0.01);
  return E * shape * customWindow(l, d) * Math.exp(-fog * d);
}

// The bounce card is a sheet of foam board: it receives light and sends ρ·E back as a diffuse panel.
// In the render and in the meter it becomes an area light with power ρ · E · A.
export function cardAsLight(card, lights, fog = 0) {
  const probe = { p: lightPos({ ...card, target: 'head' }), n: mul(lightDir(card), -1), obj: 'card' };  // the card faces the head
  const col = CARD_COLORS[card.color] || CARD_COLORS.white;
  let E = [0, 0, 0];
  for (const l of lights) { const e = irradiance(l, probe, fog), c = lightColor(l); E = add(E, mul(c, e)); }
  const refl = [E[0] * col[0], E[1] * col[1], E[2] * col[2]], y = luminance(refl), A = card.size * card.size;
  return { on: card.on && y > 0, type: 'AREA', shape: 'SQUARE', size: card.size, power: y * A, colorMode: 'rgb', color: y > 0 ? refl.map(v => v / y) : [1, 1, 1], az: card.az, el: card.el, dist: card.dist, target: 'head', shadow: true, card: true };
}
// The fog volume's shader, as Cycles does it. Volume Scatter: scattering = extinction = Density · Color.
// Principled Volume: scattering = Density · Color, absorption = Density · (1 − Color) · (1 − Absorption Color),
// extinction = scattering + absorption (per channel). A white Color never absorbs; a black one only absorbs.
export function fogCoeffs(fog) {
  if (!fog?.on) return { sigS: [0, 0, 0], sigT: [0, 0, 0] };
  const d = fog.density, c = fog.color || [1, 1, 1];
  if (fog.shader !== 'PRINCIPLED') { const s = c.map(v => d * v); return { sigS: s, sigT: s }; }
  const a = fog.absorption || [0, 0, 0], sigS = c.map(v => d * v);
  return { sigS, sigT: c.map((v, k) => d * (v + Math.max(0, 1 - v) * Math.max(0, 1 - a[k]))) };
}
// One number for the light meter: how fast the fog dims light (the luminance of the extinction).
export const fogDensity = state => luminance(fogCoeffs(state.fog).sigT);
export function allLights(state) {
  const ls = Object.values(state.lights);
  return state.card?.on ? [...ls, cardAsLight(state.card, ls, fogDensity(state))] : ls;
}

// ─── The world ───────────────────────────────────────────────────────────────
// Procedural HDRIs, generated here so the render and the meter see exactly the same light.
// Equirectangular like three.js: u = atan2(z, x) / 2π + 0.5, v = asin(y) / π + 0.5 (row 0 = bottom).
export const HDRIS = {
  studio: { name: 'Studio (softbox)' },
  sunset: { name: 'Sunset' },
  overcast: { name: 'Overcast sky' },
};
export function hdriDirection(u, v) {
  const phi = (u - 0.5) * 2 * Math.PI, th = (v - 0.5) * Math.PI;
  return [Math.cos(th) * Math.cos(phi), Math.sin(th), Math.cos(th) * Math.sin(phi)];
}
// Radiance of a preset in a direction. rot (degrees) turns the whole HDRI around the vertical axis.
// The main light of each preset is at azimuth 0 (in front of the subject) before rotation.
export function hdriRadiance(name, d, rot = 0) {
  const a = Math.atan2(d[0], d[2]) - rad(rot), el = Math.asin(Math.max(-1, Math.min(1, d[1])));
  const azd = Math.atan2(Math.sin(a), Math.cos(a));   // azimuth of this direction in the HDRI, −π…π
  const box = (ca, ce, wa, we) => Math.abs(azd - ca) < wa && Math.abs(el - ce) < we;
  if (name === 'studio') {
    if (box(0, rad(20), rad(22), rad(18))) return [9, 9, 8.6];             // big softbox
    if (box(Math.PI * 0.75, rad(15), rad(6), rad(25))) return [2.2, 2.3, 2.5]; // strip light behind
    return el < 0 ? [0.03, 0.03, 0.03] : [0.05, 0.05, 0.055];
  }
  if (name === 'sunset') {
    const sun = Math.acos(Math.min(1, Math.cos(azd) * Math.cos(el - rad(6)))) < rad(3);
    if (sun) return [180, 95, 40];
    if (el < 0) return [0.08, 0.06, 0.05];
    const t = Math.min(1, el / rad(60)), glow = Math.max(0, Math.cos(azd)) ** 4 * (1 - t);
    return [0.25 + 1.6 * glow - 0.1 * t, 0.2 + 0.8 * glow, 0.35 + 0.5 * t + 0.2 * glow];
  }
  // overcast: bright top, darker horizon and ground
  if (el < 0) return [0.12, 0.12, 0.11];
  const s = 0.55 + 0.75 * Math.sin(el);
  return [s, s, s * 1.03];
}
export function makeHdri(name, rot = 0, w = 256, h = 128) {
  const px = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = hdriRadiance(name, hdriDirection((i + 0.5) / w, (j + 0.5) / h), rot), k = (j * w + i) * 4;
    px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; px[k + 3] = 1;
  }
  return px;
}
// Irradiance of the world on a surface with normal n (numerical integration over the sphere).
const hdriCache = new Map();
export function worldIrradiance(world, n) {
  if (world.mode !== 'hdri') return Math.PI * luminance(world.color) * world.strength;
  const key = `${world.hdri}|${world.rot}|${n.map(v => v.toFixed(3))}`;
  if (hdriCache.has(key)) return hdriCache.get(key) * world.strength;
  const W = 128, H = 64; let E = 0;
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H, th = (v - 0.5) * Math.PI, dOmega = (2 * Math.PI / W) * (Math.PI / H) * Math.cos(th);
    for (let i = 0; i < W; i++) {
      const d = hdriDirection((i + 0.5) / W, v), c = dot(d, n);
      if (c > 0) E += luminance(hdriRadiance(world.hdri, d, world.rot)) * c * dOmega;
    }
  }
  if (hdriCache.size > 500) hdriCache.clear();
  hdriCache.set(key, E);
  return E * world.strength;
}

// ─── The light meter ─────────────────────────────────────────────────────────
export const stopsOf = ratio => Math.log2(Math.max(ratio, 1e-6));
export const ratioLabel = r => r >= 1 ? `${r.toFixed(1)}:1` : `1:${(1 / r).toFixed(1)}`;
// Apparent size of a light seen from the head, in degrees: what makes shadows hard or soft.
export function apparentSize(l) {
  if (l.type === 'SUN') return l.angle;
  const s = l.type === 'AREA' ? Math.max(l.size, l.shape === 'RECTANGLE' ? l.sizeY : 0) : 2 * l.radius;
  return deg(2 * Math.atan(s / 2 / Math.max(l.dist, 1e-3)));
}
// Everything the lab measures: irradiance at every probe (lights + world), ratios, and the scene-linear
// value of the plaster and the backdrop after the exposure (what the view transform receives).
export function measure(state) {
  const ls = allLights(state), E = {}, fog = fogDensity(state);
  for (const [k, probe] of Object.entries(PROBES)) {
    const per = {};
    for (const [id, l] of Object.entries(state.lights)) per[id] = irradiance(l, probe, fog);
    if (state.card?.on) per.card = irradiance(ls[ls.length - 1], probe, fog);
    const world = worldIrradiance(state.world, probe.n);
    E[k] = { per, world, total: Object.values(per).reduce((a, b) => a + b, 0) + world };
  }
  const gain = Math.pow(2, state.view.exposure), pl = ALBEDO.plaster / Math.PI * gain, bd = (BACKDROPS[state.backdrop] ?? 0.5) / Math.PI * gain;
  const L = E.camL.total, R = E.camR.total, back = (E.backL.total + E.backR.total + E.backC.total) / 3, face = Math.max(L, R);
  const ratio = Math.max(L, R) / Math.max(Math.min(L, R), 1e-6);
  return {
    E, ratio, ratioStops: stopsOf(ratio), keySide: L >= R ? 'L' : 'R',
    face, back, rim: Math.max(E.rimL.total, E.rimR.total),
    backVsFace: stopsOf(back * (BACKDROPS[state.backdrop] ?? 0.5) / Math.max(face * ALBEDO.plaster, 1e-6)),
    faceValue: face * pl, backValue: back * bd,
    faceStops: stopsOf(face * pl / MIDDLE_GREY), backStops: stopsOf(back * bd / MIDDLE_GREY),
  };
}

// ─── False Color ─────────────────────────────────────────────────────────────
// Bands in stops around middle grey (0.18). The same table is used by the render shader and the legend.
export const FALSE_COLOR = [
  { to: -6, color: [0.05, 0.0, 0.1], label: '< −6' },
  { to: -4, color: [0.35, 0.05, 0.55], label: '−6…−4' },
  { to: -2.5, color: [0.1, 0.2, 0.85], label: '−4…−2.5' },
  { to: -1.5, color: [0.1, 0.6, 0.75], label: '−2.5…−1.5' },
  { to: -0.5, color: [0.25, 0.25, 0.25], label: '−1.5…−0.5' },
  { to: 0.5, color: [0.55, 0.55, 0.55], label: '±0.5' },
  { to: 1.5, color: [0.95, 0.6, 0.65], label: '+0.5…+1.5' },
  { to: 2.5, color: [0.3, 0.8, 0.3], label: '+1.5…+2.5' },
  { to: 4, color: [0.95, 0.85, 0.2], label: '+2.5…+4' },
  { to: 99, color: [0.95, 0.15, 0.1], label: '> +4' },
];
export const falseColorBand = stops => FALSE_COLOR.findIndex(b => stops < b.to);
