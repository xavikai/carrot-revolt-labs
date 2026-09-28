// Lightmap Lab: a small room, a Unity-style Progressive Lightmapper and light probes. Pure JS (no DOM), tested with node.
// Units are metres (1 Unity unit). Y is up. Irradiance E is stored in the lightmap; a surface shows albedo × E / π.

// ─── Vectors ─────────────────────────────────────────────────────────────────
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V = { add, sub, mul, dot, cross, norm };

// ─── Light ───────────────────────────────────────────────────────────────────
export const SUN = { dir: norm([0.42, 0.62, -0.66]), color: [1, 0.93, 0.8], E: 9 };   // towards the sun; irradiance at normal incidence
export const SKY = { top: [0.45, 0.6, 1.0], horizon: [0.8, 0.85, 0.95], ground: [0.35, 0.33, 0.3], L: 2.6 };
export function skyL(d) { const y = d[1]; const c = y >= 0 ? SKY.horizon.map((h, i) => h + (SKY.top[i] - h) * Math.sqrt(y)) : SKY.ground; return mul(c, SKY.L); }

// ─── The room ────────────────────────────────────────────────────────────────
// Faces are rectangles: origin o, unit axes u, v (lengths w, h); the normal u × v points into the room.
const WIN = { x0: -1.6, x1: 0.6, y0: 0.9, y1: 2.4 };
export const WINDOW = WIN;
function rect(id, obj, o, u, w, v, h, albedo) { return { id, obj, o, u, v, w, h, n: norm(cross(u, v)), albedo }; }
function boxFaces(obj, mn, mx, albedo, which = ['xn', 'xp', 'zn', 'zp', 'yp']) {
  const [x0, y0, z0] = mn, [x1, y1, z1] = mx, f = [];
  if (which.includes('xn')) f.push(rect(obj + '.xn', obj, [x0, y0, z0], [0, 0, 1], z1 - z0, [0, 1, 0], y1 - y0, albedo));
  if (which.includes('xp')) f.push(rect(obj + '.xp', obj, [x1, y0, z1], [0, 0, -1], z1 - z0, [0, 1, 0], y1 - y0, albedo));
  if (which.includes('zn')) f.push(rect(obj + '.zn', obj, [x1, y0, z0], [-1, 0, 0], x1 - x0, [0, 1, 0], y1 - y0, albedo));
  if (which.includes('zp')) f.push(rect(obj + '.zp', obj, [x0, y0, z1], [1, 0, 0], x1 - x0, [0, 1, 0], y1 - y0, albedo));
  if (which.includes('yp')) f.push(rect(obj + '.yp', obj, [x0, y1, z1], [1, 0, 0], x1 - x0, [0, 0, -1], z1 - z0, albedo));
  return f;
}
const ALB = { floor: [0.5, 0.36, 0.24], wall: [0.78, 0.76, 0.7], ceiling: [0.82, 0.82, 0.8], pillar: [0.55, 0.56, 0.58], crate: [0.58, 0.42, 0.26], vase: [0.2, 0.36, 0.62], door: [0.45, 0.28, 0.18], character: [0.85, 0.55, 0.35] };
export const ALBEDO = ALB;
// Objects: name, faces that get lightmaps, boxes that block light, and the defaults of their Mesh Renderer.
export const OBJECTS = {
  Floor: { faces: [rect('floor', 'Floor', [-4, 0, 3], [1, 0, 0], 8, [0, 0, -1], 6, ALB.floor)], boxes: [[[-4.2, -0.2, -3.2], [4.2, 0, 3.2]]] },
  Ceiling: { faces: [rect('ceiling', 'Ceiling', [-4, 3, -3], [1, 0, 0], 8, [0, 0, 1], 6, ALB.ceiling)], boxes: [[[-4.2, 3, -3.2], [4.2, 3.2, 3.2]]] },
  Walls: {
    faces: [
      rect('back.l', 'Walls', [-4, 0, -3], [1, 0, 0], WIN.x0 + 4, [0, 1, 0], 3, ALB.wall),
      rect('back.r', 'Walls', [WIN.x1, 0, -3], [1, 0, 0], 4 - WIN.x1, [0, 1, 0], 3, ALB.wall),
      rect('back.b', 'Walls', [WIN.x0, 0, -3], [1, 0, 0], WIN.x1 - WIN.x0, [0, 1, 0], WIN.y0, ALB.wall),
      rect('back.t', 'Walls', [WIN.x0, WIN.y1, -3], [1, 0, 0], WIN.x1 - WIN.x0, [0, 1, 0], 3 - WIN.y1, ALB.wall),
      rect('left', 'Walls', [-4, 0, 3], [0, 0, -1], 6, [0, 1, 0], 3, ALB.wall),
      rect('right', 'Walls', [4, 0, -3], [0, 0, 1], 6, [0, 1, 0], 3, ALB.wall),
      rect('front', 'Walls', [4, 0, 3], [-1, 0, 0], 8, [0, 1, 0], 3, ALB.wall),
    ],
    boxes: [[[-4.2, 0, -3.2], [WIN.x0, 3, -3]], [[WIN.x1, 0, -3.2], [4.2, 3, -3]], [[WIN.x0, 0, -3.2], [WIN.x1, WIN.y0, -3]], [[WIN.x0, WIN.y1, -3.2], [WIN.x1, 3, -3]],
      [[-4.2, 0, -3.2], [-4, 3, 3.2]], [[4, 0, -3.2], [4.2, 3, 3.2]], [[-4.2, 0, 3], [4.2, 3, 3.2]]],
  },
  Pillar: { faces: boxFaces('Pillar', [1.7, 0, -1.4], [2.3, 3, -0.8], ALB.pillar, ['xn', 'xp', 'zn', 'zp']), boxes: [[[1.7, 0, -1.4], [2.3, 3, -0.8]]] },
  Crate: { faces: boxFaces('Crate', [-2.6, 0, 0.2], [-1.8, 0.8, 1.0], ALB.crate), boxes: [[[-2.6, 0, 0.2], [-1.8, 0.8, 1.0]]] },
  Vase: { faces: boxFaces('Vase', [-2.3, 0.8, 0.5], [-2.1, 1.25, 0.7], ALB.vase), boxes: [[[-2.3, 0.8, 0.5], [-2.1, 1.25, 0.7]]] },
  Door: { faces: boxFaces('Door', [-3.98, 0, 0.9], [-3.9, 2.1, 1.9], ALB.door, ['xp']), boxes: [[[-3.98, 0, 0.9], [-3.9, 2.1, 1.9]]] },
};
export const OBJECT_NAMES = Object.keys(OBJECTS);
// The right Mesh Renderer settings: Contribute Global Illumination (static) and Receive Global Illumination.
export const RIGHT_GI = { Floor: [true, 'lightmaps'], Ceiling: [true, 'lightmaps'], Walls: [true, 'lightmaps'], Pillar: [true, 'lightmaps'], Crate: [true, 'lightmaps'], Vase: [true, 'probes'], Door: [false, 'probes'] };
export function defaultRenderers() { const r = {}; for (const n of OBJECT_NAMES) r[n] = { contribute: true, receive: 'lightmaps', scale: 1 }; return r; }
const faceIndex = {}; for (const o of Object.values(OBJECTS)) for (const f of o.faces) faceIndex[f.id] = f;
export const FACES = faceIndex;

// ─── Ray casting against boxes ───────────────────────────────────────────────
// A box face is linked to a lightmapped face when it is one; returns { t, face, p } or null.
export function sceneBoxes(renderers) {
  const out = [];
  for (const [name, o] of Object.entries(OBJECTS)) { if (!renderers[name].contribute) continue; for (const b of o.boxes) out.push({ mn: b[0], mx: b[1], obj: name }); }
  return out;
}
export function rayBoxes(boxes, p, d, tMax = 1e9) {
  let best = tMax, hit = null;
  for (let k = 0; k < boxes.length; k++) {
    const b = boxes[k]; let t0 = 1e-4, t1 = best, axis = -1, sgn = 0;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-12) { if (p[a] < b.mn[a] || p[a] > b.mx[a]) { t0 = 1; t1 = 0; break; } continue; }
      let ta = (b.mn[a] - p[a]) / d[a], tb = (b.mx[a] - p[a]) / d[a], s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; axis = a; sgn = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) break;
    }
    if (t0 <= t1 && axis >= 0 && t0 < best) { best = t0; hit = { t: t0, box: b, axis, sgn }; }
  }
  if (!hit) return null;
  const q = add(p, mul(d, hit.t)), n = [0, 0, 0]; n[hit.axis] = hit.sgn;
  return { t: hit.t, p: q, n, obj: hit.box.obj };
}
export const visible = (boxes, p, d) => !rayBoxes(boxes, p, d);
// The lightmapped face at a point on an object (null if none).
export function faceAt(obj, p, n) {
  for (const f of OBJECTS[obj].faces) {
    if (dot(f.n, n) < 0.9) continue;
    const r = sub(p, f.o), s = dot(r, f.u), t = dot(r, f.v), off = Math.abs(dot(r, f.n));
    if (off < 0.02 && s >= -0.02 && s <= f.w + 0.02 && t >= -0.02 && t <= f.h + 0.02) return { f, s, t };
  }
  return null;
}

// ─── Deterministic random numbers ────────────────────────────────────────────
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function cosineDir(n, r1, r2) {
  const a = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0], t = norm(cross(a, n)), b = cross(n, t);
  const r = Math.sqrt(r1), phi = 2 * Math.PI * r2, x = r * Math.cos(phi), y = r * Math.sin(phi), z = Math.sqrt(Math.max(0, 1 - r1));
  return norm(add(add(mul(t, x), mul(b, y)), mul(n, z)));
}

// ─── Charts and packing (the lightmap atlas) ─────────────────────────────────
export const DEFAULT_BAKE = { resolution: 4, padding: 2, maxSize: 512, direct: 32, indirect: 16, env: 32, bounces: 1, filter: 'gaussian', ao: false };
// Size in texels of the chart of a face: its metres × resolution × Scale In Lightmap.
export function chartSize(f, bake, scale = 1) { const k = bake.resolution * scale; return [Math.max(1, Math.ceil(f.w * k)), Math.max(1, Math.ceil(f.h * k))]; }
export function pack(renderers, bake) {
  const items = [];
  for (const [name, o] of Object.entries(OBJECTS)) {
    const r = renderers[name]; if (!r.contribute || r.receive !== 'lightmaps') continue;
    for (const f of o.faces) { const [cw, ch] = chartSize(f, bake, r.scale); items.push({ id: f.id, obj: name, cw, ch }); }
  }
  items.sort((a, b) => b.ch - a.ch || b.cw - a.cw);
  const P = bake.padding, S = bake.maxSize, pages = [{ x: P, y: P, row: 0 }], out = {};
  let texels = 0;
  for (const it of items) {
    const cw = Math.min(it.cw, S - 2 * P), ch = Math.min(it.ch, S - 2 * P);
    let pg = pages[pages.length - 1];
    if (pg.x + cw + P > S) { pg.x = P; pg.y += pg.row + P; pg.row = 0; }
    if (pg.y + ch + P > S) { pg = { x: P, y: P, row: 0 }; pages.push(pg); }
    out[it.id] = { page: pages.length - 1, x: pg.x, y: pg.y, cw, ch, obj: it.obj };
    pg.x += cw + P; pg.row = Math.max(pg.row, ch); texels += cw * ch;
  }
  return { charts: out, pages: pages.length, size: S, texels };
}
// Memory of the lightmaps: RGBA half float with directional maps doubled is too much detail; Unity's default HDR compression ~1 byte/px.
export const lightmapMB = (pages, size, directional = true) => pages * size * size * (directional ? 2 : 1) / (1024 * 1024);

// ─── Baking ──────────────────────────────────────────────────────────────────
// A bake job: call run(budgetRays) until done. mode: 'baked' puts the sun's direct light in the lightmap,
// 'indirect' (Mixed · Baked Indirect) keeps only the bounced light. Returns Float32Array RGB per page.
export function createBake(renderers, bake, mode = 'baked') {
  const P = pack(renderers, bake), boxes = sceneBoxes(renderers), S = P.size;
  const pages = Array.from({ length: P.pages }, () => ({ E: new Float32Array(S * S * 3), D: new Float32Array(S * S * 3), I: new Float32Array(S * S * 3), mask: new Uint8Array(S * S) }));
  const list = Object.entries(P.charts);
  const passes = 1 + bake.bounces;
  let pass = 0, ci = 0, row = 0, rays = 0; const rand = rng(1234);
  const directAt = (p, n) => { const c = dot(n, SUN.dir); return c > 0 && visible(boxes, add(p, mul(n, 1e-3)), SUN.dir) ? mul(SUN.color, SUN.E * c) : [0, 0, 0]; };
  let prev = null;                                  // E of the previous pass (for the bounces)
  const lookup = (hit) => {
    const fa = faceAt(hit.obj, hit.p, hit.n); if (!fa || !prev) return null;
    const c = P.charts[fa.f.id]; if (!c) return null;
    const i = Math.min(c.cw - 1, Math.max(0, Math.floor(fa.s / fa.f.w * c.cw))), j = Math.min(c.ch - 1, Math.max(0, Math.floor(fa.t / fa.f.h * c.ch)));
    const k = ((c.y + j) * S + c.x + i) * 3, E = prev[c.page];
    return { E: [E[k], E[k + 1], E[k + 2]], albedo: fa.f.albedo };
  };
  function texel(face, c, i, j) {
    const s = (i + 0.5) / c.cw * face.w, t = (j + 0.5) / c.ch * face.h;
    const p = add(add(face.o, mul(face.u, s)), add(mul(face.v, t), mul(face.n, 2e-3)));
    const D = directAt(p, face.n);
    let sky = [0, 0, 0], ind = [0, 0, 0];
    const envN = pass === 0 ? bake.env : 0;
    for (let k = 0; k < envN; k++) { const d = cosineDir(face.n, rand(), rand()); rays++; if (!rayBoxes(boxes, p, d)) sky = add(sky, skyL(d)); }
    if (envN) sky = mul(sky, Math.PI / envN);
    if (pass > 0) {
      for (let k = 0; k < bake.indirect; k++) {
        const d = cosineDir(face.n, rand(), rand()); rays++;
        const h = rayBoxes(boxes, p, d); if (!h) continue;
        const L = lookup(h); if (L) ind = add(ind, [L.albedo[0] * L.E[0] / Math.PI, L.albedo[1] * L.E[1] / Math.PI, L.albedo[2] * L.E[2] / Math.PI]);
        else { const a = ALB[h.obj.toLowerCase()] || [0.5, 0.5, 0.5]; ind = add(ind, mul(a, 0.3)); }
      }
      ind = mul(ind, Math.PI / bake.indirect);
    }
    return { D, sky, ind };
  }
  function run(budget = 200000) {
    const start = rays;
    while (pass < passes && rays - start < budget) {
      if (ci >= list.length) {
        // end of a pass: E = direct + sky + indirect; the next pass bounces it
        prev = pages.map(pg => { const E = new Float32Array(S * S * 3); for (let q = 0; q < E.length; q++) E[q] = pg.D[q] + (pg.sky ? pg.sky[q] : 0) + pg.I[q]; return E; });
        pass++; ci = 0; row = 0; continue;
      }
      const [id, c] = list[ci], face = FACES[id], pg = pages[c.page];
      for (let i = 0; i < c.cw; i++) {
        const r = texel(face, c, i, row), k = ((c.y + row) * S + c.x + i) * 3;
        if (pass === 0) { pg.sky = pg.sky || new Float32Array(S * S * 3); for (let q = 0; q < 3; q++) { pg.D[k + q] = r.D[q]; pg.sky[k + q] = r.sky[q]; pg.I[k + q] = 0; } pg.mask[(c.y + row) * S + c.x + i] = 1; }
        else for (let q = 0; q < 3; q++) pg.I[k + q] = r.ind[q];
      }
      row++; if (row >= c.ch) { row = 0; ci++; }
    }
    return pass >= passes;
  }
  const totalRays = () => estimateRays(P.texels, bake);
  function progress() { const perPass = list.reduce((a, [, c]) => a + c.cw * c.ch, 0); let done = 0; for (let k = 0; k < ci; k++) done += list[k][1].cw * list[k][1].ch; if (ci < list.length) done += row * list[ci][1].cw; return Math.min(1, (pass * perPass + done) / (passes * perPass)); }
  // Final lightmap: direct (sharp) + sky + filtered indirect, sun removed for Mixed · Baked Indirect, then dilated into the padding.
  function result() {
    return pages.map(pg => {
      const Iraw = new Float32Array(S * S * 3); for (let q = 0; q < Iraw.length; q++) Iraw[q] = pg.I[q] + (pg.sky ? pg.sky[q] : 0);
      const If = filterIndirect(Iraw, pg.mask, S, bake.filter, P.charts), out = new Float32Array(S * S * 3);
      for (let q = 0; q < out.length; q++) out[q] = (mode === 'indirect' ? 0 : pg.D[q]) + If[q];
      return dilate(out, pg.mask, S, bake.padding);
    });
  }
  return { run, progress, result, pack: P, rays: () => rays, totalRays };
}
export const estimateRays = (texels, bake) => texels * (bake.env + bake.indirect * bake.bounces + 1);
// Noise of the sky light alone (environment samples), before filtering.
export const envNoise = bake => 1 / Math.sqrt(bake.env);
// Noise left in the indirect light (relative): Monte Carlo falls with √samples, the filters remove most of the rest.
export function noiseLevel(bake) { const raw = bake.bounces ? 1 / Math.sqrt(bake.indirect) : 1 / Math.sqrt(bake.env) * 0.6; const k = { none: 1, gaussian: 0.45, denoiser: 0.15 }[bake.filter] ?? 1; return raw * k; }
function filterIndirect(I, mask, S, filter, charts) {
  if (filter === 'none') return I;
  const r = filter === 'gaussian' ? 1 : 3, out = new Float32Array(I.length);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!mask[y * S + x]) continue;
    let a = [0, 0, 0], w = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S || !mask[yy * S + xx]) continue;
      const g = Math.exp(-(dx * dx + dy * dy) / (2 * (r * 0.6 + 0.4) ** 2)), k = (yy * S + xx) * 3; a[0] += I[k] * g; a[1] += I[k + 1] * g; a[2] += I[k + 2] * g; w += g;
    }
    const k = (y * S + x) * 3; out[k] = a[0] / w; out[k + 1] = a[1] / w; out[k + 2] = a[2] / w;
  }
  void charts; return out;
}
// Copy the edge texels of every chart into its padding, as Unity's dilation does (bilinear filtering then reads no black).
function dilate(E, mask, S, padding) {
  const m = new Uint8Array(mask);
  for (let it = 0; it < Math.max(1, padding); it++) {
    const add1 = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (m[y * S + x]) continue;
      let a = [0, 0, 0], n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S || !m[yy * S + xx]) continue; const k = (yy * S + xx) * 3; a[0] += E[k]; a[1] += E[k + 1]; a[2] += E[k + 2]; n++; }
      if (n) add1.push([y * S + x, a[0] / n, a[1] / n, a[2] / n]);
    }
    for (const [p, r, g, b] of add1) { E[p * 3] = r; E[p * 3 + 1] = g; E[p * 3 + 2] = b; m[p] = 1; }
  }
  return E;
}

// ─── Light probes ────────────────────────────────────────────────────────────
// Average irradiance around a point (what a probe stores as its L0 term), from sky, sun and baked surfaces.
const SPHERE = (() => { const out = [], N = 256, g = Math.PI * (3 - Math.sqrt(5)); for (let k = 0; k < N; k++) { const z = 1 - 2 * (k + 0.5) / N, s = Math.sqrt(1 - z * z), a = g * k; out.push([s * Math.cos(a), z, s * Math.sin(a)]); } return out; })();
export function probeAt(p, renderers, lm) {
  const boxes = sceneBoxes(renderers); let L = [0, 0, 0];
  for (const d of SPHERE) {
    const h = rayBoxes(boxes, p, d);
    if (!h) { L = add(L, skyL(d)); continue; }
    const fa = faceAt(h.obj, h.p, h.n);
    let E = null;
    if (fa && lm) { const c = lm.pack.charts[fa.f.id]; if (c) { const S = lm.pack.size, i = Math.min(c.cw - 1, Math.floor(fa.s / fa.f.w * c.cw)), j = Math.min(c.ch - 1, Math.floor(fa.t / fa.f.h * c.ch)), k = ((c.y + j) * S + c.x + i) * 3, Em = lm.maps[c.page]; E = [Em[k], Em[k + 1], Em[k + 2]]; } }
    const a = fa ? fa.f.albedo : (ALB[h.obj.toLowerCase()] || [0.5, 0.5, 0.5]);
    if (!E) E = [0.6, 0.6, 0.6];
    L = add(L, [a[0] * E[0] / Math.PI, a[1] * E[1] / Math.PI, a[2] * E[2] / Math.PI]);
  }
  L = mul(L, 1 / SPHERE.length);
  // add the sun as seen by a sphere (quarter of the normal irradiance) when it is visible
  const sunVis = visible(boxes, p, SUN.dir) ? 0.25 : 0;
  return { amb: mul(L, Math.PI), sun: sunVis };
}
// Blend the nearest probes (inverse square distance of up to 4), as a stand-in for Unity's tetrahedra.
export function blendProbes(p, probes) {
  if (!probes.length) return null;
  const near = probes.map(pr => ({ pr, d: Math.hypot(pr.p[0] - p[0], pr.p[1] - p[1], pr.p[2] - p[2]) })).sort((a, b) => a.d - b.d).slice(0, 4);
  if (near[0].d < 1e-4) return near[0].pr.v;
  let w = 0, amb = [0, 0, 0];
  for (const { pr, d } of near) { const k = 1 / (d * d); w += k; amb = add(amb, mul(pr.v.amb, k)); }
  return { amb: mul(amb, 1 / w) };
}
// The walk of the character (a loop through the sun patch, the pillar's shadow and the dark corner).
export const PATH = Array.from({ length: 24 }, (_, k) => { const a = k / 24 * Math.PI * 2; return [Math.cos(a) * 3.2, 0.9, Math.sin(a) * 2.2]; });
// Ambient light a dynamic object gets without any probe: the skybox's ambient probe.
export const AMBIENT_PROBE = (() => { let L = [0, 0, 0]; for (const d of SPHERE) L = add(L, skyL(d)); return mul(L, Math.PI / SPHERE.length); })();
// Adaptive Probe Volumes: a regular grid of probes (bricks) filling the room at the minimum spacing.
export function apvProbes(spacing) {
  const out = [], s = spacing, nx = Math.max(1, Math.round(8 / s)), nz = Math.max(1, Math.round(6 / s)), ny = Math.max(1, Math.round(3 / s));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) out.push([-3.85 + 7.7 * i / nx, 0.15 + 2.7 * j / ny, -2.85 + 5.7 * k / nz]);
  return out;
}

// ─── FBX export and import settings ──────────────────────────────────────────
export const FBX_RIGHT = { selected: true, types: 'mesh', applyScalings: 'FBX Units Scale', forward: '-Z Forward', up: 'Y Up', applyUnit: true, smoothing: 'Face', modifiers: true, uvOrder: 'uv-lightmap', scaleApplied: true, unityScale: 1, convertUnits: true, genLightmapUVs: false };
// What goes wrong with each setting (for the preview and the readout).
export function fbxReport(f) {
  const issues = [];
  if (!f.scaleApplied) issues.push('scale');
  if (f.applyScalings === 'All Local' && f.convertUnits) issues.push('size100');
  if (f.forward !== '-Z Forward' || f.up !== 'Y Up') issues.push('axes');
  if (!f.bakeAxis && !f.applyTransform) issues.push('rot90');
  if (f.uvOrder !== 'uv-lightmap') issues.push('uvorder');
  if (f.genLightmapUVs) issues.push('overwrite');
  if (!f.modifiers) issues.push('modifiers');
  if (f.smoothing !== 'Face') issues.push('smoothing');
  if (f.types !== 'mesh') issues.push('types');
  return issues;
}

// ─── A single prop for the UV steps: the crate outdoors ──────────────────────
export const PROP = { mn: [-0.4, 0, -0.4], mx: [0.4, 0.8, 0.4], albedo: ALB.crate };
export const PROP_FACES = boxFaces('Prop', PROP.mn, PROP.mx, ALB.crate);
const PROP_BOXES = [{ mn: PROP.mn, mx: PROP.mx, obj: 'Prop' }, { mn: [-20, -1, -20], mx: [20, 0, 20], obj: 'Ground' }];
// UV rectangles [u0, v0, u1, v1] of the five faces: UV0 (the texture map: every face on the whole square, as a tiling texture)
// or UV1 (Blender's Lightmap Pack: a 3 × 2 grid with a margin between the islands).
export function propLayout(channel, margin = 0) {
  if (channel === 'uv0') return PROP_FACES.map(() => [0, 0, 1, 1]);
  const cols = 3, rows = 2, cw = (1 - margin * (cols + 1)) / cols, ch = (1 - margin * (rows + 1)) / rows, c = Math.min(cw, ch);
  return PROP_FACES.map((f, k) => { const i = k % cols, j = Math.floor(k / cols), u0 = margin + i * (c + margin), v0 = margin + j * (c + margin); return [u0, v0, u0 + c, v0 + c]; });
}
// Size of the prop's lightmap region in texels (Unity scales the UV1 layout to the surface area × resolution).
export function propLightmapSize(res, channel, margin) {
  const L = propLayout(channel, margin), area = PROP_FACES.reduce((a, f) => a + f.w * f.h, 0);
  const cover = channel === 'uv0' ? 1 : L.reduce((a, r) => a + (r[2] - r[0]) * (r[3] - r[1]), 0);
  return Math.max(4, Math.ceil(Math.sqrt(area / cover) * res));
}
export const marginTexels = (res, margin) => margin * propLightmapSize(res, 'uv1', margin);
// Bake the prop into its own S × S lightmap through the chosen UV channel. Overlapping faces share texels (averaged).
export function bakeProp(channel, margin, res, samples = 24) {
  const S = propLightmapSize(res, channel, margin), L = propLayout(channel, margin), E = new Float32Array(S * S * 3), cnt = new Uint16Array(S * S), rand = rng(7);
  PROP_FACES.forEach((f, k) => {
    const [u0, v0, u1, v1] = L[k], x0 = Math.floor(u0 * S), x1 = Math.ceil(u1 * S), y0 = Math.floor(v0 * S), y1 = Math.ceil(v1 * S);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const uu = ((x + 0.5) / S - u0) / (u1 - u0), vv = ((y + 0.5) / S - v0) / (v1 - v0);
      if (uu < 0 || uu > 1 || vv < 0 || vv > 1) continue;
      const p = add(add(f.o, mul(f.u, uu * f.w)), add(mul(f.v, vv * f.h), mul(f.n, 2e-3)));
      const c = dot(f.n, SUN.dir); let e = c > 0 && !rayBoxes(PROP_BOXES, p, SUN.dir) ? mul(SUN.color, SUN.E * c) : [0, 0, 0];
      let sky = [0, 0, 0]; for (let s = 0; s < samples; s++) { const d = cosineDir(f.n, rand(), rand()); if (!rayBoxes(PROP_BOXES, p, d)) sky = add(sky, skyL(d)); else sky = add(sky, mul(ALB.floor, 0.9)); }
      e = add(e, mul(sky, Math.PI / samples));
      const q = y * S + x; E[q * 3] += e[0]; E[q * 3 + 1] += e[1]; E[q * 3 + 2] += e[2]; cnt[q]++;
    }
  });
  const mask = new Uint8Array(S * S);
  for (let q = 0; q < S * S; q++) if (cnt[q]) { E[q * 3] /= cnt[q]; E[q * 3 + 1] /= cnt[q]; E[q * 3 + 2] /= cnt[q]; mask[q] = 1; }
  dilate(E, mask, S, 2);
  return { S, E, layout: L, overlap: channel === 'uv0' };
}
