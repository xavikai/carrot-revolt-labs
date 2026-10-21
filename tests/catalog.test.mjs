import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const slugs = [...home.matchAll(/href="\.\/labs\/([^/]+)\/(?:\?[^" ]*)?"/g)].map(m => m[1]);

test('the shared catalog contains every current lab exactly once', () => {
  assert.equal(new Set(slugs).size, slugs.length);
  for (const dir of fs.readdirSync(path.join(root, 'labs'))) {
    const entry = path.join(root, 'labs', dir, 'index.html');
    if (!fs.existsSync(entry)) continue;
    const html = fs.readFileSync(entry, 'utf8');
    if (/http-equiv="refresh"/i.test(html)) continue;
    assert.ok(slugs.includes(dir), `${dir} is missing from the catalog`);
  }
  for (const slug of slugs) assert.ok(fs.existsSync(path.join(root, 'labs', slug, 'index.html')), slug);
});

test('all active lab entry points load iframe controls and styles', () => {
  for (const slug of slugs) {
    const html = fs.readFileSync(path.join(root, 'labs', slug, 'index.html'), 'utf8');
    assert.match(html, /lab-brief\.css/, `${slug}: embed styles`);
    assert.match(html, /lab-brief\.js|setupEmbed/, `${slug}: embed controls`);
  }
});
