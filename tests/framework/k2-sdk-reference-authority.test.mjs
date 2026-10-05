import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sdkMethods} from '../../src/platform/host/sdk-methods.js';
import {createSdkRequestHandler} from '../../src/platform/host/broker.js';
import {canonical, digestUtf8, FoundationError} from '../../src/platform/protocol.js';
import {canonicalValue, encodeValue, decodeValue} from '../../src/platform/page-port/codec.js';
import {ADMITTED_METHODS, validateSdkRequest} from '../../src/framework/sdk/registry.js';

// Focused unit fixtures, not native sender/IDB/B05 evidence. Every query must use
// only readonly commandJournal transactions; all mutation attempts are counted.
async function fixture({data = {value:0}, state = 'effect_unknown'} = {}) {
  let time = 1000, allowed = true, frame = {frameId:0,documentId:'page-document',documentLifecycle:'active',errorOccurred:false,url:'https://fixture.example/page'};
  const calls = {transactions:[],writes:0,sdk:0,frames:0,permissions:0};
  const sender = {id:'extension',url:frame.url,frameId:0,documentId:frame.documentId,
    documentLifecycle:'active',tab:{id:2,incognito:false}};
  const payload = {requestId:'original-request',method:'AXIOS_POST',
    argsWire:encodeValue({url:'https://fixture.example/write',data}),deadlineAt:2000};
  const normalized = validateSdkRequest({requestId:payload.requestId,method:payload.method,
    args:decodeValue(payload.argsWire),deadlineAt:payload.deadlineAt});
  const principal = 'sdk:https://fixture.example', session = 'browser-session', grantIncarnation = 'original-grant';
  const doc = [principal,2,0,'page-document'];
  const grantKey = `sdk-grant:${canonical(doc.slice(1))}`;
  const requestKey = `sdk-request:${canonical([...doc,payload.requestId])}`;
  const opKey = `sdk-operation:${canonical([...doc,grantIncarnation,payload.requestId])}`;
  const grant = {tag:'sdk-grant',active:true,principal,browserSessionIncarnation:session,grantIncarnation,
    capabilities:['network'],tabEpoch:0,frameEpoch:0,permissionEpoch:0,notificationEpoch:0};
  const lock = {tag:'sdk-request',grantIncarnation,opKey};
  const operation = {tag:'sdk-operation',opKey,principal,tabId:2,frameId:0,documentId:'page-document',
    browserSessionIncarnation:session,grantIncarnation,requestId:payload.requestId,runId:'original-run',opId:'original-op',
    requestDigest:await digestUtf8(canonical([normalized.method,canonicalValue(normalized.args),normalized.deadlineAt])),
    state,submissionCount:1,privateBody:'must not appear in the reference'};
  const journal = new Map([[grantKey,grant],[requestKey,lock],[opKey,operation]]);
  const faults = {beforeTransaction:null,frames:null,permission:null};
  const write = () => {calls.writes++; throw new Error('Lookup attempted a persistent write');};
  const storage = {async transaction(names,mode,body) {
    calls.transactions.push({names:[...names],mode});
    assert.deepEqual(names,['commandJournal']);
    assert.equal(mode,'readonly');
    await faults.beforeTransaction?.(calls.transactions.length);
    return body({get:async (name,key) => {
      assert.equal(name,'commandJournal'); return structuredClone(journal.get(key));
    },put:write,delete:write,clear:write});
  }};
  const api = {runtime:{id:'extension'},permissions:{contains:async () => {
    calls.permissions++; if (faults.permission) throw faults.permission; return allowed;
  }},webNavigation:{getAllFrames:async ({tabId}) => {
    calls.frames++; if (faults.frames) throw faults.frames; return tabId === 2 ? [structuredClone(frame)] : [];
  }}};
  const authority = sdkMethods({storage,api,session,clock:{now:() => time},
    assertHost:async () => {throw new Error('Lookup must not perform host admission');},
    currentHost:async () => {throw new Error('Lookup must not modify host state');}});
  const error = new FoundationError('E_EFFECT_UNKNOWN','original effect is unknown');
  const sdk = {request:async (p,s) => {
    calls.sdk++; assert.strictEqual(p,payload); assert.strictEqual(s,sender); throw error;
  }};
  const handler = createSdkRequestHandler({sdk,authority,storage,session});
  const reference = {requestId:payload.requestId,runId:operation.runId,opId:operation.opId,grantIncarnation};
  return {authority,handler,sdk,error,calls,sender,payload,journal,grant,lock,operation,reference,faults,
    grantKey,requestKey,opKey,setTime:value => {time=value;},setAllowed:value => {allowed=value;},
    setFrame:value => {frame={...frame,...value};}};
}
async function expectError(f, reference) {
  const before = structuredClone(f.journal), payload = structuredClone(f.payload), sender = structuredClone(f.sender);
  await assert.rejects(f.handler(f.payload,f.sender),error => {
    assert.strictEqual(error,f.error,'lookup failure must not replace the original error');
    assert.equal(error.code,'E_EFFECT_UNKNOWN');
    if (reference) assert.deepEqual(error.invocation,reference);
    else assert.equal(Object.hasOwn(error,'invocation'),false);
    return true;
  });
  assert.equal(f.calls.sdk,1,'the handler must not retry the SDK operation');
  assert.equal(f.calls.writes,0);
  assert.deepEqual(f.journal,before);
  assert.deepEqual(f.payload,payload);
  assert.deepEqual(f.sender,sender);
}

for (const state of ['dispatched','effect_unknown']) test(`SDK reference: ${state} projects only original public IDs`,async () => {
  const f = await fixture({state});
  await expectError(f,f.reference);
  assert.deepEqual(f.calls.transactions,[
    {names:['commandJournal'],mode:'readonly'},{names:['commandJournal'],mode:'readonly'}]);
  assert.equal(f.calls.frames,1); assert.equal(f.calls.permissions,1);
});

test('SDK reference: authority lookup has no admission or side effects under 100 concurrent reads',async () => {
  const f = await fixture(), before = structuredClone(f.journal);
  f.authority.admitSdk = () => {throw new Error('No second admission');};
  const results = await Promise.all(Array.from({length:100},() => f.authority.lookupSdkInvocation(f.payload,f.sender)));
  results.forEach(result => assert.deepEqual(result,{invocation:f.reference}));
  results[0].invocation.runId = 'caller-mutated-copy';
  assert.equal(results[1].invocation.runId,'original-run');
  assert.deepEqual(f.journal,before); assert.equal(f.calls.writes,0); assert.equal(f.calls.sdk,0);
  assert.equal(f.calls.transactions.length,200);
});

for (const state of ['admitted','durable','failed','cancelled','interrupted'])
  test(`SDK reference: ${state} does not expose an unknown-effect reference`,async () => {
    const f = await fixture({state}); await expectError(f);
  });

const recordChanges = [
  ['operation tag',f => {f.operation.tag='not-sdk';}],
  ['operation key',f => {f.operation.opKey='another-operation';}],
  ['operation session',f => {f.operation.browserSessionIncarnation='another-session';}],
  ['operation grant',f => {f.operation.grantIncarnation='another-grant';}],
  ['operation principal',f => {f.operation.principal='sdk:https://other.example';}],
  ['operation tab',f => {f.operation.tabId=3;}],
  ['operation frame',f => {f.operation.frameId=1;}],
  ['operation document',f => {f.operation.documentId='another-document';}],
  ['operation request ID',f => {f.operation.requestId='another-request';}],
  ['operation digest',f => {f.operation.requestDigest='different';}],
  ['request lock tag',f => {f.lock.tag='not-sdk';}],
  ['request lock grant',f => {f.lock.grantIncarnation='closed-grant';}],
  ['request lock key',f => {f.lock.opKey='missing';}],
  ['missing operation',f => {f.journal.delete(f.opKey);}],
  ['missing request lock',f => {f.journal.delete(f.requestKey);}],
  ['missing grant',f => {f.journal.delete(f.grantKey);}],
  ['closed grant',f => {f.grant.active=false;}],
  ['grant session',f => {f.grant.browserSessionIncarnation='another-session';}],
  ['grant principal',f => {f.grant.principal='sdk:https://other.example';}],
  ['grant tab epoch',f => {f.grant.tabEpoch=1;}],
  ['grant frame epoch',f => {f.grant.frameEpoch=1;}],
  ['grant permission epoch',f => {f.grant.permissionEpoch=1;}]
];
for (const [name,change] of recordChanges) test(`SDK reference: rejects ${name} mismatch without writes`,async () => {
  const f = await fixture(); change(f); await expectError(f);
});

const senderChanges = [
  ['extension ID',f => {f.sender.id='other';}],
  ['incognito',f => {f.sender.tab.incognito=true;}],
  ['inactive lifecycle',f => {f.sender.documentLifecycle='cached';}],
  ['tab',f => {f.sender.tab.id=3;}],
  ['frame',f => {f.sender.frameId=1;}],
  ['document',f => {f.sender.documentId='new-document';}],
  ['origin',f => {f.sender.url='https://other.example/page';}],
  ['native document replaced',f => f.setFrame({documentId:'replaced-document'})],
  ['native permission removed',f => f.setAllowed(false)]
];
for (const [name,change] of senderChanges) test(`SDK reference: rechecks ${name}`,async () => {
  const f = await fixture(); change(f); await expectError(f);
});

for (const [name,change] of [
  ['method',f => {f.payload.method='AXIOS_PUT';}],
  ['arguments',f => {f.payload.argsWire=encodeValue({url:'https://fixture.example/write',data:1});}],
  ['original deadline',f => {f.payload.deadlineAt++;}],
  ['malformed value wire',f => {f.payload.argsWire={type:'unexpected'};}],
  ['invalid request ID',f => {f.payload.requestId='not a valid request id';}]
]) test(`SDK reference: ${name} must not match another request`,async () => {
  const f = await fixture(); change(f); await expectError(f);
});

test('SDK reference: expired original deadline is still a digest field, not renewed execution authority',async () => {
  const f = await fixture(); f.setTime(3000);
  await expectError(f,f.reference);
  const request = validateSdkRequest({requestId:f.payload.requestId,method:f.payload.method,
    args:decodeValue(f.payload.argsWire),deadlineAt:f.payload.deadlineAt});
  await assert.rejects(f.authority.admitSdk(request,f.sender),error => error.code === 'E_DEADLINE');
  assert.equal(f.calls.writes,0);
});

for (const [name,value,replacement] of [
  ['undefined',undefined,null],['null',null,undefined],['false',false,0],['zero',0,false],['negative zero',-0,0],['empty string','',null]
]) test(`SDK reference: codec distinguishes ${name}`,async () => {
  const f = await fixture({data:{value}});
  assert.deepEqual(await f.authority.lookupSdkInvocation(f.payload,f.sender),{invocation:f.reference});
  f.payload.argsWire=encodeValue({url:'https://fixture.example/write',data:{value:replacement}});
  await expectError(f);
});

test('SDK reference: canonical object key order does not create a conflict',async () => {
  const f = await fixture({data:{a:undefined,b:0}});
  f.payload.argsWire=encodeValue({data:{b:0,a:undefined},url:'https://fixture.example/write'});
  await expectError(f,f.reference);
});

for (const phase of ['frames','permission','first transaction','second transaction'])
  test(`SDK reference: ${phase} failure preserves the original error`,async () => {
    const f = await fixture(), error = new Error('read unavailable');
    if (phase === 'frames') f.faults.frames=error;
    else if (phase === 'permission') f.faults.permission=error;
    else f.faults.beforeTransaction=count => {if (count === (phase === 'first transaction' ? 1 : 2)) throw error;};
    await expectError(f);
  });

test('SDK reference: closed grant between Hello and lookup cannot expose original IDs',async () => {
  const f = await fixture();
  f.faults.beforeTransaction=count => {if (count === 2) f.grant.active=false;};
  await assert.rejects(f.handler(f.payload,f.sender),error => {
    assert.strictEqual(error,f.error); assert.equal(Object.hasOwn(error,'invocation'),false); return true;
  });
  assert.equal(f.calls.writes,0); assert.equal(f.calls.sdk,1);
});

test('SDK reference: changing grant incarnation between reads cannot revive the old request',async () => {
  const f = await fixture();
  f.faults.beforeTransaction=count => {if (count === 2) f.grant.grantIncarnation='replacement-grant';};
  await assert.rejects(f.handler(f.payload,f.sender),error => {
    assert.strictEqual(error,f.error); assert.equal(Object.hasOwn(error,'invocation'),false); return true;
  });
  assert.equal(f.calls.writes,0); assert.equal(f.calls.sdk,1);
});

test('SDK handler: a successful response never invokes the lookup',async () => {
  const payload = {}, sender = {}, response = {valueWire:encodeValue(false)};
  const handler=createSdkRequestHandler({sdk:{request:async (p,s) => {
    assert.strictEqual(p,payload); assert.strictEqual(s,sender); return response;
  }},authority:new Proxy({},{get() {throw new Error('No lookup on success');}})});
  assert.strictEqual(await handler(payload,sender),response);
});

test('SDK handler: non-unknown errors bypass lookup and retain object identity',async () => {
  const error = new FoundationError('E_PERMISSION','denied');
  const handler=createSdkRequestHandler({sdk:{request:async () => {throw error;}},
    authority:new Proxy({},{get() {throw new Error('No lookup on this error');}})});
  await assert.rejects(handler({},{}),value => value === error);
});

test('SDK handler: lookup is optional on a failing mixed-version delegate',async () => {
  const error = new FoundationError('E_EFFECT_UNKNOWN','unchanged');
  const handler=createSdkRequestHandler({sdk:{request:async () => {throw error;}},authority:{}});
  await assert.rejects(handler({},{}),value => value === error && !Object.hasOwn(value,'invocation'));
});

test('SDK handler: routing does not consume storage/session dependencies',async () => {
  const error = new FoundationError('E_EFFECT_UNKNOWN','unchanged'), reference={requestId:'r',runId:'run',opId:'op',grantIncarnation:'g'};
  const handler=createSdkRequestHandler({sdk:{request:async () => {throw error;}},
    authority:{lookupSdkInvocation:async () => ({invocation:reference})},
    get storage() {throw new Error('Broker must not consume storage for lookup');},
    get session() {throw new Error('Broker must not consume session for lookup');}});
  await assert.rejects(handler({},{}),value => value === error && value.invocation === reference);
});

test('SDK reference: lookup remains internal and router has no persistence matching logic',async () => {
  assert.equal(Object.hasOwn(ADMITTED_METHODS,'lookupSdkInvocation'),false);
  const source = await readFile(new URL('../../src/platform/host/broker.js',import.meta.url),'utf8');
  const start=source.indexOf('export function createSdkRequestHandler('), end=source.indexOf('\nasync function disconnectPersistedHost',start);
  assert.ok(start>=0 && end>start);
  const handler=source.slice(start,end);
  assert.match(handler,/authority\.lookupSdkInvocation\(payload,sender\)/);
  assert.doesNotMatch(handler,/sdk-grant:|sdk-request:|sdk-operation:|\.transaction\(|digestUtf8|validateSdkRequest/);
  const routes=source.slice(source.indexOf('  const routes = {'),source.indexOf('  async function handle('));
  assert.doesNotMatch(routes,/lookupSdkInvocation/);
});

// Preserve even the old internal own-property shape; the final public projector
// still omits an invalid reference. Do not silently "fix" this during a move.
test('SDK reference: incomplete public reference preserves own-undefined without leaking the row',async () => {
  const f = await fixture(); delete f.operation.runId;
  const before = structuredClone(f.journal);
  await assert.rejects(f.handler(f.payload,f.sender),error => {
    assert.strictEqual(error,f.error);
    assert.equal(Object.hasOwn(error,'invocation'),true);
    assert.equal(error.invocation,undefined);
    assert.equal(Object.hasOwn(error,'privateBody'),false);
    return true;
  });
  assert.deepEqual(f.journal,before); assert.equal(f.calls.writes,0); assert.equal(f.calls.sdk,1);
});
