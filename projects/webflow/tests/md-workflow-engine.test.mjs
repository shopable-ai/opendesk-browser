import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {createMdRunRecord,applyMdRunEvent,nextMdRunAction} from '../src/md-run-contract.js';
import {createMdWorkflowEngine} from '../trusted/md-workflow-engine.js';

const H='a'.repeat(64),MARK='11111111-2222-4333-8444-555555555555';
const RELEASE=BUILTIN_TASK_RELEASES.find(x=>x.taskId==='chatgpt.conversation.create');
const digest=bytes=>webcrypto.subtle.digest('SHA-256',bytes);
const chats=['11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'];
function make(n=35,{lost=false,wrongAccount=false,revoked=false,badReadback=false}={}){
  let tick=1000,run=createMdRunRecord({
    runId:'workflow-test-00001',workflowId:'workflow-test-00001',
    sourceUrl:'https://github.com/shopable-ai/opendesk-browser/blob/main/projects/webflow/examples/workflows/md-demo.md',
    sourceSha256:H,marker:MARK,createdAt:1000,authorizationRef:'review-00001',
    artifactScopeRef:'artifact-scope-00001',
    account:{accountId:'account-0001',origin:'https://chatgpt.com',mode:'normal'},
    workflow:{format:'webflow-todo:v1',title:'求和翻倍',goal:'真实 ChatGPT 双会话接力',
      tasks:[
        {id:'T01',title:'求和',fields:{'输入':'numbers: [17,28,'+n+']',
          '任务':'计算 sum 和 count','产出':'artifacts/T01.json：JSON',
          '验收':'auto:sum-count-marker:v1'},acceptance:'auto:sum-count-marker:v1'},
        {id:'T02',title:'翻倍',fields:{'输入':'artifact: T01\nmultiplier: 2',
          '任务':'把 T01 sum 翻倍','产出':'artifacts/T02.json：JSON',
          '验收':'auto:doubled-marker:v1'},acceptance:'auto:doubled-marker:v1'}]}});
  const submissions=[],results=new Map(),disk=new Map(),writes=[],reads=[];
  const ev=(type,taskId,extra={})=>({type,taskId,expectedRevision:run.revision,
    at:Math.max(++tick,run.updatedAt),...extra});
  const append=async(_,event)=>{run=await applyMdRunEvent(run,event,{digest});return run;};
  const ledger={get:async()=>run,append,
    async claimNext(){
      const action=nextMdRunAction(run);
      if(action.action!=='CLAIM_WITH_TRUSTED_LEDGER')return {claimed:false,action:action.action};
      await append(run.workflowId,ev('claim',action.taskId,{claimRef:'claim-'+action.taskId+'-01'}));
      return {claimed:true,action:'CLAIMED'};
    },
    async reconcileOriginalReply(_,taskId){
      const info=run.steps[taskId==='T01'?0:1],result=results.get(info.createOperationRef);
      if(!result)throw Object.assign(Error('Original run unavailable'),{code:'E_MD_ORIGINAL_UNKNOWN'});
      return append(run.workflowId,ev('reply-complete',taskId,{
        operationRef:info.createOperationRef,taskRunId:result.runId,
        conversationId:result.conversationId,
        conversationUrl:'https://chatgpt.com/c/'+result.conversationId,
        documentRef:'document-'+taskId+'-01',accountId:run.account.accountId,
        userMessageRef:'user-'+taskId+'-001',assistantMessageRef:'assistant-'+taskId+'-001',
        replyRef:'result-'+taskId+'-001',text:result.reply,
        contentSha256:await digestUtf8(result.reply)}));
    }
  };
  const client={request:async(method,args)=>{
    assert.equal(method,'resolveInstalledTask');
    assert.deepEqual(args,{taskId:'chatgpt.conversation.create'});
    return {taskId:RELEASE.taskId,version:RELEASE.version,
      scriptId:'task:chatgpt.conversation.create:0.2.0',revision:1,
      installationId:'installation-0001',generation:3,contentHash:RELEASE.sourceHash,
      manifestHash:RELEASE.manifestHash,manifest:{
        deadlineMs:120000,siteOrigins:['https://chatgpt.com'],
        targetDisposition:'retain-on-success',paramsSchema:{
          type:'object',required:['prompt'],additionalProperties:false,
          properties:{prompt:{type:'string',minLength:1,maxLength:3000},
            send:{type:'boolean',default:false}}}}};
  }};
  const host={currentRun:null,executionPending:false,completion:Promise.resolve(),
    async start(request){
      submissions.push(request);
      assert.equal(request.params.send,true);
      assert.equal(request.target.mode,'owned');
      assert.equal(request.target.url,'https://chatgpt.com/');
      const prompt=request.params.prompt,first=prompt.includes('任务 T01：');
      let output;
      if(first){
        const txt=prompt.split('输入：[')[1]?.split(']')[0];
        assert.ok(txt,'T01 must send its approved numbers');
        const numbers=txt.split(',').map(Number);
        output={sum:numbers.reduce((x,y)=>x+y,0),count:numbers.length,
          marker:MARK,inputVersion:H};
      }else{
        const txt=prompt.split('T01 完整 JSON 正文：\n')[1]?.split('\nmultiplier=')[0];
        assert.equal(txt,disk.get('artifacts/T01.json'));
        const multiplier=Number(prompt.split('\nmultiplier=')[1]?.split('\n')[0]);
        output={doubled:JSON.parse(txt).sum*multiplier,marker:MARK,inputVersion:H};
      }
      if(lost)throw Object.assign(Error('Lost controller ACK'),{code:'E_ACK_LOST'});
      const taskId=first?'T01':'T02';
      const runId='controller-run-'+taskId+'-001';
      results.set(request.requestId,{runId,conversationId:first?chats[0]:chats[1],
        reply:JSON.stringify(output)});
      return {runId};
    }};
  const artifacts={
    async prepare(_,taskId,workspaceId){
      assert.equal(workspaceId,'workspace-0001');
      return append(run.workflowId,ev('write-intent',taskId,{
        operationRef:'file-operation-'+taskId+'-001',
        artifactRef:'artifact-'+taskId+'-001',workspaceId,
        sourceId:'',leaseEpoch:'lease-00001',sessionId:'session-00001',
        path:'artifacts/'+taskId+'.json',writeMethod:'files.create',baseSha256:null}));
    },
    async dispatch(_,taskId){
      const original=run.steps[taskId==='T01'?0:1];
      await append(run.workflowId,ev('write-dispatched',taskId,
        {operationRef:original.writeOperationRef}));
      disk.set('artifacts/'+taskId+'.json',original.accepted.text);writes.push(taskId);
      return append(run.workflowId,ev('artifact-saved',taskId,{
        operationRef:original.writeOperationRef,artifactRef:original.artifactRef,
        storageVersion:'storage-'+taskId+'-0001',
        contentSha256:original.accepted.contentSha256}));
    },
    async readback(_,taskId){
      if(badReadback)throw Object.assign(Error('Readback mismatch'),{code:'E_MD_READBACK'});
      const original=run.steps[taskId==='T01'?0:1],text=disk.get('artifacts/'+taskId+'.json');
      reads.push(taskId);
      return append(run.workflowId,ev('artifact-readback',taskId,{
        artifactRef:original.artifactRef,storageVersion:original.storageVersion,
        contentSha256:await digestUtf8(text),text}));
    }
  };
  let serial=0;
  const engine=createMdWorkflowEngine({ledger,client,host,artifacts,
    verifyScope:async()=>!revoked,assertScopeSync:()=>!revoked,
    verifyAccount:async()=>wrongAccount?'another-account':run.account.accountId,
    workspaceFor:async()=> 'workspace-0001',clock:()=>Math.max(2000,run.updatedAt),
    randomUUID:()=> '11111111-1111-4111-8111-'+String(++serial).padStart(12,'0')});
  return {engine,run:()=>run,append,ev,submissions,disk,writes,reads};
}
test('one drive performs two serial Task submissions, two distinct chats, and two file readbacks',async()=>{
  const f=make(),result=await f.engine.drive(f.run().workflowId);
  assert.equal(result.action,'COMPLETED');
  assert.equal(f.submissions.length,2);
  assert.notEqual(f.submissions[0].requestId,f.submissions[1].requestId);
  assert.notEqual(f.run().steps[0].conversation.conversationId,f.run().steps[1].conversation.conversationId);
  assert.deepEqual(f.writes,['T01','T02']);assert.deepEqual(f.reads,['T01','T02']);
  assert.equal(JSON.parse(f.disk.get('artifacts/T01.json')).sum,80);
  assert.equal(JSON.parse(f.disk.get('artifacts/T02.json')).doubled,160);
  assert.ok(f.submissions[1].params.prompt.includes(f.run().steps[0].readback.text));
  assert.ok(!f.submissions[1].params.prompt.includes('[17,28,35]'));
  assert.equal((await f.engine.drive(f.run().workflowId)).action,'COMPLETED');
  assert.equal(f.submissions.length,2);
});
test('35→36 in explicit new input produces 81/162, not a hardcoded expected answer',async()=>{
  const f=make(36),result=await f.engine.drive(f.run().workflowId);
  assert.equal(result.action,'COMPLETED');
  assert.equal(f.run().steps[0].readback.value.sum,81);
  assert.equal(f.run().steps[1].readback.value.doubled,162);
  assert.ok(f.submissions[0].params.prompt.includes('[17,28,36]'));
  assert.ok(!f.submissions[1].params.prompt.includes('[17,28,36]'));
});
test('lost Controller ACK permanently fences a duplicate Send',async()=>{
  const f=make(35,{lost:true}),id=f.run().workflowId;
  assert.equal((await f.engine.drive(id)).action,'HOLD_ORIGINAL_QUERY_ONLY');
  assert.equal(f.run().steps[0].phase,'TASK_DISPATCHED');
  assert.equal(f.submissions.length,1);
  assert.equal((await f.engine.drive(id)).action,'HOLD_ORIGINAL_QUERY_ONLY');
  assert.equal(f.submissions.length,1);
});
test('rejected grant or account mismatch cannot claim or submit',async()=>{
  for(const config of [{revoked:true},{wrongAccount:true}]){
    const f=make(35,config),r=await f.engine.drive(f.run().workflowId);
    assert.equal(r.action,'HOLD_ERROR');
    assert.equal(f.submissions.length,0);
    assert.equal(f.run().steps[0].phase,'WAITING');
  }
});
test('pause blocks new work and resume retains original run identity',async()=>{
  const f=make(),id=f.run().workflowId;
  await f.append(id,f.ev('pause',null));
  assert.equal((await f.engine.drive(id)).action,'PAUSED');
  assert.equal(f.submissions.length,0);
  await f.append(id,f.ev('resume',null));
  assert.equal((await f.engine.drive(id)).action,'COMPLETED');
});
test('T01 failed readback blocks T02 even when an artifact was written',async()=>{
  const f=make(35,{badReadback:true}),r=await f.engine.drive(f.run().workflowId);
  assert.equal(r.action,'HOLD_ERROR');
  assert.equal(r.code,'E_MD_READBACK');
  assert.equal(f.run().steps[0].phase,'SAVED');
  assert.equal(f.run().steps[1].phase,'WAITING');
  assert.deepEqual(f.writes,['T01']);
  assert.equal(f.submissions.length,1);
});
