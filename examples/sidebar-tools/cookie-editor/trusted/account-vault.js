// First-party Cookie account storage, compiled only into the trusted MV3 worker.
// Cookie values stay in the existing Foundation frameworkKV, never in metadata.
// The old vault is read-only: an existing trusted session key may recover it.
import {COOKIE_ACCOUNT_STORE_KEY,COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY}
  from './account-contract.js';
export {COOKIE_ACCOUNT_STORE_KEY,COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY}
  from './account-contract.js';
const FORMAT=1,ITERATIONS=420000,MAX_PLAIN_BYTES=512000;
const fail=(code)=>Object.assign(new Error(code),{code});
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const utf8=value=>enc.encode(value);
const raw=value=>{
  if(typeof value!=='string'||value.length>800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw fail('E_VAULT_CORRUPT');
  try{return Uint8Array.from(atob(value),x=>x.charCodeAt(0));}
  catch{throw fail('E_VAULT_CORRUPT');}
};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const checkRevision=value=>Number.isSafeInteger(value)&&value>=0;
const empty=()=>({revision:0,accounts:[],settings:{autoRefresh:true,autoEnabled:false}});
function checkData(value){
  if(!plain(value)||!checkRevision(value.revision)||
    !Array.isArray(value.accounts)||value.accounts.length>64||
    !plain(value.settings)||typeof value.settings.autoRefresh!=='boolean'||
    typeof value.settings.autoEnabled!=='boolean')
    throw fail('E_VAULT_CORRUPT');
  const seen=new Set();
  for(const account of value.accounts){
    if(!plain(account)||typeof account.alias!=='string'||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{2,47}$/.test(account.alias)||
      seen.has(account.alias)||typeof account.displayName!=='string'||
      account.displayName.trim()!==account.displayName||
      account.displayName.length<1||account.displayName.length>64||
      (account.description!==undefined&&
        (typeof account.description!=='string'||account.description.length>120||
         /[\x00-\x1f\x7f]/.test(account.description)))||
      typeof account.origin!=='string'||account.origin.length>320||
      !Array.isArray(account.cookies)||account.cookies.length>100||
      typeof account.allowAuto!=='boolean'||!checkRevision(account.version))
      throw fail('E_VAULT_CORRUPT');
    let u;try{u=new URL(account.origin);}catch{throw fail('E_VAULT_CORRUPT');}
    if(!['http:','https:'].includes(u.protocol)||u.origin!==account.origin)
      throw fail('E_VAULT_CORRUPT');
    seen.add(account.alias);
  }
  return value;
}
function envelope(value){
  if(!plain(value)||value.format!==FORMAT||
    !Number.isSafeInteger(value.iterations)||value.iterations!==ITERATIONS||
    raw(value.salt).length!==16||raw(value.iv).length!==12||
    raw(value.ciphertext).length<17||raw(value.ciphertext).length>MAX_PLAIN_BYTES+100)
    throw fail('E_VAULT_CORRUPT');
  return value;
}
async function openVault(row,key,subtle){
  envelope(row);
  try{
    const clear=await subtle.decrypt({name:'AES-GCM',iv:raw(row.iv),
      additionalData:utf8('opendesk.cookie-editor.vault.v1')},key,raw(row.ciphertext));
    if(clear.byteLength>MAX_PLAIN_BYTES)throw fail('E_VAULT_CORRUPT');
    return checkData(JSON.parse(dec.decode(clear)));
  }catch(error){
    if(error?.code==='E_VAULT_CORRUPT')throw error;
    throw fail('E_VAULT_LOCKED_OR_CORRUPT');
  }
}
// Compare complete records independently of storage object key order.
function same(left,right){
  if(left===right)return true;
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&
    Array.isArray(right)&&left.length===right.length&&left.every((v,i)=>same(v,right[i]));
  return plain(left)&&plain(right)&&Object.keys(left).length===Object.keys(right).length&&
    Object.keys(left).every(key=>Object.hasOwn(right,key)&&same(left[key],right[key]));
}
function checkRecord(row){
  if(!plain(row)||row.format!==FORMAT||typeof row.legacyMigrated!=='boolean'||
     Object.keys(row).length!==5)throw fail('E_VAULT_CORRUPT');
  checkData(row);
  if(utf8(JSON.stringify(row)).length>MAX_PLAIN_BYTES)throw fail('E_VAULT_LIMIT');
  return row;
}
const dataOf=row=>({revision:row.revision,
  accounts:row.accounts.map(item=>({...item,description:item.description??''})),
  settings:row.settings});
export function createCookieAccountVault({api=globalThis.chrome,storage,
  cryptoImpl=globalThis.crypto}={}){
  let serial=Promise.resolve();
  const exclusive=task=>{
    const run=serial.then(task,task);
    serial=run.catch(()=>{});
    return run;
  };
  async function trustedStorage(){
    try{
      const service=await storage?.();
      if(typeof service?.transaction!=='function'||service.readOnly===true)
        throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');
      return service;
    }catch{throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');}
  }
  const get=async(area,key)=>(await area.get(key))[key];
  async function stored(service){
    try{return await service.transaction(['frameworkKV'],'readonly',
      tx=>tx.get('frameworkKV',COOKIE_ACCOUNT_STORE_KEY));}
    catch{throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');}
  }
  async function legacyRow(){
    try{
      if(!api?.storage?.local?.get)throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');
      return await get(api.storage.local,COOKIE_ACCOUNT_VAULT_KEY);
    }catch{throw fail('E_ACCOUNT_STORAGE_UNAVAILABLE');}
  }
  async function recoverLegacy(row){
    try{
      envelope(row);
      const area=api?.storage?.session;
      if(!area?.get||!area?.setAccessLevel||!cryptoImpl?.subtle)return null;
      await area.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
      const value=await get(area,COOKIE_ACCOUNT_SESSION_KEY);
      if(value?.format!==FORMAT||value.salt!==row.salt||raw(value.key).length!==32)
        return null;
      const key=await cryptoImpl.subtle.importKey('raw',raw(value.key),
        {name:'AES-GCM',length:256},false,['decrypt']);
      return await openVault(row,key,cryptoImpl.subtle);
    }catch{return null;} // Preserve unreadable legacy bytes without claiming migration.
  }
  async function write(service,original,replacement){
    let attempted=false,changed;
    try{
      changed=await service.transaction(['frameworkKV'],'readwrite',async tx=>{
        // Compare and write under Foundation's single native transaction lock.
        if(!same(await tx.get('frameworkKV',COOKIE_ACCOUNT_STORE_KEY),original))return false;
        attempted=true;
        await tx.put('frameworkKV',replacement,COOKIE_ACCOUNT_STORE_KEY);
        return true;
      });
    }catch{throw fail(attempted?'E_OUTCOME_UNKNOWN':'E_ACCOUNT_STORAGE_UNAVAILABLE');}
    if(changed!==true)throw fail('E_VAULT_CONFLICT');
    try{
      if(!same(await stored(service),replacement))throw fail('E_OUTCOME_UNKNOWN');
    }catch{throw fail('E_OUTCOME_UNKNOWN');} // Do not retry uncertain commits or readbacks.
  }
  async function load(){
    const service=await trustedStorage();
    let row=await stored(service);
    const legacy=await legacyRow();
    if(row!==undefined){
      checkRecord(row);
      return {service,row,data:dataOf(row),legacyLocked:legacy!==undefined&&!row.legacyMigrated};
    }
    if(legacy!==undefined){
      const recovered=await recoverLegacy(legacy);
      if(recovered){
        const replacement=checkRecord({format:FORMAT,...recovered,legacyMigrated:true});
        if(!same(await legacyRow(),legacy))throw fail('E_VAULT_CONFLICT');
        await write(service,row,replacement);
        row=replacement;
        return {service,row,data:dataOf(row),legacyLocked:false};
      }
    }
    return {service,row,data:empty(),legacyLocked:legacy!==undefined};
  }
  const read=()=>exclusive(async()=>structuredClone((await load()).data));
  const status=()=>exclusive(async()=>{
    const {data,legacyLocked}=await load();
    return {configured:true,unlocked:true,legacyLocked,revision:data.revision,
      accounts:data.accounts.map(({alias,origin,displayName,description,version,allowAuto,cookies})=>
        ({alias,origin,displayName,description,version,allowAuto,
          cookieCount:cookies.length})),settings:{
        autoRefresh:data.settings.autoRefresh,autoEnabled:data.settings.autoEnabled}};
  });
  async function update(expectedRevision,change){
    if(!checkRevision(expectedRevision))throw fail('E_VAULT_REVISION');
    return exclusive(async()=>{
      const {service,row,data}=await load();
      if(data.revision!==expectedRevision)throw fail('E_VAULT_CONFLICT');
      const next=structuredClone(data);
      await change(next);
      next.revision++;
      const replacement=checkRecord({format:FORMAT,...next,legacyMigrated:row?.legacyMigrated??false});
      await write(service,row,replacement);
      return next.revision;
    });
  }
  const clear=()=>exclusive(async()=>{
    const service=await trustedStorage();
    try{
      await service.transaction(['frameworkKV'],'readwrite',
        tx=>tx.delete('frameworkKV',COOKIE_ACCOUNT_STORE_KEY));
      if(await stored(service)!==undefined)throw fail('E_OUTCOME_UNKNOWN');
    }catch{throw fail('E_OUTCOME_UNKNOWN');}
    return {cleared:true};
  });
  return Object.freeze({status,read,update,clear});
}
