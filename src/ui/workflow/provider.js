// Provider facade for workflow planning only. Execution remains in WorkflowCompiler/RunHost.
// Capabilities below describe OpenDesk adapters, never official OpenAI/Codex fields.
import {requestWorkflowPlan,requestChatCompletionJSON} from './ai-plan.js';

const sources=Object.freeze({
  cloud_responses:Object.freeze({provider:'cloud_responses',transport:'https-responses',
    streaming:false,structuredOutput:true,observation:true,toolCalls:false,
    activeConversation:false,coldResume:false,cancel:false,localAbort:true,
    usage:true,background:false,contextMode:'bounded-client-history'}),
  local_codex:Object.freeze({provider:'local_codex',transport:'native-codex-app-server',
    streaming:true,structuredOutput:true,observation:true,toolCalls:true,
    activeConversation:true,coldResume:'PROBE_REQUIRED',cancel:true,
    usage:false,background:false,contextMode:'native-thread'}),
  custom_https:Object.freeze({provider:'custom_https',transport:'https-chat-completions-legacy',
    streaming:false,structuredOutput:false,observation:true,toolCalls:false,
    activeConversation:false,coldResume:false,cancel:false,localAbort:true,
    usage:false,background:false,contextMode:'stateless'})
});
export function workflowProviderCapabilities(source,localCapability=null) {
  if(!Object.hasOwn(sources,source))throw Object.assign(new Error('未知工作流 Provider'),{code:'E_AI_CONFIG'});
  return Object.freeze({...sources[source],
    ...(source==='local_codex'?{coldResume:localCapability?.resumeSupported===true,
      readyForTurn:localCapability?.readyForTurn===true}: {})});
}
export function createWorkflowProviderFacade({localPlanner,conversationPlanner=localPlanner,
  taskConversationPlanner=conversationPlanner}) {
  if(!localPlanner||typeof localPlanner.plan!=='function')
    throw Object.assign(new Error('缺少现有 Codex 管理器'),{code:'E_AI_CONFIG'});
  return Object.freeze({
    probeCapabilities: (source,localCapability)=>workflowProviderCapabilities(source,localCapability),
    // Cross-extension structured inference; business actions are verified and
    // executed by the consumer, never by a Provider, RunHost or model text.
    async generateStructured({source,request,instructions,context={},settings={},
      scope='bookmark',signal,onEvent,fetchImpl=globalThis.fetch}={}) {
      if(!Object.hasOwn(sources,source))throw Object.assign(Error('未知 AI 来源'),{code:'E_AI_CONFIG'});
      if(typeof request!=='string'||!request.trim()||request.length>4000||
        typeof instructions!=='string'||!instructions.trim()||instructions.length>10000)
        throw Object.assign(Error('请输入有效的对话请求'),{code:'E_AI_REQUEST'});
      const input=JSON.stringify({request,context});
      if(input.length>20000)throw Object.assign(Error('本次上下文过长'),{code:'E_AI_INPUT_LIMIT'});
      if(source==='local_codex') {
        const planner=scope==='tasks'?taskConversationPlanner:conversationPlanner;
        if(typeof planner?.planStructured!=='function')
          throw Object.assign(Error('当前 Codex 还不支持结构化对话'),{code:'E_AI_UNSUPPORTED'});
        const proposal=await planner.planStructured({
          input:instructions+'\n'+input,signal,onEvent
        });
        return {proposal,metadata:{provider:'local_codex',usage:null}};
      }
      if(source==='cloud_responses'){
        const {requestWorkflowResponse}=await import('./responses.js');
        return await requestWorkflowResponse({endpoint:settings.endpoint,apiKey:settings.apiKey,
          model:settings.model,instructions,input,signal,fetchImpl});
      }
      return await requestChatCompletionJSON({endpoint:settings.endpoint,apiKey:settings.apiKey,
        model:settings.model,instructions,input,signal,fetchImpl});
    },
    async generateWorkflow({source,request,workflow,target,observationReceipt=null,
      settings={},consent=null,signal,onEvent,onApproval,history=[],fetchImpl,jsonSchema=null}) {
      if(!Object.hasOwn(sources,source))throw Object.assign(new Error('未知工作流 Provider'),{code:'E_AI_CONFIG'});
      if(source==='local_codex') {
        let completedTurnId=null;
        const proposal=await localPlanner.plan({request,workflow,target,consent,signal,onApproval,verifiedHistory:history,
          onEvent:event=>{
            if(event?.type==='turn.completed'&&event.status==='completed'&&
               typeof event.turnId==='string')completedTurnId=event.turnId;
            onEvent?.(event);
          }});
        const snapshot=localPlanner.snapshot();
        return {proposal,metadata:{provider:'local_codex',sessionId:snapshot.sessionId||null,
          threadId:snapshot.threadId||null,turnId:completedTurnId,
          usage:null,termination:'completed'}};
      }
      if(source==='custom_https'&&(!target||!observationReceipt))
        throw Object.assign(new Error('旧版 HTTPS 工作流也必须取得本轮可信网页观察'),{code:'E_AI_OBSERVATION_REQUIRED'});
      let metadata={provider:source,usage:null};
      const proposal=await requestWorkflowPlan({
        endpoint:settings.endpoint,apiKey:settings.apiKey,model:settings.model,
        request,workflow,signal,fetchImpl,protocol:source==='cloud_responses'?'responses':'chat_completions',
        observationReceipt,
        target,
        history:source==='cloud_responses'?history:[],
        jsonSchema:source==='cloud_responses'?jsonSchema:null,
        onProviderResult:value=>{metadata={...metadata,...value};}
      });
      return {proposal,metadata};
    },
    cancel: source=>source==='local_codex'?localPlanner.cancel():null,
    resume: (source,args)=>source==='local_codex'?localPlanner.resume(args):
      Promise.reject(Object.assign(new Error('此 Provider 不支持服务端恢复'),{code:'E_AI_UNSUPPORTED'}))
  });
}
