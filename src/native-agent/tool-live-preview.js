// Uses the existing Native files.read authority and immutable snapshot reader.
// Polling publishes UI only; it never installs, executes npm or grants tool SDK rights.
import {readToolSnapshot,NATIVE_TOOL_PREVIEW_ROOT,previewStorageKey} from './tool-snapshot.js';
import {openPreviewSession,updatePreviewSession} from '../ui/sidebar-tools/preview-session.js';
import {previewStatusKey} from '../ui/sidebar-tools/live-preview.js';

export function validateToolWatchStatus(text,toolId,now=Date.now()){
  if(typeof text!=='string'||text.length>2000)throw new Error('构建状态无效');
  const value=JSON.parse(text);
  const updatedAt=typeof value?.updatedAt==='string'?Date.parse(value.updatedAt):value?.updatedAt;
  if(!value||Object.keys(value).sort().join(',')!=='format,id,message,sha256,state,updatedAt'||
    value.format!=='opendesk.tool-preview-status.v1'||value.id!==toolId||
    !['ready','error','stopped'].includes(value.state)||
    !(value.sha256===null||typeof value.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.sha256))||
    typeof value.message!=='string'||value.message.length>500||
    !Number.isSafeInteger(updatedAt)||updatedAt<0||updatedAt>now+5000)
    throw new Error('构建状态身份或字段无效');
  return {...value,stale:now-updatedAt>15000};
}
export function createToolLivePreview({api,toolId,workspaceId,sourceId,readText,assertCurrent,onStatus=()=>{},now=Date.now,intervalMs=1500}){
  let closed=false,opened=null,snapshot=null,timer=null,queued=Promise.resolve(),starting=null,stopping=null;
  const removedTabs=new Set();
  // Recheck at the existing handoff's commit boundary too: its async session
  // read may outlive the Native authority checked before calling update.
  const previewApi={runtime:api.runtime,tabs:api.tabs,storage:{session:{
    get:(...args)=>api.storage.session.get(...args),
    remove:(...args)=>api.storage.session.remove(...args),
    async set(values){
      await assertCurrent();
      if(closed)throw new Error('开发会话已停止');
      return api.storage.session.set(values);
    }
  }}};

  // Stop closes admission immediately, then drains all admitted work before
  // removing storage. No in-flight open/update can recreate a removed record.
  function enqueue(action){
    if(closed)return Promise.resolve();
    const operation=queued.then(()=>{if(!closed)return action();});
    queued=operation.catch(()=>{});
    return operation;
  }
  const report=async(text,error=false)=>{
    if(closed)return;
    onStatus(text,error);
    if(opened)await api.storage.session.set({[previewStatusKey(opened.previewId)]:{text,error,updatedAt:now()}});
  };
  const check=()=>enqueue(async()=>{
    if(closed||!opened)return;
    try{
      await assertCurrent();if(closed)return;
      const status=validateToolWatchStatus(await readText(NATIVE_TOOL_PREVIEW_ROOT+'/'+toolId+'/status.json'),toolId,now());
      if(closed)return;
      if(status.stale||status.state==='stopped')return await report('构建连接已停止 · 保留上次成功预览',true);
      if(status.state==='error')return await report('编译失败 · 保留上次成功预览：'+status.message,true);
      if(status.sha256!==snapshot.sha256){
        const next=await readToolSnapshot({toolId,readText});
        await assertCurrent();if(closed)return;
        // A changed pointer or identity must be read as a complete new snapshot.
        if(next.sha256!==status.sha256)throw new Error('新快照仍在发布，等待完整构建');
        await updatePreviewSession({api:previewApi,previewId:opened.previewId,workspaceId,sourceId,snapshot:next,now:now()});
        if(closed)return;snapshot=next;
      }else{
        await assertCurrent();if(closed)return;
        await updatePreviewSession({api:previewApi,previewId:opened.previewId,workspaceId,sourceId,snapshot,now:now()});
      }
      await report('实时开发预览 · '+snapshot.sha256.slice(0,12)+' · 未安装');
    }catch(error){
      if(!closed)await report('开发连接或快照不可用 · 保留上次成功预览：'+String(error.message||error).slice(0,180),true);
    }
  });
  const removed=id=>{
    if(opened?.tabId===id)void stop();
    else if(!opened)removedTabs.add(id);
  };
  function stop(){
    if(stopping)return stopping;
    closed=true;clearTimeout(timer);api.tabs.onRemoved?.removeListener(removed);
    stopping=queued.then(async()=>{
      if(!opened)return;
      const id=opened.previewId;opened=null;
      await api.storage.session.set({[previewStatusKey(id)]:{text:'开发会话已停止 · 保留上次成功预览',error:true,updatedAt:now()}}).catch(()=>{});
      await api.storage.session.remove(previewStorageKey(id)).catch(()=>{});
    });
    return stopping;
  }
  function start(){
    if(closed)return Promise.reject(new Error('开发会话已停止'));
    if(starting)return starting;
    api.tabs.onRemoved?.addListener(removed);
    starting=enqueue(async()=>{
      await assertCurrent();if(closed)return;
      const next=await readToolSnapshot({toolId,readText});
      await assertCurrent();if(closed)return;
      snapshot=next;
      opened=await openPreviewSession({api:previewApi,workspaceId,sourceId,snapshot,now:now()});
      if(removedTabs.has(opened.tabId)){void stop();return;}
      removedTabs.clear();
      if(closed)return;
      return opened;
    }).then(async result=>{
      if(!result||closed)return;
      const poll=async()=>{await check();if(!closed)timer=setTimeout(poll,intervalMs);};
      await check();if(!closed)timer=setTimeout(poll,intervalMs);
      return closed?undefined:result;
    }).catch(async error=>{await stop();throw error;});
    return starting;
  }
  return Object.freeze({start,stop,check,get preview(){return closed?null:opened;}});
}
