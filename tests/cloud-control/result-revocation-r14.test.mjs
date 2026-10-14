import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudService} from '../../src/cloud-control/service.js';

const KV='frameworkKV',CONFIG='cloud:config',PREFIX='cloud:request:';
const namespace='tool:trusted-extension',taskId='task.alpha',otherTaskId='task.beta';
const host={namespace,principal:'extension-tool:trusted-extension',registrationId:'host-one',
  hostDocumentId:'doc-one',hostInstanceId:'host-instance'};
const sender={id:'trusted-extension',documentId:'doc-one',url:'chrome-extension://trusted-extension/ui/tool.html'};
const runRef={runId:'run-one',resultId:'result-one',requestId:'cloud:assignment-one',
  sourceHash:'source-one',manifestHash:'manifest-one',grantId:'grant-one'};
const task={taskId,version:'1.0.0',manifestHash:'manifest-one',contentHash:'source-one',
  scriptId:'script-one',revision:1,generation:1,installationId:'install-one',
  manifest:{siteOrigins:['https://allowed.example'],permissions:[],
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}},
  resultAllowed:true};
const otherTask={...task,taskId:otherTaskId,resultAllowed:true};
const config={url:'https://provider.example',providerId:'provider-one',credential:'credential-one',
  executorId:'executor-one',namespace,enabled:true,grantId:'grant-one',claimId:'claim-one',
  pendingRequestId:null,tasks:[task,otherTask]};
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
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};

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

function fixture({row=baseRow,run=baseRun,result=baseResult,fetcher}={}){
  const storage=memoryStorage(),emitted=[];
  storage.seed(KV,CONFIG,config);
  storage.seed(KV,rowKey(row),row);
  storage.seed('runs',run.runId,run);
  storage.seed('runs','@slot',{tag:'slot',currentRunId:null});
  if(result)storage.seed('results',result.resultId,result);
  const api={runtime:{id:'trusted-extension'},permissions:{contains:async()=>true}};
  const service=createCloudService({storage,api,clock:{now:()=>1000},
    assertHost:async()=>host,
    currentHost:async()=>{},
    resolveTask:async request=>request.taskId===taskId?task:otherTask,
    emitToHost:async(registrationId,event)=>emitted.push({registrationId,event}),
    fetcher:fetcher??(async(url,options)=>{
      if(url.endsWith('/v1/reconcile'))return Response.json({providerId:'provider-one',
        assignments:[{assignmentId:'assignment-one',runRef,leaseUntil:60_000}]});
      if(url.endsWith('/v1/receipt'))return Response.json({receiptId:'receipt-one',digest:'digest-one'});
      return Response.json({});
    })});
  return {storage,service,emitted};
}

test('running independent result revocation only tightens output delivery for the approved Task',async()=>{
  const {storage,service}=fixture();
  const receipt=await service.cloudRevokeResults({taskId},sender);
  assert.deepEqual(receipt,{revoked:true,taskId,resultAllowed:false,rowsChanged:1,runsChanged:1,receiptsPreserved:0});
  const c=storage.value(KV,CONFIG),row=storage.value(KV,PREFIX+runRef.requestId),run=storage.value('runs',runRef.runId);
  assert.equal(c.enabled,true);
  assert.equal(c.tasks.find(row=>row.taskId===taskId).resultAllowed,false);
  assert.equal(c.tasks.find(row=>row.taskId===otherTaskId).resultAllowed,true);
  assert.equal(row.task.resultAllowed,false);
  assert.equal(row.state,'permitted');
  assert.deepEqual(row.permit,baseRow.permit);
  assert.equal(run.resultDeliveryRevoked,true);
  assert.equal(run.state,'running');
  assert.equal(run.retirementState,'not-started');
});

test('revoking one Task preserves another approved Task receipt already in flight',async()=>{
  let receiptStarted,releaseReceipt,receiptSignal;
  const started=new Promise(resolve=>{receiptStarted=resolve;});
  const release=new Promise(resolve=>{releaseReceipt=resolve;});
  const fetcher=async(url,options)=>{
    if(url.endsWith('/v1/reconcile'))return Response.json({providerId:'provider-one',
      assignments:[{assignmentId:'assignment-one',runRef,leaseUntil:60_000}]});
    if(url.endsWith('/v1/receipt')){
      receiptSignal=options.signal;receiptStarted();await release;
      if(receiptSignal.aborted)throw receiptSignal.reason;
      return Response.json({receiptId:'other-task-receipt',digest:'other-task-digest'});
    }
    return Response.json({});
  };
  const row={...baseRow,task:otherTask,receipt:null,delivery:null};
  const run={...baseRun,state:'completed',retirementState:'released'};
  const {storage,service}=fixture({row,run,result:baseResult,fetcher});
  const pending=service.reconcile();await started;
  await service.cloudRevokeResults({taskId},sender);
  assert.equal(receiptSignal.aborted,false);
  releaseReceipt();await pending;
  assert.equal(storage.value(KV,rowKey(row)).receipt.receiptId,'other-task-receipt');
  assert.equal(storage.value('runs',run.runId).resultDeliveryRevoked,false);
  assert.deepEqual(storage.value('results',baseResult.resultId),baseResult);
  const c=storage.value(KV,CONFIG);
  assert.equal(c.tasks.find(t=>t.taskId===taskId).resultAllowed,false);
  assert.equal(c.tasks.find(t=>t.taskId===otherTaskId).resultAllowed,true);
});

test('an outstanding execution lease renewal remains valid across output revoke',async()=>{
  let renewalStarted,releaseRenewal;
  const started=new Promise(resolve=>{renewalStarted=resolve;});
  const release=new Promise(resolve=>{releaseRenewal=resolve;});
  const fetcher=async url=>{
    if(url.endsWith('/v1/reconcile')){
      return Response.json({providerId:'provider-one',assignments:[
        {assignmentId:'assignment-one',runRef,leaseUntil:60_000}]});
    }
    if(url.endsWith('/v1/renew')){renewalStarted();await release;return Response.json({leaseUntil:80_000});}
    return Response.json({});
  };
  const {storage,service}=fixture({fetcher});
  const pending=service.reconcile();await started;
  await service.cloudRevokeResults({taskId},sender);
  releaseRenewal();await pending;
  const row=storage.value(KV,PREFIX+runRef.requestId),run=storage.value('runs',runRef.runId);
  assert.equal(row.permit.leaseUntil,80_000);
  assert.equal(row.task.resultAllowed,false);
  assert.equal(run.state,'running');
  assert.equal(run.resultDeliveryRevoked,true);
  assert.equal(run.retirementState,'not-started');
});

test('revocation aborts an in-flight receipt and prevents async confirmation',async()=>{
  let receiptStarted,releaseReceipt;
  const started=new Promise(resolve=>{receiptStarted=resolve;});
  const release=new Promise(resolve=>{releaseReceipt=resolve;});
  let receiptSignal;
  const row={...baseRow,state:'permitted',receipt:null,delivery:null};
  const run={...baseRun,state:'completed',retirementState:'released'};
  const fetcher=async(url,options)=>{
    if(url.endsWith('/v1/reconcile'))return Response.json({providerId:'provider-one',
      assignments:[{assignmentId:'assignment-one',runRef,leaseUntil:60_000}]});
    if(url.endsWith('/v1/receipt')){
      receiptSignal=options.signal;receiptStarted();
      await release;
      if(receiptSignal.aborted)throw receiptSignal.reason;
      return Response.json({receiptId:'late-receipt',digest:'late-digest'});
    }
    return Response.json({});
  };
  const {storage,service}=fixture({row,run,result:baseResult,fetcher});
  const pending=service.reconcile().catch(error=>error);
  await started;
  await service.cloudRevokeResults({taskId},sender);
  assert.equal(receiptSignal.aborted,true);
  releaseReceipt();
  await pending;
  const storedRow=storage.value(KV,PREFIX+runRef.requestId),storedRun=storage.value('runs',runRef.runId);
  assert.equal(storedRow.receipt ?? null,null);
  assert.equal(storedRow.delivery.state,'aborted');
  assert.equal(storedRow.delivery.reason,'E_CLOUD_REVOKED');
  assert.equal(storedRow.task.resultAllowed,false);
  assert.equal(storedRun.resultDeliveryRevoked,true);
  assert.deepEqual(storage.value('results',runRef.resultId),baseResult);
});

test('settled remote receipt is preserved and not rewritten as failure',async()=>{
  const row={...baseRow,state:'finished',receipt:{receiptId:'already-remote',digest:'remote-digest'},
    delivery:{state:'confirmed',receiptKey:runRef.resultId,grantId:'grant-one',runRef}};
  const run={...baseRun,state:'completed',retirementState:'released'};
  const {storage,service}=fixture({row,run,result:baseResult});
  const receipt=await service.cloudRevokeResults({taskId},sender);
  const storedRow=storage.value(KV,PREFIX+runRef.requestId),storedRun=storage.value('runs',runRef.runId);
  assert.equal(receipt.receiptsPreserved,1);
  assert.equal(storedRow.state,'finished');
  assert.deepEqual(storedRow.receipt,row.receipt);
  assert.equal(storedRow.delivery.state,'confirmed');
  assert.equal(storedRow.reason,undefined);
  assert.equal(storedRun.state,'completed');
  assert.equal(storedRun.retirementState,'released');
  assert.equal(storedRun.resultDeliveryRevoked,true);
  assert.deepEqual(storage.value('results',runRef.resultId),baseResult);
});

test('invalid schema, unknown task and forged Host do not mutate durable rows',async()=>{
  {
    const {storage,service}=fixture();
    await assert.rejects(service.cloudRevokeResults({taskId,extra:true},sender),errorCode('E_SCHEMA'));
    assert.deepEqual(storage.value(KV,CONFIG),config);
  }
  {
    const {storage,service}=fixture();
    await assert.rejects(service.cloudRevokeResults({taskId:'missing-task'},sender),errorCode('E_TASK'));
    assert.deepEqual(storage.value(KV,CONFIG),config);
    assert.deepEqual(storage.value(KV,PREFIX+runRef.requestId),baseRow);
  }
  {
    const storage=memoryStorage();
    storage.seed(KV,CONFIG,config);storage.seed(KV,PREFIX+runRef.requestId,baseRow);storage.seed('runs',runRef.runId,baseRun);
    const service=createCloudService({storage,api:{runtime:{id:'trusted-extension'},permissions:{contains:async()=>true}},
      assertHost:async()=>{throw Object.assign(new Error('forged sender'),{code:'E_OWNER'});},
      currentHost:async()=>assert.fail('currentHost must not run for a rejected sender'),
      resolveTask:async()=>task,emitToHost:async()=>{},fetcher:async()=>Response.json({})});
    await assert.rejects(service.cloudRevokeResults({taskId},sender),errorCode('E_OWNER'));
    assert.equal(storage.transactions,0);
    assert.deepEqual(storage.value(KV,CONFIG),config);
    assert.deepEqual(storage.value(KV,PREFIX+runRef.requestId),baseRow);
  }
});

test('revocation between remote claim and local row persistence stores current output consent',async()=>{
  const gate=deferred(),assignmentId='assignment-delayed',requestId='cloud:'+assignmentId;
  let claimReached=false;
  const assignment={assignmentId,executorId:'executor-one',claimId:'claim-one',jobId:'job-delayed',
    leaseUntil:60_000,task:{taskId,version:task.version,manifestHash:task.manifestHash,sourceHash:task.contentHash},
    params:{},target:{mode:'owned',url:'https://allowed.example/form'}};
  const fetcher=async(url)=>{
    if(url.endsWith('/v1/claim')){claimReached=true;await gate.promise;return Response.json({assignment});}
    return Response.json({providerId:'provider-one',assignments:[]});
  };
  const storage=memoryStorage(),emitted=[];
  storage.seed(KV,CONFIG,config);storage.seed('runs','@slot',{tag:'slot',currentRunId:null});
  const service=createCloudService({storage,api:{runtime:{id:'trusted-extension'},permissions:{contains:async()=>true}},
    clock:{now:()=>1000},assertHost:async()=>host,currentHost:async()=>{},
    resolveTask:async request=>request.taskId===taskId?task:otherTask,
    emitToHost:async(registrationId,event)=>emitted.push({registrationId,event}),fetcher});
  service.connection('authenticated');service.setReconciled(true);
  const pending=service.cloudNext({},sender);
  while(!claimReached)await Promise.resolve();
  await service.cloudRevokeResults({taskId},sender);
  gate.resolve();
  assert.deepEqual(await pending,{requestId});
  const row=storage.allValues(KV).find(value=>value?.tag==='cloud-request-v1'&&value.requestId===requestId);
  const c=storage.value(KV,CONFIG);
  assert.equal(row.task.resultAllowed,false);
  assert.equal(c.tasks.find(row=>row.taskId===taskId).resultAllowed,false);
  assert.equal(row.runId,undefined);
  assert.equal(storage.value('runs','@slot').currentRunId,null);
});

test('active permit renewal survives output revocation for the same Task',async()=>{
  const row={...baseRow,state:'permitted',receipt:null,delivery:null,
    permit:{...baseRow.permit,leaseUntil:2_000},assignment:{...baseRow.assignment,leaseUntil:60_000}};
  const run={...baseRun,state:'running',retirementState:'not-started'};
  const calls=[];
  const fetcher=async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});
    if(url.endsWith('/v1/reconcile'))return Response.json({providerId:'provider-one',
      assignments:[{assignmentId:'assignment-one',runRef,leaseUntil:60_000,cancelled:false}]});
    if(url.endsWith('/v1/renew'))return Response.json({leaseUntil:90_000});
    return Response.json({});
  };
  const {storage,service}=fixture({row,run,result:baseResult,fetcher});
  await service.cloudRevokeResults({taskId},sender);
  await service.reconcile();
  const renewed=storage.value(KV,PREFIX+runRef.requestId);
  assert.equal(calls.some(call=>call.url.endsWith('/v1/renew')),true);
  assert.equal(renewed.permit.leaseUntil,90_000);
  assert.equal(renewed.task.resultAllowed,false);
  assert.equal(storage.value('runs',runRef.runId).resultDeliveryRevoked,true);
  assert.equal(storage.value('runs',runRef.runId).state,'running');
});

test('late receipt success that ignores AbortSignal is not confirmed after revoke',async()=>{
  let receiptStarted,releaseReceipt;
  const started=new Promise(resolve=>{receiptStarted=resolve;});
  const release=new Promise(resolve=>{releaseReceipt=resolve;});
  const row={...baseRow,state:'permitted',receipt:null,delivery:null};
  const run={...baseRun,state:'completed',retirementState:'released'};
  const fetcher=async(url)=>{
    if(url.endsWith('/v1/reconcile'))return Response.json({providerId:'provider-one',
      assignments:[{assignmentId:'assignment-one',runRef,leaseUntil:60_000}]});
    if(url.endsWith('/v1/receipt')){
      receiptStarted();await release;
      return Response.json({receiptId:'ignored-abort-receipt',digest:'ignored-abort-digest'});
    }
    return Response.json({});
  };
  const {storage,service}=fixture({row,run,result:baseResult,fetcher});
  const pending=service.reconcile();
  await started;
  await service.cloudRevokeResults({taskId},sender);
  releaseReceipt();
  await pending;
  const storedRow=storage.value(KV,PREFIX+runRef.requestId);
  assert.equal(storedRow.receipt ?? null,null);
  assert.equal(storedRow.delivery.state,'aborted');
  assert.equal(storedRow.state,'permitted');
  assert.deepEqual(storage.value('results',runRef.resultId),baseResult);
});

test('output revoke preserves remote run replay guard after reconcile',async()=>{
  const assignmentId='assignment-one';
  const fetcher=async(url)=>{
    if(url.endsWith('/v1/reconcile'))return Response.json({providerId:'provider-one',
      assignments:[{assignmentId,runRef,leaseUntil:60_000}]});
    if(url.endsWith('/v1/claim'))return Response.json({assignment:{assignmentId,executorId:'executor-one',
      claimId:'claim-one',jobId:'job-one',leaseUntil:60_000,
      task:{taskId,version:task.version,manifestHash:task.manifestHash,sourceHash:task.contentHash},
      params:{},target:{mode:'owned',url:'https://allowed.example/form'}}});
    return Response.json({});
  };
  const storage=memoryStorage();
  storage.seed(KV,CONFIG,config);storage.seed('runs','@slot',{tag:'slot',currentRunId:null});
  const service=createCloudService({storage,api:{runtime:{id:'trusted-extension'},permissions:{contains:async()=>true}},
    clock:{now:()=>1000},assertHost:async()=>host,currentHost:async()=>{},
    resolveTask:async request=>request.taskId===taskId?task:otherTask,
    emitToHost:async()=>{},fetcher});
  service.connection('authenticated');service.setReconciled(true);
  await service.reconcile();
  await service.cloudRevokeResults({taskId},sender);
  await assert.rejects(service.cloudNext({},sender),errorCode('E_RUN_REF'));
  assert.equal(storage.allValues(KV).filter(row=>row?.tag==='cloud-request-v1').length,0);
});
