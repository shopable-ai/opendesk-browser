// OD-AI-WORKFLOW-BRIDGE: fixed-compiled, version-pinned business result adapter.
// This never executes a website script, grants authority or interprets an
// imported package's JavaScript as a validator. Controller owns Run/Result.
import {reviewedChatGPTCreateBusinessAdapter}
  from '../../../task-packs/chatgpt.conversation.create/contracts/installed-result.js';
import {reviewedChatGPTV3Adapter} from './chatgpt-result-adapter-v0.3.js';
import {formatChatGPTCreateDelivery}
  from '../src/chatgpt-conversation-result.js';
import {digestUtf8} from '../../../src/platform/protocol.js';

const TASK_ID='chatgpt.conversation.create';
const VERSIONS=Object.freeze(['0.2.0','0.2.1','0.2.2']);
const ORIGIN='https://chatgpt.com';
const ROOT=ORIGIN+'/';

// Receipt policy belongs to the reviewed business adapter, not the generic
// ingress. A local turn-N key is not an official A message anchor.
export function requiresChatGPTOriginalAProof(request){
  if(request?.taskId!==TASK_ID||!VERSIONS.includes(request.installation?.version)||request.args?.send!==true)return false;
  reviewedChatGPTResultAdapter(request);
  return true;
}

// The read-a correlation names reuse original ledger identities. They are not
// a new workflow or authorization. Legacy rows without a frozen anchor stay unknown.
export function originalAReadbackRequest(row){
  if(!requiresChatGPTOriginalAProof(row?.scope)||!row.originalAAnchorMessageId)return null;
  const intent=row.webDispatchIntent,id=/^[A-Za-z0-9._:-]{8,128}$/u;
  if(!intent||![row.requestId,row.autoGrantId,row.originalAAnchorMessageId,intent.runId,intent.resultId]
    .every(value=>typeof value==='string'&&id.test(value))||
    intent.anchorMessageId!==row.originalAAnchorMessageId||intent.authorizationRef!==row.autoGrantId||
    intent.workflowId!==row.requestId||intent.deliveryKey!==intent.resultId||
    intent.runId!==row.webObservation?.runId||intent.resultId!==row.webObservation?.resultId||
    typeof intent.contentSha256!=='string'||!/^[a-f0-9]{64}$/u.test(intent.contentSha256))return null;
  return {workflowId:intent.workflowId,deliveryKey:intent.deliveryKey,authorizationRef:intent.authorizationRef,
    anchorMessageId:intent.anchorMessageId,contentSha256:intent.contentSha256,sourceUrl:row.source.url};
}

export function originalADispatchIntent(row,requestId,durable,contentSha256){
  return {runId:durable.runId,resultId:durable.resultId,contentSha256,
    ...(row.originalAAnchorMessageId?{anchorMessageId:row.originalAAnchorMessageId,
      workflowId:requestId,deliveryKey:durable.resultId,authorizationRef:row.autoGrantId}:{})};
}

export function assertOriginalADispatchIntent(row,requestId,state,intent){
  if(state!=='dispatching'||!intent||typeof intent!=='object'||Array.isArray(intent)||
    Object.keys(intent).sort().join(',')!==(row.originalAAnchorMessageId?
      'anchorMessageId,authorizationRef,contentSha256,deliveryKey,resultId,runId,workflowId':'contentSha256,resultId,runId')||
    typeof intent.contentSha256!=='string'||!/^[a-f0-9]{64}$/u.test(intent.contentSha256)||
    intent.runId!==row.webObservation?.runId||intent.resultId!==row.webObservation?.resultId||
    typeof intent.runId!=='string'||!intent.runId||typeof intent.resultId!=='string'||!intent.resultId||
    row.originalAAnchorMessageId&&!originalAReadbackRequest({...row,requestId,webDispatchIntent:intent}))
    throw Object.assign(new Error('原 Run/Result、交付内容或锚点授权身份未冻结'),{code:'E_CHAT_DELIVERY_PROOF'});
}

export function assertOriginalAReceipt(row,requestId,{runId,resultId,messageId,contentSha256}){
  if(typeof messageId!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/u.test(messageId)||
    row.webDispatchIntent?.runId!==runId||row.webDispatchIntent?.resultId!==resultId||
    row.webDispatchIntent?.contentSha256!==contentSha256||messageId===row.originalAAnchorMessageId||
    row.originalAAnchorMessageId&&!originalAReadbackRequest({...row,requestId}))
    throw Object.assign(new Error('原交付缺少匹配的官方消息证明'),{code:'E_CHAT_DELIVERY_PROOF'});
}

export function originalAReceiptConfirmed(row){
  const proof=row.webObservation,intent=row.webDispatchIntent;
  return typeof proof?.messageId==='string'&&/^[A-Za-z0-9._:-]{8,128}$/u.test(proof.messageId)&&
    typeof intent?.contentSha256==='string'&&/^[a-f0-9]{64}$/u.test(intent.contentSha256)&&
    proof.contentSha256===intent.contentSha256&&proof.runId===intent.runId&&proof.resultId===intent.resultId;
}

export async function normalizeOriginalADeliveryProof(row,reply,outgoing){
  if(!requiresChatGPTOriginalAProof(row.scope)&&
    !Object.hasOwn(reply.data,'messageId')&&!Object.hasOwn(reply.data,'contentSha256'))return null;
  const {messageId,contentSha256}=reply.data;
  if(typeof messageId!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/u.test(messageId)||
    contentSha256!==await digestUtf8(outgoing.text))
    throw Object.assign(new Error('原对话新增消息身份或内容 SHA-256 不匹配，禁止确认交付'),{code:'E_CHAT_DELIVERY_PROOF'});
  return {messageId,contentSha256};
}

export async function prepareOriginalARecovery(row,durable,outgoing){
  const readback=originalAReadbackRequest(row),intent=row.webDispatchIntent;
  if(!readback||durable.runId!==intent.runId||durable.resultId!==intent.resultId||
    await digestUtf8(outgoing.text)!==intent.contentSha256)
    throw Object.assign(new Error('原持久结果与冻结交付不匹配'),{code:'E_CHAT_DELIVERY_PROOF'});
  return {message:{protocol:outgoing.protocol,kind:'workflow-read-a',...readback},
    proof(reply){
      const data=reply?.data;
      if(reply?.ok===false&&reply.error?.code==='E_CHAT_A_READBACK')
        throw Object.assign(new Error('原 A 官方消息只读核对失败：'+
          String(reply.error.message??'未取得匹配正文').slice(0,1024)+
          '；冻结正文 SHA-256='+intent.contentSha256+'；保持 UNKNOWN，禁止重发'),
        {code:'E_CHAT_DELIVERY_PROOF'});
      if(reply?.ok!==true||data?.readOnly!==true||Object.entries(readback).some(([key,value])=>data[key]!==value))
        throw Object.assign(new Error('只读原消息核对没有返回匹配的官方证明'),{code:'E_CHAT_DELIVERY_PROOF'});
      const proof={messageId:data.messageId,contentSha256:data.contentSha256,aiReplyObserved:false};
      assertOriginalAReceipt(row,row.requestId,{runId:durable.runId,resultId:durable.resultId,...proof});
      return proof;
    }};
}
// WebFlow owns original A delivery, not shared Task result validation.
export function reviewedChatGPTResultAdapter(request){
  if(request?.taskId!==TASK_ID)return null;
  // Historical 0.1.0 is a read-only draft; 0.3.0 retains its distinct
  // reviewed PREPARE/SUBMIT contract and must never use the 0.2.x validator.
  if(request?.installation?.version==='0.1.0')return null;
  if(request?.installation?.version==='0.3.0')return reviewedChatGPTV3Adapter(request);
  const business=reviewedChatGPTCreateBusinessAdapter(request);
  return Object.freeze({...business,format:formatChatGPTCreateDelivery});
}
