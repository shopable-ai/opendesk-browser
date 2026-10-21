import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowView} from '../../src/ui/workflow/workflow-view.js';
import {executeBookmarkPlan} from '../../src/ui/conversation/bookmark-actions.js';
import '../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../examples/sidebar-tools/bookmark-manager/src/service.js';

// Production Workflow controller, action executor and Bookmark Service. Only
// permission/transport/SDK boundaries are deterministic fixtures: NOT native AI
// or Chrome bookmark acceptance, and isTrusted here is unit-harness input only.
const error=code=>Object.assign(Error(code),{code});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:
  JSON.stringify({actions:[{type:'folder.create',title:'AI 工具'}]})}}]}),{status:200});
const providerOrigin='https://model.example/*';
function viewFixture(t,{request,contains,transport,native}={}){
  const listeners=new Set(),grants=new Set([providerOrigin,'nativeMessaging']),calls=[];
  const storage={get:async()=>({}),set:async()=>{}};
  const api={storage:{session:storage,local:storage},permissions:{
    request:input=>request?request(input):Promise.resolve(true),
    contains:input=>contains?contains(input):Promise.resolve([...(input.origins||[]),...(input.permissions||[])].every(grant=>grants.has(grant))),
    onRemoved:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  const client={ready:Promise.resolve(),subscribeWorkflowAI:()=>()=>{},
    requestWorkflowAI:async(...args)=>native?native(...args):({nativeConnected:false,protocolAvailable:false})};
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,signal:options.signal});
    return transport?transport(url,options):response();
  });
  const view=createWorkflowView({api,client,host:{subscribe:()=>()=>{},controller:{}},document:null});
  const input=(id,value,eventName='input')=>view.actions.input(id,value,{isTrusted:true},eventName);
  input('workflow-ai-provider','custom_https','change');
  input('workflow-ai-endpoint','https://model.example/v1/chat/completions');
  input('workflow-ai-key','offline-test-key');input('workflow-ai-model','offline-test-model');
  t.after(()=>view.dispose());
  return {view,calls,grants,input,
    send:signal=>view.conversation.request({request:'创建 AI 工具文件夹',event:{isTrusted:true},signal}),
    remove:async origins=>{for(const origin of origins)grants.delete(origin);for(const listener of listeners)await listener({origins});},
    removeNative:async()=>{grants.delete('nativeMessaging');for(const listener of listeners)await listener({permissions:['nativeMessaging']});},
  };
}
async function settles(promise){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('cancelled request remained pending')),150);
  })]);}finally{clearTimeout(timer);}
}
function sdkFixture({beforeStatus,onWrite}={}){
  const roots=[{id:'0',title:'root',children:[{id:'1',title:'书签栏',parentId:'0',children:[]}]}];
  const writes=[];
  const sdk={capabilities:{
    list:async()=>globalThis.BookmarkR2Service.METHODS.map(operation=>({operation:'browser.bookmarks.'+operation,
      requiredCapabilities:['browser.bookmarks.full'],status:{callableNow:true}})),
    getStatus:async input=>{await beforeStatus?.(input.operation);return {callableNow:true};}
  },bookmarks:{getTree:async()=>structuredClone(roots),get:async()=>[],search:async()=>[],
    create:async args=>{
      writes.push(args);await onWrite?.(args);
      const node={id:String(writes.length+10),...args,...(!args.url?{children:[]}:{} )};
      const find=node=>node.id===args.parentId?node:node.children?.map(find).find(Boolean);
      roots.map(find).find(Boolean).children.push(node);return {...node};
    },update:async()=>{},move:async()=>{},remove:async()=>{},prepareRemoveTree:async()=>{},removeTree:async()=>{},
    observe:{start:async()=>{},read:async()=>{},stop:async()=>{}}}};
  return {service:globalThis.BookmarkR2Service.create(sdk),writes};
}
const plan={actions:[{type:'folder.create',title:'AI 工具'}]};
const context={currentFolderId:'1'};

test('R1.6 unrelated HTTPS revocation preserves an already returned proposal',async t=>{
  const f=viewFixture(t),result=await f.send();
  await f.remove(['https://unrelated.example/*']);
  assert.equal(result.authorization.signal.aborted,false);
  await result.authorization.assertWrite();result.authorization.release();
});
for(const origin of [providerOrigin,'https://*.example/*','https://*/*','*://model.example/*','<all_urls>']){
  test('R1.6 relevant removed grant invalidates proposal immediately: '+origin,async t=>{
    const f=viewFixture(t),result=await f.send();
    await f.remove([origin]);
    assert.equal(result.authorization.signal.aborted,true);
    await assert.rejects(result.authorization.assertWrite(),{code:'E_MODEL_GRANT_REVOKED'});
    result.authorization.release();
  });
}
test('R1.6 revoked model grant during Provider generation discards late output',async t=>{
  const pending=deferred(),started=deferred();t.after(()=>pending.resolve(response()));
  const f=viewFixture(t,{transport:()=>{started.resolve();return pending.promise;}});
  const outcome=f.send().then(value=>({value}),failure=>({failure}));
  await started.promise;await f.remove([providerOrigin]);pending.resolve(response());
  assert.equal((await outcome).failure?.code,'E_MODEL_GRANT_REVOKED');
  assert.equal(f.calls.length,1,'no automatic resend');
});
test('R1.6 Stop while awaiting permission releases the round before the prompt resolves',async t=>{
  const permission=deferred(),controller=new AbortController();let requests=0;
  t.after(()=>permission.resolve(true));
  const f=viewFixture(t,{request:()=>++requests===1?permission.promise:Promise.resolve(true)});
  const cancelled=f.send(controller.signal).then(value=>({value}),failure=>({failure}));
  controller.abort();
  const result=await settles(cancelled);assert.equal(result.failure?.code,'E_CANCELLED');
  const next=await f.send();
  permission.resolve(true);await tick();
  await assert.rejects(f.send(),{code:'E_AI_BUSY'},'late old permission must not clear new busy');
  await next.authorization.assertWrite();next.authorization.release();
  assert.equal(f.calls.length,1,'cancelled permission must never reach the Provider');
});
test('R1.6 revocation while awaiting permission invalidates that pending approval',async t=>{
  const permission=deferred();t.after(()=>permission.resolve(true));
  const f=viewFixture(t,{request:()=>permission.promise});
  const outcome=f.send().then(value=>({value}),failure=>({failure}));
  await f.remove([providerOrigin]);
  assert.equal((await settles(outcome)).failure?.code,'E_MODEL_GRANT_REVOKED');
  permission.resolve(true);await tick();assert.equal(f.calls.length,0);
});
test('R1.6 disposing old controller aborts pending permission without changing a new controller',async t=>{
  const permission=deferred();t.after(()=>permission.resolve(true));
  const first=viewFixture(t,{request:()=>permission.promise});
  const outcome=first.send().then(value=>({value}),failure=>({failure}));
  first.view.dispose();
  assert.equal((await settles(outcome)).failure?.code,'E_TOOL_CHANGED');
  const second=viewFixture(t),result=await second.send();
  permission.resolve(true);await tick();
  await result.authorization.assertWrite();result.authorization.release();
  assert.equal(first.calls.length,0);
});
test('R1.6 old release and signal-scoped cancel cannot abort a newer round',async t=>{
  const f=viewFixture(t),old=new AbortController(),current=new AbortController();
  const first=await f.send(old.signal);first.authorization.release();
  const second=await f.send(current.signal);
  first.authorization.release();await f.view.conversation.cancel({signal:old.signal});
  assert.equal(second.authorization.signal.aborted,false);
  await assert.rejects(f.send(),{code:'E_AI_BUSY'});
  await second.authorization.assertWrite();second.authorization.release();
});
test('R1.6 model authorization is rechecked after Service preparation, before SDK dispatch',async()=>{
  let granted=true;
  const f=sdkFixture({beforeStatus:operation=>{if(operation==='browser.bookmarks.create')granted=false;}});
  await assert.rejects(executeBookmarkPlan({plan,service:f.service,context,
    beforeWrite:async()=>{if(!granted)throw error('E_MODEL_GRANT_REVOKED');}}),
    failure=>failure.code==='E_MODEL_GRANT_REVOKED'&&failure.writeIssued===false);
  assert.equal(f.writes.length,0);
});
for(const code of ['E_MODEL_GRANT_REVOKED','E_CANCELLED']){
  test('R1.6 '+code+' during asynchronous Service preparation sends no SDK write',async()=>{
    const controller=new AbortController();
    const f=sdkFixture({beforeStatus:operation=>{if(operation==='browser.bookmarks.create')controller.abort(error(code));}});
    await assert.rejects(executeBookmarkPlan({plan,service:f.service,context,signal:controller.signal}),
      failure=>failure.code===code&&failure.writeIssued===false);
    assert.equal(f.writes.length,0);
  });
}
test('R1.6 local authorization callback never enters the SDK message payload',async()=>{
  let checks=0;const f=sdkFixture();
  const result=await executeBookmarkPlan({plan,service:f.service,context,beforeWrite:async()=>{checks++;}});
  assert.ok(checks>=2,'check before preparation and immediately before SDK dispatch');
  assert.equal(f.writes.length,1);assert.deepEqual(Object.keys(f.writes[0]).sort(),['parentId','title']);
  assert.equal(result.refs.folderId,'11');
});
test('R1.6 Stop after SDK dispatch still reports the confirmed write and blocks the next action',async()=>{
  const issued=deferred(),receipt=deferred(),controller=new AbortController();
  const f=sdkFixture({onWrite:()=>{issued.resolve();return receipt.promise;}});
  const pending=executeBookmarkPlan({plan:{actions:[...plan.actions,{type:'folder.create',title:'不得创建'}]},
    service:f.service,context,signal:controller.signal});
  await issued.promise;controller.abort();receipt.resolve();
  await assert.rejects(pending,failure=>failure.code==='E_CANCELLED'&&failure.writeIssued===false&&
    failure.partial.length===1&&failure.refs.folderId==='11');
  assert.equal(f.writes.length,1);
});
test('R1.6 revoked grant after SDK dispatch with a lost receipt remains UNKNOWN without replay',async()=>{
  const controller=new AbortController();
  const f=sdkFixture({onWrite:()=>{controller.abort(error('E_MODEL_GRANT_REVOKED'));throw error('E_HOST_TIMEOUT');}});
  await assert.rejects(executeBookmarkPlan({plan,service:f.service,context,signal:controller.signal}),
    failure=>failure.code==='E_OUTCOME_UNKNOWN'&&failure.writeIssued===true);
  assert.equal(f.writes.length,1);
});

test('R1.6 Native permission removal aborts a pending Native capability probe',async t=>{
  const probe=deferred(),started=deferred(),methods=[];t.after(()=>probe.resolve({nativeConnected:false}));
  const f=viewFixture(t,{native:method=>{methods.push(method);started.resolve();return probe.promise;}});
  f.input('workflow-ai-provider','local_codex','change');
  const outcome=f.send().then(value=>({value}),failure=>({failure}));
  await started.promise;await f.removeNative();
  assert.equal((await settles(outcome)).failure?.code,'E_MODEL_GRANT_REVOKED');
  probe.resolve({nativeConnected:false});await tick();
  assert.equal(methods.includes('ai.plan.start'),false);assert.equal(f.calls.length,0);
});
test('R1.6 removal of Native permission does not invalidate an HTTPS proposal',async t=>{
  const f=viewFixture(t),result=await f.send();
  await f.removeNative();
  assert.equal(result.authorization.signal.aborted,false);
  await result.authorization.assertWrite();result.authorization.release();
});
test('R1.6 Stop plus revocation during permission approval does not issue a Provider request',async t=>{
  const permission=deferred(),controller=new AbortController();t.after(()=>permission.resolve(true));
  const f=viewFixture(t,{request:()=>permission.promise});
  const outcome=f.send(controller.signal).then(value=>({value}),failure=>({failure}));
  controller.abort();await f.remove([providerOrigin]);
  assert.equal((await settles(outcome)).failure?.code,'E_MODEL_GRANT_REVOKED');
  permission.resolve(true);await tick();assert.equal(f.calls.length,0);
});
test('R1.6 delayed old permission check cannot invalidate or release the next round',async t=>{
  const delayed=deferred(),old=new AbortController();let checks=0;
  const f=viewFixture(t,{contains:()=>++checks===3?delayed.promise:Promise.resolve(true)});
  const first=await f.send(old.signal);
  const oldCheck=first.authorization.assertWrite().then(value=>({value}),failure=>({failure}));
  old.abort();first.authorization.release();
  const next=await f.send();delayed.resolve(false);await oldCheck;
  assert.equal(next.authorization.signal.aborted,false);
  await assert.rejects(f.send(),{code:'E_AI_BUSY'});
  await next.authorization.assertWrite();next.authorization.release();
});
test('R1.6 switched Provider cannot authorize a previously returned proposal',async t=>{
  const f=viewFixture(t),result=await f.send();
  f.input('workflow-ai-provider','local_codex','change');
  await assert.rejects(result.authorization.assertWrite(),{code:'E_TOOL_CHANGED'});
  result.authorization.release();
});
test('R1.6 last dispatched write with Stop still reports its actual successful readback',async()=>{
  const controller=new AbortController(),f=sdkFixture({onWrite:()=>controller.abort()});
  const result=await executeBookmarkPlan({plan,service:f.service,context,signal:controller.signal});
  assert.equal(result.refs.folderId,'11');assert.equal(result.messages.length,1);
  assert.equal(result.tree.byId.get('11').title,'AI 工具');assert.equal(f.writes.length,1);
});
