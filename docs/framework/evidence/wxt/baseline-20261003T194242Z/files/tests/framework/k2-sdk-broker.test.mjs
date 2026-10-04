import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createSdkBroker} from '../../src/platform/host/sdk-broker.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {createSessionTyped} from '../../src/platform/storage/session.js';
import {CONTRACT_VERSION, CONTRACT_HASH} from '../../src/platform/protocol.js';
import {encodeValue, decodeValue} from '../../src/platform/page-port/codec.js';
import {validateSdkRequest} from '../../src/framework/sdk/registry.js';

// Serial transaction and Chrome callback oracle. These regressions prove product
// logic ordering only; native extension-origin B05 and F3 are separate evidence.
function serialStore() {
  let rows = new Map(), tail = Promise.resolve(); const writes = [];
  return {writes,transaction(names,mode,body) {
    const next = tail.then(async () => {
      const copy = structuredClone(rows), changes = [];
      const store = name => { assert.ok(names.includes(name)); if (!copy.has(name)) copy.set(name,new Map()); return copy.get(name); };
      const tx = {get:async (n,k) => structuredClone(store(n).get(k)),
        put:async (n,v,k) => { store(n).set(k,structuredClone(v)); changes.push({store:n,key:k,value:structuredClone(v)}); },
        delete:async (n,k) => { store(n).delete(k); changes.push({store:n,key:k,deleted:true}); },
        all:async n => [...store(n).values()].map(v => structuredClone(v))};
      const result = await body(tx); if (mode === 'readwrite') { rows = copy; writes.push(...changes); } return result;
    }); tail = next.catch(() => {}); return next;
  }};
}
async function fixture({fetchImpl, brokerOptions = {}} = {}) {
  let time = 1791009700000, allowed = true, documentId = 'page-document';
  const clock = {now:() => time}, storage = serialStore(), sessionValues = {}, nativeCalls = [];
  const session = {
    get(key,callback) { nativeCalls.push({method:'get',key}); callback(Object.hasOwn(sessionValues,key) ? {[key]:sessionValues[key]} : {}); },
    set(values,callback) { nativeCalls.push({method:'set',values}); Object.assign(sessionValues,structuredClone(values)); callback(); },
    remove(key,callback) { nativeCalls.push({method:'remove',key}); delete sessionValues[key]; callback(); }
  };
  const api = {runtime:{id:'extension',getURL:p => `chrome-extension://extension/${p}`},storage:{session},
    permissions:{contains:async () => allowed},
    webNavigation:{getAllFrames:async () => [{frameId:0,documentId,url:'https://fixture.example/page'}]},
    notifications:{create:(id,options,callback) => { nativeCalls.push({method:'notify',options}); callback('native-notification'); }}};
  const sender = {id:'extension',url:'https://fixture.example/page',frameId:0,documentId,documentLifecycle:'active',tab:{id:2,incognito:false}};
  const hostSender = {...sender,url:api.runtime.getURL('ui/tool.html'),documentId:'tool-document',tab:{id:1,incognito:false}};
  Object.assign(storage,createStorageMethods(storage,{clock,sessionTyped:createSessionTyped({api})}));
  const makeAuthority = () => createRunAuthority({storage,api,clock,session:'browser-session'});
  const authority = makeAuthority();
  await authority.registerHost({hostInstanceId:'host-instance',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},hostSender);
  const capabilities = ['storage.persistent','storage.session','device.id','network','notifications'];
  const grant = () => authority.grantSdk({tabId:2,frameId:0,documentId,capabilities},hostSender);
  const makeBroker = a => createSdkBroker({authority:a,storage,api,clock,fetchImpl,...brokerOptions});
  const broker = makeBroker(authority);
  const payload = (method,args,requestId = crypto.randomUUID(),deadlineAt = time + 30000) =>
    JSON.parse(JSON.stringify({requestId,method,argsWire:encodeValue(args),deadlineAt}));
  const call = (method,args,id) => broker.request(payload(method,args,id),sender).then(r => decodeValue(r.valueWire));
  const rows = store => storage.transaction([store],'readonly',tx => tx.all(store));
  return {api,storage,authority,broker,makeAuthority,makeBroker,sender,hostSender,grant,payload,call,rows,clock,nativeCalls,sessionValues,
    setTime:value => { time = value; },setAllowed:value => { allowed = value; },navigate:value => { documentId = value; }};
}
const code = expected => error => error.code === expected;

test('SDK explicit regrant restores coherent epochs after SW restart without reviving old IDs',async () => {
  for (const kind of ['navigation','origin','notifications']) {
    const f = await fixture(); await f.grant();
    const oldSender = structuredClone(f.sender), oldPayload = f.payload('APPLOCAL_SETITEM',{key:'epoch',value:0},'epoch-old');
    await f.broker.request(oldPayload,f.sender);
    if (kind === 'navigation') {
      await f.authority.revokeSdkGrants({tabId:2,reason:'navigation'});
      f.navigate('new-page-document'); f.sender.documentId = 'new-page-document';
    } else await f.authority.revokeSdkGrants(kind === 'origin'
      ? {origins:['https://*.example/*'],permissions:[],reason:'permission-removed'}
      : {origins:[],permissions:['notifications'],reason:'permission-removed'});
    await f.grant();
    const recovered = f.makeAuthority(); await recovered.recoverSdk(); await recovered.recoverSdk();
    const broker = f.makeBroker(recovered);
    assert.equal((await broker.hello({sdkVersion:'1.0.0'},f.sender)).ready,true);
    await assert.rejects(broker.request(oldPayload,oldSender),code(kind === 'navigation' ? 'E_DOCUMENT_STALE' : 'E_GRANT_REVOKED'));
    const result = decodeValue((await broker.request(f.payload('APPLOCAL_GETITEM',{key:'epoch'},'epoch-new'),f.sender)).valueWire);
    assert.equal(result.data,0);
  }
});

test('SDK recovery reconciles atomic storage durable result before broker receipt and never replays it',async () => {
  const f = await fixture(); await f.grant();
  const payload = f.payload('APPSTORAGE_SETITEM',{key:'crash-cut',value:false},'storage-cut');
  const admitted = await f.authority.admitSdk(validateSdkRequest({method:payload.method,args:decodeValue(payload.argsWire),
    requestId:payload.requestId,deadlineAt:payload.deadlineAt}),f.sender);
  await f.storage.executeSdk('APPSTORAGE_SETITEM',{key:'crash-cut',value:false},admitted.context);
  assert.equal((await f.rows('runs'))[0].state,'preparing');
  const writes = f.storage.writes.filter(row => row.value?.tag === 'sdk-kv').length;
  const recovered = f.makeAuthority(); await recovered.recoverSdk();
  const run = (await f.rows('runs'))[0];
  assert.equal(run.state,'completed'); assert.equal(run.resultId,admitted.operation.resultId);
  const reply = decodeValue((await f.makeBroker(recovered).request(payload,f.sender)).valueWire);
  assert.equal(reply.data,undefined);
  assert.equal(f.storage.writes.filter(row => row.value?.tag === 'sdk-kv').length,writes);
  assert.equal((await f.rows('commandJournal')).find(row => row.tag === 'sdk-operation').deliveryState,'response_ready');
});

test('SDK restart at dispatched cut pauses its run with original unknown effect and no replacement',async () => {
  const f = await fixture(); await f.grant();
  const payload = f.payload('AXIOS_POST',{url:'https://fixture.example/write',data:{value:0}},'dispatch-cut');
  const admitted = await f.authority.admitSdk(validateSdkRequest({method:payload.method,args:decodeValue(payload.argsWire),
    requestId:payload.requestId,deadlineAt:payload.deadlineAt}),f.sender);
  await admitted.context.authorize({capability:'network',url:'https://fixture.example/write',phase:'pre'});
  const recovered = f.makeAuthority(); await recovered.recoverSdk();
  assert.equal((await f.rows('runs'))[0].state,'paused_unknown');
  await assert.rejects(f.makeBroker(recovered).request(payload,f.sender),code('E_EFFECT_UNKNOWN'));
  assert.equal((await f.rows('runs')).length,1);
  const operation = (await f.rows('commandJournal')).find(row => row.tag === 'sdk-operation');
  assert.equal(operation.opId,admitted.operation.opId); assert.equal(operation.submissionCount,1);
});

test('SDK Hello needs native document/grant and never claims a controller slot',async () => {
  const f = await fixture();
  await assert.rejects(f.broker.hello({sdkVersion:'1.0.0'},f.sender),code('E_GRANT_REVOKED'));
  assert.equal((await f.rows('runs')).length,0);
  await f.grant(); const hello = await f.broker.hello({sdkVersion:'1.0.0'},f.sender);
  assert.equal(hello.ready,true); assert.equal(hello.sdkVersion,'1.0.0'); assert.equal(hello.methods.length,17);
  assert.ok(!hello.methods.includes('NETWORK_INFO_GET'));
  assert.equal((await f.rows('runs')).length,0);
});
test('SDK grant and request payload cannot carry page authority/namespace/bare args',async () => {
  const f = await fixture(); await f.grant();
  for (const field of ['sender','namespace','ownGrant','host','args']) await assert.rejects(
    f.broker.request({...f.payload('APPSTORAGE_GETITEM',{key:'x'}),[field]:{}},f.sender),code('E_SCHEMA'));
  await assert.rejects(f.authority.grantSdk({tabId:2,frameId:0,documentId:f.sender.documentId,
    capabilities:['storage.persistent'],namespace:'foreign'},f.hostSender),code('E_SCHEMA'));
  assert.equal((await f.rows('runs')).length,0);
});
test('SDK sender/document/lifecycle fences reject before any storage effect',async () => {
  const f = await fixture(); await f.grant();
  for (const sender of [{...f.sender,id:'foreign'},{...f.sender,documentLifecycle:'cached'},
    {...f.sender,tab:{id:2,incognito:true}},{...f.sender,documentId:'other'}]) {
    await assert.rejects(f.broker.request(f.payload('APPSTORAGE_SETITEM',{key:'x',value:1}),sender));
  }
  assert.equal((await f.rows('frameworkKV')).length,0);
});
test('100 same-ID concurrent persistent calls commit one effect and one result',async () => {
  const f = await fixture(); await f.grant(); const p = f.payload('APPSTORAGE_SETITEM',{key:'x',value:false},'same-id');
  const results = await Promise.all(Array.from({length:100},() => f.broker.request(p,f.sender)));
  assert.ok(results.every(r => Object.hasOwn(decodeValue(r.valueWire),'data')));
  assert.equal(f.storage.writes.filter(w => w.store === 'frameworkKV').length,1);
  assert.equal((await f.rows('results')).length,1);
  assert.equal((await f.rows('commandJournal')).filter(r => r.tag === 'sdk-operation').length,1);
  assert.equal((await f.rows('runs')).filter(r => r.tag === 'sdk-service').length,1);
  assert.equal((await f.rows('runs')).some(r => r.tag === 'slot'),false);
  assert.equal(f.broker.diagnostics().pending,0);
});
test('same ID with changed args or deadline conflicts and does not overwrite effect',async () => {
  const f = await fixture(); await f.grant(); const p = f.payload('APPSTORAGE_SETITEM',{key:'x',value:0},'conflict');
  await f.broker.request(p,f.sender);
  await assert.rejects(f.broker.request({...p,argsWire:encodeValue({key:'x',value:1})},f.sender),code('E_REQUEST_CONFLICT'));
  await assert.rejects(f.broker.request({...p,deadlineAt:p.deadlineAt + 1},f.sender),code('E_REQUEST_CONFLICT'));
  assert.equal((await f.call('APPSTORAGE_GETITEM',{key:'x'})).data,'0');
});
test('native session adapter preserves own undefined/false/0 across Chrome JSON storage',async () => {
  const f = await fixture(); await f.grant(); const value = {present:undefined,zero:0,no:false,list:[undefined,null]};
  const written = await f.call('APPLOCAL_SETITEM',{key:'typed',value}); assert.ok(Object.hasOwn(written,'data')); assert.equal(written.data,undefined);
  const result = await f.call('APPLOCAL_GETITEM',{key:'typed'}); assert.deepEqual(result.data,value);
  assert.ok(Object.hasOwn(result.data,'present'));
  assert.equal((await f.rows('frameworkKV')).length,0);
  assert.equal(f.nativeCalls.filter(c => c.method === 'set').length,1);
  assert.ok((await f.rows('commandJournal')).filter(r => r.tag === 'sdk-operation').every(r => r.nativeReceiptWire && r.state === 'durable'));
  await f.call('APPLOCAL_REMOVEITEM',{key:'typed'});
  assert.equal((await f.call('APPLOCAL_GETITEM',{key:'typed'})).data,undefined);
});
test('durable session duplicate after authority restart does not resubmit native set',async () => {
  const f = await fixture(); await f.grant(); const p = f.payload('APPLOCAL_SETITEM',{key:'x',value:1},'session-id');
  await f.broker.request(p,f.sender); const authority = f.makeAuthority(); await authority.recoverSdk();
  const broker = f.makeBroker(authority); await broker.request(p,f.sender);
  assert.equal(f.nativeCalls.filter(c => c.method === 'set').length,1); broker.dispose();
});
test('native session failure records unknown dispatch and will not retry same write',async () => {
  const f = await fixture(); await f.grant();
  f.api.storage.session.set = (values,callback) => { f.nativeCalls.push({method:'set'}); f.api.runtime.lastError = {message:'native failure'}; callback(); delete f.api.runtime.lastError; };
  const p = f.payload('APPLOCAL_SETITEM',{key:'x',value:1});
  await assert.rejects(f.broker.request(p,f.sender),code('E_CHROME'));
  await assert.rejects(f.broker.request(p,f.sender),code('E_EFFECT_UNKNOWN'));
  assert.equal(f.nativeCalls.filter(c => c.method === 'set').length,1);
});
test('SW recovery fences dispatched write gap and retains original identity/deadline',async () => {
  const f = await fixture(); await f.grant(); const p = f.payload('AXIOS_POST',{url:'https://fixture.example/write',data:1});
  const admission = await f.authority.admitSdk(validateSdkRequest({requestId:p.requestId,method:p.method,args:decodeValue(p.argsWire),deadlineAt:p.deadlineAt}),f.sender);
  await admission.context.authorize({capability:'network',url:'https://fixture.example/write',method:'POST',phase:'pre'});
  await f.authority.recoverSdk(); await assert.rejects(f.broker.request(p,f.sender),code('E_EFFECT_UNKNOWN'));
  const op = (await f.rows('commandJournal')).find(r => r.tag === 'sdk-operation');
  assert.equal(op.state,'effect_unknown'); assert.equal(op.submissionCount,1); assert.equal(op.deadlineAt,f.clock.now()+15000);
});
test('durable duplicate cannot extend original 15s service deadline',async () => {
  const f = await fixture(); await f.grant(); const p = f.payload('APPSTORAGE_SETITEM',{key:'x',value:1});
  await f.broker.request(p,f.sender); f.setTime(f.clock.now()+15001);
  await assert.rejects(f.broker.request(p,f.sender),code('E_DEADLINE'));
  assert.equal(f.storage.writes.filter(w => w.store === 'frameworkKV').length,1);
});
test('native permission remove then regrant cannot revive old request/grant',async () => {
  const f = await fixture(); await f.grant(); const p = f.payload('APPSTORAGE_SETITEM',{key:'x',value:1});
  await f.broker.request(p,f.sender);
  await f.authority.revokeSdkGrants({origins:['https://*.example/*'],reason:'permission-removed'});
  await assert.rejects(f.broker.request(p,f.sender),code('E_GRANT_REVOKED'));
  await f.grant(); await assert.rejects(f.broker.request(p,f.sender),code('E_GRANT_REVOKED'));
  await f.call('APPSTORAGE_SETITEM',{key:'x',value:2});
});
test('observed navigation invalidates current page Hello and pending admission',async () => {
  const f = await fixture(); await f.grant(); const p = f.payload('APPLOCAL_SETITEM',{key:'x',value:1});
  const admission = await f.authority.admitSdk(validateSdkRequest({requestId:p.requestId,method:p.method,args:decodeValue(p.argsWire),deadlineAt:p.deadlineAt}),f.sender);
  await f.authority.revokeSdkGrants({tabId:2,frameId:0,reason:'navigation'});
  await assert.rejects(admission.context.authorize(),code('E_DOCUMENT_STALE'));
  await assert.rejects(f.broker.hello({sdkVersion:'1.0.0'},f.sender),code('E_GRANT_REVOKED'));
  assert.equal(f.nativeCalls.length,0);
});
test('notification permission removal with empty origins revokes the affected grant',async () => {
  const f = await fixture(); await f.grant();
  await f.authority.revokeSdkGrants({origins:[],permissions:['notifications'],reason:'permission-removed'});
  await assert.rejects(f.broker.hello({sdkVersion:'1.0.0'},f.sender),code('E_GRANT_REVOKED'));
  await f.grant(); assert.equal((await f.broker.hello({sdkVersion:'1.0.0'},f.sender)).ready,true);
});
test('notification native receipt and durable undefined survive delivery revocation',async () => {
  const f = await fixture(); await f.grant();
  f.api.notifications.create = (id,options,callback) => { callback('actual-id'); f.setAllowed(false); };
  await assert.rejects(f.call('CREATE_NOTIFY',{title:'x',content:'y'}),code('E_PERMISSION'));
  const op = (await f.rows('commandJournal')).find(r => r.tag === 'sdk-operation');
  assert.equal(op.state,'durable'); assert.deepEqual(decodeValue(op.nativeReceiptWire),{notificationId:'actual-id'});
  assert.equal(decodeValue((await f.rows('results'))[0].valueWire),undefined);
  assert.equal((await f.rows('runs'))[0].state,'completed');
});
test('successful HTTP business envelope remains data and stores native result before delivery',async () => {
  const business = {PageBrigeCode:-7,ok:false,error:'business',message:'business'};
  const f = await fixture({fetchImpl:async () => new Response(JSON.stringify(business),{status:200})}); await f.grant();
  const result = await f.call('AXIOS_GET',{url:'https://fixture.example/data'});
  assert.equal(result.PageBrigeCode,0); assert.deepEqual(result.data.data,business);
  const op = (await f.rows('commandJournal')).find(r => r.tag === 'sdk-operation');
  assert.equal(op.state,'durable'); assert.equal(op.deliveryState,'response_ready'); assert.ok(op.nativeReceiptWire);
  assert.ok(!Object.hasOwn(op,'deliveredAt'),'response-ready must not pretend to prove page receipt');
});
test('SDK backend timer clamps to earlier caller deadline even for hung native callback',async () => {
  let expire, delay; const f = await fixture({brokerOptions:{setTimer:(fn,ms) => { expire = fn; delay = ms; return 1; },clearTimer:() => {}}});
  await f.grant(); f.api.storage.session.set = () => {};
  const p = f.payload('APPLOCAL_SETITEM',{key:'x',value:1},'hung',f.clock.now()+500);
  const pending = f.broker.request(p,f.sender); const rejected = assert.rejects(pending,code('E_DEADLINE'));
  for (let i=0;i<20 && !expire;i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(delay,500); expire(); await rejected;
  assert.equal(f.broker.diagnostics().pending,0);
  await assert.rejects(f.broker.request(p,f.sender),code('E_EFFECT_UNKNOWN'));
});
