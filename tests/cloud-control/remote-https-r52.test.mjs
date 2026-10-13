import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {WebSocket} from 'ws';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';

const pkg=JSON.parse(await readFile(
  new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const pin={taskId:pkg.manifest.taskId,version:pkg.manifest.version,
  manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
const target={mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'};
const taskAdvertised=[{taskId:pin.taskId,
  manifestHash:pin.manifestHash,sourceHash:pin.sourceHash}];

function securePost(port,ca,path,body,credential){
  return new Promise((resolve,reject)=>{
    const bytes=Buffer.from(JSON.stringify(body));
    const request=https.request({hostname:'127.0.0.1',port,path,method:'POST',
      ca,rejectUnauthorized:true,headers:{'Content-Type':'application/json',
        'Content-Length':bytes.length,
        ...(credential?{Authorization:'Bearer '+credential}:{})}},
    response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>{
        try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(response.statusCode!==200)reject(Object.assign(
            Error(data.error?.message),{code:data.error?.code}));
          else resolve(data);
        }catch(error){reject(error);}
      });});
    request.on('error',reject);request.end(bytes);
  });
}
async function localPost(port,path,body,credential){
  const response=await fetch('http://127.0.0.1:'+port+path,{
    method:'POST',headers:{'Content-Type':'application/json',
      ...(credential?{Authorization:'Bearer '+credential}:{})},
    body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw Object.assign(Error(data.error?.message),{code:data.error?.code});
  return data;
}

test('one Provider serves authenticated HTTPS/WSS and target-scoped client submissions without exposing Admin API',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-tls-'));
  const keyFile=join(directory,'tls.key'),certFile=join(directory,'tls.crt');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',keyFile,'-out',certFile,'-days','1',
    '-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],
    {stdio:'ignore'});
  const publicTls={port:0,host:'127.0.0.1',keyFile,certFile};
  let provider=await openProvider({directory,port:0,publicTls}),ws;
  try{
    const ca=await readFile(certFile);
    const admin=JSON.parse(await readFile(provider.credentialFile,'utf8'));
    const executorId=randomUUID();
    const p=(path,body,credential)=>securePost(provider.publicPort,ca,path,body,credential);
    const local=(path,body,credential)=>localPost(provider.port,path,body,credential);
    await assert.rejects(p('/admin/state',{},admin.adminToken),{code:'E_ROUTE'});
    await assert.rejects(local('/v1/submit',{},admin.adminToken),{code:'E_TLS_REQUIRED'});
    const executor=await p('/v1/pair',{executorId,pairingCode:admin.pairingCode});
    const grant=await local('/admin/client-grant',{executorId},admin.adminToken);
    assert.equal(grant.executorId,executorId);
    assert.match(grant.credential,/^[a-f0-9]{64}$/);
    await assert.rejects(p('/v1/submit',{},executor.credential),{code:'E_AUTH'});
    await assert.rejects(p('/v1/submit',{},admin.adminToken),{code:'E_AUTH'});
    const seed={requestKey:'external-request-one',...pin,
      params:{name:'Remote TLS Test'},target};
    await assert.rejects(p('/v1/submit',{...seed,sourceUtf8:'evil()'},grant.credential),
      {code:'E_SCHEMA'});
    await assert.rejects(p('/v1/submit',{...seed,requestKey:'wrong-origin',
      target:{mode:'owned',url:'https://other.invalid'}},grant.credential),{code:'E_TARGET'});
    await assert.rejects(p('/v1/submit',{...seed,requestKey:'wrong-param',
      params:{name:123}},grant.credential),{code:'E_PARAMS'});
    const created=await p('/v1/submit',seed,grant.credential);
    assert.deepEqual(await p('/v1/submit',seed,grant.credential),created);
    await assert.rejects(p('/v1/submit',{...seed,params:{name:'Changed'}},grant.credential),
      {code:'E_REQUEST_CONFLICT'});
    const auth=await p('/v1/auth',{},executor.credential);
    ws=new WebSocket('wss://127.0.0.1:'+provider.publicPort+'/v1/events',
      {ca,rejectUnauthorized:true});
    await new Promise((resolve,reject)=>{
      ws.once('error',reject);
      ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));
      ws.once('message',data=>{
        try{assert.equal(JSON.parse(String(data)).type,'authenticated');resolve();}
        catch(error){reject(error);}
      });
    });
    const assignment=(await p('/v1/claim',{claimId:'remote-claim',
      tasks:taskAdvertised},executor.credential)).assignment;
    assert.equal(assignment.jobId,created.jobId);
    assert.equal(assignment.executorId,executorId);
    const runRef={runId:randomUUID(),resultId:randomUUID(),
      requestId:'cloud:'+assignment.assignmentId,
      sourceHash:pin.sourceHash,manifestHash:pin.manifestHash,grantId:randomUUID()};
    await p('/v1/admission',{assignmentId:assignment.assignmentId,runRef,
      resultAllowed:false},executor.credential);
    const receipt={assignmentId:assignment.assignmentId,receiptKey:runRef.resultId,runRef,
      result:{visibility:'status-only',state:'completed',retirementState:'released'}};
    const accepted=await p('/v1/receipt',receipt,executor.credential);
    assert.equal(typeof accepted.receiptId,'string');
    assert.equal((await p('/v1/reconcile',{},executor.credential))
      .assignments[0].receipt.receiptId,accepted.receiptId);
    ws.terminate();ws=null;
    await provider.close();
    provider=await openProvider({directory,port:0,publicTls});
    const retry=(path,body,credential)=>securePost(provider.publicPort,ca,path,body,credential);
    assert.deepEqual(await retry('/v1/submit',seed,grant.credential),created,
      'Rebooted TLS Provider preserves requestKey and one original Job');
    assert.deepEqual(await retry('/v1/receipt',receipt,executor.credential),accepted);
    assert.equal((await retry('/v1/reconcile',{},executor.credential))
      .assignments[0].receipt.receiptId,accepted.receiptId);
    await localPost(provider.port,'/admin/client-revoke',{clientId:grant.clientId},
      admin.adminToken);
    await assert.rejects(retry('/v1/submit',{...seed,requestKey:'after-revoke'},
      grant.credential),{code:'E_AUTH'});
    const state=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
    assert.equal(Object.keys(state.jobs).length,1);
    assert.equal(state.jobs[created.jobId].targetExecutorId,executorId);
    assert.equal(JSON.stringify(state).includes(pkg.sourceUtf8),false);
  }finally{ws?.terminate();await provider.close();await rm(directory,{force:true,recursive:true});}
});
