import { colors, maskBounds } from './material.js';

// Each socket has a stable ID, a Blender-facing label, and a data type.
export function shaderGraph(stage, settings) {
  const early = stage < 2;
  const number = value => String(Number(value.toFixed(3)));
  const float = (id, name, value = '') => [id, name, 'float', typeof value === 'number' ? number(value) : value];
  const vector = (id, name) => [id, name, 'vector'];
  const color = (id, name, hex) => [id, name, 'color', hex];
  const shader = (id, name) => [id, name, 'shader'];
  const [min, max] = maskBounds(settings);
  const y = stage >= 3 ? 96 : 30;
  const node = (id, title, family, x, top, inputs, outputs, options = []) => ({
    id, title, family, x, y: top, inputs, outputs, options,
  });
  const nodes = [
    node('coord', 'Texture Coordinate', 'input', 18, y + 34, [], [vector('generated', 'Generated')]),
    node('noise', 'Noise Texture', 'texture', 210, y, [
      vector('vector', 'Vector'), float('scale', 'Scale', settings.scale), float('detail', 'Detail', 2),
      float('roughness', 'Roughness', 0.5),
    ], [float('fac', 'Fac')], ['3D · fBM', 'Normalize ✓']),
    early
      ? node('limit', 'Math', 'math', 405, y, [float('noise', 'Value'), float('threshold', 'Value', settings.threshold)],
        [float('mask', 'Value')], ['Greater Than'])
      : node('limit', 'Map Range', 'math', 405, y, [
        float('noise', 'Value'), float('min', 'From Min', min), float('max', 'From Max', max),
        float('to-min', 'To Min', 0), float('to-max', 'To Max', 1),
      ], [float('mask', 'Result')], ['Float · Smooth Step', 'Clamp ✓']),
  ];
  const edges = [
    ['coord.generated', 'noise.vector', 0],
    ['noise.fac', 'limit.noise', 0],
  ];
  const shaderX = stage >= 3 ? 980 : stage > 0 ? 795 : 605;
  const shaderY = stage >= 3 ? 106 : 42;
  if (stage === 0) edges.push(['limit.mask', 'bsdf.color', 0]);
  if (stage >= 1) {
    nodes.push(node('mix', 'Mix Color', 'color', 600, 22, [
      float('factor', 'Factor'), color('paint', 'A', colors.paint), color('primer', 'B', colors.primer),
    ], [color('result', 'Result')], ['Color · Mix', 'Clamp Factor ✓']));
    edges.push(['limit.mask', 'mix.factor', early ? 1 : 2], ['mix.result', 'bsdf.color', 1]);
  }
  if (stage >= 2) {
    nodes.push(node('rough', 'Map Range', 'math', 600, 260, [
      float('factor', 'Value'), float('min', 'From Min', 0), float('max', 'From Max', 1),
      float('paint', 'To Min', settings.paintRoughness), float('primer', 'To Max', settings.primerRoughness),
    ], [float('result', 'Result')], ['Float · Linear', 'Clamp ✓']));
    edges.push(['limit.mask', 'rough.factor', 2], ['rough.result', 'bsdf.rough', 2]);
  }
  if (stage >= 3) {
    nodes.push(
      node('grain', 'Noise Texture', 'texture', 210, 555, [
        vector('vector', 'Vector'), float('scale', 'Scale', 65), float('detail', 'Detail', 2),
        float('roughness', 'Roughness', 0.5),
      ], [float('fac', 'Fac')], ['3D · fBM', 'Normalize ✓']),
      node('depth', 'Math', 'math', 405, 402, [
        float('mask', 'Value'), float('multiplier', 'Multiplier', -0.55), float('offset', 'Addend', 0.65),
      ], [float('height', 'Value')], ['Multiply Add']),
      node('sum', 'Math', 'math', 600, 520, [
        float('grain', 'Value'), float('multiplier', 'Multiplier', settings.grain), float('layer', 'Addend'),
      ], [float('height', 'Value')], ['Multiply Add']),
      node('bump', 'Bump', 'vector', 790, 464, [
        float('strength', 'Strength', settings.strength), float('distance', 'Distance', settings.distance),
        float('height', 'Height'), vector('normal-in', 'Normal'),
      ], [vector('normal', 'Normal')], ['Invert ☐']),
    );
    edges.push(
      ['coord.generated', 'grain.vector', 3],
      ['limit.mask', 'depth.mask', 3],
      ['depth.height', 'sum.layer', 3],
      ['grain.fac', 'sum.grain', 3],
      ['sum.height', 'bump.height', 3],
      ['bump.normal', 'bsdf.normal', 3],
    );
  }
  nodes.push(
    node('bsdf', 'Principled BSDF', 'shader', shaderX, shaderY, [
      color('color', 'Base Color'), float('metallic', 'Metallic', 0), float('rough', 'Roughness', 0.45),
      vector('normal', 'Normal'),
    ], [shader('bsdf', 'BSDF')]),
    node('output', 'Material Output', 'output', shaderX + 196, shaderY, [shader('surface', 'Surface')], []),
  );
  edges.push(['bsdf.bsdf', 'output.surface', 0]);
  return { nodes, edges, width: shaderX + 385, height: stage >= 3 ? 787 : stage >= 2 ? 505 : 245 };
}
