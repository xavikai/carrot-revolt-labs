export const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
const lerp = (a, b, f) => a + f * (b - a);
const divide = (a, b) => b === 0 ? 0 : a / b;
const fract = a => a - Math.floor(a);
const floorMod = (a, b) => b === 0 ? 0 : a - b * Math.floor(a / b);

function smoothMin(a, b, distance) {
  if (distance === 0) return Math.min(a, b);
  const h = Math.max(distance - Math.abs(a - b), 0) / distance;
  return Math.min(a, b) - h ** 3 * distance / 6;
}

const math = {
  Add: (a, b) => a + b,
  Subtract: (a, b) => a - b,
  Multiply: (a, b) => a * b,
  Divide: divide,
  'Multiply Add': (a, b, c) => a * b + c,
  Power: (a, b) => (a < 0 && !Number.isInteger(b)) || (a === 0 && b < 0) ? 0 : a ** b,
  Logarithm: (a, b) => a > 0 && b > 0 ? divide(Math.log(a), Math.log(b)) : 0,
  'Square Root': a => Math.sqrt(Math.max(a, 0)),
  'Inverse Square Root': a => a > 0 ? 1 / Math.sqrt(a) : 0,
  Absolute: Math.abs,
  Exponent: Math.exp,
  Minimum: (a, b) => Math.min(a, b),
  Maximum: (a, b) => Math.max(a, b),
  'Less Than': (a, b) => Number(a < b),
  'Greater Than': (a, b) => Number(a > b),
  Sign: Math.sign,
  Compare: (a, b, c) => Number(Math.abs(a - b) <= Math.max(c, 2 ** -23)),
  'Smooth Minimum': smoothMin,
  'Smooth Maximum': (a, b, c) => -smoothMin(-a, -b, c),
  Round: a => Math.floor(a + 0.5),
  Floor: Math.floor,
  Ceil: Math.ceil,
  Truncate: Math.trunc,
  Fraction: fract,
  'Truncated Modulo': (a, b) => b === 0 ? 0 : a % b,
  'Floored Modulo': floorMod,
  Wrap: (a, max, min) => min + floorMod(a - min, max - min),
  Snap: (a, b) => Math.floor(divide(a, b)) * b,
  'Ping-Pong': (a, b) => b === 0 ? 0 : Math.abs(fract((a - b) / (2 * b)) * 2 * b - b),
  Sine: Math.sin,
  Cosine: Math.cos,
  Tangent: Math.tan,
  Arcsine: a => Math.asin(clamp(a, -1, 1)),
  Arccosine: a => Math.acos(clamp(a, -1, 1)),
  Arctangent: Math.atan,
  Arctan2: Math.atan2,
  'Hyperbolic Sine': Math.sinh,
  'Hyperbolic Cosine': Math.cosh,
  'Hyperbolic Tangent': Math.tanh,
  'To Radians': a => a * Math.PI / 180,
  'To Degrees': a => a * 180 / Math.PI,
};

export function mathValue(mode, a, b, c, clampResult = false) {
  const result = math[mode](a, b, c);
  return clampResult ? clamp(result) : result;
}

const screen = (a, b) => 1 - (1 - a) * (1 - b);
const rgbModes = {
  Mix: lerp,
  Add: (a, b, f) => a + f * b,
  Subtract: (a, b, f) => a - f * b,
  Multiply: (a, b, f) => lerp(a, a * b, f),
  Screen: (a, b, f) => lerp(a, screen(a, b), f),
  Divide: (a, b, f) => b === 0 ? a : lerp(a, a / b, f),
  Difference: (a, b, f) => lerp(a, Math.abs(a - b), f),
  Exclusion: (a, b, f) => Math.max(0, lerp(a, a + b - 2 * a * b, f)),
  Darken: (a, b, f) => lerp(a, Math.min(a, b), f),
  Lighten: (a, b, f) => lerp(a, Math.max(a, b), f),
  Overlay: (a, b, f) => lerp(a, a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b), f),
  'Color Dodge': (a, b, f) => {
    if (a === 0) return 0;
    const d = 1 - f * b;
    return d <= 0 ? 1 : Math.min(1, a / d);
  },
  'Color Burn': (a, b, f) => {
    const d = lerp(1, b, f);
    return d <= 0 ? 0 : clamp(1 - (1 - a) / d);
  },
  'Soft Light': (a, b, f) => lerp(a, (1 - a) * b * a + a * screen(a, b), f),
  'Linear Light': (a, b, f) => a + f * (2 * b - 1),
};

function toHsv([r, g, b]) {
  const v = Math.max(r, g, b);
  const d = v - Math.min(r, g, b);
  if (d === 0) return [0, 0, v];
  const sector = v === r ? (g - b) / d : v === g ? 2 + (b - r) / d : 4 + (r - g) / d;
  return [fract(sector / 6), d / v, v];
}

function fromHsv(h, s, v) {
  return [5, 3, 1].map(offset => {
    const k = floorMod(h * 6 + offset, 6);
    return v * (1 - s * clamp(Math.min(k, 4 - k)));
  });
}

function hsvMix(mode, a, b, f) {
  const [ha, sa, va] = toHsv(a);
  const [hb, sb, vb] = toHsv(b);
  if (mode === 'Value') return fromHsv(ha, sa, lerp(va, vb, f));
  if (mode === 'Saturation') return sa === 0 ? a : fromHsv(ha, lerp(sa, sb, f), va);
  if (sb === 0) return a;
  const target = fromHsv(hb, mode === 'Hue' ? sa : sb, va);
  return a.map((channel, i) => lerp(channel, target[i], f));
}

export function mixColor(mode, a, b, factor, clampFactor, clampResult) {
  const f = clampFactor ? clamp(factor) : factor;
  const result = Object.hasOwn(rgbModes, mode)
    ? a.map((channel, i) => rgbModes[mode](channel, b[i], f))
    : hsvMix(mode, a, b, f);
  return clampResult ? result.map(channel => clamp(channel)) : result;
}

export function hexToLinear(hex) {
  return [1, 3, 5].map(offset => {
    const s = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
}

export function displayByte(linear) {
  const x = clamp(linear);
  return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
}

const hash = (x, y) => fract(Math.sin(x * 121.7 + y * 289.1) * 43758.5453);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = fract(x), v = fract(y);
  const sx = u * u * (3 - 2 * u), sy = v * v * (3 - 2 * v);
  return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), sx),
    lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
}

export const fields = {
  U: u => u,
  V: (_, v) => v,
  Radial: (u, v) => Math.hypot(u - 0.5, v - 0.5),
  Noise: (u, v, scale) => 0.74 * noise(u * scale, v * scale) + 0.26 * noise(u * scale * 3, v * scale * 3),
  Bands: (u, v, scale) => 0.5 + 0.5 * Math.sin((u + 0.14 * noise(u * 3, v * 3)) * scale * 2 * Math.PI),
  Checker: (u, v, scale) => (Math.floor(u * scale) + Math.floor(v * scale)) % 2,
};
