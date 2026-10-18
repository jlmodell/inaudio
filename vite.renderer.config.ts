import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { alias } from './vite.shared';
import { buildContentSecurityPolicy } from './src/shared/security/csp';

function contentSecurityPolicy(): Plugin {
  let isDev = false;
  return {
    name: 'inaudio-csp',
    configResolved(config) {
      isDev = config.command === 'serve';
    },
    // Runs once per HTML entry, so both pages get the policy.
    transformIndexHtml(html) {
      return html.replace('%INAUDIO_CSP%', buildContentSecurityPolicy({ dev: isDev }));
    },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: { alias },
  build: {
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      // Every window's page in one renderer bundle: the app window, the floating overlay, the
      // companion and the floating live window, each loaded by the main process under the
      // app origin by its file name.
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        overlay: fileURLToPath(new URL('overlay.html', import.meta.url)),
        companion: fileURLToPath(new URL('companion.html', import.meta.url)),
        live: fileURLToPath(new URL('live.html', import.meta.url)),
      },
    },
  },
});
