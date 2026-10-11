// Genuine upstream store.js@2.0.12, pinned by the root npm lock.
// Page USER_SCRIPT only. Uses synchronous origin localStorage with a bounded
// owner prefix; never impersonates extension-private AppStorage.
import upstream from 'store/dist/store.modern.js';

const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const OWNER='__opendeskStoreOwnerV1';
const PREFIX='__opendesk_store_v1_';
function checkKey(key){
  if(typeof key!=='string'||key.length<1||key.length>256||
    /[\x00-\x1f\x7f]/.test(key)||['__proto__','prototype','constructor'].includes(key))
    throw fail('E_CONFIG_UNSUPPORTED','Invalid store key');
  return key;
}

export function installPageStore(scope=globalThis){
  if(!scope.document||!/^https?:\/\//.test(String(scope.location?.origin??'')))
    throw fail('E_BUILTIN_WORLD','store.js requires an HTTP(S) Page document');
  if(Object.hasOwn(scope,'store'))throw fail('E_BUILTIN_COLLISION','store already exists');
  const owner=Object.getOwnPropertyDescriptor(scope,OWNER);
  if(!owner||owner.writable||!owner.configurable||typeof owner.value!=='string'||
     !/^[a-f0-9]{64}$/.test(owner.value))
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE','Missing trusted store owner identity');
  let local;
  try {local=scope.localStorage;}catch{throw fail('E_STORAGE_UNAVAILABLE','Site localStorage is not available');}
  if(!local||['getItem','setItem','removeItem','key'].some(name=>typeof local[name]!=='function'))
    throw fail('E_STORAGE_UNAVAILABLE','Persistent localStorage is unavailable');
  const prefix=PREFIX+owner.value+'_';
  const engineStorage={
    name:'opendesk-scoped-localstorage',
    read:key=>local.getItem(prefix+key),
    write:(key,value)=>local.setItem(prefix+key,value),
    remove:key=>local.removeItem(prefix+key),
    each:callback=>{
      // Restrict iteration to this exact owner. Never reveal website or other
      // tool storage names, even if the website stores arbitrary keys.
      for(let index=local.length-1;index>=0;index--){
        const fullKey=local.key(index);
        if(typeof fullKey==='string'&&fullKey.startsWith(prefix))
          callback(local.getItem(fullKey),fullKey.slice(prefix.length));
      }
    },
    clearAll:()=>{
      for(let index=local.length-1;index>=0;index--){
        const fullKey=local.key(index);
        if(typeof fullKey==='string'&&fullKey.startsWith(prefix))
          local.removeItem(fullKey);
      }
    }
  };
  let engine;
  try {engine=upstream.createStore(engineStorage,[], 'opendesk');}
  catch{throw fail('E_STORAGE_UNAVAILABLE','store.js persistent backend failed');}
  if(!engine?.enabled)throw fail('E_STORAGE_UNAVAILABLE','store.js refused persistent storage');
  const api=Object.freeze({
    version:'2.0.12',enabled:true,
    get:(key,fallback)=>engine.get(checkKey(key),fallback),
    set:(key,value)=>{
      checkKey(key);
      if(value!==undefined){
        let serialized;
        try{serialized=JSON.stringify(value);}catch{throw fail('E_VALUE_SERIALIZATION');}
        if(typeof serialized!=='string'||new TextEncoder().encode(serialized).length>128*1024)
          throw fail('E_LIMIT','store.js single value exceeds 128KiB');
      }
      return engine.set(key,value);
    },
    remove:key=>engine.remove(checkKey(key)),
    each:callback=>{
      if(typeof callback!=='function')throw fail('E_CONFIG_UNSUPPORTED','Expected a store iterator');
      return engine.each((value,key)=>callback(value,key));
    },
    clearAll:()=>engine.clearAll()
  });
  if(!delete scope[OWNER])throw fail('E_BUILTIN_COLLISION','Store scope registration not closed');
  Object.defineProperty(scope,'store',{value:api,writable:false,configurable:false,enumerable:false});
}
