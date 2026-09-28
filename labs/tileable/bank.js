// Tileable Texture Lab: every image the lab uses, painted on first use and kept.
// Pure JS: the stages and the tests use the same images as the page.
import { paint, lightOver, crop, resize, offset, normalFromHeight, stroke, copyImage, newImage, gaussianBlur, STAIN } from './texture.js?v=2';

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// The photo: 1400 × 1050 px covering 2.7 × 2.03 m of a stone floor (≈ 518 px/m).
export const PHOTO = { w: 1400, h: 1050, mw: 2.7, mh: 2.03 };
export const PX_PER_M = PHOTO.w / PHOTO.mw;
// The square that stages 3b and 4 start from: 2 m of the photo, 1037 px, made 1024 px.
export const CROP = { x: Math.round(0.35 * PX_PER_M), y: 8, s: 1037 };
export const N = 1024;
const toDoc = (mx, my) => [(mx * PX_PER_M - CROP.x) * N / CROP.s, (my * PX_PER_M - CROP.y) * N / CROP.s];

export const rawPhoto = () => once('raw', () => paint(PHOTO.w, PHOTO.h, [0, 0, PHOTO.mw, PHOTO.mh], { stain: true }).col);
export const photo = () => once('photo', () => lightOver(rawPhoto(), [0, 0, PHOTO.mw, PHOTO.mh]));
export const litSquare = () => once('lit', () => resize(crop(photo(), CROP.x, CROP.y, CROP.s, CROP.s), N, N));
export const flatSquare = () => once('flat', () => resize(crop(rawPhoto(), CROP.x, CROP.y, CROP.s, CROP.s), N, N));
export const offsetSquare = () => once('offset', () => offset(flatSquare(), N / 2, N / 2, 'wrap'));
// Where the stain is in the square after the offset, and its radius in px.
export const stainAt = (dx = N / 2, dy = N / 2) => { const [x, y] = toDoc(STAIN.x, STAIN.y); return { x: (((x + dx) % N) + N) % N, y: (((y + dy) % N) + N) % N, r: STAIN.r * PX_PER_M * N / CROP.s }; };

// One way to heal the cross: soft Healing Brush strokes along both lines, taking pixels from 100 px away, wavy so no straight edge is left.
export function healCross(im, sx, sy) {
  let src = copyImage(im);
  const v = [], h = [];
  for (let y = -40; y <= im.h + 40; y += 12) v.push([sx + Math.sin(y / 55) * 16, y]);
  stroke(im, src, v, -100, 0, 50, 0, true);
  src = copyImage(im);
  for (let x = -40; x <= im.w + 40; x += 12) h.push([x, sy + Math.sin(x / 55) * 16]);
  stroke(im, src, h, 0, -100, 50, 0, true);
  return im;
}
export function healBlot(im, b) {
  const src = copyImage(im), pts = [];
  for (let a = 0; a < Math.PI * 2; a += 0.35) pts.push([b.x + Math.cos(a) * b.r * 0.6, b.y + Math.sin(a) * b.r * 0.6]);
  pts.push([b.x, b.y]);
  stroke(im, src, pts, b.x > im.w / 2 ? -b.r * 5 : b.r * 5, 0, b.r * 1.3, 0.2, true);
  return im;
}
export const healedSquare = () => once('healed', () => healCross(copyImage(offsetSquare()), N / 2, N / 2));

// ─── Textures for the Blender stages ─────────────────────────────────────────
// The finished tileable stones: 2 m, colour + height + roughness (+ normal).
export const stones = () => once('stones', () => { const p = paint(N, N, [0, 0, 2, 2], { P: 2, maps: true }); return { col: p.col, rough: p.rough, normal: normalFromHeight(p.height, 2.2) }; });
export const stonesAt = res => once('stones' + res, () => (res === N ? stones().col : resize(stones().col, res, res)));
// A roughness map made from the photo before it was tileable: its edges and its light are still in it.
export const photoRough = () => once('photoRough', () => {
  // Mostly the light of the photo (blurred), plus a little of the pebbles: every copy gets one shiny corner.
  const src = litSquare(), soft = gaussianBlur(src, 40), out = newImage(N, N);
  const L = (im, i) => (im.d[i] * 0.3 + im.d[i + 1] * 0.59 + im.d[i + 2] * 0.11) / 255;
  for (let i = 0; i < src.d.length; i += 4) { const r = Math.min(1, Math.max(0.05, 1.7 - L(soft, i) * 2.6 + (0.5 - L(src, i)) * 0.35)) * 255; out.d[i] = out.d[i + 1] = out.d[i + 2] = r; }
  return out;
});
export const bricks = () => once('bricks', () => { const p = paint(512, 512, [0, 0, 2, 2], { kind: 'brick', P: 2, maps: true }); return { col: p.col, normal: normalFromHeight(p.height, 1.6) }; });
export const rock = () => once('rock', () => { const p = paint(512, 512, [0, 0, 2, 2], { kind: 'rock', P: 2, maps: true }); return { col: p.col, normal: normalFromHeight(p.height, 1.2) }; });
export const moss = () => once('moss', () => paint(512, 512, [0, 0, 2, 2], { kind: 'moss', P: 2 }).col);
// The photo as it would look used directly on the floor (the 2 m square, light and all).
export const photoTexture = () => litSquare();
