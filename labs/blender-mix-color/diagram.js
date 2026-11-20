const kinds = {
  float: '#bdc7d1',
  vector: '#a99af5',
  color: '#ecc55f',
  shader: '#87d6a2',
};
const family = {
  texture: '#805132', math: '#49547d', color: '#765a29', shader: '#365d4b', output: '#614449',
};
const width = 153, header = 30, row = 23;
const format = n => String(Number(n.toFixed(3)));

export function mixDiagram({ mode, mask, amount, threshold, layerA, layerB, a, b, clipFactor, clipResult }) {
  const nodes = [];
  const edges = [];
  const add = (id, title, kind, x, y, outputs, inputs = [], settings = []) => {
    nodes.push({ id, title, kind, x, y, outputs, inputs, settings });
  };
  const wire = (from, to) => edges.push([from, to]);
  const port = (id, label, type, value) => ({ id, label, type, value });
  const fac = port('fac', 'Fac', 'float');
  const rampColor = port('color', 'Color', 'color');

  function layer(side, source, tint, y) {
    if (source === 'Solid') return tint;
    const texture = { Noise: 'Noise Texture', Bands: 'Wave Texture', Checker: 'Checker Texture' }[source];
    add('layer' + side, texture, 'texture', 205, y, [fac]);
    add('ramp' + side, 'Color Ramp', 'color', 393, y, [rampColor], [fac], [tint + ' → #ffffff']);
    wire('layer' + side + '.fac', 'ramp' + side + '.fac');
    wire('ramp' + side + '.color', 'mix.' + side);
    return '';
  }
  const aValue = layer('a', layerA, a, 178);
  const bValue = layer('b', layerB, b, 302);

  if (mask !== 'Constant') {
    let source = 'mask.fac';
    if (mask === 'Checker') add('mask', 'Checker Texture', 'texture', 205, 18, [fac]);
    else if (mask === 'U') {
      add('uv', 'Texture Coordinate', 'math', 17, 18, [port('uv', 'UV', 'vector')]);
      add('mask', 'Separate XYZ', 'math', 205, 18, [port('fac', 'X', 'float')], [port('vector', 'Vector', 'vector')]);
      wire('uv.uv', 'mask.vector');
    } else {
      const soft = mask === 'Soft Noise';
      add('noise', 'Noise Texture', 'texture', 17, 18, [fac]);
      add('mask', soft ? 'Map Range' : 'Math', 'math', 205, 18, [
        port('fac', soft ? 'Result' : 'Value', 'float'),
      ], [port('value', 'Value', 'float')], soft
        ? ['Smooth Step', format(threshold - 0.07) + '…' + format(threshold + 0.07) + ' → 0…1']
        : ['Greater Than · ' + format(threshold)]);
      wire('noise.fac', 'mask.value');
    }
    if (amount !== 1) {
      add('multiply', 'Math', 'math', 393, 18, [port('value', 'Value', 'float')],
        [port('input', 'Value', 'float')], ['Multiply · ' + format(amount)]);
      wire(source, 'multiply.input');
      source = 'multiply.value';
    }
    wire(source, 'mix.factor');
  }

  add('mix', 'Mix Color', 'color', 583, 86, [port('result', 'Result', 'color')], [
    port('factor', 'Factor', 'float', mask === 'Constant' ? format(amount) : ''),
    port('a', 'A', 'color', aValue),
    port('b', 'B', 'color', bValue),
  ], ['Color · ' + mode, 'Clamp Factor ' + (clipFactor ? '✓' : '☐'), 'Clamp Result ' + (clipResult ? '✓' : '☐')]);
  add('bsdf', 'Principled BSDF', 'shader', 778, 86, [port('bsdf', 'BSDF', 'shader')],
    [port('base', 'Base Color', 'color')]);
  add('out', 'Material Output', 'output', 971, 86, [], [port('surface', 'Surface', 'shader')]);
  wire('mix.result', 'bsdf.base');
  wire('bsdf.bsdf', 'out.surface');

  return { nodes, edges, height: layerB !== 'Solid' ? 423 : layerA !== 'Solid' ? 300 : 260 };
}

export function renderMixDiagram(host, graph) {
  const ports = new Map();
  const escape = str => String(str).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
  const nodes = graph.nodes.map(node => {
    const { id, x, y, kind, title, outputs, inputs, settings } = node;
    const height = header + row * (outputs.length + inputs.length + settings.length) + 6;
    const socket = ({ id: port, label, type, value }, index, output) => {
      const px = output ? width : 0, py = header + row * (index + 0.5);
      ports.set(id + '.' + port, { x: x + px, y: y + py, type, label: title + ' · ' + label });
      const swatch = /^#[0-9a-f]{6}$/i.test(value);
      return `<circle cx="${px}" cy="${py}" r="5" fill="${kinds[type]}" stroke="#161b20"/>
        <text x="${output ? width - 10 : 11}" y="${py + 4}" ${output ? 'text-anchor="end"' : ''}>${label}</text>
        ${swatch ? `<rect x="72" y="${py - 8}" width="67" height="16" rx="3" fill="${value}" stroke="#a2adb5"><title>${value}</title></rect>`
          : value ? `<text class="mix-graph-value" x="${width - 9}" y="${py + 4}" text-anchor="end">${escape(value)}</text>` : ''}`;
    };
    return `<g transform="translate(${x} ${y})">
      <rect width="${width}" height="${height}" rx="6" fill="#292e34" stroke="#111519"/>
      <rect width="${width}" height="${header}" rx="6" fill="${family[kind]}"/>
      <text x="11" y="19" class="mix-graph-title">${title}</text>
      ${outputs.map((p, i) => socket(p, i, true)).join('')}
      ${settings.map((setting, i) => {
        const top = header + row * (outputs.length + i);
        return `<rect x="8" y="${top + 2}" width="137" height="19" rx="3" fill="#414752"/>
          <text x="13" y="${top + 15}">${escape(setting)}</text>`;
      }).join('')}
      ${inputs.map((p, i) => socket(p, outputs.length + settings.length + i, false)).join('')}
    </g>`;
  }).join('');
  const wires = graph.edges.map(([from, to]) => {
    const a = ports.get(from), b = ports.get(to);
    const handle = Math.max(20, Math.min(90, (b.x - a.x) * 0.55));
    return `<path data-from="${from}" data-to="${to}" d="M ${a.x} ${a.y} C ${a.x + handle} ${a.y}, ${b.x - handle} ${b.y}, ${b.x} ${b.y}"
      fill="none" stroke="${kinds[a.type]}" stroke-width="2.5"/>`;
  }).join('');
  host.innerHTML = `<svg width="1143" height="${graph.height}" viewBox="0 0 1143 ${graph.height}" role="img" aria-labelledby="mix-graph-title mix-graph-description">
    <title id="mix-graph-title">Mix Color · Shader Editor</title>
    <desc id="mix-graph-description">${graph.edges.map(([from, to]) => ports.get(from).label + ' → ' + ports.get(to).label).join('. ')}</desc>
    ${wires}${nodes}</svg>`;
}
