import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY} from '../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {createChatGPTBackgroundAdapter} from '../../src/native-agent/chatgpt-background-adapter.js';

const source={tabId:9,documentId:'chat-document',url:'https://chatgpt.com/c/background-test'};
const site={id:'chatgpt',version:'1.0.0',origin:'https://chatgpt.com',adapter:'chatgpt',
  adapterVersion:'1.0.0',protocols:['webflow.task.intent.v1'],enabled:true};
const scope={taskId:'background.read',args:{query:'one'},targetUrl:'https://target.example/',sourceOrigin:site.origin,
  installation:{version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
    scriptId:'task:background.read:1.0.0',revision:1,installationId:'install-background',generation:1}};
function harness(){
  const data={};let counter=0,writes=0;
  const storage={get:async key=>({[key]:structuredClone(data[key])}),
    set:async value=>{writes++;Object.assign(data,structuredClone(value));}};
  const create=()=>createChatGPTBridgeTriggerLedger({storage,
    generateId:()=>`88888888-8888-4888-8888-${String(++counter).padStart(12,'0')}`});
  let ledger=create();
  const candidate=id=>({candidateId:id,turnKey:'turn:'+id,answerKey:'answer:'+id,text:JSON.stringify({
    protocol:'webflow.task.intent.v1',candidateId:id,taskId:scope.taskId,targetUrl:scope.targetUrl,args:scope.args})});
  return {get ledger(){return ledger;},data,get writes(){return writes;},restart(){ledger=create();},
    async approve(){await ledger.approveAuto(scope);await ledger.setAutoEnabled(true);},
    admit:(id,patch={})=>ledger.admitWebTask({source,site,candidate:candidate(id),...scope,...patch}),
    legacy:(id)=>ledger.admitAuto({source,candidate:candidate(id),...scope})};
}
const claim=ledger=>ledger.claimWebTask({documentId:'offscreen-document',verify:async()=>{}});
const submission=row=>({requestId:row.requestId,source:{kind:'saved',scriptId:scope.installation.scriptId,
  revision:1,contentHash:scope.installation.contentHash},paramsWire:encodeValue(scope.args),
  target:{mode:'owned',url:scope.targetUrl},expectedTaskGeneration:1,
  expectedTaskInstallationId:scope.installation.installationId});

test('fixed ChatGPT background admission spends each new candidate once in the original ledger',async()=>{
  const h=harness();await h.approve();
  for(const id of ['background-first','background-second']){
    const admitted=await h.admit(id);
    assert.equal(admitted.pendingApproval,false);
    assert.equal(admitted.persistentAuto,true);
    assert.deepEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId].site,site);
    assert.equal(await claim(h.ledger),null);
    await h.ledger.armWebTask(admitted.requestId,source);
    const claimed=await claim(h.ledger);
    assert.equal(claimed.requestId,admitted.requestId);
    assert.equal(claimed.status,'consumed');
    let submissions=0;
    await h.ledger.withControllerAdmission(submission(claimed),async()=>{submissions++;});
    await assert.rejects(h.ledger.withControllerAdmission(submission(claimed),async()=>{submissions++;}),
      {code:'E_BRIDGE_REPLAY'});
    assert.equal(submissions,1);
    assert.equal(await claim(h.ledger),null);
    await assert.rejects(h.admit(id),{code:'E_BRIDGE_REPLAY'});
  }
  assert.equal(Object.keys(h.data[CHATGPT_BRIDGE_LEDGER_KEY]).length,2);
});

test('ChatGPT rejects every changed fixed profile field and non-conversation sources without writing rows',async()=>{
  const h=harness();await h.approve();
  const patches=[{id:'other'},{version:'1.0.1'},{origin:'https://other.example'},{adapter:'generic'},
    {adapterVersion:'1.0.1'},{protocols:['opendesk.task.intent.v1']},
    {protocols:['webflow.task.intent.v1','opendesk.task.intent.v1']},{enabled:false},{extra:true}];
  for(const patch of patches)await assert.rejects(async()=>h.admit('tampered-profile',{site:{...site,...patch}}));
  for(const url of ['https://chatgpt.com/','https://chatgpt.com.evil.example/c/background-test',
    'https://chat.openai.com/c/background-test']){
    await assert.rejects(async()=>h.admit('invalid-source',{source:{...source,url}}));
  }
  await assert.rejects(async()=>h.admit('wrong-origin',{sourceOrigin:'https://other.example'}));
  assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY],undefined);
  const projectSource={...source,url:'https://chatgpt.com/g/g-p-example/c/project-chat'};
  const project=await h.admit('project-chat',{source:projectSource});
  await h.ledger.armWebTask(project.requestId,projectSource);
  assert.equal((await claim(h.ledger)).requestId,project.requestId);
});

test('allowPending retains an unauthorized new ChatGPT candidate without authorizing execution',async()=>{
  const h=harness();await h.ledger.setAutoEnabled(true);
  const pending=await h.admit('pending-candidate',{allowPending:true});
  assert.equal(pending.pendingApproval,true);
  assert.equal(pending.persistentAuto,true);
  const row=await h.ledger.inspectWebTask(pending.requestId);
  assert.equal(row.status,'prepared');assert.equal(row.pendingAuto,true);
  assert.equal(row.autoGrantId,undefined);
  assert.equal(await claim(h.ledger),null);
  let submissions=0;
  await assert.rejects(h.ledger.withControllerAdmission(submission(pending),async()=>{submissions++;}),
    {code:'E_BRIDGE_APPROVAL'});
  assert.equal(submissions,0);
  await assert.rejects(h.admit('pending-candidate',{allowPending:true}),{code:'E_BRIDGE_REPLAY'});
  await assert.rejects(h.admit('pending-not-opted-in'),{code:'E_WEBFLOW_AUTO_DENIED'});
  await h.ledger.setAutoEnabled(false);
  await assert.rejects(h.admit('disabled-pending',{allowPending:true}),{code:'E_WEBFLOW_AUTO_DENIED'});
});

test('generic sites still reject unapproved candidates even with allowPending',async()=>{
  const h=harness();await h.ledger.setAutoEnabled(true);
  await assert.rejects(h.admit('generic-no-pending',{allowPending:true,sourceOrigin:'https://crm.example',
    source:{...source,url:'https://crm.example/tasks'},
    site:{...site,id:'crm',origin:'https://crm.example',adapter:'generic'}}),{code:'E_WEBFLOW_AUTO_DENIED'});
  assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY],undefined);
});

test('observations reject invalid types, unbounded strings and nested errors without writing',async()=>{
  const h=harness();await h.approve();const admitted=await h.admit('bounded-observation');
  const before=structuredClone(h.data[CHATGPT_BRIDGE_LEDGER_KEY]);
  for(const observation of [null,[],{execution:{}},{persistence:42},{release:'x'.repeat(129)},
    {delivery:[]},{aiReplyObserved:'yes'},{runId:'x'.repeat(129)},{resultId:{}},
    {error:{code:'x'.repeat(129)}},{error:{message:'x'.repeat(2049)}},{error:{details:{data:'private'}}}]){
    await assert.rejects(async()=>h.ledger.recordWebTaskObservation(admitted.requestId,observation));
    assert.deepEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY],before);
  }
});

test('old no-site consumed rows remain unchanged and cannot be claimed or re-admitted',async()=>{
  const h=harness();await h.approve();const old=await h.legacy('legacy-consumed');
  await h.ledger.reserve({...old,mode:'auto',turnKey:old.candidate.turnKey,answerKey:old.candidate.answerKey});
  const before=structuredClone(h.data[CHATGPT_BRIDGE_LEDGER_KEY]);
  h.restart();assert.equal(await claim(h.ledger),null);
  assert.equal(await h.ledger.inspectWebTask(old.requestId),null);
  await assert.rejects(h.admit('legacy-consumed'),{code:'E_BRIDGE_REPLAY'});
  assert.deepEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY],before);
});

test('reconstructed ledger reconciles consumed and dispatching rows without rerunning or resending',async()=>{
  const h=harness();await h.approve();const consumed=await h.admit('restart-consumed');
  await h.ledger.armWebTask(consumed.requestId,source);await claim(h.ledger);
  const dispatching=await h.admit('restart-dispatching');
  await h.ledger.armWebTask(dispatching.requestId,source);const claimed=await claim(h.ledger);
  await h.ledger.withControllerAdmission(submission(claimed),async()=>{});
  await h.ledger.markWebTaskDelivery(dispatching.requestId,'dispatching');
  h.restart();assert.equal(await claim(h.ledger),null);
  await assert.rejects(h.ledger.markWebTaskDelivery(dispatching.requestId,'dispatching'),{code:'E_BRIDGE_REPLAY'});
  const before=h.writes,rows=await h.ledger.listWebTasks();
  assert.equal(h.writes,before);
  assert.deepEqual(rows.map(row=>row.requestId),[consumed.requestId,dispatching.requestId]);
  assert.equal(rows[0].status,'consumed');assert.equal(rows[1].webDelivery,'dispatching');
  assert.deepEqual(await h.ledger.listWebTasks({source:{...source,documentId:'other-document'}}),[]);
  assert.equal((await h.ledger.listWebTasks({source})).length,2);
  rows[0].status='approved';rows[0].site.enabled=false;rows[0].scope.args.query='changed';
  assert.equal((await h.ledger.inspectWebTask(consumed.requestId)).status,'consumed');
  assert.equal((await h.ledger.inspectWebTask(consumed.requestId)).site.enabled,true);
  assert.equal((await h.ledger.inspectWebTask(consumed.requestId)).scope.args.query,'one');
  await h.ledger.markWebTaskDelivery(dispatching.requestId,'delivered');
  await assert.rejects(h.ledger.markWebTaskDelivery(dispatching.requestId,'delivered'),{code:'E_BRIDGE_REPLAY'});
});

test('observations merge only allowed fields and never restore claims, approvals or delivery',async()=>{
  const h=harness();await h.approve();const admitted=await h.admit('observed-consumed');
  await h.ledger.armWebTask(admitted.requestId,source);
  const claimed=await claim(h.ledger);
  await h.ledger.withControllerAdmission(submission(claimed),async()=>{});
  await h.ledger.markWebTaskDelivery(admitted.requestId,'dispatching');
  await h.ledger.recordWebTaskObservation(admitted.requestId,{execution:'complete',persistence:'saved',
    release:'released',delivery:'unknown',aiReplyObserved:false,runId:'run-one',resultId:'result-one',
    error:{code:'ACK_UNKNOWN'},status:'approved',webDelivery:null,webReady:false,controllerSubmitted:false,autoGrantId:'fake'});
  await h.ledger.recordWebTaskObservation(admitted.requestId,{aiReplyObserved:true,error:null});
  h.restart();const row=await h.ledger.inspectWebTask(admitted.requestId);
  assert.deepEqual(row.webObservation,{execution:'complete',persistence:'saved',release:'released',
    delivery:'unknown',aiReplyObserved:true,runId:'run-one',resultId:'result-one',error:null});
  assert.equal(row.status,'consumed');assert.equal(row.webDelivery,'dispatching');assert.equal(row.controllerSubmitted,true);
  assert.equal(row.webReady,true);
  assert.equal(await claim(h.ledger),null);
  await assert.rejects(h.ledger.markWebTaskDelivery(admitted.requestId,'dispatching'),{code:'E_BRIDGE_REPLAY'});
  await assert.rejects(h.admit('observed-consumed'),{code:'E_BRIDGE_REPLAY'});
  const old=await h.legacy('legacy-observation');
  const before=structuredClone(h.data[CHATGPT_BRIDGE_LEDGER_KEY][old.requestId]);
  await assert.rejects(async()=>h.ledger.recordWebTaskObservation(old.requestId,{execution:'complete'}));
  assert.deepEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY][old.requestId],before);
  assert.ok(!(await h.ledger.listWebTasks()).some(row=>row.requestId===old.requestId));
});

test('observing a pending row cannot approve it and observation inputs remain detached',async()=>{
  const h=harness();await h.ledger.setAutoEnabled(true);
  const admitted=await h.admit('observed-pending',{allowPending:true});
  const observation={execution:'complete',error:{code:'original'},status:'approved',pendingAuto:false,webReady:true};
  await h.ledger.recordWebTaskObservation(admitted.requestId,observation);
  observation.error.code='mutated';
  const row=await h.ledger.inspectWebTask(admitted.requestId);
  assert.deepEqual(row.webObservation,{execution:'complete',error:{code:'original'}});
  assert.equal(row.status,'prepared');assert.equal(row.pendingAuto,true);
  assert.equal(row.webReady,false);
  assert.equal(await claim(h.ledger),null);
  await assert.rejects(h.ledger.withControllerAdmission(submission(admitted),async()=>assert.fail('unauthorized submit')),
    {code:'E_BRIDGE_APPROVAL'});
});

test('ChatGPT ready ACK binds the exact source once and does not authorize or rearm consumed work',async()=>{
  const h=harness();await h.approve();const admitted=await h.admit('ready-approved');
  assert.equal((await h.ledger.inspectWebTask(admitted.requestId)).webReady,false);
  h.restart();assert.equal(await claim(h.ledger),null);
  for(const wrongSource of [{...source,tabId:10},{...source,documentId:'other'},
    {...source,url:'https://chatgpt.com/c/other'}])
    await assert.rejects(h.ledger.armWebTask(admitted.requestId,wrongSource));
  assert.equal(await claim(h.ledger),null);
  assert.deepEqual(await h.ledger.armWebTask(admitted.requestId,source),{requestId:admitted.requestId,ready:true});
  await assert.rejects(h.ledger.armWebTask(admitted.requestId,source));
  h.restart();assert.equal((await claim(h.ledger)).requestId,admitted.requestId);
  await assert.rejects(h.ledger.armWebTask(admitted.requestId,source));
  assert.equal(await claim(h.ledger),null);

  const pending=harness();await pending.ledger.setAutoEnabled(true);
  const prepared=await pending.admit('ready-pending',{allowPending:true});
  await pending.ledger.armWebTask(prepared.requestId,source);
  assert.equal((await pending.ledger.inspectWebTask(prepared.requestId)).status,'prepared');
  assert.equal(await claim(pending.ledger),null);
  await pending.ledger.approveAuto(scope,{pendingRequest:prepared});
  assert.equal((await claim(pending.ledger)).requestId,prepared.requestId);

  const legacy=await h.legacy('ready-legacy');
  await assert.rejects(h.ledger.armWebTask(legacy.requestId,source));
  const genericSource={...source,url:'https://crm.example/tasks'};
  const genericScope={...scope,sourceOrigin:'https://crm.example'};
  await h.ledger.approveAuto(genericScope);
  const generic=await h.admit('ready-generic',{...genericScope,source:genericSource,
    site:{...site,id:'crm',origin:'https://crm.example',adapter:'generic'}});
  await assert.rejects(async()=>h.ledger.armWebTask(generic.requestId,genericSource));
  assert.equal((await claim(h.ledger)).requestId,generic.requestId);
});

test('deterministic candidate and task mismatches retire the original row and claim the next candidate',async()=>{
  const failures={candidate:['E_BRIDGE_CONTEXT','E_CHAT_TURN','E_CHAT_REQUEST_MARKER','E_CHAT_ROUTE'],
    task:['E_BRIDGE_INSTALL','E_BRIDGE_UNSUPPORTED_SCOPE','E_BRIDGE_REVISION','E_BRIDGE_CONTEXT',
      'E_PERMISSION','E_REVISION','E_PARAMS','E_OWNER','E_HASH','E_BUILTIN_VERSION_UNAVAILABLE']};
  for(const [stage,codes] of Object.entries(failures))for(const code of codes){
    const h=harness();await h.approve();
    const stale=await h.admit('stale-candidate'),next=await h.admit('next-candidate');
    await h.ledger.armWebTask(stale.requestId,source);await h.ledger.armWebTask(next.requestId,source);
    const original=await h.ledger.inspectWebTask(stale.requestId);
    const error=Object.assign(Error('deterministic mismatch'),{code});let taskChecks=0;
    const adapter=createChatGPTBackgroundAdapter({
      verifyCandidate:async(_api,_source,candidate)=>{
        if(stage==='candidate'&&candidate.candidateId==='stale-candidate')throw error;
      },
      verifyTaskScope:async()=>{if(stage==='task'&&taskChecks++===0)throw error;return {};}
    });
    const claimed=await h.ledger.claimWebTask({documentId:'offscreen-document',verify:adapter.verify});
    assert.equal(claimed.requestId,next.requestId,`${stage}: ${code}`);
    assert.equal(claimed.status,'consumed');
    const retired=await h.ledger.inspectWebTask(stale.requestId);
    assert.deepEqual(retired,{...original,status:'revoked',webInvalidReason:code});
    h.restart();
    assert.equal(await h.ledger.claimWebTask({documentId:'new-offscreen',verify:adapter.verify}),null);
    await assert.rejects(h.admit('stale-candidate'),{code:'E_BRIDGE_REPLAY'});
    assert.equal((await h.ledger.inspectWebTask(stale.requestId)).status,'revoked');
  }
});

test('unknown candidate and task verification failures preserve both rows without marking or claiming',async()=>{
  for(const stage of ['candidate','task'])for(const code of [undefined,'E_STORAGE','E_NATIVE_UNKNOWN',
    'E_BUILTIN_RESOURCE','E_CHAT_FORMAT','E_CHAT_TARGET','E_CHAT_STREAMING','E_CHAT_PENDING']){
    const h=harness();await h.approve();
    const stale=await h.admit('unknown-candidate'),next=await h.admit('after-unknown');
    await h.ledger.armWebTask(stale.requestId,source);await h.ledger.armWebTask(next.requestId,source);
    const before=structuredClone(h.data[CHATGPT_BRIDGE_LEDGER_KEY]);
    const error=Object.assign(Error('verification outcome unknown'),code?{code}:{});
    const adapter=createChatGPTBackgroundAdapter({
      verifyCandidate:async()=>{if(stage==='candidate')throw error;},
      verifyTaskScope:async()=>{if(stage==='task')throw error;return {};}
    });
    for(let attempt=0;attempt<2;attempt++){
      await assert.rejects(h.ledger.claimWebTask({documentId:'offscreen-document',verify:adapter.verify}),
        actual=>actual===error&&actual.webTaskInvalid===undefined,`${stage}: ${code}`);
      assert.deepEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY],before);
      h.restart();
    }
  }
});
