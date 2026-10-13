import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
test('real HTTP/native WebSocket provider: durable claim, empty retry, permit response loss, restart and receipt identity',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-'));let p=await openProvider({directory,port:0}),ws;
  try{
    const admin=JSON.parse(await readFile(p.credentialFile,'utf8')),executorId=randomUUID();let credential;
    const post=async(path,body,auth=credential)=>{const response=await fetch(`http://127.0.0.1:${p.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error.message),value.error);return value;};
    await assert.rejects(post('/admin/state',{}),{code:'E_AUTH'});
    credential=(await post('/v1/pair',{executorId,pairingCode:admin.pairingCode})).credential;
    const grantId=randomUUID();
    const tasks=[{taskId:pkg.manifest.taskId,manifestHash:pkg.manifestHash,
      sourceHash:pkg.manifest.program.sourceHash}];
    await post('/v1/capabilities',{grantId,tasks});
    const auth=await post('/v1/auth',{});ws=new WebSocket(`ws://127.0.0.1:${p.port}/v1/events`);
    await new Promise((ok,no)=>{ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));ws.once('message',d=>{assert.equal(JSON.parse(String(d)).type,'authenticated');ok();});ws.once('error',no);});
    const empty={claimId:'empty',grantId,tasks};assert.deepEqual(await post('/v1/claim',empty),{assignment:null});
    const seed={requestKey:'seed',targetExecutorId:executorId,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};
    const cancelled=await post('/admin/seed',{...seed,requestKey:'cancelled-before-claim'},admin.adminToken);
    await post('/admin/cancel',{jobId:cancelled.jobId},admin.adminToken);
    assert.deepEqual(await post('/v1/claim',{claimId:'cancelled-only',grantId,tasks}),{assignment:null});
    const job=await post('/admin/seed',seed,admin.adminToken);assert.deepEqual(await post('/admin/seed',seed,admin.adminToken),job);
    assert.deepEqual(await post('/v1/claim',empty),{assignment:null});
    await assert.rejects(post('/admin/seed',{...seed,params:{name:'different'}},admin.adminToken),{code:'E_REQUEST_CONFLICT'});
    const claim={claimId:'real',grantId,tasks},a=(await post('/v1/claim',claim)).assignment;assert.equal(a.params.name,'Alice');assert.deepEqual((await post('/v1/claim',claim)).assignment,a);
    await assert.rejects(post('/v1/claim',{...claim,tasks:[]}),{code:'E_REQUEST_CONFLICT'});
    const runRef={runId:randomUUID(),resultId:randomUUID(),requestId:'cloud:'+a.assignmentId,sourceHash:pkg.manifest.program.sourceHash,manifestHash:pkg.manifestHash,grantId},admission={assignmentId:a.assignmentId,runRef,resultAllowed:false};
    await assert.rejects(post('/v1/admission',{...admission,
      runRef:{...runRef,grantId:randomUUID()}}),{code:'E_RUN_REF'},
      'Task identity is not a substitute for the installed Cloud approval generation');
    await assert.rejects(post('/v1/admission',{...admission,
      runRef:{...runRef,requestId:'cloud:'+randomUUID()}}),{code:'E_RUN_REF'},
      'RunRef must belong to the exact Provider assignment');
    await post('/admin/fault',{path:'/v1/admission',count:1},admin.adminToken);await assert.rejects(post('/v1/admission',admission));
    const permit=await post('/v1/admission',admission);assert.deepEqual(await post('/v1/admission',admission),permit);
    await assert.rejects(post('/v1/admission',{...admission,runRef:{...runRef,runId:randomUUID()}}),{code:'E_REQUEST_CONFLICT'});
    const receipt={assignmentId:a.assignmentId,receiptKey:runRef.resultId,runRef,
      result:{visibility:'status-only',state:'completed',retirementState:'released'}};
    await assert.rejects(post('/v1/receipt',{...receipt,receiptKey:randomUUID()}),
      {code:'E_RECEIPT_KEY'},'Receipt key is the original immutable ResultId');
    await post('/admin/fault',{path:'/v1/receipt',count:1},admin.adminToken);await assert.rejects(post('/v1/receipt',receipt));
    const ack=await post('/v1/receipt',receipt);
    await assert.rejects(post('/v1/receipt',{...receipt,receiptKey:randomUUID(),
      result:{visibility:'status-only',state:'failed',retirementState:'released'}}),
      {code:'E_RECEIPT_KEY'});
    await assert.rejects(post('/v1/receipt',{...receipt,
      result:{visibility:'status-only',state:'failed',retirementState:'released'}}),
      {code:'E_REQUEST_CONFLICT'},'Same ResultId cannot replace confirmed completion');
    assert.deepEqual(await post('/v1/receipt',receipt),ack);
    ws.terminate();await p.close();p=await openProvider({directory,port:0});
    assert.deepEqual(await post('/v1/claim',claim),{assignment:a});assert.deepEqual(await post('/v1/receipt',receipt),ack);
    const reconciled=await post('/v1/reconcile',{});assert.deepEqual(reconciled.assignments[0].runRef,runRef);assert.equal(reconciled.assignments[0].receipt.receiptId,ack.receiptId);
    const state=await post('/admin/state',{},admin.adminToken);assert.equal(Object.keys(state.jobs).length,2);assert.equal(state.jobs[cancelled.jobId].assignment,undefined);assert.equal(state.jobs[job.jobId].runRef.runId,runRef.runId);
    const suspended=await post('/v1/suspend',{grantId});
    assert.deepEqual(suspended,{suspended:true,grantId});
    assert.deepEqual(await post('/v1/suspend',{grantId}),suspended,'Stop acknowledgement must be idempotent');
    assert.deepEqual(await post('/v1/receipt',receipt),ack,'Confirmed receipt remains durable after Stop');
    assert.deepEqual(await post('/admin/seed',seed,admin.adminToken),job,
      'A previously accepted requestKey still returns its original JobId after Stop');
    await assert.rejects(post('/admin/seed',{...seed,requestKey:'stopped-new-job'},admin.adminToken),
      {code:'E_CLOUD_STOPPED'},'Stop must reject new external work even before Browser reconnects');
    await assert.rejects(post('/v1/claim',{claimId:'stopped-claim',grantId,tasks}),
      {code:'E_CLOUD_STOPPED'});
    await post('/v1/capabilities',{grantId,tasks});
    await assert.rejects(post('/admin/seed',{...seed,requestKey:'delayed-old-capabilities'},admin.adminToken),
      {code:'E_CLOUD_STOPPED'},'A late same-generation sync cannot resume stopped hosting');
    await post('/admin/cancel',{jobId:job.jobId},admin.adminToken);
    await assert.rejects(post('/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}),
      {code:'E_LEASE'});
    const resumedGrant=randomUUID();
    await post('/v1/capabilities',{grantId:resumedGrant,tasks});
    assert.ok((await post('/admin/seed',{...seed,requestKey:'explicit-new-grant'},admin.adminToken)).jobId);
    await assert.rejects(post('/v1/capabilities',{grantId,tasks}),{code:'E_GRANT_STALE'});
    await assert.rejects(post('/admin/seed',{...seed,requestKey:'evil',sourceUtf8:'return 1'},admin.adminToken),{code:'E_SCHEMA'});
  }finally{ws?.terminate();await p.close();await rm(directory,{recursive:true,force:true});}
});


test('provider persistence failure rolls back memory before a retry can publish facts',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-durable-'));const p=await openProvider({directory,port:0});
  try{
    const admin=JSON.parse(await readFile(p.credentialFile,'utf8')),executorId=randomUUID();
    await fetch(`http://127.0.0.1:${p.port}/v1/pair`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({executorId,pairingCode:admin.pairingCode})});
    const grantId=randomUUID();
    const advertised=[{taskId:pkg.manifest.taskId,
      manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash}];
    await fetch(`http://127.0.0.1:${p.port}/v1/capabilities`,{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+
        (JSON.parse(await readFile(join(directory,'state.json'),'utf8')).executors[executorId].credential)},
      body:JSON.stringify({grantId,tasks:advertised})});
    const seed={requestKey:'disk-failure',targetExecutorId:executorId,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};
    const post=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${p.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin.adminToken},body:JSON.stringify(body)});return {ok:r.ok,value:await r.json()};};
    await mkdir(join(directory,'state.json.tmp'));
    assert.equal((await post('/admin/state',{})).ok,true,
      'Admin read-only status must not fsync the state while the write path is blocked');
    assert.equal((await post('/admin/seed',seed)).ok,false);
    await rm(join(directory,'state.json.tmp'),{recursive:true});assert.equal((await post('/admin/seed',seed)).ok,true);
    const state=(await post('/admin/state',{})).value;assert.equal(Object.keys(state.jobs).length,1);
    const persisted=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));assert.equal(Object.keys(persisted.jobs).length,1);
    assert.equal(Object.keys(persisted.requests).filter(k=>k.endsWith(':disk-failure')).length,1);
  }finally{await p.close();await rm(directory,{recursive:true,force:true});}
});
