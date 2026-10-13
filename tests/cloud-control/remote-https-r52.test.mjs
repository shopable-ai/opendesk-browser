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
const searchPkg=JSON.parse(await readFile(
  new URL('../../examples/tasks/modern-search.v1.opendesk-task.json',import.meta.url),'utf8'));
const searchPin={taskId:searchPkg.manifest.taskId,version:searchPkg.manifest.version,
  manifestHash:searchPkg.manifestHash,sourceHash:searchPkg.manifest.program.sourceHash};
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
    const grantId=randomUUID();
    await local('/admin/register',{manifest:searchPkg.manifest,
      manifestHash:searchPkg.manifestHash},admin.adminToken);
    await p('/v1/capabilities',{grantId,tasks:[...taskAdvertised,{
      taskId:searchPin.taskId,manifestHash:searchPin.manifestHash,
      sourceHash:searchPin.sourceHash}]},executor.credential);
    await assert.rejects(local('/admin/client-grant',
      {executorId,tasks:[],allowResult:false},admin.adminToken),{code:'E_CLIENT_SCOPE'});
    const grant=await local('/admin/client-grant',
      {executorId,tasks:[pin],allowResult:false},admin.adminToken);
    const permittedResultClient=await local('/admin/client-grant',
      {executorId,tasks:[pin],allowResult:true},admin.adminToken);
    // A normal Chrome user can issue and revoke a fixed Task client without
    // ever receiving the Provider's local Admin credential.
    const self=await p('/v1/client-grant',{grantId,tasks:[searchPin],
      allowResult:false,label:'Side Panel approved search'},executor.credential);
    assert.match(self.credential,/^[a-f0-9]{64}$/);
    let listing=await p('/v1/client-list',{offset:0,limit:50},executor.credential);
    assert.equal(listing.total,3);
    assert.ok(listing.clients.some(c=>c.clientId===self.clientId&&
      c.label==='Side Panel approved search'&&c.allowResult===false));
    assert.equal(JSON.stringify(listing).includes(self.credential),false);
    await assert.rejects(p('/v1/client-list',{},grant.credential),{code:'E_AUTH'});
    await assert.rejects(p('/v1/client-grant',{grantId,tasks:[searchPin],
      allowResult:false,label:'Untrusted'},grant.credential),{code:'E_AUTH'});
    await assert.rejects(p('/v1/client-grant',{grantId,tasks:[{
      ...searchPin,sourceHash:'0'.repeat(64)}],allowResult:false,label:'Wrong Task'},
      executor.credential),{code:'E_CLIENT_SCOPE'});
    const otherExecutor=await p('/v1/pair',{executorId:randomUUID(),
      pairingCode:admin.pairingCode});
    assert.deepEqual(await p('/v1/client-list',{},otherExecutor.credential),
      {total:0,offset:0,nextOffset:null,clients:[]});
    await assert.rejects(p('/v1/client-revoke',{clientId:self.clientId},
      otherExecutor.credential),{code:'E_CLIENT'},
      'Another paired browser must never revoke this browser\'s client');
    await assert.rejects(p('/v1/client-grant',{grantId,tasks:[pin],
      allowResult:false,label:'Unauthorized cross-browser grant'},
      otherExecutor.credential),{code:'E_CLOUD_STOPPED'});
    await assert.rejects(p('/v1/client-grant',{grantId,tasks:[searchPin],
      allowResult:false,label:'Bad'+String.fromCharCode(0)+'Label'},executor.credential),
      {code:'E_CLIENT_SCOPE'},'Control characters cannot enter user-visible labels');
    await p('/v1/client-revoke',{clientId:self.clientId},executor.credential);
    await assert.rejects(p('/v1/submit',{requestKey:'revoked-self',...searchPin,
      params:{keyword:'Should not run'},target},self.credential),{code:'E_AUTH'});
    listing=await p('/v1/client-list',{},executor.credential);
    assert.equal(listing.total,2);
    assert.equal(listing.clients.some(c=>c.clientId===self.clientId),false);
    assert.equal(grant.executorId,executorId);
    assert.match(grant.credential,/^[a-f0-9]{64}$/);
    await assert.rejects(p('/v1/submit',{},executor.credential),{code:'E_AUTH'});
    await assert.rejects(p('/v1/submit',{},admin.adminToken),{code:'E_AUTH'});
    const seed={requestKey:'external-request-one',...pin,
      params:{name:'Remote TLS Test'},target};
    await assert.rejects(p('/v1/submit',{
      requestKey:'different-fixed-task',...searchPin,
      params:{keyword:'Search not in client grant'},target},grant.credential),
      {code:'E_CLIENT_SCOPE'});
    await assert.rejects(p('/v1/submit',{...seed,sourceUtf8:'evil()'},grant.credential),
      {code:'E_SCHEMA'});
    await assert.rejects(p('/v1/submit',{...seed,requestKey:'wrong-origin',
      target:{mode:'owned',url:'https://other.invalid'}},grant.credential),{code:'E_TARGET'});
    await assert.rejects(p('/v1/submit',{...seed,requestKey:'wrong-param',
      params:{name:123}},grant.credential),{code:'E_PARAMS'});
    const created=await p('/v1/submit',seed,grant.credential);
    assert.deepEqual(await p('/v1/submit',seed,grant.credential),created);
    assert.deepEqual(await p('/v1/job-status',{jobId:created.jobId},grant.credential),
      {jobId:created.jobId,state:'queued',receiptConfirmed:false});
    await assert.rejects(p('/v1/job-status',{jobId:created.jobId},
      permittedResultClient.credential),{code:'E_JOB'});
    await assert.rejects(local('/v1/job-status',{jobId:created.jobId},grant.credential),
      {code:'E_TLS_REQUIRED'});
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
      grantId,tasks:taskAdvertised},executor.credential)).assignment;
    assert.equal(assignment.jobId,created.jobId);
    assert.equal(assignment.executorId,executorId);
    assert.equal((await p('/v1/job-status',{jobId:created.jobId},
      grant.credential)).state,'assigned');
    const runRef={runId:randomUUID(),resultId:randomUUID(),
      requestId:'cloud:'+assignment.assignmentId,
      sourceHash:pin.sourceHash,manifestHash:pin.manifestHash,grantId};
    await p('/v1/admission',{assignmentId:assignment.assignmentId,runRef,
      resultAllowed:false},executor.credential);
    assert.equal((await p('/v1/job-status',{jobId:created.jobId},
      grant.credential)).state,'admitted');
    const receipt={assignmentId:assignment.assignmentId,receiptKey:runRef.resultId,runRef,
      result:{visibility:'status-only',state:'completed',retirementState:'released'}};
    const accepted=await p('/v1/receipt',receipt,executor.credential);
    assert.equal(typeof accepted.receiptId,'string');
    assert.equal((await p('/v1/reconcile',{},executor.credential))
      .assignments[0].receipt.receiptId,accepted.receiptId);
    assert.deepEqual(await p('/v1/job-status',{jobId:created.jobId},grant.credential),
      {jobId:created.jobId,state:'completed',receiptConfirmed:true},
      'A status-only receipt cannot expose raw Run metadata or page body');

    const contentJob=await p('/v1/submit',{...seed,requestKey:'second-client-full',
      params:{name:'Explicitly approved text'}},permittedResultClient.credential);
    const contentAssignment=(await p('/v1/claim',{claimId:'claim-with-content',
      grantId,tasks:taskAdvertised},executor.credential)).assignment;
    assert.equal(contentAssignment.jobId,contentJob.jobId);
    const contentRef={runId:randomUUID(),resultId:randomUUID(),
      requestId:'cloud:'+contentAssignment.assignmentId,
      sourceHash:pin.sourceHash,manifestHash:pin.manifestHash,grantId};
    await p('/v1/admission',{assignmentId:contentAssignment.assignmentId,
      runRef:contentRef,resultAllowed:true},executor.credential);
    await p('/v1/receipt',{assignmentId:contentAssignment.assignmentId,
      receiptKey:contentRef.resultId,runRef:contentRef,
      result:{visibility:'full',runId:contentRef.runId,resultId:contentRef.resultId,
        sourceHash:pin.sourceHash,revision:{sourceHash:pin.sourceHash},
        retirementState:'released',state:'completed',
        valueWire:{text:'RESULT-BODY-CONSENT-ONLY'}}},executor.credential);
    await assert.rejects(p('/v1/job-status',{jobId:contentJob.jobId},
      grant.credential),{code:'E_JOB'},'Other client must not read a job it did not submit');
    assert.deepEqual(await p('/v1/job-status',{jobId:contentJob.jobId},
      permittedResultClient.credential),{
        jobId:contentJob.jobId,state:'completed',receiptConfirmed:true,
        result:{state:'completed',valueWire:{text:'RESULT-BODY-CONSENT-ONLY'}}
      },'Full result needs both Browser consent and client read authorization');

    // Browser authorized full receipt but this *client* never approved
    // reading result bodies: it sees only status, including after restart.
    const deniedResultJob=await p('/v1/submit',{...seed,requestKey:'client-no-body',
      params:{name:'Web secret may never leave status'}},grant.credential);
    const deniedAssignment=(await p('/v1/claim',{claimId:'claim-client-no-body',
      grantId,tasks:taskAdvertised},executor.credential)).assignment;
    assert.equal(deniedAssignment.jobId,deniedResultJob.jobId);
    const deniedRef={runId:randomUUID(),resultId:randomUUID(),
      requestId:'cloud:'+deniedAssignment.assignmentId,
      sourceHash:pin.sourceHash,manifestHash:pin.manifestHash,grantId};
    await p('/v1/admission',{assignmentId:deniedAssignment.assignmentId,
      runRef:deniedRef,resultAllowed:true},executor.credential);
    await p('/v1/receipt',{assignmentId:deniedAssignment.assignmentId,
      receiptKey:deniedRef.resultId,runRef:deniedRef,
      result:{visibility:'full',runId:deniedRef.runId,resultId:deniedRef.resultId,
        sourceHash:pin.sourceHash,revision:{sourceHash:pin.sourceHash},
        retirementState:'released',state:'completed',
        valueWire:{text:'CLIENT-RESULT-NOT-AUTHORIZED'}}},executor.credential);
    assert.deepEqual(await p('/v1/job-status',{jobId:deniedResultJob.jobId},
      grant.credential),{jobId:deniedResultJob.jobId,state:'completed',receiptConfirmed:true});
    await assert.rejects(p('/v1/job-status',{jobId:deniedResultJob.jobId},
      permittedResultClient.credential),{code:'E_JOB'});

    // A native side effect could have occurred after admission. No receipt
    // plus cancellation is UNKNOWN, not a new automatic execution.
    const unknownJob=await p('/v1/submit',{...seed,requestKey:'cancel-after-admission',
      params:{name:'Effect could exist'}},permittedResultClient.credential);
    const unknownAssignment=(await p('/v1/claim',{claimId:'claim-unknown',
      grantId,tasks:taskAdvertised},executor.credential)).assignment;
    const unknownRef={runId:randomUUID(),resultId:randomUUID(),
      requestId:'cloud:'+unknownAssignment.assignmentId,
      sourceHash:pin.sourceHash,manifestHash:pin.manifestHash,grantId};
    await p('/v1/admission',{assignmentId:unknownAssignment.assignmentId,
      runRef:unknownRef,resultAllowed:false},executor.credential);
    await local('/admin/cancel',{jobId:unknownJob.jobId},admin.adminToken);
    assert.deepEqual(await p('/v1/job-status',{jobId:unknownJob.jobId},
      permittedResultClient.credential),{
        jobId:unknownJob.jobId,state:'OUTCOME_UNKNOWN',receiptConfirmed:false
      });
    ws.terminate();ws=null;
    await provider.close();
    provider=await openProvider({directory,port:0,publicTls});
    const retry=(path,body,credential)=>securePost(provider.publicPort,ca,path,body,credential);
    assert.deepEqual(await retry('/v1/submit',seed,grant.credential),created,
      'Rebooted TLS Provider preserves requestKey and one original Job');
    assert.deepEqual(await retry('/v1/receipt',receipt,executor.credential),accepted);
    assert.equal((await retry('/v1/reconcile',{},executor.credential))
      .assignments[0].receipt.receiptId,accepted.receiptId);
    assert.equal((await retry('/v1/job-status',{jobId:contentJob.jobId},
      permittedResultClient.credential)).result.valueWire.text,'RESULT-BODY-CONSENT-ONLY');
    // A blocked durable write path must not break an authenticated, scoped
    // read-only Job status check or silently lose the previous receipt.
    const blockedTmp=join(directory,'state.json.tmp');
    await (await import('node:fs/promises')).mkdir(blockedTmp);
    try{
      assert.equal((await retry('/v1/job-status',{jobId:created.jobId},
        grant.credential)).receiptConfirmed,true);
    }finally{
      await (await import('node:fs/promises')).rm(blockedTmp,{recursive:true});
    }
    const stopped=await retry('/v1/suspend',{grantId},executor.credential);
    assert.deepEqual(stopped,{suspended:true,grantId});
    await assert.rejects(retry('/v1/client-grant',{grantId,tasks:[pin],
      allowResult:false,label:'Should not reactivate'},executor.credential),
      {code:'E_CLOUD_STOPPED'},
      'Stopped Browser cannot silently mint new remote client permissions');
    const stoppedListing=await retry('/v1/client-list',{},executor.credential);
    assert.equal(stoppedListing.total,2,'Stopped Browser may still audit active credentials');

    assert.deepEqual(await retry('/v1/submit',seed,grant.credential),created,
      'A stopped browser must not lose the durable result of a prior accepted requestKey');
    await assert.rejects(localPost(provider.port,'/admin/client-grant',
      {executorId,tasks:[pin],allowResult:false},admin.adminToken),
      {code:'E_EXECUTOR_TARGET'},'Paused hosting cannot authorize another external client');
    await assert.rejects(retry('/v1/submit',{...seed,requestKey:'after-user-stop'},
      permittedResultClient.credential),{code:'E_CLOUD_STOPPED'});
    assert.equal((await retry('/v1/job-status',{jobId:contentJob.jobId},
      permittedResultClient.credential)).state,'completed',
      'Stopping new work must preserve previously confirmed receipts');
    await retry('/v1/capabilities',{grantId,tasks:[...taskAdvertised,{
      taskId:searchPin.taskId,manifestHash:searchPin.manifestHash,
      sourceHash:searchPin.sourceHash}]},executor.credential);
    await assert.rejects(retry('/v1/submit',{...seed,requestKey:'same-grant-replay'},
      permittedResultClient.credential),{code:'E_CLOUD_STOPPED'},
      'Delayed old capabilities must not reactivate a stopped browser');
    await localPost(provider.port,'/admin/client-revoke',{clientId:grant.clientId},
      admin.adminToken);
    await assert.rejects(retry('/v1/submit',{...seed,requestKey:'after-revoke'},
      grant.credential),{code:'E_AUTH'});
    const rotatedGrant=randomUUID();
    await retry('/v1/capabilities',{grantId:rotatedGrant,
      tasks:[...taskAdvertised,{taskId:searchPin.taskId,
        manifestHash:searchPin.manifestHash,sourceHash:searchPin.sourceHash}]},
      executor.credential);
    await assert.rejects(retry('/v1/job-status',{jobId:contentJob.jobId},
      permittedResultClient.credential),{code:'E_AUTH'},
      'Old external client cannot see data after Browser re-approval');
    await assert.rejects(retry('/v1/capabilities',{grantId,
      tasks:taskAdvertised},executor.credential),{code:'E_GRANT_STALE'});
    const state=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
    assert.equal(Object.keys(state.jobs).length,4);
    assert.equal(state.jobs[created.jobId].targetExecutorId,executorId);
    assert.equal(JSON.stringify(state).includes(pkg.sourceUtf8),false);
  }finally{ws?.terminate();await provider.close();await rm(directory,{force:true,recursive:true});}
});
