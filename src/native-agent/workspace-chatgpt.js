import {WEBFLOW_TASK_INTENT_PROTOCOL,WEBFLOW_TASK_INTENT_V2_PROTOCOL,
  validateWebFlowTaskIntent,validateWebFlowTaskIntentV2} from './chatgpt-task-request.js';
import {assertChatGPTTaskRoute} from '../../projects/webflow/trusted/chatgpt-conversation-route.js';

import {readChatGPTEdit as readChatGPTEditCore} from './workspace-chatgpt-core.js';
export {isChatGPTURL,chatGPTConversationId,inspectChatGPTEditsOnPage,
  fillChatGPTComposerOnPage,verifyChatGPTComposerOnPage,assertChatGPTTarget,
  fillChatGPTComposer} from './workspace-chatgpt-core.js';

// Preserve the original Task-facing reader contract. The generic document
// read completes first; WebFlow candidates retain the same strict validation.
export async function readChatGPTEdit(api,target,requestId,{identityOnly=false,...options}={}){
  const result=await readChatGPTEditCore(api,target,requestId,{identityOnly,...options});
  if(!identityOnly&&options.taskIntent){
    if(options.protocols?.includes(WEBFLOW_TASK_INTENT_PROTOCOL)&&
      JSON.parse(result.blocks[0]).protocol===WEBFLOW_TASK_INTENT_PROTOCOL)
      validateWebFlowTaskIntent(result.blocks[0]);
    if(options.protocols?.includes(WEBFLOW_TASK_INTENT_V2_PROTOCOL)&&
      JSON.parse(result.blocks[0]).protocol===WEBFLOW_TASK_INTENT_V2_PROTOCOL)
      validateWebFlowTaskIntentV2(result.blocks[0]);
  }
  return result;
}

// Revalidate the durable candidate at the original final submission fence.
// The existing reader owns the exact document, latest/unique complete answer,
// explicit marker and strict protocol checks; never replace it with page ACKs.
export async function assertWebFlowReplyCandidate(api,target,candidate){
  const mismatch=()=>({code:'E_BRIDGE_CONTEXT',message:'提交前回答与已保存的任务候选不一致，未运行。',outcome:'NOT_DISPATCHED'});
  if(!candidate||Object.keys(candidate).sort().join(',')!=='answerKey,candidateId,text,turnKey'||
    typeof candidate.turnKey!=='string'||!candidate.turnKey||candidate.turnKey.length>128||
    typeof candidate.answerKey!=='string'||!candidate.answerKey||candidate.answerKey.length>2048)
    throw mismatch();
  const {candidateId,text,turnKey,answerKey}=candidate;
  const v2=JSON.parse(text).protocol===WEBFLOW_TASK_INTENT_V2_PROTOCOL;
  const parser=v2?validateWebFlowTaskIntentV2:validateWebFlowTaskIntent;
  if(parser(text).candidateId!==candidateId)throw mismatch();
  const current=await readChatGPTEdit(api,target,undefined,{taskIntent:true,requireComplete:true,
    protocols:[v2?WEBFLOW_TASK_INTENT_V2_PROTOCOL:WEBFLOW_TASK_INTENT_PROTOCOL],readUserMessage:true});
  assertChatGPTTaskRoute({userText:current.userText,answerText:text});
  if(current.turnKey!==turnKey||current.answerKey!==answerKey||current.blocks[0]!==text)
    throw mismatch();
}
