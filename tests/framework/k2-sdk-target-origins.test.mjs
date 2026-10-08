import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_SDK_TARGET_ORIGINS, MAX_SDK_ORIGIN_LENGTH, normalizeSdkOrigin,
  normalizeSdkTargetScope} from '../../src/framework/sdk/target-origins.js';

const A = 'https://source.example', B = 'https://target.example';
const invalid = operation => assert.throws(operation, error => error.code === 'E_SCHEMA');

test('SDK target contract: omitted or empty additional targets preserve same-origin only', () => {
  for (const targets of [undefined, []]) {
    const scope = normalizeSdkTargetScope(A, targets);
    assert.deepEqual(scope, {sourceOrigin:A, targetOrigins:[], allowedOrigins:[A]});
  }
});

test('SDK target contract: canonicalizes, deduplicates and sorts without mutating input', () => {
  const targets = Object.freeze(['HTTPS://TARGET.EXAMPLE:443/', A, B, 'https://a.example']);
  const scope = normalizeSdkTargetScope(A, targets);
  assert.deepEqual(scope.targetOrigins, ['https://a.example', B]);
  assert.deepEqual(scope.allowedOrigins, ['https://a.example', A, B]);
  assert.deepEqual(targets, ['HTTPS://TARGET.EXAMPLE:443/', A, B, 'https://a.example']);
  assert.equal(Object.isFrozen(scope), true);
  assert.equal(Object.isFrozen(scope.targetOrigins), true);
  assert.equal(Object.isFrozen(scope.allowedOrigins), true);
  assert.throws(() => scope.allowedOrigins.push('https://attacker.example'), TypeError);
});

test('SDK target contract: scheme, effective port and subdomain stay distinct', () => {
  const scope = normalizeSdkTargetScope(A, [B]);
  assert.equal(scope.allowedOrigins.includes(normalizeSdkOrigin('https://target.example:443')), true);
  for (const origin of ['http://target.example', 'https://target.example:8443',
    'https://child.target.example', 'https://target.example.attacker.example'])
    assert.equal(scope.allowedOrigins.includes(normalizeSdkOrigin(origin)), false, origin);
});

test('SDK target contract: additional lists replace rather than silently union previous approvals', () => {
  const oldScope = normalizeSdkTargetScope(A, [B, 'https://third.example']);
  const newScope = normalizeSdkTargetScope(A, [B]);
  assert.equal(oldScope.allowedOrigins.includes('https://third.example'), true);
  assert.equal(newScope.allowedOrigins.includes('https://third.example'), false);
  assert.deepEqual(normalizeSdkTargetScope(A, []).allowedOrigins, [A]);
});

test('SDK target contract: private targets are never added implicitly and retain exact ports', () => {
  const sameOrigin = normalizeSdkTargetScope(A);
  for (const local of ['http://127.0.0.1:4319', 'http://192.168.1.2:4320', 'http://localhost:4321'])
    assert.equal(sameOrigin.allowedOrigins.includes(local), false);
  const explicit = normalizeSdkTargetScope(A, ['http://127.0.0.1:4319']);
  assert.equal(explicit.allowedOrigins.includes('http://127.0.0.1:4319'), true);
  assert.equal(explicit.allowedOrigins.includes('http://127.0.0.1:4320'), false);
  assert.equal(explicit.allowedOrigins.includes('http://localhost:4319'), false);
});

test('SDK target contract: IPv6 and IDN use URL origin serialization', () => {
  assert.equal(normalizeSdkOrigin('https://[2001:0db8::1]:443/'), 'https://[2001:db8::1]');
  assert.equal(normalizeSdkOrigin('https://[::1]:8443'), 'https://[::1]:8443');
  assert.equal(normalizeSdkOrigin('https://例子.测试'), new URL('https://例子.测试').origin);
});

for (const [label, value] of [
  ['empty', ''], ['null', null], ['object', {}], ['number', 123],
  ['relative', '//target.example'], ['non-http scheme', 'file://target.example/'],
  ['opaque URL', 'data:text/plain,x'], ['username', 'https://user@target.example'],
  ['password', 'https://user:pass@target.example'], ['empty userinfo', 'https://@target.example'],
  ['path', 'https://target.example/api'], ['dot path', 'https://target.example/a/..'],
  ['double slash path', 'https://target.example//'], ['query', 'https://target.example?q=1'],
  ['empty query', 'https://target.example?'], ['fragment', 'https://target.example#x'],
  ['empty fragment', 'https://target.example#'], ['wildcard host', 'https://*.target.example'],
  ['all URLs', '<all_urls>'], ['leading space', ' https://target.example'],
  ['trailing space', 'https://target.example '], ['tab cleanup', 'https://tar\tget.example'],
  ['leading NUL', '\u0000https://target.example'], ['trailing NUL', 'https://target.example\u0000'],
  ['trailing control', 'https://target.example\u001f'],
  ['newline cleanup', 'https://target.example\n'], ['backslash', 'https://target.example\\'],
  ['encoded host', 'https://%74arget.example'], ['invalid port', 'https://target.example:65536'],
  ['invalid bracket', 'https://[::1'], ['empty host', 'https:///'],
  ['length budget', `https://${'a'.repeat(MAX_SDK_ORIGIN_LENGTH)}.example`]
]) test(`SDK target contract: rejects ${label}`, () => {
  invalid(() => normalizeSdkOrigin(value));
  invalid(() => normalizeSdkTargetScope(A, [value]));
});

for (const [label, value] of [['null',null], ['string',B], ['object',{}], ['sparse',new Array(1)],
  ['too many',Array.from({length:MAX_SDK_TARGET_ORIGINS+1}, () => B)]])
  test(`SDK target contract: rejects ${label} additional collection`, () => invalid(() => normalizeSdkTargetScope(A,value)));

test('SDK target contract: accepts the exact entry budget and isolates separately created scopes', () => {
  const input = Array.from({length:MAX_SDK_TARGET_ORIGINS}, (_,i) => `https://target${i}.example`);
  const first = normalizeSdkTargetScope(A,input), second = normalizeSdkTargetScope(A,input);
  assert.equal(first.targetOrigins.length,MAX_SDK_TARGET_ORIGINS);
  assert.equal(first.allowedOrigins.length,MAX_SDK_TARGET_ORIGINS+1);
  assert.notStrictEqual(first.allowedOrigins,second.allowedOrigins);
  input[0] = 'https://changed.example';
  assert.equal(first.allowedOrigins.includes('https://changed.example'),false);
});
