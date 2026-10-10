import {AGENT_MAX_BYTES,AgentBridgeError,agentObject} from './protocol.js';

export const WORKFLOW_AI_PROTOCOL='opendesk.workflow-ai.v1';
export const WORKFLOW_AI_METHODS=Object.freeze([
  'ai.capabilities.read','ai.session.open','ai.plan.start','ai.events.read',
  'ai.approval.answer','ai.plan.cancel','ai.session.close'
]);
export const WORKFLOW_AI_LOCAL_METHODS=Object.freeze(['ai.connection.read','ai.connection.enable']);
export const workflowAIError=(code,message,outcome='NOT_DISPATCHED')=>new AgentBridgeError(code,message,outcome);
export const workflowAIBytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export const workflowAIId=value=>typeof value==='string'&&/^[a-zA-Z0-9._:-]{1,100}$/.test(value);

export function validateWorkflowAIRequest(message) {
  if(!agentObject(message)||message.type!=='native-agent.ai.request'||message.protocol!==WORKFLOW_AI_PROTOCOL||
    !workflowAIId(message.requestId)||!Number.isSafeInteger(message.clientGeneration)||message.clientGeneration<1||
    ![...WORKFLOW_AI_METHODS,...WORKFLOW_AI_LOCAL_METHODS].includes(message.method)||!agentObject(message.params)||
    (message.sessionId!=null&&!workflowAIId(message.sessionId))||
    Object.keys(message).some(key=>!['type','protocol','requestId','clientGeneration','registrationId','method','params','sessionId'].includes(key)))
    throw workflowAIError('E_AI_SCHEMA','AI 请求格式或协议不受支持');
  if(workflowAIBytes(message)>AGENT_MAX_BYTES-1024)throw workflowAIError('E_AI_LIMIT','AI 请求超过 Native 消息上限');
  return message;
}

export function unavailableWorkflowAI(state) {
  return {sourceKey:'local_codex',state,cliInstalled:false,authState:'unknown',appServerCompatible:false,
    readyForTurn:false,inferenceVerified:false,resumeSupported:false,supportedTools:[],onlineInference:true};
}
