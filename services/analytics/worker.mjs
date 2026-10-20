// Cloudflare Worker + D1: durable, deduplicated, content-free product events.
import {ANALYTICS_VERSION,ANALYTICS_MAX_BYTES,validateAnalyticsBatch} from '../../src/analytics/contract.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff'}
});
async function boundedJSON(request){
  const announced=Number(request.headers.get('content-length'));
  if(Number.isFinite(announced)&&announced>ANALYTICS_MAX_BYTES)
    throw Object.assign(Error('too large'),{status:413});
  const reader=request.body?.getReader();
  if(!reader)throw Object.assign(Error('missing body'),{status:400});
  const chunks=[];let bytes=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>ANALYTICS_MAX_BYTES)throw Object.assign(Error('too large'),{status:413});
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});}
  const all=new Uint8Array(bytes);let offset=0;
  for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}
  catch{throw Object.assign(Error('invalid JSON'),{status:400});}
}
const isReady=env=>{
  try{
    const url=new URL(env.POSTHOG_HOST);
    return Boolean(env.DB?.prepare&&env.DB?.batch&&
      typeof env.POSTHOG_PROJECT_TOKEN==='string'&&env.POSTHOG_PROJECT_TOKEN.length>8&&
      typeof env.RATE_SALT==='string'&&env.RATE_SALT.length>=24&&
      url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash);
  }catch{return false;}
};
async function hash(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function admitRate(request,env,quantity,time){
  // The key is a short-lived salted hash of Cloudflare-provided IP; IP is never stored.
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  const key=Math.floor(time/60000)+':'+await hash(env.RATE_SALT+':'+ip);
  const result=await env.DB.prepare(
    'INSERT INTO analytics_rate (bucket,used,expires_at) VALUES (?1,?2,?3) '+
    'ON CONFLICT(bucket) DO UPDATE SET used=used+excluded.used '+
    'WHERE analytics_rate.used+excluded.used<=80'
  ).bind(key,quantity,time+10*60*1000).run();
  return result?.meta?.changes===1;
}
async function deliver(env,{fetcher,now}){
  const time=now();
  const result=await env.DB.prepare(
    "SELECT event_id,event_json,attempts FROM analytics_events WHERE (status='pending' AND next_attempt_at<=?1) "+
    "OR (status='sending' AND lease_until<=?1) ORDER BY received_at LIMIT 20"
  ).bind(time).all();
  const leaseUntil=time+120000;
  const rows=[];
  for(const row of result?.results||[]){
    // D1 conditional UPDATE is the single-claim authority across concurrent Worker isolates.
    const claimed=await env.DB.prepare(
      "UPDATE analytics_events SET status='sending',lease_until=?1 WHERE event_id=?2 AND "+
      "((status='pending' AND next_attempt_at<=?3) OR (status='sending' AND lease_until<=?3))"
    ).bind(leaseUntil,row.event_id,time).run();
    if(claimed?.meta?.changes===1)rows.push(row);
  }
  if(!rows.length)return 0;
  const batch=rows.map(row=>JSON.parse(row.event_json));
  let success=false;
  try{
    const upstream=new URL('/batch/',env.POSTHOG_HOST).href;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetcher(upstream,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({token:env.POSTHOG_PROJECT_TOKEN,batch:batch.map(row=>({
          event:row.event,uuid:row.eventId,distinct_id:row.installId,timestamp:row.timestamp,
          properties:{distinct_id:row.installId,tool_id:row.toolId,source:row.source,channel:row.channel,
            ...(row.reason?{reason:row.reason}:{}),
            ...(row.event==='app.inventory'?{installed_tools:row.installedTools}:{}),
            $process_person_profile:false,$ip:null}
        }))}),redirect:'error',signal:controller.signal});
      success=response.ok;
    }finally{clearTimeout(timeout);}
  }catch{/* Failed upstream is never marked delivered. */}
  if(success){
    await env.DB.batch(rows.map(row=>env.DB.prepare(
      "UPDATE analytics_events SET status='sent',event_json='',sent_at=?1,lease_until=0 "+
      "WHERE event_id=?2 AND status='sending' AND lease_until=?3"
    ).bind(time,row.event_id,leaseUntil)));
    return rows.length;
  }
  await env.DB.batch(rows.map(row=>{
    const attempts=row.attempts+1;
    const delay=Math.min(6*60*60*1000,30000*Math.pow(2,Math.min(attempts-1,9)));
    return env.DB.prepare(
      "UPDATE analytics_events SET status='pending',attempts=?1,next_attempt_at=?2,lease_until=0 "+
      "WHERE event_id=?3 AND status='sending' AND lease_until=?4"
    ).bind(attempts,time+delay,row.event_id,leaseUntil);
  }));
  return 0;
}
export function createAnalyticsGateway({now=()=>Date.now(),fetcher=globalThis.fetch}={}){
  return {
    async fetch(request,env,ctx){
      const path=new URL(request.url).pathname;
      if(request.method==='GET'&&path==='/health')
        return json({ok:isReady(env),version:ANALYTICS_VERSION},isReady(env)?200:503);
      if(request.method!=='POST'||path!=='/v1/events')return json({ok:false,code:'NOT_FOUND'},404);
      if(!isReady(env))return json({ok:false,code:'NOT_CONFIGURED'},503);
      if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))
        return json({ok:false,code:'CONTENT_TYPE'},415);
      let events;
      try{events=validateAnalyticsBatch(await boundedJSON(request),{now:now()});}
      catch(error){return json({ok:false,code:error.status===413?'TOO_LARGE':'SCHEMA'},error.status===413?413:400);}
      try{
        const time=now();
        if(!await admitRate(request,env,events.length,time))
          return json({ok:false,code:'RATE_LIMIT'},429);
        const results=await env.DB.batch(events.map(event=>env.DB.prepare(
          'INSERT OR IGNORE INTO analytics_events '+
          '(event_id,install_id,event_name,tool_id,occurred_at,received_at,event_json) '+
          'VALUES (?1,?2,?3,?4,?5,?6,?7)'
        ).bind(event.eventId,event.installId,event.event,event.toolId,event.timestamp,time,JSON.stringify(event))));
        const accepted=[],duplicates=[];
        results.forEach((row,i)=>(row?.meta?.changes===1?accepted:duplicates).push(events[i].eventId));
        // D1 durable acceptance is the ACK boundary; PostHog may lag.
        if(ctx?.waitUntil)ctx.waitUntil(deliver(env,{now,fetcher}).catch(()=>{}));
        return json({ok:true,accepted,duplicates},202);
      }catch{return json({ok:false,code:'STORAGE_UNAVAILABLE'},503);}
    },
    async scheduled(_controller,env,ctx){
      if(!isReady(env))return;
      const run=async()=>{
        for(let i=0;i<4;i++)if(!await deliver(env,{now,fetcher}))break;
        const time=now();
        await env.DB.batch([
          env.DB.prepare("DELETE FROM analytics_events WHERE status!='sent' AND received_at<?1").bind(time-7*86400000),
          env.DB.prepare("DELETE FROM analytics_events WHERE status='sent' AND received_at<?1").bind(time-35*86400000),
          env.DB.prepare('DELETE FROM analytics_rate WHERE expires_at<?1').bind(time)
        ]);
      };
      if(ctx?.waitUntil)ctx.waitUntil(run());else await run();
    }
  };
}
export default createAnalyticsGateway();
