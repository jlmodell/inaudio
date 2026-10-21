import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { alias } from './vite.shared';
import { buildContentSecurityPolicy } from './src/shared/security/csp';

function contentSecurityPolicy(): Plugin {
  return {
    name: 'inaudio-web-csp',
    transformIndexHtml(html) {
      return html.replace('%INAUDIO_CSP%', buildContentSecurityPolicy({ dev: false, wasm: true }));
    },
  };
}

const resolve = {
  alias,
  conditions: ['onnxruntime-web-use-extern-wasm', 'import', 'module', 'browser', 'default'],
};

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve,
  // Rolldown-vite's WorkerOptions type omits `resolve`; the bundled worker still needs the ORT condition.
  worker: { format: 'es', resolve } as { format: 'es' },
  build: {
    outDir: 'out/web',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: fileURLToPath(new URL('web/index.html', import.meta.url)),
    },
  },
});
