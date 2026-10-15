// Provider facade for workflow planning only. Execution remains in WorkflowCompiler/RunHost.
// Capabilities below describe OpenDesk adapters, never official OpenAI/Codex fields.
import {requestWorkflowPlan} from './ai-plan.js';

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
    streaming:false,structuredOutput:false,observation:false,toolCalls:false,
    activeConversation:false,coldResume:false,cancel:false,localAbort:true,
    usage:false,background:false,contextMode:'stateless'})
});
export function workflowProviderCapabilities(source,localCapability=null) {
  if(!Object.hasOwn(sources,source))throw Object.assign(new Error('未知工作流 Provider'),{code:'E_AI_CONFIG'});
  return Object.freeze({...sources[source],
    ...(source==='local_codex'?{coldResume:localCapability?.resumeSupported===true,
      readyForTurn:localCapability?.readyForTurn===true}: {})});
}
export function createWorkflowProviderFacade({localPlanner}) {
  if(!localPlanner||typeof localPlanner.plan!=='function')
    throw Object.assign(new Error('缺少现有 Codex 管理器'),{code:'E_AI_CONFIG'});
  return Object.freeze({
    probeCapabilities: (source,localCapability)=>workflowProviderCapabilities(source,localCapability),
    async generateWorkflow({source,request,workflow,target,observationReceipt=null,
      settings={},consent=null,signal,onEvent,onApproval,history=[],fetchImpl,jsonSchema=null}) {
      if(!Object.hasOwn(sources,source))throw Object.assign(new Error('未知工作流 Provider'),{code:'E_AI_CONFIG'});
      if(source==='local_codex') {
        let completedTurnId=null;
        const proposal=await localPlanner.plan({request,workflow,target,consent,signal,onApproval,
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
      let metadata={provider:source,usage:null};
      const proposal=await requestWorkflowPlan({
        endpoint:settings.endpoint,apiKey:settings.apiKey,model:settings.model,
        request,workflow,signal,fetchImpl,protocol:source==='cloud_responses'?'responses':'chat_completions',
        observationReceipt:source==='cloud_responses'?observationReceipt:null,
        target:source==='cloud_responses'?target:null,
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
