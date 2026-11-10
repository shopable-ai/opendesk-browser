// OD-AI-WORKFLOW-BRIDGE: read-only attestation of the EXISTING original
// Controller's durable ChatGPT Task result. No page click, replay or new Runner.
import {decodeValue} from '../../../src/platform/page-port/codec.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {MD_RUN_FORMAT,mdTaskPrompt} from '../src/md-run-contract.js';

const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const requireValue=(ok,code='E_MD_RECEIPT')=>{if(!ok)fail(code);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{8,128}$/u.test(x);
const messageId=x=>typeof x==='string'&&/^[A-Za-z0-9:_-]{8,160}$/u.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/u.test(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(x);

// The caller MUST be the first-party trusted Host: its two callbacks access
// the authenticated original Controller and the live official account identity.
// A caller-supplied Task result, DOM text or accountId is never accepted.
export async function readMdChatGPTReplyEvent({workflowRun,taskId,readOriginalRun,
  verifyAccount,clock=()=>Date.now()}={}){
  requireValue(workflowRun?.format===MD_RUN_FORMAT&&['T01','T02'].includes(taskId),'E_MD_RUN_SCHEMA');
  const step=workflowRun.steps[taskId==='T01'?0:1],pin=step?.taskPin;
  requireValue(['CREATE_INTENT','AWAIT_REPLY'].includes(step?.phase)&&
    id(step?.createOperationRef)&&pin&&id(pin.installationId)&&
    Number.isSafeInteger(pin.generation)&&pin.generation>0&&
    sha(pin.manifestHash)&&sha(pin.contentHash)&&sha(pin.promptSha256),
    'E_MD_ORIGINAL');
  requireValue(typeof readOriginalRun==='function'&&typeof verifyAccount==='function','E_MD_OWNER');
  const prompt=mdTaskPrompt(workflowRun,taskId);
  requireValue(await digestUtf8(prompt)===pin.promptSha256,'E_MD_INTEGRITY');

  // This is an independent live account verification, not an account label
  // copied from the already-submitted workflow or a Task's untrusted reply.
  const account=await verifyAccount({runId:workflowRun.runId,taskId,
    expectedAccountId:workflowRun.account.accountId,origin:workflowRun.account.origin});
  requireValue(account===workflowRun.account.accountId,'E_MD_ACCOUNT');

  const snapshot=await readOriginalRun({taskRunId:step.taskRunId,
    requestId:step.createOperationRef,installationId:pin.installationId,generation:pin.generation});
  const run=snapshot?.run;
  requireValue(run?.tag==='controller-run'&&run.state==='completed'&&
    run.retirementState==='released'&&run.sourceKind==='saved'&&
    run.targetDisposition==='retain-on-success'&&
    run.scriptId?.startsWith('task:chatgpt.conversation.create:')&&
    run.contentHash===pin.contentHash&&run.revision?.sourceHash===pin.contentHash&&
    run.requestId===step.createOperationRef&&run.identity?.runId===run.runId&&
    id(run.runId)&&id(run.resultId)&&
    (!step.taskRunId||step.taskRunId===run.runId)&&
    !snapshot.resultDeliveryDenied?.includes(run.runId),
    'E_MD_ORIGINAL');
  const target=run.target,transfer=run.retainedTarget;
  requireValue(target?.mode==='owned'&&target.frameId===0&&
    Number.isSafeInteger(target.tabId)&&target.tabId>=0&&
    id(target.documentId)&&target.allowedOrigin==='https://chatgpt.com'&&
    transfer?.tabId===target.tabId&&transfer.documentId===target.documentId&&
    transfer.origin==='https://chatgpt.com'&&typeof transfer.url==='string',
    'E_MD_TARGET');
  requireValue(Array.isArray(snapshot.results),'E_MD_ORIGINAL');
  const results=snapshot.results.filter(row=>row?.runId===run.runId);
  requireValue(results.length===1,'E_MD_ORIGINAL');
  const result=results[0];
  requireValue(result.tag==='controller-result'&&result.resultId===run.resultId&&
    result.state==='completed'&&result.sourceKind==='saved'&&
    result.revision?.sourceHash===pin.contentHash&&
    result.outcome?.ok===true&&result.outcome?.valueWire,'E_MD_ORIGINAL');
  let value;
  try{value=decodeValue(result.outcome.valueWire);}catch{fail('E_MD_RESULT_FORMAT');}
  requireValue(value?.kind==='chatgpt.conversation.create.result'&&value.version===2&&
    value.status==='reply-complete'&&value.send===true&&
    value.messageConfirmed===true&&value.readbackConfirmed===true&&
    value.sourceUrl==='https://chatgpt.com/'&&value.promptChars===prompt.length&&
    uuid(value.conversationId)&&typeof value.conversationUrl==='string'&&
    messageId(value.userMessageRef)&&messageId(value.assistantMessageRef)&&
    value.userMessageRef!==value.assistantMessageRef&&
    typeof value.replyText==='string'&&value.replyText.trim().length>0&&
    new TextEncoder().encode(value.replyText).byteLength<=65536,
    'E_MD_RESULT_FORMAT');
  let url;
  try{url=new URL(value.conversationUrl);}catch{fail('E_MD_IDENTITY');}
  requireValue(url.origin===workflowRun.account.origin&&!url.search&&!url.hash&&
    url.pathname==='/c/'+value.conversationId&&!url.username&&!url.password&&
    transfer.url===url.href,
    'E_MD_IDENTITY');
  // The account may change while the Controller result is being read.
  const after=await verifyAccount({runId:workflowRun.runId,taskId,
    expectedAccountId:workflowRun.account.accountId,origin:workflowRun.account.origin,
    tabId:target.tabId,documentId:target.documentId});
  requireValue(after===account,'E_MD_ACCOUNT');
  return Object.freeze({type:'reply-complete',taskId,expectedRevision:workflowRun.revision,
    at:Math.max(clock(),workflowRun.updatedAt),operationRef:step.createOperationRef,
    taskRunId:run.runId,conversationId:value.conversationId,
    conversationUrl:url.href,documentRef:target.documentId,
    accountId:account,userMessageRef:value.userMessageRef,
    assistantMessageRef:value.assistantMessageRef,replyRef:result.resultId,
    text:value.replyText,contentSha256:await digestUtf8(value.replyText)});
}
