import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createMdRunRecord,applyMdRunEvent,nextMdRunAction,mdTaskInput} from '../src/md-run-contract.js';

const H='a'.repeat(64), MARKER='12345678-1234-4321-8234-123456789abc';
const sha=async text=>Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),
  x=>x.toString(16).padStart(2,'0')).join('');
const digest=bytes=>webcrypto.subtle.digest('SHA-256',bytes);
const workflow=(last=35)=>({format:'webflow-todo:v1',title:'计算接力',goal:'两个不同的普通 ChatGPT 聊天',
  tasks:[
    {id:'T01',title:'计算求和',line:4,fields:{'输入':'numbers: [17, 28, '+last+']',
      '任务':'计算总和与数量','产出':'artifacts/T01.json：只含 JSON','验收':'auto:sum-count-marker:v1'},
      acceptance:'auto:sum-count-marker:v1'},
    {id:'T02',title:'翻倍',line:14,fields:{'输入':'artifact: T01\nmultiplier: 2',
      '任务':'使用上游结果翻倍','产出':'artifacts/T02.json：只含 JSON','验收':'auto:doubled-marker:v1'},
      acceptance:'auto:doubled-marker:v1'}]});
const initial=(n=35)=>createMdRunRecord({runId:'run-unique-0001',workflowId:'workflow-unique-01',
  sourceUrl:'https://github.com/shopable-ai/opendesk-browser/blob/main/projects/webflow/examples/workflows/md-demo.md',
  sourceSha256:H,workflow:workflow(n),account:{accountId:'account-001',origin:'https://chatgpt.com',mode:'normal'},
  authorizationRef:'auth-scope-01',artifactScopeRef:'artifact-scope-01',marker:MARKER,createdAt:1000});
let clock=1000;
async function apply(run,type,taskId,extra={}){
  clock++;return applyMdRunEvent(run,{type,taskId,expectedRevision:run.revision,at:clock,...extra},{digest});
}
const uuids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
async function toReady(run,id,index){
  run=await apply(run,'claim',id,{claimRef:'claim-'+id+'-01'});
  run=await apply(run,'create-intent',id,{operationRef:'create-'+id+'-01'});
  assert.equal(nextMdRunAction(run).action,'QUERY_ORIGINAL_CREATE');
  run=await apply(run,'conversation-created',id,{operationRef:'create-'+id+'-01',conversationId:uuids[index],
    conversationUrl:'https://chatgpt.com/c/'+uuids[index],documentRef:'document-'+id+'-01',accountId:'account-001'});
  return apply(run,'listener-ready',id,{conversationId:uuids[index],documentRef:'document-'+id+'-01',accountId:'account-001'});
}
async function toReply(run,id,index,result){
  run=await apply(run,'send-intent',id,{operationRef:'send-'+id+'-01',authorizationRef:'auth-scope-01'});
  assert.equal(nextMdRunAction(run).action,'QUERY_ORIGINAL_SEND');
  run=await apply(run,'message-sent',id,{operationRef:'send-'+id+'-01',conversationId:uuids[index],
    userMessageRef:'user-'+id+'-01'});
  const text=JSON.stringify(result);
  run=await apply(run,'reply-complete',id,{conversationId:uuids[index],userMessageRef:'user-'+id+'-01',
    assistantMessageRef:'assistant-'+id+'-01',replyRef:'reply-'+id+'-01',text,contentSha256:await sha(text)});
  return run;
}
async function saved(run,id){
  run=await apply(run,'accept',id);
  run=await apply(run,'write-intent',id,{operationRef:'write-'+id+'-01',artifactRef:'artifact-'+id+'-01'});
  assert.equal(nextMdRunAction(run).action,run.paused?'PAUSED':'QUERY_ORIGINAL_WRITE');
  const step=run.steps[id==='T01'?0:1];
  run=await apply(run,'artifact-saved',id,{operationRef:'write-'+id+'-01',artifactRef:'artifact-'+id+'-01',
    storageVersion:'storage-'+id+'-v1',contentSha256:step.accepted.contentSha256});
  return run;
}
async function readback(run,id){
  const step=run.steps[id==='T01'?0:1];
  return apply(run,'artifact-readback',id,{artifactRef:step.artifactRef,storageVersion:step.storageVersion,
    contentSha256:step.saved.contentSha256,text:step.saved.text});
}
test('two serial ChatGPT identities and verified upstream JSON handoff',async()=>{
  clock=1000;let run=initial();assert.equal(nextMdRunAction(run).taskId,'T01');
  assert.throws(()=>mdTaskInput(run,'T02'),{code:'E_MD_DEPENDENCY'});
  run=await toReady(run,'T01',0);
  assert.deepEqual(mdTaskInput(run,'T01').numbers,[17,28,35]);
  run=await toReply(run,'T01',0,{sum:80,count:3,marker:MARKER,inputVersion:H});
  run=await saved(run,'T01');
  assert.equal(nextMdRunAction(run).action,'READBACK_ORIGINAL_ARTIFACT');
  await assert.rejects(apply(run,'claim','T02',{claimRef:'claim-T02-01'}),{code:'E_MD_DEPENDENCY'});
  run=await readback(run,'T01');
  const prompt=mdTaskInput(run,'T02');
  assert.match(prompt.upstreamArtifactJson,/"sum":80/);
  assert.equal(prompt.numbers,undefined);
  assert.ok(!prompt.upstreamArtifactJson.includes('[17,28,35]'));
  run=await toReady(run,'T02',1);
  run=await toReply(run,'T02',1,{doubled:160,marker:MARKER,inputVersion:H});
  run=await saved(run,'T02');run=await readback(run,'T02');
  assert.equal(nextMdRunAction(run).action,'COMPLETED');
  assert.notEqual(run.steps[0].conversation.conversationId,run.steps[1].conversation.conversationId);
  assert.ok(Object.isFrozen(run));
});
test('changing last number 35 to 36 changes expected output 81/162',async()=>{
  clock=1000;let run=initial(36);run=await toReady(run,'T01',0);
  run=await toReply(run,'T01',0,{sum:80,count:3,marker:MARKER,inputVersion:H});
  await assert.rejects(apply(run,'accept','T01'),{code:'E_MD_ACCEPTANCE'});
  clock=1000;run=initial(36);run=await toReady(run,'T01',0);
  run=await toReply(run,'T01',0,{sum:81,count:3,marker:MARKER,inputVersion:H});
  run=await readback(await saved(run,'T01'),'T01');
  run=await toReady(run,'T02',1);
  run=await toReply(run,'T02',1,{doubled:160,marker:MARKER,inputVersion:H});
  await assert.rejects(apply(run,'accept','T02'),{code:'E_MD_DEPENDENCY'});
  clock=1000;run=initial(36);run=await toReady(run,'T01',0);
  run=await toReply(run,'T01',0,{sum:81,count:3,marker:MARKER,inputVersion:H});
  run=await readback(await saved(run,'T01'),'T01');
  run=await toReady(run,'T02',1);
  run=await toReply(run,'T02',1,{doubled:162,marker:MARKER,inputVersion:H});
  run=await readback(await saved(run,'T02'),'T02');
  assert.equal(run.steps[1].readback.value.doubled,162);
});
test('duplicate start, stale event, ambiguous creation and unknown do not resend',async()=>{
  clock=1000;let run=initial();run=await apply(run,'claim','T01',{claimRef:'claim-T01-01'});
  await assert.rejects(apply(run,'claim','T01',{claimRef:'claim-T01-02'}),{code:'E_MD_RUN_STATE'});
  await assert.rejects(applyMdRunEvent(run,{type:'create-intent',taskId:'T01',expectedRevision:0,at:clock+1,
    operationRef:'create-T01-01'},{digest}),{code:'E_MD_RUN_STALE'});
  run=await apply(run,'create-intent','T01',{operationRef:'create-T01-01'});
  assert.equal(nextMdRunAction(run).action,'QUERY_ORIGINAL_CREATE');
  run=await apply(run,'unknown','T01',{code:'E_ORIGINAL_ACK_UNKNOWN'});
  assert.equal(nextMdRunAction(run).action,'HOLD_UNKNOWN');
  await assert.rejects(apply(run,'claim','T02',{claimRef:'claim-T02-01'}),{code:'E_MD_DEPENDENCY'});
});
test('pause blocks new business effects; an in-flight reply and save can settle',async()=>{
  clock=1000;let run=initial();run=await toReady(run,'T01',0);
  run=await apply(run,'send-intent','T01',{operationRef:'send-T01-01',authorizationRef:'auth-scope-01'});
  run=await apply(run,'pause',null);
  run=await apply(run,'message-sent','T01',{operationRef:'send-T01-01',conversationId:uuids[0],
    userMessageRef:'user-T01-01'});
  const text=JSON.stringify({sum:80,count:3,marker:MARKER,inputVersion:H});
  run=await apply(run,'reply-complete','T01',{conversationId:uuids[0],userMessageRef:'user-T01-01',
    assistantMessageRef:'assistant-T01-01',replyRef:'reply-T01-01',text,contentSha256:await sha(text)});
  run=await readback(await saved(run,'T01'),'T01');
  assert.equal(nextMdRunAction(run).action,'PAUSED');
  await assert.rejects(apply(run,'claim','T02',{claimRef:'claim-T02-01'}),{code:'E_MD_RUN_PAUSED'});
  run=await apply(run,'resume',null);
  assert.equal(nextMdRunAction(run).taskId,'T02');
});
test('readback mismatch, bad marker, bad account and bad reply digest fail closed',async()=>{
  clock=1000;let run=initial();run=await apply(run,'claim','T01',{claimRef:'claim-T01-01'});
  run=await apply(run,'create-intent','T01',{operationRef:'create-T01-01'});
  await assert.rejects(apply(run,'conversation-created','T01',{operationRef:'create-T01-01',conversationId:uuids[0],
    conversationUrl:'https://chatgpt.com/',documentRef:'document-T01-01',accountId:'account-001'}),{code:'E_MD_IDENTITY'});
  await assert.rejects(apply(run,'conversation-created','T01',{operationRef:'create-T01-01',conversationId:uuids[0],
    conversationUrl:'https://chatgpt.com/c/'+uuids[0],documentRef:'document-T01-01',accountId:'another-account'}),{code:'E_MD_IDENTITY'});
  clock=1000;run=await toReady(initial(),'T01',0);
  run=await apply(run,'send-intent','T01',{operationRef:'send-T01-01',authorizationRef:'auth-scope-01'});
  run=await apply(run,'message-sent','T01',{operationRef:'send-T01-01',conversationId:uuids[0],userMessageRef:'user-T01-01'});
  const text=JSON.stringify({sum:80,count:3,marker:MARKER,inputVersion:H});
  await assert.rejects(apply(run,'reply-complete','T01',{conversationId:uuids[0],userMessageRef:'user-T01-01',
    assistantMessageRef:'assistant-T01-01',replyRef:'reply-T01-01',text,contentSha256:'b'.repeat(64)}),{code:'E_MD_INTEGRITY'});
  run=await apply(run,'reply-complete','T01',{conversationId:uuids[0],userMessageRef:'user-T01-01',
    assistantMessageRef:'assistant-T01-01',replyRef:'reply-T01-01',text,contentSha256:await sha(text)});
  run=await saved(run,'T01');
  await assert.rejects(apply(run,'artifact-readback','T01',{artifactRef:'artifact-T01-01',
    storageVersion:'storage-T01-v1',contentSha256:run.steps[0].saved.contentSha256,text:'{"sum":79}'}),
    {code:'E_MD_READBACK'});
  assert.equal(nextMdRunAction(run).action,'READBACK_ORIGINAL_ARTIFACT');
});
test('source is frozen and cannot be changed by editing a later input',()=>{
  const wf=workflow(35),run=createMdRunRecord({runId:'run-unique-0001',workflowId:'workflow-unique-01',
    sourceUrl:'https://github.com/u/r/blob/main/demo.md',sourceSha256:H,workflow:wf,
    account:{accountId:'account-001',origin:'https://chatgpt.com',mode:'normal'},
    authorizationRef:'auth-scope-01',artifactScopeRef:'artifact-scope-01',marker:MARKER,createdAt:1000});
  wf.tasks[0].fields['输入']='numbers: [17, 28, 36]';
  assert.deepEqual(mdTaskInput(run,'T01').numbers,[17,28,35]);
  assert.equal(run.sourceSha256,H);
});
