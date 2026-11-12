// Fixed-compiled Subagent consumer of the ORIGINAL Controller Result.
// This module is NOT a Page USER_SCRIPT capability or a window message handler.
// Only a trusted Host may construct it. Both callbacks must use the original
// Page/Task Authority and persisted delegation; none may come from page data.
import {verifyChatGPTTaskDurableResult}
  from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {verifiedResult} from '../src/contract.js';

const TASK_ID='chatgpt.conversation.create',VERSION='0.2.0',ROOT='https://chatgpt.com/';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REF=/^[A-Za-z0-9._:-]{8,128}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const ref=value=>typeof value==='string'&&REF.test(value);
const sha=value=>typeof value==='string'&&SHA.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
const fail=(message,code='E_SUBAGENT_RESULT')=>{throw Object.assign(new Error(message),{code});};

function assertBinding(binding,logicalRequestId){
  const request=binding?.request,pin=request?.installation,run=binding?.snapshot?.run;
  if(!plain(binding)||binding.logicalRequestId!==logicalRequestId||
    !plain(request)||!ref(request.requestId)||
    request.taskId!==TASK_ID||request.targetUrl!==ROOT||
    !plain(request.args)||request.args.send!==true||
    Object.keys(request.args).sort().join(',')!=='prompt,send'||
    !plain(pin)||pin.version!==VERSION||pin.scriptId!==`task:${TASK_ID}:${VERSION}`||
    pin.revision!==1||!sha(pin.manifestHash)||!sha(pin.contentHash)||
    !ref(pin.installationId)||!Number.isSafeInteger(pin.generation)||pin.generation<1||
    !plain(binding.resolvedInstallation)||
    !ref(binding.runId)||!ref(binding.resultId))
    fail('The original delegation, request and current installation are required');
  if(run?.tag!=='controller-run'||run.runId!==binding.runId||
    run.resultId!==binding.resultId||run.requestId!==request.requestId||
    run.workerRetired!==true||run.retainedFrom!==undefined||
    run.taskInstallation?.taskId!==TASK_ID||run.taskInstallation.version!==VERSION||
    run.taskInstallation.manifestHash!==pin.manifestHash||
    run.taskInstallation.installationId!==pin.installationId||
    run.taskInstallation.generation!==pin.generation)
    fail('The result is not bound to the original single owned Run and installation');
  return request;
}

/**
 * readOriginalRun({requestId}) resolves a logical Mini Chat UUID through the
 * existing persisted delegation. Its trusted return value is:
 * {logicalRequestId, request, resolvedInstallation, runId, resultId, snapshot}.
 * request.requestId is the ORIGINAL Controller admission ID, which may differ
 * from the Mini Chat UUID; request also holds its saved args/target/install pin.
 * runId/resultId must come from that original record, never a caller override.
 * snapshot must come from Authority.snapshotControllerRun for that request.
 * resolvedInstallation must come from the current Authority Task resolution.
 * assertAuthorized must check the source Page instance and Task read authority
 * before and after the asynchronous read, returning true only when still valid.
 * No snapshot, installation, trust claim, result, or callback is accepted by read.
 * Construction and validation do not themselves authorize any operation.
 */
export function createSubagentResultReader({readOriginalRun,assertAuthorized}={}){
  if(typeof readOriginalRun!=='function'||typeof assertAuthorized!=='function')
    fail('Original trusted result reader and authorization guard required','E_SUBAGENT_AUTHORITY');
  const authorize=async context=>{
    if(await assertAuthorized(context)!==true)
      fail('Original Page or Task result access is no longer authorized','E_SUBAGENT_AUTHORITY');
  };
  async function read(query){
    if(!plain(query)||Reflect.ownKeys(query).length!==1||
      !Object.hasOwn(query,'requestId'))
      fail('Only the original logical request ID can be queried');
    const requestId=query.requestId;
    if(typeof requestId!=='string'||!UUID.test(requestId))
      fail('Only the original logical request ID can be queried');
    await authorize(Object.freeze({requestId}));
    // A rejected/unknown Authority read propagates. There is no fallback to a
    // cached success, page-supplied payload, new Run, B2, or retry of a send.
    const binding=structuredClone(await readOriginalRun(Object.freeze({requestId})));
    const request=assertBinding(binding,requestId);
    const durable=verifyChatGPTTaskDurableResult(binding.snapshot,binding.runId,
      binding.resolvedInstallation,request);
    if(durable.runId!==binding.runId||durable.resultId!==binding.resultId)
      fail('Original Run/Result identity changed during verification');
    const value=durable.value;
    const result=Object.freeze({trust:'host-verified',requestId,
      controllerRequestId:request.requestId,runId:durable.runId,resultId:durable.resultId,
      outcome:'completed',send:value.send,status:value.status,
      userMessageRef:value.userMessageRef,assistantMessageRef:value.assistantMessageRef,
      replyText:value.replyText,conversationUrl:value.conversationUrl});
    // Share the consumer contract, without treating its trust string as an
    // authentication mechanism. Only the verified durable value supplies text.
    verifiedResult(result,requestId);
    await authorize(Object.freeze({requestId,controllerRequestId:request.requestId,
      runId:durable.runId,resultId:durable.resultId,
      installation:Object.freeze({...request.installation})}));
    return result;
  }
  return Object.freeze({read});
}
