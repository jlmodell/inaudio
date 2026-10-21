import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const repository = process.env.GITHUB_REPOSITORY;
const tag = process.env.RELEASE_TAG;
const sha = process.env.GITHUB_SHA;
if (!/^v?\d+\.\d+\.\d+$/.test(tag ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Invalid release context');
const entries = readdirSync('release-assets', { withFileTypes: true });
const invalid = entries
  .filter((entry) => !entry.isFile() || !/^[a-zA-Z0-9._+-]+$/.test(entry.name))
  .map((entry) => entry.name);
if (invalid.length > 0) throw new Error(`Unexpected release asset entries: ${invalid.join(', ')}`);
const names = entries.map((entry) => entry.name).sort();
const expected = ['win32-x64', 'darwin-arm64'];
const verified = new Set();
for (const target of expected) {
  const checksum = names.find((name) => name.startsWith(`SHA256SUMS-${target}-`));
  if (!checksum) throw new Error(`Missing checksums for ${target}`);
  for (const line of readFileSync(path.join('release-assets', checksum), 'utf8').trim().split('\n')) {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9._+-]+)$/.exec(line);
    if (!match || !names.includes(match[2])) throw new Error('Invalid checksum manifest');
    const digest = createHash('sha256').update(readFileSync(path.join('release-assets', match[2]))).digest('hex');
    if (digest !== match[1]) throw new Error(`Checksum mismatch: ${match[2]}`);
    verified.add(match[2]);
  }
  verified.add(checksum);
}
if (names.some((name) => !verified.has(name))) throw new Error('Unverified release asset');
const pages = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`));
let release = pages.flat().find((item) => item.tag_name === tag);
if (release && release.target_commitish !== sha) throw new Error('Release target does not match this commit');
if (release && !release.draft) {
  console.log(`${tag} is already public; no assets changed`);
  process.exit(0);
}
const refs = JSON.parse(gh('api', `repos/${repository}/git/matching-refs/tags/${tag}`));
if (refs.some((ref) => ref.ref === `refs/tags/${tag}`)) {
  const commit = JSON.parse(gh('api', `repos/${repository}/commits/${tag}`));
  if (commit.sha !== sha) throw new Error('Existing release tag points at a different commit');
} else {
  gh('api', '--method', 'POST', `repos/${repository}/git/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${sha}`);
}
if (!release) {
  release = JSON.parse(
    gh(
      'api',
      '--method',
      'POST',
      `repos/${repository}/releases`,
      '-f',
      `tag_name=${tag}`,
      '-f',
      `target_commitish=${sha}`,
      '-F',
      'draft=true',
      '-f',
      `name=${tag}`,
      '-F',
      'generate_release_notes=true',
    ),
  );
}
// A failed draft upload can be resumed only with identical assets. Never use --clobber.
const remote = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repository}/releases/${release.id}/assets?per_page=100`)).flat();
if (remote.some((asset) => !names.includes(asset.name))) throw new Error('Draft has unexpected assets');
for (const name of names) {
  const file = path.join('release-assets', name);
  const existing = remote.find((asset) => asset.name === name);
  if (existing) {
    const bytes = execFileSync('gh', ['api', '-H', 'Accept: application/octet-stream', `repos/${repository}/releases/assets/${existing.id}`], { maxBuffer: 1024 * 1024 * 1024 });
    const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
    if (digest(bytes) !== digest(readFileSync(file))) throw new Error(`Draft asset differs: ${name}. Remove the failed draft manually before retrying.`);
  } else {
    gh('release', 'upload', tag, file, '--repo', repository);
  }
}
gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--latest');
console.log(`Published ${tag}`);
