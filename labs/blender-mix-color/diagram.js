import { clamp, fields, hexToLinear, mixColor } from '../_procedural/core.js';
import { graphPorts, compileSockets } from '../_procedural/node-links.js';

const number = (id, label, value, bounds = [0, 1, 0.01]) => [id, label, 'float', value, bounds];
const color = (id, label, value) => [id, label, 'color', value];
const vector = (id, label) => [id, label, 'vector'];
const shader = (id, label) => [id, label, 'shader'];
const factor = number('fac', 'Fac');
const coordinate = ['vector', 'Vector', 'vector'];
const ramp = (hex) => [
  ['left', 0, hex],
  ['right', 1, '#ffffff'],
];

export function mixDiagram({ mode, mask, amount, threshold, layerA, layerB, a, b, clipFactor, clipResult }) {
  const nodes = [];
  const edges = [];
  const add = (id, title, family, x, y, op, outputs, inputs = [], settings = []) => {
    nodes.push({ id, title, family, x, y, op, outputs, inputs, settings });
  };
  const wire = (from, to) => edges.push([from, to]);
  const texture = (id, source, x, y) => {
    const title = { Noise: 'Noise Texture', Bands: 'Wave Texture', Checker: 'Checker Texture' }[source];
    add(id, title, 'texture', x, y, source, [factor], [
      coordinate, number('scale', 'Scale', source === 'Bands' ? 15 : 7, [0, 80, 0.1]),
    ]);
  };

  function layer(side, source, tint, y) {
    if (source === 'Solid') return;
    texture('layer' + side, source, 205, y);
    add('ramp' + side, 'Color Ramp', 'color', 392, y, 'ramp', [color('color', 'Color')],
      [number('fac', 'Fac', 0.5)], ['RGB · Linear', { ramp: ramp(tint) }]);
    wire('layer' + side + '.fac', 'ramp' + side + '.fac');
    wire('ramp' + side + '.color', 'mix.' + side);
  }
  const layerTop = mask === 'Soft Noise' ? 225 : mask === 'Constant' ? 18 : 154;
  layer('a', layerA, a, layerTop);
  layer('b', layerB, b, layerA === 'Solid' ? layerTop : layerTop + 172);

  if (mask !== 'Constant') {
    if (mask === 'Checker') texture('mask', 'Checker', 205, 18);
    else if (mask === 'U') {
      add('uv', 'Texture Coordinate', 'input', 18, 18, 'uv', [vector('uv', 'UV')]);
      add('mask', 'Separate XYZ', 'math', 205, 18, 'separate', [
        number('fac', 'X'), number('y', 'Y'), number('z', 'Z'),
      ], [coordinate]);
      wire('uv.uv', 'mask.vector');
    } else {
      const soft = mask === 'Soft Noise';
      texture('noise', 'Noise', 18, 18);
      add('mask', soft ? 'Map Range' : 'Math', 'math', 205, 18, soft ? 'smooth' : 'greater',
        [number('fac', soft ? 'Result' : 'Value')], [
          number('value', 'Value', 0.5),
          ...(soft ? [
            number('min', 'From Min', threshold - 0.07, [-2, 2, 0.01]),
            number('max', 'From Max', threshold + 0.07, [-2, 2, 0.01]),
            number('low', 'To Min', 0, [-2, 2, 0.01]),
            number('high', 'To Max', 1, [-2, 2, 0.01]),
          ] : [number('threshold', 'Value', threshold)]),
        ], [soft ? 'Smooth Step' : 'Greater Than']);
      wire('noise.fac', 'mask.value');
    }
    add('multiply', 'Math', 'math', 392, 18, 'multiply', [number('value', 'Value')],
      [number('input', 'Value', 0.5), number('amount', 'Multiplier', amount, [-1, 2, 0.01])], ['Multiply']);
    wire('mask.fac', 'multiply.input');
    wire('multiply.value', 'mix.factor');
  }

  add('mix', 'Mix Color', 'color', 581, 64, 'mix', [color('result', 'Result')], [
    number('factor', 'Factor', mask === 'Constant' ? amount : 0.5, [-1, 2, 0.01]),
    color('a', 'A', a), color('b', 'B', b),
  ], [{ mode }, { toggle: 'clamp-factor', label: 'Clamp Factor', value: clipFactor },
    { toggle: 'clamp-result', label: 'Clamp Result', value: clipResult }]);
  add('bsdf', 'Principled BSDF', 'shader', 775, 64, 'bsdf', [shader('bsdf', 'BSDF')],
    [color('base', 'Base Color', '#e7e7e7')]);
  add('out', 'Material Output', 'output', 969, 64, 'output', [], [shader('surface', 'Surface')]);
  wire('mix.result', 'bsdf.base');
  wire('bsdf.bsdf', 'out.surface');

  const offset = Math.min(...nodes.map(node => node.x)) - 18;
  for (const node of nodes) node.x -= offset;
  const width = Math.max(...nodes.map(node => node.x)) + 181;
  return { nodes, edges, width };
}

export function compileMix(graph, links, values) {
  const ports = graphPorts(graph);
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const uv = (u, v) => [u, v, 0];
  const { input, output } = compileSockets(ports, links, values, buildOutput);
  const read = (id, fallback) => values.get(id) ?? fallback;
  const [mode, facClamp, resultClamp] = nodes.get('mix').settings;
  const clipFactor = read('mix.clamp-factor', facClamp.value);
  const clipResult = read('mix.clamp-result', resultClamp.value);

  function buildOutput(key) {
    const { node, id } = ports.get(key);
    const definition = nodes.get(node);
    const at = (socket, fallback) => input(node + '.' + socket, fallback);
    switch (definition.op) {
      case 'uv': return uv;
      case 'separate': {
        const vector = at('vector', uv);
        const index = id === 'fac' ? 0 : id === 'y' ? 1 : 2;
        return (u, v) => vector(u, v)[index];
      }
      case 'Noise': case 'Bands': case 'Checker': {
        const vector = at('vector', uv), scale = at('scale');
        const sample = fields[definition.op];
        return (u, v) => {
          const [x, y] = vector(u, v);
          return sample(x, y, scale(u, v));
        };
      }
      case 'greater': {
        const value = at('value'), threshold = at('threshold');
        return (u, v) => Number(value(u, v) > threshold(u, v));
      }
      case 'smooth': {
        const value = at('value'), min = at('min'), max = at('max');
        const low = at('low'), high = at('high');
        return (u, v) => {
          const start = min(u, v), end = max(u, v), a = low(u, v), b = high(u, v);
          const t = start === end ? 0 : clamp((value(u, v) - start) / (end - start));
          return a + (b - a) * t * t * (3 - 2 * t);
        };
      }
      case 'multiply': {
        const signal = at('input'), gain = at('amount');
        return (u, v) => signal(u, v) * gain(u, v);
      }
      case 'ramp': {
        const fac = at('fac');
        const [[start, a], [end, b]] = definition.settings[1].ramp.map(([key, position, hex]) => [
          read(node + '.' + key + '-position', position), hexToLinear(read(node + '.' + key + '-color', hex)),
        ]).sort((a, b) => a[0] - b[0]);
        return (u, v) => {
          const f = fac(u, v);
          const t = start === end ? Number(f >= start) : (f - start) / (end - start);
          return mixColor('Mix', a, b, t, true, false);
        };
      }
      case 'mix': {
        const a = at('a'), b = at('b'), f = at('factor');
        const modeName = read('mix.mode', mode.mode);
        return (u, v) => mixColor(modeName, a(u, v), b(u, v), f(u, v), clipFactor, clipResult);
      }
      default: return () => 0;
    }
  }

  const f = input('mix.factor');
  return {
    a: input('mix.a'), b: input('mix.b'), factor: f,
    effective: clipFactor ? (u, v) => clamp(f(u, v)) : f,
    result: output('mix.result'),
    surface: links.has('out.surface') ? input('bsdf.base') : () => [0.02, 0.027, 0.035],
  };
}
