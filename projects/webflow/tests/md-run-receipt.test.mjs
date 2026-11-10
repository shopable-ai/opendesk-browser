import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {createMdRunRecord,applyMdRunEvent,mdTaskPrompt} from '../src/md-run-contract.js';
import {readMdChatGPTReplyEvent,readMdOriginalController} from '../trusted/md-run-receipt.js';

const H='a'.repeat(64),MARKER='11111111-2222-4333-8444-555555555555';
const ID='11111111-2222-4333-8444-555555555555',REQ='original-operation-t01';
const wf={format:'webflow-todo:v1',title:'验证',goal:'ChatGPT 跨对话交接',tasks:[
  {id:'T01',title:'求和',fields:{'输入':'numbers: [17,28,35]','任务':'计算求和',
    '产出':'artifacts/T01.json：JSON','验收':'auto:sum-count-marker:v1'},acceptance:'auto:sum-count-marker:v1'},
  {id:'T02',title:'翻倍',fields:{'输入':'artifact: T01\nmultiplier: 2','任务':'翻倍',
    '产出':'artifacts/T02.json：JSON','验收':'auto:doubled-marker:v1'},acceptance:'auto:doubled-marker:v1'}]};
async function fixture(){
  const run=createMdRunRecord({runId:'workflow-run-001',workflowId:'workflow-md-001',
    sourceUrl:'https://github.com/shopable-ai/opendesk-browser/blob/main/projects/webflow/examples/workflows/md-demo.md',
    sourceSha256:H,workflow:wf,account:{accountId:'account-001',origin:'https://chatgpt.com',mode:'normal'},
    authorizationRef:'approval-001',artifactScopeRef:'artifacts-001',marker:MARKER,createdAt:1000});
  const claimed=await applyMdRunEvent(run,{type:'claim',taskId:'T01',claimRef:'claim-001',
    expectedRevision:run.revision,at:1001});
  const prompt=mdTaskPrompt(claimed,'T01');
  const intent=await applyMdRunEvent(claimed,{type:'create-intent',taskId:'T01',
    expectedRevision:claimed.revision,at:1002,operationRef:REQ,authorizationRef:'approval-001',
    installationId:'installation-002',generation:3,manifestHash:H,contentHash:H,
    promptSha256:await digestUtf8(prompt)});
  const sent=await applyMdRunEvent(intent,{type:'task-dispatched',taskId:'T01',
    expectedRevision:intent.revision,at:1003,operationRef:REQ});
  const reply=JSON.stringify({sum:80,count:3,marker:MARKER,inputVersion:H});
  const value={kind:'chatgpt.conversation.create.result',version:2,status:'reply-complete',
    send:true,messageConfirmed:true,readbackConfirmed:true,conversationId:ID,
    conversationUrl:'https://chatgpt.com/c/'+ID,userMessageRef:'user-message-01',
    assistantMessageRef:'assistant-msg-01',replyText:reply,
    sourceUrl:'https://chatgpt.com/',promptChars:prompt.length,observedAt:new Date().toISOString()};
  const original={run:{tag:'controller-run',runId:'real-controller-run-001',
    resultId:'real-controller-result-001',state:'completed',retirementState:'released',
    sourceKind:'saved',targetDisposition:'retain-on-success',requestId:REQ,
    taskInstallation:{taskId:'chatgpt.conversation.create',version:'0.2.0',
      manifestHash:H,installationId:'installation-002',generation:3},
    scriptId:'task:chatgpt.conversation.create:0.2.0',contentHash:H,
    revision:{sourceHash:H},identity:{runId:'real-controller-run-001'},
    target:{mode:'owned',tabId:11,frameId:0,
      documentId:'document-001',allowedOrigin:'https://chatgpt.com'},
    retainedTarget:{tabId:11,documentId:'document-001',origin:'https://chatgpt.com',
      url:'https://chatgpt.com/c/'+ID,observedAt:12345}},
    results:[{tag:'controller-result',runId:'real-controller-run-001',
      resultId:'real-controller-result-001',state:'completed',sourceKind:'saved',
      revision:{sourceHash:H},outcome:{ok:true,valueWire:encodeValue(value)}}],
    resultDeliveryDenied:[]};
  return {intent:sent,original,value,reply};
}
test('only a verified retired original Task result yields the exact reply-complete event',async()=>{
  const f=await fixture();let queried=0,accounts=0;
  const event=await readMdChatGPTReplyEvent({workflowRun:f.intent,taskId:'T01',clock:()=>2000,
    readOriginalRun:async query=>{queried++;assert.equal(query.requestId,REQ);return f.original;},
    verifyAccount:async ()=>{accounts++;return 'account-001';}});
  assert.equal(queried,1);assert.equal(accounts,2);
  assert.equal(event.type,'reply-complete');
  assert.equal(event.taskRunId,f.original.run.runId);
  assert.equal(event.conversationUrl,'https://chatgpt.com/c/'+ID);
  const next=await applyMdRunEvent(f.intent,event,
    {digest:bytes=>webcrypto.subtle.digest('SHA-256',bytes)});
  assert.equal(next.steps[0].reply.text,f.reply);
  const accepted=await applyMdRunEvent(next,{type:'accept',taskId:'T01',
    expectedRevision:next.revision,at:2001},
    {digest:bytes=>webcrypto.subtle.digest('SHA-256',bytes)});
  assert.equal(accepted.steps[0].accepted.value.sum,80);
});
test('lost submission acknowledgement can be reconciled but never resent',async()=>{
  const f=await fixture(),snap=structuredClone(f.original);
  snap.run.requestId=REQ;
  const event=await readMdChatGPTReplyEvent({workflowRun:f.intent,taskId:'T01',
    readOriginalRun:async()=>snap,verifyAccount:async()=> 'account-001'});
  assert.equal(event.taskRunId,snap.run.runId);
});
test('rejects mismatched run, pin, target, result, ownership and account without re-dispatch',async()=>{
  const cases=[
    x=>x.run.requestId='some-other-operation',
    x=>x.run.contentHash='b'.repeat(64),
    x=>x.run.taskInstallation.manifestHash='b'.repeat(64),
    x=>x.run.taskInstallation.generation=4,
    x=>x.run.state='running',
    x=>x.run.retirementState='retiring',
    x=>x.run.targetDisposition='close',
    x=>x.run.target.documentId='',
    x=>x.run.target.mode='borrowed',
    x=>x.run.retainedTarget.url='https://chatgpt.com/',
    x=>x.results[0].resultId='wrong-result-001',
    x=>x.results[0].outcome.ok=false,
    x=>x.results[0].outcome.valueWire=encodeValue({kind:'fake',version:2}),
    x=>x.results.push(structuredClone(x.results[0])),
    x=>x.resultDeliveryDenied.push(x.run.runId)
  ];
  for(const mutate of cases){
    const f=await fixture(),original=structuredClone(f.original);mutate(original);
    await assert.rejects(readMdChatGPTReplyEvent({workflowRun:f.intent,taskId:'T01',
      readOriginalRun:async()=>original,verifyAccount:async()=> 'account-001'}),
      {code:/E_MD_(ORIGINAL|TARGET|RESULT_FORMAT|IDENTITY)/});
  }
  const f=await fixture();
  await assert.rejects(readMdChatGPTReplyEvent({workflowRun:f.intent,taskId:'T01',
    readOriginalRun:async()=>f.original,verifyAccount:async()=> 'account-changed'}),
    {code:'E_MD_ACCOUNT'});
  await assert.rejects(readMdChatGPTReplyEvent({workflowRun:f.intent,taskId:'T01',
    readOriginalRun:async()=>f.original}),{code:'E_MD_OWNER'});
});
test('rejects forged Task return values despite a valid original result',async()=>{
  const cases=[
    v=>v.send=false,v=>v.readbackConfirmed=false,
    v=>v.promptChars--,
    v=>v.conversationUrl='https://chatgpt.com/',
    v=>v.userMessageRef=v.assistantMessageRef,
    v=>v.replyText='',
    v=>v.sourceUrl='https://example.org/'
  ];
  for(const mutate of cases){
    const f=await fixture(),original=structuredClone(f.original);
    mutate(f.value);
    original.results[0].outcome.valueWire=encodeValue(f.value);
    await assert.rejects(readMdChatGPTReplyEvent({workflowRun:f.intent,taskId:'T01',
      readOriginalRun:async()=>original,verifyAccount:async()=> 'account-001'}),
      {code:/E_MD_(RESULT_FORMAT|IDENTITY)/});
  }
});

test('original Controller requestId lookup is exact and never scans unrelated Result history',async()=>{
  const fixtureData=await fixture(),observed=[];
  const client={controller:{snapshotControllerRun:async query=>{
    observed.push(query);
    return structuredClone(fixtureData.original);
  }}};
  const args={client,requestId:REQ,installationId:'installation-002',generation:3};
  const fromLostAck=await readMdOriginalController(args);
  assert.equal(fromLostAck.run.requestId,REQ);
  assert.deepEqual(observed,[{requestId:REQ}]);
  const originalRunId=fromLostAck.run.runId;
  const second=await readMdOriginalController({...args,taskRunId:originalRunId});
  assert.equal(second.run.runId,originalRunId);
  assert.deepEqual(observed.at(-1),{runId:originalRunId});
  await assert.rejects(readMdOriginalController({...args,taskRunId:'another-run-001'}),
    {code:'E_MD_ORIGINAL_UNKNOWN'});
  const invalid={controller:{snapshotControllerRun:async()=>({
    ...fixtureData.original,run:{...fixtureData.original.run,requestId:'foreign-req-001'}
  })}};
  await assert.rejects(readMdOriginalController({...args,client:invalid}),
    {code:'E_MD_ORIGINAL_UNKNOWN'});
});
