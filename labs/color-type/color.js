// Color & Type Lab: colour maths. Hex, RGB, HSL, CIE Lab, WCAG contrast, colour vision deficiency
// and a small model of offset printing (CMYK on coated paper). Pure module: no DOM.

export const clamp01 = v => Math.min(1, Math.max(0, v));
export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}
export const rgbToHex = rgb => '#' + rgb.map(v => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('');
export const normHex = hex => { const rgb = hexToRgb(hex); return rgb ? rgbToHex(rgb) : null; };

// HSL: hue in degrees, saturation and lightness 0–100.
export function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d > 1e-9) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}
export function hslToRgb([h, s, l]) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
export const hslToHex = hsl => rgbToHex(hslToRgb(hsl));
export const hexToHsl = hex => rgbToHsl(hexToRgb(hex));

// ─── Luminance and WCAG contrast ────────────────────────────────────────────
export const toLinear = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
export const toGamma = c => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
export function luminance(hex) { const [r, g, b] = hexToRgb(hex).map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
// Large text in WCAG: at least 24 px, or 18.66 px (14 pt) and bold.
export const isLarge = (px, weight) => px >= 24 || (px >= 18.66 && weight >= 700);
export function wcag(ratio, large = false) {
  return { AA: ratio >= (large ? 3 : 4.5), AAA: ratio >= (large ? 4.5 : 7), ui: ratio >= 3 };
}

// ─── CIE Lab (D65 for the screen; D50 for print) and colour differences ──────
const M_RGB_XYZ = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]];
const M_XYZ_RGB = [[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]];
const BRADFORD_65_50 = [[1.0478112, 0.0228866, -0.0501270], [0.0295424, 0.9904844, -0.0170491], [-0.0092345, 0.0150436, 0.7521316]];
const BRADFORD_50_65 = [[0.9555766, -0.0230393, 0.0631636], [-0.0282895, 1.0099416, 0.0210077], [0.0122982, -0.0204830, 1.3299098]];
const WHITE_D65 = [0.95047, 1, 1.08883], WHITE_D50 = [0.96422, 1, 0.82521];
const mul = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
const fi = t => t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27);
export function xyzToLab(xyz, white) { const [x, y, z] = xyz.map((v, i) => f(v / white[i])); return [116 * y - 16, 500 * (x - y), 200 * (y - z)]; }
export function labToXyz([L, a, b], white) { const y = (L + 16) / 116, x = y + a / 500, z = y - b / 200; return [fi(x) * white[0], fi(y) * white[1], fi(z) * white[2]]; }
export const rgbToXyz = rgb => mul(M_RGB_XYZ, rgb.map(toLinear));
export const xyzToRgb = xyz => mul(M_XYZ_RGB, xyz).map(toGamma);
export const hexToLab = hex => xyzToLab(rgbToXyz(hexToRgb(hex)), WHITE_D65);
export const hexToLab50 = hex => xyzToLab(mul(BRADFORD_65_50, rgbToXyz(hexToRgb(hex))), WHITE_D50);
export const lab50ToRgb = lab => xyzToRgb(mul(BRADFORD_50_65, labToXyz(lab, WHITE_D50)));
export const lab50ToHex = lab => rgbToHex(lab50ToRgb(lab));
export const inSrgb = rgb => rgb.every(v => v >= -0.002 && v <= 1.002);
export const deltaE76 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// CIEDE2000: the colour difference that matches what the eye sees (about 2.3 = just noticeable).
export function deltaE2000(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2, rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360, h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = h2p - h1p; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * rad / 2);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p; if (C1p * C2p !== 0) hm = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const Sl = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
  const Rt = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
export const hexDelta = (a, b) => deltaE2000(hexToLab(a), hexToLab(b));
export const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
export const chromaOf = lab => Math.hypot(lab[1], lab[2]);
export const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ─── Colour vision deficiency (Machado, Oliveira & Fernandes 2009, full severity) ─
export const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  achromatopsia: [[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]],
};
export function simulate(hex, kind) {
  const m = CVD[kind]; if (!m) return normHex(hex);
  return rgbToHex(mul(m, hexToRgb(hex).map(toLinear)).map(v => toGamma(clamp01(v))));
}

// ─── Screen light and printing ink ───────────────────────────────────────────
// A simple model of offset printing on coated paper: the colours of the paper and of every overprint of
// cyan, magenta and yellow (measured values close to FOGRA39, CIE Lab D50), mixed with the Yule-Nielsen
// modified Neugebauer equations. Black ink darkens every mixture. Good enough to show what cannot be printed.
const PRIMARIES = {                 // key: which inks are printed (c, m, y)
  '000': [95, 0, -2], '100': [55, -37, -50], '010': [48, 74, -3], '001': [89, -5, 93],
  '110': [24, 22, -46], '101': [50, -65, 27], '011': [47, 68, 48], '111': [23, 0, 0],
};
const K_SOLID = [16, 0, 0], N = 2;   // Yule-Nielsen n
const PXYZ = Object.fromEntries(Object.entries(PRIMARIES).map(([k, lab]) => [k, labToXyz(lab, WHITE_D50).map(v => Math.pow(v, 1 / N))]));
const K_RATIO = labToXyz(K_SOLID, WHITE_D50)[1] / labToXyz(PRIMARIES['000'], WHITE_D50)[1];
// c, m, y, k: 0–100 (%). Returns Lab D50 of the printed colour.
export function cmykToLab([c, m, y, k]) {
  c /= 100; m /= 100; y /= 100; k /= 100;
  const out = [0, 0, 0];
  for (const [key, xyz] of Object.entries(PXYZ)) {
    const w = (key[0] === '1' ? c : 1 - c) * (key[1] === '1' ? m : 1 - m) * (key[2] === '1' ? y : 1 - y);
    for (let i = 0; i < 3; i++) out[i] += w * xyz[i];
  }
  const kf = 1 - k + k * Math.pow(K_RATIO, 1 / N);          // black ink over the mixture
  return xyzToLab(out.map(v => Math.pow(v * kf, N)), WHITE_D50);
}
export const cmykToHex = cmyk => lab50ToHex(cmykToLab(cmyk));
export const totalInk = ([c, m, y, k]) => c + m + y + k;
export const INK_LIMIT = 300;       // total area coverage a printer accepts (%)
// The printable colours on a grid, for gamut checks (built once).
let GRID = null;
function grid() {
  if (GRID) return GRID;
  GRID = [];
  const s = [0, 6.25, 12.5, 18.75, 25, 31.25, 37.5, 43.75, 50, 56.25, 62.5, 68.75, 75, 81.25, 87.5, 93.75, 100];
  for (const c of s) for (const m of s) for (const y of s) for (const k of [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]) {
    if (c + m + y + k > INK_LIMIT + 20) continue;
    GRID.push({ cmyk: [c, m, y, k], lab: cmykToLab([c, m, y, k]) });
  }
  return GRID;
}
// The closest colour the press can print, and how far it is (ΔE76 in Lab D50).
export function nearestPrintable(hex) {
  const lab = hexToLab50(hex); let best = null, bd = Infinity;
  for (const g of grid()) { const d = deltaE76(lab, g.lab); if (d < bd) { bd = d; best = g; } }
  // refine around the best grid point: smaller and smaller steps in the four inks
  let cm = [...best.cmyk], cl = best.lab;
  for (let step = 3.2; step > 0.2; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (let i = 0; i < 4; i++) for (const s of [-step, step]) {
        const t = [...cm]; t[i] = Math.min(100, Math.max(0, t[i] + s));
        if (totalInk(t) > INK_LIMIT + 20) continue;
        const tl = cmykToLab(t), d = deltaE76(lab, tl);
        if (d < bd - 1e-6) { bd = d; cm = t; cl = tl; moved = true; }
      }
    }
  }
  return { cmyk: cm.map(v => Math.round(v)), lab: cl, hex: lab50ToHex(cl), dE: bd };
}
export const GAMUT_TOLERANCE = 6;   // ΔE76: paper white and process cyan still count as printable
export const printable = hex => nearestPrintable(hex).dE <= GAMUT_TOLERANCE;
