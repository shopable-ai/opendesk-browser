import http from 'node:http';
import https from 'node:https';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {WebSocketServer} from 'ws';
import {validateTaskParams} from '../../src/platform/tasks/contract.js';
import {registeredPackage,registeredTask,taskRegistryKey,taskPin,validateCloudTarget} from './task-registry.mjs';
import {canonical} from '../../src/platform/protocol.js';
const builtinTask=await registeredPackage(JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8')));
const token=()=>randomBytes(32).toString('hex');
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const exact=(v,keys)=>{if(!v||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('E_SCHEMA');};
const secureEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function openProvider({directory='.local/cloud-control',port=43112,clock=()=>Date.now(),publicTls=null}={}) {
  if(publicTls!==null){
    exact(publicTls,['keyFile','certFile','host','port']);
    if(typeof publicTls.keyFile!=='string'||!publicTls.keyFile||
      typeof publicTls.certFile!=='string'||!publicTls.certFile||
      !Number.isSafeInteger(publicTls.port)||publicTls.port<0||publicTls.port>65535||
      (publicTls.port===0&&!['127.0.0.1','::1'].includes(publicTls.host))||
      typeof publicTls.host!=='string'||!['127.0.0.1','::1','0.0.0.0','::'].includes(publicTls.host)||
      (publicTls.port!==0&&publicTls.port===port))fail('E_TLS_CONFIG');
  }
  // Validate TLS input before taking the durable Provider lock. A missing
  // certificate must not strand the existing state and refuse future starts.
  const tlsOptions=publicTls?{
    key:await readFile(resolve(publicTls.keyFile)),
    cert:await readFile(resolve(publicTls.certFile))
  }:null;
  directory=resolve(directory);await mkdir(directory,{recursive:true,mode:0o700});
  const lock=resolve(directory,'provider.lock');
  let handle;try{handle=await open(lock,'wx',0o600);await handle.writeFile(String(process.pid));}
  catch(error){if(error.code!=='EEXIST')throw error;const pid=Number(await readFile(lock,'utf8'));try{process.kill(pid,0);fail('E_PROVIDER_BUSY');}catch(e){if(e.code!=='ESRCH')throw e;}await unlink(lock);handle=await open(lock,'wx',0o600);await handle.writeFile(String(process.pid));}
  const file=resolve(directory,'state.json'),credentialFile=resolve(directory,'admin.json');
  let state,credentials;
  try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,providerId:randomUUID(),executors:{},pairs:{},jobs:{},requests:{},faults:{}};}
  // Migrate legacy R1-R4 state without changing old jobs, requests or receipts.
  // Legacy assigned work remains pinned to its original Executor. Unowned queued
  // R1-R5 jobs stay quarantined: an identical Task never grants ownership.
  state.executors??={};state.jobs??={};state.requests??={};state.clients??={};
  for(const row of Object.values(state.executors))row.pairingId??=randomUUID();
  for(const job of Object.values(state.jobs))if(job.assignment&&!job.assignment.pairingId){
    job.assignment.pairingId=state.executors[job.assignment.executorId]?.pairingId??null;
  }
  state.taskRegistry??={};
  if(!state.taskRegistry||typeof state.taskRegistry!=='object'||Array.isArray(state.taskRegistry))fail('E_REGISTRY');
  for(const [key,row] of Object.entries(state.taskRegistry)){
    const validated=registeredTask(row.manifest,row.manifestHash);
    if(key!==taskRegistryKey(validated)||canonical(row)!==canonical(validated))fail('E_REGISTRY','Stored task identity is invalid');
  }
  const builtinKey=taskRegistryKey(builtinTask);
  if(state.taskRegistry[builtinKey]&&canonical(state.taskRegistry[builtinKey])!==canonical(builtinTask))
    fail('E_TASK_CONFLICT','Built-in task identity changed');
  state.taskRegistry[builtinKey]=builtinTask;
  try{credentials=JSON.parse(await readFile(credentialFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;credentials={adminToken:token(),pairingCode:token()};await writeFile(credentialFile,JSON.stringify(credentials),{mode:0o600});}
  let tail=Promise.resolve();
  async function save(){const h=await open(file+'.tmp','w',0o600);try{await h.writeFile(JSON.stringify(state,null,2));await h.sync();}finally{await h.close();}await rename(file+'.tmp',file);}
  await save();
  const serial=fn=>{const next=tail.then(async()=>{const before=structuredClone(state);try{return await fn();}catch(error){state=before;throw error;}});tail=next.catch(()=>{});return next;};
  function once(scope,key,body,fn){if(typeof key!=='string'||key.length>150)fail('E_SCHEMA');const k=scope+':'+key,d=hash(body),old=state.requests[k];if(old){if(old.digest!==d)fail('E_REQUEST_CONFLICT');return structuredClone(old.answer);}const answer=fn();state.requests[k]={digest:d,answer:structuredClone(answer)};return answer;}
  const sockets=new Map(),tickets=new Map();
  const notify=executorId=>{for(const [ws,id]of sockets)if(!executorId||id===executorId)ws.send(JSON.stringify({type:'notify'}));};
  const owned=(b,id)=>{const j=Object.values(state.jobs).find(j=>
    j.assignment?.assignmentId===b.assignmentId&&j.assignment.executorId===id&&
    j.assignment.pairingId===state.executors[id]?.pairingId);
    if(!j)fail('E_ASSIGNMENT');return j;};
  const handler=async(req,res,publicRequest=false)=>{
    try{
      if(req.method!=='POST')fail('E_METHOD');
      if(req.headers.origin&&!req.headers.origin.startsWith('chrome-extension://'))fail('E_ORIGIN');
      let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65536)fail('E_LIMIT');}const b=JSON.parse(text||'{}');
      const path=new URL(req.url,'http://127.0.0.1').pathname;
      const admin=path.startsWith('/admin/');
      let executorId,client;
      if(admin){
        // Local administration is never served by the external HTTPS listener.
        if(publicRequest)fail('E_ROUTE');
        if(!secureEqual(req.headers.authorization,'Bearer '+credentials.adminToken))fail('E_AUTH');
      }else if(path==='/v1/submit'||path==='/v1/job-status'){
        if(!publicRequest)fail('E_TLS_REQUIRED');
        const clientId=Object.keys(state.clients).find(id=>
          !state.clients[id].revokedAt&&
          secureEqual(req.headers.authorization,'Bearer '+state.clients[id].credential));
        if(!clientId)fail('E_AUTH');
        client={...state.clients[clientId],clientId};
        const target=state.executors[client.executorId];
        if(!target||target.revokedAt||target.pairingId!==client.pairingId||
          !client.grantId||client.grantId!==target.grantId)fail('E_AUTH');
      }else if(path!=='/v1/pair'){executorId=Object.keys(state.executors).find(id=>
        !state.executors[id].revokedAt&&secureEqual(req.headers.authorization,'Bearer '+state.executors[id].credential));
        if(!executorId)fail('E_AUTH');}
      const answer=await serial(async()=>{
        let out;
        switch(path){
          case '/v1/pair':{
            exact(b,['executorId','pairingCode']);if(!secureEqual(b.pairingCode,credentials.pairingCode)||!/^[-a-f0-9]{36}$/.test(b.executorId))fail('E_AUTH');
            if(state.executors[b.executorId]&&!state.executors[b.executorId].revokedAt)fail('E_PAIR_ACTIVE');
            state.executors[b.executorId]={credential:token(),pairedAt:clock(),pairingId:randomUUID(),revokedAt:null};
            out={providerId:state.providerId,credential:state.executors[b.executorId].credential};break;}
          case '/v1/unpair':{
            exact(b,[]);const row=state.executors[executorId];
            row.revokedAt=clock()||1;row.credential=token();delete row.capabilities;delete row.grantId;
            // Never erase historical Run, Result or receipt. Quarantine unclaimed old work.
            for(const j of Object.values(state.jobs))
              if(j.targetExecutorId===executorId&&j.targetPairingId===row.pairingId&&j.state==='queued')j.cancelled=true;
            for(const grant of Object.values(state.clients))
              if(grant.executorId===executorId&&grant.pairingId===row.pairingId)grant.revokedAt=clock()||1;
            out={revoked:true};break;}
          case '/v1/auth':{
            exact(b,[]);const t=token();tickets.set(t,{executorId,pairingId:state.executors[executorId].pairingId,until:clock()+30000});out={ticket:t,expiresAt:clock()+30000,providerId:state.providerId};break;}
          case '/v1/capabilities':{
            exact(b,['tasks','grantId']);
            if(!Array.isArray(b.tasks)||b.tasks.length>32||
              typeof b.grantId!=='string'||!/^[-a-f0-9]{36}$/.test(b.grantId))
              fail('E_SCHEMA');
            for(const task of b.tasks){
              exact(task,['taskId','version','manifestHash','sourceHash']);
              if(typeof task.taskId!=='string'||!/^[a-f0-9]{64}$/.test(task.manifestHash)||
                !/^[a-f0-9]{64}$/.test(task.sourceHash))fail('E_SCHEMA');
            }
            const owner=state.executors[executorId];
            if(owner.retiredGrants?.[b.grantId])fail('E_GRANT_STALE');
            if(owner.grantId&&owner.grantId!==b.grantId){
              // A delayed old connection cannot roll back a newer approval.
              owner.retiredGrants??={};
              owner.retiredGrants[owner.grantId]=clock()||1;
              // Old client credentials never expand into a new user approval.
              for(const grant of Object.values(state.clients))
                if(grant.executorId===executorId&&grant.pairingId===owner.pairingId&&
                  grant.grantId!==b.grantId)grant.revokedAt=clock()||1;
              // A new local approval generation cannot inherit queued requests.
              for(const job of Object.values(state.jobs))
                if(job.state==='queued'&&job.targetExecutorId===executorId&&
                  job.targetPairingId===owner.pairingId&&job.targetGrantId!==b.grantId)
                  job.cancelled=true;
            }
            if(owner.grantId!==b.grantId)owner.suspendedAt=null;
            owner.grantId=b.grantId;owner.capabilities=b.tasks;
            out={accepted:true};break;
          }
          case '/v1/suspend':{
            exact(b,['grantId']);
            const owner=state.executors[executorId];
            if(!owner.grantId||owner.grantId!==b.grantId)fail('E_GRANT');
            owner.suspendedAt??=clock()||1;
            for(const j of Object.values(state.jobs))
              if(j.state==='queued'&&j.targetExecutorId===executorId&&
                j.targetPairingId===owner.pairingId&&j.targetGrantId===b.grantId)
                j.cancelled=true;
            out={suspended:true,grantId:b.grantId};break;
          }
          case '/v1/claim':{
            exact(b,['claimId','tasks','grantId']);
            if(b.grantId!==state.executors[executorId].grantId)fail('E_GRANT');
            if(state.executors[executorId].suspendedAt)fail('E_CLOUD_STOPPED');
            out=once(executorId+':claim',b.claimId,b,()=>{
              if(![...sockets.values()].includes(executorId))fail('E_CONNECTION');
              const j=Object.values(state.jobs).find(j=>j.state==='queued'&&!j.cancelled&&
                j.targetExecutorId===executorId&&j.targetPairingId===state.executors[executorId].pairingId&&
                j.targetGrantId===b.grantId&&b.tasks.some(t=>t.taskId===j.task.taskId&&t.manifestHash===j.task.manifestHash&&t.sourceHash===j.task.sourceHash)&&canonical(taskPin(state.taskRegistry[taskRegistryKey(j.task)]??{}))===canonical(j.task));
              if(!j)return {assignment:null};j.state='assigned';j.assignment={assignmentId:randomUUID(),executorId,
                pairingId:state.executors[executorId].pairingId,claimId:b.claimId,leaseUntil:clock()+90000};return {assignment:{...j.assignment,jobId:j.jobId,task:j.task,params:j.params,target:j.target}};});break;}
          case '/v1/admission':{
            exact(b,['assignmentId','runRef','resultAllowed']);const j=owned(b,executorId);
            if(typeof b.resultAllowed!=='boolean')fail('E_SCHEMA');
            if(j.targetGrantId!==state.executors[executorId].grantId)fail('E_GRANT');
            if(state.executors[executorId].suspendedAt)fail('E_CLOUD_STOPPED');
            exact(b.runRef,['runId','resultId','requestId','sourceHash','manifestHash','grantId']);
            if(j.cancelled||j.assignment.leaseUntil<=clock())fail('E_LEASE');
            if(b.runRef.sourceHash!==j.task.sourceHash||
              b.runRef.manifestHash!==j.task.manifestHash)fail('E_TASK');
            // Permit belongs to the exact Provider Assignment AND the local
            // Browser approval generation. A matching Task hash alone cannot
            // authorize a different Run, Result or previously revoked grant.
            const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
            if(!uuid.test(b.runRef.runId)||!uuid.test(b.runRef.resultId)||
              b.runRef.requestId!=='cloud:'+j.assignment.assignmentId||
              b.runRef.grantId!==j.targetGrantId)fail('E_RUN_REF');
            out=once('admission',b.assignmentId,b,()=>{j.runRef=b.runRef;j.resultAllowed=b.resultAllowed;j.state='admitted';j.permit={permitId:randomUUID(),assignmentId:b.assignmentId,runRef:b.runRef,leaseUntil:j.assignment.leaseUntil,providerId:state.providerId};return j.permit;});break;}
          case '/v1/renew':{
            exact(b,['assignmentId','permitId']);const j=owned(b,executorId);if(j.cancelled||j.assignment.leaseUntil<=clock()||j.permit?.permitId!==b.permitId||
              j.targetGrantId!==state.executors[executorId].grantId||
              state.executors[executorId].suspendedAt)fail('E_LEASE');j.assignment.leaseUntil=clock()+90000;out={leaseUntil:j.assignment.leaseUntil};break;}
          case '/v1/cancellation':{
            exact(b,['assignmentId']);const j=owned(b,executorId);out={cancelled:Boolean(j.cancelled),leaseUntil:j.assignment.leaseUntil};break;}
          case '/v1/receipt':{
            exact(b,['assignmentId','receiptKey','runRef','result']);
            const j=owned(b,executorId);
            if(!j.runRef||canonical(j.runRef)!==canonical(b.runRef))fail('E_RUN_REF');
            // Different receipt keys must never overwrite one durable Result.
            if(b.receiptKey!==j.runRef.resultId)fail('E_RECEIPT_KEY');
            out=once('receipt',b.receiptKey,b,()=>{
              // Status acknowledgements never carry page values, errors, URLs or
              // arbitrary metadata. Even a credentialed Executor cannot expand
              // the result scope declared at admission.
              if(b.result?.visibility==='status-only'){
                exact(b.result,['visibility','state','retirementState']);
                if(Object.keys(b.result).length!==3||!['completed','failed','stopped','interrupted'].includes(b.result.state)||
                  b.result.retirementState!=='released')fail('E_RESULT_SCOPE');
              }else if(b.result?.visibility==='full'&&j.resultAllowed===true){
                exact(b.result,['visibility','runId','resultId','revision','state','sourceHash','retirementState','valueWire','error']);
                if(b.result.runId!==j.runRef.runId||b.result.resultId!==j.runRef.resultId||
                  b.result.sourceHash!==j.runRef.sourceHash||
                  b.result.revision?.sourceHash!==j.runRef.sourceHash||
                  !['completed','failed','stopped','interrupted'].includes(b.result.state)||
                  b.result.retirementState!=='released')fail('E_RESULT_SCOPE');
              }else fail('E_RESULT_SCOPE');
              j.receipt={receiptId:randomUUID(),receivedAt:clock(),digest:hash(b),result:b.result};j.state='received';return {receiptId:j.receipt.receiptId,digest:j.receipt.digest};});break;}
          case '/v1/reconcile':exact(b,[]);out={providerId:state.providerId,assignments:Object.values(state.jobs).filter(j=>j.assignment?.executorId===executorId&&
              j.assignment.pairingId===state.executors[executorId].pairingId).map(j=>({assignmentId:j.assignment.assignmentId,runRef:j.runRef??null,permit:j.permit??null,cancelled:!!j.cancelled,leaseUntil:j.assignment.leaseUntil,receipt:j.receipt?{receiptId:j.receipt.receiptId,digest:j.receipt.digest}:null}))};break;
          case '/admin/register':{
            // Only a local administrator can register a verified fixed manifest.
            // The route deliberately rejects sourceUtf8, JS, shell and CDP input.
            exact(b,['manifest','manifestHash']);const task=registeredTask(b.manifest,b.manifestHash),
              key=taskRegistryKey(task),existing=state.taskRegistry[key];
            if(existing&&canonical(existing)!==canonical(task))fail('E_TASK_CONFLICT','Version already bound to another digest');
            state.taskRegistry[key]=task;out={task:taskPin(task),siteOrigins:task.manifest.siteOrigins};break;}
          case '/admin/executors':{
            exact(b,[]);out={executors:Object.entries(state.executors).map(([id,row])=>({
              executorId:id,pairedAt:row.pairedAt,revoked:!!row.revokedAt,
              connected:[...sockets.values()].includes(id)}))};break;}
          case '/admin/client-grant':{
            exact(b,['executorId','tasks','allowResult']);
            const row=state.executors[b.executorId];
            if(!row||row.revokedAt||!row.grantId||row.suspendedAt)fail('E_EXECUTOR_TARGET');
            if(!Array.isArray(b.tasks)||b.tasks.length<1||b.tasks.length>32||
              typeof b.allowResult!=='boolean')fail('E_CLIENT_SCOPE');
            const pinned=[],seen=new Set();
            for(const pin of b.tasks){
              exact(pin,['taskId','version','manifestHash','sourceHash']);
              if(Object.keys(pin).length!==4||Object.values(pin).some(v=>typeof v!=='string'))
                fail('E_CLIENT_SCOPE');
              const registered=state.taskRegistry[taskRegistryKey(pin)];
              if(!registered||canonical(taskPin(registered))!==canonical(pin)||
                !row.capabilities?.some(t=>t.taskId===pin.taskId&&
                  t.manifestHash===pin.manifestHash&&t.sourceHash===pin.sourceHash)||
                seen.has(pin.taskId))fail('E_CLIENT_SCOPE');
              seen.add(pin.taskId);pinned.push(structuredClone(pin));
            }
            const clientId=randomUUID(),credential=token();
            state.clients[clientId]={executorId:b.executorId,pairingId:row.pairingId,
              grantId:row.grantId,tasks:pinned,allowResult:b.allowResult,
              credential,createdAt:clock(),revokedAt:null};
            out={clientId,executorId:b.executorId,tasks:pinned,
              allowResult:b.allowResult,credential};
            break;
          }
          case '/admin/client-revoke':{
            exact(b,['clientId']);
            if(typeof b.clientId!=='string'||!state.clients[b.clientId])fail('E_CLIENT');
            state.clients[b.clientId].revokedAt=clock()||1;
            out={revoked:true};break;
          }
          case '/admin/clients':{
            exact(b,[]);
            out={clients:Object.entries(state.clients).map(([clientId,c])=>({
              clientId,executorId:c.executorId,createdAt:c.createdAt,
              taskCount:c.tasks?.length??0,allowResult:c.allowResult===true,
              revoked:!!c.revokedAt
            }))};break;
          }
          case '/admin/tasks':{
            exact(b,[]);out={tasks:Object.values(state.taskRegistry).map(task=>({...taskPin(task),
              title:task.manifest.title,siteOrigins:task.manifest.siteOrigins}))};break;}
          case '/admin/seed':{
            // Old seed:form requests retain their original requestKey/digest
            // so pre-R5 provider restarts remain strictly idempotent.
            const legacy=!Object.hasOwn(b,'taskId');
            exact(b,legacy?['requestKey','params','target','targetExecutorId']:
              ['requestKey','taskId','version','manifestHash','sourceHash','params','target','targetExecutorId']);
            if(typeof b.targetExecutorId!=='string'||!state.executors[b.targetExecutorId]||
              state.executors[b.targetExecutorId].revokedAt)fail('E_EXECUTOR_TARGET');
            // Pre-R5 key-only requests are never silently remapped to a new
            // recipient, even when a modern request reuses their key.
            if(state.requests['seed:'+b.requestKey])fail('E_REQUEST_CONFLICT');
            if(!legacy&&(!Object.hasOwn(b,'version')||!Object.hasOwn(b,'manifestHash')||
              !Object.hasOwn(b,'sourceHash')))fail('E_SCHEMA','Provide the entire immutable task identity');
            const task=legacy?builtinTask:state.taskRegistry[String(b.taskId)+'@'+String(b.version)];
            if(!task||!legacy&&canonical(taskPin(task))!==canonical({
              taskId:b.taskId,version:b.version,manifestHash:b.manifestHash,sourceHash:b.sourceHash}))
              fail('E_TASK','Task is not in the local immutable registry');
            const target=validateCloudTarget(b.target,task.manifest.siteOrigins);
            if(legacy&&(new URL(target.url).origin!=='http://127.0.0.1:43111'||
              new URL(target.url).pathname!=='/demo-form.html'))fail('E_TARGET');
            const params=validateTaskParams(task.manifest.paramsSchema,b.params??{}),
              pin=taskPin(task);
            const owner=state.executors[b.targetExecutorId];
            if(!owner.grantId||!owner.capabilities?.some(t=>
              t.taskId===pin.taskId&&t.manifestHash===pin.manifestHash&&t.sourceHash===pin.sourceHash))
              fail('E_GRANT','Target Executor has not approved this Task');
            out=once('seed:'+b.targetExecutorId+':'+owner.pairingId,b.requestKey,
              {task:pin,params,target,targetExecutorId:b.targetExecutorId},()=>{
              // Preserve the answer for a previously admitted identical key
              // after Stop, but refuse NEW jobs under suspended approval.
              if(owner.suspendedAt)fail('E_CLOUD_STOPPED');
              const jobId=randomUUID();
              state.jobs[jobId]={jobId,state:'queued',createdAt:clock(),task:pin,params,target,
                targetExecutorId:b.targetExecutorId,targetPairingId:owner.pairingId,targetGrantId:owner.grantId};
              return {jobId};});break;}
          case '/v1/submit':{
            // HTTPS caller is bound to one active paired Executor, not arbitrary
            // installed Tasks or browsers. Reuse the immutable Task registry.
            exact(b,['requestKey','taskId','version','manifestHash','sourceHash','params','target']);
            const task=state.taskRegistry[String(b.taskId)+'@'+String(b.version)];
            if(!task||canonical(taskPin(task))!==canonical({
              taskId:b.taskId,version:b.version,manifestHash:b.manifestHash,
              sourceHash:b.sourceHash}))fail('E_TASK');
            const target=validateCloudTarget(b.target,task.manifest.siteOrigins);
            const params=validateTaskParams(task.manifest.paramsSchema,b.params??{});
            const pin=taskPin(task);
            const owner=state.executors[client.executorId];
            if(!client.tasks?.some(t=>canonical(t)===canonical(pin)))fail('E_CLIENT_SCOPE');
            if(!owner.grantId||!owner.capabilities?.some(t=>
              t.taskId===pin.taskId&&t.manifestHash===pin.manifestHash&&t.sourceHash===pin.sourceHash))
              fail('E_GRANT','Target Executor has not approved this Task');
            out=once('external:'+client.clientId+':'+client.pairingId,b.requestKey,
              {task:pin,params,target,executorId:client.executorId},()=>{
                if(owner.suspendedAt)fail('E_CLOUD_STOPPED');
                // Persisted limits survive restart. Check only inside the
                // first-admission callback: idempotent retries of the same
                // requestKey must still return their original JobId.
                const recent=Object.values(state.jobs).filter(j=>
                  j.submittedBy===client.clientId&&j.createdAt>clock()-60000).length;
                const queued=Object.values(state.jobs).filter(j=>
                  j.submittedBy===client.clientId&&j.state==='queued'&&!j.cancelled).length;
                if(recent>=60||queued>=100)fail('E_QUEUE_LIMIT');
                const jobId=randomUUID();
                state.jobs[jobId]={jobId,state:'queued',createdAt:clock(),
                  task:pin,params,target,targetExecutorId:client.executorId,
                  targetPairingId:client.pairingId,targetGrantId:owner.grantId,submittedBy:client.clientId};
                return {jobId};
              });
            break;
          }
          case '/v1/job-status':{
            exact(b,['jobId']);
            const j=state.jobs[b.jobId];
            if(typeof b.jobId!=='string'||!j||j.submittedBy!==client.clientId||
              j.targetExecutorId!==client.executorId||
              j.targetPairingId!==client.pairingId||
              j.targetGrantId!==client.grantId)fail('E_JOB');
            const status=j.receipt?.result?.state||
              (j.cancelled?(j.runRef?'OUTCOME_UNKNOWN':'cancelled'):
                j.state==='admitted'&&j.assignment?.leaseUntil<=clock()?'OUTCOME_UNKNOWN':
                j.state==='assigned'&&j.assignment?.leaseUntil<=clock()?'expired_before_admission':
                j.state);
            const full=j.receipt?.result;
            out={jobId:j.jobId,state:status,receiptConfirmed:!!j.receipt,
              ...(client.allowResult===true&&j.resultAllowed===true&&
                full?.visibility==='full'?{result:{
                  state:full.state,
                  ...(Object.hasOwn(full,'valueWire')?{valueWire:full.valueWire}:{}),
                  ...(Object.hasOwn(full,'error')?{error:full.error}:{})
                }}:{})};
            break;
          }
          case '/admin/cancel':exact(b,['jobId']);if(!state.jobs[b.jobId])fail('E_JOB');state.jobs[b.jobId].cancelled=true;out={cancelled:true};break;
          case '/admin/fault':exact(b,['path','count']);if(!['/v1/admission','/v1/claim','/v1/receipt'].includes(b.path)||!Number.isSafeInteger(b.count)||b.count<0||b.count>10)fail('E_SCHEMA');state.faults[b.path]=b.count;out={set:true};break;
          case '/admin/state':exact(b,[]);out={providerId:state.providerId,jobs:state.jobs,executors:Object.fromEntries(Object.entries(state.executors).map(([id,e])=>[id,{pairedAt:e.pairedAt,connected:[...sockets.values()].includes(id),capabilities:e.capabilities}]))};break;
          default:fail('E_ROUTE');
        }
        const drop=!!state.faults[path];if(drop)state.faults[path]--;await save();return {out,drop};
      });
      if(path==='/admin/seed')notify(b.targetExecutorId);
      if(path==='/v1/submit')notify(client.executorId);
      if(path==='/admin/cancel')notify(state.jobs[b.jobId]?.targetExecutorId);
      if(path==='/v1/unpair')for(const [ws,id] of sockets)if(id===executorId)ws.terminate();if(answer.drop){req.socket.destroy();return;}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(answer.out));
    }catch(e){res.writeHead(e.code==='E_AUTH'?401:e.code==='E_REQUEST_CONFLICT'?409:400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:e.code||'E_SCHEMA',message:e.message}}));}
  };
  const server=http.createServer((req,res)=>handler(req,res,false));
  const secureServer=publicTls?https.createServer(tlsOptions,(req,res)=>handler(req,res,true)):null;
  const wss=new WebSocketServer({noServer:true,maxPayload:8192});
  const upgrade=(req,socket,head)=>{
    if(req.url!=='/v1/events'||req.headers.origin&&!req.headers.origin.startsWith('chrome-extension://')){
      socket.destroy();return;
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  };
  server.on('upgrade',upgrade);
  secureServer?.on('upgrade',upgrade);
  wss.on('connection',ws=>{
    const timeout=setTimeout(()=>ws.close(),5000);let authenticated=false;
    ws.on('message',data=>{try{const m=JSON.parse(String(data));if(!authenticated){exact(m,['type','ticket']);const t=tickets.get(m.ticket);tickets.delete(m.ticket);if(m.type!=='authenticate'||!t||t.until<=clock()||
          state.executors[t.executorId]?.revokedAt||
          state.executors[t.executorId]?.pairingId!==t.pairingId)fail('E_AUTH');authenticated=true;clearTimeout(timeout);sockets.set(ws,t.executorId);ws.send(JSON.stringify({type:'authenticated',providerId:state.providerId}));}else if(m.type==='ping')ws.send(JSON.stringify({type:'pong'}));else fail('E_SCHEMA');}catch{ws.close();}});
    ws.on('close',()=>{clearTimeout(timeout);sockets.delete(ws);});
  });
  try{
    await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});
    if(secureServer)await new Promise((ok,no)=>{
      secureServer.once('error',no);secureServer.listen(publicTls.port,publicTls.host,ok);
    });
  }catch(e){
    if(server.listening)await new Promise(r=>server.close(r));
    if(secureServer?.listening)await new Promise(r=>secureServer.close(r));
    await handle.close();await unlink(lock);throw e;
  }
  return {port:server.address().port,publicPort:secureServer?.address().port??null,
    directory,credentialFile,providerId:state.providerId,
    close:async()=>{for(const ws of wss.clients)ws.terminate();
      await Promise.all([new Promise(r=>server.close(r)),
        ...(secureServer?[new Promise(r=>secureServer.close(r))]:[])]);
      await tail;await handle.close();await unlink(lock);
    }};
}
