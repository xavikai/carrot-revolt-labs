// Small, purpose-drawn interface symbols that follow the shapes in the supplied Photoshop captures.
const paths = {
  move: '<path d="M12 2v20M2 12h20M12 2l-3 3m3-3 3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3m17-3-3-3m3 3-3 3"/>',
  rect: '<rect x="3" y="5" width="18" height="14" stroke-dasharray="4 2"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="8" stroke-dasharray="4 2"/>',
  row: '<path d="M2 11h20" stroke-dasharray="4 2"/>',
  column: '<path d="M11 2v20" stroke-dasharray="4 2"/>',
  lasso: '<path d="M16 17c3-2 5-5 4-9-1-4-5-6-9-5-5 1-8 5-8 9s4 7 9 7c3 0 5-1 7-2l2 4"/>',
  object: '<path d="M3 3h17v13H9V9H3z" stroke-dasharray="2 2"/><path d="m13 13 2 9 2-3 3 2 1-2-3-2 3-1z" fill="currentColor" stroke="none"/>',
  quick: '<path d="M5 16a9 9 0 1 1 9 5" stroke-dasharray="3 2"/><path d="m12 18 6-7 2 2-6 7-3 1z"/>',
  crop: '<path d="M7 2v16h16M2 7h16v15M4 4h2M18 19h2"/>',
  frame: '<rect x="3" y="4" width="18" height="16"/><path d="m3 4 18 16M21 4 3 20"/>',
  eyedropper: '<path d="m14 5 5-3 3 3-3 5-3-3-9 10-3 1 1-3zM4 19l-2 2"/>',
  heal: '<path d="m4 18 14-14 3 3L7 21zM7 8l8 8M16 2v3M21 12h2M3 5l2 2"/>',
  brush: '<path d="m6 16 11-13 4 3-11 13M6 16c-3 0-4 2-4 5 3 0 6-1 6-4"/>',
  stamp: '<path d="M8 14V9c0-2 1-4 4-4s4 2 4 4v5l4 3v2H4v-2zM5 21h14"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 6M3 3v8h8M12 7v5l4 2"/>',
  eraser: '<path d="m3 16 10-12 8 7-9 10H8zM8 21h14"/>',
  gradient: '<rect x="2" y="4" width="20" height="16"/><path d="M10 4v16M13 4v16M16 4v16M19 4v16" opacity=".45"/>',
  blur: '<path d="M12 2C8 8 5 12 5 16a7 7 0 0 0 14 0c0-4-3-8-7-14z" fill="currentColor" stroke="none"/>',
  dodge: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  pen: '<path d="m12 2 9 10-9 10-9-10zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4M12 12v8"/>',
  text: '<path d="M3 5h18M12 5v15M7 20h10M3 5v3M21 5v3"/>',
  path: '<path d="M5 3v18l5-6 4 5 2-2-4-5 8-1z" fill="currentColor" stroke="none"/>',
  shape: '<rect x="3" y="4" width="18" height="16"/>',
  hand: '<path d="M4 13V8a1 1 0 0 1 2 0v4-8a1 1 0 0 1 2 0v7-9a1 1 0 0 1 2 0v9-7a1 1 0 0 1 2 0v8l2-3c1-2 3-1 3 1l-3 8c-1 2-3 3-6 3-3 0-5-2-7-5z"/>',
  zoom: '<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  new: '<rect x="5" y="5" width="14" height="14" fill="currentColor" stroke="none"/>',
  add: '<rect x="3" y="3" width="12" height="12" fill="currentColor" stroke="none"/><rect x="9" y="9" width="12" height="12" fill="currentColor" stroke="none"/>',
  subtract: '<rect x="3" y="3" width="12" height="12" fill="currentColor" stroke="none"/><rect x="9" y="9" width="12" height="12"/>',
  intersect: '<rect x="3" y="3" width="12" height="12"/><rect x="9" y="9" width="12" height="12"/><rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none"/>',
  link: '<path d="M10 8H8a4 4 0 0 0 0 8h3m2-8h3a4 4 0 0 1 0 8h-3M8 12h8"/>',
  adjust: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  folder: '<path d="M2 7h8l2 2h10v11H2z" fill="currentColor" stroke="none"/>',
  layer: '<rect x="5" y="4" width="14" height="16"/><path d="M12 8v8M8 12h8"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M7 6l1 15h8l1-15M10 9v9M14 9v9"/>',
  eye: '<path d="M2 12c3-4 6-6 10-6s7 2 10 6c-3 4-6 6-10 6s-7-2-10-6z"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};
export function icon(name, className = '') {
  return `<svg class="ps-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.shape}</svg>`;
}

// The supplied classroom screenshots are used as the source for the actual
// Photoshop toolbar glyphs. CSS crops each glyph in place without redrawing it.
const toolbarRows = {
  move: 38, selectionBrush: 100, object: 133, quick: 100,
  crop: 165, frame: 198, eyedropper: 231, heal: 264, brush: 296,
  stamp: 329, history: 361, eraser: 394, gradient: 427,
  blur: 460, smudge: 493, dodge: 526, pen: 558, text: 591,
  path: 624, shape: 656, hand: 688, zoom: 720, more: 752,
};
const marqueeRows = { rect: 32, ellipse: 57, row: 82, column: 107 };
const lassoRows = { lasso: 124, polygon: 148, magnetic: 172 };
const selectionRows = { object: 168, quick: 192, wand: 216 };
export function toolbarIcon(name) {
  let source = 'toolbar', x = 10, y = toolbarRows[name];
  if (name in marqueeRows) { source = 'marquee'; x = 70; y = marqueeRows[name]; }
  if (name in lassoRows) { source = 'lasso'; x = 70; y = lassoRows[name]; }
  if (name in selectionRows) { source = 'selection'; x = 70; y = selectionRows[name]; }
  if (y === undefined) return icon(name);
  return `<span class="ps-tool-bitmap ps-tool-bitmap--${source}" style="background-position:-${x}px -${y}px" aria-hidden="true"></span>`;
}
const optionSlots = { home: [23, 39], new: [463, 40], add: [495, 40], subtract: [527, 40], intersect: [559, 40] };
const layerSlots = { eye: [35, 171], lock: [402, 171], link: [204, 357], fx: [239, 357], mask: [272, 357], adjust: [306, 357], folder: [340, 357], layer: [373, 357], trash: [407, 357] };
export function optionIcon(name) {
  const [x, y] = optionSlots[name];
  return `<span class="ps-tool-bitmap ps-tool-bitmap--options" style="background-position:-${x}px -${y}px" aria-hidden="true"></span>`;
}
export function layerIcon(name) {
  const [x, y] = layerSlots[name];
  return `<span class="ps-tool-bitmap ps-tool-bitmap--layers" style="background-position:-${x}px -${y}px" aria-hidden="true"></span>`;
}
