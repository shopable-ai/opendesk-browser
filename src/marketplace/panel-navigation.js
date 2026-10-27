// Short-lived, source-scoped presentation intent. Never an install, grant or execution RPC.
import {marketError,validateMarketSubject} from './intent.js';
import {validToolId} from '../ui/sidebar-tools/navigation.js';

export const MARKET_PANEL_NAV_PROTOCOL='opendesk.market.panel-navigation.v1';
export const MARKET_PANEL_NAV_PREFIX='opendesk.market.panel-navigation.v1.';
export const MARKET_PANEL_NAV_TTL=120000;
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=value=>Number.isSafeInteger(value)&&value>=0;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const completeStatuses=new Set(['APP_OPENED','DETAIL_OPENED','REVIEW_REQUEST_ACCEPTED','NAVIGATION_BLOCKED','IDENTITY_CHANGED']);
export function marketPanelNavigationKey(windowId){
  if(!id(windowId))throw marketError('E_PANEL_WINDOW','无效的市场窗口。');
  return MARKET_PANEL_NAV_PREFIX+windowId;
}
export function createMarketPanelNavigation({windowId,tabId,source,action,toolId,version,
  marketId=null,sha256=null,requestId=crypto.randomUUID(),issuedAt=Date.now()}={}){
  if(!id(windowId)||!id(tabId)||!validToolId(toolId)||
    !['built-in','external'].includes(source)||!['review','detail','open','open-local'].includes(action)||
    !UUID.test(requestId)||!Number.isSafeInteger(issuedAt)||issuedAt<0||
    !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version||''))
    throw marketError('E_NAV_FIELDS','市场导航参数无效。');
  if(action==='open-local'){
    if(source!=='built-in'||marketId!==null||sha256!==null)throw marketError('E_NAV_FIELDS','本机工具只允许受信任市场使用。');
  }else{
    validateMarketSubject({kind:'app',marketId,version});
    if(marketId!=='opendesk/'+toolId||!SHA.test(sha256||''))
      throw marketError('E_NAV_FIELDS','固定发行身份不完整。');
  }
  return {version:1,windowId,tabId,source,action,toolId,marketId,releaseVersion:version,
    sha256,requestId,issuedAt,status:'NAVIGATION_PENDING'};
}
export function validMarketPanelNavigation(value,{windowId,now=Date.now()}={}){
  if(!value||value.version!==1||value.windowId!==windowId||!id(windowId)||
    !id(value.tabId)||!UUID.test(value.requestId||'')||
    !Number.isSafeInteger(value.issuedAt)||value.issuedAt>now||
    now-value.issuedAt>MARKET_PANEL_NAV_TTL||
    !['NAVIGATION_PENDING',...completeStatuses].includes(value.status))return false;
  try{
    const parsed=createMarketPanelNavigation({windowId:value.windowId,tabId:value.tabId,
      source:value.source,action:value.action,toolId:value.toolId,version:value.releaseVersion,
      marketId:value.marketId,sha256:value.sha256,requestId:value.requestId,issuedAt:value.issuedAt});
    return parsed.requestId===value.requestId;
  }catch{return false;}
}
const sameTarget=(a,b)=>a.source===b.source&&a.action===b.action&&a.toolId===b.toolId&&
  a.marketId===b.marketId&&a.releaseVersion===b.releaseVersion&&a.sha256===b.sha256&&
  a.tabId===b.tabId;
export async function queueMarketPanelNavigation(api,request,{now=Date.now}={}){
  const key=marketPanelNavigationKey(request.windowId),time=now();
  if(!validMarketPanelNavigation(request,{windowId:request.windowId,now:time})||
    request.status!=='NAVIGATION_PENDING')throw marketError('E_NAV_FIELDS','仅接受短期待处理导航请求。');
  const existing=(await api.storage.session.get(key))[key];
  if(validMarketPanelNavigation(existing,{windowId:request.windowId,now:time})&&
    ['NAVIGATION_PENDING','NAVIGATION_BLOCKED'].includes(existing.status)){
    if(sameTarget(existing,request)&&existing.status==='NAVIGATION_PENDING')return existing;
    if(!sameTarget(existing,request))
      throw marketError('E_NAV_BUSY','当前窗口已有未完成导航，请先处理侧边栏中的请求。');
  }
  await api.storage.session.set({[key]:request});
  const stored=(await api.storage.session.get(key))[key];
  if(stored?.requestId!==request.requestId||stored?.status!=='NAVIGATION_PENDING')
    throw marketError('E_NAV_UNKNOWN','导航请求写入结果不明，请从 Side Panel 核对；不要重复安装。');
  return stored;
}
export async function waitMarketPanelNavigation(api,request,{timeoutMs=900}={}){
  const key=marketPanelNavigationKey(request.windowId);
  const inspect=async()=>{
    const row=(await api.storage.session.get(key))[key];
    return row?.requestId===request.requestId&&completeStatuses.has(row.status)?row:null;
  };
  const immediate=await inspect();if(immediate)return immediate;
  if(!api.storage.onChanged?.addListener)return request;
  return new Promise(resolve=>{
    let ended=false;
    const done=row=>{if(ended)return;ended=true;clearTimeout(timer);
      api.storage.onChanged.removeListener?.(changed);resolve(row||request);};
    const changed=(changes,area)=>{
      if(area!=='session'||!Object.hasOwn(changes,key))return;
      const row=changes[key].newValue;
      if(row?.requestId===request.requestId&&completeStatuses.has(row.status))done(row);
    };
    api.storage.onChanged.addListener(changed);
    const timer=setTimeout(()=>{void inspect().then(done,()=>done(null));},timeoutMs);
    void inspect().then(row=>{if(row)done(row);}).catch(()=>{});
  });
}
// Only started by a positively verified native SIDE_PANEL document. A rejected
// navigation stays in session as a recoverable blocked locator, never success.
export function createMarketPanelNavigationReceiver({api,onNavigate,now=Date.now,
  onBlocked=()=>{},onError=error=>console.warn('Market panel navigation',error)}={}){
  if(typeof onNavigate!=='function'||!api?.storage?.session||!api.storage.onChanged)
    throw new TypeError('Market Side Panel navigation unavailable');
  let windowId=null,key=null,closed=false,running=false,again=false,lastRequestId=null;
  async function deliver(){
    if(closed||!key)return;
    if(running){again=true;return;}
    running=true;
    try{
      const row=(await api.storage.session.get(key))[key];
      if(!row||closed||!validMarketPanelNavigation(row,{windowId,now:now()})||
        row.status!=='NAVIGATION_PENDING'||lastRequestId===row.requestId)return;
      lastRequestId=row.requestId;
      let result;
      try{result=await onNavigate(row);}catch(error){
        result={status:'NAVIGATION_BLOCKED',message:(error?.code||'E_NAV')+'：'+String(error?.message||error)};
      }
      const status=completeStatuses.has(result?.status)?result.status:'NAVIGATION_BLOCKED';
      const message=typeof result?.message==='string'?result.message.slice(0,300):'请在侧边栏继续操作。';
      const current=(await api.storage.session.get(key))[key];
      if(!closed&&current?.requestId===row.requestId&&current.status==='NAVIGATION_PENDING'){
        await api.storage.session.set({[key]:{...row,status,message}});
        if(status==='NAVIGATION_BLOCKED'||status==='IDENTITY_CHANGED')onBlocked({status,message,requestId:row.requestId});
      }
    }catch(error){if(!closed)onError(error);}
    finally{running=false;if(again&&!closed){again=false;void deliver();}}
  }
  const changed=(changes,area)=>{if(area==='session'&&key&&Object.hasOwn(changes,key))void deliver();};
  return Object.freeze({
    start(idValue){
      if(closed||key)throw new TypeError('Market navigation receiver already started');
      key=marketPanelNavigationKey(idValue);windowId=idValue;
      api.storage.onChanged.addListener(changed);void deliver();
    },
    refresh(){lastRequestId=null;void deliver();},
    dispose(){closed=true;if(key)api.storage.onChanged.removeListener?.(changed);key=null;}
  });
}
// The extension-owned marketplace page is the only internal producer.
// Opening must be initiated before any asynchronous document or storage checks.
export function registerTrustedMarketNavigation(api=globalThis.chrome){
  const listener=(message,sender,sendResponse)=>{
    if(message?.protocol!==MARKET_PANEL_NAV_PROTOCOL)return;
    const url=typeof sender?.url==='string'?sender.url:'';
    const expected=api.runtime.getURL('ui/marketplace.html');
    let legitimate=false;
    try{
      const target=new URL(url),fixed=new URL(expected);
      legitimate=sender?.id===api.runtime.id&&sender?.frameId===0&&
        sender?.documentLifecycle!=='prerender'&&sender?.documentLifecycle!=='cached'&&
        id(sender?.tab?.id)&&id(sender?.tab?.windowId)&&!sender.tab.incognito&&
        target.origin===fixed.origin&&target.pathname===fixed.pathname&&
        !target.username&&!target.password;
    }catch{/* Reject malformed extension-origin requests. */}
    if(!legitimate){sendResponse({ok:false,protocol:MARKET_PANEL_NAV_PROTOCOL,
      error:{code:'E_NAV_SENDER',message:'只允许扩展内可信市场页面发起导航。'}});return true;}
    let opening;
    try{opening=Promise.resolve(api.sidePanel.open({windowId:sender.tab.windowId})).then(()=>true,()=>false);}
    catch{opening=Promise.resolve(false);}
    void (async()=>{
      if(!exact(message,['protocol','action','target','toolId','version','marketId','sha256'])||
        message.action!=='NAVIGATE')
        throw marketError('E_NAV_FIELDS','内部市场导航契约无效。');
      const [tab,frame]=await Promise.all([
        api.tabs.get(sender.tab.id),api.webNavigation.getFrame({tabId:sender.tab.id,frameId:0})
      ]);
      if(!tab||tab.id!==sender.tab.id||tab.windowId!==sender.tab.windowId||
        tab.incognito||tab.url!==url||tab.pendingUrl&&tab.pendingUrl!==tab.url||
        !frame||frame.documentId!==sender.documentId||frame.parentFrameId!==-1||
        frame.documentLifecycle!=='active'||frame.url!==url)
        throw marketError('E_NAV_DOCUMENT','市场文档或窗口已经变化，请重新点击。');
      const request=createMarketPanelNavigation({windowId:tab.windowId,tabId:tab.id,source:'built-in',
        action:message.target,toolId:message.toolId,version:message.version,
        marketId:message.marketId,sha256:message.sha256});
      const pending=await queueMarketPanelNavigation(api,request);
      const opened=await opening;
      const result=await waitMarketPanelNavigation(api,pending);
      return {ok:true,protocol:MARKET_PANEL_NAV_PROTOCOL,requestId:pending.requestId,
        status:result.status==='NAVIGATION_PENDING'&&!opened?'PANEL_REQUIRED':result.status,
        message:result.message||''};
    })().then(sendResponse,error=>sendResponse({ok:false,protocol:MARKET_PANEL_NAV_PROTOCOL,
      error:{code:error.code||'E_NAV',message:error.message||'无法确认侧边栏导航。'}}));
    return true;
  };
  api.runtime.onMessage.addListener(listener);
  return ()=>api.runtime.onMessage.removeListener(listener);
}
