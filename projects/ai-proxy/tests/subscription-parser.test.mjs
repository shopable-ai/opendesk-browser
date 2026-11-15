import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubscription, SubscriptionParseError } from '../src/subscription/parser.ts';

const vmess = value => `proxies:
  - name: Test VMess
    type: vmess
    server: proxy.example.com
    port: 443
    uuid: ${value}
    alterId: 0
    cipher: auto
    tls: true
`;

test('Clash unquoted UUIDs with numeric-looking prefixes remain strings and never enter reports', () => {
  for (const value of [
    '01234567-89ab-4cde-8123-456789abcdef',
    '0badcafe-89ab-4cde-8123-456789abcdef',
    '1e234567-89ab-4cde-8123-456789abcdef',
    'abcdef01-89ab-4cde-8123-456789abcdef'
  ]) {
    const report = parseSubscription(vmess(value));
    assert.equal(report.format, 'clash');
    assert.equal(report.invalidCount, 0);
    assert.equal(report.nodes.length, 1);
    assert.equal(report.nodes[0].compatibility, 'local-client');
    assert.deepEqual(report.protocols, { vmess: 1 });
    assert.equal(JSON.stringify(report).includes(value), false);
    assert.deepEqual(report, parseSubscription(vmess(JSON.stringify(value))));
  }
});

test('UUID support preserves rejection of ambiguous YAML scalars and executable YAML features', () => {
  const valid = vmess('abcdef01-89ab-4cde-8123-456789abcdef');
  for (const scalar of ['0123', '0x10', '1e3', '1_000', 'yes', '.nan', '2026-11-15']) {
    assert.throws(() => parseSubscription(`mode: ${scalar}\n${valid}`), error => error instanceof SubscriptionParseError && error.code === 'invalid_yaml');
  }
  for (const suffix of ['other: &node value', 'other: *node', 'other: !!str value', 'proxies: []', '__proto__: {}']) {
    assert.throws(() => parseSubscription(`${valid}${suffix}\n`), error => error instanceof SubscriptionParseError);
  }
});
