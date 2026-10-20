import {ANALYTICS_ALARM,ANALYTICS_STATE_KEY,ANALYTICS_MAX_BATCH,
  ANALYTICS_MAX_AGE_MS,ANALYTICS_VERSION,validateAnalyticsEvent} from './contract.js';

const MAX_QUEUED=250;
const ATTEMPT_TIMEOUT_MS=10000;
const empty=()=>({consent:false,installId:null,queue:[],failures:0,nextAttemptAt:0});
export function validAnalyticsEndpoint(value,{allowLoopback=false}={}){
  try{
    const url=new URL(value);
    return !url.username&&!url.password&&!url.hash&&!url.search&&(
      url.protocol==='https:'||(allowLoopback&&url.protocol==='http:'&&
      ['localhost','127.0.0.1','[::1]'].includes(url.hostname)));
  }catch{return false;}
}
export function createAnalyticsCollector({api,endpoint='',fetcher=globalThis.fetch,
  now=()=>Date.now(),newId=()=>crypto.randomUUID(),allowLoopback=false}={}){
  const configured=validAnalyticsEndpoint(endpoint,{allowLoopback});
  let serial=Promise.resolve(),revoked=false,activeAbort=null,revision=0;
  const run=fn=>{
    const next=serial.then(fn,fn);
    serial=next.catch(()=>{});
    return next;
  };
  const read=async()=>{
    const raw=(await api.storage.local.get(ANALYTICS_STATE_KEY))[ANALYTICS_STATE_KEY];
    if(raw===undefined)return empty();
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.consent!=='boolean'||
      !Array.isArray(raw.queue)||raw.queue.length>MAX_QUEUED||
      !Number.isSafeInteger(raw.failures)||raw.failures<0||
      !Number.isFinite(raw.nextAttemptAt)||
      (raw.consent&&typeof raw.installId!=='string'))return empty();
    return raw;
  };
  const persist=state=>api.storage.local.set({[ANALYTICS_STATE_KEY]:state});
  const prune=(queue,time)=>queue.filter(item=>{
    try{validateAnalyticsEvent(item,{now:time});return true;}catch{return false;}
  });
  const status=()=>run(async()=>{
    const state=await read();
    return {configured,consent:configured&&!revoked&&state.consent,queued:state.consent?state.queue.length:0};
  });
  async function setConsent(enabled){
    if(typeof enabled!=='boolean')throw Object.assign(new Error('Invalid consent'),{code:'E_ANALYTICS_CONSENT'});
    if(enabled&&!configured)throw Object.assign(new Error('No HTTPS analytics endpoint configured'),{code:'E_ANALYTICS_UNCONFIGURED'});
    if(!enabled){revoked=true;revision++;activeAbort?.abort();}
    return run(async()=>{
      if(enabled){
        const current=await read();
        const state=current.consent?current:{...empty(),consent:true,installId:newId()};
        await persist(state);
        revoked=false;
        try{await api.alarms?.create?.(ANALYTICS_ALARM,{periodInMinutes:5});}catch{/* startup also reconciles */}
      }else{
        await persist(empty());
        try{await api.alarms?.clear?.(ANALYTICS_ALARM);}catch{/* storage is authoritative */}
      }
      return statusSnapshot(enabled);
    });
  }
  const statusSnapshot=consent=>({configured,consent,queued:0});
  function record({event,toolId,source,channel,reason}){
    if(revoked||!configured)return Promise.resolve({recorded:false});
    return run(async()=>{
      if(revoked)return {recorded:false};
      const state=await read();
      if(!state.consent)return {recorded:false};
      const time=now(),entry=validateAnalyticsEvent({
        eventId:newId(),installId:state.installId,event,toolId,
        source,channel,timestamp:new Date(time).toISOString(),
        ...(reason?{reason}:{})
      },{now:time});
      const queue=prune(state.queue,time);
      // A bounded queue is intentionally lossy under prolonged disconnection.
      // Never block or compromise a tool's primary operation when full.
      queue.push(entry);
      await persist({...state,queue:queue.slice(-MAX_QUEUED)});
      return {recorded:true};
    });
  }
  async function flush(){
    if(revoked||!configured)return {sent:0};
    return run(async()=>{
      if(revoked)return {sent:0};
      const state=await read();
      if(!state.consent)return {sent:0};
      const time=now(),queue=prune(state.queue,time);
      if(queue.length!==state.queue.length)await persist({...state,queue});
      if(!queue.length||state.nextAttemptAt>time)return {sent:0};
      const batch=queue.slice(0,ANALYTICS_MAX_BATCH),idSet=new Set(batch.map(item=>item.eventId));
      const controller=new AbortController(),generation=revision;
      activeAbort=controller;
      const timeout=setTimeout(()=>controller.abort(),ATTEMPT_TIMEOUT_MS);
      try{
        const response=await fetcher(endpoint,{method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({version:ANALYTICS_VERSION,events:batch}),
          signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
        if(!response.ok)throw new Error('Analytics transport '+response.status);
        const ack=await response.json();
        if(ack?.ok!==true||!Array.isArray(ack.accepted)||!Array.isArray(ack.duplicates)||
          ![...ack.accepted,...ack.duplicates].every(id=>typeof id==='string'&&idSet.has(id))||
          new Set([...ack.accepted,...ack.duplicates]).size!==ack.accepted.length+ack.duplicates.length)
          throw new Error('Invalid analytics receipt');
        if(revoked||generation!==revision)return {sent:0};
        const confirmed=new Set([...ack.accepted,...ack.duplicates]);
        const fresh=await read();
        if(!fresh.consent||fresh.installId!==state.installId)return {sent:0};
        await persist({...fresh,queue:fresh.queue.filter(item=>!confirmed.has(item.eventId)),
          failures:0,nextAttemptAt:0});
        return {sent:confirmed.size};
      }catch(error){
        if(!revoked&&generation===revision){
          const fresh=await read();
          if(fresh.consent&&fresh.installId===state.installId){
            const failures=Math.min(fresh.failures+1,12);
            const delay=Math.min(6*60*60*1000,30000*Math.pow(2,Math.min(failures-1,9)));
            await persist({...fresh,failures,nextAttemptAt:now()+delay});
          }
        }
        return {sent:0,error:'E_ANALYTICS_TRANSPORT'};
      }finally{
        clearTimeout(timeout);
        if(activeAbort===controller)activeAbort=null;
      }
    });
  }
  const ensureWake=async()=>{
    if(!configured||revoked)return;
    const state=await read();
    if(!state.consent)return;
    await api.alarms?.create?.(ANALYTICS_ALARM,{periodInMinutes:5});
    void flush().catch(()=>{});
  };
  return Object.freeze({status,setConsent,record,flush,ensureWake,configured});
}
