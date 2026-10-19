// Shared, DOM-free helpers for portable lab embeds.
export function labPath(url) {
  return new URL(url).pathname.match(/^(.*\/labs\/[^/]+)(?:\/|$)/)?.[1] || null;
}

export function isLabLink(href, current) {
  try {
    const url = new URL(href, current), here = new URL(current);
    return url.origin === here.origin && labPath(url) === labPath(here) && labPath(here) !== null
      && (url.pathname === `${labPath(here)}/` || url.pathname === `${labPath(here)}/index.html`);
  } catch { return false; }
}

const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function embedTitle(title) {
  return String(title).replace(/\s*[·|–—-]\s*(?:CIFOG|Carrot\s+Revolt)(?:\s+Labs?)?\s*$/i, '').trim();
}

export function isEmbeddedLab(url, framed = false) {
  return framed || new URL(url).searchParams.get('embed') === '1';
}

export function hexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : null;
}

const luminance = color => {
  const rgb = color.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
export const colorContrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
export const colorInk = color => {
  if (colorContrast(color, '#ffffff') > colorContrast(color, '#17191b')) return '#ffffff';
  return colorContrast(color, '#17191b') >= 4.5 ? '#17191b' : '#000000';
};

export function accentText(color) {
  // Accent labels sit on dark software panels; lighten dark brand colours for legibility.
  const rgb = color.slice(1).match(/../g).map(c => parseInt(c, 16));
  for (let mix = 0; mix <= 100; mix++) {
    const candidate = '#' + rgb.map(c => Math.round(c + (255 - c) * mix / 100).toString(16).padStart(2, '0')).join('');
    if (colorContrast(candidate, '#353940') >= 4.5) return candidate;
  }
  return '#ffffff';
}

export function embedTheme(current) {
  const params = new URL(current).searchParams;
  return { accent: hexColor(params.get('accent')), background: hexColor(params.get('background')) };
}

export function embedCode(current, title, { collapsible = true, accent, background } = {}) {
  title = embedTitle(title);
  const url = new URL(current);
  if (!labPath(url)) throw new Error('A lab URL is required');
  url.pathname = `${labPath(url)}/`;
  url.search = '?embed=1';
  accent = hexColor(accent); background = hexColor(background);
  if (accent) url.searchParams.set('accent', accent);
  if (background) url.searchParams.set('background', background);
  url.hash = '';
  const frame = `<iframe src="${escape(url.href)}" title="${escape(title)}" width="100%" height="800" style="display:block;width:100%;height:80vh;min-height:480px;border:0" loading="lazy" sandbox="allow-scripts allow-same-origin" allow="fullscreen" allowfullscreen></iframe>`;
  const detailsStyle = accent || background ? ` style="border:1px solid ${accent || '#383c42'};border-radius:8px;overflow:hidden;background:${background || '#191b1e'};color:${colorInk(background || '#191b1e')}"` : '';
  return collapsible ? `<details${detailsStyle}>\n  <summary style="cursor:pointer;padding:12px;font-weight:600">${escape(title)}</summary>\n  ${frame}\n</details>` : frame;
}
