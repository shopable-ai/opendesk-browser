// App-owned data only. Authorization belongs to the managed Page bridge.
export const PREFERENCES_KEY='preferences';
export function pageIdentity(href){
  const url=new URL(href);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Unsupported page origin');
  url.hash='';
  return {origin:url.origin,page:url.origin+url.pathname};
}
export function preferenceState(value,href){
  const {origin,page}=pageIdentity(href),prefs=value??{};
  if(typeof prefs!=='object'||Array.isArray(prefs))throw Error('Invalid reading preferences');
  for(const key of ['blockedOrigins','disabledPages','hiddenSites','hiddenPages'])
    if(prefs[key]!==undefined&&(!Array.isArray(prefs[key])||prefs[key].some(v=>typeof v!=='string')))
      throw Error('Invalid reading preferences');
  return {origin,page,enabled:!prefs.blockedOrigins?.includes(origin)&&!prefs.disabledPages?.includes(page),
    visible:!prefs.hiddenSites?.includes(origin)&&!prefs.hiddenPages?.includes(page)};
}
export async function originStorageKey(origin,crypto=globalThis.crypto){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(origin));
  return 'origin.'+[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,12);
}
// Retry only a confirmed CAS conflict. Unknown writes/capacity failures never replay.
export async function updateStored(storage,key,change,active=()=>true){
  for(let attempt=0;attempt<4;attempt++){
    const before=await storage.get({key,withEtag:true});
    if(typeof before?.etag!=='string'||!before.etag)throw Error('Missing storage ETag');
    if(!active())throw Error('Page disposed or changed');
    const value=change(before.value);
    try{
      const result=await storage.set({key,value,ifMatch:before.etag});
      if(result?.saved!==true)throw Error('Storage write not confirmed');
      return value;
    }catch(error){if(error?.code!=='E_STORAGE_CONFLICT'||attempt===3)throw error;}
  }
}
export function updateOrigin(storage,key,origin,patch,active){
  return updateStored(storage,key,value=>{
    if(value&&value.origin!==origin)throw Error('Origin storage collision');
    return {...value,origin,...patch};
  },active);
}
