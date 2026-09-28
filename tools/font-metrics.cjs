// Color & Type Lab: measure the fonts (x-height, cap height, average width) and copy the latin woff2 files.
// Run in a scratch folder: npm i opentype.js @fontsource/inter @fontsource/merriweather @fontsource/playfair-display @fontsource/lobster @fontsource/jetbrains-mono @fontsource/jost
// then: node font-metrics.cjs   (paste the printed metrics into labs/color-type/type.js)
const opentype = require('opentype.js'), fs = require('fs'), path = require('path');
const fams = { inter: 'Inter', merriweather: 'Merriweather', 'playfair-display': 'Playfair Display', lobster: 'Lobster', 'jetbrains-mono': 'JetBrains Mono', jost: 'Jost' };
const sample = 'The quick brown fox jumps over the lazy dog, and the festival opens with seven short films about light.';
const out = {};
for (const [k, name] of Object.entries(fams)) {
  const f = opentype.parse(fs.readFileSync(`node_modules/@fontsource/${k}/files/${k}-latin-400-normal.woff`).buffer.slice(0));
  const u = f.unitsPerEm, os2 = f.tables.os2;
  const bb = ch => f.charToGlyph(ch).getBoundingBox();
  const w = [...sample].reduce((a, ch) => a + f.charToGlyph(ch).advanceWidth, 0) / u / sample.length;
  out[name] = { xHeight: +(os2.sxHeight ? os2.sxHeight / u : bb('x').y2 / u).toFixed(3), capHeight: +((os2.sCapHeight || bb('H').y2) / u).toFixed(3), ascender: +(bb('d').y2 / u).toFixed(3), descender: +(bb('p').y1 / u).toFixed(3), avgChar: +w.toFixed(3) };
  for (const wt of ['400', '700']) { const src = `node_modules/@fontsource/${k}/files/${k}-latin-${wt}-normal.woff2`; if (fs.existsSync(src)) fs.copyFileSync(src, `${process.env.OUT || '.'}/${k}-${wt}.woff2`); }
  fs.copyFileSync(`node_modules/@fontsource/${k}/LICENSE`, `${process.env.OUT || '.'}/${k}-LICENSE.txt`);
}
console.log(JSON.stringify(out, null, 1));
