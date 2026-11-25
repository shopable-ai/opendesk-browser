// Trusted, device-local navigation preferences. Never read from a tool package.
export const SIDEBAR_LAST_EXTENSION_DETAIL_KEY='opendesk.sidebar.last-extension-detail.v1';
export const DETAIL_MEMORY_PREFERENCE_PREFIX='opendesk.sidebar.extension-detail-memory.v1:';
export const isExtensionDetailKey=value=>typeof value==='string'&&/^(app|page):[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
export function detailMemoryPreferenceKey(key){
  if(!isExtensionDetailKey(key))throw Error('E_DETAIL_MEMORY_KEY');
  return DETAIL_MEMORY_PREFERENCE_PREFIX+key;
}
const enabledFrom=value=>{
  if(value===undefined)return true;
  if(typeof value!=='boolean')throw Error('E_DETAIL_MEMORY_PREFERENCE');
  return value;
};

export function createExtensionDetailMemory({storage,locks}){
  const last=SIDEBAR_LAST_EXTENSION_DETAIL_KEY;
  const read=async keys=>{
    const result=await storage.get(keys);
    if(!result||typeof result!=='object'||Array.isArray(result))throw Error('E_DETAIL_MEMORY_READ');
    return result;
  };
  // Request the lock at intent time, without a preceding per-document queue.
  // Chrome's origin-wide FIFO then orders different Side Panel documents too.
  const locked=work=>{
    if(!locks?.request)return Promise.reject(Error('E_DETAIL_MEMORY_LOCK'));
    return locks.request(last,work);
  };
  const clear=async(matches,canClear=()=>true)=>locked(async()=>{
    if(!canClear())return false;
    const saved=(await read(last))[last];
    if(!matches(saved)||!canClear())return false;
    await storage.set({[last]:null});
    return true;
  });
  let navigation=0;
  return {
    async readLast(){return (await read(last))[last];},
    async readPreference(key){return enabledFrom((await read(detailMemoryPreferenceKey(key)))[detailMemoryPreferenceKey(key)]);},
    record(key){
      const preference=detailMemoryPreferenceKey(key),intent=++navigation;
      return locked(async()=>{
        const enabled=enabledFrom((await read(preference))[preference]);
        if(intent!==navigation)return false;
        // Visiting an opted-out detail also replaces the previous navigation.
        await storage.set({[last]:enabled?key:null});
        return true;
      });
    },
    clear,
    setEnabled(key,enabled){
      if(typeof enabled!=='boolean')return Promise.reject(Error('E_DETAIL_MEMORY_PREFERENCE'));
      const preference=detailMemoryPreferenceKey(key);
      return locked(async()=>{
        const saved=(await read(last))[last];
        const clearCurrent=!enabled&&saved===key;
        await storage.set({[preference]:enabled,...(clearCurrent?{[last]:null}:{})});
        const confirmed=await read(clearCurrent?[preference,last]:[preference]);
        if(confirmed[preference]!==enabled||(clearCurrent&&confirmed[last]!==null))
          throw Error('E_DETAIL_MEMORY_UNCONFIRMED');
        // Enabling does not select or remember a detail. A future entry does.
        return enabled;
      });
    },
    restore(key,canRestore,open){
      const preference=detailMemoryPreferenceKey(key);
      return locked(async()=>{
        const saved=await read([last,preference]);
        if(saved[last]!==key)return false;
        const eligibility=canRestore();
        if(eligibility==='invalid'){
          // Keep authoritative invalidation and cleanup in this transaction.
          // A newer same-key navigation must queue after this clear.
          await storage.set({[last]:null});
          return 'invalid';
        }
        if(eligibility!==true)return false;
        if(!enabledFrom(saved[preference])){
          await storage.set({[last]:null});
          return false;
        }
        // Synchronous navigation while holding the lock: no late startup read
        // can open a superseded key or overwrite a newer document's selection.
        open();return true;
      });
    },
    forget(key){
      const preference=detailMemoryPreferenceKey(key);
      return locked(async()=>{
        if((await read(last))[last]===key)await storage.set({[last]:null});
        await storage.remove(preference);
      });
    }
  };
}
