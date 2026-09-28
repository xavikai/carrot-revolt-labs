// Texel Density Lab: props as quad meshes with UV islands, and the maths of texel density. Pure JS, no DOM.
// A mesh is { pos, faces: [{ v:[4 ids], loc:[[s,t]×4], island }], islands: { id: { name, obj, pat, faces } }, objects, extras }.
// `loc` is the flat layout of a face in metres. UVs are stored per face corner: uv[face] = [[u,v]×4].
// Texel density = texture size × √(UV area ÷ 3D area), in px per metre.
export const RES = [256, 512, 1024, 2048, 4096];
export const MARGIN = 0.01;          // Pack Islands margin, in UV units (about 10 px on a 1K texture)
export const CHECKER = 64;           // one checker square covers 64 × 64 texels
export const TOL = 0.1;              // ±10 % counts as "on target"

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
export const cloneUV = uv => uv.map(f => f.map(p => [p[0], p[1]]));

// ─── Props ───────────────────────────────────────────────────────────────────
export const OBJECTS = {
  crate:   { name: 'Crate', size: '0.5 × 0.5 × 0.5 m' },
  wall:    { name: 'Wall', size: '3 × 2 × 0.25 m' },
  barrel:  { name: 'Barrel', size: 'Ø 0.6 × 0.9 m' },
  cabinet: { name: 'Cabinet', size: '1.2 × 0.8 × 0.5 m' },
  vending: { name: 'Vending machine', size: '0.9 × 1.9 × 0.8 m' },
  cutwall: { name: 'Corridor wall', size: '3 × 2 m' },
};
// Pattern ids used by the texture shader (and by the pixel loupe).
export const PAT = { planks: 0, bricks: 1, staves: 2, cabinet: 3, vendFront: 4, vendSide: 5, trim: 6 };
// A trim sheet: one 2 × 2 m texture (1K = 512 px/m) with horizontal zones that repeat from left to right.
// v0 and h are metres on the sheet, from the bottom.
export const SHEET = { m: 2, zones: {
  baseboard: { name: 'Baseboard', v0: 0, h: 0.25 },
  cornice:   { name: 'Cornice', v0: 0.25, h: 0.25 },
  bricks:    { name: 'Bricks', v0: 0.5, h: 1.5 },
} };
export const CUTWALL = { w: 3, h: 2 };
// The horizontal strips between the loop cuts of the corridor wall: [[y0, y1], …] from the bottom.
export function stripsOf(cuts = []) {
  const ys = [0, ...[...cuts].filter(y => y > 0.02 && y < CUTWALL.h - 0.02).sort((a, b) => a - b), CUTWALL.h];
  const out = []; for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 1e-6) out.push([ys[i - 1], ys[i]]);
  return out;
}

function newMesh() { return { pos: [], faces: [], islands: {}, objects: {}, extras: [], keys: new Map() }; }
function vid(m, p) {
  const k = p.map(x => Math.round(x * 1e5)).join(',');
  if (!m.keys.has(k)) { m.keys.set(k, m.pos.length); m.pos.push(p); }
  return m.keys.get(k);
}
// A band of n quads: P(s, t) gives the 3D point, s from 0 to S, t from 0 to T (all in metres).
function band(m, obj, id, name, pat, P, S, T, n = 1) {
  const isl = m.islands[id] = { name, obj, pat, faces: [] };
  m.objects[obj].islands.push(id);
  for (let i = 0; i < n; i++) {
    const a = S * i / n, b = S * (i + 1) / n, c = [[a, 0], [b, 0], [b, T], [a, T]];
    isl.faces.push(m.faces.length);
    m.faces.push({ v: c.map(([s, t]) => vid(m, P(s, t))), loc: c.map(p => [p[0], p[1]]), island: id });
  }
}
// A box of w × h × d with its base centred on `o`, scaled by k. `faces` lists the sides that get UVs.
function box(m, obj, o, k, w, h, d, faces, pats = {}) {
  m.objects[obj] = { islands: [], origin: o };
  w *= k; h *= k; d *= k;
  const at = p => [o[0] + p[0], o[1] + p[1], o[2] + p[2]];
  const F = {
    front:  ['Front', (s, t) => at([-w / 2 + s, t, d / 2]), w, h],
    back:   ['Back', (s, t) => at([w / 2 - s, t, -d / 2]), w, h],
    right:  ['Right side', (s, t) => at([w / 2, t, d / 2 - s]), d, h],
    left:   ['Left side', (s, t) => at([-w / 2, t, -d / 2 + s]), d, h],
    top:    ['Top', (s, t) => at([-w / 2 + s, h, d / 2 - t]), w, d],
    bottom: ['Bottom', (s, t) => at([-w / 2 + s, 0, -d / 2 + t]), w, d],
  };
  for (const f of faces) { const [name, P, S, T] = F[f]; band(m, obj, `${obj}.${f}`, name, pats[f] ?? pats.all, P, S, T); }
}
export function crate(m, o = [0, 0, 0], k = 1) { box(m, 'crate', o, k, 0.5, 0.5, 0.5, ['front', 'back', 'right', 'left', 'top', 'bottom'], { all: PAT.planks }); }
// The back of the wall stands against another wall, so it has no UVs.
export function wall(m, o = [0, 0, 0], k = 1) {
  box(m, 'wall', o, k, 3, 2, 0.25, ['front', 'top', 'left', 'right'], { all: PAT.bricks });
  m.extras.push({ kind: 'quad', obj: 'wall', pts: [[1.5, 0, -0.125], [-1.5, 0, -0.125], [-1.5, 2, -0.125], [1.5, 2, -0.125]].map(p => [o[0] + p[0] * k, o[1] + p[1] * k, o[2] + p[2] * k]) });
}
export const BARREL = { r: 0.3, h: 0.9, n: 16 };
export function barrel(m, o = [0, 0, 0], k = 1) {
  m.objects.barrel = { islands: [], origin: o };
  const R = BARREL.r * k, H = BARREL.h * k, C = 2 * Math.PI * R;
  band(m, 'barrel', 'barrel.side', 'Side', PAT.staves, (s, t) => { const a = s / C * Math.PI * 2; return [o[0] + R * Math.cos(a), o[1] + t, o[2] - R * Math.sin(a)]; }, C, H, BARREL.n);
  m.extras.push({ kind: 'disk', obj: 'barrel', center: [o[0], o[1] + H, o[2]], r: R });
}
export function cabinet(m, o = [0, 0, 0], k = 1) { box(m, 'cabinet', o, k, 1.2, 0.8, 0.5, ['front', 'back', 'top', 'left', 'right'], { all: PAT.cabinet }); }
// A wall of 3 × 2 m made of horizontal strips (one quad each). Each strip is mapped to one zone of the trim sheet:
// across, 1 m of wall = 0.5 of the sheet (512 px/m on 1K); up, the whole strip fills the height of its zone.
export function cutwall(m, o = [0, 0, 0], k = 1, opts = {}) {
  m.objects.cutwall = { islands: [], origin: o };
  const zones = opts.zones || [];
  stripsOf(opts.cuts).forEach(([y0, y1], i) => {
    const zk = SHEET.zones[zones[i]] ? zones[i] : 'bricks', z = SHEET.zones[zk], h = y1 - y0, id = `cutwall.s${i}`;
    const isl = m.islands[id] = { name: `Strip ${i + 1}`, obj: 'cutwall', pat: PAT.trim, faces: [], zone: zk };
    m.objects.cutwall.islands.push(id);
    const c = [[0, 0], [CUTWALL.w, 0], [CUTWALL.w, h], [0, h]];
    isl.faces.push(m.faces.length);
    m.faces.push({ v: c.map(([s, t]) => vid(m, [o[0] - CUTWALL.w / 2 + s, o[1] + y0 + t, o[2]])), loc: c.map(([s, t]) => [s, z.v0 + t / h * z.h]), real: c, island: id });
  });
  m.extras.push({ kind: 'quad', obj: 'wall', pts: [[1.5, 0, -0.02], [-1.5, 0, -0.02], [-1.5, 2, -0.02], [1.5, 2, -0.02]].map(p => [o[0] + p[0], o[1] + p[1], o[2] + p[2]]) });
}
// UVs of the corridor wall: the sheet coordinates in metres ÷ 2 (u goes past 1: the strips repeat across).
export const cutUV = m => m.faces.map(f => f.loc.map(([s, t]) => [s / SHEET.m, t / SHEET.m]));
// Density of each strip across (u) and up (v), in px/m.
export function stripReport(m, res) {
  return m.objects.cutwall.islands.map(id => {
    const isl = m.islands[id], f = m.faces[isl.faces[0]], z = SHEET.zones[isl.zone], h = f.real[2][1];
    return { id, zone: isl.zone, h, du: res / SHEET.m, dv: res * (z.h / SHEET.m) / h };
  });
}
export function vending(m, o = [0, 0, 0], k = 1) { box(m, 'vending', o, k, 0.9, 1.9, 0.8, ['front', 'left', 'right', 'top', 'back'], { all: PAT.vendSide, front: PAT.vendFront }); }

const BUILD = { crate, wall, barrel, cabinet, vending, cutwall };
export const SCENES = {
  crate:   [['crate', [0, 0, 0]]],
  wall:    [['wall', [0, 0, 0]]],
  cabinet: [['cabinet', [0, 0, 0]]],
  vending: [['vending', [0, 0, 0]]],
  cutwall: [['cutwall', [0, 0, 0]]],
  trio:    [['crate', [-2.1, 0, 0.7]], ['wall', [0, 0, -0.7]], ['barrel', [2.0, 0, 0.5]]],
  shop:    [['crate', [-2.3, 0, 0.8]], ['wall', [-0.6, 0, -0.8]], ['barrel', [0.95, 0, 0.6]], ['vending', [2.35, 0, -0.35]]],
};
export function buildScene(name, scale = {}, opts = {}) {
  const m = newMesh();
  for (const [obj, o] of SCENES[name]) BUILD[obj](m, o, scale[obj] ?? 1, opts);
  delete m.keys;
  return m;
}
export const objectsOf = name => SCENES[name].map(([o]) => o);

// ─── Measuring ───────────────────────────────────────────────────────────────
export function faceArea(m, f) {
  const [a, b, c, d] = m.faces[f].v.map(i => m.pos[i]);
  return len(cross(sub(c, a), sub(d, b))) / 2;
}
export function area2(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function bbox(uv, faces) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const f of faces) for (const [u, v] of uv[f]) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { u0, u1, v0, v1, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2, w: u1 - u0, h: v1 - v0 };
}
export const islandFaces = (m, id) => m.islands[id].faces;
export const objectFaces = (m, obj) => m.objects[obj].islands.flatMap(id => m.islands[id].faces);
export function areas(m, uv, faces) {
  let a3 = 0, a2 = 0;
  for (const f of faces) { a3 += faceArea(m, f); a2 += Math.abs(area2(uv[f])); }
  return { a3, a2 };
}
// px per metre of a group of faces on a texture of `res` pixels.
export function density(m, uv, faces, res) {
  const { a3, a2 } = areas(m, uv, faces);
  return a3 > 0 ? Math.sqrt(a2 / a3) * res : 0;
}
export const islandDensity = (m, uv, id, res) => density(m, uv, islandFaces(m, id), res);
export const objectDensity = (m, uv, obj, res) => density(m, uv, objectFaces(m, obj), res);
// Size of a face (or island) in metres: the extent of its flat layout.
export function realSize(m, faces) {
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const f of faces) for (const [s, t] of (m.faces[f].real || m.faces[f].loc)) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  return { w: s1 - s0, h: t1 - t0 };
}
export const onTarget = (d, target, tol = TOL) => Math.abs(d / target - 1) <= tol;

// ─── UV transforms ───────────────────────────────────────────────────────────
export function mapUV(uv, faces, fn) { for (const f of faces) uv[f] = uv[f].map(p => fn(p[0], p[1])); return uv; }
export const translate = (uv, faces, du, dv) => mapUV(uv, faces, (u, v) => [u + du, v + dv]);
export const scale = (uv, faces, ku, kv, pu, pv) => mapUV(uv, faces, (u, v) => [pu + (u - pu) * ku, pv + (v - pv) * kv]);
export function rotate(uv, faces, deg, pu, pv) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return mapUV(uv, faces, (u, v) => [pu + (u - pu) * c - (v - pv) * s, pv + (u - pu) * s + (v - pv) * c]);
}
// The flat layout of a group of faces, with `d` UV units per metre.
export function ideal(m, uv, faces, d) { for (const f of faces) uv[f] = m.faces[f].loc.map(([s, t]) => [s * d, t * d]); return uv; }
// Put one island at `k` × the density `d`, centred on (cu, cv), turned `rot` degrees (for the start of a step).
export function placeIsland(m, uv, id, { d, cu, cv, k = 1, rot = 0 }) {
  const f = islandFaces(m, id);
  ideal(m, uv, f, d * k);
  let b = bbox(uv, f);
  if (rot) { rotate(uv, f, rot, b.cu, b.cv); b = bbox(uv, f); }
  return translate(uv, f, cu - b.cu, cv - b.cv);
}
// Average Islands Scale: every island gets the same density as the others, the total UV area stays the same.
export function averageIslandsScale(m, uv, ids) {
  const per = ids.map(id => ({ f: islandFaces(m, id), ...areas(m, uv, islandFaces(m, id)) }));
  const A2 = per.reduce((s, p) => s + p.a2, 0), A3 = per.reduce((s, p) => s + p.a3, 0);
  if (!A2 || !A3) return uv;
  const d = Math.sqrt(A2 / A3);
  for (const p of per) { const k = d / Math.sqrt(p.a2 / p.a3), b = bbox(uv, p.f); scale(uv, p.f, k, k, b.cu, b.cv); }
  return uv;
}
// Pack Islands: keep the sizes of the islands relative to each other, turn tall ones on their side,
// and make them as big as possible inside 0–1 with a margin (shelf packing).
export function pack(m, uv, ids, margin = MARGIN) {
  const items = ids.map(id => {
    const f = islandFaces(m, id); let b = bbox(uv, f);
    if (b.h > b.w + 1e-9) { rotate(uv, f, 90, b.cu, b.cv); b = bbox(uv, f); }
    translate(uv, f, -b.u0, -b.v0);
    return { id, f, w: b.w, h: b.h };
  });
  items.sort((a, b) => b.h - a.h || b.w - a.w || (a.id < b.id ? -1 : 1));
  const layout = s => {
    let x = margin, y = margin, row = 0; const pos = [];
    for (const it of items) {
      const w = it.w * s, h = it.h * s;
      if (x + w > 1 - margin + 1e-12 && x > margin) { y += row + margin; x = margin; row = 0; }
      if (x + w > 1 - margin + 1e-12) return null;
      pos.push([x, y]); x += w + margin; row = Math.max(row, h);
    }
    return y + row <= 1 - margin + 1e-12 ? pos : null;
  };
  let lo = 0, hi = (1 - 2 * margin) / Math.max(...items.map(i => Math.max(i.w, i.h)), 1e-9);
  if (layout(hi)) lo = hi; else for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (layout(mid)) lo = mid; else hi = mid; }
  const pos = layout(lo);
  items.forEach((it, i) => { scale(uv, it.f, lo, lo, 0, 0); translate(uv, it.f, pos[i][0], 1 - pos[i][1] - it.h * lo); });
  return uv;
}
// Texel Density Checker's "Set TD": scale all the islands of an object so it reaches `target` px/m.
// It keeps the layout together and moves it back inside 0–1 when it can. Returns false if it no longer fits.
export function setTD(m, uv, obj, res, target) {
  const f = objectFaces(m, obj), d = density(m, uv, f, res);
  if (!d) return false;
  const k = target / d; let b = bbox(uv, f);
  scale(uv, f, k, k, b.cu, b.cv); b = bbox(uv, f);
  const du = b.w <= 1 ? Math.min(Math.max(0, -b.u0), 1 - b.u1) || (b.u0 < 0 ? -b.u0 : b.u1 > 1 ? 1 - b.u1 : 0) : 0.5 - b.cu;
  const dv = b.h <= 1 ? (b.v0 < 0 ? -b.v0 : b.v1 > 1 ? 1 - b.v1 : 0) : 0.5 - b.cv;
  translate(uv, f, du, dv);
  return b.w <= 1 + 1e-9 && b.h <= 1 + 1e-9;
}
// A fresh, packed UV layout for every object of a mesh (what Smart UV Project + Pack would give).
export function packedUV(m) {
  const uv = m.faces.map(() => [[0, 0], [0, 0], [0, 0], [0, 0]]);
  for (const obj of Object.keys(m.objects)) { const ids = m.objects[obj].islands; for (const id of ids) ideal(m, uv, islandFaces(m, id), 1); pack(m, uv, ids); }
  return uv;
}
// Density of a packed layout on a 1 px texture: multiply by the texture size to get px/m.
const d1Cache = new Map();
export function packedDensity1(obj) {
  if (!d1Cache.has(obj)) { const m = newMesh(); BUILD[obj](m); delete m.keys; d1Cache.set(obj, objectDensity(m, packedUV(m), obj, 1)); }
  return d1Cache.get(obj);
}
// Smallest texture that reaches `target` px/m with a packed layout.
export function minRes(obj, target, tol = 0.05) { return RES.find(r => packedDensity1(obj) * r >= target * (1 - tol)) ?? null; }

// ─── Checks ──────────────────────────────────────────────────────────────────
export function inside(uv, faces, eps = 1e-3) { const b = bbox(uv, faces); return b.u0 >= -eps && b.v0 >= -eps && b.u1 <= 1 + eps && b.v1 <= 1 + eps; }
// Two convex polygons overlap (separating axis test); touching edges do not count.
function polysOverlap(A, B, eps = 2e-4) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = a[1] - b[1], ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A) { const d = (p[0] * nx + p[1] * ny) / l; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const p of B) { const d = (p[0] * nx + p[1] * ny) / l; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
  }
  return true;
}
// Pairs of islands that overlap in UV space.
export function overlaps(m, uv, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = islandFaces(m, ids[i]), B = islandFaces(m, ids[j]);
    const ba = bbox(uv, A), bb = bbox(uv, B);
    if (ba.u1 <= bb.u0 || bb.u1 <= ba.u0 || ba.v1 <= bb.v0 || bb.v1 <= ba.v0) continue;
    if (A.some(fa => B.some(fb => polysOverlap(uv[fa], uv[fb])))) out.push([ids[i], ids[j]]);
  }
  return out;
}
// Fraction of the 0–1 square covered by the islands of an object.
export function coverage(m, uv, obj) { return areas(m, uv, objectFaces(m, obj)).a2; }

// ─── Camera, screen and memory ───────────────────────────────────────────────
export const SCREEN = { w: 2560, h: 1440, fov: 60 };
// Pixels that one metre covers on screen, at distance d (metres), for the vertical FOV of the screen.
export const screenDensity = (d, s = SCREEN) => s.h / (2 * d * Math.tan(s.fov * Math.PI / 360));
export const CAMERAS = {
  strategy: { name: 'Strategy (top-down)', d: 10 },
  third:    { name: 'Third person', d: 2.5 },
  first:    { name: 'First person', d: 1.25 },
};
// Other game types: each one brings its own screen height, vertical FOV and closest usual distance (example numbers).
export const GAMES = {
  mobile:  { name: 'Mobile, top-down camera', h: 1080, fov: 60, d: 4 },
  first4k: { name: 'First person on a 4K screen', h: 2160, fov: 60, d: 1.25 },
  vr:      { name: 'VR headset (per eye)', h: 2200, fov: 96, d: 1 },
  weapon:  { name: 'First-person weapon', h: 1440, fov: 60, d: 0.5 },
};
export const camOf = k => CAMERAS[k] || GAMES[k];
export const screenOf = c => ({ w: SCREEN.w, h: c.h ?? SCREEN.h, fov: c.fov ?? SCREEN.fov });
// Screen pixels covered by one metre of surface for a camera { d, h?, fov? }.
export const camDensity = c => screenDensity(c.d, screenOf(c));
export const TARGETS = [64, 128, 256, 512, 1024, 2048, 4096];
// The right target for a camera: the smallest power of two that gives at least one texel per screen pixel.
export const rightTarget = (d, s = SCREEN) => TARGETS.find(t => t >= screenDensity(d, s) * 0.97) ?? TARGETS[TARGETS.length - 1];
export const targetFor = c => rightTarget(c.d, screenOf(c));
// Texture set in memory: colour, normal and roughness, block-compressed at 1 byte per pixel, with mipmaps (+⅓).
export const setMB = res => 3 * res * res * (4 / 3) / (1024 * 1024);

// ─── Patterns (the same ones the shader paints) ──────────────────────────────
const fract = x => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const mix = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
const line = (x, w) => { const d = Math.abs(fract(x + 0.5) - 0.5); return d < w ? 1 : 0; };
const inBox = (s, t, a0, b0, a1, b1) => s >= a0 && s <= a1 && t >= b0 && t <= b1;
// Tiny text: glyphs of 5 × 7 dots, on or off at random. (o0, o1) = bottom left, cw = glyph width, n = glyph count.
function text(s, t, o0, o1, cw, n) {
  const qx = (s - o0) / cw, qy = (t - o1) / cw;
  if (qx < 0 || qy < 0 || qx >= n || qy >= 1.4) return 0;
  const g = Math.floor(qx), dx = Math.floor(fract(qx) * 6), dy = Math.floor(qy / 1.4 * 8);
  if (dx > 4 || dy > 6) return 0;
  return hash(g * 5.3 + dx + o0 * 91, dy + o1 * 57) >= 0.52 ? 1 : 0;
}
const mixc = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
const mul = (c, k) => c.map(x => x * k);
function patPlanks(s, t) {
  const r = Math.floor(t / 0.125), fy = fract(t / 0.125), h = hash(r, 7);
  let c = mixc([0.66, 0.47, 0.27], [0.53, 0.36, 0.2], h);
  const g = fract(t * 55 + 0.25 * Math.sin(s * 8 + r * 4) + h * 3);
  if (g <= 0.22) c = mul(c, 0.8);
  const nx = (((s + h * 0.1) % 0.25) + 0.25) % 0.25 - 0.03, ny = (fy - 0.5) * 0.125;
  if (Math.hypot(nx, ny) <= 0.007) c = mul(c, 0.35);
  return fy < 0.05 ? mul(c, 0.3) : c;
}
// Bricks: 21.5 × 6.5 cm with 1 cm of mortar, half-brick bond. s, t in metres. Returns sRGB 0–1.
export function brickColor(s, t) {
  const row = Math.floor(t / 0.075), x = s / 0.225 + (((row % 2) + 2) % 2) * 0.5, col = Math.floor(x);
  if (fract(t / 0.075) > 0.8667 || fract(x) > 0.9556) return [0.72, 0.70, 0.66];
  const c = mixc([0.62, 0.25, 0.17], [0.48, 0.18, 0.13], hash(col, row));
  return hash(Math.floor(s / 0.012), Math.floor(t / 0.012)) > 0.86 ? mul(c, 0.75) : c;
}
function patStaves(s, t) {
  const w = 0.11781, i = Math.floor(s / w), fx = fract(s / w), h = hash(i, 3);
  let c = mixc([0.62, 0.42, 0.23], [0.47, 0.3, 0.16], h);
  if (fract(s * 70 + 0.3 * Math.sin(t * 5 + i * 2) + h * 5) <= 0.25) c = mul(c, 0.82);
  if (fx < 0.05) c = mul(c, 0.35);
  if ((t >= 0.10 && t <= 0.16) || (t >= 0.74 && t <= 0.80)) return mul([0.26, 0.26, 0.27], Math.hypot(fx - 0.5, fract(t / 0.06) - 0.5) <= 0.12 ? 1.5 : 1);
  return c;
}
function patCabinet(s, t) {
  let c = mul([0.36, 0.5, 0.47], 0.95 + 0.08 * hash(Math.floor(s / 0.01), Math.floor(t / 0.01)));
  const seam = Math.abs(fract(s / 0.4 + 0.5) - 0.5) * 0.4;
  if (seam <= 0.003) c = mul(c, 0.4);
  if (Math.abs(seam - 0.035) <= 0.003) c = mul(c, 1.25);
  if (Math.hypot(((s % 0.4) + 0.4) % 0.4 - 0.2, t - 0.62) <= 0.013) c = [0.8, 0.72, 0.45];
  return c;
}
function patVendFront(s, t) {
  let c = [0.75, 0.12, 0.12];
  if (inBox(s, t, 0.05, 0.55, 0.62, 1.78)) {
    let g = [0.10, 0.13, 0.17];
    const qx = s - 0.05, qy = t - 0.55, shelf = Math.floor(qy / 0.245), sy = fract(qy / 0.245) * 0.245, col = Math.floor(qx / 0.08), sx = fract(qx / 0.08) * 0.08;
    const hc = hash(col, shelf), can = hc < 0.25 ? [0.85, 0.1, 0.1] : hc < 0.5 ? [0.1, 0.45, 0.85] : hc < 0.75 ? [0.95, 0.75, 0.1] : [0.2, 0.7, 0.3];
    if (sx > 0.008 && sx < 0.072 && sy > 0.045 && sy < 0.165) { g = can; if (sy > 0.085 && sy < 0.12) g = mul([0.95, 0.95, 0.95], 1 - 0.85 * text(sx, sy, 0.012, 0.093, 0.008, 6)); }
    if (sy > 0.012 && sy < 0.034) g = mul([0.92, 0.92, 0.92], 1 - 0.85 * text(sx, sy, 0.014, 0.016, 0.0075, 5));
    c = g;
  }
  if (inBox(s, t, 0.66, 0.85, 0.86, 1.75)) {
    c = [0.16, 0.16, 0.16];
    if (inBox(s, t, 0.68, 1.55, 0.84, 1.70)) c = mixc([0.05, 0.18, 0.08], [0.4, 1, 0.5], text(s, t, 0.69, 1.59, 0.022, 6));
    c = mixc(c, [0.85, 0.85, 0.85], text(s, t, 0.68, 1.49, 0.0085, 18));
    c = mixc(c, [0.85, 0.85, 0.85], text(s, t, 0.68, 1.46, 0.0085, 12));
    if (inBox(s, t, 0.80, 1.30, 0.812, 1.42)) c = [0.02, 0.02, 0.02];
    const kx = (s - 0.685) / 0.05, ky = (t - 0.95) / 0.05, ix = Math.floor(kx), iy = Math.floor(ky), fx = fract(kx), fy = fract(ky);
    if (ix >= 0 && ix < 3 && iy >= 0 && iy < 5 && fx < 0.8 && fy < 0.8) c = mul([0.72, 0.72, 0.72], 1 - 0.9 * text(fx * 0.05, fy * 0.05, 0.012, 0.01, 0.016, 1));
  }
  if (inBox(s, t, 0.1, 0.15, 0.6, 0.42)) c = inBox(s, t, 0.12, 0.17, 0.58, 0.40) ? [0.06, 0.06, 0.06] : [0.3, 0.3, 0.3];
  if (t > 1.8) c = mixc([0.95, 0.95, 0.95], [0.75, 0.12, 0.12], text(s, t, 0.12, 1.815, 0.05, 13));
  return c;
}
function patVendSide(s, t) {
  let c = mul([0.72, 0.11, 0.11], 0.96 + 0.06 * hash(Math.floor(s / 0.02), Math.floor(t / 0.02)));
  if (t > 1.1 && t < 1.45) c = mixc([0.95, 0.95, 0.95], [0.72, 0.11, 0.11], text(s, t, 0.08, 1.16, 0.1, 6));
  if (inBox(s, t, 0.3, 0.3, 0.52, 0.44)) { c = [0.98, 0.86, 0.2]; for (let i = 0; i < 6; i++) c = mixc(c, [0.05, 0.05, 0.05], text(s, t, 0.31, 0.415 - i * 0.018, 0.0065, 30)); }
  return c;
}
// The trim sheet (s, t in metres on the sheet, 2 × 2 m): baseboard, cornice and a band of bricks, all repeating every 2 m across.
function patTrim(s, t) {
  s = ((s % 2) + 2) % 2;
  if (t < 0.25) {
    let c = mul([0.36, 0.22, 0.12], 0.9 + 0.15 * hash(Math.floor(s / 0.5), 1));
    if (fract(s * 23 + 0.3 * Math.sin(t * 40)) <= 0.3) c = mul(c, 0.88);
    if (t > 0.19) c = mul([0.48, 0.31, 0.17], t > 0.225 ? 1.15 : 0.85);
    return t < 0.015 ? mul(c, 0.55) : c;
  }
  if (t < 0.5) {
    const y = t - 0.25;
    let c = mul([0.87, 0.84, 0.77], y < 0.03 ? 0.7 : y < 0.07 ? 1.05 : y < 0.1 ? 0.82 : y < 0.16 ? 1 : y < 0.19 ? 0.78 : y < 0.22 ? 1.08 : 0.92);
    if (fract(s / 0.1) < 0.5 && y >= 0.1 && y <= 0.16) c = mul(c, 0.82);
    return c.map(x => Math.min(1, x));
  }
  const q = t - 0.5, row = Math.floor(q / 0.075), x = s / 0.25 + (((row % 2) + 2) % 2) * 0.5, col = Math.floor(x);
  if (fract(q / 0.075) > 0.8667 || fract(x) > 0.96) return [0.72, 0.70, 0.66];
  const c = mixc([0.62, 0.25, 0.17], [0.48, 0.18, 0.13], hash(((col % 8) + 8) % 8, row));
  return hash(Math.floor(s / 0.012), Math.floor(q / 0.012)) > 0.86 ? mul(c, 0.75) : c;
}
const PATTERNS = [patPlanks, brickColor, patStaves, patCabinet, patVendFront, patVendSide, patTrim];
// The whole trim sheet as an image of size × size pixels.
export function paintSheet(size) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = patTrim((x + 0.5) / size * SHEET.m, (1 - (y + 0.5) / size) * SHEET.m), k = (y * size + x) * 4;
    data[k] = c[0] * 255; data[k + 1] = c[1] * 255; data[k + 2] = c[2] * 255; data[k + 3] = 255;
  }
  return data;
}
// The colour (sRGB 0–1) of pattern `k` at (s, t) metres: the same pictures the 3D view paints.
export const patternColor = (k, s, t) => PATTERNS[k](s, t);
// Paint the texture image of an object from its UVs: every pixel inside an island gets the colour of the
// point of the face it lands on. Pixels outside the islands stay grey (they are wasted). size ≤ res.
export function paintTexture(m, uv, obj, size) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) { data[i * 4] = 46; data[i * 4 + 1] = 46; data[i * 4 + 2] = 48; data[i * 4 + 3] = 255; }
  for (const f of objectFaces(m, obj)) {
    const P = uv[f], L = m.faces[f].loc, pat = m.islands[m.faces[f].island].pat;
    // Affine map uv → loc from three corners (the faces are parallelograms in UV).
    const a = [P[1][0] - P[0][0], P[1][1] - P[0][1]], b = [P[3][0] - P[0][0], P[3][1] - P[0][1]];
    const la = [L[1][0] - L[0][0], L[1][1] - L[0][1]], lb = [L[3][0] - L[0][0], L[3][1] - L[0][1]];
    const det = a[0] * b[1] - a[1] * b[0]; if (Math.abs(det) < 1e-12) continue;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [u, v] of P) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const x0 = Math.max(0, Math.floor(u0 * size)), x1 = Math.min(size - 1, Math.ceil(u1 * size)), y0 = Math.max(0, Math.floor((1 - v1) * size)), y1 = Math.min(size - 1, Math.ceil((1 - v0) * size));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const du = (x + 0.5) / size - P[0][0], dv = 1 - (y + 0.5) / size - P[0][1];
      const p = (du * b[1] - dv * b[0]) / det, q = (a[0] * dv - a[1] * du) / det;   // du,dv = p·a + q·b
      if (p < -1e-6 || q < -1e-6 || p > 1 + 1e-6 || q > 1 + 1e-6) continue;
      const c = PATTERNS[pat](L[0][0] + p * la[0] + q * lb[0], L[0][1] + p * la[1] + q * lb[1]), k = (y * size + x) * 4;
      data[k] = c[0] * 255; data[k + 1] = c[1] * 255; data[k + 2] = c[2] * 255;
    }
  }
  return data;
}

// ─── The 1 m ruler ───────────────────────────────────────────────────────────
// A straight ruler laid on an island, along its width (s), through its middle: up to 1 m long.
// Returns its length in metres, points on the surface (3D) and on the texture (UV), and its length in UV units.
function bilinear(c, p, q) {
  const a = c[0], b = c[1], d = c[2], e = c[3], n = a.length;
  return Array.from({ length: n }, (_, k) => (a[k] * (1 - p) + b[k] * p) * (1 - q) + (e[k] * (1 - p) + d[k] * p) * q);
}
export function ruler(m, uv, id, samples = 24) {
  const f = islandFaces(m, id), rs = realSize(m, f);
  let s0 = Infinity, t0 = Infinity;
  for (const i of f) for (const [s, t] of m.faces[i].loc) { s0 = Math.min(s0, s); t0 = Math.min(t0, t); }
  const L = Math.min(1, rs.w), sa = s0 + (rs.w - L) / 2, tm = t0 + rs.h / 2;
  const pts3 = [], ptsUV = [];
  for (let k = 0; k <= samples; k++) {
    const s = sa + L * k / samples;
    for (const i of f) {
      const lc = m.faces[i].loc, ls0 = Math.min(...lc.map(p => p[0])), ls1 = Math.max(...lc.map(p => p[0])), lt0 = Math.min(...lc.map(p => p[1])), lt1 = Math.max(...lc.map(p => p[1]));
      if (s < ls0 - 1e-9 || s > ls1 + 1e-9) continue;
      const p = (s - lc[0][0]) / (lc[1][0] - lc[0][0]), q = (tm - lc[0][1]) / (lc[3][1] - lc[0][1]);
      void lt0; void lt1;
      pts3.push(bilinear(m.faces[i].v.map(v => m.pos[v]), p, q)); ptsUV.push(bilinear(uv[i], p, q));
      break;
    }
  }
  let lenUV = 0; for (let k = 1; k < ptsUV.length; k++) lenUV += Math.hypot(ptsUV[k][0] - ptsUV[k - 1][0], ptsUV[k][1] - ptsUV[k - 1][1]);
  return { L, pts3, ptsUV, lenUV };
}
