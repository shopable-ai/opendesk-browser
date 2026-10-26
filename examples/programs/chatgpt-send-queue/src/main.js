import {createPageUI} from '@opendesk/ui';
import {createChatGPTSite} from './site.js';
import {createQueueEngine} from './engine.js';
import {createQueueView} from './view.js';

const ID='opendesk.ai-send-queue';
// A separate installation must never take over the legacy in-memory queue.
const LEGACY_LIFECYCLE='[data-opendesk-ui-owner][data-od-id="opendesk.chatgpt-send-queue.lifecycle"]';
const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

export default async function main({assets}={}) {
  if(window!==window.top||window.location.origin!=='https://chatgpt.com')
    return {programId:ID,status:'skipped'};
  if(document.querySelector(LEGACY_LIFECYCLE))
    return {programId:ID,status:'skipped',reason:'legacy-active'};
  const owner=createPageUI({id:ID+'.lifecycle',assets,pageRules,baseStyles:false});
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  function retireForLegacy(){
    if(!document.querySelector(LEGACY_LIFECYCLE))return false;
    owner.destroy();
    return true;
  }
  let composing=false;
  const site=createChatGPTSite({isComposing:()=>composing});
  owner.on(document,'compositionstart',()=>{composing=true;},true);
  owner.on(document,'compositionend',()=>{composing=false;},true);
  let view=null,engine;
  try{
    engine=createQueueEngine({site,change:()=>view?.render()});
    const notify=message=>view?.toast(message);
    const actions={
      enqueue(){
        if(view?.hasRecovery()){
          notify('请先复制上一条未入队的原草稿，再继续操作');return;
        }
        const snap=site.inspect();
        if(!snap.ok){notify(snap.reason);return;}
        // Reject invalid/full/mismatched queues without changing website text.
        const eligible=engine.checkEnqueue(snap.draft,snap.route);
        if(!eligible.ok){notify(eligible.reason);return;}
        const selected=site.clearForQueue(snap);
        if(!selected.ok){
          if(selected.needsRecovery){
            engine.wait('草稿清空结果未确认，请先备份原文');
            view.offerRecovery(selected.text,selected.reason);
          }else notify(selected.reason);
          return;
        }
        if(!engine.enqueue(selected.text,snap.route)){
          if(!site.restore(selected.text,'')){
            engine.wait('入列失败且原生草稿无法恢复，请先备份原文');
            view.offerRecovery(selected.text,'未能恢复原生草稿，消息未入队；请复制原文');
          }else notify('队列状态变化，原生草稿已恢复');
          return;
        }
        poll();
      },
      edit(id){
        // No inline editor. Put this message back into ChatGPT's existing
        // composer and cancel its queued-send authorization.
        const state=engine.view(),item=state.items.find(x=>x.id===id);
        if(!item || state.inFlight || ['unknown','sending','confirmed'].includes(item.state)){
          notify('这条消息正在发送或结果未知，暂不能取回');return;
        }
        const snap=site.inspect();
        if(!snap.ok||snap.route!==state.route){
          notify('请返回原对话后再取回');return;
        }
        if(snap.rich||snap.draft!==''){
          notify('输入框已有草稿或附件，请先发送或加入队列');
          snap.editor?.focus();return;
        }
        const result=site.reclaimToComposer(item.text,snap);
        if(!result.ok){
          if(result.mayHaveWritten)engine.uncertain(id,'取回状态未确认，请核对输入框与原对话后删除该条，避免重复发送',snap);
          notify(result.reason||'无法安全取回，请检查输入框');return;
        }
        // Only after the original composer read-back confirms the exact text,
        // remove the item so it cannot later auto-send from the queue.
        if(!engine.reclaim(id)){
          engine.uncertain(id,'队列状态已改变，请核对输入框与原对话后删除该条',snap);
          notify('消息已放入输入框，但队列状态不确定');return;
        }
        notify('已取回到输入框，取消排队');
      },
      remove(id){
        const state=engine.view();
        if(state.inFlight?.id===id&&state.inFlight.phase==='unknown'&&
          !window.confirm('发送结果可能已生效。请先检查原对话。确定仍要删除这条消息吗？'))return;
        engine.remove(id);
      },
      sendNow(id){
        const result=engine.requestNow(id);
        if(result.needsStopConfirmation){
          const approved=window.confirm('确定停止当前 ChatGPT 回复并提前发送？\n仅在原生停止确认后发送；未知结果不会重试。');
          if(!approved)return;
          if(!engine.confirmForceStop(id))notify('原生停止动作未获确认');
        } else if(!result.ok)notify(result.reason||'当前状态不能提前发送');
      }
    };
    view=createQueueView({owner,createPageUI,assets,engine,
      actions:Object.fromEntries(Object.entries(actions).map(([name,action])=>
        [name,(...args)=>{if(owner.active()&&!retireForLegacy())return action(...args);}] ))});
    owner.on(window,'beforeunload',event=>{
      if(!engine.view().items.length&&!view?.hasRecovery())return;
      event.preventDefault();event.returnValue='';
    });
    // Reconcile only every 650ms; no timer infers completion from idle text.
    function poll(){
      if(!owner.active()||retireForLegacy())return;
      const snap=site.inspect();
      let placed=false;
      if(snap.ok){placed=view.place(snap);view.render();}
      else view.hide();
      // Layout/recovery can veto new writes; confirmation and deadlines still run.
      engine.tick({canSubmit:placed&&!view.hasRecovery()});
    }
    owner.setInterval(poll,650);
    const snap=site.inspect();
    if(snap.ok){view.place(snap);view.render();}
    return {programId:ID,status:'active',runtime:'USER_SCRIPT',
      persistence:'memory-only',composer:snap.ok?'detected':'not-detected'};
  }catch(error){owner.destroy();throw error;}
}
