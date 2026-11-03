export function requireGeneration(value){
  if(!Number.isSafeInteger(value)||value<1)throw Error('AI Provider 身份缺失，请重新读取配置后生成。');
  return value;
}

// One user action owns one request. Cancellation also fences read-only preparation.
export function createAiRequest(request,payload,onInfo=()=>{},pending=null,prepareAI=null,pagePreparation=null){
  let phase='preparing',cancelled=false,settled=false,dispatched=false,claimed=false;
  let preparation=null,preparationClosed=false,claimUncertain=false;
  let cleanup=null,terminalReply=null;
  const id=payload.requestId;
  let generation;
  async function preparePayload(){
    if(cancelled||preparationClosed)return null;
    if(pending){
      try{await pending.claim(id);claimed=true;}catch(error){claimUncertain=true;phase='unknown';throw error;}
    }
    if(cancelled||preparationClosed)return null;
    const context=pagePreparation?await pagePreparation.prepare(payload.context):payload.context;
    if(cancelled||preparationClosed)return null;
    if(JSON.stringify({request:payload.request,context}).length>20000)throw Error('发送资料合计超过 20000 字符，请缩短需求、HTML 样本或错误资料；输入已保留。');
    const info=await request('ai.info',{});
    if(cancelled||preparationClosed)return null;
    generation=requireGeneration(info.generation);onInfo(info);
    await pending?.beforeDispatch?.(id);
    if(cancelled||preparationClosed)return null;
    // Handing the payload to the bridge starts the possibly-sent interval.
    // Only its explicit known-unsent errors may retract this dispatch fence.
    if(prepareAI){phase='sent';dispatched=true;}
    return {...payload,context,providerGeneration:generation};
  }
  function clearTerminal(){
    phase='settling';
    cleanup=(async()=>{
      try{await pagePreparation?.retire();if(claimed)await pending.clear(id);phase='settled';}
      catch(error){phase='unknown';throw error;}
    })();
    return cleanup;
  }
  return {id,
    get settled(){return settled;},
    get dispatched(){return dispatched;},
    get unknown(){return phase==='unknown';},
    async run(){
      let response;
      try{
        let result;
        if(prepareAI){
          // Reserve the original Send gesture synchronously, before any await.
          result=await prepareAI(()=>preparation??=preparePayload());
        }else{
          const ready=await preparePayload();
          if(ready===null||cancelled)return null;
          phase='sent';dispatched=true;
          result=await request('ai.generate',ready);
        }
        if(cancelled||result===null)return null;
        if(result.requestId!==id)throw Error('AI 响应身份不符，未应用。');
        if(requireGeneration(result.providerGeneration)!==generation)throw Error('AI Provider 已变化，请重新生成。');
        terminalReply={requestId:id,state:'completed'};
        response=result;
      }catch(error){
        if(prepareAI&&['E_AI_PREPARE','E_AI_GESTURE'].includes(error?.code)){
          preparationClosed=true;dispatched=false;
          phase=claimUncertain?'unknown':'preparing';
          // A timed-out bridge may leave storage/info in flight. Drain that
          // bounded preparation before clearing, so no late claim is orphaned.
          try{await preparation;}catch{}
          phase=claimUncertain?'unknown':'preparing';
        }else if(phase==='sent'&&isUnknown(error))phase='unknown';
        throw error;
      }
      finally{
        if(phase!=='unknown'){
          try{await clearTerminal();}finally{settled=true;}
        }
        settled=true;
      }
      // Stop may arrive after the real response but before its CAS clear receipt.
      return cancelled?null:response;
    },
    async cancel({release=true}={}){
      cancelled=true;
      if(phase==='preparing')return {requestId:id,state:'cancelled'};
      if(phase==='settling'){
        await cleanup;
        return terminalReply||{requestId:id,state:'cancelled'};
      }
      if(phase==='settled')return terminalReply||{requestId:id,state:'cancelled'};
      // A validated generate response remains terminal evidence if only storage
      // cleanup failed. Retry that request's CAS clear, never replay inference.
      if(terminalReply&&release){await clearTerminal();return terminalReply;}
      // This operation can prove it never called ai.generate, even when its
      // storage claim committed without a receipt. Clear only its own CAS row;
      // an offline Host cannot know about an undispatched preparation.
      if(!dispatched&&settled){
        if(!release)return {requestId:id,state:'unknown'};
        await pagePreparation?.retire();
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
        await pagePreparation?.retire();
        if(claimed)await pending.clear(id);
        phase='settled';
      }
      return reply;
    }
  };
}
export const isUnknown=error=>['E_AI_TIMEOUT','E_AI_UNKNOWN','E_AI_OUTCOME_UNKNOWN','E_OUTCOME_UNKNOWN','E_TOOL_TIMEOUT','E_TIMEOUT'].includes(error?.code);
