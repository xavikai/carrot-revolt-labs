// 3ds Max Viewport Lab · Standard Primitives and a few Object-Space modifiers. Pure JS (tested with node).
// Everything is in 3ds Max coordinates: Z is up, metres. Each primitive has its pivot where 3ds Max puts it
// (Box, Cylinder, Cone, Plane on the base centre; Sphere and Torus in the centre) and the default
// parameters and segments of 3ds Max 2027.
//
//   const m = buildMesh('Box', { length: 1, width: 1, height: 1, lsegs: 1, wsegs: 1, hsegs: 1 });
//   m.verts: [[x, y, z]…]   m.tris: [[a, b, c]…]   m.edges: [[a, b]…]  (the quad edges 3ds Max draws)

export const TYPES = ['Box', 'Cone', 'Sphere', 'GeoSphere', 'Cylinder', 'Tube', 'Torus', 'Pyramid', 'Teapot', 'Plane', 'TextPlus'];
export const MADE = ['Box', 'Sphere', 'Cylinder', 'Cone', 'Torus', 'Plane']; // the ones this lab can create

// Parameters in the order of the Parameters rollout: [key, label, default, step, min, decimals]
export const PARAMS = {
  Box: [['length', 'Length', 1, 0.1, 0.001, 3], ['width', 'Width', 1, 0.1, 0.001, 3], ['height', 'Height', 1, 0.1, -100, 3], ['lsegs', 'Length Segs', 1, 1, 1, 0], ['wsegs', 'Width Segs', 1, 1, 1, 0], ['hsegs', 'Height Segs', 1, 1, 1, 0]],
  Sphere: [['radius', 'Radius', 0.5, 0.05, 0.001, 3], ['segs', 'Segments', 32, 1, 4, 0]],
  Cylinder: [['radius', 'Radius', 0.5, 0.05, 0.001, 3], ['height', 'Height', 1, 0.1, -100, 3], ['hsegs', 'Height Segments', 5, 1, 1, 0], ['csegs', 'Cap Segments', 1, 1, 1, 0], ['sides', 'Sides', 18, 1, 3, 0]],
  Cone: [['r1', 'Radius 1', 0.5, 0.05, 0, 3], ['r2', 'Radius 2', 0, 0.05, 0, 3], ['height', 'Height', 1, 0.1, -100, 3], ['hsegs', 'Height Segments', 5, 1, 1, 0], ['csegs', 'Cap Segments', 1, 1, 1, 0], ['sides', 'Sides', 24, 1, 3, 0]],
  Torus: [['r1', 'Radius 1', 0.5, 0.05, 0.001, 3], ['r2', 'Radius 2', 0.15, 0.01, 0.001, 3], ['segs', 'Segments', 24, 1, 3, 0], ['sides', 'Sides', 12, 1, 3, 0]],
  Plane: [['length', 'Length', 1, 0.1, 0.001, 3], ['width', 'Width', 1, 0.1, 0.001, 3], ['lsegs', 'Length Segs', 4, 1, 1, 0], ['wsegs', 'Width Segs', 4, 1, 1, 0]],
};
export const defaults = type => Object.fromEntries((PARAMS[type] || []).map(p => [p[0], p[2]]));
const INT = new Set(['lsegs', 'wsegs', 'hsegs', 'segs', 'csegs', 'sides']);
// Keep parameters valid: segments are whole numbers within 3ds Max's limits.
export function cleanParam(type, key, v) {
  const p = (PARAMS[type] || []).find(q => q[0] === key); if (!p || !Number.isFinite(+v)) return null;
  let x = Math.max(p[4], +v); if (INT.has(key)) x = Math.min(200, Math.round(x));
  return +x.toFixed(p[5]);
}

function mesh() {
  const m = { verts: [], tris: [], edges: [] };
  m.v = (x, y, z) => m.verts.push([x, y, z]) - 1;
  m.quad = (a, b, c, d, e = [true, true, true, true]) => { m.tris.push([a, b, c], [a, c, d]); const q = [a, b, c, d]; q.forEach((p, i) => { if (e[i]) m.edges.push([p, q[(i + 1) % 4]]); }); };
  m.tri = (a, b, c, e = [true, true, true]) => { m.tris.push([a, b, c]); const q = [a, b, c]; q.forEach((p, i) => { if (e[i]) m.edges.push([p, q[(i + 1) % 3]]); }); };
  return m;
}
// A grid of quads on a flat side: corner o, directions u (n segments) and v (k segments). Own vertices: flat shading.
function side(m, o, u, v, n, k) {
  const id = [];
  for (let j = 0; j <= k; j++) for (let i = 0; i <= n; i++) id.push(m.v(o[0] + u[0] * i / n + v[0] * j / k, o[1] + u[1] * i / n + v[1] * j / k, o[2] + u[2] * i / n + v[2] * j / k));
  const at = (i, j) => id[j * (n + 1) + i];
  for (let j = 0; j < k; j++) for (let i = 0; i < n; i++) m.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), [j === 0, true, true, i === 0]);
}
function box(p) {
  const m = mesh(), L = p.length, W = p.width, H = p.height, x = W / 2, y = L / 2, nl = p.lsegs | 0 || 1, nw = p.wsegs | 0 || 1, nh = p.hsegs | 0 || 1;
  side(m, [-x, -y, 0], [0, L, 0], [W, 0, 0], nl, nw);      // bottom (faces down)
  side(m, [-x, -y, H], [W, 0, 0], [0, L, 0], nw, nl);      // top
  side(m, [-x, -y, 0], [W, 0, 0], [0, 0, H], nw, nh);      // front (-Y)
  side(m, [x, y, 0], [-W, 0, 0], [0, 0, H], nw, nh);       // back (+Y)
  side(m, [x, -y, 0], [0, L, 0], [0, 0, H], nl, nh);       // right (+X)
  side(m, [-x, y, 0], [0, -L, 0], [0, 0, H], nl, nh);      // left (-X)
  return m;
}
function plane(p) { const m = mesh(), L = p.length, W = p.width; side(m, [-W / 2, -L / 2, 0], [W, 0, 0], [0, L, 0], p.wsegs | 0 || 1, p.lsegs | 0 || 1); return m; }
function sphere(p) {
  const m = mesh(), r = p.radius, n = Math.max(4, p.segs | 0), rings = Math.max(2, Math.round(n / 2)), id = [];
  const top = m.v(0, 0, r);
  for (let j = 1; j < rings; j++) { const a = j / rings * Math.PI, row = []; for (let i = 0; i < n; i++) { const b = i / n * Math.PI * 2; row.push(m.v(r * Math.sin(a) * Math.cos(b), r * Math.sin(a) * Math.sin(b), r * Math.cos(a))); } id.push(row); }
  const bot = m.v(0, 0, -r);
  for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; m.tri(top, id[0][i], id[0][i2], [true, true, false]); m.tri(bot, id[rings - 2][i2], id[rings - 2][i], [false, false, true]); }
  for (let j = 0; j < rings - 2; j++) for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; m.quad(id[j][i], id[j + 1][i], id[j + 1][i2], id[j][i2], [true, true, false, false]); }
  return m;
}
// Cylinder and cone: sides (smooth, shared vertices around) and two caps (flat, own vertices).
function lathe(r1, r2, h, hs, cs, n) {
  const m = mesh(), ring = [];
  for (let j = 0; j <= hs; j++) { const z = h * j / hs, r = r1 + (r2 - r1) * j / hs, row = []; for (let i = 0; i < n; i++) { const b = i / n * Math.PI * 2; row.push(m.v(r * Math.cos(b), r * Math.sin(b), z)); } ring.push(row); }
  for (let j = 0; j < hs; j++) for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; m.quad(ring[j][i], ring[j][i2], ring[j + 1][i2], ring[j + 1][i], [j === 0, true, true, false]); }
  const cap = (r, z, down) => {
    if (r <= 1e-9) return;
    const c = m.v(0, 0, z), rows = [];
    for (let k = 1; k <= cs; k++) { const rr = r * k / cs, row = []; for (let i = 0; i < n; i++) { const b = i / n * Math.PI * 2; row.push(m.v(rr * Math.cos(b), rr * Math.sin(b), z)); } rows.push(row); }
    for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; down ? m.tri(c, rows[0][i2], rows[0][i], [true, cs > 1, true]) : m.tri(c, rows[0][i], rows[0][i2], [true, cs > 1, true]); }
    for (let k = 0; k < cs - 1; k++) for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; down ? m.quad(rows[k][i], rows[k][i2], rows[k + 1][i2], rows[k + 1][i], [false, true, k < cs - 2, true]) : m.quad(rows[k][i], rows[k + 1][i], rows[k + 1][i2], rows[k][i2], [true, k < cs - 2, true, false]); }
  };
  cap(r1, 0, true); cap(r2, h, false);
  return m;
}
function torus(p) {
  const m = mesh(), R = p.r1, r = p.r2, n = Math.max(3, p.segs | 0), k = Math.max(3, p.sides | 0), id = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, row = []; for (let j = 0; j < k; j++) { const b = j / k * Math.PI * 2, d = R + r * Math.cos(b); row.push(m.v(d * Math.cos(a), d * Math.sin(a), r * Math.sin(b))); } id.push(row); }
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) { const i2 = (i + 1) % n, j2 = (j + 1) % k; m.quad(id[i][j], id[i2][j], id[i2][j2], id[i][j2], [true, true, false, false]); }
  return m;
}
export function buildBase(type, p) {
  if (type === 'Box') return box(p);
  if (type === 'Plane') return plane(p);
  if (type === 'Sphere') return sphere(p);
  if (type === 'Cylinder') return lathe(p.radius, p.radius, p.height, Math.max(1, p.hsegs | 0), Math.max(1, p.csegs | 0), Math.max(3, p.sides | 0));
  if (type === 'Cone') return lathe(p.r1, p.r2, p.height, Math.max(1, p.hsegs | 0), Math.max(1, p.csegs | 0), Math.max(3, p.sides | 0));
  if (type === 'Torus') return torus(p);
  throw new Error('Unknown primitive ' + type);
}

// ─── Modifiers (Object-Space): Bend, Taper, Twist along an axis of the object ───
export const MODS = {
  Bend: [['angle', 'Angle', 0, 1, -360, 1], ['dir', 'Direction', 0, 1, -360, 1]],
  Taper: [['amount', 'Amount', 0, 0.05, -10, 2], ['curve', 'Curve', 0, 0.05, -10, 2]],
  Twist: [['angle', 'Angle', 0, 1, -3600, 1], ['bias', 'Bias', 0, 1, -100, 1]],
};
export const MOD_LIST = ['Bend', 'Taper', 'Twist'];
export const newMod = type => ({ type, on: true, axis: 'z', ...Object.fromEntries(MODS[type].map(p => [p[0], p[2]])) });
const AX = { x: [1, 2, 0], y: [2, 0, 1], z: [0, 1, 2] }; // the two cross axes, then the modifier axis
export function deform(verts, mods) {
  let V = verts.map(v => [...v]);
  for (const md of mods) {
    if (!md.on) continue;
    const [iu, iv, ih] = AX[md.axis || 'z'];
    let h0 = Infinity, h1 = -Infinity; for (const v of V) { h0 = Math.min(h0, v[ih]); h1 = Math.max(h1, v[ih]); }
    const H = h1 - h0; if (H < 1e-9) continue;
    if (md.type === 'Bend') {
      const th = (md.angle || 0) * Math.PI / 180; if (Math.abs(th) < 1e-9) continue;
      // the bend centre is on the pivot, as the Bend gizmo of 3ds Max: the part above bends forwards, the part below backwards
      const R = H / th, d = (md.dir || 0) * Math.PI / 180, cd = Math.cos(d), sd = Math.sin(d);
      V = V.map(v => { const u = v[iu] * cd + v[iv] * sd, w = -v[iu] * sd + v[iv] * cd, a = v[ih] / H * th, u2 = R - (R - u) * Math.cos(a), h2 = (R - u) * Math.sin(a), o = [...v]; o[iu] = u2 * cd - w * sd; o[iv] = u2 * sd + w * cd; o[ih] = h2; return o; });
    } else if (md.type === 'Taper') {
      const A = md.amount || 0, C = md.curve || 0; if (!A && !C) continue;
      V = V.map(v => { const t = (v[ih] - h0) / H, k = 1 + A * t + C * 4 * t * (1 - t), o = [...v]; o[iu] *= k; o[iv] *= k; return o; });
    } else if (md.type === 'Twist') {
      const T = (md.angle || 0) * Math.PI / 180; if (!T) continue;
      V = V.map(v => { const t = (v[ih] - h0) / H, a = T * t, c = Math.cos(a), s = Math.sin(a), o = [...v]; o[iu] = v[iu] * c - v[iv] * s; o[iv] = v[iu] * s + v[iv] * c; return o; });
    }
  }
  return V;
}
export function buildMesh(type, params, mods = []) {
  const m = buildBase(type, params);
  if (mods.length) m.verts = deform(m.verts, mods);
  return m;
}
export function bounds(verts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i]); }
  return { lo, hi };
}
