// Inert, bounded handoff metadata. Never a package URL, grant or execution RPC.
import {MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE,requireCompleteInstalledSidebarTools} from '../ui/sidebar-tools/installation.js';
import {MARKET_BATCH_STORE,marketBatchUnresolved,readMarketBatch,withMarketBatchLock} from './batch.js';
import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';
export const MARKET_INTENT_PROTOCOL='opendesk.market.intent.v1';
export const MARKET_INTENTS_STORE='opendesk.market.intents.v1';
export const MARKET_INTENT_TTL=30*60*1000;
export const MARKET_INTENT_CAPACITY=64;
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const marketError=(code,message)=>Object.assign(new Error(message),{code});
const fields=(v,list)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===[...list].sort().join(',');
export function validateMarketSubject(value){
  if(value?.kind==='app'&&fields(value,['kind','marketId','version'])&&
    typeof value.marketId==='string'&&value.marketId.length<=49&&/^opendesk\/[a-z][a-z0-9-]{1,39}$/.test(value.marketId)&&
    typeof value.version==='string'&&value.version.length<=20&&/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value.version))
    return {kind:'app',marketId:value.marketId,version:value.version};
  if(value?.kind==='collection'&&fields(value,['kind','collectionId','revision'])&&
    typeof value.collectionId==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(value.collectionId)&&
    Number.isSafeInteger(value.revision)&&value.revision>0&&value.revision<=1000000)
    return {kind:'collection',collectionId:value.collectionId,revision:value.revision};
  throw marketError('E_INTENT_FIELDS','安装请求只接受应用固定版本或套装固定 revision。');
}
export function validateMarketMessage(value){
  // Check fields before serialization so oversized extraneous data is not copied.
  if(value?.protocol!==MARKET_INTENT_PROTOCOL)throw marketError('E_PROTOCOL','此网站与 OpenDesk 安装协议不兼容，请更新后重试。');
  if(value.action==='PROBE'&&fields(value,['protocol','action']))return {protocol:MARKET_INTENT_PROTOCOL,action:'PROBE'};
  if(value.action!=='OPEN_INSTALL_REVIEW'||!fields(value,['protocol','action','intentId','subject'])||
    typeof value.intentId!=='string'||!UUID.test(value.intentId))
    throw marketError('E_INTENT_FIELDS','安装请求包含不支持的操作或字段。');
  return {protocol:MARKET_INTENT_PROTOCOL,action:value.action,intentId:value.intentId,
    subject:validateMarketSubject(value.subject)};
}
export const marketSubjectRoute=subject=>subject.kind==='app'?
  '#/apps/'+subject.marketId+'/versions/'+subject.version:
  '#/collections/'+subject.collectionId+'/revisions/'+subject.revision;
export const marketReviewURL=(api,reviewId)=>api.runtime.getURL('ui/marketplace.html')+'?intent='+reviewId;
export function readMarketIntentStore(value){
  if(value===undefined)return {schema:'opendesk.market.intents.v1',intents:[],requests:[]};
  if(!fields(value,['schema','intents','requests'])||value.schema!==MARKET_INTENTS_STORE||
    !Array.isArray(value.intents)||value.intents.length>MARKET_INTENT_CAPACITY||
    !Array.isArray(value.requests)||value.requests.length>120)
    throw marketError('E_INTENT_STORAGE','安装交接记录无法核对，请保留本机数据并联系维护者。');
  const ids=new Set(),reviews=new Set();
  for(const row of value.intents){
    if(!fields(row,['intentId','subject','reviewId','operationId','origin','createdAt','expiresAt','phase','tabId','consumedAt','settledAt','closureReason'])||
      ![row.intentId,row.reviewId,row.operationId].every(v=>typeof v==='string'&&UUID.test(v))||
      typeof row.origin!=='string'||row.origin.length>200||ids.has(row.intentId)||reviews.has(row.reviewId)||
      !Number.isSafeInteger(row.createdAt)||row.createdAt<0||row.expiresAt!==row.createdAt+MARKET_INTENT_TTL||
      !(row.consumedAt===null||Number.isSafeInteger(row.consumedAt)&&row.consumedAt>=row.createdAt)||
      !(row.settledAt===null||row.consumedAt!==null&&Number.isSafeInteger(row.settledAt)&&row.settledAt>=row.consumedAt)||
      !(row.settledAt===null?row.closureReason===null:['journal-terminal','unknown-without-journal'].includes(row.closureReason))||
      !['prepared','opened'].includes(row.phase)||!(row.tabId===null||Number.isSafeInteger(row.tabId)&&row.tabId>=0))
      throw marketError('E_INTENT_STORAGE','安装交接记录损坏，不能继续此请求。');
    validateMarketSubject(row.subject);ids.add(row.intentId);reviews.add(row.reviewId);
  }
  for(const row of value.requests)if(!fields(row,['origin','at'])||typeof row.origin!=='string'||row.origin.length>200||
    !Number.isSafeInteger(row.at)||row.at<0)throw marketError('E_INTENT_STORAGE','安装交接限流记录无效。');
  return structuredClone(value);
}
export async function loadReviewIntent(api,reviewId,now=Date.now()){
  if(typeof reviewId!=='string'||!UUID.test(reviewId))throw marketError('E_INTENT_MISSING','安装交接链接无效。');
  const stored=await api.storage.local.get([MARKET_INTENTS_STORE,MARKET_OPERATIONS_STORE,MARKET_BATCH_STORE]);
  const store=readMarketIntentStore(stored[MARKET_INTENTS_STORE]);
  const row=store.intents.find(item=>item.reviewId===reviewId);
  if(!row)throw marketError('E_INTENT_EXPIRED','此安装交接已过期。请回到市场重新选择固定版本。');
  const batch=readMarketBatch(stored[MARKET_BATCH_STORE]);
  const pending=marketIntentUnresolved(row,stored[MARKET_OPERATIONS_STORE]||{},batch);
  if(row.expiresAt<=now&&!pending)throw marketError('E_INTENT_EXPIRED','此安装交接已过期，请从市场重新发起；原安装数据不受影响。');
  return {...row,recoveryOnly:row.expiresAt<=now};
}
function terminalIntent(row,operations,batch){
  if(row.subject.kind==='app'){
    const op=operations[row.operationId];
    return op?.marketId===row.subject.marketId&&op.version===row.subject.version&&['succeeded','failed'].includes(op.state);
  }
  return batch?.batchId===row.operationId&&batch.collectionId===row.subject.collectionId&&
    batch.revision===row.subject.revision&&!marketBatchUnresolved(batch);
}
export function marketIntentUnresolved(row,operations,batch){
  return ['reviewed','committing','outcome-unknown'].includes(operations[row.operationId]?.state)||
    (batch?.batchId===row.operationId&&marketBatchUnresolved(batch))||
    (row.consumedAt!==null&&row.settledAt===null&&!terminalIntent(row,operations,batch));
}
export function withMarketIntentLock(lockManager,work){
  if(!lockManager?.request)throw marketError('E_INTENT_LOCK','浏览器不支持安全安装交接锁。');
  return lockManager.request('opendesk.market:intents',work);
}
// A consumed intent cannot be replayed if an old terminal installer/batch journal
// has since been trimmed. This stores no installed state, package, grant or data.
export async function consumeReviewIntent({api,lockManager,reviewId,operationId,subject,now=Date.now}){
  return withMarketIntentLock(lockManager,async()=>{
    const time=typeof now==='function'?now():now;
    const previous=(await api.storage.local.get(MARKET_INTENTS_STORE))[MARKET_INTENTS_STORE];
    const store=readMarketIntentStore(previous),row=store.intents.find(item=>item.reviewId===reviewId);
    if(!row||row.expiresAt<=time)throw marketError('E_INTENT_EXPIRED','安装交接已过期，请重新选择固定版本。');
    if(row.operationId!==operationId||JSON.stringify(validateMarketSubject(row.subject))!==JSON.stringify(validateMarketSubject(subject)))
      throw marketError('E_INTENT_CONFLICT','当前审阅与原安装交接身份不一致。');
    if(row.consumedAt!==null)throw marketError('E_INTENT_CONSUMED','此请求已启动过安装。请核对原结果，不能重复提交。');
    row.consumedAt=time;
    try{
      const result=await writeVerifiedLocalValue(api,MARKET_INTENTS_STORE,store,previous,'安装交接消费记录');
      if(result.acknowledgementLost)throw Error('Acknowledgement lost');
    }catch{throw marketError('E_HANDOFF_UNKNOWN','交接消费结果待核对。未继续提交安装，请恢复核对原请求。');}
    return {...row,recoveryOnly:false};
  });
}
export async function settleReviewIntent({api,lockManager,reviewId}){
  return withMarketIntentLock(lockManager,async()=>{
    const stored=await api.storage.local.get([MARKET_INTENTS_STORE,MARKET_OPERATIONS_STORE,MARKET_BATCH_STORE]);
    const store=readMarketIntentStore(stored[MARKET_INTENTS_STORE]),row=store.intents.find(item=>item.reviewId===reviewId);
    if(!row||row.consumedAt===null||row.settledAt!==null||
      !terminalIntent(row,stored[MARKET_OPERATIONS_STORE]||{},readMarketBatch(stored[MARKET_BATCH_STORE])))return;
    row.settledAt=Date.now();row.closureReason='journal-terminal';
    await writeVerifiedLocalValue(api,MARKET_INTENTS_STORE,store,stored[MARKET_INTENTS_STORE],'安装交接结束记录');
  });
}
// Explicit trusted-page recovery closes only a stranded handoff. It never marks
// installation success, clears an approval marker or writes installed packages.
export async function closeUnjournaledReview({api,lockManager,reviewId,operationId,subject,approved=false}){
  if(approved!==true)throw marketError('E_REVIEW_REQUIRED','请先核对本机状态并明确结束此交接。');
  subject=validateMarketSubject(subject);
  if(!lockManager?.request)throw marketError('E_INTENT_LOCK','浏览器缺少安全恢复锁。');
  const work=()=>lockManager.request('opendesk.sidebar-tools:catalog',()=>withMarketIntentLock(lockManager,async()=>{
    const stored=await api.storage.local.get([MARKET_INTENTS_STORE,MARKET_OPERATIONS_STORE,MARKET_BATCH_STORE,SIDEBAR_TOOL_STORE,MARKET_PROVENANCE_STORE]);
    const store=readMarketIntentStore(stored[MARKET_INTENTS_STORE]),row=store.intents.find(item=>item.reviewId===reviewId);
    if(!row||row.operationId!==operationId||JSON.stringify(validateMarketSubject(row.subject))!==JSON.stringify(subject))
      throw marketError('E_INTENT_CONFLICT','恢复对象与原交接不一致。');
    if(row.consumedAt===null||row.settledAt!==null)throw marketError('E_INTENT_STATE','此交接不需要结束缺失日志恢复。');
    const operations=stored[MARKET_OPERATIONS_STORE]||{},batch=readMarketBatch(stored[MARKET_BATCH_STORE]);
    if(operations[operationId]||batch?.batchId===operationId)
      throw marketError('E_INTENT_HAS_JOURNAL','原事务记录仍然存在，请使用原安装或批次的恢复核对。');
    const relevant=subject.kind==='app'?subject.marketId.split('/')[1]:null;
    if(marketBatchUnresolved(batch)||Object.values(operations).some(op=>(!relevant||op.toolId===relevant)&&['reviewed','committing','outcome-unknown'].includes(op.state)))
      throw marketError('E_REVIEW_PENDING','仍有相关安装事务待核对，不能结束此交接。');
    const installed=requireCompleteInstalledSidebarTools(stored[SIDEBAR_TOOL_STORE]);
    const observed=installed.filter(tool=>!relevant||tool.id===relevant).map(tool=>({id:tool.id,version:tool.version,
      source:stored[MARKET_PROVENANCE_STORE]?.[tool.id]?.marketId||'本机导入或来源未记录'}));
    row.settledAt=Date.now();row.closureReason='unknown-without-journal';
    await writeVerifiedLocalValue(api,MARKET_INTENTS_STORE,store,stored[MARKET_INTENTS_STORE],'结束待核对交接');
    return {handoff:{...row,recoveryOnly:true},outcome:'UNKNOWN_WITHOUT_JOURNAL',observed};
  }));
  return subject.kind==='app'?lockManager.request('opendesk.sidebar-tools:tool:'+subject.marketId.split('/')[1],work):
    withMarketBatchLock(lockManager,work);
}
