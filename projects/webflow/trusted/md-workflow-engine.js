// OD-AI-WORKFLOW-BRIDGE: two serial Markdown tasks over the ORIGINAL trusted
// RunHost / Controller, installed Task, and Native file adapter.
// No new Runner, Authority, background queue, database, or browser driver.
// Only the first-party reviewed Host may construct these injected capabilities.
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {taskScriptId,validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {mdTaskPrompt,nextMdRunAction} from '../src/md-run-contract.js';

const TASK_ID='chatgpt.conversation.create',VERSION='0.2.0',URL='https://chatgpt.com/';
// Fixed legacy 0.2.0 workflow depends on a *reviewed release*, not the default-onboarding list.
const RELEASE=REVIEWED_BUILTIN_TASK_RELEASES.find(x=>x.taskId===TASK_ID&&x.version===VERSION);
const ID=/^[A-Za-z0-9._:-]{8,128}$/u;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const need=(okay,code)=>{if(!okay)fail(code);};

export function createMdWorkflowEngine({ledger,host,client,artifacts,verifyScope,
  verifyAccount,assertScopeSync,workspaceFor,clock=()=>Date.now(),
  randomUUID=()=>crypto.randomUUID()}={}){
  need(RELEASE&&typeof ledger?.get==='function'&&typeof ledger?.append==='function'&&
    typeof ledger?.claimNext==='function'&&typeof ledger?.reconcileOriginalReply==='function'&&
    typeof client?.request==='function'&&typeof host?.start==='function'&&
    typeof artifacts?.prepare==='function'&&typeof artifacts?.dispatch==='function'&&
    typeof artifacts?.readback==='function'&&typeof verifyScope==='function'&&
    typeof assertScopeSync==='function'&&typeof verifyAccount==='function'&&
    typeof workspaceFor==='function','E_MD_OWNER');

  async function authorized(run,taskId,action){
    need(await verifyScope({run,taskId,action})===true,'E_MD_AUTH');
    const id=await verifyAccount({runId:run.runId,taskId,
      origin:run.account.origin,expectedAccountId:run.account.accountId});
    need(id===run.account.accountId,'E_MD_ACCOUNT');
  }
  function event(run,type,taskId,rest={}){
    return {type,taskId,expectedRevision:run.revision,
      at:Math.max(clock(),run.updatedAt),...rest};
  }
  async function originalTask(prompt){
    const item=await client.request('resolveInstalledTask',{taskId:TASK_ID});
    need(item?.taskId===TASK_ID&&item.version===VERSION&&
      item.scriptId===taskScriptId(TASK_ID,VERSION)&&item.revision===1&&
      item.manifestHash===RELEASE.manifestHash&&
      item.contentHash===RELEASE.sourceHash&&
      typeof item.installationId==='string'&&ID.test(item.installationId)&&
      Number.isSafeInteger(item.generation)&&item.generation>0&&
      item.manifest?.targetDisposition==='retain-on-success'&&
      item.manifest?.deadlineMs===120000&&
      item.manifest?.siteOrigins?.length===1&&
      item.manifest.siteOrigins[0]==='https://chatgpt.com',
      'E_MD_TASK_PIN');
    const params=validateTaskParams(item.manifest.paramsSchema,{prompt,send:true});
    need(params.send===true&&params.prompt===prompt&&
      Object.keys(params).length===2,'E_MD_TASK_PIN');
    return {...item,params};
  }
  async function advance(workflowId){
    need(typeof workflowId==='string'&&ID.test(workflowId),'E_MD_RUN_SCHEMA');
    const run=await ledger.get(workflowId);
    need(run,'E_MD_RUN_MISSING');
    const next=nextMdRunAction(run),{taskId}=next;
    const action=next.action,step=taskId==='T02'?run.steps[1]:run.steps[0];
    if(action==='CLAIM_WITH_TRUSTED_LEDGER'){
      await authorized(run,taskId,'claim');
      const claimed=await ledger.claimNext(workflowId);
      return {progress:claimed.claimed===true,action:claimed.action};
    }
    if(action==='RECORD_CREATE_INTENT'){
      await authorized(run,taskId,'prepare-task');
      const prompt=mdTaskPrompt(run,taskId),task=await originalTask(prompt);
      await authorized(run,taskId,'reserve-task');
      const ref='md-chat-'+randomUUID();
      need(ID.test(ref),'E_MD_IDENTITY');
      await ledger.append(workflowId,event(run,'create-intent',taskId,{
        operationRef:ref,authorizationRef:run.authorizationRef,
        installationId:task.installationId,generation:task.generation,
        manifestHash:task.manifestHash,contentHash:task.contentHash,
        promptSha256:await digestUtf8(prompt)}));
      return {progress:true,action};
    }
    if(action==='DISPATCH_ORIGINAL_CHATGPT_ONCE'){
      await authorized(run,taskId,'dispatch-task');
      const prompt=mdTaskPrompt(run,taskId),task=await originalTask(prompt);
      need(step.taskPin?.installationId===task.installationId&&
        step.taskPin.generation===task.generation&&
        step.taskPin.manifestHash===task.manifestHash&&
        step.taskPin.contentHash===task.contentHash&&
        step.taskPin.promptSha256===await digestUtf8(prompt),
        'E_MD_TASK_PIN');
      need(!host.currentRun&&!host.executionPending,'E_MD_HOST_BUSY');
      // Cross the irreversible submission fence BEFORE invoking RunHost. From
      // TASK_DISPATCHED onward, this method can only query the ORIGINAL Run.
      const sent=await ledger.append(workflowId,event(run,'task-dispatched',taskId,{
        operationRef:step.createOperationRef}));
      if(assertScopeSync({run:sent,taskId,action:'dispatch-task'})!==true)
        return {progress:false,action:'HOLD_ORIGINAL_QUERY_ONLY',code:'E_MD_AUTH'};
      let claim;
      try{
        claim=await host.start({
          source:{kind:'saved',scriptId:task.scriptId,revision:task.revision,
            contentHash:task.contentHash},
          params:task.params,target:{mode:'owned',url:URL},
          expectedTaskGeneration:task.generation,
          expectedTaskInstallationId:task.installationId,
          deadlineAt:clock()+120000,requestId:step.createOperationRef});
      }catch(error){
        return {progress:false,action:'HOLD_ORIGINAL_QUERY_ONLY',
          code:error?.code||'E_MD_ORIGINAL_UNKNOWN'};
      }
      need(typeof claim?.runId==='string'&&ID.test(claim.runId),'E_MD_ORIGINAL_UNKNOWN');
      try{
        await ledger.append(workflowId,event(sent,'task-admitted',taskId,{
          operationRef:step.createOperationRef,taskRunId:claim.runId}));
      }catch(error){
        return {progress:false,action:'HOLD_ORIGINAL_QUERY_ONLY',
          code:error?.code||'E_MD_RUN_STALE'};
      }
      // Await only the Controller Run we just started, not a second worker.
      if(host.completion&&typeof host.completion.then==='function')
        await Promise.resolve(host.completion).catch(()=>{});
      return {progress:true,action:'ORIGINAL_TASK_ADMITTED'};
    }
    if(['QUERY_ORIGINAL_TASK','QUERY_ORIGINAL_REPLY'].includes(action)){
      try{
        await ledger.reconcileOriginalReply(workflowId,taskId);
        return {progress:true,action:'ORIGINAL_REPLY_VERIFIED'};
      }catch(error){
        return {progress:false,action:'HOLD_ORIGINAL_QUERY_ONLY',
          code:error?.code||'E_MD_ORIGINAL_UNKNOWN'};
      }
    }
    if(action==='VERIFY_REPLY'){
      try{await ledger.append(workflowId,event(run,'accept',taskId));}
      catch(error){
        if(['E_MD_ACCEPTANCE','E_MD_DEPENDENCY'].includes(error?.code)){
          await ledger.append(workflowId,event(run,'fail',taskId,{code:error.code}));
          return {progress:false,action:'HOLD_FAILED',code:error.code};
        }
        throw error;
      }
      return {progress:true,action:'ACCEPTED'};
    }
    if(action==='RECORD_ARTIFACT_WRITE_INTENT'){
      await authorized(run,taskId,'reserve-artifact');
      const path='artifacts/'+taskId+'.json';
      const workspaceId=await workspaceFor({run,taskId,path});
      need(typeof workspaceId==='string'&&ID.test(workspaceId),'E_MD_ARTIFACT_SCOPE');
      await artifacts.prepare(workflowId,taskId,workspaceId);
      return {progress:true,action:'ARTIFACT_RESERVED'};
    }
    if(action==='DISPATCH_ORIGINAL_FILE_WRITE_ONCE'){
      await artifacts.dispatch(workflowId,taskId);
      return {progress:true,action:'ARTIFACT_READBACK'};
    }
    if(action==='READBACK_ORIGINAL_ARTIFACT'){
      await artifacts.readback(workflowId,taskId);
      return {progress:true,action:'ARTIFACT_READBACK'};
    }
    if(action==='QUERY_ORIGINAL_WRITE')
      return {progress:false,action:'HOLD_ORIGINAL_FILE_UNKNOWN',code:'E_MD_FILE_UNKNOWN'};
    return {progress:false,action};
  }
  async function drive(workflowId,{maxTransitions=30}={}){
    need(Number.isSafeInteger(maxTransitions)&&maxTransitions>=1&&maxTransitions<=30,
      'E_MD_RUN_SCHEMA');
    for(let i=0;i<maxTransitions;i++){
      let result;
      try{result=await advance(workflowId);}
      catch(error){
        return {run:await ledger.get(workflowId),action:'HOLD_ERROR',
          code:error?.code||'E_MD_RUN_UNKNOWN',transitions:i};
      }
      if(!result.progress)
        return {run:await ledger.get(workflowId),action:result.action,
          code:result.code??null,transitions:i};
    }
    return {run:await ledger.get(workflowId),action:'HOLD_BUDGET',
      code:'E_MD_DRIVE_BUDGET',transitions:maxTransitions};
  }
  return Object.freeze({advance,drive});
}
