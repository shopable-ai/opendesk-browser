// Restricted first-party screenshot driver. This module is not a public
// Browser SDK route. The Host must supply exact target, consent and private storage.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const MAX_BYTES=8*1024*1024,MAX_PIXELS=4096*4096;
const pageUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&
 !u.username&&!u.password?u:null}catch{return null}};
function options(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
  Object.keys(value).length!==1||typeof value.tabRef!=='string'||
  !/^[A-Za-z0-9_-]{16,160}$/.test(value.tabRef))
  throw fail('E_SCHEMA','Opaque authorized tab reference required');
}
function parsePNG(data){
 if(typeof data!=='string'||!data.startsWith('data:image/png;base64,'))
  throw fail('E_CAPTURE','Chrome returned a non-PNG image');
 const value=data.slice('data:image/png;base64,'.length);
 if(value.length<32||value.length>Math.ceil(MAX_BYTES/3)*4+8||!/^[A-Za-z0-9+/=]+$/.test(value))
  throw fail('E_LIMIT','Screenshot exceeds byte budget');
 const prefix=Array.from(atob(value.slice(0,36)),x=>x.charCodeAt(0));
 if(prefix.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10'||
  String.fromCharCode(...prefix.slice(12,16))!=='IHDR')
  throw fail('E_CAPTURE','Invalid PNG signature');
 const word=i=>(prefix[i]<<24>>>0)+(prefix[i+1]<<16)+(prefix[i+2]<<8)+prefix[i+3];
 const width=word(16),height=word(20),bytes=Math.floor(value.length*3/4);
 if(!width||!height||width>4096||height>4096||width*height>MAX_PIXELS||bytes>MAX_BYTES)
  throw fail('E_LIMIT','Screenshot dimensions exceed limits');
 return {width,height,bytes};
}
export function createBrowserScreenshotHost({api=globalThis.chrome,resolveTarget,
 authorize,createResource,discardResource=async()=>{}}={}){
 if(typeof resolveTarget!=='function'||typeof authorize!=='function'||typeof createResource!=='function')
  throw fail('E_CONTEXT','Trusted target resolver, Host authorization and private resource storage required');
 async function target(tabRef,context){
  const t=await resolveTarget(tabRef,context);
  if(!t||!Number.isSafeInteger(t.tabId)||!Number.isSafeInteger(t.windowId)||
   !t.documentId||!pageUrl(t.url)||t.incognito)throw fail('E_TARGET','No authorized normal webpage');
  if(typeof api?.tabs?.query!=='function'||typeof api?.tabs?.captureVisibleTab!=='function')
   throw fail('E_CHROME_UNSUPPORTED','Chrome screenshot service unavailable');
  const active=await api.tabs.query({active:true,windowId:t.windowId});
  if(active.length!==1||active[0].id!==t.tabId||active[0].url!==t.url||active[0].incognito)
   throw fail('E_TARGET_CHANGED','Not the authorized visible tab');
  return t;
 }
 async function captureVisible(args,context){
  options(args);
  if(context?.trustedUserActivation!==true)
   throw fail('E_USER_GESTURE_REQUIRED','Real trusted UI click is required');
  const first=await target(args.tabRef,context),origin=pageUrl(first.url).origin;
  if(await authorize({target:first,origin,context,phase:'pre'})!==true)
   throw fail('E_SITE_GRANT_REQUIRED','Site authorization required');
  const data=await api.tabs.captureVisibleTab(first.windowId,{format:'png'});
  const png=parsePNG(data);
  const next=await target(args.tabRef,context);
  if(next.documentId!==first.documentId||next.url!==first.url)
   throw fail('E_DOCUMENT_CHANGED','Document changed during capture');
  if(await authorize({target:next,origin,context,phase:'post'})!==true)
   throw fail('E_SITE_PERMISSION_REVOKED','Permission revoked during capture');
  const result=await createResource({data,mimeType:'image/png',width:png.width,height:png.height,
   bytes:png.bytes,target:first,context});
  if(!result?.resourceRef||typeof result.resourceRef!=='string')
   throw fail('E_OUTCOME_UNKNOWN','Resource write not confirmed');
  try{
   const final=await target(args.tabRef,context);
   if(final.documentId!==first.documentId||final.url!==first.url)throw fail('E_DOCUMENT_CHANGED');
   if(await authorize({target:final,origin,context,phase:'delivery'})!==true)
    throw fail('E_SITE_PERMISSION_REVOKED','Permission revoked before delivery');
  }catch(error){await discardResource(result.resourceRef);throw error}
  return {resourceRef:result.resourceRef,bytes:png.bytes,width:png.width,height:png.height};
 }
 return Object.freeze({captureVisible});
}
