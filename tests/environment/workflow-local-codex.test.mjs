import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalCodexPlanner,describeLocalCodex,workflowCodexInput} from '../../src/ui/workflow/local-codex.js';
import {requestWorkflowPlan} from '../../src/ui/workflow/ai-plan.js';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';

const target={windowId:1,tabId:2,frameId:0,documentId:'doc-one',url:'https://example.test/form?private=value',origin:'https://example.test'};
const consent=observation=>({model:true,workflow:true,observation});
function workflow() {return emptyWorkflow(target.origin,'12345678-1234-1234-1234-123456789abc');}
function proposal() {return {title:'观察表单',description:'检查页面结构',paramsSchema:workflow().paramsSchema,
  steps:[{stepId:'observe1',op:'observe'}]};}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const request=(extra={})=>({request:'检查这个页面',workflow:workflow(),consent:consent(false),...extra});

function fixture({turnEvents,override,plannerOptions={}}={}) {
  const calls=[],listeners=new Set(),sessions=new Map(),closed=new Map();
  let opens=0,turns=0;
  function emit(session,type,fields={}) {
    const event={sequence:session.events.length+1,sessionId:session.sessionId,threadId:session.threadId,
      turnId:session.turnId||'',type,...fields};session.events.push(event);
    if(type==='turn.started')session.state='RUNNING';
    if(type==='tool.request')session.state='APPROVAL_REQUIRED';
    if(type==='turn.completed')session.state=fields.status==='completed'?'READY_FOR_TURN':fields.status==='interrupted'?'CANCELLED':'FAILED';
    return event;
  }
  const client={subscribeWorkflowAI:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
    async requestWorkflowAI(method,params={},sessionId=null) {
      calls.push({method,params:structuredClone(params),sessionId});
      if(override){const intercepted=override({method,params,sessionId,calls,sessions});if(intercepted!==undefined)return intercepted;}
      if(method==='ai.connection.read')return {state:'NATIVE_CONNECTED',nativeConnected:true,protocolAvailable:true,enabled:true};
      if(method==='ai.capabilities.read')return {state:'READY_FOR_TURN',readyForTurn:true,inferenceVerified:false,authState:'chatgpt'};
      if(method==='ai.session.open') {
        const previous=params.resumeSessionId?closed.get(params.resumeSessionId):null;
        const session={sessionId:'session-'+(++opens),threadId:previous?.threadId||'thread-'+opens,events:[],turnId:null,state:'READY_FOR_TURN'};
        sessions.set(session.sessionId,session);emit(session,'session.ready');
        return {sessionId:session.sessionId,threadId:session.threadId,cursor:0,state:'READY_FOR_TURN',inferenceVerified:false};
      }
      if(method==='ai.session.close') {
        const selected=sessionId?[sessions.get(sessionId)]:[...sessions.values()];
        for(const session of selected.filter(Boolean)){closed.set(session.sessionId,session);sessions.delete(session.sessionId);}
        return {state:'CLOSED',resumable:true};
      }
      const session=sessions.get(sessionId);
      if(!session)throw Object.assign(Error('Session belongs to another owner'),{code:'E_OWNER'});
      if(method==='ai.plan.cancel') {
        if(['RUNNING','APPROVAL_REQUIRED','CANCELLING'].includes(session.state)) {
          emit(session,'turn.completed',{status:'interrupted'});return {state:'CANCELLING'};
        }
        return {state:session.state};
      }
      if(method==='ai.plan.start') {
        session.turnId='turn-'+(++turns);emit(session,'turn.started');
        const events=turnEvents?.({session,params,turn:turns})||[
          {type:'message.delta',text:'{"title":'},
          {type:'message.completed',text:JSON.stringify(proposal())},
          {type:'turn.completed',status:'completed'}];
        for(const event of events)emit(session,event.type,event);
        return {sessionId,threadId:session.threadId,turnId:session.turnId,state:'RUNNING'};
      }
      if(method==='ai.events.read') {
        const events=session.events.filter(event=>event.sequence>params.cursor).slice(0,params.limit);
        return {events,cursor:events.at(-1)?.sequence??params.cursor,hasMore:false,state:session.state,inferenceVerified:session.state==='READY_FOR_TURN'};
      }
      if(method==='ai.approval.answer')return {state:'ANSWERED'};
      throw Error('Unexpected method '+method);
    }};
  return {client,calls,listeners,sessions,closed,emit,planner:createLocalCodexPlanner({client,pollIntervalMs:1,timeoutMs:1000,...plannerOptions})};
}

test('one owner session continues multiple protocol turns and returns only validated proposals',async t=>{
  const f=fixture();t.after(()=>f.planner.dispose());const seen=[];
  const first=await f.planner.plan(request({onEvent:event=>seen.push(event.type)}));
  const second=await f.planner.plan(request({request:'再检查一次'}));
  assert.equal(first.workflowId,workflow().workflowId);assert.equal(second.siteOrigin,target.origin);
  assert.equal(f.calls.filter(call=>call.method==='ai.session.open').length,1);
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,2);
  assert.ok(seen.includes('message.delta'));assert.ok(seen.includes('turn.completed'));
  assert.equal(f.planner.snapshot().inferenceVerified,true);
  const reads=f.calls.filter(call=>call.method==='ai.events.read');
  assert.ok(reads[1].params.cursor>reads[0].params.cursor);
});

test('capability discovery differentiates unsupported Native from a usable turn request',async t=>{
  const f=fixture({override:({method})=>method==='ai.connection.read'
    ?{state:'CODEX_UNSUPPORTED',nativeConnected:true,protocolAvailable:false,readyForTurn:false}:undefined});
  t.after(()=>f.planner.dispose());
  assert.equal((await f.planner.probe()).state,'CODEX_UNSUPPORTED');
  assert.deepEqual(f.calls.map(call=>call.method),['ai.connection.read']);
  assert.equal(describeLocalCodex({state:'READY_FOR_TURN',readyForTurn:false}).ready,false);
  assert.match(describeLocalCodex({state:'READY_FOR_TURN',readyForTurn:true,inferenceVerified:false}).message,/额度/);
  assert.match(describeLocalCodex({state:'CODEX_UNSUPPORTED',reason:'E_CODEX_POLICY'}).message,/策略/);
  assert.match(describeLocalCodex({state:'PROVIDER_ERROR',readyForTurn:false}).message,/未完成/);
});

test('sending freezes the minimal reviewed input, requires consent, and bounds UTF-8 bytes',async t=>{
  const f=fixture();t.after(()=>f.planner.dispose());
  const original=workflow();original.privateToken='DO_NOT_SEND_THIS';
  const input=workflowCodexInput('观察页面',original);
  assert.doesNotMatch(input,/DO_NOT_SEND_THIS|private=value/);
  assert.match(input,/untrusted webpage data/);
  await assert.rejects(f.planner.plan(request({consent:{model:false,workflow:true,observation:false}})),{code:'E_AI_CONSENT'});
  assert.equal(f.calls.length,0);
  original.description='界'.repeat(20000);
  assert.throws(()=>workflowCodexInput('计划',original),{code:'E_AI_INPUT_LIMIT'});
});

test('intermediate plan.updated and streamed JSON cannot masquerade as a completed proposal',async t=>{
  const f=fixture({turnEvents:()=>[
    {type:'plan.updated',plan:[{step:'观察',status:'completed'}]},
    {type:'message.delta',text:JSON.stringify(proposal())},
    {type:'turn.completed',status:'completed'}]});
  t.after(()=>f.planner.dispose());
  await assert.rejects(f.planner.plan(request()),{code:'E_AI_RESPONSE'});
});

test('cross-origin or authority-bearing final model JSON is rejected by the existing schema',async t=>{
  for(const proposed of [
    {...proposal(),permissions:['tabs']},
    {...proposal(),steps:[{stepId:'navigate1',op:'navigate',url:'https://evil.test/'}]},
    {...proposal(),steps:[{stepId:'script1',op:'evaluate',source:'doSomething()'}]}
  ]) {
    const f=fixture({turnEvents:()=>[{type:'message.completed',text:JSON.stringify(proposed)},
      {type:'turn.completed',status:'completed'}]});t.after(()=>f.planner.dispose());
    await assert.rejects(f.planner.plan(request()),error=>/^E_WORKFLOW_/.test(error.code));
    assert.equal(f.calls.some(call=>['run.start','script.save'].includes(call.method)),false);
  }
});

test('browser.observe uses one exact pending approval and returns only the caller-approved receipt',async t=>{
  const receipt={format:'opendesk.workflow-observation.v1',runId:'real-run',resultId:'real-result',sourceHash:'a'.repeat(64),summary:{origin:target.origin,nodes:[]}};
  let approvals=0;
  const f=fixture({turnEvents:()=>[{type:'tool.request',approvalId:'observe-1',tool:'browser.observe',canApprove:true,target},
    {type:'message.completed',text:JSON.stringify(proposal())},{type:'turn.completed',status:'completed'}]});
  t.after(()=>f.planner.dispose());
  await f.planner.plan(request({consent:consent(true),target,onApproval:async(event,context)=>{
    approvals++;assert.equal(event.target.documentId,'doc-one');assert.match(context.requestId,/^ai-observe-/);
    assert.equal(context.signal.aborted,false);return {decision:'approve',result:receipt};
  }}));
  assert.equal(approvals,1);
  const answer=f.calls.find(call=>call.method==='ai.approval.answer');
  assert.equal(answer.params.approvalId,'observe-1');assert.deepEqual(answer.params.result,receipt);
});

test('unconsented, wrong-document, arbitrary tool, and local command approvals are denied without observation',async t=>{
  const cases=[
    {scope:false,event:{type:'tool.request',approvalId:'one',tool:'browser.observe',canApprove:true,target}},
    {scope:true,event:{type:'tool.request',approvalId:'one',tool:'browser.observe',canApprove:true,target:{...target,documentId:'doc-other'}}},
    {scope:true,event:{type:'tool.request',approvalId:'one',tool:'browser.click',canApprove:true,target}},
    {scope:true,event:{type:'tool.request',approvalId:'one',tool:'browser.observe',canApprove:false,target}}
  ];
  for(const scenario of cases) {
    const f=fixture({turnEvents:()=>[scenario.event,{type:'message.completed',text:JSON.stringify(proposal())},
      {type:'turn.completed',status:'completed'}]});t.after(()=>f.planner.dispose());
    await f.planner.plan(request({consent:consent(scenario.scope),target:scenario.scope?target:undefined,
      onApproval:()=>assert.fail('unsafe observation must not be requested')}));
    const answer=f.calls.find(call=>call.method==='ai.approval.answer');
    assert.deepEqual(answer.params,{approvalId:'one',decision:'deny'});
  }
});

test('unsupported local approval is already rejected by Go and cannot become an answerable Browser approval',async t=>{
  const f=fixture({turnEvents:()=>[{type:'approval.required',approvalId:'blocked',kind:'shell',canApprove:false},
    {type:'turn.completed',status:'failed',error:{code:'E_CAPABILITY',message:'Blocked'}}]});
  t.after(()=>f.planner.dispose());
  await assert.rejects(f.planner.plan(request({consent:consent(true),target,
    onApproval:()=>assert.fail('local tools cannot be approved')})),{code:'E_CODEX_POLICY'});
  assert.equal(f.calls.some(call=>call.method==='ai.approval.answer'),false);
  assert.equal(f.planner.snapshot().sessionId,null);
});

test('duplicate tool approval can never execute or answer twice',async t=>{
  const tool={type:'tool.request',approvalId:'same',tool:'browser.observe',canApprove:true,target};
  let observations=0;
  const f=fixture({turnEvents:()=>[tool,tool]});t.after(()=>f.planner.dispose());
  await assert.rejects(f.planner.plan(request({consent:consent(true),target,
    onApproval:async()=>{observations++;return {decision:'approve',result:{runId:'one'}};}})),{code:'E_AI_PROTOCOL'});
  assert.equal(observations,1);assert.equal(f.calls.filter(call=>call.method==='ai.approval.answer').length,1);
});

test('observation scope may shrink in a thread, but expansion requires a newly opened session',async t=>{
  const f=fixture();t.after(()=>f.planner.dispose());
  await f.planner.plan(request());const first=f.planner.snapshot().threadId;
  await f.planner.plan(request({consent:consent(true),target}));const second=f.planner.snapshot().threadId;
  assert.notEqual(first,second);
  await f.planner.plan(request({consent:consent(false)}));
  assert.equal(f.planner.snapshot().threadId,second);
  assert.equal(f.calls.filter(call=>call.method==='ai.session.open').length,2);
  assert.equal(f.calls.filter(call=>call.method==='ai.session.close').length,1);
});

test('close releases a thread; same-owner resume is explicit and does not start a model turn',async t=>{
  const f=fixture();t.after(()=>f.planner.dispose());
  await f.planner.plan(request());const original=f.planner.snapshot();
  await f.planner.close({remember:true});assert.equal(f.planner.snapshot().resumable,true);
  await assert.rejects(f.planner.resume({consent:consent(true)}),{code:'E_AI_RESUME_SCOPE'});
  await f.planner.resume({consent:consent(false)});
  assert.equal(f.planner.snapshot().threadId,original.threadId);
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
  const resumed=f.calls.filter(call=>call.method==='ai.session.open').at(-1);
  assert.equal(resumed.params.resumeSessionId,original.sessionId);
  assert.equal(f.planner.snapshot().resumable,false);
});

test('Native disconnect clears stale owner sessions without replay; next explicit send opens a fresh thread',async t=>{
  const f=fixture();t.after(()=>f.planner.dispose());
  await f.planner.plan(request());const prior=f.planner.snapshot().sessionId;
  for(const listener of f.listeners)listener({state:'DISCONNECTED',nativeConnected:false,protocolAvailable:false});
  assert.equal(f.planner.snapshot().sessionId,null);assert.equal(f.planner.snapshot().resumable,false);
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
  await f.planner.plan(request());
  assert.notEqual(f.planner.snapshot().sessionId,prior);
  assert.equal(f.calls.filter(call=>call.method==='ai.session.open').length,2);
});

test('retired owner errors clear sessions and wait for a new user request instead of retrying',async t=>{
  let failNext=true;
  const f=fixture({override:({method})=>{
    if(method==='ai.events.read'&&failNext){failNext=false;return Promise.reject(Object.assign(Error('retired'),{code:'E_OWNER'}));}
  }});t.after(()=>f.planner.dispose());
  await assert.rejects(f.planner.plan(request()),{code:'E_OWNER'});
  assert.equal(f.planner.snapshot().sessionId,null);
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
  await f.planner.plan(request());
  assert.equal(f.calls.filter(call=>call.method==='ai.session.open').length,2);
});

test('expired event cursors and uncertain transport outcomes retire the session without retrying input',async t=>{
  for(const code of ['E_CURSOR_EXPIRED','E_AI_OUTCOME_UNKNOWN','E_AI_TIMEOUT']) {
    const f=fixture({override:({method})=>method==='ai.events.read'
      ?Promise.reject(Object.assign(Error('Uncertain event stream'),{code})):undefined});
    t.after(()=>f.planner.dispose());
    await assert.rejects(f.planner.plan(request()),{code});
    assert.equal(f.planner.snapshot().sessionId,null);
    assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
  }
});

test('a paginated terminal state still delivers its final provider failure after every earlier event',async t=>{
  const f=fixture({turnEvents:()=>[
    ...Array.from({length:28},()=>({type:'message.delta',text:'progress '})),
    {type:'turn.completed',status:'failed',error:{code:'E_MODEL_UNAVAILABLE',message:'Model unavailable'}}
  ],override:({method,params,sessionId,sessions})=>{
    if(method!=='ai.events.read')return;
    const remaining=sessions.get(sessionId).events.filter(event=>event.sequence>params.cursor);
    const events=remaining.slice(0,params.limit);
    return {events,cursor:events.at(-1)?.sequence??params.cursor,hasMore:remaining.length>events.length,
      state:'FAILED',inferenceVerified:false};
  }});t.after(()=>f.planner.dispose());
  const seen=[];
  await assert.rejects(f.planner.plan(request({onEvent:event=>seen.push(event)})),{code:'E_MODEL_UNAVAILABLE'});
  assert.equal(f.calls.filter(call=>call.method==='ai.events.read').length,2);
  assert.equal(seen.filter(event=>event.type==='message.delta').length,28);
  assert.equal(seen.at(-1).type,'turn.completed');
});

test('cancel during opening discards its late session and never starts a turn',async t=>{
  const gate=deferred();
  const f=fixture({override:({method})=>method==='ai.session.open'?gate.promise:undefined});
  t.after(()=>f.planner.dispose());
  const running=f.planner.plan(request()),rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await tick();await f.planner.cancel();await rejected;
  gate.resolve({sessionId:'late-session',threadId:'late-thread',state:'READY_FOR_TURN',cursor:0});await tick();
  assert.equal(f.planner.snapshot().sessionId,null);
  assert.equal(f.calls.some(call=>call.method==='ai.plan.start'),false);
  assert.ok(f.calls.some(call=>call.method==='ai.session.close'&&call.sessionId===null));
  assert.ok(f.calls.some(call=>call.method==='ai.session.close'&&call.sessionId==='late-session'));
});

test('cancellation during approval discards a late observation result',async t=>{
  const gate=deferred(),entered=deferred();
  const f=fixture({turnEvents:()=>[{type:'tool.request',approvalId:'one',tool:'browser.observe',canApprove:true,target}]});
  t.after(()=>f.planner.dispose());
  const running=f.planner.plan(request({consent:consent(true),target,onApproval:()=>{entered.resolve();return gate.promise;}}));
  const rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await entered.promise;await f.planner.cancel();await rejected;
  gate.resolve({decision:'approve',result:{private:'late'}});await tick();
  assert.equal(f.calls.some(call=>call.method==='ai.approval.answer'),false);
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
});

test('external abort retains one cleanup after active ends and waits for exact interrupted terminal before reuse',async t=>{
  const firstRead=deferred(),entered=deferred(),ack=deferred(),drain=deferred(),draining=deferred();
  let reads=0,drainRequest;
  const f=fixture({turnEvents:({turn})=>turn===1?[]:undefined,override:({method,params,sessionId,sessions})=>{
    if(method==='ai.plan.cancel'){sessions.get(sessionId).state='CANCELLING';return ack.promise;}
    if(method==='ai.events.read'&&sessions.get(sessionId).turnId==='turn-1') {
      if(++reads===1){entered.resolve();return firstRead.promise;}
      drainRequest={params,sessionId};draining.resolve();return drain.promise;
    }
  }});t.after(()=>f.planner.dispose());
  const external=new AbortController(),running=f.planner.plan(request({signal:external.signal}));
  const rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await entered.promise;external.abort();await rejected;
  let settled=false;
  // This is the former workflow-view sequence: its first cancel came from the
  // external abort; the second happens after plan() has released active.
  const cleanup=f.planner.cancel();cleanup.then(()=>{settled=true;});
  assert.equal(f.planner.cancel(),cleanup,'same in-flight cleanup is reused');
  assert.equal(f.planner.snapshot().busy,true);
  await assert.rejects(f.planner.plan(request()),{code:'E_AI_BUSY'});
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.cancel').length,1);
  assert.equal(settled,false,'pending Native ACK cannot be reported as idle');
  ack.resolve({state:'CANCELLING'});await draining.promise;await tick();
  assert.equal(settled,false,'CANCELLING ACK cannot be reported as terminal');
  const session=f.sessions.get(drainRequest.sessionId);
  f.emit(session,'turn.completed',{status:'interrupted'});
  const events=session.events.filter(event=>event.sequence>drainRequest.params.cursor);
  drain.resolve({events,cursor:events.at(-1).sequence,hasMore:false,state:'CANCELLED',inferenceVerified:false});
  assert.deepEqual(await cleanup,{state:'CANCELLED',terminalStatus:'interrupted'});
  assert.equal(f.planner.snapshot().busy,false);
  assert.equal(f.planner.snapshot().state,'CANCELLED');
  await f.planner.plan(request());
  assert.equal(f.calls.filter(call=>call.method==='ai.session.open').length,1,'only the confirmed thread may continue');
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,2,'the old turn is never resubmitted');
  firstRead.resolve({events:[],cursor:0,hasMore:false,state:'RUNNING',inferenceVerified:false});
});

test('close is memoized and preempts a stalled cancellation drain without inventing an interrupted terminal',async t=>{
  const approval=deferred(),entered=deferred(),drain=deferred(),draining=deferred(),closeAck=deferred();
  let cancelling=false;
  const f=fixture({turnEvents:()=>[{type:'tool.request',approvalId:'one',tool:'browser.observe',canApprove:true,target}],
    override:({method})=>{
      if(method==='ai.plan.cancel'){cancelling=true;return {state:'CANCELLING'};}
      if(method==='ai.events.read'&&cancelling){draining.resolve();return drain.promise;}
      if(method==='ai.session.close')return closeAck.promise;
    }});t.after(()=>f.planner.dispose());
  const running=f.planner.plan(request({consent:consent(true),target,onApproval:()=>{entered.resolve();return approval.promise;}}));
  const rejected=assert.rejects(running,{code:'E_CANCELLED'});await entered.promise;
  const cancelled=f.planner.cancel();await draining.promise;await rejected;
  const closed=f.planner.close({remember:true});
  assert.equal(f.planner.close({remember:false}),closed);
  assert.equal(f.calls.filter(call=>call.method==='ai.session.close').length,1,'close dispatches immediately without waiting for drain');
  await assert.rejects(f.planner.plan(request()),{code:'E_AI_BUSY'});
  closeAck.resolve({state:'CLOSED',resumable:true});
  assert.deepEqual(await closed,{state:'CLOSED',resumable:true});
  assert.deepEqual(await cancelled,{state:'CLOSED',resumable:true});
  assert.equal(f.planner.snapshot().sessionId,null);assert.equal(f.planner.snapshot().resumable,false,'a repeated close may tighten retention');
  assert.equal(f.planner.snapshot().busy,false);
  approval.resolve({decision:'approve',result:{never:'delivered'}});
  drain.resolve({events:[],cursor:0,hasMore:false,state:'CANCELLING',inferenceVerified:false});
  assert.equal(f.calls.some(call=>call.method==='ai.approval.answer'),false);
});

test('missing or different-turn cancellation terminal closes and forgets the old session without replay',async t=>{
  for(const differentTurn of [false,true]) {
    const entered=deferred(),approval=deferred();let cancelling=false;
    const f=fixture({plannerOptions:{cancelTimeoutMs:30},
      turnEvents:({turn})=>turn===1?[{type:'tool.request',approvalId:'one',tool:'browser.observe',canApprove:true,target}]:undefined,
      override:({method,sessionId,sessions})=>{
        if(method==='ai.plan.cancel') {
          cancelling=true;const session=sessions.get(sessionId);session.state='CANCELLING';
          if(differentTurn)f.emit(session,'turn.completed',{turnId:'turn-other',status:'interrupted'});
          session.state='CANCELLING';return {state:'CANCELLING'};
        }
      }});t.after(()=>f.planner.dispose());
    const running=f.planner.plan(request({consent:consent(true),target,onApproval:()=>{entered.resolve();return approval.promise;}}));
    const rejected=assert.rejects(running,{code:'E_CANCELLED'});await entered.promise;
    await assert.rejects(f.planner.cancel(),{code:'E_AI_OUTCOME_UNKNOWN'});await rejected;
    assert.equal(cancelling,true);assert.equal(f.planner.snapshot().sessionId,null);assert.equal(f.planner.snapshot().busy,false);
    assert.equal(f.calls.filter(call=>call.method==='ai.session.close').length,1);
    assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
    await f.planner.plan(request());
    assert.equal(f.calls.filter(call=>call.method==='ai.session.open').length,2,'explicit next intent gets a new thread');
    approval.resolve({decision:'deny'});
  }
});

test('external cancellation during opening blocks new intent until owner close and rejects a late open reply',async t=>{
  const open=deferred(),close=deferred();let firstOpen=true,firstClose=true;
  const f=fixture({override:({method})=>{
    if(method==='ai.session.open'&&firstOpen){firstOpen=false;return open.promise;}
    if(method==='ai.session.close'&&firstClose){firstClose=false;return close.promise;}
  }});t.after(()=>f.planner.dispose());
  const external=new AbortController(),running=f.planner.plan(request({signal:external.signal}));
  const rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await tick();external.abort();await rejected;const cleanup=f.planner.cancel();
  await assert.rejects(f.planner.plan(request()),{code:'E_AI_BUSY'});
  assert.equal(f.calls.filter(call=>call.method==='ai.session.open').length,1);
  close.resolve({state:'CLOSED',resumable:false});await cleanup;
  await f.planner.plan(request());const current=f.planner.snapshot().sessionId;
  open.resolve({sessionId:'late-session',threadId:'late-thread',cursor:0,state:'READY_FOR_TURN'});await tick();
  assert.equal(f.planner.snapshot().sessionId,current);
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
  assert.ok(f.calls.some(call=>call.method==='ai.session.close'&&call.sessionId==='late-session'));
});

test('an already-aborted request creates no Native session or cleanup traffic',async t=>{
  const f=fixture();t.after(()=>f.planner.dispose());const controller=new AbortController();controller.abort();
  await assert.rejects(f.planner.plan(request({signal:controller.signal})),{code:'E_CANCELLED'});
  assert.equal(f.calls.length,0);
});

for(const boundary of ['timeout','cursor'])test('internal '+boundary+' failure waits for the shared close fence and preserves its original error',async t=>{
  const enteredClose=deferred(),closed=deferred();let firstRead=true,firstClose=true;
  const expected=boundary==='timeout'?'E_AI_TIMEOUT':'E_AI_CURSOR_EXPIRED';
  const f=fixture({plannerOptions:{timeoutMs:boundary==='timeout'?25:1000},turnEvents:({turn})=>turn===1?[]:undefined,
    override:({method,sessionId,sessions})=>{
      if(method==='ai.events.read'&&boundary==='cursor'&&firstRead) {
        firstRead=false;throw Object.assign(Error('cursor expired'),{code:expected});
      }
      if(method==='ai.plan.cancel'){sessions.get(sessionId).state='CANCELLING';return {state:'CANCELLING'};}
      if(method==='ai.session.close'&&firstClose){firstClose=false;enteredClose.resolve();return closed.promise;}
    }});t.after(()=>f.planner.dispose());
  let ended=false;
  const running=f.planner.plan(request());running.then(()=>{ended=true;},()=>{ended=true;});
  const rejected=assert.rejects(running,{code:expected});await enteredClose.promise;await tick();
  assert.equal(ended,false,'internal error does not release Send while its close is pending');
  assert.equal(f.planner.snapshot().busy,true);
  await assert.rejects(f.planner.plan(request()),{code:'E_AI_BUSY'});
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
  closed.resolve({state:'CLOSED',resumable:false});await rejected;
  assert.equal(f.planner.snapshot().busy,false);assert.equal(f.planner.snapshot().sessionId,null);
  await f.planner.plan(request());
  assert.equal(f.calls.filter(call=>call.method==='ai.session.open').length,2);
  assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,2,'only an explicit later intent opens a new turn');
});

for(const type of ['turn.completed','message.completed','tool.request'])
  test(type+' without a nonempty string turn identity closes before proposal or observation',async t=>{
    for(const turnId of [undefined,'',17]) {
      const event={type,turnId,...(type==='turn.completed'?{status:'completed'}:
        type==='message.completed'?{text:JSON.stringify(proposal())}:
          {tool:'browser.observe',canApprove:true,approvalId:'one',target})};
      const f=fixture({turnEvents:()=>[event]});t.after(()=>f.planner.dispose());
      await assert.rejects(f.planner.plan(request({consent:consent(true),target,
        onApproval:()=>assert.fail('a tool without turn identity cannot request observation')})),{code:'E_AI_PROTOCOL'});
      assert.equal(f.planner.snapshot().sessionId,null);assert.equal(f.planner.snapshot().busy,false);
      assert.equal(f.calls.filter(call=>call.method==='ai.session.close').length,1);
      assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
      assert.equal(f.calls.some(call=>call.method==='ai.approval.answer'),false);
    }
  });

test('an invalid terminal status never becomes known terminal evidence and closes the old session',async t=>{
  for(const status of [undefined,'running',null]) {
    const f=fixture({turnEvents:()=>[{type:'turn.completed',status}]});t.after(()=>f.planner.dispose());
    await assert.rejects(f.planner.plan(request()),{code:'E_AI_PROTOCOL'});
    assert.equal(f.planner.snapshot().sessionId,null);assert.equal(f.planner.snapshot().busy,false);
    assert.equal(f.calls.filter(call=>call.method==='ai.session.close').length,1);
    assert.equal(f.calls.filter(call=>call.method==='ai.plan.start').length,1);
  }
});

test('invalid event batch metadata is rejected before any model output is delivered',async t=>{
  for(const invalid of [{hasMore:undefined},{hasMore:1},{state:null},{state:1}]) {
    const f=fixture({override:({method})=>method==='ai.events.read'
      ?{events:[],cursor:0,hasMore:false,state:'RUNNING',...invalid}:undefined});t.after(()=>f.planner.dispose());
    await assert.rejects(f.planner.plan(request({onEvent:()=>assert.fail('invalid batch cannot reach the UI')})),{code:'E_AI_PROTOCOL'});
    assert.equal(f.planner.snapshot().sessionId,null);assert.equal(f.planner.snapshot().busy,false);
    assert.equal(f.calls.filter(call=>call.method==='ai.session.close').length,1);
  }
});

test('event identity and sequence gaps terminate planning without trusting later text',async t=>{
  for(const mutate of [event=>({...event,sessionId:'another-owner'}),event=>({...event,sequence:event.sequence+1})]) {
    const f=fixture({override:({method,params,sessionId,sessions})=>{
      if(method!=='ai.events.read')return;
      const session=sessions.get(sessionId),events=session.events.filter(event=>event.sequence>params.cursor);
      events[0]=mutate(events[0]);
      return {events,cursor:events.at(-1).sequence,hasMore:false,state:'READY_FOR_TURN',inferenceVerified:true};
    }});t.after(()=>f.planner.dispose());
    await assert.rejects(f.planner.plan(request()),{code:'E_AI_EVENTS_GAP'});
    assert.equal(f.planner.snapshot().sessionId,null);
  }
});

test('unused manual workflows create no Native AI requests when their view is disposed',()=>{
  const f=fixture();f.planner.dispose();assert.equal(f.calls.length,0);
});

test('custom HTTPS planner forwards cancellation to its one explicitly chosen request',async()=>{
  const controller=new AbortController(),entered=deferred(),reason=Object.assign(Error('Cancelled by user'),{code:'E_CANCELLED'});
  let requests=0;
  const running=requestWorkflowPlan({endpoint:'https://provider.example/v1/chat/completions',
    apiKey:'session-key',model:'selected-model',request:'查看页面',workflow:workflow(),signal:controller.signal,
    fetchImpl:async(url,options)=>{
      requests++;assert.equal(url,'https://provider.example/v1/chat/completions');
      assert.equal(options.signal,controller.signal);entered.resolve();
      return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
    }});
  const rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await entered.promise;controller.abort(reason);await rejected;assert.equal(requests,1);
});
