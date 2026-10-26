// In-memory, single-document queue. Unknown side effects never auto-retry.
const MAX_ITEMS=20, MAX_TEXT=8192, IDLE_MS=1100, ACK_MS=15000, STOP_MS=12000;
export function createQueueEngine({site, clock=()=>Date.now(), change=()=>{}}) {
  const items=[];
  const state={items,route:null,reason:'',phase:'waiting',
    expanded:false,inFlight:null,answerGate:null,lastConfirmed:null,forceId:null};
  let sequence=0, idleSince=null;
  const emit=()=>change(view());
  const current=()=>items[0]||null;
  const markUnknown=(why)=>{
    if(state.inFlight) {state.inFlight.item.state='unknown';state.inFlight.phase='unknown';}
    state.phase='unknown';state.reason=why;
    state.forceId=null;emit();
  };
  function view(){return {...state,items:items.map(item=>({...item})),
    inFlight:state.inFlight?{id:state.inFlight.item.id,phase:state.inFlight.phase}:null};}
  function wait(reason) {
    if(state.phase==='unknown' || state.inFlight?.phase==='unknown')return;
    idleSince=null;
    if(state.reason===reason)return;
    state.reason=reason;emit();
  }
  function uncertain(id,reason,before) {
    const item=items.find(v=>v.id===id);
    if(!item||state.inFlight)return false;
    state.inFlight={item,phase:'unknown',before:before?.ok?{
      route:before.route,users:before.users,assistants:before.assistants,
      assistantCount:before.assistants.length}:undefined};
    markUnknown(reason);return true;
  }
  // Read-only preflight before any destructive website draft operation.
  function checkEnqueue(text,route) {
    if(typeof text!=='string'||!site.normal(text))return {ok:false,reason:'原生草稿为空'};
    if(text.length>MAX_TEXT)return {ok:false,reason:'文字超过队列上限'};
    if(items.length>=MAX_ITEMS)return {ok:false,reason:'发送队列已满'};
    if(!route || (state.route && route!==state.route))
      return {ok:false,reason:'会话不一致，队列未修改'};
    return {ok:true};
  }
  function enqueue(text,route) {
    const eligible=checkEnqueue(text,route);
    if(!eligible.ok)return false;
    state.route=route;
    items.push({id:'q'+(++sequence),text,state:'queued'});
    if (state.phase==='waiting') state.reason='';
    emit();return true;
  }
  function remove(id) {
    const item=items.find(v=>v.id===id);
    if(!item || (state.inFlight?.item===item && state.inFlight.phase!=='unknown'))return false;
    if(state.inFlight?.item===item){
      const before=state.inFlight.before||state.inFlight.token?.before;
      const snap=site.inspect();
      if(before&&snap.ok&&site.confirm(before,item.text,snap)){
        state.answerGate={before,confirmedUser:snap.users.at(-1),started:clock(),sawBusy:snap.busy};
      }
      state.inFlight=null;state.phase='waiting';state.reason='';idleSince=null;
    }
    items.splice(items.indexOf(item),1);
    if(!items.length && !state.answerGate){state.route=null;state.reason='';idleSince=null;}
    emit();return true;
  }
  function move(id,toIndex) {
    const i=items.findIndex(v=>v.id===id);
    if(i<0||toIndex<0||toIndex>=items.length||state.inFlight?.item===items[i])return false;
    const [item]=items.splice(i,1);items.splice(toIndex,0,item);emit();return true;
  }
  // 'Edit' means reclaiming one unsent item into the official composer.
  // Removal is atomic from the queue's perspective and never a send request.
  function reclaim(id) {
    const item=items.find(v=>v.id===id);
    if(!item || state.inFlight ||
      item.state==='unknown' || item.state==='sending' ||
      item.state==='confirmed')return false;
    return remove(id);
  }
  function toggleExpanded(){state.expanded=!state.expanded;emit();}
  function requestNow(id) {
    const item=items.find(v=>v.id===id);
    if(!item || state.phase==='unknown' || state.inFlight || state.answerGate)return {ok:false};
    const snap=site.inspect();
    if(!snap.ok || snap.route!==state.route)return {ok:false,reason:'会话已变化'};
    if(snap.busy)return {ok:false,needsStopConfirmation:true};
    move(id,0);state.reason='';idleSince=null;emit();return {ok:true};
  }
  function confirmForceStop(id) {
    if(state.phase==='unknown' || state.inFlight || state.answerGate || !items.some(v=>v.id===id))return false;
    const snap=site.inspect();
    if(!snap.ok || snap.route!==state.route || !snap.busy || !snap.stopButton)return false;
    // A confirmed user gesture is required before this method is called.
    const item=items.find(v=>v.id===id);
    const flight={item,phase:'await-stop',started:clock(),sawBusy:true};
    state.inFlight=flight;
    let stopped=false;
    try{stopped=site.stop(snap);}catch{/* A throwing click may already have taken effect. */}
    if(!stopped){markUnknown('停止动作结果未知，请核对原对话后删除该条');return false;}
    state.inFlight=null;
    move(id,0);
    item.state='waiting';state.inFlight=flight;
    state.phase='waiting';state.forceId=id;state.reason='';idleSince=null;emit();return true;
  }
  function failBeforeClick(item,why) {
    item.state='queued';state.phase='waiting';
    state.reason=why||'未能安全提交至原生网页';
    state.inFlight=null;idleSince=null;emit();
  }
  function startSubmit(snap,item) {
    if(snap.rich || snap.draft!==''){
      failBeforeClick(item,'原生草稿或附件非空，未准备待发内容');return;
    }
    item.state='sending';state.phase='sending';
    state.inFlight={item,phase:'preparing',started:clock(),before:{
      route:snap.route,users:snap.users,assistants:snap.assistants,assistantCount:snap.assistants.length}};
    emit();
    let prepared;
    try{prepared=site.prepare(item.text,snap);}
    catch{markUnknown('准备原生消息时出错，可能已填入；请核对原对话和草稿后删除该条');return;}
    if(!prepared?.ok){
      if(prepared?.mayHaveWritten){
        markUnknown((prepared.reason?prepared.reason+'；':'')+'可能已填入，请核对原对话和草稿后删除该条');return;
      }
      failBeforeClick(item,prepared?.reason);return;
    }
    state.inFlight={item,phase:'await-native-ready',started:clock(),token:prepared.token};
    emit();
  }
  function tick({canSubmit=true}={}) {
    if(!items.length && !state.answerGate)return;
    if(state.phase==='unknown' || state.inFlight?.phase==='unknown')return;
    const t=clock();
    // These deadlines survive blocked submission, navigation and composer loss.
    // Once prepared, the user may have sent the draft outside this engine.
    if(state.inFlight?.phase==='await-stop' && t-state.inFlight.started>STOP_MS){
      markUnknown('停止结果未知，请核对原对话后删除该条；消息未自动重发');return;
    }
    if(state.inFlight?.phase==='await-native-ready' && t-state.inFlight.started>6000){
      const detail=state.inFlight.readinessReason||'未取得下一轮原生就绪检查';
      markUnknown(detail+'；填入后的发送状态未知，请核对原对话和草稿后删除该条');return;
    }
    const snap=site.inspect();
    // Lost page access cannot turn an already-clicked send into an unsent item.
    if(state.inFlight?.phase==='await-confirm' &&
      (!snap.ok || snap.route!==state.route) && t-state.inFlight.started>ACK_MS){
      markUnknown('未能确认用户消息入站，禁止重复点击');return;
    }
    if(!snap.ok){wait(snap.reason||'原生控件暂不可用');return;}
    if(state.route && snap.route!==state.route){wait('等待返回原对话，队列不会跨会话发送');return;}
    if(state.inFlight?.phase==='await-stop') {
      if(!canSubmit){idleSince=null;return;}
      if(snap.busy||!snap.idle){idleSince=null;return;}
      if(idleSince===null)idleSince=t;
      if(t-idleSince<IDLE_MS)return;
      const item=state.inFlight.item;state.inFlight=null;state.forceId=null;
      startSubmit(snap,item);return;
    }
    if(state.inFlight?.phase==='await-native-ready') {
      const flight=state.inFlight;
      if(!canSubmit)return;
      let result;
      try{result=site.commit(flight.token);}
      catch{markUnknown('原生点击状态无法判定，请检查原对话');return;}
      if(result?.retry){flight.readinessReason=result.reason||'原生控件尚未就绪';return;}
      if(!result?.ok){
        if(result?.stage==='after-click'){markUnknown('网站可能已发送，请手动核对后删除该条');return;}
        markUnknown((result?.reason?result.reason+'；':'')+'填入后的发送状态未知，请核对原对话后删除该条');return;
      }
      state.inFlight={item:flight.item,phase:'await-confirm',started:t,before:result.before};
      emit();return;
    }
    if(state.inFlight?.phase==='await-confirm') {
      const flight=state.inFlight;
      if(flight.before && site.confirm(flight.before,flight.item.text,snap)){
        flight.item.state='confirmed';state.lastConfirmed=flight.item.id;
        items.splice(items.indexOf(flight.item),1);state.inFlight=null;
        // Keep this gate even if the queue empties before the new answer appears.
        state.phase='waiting';state.answerGate={
          before:flight.before,confirmedUser:snap.users.at(-1),started:t,sawBusy:snap.busy};
        idleSince=null;emit();return;
      }
      if(t-flight.started>ACK_MS){
        const issue=site.confirmationIssue?.(flight.before,flight.item.text,snap);
        markUnknown((issue?issue+'；':'')+'未能确认用户消息入站，禁止重复点击');
      }
      return;
    }
    if(state.answerGate) {
      state.answerGate.sawBusy ||= snap.busy;
      if(snap.busy || !snap.idle || !snap.answerComplete ||
        typeof site.replyComplete!=='function' ||
        site.replyComplete(state.answerGate.before,state.answerGate.confirmedUser,snap)!==true){idleSince=null;return;}
      if(idleSince===null)idleSince=t;
      if(t-idleSince<IDLE_MS)return;
      state.answerGate=null;idleSince=null;
      if(!items.length)state.route=null;
      emit();
    }
    if(state.inFlight || !items.length)return;
    if(!canSubmit){idleSince=null;return;}
    if(snap.busy || !snap.idle || (snap.assistants.length>0&&!snap.answerComplete) || snap.rich || snap.composing || snap.draft!=='') {
      const reason=snap.rich?'检测到附件，不覆盖原生输入框':snap.composing?'等待输入法完成':snap.draft!==''?'原生草稿非空，等待用户处理':'等待当前回复结束';
      wait(reason);
      return;
    }
    if(idleSince===null)idleSince=t;
    if(t-idleSince<IDLE_MS)return;
    state.reason='';startSubmit(snap,current());
  }
  return Object.freeze({view,checkEnqueue,enqueue,wait,uncertain,remove,reclaim,move,
    toggleExpanded,requestNow,confirmForceStop,tick});
}
