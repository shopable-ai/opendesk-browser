// Independent R2.1 storage namespaces. Old A-only snapshot history is untouched.
import {validConfig,copyConfig} from './env-config.js';
export const PRESETS_KEY='fingerprint.r21.presets.v1';
export const RUNS_KEY='fingerprint.r21.runs.v1';
export const PRESETS_SCHEMA='opendesk.browser-fingerprint.presets.r21.v1';
export const RUNS_SCHEMA='opendesk.browser-fingerprint.runs.r21.v1';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).byteLength;
const idOk=id=>typeof id==='string'&&/^p-[A-Za-z0-9_-]{6,72}$/.test(id);
const validName=name=>typeof name==='string'&&name.trim()===name&&
  name.length>=1&&name.length<=24&&!/[\x00-\x1f\x7f]/.test(name);
const validOrigin=origin=>{
  if(typeof origin!=='string'||origin.length>300)return false;
  try{const u=new URL(origin);return ['http:','https:'].includes(u.protocol)&&
    u.origin===origin&&!u.username&&!u.password;}catch{return false;}
};
function parsePresets(value){
  if(value===null)return Object.freeze({schema:PRESETS_SCHEMA,items:Object.freeze([])});
  if(!plain(value)||value.schema!==PRESETS_SCHEMA||!Array.isArray(value.items)||
    value.items.length>20||Object.keys(value).sort().join(',')!=='items,schema')
    throw fail('E_PRESET_SCHEMA','预设版本未知，不能覆盖');
  const ids=new Set(),names=new Set();
  const items=value.items.map(row=>{
    if(!plain(row)||Object.keys(row).sort().join(',')!=='config,id,name'||
       !idOk(row.id)||!validName(row.name)||!validConfig(row.config)||
       ids.has(row.id)||names.has(row.name.toLowerCase()))
      throw fail('E_PRESET_SCHEMA','预设存在无效或重复字段');
    ids.add(row.id);names.add(row.name.toLowerCase());
    return Object.freeze({id:row.id,name:row.name,config:Object.freeze(copyConfig(row.config))});
  });
  return Object.freeze({schema:PRESETS_SCHEMA,items:Object.freeze(items)});
}
const statuses=new Set(['idle','blocked','denied','failed','unknown','invalidated',
  'applying','applied_unverified','verified_limited','partial','restoring',
  'restore_unknown','restored_verified']);
const kinds=new Set(['apply','verify','restore','target','preset']);
const sources=new Set(['client-precheck','trusted-browser-host','client-unknown']);
const validRecord=row=>plain(row)&&Object.keys(row).sort().join(',')===
  'at,detail,id,kind,origin,presetName,source,status'&&
  typeof row.id==='string'&&/^r-[A-Za-z0-9_-]{6,72}$/.test(row.id)&&
  typeof row.at==='string'&&Number.isFinite(Date.parse(row.at))&&
  kinds.has(row.kind)&&statuses.has(row.status)&&
  validOrigin(row.origin)&&typeof row.presetName==='string'&&
  row.presetName.length<=24&&typeof row.detail==='string'&&row.detail.length<=180&&
  !/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(row.detail)&&sources.has(row.source);
function parseRuns(value){
  if(value===null)return Object.freeze({schema:RUNS_SCHEMA,items:Object.freeze([])});
  if(!plain(value)||value.schema!==RUNS_SCHEMA||!Array.isArray(value.items)||
    value.items.length>18||Object.keys(value).sort().join(',')!=='items,schema')
    throw fail('E_RUN_SCHEMA','运行记录格式未知，拒绝覆盖');
  const ids=new Set();
  const rows=value.items.map(row=>{
    if(!validRecord(row)||ids.has(row.id))throw fail('E_RUN_SCHEMA','记录字段无效');
    ids.add(row.id);return Object.freeze({...row});
  });
  return Object.freeze({schema:RUNS_SCHEMA,items:Object.freeze(rows)});
}
async function read(request,key,parse){
  const response=await request('storage.get',{key,withEtag:true});
  if(!/^[0-9a-f]{64}$/.test(String(response?.etag||'')))
    throw fail('E_STORAGE_ETAG','缺少可信存储版本');
  return {value:parse(response.value??null),etag:response.etag};
}
async function commit(request,key,proposed,etag,parse){
  if(bytes(proposed)>7900)throw fail('E_STORAGE_LIMIT','已超过单项存储安全上限');
  parse(proposed); // Validate before any effect.
  let receipt;
  try{receipt=await request('storage.set',{key,value:proposed,ifMatch:etag});}
  catch(error){
    if(error?.code==='E_STORAGE_CONFLICT')throw error;
    throw fail('E_OUTCOME_UNKNOWN','存储写入结果未知，请读回后处理；禁止自动重试');
  }
  if(receipt?.saved!==true)throw fail('E_OUTCOME_UNKNOWN','存储没有明确成功回执');
  let check;
  try{check=await read(request,key,parse);}
  catch{throw fail('E_OUTCOME_UNKNOWN','存储读回失败，写入结果未知');}
  if(JSON.stringify(check.value)!==JSON.stringify(proposed))
    throw fail('E_OUTCOME_UNKNOWN','读回内容与提交不同');
  return check.value.items;
}
export const readPresets=request=>read(request,PRESETS_KEY,parsePresets);
export const readRuns=request=>read(request,RUNS_KEY,parseRuns);
export async function savePreset(request,{id,name,config}){
  if((id!==null&&id!==undefined&&!idOk(id))||!validName(name)||!validConfig(config))
    throw fail('E_PRESET_SCHEMA','预设参数不符合约束');
  const {value,etag}=await readPresets(request);
  const items=value.items.map(row=>({id:row.id,name:row.name,config:copyConfig(row.config)}));
  if(items.some(row=>row.name.toLowerCase()===name.toLowerCase()&&row.id!==id))
    throw fail('E_PRESET_DUPLICATE','预设名称已存在');
  const existing=items.findIndex(row=>row.id===id);
  if(id&&existing===-1)throw fail('E_PRESET_CHANGED','目标预设已删除；请刷新');
  if(existing===-1&&items.length>=20)throw fail('E_PRESET_LIMIT','最多保留 20 个自定义预设');
  const created=globalThis.crypto?.randomUUID?.()||
    (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const safe={id:id||'p-'+created,name,config:copyConfig(config)};
  if(existing!==-1)items.splice(existing,1);
  items.unshift(safe);
  const saved=await commit(request,PRESETS_KEY,{schema:PRESETS_SCHEMA,items},etag,parsePresets);
  return {items,id:safe.id};
}
export async function deletePreset(request,id){
  if(!idOk(id))throw fail('E_PRESET_SCHEMA','只能删除自定义预设');
  const {value,etag}=await readPresets(request);
  if(!value.items.some(x=>x.id===id))throw fail('E_PRESET_CHANGED','预设不存在');
  return commit(request,PRESETS_KEY,{schema:PRESETS_SCHEMA,
    items:value.items.filter(x=>x.id!==id).map(x=>({id:x.id,name:x.name,config:copyConfig(x.config)}))},
  etag,parsePresets);
}
export async function appendRun(request,row){
  if(!validRecord(row))throw fail('E_RUN_SCHEMA','无效运行记录，已拒绝写入');
  const {value,etag}=await readRuns(request);
  if(value.items.some(x=>x.id===row.id))throw fail('E_RUN_DUPLICATE','重复记录');
  return commit(request,RUNS_KEY,{schema:RUNS_SCHEMA,
    items:[row,...value.items].slice(0,18)},etag,parseRuns);
}
