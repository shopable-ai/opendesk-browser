import {decodeValue} from '../page-port/codec.js';
import {canonical,digest,invariant} from '../protocol.js';
import {normalizeTaskDelegationRequest,sameTaskPin,normalizeDelegatedTask} from '../tasks/delegation-contract.js';
import {readTaskDelegationApp,assertTaskDelegationApp} from '../tasks/delegation-installation.js';
import {readAppControllerInstallation} from '../tasks/app-controller-installation.js';

// One object per original opaque iframe. Inject the EXISTING visible RunHost
// and current-page observer; this module never constructs a runner or UI.
export function createTaskDelegationHost({api,client,host,currentPageTarget,appId,instanceId,assertInstance,
  readApp=()=>readTaskDelegationApp(api,appId),readControllerApp=()=>readAppControllerInstallation(api,appId),assertApp=b=>assertTaskDelegationApp(api,b),clock=()=>Date.now()}){
  const entries=new Map();let disposed=false;
  function sourceFamily(row,controller){
    const family=controller?'controller':'task';
    invariant(!row.sourceFamily||row.sourceFamily===family,'E_REQUEST_CONFLICT');
    row.sourceFamily=family;
  }
  const normalizeInstalledPin=row=>normalizeDelegatedTask(Object.fromEntries(['taskId','version','manifestHash','contentHash','installationId','generation'].map(key=>[key,row[key]])),true);
  function live(){invariant(!disposed,'E_OWNER');assertInstance();}
  function entry(id){
    let row=entries.get(id);
    if(!row){invariant(entries.size<100,'E_BUDGET');row={clientRequestId:id,state:'preparing',runId:null,resultId:null};entries.set(id,row);}
    return row;
  }
  const project=row=>({clientRequestId:row.clientRequestId,runId:row.runId,resultId:row.resultId,
    state:row.state,semantic:row.semantic??null,operationRef:row.operationRef??null,
    retirementState:row.retirementState??null,result:row.result??null,
    value:row.result?.outcome?.ok===true?decodeValue(row.result.outcome.valueWire):null});
  async function authorize(row){
    live();if(row.binding)await assertApp(row.binding);live();
  }
  async function start(payload,controller){
    live();const row=entry(payload.clientRequestId),fingerprint=canonical({payload,controller});
    sourceFamily(row,controller);
    if(row.cancelled)throw Object.assign(new Error('Start cancelled'),{code:'E_CANCELLED'});
    if(row.fingerprint){
      invariant(row.fingerprint===fingerprint,'E_REQUEST_CONFLICT');await authorize(row);
      await row.pending;
      // A recovered result may outlive its Task authorization. Re-read through
      // Authority rather than disclosing the previously resolved promise.
      return request('tasks.read',{clientRequestId:payload.clientRequestId});
    }
    row.fingerprint=fingerprint;
    // Register synchronously so stop wins even before the first async read.
    row.pending=(async()=>{
      let resolved;
      if(controller){
        const installed=await readControllerApp();live();
        row.binding={...installed.binding,instanceId};
        resolved={manifest:installed.tool.controller};
      }else{
        const app=await readApp();live();
        invariant(app.tasks.some(pin=>sameTaskPin(pin,payload.task)),'E_PERMISSION');
        row.binding={...app,instanceId,task:payload.task};
        resolved=await client.request('resolveInstalledTask',{taskId:payload.task.taskId});
        invariant(sameTaskPin(resolved,payload.task)&&resolved.installationId===payload.task.installationId&&
          resolved.generation===payload.task.generation,'E_REVISION');
      }
      const target=currentPageTarget.capture();
      await currentPageTarget.revalidate(target);await authorize(row);
      invariant(!row.cancelled,'E_CANCELLED');
      const runTarget={mode:'borrowed',tabId:target.tabId,frameId:target.frameId,documentId:target.documentId,
        expectedUrl:target.url,expectedWindowId:target.windowId};
      // PREPARE is durable and side-effect free. A transport timeout or Host
      // reconstruction must inspect the old operation, never allocate another
      // controller run for the same App-scoped logical request.
      const prepared=await client.request('prepareDelegatedStep',{
        binding:row.binding,clientRequestId:payload.clientRequestId,
        paramsDigest:await digest(payload.params,{maxDepth:48}),target:runTarget,
        deadlineAt:clock()+(resolved.manifest.deadlineMs??30000)});
      row.operationRef=prepared.operationRef;
      if(prepared.state==='submitted'||prepared.state==='stopping'){
        const previous=await client.request('inspectDelegatedStep',{
          binding:row.binding,clientRequestId:payload.clientRequestId});
        row.runId=previous.runId;row.resultId=previous.resultId;
        row.state=previous.state;row.semantic=previous.semantic;
        row.retirementState=previous.retirementState;row.result=previous.result;
        await authorize(row);
        return project(row);
      }
      invariant(prepared.state==='prepared','E_CANCELLED');
      await authorize(row);invariant(!row.cancelled,'E_CANCELLED');
      row.admissionRequestId=crypto.randomUUID();
      const source=controller?{kind:'app-controller',appId,packageHash:row.binding.packageHash,generation:row.binding.generation}:
        {kind:'saved',scriptId:resolved.scriptId,revision:resolved.revision,contentHash:resolved.contentHash};
      const claim=await host.start({source,
        params:payload.params,target:runTarget,deadlineAt:prepared.deadlineAt,
        requestId:row.admissionRequestId,...(controller?{}:{expectedTaskGeneration:resolved.generation,expectedTaskInstallationId:resolved.installationId}),
        taskDelegation:row.binding,taskDelegationStep:{clientRequestId:payload.clientRequestId,operationRef:prepared.operationRef}});
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
    const controller=operation.startsWith('controllers.');
    if(controller&&operation==='controllers.read'&&!payload.clientRequestId){
      live();const installed=await readControllerApp();live();
      await assertApp({...installed.binding,instanceId});live();
      return {controller:{sourceHash:installed.tool.controller.sourceHash}};
    }
    if(operation==='tasks.read'&&payload.taskId){
      live();const app=await readApp();live();
      const pin=app.tasks.find(row=>row.taskId===payload.taskId);invariant(pin,'E_PERMISSION');
      const resolved=await client.request('resolveInstalledTask',{taskId:payload.taskId,purpose:'configure'});
      invariant(sameTaskPin(pin,resolved),'E_REVISION');
      await assertApp({...app,instanceId,task:resolved});live();
      const task=normalizeInstalledPin(resolved);
      const {preparations}=await client.request('listTaskRunPreparations',{binding:{...app,instanceId,task}});
      await assertApp({...app,instanceId,task});live();
      return {task,manifest:structuredClone(resolved.manifest),runtimeCurrent:resolved.runtimeCurrent!==false,preparations};
    }
    if(operation==='tasks.start'||operation==='controllers.start'){
      invariant(verifiedUserActivation===true,'E_USER_GESTURE_REQUIRED');
      return start(payload,controller);
    }
    live();const row=entry(payload.clientRequestId);
    sourceFamily(row,controller);
    const stop=operation==='tasks.stop'||operation==='controllers.stop';
    if(stop)row.cancelled=true;
    // The new iframe has a new Host registration. The original Host's
    // snapshot API must not be impersonated to obtain its Run/Result.
    if(stop||row.operationRef||!row.runId){
      const app=controller?(await readControllerApp()).binding:await readApp();live();
      const binding=row.binding??(controller?{...app,instanceId}:{...app,instanceId,task:app.tasks[0]});
      await assertApp(binding);live();
      row.binding=binding;
      if(stop){
        if(row.admissionRequestId)host.cancelStart(row.admissionRequestId);
        const cancelled=await client.request('cancelDelegatedStep',{
          binding,clientRequestId:payload.clientRequestId});
        if(row.runId)await host.stop({controller:true,runId:row.runId}).catch(()=>{});
        row.operationRef=cancelled.operationRef;row.runId=cancelled.runId??row.runId;
        row.state=cancelled.state;row.semantic=cancelled.semantic;
        row.resultId=cancelled.resultId??row.resultId;row.retirementState=cancelled.retirementState??null;
        return {...project({...row,result:null}),workerRetired:cancelled.workerRetired??false,
          resourceReleased:cancelled.resourceReleased??false,slotAvailable:cancelled.slotAvailable??null,
          result:null,value:null};
      }
      const snapshot=await client.request('inspectDelegatedStep',{
        binding,clientRequestId:payload.clientRequestId});
      await assertApp(binding);live();
      row.operationRef=snapshot.operationRef;row.runId=snapshot.runId;row.resultId=snapshot.resultId;
      row.state=snapshot.state;row.semantic=snapshot.semantic;
      row.retirementState=snapshot.retirementState;row.result=snapshot.result;
      return project(row);
    }
    await authorize(row);
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
