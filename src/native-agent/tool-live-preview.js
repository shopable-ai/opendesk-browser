// Uses the existing Native files.read authority and immutable snapshot reader.
// Polling publishes UI only. Explicit storage admission stays in this exact
// Workspace owner; it never installs, executes npm or grants installed rights.
import {readToolSnapshot,NATIVE_TOOL_PREVIEW_ROOT,previewStorageKey} from './tool-snapshot.js';
import {openPreviewSession,updatePreviewSession,panelPreviewStorageKey} from '../ui/sidebar-tools/preview-session.js';
import {previewStatusKey} from '../ui/sidebar-tools/live-preview.js';
import {createToolDevelopmentStorageOwner} from './tool-development-storage.js';

export function validateToolWatchStatus(text,toolId,now=Date.now()){
  if(typeof text!=='string'||text.length>2000)throw new Error('构建状态无效');
  const value=JSON.parse(text);
  const updatedAt=typeof value?.updatedAt==='string'?Date.parse(value.updatedAt):value?.updatedAt;
  if(!value||Object.keys(value).sort().join(',')!=='format,id,message,sha256,state,updatedAt'||
    value.format!=='opendesk.tool-preview-status.v1'||value.id!==toolId||
    !['building','ready','error','stopped'].includes(value.state)||
    !(value.sha256===null||typeof value.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.sha256))||
    typeof value.message!=='string'||value.message.length>500||
    !Number.isSafeInteger(updatedAt)||updatedAt<0||updatedAt>now+5000)
    throw new Error('构建状态身份或字段无效');
  return {...value,stale:now-updatedAt>15000};
}
export function createToolLivePreview({api,toolId,workspaceId,sourceId,readText,assertCurrent,
  nativeAuthority=null,surface='tab',windowId=null,lockManager=globalThis.navigator?.locks,
  onStatus=()=>{},now=Date.now,intervalMs=1500}){
  if(!['tab','sidepanel'].includes(surface)||surface==='sidepanel'&&
    (!Number.isSafeInteger(windowId)||windowId<0))throw new Error('E_TOOL_PREVIEW_SURFACE');
  let closed=false,opened=null,snapshot=null,timer=null,queued=Promise.resolve(),starting=null,stopping=null;
  let developmentCurrent=null;
  const pointerKey=surface==='sidepanel'?panelPreviewStorageKey(windowId):null;
  const development=createToolDevelopmentStorageOwner({api,lockManager,now,assertCurrent,
    getCurrent:()=>closed?null:developmentCurrent,
    verifySnapshot:async sha256=>{
      const status=validateToolWatchStatus(await readText(NATIVE_TOOL_PREVIEW_ROOT+'/'+toolId+'/status.json'),toolId,now());
      const latest=await readToolSnapshot({toolId,readText});
      if(status.stale||status.state!=='ready'||status.sha256!==sha256||latest.sha256!==sha256){
        invalidateDevelopment();throw new Error('构建或源码快照已变化，请重新批准');
      }
    }});
  function invalidateDevelopment(){
    if(developmentCurrent?.available)developmentCurrent={...developmentCurrent,available:false};
    development.revoke('源码、构建或目录连接已变化，请重新批准');
  }
  function readyDevelopment(){
    if(developmentCurrent?.available&&developmentCurrent.sha256===snapshot.sha256)return;
    developmentCurrent={...opened,sourceId,tool:snapshot.tool,sha256:snapshot.sha256,available:true,nativeAuthority};
  }
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
    if(opened)await api.storage.session.set({[previewStatusKey(opened.previewId)]:{
      text,error,available:developmentCurrent?.available===true,updatedAt:now()}});
  };
  const check=()=>enqueue(async()=>{
    if(closed||!opened)return;
    try{
      await assertCurrent();if(closed)return;
      if(pointerKey){
        // Another explicit same-window development session takes ownership;
        // an older Workspace must never reclaim this Panel or its grant.
        const pointer=(await api.storage.session.get(pointerKey))[pointerKey];
        if(pointer?.previewId!==opened.previewId){
          invalidateDevelopment();return await report('此窗口已切换到另一开发会话',true);
        }
      }
      const status=validateToolWatchStatus(await readText(NATIVE_TOOL_PREVIEW_ROOT+'/'+toolId+'/status.json'),toolId,now());
      if(closed)return;
      // Revoke BEFORE publishing or deferring a changed snapshot. UI dirty
      // state and mount delays can never extend the old instance's grant.
      if(status.stale||status.state!=='ready'||status.sha256!==snapshot.sha256)invalidateDevelopment();
      if(status.stale||status.state==='stopped')return await report('构建连接已停止 · 保留上次成功预览',true);
      if(status.state==='building')return await report('正在编译 · 保留上次成功预览');
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
      readyDevelopment();
      await report('实时开发预览 · '+snapshot.sha256.slice(0,12)+' · 未安装');
    }catch(error){
      invalidateDevelopment();
      if(!closed)await report('开发连接或快照不可用 · 保留上次成功预览：'+String(error.message||error).slice(0,180),true);
    }
  });
  const removed=id=>{
    if(opened?.tabId===id)void stop();
    else if(!opened)removedTabs.add(id);
  };
  function stop(){
    if(stopping)return stopping;
    closed=true;development.dispose();clearTimeout(timer);
    if(surface==='tab')api.tabs.onRemoved?.removeListener(removed);
    stopping=queued.then(async()=>{
      if(!opened)return;
      const id=opened.previewId;opened=null;
      await api.storage.session.set({[previewStatusKey(id)]:{text:'开发会话已停止 · 保留上次成功预览',error:true,updatedAt:now()}}).catch(()=>{});
      await api.storage.session.remove(previewStorageKey(id)).catch(()=>{});
      if(pointerKey){
        const pointer=(await api.storage.session.get(pointerKey).catch(()=>({})))[pointerKey];
        if(pointer?.previewId===id)await api.storage.session.remove(pointerKey).catch(()=>{});
      }
    });
    return stopping;
  }
  function start(){
    if(closed)return Promise.reject(new Error('开发会话已停止'));
    if(starting)return starting;
    if(surface==='tab')api.tabs.onRemoved?.addListener(removed);
    starting=enqueue(async()=>{
      await assertCurrent();if(closed)return;
      const next=await readToolSnapshot({toolId,readText});
      await assertCurrent();if(closed)return;
      snapshot=next;
      opened=await openPreviewSession({api:previewApi,workspaceId,sourceId,snapshot,
        now:now(),surface,windowId});
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
