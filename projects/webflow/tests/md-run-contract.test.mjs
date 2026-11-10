import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createMdRunRecord,applyMdRunEvent,nextMdRunAction,mdTaskInput,mdTaskPrompt} from '../src/md-run-contract.js';

const H='a'.repeat(64),MARKER='12345678-1234-4321-8234-123456789abc';
const sha=async text=>Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),
  x=>x.toString(16).padStart(2,'0')).join('');
const digest=bytes=>webcrypto.subtle.digest('SHA-256',bytes);
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const workflow=(n=35)=>({format:'webflow-todo:v1',title:'计算接力',goal:'两个不同的普通 ChatGPT 聊天',
  tasks:[
    {id:'T01',title:'求和',fields:{'输入':'numbers: [17,28,'+n+']','任务':'计算总和与数量',
      '产出':'artifacts/T01.json：JSON 成果','验收':'auto:sum-count-marker:v1'},acceptance:'auto:sum-count-marker:v1'},
    {id:'T02',title:'翻倍',fields:{'输入':'artifact: T01\nmultiplier: 2',
      '任务':'使用 T01 已读回的完整 JSON 翻倍','产出':'artifacts/T02.json：JSON 成果',
      '验收':'auto:doubled-marker:v1'},acceptance:'auto:doubled-marker:v1'}]});
const initial=(n=35)=>createMdRunRecord({runId:'run-unique-0001',workflowId:'workflow-unique-01',
  sourceUrl:'https://github.com/shopable-ai/opendesk-browser/blob/main/projects/webflow/examples/workflows/md-demo.md',
  sourceSha256:H,workflow:workflow(n),account:{accountId:'account-001',origin:'https://chatgpt.com',mode:'normal'},
  authorizationRef:'auth-scope-01',artifactScopeRef:'artifact-scope-01',marker:MARKER,createdAt:1000});
let clock=1000;
async function apply(run,type,taskId,extra={}){
  clock++;return applyMdRunEvent(run,{type,taskId,expectedRevision:run.revision,at:clock,...extra},{digest});
}
async function claimed(run,id){
  run=await apply(run,'claim',id,{claimRef:'claim-'+id+'-01'});
  return apply(run,'create-intent',id,{operationRef:'original-'+id+'-01',authorizationRef:'auth-scope-01',
    installationId:'install-chatgpt-020',generation:2,manifestHash:H,contentHash:H,promptSha256:H});
}
async function admitted(run,id){
  run=await claimed(run,id);
  assert.equal(nextMdRunAction(run).action,'QUERY_ORIGINAL_TASK');
  return apply(run,'task-admitted',id,{operationRef:'original-'+id+'-01',taskRunId:'task-run-'+id+'-01'});
}
async function replied(run,id,index,result){
  const text=JSON.stringify(result);
  return apply(run,'reply-complete',id,{
    operationRef:'original-'+id+'-01',taskRunId:'task-run-'+id+'-01',
    conversationId:ids[index],conversationUrl:'https://chatgpt.com/c/'+ids[index],
    documentRef:'document-'+id+'-01',accountId:'account-001',
    userMessageRef:'user-'+id+'-01',assistantMessageRef:'assistant-'+id+'-01',
    replyRef:'result-'+id+'-01',text,contentSha256:await sha(text)});
}
async function saved(run,id){
  run=await apply(run,'accept',id);
  run=await apply(run,'write-intent',id,{operationRef:'write-'+id+'-01',artifactRef:'artifact-'+id+'-01'});
  const s=run.steps[id==='T01'?0:1];
  return apply(run,'artifact-saved',id,{operationRef:'write-'+id+'-01',artifactRef:'artifact-'+id+'-01',
    storageVersion:'storage-'+id+'-v1',contentSha256:s.accepted.contentSha256});
}
async function readback(run,id){
  const s=run.steps[id==='T01'?0:1];
  return apply(run,'artifact-readback',id,{artifactRef:s.artifactRef,storageVersion:s.storageVersion,
    contentSha256:s.saved.contentSha256,text:s.saved.text});
}
test('two serial real-identity slots, readback before T02, and no answer leakage',async()=>{
  clock=1000;let run=initial();
  assert.throws(()=>mdTaskInput(run,'T02'),{code:'E_MD_DEPENDENCY'});
  run=await admitted(run,'T01');
  assert.match(mdTaskPrompt(run,'T01'),/17,28,35/);
  assert.doesNotMatch(mdTaskPrompt(run,'T01'),/sum=80|答案.?80/);
  run=await replied(run,'T01',0,{sum:80,count:3,marker:MARKER,inputVersion:H});
  run=await saved(run,'T01');
  await assert.rejects(apply(run,'claim','T02',{claimRef:'claim-T02-01'}),{code:'E_MD_DEPENDENCY'});
  run=await readback(run,'T01');
  assert.equal(nextMdRunAction(run).taskId,'T02');
  const prompt=mdTaskPrompt(run,'T02'),upstream=run.steps[0].readback.text;
  assert.ok(prompt.includes(upstream));assert.match(prompt,/multiplier=2/);
  assert.doesNotMatch(prompt,/\[17,28,35\]|doubled=160|答案.?160/);
  run=await admitted(run,'T02');
  run=await replied(run,'T02',1,{doubled:160,marker:MARKER,inputVersion:H});
  run=await readback(await saved(run,'T02'),'T02');
  assert.equal(nextMdRunAction(run).action,'COMPLETED');
  assert.notEqual(run.steps[0].conversation.conversationId,run.steps[1].conversation.conversationId);
  assert.ok(Object.isFrozen(run));
});
test('independent numeric variation rejects 80/160 and accepts 81/162',async()=>{
  clock=1000;let run=await admitted(initial(36),'T01');
  run=await replied(run,'T01',0,{sum:80,count:3,marker:MARKER,inputVersion:H});
  await assert.rejects(apply(run,'accept','T01'),{code:'E_MD_ACCEPTANCE'});
  clock=1000;run=await admitted(initial(36),'T01');
  run=await replied(run,'T01',0,{sum:81,count:3,marker:MARKER,inputVersion:H});
  run=await readback(await saved(run,'T01'),'T01');
  run=await admitted(run,'T02');
  run=await replied(run,'T02',1,{doubled:160,marker:MARKER,inputVersion:H});
  await assert.rejects(apply(run,'accept','T02'),{code:'E_MD_DEPENDENCY'});
  clock=1000;run=await admitted(initial(36),'T01');
  run=await replied(run,'T01',0,{sum:81,count:3,marker:MARKER,inputVersion:H});
  run=await readback(await saved(run,'T01'),'T01');
  run=await admitted(run,'T02');
  run=await replied(run,'T02',1,{doubled:162,marker:MARKER,inputVersion:H});
  run=await readback(await saved(run,'T02'),'T02');
  assert.equal(run.steps[1].readback.value.doubled,162);
});
test('duplicate, stale dispatch, lost ACK and UNKNOWN never create another operation',async()=>{
  clock=1000;let run=await claimed(initial(),'T01');
  await assert.rejects(apply(run,'claim','T01',{claimRef:'claim-T01-02'}),{code:'E_MD_RUN_STATE'});
  await assert.rejects(applyMdRunEvent(run,{type:'task-admitted',taskId:'T01',expectedRevision:0,
    at:clock+1,operationRef:'original-T01-01',taskRunId:'task-run-T01-01'},{digest}),
    {code:'E_MD_RUN_STALE'});
  // Original durable receipt may be discovered even when the admission ACK never arrived.
  run=await replied(run,'T01',0,{sum:80,count:3,marker:MARKER,inputVersion:H});
  assert.equal(run.steps[0].taskRunId,'task-run-T01-01');
  await assert.rejects(apply(run,'task-admitted','T01',{operationRef:'original-T01-01',
    taskRunId:'task-run-T01-01'}),{code:'E_MD_RUN_STATE'});
  clock=1000;run=await claimed(initial(),'T01');
  run=await apply(run,'unknown','T01',{code:'E_ORIGINAL_ACK_UNKNOWN'});
  assert.equal(nextMdRunAction(run).action,'HOLD_UNKNOWN');
  await assert.rejects(apply(run,'claim','T02',{claimRef:'claim-T02-01'}),{code:'E_MD_DEPENDENCY'});
});
test('pause prevents new dispatch but permits in-flight reply and file settlement',async()=>{
  clock=1000;let run=await admitted(initial(),'T01');
  run=await apply(run,'pause',null);
  run=await replied(run,'T01',0,{sum:80,count:3,marker:MARKER,inputVersion:H});
  run=await readback(await saved(run,'T01'),'T01');
  assert.equal(nextMdRunAction(run).action,'PAUSED');
  await assert.rejects(apply(run,'claim','T02',{claimRef:'claim-T02-01'}),{code:'E_MD_RUN_PAUSED'});
  run=await apply(run,'resume',null);
  assert.equal(nextMdRunAction(run).taskId,'T02');
  clock=1000;run=await apply(initial(),'pause',null);
  await assert.rejects(apply(run,'claim','T01',{claimRef:'claim-T01-01'}),{code:'E_MD_RUN_PAUSED'});
});
test('rejects forged conversation, account, task-run identity, digest and file readback',async()=>{
  clock=1000;let run=await claimed(initial(),'T01');
  const data={sum:80,count:3,marker:MARKER,inputVersion:H},text=JSON.stringify(data),hash=await sha(text);
  const e={operationRef:'original-T01-01',taskRunId:'task-run-T01-01',
    conversationId:ids[0],conversationUrl:'https://chatgpt.com/c/'+ids[0],
    documentRef:'document-T01-01',accountId:'account-001',userMessageRef:'user-T01-01',
    assistantMessageRef:'assistant-T01-01',replyRef:'result-T01-01',text,contentSha256:hash};
  for(const invalid of [
    {conversationUrl:'https://chatgpt.com/'},{accountId:'different-account'},
    {contentSha256:'b'.repeat(64)},{operationRef:'other-operation'},
    {userMessageRef:'assistant-T01-01'}]){
    await assert.rejects(apply(run,'reply-complete','T01',{...e,...invalid}),
      {code:/E_MD_(IDENTITY|INTEGRITY)/});
  }
  run=await apply(run,'task-admitted','T01',{operationRef:'original-T01-01',
    taskRunId:'task-run-T01-01'});
  await assert.rejects(apply(run,'reply-complete','T01',{...e,taskRunId:'different-run'}),
    {code:'E_MD_IDENTITY'});
  run=await apply(run,'reply-complete','T01',e);
  run=await saved(run,'T01');
  await assert.rejects(apply(run,'artifact-readback','T01',{artifactRef:'artifact-T01-01',
    storageVersion:'storage-T01-v1',contentSha256:run.steps[0].saved.contentSha256,
    text:'{"sum":79}'}),{code:'E_MD_READBACK'});
  assert.equal(nextMdRunAction(run).action,'READBACK_ORIGINAL_ARTIFACT');
});
test('rejects a second conversation reusing T01 identity',async()=>{
  clock=1000;let run=await admitted(initial(),'T01');
  run=await readback(await saved(await replied(run,'T01',0,
    {sum:80,count:3,marker:MARKER,inputVersion:H}),'T01'),'T01');
  run=await admitted(run,'T02');
  const text=JSON.stringify({doubled:160,marker:MARKER,inputVersion:H});
  await assert.rejects(apply(run,'reply-complete','T02',{
    operationRef:'original-T02-01',taskRunId:'task-run-T02-01',conversationId:ids[0],
    conversationUrl:'https://chatgpt.com/c/'+ids[0],documentRef:'document-T02-01',accountId:'account-001',
    userMessageRef:'user-T02-01',assistantMessageRef:'assistant-T02-01',
    replyRef:'result-T02-01',text,contentSha256:await sha(text)}),{code:'E_MD_IDENTITY'});
});
test('frozen source and scope cannot be mutated by later Markdown edits',()=>{
  const wf=workflow(),run=initial();wf.tasks[0].fields['输入']='numbers: [17,28,36]';
  const other=workflow(35),snap=createMdRunRecord({runId:'run-unique-0001',workflowId:'workflow-unique-01',
    sourceUrl:'https://github.com/u/r/blob/main/demo.md',sourceSha256:H,workflow:other,
    account:{accountId:'account-001',origin:'https://chatgpt.com',mode:'normal'},
    authorizationRef:'auth-scope-01',artifactScopeRef:'artifact-scope-01',marker:MARKER,createdAt:1000});
  other.tasks[0].fields['输入']='numbers: [17,28,36]';
  assert.deepEqual(mdTaskInput(snap,'T01').numbers,[17,28,35]);
  assert.equal(run.sourceSha256,H);
});

test('paused in-flight original request allows read-only reconciliation and settlement only',async()=>{
  clock=1000;let run=await admitted(initial(),'T01');
  run=await apply(run,'pause',null);
  assert.equal(nextMdRunAction(run).action,'QUERY_ORIGINAL_REPLY');
  run=await replied(run,'T01',0,{sum:80,count:3,marker:MARKER,inputVersion:H});
  assert.equal(nextMdRunAction(run).action,'VERIFY_REPLY');
  run=await saved(run,'T01');
  assert.equal(nextMdRunAction(run).action,'READBACK_ORIGINAL_ARTIFACT');
  run=await readback(run,'T01');
  assert.equal(nextMdRunAction(run).action,'PAUSED');
});
