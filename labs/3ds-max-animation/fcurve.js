// F-curves like Blender's Graph Editor. Pure logic: no DOM.
// A key: { frame, value, interp: 'BEZIER'|'LINEAR'|'CONSTANT', handle: 'AUTO_CLAMPED'|'AUTO'|'VECTOR'|'ALIGNED'|'FREE',
//          left: { frame, value }, right: { frame, value }, select }
// The interpolation of a key applies to the segment that starts at that key (as in Blender).

export const INTERPOLATIONS = ['CONSTANT', 'LINEAR', 'BEZIER'];
export const HANDLE_TYPES = ['FREE', 'ALIGNED', 'VECTOR', 'AUTO', 'AUTO_CLAMPED'];
const AUTO_TYPES = new Set(['AUTO', 'AUTO_CLAMPED', 'VECTOR']);

export function key(frame, value, interp = 'BEZIER', handle = 'AUTO_CLAMPED') {
  return { frame, value, interp, handle, left: { frame, value }, right: { frame, value }, select: false };
}
export const cloneKeys = keys => keys.map(k => ({ ...k, left: { ...k.left }, right: { ...k.right } }));

// Automatic handles, recalculated whenever keys move (Blender recalculates AUTO, AUTO_CLAMPED and VECTOR handles).
export function recalcHandles(keys) {
  keys.sort((a, b) => a.frame - b.frame);
  keys.forEach((k, i) => {
    const prev = keys[i - 1], next = keys[i + 1];
    const dl = prev ? (k.frame - prev.frame) / 3 : next ? (next.frame - k.frame) / 3 : 1;
    const dr = next ? (next.frame - k.frame) / 3 : dl;
    if (k.handle === 'VECTOR') {
      k.left = prev ? { frame: k.frame - dl, value: k.value + (prev.value - k.value) / 3 } : { frame: k.frame - dl, value: k.value };
      k.right = next ? { frame: k.frame + dr, value: k.value + (next.value - k.value) / 3 } : { frame: k.frame + dr, value: k.value };
      return;
    }
    if (k.handle === 'AUTO' || k.handle === 'AUTO_CLAMPED') {
      let slope = 0, extreme = false;
      if (prev && next) slope = (next.value - prev.value) / (next.frame - prev.frame);
      else if (k.handle === 'AUTO' && (prev || next)) { const o = prev || next; slope = (o.value - k.value) / (o.frame - k.frame); }
      if (k.handle === 'AUTO_CLAMPED' && prev && next) {
        extreme = (k.value >= prev.value && k.value >= next.value) || (k.value <= prev.value && k.value <= next.value);
        if (extreme) slope = 0;
      }
      k.left = { frame: k.frame - dl, value: k.value - slope * dl };
      k.right = { frame: k.frame + dr, value: k.value + slope * dr };
      if (k.handle === 'AUTO_CLAMPED' && prev && next && !extreme) { // no overshoot past the neighbours
        const lo = Math.min(prev.value, next.value), hi = Math.max(prev.value, next.value);
        for (const h of [k.left, k.right]) h.value = Math.max(lo, Math.min(hi, h.value));
      }
    }
  });
  return keys;
}

// Moves a key (and its handles with it) to a new frame and value.
export function moveKey(k, frame, value) {
  const df = frame - k.frame, dv = value - k.value;
  k.frame = frame; k.value = value;
  k.left = { frame: k.left.frame + df, value: k.left.value + dv };
  k.right = { frame: k.right.frame + df, value: k.right.value + dv };
}

// Dragging one handle: automatic handles become Aligned, like in Blender.
export function moveHandle(k, side, frame, value) {
  const h = side === 'left' ? 'left' : 'right', o = side === 'left' ? 'right' : 'left';
  // A handle can't cross its key in time.
  frame = side === 'left' ? Math.min(frame, k.frame - 0.01) : Math.max(frame, k.frame + 0.01);
  if (AUTO_TYPES.has(k.handle)) k.handle = 'ALIGNED';
  k[h] = { frame, value };
  if (k.handle === 'ALIGNED') {
    const len = Math.hypot(k[o].frame - k.frame, k[o].value - k.value) || 1;
    const dx = k.frame - frame, dy = k.value - value, d = Math.hypot(dx, dy) || 1;
    k[o] = { frame: k.frame + dx / d * len, value: k.value + dy / d * len };
  }
}

function bezierAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// Value of the curve at a (possibly fractional) frame. Before the first and after the last key the value stays constant.
export function evaluate(keys, frame) {
  if (!keys.length) return 0;
  if (frame <= keys[0].frame) return keys[0].value;
  const last = keys[keys.length - 1];
  if (frame >= last.frame) return last.value;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].frame <= frame) i++;
  const a = keys[i], b = keys[i + 1];
  if (a.interp === 'CONSTANT') return a.value;
  if (a.interp === 'LINEAR') return a.value + (b.value - a.value) * (frame - a.frame) / (b.frame - a.frame);
  // Bezier: handles are kept inside the segment in time (Blender does the same), so frame(t) always increases.
  const span = b.frame - a.frame;
  const x1 = Math.min(a.right.frame, a.frame + span), x2 = Math.max(b.left.frame, b.frame - span);
  let lo = 0, hi = 1, t = 0.5;
  for (let n = 0; n < 40; n++) {
    t = (lo + hi) / 2;
    const x = bezierAt(a.frame, Math.max(a.frame, x1), Math.min(b.frame, x2), b.frame, t);
    if (x < frame) lo = t; else hi = t;
  }
  return bezierAt(a.value, a.right.value, b.left.value, b.value, t);
}

// ─── Analysis used by the guided steps ───────────────────────────────────────
export const CONTACT = 0.05;
export function contacts(keys) { return keys.filter(k => k.value <= CONTACT).map(k => k.frame); }
export function tops(keys) {
  return keys.filter((k, i) => {
    const p = keys[i - 1], n = keys[i + 1];
    return k.value > CONTACT && (!p || k.value >= p.value) && (!n || k.value >= n.value);
  });
}
export const strictlyDecreasing = a => a.length >= 2 && a.every((v, i) => i === 0 || v < a[i - 1]);
export function intervals(frames) { return frames.slice(1).map((f, i) => f - frames[i]); }
// A contact is sharp when the curve comes down into it and goes up out of it (a V, not a U).
export function sharpContact(keys, k) {
  const i = keys.indexOf(k), prev = keys[i - 1], next = keys[i + 1];
  if (prev && prev.interp === 'BEZIER' && k.left.value <= k.value + 0.02) return false;
  if (next && k.interp === 'BEZIER' && k.right.value <= k.value + 0.02) return false;
  return true;
}
// Fraction of a bounce (between two contacts) spent above 80% of its peak: the "hang time".
export function hangTime(keys, from, to) {
  let peak = 0;
  for (let f = from; f <= to; f += 0.25) peak = Math.max(peak, evaluate(keys, f));
  if (peak <= CONTACT) return 0;
  let above = 0, n = 0;
  for (let f = from; f < to; f += 0.25) { n++; if (evaluate(keys, f) >= 0.8 * peak) above++; }
  return above / n;
}

// A real bounce for the same drop: parabolas that lose energy on every contact (restitution e).
export function physicsBounce({ start = 1, height = 4, fall = 12, e = 0.6, end = 72 } = {}) {
  const g = 2 * height / (fall * fall);
  const arcs = [];
  let t0 = start, v = 0, h = height, first = true;
  // First arc: only the fall.
  arcs.push({ from: start, to: start + fall, f: t => height - g * (t - start) ** 2 / 2 });
  t0 = start + fall; v = g * fall * e;
  while (v > 0.02 && t0 < end) {
    const dur = 2 * v / g, s = t0, vv = v;
    arcs.push({ from: s, to: s + dur, f: t => vv * (t - s) - g * (t - s) ** 2 / 2 });
    t0 += dur; v *= e; first = false;
  }
  return frame => {
    for (const a of arcs) if (frame >= a.from && frame <= a.to) return Math.max(0, a.f(frame));
    return 0;
  };
}
// How close a curve is to a reference, from 0 to 100.
export function matchScore(keys, ref, from, to, height = 4) {
  let err = 0, n = 0;
  for (let f = from; f <= to; f += 0.5) { err += Math.abs(evaluate(keys, f) - ref(f)); n++; }
  return Math.max(0, Math.round(100 * (1 - err / n / (height * 0.25))));
}
