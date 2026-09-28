// Color & Type Lab: the fonts of the lab, their measured metrics and the rules of readable text.
// Metrics were measured from the font files (tools/font-metrics: OS/2 x-height and cap height, the
// average advance width of a sample English sentence), as fractions of the font size (em).

export const FONTS = {
  'Inter':            { file: 'inter', kind: 'sans', weights: [400, 700], xHeight: 0.546, capHeight: 0.728, ascender: 0.728, descender: -0.204, avgChar: 0.471, about: 'A sans serif drawn for screens: big x-height, open shapes.' },
  'Jost':             { file: 'jost', kind: 'sans', weights: [400, 700], xHeight: 0.46, capHeight: 0.7, ascender: 0.78, descender: -0.22, avgChar: 0.42, about: 'A geometric sans serif (like Futura): elegant, with a small x-height.' },
  'Merriweather':     { file: 'merriweather', kind: 'serif', weights: [400, 700], xHeight: 0.555, capHeight: 0.743, ascender: 0.819, descender: -0.242, avgChar: 0.48, about: 'A serif for reading on screens: sturdy serifs and a big x-height.' },
  'Playfair Display': { file: 'playfair-display', kind: 'display', weights: [400, 700], xHeight: 0.514, capHeight: 0.708, ascender: 0.784, descender: -0.181, avgChar: 0.446, about: 'A display serif with high contrast between thick and thin strokes: for big titles.' },
  'Lobster':          { file: 'lobster', kind: 'script', weights: [400], xHeight: 0.5, capHeight: 0.748, ascender: 0.7, descender: -0.25, avgChar: 0.381, about: 'A script face: joined letters with personality, only for a few words.' },
  'JetBrains Mono':   { file: 'jetbrains-mono', kind: 'mono', weights: [400, 700], xHeight: 0.55, capHeight: 0.73, ascender: 0.73, descender: -0.18, avgChar: 0.6, about: 'A monospaced face for code: every letter is as wide as the others.' },
};
export const FAMILIES = Object.keys(FONTS);
export const KIND_NAMES = { sans: 'sans serif', serif: 'serif', display: 'display', script: 'script', mono: 'monospace' };
export const isTextFace = family => ['sans', 'serif'].includes(FONTS[family]?.kind);
export const cssFamily = family => `'${family}', ${FONTS[family]?.kind === 'serif' || FONTS[family]?.kind === 'display' ? 'serif' : FONTS[family]?.kind === 'mono' ? 'monospace' : 'sans-serif'}`;

// p: { family, size (px), weight, lh (line height, × size), ls (letter spacing, em), upper, width (px) }
export function charsPerLine(p) {
  const f = FONTS[p.family]; if (!f || !p.width) return Infinity;
  return p.width / (p.size * (f.avgChar + (p.ls || 0)));
}
export const BODY = { minSize: 16, maxSize: 20, minLh: 1.4, maxLh: 1.7, minChars: 45, maxChars: 75 };
export function bodyChecks(p) {
  const cpl = charsPerLine(p);
  return {
    size: p.size >= BODY.minSize && p.size <= BODY.maxSize,
    lh: p.lh >= BODY.minLh - 1e-6 && p.lh <= BODY.maxLh + 1e-6,
    chars: cpl >= BODY.minChars && cpl <= BODY.maxChars,
    cpl,
  };
}
// The x-height in pixels, what the eye reads as the size of the text.
export const xHeightPx = p => p.size * (FONTS[p.family]?.xHeight || 0.5);

// A modular type scale: every level is `ratio` times the one below.
export const RATIOS = [
  { r: 1.125, name: 'Major second' }, { r: 1.2, name: 'Minor third' }, { r: 1.25, name: 'Major third' },
  { r: 1.333, name: 'Perfect fourth' }, { r: 1.5, name: 'Perfect fifth' }, { r: 1.618, name: 'Golden ratio' },
];
export const scaleSizes = (base, ratio) => ({ caption: base / ratio, body: base, h2: base * ratio * ratio, h1: base * ratio ** 3 });
// A hierarchy that reads: body 16–18 px, caption at least 12 px, and every step clearly bigger (×1.15–×2).
export function scaleChecks(s) {
  const r = [s.body / s.caption, s.h2 / s.body, s.h1 / s.h2], okR = x => x >= 1.15 - 1e-6 && x <= 2 + 1e-6;
  return { body: s.body >= 16 && s.body <= 18, caption: s.caption >= 12, steps: r.map(okR), ratios: r, ok: s.body >= 16 && s.body <= 18 && s.caption >= 12 && r.every(okR) };
}
