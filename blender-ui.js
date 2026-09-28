// Carrot Revolt Labs · shared Blender look: icons drawn after Blender's own icon set, and an Outliner.
// Every icon is a 16 × 16 SVG string. Colours follow Blender's default theme:
// objects orange, object data green, modifiers blue, materials red, collections white.

export const THEME = { object: '#ee9e5c', data: '#00d4a3', modifier: '#84b8ff', shading: '#ea7581', collection: '#e8e8e8', light: '#e8e8e8', dim: '#9a9a9a' };

const svg = (body, cls = '') => `<svg class="bi${cls ? ' ' + cls : ''}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${body}</svg>`;
// The little cube Blender draws in its select-mode icons.
const CUBE = 'M8 2 13.5 5 8 8 2.5 5z M2.5 5v6L8 14l5.5-3V5 M8 8v6';
const tri = c => `<path d="M8 2.6 13.4 12.6H2.6z" fill="none" stroke="${c}" stroke-width="1.2" stroke-linejoin="round"/><rect x="6.6" y="1.3" width="2.8" height="2.8" fill="${c}"/><rect x="1.3" y="11.2" width="2.8" height="2.8" fill="${c}"/><rect x="11.9" y="11.2" width="2.8" height="2.8" fill="${c}"/>`;
const cam = c => `<path d="M2 5.5h7.5v6H2z" fill="none" stroke="${c}" stroke-width="1.2" stroke-linejoin="round"/><path d="m9.5 7.5 4.5-2.3v6.6l-4.5-2.3" fill="none" stroke="${c}" stroke-width="1.2" stroke-linejoin="round"/><circle cx="4" cy="3.6" r="1.4" fill="none" stroke="${c}" stroke-width="1"/><circle cx="7.4" cy="3.6" r="1.4" fill="none" stroke="${c}" stroke-width="1"/>`;
const bulb = c => `<path d="M8 1.8a4 4 0 0 1 2.4 7.2c-.5.4-.8 1-.8 1.6v.6H6.4v-.6c0-.6-.3-1.2-.8-1.6A4 4 0 0 1 8 1.8z" fill="none" stroke="${c}" stroke-width="1.2"/><path d="M6.4 12.6h3.2M6.9 14.3h2.2" stroke="${c}" stroke-width="1.2" stroke-linecap="round"/>`;

export const ICONS = {
  // Select modes (Edit Mode header)
  vertexsel: svg(`<path d="${CUBE}" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" opacity=".55"/><rect x="6.2" y="6.2" width="3.6" height="3.6" fill="currentColor"/>`),
  edgesel: svg(`<path d="${CUBE}" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" opacity=".55"/><path d="M8 8v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`),
  facesel: svg(`<path d="M2.5 5 8 8v6l-5.5-3z" fill="currentColor" opacity=".85"/><path d="${CUBE}" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" opacity=".55"/>`),
  // Editor types
  view3d: svg(`<path d="M8 1.8 13.6 5v6.2L8 14.4 2.4 11.2V5z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M2.4 5 8 8.2 13.6 5M8 8.2v6.2" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".7"/>`),
  outliner: svg(`<path d="M2.5 3.5h2M6 3.5h7.5M4.5 7h2M8 7h5.5M4.5 10.5h2M8 10.5h5.5M2.5 14h2M6 14h7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`),
  properties: svg(`<path d="M2.5 2.5h11v11h-11z" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`),
  uv: svg(`<path d="M2.5 2.5h11v11h-11z" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 11.5 8 4.5l3.5 7z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><rect x="7" y="3.5" width="2" height="2" fill="currentColor"/><rect x="3.5" y="10.5" width="2" height="2" fill="currentColor"/><rect x="10.5" y="10.5" width="2" height="2" fill="currentColor"/>`),
  image: svg(`<path d="M2.5 3.5h11v9h-11z" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="m3.5 11 3-3 2 2 2-1.5 2 2.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="10.5" cy="6" r="1.1" fill="currentColor"/>`),
  node: svg(`<rect x="1.5" y="3" width="5" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="9.5" y="9" width="5" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M6.5 5c3 0 0 6 3 6" fill="none" stroke="currentColor" stroke-width="1.1"/>`),
  graph: svg(`<path d="M2 13.5h12M2.5 2v11.5" stroke="currentColor" stroke-width="1" opacity=".6"/><path d="M3 12c3 0 3-8 5.5-8S11 10 14 10" fill="none" stroke="currentColor" stroke-width="1.3"/>`),
  // Interaction modes
  objectmode: svg(`<path d="M8 2 13.5 5v6L8 14l-5.5-3V5z" fill="currentColor" opacity=".25"/><path d="${CUBE}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>`),
  editmode: svg(`<path d="M8 2.6 13.4 12.6H2.6z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><rect x="6.6" y="1.3" width="2.8" height="2.8" fill="${THEME.object}"/><rect x="1.3" y="11.2" width="2.8" height="2.8" fill="currentColor"/><rect x="11.9" y="11.2" width="2.8" height="2.8" fill="currentColor"/>`),
  // Outliner: objects (orange) and their data (green)
  ob_mesh: svg(tri(THEME.object)), data_mesh: svg(tri(THEME.data)),
  ob_camera: svg(cam(THEME.object)), data_camera: svg(cam(THEME.data)),
  ob_light: svg(bulb(THEME.object)), data_light: svg(bulb(THEME.data)),
  ob_empty: svg(`<path d="M8 2v12M2 8h12M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4" stroke="${THEME.object}" stroke-width="1.2" stroke-linecap="round"/>`),
  ob_armature: svg(`<path d="M4 12.5 11 3.5l1.5 1.5-7 9z" fill="none" stroke="${THEME.object}" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="4" r="1.6" fill="${THEME.object}"/><circle cx="4.2" cy="12.2" r="1.6" fill="${THEME.object}"/>`),
  modifier: svg(`<path d="M10.6 2.2a3 3 0 0 0-3.4 3.9L2.5 10.8a1.3 1.3 0 0 0 1.8 1.8l4.7-4.7a3 3 0 0 0 3.9-3.4L11 6.4 9.6 5 11.5 3z" fill="${THEME.modifier}"/>`),
  material: svg(`<circle cx="8" cy="8" r="5.6" fill="${THEME.shading}"/><circle cx="6.2" cy="6" r="1.7" fill="#fff" opacity=".45"/>`),
  collection: svg(`<path d="M2.5 5.5h11v7.5h-11z" fill="none" stroke="${THEME.collection}" stroke-width="1.2" stroke-linejoin="round"/><path d="M3.8 3h8.4" stroke="${THEME.collection}" stroke-width="1.2" stroke-linecap="round"/>`),
  scene_collection: svg(`<path d="M2.5 5.5h11v7.5h-11z" fill="${THEME.collection}" fill-opacity=".18" stroke="${THEME.collection}" stroke-width="1.2" stroke-linejoin="round"/><path d="M3.8 3h8.4" stroke="${THEME.collection}" stroke-width="1.2" stroke-linecap="round"/>`),
  view_layer: svg(`<path d="M8 2.5 14 5.5 8 8.5 2 5.5z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="m2 8.5 6 3 6-3M2 11.2l6 3 6-3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" opacity=".7"/>`),
  posemode: svg(`<circle cx="8" cy="3.2" r="1.7" fill="currentColor"/><path d="M8 5.2v5M8 6.6 4.4 9M8 6.6l3.6 2.4M8 10.2l-2.4 4M8 10.2l2.4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`),
  weightpaint: svg(`<path d="M2.5 13.5c1.5 0 3-1 3-2.7 0-1-.8-1.8-1.8-1.8-1 0-1.7.8-1.7 1.8 0 1.2-.5 2.1 .5 2.7z" fill="#ff5a3c"/><path d="m5.8 9.3 7-7.2 1.4 1.4-7.2 7z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>`),
  timeline: svg(`<path d="M1.5 12.5h13" stroke="currentColor" stroke-width="1.1"/><path d="M4 3.5v9M8 5v7.5M12 3.5v9" stroke="currentColor" stroke-width="1" opacity=".6"/><path d="M8 2.5 10 4.5 8 6.5 6 4.5z" fill="currentColor"/>`),
  dopesheet: svg(`<path d="M1.5 4.5h13M1.5 8h13M1.5 11.5h13" stroke="currentColor" stroke-width="1" opacity=".45"/><path d="M4 2.8 5.7 4.5 4 6.2 2.3 4.5zM10 6.3 11.7 8 10 9.7 8.3 8zM6.5 9.8l1.7 1.7-1.7 1.7-1.7-1.7z" fill="currentColor"/>`),
  // Properties editor tabs
  tab_tool: svg(`<path d="m3 13 6-6M9.2 3.2a2.6 2.6 0 0 0 3.6 3.6l-1.4 1.4-2.2-.6-.6-2.2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`),
  tab_render: svg(`<rect x="2" y="4.5" width="12" height="8.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8.7" r="2.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.2 4.5 6.2 2.8h3.6l1 1.7" fill="none" stroke="currentColor" stroke-width="1.1"/>`),
  tab_output: svg(`<rect x="2" y="6" width="12" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 6V2.5h7V6M4.5 9.5h7v4h-7z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>`),
  tab_viewlayer: svg(`<path d="M3 3.5h10v7H3z" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5 12.5h8" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 9 7 6.5l2 2 1.5-1.5 1.5 1.5" fill="none" stroke="currentColor" stroke-width="1"/>`),
  tab_scene: svg(`<path d="M5.5 3 9 10.5H2z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="11" cy="10" r="2.8" fill="none" stroke="currentColor" stroke-width="1.1"/>`),
  tab_world: svg(`<circle cx="8" cy="8" r="5.6" fill="none" stroke="${THEME.shading}" stroke-width="1.2"/><path d="M3 6.5c2 1 3 0 4 1.5s-.5 2.5 1 3.5M9 2.6c-.5 1.5.5 2.2 2 2.4s2 1.3 2.2 2.5" fill="none" stroke="${THEME.shading}" stroke-width="1.1"/>`),
  tab_object: svg(`<rect x="3" y="3" width="10" height="10" rx="1.5" fill="${THEME.object}"/><rect x="5.5" y="5.5" width="5" height="5" rx=".8" fill="#2b2b2b" opacity=".35"/>`),
  tab_modifier: svg(`<path d="M10.6 2.2a3 3 0 0 0-3.4 3.9L2.5 10.8a1.3 1.3 0 0 0 1.8 1.8l4.7-4.7a3 3 0 0 0 3.9-3.4L11 6.4 9.6 5 11.5 3z" fill="${THEME.modifier}"/>`),
  tab_particles: svg(`<circle cx="4" cy="5" r="1.5" fill="${THEME.modifier}"/><circle cx="9" cy="3.5" r="1.3" fill="${THEME.modifier}"/><circle cx="12" cy="8" r="1.6" fill="${THEME.modifier}"/><circle cx="6" cy="10" r="1.7" fill="${THEME.modifier}"/><circle cx="10.5" cy="12.8" r="1.2" fill="${THEME.modifier}"/>`),
  tab_physics: svg(`<circle cx="8" cy="8" r="2" fill="${THEME.modifier}"/><ellipse cx="8" cy="8" rx="6" ry="2.6" fill="none" stroke="${THEME.modifier}" stroke-width="1.1" transform="rotate(-30 8 8)"/>`),
  tab_constraint: svg(`<path d="M6.5 9.5 9.5 6.5M7.2 4.8l1.3-1.3a2.3 2.3 0 0 1 3.3 3.3l-1.3 1.3M8.8 11.2l-1.3 1.3a2.3 2.3 0 0 1-3.3-3.3l1.3-1.3" fill="none" stroke="${THEME.modifier}" stroke-width="1.3" stroke-linecap="round"/>`),
  tab_data: svg(tri(THEME.data)),
  tab_material: svg(`<circle cx="8" cy="8" r="5.6" fill="${THEME.shading}"/><circle cx="6.2" cy="6" r="1.7" fill="#fff" opacity=".45"/>`),
  tab_texture: svg(`<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="${THEME.shading}" stroke-width="1.1"/><path d="M2.5 2.5h5.5v5.5H2.5zM8 8h5.5v5.5H8z" fill="${THEME.shading}"/>`),
  bone_data: svg(`<path d="M4 12.5 11 3.5l1.5 1.5-7 9z" fill="none" stroke="${THEME.data}" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="4" r="1.6" fill="${THEME.data}"/><circle cx="4.2" cy="12.2" r="1.6" fill="${THEME.data}"/>`),
  // Restriction toggles
  hide_off: svg(`<path d="M1.5 8s2.6-4.3 6.5-4.3S14.5 8 14.5 8 11.9 12.3 8 12.3 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>`),
  hide_on: svg(`<path d="M1.5 7.2s2.6 3.6 6.5 3.6 6.5-3.6 6.5-3.6M3.6 9.6 2.5 11.3M8 10.8v2M12.4 9.6l1.1 1.7" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`),
  render_off: svg(`<path d="M2.5 6h7v5.5h-7z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="m9.5 7.8 4-2v5.9l-4-2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>`),
  select_off: svg(`<path d="M4 2.5v10l2.6-2.4 1.8 4 1.6-.7-1.8-3.9h3.6z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>`),
  checkbox_on: svg(`<rect x="2.5" y="2.5" width="11" height="11" rx="2.2" fill="#4772b3"/><path d="m5 8.2 2 2 4-4.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  checkbox_off: svg(`<rect x="2.5" y="2.5" width="11" height="11" rx="2.2" fill="#545454"/>`),
  // Small UI bits
  disclosure_open: svg(`<path d="M4.5 6.2h7L8 10.4z" fill="currentColor"/>`),
  disclosure_closed: svg(`<path d="M6.2 4.5v7L10.4 8z" fill="currentColor"/>`),
  dropdown: svg(`<path d="m5 6.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`, 'bi-dd'),
  search: svg(`<circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="m10 10 3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`),
  filter: svg(`<path d="M2.5 3h11L9.3 8.2v4.8l-2.6-1.4V8.2z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>`),
  collection_new: svg(`<path d="M2.5 6.5h8.5v6.5h-8.5z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M12.5 1.5v5M10 4h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`),
  // 3D Viewport header, right side
  xray: svg(`<rect x="2" y="2" width="8.5" height="8.5" fill="currentColor" opacity=".35" stroke="currentColor" stroke-width="1"/><rect x="5.5" y="5.5" width="8.5" height="8.5" fill="none" stroke="currentColor" stroke-width="1.1"/>`),
  shading_wire: svg(`<circle cx="8" cy="8" r="5.7" fill="none" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="8" rx="2.4" ry="5.7" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.3 8h11.4" stroke="currentColor" stroke-width="1"/>`),
  shading_solid: svg(`<circle cx="8" cy="8" r="5.7" fill="currentColor"/><path d="M8 2.3a5.7 5.7 0 0 1 0 11.4" fill="#000" opacity=".3"/>`),
  shading_texture: svg(`<circle cx="8" cy="8" r="5.7" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 2.3v11.4M2.3 8h11.4" stroke="currentColor" stroke-width="1"/><path d="M8 2.3a5.7 5.7 0 0 1 5.7 5.7H8zM2.3 8H8v5.7A5.7 5.7 0 0 1 2.3 8z" fill="currentColor"/>`),
  shading_rendered: svg(`<circle cx="8" cy="8" r="5.7" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="6.3" cy="6.3" r="2.3" fill="currentColor"/>`),
  overlay: svg(`<circle cx="6" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="10" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.1"/>`),
  gizmo: svg(`<path d="M8 8V2.5M8 8l4.8 2.8M8 8l-4.8 2.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/>`),
  visibility: svg(`<path d="M1.5 8s2.6-4.3 6.5-4.3S14.5 8 14.5 8 11.9 12.3 8 12.3 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8" r="2" fill="currentColor"/>`),
  snap: svg(`<path d="M3.5 3v5a4.5 4.5 0 0 0 9 0V3h-2.7v5a1.8 1.8 0 0 1-3.6 0V3z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M3.5 5h2.7M9.8 5h2.7" stroke="currentColor" stroke-width="1.1"/>`),
  proportional: svg(`<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/>`),
  pivot_median: svg(`<circle cx="3.5" cy="4" r="1.3" fill="currentColor"/><circle cx="12.5" cy="5" r="1.3" fill="currentColor"/><circle cx="6" cy="12.5" r="1.3" fill="currentColor"/><circle cx="7.3" cy="7.2" r="1.8" fill="none" stroke="currentColor" stroke-width="1.1"/>`),
  orient_global: svg(`<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.1"/><ellipse cx="8" cy="8" rx="2.4" ry="5.6" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.4 8h11.2" stroke="currentColor" stroke-width="1"/>`),
};
export const icon = name => ICONS[name] || '';

// ─── Outliner ────────────────────────────────────────────────────────────────
// rows: [{ id, depth, name, icon, open (true/false/undefined = no triangle), inline: [icon names],
//          sel, active, dim, mode ('edit' shows the mode icon), exclude (true/false for collections),
//          eye (true = visible), cam (true = in renders) }]
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function outlinerHTML(rows, { title = 'Outliner', showMode = false } = {}) {
  const head = `<div class="bo-head">
    <span class="bo-btn bo-editor" title="Editor Type">${ICONS.outliner}${ICONS.dropdown}</span>
    <span class="bo-btn" title="Display Mode: View Layer">${ICONS.view_layer}${ICONS.dropdown}</span>
    <span class="bo-search">${ICONS.search}<span></span></span>
    <span class="bo-btn" title="Filter">${ICONS.filter}${ICONS.dropdown}</span>
    <span class="bo-btn" title="New Collection">${ICONS.collection_new}</span>
  </div>`;
  const body = rows.map((r, i) => {
    const tri = r.open === true ? ICONS.disclosure_open : r.open === false ? ICONS.disclosure_closed : '<i class="bo-tri-sp"></i>';
    const mode = showMode ? `<span class="bo-mode">${r.mode === 'edit' ? ICONS.editmode : r.mode === 'object' ? '<i class="bo-dot"></i>' : ''}</span>` : '';
    const inline = (r.inline || []).map(n => `<span class="bo-inline">${ICONS[n]}</span>`).join('');
    const tg = [
      r.exclude === undefined ? '<i class="bo-tg-sp"></i>' : `<span class="bo-tg" data-ol-tg="exclude">${r.exclude ? ICONS.checkbox_off : ICONS.checkbox_on}</span>`,
      r.eye === undefined ? '<i class="bo-tg-sp"></i>' : `<span class="bo-tg${r.eye ? '' : ' off'}" data-ol-tg="eye" title="Hide in Viewport">${r.eye ? ICONS.hide_off : ICONS.hide_on}</span>`,
      r.cam === undefined ? '<i class="bo-tg-sp"></i>' : `<span class="bo-tg${r.cam ? '' : ' off'}" data-ol-tg="cam" title="Disable in Renders">${ICONS.render_off}</span>`,
    ].join('');
    const cls = ['bo-row', i % 2 ? 'odd' : '', r.sel ? 'sel' : '', r.active ? 'active' : '', r.dim ? 'dim' : '', r.id ? 'pick' : ''].filter(Boolean).join(' ');
    return `<li class="${cls}"${r.id ? ` data-ol-id="${esc(r.id)}" role="button" tabindex="0"` : ''}>${mode}<span class="bo-indent" style="width:${(r.depth || 0) * 14}px"></span><span class="bo-tri">${tri}</span><span class="bo-icon">${ICONS[r.icon] || ''}</span><span class="bo-name">${esc(r.name)}</span>${inline}${r.lock ? '<span class="bo-lock" title="Locked in this step">🔒</span>' : ''}<span class="bo-tgs">${tg}</span></li>`;
  }).join('');
  return `<div class="bo" data-no-i18n aria-label="${esc(title)}">${head}<ul class="bo-tree">${body}</ul></div>`;
}

// ─── Make an existing lab header look like Blender's ─────────────────────────
// .editor-type (icon + name) becomes the Editor Type dropdown (the name stays for screen readers only, as Blender shows no name);
// .editor-role tags are lab extras and are hidden; .mode-pill and .mode-select get their mode icon and a dropdown arrow.
const EDITOR_ICON = [[/3D Viewport/, 'view3d'], [/UV Editor/, 'uv'], [/Image Editor/, 'image'], [/Shader Editor/, 'node'], [/Graph Editor/, 'graph'], [/Timeline/, 'timeline'], [/Dope Sheet/, 'dopesheet'], [/Outliner/, 'outliner'], [/Properties/, 'properties']];
const MODE_ICON = [[/Edit Mode/, 'editmode'], [/Pose Mode/, 'posemode'], [/Weight Paint/, 'weightpaint'], [/Object Mode/, 'objectmode']];
const pick = (list, text) => (list.find(([re]) => re.test(text)) || [])[1];
export function blenderize(root = document) {
  for (const el of root.querySelectorAll('[data-bicon]')) el.innerHTML = ICONS[el.dataset.bicon] || '';
  for (const el of root.querySelectorAll('.editor-type:not(.bz)')) {
    el.classList.add('bz');
    el.querySelector(':scope > svg')?.remove();
    const sel = el.querySelector('select');
    const btn = document.createElement('span'); btn.className = 'bh-dd bh-editor bz-editor';
    el.prepend(btn);
    let wrap = null;
    if (!sel) {
      wrap = document.createElement('span'); wrap.className = 'bz-label';
      for (const n of [...el.childNodes]) if (n !== btn && !(n.nodeType === 1 && n.matches('.obj-badge'))) wrap.append(n);
      el.insertBefore(wrap, btn.nextSibling);
    } else el.classList.add('bz-has-select');
    const update = () => { const text = sel ? sel.options[sel.selectedIndex]?.text || '' : wrap.textContent; const ic = pick(EDITOR_ICON, text) || 'view3d'; btn.innerHTML = ICONS[ic] + (sel ? '' : ICONS.dropdown); btn.title = `Editor Type: ${text.trim()}`; };
    update();
    if (wrap) new MutationObserver(update).observe(wrap, { childList: true, characterData: true, subtree: true });
    sel?.addEventListener('change', update);
  }
  for (const el of root.querySelectorAll('.editor-role')) el.classList.add('bz-hidden');
  for (const el of root.querySelectorAll('.mode-pill:not(.bz)')) {
    el.classList.add('bz', 'bh-dd');
    const text = el.textContent.trim(), ic = pick(MODE_ICON, text) || 'objectmode';
    el.innerHTML = `${ICONS[ic]}<span>${text}</span>${ICONS.dropdown}`;
  }
  for (const el of root.querySelectorAll('.mode-select:not(.bz)')) {
    const s = el.querySelector('select'); if (!s) continue;
    el.classList.add('bz', 'bz-mode-select');
    const ic = document.createElement('span'); ic.className = 'bz-mode-ic';
    el.prepend(ic);
    let last = '';
    const upd = () => { const text = s.options[s.selectedIndex]?.text || ''; if (text === last) return; last = text; ic.innerHTML = ICONS[pick(MODE_ICON, text) || 'objectmode']; };
    upd(); s.addEventListener('change', upd);
    setInterval(upd, 300); // Tab changes the value without a change event.
  }
}
