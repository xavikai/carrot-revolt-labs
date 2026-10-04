// Trim Sheet Lab: choosing the texel density and the size of the sheet. Pure maths, no DOM.
import { TYPES, TYPE_IDS } from './sheet.js?v=1';

// Typical cases. H: vertical resolution of the screen (per eye in VR), fov: vertical field of view in degrees,
// d: the closest distance at which the player usually sees a wall or a prop (not the worst case).
export const PLATFORMS = {
  mobile:   { name: 'Mobile, top-down camera',      H: 1080, fov: 60, d: 4,    note: 'The phone renders below its native resolution and the camera is high and far.' },
  handheld: { name: 'Handheld console, third person', H: 720, fov: 60, d: 3,   note: 'A small screen and a low resolution: details are lost before texels run out.' },
  pc3:      { name: 'PC / console, third person',   H: 1440, fov: 60, d: 2.5,  note: 'The camera follows the character a couple of metres behind.' },
  pc1:      { name: 'PC / console, first person',   H: 1440, fov: 60, d: 1.5,  note: 'The player walks right up to the walls.' },
  vr:       { name: 'VR headset',                   H: 2200, fov: 96, d: 1,    note: 'Very close and every flaw is magnified: the most demanding case.' },
};
export const PLATFORM_IDS = Object.keys(PLATFORMS);
export const TD_STEPS = [128, 256, 512, 1024, 2048];
// How many screen pixels one metre covers, at distance d.
export const screenPxPerM = (H, fov, d) => H / (2 * d * Math.tan(fov * Math.PI / 360));
// The target: the power of two at or just above what the screen can show.
export const targetTD = px => TD_STEPS.find(t => t >= px * 0.98) ?? TD_STEPS[TD_STEPS.length - 1];
export const platformTD = (id, d = PLATFORMS[id].d) => targetTD(screenPxPerM(PLATFORMS[id].H, PLATFORMS[id].fov, d));
// Texels per screen pixel: below 1 the texture is blurry, above 2 the extra pixels are never seen (only memory).
export function sharpness(td, px) {
  const k = td / px;
  return { k, verdict: k < 0.9 ? 'blurry' : k > 2.2 ? 'wasted' : 'sharp' };
}

// The castle set: real height of every strip (m), and the padding, which scales with the sheet (8 px at 1K).
export const SET_METRES = TYPE_IDS.reduce((a, tp) => a + TYPES[tp].m, 0);   // 1.875 m
export const SHEET_SIZES = [512, 1024, 2048, 4096];
export const padFor = size => size / 128;
// Rows a sheet needs at a texel density: every strip at its real height × density, plus padding.
export function sheetNeed(td, size) {
  const px = SET_METRES * td + TYPE_IDS.length * padFor(size);
  return { px, fits: px <= size, waste: px <= size ? 1 - px / size : 0, repeat: size / td };
}
// The right sheet: the smallest one the strips fit in.
export const rightSheet = td => SHEET_SIZES.find(s => sheetNeed(td, s).fits) ?? null;
// Memory of a texture set (colour, normal, ORM), 1 byte/px compressed, plus mipmaps.
export const setMB = res => 3 * res * res * (4 / 3) / (1024 * 1024);
// The three projects of step td2.
export const PROJECTS = [
  { id: 'mobile', platform: 'mobile' },
  { id: 'pc3', platform: 'pc3' },
  { id: 'pc1', platform: 'pc1' },
];
