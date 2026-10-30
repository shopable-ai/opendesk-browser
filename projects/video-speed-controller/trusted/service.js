import {VIDEO_SPEED_ID,VIDEO_SPEED_GLOBAL_PROTOCOL,VIDEO_SPEED_GLOBAL_STORE,
  VIDEO_SPEED_GLOBAL_OPERATIONS,validVideoSpeed,globalVideoSpeedState} from './policy.js';
import {admitsOfficialVideoSpeed} from './admission.js';
import {requestVideoSpeed} from './host.js';
import {SIDEBAR_TOOL_STORE} from '../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../../src/ui/sidebar-tools/installation.js';
import {validateOfficialReleaseCatalog,OFFICIAL_CATALOG_PATH} from '../../../src/sidebar-tools/official-catalog.js';
import {writeVerifiedLocalValue} from '../../../src/ui/sidebar-tools/storage-state.js';
import {isSidebarToolHostSender} from '../../../src/sidebar-tools/sender.js';

const error=(code,message)=>Object.assign(new Error(message),{code});
const authorityKeys=[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,
  MARKET_PROVENANCE_STORE,VIDEO_SPEED_GLOBAL_STORE];
const pattern=url=>{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw error('E_VIDEO_TARGET','请选择普通网页');
  return u.protocol+'//'+u.hostname+'/*';};

// Only restore media this fixed extension previously touched, in this exact
// document. Never reset a different player's/user's later choice.
export function restoreControlledVideoSpeed(){
  const rows=document.__opendeskVideoSpeedControlled_v1;
  let restored=0,failed=0;
  if(rows)for(const [id,row] of rows){
    const video=row.element.deref();
    if(!video||!video.isConnected||String(video.currentSrc||video.src||'')!==row.source||
      Math.abs(video.playbackRate-row.speed)>.02){rows.delete(id);continue;}
    try{video.playbackRate=1;
      if(Math.abs(video.playbackRate-1)>.02){failed++;continue;}
      restored++;rows.delete(id);
    }catch{failed++;}
  }
  return {restored,failed};
}
export function readRestoredVideoSpeed(){
  return {nonDefault:Array.from(document.querySelectorAll('video')).slice(0,48)
    .filter(video=>Math.abs(video.playbackRate-1)>.02).length};
}

export function createGlobalVideoSpeedService({api=globalThis.chrome,
  fetcher=globalThis.fetch,lockManager=globalThis.navigator?.locks}={}){
  let generation=0,releasePromise;
  const busy=new Set(),pending=new Map(),localWrites=new Map();
  const lock=work=>{
    if(!lockManager?.request)throw error('E_TOOL_LOCK','安全存储锁不可用');
    return lockManager.request('opendesk.sidebar-tools:tool:'+VIDEO_SPEED_ID,work);
  };
  async function release(){
    // The bundled catalog only. No remote publication or fallback identity.
    if(!releasePromise)releasePromise=(async()=>{
      const response=await fetcher(api.runtime.getURL(OFFICIAL_CATALOG_PATH));
      if(!response.ok)throw error('E_VIDEO_TRUST','官方目录不可用');
      const catalog=validateOfficialReleaseCatalog(await response.json());
      return catalog.apps.find(row=>row.toolId===VIDEO_SPEED_ID);
    })().catch(cause=>{releasePromise=null;throw cause;});
    return releasePromise;
  }
  async function authority(){
    const saved=await api.storage.local.get(authorityKeys);
    const installed=saved[SIDEBAR_TOOL_STORE];
    const tool=Array.isArray(installed)?installed.find(row=>row?.id===VIDEO_SPEED_ID):null;
    const epoch=saved[TOOL_REVOCATION_EPOCHS_STORE]?.[VIDEO_SPEED_ID];
    const descriptor=await release();
    if(!await admitsOfficialVideoSpeed({tool,release:descriptor,installed,
      provenance:saved[MARKET_PROVENANCE_STORE],enableRecords:saved[SIDEBAR_TOOL_ENABLE_STORE],
      epochs:saved[TOOL_REVOCATION_EPOCHS_STORE],expectedEpoch:epoch}))
      throw error('E_VIDEO_TRUST','全局倍速需要有效的同版本官方安装');
    const state=globalVideoSpeedState(saved[VIDEO_SPEED_GLOBAL_STORE],epoch,descriptor.sha256);
    return {tool,epoch,hash:descriptor.sha256,state,raw:saved[VIDEO_SPEED_GLOBAL_STORE]};
  }
  async function liveHost(sender){
    if(!isSidebarToolHostSender(api,sender,VIDEO_SPEED_ID)||sender.tab?.incognito||
      sender.frameId!==undefined&&sender.frameId!==0||
      sender.documentLifecycle&&sender.documentLifecycle!=='active'||sender.tab&&!sender.documentId)
      throw error('E_VIDEO_SENDER','仅可信工具宿主可更改全局设置');
    const type=sender.tab?'TAB':'SIDE_PANEL';
    const contexts=await api.runtime.getContexts({documentUrls:[sender.url],contextTypes:[type]});
    // Chrome can omit Side Panel sender document/frame metadata. Resolve its
    // unique live context, then require this exact document again before save.
    const matches=contexts.filter(row=>row.contextType===type&&row.documentUrl===sender.url&&!row.incognito&&row.frameId===0&&
      typeof row.documentId==='string'&&row.documentId&&(!sender.documentId||row.documentId===sender.documentId)&&
      (!sender.tab||row.tabId===sender.tab.id));
    if(matches.length!==1||!matches[0].documentId)throw error('E_DOCUMENT_STALE','工具宿主已关闭');
    return matches[0].documentId;
  }
  async function checkedTarget(tabId,documentId,{active=true}={}){
    const tab=await api.tabs.get(tabId);
    if(tab.incognito||tab.pendingUrl||active&&!tab.active)throw error('E_DOCUMENT_STALE','网页未处于当前可见标签');
    if(!await api.permissions.contains({origins:[pattern(tab.url)]}))
      throw error('E_VIDEO_SITE_ACCESS','Chrome 网站访问已撤销');
    const top=await api.webNavigation.getFrame({tabId,frameId:0});
    if(!top||top.documentId!==documentId||top.url!==tab.url||top.errorOccurred||
      top.documentLifecycle&&top.documentLifecycle!=='active')throw error('E_DOCUMENT_STALE','网页文档已变化');
    return {tabId,windowId:tab.windowId,documentId,url:top.url,origin:new URL(top.url).origin};
  }
  async function apply(sender){
    if(sender?.id!==api.runtime.id||!Number.isSafeInteger(sender.frameId)||sender.frameId<0||!Number.isSafeInteger(sender.tab?.id)||
       !sender.documentId||sender.documentLifecycle&&sender.documentLifecycle!=='active')
      throw error('E_VIDEO_SENDER','无效的网页事件');
    const tabId=sender.tab.id;
    if(busy.has(tabId)){pending.set(tabId,sender);return {status:'busy'};}
    busy.add(tabId);
    try{return await lock(async()=>{
      const observed=generation,auth=await authority();
      if(!auth.state.enabled)return {status:'stopped'};
      const validateSignal=async()=>{
        const frame=await api.webNavigation.getFrame({tabId,frameId:sender.frameId});
        if(frame?.documentId!==sender.documentId||frame.url!==sender.url||frame.errorOccurred||
          frame.documentLifecycle&&frame.documentLifecycle!=='active'||
          !await api.permissions.contains({origins:[pattern(sender.url)]}))
          throw error('E_DOCUMENT_STALE','网页事件来源或授权已变化');
      };
      await validateSignal();
      const top=await api.webNavigation.getFrame({tabId,frameId:0});
      const target=await checkedTarget(tabId,top?.documentId);
      const check=()=>{if(generation!==observed)throw error('E_VIDEO_REVOKED','全局偏好或权限已变化');};
      const verify=async()=>{
        const now=await authority();
        if(!now.state.enabled||now.epoch!==auth.epoch||now.hash!==auth.hash||
          now.state.revision!==auth.state.revision)throw error('E_VIDEO_REVOKED','全局倍速已停止或变化');
        check();
      };
      return requestVideoSpeed({api,tool:auth.tool,operation:'videoSpeed.set',
        payload:{speed:auth.state.speed},globalRevision:auth.state.revision,
        assertCurrent:check,assertInstalled:verify,currentPageTarget:{capture:()=>target,
          revalidate:async()=>{const current=await checkedTarget(tabId,target.documentId);
            if(current.url!==target.url)throw error('E_DOCUMENT_STALE','网页已导航');
            await validateSignal();check();}}});
    });}finally{
      busy.delete(tabId);
      const fresh=pending.get(tabId);pending.delete(tabId);
      if(fresh)void apply(fresh).catch(()=>{});
    }
  }
  async function restore(auth,observed){
    let failed=0,restored=0,unverified=0;
    const tabs=await api.tabs.query({});
    for(const tab of tabs){
      if(tab.incognito||!Number.isSafeInteger(tab.id))continue;
      let frames;
      try{pattern(tab.url);frames=await api.webNavigation.getAllFrames({tabId:tab.id});}
      catch{continue;}
      for(const frame of (frames||[]).slice(0,16)){
        try{
          if(frame.errorOccurred||frame.documentLifecycle&&frame.documentLifecycle!=='active')continue;
          if(!await api.permissions.contains({origins:[pattern(frame.url)]})){failed++;continue;}
          const now=await authority();
          if(generation!==observed||now.epoch!==auth.epoch||now.hash!==auth.hash||now.state.enabled)
            throw error('E_VIDEO_REVOKED','恢复期间权限或设置变化');
          const result=await api.scripting.executeScript({target:{tabId:tab.id,documentIds:[frame.documentId]},
            world:'ISOLATED',func:restoreControlledVideoSpeed});
          const row=result.find(item=>item.documentId===frame.documentId&&item.frameId===frame.frameId)?.result;
          if(!row)throw error('E_VIDEO_READBACK','恢复结果未知');
          restored+=row.restored;failed+=row.failed;
          const read=await api.scripting.executeScript({target:{tabId:tab.id,documentIds:[frame.documentId]},
            world:'ISOLATED',func:readRestoredVideoSpeed});
          const actual=read.find(item=>item.documentId===frame.documentId)?.result;
          if(!actual||actual.nonDefault)unverified++;
        }catch{failed++;}
      }
    }
    return {status:failed||unverified?'partial':'requested',restored,failed,unverified};
  }
  async function dispatch(message,sender){
    if(message?.protocol!==VIDEO_SPEED_GLOBAL_PROTOCOL)throw error('E_SCHEMA','无效协议');
    if(message.operation==='page.apply'){
      if(Object.keys(message).sort().join(',')!=='operation,protocol')throw error('E_SCHEMA','网页信号不能携带执行参数');
      return apply(sender);
    }
    const sync=message.operation==='videoSpeed.global.sync';
    if((!sync&&!VIDEO_SPEED_GLOBAL_OPERATIONS.includes(message.operation))||message.toolId!==VIDEO_SPEED_ID)
      throw error('E_SCHEMA','无效全局操作');
    const host=await liveHost(sender);
    return lock(async()=>{
      const auth=await authority();
      if(auth.epoch!==message.installEpoch)throw error('E_VIDEO_REVOKED','旧安装会话已撤销');
      if(message.operation==='videoSpeed.global.status')return auth.state;
      const payload=message.payload;
      if(sync){
        if(!payload||Object.keys(payload).sort().join(',')!=='expectedRevision,speed'||
           typeof payload.expectedRevision!=='string'||!validVideoSpeed(payload.speed))
          throw error('E_SCHEMA','无效的快捷键同步');
        // This condition and the following durable write share the installer
        // lock. A key observed before another window's STOP cannot revive it.
        if(!auth.state.enabled||auth.state.revision!==payload.expectedRevision)
          return {...auth.state,superseded:true};
      }
      if(!payload||typeof payload!=='object'||Array.isArray(payload)||
        !sync&&(Object.keys(payload).sort().join(',')!=='enabled,expectedRevision,speed'||
        typeof payload.expectedRevision!=='string'||typeof payload.enabled!=='boolean'||
        !validVideoSpeed(payload.speed)))throw error('E_SCHEMA','全局倍速参数无效');
      // Delayed ON/target edits cannot reopen another window's STOP. STOP is
      // unconditional so a concurrent speed edit cannot silently defeat it.
      if(!sync&&payload.enabled&&payload.expectedRevision!==auth.state.revision)
        return {...auth.state,superseded:true};
      if(await liveHost(sender)!==host)throw error('E_DOCUMENT_STALE','工具宿主已变化');
      const now=await authority();
      if(now.epoch!==auth.epoch||now.hash!==auth.hash)throw error('E_VIDEO_REVOKED','安装已变化');
      const raw={enabled:sync?true:payload.enabled,speed:payload.speed,
        revision:crypto.randomUUID(),epoch:auth.epoch,packageHash:auth.hash};
      if(localWrites.size>=64)localWrites.delete(localWrites.keys().next().value);
      localWrites.set(raw.revision,raw);
      ++generation;
      await writeVerifiedLocalValue(api,VIDEO_SPEED_GLOBAL_STORE,raw,auth.raw,'全局倍速设置');
      const state=globalVideoSpeedState(raw,auth.epoch,auth.hash);
      const observed=generation;
      // No media writes are retried if this response is lost.
      const restored=!state.enabled?await restore(auth,observed):null;
      if(state.enabled)void repair().catch(()=>{});
      else void broadcast().catch(()=>{});
      return {...state,...(restored?{restore:restored}:{})};
    });
  }
  async function broadcast(){
    const tabs=await api.tabs.query({});
    await Promise.allSettled(tabs.filter(tab=>!tab.incognito&&Number.isSafeInteger(tab.id))
      .map(tab=>api.tabs.sendMessage(tab.id,{protocol:VIDEO_SPEED_GLOBAL_PROTOCOL,operation:'recheck'})));
  }
  async function repair(){
      const auth=await authority();if(!auth.state.enabled)return;
      for(const tab of await api.tabs.query({active:true})){
        try{
          const top=await api.webNavigation.getFrame({tabId:tab.id,frameId:0});
          await checkedTarget(tab.id,top?.documentId);
          for(const frame of (await api.webNavigation.getAllFrames({tabId:tab.id})).slice(0,16)){
            const now=await authority();
            if(!now.state.enabled||now.state.revision!==auth.state.revision)return;
            if(!await api.permissions.contains({origins:[pattern(frame.url)]}))continue;
            await api.scripting.executeScript({target:{tabId:tab.id,documentIds:[frame.documentId]},
              files:['agents/page-relay.js']});
          }
        }catch{/* Missing permission/closed pages remain stopped. */}
      }
      await broadcast();
  }
  return {dispatch,authority,broadcast,repair,invalidate(changes){
    const value=changes?.[VIDEO_SPEED_GLOBAL_STORE]?.newValue;
    const own=localWrites.get(value?.revision);
    if(changes&&Object.keys(changes).length===1&&own&&value&&
      Object.keys(value).sort().join(',')==='enabled,epoch,packageHash,revision,speed'&&
      Object.keys(own).every(key=>value[key]===own[key]))return;
    ++generation;
  }};
}

export function installGlobalVideoSpeedService(options={}){
  const api=options.api||globalThis.chrome,service=createGlobalVideoSpeedService({...options,api});
  api.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.protocol!==VIDEO_SPEED_GLOBAL_PROTOCOL)return false;
    service.dispatch(message,sender).then(data=>reply({ok:true,data}),cause=>reply({ok:false,
      error:{code:cause?.code||'E_VIDEO_GLOBAL',message:String(cause?.message||cause).slice(0,160)}}));
    return true;
  });
  api.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||!authorityKeys.some(key=>Object.hasOwn(changes,key)))return;
    service.invalidate(changes);void service.broadcast().catch(()=>{});
  });
  const recheck=()=>{service.invalidate();void service.broadcast().catch(()=>{});};
  api.permissions.onRemoved?.addListener(recheck);
  api.permissions.onAdded?.addListener(()=>{recheck();void service.repair().catch(()=>{});});
  api.runtime.onStartup?.addListener(()=>{void service.repair().catch(()=>{});});
  api.runtime.onInstalled?.addListener(()=>{void service.repair().catch(()=>{});});
  api.tabs.onActivated?.addListener(()=>{void service.repair().catch(()=>{});});
  // MV3 wake-up restores only persisted policy, never an old mutation queue.
  void service.broadcast().catch(()=>{});
  return service;
}
