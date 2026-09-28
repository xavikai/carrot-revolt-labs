// Stages of the Color & Type Lab. Every step loads its own state of the page.
import * as C from './color.js';
import * as T from './type.js';
import * as D from './doc.js';

const good = (o) => D.goodState(o);
const setText = (st, id, props) => { st.type[id] = { ...D.textProps(st, id), ...props }; delete st.type[id].width; };
export const TARGET = '#5b34c9';                   // the brand purple of stage 1, step 1
export const GAMUT_START = { button: '#1f4bff', chip: '#a6ff00' };
export const LINE_PARTS = ['baseline', 'xheight', 'cap', 'ascender', 'descender'];
export const LINE_NAMES = { baseline: 'Baseline', xheight: 'x-height', cap: 'Cap height', ascender: 'Ascender', descender: 'Descender' };
export const LINE_ABOUT = {
  baseline: 'The line the letters sit on.',
  xheight: 'The height of the lower-case letters without ascenders (x, a, e). It decides how big a font looks.',
  cap: 'The height of the capitals (H, T).',
  ascender: 'The strokes of b, d, h, k, l that rise above the x-height; often taller than the capitals.',
  descender: 'The strokes of g, j, p, q, y that go below the baseline.',
};
const smallestX = () => T.FAMILIES.reduce((a, b) => (T.FONTS[a].xHeight <= T.FONTS[b].xHeight ? a : b));
// Two status colours are told apart by someone with deuteranopia (ΔE2000 of the simulated colours).
export const cvdDistance = st => C.hexDelta(C.simulate(D.fill(st, 'okChip'), 'deuteranopia'), C.simulate(D.fill(st, 'noChip'), 'deuteranopia'));
export const gamutOk = (st, id) => {
  const hex = D.fill(st, id), n = C.nearestPrintable(hex), h0 = C.hueOf(C.hexToLab(GAMUT_START[id])), h1 = C.hueOf(C.hexToLab(hex));
  return { printable: n.dE <= C.GAMUT_TOLERANCE, dE: n.dE, hue: C.hueDiff(h0, h1), ok: n.dE <= C.GAMUT_TOLERANCE && C.hueDiff(h0, h1) <= 30 };
};
const exact = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.5);
export const richBlackOk = cmyk => cmyk[3] >= 99.5 && C.totalInk(cmyk) >= 240 && C.totalInk(cmyk) <= C.INK_LIMIT;

export const STAGES = [
  {
    id: 'color', name: 'Colour on screen', sub: 'HSL · contrast · colour vision',
    steps: [
      {
        id: 'c1', title: 'Mix by hue, saturation and lightness',
        text: 'The brand colour is the purple of the swatch, but nobody gave you its hex code. Select the Button and mix the colour with the HSL sliders: first the hue (the colour on the wheel), then the saturation (how intense) and the lightness (how much white or black).',
        how: ['Click the <b>Button</b> on the page (or in Layers).', 'In <b>Fill</b>, move <b>H</b> until the hue matches, then <b>S</b> and <b>L</b>.', 'The panel shows the difference ΔE: under 5 the eye barely sees it.'],
        why: 'HSL follows how we describe a colour in words, so it is the easiest way to mix one by eye. The hex code is the same colour written for the computer.',
        lock: ['hex'], target: TARGET, focus: 'button',
        start: () => { const st = good(); st.fills.button = '#8c8c8c'; return st; },
        check: st => C.hexDelta(D.fill(st, 'button'), TARGET) <= 5,
        solve: st => { st.fills.button = TARGET; },
      },
      {
        id: 'c2', title: 'Readable grey text',
        text: 'Light grey text looks elegant and nobody can read it. The subtitle, the body text and the film details have a contrast of about 2.5:1 on their backgrounds. WCAG asks for 4.5:1 for normal text. Darken them until the three pass AA.',
        how: ['Select a text layer: the <b>Contrast</b> panel shows its ratio against the layer behind it.', 'Lower its lightness (<b>L</b>) or type a darker hex.', 'Do it for <b>Subtitle</b>, <b>Body</b> and <b>Details</b>.'],
        why: 'Contrast depends on luminance, not on hue: a grey, a blue or a green with the same luminance read the same. 4.5:1 (AA) is the minimum; 7:1 (AAA) is better for long texts.',
        focus: 'body',
        start: () => { const st = good(); for (const id of ['subtitle', 'body', 'meta']) st.fills[id] = '#a6a4b0'; return st; },
        check: st => ['subtitle', 'body', 'meta'].every(id => D.textContrast(st, id).AA),
        solve: st => { st.fills.subtitle = '#5c5a6b'; st.fills.body = '#1d1b26'; st.fills.meta = '#5c5a6b'; },
      },
      {
        id: 'c3', title: 'A button everyone can read',
        text: 'The yellow button with a white label disappears. Two rules apply: the label needs 4.5:1 against the button, and the button itself needs 3:1 against the page so people see there is a button at all.',
        how: ['Select the <b>Button</b> and look at the contrast with the page (non-text contrast, 3:1).', 'Select the <b>Button label</b>: it needs 4.5:1 against the button.', 'A dark button with a white label, or a dark label on a mid-tone button: try both.'],
        why: 'WCAG 1.4.11 asks 3:1 for the shapes of buttons, fields and icons, not only for text.',
        focus: 'button',
        start: () => { const st = good(); st.fills.button = '#ffd23f'; st.fills.label = '#ffffff'; return st; },
        check: st => D.textContrast(st, 'label').AA && C.contrast(D.fill(st, 'button'), D.fill(st, 'page')) >= 3,
        solve: st => { st.fills.button = '#5b34c9'; st.fills.label = '#ffffff'; },
      },
      {
        id: 'c4', title: 'Not only colour',
        text: 'About 1 man in 12 does not tell red from green well. The film card says Available in green and Sold out in red. Look at the page as someone with deuteranopia, then make the two states different for everybody: change their lightness, or turn on the icons.',
        how: ['In the header, set <b>View</b> to <b>Deuteranopia</b>: the two chips look alike.', 'Select a chip and make one clearly lighter or darker than the other (the panel measures the difference as seen with deuteranopia).', 'Or turn on <b>Icons</b> so the state does not depend on colour.'],
        why: 'WCAG 1.4.1: colour must never be the only way to show information. A shape, an icon or a word must say it too.',
        focus: 'noChip', cvd: true,
        start: () => { const st = good(); st.fills.okChip = '#3f9a45'; st.fills.noChip = '#c24b3c'; st.fills.okText = '#ffffff'; st.fills.noText = '#ffffff'; return st; },
        check: (st, c) => !!c.flags.cvdSeen && (st.icons || cvdDistance(st) >= 20),
        solve: (st, flags) => { flags.cvdSeen = true; st.icons = true; },
      },
    ],
  },
  {
    id: 'print', name: 'Screen and print', sub: 'RGB · CMYK · gamut · ink',
    steps: [
      {
        id: 'p1', title: 'Light and ink',
        text: 'A screen adds light: red, green and blue lights together make white. Paper subtracts: cyan, magenta and yellow inks each absorb one light, and together they make (almost) black. Make white with the lights, black with the inks, and a red with only two inks.',
        how: ['Turn on the three lights of the <b>RGB</b> diagram.', 'Turn on the three inks of the <b>CMYK</b> diagram.', 'Then find the two inks that print red.'],
        why: 'This is why a colour on screen and the same colour printed never match exactly: they are made in opposite ways.',
        view: 'lightink',
        start: () => good(),
        check: (st, c) => !!(c.flags.white && c.flags.black && c.flags.red),
        solve: (st, flags) => { flags.white = flags.black = flags.red = true; flags.rgb = [1, 1, 1]; flags.cmy = [0, 1, 1]; },
      },
      {
        id: 'p2', title: 'Out of gamut',
        text: 'The festival will print its programme. The electric blue button and the lime tag chip cannot be printed with CMYK inks: they are out of gamut. Turn on Proof colours to see how they would print, then change them to colours the press can print, keeping their hue.',
        how: ['Turn on <b>Proof colours (CMYK)</b> in the header: striped layers are out of gamut.', 'Select the <b>Button</b>: lower its saturation or lightness until the warning goes away.', 'Do the same with the <b>Tag chip</b>. The hue must stay within 30° of the original.'],
        why: 'Screens can show saturated blues, greens and oranges that inks cannot reach. Designing inside the print gamut avoids surprises at the printer.',
        focus: 'button', proof: true,
        start: () => { const st = good(); st.fills.button = GAMUT_START.button; st.fills.chip = GAMUT_START.chip; st.fills.tag = '#1d1b26'; return st; },
        check: (st, c) => !!c.flags.proofSeen && gamutOk(st, 'button').ok && gamutOk(st, 'chip').ok,
        solve: (st, flags) => { flags.proofSeen = true; st.fills.button = C.nearestPrintable(GAMUT_START.button).hex; st.fills.chip = C.nearestPrintable(GAMUT_START.chip).hex; },
      },
      {
        id: 'p3', title: 'Black is not one black',
        text: 'In print, small text must be black ink only (K 100): four inks would never line up exactly and the letters would blur. Large dark areas look better in rich black: black with some cyan, magenta and yellow under it. But the paper only takes so much ink: the total must not pass 300%.',
        how: ['Select the <b>Body</b> text and set its ink to C 0, M 0, Y 0, K 100.', 'Select the <b>Nav bar</b>: it is C 100 M 100 Y 100 K 100 (400%). Keep K 100 and reduce C, M and Y.', 'Aim for a total between 240% and 300%, for example C 60 M 40 Y 40 K 100.'],
        why: 'Printers call the maximum the total area coverage (TAC). Too much ink takes long to dry, smudges and sticks the sheets together.',
        focus: 'nav', cmyk: true,
        start: () => { const st = good(); st.cmyk = { body: [75, 68, 67, 90], nav: [100, 100, 100, 100], brand: [0, 0, 0, 0], links: [0, 0, 0, 0] }; return st; },
        check: st => exact(st.cmyk.body || [], [0, 0, 0, 100]) && richBlackOk(st.cmyk.nav || [0, 0, 0, 0]),
        solve: st => { st.cmyk.body = [0, 0, 0, 100]; st.cmyk.nav = [60, 40, 40, 100]; },
      },
    ],
  },
  {
    id: 'type', name: 'Typography', sub: 'Anatomy · legibility',
    steps: [
      {
        id: 't1', title: 'Anatomy of a letter',
        text: 'Every font is drawn on the same invisible lines. Click the five lines of the specimen as the lab names them. Then compare the fonts: find the one with the smallest x-height, the one that looks smallest at the same size.',
        how: ['Click the line named in the panel.', 'When you have found the five, change the <b>font</b> of the specimen and watch the x-height line move.', 'Leave the specimen on the font with the smallest x-height.'],
        why: 'Two fonts at 16 px can look very different in size: what the eye reads is the x-height. Fonts for small text have big x-heights.',
        view: 'specimen',
        start: () => good(),
        check: (st, c) => LINE_PARTS.every(p => c.flags.lines?.includes(p)) && (c.flags.specimen || 'Merriweather') === smallestX(),
        solve: (st, flags) => { flags.lines = [...LINE_PARTS]; flags.specimen = smallestX(); },
      },
      {
        id: 't2', title: 'Comfortable body text',
        text: 'The paragraph is tiny, its lines are too close and each one is far too long: the eye gets lost going back to the start of the next line. Make it comfortable to read on screen.',
        how: ['Select the <b>Body</b> text.', 'Size 16–20 px, line height 140–170 %.', 'Change the width of the text box until each line has 45–75 characters.'],
        why: 'These are the classic figures for reading on screen. Long lines need more line height; short lines, less.',
        focus: 'body',
        start: () => { const st = good(); setText(st, 'body', { size: 12, lh: 1.0 }); st.width = 900; return st; },
        check: st => { const b = T.bodyChecks(D.textProps(st, 'body')); return b.size && b.lh && b.chars; },
        solve: st => { setText(st, 'body', { size: 16, lh: 1.5 }); st.width = D.BODY_WIDTH; },
      },
      {
        id: 't3', title: 'A font for reading',
        text: 'Somebody chose the fonts for their personality: the body text is in a script and the subtitle in a monospaced font. Keep the display font for the title if you like, but use a text face (a sans serif or a serif) for everything people have to read.',
        how: ['Select the <b>Body</b>: in <b>Text</b>, choose a sans serif or a serif.', 'Do the same with the <b>Subtitle</b>.', 'The panel says what kind of font each one is.'],
        why: 'Display, script and monospaced faces are made for a few big words or for code. Text faces have open shapes, even rhythm and a big x-height.',
        focus: 'body',
        start: () => { const st = good(); setText(st, 'body', { family: 'Lobster', weight: 400 }); setText(st, 'subtitle', { family: 'JetBrains Mono' }); return st; },
        check: st => T.isTextFace(D.textProps(st, 'body').family) && T.isTextFace(D.textProps(st, 'subtitle').family),
        solve: st => { setText(st, 'body', { family: 'Inter', weight: 400 }); setText(st, 'subtitle', { family: 'Inter' }); },
      },
      {
        id: 't4', title: 'Tracking and capitals',
        text: 'Small capitals need air between the letters; big titles need less than the default. The tag is in capitals with no letter spacing, and the title has been spaced out. Fix both.',
        how: ['Select the <b>Tag</b>: set <b>Letter spacing</b> between 5 % and 15 %.', 'Select the <b>Title</b>: set it between -3 % and 0 %.', 'Letter spacing is measured in % of the font size, as in Figma.'],
        why: 'Capitals are all the same height, so without extra spacing they form a block. At big sizes the default spacing looks loose, so titles are tightened.',
        focus: 'tag',
        start: () => { const st = good(); setText(st, 'tag', { ls: 0 }); setText(st, 'title', { ls: 0.1 }); return st; },
        check: st => { const a = D.textProps(st, 'tag').ls, b = D.textProps(st, 'title').ls; return a >= 0.05 - 1e-6 && a <= 0.15 + 1e-6 && b >= -0.03 - 1e-6 && b <= 1e-6; },
        solve: st => { setText(st, 'tag', { ls: 0.08 }); setText(st, 'title', { ls: -0.01 }); },
      },
    ],
  },
  {
    id: 'system', name: 'Hierarchy and system', sub: 'Scale · styles · tokens · dark mode',
    steps: [
      {
        id: 's1', title: 'A type scale',
        text: 'All the text styles are nearly the same size, so nothing stands out. Build a type scale: pick a base size for the body and a ratio, and every level is that ratio bigger than the one below.',
        how: ['Open <b>Text styles</b> in the Design panel.', 'Use <b>Type scale</b>: choose a base of 16 px and a ratio (1.25 is a good start) and apply it.', 'Or type the sizes: body 16–18 px, caption at least 12 px, every step ×1.15 to ×2.'],
        why: 'A scale gives a few clear sizes instead of many almost equal ones: the reader sees the hierarchy at once.',
        styles: true,
        start: () => { const st = good({ linked: true }); Object.assign(st.styles.h1, { size: 20 }); Object.assign(st.styles.h2, { size: 19 }); Object.assign(st.styles.body, { size: 18 }); Object.assign(st.styles.caption, { size: 17 }); return st; },
        check: st => T.scaleChecks(D.levelSizes(st)).ok,
        solve: st => { const s = T.scaleSizes(16, 1.25); for (const k of ['h1', 'h2', 'body', 'caption']) st.styles[k].size = Math.round(s[k] * 10) / 10; },
      },
      {
        id: 's2', title: 'Two families at most',
        text: 'Every style uses a different font. A system needs at most two families: one for headings and one for text (or a single family with different weights). Headings bold, body text regular.',
        how: ['In <b>Text styles</b>, set the same family for Body, Caption, Label and Button.', 'Choose one family for Heading 1 and Heading 2.', 'Headings at 700, Body at 400.'],
        why: 'Contrast between a display face for headings and a text face for reading, or weight within one family, is enough. More families look like noise.',
        styles: true,
        start: () => { const st = good({ linked: true }); st.styles.h1.family = 'Lobster'; st.styles.h1.weight = 400; st.styles.h2.family = 'Jost'; st.styles.body.family = 'Merriweather'; st.styles.caption.family = 'JetBrains Mono'; st.styles.label.family = 'Jost'; st.styles.body.weight = 700; return st; },
        check: st => D.families(st).length <= 2 && st.styles.h1.weight >= 700 && st.styles.h2.weight >= 700 && st.styles.body.weight === 400,
        solve: st => { st.styles = JSON.parse(JSON.stringify(D.GOOD_STYLES)); },
      },
      {
        id: 's3', title: 'Colour styles',
        text: 'The page was made by hand: every layer has its own hex code, some of them almost the same grey. Link every layer to a colour style, then adjust the styles so every pair that has to be read passes its contrast.',
        how: ['Select a layer and, in <b>Fill</b>, choose a style from the <b>Style</b> menu.', 'Every layer must use a style: the Layers panel marks the ones still in hex.', 'In <b>Colour styles</b>, fix the pairs that fail (the panel lists them).'],
        why: 'With styles (variables or tokens) a change in one place changes the whole design, and a contrast checked once is safe everywhere.',
        tokens: true,
        start: () => {
          const st = good(); const raw = { page: '#ffffff', nav: '#f5f3fa', brand: '#222029', links: '#8a8797', chip: '#ede7ff', tag: '#6a4bd6', title: '#1e1c27', subtitle: '#898695', body: '#23212b', button: '#7b5ce6', label: '#ffffff', link: '#7b5ce6', card: '#f3f1fb', cardTitle: '#1f1d28', meta: '#8f8c9b', okChip: '#1b6e34', okText: '#ffffff', noChip: '#b3261e', noText: '#ffffff' };
          Object.assign(st.fills, raw); st.colors.muted.light = '#8a8797'; st.colors.primary.light = '#7b5ce6'; return st;
        },
        check: st => D.allLinked(st) && D.pairResults(st, 'light').every(p => p.ok) && D.TEXT_LAYERS.every(id => D.textContrast(st, id).AA),
        solve: st => { for (const l of D.LAYERS) if (l.token) st.fills[l.id] = '@' + l.token; st.colors.muted.light = D.GOOD_COLORS.muted.light; st.colors.primary.light = D.GOOD_COLORS.primary.light; },
      },
      {
        id: 's4', title: 'Dark mode',
        text: 'The styles have a second mode, Dark. Somebody copied the light values into it. Switch the page to Dark and give every colour style a dark value: a dark background (not pure black), light text, and every pair passing its contrast.',
        how: ['Switch <b>Mode</b> to <b>Dark</b> in Colour styles.', 'Background and surface dark (lightness under 25 % of white), text light.', 'The primary colour usually becomes lighter and less saturated in dark mode.'],
        why: 'Dark mode is not an inverted page: every colour gets a value designed for a dark background, and the contrast has to be checked again.',
        tokens: true,
        start: () => { const st = good({ linked: true }); for (const k of D.TOKENS) st.colors[k].dark = st.colors[k].light; st.mode = 'dark'; return st; },
        check: st => st.mode === 'dark' && D.pairResults(st, 'dark').every(p => p.ok) && C.hexToLab(st.colors.background.dark)[0] < 25 && C.hexToLab(st.colors.surface.dark)[0] < 30 && st.colors.background.dark !== '#000000',
        solve: st => { for (const k of D.TOKENS) st.colors[k].dark = D.GOOD_COLORS[k].dark; st.mode = 'dark'; },
      },
    ],
  },
];
