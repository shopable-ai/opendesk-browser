// OD-AI-WORKFLOW-BRIDGE: fixed-compiled, version-pinned business result adapter.
// This never executes a website script, grants authority or interprets an
// imported package's JavaScript as a validator. Controller owns Run/Result.
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {validateChatGPTCreateResult,formatChatGPTCreateDelivery}
  from '../src/chatgpt-conversation-result.js';

const TASK_ID='chatgpt.conversation.create';
const VERSION='0.2.0';
const ORIGIN='https://chatgpt.com';
const ROOT=ORIGIN+'/';
const release=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>
  row.taskId===TASK_ID&&row.version===VERSION);
const fail=message=>{throw Object.assign(new Error(message),{code:'E_BRIDGE_RESULT'});};

// A page-reported "draft-prepared" alone does not prove that B survived
// Controller retirement. Bind the result to the exact original retained tab
// and document; an unsent B has NO /c/ URL to report.
function verify(value,request,run){
  const checked=validateChatGPTCreateResult(value,request.args);
  const target=run?.target,retained=run?.retainedTarget;
  if(run?.requestId!==request.requestId||
    run.targetDisposition!=='retain-on-success'||
    target?.mode!=='owned'||target.frameId!==0||
    !Number.isSafeInteger(target.tabId)||target.tabId<0||
    typeof target.documentId!=='string'||!target.documentId||
    target.allowedOrigin!==ORIGIN||
    retained?.tabId!==target.tabId||
    retained.documentId!==target.documentId||
    retained.origin!==ORIGIN||
    retained.url!==(checked.send?checked.conversationUrl:ROOT))
    fail('The retained ChatGPT B tab/document or observed URL is not bound to this original Run');
  return checked;
}

// Only the exact, reviewed immutable installed release may use this adapter.
// Future Task versions must opt in with a separately audited contract.
export function reviewedChatGPTResultAdapter(request){
  if(request?.taskId!==TASK_ID||request?.installation?.version!==VERSION)return null;
  const installed=request.installation;
  if(!release||installed.manifestHash!==release.manifestHash||
    installed.contentHash!==release.sourceHash||
    installed.scriptId!==`task:${TASK_ID}:${VERSION}`||
    installed.revision!==1||request.targetUrl!==ROOT)
    fail('ChatGPT result adapter does not match the installed, reviewed Task release');
  return Object.freeze({
    verify:(snapshot,value)=>verify(value,request,snapshot?.run),
    format:formatChatGPTCreateDelivery
  });
}
