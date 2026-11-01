// A read-only picker operation over the same public, fixed Task delegation.
// Admission uncertainty is retained until the original request is released.
export function createInspection(sdk,onChange=()=>{}){
  const state={phase:'closed',clientRequestId:null,runId:null,result:null,error:'',cancelled:false};
  let fingerprint,input,reading=null,generation=0;
  const emit=()=>onChange({...state});
  const active=()=>['starting','running','unknown','stopping'].includes(state.phase);
  function apply(row){
    if(!row||row.clientRequestId!==state.clientRequestId||(state.runId&&row.runId!==state.runId))throw Error('网页检查响应身份不匹配');
    if(row.runId)state.runId=row.runId;
    if(!row.retired){state.phase=state.cancelled?'stopping':'running';return;}
    if(state.cancelled){state.phase='closed';state.result=null;return;}
    if(row.status!=='completed'||!row.result||row.result.kind!==input.kind||row.result.url!==input.url||!Array.isArray(row.result.choices)){
      state.phase='error';throw Error('网页检查未完成，请检查任务状态和网页范围');
    }
    state.result=row.result;state.phase='ready';
  }
  async function refresh({fresh=false}={}){
    if(reading){await reading;if(!fresh)return;}
    if(!state.clientRequestId)return;
    const requestId=state.clientRequestId,epoch=generation;
    reading=(async()=>{
      try{const row=await sdk.read(requestId);if(epoch!==generation)return;apply(row);state.error='';}
      catch(error){if(epoch!==generation)return;state.error=error.message;if(active())state.phase='unknown';else if(state.phase==='ready')state.phase='error';}
    })();
    try{await reading;}finally{reading=null;emit();}
  }
  async function begin(value,identity){
    if(active())return;
    const epoch=++generation;
    input={...value,url:new URL(value.url).href};fingerprint=identity;
    Object.assign(state,{phase:'starting',clientRequestId:null,runId:null,result:null,error:'',cancelled:false});emit();
    try{
      await sdk.prepare();
      if(epoch!==generation)return;
      const current=await sdk.currentPage();
      if(epoch!==generation)return;
      if(current?.status!=='available'||current.url!==input.url)throw Error('当前网页已变化，请刷新后重试');
      if(state.cancelled){state.phase='closed';return;}
      state.clientRequestId=crypto.randomUUID();emit();
      const receipt=await sdk.inspect(input,state.clientRequestId);
      if(!receipt?.runId)throw Error('网页检查开始结果未知，请勿重复开始');
      apply(receipt);
      if(state.cancelled&&active())await close();
      else await refresh();
    }catch(error){if(epoch===generation){state.error=error.message;state.phase=state.clientRequestId?'unknown':state.cancelled?'closed':'error';}}
    finally{if(epoch===generation)emit();}
  }
  async function close(){
    state.cancelled=true;state.result=null;
    if(!state.clientRequestId){generation++;state.phase='closed';emit();return;}
    if(!active()){state.phase='closed';emit();return;}
    state.phase='stopping';emit();
    try{const row=await sdk.stop(state.clientRequestId);apply(row);}
    catch(error){state.error=error.message;state.phase='unknown';}
    emit();
  }
  async function use(index,identity){
    if(state.phase!=='ready')throw Error('请等待原网页检查完成并释放');
    if(identity!==fingerprint)throw Error('配置已变化，请取消后重新点选');
    const current=await sdk.currentPage();
    if(current?.status!=='available'||current.url!==input.url)throw Error('当前网页已变化，请取消后重新点选');
    // Host read revalidates the original tab/document, permission and Task pin.
    await refresh({fresh:true});
    if(state.phase!=='ready')throw Error(state.error||'网页检查结果已失效');
    if(identity!==fingerprint)throw Error('配置已变化，请取消后重新点选');
    const choice=state.result.choices[index];
    if(!choice)throw Error('候选已失效');
    if(input.kind==='fields'&&choice.status!=='pass')throw Error('内容未完整匹配，请选择其他内容或手动编辑规则');
    return choice;
  }
  return {state,begin,refresh,close,use,active};
}
