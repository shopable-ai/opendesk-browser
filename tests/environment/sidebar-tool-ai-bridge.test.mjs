import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSidebarToolAIAdapter} from '../../src/ui/ai/sidebar-tool-adapter.js';
const input={requestId:'one',request:'generate',instructions:'return JSON',context:{},providerGeneration:1};
function setup(options={}){
 let calls=0,confirmations=0,settings={source:options.source||'local_codex',model:'',generation:1},listener;
 const runtime={settingsSnapshot:()=>settings,subscribeSettings:fn=>(listener=fn,()=>{}),
 acquire:identity=>{assert.equal(identity.consumerId,'sidebar-tools');assert.equal(identity.installEpoch,'epoch');return {
 cancelInference:()=>options.cancel?.()??Promise.resolve({state:'UNKNOWN'}),
 planner:{snapshot:()=>({threadId:'thread-real',sessionId:'session-real',model:'real-model'})},dispose(){},
 async requestStructured(args){calls++;if(!options.generate)args.onEvent({type:'turn.completed',turnId:'turn-real',status:'completed'});
 return options.generate?options.generate(args):{proposal:{ok:true},metadata:{usage:null}};}};}};
 const adapter=createSidebarToolAIAdapter({providerRuntime:runtime,instanceId:'instance',installEpoch:'epoch',assertCurrent(){},
 confirm:async(data,signal)=>{confirmations++;return options.confirm?.(data,signal);},...options});
 return {adapter,calls:()=>calls,confirmations:()=>confirmations,switch(){settings={...settings,generation:2};listener();}};
}
test('real evidence, strict schema, generation and replay',async()=>{
 const t=setup();assert.equal((await t.adapter.request('ai.info',{})).generation,1);
 await assert.rejects(t.adapter.request('ai.generate',{...input,providerGeneration:undefined}),{code:'E_MODEL_STALE'});
 await assert.rejects(t.adapter.request('ai.generate',{...input,apiKey:'fake'}),{code:'E_AI_REQUEST'});
 const result=await t.adapter.request('ai.generate',input);
 assert.equal(result.metadata.turnId,'turn-real');assert.equal(result.metadata.model,'real-model');assert.equal(t.confirmations(),1);
 await assert.rejects(t.adapter.request('ai.generate',input),{code:'E_AI_REPLAY'});t.adapter.dispose();
});
test('cancel pending approval sends nothing and rejects late approval',async()=>{
 let approve;const t=setup({confirm:()=>new Promise(r=>approve=r)});
 const pending=t.adapter.request('ai.generate',input);
 await assert.rejects(t.adapter.request('ai.generate',{...input,requestId:'two'}),{code:'E_AI_BUSY'});
 assert.deepEqual(await t.adapter.request('ai.cancel',{requestId:'one'}),{requestId:'one',state:'cancelled'});
 await assert.rejects(pending,{code:'E_CANCELLED'});approve();await new Promise(r=>setImmediate(r));assert.equal(t.calls(),0);t.adapter.dispose();
});
test('provider switch discards late result',async()=>{
 let finish;const t=setup({generate:()=>new Promise(r=>finish=r)});
 const pending=t.adapter.request('ai.generate',input);await new Promise(r=>setImmediate(r));t.switch();
 await assert.rejects(pending,{code:'E_AI_UNKNOWN'});finish({proposal:{late:true}});t.adapter.dispose();
});
test('timeout unknown, bounded schema, no automatic resend',async()=>{
 const t=setup({timeoutMs:5,generate:()=>new Promise(()=>{})});
 await assert.rejects(t.adapter.request('ai.generate',{...input,request:'x'.repeat(4001)}),{code:'E_AI_REQUEST'});
 await assert.rejects(t.adapter.request('ai.generate',input),{code:'E_AI_TIMEOUT'});
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');assert.equal(t.calls(),1);t.adapter.dispose();
});
test('destroy aborts pending work and refuses recycled instance',async()=>{
 const t=setup({generate:()=>new Promise(()=>{})});
 const pending=t.adapter.request('ai.generate',input);await new Promise(r=>setImmediate(r));t.adapter.dispose();
 await assert.rejects(pending,{code:'E_AI_UNKNOWN'});
 await assert.rejects(t.adapter.request('ai.info',{}),{code:'E_TOOL_CHANGED'});
});

test('local stop waits for real terminal receipt and work settlement',async()=>{
 let finish,cancelReply,cancelCalls=0;
 const t=setup({generate:()=>new Promise(r=>finish=r),cancel:()=>{cancelCalls++;return new Promise(r=>cancelReply=r);}});
 const pending=t.adapter.request('ai.generate',input);await new Promise(r=>setImmediate(r));
 const rejected=assert.rejects(pending,{code:'E_AI_UNKNOWN'});
 let returned=false;const cancel=t.adapter.request('ai.cancel',{requestId:'one'}).then(v=>{returned=true;return v;});
 await new Promise(r=>setImmediate(r));assert.equal(returned,false);assert.equal(cancelCalls,1);
 await assert.rejects(t.adapter.request('ai.generate',{...input,requestId:'two'}),{code:'E_AI_BUSY'});
 cancelReply({state:'READY_FOR_TURN',terminalStatus:'interrupted'});
 assert.equal((await cancel).state,'cancelled');await rejected;
 await assert.rejects(t.adapter.request('ai.generate',{...input,requestId:'two'}),{code:'E_AI_BUSY'});
 finish({proposal:{late:true}});await new Promise(r=>setImmediate(r));t.adapter.dispose();
});
test('unknown receipt and cloud abort cannot claim remote retirement',async()=>{
 for(const source of ['local_codex','cloud_responses']){
 let finish;const t=setup({source,generate:()=>new Promise(r=>finish=r),cancel:async()=>({state:'UNKNOWN'})});
 const pending=t.adapter.request('ai.generate',input);await new Promise(r=>setImmediate(r));
 const rejected=assert.rejects(pending,{code:'E_AI_UNKNOWN'});
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');await rejected;
 await assert.rejects(t.adapter.request('ai.generate',{...input,requestId:'two'}),{code:'E_AI_BUSY'});
 finish({proposal:{late:true}});await new Promise(r=>setImmediate(r));t.adapter.dispose();
 }
});
test('raw provider errors never cross bridge',async()=>{
 const t=setup({generate:async()=>{throw Object.assign(new Error('Bearer secret-token'),{code:'TOKEN_secret-token'});}});
 await assert.rejects(t.adapter.request('ai.generate',input),error=>error.code==='E_AI_PROVIDER'&&!String(error).includes('secret-token'));
 t.adapter.dispose();
});
test('approval abort invokes review cancellation without ever dispatching',async()=>{
 let reviewCancelled=false;
 const t=setup({confirm:(_data,signal)=>new Promise((_,reject)=>{
 signal.addEventListener('abort',()=>{reviewCancelled=true;reject(new Error('private review details'));},{once:true});
 })});
 const pending=t.adapter.request('ai.generate',input);
 const rejected=assert.rejects(pending,{code:'E_CANCELLED'});
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'cancelled');
 await rejected;await new Promise(r=>setImmediate(r));
 assert.equal(reviewCancelled,true);assert.equal(t.calls(),0);t.adapter.dispose();
});
test('Native cancellation failure is unknown and its raw error is discarded',async()=>{
 let finish;const t=setup({generate:()=>new Promise(r=>finish=r),cancel:async()=>{throw Error('secret native credential');}});
 const pending=t.adapter.request('ai.generate',input);await new Promise(r=>setImmediate(r));
 const rejected=assert.rejects(pending,{code:'E_AI_UNKNOWN'});
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');await rejected;
 finish({proposal:{late:true}});await new Promise(r=>setImmediate(r));t.adapter.dispose();
});
test('a settled unknown stop can reconcile the same request after connection recovery',async()=>{
 let finish,cancels=0;
 const t=setup({generate:()=>new Promise(resolve=>finish=resolve),cancel:async()=>{
   cancels++;return cancels===1?{state:'UNKNOWN'}:{state:'READY_FOR_TURN',terminalStatus:'interrupted'};
 }});
 try{
   const pending=t.adapter.request('ai.generate',input);
   const rejected=assert.rejects(pending,{code:'E_AI_UNKNOWN'});
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');
   await rejected;
   assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'cancelled');
   assert.equal(cancels,2);assert.equal(t.calls(),1,'reconciliation never dispatches inference again');
 }finally{finish?.({proposal:{late:true}});await new Promise(resolve=>setImmediate(resolve));t.adapter.dispose();}
});
test('real planner retains original turn after failed cancellation and reconnects without another start',async()=>{
 const {createSharedAIProviderRuntime}=await import('../../src/ui/ai/provider-runtime.js');
 let connected=false,starts=0,cancels=0,notify;
 const sessionId='recovery-session',threadId='recovery-thread',turnId='recovery-turn';
 const client={subscribeWorkflowAI(fn){notify=fn;return ()=>{};},async requestWorkflowAI(method,params,id){
   if(method==='ai.session.open')return {sessionId,threadId,cursor:0,state:'READY_FOR_TURN'};
   if(method==='ai.plan.start'){starts++;return {sessionId,threadId,turnId};}
   if(method==='ai.events.read'){
     assert.equal(id,sessionId);
     if(!connected){notify({nativeConnected:false});throw Object.assign(Error('offline'),{code:'E_AI_DISCONNECTED'});}
     return {events:[{sequence:1,type:'turn.completed',sessionId,threadId,turnId,status:'interrupted'}],cursor:1,hasMore:false,state:'READY_FOR_TURN'};
   }
   if(method==='ai.plan.cancel'){cancels++;assert.equal(id,sessionId);if(!connected)throw Error('offline');return {state:'CANCELLING'};}
   if(method==='ai.session.close')throw Error('offline');
   throw Error('Unexpected RPC '+method);
 }};
 const runtime=createSharedAIProviderRuntime({client,hostInstanceId:'recovery-host'});
 const adapter=createSidebarToolAIAdapter({providerRuntime:runtime,instanceId:'i',installEpoch:'e',assertCurrent(){},confirm:async()=>{}});
 try{
   await assert.rejects(adapter.request('ai.generate',input),{code:'E_AI_UNKNOWN'});
   assert.equal(runtime.developmentIdle(),false,'disconnected original Native inference must veto reload');
   assert.equal((await adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');
   assert.equal(runtime.developmentIdle(),false,'unknown cancellation is not a reload acknowledgement');
   await assert.rejects(adapter.request('ai.generate',{...input,requestId:'two'}),{code:'E_AI_BUSY'});
   connected=true;
   assert.equal((await adapter.request('ai.cancel',{requestId:'one'})).state,'cancelled');
   assert.equal(runtime.developmentIdle(),true,'the exact original terminal releases the Provider reload fence');
   assert.equal(starts,1);assert.ok(cancels>=2);
 }finally{adapter.dispose();runtime.dispose();}
});
test('actual shared runtime/facade/planner preserves flat terminal events and session across turns',async()=>{
 const {createSharedAIProviderRuntime}=await import('../../src/ui/ai/provider-runtime.js');
 let opens=0,turn=0,events=[];
 const sessionId='protocol-session',threadId='protocol-thread';
 const client={async requestWorkflowAI(method,params,id){
   if(method==='ai.session.open'){opens++;return {sessionId,threadId,cursor:0,state:'READY_FOR_TURN'};}
   if(method==='ai.plan.start'){
     assert.equal(id,sessionId);turn++;
     const turnId='protocol-turn-'+turn;
     for(const event of [{type:'message.completed',text:'{"result":true}'},{type:'turn.completed',status:'completed'}])
       events.push({...event,sessionId,threadId,turnId,sequence:events.length+1});
     return {sessionId,threadId,turnId};
   }
   if(method==='ai.events.read'){
     const batch=events.filter(event=>event.sequence>params.cursor);
     return {events:batch,cursor:events.length,hasMore:false,state:'READY_FOR_TURN',inferenceVerified:true};
   }
   if(method==='ai.session.close')return {state:'CLOSED'};
   throw Error('Unexpected protocol method');
 }};
 const runtime=createSharedAIProviderRuntime({client,hostInstanceId:'host'});
 const adapter=createSidebarToolAIAdapter({providerRuntime:runtime,instanceId:'instance',installEpoch:'epoch',assertCurrent(){},confirm:async()=>{}});
 try{
   for(let i=1;i<=2;i++){
     const result=await adapter.request('ai.generate',{...input,requestId:'protocol-'+i});
     assert.equal(result.metadata.status,'completed');assert.equal(result.metadata.turnId,'protocol-turn-'+i);
     assert.equal(result.metadata.sessionId,sessionId);assert.equal(result.metadata.threadId,threadId);
     assert.equal(result.metadata.model,null);
   }
   assert.equal(opens,1);
 }finally{adapter.dispose();runtime.dispose();}
});
test('cloud unknown remains fenced after aborted transport settles',async()=>{
 const t=setup({source:'cloud_responses',generate:({signal})=>new Promise((_,reject)=>{
 signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 })});
 const pending=t.adapter.request('ai.generate',input);await new Promise(r=>setImmediate(r));
 const rejected=assert.rejects(pending,{code:'E_AI_UNKNOWN'});
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');await rejected;
 await assert.rejects(t.adapter.request('ai.generate',{...input,requestId:'two'}),{code:'E_AI_BUSY'});
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');t.adapter.dispose();
});
test('late real local terminal updates original id without delivering proposal',async()=>{
 let finish,event;
 const t=setup({generate:args=>{event=args.onEvent;return new Promise(r=>finish=r);},cancel:async()=>({state:'UNKNOWN'})});
 const pending=t.adapter.request('ai.generate',input);await new Promise(r=>setImmediate(r));
 const rejected=assert.rejects(pending,{code:'E_AI_UNKNOWN'});
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');await rejected;
 event({type:'turn.completed',turnId:'original-real-turn',status:'completed'});finish({proposal:{late:true}});
 await new Promise(r=>setImmediate(r));
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'completed');t.adapter.dispose();
});
test('provider outcome unknown preserves code, original request state and fence',async()=>{
 const t=setup({generate:async()=>{throw Object.assign(Error('private provider response'),{code:'E_AI_OUTCOME_UNKNOWN'});},cancel:async()=>({state:'UNKNOWN'})});
 await assert.rejects(t.adapter.request('ai.generate',input),{code:'E_AI_UNKNOWN'});
 await assert.rejects(t.adapter.request('ai.generate',{...input,requestId:'two'}),{code:'E_AI_BUSY'});
 assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');t.adapter.dispose();
});
test('real runtime switch retains old planner cleanup instead of synthetic idle',async()=>{
 const {createSharedAIProviderRuntime}=await import('../../src/ui/ai/provider-runtime.js');
 let cancelCalls=0,reply,finish,disposed=0;
 const runtime=createSharedAIProviderRuntime({client:{requestWorkflowAI(){}},hostInstanceId:'host',
 plannerFactory:()=>({plan(){},snapshot:()=>({}),planStructured:()=>new Promise(r=>finish=r),
 cancel(){cancelCalls++;return new Promise(r=>reply=r);},dispose(){disposed++;}})});
 const adapter=createSidebarToolAIAdapter({providerRuntime:runtime,instanceId:'i',installEpoch:'e',assertCurrent(){},confirm:async()=>{}});
 const pending=adapter.request('ai.generate',input);await new Promise(r=>setImmediate(r));
 const rejected=assert.rejects(pending,{code:'E_AI_UNKNOWN'});
 runtime.updateSettings({source:'cloud_responses'});
 assert.equal(cancelCalls,1);assert.equal(disposed,0);
 let returned=false;const query=adapter.request('ai.cancel',{requestId:'one'}).then(r=>(returned=true,r));
 await new Promise(r=>setImmediate(r));assert.equal(returned,false);
 reply({state:'UNKNOWN'});assert.equal((await query).state,'unknown');await rejected;
 assert.equal(disposed,0,'unknown retains the old planner for a later explicit query');
 await assert.rejects(adapter.request('ai.generate',{...input,requestId:'two',providerGeneration:2}),{code:'E_AI_BUSY'});
 finish({ok:true});await new Promise(r=>setImmediate(r));adapter.dispose();runtime.dispose();
});
test('Host AI budget accepts 12000 sample while preserving independent field/envelope limits',async()=>{
 const {checkSidebarToolRequestBudget}=await import('../../src/ui/sidebar-tools.js');
 const message={operation:'ai.generate',toolId:'generic',payload:{...input,context:{sample:'x'.repeat(12000)}}};
 assert.ok(JSON.stringify(message).length>12000);assert.equal(checkSidebarToolRequestBudget(message).ok,true);
 message.payload.instructions='x'.repeat(10000);assert.equal(checkSidebarToolRequestBudget(message).ok,true);
 message.payload.instructions+='x';assert.equal(checkSidebarToolRequestBudget(message).ok,false);
 message.payload.instructions='valid';message.payload.context.sample='x'.repeat(20000);
 assert.equal(checkSidebarToolRequestBudget(message).ok,false);
 message.payload.context={};message.extra='x'.repeat(513);assert.equal(checkSidebarToolRequestBudget(message).ok,false);
 delete message.extra;message.operation='storage.set';message.payload={value:'x'.repeat(12000)};
 assert.equal(checkSidebarToolRequestBudget(message).ok,false);
});
test('actual planner unknown terminal retains original identity and cannot turn idle into retirement proof',async()=>{
 const {createSharedAIProviderRuntime}=await import('../../src/ui/ai/provider-runtime.js');
 const calls=[];
 const sessionId='uncertain-session',threadId='uncertain-thread',turnId='uncertain-turn';
 const client={async requestWorkflowAI(method,params,id){
   calls.push({method,id});
   if(method==='ai.session.open')return {sessionId,threadId,cursor:0,state:'READY_FOR_TURN'};
   if(method==='ai.plan.start')return {sessionId,threadId,turnId,state:'RUNNING'};
   if(method==='ai.events.read')return {events:[{sequence:1,type:'turn.completed',sessionId,threadId,turnId,
     status:'failed',error:{code:'E_TIMEOUT',outcome:'OUTCOME_UNKNOWN'}}],cursor:1,hasMore:false,state:'FAILED'};
   if(method==='ai.session.close')throw Object.assign(Error('Native close failed'),{code:'E_DISCONNECTED'});
   throw Error('Unexpected Native RPC '+method);
 }};
 // No planner/facade doubles: an unknown terminal is never confirmed failure.
 const runtime=createSharedAIProviderRuntime({client,hostInstanceId:'host'});
 const adapter=createSidebarToolAIAdapter({providerRuntime:runtime,instanceId:'i',installEpoch:'e',assertCurrent(){},confirm:async()=>{}});
 try{
   await assert.rejects(adapter.request('ai.generate',input),{code:'E_AI_UNKNOWN'});
   assert.equal(calls.filter(row=>row.method==='ai.session.close').length,0);
   for(let i=0;i<2;i++)assert.equal((await adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');
   // Each explicit retry reconciles the original turn; no synthetic IDLE or
   // failed cancellation may unlock another inference dispatch.
   assert.equal(calls.filter(row=>row.method==='ai.plan.cancel').length,2);
   await assert.rejects(adapter.request('ai.generate',{...input,requestId:'two'}),{code:'E_AI_BUSY'});
   assert.equal(calls.filter(row=>row.method==='ai.plan.start').length,1);
 }finally{adapter.dispose();runtime.dispose();}
});

test('real runtime disconnect fences original request but preparation rejection permits retry',async()=>{
 const {createSharedAIProviderRuntime}=await import('../../src/ui/ai/provider-runtime.js');
 for(const mode of ['disconnected-batch','disconnect-notification','prepare']){
   let starts=0,notify;
   const client={subscribeWorkflowAI(fn){notify=fn;return ()=>{};},async requestWorkflowAI(method){
     if(method==='ai.session.open')return {sessionId:'s',threadId:'t',cursor:0,state:'READY_FOR_TURN'};
     if(method==='ai.plan.start'){starts++;return {sessionId:'s',threadId:'t',turnId:'turn'};}
     if(method==='ai.events.read'){
       if(mode==='disconnect-notification')notify({nativeConnected:false});
       return {events:[],cursor:0,hasMore:false,state:'DISCONNECTED'};
     }
     if(method==='ai.session.close')return {state:'CLOSED'};
     throw Error('Unexpected RPC '+method);
   }};
   const runtime=createSharedAIProviderRuntime({client,hostInstanceId:'host'});
   const adapter=createSidebarToolAIAdapter({providerRuntime:runtime,instanceId:'i',installEpoch:'e',assertCurrent(){},confirm:async()=>{}});
   try{
     if(mode==='prepare'){
       // Character-valid public envelope, but exceeds the real local UTF-8 input cap.
       const oversized={...input,instructions:'中'.repeat(10000),context:{text:'中'.repeat(2000)}};
       await assert.rejects(adapter.request('ai.generate',oversized),{code:'E_AI_PROVIDER'});
       assert.equal(starts,0);
       assert.equal((await adapter.request('ai.cancel',{requestId:'one'})).state,'failed');
     }
     await assert.rejects(adapter.request('ai.generate',{...input,requestId:mode==='prepare'?'retry':'one'}),{code:'E_AI_UNKNOWN'});
     const id=mode==='prepare'?'retry':'one';
     for(let i=0;i<2;i++)assert.equal((await adapter.request('ai.cancel',{requestId:id})).state,'unknown');
     await assert.rejects(adapter.request('ai.generate',{...input,requestId:'second'}),{code:'E_AI_BUSY'});
     assert.equal(starts,1);
   }finally{adapter.dispose();runtime.dispose();}
 }
});

test('disconnect before lease dispatch remains retryable',async()=>{
 let attempts=0;
 const t=setup({confirm:async()=>{if(++attempts===1)throw Object.assign(Error('private preparation'),{code:'E_AI_DISCONNECTED'});}});
 try{
   await assert.rejects(t.adapter.request('ai.generate',input),{code:'E_AI_PROVIDER'});
   assert.equal(t.calls(),0);
   assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'failed');
   assert.equal((await t.adapter.request('ai.generate',{...input,requestId:'retry'})).proposal.ok,true);
 }finally{t.adapter.dispose();}
});

test('trace metadata permits only bounded identifiers and no arbitrary provider fields',async()=>{
 for(const invalid of [false,true]){
   const t=setup({generate:async()=>({proposal:{ok:true},metadata:{
     responseId:invalid?'Bearer secret-token':'resp_123',upstreamStatus:invalid?{secret:'secret-token'}:'completed',
     upstreamRequestId:invalid?'x'.repeat(201):'req-123',apiKey:'secret-token',headers:{authorization:'secret-token'},
     endpoint:'https://secret-token@example.com',usage:{input_tokens:4,output_tokens:0,total_tokens:6,
       prompt_tokens:4,completion_tokens:2,credential:'secret-token',headers:{authorization:'secret-token'},
       unknown:{credential:'secret-token'},input_tokens_details:{cached_tokens:1,credential:'secret-token'}}}})});
   try{
     const {metadata}=await t.adapter.request('ai.generate',input);
     assert.deepEqual(metadata.usage,{input_tokens:4,output_tokens:0,total_tokens:6,prompt_tokens:4,completion_tokens:2});
     assert.equal(metadata.responseId,invalid?null:'resp_123');
     assert.equal(metadata.upstreamStatus,invalid?null:'completed');
     assert.equal(metadata.upstreamRequestId,invalid?null:'req-123');
     assert.equal(JSON.stringify(metadata).includes('secret-token'),false);
     assert.equal(Object.hasOwn(metadata,'headers'),false);assert.equal(Object.hasOwn(metadata,'apiKey'),false);
   }finally{t.adapter.dispose();}
 }
});

test('safe diagnostic code uses fixed whitelist and never exposes raw provider data',async()=>{
 const allowed=['E_CODEX_UNSUPPORTED','E_CODEX_MISSING','E_CODEX_LOGIN_REQUIRED','E_CODEX_POLICY',
   'E_MODEL_UNAVAILABLE','E_RATE_LIMITED','E_NETWORK','E_PROVIDER','E_AI_CONSENT','E_AI_PROTOCOL'];
 for(const code of [...allowed,'E_AI_CAPABILITY','E_UNKNOWN_PROVIDER_SECRET','E_SECRET',undefined,'E_token-secret',
   'E_SECRET\nAuthorization: secret-token','E_'+ 'A'.repeat(63),{secret:'secret-token'}]){
   const t=setup({generate:async()=>{throw Object.assign(Error('Bearer secret-token'),{
     code,details:'private-details',headers:{authorization:'private-header'},credential:'private-credential'});}});
   try{
     await assert.rejects(t.adapter.request('ai.generate',input),error=>{
       assert.equal(error.code,'E_AI_PROVIDER');
       const valid=allowed.includes(code);
       assert.equal(error.message,'AI 请求未完成；请检查状态，不会自动重放'+(valid?' ('+code+')':''));
       assert.deepEqual(Object.keys(error),['code']);
       return true;
     });
   }finally{t.adapter.dispose();}
 }
});

test('diagnostic code preserves unknown classification and original request fence',async()=>{
 const t=setup({generate:async()=>{throw Object.assign(Error('private-message'),{code:'E_AI_OUTCOME_UNKNOWN'});}});
 try{
   await assert.rejects(t.adapter.request('ai.generate',input),error=>{
     assert.equal(error.code,'E_AI_UNKNOWN');
     assert.equal(error.message,'AI 终态尚未确认，请查询原 requestId；不会自动重放 (E_AI_OUTCOME_UNKNOWN)');
     return true;
   });
   assert.equal((await t.adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');
   await assert.rejects(t.adapter.request('ai.generate',{...input,requestId:'retry'}),{code:'E_AI_BUSY'});
 }finally{t.adapter.dispose();}
});


test('usage projection drops invalid counts without coercion or fabricated totals',async()=>{
 for(const usage of [null,[], 'private-credential', {}, {headers:{authorization:'private-credential'}},
   ...[-1,1.5,Number.MAX_SAFE_INTEGER+1,'3',true,NaN,Infinity,{credential:'private-credential'}].map(value=>({
     input_tokens:value,output_tokens:value,total_tokens:value,prompt_tokens:value,completion_tokens:value})),
   {input_tokens:0,total_tokens:Number.MAX_SAFE_INTEGER,output_tokens:-1}]){
   const t=setup({source:'custom_https',generate:async()=>({proposal:{ok:true},metadata:{usage}})});
   try{
     const result=await t.adapter.request('ai.generate',input);
     assert.deepEqual(result.metadata.usage,usage?.total_tokens===Number.MAX_SAFE_INTEGER?
       {input_tokens:0,total_tokens:Number.MAX_SAFE_INTEGER}:null);
   }finally{t.adapter.dispose();}
 }
});
