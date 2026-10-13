import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';

const form=await verifyTaskPackage(JSON.parse(await readFile(
  new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8')));
const search=await verifyTaskPackage(JSON.parse(await readFile(
  new URL('../../examples/tasks/modern-search.v1.opendesk-task.json',import.meta.url),'utf8')));
const pin=pkg=>({taskId:pkg.manifest.taskId,version:pkg.manifest.version,
  manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash});
const target={mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'};

test('generic Provider delivers two distinct fixed, locally registered Controller Tasks with durable receipts',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-generic-'));
  let provider=await openProvider({directory,port:0}),ws;
  try{
    const admin=JSON.parse(await readFile(provider.credentialFile,'utf8')),
      executorId=randomUUID();
    let credential;
    const post=async(path,body,authorization=credential,headers={})=>{
      const response=await fetch('http://127.0.0.1:'+provider.port+path,{
        method:'POST',headers:{'Content-Type':'application/json',
          ...(authorization?{Authorization:'Bearer '+authorization}:{}),...headers},
        body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok)throw Object.assign(new Error(data.error.message),data.error);
      return data;
    };
    assert.notEqual(form.manifest.program.sourceHash,search.manifest.program.sourceHash);
    assert.notEqual(form.manifest.taskId,search.manifest.taskId);
    await assert.rejects(post('/admin/register',{manifest:search.manifest,
      manifestHash:search.manifestHash}),{code:'E_AUTH'});
    const registered=await post('/admin/register',{manifest:search.manifest,
      manifestHash:search.manifestHash},admin.adminToken);
    assert.deepEqual(registered.task,pin(search));
    assert.equal((await post('/admin/tasks',{},admin.adminToken)).tasks.length,2);
    await assert.rejects(post('/admin/register',{manifest:search.manifest,
      manifestHash:search.manifestHash,sourceUtf8:search.sourceUtf8},admin.adminToken),{code:'E_SCHEMA'});
    await assert.rejects(post('/admin/register',{manifest:search.manifest,
      manifestHash:'0'.repeat(64)},admin.adminToken),{code:'E_HASH'});
    credential=(await post('/v1/pair',{executorId,pairingCode:admin.pairingCode})).credential;
    const jobs=[
      {requestKey:'form-fixed-1',targetExecutorId:executorId,...pin(form),params:{name:'Registered Task'},target},
      {requestKey:'search-fixed-1',targetExecutorId:executorId,...pin(search),params:{keyword:'OpenDesk Cloud'},target}
    ];
    const created=await Promise.all(jobs.map(body=>post('/admin/seed',body,admin.adminToken)));
    assert.notEqual(created[0].jobId,created[1].jobId);
    assert.deepEqual(await post('/admin/seed',jobs[0],admin.adminToken),created[0]);
    assert.deepEqual(await post('/admin/seed',jobs[1],admin.adminToken),created[1]);
    await assert.rejects(post('/admin/seed',{...jobs[0],params:{name:'Changed'}},admin.adminToken),
      {code:'E_REQUEST_CONFLICT'});
    await assert.rejects(post('/admin/seed',{...jobs[1],params:{keyword:42},
      requestKey:'bad-params'},admin.adminToken),{code:'E_PARAMS'});
    await assert.rejects(post('/admin/seed',{...jobs[1],requestKey:'bad-origin',
      target:{mode:'owned',url:'https://example.org/' }},admin.adminToken),{code:'E_TARGET'});
    await assert.rejects(post('/admin/seed',{...jobs[1],requestKey:'bad-fragment',
      target:{mode:'owned',url:target.url+'#fragment'}},admin.adminToken),{code:'E_TARGET'});
    await assert.rejects(post('/admin/seed',{...jobs[1],requestKey:'wrong-hash',
      sourceHash:'0'.repeat(64)},admin.adminToken),{code:'E_TASK'});
    await assert.rejects(post('/admin/seed',{...jobs[1],requestKey:'wrong-version',
      version:'2.0.0'},admin.adminToken),{code:'E_TASK'});
    await assert.rejects(post('/admin/seed',{...jobs[1],requestKey:'remote-script',
      sourceUtf8:'alert(1)'},admin.adminToken),{code:'E_SCHEMA'});
    await assert.rejects(post('/admin/seed',{...jobs[0],requestKey:'bad-browser-origin'},
      admin.adminToken,{Origin:'https://evil.invalid'}),{code:'E_ORIGIN'});
    const auth=await post('/v1/auth',{});
    ws=new WebSocket('ws://127.0.0.1:'+provider.port+'/v1/events');
    await new Promise((ok,no)=>{
      ws.once('error',no);
      ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));
      ws.once('message',data=>{
        try{assert.equal(JSON.parse(String(data)).type,'authenticated');ok();}catch(error){no(error);}
      });
    });
    const assignments=[],receipts=[];
    for(let i=0;i<jobs.length;i++){
      const selection={claimId:'claim-'+i,tasks:[pin(i===0?form:search)]},
        result=await post('/v1/claim',selection);
      assert.equal(result.assignment?.task.taskId,jobs[i].taskId);
      assert.deepEqual(result.assignment.params,jobs[i].params);
      assert.deepEqual((await post('/v1/claim',selection)).assignment,result.assignment);
      assignments.push(result.assignment);
      const runRef={runId:randomUUID(),resultId:randomUUID(),
        requestId:'cloud:'+result.assignment.assignmentId,
        sourceHash:jobs[i].sourceHash,manifestHash:jobs[i].manifestHash,grantId:randomUUID()};
      const admission={assignmentId:result.assignment.assignmentId,runRef,resultAllowed:false};
      const permit=await post('/v1/admission',admission);
      assert.equal(permit.runRef.sourceHash,jobs[i].sourceHash);
      const payload={assignmentId:result.assignment.assignmentId,
        receiptKey:runRef.resultId,runRef,
        result:{visibility:'status-only',state:'completed',retirementState:'released'}};
      if(i===1){
        await post('/admin/fault',{path:'/v1/receipt',count:1},admin.adminToken);
        await assert.rejects(post('/v1/receipt',payload));
      }
      const receipt=await post('/v1/receipt',payload);
      assert.deepEqual(await post('/v1/receipt',payload),receipt);
      receipts.push(receipt);
    }
    ws.terminate();ws=null;
    await provider.close();
    provider=await openProvider({directory,port:0});
    assert.equal((await post('/admin/tasks',{},admin.adminToken)).tasks.length,2);
    const reconciliation=await post('/v1/reconcile',{});
    assert.equal(reconciliation.assignments.length,2);
    for(let i=0;i<assignments.length;i++){
      const row=reconciliation.assignments.find(r=>r.assignmentId===assignments[i].assignmentId);
      assert.equal(row.receipt.receiptId,receipts[i].receiptId);
      assert.equal(row.runRef.sourceHash,jobs[i].sourceHash);
      assert.deepEqual(await post('/admin/seed',jobs[i],admin.adminToken),created[i]);
    }
    const saved=await readFile(join(directory,'state.json'),'utf8');
    assert.equal(saved.includes(search.sourceUtf8),false,'Executable Task source must not be stored by Provider');
    assert.equal(saved.includes('sourceUtf8'),false,'Provider registry must contain descriptors only');
    assert.equal(Object.keys(JSON.parse(saved).jobs).length,2);
  }finally{ws?.terminate();await provider.close();await rm(directory,{recursive:true,force:true});}
});
