import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOfficialUrl } from '../lib/guard.js';

test('accepts exact official HTTPS hosts', () => {
  assert.equal(assertOfficialUrl('https://chatgpt.com/'), 'https://chatgpt.com/');
  assert.equal(assertOfficialUrl('https://one.google.com/'), 'https://one.google.com/');
});

test('rejects non-whitelisted and lookalike hosts', () => {
  assert.throws(() => assertOfficialUrl('https://chatgpt.com.attacker.example/'));
  assert.throws(() => assertOfficialUrl('https://example.com/'));
  assert.throws(() => assertOfficialUrl('https://accounts.google.com/'));
});

test('rejects HTTP, URL credentials and non-standard ports', () => {
  assert.throws(() => assertOfficialUrl('http://chatgpt.com/'));
  assert.throws(() => assertOfficialUrl('https://user:pass@chatgpt.com/'));
  assert.throws(() => assertOfficialUrl('https://chatgpt.com:8443/'));
});
