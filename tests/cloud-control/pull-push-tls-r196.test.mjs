import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {WebSocket} from 'ws';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';

// Provider/transport integration only. No simulated RunHost result constitutes
// evidence that Chrome actually created or updated a persistent Web record.
const pkg=JSON.parse(await readFile(
  new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const pin={taskId:pkg.manifest.taskId,version:pkg.manifest.version,
  manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
const advertised=[{taskId:pin.taskId,manifestHash:pin.manifestHash,
  sourceHash:pin.sourceHash}];
const target={mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'};

function securePost(port,ca,path,body,credential){
  return new Promise((resolve,reject)=>{
    const bytes=Buffer.from(JSON.stringify(body));
    const req=https.request({hostname:'127.0.0.1',port,path,method:'POST',ca,
      rejectUnauthorized:true,headers:{'Content-Type':'application/json',
        'Content-Length':bytes.length,
        ...(credential?{Authorization:'Bearer '+credential}:{})}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>{
        try{
          const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(res.statusCode!==200)reject(Object.assign(
            Error(value.error?.message||'HTTPS '+path),{code:value.error?.code}));
          else resolve(value);
        }catch(error){reject(error);}
      });
    });
    req.on('error',reject);req.end(bytes);
  });
}
async function adminPost(port,path,body,credential){
  const res=await fetch('http://127.0.0.1:'+port+path,{
    method:'POST',headers:{'Content-Type':'application/json',
      Authorization:'Bearer '+credential},body:JSON.stringify(body)});
  const value=await res.json();
  if(!res.ok)throw Object.assign(Error(value.error?.message),{code:value.error?.code});
  return value;
}
async function openAuthenticatedSocket(port,ca,ticket){
  const ws=new WebSocket('wss://127.0.0.1:'+port+'/v1/events',{
    ca,rejectUnauthorized:true});
  try{
    await new Promise((resolve,reject)=>{
      ws.once('error',reject);
      ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket})));
      ws.once('message',data=>{
        try{assert.equal(JSON.parse(String(data)).type,'authenticated');resolve();}
        catch(error){reject(error);}
      });
    });
    return ws;
  }catch(error){ws.terminate();throw error;}
}
const runRefFor=(assignment,grantId)=>({
  runId:randomUUID(),resultId:randomUUID(),
  requestId:'cloud:'+assignment.assignmentId,
  sourceHash:pin.sourceHash,manifestHash:pin.manifestHash,grantId
});
const statusReceipt=(assignment,runRef)=>({
  assignmentId:assignment.assignmentId,receiptKey:runRef.resultId,runRef,
  result:{visibility:'status-only',state:'completed',retirementState:'released'}
});

test('R19.6: HTTPS Client → WSS-free Pull → WSS Push share one durable Claim/Permit/Receipt contract',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-r196-tls-dual-'));
  const keyFile=join(directory,'key.pem'),certFile=join(directory,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=127.0.0.1',
    '-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const publicTls={port:0,host:'127.0.0.1',keyFile,certFile};
  let provider,ws;
  try{
    provider=await openProvider({directory,port:0,publicTls});
    const ca=await readFile(certFile);
    const admin=JSON.parse(await readFile(provider.credentialFile,'utf8'));
    const p=(path,body,credential)=>securePost(provider.publicPort,ca,path,body,credential);
    const local=(path,body)=>adminPost(provider.port,path,body,admin.adminToken);
    const executorId=randomUUID(),grantId=randomUUID();
    const executor=await p('/v1/pair',
      {executorId,pairingCode:admin.pairingCode});
    await p('/v1/capabilities',{grantId,tasks:advertised},executor.credential);
    const client=await local('/admin/client-grant',
      {executorId,tasks:[pin],allowResult:false});
    const form=await p('/v1/client-scope',
      {includeTaskSchemas:true},client.credential);
    assert.deepEqual(form.taskCatalog[0].paramsSchema,pkg.manifest.paramsSchema);
    assert.deepEqual(form.tasks,[pin]);

    // WSS has never connected: a direct Claim MUST be refused. HTTPS Pull is
    // independently authenticated and scoped to this Executor/Pairing/Grant.
    const aInput={requestKey:'r196-web-a',...pin,params:{name:'Record A'},target};
    const a=await p('/v1/submit',aInput,client.credential);
    assert.deepEqual(await p('/v1/submit',aInput,client.credential),a);
    await assert.rejects(p('/v1/submit',
      {...aInput,params:{name:'Conflicting retry'}},client.credential),
    {code:'E_REQUEST_CONFLICT'});
    const claimA={claimId:'r196-claim-a',grantId,tasks:advertised};
    await assert.rejects(p('/v1/claim',claimA,executor.credential),
      {code:'E_CONNECTION'});
    assert.equal((await local('/admin/state',{})).executors[executorId].connected,false);
    const pull=await p('/v1/pull-open',{grantId,tasks:[pin]},executor.credential);
    assert.equal(pull.executorId,executorId);
    assert.equal(pull.grantId,grantId);
    assert.equal(pull.expiresAt>0,true);
    const aAssignment=(await p('/v1/claim',
      {...claimA,pullSessionId:pull.sessionId},executor.credential)).assignment;
    assert.equal(aAssignment.jobId,a.jobId);
    assert.equal(aAssignment.executorId,executorId);
    assert.deepEqual((await p('/v1/claim',
      {...claimA,pullSessionId:pull.sessionId},executor.credential)).assignment,
    aAssignment,'repeated Pull Claim must preserve its original Assignment');
    const aRef=runRefFor(aAssignment,grantId);
    const aPermit=await p('/v1/admission',
      {assignmentId:aAssignment.assignmentId,runRef:aRef,
        resultAllowed:false},executor.credential);
    assert.equal(aPermit.assignmentId,aAssignment.assignmentId);
    const aReceipt=statusReceipt(aAssignment,aRef);
    const aAck=await p('/v1/receipt',aReceipt,executor.credential);
    assert.deepEqual(await p('/v1/job-status',
      {jobId:a.jobId},client.credential),
    {jobId:a.jobId,state:'completed',receiptConfirmed:true});

    // Switch transports without introducing another executor or controller.
    // The WSS notify contains only the targeted Job reference. It is NOT a
    // Permit; B still needs its own Claim/Assignment/Admission.
    const auth=await p('/v1/auth',{},executor.credential);
    ws=await openAuthenticatedSocket(provider.publicPort,ca,auth.ticket);
    const notice=new Promise((resolve,reject)=>{
      ws.once('message',data=>{
        try{resolve(JSON.parse(String(data)));}catch(error){reject(error);}
      });
      ws.once('error',reject);
    });
    const bInput={...aInput,requestKey:'r196-web-b',
      params:{name:'Record B'}};
    const b=await p('/v1/submit',bInput,client.credential);
    assert.deepEqual(await notice,{type:'notify',offer:{jobId:b.jobId}});
    const claimB={claimId:'r196-claim-b',grantId,tasks:advertised};
    const bAssignment=(await p('/v1/claim',
      claimB,executor.credential)).assignment;
    assert.equal(bAssignment.jobId,b.jobId);
    assert.notEqual(bAssignment.assignmentId,aAssignment.assignmentId);
    assert.deepEqual((await p('/v1/claim',claimB,executor.credential)).assignment,
      bAssignment,'duplicate WSS hint cannot give B a second Assignment');
    const bRef=runRefFor(bAssignment,grantId);
    await p('/v1/admission',{assignmentId:bAssignment.assignmentId,
      runRef:bRef,resultAllowed:false},executor.credential);
    const bReceipt=statusReceipt(bAssignment,bRef);
    const bAck=await p('/v1/receipt',bReceipt,executor.credential);
    assert.equal(bAck.receiptId!==aAck.receiptId,true);
    assert.deepEqual(await p('/v1/job-status',
      {jobId:b.jobId},client.credential),
    {jobId:b.jobId,state:'completed',receiptConfirmed:true});

    ws.terminate();ws=null;
    await provider.close();provider=null;
    provider=await openProvider({directory,port:0,publicTls});
    const retry=(path,body,credential)=>securePost(provider.publicPort,ca,path,body,credential);
    assert.deepEqual(await retry('/v1/submit',aInput,client.credential),a);
    assert.deepEqual(await retry('/v1/submit',bInput,client.credential),b);
    assert.deepEqual(await retry('/v1/receipt',aReceipt,executor.credential),aAck);
    assert.deepEqual(await retry('/v1/receipt',bReceipt,executor.credential),bAck);
    await assert.rejects(retry('/v1/claim',
      {...claimA,pullSessionId:pull.sessionId},executor.credential),
    {code:'E_PULL_SESSION'},'restarted Provider cannot reuse an old Pull session');
    const renewed=await retry('/v1/pull-open',
      {grantId,tasks:[pin]},executor.credential);
    assert.deepEqual((await retry('/v1/claim',
      {...claimA,pullSessionId:renewed.sessionId},executor.credential)).assignment,
    aAssignment,'new transport proof returns the ORIGINAL durable Claim');
    const saved=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
    assert.equal(Object.keys(saved.jobs).length,2);
    assert.equal(saved.jobs[a.jobId].receipt.receiptId,aAck.receiptId);
    assert.equal(saved.jobs[b.jobId].receipt.receiptId,bAck.receiptId);
  }finally{
    ws?.terminate();
    await provider?.close();
    await rm(directory,{recursive:true,force:true});
  }
});
