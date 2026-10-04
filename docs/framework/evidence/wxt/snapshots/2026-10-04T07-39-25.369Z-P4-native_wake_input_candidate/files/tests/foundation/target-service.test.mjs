import test from 'node:test';
import assert from 'node:assert/strict';
import {createTargetService} from '../../src/platform/target/index.js';
import {runBootstrap} from '../../src/agents/bootstrap.js';
import {fixture} from './page-port-fixtures.test.mjs';

async function setupCreate() {
  const f = await fixture();
  f.run.target = null; f.run.identity = null; f.run.state = 'preparing'; f.run.creationId = null;
  f.storage.seed('runs', f.run.runId, f.run);
  f.service = createTargetService(f);
  f.request = {runId: f.run.runId, expectedRunRevision: 1, registrationId: f.host.registrationId, requestId: 'create-request'};
  return f;
}

test('creation dispatch commits before one exact bootstrap create; retries do not create again', async () => {
  const f = await setupCreate();
  const original = f.api.tabs.create;
  f.api.tabs.create = async options => {
    const run = f.storage.value('runs', 'run-1');
    const intent = f.storage.value('commandJournal', `target-create:${run.creationId}`);
    assert.equal(intent.state, 'dispatched'); assert.equal(intent.submissionCount, 1);
    assert.equal(options.url, intent.bootstrapUrl); assert.equal(options.active, false);
    return original(options);
  };
  const result = await f.service.createTarget(f.request, f.sender);
  assert.equal(result.target, null);
  await f.service.createTarget(f.request, f.sender);
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 1);
});

test('creation callback gap freezes slot, never infers never-created or blindly retries', async () => {
  const f = await setupCreate(); f.api.tabs.create = async () => { throw new Error('Worker disappeared after create'); };
  const result = await f.service.createTarget(f.request, f.sender);
  assert.equal(result.state, 'effect_unknown'); assert.equal(f.storage.value('runs', 'run-1').state, 'paused_unknown');
  await f.service.createTarget(f.request, f.sender);
  assert.equal(f.storage.value('runs', '@slot').currentRunId, 'run-1');
});

test('bootstrap registers real tab/document before at-most-one navigation dispatch; content spoof rejected', async () => {
  const f = await setupCreate(); const result = await f.service.createTarget(f.request, f.sender);
  const intentKey = `target-create:${result.creationId}`;
  const intent = f.storage.value('commandJournal', intentKey);
  const sender = {...f.agentSender, tab: {id: 30}, documentId: 'bootstrap-doc', url: intent.bootstrapUrl};
  await assert.rejects(f.service.bootstrapReady({creationId: result.creationId}, {...sender, frameId: 2}), {code: 'E_TARGET'});
  const registered = await f.service.bootstrapReady({creationId: result.creationId, phase: 'ready'}, sender);
  assert.equal(registered.navigate, false); assert.equal(f.storage.value('commandJournal', intentKey).knownDocumentId, 'bootstrap-doc');
  const request = {creationId: result.creationId, phase: 'navigate'};
  assert.equal((await f.service.bootstrapReady(request, sender)).navigate, true);
  assert.equal((await f.service.bootstrapReady(request, sender)).navigate, false);
  assert.equal(f.storage.value('commandJournal', intentKey).navigationSubmissionCount, 1);
  assert.equal(f.calls.some(c => c[0] === 'update'), false);
});

test('stop before bootstrap navigation prevents location authorization', async () => {
  const f = await setupCreate(); const created = await f.service.createTarget(f.request, f.sender);
  const intent = f.storage.value('commandJournal', `target-create:${created.creationId}`);
  const sender = {...f.agentSender, tab: {id: 30}, documentId: 'bootstrap-doc', url: intent.bootstrapUrl};
  await f.service.bootstrapReady({creationId: created.creationId}, sender);
  const run = f.storage.value('runs', 'run-1'); run.state = 'stopping'; run.cancelSeq++; run.runRevision++; f.storage.seed('runs', 'run-1', run);
  await assert.rejects(f.service.bootstrapReady({creationId: created.creationId, phase: 'navigate'}, sender), {code: 'E_CANCELLED'});
  assert.equal(f.storage.value('commandJournal', `target-create:${created.creationId}`).navigationSubmissionCount, 0);
});

test('formal target binds only real same-origin new document after navigation', async () => {
  const f = await setupCreate(); const created = await f.service.createTarget(f.request, f.sender);
  const intent = f.storage.value('commandJournal', `target-create:${created.creationId}`);
  const bootstrap = {...f.agentSender, tab: {id: 30}, documentId: 'bootstrap-doc', url: intent.bootstrapUrl};
  await f.service.bootstrapReady({creationId: created.creationId, phase: 'navigate'}, bootstrap);
  const actual = {...f.agentSender, tab: {id: 30}, documentId: 'actual-doc'};
  const ready = await f.service.agentReady({payload: {}}, actual);
  assert.equal(ready.target.documentId, 'actual-doc'); assert.equal(ready.identity.runRevision, 2);
  const bind = await f.service.bindTarget({runId: 'run-1', registrationId: f.host.registrationId}, f.sender);
  assert.deepEqual(bind.identity, ready.identity);
  await assert.rejects(f.service.validateAgentSender(bind.identity, {...actual, documentId: 'claimed-doc'}), {code: 'E_TARGET'});
});

test('formal run cannot borrow activeTab instead of optional grant', async () => {
  const f = await setupCreate(); f.api.permissions.contains = async () => false;
  await assert.rejects(f.service.createTarget(f.request, f.sender), {code: 'E_PERMISSION'});
  assert.equal(f.calls.some(c => c[0] === 'create'), false);
});

async function retiring({session = 'session-current', neverCreated = false} = {}) {
  const f = await fixture();
  f.run.state = 'retiring'; f.run.retirementId = 'retirement-1'; f.run.fencedEpoch = 2; f.run.ownerEpoch = 2; f.run.finalState = 'abandoned_unknown';
  f.storage.seed('runs', 'run-1', f.run);
  f.storage.seed('runs', '@slot', {currentRunId: 'run-1', fencedEpoch: 2, retirementId: 'retirement-1', releaseCount: 0, state: 'held'});
  f.storage.seed('commandJournal', 'target-create:creation-1', {tag: 'target-create', creationId: 'creation-1', runId: 'run-1', ownerEpoch: 1,
    browserSessionIncarnation: session, knownTabId: neverCreated ? null : 20, knownDocumentId: 'document-1', state: neverCreated ? 'prepared' : 'known',
    submissionCount: neverCreated ? 0 : 1, dispatchAt: neverCreated ? null : new Date().toISOString(), retirementId: null});
  f.service = createTargetService(f); return f;
}

test('retirement remove + separate not-found evidence releases only matching slot once; old replay cannot clear new run', async () => {
  const f = await retiring();
  const first = await f.service.retireTarget({retirementId: 'retirement-1'}, f.sender);
  assert.equal(first.releaseCount, 1); assert.equal(f.storage.value('runs', '@slot').currentRunId, null);
  f.storage.seed('runs', '@slot', {currentRunId: 'run-2', fencedEpoch: 1, retirementId: null, releaseCount: 0, state: 'held'});
  assert.deepEqual(await f.service.retireTarget({retirementId: 'retirement-1'}, f.sender), first);
  assert.equal(f.storage.value('runs', '@slot').currentRunId, 'run-2'); assert.equal(f.calls.filter(c => c[0] === 'remove').length, 1);
});

test('cross-session numeric tab id is never queried or removed and slot remains frozen', async () => {
  const f = await retiring({session: 'old-session'});
  const result = await f.service.retireTarget({retirementId: 'retirement-1'}, f.sender);
  assert.equal(result.reason, 'cross-session-unverified'); assert.equal(f.calls.length, 0); assert.equal(f.tabs.has(20), true);
  assert.equal(f.storage.value('runs', '@slot').currentRunId, 'run-1');
});

test('generic tabs.get failure cannot prove absence', async () => {
  const f = await retiring(); f.api.tabs.get = async () => { throw new Error('Disconnected API'); };
  await assert.rejects(f.service.retireTarget({retirementId: 'retirement-1'}, f.sender), {code: 'E_TARGET'});
  assert.equal(f.storage.value('runs', '@slot').currentRunId, 'run-1');
});

test('prepared/submissionCount=0 proves never-created; missing intent never releases', async () => {
  const f = await retiring({neverCreated: true});
  assert.equal((await f.service.retireTarget({retirementId: 'retirement-1'}, f.sender)).state, 'released'); assert.equal(f.calls.length, 0);
  const g = await retiring(); await g.storage.transaction(['commandJournal'], 'readwrite', tx => tx.delete('commandJournal', 'target-create:creation-1'));
  await assert.rejects(g.service.retireTarget({retirementId: 'retirement-1'}, g.sender), {code: 'E_TARGET'});
  assert.equal(g.storage.value('runs', '@slot').currentRunId, 'run-1');
});

test('bootstrap agent requests registration and navigation before exactly one assign', async () => {
  const order = [];
  const api = {runtime: {sendMessage: async message => { order.push(message.type); return message.type === 'BOOTSTRAP_READY' ? {ok: true} : {ok: true, navigate: true, creationId: 'nonce', startUrl: 'https://fixture.example/list'}; }}};
  await runBootstrap({api, location: {href: 'chrome-extension://test-extension/ui/target-bootstrap.html?creationId=nonce', assign: url => order.push(url)}});
  assert.deepEqual(order, ['BOOTSTRAP_READY', 'BOOTSTRAP_NAVIGATE', 'https://fixture.example/list']);
});
