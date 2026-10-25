// Trusted development preview data survives owner replacement within this Chrome
// session. It never inherits installed data or reports installed-tool analytics.
import {SIDEBAR_TOOL_DATA_LIMITS} from './package.js';
import {stableStorageString,storageError,unknownStorageOutcome,writeVerifiedStorageValue} from './storage-state.js';

const PREFIX='opendesk.sidebar-tools.development-data.v1:';
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const validKey=key=>typeof key==='string'&&/^[A-Za-z][A-Za-z0-9._-]{0,59}$/.test(key)&&
  !['__proto__','constructor','prototype'].includes(key);
const fail=(code,message=code)=>{throw storageError(code,message);};
const bytes=value=>new TextEncoder().encode(value).byteLength;

// Refuse lossy JSON conversion (undefined, functions, dates, sparse arrays,
// non-finite numbers, accessors, cycles), rather than silently saving other data.
function jsonCopy(value){
  const ancestors=new Set();
  const check=row=>{
    if(row===null||typeof row==='string'||typeof row==='boolean')return;
    if(typeof row==='number'&&Number.isFinite(row))return;
    if(!Array.isArray(row)&&!plain(row))fail('E_VALUE_SERIALIZATION');
    if(ancestors.has(row))fail('E_VALUE_SERIALIZATION');
    ancestors.add(row);
    const keys=Reflect.ownKeys(row).filter(key=>!(Array.isArray(row)&&key==='length'));
    if(Array.isArray(row)&&keys.length!==row.length)fail('E_VALUE_SERIALIZATION');
    for(const key of keys){
      const descriptor=Object.getOwnPropertyDescriptor(row,key);
      if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||
        Array.isArray(row)&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=row.length))
        fail('E_VALUE_SERIALIZATION');
      check(descriptor.value);
    }
    ancestors.delete(row);
  };
  try{check(value);return JSON.parse(JSON.stringify(value));}
  catch(error){if(error?.code==='E_VALUE_SERIALIZATION')throw error;fail('E_VALUE_SERIALIZATION');}
}
function freezeJson(value){
  if(value!==null&&typeof value==='object'){
    for(const row of Object.values(value))freezeJson(row);
    Object.freeze(value);
  }
  return value;
}
function validateData(value){
  if(!plain(value)||Object.keys(value).some(key=>!validKey(key)))fail('E_SCHEMA');
  const copy=jsonCopy(value);
  if(Object.keys(copy).length>SIDEBAR_TOOL_DATA_LIMITS.maxKeys||
    Object.values(copy).some(row=>bytes(JSON.stringify(row))>SIDEBAR_TOOL_DATA_LIMITS.itemBytes)||
    bytes(JSON.stringify(copy))>SIDEBAR_TOOL_DATA_LIMITS.totalBytes)
    fail('E_TOOL_DATA_LIMIT');
  return copy;
}
async function etagFor(value){
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableStorageString(value)));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

// authorize owns the asynchronous Native assertion; assertCommit synchronously
// rechecks generation after its await continuation, immediately before set.
export async function executeDevelopmentStorage({api,sourceId,toolId,operation,payload={},authorize,assertCommit,
  lockManager=globalThis.navigator?.locks}={}){
  if(typeof sourceId!=='string'||!/^source-[a-f0-9]{24}$/.test(sourceId)||
    typeof toolId!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(toolId))fail('E_SCHEMA');
  if(!['storage.get','storage.set'].includes(operation))fail('E_SERVICE_UNSUPPORTED');
  const area=api?.storage?.session;
  if(typeof area?.get!=='function'||typeof area?.set!=='function'||
    typeof authorize!=='function'||typeof lockManager?.request!=='function'||
    assertCommit!=null&&typeof assertCommit!=='function')fail('E_CONTEXT');
  if(!plain(payload))fail('E_SCHEMA');
  payload=freezeJson(jsonCopy(payload));
  const namespace=PREFIX+sourceId+':'+toolId;
  return lockManager.request(namespace,async()=>{
    await authorize();
    if(!plain(payload)||!validKey(payload.key)||
      Object.keys(payload).some(key=>!['key','value','ifMatch','withEtag','analyticsIntent','itemId'].includes(key))||
      payload.withEtag!==undefined&&typeof payload.withEtag!=='boolean')fail('E_SCHEMA');
    let raw;
    try{raw=(await area.get(namespace))[namespace];}
    catch(error){throw storageError('E_HOST_STORAGE_READ','Development data could not be read',error);}
    let stored;
    try{stored=validateData(raw===undefined?{}:raw);}
    catch(error){throw storageError('E_STORAGE_CORRUPT','Development data is invalid or oversized',error);}
    const current=Object.hasOwn(stored,payload.key)?stored[payload.key]:null;
    const etag=await etagFor(current);
    if(operation==='storage.get'){
      await authorize();
      return payload.withEtag===true?{value:current,etag}:{value:current};
    }
    if(typeof payload.ifMatch!=='string'||!/^[a-f0-9]{64}$/.test(payload.ifMatch))fail('E_SCHEMA');
    if(payload.ifMatch!==etag)fail('E_STORAGE_CONFLICT');
    const next=validateData({...stored,[payload.key]:jsonCopy(payload.value)});
    const nextEtag=await etagFor(next[payload.key]);
    await authorize();
    assertCommit?.();
    await writeVerifiedStorageValue(area,namespace,next,raw,'开发预览数据');
    try{await authorize();}catch(error){throw unknownStorageOutcome(error,'开发预览数据');}
    return {saved:true,etag:nextEtag};
  });
}
