// Trim Sheet Lab: what a trim sheet is made of. Pure data and maths, no DOM.
// Image rows go from the top (y = 0) down; UV v goes from the bottom (v = 0) up, as in Blender.
export const SIZE = 1024;            // the sheet is 1024 × 1024 px
export const DENSITY = 512;          // target texel density, px per metre
export const UV_PER_M = DENSITY / SIZE;

// Strip types of the medieval sheet. `m` is the real height a strip needs at 512 px/m.
export const TYPES = {
  plank:      { name: 'Wood planks',  m: 0.5,    use: 'Floors, doors, chest sides' },
  stone:      { name: 'Stone course', m: 0.5,    use: 'One row of ashlar blocks' },
  beam:       { name: 'Wood beam',    m: 0.25,   use: 'Beams, posts, frames' },
  molding:    { name: 'Stone molding', m: 0.25,  use: 'Cornices and capitals' },
  iron:       { name: 'Iron strap',   m: 0.125,  use: 'Bands, hinges, rivets' },
  plinth:     { name: 'Stone plinth', m: 0.125,  use: 'The base of walls and columns' },
  bevelWood:  { name: 'Wood bevel',   m: 0.0625, use: 'Chamfered wooden edges' },
  bevelStone: { name: 'Stone bevel',  m: 0.0625, use: 'Chamfered stone edges' },
};
export const TYPE_IDS = Object.keys(TYPES);
export const HEIGHTS = [16, 32, 64, 128, 256, 512];
export const PADS = [0, 2, 4, 8, 16];
export const DEFAULT_LAYOUT = TYPE_IDS.map(type => ({ type, px: TYPES[type].m * DENSITY }));
export const DEFAULT_PAD = 8;

// Place the strips from the top of the image down, each followed by its padding.
// Returns [{ type, px, y0, y1, v0, v1 }] with v0 < v1, plus the total height used.
export function stripsOf(layout, pad) {
  let y = 0;
  const strips = layout.map((s, i) => {
    const o = { type: s.type, px: s.px, index: i, y0: y, y1: y + s.px, v0: 1 - (y + s.px) / SIZE, v1: 1 - y / SIZE };
    y += s.px + pad;
    return o;
  });
  return { strips, used: y, free: SIZE - y };
}
export const DEFAULT_STRIPS = stripsOf(DEFAULT_LAYOUT, DEFAULT_PAD).strips;
export const stripOf = (type, strips = DEFAULT_STRIPS) => strips.find(s => s.type === type);
// The strip under a v coordinate (null in the padding or outside the sheet).
export function stripAt(v, strips = DEFAULT_STRIPS) {
  const vv = v - Math.floor(v);
  return strips.find(s => vv >= s.v0 && vv <= s.v1) || null;
}
// Smallest mip level at which a strip edge gets colour from its neighbour: one texel of mip m covers 2^m px.
export function cleanMips(pad) { return pad <= 0 ? 0 : Math.floor(Math.log2(pad)); }

// Palettes for re-skinning the whole sheet at once.
export const PALETTES = {
  oak:     { name: 'Oak & sandstone',     wood: [150, 102, 60],  wood2: [96, 62, 34],  stone: [196, 170, 128], stone2: [150, 128, 96], iron: [70, 68, 66] },
  dark:    { name: 'Dark oak & granite',  wood: [92, 62, 42],    wood2: [58, 38, 26],  stone: [132, 132, 136], stone2: [96, 98, 104], iron: [52, 52, 56] },
  pine:    { name: 'Pine & red stone',    wood: [196, 150, 96],  wood2: [150, 104, 60], stone: [170, 96, 78],  stone2: [128, 70, 58],  iron: [84, 78, 72] },
};

// Texture memory of a texture set (colour, normal, roughness), block-compressed at 1 byte per pixel, with mipmaps (+⅓).
export const setMB = res => 3 * res * res * (4 / 3) / (1024 * 1024);
