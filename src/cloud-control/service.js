import {canonical,digest,invariant,newId} from '../platform/protocol.js';
import {validateTaskParams} from '../platform/tasks/contract.js';
import {assertRunTaskAuthorization} from '../platform/tasks/service.js';
import {requireGrant} from '../platform/target/index.js';
import {decodeValue} from '../platform/page-port/codec.js';
import {createCloudHistoryIndex} from './history-index.js';
import {isDurableCloudResult} from './durable-outcome.js';
const KV='frameworkKV',CONFIG='cloud:config',IDENTITY='cloud:executor',PREFIX='cloud:request:';
function acceptedCloudTarget(target,origins){
  if(!target||typeof target!=='object'||Array.isArray(target)||
    Object.keys(target).some(k=>!['mode','url'].includes(k))||
    target.mode!=='owned'||typeof target.url!=='string'||target.url.length>8192)return false;
  try{
    const url=new URL(target.url);
    return (url.protocol==='http:'||url.protocol==='https:')&&
      url.href===target.url&&!url.username&&!url.password&&!url.hash&&origins.includes(url.origin);
  }catch{return false;}
}
export function providerUrl(value,allowLoopback=false){
  const u=new URL(value);invariant(!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&
    (u.protocol==='https:'||allowLoopback&&u.origin==='http://127.0.0.1:43112'),'E_PROVIDER','HTTPS provider or explicitly approved fixed loopback required');return u.origin;
}
export function createCloudService({storage,api,clock={now:()=>Date.now()},assertHost,currentHost,resolveTask,emitToHost,fetcher=(...args)=>globalThis.fetch(...args)}){
  let online=false,reconciled=false,connectionState='offline',wake=()=>{},close=()=>{},revocationEpoch=0;
  const deliveries=new Set();
  function invalidate(){revocationEpoch++;for(const abort of deliveries)abort.abort();}
  const transaction=(mode,fn,names=[KV,'runs','commandJournal','results'])=>storage.transaction(names,mode,fn);
  const read=()=>transaction('readonly',tx=>tx.get(KV,CONFIG),[KV]);
  const history=createCloudHistoryIndex({storage,namespace:'tool:'+api.runtime.id});
  let historyReady=false,historyMigrationBlocked=null;
  const rows=()=>transaction('readonly',async tx=>(await tx.all(KV)).filter(r=>r.tag==='cloud-request-v1'),[KV]);
  async function post(config,path,body,{isCurrent=()=>true}={}){
    invariant(config?.credential,'E_PAIRING');
    invariant(isCurrent(),'E_CLOUD_REVOKED');const abort=new AbortController();if(path==='receipt')deliveries.add(abort);
    try{const response=await fetcher(config.url+'/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.credential},body:JSON.stringify(body),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]),redirect:'error'});
      const value=await response.json();invariant(response.ok,value.error?.code||'E_PROVIDER',value.error?.message);return value;
    }finally{deliveries.delete(abort);}
  }
  async function scoped(sender,fn,mode='readonly'){
    const host=await assertHost(sender);return transaction(mode,async tx=>{await currentHost(tx,host,sender);return fn(tx,host);});
  }
  // The two-second dispatcher reads only connectivity and slot readiness.
  // Detailed observations are bounded, paged and contain no persisted IDs.
  async function cloudStatus(request={},sender){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).every(key=>['includeRequests','limit','offset'].includes(key))&&
      (request.includeRequests===undefined||typeof request.includeRequests==='boolean')&&
      (request.limit===undefined||Number.isSafeInteger(request.limit)&&request.limit>=1&&request.limit<=50)&&
      (request.offset===undefined||Number.isSafeInteger(request.offset)&&request.offset>=0&&request.offset<=1000000),'E_SCHEMA');
    const includeRequests=request.includeRequests!==false,limit=request.limit??5,offset=request.offset??0;
    // An authenticated actual Host activates the v2 KV key-range index.
    // The Observer RPC never creates or repairs it. The migration is atomic
    // and never changes the original Run, Result or request key.
    if(includeRequests&&storage.nativeCursorPaging&&!storage.readOnly&&!historyReady&&!historyMigrationBlocked){
      await scoped(sender,async()=>{});
      try{await history.ensure();historyReady=true;}
      catch(error){
        // Quota or an old incompatible database cannot make Cloud management
        // unusable. Continue read-only legacy history; never delete records
        // or repeatedly attempt migration on the two-second heartbeat.
        if(!['E_QUOTA','E_LIMIT','E_VERSION'].includes(error?.code))throw error;
        historyMigrationBlocked=error.code;
      }
    }
    return scoped(sender,async(tx,host)=>{
      const c=await tx.get(KV,CONFIG),slot=await tx.get('runs','@slot');
      let total=null,nextOffset=null,projected=[];
      if(includeRequests){
        const indexed=await history.page(tx,{limit,offset});
        let page;
        if(indexed){
          total=indexed.total;page=indexed.rows;
        }else{
          const requests=(await tx.all(KV)).filter(r=>r.tag==='cloud-request-v1'&&r.namespace===host.namespace)
            .sort((x,y)=>(y.createdAt??0)-(x.createdAt??0)||String(y.requestId).localeCompare(String(x.requestId)));
          total=requests.length;page=requests.slice(offset,offset+limit);
        }
        nextOffset=offset+page.length<total?offset+page.length:null;
        for(const r of page){
          const run=r.runId?await tx.get('runs',r.runId):null;
          projected.push({state:r.state,runState:run?.state??null,retirementState:run?.retirementState??null,
            receipt:r.receipt?true:null,targetReady:!!run?.target&&run.retirementState!=='released'});
        }
        projected.reverse(); // Existing Side Panel shows the newest sample first.
      }
      return {executorId:await tx.get(KV,IDENTITY),provider:c?{url:c.url,providerId:c.providerId}:null,
        enabled:!!c?.enabled,connection:connectionState,online,reconciled,hostReady:true,
        slotAvailable:!slot?.currentRunId&&!slot?.preview,
        tasks:c?.tasks?.map(t=>({taskId:t.taskId,version:t.version,manifestHash:t.manifestHash,
          sourceHash:t.contentHash,siteOrigins:t.manifest.siteOrigins,resultAllowed:t.resultAllowed}))||[],
        requestTotal:total,requestPage:{offset,limit,nextOffset},requests:projected,
        historyIndexStatus:historyMigrationBlocked?'migration-blocked':historyReady?'indexed':'legacy'};
    });
  }
  // A read-only observer never receives executor/Host IDs, Task manifests,
  // grants, URLs, credentials, Run references, result bodies or error details.
  // The namespace is fixed by the extension; callers cannot select tenants.
  async function cloudObserve(request={}){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).every(k=>['limit','offset','state'].includes(k))&&
      (request.limit===undefined||Number.isSafeInteger(request.limit)&&request.limit>=1&&request.limit<=50)&&
      (request.offset===undefined||Number.isSafeInteger(request.offset)&&request.offset>=0&&request.offset<=1000000),'E_SCHEMA');
    const limit=request.limit??20,offset=request.offset??0;
    const allowed=new Set(['waiting','prepared','permitted','finished','cancelled','cancellation-pending','OUTCOME_UNKNOWN']);
    invariant(request.state===undefined||request.state==='all'||allowed.has(request.state),
      'E_SCHEMA','Unrecognized Cloud history filter');
    const allowedRuns=new Set(['preparing','running','stopping','settling','completed','failed','stopped','interrupted','paused_unknown']);
    return transaction('readonly',async tx=>{
      const config=await tx.get(KV,CONFIG),slot=await tx.get('runs','@slot');
      const namespace='tool:'+api.runtime.id;
      const indexed=await history.page(tx,{limit,offset,state:request.state??'all'});
      let total,matchingTotal,states,page;
      if(indexed){
        ({total,matchingTotal,states}=indexed);page=indexed.rows;
      }else{
        const allRequests=(await tx.all(KV)).filter(r=>r?.tag==='cloud-request-v1'&&r.namespace===namespace);
        states={waiting:0,prepared:0,permitted:0,finished:0,cancelled:0,
          'cancellation-pending':0,OUTCOME_UNKNOWN:0,other:0};
        for(const r of allRequests)states[allowed.has(r.state)?r.state:'other']++;
        const requests=request.state&&request.state!=='all'
          ?allRequests.filter(r=>r.state===request.state):allRequests;
        requests.sort((a,b)=>(b.createdAt??0)-(a.createdAt??0)||
          String(b.requestId).localeCompare(String(a.requestId)));
        total=allRequests.length;matchingTotal=requests.length;
        page=requests.slice(offset,offset+limit);
      }
      const rows=[];
      for(const r of page){
        const run=r.runId?await tx.get('runs',r.runId):null;
        rows.push({state:allowed.has(r.state)?r.state:'other',
          runState:allowedRuns.has(run?.state)?run.state:null,
          retirementReleased:run?.retirementState==='released',
          receiptConfirmed:!!r.receipt&&r.delivery?.state==='confirmed',
          createdAt:Number.isSafeInteger(r.createdAt)&&r.createdAt>=0?r.createdAt:null});
      }
      return {schema:'opendesk.cloud-control.observer.v1',paired:!!config,
        enabled:config?.enabled===true,connection:connectionState,
        online,reconciled,hostReady:null,slotAvailable:!slot?.currentRunId&&!slot?.preview,
        approvedTasks:Math.min(config?.tasks?.length??0,32),requestTotal:total,
        matchingTotal,filter:request.state??'all',
        states,rows,page:{offset,limit,nextOffset:offset+rows.length<matchingTotal?offset+rows.length:null}};
    },[KV,'runs']);
  }
  async function cloudPair(request,sender){
    invariant(Object.keys(request).every(k=>['url','providerId','pairingCode','allowLoopback'].includes(k)),'E_SCHEMA');
    const url=providerUrl(request.url,request.allowLoopback===true),host=await assertHost(sender);
    const executorId=await scoped(sender,async tx=>{invariant(!(await tx.get(KV,CONFIG)),'E_PAIRING','Unpair existing provider first');let id=await tx.get(KV,IDENTITY);if(!id){id=newId();await tx.put(KV,id,IDENTITY);}return id;},'readwrite');
    const response=await fetcher(url+'/v1/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({executorId,pairingCode:request.pairingCode}),signal:AbortSignal.timeout(10000),redirect:'error'}),pair=await response.json();
    invariant(response.ok&&pair.providerId===request.providerId&&typeof pair.credential==='string','E_PAIRING','Provider identity or pairing credential rejected');
    await scoped(sender,async tx=>{invariant(!(await tx.get(KV,CONFIG)),'E_PAIRING');await tx.put(KV,{url,providerId:pair.providerId,credential:pair.credential,executorId,namespace:host.namespace,enabled:false,tasks:[],pendingRequestId:null},CONFIG);},'readwrite');return cloudStatus({},sender);
  }
  async function cloudApprove(request,sender){
    invariant(Object.keys(request).every(k=>k==='tasks')&&Array.isArray(request.tasks)&&request.tasks.length>0&&request.tasks.length<=32,'E_SCHEMA');
    const tasks=[],seen=new Set();
    for(const approval of request.tasks){
      invariant(approval&&typeof approval==='object'&&!Array.isArray(approval)&&
        Object.keys(approval).every(k=>['taskId','version','manifestHash','sourceHash','installationId','generation','siteOrigins','resultAllowed'].includes(k))&&
        typeof approval.taskId==='string'&&typeof approval.resultAllowed==='boolean'&&
        !seen.has(approval.taskId),'E_SCHEMA','Invalid or duplicate task approval');
      seen.add(approval.taskId);
      const installed=await resolveTask({taskId:approval.taskId},sender);
      // An explicit UI consent must still name the exact installed identity
      // at the moment the original Task resolver authorizes the request.
      for(const [key,value] of [['version',installed.version],['manifestHash',installed.manifestHash],
        ['sourceHash',installed.contentHash],['installationId',installed.installationId],
        ['generation',installed.generation]])
        if(Object.hasOwn(approval,key))invariant(approval[key]===value,'E_REVISION',
          'Task version or installation changed during approval');
      if(Object.hasOwn(approval,'siteOrigins'))
        invariant(canonical(approval.siteOrigins)===canonical(installed.manifest.siteOrigins),
          'E_REVISION','Task website scope changed during approval');
      tasks.push({...installed,resultAllowed:approval.resultAllowed});
    }
    for(const t of tasks)for(const origin of t.manifest.siteOrigins)await requireGrant(api,origin);
    await scoped(sender,async(tx,host)=>{const c=await tx.get(KV,CONFIG);invariant(c&&c.namespace===host.namespace&&!c.enabled,'E_PAIRING','Stop current hosting before changing approval');
      c.tasks=tasks;c.grantId=newId();c.claimId=null;c.pendingRequestId=null;c.enabled=true;c.revokedAt=null;await tx.put(KV,c,CONFIG);},'readwrite');wake();return cloudStatus({},sender);
  }
  async function fence(request,reason){
    const result=await transaction('readwrite',async tx=>{const r=await tx.get(KV,PREFIX+request.requestId);if(!r)return;const run=r.runId&&await tx.get('runs',r.runId);
      // A real terminal Result + released original Run stays settled even if
      // the Provider receipt acknowledgement was lost or the lease expired.
      const durableResult=run?.retirementState==='released'&&run.resultId?
        await tx.get('results',run.resultId):null;
      if(isDurableCloudResult(r,run,durableResult)){
        if(r.state!=='finished'||run.state==='completed'&&r.reason==='E_CLOUD_CANCELLED'){
          r.state='finished';
          if(run.state==='completed'&&r.reason==='E_CLOUD_CANCELLED')delete r.reason;
          await history.put(tx,r);
        }
        return null;
      }
      // Legacy acknowledged history also remains immutable if its old Result
      // record cannot be inspected. Never infer completion from a slot alone.
      if(r.receipt&&run?.retirementState==='released'&&
        (r.state==='finished'||r.delivery?.state==='confirmed'))return null;
      r.reason=reason;
      if(!run){
        // An admitted Run may have performed native side effects even when
        // its durable row is absent. Never mislabel it as an unused claim.
        r.state=r.runId?'OUTCOME_UNKNOWN':'cancelled';
        if(r.runId)r.reason='E_EFFECT_UNKNOWN';
        await history.put(tx,r);return;
      }
      // A run already stopping has an original durable cancellation fence.
      // Repeated cloudStop/reconnect notifications must not advance its owner
      // epoch or cancellation sequence and invalidate its pending settlement.
      const newlyFenced=['preparing','running'].includes(run.state)&&!run.cancelSeq;
      if(newlyFenced){run.cancelSeq++;run.ownerEpoch++;run.runRevision++;run.eventSeq++;run.state='stopping';run.terminalReason=reason;await tx.put('runs',run,run.runId);const k='controller-pin:'+run.runId,l=await tx.get('commandJournal',k);if(l)await tx.put('commandJournal',{...l,state:run.state,cancelSeq:run.cancelSeq},k);}
      // Released alone does not prove outcome: only the matching original
      // durable Result above can establish the terminal finished state.
      if(run.retirementState==='released'||run.state==='paused_unknown'||r.state==='OUTCOME_UNKNOWN'){
        r.state='OUTCOME_UNKNOWN';r.reason='E_EFFECT_UNKNOWN';
      }else r.state='cancellation-pending';
      await history.put(tx,r);
      return newlyFenced?run:null;});
    if(result)await emitToHost(result.registrationId,{type:'controller-fenced',runId:result.runId,reasonCode:reason});
  }
  async function cloudStop(_,sender){
    // A hosting stop revokes only its current, authenticated grant. Historical
    // assignments from retired providers/approval generations are immutable
    // evidence and must never be rewritten or have unrelated hosts fenced.
    const scope=await scoped(sender,async(tx,host)=>{
      const c=await tx.get(KV,CONFIG);
      if(!c)return null;
      const owned={namespace:host.namespace,grantId:c.grantId};
      c.enabled=false;c.revokedAt=clock.now();c.claimId=null;c.pendingRequestId=null;
      await tx.put(KV,c,CONFIG);
      return owned;
    },'readwrite');
    invalidate();close();
    if(scope?.grantId)for(const r of await rows()){
      if(r.namespace===scope.namespace&&r.grantId===scope.grantId)
        await fence(r,'E_CLOUD_REVOKED');
    }
    return cloudStatus({},sender);
  }
  async function cloudUnpair(_,sender){await cloudStop({},sender);await scoped(sender,tx=>tx.delete(KV,CONFIG),'readwrite');return cloudStatus({},sender);}
  let nextPromise;
  async function cloudNext(_,sender){if(nextPromise)return null;nextPromise=next(sender);try{return await nextPromise;}finally{nextPromise=null;}}
  async function pendingRequest(sender,host,configSnapshot){
    let id=configSnapshot.pendingRequestId;
    if(id===undefined){
      // Migration: pre-R3 config has no pointer. Find at most one original
      // never-started request, preserving the provider's persisted claim.
      const candidates=(await rows()).filter(r=>r.namespace===host.namespace&&
        r.grantId===configSnapshot.grantId&&!r.runId&&r.state==='waiting');
      const original=candidates.find(r=>r.assignment?.leaseUntil>clock.now())??candidates[0];
      const legacyId=original?.requestId??null;
      id=await scoped(sender,async tx=>{
        const c=await tx.get(KV,CONFIG);
        if(!c?.enabled||c.grantId!==configSnapshot.grantId)return null;
        if(c.pendingRequestId!==undefined)return c.pendingRequestId;
        c.pendingRequestId=legacyId;
        await tx.put(KV,c,CONFIG);
        return legacyId;
      },'readwrite');
    }
    if(!id)return null;
    const stored=await transaction('readonly',tx=>tx.get(KV,PREFIX+id),[KV]);
    if(stored?.namespace===host.namespace&&stored.grantId===configSnapshot.grantId&&
      stored.state==='waiting'&&!stored.runId&&stored.assignment?.leaseUntil>clock.now())
      return {requestId:id};
    // Only retire an expired, still-waiting request. An admitted Run, a
    // revoked grant and another Host's record must never be rewritten.
    await scoped(sender,async(tx,current)=>{
      const c=await tx.get(KV,CONFIG);
      if(!c?.enabled||c.grantId!==configSnapshot.grantId||c.pendingRequestId!==id)return;
      const row=await tx.get(KV,PREFIX+id);
      if(row?.namespace===current.namespace&&row.grantId===c.grantId&&
        row.state==='waiting'&&!row.runId&&!(row.assignment?.leaseUntil>clock.now())){
        row.state='cancelled';row.reason='E_LEASE';
        await history.put(tx,row);
      }
      c.pendingRequestId=null;
      await tx.put(KV,c,CONFIG);
    },'readwrite');
    return null;
  }
  async function next(sender){
    const host=await assertHost(sender),c=await read();if(!c?.enabled||!online||!reconciled||c.namespace!==host.namespace)return null;
    // Primary-key hint is durably updated with the original assignment/Run
    // binding. The one-time legacy read supports older installed versions.
    // Normal two-second polls never enumerate the entire frameworkKV journal.
    const pending=await pendingRequest(sender,host,c);
    if(pending)return pending;
    const claim=await scoped(sender,async tx=>{const slot=await tx.get('runs','@slot');if(slot?.currentRunId||slot?.preview)return null;const config=await tx.get(KV,CONFIG);if(!config?.enabled||config.grantId!==c.grantId||config.pendingRequestId)return null;
      config.claimId??=newId();await tx.put(KV,config,CONFIG);return {claimId:config.claimId,tasks:c.tasks.map(t=>({taskId:t.taskId,manifestHash:t.manifestHash,sourceHash:t.contentHash}))};},'readwrite');if(!claim)return null;
    const answer=await post(c,'claim',claim);
    return scoped(sender,async tx=>{const config=await tx.get(KV,CONFIG);invariant(config?.enabled&&config.grantId===c.grantId&&config.claimId===claim.claimId,'E_CLOUD_REVOKED');
      if(answer.assignment){const a=answer.assignment;invariant(a.executorId===c.executorId&&a.claimId===claim.claimId&&a.leaseUntil>clock.now(),'E_ASSIGNMENT');const t=c.tasks.find(t=>t.taskId===a.task.taskId&&t.version===a.task.version&&t.manifestHash===a.task.manifestHash&&t.contentHash===a.task.sourceHash);invariant(t&&acceptedCloudTarget(a.target,t.manifest.siteOrigins),'E_TASK');
        const params=validateTaskParams(t.manifest.paramsSchema,a.params),requestId='cloud:'+a.assignmentId;const digestValue=await digest({providerId:c.providerId,executorId:c.executorId,assignmentId:a.assignmentId,task:a.task,params,target:a.target});const prior=await tx.get(KV,PREFIX+requestId);invariant(!prior||prior.digest===digestValue,'E_REQUEST_CONFLICT');
        if(!prior)await history.put(tx,{tag:'cloud-request-v1',requestId,digest:digestValue,assignment:a,params,task:t,grantId:c.grantId,namespace:host.namespace,state:'waiting',createdAt:clock.now()});
        config.claimId=null;config.pendingRequestId=!prior||prior.state==='waiting'&&!prior.runId?requestId:null;
        await tx.put(KV,config,CONFIG);return config.pendingRequestId?{requestId}:null;}
      config.claimId=null;config.pendingRequestId=null;await tx.put(KV,config,CONFIG);return null;
    },'readwrite');
  }
  async function cloudResolve(request,sender){invariant(typeof request?.requestId==='string'&&request.requestId.startsWith('cloud:'),'E_SCHEMA');const initial=await transaction('readonly',tx=>tx.get(KV,PREFIX+request.requestId),[KV]);invariant(initial?.tag==='cloud-request-v1','E_TASK');const t=await resolveTask({taskId:initial.task.taskId},sender);return scoped(sender,async(tx,host)=>{const r=await tx.get(KV,PREFIX+request.requestId),c=await tx.get(KV,CONFIG);invariant(c?.enabled&&r?.namespace===host.namespace&&r.grantId===c.grantId&&!r.runId&&r.state==='waiting'&&r.assignment.leaseUntil>clock.now(),'E_CLOUD_REVOKED');
    invariant(t.installationId===r.task.installationId&&t.generation===r.task.generation&&t.manifestHash===r.task.manifestHash&&t.version===r.task.version&&t.contentHash===r.task.contentHash&&t.scriptId===r.task.scriptId,'E_PERMISSION');return {scriptId:t.scriptId,revision:t.revision,contentHash:t.contentHash,params:r.params,target:r.assignment.target,expectedTaskGeneration:t.generation,expectedTaskInstallationId:t.installationId,requestId:r.requestId,cloudRequestId:r.requestId,deadlineAt:Math.min(clock.now()+60000,r.assignment.leaseUntil)};});}
  async function bind(tx,run,request,host){
    const r=await tx.get(KV,PREFIX+request.cloudRequestId),c=await tx.get(KV,CONFIG);invariant(c?.enabled&&r?.namespace===host.namespace&&r.grantId===c.grantId&&r.state==='waiting'&&!r.runId&&r.assignment.leaseUntil>clock.now(),'E_CLOUD_REVOKED');
    invariant(run.scriptId===r.task.scriptId&&run.contentHash===r.task.contentHash&&run.installedTaskAuthorization?.manifestHash===r.task.manifestHash&&canonical(run.installedTaskAuthorization?.authorization)===canonical({tag:'task-install-authorization-v1',installationId:r.task.installationId,generation:r.task.generation,scope:{capabilities:r.task.manifest.permissions,siteOrigins:r.task.manifest.siteOrigins,networkOrigins:[]}})&&canonical(decodeValue(run.paramsWire))===canonical(r.params)&&canonical(run.selection)===canonical(r.assignment.target)&&!run.networkOrigins.length,'E_TASK');
    run.cloudRequestId=r.requestId;r.runId=run.runId;r.runRef={runId:run.runId,resultId:run.resultId,requestId:r.requestId,sourceHash:run.contentHash,manifestHash:r.task.manifestHash,grantId:r.grantId};r.state='prepared';await history.put(tx,r);
    if(c.pendingRequestId===r.requestId){c.pendingRequestId=null;await tx.put(KV,c,CONFIG);}
  }
  async function permit(run){
    const r=await transaction('readonly',tx=>tx.get(KV,PREFIX+run.cloudRequestId),[KV]),c=await read();invariant(c?.enabled&&c.grantId===r?.grantId,'E_CLOUD_REVOKED');let p;
    for(let attempt=0;attempt<2;attempt++){try{p=await post(c,'admission',{assignmentId:r.assignment.assignmentId,runRef:r.runRef});break;}catch(e){if(attempt||e.code)throw e;}}
    await transaction('readwrite',async tx=>{const current=await tx.get(KV,PREFIX+r.requestId),config=await tx.get(KV,CONFIG),stored=await tx.get('runs',run.runId);invariant(config?.enabled&&config.grantId===r.grantId&&stored?.state==='preparing'&&!stored.cancelSeq&&current?.runId===run.runId&&p.providerId===config.providerId&&p.assignmentId===r.assignment.assignmentId&&canonical(p.runRef)===canonical(r.runRef)&&p.leaseUntil>clock.now(),'E_PERMIT');await assertRunTaskAuthorization(tx,stored);current.permit=p;current.state='permitted';await history.put(tx,current);});
  }
  async function assertActive(tx,run){if(!run.cloudRequestId)return;const r=await tx.get(KV,PREFIX+run.cloudRequestId),c=await tx.get(KV,CONFIG);invariant(c?.enabled&&r?.grantId===c.grantId&&r.runId===run.runId&&r.permit?.runRef.runId===run.runId&&r.permit?.leaseUntil>clock.now()&&!['cancelled','cancellation-pending','OUTCOME_UNKNOWN'].includes(r.state),'E_CLOUD_FENCED');}
  async function reconcile({isCurrent=()=>true}={}){
    const epoch=revocationEpoch,current=()=>isCurrent()&&epoch===revocationEpoch;
    const c=await read();if(!c?.enabled||!current())return;
    const remote=await post(c,'reconcile',{}, {isCurrent:current});if(!current())return;invariant(remote.providerId===c.providerId,'E_PROVIDER');
    for(const r of await rows()){
      if(!current())return;if(r.grantId!==c.grantId)continue;
      const run=r.runId?await transaction('readonly',tx=>tx.get('runs',r.runId)):null;
      // Remote expiry, cancellation or pruning cannot cancel confirmed completion.
      if(r.receipt&&run?.retirementState==='released'&&
        (r.state==='finished'||r.delivery?.state==='confirmed')){
        // Correct historical late-cancellation labels without touching the
        // original Result, retirement or already-confirmed receipt.
        if(r.reason==='E_CLOUD_CANCELLED'&&run.state==='completed')
          await fence(r,'E_CLOUD_CANCELLED');
        continue;
      }
      const a=remote.assignments.find(a=>a.assignmentId===r.assignment.assignmentId);
      if(!a||a.runRef&&r.runRef&&canonical(a.runRef)!==canonical(r.runRef)){await fence(r,'E_RUN_REF');continue;}
      if(run?.state==='paused_unknown'){
        await transaction('readwrite',async tx=>{if(!current())return;const row=await tx.get(KV,PREFIX+r.requestId);row.state='OUTCOME_UNKNOWN';row.reason='Original Run recovery fenced execution';await history.put(tx,row);});continue;
      }
      if(a.cancelled||a.leaseUntil<=clock.now()){await fence(r,'E_CLOUD_CANCELLED');if(!r.runId)continue;}
      const active=run&&['preparing','running'].includes(run.state)&&!run.cancelSeq&&r.state==='permitted';
      if(active&&r.permit&&!r.receipt&&!a.cancelled&&a.leaseUntil>clock.now()){
        if(r.permit.leaseUntil<=clock.now())await fence(r,'E_LEASE');
        else try{
          const lease=await post(c,'renew',{assignmentId:r.assignment.assignmentId,permitId:r.permit.permitId},{isCurrent:current});
          await transaction('readwrite',async tx=>{
            const row=await tx.get(KV,PREFIX+r.requestId),config=await tx.get(KV,CONFIG),stored=await tx.get('runs',r.runId);
            invariant(current()&&config?.enabled&&config.grantId===r.grantId&&row?.state==='permitted'&&row.permit?.permitId===r.permit.permitId&&canonical(row.runRef)===canonical(r.runRef)&&row.permit.leaseUntil>clock.now()&&['preparing','running'].includes(stored?.state)&&!stored.cancelSeq&&lease.leaseUntil>clock.now(),'E_CLOUD_FENCED');
            await assertRunTaskAuthorization(tx,stored);row.permit.leaseUntil=lease.leaseUntil;await history.put(tx,row);
          });
        }catch{if(current())await fence(r,'E_LEASE');}
      }
      if(!r.runId||!current())continue;
      const projection=await transaction('readonly',async tx=>{
        const stored=await tx.get('runs',r.runId),config=await tx.get(KV,CONFIG);
        if(!stored||stored.state==='paused_unknown'||!r.task.resultAllowed||!config?.enabled||config.revokedAt||config.grantId!==r.grantId)return null;
        await assertRunTaskAuthorization(tx,stored);const result=await tx.get('results',stored.resultId);if(!result)return null;
        invariant(result.tag==='controller-result'&&result.runId===r.runRef.runId&&result.resultId===r.runRef.resultId&&result.revision?.sourceHash===r.runRef.sourceHash,'E_RESULT');return {result:structuredClone(result),run:stored};
      });
      if(!projection||r.receipt||projection.run.retirementState!=='released')continue;
      for(const origin of r.task.manifest.siteOrigins)await requireGrant(api,origin);
      const allowed=await transaction('readwrite',async tx=>{
        const row=await tx.get(KV,PREFIX+r.requestId),config=await tx.get(KV,CONFIG),stored=await tx.get('runs',r.runId);await assertRunTaskAuthorization(tx,stored);
        if(!current()||stored.resultDeliveryRevoked||!config?.enabled||config.grantId!==r.grantId||canonical(row.runRef)!==canonical(r.runRef))return false;
        row.delivery={state:'pending',receiptKey:r.runRef.resultId,grantId:r.grantId,runRef:r.runRef};await history.put(tx,row);return true;
      });if(!allowed||!current())continue;
      const result=projection.result,limited={runId:result.runId,resultId:result.resultId,revision:result.revision,state:result.state,sourceHash:r.runRef.sourceHash,retirementState:projection.run.retirementState,...(result.outcome?.valueWire!==undefined?{valueWire:result.outcome.valueWire}:{}),...(result.outcome?.error?{error:result.outcome.error}:{})};
      const receipt=await post(c,'receipt',{assignmentId:r.assignment.assignmentId,receiptKey:r.runRef.resultId,runRef:r.runRef,result:limited},{isCurrent:current});
      await transaction('readwrite',async tx=>{
        const row=await tx.get(KV,PREFIX+r.requestId),config=await tx.get(KV,CONFIG),stored=await tx.get('runs',r.runId);
        if(!current()||!config?.enabled||config.grantId!==r.grantId||stored.resultDeliveryRevoked||canonical(row.runRef)!==canonical(r.runRef))return;
        await assertRunTaskAuthorization(tx,stored);row.receipt=receipt;row.delivery.state='confirmed';row.state='finished';await history.put(tx,row);
      });
    }
  }
  return {cloudStatus,cloudObserve,cloudPair,cloudApprove,cloudStop,cloudUnpair,cloudNext,cloudResolve,bind,permit,assertActive,read,post,reconcile,invalidate,
    attachConnection({start,stop}){wake=start;close=stop;},connection(state){connectionState=state;online=state==='authenticated';if(!online)reconciled=false;},setReconciled(value){reconciled=value;}};
}
