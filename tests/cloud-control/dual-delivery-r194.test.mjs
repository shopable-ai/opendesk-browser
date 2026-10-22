import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';
import {createCloudConnection} from '../../src/cloud-control/connection.js';

const taskPackage=JSON.parse(await readFile(
  new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const pin={taskId:taskPackage.manifest.taskId,version:taskPackage.manifest.version,
  manifestHash:taskPackage.manifestHash,sourceHash:taskPackage.manifest.program.sourceHash};
const advertised=[{taskId:pin.taskId,manifestHash:pin.manifestHash,sourceHash:pin.sourceHash}];
const target={mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'};

async function providerFixture(t,{clock=()=>Date.now()}={}){
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-r194-'));
  let provider=await openProvider({directory,port:0,clock});
  const admin=JSON.parse(await readFile(provider.credentialFile,'utf8'));
  async function post(path,body={},credential){
    const response=await fetch('http://127.0.0.1:'+provider.port+path,{
      method:'POST',headers:{'Content-Type':'application/json',
        ...(credential?{Authorization:'Bearer '+credential}:{})},
      body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw Object.assign(Error(result.error?.message),{code:result.error?.code});
    return result;
  }
  t.after(async()=>{await provider.close();await rm(directory,{recursive:true,force:true});});
  const executorId=randomUUID();
  const pairing=await post('/v1/pair',{executorId,pairingCode:admin.pairingCode});
  const grantId=randomUUID();
  await post('/v1/capabilities',{grantId,tasks:[{...pin}]},pairing.credential);
  return {directory,admin,executorId,pairing,grantId,post,
    get port(){return provider.port;},
    async seed(requestKey='r194-one'){
      return post('/admin/seed',{requestKey,targetExecutorId:executorId,
        params:{},target},admin.adminToken);
    },
    async restart(){await provider.close();provider=await openProvider({directory,port:0,clock});}};
}

test('R19.4 HTTPS Pull claims a durable Job without WSS and preserves Claim/Receipt after restart',async t=>{
  const f=await providerFixture(t);
  const job=await f.seed();
  const claim={claimId:'r194-pull-claim',grantId:f.grantId,tasks:advertised};
  await assert.rejects(f.post('/v1/claim',claim,f.pairing.credential),{code:'E_CONNECTION'});
  await assert.rejects(f.post('/v1/pull-open',{grantId:f.grantId,tasks:[]},f.pairing.credential),
    {code:'E_GRANT'});
  const session=await f.post('/v1/pull-open',{grantId:f.grantId,tasks:[{...pin}]},f.pairing.credential);
  assert.equal(session.executorId,f.executorId);
  assert.equal(session.grantId,f.grantId);
  const assignment=(await f.post('/v1/claim',
    {...claim,pullSessionId:session.sessionId},f.pairing.credential)).assignment;
  assert.equal(assignment.jobId,job.jobId);
  assert.equal(assignment.executorId,f.executorId);
  assert.ok(assignment.leaseUntil>Date.now());
  assert.deepEqual((await f.post('/v1/claim',claim,f.pairing.credential)).assignment,assignment);
  const runRef={runId:randomUUID(),resultId:randomUUID(),
    requestId:'cloud:'+assignment.assignmentId,sourceHash:pin.sourceHash,
    manifestHash:pin.manifestHash,grantId:f.grantId};
  const permit=await f.post('/v1/admission',
    {assignmentId:assignment.assignmentId,runRef,resultAllowed:false},f.pairing.credential);
  assert.ok(permit.permitId);
  const receipt={assignmentId:assignment.assignmentId,receiptKey:runRef.resultId,runRef,
    result:{visibility:'status-only',state:'completed',retirementState:'released'}};
  const ack=await f.post('/v1/receipt',receipt,f.pairing.credential);
  assert.ok(ack.receiptId);
  await f.restart();
  assert.deepEqual((await f.post('/v1/claim',claim,f.pairing.credential)).assignment,assignment,
    'persisted Claim must not create a new Assignment on process restart');
  assert.deepEqual(await f.post('/v1/receipt',receipt,f.pairing.credential),ack,
    'receipt response loss must not replay Chrome effects');
  const snapshot=JSON.parse(await readFile(join(f.directory,'state.json'),'utf8'));
  assert.equal(Object.keys(snapshot.jobs).length,1);
  assert.equal(snapshot.jobs[job.jobId].runRef.runId,runRef.runId);
  assert.equal(snapshot.jobs[job.jobId].receipt.receiptId,ack.receiptId);
});

test('R19.4 Pull session rejects cross-Executor claims, expiry and stopped hosting',async t=>{
  let now=10_000;
  const f=await providerFixture(t,{clock:()=>now});
  await f.seed('r194-fenced');
  const session=await f.post('/v1/pull-open',
    {grantId:f.grantId,tasks:[{...pin}]},f.pairing.credential);
  const other=await f.post('/v1/pair',
    {executorId:randomUUID(),pairingCode:f.admin.pairingCode});
  const otherGrant=randomUUID();
  await f.post('/v1/capabilities',{grantId:otherGrant,tasks:[{...pin}]},other.credential);
  const cross={claimId:'cross',grantId:otherGrant,tasks:advertised,pullSessionId:session.sessionId};
  await assert.rejects(f.post('/v1/claim',cross,other.credential),{code:'E_PULL_SESSION'});
  const own={claimId:'expired',grantId:f.grantId,tasks:advertised,pullSessionId:session.sessionId};
  now=session.expiresAt+1;
  await assert.rejects(f.post('/v1/claim',own,f.pairing.credential),{code:'E_PULL_SESSION'});
  const renew=await f.post('/v1/pull-open',
    {grantId:f.grantId,tasks:[{...pin}]},f.pairing.credential);
  await f.post('/v1/suspend',{grantId:f.grantId},f.pairing.credential);
  await assert.rejects(f.post('/v1/claim',
    {...own,pullSessionId:renew.sessionId},f.pairing.credential),{code:'E_CLOUD_STOPPED'});
  await assert.rejects(f.post('/v1/pull-open',
    {grantId:f.grantId,tasks:[{...pin}]},f.pairing.credential),{code:'E_CLOUD_STOPPED'});
});

test('R19.4 WSS Push Offer carries only the authorized Job reference and retains Claim authority',async t=>{
  const f=await providerFixture(t);
  const auth=await f.post('/v1/auth',{},f.pairing.credential);
  const ws=new WebSocket('ws://127.0.0.1:'+f.port+'/v1/events');
  t.after(()=>ws.terminate());
  await new Promise((resolve,reject)=>{
    ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));
    ws.once('message',data=>{
      try{assert.equal(JSON.parse(String(data)).type,'authenticated');resolve();}
      catch(error){reject(error);}
    });
    ws.once('error',reject);
  });
  const notice=new Promise((resolve,reject)=>{
    ws.once('message',data=>{try{resolve(JSON.parse(String(data)));}catch(error){reject(error);}});
    ws.once('error',reject);
  });
  const job=await f.seed('r194-pushed');
  const offer=await notice;
  assert.deepEqual(offer,{type:'notify',offer:{jobId:job.jobId}});
  assert.equal(JSON.stringify(offer).includes('sourceUtf8'),false);
  const assignment=(await f.post('/v1/claim',
    {claimId:'r194-push-claim',grantId:f.grantId,tasks:advertised},
    f.pairing.credential)).assignment;
  assert.equal(assignment.jobId,job.jobId);
  assert.equal(assignment.executorId,f.executorId);
});

test('R19.4 SW connection restores HTTPS Pull readiness after WSS transport failure',async()=>{
  let now=10000,transport='offline',reconciled=false,session=null;
  const operations=[];
  const config={enabled:true,url:'https://provider.example',providerId:'provider',
    executorId:'executor',pairingId:'pairing',pairingGeneration:1,grantId:'grant',
    tasks:[{taskId:pin.taskId,version:pin.version,
      manifestHash:pin.manifestHash,contentHash:pin.sourceHash}]};
  class FailedSocket{
    constructor(){queueMicrotask(()=>this.onclose?.());}
    close(){this.onclose?.();}
    send(){}
  }
  const service={
    read:async()=>config,
    retryRevocation:async()=>{},
    captureAuthentication:()=>()=>true,
    post:async(_,path)=>{
      operations.push(path);
      if(path==='auth')return {providerId:'provider',executorId:'executor',pairingId:'pairing',
        pairingGeneration:1,ticket:'ticket',expiresAt:now+30000};
      if(path==='pull-open')return {providerId:'provider',executorId:'executor',
        pairingId:'pairing',pairingGeneration:1,grantId:'grant',
        sessionId:'session',expiresAt:now+90000};
      return {accepted:true};
    },
    reconcile:async()=>{operations.push('reconcile');},
    setPullSession:value=>{session=value;},
    setReconciled:value=>{reconciled=value;},
    connection:state=>{transport=state;},
    attachConnection:()=>{}
  };
  const connection=createCloudConnection({service,Socket:FailedSocket,api:{},
    clock:{now:()=>now},random:()=>0.5});
  try{
    for(let i=0;i<30&&transport!=='pull-ready';i++)
      await new Promise(resolve=>setImmediate(resolve));
    assert.equal(transport,'pull-ready');
    assert.equal(reconciled,true);
    assert.equal(session.sessionId,'session');
    assert.deepEqual(operations,['auth','auth','capabilities','pull-open','reconcile']);
  }finally{connection.stop();}
});
