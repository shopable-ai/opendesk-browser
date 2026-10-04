import test from 'node:test';
import assert from 'node:assert/strict';
import {createTargetService} from '../../src/platform/target/index.js';
import {createPagePortService, validatePlan} from '../../src/platform/page-port/index.js';
import {installPageAgent, readRawPage} from '../../src/agents/page-agent.js';
import {digest, PROTOCOL} from '../../src/platform/protocol.js';
import {commandRecordKey, pageCommandKey} from '../../src/platform/journal.js';
import {fixture, domFixture, turn} from './page-port-fixtures.test.mjs';

async function setup() { const f = await fixture();
  await f.storage.transaction(['commandJournal'], 'readwrite', async tx => {
    await tx.delete('commandJournal', f.command.commandId);
    await tx.put('commandJournal', f.command, commandRecordKey(f.command));
  });
  f.targetService = createTargetService(f); f.service = createPagePortService(f); return f; }
async function data(f, rows = [{name: '完整'.repeat(150), count: '0'}], frameIndex = 0, rowStart = 0) {
  const frame = {type: 'page-data', identity: f.identity, commandId: f.command.commandId, snapshotId: 'snapshot-1', frameIndex, rowStart, rawRows: rows, digest: ''};
  frame.digest = await digest({snapshotId: frame.snapshotId, frameIndex, rowStart, rawRows: rows}); return frame;
}
async function stage(f, frame) {
  for (let i = 0; i < frame.rawRows.length; i++) f.storage.seed('records', `snapshot-1:${frame.rowStart + i}`,
    {snapshotId: 'snapshot-1', rowIndex: frame.rowStart + i, raw: frame.rawRows[i], values: {name: frame.rawRows[i].name, count: Number(frame.rawRows[i].count)}});
  return f.service.ackPageFrame({identity: f.identity, commandId: f.command.commandId, frameIndex: frame.frameIndex, digest: frame.digest}, f.sender);
}
async function end(f, rows, frameCount = 1) {
  return {type: 'page-end', identity: f.identity, commandId: f.command.commandId, snapshotId: 'snapshot-1', frameCount, rowCount: rows.length,
    pageIdentity: f.template.startUrl, documentBaseURI: f.template.startUrl, emptyEvidence: null, rawSignature: await digest({pageIdentity: f.template.startUrl, rawRows: rows})};
}

test('frozen fixture full plan validates; recomputed broader selector/caps hash does not grant authority', async () => {
  const f = await setup(); await validatePlan(f.template, f.plan);
  const broadened = structuredClone(f.plan); broadened.fields[0].selector = '*'; delete broadened.planHash; broadened.planHash = await digest(broadened);
  await assert.rejects(validatePlan(f.template, broadened), {code: 'E_SEMANTIC'});
  const caps = structuredClone(f.plan); caps.capabilities.push('read.attribute.v1'); delete caps.planHash; caps.planHash = await digest(caps);
  await assert.rejects(validatePlan(f.template, caps), {code: 'E_CAPABILITY'});
});

test('stop after dispatched commit still permits exactly one fixed Chrome invocation; revised identity never replayed', async () => {
  const f = await setup(); const stopped = {...f.run, state: 'stopping', cancelSeq: 1, runRevision: 2, identity: {...f.identity, runRevision: 2}};
  f.storage.seed('runs', 'run-1', stopped);
  assert.equal((await f.service.executeCommand(f.command)).state, 'dispatched');
  assert.equal(f.calls.filter(c => c[0] === 'sendMessage').length, 1);
  assert.deepEqual(f.calls.find(c => c[0] === 'executeScript')[1].target, {tabId: 20, documentIds: ['document-1']});
  assert.equal((await f.service.executeCommand(f.command)).state, 'effect_unknown');
  assert.equal(f.calls.filter(c => c[0] === 'sendMessage').length, 1);
});

test('post-dispatch epoch/target/grant fences prevent stale Chrome use', async () => {
  for (const mode of ['epoch', 'document', 'grant']) {
    const f = await setup();
    if (mode === 'grant') f.api.permissions.contains = async () => false;
    else {
      const changed = structuredClone(f.run);
      if (mode === 'epoch') { changed.ownerEpoch++; changed.identity.ownerEpoch++; }
      else { changed.target.documentId = 'new-doc'; changed.identity.target.documentId = 'new-doc'; }
      f.storage.seed('runs', 'run-1', changed);
    }
    await assert.rejects(f.service.executeCommand(f.command), {code: mode === 'grant' ? 'E_PERMISSION' : 'E_TARGET'});
    assert.equal(f.calls.length, 0);
  }
});

test('script or command callback failure records unknown and cannot be blindly retried', async () => {
  const f = await setup(); f.api.tabs.sendMessage = async () => { f.calls.push(['sendMessage']); throw new Error('Callback lost'); };
  assert.equal((await f.service.executeCommand(f.command)).state, 'effect_unknown');
  assert.equal((await f.service.executeCommand(f.command)).duplicate, true);
  assert.equal(f.calls.filter(c => c[0] === 'sendMessage').length, 1);
});

test('raw reception is durable but frame ACK requires matching staged rows, then full end signature is stored', async () => {
  const f = await setup(); const frame = await data(f);
  const received = await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: frame}, f.agentSender);
  assert.equal(received.received, true); assert.equal(received.frameAck, false);
  assert.deepEqual(f.storage.value('commandJournal', commandRecordKey(f.command)).rawFrames, [frame]);
  await assert.rejects(f.service.ackPageFrame({identity: f.identity, commandId: 'command-1', frameIndex: 0, digest: frame.digest}, f.sender), {code: 'E_SEAL_INCOMPLETE'});
  assert.equal(f.calls.length, 0);
  await stage(f, frame);
  const ack = f.calls.find(c => c[0] === 'sendMessage')[2]; assert.equal(ack.type, 'PAGE_FRAME_ACK'); assert.equal(ack.payload.digest, frame.digest);
  const eof = await end(f, frame.rawRows);
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_END', payload: eof}, f.agentSender);
  assert.deepEqual(f.storage.value('commandJournal', commandRecordKey(f.command)).pageEnd, eof);
  assert.equal(f.events.every(e => e.id === f.host.registrationId), true); assert.equal(f.events.at(-1).event.payload.type, 'page-end');
});

test('duplicate frame does not emit again; conflicting digest durably blocks whole page', async () => {
  const f = await setup(); const first = await data(f);
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: first}, f.agentSender);
  assert.equal((await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: first}, f.agentSender)).duplicate, true);
  assert.equal(f.events.length, 1);
  const changed = await data(f, [{name: 'changed', count: '1'}]);
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: changed}, f.agentSender), {code: 'E_BATCH_CONFLICT'});
  assert.equal(f.storage.value('commandJournal', pageCommandKey('raw', f.identity.runId, f.command.commandId)).failed, 'E_BATCH_CONFLICT');
  assert.equal(f.storage.value('commandJournal', commandRecordKey(f.command)).state, 'effect_unknown');
});

test('actual sender document defeats payload identity spoof; stop rejects new raw data', async () => {
  const f = await setup(); const frame = await data(f);
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: frame}, {...f.agentSender, documentId: 'other-doc'}), {code: 'E_TARGET'});
  f.storage.seed('runs', 'run-1', {...f.run, state: 'stopping', cancelSeq: 1});
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: frame}, f.agentSender), {code: 'E_CANCELLED'});
  assert.equal(f.events.length, 0);
});

test('raw backpressure refuses a second unacked frame; full signature includes changed sixth row', async () => {
  const f = await setup(); const first = await data(f, Array.from({length: 5}, (_, i) => ({name: `row${i}`, count: '1'})));
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: first}, f.agentSender);
  const sixth = await data(f, [{name: 'sixth changed', count: '2'}], 1, 5);
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: sixth}, f.agentSender), {code: 'E_LIMIT'});
  await stage(f, first);
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: sixth}, f.agentSender); await stage(f, sixth);
  const all = [...first.rawRows, ...sixth.rawRows]; const good = await end(f, all, 2);
  const bad = {...good, rawSignature: await digest({pageIdentity: f.template.startUrl, rawRows: first.rawRows})};
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_END', payload: bad}, f.agentSender), {code: 'E_HASH'});
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_END', payload: good}, f.agentSender);
  assert.equal(f.storage.value('commandJournal', commandRecordKey(f.command)).pageEnd.rowCount, 6);
});

test('fixed raw DOM reader retains long text, explicit empty string and optional missing attr without transforms', async () => {
  const f = await setup(); const plan = structuredClone(f.plan);
  plan.fields = [{id: 'text', selector: '', read: 'text', required: true}, {id: 'missing', selector: '', read: 'attribute', attribute: 'missing', required: false}];
  const long = '  长'.repeat(150); const doc = domFixture([{name: long}, {name: ''}]);
  assert.deepEqual(JSON.parse(JSON.stringify(readRawPage({document: doc, plan}).rawRows)), [{text: long, missing: null}, {text: '', missing: null}]);
  assert.throws(() => readRawPage({document: {...doc, querySelectorAll: () => []}, plan}), {code: 'E_SEMANTIC'});
  assert.throws(() => readRawPage({document: domFixture([]), plan}), {code: 'E_SEAL_INCOMPLETE'});
});

test('packaged DOM agent returns short ACK before stream, awaits explicit frame ACK, then emits complete signature', async () => {
  const f = await fixture(); const messages = []; let listener;
  const api = {runtime: {id: f.api.runtime.id, getURL: f.api.runtime.getURL,
    onMessage: {addListener: fn => { listener = fn; }, removeListener() {}},
    sendMessage: async message => { messages.push(message); return {received: true}; }}};
  const document = domFixture([{name: 'title', count: '0'}, {name: 'full'.repeat(150), count: 'false'}]); document.baseURI = f.template.startUrl;
  const agent = installPageAgent({api, document, location: {href: f.template.startUrl}});
  let ack;
  listener({protocol: PROTOCOL, type: 'PAGE_EXECUTE', payload: f.command}, {id: api.runtime.id, url: api.runtime.getURL('sw.js')}, result => { ack = result; });
  assert.equal(ack.accepted, true); assert.equal(messages.length, 0);
  await turn(); await turn();
  const frame = messages.find(m => m.type === 'PAGE_DATA')?.payload; assert.ok(frame);
  assert.equal(messages.some(m => m.type === 'PAGE_END'), false);
  listener({protocol: PROTOCOL, type: 'PAGE_FRAME_ACK', payload: {identity: f.identity, commandId: 'command-1', frameIndex: 0, digest: frame.digest}}, {id: api.runtime.id}, () => {});
  await turn(); await turn();
  const eof = messages.find(m => m.type === 'PAGE_END').payload;
  assert.equal(eof.rowCount, 2); assert.equal(eof.rawSignature, await digest({pageIdentity: f.template.startUrl, rawRows: frame.rawRows}));
  agent.dispose();
});

test('page transport sends its first frame before starting the EOF signature hash', {timeout: 2000}, async t => {
  const f = await fixture(); const messages = []; let listener, releaseSignature, firstFrame, signatureStarted, ended;
  const frameReady = new Promise(resolve => { firstFrame = resolve; });
  const signatureReady = new Promise(resolve => { signatureStarted = resolve; });
  const endReady = new Promise(resolve => { ended = resolve; });
  const signatureGate = new Promise(resolve => { releaseSignature = resolve; });
  const hash = crypto.subtle.digest.bind(crypto.subtle); let signatureCalls = 0;
  t.mock.method(crypto.subtle, 'digest', async (algorithm, bytes) => {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (Object.hasOwn(value, 'pageIdentity')) { signatureCalls++; signatureStarted(); await signatureGate; }
    return hash(algorithm, bytes);
  });
  const api = {runtime: {id: f.api.runtime.id, getURL: f.api.runtime.getURL,
    onMessage: {addListener: fn => { listener = fn; }, removeListener() {}}, sendMessage: async message => {
      messages.push(message); if (message.type === 'PAGE_DATA') firstFrame(message.payload);
      if (message.type === 'PAGE_END') ended(message.payload); return {received: true};
    }}};
  const document = domFixture([{name: 'complete', count: '0'}]); document.baseURI = f.template.startUrl;
  const agent = installPageAgent({api, document, location: {href: f.template.startUrl}});
  t.after(() => { releaseSignature(); agent.dispose(); });
  let ack; listener({protocol: PROTOCOL, type: 'PAGE_EXECUTE', payload: f.command}, {id: api.runtime.id}, value => { ack = value; });
  assert.deepEqual(ack, {accepted: true}); assert.equal(messages.length, 0);
  const frame = await frameReady;
  assert.equal(signatureCalls, 0); assert.equal(messages.some(message => message.type === 'PAGE_END'), false);
  listener({protocol: PROTOCOL, type: 'PAGE_FRAME_ACK', payload: {identity: f.identity, commandId: f.command.commandId,
    frameIndex: frame.frameIndex, digest: frame.digest}}, {id: api.runtime.id}, value => { ack = value; });
  assert.deepEqual(ack, {acked: true}); await signatureReady;
  assert.equal(messages.some(message => message.type === 'PAGE_END'), false);
  releaseSignature(); const eof = await endReady;
  assert.equal(eof.rawSignature, await digest({pageIdentity: f.template.startUrl, rawRows: frame.rawRows}));
});

test('run-scoped submit/raw/effect journals preserve both runs and stay outside the unique command index', async () => {
  const f = await setup(); const firstFrame = await data(f);
  assert.equal((await f.service.executeCommand(f.command)).duplicate, false);
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: firstFrame}, f.agentSender);
  const effect = {identity: f.identity, commandId: f.command.commandId, pageIdentity: f.template.startUrl, outcome: 'failed', error: {code: 'E_TARGET'}};
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_ERROR', payload: effect}, f.agentSender);
  const secondIdentity = {...f.identity, runId: 'run-2'};
  const secondCommand = {...f.command, identity: secondIdentity, payload: {...f.command.payload, snapshotId: 'snapshot-2'}};
  secondCommand.digest = await digest({commandId: secondCommand.commandId, identity: secondIdentity, kind: secondCommand.kind, payload: secondCommand.payload});
  f.storage.seed('runs', 'run-2', {...f.run, runId: 'run-2', identity: secondIdentity});
  f.storage.seed('runs', '@slot', {currentRunId: 'run-2', state: 'held'});
  f.storage.seed('commandJournal', commandRecordKey(secondCommand), secondCommand);
  f.storage.seed('pageSnapshots', 'snapshot-2', {snapshotId: 'snapshot-2', state: 'open', readCommandId: secondCommand.commandId, sourceIdentity: secondIdentity});
  assert.equal((await f.service.executeCommand(secondCommand)).duplicate, false);
  assert.equal((await f.service.executeCommand(secondCommand)).duplicate, true);
  assert.equal(f.calls.filter(call => call[0] === 'sendMessage').length, 2);
  const secondFrame = {...firstFrame, identity: secondIdentity, snapshotId: 'snapshot-2', rawRows: [{name: 'second', count: '1'}]};
  secondFrame.digest = await digest({snapshotId: secondFrame.snapshotId, frameIndex: 0, rowStart: 0, rawRows: secondFrame.rawRows});
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: secondFrame}, f.agentSender);
  const secondEffect = {...effect, identity: secondIdentity};
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_ERROR', payload: secondEffect}, f.agentSender);
  assert.equal((await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_ERROR', payload: secondEffect}, f.agentSender)).duplicate, true);
  await assert.rejects(f.service.executeCommand(f.command), {code: 'E_TARGET'});
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: firstFrame}, f.agentSender), {code: 'E_TARGET'});
  await assert.rejects(f.service.ackPageFrame({identity: f.identity, commandId: f.command.commandId, frameIndex: 0, digest: firstFrame.digest}, f.sender), {code: 'E_TARGET'});
  for (const [identity, frame, outcome] of [[f.identity, firstFrame, effect], [secondIdentity, secondFrame, secondEffect]]) {
    for (const kind of ['submit', 'raw', 'effect']) {
      const row = f.storage.value('commandJournal', pageCommandKey(kind, identity.runId, f.command.commandId));
      assert.equal(row.operationCommandId, f.command.commandId); assert.equal(Object.hasOwn(row, 'commandId'), false);
      assert.deepEqual(row.identity, identity);
    }
    assert.deepEqual(f.storage.value('commandJournal', pageCommandKey('raw', identity.runId, f.command.commandId)).frames[0].frame, frame);
    assert.deepEqual(f.storage.value('commandJournal', pageCommandKey('effect', identity.runId, f.command.commandId)).result, outcome);
  }
  const indexedRows = await f.storage.transaction(['commandJournal'], 'readonly', async tx =>
    (await tx.all('commandJournal')).filter(row => row.identity?.runId && row.commandId));
  assert.equal(indexedRows.length, 2); assert.deepEqual(indexedRows.map(row => row.identity.runId).sort(), ['run-1', 'run-2']);
});

test('raw frame and ACK never infer a missing run or accept a command with a rewritten revision', async () => {
  const f = await setup(); const frame = await data(f);
  const missingIdentity = structuredClone(frame); delete missingIdentity.identity.runId;
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: missingIdentity}, f.agentSender), {code: 'E_SCHEMA'});
  await assert.rejects(f.service.ackPageFrame({commandId: f.command.commandId, frameIndex: 0, digest: frame.digest}, f.sender), {code: 'E_SCHEMA'});
  const revised = {...f.identity, runRevision: 2};
  f.storage.seed('runs', f.run.runId, {...f.run, identity: revised, runRevision: 2});
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'PAGE_DATA', payload: {...frame, identity: revised}}, f.agentSender), {code: 'E_OWNER'});
  assert.equal(f.events.length, 0); assert.equal(f.storage.value('commandJournal', pageCommandKey('raw', f.identity.runId, f.command.commandId)), undefined);
  assert.deepEqual(f.storage.value('commandJournal', commandRecordKey(f.command)).identity, f.identity);
});

test('negative fixed-agent receipt is unknown and its run-scoped submission cannot replay', async () => {
  const f = await setup(); f.api.tabs.sendMessage = async (...args) => { f.calls.push(['sendMessage', ...args]); return {error: {code: 'E_SCHEMA'}}; };
  assert.equal((await f.service.executeCommand(f.command)).state, 'effect_unknown');
  const submission = f.storage.value('commandJournal', pageCommandKey('submit', f.identity.runId, f.command.commandId));
  assert.equal(submission.state, 'effect_unknown'); assert.equal(submission.errorCode, 'E_TARGET');
  f.storage.seed('commandJournal', commandRecordKey(f.command), {...f.command, state: 'effect_unknown'});
  assert.deepEqual(await f.service.executeCommand(f.command), {commandId: f.command.commandId, state: 'effect_unknown', duplicate: true});
  assert.equal(f.calls.filter(call => call[0] === 'sendMessage').length, 1);
  assert.deepEqual(f.storage.value('commandJournal', pageCommandKey('submit', f.identity.runId, f.command.commandId)), submission);
});

test('packaged agent and page port exchange a durable run-bound ACK before saving the complete EOF', {timeout: 2000}, async t => {
  const f = await setup(); let listener, frameReceived, endReceived;
  const frameReady = new Promise(resolve => { frameReceived = resolve; });
  const endReady = new Promise(resolve => { endReceived = resolve; });
  f.api.runtime.onMessage = {addListener: fn => { listener = fn; }, removeListener() {}};
  f.api.runtime.sendMessage = async message => {
    const receipt = await f.service.handleAgentMessage(message, f.agentSender);
    if (message.type === 'PAGE_DATA') frameReceived(message.payload);
    if (message.type === 'PAGE_END') endReceived(message.payload);
    return receipt;
  };
  f.api.tabs.sendMessage = async (...args) => {
    f.calls.push(['sendMessage', ...args]); let receipt;
    listener(args[1], {id: f.api.runtime.id, url: f.api.runtime.getURL('sw.js')}, value => { receipt = value; });
    return receipt;
  };
  const rows = [{name: '完整'.repeat(150), count: '0'}, {name: '', count: '1'}];
  const document = domFixture(rows); document.baseURI = f.template.startUrl;
  const agent = installPageAgent({api: f.api, document, location: {href: f.template.startUrl}}); t.after(() => agent.dispose());
  assert.equal((await f.service.executeCommand(f.command)).state, 'dispatched');
  const frame = await frameReady;
  assert.deepEqual(JSON.parse(JSON.stringify(frame.rawRows)), rows);
  assert.equal(f.storage.value('commandJournal', commandRecordKey(f.command)).pageEnd, undefined);
  assert.deepEqual(await stage(f, frame), {acked: true});
  const browserACK = f.calls.find(call => call[0] === 'sendMessage' && call[2].type === 'PAGE_FRAME_ACK')[2].payload;
  assert.deepEqual(browserACK.identity, f.identity); assert.equal(browserACK.commandId, f.command.commandId);
  const eof = await endReady;
  assert.equal(eof.rowCount, rows.length); assert.equal(eof.rawSignature, await digest({pageIdentity: f.template.startUrl, rawRows: rows}));
  assert.deepEqual(f.storage.value('commandJournal', commandRecordKey(f.command)).pageEnd, eof);
  assert.equal((await f.service.executeCommand(f.command)).duplicate, true);
  assert.equal(f.calls.filter(call => call[0] === 'sendMessage' && call[2].type === 'PAGE_EXECUTE').length, 1);
});

test('agent command and ACK namespaces separate equal command IDs and digests across runs', {timeout: 2000}, async t => {
  const f = await fixture(); const messages = []; let listener, framesReady, firstEnd, allEnds;
  const frames = new Promise(resolve => { framesReady = resolve; });
  const oneEnd = new Promise(resolve => { firstEnd = resolve; });
  const ends = new Promise(resolve => { allEnds = resolve; });
  const api = {runtime: {id: f.api.runtime.id, getURL: f.api.runtime.getURL,
    onMessage: {addListener: fn => { listener = fn; }, removeListener() {}}, sendMessage: async message => {
      messages.push(message);
      if (message.type === 'PAGE_DATA' && messages.filter(item => item.type === 'PAGE_DATA').length === 2) framesReady();
      if (message.type === 'PAGE_END') { firstEnd(message.payload); if (messages.filter(item => item.type === 'PAGE_END').length === 2) allEnds(); }
      return {received: true};
    }}};
  const document = domFixture([{name: 'same raw frame', count: '0'}]); document.baseURI = f.template.startUrl;
  const agent = installPageAgent({api, document, location: {href: f.template.startUrl}}); t.after(() => agent.dispose());
  const send = (type, payload) => { let response; listener({protocol: PROTOCOL, type, payload}, {id: api.runtime.id}, value => { response = value; }); return response; };
  const second = {...f.command, identity: {...f.identity, runId: 'run-2'}};
  second.digest = await digest({commandId: second.commandId, identity: second.identity, kind: second.kind, payload: second.payload});
  assert.deepEqual(send('PAGE_EXECUTE', f.command), {accepted: true}); assert.deepEqual(send('PAGE_EXECUTE', second), {accepted: true});
  assert.deepEqual(send('PAGE_EXECUTE', f.command), {accepted: true, duplicate: true});
  await frames;
  const rawFrames = messages.filter(item => item.type === 'PAGE_DATA').map(item => item.payload);
  assert.equal(rawFrames[0].digest, rawFrames[1].digest);
  const ack = {commandId: f.command.commandId, frameIndex: 0, digest: rawFrames[0].digest};
  assert.equal(send('PAGE_FRAME_ACK', ack).error.code, 'E_SCHEMA');
  assert.equal(send('PAGE_FRAME_ACK', {...ack, identity: {...f.identity, runRevision: 2}}).error.code, 'E_TARGET');
  assert.equal(messages.some(item => item.type === 'PAGE_END'), false);
  assert.deepEqual(send('PAGE_FRAME_ACK', {...ack, identity: f.identity}), {acked: true});
  assert.equal((await oneEnd).identity.runId, f.identity.runId);
  assert.equal(messages.filter(item => item.type === 'PAGE_END').length, 1);
  assert.deepEqual(send('PAGE_FRAME_ACK', {...ack, identity: second.identity}), {acked: true}); await ends;
  assert.deepEqual(messages.filter(item => item.type === 'PAGE_END').map(item => item.payload.identity.runId).sort(), ['run-1', 'run-2']);
});

async function sourceSetup() {
  const f = await setup();
  f.storage.seed('commandJournal', 'gesture:gesture-1', {tag: 'gesture-ticket', gestureTicketId: 'gesture-1', sourceTabId: 40,
    origin: f.template.allowedOrigin, sourceUrl: f.template.startUrl, gestureAt: new Date().toISOString(), browserSessionIncarnation: f.session, consumed: false});
  f.sourceSender = {...f.agentSender, tab: {id: 40}, documentId: 'source-doc'};
  f.api.scripting.executeScript = async options => { f.calls.push(['executeScript', options]);
    if (options.target.frameIds) await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'AGENT_READY', payload: {}}, f.sourceSender); };
  f.context = await f.service.openSourceContext({gestureTicketId: 'gesture-1', registrationId: f.host.registrationId, requestId: 'open-1'}, f.sender);
  return f;
}
const selection = (f, operationId) => ({context: f.context, operationId, requestId: `request-${operationId}`, kind: 'select-list', fieldId: null});
const selected = (f, operationId) => ({selectionId: f.context.selectionId, operationId, sourceDocumentId: 'source-doc', kind: 'select-list', status: 'selected',
  selectors: {containerSelector: '.rows', rowSelector: '.row', fieldSelector: null, nextSelector: null}, error: null});

test('single-use real action ticket binds actual source document, no run/records/slot created', async () => {
  const f = await sourceSetup(); assert.equal(f.context.sourceDocumentId, 'source-doc');
  assert.equal(f.storage.value('commandJournal', 'gesture:gesture-1').consumed, true);
  assert.equal(f.storage.value('runs', '@slot').currentRunId, 'run-1'); assert.equal(f.storage.value('records', 'snapshot-1:0'), undefined);
  await assert.rejects(f.service.openSourceContext({gestureTicketId: 'gesture-1', registrationId: f.host.registrationId, requestId: 'steal'}, f.sender), {code: 'E_OWNER'});
});

test('new operation durably cancels old; old source result audited and rejected, new result goes only to original host', async () => {
  const f = await sourceSetup(); await f.service.startSourceSelection(selection(f, 'op-1'), f.sender); await f.service.startSourceSelection(selection(f, 'op-2'), f.sender);
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'SOURCE_RESULT', payload: selected(f, 'op-1')}, f.sourceSender), {code: 'E_CANCELLED'});
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'SOURCE_RESULT', payload: selected(f, 'op-2')}, f.sourceSender);
  assert.equal(f.events.every(e => e.id === f.host.registrationId), true); assert.equal(f.events.at(-1).event.payload.operationId, 'op-2');
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'SOURCE_RESULT', payload: selected(f, 'op-2')}, {...f.sourceSender, documentId: 'other-doc'}), {code: 'E_TARGET'});
});

test('cancel/release are durable before cleanup; duplicate release cannot mutate context', async () => {
  const f = await sourceSetup(); await f.service.startSourceSelection(selection(f, 'op-1'), f.sender);
  f.api.tabs.sendMessage = async (_id, message) => { if (message.type === 'SOURCE_CLEANUP') assert.equal(f.storage.value('commandJournal', `source-operation:${f.context.selectionId}:op-1`).state, 'cancelled'); return {accepted: true}; };
  await f.service.cancelSourceSelection({selectionId: f.context.selectionId, operationId: 'op-1', requestId: 'cancel-1'}, f.sender);
  await assert.rejects(f.service.handleAgentMessage({protocol: PROTOCOL, type: 'SOURCE_RESULT', payload: selected(f, 'op-1')}, f.sourceSender), {code: 'E_CANCELLED'});
  const request = {selectionId: f.context.selectionId, expectedContextRevision: 1, requestId: 'release-1'};
  assert.equal((await f.service.releaseSourceContext(request, f.sender)).state, 'released');
  assert.equal((await f.service.releaseSourceContext(request, f.sender)).duplicate, true);
  assert.equal(f.storage.value('commandJournal', `source-context:${f.context.selectionId}`).context.contextRevision, 2);
});

test('preview samples at most ten full raw rows using shared plan binding and iterator ACK; no records written', async () => {
  const f = await sourceSetup();
  const iterator = await f.service.previewSource({context: f.context, requestId: 'preview-1', draft: f.template, plan: f.plan, maxPreviewRows: 10}, f.sender);
  const rawRows = [{name: ' long '.repeat(150), count: '0'}];
  const frame = {type: 'source-preview-data', context: f.context, requestId: 'preview-1', frameIndex: 0, rowStart: 0, rawRows,
    digest: await digest({selectionId: f.context.selectionId, requestId: 'preview-1', frameIndex: 0, rowStart: 0, rawRows})};
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'SOURCE_PREVIEW_DATA', payload: frame}, f.sourceSender);
  assert.deepEqual((await iterator.next()).value, frame);
  const next = iterator.next(); await turn();
  assert.equal(f.calls.some(c => c[0] === 'sendMessage' && c[2].type === 'SOURCE_FRAME_ACK'), true);
  const eof = {type: 'source-preview-end', context: f.context, requestId: 'preview-1', frameCount: 1, rowCount: 1, pageIdentity: f.template.startUrl,
    documentBaseURI: f.template.startUrl, emptyEvidence: null, rawSignature: await digest({pageIdentity: f.template.startUrl, rawRows}), hasMore: true};
  await f.service.handleAgentMessage({protocol: PROTOCOL, type: 'SOURCE_PREVIEW_END', payload: eof}, f.sourceSender);
  assert.deepEqual((await next).value, eof); assert.equal((await iterator.next()).done, true);
  assert.equal(f.storage.value('records', 'snapshot-1:0'), undefined);
});

test('placeholder SelectorUI reports MODULE_NOT_INSTALLED, never fabricates selected status', async () => {
  const f = await fixture(); const messages = []; let listener;
  const api = {runtime: {id: f.api.runtime.id, getURL: f.api.runtime.getURL,
    onMessage: {addListener: fn => { listener = fn; }, removeListener() {}}, sendMessage: async message => { messages.push(message); return {received: true}; }}};
  const context = {selectionId: 'source-1', sourceTabId: 20, frameId: 0, sourceDocumentId: 'source-doc', origin: f.template.allowedOrigin,
    gestureAt: new Date().toISOString(), hostInstanceId: f.host.hostInstanceId, hostDocumentId: f.host.hostDocumentId, registrationId: f.host.registrationId,
    browserSessionIncarnation: f.session, contextRevision: 1, expiresAt: new Date(Date.now() + 600000).toISOString(), state: 'active', allowedOperations: ['select-list']};
  const agent = installPageAgent({api, document: domFixture([]), location: {href: f.template.startUrl}, selectionProvider: () => ({selectionImplemented: false})});
  listener({protocol: PROTOCOL, type: 'SOURCE_START', payload: {context, operationId: 'op-1', requestId: 'select-1', kind: 'select-list', fieldId: null}}, {id: api.runtime.id}, () => {});
  await turn();
  assert.equal(messages[0].payload.status, 'failed'); assert.equal(messages[0].payload.error.code, 'MODULE_NOT_INSTALLED'); agent.dispose();
});
