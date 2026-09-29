// 3ds Max UI kit · Parameter Curve Out-of-Range Types
// What a curve does before its first key (in) and after its last key (out), as in Track View:
// Constant, Cycle, Loop, Ping Pong, Linear and Relative Repeat.
export const OOR_TYPES = [
  { id: 'constant', label: 'Constant' },
  { id: 'cycle', label: 'Cycle' },
  { id: 'loop', label: 'Loop' },
  { id: 'pingpong', label: 'Ping Pong' },
  { id: 'linear', label: 'Linear' },
  { id: 'relative', label: 'Relative Repeat' },
];
export const OOR_TEXT = {
  constant: 'Constant: holds the value of the first or last key.',
  cycle: 'Cycle: repeats the animation exactly; it jumps back to the first value at every repeat.',
  loop: 'Loop: repeats the animation and blends the end into the start, so the repeat has no jump.',
  pingpong: 'Ping Pong: plays the animation forwards, then backwards, and so on.',
  linear: 'Linear: continues in a straight line with the speed of the first or last key.',
  relative: 'Relative Repeat: repeats the animation and adds the change of each repeat, so it keeps going (a wheel that keeps turning).',
};
const mod = (a, n) => ((a % n) + n) % n;
const smooth = t => t * t * (3 - 2 * t);

// keys: sorted keys with .frame and .value; evaluate(frame) evaluates inside the range.
export function evalOutOfRange(keys, frame, evaluate, types = {}) {
  if (!keys?.length) return 0;
  const first = keys[0].frame, last = keys[keys.length - 1].frame, span = last - first;
  if (keys.length < 2 || span <= 0 || (frame >= first && frame <= last)) return evaluate(frame);
  const type = (frame > last ? types.out : types.in) || 'constant';
  const v0 = keys[0].value, v1 = keys[keys.length - 1].value;
  const cycles = Math.floor((frame - first) / span), local = first + mod(frame - first, span);
  switch (type) {
    case 'cycle': return evaluate(local);
    case 'loop': {
      // like Cycle, but the last part of every repeat eases into the first value
      const t = (local - first) / span, blend = 0.15;
      const v = evaluate(local);
      return t > 1 - blend ? v + (v0 - v1) * smooth((t - (1 - blend)) / blend) * (v1 !== v0 ? 1 : 0) : v;
    }
    case 'pingpong': return evaluate(mod(cycles, 2) ? last - (local - first) : local);
    case 'relative': return evaluate(local) + cycles * (v1 - v0);
    case 'linear': {
      const h = Math.min(0.5, span / 4);
      if (frame > last) return v1 + (v1 - evaluate(last - h)) / h * (frame - last);
      return v0 + (evaluate(first + h) - v0) / h * (frame - first);
    }
    default: return evaluate(frame);
  }
}

// Thumbnails for the dialog, drawn as in Max's Param Curve Out-of-Range Types window.
export const OOR_ICON = {
  constant: 'M2 30 H30 C40 30 44 8 56 8 H88',
  cycle: 'M2 30 C10 30 14 8 22 8 M22 30 C30 30 34 8 42 8 M42 30 C50 30 54 8 62 8 M62 30 C70 30 74 8 82 8',
  loop: 'M2 30 C10 30 14 8 22 8 C25 8 24 30 30 30 C38 30 42 8 50 8 C53 8 52 30 58 30 C66 30 70 8 78 8',
  pingpong: 'M2 30 C10 30 14 8 22 8 C30 8 34 30 42 30 C50 30 54 8 62 8 C70 8 74 30 82 30',
  linear: 'M2 38 L30 24 C40 20 46 12 58 9 L88 0',
  relative: 'M2 36 C8 36 10 28 16 28 C22 28 24 20 30 20 C36 20 38 12 44 12 C50 12 52 4 58 4',
};
