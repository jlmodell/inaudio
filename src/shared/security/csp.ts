/**
 * One CSP definition, used for the <meta> tag at build time and the response
 * header set by the main process. Dev relaxes script/connect for Vite HMR only.
 */
export function buildContentSecurityPolicy({ dev, wasm = false }: { dev: boolean; wasm?: boolean }): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      ...(dev ? (["'unsafe-inline'"] as const) : []),
      ...(wasm ? (["'wasm-unsafe-eval'"] as const) : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'blob:'],
    'font-src': ["'self'"],
    'connect-src': dev ? ["'self'", 'ws://localhost:*', 'http://localhost:*'] : ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
