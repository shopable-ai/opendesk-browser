// Narrow, source-backed Workflow business proof. No content or URL is sent to
// analytics: the original Controller journals are inspected locally only.
import {decodeValue} from '../platform/page-port/codec.js';
import {decodeValue as decodeControlValue} from '../framework/control/value.js';
import {WORKFLOW_OBSERVE_SOURCE} from '../ui/workflow/observation.js';
import {verifyOpenedLinkPage} from '../ui/workflow/direct-execution.js';

// Original Controller journals use integer epoch milliseconds. Historical
// records may be ISO strings; any invalid clock fails closed.
const timeOf=value=>typeof value==='number'?
  (Number.isSafeInteger(value)&&value>=0?value:NaN):
  (typeof value==='string'?Date.parse(value):NaN);
const origin=url=>{try{const row=new URL(url);return ['http:','https:'].includes(row.protocol)?row.origin:null;}catch{return null;}};
function authentic(run,result,hostDocumentId,{observer=false}={}){
  if(run?.tag!=='controller-run'||result?.tag!=='controller-result'||
    run.hostDocumentId!==hostDocumentId||run.namespace!==result.namespace||
    run.runId!==result.runId||run.resultId!==result.resultId||
    run.state!=='completed'||result.state!=='completed'||result.outcome?.ok!==true||
    run.workerRetired!==true||run.retirementState!=='released'||
    run.revision?.sourceHash!==run.contentHash||
    result.revision?.sourceHash!==run.contentHash||
    run.scheduledFireId||run.cloudRequestId||run.profile==='app-service'||
    !run.target||!Number.isFinite(timeOf(run.createdAt))||
    !Number.isFinite(timeOf(result.committedAt)))return false;
  if(observer&&(run.sourceKind!=='draft'||run.draftSourceUtf8!==WORKFLOW_OBSERVE_SOURCE))return false;
  return true;
}
function observedDocument(run,result){
  let value;
  try{value=decodeValue(result.outcome.valueWire);}catch{return null;}
  if(value?.kind!=='semantic-dom-summary'||!value.document||
    value.document.documentId!==run.target?.documentId||
    value.document.url!==run.target?.url||!origin(value.document.url)||
    !Array.isArray(value.nodes)||value.nodes.length>24||
    value.nodes.some(row=>!row||typeof row!=='object'))return null;
  return value;
}
// The Controller journal stores packaged actions in envelope.operation;
// top-level "method" is emitted only for Service/App Service calls.
// Bind a durable click to the same Run and pre-navigation Document.
// A fill, wait, forged flat method, or malformed wire cannot prove navigation.
function durableClickFromJournal(row, actionRun){
  if(row?.tag!=='controller-operation'||row.runId!==actionRun.runId||
    row.state!=='durable'||!row.reply||row.reply.error||
    row.envelope?.identity?.runId!==actionRun.runId||
    row.envelope?.operation?.kind!=='packaged'||
    row.envelope.operation.method!=='locatorAction')return false;
  const originalTarget=row.envelope?.target;
  if(!originalTarget||['windowId','tabId','frameId','documentId','url']
    .some(key=>originalTarget[key]!==actionRun.target?.[key]))return false;
  try{
    const args=decodeControlValue(row.envelope.operation.args);
    return Array.isArray(args)&&args.length===2&&args[1]?.action==='click';
  }catch{return false;}
}

// This currently certifies *only* an actual navigation to a previously
// observed eligible link. Search-result / fill B-grade metrics remain gated
// until the original Authority can verify their separate readback too.
export function verifyWorkflowLinkBusinessProof({actionRun,actionResult,beforeRun,beforeResult,
  afterRun,afterResult,operations=[],hostDocumentId}={}){
  if(!authentic(actionRun,actionResult,hostDocumentId)||
    !authentic(beforeRun,beforeResult,hostDocumentId,{observer:true})||
    !authentic(afterRun,afterResult,hostDocumentId,{observer:true})||
    !['draft','saved'].includes(actionRun.sourceKind)||
    new Set([actionRun.runId,beforeRun.runId,afterRun.runId]).size!==3||
    beforeRun.contentHash!==afterRun.contentHash||
    beforeRun.hostInstanceId!==actionRun.hostInstanceId||
    afterRun.hostInstanceId!==actionRun.hostInstanceId||
    !(timeOf(beforeResult.committedAt)<=timeOf(actionRun.createdAt))||
    !(timeOf(actionResult.committedAt)<=timeOf(afterRun.createdAt))||
    timeOf(afterRun.createdAt)-timeOf(actionResult.committedAt)>5*60*1000||
    !operations.some(row=>durableClickFromJournal(row,actionRun)))return null;
  const action=actionRun.target,before=beforeRun.target,after=afterRun.target;
  if(before.documentId!==action.documentId||before.url!==action.url||
    before.tabId!==action.tabId||before.windowId!==action.windowId||
    after.frameId!==0||after.tabId!==action.tabId||after.windowId!==action.windowId||
    after.documentId===action.documentId||!origin(after.url)||!origin(action.url)||
    after.url===action.url)return null;
  const beforeValue=observedDocument(beforeRun,beforeResult),
    afterValue=observedDocument(afterRun,afterResult);
  if(!beforeValue||!afterValue)return null;
  // No model- or UI-provided target URL/name is accepted: the eligible link
  // must exist in the *before* fixed observer's durable result.
  const matches=beforeValue.nodes.filter(row=>row.role==='link'&&
    row.state?.visible===true&&row.state?.disabled!==true&&
    typeof row.name==='string'&&row.name.trim().length>=3&&
    row.navigation?.url===after.url&&row.navigation?.origin===origin(after.url));
  if(!matches.length)return null;
  const post={format:'opendesk.workflow-observation.v1',
    runId:afterRun.runId,resultId:afterResult.resultId,sourceHash:afterRun.contentHash,
    summary:{title:afterValue.title,origin:origin(after.url),documentId:after.documentId,
      nodes:afterValue.nodes}};
  const verified=matches.some(link=>verifyOpenedLinkPage({
    linkGuard:{url:after.url,origin:origin(after.url),name:link.name},
    after:post,actionTarget:{...action,origin:origin(action.url)},
    resultTarget:{...after,origin:origin(after.url)}
  })!==null);
  return verified?{actionTarget:action,resultTarget:after}:null;
}
