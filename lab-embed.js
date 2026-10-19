import { getLang, onLangChange } from './i18n.js';
import { accentText, colorContrast, colorInk, embedCode, embedTheme, embedTitle, isEmbeddedLab, isLabLink } from './lab-embed-core.js';

const TXT = {
  copy: { ca: 'Copia iframe', es: 'Copia iframe', en: 'Copy iframe' },
  title: { ca: 'Insereix aquest lab en una altra pàgina', es: 'Inserta este lab en otra página', en: 'Embed this lab on another page' },
  fold: { ca: 'Desplegable (obrir i plegar)', es: 'Desplegable (abrir y plegar)', en: 'Collapsible (expand and fold)' },
  copied: { ca: 'Iframe copiat', es: 'Iframe copiado', en: 'Iframe copied' },
  manual: { ca: 'Selecciona i copia el codi de sota.', es: 'Selecciona y copia el código de abajo.', en: 'Select and copy the code below.' },
  close: { ca: 'Tanca', es: 'Cerrar', en: 'Close' },
  theme: { ca: 'Colors del lab', es: 'Colores del lab', en: 'Lab colours' },
  blue: { ca: 'Blau', es: 'Azul', en: 'Blue' },
  yellow: { ca: 'Groc', es: 'Amarillo', en: 'Yellow' },
  original: { ca: 'Groc i negre', es: 'Amarillo y negro', en: 'Yellow and black' },
  custom: { ca: 'Personalitzat', es: 'Personalizado', en: 'Custom' },
  accent: { ca: 'Color principal', es: 'Color principal', en: 'Accent colour' },
  background: { ca: 'Fons exterior', es: 'Fondo exterior', en: 'Outer background' },
  note: { ca: 'Els colors dels exercicis i dels editors es conserven. Els textos s’ajusten per mantenir el contrast.', es: 'Se conservan los colores de los ejercicios y de los editores. Los textos se ajustan para mantener el contraste.', en: 'Exercise and editor colours are preserved. Text colours adjust to maintain contrast.' },
  sample: { ca: 'Mostra de colors', es: 'Muestra de colores', en: 'Colour sample' },
};
const say = key => TXT[key][getLang()] || TXT[key].en;
const embedded = isEmbeddedLab(location.href, window.self !== window.top);

function restrictLinks() {
  document.querySelectorAll('.brand').forEach(brand => brand.remove());
  for (const a of document.querySelectorAll('a[href]')) {
    if (!isLabLink(a.getAttribute('href'), location.href)) {
      a.remove();
    } else {
      const url = new URL(a.href); url.searchParams.set('embed', '1');
      for (const [key, value] of Object.entries(embedTheme(location.href))) if (value) url.searchParams.set(key, value);
      if (a.href !== url.href) a.href = url.href;
      a.removeAttribute('target');
    }
  }
}

export function setupEmbed() {
  if (embedded) {
    document.documentElement.classList.add('lab-embedded');
    const theme = embedTheme(location.href), style = document.documentElement.style;
    if (theme.accent) {
      style.setProperty('--lab-accent', theme.accent);
      style.setProperty('--lab-accent-ink', colorInk(theme.accent));
      style.setProperty('--lab-accent-text', accentText(theme.accent));
    }
    if (theme.background) {
      style.setProperty('--bg', theme.background);
      style.setProperty('--lab-background-ink', colorInk(theme.background));
      const headingAccent = theme.accent || '#ffbf00';
      style.setProperty('--lab-heading-accent', colorContrast(headingAccent, theme.background) >= 4.5 ? headingAccent : colorInk(theme.background));
    }
    document.title = embedTitle(document.title);
    restrictLinks();
    // Some labs rebuild their navigation when changing steps or language.
    new MutationObserver(restrictLinks).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (link && !isLabLink(link.href, location.href)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    return;
  }
  const header = document.querySelector('.header-actions') || document.querySelector('.site-header');
  if (!header || header.querySelector('.lab-embed-button')) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'lab-embed-button'; button.dataset.noI18n = '';
  const dialog = document.createElement('dialog');
  dialog.className = 'lab-embed-dialog'; dialog.dataset.noI18n = '';
  dialog.innerHTML = '<form method="dialog"><h2 id="embed-title"></h2><label class="embed-option"><input type="checkbox" checked> <span></span></label><label class="embed-theme-label"><span></span><select class="embed-theme"><option value="original"></option><option value="blue"></option><option value="yellow"></option><option value="custom"></option></select></label><div class="embed-colours"><label><span class="accent-label"></span><input type="color" class="embed-accent" value="#ffbf00"><input type="text" class="embed-accent-hex" value="#ffbf00" pattern="#[0-9a-fA-F]{6}" maxlength="7" spellcheck="false"></label><label><span class="background-label"></span><input type="color" class="embed-background" value="#191b1e"><input type="text" class="embed-background-hex" value="#191b1e" pattern="#[0-9a-fA-F]{6}" maxlength="7" spellcheck="false"></label></div><div class="embed-sample"><span></span><b>Lab</b></div><p class="embed-theme-note"></p><textarea readonly rows="7" spellcheck="false"></textarea><div class="embed-actions"><button type="button" class="embed-copy"></button><button class="embed-close" formnovalidate></button></div><p role="status" aria-live="polite"></p></form>';
  dialog.setAttribute('aria-labelledby', 'embed-title');
  document.body.append(dialog); header.append(button);
  const checkbox = dialog.querySelector('input[type=checkbox]'), code = dialog.querySelector('textarea'), status = dialog.querySelector('[role="status"]');
  const themeSelect = dialog.querySelector('.embed-theme'), accent = dialog.querySelector('.embed-accent'), background = dialog.querySelector('.embed-background');
  const accentHex = dialog.querySelector('.embed-accent-hex'), backgroundHex = dialog.querySelector('.embed-background-hex');
  const presets = { original: ['#ffbf00', '#191b1e'], blue: ['#0055a4', '#edf5ff'], yellow: ['#ffd000', '#fffbea'] };
  const updateCode = () => {
    code.value = embedCode(location.href, document.title, { collapsible: checkbox.checked, accent: accent.value, background: background.value }); status.textContent = '';
    const sample = dialog.querySelector('.embed-sample');
    sample.style.background = background.value; sample.style.color = colorInk(background.value); sample.style.borderColor = accent.value;
    sample.querySelector('b').style.background = accent.value; sample.querySelector('b').style.color = colorInk(accent.value);
  };
  const render = () => {
    button.textContent = say('copy'); button.title = say('title');
    dialog.querySelector('h2').textContent = say('title');
    dialog.querySelector('.embed-option span').textContent = say('fold');
    dialog.querySelector('.embed-theme-label span').textContent = say('theme');
    for (const option of themeSelect.options) option.textContent = say(option.value);
    dialog.querySelector('.accent-label').textContent = say('accent');
    dialog.querySelector('.background-label').textContent = say('background');
    accent.setAttribute('aria-label', say('accent')); background.setAttribute('aria-label', say('background'));
    accentHex.setAttribute('aria-label', say('accent') + ' HEX'); backgroundHex.setAttribute('aria-label', say('background') + ' HEX');
    dialog.querySelector('.embed-theme-note').textContent = say('note');
    dialog.querySelector('.embed-sample span').textContent = say('sample');
    dialog.querySelector('.embed-copy').textContent = say('copy');
    dialog.querySelector('.embed-close').textContent = say('close');
    code.setAttribute('aria-label', say('copy')); updateCode();
  };
  button.addEventListener('click', () => { updateCode(); dialog.showModal(); });
  checkbox.addEventListener('change', updateCode);
  themeSelect.addEventListener('change', () => {
    const preset = presets[themeSelect.value];
    if (preset) { [accent.value, background.value] = preset; accentHex.value = accent.value; backgroundHex.value = background.value; }
    updateCode();
  });
  for (const [picker, hex] of [[accent, accentHex], [background, backgroundHex]]) {
    picker.addEventListener('input', () => { hex.value = picker.value; themeSelect.value = 'custom'; updateCode(); });
    hex.addEventListener('input', () => {
      if (!/^#[0-9a-f]{6}$/i.test(hex.value)) return;
      picker.value = hex.value; themeSelect.value = 'custom'; updateCode();
    });
  }
  dialog.querySelector('.embed-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code.value); status.textContent = say('copied'); }
    catch { code.focus(); code.select(); status.textContent = say('manual'); }
  });
  onLangChange(render); render();
}
