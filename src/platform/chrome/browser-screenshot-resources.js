// Trusted, short-lived screenshot handoff. PNG bytes never leave this service worker
// through tool IPC. A completed ref is a scoped Chrome download receipt, not a URL
// or permission to read another tab's pixels. No persistent image cache is created.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const TOKEN=/^[A-Za-z0-9_-]{16,160}$/,MAX_BYTES=8*1024*1024;
const MAX_PENDING=2,MAX_RECEIPTS=32,PENDING_TTL=30000,RECEIPT_TTL=600000;
const owner=ctx=>{
 if(!ctx||typeof ctx.toolId!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(ctx.toolId)||
    !/^[a-f0-9]{64}$/.test(ctx.packageHash||'')||
    typeof ctx.installEpoch!=='string'||!ctx.installEpoch)
   throw fail('E_OWNER','Verified installed tool identity required');
 return ctx.toolId+':'+ctx.packageHash+':'+ctx.installEpoch;
};
const page=value=>{
 try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u:null}
 catch{return null}
};
export function createBrowserScreenshotResources({api=globalThis.chrome,clock=Date,
 createRef=()=>crypto.randomUUID()}={}){
 const pending=new Map(),receipts=new Map();
 let generation=0;
 const now=()=>clock.now();
 function cleanup(){
  for(const [id,row] of pending)if(now()>=row.expiresAt)pending.delete(id);
  for(const [id,row] of receipts)if(now()>=row.expiresAt)receipts.delete(id);
 }
 function ref(){
  const value=createRef();
  if(typeof value!=='string'||!TOKEN.test(value)||pending.has(value)||receipts.has(value))
    throw fail('E_CONTEXT','Unique screenshot reference unavailable');
  return value;
 }
 async function createResource({data,mimeType,bytes,target,context}={}){
  const owned=owner(context);cleanup();
  if(pending.size>=MAX_PENDING)throw fail('E_LIMIT','Only two pending screenshots allowed');
  if(mimeType!=='image/png'||typeof data!=='string'||!data.startsWith('data:image/png;base64,')||
     data.length>Math.ceil(MAX_BYTES/3)*4+64||
     !Number.isSafeInteger(bytes)||bytes<=0||bytes>MAX_BYTES)
    throw fail('E_SCHEMA','Bounded private PNG required');
  if(!Number.isSafeInteger(target?.tabId)||target.tabId<0||
     typeof target.documentId!=='string'||!target.documentId||
     !page(target.url)||target.incognito===true)
    throw fail('E_TARGET','Active approved webpage required');
  const id=ref();
  pending.set(id,{owned,data,bytes,tabId:target.tabId,
   documentId:target.documentId,url:target.url,
   expiresAt:now()+PENDING_TTL,createdAt:now(),generation});
  return {resourceRef:id};
 }
 async function discardResource(resourceRef){
  return pending.delete(resourceRef);
 }
 function assertOwned(row,context){
  if(!row||row.owned!==owner(context))throw fail('E_RESOURCE_REF_INVALID','Screenshot receipt does not belong to this tool');
 }
 async function deliver(resourceRef,context,authorize){
  if(typeof resourceRef!=='string'||!TOKEN.test(resourceRef)||typeof authorize!=='function')
    throw fail('E_SCHEMA','Authorized private screenshot reference required');
  cleanup();const row=pending.get(resourceRef);
  assertOwned(row,context);
  if(row.generation!==generation)throw fail('E_GRANT_REVOKED');
  // Revalidate before consuming any unreplayable Chrome download request.
  if(await authorize({tabId:row.tabId,documentId:row.documentId,url:row.url})!==true)
    throw fail('E_SITE_PERMISSION_REVOKED');
  if(pending.get(resourceRef)!==row||row.generation!==generation)
    throw fail('E_GRANT_REVOKED');
  pending.delete(resourceRef); // a rejected/unknown download cannot be replayed
  if(typeof api?.downloads?.download!=='function')
    throw fail('E_CHROME_UNSUPPORTED','Chrome downloads API is unavailable');
  let downloadId;
  try{
   const timestamp=new Date(now()).toISOString().replace(/[:.]/g,'-');
   downloadId=await api.downloads.download({url:row.data,
    filename:'OpenDesk-screenshot-'+timestamp+'.png',
    conflictAction:'uniquify',saveAs:true});
  }catch{throw fail('E_OUTCOME_UNKNOWN','Screenshot download outcome is unknown; check Chrome downloads before retrying')}
  if(!Number.isSafeInteger(downloadId)||downloadId<0)
    throw fail('E_OUTCOME_UNKNOWN','Chrome did not confirm screenshot download');
  if(row.generation!==generation)
    throw fail('E_OUTCOME_UNKNOWN','Authority changed after download was requested; inspect Chrome downloads');
  receipts.set(resourceRef,{owned:row.owned,downloadId,bytes:row.bytes,
    createdAt:now(),expiresAt:now()+RECEIPT_TTL});
  if(receipts.size>MAX_RECEIPTS)receipts.delete(receipts.keys().next().value);
  return {resourceRef,downloadId,bytes:row.bytes};
 }
 function inspect(resourceRef,context){
  cleanup();const row=receipts.get(resourceRef);
  assertOwned(row,context);
  return {downloadId:row.downloadId,bytes:row.bytes,expiresAt:row.expiresAt};
 }
 function revokeTab(tabId){
  for(const [id,row] of pending)if(row.tabId===tabId)pending.delete(id);
 }
 function revokeAll(){generation++;pending.clear();receipts.clear()}
 return Object.freeze({createResource,discardResource,deliver,inspect,revokeTab,revokeAll,
  diagnostics:()=>({pending:pending.size,receipts:receipts.size})});
}
