// OD-AI-WORKFLOW-BRIDGE: fixed first-party 0.3.0 Result Adapter.
// Incomplete PREPARE and SUBMIT runs must NOT be formatted as delivered A/B
// workflows by the generic website result path.
import {validateChatGPTCreateResultV3}
  from '../src/chatgpt-conversation-result-v0.3.js';
import {REVIEWED_BUILTIN_TASK_RELEASES}
  from '../../../src/platform/tasks/builtin-releases.js';

const ORIGIN='https://chatgpt.com',ROOT=ORIGIN+'/',TASK_ID='chatgpt.conversation.create';
const VERSION='0.3.0',SCRIPT_ID='task:'+TASK_ID+':'+VERSION;
const release=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>
  row.taskId===TASK_ID&&row.version===VERSION);
const fail=message=>{throw Object.assign(new Error(message),{code:'E_BRIDGE_RESULT'});};
const id=v=>typeof v==='string'&&v.length>0&&v.length<=128;
const tab=v=>Number.isSafeInteger(v)&&v>=0;
function verifyRun(snapshot,value,request){
  const checked=validateChatGPTCreateResultV3(value,request.args),run=snapshot?.run;
  const target=run?.target,selection=run?.selection;
  if(run?.requestId!==request.requestId||run.targetDisposition!=='retain-on-success'||
    target?.frameId!==0||!tab(target.tabId)||!id(target.documentId)||
    target.allowedOrigin!==ORIGIN)
    fail('Reviewed 0.3 result does not have an original Controller run and document');
  if(checked.phase==='prepare'){
    const retained=run.retainedTarget;
    if(target.mode!=='owned'||selection?.mode!=='owned'||
      retained?.tabId!==target.tabId||retained.documentId!==target.documentId||
      retained.origin!==ORIGIN||retained.url!==ROOT||
      // The original PREPARE may later record a consumed continuation;
      // reading its immutable draft result must still work for recovery.
      run.retainedFrom!==undefined)
      fail('Unsent B was not retained as the sole original owned document');
  }else{
    // Controller admits this with an atomic retainedFrom journal and identical
    // installation. Page-generated references are never sufficient on their own.
    // A separate LIVE document+URL readback is required before A delivery.
    if(target.mode!=='borrowed'||selection?.mode!=='borrowed'||
      selection.tabId!==target.tabId||selection.frameId!==0||
      selection.documentId!==target.documentId||
      selection.expectedUrl!==ROOT||
      run.retainedFrom?.runId!==checked.prepareRunId||
      run.retainedFrom?.requestId!==checked.prepareRequestId||
      !id(run.retainedFrom.runId)||!id(run.retainedFrom.requestId)||
      ![ROOT,checked.conversationUrl].includes(target.url))
      fail('Submit did not borrow exactly the original retained B target and Run');
  }
  return checked;
}
export function reviewedChatGPTV3Adapter(request){
  if(request?.taskId!==TASK_ID||request?.installation?.version!==VERSION)return null;
  const install=request.installation;
  if(!release||install.manifestHash!==release.manifestHash||
    install.contentHash!==release.sourceHash||
    install.scriptId!==SCRIPT_ID||install.revision!==1||
    request.targetUrl!==ROOT)
    fail('The 0.3 adapter does not match a registered immutable installed release');
  return Object.freeze({
    verify:(snapshot,value)=>verifyRun(snapshot,value,request),
    format:()=>fail('0.3 results require a verified two-stage A/B consumer, never generic delivery')
  });
}
