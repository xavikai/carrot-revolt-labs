// Trim Sheet Lab: the medieval props (wall, column, chest, beam) as quad meshes with UV islands. Pure JS.
import { UV_PER_M, DEFAULT_STRIPS, stripOf } from './sheet.js?v=1';
import { islandFaces, ideal, place, rotate, bbox, translate, scale as scaleUV } from './uv.js?v=2';

function newMesh() { return { pos: [], faces: [], islands: {}, extras: [], keys: new Map() }; }
// Vertices at the same place are merged, so neighbouring faces share them (needed for smooth normals).
function vid(m, p) {
  const k = p.map(x => Math.round(x * 1e5)).join(',');
  if (!m.keys.has(k)) { m.keys.set(k, m.pos.length); m.pos.push(p); }
  return m.keys.get(k);
}
function island(m, id, name, target, check = true) { m.islands[id] = { name, target, faces: [], check }; return m.islands[id]; }
// A strip of quads: P(s, t) gives the 3D point, s from 0 to S in n pieces, t from 0 to T.
function ruled(m, id, P, S, T, n, s0 = 0) {
  const isl = m.islands[id];
  for (let i = 0; i < n; i++) {
    const a = S * i / n, b = S * (i + 1) / n;
    const loc = [[a, 0], [b, 0], [b, T], [a, T]].map(([s, t]) => [s0 + s, t]);
    const v = [[a, 0], [b, 0], [b, T], [a, T]].map(([s, t]) => vid(m, P(s, t)));
    isl.faces.push(m.faces.length); m.faces.push({ v, loc, island: id });
  }
}
const at = (off, p) => [p[0] + off[0], p[1] + off[1], p[2] + off[2]];

// ─── Props ───────────────────────────────────────────────────────────────────
// A piece of wall: plinth, three stone courses and a wooden beam on top. Front faces only.
export function wall(m = newMesh(), off = [0, 0, 0], pre = '') {
  island(m, pre + 'plinth', 'Plinth', 'plinth');
  ruled(m, pre + 'plinth', (s, t) => at(off, [-1.5 + s, t, 0]), 3, 0.125, 6);
  for (let r = 0; r < 3; r++) {
    const id = pre + 'row' + (r + 1), y0 = 0.125 + 0.5 * r;
    island(m, id, `Stone row ${r + 1}`, 'stone');
    ruled(m, id, (s, t) => at(off, [-1.5 + s, y0 + t, 0]), 3, 0.5, 6);
  }
  island(m, pre + 'beamFront', 'Beam front', 'beam');
  ruled(m, pre + 'beamFront', (s, t) => at(off, [-1.6 + s, 1.625 + t, 0.2]), 3.2, 0.25, 8);
  island(m, pre + 'beamTop', 'Beam top', 'beam');
  ruled(m, pre + 'beamTop', (s, t) => at(off, [-1.6 + s, 1.875, 0.2 - t]), 3.2, 0.25, 8);
  island(m, pre + 'beamBottom', 'Beam bottom', 'beam');
  ruled(m, pre + 'beamBottom', (s, t) => at(off, [-1.6 + s, 1.625, -0.05 + t]), 3.2, 0.25, 8);
  return m;
}
// A round column: its circumference is 2 m, so one ring is exactly two tiles of the sheet (no seam).
export const COLUMN_R = 1 / Math.PI;
export function column(m = newMesh(), off = [0, 0, 0], pre = '') {
  const R = COLUMN_R, C = 2, n = 24;
  const ring = (id, name, target, y0, h) => {
    island(m, pre + id, name, target);
    ruled(m, pre + id, (s, t) => { const a = s / C * Math.PI * 2; return at(off, [R * Math.cos(a), y0 + t, -R * Math.sin(a)]); }, C, h, n);
  };
  ring('base', 'Column base', 'plinth', 0, 0.125);
  ring('drum1', 'Drum 1', 'stone', 0.125, 0.5);
  ring('drum2', 'Drum 2', 'stone', 0.625, 0.5);
  ring('capital', 'Capital', 'molding', 1.125, 0.25);
  m.extras.push({ kind: 'disk', center: at(off, [0, 1.375, 0]), r: R, color: 'stone' });
  return m;
}
// A chest of planks, optionally with two iron straps around it.
export function chest(m = newMesh(), off = [0, 0, 0], pre = '', straps = false) {
  const side = (id, name, P, S) => { island(m, pre + id, name, 'plank'); ruled(m, pre + id, P, S, 0.5, Math.round(S / 0.25)); };
  side('front', 'Front', (s, t) => at(off, [-0.5 + s, t, 0.25]), 1);
  side('back', 'Back', (s, t) => at(off, [0.5 - s, t, -0.25]), 1);
  side('right', 'Right side', (s, t) => at(off, [0.5, t, 0.25 - s]), 0.5);
  side('left', 'Left side', (s, t) => at(off, [-0.5, t, -0.25 + s]), 0.5);
  side('lid', 'Lid', (s, t) => at(off, [-0.5 + s, 0.5, 0.25 - t]), 1);
  if (straps) for (const [k, xc] of [[1, -0.3], [2, 0.3]]) {
    const id = pre + 'strap' + k, e = 0.012, h = 0.5 + 2 * e, w = 0.5 + 2 * e;
    island(m, id, `Iron strap ${k}`, 'iron');
    // Around the chest: front (up), lid (back), back (down), bottom (forward). t goes towards −x.
    const P = (s, t) => {
      const x = xc + 0.0625 - t;
      if (s <= h) return at(off, [x, -e + s, 0.25 + e]);
      if (s <= h + w) return at(off, [x, 0.5 + e, 0.25 + e - (s - h)]);
      if (s <= 2 * h + w) return at(off, [x, 0.5 + e - (s - h - w), -0.25 - e]);
      return at(off, [x, -e, -0.25 - e + (s - 2 * h - w)]);
    };
    const edges = [0, h, h + w, 2 * h + w, 2 * h + 2 * w];
    for (let i = 0; i < 4; i++) ruled(m, id, (s, t) => P(edges[i] + s, t), edges[i + 1] - edges[i], 0.125, 2, edges[i]);
  }
  return m;
}
// A wooden beam 2 m long with chamfered edges. `w` is the width of each chamfer face (Bevel › Width).
export const BEAM_SIDE = 0.338;
export function beam(m = newMesh(), off = [0, 0.6, 0], pre = '', w = 0.0625) {
  const h = BEAM_SIDE / 2, c = w / Math.SQRT2;
  // Octagon corners in (y, z), going round so that faces point outwards.
  const P = [[h, h - c], [h, -(h - c)], [h - c, -h], [-(h - c), -h], [-h, -(h - c)], [-h, h - c], [-(h - c), h], [h - c, h]];
  const names = [['top', 'Beam top', 'beam'], ['ch1', 'Chamfer 1', 'bevelWood'], ['back', 'Beam back', 'beam'], ['ch2', 'Chamfer 2', 'bevelWood'],
    ['bottom', 'Beam bottom', 'beam'], ['ch3', 'Chamfer 3', 'bevelWood'], ['front', 'Beam front', 'beam'], ['ch4', 'Chamfer 4', 'bevelWood']];
  names.forEach(([id, name, target], i) => {
    if (w <= 0 && target === 'bevelWood') return;
    const a = P[i], b = P[(i + 1) % 8], T = Math.hypot(b[0] - a[0], b[1] - a[1]);
    island(m, pre + id, name, target);
    ruled(m, pre + id, (s, t) => at(off, [-1 + s, a[0] + (b[0] - a[0]) * t / T, a[1] + (b[1] - a[1]) * t / T]), 2, T, 5);
  });
  for (const x of [-1, 1]) m.extras.push({ kind: 'poly', pts: P.map(([y, z]) => at(off, [x, y, z])), flip: x < 0, color: 'wood' });
  return m;
}
export function scene(name, opts = {}) {
  const m = newMesh();
  if (name === 'wall') wall(m);
  else if (name === 'column') column(m);
  else if (name === 'chest') chest(m, [0, 0, 0], '', !!opts.straps);
  else if (name === 'beam') beam(m, [0, 0.6, 0], '', opts.bevel ?? 0.0625);
  else if (name === 'all') {
    wall(m, [0, 0, -1.4], 'wall.');
    column(m, [-2.35, 0, 0.1], 'column.');
    chest(m, [1.9, 0, 0.3], 'chest.', true);
    beam(m, [0.1, BEAM_SIDE / 2, 1.1], 'beam.', 0.0625);
  }
  delete m.keys;
  return m;
}
export const PROPS_OF_ALL = ['wall', 'column', 'chest', 'beam'];
export const propOf = id => id.split('.')[0];

// ─── UV layouts ──────────────────────────────────────────────────────────────
export const emptyUV = m => m.faces.map(() => [[0, 0], [0, 0], [0, 0], [0, 0]]);
// U offsets of the solution: stone rows are staggered so the vertical joints do not line up.
const OFFSETS = { row1: 0, row2: 0.37, row3: 0.71, drum1: 0.15, drum2: 0.52, back: 0.2, right: 0.45, left: 0.7, lid: 0.3, strap2: 0.4, ch2: 0.25, ch3: 0.5, ch4: 0.75, bottom: 0.33, top: 0.6, beamTop: 0.4, beamBottom: 0.8 };
export function solvedUV(m, strips = DEFAULT_STRIPS) {
  const uv = emptyUV(m);
  for (const [id, isl] of Object.entries(m.islands)) place(m, uv, isl.faces, stripOf(isl.target, strips), OFFSETS[id.split('.').pop()] ?? 0);
  return uv;
}
// Like after a plain Unwrap: an island at `k` times the density, turned `rot` degrees, centred on (cu, cv).
export function scatter(m, uv, id, { cu, cv, rot = 0, k = 1, flip = false }) {
  const f = islandFaces(m, id);
  ideal(m, uv, f, UV_PER_M * k);
  if (flip) scaleUV(uv, f, 1, -1, 0, 0);
  let b = bbox(uv, f); rotate(uv, f, rot, b.cu, b.cv);
  b = bbox(uv, f); translate(uv, f, cu - b.cu, cv - b.cv);
  return uv;
}
// A ring unwrapped as a curved band (what a cylinder often gives), at `k` times the density.
export function arc(m, uv, id, { cu, cv, R, a0 = 20, k = 0.5 }) {
  const f = islandFaces(m, id), d = UV_PER_M * k;
  let s0 = Infinity, s1 = -Infinity; for (const i of f) for (const [s] of m.faces[i].loc) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
  let t0 = Infinity, t1 = -Infinity; for (const i of f) for (const [, t] of m.faces[i].loc) { t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  const sm = (s0 + s1) / 2, tm = (t0 + t1) / 2;
  for (const i of f) uv[i] = m.faces[i].loc.map(([s, t]) => {
    const a = (a0 + 90) * Math.PI / 180 - (s - sm) * d / R, r = R + (t - tm) * d;
    return [cu + r * Math.cos(a), cv - R + r * Math.sin(a)];
  });
  return uv;
}
