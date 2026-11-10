import {createPageUI} from '@opendesk/ui';
import {createChatGPTSite} from './site.js';
import {createQueueEngine} from './engine.js';
import {createQueueView} from './view.js';
import {createSendQueueRemote} from './remote.js';
import {createQueueCache} from './cache.js';
import {registerPageStatus} from './status.js';

const ID='app.ai-send-queue';
const POLL_MS=650, WATCHDOG_MS=5000, STALL_MS=30000;
// A separate installation must never take over the legacy in-memory queue.
const LEGACY_LIFECYCLES=['opendesk.chatgpt-send-queue','opendesk.ai-send-queue']
  .map(id=>'[data-opendesk-ui-owner][data-od-id="'+id+'.lifecycle"]');
const legacyActive=()=>LEGACY_LIFECYCLES.some(selector=>document.querySelector(selector));
const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

export default async function main({assets}={}) {
  if(window!==window.top||window.location.origin!=='https://chatgpt.com')
    return {programId:ID,status:'skipped'};
  if(legacyActive())
    return {programId:ID,status:'skipped',reason:'legacy-active'};
  const owner=createPageUI({id:ID+'.lifecycle',assets,pageRules,baseStyles:false});
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  function retireForLegacy(){
    if(!legacyActive())return false;
    owner.destroy();
    return true;
  }
  let composing=false,compositionEndedAt=-Infinity;
  const site=createChatGPTSite({isComposing:()=>composing});
  owner.on(document,'compositionstart',()=>{composing=true;},true);
  owner.on(document,'compositionend',()=>{composing=false;compositionEndedAt=Date.now();},true);
  let view=null,engine,remote=null;
  // One bounded handoff, acknowledged only by the independent interval poll.
  let pending=null,provenance=null,backup=null,editing=null,writing=false;
  let checking=false,checkFailed=false,needsRender=false,lastProgressKey=null;
  const cache=createQueueCache();
  let cacheRoute=null,cacheReady=false,loadingCache=false,cachedDraft=null;
  const cacheStatus={status:'pending',restored:0};
  const started=Date.now();
  const diagnostics={lastCheckStartedAt:null,lastCheckCompletedAt:null,lastPollAt:started,
    lastProgressAt:started,lastRecoveryAt:null,recoveryReason:'',checks:0,recoveries:0,
    coalesced:0,lastError:null};
  function attempt(fn,stage){
    try{fn();return true;}
    catch(error){
      checkFailed=true;
      // Record no page text, draft, exception message or stack.
      diagnostics.lastError={stage,type:error?.name==='TypeError'?'TypeError':'Error'};
      return false;
    }
  }
  function progress(state=engine.view()){
    // Repeated waiting reasons, UI renders and unrelated DOM mutations are not progress.
    const key=JSON.stringify([state.items.map(item=>[item.id,item.state]),state.phase,
      state.inFlight?.id,state.inFlight?.phase,Boolean(state.answerGate),state.lastConfirmed,
      pending?.kind,pending?.id,Boolean(provenance),Boolean(backup)]);
    if(key!==lastProgressKey){lastProgressKey=key;diagnostics.lastProgressAt=Date.now();}
  }
  function hasWork(){
    const state=engine.view();
    return !!(state.items.length||state.inFlight||state.answerGate||pending||provenance||backup||cachedDraft||view?.hasRecovery());
  }
  function checkpoint(state=engine.view(),removing=null){
    if(loadingCache)return true;
    if(!cacheReady||!cacheRoute)return false;
    const transfer=pending||(provenance?.id!==removing?provenance:null)||backup;
    const retained=transfer?.id&&state.items.some(item=>item.id===transfer.id&&item.text===transfer.text);
    const recovery=view?.recovery?.();
    const text=cachedDraft?.text||recovery?.text||(!retained&&transfer?.text)||null;
    const ok=cache.write({version:1,route:cacheRoute,
      items:state.items.map(({id,text,state})=>({id,text,state})),
      expanded:!!state.expanded,inFlight:state.inFlight?{id:state.inFlight.id}:null,
      draft:text?{text}:null});
    cacheStatus.status=ok?'saved':'write-failed';
    return ok;
  }
  function restoreDraft(){
    if(!cachedDraft)return;
    const text=cachedDraft.text;
    if(view.offerRecovery(text,cachedDraft.reason||'刷新前草稿交接尚未确认，已从缓存恢复原文；请复制并核对原对话')!==false||
      view.recovery?.()?.text===text)cachedDraft=null;
  }
  function offerRecovery(text,reason){
    cachedDraft??={text,reason};checkpoint();
    attempt(restoreDraft,'recovery-ui');
  }
  function ensureCache(snap,retry=false){
    if(!snap?.ok||!snap.route)return;
    if(cacheRoute===snap.route&&(cacheReady||!retry))return;
    // An active queue keeps its original conversation and cache key on SPA navigation.
    if(cacheRoute&&cacheRoute!==snap.route&&hasWork())return;
    cacheRoute=snap.route;cacheReady=false;
    const result=cache.read(cacheRoute);
    cacheStatus.status=result.status;
    if(!['empty','ready'].includes(result.status)){
      view?.toast('队列缓存无法读取，已保留原生草稿；不会覆盖原缓存');return;
    }
    cacheReady=true;
    if(result.status==='ready'){
      cachedDraft=result.data.draft;
      loadingCache=true;
      try{
        if(!engine.restoreCache(result.data,cacheRoute)){
          cacheReady=false;cacheStatus.status='invalid';return;
        }
        cacheStatus.restored=result.data.items.length;
        if(!cachedDraft)view.toast('已恢复 '+result.data.items.length+' 条缓存消息；请核对原对话后逐条恢复');
      }finally{loadingCache=false;}
      checkpoint();
    }
    restoreDraft();
  }
  const sameComposer=(before,snap)=>snap.ok&&snap.route===before.route&&
    snap.form===before.form&&snap.editor===before.editor;
  const remember=snap=>({...snap,users:[...snap.users],assistants:[...snap.assistants],
    history:snap.history?.slice()});
  function write(fn){editing=null;writing=true;try{return fn();}finally{writing=false;}}
  owner.onDispose(()=>{pending=null;provenance=null;backup=null;editing=null;});
  try{
    engine=createQueueEngine({site,checkpoint,change:()=>{
      checkpoint();
      progress();
      attempt(()=>remote?.changed(),'remote-change');
      // A UI observer must not throw between installing a flight and its write/click.
      if(checking)needsRender=true;
      else attempt(()=>view?.render(),'render-change');
    }});
    const notify=message=>attempt(()=>view?.toast(message),'toast');
    function blocked(){
      if(!owner.active()||retireForLegacy())return true;
      if(pending){notify('草稿交接尚未确认，请等待下一轮核对');return true;}
      const snap=site.inspect();
      ensureCache(snap,true);
      restoreDraft();
      observeProvenance(snap);
      observeBackup(snap);
      return false;
    }
    function recover(transfer,reason){
      offerRecovery(transfer.text,reason);
      if(transfer.id)engine.uncertain(transfer.id,reason,transfer.before);
      engine.wait(reason);
      checkpoint();
    }
    function sameHistory(before,snap){
      const same=(a,b)=>!a&&!b || !!a&&!!b&&a.length===b.length&&a.every((node,i)=>node===b[i]);
      if(!same(before.users,snap.users))return false;
      if(same(before.assistants,snap.assistants)&&same(before.history,snap.history))return true;
      // A reply already in progress may mount its assistant node after enqueue.
      // Allow only that append after the existing latest user, never replacement,
      // reordered history or a new user turn (which needs exact admission proof).
      const user=before.users.at(-1),reply=snap.assistants.at(-1);
      return !!before.busy&&!!user&&!!reply&&before.history?.at(-1)===user&&
        snap.assistants.length===before.assistants.length+1&&
        before.assistants.every((node,i)=>node===snap.assistants[i])&&
        snap.history?.length===before.history.length+1&&snap.history.at(-1)===reply&&
        before.history.every((node,i)=>node===snap.history[i]);
    }
    function observeProvenance(snap){
      if(!provenance)return;
      const transfer=provenance;
      // Dispatch owns its writes, but cannot release another queued draft's
      // protection. Its exact admission is reconciled after tick below.
      const flight=engine.view().inFlight;
      if(flight){if(flight.id===transfer.id)provenance=null;return;}
      if(transfer.edited&&transfer.draft!==''&&
        site.confirm?.(transfer.before,transfer.draft,snap)===true){
        if(snap.draft===''&&!snap.rich&&
          engine.observeNativeAdmission(transfer.before,transfer.draft,snap)){
          transfer.before=remember(snap);transfer.draft='';transfer.edited=false;return;
        }
        recover(transfer,'新草稿已原生入站但交接未确认，已保留队列原文；请核对');
        provenance=null;return;
      }
      if(site.confirm?.(transfer.before,transfer.text,snap)===true){
        if(snap.draft!==''||snap.rich)recover(transfer,'消息已入站但原生草稿仍有内容，已保留原文；请核对');
        engine.uncertain(transfer.id,'检测到原生消息入站，等待核对回复',transfer.before);
        provenance=null;
        // tick reconciles the exact admission and installs the normal reply gate.
        return;
      }
      if(!sameComposer(transfer.before,snap)||!sameHistory(transfer.before,snap)||
        (snap.rich||snap.draft!==transfer.draft)){
        recover(transfer,'入队后原生草稿或历史发生未确认变化，已保留原文；请核对输入框与队列');
        provenance=null;
      }else transfer.before=remember(snap);
    }
    function reconcile(snap){
      if(pending){
        const transfer=pending;
        const present=transfer.kind==='restore'||!!transfer.id&&engine.view().items.some(x=>x.id===transfer.id&&x.text===transfer.text);
        const expected=transfer.kind==='enqueue'?'':transfer.text;
        if(transfer.kind==='enqueue' && present &&
          site.confirm?.(transfer.before,transfer.text,snap)===true){
          if(snap.draft!==''||snap.rich)recover(transfer,'消息已入站但原生草稿仍有内容，已保留原文；请核对');
          engine.uncertain(transfer.id,'检测到原生消息入站，等待核对回复',transfer.before);
          pending=null;return;
        }
        if(!present||transfer.veto||!sameComposer(transfer.before,snap)||snap.rich||snap.composing||snap.draft!==expected||
          transfer.kind==='enqueue'&&!sameHistory(transfer.before,snap)){
          recover(transfer,'草稿交接结果未确认，已保留原文；请核对输入框与队列');
          pending=null;return;
        }
        if(transfer.kind==='enqueue')provenance={...transfer,before:remember(snap),draft:''};
        else{
          const ok=transfer.kind==='prepared'?engine.reclaimPrepared(transfer.id):
            transfer.id?engine.reclaim(transfer.id):true;
          if(!ok){recover(transfer,'队列状态已改变，取回未确认；请复制原文');pending=null;return;}
          provenance=null;
          backup={text:transfer.text,before:remember(snap)};
          notify(transfer.kind==='restore'?'原生草稿已恢复，保留备份':'已取回到输入框，取消排队');
        }
        pending=null;
      }
      observeProvenance(snap);
      observeBackup(snap);
    }
    function observeBackup(snap){
      if(!backup)return;
      if(site.confirm?.(backup.before,backup.text,snap)===true){backup=null;return;}
      if(!sameComposer(backup.before,snap)||snap.draft!==backup.text){
        recover(backup,'官网草稿在交接后发生变化，已保留完整原文；请复制核对');
        backup=null;
      }
    }
    owner.on(document,'beforeinput',event=>{
      if(!owner.active()||writing)return;
      const snap=site.inspect(),target=event.composedPath?.()[0]||event.target;
      if(target!==snap.editor&&!snap.editor?.contains?.(target))return;
      // Foreign events can veto a handoff, but cannot authorize discarding text.
      if(pending)pending.veto=true;
      observeProvenance(snap);
      observeBackup(snap);
      editing=event.isTrusted===true?{event,backup,provenance,draft:snap.draft,
        before:remember(snap)}:null;
    },true);
    owner.on(document,'input',event=>{
      if(!owner.active()||writing)return;
      const intent=editing;editing=null;
      if(!intent||intent.event.defaultPrevented||event.isTrusted!==true||event.defaultPrevented)return;
      const snap=site.inspect(),target=event.composedPath?.()[0]||event.target;
      if(!sameComposer(intent.before,snap)||snap.draft===intent.draft||
        (target!==snap.editor&&!snap.editor.contains?.(target)))return;
      if(intent.backup&&intent.backup===backup)backup=null;
      if(intent.provenance&&intent.provenance===provenance){
        provenance.draft=snap.draft;provenance.edited=true;
      }
      checkpoint();
    },true);
    const actions={
      enqueue(){
        if(blocked())return false;
        if(cachedDraft||view?.hasRecovery()){
          notify('请先复制上一条未入队的原草稿，再继续操作');return;
        }
        // A flight can still own the text it placed in the native editor.
        // Wait for exact admission before clearing it through either entry.
        if(engine.view().inFlight){
          notify('当前发送尚未确认，请先核对原对话；草稿已保留');return;
        }
        const snap=site.inspect();
        if(!snap.ok){notify(snap.reason);return;}
        // Reject invalid/full/mismatched queues without changing website text.
        const eligible=engine.checkEnqueue(snap.draft,snap.route);
        if(!eligible.ok){notify(eligible.reason);return;}
        const before=remember(snap);
        const transfer={kind:'enqueue',text:snap.draft,before};
        pending=transfer;
        if(!checkpoint()){
          pending=null;notify('队列缓存写入失败，原生草稿已保留；请检查浏览器存储后重试');return false;
        }
        let selected;
        try{selected=write(()=>site.clearForQueue(snap));}
        catch{recover(transfer,'清空草稿时发生异常，请复制原文核对');pending=null;return false;}
        if(!selected.ok){
          pending=null;
          if(selected.needsRecovery){
            offerRecovery(selected.text,selected.reason);
            engine.wait('草稿清空结果未确认，请先备份原文');
          }else notify(selected.reason);
          return;
        }
        if(!engine.enqueue(selected.text,snap.route)){
          pending={kind:'restore',text:selected.text,before};
          const fresh=site.inspect();
          let restored=false;
          if(sameComposer(before,fresh)&&!fresh.rich&&fresh.draft===''){
            try{restored=write(()=>site.restore(selected.text,''));}catch{/* Preserve the copy below. */}
          }
          if(!restored){
            pending=null;
            offerRecovery(selected.text,'未能恢复原生草稿，消息未入队；请复制原文');
            engine.wait('入列失败且原生草稿无法恢复，请先备份原文');
          }else{
            pending={kind:'restore',text:selected.text,before};
            backup=null;notify('队列状态变化，等待核对恢复的原生草稿');
          }
          return;
        }
        transfer.id=engine.view().items.at(-1)?.id;
        backup=null;
        checkpoint();
        return true;
      },
      edit(id){
        if(blocked()||view?.hasRecovery())return false;
        // No inline editor. Put this message back into ChatGPT's existing
        // composer and cancel its queued-send authorization.
        const state=engine.view(),item=state.items.find(x=>x.id===id);
        if(item?.state==='unknown'){
          const snap=site.inspect();
          if(!snap.ok||snap.route!==state.route||snap.draft!==item.text||snap.rich){
            notify('无法确认此条尚未发送，请核对原对话；不会自动重发');return false;
          }
          pending={kind:'prepared',id,text:item.text,before:remember(snap)};
          try{write(()=>snap.editor?.focus?.());}
          catch{recover(pending,'聚焦输入框时发生异常，请复制原文核对');pending=null;return false;}
          notify('等待核对原输入框草稿，尚未取消排队');return true;
        }
        if(!item || state.inFlight || ['unknown','sending','confirmed'].includes(item.state)){
          notify('这条消息正在发送或结果未知，暂不能取回');return false;
        }
        const snap=site.inspect();
        if(!snap.ok||snap.route!==state.route){
          notify('请返回原对话后再取回');return false;
        }
        if(snap.rich||snap.draft!==''){
          notify('输入框已有草稿或附件，请先发送或加入队列');
          snap.editor?.focus();return false;
        }
        const transfer={kind:'reclaim',id,text:item.text,before:remember(snap)};
        pending=transfer;
        if(item.state!=='paused'&&!engine.pause(id)){pending=null;return false;}
        if(!checkpoint()){
          pending=null;notify('队列缓存写入失败，消息已保留在队列');return false;
        }
        let result;
        try{result=write(()=>site.reclaimToComposer(item.text,snap));}
        catch{recover(transfer,'取回草稿时发生异常，请复制原文核对');pending=null;return false;}
        if(!result.ok){
          pending=null;
          if(result.mayHaveWritten)recover(transfer,result.reason||'取回未确认，请复制原文');
          notify(result.reason||'无法安全取回，请检查输入框');return false;
        }
        notify('草稿已写入，等待下一轮核对后取消排队');return true;
      },
      remove(id){
        const state=engine.view();
        const unknown=state.inFlight?.id===id&&state.inFlight.phase==='unknown';
        if(!state.items.some(item=>item.id===id)||(state.inFlight?.id===id&&!unknown))return false;
        const next={...state,items:state.items.filter(item=>item.id!==id),
          inFlight:state.inFlight?.id===id?null:state.inFlight};
        if(!checkpoint(next,id)){
          notify('删除未保存，消息仍保留在队列；请恢复浏览器存储后重试');return false;
        }
        const removed=engine.remove(id);
        if(removed&&provenance?.id===id)provenance=null;
        if(removed)checkpoint();
        if(removed&&unknown)notify('已从队列删除；发送结果可能已生效，请检查原对话');
        return removed;
      },
      pause(id){
        const ok=engine.pause(id);
        if(!ok)notify('此消息正在发送或状态未知，暂不能暂停');
        return ok;
      },
      resume(id){
        const ok=engine.resume(id);
        if(!ok)notify('此消息正在发送或状态未知，暂不能恢复');
        return ok;
      },
      sendNow(id){
        if(blocked())return false;
        if(view?.hasRecovery()){
          notify('请先复制未入队的原草稿，再强制发送');return false;
        }
        const result=engine.requestNow(id);
        if(!result.ok)notify(result.reason||'当前状态不能强制发送');
        return result.ok;
      }
    };
    view=createQueueView({owner,createPageUI,assets,engine,onRecoveryChange:checkpoint,
      actions:Object.fromEntries(Object.entries(actions).map(([name,action])=>
        [name,(...args)=>{if(owner.active()&&!retireForLegacy()){
          try{return action(...args);}finally{checkpoint();}
        }}] ))});
    // The fixed remote adapter is in USER_SCRIPT, not the website's JS world.
    remote=createSendQueueRemote({owner,site,engine,actions,retireForLegacy});
    if(globalThis.OpenDeskAppPage)
      registerPageStatus({bridge:globalThis.OpenDeskAppPage,owner,site,view,version:'0.1.26'});
    // One managed capture listener follows native editor replacements.
    // Ctrl+Enter reuses the crown button's guarded enqueue action; plain Enter
    // only falls back to the queue when native sending is unavailable.
    owner.on(document,'keydown',event=>{
      if(event.isTrusted!==true||event.key!=='Enter'||event.shiftKey||event.altKey||event.metaKey||
        event.defaultPrevented||event.isComposing||event.keyCode===229||composing||
        Date.now()-compositionEndedAt<100||!owner.active()||retireForLegacy())return;
      const queueShortcut=event.ctrlKey===true;
      const state=engine.view();
      if(!queueShortcut&&!state.items.length)return;
      const snap=site.inspect(),target=event.composedPath?.()[0]||event.target;
      if(!snap.ok||(!queueShortcut&&snap.route!==state.route)||!snap.editor||
        (target!==snap.editor&&!snap.editor.contains?.(target))||
        (!queueShortcut&&!snap.draft))return;
      if(queueShortcut){
        // Consume the key before enqueuing so ChatGPT cannot also submit it.
        event.preventDefault();event.stopImmediatePropagation();
        if(!event.repeat&&actions.enqueue())notify('草稿已加入发送队列');
        return;
      }
      const send=snap.sendButton;
      const disabled=!!send&&(send.disabled||send.getAttribute('aria-disabled')==='true');
      // An enabled official send always keeps its normal keyboard behavior,
      // including sites that permit native sending during a response.
      if((send&&!disabled)||(!snap.busy&&!disabled))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(event.repeat)return;
      if(state.phase==='unknown'||state.inFlight||state.items.some(item=>item.state==='unknown')){
        notify('当前发送尚未确认，请先核对原对话；草稿已保留');return;
      }
      if(actions.enqueue())notify('官网当前无法发送，草稿已加入发送队列');
    },true);
    owner.on(window,'beforeunload',event=>{
      if(!owner.active()||(!pending&&!provenance&&!backup&&!cachedDraft&&!engine.view().items.length&&!view?.hasRecovery()))return;
      if(checkpoint())return;
      event.preventDefault();event.returnValue='';
    });
    // All schedules share this gate and the original engine; no timeout proves a reply complete.
    function poll(source='poll'){
      if(checking){diagnostics.coalesced++;return;}
      if(!owner.active()||retireForLegacy())return;
      checking=true;checkFailed=false;needsRender=false;
      diagnostics.lastCheckStartedAt=Date.now();diagnostics.checks++;
      if(source==='poll')diagnostics.lastPollAt=Date.now();
      try{
        let snap,placed=false,recovery=true;
        const reconciled=attempt(()=>{snap=site.inspect();ensureCache(snap);restoreDraft();reconcile(snap);},'reconcile');
        if(reconciled)attempt(()=>{
          if(snap.ok){placed=view.place(snap);view.render();}
          else view.hide();
          recovery=!!cachedDraft||view.hasRecovery();
        },'layout');
        if(!owner.active()||retireForLegacy())return;
        const flight=engine.view().inFlight;
        // Even a failed UI round must reconcile late admission and existing deadlines.
        const ticked=attempt(()=>engine.tick({canSubmit:!checkFailed&&placed&&!pending&&!recovery&&checkpoint()}),'queue-check');
        if(ticked&&reconciled)attempt(()=>{
          const after=engine.view();
          if(provenance&&after.inFlight?.id===provenance.id)provenance=null;
          else if(provenance&&flight&&after.lastConfirmed===flight.id&&!after.inFlight){
            // Advance only history proved by this item's exact admission.
            provenance.before={...provenance.before,users:[...snap.users],
              assistants:[...snap.assistants],history:snap.history?.slice(),busy:snap.busy};
            observeProvenance(snap);
          }
        },'provenance');
        if(needsRender)attempt(()=>view.render(),'render-change');
        checkpoint();
        progress();
        if(!checkFailed)diagnostics.lastCheckCompletedAt=Date.now();
      }finally{checking=false;}
    }
    function recoverPolling(source){
      if(checking){diagnostics.coalesced++;return;}
      if(!owner.active()||retireForLegacy())return;
      attempt(()=>{
        if(!hasWork())return;
        progress();
        const now=Date.now();
        // Keep fallback checks alive while the normal schedule is absent, even
        // after fallback progress: a prepared draft still has its original 6s deadline.
        const missed=now-diagnostics.lastPollAt>=STALL_MS;
        const failed=now-(diagnostics.lastCheckCompletedAt??started)>=STALL_MS;
        const stalled=now-diagnostics.lastProgressAt>=STALL_MS;
        if(source==='watchdog'&&!missed&&!failed&&!stalled)return;
        diagnostics.lastRecoveryAt=now;diagnostics.recoveries++;
        diagnostics.recoveryReason=source==='watchdog'?(missed||failed?'check-stalled':'progress-stalled'):source;
        poll(source);
      },'recovery-check');
    }
    owner.setInterval(poll,POLL_MS);
    owner.setInterval(()=>recoverPolling('watchdog'),WATCHDOG_MS);
    owner.on(document,'visibilitychange',()=>{
      if(document.visibilityState==='visible')recoverPolling('visible');
    });
    owner.on(window,'pageshow',()=>recoverPolling('pageshow'));
    let snap;
    attempt(()=>{
      snap=site.inspect();
      ensureCache(snap);
      if(snap.ok){view.place(snap);view.render();}
    },'initial-layout');
    progress();
    return {programId:ID,status:'active',runtime:'USER_SCRIPT',
      persistence:'session-storage',cache:cacheStatus,composer:snap?.ok?'detected':'not-detected',diagnostics};
  }catch(error){owner.destroy();throw error;}
}
