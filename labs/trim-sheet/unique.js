// One non-overlapping atlas for the comparison scene. Every quad owns pixels;
// none of its UVs reuse a trim or repeat outside the image.
import { SIZE } from './sheet.js';
import { propOf, PROPS_OF_ALL } from './props.js?v=2';

const WIDTHS = [0.45, 0.21, 0.18, 0.16];

function pack(mesh, zones, density, size) {
  const rects = Array(mesh.faces.length), uv = Array(mesh.faces.length);
  for (const zone of zones) {
    const faces = mesh.faces.map((face, f) => ({ face, f })).filter(({ face }) => propOf(face.island) === zone.prop).map(({ face, f }) => {
      const s = face.loc.map(p => p[0]), t = face.loc.map(p => p[1]);
      const s0 = Math.min(...s), s1 = Math.max(...s), t0 = Math.min(...t), t1 = Math.max(...t);
      return { face, f, s0, t0, ds: s1 - s0, dt: t1 - t0, w: Math.max(2, Math.round((s1 - s0) * density)), h: Math.max(2, Math.round((t1 - t0) * density)) };
    }).sort((a, b) => b.h - a.h || b.w - a.w);
    let x = zone.x + 5, y = 32, rowH = 0;
    for (const item of faces) {
      if (x + item.w + 5 > zone.x + zone.w) { x = zone.x + 5; y += rowH + 4; rowH = 0; }
      if (y + item.h + 5 > size) return null;
      const { f, face, s0, t0, ds, dt, w, h } = item;
      rects[f] = { x, y, w, h, prop: zone.prop, type: mesh.islands[face.island].target, face: f };
      uv[f] = face.loc.map(([s, t]) => [(x + (s - s0) / ds * w) / size, 1 - (y + h - (t - t0) / dt * h) / size]);
      x += w + 4; rowH = Math.max(rowH, h);
    }
  }
  return { rects, uv };
}

export function layoutUnique(mesh, props = PROPS_OF_ALL, size = SIZE) {
  let x = 0;
  const zones = props.map((prop, i) => { const w = i === props.length - 1 ? size - x : Math.round(WIDTHS[PROPS_OF_ALL.indexOf(prop)] * size); const zone = { prop, x, w }; x += w; return zone; });
  for (let density = props.length === 1 ? Math.round(size * 0.61) : 220; density >= 100; density -= 2) {
    const p = pack(mesh, zones, density, size);
    if (p) return { ...p, zones, density, size };
  }
  throw new Error('Unique atlas cannot fit the comparison scene');
}
