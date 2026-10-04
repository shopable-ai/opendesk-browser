import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {digest, invariant} from '../../src/platform/protocol.js';
globalThis.crypto ||= webcrypto;

export async function fixture() {
  const template = JSON.parse(await readFile(new URL('../../contracts/fixtures/transaction-template.json', import.meta.url)));
  const {plan} = JSON.parse(await readFile(new URL('../../contracts/fixtures/read-command.json', import.meta.url)));
  const session = 'session-current';
  const registrationId = 'host-reg';
  const host = {tag: 'host', registrationId, hostInstanceId: 'host-1', hostDocumentId: 'host-doc-1', active: true, revoked: false, browserSessionIncarnation: session};
  const sender = {id: 'test-extension', documentId: host.hostDocumentId, frameId: 0, url: 'chrome-extension://test-extension/ui/tool.html', tab: {id: 8}};
  const target = {targetSessionId: 'target-session', tabId: 20, frameId: 0, documentId: 'document-1', allowedOrigin: template.allowedOrigin,
    targetVersion: 1, browserSessionIncarnation: session, creationId: 'creation-1'};
  const identity = {runId: 'run-1', hostInstanceId: host.hostInstanceId, hostDocumentId: host.hostDocumentId,
    ownerEpoch: 1, runRevision: 1, templateHash: template.contentHash, target};
  const run = {...identity, identity, target, registrationId, browserSessionIncarnation: session, startUrl: template.startUrl,
    state: 'running', cancelSeq: 0, creationId: target.creationId, retirementState: 'not-started'};
  const command = {commandId: 'command-1', identity, kind: 'read-page', payload: {plan, snapshotId: 'snapshot-1', pageSequence: 1,
    expectedPageIdentity: template.startUrl}, digest: '', state: 'dispatched', preparedAt: new Date().toISOString(), dispatchAt: new Date().toISOString(), resultDigest: null};
  command.digest = await digest({commandId: command.commandId, identity, kind: command.kind, payload: command.payload});
  const agentSender = {id: sender.id, tab: {id: target.tabId}, frameId: 0, documentId: target.documentId, url: template.startUrl};
  const storage = memoryStorage();
  storage.seed('runs', run.runId, run); storage.seed('runs', '@slot', {currentRunId: run.runId, fencedEpoch: 1, retirementId: null, releaseCount: 0, state: 'held'});
  storage.seed('commandJournal', `host:${registrationId}`, host); storage.seed('commandJournal', command.commandId, command);
  storage.seed('templates', `${template.templateId}:${template.revision}`, template);
  storage.seed('pageSnapshots', 'snapshot-1', {snapshotId: 'snapshot-1', state: 'open', readCommandId: command.commandId, sourceIdentity: identity});
  const calls = []; const tabs = new Map([[20, {id: 20, url: template.startUrl}]]);
  const api = {runtime: {id: sender.id, getURL: path => `chrome-extension://${sender.id}/${path}`},
    permissions: {contains: async () => true},
    scripting: {executeScript: async options => { calls.push(['executeScript', options]); }},
    tabs: {create: async options => { calls.push(['create', options]); const tab = {id: 30, url: options.url}; tabs.set(30, tab); return tab; },
      query: async () => [...tabs.values()], get: async id => { calls.push(['get', id]); if (!tabs.has(id)) throw new Error(`No tab with id: ${id}`); return tabs.get(id); },
      remove: async id => { calls.push(['remove', id]); tabs.delete(id); }, sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return {accepted: true}; }} };
  const assertHost = async (actual, id) => {
    invariant(actual?.id === api.runtime.id && actual.documentId === host.hostDocumentId && (!id || id === registrationId), 'E_OWNER');
    const current = storage.value('commandJournal', `host:${registrationId}`); invariant(current?.active && !current.revoked, 'E_OWNER'); return current;
  };
  const events = []; const emitToHost = async (id, event) => { events.push({id, event}); };
  return {template, plan, session, host, sender, target, identity, run, command, agentSender, storage, api, tabs, calls, assertHost, events, emitToHost};
}

export function memoryStorage() {
  let data = new Map(); let chain = Promise.resolve();
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const table = (map, store) => { if (!map.has(store)) map.set(store, new Map()); return map.get(store); };
  return {
    seed(store, key, value) { table(data, store).set(key, clone(value)); },
    value(store, key) { return clone(table(data, store).get(key)); },
    transaction(stores, mode, callback) {
      const operation = chain.then(async () => {
        const draft = clone(data);
        const check = store => invariant(stores.includes(store), 'E_SCHEMA');
        const tx = {get: async (store, key) => { check(store); return clone(table(draft, store).get(key)); },
          put: async (store, value, key) => { check(store); invariant(mode === 'readwrite' && key !== undefined, 'E_SCHEMA'); table(draft, store).set(key, clone(value)); },
          delete: async (store, key) => { check(store); table(draft, store).delete(key); }, all: async store => { check(store); return clone([...table(draft, store).values()]); }};
        const result = await callback(tx); if (mode === 'readwrite') data = draft; return result;
      });
      chain = operation.catch(() => {}); return operation;
    }
  };
}

export async function turn() { await new Promise(resolve => setImmediate(resolve)); }
export function domFixture(rows) {
  const domRows = rows.map(raw => ({textContent: raw.name, getAttribute: key => raw[key] ?? null,
    querySelectorAll: selector => selector === '.name' ? [{textContent: raw.name}] : selector === '.count' ? [{textContent: raw.count}] : []}));
  const container = {querySelectorAll: () => domRows};
  return {baseURI: 'https://fixture.example/list', querySelectorAll: selector => selector === '.rows' ? [container] : [], querySelector: () => null};
}
