import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const platform = process.platform;
const arch = process.arch;
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const builderDirectory = existsSync('out/builder') ? 'out/builder' : null;
const legacy = !builderDirectory;
const extensions = legacy
  ? platform === 'win32' ? ['.exe', '.nupkg'] : platform === 'darwin' ? ['.zip'] : ['.deb', '.rpm']
  : platform === 'win32' ? ['.exe', '.blockmap', '.yml'] : platform === 'darwin' ? ['.zip', '.blockmap', '.yml'] : ['.AppImage', '.deb', '.rpm', '.blockmap', '.yml'];
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}
const directory = builderDirectory ?? 'out/make';
const artifacts = files(directory).filter((file) => {
  const name = path.basename(file);
  return extensions.includes(path.extname(file)) && (path.extname(file) !== '.yml' || /^latest(?:-linux|-mac)?\.yml$/.test(name));
});
if (builderDirectory && !artifacts.some((file) => /^latest(?:-linux|-mac)?\.yml$/.test(path.basename(file)))) {
  throw new Error(`Missing update manifest in ${builderDirectory}`);
}
for (const extension of extensions.filter((value) => value !== '.blockmap' && value !== '.yml')) {
  if (!artifacts.some((file) => file.endsWith(extension))) throw new Error(`Missing ${extension} installer`);
}
mkdirSync('release-assets', { recursive: true });
const names = new Set();
const checksums = [];
for (const file of artifacts) {
  const base = path.basename(file).replace(/[^a-zA-Z0-9._+-]/g, '_');
  const name = legacy ? `${platform}-${arch}-${base}` : base;
  if (names.has(name)) throw new Error(`Duplicate artifact: ${name}`);
  names.add(name);
  copyFileSync(file, path.join('release-assets', name));
  checksums.push(`${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${name}`);
}
writeFileSync(`release-assets/SHA256SUMS-${platform}-${arch}-${version}.txt`, `${checksums.sort().join('\n')}\n`);
console.log(`Collected ${artifacts.length} artifacts for ${platform}/${arch}`);
