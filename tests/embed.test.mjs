import test from 'node:test';
import assert from 'node:assert/strict';
import { accentText, colorContrast, colorInk, embedCode, embedTheme, embedTitle, isLabLink } from '../lab-embed-core.js';

const current = 'https://xavikai.github.io/carrot-revolt-labs/labs/materials/index.html?other=1#step';
test('embedded headings and iframe titles omit Carrot Revolt Labs branding', () => {
  for (const title of ['Material Lab · Carrot Revolt Labs', 'Material Lab · Carrot Revolt', 'Material Lab · CIFOG Lab']) {
    assert.equal(embedTitle(title), 'Material Lab');
    const code = embedCode(current, title);
    assert.match(code, /title="Material Lab"/);
    assert.match(code, />Material Lab<\/summary>/);
    assert.doesNotMatch(code, /Carrot Revolt|CIFOG/);
  }
  assert.equal(embedTitle('GN 01 · El flux de la geometria · Carrot Revolt Labs'), 'GN 01 · El flux de la geometria');
});
test('embeds only the selected lab with portable URLs and a restricted sandbox', () => {
  const code = embedCode(current, 'Color & "Type" <Lab>');
  assert.match(code, /<details>\s*<summary/);
  assert.match(code, /src="https:\/\/xavikai.github.io\/carrot-revolt-labs\/labs\/materials\/\?embed=1"/);
  assert.match(code, /Color &amp; &quot;Type&quot; &lt;Lab&gt;/);
  assert.match(code, /sandbox="allow-scripts allow-same-origin"/);
  assert.doesNotMatch(code, /allow-top-navigation|allow-popups|other=1|#step/);
  assert.match(code, /allowfullscreen/);
  assert.doesNotMatch(embedCode(current, 'Lab', { collapsible: false }), /details|summary/);
  assert.throws(() => embedCode('https://example.com/', 'Home'));
});

test('embedded links stay within the current lab, including hash navigation', () => {
  for (const href of ['#step-2', './', './index.html#step', '?embed=1']) assert.equal(isLabLink(href, current), true, href);
  for (const href of ['../../', '../csharp/', '../materials-other/', './app.js', 'https://example.com/labs/materials/', 'javascript:alert(1)', 'https://docs.blender.org/']) assert.equal(isLabLink(href, current), false, href);
});

test('custom colours travel in the iframe URL and the collapsible wrapper', () => {
  const code = embedCode(current, 'Lab', { accent: '#0055A4', background: '#EDF5FF' });
  assert.match(code, /accent=%230055a4&amp;background=%23edf5ff/);
  assert.match(code, /border:1px solid #0055a4/);
  assert.match(code, /background:#edf5ff;color:#17191b/);
  assert.deepEqual(embedTheme('https://example.com/labs/test/?accent=%230055A4&background=%23EDF5FF'), { accent: '#0055a4', background: '#edf5ff' });
  assert.deepEqual(embedTheme('https://example.com/labs/test/?accent=red&background=url(evil)'), { accent: null, background: null });
  assert.doesNotMatch(embedCode(current, 'Lab', {accent: '"><script>', background: 'red;position:fixed'}), /script>|position:fixed|accent=|background=/);
});

test('accent buttons and labels stay readable for dark, light and saturated brand colours', () => {
  for (const color of ['#0055a4', '#ffbf00', '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#800080']) {
    assert.ok(colorContrast(color, colorInk(color)) >= 4.5, color);
    assert.ok(colorContrast(accentText(color), '#353940') >= 4.5, color);
  }
});
