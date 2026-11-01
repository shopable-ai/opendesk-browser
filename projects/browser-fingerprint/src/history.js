import {HISTORY_SCHEMA,HISTORY_KEY,HISTORY_LIMIT,HISTORY_ITEM_BYTES,freezeSnapshot} from './model.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function parse(value){
  if(value===null)return {schema:HISTORY_SCHEMA,items:[]};
  if(!value||value.schema!==HISTORY_SCHEMA||!Array.isArray(value.items)||
    value.items.length>HISTORY_LIMIT)throw fail('E_HISTORY_SCHEMA','历史版本异常，拒绝覆盖');
  const ids=new Set();
  const items=value.items.map(row=>freezeSnapshot(JSON.parse(JSON.stringify(row))));
  for(const s of items){
    if(ids.has(s.id))throw fail('E_HISTORY_SCHEMA','快照 ID 重复');
    ids.add(s.id);
  }
  return Object.freeze({schema:HISTORY_SCHEMA,items:Object.freeze(items)});
}
export async function readHistory(request){
  const r=await request('storage.get',{key:HISTORY_KEY,withEtag:true});
  if(!/^[0-9a-f]{64}$/.test(String(r?.etag||'')))
    throw fail('E_HISTORY_ETAG','无法验证存储 ETag，已停止写入');
  return {history:parse(r.value??null),etag:r.etag};
}
async function commit(request,history,etag){
  if(bytes(history)>HISTORY_ITEM_BYTES)
    throw fail('E_HISTORY_LIMIT','单项存储容量不足：请先导出并删除历史记录');
  let ack;
  try{ack=await request('storage.set',{key:HISTORY_KEY,value:history,ifMatch:etag});}
  catch(e){
    if(e?.code==='E_STORAGE_CONFLICT')throw e;
    throw fail('E_OUTCOME_UNKNOWN','写入结果未知：请先重新读取，不能盲目重试');
  }
  if(ack?.saved!==true)throw fail('E_OUTCOME_UNKNOWN','写入成功回执缺失');
  let checked;
  try{checked=await readHistory(request);}catch{
    throw fail('E_OUTCOME_UNKNOWN','写入后未完成读回，结果未知');
  }
  if(JSON.stringify(checked.history)!==JSON.stringify(history))
    throw fail('E_OUTCOME_UNKNOWN','历史读回与预期不同');
  return checked.history.items;
}
export async function saveSnapshot(request,snapshot){
  freezeSnapshot(snapshot);
  const {history,etag}=await readHistory(request);
  if(history.items.some(row=>row.id===snapshot.id))
    throw fail('E_DUPLICATE','已存在相同快照，不能覆盖');
  if(history.items.length>=HISTORY_LIMIT)
    throw fail('E_HISTORY_LIMIT','最多保存 5 份，请先导出并删除旧记录');
  return commit(request,{schema:HISTORY_SCHEMA,items:[snapshot,...history.items]},etag);
}
export async function deleteSnapshot(request,id){
  const {history,etag}=await readHistory(request);
  if(!history.items.some(row=>row.id===id))
    throw fail('E_SNAPSHOT_MISSING','快照已经不存在，请重新加载');
  return commit(request,{schema:HISTORY_SCHEMA,
    items:history.items.filter(row=>row.id!==id)},etag);
}
