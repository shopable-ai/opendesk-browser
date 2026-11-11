// OD-AI-WORKFLOW-BRIDGE: trusted B PREPARE readback before send approval.
// Pure site-specific adapter: no Controller Run, new tab, grant or page code.
import {digestUtf8} from '../../../src/platform/protocol.js';

const ROOT='https://chatgpt.com/',ORIGIN='https://chatgpt.com';
const fail=reason=>{throw Object.assign(new Error(reason),{code:'E_CHAT_B_PREPARE'});};
const token=x=>typeof x==='string'&&x.length>=8&&x.length<=128;
const same=(a,b)=>a?.tabId===b?.tabId&&a?.documentId===b?.documentId&&a?.url===b?.url;
export function isReviewedBPrepare(row){
  return row?.site?.adapter==='chatgpt'&&
    row?.intentProtocol==='webflow.task.intent.v2'&&
    row.scope?.taskId==='chatgpt.conversation.create'&&
    row.scope?.installation?.version==='0.3.0'&&
    row.scope?.targetUrl===ROOT&&row.scope?.args?.phase==='prepare';
}
export async function attestReviewedBPrepare({row,snapshot,durable,api}={}){
  if(!isReviewedBPrepare(row)||!snapshot?.run||!api?.webNavigation?.getFrame||
    !api?.tabs?.get||!api?.permissions?.contains)fail('Not a reviewed 0.3 PREPARE');
  const run=snapshot.run,retained=run.retainedTarget,installed=row.scope.installation;
  if(row.status!=='consumed'||row.controllerSubmitted!==true||
    run.requestId!==row.requestId||run.runId!==durable?.runId||
    run.resultId!==durable.resultId||run.state!=='completed'||
    run.retirementState!=='released'||run.targetDisposition!=='retain-on-success'||
    run.target?.mode!=='owned'||run.target.frameId!==0||
    retained?.tabId!==run.target.tabId||retained.documentId!==run.target.documentId||
    retained.url!==ROOT||retained.origin!==ORIGIN||
    durable.value?.phase!=='prepare'||durable.value?.status!=='draft-prepared'||
    durable.value?.send!==false||durable.value?.conversationUrl!==null||
    durable.value?.promptChars!==row.scope.args.prompt.length||
    !token(installed.installationId)||!Number.isSafeInteger(installed.generation)||
    installed.generation<1)
    fail('PREPARE Run, retained original B, installed pin or unsent result differs');
  const [frame,tab,permission]=await Promise.all([
    api.webNavigation.getFrame({tabId:retained.tabId,frameId:0}),
    api.tabs.get(retained.tabId),
    api.permissions.contains({origins:[ORIGIN+'/*']})
  ]);
  if(permission!==true||frame?.documentId!==retained.documentId||
    frame.url!==ROOT||frame.documentLifecycle!=='active'||frame.errorOccurred||
    tab?.id!==retained.tabId||tab.url!==ROOT||tab.incognito||tab.pendingUrl)
    fail('Original B document is no longer active or authorized');
  if(!same(row.source,row.source)||typeof row.scope.args.prompt!=='string'||
    !row.scope.args.prompt.trim())fail('Original A request or prompt is missing');
  // The next approval must additionally verify the ChatGPT account/Profile.
  // A prepared B with unknown account is never itself a send grant.
  return Object.freeze({prepareRunId:run.runId,prepareRequestId:row.requestId,
    resultId:durable.resultId,tabId:retained.tabId,documentId:retained.documentId,
    url:ROOT,draftSha256:await digestUtf8(row.scope.args.prompt),
    installationId:installed.installationId,generation:installed.generation,
    manifestHash:installed.manifestHash,contentHash:installed.contentHash,
    profileVerified:false});
}
