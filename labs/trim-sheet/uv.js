// Trim Sheet Lab: UV islands. A mesh is { pos, faces: [{ v:[4 vertex ids], loc:[[s,t]×4], island }], islands }.
// `loc` is the ideal flat layout of a face in metres (s along the trim, t across it).
// UVs are stored per face corner: uv[face] = [[u,v]×4]. Pure maths, no DOM.
import { SIZE, DENSITY, UV_PER_M, stripAt } from './sheet.js?v=1';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const cloneUV = uv => uv.map(f => f.map(p => [p[0], p[1]]));

export const islandFaces = (mesh, id) => mesh.islands[id].faces;
export function faceNormal(mesh, f) {
  const [a, b, c, d] = mesh.faces[f].v.map(i => mesh.pos[i]);
  return norm(cross(sub(c, a), sub(d, b)));
}
export function faceArea(mesh, f) {
  const [a, b, c, d] = mesh.faces[f].v.map(i => mesh.pos[i]);
  return len(cross(sub(c, a), sub(d, b))) / 2;
}
export function area2(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

export function bbox(uv, faces) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const f of faces) for (const [u, v] of uv[f]) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { u0, u1, v0, v1, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2 };
}
// Texel density of a group of faces, in px per metre.
export function density(mesh, uv, faces) {
  let a3 = 0, a2 = 0;
  for (const f of faces) { a3 += faceArea(mesh, f); a2 += Math.abs(area2(uv[f])); }
  return a3 > 0 ? Math.sqrt(a2 / a3) * SIZE : 0;
}
// Least-squares affine map from the ideal layout (s, t) to the UVs of a face: its columns are where s and t go.
export function faceAffine(face, uvf) {
  const lc = [0, 0], uc = [0, 0];
  for (let i = 0; i < 4; i++) { lc[0] += face.loc[i][0] / 4; lc[1] += face.loc[i][1] / 4; uc[0] += uvf[i][0] / 4; uc[1] += uvf[i][1] / 4; }
  let ss = 0, st = 0, tt = 0, us = 0, ut = 0, vs = 0, vt = 0;
  for (let i = 0; i < 4; i++) {
    const s = face.loc[i][0] - lc[0], t = face.loc[i][1] - lc[1], u = uvf[i][0] - uc[0], v = uvf[i][1] - uc[1];
    ss += s * s; st += s * t; tt += t * t; us += u * s; ut += u * t; vs += v * s; vt += v * t;
  }
  const det = ss * tt - st * st || 1e-12;
  // [u v] = A [s t]: A = [[us ut][vs vt]] · inverse([[ss st][st tt]])
  const i00 = tt / det, i01 = -st / det, i11 = ss / det;
  return { su: us * i00 + ut * i01, sv: vs * i00 + vt * i01, tu: us * i01 + ut * i11, tv: vs * i01 + vt * i11 };
}
// How each face of a group lies on the sheet: the worst angle between the trim direction and U,
// whether "up" (t) points up the sheet, and the worst stretch (length of t over length of s).
export function orientation(mesh, uv, faces) {
  let angle = 0, upright = true, stretch = 1;
  for (const f of faces) {
    const A = faceAffine(mesh.faces[f], uv[f]);
    const ls = Math.hypot(A.su, A.sv), lt = Math.hypot(A.tu, A.tv);
    const a = Math.atan2(Math.abs(A.sv), Math.abs(A.su)) * 180 / Math.PI;
    angle = Math.max(angle, a);
    if (A.tv <= 0) upright = false;
    const r = ls > 0 && lt > 0 ? Math.max(ls / lt, lt / ls) : Infinity;
    stretch = Math.max(stretch, r);
  }
  return { angle, upright, stretch };
}

// ─── Transforms ──────────────────────────────────────────────────────────────
export function mapUV(uv, faces, fn) { for (const f of faces) uv[f] = uv[f].map(p => fn(p[0], p[1])); return uv; }
export const translate = (uv, faces, du, dv) => mapUV(uv, faces, (u, v) => [u + du, v + dv]);
export const scale = (uv, faces, ku, kv, pu, pv) => mapUV(uv, faces, (u, v) => [pu + (u - pu) * ku, pv + (v - pv) * kv]);
export function rotate(uv, faces, deg, pu, pv) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return mapUV(uv, faces, (u, v) => [pu + (u - pu) * c - (v - pv) * s, pv + (u - pu) * s + (v - pv) * c]);
}
// The ideal layout of a group of faces, with `d` UV units per metre, s along U and t up V.
export function ideal(mesh, uv, faces, d) {
  for (const f of faces) uv[f] = mesh.faces[f].loc.map(([s, t]) => [s * d, t * d]);
  return uv;
}
// Follow Active Quads: straighten the island into a strip of quads with their real proportions.
// It keeps the area of the island, its centre and the direction of its middle ("active") face.
export function followActiveQuads(mesh, uv, faces) {
  const b = bbox(uv, faces), d = density(mesh, uv, faces) / SIZE;
  const mid = faces[Math.floor(faces.length / 2)], A = faceAffine(mesh.faces[mid], uv[mid]);
  const ang = Math.atan2(A.sv, A.su) * 180 / Math.PI, flip = A.su * A.tv - A.sv * A.tu < 0;
  ideal(mesh, uv, faces, d);
  if (flip) mapUV(uv, faces, (u, v) => [u, -v]);
  const c = bbox(uv, faces);
  rotate(uv, faces, ang, c.cu, c.cv);
  const n = bbox(uv, faces);
  return translate(uv, faces, b.cu - n.cu, b.cv - n.cv);
}
// Align Rotation: turn the island by the smallest angle that lines its quads up with the axes.
export function alignRotation(mesh, uv, faces) {
  let x = 0, y = 0;
  for (const f of faces) { const A = faceAffine(mesh.faces[f], uv[f]); const a = Math.atan2(A.sv, A.su) * 4, w = faceArea(mesh, f); x += Math.cos(a) * w; y += Math.sin(a) * w; }
  const avg = Math.atan2(y, x) / 4 * 180 / Math.PI;   // direction modulo 90°
  const b = bbox(uv, faces);
  return rotate(uv, faces, -avg, b.cu, b.cv);
}
// Fit to Trim (what trim-sheet add-ons do): straight, upright, as tall as the strip, centred on it.
export function fitToTrim(mesh, uv, faces, strip) {
  const b = bbox(uv, faces);
  let t0 = Infinity, t1 = -Infinity;
  for (const f of faces) for (const [, t] of mesh.faces[f].loc) { t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  ideal(mesh, uv, faces, (strip.v1 - strip.v0) / (t1 - t0));
  const n = bbox(uv, faces);
  return translate(uv, faces, (Number.isFinite(b.cu) ? b.cu : 0.5) - n.cu, (strip.v0 + strip.v1) / 2 - n.cv);
}
// Put a group straight on its strip at the target density, starting at u0 (the lab's solutions).
export function place(mesh, uv, faces, strip, u0 = 0, d = UV_PER_M) {
  ideal(mesh, uv, faces, d);
  const n = bbox(uv, faces);
  return translate(uv, faces, u0 - n.u0, (strip.v0 + strip.v1) / 2 - n.cv);
}

// ─── Checks ──────────────────────────────────────────────────────────────────
export const TOL = 2 / SIZE;   // 2 px
export function insideStrip(uv, faces, strip, tol = TOL) {
  const b = bbox(uv, faces);
  return b.v0 >= strip.v0 - tol && b.v1 <= strip.v1 + tol;
}
// The strip that holds the whole group, or null when it crosses a strip edge.
export function holdingStrip(uv, faces, strips) {
  const b = bbox(uv, faces);
  const s = stripAt(b.cv, strips);
  if (!s) return null;
  const k = Math.floor(b.cv);
  return b.v0 >= s.v0 + k - TOL && b.v1 <= s.v1 + k + TOL ? s : null;
}
// Everything the lab checks for one island.
export function report(mesh, uv, id, strips) {
  const faces = islandFaces(mesh, id), isl = mesh.islands[id];
  const dens = density(mesh, uv, faces), o = orientation(mesh, uv, faces);
  const strip = holdingStrip(uv, faces, strips);
  const r = {
    id, density: dens, strip: strip?.type ?? null,
    onTarget: strip?.type === isl.target,
    densityOk: Math.abs(dens / DENSITY - 1) <= 0.1,
    straight: o.angle <= 5, upright: o.upright, stretchOk: o.stretch <= 1.1,
  };
  r.ok = r.onTarget && r.densityOk && r.straight && r.upright && r.stretchOk;
  return r;
}
// The first problem of an island, in words (for the status bar and the checks).
export function problem(r, mesh) {
  const isl = mesh.islands[r.id];
  if (!r.straight) return `${isl.name} is not straight: turn it so the trim runs along U.`;
  if (!r.upright) return `${isl.name} is upside down: its top must point up the sheet.`;
  if (!r.stretchOk) return `${isl.name} is stretched: scale it the same in U and V.`;
  if (!r.densityOk) return `${isl.name} has ${Math.round(r.density)} px/m: it needs about 512 px/m.`;
  if (!r.onTarget) return `${isl.name} is not inside its strip.`;
  return '';
}

// ─── Shading normals (per face corner) ───────────────────────────────────────
// flat · smooth (all faces averaged) · angle (Smooth by Angle, 30°) · weighted (Weighted Normal, Face Area).
export function cornerNormals(mesh, mode = 'angle', maxAngle = 30) {
  const fn = mesh.faces.map((_, f) => faceNormal(mesh, f)), fa = mesh.faces.map((_, f) => faceArea(mesh, f));
  const around = mesh.pos.map(() => []);
  mesh.faces.forEach((face, f) => face.v.forEach(v => around[v].push(f)));
  const cos = Math.cos(maxAngle * Math.PI / 180);
  return mesh.faces.map((face, f) => face.v.map(v => {
    if (mode === 'flat') return fn[f];
    let n = [0, 0, 0];
    const list = mode === 'angle' ? around[v].filter(g => fn[g][0] * fn[f][0] + fn[g][1] * fn[f][1] + fn[g][2] * fn[f][2] >= cos) : around[v];
    let best = 0; for (const g of list) best = Math.max(best, fa[g]);
    for (const g of list) {
      // Weighted Normal, Face Area: the biggest faces win; the others add almost nothing.
      const w = mode === 'weighted' ? (fa[g] >= best * 0.98 ? 1 : 1e-4) : 1;
      n = [n[0] + fn[g][0] * w, n[1] + fn[g][1] * w, n[2] + fn[g][2] * w];
    }
    return norm(n);
  }));
}
