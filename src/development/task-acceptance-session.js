import {CONTRACT_HASH,CONTRACT_VERSION,canonical,invariant,newId} from '../platform/protocol.js';
import {createRunAuthority} from '../platform/host/authority.js';
import {installedKey,taskKey,taskScriptId} from '../platform/tasks/contract.js';
import {createTaskAcceptanceStorage,seedTaskAcceptanceStorage} from './task-acceptance-storage.js';

export {ACCEPTANCE_PROTOCOL} from './task-acceptance-contract.js';
export const ACCEPTANCE_INSTALL=Object.freeze({taskId:'baidu.search.top3',version:'1.1.5',
  installationId:'7d9454ed-a979-40ef-ad6e-1e18a45c2654',generation:4,
  manifestHash:'f49e274aadfeed12540aff028ff267b3772ebe35a2f16c154008542b76a5bf38',
  sourceHash:'2b0f31c0d485355576cac11968170bb9eb41c9076df5bb6659f93d0173286181'});

const methods=new Set(['listPagePrograms','listTaskCatalog','getTaskCandidate','resolveInstalledTask','verifyTaskCandidate',
  'makeTaskAvailable','installTask','inspectTaskRun','listTaskRunPreparations','getControllerScript',
  'listControllerScripts','startControllerRun','controllerOperation','stopControllerRun',
  'finishControllerRun','snapshotControllerRun','retireControllerTarget','fenceControllerAdmission']);
const operations=new Set(['getTaskCandidate','resolveInstalledTask','verifyTaskCandidate','makeTaskAvailable','installTask']);
const scriptId=taskScriptId(ACCEPTANCE_INSTALL.taskId,ACCEPTANCE_INSTALL.version);

// The host fixture exposes no production broker, Chrome transfer or journal
// writer. Page effects use the supplied offline target; Authority still admits,
// journals and settles the same immutable script and installed-task identity.
export async function createTaskAcceptanceSession({source,sender,hostInstanceId,target,clock,loadBuiltin,
  emit=()=>{},audit=()=>{},startWithRuntimeGate=true}) {
  invariant(source.manifestHash===ACCEPTANCE_INSTALL.manifestHash&&source.sourceHash===ACCEPTANCE_INSTALL.sourceHash,
    'E_HASH','Offline acceptance package bytes differ');
  const storage=createTaskAcceptanceStorage({clock});
  const session=newId(),snapshot=structuredClone(source),draftSource=snapshot.records[3][2].sourceUtf8;
  let closed=false,registration;
  try{
    if(startWithRuntimeGate){
      // Only the copied runtime provenance is made stale; deployment bytes,
      // installed identity, scope, actual runtime and evidence stay intact.
      for(const i of [0,1,3])snapshot.records[i][2].builtinIdentity={
        ...snapshot.records[i][2].builtinIdentity,bundleSha256:'0'.repeat(64)};
    }
    await seedTaskAcceptanceStorage(storage,snapshot);
    const baseline=storage.diagnostics();
    const authority=createRunAuthority({storage,api:target.api,session,clock,loadBuiltin,cloudFactory:null,
      taskReleases:{defaults:[],optional:[]},emitToHost:async(id,event)=>{
        if(!closed&&id===registration?.registrationId)emit(event);
      }});
    registration=await authority.registerHost({hostInstanceId,
      claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},sender);
    const namespace='tool:'+target.api.runtime.id;
    async function request(method,payload={}){
      invariant(!closed,'E_HOST_CLOSED','Offline acceptance session has closed');
      invariant(methods.has(method),'E_CAPABILITY','Operation is outside offline acceptance scope');
      canonical(payload,{maxDepth:48});
      // The shared editor discovers this catalog at startup. The acceptance
      // scope contains no Page Programs and cannot read the everyday library.
      if(method==='listPagePrograms')return {catalog:[],installed:[]};
      if(operations.has(method))invariant(payload.taskId===ACCEPTANCE_INSTALL.taskId&&
        (method==='resolveInstalledTask'||payload.version===ACCEPTANCE_INSTALL.version),
        'E_OWNER','Offline request does not match the pinned task');
      if(method==='getControllerScript')invariant(payload.scriptId===scriptId,'E_OWNER','Offline script identity differs');
      if(method==='installTask')invariant(payload.expectedInstallationId===ACCEPTANCE_INSTALL.installationId&&
        payload.expectedInstalledVersion===ACCEPTANCE_INSTALL.version&&payload.manifestHash===ACCEPTANCE_INSTALL.manifestHash,
        'E_OWNER','Only the pinned installation may be revalidated');
      if(method==='startControllerRun'){
        const saved=payload.source?.kind==='saved'?payload.source:payload;
        invariant(!payload.cloudRequestId&&!payload.scheduledFireId&&!payload.profile&&!payload.taskDelegation&&
          !payload.taskPreparationId&&!payload.retainedFrom&&!payload.networkOrigins?.length&&
          (payload.source?.kind==='draft'?payload.source.sourceUtf8===draftSource:
            (!payload.source||payload.source.kind==='saved')&&saved.scriptId===scriptId&&saved.revision===1&&
            saved.contentHash===ACCEPTANCE_INSTALL.sourceHash&&
            payload.expectedTaskInstallationId===ACCEPTANCE_INSTALL.installationId),
          'E_OWNER','Only the exact installed script and its exact draft can run offline');
        audit({type:'runhost-admission',requestId:payload.requestId});
      }
      if(method==='controllerOperation'){
        const operation=payload.envelope?.operation;
        invariant(operation?.kind==='packaged'&&['url','locatorObserve','locatorRead','locatorWait',
          'bringToFront'].includes(operation.method),
          'E_CAPABILITY','Operation is outside offline page scope');
      }
      const operationId=['verifyTaskCandidate','makeTaskAvailable','installTask'].includes(method)?newId():null;
      try{
        const value=await authority[method](payload,sender);
        if(operationId)audit({type:'authority-task-operation',operationId,session,method,ok:true,
          taskId:payload.taskId,version:payload.version,stage:value.stage,
          verification:value.verification,installation:method==='installTask'?value:undefined});
        if(method==='startControllerRun')audit({type:'runhost-dispatched',requestId:payload.requestId,runId:value.runId,state:value.state});
        if(['finishControllerRun','retireControllerTarget'].includes(method))
          audit({type:method,requestId:payload.requestId,runId:payload.runId});
        return value;
      }catch(error){
        if(operationId)audit({type:'authority-task-operation',operationId,session,method,ok:false,
          taskId:payload.taskId,version:payload.version,code:error.code});
        if(method==='startControllerRun')audit({type:'runhost-rejected',requestId:payload.requestId,code:error.code});
        throw error;
      }
    }
    async function inspect(){
      invariant(!closed,'E_HOST_CLOSED','Offline acceptance session has closed');
      return storage.transaction(['frameworkKV','runs','results','commandJournal'],'readonly',async tx=>{
        const install=await tx.get('frameworkKV',installedKey(namespace,ACCEPTANCE_INSTALL.taskId));
        const candidate=await tx.get('frameworkKV',taskKey(namespace,ACCEPTANCE_INSTALL.taskId,ACCEPTANCE_INSTALL.version));
        const slot=await tx.get('runs','@slot');
        const runs=(await tx.all('runs')).filter(row=>row.tag==='controller-run').map(row=>({runId:row.runId,
          state:row.state,resultId:row.resultId,workerRetired:row.workerRetired,retirementState:row.retirementState}));
        const results=(await tx.all('results')).filter(row=>row.tag==='controller-result')
          .map(({runId,resultId,state,outcome})=>({runId,resultId,state,ok:outcome?.ok===true}));
        const journal=(await tx.all('commandJournal')).filter(row=>row.runId&&row.tag?.startsWith('controller-'))
          .map(({tag,requestId,runId,state,reply,nativeReceipts})=>({tag,requestId:requestId??reply?.requestId,
            runId,state,resultReceipt:nativeReceipts?.some(item=>item.stage==='result')===true}));
        return {storage:{...storage.diagnostics(),baseline},candidate:{taskId:candidate?.taskId,version:candidate?.version,
          stage:candidate?.stage,builtinIdentity:candidate?.builtinIdentity,verification:candidate?.verification},
          installation:{installationId:install?.authorization?.installationId,generation:install?.authorization?.generation,
          version:install?.version,manifestHash:install?.manifestHash},activeRunId:slot?.currentRunId??null,runs,results,journal};
      });
    }
    return {session,registration,request,inspect,close(){if(closed)return;closed=true;storage.close();target.close();}};
  }catch(error){storage.close();target.close();throw error;}
}
