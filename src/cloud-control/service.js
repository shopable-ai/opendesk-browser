import {canonical,digest,invariant,newId} from '../platform/protocol.js';
import {validateTaskParams} from '../platform/tasks/contract.js';
import {assertRunTaskAuthorization} from '../platform/tasks/service.js';
import {requireGrant} from '../platform/target/index.js';
import {decodeValue} from '../platform/page-port/codec.js';
import {createCloudHistoryIndex} from './history-index.js';
import {isDurableCloudResult} from './durable-outcome.js';
const KV='frameworkKV',CONFIG='cloud:config',IDENTITY='cloud:executor',PREFIX='cloud:request:';
const nonempty=value=>typeof value==='string'&&value.length>0&&value.length<=512;
const finiteLease=value=>Number.isFinite(value)&&value>0;
const rowKey=row=>row.storageKey||PREFIX+row.requestId;
const requestBinding=row=>row.identity?.pairing?.pairingId&&row.assignment.pairingId?{binding:{...row.identity.pairing,jobId:row.identity.jobId,claimId:row.identity.claimId,assignmentId:row.identity.assignmentId,attemptEpoch:row.identity.attemptEpoch}}:{};
const pairingIdentity=c=>({providerId:c.providerId,executorId:c.executorId,pairingId:c.pairingId??null,pairingGeneration:c.pairingGeneration??0});
const legacyMapped=(row,c)=>!row.identity&&c?.legacyPairing&&canonical(pairingIdentity(c))===canonical(c.legacyPairing.pairing)&&row.namespace===c.legacyPairing.namespace&&row.grantId===c.legacyPairing.grantId&&row.assignment?.executorId===c.executorId&&c.legacyPairing.requestKeys.includes(rowKey(row));
const samePairing=(row,c)=>!!c&&(row.identity?canonical(pairingIdentity(c))===canonical(row.identity.pairing):legacyMapped(row,c)||!c.pairingId&&row.assignment?.executorId===c.executorId&&row.namespace===c.namespace);
const effectiveIdentity=(row,c)=>row.identity??{pairing:pairingIdentity(c),jobId:row.assignment.jobId,claimId:row.assignment.claimId,assignmentId:row.assignment.assignmentId,attemptEpoch:row.assignment.attemptEpoch??1};
function assignmentIdentity(c,a){
  invariant(nonempty(a?.assignmentId)&&nonempty(a.jobId)&&a.executorId===c.executorId&&nonempty(a.claimId)&&finiteLease(a.leaseUntil),'E_ASSIGNMENT');
  if(c.pairingId)invariant(a.providerId===c.providerId&&a.pairingId===c.pairingId&&a.pairingGeneration===c.pairingGeneration&&Number.isSafeInteger(a.attemptEpoch)&&a.attemptEpoch>0,'E_ASSIGNMENT');
  return {pairing:pairingIdentity(c),jobId:a.jobId,claimId:a.claimId,assignmentId:a.assignmentId,attemptEpoch:a.attemptEpoch??0};
}
const APPROVAL_FIELDS=['taskId','version','manifestHash','sourceHash','installationId','generation','siteOrigins','resultAllowed'];
function acceptedCloudTarget(target,origins){
 if(!target||typeof target!=='object'||Array.isArray(target)||Object.keys(target).some(k=>!['mode','url'].includes(k))||target.mode!=='owned'||typeof target.url!=='string'||target.url.length>8192)return false;
 try{const url=new URL(target.url);return (url.protocol==='http:'||url.protocol==='https:')&&url.href===target.url&&!url.username&&!url.password&&!url.hash&&origins.includes(url.origin);}catch{return false;}
}
function assertPermit(p,c,r){
  invariant(nonempty(p?.permitId)&&p.providerId===c?.providerId&&p.assignmentId===r.assignment.assignmentId&&p.runRef&&canonical(p.runRef)===canonical(r.runRef)&&finiteLease(p.leaseUntil),'E_PERMIT');
  if(c?.pairingId){const identity=effectiveIdentity(r,c),expected={...identity.pairing,attemptEpoch:identity.attemptEpoch,jobId:identity.jobId,claimId:identity.claimId};
    for(const [key,value]of Object.entries(expected))invariant(legacyMapped(r,c)&&!Object.hasOwn(p,key)||p[key]===value,'E_PERMIT');}
}
export function providerUrl(value,allowLoopback=false){
  const u=new URL(value);invariant(!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&
    (u.protocol==='https:'||allowLoopback&&u.origin==='http://127.0.0.1:43112'),'E_PROVIDER','HTTPS provider or explicitly approved fixed loopback required');return u.origin;
}
export function createCloudService({storage,api,clock={now:()=>Date.now()},assertHost,currentHost,resolveTask,emitToHost,fetcher=(...args)=>globalThis.fetch(...args)}){
  let online=false,reconciled=false,connectionState='offline',wake=()=>{},close=()=>{},revocationEpoch=0,connectionEpoch=0;
  const deliveries=new Map();let knownRemoteRuns=new Map();
  function abortDeliveries(requestIds){for(const [abort,requestId]of deliveries)if(!requestIds||requestIds.has(requestId))abort.abort();}
  function invalidate(){revocationEpoch++;connectionEpoch++;knownRemoteRuns=new Map();abortDeliveries();}
  const transaction=(mode,fn,names=[KV,'runs','commandJournal','results'])=>storage.transaction(names,mode,fn);
  const read=()=>transaction('readonly',tx=>tx.get(KV,CONFIG),[KV]);
  const history=createCloudHistoryIndex({storage,namespace:'tool:'+api.runtime.id});
  let historyReady=false,historyMigrationBlocked=null;
  async function siteAuthorization(config){
    const origins=[...new Set(config?.tasks?.flatMap(task=>task.manifest.siteOrigins)??[])];
    if(!origins.length)return 'none';
    const grants=await Promise.all(origins.map(async origin=>{try{await requireGrant(api,origin);return 'granted';}catch(error){return error.code==='E_PERMISSION'?'revoked':'unknown';}}));
    return grants.includes('revoked')?'revoked':grants.includes('unknown')?'unknown':'granted';
  }
  async function unknownOutcome(tx,run,operations){
    if(run?.state==='paused_unknown')return true;
    if(run?.state!=='interrupted')return false;
    return (operations??await tx.all('commandJournal')).some(operation=>operation.runId===run.runId&&
      ['controller-operation','controller-navigation'].includes(operation.tag)&&['dispatched','effect_unknown'].includes(operation.state));
  }
  async function slotFacts(tx,slot){
    if(!slot?.currentRunId)return {slotState:slot?.preview?'preview':'available',pendingResources:false};
    const run=await tx.get('runs',slot.currentRunId);
    if(!run)return {slotState:'unknown',pendingResources:true};
    const request=run.cloudRequestId?await tx.get(KV,run.cloudRequestKey||PREFIX+run.cloudRequestId):null;
    if(run.state==='paused_unknown'||run.state==='interrupted'&&request?.runId===run.runId&&request.state==='OUTCOME_UNKNOWN')return {slotState:'outcome-unknown',pendingResources:true};
    if(run.state==='stopping')return {slotState:'stopping',pendingResources:true};
    if(['preparing','running','settling'].includes(run.state))return {slotState:run.cloudRequestId?'cloud-running':'local-running',pendingResources:false};
    if(['completed','failed','stopped','interrupted'].includes(run.state)&&run.retirementState!=='released')return {slotState:'retirement-pending',pendingResources:true};
    return {slotState:'unknown',pendingResources:true};
  }
  // Existing credential authentication may name the original legacy pairing.
  // Adopt only its identity; old rows, bodies, leases and native facts stay intact.
  async function adoptPairing(before,auth,{isCurrent=()=>true}={}){
    invariant(auth.providerId===before.providerId&&auth.executorId===before.executorId&&nonempty(auth.pairingId)&&Number.isSafeInteger(auth.pairingGeneration)&&auth.pairingGeneration>0&&nonempty(auth.ticket)&&finiteLease(auth.expiresAt)&&auth.expiresAt>clock.now(),'E_PAIRING');
    if(Object.hasOwn(before,'pairingId')||Object.hasOwn(before,'pairingGeneration')){invariant(before.pairingId===auth.pairingId&&before.pairingGeneration===auth.pairingGeneration,'E_PAIRING');return before;}
    return transaction('readwrite',async tx=>{
      const current=await tx.get(KV,CONFIG),executor=await tx.get(KV,IDENTITY);
      invariant(isCurrent()&&auth.expiresAt>clock.now()&&current?.enabled&&!current.unpairing&&!current.revokedAt&&nonempty(current.grantId)&&nonempty(current.namespace)&&Array.isArray(current.tasks)&&executor===before.executorId&&canonical(current)===canonical(before),'E_CLOUD_FENCED');
      const requestKeys=[],seen=new Set();
      for(const row of await tx.all(KV))if(row?.tag==='cloud-request-v1'&&!row.identity&&row.namespace===current.namespace&&row.grantId===current.grantId){
        invariant(row.assignment?.executorId===executor&&row.requestId==='cloud:'+row.assignment.assignmentId&&nonempty(row.assignment.jobId)&&nonempty(row.assignment.claimId)&&finiteLease(row.assignment.leaseUntil)&&(!Object.hasOwn(row.assignment,'attemptEpoch')||row.assignment.attemptEpoch===1)&&(!row.storageKey||row.storageKey===PREFIX+row.requestId)&&!seen.has(row.requestId),'E_REQUEST_CONFLICT');
        seen.add(row.requestId);requestKeys.push(rowKey(row));
      }
      current.pairingId=auth.pairingId;current.pairingGeneration=auth.pairingGeneration;
      current.legacyPairing={pairing:pairingIdentity(current),namespace:current.namespace,grantId:current.grantId,requestKeys};
      await tx.put(KV,current,CONFIG);return current;
    },[KV]);
  }
  const rows=()=>transaction('readonly',async tx=>(await tx.all(KV)).filter(r=>r.tag==='cloud-request-v1'),[KV]);
  const findRequest=async(tx,requestId,c,runId)=>{
    if(!c)return undefined;
    const key=PREFIX+await digest({pairing:pairingIdentity(c),requestId});
    const candidates=[await tx.get(KV,key),await tx.get(KV,PREFIX+requestId)];
    const matches=candidates.filter(r=>r?.tag==='cloud-request-v1'&&r.requestId===requestId&&samePairing(r,c)&&(!runId||r.runId===runId));
    invariant(matches.length<=1,'E_REQUEST_CONFLICT');return matches[0];
  };
  const requestForRun=async(tx,run,c)=>{
    if(run.cloudRequestKey){
      const r=await tx.get(KV,run.cloudRequestKey);
      invariant(r?.tag==='cloud-request-v1'&&r.requestId===run.cloudRequestId&&samePairing(r,c)&&r.runId===run.runId,'E_CLOUD_FENCED');
      return r;
    }
    return findRequest(tx,run.cloudRequestId,c,run.runId);
  };
  async function post(config,path,body,{isCurrent=()=>true,timeoutMs=10000}={}){
    invariant(config?.credential,'E_PAIRING');
    invariant(isCurrent(),'E_CLOUD_REVOKED');const abort=new AbortController();if(path==='receipt')deliveries.set(abort,body.runRef?.requestId);
    try{const response=await fetcher(config.url+'/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.credential},body:JSON.stringify(body),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(timeoutMs)]),redirect:'error'});
      const value=await response.json();invariant(response.ok,value.error?.code||'E_PROVIDER',value.error?.message);return value;
    }finally{deliveries.delete(abort);}
  }
  async function scoped(sender,fn,mode='readonly'){
    const host=await assertHost(sender);return transaction(mode,async tx=>{await currentHost(tx,host,sender);return fn(tx,host);});
  }
  // The two-second dispatcher reads only connectivity and slot readiness.
  // The observer remains strictly ID-free; authenticated Host history may
  // expose a validated original Run pointer for explicit local result lookup.
  // Read original confirmation through a private durable pointer. Legacy
  // receipts remain readable without enumerating unrelated request bodies.
  async function lastRevocation(tx,namespace){
    const pointer=await tx.get(KV,'cloud:revocation-last:'+encodeURIComponent(namespace));
    if(pointer?.tag==='cloud-revocation-pointer-v1'&&pointer.namespace===namespace){
      const receipt=await tx.get(KV,'cloud:revocation:'+pointer.revocationId);
      if(receipt?.tag==='cloud-revocation-v1'&&receipt.namespace===namespace&&receipt.state==='confirmed')return receipt;
    }
    let latest=null;
    const consider=receipt=>{if(receipt?.tag==='cloud-revocation-v1'&&receipt.namespace===namespace&&receipt.state==='confirmed'&&(!latest||receipt.confirmedAt>latest.confirmedAt))latest=receipt;};
    if(typeof tx.keys==='function'){
      const keys=await tx.keys(KV,{prefix:'cloud:revocation:',limit:1000001});
      invariant(keys.length<=1000000,'E_LIMIT');
      for(const key of keys)consider(await tx.get(KV,key));
    }else for(const receipt of await tx.all(KV))consider(receipt);
    return latest;
  }
  async function cloudStatus(request={},sender){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).every(key=>['includeRequests','limit','offset'].includes(key))&&
      (request.includeRequests===undefined||typeof request.includeRequests==='boolean')&&
      (request.limit===undefined||Number.isSafeInteger(request.limit)&&request.limit>=1&&request.limit<=50)&&
      (request.offset===undefined||Number.isSafeInteger(request.offset)&&request.offset>=0&&request.offset<=1000000),'E_SCHEMA');
    const includeRequests=request.includeRequests!==false,limit=request.limit??5,offset=request.offset??0;
    const permissionConfig=await scoped(sender,tx=>tx.get(KV,CONFIG));
    const sites=await siteAuthorization(permissionConfig);
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
      const nativeSlot=await slotFacts(tx,slot);
      const revocation=!c&&includeRequests?await lastRevocation(tx,host.namespace):null;
      let total=null,nextOffset=null,projected=[],operations;
      if(includeRequests){
        const indexed=await history.page(tx,{limit,offset});
        let page;
        if(indexed){
          total=indexed.total;page=indexed.rows;
        }else{
          const requests=(await tx.all(KV)).filter(r=>r.tag==='cloud-request-v1'&&r.namespace===host.namespace)
            .sort((x,y)=>(y.createdAt??0)-(x.createdAt??0)||String(rowKey(y)).localeCompare(String(rowKey(x))));
          total=requests.length;page=requests.slice(offset,offset+limit);
        }
        nextOffset=offset+page.length<total?offset+page.length:null;
        for(const r of page){
          const run=r.runId?await tx.get('runs',r.runId):null;
          if(run?.state==='interrupted')operations??=await tx.all('commandJournal');
          const title=typeof r.task?.manifest?.title==='string'&&r.task.manifest.title.trim()?r.task.manifest.title.trim().slice(0,80):'历史任务';
          // The trusted Side Panel may link to the ORIGINAL Run. Never return
          // an unverified request-supplied runId or make this an observer field.
          const originalRunId=run?.tag==='controller-run'&&run.namespace===host.namespace&&
            run.runId===r.runId&&run.cloudRequestId===r.requestId&&
            (!run.cloudRequestKey||run.cloudRequestKey===rowKey(r))?run.runId:null;
          projected.push({taskTitle:title,state:r.state,runState:run?.state??null,retirementState:run?.retirementState??null,reason:r.reason??null,outcomeUnknown:await unknownOutcome(tx,run,operations),
            receipt:r.receipt?true:null,targetReady:!!run?.target&&run.retirementState!=='released',
            ...(originalRunId?{runId:originalRunId}:{})});
        }
        projected.reverse(); // Existing Side Panel shows the newest sample first.
      }
      return {executorId:await tx.get(KV,IDENTITY),provider:c&&!c.unpairing?{url:c.url,providerId:c.providerId}:null,
        revocation:c?.unpairing?{state:'pending'}:revocation?{state:'confirmed'}:null,
        enabled:!!c?.enabled,remoteSuspension:c?.remoteSuspension??null,connection:connectionState,online,reconciled,hostReady:true,
        slotAvailable:nativeSlot.slotState==='available',...nativeSlot,
        siteAuthorization:canonical(c??null)===canonical(permissionConfig??null)?sites:'unknown',
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
          String(rowKey(b)).localeCompare(String(rowKey(a))));
        total=allRequests.length;matchingTotal=requests.length;
        page=requests.slice(offset,offset+limit);
      }
      const observerRows=[];
      for(const r of page){
        const run=r.runId?await tx.get('runs',r.runId):null;
        observerRows.push({state:allowed.has(r.state)?r.state:'other',
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
        states,rows:observerRows,page:{offset,limit,nextOffset:offset+observerRows.length<matchingTotal?offset+observerRows.length:null}};
    },[KV,'runs']);
  }
  async function cloudPair(request,sender){
    await retryRevocation();
    invariant(Object.keys(request).every(k=>['url','providerId','pairingCode','allowLoopback'].includes(k)),'E_SCHEMA');
    const url=providerUrl(request.url,request.allowLoopback===true),host=await assertHost(sender);
    const executorId=await scoped(sender,async tx=>{invariant(!(await tx.get(KV,CONFIG)),'E_PAIRING','Unpair existing provider first');let id=await tx.get(KV,IDENTITY);if(!id){id=newId();await tx.put(KV,id,IDENTITY);}return id;},'readwrite');
    const response=await fetcher(url+'/v1/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({executorId,pairingCode:request.pairingCode}),signal:AbortSignal.timeout(10000),redirect:'error'}),pair=await response.json();
    invariant(response.ok&&pair.providerId===request.providerId&&pair.executorId===executorId&&nonempty(pair.credential)&&nonempty(pair.pairingId)&&Number.isSafeInteger(pair.pairingGeneration)&&pair.pairingGeneration>0,'E_PAIRING','Provider identity or pairing credential rejected');
    await scoped(sender,async tx=>{invariant(!(await tx.get(KV,CONFIG)),'E_PAIRING');await tx.put(KV,{url,providerId:pair.providerId,credential:pair.credential,executorId,pairingId:pair.pairingId,pairingGeneration:pair.pairingGeneration,namespace:host.namespace,enabled:false,tasks:[],pendingRequestId:null},CONFIG);},'readwrite');return cloudStatus({},sender);
  }
  async function cloudApprove(request,sender){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).length===1&&Object.hasOwn(request,'tasks')&&
      Array.isArray(request.tasks)&&request.tasks.length>0&&request.tasks.length<=32,'E_SCHEMA');
    const tasks=[],seen=new Set();for(const approval of request.tasks){
      invariant(approval&&typeof approval==='object'&&!Array.isArray(approval)&&
        Object.keys(approval).length===APPROVAL_FIELDS.length&&
        APPROVAL_FIELDS.every(k=>Object.hasOwn(approval,k))&&
        typeof approval.taskId==='string'&&approval.taskId.length>0&&
        typeof approval.version==='string'&&approval.version.length>0&&
        /^[a-f0-9]{64}$/.test(approval.manifestHash)&&
        /^[a-f0-9]{64}$/.test(approval.sourceHash)&&
        typeof approval.installationId==='string'&&approval.installationId.length>0&&
        Number.isSafeInteger(approval.generation)&&approval.generation>=0&&
        Array.isArray(approval.siteOrigins)&&approval.siteOrigins.every(origin=>typeof origin==='string')&&
        typeof approval.resultAllowed==='boolean'&&!seen.has(approval.taskId),'E_SCHEMA','Cloud approval must include immutable task identity');
      seen.add(approval.taskId);
      const installed=await resolveTask({taskId:approval.taskId},sender);
      for(const [key,value] of [['version',installed.version],['manifestHash',installed.manifestHash],
        ['sourceHash',installed.contentHash],['installationId',installed.installationId],['generation',installed.generation]])
        invariant(approval[key]===value,'E_REVISION','Cloud approval pin no longer matches installed Task');
      invariant(canonical(approval.siteOrigins)===canonical(installed.manifest.siteOrigins),
        'E_REVISION','Task site origin approval changed');
      tasks.push({...installed,resultAllowed:approval.resultAllowed});
    }
    for(const t of tasks)for(const origin of t.manifest.siteOrigins)await requireGrant(api,origin);
    await scoped(sender,async(tx,host)=>{const c=await tx.get(KV,CONFIG);invariant(c&&!c.unpairing&&c.namespace===host.namespace&&!c.enabled,'E_PAIRING','Stop current hosting before changing approval');
      c.tasks=tasks;c.grantId=newId();c.claimId=null;c.pendingRequestId=null;c.enabled=true;c.revokedAt=null;c.remoteSuspension=null;await tx.put(KV,c,CONFIG);},'readwrite');wake();return cloudStatus({},sender);
  }
  async function cloudRevokeResults(request,sender){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).every(k=>k==='taskId')&&nonempty(request.taskId),'E_SCHEMA');
    const requestIds=new Set();
    const revoked=await scoped(sender,async(tx,host)=>{
      const c=await tx.get(KV,CONFIG);
      invariant(c?.enabled&&!c.unpairing&&c.namespace===host.namespace,'E_CLOUD_REVOKED');
      const task=c.tasks.find(row=>row.taskId===request.taskId);
      invariant(task,'E_TASK');
      task.resultAllowed=false;await tx.put(KV,c,CONFIG);
      let rowsChanged=0,runsChanged=0,receiptsPreserved=0;
      for(const row of await tx.all(KV)){
        if(row?.tag!=='cloud-request-v1'||row.namespace!==host.namespace||row.grantId!==c.grantId||
          !samePairing(row,c)||row.task?.taskId!==request.taskId)continue;
        row.task.resultAllowed=false;rowsChanged++;requestIds.add(row.requestId);
        if(row.delivery?.state==='pending'&&!row.receipt)row.delivery={...row.delivery,state:'aborted',reason:'E_CLOUD_REVOKED'};
        if(row.receipt)receiptsPreserved++;
        if(row.runId){
          const run=await tx.get('runs',row.runId);
          if(run?.tag==='controller-run'&&run.cloudRequestId===row.requestId&&!run.resultDeliveryRevoked){
            run.resultDeliveryRevoked=true;runsChanged++;await tx.put('runs',run,run.runId);
          }
        }
        await history.put(tx,row);
      }
      return {revoked:true,taskId:request.taskId,resultAllowed:false,rowsChanged,runsChanged,receiptsPreserved};
    },'readwrite');
    abortDeliveries(requestIds);wake();
    return revoked;
  }
  async function fence(request,reason){
    const result=await transaction('readwrite',async tx=>{const r=await tx.get(KV,rowKey(request));if(!r)return;const run=r.runId&&await tx.get('runs',r.runId);
      // A saved interrupted Result does not resolve a dispatched native effect.
      if(await unknownOutcome(tx,run)){
        r.state='OUTCOME_UNKNOWN';r.reason='E_EFFECT_UNKNOWN';
        await history.put(tx,r);return null;
      }
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
      invariant(c.namespace===host.namespace,'E_CLOUD_FENCED');
      const owned={namespace:host.namespace,grantId:c.grantId,config:c};
      c.enabled=false;c.revokedAt=clock.now();c.claimId=null;c.pendingRequestId=null;
      c.remoteSuspension=c.grantId?'pending':null;
      await tx.put(KV,c,CONFIG);
      return owned;
    },'readwrite');
    invalidate();close();
    if(scope?.grantId)for(const r of await rows()){
      if(r.namespace===scope.namespace&&r.grantId===scope.grantId&&samePairing(r,scope.config))
        await fence(r,'E_CLOUD_REVOKED');
    }
    if(scope?.config&&scope.grantId)try{
      const acknowledgement=await post(scope.config,'suspend',{grantId:scope.grantId},{timeoutMs:1800});
      if(acknowledgement.suspended===true&&acknowledgement.grantId===scope.grantId){
        await scoped(sender,async tx=>{
          const current=await tx.get(KV,CONFIG);
          if(current&&!current.enabled&&current.grantId===scope.grantId){
            current.remoteSuspension='confirmed';
            await tx.put(KV,current,CONFIG);
          }
        },'readwrite');
      }
    }catch{}
    return cloudStatus({},sender);
  }
  let revocationPromise;
  async function retryRevocation(){
    if(revocationPromise)return revocationPromise;
    revocationPromise=(async()=>{
      const c=await read();if(!c?.unpairing)return;
      try{
        const body={revocationId:c.unpairing.revocationId,...(c.pairingId?{pairingId:c.pairingId,pairingGeneration:c.pairingGeneration}:{})};
        const receipt=await post(c,'revoke',body);
        invariant(receipt.revoked===true&&receipt.providerId===c.providerId&&receipt.revocationId===body.revocationId&&nonempty(receipt.pairingId)&&Number.isSafeInteger(receipt.pairingGeneration)&&(!c.pairingId||receipt.pairingId===c.pairingId&&receipt.pairingGeneration===c.pairingGeneration),'E_REVOCATION');
        await transaction('readwrite',async tx=>{
          const current=await tx.get(KV,CONFIG);if(current?.unpairing?.revocationId!==body.revocationId)return;
          await tx.put(KV,{tag:'cloud-revocation-v1',namespace:c.namespace,...receipt,state:'confirmed',confirmedAt:clock.now()},'cloud:revocation:'+body.revocationId);
          await tx.put(KV,{tag:'cloud-revocation-pointer-v1',namespace:c.namespace,revocationId:body.revocationId},'cloud:revocation-last:'+encodeURIComponent(c.namespace));
          await tx.delete(KV,CONFIG);
        },[KV]);
      }catch(error){
        await transaction('readwrite',async tx=>{const current=await tx.get(KV,CONFIG);if(current?.unpairing?.revocationId!==c.unpairing.revocationId)return;current.unpairing.lastError=/^E_[A-Z0-9_]+$/.test(error?.code)?error.code:'E_PROVIDER_OFFLINE';await tx.put(KV,current,CONFIG);},[KV]);
      }
    })().finally(()=>{revocationPromise=null;});return revocationPromise;
  }
  async function cloudUnpair(_,sender){
    await cloudStop({},sender);
    await scoped(sender,async tx=>{const c=await tx.get(KV,CONFIG);if(!c)return;c.unpairing??={revocationId:newId(),state:'pending',requestedAt:clock.now()};await tx.put(KV,c,CONFIG);},'readwrite');
    await retryRevocation();wake();return cloudStatus({},sender);
  }
  let nextPromise;
  // External-client management is exclusively a real Side Panel Host RPC.
  // Admin credentials remain on the Provider machine; issued client tokens
  // exist only in the one-time response and are never written to Browser KV.
  async function cloudClients(request={},sender){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).every(k=>['offset','limit'].includes(k))&&
      (request.offset===undefined||Number.isSafeInteger(request.offset)&&request.offset>=0)&&
      (request.limit===undefined||Number.isSafeInteger(request.limit)&&
        request.limit>=1&&request.limit<=50),'E_SCHEMA');
    const config=await scoped(sender,tx=>tx.get(KV,CONFIG));
    invariant(config?.credential,'E_PAIRING');
    return post(config,'client-list',request);
  }
  async function cloudClientGrant(request,sender){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).length===3&&
      typeof request.taskId==='string'&&request.taskId.length>0&&
      typeof request.label==='string'&&request.label.trim().length>0&&
      request.label.trim().length<=60&&
      !/[\x00-\x1f\x7f]/.test(request.label)&&
      typeof request.allowResult==='boolean','E_SCHEMA');
    const task=await resolveTask({taskId:request.taskId},sender);
    const chosen=await scoped(sender,async tx=>{
      const c=await tx.get(KV,CONFIG);
      invariant(c?.enabled&&!c.revokedAt&&c.grantId&&c.credential,'E_CLOUD_REVOKED');
      const approved=c.tasks?.find(t=>t.taskId===request.taskId&&
        t.version===task.version&&t.manifestHash===task.manifestHash&&
        t.contentHash===task.contentHash&&t.installationId===task.installationId&&
        t.generation===task.generation);
      invariant(approved&&(!request.allowResult||approved.resultAllowed===true),'E_CLIENT_SCOPE');
      return {config:structuredClone(c),pin:{
        taskId:approved.taskId,version:approved.version,
        manifestHash:approved.manifestHash,sourceHash:approved.contentHash
      }};
    });
    const epoch=revocationEpoch;
    const result=await post(chosen.config,'client-grant',{
      grantId:chosen.config.grantId,tasks:[chosen.pin],
      allowResult:request.allowResult,label:request.label.trim()
    },{isCurrent:()=>epoch===revocationEpoch});
    const active=await scoped(sender,async tx=>{
      const c=await tx.get(KV,CONFIG);
      return c?.enabled&&c.grantId===chosen.config.grantId&&epoch===revocationEpoch;
    });
    invariant(active,'E_CLOUD_REVOKED');
    return result;
  }
  async function cloudClientRevoke(request,sender){
    invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
      Object.keys(request).length===1&&
      /^[a-f0-9-]{36}$/i.test(request.clientId),'E_SCHEMA');
    const config=await scoped(sender,tx=>tx.get(KV,CONFIG));
    invariant(config?.credential,'E_PAIRING');
    return post(config,'client-revoke',{clientId:request.clientId});
  }
  async function cloudNext(_,sender){if(nextPromise)return null;nextPromise=next(sender);try{return await nextPromise;}finally{nextPromise=null;}}
  async function pendingRequest(sender,host,configSnapshot,{isCurrent=()=>true}={}){
    return scoped(sender,async(tx,currentHost)=>{
      const c=await tx.get(KV,CONFIG);
      if(!isCurrent()||!c?.enabled||c.unpairing||c.namespace!==currentHost.namespace||
        c.grantId!==configSnapshot.grantId||canonical(pairingIdentity(c))!==canonical(pairingIdentity(configSnapshot)))return null;
      let id=c.pendingRequestId;
      if(id===undefined){
        // Only pre-pointer installs scan once. The hint and expiry retirement
        // commit under the same current Host/grant/pairing fence.
        const candidates=(await tx.all(KV)).filter(r=>r?.tag==='cloud-request-v1'&&
          r.namespace===host.namespace&&r.grantId===c.grantId&&samePairing(r,c)&&!r.runId&&r.state==='waiting');
        const original=candidates.find(r=>r.assignment?.leaseUntil>clock.now())??candidates[0];
        id=original?.requestId??null;c.pendingRequestId=id;
        await tx.put(KV,c,CONFIG);
      }
      if(!id)return null;
      const row=await findRequest(tx,id,c);
      if(row?.namespace===currentHost.namespace&&row.grantId===c.grantId&&
        row.state==='waiting'&&!row.runId&&row.assignment?.leaseUntil>clock.now())return {requestId:id};
      // A pointer cannot relabel an admitted Run or another grant's history.
      if(row?.namespace===currentHost.namespace&&row.grantId===c.grantId&&
        row.state==='waiting'&&!row.runId&&!(row.assignment?.leaseUntil>clock.now())){
        row.state='cancelled';row.reason='E_LEASE';await history.put(tx,row);
      }
      c.pendingRequestId=null;await tx.put(KV,c,CONFIG);return null;
    },'readwrite');
  }
  async function next(sender){
    const host=await assertHost(sender),c=await read();if(!c?.enabled||!online||!reconciled||c.namespace!==host.namespace)return null;
    const epoch=connectionEpoch,current=()=>epoch===connectionEpoch;
    const pending=await pendingRequest(sender,host,c,{isCurrent:current});
    invariant(current(),'E_CLOUD_FENCED');if(pending)return pending;
    const claim=await scoped(sender,async tx=>{const slot=await tx.get('runs','@slot');if(slot?.currentRunId||slot?.preview)return null;const config=await tx.get(KV,CONFIG);if(!current()||!config?.enabled||config.unpairing||config.grantId!==c.grantId||config.pendingRequestId||canonical(pairingIdentity(config))!==canonical(pairingIdentity(c)))return null;
      config.claimId??=newId();await tx.put(KV,config,CONFIG);return {claimId:config.claimId,tasks:c.tasks.map(t=>({taskId:t.taskId,manifestHash:t.manifestHash,sourceHash:t.contentHash}))};},'readwrite');if(!claim)return null;
    const answer=await post(c,'claim',claim,{isCurrent:current});
    return scoped(sender,async tx=>{const config=await tx.get(KV,CONFIG);invariant(current(),'E_CLOUD_FENCED');invariant(config?.enabled&&!config.unpairing&&config.grantId===c.grantId&&canonical(pairingIdentity(config))===canonical(pairingIdentity(c))&&config.claimId===claim.claimId,'E_CLOUD_REVOKED');
      if(answer.assignment){const a=answer.assignment,identity=assignmentIdentity(c,a);invariant(!knownRemoteRuns.has(a.assignmentId),'E_RUN_REF','Query the original remote Run instead of creating another');invariant(a.executorId===c.executorId&&a.claimId===claim.claimId&&a.leaseUntil>clock.now(),'E_ASSIGNMENT');const t=c.tasks.find(t=>t.taskId===a.task.taskId&&t.version===a.task.version&&t.manifestHash===a.task.manifestHash&&t.contentHash===a.task.sourceHash);invariant(t&&acceptedCloudTarget(a.target,t.manifest.siteOrigins),'E_TASK');
        const params=validateTaskParams(t.manifest.paramsSchema,a.params),requestId='cloud:'+a.assignmentId;const digestValue=await digest({identity,task:a.task,params,target:a.target});const storageKey=PREFIX+await digest({pairing:identity.pairing,requestId});const prior=await findRequest(tx,requestId,c);invariant(!prior||prior.digest===digestValue,'E_REQUEST_CONFLICT');invariant(!prior||prior.grantId===c.grantId&&prior.state==='waiting'&&!prior.runId,'E_CLOUD_FENCED');
        if(!prior)await history.put(tx,{tag:'cloud-request-v1',storageKey,identity,requestId,digest:digestValue,assignment:a,params,task:t,grantId:c.grantId,namespace:host.namespace,state:'waiting',createdAt:clock.now()});
        config.claimId=null;config.pendingRequestId=requestId;await tx.put(KV,config,CONFIG);return {requestId};}
      config.claimId=null;config.pendingRequestId=null;await tx.put(KV,config,CONFIG);return null;
    },'readwrite');
  }
  async function cloudResolve(request,sender){invariant(typeof request?.requestId==='string'&&request.requestId.startsWith('cloud:'),'E_SCHEMA');const config=await read(),initial=await transaction('readonly',tx=>findRequest(tx,request.requestId,config),[KV]);invariant(initial,'E_TASK');const t=await resolveTask({taskId:initial.task.taskId},sender);return scoped(sender,async(tx,host)=>{const c=await tx.get(KV,CONFIG),r=await findRequest(tx,request.requestId,c);invariant(c?.enabled&&r?.namespace===host.namespace&&r.grantId===c.grantId&&!r.runId&&r.state==='waiting'&&r.assignment.leaseUntil>clock.now(),'E_CLOUD_REVOKED');
    invariant(t.installationId===r.task.installationId&&t.generation===r.task.generation&&t.manifestHash===r.task.manifestHash,'E_PERMISSION');return {scriptId:t.scriptId,revision:t.revision,contentHash:t.contentHash,params:r.params,target:r.assignment.target,expectedTaskGeneration:t.generation,expectedTaskInstallationId:t.installationId,requestId:r.requestId,cloudRequestId:r.requestId,deadlineAt:Math.min(clock.now()+60000,r.assignment.leaseUntil)};});}
  async function bind(tx,run,request,host){
    const c=await tx.get(KV,CONFIG),r=await findRequest(tx,request.cloudRequestId,c);invariant(c?.enabled&&r?.namespace===host.namespace&&r.grantId===c.grantId&&r.state==='waiting'&&!r.runId&&r.assignment.leaseUntil>clock.now(),'E_CLOUD_REVOKED');
    invariant(run.scriptId===r.task.scriptId&&run.contentHash===r.task.contentHash&&run.installedTaskAuthorization?.manifestHash===r.task.manifestHash&&canonical(run.installedTaskAuthorization?.authorization)===canonical({tag:'task-install-authorization-v1',installationId:r.task.installationId,generation:r.task.generation,scope:{capabilities:r.task.manifest.permissions,siteOrigins:r.task.manifest.siteOrigins,networkOrigins:[]}})&&canonical(decodeValue(run.paramsWire))===canonical(r.params)&&canonical(run.selection)===canonical(r.assignment.target)&&!run.networkOrigins.length,'E_TASK');
    run.cloudRequestId=r.requestId;run.cloudRequestKey=rowKey(r);r.runId=run.runId;r.runRef={runId:run.runId,resultId:run.resultId,requestId:r.requestId,sourceHash:run.contentHash,manifestHash:r.task.manifestHash,grantId:r.grantId};r.state='prepared';await history.put(tx,r);
    if(c.pendingRequestId===r.requestId){c.pendingRequestId=null;await tx.put(KV,c,CONFIG);}
  }
  async function permit(run){
    const c=await read(),r=await transaction('readonly',tx=>requestForRun(tx,run,c),[KV]);invariant(c?.enabled&&c.grantId===r?.grantId,'E_CLOUD_REVOKED');const epoch=connectionEpoch,currentEpoch=()=>epoch===connectionEpoch;let p;
    for(let attempt=0;attempt<2;attempt++){try{p=await post(c,'admission',{assignmentId:r.assignment.assignmentId,runRef:r.runRef,...(!legacyMapped(r,c)?{resultAllowed:r.task.resultAllowed===true}:{}),...requestBinding(r)},{isCurrent:currentEpoch});break;}catch(e){if(attempt||e.code)throw e;}}
    await transaction('readwrite',async tx=>{const current=await tx.get(KV,rowKey(r)),config=await tx.get(KV,CONFIG),stored=await tx.get('runs',run.runId);invariant(currentEpoch(),'E_CLOUD_FENCED');assertPermit(p,config,r);invariant(config?.enabled&&samePairing(r,config)&&config.grantId===r.grantId&&stored?.state==='preparing'&&!stored.cancelSeq&&current?.runId===run.runId&&p.providerId===config.providerId&&p.assignmentId===r.assignment.assignmentId&&canonical(p.runRef)===canonical(r.runRef)&&p.leaseUntil>clock.now(),'E_PERMIT');await assertRunTaskAuthorization(tx,stored);
      if(current.permit){
        assertPermit(current.permit,config,current);const issued={...p};
        if(legacyMapped(current,config))for(const key of ['executorId','pairingId','pairingGeneration','attemptEpoch','jobId','claimId'])if(!Object.hasOwn(current.permit,key))delete issued[key];
        invariant(current.permit.leaseUntil>clock.now()&&canonical(current.permit)===canonical(issued),'E_PERMIT');
      }else current.permit=p;
      current.state='permitted';await history.put(tx,current);});
  }
  async function assertActive(tx,run){if(!run.cloudRequestId)return;const c=await tx.get(KV,CONFIG),r=await requestForRun(tx,run,c);invariant(c?.enabled&&r?.grantId===c.grantId&&r.runId===run.runId&&r.permit?.runRef.runId===run.runId&&r.permit?.leaseUntil>clock.now()&&r.state==='permitted','E_CLOUD_FENCED');assertPermit(r.permit,c,r);}
  async function reconcile({isCurrent=()=>true}={}){
    const epoch=revocationEpoch,current=()=>isCurrent()&&epoch===revocationEpoch;
    const c=await read();if(!c?.enabled||!current())return;
    const remote=await post(c,'reconcile',{}, {isCurrent:current});if(!current())return;invariant(remote.providerId===c.providerId,'E_PROVIDER');
    if(c.pairingId)invariant(remote.executorId===c.executorId&&remote.pairingId===c.pairingId&&remote.pairingGeneration===c.pairingGeneration,'E_PAIRING');
    knownRemoteRuns=new Map(remote.assignments.filter(a=>a.runRef).map(a=>[a.assignmentId,a.runRef]));
    for(const r of await rows()){
      if(!current())return;if(r.grantId!==c.grantId||!samePairing(r,c))continue;
      const run=r.runId?await transaction('readonly',tx=>tx.get('runs',r.runId)):null;
      // Unknown native effects outrank a saved interruption Result or receipt.
      if(await transaction('readonly',tx=>unknownOutcome(tx,run))){
        await transaction('readwrite',async tx=>{if(!current())return;const row=await tx.get(KV,rowKey(r));row.state='OUTCOME_UNKNOWN';row.reason??='E_OUTCOME_UNKNOWN';await history.put(tx,row);});continue;
      }
      // Preserve confirmed original history even if the Provider pruned it.
      if(r.receipt&&run?.retirementState==='released'&&
        (r.state==='finished'||r.delivery?.state==='confirmed')){
        if(r.reason==='E_CLOUD_CANCELLED'&&run.state==='completed')await fence(r,'E_CLOUD_CANCELLED');
        continue;
      }
      const a=remote.assignments.find(a=>a.assignmentId===r.assignment.assignmentId);
      if(!a||a.runRef&&r.runRef&&canonical(a.runRef)!==canonical(r.runRef)){await fence(r,'E_RUN_REF');continue;}
      if(c.pairingId){const identity=assignmentIdentity(c,a);invariant(canonical(identity)===canonical(effectiveIdentity(r,c)),'E_ASSIGNMENT');}
      if(a.cancelled||a.leaseUntil<=clock.now()){await fence(r,'E_CLOUD_CANCELLED');if(!r.runId)continue;}
      const active=run&&['preparing','running'].includes(run.state)&&!run.cancelSeq&&r.state==='permitted';
      if(active&&r.permit&&!r.receipt&&!a.cancelled&&a.leaseUntil>clock.now()){
        if(r.permit.leaseUntil<=clock.now())await fence(r,'E_LEASE');
        else try{
          const lease=await post(c,'renew',{assignmentId:r.assignment.assignmentId,permitId:r.permit.permitId,...requestBinding(r)},{isCurrent:current});
          invariant(finiteLease(lease.leaseUntil),'E_LEASE');
          await transaction('readwrite',async tx=>{
            const row=await tx.get(KV,rowKey(r)),config=await tx.get(KV,CONFIG),stored=await tx.get('runs',r.runId);
            invariant(current()&&config?.enabled&&config.grantId===r.grantId&&row?.state==='permitted'&&row.permit?.permitId===r.permit.permitId&&canonical(row.runRef)===canonical(r.runRef)&&row.permit.leaseUntil>clock.now()&&['preparing','running'].includes(stored?.state)&&!stored.cancelSeq&&lease.leaseUntil>clock.now(),'E_CLOUD_FENCED');
            await assertRunTaskAuthorization(tx,stored);row.permit.leaseUntil=lease.leaseUntil;await history.put(tx,row);
          });
        }catch{if(current())await fence(r,'E_LEASE');}
      }
      if(!r.runId||!current())continue;
      const projection=await transaction('readonly',async tx=>{
        const stored=await tx.get('runs',r.runId),config=await tx.get(KV,CONFIG);
        if(!stored||stored.state==='paused_unknown'||!config?.enabled||config.revokedAt||config.grantId!==r.grantId)return null;
        await assertRunTaskAuthorization(tx,stored);const result=await tx.get('results',stored.resultId);if(!result)return null;
        invariant(result.tag==='controller-result'&&result.runId===r.runRef.runId&&result.resultId===r.runRef.resultId&&result.revision?.sourceHash===r.runRef.sourceHash,'E_RESULT');return {result:structuredClone(result),run:stored};
      });
      if(!projection||r.receipt||projection.run.retirementState!=='released')continue;
      for(const origin of r.task.manifest.siteOrigins)await requireGrant(api,origin);
      const allowed=await transaction('readwrite',async tx=>{
        const row=await tx.get(KV,rowKey(r)),config=await tx.get(KV,CONFIG),stored=await tx.get('runs',r.runId);
        await assertRunTaskAuthorization(tx,stored);
        // A status-only receipt is required even if body delivery was never
        // approved. The durable intent cannot grant access to page content.
        if(!current()||stored.resultDeliveryRevoked||!config?.enabled||config.grantId!==r.grantId||!row?.task||canonical(row.runRef)!==canonical(r.runRef))return false;
        row.delivery={state:'pending',receiptKey:r.runRef.resultId,grantId:r.grantId,runRef:r.runRef};await history.put(tx,row);return true;
      });if(!allowed||!current())continue;
      // The durable delivery intent is not permission to send after an asynchronous
      // boundary. Recheck website and installed/output authorization at submission.
      for(const origin of r.task.manifest.siteOrigins)await requireGrant(api,origin);
      const stillAllowed=await transaction('readonly',async tx=>{
        const config=await tx.get(KV,CONFIG),stored=await tx.get('runs',r.runId),row=await tx.get(KV,rowKey(r)),approved=config?.tasks?.find(t=>t.taskId===row?.task?.taskId&&t.version===row.task.version&&t.manifestHash===row.task.manifestHash&&t.contentHash===row.task.contentHash);
        if(!current()||!config?.enabled||config.revokedAt||config.grantId!==r.grantId||stored?.resultDeliveryRevoked||!row?.task||canonical(row.runRef)!==canonical(r.runRef))return null;
        await assertRunTaskAuthorization(tx,stored);
        // Return only the CURRENT intersection of request and Task body scopes.
        return {resultAllowed:row.task.resultAllowed===true&&approved?.resultAllowed===true};
      });if(!stillAllowed||!current())continue;
      const result=projection.result,limited=stillAllowed.resultAllowed===true?{visibility:'full',runId:result.runId,resultId:result.resultId,revision:result.revision,state:result.state,sourceHash:r.runRef.sourceHash,retirementState:projection.run.retirementState,...(result.outcome?.valueWire!==undefined?{valueWire:result.outcome.valueWire}:{}),...(result.outcome?.error?{error:result.outcome.error}:{})}:{visibility:'status-only',state:['completed','failed','stopped','interrupted'].includes(result.state)?result.state:'interrupted',retirementState:'released'};
      const receipt=await post(c,'receipt',{assignmentId:r.assignment.assignmentId,receiptKey:r.runRef.resultId,runRef:r.runRef,result:limited,...requestBinding(r)},{isCurrent:current});
      invariant(nonempty(receipt?.receiptId)&&nonempty(receipt.digest),'E_RECEIPT');
      await transaction('readwrite',async tx=>{
        const row=await tx.get(KV,rowKey(r)),config=await tx.get(KV,CONFIG),stored=await tx.get('runs',r.runId),approved=config?.tasks?.find(t=>t.taskId===row?.task?.taskId&&t.version===row.task.version&&t.manifestHash===row.task.manifestHash&&t.contentHash===row.task.contentHash);
        if(!current()||!config?.enabled||config.grantId!==r.grantId||stored?.resultDeliveryRevoked||!row?.task||canonical(row.runRef)!==canonical(r.runRef)||
          (limited.visibility==='full'&&(row.task.resultAllowed!==true||approved?.resultAllowed!==true)))return;
        await assertRunTaskAuthorization(tx,stored);row.receipt=receipt;row.delivery.state='confirmed';row.state='finished';await history.put(tx,row);
      });
    }
  }
  return {cloudStatus,cloudObserve,cloudPair,cloudApprove,cloudRevokeResults,cloudStop,cloudUnpair,cloudClients,cloudClientGrant,cloudClientRevoke,cloudNext,cloudResolve,bind,permit,assertActive,read,post,reconcile,invalidate,retryRevocation,adoptPairing,
    captureAuthentication(){const epoch=connectionEpoch;return ()=>epoch===connectionEpoch;},
    attachConnection({start,stop}){wake=start;close=stop;},connection(state){if(state!=='authenticated')connectionEpoch++;connectionState=state;online=state==='authenticated';if(!online)reconciled=false;},setReconciled(value){reconciled=value;}};
}
