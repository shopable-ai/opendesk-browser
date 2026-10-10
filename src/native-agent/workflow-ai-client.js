import {FoundationError,newId} from '../platform/protocol.js';
import {WORKFLOW_AI_PROTOCOL,WORKFLOW_AI_METHODS,WORKFLOW_AI_LOCAL_METHODS,workflowAIBytes} from './workflow-ai-protocol.js';

// Transport only. Uses the original authenticated Host Port, never another owner.
export function createWorkflowAIClient({timeoutMs=40000}={}) {
  let port=null,registrationId=null,bound=false,generation=0,disposed=false;
  const pending=new Map(),listeners=new Set();
  const failure=(code,message)=>new FoundationError(code,message);
  function finish(id,data,error) {
    const row=pending.get(id);if(!row)return;
    pending.delete(id);clearTimeout(row.timer);
    if(error)row.reject(failure(error.code||'E_AI_PROTOCOL',error.message||'AI 连接没有可信回执'));
    else row.resolve(data);
  }
  function publish(state){for(const listener of listeners)try{listener(state);}catch{}}
  function disconnect() {
    generation++;bound=false;port=null;registrationId=null;
    for(const id of pending.keys())finish(id,null,{code:'E_AI_DISCONNECTED',message:'本机 AI 连接已关闭；未重发请求'});
    publish({state:'DISCONNECTED',nativeConnected:false,readyForTurn:false});
  }
  function post(id,row) {
    if(!bound||row.sent||row.generation!==generation)return;
    row.sent=true;
    try{port.postMessage({type:'native-agent.ai.request',protocol:WORKFLOW_AI_PROTOCOL,registrationId,
      requestId:id,clientGeneration:generation,method:row.method,params:row.params,...(row.sessionId?{sessionId:row.sessionId}:{})});}
    catch{finish(id,null,{code:'E_AI_DISCONNECTED',message:'本机 AI 请求未获得可信回执；不会自动重发'});}
  }
  function receive(message) {
    if(message?.registrationId!==registrationId)return false;
    if(message.type==='host-bound') {bound=true;for(const [id,row] of pending)post(id,row);return true;}
    if(message.type==='native-agent.ai.state'&&message.protocol===WORKFLOW_AI_PROTOCOL){publish(message.state);return true;}
    if(message.type!=='native-agent.ai.response')return false;
    const row=pending.get(message.requestId);
    if(!row||row.generation!==generation||message.clientGeneration!==generation)return true;
    if(message.protocol!==WORKFLOW_AI_PROTOCOL||Object.hasOwn(message,'result')===Object.hasOwn(message,'error')||
      (row.sessionId&&message.sessionId!==row.sessionId))
      finish(message.requestId,null,{code:'E_AI_PROTOCOL',message:'AI 回执身份不一致'});
    else finish(message.requestId,message.result,message.error);
    return true;
  }
  function request(method,params={},sessionId=null) {
    if(disposed||!port)return Promise.reject(failure('E_AI_DISCONNECTED','请先连接受信任的 OpenDesk'));
    if(![...WORKFLOW_AI_METHODS,...WORKFLOW_AI_LOCAL_METHODS].includes(method)||!params||typeof params!=='object'||Array.isArray(params))
      return Promise.reject(failure('E_AI_SCHEMA','不支持的 AI 方法'));
    let frozen;
    try{frozen=structuredClone(params);if(workflowAIBytes(frozen)>58*1024)throw Error();}
    catch{return Promise.reject(failure('E_AI_LIMIT','AI 输入超过允许大小或无法冻结'));}
    const control=method==='ai.plan.cancel'||method==='ai.session.close';
    const inLane=[...pending.values()].filter(row=>(row.method==='ai.plan.cancel'||row.method==='ai.session.close')===control).length;
    if(inLane>=(control?2:8))return Promise.reject(failure('E_AI_LIMIT','AI 待处理请求过多'));
    const id=newId();return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(id,null,{code:'E_AI_OUTCOME_UNKNOWN',message:'AI 请求超时，结果未知；没有重新发送'}),timeoutMs);
      const row={method,params:frozen,sessionId,resolve,reject,timer,generation,sent:false};
      pending.set(id,row);post(id,row);
    });
  }
  return {request,receive,disconnect,
    connect(next,id){if(disposed)return;disconnect();port=next;registrationId=id;bound=false;},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    snapshot:()=>({pending:pending.size,timers:pending.size,subscriptions:listeners.size}),
    dispose(){if(disposed)return;disposed=true;disconnect();listeners.clear();}};
}
