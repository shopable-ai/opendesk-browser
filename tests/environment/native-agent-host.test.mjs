import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAgentHostAdapter} from '../../src/native-agent/host-adapter.js';
import {createRunHost} from '../../src/run-host.js';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
const target={status:'available',windowId:5,tabId:10,frameId:0,documentId:'doc-A',
  url:'https://example.test/item',origin:'https://example.test'};
function fixture(granted=true){
  const started=[],saved=[],stopped=[],subscriptions=new Set(),replies=[];
  const client={ready:Promise.resolve(),registration:{registrationId:'registration-1'},
    subscribeNativeAgent:cb=>{subscriptions.add(cb);return()=>subscriptions.delete(cb);},
    replyNativeAgent:reply=>replies.push(reply)};
  const currentPageTarget={ready:Promise.resolve(),refresh:async()=>{},
    capture:()=>({...target}),revalidate:async x=>{if(x.documentId!=='doc-A')throw Error('stale');}};
  const host={currentRun:null,controller:{
    commitControllerScript:async data=>{saved.push(data);return {revision:1,contentHash:'h'};},
    snapshotControllerRun:async data=>({run:{runId:data.runId},results:[],runs:[{runId:'unrelated-user-run'}],slotAvailable:true})
  },start:async data=>{started.push(data);return {runId:'run-A',state:'running',sourceKind:data.source.kind,
    revision:{sourceHash:'abc'}};},stop:async data=>{stopped.push(data);return {runId:data.runId,state:'stopped'};}};
  const api={permissions:{contains:async()=>granted,request:()=>{throw Error('Forbidden synthetic permission request');}}};
  return {host,client,adapter:createNativeAgentHostAdapter({host,client,currentPageTarget,api}),started,saved,stopped,
    subscriptions,replies,currentPageTarget,api};
}
test('current target is live Sidebar snapshot, not active tab chosen by CLI',async t=>{
  const f=fixture();t.after(()=>f.adapter.dispose());
  assert.deepEqual((await f.adapter.handle({method:'target.current'})).target,
    {windowId:5,tabId:10,frameId:0,documentId:'doc-A',url:target.url,origin:target.origin});
});
test('external draft uses exact RunHost with frozen borrowed target and controller requestId',async t=>{
  const f=fixture();t.after(()=>f.adapter.dispose());
  const claim=await f.adapter.handle({method:'run.start',requestId:'agent-123',
    params:{source:{kind:'draft',sourceUtf8:'async function main(){return 3}'},params:{x:1},target:{...target}}});
  assert.equal(claim.runId,'run-A');
  assert.equal(claim.completion,'PENDING');
  assert.equal(f.started.length,1);
  assert.equal(f.started[0].requestId,'agent-123');
  assert.deepEqual(f.started[0].target,{mode:'borrowed',tabId:10,frameId:0,documentId:'doc-A',
    expectedUrl:target.url,expectedWindowId:5});
});
test('Host ACK correlation preserves the external Controller admission requestId',async t=>{
  const f=fixture();t.after(()=>f.adapter.dispose());
  await [...f.subscriptions][0]({method:'run.start',requestId:'external-admission',dispatchId:'internal-ack',
    params:{source:{kind:'draft',sourceUtf8:'async function main(){return 3}'},params:{},target:{...target}}});
  assert.equal(f.started[0].requestId,'external-admission');
  assert.equal(f.replies[0].requestId,'internal-ack');
  assert.equal(f.replies[0].result.runId,'run-A');
});
test('permissions and document id fail before admission (no Chrome prompt)',async t=>{
  const f=fixture(false);t.after(()=>f.adapter.dispose());
  await assert.rejects(()=>f.adapter.handle({method:'run.start',requestId:'x',
    params:{source:{kind:'draft',sourceUtf8:'ok'},params:{},target:{...target}}}),{code:'E_PERMISSION_REQUIRED'});
  assert.equal(f.started.length,0);
  const g=fixture();t.after(()=>g.adapter.dispose());
  await assert.rejects(()=>g.adapter.handle({method:'run.start',requestId:'x',
    params:{source:{kind:'draft',sourceUtf8:'ok'},params:{},target:{...target,documentId:'doc-B'}}}),{code:'E_DOCUMENT_STALE'});
  assert.equal(g.started.length,0);
});
test('saved requires pinned exact revision and source hash',async t=>{
  const f=fixture();t.after(()=>f.adapter.dispose());
  await assert.rejects(()=>f.adapter.handle({method:'run.start',requestId:'x',
    params:{source:{kind:'saved',scriptId:'test',revision:1,contentHash:'wrong'},params:{},target:{...target}}}),{code:'E_SCHEMA'});
  await f.adapter.handle({method:'run.start',requestId:'y',params:{source:{kind:'saved',scriptId:'test',revision:2,
    contentHash:'a'.repeat(64)},params:{},target:{...target}}});
  assert.equal(f.started[0].source.kind,'saved');
  assert.equal(f.started[0].source.revision,2);
});

test('run.get removes unrelated Sidebar run history from Controller snapshot projection',async t=>{
  const f=fixture();t.after(()=>f.adapter.dispose());
  const reply=await f.adapter.handle({method:'run.get',params:{runId:'agent-owned-1'}});
  assert.equal(reply.run.runId,'agent-owned-1');
  assert.equal(Object.hasOwn(reply,'runs'),false,'external caller must not enumerate other UI runs');
  assert.equal(reply.slotAvailable,true);
});

test('Local final admission hook runs once after adapter awaits and cannot come from RPC params',async t=>{
  const f=fixture();t.after(()=>f.adapter.dispose());let checks=0;
  const request={method:'run.start',requestId:'local-final-admission',params:{
    source:{kind:'draft',sourceUtf8:'async function main(){return 3}'},params:{},target:{...target},
    beforeStart:()=>{throw Error('RPC must not supply a Local admission hook');}}};
  await assert.rejects(f.adapter.handle(request,{beforeStart:()=>{
    checks++;assert.equal(f.started.length,0);
    throw Object.assign(new Error('selection changed'),{code:'E_DEV_CONFLICT'});
  }}),{code:'E_DEV_CONFLICT'});
  assert.equal(checks,1);assert.equal(f.started.length,0);
  await f.adapter.handle(request);
  assert.equal(f.started.length,1,'ordinary direct draft Run still requires no saved Revision');
  assert.equal(checks,1,'the hook belongs exclusively to the trusted Local call');
});

test('Local Page guard rejection creates no pending preview claim or unknown managed ownership',async t=>{
  const f=fixture();t.after(()=>f.adapter.dispose());let dispatches=0,checks=0;
  f.client.request=async()=>{dispatches++;};
  const sourceUtf8='async function main(){return 1;}';
  await assert.rejects(f.adapter.handle({method:'page.preview',params:{sourceUtf8,
    sourceHash:await sha256Utf8(sourceUtf8),sourceBytes:new TextEncoder().encode(sourceUtf8).length,
    entryFormat:'async-main',managedUI:true,bindingId:'local-'+'a'.repeat(20),target}},
  {beforeStart:()=>{checks++;throw Object.assign(new Error('binding changed'),{code:'E_DEV_CONFLICT'});}}),
  {code:'E_DEV_CONFLICT'});
  assert.equal(checks,1);assert.equal(dispatches,0);
  assert.equal(f.adapter.developmentIdle(),true,'a pre-dispatch rejection owns no managed Page effect');
});

for(const readiness of ['shared-promise','connected-getter']){
 for(const scheduling of ['ordinary-event','microtask']){
  test(`Local fulfilled ready boundary with real RunHost: ${readiness} ${scheduling}`,async t=>{
    const f=fixture(),order=[];
    // Production HostClient.ready is a getter returning async connect(). A
    // connected getter returns a fulfilled Promise, not necessarily the same one.
    if(readiness==='connected-getter')Object.defineProperty(f.client,'ready',{get:()=>Promise.resolve(f.client.registration)});
    const rejected=Object.assign(new Error('diagnostic ends at Authority admission'),{code:'E_DIAGNOSTIC'});
    f.client.controller={startControllerRun:async()=>{order.push('controls.startControllerRun');throw rejected;}};
    const host=createRunHost({client:f.client,api:f.api});
    const adapter=createNativeAgentHostAdapter({client:f.client,host,currentPageTarget:f.currentPageTarget,api:f.api});
    t.after(async()=>{adapter.dispose();f.adapter.dispose();await host.dispose();});
    if(readiness==='shared-promise')assert.equal(host.ready,f.client.ready);
    let scheduled;
    await assert.rejects(adapter.handle({method:'run.start',params:{source:{kind:'draft',sourceUtf8:'async function main(){}'},params:{},target}},
      {beforeStart:()=>{
        order.push('hook');
        scheduled=new Promise(resolve=>{
          const run=()=>{order.push(scheduling);resolve();};
          if(scheduling==='ordinary-event')setImmediate(run);else queueMicrotask(run);
        });
      }}),{code:'E_DIAGNOSTIC'});
    await scheduled;
    assert.deepEqual(order,scheduling==='ordinary-event'
      ?['hook','controls.startControllerRun','ordinary-event']
      :['hook','microtask','controls.startControllerRun']);
  });
 }
}
