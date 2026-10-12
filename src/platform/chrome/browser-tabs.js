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
  if(change?.url!==undefined||change?.status==='loading'||change?.discarded===true)
   invalidateTab(id);
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
  refs.set(tabRef,{owner:owned,tabId:tab.id,origin:url.origin,expiresAt:clock.now()+TTL_MS});
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
      browserTabUrl(tab.url).origin===row.origin}catch{}
  if(!matches){purge(args.tabRef);throw fail('E_TAB_REF_INVALID','Tab changed or closed')}
  const moved=await api.tabs.update(row.tabId,{active:true});
  if(Number.isSafeInteger(moved?.windowId)&&typeof api?.windows?.update==='function')
   await api.windows.update(moved.windowId,{focused:true});
  try{await approved('browser.tabs.focus',row.origin,context)}
  catch{throw fail('E_OUTCOME_UNKNOWN','Grant revoked after focus')}
  if(moved?.id!==row.tabId)throw fail('E_OUTCOME_UNKNOWN','Chrome did not confirm focus');
  return {focused:true};
 }
 const revokeTool=id=>{for(const [ref,row] of refs)if(row.owner.startsWith(id+':'))purge(ref)};
 return Object.freeze({open,focus,invalidateTab,revokeTool,
  dispose:()=>{refs.clear();byTool.clear()},
  diagnostics:()=>({references:refs.size})});
}
