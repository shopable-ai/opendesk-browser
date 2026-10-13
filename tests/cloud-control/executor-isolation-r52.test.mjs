import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';

const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const pin={taskId:pkg.manifest.taskId,version:pkg.manifest.version,
  manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
const advertised=[{taskId:pin.taskId,manifestHash:pin.manifestHash,sourceHash:pin.sourceHash}];
const target={mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'};

test('same installed Task in two Executors cannot cross-claim, admit, receipt or reuse revoked pairing',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-r52-executors-'));
  let p=await openProvider({directory,port:0});const sockets=[];
  const post=async(path,body,credential)=>{
    const response=await fetch('http://127.0.0.1:'+p.port+path,{method:'POST',
      headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},
      body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw Object.assign(Error(data.error?.message),{code:data.error?.code});
    return data;
  };
  try{
    const admin=JSON.parse(await readFile(p.credentialFile,'utf8'));
    const ids=[randomUUID(),randomUUID()],credentials=[];
    for(const executorId of ids)credentials.push((await post('/v1/pair',
      {executorId,pairingCode:admin.pairingCode})).credential);
    await assert.rejects(post('/v1/pair',{executorId:ids[0],pairingCode:admin.pairingCode}),
      {code:'E_PAIR_ACTIVE'});
    const grants=[randomUUID(),randomUUID()];
    for(let i=0;i<2;i++){
      await post('/v1/capabilities',{grantId:grants[i],tasks:advertised},credentials[i]);
      const auth=await post('/v1/auth',{},credentials[i]);
      const ws=new WebSocket('ws://127.0.0.1:'+p.port+'/v1/events');sockets.push(ws);
      await new Promise((resolve,reject)=>{
        ws.once('error',reject);
        ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));
        ws.once('message',raw=>{
          try{assert.equal(JSON.parse(String(raw)).type,'authenticated');resolve();}
          catch(error){reject(error);}
        });
      });
    }
    const jobBody=(id,name)=>({requestKey:'same-request-key',targetExecutorId:id,
      ...pin,params:{name},target});
    const a=await post('/admin/seed',jobBody(ids[0],'Private A'),admin.adminToken);
    const b=await post('/admin/seed',jobBody(ids[1],'Private B'),admin.adminToken);
    assert.notEqual(a.jobId,b.jobId,'requestKey identity must include Executor pairing');
    assert.deepEqual(await post('/admin/seed',jobBody(ids[0],'Private A'),admin.adminToken),a);
    await assert.rejects(post('/admin/seed',jobBody(ids[0],'Conflicting'),admin.adminToken),
      {code:'E_REQUEST_CONFLICT'});
    await assert.rejects(post('/admin/seed',{...jobBody(ids[0],'X'),
      requestKey:'bad-executor',targetExecutorId:randomUUID()},admin.adminToken),
      {code:'E_EXECUTOR_TARGET'});
    const claim=i=>({claimId:'claim-for-'+i,grantId:grants[i],tasks:advertised});
    const pickedB=(await post('/v1/claim',claim(1),credentials[1])).assignment;
    const pickedA=(await post('/v1/claim',claim(0),credentials[0])).assignment;
    assert.equal(pickedB.jobId,b.jobId);
    assert.equal(pickedA.jobId,a.jobId);
    assert.equal(pickedA.executorId,ids[0]);
    assert.equal(pickedB.executorId,ids[1]);
    const ref={runId:randomUUID(),resultId:randomUUID(),
      requestId:'cloud:'+pickedA.assignmentId,sourceHash:pin.sourceHash,
      manifestHash:pin.manifestHash,grantId:grants[0]};
    const admission={assignmentId:pickedA.assignmentId,runRef:ref,resultAllowed:false};
    await assert.rejects(post('/v1/admission',admission,credentials[1]),{code:'E_ASSIGNMENT'});
    await post('/v1/admission',admission,credentials[0]);
    const receipt={assignmentId:pickedA.assignmentId,receiptKey:ref.resultId,runRef:ref,
      result:{visibility:'status-only',state:'completed',retirementState:'released'}};
    await assert.rejects(post('/v1/receipt',receipt,credentials[1]),{code:'E_ASSIGNMENT'});
    for(const result of [
      {...receipt.result,valueWire:{secret:'HTML-SHOULD-NOT-LEAK'}},
      {...receipt.result,error:{message:'HTML-SHOULD-NOT-LEAK'}},
      {...receipt.result,url:'https://private.invalid'},
      {...receipt.result,detail:'HTML-SHOULD-NOT-LEAK'},
      {visibility:'full',state:'completed',runId:ref.runId,resultId:ref.resultId,
        sourceHash:pin.sourceHash,retirementState:'released',valueWire:{secret:'HTML-SHOULD-NOT-LEAK'}}
    ])await assert.rejects(post('/v1/receipt',{...receipt,result},credentials[0]),
      {code:result.visibility==='full'?'E_RESULT_SCOPE':'E_SCHEMA'});
    const ack=await post('/v1/receipt',receipt,credentials[0]);
    assert.deepEqual(await post('/v1/receipt',receipt,credentials[0]),ack);
    assert.equal((await post('/v1/reconcile',{},credentials[1])).assignments
      .some(x=>x.assignmentId===pickedA.assignmentId),false,'Other Executor cannot view A receipt');
    const snapshot=await readFile(join(directory,'state.json'),'utf8');
    assert.equal(snapshot.includes('HTML-SHOULD-NOT-LEAK'),false);
    // Re-approval uses a new local Cloud grant: queued work from the old
    // grant must stay historical but can never be claimed under the new grant.
    const stale=await post('/admin/seed',{...jobBody(ids[0],'Stale queue'),
      requestKey:'stale-before-rotation'},admin.adminToken);
    const nextGrant=randomUUID();
    await post('/v1/capabilities',{grantId:nextGrant,tasks:advertised},credentials[0]);
    await assert.rejects(post('/v1/capabilities',{grantId:grants[0],
      tasks:advertised},credentials[0]),{code:'E_GRANT_STALE'},
      'An old delayed connection must never resurrect a superseded authorization');
    assert.equal((await post('/admin/state',{},admin.adminToken))
      .jobs[stale.jobId].cancelled,true,'Old queued Job must be quarantined on new approval');
    await assert.rejects(post('/v1/claim',{claimId:'wrong-approval',
      grantId:grants[0],tasks:advertised},credentials[0]),{code:'E_GRANT'});
    const freshAfterApproval=await post('/admin/seed',{
      ...jobBody(ids[0],'New authorized queue'),
      requestKey:'new-approval-job'},admin.adminToken);
    const newPicked=(await post('/v1/claim',{claimId:'new-approval-claim',
      grantId:nextGrant,tasks:advertised},credentials[0])).assignment;
    assert.equal(newPicked.jobId,freshAfterApproval.jobId);
    assert.notEqual(newPicked.jobId,stale.jobId);
    await post('/v1/unpair',{},credentials[0]);
    await assert.rejects(post('/v1/claim',{claimId:'after-revoke',tasks:advertised},credentials[0]),
      {code:'E_AUTH'});
    await assert.rejects(post('/v1/reconcile',{},credentials[0]),{code:'E_AUTH'});
    assert.equal((await post('/admin/state',{},admin.adminToken)).jobs[a.jobId].receipt.receiptId,
      ack.receiptId,'Original receipt survives pairing revocation');
    const replacement=(await post('/v1/pair',
      {executorId:ids[0],pairingCode:admin.pairingCode})).credential;
    assert.notEqual(replacement,credentials[0]);
    // Explicit new delivery may reuse the key after a new pairing generation;
    // neither the new pairing nor B inherits A's old assignments.
    const replacementGrant=randomUUID();
    await post('/v1/capabilities',{grantId:replacementGrant,tasks:advertised},replacement);
    const fresh=await post('/admin/seed',jobBody(ids[0],'Fresh pairing'),admin.adminToken);
    assert.notEqual(fresh.jobId,a.jobId);
    assert.equal((await post('/v1/reconcile',{},replacement)).assignments.length,0);
    const wrong=(await post('/v1/reconcile',{},credentials[1])).assignments;
    assert.equal(wrong.some(x=>x.assignmentId===pickedA.assignmentId),false);
  }finally{
    for(const ws of sockets)ws.terminate();
    await p.close();await rm(directory,{recursive:true,force:true});
  }
});

test('pre-R5 queued Job without target Executor is quarantined, never assigned by matching Task',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-r52-legacy-'));
  let p=await openProvider({directory,port:0}),ws;
  try{
    const admin=JSON.parse(await readFile(p.credentialFile,'utf8')),executorId=randomUUID();
    const post=async(path,body,credential)=>{
      const response=await fetch('http://127.0.0.1:'+p.port+path,{method:'POST',
        headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},
        body:JSON.stringify(body)});const data=await response.json();
      if(!response.ok)throw Object.assign(Error(data.error?.message),{code:data.error?.code});
      return data;
    };
    const credential=(await post('/v1/pair',{executorId,pairingCode:admin.pairingCode})).credential;
    const grantId=randomUUID();
    await post('/v1/capabilities',{grantId,tasks:advertised},credential);
    await p.close();
    const file=join(directory,'state.json'),state=JSON.parse(await readFile(file,'utf8'));
    const jobId=randomUUID();
    state.jobs[jobId]={jobId,state:'queued',createdAt:1,task:pin,params:{name:'Legacy'},
      target}; // no targetExecutorId: must never infer ownership
    await (await import('node:fs/promises')).writeFile(file,JSON.stringify(state));
    p=await openProvider({directory,port:0});
    const auth=await post('/v1/auth',{},credential);
    ws=new WebSocket('ws://127.0.0.1:'+p.port+'/v1/events');
    await new Promise((resolve,reject)=>{
      ws.once('error',reject);
      ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));
      ws.once('message',()=>resolve());
    });
    assert.deepEqual(await post('/v1/claim',{claimId:'no-steal',grantId,tasks:advertised},credential),
      {assignment:null});
    assert.equal((await post('/admin/state',{},admin.adminToken)).jobs[jobId].state,'queued');
  }finally{ws?.terminate();await p.close();await rm(directory,{recursive:true,force:true});}
});
