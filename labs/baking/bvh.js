// A small bounding volume hierarchy for fast ray casting against the high poly mesh.
// Median split on the longest axis, up to 4 triangles per leaf. Both sides of a triangle can be hit.
export function buildBVH(positions, indices) {
  const triCount = indices.length / 3;
  const tris = new Uint32Array(triCount).map((_, i) => i);
  const cen = new Float32Array(triCount * 3), bmin = new Float32Array(triCount * 3), bmax = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) for (let a = 0; a < 3; a++) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 3; k++) { const v = positions[indices[t * 3 + k] * 3 + a]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    bmin[t * 3 + a] = lo; bmax[t * 3 + a] = hi; cen[t * 3 + a] = (lo + hi) / 2;
  }
  const maxNodes = triCount * 2;
  const nMin = new Float32Array(maxNodes * 3), nMax = new Float32Array(maxNodes * 3);
  const nLeft = new Int32Array(maxNodes), nStart = new Int32Array(maxNodes), nCount = new Int32Array(maxNodes);
  let nodes = 0;
  const stack = [[0, triCount, nodes++]];
  while (stack.length) {
    const [start, end, id] = stack.pop();
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) { const t = tris[i]; for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], bmin[t * 3 + a]); hi[a] = Math.max(hi[a], bmax[t * 3 + a]); } }
    nMin.set(lo, id * 3); nMax.set(hi, id * 3);
    const count = end - start;
    if (count <= 4) { nLeft[id] = -1; nStart[id] = start; nCount[id] = count; continue; }
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const axis = ext[0] > ext[1] ? (ext[0] > ext[2] ? 0 : 2) : (ext[1] > ext[2] ? 1 : 2);
    const mid = (start + end) >> 1;
    // partial sort around the median (nth element)
    select(tris, start, end - 1, mid, t => cen[t * 3 + axis]);
    const l = nodes++, r = nodes++;
    nLeft[id] = l; nCount[id] = 0;
    stack.push([start, mid, l], [mid, end, r]);
  }
  return { positions, indices, tris, nMin, nMax, nLeft, nStart, nCount };
}
function select(arr, lo, hi, k, key) {
  while (hi > lo) {
    const pivot = key(arr[(lo + hi) >> 1]);
    let i = lo, j = hi;
    while (i <= j) {
      while (key(arr[i]) < pivot) i++;
      while (key(arr[j]) > pivot) j--;
      if (i <= j) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else return;
  }
}
// Nearest hit along o + t·d with tMin ≤ t ≤ tMax. Returns { t, tri, u, v } (barycentrics of vertices 1 and 2) or null.
const stackBuf = new Int32Array(128);
export function intersect(bvh, ox, oy, oz, dx, dy, dz, tMin, tMax) {
  const { positions: P, indices: I, tris, nMin, nMax, nLeft, nStart, nCount } = bvh;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  let best = tMax, bTri = -1, bu = 0, bv = 0, sp = 0;
  stackBuf[sp++] = 0;
  while (sp) {
    const n = stackBuf[--sp];
    let t0 = (nMin[n * 3] - ox) * ix, t1 = (nMax[n * 3] - ox) * ix;
    let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
    t0 = (nMin[n * 3 + 1] - oy) * iy; t1 = (nMax[n * 3 + 1] - oy) * iy;
    tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
    t0 = (nMin[n * 3 + 2] - oz) * iz; t1 = (nMax[n * 3 + 2] - oz) * iz;
    tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
    if (tmax < Math.max(tmin, tMin) || tmin > best) continue;
    if (nLeft[n] >= 0) { stackBuf[sp++] = nLeft[n]; stackBuf[sp++] = nLeft[n] + 1; continue; }
    for (let i = nStart[n], e = i + nCount[n]; i < e; i++) {
      const tri = tris[i], a = I[tri * 3] * 3, b = I[tri * 3 + 1] * 3, c = I[tri * 3 + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < -1e-6 || u > 1 + 1e-6) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t >= tMin && t < best) { best = t; bTri = tri; bu = u; bv = v; }
    }
  }
  return bTri < 0 ? null : { t: best, tri: bTri, u: bu, v: bv };
}
