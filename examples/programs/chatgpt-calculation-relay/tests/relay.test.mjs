// Node component tests of the real business module with isolated site/storage
// dependencies. Synthetic replies below are NOT official ChatGPT evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {runCalculationRelay, ACTIVE_KEY, journalKey, parseReply} from '../src/relay.js';
import {validateJournal, validateRelayResult} from '../src/contract.js';
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
  let clock = 0, transientReads = options.transientReads ?? 0;
  const site = {
    async bind() {return doc;},
    async read() {
      if (options.readLost && actions.includes('click-A')) throw new Error('E_PORT_DISCONNECTED');
      if (options.readLostB && actions.includes('click-B')) throw new Error('E_PORT_DISCONNECTED');
      if (actions.includes('click-A') && (options.siteUnavailable || transientReads-- > 0))
        throw new Error('E_RELAY_SITE: 路由或编辑器尚未就绪');
      return {ok:true, documentId:doc, route, url:'https://chatgpt.com/' + (route ?? ''),
        messages:structuredClone(messages), draft, rich:!!options.rich, idle:!options.busy, sendReady:true, busy:!!options.busy};
    },
    async inspect() {return {bodyHasRun:true, matches:[]};},
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
      const match = value.prompt.match(/计算：(-?\d+) \+ (-?\d+)|上一任务结果 (-?\d+) × (-?\d+)/);
      const numeric = which === 'A' ? Number(match[1]) + Number(match[2]) : Number(match[3]) * Number(match[4]);
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

test('temporary post-click site absence is polled without another fill or click', async () => {
  const h = harness({transientReads:2});
  assert.equal((await h.run()).status, 'completed');
  assert.deepEqual(h.actions, ['fill-A','click-A','navigate','fill-B','click-B']);
});

test('persistent post-click site absence stops unknown without replay', async () => {
  const h = harness({siteUnavailable:true});
  await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
  assert.equal((await h.run()).readOnly, true);
  assert.deepEqual(h.actions, ['fill-A','click-A']);
});

test('explicit reconciliation binds original A evidence and only sends the not-started B', async () => {
  const options = {readLost:true}, h = harness(options);
  await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
  options.readLost=false;
  assert.equal((await h.run({operation:'reconcile'})).status, 'completed');
  assert.deepEqual(h.actions, ['fill-A','click-A','navigate','fill-B','click-B']);
  assert.equal((await h.run({operation:'status'})).steps.B.result.value, 126);
});

test('reconciliation without the original user turn cannot send A or B', async () => {
  const h = harness({noUser:true});
  await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
  await assert.rejects(h.run({operation:'reconcile'}), /E_RELAY_UNKNOWN/);
  assert.deepEqual(h.actions, ['fill-A','click-A']);
});

test('explicit B reconciliation reuses saved A and never navigates or clicks again', async () => {
  const options = {readLostB:true}, h = harness(options);
  await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
  options.readLostB=false;
  assert.equal((await h.run({operation:'reconcile'})).status, 'completed');
  assert.deepEqual(h.actions, ['fill-A','click-A','navigate','fill-B','click-B']);
});

test('inspect observes original unknown evidence without any storage or website mutation', async () => {
  const options = {readLost:true}, h = harness(options);
  await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
  options.readLost=false;
  const before = [...h.data], actions = [...h.actions];
  const result = await h.run({operation:'inspect'});
  assert.equal(result.readOnly, true);
  assert.equal(result.observation.messages[0].key, 'user:A');
  assert.deepEqual([...h.data], before);
  assert.deepEqual(h.actions, actions);
});

test('reconciliation cannot bypass a replaced document or changed original prompt', async () => {
  for (const mutation of ['documentId','prompt']) {
    const options = {readLost:true}, h = harness(options);
    await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
    options.readLost=false;
    const key = journalKey('relay-test-0001'), state = JSON.parse(h.data.get(key));
    state.steps.A[mutation]='changed'; h.data.set(key,JSON.stringify(state));
    await assert.rejects(h.run({operation:'reconcile'}), /E_RELAY_(UNKNOWN|RECONCILE|STORAGE)/);
    assert.deepEqual(h.actions, ['fill-A','click-A']);
  }
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

for (const input of [
  {addend:-120, secondAddend:45, multiplier:-7},
  {addend:0, secondAddend:0, multiplier:0},
  {addend:1000000, secondAddend:1000000, multiplier:1000000},
  {addend:-1000000, secondAddend:-1000000, multiplier:1000000}
]) {
  test(`general bounded integers ${JSON.stringify(input)} use stored dynamic A`, async () => {
    const h = harness(), result = await h.run(input);
    assert.equal(result.steps.A.result.value, input.addend + input.secondAddend);
    assert.equal(result.steps.B.result.value, (input.addend + input.secondAddend) * input.multiplier);
    for (const key of Object.keys(input)) assert.equal(result[key], input[key]);
    assert.equal((await h.run(input)).readOnly,true);
  });
}

for (const name of ['addend','secondAddend','multiplier']) {
  for (const value of [null,1.5,'17',1000001,-1000001,NaN,Infinity,Number.MAX_SAFE_INTEGER]) {
    test(`invalid ${name}=${String(value)} fails before storage or website writes`, async () => {
      const h=harness();
      await assert.rejects(h.run({[name]:value}), /E_RELAY_PARAMS/);
      assert.deepEqual(h.actions,[]); assert.equal(h.writes.length,0);
    });
  }
  test(`same runId cannot change ${name}, including explicit reconciliation`, async () => {
    const options={readLost:true}, h=harness(options);
    await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
    options.readLost=false;
    const before=[...h.data], actions=[...h.actions];
    const value={addend:18,secondAddend:26,multiplier:4}[name];
    await assert.rejects(h.run({[name]:value}), /E_RELAY_PARAMS/);
    await assert.rejects(h.run({operation:'reconcile',[name]:value}), /E_RELAY_RECONCILE/);
    assert.deepEqual([...h.data],before); assert.deepEqual(h.actions,actions);
  });
}

for (const step of ['A','B']) {
  test(`legacy addend-only unknown ${step} keeps its fence and reconciles without replay`, async () => {
    const options=step === 'A' ? {readLost:true} : {readLostB:true}, h=harness(options);
    await assert.rejects(h.run(), /E_RELAY_UNKNOWN/);
    const key=journalKey('relay-test-0001'), old=JSON.parse(h.data.get(key));
    delete old.secondAddend; delete old.multiplier;
    h.data.set(key,JSON.stringify(old));
    const before=[...h.data], actions=[...h.actions];
    assert.equal((await h.run()).readOnly,true);
    assert.equal((await h.run({operation:'status'})).status,'unknown');
    await assert.rejects(h.run({runId:'relay-next-run'}),/E_RELAY_PENDING/);
    assert.deepEqual([...h.data],before); assert.deepEqual(h.actions,actions);
    options.readLost=false; options.readLostB=false;
    const result=await h.run({operation:'reconcile'});
    assert.equal(result.format,'opendesk.chatgpt-calculation-relay.v1');
    assert.equal(result.steps.B.result.value,126);
    assert.deepEqual(h.actions,['fill-A','click-A','navigate','fill-B','click-B']);
  });
}

test('legacy completed addend-only record remains byte-for-byte unchanged on Run/status', async () => {
  const h=harness(); await h.run({addend:19});
  const key=journalKey('relay-test-0001'), old=JSON.parse(h.data.get(key));
  delete old.secondAddend; delete old.multiplier; h.data.set(key,JSON.stringify(old));
  const before=[...h.data], actions=[...h.actions];
  assert.equal((await h.run({addend:19})).steps.B.result.value,132);
  assert.equal((await h.run({operation:'status'})).status,'completed');
  assert.deepEqual([...h.data],before); assert.deepEqual(h.actions,actions);
});

for (const flag of ['rich','busy']) test(`existing ${flag} blocks claiming storage or website mutation`, async () => {
  const h=harness({[flag]:true});
  await assert.rejects(h.run(),/E_RELAY_DRAFT/);
  assert.deepEqual(h.actions,[]); assert.equal(h.writes.length,0);
});


test('all real v1 write-ahead snapshots remain valid without normalization, including legacy records', async () => {
  for (const options of [{},{lostClick:true},{readLost:true},{sameDocument:true},{bDraft:'keep'},
    {wrongRun:true},{streaming:true},{readLostB:true},{total:2}]) {
    const h=harness(options);
    try {await h.run();} catch (error) {assert.match(error.message,/E_RELAY_UNKNOWN/);}
    for (const [key,record] of h.writes.filter(([key]) => key !== ACTIVE_KEY)) {
      const before=JSON.stringify(record);
      assert.equal(validateJournal(record,record.runId),record,key);
      assert.equal(JSON.stringify(record),before);
      const legacy=structuredClone(record); delete legacy.secondAddend; delete legacy.multiplier;
      assert.equal(validateJournal(legacy,legacy.runId),legacy);
    }
  }
});

const corruptions = {
  status:r => {r.status='success';},
  stepState:r => {r.steps.A.state='done';},
  falseCompletion:r => {r.steps.B.state='waiting_reply'; delete r.steps.B.result;},
  input:r => {r.secondAddend=26;},
  raw:r => {r.steps.A.result.raw='{"runId":"relay-test-0001","step":"A","value":41}';},
  rawRun:r => {r.steps.A.result.raw=r.steps.A.result.raw.replace('relay-test-0001','different-run');},
  value:r => {r.steps.B.result.value=127;},
  missingRaw:r => {delete r.steps.B.result.raw;},
  resultStep:r => {r.steps.A.result.step='B';},
  resultRun:r => {r.steps.B.result.runId='different-run';},
  document:r => {r.steps.A.result.documentId='other-document';},
  userDocument:r => {r.steps.A.user.documentId='other-document';},
  userMessage:r => {r.steps.A.result.userMessageId='user:other';},
  assistantMessage:r => {r.steps.A.result.assistantMessageId='user:other';},
  missingAssistant:r => {delete r.steps.A.result.assistantMessageId;},
  completion:r => {r.steps.A.result.completionSignal='invented';},
  url:r => {r.steps.A.result.url='https://example.com/c/conversation-a';},
  route:r => {r.steps.A.result.conversation='c/another-conversation';},
  handoff:r => {r.handoff.toDocumentId='other-document';},
  missingHandoff:r => {delete r.handoff;},
  sameConversation:r => {
    r.steps.B.user.route=r.steps.A.user.route; r.steps.B.user.url=r.steps.A.user.url;
    r.steps.B.result.conversation=r.steps.A.result.conversation; r.steps.B.result.url=r.steps.A.result.url;
  }
};
for (const [name,mutate] of Object.entries(corruptions)) {
  test(`tampered journal ${name} is rejected by status, Run and active-record release without mutations`, async () => {
    const h=harness(); await h.run();
    const key=journalKey('relay-test-0001'), record=JSON.parse(h.data.get(key));
    mutate(record); h.data.set(key,JSON.stringify(record));
    const before=[...h.data], actions=[...h.actions];
    await assert.rejects(h.run({operation:'status'}),/E_RELAY_STORAGE/);
    await assert.rejects(h.run(),/E_RELAY_STORAGE/);
    await assert.rejects(h.run({runId:'relay-next-run'}),/E_RELAY_(STORAGE|PENDING)/);
    assert.deepEqual([...h.data],before); assert.deepEqual(h.actions,actions);
  });
}

test('final business return requires a completed journal and the exact journal key', async () => {
  const h=harness(), result=await h.run();
  assert.equal(validateRelayResult(result,result.runId),result);
  for (const change of [r => {r.status='running';},r => {r.journalKey='other';},r => {delete r.steps.A.result;}]) {
    const invalid=structuredClone(result); change(invalid);
    assert.throws(() => validateRelayResult(invalid,result.runId),/E_RELAY_STORAGE/);
  }
});

test('non-object stored values cannot erase an existing journal or active fence', async () => {
  for (const raw of ['false','0','null','[]','"text"']) {
    for (const key of [ACTIVE_KEY,journalKey('relay-test-0001')]) {
      const h=harness(); h.data.set(key,raw);
      await assert.rejects(h.run(),/E_RELAY_STORAGE/);
      assert.deepEqual(h.actions,[]); assert.deepEqual(h.writes,[]);
      assert.equal(h.data.get(key),raw);
    }
  }
});


test('unknown snapshots may retain a validated completed reply after a persistence failure', async () => {
  const h=harness(); await h.run();
  for (const id of ['A','B']) {
    const snapshot=structuredClone(h.writes.find(([key,r]) => key !== ACTIVE_KEY &&
      r.steps[id].state === 'completed' && (id !== 'A' || !r.handoff))[1]);
    snapshot.status='unknown'; snapshot.steps[id].state='unknown';
    snapshot.error={step:id,code:'E_RELAY_READBACK',message:'lost final persistence acknowledgement'};
    const before=JSON.stringify(snapshot);
    assert.equal(validateJournal(snapshot,snapshot.runId),snapshot);
    assert.equal(JSON.stringify(snapshot),before);
  }
});


test('status and repeated Run describe the last persistent record, never current Worker liveness', async () => {
  const source=harness(); await source.run();
  const interrupted=harness({lostClick:true});
  await assert.rejects(interrupted.run(),/E_RELAY_UNKNOWN/);
  const snapshots=[...source.writes, ...interrupted.writes].filter(([key]) => key !== ACTIVE_KEY);
  assert(snapshots.some(([,r]) => r.status === 'running' && r.steps.A.state === 'sending'));
  for (const [key,record] of snapshots) {
    const h=harness();
    h.data.set(ACTIVE_KEY,JSON.stringify({runId:record.runId,key}));
    h.data.set(key,JSON.stringify(record));
    const before=[...h.data];
    for (const operation of ['status','run']) {
      const result=await h.run({operation});
      assert.equal(result.status,record.status);
      assert.deepEqual(result.steps,record.steps);
      assert.equal(result.readOnly,true);
      assert.equal(result.statusSource,'persistent-journal');
      assert.equal(result.needsReconciliation,record.status !== 'completed');
    }
    assert.deepEqual([...h.data],before);
    assert.deepEqual(h.actions,[]); assert.deepEqual(h.writes,[]);
  }
});
