// Batch coordination around the existing Sidebar tool installer.
// No executable packages, grants, preferences, or private tool content belong here.
import {MAX_INSTALLED_TOOLS} from '../ui/sidebar-tools/package.js';
import {OFFICIAL_APPS} from './catalog.js';

export const MARKET_BATCH_STORE='opendesk.market.batch.v1';
const COLLECTION_IDS=new Set(['reading-kit','my-selection']);
const STATUS=new Set(['queued','committing','outcome-unknown','succeeded',
  'already-installed','skip','blocked','failed','cancelled','interrupted']);
const ACTIVE=new Set(['queued','committing','outcome-unknown']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const keys=(v,allow)=>Object.keys(v).every(k=>allow.includes(k));
const error=(code,message)=>Object.assign(new Error(message),{code});

export function readMarketBatch(value) {
  if(value==null)return null;
  if(!plain(value)||!keys(value,['batchId','collectionId','revision','updatedAt','items'])||
    !COLLECTION_IDS.has(value.collectionId)||!Number.isSafeInteger(value.revision)||
    value.revision<1||!Number.isSafeInteger(value.updatedAt)||value.updatedAt<0||
    (value.batchId!=null&&!UUID.test(value.batchId))||
    !Array.isArray(value.items)||value.items.length<1||value.items.length>MAX_INSTALLED_TOOLS)
    throw error('E_BATCH_SCHEMA','已有批次记录不符合受限格式；请保留原记录排查，禁止覆盖');
  const ids=new Set(),items=[];
  for(const item of value.items){
    if(!plain(item)||!keys(item,['id','version','operationId','status','reason'])||
      typeof item.id!=='string'||!OFFICIAL_APPS.some(row=>row.id===item.id)||
      ids.has(item.id)||typeof item.version!=='string'||!SEMVER.test(item.version)||
      typeof item.operationId!=='string'||!UUID.test(item.operationId)||
      !STATUS.has(item.status)||typeof item.reason!=='string'||item.reason.length>300)
      throw error('E_BATCH_SCHEMA','批次成员身份、状态或操作 ID 无效；不能覆盖历史操作');
    ids.add(item.id);
    items.push({id:item.id,version:item.version,operationId:item.operationId,
      status:item.status,reason:item.reason});
  }
  return {batchId:value.batchId||null,collectionId:value.collectionId,
    revision:value.revision,updatedAt:value.updatedAt,items};
}
export function createMarketBatch(collection,rows,{idFactory=()=>crypto.randomUUID(),now=()=>Date.now()}={}) {
  if(!plain(collection)||!COLLECTION_IDS.has(collection.id)||!Number.isSafeInteger(collection.revision)||
    collection.revision<1||!Array.isArray(collection.members)||
    !Array.isArray(rows)||rows.length!==collection.members.length||
    rows.length<1||rows.length>MAX_INSTALLED_TOOLS)
    throw error('E_BATCH_PLAN','套装快照或预检结果不完整');
  const batch={batchId:idFactory(),collectionId:collection.id,revision:collection.revision,
    updatedAt:now(),items:rows.map((row,index)=>{
      const member=collection.members[index],app=row?.app;
      if(!app||app.id!==member?.id||app.version!==member?.version||
        !['ready','skip','blocked'].includes(row.status))
        throw error('E_BATCH_PLAN','成员版本、顺序或预检状态已发生变化');
      return {id:app.id,version:app.version,operationId:idFactory(),
        status:row.status==='ready'?'queued':row.status,reason:String(row.reason||'').slice(0,300)};
    })};
  return readMarketBatch(batch);
}
export function marketBatchUnresolved(batch) {
  return Boolean(batch?.items?.some(row=>ACTIVE.has(row.status)));
}
export function reconcileQueuedAfterInterruption(batch) {
  const saved=readMarketBatch(batch);
  if(!saved)return null;
  for(const item of saved.items){
    if(item.status==='queued'){
      item.status='interrupted';
      item.reason='上次会话中尚未派发；重新预检后才能安装';
    }
  }
  return saved;
}
export async function withMarketBatchLock(lockManager,work) {
  if(!lockManager?.request)throw error('E_BATCH_LOCK','浏览器不支持安全批量事务锁');
  return lockManager.request('opendesk.market:batch',{ifAvailable:true},async lock=>{
    if(!lock)throw error('E_BATCH_ACTIVE','另一个应用市场正在安装或恢复套装；不能重复执行');
    return work();
  });
}
