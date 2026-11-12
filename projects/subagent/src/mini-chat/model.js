import {taskPrompt,taskRequest,taskRequestId,verifiedResult} from '../contract.js';

// Deliberately inject a trusted, host-owned transport. A USER_SCRIPT MUST NOT
// implement it with window.postMessage, custom events or a page-provided object.
export function createSession(options={}){
  const {transport,makeId=()=>crypto.randomUUID(),onChange=()=>{},assertCurrent=()=>true,initialRequest}=options;
  const restoring=Object.hasOwn(options,'initialRequest');
  let current=Object.freeze({status:restoring?'restoring':'idle',requestId:null,answer:'',conversationUrl:null,
    message:restoring?'正在核对原任务；不会重新执行。':'未开始'});
  let disposed=false,reading=null;
  // A local lifecycle fence, never authorization. A changed source cannot revive
  // this instance; the caller retires its UI and the Host owns any recovery.
  const active=()=>{
    if(disposed)return false;
    try{if(assertCurrent()!==false)return true;}catch{}
    disposed=true;return false;
  };
  const pending=requestId=>active()&&current.requestId===requestId&&['running','unknown'].includes(current.status);
  const publish=patch=>{if(active()){current=Object.freeze({...current,...patch});onChange(current);}return current;};
  const unavailable=()=>({status:'failed',message:'缺少可信跨扩展任务桥。未创建对话，也未发送消息。'});
  const approvalMessage='请在 OpenDesk 原任务审批中确认';
  // Production must supply the original trusted lookup, never page storage.
  // Adopt only its request ID; even a restored answer must be read from Host.
  const ready=restoring?Promise.resolve(initialRequest).then(record=>{
    if(!active())return current;
    if(record===null)return publish({status:'idle',message:'未开始'});
    if(!record||typeof record!=='object'||Array.isArray(record)||
      Reflect.ownKeys(record).length!==1||!Object.hasOwn(record,'requestId'))
      throw new Error('Invalid original request');
    return publish({status:'unknown',requestId:taskRequestId(record.requestId),
      message:'已恢复原请求；仅查询原任务。'});
  }).catch(()=>publish({status:'unknown',message:'无法核对原任务；为避免重复执行，创建已停用。'})):
    Promise.resolve(current);
  async function create(prompt,event){
    if(!active()||current.status!=='idle')return current;
    try{taskPrompt(prompt);}catch(error){return publish({status:'idle',message:error.message});}
    if(typeof transport?.start!=='function'||typeof transport?.read!=='function')return publish(unavailable());
    let request;
    try{request=taskRequest({requestId:makeId(),prompt});}
    catch(error){return publish({status:'failed',message:error.message});}
    publish({status:'running',requestId:request.requestId,message:'执行中'});
    if(!pending(request.requestId))return current;
    try{
      // start only once for this request. Never retry even on a transport error.
      const receipt=await transport.start(request,event);
      if(!pending(request.requestId))return current;
      if(receipt?.requestId!==request.requestId||receipt?.accepted!==true)
        return publish({status:'unknown',message:'请求结果待核对；不会重新发送。'});
      if(receipt.phase==='awaiting-approval')return publish({message:approvalMessage});
      return current.status==='running'?publish({status:'running',message:'执行中'}):current;
    }catch{
      if(!pending(request.requestId))return current;
      return publish({status:'unknown',message:'请求回执未知；只允许查询原请求。'});
    }
  }
  async function read(){
    if(!current.requestId||!pending(current.requestId)||
      typeof transport?.read!=='function')return current;
    if(reading)return reading;
    const requestId=current.requestId;
    // Assign the in-flight slot before invoking read, including a synchronous
    // throw or a reentrant onChange callback. Always release that same slot.
    const query=Promise.resolve().then(async()=>{try{
      if(!pending(requestId))return current;
      const result=await transport.read({requestId});
      if(!pending(requestId))return current;
      if(result?.requestId!==requestId)return publish({status:'unknown',message:'结果身份不匹配，待核对。'});
      if(result?.outcome==='pending')return publish({message:result.phase==='awaiting-approval'?
        approvalMessage:'原任务处理中'});
      if(result?.outcome==='failed'&&result.trust==='host-verified')
        return publish({status:'failed',message:'任务失败；不会自动补发。'});
      if(result?.outcome==='unknown')return publish({status:'unknown',message:'发送或结果未确认，只读核对。'});
      if(result?.outcome!=='completed')return current;
      const proof=verifiedResult(result,requestId);
      return publish({status:'completed',message:'已完成',answer:proof.answer,
        conversationUrl:proof.conversationUrl});
    }catch{
      if(!pending(requestId))return current;
      return publish({status:'unknown',message:'查询失败；原任务仍保留，不会重新发送。'});
    }}).finally(()=>{if(reading===query)reading=null;});
    reading=query;
    return reading;
  }
  function dispose(){disposed=true;}
  return Object.freeze({create,read,dispose,ready,get snapshot(){return current;},
    get isAvailable(){return !disposed&&typeof transport?.start==='function'&&typeof transport?.read==='function';}});
}
