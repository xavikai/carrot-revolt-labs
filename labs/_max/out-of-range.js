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

// Thumbnails for the dialog, drawn as in Max's Param Curve Out-of-Range Types window
// (viewBox 0 0 70 46; the keyed range is between the two white lines at x = 24 and x = 46).
export const OOR_RANGE = [24, 46];
export const OOR_ICON = {
  constant: 'M2 30H24C30 30 31 12 35 12S40 30 46 30H68',
  cycle: 'M2 34C9 34 14 12 24 12V34C31 34 36 12 46 12V34C53 34 58 12 68 12',
  loop: 'M2 34C7 34 8 12 13 12S19 34 24 34C29 34 30 12 35 12S41 34 46 34C51 34 52 12 57 12S63 34 68 34',
  pingpong: 'M2 12C13 12 13 34 24 34S35 12 46 12 57 34 68 34',
  linear: 'M2 42 24 32C31 29 38 18 46 14L68 4',
  relative: 'M2 40C12 40 14 31 24 31S36 22 46 22 58 12 68 12',
};
