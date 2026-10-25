import {createPageUI} from '@opendesk/ui';
import {createChatGPTSite} from './site.js';
import {createQueueEngine} from './engine.js';
import {createQueueView} from './view.js';

const ID='opendesk.chatgpt-send-queue';
const pageRules={matches:['https://chatgpt.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};

export default async function main({assets}={}) {
  if(window!==window.top||window.location.origin!=='https://chatgpt.com')
    return {programId:ID,status:'skipped'};
  const owner=createPageUI({id:ID+'.lifecycle',assets,pageRules,baseStyles:false});
  owner.host.hidden=true;
  owner.host.style.setProperty('display','none','important');
  const site=createChatGPTSite();
  let view=null,forceClick=false,engine;
  try{
    engine=createQueueEngine({site,change:()=>view?.render()});
    const notify=message=>view?.toast(message);
    const actions={
      enqueue(event){
        if(event?.shiftKey){actions.togglePause();return;}
        const snap=site.inspect(),state=engine.view();
        if(!snap.ok){notify(snap.reason);return;}
        if(state.editing){
          const text=snap.draft,saved=state.editingDraft;
          if(!site.normal(text)){notify('队列消息不能为空');return;}
          if(!site.restore(saved,text)){engine.pause('未能恢复原生草稿，编辑仍保留');return;}
          if(!engine.finishEdit(text))engine.pause('保存队列编辑失败');
          return;
        }
        const selected=site.clearForQueue(snap);
        if(!selected.ok){notify(selected.reason);return;}
        if(!engine.enqueue(selected.text,snap.route)){
          if(!site.restore(selected.text,''))engine.pause('入列失败且原生草稿无法恢复');
          else notify('队列已满、文字超限或会话不一致');
          return;
        }
        engine.tick();
      },
      edit(id){
        const state=engine.view(),item=state.items.find(x=>x.id===id),snap=site.inspect();
        if(!item||!snap.ok||snap.route!==state.route)return;
        if(state.editing===id){
          if(!site.restore(state.editingDraft,snap.draft)){engine.pause('取消编辑时草稿无法恢复');return;}
          engine.cancelEdit();return;
        }
        if(state.editing||state.inFlight){notify('请先完成当前队列操作');return;}
        if(!site.restore(item.text,snap.draft)){notify('原生输入框无法安全填入待编辑消息');return;}
        engine.edit(id,snap.draft);
      },
      remove(id){
        const state=engine.view();
        if(state.inFlight?.id===id&&state.inFlight.phase==='unknown'&&
          !window.confirm('发送结果可能已生效。请先检查原对话。确定仍要删除这条消息吗？'))return;
        if(state.editing===id){
          const snap=site.inspect();
          if(!snap.ok||!site.restore(state.editingDraft,snap.draft)){
            engine.pause('无法恢复编辑前的原生草稿');return;
          }
          engine.cancelEdit();
        }
        engine.remove(id);
      },
      sendNow(id){
        const result=engine.requestNow(id);
        if(result.needsStopConfirmation){
          const approved=window.confirm('确定停止当前 ChatGPT 回复并提前发送？\n仅在原生停止确认后发送；未知结果不会重试。');
          if(!approved)return;
          forceClick=true;
          try{if(!engine.confirmForceStop(id))notify('原生停止动作未获确认');}
          finally{forceClick=false;}
        } else if(!result.ok)notify(result.reason||'当前状态不能提前发送');
      },
      togglePause(){
        if(engine.view().paused){
          if(!engine.resume())notify('请先处理未知发送结果，或返回原对话');
        }else engine.pause('用户主动暂停队列');
      }
    };
    view=createQueueView({owner,createPageUI,assets,engine,actions});
    // Native Stop clicked by the user is not proof of normal answer completion.
    owner.on(document,'click',event=>{
      if(forceClick||!engine.view().items.length)return;
      const snap=site.inspect();
      if(snap.ok&&snap.stopButton&&(event.target===snap.stopButton||
        snap.stopButton.contains(event.target)))engine.pause('官网回复被手动停止，队列已暂停');
    },true);
    owner.on(window,'beforeunload',event=>{
      if(!engine.view().items.length)return;
      event.preventDefault();event.returnValue='';
    });
    // Reconcile only every 650ms; no timer infers completion from idle text.
    owner.setInterval(()=>{
      if(!owner.active())return;
      const snap=site.inspect();
      if(snap.ok){view.place(snap);view.render();}
      else view.hide();
      engine.tick();
    },650);
    const snap=site.inspect();
    if(snap.ok){view.place(snap);view.render();}
    return {programId:ID,status:'active',runtime:'USER_SCRIPT',
      persistence:'memory-only',composer:snap.ok?'detected':'not-detected'};
  }catch(error){owner.destroy();throw error;}
}
