import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
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
