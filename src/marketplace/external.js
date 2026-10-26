import {MARKET_INTENT_PROTOCOL,MARKET_INTENTS_STORE,MARKET_INTENT_TTL,MARKET_INTENT_CAPACITY,
  marketError,validateMarketMessage,readMarketIntentStore,marketReviewURL,withMarketIntentLock,validateMarketSubject,marketIntentUnresolved,validateMarketPanelSource} from './intent.js';
import {MARKET_OPERATIONS_STORE} from '../ui/sidebar-tools/installation.js';
import {MARKET_BATCH_STORE,marketBatchUnresolved,readMarketBatch} from './batch.js';
import {sameStorageValue} from '../ui/sidebar-tools/storage-state.js';
import {createPageInstallHost,MARKET_PAGE_PROTOCOL} from './page-install.js';
import {readMarketInstallStatus} from './status.js';
import {hasMarketPanelContext,registerMarketPanelHost} from './panel.js';
import {toolPageHref} from '../ui/sidebar-tools/navigation.js';

// Chrome serializes its browser-owned DocumentId (UnguessableToken) as 32 hex
// characters. It is distinct from our request/review UUIDs and contextId UUIDs.
// The live webNavigation lookup below remains the authority for its identity.
const CHROME_DOCUMENT_ID=/^(?!0{32}$)[0-9a-f]{32}$/i;
function validateSenderEnvelope(api,sender,channel,internal=false){
  if(!channel?.enabled)throw marketError('E_CHANNEL_DISABLED','此版本尚未启用网站安装交接。');
  if(api.runtime.id!==channel.extensionId)throw marketError('E_EXTENSION_ID','网站配置的扩展 ID 与此安装不一致。');
  if((internal?sender?.id!==api.runtime.id:sender?.id!==undefined)||sender?.nativeApplication!==undefined||sender?.frameId!==0||
    !Number.isSafeInteger(sender?.tab?.id)||sender.tab.id<0||sender.tab.incognito||
    typeof sender.documentId!=='string'||!CHROME_DOCUMENT_ID.test(sender.documentId)||sender.documentLifecycle!=='active')
    throw marketError('E_SENDER','请在受信任市场的顶层 Chrome 网页中发起安装。');
  let url;try{url=new URL(sender.url);}catch{throw marketError('E_ORIGIN','无法核对安装请求的网页来源。');}
  if(typeof sender.url!=='string'||sender.url.length>2048||url.username||url.password||
    url.origin!==channel.origin||sender.origin!==channel.origin)
    throw marketError('E_ORIGIN','此网页来源未获准发起安装交接。');
  return channel.origin;
}
export async function validateMarketSender(api,sender,channel,internal=false){
  validateSenderEnvelope(api,sender,channel,internal);
  const [tab,frame]=await Promise.all([
    api.tabs.get(sender.tab.id),api.webNavigation.getFrame({tabId:sender.tab.id,documentId:sender.documentId})
  ]);
  if(!tab||tab.incognito||tab.id!==sender.tab.id||new URL(tab.url).origin!==channel.origin||
    tab.pendingUrl&&new URL(tab.pendingUrl).origin!==channel.origin||
    !frame||frame.documentId!==sender.documentId||frame.parentFrameId!==-1||
    frame.documentLifecycle!=='active'||new URL(frame.url).origin!==channel.origin)
    throw marketError('E_DOCUMENT','市场页面已导航或文档身份不可用，请回到市场重试。');
  {
    const top=await api.webNavigation.getFrame({tabId:sender.tab.id,frameId:0});
    if(!top||top.documentId!==sender.documentId||top.parentFrameId!==-1||top.documentLifecycle!=='active')
      throw marketError('E_DOCUMENT','市场顶层文档已变化，请重新审阅。');
  }
  return channel.origin;
}
export async function loadMarketChannel(api,fetcher=globalThis.fetch){
  const url=api.runtime.getURL('marketplace/channel.json');
  const response=await fetcher(url,{cache:'no-store',redirect:'error',credentials:'omit'});
  if(!response.ok||response.url&&response.url!==url)throw marketError('E_CHANNEL','无法读取本扩展安装通道配置。');
  const text=await response.text();
  if(text.length>2048)throw marketError('E_CHANNEL','安装通道配置过大。');
  const channel=JSON.parse(text);
  if(channel.schema!=='opendesk.market.channel.v1'||channel.protocol!==MARKET_INTENT_PROTOCOL||
    !['production','development'].includes(channel.mode)||typeof channel.enabled!=='boolean')
    throw marketError('E_CHANNEL','安装通道配置无效。');
  if(channel.enabled){
    const u=new URL(channel.origin);
    if(u.origin!==channel.origin||u.pathname!=='/'||u.search||u.hash||u.username||u.password||
      !/^[a-p]{32}$/.test(channel.extensionId)||
      (channel.mode==='development'?(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port):
      (u.protocol!=='https:'||Boolean(u.port)||/^[\d.]+$/.test(u.hostname)||!u.hostname.includes('.')||
       /(^|\.)(localhost|local|test|invalid|example)$/.test(u.hostname)||
       /(^|\.)(example\.com|example\.org|example\.net)$/.test(u.hostname))))
      throw marketError('E_CHANNEL','安装通道来源无效。');
  }
  return channel;
}
// The worker queue serializes requests; a shared extension-origin Web Lock also
// coordinates the trusted page's one-time consumption marker. A new worker recovers from the journal and
// real tabs; opening a tab and writing storage are explicitly not atomic.
export function createMarketHandoff({api=globalThis.chrome,channel,lockManager=globalThis.navigator?.locks,now=Date.now,uuid=()=>crypto.randomUUID()}={}){
  let tail=Promise.resolve(),pendingCount=0,cachedChannel=channel?.then?null:channel;
  Promise.resolve(channel).then(value=>{cachedChannel=value;}).catch(()=>{});
  async function handle(message,sender,panelOpening){
    const config=await channel,origin=await validateMarketSender(api,sender,config);
    const request=validateMarketMessage(message),time=now();
    const stored=await api.storage.local.get([MARKET_INTENTS_STORE,MARKET_OPERATIONS_STORE,MARKET_BATCH_STORE]);
    const state=readMarketIntentStore(stored[MARKET_INTENTS_STORE]);
    const operations=stored[MARKET_OPERATIONS_STORE]||{},batch=readMarketBatch(stored[MARKET_BATCH_STORE]);
    state.intents=state.intents.filter(row=>row.expiresAt>time||row.subject.kind==='app'&&(row.consumedAt!==null||operations[row.operationId])||marketIntentUnresolved(row,operations,batch));
    state.requests=state.requests.filter(row=>row.at>time-60000);
    if(state.requests.length>=120||state.requests.filter(row=>row.origin===origin).length>=60)
      throw marketError('E_RATE_LIMIT','请求过于频繁，请一分钟后重试。');
    state.requests.push({origin,at:time});
    if(['GET_APP_STATUS','OPEN_INSTALLED_APP'].includes(request.action)){
      await persist(state);
      const status=await readMarketInstallStatus(api,{subject:request.subject});
      const {currentInstallation,installedVersion,enabled}=status;
      if(request.action==='OPEN_INSTALLED_APP'){
        if(currentInstallation==='not-installed')throw marketError('E_NOT_INSTALLED','尚未核对此来源的本机安装，请先安装。');
        if(enabled===false)throw marketError('E_TOOL_DISABLED','此应用已停用，请先在 OpenDesk 的应用设置中恢复。');
        // A locator only. The existing tool document rechecks current installation,
        // epoch, enable state and SDK authority before running its opaque sandbox.
        const tab=await api.tabs.create({url:toolPageHref(api.runtime,request.subject.marketId.split('/')[1]),active:true});
        await api.windows.update(tab.windowId,{focused:true});
        return {ok:true,protocol:MARKET_INTENT_PROTOCOL,status:'APP_OPENED'};
      }
      return {ok:true,protocol:MARKET_INTENT_PROTOCOL,status:'APP_STATUS',currentInstallation,installedVersion,enabled};
    }
    let intent=request.action!=='PROBE'?state.intents.find(row=>row.intentId===request.intentId):null;
    if(intent&&(intent.origin!==origin||JSON.stringify(validateMarketSubject(intent.subject))!==JSON.stringify(request.subject)))
      throw marketError('E_INTENT_CONFLICT','同一请求标识不能改为另一个应用或版本。');
    // A website session can outlive its source document. Let the client drop
    // only this unsubmitted stale locator; never retire or replace an operation
    // whose consume marker/journal may already represent side effects.
    if(intent?.subject.kind==='app'&&intent.panelTarget&&intent.consumedAt===null&&
      !operations[intent.operationId]&&!marketIntentUnresolved(intent,operations,batch)&&
      intent.cancelledAt==null&&intent.pageReview?.cancelledAt==null){
      try{await validateMarketPanelSource(api,intent);}
      catch(error){
        if(error.code!=='E_DOCUMENT')throw error;
        throw marketError('E_INTENT_EXPIRED','原文档已更换，未提交审阅失效；请在下一次显式点击安装时新建审阅。');
      }
    }
    if(request.action==='GET_INSTALL_STATUS'){
      if(!intent)throw marketError('E_INTENT_EXPIRED','此安装请求不存在或已过期，请查看本机应用。');
      await persist(state);
      const status=await readMarketInstallStatus(api,intent);
      if(intent.subject.kind==='collection'&&status.installation==='review'&&intent.tabId!==null&&!(await api.tabs.query({})).some(tab=>tab.id===intent.tabId))status.installation='cancelled';
      return {ok:true,protocol:MARKET_INTENT_PROTOCOL,status:'INSTALL_STATUS',intentId:request.intentId,...status};
    }
    if(request.action==='OPEN_INSTALL_REVIEW'&&!intent){
      // Repeated user initiation focuses the original transaction, including
      // historical pageReview/consumed records. It never creates a replacement
      // operation for an unknown outcome.
      const tabs=await api.tabs.query({});
      intent=state.intents.find(row=>row.origin===origin&&JSON.stringify(validateMarketSubject(row.subject))===JSON.stringify(request.subject)&&
        (marketIntentUnresolved(row,operations,batch)||row.consumedAt===null&&row.cancelledAt==null&&row.pageReview?.cancelledAt==null&&
          row.expiresAt>time&&(!row.panelTarget||row.panelTarget.tabId===sender.tab.id&&row.panelTarget.documentId===sender.documentId)&&
          (row.subject.kind==='app'||row.tabId===null||tabs.some(tab=>tab.id===row.tabId))));
    }
    if(request.action==='OPEN_INSTALL_REVIEW'&&!intent){
      if(state.intents.length>=MARKET_INTENT_CAPACITY)throw marketError('E_INTENT_CAPACITY','待审阅请求已达上限，请完成审阅或稍后再试。');
      const recent=state.intents.filter(row=>row.createdAt>time-60000);
      if(recent.length>=12||recent.filter(row=>row.origin===origin).length>=6)
        throw marketError('E_RATE_LIMIT','新安装请求过于频繁，请先完成已打开的审阅。');
      intent={intentId:request.intentId,subject:request.subject,reviewId:uuid(),operationId:uuid(),
        origin,createdAt:time,expiresAt:time+MARKET_INTENT_TTL,phase:'prepared',tabId:null,consumedAt:null,settledAt:null,closureReason:null};
      state.intents.push(intent);
    }
    if(intent?.subject.kind==='app'&&!intent.panelTarget){
      const tab=await api.tabs.get(sender.tab.id);
      if(!Number.isSafeInteger(tab?.windowId)||tab.windowId<0||
        sender.tab.windowId!==undefined&&sender.tab.windowId!==tab.windowId)
        throw marketError('E_DOCUMENT','无法核对市场窗口身份。');
      intent.panelTarget={tabId:sender.tab.id,windowId:tab.windowId,documentId:sender.documentId,owner:null};
    }
    await persist(state);
    if(request.action==='PROBE')return {ok:true,protocol:MARKET_INTENT_PROTOCOL,status:'CONNECTED'};
    if(intent.cancelledAt!=null||intent.pageReview?.cancelledAt!=null)
      throw marketError('E_INTENT_CANCELLED','此安装已取消，请重新发起审阅。');
    if(intent.subject.kind==='app'){
      // The native click opens presentation before async IO drops activation.
      // Approval still requires the complete live source and panel checks.
      await validateMarketSender(api,sender,config);
      let opened=true;
      if(panelOpening)opened=await panelOpening;
      else try{await api.sidePanel.open({windowId:intent.panelTarget.windowId});}catch{opened=false;}
      const visible=opened&&await hasMarketPanelContext(api,intent.panelTarget.windowId);
      if(visible){intent.phase='opened';await persist(state);}
      return {ok:true,protocol:MARKET_INTENT_PROTOCOL,
        status:!opened?'PANEL_REQUIRED':visible?'REVIEW_OPENED':'REVIEW_PENDING',intentId:intent.intentId,
        ...(!opened?{message:'请点击 Chrome 工具栏中的 OpenDesk 图标打开侧边栏，继续审阅原安装请求。'}:{})};
    }
    const url=marketReviewURL(api,intent.reviewId,intent.subject);
    const tabs=await api.tabs.query({});
    let tab=tabs.find(item=>!item.incognito&&(item.url===url||item.pendingUrl===url));
    try{
      if(tab){await api.tabs.update(tab.id,{active:true});await api.windows.update(tab.windowId,{focused:true});}
      else tab=await api.tabs.create({url,active:true});
      if(!Number.isSafeInteger(tab?.id))throw Error('Missing created tab identity');
      intent.tabId=tab.id;intent.phase='opened';await persist(state);
    }catch{throw marketError('E_HANDOFF_UNKNOWN','审阅交接结果待核对。请查看已打开的 OpenDesk 标签页，或用同一请求重试连接。');}
    // This says nothing about the installed registry, permissions, or tool data.
    return {ok:true,protocol:MARKET_INTENT_PROTOCOL,status:'REVIEW_OPENED',intentId:intent.intentId};
  }
  async function persist(state){
    try{
      await api.storage.local.set({[MARKET_INTENTS_STORE]:state});
      const actual=(await api.storage.local.get(MARKET_INTENTS_STORE))[MARKET_INTENTS_STORE];
      if(!sameStorageValue(actual,state))throw Error('Readback mismatch');
    }catch{throw marketError('E_HANDOFF_UNKNOWN','交接记录暂时无法确认，请用同一请求恢复核对。');}
  }
  return {handle(message,sender){
    try{
      message=validateMarketMessage(message);
      if(sender?.frameId!==0||sender?.id!==undefined||!Number.isSafeInteger(sender?.tab?.id))
        throw marketError('E_SENDER','请在市场顶层网页中发起安装。');
      if(cachedChannel)validateSenderEnvelope(api,sender,cachedChannel);
      if(pendingCount>=16)throw marketError('E_RATE_LIMIT','安装交接正忙，请稍后重试。');
    }catch(error){return Promise.reject(error);}
    let panelOpening;
    if(cachedChannel&&message.action==='OPEN_INSTALL_REVIEW'&&message.subject.kind==='app'&&
      Number.isSafeInteger(sender.tab.windowId)&&sender.tab.windowId>=0){
      // This only presents our existing trusted UI. Do not wait for the queue,
      // storage, or network before Chrome checks the real user activation.
      try{panelOpening=Promise.resolve(api.sidePanel.open({windowId:sender.tab.windowId})).then(()=>true,()=>false);}
      catch{panelOpening=Promise.resolve(false);}
    }
    pendingCount++;
    const pending=tail.then(()=>withMarketIntentLock(lockManager,()=>handle(message,sender,panelOpening))).finally(()=>pendingCount--);
    tail=pending.catch(()=>{});return pending;
  }};
}
export function registerMarketHandoff(api=globalThis.chrome){
  const channel=loadMarketChannel(api),host=createMarketHandoff({api,channel});
  const pageHost=createPageInstallHost({api,channel});
  const listener=(message,sender,sendResponse)=>{
    host.handle(message,sender).then(sendResponse,error=>sendResponse({ok:false,protocol:MARKET_INTENT_PROTOCOL,
      error:{code:error.code||'E_HANDOFF',message:error.code?error.message:'无法完成交接，请重试连接或查看安装帮助。'}}));
    return true;
  };
  api.runtime.onMessageExternal.addListener(listener);
  const pageListener=(message,sender,sendResponse)=>{
    if(message?.protocol!==MARKET_PAGE_PROTOCOL)return;
    pageHost.handle(message,sender).then(sendResponse,error=>sendResponse({ok:false,protocol:MARKET_PAGE_PROTOCOL,
      error:{code:error.code||'E_INSTALL',message:error.code?error.message:'安装结果尚未确认，请核对原结果。'}}));
    return true;
  };
  api.runtime.onMessage.addListener(pageListener);
  const removePanel=registerMarketPanelHost(api);
  return ()=>{removePanel();api.runtime.onMessageExternal.removeListener(listener);api.runtime.onMessage.removeListener(pageListener);};
}
