import { clamp, hexToLinear, mathValue, mixColor, noise } from '../_procedural/core.js';
import { imageMask, rampStops, surfaceLighting, voronoi } from './material.js';
import { compileSockets, graphPorts } from '../_procedural/node-links.js';

const unit = [0, 1, 0.01];
const uncapped = [-10, 10, 0.01];
export function fieldBounds(key) {
  const [node, socket] = key.split('.');
  switch (socket) {
    case 'scale': return node === 'displacement' ? [-1, 1, 0.01] : [0, 150, 0.1];
    case 'detail': return [0, 5, 0.1];
    case 'distance': return [0, 0.5, 0.005];
    case 'threshold': case 'factor': case 'strength': case 'randomness':
    case 'roughness': case 'metallic': case 'rough': case 'stop0': case 'stop1': return unit;
    default: return node === 'limit' || node === 'rough' ? unit : uncapped;
  }
}

const zAxis = [0, 0, 1];
const uv = (u, v) => [u, v, 0];
const gray = n => [n, n, n];
const background = () => [0.022, 0.028, 0.037];
const zero = () => 0;

function fractal(x, y, scale, detail, roughness) {
  const whole = Math.floor(detail);
  let frequency = scale, amplitude = 1, total = noise(x * frequency, y * frequency), sum = 1;
  for (let i = 1; i <= whole + 1; i++) {
    amplitude *= roughness;
    if (i > whole) amplitude *= detail - whole;
    if (!amplitude) break;
    frequency *= 2;
    total += noise(x * frequency, y * frequency) * amplitude;
    sum += amplitude;
  }
  return total / sum;
}

export function compileStudy(graph, links, values, { light = 65, image = imageMask } = {}) {
  const ports = graphPorts(graph);
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const { input, output } = compileSockets(ports, links, values, buildOutput);

  function buildOutput(key) {
    const { node } = ports.get(key) ?? {};
    if (!node) return zero;
    const definition = nodes.get(node);
    const at = (socket, fallback) => input(node + '.' + socket, fallback);
    if (node === 'coord') return uv;
    if (definition.title === 'Image Texture') {
      const vector = at('vector', uv);
      return (u, v) => {
        const [x, y] = vector(u, v);
        return gray(image(x, y));
      };
    }
    if (definition.title === 'Voronoi Texture') {
      const vector = at('vector', uv), scale = at('scale'), randomness = at('randomness');
      return (u, v) => {
        const [x, y] = vector(u, v);
        return voronoi(x, y, scale(u, v), clamp(randomness(u, v)));
      };
    }
    if (definition.title === 'Noise Texture') {
      const vector = at('vector', uv), scale = at('scale'), detail = at('detail'), roughness = at('roughness');
      return (u, v) => {
        const [x, y] = vector(u, v);
        return fractal(x, y, scale(u, v), clamp(detail(u, v), 0, 5), clamp(roughness(u, v)));
      };
    }
    if (definition.title === 'Map Range') {
      const value = at(node === 'limit' ? 'noise' : 'factor');
      const min = at('min'), max = at('max');
      const a = at(node === 'limit' ? 'to-min' : 'paint'), b = at(node === 'limit' ? 'to-max' : 'primer');
      return (u, v) => {
        const lower = min(u, v), upper = max(u, v);
        const t = upper === lower ? 0 : clamp((value(u, v) - lower) / (upper - lower));
        const factor = node === 'limit' ? t * t * (3 - 2 * t) : t;
        const lo = a(u, v), hi = b(u, v);
        return lo + factor * (hi - lo);
      };
    }
    if (definition.title === 'Math') {
      const a = at(node === 'depth' ? 'mask' : node === 'sum' ? 'grain' : 'noise');
      const b = at(node === 'limit' ? 'threshold' : 'multiplier');
      const c = at(node === 'depth' ? 'offset' : 'layer');
      const mode = node === 'limit' ? 'Greater Than' : 'Multiply Add';
      return (u, v) => mathValue(mode, a(u, v), b(u, v), c(u, v));
    }
    if (node === 'ramp') {
      const stops = rampStops.map(([hex, position], i) => [
        hexToLinear(values.get('ramp.color' + i) ?? hex),
        values.get('ramp.stop' + i) ?? position,
      ]).sort((a, b) => a[1] - b[1]);
      const [[a, min], [b, max]] = stops;
      const fac = at('fac');
      return (u, v) => {
        const f = fac(u, v);
        return mixColor('Mix', a, b, min === max ? Number(f >= min) : (f - min) / (max - min), true, false);
      };
    }
    if (node === 'mix') {
      const fac = at('factor'), a = at('paint'), b = at('primer');
      return (u, v) => mixColor('Mix', a(u, v), b(u, v), fac(u, v), true, false);
    }
    if (node === 'bump') {
      const normal = at('normal-in', () => zAxis);
      if (!links.has('bump.height')) return normal;
      const height = at('height'), strength = at('strength'), distance = at('distance');
      const delta = 1 / 320, sign = values.get('bump.invert') ? 1 : -1;
      return (u, v) => {
        const depth = sign * clamp(strength(u, v)) * distance(u, v) / (2 * delta);
        const [x, y, z] = normal(u, v);
        if (!depth) return [x, y, z];
        const dx = height(u + delta, v) - height(u - delta, v);
        const dy = height(u, v + delta) - height(u, v - delta);
        return [x + depth * dx, y + depth * dy, z];
      };
    }
    if (node === 'displacement') {
      const height = at('height'), mid = at('midlevel'), scale = at('scale'), normal = at('normal', () => zAxis);
      return (u, v) => {
        const offset = (height(u, v) - mid(u, v)) * scale(u, v);
        const vNormal = normal(u, v);
        const length = Math.hypot(...vNormal) || 1;
        return vNormal.map(component => component * offset / length);
      };
    }
    return zero;
  }

  const color = input('bsdf.color');
  const roughness = input('bsdf.rough');
  const metallic = input('bsdf.metallic');
  const normal = input('bsdf.normal', () => zAxis);
  const height = input(nodes.has('displacement') ? 'displacement.height' : 'bump.height');
  const mask = output('limit.mask');
  const displacement = input('output.displacement');
  const shade = surfaceLighting(light);
  return {
    displacement,
    color,
    mask: (u, v) => gray(mask(u, v)),
    roughness: (u, v) => gray(roughness(u, v)),
    height: (u, v) => gray(height(u, v)),
    material: links.has('output.surface')
      ? (u, v) => shade(color(u, v), roughness(u, v), metallic(u, v), normal(u, v))
      : background,
  };
}
