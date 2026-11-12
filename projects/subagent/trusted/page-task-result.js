// First-party result projection registered by the existing extension SW.
// Page supplies neither this function nor its callbacks. The generic Page Task
// Authority resolves the original request and performs disclosure authorization.
import {createSubagentResultReader} from './result.js';

const PROGRAM_ID='opendesk.subagent';
const fail=()=>{throw Object.assign(new Error('Original Subagent Page Task request is required'),
  {code:'E_SUBAGENT_RESULT'});};

export async function projectSubagentPageTaskResult({request,preparation,snapshot,resolvedInstallation}={},
  {authorize}={}){
  // This is the business adapter registry boundary, never a core authority rule.
  if(request?.pageBinding?.programId!==PROGRAM_ID)return null;
  if(typeof authorize!=='function'||!preparation||
    preparation.preparationId!==request.preparationId||
    preparation.pageRequestId!==request.requestId||
    preparation.runId!==snapshot?.run?.runId||preparation.resultId!==snapshot?.run?.resultId||
    snapshot.run.taskPreparationId!==preparation.preparationId)fail();
  const task=request.task;
  const installation={version:task.version,manifestHash:task.manifestHash,
    scriptId:`task:${task.taskId}:${task.version}`,revision:1,contentHash:task.contentHash,
    installationId:task.installationId,generation:task.generation};
  const binding={logicalRequestId:request.requestId,
    request:{requestId:preparation.preparationId,taskId:task.taskId,
      targetUrl:request.target.url,args:request.params,installation},
    resolvedInstallation,runId:preparation.runId,resultId:preparation.resultId,snapshot};
  const reader=createSubagentResultReader({
    readOriginalRun:async()=>binding,
    assertAuthorized:async()=>{if(!await authorize())fail();return true;}
  });
  return reader.read({requestId:request.requestId});
}
