// Builds the plaster bust of the Lighting Lab: a sculpt made of smooth blended shapes (signed distance
// functions), meshed with surface nets and saved as a small binary file.
//   node tools/make-bust.mjs [voxel size in mm, default 2.6]
// Output: labs/lighting/assets/bust.bin  (see readBust in labs/lighting/scene.js for the format)
// Units are metres, relative to the centre of the head. y is up, the face looks towards +z.
import { writeFileSync, mkdirSync } from 'node:fs';

const VOX = (+process.argv[2] || 2.8) / 1000;
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Smooth union / subtraction / intersection (polynomial smooth min, k = blend radius in metres)
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
const ssub = (a, b, k) => smax(a, -b, k);
// Ellipsoid (a good approximation of the distance, exact on the surface)
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = x - cx, py = y - cy, pz = z - cz;
  const k0 = len3(px / rx, py / ry, pz / rz), k1 = len3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
// Capsule between two points, with a radius that goes from ra to rb (a round cone, approximately)
function cap(x, y, z, ax, ay, az, bx, by, bz, ra, rb = ra) {
  const px = x - ax, py = y - ay, pz = z - az, vx = bx - ax, vy = by - ay, vz = bz - az;
  const h = clamp((px * vx + py * vy + pz * vz) / (vx * vx + vy * vy + vz * vz), 0, 1);
  return len3(px - vx * h, py - vy * h, pz - vz * h) - (ra + (rb - ra) * h);
}
const sph = (x, y, z, cx, cy, cz, r) => len3(x - cx, y - cy, z - cz) - r;
// Rotate a point around y (degrees): used to turn the ears.
function rotY(x, z, deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c * x + s * z, -s * x + c * z]; }

function head(x, y, z) {
  const ax = Math.abs(x);   // symmetric features use |x|
  // Skull and face
  let d = ell(x, y, z, 0, 0.022, -0.012, 0.073, 0.087, 0.094);
  d = smin(d, ell(x, y, z, 0, -0.028, 0.03, 0.057, 0.082, 0.066), 0.03);
  // Forehead: a flatter front
  d = smin(d, ell(x, y, z, 0, 0.045, 0.045, 0.058, 0.045, 0.045), 0.02);
  // Jaw (mandible) and chin
  d = smin(d, ell(ax, y, z, 0.033, -0.068, 0.016, 0.023, 0.032, 0.046), 0.02);
  d = smin(d, ell(x, y, z, 0, -0.088, 0.045, 0.036, 0.03, 0.04), 0.02);
  d = smin(d, ell(x, y, z, 0, -0.1, 0.066, 0.02, 0.016, 0.017), 0.012);
  // Cheekbones and cheeks
  d = smin(d, ell(ax, y, z, 0.045, -0.006, 0.055, 0.022, 0.015, 0.024), 0.014);
  // Soft cheeks between the cheekbones and the jaw
  d = smin(d, ell(ax, y, z, 0.036, -0.045, 0.043, 0.022, 0.038, 0.027), 0.022);
  // Brow ridge and the root of the nose
  d = smin(d, cap(x, y, z, -0.042, 0.031, 0.07, 0.042, 0.031, 0.07, 0.01), 0.014);
  // Eye sockets (carved) and eyeballs (added back), then upper and lower lids
  d = ssub(d, ell(ax, y, z, 0.03, 0.013, 0.081, 0.016, 0.0095, 0.009), 0.01);
  d = smin(d, sph(ax, y, z, 0.03, 0.011, 0.0685, 0.014), 0.006);
  d = smin(d, ell(ax, y, z, 0.03, 0.0195, 0.075, 0.015, 0.004, 0.008), 0.006);
  // Nose: bridge, tip, wings, nostrils
  d = smin(d, cap(x, y, z, 0, 0.022, 0.086, 0, -0.024, 0.106, 0.0065, 0.0095), 0.008);
  d = smin(d, sph(x, y, z, 0, -0.028, 0.105, 0.0098), 0.006);
  d = smin(d, sph(ax, y, z, 0.0098, -0.032, 0.095, 0.0072), 0.006);
  // Mouth: the muzzle, upper and lower lip, the line between them, the groove under the lower lip
  d = smin(d, ell(x, y, z, 0, -0.056, 0.07, 0.029, 0.022, 0.016), 0.012);
  d = smin(d, ell(x, y, z, 0, -0.0535, 0.0855, 0.017, 0.0052, 0.0075), 0.004);
  d = smin(d, ell(x, y, z, 0, -0.0665, 0.084, 0.015, 0.006, 0.0078), 0.004);
  d = ssub(d, ell(x, y, z, 0, -0.0765, 0.086, 0.015, 0.003, 0.006), 0.004);
  // Ears, turned a little, with a hollow
  const [ex, ez] = rotY(ax - 0.075, z + 0.004, 18);
  let ear = ell(ex, y, ez, 0, 0.002, 0, 0.011, 0.029, 0.018);
  ear = ssub(ear, ell(ex, y, ez, 0.011, 0.001, 0.002, 0.004, 0.016, 0.009), 0.006);
  d = smin(d, ear, 0.006);
  // Hair: a thick cap over the skull, with a hairline, and waves
  const hairCap = ell(x, y, z, 0, 0.03, -0.014, 0.079, 0.088, 0.1);
  const line = 0.03 - 0.006 * Math.cos(ax * 40) + 0.05 * Math.max(0, -z / 0.1) - 0.03 * clamp((ax - 0.05) / 0.03, 0, 1);
  let hair = smax(hairCap, line - y, 0.01);
  const waves = 0.0011 * Math.sin(x * 120 + Math.sin(z * 50) * 2) * Math.sin(y * 80 + z * 60) + 0.0007 * Math.sin((x - z) * 200);
  d = smin(d, hair + waves * clamp((y - line + 0.02) / 0.02, 0, 1), 0.01);
  return d;
}
function body(x, y, z) {
  const ax = Math.abs(x);
  // Neck with the two sternocleidomastoid muscles
  let d = cap(x, y, z, 0, -0.06, -0.012, 0, -0.17, -0.01, 0.043, 0.05);
  d = smin(d, cap(ax, y, z, 0.03, -0.09, -0.02, 0.012, -0.175, 0.03, 0.012), 0.012);
  // Chest, shoulders (trapezius and deltoids), pectorals
  d = smin(d, ell(x, y, z, 0, -0.245, -0.02, 0.17, 0.08, 0.095), 0.04);
  d = smin(d, cap(ax, y, z, 0.02, -0.14, -0.025, 0.15, -0.195, -0.03, 0.035), 0.03);
  d = smin(d, sph(ax, y, z, 0.158, -0.212, -0.012, 0.042), 0.03);
  d = smin(d, ell(ax, y, z, 0.055, -0.235, 0.03, 0.065, 0.045, 0.04), 0.03);
  // Collarbones
  d = smin(d, cap(ax, y, z, 0.016, -0.18, 0.035, 0.12, -0.19, 0.01, 0.009), 0.01);
  // The classic cut of a bust: rounded at the bottom, rising at the sides, flat at the back
  const cut = -0.27 + 0.09 * (ax / 0.19) ** 2;
  d = smax(d, cut - y, 0.006);
  d = smax(d, -z - 0.105, 0.01);
  return d;
}
export const sdf = (x, y, z) => smin(head(x, y, z), body(x, y, z), 0.025);

// ─── Surface nets ────────────────────────────────────────────────────────────
const B = { x0: -0.22, x1: 0.22, y0: -0.285, y1: 0.125, z0: -0.135, z1: 0.13 };
const nx = Math.ceil((B.x1 - B.x0) / VOX) + 1, ny = Math.ceil((B.y1 - B.y0) / VOX) + 1, nz = Math.ceil((B.z1 - B.z0) / VOX) + 1;
const P = (i, j, k) => [B.x0 + i * VOX, B.y0 + j * VOX, B.z0 + k * VOX];
const field = new Float32Array(nx * ny * nz), at = (i, j, k) => (k * ny + j) * nx + i;
for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const [x, y, z] = P(i, j, k); field[at(i, j, k)] = sdf(x, y, z); }
const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cat = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
const pos = [];
const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
  const v = corners.map(([a, b, c]) => field[at(i + a, j + b, k + c)]);
  let inside = 0; for (const f of v) if (f < 0) inside++;
  if (inside === 0 || inside === 8) continue;
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (const [a, b] of edges) {
    if ((v[a] < 0) === (v[b] < 0)) continue;
    const t = v[a] / (v[a] - v[b]), ca = corners[a], cb = corners[b];
    sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++;
  }
  cellVert[cat(i, j, k)] = pos.length / 3;
  pos.push(B.x0 + (i + sx / n) * VOX, B.y0 + (j + sy / n) * VOX, B.z0 + (k + sz / n) * VOX);
}
// One quad for every grid edge that crosses the surface, facing outwards
const idx = [];
const quad = (a, b, c, d, flip) => { if ([a, b, c, d].some(q => q < 0)) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
  const f0 = field[at(i, j, k)] < 0;
  if (i < nx - 1 && f0 !== (field[at(i + 1, j, k)] < 0)) quad(cellVert[cat(i, j - 1, k - 1)], cellVert[cat(i, j, k - 1)], cellVert[cat(i, j, k)], cellVert[cat(i, j - 1, k)], !f0);
  if (j < ny - 1 && f0 !== (field[at(i, j + 1, k)] < 0)) quad(cellVert[cat(i - 1, j, k - 1)], cellVert[cat(i - 1, j, k)], cellVert[cat(i, j, k)], cellVert[cat(i, j, k - 1)], !f0);
  if (k < nz - 1 && f0 !== (field[at(i, j, k + 1)] < 0)) quad(cellVert[cat(i - 1, j - 1, k)], cellVert[cat(i, j - 1, k)], cellVert[cat(i, j, k)], cellVert[cat(i - 1, j, k)], !f0);
}
const nv = pos.length / 3;
// Make every triangle face outwards (the same way as the gradient of the field)
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(q => q * 3);
  const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
  const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
  const mx = (pos[a] + pos[b] + pos[c]) / 3, my = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3, h = VOX * 0.5;
  const gx = sdf(mx + h, my, mz) - sdf(mx - h, my, mz), gy = sdf(mx, my + h, mz) - sdf(mx, my - h, mz), gz = sdf(mx, my, mz + h) - sdf(mx, my, mz - h);
  if (fx * gx + fy * gy + fz * gz < 0) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
}
// Normals from the gradient of the distance field: smooth and exact
const nrm = new Int8Array(nv * 3), e = VOX * 0.5;
for (let v = 0; v < nv; v++) {
  const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
  let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
  const l = len3(gx, gy, gz) || 1; nrm[v * 3] = Math.round(gx / l * 127); nrm[v * 3 + 1] = Math.round(gy / l * 127); nrm[v * 3 + 2] = Math.round(gz / l * 127);
}
// ─── Binary file ─────────────────────────────────────────────────────────────
// 'BST1', nv (u32), ni (u32), min xyz (f32×3), size xyz (f32×3), positions (u16×3·nv, quantised),
// normals (i8×3·nv), padding to 4 bytes, indices (u16 if nv < 65536, else u32)
const size = [B.x1 - B.x0, B.y1 - B.y0, B.z1 - B.z0], wide = nv >= 65536, ni = idx.length;
const head8 = 4 + 4 + 4 + 12 + 12, posB = nv * 6, idxOff = Math.ceil((head8 + posB + nv * 3) / 4) * 4, idxB = ni * (wide ? 4 : 2);
const buf = new ArrayBuffer(idxOff + idxB), dv = new DataView(buf);
[66, 83, 84, 49].forEach((c, i) => dv.setUint8(i, c));
dv.setUint32(4, nv, true); dv.setUint32(8, ni, true);
[B.x0, B.y0, B.z0, ...size].forEach((v, i) => dv.setFloat32(12 + i * 4, v, true));
const P16 = new Uint16Array(buf, head8, nv * 3);
for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) P16[v * 3 + c] = Math.round((pos[v * 3 + c] - [B.x0, B.y0, B.z0][c]) / size[c] * 65535);
new Int8Array(buf, head8 + posB, nv * 3).set(nrm);
const I = wide ? new Uint32Array(buf, idxOff, ni) : new Uint16Array(buf, idxOff, ni); I.set(idx);
mkdirSync('labs/lighting/assets', { recursive: true });
writeFileSync('labs/lighting/assets/bust.bin', new Uint8Array(buf));
console.log(`grid ${nx}×${ny}×${nz}, ${nv} vertices, ${ni / 3} triangles, ${(buf.byteLength / 1024).toFixed(0)} KB${wide ? ' (32-bit indices)' : ''}`);
