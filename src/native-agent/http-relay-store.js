// Extension-origin IndexedDB is unavailable to website content scripts and the
// opaque tool iframe. This stores channel keys, never network permissions.
const DATABASE='opendesk-native-http-channel-v1';
export function relayStore(idb=globalThis.indexedDB){
  let opening;
  const db=()=>opening??=new Promise((resolve,reject)=>{
    const request=idb.open(DATABASE,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('channel');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  async function transaction(mode,work){
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction('channel',mode);let result;
      const request=work(tx.objectStore('channel'));
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  return {read:()=>transaction('readonly',s=>s.get('pair')),
    write:value=>transaction('readwrite',s=>s.put(value,'pair')),
    clear:()=>transaction('readwrite',s=>s.delete('pair'))};
}
