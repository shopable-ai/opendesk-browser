import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';

// Real local Provider HTTP + disk; NOT an actual Chrome Worker execution.
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
test('Remote Task bytes are delivered only to the pinned pairing and never run automatically',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-program-inbox-'));
  let provider=await openProvider({directory,port:0});
  try{
    const admin=JSON.parse(await readFile(provider.credentialFile,'utf8'));
    const post=async(path,body={},credential)=>{
      const response=await fetch('http://127.0.0.1:'+provider.port+path,{
        method:'POST',headers:{'Content-Type':'application/json',
          ...(credential?{Authorization:'Bearer '+credential}:{})},
        body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok)throw Object.assign(Error(data.error.message),data.error);
      return data;
    };
    const executorId=randomUUID();
    const pair=await post('/v1/pair',{executorId,pairingCode:admin.pairingCode});
    const adminAuth=admin.adminToken,credential=pair.credential;
    const deliver={requestKey:'delivery-once',targetExecutorId:executorId,package:pkg};
    await assert.rejects(post('/admin/program-deliver',deliver,credential),{code:'E_AUTH'},
      'A paired browser may not impersonate Provider administrator');
    await assert.rejects(post('/admin/register',{manifest:pkg.manifest,manifestHash:pkg.manifestHash,
      sourceUtf8:pkg.sourceUtf8},adminAuth),{code:'E_SCHEMA'},
      'Old descriptor route must keep rejecting executable bytes');
    const accepted=await post('/admin/program-deliver',deliver,adminAuth);
    assert.match(accepted.deliveryId,/^[a-f0-9-]{36}$/);
    assert.deepEqual(await post('/admin/program-deliver',deliver,adminAuth),accepted);
    await assert.rejects(post('/admin/program-deliver',{...deliver,package:{
      ...pkg,sourceUtf8:pkg.sourceUtf8+' // modified'
    }},adminAuth),{code:'E_HASH'});
    const inbox=await post('/v1/program-inbox',{},credential);
    assert.equal(inbox.programs.length,1);
    assert.equal(inbox.programs[0].manifestHash,pkg.manifestHash);
    assert.equal(inbox.programs[0].sourceHash,pkg.manifest.program.sourceHash);
    assert.equal(JSON.stringify(inbox).includes(pkg.sourceUtf8),false,
      'List may not disclose remote program source');
    const otherPair=await post('/v1/pair',{executorId:randomUUID(),pairingCode:admin.pairingCode});
    assert.deepEqual((await post('/v1/program-inbox',{},otherPair.credential)).programs,[]);
    await assert.rejects(post('/v1/program-fetch',{deliveryId:accepted.deliveryId},
      otherPair.credential),{code:'E_DELIVERY'});
    const fetched=await post('/v1/program-fetch',{deliveryId:accepted.deliveryId},credential);
    assert.deepEqual(fetched,{deliveryId:accepted.deliveryId,package:pkg});
    assert.deepEqual((await post('/admin/state',{},adminAuth)).jobs,{},
      'Fetch must neither schedule nor create a Run');
    await provider.close();
    provider=await openProvider({directory,port:0});
    assert.deepEqual((await post('/v1/program-fetch',{deliveryId:accepted.deliveryId},credential)).package,pkg,
      'Delivery remains available after Provider restart until Browser acknowledgement');
    await assert.rejects(post('/v1/program-received',{deliveryId:accepted.deliveryId,
      manifestHash:'0'.repeat(64)},credential),{code:'E_DELIVERY'});
    const ack={deliveryId:accepted.deliveryId,manifestHash:pkg.manifestHash};
    assert.deepEqual(await post('/v1/program-received',ack,credential),
      {received:true,deliveryId:accepted.deliveryId});
    assert.deepEqual(await post('/v1/program-received',ack,credential),
      {received:true,deliveryId:accepted.deliveryId});
    assert.deepEqual((await post('/v1/program-inbox',{},credential)).programs,[]);
    await assert.rejects(post('/v1/program-fetch',{deliveryId:accepted.deliveryId},credential),
      {code:'E_DELIVERY'});
    const state=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
    assert.equal(state.programDeliveries[accepted.deliveryId].package,undefined,
      'Acknowledgement purges executable bytes while retaining immutable receipt');
    assert.equal(JSON.stringify(state.requests).includes(pkg.sourceUtf8),false);
    const pending=await post('/admin/program-deliver',
      {requestKey:'pending-before-revocation',targetExecutorId:executorId,package:pkg},adminAuth);
    assert.equal((await post('/v1/program-inbox',{},credential)).programs.length,1);
    assert.deepEqual(await post('/v1/unpair',{},credential),{revoked:true});
    const retired=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
    assert.equal(retired.programDeliveries[pending.deliveryId].package,undefined,
      'Revocation purges unapproved remote executable bytes');
    await assert.rejects(post('/v1/program-fetch',{deliveryId:pending.deliveryId},credential),
      {code:'E_AUTH'});
    const next=await post('/v1/pair',{executorId,pairingCode:admin.pairingCode});
    assert.deepEqual((await post('/v1/program-inbox',{},next.credential)).programs,[],
      'New pairing generation cannot inherit a prior remote source');
    await assert.rejects(post('/v1/program-fetch',{deliveryId:pending.deliveryId},
      next.credential),{code:'E_DELIVERY'});
  }finally{
    await provider.close();
    await rm(directory,{recursive:true,force:true});
  }
});

test('Operator CLI accepts plain JS and delivers immutable candidate bytes without scheduling execution',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-program-js-cli-'));
  const file=join(directory,'operator.js'),sourceUtf8='async function main(){ return "review me"; }\n',
    executorId=randomUUID();
  await writeFile(file,sourceUtf8,'utf8');
  const provider=await openProvider({directory,port:0});
  try{
    const admin=JSON.parse(await readFile(provider.credentialFile,'utf8'));
    async function post(path,body={},credential){
      const response=await fetch('http://127.0.0.1:'+provider.port+path,{
        method:'POST',headers:{'Content-Type':'application/json',
          ...(credential?{Authorization:'Bearer '+credential}:{})},
        body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok)throw Object.assign(Error(data.error?.message),data.error);
      return data;
    }
    const paired=await post('/v1/pair',
      {executorId,pairingCode:admin.pairingCode});
    const cli=fileURLToPath(new URL('../../scripts/cloud-control/cli.mjs',import.meta.url));
    const {stdout}=await promisify(execFile)(process.execPath,[cli,'program:deliver',
      '--directory',directory,'--port',String(provider.port),
      '--executor',executorId,'--js',file,'--task-id','fixture.remote-js',
      '--version','1.0.0','--site','https://example.org',
      '--title','Operator JS review','--key','operator-js-v1'],
      {encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    const accepted=JSON.parse(stdout);
    assert.match(accepted.deliveryId,/^[a-f0-9-]{36}$/);
    const inbox=await post('/v1/program-inbox',{},paired.credential);
    assert.equal(inbox.programs.length,1);
    assert.equal(JSON.stringify(inbox).includes(sourceUtf8),false,
      'The inbox must never disclose executable source before review');
    const answer=await post('/v1/program-fetch',{deliveryId:accepted.deliveryId},paired.credential);
    const candidate=await verifyTaskPackage(answer.package);
    assert.equal(candidate.sourceUtf8,sourceUtf8);
    assert.equal(candidate.manifest.taskId,'fixture.remote-js');
    assert.deepEqual(candidate.manifest.siteOrigins,['https://example.org']);
    assert.deepEqual(candidate.manifest.permissions,['page.automation']);
    assert.equal((await post('/admin/state',{},admin.adminToken)).jobs &&
      Object.keys((await post('/admin/state',{},admin.adminToken)).jobs).length,0,
      'Direct source delivery must not trigger a Cloud execution job');
    const received=await post('/v1/program-received',{
      deliveryId:accepted.deliveryId,manifestHash:candidate.manifestHash},paired.credential);
    assert.equal(received.received,true);
    assert.deepEqual((await post('/v1/program-inbox',{},paired.credential)).programs,[]);
  }finally{
    await provider.close();
    await rm(directory,{recursive:true,force:true});
  }
});
