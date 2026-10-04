// Trim Sheet Lab: the high poly of the sheet, its bake in Blender and its texturing in Painter.
// Pure rules (no DOM): what each setting does to the result. The images are made in paint.js.
import { SIZE, DENSITY, TYPES, TYPE_IDS } from './sheet.js?v=1';

// How far each strip's high poly rises above the low plane (m). Grooves sit on the plane (0).
export const DEPTH = { plank: 0.02, stone: 0.03, beam: 0.025, molding: 0.05, iron: 0.015, plinth: 0.02, bevelWood: 0.03, bevelStone: 0.03 };
export const MAX_H = Math.max(...Object.values(DEPTH));   // 5 cm: the molding
export const PLANE_M = SIZE / DENSITY;                     // 2 m: the low plane is the sheet, in metres

// ID colours: flat, far apart in hue, one per material. Unassigned faces get Blender's default grey.
export const MATERIALS = {
  wood:  { name: 'Wood',  id: [220, 50, 40] },
  stone: { name: 'Stone', id: [40, 170, 70] },
  iron:  { name: 'Iron',  id: [40, 90, 220] },
  none:  { name: 'Material (default)', id: [128, 128, 128] },
};
export const MATERIAL_OF = { plank: 'wood', stone: 'stone', beam: 'wood', molding: 'stone', iron: 'iron', plinth: 'stone', bevelWood: 'wood', bevelStone: 'stone' };
export const rightMaterials = () => Object.fromEntries(TYPE_IDS.map(t => [t, MATERIAL_OF[t]]));

// ─── Blender: Bake › Normal, Selected to Active ──────────────────────────────
// Rays start on the cage (the low plane pushed out by Extrusion) and travel back towards it for at most
// Max Ray Distance (0 = no limit). A high poly taller than the extrusion is cut flat; parts the rays cannot reach are lost.
export const defaultBake = () => ({ type: 'combined', s2a: false, extrusion: 0, rayDist: 0, size: SIZE, swizzleG: '+Y', margin: 16, direct: true, indirect: true, color: true, overhang: true });
export function normalReport(b) {
  const clipped = TYPE_IDS.filter(t => DEPTH[t] > b.extrusion + 1e-6);
  const reach = b.rayDist > 0 ? b.rayDist : Infinity;
  const lost = b.extrusion > reach + 1e-6;   // the lowest parts (grooves, joints) are beyond the rays
  const r = { type: b.type, s2a: b.s2a, clipped, lost, size: b.size, sizeOk: b.size === SIZE, seam: !b.overhang, dx: b.swizzleG === '-Y' };
  r.flat = b.type === 'normal' && !b.s2a;
  r.ok = b.type === 'normal' && b.s2a && !clipped.length && !lost && r.sizeOk && b.overhang;
  return r;
}
// ─── Blender: Bake › Diffuse with only Color, for an ID map ──────────────────
export function idReport(b, mats) {
  const wrong = TYPE_IDS.filter(t => mats[t] !== MATERIAL_OF[t]);
  const lit = b.direct || b.indirect;
  return { type: b.type, wrong, lit, noColor: !b.color, s2a: b.s2a, ok: b.type === 'diffuse' && b.s2a && b.color && !lit && !wrong.length && b.extrusion >= MAX_H };
}
// The engine decides the green channel: OpenGL (Y+) or DirectX (Y−).
export const ENGINES = { blender: { name: 'Blender', dx: false }, unity: { name: 'Unity', dx: false }, godot: { name: 'Godot', dx: false }, unreal: { name: 'Unreal Engine', dx: true } };
export const normalMatches = (engine, dx) => ENGINES[engine].dx === dx;

// ─── Painter: Texture Set Settings › Bake Mesh Maps ──────────────────────────
// Max Frontal Distance is relative to the size of the mesh (the 2 m plane: diagonal 2.83 m).
export const DIAG = Math.hypot(PLANE_M, PLANE_M);
export const PAINTER_MAPS = ['normal', 'wsn', 'id', 'ao', 'curvature', 'position', 'thickness'];
export const MAP_NAMES = { normal: 'Normal', wsn: 'World Space Normal', id: 'ID', ao: 'Ambient Occlusion', curvature: 'Curvature', position: 'Position', thickness: 'Thickness' };
export const ID_SOURCES = { vertex: 'Vertex Color', material: 'Material Color', meshid: 'Mesh ID / Polygroup' };
export const defaultPainterBake = () => ({ high: false, maps: { normal: true, wsn: true, id: false, ao: false, curvature: false, position: true, thickness: true }, idSource: 'vertex', frontal: 0.01, size: SIZE });
export function painterReport(p) {
  const reach = p.frontal * DIAG;
  const need = ['normal', 'id', 'ao', 'curvature'].filter(m => !p.maps[m]);
  const r = { high: p.high, need, idOk: p.idSource === 'material', clipped: reach < MAX_H - 1e-6, reach };
  r.ok = p.high && !need.length && r.idOk && !r.clipped && p.size === SIZE;
  return r;
}
// ─── Painter: layers ─────────────────────────────────────────────────────────
// A fill layer has a smart material and, optionally, a mask with Color Selection on one ID colour.
export const SMART = { wood: 'Oak Planks', stone: 'Sandstone Blocks', iron: 'Wrought Iron' };
export function layerReport(layers) {
  const cover = {};   // the material that ends on top of each region
  for (const reg of ['wood', 'stone', 'iron']) {
    let top = null;
    for (const l of layers) if (l.visible !== false && (!l.mask || l.mask === reg)) top = l;
    cover[reg] = top;
  }
  const unmasked = layers.filter(l => l.visible !== false && !l.mask);
  const ok = ['wood', 'stone', 'iron'].every(reg => cover[reg] && cover[reg].mat === reg && cover[reg].mask === reg);
  return { cover, unmasked, ok };
}
export function wearReport(layers) {
  const r = layerReport(layers), edges = layers.some(l => l.edge), dirt = layers.some(l => l.dirt);
  return { ...r, edges, dirt, ok: r.ok && edges && dirt };
}
export const EXPORTS = { unreal: { name: 'Unreal Engine (Packed)', dx: true, maps: 'BaseColor · Normal (DirectX) · OcclusionRoughnessMetallic' }, unity: { name: 'Unity Universal RP', dx: false, maps: 'BaseMap · Normal (OpenGL) · MaskMap' }, blender: { name: 'Blender (Principled BSDF)', dx: false, maps: 'Base Color · Normal (OpenGL) · Roughness · Metallic' } };
void TYPES;
