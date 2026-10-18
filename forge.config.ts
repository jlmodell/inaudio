import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Native addons are external to the Vite bundles, so their packages (and the
 * platform-specific sherpa-onnx binary package) are copied into the app.
 */
function runtimeModules(platform: string, arch: string): string[] {
  const sherpaPlatform = platform === 'win32' ? 'win' : platform;
  const sherpaArch = arch === 'ia32' ? 'ia32' : arch === 'arm64' ? 'arm64' : 'x64';
  return ['sherpa-onnx-node', `sherpa-onnx-${sherpaPlatform}-${sherpaArch}`];
}

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Inaudio',
    executableName: 'inaudio',
    appBundleId: 'app.inaudio.desktop',
    icon: 'assets/icons/icon',
    // app-update.yml lands in resources/, where electron-updater reads it on every download.
    // `electron-builder --prepackaged` never writes it, so it ships from here.
    extraResource: ['assets/icons', 'assets/app-update.yml'],
    asar: {
      unpack: '**/node_modules/sherpa-onnx-*/**/*.{node,so,so.*,dylib,dll}',
    },
    extendInfo: {
      NSMicrophoneUsageDescription: 'Inaudio transcribes your voice on this computer.',
      // Required for the CoreAudio tap behind system-audio capture on macOS 14.2+; without it
      // Chromium hands back a silent, already-ended track and reports no error.
      NSAudioCaptureUsageDescription: 'Inaudio transcribes audio playing on this computer when you start a live transcript.',
    },
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath, _electronVersion, platform, arch) => {
      for (const name of runtimeModules(platform, arch)) {
        const source = path.resolve(__dirname, 'node_modules', name);
        if (!fs.existsSync(source)) {
          if (name.startsWith('sherpa-onnx-') && name !== 'sherpa-onnx-node') {
            throw new Error(`Missing ${name}. Install it for the target platform before packaging.`);
          }
          continue;
        }
        await fs.promises.cp(source, path.join(buildPath, 'node_modules', name), {
          recursive: true,
          dereference: true,
          filter: (file) => !/[\\/](src|deps|test|docs)[\\/]/.test(path.relative(source, file)),
        });
      }
    },
  },
  makers: [
    new MakerSquirrel({ setupIcon: 'assets/icons/icon.ico' }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { icon: 'assets/icons/icon.png' } }),
    new MakerDeb({ options: { icon: 'assets/icons/icon.png', categories: ['Utility', 'Audio'] } }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/worker/inference-worker.ts', config: 'vite.worker.config.ts', target: 'main' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};

export default config;
