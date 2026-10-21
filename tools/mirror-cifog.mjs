import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const manifestName = '.cifog-mirror.json';
const directories = /^(?:labs|assets|vendor|docs|tests|tools)\//;
const rootFiles = /^(?:package\.json|\.nojekyll|favicon\.svg|server\.mjs|[^/]+\.(?:html|css|js))$/;
const verbatim = new Set(['tools/mirror-cifog.mjs', 'tests/mirror-cifog.test.mjs', 'docs/automatic-mirror.md']);
const textFiles = /\.(?:html|css|js|mjs|cjs|json|md|txt|svg)$/i;
export const isManaged = file => !file.split('/').some(part => part === '..' || part.startsWith('.'))
  && file !== 'brand.css' && (directories.test(file) || rootFiles.test(file)) || file === '.nojekyll';

export function cifogText(text) {
  return text.replaceAll('https://carrotrevoltstudio.com', 'https://xavikai.github.io/cifog-lab')
    .replaceAll('CARROT<span>REVOLT LABS', 'cifog<span>LAB')
    .replaceAll('CARROT REVOLT <strong>LABS', 'cifog <strong>LAB')
    .replaceAll('Carrot Revolt Labs', 'CIFOG Lab').replaceAll('Carrot Revolt', 'CIFOG')
    .replaceAll('carrot-revolt-labs', 'cifog-lab').replaceAll('carrot-revolt', 'cifog')
    .replace(/^.*<link[^>]*brand\.css[^>]*>\r?\n/gm, '');
}

function safePath(root, file) {
  if (!isManaged(file) || path.isAbsolute(file) || file.includes('\\')) throw Error(`Unsafe mirror path: ${file}`);
  const resolved = path.resolve(root, file);
  if (!resolved.startsWith(root + path.sep)) throw Error(`Path outside target: ${file}`);
  // Never follow a symlink in either a parent directory or a file.
  let current = root;
  for (const part of file.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error(`Symlink in mirror path: ${file}`);
  }
  return resolved;
}

export function mirror({ source, target }) {
  source = fs.realpathSync(source); target = fs.realpathSync(target);
  if (source === target || source.startsWith(target + path.sep) || target.startsWith(source + path.sep)) {
    throw Error('Source and target must be separate, non-nested checkouts');
  }
  const entries = execFileSync('git', ['-C', source, 'ls-files', '--stage', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
  const files = [];
  for (const entry of entries) {
    const [details, file] = entry.split('\t');
    if (!isManaged(file)) continue;
    if (!/^100(?:644|755) /.test(details)) throw Error(`Unsupported source file mode: ${file}`);
    files.push(file);
  }
  files.sort();
  if (!files.includes('index.html') || !files.includes('package.json')) throw Error('Source is not a lab collection');
  const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  const manifestPath = path.join(target, manifestName);
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files : [];
  // Validate everything before making any change, including deletion candidates.
  const removed = previous.filter(file => !files.includes(file));
  for (const file of [...files, ...removed]) safePath(target, file);
  for (const file of files) safePath(source, file);
  let changed = 0;
  for (const file of files) {
    const input = fs.readFileSync(safePath(source, file));
    const output = textFiles.test(file) && !verbatim.has(file)
      ? Buffer.from(cifogText(input.toString('utf8')).replaceAll('\r\n', '\n')) : input;
    const destination = safePath(target, file);
    if (fs.existsSync(destination) && fs.readFileSync(destination).equals(output)) continue;
    fs.mkdirSync(path.dirname(destination), {recursive:true}); fs.writeFileSync(destination, output); changed++;
  }
  for (const file of removed) {
    const destination = safePath(target, file);
    if (fs.existsSync(destination)) { fs.unlinkSync(destination); changed++; }
  }
  const metadata = JSON.stringify({source:'xavikai/carrot-revolt-labs', branch:'main', revision, files}, null, 2) + '\n';
  if (!fs.existsSync(manifestPath) || fs.readFileSync(manifestPath, 'utf8') !== metadata) fs.writeFileSync(manifestPath, metadata);
  return {revision, changed, files:files.length, removed:removed.length};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => args[args.indexOf(name) + 1];
  if (!args.includes('--source') || !args.includes('--target')) throw Error('Usage: node tools/mirror-cifog.mjs --source SOURCE --target TARGET');
  console.log(JSON.stringify(mirror({source:option('--source'), target:option('--target')})));
}
