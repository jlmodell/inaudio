import fs from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { ORT_RUNTIME_FILES } from '../src/shared/web/ort-runtime.ts';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const alias = {
  '@shared': path.join(root, 'src/shared'),
  '@renderer': path.join(root, 'src/renderer'),
};
const external = [
  'sherpa-onnx-node',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

await build({ configFile: path.join(root, 'vite.web.config.ts') });
const nestedHtml = path.join(root, 'out/web/web/index.html');
try {
  await fs.rename(nestedHtml, path.join(root, 'out/web/index.html'));
  await fs.rm(path.join(root, 'out/web/web'), { recursive: true, force: true });
} catch {
  /* Vite already wrote index.html at the web root. */
}

const ortSrc = path.join(root, 'node_modules/onnxruntime-web/dist');
const ortDest = path.join(root, 'out/web/ort');
await fs.mkdir(ortDest, { recursive: true });
for (const name of ORT_RUNTIME_FILES) {
  await fs.copyFile(path.join(ortSrc, name), path.join(ortDest, name));
}

for (const [name, entry] of [
  ['index', 'src/server/index.ts'],
  ['inference-worker', 'src/server/inference-worker.ts'],
]) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    resolve: { alias },
    build: {
      ssr: path.join(root, entry),
      sourcemap: false,
      minify: false,
      outDir: path.join(root, 'out/server'),
      emptyOutDir: name === 'index',
      rollupOptions: {
        external,
        output: { entryFileNames: `${name}.mjs`, format: 'es' },
      },
    },
  });
}
