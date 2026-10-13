// Trusted Chrome Tabs driver wired through the installed-tool Browser SDK Host.
// Only exact, one-use Host-approved requests may reach these Chrome operations.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const MAX_OWNED=8,TTL_MS=600000;
const tokenPattern=/^[A-Za-z0-9_-]{16,160}$/;
function owner(context){
 if(!context||typeof context!=='object'||!/^[a-z][a-z0-9-]{1,39}$/.test(context.toolId)||
  !/^[a-f0-9]{64}$/.test(context.packageHash)||
  typeof context.installEpoch!=='string'||!context.installEpoch)
  throw fail('E_OWNER','Verified installed tool identity required');
 return context.toolId+':'+context.packageHash+':'+context.installEpoch;
}
export function browserTabUrl(value){
 if(typeof value!=='string'||!value||value.trim()!==value||
   new TextEncoder().encode(value).length>2048)
  throw fail('E_SCHEMA','Expected a bounded absolute HTTP(S) URL');
 let url;try{url=new URL(value)}catch{throw fail('E_SCHEMA','Invalid URL')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>2048)
  throw fail('E_SCHEMA','Only HTTP(S) without embedded credentials');
 return url;
}
function input(value,key){
 if(!value||typeof value!=='object'||Array.isArray(value)||
   ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
   Object.keys(value).length!==1||!Object.hasOwn(value,key))
  throw fail('E_SCHEMA','Expected only '+key);
}
// authorize must be injected by the trusted extension Host. It revalidates
// package hash, tool epoch, per-site approval, Chrome permissions and user intent.
export function createBrowserTabHost({api=globalThis.chrome,authorize,clock=Date,
 createRef=()=>crypto.randomUUID()}={}){
 if(typeof authorize!=='function')throw fail('E_CONTEXT','Trusted authorization delegate required');
 const refs=new Map(),byTool=new Map();
 const purge=ref=>{
  const row=refs.get(ref);if(!row)return;
  refs.delete(ref);const set=byTool.get(row.owner);set?.delete(ref);
  if(set&&!set.size)byTool.delete(row.owner);
 };
 const invalidateTab=tabId=>{for(const [ref,row] of refs)if(row.tabId===tabId)purge(ref)};
 api?.tabs?.onRemoved?.addListener?.(invalidateTab);
 api?.tabs?.onUpdated?.addListener?.((id,change)=>{
  for(const [ref,row] of refs){
   if(row.tabId!==id)continue;
   if(change?.discarded===true){purge(ref);continue;}
   const grace=row.initialNavigation&&clock.now()<row.initialUntil;
   // Chrome emits URL/loading for a freshly created tab. Retain its ref
   // during that one initial load, but NEVER permit a different target URL.
   if(change?.url!==undefined&&change.url!==row.url){purge(ref);continue;}
   if(change?.status==='loading'&&!grace){purge(ref);continue;}
   if(change?.status==='complete')row.initialNavigation=false;
  }
 });
 const approved=async(operation,origin,context)=>{
  if(await authorize({operation,origin,context})!==true)
   throw fail('E_SITE_GRANT_REQUIRED','Origin grant or explicit user intent missing');
 };
 async function create(args,context){
  input(args,'url');
  const url=browserTabUrl(args.url),owned=owner(context);
  if(!api?.tabs?.create||!api?.tabs?.remove)throw fail('E_CHROME_UNSUPPORTED');
  if((byTool.get(owned)?.size||0)>=MAX_OWNED)throw fail('E_LIMIT','Too many owned tabs');
  await approved('browser.tabs.create',url.origin,context);
  const tab=await api.tabs.create({url:url.href,active:true});
  if(!Number.isSafeInteger(tab?.id)||tab.id<0)
   throw fail('E_OUTCOME_UNKNOWN','Chrome returned no trustworthy tab ID');
  try{await approved('browser.tabs.create',url.origin,context)}
  catch(e){
   try{await api.tabs.remove(tab.id)}catch{throw fail('E_OUTCOME_UNKNOWN','Revocation after unknown tab side effect')}
   throw e;
  }
  const tabRef=createRef();
  if(typeof tabRef!=='string'||!tokenPattern.test(tabRef)||refs.has(tabRef)){
   try{await api.tabs.remove(tab.id)}catch{}
   throw fail('E_CONTEXT','No secure opaque reference');
  }
  refs.set(tabRef,{owner:owned,tabId:tab.id,origin:url.origin,url:url.href,
    expiresAt:clock.now()+TTL_MS,initialNavigation:tab.status!=='complete',
    initialUntil:clock.now()+15000});
  if(!byTool.has(owned))byTool.set(owned,new Set());
  byTool.get(owned).add(tabRef);
  return {tabRef};
 }
 async function activateOwned(args,context){
  input(args,'tabRef');
  if(typeof args.tabRef!=='string'||!tokenPattern.test(args.tabRef))
    throw fail('E_SCHEMA','Only an owned TabRef is accepted');
  if(!api?.tabs?.get||!api?.tabs?.update)throw fail('E_CHROME_UNSUPPORTED');
  // Focusing may look harmless but must be bound to the SAME DOCUMENT,
  // not merely a tab with the same URL following an unseen reload.
  const before=await resolve(args.tabRef,context);
  await approved('browser.tabs.activateOwned',before.origin,context);
  const target=await resolve(args.tabRef,context);
  if(target.tabId!==before.tabId||target.documentId!==before.documentId)
    throw fail('E_DOCUMENT_STALE','Owned tab document changed before focus');
  let moved;
  try{
    moved=await api.tabs.update(target.tabId,{active:true});
    if(Number.isSafeInteger(moved?.windowId)&&typeof api?.windows?.update==='function')
      await api.windows.update(moved.windowId,{focused:true});
  }catch{throw fail('E_OUTCOME_UNKNOWN','Chrome focus may have happened; do not replay')}
  if(moved?.id!==target.tabId)
    throw fail('E_OUTCOME_UNKNOWN','Chrome did not confirm the target tab');
  try{
    const after=await resolve(args.tabRef,context);
    if(after.documentId!==before.documentId)throw fail('E_DOCUMENT_STALE');
    await approved('browser.tabs.activateOwned',before.origin,context);
  }catch{throw fail('E_OUTCOME_UNKNOWN','Document or authority changed after focus')}
  return {focused:true};
 }
 // Internal resolution: only Host receives a tabId, never untrusted callers.
 async function resolve(tabRef,context){
  const owned=owner(context),row=refs.get(tabRef);
  if(!row||row.owner!==owned||clock.now()>=row.expiresAt){
   if(row&&clock.now()>=row.expiresAt)purge(tabRef);
   throw fail('E_TAB_REF_INVALID','Tab reference expired or belongs to another tool');
  }
  const tab=await api.tabs.get(row.tabId).catch(()=>null);
  let currentUrl;
  try{currentUrl=browserTabUrl(tab?.url)}catch{}
  // Same-Origin path changes are not safe if Chrome's onUpdated event was missed.
  if(!tab||tab.id!==row.tabId||currentUrl?.href!==row.url||tab.incognito){
   purge(tabRef);throw fail('E_TAB_REF_INVALID','Tab closed or navigated');
  }
  if(typeof api.webNavigation?.getFrame!=='function')
   throw fail('E_CHROME_UNSUPPORTED','Document identity unavailable');
  const frame=await api.webNavigation.getFrame({tabId:row.tabId,frameId:0});
  if(!frame?.documentId||frame.errorOccurred||
     (frame.documentLifecycle&&frame.documentLifecycle!=='active')||
     frame.url!==row.url)
   throw fail('E_DOCUMENT_STALE','Owned tab document not active');
  if(refs.get(tabRef)!==row||clock.now()>=row.expiresAt)
   throw fail('E_TAB_REF_INVALID','Tab reference was revoked during Chrome lookup');
  // Pin the first verified active document to this ephemeral TabRef.
  // Missed onUpdated/loading events must not let the same URL on a NEW
  // document silently inherit the prior tool authority.
  if(row.documentId!==undefined&&row.documentId!==frame.documentId){
    purge(tabRef);
    throw fail('E_TAB_REF_INVALID','Owned tab document replaced at the same URL');
  }
  if(row.documentId===undefined)row.documentId=frame.documentId;
  return {tabId:row.tabId,windowId:tab.windowId,documentId:frame.documentId,
   url:frame.url,incognito:false,origin:row.origin};
 }
 // Only the exact installed tool can discover its own live, bounded TabRef records.
 async function getOwned(args,context){
  input(args,'tabRef');
  const before=await resolve(args.tabRef,context);
  await approved('browser.tabs.getOwned',before.origin,context);
  const after=await resolve(args.tabRef,context);
  if(after.documentId!==before.documentId)throw fail('E_DOCUMENT_STALE');
  const row=refs.get(args.tabRef);
  return {tabRef:args.tabRef,url:row.url,origin:row.origin,expiresAt:row.expiresAt};
 }
 async function listOwned(args={},context){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length)
   throw fail('E_SCHEMA','Expected no arguments');
  const owned=owner(context),tabs=[];
  for(const tabRef of [...(byTool.get(owned)||[])]){
   try{
    const before=await resolve(tabRef,context);
    await approved('browser.tabs.listOwned',before.origin,context);
    const after=await resolve(tabRef,context);
    if(after.documentId===before.documentId)tabs.push({tabRef,origin:before.origin});
   }catch{/* A stale, foreign or revoked TabRef cannot be enumerated. */}
  }
  return {tabs};
 }
 async function pinOwned(args,context){
  // A pinned operation is confined to the exact owned tab/document; it is not
  // a generic Chrome tabs.update(tabId, ...) proxy.
  if(!args||typeof args!=='object'||Array.isArray(args)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(args))||
     Object.keys(args).length!==2||!Object.hasOwn(args,'tabRef')||
     !Object.hasOwn(args,'pinned')||typeof args.pinned!=='boolean'||
     typeof args.tabRef!=='string'||!tokenPattern.test(args.tabRef))
    throw fail('E_SCHEMA','Only an owned TabRef and boolean pinned are accepted');
  if(typeof api.tabs?.update!=='function')throw fail('E_CHROME_UNSUPPORTED');
  const before=await resolve(args.tabRef,context);
  await approved('browser.tabs.pinOwned',before.origin,context);
  const current=await resolve(args.tabRef,context);
  if(current.tabId!==before.tabId||current.documentId!==before.documentId)
    throw fail('E_DOCUMENT_STALE','Tab changed before pinning');
  let receipt;
  try{receipt=await api.tabs.update(before.tabId,{pinned:args.pinned})}
  catch{throw fail('E_OUTCOME_UNKNOWN','Chrome pin operation may have occurred; do not retry')}
  if(receipt?.id!==before.tabId||receipt?.pinned!==args.pinned)
    throw fail('E_OUTCOME_UNKNOWN','Chrome did not confirm the precise pinned state');
  try{
    const after=await resolve(args.tabRef,context);
    if(after.documentId!==before.documentId)throw fail('E_DOCUMENT_STALE');
    await approved('browser.tabs.pinOwned',before.origin,context);
  }catch{throw fail('E_OUTCOME_UNKNOWN','Authority or document changed after native pinning')}
  return {pinned:args.pinned};
 }
 async function reloadOwned(args,context){
  input(args,'tabRef');
  if(typeof args.tabRef!=='string'||!tokenPattern.test(args.tabRef))
    throw fail('E_SCHEMA','Only an owned TabRef is accepted');
  if(typeof api.tabs?.reload!=='function')throw fail('E_CHROME_UNSUPPORTED');
  const before=await resolve(args.tabRef,context);
  await approved('browser.tabs.reloadOwned',before.origin,context);
  const target=await resolve(args.tabRef,context);
  if(target.tabId!==before.tabId||target.documentId!==before.documentId)
    throw fail('E_DOCUMENT_STALE','Tab document changed before reload');
  // Reload replaces the document, so consume the old TabRef BEFORE Chrome can
  // apply any side effect. Unknown native outcome is never blindly retried.
  purge(args.tabRef);
  try{await api.tabs.reload(before.tabId,{bypassCache:false})}
  catch{throw fail('E_OUTCOME_UNKNOWN','Chrome reload may have occurred; do not replay')}
  try{await approved('browser.tabs.reloadOwned',before.origin,context)}
  catch{throw fail('E_OUTCOME_UNKNOWN','Grant changed after Chrome accepted reload')}
  // Chrome acknowledges the request, not the new document's load completion.
  return {reloadRequested:true,tabRefRevoked:true};
 }
 async function navigateOwned(args,context){
  if(!args||typeof args!=='object'||Array.isArray(args)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(args))||
     Object.keys(args).length!==2||!Object.hasOwn(args,'tabRef')||
     !Object.hasOwn(args,'url')||typeof args.tabRef!=='string'||
     !tokenPattern.test(args.tabRef))
    throw fail('E_SCHEMA','Expected exact owned TabRef and destination URL');
  const destination=browserTabUrl(args.url);
  if(typeof api.tabs?.update!=='function')throw fail('E_CHROME_UNSUPPORTED');
  const before=await resolve(args.tabRef,context);
  // This first scoped implementation never broadens site permission through a
  // cross-Origin navigation. Explicitly opening a new URL uses tabs.create.
  if(destination.origin!==before.origin)
    throw fail('E_SITE_GRANT_REQUIRED','Owned-tab navigation must remain on the same Origin');
  await approved('browser.tabs.navigateOwned',before.origin,context);
  const target=await resolve(args.tabRef,context);
  if(target.tabId!==before.tabId||target.documentId!==before.documentId)
    throw fail('E_DOCUMENT_STALE','Tab changed before navigation');
  purge(args.tabRef); // old document identity must not survive native navigation
  let result;
  try{result=await api.tabs.update(before.tabId,{url:destination.href})}
  catch{throw fail('E_OUTCOME_UNKNOWN','Chrome navigation effect may have occurred; do not replay')}
  if(result?.id!==before.tabId)
    throw fail('E_OUTCOME_UNKNOWN','Chrome did not acknowledge the owned Tab ID');
  try{await approved('browser.tabs.navigateOwned',before.origin,context)}
  catch{throw fail('E_OUTCOME_UNKNOWN','Grant changed after native navigation')}
  return {navigationRequested:true,tabRefRevoked:true};
 }
 async function removeOwned(args,context){
  input(args,'tabRef');
  if(typeof api?.tabs?.remove!=='function')throw fail('E_CHROME_UNSUPPORTED');
  const before=await resolve(args.tabRef,context);
  await approved('browser.tabs.removeOwned',before.origin,context);
  const after=await resolve(args.tabRef,context);
  if(after.tabId!==before.tabId||after.documentId!==before.documentId)
   throw fail('E_DOCUMENT_STALE','Tab document changed');
  // No retry when the native outcome is unknown: consume the ref first.
  purge(args.tabRef);
  try{await api.tabs.remove(after.tabId)}
  catch{throw fail('E_OUTCOME_UNKNOWN','Chrome close outcome unknown')}
  try{await approved('browser.tabs.removeOwned',before.origin,context)}
  catch{throw fail('E_OUTCOME_UNKNOWN','Authority changed after native close')}
  return {closed:true};
 }
 const revokeTool=id=>{for(const [ref,row] of refs)if(row.owner.startsWith(id+':'))purge(ref)};
 return Object.freeze({create,activateOwned,resolve,getOwned,listOwned,pinOwned,reloadOwned,navigateOwned,removeOwned,invalidateTab,revokeTool,
  dispose:()=>{refs.clear();byTool.clear()},
  diagnostics:()=>({references:refs.size})});
}
