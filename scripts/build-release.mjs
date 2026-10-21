import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const platform = process.platform;
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const prepackaged = path.resolve('out', `Inaudio-${platform}-${arch}`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args) => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', command, ...args], { stdio: 'inherit' });
    return;
  }
  execFileSync(command, args, {
    stdio: 'inherit',
  });
};

run(npm, ['run', 'package', '--', '--platform', platform, '--arch', arch]);
if (!existsSync(prepackaged)) {
  throw new Error(`Forge did not produce the expected packaged app: ${prepackaged}`);
}
const resources = platform === 'darwin' ? path.join(prepackaged, 'Inaudio.app', 'Contents', 'Resources') : path.join(prepackaged, 'resources');
if (!existsSync(path.join(resources, 'app-update.yml'))) {
  throw new Error(`Packaged app has no app-update.yml in ${resources}; updates could not download`);
}

// The installer's hero animations and header, rendered fresh for each build (never committed).
if (platform === 'win32') run(process.execPath, [path.resolve('scripts', 'build-installer-art.mjs')]);

const targetArgs = platform === 'win32' ? ['--win', 'nsis'] : platform === 'darwin' ? ['--mac', 'zip', 'dmg'] : ['--linux', 'AppImage', 'deb', 'rpm'];
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'electron-builder',
  '--prepackaged',
  prepackaged,
  '--config',
  'electron-builder.yml',
  '--publish',
  'never',
  ...targetArgs,
], { stdio: 'inherit' });
