// Stage House Lab: the model of an opera house stage (simplified from the Teatro Real in Madrid) and
// the maths the lab needs: where every piece is, what each seat can see, what the machines can carry
// and what would collide. Pure module (no DOM), so it can be tested with node.
//
// Axes (metres): x across the stage (+x is stage left seen from the audience), y up (0 = stage floor),
// z towards the audience (0 = the proscenium line; the stage is at z < 0, the auditorium at z > 0).

export const BOCA = { half: 7, h: 11 };                         // the proscenium opening: 14 × 11 m
export const STAGE = { half: 11, depth: 21.5 };                 // main stage, inside the fly tower
export const WING = { from: 11, to: 25 };                       // the wings (hombros), both sides
export const REAR = { from: -21.5, to: -37 };                   // the rear stage (chácena)
export const TOWER = { half: 13, front: 0.4, back: -22.5, grid: 32, top: 35 }; // the fly tower and its grid
export const UNDER = -24;                                       // bottom of the understage (Teatro Real: 'cota -16', 24 m under the stage)
export const PIT = { front: 6.5, back: 1.5, half: 9, min: -3.2, max: 0 };
export const APRON = 1.5;                                       // forestage in front of the curtain line
export const PLATFORM = { count: 6, w: 18.2, d: 3.5, first: -0.5, min: -12, max: 3 };
export const GRAVITY = 9.81;
export const BAR_LIMIT = 750;     // kg per motorised bar (vara) at the Teatro Real
export const BRICK = 12.5;        // kg per counterweight brick
export const PIPE_KG = 55;        // weight of an empty bar (pipe and cables)

// Seats of the auditorium (eye positions).
export const SEATS = {
  front:   { name: 'Stalls, front row', p: [0, 0.1, 8.5] },
  left:    { name: 'Stalls, far left', p: [-9, 0.6, 12] },
  right:   { name: 'Stalls, far right', p: [9, 0.6, 12] },
  balcony: { name: 'Top balcony', p: [0, 17, 30] },
};
export const SEAT_IDS = Object.keys(SEATS);

// Platforms (plataformas): 6 strips across the stage, 18.2 × 3.5 m, from the curtain line upstage.
export const platformZ = i => [PLATFORM.first - PLATFORM.d * (i + 1), PLATFORM.first - PLATFORM.d * i]; // [back, front]

// ─── The pieces that move ────────────────────────────────────────────────────
// kind: drop (a cloth hanging from a bar), border (bambalina), electric (a bar of lights),
// leg (a pair of side curtains, patas), platform, pit, wagon (carro), truss.
// axis: what the piece moves along. For bars it is the height of the pipe.
const DROP = { w: 20, h: 12 };
export const PIECES = {
  forest:  { kind: 'drop', name: 'Forest backdrop', z: -19.2, w: DROP.w, h: DROP.h, kg: 180, color: 0x3f6b3a, axis: 'y' },
  palace:  { kind: 'drop', name: 'Palace backdrop', z: -19.6, w: DROP.w, h: DROP.h, kg: 180, color: 0x9b7a4c, axis: 'y' },
  hell:    { kind: 'drop', name: 'Hell backdrop', z: -20.0, w: DROP.w, h: DROP.h, kg: 180, color: 0x8a2a1c, axis: 'y' },
  cloth:   { kind: 'drop', name: 'Painted cloth', z: -11.6, w: 18, h: 10, kg: 140, color: 0x5e7fa8, axis: 'y', counterweight: true },
  truss:   { kind: 'truss', name: 'Lighting truss', z: -7.5, w: 16, h: 1, kg: 1100, color: 0x9a9da3, axis: 'y' },
  statue:  { kind: 'statue', name: 'Statue', platform: 1, x: 0, w: 1.4, d: 1.4, h: 3.6, color: 0xc9c3b6 },
  wForest: { kind: 'wagon', name: 'Forest wagon', axis: 'x', z: [-14, -8], w: 8, h: 5.5, color: 0x4f7d45, min: 0, max: 17 },
  wPalace: { kind: 'wagon', name: 'Palace wagon', axis: 'z', x: 0, w: 16, d: 7, h: 7, color: 0xb59663, min: -29, max: -11 },
  pit:     { kind: 'pit', name: 'Orchestra pit lift', axis: 'y', min: PIT.min, max: PIT.max },
};
// Borders and electrics come in pairs: an electric just upstage of each border.
export const BORDER_Z = [-1.2, -5.2, -9.2, -13.2, -17.2];
BORDER_Z.forEach((z, i) => { PIECES['border' + (i + 1)] = { kind: 'border', name: `Border ${i + 1}`, z, w: 22, h: 5, kg: 60, color: 0x1c1c1f, axis: 'y' }; });
[-1.9, -5.9, -9.9, -13.9].forEach((z, i) => { PIECES['elec' + (i + 1)] = { kind: 'electric', name: `Electric ${i + 1}`, z, w: 18, h: 0.7, kg: 420, color: 0x2b2b2e, axis: 'y', fixed: true }; });
// Legs: a pair per border line; the value is the distance of their inner edge from the centre line.
BORDER_Z.forEach((z, i) => { PIECES['leg' + (i + 1)] = { kind: 'leg', name: `Legs ${i + 1}`, z: z - 0.15, w: 5.5, h: 12, color: 0x1c1c1f, axis: 'x', min: 5, max: 11 }; });
for (let i = 0; i < PLATFORM.count; i++) PIECES['plat' + i] = { kind: 'platform', name: `Platform ${i + 1}`, i, axis: 'y', min: PLATFORM.min, max: PLATFORM.max };
// The four bars the truss can hang from, with what they already carry.
export const TRUSS_BARS = { A: { z: -7.0, kg: 200 }, B: { z: -7.3, kg: 500 }, C: { z: -7.7, kg: 0 }, D: { z: -8.0, kg: 300 } };

// Limits of each value.
export function range(id) {
  const p = PIECES[id];
  if (p.kind === 'drop' || p.kind === 'border' || p.kind === 'electric' || p.kind === 'truss') return [p.h, TOWER.grid - 0.8]; // the pipe: the piece may touch the floor, not go through it
  return [p.min, p.max];
}
export const clampValue = (id, v) => { const [a, b] = range(id); return Math.min(b, Math.max(a, v)); };

// ─── State ───────────────────────────────────────────────────────────────────
export function defaultState() {
  const v = { forest: 25, palace: 25, hell: 25, cloth: 12, truss: 14, wForest: 17, wPalace: -29, pit: 0 };
  BORDER_Z.forEach((_, i) => { v['border' + (i + 1)] = 11.8; v['leg' + (i + 1)] = 7.6; });
  [1, 2, 3, 4].forEach(i => { v['elec' + i] = 9.2; });
  for (let i = 0; i < PLATFORM.count; i++) v['plat' + i] = 0;
  return { v, cw: 0, truss: [] };
}
export const cloneState = s => JSON.parse(JSON.stringify(s));

// ─── Geometry of the pieces (boxes) ──────────────────────────────────────────
// Returns { x0, x1, y0, y1, z0, z1 } in metres, or a list of boxes for legs (one each side).
export function boxes(id, st) {
  const p = PIECES[id], v = st.v[id];
  switch (p.kind) {
    case 'drop': case 'border': return [{ x0: -p.w / 2, x1: p.w / 2, y0: v - p.h, y1: v, z0: p.z - 0.05, z1: p.z + 0.05 }];
    case 'electric': return [{ x0: -p.w / 2, x1: p.w / 2, y0: v - p.h, y1: v, z0: p.z - 0.25, z1: p.z + 0.25 }];
    case 'truss': return [{ x0: -p.w / 2, x1: p.w / 2, y0: v - p.h, y1: v, z0: p.z - 0.5, z1: p.z + 0.5 }];
    case 'leg': return [-1, 1].map(s => ({ x0: s < 0 ? -v - p.w : v, x1: s < 0 ? -v : v + p.w, y0: 0, y1: p.h, z0: p.z - 0.05, z1: p.z + 0.05 }));
    case 'platform': { const [zb, zf] = platformZ(p.i); return [{ x0: -PLATFORM.w / 2, x1: PLATFORM.w / 2, y0: v - 0.5, y1: v, z0: zb, z1: zf }]; }
    case 'pit': return [{ x0: -PIT.half, x1: PIT.half, y0: v - 0.5, y1: v, z0: PIT.back, z1: PIT.front }];
    case 'wagon': {
      if (p.axis === 'x') return [{ x0: v - p.w / 2, x1: v + p.w / 2, y0: 0, y1: p.h, z0: p.z[0], z1: p.z[1] }];
      return [{ x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: 0, y1: p.h, z0: v - p.d / 2, z1: v + p.d / 2 }];
    }
    case 'statue': { const base = st.v['plat' + p.platform], [zb, zf] = platformZ(p.platform), zc = (zb + zf) / 2; return [{ x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: base, y1: base + p.h, z0: zc - p.d / 2, z1: zc + p.d / 2 }]; }
  }
  return [];
}

// ─── Sightlines ──────────────────────────────────────────────────────────────
// Things that block the view: the proscenium wall (everything outside the opening), the stage floor
// (nothing below it is seen), and the flat pieces hanging on stage (drops, borders, legs).
function occluders(st, show, except) {
  const out = [];
  for (const id of show) {
    if (id === except) continue;
    const p = PIECES[id];
    if (p.kind === 'drop' || p.kind === 'border' || p.kind === 'leg') for (const b of boxes(id, st)) out.push({ z: p.z, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 });
  }
  return out;
}
// Can the eye at `seat` see the point `pt`? Both [x, y, z].
export function sees(seat, pt, occ) {
  const [sx, sy, sz] = seat, [px, py, pz] = pt;
  if (py < -0.01) return false;                            // under the stage floor
  if (pz < 0) {                                            // behind the proscenium: through the opening only
    const t = sz / (sz - pz), x = sx + (px - sx) * t, y = sy + (py - sy) * t;
    if (Math.abs(x) > BOCA.half || y < 0 || y > BOCA.h) return false;
  }
  for (const o of occ) {
    if (!(o.z < sz && o.z > pz + 0.02)) continue;          // only what stands between the eye and the point
    const t = (sz - o.z) / (sz - pz), x = sx + (px - sx) * t, y = sy + (py - sy) * t;
    if (x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1) return false;
  }
  return true;
}
// Sample points on the faces of a box that the audience could see.
function samples(b, n = 7) {
  const pts = [], L = (a, c, k) => a + (c - a) * k / (n - 1);
  const flat = b.z1 - b.z0 < 0.2;
  const zs = flat ? [b.z1] : [b.z1, (b.z0 + b.z1) / 2, b.z0];
  for (const z of zs) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pts.push([L(b.x0, b.x1, i), L(b.y0, b.y1, j), z]);
  if (!flat) for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) pts.push([L(b.x0, b.x1, i), b.y1, L(b.z0, b.z1, k)]); // the top
  return pts;
}
// Which seats see (a part of) the piece `id`? show: the ids of the pieces on stage in this step.
export function seenFrom(id, st, show, seats = SEAT_IDS) {
  const occ = occluders(st, show, id), bx = boxes(id, st), res = {};
  for (const s of seats) res[s] = bx.some(b => samples(b).some(pt => sees(SEATS[s].p, pt, occ)));
  return res;
}
export const hidden = (id, st, show) => Object.values(seenFrom(id, st, show)).every(v => !v);
// The wings: can a seat look past the side line of the stage into them?
export function wingPoints() {
  const pts = [];
  for (const s of [-1, 1]) for (let z = -1; z >= -20; z -= 1) for (const y of [0.3, 2, 4, 6]) pts.push([s * (STAGE.half + 0.3), y, z]);
  return pts;
}
export function wingsSeen(st, show) {
  const occ = occluders(st, show, null), res = {};
  for (const s of SEAT_IDS) res[s] = wingPoints().some(pt => sees(SEATS[s].p, pt, occ));
  return res;
}
// How much of the stage the audience keeps: the gap between the legs and under the borders.
export function openingWidth(st) { return 2 * Math.min(BOCA.half, ...BORDER_Z.map((_, i) => st.v['leg' + (i + 1)])); }
export const lowestBorder = st => Math.min(...BORDER_Z.map((_, i) => st.v['border' + (i + 1)] - PIECES['border' + (i + 1)].h));

// ─── Loads ───────────────────────────────────────────────────────────────────
// A counterweight set: the load (piece + pipe) against the bricks in the arbor.
export function counterweight(st) {
  const load = PIECES.cloth.kg + PIPE_KG, cw = st.cw * BRICK, diff = load - cw;
  return { load, cw, diff, force: Math.abs(diff) * GRAVITY, runaway: Math.abs(diff) > 60 };
}
// The truss hangs from the bars in st.truss, sharing its weight equally.
export function trussLoads(st) {
  const share = st.truss.length ? PIECES.truss.kg / st.truss.length : 0, out = {};
  for (const [k, b] of Object.entries(TRUSS_BARS)) out[k] = b.kg + (st.truss.includes(k) ? share : 0);
  return out;
}

// ─── Collisions and interlocks ───────────────────────────────────────────────
const overlap = (a, b, pad = 0) => a.x0 < b.x1 - pad && a.x1 > b.x0 + pad && a.y0 < b.y1 - pad && a.y1 > b.y0 + pad && a.z0 < b.z1 - pad && a.z1 > b.z0 + pad;
// Does the state have two pieces in the same place, or a wagon standing on a platform that is not at
// stage level? Returns a reason (English, for the status bar) or null.
export function conflict(st, show) {
  const on = id => show.includes(id);
  const wagons = ['wForest', 'wPalace'].filter(on);
  for (const w of wagons) {
    const wb = boxes(w, st)[0];
    for (let i = 0; i < PLATFORM.count; i++) {
      if (!on('plat' + i) || Math.abs(st.v['plat' + i]) < 0.01) continue;
      const [zb, zf] = platformZ(i);
      if (wb.x0 < PLATFORM.w / 2 && wb.x1 > -PLATFORM.w / 2 && wb.z0 < zf - 0.01 && wb.z1 > zb + 0.01) return 'A wagon can only run over platforms at stage level (0 m).';
    }
    for (const d of Object.keys(PIECES).filter(k => on(k) && ['drop', 'border', 'truss', 'electric'].includes(PIECES[k].kind))) {
      if (overlap(wb, boxes(d, st)[0], 0.001)) return d.startsWith('border') ? 'A border is in the way of the wagon.' : 'A backdrop is in the way: fly it out before the wagon passes.';
    }
  }
  if (wagons.length === 2 && overlap(boxes(wagons[0], st)[0], boxes(wagons[1], st)[0])) return 'The two wagons would crash into each other.';
  if (on('statue')) {
    const sb = boxes('statue', st)[0];
    for (const w of wagons) if (overlap(sb, boxes(w, st)[0])) return 'The wagon would crash into the statue.';
    for (const d of Object.keys(PIECES).filter(k => on(k) && PIECES[k].kind === 'drop')) if (overlap(sb, boxes(d, st)[0], 0.001)) return 'The statue would hit a backdrop.';
  }
  return null;
}
// Apply a new value, but stop at the last position without a conflict (like a real machine stopping at
// a safety interlock). Returns { value, blocked }.
export function moveTo(st, show, id, target) {
  target = clampValue(id, target);
  const from = st.v[id], test = v => { const s = { ...st, v: { ...st.v, [id]: v } }; return !conflict(s, show); };
  if (test(target)) return { value: target, blocked: null };
  let lo = from, hi = target;
  if (!test(from)) return { value: target, blocked: null }; // already in conflict: let the student get out of it
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (test(mid)) lo = mid; else hi = mid; }
  const s = { ...st, v: { ...st.v, [id]: hi } };
  return { value: Math.round(lo * 1000) / 1000, blocked: conflict(s, show) };
}
// The height of the fly tower compared with the proscenium opening: the classic rule of thumb is at least
// twice (a cloth as tall as the opening flies out completely), better two and a half times.
export const towerRatio = () => TOWER.grid / BOCA.h;

// The sample points of a piece (or of the wings) that a seat sees, to mark them in the seat view.
export function seenPoints(id, st, show, seat) {
  const occ = occluders(st, show, id), eye = SEATS[seat].p;
  return boxes(id, st).flatMap(b => samples(b)).filter(pt => sees(eye, pt, occ));
}
export function wingSeenPoints(st, show, seat) {
  const occ = occluders(st, show, null), eye = SEATS[seat].p;
  return wingPoints().filter(pt => sees(eye, pt, occ));
}
