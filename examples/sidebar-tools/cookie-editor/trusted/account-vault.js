// First-party Cookie Editor vault. This file is compiled into the trusted MV3
// worker, never into the installed React/sandbox bundle or the Browser SDK.
// Persistent storage contains authenticated ciphertext only. The AES key is
// passphrase-derived and retained in trusted, memory-only Chrome session storage.
import {COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY}
  from './account-contract.js';
export {COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY} from './account-contract.js';
const FORMAT=1,ITERATIONS=420000,MAX_PLAIN_BYTES=512000;
const fail=(code)=>Object.assign(new Error(code),{code});
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const utf8=value=>enc.encode(value);
const b64=bytes=>btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(''));
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
async function derive(password,salt,subtle){
  if(typeof password!=='string'||password.length<12||password.length>256||
    utf8(password).length>512)throw fail('E_VAULT_PASSPHRASE');
  const base=await subtle.importKey('raw',utf8(password),'PBKDF2',false,['deriveBits']);
  const bits=await subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',
    iterations:ITERATIONS,salt},base,256);
  return new Uint8Array(bits);
}
const importAes=(bytes,subtle)=>subtle.importKey('raw',bytes,
  {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
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
async function seal(data,key,salt,cryptoImpl){
  const content=utf8(JSON.stringify(checkData(data)));
  if(content.length>MAX_PLAIN_BYTES)throw fail('E_VAULT_LIMIT');
  const iv=cryptoImpl.getRandomValues(new Uint8Array(12));
  const cipher=new Uint8Array(await cryptoImpl.subtle.encrypt({
    name:'AES-GCM',iv,additionalData:utf8('opendesk.cookie-editor.vault.v1')
  },key,content));
  return {format:FORMAT,iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),
    ciphertext:b64(cipher)};
}
export function createCookieAccountVault({api=globalThis.chrome,
  cryptoImpl=globalThis.crypto}={}){
  let serial=Promise.resolve();
  const exclusive=task=>{
    const run=serial.then(task,task);
    serial=run.catch(()=>{});
    return run;
  };
  async function session(){
    if(!api?.storage?.session?.get||!api.storage.session?.setAccessLevel)
      throw fail('E_VAULT_SESSION_UNAVAILABLE');
    await api.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
    const value=(await api.storage.session.get(COOKIE_ACCOUNT_SESSION_KEY))
      [COOKIE_ACCOUNT_SESSION_KEY];
    return value?.format===FORMAT&&typeof value.key==='string'&&
      raw(value.key).length===32?value:null;
  }
  async function keyFor(){
    const value=await session();
    if(!value)throw fail('E_VAULT_LOCKED');
    const row=(await api.storage.local.get(COOKIE_ACCOUNT_VAULT_KEY))[COOKIE_ACCOUNT_VAULT_KEY];
    if(!row||value.salt!==row.salt)throw fail('E_VAULT_LOCKED');
    return {row:envelope(row),key:await importAes(raw(value.key),cryptoImpl.subtle)};
  }
  const read=async()=>{
    const {row,key}=await keyFor();
    return openVault(row,key,cryptoImpl.subtle);
  };
  async function status(){
    const saved=(await api.storage.local.get(COOKIE_ACCOUNT_VAULT_KEY))
      [COOKIE_ACCOUNT_VAULT_KEY];
    if(!saved)return {configured:false,unlocked:false,revision:0,
      accounts:[],settings:empty().settings};
    envelope(saved);
    try{
      const data=await read();
      return {configured:true,unlocked:true,revision:data.revision,
        accounts:data.accounts.map(({alias,origin,displayName,version,allowAuto})=>
          ({alias,origin,displayName,version,allowAuto})),
        settings:{...data.settings}};
    }catch(error){
      if(error?.code!=='E_VAULT_LOCKED'&&
         error?.code!=='E_VAULT_SESSION_UNAVAILABLE')throw error;
      return {configured:true,unlocked:false,revision:null,
        accounts:[],settings:empty().settings};
    }
  }
  async function unlock(password){
    return exclusive(async()=>{
      if(!cryptoImpl?.subtle||!cryptoImpl?.getRandomValues)
        throw fail('E_VAULT_CRYPTO_UNAVAILABLE');
      // Refuse to create a vault without ephemeral trusted key storage.
      await session();
      let saved=(await api.storage.local.get(COOKIE_ACCOUNT_VAULT_KEY))
        [COOKIE_ACCOUNT_VAULT_KEY];
      const salt=saved?raw(envelope(saved).salt):
        cryptoImpl.getRandomValues(new Uint8Array(16));
      const bytes=await derive(password,salt,cryptoImpl.subtle);
      const key=await importAes(bytes,cryptoImpl.subtle);
      if(saved){
        await openVault(saved,key,cryptoImpl.subtle);
      }else{
        saved=await seal(empty(),key,salt,cryptoImpl);
        await api.storage.local.set({[COOKIE_ACCOUNT_VAULT_KEY]:saved});
        const confirmed=(await api.storage.local.get(COOKIE_ACCOUNT_VAULT_KEY))
          [COOKIE_ACCOUNT_VAULT_KEY];
        if(JSON.stringify(confirmed)!==JSON.stringify(saved))
          throw fail('E_OUTCOME_UNKNOWN');
      }
      await api.storage.session.set({[COOKIE_ACCOUNT_SESSION_KEY]:
        {format:FORMAT,salt:saved.salt,key:b64(bytes)}});
      const result=await status();
      if(!result.unlocked)throw fail('E_VAULT_LOCKED');
      return result;
    });
  }
  async function lock(){
    return exclusive(async()=>{
      if(!api?.storage?.session?.remove)throw fail('E_VAULT_SESSION_UNAVAILABLE');
      await api.storage.session.remove(COOKIE_ACCOUNT_SESSION_KEY);
      if((await api.storage.session.get(COOKIE_ACCOUNT_SESSION_KEY))
        [COOKIE_ACCOUNT_SESSION_KEY]!==undefined)throw fail('E_OUTCOME_UNKNOWN');
      return {locked:true};
    });
  }
  async function update(expectedRevision,change){
    if(!checkRevision(expectedRevision))throw fail('E_VAULT_REVISION');
    return exclusive(async()=>{
      const {row,key}=await keyFor();
      const original=await openVault(row,key,cryptoImpl.subtle);
      if(original.revision!==expectedRevision)throw fail('E_VAULT_CONFLICT');
      const next=structuredClone(original);
      await change(next);
      next.revision++;
      const replacement=await seal(next,key,raw(row.salt),cryptoImpl);
      const before=(await api.storage.local.get(COOKIE_ACCOUNT_VAULT_KEY))
        [COOKIE_ACCOUNT_VAULT_KEY];
      if(JSON.stringify(before)!==JSON.stringify(row))
        throw fail('E_VAULT_CONFLICT');
      await api.storage.local.set({[COOKIE_ACCOUNT_VAULT_KEY]:replacement});
      const after=(await api.storage.local.get(COOKIE_ACCOUNT_VAULT_KEY))
        [COOKIE_ACCOUNT_VAULT_KEY];
      if(JSON.stringify(after)!==JSON.stringify(replacement))
        throw fail('E_OUTCOME_UNKNOWN');
      return next.revision;
    });
  }
  return Object.freeze({status,read,unlock,lock,update});
}
