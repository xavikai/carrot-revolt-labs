import { key, recalcHandles, evaluate, moveKey, moveHandle } from '../3ds-max-animation/fcurve.js';

export const TRACKS = [
  { id: 'x', group: 'Position', name: 'X Position', color: '#ee6868', unit: 'm', min: -2, max: 12 },
  { id: 'z', group: 'Position', name: 'Z Position', color: '#6da8f4', unit: 'm', min: -2, max: 8 },
  { id: 'rotation', group: 'Rotation', name: 'Y Rotation', color: '#79ce85', unit: '°', min: -180, max: 1080 },
  { id: 'scale', group: 'Scale', name: 'Uniform Scale', color: '#77aaf0', unit: '×', min: 0, max: 3 },
];

let nextId = 1;
const newKey = (frame, value, interp = 'BEZIER') => Object.assign(key(frame, value, interp), { id: `k${nextId++}` });
const curve = (pairs, interp = 'BEZIER') => recalcHandles(pairs.map(([f, v]) => newKey(f, v, interp)));

export function createLesson(id) {
  const scene = {
    start: 0, end: id === 'loops' ? 80 : 60, fps: 30, speed: 1, out: 'constant',
    tracks: {
      x: curve([[0, 0], [30, 5], [60, 10]], id === 'curves' ? 'LINEAR' : 'BEZIER'),
      z: curve([[0, 0], [20, 3], [40, 0], [60, 0]]),
      rotation: curve([[0, 0], [20, 360]], 'LINEAR'),
      scale: curve([[0, 1], [20, 1], [40, 1], [60, 1]]),
    },
  };
  if (id === 'timeline') scene.tracks.x = curve([[0, 0], [60, 10]], 'LINEAR');
  if (id === 'dope') {
    scene.tracks.rotation = curve([[0, 0], [30, 90], [60, 180]], 'LINEAR');
    scene.tracks.scale = curve([[0, 1], [30, 1.5], [60, 1]], 'LINEAR');
  }
  if (id === 'loops') {
    scene.tracks.x = curve([[0, 0], [80, 0]]);
    scene.tracks.z = curve([[0, 0], [80, 0]]);
    scene.tracks.rotation = curve([[0, 0], [20, 360]], 'LINEAR');
    scene.tracks.scale = curve([[0, 1], [80, 1]]);
  }
  return scene;
}

export const track = (scene, id) => scene.tracks[id];
export const findKey = (scene, id) => Object.values(scene.tracks).flat().find(k => k.id === id);
export const trackForKey = (scene, id) => Object.keys(scene.tracks).find(t => scene.tracks[t].some(k => k.id === id));

export function setTimelineRange(scene, start, end) {
  start = Math.round(start); end = Math.round(end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 250 || start >= end) return false;
  scene.start = start; scene.end = end;
  return true;
}

export function panTimelineRange(scene, offset) {
  const span = scene.end - scene.start;
  const start = Math.max(0, Math.min(250 - span, scene.start + Math.round(offset)));
  return setTimelineRange(scene, start, start + span);
}

export function zoomTimelineRange(scene, factor, anchor = (scene.start + scene.end) / 2) {
  const span = Math.max(5, Math.min(250, Math.round((scene.end - scene.start) * factor)));
  const ratio = (anchor - scene.start) / (scene.end - scene.start);
  const start = Math.max(0, Math.min(250 - span, Math.round(anchor - ratio * span)));
  return setTimelineRange(scene, start, start + span);
}

export function fitTimelineRange(scene) {
  const frames = Object.values(scene.tracks).flat().map(k => k.frame);
  if (!frames.length) return false;
  return setTimelineRange(scene, Math.max(0, Math.min(...frames) - 3), Math.min(250, Math.max(...frames) + 3));
}

export function valueAt(scene, id, frame) {
  const keys = track(scene, id);
  if (!keys?.length) return id === 'scale' ? 1 : 0;
  if (id !== 'rotation' || scene.out === 'constant' || frame <= keys.at(-1).frame && frame >= keys[0].frame) return evaluate(keys, frame);
  const first = keys[0].frame, last = keys.at(-1).frame, span = last - first;
  if (span <= 0) return keys[0].value;
  const cycles = Math.floor((frame - first) / span);
  const local = frame - cycles * span;
  if (scene.out === 'pingpong') {
    const backwards = Math.abs(cycles % 2) === 1;
    return evaluate(keys, backwards ? last - (local - first) : local);
  }
  const v = evaluate(keys, local);
  return scene.out === 'loop' ? v + cycles * (keys.at(-1).value - keys[0].value) : v;
}

export function addKey(scene, id, frame, value) {
  const keys = track(scene, id), f = Math.round(frame);
  let k = keys.find(item => item.frame === f);
  if (k) moveKey(k, f, value);
  else { k = newKey(f, value); keys.push(k); }
  recalcHandles(keys);
  return k;
}

export function moveKeys(scene, ids, delta, duplicate = false) {
  delta = Math.round(delta);
  if (!delta) return false;
  const selected = new Set(ids), changes = [];
  for (const id of ids) {
    const t = trackForKey(scene, id), source = findKey(scene, id);
    if (!t || !source) return false;
    const target = source.frame + delta;
    if (target < 0 || target > 250 || track(scene, t).some(k => k.frame === target && (duplicate || !selected.has(k.id)))) return false;
    changes.push({ t, source, target });
  }
  if (changes.some((a, i) => changes.some((b, j) => i !== j && a.t === b.t && a.target === b.target))) return false;
  for (const { t, source, target } of changes) {
    if (duplicate) {
      const copy = structuredClone(source);
      copy.id = `k${nextId++}`;
      moveKey(copy, target, copy.value);
      track(scene, t).push(copy);
    } else moveKey(source, target, source.value);
  }
  for (const t of new Set(changes.map(c => c.t))) recalcHandles(track(scene, t));
  return true;
}

export function deleteKeys(scene, ids) {
  const selected = new Set(ids);
  for (const t of Object.keys(scene.tracks)) {
    scene.tracks[t] = scene.tracks[t].filter(k => !selected.has(k.id));
    recalcHandles(scene.tracks[t]);
  }
}

export function moveGraphKey(scene, id, frame, value) {
  const t = trackForKey(scene, id), k = findKey(scene, id);
  if (!k || !t) return false;
  frame = Math.round(Math.max(0, Math.min(250, frame)));
  if (track(scene, t).some(other => other !== k && other.frame === frame)) return false;
  moveKey(k, frame, value);
  recalcHandles(track(scene, t));
  return true;
}

// 3ds Max tangent types: Auto, Spline (custom handles), Fast, Slow, Step, Linear and Smooth.
// Also Break (handles move separately) and Unify (handles stay aligned).
export function setTangent(scene, ids, type) {
  for (const id of ids) {
    const t = trackForKey(scene, id), keys = t && track(scene, t), k = findKey(scene, id);
    if (!k) continue;
    const i = keys.indexOf(k), prev = keys[i - 1], next = keys[i + 1];
    // The interpolation of a segment belongs to the key that starts it: the previous key's out tangent.
    if (prev) prev.interp = type === 'step' ? 'CONSTANT' : type === 'linear' ? 'LINEAR' : prev.interp === 'CONSTANT' || prev.interp === 'LINEAR' ? 'BEZIER' : prev.interp;
    if (type === 'linear') { k.interp = 'LINEAR'; k.handle = 'VECTOR'; }
    else if (type === 'step') { k.interp = 'CONSTANT'; k.handle = 'VECTOR'; }
    else if (type === 'auto') { k.interp = 'BEZIER'; k.handle = 'AUTO_CLAMPED'; }
    else if (type === 'smooth') { k.interp = 'BEZIER'; k.handle = 'AUTO'; }
    else if (type === 'fast') { k.interp = 'BEZIER'; k.handle = 'VECTOR'; }
    else if (type === 'spline' || type === 'unify') { k.interp = 'BEZIER'; k.handle = 'ALIGNED'; }
    else if (type === 'break') { k.interp = 'BEZIER'; k.handle = 'FREE'; }
    else if (type === 'slow' || type === 'flat') {
      k.interp = 'BEZIER'; k.handle = 'FREE';
      const dl = prev ? (k.frame - prev.frame) / 3 : 5, dr = next ? (next.frame - k.frame) / 3 : 5;
      k.left = { frame: k.frame - dl, value: k.value };
      k.right = { frame: k.frame + dr, value: k.value };
    }
  }
  for (const t of Object.values(scene.tracks)) recalcHandles(t);
}

// Max's name for the tangent type of a key.
export function tangentName(k) {
  if (k.interp === 'CONSTANT') return 'Step';
  if (k.interp === 'LINEAR') return 'Linear';
  return { AUTO_CLAMPED: 'Auto', AUTO: 'Smooth', VECTOR: 'Fast', ALIGNED: 'Spline', FREE: Math.abs(k.left.value - k.value) < 1e-6 && Math.abs(k.right.value - k.value) < 1e-6 ? 'Slow' : 'Custom' }[k.handle] || 'Auto';
}

export function dragTangent(scene, id, side, frame, value) {
  const t = trackForKey(scene, id), keys = t && track(scene, t), k = findKey(scene, id);
  if (!k) return;
  if (side === 'left' && keys.indexOf(k) > 0) keys[keys.indexOf(k) - 1].interp = 'BEZIER';
  k.interp = 'BEZIER';
  if (k.handle !== 'FREE') k.handle = 'ALIGNED';
  moveHandle(k, side, frame, value);
}

export function checkLesson(id, scene, frame = scene.start) {
  if (id === 'timeline') return scene.tracks.x.some(k => k.frame > 0 && k.frame < 60 && k.value >= 3);
  if (id === 'range') return scene.start >= 8 && scene.end <= 55;
  if (id === 'curves') return scene.tracks.x.some(k => k.frame > 0 && k.frame < 60 && k.value >= 6 && k.interp === 'BEZIER');
  if (id === 'dope') return scene.tracks.rotation.some(k => k.frame > 0 && k.frame <= 25) && scene.tracks.scale.length >= 4;
  if (id === 'loops') return scene.out === 'loop' && frame >= 60 && valueAt(scene, 'rotation', 60) >= 1079;
  return true;
}
