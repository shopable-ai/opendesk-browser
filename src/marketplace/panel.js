// Trusted Side Panel handoff only. Installation stays in the existing installer.
import {MARKET_INTENTS_STORE,MARKET_DOCUMENT_ID,marketPanelDocumentURL,UUID,marketError,readMarketIntentStore,withMarketIntentLock,
  marketIntentUnresolved,terminalIntent,validateMarketPanelSource,requireMarketPanelContext} from './intent.js';
import {MARKET_OPERATIONS_STORE} from '../ui/sidebar-tools/installation.js';
import {MARKET_BATCH_STORE,readMarketBatch} from './batch.js';
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';

export const MARKET_PANEL_PROTOCOL='opendesk.market.panel.v1';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const submitted=(row,operations)=>row.consumedAt!==null||Boolean(operations[row.operationId]);

export async function hasMarketPanelContext(api,windowId){
  try{
    const contexts=await api.runtime.getContexts({contextTypes:['SIDE_PANEL'],windowIds:[windowId]});
    return contexts.some(context=>context.contextType==='SIDE_PANEL'&&context.windowId===windowId&&
      marketPanelDocumentURL(api.runtime.getURL('sidepanel.html'),context.documentUrl)&&context.frameId===0&&!context.incognito&&
      typeof context.documentId==='string'&&MARKET_DOCUMENT_ID.test(context.documentId));
  }catch{return false;}
}
export function createMarketPanelHost({api=globalThis.chrome,lockManager=globalThis.navigator?.locks,now=Date.now}={}){
  return {async handle(message,sender){
    const windowFields=Object.hasOwn(message||{},'windowId')?['windowId']:[];
    if(message?.protocol!==MARKET_PANEL_PROTOCOL||
      windowFields.length&&(!Number.isSafeInteger(message.windowId)||message.windowId<0)||
      !(message.action==='LIST'&&exact(message,['protocol','action',...windowFields])||
        message.action==='CLAIM'&&exact(message,['protocol','action','reviewId',...windowFields])&&
        typeof message.reviewId==='string'&&UUID.test(message.reviewId)))
      throw marketError('E_PANEL_MESSAGE','侧边栏交接消息无效。');
    const context=await requireMarketPanelContext(api,sender,message.windowId);
    const ownerSender={...sender,documentId:context.documentId,frameId:0};
    if(context.windowId<0)throw marketError('E_PANEL_WINDOW','请从真实侧边栏读取当前 Chrome 窗口后继续审阅。');
    return withMarketIntentLock(lockManager,async()=>{
      const stored=await api.storage.local.get([MARKET_INTENTS_STORE,MARKET_OPERATIONS_STORE,MARKET_BATCH_STORE]);
      const previous=stored[MARKET_INTENTS_STORE],store=readMarketIntentStore(previous);
      const operations=stored[MARKET_OPERATIONS_STORE]||{},batch=readMarketBatch(stored[MARKET_BATCH_STORE]);
      if(message.action==='LIST'){
        const reviews=[];
        for(const row of store.intents){
          if(row.subject.kind!=='app'||row.panelTarget?.windowId!==context.windowId||row.cancelledAt!=null||
            row.pageReview?.cancelledAt!=null||row.settledAt!==null||terminalIntent(row,operations,batch))continue;
          const recoveryOnly=submitted(row,operations);
          if(!recoveryOnly){
            if(row.expiresAt<=now()&&!marketIntentUnresolved(row,operations,batch))continue;
            try{await validateMarketPanelSource(api,row);}catch{continue;}
          }
          reviews.push({reviewId:row.reviewId,intentId:row.intentId,operationId:row.operationId,
            subject:row.subject,createdAt:row.createdAt,recoveryOnly});
        }
        return {ok:true,protocol:MARKET_PANEL_PROTOCOL,reviews};
      }
      const row=store.intents.find(item=>item.reviewId===message.reviewId);
      if(!row||row.subject.kind!=='app'||row.panelTarget?.windowId!==context.windowId)
        throw marketError('E_PANEL_TARGET','此审阅不属于当前侧边栏窗口。');
      const recoveryOnly=submitted(row,operations);
      if(!recoveryOnly){
        if(row.cancelledAt!=null||row.pageReview?.cancelledAt!=null)throw marketError('E_INTENT_CANCELLED','此请求已取消。');
        if(row.expiresAt<=now())throw marketError('E_INTENT_EXPIRED','此审阅已过期。');
        await validateMarketPanelSource(api,row);
      }
      const owner=row.panelTarget.owner;
      if(owner&&owner.documentId!==context.documentId){
        let contexts;
        try{contexts=await api.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentIds:[owner.documentId],
          documentUrls:[owner.documentUrl]});}catch{throw marketError('E_PANEL_OWNER','无法确认原侧边栏已关闭。');}
        if(!Array.isArray(contexts)||contexts.some(item=>item.contextType==='SIDE_PANEL'&&
          item.documentId===owner.documentId&&item.documentUrl===owner.documentUrl&&item.frameId===0))
          throw marketError('E_PANEL_OWNER','另一活跃侧边栏仍拥有此审阅。');
      }
      // Re-check after source IO, then bind the browser-owned current document.
      await requireMarketPanelContext(api,ownerSender,row.panelTarget.windowId);
      if(owner?.documentId===context.documentId&&owner.documentUrl===context.documentUrl)
        return {ok:true,protocol:MARKET_PANEL_PROTOCOL,handoff:{...row,recoveryOnly}};
      row.panelTarget.owner={documentId:context.documentId,documentUrl:context.documentUrl};
      const result=await writeVerifiedLocalValue(api,MARKET_INTENTS_STORE,store,previous,'侧边栏审阅交接');
      if(result.acknowledgementLost)throw marketError('E_HANDOFF_UNKNOWN','侧边栏交接结果待核对，请读回同一请求。');
      return {ok:true,protocol:MARKET_PANEL_PROTOCOL,handoff:{...row,recoveryOnly}};
    });
  }};
}
export function registerMarketPanelHost(api=globalThis.chrome,options={}){
  const host=createMarketPanelHost({...options,api});
  const listener=(message,sender,sendResponse)=>{
    if(message?.protocol!==MARKET_PANEL_PROTOCOL)return;
    host.handle(message,sender).then(sendResponse,error=>sendResponse({ok:false,protocol:MARKET_PANEL_PROTOCOL,
      error:{code:error.code||'E_HANDOFF_UNKNOWN',message:error.code?error.message:'侧边栏交接尚未确认。'}}));
    return true;
  };
  api.runtime.onMessage.addListener(listener);
  return ()=>api.runtime.onMessage.removeListener(listener);
}
async function request(api,message){
  // Executed by the trusted panel coordinator, not by the market webpage. The
  // receiver admits native SIDE_PANEL identity before using this window locator.
  let windowFields={};
  if(api.windows?.getCurrent){
    const current=await api.windows.getCurrent();
    if(!Number.isSafeInteger(current?.id)||current.id<0||current.incognito||current.type!=='normal')
      throw marketError('E_PANEL_WINDOW','无法读取侧边栏当前 Chrome 窗口。');
    windowFields={windowId:current.id};
  }
  const response=await api.runtime.sendMessage({protocol:MARKET_PANEL_PROTOCOL,...message,...windowFields});
  if(response?.protocol!==MARKET_PANEL_PROTOCOL||response.ok!==true)
    throw marketError(response?.error?.code||'E_HANDOFF_UNKNOWN',response?.error?.message||'侧边栏交接尚未确认。');
  return response;
}
export async function requestPendingMarketReviews(api=globalThis.chrome){
  return (await request(api,{action:'LIST'})).reviews;
}
export async function claimMarketReview(api=globalThis.chrome,reviewId){
  return (await request(api,{action:'CLAIM',reviewId})).handoff;
}
