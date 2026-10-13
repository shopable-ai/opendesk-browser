import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {createConnection} from 'node:net';
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
    const grantId=randomUUID();
    const tasks=[{taskId:pkg.manifest.taskId,manifestHash:pkg.manifestHash,
      sourceHash:pkg.manifest.program.sourceHash}];
    await post('/v1/capabilities',{grantId,tasks});
    const auth=await post('/v1/auth',{});ws=new WebSocket(`ws://127.0.0.1:${p.port}/v1/events`);
    await new Promise((ok,no)=>{ws.once('open',()=>ws.send(JSON.stringify({type:'authenticate',ticket:auth.ticket})));ws.once('message',d=>{assert.equal(JSON.parse(String(d)).type,'authenticated');ok();});ws.once('error',no);});
    const empty={claimId:'empty',grantId,tasks};assert.deepEqual(await post('/v1/claim',empty),{assignment:null});
    const seed={requestKey:'seed',targetExecutorId:executorId,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};
    const cancelled=await post('/admin/seed',{...seed,requestKey:'cancelled-before-claim'},admin.adminToken);
    await post('/admin/cancel',{jobId:cancelled.jobId},admin.adminToken);
    assert.deepEqual(await post('/v1/claim',{claimId:'cancelled-only',grantId,tasks}),{assignment:null});
    const job=await post('/admin/seed',seed,admin.adminToken);assert.deepEqual(await post('/admin/seed',seed,admin.adminToken),job);
    assert.deepEqual(await post('/v1/claim',empty),{assignment:null});
    await assert.rejects(post('/admin/seed',{...seed,params:{name:'different'}},admin.adminToken),{code:'E_REQUEST_CONFLICT'});
    const claim={claimId:'real',grantId,tasks},a=(await post('/v1/claim',claim)).assignment;assert.equal(a.params.name,'Alice');assert.deepEqual((await post('/v1/claim',claim)).assignment,a);
    await assert.rejects(post('/v1/claim',{...claim,tasks:[]}),{code:'E_REQUEST_CONFLICT'});
    const runRef={runId:randomUUID(),resultId:randomUUID(),requestId:'cloud:'+a.assignmentId,sourceHash:pkg.manifest.program.sourceHash,manifestHash:pkg.manifestHash,grantId},admission={assignmentId:a.assignmentId,runRef,resultAllowed:false};
    await assert.rejects(post('/v1/admission',{...admission,
      runRef:{...runRef,grantId:randomUUID()}}),{code:'E_RUN_REF'},
      'Task identity is not a substitute for the installed Cloud approval generation');
    await assert.rejects(post('/v1/admission',{...admission,
      runRef:{...runRef,requestId:'cloud:'+randomUUID()}}),{code:'E_RUN_REF'},
      'RunRef must belong to the exact Provider assignment');
    await post('/admin/fault',{path:'/v1/admission',count:1},admin.adminToken);await assert.rejects(post('/v1/admission',admission));
    const permit=await post('/v1/admission',admission);assert.deepEqual(await post('/v1/admission',admission),permit);
    await assert.rejects(post('/v1/admission',{...admission,runRef:{...runRef,runId:randomUUID()}}),{code:'E_REQUEST_CONFLICT'});
    const receipt={assignmentId:a.assignmentId,receiptKey:runRef.resultId,runRef,
      result:{visibility:'status-only',state:'completed',retirementState:'released'}};
    await assert.rejects(post('/v1/receipt',{...receipt,receiptKey:randomUUID()}),
      {code:'E_RECEIPT_KEY'},'Receipt key is the original immutable ResultId');
    await post('/admin/fault',{path:'/v1/receipt',count:1},admin.adminToken);await assert.rejects(post('/v1/receipt',receipt));
    const ack=await post('/v1/receipt',receipt);
    await assert.rejects(post('/v1/receipt',{...receipt,receiptKey:randomUUID(),
      result:{visibility:'status-only',state:'failed',retirementState:'released'}}),
      {code:'E_RECEIPT_KEY'});
    await assert.rejects(post('/v1/receipt',{...receipt,
      result:{visibility:'status-only',state:'failed',retirementState:'released'}}),
      {code:'E_REQUEST_CONFLICT'},'Same ResultId cannot replace confirmed completion');
    assert.deepEqual(await post('/v1/receipt',receipt),ack);
    ws.terminate();await p.close();p=await openProvider({directory,port:0});
    assert.deepEqual(await post('/v1/claim',claim),{assignment:a});assert.deepEqual(await post('/v1/receipt',receipt),ack);
    const reconciled=await post('/v1/reconcile',{});assert.deepEqual(reconciled.assignments[0].runRef,runRef);assert.equal(reconciled.assignments[0].receipt.receiptId,ack.receiptId);
    const state=await post('/admin/state',{},admin.adminToken);assert.equal(Object.keys(state.jobs).length,2);assert.equal(state.jobs[cancelled.jobId].assignment,undefined);assert.equal(state.jobs[job.jobId].runRef.runId,runRef.runId);
    const suspended=await post('/v1/suspend',{grantId});
    assert.deepEqual(suspended,{suspended:true,grantId});
    assert.deepEqual(await post('/v1/suspend',{grantId}),suspended,'Stop acknowledgement must be idempotent');
    assert.deepEqual(await post('/v1/receipt',receipt),ack,'Confirmed receipt remains durable after Stop');
    assert.deepEqual(await post('/admin/seed',seed,admin.adminToken),job,
      'A previously accepted requestKey still returns its original JobId after Stop');
    await assert.rejects(post('/admin/seed',{...seed,requestKey:'stopped-new-job'},admin.adminToken),
      {code:'E_CLOUD_STOPPED'},'Stop must reject new external work even before Browser reconnects');
    await assert.rejects(post('/v1/claim',{claimId:'stopped-claim',grantId,tasks}),
      {code:'E_CLOUD_STOPPED'});
    await post('/v1/capabilities',{grantId,tasks});
    await assert.rejects(post('/admin/seed',{...seed,requestKey:'delayed-old-capabilities'},admin.adminToken),
      {code:'E_CLOUD_STOPPED'},'A late same-generation sync cannot resume stopped hosting');
    await post('/admin/cancel',{jobId:job.jobId},admin.adminToken);
    await assert.rejects(post('/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}),
      {code:'E_LEASE'});
    const resumedGrant=randomUUID();
    await post('/v1/capabilities',{grantId:resumedGrant,tasks});
    assert.ok((await post('/admin/seed',{...seed,requestKey:'explicit-new-grant'},admin.adminToken)).jobId);
    await assert.rejects(post('/v1/capabilities',{grantId,tasks}),{code:'E_GRANT_STALE'});
    await assert.rejects(post('/admin/seed',{...seed,requestKey:'evil',sourceUtf8:'return 1'},admin.adminToken),{code:'E_SCHEMA'});
  }finally{ws?.terminate();await p.close();await rm(directory,{recursive:true,force:true});}
});

const tasks=[{taskId:pkg.manifest.taskId,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash}];
const bindingKeys=['providerId','executorId','pairingId','pairingGeneration','attemptEpoch','claimId','jobId','assignmentId'];
const runRefFor=a=>({runId:randomUUID(),resultId:randomUUID(),requestId:'cloud:'+a.assignmentId,sourceHash:pkg.manifest.program.sourceHash,manifestHash:pkg.manifestHash,grantId:randomUUID()});
const bindingFor=a=>Object.fromEntries(bindingKeys.map(k=>[k,a[k]]));
async function fixture(t,{clock,legacy}={}){
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-provider-security-')),sockets=[];
  if(legacy)await writeFile(join(directory,'state.json'),JSON.stringify(legacy));
  let p=await openProvider({directory,port:0,...(clock?{clock}:{})}),credential;
  const admin=JSON.parse(await readFile(p.credentialFile,'utf8'));
  t.after(async()=>{for(const ws of sockets)ws.terminate();await p.close();await rm(directory,{recursive:true,force:true});});
  const h={directory,admin,get provider(){return p;},get credential(){return credential;},set credential(v){credential=v;},
    async post(path,body={},auth=credential){
      const r=await fetch(`http://127.0.0.1:${p.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)});
      const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error.message),value.error,{status:r.status});return value;
    },
    async pair(executorId=randomUUID()){const paired=await h.post('/v1/pair',{executorId,pairingCode:admin.pairingCode});credential=paired.credential;return paired;},
    async socket(ticket,{rejected=false}={}){
      const ws=new WebSocket(`ws://127.0.0.1:${p.port}/v1/events`);sockets.push(ws);
      await new Promise((ok,no)=>{ws.once('open',ok);ws.once('error',no);});
      const outcome=new Promise((ok,no)=>{
        ws.once('message',d=>{try{const message=JSON.parse(String(d));assert.equal(rejected,false,'retired ticket must not authenticate');assert.equal(message.type,'authenticated');ok(message);}catch(e){no(e);}});
        ws.once('close',()=>rejected?ok(null):no(Error('WebSocket closed before authentication')));ws.once('error',no);
      });
      ws.send(JSON.stringify({type:'authenticate',ticket}));const auth=await outcome;return {ws,auth};
    },
    async connect(){const ticket=await h.post('/v1/auth');return h.socket(ticket.ticket);},
    async seed(requestKey=randomUUID()){return h.post('/admin/seed',{requestKey,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}},admin.adminToken);},
    async assignment(claimId=randomUUID()){await h.seed();return (await h.post('/v1/claim',{claimId,tasks})).assignment;},
    async disk(){return JSON.parse(await readFile(join(directory,'state.json'),'utf8'));},
    async restart(snapshot){for(const ws of sockets)ws.terminate();await p.close();if(snapshot)await writeFile(join(directory,'state.json'),JSON.stringify(snapshot));p=await openProvider({directory,port:0,...(clock?{clock}:{})});}
  };
  return h;
}
async function pong(ws){
  const response=new Promise((ok,no)=>{ws.once('message',d=>{try{assert.equal(JSON.parse(String(d)).type,'pong');ok();}catch(e){no(e);}});ws.once('error',no);});
  ws.send(JSON.stringify({type:'ping'}));await response;
}

test('provider rejects missing fields, incomplete runRef, forged binding, old epochs and receipt keys',async t=>{
  const h=await fixture(t),pair=await h.pair(),connected=await h.connect(),a=await h.assignment();
  for(const k of ['providerId','executorId','pairingId','pairingGeneration'])assert.equal(connected.auth[k],pair[k]);
  for(const k of bindingKeys)assert.notEqual(a[k],undefined,k);assert.equal(a.attemptEpoch,1);
  for(const body of [null,[],{},'string',{assignmentId:a.assignmentId},{runRef:{}}])await assert.rejects(h.post('/v1/admission',body),{code:'E_SCHEMA'});
  const ref=runRefFor(a),admission={assignmentId:a.assignmentId,runRef:ref};
  for(const k of Object.keys(ref)){
    const missing={...ref};delete missing[k];await assert.rejects(h.post('/v1/admission',{...admission,runRef:missing}),{code:'E_SCHEMA'});
    for(const v of ['', '   ',null,1])await assert.rejects(h.post('/v1/admission',{...admission,runRef:{...ref,[k]:v}}),{code:'E_RUN_REF'});
  }
  await assert.rejects(h.post('/v1/admission',{...admission,runRef:{...ref,extra:true}}),{code:'E_SCHEMA'});
  await assert.rejects(h.post('/v1/admission',{...admission,runRef:{...ref,requestId:'cloud:other'}}),{code:'E_RUN_REF'});
  for(const k of ['sourceHash','manifestHash'])await assert.rejects(h.post('/v1/admission',{...admission,runRef:{...ref,[k]:'bad'}}),{code:'E_TASK'});
  await assert.rejects(h.post('/v1/renew',{assignmentId:a.assignmentId}),{code:'E_SCHEMA'});
  for(const permitId of ['',null,'fake'])await assert.rejects(h.post('/v1/renew',{assignmentId:a.assignmentId,permitId}),{code:'E_LEASE'});
  assert.equal((await h.disk()).jobs[a.jobId].permit,undefined);
  for(const epoch of [0,2,'1',null])await assert.rejects(h.post('/v1/admission',{...admission,attemptEpoch:epoch}),{code:'E_ATTEMPT'});
  for(const k of bindingKeys.filter(k=>k!=='assignmentId'&&k!=='attemptEpoch'))await assert.rejects(h.post('/v1/admission',{...admission,[k]:k==='pairingGeneration'?0:'other'}),{code:'E_BINDING'});
  await assert.rejects(h.post('/v1/admission',{...admission,binding:{}}),{code:'E_SCHEMA'});
  const permit=await h.post('/v1/admission',admission);
  assert.deepEqual(bindingFor(permit),bindingFor(a));
  const receipt={assignmentId:a.assignmentId,receiptKey:ref.resultId,runRef:ref,result:{state:'completed',retirementState:'released'}};
  const bodies=[['/v1/admission',admission],['/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}],['/v1/cancellation',{assignmentId:a.assignmentId}],['/v1/receipt',receipt]];
  for(const [path,body] of bodies){
    for(const epoch of [0,2,'1'])await assert.rejects(h.post(path,{...body,attemptEpoch:epoch}),{code:'E_ATTEMPT'});
    for(const k of bindingKeys.filter(k=>k!=='assignmentId'&&k!=='attemptEpoch'))await assert.rejects(h.post(path,{...body,[k]:k==='pairingGeneration'?0:'other'}),{code:'E_BINDING'});
    await assert.rejects(h.post(path,{...body,binding:{...bindingFor(a),attemptEpoch:0}}),{code:'E_ATTEMPT'});
  }
  for(const receiptKey of ['wrong','',null])await assert.rejects(h.post('/v1/receipt',{...receipt,receiptKey}),{code:'E_RECEIPT_KEY'});
  await assert.rejects(h.post('/v1/receipt',{...receipt,runRef:{...ref,resultId:randomUUID()}}),{code:'E_RUN_REF'});
  assert.equal((await h.disk()).jobs[a.jobId].receipt,undefined);
  await h.post('/v1/renew',{...bodies[1][1],...bindingFor(a)});
  await h.post('/v1/cancellation',{assignmentId:a.assignmentId,binding:bindingFor(a)});
  await h.post('/v1/receipt',{...receipt,...bindingFor(a)});
  const reconcile=await h.post('/v1/reconcile');assert.deepEqual(bindingFor(reconcile.assignments[0]),bindingFor(a));
  await h.pair();for(const [path,body] of bodies)await assert.rejects(h.post(path,body),{code:'E_ASSIGNMENT'});assert.deepEqual((await h.post('/v1/reconcile')).assignments,[]);
});

test('renew commits assignment/current permit together while admission keeps the issued snapshot',async t=>{
  let now=1000;const h=await fixture(t,{clock:()=>now});await h.pair();await h.connect();const a=await h.assignment(),ref=runRefFor(a),body={assignmentId:a.assignmentId,runRef:ref};
  const issued=await h.post('/v1/admission',body),before=await h.disk();now+=1000;
  await mkdir(join(h.directory,'state.json.tmp'));
  await assert.rejects(h.post('/v1/renew',{assignmentId:a.assignmentId,permitId:issued.permitId}));
  assert.deepEqual(await h.disk(),before);await rm(join(h.directory,'state.json.tmp'),{recursive:true});
  let r=await h.post('/v1/reconcile');assert.equal(r.assignments[0].permit.leaseUntil,issued.leaseUntil);
  const renew=await h.post('/v1/renew',{assignmentId:a.assignmentId,permitId:issued.permitId});assert.equal(renew.leaseUntil,now+90000);
  assert.deepEqual(await h.post('/v1/admission',body),issued);
  r=await h.post('/v1/reconcile');assert.equal(r.assignments[0].leaseUntil,renew.leaseUntil);assert.equal(r.assignments[0].permit.leaseUntil,renew.leaseUntil);
  const disk=await h.disk();assert.equal(disk.jobs[a.jobId].assignment.leaseUntil,renew.leaseUntil);assert.equal(disk.jobs[a.jobId].permit.leaseUntil,renew.leaseUntil);assert.deepEqual(disk.requests['admission:'+a.assignmentId].answer,issued);
  await h.restart();r=await h.post('/v1/reconcile');assert.equal(r.assignments[0].permit.leaseUntil,renew.leaseUntil);assert.deepEqual(await h.post('/v1/admission',body),issued);
  now=renew.leaseUntil+1;await assert.rejects(h.post('/v1/renew',{assignmentId:a.assignmentId,permitId:issued.permitId}),{code:'E_LEASE'});
  // A completed result remains receiptable after expiry; this is not another admission.
  await h.post('/v1/receipt',{assignmentId:a.assignmentId,receiptKey:ref.resultId,runRef:ref,result:{state:'completed',retirementState:'released'}});
});

test('revoke is durable before ticket/socket retirement, retryable only by the same token/revocation',async t=>{
  const h=await fixture(t),pair=await h.pair(),{ws}=await h.connect(),a=await h.assignment(),ref=runRefFor(a);
  const permit=await h.post('/v1/admission',{assignmentId:a.assignmentId,runRef:ref}),unused=await h.post('/v1/auth');
  const revoke={revocationId:randomUUID(),pairingId:pair.pairingId,pairingGeneration:pair.pairingGeneration},before=await h.disk();
  await mkdir(join(h.directory,'state.json.tmp'));await assert.rejects(h.post('/v1/revoke',revoke));assert.deepEqual(await h.disk(),before);
  await pong(ws);await h.socket(unused.ticket);await rm(join(h.directory,'state.json.tmp'),{recursive:true});
  const retiredTicket=await h.post('/v1/auth');
  const closed=new Promise((ok,no)=>{ws.once('close',()=>{h.disk().then(d=>{try{assert.equal(d.executors[pair.executorId].revocation.revoked,true);ok();}catch(e){no(e);}},no);});});
  await h.post('/admin/fault',{path:'/v1/revoke',count:1},h.admin.adminToken);await assert.rejects(h.post('/v1/revoke',revoke));await closed;
  const ack=await h.post('/v1/revoke',revoke);assert.deepEqual(ack,{providerId:pair.providerId,pairingId:pair.pairingId,pairingGeneration:pair.pairingGeneration,revocationId:revoke.revocationId,revoked:true});
  await h.socket(retiredTicket.ticket,{rejected:true});
  const receipt={assignmentId:a.assignmentId,receiptKey:ref.resultId,runRef:ref,result:{state:'completed'}};
  const blocked=[['/v1/auth',{}],['/v1/capabilities',{tasks}],['/v1/claim',{claimId:'revoked',tasks}],['/v1/admission',{assignmentId:a.assignmentId,runRef:ref}],['/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}],['/v1/cancellation',{assignmentId:a.assignmentId}],['/v1/receipt',receipt],['/v1/reconcile',{}]];
  for(const [path,body] of blocked)await assert.rejects(h.post(path,body),{code:'E_AUTH',status:401});
  await assert.rejects(h.post('/v1/revoke',{revocationId:randomUUID()}),{code:'E_AUTH'});
  await assert.rejects(h.post('/v1/revoke',{...revoke,pairingGeneration:pair.pairingGeneration-1}),{code:'E_PAIRING'});
  assert.deepEqual(await h.post('/v1/revoke',revoke),ack);assert.deepEqual(await h.post('/v1/revoke',{revocationId:revoke.revocationId}),ack);
  await h.restart();assert.deepEqual(await h.post('/v1/revoke',revoke),ack);await assert.rejects(h.post('/v1/auth'),{code:'E_AUTH'});
  const next=await h.pair(pair.executorId);assert.equal(next.pairingGeneration,pair.pairingGeneration+1);assert.notEqual(next.pairingId,pair.pairingId);assert.notEqual(next.credential,pair.credential);
  for(const [path,body] of [...blocked,['/v1/revoke',revoke]])await assert.rejects(h.post(path,body,pair.credential),{code:'E_AUTH'});
  for(const [path,body] of blocked.filter(([p])=>['/v1/admission','/v1/renew','/v1/cancellation','/v1/receipt'].includes(p)))await assert.rejects(h.post(path,body),{code:'E_PAIRING'});
  await h.connect();assert.deepEqual(await h.post('/v1/claim',{claimId:a.claimId,tasks}),{assignment:null});assert.deepEqual((await h.post('/v1/reconcile')).assignments,[]);
  assert.equal((await h.disk()).jobs[a.jobId].assignment.pairingId,pair.pairingId);
});

test('active re-pair rotates credential and invalidates both connected sockets and unused tickets',async t=>{
  const h=await fixture(t),first=await h.pair(),{ws}=await h.connect(),ticket=await h.post('/v1/auth'),a=await h.assignment();
  await mkdir(join(h.directory,'state.json.tmp'));await assert.rejects(h.pair(first.executorId));await pong(ws);await h.socket(ticket.ticket);await rm(join(h.directory,'state.json.tmp'),{recursive:true});
  const held=await h.post('/v1/auth'),closed=new Promise(ok=>ws.once('close',ok)),next=await h.pair(first.executorId);await closed;
  assert.equal(next.pairingGeneration,first.pairingGeneration+1);await h.socket(held.ticket,{rejected:true});
  await assert.rejects(h.post('/v1/auth',{},first.credential),{code:'E_AUTH'});await assert.rejects(h.post('/v1/cancellation',{assignmentId:a.assignmentId}),{code:'E_PAIRING'});
  await h.restart();const auth=await h.post('/v1/auth');assert.equal(auth.pairingId,next.pairingId);assert.equal(auth.pairingGeneration,next.pairingGeneration);
});

test('legacy migration retains credential, jobs and idempotent history only for the original pairing',async t=>{
  const executorId=randomUUID(),jobId=randomUUID(),assignmentId=randomUUID(),providerId=randomUUID(),credential='legacy-credential';
  const assignment={assignmentId,executorId,claimId:'legacy-claim',leaseUntil:91000},ref=runRefFor(assignment),claim={claimId:assignment.claimId,tasks};
  const task={taskId:pkg.manifest.taskId,version:pkg.manifest.version,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
  const oldPermit={providerId,assignmentId,permitId:randomUUID(),runRef:ref,leaseUntil:assignment.leaseUntil};
  const job={jobId,state:'admitted',assignment,task,runRef:ref,permit:oldPermit,params:{name:'Alice'},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};
  const legacy={version:1,providerId,executors:{[executorId]:{credential,pairedAt:1}},pairs:{},jobs:{[jobId]:job},requests:{'legacy-history':{digest:'retained',answer:{receiptId:'old'}}},faults:{}};
  const {canonical}=await import('../../src/platform/protocol.js'),{createHash}=await import('node:crypto');
  legacy.requests[executorId+':claim:'+assignment.claimId]={digest:createHash('sha256').update(canonical(claim)).digest('hex'),answer:{assignment:{...assignment,jobId,task,params:job.params,target:job.target}}};
  legacy.requests['admission:'+assignmentId]={digest:createHash('sha256').update(canonical({assignmentId,runRef:ref})).digest('hex'),answer:oldPermit};
  const h=await fixture(t,{clock:()=>1000,legacy});h.credential=credential;const migrated=await h.disk();
  assert.equal(migrated.executors[executorId].credential,credential);assert.deepEqual(migrated.jobs,legacy.jobs);assert.deepEqual(migrated.requests,legacy.requests);
  const auth=await h.post('/v1/auth');assert.equal(auth.pairingGeneration,1);assert.match(auth.pairingId,/^[a-f0-9-]{36}$/);
  const replay=(await h.post('/v1/claim',claim)).assignment;assert.equal(replay.pairingId,auth.pairingId);assert.equal(replay.attemptEpoch,1);assert.equal(replay.jobId,jobId);
  const permit=await h.post('/v1/admission',{assignmentId,runRef:ref});assert.deepEqual(bindingFor(permit),bindingFor(replay));
  assert.equal(permit.permitId,oldPermit.permitId);assert.deepEqual((await h.disk()).requests['admission:'+assignmentId].answer,oldPermit);
  assert.deepEqual(bindingFor((await h.post('/v1/reconcile')).assignments[0].permit),bindingFor(replay));await h.post('/v1/renew',{assignmentId,permitId:permit.permitId});
  await h.restart();assert.equal((await h.post('/v1/auth')).pairingId,auth.pairingId);await h.post('/v1/cancellation',{assignmentId});
  const revoke=await h.post('/v1/revoke',{revocationId:'legacy-unpair'});assert.equal(revoke.pairingId,auth.pairingId);
  const next=await h.pair(executorId);assert.equal(next.pairingGeneration,2);
  for(const [path,body] of [['/v1/admission',{assignmentId,runRef:ref}],['/v1/renew',{assignmentId,permitId:permit.permitId}],['/v1/cancellation',{assignmentId}],['/v1/receipt',{assignmentId,runRef:ref,receiptKey:ref.resultId,result:{}}]])await assert.rejects(h.post(path,body),{code:'E_PAIRING'});
  await h.connect();assert.deepEqual(await h.post('/v1/claim',claim),{assignment:null});assert.deepEqual((await h.post('/v1/reconcile')).assignments,[]);
  const disk=await h.disk();assert.deepEqual(disk.requests['legacy-history'],legacy.requests['legacy-history']);assert.equal(disk.jobs[jobId].assignment.assignmentId,assignmentId);assert.equal(disk.jobs[jobId].assignment.pairingId,undefined);
});

test('persisted invalid leases and old assignment/permit epochs cannot be admitted or renewed',async t=>{
  const h=await fixture(t,{clock:()=>1000});await h.pair();await h.connect();const a=await h.assignment(),ref=runRefFor(a),base=await h.disk();
  for(const leaseUntil of [null,'91000',1000]){
    const altered=structuredClone(base);altered.jobs[a.jobId].assignment.leaseUntil=leaseUntil;
    await h.restart(altered);
    await assert.rejects(h.post('/v1/admission',{assignmentId:a.assignmentId,runRef:ref}),{code:'E_LEASE'});
  }
  for(const attemptEpoch of [0,2,'1',null]){
    const altered=structuredClone(base);altered.jobs[a.jobId].assignment.attemptEpoch=attemptEpoch;await h.restart(altered);
    await assert.rejects(h.post('/v1/admission',{assignmentId:a.assignmentId,runRef:ref}),{code:'E_ATTEMPT'});
    await assert.rejects(h.post('/v1/reconcile'),{code:'E_ATTEMPT'});
  }
  await h.restart(base);const permit=await h.post('/v1/admission',{assignmentId:a.assignmentId,runRef:ref}),admitted=await h.disk();
  for(const k of bindingKeys){
    const assignmentMissing=structuredClone(base);delete assignmentMissing.jobs[a.jobId].assignment[k];await h.restart(assignmentMissing);
    // Removing executorId/assignmentId makes it unfindable; removing both pairing
    // fields is not a legacy bypass because this executor has no legacy identity.
    const code=['executorId','assignmentId'].includes(k)?'E_ASSIGNMENT':'E_BINDING';
    await assert.rejects(h.post('/v1/admission',{assignmentId:a.assignmentId,runRef:ref}),{code});
    const permitMissing=structuredClone(admitted);delete permitMissing.jobs[a.jobId].permit[k];await h.restart(permitMissing);
    await assert.rejects(h.post('/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}),{code:'E_BINDING'});
  }
  for(const attemptEpoch of [0,2]){
    const altered=structuredClone(admitted);altered.jobs[a.jobId].permit.attemptEpoch=attemptEpoch;await h.restart(altered);
    await assert.rejects(h.post('/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}),{code:'E_ATTEMPT'});
    await assert.rejects(h.post('/v1/admission',{assignmentId:a.assignmentId,runRef:ref}),{code:'E_ATTEMPT'});
  }
  for(const runRef of [{...ref,runId:randomUUID()},{...ref,requestId:'cloud:other'},{...ref,sourceHash:'bad'}]){
    const altered=structuredClone(admitted);altered.jobs[a.jobId].permit.runRef=runRef;await h.restart(altered);
    await assert.rejects(h.post('/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}),{code:runRef.sourceHash==='bad'?'E_TASK':'E_RUN_REF'});
    await assert.rejects(h.post('/v1/receipt',{assignmentId:a.assignmentId,runRef:ref,receiptKey:ref.resultId,result:{state:'completed'}}),{code:runRef.sourceHash==='bad'?'E_TASK':'E_RUN_REF'});
  }
});

test('HTTP requests already queued behind a revoke revalidate credentials inside serial',async t=>{
  const h=await fixture(t),pair=await h.pair();await h.connect();const a=await h.assignment(),ref=runRefFor(a),permit=await h.post('/v1/admission',{assignmentId:a.assignmentId,runRef:ref});
  const requests=[
    ['/admin/seed',{requestKey:'queue-barrier',params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}},h.admin.adminToken],
    ['/v1/revoke',{revocationId:'queued-revoke'}],['/v1/auth',{}],['/v1/claim',{claimId:'queued-claim',tasks}],
    ['/v1/admission',{assignmentId:a.assignmentId,runRef:ref}],['/v1/renew',{assignmentId:a.assignmentId,permitId:permit.permitId}],
    ['/v1/receipt',{assignmentId:a.assignmentId,runRef:ref,receiptKey:ref.resultId,result:{state:'completed'}}]
  ];
  const responses=await new Promise((ok,no)=>{
    let text='';const socket=createConnection({port:h.provider.port,host:'127.0.0.1'});socket.setTimeout(5000,()=>{socket.destroy();no(Error('HTTP pipeline timeout'));});
    socket.once('error',no);socket.on('data',d=>{text+=d;});socket.once('end',()=>{try{ok(text.split('\r\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l)));}catch(e){no(e);}});
    socket.once('connect',()=>socket.write(requests.map(([path,body,auth],i)=>{
      const json=JSON.stringify(body);return `POST ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${auth??pair.credential}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(json)}\r\nConnection: ${i===requests.length-1?'close':'keep-alive'}\r\n\r\n${json}`;
    }).join('')));
  });
  assert.equal(responses.length,requests.length);assert.equal(responses[1].revoked,true);for(const response of responses.slice(2))assert.equal(response.error?.code,'E_AUTH');
  const disk=await h.disk();assert.equal(disk.jobs[a.jobId].receipt,undefined);assert.equal(Object.keys(disk.requests).some(k=>k.endsWith(':queued-claim')),false);
});


test('provider persistence failure rolls back memory before a retry can publish facts',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'od-cloud-durable-'));const p=await openProvider({directory,port:0});
  try{
    const admin=JSON.parse(await readFile(p.credentialFile,'utf8')),executorId=randomUUID();
    await fetch(`http://127.0.0.1:${p.port}/v1/pair`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({executorId,pairingCode:admin.pairingCode})});
    const grantId=randomUUID();
    const advertised=[{taskId:pkg.manifest.taskId,
      manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash}];
    await fetch(`http://127.0.0.1:${p.port}/v1/capabilities`,{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+
        (JSON.parse(await readFile(join(directory,'state.json'),'utf8')).executors[executorId].credential)},
      body:JSON.stringify({grantId,tasks:advertised})});
    const seed={requestKey:'disk-failure',targetExecutorId:executorId,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};
    const post=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${p.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin.adminToken},body:JSON.stringify(body)});return {ok:r.ok,value:await r.json()};};
    await mkdir(join(directory,'state.json.tmp'));
    assert.equal((await post('/admin/state',{})).ok,true,
      'Admin read-only status must not fsync the state while the write path is blocked');
    assert.equal((await post('/admin/seed',seed)).ok,false);
    await rm(join(directory,'state.json.tmp'),{recursive:true});assert.equal((await post('/admin/seed',seed)).ok,true);
    const state=(await post('/admin/state',{})).value;assert.equal(Object.keys(state.jobs).length,1);
    const persisted=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));assert.equal(Object.keys(persisted.jobs).length,1);
    assert.equal(Object.keys(persisted.requests).filter(k=>k.endsWith(':disk-failure')).length,1);
  }finally{await p.close();await rm(directory,{recursive:true,force:true});}
});
