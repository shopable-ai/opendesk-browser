import {taskPrompt,taskRequest,verifiedResult} from '../contract.js';

// Deliberately inject a trusted, host-owned transport. A USER_SCRIPT MUST NOT
// implement it with window.postMessage, custom events or a page-provided object.
export function createSession({transport,makeId=()=>crypto.randomUUID(),onChange=()=>{}}={}){
  let current=Object.freeze({status:'idle',requestId:null,answer:'',conversationUrl:null,message:'未开始'});
  let disposed=false,reading=null;
  const publish=patch=>{if(!disposed){current=Object.freeze({...current,...patch});onChange(current);}return current;};
  const unavailable=()=>({status:'failed',message:'缺少可信跨扩展任务桥。未创建对话，也未发送消息。'});
  async function create(prompt){
    if(disposed||current.status!=='idle')return current;
    try{taskPrompt(prompt);}catch(error){return publish({status:'idle',message:error.message});}
    if(typeof transport?.start!=='function'||typeof transport?.read!=='function')return publish(unavailable());
    let request;
    try{request=taskRequest({requestId:makeId(),prompt});}
    catch(error){return publish({status:'failed',message:error.message});}
    publish({status:'running',requestId:request.requestId,message:'执行中'});
    try{
      // start only once for this request. Never retry even on a transport error.
      const receipt=await transport.start(request);
      if(receipt?.requestId!==request.requestId||receipt?.accepted!==true)
        return publish({status:'unknown',message:'请求结果待核对；不会重新发送。'});
      return current.status==='running'?publish({status:'running',message:'执行中'}):current;
    }catch{
      return publish({status:'unknown',message:'请求回执未知；只允许查询原请求。'});
    }
  }
  async function read(){
    if(disposed||!current.requestId||!['running','unknown'].includes(current.status)||
      typeof transport?.read!=='function')return current;
    if(reading)return reading;
    const requestId=current.requestId;
    reading=(async()=>{try{
      const result=await transport.read({requestId});
      if(disposed||current.requestId!==requestId)return current;
      if(result?.requestId!==requestId)return publish({status:'unknown',message:'结果身份不匹配，待核对。'});
      if(result?.outcome==='failed'&&result.trust==='host-verified')
        return publish({status:'failed',message:'任务失败；不会自动补发。'});
      if(result?.outcome==='unknown')return publish({status:'unknown',message:'发送或结果未确认，只读核对。'});
      if(result?.outcome!=='completed')return current;
      const proof=verifiedResult(result,requestId);
      return publish({status:'completed',message:'已完成',answer:proof.answer,
        conversationUrl:proof.conversationUrl});
    }catch{
      return publish({status:'unknown',message:'查询失败；原任务仍保留，不会重新发送。'});
    }finally{reading=null;}})();
    return reading;
  }
  function dispose(){disposed=true;}
  return Object.freeze({create,read,dispose,get snapshot(){return current;},
    get isAvailable(){return typeof transport?.start==='function'&&typeof transport?.read==='function';}});
}
