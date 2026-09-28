// Viewport Lab: the maths of a Blender-like 3D Viewport. Pure JS (tested with node).
// Blender coordinates: Z is up, the Front view looks along +Y.

// ─── Vectors ─────────────────────────────────────────────────────────────────
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

// ─── Rotations: quaternions [w, x, y, z] and Blender XYZ Euler (degrees) ───
export const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export function qAxis(axis, deg) { const n = norm(axis), h = deg * D2R / 2, s = Math.sin(h); return [Math.cos(h), n[0] * s, n[1] * s, n[2] * s]; }
export function qRotate(q, v) {
  const p = qMul(qMul(q, [0, v[0], v[1], v[2]]), [q[0], -q[1], -q[2], -q[3]]);
  return [p[1], p[2], p[3]];
}
// Blender's XYZ Euler: X is applied first, then Y, then Z (R = Rz · Ry · Rx).
export const eulerToQuat = e => qMul(qMul(qAxis(AXES.z, e[2]), qAxis(AXES.y, e[1])), qAxis(AXES.x, e[0]));
export function quatToEuler(q) {
  const [w, x, y, z] = q;
  const m00 = 1 - 2 * (y * y + z * z), m10 = 2 * (x * y + w * z), m20 = 2 * (x * z - w * y);
  const m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y), m01 = 2 * (x * y - w * z), m11 = 1 - 2 * (x * x + z * z);
  const sb = Math.max(-1, Math.min(1, -m20));
  if (Math.abs(sb) > 0.999999) return [Math.atan2(m01 * Math.sign(sb), m11) * R2D, Math.asin(sb) * R2D, 0]; // gimbal lock: Z folded into X
  return [Math.atan2(m21, m22) * R2D, Math.asin(sb) * R2D, Math.atan2(m10, m00) * R2D];
}
const wrapNear = (a, ref) => a + 360 * Math.round((ref - a) / 360);
// The Euler closest to a reference one (as Blender keeps rotations continuous).
export function compatibleEuler(e, ref) {
  const a = e.map((v, i) => wrapNear(v, ref[i]));
  const alt = [e[0] + 180, 180 - e[1], e[2] + 180].map((v, i) => wrapNear(v, ref[i]));
  const d = v => v.reduce((s, x, i) => s + Math.abs(x - ref[i]), 0);
  return d(alt) < d(a) - 1e-6 ? alt : a;
}
// Angle between two orientations, in degrees.
export function angleBetween(ea, eb) {
  const a = eulerToQuat(ea), b = eulerToQuat(eb);
  const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return 2 * Math.acos(d) * R2D;
}
const clean = v => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };

// ─── Objects ─────────────────────────────────────────────────────────────────
// Half size of each primitive at scale 1 (Blender's defaults: a 2 m cube, spheres of radius 1…).
export const HALF = {
  cube: [1, 1, 1], sphere: [1, 1, 1], cylinder: [1, 1, 1], cone: [1, 1, 1], plane: [1, 1, 0], torus: [1.25, 1.25, 0.25],
  arrow: [1, 0.35, 0.35], camera: [0.5, 0.35, 0.6], light: [0.25, 0.25, 0.25], empty: [0.5, 0.5, 0.5],
};
export const PRIMS = ['cube', 'sphere', 'cylinder', 'cone', 'plane', 'torus'];
export function makeObj(name, kind, o = {}) {
  return { name, kind, loc: o.loc ? [...o.loc] : [0, 0, 0], rot: o.rot ? [...o.rot] : [0, 0, 0], scale: o.scale ? [...o.scale] : [1, 1, 1], ...(o.mark ? { mark: o.mark } : {}), ...(o.lock ? { lock: true } : {}), ...(o.hide ? { hide: true } : {}) };
}
export const cloneObjs = objs => objs.map(o => ({ ...o, loc: [...o.loc], rot: [...o.rot], scale: [...o.scale] }));
export function corners(o) {
  const h = HALF[o.kind] || HALF.cube, q = eulerToQuat(o.rot), out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(add(o.loc, qRotate(q, [sx * h[0] * o.scale[0], sy * h[1] * o.scale[1], sz * h[2] * o.scale[2]])));
  return out;
}
export function boundsOf(objs) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const o of objs) for (const c of corners(o)) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]); }
  if (!objs.length) return { center: [0, 0, 0], radius: 1 };
  const center = mul(add(lo, hi), 0.5); return { center, radius: Math.max(0.1, len(sub(hi, lo)) / 2) };
}
// Dimensions shown in the N panel (the size of the object's box, scale included).
export const dimsOf = o => (HALF[o.kind] || HALF.cube).map((h, i) => clean(2 * h * Math.abs(o.scale[i])));
export const medianOf = objs => objs.length ? mul(objs.reduce((s, o) => add(s, o.loc), [0, 0, 0]), 1 / objs.length) : [0, 0, 0];

// ─── The view (turntable, like Blender's default Orbit Method) ──────────────
export const FOV = 39.6; // lens 50 mm on the viewport's 36 mm sensor, on the larger side
export function defaultView() { return { target: [0, 0, 0], dist: 17, az: -62, el: 26, ortho: false, auto: false, axis: null }; }
export function basisOf(v) {
  const a = v.az * D2R, e = v.el * D2R;
  const off = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
  const f = mul(off, -1), r = [-Math.sin(a), Math.cos(a), 0], u = cross(r, f);
  return { eye: add(v.target, mul(off, v.dist)), f, r, u };
}
// Vertical field of view for a viewport of this aspect (the fov fits the larger side).
export function vfov(aspect) { const t = Math.tan(FOV * D2R / 2); return aspect >= 1 ? 2 * Math.atan(t / aspect) * R2D : FOV; }
// Height of the view in world units at a given depth (ortho: constant, as big as the perspective at the target).
export function viewHeight(v, aspect, depth) { const t = Math.tan(vfov(aspect) * D2R / 2); return 2 * t * (v.ortho ? v.dist : Math.max(0.01, depth)); }
export function project(v, p, W, H) {
  const b = basisOf(v), d = sub(p, b.eye), z = dot(d, b.f), h = viewHeight(v, W / H, z);
  const x = dot(d, b.r) / (h / 2) / (W / H), y = dot(d, b.u) / (h / 2);
  return { x: (x + 1) / 2 * W, y: (1 - y) / 2 * H, depth: z, ndc: [x, y] };
}
export function rayAt(v, px, py, W, H) {
  const b = basisOf(v), nx = (px / W) * 2 - 1, ny = 1 - (py / H) * 2, aspect = W / H;
  if (v.ortho) {
    const h = viewHeight(v, aspect, v.dist);
    const o = add(add(b.eye, mul(b.r, nx * h / 2 * aspect)), mul(b.u, ny * h / 2));
    return { o: sub(o, mul(b.f, 100)), d: b.f };
  }
  const t = Math.tan(vfov(aspect) * D2R / 2);
  return { o: b.eye, d: norm(add(add(b.f, mul(b.r, nx * t * aspect)), mul(b.u, ny * t))) };
}
// World units per pixel at the depth of a point.
export function unitsPerPx(v, p, W, H) { const b = basisOf(v); return viewHeight(v, W / H, dot(sub(p, b.eye), b.f)) / H; }

// Axis views (numpad). Auto Perspective turns them orthographic.
export const VIEWS = {
  front: { az: -90, el: 0, key: 'Numpad 1', label: 'Front' }, back: { az: 90, el: 0, key: 'Ctrl Numpad 1', label: 'Back' },
  right: { az: 0, el: 0, key: 'Numpad 3', label: 'Right' }, left: { az: 180, el: 0, key: 'Ctrl Numpad 3', label: 'Left' },
  top: { az: -90, el: 90, key: 'Numpad 7', label: 'Top' }, bottom: { az: -90, el: -90, key: 'Ctrl Numpad 7', label: 'Bottom' },
};
export function setAxisView(v, name, autoPersp = true) {
  const p = VIEWS[name]; if (!p) return v;
  const ortho = autoPersp ? true : v.ortho;
  return { ...v, az: p.az, el: p.el, axis: name, auto: autoPersp && !v.ortho ? true : v.auto && v.ortho, ortho };
}
export function orbit(v, dAz, dEl) {
  let el = v.el + dEl; if (el > 180) el -= 360; if (el < -180) el += 360;
  const leaveAuto = v.axis && v.auto;
  return { ...v, az: ((v.az + dAz + 540) % 360) - 180, el, axis: null, ortho: leaveAuto ? false : v.ortho, auto: leaveAuto ? false : v.auto };
}
export function pan(v, dxPx, dyPx, W, H) {
  const b = basisOf(v), upp = viewHeight(v, W / H, v.dist) / H;
  return { ...v, target: add(v.target, add(mul(b.r, -dxPx * upp), mul(b.u, dyPx * upp))) };
}
export const zoom = (v, factor) => ({ ...v, dist: Math.max(0.05, Math.min(2000, v.dist * factor)) });
export function frame(v, objs, aspect) {
  const { center, radius } = boundsOf(objs), t = Math.tan(Math.min(vfov(aspect), aspect >= 1 ? FOV : vfov(aspect)) * D2R / 2);
  return { ...v, target: center, dist: Math.max(0.5, radius / t * 1.08) };
}
export function viewName(v) {
  const kind = v.ortho ? 'Orthographic' : 'Perspective';
  return v.axis ? `${VIEWS[v.axis].label} ${kind}` : `User ${kind}`;
}
// Which way a face of an object looks, in world space.
export const faceNormal = (o, n) => norm(qRotate(eulerToQuat(o.rot), n));
// Is a face turned towards the camera? (the eye sees it from in front)
export function faceSeen(v, o, n, W = 16, H = 9) {
  const nn = faceNormal(o, n), h = HALF[o.kind] || HALF.cube;
  const c = add(o.loc, qRotate(eulerToQuat(o.rot), n.map((k, i) => k * h[i] * o.scale[i])));
  const b = basisOf(v), toEye = v.ortho ? mul(b.f, -1) : norm(sub(b.eye, c));
  if (dot(nn, toEye) < 0.7) return false;
  if (!v.ortho && dot(sub(c, b.eye), b.f) <= 0) return false;
  const p = project(v, c, W, H); return Math.abs(p.ndc[0]) < 1 && Math.abs(p.ndc[1]) < 1;
}
// Size and place of a sphere on screen: centre in NDC and radius as a share of the view height.
export function sphereOnScreen(v, o, W, H) {
  const p = project(v, o.loc, W, H), r = Math.max(...o.scale.map(Math.abs)) * (HALF[o.kind] || HALF.sphere)[0];
  if (p.depth <= 0 && !v.ortho) return { off: Infinity, size: 0 };
  const h = viewHeight(v, W / H, p.depth);
  return { off: Math.hypot(p.ndc[0] * W / H, p.ndc[1]), size: 2 * r / h };
}

// ─── Modal transforms (G, R, S) ─────────────────────────────────────────────
// Parse the numbers typed during a transform ("2", "-1.5", ".5"). null when nothing useful is typed.
export function parseTyped(s) {
  if (s == null || s === '' || s === '-' || s === '.' || s === '-.') return null;
  const v = Number(s); return Number.isFinite(v) ? v : null;
}
// Append a key to the typed text, as Blender's numeric input does.
export function typeKey(s, k) {
  s = s || '';
  if (k === 'Backspace') return s.slice(0, -1);
  if (k === '-') return s.startsWith('-') ? s.slice(1) : '-' + s;
  if (k === '.') return s.includes('.') ? s : s + (s === '' || s === '-' ? '0.' : '.');
  if (/^[0-9]$/.test(k)) return s + k;
  return s;
}
function closestOnAxis(p0, a, ro, rd) {
  // Parameter t of the point p0 + a t closest to the ray ro + rd s.
  const w = sub(p0, ro), b = dot(a, rd), d = dot(a, w), e = dot(rd, w), den = 1 - b * b;
  if (den < 1e-4) return null; return (b * e - d) / den;
}
function planeHit(p0, n, ro, rd) { const den = dot(n, rd); if (Math.abs(den) < 1e-4) return null; const t = dot(sub(p0, ro), n) / den; return add(ro, mul(rd, t)); }
const LOCAL_I = { x: 0, y: 1, z: 2 };
// The world direction of the constraint axis (global, or local to the active object).
export function axisVec(axis, orient, active) {
  const a = AXES[axis]; return orient === 'local' && active ? norm(qRotate(eulerToQuat(active.rot), a)) : a;
}
const snapTo = (x, step) => Math.round(x / step) * step;

// m: { type, axis, plane, orient, start:[px,py], cur:[px,py], angle (deg, unwrapped, for rotate), typed, snap, fine }
// objs0: the selected objects before the transform; returns { objs, info }.
export function applyModal(m, objs0, active0, v, W, H) {
  const pivot = medianOf(objs0), typed = parseTyped(m.typed);
  const pp = project(v, pivot, W, H), aVec = m.customAxis ? norm(m.customAxis) : m.axis ? axisVec(m.axis, m.orient, active0) : null;
  const along = m.customAxis ? (m.axisLabel || 'normal') : m.axis ? `${m.orient === 'local' ? 'local' : 'global'} ${m.axis.toUpperCase()}` : '';
  const out = cloneObjs(objs0);
  if (m.type === 'move') {
    let d = [0, 0, 0];
    if (typed != null) d = aVec && !m.plane ? mul(aVec, typed) : [typed, 0, 0];
    else if (aVec && !m.plane) {
      const r0 = rayAt(v, m.start[0], m.start[1], W, H), r1 = rayAt(v, m.cur[0], m.cur[1], W, H);
      const t0 = closestOnAxis(pivot, aVec, r0.o, r0.d), t1 = closestOnAxis(pivot, aVec, r1.o, r1.d);
      let t;
      if (t0 == null || t1 == null) { const s = project(v, add(pivot, aVec), W, H), sx = s.x - pp.x, sy = s.y - pp.y, l2 = sx * sx + sy * sy || 1; t = ((m.cur[0] - m.start[0]) * sx + (m.cur[1] - m.start[1]) * sy) / l2; }
      else t = t1 - t0;
      if (m.snap) t = snapTo(t, m.fine ? 0.1 : 1);
      d = mul(aVec, t);
    } else if (aVec && m.plane) {
      const r0 = rayAt(v, m.start[0], m.start[1], W, H), r1 = rayAt(v, m.cur[0], m.cur[1], W, H);
      const h0 = planeHit(pivot, aVec, r0.o, r0.d), h1 = planeHit(pivot, aVec, r1.o, r1.d);
      if (h0 && h1) d = sub(h1, h0);
      if (m.snap) d = d.map(x => snapTo(x, m.fine ? 0.1 : 1));
    } else {
      const b = basisOf(v), upp = unitsPerPx(v, pivot, W, H);
      d = add(mul(b.r, (m.cur[0] - m.start[0]) * upp), mul(b.u, -(m.cur[1] - m.start[1]) * upp));
      if (m.snap) d = d.map(x => snapTo(x, m.fine ? 0.1 : 1));
    }
    for (const o of out) o.loc = add(o.loc, d);
    const L = len(d);
    const info = aVec && !m.plane ? { kind: 'move', text: `D: ${fmt(dot(d, aVec))} m (${fmt(L)} m) along ${along}` }
      : { kind: 'move', text: `Dx: ${fmt(d[0])} m  Dy: ${fmt(d[1])} m  Dz: ${fmt(d[2])} m (${fmt(L)} m)${m.plane ? ` locking ${along}` : ''}` };
    return { objs: out, info, delta: d };
  }
  if (m.type === 'rotate') {
    const b = basisOf(v), toViewer = mul(b.f, -1);
    let axis = aVec || toViewer, ang;
    if (typed != null) ang = typed;
    else { ang = m.angle || 0; if (aVec && dot(aVec, toViewer) < 0) ang = -ang; if (m.snap) ang = snapTo(ang, m.fine ? 1 : 5); }
    const q = qAxis(axis, ang);
    for (let i = 0; i < out.length; i++) {
      const o = out[i], o0 = objs0[i];
      o.loc = add(pivot, qRotate(q, sub(o0.loc, pivot)));
      const onlyG = aVec && !m.customAxis && m.orient !== 'local' && m.axis === 'z';
      const onlyL = aVec && !m.customAxis && m.orient === 'local' && m.axis === 'x' && active0 && o0.name === active0.name;
      if (onlyG) o.rot = [o0.rot[0], o0.rot[1], o0.rot[2] + ang];
      else if (onlyL) o.rot = [o0.rot[0] + ang, o0.rot[1], o0.rot[2]];
      else {
        const e = quatToEuler(qMul(q, eulerToQuat(o0.rot)));
        // Keep single-axis rotations continuous (R X 200 shows 200°, not -160°).
        const guess = [...o0.rot]; if (aVec && !m.customAxis && m.orient !== 'local') guess[LOCAL_I[m.axis]] += ang;
        o.rot = compatibleEuler(e, guess);
      }
      o.rot = o.rot.map(clean);
    }
    return { objs: out, info: { kind: 'rotate', text: `Rot: ${fmt(ang)}°${aVec ? ` along ${along}` : ''}` }, angle: ang };
  }
  // scale
  let f;
  if (typed != null) f = typed;
  else {
    const d0 = Math.hypot(m.start[0] - pp.x, m.start[1] - pp.y) || 1, d1 = Math.hypot(m.cur[0] - pp.x, m.cur[1] - pp.y);
    f = d1 / d0; if (m.snap) f = snapTo(f, m.fine ? 0.01 : 0.1);
  }
  for (let i = 0; i < out.length; i++) {
    const o = out[i], o0 = objs0[i];
    let fv = [f, f, f];
    if (aVec) {
      // Which local axis of this object lies along the constraint axis?
      const q = eulerToQuat(o0.rot), loc = [0, 1, 2].map(k => Math.abs(dot(qRotate(q, AXES['xyz'[k]]), aVec)));
      const k = loc.indexOf(Math.max(...loc));
      fv = m.plane ? [f, f, f].map((x, j) => j === k ? 1 : x) : [1, 1, 1].map((x, j) => j === k ? f : 1);
      const rel = sub(o0.loc, pivot), along = dot(rel, aVec), dl = m.plane ? sub(mul(rel, f), mul(aVec, along * (f - 1))) : add(rel, mul(aVec, along * (f - 1)));
      o.loc = add(pivot, dl);
    } else o.loc = add(pivot, mul(sub(o0.loc, pivot), f));
    o.scale = o0.scale.map((s, j) => clean(s * fv[j]));
  }
  const label = aVec ? (m.plane ? `Scale: ${fmt(f)} (locking ${along})` : `Scale: ${fmt(f)} along ${along}`) : `Scale: ${fmt(f)} ${fmt(f)} ${fmt(f)}`;
  return { objs: out, info: { kind: 'scale', text: label }, factor: f };
}
export function fmt(x) { const r = Math.round(x * 10000) / 10000; return (Object.is(r, -0) ? 0 : r).toString(); }

// ─── Selection (the rules of a Shift-click in Object Mode) ──────────────────
// sel: array of names, active: name or null. Returns the new { sel, active }.
export function clickSelect(sel, active, name, extend) {
  if (!name) return extend ? { sel, active } : { sel: [], active };
  if (!extend) return { sel: [name], active: name };
  if (!sel.includes(name)) return { sel: [...sel, name], active: name };
  if (active !== name) return { sel, active: name };
  return { sel: sel.filter(n => n !== name), active: name };
}
export function boxSelect(sel, active, inside, mode) {
  if (mode === 'sub') return { sel: sel.filter(n => !inside.includes(n)), active };
  if (mode === 'set') return { sel: [...inside], active: inside.includes(active) ? active : active };
  return { sel: [...new Set([...sel, ...inside])], active };
}

// ─── Matching a silhouette ──────────────────────────────────────────────────
export function matchReport(o, g, tol = {}) {
  const dl = len(sub(o.loc, g.loc)), dr = angleBetween(o.rot, g.rot), ds = Math.max(...o.scale.map((s, i) => Math.abs(s - g.scale[i])));
  const tl = tol.loc ?? 0.1, trr = tol.rot ?? 5, ts = tol.scale ?? 0.05;
  return { dl, dr, ds, ok: dl <= tl && dr <= trr && ds <= ts };
}
