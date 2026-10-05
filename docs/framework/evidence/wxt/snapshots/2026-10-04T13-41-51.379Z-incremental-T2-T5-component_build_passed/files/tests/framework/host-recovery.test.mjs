import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostClient} from '../../src/platform/host/client.js';
import {recoverHostTab} from '../../src/platform/host/broker.js';
import {CONTRACT_HASH, CONTRACT_VERSION, PROTOCOL} from '../../src/platform/protocol.js';

function listenerSet() {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    emit(value) { for (const listener of [...listeners]) listener(value); },
    get size() { return listeners.size; }
  };
}

function serialStore(rows = []) {
  const stores = new Map([['commandJournal', new Map(rows.map(row => [`host:${row.registrationId}`, structuredClone(row)]))]]);
  return {
    transaction(names, mode, body) {
      assert.deepEqual(names, ['commandJournal']);
      const tx = {
        get: async (name, key) => structuredClone(stores.get(name).get(key)),
        all: async name => [...stores.get(name).values()].map(value => structuredClone(value)),
        put: async (name, value, key) => { stores.get(name).set(key, structuredClone(value)); },
        delete: async (name, key) => { stores.get(name).delete(key); }
      };
      return body(tx);
    }
  };
}

test('HostClient rebinds its existing registration after port loss and preserves run observers', async () => {
  const ports = [];
  const registration = {registrationId: 'registration-one', hostDocumentId: 'host-doc', projection: {slotAvailable: true}};
  const api = {runtime: {
    connect({name}) {
      assert.equal(name, PROTOCOL);
      const port = {name, onMessage: listenerSet(), onDisconnect: listenerSet(), bound: [],
        postMessage(message) { this.bound.push(message); },
        disconnect() { this.onDisconnect.emit(); }};
      ports.push(port); return port;
    },
    async sendMessage(message) {
      assert.equal(message.protocol, PROTOCOL);
      if (message.type !== 'registerHost') return {ok: true, data: {run: null, results: [], slotAvailable: true}};
      assert.equal(message.type, 'registerHost');
      assert.equal(message.payload.claimedContractVersion, CONTRACT_VERSION);
      assert.equal(message.payload.claimedContractHash, CONTRACT_HASH);
      return {ok: true, data: registration};
    }
  }};
  const client = createHostClient(api);
  await client.ready;
  assert.deepEqual(ports[0].bound, [{type: 'bind-host', registrationId: 'registration-one'}]);

  const events = [];
  client.subscribeRun(event => events.push(event));
  ports[0].onDisconnect.emit();
  assert.equal(client.resourceSnapshot().ports, 0);

  await client.request('snapshotControllerRun', {runId: 'run-one'});
  assert.equal(ports.length, 2);
  assert.deepEqual(ports[1].bound, [{type: 'bind-host', registrationId: 'registration-one'}]);
  ports[1].onMessage.emit({registrationId: 'registration-one', event: {runId: 'run-one', state: 'paused_unknown'}});
  assert.deepEqual(events, [{runId: 'run-one', state: 'paused_unknown'}]);
  client.dispose();
});

test('recoverHostTab preserves unknown when native getContexts cannot prove host absence', async () => {
  const host = {tag: 'host', registrationId: 'host-one', hostInstanceId: 'instance-one', hostDocumentId: 'host-doc',
    hostTabId: 7, browserSessionIncarnation: 'browser-session', active: true};
  const storage = serialStore([host]);
  let lost = 0;
  const result = await recoverHostTab({
    api: {runtime: {getContexts: async () => { throw new Error('native contexts unavailable'); }}},
    storage, session: 'browser-session',
    authority: {loseHost: async () => { lost++; }},
    consumer: {invalidateHost: async () => {}, reconcileRetirements: async () => {}}
  }, 7);
  assert.deepEqual(result, [{registrationId: 'host-one', state: 'unknown'}]);
  assert.equal(lost, 0);
  assert.equal((await storage.transaction(['commandJournal'], 'readonly', tx => tx.get('commandJournal', 'host:host-one'))).active, true);
});


test('HostClient times out an unreachable operation without replay and preserves original host on reconnect', async () => {
  const ids = [], operations = [], ports = [];
  const api = {runtime:{connect() { const port = {onMessage:listenerSet(),onDisconnect:listenerSet(),postMessage(){},disconnect(){}};ports.push(port);return port; },
    sendMessage(message) { if (message.type === 'registerHost') { ids.push(message.payload.hostInstanceId); return Promise.resolve({ok:true,data:{registrationId:'original'}}); }
      operations.push(message); return new Promise(() => {}); }}};
  const client = createHostClient(api,{requestTimeoutMs:20,reconnectDelayMs:5});
  try {
    await client.ready;
    await assert.rejects(client.request('controllerOperation',{requestId:'once'}),error=>error.code==='E_EFFECT_UNKNOWN');
    ports[0].onDisconnect.emit();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(ports.length,2); assert.deepEqual(ids,[ids[0],ids[0]]); assert.equal(operations.length,1);
    assert.equal(client.resourceSnapshot().pending,1); // native message still unresolved, never hidden or replayed
  } finally {client.dispose();}
});

test('HostClient does not retain a request that Chrome rejected before submission', async () => {
  const api = {runtime:{connect:()=>({onMessage:listenerSet(),onDisconnect:listenerSet(),postMessage(){},disconnect(){}}),
    sendMessage(message) { if(message.type==='registerHost') return Promise.resolve({ok:true,data:{registrationId:'original'}});
      throw new Error('Extension context invalidated'); }}};
  const client=createHostClient(api);
  try {await client.ready;await assert.rejects(client.request('snapshotControllerRun',{}),/context invalidated/);
    assert.equal(client.resourceSnapshot().pending,0);assert.equal(client.resourceSnapshot().timers,0);
  } finally {client.dispose();}
});
