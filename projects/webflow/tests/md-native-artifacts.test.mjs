import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {createMdRunRecord,applyMdRunEvent,nextMdRunAction} from '../src/md-run-contract.js';
import {createMdNativeArtifactAdapter} from '../trusted/md-native-artifacts.js';

const HASH='a'.repeat(64),MARKER='11111111-2222-4333-8444-555555555555';
const WORKSPACE='workspace-00000000-0000-4000-8000-000000000001';
const SHA=async x=>digestUtf8(x),digest=bytes=>webcrypto.subtle.digest('SHA-256',bytes);
const workflow=()=>({format:'webflow-todo:v1',goal:'只用真实文件结果在两个 ChatGPT 普通新对话中接力',
  title:'有文件读回的任务链',tasks:[
    {id:'T01',title:'求和',fields:{'输入':'numbers: [17,28,35]','任务':'计算 sum/count',
      '产出':'artifacts/T01.json：JSON','验收':'auto:sum-count-marker:v1'},acceptance:'auto:sum-count-marker:v1'},
    {id:'T02',title:'翻倍',fields:{'输入':'artifact: T01\nmultiplier: 2','任务':'读取 T01 完整 JSON 翻倍',
      '产出':'artifacts/T02.json：JSON','验收':'auto:doubled-marker:v1'},acceptance:'auto:doubled-marker:v1'}]});
function makeLedger(){
  let tick=1000;
  let run=createMdRunRecord({
    runId:'md-run-native-00001',workflowId:'workflow-native-00001',
    sourceUrl:'https://github.com/shopable-ai/opendesk-browser/blob/main/projects/webflow/examples/workflows/md-demo.md',
    sourceSha256:HASH,workflow:workflow(),account:{accountId:'account-0001',
      origin:'https://chatgpt.com',mode:'normal'},authorizationRef:'authorization-00001',
    artifactScopeRef:'artifact-authorization-00001',marker:MARKER,createdAt:tick});
  const get=async()=>run;
  const append=async (workflowId,event)=>{
    assert.equal(workflowId,run.workflowId);
    assert.equal(event.expectedRevision,run.revision);
    run=await applyMdRunEvent(run,event,{digest});
    return run;
  };
  const send=(type,taskId,fields={})=>{
    tick=Math.max(tick+1,run.updatedAt);
    return append(run.workflowId,{
      type,taskId,expectedRevision:run.revision,at:tick,...fields});
  };
  const prepareAnswer=async(taskId)=>{
    await send('claim',taskId,{claimRef:'claim-'+taskId+'-001'});
    await send('create-intent',taskId,{operationRef:'operation-'+taskId+'-001',
      authorizationRef:run.authorizationRef,installationId:'chatgpt-install-0001',generation:2,
      manifestHash:HASH,contentHash:HASH,promptSha256:HASH});
    await send('task-dispatched',taskId,{operationRef:'operation-'+taskId+'-001'});
    await send('task-admitted',taskId,{operationRef:'operation-'+taskId+'-001',
      taskRunId:'chatgpt-run-'+taskId+'-001'});
    const result=taskId==='T01'?{sum:80,count:3,marker:MARKER,inputVersion:HASH}:
      {doubled:160,marker:MARKER,inputVersion:HASH};
    const text=JSON.stringify(result),chatId=taskId==='T01'?
      '11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222';
    await send('reply-complete',taskId,{
      operationRef:'operation-'+taskId+'-001',taskRunId:'chatgpt-run-'+taskId+'-001',
      conversationId:chatId,conversationUrl:'https://chatgpt.com/c/'+chatId,
      documentRef:'document-'+taskId+'-001',accountId:run.account.accountId,
      userMessageRef:'user-message-'+taskId,assistantMessageRef:'assistant-message-'+taskId,
      replyRef:'controller-result-'+taskId,text,contentSha256:await SHA(text)});
    await send('accept',taskId);
  };
  return {get,append,send,prepareAnswer,run:()=>run};
}
function makeNative({modifyBeforeReadback=false,ackLost=false,revoked=false}={}){
  const files=new Map(),calls=[],account={enabled:true},scopeCalls=[];
  let writes=0,reads=0,workspaceAccess='read-write',leaseEpoch='lease-workspace-001',
      sessionId='native-session-001';
  const filePort={
    state:()=>({connected:account.enabled,devLeaseEpoch:1,sessionId,maxContentBytes:32768}),
    async request(method,params={},expected={}){
      calls.push({method,params,expectedRequestId:expected.requestId??null});
      if(method==='workspaces.list')return {workspaces:[{
        workspaceId:WORKSPACE,sourceId:'source-workflow-001',leaseEpoch,access:workspaceAccess}]};
      assert.equal(params.workspaceId,WORKSPACE);
      assert.equal(params.leaseEpoch,leaseEpoch);
      if(method==='files.read'){
        reads++;
        if(!files.has(params.path))throw Object.assign(new Error('missing'),{
          code:'E_FILES_NOT_FOUND',outcome:'FAILED_CONFIRMED'});
        let content=files.get(params.path);
        if(modifyBeforeReadback&&writes>0&&reads>=2)content=content+' ';
        return {workspaceId:WORKSPACE,path:params.path,content,
          sha256:await SHA(content),bytes:new TextEncoder().encode(content).byteLength};
      }
      assert.ok(['files.create','files.write'].includes(method));
      assert.equal(typeof expected.beforeDispatch,'function');
      expected.beforeDispatch();
      writes++;
      if(method==='files.create')assert.equal(files.has(params.path),false);
      if(method==='files.write')assert.equal(params.expectedSha256,await SHA(files.get(params.path)));
      files.set(params.path,params.content);
      if(ackLost)throw Object.assign(new Error('lost write ACK'),{
        code:'E_FILES_TIMEOUT',outcome:'OUTCOME_UNKNOWN'});
      return {workspaceId:WORKSPACE,path:params.path,sha256:await SHA(params.content),
        saved:true,...(method==='files.create'?{created:true}:{})};
    }
  };
  const assertScope=async args=>{scopeCalls.push(args.operation);return !revoked;};
  const assertScopeSync=()=>!revoked;
  return {filePort,files,calls,scopeCalls,assertScope,assertScopeSync,
    get writes(){return writes;},get reads(){return reads;},
    revoke(){revoked=true;},changeLease(){leaseEpoch='lease-workspace-002';},
    changeSession(){sessionId='native-session-002';},
    disable(){account.enabled=false;},readOnly(){workspaceAccess='read-only';}};
}
function adapter(l,native){
  let serial=0;
  return createMdNativeArtifactAdapter({ledger:l,files:native.filePort,
    assertScope:native.assertScope,assertScopeSync:native.assertScopeSync,
    clock:()=>2000,randomUUID:()=>{
      serial++;return '11111111-1111-4111-8111-'+String(serial).padStart(12,'0');
    }});
}
test('native one-shot T01 then T02 saves exact artifact and independently reads back',async()=>{
  const l=makeLedger(),n=makeNative(),a=adapter(l,n),wf=l.run().workflowId;
  await l.prepareAnswer('T01');
  const frozen=await a.prepare(wf,'T01',WORKSPACE);
  assert.equal(frozen.steps[0].phase,'WRITE_INTENT');
  assert.equal(nextMdRunAction(frozen).action,'DISPATCH_ORIGINAL_FILE_WRITE_ONCE');
  const committed=await a.dispatch(wf,'T01');
  assert.equal(committed.steps[0].phase,'COMPLETED');
  assert.equal(committed.steps[0].readback.value.sum,80);
  assert.equal(n.files.get('artifacts/T01.json'),committed.steps[0].readback.text);
  assert.equal(n.writes,1);
  await assert.rejects(a.dispatch(wf,'T01'),{code:'E_MD_RUN_STATE'});
  await l.prepareAnswer('T02');
  await a.prepare(wf,'T02',WORKSPACE);
  const final=await a.dispatch(wf,'T02');
  assert.equal(final.steps[1].readback.value.doubled,160);
  assert.equal(final.steps[1].readback.text,n.files.get('artifacts/T02.json'));
  assert.equal(n.writes,2);
  assert.equal(nextMdRunAction(final).action,'COMPLETED');
  assert.ok(n.calls.filter(x=>x.method==='files.read').length>=4);
  assert.equal(final.steps[0].writePlan.path,'artifacts/T01.json');
  assert.equal(final.steps[1].writePlan.path,'artifacts/T02.json');
  assert.ok(n.scopeCalls.includes('dispatch-write'));
});
test('a lost Native write ACK becomes UNKNOWN and matching bytes do not permit replay',async()=>{
  const l=makeLedger(),n=makeNative({ackLost:true}),a=adapter(l,n),wf=l.run().workflowId;
  await l.prepareAnswer('T01');await a.prepare(wf,'T01',WORKSPACE);
  await assert.rejects(a.dispatch(wf,'T01'),{code:'E_FILES_TIMEOUT'});
  const hold=l.run();assert.equal(hold.steps[0].phase,'UNKNOWN');
  assert.equal(nextMdRunAction(hold).action,'HOLD_UNKNOWN');
  assert.equal(n.writes,1);
  const observed=await a.inspectUnknown(wf,'T01');
  assert.equal(observed.matchesExpectedBytes,true);
  assert.equal(observed.originalWriteAcknowledged,false);
  assert.equal(observed.canResend,false);
  await assert.rejects(a.dispatch(wf,'T01'),{code:'E_MD_RUN_STATE'});
  assert.equal(n.writes,1);
  await assert.rejects(l.send('claim','T02',{claimRef:'claim-T02-001'}),{code:'E_MD_DEPENDENCY'});
});
test('revoked scope, changed Native lease and changed file baseline stop before dispatch',async()=>{
  for(const kind of ['revoke','changeLease','changeSession','changeBaseline']){
    const l=makeLedger(),n=makeNative(),a=adapter(l,n),wf=l.run().workflowId;
    await l.prepareAnswer('T01');await a.prepare(wf,'T01',WORKSPACE);
    if(kind==='revoke')n.revoke();
    if(kind==='changeLease')n.changeLease();
    if(kind==='changeSession')n.changeSession();
    if(kind==='changeBaseline')n.files.set('artifacts/T01.json','other content');
    await assert.rejects(a.dispatch(wf,'T01'),{code:
      kind==='revoke'?'E_MD_ARTIFACT_SCOPE':kind==='changeBaseline'?'E_MD_FILE_CONFLICT':'E_MD_NATIVE_SESSION'});
    assert.equal(n.writes,0,'no Native write may be posted for '+kind);
    assert.equal(l.run().steps[0].phase,'WRITE_INTENT');
  }
});
test('paused T01 reply may settle its Native write, but no T02 is claimed',async()=>{
  const l=makeLedger(),n=makeNative(),a=adapter(l,n),wf=l.run().workflowId;
  await l.prepareAnswer('T01');await l.send('pause',null);
  await a.prepare(wf,'T01',WORKSPACE);
  const r=await a.dispatch(wf,'T01');
  assert.equal(r.paused,true);assert.equal(r.steps[0].phase,'COMPLETED');
  assert.equal(nextMdRunAction(r).action,'PAUSED');
  await assert.rejects(l.send('claim','T02',{claimRef:'claim-T02-001'}),{code:'E_MD_RUN_PAUSED'});
});
test('real write receipt without independent matching readback never releases T02',async()=>{
  const l=makeLedger(),n=makeNative({modifyBeforeReadback:true}),a=adapter(l,n),wf=l.run().workflowId;
  await l.prepareAnswer('T01');await a.prepare(wf,'T01',WORKSPACE);
  await assert.rejects(a.dispatch(wf,'T01'),{code:'E_MD_READBACK'});
  assert.equal(l.run().steps[0].phase,'SAVED');
  assert.equal(n.writes,1);
  assert.equal(nextMdRunAction(l.run()).action,'READBACK_ORIGINAL_ARTIFACT');
  await assert.rejects(l.send('claim','T02',{claimRef:'claim-T02-001'}),{code:'E_MD_DEPENDENCY'});
});
