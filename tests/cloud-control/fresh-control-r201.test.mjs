import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';
import {openPostgresLedger} from '../../scripts/cloud-control/postgres-ledger.mjs';

const require=createRequire(new URL('../../scripts/cloud-control/package.json',import.meta.url));
let url=process.env.CLOUD_CONTROL_TEST_DATABASE_URL;
if(!url){try{url=JSON.parse(await readFile(new URL('../../.local/cloud-r201/environment.json',import.meta.url),'utf8')).url;}catch(error){if(error.code!=='ENOENT')throw error;}}
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const pin={taskId:pkg.manifest.taskId,version:pkg.manifest.version,manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
const bindingKeys=['providerId','executorId','pairingId','pairingGeneration','attemptEpoch','claimId','jobId','assignmentId'];
const pgTest=(name,fn)=>test(name,{skip:!url&&'Real PostgreSQL is required',timeout:15000},fn);
function post(provider,path,body,credential,ca){
  return new Promise((resolve,reject)=>{
    const bytes=Buffer.from(JSON.stringify(body));
    const req=(ca?https:http).request({hostname:'127.0.0.1',port:ca?provider.publicPort:provider.port,path,method:'POST',...(ca?{ca}:{}),
      headers:{'content-type':'application/json','content-length':bytes.length,authorization:'Bearer '+credential}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);
      res.on('end',()=>{try{const answer=JSON.parse(Buffer.concat(chunks));if(res.statusCode!==200)reject(Object.assign(Error(answer.error.message),{code:answer.error.code}));else resolve(answer);}catch(error){reject(error);}});
    });
    req.setTimeout(5000,()=>req.destroy(Error('fixture request timeout')));req.on('error',reject);req.end(bytes);
  });
}
async function fixture(t,{protocol=2}={}){
  const {Pool}=require('pg'),directory=await mkdtemp(join(tmpdir(),'od-fresh-control-'));
  const pools=[0,1].map(()=>new Pool({connectionString:url,max:5,statement_timeout:5000}));
  const ledgerId='fresh-control-test:'+randomUUID();
  const ledgers=await Promise.all(pools.map(pool=>openPostgresLedger({pool,ledgerId})));
  const providers=[];let now=1000000;
  t.after(async()=>{
    try{for(const provider of providers)await provider?.close();}
    finally{
      const c=await pools[0].connect();
      try{
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',['opendesk:cloud:ddl:r201']);
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['opendesk:cloud:ledger:'+ledgerId]);
        await c.query('DELETE FROM opendesk_cc_ledgers WHERE ledger_id=$1',[ledgerId]);await c.query('COMMIT');
      }catch(error){await c.query('ROLLBACK');throw error;}
      finally{c.release();await Promise.all(ledgers.map(l=>l.close()));await Promise.all(pools.map(p=>p.end()));await rm(directory,{recursive:true,force:true});}
    }
  });
  const keyFile=join(directory,'tls.key'),certFile=join(directory,'tls.crt');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const ca=await readFile(certFile),open=i=>openProvider({directory:join(directory,String(i)),port:0,clock:()=>now,ledger:ledgers[i],publicTls:{port:0,host:'127.0.0.1',keyFile,certFile}});
  providers[0]=await open(0);providers[1]=await open(1);
  const admin=JSON.parse(await readFile(providers[0].credentialFile,'utf8'));
  const executorId=randomUUID(),grantId=randomUUID();
  let pair=await post(providers[0],'/v1/pair',{executorId,pairingCode:admin.pairingCode});
  const call=(i,path,body)=>post(providers[i],path,body,pair.credential);
  const cap=()=>({tasks:[pin],grantId,...(protocol===2?{controlProtocol:2}:{})});
  const accepted=await call(0,'/v1/capabilities',cap());
  const seed=(extra={})=>post(providers[0],'/admin/seed',{requestKey:randomUUID(),...pin,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'},targetExecutorId:executorId,controlProtocol:2,...extra},admin.adminToken);
  const claim=async()=>{
    const session=await call(0,'/v1/pull-open',{tasks:[pin],grantId});
    return (await call(1,'/v1/claim',{claimId:randomUUID(),tasks:[pin],grantId,pullSessionId:session.sessionId})).assignment;
  };
  const admit=async assignment=>{
    const binding=Object.fromEntries(bindingKeys.map(k=>[k,assignment[k]]));
    const runRef={runId:randomUUID(),resultId:randomUUID(),requestId:'cloud:'+assignment.assignmentId,sourceHash:pin.sourceHash,manifestHash:pin.manifestHash,grantId};
    const permit=await call(0,'/v1/admission',{assignmentId:assignment.assignmentId,binding,runRef,resultAllowed:false});
    const start={binding,runRef,permitId:permit.permitId,startId:runRef.runId,challenge:randomUUID()};
    return {binding,runRef,permit,start};
  };
  return {pools,ledgers,providers,admin,executorId,grantId,cap,accepted,seed,claim,admit,call,ca,
    tick:ms=>{now+=ms;},now:()=>now,
    async restart(i){await providers[i].close();providers[i]=null;providers[i]=await open(i);},
    async repair(){pair=await post(providers[0],'/v1/pair',{executorId,pairingCode:admin.pairingCode});return pair;}};
}
const fenceFor=(start,ticket,extra={})=>({binding:start.binding,runRef:start.runRef,permitId:start.permitId,ticketId:ticket.ticketId,
  controlGeneration:ticket.controlGeneration,requestId:randomUUID(),requestDigest:'a'.repeat(64),effectId:randomUUID(),challenge:randomUUID(),...extra});

for(const scenario of ['control-only','assigned-only'])for(const route of ['/v1/suspend','/v1/revoke'])
pgTest(`${scenario} ${route} commits a targeted outbox hint without changing jobs`,async t=>{
  const f=await fixture(t);
  if(scenario==='assigned-only'){await f.seed();await f.claim();}
  const before=await f.ledgers[0].transaction(s=>({jobs:s.jobs,executor:s.executors[f.executorId]}),{readOnly:true});
  assert.equal(Object.keys(before.jobs).length,scenario==='control-only'?0:1);
  if(scenario==='assigned-only')assert.equal(Object.values(before.jobs)[0].state,'assigned');
  const previous=await f.ledgers[0].readOutbox(0,{limit:10000});
  const sequence=previous.at(-1)?.sequence??0;
  await f.call(1,route,route==='/v1/suspend'?{grantId:f.grantId}:{revocationId:randomUUID()});
  const after=await f.ledgers[0].transaction(s=>({jobs:s.jobs,executor:s.executors[f.executorId]}),{readOnly:true});
  assert.deepEqual(after.jobs,before.jobs,'assigned work and UNKNOWN capacity remain untouched');
  assert.notEqual(after.executor.controlGeneration,before.executor.controlGeneration);
  if(route==='/v1/suspend')assert.ok(after.executor.suspendedAt);
  else assert.equal(after.executor.revocation.revoked,true);
  const hints=await f.ledgers[0].readOutbox(sequence);
  assert.equal(hints.length,1);
  assert.deepEqual(hints.map(({sequence,...hint})=>hint),[{executorId:f.executorId,jobId:null,kind:route}]);
  assert.deepEqual(await f.ledgers[1].readOutbox(sequence),hints,'another PG instance sees the committed hint');
  assert.deepEqual(Object.keys(hints[0]).sort(),['executorId','jobId','kind','sequence']);
});

pgTest('fresh control opt-in filters claims, pins protocol and preserves legacy permit-only jobs',async t=>{
  const f=await fixture(t,{protocol:null});
  const job=await f.seed();
  assert.equal(await f.claim(),null,'legacy Executor cannot claim v2');
  const accepted=await f.call(0,'/v1/capabilities',{...f.cap(),controlProtocol:2});
  assert.deepEqual(await f.call(1,'/v1/capabilities',{...f.cap(),controlProtocol:2}),accepted);
  const assignment=await f.claim();assert.equal(assignment.jobId,job.jobId);
  assert.equal(assignment.controlProtocol,2);assert.equal(assignment.controlGeneration,accepted.controlGeneration);
  const {permit}=await f.admit(assignment);assert.equal(permit.controlGeneration,assignment.controlGeneration);
  await assert.rejects(f.ledgers[0].transaction(s=>{delete s.jobs[job.jobId].controlProtocol;}),{code:'E_CONTROL_PROTOCOL'});
});

pgTest('legacy job never acquires v2 protocol, including idempotent seed retries and ledger edits',async t=>{
  const f=await fixture(t);
  const requestKey=randomUUID();
  const input={requestKey,...pin,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'},targetExecutorId:f.executorId};
  const job=await post(f.providers[0],'/admin/seed',input,f.admin.adminToken);
  await assert.rejects(post(f.providers[1],'/admin/seed',{...input,controlProtocol:2},f.admin.adminToken),{code:'E_REQUEST_CONFLICT'});
  const assignment=await f.claim();assert.equal(Object.hasOwn(assignment,'controlProtocol'),false);
  const {permit,start}=await f.admit(assignment);assert.equal(Object.hasOwn(permit,'controlProtocol'),false);
  await assert.rejects(f.call(0,'/v1/start-ticket',start),{code:'E_CONTROL_PROTOCOL'});
  await assert.rejects(f.ledgers[0].transaction(s=>{s.jobs[job.jobId].controlProtocol=2;s.jobs[job.jobId].assignment.controlProtocol=2;s.jobs[job.jobId].assignment.controlGeneration=randomUUID();}),{code:'E_CONTROL_PROTOCOL'});
});

pgTest('two PG instances persist one start identity and effect identity through dropped replies, expiry and restart',async t=>{
  const f=await fixture(t);await f.seed();const a=await f.claim(),{start}=await f.admit(a);
  await post(f.providers[0],'/admin/fault',{path:'/v1/start-ticket',count:1},f.admin.adminToken);
  await assert.rejects(f.call(0,'/v1/start-ticket',start));
  const [ticket,concurrent]=await Promise.all([f.call(1,'/v1/start-ticket',start),f.call(0,'/v1/start-ticket',start)]);
  assert.deepEqual(concurrent,ticket);
  assert.deepEqual(await f.call(0,'/v1/start-ticket',start),ticket);
  assert.equal(ticket.expiresAt-ticket.issuedAt,5000);
  await assert.rejects(f.call(1,'/v1/start-ticket',{...start,challenge:randomUUID()}),{code:'E_REQUEST_CONFLICT'});
  await assert.rejects(f.call(1,'/v1/start-ticket',{...start,startId:randomUUID()}),{code:'E_SCHEMA'});
  const body=fenceFor(start,ticket);
  await post(f.providers[0],'/admin/fault',{path:'/v1/control-fence',count:1},f.admin.adminToken);
  await assert.rejects(f.call(1,'/v1/control-fence',body));
  const [fence,concurrentFence]=await Promise.all([f.call(0,'/v1/control-fence',body),f.call(1,'/v1/control-fence',body)]);
  assert.deepEqual(concurrentFence,fence);
  assert.equal(fence.expiresAt-fence.issuedAt,2000);
  assert.deepEqual(await f.call(1,'/v1/control-fence',body),fence);
  for(const patch of [{challenge:randomUUID()},{requestDigest:'b'.repeat(64)},{requestId:randomUUID()}])
    await assert.rejects(f.call(1,'/v1/control-fence',{...body,...patch}),{code:'E_REQUEST_CONFLICT'});
  await f.restart(0);assert.deepEqual(await f.call(0,'/v1/start-ticket',start),ticket);
  f.tick(2000);await assert.rejects(f.call(1,'/v1/control-fence',body),{code:'E_CONTROL_FENCE_EXPIRED'});
  f.tick(3000);await assert.rejects(f.call(1,'/v1/start-ticket',start),{code:'E_START_TICKET_EXPIRED'});
  const consumedAt=await f.ledgers[1].transaction(s=>s.jobs[a.jobId].startConsumedAt,{readOnly:true});
  const later=await f.call(0,'/v1/control-fence',fenceFor(start,ticket));
  assert.ok(later.issuedAt>=ticket.expiresAt,'consumed startup does not impose a 5s Run limit');
  f.tick(55000);
  const longRun=await f.call(1,'/v1/control-fence',fenceFor(start,ticket));
  assert.equal(longRun.expiresAt-longRun.issuedAt,2000);
  assert.equal(await f.ledgers[0].transaction(s=>s.jobs[a.jobId].startConsumedAt,{readOnly:true}),consumedAt);
  await assert.rejects(f.ledgers[0].transaction(s=>{delete s.jobs[a.jobId].startConsumedAt;}),{code:'E_REQUEST_CONFLICT'});
  assert.equal((await f.ledgers[1].transaction(s=>Object.values(s.jobs).filter(j=>j.assignment&&!j.receipt).length,{readOnly:true})),1);
});

pgTest('Cancel committed on the other PG instance prevents start issuance and does not release UNKNOWN capacity',async t=>{
  const f=await fixture(t);await f.seed();const a=await f.claim(),{start}=await f.admit(a);
  await f.call(1,'/v1/cancel',{assignmentId:a.assignmentId,binding:start.binding});
  await assert.rejects(f.call(0,'/v1/start-ticket',start),{code:'E_LEASE'});
  await f.seed();assert.equal(await f.claim(),null);
});

pgTest('ticket/fence before Cancel remain historical facts; every replay after Cancel is denied',async t=>{
  const f=await fixture(t);await f.seed();const a=await f.claim(),{start}=await f.admit(a);
  const ticket=await f.call(0,'/v1/start-ticket',start),body=fenceFor(start,ticket);
  assert.deepEqual(Object.keys(ticket).sort(),[...bindingKeys,'runRef','permitId','controlProtocol','controlGeneration','startId','challenge','ticketId','issuedAt','expiresAt'].sort());
  const issued=await f.call(1,'/v1/control-fence',body);
  assert.deepEqual(Object.keys(issued).sort(),[...bindingKeys,'runRef','permitId','ticketId','controlProtocol','controlGeneration','requestId','requestDigest','effectId','challenge','fenceId','issuedAt','expiresAt'].sort());
  await assert.rejects(f.call(1,'/v1/control-fence',{...body,kind:'click'}),{code:'E_SCHEMA'});
  await f.call(0,'/v1/cancel',{assignmentId:a.assignmentId,binding:start.binding});
  await assert.rejects(f.call(1,'/v1/control-fence',body),{code:'E_LEASE'});
  await assert.rejects(f.call(0,'/v1/start-ticket',start),{code:'E_LEASE'});
  const state=await f.ledgers[1].transaction(s=>s,{readOnly:true});
  assert.equal(state.jobs[a.jobId].startTicket.ticketId,ticket.ticketId);
  assert.ok(Object.values(state.requests).some(r=>r.answer.fenceId===issued.fenceId));
});

pgTest('late same-grant capabilities cannot undo Stop across Provider instances or restart',async t=>{
  const f=await fixture(t);await f.seed();const a=await f.claim(),{start}=await f.admit(a);
  const ticket=await f.call(0,'/v1/start-ticket',start),body=fenceFor(start,ticket);
  await f.call(1,'/v1/suspend',{grantId:f.grantId});
  const stopped=await f.ledgers[0].transaction(s=>s.executors[f.executorId],{readOnly:true});
  for(const i of [0,1]){
    if(i===1)await f.restart(i);
    for(const cap of [f.cap(),{...f.cap(),tasks:[]},{tasks:f.cap().tasks,grantId:f.grantId}])
      await assert.rejects(f.call(i,'/v1/capabilities',cap),{code:'E_CLOUD_STOPPED'});
    for(const [route,input] of [['/v1/start-ticket',start],['/v1/control-fence',body],
      ['/v1/claim',{claimId:randomUUID(),tasks:f.cap().tasks,grantId:f.grantId}]])
      await assert.rejects(f.call(i,route,input),{code:'E_CLOUD_STOPPED'});
  }
  const state=await f.ledgers[1].transaction(s=>s,{readOnly:true});
  for(const key of ['grantId','suspendedAt','controlGeneration','controlProtocol','capabilities'])
    assert.deepEqual(state.executors[f.executorId][key],stopped[key]);
  assert.equal(state.jobs[a.jobId].receipt,undefined);
  assert.equal(Object.values(state.jobs).filter(j=>j.assignment&&!j.receipt).length,1);
});

pgTest('suspend, restore, restart and revoke retire control generations without reviving assigned work',async t=>{
  const f=await fixture(t);await f.seed();const a=await f.claim(),{start}=await f.admit(a);
  const ticket=await f.call(0,'/v1/start-ticket',start),body=fenceFor(start,ticket);
  await f.call(1,'/v1/suspend',{grantId:f.grantId});
  const suspended=await f.ledgers[0].transaction(s=>s.executors[f.executorId].controlGeneration,{readOnly:true});
  assert.notEqual(suspended,ticket.controlGeneration);
  await assert.rejects(f.call(0,'/v1/control-fence',body),{code:'E_CLOUD_STOPPED'});
  const newGrant= randomUUID(),restored=await f.call(1,'/v1/capabilities',{...f.cap(),grantId:newGrant});assert.notEqual(restored.controlGeneration,suspended);
  await f.restart(0);
  for(const [route,input] of [['/v1/start-ticket',start],['/v1/control-fence',body],['/v1/renew',{assignmentId:a.assignmentId,binding:start.binding,permitId:start.permitId}],
    ['/v1/admission',{assignmentId:a.assignmentId,binding:start.binding,runRef:start.runRef,resultAllowed:false}]])
    await assert.rejects(f.call(0,route,input),{code:route==='/v1/admission'?'E_GRANT':'E_CONTROL_GENERATION'});
  const before=restored.controlGeneration;
  await f.call(1,'/v1/revoke',{revocationId:randomUUID()});
  const after=await f.ledgers[0].transaction(s=>s.executors[f.executorId].controlGeneration,{readOnly:true});assert.notEqual(after,before);
  await assert.rejects(f.call(0,'/v1/control-fence',body),{code:'E_AUTH'});
  const lateReceipt={assignmentId:a.assignmentId,binding:start.binding,runRef:start.runRef,receiptKey:start.runRef.resultId,
    result:{visibility:'status-only',state:'stopped',retirementState:'released'}};
  await assert.rejects(f.call(0,'/v1/receipt',lateReceipt),{code:'E_AUTH'});
  await f.repair();const repaired=await f.call(0,'/v1/capabilities',{...f.cap(),grantId:newGrant});assert.notEqual(repaired.controlGeneration,after);
  await assert.rejects(f.call(1,'/v1/start-ticket',start),{code:'E_PAIRING'});
  await assert.rejects(f.call(1,'/v1/receipt',lateReceipt),{code:'E_PAIRING'});
  await f.seed();
  const session=await f.call(0,'/v1/pull-open',{tasks:f.cap().tasks,grantId:newGrant});
  assert.equal((await f.call(0,'/v1/claim',{claimId:randomUUID(),tasks:f.cap().tasks,grantId:newGrant,pullSessionId:session.sessionId})).assignment,null);
});

pgTest('ticket and fence deadlines clamp to lease, and public submit opts in without altering prior request identity',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.call(0,'/v1/capabilities',{...f.cap(),controlProtocol:1}),{code:'E_SCHEMA'});
  await assert.rejects(f.seed({controlProtocol:1}),{code:'E_SCHEMA'});
  const client=await f.call(0,'/v1/client-grant',{grantId:f.grantId,tasks:[pin],allowResult:false,label:'fresh control test'});
  const input={requestKey:randomUUID(),...pin,params:{},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'},controlProtocol:2};
  const job=await post(f.providers[0],'/v1/submit',input,client.credential,f.ca);
  assert.deepEqual(await post(f.providers[1],'/v1/submit',input,client.credential,f.ca),job);
  const legacy={...input};delete legacy.controlProtocol;
  await assert.rejects(post(f.providers[0],'/v1/submit',legacy,client.credential,f.ca),{code:'E_REQUEST_CONFLICT'});
  const a=await f.claim(),{start}=await f.admit(a);
  await f.ledgers[0].transaction(s=>{s.jobs[job.jobId].assignment.leaseUntil=f.now()+500;});
  const [ticket,concurrent]=await Promise.all([f.call(1,'/v1/start-ticket',start),f.call(0,'/v1/start-ticket',start)]);
  assert.deepEqual(concurrent,ticket);assert.equal(ticket.expiresAt,f.now()+500);
  const body=fenceFor(start,ticket),fence=await f.call(0,'/v1/control-fence',body);assert.equal(fence.expiresAt,ticket.expiresAt);
  f.tick(500);await assert.rejects(f.call(1,'/v1/control-fence',body),{code:'E_LEASE'});
});

pgTest('fresh routes reject altered bindings and scope effect identity to the original Job',async t=>{
  const f=await fixture(t);await f.seed();const a=await f.claim(),{start}=await f.admit(a);
  for(const [patch,code] of [[{binding:{...start.binding,executorId:randomUUID()}},'E_BINDING'],
    [{runRef:{...start.runRef,resultId:randomUUID()}},'E_RUN_REF'],[{permitId:randomUUID()},'E_LEASE'],
    [{challenge:'not-a-uuid'},'E_SCHEMA']])await assert.rejects(f.call(1,'/v1/start-ticket',{...start,...patch}),{code});
  const ticket=await f.call(0,'/v1/start-ticket',start),body=fenceFor(start,ticket);
  for(const [patch,code] of [[{ticketId:randomUUID()},'E_START_TICKET'],[{controlGeneration:randomUUID()},'E_CONTROL_GENERATION'],
    [{runRef:{...start.runRef,runId:randomUUID()}},'E_RUN_REF'],[{requestDigest:'bad'},'E_SCHEMA']])
    await assert.rejects(f.call(1,'/v1/control-fence',{...body,...patch}),{code});
  const longBody={...body,requestId:'r'.repeat(512),effectId:'e'.repeat(512)};
  for(const patch of [{requestId:'r'.repeat(513)},{effectId:'e'.repeat(513)}])
    await assert.rejects(f.call(1,'/v1/control-fence',{...longBody,...patch}),{code:'E_SCHEMA'});
  const longFence=await f.call(0,'/v1/control-fence',longBody);
  assert.equal(longFence.requestId,longBody.requestId);assert.equal(longFence.effectId,longBody.effectId);
  assert.deepEqual(await f.call(1,'/v1/control-fence',longBody),longFence);
  await assert.rejects(f.call(1,'/v1/control-fence',{...longBody,requestDigest:'b'.repeat(64)}),{code:'E_REQUEST_CONFLICT'});
  await f.call(0,'/v1/control-fence',body);
  await f.call(1,'/v1/receipt',{assignmentId:a.assignmentId,binding:start.binding,runRef:start.runRef,receiptKey:start.runRef.resultId,
    result:{visibility:'status-only',state:'stopped',retirementState:'released'}});
  await assert.rejects(f.call(0,'/v1/control-fence',body),{code:'E_CONTROL_FINISHED'});
  await f.seed();const next=await f.admit(await f.claim()),nextTicket=await f.call(1,'/v1/start-ticket',next.start);
  const nextBody=fenceFor(next.start,nextTicket,{requestId:body.requestId,effectId:body.effectId});
  const nextFence=await f.call(0,'/v1/control-fence',nextBody);
  assert.equal(nextFence.jobId,next.start.binding.jobId);
  assert.notEqual(nextFence.jobId,start.binding.jobId);
  assert.deepEqual(await f.call(1,'/v1/control-fence',nextBody),nextFence);
  for(const patch of [{requestDigest:'b'.repeat(64)},{challenge:randomUUID()}])
    await assert.rejects(f.call(1,'/v1/control-fence',{...nextBody,...patch}),{code:'E_REQUEST_CONFLICT'});
});

pgTest('unconsumed expired StartTicket cannot start later or be replaced after either Provider restarts',async t=>{
  const f=await fixture(t);await f.seed();const a=await f.claim(),{start}=await f.admit(a);
  const ticket=await f.call(0,'/v1/start-ticket',start);f.tick(5000);
  await f.restart(1);
  await assert.rejects(f.call(1,'/v1/control-fence',fenceFor(start,ticket)),{code:'E_START_TICKET_EXPIRED'});
  for(const challenge of [start.challenge,randomUUID()])
    await assert.rejects(f.call(0,'/v1/start-ticket',{...start,challenge}),{code:'E_START_TICKET_EXPIRED'});
  const job=await f.ledgers[0].transaction(s=>s.jobs[a.jobId],{readOnly:true});
  assert.equal(Object.hasOwn(job,'startConsumedAt'),false);assert.deepEqual(job.startTicket,ticket);
});
