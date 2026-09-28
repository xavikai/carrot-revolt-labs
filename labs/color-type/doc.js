// Color & Type Lab: the page the students design (a festival website), its layers, colour styles and
// text styles, and the functions that read a state. Pure module: no DOM.
import * as C from './color.js';
import { FONTS } from './type.js';

// Colour styles (like Figma variables with a Light and a Dark mode).
export const TOKENS = ['background', 'surface', 'text', 'muted', 'primary', 'onPrimary', 'primarySoft', 'success', 'danger', 'onStatus'];
export const TOKEN_NAMES = { background: 'Background', surface: 'Surface', text: 'Text', muted: 'Text muted', primary: 'Primary', onPrimary: 'On primary', primarySoft: 'Primary soft', success: 'Success', danger: 'Danger', onStatus: 'On status' };
export const GOOD_COLORS = {
  background: { light: '#ffffff', dark: '#14121b' }, surface: { light: '#f4f2fb', dark: '#211e2c' },
  text: { light: '#1d1b26', dark: '#eeeaf7' }, muted: { light: '#5c5a6b', dark: '#b3aec4' },
  primary: { light: '#5b34c9', dark: '#b9a1ff' }, onPrimary: { light: '#ffffff', dark: '#1d1236' },
  primarySoft: { light: '#ece6ff', dark: '#2e2548' }, success: { light: '#1b6e34', dark: '#8fdca2' },
  danger: { light: '#b3261e', dark: '#ffb4ab' }, onStatus: { light: '#ffffff', dark: '#14121b' },
};
// Text styles.
export const STYLES = ['h1', 'h2', 'body', 'caption', 'label', 'button'];
export const STYLE_NAMES = { h1: 'Heading 1', h2: 'Heading 2', body: 'Body', caption: 'Caption', label: 'Label', button: 'Button' };
export const GOOD_STYLES = {
  h1: { family: 'Playfair Display', size: 40, weight: 700, lh: 1.1, ls: -0.01, upper: false },
  h2: { family: 'Playfair Display', size: 25, weight: 700, lh: 1.2, ls: 0, upper: false },
  body: { family: 'Inter', size: 16, weight: 400, lh: 1.5, ls: 0, upper: false },
  caption: { family: 'Inter', size: 13, weight: 400, lh: 1.4, ls: 0, upper: false },
  label: { family: 'Inter', size: 12, weight: 700, lh: 1.2, ls: 0.08, upper: true },
  button: { family: 'Inter', size: 16, weight: 700, lh: 1.2, ls: 0, upper: false },
};
export const BODY_WIDTH = 520;

export const PARAGRAPH = 'Every spring the school turns its theatre into a cinema. Students of animation, lighting and live production show the short films they made this year, and a jury of professionals chooses the best of each category. Entry is free, but seats are limited: book yours before the doors open.';
// type: frame | shape | text | image. on: the layer behind a text (for contrast). token / style: what the
// layer should be linked to in a design system.
export const LAYERS = [
  { id: 'page', name: 'Page', type: 'frame', token: 'background' },
  { id: 'nav', name: 'Nav bar', type: 'shape', on: 'page', token: 'surface' },
  { id: 'brand', name: 'Brand', type: 'text', on: 'nav', token: 'text', style: 'h2', text: 'Lumen Fest' },
  { id: 'links', name: 'Menu', type: 'text', on: 'nav', token: 'muted', style: 'caption', text: 'Programme · Tickets · Venue' },
  { id: 'chip', name: 'Tag chip', type: 'shape', on: 'page', token: 'primarySoft' },
  { id: 'tag', name: 'Tag', type: 'text', on: 'chip', token: 'primary', style: 'label', text: 'Animation' },
  { id: 'title', name: 'Title', type: 'text', on: 'page', token: 'text', style: 'h1', text: 'Seven nights of short films' },
  { id: 'subtitle', name: 'Subtitle', type: 'text', on: 'page', token: 'muted', style: 'body', text: '12–18 April · Main theatre and open-air cinema' },
  { id: 'body', name: 'Body', type: 'text', on: 'page', token: 'text', style: 'body', text: PARAGRAPH, wide: true },
  { id: 'button', name: 'Button', type: 'shape', on: 'page', token: 'primary' },
  { id: 'label', name: 'Button label', type: 'text', on: 'button', token: 'onPrimary', style: 'button', text: 'Book a seat' },
  { id: 'link', name: 'Link', type: 'text', on: 'page', token: 'primary', style: 'body', text: 'See the full programme →' },
  { id: 'card', name: 'Card', type: 'shape', on: 'page', token: 'surface' },
  { id: 'poster', name: 'Poster', type: 'image', on: 'card' },
  { id: 'cardTitle', name: 'Card title', type: 'text', on: 'card', token: 'text', style: 'h2', text: 'The Lighthouse Keeper' },
  { id: 'meta', name: 'Details', type: 'text', on: 'card', token: 'muted', style: 'caption', text: '18 min · Room 2 · 19:30' },
  { id: 'okChip', name: 'Available chip', type: 'shape', on: 'card', token: 'success' },
  { id: 'okText', name: 'Available', type: 'text', on: 'okChip', token: 'onStatus', style: 'caption', text: 'Available' },
  { id: 'noChip', name: 'Sold out chip', type: 'shape', on: 'card', token: 'danger' },
  { id: 'noText', name: 'Sold out', type: 'text', on: 'noChip', token: 'onStatus', style: 'caption', text: 'Sold out' },
];
export const LAYER = Object.fromEntries(LAYERS.map(l => [l.id, l]));
export const TEXT_LAYERS = LAYERS.filter(l => l.type === 'text').map(l => l.id);
export const FILL_LAYERS = LAYERS.filter(l => l.type !== 'image').map(l => l.id);

// ─── State ───────────────────────────────────────────────────────────────────
// fills[id]: '#hex' or '@token'. type[id]: '@style' or { family, size, weight, lh, ls, upper }.
// width: the width of the body text box. cmyk[id]: [c, m, y, k] when a layer is specified in ink.
export function goodState({ linked = false } = {}) {
  const colors = JSON.parse(JSON.stringify(GOOD_COLORS)), styles = JSON.parse(JSON.stringify(GOOD_STYLES));
  const fills = {}, type = {};
  for (const l of LAYERS) {
    if (l.token) fills[l.id] = linked ? '@' + l.token : colors[l.token].light;
    if (l.style) type[l.id] = linked ? '@' + l.style : { ...styles[l.style] };
  }
  return { fills, type, colors, styles, mode: 'light', width: BODY_WIDTH, cmyk: {}, icons: false, view: 'normal', proof: false };
}
export const cloneState = s => JSON.parse(JSON.stringify(s));

// ─── Reading a state ─────────────────────────────────────────────────────────
export function fill(st, id) {
  if (st.cmyk?.[id]) return C.cmykToHex(st.cmyk[id]);
  const v = st.fills[id];
  if (v == null) return null;
  if (v.startsWith('@')) return st.colors[v.slice(1)][st.mode];
  return v;
}
export function textProps(st, id) {
  const v = st.type[id];
  const p = typeof v === 'string' ? st.styles[v.slice(1)] : v;
  return p ? { ...p, width: LAYER[id].wide ? st.width : null } : null;
}
// The colour behind a text (for the contrast).
export const behind = (st, id) => fill(st, LAYER[id].on);
export function textContrast(st, id) {
  const p = textProps(st, id), ratio = C.contrast(fill(st, id), behind(st, id)), large = C.isLarge(p.size, p.weight);
  return { ratio, large, ...C.wcag(ratio, large) };
}
// A pair of colour styles that must read on each other, and the ratio they need.
export const TOKEN_PAIRS = [
  ['text', 'background', 4.5], ['text', 'surface', 4.5], ['muted', 'background', 4.5], ['muted', 'surface', 4.5],
  ['onPrimary', 'primary', 4.5], ['primary', 'background', 3], ['primary', 'primarySoft', 4.5], ['onStatus', 'success', 4.5], ['onStatus', 'danger', 4.5],
];
export function pairResults(st, mode = st.mode) {
  return TOKEN_PAIRS.map(([a, b, need]) => { const ratio = C.contrast(st.colors[a][mode], st.colors[b][mode]); return { a, b, need, ratio, ok: ratio >= need - 1e-9 }; });
}
export const allLinked = st => LAYERS.every(l => !l.token || String(st.fills[l.id]).startsWith('@'));
export const linkedAny = (st, id) => typeof st.fills[id] === 'string' && st.fills[id].startsWith('@');
export const families = st => [...new Set(STYLES.map(s => st.styles[s].family))];
export const fontOk = (family, weight) => FONTS[family]?.weights.includes(weight);
// The sizes of the main levels, for the type scale.
export const levelSizes = st => ({ h1: st.styles.h1.size, h2: st.styles.h2.size, body: st.styles.body.size, caption: st.styles.caption.size });
