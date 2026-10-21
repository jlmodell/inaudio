import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContentSecurityPolicy } from '../src/shared/security/csp.ts';

test('web CSP allows WASM; the desktop CSP does not', () => {
  const web = buildContentSecurityPolicy({ dev: false, wasm: true });
  const desktop = buildContentSecurityPolicy({ dev: false });
  assert.match(web, /wasm-unsafe-eval/);
  assert.doesNotMatch(desktop, /wasm-unsafe-eval/);
  assert.match(web, /worker-src 'self' blob:/);
});
