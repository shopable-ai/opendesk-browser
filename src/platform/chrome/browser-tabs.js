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
 async function open(args,context){
  input(args,'url');
  const url=browserTabUrl(args.url),owned=owner(context);
  if(!api?.tabs?.create||!api?.tabs?.remove)throw fail('E_CHROME_UNSUPPORTED');
  if((byTool.get(owned)?.size||0)>=MAX_OWNED)throw fail('E_LIMIT','Too many owned tabs');
  await approved('browser.tabs.open',url.origin,context);
  const tab=await api.tabs.create({url:url.href,active:true});
  if(!Number.isSafeInteger(tab?.id)||tab.id<0)
   throw fail('E_OUTCOME_UNKNOWN','Chrome returned no trustworthy tab ID');
  try{await approved('browser.tabs.open',url.origin,context)}
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
 async function focus(args,context){
  input(args,'tabRef');const owned=owner(context);
  if(typeof args.tabRef!=='string'||!tokenPattern.test(args.tabRef))throw fail('E_SCHEMA');
  const row=refs.get(args.tabRef);
  if(!row||row.owner!==owned)throw fail('E_TAB_REF_INVALID');
  if(clock.now()>=row.expiresAt){purge(args.tabRef);throw fail('E_TAB_REF_INVALID')}
  if(!api?.tabs?.get||!api?.tabs?.update)throw fail('E_CHROME_UNSUPPORTED');
  await approved('browser.tabs.focus',row.origin,context);
  const tab=await api.tabs.get(row.tabId).catch(()=>null);
  let matches=false;
  try{matches=Number.isSafeInteger(tab?.id)&&tab.id===row.tabId&&
      browserTabUrl(tab.url).href===row.url}catch{}
  if(!matches){purge(args.tabRef);throw fail('E_TAB_REF_INVALID','Tab changed or closed')}
  if(refs.get(args.tabRef)!==row)throw fail('E_TAB_REF_INVALID','Tab authority was revoked');
  if(tab?.status==='complete')row.initialNavigation=false;
  const moved=await api.tabs.update(row.tabId,{active:true});
  if(Number.isSafeInteger(moved?.windowId)&&typeof api?.windows?.update==='function')
   await api.windows.update(moved.windowId,{focused:true});
  try{await approved('browser.tabs.focus',row.origin,context)}
  catch{throw fail('E_OUTCOME_UNKNOWN','Grant revoked after focus')}
  if(moved?.id!==row.tabId)throw fail('E_OUTCOME_UNKNOWN','Chrome did not confirm focus');
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
  return {tabId:row.tabId,windowId:tab.windowId,documentId:frame.documentId,
   url:frame.url,incognito:false,origin:row.origin};
 }
 const revokeTool=id=>{for(const [ref,row] of refs)if(row.owner.startsWith(id+':'))purge(ref)};
 return Object.freeze({open,focus,resolve,invalidateTab,revokeTool,
  dispose:()=>{refs.clear();byTool.clear()},
  diagnostics:()=>({references:refs.size})});
}
