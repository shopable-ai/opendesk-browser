import {createPageUI} from '@opendesk/ui';
import {createChatGPTSite} from './site.js';
import {createQueueEngine} from './engine.js';
import {createQueueView} from './view.js';
import {createSendQueueRemote} from './remote.js';

const ID='app.ai-send-queue';
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
  const sameComposer=(before,snap)=>snap.ok&&snap.route===before.route&&
    snap.form===before.form&&snap.editor===before.editor;
  const remember=snap=>({...snap,users:[...snap.users],assistants:[...snap.assistants],
    history:snap.history?.slice()});
  function write(fn){editing=null;writing=true;try{return fn();}finally{writing=false;}}
  owner.onDispose(()=>{pending=null;provenance=null;backup=null;editing=null;});
  try{
    engine=createQueueEngine({site,change:()=>{remote?.changed();view?.render();}});
    const notify=message=>view?.toast(message);
    function blocked(){
      if(!owner.active()||retireForLegacy())return true;
      if(pending){notify('草稿交接尚未确认，请等待下一轮核对');return true;}
      const snap=site.inspect();
      observeProvenance(snap);
      observeBackup(snap);
      return false;
    }
    function recover(transfer,reason){
      if(transfer.id)engine.uncertain(transfer.id,reason,transfer.before);
      engine.wait(reason);
      view.offerRecovery(transfer.text,reason);
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
    },true);
    const actions={
      enqueue(){
        if(blocked())return false;
        if(view?.hasRecovery()){
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
        let selected;
        try{selected=write(()=>site.clearForQueue(snap));}
        catch{recover(transfer,'清空草稿时发生异常，请复制原文核对');pending=null;return false;}
        if(!selected.ok){
          pending=null;
          if(selected.needsRecovery){
            engine.wait('草稿清空结果未确认，请先备份原文');
            view.offerRecovery(selected.text,selected.reason);
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
            engine.wait('入列失败且原生草稿无法恢复，请先备份原文');
            view.offerRecovery(selected.text,'未能恢复原生草稿，消息未入队；请复制原文');
          }else{
            pending={kind:'restore',text:selected.text,before};
            backup=null;notify('队列状态变化，等待核对恢复的原生草稿');
          }
          return;
        }
        transfer.id=engine.view().items.at(-1)?.id;
        backup=null;
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
        const removed=engine.remove(id);
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
    view=createQueueView({owner,createPageUI,assets,engine,
      actions:Object.fromEntries(Object.entries(actions).map(([name,action])=>
        [name,(...args)=>{if(owner.active()&&!retireForLegacy())return action(...args);}] ))});
    // The fixed remote adapter is in USER_SCRIPT, not the website's JS world.
    remote=createSendQueueRemote({owner,site,engine,actions,retireForLegacy});
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
      if(!owner.active()||(!pending&&!provenance&&!backup&&!engine.view().items.length&&!view?.hasRecovery()))return;
      event.preventDefault();event.returnValue='';
    });
    // Reconcile only every 650ms; no timer infers completion from idle text.
    function poll(){
      if(!owner.active()||retireForLegacy())return;
      const snap=site.inspect();
      reconcile(snap);
      let placed=false;
      if(snap.ok){placed=view.place(snap);view.render();}
      else view.hide();
      // Layout/recovery can veto new writes; confirmation and deadlines still run.
      const flight=engine.view().inFlight;
      engine.tick({canSubmit:placed&&!pending&&!view.hasRecovery()});
      const after=engine.view();
      if(provenance&&after.inFlight?.id===provenance.id)provenance=null;
      else if(provenance&&flight&&after.lastConfirmed===flight.id&&!after.inFlight){
        // Advance only the history proved by another item's exact admission;
        // retain the original composer identity and expected user draft.
        provenance.before={...provenance.before,users:[...snap.users],
          assistants:[...snap.assistants],history:snap.history?.slice(),busy:snap.busy};
        observeProvenance(snap);
      }
    }
    owner.setInterval(poll,650);
    const snap=site.inspect();
    if(snap.ok){view.place(snap);view.render();}
    return {programId:ID,status:'active',runtime:'USER_SCRIPT',
      persistence:'memory-only',composer:snap.ok?'detected':'not-detected'};
  }catch(error){owner.destroy();throw error;}
}
