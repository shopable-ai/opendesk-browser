// Bounded, metadata-only HTTP observation for an owned installed-tool tab.
// No headers, cookies, query strings, request/response bodies or raw Chrome tab IDs
// are exposed. session storage survives an MV3 Worker restart; a restarted active
// session is reported as INTERRUPTED with an explicit observation gap, never resumed.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
export const BROWSER_OBSERVATION_STORE='opendesk.browser.network-observations.v1';
const REF=/^[A-Za-z0-9_-]{16,160}$/,MAX_SESSIONS=4,MAX_EVENTS=500;
const MAX_BYTES=524288,MAX_DURATION=30000,RETAIN_MS=600000;
const encoded=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const owner=ctx=>{
 if(!ctx||typeof ctx.toolId!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(ctx.toolId)||
    typeof ctx.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(ctx.packageHash)||
    typeof ctx.installEpoch!=='string'||!ctx.installEpoch)
  throw fail('E_OWNER','Verified installed tool identity required');
 return ctx.toolId+':'+ctx.packageHash+':'+ctx.installEpoch;
};
export function createBrowserNetworkObserver({api=globalThis.chrome,clock=Date,
 createRef=()=>crypto.randomUUID()}={}){
 const sessions=new Map();
 let writes=Promise.resolve();
 const now=()=>clock.now();
 const snapshot=()=>Object.fromEntries([...sessions].map(([id,row])=>[id,{
   owner:row.owner,tabId:row.tabId,documentId:row.documentId,origin:row.origin,
   state:row.state,startedAt:row.startedAt,expiresAt:row.expiresAt,
   stoppedAt:row.stoppedAt,observedCount:row.observedCount,
   droppedCount:row.droppedCount,gapCount:row.gapCount,nextSeq:row.nextSeq,
   events:row.events
 }]));
 function persist(){
  // Always capture the immutable snapshot before queuing an async Chrome write.
  const data=snapshot();
  writes=writes.catch(()=>{}).then(()=>api.storage.session.set({[BROWSER_OBSERVATION_STORE]:data}));
  return writes;
 }
 const changed=()=>{void persist().catch(()=>{})};
 const stopRow=(row,state='stopped')=>{
  if(row.state!=='running')return;
  row.state=state;row.stoppedAt=now();changed();
 };
 function ensureTime(row){
  if(row.state==='running'&&now()>=row.expiresAt)stopRow(row);
 }
 function push(row,event){
  if(row.state!=='running')return;
  row.observedCount++;row.nextSeq++;
  const value={seq:row.nextSeq,...event};
  row.events.push(value);
  while(row.events.length>row.maxEvents||encoded(row.events)>row.maxBufferedBytes){
   row.events.shift();row.droppedCount++;
  }
  changed();
 }
 function capture(details,kind){
  if(!Number.isSafeInteger(details?.tabId)||typeof details?.url!=='string')return;
  let origin;try{origin=new URL(details.url).origin}catch{return}
  const timestamp=Number.isFinite(details.timeStamp)?Math.max(0,Math.round(details.timeStamp)):now();
  for(const row of sessions.values()){
   ensureTime(row);
   if(row.state!=='running'||row.tabId!==details.tabId||row.origin!==origin)continue;
   const method=typeof details.method==='string'&&/^[A-Z]{1,16}$/.test(details.method)?details.method:'OTHER';
   const resourceType=typeof details.type==='string'&&/^[a-z_]{1,24}$/.test(details.type)?details.type:'other';
   const event={kind,timestamp,origin,method,resourceType};
   if(kind==='completed'&&Number.isInteger(details.statusCode)&&details.statusCode>=100&&details.statusCode<=599)
    event.statusCode=details.statusCode;
   if(kind==='failed'&&typeof details.error==='string'&&/^net::ERR_[A-Z_]{1,45}$/.test(details.error))
    event.error=details.error;
   push(row,event);
  }
 }
 // Register native listeners during the fixed service-worker module startup.
 // Chrome's webRequest + origin permissions are independently checked on start.
 const filter={urls:['http://*/*','https://*/*']};
 api?.webRequest?.onBeforeRequest?.addListener?.(details=>capture(details,'request'),filter);
 api?.webRequest?.onCompleted?.addListener?.(details=>capture(details,'completed'),filter);
 api?.webRequest?.onErrorOccurred?.addListener?.(details=>capture(details,'failed'),filter);
 async function load(ref,context){
  if(typeof ref!=='string'||!REF.test(ref))throw fail('E_SCHEMA','Invalid observation reference');
  let row=sessions.get(ref);
  if(!row){
   const data=(await api.storage.session.get(BROWSER_OBSERVATION_STORE))[BROWSER_OBSERVATION_STORE];
   const saved=data?.[ref];
   if(!saved)throw fail('E_OBSERVATION_UNKNOWN','Observation no longer exists');
   row={...saved,id:ref,events:Array.isArray(saved.events)?saved.events:[],
     maxEvents:MAX_EVENTS,maxBufferedBytes:MAX_BYTES};
   if(row.state==='running'){
    row.state='interrupted';row.gapCount++;row.stoppedAt=now();
    // The new Worker must not pretend it observed the missing interval.
    sessions.set(ref,row);await persist();
   }else sessions.set(ref,row);
  }
  if(row.owner!==owner(context))throw fail('E_OWNER','Observation belongs to another installed tool');
  if(now()>row.expiresAt+RETAIN_MS){
   sessions.delete(ref);await persist();throw fail('E_OBSERVATION_UNKNOWN','Observation expired');
  }
  ensureTime(row);
  return row;
 }
 async function inspect(ref,context){
  const row=await load(ref,context);
  return {origin:row.origin,tabId:row.tabId,state:row.state};
 }
 async function start(args,context,target){
  const owned=owner(context);
  if(!api?.webRequest?.onBeforeRequest?.addListener||
     !api?.webRequest?.onCompleted?.addListener||
     !api?.webRequest?.onErrorOccurred?.addListener)
   throw fail('E_CHROME_UNSUPPORTED','Chrome webRequest unavailable');
  if(!Number.isSafeInteger(target?.tabId)||!target.documentId||
     target.incognito||typeof target.url!=='string')
   throw fail('E_TARGET','Owned normal-tab document required');
  const origin=new URL(target.url).origin;
  if(args.origins?.length!==1||args.origins[0]!==origin)
   throw fail('E_SITE_GRANT_REQUIRED','Exactly the owned tab Origin is observable');
  const active=[...sessions.values()].filter(row=>{ensureTime(row);return row.state==='running'});
  if(active.length>=MAX_SESSIONS||active.some(row=>row.owner===owned&&row.tabId===target.tabId))
   throw fail('E_LIMIT','Concurrent observation budget exceeded');
  const id=createRef();
  if(typeof id!=='string'||!REF.test(id)||sessions.has(id))
   throw fail('E_CONTEXT','Secure observation reference unavailable');
  const durationMs=args.durationMs??MAX_DURATION;
  const row={id,owner:owned,tabId:target.tabId,documentId:target.documentId,origin,
   state:'running',startedAt:now(),expiresAt:now()+durationMs,stoppedAt:null,
   observedCount:0,droppedCount:0,gapCount:0,nextSeq:0,
   maxEvents:args.maxEvents??MAX_EVENTS,maxBufferedBytes:args.maxBufferedBytes??MAX_BYTES,events:[]};
  sessions.set(id,row);
  try{await persist()}catch(error){sessions.delete(id);throw fail('E_STORAGE','Observation not durably admitted')}
  return {observationId:id,operationId:id,expiresAt:row.expiresAt,status:'running'};
 }
 async function getStatus({observationId},context){
  const row=await load(observationId,context);
  return {state:row.state,observedCount:row.observedCount,droppedCount:row.droppedCount,
   gapCount:row.gapCount,expiresAt:row.expiresAt};
 }
 async function stop({observationId},context){
  const row=await load(observationId,context);
  stopRow(row);await persist();
  return {state:row.state,stoppedAt:row.stoppedAt??now()};
 }
 async function cancel({observationId},context){
  const row=await load(observationId,context),cancelRequested=row.state==='running';
  if(cancelRequested)stopRow(row,'cancelled');
  await persist();
  return {state:row.state,cancelRequested};
 }
 async function read({sessionRef,cursor='0',limit=50},context){
  const row=await load(sessionRef,context);
  const from=Number(cursor),oldest=row.events[0]?.seq??row.nextSeq+1;
  const page=row.events.filter(event=>event.seq>from).slice(0,limit);
  const next=page.at(-1)?.seq;
  return {events:page,nextCursor:next!==undefined&&next<row.nextSeq?String(next):null,
   droppedCount:row.droppedCount,gapCount:row.gapCount+(from!==0&&from<oldest-1?1:0)};
 }
 async function close({sessionRef},context){
  await load(sessionRef,context);
  sessions.delete(sessionRef);await persist();
  return {closed:true};
 }
 async function exportJson({observationId},context){
  const row=await load(observationId,context);
  if(row.state==='running')throw fail('E_OBSERVATION_ACTIVE','Stop observation before exporting');
  if(typeof api?.downloads?.download!=='function')throw fail('E_CHROME_UNSUPPORTED','Chrome downloads unavailable');
  const value={format:'opendesk.browser.http-metadata.v1',origin:row.origin,
   startedAt:row.startedAt,stoppedAt:row.stoppedAt,observedCount:row.observedCount,
   droppedCount:row.droppedCount,gapCount:row.gapCount,events:row.events};
  const bytes=new TextEncoder().encode(JSON.stringify(value,null,2));
  if(bytes.length>MAX_BYTES)throw fail('E_LIMIT','Export exceeded byte budget');
  let base64='';
  for(let offset=0;offset<bytes.length;offset+=32766)
   base64+=btoa(String.fromCharCode(...bytes.subarray(offset,offset+32766)));
  const downloadId=await api.downloads.download({
   url:'data:application/json;base64,'+base64,
   filename:'opendesk-network-observation-'+row.startedAt+'.json',saveAs:true});
  if(!Number.isSafeInteger(downloadId)||downloadId<0)
   throw fail('E_OUTCOME_UNKNOWN','Chrome did not confirm the download');
  // Keep the native download ID only in this trusted Driver. Installed tools
  // receive an opaque export receipt, never the browser-global download ID.
  return {resourceRef:createRef(),bytes:bytes.length,
   truncated:row.droppedCount>0||row.gapCount>0};
 }
 function invalidateTab(tabId){
  for(const row of sessions.values())if(row.tabId===tabId&&row.state==='running')
   stopRow(row,'interrupted');
 }
 function revokeAll(){
  for(const row of sessions.values()){
   if(row.state==='running'){row.state='revoked';row.stoppedAt=now();}
   row.events=[];row.droppedCount=row.observedCount;
  }
  changed();
 }
 return Object.freeze({start,getStatus,stop,cancel,read,close,exportJson,inspect,invalidateTab,revokeAll,
  flush:()=>writes});
}
