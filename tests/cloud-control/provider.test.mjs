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
    const auth=await post('/v1/auth',{});ws=new WebSocket(`ws://127.0.0.1:${p.port}/v1/events`);
    await new Promise((ok,no)=>{ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));ws.once('message',d=>{assert.equal(JSON.parse(String(d)).type,'authenticated');ok();});ws.once('error',no);});
    const tasks=[{taskId:pkg.manifest.taskId,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash}];
    const empty={claimId:'empty',tasks};assert.deepEqual(await post('/v1/claim',empty),{assignment:null});
    const seed={requestKey:'seed',params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};
    const job=await post('/admin/seed',seed,admin.adminToken);assert.deepEqual(await post('/admin/seed',seed,admin.adminToken),job);
    assert.deepEqual(await post('/v1/claim',empty),{assignment:null});
    await assert.rejects(post('/admin/seed',{...seed,params:{name:'different'}},admin.adminToken),{code:'E_REQUEST_CONFLICT'});
    const claim={claimId:'real',tasks},a=(await post('/v1/claim',claim)).assignment;assert.equal(a.params.name,'Alice');assert.deepEqual((await post('/v1/claim',claim)).assignment,a);
    await assert.rejects(post('/v1/claim',{...claim,tasks:[]}),{code:'E_REQUEST_CONFLICT'});
    const runRef={runId:randomUUID(),resultId:randomUUID(),requestId:'cloud:'+a.assignmentId,sourceHash:pkg.manifest.program.sourceHash,manifestHash:pkg.manifestHash,grantId:randomUUID()},admission={assignmentId:a.assignmentId,runRef};
    await post('/admin/fault',{path:'/v1/admission',count:1},admin.adminToken);await assert.rejects(post('/v1/admission',admission));
    const permit=await post('/v1/admission',admission);assert.deepEqual(await post('/v1/admission',admission),permit);
    await assert.rejects(post('/v1/admission',{...admission,runRef:{...runRef,runId:randomUUID()}}),{code:'E_REQUEST_CONFLICT'});
    const receipt={assignmentId:a.assignmentId,receiptKey:runRef.resultId,runRef,result:{state:'completed',retirementState:'released'}};
    await post('/admin/fault',{path:'/v1/receipt',count:1},admin.adminToken);await assert.rejects(post('/v1/receipt',receipt));const ack=await post('/v1/receipt',receipt);
    ws.terminate();await p.close();p=await openProvider({directory,port:0});
    assert.deepEqual(await post('/v1/claim',claim),{assignment:a});assert.deepEqual(await post('/v1/receipt',receipt),ack);
    const reconciled=await post('/v1/reconcile',{});assert.deepEqual(reconciled.assignments[0].runRef,runRef);assert.equal(reconciled.assignments[0].receipt.receiptId,ack.receiptId);
    const state=await post('/admin/state',{},admin.adminToken);assert.equal(Object.keys(state.jobs).length,1);assert.equal(state.jobs[job.jobId].runRef.runId,runRef.runId);
    await post('/admin/cancel',{jobId:job.jobId},admin.adminToken);await assert.rejects(post('/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}),{code:'E_LEASE'});
    await assert.rejects(post('/admin/seed',{...seed,requestKey:'evil',sourceUtf8:'return 1'},admin.adminToken),{code:'E_SCHEMA'});
  }finally{ws?.terminate();await p.close();await rm(directory,{recursive:true,force:true});}
});


test('provider persistence failure rolls back memory before a retry can publish facts',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-durable-'));const p=await openProvider({directory,port:0});
  try{
    const admin=JSON.parse(await readFile(p.credentialFile,'utf8'));
    const seed={requestKey:'disk-failure',params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};
    const post=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${p.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin.adminToken},body:JSON.stringify(body)});return {ok:r.ok,value:await r.json()};};
    await mkdir(join(directory,'state.json.tmp'));assert.equal((await post('/admin/seed',seed)).ok,false);
    await rm(join(directory,'state.json.tmp'),{recursive:true});assert.equal((await post('/admin/seed',seed)).ok,true);
    const state=(await post('/admin/state',{})).value;assert.equal(Object.keys(state.jobs).length,1);
    const persisted=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));assert.equal(Object.keys(persisted.jobs).length,1);
    assert.equal(Object.keys(persisted.requests).filter(k=>k==='seed:disk-failure').length,1);
  }finally{await p.close();await rm(directory,{recursive:true,force:true});}
});
