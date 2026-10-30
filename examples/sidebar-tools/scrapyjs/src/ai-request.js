export function requireGeneration(value){
  if(!Number.isSafeInteger(value)||value<1)throw Error('AI Provider 身份缺失，请重新读取配置后生成。');
  return value;
}

// One user action owns one request. Cancellation also fences read-only preparation.
export function createAiRequest(request,payload,onInfo=()=>{},pending=null){
  let phase='preparing',cancelled=false,settled=false,dispatched=false,claimed=false;
  const id=payload.requestId;
  return {id,
    get settled(){return settled;},
    get dispatched(){return dispatched;},
    get unknown(){return phase==='unknown';},
    async run(){
      try{
        if(pending){
          try{await pending.claim(id);claimed=true;}catch(error){phase='unknown';throw error;}
        }
        if(cancelled)return null;
        if(JSON.stringify({request:payload.request,context:payload.context}).length>20000)throw Error('发送资料合计超过 20000 字符，请缩短需求、HTML 样本或错误资料；输入已保留。');
        const info=await request('ai.info',{});
        if(cancelled)return null;
        const generation=requireGeneration(info.generation);onInfo(info);
        phase='sent';dispatched=true;
        const result=await request('ai.generate',{...payload,providerGeneration:generation});
        if(cancelled)return null;
        if(result.requestId!==id)throw Error('AI 响应身份不符，未应用。');
        if(requireGeneration(result.providerGeneration)!==generation)throw Error('AI Provider 已变化，请重新生成。');
        return result;
      }catch(error){if(phase==='sent'&&isUnknown(error))phase='unknown';throw error;}
      finally{
        if(phase!=='unknown'){
          phase='settled';
          if(claimed)try{await pending.clear(id);}catch(error){phase='unknown';throw error;}finally{settled=true;}
        }
        settled=true;
      }
    },
    async cancel({release=true}={}){
      cancelled=true;
      if(phase==='preparing'||phase==='settled')return {requestId:id,state:phase==='settled'&&!settled?'unknown':'cancelled'};
      // This operation can prove it never called ai.generate, even when its
      // storage claim committed without a receipt. Clear only its own CAS row;
      // an offline Host cannot know about an undispatched preparation.
      if(!dispatched&&settled){
        if(!release)return {requestId:id,state:'unknown'};
        if(pending)await pending.clear(id);
        phase='settled';claimed=false;
        return {requestId:id,state:'cancelled'};
      }
      phase='unknown'; // Keep the fence while cancellation itself may lose its receipt.
      const reply=await request('ai.cancel',{requestId:id});
      if(reply?.requestId!==id||!['cancelled','completed','failed','unknown'].includes(reply.state))throw Error('停止回执身份或状态无效，原请求仍在等待确认。');
      // A late generate result is not terminal proof after an unknown cancel.
      // During unmount leave the persisted identity for the next instance.
      if(reply.state==='unknown'||!release)phase='unknown';
      else {
        if(claimed)await pending.clear(id);
        phase='settled';
      }
      return reply;
    }
  };
}
export const isUnknown=error=>['E_AI_TIMEOUT','E_AI_UNKNOWN','E_AI_OUTCOME_UNKNOWN','E_TOOL_TIMEOUT','E_TIMEOUT'].includes(error?.code);
