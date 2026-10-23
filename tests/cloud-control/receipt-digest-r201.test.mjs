import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonical} from '../../src/platform/protocol.js';
import {createCloudService} from '../../src/cloud-control/service.js';

const KV='frameworkKV',CONFIG='cloud:config',PREFIX='cloud:request:';
const namespace='tool:trusted-extension',taskId='task.alpha';
const host={namespace,principal:'extension-tool:trusted-extension',registrationId:'host-one',
  hostDocumentId:'doc-one',hostInstanceId:'host-instance'};
const runRef={runId:'run-one',resultId:'result-one',requestId:'cloud:assignment-one',
  sourceHash:'source-one',manifestHash:'manifest-one',grantId:'grant-one'};
const task={taskId,version:'1.0.0',manifestHash:'manifest-one',contentHash:'source-one',
  scriptId:'script-one',revision:1,generation:1,installationId:'install-one',
  manifest:{siteOrigins:['https://allowed.example'],permissions:[],
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}},
  resultAllowed:true};
const config={url:'https://provider.example',providerId:'provider-one',credential:'credential-one',
  executorId:'executor-one',namespace,enabled:true,grantId:'grant-one',claimId:'claim-one',
  pendingRequestId:null,tasks:[task]};
const baseRow={tag:'cloud-request-v1',namespace,requestId:runRef.requestId,runId:runRef.runId,
  runRef,grantId:'grant-one',createdAt:100,state:'permitted',
  assignment:{assignmentId:'assignment-one',executorId:'executor-one',claimId:'claim-one',
    jobId:'job-one',leaseUntil:60_000,target:{mode:'owned',url:'https://allowed.example/form'}},
  permit:{providerId:'provider-one',assignmentId:'assignment-one',permitId:'permit-one',
    runRef,leaseUntil:60_000},
  params:{},task};
const baseRun={tag:'controller-run',namespace,principal:host.principal,registrationId:host.registrationId,
  hostDocumentId:host.hostDocumentId,hostInstanceId:host.hostInstanceId,runId:runRef.runId,
  resultId:runRef.resultId,scriptId:'script-one',contentHash:'source-one',
  requestId:runRef.requestId,cloudRequestId:runRef.requestId,cloudRequestKey:PREFIX+runRef.requestId,
  state:'running',retirementState:'not-started',cancelSeq:0,ownerEpoch:1,runRevision:1,eventSeq:0,
  resultDeliveryRevoked:false,revision:{sourceHash:'source-one'}};
const baseResult={tag:'controller-result',namespace,runId:runRef.runId,resultId:runRef.resultId,
  revision:{sourceHash:'source-one'},state:'completed',outcome:{ok:true,valueWire:{type:'json',value:7}}};

const clone=value=>value===undefined?undefined:structuredClone(value);
const rowKey=row=>row.storageKey||PREFIX+row.requestId;
const errorCode=code=>error=>error?.code===code;

function memoryStorage(){
  const data=new Map();let transactions=0;
  const store=name=>{if(!data.has(name))data.set(name,new Map());return data.get(name);};
  const snapshot=()=>new Map([...data].map(([name,values])=>[name,new Map([...values].map(([key,value])=>[key,clone(value)]))]));
  const restore=snap=>{data.clear();for(const [name,values]of snap)data.set(name,values);};
  return {
    get transactions(){return transactions;},
    seed(name,key,value){store(name).set(key,clone(value));},
    value(name,key){return clone(store(name).get(key));},
    allValues(name){return [...store(name).values()].map(clone);},
    async transaction(stores,mode,fn){
      transactions++;
      const before=mode==='readwrite'?snapshot():null;
      const check=name=>assert.ok(stores.includes(name),`store ${name} was not declared`);
      const tx={
        get:async(name,key)=>{check(name);return clone(store(name).get(key));},
        put:async(name,value,key)=>{check(name);assert.equal(mode,'readwrite');store(name).set(key,clone(value));},
        delete:async(name,key)=>{check(name);assert.equal(mode,'readwrite');store(name).delete(key);},
        all:async name=>{check(name);return [...store(name).values()].map(clone);}
      };
      try{return await fn(tx);}catch(error){if(before)restore(before);throw error;}
    }
  };
}

function fixture({row=baseRow,run=baseRun,result=baseResult,fetcher,cfg=config}={}){
  const storage=memoryStorage();
  storage.seed(KV,CONFIG,cfg);
  storage.seed(KV,rowKey(row),row);
  storage.seed('runs',run.runId,run);
  storage.seed('runs','@slot',{tag:'slot',currentRunId:null});
  if(result)storage.seed('results',result.resultId,result);
  const api={runtime:{id:'trusted-extension'},permissions:{contains:async()=>true}};
  const service=createCloudService({storage,api,clock:{now:()=>1000},
    assertHost:async()=>host,
    currentHost:async()=>{},
    resolveTask:async()=>task,
    emitToHost:async()=>{},fetcher});
  return {storage,service};
}

const sha=body=>createHash('sha256').update(canonical(body)).digest('hex');

for(const visibility of ['full','status-only']){
  test(`${visibility} ACK matches canonical body digest and confirms only once`,async()=>{
    const uploads=[];
    const row={...baseRow,task:{...task,resultAllowed:visibility==='full'}};
    const run={...baseRun,state:'completed',retirementState:'released'};
    const result={...baseResult,outcome:{ok:true,valueWire:{type:'json',value:{z:'结果',a:7}}}};
    const {service,storage}=fixture({row,run,result,fetcher:async(url,options)=>{
      if(url.endsWith('/v1/reconcile'))return Response.json({providerId:config.providerId,
        assignments:[{assignmentId:row.assignment.assignmentId,runRef,leaseUntil:60_000}]});
      assert.ok(url.endsWith('/v1/receipt'));
      const body=JSON.parse(options.body);uploads.push(body);
      // Provider hashes canonical JSON, independent of object insertion order.
      const reordered=Object.fromEntries(Object.entries(body).reverse());
      assert.notEqual(sha(body),createHash('sha256').update(options.body).digest('hex'));
      return Response.json({receiptId:'original-receipt',digest:sha(reordered)});
    }});
    await service.reconcile();await service.reconcile();
    assert.equal(uploads.length,1);
    assert.equal(uploads[0].result.visibility,visibility);
    const saved=storage.value(KV,rowKey(row));
    assert.deepEqual(saved.receipt,{receiptId:'original-receipt',digest:sha(uploads[0])});
    assert.equal(saved.delivery.state,'confirmed');assert.equal(saved.state,'finished');
    assert.deepEqual(saved.runRef,runRef);
    assert.deepEqual(storage.value('runs',run.runId),run);
    assert.deepEqual(storage.value('results',result.resultId),result);
  });
}

const invalidAcks={
  'wrong digest':body=>({receiptId:'wrong-receipt',digest:'0'.repeat(64)}),
  'missing digest':body=>({receiptId:'wrong-receipt'}),
  'missing receiptId':body=>({digest:sha(body)}),
  'empty receiptId':body=>({receiptId:'',digest:sha(body)}),
  'malformed receipt':()=>[],
  'different Result':body=>({receiptId:'wrong-receipt',digest:sha({...body,result:{...body.result,state:'failed'}})}),
  'different Run':body=>({receiptId:'wrong-receipt',digest:sha({...body,runRef:{...body.runRef,runId:'other-run'}})}),
  'different receipt key':body=>({receiptId:'wrong-receipt',digest:sha({...body,receiptKey:'other-result'})}),
  'different pairing':body=>({receiptId:'wrong-receipt',digest:sha({...body,binding:{...body.binding,pairingId:'other-pair'}})})
};
for(const [label,ack]of Object.entries(invalidAcks)){
  test(`${label} stays pending and retries the same original body and identities`,async()=>{
    const pairing={providerId:config.providerId,executorId:config.executorId,pairingId:'pair-one',pairingGeneration:1};
    const assignment={...baseRow.assignment,...pairing,attemptEpoch:1};
    const identity={pairing,jobId:assignment.jobId,claimId:assignment.claimId,
      assignmentId:assignment.assignmentId,attemptEpoch:1};
    const row={...baseRow,assignment,identity};
    const run={...baseRun,state:'completed',retirementState:'released'};
    const uploads=[];
    const {service,storage}=fixture({row,run,cfg:{...config,...pairing},fetcher:async(url,options)=>{
      if(url.endsWith('/v1/reconcile'))return Response.json({...pairing,
        assignments:[{...assignment,runRef}]});
      assert.ok(url.endsWith('/v1/receipt'));
      const body=JSON.parse(options.body);uploads.push(body);
      return Response.json(uploads.length<=2?ack(body):{receiptId:'original-receipt',digest:sha(body)});
    }});
    for(let attempt=0;attempt<2;attempt++){
      await assert.rejects(service.reconcile(),errorCode('E_RECEIPT'));
      const saved=storage.value(KV,rowKey(row));
      assert.equal(saved.receipt??null,null);assert.equal(saved.delivery.state,'pending');
      assert.equal(saved.state,row.state);assert.deepEqual(saved.runRef,runRef);
      assert.equal(saved.delivery.receiptKey,runRef.resultId);
      assert.deepEqual(saved.identity,identity);
      assert.deepEqual(storage.value('runs',run.runId),run);
      assert.deepEqual(storage.value('results',baseResult.resultId),baseResult);
    }
    await service.reconcile();await service.reconcile();
    assert.equal(uploads.length,3);
    assert.deepEqual(uploads[0],uploads[1]);assert.deepEqual(uploads[1],uploads[2]);
    assert.deepEqual(uploads[0].binding,{...pairing,jobId:assignment.jobId,
      claimId:assignment.claimId,assignmentId:assignment.assignmentId,attemptEpoch:1});
    const saved=storage.value(KV,rowKey(row));
    assert.deepEqual(saved.receipt,{receiptId:'original-receipt',digest:sha(uploads[0])});
    assert.equal(saved.delivery.state,'confirmed');assert.equal(saved.state,'finished');
    assert.deepEqual(saved.runRef,runRef);assert.deepEqual(saved.identity,identity);
    assert.deepEqual(storage.value('runs',run.runId),run);
    assert.deepEqual(storage.value('results',baseResult.resultId),baseResult);
  });
}
