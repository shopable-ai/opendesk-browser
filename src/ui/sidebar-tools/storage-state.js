// Confirm durable Chrome local writes instead of trusting a possibly lost acknowledgement.
// Callers hold the existing per-tool/catalog lock; there is no cross-call transaction.
export const storageError=(code,message,cause)=>Object.assign(new Error(message),{code,...(cause?{cause}:{})});
export function stableStorageString(value){
  return JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
    ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
}
export function sameStorageValue(a,b){return stableStorageString(a)===stableStorageString(b);}
export function classifyStorageWriteError(cause,scope='扩展本地存储'){
  if(cause?.code&&String(cause.code).startsWith('E_'))return cause;
  const message=String(cause?.message||cause||'');
  if(/QUOTA_BYTES|quota exceeded|quota.*exceed|storage.*full|disk.*full|no space left|空间不足/i.test(message))
    return storageError('E_HOST_STORAGE_QUOTA',scope+'写入受到 Chrome 配额或设备空间限制；已保留原数据',cause);
  return storageError('E_HOST_STORAGE_WRITE',scope+'写入失败；已保留原数据，请检查浏览器存储状态',cause);
}
export function unknownStorageOutcome(cause,scope='本地存储'){
  return storageError('E_OUTCOME_UNKNOWN',scope+'实际写入状态暂时无法确认；请先恢复核对，不要盲目重试',cause);
}
// A rejected promise may occur after persistent mutation. Compare the complete
// value read under the caller's lock before deciding whether the write failed.
export async function writeVerifiedLocalValue(api,key,next,previous,scope='本地存储'){
  let failure=null;
  try{await api.storage.local.set({[key]:next});}catch(error){failure=error;}
  let actual;
  try{actual=(await api.storage.local.get(key))[key];}
  catch(error){throw unknownStorageOutcome(error,scope);}
  if(sameStorageValue(actual,next))return {confirmed:true,acknowledgementLost:Boolean(failure)};
  if(failure&&sameStorageValue(actual,previous))
    throw classifyStorageWriteError(failure,scope);
  throw unknownStorageOutcome(failure,scope);
}


// Browser SDK storage reuses the Side Panel's installed-tool namespace and
// durable Chrome local storage, under the existing tool/catalog Web Locks.
import {SIDEBAR_TOOL_DATA_LIMITS,sidebarToolStorageKey} from './package.js';
const sdkStorageKey=key=>typeof key==='string'&&
  /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(key)&&
  !['__proto__','constructor','prototype'].includes(key);
const sdkStorageBytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const sdkStorageFail=(code,message=code)=>storageError(code,message);
export async function executeBrowserToolStorage({api,operation,toolId,input={},authorize}={}){
  if(typeof authorize!=='function'||typeof api?.storage?.local?.get!=='function'||
     typeof api?.storage?.local?.set!=='function')
    throw sdkStorageFail('E_CONTEXT','Trusted Browser Host and existing Chrome storage required');
  const action=operation?.slice('browser.storage.local.'.length);
  if(!['get','set','remove','clear'].includes(action)||!operation.startsWith('browser.storage.local.'))
    throw sdkStorageFail('E_SERVICE_UNSUPPORTED');
  if(input===null||typeof input!=='object'||Array.isArray(input))
    throw sdkStorageFail('E_SCHEMA');
  await authorize();
  const namespace=sidebarToolStorageKey(toolId);
  let current;
  try{current=(await api.storage.local.get(namespace))[namespace]??{};}
  catch{throw sdkStorageFail('E_HOST_STORAGE_READ');}
  if(!current||typeof current!=='object'||Array.isArray(current)||
     Object.keys(current).length>SIDEBAR_TOOL_DATA_LIMITS.maxKeys||
     Object.keys(current).some(key=>!sdkStorageKey(key))||
     sdkStorageBytes(current)>SIDEBAR_TOOL_DATA_LIMITS.totalBytes)
    throw sdkStorageFail('E_STORAGE_CORRUPT','Tool storage contains invalid or oversized data');
  const keys=input.keys;
  if(['get','remove'].includes(action)&&
     (keys!==undefined&&(!Array.isArray(keys)||keys.length>100||
       keys.some(key=>!sdkStorageKey(key))||new Set(keys).size!==keys.length)||
      action==='remove'&&!Array.isArray(keys)))
    throw sdkStorageFail('E_SCHEMA','Invalid tool-owned storage keys');
  if(action==='get'){
    const selected={};
    for(const key of keys??Object.keys(current))
      if(Object.hasOwn(current,key))selected[key]=current[key];
    if(sdkStorageBytes({items:selected})>12000)
      throw sdkStorageFail('E_LIMIT','Tool storage response exceeds Browser SDK budget');
    await authorize();
    return {items:selected};
  }
  const next=Object.assign(Object.create(null),current);
  let count=0;
  if(action==='set'){
    const items=input.items;
    if(!items||typeof items!=='object'||Array.isArray(items)||
       ![Object.prototype,null].includes(Object.getPrototypeOf(items))||
       Object.keys(items).length>100)
      throw sdkStorageFail('E_SCHEMA');
    for(const [key,value] of Object.entries(items)){
      if(!sdkStorageKey(key)||value===undefined)
        throw sdkStorageFail('E_SCHEMA','Invalid storage key or value');
      let encoded;
      try{encoded=JSON.stringify(value);}catch{throw sdkStorageFail('E_VALUE_SERIALIZATION');}
      if(encoded===undefined)throw sdkStorageFail('E_VALUE_SERIALIZATION');
      if(new TextEncoder().encode(encoded).byteLength>SIDEBAR_TOOL_DATA_LIMITS.itemBytes)
        throw sdkStorageFail('E_LIMIT','Tool storage item exceeds existing 8 KB limit');
      let copy;
      try{copy=JSON.parse(encoded);}catch{throw sdkStorageFail('E_VALUE_SERIALIZATION');}
      next[key]=copy;count++;
    }
  }else if(action==='remove'){
    for(const key of keys)if(Object.hasOwn(next,key)){delete next[key];count++;}
  }else{
    if(input.confirm!==true)throw sdkStorageFail('E_SCHEMA','Explicit confirmed clear required');
    count=Object.keys(next).length;
    for(const key of Object.keys(next))delete next[key];
  }
  if(Object.keys(next).length>SIDEBAR_TOOL_DATA_LIMITS.maxKeys||
     sdkStorageBytes(next)>SIDEBAR_TOOL_DATA_LIMITS.totalBytes)
    throw sdkStorageFail('E_LIMIT','Tool storage exceeds existing 32-key / 32 KB limit');
  await authorize();
  if(!sameStorageValue(current,next)){
    await writeVerifiedLocalValue(api,namespace,next,current,'本工具 SDK 数据');
    try{await authorize();}catch{throw sdkStorageFail('E_OUTCOME_UNKNOWN','Tool data may have changed before revocation');}
  }
  return action==='set'?{written:count}:{removed:count};
}
