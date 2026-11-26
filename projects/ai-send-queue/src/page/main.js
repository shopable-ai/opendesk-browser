import {createPageUI} from '@opendesk/ui';
import {createChatGPTSite,createGeminiSite,geminiRoute,createDeepSeekSite,deepSeekRoute} from './site.js';
import {createQueueEngine} from './engine.js';
import {createQueueView} from './view.js';
import {createSendQueueRemote} from './remote.js';
import {createQueueCache} from './cache.js';
import {registerPageStatus} from './status.js';

const ID='app.ai-send-queue';
const POLL_MS=650, WATCHDOG_MS=5000, STALL_MS=30000, FIRST_ACK_MS=15000;
// Never take over the legacy queue.
const LEGACY_LIFECYCLES=['opendesk.chatgpt-send-queue','opendesk.ai-send-queue']
  .map(id=>'[data-opendesk-ui-owner][data-od-id="'+id+'.lifecycle"]');
const legacyActive=()=>LEGACY_LIFECYCLES.some(selector=>document.querySelector(selector));
const pageRules={matches:['https://chatgpt.com/*','https://gemini.google.com/*','https://chat.deepseek.com/a/chat/s/*','https://chat.deepseek.com/'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

export default function main({assets}={}) {
  return runQueue({assets,createRemote:createSendQueueRemote});
}

export async function runQueue({assets,fixed,createRemote}={}) {
  const chatgpt=window.location.origin==='https://chatgpt.com';
  const allowDeepSeekHome=fixed?.deepSeekHome===true;
  const deepseek=!!fixed&&!!deepSeekRoute(window.location,allowDeepSeekHome);
  if(window!==window.top||(!chatgpt&&!deepseek&&!geminiRoute(window.location)))
    return {programId:ID,status:'skipped'};
  if(legacyActive())
    return {programId:ID,status:'skipped',reason:'legacy-active'};
  const owner=createPageUI({id:ID+'.lifecycle',assets,pageRules,baseStyles:false});
  fixed?.own(owner);
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  function retireForLegacy(){
    if(!legacyActive())return false;
    owner.destroy();
    return true;
  }
  let composing=false,compositionEndedAt=-Infinity;
  const site=(chatgpt?createChatGPTSite:deepseek?createDeepSeekSite:createGeminiSite)({
    isComposing:()=>composing,allowHome:allowDeepSeekHome});
  owner.on(document,'compositionstart',()=>{composing=true;},true);
  owner.on(document,'compositionend',()=>{composing=false;compositionEndedAt=Date.now();},true);
  let view=null,engine,remote=null;
  let pending=null,provenance=null,backup=null,editing=null,writing=false;
  let firstSend=null;
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
      diagnostics.lastError={stage,type:error?.name==='TypeError'?'TypeError':'Error'};
      return false;
    }
  }
  function progress(state=engine.view()){
    const key=JSON.stringify([state.items.map(item=>[item.id,item.state]),state.phase,
      state.inFlight?.id,state.inFlight?.phase,Boolean(state.answerGate),state.lastConfirmed,
      pending?.kind,pending?.id,Boolean(provenance),Boolean(backup)]);
    if(key!==lastProgressKey){lastProgressKey=key;diagnostics.lastProgressAt=Date.now();}
  }
  function hasWork(){
    const state=engine.view();
    return !!(state.items.length||state.inFlight||state.answerGate||pending||provenance||backup||cachedDraft||view?.hasRecovery());
  }
  function cacheFeedback(status){
    const previous=cacheStatus.status;
    cacheStatus.status=status;
    const message=status==='write-failed'?
      '队列未保存。刷新或关闭页面可能丢失待发消息。':
      ['invalid','unavailable'].includes(status)?
        '暂时无法读取已保存的队列。':'';
    attempt(()=>{
      view?.setCacheWarning?.(message);
      if(status==='saved'&&['write-failed','invalid','unavailable'].includes(previous))
        view?.toast('队列缓存已恢复保存',{variant:'success'});
    },'cache-feedback');
  }
  function checkpoint(state=engine.view(),removing=null){
    if(loadingCache)return true;
    if(!cacheReady||!cacheRoute)return false;
    const transfer=pending||(provenance?.id!==removing?provenance:null)||backup;
    const retained=transfer?.id&&state.items.some(item=>item.id===transfer.id&&item.text===transfer.text);
    const recovery=view?.recovery?.();
    const text=cachedDraft?.text||recovery?.text||backup?.text||(!retained&&transfer?.text)||null;
    const ok=cache.write({version:1,route:cacheRoute,
      items:state.items.map(({id,text,state})=>({id,text,state})),
      expanded:!!state.expanded,inFlight:state.inFlight?{id:state.inFlight.id}:null,
      draft:text?{text}:null});
    cacheFeedback(ok?'saved':'write-failed');
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
    if(cacheRoute&&cacheRoute!==snap.route&&hasWork())return;
    cacheRoute=snap.route;cacheReady=false;
    const result=cache.read(cacheRoute);
    cacheFeedback(result.status);
    if(!['empty','ready'].includes(result.status)){
      return;
    }
    cacheReady=true;
    if(result.status==='ready'){
      cachedDraft=result.data.draft;
      loadingCache=true;
      try{
        if(!engine.restoreCache(result.data,cacheRoute)){
          cacheReady=false;cacheFeedback('invalid');return;
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
  owner.onDispose(()=>{pending=null;provenance=null;backup=null;editing=null;firstSend=null;});
  try{
    engine=createQueueEngine({site,checkpoint,change:()=>{
      checkpoint();
      progress();
      attempt(()=>remote?.changed(),'remote-change');
      // UI exceptions must not interrupt dispatch.
      if(checking)needsRender=true;
      else attempt(()=>view?.render(),'render-change');
    }});
    const notify=(message,options)=>attempt(()=>view?.toast(message,options),'toast');
    const reportError=message=>notify(message,{variant:'warning',copyable:true});
    const unknownFirst='首条消息发送结果尚未确认，请核对网页；不会自动重发';
    function reconcileFirst(snap){
      if(!firstSend)return;
      const before=site.firstAdmission(firstSend.before,snap);
      if(before){
        if(firstSend.unknown)view?.clearError?.(unknownFirst);
        firstSend=null;
        engine.observeNativeAdmission(before,before.draft,snap,{initial:true});
      }else if(!firstSend.unknown&&Date.now()-firstSend.started>FIRST_ACK_MS){
        firstSend.unknown=true;
        reportError(unknownFirst);
      }
    }
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
      const retained=transfer.kind==='enqueue'&&!!transfer.id&&
        engine.view().items.some(item=>item.id===transfer.id&&item.text===transfer.text);
      const marked=retained&&engine.uncertain(transfer.id,reason,transfer.before)===true;
      if(marked)notify('原文仍在队列中，此条已暂停自动发送；请核对原对话，不会自动重发');
      else{
        offerRecovery(transfer.text,reason);
        if(transfer.id)engine.uncertain(transfer.id,reason,transfer.before);
      }
      engine.wait(reason);
      if(!checkpoint()&&marked)offerRecovery(transfer.text,'队列备份保存未确认，请复制原文并核对原对话');
    }
    function observeProvenance(snap){
      if(!provenance)return;
      const transfer=provenance;
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
        return;
      }
      if(!sameComposer(transfer.before,snap)||!site.sameHistory(transfer.before,snap,transfer.confirmedQueueUser)||
        (snap.rich||snap.draft!==transfer.draft)){
        recover(transfer,'入队后原生草稿或历史发生未确认变化，已保留原文；请核对输入框与队列');
        provenance=null;
      }else{
        transfer.before=remember(snap);
        if(snap.history?.at(-1)!==transfer.confirmedQueueUser)transfer.confirmedQueueUser=null;
      }
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
          transfer.kind==='enqueue'&&!site.sameHistory(transfer.before,snap)){
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
      if(site.confirm?.(backup.before,backup.text,snap)===true){
        if(backup.nativeAdmission)engine.observeNativeAdmission(backup.before,backup.text,snap);
        backup=null;return;
      }
      if(!sameComposer(backup.before,snap)||snap.draft!==backup.text){
        recover(backup,'官网草稿在交接后发生变化，已保留完整原文；请复制核对');
        backup=null;
      }
    }
    function pausedGeminiEnqueue(transfer){
      if(chatgpt||deepseek||transfer?.kind!=='enqueue')return false;
      const state=engine.view();
      return state.route===transfer.before.route&&!state.inFlight&&state.items.some(item=>
        item.id===transfer.id&&item.text===transfer.text&&item.state==='paused');
    }
    owner.on(document,'beforeinput',event=>{
      if(!owner.active()||writing)return;
      const snap=site.inspect(),target=event.composedPath?.()[0]||event.target;
      if(target!==snap.editor&&!snap.editor?.contains?.(target))return;
      const handoff=event.isTrusted===true&&pending&&!pending.veto&&pausedGeminiEnqueue(pending)&&
        sameComposer(pending.before,snap)&&snap.draft===''&&!snap.rich&&!snap.composing&&
        site.sameHistory(pending.before,snap)?pending:null;
      // Foreign events can only veto a handoff.
      if(pending)pending.veto=true;
      if(!handoff)observeProvenance(snap);
      observeBackup(snap);
      editing=event.isTrusted===true?{event,backup,provenance,handoff,draft:snap.draft,
        flight:engine.view().inFlight,before:remember(snap)}:null;
    },true);
    owner.on(document,'input',event=>{
      if(!owner.active()||writing)return;
      const intent=editing;editing=null;
      if(!intent||intent.event.defaultPrevented||event.isTrusted!==true||event.defaultPrevented)return;
      const snap=site.inspect(),target=event.composedPath?.()[0]||event.target;
      if(!sameComposer(intent.before,snap)||snap.draft===intent.draft||
        (target!==snap.editor&&!snap.editor.contains?.(target)))return;
      if(intent.backup&&intent.backup===backup)
        backup=backup.nativeAdmission&&snap.draft?{text:snap.draft,before:remember(snap),nativeAdmission:true}:null;
      if(intent.handoff&&intent.handoff===pending&&pausedGeminiEnqueue(pending)&&
        !snap.rich&&!snap.composing&&site.sameHistory(intent.before,snap)){
        provenance={...pending,before:remember(snap),draft:snap.draft,edited:true};
        pending=null;
      }else if(intent.provenance&&intent.provenance===provenance){
        provenance.draft=snap.draft;provenance.edited=true;
      }
      if(intent.flight&&['await-native-ready','unknown'].includes(intent.flight.phase)){
        backup=snap.draft?{text:snap.draft,before:remember(snap),nativeAdmission:true}:null;
        if(engine.reclaimEditedPrepared?.(intent.flight.id,intent.before,snap))
          notify('已接管输入框编辑，取消此条自动排队');
      }
      checkpoint();
    },true);
    const actions={
      enqueue({paused=false,sendQueuedIfEmpty=false}={}){
        if(blocked())return false;
        const snap=site.inspect();
        reconcileFirst(snap);
        if(firstSend){
          if(firstSend.unknown)reportError(unknownFirst);
          else notify('正在等待首条消息创建对话');
          return false;
        }
        const sendQueued=sendQueuedIfEmpty&&!paused&&snap.ok&&snap.draft==='';
        if(!sendQueued&&deepseek&&!currentRoute()?.route){
          notify('请先用 DeepSeek 的发送按钮发送首条消息，建立对话后即可加入队列。草稿已保留。');
          return false;
        }
        if(cachedDraft||view?.hasRecovery()){
          notify('请先核对并处理上一次草稿交接的备份，再继续操作');return;
        }
        const state=engine.view();
        if(state.inFlight){
          notify('当前发送尚未确认，请先核对原对话；草稿已保留');return;
        }
        if(!snap.ok){notify(snap.reason);return;}
        if(sendQueued){
          if(snap.rich||snap.composing){notify('请先处理原生附件或输入法');return false;}
          if(!state.items.length){notify('发送队列为空');return false;}
          if(snap.route!==state.route){notify('请返回原对话发送队列消息');return false;}
          if(!state.items.some(item=>item.state==='queued')){notify('请先恢复要发送的队列消息');return false;}
          pollAuthorized('send-click');
          return true;
        }
        if(chatgpt&&sendQueuedIfEmpty&&!paused&&snap.route===null&&window.location.pathname==='/'){
          if(state.items.length||state.answerGate){reportError('请先返回原对话处理待发消息；草稿已保留');return false;}
          if(!site.normal(snap.draft)){reportError('原生草稿为空');return false;}
          if(Date.now()-compositionEndedAt<100){reportError('请先完成输入法编辑；草稿已保留');return false;}
          firstSend={before:remember(snap),started:Date.now(),unknown:false};
          const result=site.submitFirst(snap);
          if(result.stage==='before-click'){firstSend=null;reportError(result.reason);return false;}
          if(!result.ok){firstSend.unknown=true;reportError(unknownFirst);return false;}
          view?.clearError?.();
          return true;
        }
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
        if(!engine.enqueue(selected.text,snap.route,{paused})){
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
          notify('请先核对并处理草稿交接的备份，再提前发送');return false;
        }
        const result=engine.requestNow(id);
        if(!result.ok)notify(result.reason||'当前状态不能强制发送');
        return result.ok;
      }
    };
    function getBackup({availabilityOnly=false,snapshot}={}){
      if(!owner.active()||(!availabilityOnly&&retireForLegacy()))return '';
      const state=engine.view();
      let snap=snapshot;
      if(!snap){
        try{snap=site.inspect();}catch{} // A missing editor cannot hide the memory backup.
      }
      const drafts=[pending?.text,pending?.draft,provenance?.text,provenance?.draft,
        backup?.text,cachedDraft?.text,view?.recovery?.()?.text,
        snap?.ok&&snap.route===cacheRoute?snap.draft:null]
        .filter(text=>typeof text==='string'&&text.length);
      if(availabilityOnly)return !!(state.items.length||drafts.length);
      const parts=state.items.map((item,i)=>'消息 '+(i+1)+'\n'+item.text);
      for(const text of new Set(drafts))
        parts.push('草稿备份\n'+text);
      return parts.length?'发送队列备份 · 请核对原对话，备份不会自动发送\n对话：'+
        (state.route||cacheRoute)+'\n\n'+parts.join('\n\n'):'';
    }
    function withGrant(run,{checkComposer=false}={}){
      if(!fixed)return run();
      const before=checkComposer?site.inspect():null,url=window.location.href;
      return fixed.authorize().then(allowed=>{
        if(!allowed||!owner.active()||retireForLegacy()||window.location.href!==url)return false;
        if(before){
          const after=site.inspect();
          if(!sameComposer(before,after)||before.draft!==after.draft||before.rich!==after.rich||
            !site.sameHistory(before,after)||composing){
            reportError('输入框已变化，草稿已保留，请重试');return false;
          }
        }
        return run();
      }).catch(()=>{reportError('暂时无法确认队列授权，请重试');return false;});
    }
    const routeFor=chatgpt?null:deepseek?location=>deepSeekRoute(location,allowDeepSeekHome):geminiRoute;
    const currentRoute=routeFor?()=>routeFor(window.location):null;
    view=createQueueView({owner,createPageUI,assets,engine,getBackup,onRecoveryChange:checkpoint,currentRoute,
      trustedActions:!!fixed,
      actions:Object.fromEntries(Object.entries(actions).map(([name,action])=>
        [name,(...args)=>{if(owner.active()&&!retireForLegacy()){
          return withGrant(()=>{try{return action(...args);}finally{checkpoint();}},
            {checkComposer:name==='enqueue'||name==='edit'});
        }}] ))});
    if(currentRoute){
      const updateRouteDisplay=()=>view.render();
      if(window.navigation)owner.on(window.navigation,'currententrychange',event=>{
        const from=event.isTrusted&&URL.canParse(event.from?.url)?routeFor(new URL(event.from.url))?.route:null;
        const transfer=provenance;
        if(from&&from!==currentRoute()?.route&&transfer?.before.route===from&&
          !pending&&!backup&&!transfer.edited&&transfer.draft===''){
          const state=engine.view();
          if(state.route===from&&!state.inFlight&&state.items.every(item=>item.state==='paused')&&
            state.items.some(item=>item.id===transfer.id&&item.text===transfer.text))provenance=null;
        }
        updateRouteDisplay();
      });
      else owner.on(window,'popstate',updateRouteDisplay);
    }
    if(deepseek)owner.on(window,'resize',()=>{
      if(!owner.active()||retireForLegacy())return;
      const snap=site.inspect();
      if(snap.ok){view.place(snap);view.render(snap);}
      else view.hide();
    });
    remote=createRemote?.({owner,site,engine,actions,retireForLegacy})??null;
    const bridge=fixed?.bridge??globalThis.OpenDeskAppPage;
    if(bridge)registerPageStatus({bridge,owner,site,view,version:'1.0.3'});
    owner.on(document,'click',event=>{
      if(event.isTrusted!==true||!owner.active()||!engine.view().inFlight)return;
      const snap=site.inspect(),target=event.composedPath?.()[0]||event.target;
      if(snap.ok&&snap.sendButton&&(target===snap.sendButton||snap.sendButton.contains?.(target)))
        engine.observeNativeAttempt(snap);
    },true);
    owner.on(document,'keydown',event=>{
      if(event.isTrusted!==true||event.key!=='Enter'||
        event.defaultPrevented||event.isComposing||event.keyCode===229||composing||
        Date.now()-compositionEndedAt<100||!owner.active()||retireForLegacy())return;
      const queueShortcut=event.ctrlKey===true;
      const state=engine.view();
      if(!queueShortcut&&!state.items.length)return;
      const snap=site.inspect(),target=event.composedPath?.()[0]||event.target;
      if(!snap.ok||(!queueShortcut&&snap.route!==state.route)||!snap.editor||
        (target!==snap.editor&&!snap.editor.contains?.(target))||
        (!queueShortcut&&!snap.draft))return;
      if(event.shiftKey||event.altKey||event.metaKey){
        if(!event.shiftKey&&state.inFlight)engine.observeNativeAttempt(snap);
        return;
      }
      if(queueShortcut){
        // Prevent a duplicate native send.
        event.preventDefault();event.stopImmediatePropagation();
        if(!event.repeat)void withGrant(()=>{
          if(actions.enqueue())notify('草稿已加入发送队列');
        },{checkComposer:true});
        return;
      }
      const send=snap.sendButton;
      const disabled=!!send&&(send.disabled||send.getAttribute('aria-disabled')==='true');
      if((send&&!disabled)||(!snap.busy&&!disabled)){
        if(state.inFlight)engine.observeNativeAttempt(snap);
        return;
      }
      event.preventDefault();event.stopImmediatePropagation();
      if(event.repeat)return;
      if(state.phase==='unknown'||state.inFlight||state.items.some(item=>item.state==='unknown')){
        notify('当前发送尚未确认，请先核对原对话；草稿已保留');return;
      }
      void withGrant(()=>{
        if(actions.enqueue())notify('官网当前无法发送，草稿已加入发送队列');
      },{checkComposer:true});
    },true);
    owner.on(window,'beforeunload',()=>{
      if(owner.active())checkpoint();
    });
    let authorizing=false;
    function poll(source='poll'){
      if(!fixed||!hasWork()||deepseek&&!currentRoute()?.route)return pollAuthorized(source);
      if(authorizing)return;
      authorizing=true;
      return fixed.authorize().then(allowed=>{if(allowed)pollAuthorized(source);})
        .finally(()=>{authorizing=false;});
    }
    function pollAuthorized(source){
      if(checking){diagnostics.coalesced++;return;}
      if(!owner.active()||retireForLegacy())return;
      checking=true;checkFailed=false;needsRender=false;
      diagnostics.lastCheckStartedAt=Date.now();diagnostics.checks++;
      if(source==='poll')diagnostics.lastPollAt=Date.now();
      try{
        let snap,placed=false,recovery=true;
        const reconciled=attempt(()=>{snap=site.inspect();ensureCache(snap);restoreDraft();reconcileFirst(snap);reconcile(snap);},'reconcile');
        if(reconciled)attempt(()=>{
          if(snap.ok){placed=view.place(snap);view.render(snap);}
          else view.hide();
          recovery=!!cachedDraft||view.hasRecovery();
        },'layout');
        if(!owner.active()||retireForLegacy())return;
        const flight=engine.view().inFlight;
        // Reconcile receipts and deadlines even if rendering fails.
        const ticked=attempt(()=>{
          const canSubmit=!checkFailed&&placed&&(!deepseek||!!snap?.route)&&!pending&&!firstSend&&!recovery&&
            engine.view().phase!=='unknown'&&checkpoint();
          const submitBlockReason=checkFailed?'本轮队列检查异常':!placed?'队列控件尚未安全显示':
            pending?'草稿交接尚未确认':recovery?'恢复草稿尚待核对':'队列缓存未保存';
          engine.tick({canSubmit,submitBlockReason});
        },'queue-check');
        if(ticked&&reconciled)attempt(()=>{
          const after=engine.view();
          if(provenance&&after.inFlight?.id===provenance.id)provenance=null;
          else if(provenance&&flight&&after.lastConfirmed===flight.id&&!after.inFlight){
            provenance.before={...provenance.before,users:[...snap.users],
              assistants:[...snap.assistants],history:snap.history?.slice(),busy:snap.busy};
            const user=after.answerGate?.confirmedUser;
            provenance.confirmedQueueUser=user&&snap.history?.at(-1)===user?user:null;
            observeProvenance(snap);
          }
        },'provenance');
        if(needsRender)attempt(()=>view.render(snap),'render-change');
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
      if(snap.ok){view.place(snap);view.render(snap);}
    },'initial-layout');
    progress();
    return {programId:ID,status:'active',runtime:fixed?'ISOLATED':'USER_SCRIPT',
      persistence:'session-storage',cache:cacheStatus,composer:snap?.ok?'detected':'not-detected',diagnostics};
  }catch(error){owner.destroy();throw error;}
}
