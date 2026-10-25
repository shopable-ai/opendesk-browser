// Node component tests of the real business module with isolated site/storage
// dependencies. Synthetic replies below are NOT official ChatGPT evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {runCalculationRelay, ACTIVE_KEY, journalKey, parseReply} from '../src/relay.js';
import {createStorageFacades} from '../../../../src/framework/sdk/storage.js';
import {buildProgramProjectInMemory} from '../../../../scripts/build-program-project.mjs';
import {controllerProgramBody} from '../../../../src/scripting/sandbox/worker-runtime.js';

function harness(options = {}) {
  const data = new Map(), actions = [], writes = [];
  const store = createStorageFacades(async (method, args) => {
    if (method === 'APPSTORAGE_GETITEM') {
      const raw = data.get(args.key) ?? null;
      if (options.badReadback && raw?.includes('"A":{"state":"completed"')) return raw + ' ';
      return raw;
    }
    assert.equal(method, 'APPSTORAGE_SETITEM');
    if (options.rejectStorage) throw new Error('E_CAPABILITY: storage.persistent denied');
    data.set(args.key, String(args.value));
    writes.push([args.key, JSON.parse(args.value)]);
  }).AppStorage;
  let doc = 'doc-A', route = 'c/conversation-a', messages = structuredClone(options.history ?? []), draft = options.draft ?? '', step;
  let clock = 0;
  const site = {
    async bind() {return doc;},
    async read() {
      if (options.readLost && actions.includes('click-A')) throw new Error('E_PORT_DISCONNECTED');
      return {ok:true, documentId:doc, route, url:'https://chatgpt.com/' + (route ?? ''),
        messages:structuredClone(messages), draft, rich:false, idle:true, sendReady:true, busy:false};
    },
    async fill(value) {step = structuredClone(value); draft = value.prompt; actions.push('fill-' + (doc === 'doc-A' ? 'A' : 'B'));},
    async send(value) {
      const which = doc === 'doc-A' ? 'A' : 'B';
      actions.push('click-' + which);
      assert.equal(draft, value.prompt);
      const saved = JSON.parse(data.get(journalKey('relay-test-0001')));
      assert.equal(saved.steps[which].clickIntent, true, 'intent was read back BEFORE click');
      if (options.lostClick) throw new Error('E_CLICK_ACK_LOST');
      if (options.noUser) {draft = ''; return;}
      route = which === 'A' ? 'c/conversation-a' : 'c/conversation-b';
      const match = value.prompt.match(/计算：(\d+) \+ 25|上一任务结果 (\d+) × 3/);
      const numeric = which === 'A' ? Number(match[1]) + 25 : Number(match[2]) * 3;
      messages.push({key:'user:' + which, role:'user', text:value.prompt});
      const raw = JSON.stringify({runId:options.wrongRun ? 'other-run' : 'relay-test-0001', step:which, value:numeric});
      messages.push({key:'assistant:' + which, role:'assistant', text:raw,
        complete:!options.streaming, streaming:!!options.streaming});
      if (options.extraUser) messages.push({key:'user:intruder', role:'user', text:'another message'});
      draft = '';
    },
    async newConversation() {
      actions.push('navigate');
      const saved = JSON.parse(data.get(journalKey('relay-test-0001')));
      assert.equal(saved.steps.A.state, 'completed');
      assert.equal(saved.handoff.state, 'navigating');
      if (!options.sameDocument) doc = 'doc-B';
      route = null; messages = []; draft = options.bDraft ?? '';
      if (options.loseStoreOnNavigate) data.delete(journalKey('relay-test-0001'));
      return doc;
    }
  };
  const run = (params = {}) => runCalculationRelay({site, store, params:{runId:'relay-test-0001', ...params},
    now:() => clock, sleep:async ms => {clock += ms;}, limits:{ready:8, send:6, reply:8, poll:1,
      ...(options.total ? {total:options.total, settle:1} : {})}});
  return {run, data, actions, writes, site, store, get step() {return step;}};
}

for (const [addend, a, b] of [[17,42,126], [19,44,132]]) {
  test(`real relay module passes saved A=${a} into B=${b} (Node dependencies only)`, async () => {
    const h = harness();
    const result = await h.run({addend});
    assert.equal(result.status, 'completed');
    assert.equal(result.steps.A.result.value, a);
    assert.equal(result.steps.B.result.value, b);
    assert.match(result.steps.B.prompt, new RegExp('上一任务结果 ' + a + ' × 3'));
    assert.notEqual(result.steps.A.result.conversation, result.steps.B.result.conversation);
    assert.notEqual(result.steps.A.documentId, result.steps.B.documentId);
    assert.deepEqual(h.actions, ['fill-A','click-A','navigate','fill-B','click-B']);
    const states = h.writes.filter(([key]) => key !== ACTIVE_KEY).map(([,v]) => v.steps.A.state);
    for (const value of ['queued','sending','sent','waiting_reply','completed']) assert(states.includes(value));
    const again = await h.run({addend});
    assert.equal(again.readOnly, true);
    assert.equal(h.actions.filter(a => a.startsWith('click')).length, 2);
  });
}

test('lost click ACK is durable unknown and repeated Run/status cannot click again', async () => {
  const h = harness({lostClick:true});
  await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
  const state = JSON.parse(h.data.get(journalKey('relay-test-0001')));
  assert.equal(state.status, 'unknown');
  assert.equal(state.steps.A.clickIntent, true);
  assert.equal((await h.run()).readOnly, true);
  assert.equal((await h.run({operation:'status'})).steps.A.state, 'unknown');
  await assert.rejects(h.run({runId:'relay-different-id'}), /E_RELAY_PENDING/);
  assert.deepEqual(h.actions, ['fill-A','click-A']);
});

for (const flag of ['readLost','noUser','wrongRun','streaming','extraUser','badReadback']) {
  test(`${flag} never authorizes navigation or B`, async () => {
    const h = harness({[flag]:true});
    await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
    assert(!h.actions.includes('navigate'));
    assert.equal(h.actions.filter(a => a === 'click-A').length, 1);
    assert(!h.actions.includes('click-B'));
  });
}

for (const [flag, value] of [['sameDocument',true], ['bDraft','keep this draft'], ['loseStoreOnNavigate',true]]) {
  test(`${flag} stops after A, before filling/sending B`, async () => {
    const h = harness({[flag]:value});
    await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
    assert(h.actions.includes('navigate'));
    assert(!h.actions.includes('fill-B'));
    assert(!h.actions.includes('click-B'));
  });
}

test('pre-existing whitespace draft is preserved before claiming or filling', async () => {
  const h = harness({draft:'\n '});
  await assert.rejects(h.run(), /E_RELAY_DRAFT/);
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.actions, []);
});

test('denied trusted storage cannot lead to a website mutation', async () => {
  const h = harness({rejectStorage:true});
  await assert.rejects(h.run(), /E_CAPABILITY/);
  assert.deepEqual(h.actions, []);
});

test('a crash after pointer claim but before journal creation blocks later sends', async () => {
  const h = harness();
  h.data.set(ACTIVE_KEY, JSON.stringify({runId:'relay-crashed-claim', key:journalKey('relay-crashed-claim')}));
  await assert.rejects(h.run(), /E_RELAY_PENDING/);
  assert.deepEqual(h.actions, []);
});

test('a completed historical assistant message never satisfies this new turn', async () => {
  const h = harness({noUser:true, history:[{key:'assistant:history', role:'assistant', complete:true,
    text:JSON.stringify({runId:'relay-test-0001', step:'A', value:42})}]});
  await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
  assert.deepEqual(h.actions, ['fill-A','click-A']);
});

test('one shared total budget stops before B even if each per-step wait would allow it', async () => {
  const h = harness({total:2});
  await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
  assert(!h.actions.includes('click-B'));
});

test('reply must belong to this run/step and pass independent numeric validation', () => {
  for (const raw of ['42', '{"runId":"r","step":"A","value":41}',
    '{"runId":"r","step":"B","value":42}', '{"runId":"r","step":"A","value":"42"}',
    '```json\n{"runId":"r","step":"A","value":42}\n```',
    '{"runId":"r","step":"A","value":42,"extra":true}'])
    assert.throws(() => parseReply(raw, 'r', 'A', 42), /E_RELAY_REPLY/);
});

test('existing project compiler and Worker body load the zero-argument entry with lexical storage', async () => {
  const built = await buildProgramProjectInMemory('examples/programs/chatgpt-calculation-relay');
  const scope = vm.createContext({});
  const AsyncBody = vm.runInContext('Object.getPrototypeOf(async function(){}).constructor', scope);
  const body = new AsyncBody('page','params','axiosx','AppStorage','AppLocal','storage', controllerProgramBody(built.sourceUtf8));
  const h = harness();
  const result = await body({}, {operation:'status'}, undefined, h.store);
  assert.equal(result.status, 'not_found');
  assert.equal(vm.runInContext('typeof globalThis.page', scope), 'undefined');
});
