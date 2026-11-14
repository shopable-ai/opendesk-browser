// Fixed, reviewed ChatGPT 0.2.x Controller Task Result contract.
// Independent of WebFlow original-A delivery and Subagent UI. Only trusted,
// built-in consumers may import this module; installed source stays sandboxed.
import {REVIEWED_BUILTIN_TASK_RELEASES}
  from '../../../src/platform/tasks/builtin-releases.js';
import {decodeValue} from '../../../src/platform/page-port/codec.js';
import {validateChatGPTCreateResult} from './result-v2.js';

const TASK_ID='chatgpt.conversation.create';
const VERSIONS=Object.freeze(['0.2.0','0.2.1','0.2.2']);
const ORIGIN='https://chatgpt.com';
const ROOT=ORIGIN+'/';
const failIdentity=(code,message)=>{throw Object.assign(new Error(message),{code});};
const installationKeys=['version','manifestHash','scriptId','revision','contentHash',
  'installationId','generation'];
const sameInstallation=(a,b)=>installationKeys.every(key=>a?.[key]===b?.[key]);
const requireValue=(value,length=128)=>typeof value==='string'&&value.length>0&&value.length<=length;

// The fixed adapter may identify a *retained-target* mismatch for the
// trusted handoff receipt to classify, without weakening its own error code.
const fail=(message,failureKind)=>{throw Object.assign(new Error(message),
  {code:'E_BRIDGE_RESULT',...(failureKind?{failureKind}:{})});};

// A page-reported "draft-prepared" alone does not prove that B survived
// Controller retirement. Bind the result to the exact original retained tab
// and document; an unsent B has NO /c/ URL to report.
function verify(value,request,run){
  const checked=validateChatGPTCreateResult(value,request.args);
  // The immutable 0.2.2 script can fall back to DOM turn keys. Those keys
  // cannot certify official B messages, even when its messageConfirmed is true.
  if(checked.send&&request.installation.version==='0.2.2'&&
    ![checked.userMessageRef,checked.assistantMessageRef].every(id=>
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(id)))
    fail('The reviewed 0.2.2 result requires official B message UUIDs, not local turn references');
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
    fail('The retained ChatGPT B tab/document or observed URL is not bound to this original Run',
      'retained-target-mismatch');
  return checked;
}


export function reviewedChatGPTCreateBusinessAdapter(request){
  if(request?.taskId!==TASK_ID)fail('Not a reviewed ChatGPT conversation Task');
  const version=request?.installation?.version;
  if(!VERSIONS.includes(version))
    fail('ChatGPT Task release has no fixed-compiled 0.2.x result validator');
  const release=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>
    row.taskId===TASK_ID&&row.version===version);
  const installed=request.installation;
  if(!release||installed.manifestHash!==release.manifestHash||
    installed.contentHash!==release.sourceHash||
    installed.scriptId!==`task:${TASK_ID}:${version}`||
    installed.revision!==1||request.targetUrl!==ROOT)
    fail('ChatGPT result validator does not match the installed, reviewed Task release');
  return Object.freeze({verify:(snapshot,value)=>verify(value,request,snapshot?.run)});
}

// This verifies the ORIGINAL durable Controller record, not a page-supplied
// status or a second Run. Consumers must check their own result-read Authority.
export function verifyInstalledChatGPTDurableResult(snapshot,runId,resolved,request){
  const adapter=reviewedChatGPTCreateBusinessAdapter(request);
  if(!sameInstallation(request.installation,resolved))
    failIdentity('E_BRIDGE_REVISION','持久结果不属于本次选择的安装版本');
  const hash=request.installation.contentHash;
  const run=snapshot?.run;
  if(!run||run.runId!==runId||run.state!=='completed'||run.retirementState!=='released'||
    run.sourceKind!=='saved'||run.scriptId!==resolved.scriptId||
    run.contentHash!==hash||run.revision?.scriptId!==resolved.scriptId||
    run.revision?.revision!==resolved.revision||
    run.revision?.sourceHash!==hash||
    snapshot.resultDeliveryDenied?.includes(runId)||
    !Array.isArray(snapshot.results))
    failIdentity('E_BRIDGE_DURABLE','运行身份、原子版本或持久结果交付状态不匹配');
  const matches=snapshot.results.filter(row=>row?.runId===runId);
  if(matches.length!==1||matches[0].resultId!==run.resultId||
    !requireValue(matches[0].resultId)||
    matches[0].state!=='completed'||matches[0].tag!=='controller-result'||
    matches[0].revision?.scriptId!==resolved.scriptId||
    matches[0].revision?.revision!==resolved.revision||
    matches[0].revision?.sourceHash!==hash||
    matches[0].sourceKind!=='saved'||matches[0].outcome?.ok!==true)
    failIdentity('E_BRIDGE_RESULT','持久结果缺失、版本不符、失败或存在歧义');
  let value;
  try{value=decodeValue(matches[0].outcome.valueWire);}catch{
    failIdentity('E_BRIDGE_RESULT','持久结果无法通过原 Controller Codec 解码');
  }
  const checked=adapter.verify(snapshot,value);
  return Object.freeze({runId,resultId:matches[0].resultId,
    revision:run.revision.revision,sourceHash:run.revision.sourceHash,value:checked});
}
