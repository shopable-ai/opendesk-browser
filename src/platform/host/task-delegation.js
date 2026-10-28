import {decodeValue} from '../page-port/codec.js';
import {canonical,invariant} from '../protocol.js';
import {normalizeTaskDelegationRequest,sameTaskPin,normalizeDelegatedTask} from '../tasks/delegation-contract.js';
import {readTaskDelegationApp,assertTaskDelegationApp} from '../tasks/delegation-installation.js';

// One object per original opaque iframe. Inject the EXISTING visible RunHost
// and current-page observer; this module never constructs a runner or UI.
export function createTaskDelegationHost({api,client,host,currentPageTarget,appId,instanceId,assertInstance,
  readApp=()=>readTaskDelegationApp(api,appId),assertApp=b=>assertTaskDelegationApp(api,b),clock=()=>Date.now()}){
  const entries=new Map();let disposed=false;
  const normalizeInstalledPin=row=>normalizeDelegatedTask(Object.fromEntries(['taskId','version','manifestHash','contentHash','installationId','generation'].map(key=>[key,row[key]])),true);
  function live(){invariant(!disposed,'E_OWNER');assertInstance();}
  function entry(id){
    let row=entries.get(id);
    if(!row){invariant(entries.size<100,'E_BUDGET');row={clientRequestId:id,state:'preparing',runId:null,resultId:null};entries.set(id,row);}
    return row;
  }
  const project=row=>({clientRequestId:row.clientRequestId,runId:row.runId,resultId:row.resultId,
    state:row.state,retirementState:row.retirementState??null,result:row.result??null,
    value:row.result?.outcome?.ok===true?decodeValue(row.result.outcome.valueWire):null});
  async function authorize(row){
    live();if(row.binding)await assertApp(row.binding);live();
  }
  async function start(payload){
    live();const row=entry(payload.clientRequestId),fingerprint=canonical(payload);
    if(row.cancelled)throw Object.assign(new Error('Start cancelled'),{code:'E_CANCELLED'});
    if(row.fingerprint){invariant(row.fingerprint===fingerprint,'E_REQUEST_CONFLICT');await authorize(row);return row.pending;}
    row.fingerprint=fingerprint;
    // Register synchronously so stop wins even before the first async read.
    row.pending=(async()=>{
      const app=await readApp();live();
      invariant(app.tasks.some(pin=>sameTaskPin(pin,payload.task)),'E_PERMISSION');
      row.binding={...app,instanceId,task:payload.task};
      const resolved=await client.request('resolveInstalledTask',{taskId:payload.task.taskId});
      invariant(sameTaskPin(resolved,payload.task)&&resolved.installationId===payload.task.installationId&&
        resolved.generation===payload.task.generation,'E_REVISION');
      const target=currentPageTarget.capture();
      await currentPageTarget.revalidate(target);await authorize(row);
      invariant(!row.cancelled,'E_CANCELLED');
      row.admissionRequestId=crypto.randomUUID();
      const claim=await host.start({source:{kind:'saved',scriptId:resolved.scriptId,revision:resolved.revision,contentHash:resolved.contentHash},
        params:payload.params,target:{mode:'borrowed',tabId:target.tabId,frameId:target.frameId,documentId:target.documentId,
          expectedUrl:target.url,expectedWindowId:target.windowId},deadlineAt:clock()+(resolved.manifest.deadlineMs??30000),
        requestId:row.admissionRequestId,expectedTaskGeneration:resolved.generation,expectedTaskInstallationId:resolved.installationId,
        taskDelegation:row.binding});
      row.runId=claim.runId;row.resultId=claim.resultId;row.state='running';
      if(row.cancelled||disposed){await host.stop({controller:true,runId:row.runId});invariant(false,'E_CANCELLED');}
      await authorize(row);return project(row);
    })().catch(async error=>{
      if(error.runId&&error.resultId){row.runId=error.runId;row.resultId=error.resultId;}
      if(row.runId)await host.stop({controller:true,runId:row.runId}).catch(()=>{});
      row.state=row.cancelled&&!row.admissionRequestId?'cancelled':'unknown';throw error;
    });
    return row.pending;
  }
  async function request(operation,value,{verifiedUserActivation=false}={}){
    const payload=normalizeTaskDelegationRequest(operation,value);
    if(operation==='tasks.read'&&payload.taskId){
      live();const app=await readApp();live();
      const pin=app.tasks.find(row=>row.taskId===payload.taskId);invariant(pin,'E_PERMISSION');
      const resolved=await client.request('resolveInstalledTask',{taskId:payload.taskId});
      invariant(sameTaskPin(pin,resolved),'E_REVISION');
      await assertApp({...app,instanceId,task:resolved});live();
      return {task:normalizeInstalledPin(resolved)};
    }
    if(operation==='tasks.start'){
      invariant(verifiedUserActivation===true,'E_USER_GESTURE_REQUIRED');
      return start(payload);
    }
    live();const row=entry(payload.clientRequestId);
    if(operation==='tasks.stop'){
      // Cancellation is local first and cannot target any other RunHost run.
      row.cancelled=true;
      if(row.admissionRequestId)host.cancelStart(row.admissionRequestId);
      if(row.runId)await host.stop({controller:true,runId:row.runId});
      row.state=row.admissionRequestId?'stopping':'cancelled';
      return {...project({...row,result:null}),result:null,value:null};
    }
    await authorize(row);
    if(!row.runId)return project(row);
    const snapshot=await host.controller.snapshotControllerRun({runId:row.runId});
    await authorize(row);
    invariant(!snapshot.resultDeliveryDenied?.includes(row.runId),'E_PERMISSION');
    invariant(snapshot.run?.runId===row.runId&&snapshot.run.resultId===row.resultId,'E_OWNER');
    row.state=snapshot.run.state;row.retirementState=snapshot.run.retirementState;
    row.result=snapshot.results?.find(result=>result.runId===row.runId&&result.resultId===row.resultId)??null;
    return project(row);
  }
  async function dispose(){
    if(disposed)return;disposed=true;
    await Promise.allSettled([...entries.values()].map(async row=>{
      row.cancelled=true;if(row.admissionRequestId)host.cancelStart(row.admissionRequestId);
      if(row.runId)await host.stop({controller:true,runId:row.runId});
    }));
  }
  return {request,dispose};
}
