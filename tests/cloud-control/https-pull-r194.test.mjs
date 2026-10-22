import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';

const pkg=JSON.parse(await readFile(
  new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const pin={taskId:pkg.manifest.taskId,version:pkg.manifest.version,
  manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
const claimTasks=[{taskId:pin.taskId,manifestHash:pin.manifestHash,sourceHash:pin.sourceHash}];

function securePost(port,ca,path,body,credential){
  return new Promise((resolve,reject)=>{
    const payload=Buffer.from(JSON.stringify(body));
    const request=https.request({hostname:'127.0.0.1',port,path,method:'POST',
      ca,rejectUnauthorized:true,headers:{'Content-Type':'application/json',
        'Content-Length':payload.length,
        ...(credential?{Authorization:'Bearer '+credential}:{})}},response=>{
      const chunks=[];
      response.on('data',data=>chunks.push(data));
      response.on('end',()=>{
        try{
          const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(response.statusCode!==200)reject(Object.assign(
            Error(result.error?.message),{code:result.error?.code}));
          else resolve(result);
        }catch(error){reject(error);}
      });
    });
    request.once('error',reject);
    request.end(payload);
  });
}

test('R19.4 valid HTTPS and unreachable WSS still support an authorized Pull Claim',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-r194-https-'));
  const keyFile=join(directory,'tls.key'),certFile=join(directory,'tls.crt');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=127.0.0.1',
    '-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const publicTls={port:0,host:'127.0.0.1',keyFile,certFile};
  let provider=await openProvider({directory,port:0,publicTls});
  try{
    const ca=await readFile(certFile),executorId=randomUUID(),grantId=randomUUID();
    const admin=JSON.parse(await readFile(provider.credentialFile,'utf8'));
    const post=(path,body,credential)=>securePost(provider.publicPort,ca,path,body,credential);
    const pair=await post('/v1/pair',{executorId,pairingCode:admin.pairingCode});
    await post('/v1/capabilities',{grantId,tasks:[pin]},pair.credential);
    await assert.rejects(post('/v1/pull-open',{grantId,tasks:[pin]},'invalid'),
      {code:'E_AUTH'});
    const seed=await fetch('http://127.0.0.1:'+provider.port+'/admin/seed',{
      method:'POST',headers:{'Content-Type':'application/json',
        Authorization:'Bearer '+admin.adminToken},
      body:JSON.stringify({requestKey:'r194-real-tls',targetExecutorId:executorId,
        params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}})});
    assert.equal(seed.status,200);
    const job=await seed.json();
    await assert.rejects(post('/v1/claim',
      {claimId:'tls-claim',grantId,tasks:claimTasks},pair.credential),{code:'E_CONNECTION'});
    const ready=await post('/v1/pull-open',{grantId,tasks:[pin]},pair.credential);
    assert.equal(ready.pairingId,pair.pairingId);
    const request={claimId:'tls-claim',grantId,tasks:claimTasks,pullSessionId:ready.sessionId};
    const claimed=(await post('/v1/claim',request,pair.credential)).assignment;
    assert.equal(claimed.jobId,job.jobId);
    assert.equal(claimed.pairingId,pair.pairingId);
    assert.deepEqual((await post('/v1/claim',request,pair.credential)).assignment,claimed);
    await provider.close();
    provider=await openProvider({directory,port:0,publicTls});
    const after=await securePost(provider.publicPort,ca,'/v1/claim',
      {claimId:'tls-claim',grantId,tasks:claimTasks},pair.credential);
    assert.deepEqual(after.assignment,claimed);
  }finally{
    await provider.close();
    await rm(directory,{recursive:true,force:true});
  }
});
