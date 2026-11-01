import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {BAIDU_PIN,validateBaiduQuery,operationRequestId,projectBaiduResult,
  createNativeInstalledTaskAdapter,InstalledTaskError} from '../src/adapters/native-installed-task.mjs';
import {INSTALLED_TASK_MCP_TOOLS,validateInstalledTaskMcpArgs,
  createInstalledTaskMcp} from '../src/adapters/installed-task-mcp.mjs';

// All fixtures below are OFFLINE substitutes. They do not implement approved
// durable storage, authenticated MCP metadata, Native CAS or real browser tests.
const query='OpenDesk Browser',operationKey='baidu-op-20261102-0001';
const host='authorized-host-one';
const target={windowId:5,tabId:9,frameId:0,documentId:'doc-one',
  url:'https://www.baidu.com/',origin:'https://www.baidu.com'};
const installation={generation:12,installationId:'12345678-1234-1234-1234-123456789abc'};
const revision={scriptId:BAIDU_PIN.scriptId,revision:1,sourceHash:BAIDU_PIN.sourceHash};
function trusted(conversation='original-conversation',override={}){
  return {verifiedByTransport:true,source:'verified-host-context',
    principal:'test-verified-principal',conversation,startAllowed:true,readAllowed:true,
    grant:{id:'approved-once',query,taskId:BAIDU_PIN.taskId,version:BAIDU_PIN.version,
      sourceHash:BAIDU_PIN.sourceHash,manifestHash:BAIDU_PIN.manifestHash,
      registrationId:host,extensionId:'a'.repeat(32),...installation,target,
      expiresAt:Date.now()+100000,maxAdmissions:1},...override};
}
function fakeAtomicStore(){
  // Test fixture, NEVER a production implementation or safe storage alternative.
  let entry=null,consumed=0,failAttach=false;
  return {durableAtomic:true,
    read:async({requestId})=>entry?.requestId===requestId?structuredClone(entry):null,
    reserveAndConsume:async({scope,proposed})=>{
      if(entry)return {kind:'EXISTING',record:structuredClone(entry)};
      consumed++;entry=structuredClone(proposed);
      return {kind:'NEW',record:structuredClone(entry)};
    },
    attachAck:async({scope,...ack})=>{
      if(failAttach)throw Error('test failure /Users/private/workspace');
      if(entry?.requestId!==scope.requestId)throw Error('CAS mismatch');
      if(entry.runId&&entry.runId!==ack.runId)throw Error('run mismatch');
      entry={...entry,...structuredClone(ack)};
    },
    get consumption(){return consumed;},
    get entry(){return entry;},
    failAck(){failAttach=true;}
  };
}
function fakeNative(){
  let starts=0,reconciles=0,readResults=0;
  return {atomicInstalledTaskPin:true,
    inspect:async()=>({registrationId:host,target,installation}),
    start:async()=>{starts++;return {runId:'original-run',state:'running',revision,
      executionTarget:{...target,mode:'borrowed',allowedOrigin:BAIDU_PIN.origin,targetVersion:1}};},
    reconcile:async()=>{reconciles++;return {state:'OUTCOME_UNKNOWN'};},
    result:async()=>{readResults++;return {runId:'original-run',completion:'PENDING',businessSuccess:false};},
    get starts(){return starts;},get reconciles(){return reconciles;},get readResults(){return readResults;}
  };
}
function endpoint(ctx=trusted(),store=fakeAtomicStore(),native=fakeNative()){
  return createInstalledTaskMcp({getTrustedContext:async()=>ctx,admissionStore:store,native});
}
function start(a={}){return {operationKey,query,...a};}
function result(a={}){return {operationKey,...a};}
const ERROR=code=>e=>e instanceof InstalledTaskError&&e.code===code;
test('tool discovery advertises only fixed start/result with bounded, strict schemas',()=>{
  assert.deepEqual(INSTALLED_TASK_MCP_TOOLS.map(x=>x.name),
    ['opendesk.webflow.start','opendesk.webflow.result']);
  for(const item of INSTALLED_TASK_MCP_TOOLS)assert.equal(item.inputSchema.additionalProperties,false);
  assert.equal(INSTALLED_TASK_MCP_TOOLS[0].annotations.readOnlyHint,false);
  assert.equal(INSTALLED_TASK_MCP_TOOLS[1].annotations.readOnlyHint,true);
});
test('strict arguments reject extraneous taskId, shell, caller, approval and malformed keys',()=>{
  for(const invalid of [
    start({taskId:'other'}),start({shell:'sh'}),start({approved:true}),
    start({conversation:'pretend'}),start({operationKey:'short'}),
    start({operationKey:'x'.repeat(81)}),start({query:''}),start({query:'x'.repeat(121)}),
    start({query:'bad\ninstruction'}),{operationKey,query,limit:3},null,[]]){
    assert.throws(()=>validateInstalledTaskMcpArgs('opendesk.webflow.start',invalid),ERROR('E_SCHEMA'));
  }
  assert.deepEqual(validateBaiduQuery(query),{query,limit:3});
  assert.deepEqual(validateInstalledTaskMcpArgs('opendesk.webflow.start',start()),start());
  assert.throws(()=>validateInstalledTaskMcpArgs('opendesk.webflow.result',result({runId:'someone-else'})),ERROR('E_SCHEMA'));
});
test('stable operation request ID is scoped by trusted principal/conversation',async()=>{
  const a=await operationRequestId({principal:'alice',conversation:'one',operationKey});
  assert.match(a,/^wf-mcp-v1:[a-f0-9]{64}$/);
  assert.equal(a,await operationRequestId({principal:'alice',conversation:'one',operationKey}));
  assert.notEqual(a,await operationRequestId({principal:'alice',conversation:'two',operationKey}));
  assert.notEqual(a,await operationRequestId({principal:'bob',conversation:'one',operationKey}));
});
test('default runtime rejects start and result before any Native call',async()=>{
  let called=0;
  const m=createInstalledTaskMcp({native:{start:()=>{called++;}}});
  await assert.rejects(m.dispatch('opendesk.webflow.start',start()),ERROR('E_CALLER_CONTEXT_UNAVAILABLE'));
  await assert.rejects(m.dispatch('opendesk.webflow.result',result()),ERROR('E_CALLER_CONTEXT_UNAVAILABLE'));
  assert.equal(called,0);
});
test('client metadata or model-supplied approval cannot impersonate a verified caller',async()=>{
  const m=endpoint({...trusted(),verifiedByTransport:false});
  await assert.rejects(m.dispatch('opendesk.webflow.start',start()),ERROR('E_CALLER_CONTEXT_UNAVAILABLE'));
  await assert.rejects(m.dispatch('opendesk.webflow.result',result()),ERROR('E_CALLER_CONTEXT_UNAVAILABLE'));
});
test('missing durable atomic store rejects both tools without side effects',async()=>{
  let calls=0;
  const m=createInstalledTaskMcp({getTrustedContext:async()=>trusted(),
    native:{start(){calls++;}}});
  await assert.rejects(m.dispatch('opendesk.webflow.start',start()),ERROR('E_ATOMIC_STORE_UNAVAILABLE'));
  await assert.rejects(m.dispatch('opendesk.webflow.result',result()),ERROR('E_ATOMIC_STORE_UNAVAILABLE'));
  assert.equal(calls,0);
});
test('existing Native does not support atomic old installation pin and blocks dispatch',async()=>{
  const store=fakeAtomicStore(),n=fakeNative();n.atomicInstalledTaskPin=false;
  const m=endpoint(trusted(),store,n);
  await assert.rejects(m.dispatch('opendesk.webflow.start',start()),ERROR('E_NATIVE_ATOMIC_PIN_REQUIRED'));
  assert.equal(n.starts,0);assert.equal(store.consumption,0);
});
test('approved single admission then repeat only returns original operation',async()=>{
  const store=fakeAtomicStore(),n=fakeNative(),m=endpoint(trusted(),store,n);
  const first=await m.dispatch('opendesk.webflow.start',start());
  assert.equal(first.state,'ADMITTED');assert.equal(first.runId,'original-run');
  const again=await m.dispatch('opendesk.webflow.start',start());
  assert.deepEqual(again,first);assert.equal(n.starts,1);assert.equal(store.consumption,1);
  const read=await m.dispatch('opendesk.webflow.result',result());
  assert.equal(read.runId,first.runId);assert.equal(n.readResults,1);
});
test('same operationKey with different query fails, never dispatches twice',async()=>{
  const store=fakeAtomicStore(),n=fakeNative(),m=endpoint(trusted(),store,n);
  await m.dispatch('opendesk.webflow.start',start());
  await assert.rejects(m.dispatch('opendesk.webflow.start',start({query:'another search'})),ERROR('E_REQUEST_CONFLICT'));
  assert.equal(store.consumption,1);assert.equal(n.starts,1);
});
test('cross conversation/principal cannot read the original operation',async()=>{
  const store=fakeAtomicStore(),n=fakeNative();
  await endpoint(trusted(),store,n).dispatch('opendesk.webflow.start',start());
  for(const changed of [trusted('different-conversation'),{...trusted(),principal:'different-principal'}]){
    const m=endpoint(changed,store,n);
    await assert.rejects(m.dispatch('opendesk.webflow.result',result()),ERROR('E_OPERATION_NOT_FOUND'));
  }
  assert.equal(n.readResults,0);assert.equal(n.starts,1);
});
test('grant expired, revoked, changed query or installation blocks new admission',async()=>{
  for(const changed of [
    {grant:{...trusted().grant,expiresAt:Date.now()-1}},
    {grant:{...trusted().grant,query:'different'}},
    {grant:{...trusted().grant,maxAdmissions:2}},
    {startAllowed:false}]){
    const n=fakeNative(),s=fakeAtomicStore(),m=endpoint({...trusted(),...changed},s,n);
    await assert.rejects(m.dispatch('opendesk.webflow.start',start()),ERROR('E_GRANT_REQUIRED'));
    assert.equal(n.starts,0);assert.equal(s.consumption,0);
  }
  const n=fakeNative();n.inspect=async()=>({registrationId:host,target,
    installation:{...installation,generation:13}});
  await assert.rejects(endpoint(trusted(),fakeAtomicStore(),n).dispatch('opendesk.webflow.start',start()),ERROR('E_REVISION'));
  assert.equal(n.starts,0);
});
test('lost ACK remains UNKNOWN; repeated start never dispatches again',async()=>{
  const store=fakeAtomicStore(),n=fakeNative();
  n.start=async()=>{n._sent=(n._sent||0)+1;throw new InstalledTaskError('E_EFFECT_UNKNOWN','unknown','OUTCOME_UNKNOWN');};
  const m=endpoint(trusted(),store,n);
  await assert.rejects(m.dispatch('opendesk.webflow.start',start()),ERROR('E_EFFECT_UNKNOWN'));
  assert.equal((await m.dispatch('opendesk.webflow.start',start())).state,'OUTCOME_UNKNOWN');
  assert.equal((await m.dispatch('opendesk.webflow.result',result())).state,'OUTCOME_UNKNOWN');
  assert.equal(n._sent,1);assert.equal(store.consumption,1);
});
test('lost durable ACK attachment is UNKNOWN and never triggers replay',async()=>{
  const store=fakeAtomicStore(),n=fakeNative(),m=endpoint(trusted(),store,n);
  store.failAck();
  await assert.rejects(m.dispatch('opendesk.webflow.start',start()),ERROR('E_EFFECT_UNKNOWN'));
  assert.equal((await m.dispatch('opendesk.webflow.start',start())).state,'OUTCOME_UNKNOWN');
  assert.equal(n.starts,1);
});
test('Native adapter rejects error envelopes and identity mismatches',async()=>{
  const adapter=createNativeInstalledTaskAdapter({request:async(_m,_p,id)=>({v:1,kind:'response',
    requestId:id,error:{code:'E_REVISION',message:'/Users/private/secret',outcome:'FAILED_CONFIRMED'}})});
  await assert.rejects(adapter.inspect({registrationId:host,extensionId:'a'.repeat(32),query}),
    e=>ERROR('E_REVISION')(e)&&!e.message.includes('/Users/'));
  const corrupt=createNativeInstalledTaskAdapter({request:async(_m,_p,id)=>({v:1,kind:'response',
    requestId:id,result:{},error:{code:'E_PERMISSION'}})});
  await assert.rejects(corrupt.inspect({registrationId:host,extensionId:'a'.repeat(32),query}),ERROR('E_NATIVE_REPLY'));
});
function snapshot(value,runOverride={},resultOverride={}){
  const run={runId:'original-run',state:'completed',retirementState:'released',
    sourceKind:'saved',scriptId:BAIDU_PIN.scriptId,contentHash:BAIDU_PIN.sourceHash,
    revision,resultId:'original-result',target:{...target,allowedOrigin:BAIDU_PIN.origin},...runOverride};
  return {run,results:[{runId:run.runId,resultId:run.resultId,tag:'controller-result',
    state:'completed',sourceKind:'saved',revision,
    outcome:{ok:true,valueWire:encodeValue(value)},...resultOverride}],
    resultDeliveryDenied:[]};
}
const value={kind:'baidu.search.top3.result',version:2,query,sourceUrl:target.url,
  status:'success',count:1,results:[{position:1,title:'Title',summary:'Summary',
    url:'https://example.com/article',evidence:{slot:'1',tpl:'se_com_default'}}],
  trace:[{action:'click',value:'private'}],observedAt:'2026-11-02T00:00:00.000Z'};
const record={query,target,revision};
test('only verified, allowlisted business fields leave durable Controller results',()=>{
  const projection=projectBaiduResult(snapshot(value),record,'original-run');
  assert.equal(projection.completion,'COMPLETED');
  assert.equal(projection.businessSuccess,true);
  assert.deepEqual(projection.data.results,[{position:1,title:'Title',summary:'Summary',
    url:'https://example.com/article'}]);
  assert.equal(JSON.stringify(projection).includes('private'),false);
  assert.equal(JSON.stringify(projection).includes('valueWire'),false);
});
test('completed transport does not imply successful webpage business action',()=>{
  const blocked={...value,status:'blocked',results:[],count:0};
  const projected=projectBaiduResult(snapshot(blocked),record,'original-run');
  assert.equal(projected.completion,'COMPLETED');assert.equal(projected.businessSuccess,false);
});
test('delivery denied, wrong run identity, wrong result revision and forged data reject',()=>{
  assert.throws(()=>projectBaiduResult({...snapshot(value),resultDeliveryDenied:['original-run']},record,'original-run'),ERROR('E_RESULT_IDENTITY'));
  assert.throws(()=>projectBaiduResult(snapshot(value,{contentHash:'f'.repeat(64)}),record,'original-run'),ERROR('E_RESULT_IDENTITY'));
  assert.throws(()=>projectBaiduResult(snapshot(value,{}, {revision:{...revision,revision:2}}),record,'original-run'),ERROR('E_RESULT_IDENTITY'));
  assert.throws(()=>projectBaiduResult(snapshot({...value,query:'another'}),record,'original-run'),ERROR('E_RESULT_FORMAT'));
  assert.throws(()=>projectBaiduResult(snapshot({...value,results:[{...value.results[0],url:'javascript:alert(1)'}]}),record,'original-run'),ERROR('E_RESULT_FORMAT'));
  assert.throws(()=>projectBaiduResult(snapshot({...value,results:[{...value.results[0],title:'x'.repeat(600)}]}),record,'original-run'),ERROR('E_RESULT_FORMAT'));
});
