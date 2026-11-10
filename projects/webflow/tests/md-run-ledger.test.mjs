import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createMdTrustedRunLedger} from '../trusted/md-run-ledger.js';
import {nextMdRunAction} from '../src/md-run-contract.js';

// The fake serializes the same readwrite store as IndexedDB. Tests never
// claim to exercise native Chrome, the real original Host or file permissions.
function storageFixture(){
  const data=new Map();let chain=Promise.resolve(),writes=0;
  return {data,get writes(){return writes;},transaction(stores,mode,callback){
    assert.deepEqual(stores,['frameworkKV']);
    const run=async()=>{
      const before=structuredClone(data),tx={
        get:async(store,k)=>structuredClone(data.get(k)),
        put:async(store,value,k)=>{
          assert.equal(mode,'readwrite');writes++;data.set(k,structuredClone(value));}
      };
      try{return await callback(tx);}
      catch(e){data.clear();for(const [key,value] of before)data.set(key,value);throw e;}
    };
    const result=chain.then(run);chain=result.then(()=>{},()=>{});return result;
  }};
}
const HASH='a'.repeat(64),MARKER='11111111-2222-4333-8444-555555555555';
const workflow=()=>({format:'webflow-todo:v1',title:'求和翻倍',goal:'两个不同的普通 ChatGPT 对话接力',
  tasks:[
    {id:'T01',title:'求和',line:1,fields:{'输入':'numbers: [17,28,35]',
      '任务':'计算 sum 和 count','产出':'artifacts/T01.json：JSON 成果',
      '验收':'auto:sum-count-marker:v1'},acceptance:'auto:sum-count-marker:v1'},
    {id:'T02',title:'翻倍',line:2,fields:{'输入':'artifact: T01\nmultiplier: 2',
      '任务':'使用 T01 完整已读回 JSON 翻倍','产出':'artifacts/T02.json：JSON 成果',
      '验收':'auto:doubled-marker:v1'},acceptance:'auto:doubled-marker:v1'}]});
const input=(suffix='01')=>({runId:'run-md-'+suffix+'-00001',workflowId:'workflow-md-'+suffix+'-00001',
  sourceUrl:'https://github.com/shopable-ai/opendesk-browser/blob/main/projects/webflow/examples/workflows/md-demo.md',
  sourceSha256:HASH,workflow:workflow(),
  account:{accountId:'account-0001',origin:'https://chatgpt.com',mode:'normal'},
  authorizationRef:'auth-review-0001',artifactScopeRef:'artifact-review-0001',
  marker:MARKER,createdAt:1000});
function ledger(storage,owner=async()=>true){
  return createMdTrustedRunLedger({storage,namespace:'tool:webflow-01',assertOwner:owner,
    clock:()=>2000,randomUUID:()=>MARKER,digest:bytes=>webcrypto.subtle.digest('SHA-256',bytes)});
}

test('two simultaneous starts produce exactly one durable run and freeze its original source',async()=>{
  const storage=storageFixture(),first=ledger(storage),second=ledger(storage);
  const inputs=[input(),{...input(),runId:'run-md-new-00002',marker:'22222222-3333-4444-8555-666666666666'}];
  const results=await Promise.all(inputs.map((value,i)=>[first,second][i].startOrGet(value)));
  assert.deepEqual(results.map(x=>x.created).sort(),[false,true]);
  assert.equal(results[0].run.runId,results[1].run.runId);
  assert.equal((await ledger(storage).get(inputs[0].workflowId)).runId,results[0].run.runId);
  await assert.rejects(first.startOrGet({...input(),sourceSha256:'b'.repeat(64)}),{code:'E_MD_RUN_CONFLICT'});
  await assert.rejects(first.startOrGet({...input(),account:{...input().account,accountId:'account-0002'}}),{code:'E_MD_RUN_CONFLICT'});
  assert.equal(storage.data.size,1);
});
test('cross-window atomic claim happens once, including reload and restart',async()=>{
  const storage=storageFixture(),a=ledger(storage),b=ledger(storage);
  await a.startOrGet(input());
  const results=await Promise.all([a.claimNext(input().workflowId),b.claimNext(input().workflowId)]);
  assert.equal(results.filter(x=>x.claimed).length,1);
  const saved=await ledger(storage).get(input().workflowId);
  assert.equal(saved.steps[0].phase,'CLAIMED');
  assert.equal(nextMdRunAction(saved).action,'RECORD_CREATE_INTENT');
  const again=await ledger(storage).claimNext(input().workflowId);
  assert.equal(again.claimed,false);
  assert.equal(again.run.runId,saved.runId);
  assert.equal(again.run.steps[0].claimRef,saved.steps[0].claimRef);
});
test('revision CAS refuses stale concurrent events, preserves the sole winner',async()=>{
  const store=storageFixture(),a=ledger(store),b=ledger(store);
  await a.startOrGet(input());
  const e={type:'pause',taskId:null,expectedRevision:0,at:2000};
  const outcomes=await Promise.allSettled([a.append(input().workflowId,e),b.append(input().workflowId,e)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'E_MD_RUN_STALE');
  const saved=await a.get(input().workflowId);
  assert.equal(saved.revision,1);assert.equal(saved.paused,true);
  assert.equal((await a.claimNext(input().workflowId)).action,'PAUSED');
});
test('UNKNOWN and revocation retain the old persisted identity without a new claim',async()=>{
  const storage=storageFixture();let allowed=true;
  const a=ledger(storage,async()=>allowed);await a.startOrGet(input());
  const claimed=await a.claimNext(input().workflowId);
  await a.append(input().workflowId,{type:'create-intent',taskId:'T01',
    expectedRevision:claimed.run.revision,at:2001,operationRef:'create-op-0001'});
  await a.append(input().workflowId,{type:'unknown',taskId:'T01',
    expectedRevision:claimed.run.revision+1,at:2002,code:'E_EFFECT_UNKNOWN'});
  const before=await a.get(input().workflowId);
  assert.equal((await a.claimNext(input().workflowId)).action,'HOLD_UNKNOWN');
  allowed=false;
  await assert.rejects(a.claimNext(input().workflowId),{code:'E_MD_OWNER'});
  await assert.rejects(a.get(input().workflowId),{code:'E_MD_OWNER'});
  assert.equal((await ledger(storage).get(input().workflowId)).runId,before.runId);
});
test('a different explicit workflow ID starts an independent run without reusing completed identity',async()=>{
  const storage=storageFixture(),l=ledger(storage);
  await l.startOrGet(input('01'));
  const second=await l.startOrGet({...input('02'),sourceSha256:'b'.repeat(64)});
  assert.equal(second.created,true);
  assert.equal(storage.data.size,2);
  assert.notEqual((await l.get(input('01').workflowId)).runId,second.run.runId);
});
