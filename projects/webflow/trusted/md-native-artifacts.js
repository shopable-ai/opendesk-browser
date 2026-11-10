// OD-AI-WORKFLOW-BRIDGE: one-shot Native Workspace artifact settlement
// over the ORIGINAL trusted file Port and atomic Markdown ledger.
// This adapter is NOT a runner, does not create a second file store and is
// never exported to the installed sandbox or an unreviewed execution surface.
import {digestUtf8} from '../../../src/platform/protocol.js';
import {sameWorkspaceAuthority,validateWorkspaceRead,
  verifyWorkspaceWriteReceipt,verifyWorkspaceWriteReadBack} from '../../../src/native-agent/workspace-domain.js';

const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const requireValue=(v,code='E_MD_ARTIFACT')=>{if(!v)fail(code);};
const ID=/^[A-Za-z0-9._:-]{8,128}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const pathFor=taskId=>'artifacts/'+taskId+'.json';

export function createMdNativeArtifactAdapter({ledger,files,assertScope,
  assertScopeSync,randomUUID=()=>crypto.randomUUID(),clock=()=>Date.now()}={}){
  requireValue(typeof ledger?.get==='function'&&typeof ledger?.append==='function'&&
    typeof files?.state==='function'&&typeof files?.request==='function'&&
    typeof assertScope==='function'&&typeof assertScopeSync==='function',
    'E_MD_OWNER');

  const inspect=async({workflowId,taskId})=>{
    const run=await ledger.get(workflowId);
    requireValue(run&&['T01','T02'].includes(taskId),'E_MD_RUN_SCHEMA');
    return {run,step:run.steps[taskId==='T01'?0:1],path:pathFor(taskId)};
  };
  const scope=async(run,taskId,authority,path,operation)=>{
    requireValue(await assertScope({run,taskId,authority,path,operation})===true,
      'E_MD_ARTIFACT_SCOPE');
  };
  const snapshot=async()=>{
    const s=await files.state();
    requireValue(s?.connected===true&&s?.devLeaseEpoch===1&&
      typeof s.sessionId==='string'&&s.sessionId.length>=16&&
      Number.isInteger(s.maxContentBytes)&&s.maxContentBytes>=32768,
      'E_MD_NATIVE_SESSION');
    return s;
  };
  const authorityFor=async(workspaceId)=>{
    requireValue(typeof workspaceId==='string'&&ID.test(workspaceId),'E_MD_ARTIFACT_SCOPE');
    const s=await snapshot();
    const list=await files.request('workspaces.list',{}, {sessionId:s.sessionId});
    requireValue(Array.isArray(list?.workspaces)&&list.workspaces.length<=32,'E_MD_NATIVE_PROTOCOL');
    const matches=list.workspaces.filter(row=>row?.workspaceId===workspaceId);
    requireValue(matches.length===1&&matches[0].access==='read-write'&&
      typeof matches[0].sourceId==='string'&&
      typeof matches[0].leaseEpoch==='string'&&ID.test(matches[0].leaseEpoch),
      'E_MD_ARTIFACT_SCOPE');
    return {workspaceId,sourceId:matches[0].sourceId,leaseEpoch:matches[0].leaseEpoch,
      sessionId:s.sessionId,access:matches[0].access};
  };
  const nativeRead=async(authority,path)=>{
    const data=validateWorkspaceRead(await files.request('files.read',
      {workspaceId:authority.workspaceId,path,leaseEpoch:authority.leaseEpoch},
      {sessionId:authority.sessionId}),authority.workspaceId,path);
    requireValue(await digestUtf8(data.content)===data.sha256,'E_MD_NATIVE_INTEGRITY');
    return data;
  };
  const freezeAuthority=async(plan,run,taskId,path,operation)=>{
    const live=await authorityFor(plan.workspaceId);
    requireValue(sameWorkspaceAuthority(live,{...plan,access:'read-write'}),
      'E_MD_NATIVE_SESSION');
    await scope(run,taskId,live,path,operation);
    return live;
  };
  async function prepare(workflowId,taskId,workspaceId){
    const {run,step,path}=await inspect({workflowId,taskId});
    requireValue(step.phase==='ACCEPTED'&&!run.paused,'E_MD_RUN_STATE');
    const authority=await authorityFor(workspaceId);
    await scope(run,taskId,authority,path,'prepare-write');
    let baseSha256=null,writeMethod='files.create';
    try{
      const existing=await nativeRead(authority,path);
      baseSha256=existing.sha256;writeMethod='files.write';
    }catch(error){
      if(error?.code!=='E_FILES_NOT_FOUND'||!['NOT_DISPATCHED','FAILED_CONFIRMED'].includes(error?.outcome))
        throw error;
    }
    await scope(run,taskId,authority,path,'reserve-write');
    const requestId='md-file-'+randomUUID(),artifactRef='artifact-'+randomUUID();
    requireValue(ID.test(requestId)&&ID.test(artifactRef),'E_MD_IDENTITY');
    return ledger.append(workflowId,{
      type:'write-intent',taskId,expectedRevision:run.revision,at:Math.max(clock(),run.updatedAt),
      operationRef:requestId,artifactRef,workspaceId:authority.workspaceId,
      sourceId:authority.sourceId,leaseEpoch:authority.leaseEpoch,
      sessionId:authority.sessionId,path,writeMethod,baseSha256});
  }
  async function readback(workflowId,taskId){
    const {run,step,path}=await inspect({workflowId,taskId});
    requireValue(step.phase==='SAVED'&&step.writePlan?.path===path,'E_MD_RUN_STATE');
    const authority=await freezeAuthority(step.writePlan,run,taskId,path,'readback');
    const observed=await nativeRead(authority,path);
    requireValue(verifyWorkspaceWriteReadBack(observed,{
      workspaceId:authority.workspaceId,path,content:step.saved.text,
      sha256:step.saved.contentSha256}),'E_MD_READBACK');
    return ledger.append(workflowId,{type:'artifact-readback',taskId,
      expectedRevision:run.revision,at:Math.max(clock(),run.updatedAt),
      artifactRef:step.artifactRef,storageVersion:step.storageVersion,
      contentSha256:observed.sha256,text:observed.content});
  }
  async function dispatch(workflowId,taskId){
    const {run,step,path}=await inspect({workflowId,taskId});
    requireValue(step.phase==='WRITE_INTENT'&&step.writePlan?.path===path&&
      step.accepted&&step.writeOperationRef,'E_MD_RUN_STATE');
    const authority=await freezeAuthority(step.writePlan,run,taskId,path,'write');
    const {writeMethod,baseSha256}=step.writePlan;
    // Read-only CAS preflight; a different file version is a definite refusal.
    let before;
    try{before=await nativeRead(authority,path);}catch(error){
      if(error?.code!=='E_FILES_NOT_FOUND'||!['FAILED_CONFIRMED','NOT_DISPATCHED'].includes(error?.outcome))
        throw error;
      before=null;
    }
    requireValue(writeMethod==='files.create'?!before:before?.sha256===baseSha256,
      'E_MD_FILE_CONFLICT');
    await scope(run,taskId,authority,path,'dispatch-write');
    // Persist BEFORE the first Native postMessage. If SW dies here, any
    // subsequent caller sees WRITE_DISPATCHED and CANNOT replay this write.
    const frozen=await ledger.append(workflowId,{type:'write-dispatched',taskId,
      expectedRevision:run.revision,at:Math.max(clock(),run.updatedAt),
      operationRef:step.writeOperationRef});
    let committed=frozen;
    try{
      const nativeParams={workspaceId:authority.workspaceId,path,
        leaseEpoch:authority.leaseEpoch,content:step.accepted.text,
        ...(writeMethod==='files.write'?{expectedSha256:baseSha256}:{})};
      const receipt=await files.request(writeMethod,nativeParams,{
        sessionId:authority.sessionId,requestId:step.writeOperationRef,
        beforeDispatch:()=>{
          const state=files.state();
          requireValue(state?.connected===true&&state.sessionId===authority.sessionId,
            'E_MD_NATIVE_SESSION');
          const guard=assertScopeSync({run:frozen,taskId,authority,path,operation:'write'});
          requireValue(guard===true,'E_MD_ARTIFACT_SCOPE');
        }});
      verifyWorkspaceWriteReceipt(receipt,{workspaceId:authority.workspaceId,path,
        sha256:step.accepted.contentSha256,create:writeMethod==='files.create'});
      await scope(frozen,taskId,authority,path,'settle-write');
      committed=await ledger.append(workflowId,{type:'artifact-saved',taskId,
        expectedRevision:frozen.revision,at:Math.max(clock(),frozen.updatedAt),
        operationRef:step.writeOperationRef,artifactRef:step.artifactRef,
        storageVersion:receipt.sha256,contentSha256:step.accepted.contentSha256});
    }catch(error){
      // An uncertain write never becomes a new write, including after a
      // browser restart. A same-byte readback alone proves no attribution.
      if(committed.steps[taskId==='T01'?0:1].phase==='WRITE_DISPATCHED'){
        try{await ledger.append(workflowId,{type:'unknown',taskId,
          expectedRevision:committed.revision,at:Math.max(clock(),committed.updatedAt),
          code:ID.test(error?.code)?error.code:'E_MD_FILE_UNKNOWN'});}
        catch{/* First original error remains primary; no side effect retry. */}
      }
      throw error;
    }
    return readback(workflowId,taskId);
  }
  async function inspectUnknown(workflowId,taskId){
    const {run,step,path}=await inspect({workflowId,taskId});
    requireValue(step.phase==='UNKNOWN'&&step.writePlan?.path===path,'E_MD_RUN_STATE');
    const authority=await freezeAuthority(step.writePlan,run,taskId,path,'read-only-reconcile');
    const observed=await nativeRead(authority,path);
    return Object.freeze({status:'UNKNOWN',requestId:step.writeOperationRef,
      workspaceId:authority.workspaceId,path,readbackSha256:observed.sha256,
      matchesExpectedBytes:observed.sha256===step.accepted?.contentSha256&&
        observed.content===step.accepted?.text,
      originalWriteAcknowledged:false,canResend:false});
  }
  return Object.freeze({prepare,dispatch,readback,inspectUnknown});
}
