// Scoped Chrome downloads driver for the existing authenticated Browser Host.
// It never exposes native download IDs, global download history or file paths
// to an installed tool. Volatile refs intentionally expire on Worker restart.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const TOKEN=/^[A-Za-z0-9_-]{16,160}$/;
const MAX_RECORDS=128,REF_TTL_MS=24*60*60*1000;
const STATES=new Set(['in_progress','complete','interrupted']);
function identity(context){
  if(!context||typeof context.toolId!=='string'||
     !/^[a-z][a-z0-9-]{1,39}$/.test(context.toolId)||
     typeof context.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(context.packageHash)||
     typeof context.installEpoch!=='string'||!context.installEpoch||
     typeof context.toolVersion!=='string'||!context.toolVersion)
    throw fail('E_OWNER','Verified installed-tool identity required');
  return JSON.stringify([context.toolId,context.toolVersion,context.packageHash,context.installEpoch]);
}
function httpOrigin(raw){
  let url;
  try{url=new URL(raw)}catch{throw fail('E_SCHEMA','Expected a safe HTTP(S) URL')}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
     url.href.length>2048||url.href!==raw)
    throw fail('E_SCHEMA','Credential-free canonical HTTP(S) download URL required');
  return url.origin;
}
function downloadFilename(value){
  if(value===undefined)return undefined;
  if(typeof value!=='string'||value.length<1||value.length>150||
     value.startsWith('.')||value.startsWith('/')||value.includes('\\')||
     value.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.'))||
     /[\u0000-\u001f\u007f:*?"<>|]/.test(value))
    throw fail('E_SCHEMA','Safe relative download filename required');
  return value;
}
export function createBrowserDownloadsHost({api=globalThis.chrome,authorize,
  clock=Date,createRef=()=>crypto.randomUUID()}={}){
  if(typeof authorize!=='function')throw fail('E_CONTEXT','Existing Host authority required');
  const records=new Map();let generation=0;
  const now=()=>clock.now();
  const prune=()=>{
    for(const [ref,row] of records)if(now()>=row.expiresAt||row.generation!==generation)
      records.delete(ref);
  };
  const newRef=()=>{
    const ref=createRef();
    if(typeof ref!=='string'||!TOKEN.test(ref)||records.has(ref))
      throw fail('E_CONTEXT','Unique opaque download reference unavailable');
    return ref;
  };
  const guard=async(operation,context,origin=null)=>{
    await authorize({operation,context,origin});
  };
  const owned=(downloadRef,context)=>{
    if(typeof downloadRef!=='string'||!TOKEN.test(downloadRef))
      throw fail('E_SCHEMA','Opaque downloadRef required');
    prune();
    const row=records.get(downloadRef);
    if(!row||row.owner!==identity(context))
      throw fail('E_DOWNLOAD_REF_INVALID','Download not owned by this installed tool');
    return row;
  };
  const details=async row=>{
    if(typeof api?.downloads?.search!=='function')
      throw fail('E_CHROME_UNSUPPORTED','Chrome downloads.search unavailable');
    let matches;
    try{matches=await api.downloads.search({id:row.downloadId})}
    catch{throw fail('E_CHROME','Chrome download state unavailable')}
    if(!Array.isArray(matches)||matches.length!==1||matches[0]?.id!==row.downloadId||
       !STATES.has(matches[0].state))
      throw fail('E_DOWNLOAD_REF_EXPIRED','Owned download no longer available');
    const item=matches[0];
    return {state:item.state,bytesReceived:Number.isSafeInteger(item.bytesReceived)&&
      item.bytesReceived>=0?item.bytesReceived:0,
      ...(Number.isSafeInteger(item.totalBytes)&&item.totalBytes>=0?{totalBytes:item.totalBytes}:{})};
  };
  async function download(input,context){
    const owner=identity(context),origin=httpOrigin(input.url);
    const filename=downloadFilename(input.filename);
    if(input.saveAs!==undefined&&typeof input.saveAs!=='boolean')throw fail('E_SCHEMA');
    prune();if(records.size>=MAX_RECORDS)throw fail('E_LIMIT','Too many owned download references');
    if(typeof api?.downloads?.download!=='function')
      throw fail('E_CHROME_UNSUPPORTED','Chrome downloads.download unavailable');
    await guard('browser.downloads.download',context,origin);
    const ref=newRef(),epoch=generation;
    let downloadId;
    try{downloadId=await api.downloads.download({url:input.url,
      ...(filename?{filename}:{}),saveAs:input.saveAs??true,conflictAction:'uniquify'})}
    catch{throw fail('E_OUTCOME_UNKNOWN','Download outcome unknown; inspect Chrome downloads before retrying')}
    if(!Number.isSafeInteger(downloadId)||downloadId<0)
      throw fail('E_OUTCOME_UNKNOWN','Chrome did not confirm the download; do not retry blindly');
    try{await guard('browser.downloads.download',context,origin)}
    catch{throw fail('E_OUTCOME_UNKNOWN','Download may have started before authority changed')}
    if(generation!==epoch)throw fail('E_OUTCOME_UNKNOWN','Download may have started before revocation');
    records.set(ref,{owner,origin,downloadId,generation:epoch,expiresAt:now()+REF_TTL_MS});
    return {downloadRef:ref,status:'started'};
  }
  async function getOwned(input,context){
    const row=owned(input.downloadRef,context);
    await guard('browser.downloads.getOwned',context,row.origin);
    const value=await details(row);
    await guard('browser.downloads.getOwned',context,row.origin);
    if(row.generation!==generation)throw fail('E_GRANT_REVOKED');
    return {downloadRef:input.downloadRef,...value};
  }
  async function listOwned(input={},context){
    const owner=identity(context);
    await guard('browser.downloads.listOwned',context);
    prune();
    const all=[...records].filter(([,row])=>row.owner===owner);
    const limit=input.limit??20;
    if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw fail('E_SCHEMA');
    let start=0;
    if(input.cursor!==undefined){
      if(typeof input.cursor!=='string'||!TOKEN.test(input.cursor))
        throw fail('E_SCHEMA');
      const index=all.findIndex(([ref])=>ref===input.cursor);
      if(index<0)throw fail('E_DOWNLOAD_REF_INVALID','Unknown owned pagination cursor');
      start=index+1;
    }
    const page=all.slice(start,start+limit),items=[];
    for(const [ref,row] of page){
      await guard('browser.downloads.listOwned',context,row.origin);
      const status=await details(row);
      // A per-origin grant can be revoked while downloads.search is in flight.
      // The final global capability check below is NOT an Origin check.
      await guard('browser.downloads.listOwned',context,row.origin);
      items.push({downloadRef:ref,state:status.state});
    }
    await guard('browser.downloads.listOwned',context);
    if(page.some(([,row])=>row.generation!==generation))
      throw fail('E_GRANT_REVOKED');
    return {items,...(start+page.length<all.length?{nextCursor:page.at(-1)[0]}:{})};
  }
  async function cancelOwned(input,context){
    const row=owned(input.downloadRef,context);
    await guard('browser.downloads.cancelOwned',context,row.origin);
    const before=await details(row);
    // chrome.downloads.search is asynchronous: the site permission, installation
    // and download ownership can disappear while Chrome resolves that request.
    // Recheck immediately before ANY native cancellation side effect, even if
    // the same tool was later re-enabled with a new generation.
    await guard('browser.downloads.cancelOwned',context,row.origin);
    if(row.generation!==generation||records.get(input.downloadRef)!==row)
      throw fail('E_GRANT_REVOKED','Download reference revoked during Chrome lookup');
    if(before.state!=='in_progress'){
      await guard('browser.downloads.cancelOwned',context,row.origin);
      return {cancelled:false};
    }
    if(typeof api?.downloads?.cancel!=='function')
      throw fail('E_CHROME_UNSUPPORTED','Chrome downloads.cancel unavailable');
    const epoch=generation;
    try{await api.downloads.cancel(row.downloadId)}
    catch{throw fail('E_OUTCOME_UNKNOWN','Download cancellation outcome unknown; do not retry blindly')}
    try{await guard('browser.downloads.cancelOwned',context,row.origin)}
    catch{throw fail('E_OUTCOME_UNKNOWN','Permission changed after download cancellation')}
    if(generation!==epoch)throw fail('E_OUTCOME_UNKNOWN','Authorization revoked after cancellation');
    return {cancelled:true};
  }
  const revokeAll=()=>{generation++;records.clear()};
  return Object.freeze({download,getOwned,listOwned,cancelOwned,revokeAll,
    diagnostics:()=>({count:records.size,generation})});
}
