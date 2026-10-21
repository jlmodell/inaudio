import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthGate, readCookie, SESSION_COOKIE } from '../src/server/auth.ts';

test('an empty password leaves the app open', () => {
  const auth = new AuthGate('');
  assert.equal(auth.required, false);
  assert.equal(auth.verify(undefined), true);
});

test('a password issues a session only for the right secret', () => {
  const auth = new AuthGate('correct horse');
  assert.equal(auth.required, true);
  assert.equal(auth.login('wrong', '1.1.1.1'), null);
  const token = auth.login('correct horse', '1.1.1.1');
  assert.ok(token);
  assert.equal(auth.verify(token), true);
  assert.equal(auth.verify('nope'), false);
  auth.logout(token);
  assert.equal(auth.verify(token), false);
});

test('reads the session cookie and sets HttpOnly', () => {
  const auth = new AuthGate('secret');
  const token = auth.login('secret', '10.0.0.2');
  const header = auth.cookie(token, true);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.equal(readCookie(`${SESSION_COOKIE}=${token}; other=1`, SESSION_COOKIE), token);
});
