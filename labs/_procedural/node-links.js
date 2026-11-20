import { hexToLinear } from './core.js';

export function graphPorts(graph) {
  return new Map(graph.nodes.flatMap(node => ['inputs', 'outputs'].flatMap(direction =>
    node[direction].map(([id, label, type, value]) =>
      [node.id + '.' + id, { node: node.id, id, label, type, value, output: direction === 'outputs' }]))));
}

export function canWire(ports, links, from, to) {
  const a = ports.get(from), b = ports.get(to);
  if (!a?.output || !b || b.output || a.node === b.node) return false;
  const numeric = type => type === 'float' || type === 'color';
  if (a.type !== b.type && !(numeric(a.type) && numeric(b.type))) return false;

  const ancestors = [a.node];
  const visited = new Set();
  while (ancestors.length) {
    const node = ancestors.pop();
    if (node === b.node) return false;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const [input, source] of links) {
      if (ports.get(input).node === node) ancestors.push(ports.get(source).node);
    }
  }
  return true;
}

export function replaceWire(ports, links, from, to, previousInput) {
  const next = new Map(links);
  if (previousInput) next.delete(previousInput);
  if (!canWire(ports, next, from, to)) return null;
  next.set(to, from);
  return next;
}

const zero = () => 0;
const black = () => [0, 0, 0];
const gray = n => [n, n, n];
const scalar = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function compileSockets(ports, links, values, buildOutput) {
  const compiled = new Map();

  const input = (key, fallback) => {
    const port = ports.get(key);
    if (!port) return fallback ?? zero;
    const source = links.get(key);
    if (source) {
      const evaluate = output(source);
      const type = ports.get(source).type;
      if (type === port.type) return evaluate;
      const convert = type === 'color' ? scalar : gray;
      return (u, v) => convert(evaluate(u, v));
    }
    const value = values.get(key) ?? port.value;
    if (port.type === 'color') {
      const color = value ? hexToLinear(value) : black();
      return () => color;
    }
    if (port.type === 'float') {
      const numeric = Number(value) || 0;
      return () => numeric;
    }
    return fallback ?? black;
  };

  function output(key) {
    if (!compiled.has(key)) compiled.set(key, buildOutput(key));
    return compiled.get(key);
  }

  return { input, output };
}
