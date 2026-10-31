import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, stat, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ServiceBindingStore} from '../../ai-account-usage/service-binding-store.mjs';
import {createServiceBindingService} from '../../ai-account-usage/service-binding.mjs';
const op=()=>randomUUID();
const principal=(more={})=>({tenantId:'local',userId:'user_a',connectionId:'conn_a',installationId:'install_a',grantFamilyId:'grant_a',resourceIds:['acct_01'],...more});
async function setup(t) {
  const directory=await mkdtemp(join(tmpdir(),'binding-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=new ServiceBindingStore({directory});
  const service=createServiceBindingService({store,serviceInstanceId:'instance_a'});
  const context=principal();
  const device=await service.registerDevice(context,{operationId:op(),label:'Mac'});
  const call=(method,path,body)=>service.request(context,{method,path,body});
  return {directory,store,service,context,device,call};
}
const localAccount={origin:'https://chatgpt.com',alias:'saved_01',version:1,storeId:'0',partitionKey:null};
async function bind(f) {return f.call('POST','/opendesk/v1/bindings',{operationId:op(),purpose:'usage',providerKey:'codex',remoteAccountId:'acct_01',expectedRevision:0,localAccount});}

test('manual usage association never claims identity; duplicate resource and foreign installation cannot take ownership',async t=>{
  const f=await setup(t),binding=await bind(f);
  assert.equal(binding.verificationState,'UNVERIFIED');assert.equal(binding.purpose,'usage');
  await assert.rejects(bind(f),{code:'RESOURCE_ALREADY_BOUND'});
  await assert.rejects(f.service.request(principal({installationId:'install_b'}),{method:'GET',path:'/opendesk/v1/sync-policy'}),{code:'DEVICE_REQUIRED'});
  await assert.rejects(f.call('POST','/opendesk/v1/bindings',{operationId:op(),purpose:'backup',remoteAccountId:'acct_01',providerKey:'codex',expectedRevision:0,localAccount}),{code:'UNSUPPORTED_PURPOSE'});
});

test('desired policy alone is pending; exact acceptance, pause, revoke and stale epoch never expand accepted state',async t=>{
  const f=await setup(t),binding=await bind(f);
  const scope={bindingIds:[binding.bindingId],dataCategories:['ACCOUNT_METADATA'],trigger:'MANUAL',retentionDays:7};
  const desired=await f.service.saveDesiredPolicy({tenantId:'local',deviceId:f.device.deviceId},{operationId:op(),expectedRevision:0,scope});
  assert.equal((await f.call('GET','/opendesk/v1/sync-policy')).acceptance,null);
  const body={operationId:op(),action:'accept',desiredRevision:desired.desiredRevision,desiredHash:desired.desiredHash,authEpoch:1,scope};
  await assert.rejects(f.call('POST','/opendesk/v1/policy-acceptances',{...body,desiredHash:'a'.repeat(64)}),{code:'POLICY_CONFLICT'});
  assert.equal((await f.call('POST','/opendesk/v1/policy-acceptances',body)).status,'ACCEPTED');
  const change=action=>f.call('POST','/opendesk/v1/policy-acceptances',{operationId:op(),action,authEpoch:1});
  assert.equal((await change('pause')).status,'PAUSED');
  const next=await f.service.saveDesiredPolicy({tenantId:'local',deviceId:f.device.deviceId},{operationId:op(),expectedRevision:1,scope:{...scope,retentionDays:8}});
  assert.equal(next.desiredRevision,2);
  await assert.rejects(change('resume'),{code:'POLICY_CONFLICT'});
  assert.equal((await change('revoke')).authEpoch,2);
  await assert.rejects(change('resume'),{code:'EPOCH_CONFLICT'});
  assert.equal((await f.call('GET','/opendesk/v1/sync-policy')).acceptance,null);
});

test('operation receipts survive lost responses and reopening; content reuse conflicts and other tenant/device cannot read receipts',async t=>{
  const f=await setup(t),operationId=op();
  const body={operationId,purpose:'usage',providerKey:'codex',remoteAccountId:'acct_01',expectedRevision:0,localAccount};
  const first=await f.call('POST','/opendesk/v1/bindings',body);
  assert.deepEqual(await f.call('POST','/opendesk/v1/bindings',body),first);
  await assert.rejects(f.call('POST','/opendesk/v1/bindings',{...body,localAccount:{...localAccount,version:2}}),{code:'OPERATION_CONFLICT'});
  const reopened=createServiceBindingService({store:new ServiceBindingStore({directory:f.directory}),serviceInstanceId:'instance_a'});
  assert.deepEqual((await reopened.request(f.context,{method:'GET',path:`/opendesk/v1/operations/${operationId}`})).result,first);
  const foreign=principal({tenantId:'company_b',grantFamilyId:'grant_b'});
  await reopened.registerDevice(foreign,{operationId:op(),label:'Other'});
  await assert.rejects(reopened.request(foreign,{method:'GET',path:`/opendesk/v1/operations/${operationId}`}),{code:'NOT_FOUND'});
  assert.equal((await stat(join(f.directory,'service-binding-v1.json'))).mode&0o777,0o600);
  const disk=await readFile(join(f.directory,'service-binding-v1.json'),'utf8');
  assert.ok(!disk.includes('accessToken'));assert.ok(!disk.includes('cookieValue'));
});

test('device revocation invalidates bindings, acceptance and old operations; management resource checks instance and exact binding',async t=>{
  const f=await setup(t),binding=await bind(f);
  const target={serviceInstanceId:'instance_a',deviceId:f.device.deviceId,bindingId:binding.bindingId,remoteAccountId:'acct_01'};
  assert.equal(await f.service.managementPath(f.context,target),'/opendesk/admin/accounts/acct_01');
  await assert.rejects(f.service.managementPath(f.context,{...target,serviceInstanceId:'stale'}),{code:'INSTANCE_CONFLICT'});
  await assert.rejects(f.service.managementPath(f.context,{...target,remoteAccountId:'other'}),{code:'NOT_FOUND'});
  await f.call('DELETE',`/opendesk/v1/devices/${f.device.deviceId}`,{operationId:op(),authEpoch:1});
  await assert.rejects(f.call('POST','/opendesk/v1/devices',{operationId:op(),label:'Mac'}),{code:'DEVICE_REVOKED'});
  await assert.rejects(f.service.managementPath(f.context,target),{code:'DEVICE_REVOKED'});
});

test('private store rejects symlinks, insecure files, unknown schema and concurrent writers',async t=>{
  const f=await setup(t),path=join(f.directory,'service-binding-v1.json');
  await writeFile(join(f.directory,'.service-binding-v1.lock'),'held',{mode:0o600});
  await assert.rejects(bind(f),{code:'STORE_BUSY'});
  await rm(join(f.directory,'.service-binding-v1.lock'));
  await rm(path);await symlink('/dev/null',path);
  await assert.rejects(f.store.read(),{code:'STORE_PERMISSIONS'});
  await rm(path);await writeFile(path,JSON.stringify({schemaVersion:1,secret:'no'}),{mode:0o600});
  await assert.rejects(f.store.read(),{code:'STORE_SCHEMA'});
});

test('grant family cannot be rebound, connection-wide resources are unique, and revoked operation can still be reconciled',async t=>{
  const f=await setup(t);await bind(f);
  await assert.rejects(f.service.registerDevice(principal({installationId:'install_b'}),{operationId:op(),label:'Hijack'}),{code:'GRANT_CONFLICT'});
  const other=principal({grantFamilyId:'grant_b',installationId:'install_b'});
  await f.service.registerDevice(other,{operationId:op(),label:'Second'});
  await assert.rejects(f.service.request(other,{method:'POST',path:'/opendesk/v1/bindings',body:{operationId:op(),purpose:'usage',providerKey:'codex',remoteAccountId:'acct_01',expectedRevision:0,localAccount}}),{code:'RESOURCE_ALREADY_BOUND'});
  const operationId=op();const path=`/opendesk/v1/devices/${f.device.deviceId}`;
  const revoked=await f.call('DELETE',path,{operationId,authEpoch:1});
  assert.deepEqual((await f.call('GET',`/opendesk/v1/operations/${operationId}`)).result,revoked);
  assert.deepEqual(await f.call('DELETE',path,{operationId,authEpoch:1}),revoked);
});

test('deep persisted schema rejects malformed desired, acceptance, operation owners/results, and oversized result transactions',async t=>{
  const f=await setup(t),good=await f.store.read(),file=join(f.directory,'service-binding-v1.json');
  for(const corrupt of [
    s=>{s.devices[0].desired={desiredRevision:1,desiredHash:'a'.repeat(64),scope:{bindingIds:[],dataCategories:['COOKIE'],trigger:'MANUAL',retentionDays:7}};},
    s=>{s.devices[0].acceptance={desiredRevision:1,desiredHash:'a'.repeat(64),authEpoch:1,scope:null};},
    s=>{s.operations[0].owner={tenantId:'other'};},
    s=>{s.operations[0].result={cookieValue:'secret'};},
    s=>{s.devices[0].resourceIds=['acct_01',3];},
    s=>{s.devices[0].authEpoch=1.5;}
  ]){const state=structuredClone(good);corrupt(state);await writeFile(file,JSON.stringify(state));await assert.rejects(f.store.read(),{code:'STORE_SCHEMA'});}
  await writeFile(file,JSON.stringify(good));
  await assert.rejects(f.store.transact(state=>{state.operations[0].result={cookieValue:'secret'};return {};}),{code:'STORE_SCHEMA'});
  assert.deepEqual(await f.store.read(),good);
  await writeFile(file,'{');await assert.rejects(f.store.read(),{code:'STORE_SCHEMA'});
  await writeFile(file,'x'.repeat(8*1024*1024+1));await assert.rejects(f.store.read(),{code:'STORE_SIZE'});
});

test('oversized returned results do not commit; a held transaction rejects a second store without clobbering state',async t=>{
  const f=await setup(t),before=await f.store.read();
  await assert.rejects(f.store.transact(state=>{state.devices[0].label='must not commit';return {blob:'x'.repeat(65536)};}),{code:'STORE_RESULT_SIZE'});
  assert.deepEqual(await f.store.read(),before);
  let release,entered;
  const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
  const held=f.store.transact(async state=>{entered();await gate;state.devices[0].label='Committed once';return {ok:true};});
  await started;
  await assert.rejects(new ServiceBindingStore({directory:f.directory}).transact(()=>({ok:true})),{code:'STORE_BUSY'});
  release();await held;
  assert.equal((await f.store.read()).devices[0].label,'Committed once');
});

test('expired receipts stay unknown to reconciliation and cannot be replayed as a new mutation',async t=>{
  const f=await setup(t);let now=Date.now();
  const service=createServiceBindingService({store:f.store,serviceInstanceId:'instance_a',clock:()=>now});
  const operationId=op(),body={operationId,purpose:'usage',providerKey:'codex',remoteAccountId:'acct_01',expectedRevision:0,localAccount};
  await service.request(f.context,{method:'POST',path:'/opendesk/v1/bindings',body});now+=31*86400_000;
  await assert.rejects(service.request(f.context,{method:'GET',path:`/opendesk/v1/operations/${operationId}`}),{code:'OPERATION_EXPIRED'});
  await assert.rejects(service.request(f.context,{method:'POST',path:'/opendesk/v1/bindings',body}),{code:'OPERATION_EXPIRED'});
  assert.equal((await f.store.read()).bindings.length,1);
});

test('service restart does not inherit prior instance receipts or device state',async t=>{
  const f=await setup(t),operationId=op();
  await f.call('POST','/opendesk/v1/bindings',{operationId,purpose:'usage',providerKey:'codex',remoteAccountId:'acct_01',expectedRevision:0,localAccount});
  const restarted=createServiceBindingService({store:f.store,serviceInstanceId:'instance_b'});
  await assert.rejects(restarted.request(f.context,{method:'GET',path:'/opendesk/v1/sync-policy'}),{code:'DEVICE_REQUIRED'});
  const newDevice=await restarted.registerDevice(f.context,{operationId:op(),label:'Restarted'});
  assert.notEqual(newDevice.deviceId,f.device.deviceId);
  await assert.rejects(restarted.request(f.context,{method:'GET',path:`/opendesk/v1/operations/${operationId}`}),{code:'NOT_FOUND'});
});

test('local resource provider is fixed to codex and cannot be changed to bypass binding uniqueness',async t=>{
  const f=await setup(t),body={operationId:op(),purpose:'usage',providerKey:'not_codex',remoteAccountId:'acct_01',expectedRevision:0,localAccount};
  await assert.rejects(f.call('POST','/opendesk/v1/bindings',body),{code:'PROVIDER_MISMATCH',status:400});
  const first=await bind(f);assert.equal(first.providerKey,'codex');
  await assert.rejects(f.call('POST','/opendesk/v1/bindings',{...body,operationId:op()}),{code:'PROVIDER_MISMATCH',status:400});
  await assert.rejects(bind(f),{code:'RESOURCE_ALREADY_BOUND'});
  assert.equal((await f.store.read()).bindings.length,1);
});

test('accept receipt replay after pause or revoke cannot claim current ACCEPTED; original GET receipt stays historical without side effects',async t=>{
  const f=await setup(t),binding=await bind(f),path='/opendesk/v1/policy-acceptances';
  const scope={bindingIds:[binding.bindingId],dataCategories:['ACCOUNT_METADATA'],trigger:'MANUAL',retentionDays:7};
  const desired=await f.service.saveDesiredPolicy({tenantId:'local',deviceId:f.device.deviceId},{operationId:op(),expectedRevision:0,scope});
  const accept={operationId:op(),action:'accept',desiredRevision:desired.desiredRevision,desiredHash:desired.desiredHash,authEpoch:1,scope};
  const accepted=await f.call('POST',path,accept);
  assert.deepEqual(await f.call('POST',path,accept),accepted); // Unchanged same-epoch replay is safe.
  await f.call('POST',path,{operationId:op(),action:'pause',authEpoch:1});
  await assert.rejects(f.call('POST',path,accept),{code:'POLICY_CONFLICT',status:409});
  await f.call('POST',path,{operationId:op(),action:'revoke',authEpoch:1});
  const before=await f.store.read();
  await assert.rejects(f.call('POST',path,accept),{code:'EPOCH_CONFLICT',status:409});
  const historical=await f.call('GET',`/opendesk/v1/operations/${accept.operationId}`);
  assert.deepEqual(historical.result,accepted);assert.equal(historical.currentAuthEpoch,2);
  const current=await f.call('GET','/opendesk/v1/sync-policy');
  assert.equal(current.acceptance,null);assert.equal(current.paused,true);assert.equal(current.authEpoch,2);
  assert.deepEqual(await f.store.read(),before);
});
