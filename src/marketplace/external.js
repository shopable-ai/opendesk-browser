import {MARKET_INTENT_PROTOCOL,MARKET_INTENTS_STORE,MARKET_INTENT_TTL,MARKET_INTENT_CAPACITY,
  marketError,validateMarketMessage,readMarketIntentStore,marketReviewURL,withMarketIntentLock,validateMarketSubject,marketIntentUnresolved} from './intent.js';
import {MARKET_OPERATIONS_STORE} from '../ui/sidebar-tools/installation.js';
import {MARKET_BATCH_STORE,marketBatchUnresolved,readMarketBatch} from './batch.js';
import {sameStorageValue} from '../ui/sidebar-tools/storage-state.js';

// Chrome serializes its browser-owned DocumentId (UnguessableToken) as 32 hex
// characters. It is distinct from our request/review UUIDs and contextId UUIDs.
// The live webNavigation lookup below remains the authority for its identity.
const CHROME_DOCUMENT_ID=/^(?!0{32}$)[0-9a-f]{32}$/i;
function validateSenderEnvelope(api,sender,channel){
  if(!channel?.enabled)throw marketError('E_CHANNEL_DISABLED','此版本尚未启用网站安装交接。');
  if(api.runtime.id!==channel.extensionId)throw marketError('E_EXTENSION_ID','网站配置的扩展 ID 与此安装不一致。');
  if(sender?.id!==undefined||sender?.nativeApplication!==undefined||sender?.frameId!==0||
    !Number.isSafeInteger(sender?.tab?.id)||sender.tab.id<0||sender.tab.incognito||
    typeof sender.documentId!=='string'||!CHROME_DOCUMENT_ID.test(sender.documentId)||sender.documentLifecycle!=='active')
    throw marketError('E_SENDER','请在受信任市场的顶层 Chrome 网页中发起安装。');
  let url;try{url=new URL(sender.url);}catch{throw marketError('E_ORIGIN','无法核对安装请求的网页来源。');}
  if(typeof sender.url!=='string'||sender.url.length>2048||url.username||url.password||
    url.origin!==channel.origin||sender.origin!==channel.origin)
    throw marketError('E_ORIGIN','此网页来源未获准发起安装交接。');
  return channel.origin;
}
export async function validateMarketSender(api,sender,channel){
  validateSenderEnvelope(api,sender,channel);
  const [tab,frame]=await Promise.all([
    api.tabs.get(sender.tab.id),api.webNavigation.getFrame({tabId:sender.tab.id,documentId:sender.documentId})
  ]);
  if(!tab||tab.incognito||tab.id!==sender.tab.id||new URL(tab.url).origin!==channel.origin||
    tab.pendingUrl&&new URL(tab.pendingUrl).origin!==channel.origin||
    !frame||frame.documentId!==sender.documentId||frame.parentFrameId!==-1||
    frame.documentLifecycle!=='active'||new URL(frame.url).origin!==channel.origin)
    throw marketError('E_DOCUMENT','市场页面已导航或文档身份不可用，请回到市场重试。');
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
  let tail=Promise.resolve(),pendingCount=0,cachedChannel=null;
  Promise.resolve(channel).then(value=>{cachedChannel=value;}).catch(()=>{});
  async function handle(message,sender){
    const config=await channel,origin=await validateMarketSender(api,sender,config);
    const request=validateMarketMessage(message),time=now();
    const stored=await api.storage.local.get([MARKET_INTENTS_STORE,MARKET_OPERATIONS_STORE,MARKET_BATCH_STORE]);
    const state=readMarketIntentStore(stored[MARKET_INTENTS_STORE]);
    const operations=stored[MARKET_OPERATIONS_STORE]||{},batch=readMarketBatch(stored[MARKET_BATCH_STORE]);
    state.intents=state.intents.filter(row=>row.expiresAt>time||marketIntentUnresolved(row,operations,batch));
    state.requests=state.requests.filter(row=>row.at>time-60000);
    if(state.requests.length>=120||state.requests.filter(row=>row.origin===origin).length>=60)
      throw marketError('E_RATE_LIMIT','请求过于频繁，请一分钟后重试。');
    state.requests.push({origin,at:time});
    let intent=request.action==='OPEN_INSTALL_REVIEW'?state.intents.find(row=>row.intentId===request.intentId):null;
    if(intent&&(intent.origin!==origin||JSON.stringify(validateMarketSubject(intent.subject))!==JSON.stringify(request.subject)))
      throw marketError('E_INTENT_CONFLICT','同一请求标识不能改为另一个应用或版本。');
    if(request.action==='OPEN_INSTALL_REVIEW'&&!intent){
      if(state.intents.some(row=>JSON.stringify(validateMarketSubject(row.subject))===JSON.stringify(request.subject)&&
        marketIntentUnresolved(row,operations,batch)))
        throw marketError('E_REVIEW_PENDING','此固定版本已有待核对安装，请先在原扩展审阅页恢复核对结果。');
      if(state.intents.length>=MARKET_INTENT_CAPACITY)throw marketError('E_INTENT_CAPACITY','待审阅请求已达上限，请完成审阅或稍后再试。');
      const recent=state.intents.filter(row=>row.createdAt>time-60000);
      if(recent.length>=12||recent.filter(row=>row.origin===origin).length>=6)
        throw marketError('E_RATE_LIMIT','新安装请求过于频繁，请先完成已打开的审阅。');
      intent={intentId:request.intentId,subject:request.subject,reviewId:uuid(),operationId:uuid(),
        origin,createdAt:time,expiresAt:time+MARKET_INTENT_TTL,phase:'prepared',tabId:null,consumedAt:null,settledAt:null,closureReason:null};
      state.intents.push(intent);
    }
    await persist(state);
    if(request.action==='PROBE')return {ok:true,protocol:MARKET_INTENT_PROTOCOL,status:'CONNECTED'};
    const url=marketReviewURL(api,intent.reviewId);
    const tabs=await api.tabs.query({});
    let tab=tabs.find(item=>!item.incognito&&(item.url===url||item.pendingUrl===url));
    try{
      if(tab){await api.tabs.update(tab.id,{active:true});await api.windows.update(tab.windowId,{focused:true});}
      else tab=await api.tabs.create({url,active:true});
      if(!Number.isSafeInteger(tab?.id))throw Error('Missing created tab identity');
      intent.tabId=tab.id;intent.phase='opened';await persist(state);
    }catch{throw marketError('E_HANDOFF_UNKNOWN','审阅交接结果待核对。请查看已打开的 OpenDesk 标签页，或用同一请求重试连接。');}
    // This says nothing about the installed registry, permissions, or tool data.
    return {ok:true,protocol:MARKET_INTENT_PROTOCOL,status:'REVIEW_OPENED',intentId:request.intentId};
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
    pendingCount++;
    const pending=tail.then(()=>withMarketIntentLock(lockManager,()=>handle(message,sender))).finally(()=>pendingCount--);
    tail=pending.catch(()=>{});return pending;
  }};
}
export function registerMarketHandoff(api=globalThis.chrome){
  const host=createMarketHandoff({api,channel:loadMarketChannel(api)});
  const listener=(message,sender,sendResponse)=>{
    host.handle(message,sender).then(sendResponse,error=>sendResponse({ok:false,protocol:MARKET_INTENT_PROTOCOL,
      error:{code:error.code||'E_HANDOFF',message:error.code?error.message:'无法完成交接，请重试连接或查看安装帮助。'}}));
    return true;
  };
  api.runtime.onMessageExternal.addListener(listener);
  return ()=>api.runtime.onMessageExternal.removeListener(listener);
}
