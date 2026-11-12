import {taskRequest,taskRequestId,verifiedResult} from './contract.js';

const fail=()=>{throw Object.assign(new Error('原可信任务请求或结果不可核对'),{code:'E_SUBAGENT_TRANSPORT'});};
// The installed-program loader supplies this client in a unique USER_SCRIPT
// world. Main never accepts a website global, DOM event payload or callback as
// this argument. Only the original Task approval UI may submit a Controller Run.
export function createMiniChatTransport(client){
  if(!client||['request','read','restore'].some(key=>typeof client[key]!=='function'))fail();
  return Object.freeze({
    async start(value,event){
      const request=taskRequest(value);
      const reply=await client.request(event,{requestId:request.requestId,
        taskId:'chatgpt.conversation.create',params:{prompt:request.prompt,send:true}});
      if(reply?.requestId!==request.requestId||reply.accepted!==true)fail();
      return Object.freeze({requestId:request.requestId,accepted:true,phase:'awaiting-approval'});
    },
    async read({requestId}){
      taskRequestId(requestId);
      const reply=await client.read({requestId});
      if(reply?.requestId!==requestId)fail();
      if(reply.projection){
        if(reply.state!=='completed'||reply.runId!==reply.projection.runId||
          reply.resultId!==reply.projection.resultId)fail();
        // This projection came from the original SW's registered adapter,
        // after its original Run/Result and source authorization checks.
        verifiedResult(reply.projection,requestId);
        return reply.projection;
      }
      if(['pending-approval','prepared'].includes(reply.state))
        return {requestId,outcome:'pending',phase:'awaiting-approval'};
      if(['preparing','running','submitted','settling'].includes(reply.state))
        return {requestId,outcome:'pending'};
      if(reply.state==='failed'||reply.state==='cancelled')
        return {requestId,outcome:'failed',trust:'host-verified'};
      // A Controller completed row without the verified full projection is
      // never a completed business result. No branch retries a request/send.
      return {requestId,outcome:'unknown'};
    },
    async restore(){
      const reply=await client.restore();
      if(reply?.requestId===null&&reply.state==='idle')return null;
      return Object.freeze({requestId:taskRequestId(reply?.requestId)});
    }
  });
}
