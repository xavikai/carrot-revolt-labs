const ink = { float: '#bdc7d1', vector: '#a99af5', color: '#ecc55f', shader: '#87d6a2' };
const width = 162, header = 32, row = 26, settingHeight = 24;
const escape = str => String(str).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

function field(key, label, type, value, bounds) {
  const attributes = `data-mix-value="${key}" aria-label="${escape(label)}" value="${value}"`;
  if (type === 'color') return `<input type="color" class="socket-color" ${attributes}>`;
  const [min, max, step] = bounds;
  return `<input type="number" class="socket-number" ${attributes} min="${min}" max="${max}" step="${step}">`;
}

function stops(node, values, setting) {
  return setting.ramp.map(([id, position, hex]) => [
    id, values.get(node + '.' + id + '-position') ?? position,
    values.get(node + '.' + id + '-color') ?? hex,
  ]);
}

export function refreshRamp(host, node, values, setting) {
  const ramp = host.querySelector('[data-ramp="' + node + '"]');
  const [[, lo, left], [, hi, right]] = stops(node, values, setting).sort((a, b) => a[1] - b[1]);
  for (const [name, value] of [['left', left], ['right', right], ['start', lo * 100 + '%'], ['end', hi * 100 + '%']]) {
    ramp.style.setProperty('--ramp-' + name, value);
  }
}

export function cablePath(a, b) {
  const span = Math.max(20, Math.min(116, Math.abs(b.x - a.x) * 0.52));
  return `M${a.x} ${a.y} C${a.x + span} ${a.y} ${b.x - span} ${b.y} ${b.x} ${b.y}`;
}

export function renderMixEditor(host, graph, links, values, modeLabel) {
  const ports = new Map();
  let height = 238;
  const ramps = [];
  const nodes = graph.nodes.map(node => {
    const { id, title, family, x, y, outputs, inputs, settings } = node;
    const options = settings.flatMap(setting => {
      if (typeof setting === 'string') return `<div class="node-option">${escape(setting)}</div>`;
      if (setting.mode) return `<div class="node-option mode-option"><select id="mode" aria-label="${escape(modeLabel)}" data-mix-value="mix.mode"></select></div>`;
      if (setting.toggle) {
        const key = id + '.' + setting.toggle;
        return `<label class="node-option invert-option">${setting.label}<input type="checkbox" data-mix-value="${key}" ${(values.get(key) ?? setting.value) ? 'checked' : ''}></label>`;
      }
      ramps.push([id, setting]);
      return [
        `<div class="node-option ramp-option"><div class="node-ramp" data-ramp="${id}"><i></i><i></i></div></div>`,
        ...stops(id, values, setting).map(([stop, position, hex], i) => `<div class="node-option ramp-fields">
          <span>${i + 1}</span>
          ${field(id + '.' + stop + '-color', title + ' · ' + (i + 1) + ' · Color', 'color', hex)}
          ${field(id + '.' + stop + '-position', title + ' · ' + (i + 1) + ' · Position', 'float', position, [0, 1, 0.01])}</div>`),
      ];
    });
    const port = ([key, label, type, fallback, bounds], index, output) => {
      const name = id + '.' + key;
      const py = y + header + row * (index + 0.5) + (output ? 0 : outputs.length * row + options.length * settingHeight);
      const duplicates = inputs.filter(([, hint]) => hint === label).length > 1;
      const labelPrefix = id === 'rampa' || id === 'layera' ? 'A · ' : id === 'rampb' || id === 'layerb' ? 'B · ' : '';
      const accessible = labelPrefix + title + ' · ' + label + (!output && duplicates ? ' ' + (index + 1) : '');
      ports.set(name, { x: x + (output ? width : 0), y: py, type, output, label: accessible });
      const editable = !output && fallback !== undefined && !links.has(name);
      return `<div class="socket ${output ? 'socket-out' : 'socket-in'}" style="--socket:${ink[type]}">
        <button type="button" class="port" data-port="${name}" aria-label="${escape(accessible)}"></button>
        <div class="socket-content${editable ? ' socket-field' : ''}"><span>${label}</span>
        ${editable ? field(name, accessible, type, values.get(name) ?? fallback, bounds) : ''}</div></div>`;
    };
    height = Math.max(height, y + header + (outputs.length + inputs.length) * row + options.length * settingHeight + 18);
    return `<div class="shader-node family-${family}" style="left:${x}px;top:${y}px">
      <div class="node-title">${title}</div>
      ${outputs.map((p, i) => port(p, i, true)).join('')}
      ${options.join('')}
      ${inputs.map((p, i) => port(p, i, false)).join('')}
    </div>`;
  });
  const wires = [...links].map(([to, from]) => {
    const a = ports.get(from), b = ports.get(to);
    return `<path data-from="${from}" data-to="${to}" d="${cablePath(a, b)}" fill="none" stroke="${ink[a.type]}" stroke-width="2.6"/>`;
  });
  host.style.width = graph.width + 'px';
  host.style.height = height + 'px';
  host.innerHTML = `<svg class="wires" width="${graph.width}" height="${height}" aria-hidden="true">${wires.join('')}
    <path class="drag-wire" fill="none" stroke="#ffaf63" stroke-width="3"></path></svg>${nodes.join('')}`;
  for (const [id, setting] of ramps) refreshRamp(host, id, values, setting);
  return ports;
}
