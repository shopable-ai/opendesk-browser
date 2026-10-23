import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {createLocalCodexPlanner} from '../../src/ui/workflow/local-codex.js';
import {createBusinessConversation} from '../../src/ui/conversation/provider-consumer.js';

const fail=code=>Object.assign(new Error(code),{code});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function setup() {
  let nextThread=0;
  const cancelled=[],released=[];
  const pending=deferred();
  const plannerFactory=()=>{
    const threadId='native-thread-'+(++nextThread),history=[];
    return {
      async planStructured({input}={}){
        if(input==='hold')return pending.promise;
        history.push(input);
        return {threadId,history:[...history]};
      },
      async plan(){return {threadId};},
      async probe(){return {readyForTurn:true,state:'READY_FOR_TURN'};},
      snapshot(){return {sessionId:'native-session-'+threadId,threadId};},
      async cancel(){cancelled.push(threadId);return {state:'CANCELLING'};},
      async close(){return {state:'CLOSED'};},
      async resume(){return {threadId};},
      dispose(){released.push(threadId);}
    };
  };
  const facadeFactory=({localPlanner})=>({
    probeCapabilities:source=>({provider:source}),
    generateWorkflow:async args=>({proposal:await localPlanner.plan(args),metadata:{provider:args.source}}),
    generateStructured:async({request,source})=>({
      proposal:await localPlanner.planStructured({input:request}),metadata:{provider:source}
    })
  });
  const runtime=createSharedAIProviderRuntime({
    client:{requestWorkflowAI:async()=>({})},hostInstanceId:'panel-1',plannerFactory,facadeFactory
  });
  const setProvider=(source='local_codex',model='')=>runtime.configure({
    source,endpoint:'https://model.example/v1/responses',model,apiKey:'session-only-secret'
  });
  setProvider();
  return {runtime,setProvider,cancelled,released,pending,
    get threads(){return nextThread;}};
}

test('R2.1 independent lease and Native-context identity for bookmark, prompt, prompt edit, My and Workflow',async()=>{
  const r=setup(),identities=['bookmark','bookmark','prompt','prompt-edit','tasks','workflow'];
  const leases=identities.map((consumerId,index)=>r.runtime.acquire({
    consumerId,instanceId:'instance-'+index,installEpoch:'release-1'
  }));
  const first=await Promise.all(leases.map((lease,index)=>lease.requestStructured({
    request:'request-'+index,instructions:'restricted'
  })));
  assert.equal(new Set(first.map(value=>value.proposal.threadId)).size,6);
  for(const [i,lease] of leases.entries()){
    assert.equal(lease.identity().consumerId,identities[i]);
    assert.equal(lease.identity().providerGeneration,r.runtime.configuration().generation);
  }
  const second=await leases[0].requestStructured({request:'follow-up',instructions:'restricted'});
  assert.equal(second.proposal.threadId,first[0].proposal.threadId);
  assert.deepEqual(second.proposal.history,['request-0','follow-up']);
  assert.deepEqual(first[1].proposal.history,['request-1']);
  await leases[0].cancelInference();
  assert.deepEqual(r.cancelled,[first[0].proposal.threadId]);
  leases[0].dispose();
  assert.equal(r.released.includes(first[0].proposal.threadId),true);
  const other=await leases[1].requestStructured({request:'still-alive',instructions:'restricted'});
  assert.equal(other.proposal.threadId,first[1].proposal.threadId);
  r.runtime.dispose();
});

test('R2.1 identity validation and duplicate instance protection are fail-closed',()=>{
  const r=setup();
  assert.throws(()=>r.runtime.acquire({consumerId:'unknown',instanceId:'1'}),{code:'E_AI_IDENTITY'});
  assert.throws(()=>r.runtime.acquire({consumerId:'bookmark',instanceId:'1',hostInstanceId:'other'}),{code:'E_AI_IDENTITY'});
  const first=r.runtime.acquire({consumerId:'bookmark',instanceId:'1',installEpoch:'old'});
  assert.throws(()=>r.runtime.acquire({consumerId:'bookmark',instanceId:'1',installEpoch:'old'}),{code:'E_AI_LEASE_DUPLICATE'});
  const changed=r.runtime.acquire({consumerId:'bookmark',instanceId:'1',installEpoch:'new'});
  assert.notEqual(first,changed);
  first.dispose();changed.dispose();r.runtime.dispose();
});

test('R2.1 old generation results cannot arrive into changed model or recycled instance',async()=>{
  const r=setup(),lease=r.runtime.acquire({consumerId:'prompt',instanceId:'one'});
  const old=lease.requestStructured({request:'hold',instructions:'restricted'});
  // Permit dispatch before the Provider configuration changes.
  await Promise.resolve();
  r.setProvider('local_codex','model-new');
  r.pending.resolve({threadId:'obsolete',history:['private-old']});
  await assert.rejects(old,{code:'E_MODEL_STALE'});
  const fresh=await lease.requestStructured({request:'new',instructions:'restricted'});
  assert.notEqual(fresh.proposal.threadId,'obsolete');
  const obsolete=lease.requestStructured({request:'hold',instructions:'restricted'});
  await Promise.resolve();
  lease.dispose();
  await assert.rejects(obsolete,{code:'E_MODEL_STALE'});
  await assert.rejects(lease.requestStructured({request:'later'}),{code:'E_TOOL_CHANGED'});
  r.runtime.dispose();
});

test('R2.1 Native close without a session does not issue owner-wide session.close',async()=>{
  const methods=[];
  const planner=createLocalCodexPlanner({client:{
    requestWorkflowAI:async(method,_params,sessionId)=>{methods.push({method,sessionId});return {};}
  }});
  await planner.close();
  planner.dispose();
  assert.equal(methods.filter(row=>row.method==='ai.session.close').length,0);
});

test('R2.1 an interrupted Native session.open closes only its eventual exact sessionId',async()=>{
  let resolveOpen=null;
  const closed=[];
  const planner=createLocalCodexPlanner({client:{
    requestWorkflowAI(method,_params,sessionId){
      if(method==='ai.session.open')return new Promise(resolve=>{resolveOpen=resolve;});
      if(method==='ai.session.close'){closed.push(sessionId);return Promise.resolve({});}
      return Promise.resolve({nativeConnected:true,readyForTurn:true});
    }
  }});
  const inFlight=planner.planStructured({input:'只做结构化推理'});
  await Promise.resolve();
  assert.equal(typeof resolveOpen,'function');
  planner.dispose();
  resolveOpen({sessionId:'owned-session',threadId:'owned-thread',cursor:0,state:'READY_FOR_TURN'});
  await assert.rejects(inFlight);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(closed,['owned-session']);
  assert.equal(closed.includes(null),false);
});

test('R2.1 official consumer adapters do not share threads, cancellation or business scope',async()=>{
  const r=setup(),listeners=new Set();
  const api={permissions:{
    request:()=>Promise.resolve(true),contains:async()=>true,
    onRemoved:{addListener:listener=>listeners.add(listener),
      removeListener:listener=>listeners.delete(listener)}
  }};
  const make=(consumerId,instanceId)=>createBusinessConversation({
    api,providerRuntime:r.runtime,hostInstanceId:'panel-1',consumerId,instanceId,installEpoch:'epoch-9'
  });
  const bookmark=make('bookmark','book-1'),prompt=make('prompt','prompt-1'),
    tasks=make('tasks','my-1'),anotherBookmark=make('bookmark','book-2');
  const inputs=[
    bookmark.request({request:'search bookmark',event:{isTrusted:true}}),
    prompt.request({request:'search prompt',scope:'prompt',event:{isTrusted:true}}),
    tasks.request({request:'search task',scope:'tasks',event:{isTrusted:true}}),
    anotherBookmark.request({request:'search other bookmark',event:{isTrusted:true}})
  ];
  const replies=await Promise.all(inputs);
  assert.equal(new Set(replies.map(reply=>reply.proposal.threadId)).size,4);
  for(const reply of replies){await reply.authorization.assertWrite();reply.authorization.release();}
  const edited=await prompt.request({request:'revise',scope:'prompt-edit',
    continuation:true,event:{isTrusted:true}});
  assert.equal(new Set([...replies.map(reply=>reply.proposal.threadId),
    edited.proposal.threadId]).size,5,'private prompt body edit uses a separate Native thread');
  await assert.rejects(bookmark.request({request:'wrong scope',scope:'tasks',
    event:{isTrusted:true}}),{code:'E_AI_SCOPE'});
  edited.authorization.release();
  const pending=await bookmark.request({request:'create folder',event:{isTrusted:true}});
  for(const listener of listeners)listener({permissions:['nativeMessaging']});
  assert.equal(pending.authorization.signal.aborted,true);
  await assert.rejects(pending.authorization.assertWrite(),{code:'E_MODEL_GRANT_REVOKED'});
  pending.authorization.release();
  bookmark.dispose();prompt.dispose();tasks.dispose();anotherBookmark.dispose();
  assert.equal(listeners.size,0);
  r.runtime.dispose();
});
