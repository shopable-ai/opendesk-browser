// OD-AI-WORKFLOW-BRIDGE: trusted read-only B receipt for chat-handoff.v2.
// Reuses the ORIGINAL Controller and the existing fixed Task result verifier.
// No task dispatch, authorization grant, delivery to A or retry is possible here.
import {parseChatHandoff} from '../src/chat-handoff-contract.js';
import {verifyChatGPTTaskDurableResult} from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {digestUtf8} from '../../../src/platform/protocol.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const check=(v,code='E_CHAT_RECEIPT')=>{if(!v)fail(code);};
const token=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{8,128}$/u.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const same=(a,b)=>['adapter','profileId','conversationId','turnId'].every(k=>a?.[k]===b?.[k]);

export async function attestChatHandoffBReply({handoffJson,trustedScope,
  approvedAt,operationRef,request,taskRunId,readController,assertLiveSource,
  verifyTargetProfile,clock=Date.now}={}){
  // approvedAt is the original trusted admission timestamp, not a new grant.
  // An expired operation may be inspected read-only but NEVER resubmitted.
  check(Number.isSafeInteger(approvedAt)&&approvedAt>0&&typeof clock==='function'&&
    token(operationRef)&&typeof readController==='function'&&
    typeof assertLiveSource==='function'&&typeof verifyTargetProfile==='function',
    'E_CHAT_RECEIPT_OWNER');
  const {expectedPromptSha256,...expected}=trustedScope??{};
  const contract=parseChatHandoff(handoffJson,{...expected,now:approvedAt});
  check(request?.taskId==='chatgpt.conversation.create'&&
    request.targetUrl==='https://chatgpt.com/'&&request.requestId===operationRef&&
    request.installation?.version==='0.2.0'&&
    request.installation.scriptId==='task:chatgpt.conversation.create:0.2.0'&&
    token(request.installation.installationId)&&
    Number.isSafeInteger(request.installation.generation)&&request.installation.generation>0&&
    sha(request.installation.manifestHash)&&sha(request.installation.contentHash)&&
    request.args?.send===true&&typeof request.args.prompt==='string',
    'E_CHAT_RECEIPT_SCOPE');
  check(sha(expectedPromptSha256)&&
    await digestUtf8(request.args.prompt)===expectedPromptSha256,
    'E_CHAT_RECEIPT_PROMPT');
  check(same(await assertLiveSource(),contract.source),'E_CHAT_RECEIPT_SOURCE');
  let runId=taskRunId;
  if(!runId){
    const list=await readController({});
    const matched=list?.runs?.filter(row=>row?.requestId===operationRef&&
      row?.scriptId===request.installation.scriptId);
    check(matched?.length===1&&token(matched[0].runId),'E_CHAT_RECEIPT_UNKNOWN');
    runId=matched[0].runId;
  }
  check(token(runId),'E_CHAT_RECEIPT_UNKNOWN');
  const snapshot=await readController({runId}),run=snapshot?.run;
  check(run?.requestId===operationRef&&run.runId===runId&&
    run.targetDisposition==='retain-on-success'&&run.target?.mode==='owned'&&
    run.target.frameId===0&&Number.isSafeInteger(run.target.tabId)&&
    token(run.target.documentId)&&run.target.allowedOrigin==='https://chatgpt.com'&&
    run.retainedTarget?.tabId===run.target.tabId&&
    run.retainedTarget.documentId===run.target.documentId&&
    run.retainedTarget.origin==='https://chatgpt.com',
    'E_CHAT_RECEIPT_TARGET');
  const expectedProfileId=contract.target.profileId;
  const account=()=>verifyTargetProfile({tabId:run.target.tabId,
    documentId:run.target.documentId,expectedProfileId});
  check(await account()===expectedProfileId,'E_CHAT_RECEIPT_PROFILE');
  // The fixed-compiled business adapter owns the B target/result binding.
  // Preserve all other adapter errors, but expose its proven retained-target
  // mismatch through the handoff receipt's existing identity error code.
  let verified;
  try{verified=verifyChatGPTTaskDurableResult(snapshot,runId,request.installation,request);}
  catch(error){
    if(error?.code==='E_BRIDGE_RESULT'&&error?.failureKind==='retained-target-mismatch')
      fail('E_CHAT_RECEIPT_IDENTITY');
    throw error;
  }
  const value=verified.value;
  check(value.send===true&&value.status==='reply-complete'&&
    value.conversationUrl===run.retainedTarget.url,'E_CHAT_RECEIPT_IDENTITY');
  const replySha256=await digestUtf8(value.replyText);
  check(same(await assertLiveSource(),contract.source),'E_CHAT_RECEIPT_SOURCE');
  check(await account()===expectedProfileId,'E_CHAT_RECEIPT_PROFILE');
  return Object.freeze({format:'opendesk.workflow.chat-b-receipt.v1',readOnly:true,
    workflowId:contract.workflowId,stepId:contract.stepId,handoffId:contract.handoffId,
    source:Object.freeze({...contract.source}),operationRef,runId,
    resultId:verified.resultId,installationId:request.installation.installationId,
    conversationId:value.conversationId,conversationUrl:value.conversationUrl,
    userMessageRef:value.userMessageRef,assistantMessageRef:value.assistantMessageRef,
    replySha256,replyText:value.replyText,observedAt:clock()});
}
