// Small, deterministic raster model shared by the workspace and its checks.
export const W = 640;
export const H = 400;
const size = W * H;
export const blank = () => new Uint8Array(size);
export const index = (x, y) => Math.floor(y) * W + Math.floor(x);
export const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

export function polygonHas(points, x, y) {
  let yes = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) yes = !yes;
  }
  return yes;
}

export const SHAPES = {
  card: (x, y) => x >= 62 && x <= 246 && y >= 65 && y <= 174,
  plate: (x, y) => ((x - 516) / 63) ** 2 + ((y - 142) / 63) ** 2 <= 1,
  pennant: (x, y) => polygonHas([{ x: 69, y: 252 }, { x: 218, y: 266 }, { x: 115, y: 340 }], x, y),
  mug: (x, y) => {
    const body = y >= 127 && y <= 314 && x >= 274 + Math.max(0, y - 278) * .22 && x <= 402 - Math.max(0, y - 278) * .22;
    const o = ((x - 401) / 55) ** 2 + ((y - 205) / 64) ** 2 <= 1;
    const hole = ((x - 401) / 33) ** 2 + ((y - 205) / 42) ** 2 < 1;
    return body || (o && !hole);
  },
};

export function shapeMask(name) {
  const out = blank(), test = SHAPES[name];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (test(x + .5, y + .5)) out[y * W + x] = 255;
  return out;
}

export function raster(test) {
  const out = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (test(x + .5, y + .5)) out[y * W + x] = 255;
  return out;
}

export function combine(base, added, mode = 'new') {
  const out = mode === 'new' ? blank() : base.slice();
  for (let i = 0; i < size; i++) {
    if (mode === 'subtract') { if (added[i]) out[i] = 0; }
    else if (mode === 'intersect') out[i] = base[i] && added[i] ? 255 : 0;
    else if (added[i]) out[i] = 255;
  }
  return out;
}

export function brush(mask, x, y, radius, value) {
  const out = mask.slice();
  const x0 = Math.max(0, Math.floor(x - radius)), x1 = Math.min(W - 1, Math.ceil(x + radius));
  const y0 = Math.max(0, Math.floor(y - radius)), y1 = Math.min(H - 1, Math.ceil(y + radius));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    if ((px - x) ** 2 + (py - y) ** 2 <= radius ** 2) out[py * W + px] = value;
  }
  return out;
}

export function score(actual, expected, stride = 3) {
  let hit = 0, union = 0;
  for (let y = 0; y < H; y += stride) for (let x = 0; x < W; x += stride) {
    const i = y * W + x, a = actual[i] > 127, b = expected[i] > 127;
    if (a && b) hit++;
    if (a || b) union++;
  }
  return union ? hit / union : 0;
}

export function covered(mask, x, y, radius = 9) {
  let sum = 0, count = 0;
  for (let py = Math.max(0, y - radius); py <= Math.min(H - 1, y + radius); py += 3) {
    for (let px = Math.max(0, x - radius); px <= Math.min(W - 1, x + radius); px += 3) {
      sum += mask[py * W + px] / 255; count++;
    }
  }
  return sum / count;
}

export function startingState(id) {
  const selection = blank();
  let mask = null;
  if (id === 's_quick') return { selection: combine(shapeMask('mug'), shapeMask('plate'), 'add'), mask, tool: 'quick', mode: 'subtract' };
  if (id === 'm_create') return { selection: shapeMask('mug'), mask, tool: 'object', mode: 'new' };
  if (id === 'm_hide') {
    mask = brush(shapeMask('mug'), 455, 104, 20, 255);
    return { selection, mask, tool: 'brush', mode: 'new' };
  }
  if (id === 'm_restore') {
    mask = brush(shapeMask('mug'), 334, 224, 27, 0);
    return { selection, mask, tool: 'brush', mode: 'new' };
  }
  if (id === 'm_inspect') return { selection, mask: shapeMask('mug'), tool: 'brush', mode: 'new' };
  return { selection, mask, tool: ({ s_rect: 'rect', s_ellipse: 'ellipse', s_lasso: 'lasso', s_object: 'object' })[id] || 'rect', mode: 'new' };
}

export function solved(id, state) {
  const { selection, mask } = state;
  switch (id) {
    case 's_rect': return state.tool === 'rect' && score(selection, shapeMask('card')) >= .68;
    case 's_ellipse': return state.tool === 'ellipse' && score(selection, shapeMask('plate')) >= .68;
    case 's_lasso': return state.tool === 'lasso' && score(selection, shapeMask('pennant')) >= .54;
    case 's_object': return state.tool === 'object' && score(selection, shapeMask('mug')) >= .9;
    case 's_quick': return state.tool === 'quick' && score(selection, shapeMask('mug')) >= .88;
    case 'm_create': return !!mask && score(mask, shapeMask('mug')) >= .88 && !!state.maskCreated;
    case 'm_hide': return !!mask && covered(mask, 455, 104) < .22 && covered(mask, 332, 211) > .8 && !!state.maskPainted;
    case 'm_restore': return !!mask && covered(mask, 334, 224) > .82 && !!state.maskPainted;
    case 'm_inspect': return !!mask && !!state.maskViewed && !state.viewMask;
    default: return false;
  }
}
