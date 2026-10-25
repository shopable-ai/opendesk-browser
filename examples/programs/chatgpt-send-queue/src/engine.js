// In-memory, single-document queue. Unknown side effects never auto-retry.
const MAX_ITEMS=20, MAX_TEXT=8192, IDLE_MS=1100, ACK_MS=15000, STOP_MS=12000;
export function createQueueEngine({site, clock=()=>Date.now(), change=()=>{}}) {
  const items=[];
  const state={items,route:null,paused:false,reason:'',phase:'waiting',editing:null,editingDraft:null,
    expanded:false,inFlight:null,answerGate:null,lastConfirmed:null,forceId:null};
  let sequence=0, idleSince=null, lastSignature='';
  const emit=()=>change(view());
  const current=()=>items[0]||null;
  const markUnknown=(why)=>{
    if(state.inFlight) {state.inFlight.item.state='unknown';state.inFlight.phase='unknown';}
    state.phase='unknown';state.paused=true;state.reason=why;
    state.forceId=null;emit();
  };
  function view(){return {...state,items:items.map(item=>({...item})),
    inFlight:state.inFlight?{id:state.inFlight.item.id,phase:state.inFlight.phase}:null};}
  function pause(reason='已暂停') {
    if(state.paused && state.reason===reason)return;
    state.paused=true;state.reason=reason;emit();
  }
  function resume() {
    if(state.inFlight?.phase==='unknown' || state.inFlight?.phase==='await-confirm' ||
      state.inFlight?.phase==='await-stop')return false;
    const snap=site.inspect();
    if (!snap.ok || (state.route && state.route!==snap.route)) {pause('请返回原对话后再恢复');return false;}
    state.paused=false;state.reason='';idleSince=null;emit();return true;
  }
  function enqueue(text,route) {
    if(typeof text!=='string'||!site.normal(text)||text.length>MAX_TEXT||items.length>=MAX_ITEMS)return false;
    if(!route || (state.route && route!==state.route)) {pause('会话不一致，队列未修改');return false;}
    state.route=route;
    items.push({id:'q'+(++sequence),text,state:'queued'});
    if (state.phase==='waiting') state.reason='';
    emit();return true;
  }
  function remove(id) {
    const item=items.find(v=>v.id===id);
    if(!item || (state.inFlight?.item===item && state.inFlight.phase!=='unknown'))return false;
    if(state.inFlight?.item===item){state.inFlight=null;state.phase='waiting';state.paused=true;}
    if(state.editing===id){state.editing=null;state.editingDraft=null;}
    items.splice(items.indexOf(item),1);
    if(!items.length){state.route=null;state.answerGate=null;}
    emit();return true;
  }
  function move(id,toIndex) {
    const i=items.findIndex(v=>v.id===id);
    if(i<0||toIndex<0||toIndex>=items.length||state.inFlight?.item===items[i])return false;
    const [item]=items.splice(i,1);items.splice(toIndex,0,item);emit();return true;
  }
  function edit(id,savedDraft) {
    if(state.editing || state.inFlight || !items.some(v=>v.id===id))return false;
    state.editing=id;state.editingDraft=savedDraft;emit();return true;
  }
  function finishEdit(text) {
    const item=items.find(v=>v.id===state.editing);
    if(!item||!site.normal(text)||text.length>MAX_TEXT)return false;
    item.text=text;state.editing=null;state.editingDraft=null;emit();return true;
  }
  function cancelEdit() {state.editing=null;state.editingDraft=null;emit();}
  function toggleExpanded(){state.expanded=!state.expanded;emit();}
  function requestNow(id) {
    const item=items.find(v=>v.id===id);
    if(!item || state.editing || state.inFlight || state.answerGate)return {ok:false};
    const snap=site.inspect();
    if(!snap.ok || snap.route!==state.route)return {ok:false,reason:'会话已变化'};
    if(snap.busy)return {ok:false,needsStopConfirmation:true};
    move(id,0);state.paused=false;state.reason='';idleSince=null;emit();return {ok:true};
  }
  function confirmForceStop(id) {
    if(state.inFlight || state.editing || state.answerGate || !items.some(v=>v.id===id))return false;
    const snap=site.inspect();
    if(!snap.ok || snap.route!==state.route || !snap.busy || !snap.stopButton)return false;
    // A confirmed user gesture is required before this method is called.
    if(!site.stop(snap)){markUnknown('停止动作结果未知，已暂停');return false;}
    move(id,0);
    const item=current();item.state='waiting';
    state.inFlight={item,phase:'await-stop',started:clock(),sawBusy:true};
    state.phase='waiting';state.forceId=id;state.paused=false;idleSince=null;emit();return true;
  }
  function failBeforeClick(item,why) {
    item.state='failed';state.phase='failed';state.paused=true;
    state.reason=why||'未能安全提交至原生网页';
    state.inFlight=null;idleSince=null;emit();
  }
  function startSubmit(snap,item) {
    item.state='sending';state.phase='sending';
    state.inFlight={item,phase:'preparing',started:clock()};
    emit();
    let prepared;
    try{prepared=site.prepare(item.text,snap);}
    catch{failBeforeClick(item,'准备原生消息时出错，未执行点击');return;}
    if(!prepared?.ok){failBeforeClick(item,prepared?.reason);return;}
    state.inFlight={item,phase:'await-native-ready',started:clock(),token:prepared.token};
    emit();
  }
  function tick() {
    if(!items.length && !state.answerGate)return;
    const snap=site.inspect(),t=clock();
    if(!snap.ok){pause(snap.reason||'原生控件暂不可用');return;}
    if(state.route && snap.route!==state.route){pause('已切换对话，队列不会跨会话发送');return;}
    if(state.inFlight?.phase==='await-stop') {
      if(t-state.inFlight.started>STOP_MS){markUnknown('停止结果未知，消息未自动重发');return;}
      if(snap.busy||!snap.idle){idleSince=null;return;}
      if(idleSince===null)idleSince=t;
      if(t-idleSince<IDLE_MS)return;
      const item=state.inFlight.item;state.inFlight=null;state.forceId=null;
      if(state.paused)return;
      startSubmit(snap,item);return;
    }
    if(state.inFlight?.phase==='await-native-ready') {
      const flight=state.inFlight;
      if(t-flight.started>6000){
        failBeforeClick(flight.item,'网页发送按钮没有就绪，内容留在原生输入框');
        return;
      }
      let result;
      try{result=site.commit(flight.token);}
      catch{markUnknown('原生点击状态无法判定，请检查原对话');return;}
      if(result?.retry)return;
      if(!result?.ok){
        if(result?.stage==='after-click'){markUnknown('网站可能已发送，请手动核对后删除该条');return;}
        failBeforeClick(flight.item,result?.reason);return;
      }
      state.inFlight={item:flight.item,phase:'await-confirm',started:t,before:result.before};
      emit();return;
    }
    if(state.inFlight?.phase==='await-confirm') {
      const flight=state.inFlight;
      if(flight.before && site.confirm(flight.before,flight.item.text,snap)){
        flight.item.state='confirmed';state.lastConfirmed=flight.item.id;
        items.splice(items.indexOf(flight.item),1);state.inFlight=null;
        state.phase='waiting';state.answerGate=items.length?{
          assistantCount:flight.before.assistantCount,started:t,sawBusy:snap.busy}:null;
        if(!items.length)state.route=null;
        idleSince=null;emit();return;
      }
      if(t-flight.started>ACK_MS){markUnknown('未能确认用户消息入站，禁止重复点击');}
      return;
    }
    if(state.inFlight?.phase==='unknown')return;
    if(state.answerGate) {
      state.answerGate.sawBusy ||= snap.busy;
      if(snap.busy || !snap.idle || !snap.answerComplete ||
        snap.assistants.length<=state.answerGate.assistantCount){idleSince=null;return;}
      if(idleSince===null)idleSince=t;
      if(t-idleSince<IDLE_MS)return;
      state.answerGate=null;idleSince=null;emit();
    }
    if(state.paused || state.editing || state.inFlight || !items.length)return;
    if(snap.busy || !snap.idle || snap.rich || site.normal(snap.draft)) {
      idleSince=null;
      const reason=snap.rich?'检测到附件，不覆盖原生输入框':site.normal(snap.draft)?'原生草稿非空，等待用户处理':'等待当前回复结束';
      if(reason!==lastSignature){lastSignature=reason;state.reason=reason;emit();}
      return;
    }
    if(idleSince===null)idleSince=t;
    if(t-idleSince<IDLE_MS)return;
    state.reason='';startSubmit(snap,current());
  }
  return Object.freeze({view,enqueue,pause,resume,remove,move,edit,finishEdit,cancelEdit,
    toggleExpanded,requestNow,confirmForceStop,tick});
}
