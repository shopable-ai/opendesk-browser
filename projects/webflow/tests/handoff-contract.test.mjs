import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowHandoffKey, parseWorkflowHandoff } from '../src/handoff-contract.js';

const NOW = 1800000000000;
const PROTOCOL = 'opendesk.workflow.handoff.v1';
const keyFields = ['workflowId', 'stepId', 'handoffId'];
const tupleKey = d => JSON.stringify([d.protocol, ...keyFields.map(k => d[k])]);
const BASE = {
  protocol: PROTOCOL, workflowId: 'workflow-001', stepId: 'step-0001',
  handoffId: 'handoff-0001', attemptId: 'attempt-0001', idempotencyKey: '',
  source: { adapter: 'chatgpt-web', conversationId: 'conversation-001', turnId: 'turn-001' },
  target: { adapter: 'codex-local', hostId: 'host-001', projectId: 'project-001',
    repoUrl: 'https://github.com/neutral-owner/neutral-repo', ref: 'refs/heads/main',
    baseCommit: 'a'.repeat(40), threadId: null },
  returnTo: { adapter: 'chatgpt-web', conversationId: 'conversation-001', turnId: 'turn-001' },
  objective: 'Update the neutral flow.', summary: 'A bounded application task.',
  evidenceRefs: [{ kind: 'durable-result', id: 'result-001', sha256: 'b'.repeat(64) }],
  allowedFiles: ['src/flow.js', 'artifacts/result.json'], verificationCommands: ['node --test tests/flow.test.mjs'],
  expectedArtifacts: ['artifacts/result.json'], authorizationRef: 'authref-0001',
  limits: { maxSteps: 2, maxHandoffs: 1, deadlineAt: NOW + 2000 },
  stopConditions: ['Stop on an unexpected permission request.'], createdAt: NOW - 1000, expiresAt: NOW + 1000,
};
BASE.idempotencyKey = tupleKey(BASE);
const clone = value => JSON.parse(JSON.stringify(value));
const scope = (d = BASE) => ({ now: NOW, expectedSource: clone(d.source), expectedTarget: clone(d.target) });
const parse = (d = BASE, options = scope()) => parseWorkflowHandoff(JSON.stringify(d), options);
const coded = code => error => error instanceof Error && error.code === code;
const fails = (d, code = 'E_HANDOFF_SCHEMA', options = scope()) => assert.throws(() => parse(d, options), coded(code));
const edit = mutate => { const d = clone(BASE); mutate(d); return d; };
const at = (d, path) => path.reduce((value, key) => value[key], d);
const change = (path, value) => edit(d => { at(d, path.slice(0, -1))[path.at(-1)] = value; });
const objects = [[], ['source'], ['target'], ['returnTo'], ['limits'], ['evidenceRefs', 0]];

test('key is the exact deterministic tuple and validates its identity fields', async t => {
  const input = Object.fromEntries(['protocol', ...keyFields].map(k => [k, BASE[k]]));
  assert.equal(createWorkflowHandoffKey(input), tupleKey(BASE));
  assert.equal(createWorkflowHandoffKey(Object.fromEntries(Object.entries(input).reverse())), tupleKey(BASE));
  for (const field of keyFields) {
    for (const value of ['A0._:-z9', 'a'.repeat(128)]) {
      const d = { ...input, [field]: value }; assert.equal(createWorkflowHandoffKey(d), tupleKey(d));
    }
    for (const value of [undefined, null, 7, {}, '', 'a'.repeat(7), 'a'.repeat(129), 'invalid/id', 'identity-é', ' identity', 'identity\u007f'])
      await t.test(`${field}: ${JSON.stringify(value)}`, () => assert.throws(() => createWorkflowHandoffKey({ ...input, [field]: value }), coded('E_HANDOFF_SCHEMA')));
  }
  for (const protocol of [undefined, null, 'other.protocol'])
    assert.throws(() => createWorkflowHandoffKey({ ...input, protocol }), coded('E_HANDOFF_SCHEMA'));
});
test('valid data and trusted identities match independently of object key order; commands stay opaque', () => {
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)])) : value;
  const d = edit(d => { d.verificationCommands = ["check --literal='$(neutral); | > &' ".trim()]; });
  assert.deepEqual(parse(d), d);
  assert.deepEqual(parse(reorder(d), reorder(scope())), d);
});
test('the parsed result is deeply immutable', () => {
  const d = parse();
  const visit = value => { if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value)); Object.values(value).forEach(visit);
  } };
  visit(d);
  for (const mutate of [() => { d.objective = 'changed'; }, () => { d.source.turnId = 'changed'; },
    () => { d.target.threadId = 'existing'; }, () => { d.evidenceRefs[0].id = 'changed'; },
    () => d.allowedFiles.push('other.js'), () => d.expectedArtifacts.pop(),
    () => d.verificationCommands.push('other'), () => d.stopConditions.pop(), () => { d.limits.maxSteps = 3; }])
    assert.throws(mutate, TypeError);
});
test('trusted scope is mandatory and validates identities rather than coercing arbitrary objects', () => {
  for (const options of [undefined, null, {}])
    assert.throws(() => parseWorkflowHandoff(JSON.stringify(BASE), options), coded('E_HANDOFF_SCOPE'));
  for (const name of ['expectedSource', 'expectedTarget']) {
    for (const value of [undefined, null, [], {}, 7, 'identity']) fails(BASE, 'E_HANDOFF_SCOPE', { ...scope(), [name]: value });
    for (const key of Object.keys(scope()[name])) {
      const options = scope(); delete options[name][key]; fails(BASE, 'E_HANDOFF_SCOPE', options);
    }
  }
  for (const [name, field, value] of [
    ['expectedSource', 'conversationId', new String(BASE.source.conversationId)], ['expectedSource', 'turnId', ' untrimmed'],
    ['expectedSource', 'adapter', 'google'], ['expectedTarget', 'hostId', new String(BASE.target.hostId)],
    ['expectedTarget', 'projectId', {}], ['expectedTarget', 'hostId', 'h'.repeat(257)],
    ['expectedTarget', 'repoUrl', 'https://example.org/owner/repo'], ['expectedTarget', 'ref', 'main'],
    ['expectedTarget', 'baseCommit', 'A'.repeat(40)], ['expectedTarget', 'threadId', 'existing-thread'],
  ]) { const options = scope(); options[name][field] = value; fails(BASE, 'E_HANDOFF_SCOPE', options); }
});
test('every document object is closed, requires every field, and rejects prototype or authorization keys', async t => {
  for (const path of objects) {
    for (const key of Object.keys(at(BASE, path)))
      await t.test(`missing ${[...path, key].join('.')}`, () => fails(edit(d => { delete at(d, path)[key]; })));
    for (const key of ['authorization', '__proto__', 'constructor', 'prototype'])
      await t.test(`extra ${[...path, key].join('.')}`, () => fails(edit(d => {
        Object.defineProperty(at(d, path), key, { value: { granted: true }, enumerable: true });
      })));
    if (path.length) for (const value of [null, []]) fails(change(path, value));
  }
});
test('protocol, adapters, token identities, precreation thread, and idempotency are enforced', () => {
  fails(change(['protocol'], 'opendesk.workflow.handoff.v2'));
  for (const path of [['source'], ['returnTo'], ['target']])
    for (const adapter of ['google', 'unknown']) fails(change([...path, 'adapter'], adapter));
  for (const field of [...keyFields, 'attemptId', 'authorizationRef'])
    for (const value of [null, 8, 'short', 'x'.repeat(129), 'invalid/id', 'nonascii-é']) {
      const d = change([field], value); d.idempotencyKey = tupleKey(d); fails(d);
    }
  fails(change(['target', 'threadId'], 'existing-thread'));
  for (const value of ['', 'tampered-key', tupleKey({ ...BASE, handoffId: 'handoff-0002' })]) fails(change(['idempotencyKey'], value));
});
test('well formed identities outside the caller scope are rejected', async t => {
  for (const parent of ['source', 'returnTo']) for (const field of ['conversationId', 'turnId'])
    await t.test(`${parent}.${field}`, () => fails(change([parent, field], 'different-identity'), 'E_HANDOFF_SCOPE'));
  for (const [field, value] of [['hostId', 'host-002'], ['projectId', 'project-002'],
    ['repoUrl', 'https://github.com/neutral-owner/other-repo'], ['ref', 'refs/heads/other'], ['baseCommit', 'c'.repeat(40)]])
    await t.test(`target.${field}`, () => fails(change(['target', field], value), 'E_HANDOFF_SCOPE'));
  const d = edit(d => { d.source.turnId = d.returnTo.turnId = 'other-turn'; });
  fails(d, 'E_HANDOFF_SCOPE');
});
test('repository URL, branch reference, and commit have strict canonical structure', () => {
  for (const url of ['http://github.com/o/r', 'https://example.org/o/r', 'https://user@github.com/o/r',
    'https://github.com/o/r?q=1', 'https://github.com/o/r#part', 'https://github.com/o/r/',
    'https://github.com/o/r.git', 'https://github.com/o/r/extra', 'https://github.com:443/o/r', 'https://github.com/o'])
    fails(change(['target', 'repoUrl'], url));
  for (const ref of ['main', 'refs/tags/main', 'refs/heads/', 'refs/heads/a//b', 'refs/heads/a..b',
    'refs/heads/.hidden', 'refs/heads/a.lock', 'refs/heads/a@{b', 'refs/heads/a b', 'refs/heads/a\\b', 'refs/heads/a.'])
    fails(change(['target', 'ref'], ref));
  for (const sha of ['a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), 'g'.repeat(40), null]) fails(change(['target', 'baseCommit'], sha));
});
test('time structure and expiration have distinct errors and exact boundary behavior', () => {
  for (const path of [['createdAt'], ['expiresAt'], ['limits', 'deadlineAt']])
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, String(NOW)]) fails(change(path, value));
  for (const now of [undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, String(NOW)])
    fails(BASE, 'E_HANDOFF_SCHEMA', { ...scope(), now });
  fails(change(['limits', 'deadlineAt'], BASE.expiresAt - 1));
  fails(change(['createdAt'], NOW + 1), 'E_HANDOFF_EXPIRED');
  for (const expiresAt of [NOW - 1, NOW]) fails(change(['expiresAt'], expiresAt), 'E_HANDOFF_EXPIRED');
  const d = edit(d => { d.createdAt = NOW; d.expiresAt = NOW + 1; d.limits.deadlineAt = d.expiresAt; });
  assert.deepEqual(parse(d), d);
  for (const [field, value] of [['maxSteps', 1], ['maxSteps', 3], ['maxSteps', '2'], ['maxHandoffs', 0], ['maxHandoffs', 2], ['maxHandoffs', '1']])
    fails(change(['limits', field], value));
});
test('paths are relative POSIX paths and outputs must be declared', () => {
  for (const path of ['', '/absolute.txt', 'a\\b', 'C:relative', 'a:b', 'a//b', 'a/', './a', 'a/./b', '../a', 'a/../b', '.', '..']) {
    fails(change(['allowedFiles', 0], path));
    fails(edit(d => { d.allowedFiles = [path]; d.expectedArtifacts = [path]; }));
  }
  fails(change(['expectedArtifacts'], ['artifacts/undeclared.json']), 'E_HANDOFF_SCOPE');
  fails(change(['allowedFiles'], []), 'E_HANDOFF_SCOPE');
  assert.deepEqual(parse(edit(d => { d.verificationCommands = []; })).verificationCommands, []);
});
test('evidence references validate each field and reject identical references regardless of key order', () => {
  for (const [field, value] of [['kind', 'url'], ['id', ''], ['id', 'i'.repeat(513)],
    ['sha256', 'A'.repeat(64)], ['sha256', 'a'.repeat(63)], ['sha256', 'g'.repeat(64)], ['sha256', 7]])
    fails(change(['evidenceRefs', 0, field], value));
  fails(edit(d => { const r = d.evidenceRefs[0]; d.evidenceRefs.push({ sha256: r.sha256, id: r.id, kind: r.kind }); }));
  for (const kind of ['durable-result', 'artifact', 'conversation-turn']) assert.equal(parse(change(['evidenceRefs', 0, 'kind'], kind)).evidenceRefs[0].kind, kind);
});
test('array bounds, element types, and duplicate strings are enforced', () => {
  for (const [field, maximum, minimum] of [['evidenceRefs', 16, 1], ['allowedFiles', 32, 0],
    ['expectedArtifacts', 32, 1], ['verificationCommands', 8, 0], ['stopConditions', 16, 1]]) {
    for (const value of [null, {}, 'items']) fails(change([field], value));
    if (minimum) fails(change([field], []));
    const items = Array.from({ length: maximum + 1 }, (_, i) => field === 'evidenceRefs'
      ? { ...BASE.evidenceRefs[0], id: `result-${i}` } : field === 'expectedArtifacts' ? BASE.expectedArtifacts[0] : `item-${i}`);
    fails(change([field], items));
    if (field !== 'evidenceRefs') {
      fails(change([field], [BASE[field][0], BASE[field][0]])); fails(change([field], [42]));
    }
  }
});
test('text rejects empty, untrimmed, controlled, nonstring, and oversized values', () => {
  const paths = [['objective'], ['summary'], ['source', 'conversationId'], ['source', 'turnId'],
    ['returnTo', 'turnId'], ['target', 'hostId'], ['target', 'projectId'], ['evidenceRefs', 0, 'id'],
    ['verificationCommands', 0], ['stopConditions', 0], ['allowedFiles', 0], ['expectedArtifacts', 0]];
  for (const path of paths) for (const value of ['', ' leading', 'trailing ', 'a\u0000b', 'a\u001fb', 'a\u007fb', 'a\nb', null, 7, {}]) fails(change(path, value));
  for (const path of paths) {
    const limit = ['objective', 'summary'].includes(path[0]) ? 4096 : ['source', 'returnTo', 'target'].includes(path[0]) ? 256 : 512;
    fails(change(path, 'x'.repeat(limit + 1)));
  }
});
test('valid upper bounds remain usable, including UTF16 text lengths', () => {
  const d = edit(d => {
    for (const field of [...keyFields, 'attemptId', 'authorizationRef']) d[field] = 'a'.repeat(128);
    d.idempotencyKey = tupleKey(d); d.objective = '😀'.repeat(2048); d.summary = 's'.repeat(4096);
    d.source.conversationId = 'c'.repeat(256); d.source.turnId = 't'.repeat(256); d.returnTo = clone(d.source);
    d.target.hostId = 'h'.repeat(256); d.target.projectId = 'p'.repeat(256);
    d.evidenceRefs = Array.from({ length: 16 }, (_, i) => ({ ...d.evidenceRefs[0], id: `result-${i}` }));
    d.allowedFiles = Array.from({ length: 32 }, (_, i) => `outputs/result-${i}.json`); d.expectedArtifacts = [...d.allowedFiles];
    d.verificationCommands = Array.from({ length: 8 }, (_, i) => `check-${i}`);
    d.stopConditions = Array.from({ length: 16 }, (_, i) => `stop-${i}`);
  });
  assert.deepEqual(parse(d, scope(d)), d);
  for (const path of [['evidenceRefs', 0, 'id'], ['verificationCommands', 0], ['stopConditions', 0]]) assert.deepEqual(parse(change(path, 'x'.repeat(512))), change(path, 'x'.repeat(512)));
  const paths = edit(d => { d.allowedFiles = ['x'.repeat(512)]; d.expectedArtifacts = [...d.allowedFiles]; });
  assert.deepEqual(parse(paths), paths);
  fails(change(['objective'], '😀'.repeat(2049)));
});
test('input must be JSON text within 32KiB measured as UTF8 bytes', () => {
  for (const input of [undefined, null, {}, [], 42, '', '{', '{"protocol":', 'null', '[]', '42', JSON.stringify(BASE) + '{}'])
    assert.throws(() => parseWorkflowHandoff(input, scope()), coded('E_HANDOFF_SCHEMA'));
  const json = JSON.stringify(BASE); const exact = json + ' '.repeat(32768 - Buffer.byteLength(json, 'utf8'));
  assert.deepEqual(parseWorkflowHandoff(exact, scope()), BASE);
  assert.throws(() => parseWorkflowHandoff(exact + ' ', scope()), coded('E_HANDOFF_SCHEMA'));
  const d = edit(d => { d.objective = d.summary = '界'.repeat(4096); d.stopConditions = Array.from({ length: 6 }, (_, i) => '界'.repeat(511) + i); });
  const utf8 = JSON.stringify(d); assert.ok(utf8.length < 32768); assert.ok(Buffer.byteLength(utf8, 'utf8') > 32768);
  fails(d);
});
