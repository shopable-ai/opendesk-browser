import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {CONTRACT_VERSION, CONTRACT_HASH, terminalStates} from '../../src/platform/protocol.js';

// Transaction-order oracle only. Native IDB, sender and crash proofs remain required.
async function fixture({state = 'preparing', session = 'session'} = {}) {
  let rows = new Map(), queue = Promise.resolve();
  const commits = [];
  const storage = {transaction(names, mode, work) {
    const next = queue.then(async () => {
      const copy = structuredClone(rows);
      const store = name => {
        assert.ok(names.includes(name));
        if (!copy.has(name)) copy.set(name, new Map());
        return copy.get(name);
      };
      const tx = {
        get: async (name, key) => structuredClone(store(name).get(key)),
        put: async (name, value, key) => store(name).set(key, structuredClone(value)),
        delete: async (name, key) => store(name).delete(key),
        all: async name => structuredClone([...store(name).values()])
      };
      const result = await work(tx);
      if (mode === 'readwrite') { rows = copy; commits.push(structuredClone(rows)); }
      return result;
    });
    queue = next.catch(() => {});
    return next;
  }};
  const api = {runtime: {id: 'extension', getURL: p => `chrome-extension://extension/${p}`}};
  const sender = {id: 'extension', url: api.runtime.getURL('ui/tool.html'), documentId: 'host-document',
    documentLifecycle: 'active', frameId: 0, tab: {id: 1, incognito: false}};
  const authority = createRunAuthority({storage, api, session: 'session', clock: {now: () => 1790970000000}});
  const host = await authority.registerHost({hostInstanceId: 'host-instance',
    claimedContractVersion: CONTRACT_VERSION, claimedContractHash: CONTRACT_HASH}, sender);
  const run = {runId: 'run', registrationId: host.registrationId, hostDocumentId: sender.documentId,
    hostInstanceId: 'host-instance', browserSessionIncarnation: session, state, runRevision: 1,
    ownerEpoch: 1, eventSeq: 0, cancelSeq: 0, identity: null, target: null,
    tombstoned: false, retirementState: 'not-started'};
  if (state === 'retiring') Object.assign(run, {retirementId: 'retirement', retirementState: 'fenced',
    finalState: 'failed', fencedEpoch: 1, cancelSeq: 1});
  await storage.transaction(['runs'], 'readwrite', async tx => {
    await tx.put('runs', run, run.runId);
    await tx.put('runs', {tag: 'slot', currentRunId: run.runId, fencedEpoch: 1,
      retirementId: run.retirementId ?? null, state: 'held', releaseCount: 0}, '@slot');
  });
  commits.length = 0;
  const read = () => storage.transaction(['runs'], 'readonly', tx => tx.get('runs', run.runId));
  return {authority, storage, sender, host, run, commits, read};
}

test('REGRESSION-R3-host-gone: document loss persists retirement without requiring the old host', async () => {
  const f = await fixture();
  await f.authority.loseHost(f.host.registrationId, {documentGone: true});
  const run = await f.read();
  assert.ok(run.retirementId, 'lost document needs a durable retirement for independent reconciliation');
  assert.equal(run.finalState, 'interrupted');
  assert.ok(run.cancelSeq > 0);
});

test('REGRESSION-R4-control-states: late stop preserves an existing retirement', async () => {
  const f = await fixture({state: 'retiring'});
  try {
    await f.authority.stopRun({runId: 'run', expectedRunRevision: 1, requestId: 'late-stop'}, f.sender);
  } catch (error) {
    assert.ok(error.code, 'a typed rejection may preserve the already fenced state');
  }
  const run = await f.read();
  assert.equal(run.state, 'retiring');
  assert.equal(run.runRevision, 1);
  assert.equal(run.cancelSeq, 1);
  assert.equal(run.retirementId, 'retirement');
  assert.equal(run.finalState, 'failed');
});

test('REGRESSION-R4-control-states: session recovery preserves a durable retirement', async () => {
  const f = await fixture({state: 'retiring', session: 'previous-session'});
  await f.authority.recover();
  const run = await f.read();
  assert.equal(run.state, 'retiring');
  assert.equal(run.finalState, 'failed');
  assert.equal(run.runRevision, 1);
});

test('REGRESSION-R5-terminal-fence-gap: every committed terminal has a durable retirement', async () => {
  const f = await fixture();
  await f.authority.finishRun({runId: 'run', expectedRunRevision: 1, state: 'failed', reason: 'user throw'}, f.sender);
  for (const commit of f.commits) {
    const run = commit.get('runs').get('run');
    if (!terminalStates.has(run.state)) continue;
    assert.ok(run.retirementId, 'a crash after any commit must leave a recoverable retirement');
    const retirement = [...commit.get('commandJournal').values()].find(row => row.tag === 'retirement' && row.retirementId === run.retirementId);
    assert.ok(retirement, 'the retirement and terminal must be committed together');
    assert.equal(commit.get('runs').get('@slot').retirementId, run.retirementId);
  }
});

test('REGRESSION-R6-false-completion: caller naturalEnd cannot complete an unbound run', async () => {
  const f = await fixture();
  await assert.rejects(f.authority.finishRun({runId: 'run', expectedRunRevision: 1,
    state: 'completed', naturalEnd: true}, f.sender), error => typeof error.code === 'string');
  assert.notEqual((await f.read()).state, 'completed');
});

test('REGRESSION-R8-journal-key-collision: a caller command ID cannot replace host metadata', async () => {
  const f = await fixture();
  const template = JSON.parse(await readFile(new URL('../../contracts/fixtures/transaction-template.json', import.meta.url)));
  f.storage.getTemplateByHash = async hash => { assert.equal(hash, template.contentHash); return template; };
  const target = {targetSessionId: 'target-session', tabId: 2, frameId: 0, documentId: 'target-document',
    allowedOrigin: template.allowedOrigin, targetVersion: 1, browserSessionIncarnation: 'session', creationId: 'creation'};
  const identity = {runId: 'run', hostInstanceId: 'host-instance', hostDocumentId: 'host-document',
    ownerEpoch: 1, runRevision: 1, templateHash: template.contentHash, target};
  await f.storage.transaction(['runs'], 'readwrite', async tx => {
    const run = await tx.get('runs', 'run');
    Object.assign(run, {identity, target, templateHash: template.contentHash});
    await tx.put('runs', run, 'run');
  });
  await f.authority.prepareCommand({identity, commandId: `host:${f.host.registrationId}`, kind: 'next-link',
    payload: {selector: 'a.next', url: `${template.allowedOrigin}/list?page=2`, endMarkerSelector: '.end',
      priorPageSignature: 'b'.repeat(64), waitMs: 2000}}, f.sender);
  const host = await f.authority.assertHost(f.sender, f.host.registrationId);
  assert.equal(host.registrationId, f.host.registrationId);
  assert.equal(host.active, true);
});
