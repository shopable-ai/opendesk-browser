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
 assert.equal(disposed,1);
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
test('actual planner unknown turn plus failed session close cannot turn idle into retirement proof',async()=>{
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
 // No planner/facade doubles: exercise their real cleanup, which clears session
 // before the failing close and then releases active in plan's finally block.
 const runtime=createSharedAIProviderRuntime({client,hostInstanceId:'host'});
 const adapter=createSidebarToolAIAdapter({providerRuntime:runtime,instanceId:'i',installEpoch:'e',assertCurrent(){},confirm:async()=>{}});
 try{
   await assert.rejects(adapter.request('ai.generate',input),{code:'E_AI_UNKNOWN'});
   assert.equal(calls.filter(row=>row.method==='ai.session.close').length,1);
   for(let i=0;i<2;i++)assert.equal((await adapter.request('ai.cancel',{requestId:'one'})).state,'unknown');
   // The real planner has no active turn: cancel resolves IDLE without issuing
   // any Native cancellation. That absence must never unlock another dispatch.
   assert.equal(calls.filter(row=>row.method==='ai.plan.cancel').length,0);
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
     endpoint:'https://secret-token@example.com'}})});
   try{
     const {metadata}=await t.adapter.request('ai.generate',input);
     assert.equal(metadata.responseId,invalid?null:'resp_123');
     assert.equal(metadata.upstreamStatus,invalid?null:'completed');
     assert.equal(metadata.upstreamRequestId,invalid?null:'req-123');
     assert.equal(JSON.stringify(metadata).includes('secret-token'),false);
     assert.equal(Object.hasOwn(metadata,'headers'),false);assert.equal(Object.hasOwn(metadata,'apiKey'),false);
   }finally{t.adapter.dispose();}
 }
});
