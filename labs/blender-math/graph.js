import { clamp, fields, mathValue } from '../_procedural/core.js';
import { compileSockets, graphPorts } from '../_procedural/node-links.js';

export const socketNames = {
  A: 'A', B: 'B', C: 'C', ε: 'Epsilon', d: 'Distance', M: 'Max', m: 'Min', i: 'Increment', s: 'Scale',
};

const numeric = (id, label, value, bounds = [-100, 100, 0.01]) => [id, label, 'float', value, bounds];
const vector = (id, label) => [id, label, 'vector'];
const value = numeric('value', 'Value');
const uv = (u, v) => [u, v, 0];
const operands = ['a', 'b', 'c'];

export function mathGraph(source, mode, sockets, preset) {
  const nodes = [];
  const edges = [];
  const node = (id, title, family, x, y, outputs, inputs = [], settings = []) => {
    nodes.push({ id, title, family, x, y, outputs, inputs, settings });
  };
  const manual = source === 'Manual';
  const x = manual ? 18 : 202;
  if (!manual) {
    node('coord', 'Texture Coordinate', 'input', 18, 30, [vector('uv', 'UV')]);
    if (source === 'Noise') {
      node('source', 'Noise Texture', 'texture', x, 30, [numeric('fac', 'Fac')],
        [vector('vector', 'Vector'), numeric('scale', 'Scale', 7, [0, 80, 0.1])]);
    } else if (source === 'Radial') {
      node('source', 'Vector Math', 'math', x, 30, [value], [vector('vector', 'Vector')], ['Distance · center (0.5, 0.5)']);
    } else {
      node('source', 'Separate XYZ', 'math', x, 30, [numeric('x', 'X'), numeric('y', 'Y')], [vector('vector', 'Vector')]);
    }
    const from = source === 'Noise' ? 'fac' : source === 'Radial' ? 'value' : source === 'U' ? 'x' : 'y';
    edges.push(['coord.uv', 'source.vector'], ['source.' + from, 'scale.a'], ['scale.value', 'math.a']);
  } else {
    edges.push(['constant.value', 'math.a']);
  }
  node('constant', 'Value', 'input', x, manual ? 30 : 184, [value], [], [{ value: 'value', label: 'Value', initial: -0.25 }]);
  if (!manual) {
    node('scale', 'Math', 'math', x + 183, 30, [value], [
      numeric('a', 'Value', 0), numeric('gain', 'Multiplier', preset.gain), numeric('offset', 'Addend', preset.offset),
    ], ['Multiply Add']);
  }
  const mathX = x + (manual ? 183 : 366);
  node('math', 'Math', 'math', mathX, 30, [value], [...sockets].map((socket, index) =>
    numeric(operands[index], socketNames[socket], [-0.25, preset.b, preset.c][index])),
  [{ mode }, { toggle: 'clamp', label: 'Clamp', value: false }]);
  node('preview', 'Emission', 'shader', mathX + 183, 30, [], [['color', 'Color', 'color', '#000000']]);
  edges.push(['math.value', 'preview.color']);
  if (preset.displacement) {
    node('displacement', 'Displacement', 'vector', mathX + 183, 134, [vector('result', 'Displacement')], [
      numeric('height', 'Height', 0.5), numeric('midlevel', 'Midlevel', 0.5, [0, 1, 0.01]),
      numeric('scale', 'Scale', 0.2, [-0.45, 0.45, 0.01]),
    ], ['Object Space']);
    node('output', 'Material Output', 'output', mathX + 366, 134, [], [vector('displacement', 'Displacement')]);
    edges.push(['math.value', 'displacement.height'], ['displacement.result', 'output.displacement']);
  }
  return { nodes, edges, width: mathX + (preset.displacement ? 548 : 364) };
}

export function compileMath(graph, links, values, source, mode) {
  const ports = graphPorts(graph);
  const { input, output } = compileSockets(ports, links, values, buildOutput);
  const limited = values.get('math.clamp') ?? false;
  const compare = (a, b, c) => mathValue(mode, a, b, c, limited);

  function buildOutput(key) {
    if (key === 'coord.uv') return uv;
    if (key === 'constant.value') {
      const constant = values.get(key) ?? -0.25;
      return () => constant;
    }
    if (key.startsWith('source.')) {
      const coords = input('source.vector', uv);
      const scale = input('source.scale');
      return (u, v) => {
        const [x, y] = coords(u, v);
        if (source === 'Noise') return fields.Noise(x, y, scale(u, v));
        if (source === 'Radial') return fields.Radial(x, y);
        return key === 'source.y' ? y : x;
      };
    }
    if (key === 'scale.value') {
      const a = input('scale.a'), gain = input('scale.gain'), offset = input('scale.offset');
      return (u, v) => a(u, v) * gain(u, v) + offset(u, v);
    }
    if (key === 'displacement.result') {
      const height = input('displacement.height'), middle = input('displacement.midlevel'), scale = input('displacement.scale');
      return (u, v) => [0, 0, (height(u, v) - middle(u, v)) * scale(u, v)];
    }
    const a = input('math.a'), b = input('math.b'), c = input('math.c');
    return (u, v) => compare(a(u, v), b(u, v), c(u, v));
  }

  const a = input('math.a'), b = input('math.b'), c = input('math.c');
  return {
    a, b, c, compare, limited,
    result: output('math.value'),
    texture: input('preview.color'),
    displacement: input('output.displacement'),
  };
}
