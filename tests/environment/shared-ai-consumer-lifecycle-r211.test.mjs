import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {createBusinessConversation} from '../../src/ui/conversation/provider-consumer.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const trusted={isTrusted:true};
function harness(t,{source='local_codex',permission,transport,cancel}={}) {
  const listeners=new Set(),calls=[],disposed=[],cancelled=[];let next=0;
  const runtime=createSharedAIProviderRuntime({hostInstanceId:'panel',
    client:{requestWorkflowAI:async()=>({})},
    plannerFactory:()=>{
      const threadId='thread-'+(++next),history=[];
      return {probe:async()=>({state:'READY_FOR_TURN',readyForTurn:true}),
        async planStructured({input}){history.push(input);return {threadId,history:[...history]};},
        plan:async()=>({threadId}),snapshot:()=>({threadId}),
        cancel(){cancelled.push(threadId);return cancel?cancel():Promise.resolve({state:'CANCELLED'});},
        dispose(){disposed.push(threadId);}};
    },
    facadeFactory:({localPlanner})=>({
      async generateStructured(args){calls.push(args);return transport?transport(args):{
        proposal:await localPlanner.planStructured({input:args.request})};},
      async generateWorkflow(args){calls.push(args);return transport(args);}
    })
  });
  runtime.updateSettings({source,endpoint:'https://model.example/v1/responses',model:'one',apiKey:'secret'});
  const api={permissions:{request:permission||(()=>Promise.resolve(true)),contains:async()=>true,
    onRemoved:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  const conversations=[];
  const make=(consumerId='bookmark',instanceId=consumerId)=>{
    const value=createBusinessConversation({api,providerRuntime:runtime,hostInstanceId:'panel',consumerId,instanceId});
    conversations.push(value);return value;
  };
  t.after(()=>{for(const conversation of conversations)conversation.dispose();runtime.dispose();});
  return {runtime,make,calls,disposed,cancelled,listeners,
    revoke:grant=>{for(const listener of listeners)listener(grant);}};
}

for(const method of ['requestStructured','generateWorkflow'])test('R2.1.1 lease cancel aborts HTTPS '+method+' only within its owner',async t=>{
  const hold=deferred(),h=harness(t,{source:'custom_https',transport:()=>hold.promise});
  const a=h.runtime.acquire({consumerId:'workflow',instanceId:'a'}),
    b=h.runtime.acquire({consumerId:'workflow',instanceId:'b'});
  const input={request:'held',source:'custom_https',settings:h.runtime.configuration().settings};
  const first=a[method](input),second=b[method](input);
  const rejected=assert.rejects(first,{code:'E_CANCELLED'});
  await a.cancelInference();
  const aborted=h.calls[0].signal.aborted,otherAborted=h.calls[1].signal.aborted;
  hold.resolve({proposal:{late:true}});await rejected;await second;
  assert.equal(aborted,true);assert.equal(otherAborted,false);
  assert.deepEqual(h.cancelled,[],'HTTPS cancel must not create a Native planner');
});

test('R2.1.1 Native cancel preserves UNKNOWN rejection and lease independence',async t=>{
  const unknown=Object.assign(Error('unknown'),{code:'E_AI_OUTCOME_UNKNOWN',outcome:'OUTCOME_UNKNOWN'});
  const h=harness(t,{cancel:()=>Promise.reject(unknown)});
  const a=h.runtime.acquire({consumerId:'prompt',instanceId:'a'}),
    b=h.runtime.acquire({consumerId:'prompt-edit',instanceId:'a:edit'});
  await a.requestStructured({request:'first'});const other=await b.requestStructured({request:'edit'});
  await assert.rejects(a.cancelInference(),error=>error===unknown);
  assert.deepEqual(h.disposed,[],'Stop cannot discard the Native cleanup outcome');
  assert.equal((await b.requestStructured({request:'continue'})).proposal.threadId,other.proposal.threadId);
});

for(const phase of ['permission','transport','authorization'])test('R2.1.1 config change immediately releases '+phase+' and rejects old authorization',async t=>{
  const hold=deferred();let sends=0;
  const h=harness(t,{source:'custom_https',
    permission:()=>phase==='permission'&&++sends===1?hold.promise:Promise.resolve(true),
    transport:()=>phase==='transport'&&++sends===1?hold.promise:Promise.resolve({proposal:{fresh:true}})});
  const conversation=h.make();
  let status='pending';
  const first=conversation.request({request:'old',event:trusted}).then(value=>{
    status='fulfilled';return {value};
  },error=>{status='rejected';return {error};});
  await tick();
  const old=phase==='authorization'?(await first).value:null;
  h.runtime.updateSettings({model:'two'});await tick();
  const immediate=status;
  const fresh=await conversation.request({request:'new',event:trusted}).then(value=>({value}),error=>({error}));
  hold.resolve({proposal:{obsolete:true}});const result=await first;
  assert.equal(immediate,phase==='authorization'?'fulfilled':'rejected','must not wait for permission/transport settlement');
  assert.equal(fresh.error,undefined,'new explicit Send must not remain busy');
  if(old){assert.equal(old.authorization.signal.aborted,true);await assert.rejects(old.authorization.assertWrite(),{code:'E_TOOL_CHANGED'});}
  else assert.equal(result.error?.code,'E_TOOL_CHANGED','old inference must not deliver');
  fresh.value.authorization.release();
});

test('R2.1.1 Native permission revocation retires idle main/edit history while unrelated revocation does not',async t=>{
  const h=harness(t),prompt=h.make('prompt'),bookmark=h.make();
  const send=async(conversation,scope,request)=>{
    const value=await conversation.request({request,scope,event:trusted});value.authorization.release();return value.proposal;
  };
  const main=await send(prompt,'prompt','private-main'),edit=await send(prompt,'prompt-edit','private-edit'),
    other=await send(bookmark,'bookmark','other');
  h.revoke({origins:['https://unrelated.example/*']});
  assert.deepEqual(h.disposed,[]);
  assert.equal((await send(prompt,'prompt','follow-up')).threadId,main.threadId);
  h.revoke({permissions:['nativeMessaging']});
  assert.deepEqual(new Set(h.disposed),new Set([main.threadId,edit.threadId,other.threadId]));
  const freshMain=await send(prompt,'prompt','new-main'),freshEdit=await send(prompt,'prompt-edit','new-edit');
  assert.notEqual(freshMain.threadId,main.threadId);assert.notEqual(freshEdit.threadId,edit.threadId);
  assert.deepEqual(freshMain.history,['new-main']);assert.deepEqual(freshEdit.history,['new-edit']);
});

test('R2.1.1 matching HTTPS revoke aborts pending authorization; unrelated origins preserve it',async t=>{
  const hold=deferred(),h=harness(t,{source:'cloud_responses',transport:()=>hold.promise}),conversation=h.make();
  const first=conversation.request({request:'held',event:trusted}),rejected=assert.rejects(first,{code:'E_MODEL_GRANT_REVOKED'});
  await tick();h.revoke({origins:['https://unrelated.example/*']});
  assert.equal(h.calls[0].signal.aborted,false);
  h.revoke({origins:['https://*.example/*']});
  await rejected;assert.equal(h.calls[0].signal.aborted,true);
  hold.resolve({proposal:{late:true}});
});

test('R2.1.1 real HTTPS facade receives lease cancellation at fetch',async t=>{
  const entered=deferred(),reply=deferred();let fetchSignal;
  const runtime=createSharedAIProviderRuntime({hostInstanceId:'panel',client:{requestWorkflowAI:async()=>{
    assert.fail('HTTPS cannot dispatch Native RPC');
  }}});
  t.after(()=>runtime.dispose());
  runtime.updateSettings({source:'custom_https',endpoint:'https://model.example/v1/chat/completions',model:'one',apiKey:'secret'});
  const lease=runtime.acquire({consumerId:'tasks',instanceId:'fetch'});
  const running=lease.requestStructured({request:'plan',instructions:'JSON only',fetchImpl:async(_url,options)=>{
    fetchSignal=options.signal;entered.resolve();return reply.promise;
  }});
  const rejected=assert.rejects(running);
  await entered.promise;await lease.cancelInference();
  assert.equal(fetchSignal.aborted,true,'abort reaches the existing HTTPS transport');
  reply.resolve({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{content:'{}'}}]})});
  await rejected;
});

test('R2.1.1 late old settlement cannot release a newer pending consumer',async t=>{
  const old=deferred(),fresh=deferred();let count=0;
  const h=harness(t,{source:'custom_https',transport:()=>++count===1?old.promise:fresh.promise}),conversation=h.make();
  const running=conversation.request({request:'old',event:trusted});
  const rejected=assert.rejects(running,{code:'E_TOOL_CHANGED'});
  await tick();h.runtime.updateSettings({model:'two'});await rejected;
  const current=conversation.request({request:'new',event:trusted});await tick();
  old.resolve({proposal:{obsolete:true}});await tick();
  await assert.rejects(conversation.request({request:'duplicate',event:trusted}),{code:'E_AI_BUSY'});
  assert.equal(h.calls[1].signal.aborted,false);
  fresh.resolve({proposal:{fresh:true}});const result=await current;
  assert.deepEqual(result.proposal,{fresh:true});await result.authorization.assertWrite();result.authorization.release();
});

test('R2.1.1 incomplete idle HTTPS settings and consumer teardown leave no revocation listener',t=>{
  const h=harness(t,{source:'custom_https'}),conversation=h.make();
  h.runtime.updateSettings({endpoint:'',apiKey:''});
  assert.doesNotThrow(()=>h.revoke({origins:['https://other.example/*']}));
  conversation.dispose();assert.equal(h.listeners.size,0);
  assert.doesNotThrow(()=>h.runtime.updateSettings({model:'after-close'}));
});
