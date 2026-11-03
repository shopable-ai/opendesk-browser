const budgetMs=5500;
const fail=(code,message,clientRequestId,cause)=>Object.assign(new Error(message,{cause}),{code,clientRequestId});
const outcome=(id,cause)=>fail('E_OUTCOME_UNKNOWN','网页观察结果或释放状态未知，请保留原请求并协调。'+
  (cause?.message?' 原因：'+String(cause.code||'E_PAGE_OBSERVATION')+' '+cause.message.slice(0,250):''),id,cause);

function observationId(requestId){
  if(typeof requestId!=='string'||!requestId||!/^[A-Za-z0-9._:-]+$/.test(requestId)||requestId.length+5>80)
    throw fail('E_REQUEST_ID','网页观察请求身份无效。');
  return requestId+'.page';
}

// Bound even a transport that never settles. Expiry never implies retirement.
async function bounded(action,deadline,id){
  const remaining=deadline-Date.now();
  if(remaining<=0)throw outcome(id);
  let timer;
  try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(outcome(id)),remaining);
  })]);}finally{clearTimeout(timer);}
}

function retirement(request,id){
  let sent=false,finished=null,inFlight=null;
  const released=row=>row?.clientRequestId===id&&(row.retirementState==='released'||
    (row.state==='cancelled'&&row.runId===null));
  return ()=>{
    if(finished)return Promise.resolve(finished);
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const deadline=Date.now()+budgetMs;
      try{
        let row;
        if(!sent){
          sent=true; // A lost stop reply must never cause an automatic replay.
          try{row=await bounded(()=>request('controllers.stop',{clientRequestId:id}),deadline,id);}catch{}
          if(released(row))return finished=row;
        }
        row=await bounded(()=>request('controllers.read',{clientRequestId:id}),deadline,id);
        if(!released(row))throw outcome(id);
        return finished=row;
      }catch(error){throw outcome(id,error);}
    })().finally(()=>{inFlight=null;});
    return inFlight;
  };
}

// Retain uncertain stop fences across repeated pending recovery calls in this
// iframe. A new iframe still issues its first stop to cancel late admission.
const recoveries=new WeakMap();
export function retireAiPageObservation(request,requestId){
  const id=observationId(requestId);
  let entries=recoveries.get(request);
  if(!entries){entries=new Map();recoveries.set(request,entries);}
  if(!entries.has(id))entries.set(id,retirement(request,id));
  return entries.get(id)();
}

export function createAiPageObservation(request,{requestId,url}){
  const id=observationId(requestId);
  let cancelled=false,started=false,preparation=null,context=null,snapshot=null;
  const retireOriginal=retirement(request,id);
  const checkCancelled=()=>{if(cancelled)throw fail('E_CANCELLED','网页观察已取消。',id);};
  function validate(row){
    if(row?.clientRequestId!==id||typeof row.runId!=='string'||!row.runId||
      typeof row.resultId!=='string'||!row.resultId||row.state!=='completed'||row.retirementState!=='released')
      throw fail('E_PAGE_OBSERVATION','网页观察尚未完成释放或身份不符。',id);
    const value=row.value;
    if(value?.kind!=='context'||value.url!==url||!Array.isArray(value.choices)||value.choices.length!==1||
      typeof value.choices[0]?.html!=='string'||value.choices[0].html.length>12000||
      (value.truncated!==undefined&&typeof value.truncated!=='boolean'))
      throw fail('E_PAGE_OBSERVATION','网页上下文格式、范围或样本大小无效。',id);
    return {runId:row.runId,resultId:row.resultId,value:JSON.stringify(value)};
  }
  async function current(deadline){
    const row=await bounded(()=>request('currentPage.info',{}),deadline,id);
    checkCancelled();
    if(row?.status!=='available'||row.url!==url)throw fail('E_PAGE_CHANGED','当前网页已变化。',id);
  }
  async function prepare(){
    checkCancelled();
    if(preparation)return preparation;
    preparation=(async()=>{
      const deadline=Date.now()+budgetMs;
      await bounded(()=>request('controllers.read',{}),deadline,id);
      checkCancelled();
      await current(deadline);
      let row;
      try{
        row=await bounded(()=>{
          checkCancelled();
          started=true; // Set before invoking a possibly synchronous transport.
          return request('controllers.start',{clientRequestId:id,params:{url,configJson:'{}',
            optionsJson:JSON.stringify({inspection:{kind:'context',container:'',item:'',mode:'snapshot'}}),
            waitForSelector:'',timeoutMs:5000}});
        },deadline,id);
      }catch(error){if(started)throw outcome(id,error);throw error;}
      checkCancelled();
      let runId=row?.runId,resultId=row?.resultId;
      while(row?.retirementState!=='released'){
        if(row?.clientRequestId!==id)throw outcome(id);
        await bounded(()=>new Promise(resolve=>setTimeout(resolve,100)),deadline,id);
        checkCancelled();
        try{row=await bounded(()=>request('controllers.read',{clientRequestId:id}),deadline,id);}
        catch(error){throw outcome(id,error);}
        checkCancelled();
        if((runId&&row?.runId!==runId)||(resultId&&row?.resultId!==resultId))throw outcome(id);
        runId=row?.runId;resultId=row?.resultId;
      }
      snapshot=validate(row);
      context=Object.freeze({sample:row.value.choices[0].html,pageObservation:Object.freeze({
        clientRequestId:id,runId:row.runId,resultId:row.resultId,truncated:row.value.truncated===true})});
      return context;
    })();
    return preparation;
  }
  return {clientRequestId:id,prepare,
    async assertCurrent(){
      checkCancelled();
      if(!context)throw fail('E_PAGE_OBSERVATION','网页观察尚未准备完成。',id);
      const deadline=Date.now()+budgetMs;
      // The Host rechecks the original exact document, not just the URL.
      const row=await bounded(()=>request('controllers.read',{clientRequestId:id}),deadline,id);
      checkCancelled();
      const latest=validate(row);
      if(latest.runId!==snapshot.runId||latest.resultId!==snapshot.resultId||latest.value!==snapshot.value)
        throw fail('E_PAGE_CHANGED','原网页观察身份或快照已变化。',id);
      await current(deadline);
      return context;
    },
    async retire(){
      // Completed snapshots already prove release. Preserve the Host result so
      // the parent can retire before inference returns, then assert at apply.
      if(context)return {clientRequestId:id,runId:snapshot.runId,resultId:snapshot.resultId,
        state:'completed',retirementState:'released'};
      cancelled=true;
      // No start can pass the cancellation checks after a preflight resolves.
      if(!started)return {clientRequestId:id,runId:null,state:'cancelled'};
      return retireOriginal();
    }
  };
}
