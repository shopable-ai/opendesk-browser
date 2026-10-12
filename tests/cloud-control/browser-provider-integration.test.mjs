import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {WebSocket} from 'ws';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';
import {createCloudService} from '../../src/cloud-control/service.js';
import {createCloudConnection} from '../../src/cloud-control/connection.js';
import {canonical,digest} from '../../src/platform/protocol.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {BUILTIN_ABI} from '../../src/libs/runtime-contract.js';
import {installedKey,taskScriptId} from '../../src/platform/tasks/contract.js';

// COMPONENT_TESTED: cloud-control Browser service + real local Provider HTTP/disk.
// This is not a Chrome native PASS and does not touch real Provider state,
// Chrome profiles, shared dist, or Git/index.

const KV='frameworkKV',CONFIG='cloud:config',IDENTITY='cloud:executor',PREFIX='cloud:request:';
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const namespace='tool:fixture-extension';
const host={namespace,principal:'fixture-principal',registrationId:'fixture-registration',hostDocumentId:'fixture-document',hostInstanceId:'fixture-instance'};
const fixedNow=10_000;
const taskId=pkg.manifest.taskId,version=pkg.manifest.version,scriptId=taskScriptId(taskId,version);
const task={
  taskId,version,manifestHash:pkg.manifestHash,contentHash:pkg.manifest.program.sourceHash,
  scriptId,revision:1,generation:1,installationId:randomUUID(),manifest:pkg.manifest,
  resultAllowed:true
};
const installedAuthorization={tag:'task-install-authorization-v1',installationId:task.installationId,generation:task.generation,
  scope:{capabilities:pkg.manifest.permissions,siteOrigins:pkg.manifest.siteOrigins,networkOrigins:[]}};
const clone=value=>value===undefined?undefined:structuredClone(value);
const sha=value=>createHash('sha256').update(canonical(value)).digest('hex');
const errorCode=code=>error=>error?.code===code;
const errorIn=codes=>error=>codes.includes(error?.code);
const rowKey=row=>row.storageKey||PREFIX+row.requestId;
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const bindingKeys=['providerId','executorId','pairingId','pairingGeneration','attemptEpoch','claimId','jobId','assignmentId'];

function memoryStorage(){
  const data=new Map(),log=[];
  const store=name=>{if(!data.has(name))data.set(name,new Map());return data.get(name);};
  const snapshot=()=>new Map([...data].map(([name,values])=>[name,new Map([...values].map(([key,value])=>[key,clone(value)]))]));
  const restore=snap=>{data.clear();for(const [name,values] of snap)data.set(name,values);};
  const tx={
    get:async(name,key)=>clone(store(name).get(key)),
    put:async(name,value,key)=>{store(name).set(key,clone(value));},
    delete:async(name,key)=>{store(name).delete(key);},
    all:async name=>{log.push(['all',name]);return [...store(name).values()].map(clone);}
  };
  return {data,log,tx,
    async get(name,key){return tx.get(name,key);},
    async put(name,value,key){return tx.put(name,value,key);},
    async all(name){return tx.all(name);},
    transaction:async(_stores,mode,fn)=>{
      const before=mode==='readwrite'?snapshot():null;
      try{return await fn(tx);}catch(error){if(before)restore(before);throw error;}
    }
  };
}

function apiWithGrants(mode='granted'){
  return {runtime:{id:'fixture-extension'},permissions:{contains:async()=>{
    if(mode==='granted')return true;
    if(mode==='revoked')return false;
    throw Object.assign(new Error('permission backend unavailable'),{code:'E_TEST_UNKNOWN'});
  }}};
}

function serviceFixture({storage=memoryStorage(),grantMode='granted',onCurrentHost=async()=>{}}={}){
  const api=apiWithGrants(grantMode),emitted=[];
  const service=createCloudService({storage,api,clock:{now:()=>fixedNow},
    assertHost:async()=>host,
    currentHost:async(tx,h,sender)=>onCurrentHost(tx,h,sender),
    resolveTask:async()=>task,
    emitToHost:async(registrationId,message)=>{emitted.push({registrationId,message});}
  });
  return {service,storage,api,emitted,sender:{id:'sender'}};
}

async function installTask(storage){
  await storage.put(KV,{tag:'task-installed-v1',namespace,taskId,version,manifest:pkg.manifest,manifestHash:pkg.manifestHash,
    contentHash:pkg.manifest.program.sourceHash,scriptId,enabled:true,authorization:installedAuthorization},installedKey(namespace,taskId));
}

function runFor(row,{state='preparing',retirementState='not-started'}={}){
  return {tag:'controller-run',runId:row.runRef.runId,resultId:row.runRef.resultId,namespace,principal:host.principal,
    registrationId:host.registrationId,hostDocumentId:host.hostDocumentId,hostInstanceId:host.hostInstanceId,
    scriptId,contentHash:pkg.manifest.program.sourceHash,builtinAbi:BUILTIN_ABI,sourceKind:'saved',
    installedTaskAuthorization:{taskId,version,manifestHash:pkg.manifestHash,authorization:installedAuthorization},
    requestId:row.requestId,cloudRequestId:row.requestId,cloudRequestKey:rowKey(row),paramsWire:encodeValue({}),
    selection:row.assignment.target??{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'},
    networkOrigins:[],state,retirementState,cancelSeq:0,ownerEpoch:1,runRevision:1,eventSeq:0,
    resultDeliveryRevoked:false,revision:{sourceHash:pkg.manifest.program.sourceHash}};
}

async function legacyProviderFixture(t){
  const directory=await mkdtemp(join(tmpdir(),'od-browser-provider-integration-'));
  const providerId=randomUUID(),executorId=randomUUID(),credential='legacy-'+randomUUID();
  const jobId=randomUUID(),assignmentId=randomUUID(),claimId='legacy-claim';
  const requestId='cloud:'+assignmentId;
  const runRef={runId:randomUUID(),resultId:randomUUID(),requestId,sourceHash:pkg.manifest.program.sourceHash,
    manifestHash:pkg.manifestHash,grantId:randomUUID()};
  const assignment={assignmentId,executorId,claimId,leaseUntil:fixedNow+90_000,jobId};
  const permit={providerId,assignmentId,permitId:randomUUID(),runRef,leaseUntil:assignment.leaseUntil};
  const providerTask={taskId,version,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
  const target={mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'};
  const job={jobId,state:'admitted',createdAt:1,assignment,task:providerTask,params:{},target,runRef,permit};
  const admissionBody={assignmentId,runRef};
  const legacy={version:1,providerId,executors:{[executorId]:{credential,pairedAt:1}},pairs:{},jobs:{[jobId]:job},
    requests:{['admission:'+assignmentId]:{digest:sha(admissionBody),answer:permit}},faults:{}};
  await writeFile(join(directory,'state.json'),JSON.stringify(legacy));
  let provider=await openProvider({directory,port:0,clock:()=>fixedNow});
  t.after(async()=>{await provider.close();await rm(directory,{recursive:true,force:true});});
  return {directory,provider,providerId,executorId,credential,jobId,assignmentId,claimId,requestId,runRef,assignment,permit,target,
    url:`http://127.0.0.1:${provider.port}`,
    disk:async()=>JSON.parse(await readFile(join(directory,'state.json'),'utf8'))};
}

async function providerPost(provider,path,body={},auth){
  const response=await fetch(`http://127.0.0.1:${provider.port}${path}`,{method:'POST',
    headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error?.message),value.error,{status:response.status});return value;
}

async function connectProvider(t,provider,credential){
  const auth=await providerPost(provider,'/v1/auth',{},credential);
  const ws=new WebSocket(`ws://127.0.0.1:${provider.port}/v1/events`);
  t.after(()=>ws.terminate());
  await new Promise((ok,no)=>{
    ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));
    ws.once('message',data=>{try{assert.equal(JSON.parse(String(data)).type,'authenticated');ok();}catch(error){no(error);}});
    ws.once('error',no);ws.once('close',()=>no(new Error('provider socket closed before authentication')));
  });
  return ws;
}

async function modernProviderFixture(t){
  const directory=await mkdtemp(join(tmpdir(),'od-browser-provider-modern-'));
  const provider=await openProvider({directory,port:0,clock:()=>fixedNow});
  t.after(async()=>{await provider.close();await rm(directory,{recursive:true,force:true});});
  const admin=JSON.parse(await readFile(provider.credentialFile,'utf8')),executorId=randomUUID();
  const paired=await providerPost(provider,'/v1/pair',{executorId,pairingCode:admin.pairingCode});
  const credential=paired.credential,url=`http://127.0.0.1:${provider.port}`;
  const disk=async()=>JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
  return {directory,provider,admin,executorId,credential,paired,url,disk};
}

function legacyConfig(f,{grantId=f.runRef.grantId,enabled=true,namespaceValue=namespace}={}){
  return {url:f.url,providerId:f.providerId,credential:f.credential,executorId:f.executorId,
    namespace:namespaceValue,enabled,tasks:[task],grantId};
}

function legacyRow(f,extra={}){
  return {tag:'cloud-request-v1',requestId:f.requestId,digest:'old-digest',assignment:{...f.assignment,target:f.target},
    params:{},task,grantId:f.runRef.grantId,namespace,state:'prepared',createdAt:1,runId:f.runRef.runId,runRef:f.runRef,
    permit:f.permit,receipt:{receiptId:'old-receipt',digest:'old-receipt-digest'},delivery:{state:'confirmed'},
    ...extra};
}

async function seedModernJob(f,requestKey=randomUUID()){
  return providerPost(f.provider,'/admin/seed',{requestKey,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}},f.admin.adminToken);
}

async function configureModernService(f,{storage=memoryStorage(),grantId=randomUUID(),namespaceValue=namespace}={}){
  const {service,sender}=serviceFixture({storage});
  await storage.put(KV,{url:f.url,providerId:f.provider.providerId,credential:f.credential,executorId:f.executorId,
    pairingId:f.paired.pairingId,pairingGeneration:f.paired.pairingGeneration,namespace:namespaceValue,
    enabled:true,tasks:[task],grantId,claimId:null},CONFIG);
  await storage.put(KV,f.executorId,IDENTITY);await storage.put('runs',{},'@slot');await installTask(storage);
  service.connection('authenticated');service.setReconciled(true);
  return {service,storage,sender,grantId};
}

test('legacy credential adoption maps only original request keys and keeps old Provider once-cache bytes',async t=>{
  const f=await legacyProviderFixture(t),{service,storage}=serviceFixture();
  const before=legacyConfig(f),row=legacyRow(f);
  await storage.put(KV,before,CONFIG);await storage.put(KV,f.executorId,IDENTITY);await storage.put(KV,row,rowKey(row));
  await installTask(storage);await storage.put('runs',runFor(row),row.runRef.runId);
  const unrelatedGrant=legacyRow(f,{requestId:'cloud:'+randomUUID(),grantId:randomUUID(),assignment:{...f.assignment,assignmentId:randomUUID()}});
  const unrelatedNamespace=legacyRow(f,{requestId:'cloud:'+randomUUID(),namespace:'tool:other',assignment:{...f.assignment,assignmentId:randomUUID()}});
  await storage.put(KV,unrelatedGrant,rowKey(unrelatedGrant));await storage.put(KV,unrelatedNamespace,rowKey(unrelatedNamespace));
  const diskBefore=await f.disk(),auth=await service.post(before,'auth',{});
  const adopted=await service.adoptPairing(before,auth);
  assert.equal(adopted.pairingId,auth.pairingId);
  assert.equal(adopted.pairingGeneration,auth.pairingGeneration);
  assert.deepEqual(adopted.legacyPairing.requestKeys,[rowKey(row)]);
  assert.deepEqual(await storage.get(KV,rowKey(row)),row,'adoptPairing must not rewrite old rows, runRef, permit, receipt, body or digest');
  assert.deepEqual((await f.disk()).requests,diskBefore.requests,'Browser adoption must not mutate Provider once-cache');
  await service.permit(await storage.get('runs',row.runRef.runId));
  const permitted=await storage.get(KV,rowKey(row)),diskAfter=await f.disk();
  assert.equal(permitted.state,'permitted');
  assert.deepEqual(permitted.permit,f.permit);
  assert.equal(diskAfter.requests['admission:'+f.assignmentId].digest,sha({assignmentId:f.assignmentId,runRef:f.runRef}),
    'legacy admission cache stays keyed to the original body without binding');
  assert.equal(Object.keys(diskAfter.requests).filter(key=>key==='admission:'+f.assignmentId).length,1);
});

test('service restart and repeated adopt keep old rows and legacy Provider cache unchanged',async t=>{
  const f=await legacyProviderFixture(t),storage=memoryStorage();
  let fx=serviceFixture({storage}),before=legacyConfig(f),row=legacyRow(f);
  await storage.put(KV,before,CONFIG);await storage.put(KV,f.executorId,IDENTITY);await storage.put(KV,row,rowKey(row));
  const auth=await fx.service.post(before,'auth',{}),adopted=await fx.service.adoptPairing(before,auth);
  await storage.put(KV,adopted,CONFIG);
  const rowAfterFirst=await storage.get(KV,rowKey(row)),providerAfterFirst=await f.disk();
  fx=serviceFixture({storage});
  const authAfterRestart=await fx.service.post(adopted,'auth',{}),again=await fx.service.adoptPairing(adopted,authAfterRestart);
  assert.deepEqual(again,adopted);
  assert.deepEqual(await storage.get(KV,rowKey(row)),rowAfterFirst);
  assert.deepEqual(await f.disk(),providerAfterFirst);
});

test('adoptPairing rejects stale, partial, foreign and invalid legacy inputs transactionally',async t=>{
  const f=await legacyProviderFixture(t);
  for(const mutate of [
    auth=>({...auth,expiresAt:fixedNow}),
    auth=>({...auth,pairingGeneration:0}),
    auth=>({...auth,executorId:randomUUID()}),
    auth=>{const copy={...auth};delete copy.pairingId;return copy;}
  ]){
    const {service,storage}=serviceFixture(),before=legacyConfig(f),auth=mutate(await service.post(before,'auth',{}));
    await storage.put(KV,before,CONFIG);await storage.put(KV,f.executorId,IDENTITY);
    await assert.rejects(service.adoptPairing(before,auth),errorCode('E_PAIRING'));
    assert.deepEqual(await storage.get(KV,CONFIG),before);
  }
  {
    const {service,storage}=serviceFixture(),before=legacyConfig(f),auth=await service.post(before,'auth',{});
    await storage.put(KV,before,CONFIG);await storage.put(KV,f.executorId,IDENTITY);
    await assert.rejects(service.adoptPairing(before,auth,{isCurrent:()=>false}),errorCode('E_CLOUD_FENCED'));
    assert.deepEqual(await storage.get(KV,CONFIG),before);
  }
  {
    const {service,storage}=serviceFixture(),before=legacyConfig(f),auth=await service.post(before,'auth',{}),drifted={...before,grantId:randomUUID()};
    await storage.put(KV,drifted,CONFIG);await storage.put(KV,f.executorId,IDENTITY);
    await assert.rejects(service.adoptPairing(before,auth),errorCode('E_CLOUD_FENCED'));
    assert.deepEqual(await storage.get(KV,CONFIG),drifted);
  }
  {
    const {service,storage}=serviceFixture(),before=legacyConfig(f),auth=await service.post(before,'auth',{}),bad=legacyRow(f,{assignment:{...f.assignment,attemptEpoch:2}});
    await storage.put(KV,before,CONFIG);await storage.put(KV,f.executorId,IDENTITY);await storage.put(KV,bad,rowKey(bad));
    await assert.rejects(service.adoptPairing(before,auth),errorCode('E_REQUEST_CONFLICT'));
    assert.deepEqual(await storage.get(KV,CONFIG),before);
    assert.deepEqual(await storage.get(KV,rowKey(bad)),bad);
  }
});

test('modern pairing uses new claim storage and does not associate other grants, namespaces or pairs',async t=>{
  const f=await legacyProviderFixture(t),{service,storage,sender}=serviceFixture();
  const before=legacyConfig(f),auth=await service.post(before,'auth',{});
  await storage.put(KV,before,CONFIG);await storage.put(KV,f.executorId,IDENTITY);
  const same=legacyRow(f),otherGrant=legacyRow(f,{requestId:'cloud:'+randomUUID(),grantId:randomUUID(),assignment:{...f.assignment,assignmentId:randomUUID()}});
  const otherNamespace=legacyRow(f,{requestId:'cloud:'+randomUUID(),namespace:'tool:other',assignment:{...f.assignment,assignmentId:randomUUID()}});
  await storage.put(KV,same,rowKey(same));await storage.put(KV,otherGrant,rowKey(otherGrant));await storage.put(KV,otherNamespace,rowKey(otherNamespace));
  const adopted=await service.adoptPairing(before,auth);
  assert.deepEqual(adopted.legacyPairing.requestKeys,[rowKey(same)]);
  const modernConfig={...adopted,grantId:randomUUID(),claimId:null};
  await storage.put(KV,modernConfig,CONFIG);await storage.put('runs',{'@slot':null},'@slot');
  assert.equal(await service.cloudNext({},sender),null,'real Provider has no queued job, so no synthetic local run is created');
});

test('modern Provider claim binds a fresh Browser run and permit with full pairing identity',async t=>{
  const f=await modernProviderFixture(t);await connectProvider(t,f.provider,f.credential);await seedModernJob(f,'modern-claim');
  const {service,storage,sender,grantId}=await configureModernService(f);
  const next=await service.cloudNext({},sender);assert.match(next.requestId,/^cloud:/);
  const row=(await storage.all(KV)).find(value=>value?.tag==='cloud-request-v1');
  assert.equal(row.requestId,next.requestId);assert.equal(row.grantId,grantId);assert.equal(row.namespace,namespace);
  assert.equal(row.identity.pairing.pairingId,f.paired.pairingId);
  assert.equal(row.identity.pairing.pairingGeneration,f.paired.pairingGeneration);
  for(const key of bindingKeys)assert.notEqual(row.assignment[key],undefined,key);
  const run={tag:'controller-run',runId:randomUUID(),resultId:randomUUID(),namespace,principal:host.principal,
    registrationId:host.registrationId,hostDocumentId:host.hostDocumentId,hostInstanceId:host.hostInstanceId,
    scriptId,contentHash:pkg.manifest.program.sourceHash,builtinAbi:BUILTIN_ABI,sourceKind:'saved',
    installedTaskAuthorization:{taskId,version,manifestHash:pkg.manifestHash,authorization:installedAuthorization},
    requestId:row.requestId,paramsWire:encodeValue(row.params),selection:row.assignment.target,networkOrigins:[],
    state:'preparing',retirementState:'not-started',cancelSeq:0,ownerEpoch:1,runRevision:1,eventSeq:0,
    resultDeliveryRevoked:false,revision:{sourceHash:pkg.manifest.program.sourceHash}};
  await storage.transaction([KV,'runs','commandJournal','results'],'readwrite',async tx=>{
    await service.bind(tx,run,{cloudRequestId:row.requestId},host);await tx.put('runs',run,run.runId);
  });
  await service.permit(run);
  const permitted=await storage.get(KV,run.cloudRequestKey);
  assert.equal(permitted.state,'permitted');
  for(const key of bindingKeys)assert.equal(permitted.permit[key],permitted.assignment[key],key);
  assert.deepEqual(permitted.permit.runRef,permitted.runRef);
});

test('remote runRef without local row blocks cached claim replay instead of creating a second Browser row',async t=>{
  const f=await modernProviderFixture(t);await connectProvider(t,f.provider,f.credential);await seedModernJob(f,'remote-runref');
  const claimId='remote-claim',tasks=[{taskId,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash}];
  const assignment=(await providerPost(f.provider,'/v1/claim',{claimId,tasks},f.credential)).assignment;
  const runRef={runId:randomUUID(),resultId:randomUUID(),requestId:'cloud:'+assignment.assignmentId,
    sourceHash:pkg.manifest.program.sourceHash,manifestHash:pkg.manifestHash,grantId:randomUUID()};
  await providerPost(f.provider,'/v1/admission',{assignmentId:assignment.assignmentId,runRef},f.credential);
  const {service,storage,sender}=await configureModernService(f,{grantId:runRef.grantId});
  const config=await storage.get(KV,CONFIG);config.claimId=claimId;await storage.put(KV,config,CONFIG);
  await service.reconcile();
  await assert.rejects(service.cloudNext({},sender),errorCode('E_RUN_REF'));
  assert.equal((await storage.all(KV)).filter(value=>value?.tag==='cloud-request-v1').length,0);
  assert.equal((await storage.all('runs')).filter(value=>value?.tag==='controller-run').length,0);
});

test('expired local legacy permit cannot be revived by Provider admission cache or a newer lease',async t=>{
  const f=await legacyProviderFixture(t),{service,storage}=serviceFixture();
  const before=legacyConfig(f),row=legacyRow(f,{permit:{...f.permit,leaseUntil:fixedNow-1},receipt:null,delivery:null,state:'prepared'});
  await storage.put(KV,before,CONFIG);await storage.put(KV,f.executorId,IDENTITY);await storage.put(KV,row,rowKey(row));
  await installTask(storage);const auth=await service.post(before,'auth',{}),adopted=await service.adoptPairing(before,auth);
  await storage.put(KV,adopted,CONFIG);const run=runFor(row);await storage.put('runs',run,run.runId);
  await assert.rejects(service.permit(run),errorCode('E_PERMIT'));
  assert.deepEqual(await storage.get(KV,rowKey(row)),row);
});

test('legacy rows from another active grant, namespace or pairing cannot resolve or activate',async t=>{
  const f=await legacyProviderFixture(t);
  for(const [name,configPatch,rowPatch] of [
    ['grant',{grantId:randomUUID()},{}],
    ['namespace',{namespace:'tool:other'},{}],
    ['pairing',{pairingId:randomUUID(),pairingGeneration:7,legacyPairing:null},{}]
  ]){
    const {service,storage,sender}=serviceFixture(),before=legacyConfig(f),auth=await service.post(before,'auth',{});
    await storage.put(KV,before,CONFIG);await storage.put(KV,f.executorId,IDENTITY);
    const adopted=await service.adoptPairing(before,auth),config={...adopted,...configPatch};
    if(config.legacyPairing===null)delete config.legacyPairing;
    const row=legacyRow(f,rowPatch);await storage.put(KV,config,CONFIG);await storage.put(KV,row,rowKey(row));await installTask(storage);
    await assert.rejects(service.cloudResolve({requestId:row.requestId},sender),errorIn(['E_TASK','E_CLOUD_REVOKED']));
    const run=runFor(row);await assert.rejects(storage.transaction([KV,'runs','commandJournal','results'],'readwrite',
      tx=>service.bind(tx,run,{cloudRequestId:row.requestId},host)),errorCode('E_CLOUD_REVOKED'));
    assert.deepEqual(await storage.get(KV,rowKey(row)),row);
  }
});

test('cloudStatus projects actual grants, slot resources and config drift without scanning journal in cheap mode',async()=>{
  const cases=[['granted','granted'],['revoked','revoked'],['unknown','unknown']];
  for(const [grantMode,expected] of cases){
    const {service,storage,sender}=serviceFixture({grantMode});
    await storage.put(KV,{providerId:'p',url:'https://provider.example',enabled:true,namespace,executorId:'e',tasks:[task]},CONFIG);
    assert.equal((await service.cloudStatus({includeRequests:false},sender)).siteAuthorization,expected);
  }
  {
    const {service,storage,sender}=serviceFixture();
    await storage.put(KV,{providerId:'p',url:'https://provider.example',enabled:true,namespace,executorId:'e',tasks:[]},CONFIG);
    assert.equal((await service.cloudStatus({includeRequests:false},sender)).siteAuthorization,'none');
  }
  {
    let calls=0;
    const storage=memoryStorage(),{service,sender}=serviceFixture({storage,onCurrentHost:async tx=>{
      if(++calls===2){const c=await tx.get(KV,CONFIG);await tx.put(KV,{...c,grantId:'drifted'},CONFIG);}
    }});
    await storage.put(KV,{providerId:'p',url:'https://provider.example',enabled:true,namespace,executorId:'e',grantId:'original',tasks:[task]},CONFIG);
    assert.equal((await service.cloudStatus({includeRequests:false},sender)).siteAuthorization,'unknown');
  }
  const slotCases=[
    [{preview:true},null,'preview',false],
    [{currentRunId:'local'}, {runId:'local',state:'running',retirementState:'not-started'}, 'local-running', false],
    [{currentRunId:'cloud'}, {runId:'cloud',state:'running',cloudRequestId:'cloud:x',cloudRequestKey:'cloud:request:cloud:x',retirementState:'not-started'}, 'cloud-running', false],
    [{currentRunId:'stopping'}, {runId:'stopping',state:'stopping',retirementState:'not-started'}, 'stopping', true],
    [{currentRunId:'done'}, {runId:'done',state:'completed',retirementState:'fenced'}, 'retirement-pending', true],
    [{currentRunId:'missing'}, null, 'unknown', true]
  ];
  for(const [slot,run,slotState,pendingResources] of slotCases){
    const {service,storage,sender}=serviceFixture();
    await storage.put(KV,{providerId:'p',url:'https://provider.example',enabled:true,namespace,executorId:'e',tasks:[]},CONFIG);
    await storage.put('runs',slot,'@slot');if(run)await storage.put('runs',run,run.runId);
    for(let i=0;i<8;i++)await storage.put(KV,{tag:'cloud-request-v1',namespace,requestId:'old-'+i,state:'finished',createdAt:100+i},PREFIX+'old-'+i);
    const status=await service.cloudStatus({limit:5},sender);
    assert.equal(status.slotState,slotState);
    assert.equal(status.pendingResources,pendingResources);
    assert.equal(status.requestTotal,8,'resource projection must not derive from the newest five rows');
  }
  {
    const {service,storage,sender}=serviceFixture();
    await storage.put(KV,{providerId:'p',url:'https://provider.example',enabled:true,namespace,executorId:'e',tasks:[]},CONFIG);
    await storage.put('runs',{},'@slot');await storage.put('commandJournal',{tag:'controller-operation',runId:'r',state:'effect_unknown'},'op');
    const status=await service.cloudStatus({includeRequests:false},sender);
    assert.equal(status.requestTotal,null);
    assert.equal(storage.log.some(([kind,name])=>kind==='all'&&(name===KV||name==='commandJournal')),false,
      'cheap status must not scan all cloud history or journal rows');
  }
});

test('unknown side effects project only from interrupted unresolved operations or paused_unknown and reconcile preserves native facts',async t=>{
  const f=await legacyProviderFixture(t),{service,storage,sender}=serviceFixture();
  const row=legacyRow(f,{state:'permitted',receipt:null,delivery:null});
  const c=legacyConfig(f);await storage.put(KV,c,CONFIG);await storage.put(KV,f.executorId,IDENTITY);await storage.put(KV,row,rowKey(row));
  const auth=await service.post(c,'auth',{}),adopted={...await service.adoptPairing(c,auth),enabled:true};
  await storage.put(KV,adopted,CONFIG);await storage.put(KV,f.executorId,IDENTITY);await installTask(storage);
  const run={...runFor(row,{state:'interrupted',retirementState:'fenced'}),cancelSeq:1,terminalReason:'E_INTERRUPTED'};
  await storage.put('runs',run,run.runId);
  const result={tag:'controller-result',runId:run.runId,resultId:run.resultId,namespace,state:'interrupted',
    revision:{sourceHash:pkg.manifest.program.sourceHash},outcome:{ok:false,error:{code:'E_INTERRUPTED'}}};
  await storage.put('results',result,run.resultId);
  await storage.put('commandJournal',{tag:'controller-operation',runId:run.runId,state:'effect_unknown'},'op-unknown');
  await service.reconcile();
  const unknown=await storage.get(KV,rowKey(row));
  assert.equal(unknown.state,'OUTCOME_UNKNOWN');
  assert.equal(unknown.reason,'E_OUTCOME_UNKNOWN');
  assert.deepEqual(await storage.get('runs',run.runId),run);
  assert.deepEqual(await storage.get('results',run.resultId),result);
  const status=await service.cloudStatus({limit:1},sender);
  assert.equal(status.requests[0].outcomeUnknown,true);
  assert.equal(status.slotState,'available');

  const {service:service2,storage:storage2,sender:sender2}=serviceFixture();
  await storage2.put(KV,{providerId:'p',url:'https://provider.example',enabled:true,namespace,executorId:'e',tasks:[]},CONFIG);
  await storage2.put(KV,{tag:'cloud-request-v1',namespace,requestId:'fenced',state:'cancellation-pending',runId:'fenced-run',createdAt:1},PREFIX+'fenced');
  await storage2.put('runs',{runId:'fenced-run',state:'interrupted',retirementState:'fenced'},'fenced-run');
  await storage2.put('commandJournal',{tag:'controller-operation',runId:'fenced-run',state:'confirmed'},'op-confirmed');
  assert.equal((await service2.cloudStatus({limit:1},sender2)).requests[0].outcomeUnknown,false,'fenced alone is not an unknown side effect');
  await storage2.put('runs',{currentRunId:'paused'},'@slot');
  await storage2.put('runs',{runId:'paused',state:'paused_unknown',retirementState:'not-started'},'paused');
  assert.equal((await service2.cloudStatus({includeRequests:false},sender2)).slotState,'outcome-unknown');
});

test('Browser rejects forged modern Provider binding before pairing or WebSocket reconciliation',async()=>{
  {
    const storage=memoryStorage();
    const fetcher=async(url,init)=>{
      assert.equal(url,'http://127.0.0.1:43112/v1/pair');
      const body=JSON.parse(init.body);
      return {ok:true,json:async()=>({providerId:'provider-a',executorId:'foreign-'+body.executorId,
        credential:'credential',pairingId:randomUUID(),pairingGeneration:1})};
    };
    const service=createCloudService({storage,api:apiWithGrants(),clock:{now:()=>fixedNow},
      assertHost:async()=>host,currentHost:async()=>{},resolveTask:async()=>task,emitToHost:async()=>{},fetcher});
    await assert.rejects(service.cloudPair({url:'http://127.0.0.1:43112',providerId:'provider-a',pairingCode:'code',allowLoopback:true},{}),
      errorCode('E_PAIRING'));
    assert.equal(await storage.get(KV,CONFIG),undefined);
  }
  {
    const events=[],posts=[];
    class Socket{
      constructor(url){this.url=url;events.push(this);}
      send(message){this.sent=message;}
      close(){this.onclose?.();}
    }
    const config={enabled:true,url:'https://provider.example',providerId:'provider-a',executorId:'executor-a',
      pairingId:'pair-a',pairingGeneration:4,tasks:[]};
    const service={retryRevocation:async()=>{},read:async()=>config,
      post:async(_c,path,body)=>{posts.push([path,body]);return path==='auth'?
        {providerId:'provider-a',executorId:'executor-a',pairingId:'pair-a',pairingGeneration:4,ticket:'ticket',expiresAt:fixedNow+30_000}:
        {accepted:true};},
      adoptPairing:async c=>c,captureAuthentication:()=>()=>true,
      reconcile:async()=>assert.fail('forged authenticated event must not reconcile'),
      setReconciled:()=>assert.fail('forged authenticated event must not mark reconciled'),
      attachConnection(){},connection:state=>posts.push(['state',state])};
    const connection=createCloudConnection({service,api:{alarms:{onAlarm:{addListener(){}},create(){}}},Socket,clock:{now:()=>fixedNow},random:()=>0.5});
    try{
      await flush();
      assert.equal(events.length,1);
      events[0].onopen();
      assert.equal(JSON.parse(events[0].sent).ticket,'ticket');
      await events[0].onmessage({data:JSON.stringify({type:'authenticated',providerId:'provider-a',
        executorId:'executor-a',pairingId:'pair-a',pairingGeneration:5})});
      assert.equal(posts.some(([path])=>path==='capabilities'),false);
      assert.equal(posts.some(([path])=>path==='auth'),true);
    }finally{connection.stop();}
  }
});
