// Tileable Texture Lab: stages, steps and checks. Pure JS (tested with node).
// Two kinds of step: 'ps' steps work on pixels in a Photoshop-style workspace,
// 'bl' steps work on a scene in a Blender-style workspace.
import { composite, copyImage, crop, resize, offset, gaussianBlur, desaturate, invert, seamReport, unevenness, structure, chroma, blotRatio, isPow2, fbm } from './texture.js?v=2';
import { photo, litSquare, flatSquare, offsetSquare, healedSquare, healCross, healBlot, stainAt, CROP, N } from './bank.js?v=2';
import { WALLS, report, joins, CORNERS, packedUV, solvedUV, scatteredUV, rotate, scale as scaleQ, bbox, cloneUV, TILE_M } from './walls.js?v=2';

const clone = o => JSON.parse(JSON.stringify(o));
const near = (a, b, t) => Math.abs(a - b) <= t;

// ─── Photoshop steps ─────────────────────────────────────────────────────────
export function psState(img, name, extra = {}) {
  return { app: 'ps', doc: name, layers: [{ name: 'Background', img: copyImage(img), blend: 'Normal', opacity: 1, visible: true, bg: true }], active: 0, seam: null, stain: null, flags: {}, cropSide: null, ...extra };
}
export const flat = st => composite(st.layers);
export const seamIn = x => x >= N / 4 && x <= (3 * N) / 4;
// Light report for step p2 (compared with the photo the step starts from).
let base3b = null;
export function lightReport(st) {
  base3b ??= { s: structure(litSquare()), c: chroma(litSquare()) };
  const im = flat(st);
  const u = unevenness(im), s = structure(im) / base3b.s, c = chroma(im) / base3b.c;
  return { uneven: u, structure: s, chroma: c, evenOk: u <= 0.1, structureOk: s >= 0.8, chromaOk: c >= 0.8, ok: u <= 0.1 && s >= 0.8 && c >= 0.8 };
}
export function sizeReport(st) {
  const im = st.layers[0].img, square = im.w === im.h;
  return { w: im.w, h: im.h, square, pow2: isPow2(im.w) && isPow2(im.h), is1024: im.w === 1024 && im.h === 1024, upscaled: st.cropSide != null && im.w > st.cropSide, cropped: st.cropSide != null, distorted: !!st.flags.distorted, ok: square && im.w === 1024 && st.cropSide != null && im.w <= st.cropSide && !st.flags.distorted };
}
export const seamOf = st => (st.seam ? seamReport(flat(st), st.seam.x, st.seam.y) : null);
export const stainOf = st => (st.stain ? blotRatio(flat(st), st.stain.x, st.stain.y, st.stain.r) : 1);

// ─── Blender steps ───────────────────────────────────────────────────────────
export function blState(extra = {}) {
  return Object.assign({
    app: 'bl', scene: 'floor', img: 'tile', ext: 'repeat', scale: [4, 4], coord: 'uv', proj: 'flat', blend: 0, res: 1024,
    maps: null, sun: 42, macro: null, moss: null, uv: null, flags: {}, editor: 'image', show: 'color',
  }, clone(extra));
}
export const density = st => st.res * st.scale[0] / 8;
export const noiseSize = sc => 1 / sc;
// How often two repeating patterns (a and b metres) line up again: the first n·a that is (nearly) a multiple of b.
export function repeatTogether(a, b, max = 400) {
  for (let n = 1; n * a <= max; n++) { const k = Math.round(n * a / b); if (k > 0 && Math.abs(n * a - k * b) < 0.03) return n * a; }
  return Infinity;
}
// Share of the floor the moss mask covers for a Color Ramp position (the mask is a 4-octave noise, as in the shader).
let noiseSamples = null;
export function coverage(pos) {
  if (!noiseSamples) { noiseSamples = []; for (let y = 0; y < 90; y++) for (let x = 0; x < 90; x++) noiseSamples.push(fbm(x * 0.37 + 0.13, y * 0.41 + 0.29, 1, 4, 5)); noiseSamples.sort((a, b) => a - b); }
  let lo = 0, hi = noiseSamples.length; while (lo < hi) { const m = (lo + hi) >> 1; if (noiseSamples[m] < pos) lo = m + 1; else hi = m; }
  return 1 - lo / noiseSamples.length;
}
export const mossTile = st => 40 / st.moss.scale;
export const macroOk = st => !!st.macro && st.macro.fac >= 0.25 && st.macro.fac <= 0.8 && noiseSize(st.macro.scale) >= 6;
export const wallReports = st => WALLS.map(w => report(w.id, st.uv[w.id]));
export const wallsOk = st => wallReports(st).every(r => r.ok);
export const cornersOk = st => CORNERS.map(([a, b]) => ({ a, b, ok: joins(st.uv, a, b) }));
const mod = (a, n) => ((a % n) + n) % n;
export const mapsAligned = st => { const o = Object.values(st.maps).map(m => [mod(m.off[0], N), mod(m.off[1], N)]); return o.every(p => p[0] === o[0][0] && p[1] === o[0][1]); };

// ─── Stages ──────────────────────────────────────────────────────────────────
export const STAGES = [
  {
    id: 'use', name: 'Use it', sub: 'Seams · Repeat · Mapping', app: 'bl',
    steps: [
      {
        id: 'u1', title: 'Spot the seam',
        text: 'A tileable (or seamless) texture is an image whose right edge continues into its left edge, and whose top continues into its bottom. Copies laid side by side join without a line, so one small image can cover a big surface. This 8 × 8 m floor repeats a 2 m photo of gravel 4 × 4 times, but the photo is not tileable: every copy ends in a hard line, and the light of the photo turns the floor into a checkerboard. Click one of those lines on the floor, then swap the photo for the tileable version.',
        how: ['Orbit the <b>3D Viewport</b> with <b>MMB</b> and look for straight lines every 2 m.', 'Click a seam on the floor.', 'In the <b>Image Texture</b> node, change the image from <b>gravel_photo.jpg</b> to <b>gravel_tileable.png</b>.'],
        why: 'A seam repeats with the texture: one bad edge becomes a grid of lines across the whole floor.',
        start: () => blState({ img: 'photo' }),
        check: s => !!s.flags.seam && s.img === 'tile',
        solve: s => { s.flags.seam = true; s.img = 'tile'; },
      },
      {
        id: 'u2', title: 'Repeat it at real size',
        text: 'The tileable image shows 2 m of floor. The Mapping node multiplies the UVs: with Scale 1 the image is stretched once over the whole 8 m floor, so every pebble is four times too big next to the 1.8 m person. And with Extension set to Extend, the Image Texture node does not repeat the image at all: outside the first copy it smears the edge pixels. Make the image repeat, and scale it so one copy covers 2 m.',
        how: ['In the <b>Image Texture</b> node, set <b>Extension</b> to <b>Repeat</b>. Try <b>Mirror</b> and <b>Clip</b> too, to see what they do.', 'In the <b>Mapping</b> node, set <b>Scale</b> X and Y to floor size ÷ size of one copy = 8 ÷ 2.', 'The <b>Image Editor</b> shows the UVs of the floor over the repeated image.'],
        why: 'Tiling is a multiplication: UVs from 0 to 4 show the image four times. The scale sets the size of the pebbles, so it must come from the real size the photo shows.',
        start: () => blState({ ext: 'extend', scale: [1, 1] }),
        check: s => s.ext === 'repeat' && near(s.scale[0], 4, 0.05) && near(s.scale[1], 4, 0.05),
        solve: s => { s.ext = 'repeat'; s.scale = [4, 4]; },
      },
    ],
  },
  {
    id: 'uvs', name: 'UVs for tiling', sub: 'Real size · straight · round the corner', app: 'bl',
    steps: [
      {
        id: 'v1', title: 'Out of the square',
        text: 'For a unique texture the islands must fit inside the UV square without overlapping. For a tileable texture they do not: every square outside 0–1 shows the same image again, so islands can be as big as they need and can overlap. After Unwrap and Pack, these four walls fit inside the square, so one copy of the brick texture (2 m of wall) is stretched over 13 m. Scale the islands so one copy covers 2 m on every wall.',
        how: ['Press <b>A</b> over the <b>UV Editor</b> to select all the islands.', 'Press <b>S</b>, type the factor and press <b>Enter</b>. Now one tile covers 13 m and you want 2 m: 13 ÷ 2.', 'The <b>Island</b> panel shows how many metres one tile covers on each wall.'],
        why: 'With a tileable texture, the size of the islands sets the size of the bricks. Every wall must use the same metres per tile, or the bricks change size at the corners.',
        start: () => blState({ scene: 'building', img: 'bricks', scale: [1, 1], editor: 'uv', uv: packedUV() }),
        check: s => wallsOk(s),
        solve: s => { const b = bbox(Object.values(s.uv)); for (const k of Object.keys(s.uv)) s.uv[k] = scaleQ(s.uv[k], 6.5, 6.5, b.u0, b.v0); },
      },
      {
        id: 'v2', title: 'Straight, not stretched',
        text: 'Two islands are wrong. The right wall is turned 90°, so its bricks stand on end. The left wall was scaled only along U, so its bricks are longer than the others. Fix both. This texture has a direction: the rows of bricks must run along U, and one tile must cover 2 m both across and up.',
        how: ['Click the <b>Right wall</b> island, press <b>R</b>, type <b>-90</b> and press <b>Enter</b>.', 'Click the <b>Left wall</b> island, press <b>S</b> then <b>X</b> and type the factor that brings U back to 2 m per tile.', 'Watch <b>Up is up</b> and the metres per tile in U and V in the Island panel.'],
        why: 'A turned or stretched island still tiles, but the bricks look wrong. Keep the same scale in U and V, and line the islands up with the pattern.',
        start: () => { const uv = solvedUV(); const b = bbox([uv.right]); uv.right = rotate(uv.right, 90, b.cu, b.cv); const c = bbox([uv.left]); uv.left = scaleQ(uv.left, 1.5, 1, c.cu, c.cv); return blState({ scene: 'building', img: 'bricks', scale: [1, 1], editor: 'uv', uv }); },
        check: s => wallsOk(s),
        solve: s => { const b = bbox([s.uv.right]); s.uv.right = rotate(s.uv.right, -90, b.cu, b.cv); const c = bbox([s.uv.left]); s.uv.left = scaleQ(s.uv.left, 1 / 1.5, 1, c.cu, c.cv); },
      },
      {
        id: 'v3', title: 'Round the corner',
        text: 'Every wall has the right size now, but at the corners the rows of bricks jump up or down, because each island sits on a different part of the image. Place the islands so each wall continues where the one before it ends: the right edge of the front wall must land on the same point of the image as the left edge of the right wall. The simplest way: put them side by side in a row, touching.',
        how: ['Select an island and press <b>G</b>. Turn on <b>Snap</b> (the magnet) in the UV Editor header so its corners stick to the corners of the others.', 'Put <b>Front</b>, <b>Right</b>, <b>Back</b> and <b>Left</b> in a row, each touching the one before.', 'The building is 20 m round, 10 tiles, so the left wall also joins the front one.'],
        why: 'Tiling hides the edges of the image, not the edges of your islands. Across a UV seam the pattern only continues if both sides land on the same point of the texture. In Blender you can also unwrap the four walls as one strip with a single seam.',
        start: () => blState({ scene: 'building', img: 'bricks', scale: [1, 1], editor: 'uv', uv: scatteredUV() }),
        check: s => wallsOk(s) && cornersOk(s).every(c => c.ok),
        solve: s => { s.uv = solvedUV(); },
      },
    ],
  },
  {
    id: 'prepare', name: 'Prepare the photo', sub: 'Crop · size · even light', app: 'ps',
    steps: [
      {
        id: 'p1', title: 'Square, power of two',
        text: 'Now make a tileable texture yourself, from a photo, in Photoshop. This photo of a floor is 1400 × 1050 px and shows 2.7 m. Textures for 3D and games are square and power-of-two sized (512, 1024, 2048…): the GPU builds mipmaps from them, and they tile at the same scale in U and V. Crop a square and make it 1024 × 1024 px. Do not stretch the photo, and do not make it bigger than your crop: new pixels add no detail.',
        how: ['Choose the <b>Crop Tool</b> (<b>C</b>) and set <b>1:1 (Square)</b> in the options bar.', 'Drag a square as big as the photo allows and press <b>Enter</b>.', '<b>Image › Image Size…</b> (<b>Alt Ctrl I</b>): 1024 × 1024 px.'],
        why: 'A square, power-of-two image tiles the same in U and V and keeps clean mipmaps. The pixels per metre of the photo limit how sharp the texture can be.',
        start: () => psState(photo(), 'gravel_photo.jpg'),
        check: s => sizeReport(s).ok,
        solve: s => { const L = s.layers[0]; L.img = resize(crop(L.img, CROP.x, CROP.y, CROP.s, CROP.s), N, N); s.cropSide = CROP.s; },
      },
      {
        id: 'p2', title: 'Even out the light',
        text: 'The photo was shot with the sun on one side: the top left is bright, the bottom right is dark and a soft shadow crosses it. In one photo that looks natural; repeated, it becomes a checkerboard of bright and dark squares. Remove the big changes of light and keep the pebbles: blur a grey copy until only the light is left, invert it and blend it over the photo at 50 %.',
        how: ['<b>Layer › Duplicate Layer</b> (<b>Ctrl J</b>).', 'On the copy: <b>Image › Adjustments › Desaturate</b> (<b>Shift Ctrl U</b>), then <b>Filter › Blur › Gaussian Blur…</b> with a radius much bigger than a pebble (40–100 px).', '<b>Image › Adjustments › Invert</b> (<b>Ctrl I</b>). In the <b>Layers</b> panel set the blend mode to <b>Linear Light</b> and <b>Opacity</b> to 50 %.'],
        why: 'Light that changes across the photo repeats with every copy. A tileable texture needs the same light everywhere: the 3D scene adds its own light later.',
        start: () => psState(litSquare(), 'gravel_1024.psd', { cropSide: N }),
        check: s => lightReport(s).ok,
        solve: s => { s.layers = [s.layers[0], { name: 'Background copy', img: invert(gaussianBlur(desaturate(s.layers[0].img), 60)), blend: 'Linear Light', opacity: 0.5, visible: true }]; s.active = 1; },
      },
    ],
  },
  {
    id: 'seamless', name: 'Make it seamless', sub: 'Offset · clone · heal', app: 'ps',
    steps: [
      {
        id: 's1', title: 'Offset: edges to the middle',
        text: 'The edges of the photo do not match, but you cannot paint across the edge of an image. Filter › Other › Offset moves the image and wraps what leaves one side back in on the other side. With an offset of half the size, the four edges meet in a cross in the middle, where you can see them and paint over them.',
        how: ['<b>Filter › Other › Offset…</b>', '<b>Horizontal</b> +512 px and <b>Vertical</b> +512 px: half of 1024.', '<b>Undefined Areas</b>: <b>Wrap Around</b>. The other two options fill the gap instead of wrapping.'],
        why: 'Wrap Around keeps every pixel: what goes out on the right comes back in on the left. The edges of the image now continue into each other; only the cross in the middle is left to fix.',
        start: () => psState(flatSquare(), 'gravel_1024.psd', { cropSide: N, seam: { x: 0, y: 0 } }),
        check: s => !s.flags.smeared && seamIn(s.seam.x) && seamIn(s.seam.y),
        solve: s => { s.layers[0].img = offset(s.layers[0].img, N / 2, N / 2, 'wrap'); s.seam = { x: (s.seam.x + N / 2) % N, y: (s.seam.y + N / 2) % N }; },
      },
      {
        id: 's2', title: 'Clone and heal the cross',
        text: 'Paint over the cross with pixels from other parts of the photo. The Clone Stamp copies pixels exactly; the Healing Brush copies the texture and matches its colour to the place you paint. Alt-click a source away from the cross, then paint along the lines. Change the source often: the same source dragged along a line makes a new straight line. The Lab check panel turns every piece of the cross green when it no longer jumps.',
        how: ['Choose the <b>Clone Stamp Tool</b> (<b>S</b>) or the <b>Healing Brush Tool</b> (<b>J</b>).', '<b>Alt</b>-click a source, then drag over the seam. <b>[</b> and <b>]</b> change the size; a soft brush (low <b>Hardness</b>) hides its edge.', 'Cover the whole cross, edge to edge, in both directions.'],
        why: 'The cross is where the old edges meet. When it is gone, the image continues across every edge: it tiles.',
        start: () => psState(offsetSquare(), 'gravel_1024.psd', { cropSide: N, seam: { x: N / 2, y: N / 2 } }),
        check: s => !!seamOf(s)?.ok,
        solve: s => { healCross(s.layers[s.active].img, s.seam.x, s.seam.y); },
      },
      {
        id: 's3', title: 'Pattern Preview: the giveaway',
        text: 'Your texture tiles now. Turn on View › Pattern Preview and Photoshop shows it repeated. A texture can tile without a seam and still repeat badly: one feature that stands out — here a dark oil stain — comes back every 2 m and draws the grid. Heal it away.',
        how: ['<b>View › Pattern Preview</b>.', 'Choose the <b>Healing Brush Tool</b> (<b>J</b>), <b>Alt</b>-click clean gravel and paint over the stain.', 'Keep the cross clean: the seam check must stay green.'],
        why: 'The eye finds a repetition through the details that stand out. A good tileable texture is evenly busy: no stain, no leaf, no pebble much darker or brighter than the rest.',
        start: () => psState(healedSquare(), 'gravel_tileable.psd', { cropSide: N, seam: { x: N / 2, y: N / 2 }, stain: stainAt() }),
        check: s => !!s.flags.pattern && stainOf(s) >= 0.9 && !!seamOf(s)?.ok,
        solve: s => { s.flags.pattern = true; healBlot(s.layers[s.active].img, s.stain); },
      },
    ],
  },
  {
    id: 'pbr', name: 'PBR maps', sub: 'Every map tiles · aligned', app: 'bl',
    steps: [
      {
        id: 'm1', title: 'Every map must tile',
        text: 'A material uses several images — Base Color, Roughness, Normal — and all of them must tile, not only the colour. On this floor the colour is seamless, yet a grid shows in the reflections: the Roughness map was made from the original photo, with its edges and its light. Click each Image Texture node to see its image repeated, find the broken one and swap it for the version made from the tileable texture.',
        how: ['Click an <b>Image Texture</b> node: the <b>Image Editor</b> shows its image repeated.', 'Lower the <b>Sun</b> to a grazing light to see the reflections.', 'Set the Roughness image to <b>gravel_rough.png</b>.'],
        why: 'Every map is a separate image read with the same UVs. A seam in any of them shows: in the colour, in the shine or in the relief.',
        start: () => blState({ maps: { color: { img: 'tile', off: [0, 0] }, rough: { img: 'photo', off: [0, 0] }, normal: { img: 'tile', off: [0, 0] } }, sun: 30, show: 'rough' }),
        check: s => s.maps.rough.img === 'tile',
        solve: s => { s.maps.rough.img = 'tile'; },
      },
      {
        id: 'm2', title: 'Keep the maps aligned',
        text: 'To check the seams, the colour was offset by 512 × 512 px in Photoshop and saved like that, but the Roughness and Normal maps were not. The maps no longer match: the relief of the gaps falls on the middle of the pebbles. Give every map the same offset (or offset the colour back).',
        how: ['Each Image Texture node shows the <b>Offset</b> applied to its image in Photoshop (a lab field, not a Blender setting).', 'Give the three maps the same offset: 512 × 512 on all of them, or 0 × 0 on all of them.', 'Look at the floor with a low sun: the dark gaps between the pebbles must be the hollows.'],
        why: 'The maps of a material are layers of the same surface. Any edit that moves pixels — offset, clone, heal — must be made on all of them in the same way.',
        start: () => blState({ maps: { color: { img: 'tile', off: [512, 512] }, rough: { img: 'tile', off: [0, 0] }, normal: { img: 'tile', off: [0, 0] } }, sun: 20, show: 'normal' }),
        check: s => mapsAligned(s),
        solve: s => { s.maps.color.off = [0, 0]; },
      },
    ],
  },
  {
    id: 'scale', name: 'Scale & projection', sub: 'Texel density · Box projection', app: 'bl',
    steps: [
      {
        id: 'd1', title: 'Sharp enough',
        text: 'How sharp a tileable texture looks depends on its pixels and on the metres one copy covers: texel density = image size in px ÷ metres per copy. Here a 512 px image covers 2 m: 256 px/m, blurry next to the person. The project asks for 512 px/m. Reach it without changing the size of the pebbles.',
        how: ['Change the image size in the <b>Image Texture</b> node: 256, 512, 1024 or 2048 px.', 'Keep the Mapping <b>Scale</b> at 4, so one copy still covers 2 m and the pebbles keep their real size.', 'The panel shows the texel density and the memory the image takes.'],
        why: 'A bigger Mapping scale would also give more pixels per metre, but the pebbles would shrink. The real size of the pebbles is fixed, so the pixels must come from a bigger image. The Texel Density Lab goes further.',
        start: () => blState({ res: 512 }),
        check: s => density(s) === 512 && near(s.scale[0], 4, 0.05) && near(s.scale[1], 4, 0.05),
        solve: s => { s.res = 1024; s.scale = [4, 4]; },
      },
      {
        id: 'd2', title: 'No UVs? Box projection',
        text: 'A sculpted rock often has messy UVs: this automatic sphere unwrap squeezes the texture at the top and cuts it along a seam. A tileable texture can be projected instead: Box projection shows the image from the three axes of the object and blends them where they meet. Use Object coordinates, scale them so one copy covers 2 m, and blend the edges.',
        how: ['In <b>Texture Coordinate</b>, use <b>Object</b> instead of <b>UV</b>.', 'In the <b>Image Texture</b> node set <b>Projection</b> to <b>Box</b> and <b>Blend</b> to about 0.2.', 'In <b>Mapping</b>, <b>Scale</b> 0.5: Object coordinates are in metres and one copy covers 2 m.'],
        why: 'Box projection (triplanar mapping in game engines) needs no UVs and keeps one size everywhere. It only works with tileable textures, and it reads the texture three times.',
        start: () => blState({ scene: 'rock', img: 'rock', scale: [1, 1] }),
        check: s => s.coord === 'object' && s.proj === 'box' && s.blend >= 0.1 && s.blend <= 0.6 && near(s.scale[0], 0.5, 0.05) && near(s.scale[1], 0.5, 0.05),
        solve: s => { s.coord = 'object'; s.proj = 'box'; s.blend = 0.2; s.scale = [0.5, 0.5]; },
      },
    ],
  },
  {
    id: 'break', name: 'Break the repetition', sub: 'Big variation · second texture', app: 'bl',
    steps: [
      {
        id: 'b1', title: 'Big variation on top',
        text: 'This 40 m square repeats the 2 m texture 20 × 20 times. Even without seams or stains, from far away the eye finds the grid. Add variation much bigger than the tile: a Noise Texture multiplied over the colour darkens and lightens areas of several metres, so no two copies look the same.',
        how: ['In the <b>Mix</b> node (<b>Multiply</b>), raise <b>Factor</b> to 0.3–0.6.', 'Lower the <b>Scale</b> of the <b>Noise Texture</b> until its spots are at least 6 m (3 tiles).', 'Press <b>Home</b> over the 3D Viewport to look from far away.'],
        why: 'The repetition has the size of a tile. Variation at a much bigger size hides it, and it costs almost nothing: no extra image.',
        start: () => blState({ scene: 'plaza', scale: [20, 20], macro: { fac: 0, scale: 1.2 } }),
        check: s => macroOk(s),
        solve: s => { s.macro = { fac: 0.45, scale: 0.08 }; },
      },
      {
        id: 'b2', title: 'A second texture, another size',
        text: 'Mix a second tileable texture — moss and earth — into the gravel through a noise mask. Choose its size with care: if one copy covers 4 m, it lines up with the 2 m gravel every 4 m and the grid comes back. With a size that is not a multiple, such as 3.3 m, the two patterns only meet again after tens of metres.',
        how: ['Turn on the <b>Moss</b> texture and set its <b>Mapping</b> scale (40 m ÷ scale = metres per copy).', 'Move the <b>Color Ramp</b> of the mask: it decides how much moss there is (15–60 %).', 'The panel shows after how many metres the two patterns line up again: aim for 20 m or more.'],
        why: 'Two patterns that repeat every a and every b metres repeat together every least common multiple of a and b. Sizes that are not simple multiples of each other push it far away.',
        start: () => blState({ scene: 'plaza', scale: [20, 20], macro: { fac: 0.45, scale: 0.08 }, moss: { on: false, scale: 10, mask: 0.08, pos: 0.5 } }),
        check: s => macroOk(s) && s.moss.on && coverage(s.moss.pos) >= 0.15 && coverage(s.moss.pos) <= 0.6 && repeatTogether(TILE_M, mossTile(s)) >= 20,
        solve: s => { s.moss.on = true; s.moss.scale = 12.12; s.moss.pos = 0.55; },
      },
    ],
  },
];
STAGES.forEach(stg => stg.steps.forEach(st => { st.app = stg.app; }));
export const startState = step => step.start();
export { cloneUV };
