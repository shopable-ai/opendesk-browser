import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebTaskIngress} from '../../../src/page-events/web-task-ingress.js';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY,CHATGPT_BRIDGE_PROTOCOL}
  from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {WEB_TASK_PROTOCOL} from '../../../src/page-events/web-task-contract.js';
import {encodeValue} from '../../../src/platform/page-port/codec.js';

const source={tabId:4,documentId:'chat-document',url:'https://chatgpt.com/c/background-test'};
const scope={taskId:'baidu.search.top3',args:{query:'OpenDesk Browser',limit:3},targetUrl:'https://www.baidu.com/',
  sourceOrigin:'https://chatgpt.com',installation:{version:'1.1.2',scriptId:'task:baidu.search.top3:1.1.2',revision:1,
    manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),installationId:'install-one',generation:1}};
const event=()=>({addListener(){}});
function fixture(){
  const values={},sent=[],runs=[],results=[];
  let serial=0,replyChecks=0,taskChecks=0;
  const state={deliveryError:false,replyValid:true,sourceValid:true,ensures:0,resultDenied:false,taskEpoch:0};
  const storage={get:async key=>{state.onStorageRead?.();return {[key]:structuredClone(values[key])};},
    set:async next=>{Object.assign(values,structuredClone(next));state.onStorageWrite?.(next);}};
  const id='test-extension',getURL=path=>'chrome-extension://'+id+'/'+path;
  const page={id,frameId:0,documentId:source.documentId,url:source.url,tab:{id:4,url:source.url}};
  const owner={id,frameId:0,documentId:'original-offscreen',url:getURL('cloud-control/runner.html')};
  const panel={id,frameId:0,documentId:'panel',url:getURL('sidepanel.html?hostInstanceId=review')};
  const api={runtime:{id,getURL,getContexts:async filter=>[
    {contextType:'OFFSCREEN_DOCUMENT',documentId:owner.documentId,documentUrl:owner.url,frameId:0},
    {contextType:'SIDE_PANEL',documentId:panel.documentId,documentUrl:panel.url,frameId:0}]
    .filter(row=>(!filter.documentIds||filter.documentIds.includes(row.documentId))&&
      (!filter.documentUrls||filter.documentUrls.includes(row.documentUrl))&&filter.contextTypes.includes(row.contextType))},
    storage:{local:storage,onChanged:event()},permissions:{onRemoved:event(),contains:async()=>true},
    tabs:{onRemoved:event(),get:async()=>({id:4,url:state.sourceValid?source.url:'https://chatgpt.com/c/other'}),
      sendMessage:async(tabId,message,options)=>{sent.push({tabId,message,options});
        if(message.kind==='progress')return {ok:true};
        if(state.deliveryError)throw Error('ACK lost');
        if(state.deliveryReply)return structuredClone(state.deliveryReply);
        return {ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}};}},
    webNavigation:{onCommitted:event(),onHistoryStateUpdated:event(),onReferenceFragmentUpdated:event(),getFrame:async()=>({
      documentId:source.documentId,url:source.url,documentLifecycle:'active'})}};
  const newLedger=()=>createChatGPTBridgeTriggerLedger({storage,generateId:()=>`11111111-1111-4111-8111-${String(++serial).padStart(12,'0')}`});
  let ledger=newLedger();
  const broker={storage:{transaction:async(stores,mode,read)=>read({get:async()=>null,
    all:async name=>structuredClone(name==='runs'?runs:results)})},authority:{captureInstalledTaskFence:()=>{
      const ticket=state.taskEpoch;
      return ()=>{if(ticket!==state.taskEpoch)throw Object.assign(Error('installation changed'),{code:'E_REVISION'});};
    },resolveInstalledTask:async()=>({taskId:scope.taskId,...scope.installation,manifest:{deadlineMs:120000}}),
    snapshotControllerRun:async({runId})=>{
      await state.onSnapshot?.();
      return {run:structuredClone(runs.find(row=>row.runId===runId)),results:state.resultDenied?[]:structuredClone(results),
        resultDeliveryDenied:state.resultDenied?[runId]:[]};}}};
  const newIngress=()=>createWebTaskIngress({api,ledger,loadFoundation:async()=>broker,ensureRunner:async()=>{state.ensures++;},
    verifyChatGPTCandidate:async()=>{replyChecks++;if(!state.replyValid)throw Object.assign(Error('reply changed'),{code:'E_BRIDGE_CONTEXT'});},
    verifyTaskScope:async()=>{taskChecks++;state.onTaskVerified?.();return {title:'百度搜索',deadlineMs:30000,installation:scope.installation};}});
  let ingress=newIngress();
  const handle=(kind,body={},sender=owner)=>ingress.handle({protocol:WEB_TASK_PROTOCOL,kind,...body},sender);
  const admit=(candidateId='fresh-candidate')=>ingress.handleChatGPT({protocol:CHATGPT_BRIDGE_PROTOCOL,kind:'auto-task',persistentAuto:true,
    candidateText:JSON.stringify({protocol:'webflow.task.intent.v1',candidateId,taskId:scope.taskId,args:scope.args,targetUrl:scope.targetUrl}),
    turnKey:'turn-new',answerKey:'answer-new'},page);
  const ready=async row=>ingress.handleChatGPT({protocol:CHATGPT_BRIDGE_PROTOCOL,kind:'background-ready',requestId:row.requestId},page);
  const completed=async(candidateId='fresh-candidate',runId='run-one',resultId='result-one',{lostStartAck=false}={})=>{
    const row=await admit(candidateId);await ready(row);const request=await handle('claim');
    const revision={scriptId:scope.installation.scriptId,revision:1,sourceHash:scope.installation.contentHash};
    const submit=()=>{
      runs.push({tag:'controller-run',namespace:'tool:'+id,requestId:row.requestId,hostDocumentId:owner.documentId,
        sourceKind:'saved',scriptId:revision.scriptId,contentHash:revision.sourceHash,revision,runId,resultId,
        state:'completed',retirementState:'released'});
      results.push({tag:'controller-result',runId,resultId,state:'completed',sourceKind:'saved',revision,
        outcome:{ok:true,valueWire:encodeValue({query:'OpenDesk Browser',results:[1,2,3]})}});
      if(lostStartAck)throw Error('start ACK lost');
      return {runId};
    };
    const starting=ledger.withControllerAdmission({...request,paramsWire:encodeValue(request.params)},submit,
      saved=>ingress.verifySubmission(saved,owner));
    if(lostStartAck)await assert.rejects(starting,/start ACK lost/);else await starting;
    return row;
  };
  return {state,values,sent,page,owner,panel,runs,results,handle,admit,ready,completed,
    get ledger(){return ledger;},get ingress(){return ingress;},
    restart:({newOwner=false}={})=>{if(newOwner)owner.documentId='replacement-offscreen';ledger=newLedger();ingress=newIngress();},
    get replyChecks(){return replyChecks;},get taskChecks(){return taskChecks;},
    approve:async()=>{await ledger.approveAuto(scope);await ledger.setAutoEnabled(true);}};
}
test('fresh complete ChatGPT reply is owned by existing background queue without a Side Panel',async()=>{
  const h=fixture();await h.approve();const row=await h.admit();
  assert.equal(row.executionOwner,'background');assert.equal(await h.handle('claim'),null);
  await h.ready(row);const claimed=await h.handle('claim');
  assert.equal(claimed.requestId,row.requestId);assert.deepEqual(claimed.params,scope.args);
  assert(h.replyChecks>=2);assert(h.taskChecks>=2);
  assert.equal(await h.handle('claim'),null);
});
test('a pending range review is not an unknown execution and history cannot start it',async()=>{
  const h=fixture();await h.ledger.setAutoEnabled(true);const row=await h.admit();
  assert.equal(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].pendingAuto,true);
  h.restart();
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].status,'prepared');assert.equal(history[0].pendingAuto,true);
  assert.deepEqual(history[0].receipt,{execution:'not-started',release:'not-started',
    persistence:'not-confirmed',delivery:'not-sent',runId:null,resultId:null});
  assert.equal(await h.handle('claim'),null);
  assert.equal(h.state.ensures,0);assert.equal(h.runs.length,0);assert.equal(h.sent.length,0);
});
for(const patch of [{consumedAt:0},{controllerSubmitted:true},{webHostDocumentId:'lost-owner'},
  {webDelivery:'dispatching'},{webObservation:{execution:'running'}}])
test(`missing Run with ${Object.keys(patch)[0]} remains unknown`,async()=>{
  const h=fixture();await h.ledger.setAutoEnabled(true);const row=await h.admit();
  Object.assign(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId],patch);
  h.restart();const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].receipt.execution,'unknown');
  assert.equal(history[0].receipt.release,'unknown');
  assert.equal(h.runs.length,0);assert.equal(h.sent.length,0);
});
test('paused owned execution keeps its durable identity without inventing a persistent Result or retrying',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.runs[0].state='paused_unknown';h.runs[0].retirementState='not-started';h.results.splice(0);
  await h.ledger.recordWebTaskObservation(row.requestId,{runId:'stale-observation',resultId:'stale-result'});
  h.restart();const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(receipt.execution,'paused_unknown');assert.equal(receipt.runId,h.runs[0].runId);
  assert.equal(receipt.resultId,h.runs[0].resultId);assert.equal(receipt.release,'not-started');
  assert.equal(receipt.persistence,'not-confirmed');assert.equal(receipt.value,undefined);
  assert.equal(await h.handle('claim'),null);assert.equal(h.sent.length,0);
  delete h.runs[0].resultId;
  assert.equal((await h.handle('history',{source},h.panel))[0].receipt.resultId,null,
    'a current Run must not borrow a Result identity from another observation');
});

test('lost Run lookup preserves observed IDs as unverified metadata and never discloses cached Result bytes',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  await h.ledger.recordWebTaskObservation(row.requestId,{runId:h.runs[0].runId,resultId:h.runs[0].resultId,
    persistence:'verified',value:'PRIVATE_CACHED_RESULT',error:{code:'CACHED_ERROR',message:'PRIVATE'}});
  h.runs.splice(0);h.results.splice(0);h.restart();
  const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(receipt.execution,'unknown');assert.equal(receipt.runId,'run-one');assert.equal(receipt.resultId,'result-one');
  assert.equal(receipt.persistence,'not-confirmed');assert.equal(receipt.release,'unknown');
  assert.equal(receipt.value,undefined);assert.equal(receipt.error,undefined);
  assert.equal(await h.handle('claim'),null);assert.equal(h.sent.length,0);
});

test('changed complete reply or revoked authorization cannot submit',async()=>{
  const h=fixture();await h.approve();const row=await h.admit();await h.ready(row);h.state.replyValid=false;
  assert.equal(await h.handle('claim'),null);
  assert.equal(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].status,'revoked');
  h.state.replyValid=true;await h.ledger.setAutoEnabled(false);
  await assert.rejects(h.admit('different-candidate'),{code:'E_WEBFLOW_AUTO_DENIED'});
});
test('durable result is delivered once to original chat with distinct stage receipts',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  const result=await h.handle('settle',{requestId:row.requestId});
  assert.equal(result.state,'completed');
  const delivery=h.sent.filter(item=>item.message.kind==='deliver');assert.equal(delivery.length,1);
  assert.equal(delivery[0].message.protocol,CHATGPT_BRIDGE_PROTOCOL);
  assert.equal(delivery[0].message.turnKey,'turn-new');assert.equal(delivery[0].options.documentId,source.documentId);
  const saved=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
  assert.equal(saved.webObservation.persistence,'verified');assert.equal(saved.webObservation.release,'released');
  assert.equal(saved.webObservation.delivery,'confirmed');assert.equal(saved.webObservation.aiReplyObserved,true);
  await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
});
test('lost delivery ACK stays unknown through reconciliation and never resends',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();h.state.deliveryError=true;
  await assert.rejects(h.handle('settle',{requestId:row.requestId}));
  await h.handle('reconcile');await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].receipt.delivery,'unknown');assert.equal(history[0].receipt.runId,'run-one');
});
for(const code of ['E_CHAT_FILL','E_CHAT_ANSWER'])test(`${code} delivery rejection remains diagnosable without another send`,async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.deliveryReply={ok:false,error:{code,message:'original delivery rejection',outcome:'OUTCOME_UNKNOWN'}};
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code,message:'original delivery rejection'});
  const observation=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].webObservation;
  assert.equal(observation.delivery,'unknown');
  assert.deepEqual(observation.error,{code,message:'original delivery rejection'});
  await h.handle('reconcile');await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
});
test('final source rejection after dispatch fencing records the error without sending',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.onStorageWrite=next=>{
    if(next[CHATGPT_BRIDGE_LEDGER_KEY]?.[row.requestId]?.webDelivery==='dispatching')h.state.sourceValid=false;
  };
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_WEB_TASK_SOURCE'});
  const saved=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
  assert.equal(saved.webDelivery,'dispatching');assert.equal(saved.webObservation.delivery,'unknown');
  assert.equal(saved.webObservation.error.code,'E_WEB_TASK_SOURCE');
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
  h.state.sourceValid=true;
  await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
});
test('new offscreen document can only read the original unknown run, never take it over',async()=>{
  const h=fixture();await h.approve();const row=await h.admit();await h.ready(row);await h.handle('claim');
  h.restart({newOwner:true});
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].receipt.execution,'unknown');assert.equal(await h.handle('claim'),null);
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_WEB_TASK_OWNER'});
});
test('navigation blocks delivery to a different chat',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();h.state.sourceValid=false;
  await assert.rejects(h.handle('settle',{requestId:row.requestId}));
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
});
test('background cancellation revokes only the original request before requesting its Host stop',async()=>{
  const h=fixture();await h.approve();const row=await h.admit();await h.ready(row);
  const result=await h.ingress.handleChatGPT({protocol:CHATGPT_BRIDGE_PROTOCOL,kind:'background-stop',requestId:row.requestId},h.page);
  assert.equal(result.cancelled,true);assert.equal(await h.handle('claim'),null);
  assert.equal(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].status,'revoked');
});
test('final delivery permission and history respect original Authority result denial',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  await h.ledger.markWebTaskDelivery(row.requestId,'dispatching');h.state.resultDenied=true;
  await assert.rejects(h.ingress.handleChatGPT({kind:'check-delivery',requestId:row.requestId,mode:'auto',
    runId:'run-one',resultId:'result-one'},h.page),{code:'E_BRIDGE_DURABLE'});
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].receipt.value,undefined);assert.notEqual(history[0].receipt.persistence,'verified');
});
test('request cancellation before or during final verification forbids result delivery',async()=>{
  for(const during of [false,true]){
    const h=fixture();await h.approve();const row=await h.completed();
    await h.ledger.markWebTaskDelivery(row.requestId,'dispatching');
    const revoke=()=>h.ledger.revokeRequest({source,requestId:row.requestId});
    if(during)h.state.onSnapshot=revoke;else await revoke();
    await assert.rejects(h.ingress.handleChatGPT({kind:'check-delivery',requestId:row.requestId,mode:'auto',
      runId:'run-one',resultId:'result-one'},h.page),{code:'E_BRIDGE_REVOKED'});
  }
});
test('two independent requests under one grant keep two original identities and single deliveries',async()=>{
  const h=fixture();await h.approve();
  const first=await h.completed();await h.handle('settle',{requestId:first.requestId});
  await assert.rejects(h.admit(),{code:'E_BRIDGE_REPLAY'});
  const second=await h.completed('second-candidate','run-two','result-two');
  await h.handle('settle',{requestId:second.requestId});await h.handle('reconcile');
  assert.notEqual(first.requestId,second.requestId);assert.equal(h.runs.length,2);
  assert.deepEqual(h.sent.filter(row=>row.message.kind==='deliver').map(row=>[row.message.requestId,row.message.runId,row.message.resultId]),
    [[first.requestId,'run-one','result-one'],[second.requestId,'run-two','result-two']]);
});
test('lost execution ACK and SW restart reconcile the same durable Run without starting again',async()=>{
  const h=fixture();await h.approve();const row=await h.completed('fresh-candidate','run-one','result-one',{lostStartAck:true});
  h.restart();await h.handle('reconcile');await h.handle('reconcile');
  assert.equal(h.runs.length,1);assert.equal(await h.handle('claim'),null);
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  assert.equal((await h.handle('history',{source},h.panel))[0].requestId,row.requestId);
});
test('installation change after task validation but during the final ledger read fences delivery',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  await h.ledger.markWebTaskDelivery(row.requestId,'dispatching');
  h.state.onTaskVerified=()=>{h.state.onTaskVerified=null;h.state.onStorageRead=()=>{
    h.state.onStorageRead=null;h.state.taskEpoch++;};};
  await assert.rejects(h.ingress.handleChatGPT({kind:'check-delivery',requestId:row.requestId,mode:'auto',
    runId:'run-one',resultId:'result-one'},h.page),{code:'E_REVISION'});
});

test('trusted restarted history reads original legacy ledger without inventing execution or result correlation',async()=>{
  const h=fixture(),rows={},candidate={candidateId:'legacy-candidate',turnKey:'original-turn',answerKey:'original-answer',
    text:JSON.stringify({protocol:'webflow.task.intent.v1',candidateId:'legacy-candidate',taskId:scope.taskId,
      args:scope.args,targetUrl:scope.targetUrl})};
  const cases=[['prepared',false],['approved',false],['revoked',false],['consumed',false],['revoked',true],['prepared',true]];
  for(const [index,[status,consumed]] of cases.entries()){
    const requestId=`22222222-2222-4222-8222-${String(index+1).padStart(12,'0')}`;
    rows[requestId]={source:structuredClone(source),scope:structuredClone(scope),status,createdAt:100,
      ...(index===0?{candidate}:{}),...(consumed?{consumedAt:0}:{}),
      webObservation:{execution:'completed',persistence:'verified',release:'released',delivery:'confirmed',value:'UNTRUSTED_RESULT'},
      webDelivery:'delivered'};
    // Same request alone is not proof of the old host document or durable result.
    h.runs.push({tag:'controller-run',namespace:'tool:test-extension',requestId,state:'completed',
      retirementState:'released',runId:'unrelated-run',resultId:'unrelated-result'});
  }
  rows['33333333-3333-4333-8333-333333333333']={...structuredClone(rows[Object.keys(rows)[0]]),kind:'conversation-grant'};
  rows['44444444-4444-4444-8444-444444444444']={source,scope:{taskId:'invalid task'},status:'consumed'};
  rows['55555555-5555-4555-8555-555555555555']={source:{...source,documentId:''},scope,status:'consumed'};
  h.values[CHATGPT_BRIDGE_LEDGER_KEY]=structuredClone(rows);h.restart({newOwner:true});
  const before=structuredClone(h.values);
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history.length,cases.length);
  for(const [index,row] of history.entries()){
    const [status,consumed]=cases[index],unknown=consumed||status==='consumed';
    assert.equal(row.requestId,Object.keys(rows)[index]);assert.equal(row.status,status);
    assert.deepEqual(row.source,source);assert.deepEqual(row.scope,scope);
    assert.deepEqual(row.candidate,index===0?candidate:undefined);
    assert.deepEqual(row.receipt,{execution:unknown?'unknown':'not-started',release:unknown?'unknown':'not-started',
      delivery:unknown?'unknown':'not-sent',persistence:'not-confirmed',runId:null,resultId:null});
  }
  assert.deepEqual(await h.ledger.listWebTasks(),[]);
  assert.deepEqual(await h.ledger.listWebTasks({source}),[]);
  assert.equal(await h.ledger.inspectWebTask(Object.keys(rows)[0]),null);
  assert.deepEqual(await h.handle('history',{source:{...source,documentId:'another-document'}},h.panel),[]);
  await assert.rejects(h.handle('query',{requestId:Object.keys(rows)[0]},h.page),{code:'E_WEB_TASK_REQUEST'});
  assert.deepEqual(h.values,before);assert.equal(h.sent.length,0);assert.equal(h.state.ensures,0);
});

test('legacy history is denied to page, sandbox, runner and forged Side Panel before ledger reads',async()=>{
  const h=fixture();h.values[CHATGPT_BRIDGE_LEDGER_KEY]={
    '22222222-2222-4222-8222-222222222222':{source,scope,status:'consumed',consumedAt:1}};
  h.restart();const before=structuredClone(h.values);let reads=0;h.state.onStorageRead=()=>reads++;
  for(const sender of [h.page,h.owner,{...h.panel,url:'chrome-extension://test-extension/ui/tool.html?toolId=webflow'},
    {...h.panel,url:h.panel.url+'&toolId=webflow'},{...h.panel,id:'other-extension'}])
    await assert.rejects(h.handle('history',{source,includeLegacy:true},sender));
  assert.equal(reads,0);assert.deepEqual(h.values,before);assert.equal(h.sent.length,0);
});

for(const terminal of ['failed','stopped']){
  test(`${terminal} durable history survives restart without delivery or replay`,async()=>{
    const h=fixture();await h.approve();const row=await h.completed();
    h.runs[0].state=terminal;h.results[0].state=terminal;
    h.results[0].outcome={ok:false,error:{code:'E_TASK_TIMEOUT',message:'original timeout',details:'PRIVATE'},
      valueWire:encodeValue('PRIVATE')};
    await h.handle('settle',{requestId:row.requestId});h.restart({newOwner:true});
    const history=await h.handle('history',{source},h.panel),receipt=history[0].receipt;
    assert.equal(history[0].requestId,row.requestId);assert.equal(receipt.execution,terminal);
    assert.equal(receipt.persistence,'verified');assert.equal(receipt.release,'released');
    assert.deepEqual(receipt.error,{code:'E_TASK_TIMEOUT',message:'original timeout'});
    assert.equal(receipt.value,undefined);assert(!JSON.stringify(history).includes('PRIVATE'));
    await h.handle('reconcile');assert.equal(await h.handle('claim'),null);
    assert.equal(h.runs.length,1);assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
  });
}

test('terminal history rejects denied, ambiguous and mismatched durable Results',async()=>{
  const mutations=[h=>{h.state.resultDenied=true;},h=>{h.results.push(structuredClone(h.results[0]));},
    ...['runId','resultId','sourceKind','state'].map(key=>h=>{h.results[0][key]='other';}),
    ...['scriptId','revision','sourceHash'].map(key=>h=>{h.results[0].revision[key]='other';}),
    h=>{h.results[0].outcome.ok=true;},h=>{h.runs[0].contentHash='other';},
    h=>{h.runs[0].sourceKind='draft';}];
  for(const mutate of mutations){
    const h=fixture();await h.approve();await h.completed();h.runs[0].state='failed';h.results[0].state='failed';
    h.results[0].outcome={ok:false,error:{code:'E_PRIVATE',message:'PRIVATE'},valueWire:encodeValue('PRIVATE')};
    mutate(h);h.restart();const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
    assert.notEqual(receipt.persistence,'verified');assert.equal(receipt.value,undefined);
    assert(!JSON.stringify(receipt).includes('PRIVATE'));
  }
});

test('history denies durable data after original auto grant or request revocation',async()=>{
  for(const terminal of ['completed','failed','stopped'])for(const revoke of ['grant','request']){
    const h=fixture();await h.approve();const row=await h.completed();
    h.runs[0].state=terminal;h.results[0].state=terminal;
    if(terminal!=='completed')h.results[0].outcome={ok:false,error:{code:'E_PRIVATE',message:'PRIVATE'}};
    if(revoke==='grant')await h.ledger.revokeAuto(scope.taskId);
    else await h.ledger.revokeRequest({source,requestId:row.requestId});
    h.restart();const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
    assert.notEqual(receipt.persistence,'verified');assert.equal(receipt.value,undefined);
    assert(!JSON.stringify(receipt).includes('PRIVATE'));
  }
});

test('history fences revocation during snapshot and final asynchronous ledger reads',async()=>{
  for(const phase of ['snapshot','final-read'])for(const revoke of ['grant','request','installation']){
    const h=fixture();await h.approve();const row=await h.completed();
    const deny=()=>revoke==='grant'?h.ledger.revokeAuto(scope.taskId):revoke==='request'?
      h.ledger.revokeRequest({source,requestId:row.requestId}):h.state.taskEpoch++;
    h.state.onSnapshot=async()=>{
      h.state.onSnapshot=null;
      if(phase==='snapshot')await deny();
      else h.state.onStorageRead=()=>{h.state.onStorageRead=null;void deny();};
    };
    const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
    assert.notEqual(receipt.persistence,'verified',`${phase}/${revoke}`);assert.equal(receipt.value,undefined);
  }
});

test('request revocation inside the last history ledger read denies durable disclosure',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.onSnapshot=()=>{
    h.state.onSnapshot=null;let reads=0;
    h.state.onStorageRead=()=>{
      // Post-snapshot settings, assertConsumed row, its settings, final row.
      if(++reads===4){h.state.onStorageRead=null;void h.ledger.revokeRequest({source,requestId:row.requestId});}
    };
  };
  const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.notEqual(receipt.persistence,'verified');assert.equal(receipt.value,undefined);
});


test('terminal diagnostics are bounded and history never trusts cached errors',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.runs[0].state='failed';h.results[0].state='failed';
  h.results[0].outcome={ok:false,error:{code:'C'.repeat(200),message:'M'.repeat(3000),private:'PRIVATE'}};
  const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(receipt.error.code.length,128);assert.equal(receipt.error.message.length,2048);
  assert.deepEqual(Object.keys(receipt.error).sort(),['code','message']);
  await h.ledger.recordWebTaskObservation(row.requestId,{persistence:'verified',error:{code:'E_PRIVATE',message:'PRIVATE'}});
  h.state.resultDenied=true;
  const denied=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(denied.persistence,'not-available');assert(!JSON.stringify(denied).includes('PRIVATE'));
});

test('revocation while another history row is pending also removes an earlier row result',async()=>{
  const h=fixture();await h.approve();const first=await h.completed('first-candidate','run-first','result-first');
  await h.completed('second-candidate','run-second','result-second');
  let reads=0;
  h.state.onSnapshot=async()=>{
    if(++reads!==2)return;
    // Let the first row finish all its asynchronous checks before revoking it.
    await new Promise(setImmediate);
    await h.ledger.revokeRequest({source,requestId:first.requestId});
  };
  const history=await h.handle('history',{source},h.panel);
  const earlier=history.find(item=>item.requestId===first.requestId).receipt;
  assert.notEqual(earlier.persistence,'verified');assert.equal(earlier.value,undefined);
});

test('foreground activation reservation is a durable one-use marker across worker restart',async()=>{
  const h=fixture();await h.approve();
  const row=await h.completed('one-shot-view-source');
  const requestId=row.requestId,runId='edce411c-487a-41d4-9bea-c86736d44f86';
  const first=await h.ledger.reserveWebTaskActivation({requestId,source,runId});
  assert.equal(first.reserved,true);
  assert.equal(h.values[CHATGPT_BRIDGE_LEDGER_KEY][requestId].webActivation.runId,runId);
  await assert.rejects(h.ledger.reserveWebTaskActivation({requestId,source,runId}),{code:'E_BRIDGE_REPLAY'});
  h.restart();
  await assert.rejects(h.ledger.reserveWebTaskActivation({requestId,source,runId}),{code:'E_BRIDGE_REPLAY'});
});
