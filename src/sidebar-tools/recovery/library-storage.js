import {extensionRecoveryAccounts} from './account.js';

// The original tool namespace owns the library and its uninstall cleanup.
// This reserved key cannot be requested by a tool through its public storage API.
const scopedKey='_graydoveAccountLibraries';
const libraryKey='library';
export const isRecoveryLibrary=(id,key)=>id==='ai-knowledge-answers'&&key===libraryKey;
export const validRecoveryAccountId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
export const accountSlot=id=>'account:'+id;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const damaged=()=>Object.assign(new Error('Invalid account library storage'),{code:'E_STORAGE_CORRUPT'});

export function libraryStorage(stored,account=null,{claim=false,hash=null}={}){
  if(!object(stored))throw damaged();
  const scoped=Object.hasOwn(stored,scopedKey);
  if(!scoped&&!claim)return {value:stored[libraryKey]??null,replace:value=>({...stored,[libraryKey]:value})};
  const slots=scoped?stored[scopedKey]:{};
  if(!object(slots)||scoped&&Object.hasOwn(stored,libraryKey))throw damaged();
  if(!validRecoveryAccountId(account?.id)||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))
    return {value:null,replace(){throw Object.assign(new Error('Matching account and installation required'),{code:'E_ACCOUNT_CHANGED'});}};
  const slot=accountSlot(account.id);
  const saved=slots[slot];
  const value=scoped?saved?.value??null:stored[libraryKey]??null;
  if(saved&&(!object(saved)||typeof saved.hash!=='string'||!Object.hasOwn(saved,'value')))throw damaged();
  if(saved&&saved.hash!==hash)
    return {value:null,incompatible:true,replace(){throw damaged();}};
  return {value,replace(value){
    const next={...stored,[scopedKey]:{...slots,[slot]:{hash,value}}};
    delete next[libraryKey];
    return next;
  }};
}

export async function toolLibraryStorage(stored,packageHash){
  if(!Object.hasOwn(stored,scopedKey))return libraryStorage(stored);
  const account=await extensionRecoveryAccounts.current();
  if(account&&await account.isCurrent()!==true)throw Object.assign(new Error('Account changed'),{code:'E_ACCOUNT_CHANGED'});
  return {...libraryStorage(stored,account,{hash:await packageHash()}),async assertCurrent(){
    if(!account||await account.isCurrent()!==true)throw Object.assign(new Error('Account changed'),{code:'E_ACCOUNT_CHANGED'});
  }};
}
