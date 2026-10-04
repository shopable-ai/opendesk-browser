import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {runInNewContext} from 'node:vm';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createSdkBroker} from '../../src/platform/host/sdk-broker.js';
import {recoverHostTab} from '../../src/platform/host/broker.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {createHostClient} from '../../src/platform/host/client.js';
import {createRunHost} from '../../src/run-host.js';
import {createRunContext} from '../../src/framework/context.js';
import {CONTRACT_VERSION, CONTRACT_HASH, canonical, digest} from '../../src/platform/protocol.js';
import {encodeValue, decodeValue} from '../../src/platform/page-port/codec.js';
import {encodeValue as controlEncode} from '../../src/framework/control/value.js';

// Transaction/Chrome callback oracle: public product authority and repository,
// plus a physical Node Worker for host ordering. Native extension proof is separate.
function serialStore() {
  let rows = new Map(), tail = Promise.resolve(); const writes = [];
  return {writes, transaction(names, mode, body) {
    const next = tail.then(async () => {
      const copy = structuredClone(rows), changes = [];
      const store = name => { assert.ok(names.includes(name)); if (!copy.has(name)) copy.set(name, new Map()); return copy.get(name); };
      const tx = {get: async (n,k) => structuredClone(store(n).get(k)), all: async n => [...store(n).values()].map(v => structuredClone(v)),
        put: async (n,v,k) => { store(n).set(k, structuredClone(v)); changes.push({store:n, key:k, value:structuredClone(v)}); },
        delete: async (n,k) => store(n).delete(k)};
      const result = await body(tx); if (mode === 'readwrite') { rows = copy; writes.push(...changes); } return result;
    }); tail = next.catch(() => {}); return next;
  }};
}
const event = () => ({addListener() {}, removeListener() {}});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const code = expected => error => error.code === expected;
async function fixture() {
  const storage = serialStore(), calls = [], frames = new Map([[2, [{frameId:0, documentId:'doc-top', url:'https://a.example/page'},
    {frameId:7, documentId:'doc-child', url:'https://b.example/frame', parentFrameId:0}]]]);
  const tabs = new Map([[2, {id:2, incognito:false, url:'https://a.example/page'}]]), clock = {now:() => Date.now()};
  let authority, serial = 0, allowed = true, beforeReply;
  const api = {runtime:{id:'extension', getURL:p => `chrome-extension://extension/${p}`,
    getContexts:async(query={})=>[...frames].flatMap(([tabId,values])=>values.filter(f=>f.url.startsWith('chrome-extension:')).map(f=>({tabId,frameId:f.frameId,documentId:f.documentId,documentUrl:f.url})))
      .filter(context => !query.documentIds || query.documentIds.includes(context.documentId))},
    permissions:{contains:async () => allowed},
    tabs:{get:async tabId => { const tab = tabs.get(tabId); if (!tab) throw new Error('No tab with id'); return tab; },
      create:async options => { const id = ++serial + 20; calls.push({method:'create', id}); tabs.set(id,{id,incognito:false,...options});
        frames.set(id,[{frameId:0,documentId:'bootstrap-'+id,url:options.url}]); return tabs.get(id); },
      update:async (id, options) => { calls.push({method:'update',id}); tabs.get(id).url=options.url;
        frames.set(id,[{frameId:0,documentId:'owned-'+id,url:options.url}]); return tabs.get(id); },
      remove:async id => { calls.push({method:'remove',id}); tabs.delete(id); frames.delete(id); },
      sendMessage(id, message, options, callback) {
        calls.push({method:message.action, id, options}); let reply;
        if (message.action === 'ping') reply = {type:message.type, ready:true};
        else if (message.action === 'execute') { const e = message.envelope; beforeReply?.(e); reply = {requestId:e.requestId,
          runId:e.identity.runId, ownerEpoch:e.identity.ownerEpoch, value:controlEncode(e.target.frameId === 7 ? 'Child' : 'Top')}; }
        else reply = {type:message.type, cancelled:true};
        queueMicrotask(() => callback(reply));
      }, onRemoved:event()},
    webNavigation:{getAllFrames({tabId}, callback) { const value=(frames.get(tabId) || []).filter(f=>!f.url.startsWith('chrome-extension:')); if (callback) queueMicrotask(() => callback(value)); return Promise.resolve(value); },
      onCommitted:event(),onCompleted:event(),onDOMContentLoaded:event(),onErrorOccurred:event()},
    userScripts:{getScripts:async()=>[], execute:async options=>{
      calls.push({method:'userScripts.execute',options});
      const frame=frames.get(options.target.tabId).find(f=>options.target.documentIds.includes(f.documentId));
      return [{frameId:frame.frameId,documentId:frame.documentId,
        // Native Chrome serializes page-realm results before broker delivery.
        // Keep the generated wire unchanged while crossing that JSON boundary.
        result:JSON.parse(JSON.stringify(await runInNewContext(options.js[0].code,{TextEncoder,performance,crypto})))}];
    }}, scripting:{executeScript:(_p,cb)=>cb([])}};
  Object.assign(storage,createStorageMethods(storage,{clock}));
  authority = createRunAuthority({storage,api,session:'browser-session',clock});
  const sender = {id:'extension',url:api.runtime.getURL('ui/tool.html'),documentId:'host-doc',frameId:0,
    documentLifecycle:'active',tab:{id:1,incognito:false}};
  const register = async (actual=sender, instance='host-one') => authority.registerHost({hostInstanceId:instance,
    claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},actual);
  const registration = await register();
  const rows = name => storage.transaction([name],'readonly',tx=>tx.all(name));
  const commit = (sourceUtf8='return params;',expectedRevision=0) => authority.commitControllerScript({scriptId:'script',sourceUtf8,expectedRevision},sender);
  const start = (revision,target={mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top'},extra={}) => authority.startControllerRun({requestId:crypto.randomUUID(),
    scriptId:'script',revision:revision.revision,contentHash:revision.contentHash,paramsWire:encodeValue({no:false,zero:0}),target,deadlineAt:Date.now()+30000,...extra},sender);
  const finish = (run,status='succeeded',extra={}) => authority.finishControllerRun({runId:run.runId,requestId:crypto.randomUUID(),status,
    valueWire:encodeValue(false),workerRetired:true,...extra},sender);
  return {storage,api,authority,sender,registration,register,rows,commit,start,finish,calls,frames,tabs,clock,
    setAllowed:value=>{allowed=value;},beforeReply:fn=>{beforeReply=fn;}};
}

const nestedValue = depth => { let value=false; for(let i=0;i<depth;i++)value={key:value};return value; };
for(const depth of [4,5,6,7,8,9,10,11,12]) test(`typed depth ${depth}: params, operation args and immutable result survive wider JSON envelopes`,async()=>{
  const f=await fixture(),revision=await f.commit(),value=nestedValue(depth),paramsWire=encodeValue(value);
  assert.deepEqual(decodeValue(paramsWire),value);
  assert.throws(()=>canonical(paramsWire),code('E_SCHEMA'));
  assert.equal(await digest(paramsWire,{maxDepth:48}),await digest(JSON.parse(canonical(paramsWire,{maxDepth:48})),{maxDepth:48}));
  const request={requestId:'deep-start',scriptId:'script',revision:revision.revision,contentHash:revision.contentHash,
    paramsWire,target:{mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top'},deadlineAt:Date.now()+30000};
  const run=await f.authority.startControllerRun(request,f.sender);
  assert.deepEqual(decodeValue(run.paramsWire),value);
  assert.equal((await f.authority.startControllerRun(request,f.sender)).duplicate,true);
  await assert.rejects(f.authority.startControllerRun({...request,paramsWire:encodeValue(nestedValue(depth-1))},f.sender),code('E_REQUEST_CONFLICT'));
  // Descriptor and values array consume two levels of the semantic args budget.
  const argValue=nestedValue(depth-2),envelope={requestId:'deep-evaluate',identity:run.identity,revision:run.revision,target:run.target,
    operation:{kind:'user-script',method:'evaluate',args:controlEncode([{mode:'function',source:'value => value'},[argValue]])}};
  const reply=await f.authority.controllerOperation({envelope},f.sender);
  assert.deepEqual(reply,await f.authority.controllerOperation({envelope},f.sender));
  assert.equal(f.calls.filter(c=>c.method==='userScripts.execute').length,1);
  const journal=(await f.rows('commandJournal')).find(r=>r.tag==='controller-operation');
  assert.deepEqual(decodeValue(journal.valueWire),argValue);
  const settled=await f.finish(run,'succeeded',{valueWire:paramsWire});
  assert.deepEqual(decodeValue(settled.result.outcome.valueWire),value);
  assert.deepEqual((await f.finish(run,'succeeded',{valueWire:paramsWire})).result,settled.result);
  await assert.rejects(f.finish(run,'succeeded',{valueWire:encodeValue(nestedValue(depth-1))}),code('E_REQUEST_CONFLICT'));
  assert.equal((await f.authority.retireControllerTarget({runId:run.runId},f.sender)).state,'released');
});

test('JSON envelope depth 48 never widens the typed depth-12 admission/result/args budgets',async()=>{
  const f=await fixture(),revision=await f.commit(),tooDeep=encodeValue(nestedValue(13),{maxDepth:13});
  await assert.rejects(f.start(revision,undefined,{paramsWire:tooDeep}),code('E_VALUE_SERIALIZATION'));
  assert.equal((await f.rows('runs')).filter(r=>r.tag==='controller-run').length,0);
  const run=await f.start(revision);
  await assert.rejects(f.finish(run,'succeeded',{valueWire:tooDeep}),code('E_VALUE_SERIALIZATION'));
  assert.equal((await f.rows('results')).length,0);
  const args=controlEncode([nestedValue(11)]);
  function addLevel(node){
    if(node?.t==='boolean'||node?.type==='boolean')return controlEncode({extra:false});
    if(Array.isArray(node))return node.map(addLevel);
    if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,addLevel(value)]));
    return node;
  }
  const envelope={requestId:'too-deep',identity:run.identity,revision:run.revision,target:run.target,
    operation:{kind:'packaged',method:'title',args:addLevel(args)}};
  await assert.rejects(f.authority.controllerOperation({envelope},f.sender),e=>['E_RESULT_FORMAT','E_VALUE_SERIALIZATION'].includes(e.code));
  assert.equal(f.calls.filter(c=>c.method==='execute').length,0);
  await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
});

test('controller script deletion is CAS tombstone only; GC waits for terminal, Worker and target retirement',async()=>{
  const f=await fixture(),r1=await f.commit('return "原始\\r\\n";'),run=await f.start(r1),r2=await f.commit('return "r2";',1);
  const remove=request=>f.authority.tombstoneControllerScript(request,f.sender);
  const collect=request=>f.authority.garbageCollectControllerScript(request,f.sender);
  await assert.rejects(remove({scriptId:'script'}),code('E_SCHEMA'));
  await assert.rejects(remove({scriptId:'script',expectedRevision:1}),code('E_REVISION'));
  for(const request of [{scriptId:'script',expectedRevision:2,context:{}},{scriptId:'script',expectedRevision:2,namespace:'forged'},
    {scriptId:'script',expectedRevision:'2'}])await assert.rejects(remove(request),e=>['E_SCHEMA','E_REVISION'].includes(e.code));
  assert.deepEqual(await remove({scriptId:'script',expectedRevision:2}),{tombstoned:true});
  await assert.rejects(f.authority.getControllerScript({scriptId:'script'},f.sender),code('E_TOMBSTONE'));
  assert.deepEqual((await f.rows('scriptRevisions')).sort((a,b)=>a.revision-b.revision),[r1,r2]);
  const pin=(await f.rows('commandJournal')).find(r=>r.tag==='script-revision-pin');
  const changePin=async released=>f.storage.transaction(['commandJournal'],'readwrite',tx=>tx.put('commandJournal',{...pin,released},run.revision.pinKey));
  const blocked=async()=>{
    await assert.rejects(collect({scriptId:'script',expectedRevision:2}),code('E_OWNER'));
    // Even a forged released pin cannot bypass the independent lease gates.
    await changePin(true);await assert.rejects(collect({scriptId:'script',expectedRevision:2}),code('E_OWNER'));await changePin(false);
  };
  await blocked();
  const context=createRunContext({identity:run.identity,revision:run.revision,target:run.target,
    transport:{request:envelope=>f.authority.controllerOperation({envelope},f.sender)}});
  assert.equal(await context.page.title(),'Top');context.dispose();
  await f.finish(run,'succeeded',{workerRetired:false});await blocked();
  await f.finish(run,'succeeded',{workerRetired:true});await blocked();
  await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  await assert.rejects(collect({scriptId:'script'}),code('E_SCHEMA'));
  await assert.rejects(collect({scriptId:'script',expectedRevision:1}),code('E_REVISION'));
  await assert.rejects(collect({scriptId:'script',expectedRevision:2,context:{}}),code('E_SCHEMA'));
  await assert.rejects(f.start(r1),code('E_TOMBSTONE'));
  assert.deepEqual(await collect({scriptId:'script',expectedRevision:2}),{removed:2});
  assert.equal((await f.rows('scriptRevisions')).length,0);
});

test('deleted or hash-invalid scripts abort controller admission without run, slot or pin',async()=>{
  const f=await fixture(),revision=await f.commit();
  const beforeRuns=await f.rows('runs'),beforeJournal=await f.rows('commandJournal');
  await assert.rejects(f.start(revision,undefined,{contentHash:'0'.repeat(64)}),code('E_HASH'));
  assert.deepEqual(await f.rows('runs'),beforeRuns);
  assert.deepEqual(await f.rows('commandJournal'),beforeJournal);
  await f.authority.tombstoneControllerScript({scriptId:'script',expectedRevision:1},f.sender);
  const tombstoneJournal=await f.rows('commandJournal');
  await assert.rejects(f.start(revision),code('E_TOMBSTONE'));
  assert.deepEqual(await f.rows('runs'),beforeRuns);
  assert.deepEqual(await f.rows('commandJournal'),tombstoneJournal);
  assert.equal(f.calls.filter(c=>c.method==='create').length,0);
});

test('each controller lease pin binding is required; forged retired lease cannot authorize GC',async()=>{
  const f=await fixture(),r1=await f.commit(),run=await f.start(r1);
  const bindingFields=['namespace','principal','grantIncarnation','runId','opId','requestId','resultId','browserSessionIncarnation'];
  const pin=(await f.rows('commandJournal')).find(r=>r.tag==='script-revision-pin');
  let lease=(await f.rows('commandJournal')).find(r=>r.tag==='controller-lease');
  for(const key of bindingFields)assert.deepEqual(lease[key],pin[key],key);
  assert.equal(lease.state,'running');
  await f.authority.tombstoneControllerScript({scriptId:'script',expectedRevision:1},f.sender);
  await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  lease=(await f.rows('commandJournal')).find(r=>r.tag==='controller-lease');
  assert.equal(lease.state,'completed');assert.equal(lease.workerRetired,true);assert.equal(lease.retirementState,'released');
  for(const key of bindingFields){
    await f.storage.transaction(['commandJournal'],'readwrite',tx=>tx.put('commandJournal',{...lease,[key]:'forged'},pin.opKey));
    await assert.rejects(f.authority.garbageCollectControllerScript({scriptId:'script',expectedRevision:1},f.sender),code('E_OWNER'));
    assert.equal((await f.rows('scriptRevisions')).length,1);
  }
  await f.storage.transaction(['commandJournal'],'readwrite',tx=>tx.put('commandJournal',lease,pin.opKey));
  assert.deepEqual(await f.authority.garbageCollectControllerScript({scriptId:'script',expectedRevision:1},f.sender),{removed:1});
});

test('recovery upgrades old terminal lease bindings without reviving its result, Worker or slot',async()=>{
  const f=await fixture(),run=await f.start(await f.commit());
  const settled=await f.finish(run);await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  const pin=(await f.rows('commandJournal')).find(r=>r.tag==='script-revision-pin');
  const oldLease=(await f.rows('commandJournal')).find(r=>r.tag==='controller-lease');
  const {principal,grantIncarnation,opId,requestId,resultId,browserSessionIncarnation,...legacyLease}=oldLease;
  await f.storage.transaction(['commandJournal'],'readwrite',tx=>tx.put('commandJournal',legacyLease,pin.opKey));
  await f.authority.recover();
  assert.deepEqual((await f.rows('commandJournal')).find(r=>r.tag==='controller-lease'),oldLease);
  assert.deepEqual(await f.rows('results'),[settled.result]);
  assert.equal((await f.authority.snapshotControllerRun({runId:run.runId},f.sender)).slotAvailable,true);
  await f.authority.tombstoneControllerScript({scriptId:'script',expectedRevision:1},f.sender);
  assert.deepEqual(await f.authority.garbageCollectControllerScript({scriptId:'script',expectedRevision:1},f.sender),{removed:1});
});

test('public authority commits exact UTF8/headCAS and pins r1 while head advances to r2 without templates',async () => {
  const f=await fixture(), r1=await f.commit('return "汉字\r\n";');
  await assert.rejects(f.commit('return 0;',0),code('E_REVISION'));
  const run=await f.start(r1), r2=await f.commit('return 0;',1);
  assert.equal(run.sourceUtf8,r1.sourceUtf8); assert.equal(run.revision.sourceHash,r1.contentHash); assert.equal(r2.revision,2);
  assert.equal(Object.hasOwn(run.identity,'templateHash'),false); assert.equal((await f.rows('templates')).length,0);
  assert.equal((await f.rows('commandJournal')).filter(r=>r.tag==='script-revision-pin' && !r.released).length,1);
  await f.finish(run); await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  assert.ok((await f.rows('commandJournal')).filter(r=>r.tag==='script-revision-pin').every(r=>r.released));
});
test('borrowed child frame is observed exactly; sibling commits do not fence it; top replacement does',async () => {
  const f=await fixture(), run=await f.start(await f.commit(),{mode:'borrowed',tabId:2,frameId:7,documentId:'doc-child'});
  const context=createRunContext({identity:run.identity,revision:run.revision,target:run.target,transport:{request:envelope=>f.authority.controllerOperation({envelope},f.sender)}});
  assert.equal(await context.page.title(),'Child');
  assert.ok(f.calls.filter(c=>c.method==='execute').every(c=>c.options.documentId==='doc-child' && c.options.frameId===7));
  await f.authority.invalidateControllerTarget({tabId:2,frameId:9,documentId:'sibling-new'});
  assert.equal(await context.page.title(),'Child');
  await f.authority.invalidateControllerTarget({tabId:2,frameId:0,documentId:'root-new'});
  await assert.rejects(context.page.title(),e=>['E_CANCELLED','E_DOCUMENT_REPLACED'].includes(e.code)); context.dispose();
});
test('worker retirement gates durable result then borrowed release, without closing borrowed tab',async () => {
  const f=await fixture(),run=await f.start(await f.commit());
  await f.finish(run,'succeeded',{workerRetired:false});
  assert.equal((await f.authority.snapshotControllerRun({runId:run.runId},f.sender)).slotAvailable,false);
  assert.equal((await f.authority.retireControllerTarget({runId:run.runId},f.sender)).state,'pending');
  await f.finish(run); const released=await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  assert.equal(released.releaseCount,1); assert.equal((await f.authority.retireControllerTarget({runId:run.runId},f.sender)).releaseCount,1);
  assert.equal(f.calls.filter(c=>c.method==='remove').length,0);
});
test('owned retirement closes only exact created tab after durable terminal commit',async () => {
  const f=await fixture(),run=await f.start(await f.commit(),{mode:'owned',url:'https://a.example/page'});
  const settled=await f.finish(run); assert.equal(settled.result.state,'completed');
  await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  assert.deepEqual(f.calls.filter(c=>c.method==='remove').map(c=>c.id),[run.target.tabId]); assert.ok(f.tabs.has(2));
  const resultIndex=f.storage.writes.findIndex(w=>w.store==='results'&&w.value.tag==='controller-result');
  const releaseIndex=f.storage.writes.findIndex(w=>w.key==='@slot'&&w.value.currentRunId===null); assert.ok(resultIndex<releaseIndex);
});
test('new registered host reads old namespace result without acquiring its owner or replaying',async () => {
  const f=await fixture(),run=await f.start(await f.commit()); await f.finish(run); await f.authority.retireControllerTarget({runId:run.runId},f.sender);
  const next={...f.sender,documentId:'next-host-doc'}; await f.register(next,'host-two');
  const snapshot=await f.authority.snapshotControllerRun({runId:run.runId},next);
  assert.equal(decodeValue(snapshot.results[0].outcome.valueWire),false); assert.equal(snapshot.run.runId,run.runId);
  await assert.rejects(f.authority.stopControllerRun({runId:run.runId,requestId:'foreign-stop'},next),code('E_OWNER'));
});
test('permission removal matches exact origin patterns and remains fenced after regrant',async () => {
  const f=await fixture(),run=await f.start(await f.commit());
  assert.deepEqual(await f.authority.invalidateControllerTarget({permissionRemoved:true,origins:['https://other.example/*']}),[]);
  assert.equal((await f.authority.snapshotControllerRun({runId:run.runId},f.sender)).run.state,'running');
  await f.authority.invalidateControllerTarget({permissionRemoved:true,origins:['https://a.example/*']}); f.setAllowed(true);
  const ctx=createRunContext({identity:run.identity,revision:run.revision,transport:{request:envelope=>f.authority.controllerOperation({envelope},f.sender)}});
  await assert.rejects(ctx.page.title(),e=>['E_PERMISSION','E_CANCELLED'].includes(e.code));ctx.dispose();
});
test('user-script lookup failure without native effect fails terminal and retires controller',async () => {
  const f=await fixture(),run=await f.start(await f.commit(),{mode:'owned',url:'https://a.example/page'});
  f.api.userScripts.getScripts=async()=>{throw Object.assign(new Error('User scripts toggle disabled'),{code:'E_USER_SCRIPTS_UNAVAILABLE',name:'PageError'});};
  const envelope={requestId:'lookup-fails',identity:run.identity,revision:run.revision,target:run.target,
    operation:{kind:'user-script',method:'$eval',args:controlEncode(['body','el => el.textContent'])}};
  await assert.rejects(f.authority.controllerOperation({envelope},f.sender),code('E_USER_SCRIPTS_UNAVAILABLE'));
  const operation=(await f.rows('commandJournal')).find(r=>r.tag==='controller-operation'&&r.envelope.requestId==='lookup-fails');
  assert.equal(operation.state,'failed');assert.equal(operation.failure.code,'E_USER_SCRIPTS_UNAVAILABLE');
  assert.ok(operation.nativeReceipts.length>0);
  assert.ok(operation.nativeReceipts.every(r=>r.stage==='webNavigation.getAllFrames'));
  assert.equal((await f.rows('results')).filter(row=>row.runId===run.runId).length,0);
  assert.equal((await f.rows('runs')).find(row=>row.runId===run.runId).workerRetired,false);
  assert.equal((await f.rows('runs')).find(row=>row.tag==='slot').currentRunId,run.runId);
  const error={code:'E_USER_SCRIPTS_UNAVAILABLE',message:'User scripts toggle disabled'};
  await f.finish(run,'error',{error,workerRetired:false});
  assert.equal((await f.authority.retireControllerTarget({runId:run.runId},f.sender)).state,'pending');
  assert.equal((await f.rows('commandJournal')).find(row=>row.tag==='script-revision-pin').released,false);
  assert.equal(f.calls.filter(call=>call.method==='remove').length,0);
  // Only the host's worker-retirement acknowledgement can release resources.
  await f.finish(run,'error',{error,workerRetired:true});
  assert.equal((await f.authority.retireControllerTarget({runId:run.runId},f.sender)).state,'released');
  const result=(await f.rows('results')).find(r=>r.runId===run.runId);
  assert.equal(result.state,'failed');assert.equal(result.outcome.error.code,'E_USER_SCRIPTS_UNAVAILABLE');
  const retired=(await f.rows('runs')).find(r=>r.runId===run.runId);
  assert.equal(retired.state,'failed');assert.equal(retired.workerRetired,true);assert.equal(retired.retirementState,'released');
  assert.equal((await f.rows('runs')).find(r=>r.tag==='slot').currentRunId,null);
  const lease=(await f.rows('commandJournal')).find(r=>r.tag==='controller-lease'&&r.runId===run.runId);
  assert.equal(lease.state,'failed');assert.equal(lease.workerRetired,true);assert.equal(lease.retirementState,'released');
  assert.equal((await f.rows('commandJournal')).find(r=>r.tag==='script-revision-pin').released,true);
  assert.deepEqual(f.calls.filter(c=>c.method==='remove').map(c=>c.id),[run.target.tabId]);
});
test('native rejection after submission without receipt stays unknown and cannot replay',async () => {
  const f=await fixture(),run=await f.start(await f.commit());let submissions=0;
  f.api.userScripts.execute=async()=>{submissions++;throw Object.assign(new Error('Native channel disconnected after submission'),{code:'E_TRANSPORT'});};
  const envelope={requestId:'lost-native-reply',identity:run.identity,revision:run.revision,target:run.target,
    operation:{kind:'user-script',method:'$eval',args:controlEncode(['body','el => el.textContent'])}};
  await assert.rejects(f.authority.controllerOperation({envelope},f.sender));
  const operation=(await f.rows('commandJournal')).find(row=>row.tag==='controller-operation' && row.envelope.requestId===envelope.requestId);
  assert.equal(operation.state,'effect_unknown');assert.equal(submissions,1);
  assert((operation.nativeReceipts||[]).every(receipt=>receipt.stage==='webNavigation.getAllFrames'));
  assert.equal((await f.rows('results')).filter(row=>row.runId===run.runId).length,0);
  assert.equal((await f.rows('runs')).find(row=>row.runId===run.runId).state,'paused_unknown');
  await assert.rejects(f.authority.controllerOperation({envelope},f.sender),code('E_EFFECT_UNKNOWN'));assert.equal(submissions,1);
});
test('native receipt survives post-dispatch permission loss; request is never resubmitted',async () => {
  const f=await fixture(),run=await f.start(await f.commit());f.beforeReply(()=>f.setAllowed(false));
  const envelope={requestId:'once',identity:run.identity,revision:run.revision,target:run.target,operation:{kind:'packaged',method:'title',args:controlEncode([])}};
  await assert.rejects(f.authority.controllerOperation({envelope},f.sender),code('E_PERMISSION')); f.setAllowed(true);
  await assert.rejects(f.authority.controllerOperation({envelope},f.sender),code('E_EFFECT_UNKNOWN'));
  const row=(await f.rows('commandJournal')).find(r=>r.tag==='controller-operation');
  assert.ok(row.nativeReceipts.some(r=>r.stage==='tabs.sendMessage'&&r.receipt.requestId==='once'));
  assert.equal(row.state,'effect_unknown');
  assert.equal((await f.rows('results')).filter(r=>r.runId===run.runId).length,0);
  assert.equal((await f.rows('runs')).find(r=>r.runId===run.runId).retirementState,'not-started');
  assert.equal(f.calls.filter(c=>c.method==='execute').length,1);
});
test('public recovery pauses controller, holds slot and never replays committed source',async () => {
  const f=await fixture(),run=await f.start(await f.commit());await f.authority.recover();
  const snapshot=await f.authority.snapshotControllerRun({runId:run.runId},f.sender);
  assert.equal(snapshot.run.state,'paused_unknown');assert.equal(snapshot.slotAvailable,false);
  await assert.rejects(f.start(await f.authority.getControllerScript({scriptId:'script'},f.sender)),code('E_OWNER'));
});
test('host port loss pauses while live context remains, but recovered missing host tab retires once',async () => {
  const f=await fixture(),run=await f.start(await f.commit());
  f.frames.set(1,[{frameId:0,documentId:'host-doc',url:f.sender.url}]);
  await f.authority.loseHost(f.registration.registrationId,{documentGone:false});
  let stored=(await f.rows('runs')).find(r=>r.runId===run.runId);
  assert.equal(stored.state,'paused_unknown');assert.equal(stored.workerRetired,false);
  assert.equal((await f.rows('runs')).find(r=>r.tag==='slot').currentRunId,run.runId);
  let host=(await f.rows('commandJournal')).find(r=>r.tag==='host');
  assert.equal(host.active,true);assert.equal(host.revoked,false);

  const restarted=await fixture(),restartRun=await restarted.start(await restarted.commit());
  await restarted.authority.recover();
  stored=(await restarted.rows('runs')).find(r=>r.runId===restartRun.runId);
  assert.equal(stored.state,'paused_unknown');assert.equal(stored.terminalReason,'worker-restart');
  restarted.frames.delete(1);
  let invalidated=0,reconciled=0;
  const recovery={api:restarted.api,storage:restarted.storage,session:'browser-session',authority:restarted.authority,
    consumer:{invalidateHost:async()=>{invalidated++;},reconcileRetirements:async()=>{reconciled++;}}};
  assert.deepEqual(await recoverHostTab(recovery,1),[{registrationId:restarted.registration.registrationId,state:'retired'}]);
  assert.deepEqual(await recoverHostTab(recovery,1),[]);
  stored=(await restarted.rows('runs')).find(r=>r.runId===restartRun.runId);
  assert.equal(stored.state,'interrupted');assert.equal(stored.workerRetired,true);assert.equal(stored.retirementState,'released');
  assert.equal((await restarted.rows('runs')).find(r=>r.tag==='slot').currentRunId,null);
  host=(await restarted.rows('commandJournal')).find(r=>r.tag==='host');
  assert.equal(host.active,false);assert.equal(host.revoked,true);
  assert.equal(invalidated,1);assert.equal(reconciled,1);
});
test('public hostGone interruption retires borrowed target and exact pin once',async () => {
  const f=await fixture(),run=await f.start(await f.commit()); await f.authority.loseHost(f.registration.registrationId,{documentGone:true});
  const results=await f.rows('results');assert.equal(results.length,1);assert.equal(results[0].state,'interrupted');
  assert.equal((await f.rows('runs')).find(r=>r.tag==='slot').currentRunId,null);assert.equal(f.calls.filter(c=>c.method==='remove').length,0);
});
test('hostGone after completed result preserves the immutable result and finishes pending retirement',async () => {
  const f=await fixture(),run=await f.start(await f.commit());const settled=await f.finish(run,'succeeded',{workerRetired:false});
  await f.authority.loseHost(f.registration.registrationId,{documentGone:true});
  assert.deepEqual(await f.rows('results'),[settled.result]);
  assert.equal((await f.rows('runs')).find(r=>r.runId===run.runId).retirementState,'released');
});
test('SDK short persistent service completes while controller owns the same unique slot',async () => {
  const f=await fixture(),run=await f.start(await f.commit());
  await f.authority.grantSdk({tabId:2,frameId:0,documentId:'doc-top',capabilities:['storage.persistent']},f.sender);
  const sdk=createSdkBroker({authority:f.authority,storage:f.storage,api:f.api,clock:f.clock});
  await sdk.request({requestId:'short-service',method:'APPSTORAGE_SETITEM',argsWire:encodeValue({key:'key',value:false}),deadlineAt:Date.now()+10000},
    {id:'extension',url:'https://a.example/page',documentId:'doc-top',frameId:0,documentLifecycle:'active',tab:{id:2,incognito:false}});
  const slot=(await f.rows('runs')).find(r=>r.tag==='slot');assert.equal(slot.currentRunId,run.runId);
  assert.equal((await f.rows('runs')).filter(r=>r.tag==='sdk-service').length,1);
});

function harnessFactory(events) {
  return ({context}) => {
    let worker, settle, retire, ending=false;
    const result=new Promise(resolve=>{settle=resolve;}),retired=new Promise(resolve=>{retire=resolve;});
    const finish=async terminal=>{
      if(ending)return;ending=true;settle(terminal);await worker?.terminate();events.push('worker-exit');
      context.signal.removeEventListener('abort',abort);retire({acknowledged:true});
    };
    const abort=()=>finish({status:context.signal.reason?.code==='E_TIMEOUT'?'timeout':'stopped'});
    return {result,retired,execute(source,params){
      worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads'); const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
        new AsyncFunction('params',workerData.source)(workerData.params).then(value=>parentPort.postMessage({value}),error=>parentPort.postMessage({error:{message:error.message}}));`,
        {eval:true,workerData:{source,params}});
      worker.on('online',()=>events.push('worker-online'));worker.on('message',message=>finish(message.error?{status:'error',error:message.error}:{status:'succeeded',value:controlEncode(message.value)}));
      worker.on('error',error=>finish({status:'error',error:{message:error.message}}));context.signal.addEventListener('abort',abort,{once:true});
      if(context.signal.aborted)abort();return result;
    },stop:abort,close:abort};
  };
}
test('injected foundationClient registers once; forced harnessWorker termination precedes durable result and slot release',{timeout:10000},async () => {
  const f=await fixture(),events=[];let registrations=0,disconnects=0;
  f.api.runtime.connect=()=>({onMessage:event(),postMessage(){},disconnect(){disconnects++;}});
  f.api.runtime.sendMessage=async message=>{
    if(message.type==='registerHost') {registrations++;return {ok:true,data:f.registration};}
    const data=await f.authority[message.type](message.payload,f.sender);
    if(message.type==='finishControllerRun')events.push('durable-result');
    if(message.type==='retireControllerTarget')events.push('slot-release');return {ok:true,data};
  };
  const client=createHostClient(f.api);await client.ready;
  const host=createRunHost({api:f.api,client,document:undefined,controllerFactory:harnessFactory(events)});
  const revision=await host.controller.commitControllerScript({scriptId:'busy',expectedRevision:0,sourceUtf8:'while(true) {}'});
  const run=await host.start({scriptId:'busy',revision:revision.revision,contentHash:revision.contentHash,params:{no:false},
    target:{mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top'},deadlineAt:Date.now()+5000});
  for(let i=0;i<100&&!events.includes('worker-online');i++)await pause(10);assert.ok(events.includes('worker-online'));
  await host.stop({runId:run.runId});const completed=await host.completion;
  assert.equal(completed.result.state,'stopped');assert.equal(completed.retirement.state,'released');
  assert.ok(events.indexOf('worker-exit')<events.indexOf('durable-result'));assert.ok(events.indexOf('durable-result')<events.indexOf('slot-release'));
  assert.deepEqual(await host.controller.tombstoneControllerScript({scriptId:'busy',expectedRevision:1}),{tombstoned:true});
  assert.deepEqual(await host.controller.garbageCollectControllerScript({scriptId:'busy',expectedRevision:1}),{removed:1});
  assert.equal(registrations,1);host.dispose();assert.equal(disconnects,0);client.dispose();assert.equal(disconnects,1);
  assert.equal((await f.rows('results')).filter(r=>r.tag==='controller-result').length,1);
});
