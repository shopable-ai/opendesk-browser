import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import https from 'node:https';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';

test('lost submit responses recover by original client request key without dispatch or persistence',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-request-status-'));
  const keyFile=join(directory,'key.pem'),certFile=join(directory,'cert.pem');
  const configFile=join(directory,'openssl.cnf');
  await writeFile(configFile,'[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=127.0.0.1\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\n');
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-keyout',keyFile,'-out',certFile,'-config',configFile],{stdio:'ignore'});
  const ca=await readFile(certFile),publicTls={port:0,host:'127.0.0.1',keyFile,certFile};
  let provider=await openProvider({directory,port:0,publicTls});
  const local=async(path,body,credential)=>{
    const res=await fetch(`http://127.0.0.1:${provider.port}${path}`,{method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+credential},body:JSON.stringify(body)});
    const value=await res.json();if(!res.ok)throw Object.assign(Error('Provider rejected'),{code:value.error.code});return value;
  };
  const post=(path,body,credential)=>new Promise((resolve,reject)=>{
    const req=https.request({host:'127.0.0.1',port:provider.publicPort,path,method:'POST',ca,
      headers:{'content-type':'application/json',authorization:'Bearer '+credential}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
        const value=JSON.parse(Buffer.concat(chunks));
        if(res.statusCode!==200)reject(Object.assign(Error('Provider rejected'),{code:value.error.code}));else resolve(value);
      });
    });req.on('error',reject);req.end(JSON.stringify(body));
  });
  try{
    const admin=JSON.parse(await readFile(provider.credentialFile));
    const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url)));
    const pin={taskId:pkg.manifest.taskId,version:pkg.manifest.version,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
    const executorId=randomUUID(),executor=await local('/v1/pair',{executorId,pairingCode:admin.pairingCode});
    await local('/v1/capabilities',{grantId:randomUUID(),tasks:[{taskId:pin.taskId,manifestHash:pin.manifestHash,sourceHash:pin.sourceHash}]},executor.credential);
    const client=await local('/admin/client-grant',{executorId,tasks:[pin],allowResult:false},admin.adminToken);
    const other=await local('/admin/client-grant',{executorId,tasks:[pin],allowResult:false},admin.adminToken);
    const scope=await post('/v1/client-scope',{includeAvailability:true},client.credential);
    assert.deepEqual(scope.availability,{state:'NOT_CONNECTED',transport:'none'});
    assert.equal(Object.hasOwn(await post('/v1/client-scope',{},client.credential),'availability'),false);
    await assert.rejects(post('/v1/client-scope',{includeAvailability:'yes'},client.credential),{code:'E_SCHEMA'});
    const input={requestKey:'original-response-lost',...pin,params:{name:'Recovery test'},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};
    const job=await post('/v1/submit',input,client.credential);
    const snapshot=await readFile(join(directory,'state.json'),'utf8');
    assert.deepEqual(await post('/v1/job-status',{requestKey:input.requestKey},client.credential),
      {jobId:job.jobId,state:'queued',receiptConfirmed:false});
    assert.equal(await readFile(join(directory,'state.json'),'utf8'),snapshot,'query must not mutate ledger');
    await assert.rejects(post('/v1/job-status',{requestKey:input.requestKey},other.credential),{code:'E_JOB'});
    await assert.rejects(post('/v1/job-status',{requestKey:'never-submitted'},client.credential),{code:'E_JOB'});
    await assert.rejects(post('/v1/job-status',{requestKey:input.requestKey,jobId:job.jobId},client.credential),{code:'E_SCHEMA'});
    await assert.rejects(post('/v1/job-status',{requestKey:''},client.credential),{code:'E_SCHEMA'});
    await assert.rejects(local('/v1/job-status',{requestKey:input.requestKey},client.credential),{code:'E_TLS_REQUIRED'});
    await provider.close();provider=await openProvider({directory,port:0,publicTls});
    assert.equal((await post('/v1/job-status',{requestKey:input.requestKey},client.credential)).jobId,job.jobId);
    assert.equal(Object.keys(JSON.parse(await readFile(join(directory,'state.json'))).jobs).length,1);
    const grantId=scope.grantId;
    await local('/v1/pull-open',{grantId,tasks:[pin]},executor.credential);
    assert.deepEqual((await post('/v1/client-scope',{includeAvailability:true},client.credential)).availability,
      {state:'READY',transport:'https-pull'});
    await local('/v1/suspend',{grantId},executor.credential);
    assert.deepEqual((await post('/v1/client-scope',{includeAvailability:true},client.credential)).availability,
      {state:'NOT_AUTHORIZED',transport:'none'});
    await local('/admin/client-revoke',{clientId:client.clientId},admin.adminToken);
    await assert.rejects(post('/v1/job-status',{requestKey:input.requestKey},client.credential),{code:'E_AUTH'});
  }finally{await provider.close();await rm(directory,{recursive:true,force:true});}
});
