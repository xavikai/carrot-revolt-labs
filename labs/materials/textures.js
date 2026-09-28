// Procedural texture sets for the Material Lab, drawn on canvases so the lab needs no extra files.
// Each set returns data URLs for the Image Texture nodes it uses and the file names they show.
const asset = name => new URL(`./assets/textures/${name}`, import.meta.url).href;
const SIZE = 512;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(draw, size = SIZE) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size); return c;
}
// Per-pixel pass: fn(x, y, [r,g,b,a]) → [r,g,b,a] (0–255).
function pixels(c, fn) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4, o = fn(x, y, [p[i], p[i + 1], p[i + 2], p[i + 3]]);
    p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2]; p[i + 3] = o[3] ?? 255;
  }
  g.putImageData(d, 0, 0); return c;
}
// Smooth value noise that tiles on a 512 canvas.
function noise(seed, cells) {
  const r = rng(seed), grid = Array.from({ length: cells * cells }, r);
  const at = (i, j) => grid[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
  return (x, y) => {
    const fx = x / SIZE * cells, fy = y / SIZE * cells, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const s = t => t * t * (3 - 2 * t), a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * s(u) + (c - a) * s(v) + (a - b - c + d) * s(u) * s(v);
  };
}
const url = c => c.toDataURL('image/png');

// Scratches: random strokes, drawn as a white mask on black. Shared by the painted and gloss sets.
function scratchMask() {
  const r = rng(7);
  const c = canvas((g, n) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n); g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let k = 0; k < 46; k++) {
      let x = r() * n, y = r() * n, a = r() * Math.PI * 2; g.lineWidth = 1.5 + r() * 5; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { a += (r() - .5) * .6; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
      g.stroke();
    }
    // Chipped edges: a worn band at the bottom
    for (let k = 0; k < 90; k++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(r() * n, n - r() * r() * 70, 2 + r() * 9, 0, 7); g.fill(); }
  });
  const nz = noise(3, 32);
  return pixels(c, (x, y, p) => { const v = p[0] > 128 && nz(x, y) > .18 ? 255 : 0; return [v, v, v]; });
}
function paintedSet(gloss) {
  const mask = scratchMask(), m = mask.getContext('2d').getImageData(0, 0, SIZE, SIZE).data, nz = noise(11, 16), fine = noise(5, 128);
  const metal = (x, y) => m[(y * SIZE + x) * 4] > 128;
  const color = pixels(canvas(() => {}), (x, y) => {
    const f = fine(x, y) * 14 - 7, w = nz(x, y) * 18;
    return metal(x, y) ? [150 + f, 152 + f, 156 + f] : [40 + f + w * .3, 92 + f + w * .5, 104 + f + w * .6];
  });
  // Roughness: satin paint about 0.5, polished steel in the scratches about 0.18.
  const roughValue = (x, y) => metal(x, y) ? .18 + fine(x, y) * .06 : .48 + nz(x, y) * .14;
  const rough = pixels(canvas(() => {}), (x, y) => { let v = roughValue(x, y); if (gloss) v = 1 - v; v *= 255; return [v, v, v]; });
  // Normal map: flat, with the scratches as small grooves (OpenGL, Y up).
  const h = (x, y) => (metal((x + SIZE) % SIZE, (y + SIZE) % SIZE) ? -1 : 0);
  const normal = pixels(canvas(() => {}), (x, y) => {
    const dx = (h(x + 1, y) - h(x - 1, y)) * .6, dy = (h(x, y - 1) - h(x, y + 1)) * .6, l = Math.hypot(dx, dy, 1);
    return [(-dx / l * .5 + .5) * 255, (-dy / l * .5 + .5) * 255, (1 / l * .5 + .5) * 255];
  });
  return {
    images: { color: url(color), rough: url(rough), normalTex: url(normal), mask: url(mask) },
    names: { color: 'painted_steel_color.png', rough: gloss ? 'painted_steel_gloss.png' : 'painted_steel_rough.png', normalTex: 'painted_steel_normal.png', mask: 'painted_steel_metallic.png' },
    labels: { mask: 'Metallic', rough: gloss ? 'Gloss' : 'Roughness' },
  };
}
function tilesSet() {
  const n = 4, cell = SIZE / n, grout = 7, bevel = 16, r = rng(21), nz = noise(9, 64);
  const tint = Array.from({ length: n * n }, () => .88 + r() * .12);
  const height = (x, y) => {
    const u = x % cell, v = y % cell, d = Math.min(u, v, cell - u, cell - v) - grout / 2;
    return d <= 0 ? 0 : Math.min(1, .15 + .85 * Math.sin(Math.min(1, d / bevel) * Math.PI / 2));
  };
  const color = pixels(canvas(() => {}), (x, y) => {
    const hgt = height(x, y), k = tint[Math.floor(y / cell) * n + Math.floor(x / cell)], f = nz(x, y) * 16;
    return hgt === 0 ? [96 + f, 92 + f, 86 + f] : [206 * k + f, 132 * k + f * .6, 96 * k + f * .4];
  });
  const h = pixels(canvas(() => {}), (x, y) => { const v = height(x, y) * 235 + nz(x, y) * 20; return [v, v, v]; });
  return { images: { color: url(color), height: url(h) }, names: { color: 'tiles_color.png', height: 'tiles_height.png' }, labels: { height: 'Height' } };
}
function leafSet() {
  // Leaf outline: a pointed ellipse along a slightly curved midrib.
  const inside = (x, y) => {
    const v = y / SIZE, u = (x - SIZE / 2 - Math.sin(v * Math.PI) * 18) / SIZE;
    if (v < .08 || v > .94) return Math.abs(u) < .012 && v > .94 && v < .995 ? 1 : 0;   // stalk at the bottom
    const w = .34 * Math.pow(Math.sin((v - .08) / .86 * Math.PI), .75) * (1 - .25 * (1 - v));
    return Math.abs(u) < w ? 1 : 0;
  };
  const nz = noise(13, 32);
  const color = pixels(canvas(() => {}), (x, y) => {
    const v = y / SIZE, mid = SIZE / 2 + Math.sin(v * Math.PI) * 18, du = x - mid;
    const vein = Math.abs(du) < 3 || Math.abs(((y + Math.abs(du) * .8) % 58) - 29) < 1.4 && Math.abs(du) > 6;
    const f = nz(x, y) * 30;
    return vein ? [150 + f, 178 + f, 88] : [58 + f, 112 + f, 38 + f * .5];
  });
  const alpha = pixels(canvas(() => {}), (x, y) => {
    let s = 0; for (const [a, b] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) s += inside(x + a, y + b);   // 4× supersampled edge
    const v = s / 4 * 255; return [v, v, v];
  });
  return { images: { color: url(color), mask: url(alpha) }, names: { color: 'leaf_color.png', mask: 'leaf_alpha.png' }, labels: { mask: 'Alpha' } };
}

const BRICK = {
  images: { color: asset('brick-color.jpg'), rough: asset('brick-rough.jpg'), normalTex: asset('brick-normal.jpg') },
  names: { color: 'brick_color.jpg', rough: 'brick_rough.jpg', normalTex: 'brick_normal.jpg' },
  labels: {},
};
const cache = new Map();
export function textureSet(name) {
  if (!cache.has(name)) {
    const make = { brick: () => BRICK, plain: () => BRICK, painted: () => paintedSet(false), gloss: () => paintedSet(true), tiles: tilesSet, leaf: leafSet }[name] || (() => BRICK);
    const set = make();
    // Every image node needs something to show, even when this step does not use it.
    cache.set(name, { images: { ...BRICK.images, ...set.images }, names: { ...BRICK.names, ...set.names }, labels: set.labels });
  }
  return cache.get(name);
}
// Image data inverted in the browser: what the Invert node sends on.
export function invertImage(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return pixels(c, (x, y, p) => [255 - p[0], 255 - p[1], 255 - p[2], p[3]]);
}
