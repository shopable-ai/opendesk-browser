import {normalizeQueueCache} from './cache.js';
// Single-document queue with guarded refresh-cache recovery. Unknown effects never auto-retry.
const MAX_ITEMS=20, MAX_TEXT=8192, IDLE_MS=1100, ACK_MS=15000, STOP_MS=12000;
const REPLY_WAIT='等待已确认消息及后续原生消息的回复完成（需保持原对话历史可核验）';
const REPLY_HISTORY_CHANGED='原对话历史节点已变化，已停止自动发送；请核对原对话';
const STORAGE_ERROR='队列缓存保存失败，已阻止网页操作；请保留原文并检查存储后重试';
export function createQueueEngine({site, clock=()=>Date.now(), change=()=>{}, checkpoint=()=>true}) {
  const items=[];
  const state={items,route:null,reason:'',phase:'waiting',
    expanded:false,inFlight:null,answerGate:null,lastConfirmed:null,forceId:null};
  let sequence=0, idleSince=null,nativeAttemptChanged=false;
  const emit=()=>change(view());
  const saved=()=>{try{return checkpoint()!==false;}catch{return false;}};
  const current=()=>items.find(item=>item.state!=='paused')||null;
  const markUnknown=(why)=>{
    if(state.inFlight) {state.inFlight.item.state='unknown';state.inFlight.phase='unknown';}
    state.phase='unknown';state.reason=why;
    state.forceId=null;emit();
  };
  function view(){return {...state,items:items.map(item=>({...item})),
    inFlight:state.inFlight?{id:state.inFlight.item.id,phase:state.inFlight.phase}:null};}
  function restoreCache(record,route) {
    if(items.length||state.inFlight||state.answerGate||state.route)return false;
    record=normalizeQueueCache(record,route);
    if(!record)return false;
    const restored=record.items.map(row=>({...row,state:'paused'}));
    const maxId=Math.max(0,...restored.map(row=>Number(row.id.slice(1))));
    const uncertainItem=restored.find(row=>row.id===record.inFlight?.id);
    items.push(...restored);sequence=Math.max(sequence,maxId);state.route=items.length?route:null;
    state.phase='waiting';state.forceId=null;state.lastConfirmed=null;idleSince=null;
    state.expanded=record.expanded===true;
    state.reason='刷新后请先核对原对话，再手动恢复排队消息';
    if(uncertainItem){
      uncertainItem.state='unknown';state.phase='unknown';
      state.inFlight={item:uncertainItem,phase:'unknown'};
      state.reason='刷新前发送结果未知，无法推断是否已发送；请核对原对话，禁止自动重发';
    }
    emit();return true;
  }
  function wait(reason) {
    if(state.phase==='unknown' || state.inFlight?.phase==='unknown')return;
    idleSince=null;
    if(state.reason===reason)return;
    state.reason=reason;emit();
  }
  function newAnswerGate(before,snap) {
    return {before,confirmedUser:snap.users.at(-1),started:clock(),sawBusy:snap.busy,
      observed:{users:[...snap.users],assistants:[...snap.assistants],history:snap.history?.slice()}};
  }
  function answerReady(snap) {
    // Keep observing exact history while busy, so a later completed snapshot
    // cannot silently substitute nodes seen during an earlier poll.
    const previous=state.answerGate.observed?.history?.at(-1);
    const verified=typeof site.replyComplete==='function' &&
      site.replyComplete(state.answerGate.before,state.answerGate.confirmedUser,snap,state.answerGate)===true;
    if(previous && previous!==state.answerGate.observed?.history?.at(-1))idleSince=null;
    return !snap.busy && snap.idle && snap.answerComplete && verified;
  }
  function uncertain(id,reason,before) {
    const item=items.find(v=>v.id===id);
    if(!item||state.inFlight)return false;
    state.inFlight={item,phase:'unknown',before:before?.ok?{
      route:before.route,users:before.users,assistants:before.assistants,history:before.history,
      assistantCount:before.assistants.length}:undefined};
    markUnknown(reason);return true;
  }
  // Read-only preflight before any destructive website draft operation.
  function checkEnqueue(text,route) {
    if(!route)return {ok:false,reason:'当前对话暂不能加入队列'};
    if(typeof text!=='string'||!site.normal(text))return {ok:false,reason:'原生草稿为空'};
    if(text.length>MAX_TEXT)return {ok:false,reason:'文字超过队列上限'};
    if(items.length>=MAX_ITEMS)return {ok:false,reason:'发送队列已满'};
    if(state.route && route!==state.route)
      return {ok:false,reason:'会话不一致，队列未修改'};
    return {ok:true};
  }
  function enqueue(text,route,{paused=false}={}) {
    const eligible=checkEnqueue(text,route);
    if(!eligible.ok)return false;
    state.route=route;
    items.push({id:'q'+(++sequence),text,state:paused===true?'paused':'queued'});
    if (state.phase==='waiting') state.reason='';
    emit();return true;
  }
  // Pausing keeps this row's ID and order; only the dispatcher skips it.
  function pause(id) {
    const item=items.find(v=>v.id===id);
    if(!item||item.state!=='queued'||state.phase==='unknown'||
      state.inFlight?.item===item)return false;
    item.state='paused';idleSince=null;emit();return true;
  }
  function resume(id) {
    const item=items.find(v=>v.id===id);
    if(!item||item.state!=='paused'||state.phase==='unknown'||
      state.inFlight?.item===item)return false;
    item.state='queued';idleSince=null;emit();return true;
  }
  function remove(id) {
    const item=items.find(v=>v.id===id);
    if(!item || (state.inFlight?.item===item && state.inFlight.phase!=='unknown'))return false;
    if(state.inFlight?.item===item){
      const before=state.inFlight.before||state.inFlight.token?.before;
      const snap=site.inspect();
      if(before&&snap.ok&&site.confirm(before,item.text,snap)){
        state.answerGate=newAnswerGate(before,snap);
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
    const [item]=items.splice(i,1);items.splice(toIndex,0,item);idleSince=null;emit();return true;
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
  // Explicitly take back the draft already in the website, without rewriting
  // it. A possibly clicked send can never be made retryable this way.
  function reclaimPrepared(id) {
    const flight=state.inFlight;
    if(!flight || flight.item.id!==id || flight.phase!=='unknown' ||
      !flight.token || flight.clickAttempted ||
      site.canReclaimPrepared?.(flight.token)!==true)return false;
    state.inFlight=null;state.phase='waiting';state.reason='';
    state.forceId=null;idleSince=null;
    items.splice(items.indexOf(flight.item),1);
    if(!items.length&&!state.answerGate)state.route=null;
    emit();return true;
  }
  // A trusted native button/key attempt owns the send from now on. It need
  // not have a visible receipt yet, and cannot authorize a second click.
  function observeNativeAttempt(snap) {
    const flight=state.inFlight,token=flight?.token;
    if(!token||flight.clickAttempted||!['await-native-ready','unknown'].includes(flight.phase)||
      !snap?.ok||snap.route!==state.route||snap.form!==token.form||snap.editor!==token.editor)return false;
    flight.clickAttempted=true;
    if(flight.phase==='await-native-ready')
      state.inFlight={item:flight.item,phase:'await-confirm',started:clock(),before:token.before,clickAttempted:true};
    // The website has not handled its native event yet. The existing poll
    // publishes this state without rendering inside the capture listener.
    nativeAttemptChanged=true;return true;
  }
  // Called only after main observes a paired trusted beforeinput/input change.
  // Editing the draft we placed takes it back; a clicked/foreign draft cannot
  // cancel an uncertain send. No changed text is authorized for automatic send.
  function reclaimEditedPrepared(id,before,after) {
    const flight=state.inFlight;
    if(!flight||flight.item.id!==id||!['await-native-ready','unknown'].includes(flight.phase)||
      !flight.token||flight.clickAttempted||!before?.ok||!after?.ok||before.draft===after.draft||
      site.canReclaimPrepared?.(flight.token,{snapshot:before,allowComposing:true})!==true||
      site.canReclaimPrepared?.({...flight.token,text:after.draft},{allowComposing:true})!==true)return false;
    const next={...view(),items:items.filter(item=>item!==flight.item),inFlight:null};
    let stored=false;
    try{stored=checkpoint(next)!==false;}catch{/* Keep the original authorization blocked. */}
    if(!stored){markUnknown('编辑接管未能保存，已保留原队列；请核对草稿和原对话');return false;}
    state.inFlight=null;state.phase='waiting';state.reason='';state.forceId=null;idleSince=null;
    items.splice(items.indexOf(flight.item),1);
    if(!items.length&&!state.answerGate)state.route=null;
    emit();return true;
  }
  function confirmFlight(snap) {
    const flight=state.inFlight,before=flight?.before||flight?.token?.before;
    if(!before || !snap.ok || snap.route!==state.route ||
      !site.confirm(before,flight.item.text,snap))return false;
    flight.item.state='confirmed';state.lastConfirmed=flight.item.id;
    items.splice(items.indexOf(flight.item),1);state.inFlight=null;
    state.phase='waiting';state.reason='';state.forceId=null;
    // A delayed acknowledgement proves admission, not reply completion.
    state.answerGate=newAnswerGate(before,snap);
    idleSince=null;emit();return true;
  }
  // A newly edited draft sent natively is a separate intention, even when
  // its text equals a queued item. Observe its reply without consuming a row.
  function observeNativeAdmission(before,text,snap) {
    if(state.inFlight||!snap.ok||snap.route!==state.route||
      !site.confirm(before,text,snap))return false;
    state.answerGate ||= newAnswerGate(before,snap);
    state.forceId=null;idleSince=null;emit();return true;
  }
  function toggleExpanded(){state.expanded=!state.expanded;emit();}
  function requestNow(id) {
    const item=items.find(v=>v.id===id);
    if(!item || state.phase==='unknown' || state.inFlight)return {ok:false};
    if(item.state==='paused')return {ok:false,reason:'请先恢复这条消息'};
    if(item.state!=='queued')return {ok:false};
    const snap=site.inspect();
    if(!snap.ok || snap.route!==state.route)return {ok:false,reason:'会话已变化'};
    if(snap.rich || snap.composing || snap.draft!=='')return {ok:false,reason:'请先处理原生草稿、附件或输入法'};
    // This call is itself the explicit user action; do not require another click.
    if(snap.busy){
      const ok=beginForceStop(item,snap);
      return !ok&&state.reason===STORAGE_ERROR?{ok:false,reason:STORAGE_ERROR}:{ok};
    }
    if(state.answerGate)return {ok:false};
    move(id,0);state.reason='';idleSince=null;emit();return {ok:true};
  }
  function confirmForceStop(id) {
    if(state.phase==='unknown' || state.inFlight || !items.some(v=>v.id===id&&v.state==='queued'))return false;
    const snap=site.inspect();
    if(!snap.ok || snap.route!==state.route || snap.rich || snap.composing || snap.draft!=='')return false;
    return beginForceStop(items.find(v=>v.id===id),snap);
  }
  function beginForceStop(item,snap) {
    if(!snap.busy || !snap.stopButton)return false;
    if(state.answerGate && snap.users.at(-1)!==state.answerGate.confirmedUser)return false;
    const flight={item,phase:'await-stop',started:clock(),sawBusy:true};
    state.inFlight=flight;
    if(!saved()){
      state.inFlight=null;state.reason=STORAGE_ERROR;idleSince=null;emit();return false;
    }
    let stopped=false;
    try{stopped=site.stop(snap);}catch{/* A throwing click may already have taken effect. */}
    if(stopped!==true){markUnknown('停止动作结果未知，请核对原对话后删除该条');return false;}
    // Keep the flight installed while reordering, including during change callbacks.
    items.splice(items.indexOf(item),1);items.unshift(item);
    item.state='waiting';
    state.phase='waiting';state.forceId=item.id;state.reason='';idleSince=null;emit();return true;
  }
  function failBeforeClick(item,why) {
    item.state='queued';state.phase='waiting';
    state.reason=why||'未能安全提交至原生网页';
    state.inFlight=null;idleSince=null;emit();
  }
  function startSubmit(snap,item) {
    if(snap.busy || !snap.idle || snap.rich || snap.composing || snap.draft!==''){
      failBeforeClick(item,'原生草稿、附件、输入法或回复状态不允许准备待发内容');return;
    }
    item.state='sending';state.phase='sending';
    state.inFlight={item,phase:'preparing',started:clock(),before:{
      route:snap.route,users:snap.users,assistants:snap.assistants,history:snap.history,assistantCount:snap.assistants.length}};
    emit();
    if(!saved()){failBeforeClick(item,STORAGE_ERROR);return;}
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
  function tick({canSubmit=true,submitBlockReason='队列安全检查尚未就绪'}={}) {
    if(nativeAttemptChanged){nativeAttemptChanged=false;emit();}
    if(!items.length && !state.answerGate)return;
    const snap=site.inspect();
    // Keep read-only reconciliation alive even after a network/layout timeout.
    // Check before deadlines or committing: the user may have sent the draft.
    if(['await-native-ready','await-confirm','unknown'].includes(state.inFlight?.phase) &&
      confirmFlight(snap))return;
    if(state.phase==='unknown' || state.inFlight?.phase==='unknown')return;
    const t=clock();
    if(state.inFlight?.phase==='await-native-ready'){
      const blocked=!snap.ok?(snap.reason||'原生控件暂不可用'):
        snap.route!==state.route?'等待返回原对话':!canSubmit?submitBlockReason:null;
      if(blocked)state.inFlight.readinessReason='原生就绪检查被阻止：'+blocked;
    }
    // These deadlines survive blocked submission, navigation and composer loss.
    // Once prepared, the user may have sent the draft outside this engine.
    if(state.inFlight?.phase==='await-stop' && t-state.inFlight.started>STOP_MS){
      // Only Stop has been clicked: this item's draft was never prepared or
      // submitted. Preserve it as paused and editable, without retrying Stop
      // or waiving any existing reply/identity gate for the other messages.
      state.inFlight.item.state='paused';state.inFlight=null;state.forceId=null;
      state.phase='waiting';state.reason='停止后网页尚未就绪，此条已暂停，可取回编辑或恢复';
      idleSince=null;emit();return;
    }
    if(state.inFlight?.phase==='await-native-ready' && t-state.inFlight.started>6000){
      const detail=state.inFlight.readinessReason||'未取得下一轮原生就绪检查';
      markUnknown(detail+'；填入后的发送状态未知，请核对原对话和草稿后删除该条');return;
    }
    // Lost page access cannot turn an already-clicked send into an unsent item.
    if(state.inFlight?.phase==='await-confirm' &&
      (!snap.ok || snap.route!==state.route) && t-state.inFlight.started>ACK_MS){
      markUnknown('未能确认用户消息入站，禁止重复点击');return;
    }
    if(!snap.ok){wait(snap.reason||'原生控件暂不可用');return;}
    if(state.route && snap.route!==state.route){wait('等待返回原对话，队列不会跨会话发送');return;}
    if(state.inFlight?.phase==='await-stop') {
      // Stop does not waive the exact history/latest-user proof for our prior send.
      if(state.answerGate && !answerReady(snap)){
        wait(state.answerGate.historyInvalid?REPLY_HISTORY_CHANGED:REPLY_WAIT);return;
      }
      if(!canSubmit){idleSince=null;return;}
      if(snap.busy||!snap.idle){idleSince=null;return;}
      if(snap.rich || snap.composing || snap.draft!==''){idleSince=null;return;}
      if(idleSince===null)idleSince=t;
      if(t-idleSince<IDLE_MS)return;
      const item=state.inFlight.item;state.inFlight=null;state.forceId=null;
      state.answerGate=null;state.reason='';
      startSubmit(snap,item);return;
    }
    if(state.inFlight?.phase==='await-native-ready') {
      const flight=state.inFlight;
      if(!canSubmit)return;
      if(!saved()){
        flight.readinessReason=STORAGE_ERROR;state.reason=STORAGE_ERROR;emit();return;
      }
      let result;
      flight.clickAttempted=true;
      try{result=site.commit(flight.token);}
      catch{markUnknown('原生点击状态无法判定，请检查原对话');return;}
      if(result?.retry || result?.stage==='before-click')flight.clickAttempted=false;
      if(result?.retry){flight.readinessReason=result.reason||'原生控件尚未就绪';return;}
      if(!result?.ok){
        if(result?.stage==='after-click'){markUnknown('网站可能已发送，请手动核对后删除该条');return;}
        markUnknown((result?.reason?result.reason+'；':'')+'填入后的发送状态未知，请核对原对话后删除该条');return;
      }
      state.inFlight={item:flight.item,phase:'await-confirm',started:t,before:result.before,clickAttempted:true};
      emit();return;
    }
    if(state.inFlight?.phase==='await-confirm') {
      const flight=state.inFlight;
      if(t-flight.started>ACK_MS){
        const issue=site.confirmationIssue?.(flight.before,flight.item.text,snap);
        markUnknown((issue?issue+'；':'')+'未能确认用户消息入站，禁止重复点击');
      }
      return;
    }
    if(state.answerGate) {
      state.answerGate.sawBusy ||= snap.busy;
      if(!answerReady(snap)){
        wait(state.answerGate.historyInvalid?REPLY_HISTORY_CHANGED:REPLY_WAIT);return;
      }
      if(idleSince===null)idleSince=t;
      if(t-idleSince<IDLE_MS)return;
      state.answerGate=null;idleSince=null;state.reason='';
      if(!items.length)state.route=null;
      emit();
    }
    if(state.inFlight || !items.length)return;
    const eligible=current();
    if(!eligible){idleSince=null;return;}
    if(!canSubmit){wait(submitBlockReason);return;}
    if(snap.busy || !snap.idle || (snap.assistants.length>0&&!snap.answerComplete) || snap.rich || snap.composing || snap.draft!=='') {
      const draftReason=site.normal(snap.draft)?'':
        '输入框有空白字符，清空后队列会自动继续';
      const reason=snap.rich?'检测到附件，不覆盖原生输入框':snap.composing?'等待输入法完成':snap.draft!==''?draftReason:'等待当前回复结束';
      wait(reason);
      return;
    }
    if(idleSince===null)idleSince=t;
    if(t-idleSince<IDLE_MS)return;
    state.reason='';startSubmit(snap,eligible);
  }
  return Object.freeze({view,restoreCache,checkEnqueue,enqueue,wait,uncertain,pause,resume,remove,reclaim,reclaimPrepared,reclaimEditedPrepared,move,observeNativeAttempt,observeNativeAdmission,
    toggleExpanded,requestNow,confirmForceStop,tick});
}
