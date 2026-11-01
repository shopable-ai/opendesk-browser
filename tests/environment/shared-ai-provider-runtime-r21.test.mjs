import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {createLocalCodexPlanner} from '../../src/ui/workflow/local-codex.js';
import {createBusinessConversation} from '../../src/ui/conversation/provider-consumer.js';
import {createPreviewProviderSettings} from '../../src/ui/react/preview/shared-ai-preview.js';

const fail=code=>Object.assign(new Error(code),{code});
const deferred=()=>{let resolve,reject;const promise=new Promise((done,no)=>{resolve=done;reject=no;});return {promise,resolve,reject};};
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
      async cancel(){cancelled.push(threadId);return {state:'CANCELLED',terminalStatus:'interrupted'};},
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

for(const [name,create] of [
  ['runtime',()=>setup().runtime],
  ['preview',createPreviewProviderSettings]
]){
  for(const [source,endpoint] of [
    ['custom_https','https://model.example/unknown/custom-route'],
    ['cloud_responses','https://model.example/v1/responses']
  ])test(`shared settings ${name}: ${source} survives local roundtrip without losing its key`,()=>{
    const settings=create();
    try{
      settings.updateSettings({source,endpoint,model:'test-model',apiKey:'test-only-key'});
      const local=settings.updateSettings({source:'local_codex'});
      assert.equal(local.source,'local_codex');
      assert.equal(local.httpsSource,source);
      assert.equal(local.endpoint,endpoint);
      assert.equal(local.hasApiKey,true);
      const restored=settings.updateSettings({source:local.httpsSource});
      assert.equal(restored.source,source);
      assert.equal(restored.httpsSource,source);
      assert.equal(restored.hasApiKey,true);
      assert.equal(Object.hasOwn(restored,'apiKey'),false);
      if(name==='runtime')assert.equal(settings.configuration().settings.apiKey,'test-only-key');
      settings.updateSettings({source:'local_codex'});
      const changed=settings.updateSettings({endpoint:endpoint+'/changed'});
      assert.equal(changed.httpsSource,null,'local endpoint edits discard the remembered source');
      assert.equal(changed.hasApiKey,true,'same-origin path edits retain the key');
    }finally{settings.dispose();}
  });

  test(`shared settings ${name}: unchanged updates preserve snapshot, generation and listeners`,()=>{
    const settings=create();
    try{
      settings.updateSettings({source:'custom_https',endpoint:'https://model.example/custom',apiKey:'test-only-key'});
      let notifications=0;
      settings.subscribeSettings(()=>notifications++);
      const before=settings.settingsSnapshot();
      assert.equal(settings.updateSettings({}),before);
      assert.equal(settings.updateSettings({source:before.source,endpoint:before.endpoint,model:before.model}),before);
      assert.equal(settings.settingsSnapshot().generation,before.generation);
      assert.equal(notifications,0);
    }finally{settings.dispose();}
  });

  test(`shared settings ${name}: retained keys cannot move to another or invalid origin`,()=>{
    const settings=create();
    try{
      settings.updateSettings({source:'custom_https',endpoint:'https://model.example/custom',apiKey:'test-only-key'});
      const before=settings.settingsSnapshot();
      let notifications=0;
      settings.subscribeSettings(()=>notifications++);
      for(const endpoint of ['https://other.example/custom','http://model.example/custom',
        'https://model.example:8443/custom','invalid endpoint','data:text/plain,opaque']){
        assert.throws(()=>settings.updateSettings({endpoint}),error=>{
          assert.equal(error.code,'E_AI_CONFIG');
          assert.match(error.message,/新的 API Key.*清空 API Key/);
          assert.equal(error.message.includes('test-only-key'),false);
          return true;
        });
        assert.equal(settings.settingsSnapshot(),before,'rejection must not mutate settings');
      }
      assert.equal(notifications,0);
      const sameOrigin=settings.updateSettings({endpoint:'https://MODEL.example:443/new-path',model:'new-model'});
      assert.equal(sameOrigin.hasApiKey,true);
      if(name==='runtime')assert.equal(settings.configuration().settings.apiKey,'test-only-key');
      const replaced=settings.updateSettings({endpoint:'https://other.example/custom',apiKey:'replacement-test-key'});
      assert.equal(replaced.hasApiKey,true);
      const cleared=settings.updateSettings({endpoint:'https://third.example/custom',apiKey:''});
      assert.equal(cleared.hasApiKey,false);
      assert.equal(settings.updateSettings({endpoint:'https://fourth.example/custom'}).hasApiKey,false);
      assert.equal(JSON.stringify(settings.settingsSnapshot()).includes('replacement-test-key'),false);
    }finally{settings.dispose();}
  });
}

test('shared runtime configure keeps active-source semantics and remembers only the unchanged HTTPS endpoint',()=>{
  const {runtime}=setup();
  try{
    assert.equal(runtime.settingsSnapshot().httpsSource,null);
    for(const source of ['custom_https','cloud_responses']){
      const config={source,endpoint:'https://model.example/unknown-route',model:'test',apiKey:'test-only-key'};
      runtime.configure(config);
      assert.equal(runtime.settingsSnapshot().httpsSource,source);
      const local=runtime.configure({...config,source:'local_codex'});
      assert.equal(local.source,'local_codex');
      assert.equal(runtime.settingsSnapshot().httpsSource,source);
      const before=runtime.settingsSnapshot();
      runtime.configure({...config,source:'local_codex'});
      assert.equal(runtime.settingsSnapshot(),before);
      runtime.configure({...config,source:'local_codex',endpoint:config.endpoint+'/changed'});
      assert.equal(runtime.settingsSnapshot().httpsSource,null);
    }
  }finally{runtime.dispose();}
});

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

test('R2.2.1 shared Consumer Session retains Prompt ETag but never leaks other business IDs',()=>{
  const r=setup(),listeners=new Set();
  const api={permissions:{onRemoved:{
    addListener:listener=>listeners.add(listener),
    removeListener:listener=>listeners.delete(listener)
  }}};
  const make=(consumerId,instanceId)=>createBusinessConversation({
    api,providerRuntime:r.runtime,hostInstanceId:'panel-1',consumerId,instanceId
  });
  const bookmark=make('bookmark','bookmark-session');
  const prompt=make('prompt','prompt-session');
  const tasks=make('tasks','tasks-session');
  const etag='a'.repeat(64),row={id:'turn-1',speaker:'你',message:'搜索'};
  bookmark.saveSession({open:true,draft:'保留书签草稿',rows:[row],
    refs:{folderId:'folder-1',bookmarkId:'bookmark-1',matches:['bookmark-2'],etag}});
  prompt.saveSession({open:true,draft:'保留提示词草稿',rows:[row],
    refs:{folderId:'must-not-cross',bookmarkId:'must-not-cross',matches:['prompt-1'],etag}});
  tasks.saveSession({open:true,draft:'保留任务草稿',rows:[row],
    refs:{folderId:'must-not-cross',matches:['private-id'],etag}});
  assert.deepEqual(bookmark.readSession().refs,{
    folderId:'folder-1',bookmarkId:'bookmark-1',matches:['bookmark-2']
  });
  assert.deepEqual(prompt.readSession().refs,{matches:['prompt-1'],etag});
  assert.deepEqual(tasks.readSession().refs,{});
  prompt.saveSession({open:true,refs:{matches:['prompt-2'],etag:'invalid'}});
  assert.deepEqual(prompt.readSession().refs,{matches:['prompt-2'],etag:null},
    'unverified Prompt ETag cannot authorize a later ordinal reference');
  bookmark.dispose();prompt.dispose();tasks.dispose();
  assert.deepEqual(bookmark.readSession().refs,{
    folderId:null,bookmarkId:null,matches:[]
  });
  assert.deepEqual(prompt.readSession().refs,{matches:[],etag:null});
  assert.deepEqual(tasks.readSession().refs,{});
  assert.equal(listeners.size,0);
  r.runtime.dispose();
});


test('retired generation shares only in-flight cleanup and retries unknown on original planner',async()=>{
  const attempts=[],released=[];let count=0;
  const runtime=createSharedAIProviderRuntime({client:{requestWorkflowAI:async()=>({})},hostInstanceId:'host',
    plannerFactory:()=>{
      const id=++count;
      return {planStructured:async()=>({id}),snapshot:()=>({sessionId:'s'+id,threadId:'t'+id}),
        cancel(){const d=deferred();attempts.push({id,...d});return d.promise;},dispose(){released.push(id);}};
    },facadeFactory:({localPlanner})=>({generateStructured:({request})=>localPlanner.planStructured({input:request})})});
  const lease=runtime.acquire({consumerId:'sidebar-tools',instanceId:'original'});
  try{
    await lease.requestStructured({request:'first'});
    runtime.updateSettings({model:'changed'});
    const first=lease.cancelInference(),same=lease.cancelInference();assert.equal(first,same);
    attempts[0].resolve({state:'OUTCOME_UNKNOWN'});await first;await Promise.resolve();
    assert.equal(runtime.developmentIdle(),false,'unretired AI must veto development refresh after the transport settles');
    assert.deepEqual(released,[],'unknown must retain original planner');
    assert.equal(lease.planner.snapshot().sessionId,'s1');
    await assert.rejects(lease.requestStructured({request:'blocked'}),{code:'E_AI_OUTCOME_UNKNOWN'});
    assert.equal(count,1);
    const retry=lease.planner.cancel();assert.equal(attempts.length,2);assert.equal(attempts[1].id,1);
    attempts[1].reject(fail('E_DISCONNECTED'));await assert.rejects(retry,{code:'E_DISCONNECTED'});
    const idle=lease.cancelInference();attempts[2].resolve({state:'IDLE'});await idle;
    assert.equal(runtime.developmentIdle(),false,'an uncorrelated IDLE cannot authorize refresh');
    assert.deepEqual(released,[],'IDLE cannot retire the submitted turn');
    runtime.updateSettings({source:'cloud_responses'});
    const cloudFence=lease.cancelInference();attempts[3].resolve({state:'OUTCOME_UNKNOWN'});await cloudFence;
    await assert.rejects(lease.requestStructured({request:'cloud must also wait'}),{code:'E_AI_OUTCOME_UNKNOWN'});
    const terminal=lease.cancelInference();assert.equal(attempts[4].id,1);
    attempts[4].resolve({state:'CANCELLED',terminalStatus:'interrupted'});await terminal;
    assert.equal(runtime.developmentIdle(),true,'only the original terminal receipt releases this reload fence');
    assert.deepEqual(released,[1]);
    await lease.requestStructured({request:'fresh'});assert.equal(count,2);
  }finally{lease.dispose();runtime.dispose();for(const d of attempts)d.resolve({state:'CANCELLED',terminalStatus:'interrupted'});}
});

test('development refresh stays blocked throughout a structured request and releases after settlement',async()=>{
  const r=setup(),lease=r.runtime.acquire({consumerId:'sidebar-tools',instanceId:'development'});
  let work;
  try{
    assert.equal(r.runtime.developmentIdle(),true);
    work=lease.requestStructured({request:'hold',instructions:'restricted'});
    assert.equal(r.runtime.developmentIdle(),false,'AI remains busy between individual Native RPCs');
    r.pending.resolve({ok:true});await work;
    assert.equal(r.runtime.developmentIdle(),true);
  }finally{r.pending.resolve({ok:true});await work?.catch(()=>{});lease.dispose();r.runtime.dispose();}
});

test('closing a consumer keeps its original unknown Native turn in the live Host reload fence',async()=>{
  const attempts=[];let released=0,starts=0;
  const runtime=createSharedAIProviderRuntime({hostInstanceId:'disposed-consumer-host',client:{requestWorkflowAI(){}},
    plannerFactory:()=>({snapshot:()=>({busy:true,state:'OUTCOME_UNKNOWN'}),
      planStructured:async()=>{starts++;throw fail('E_AI_OUTCOME_UNKNOWN');},
      cancel(){const reply=deferred();attempts.push(reply);return reply.promise;},dispose(){released++;}}),
    facadeFactory:({localPlanner})=>({generateStructured:()=>localPlanner.planStructured({})})});
  const lease=runtime.acquire({consumerId:'sidebar-tools',instanceId:'original-consumer'});
  try{
    await assert.rejects(lease.requestStructured({request:'original'}),{code:'E_AI_OUTCOME_UNKNOWN'});
    lease.dispose();
    assert.equal(runtime.developmentIdle(),false,'removing UI ownership cannot retire the original inference');
    attempts[0].resolve({state:'IDLE'});await lease.planner.cancel();
    assert.equal(runtime.developmentIdle(),false);
    assert.equal(released,0,'do not dispose the only original turn correlation on unknown');
    const terminal=lease.planner.cancel();attempts[1].resolve({state:'CANCELLED',terminalStatus:'interrupted'});await terminal;
    assert.equal(runtime.developmentIdle(),true);
    assert.equal(released,1);
    assert.equal(starts,1,'retirement never starts another inference');
    await assert.rejects(lease.requestStructured({request:'cannot reuse closed consumer'}),{code:'E_TOOL_CHANGED'});
  }finally{for(const reply of attempts)reply.resolve({state:'CANCELLED',terminalStatus:'interrupted'});runtime.dispose();}
});

test('a readiness-only planner can retire on provider change without inventing a pending turn',async()=>{
  const calls=[];
  const runtime=createSharedAIProviderRuntime({hostInstanceId:'probe-host',client:{
    async requestWorkflowAI(method){calls.push(method);return {nativeConnected:true,protocolAvailable:true,state:'READY_FOR_TURN'};}
  },facadeFactory:()=>({generateStructured:async()=>({accepted:true})})});
  const lease=runtime.acquire({consumerId:'sidebar-tools',instanceId:'probe-only'});
  try{
    await lease.probe();assert.deepEqual(calls,['ai.connection.read','ai.capabilities.read']);
    runtime.updateSettings({model:'next-model'});
    assert.deepEqual(await lease.cancelInference(),{state:'IDLE'});
    assert.deepEqual(await lease.requestStructured({request:'new explicit intent'}),{accepted:true});
    assert.equal(calls.includes('ai.plan.start'),false,'readiness must not create inference');
  }finally{lease.dispose();runtime.dispose();}
});
