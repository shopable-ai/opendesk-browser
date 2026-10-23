import {ANALYTICS_ALARM,ANALYTICS_STATE_KEY,ANALYTICS_MAX_BATCH,
  ANALYTICS_MAX_AGE_MS,ANALYTICS_VERSION,ANALYTICS_DISCLOSURE_VERSION,validateAnalyticsEvent} from './contract.js';

const MAX_QUEUED=250;
const INVENTORY_REFRESH_MS=24*60*60*1000;
const capped=(a,b)=>Math.min(Number.MAX_SAFE_INTEGER,a+b);
const ATTEMPT_TIMEOUT_MS=10000;
const empty=()=>({consent:false,consentReceipt:null,installId:null,identitySalt:null,queue:[],failures:0,nextAttemptAt:0,
  inventorySignature:null,inventoryReportedAt:0,inventoryCoverageVersion:0,coverage:{overflow:0,expired:0},openedContexts:[],
  inventoryTypesSignature:null,inventoryTypesReportedAt:0,autoDaily:[],authorityGap:false,manualResultRunIds:[]});
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
    // A previous unversioned consent is not a transferable grant for today's disclosure.
    // The old outbox and install identity cannot be replayed without fresh opt-in.
    if(raw?.consent===true&&(
      raw.consentReceipt?.disclosureVersion!==ANALYTICS_DISCLOSURE_VERSION||
      !Number.isSafeInteger(raw.consentReceipt?.acceptedAt)||
      raw.consentReceipt.acceptedAt<=0||
      raw.consentReceipt.acceptedAt>now()+5*60*1000))
      return {...empty(),needsReview:true};
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.consent!=='boolean'||
      !Array.isArray(raw.queue)||raw.queue.length>MAX_QUEUED||
      !Number.isSafeInteger(raw.failures)||raw.failures<0||
      !Number.isFinite(raw.nextAttemptAt)||
      (raw.consent&&(typeof raw.installId!=='string'||typeof raw.identitySalt!=='string'||
        !/^[a-f0-9-]{36}$/i.test(raw.identitySalt)))||
      (raw.inventorySignature!==undefined&&raw.inventorySignature!==null&&typeof raw.inventorySignature!=='string')||
      !Number.isSafeInteger(raw.inventoryReportedAt??0)||(raw.inventoryReportedAt??0)<0||
      !Number.isSafeInteger(raw.inventoryCoverageVersion??0)||(raw.inventoryCoverageVersion??0)<0||
      !Number.isSafeInteger(raw.coverage?.overflow??0)||(raw.coverage?.overflow??0)<0||
      !Number.isSafeInteger(raw.coverage?.expired??0)||(raw.coverage?.expired??0)<0||
      (raw.inventoryTypesSignature!==undefined&&raw.inventoryTypesSignature!==null&&
        typeof raw.inventoryTypesSignature!=='string')||
      !Number.isSafeInteger(raw.inventoryTypesReportedAt??0)||(raw.inventoryTypesReportedAt??0)<0||
      !Array.isArray(raw.autoDaily??[])||(raw.autoDaily??[]).length>1024||
      (raw.autoDaily??[]).some(row=>typeof row?.key!=='string'||row.key.length>200||
        !Number.isSafeInteger(row.total)||row.total<1||
        !Number.isSafeInteger(row.version)||row.version<1)||
      typeof (raw.authorityGap??false)!=='boolean'||
      !Array.isArray(raw.manualResultRunIds??[])||(raw.manualResultRunIds??[]).length>1024||
      (raw.manualResultRunIds??[]).some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))||
      !Array.isArray(raw.openedContexts??[])||(raw.openedContexts??[]).length>96||
      (raw.openedContexts??[]).some(id=>typeof id!=='string'||id.length>64))return empty();
    return {...raw,inventorySignature:raw.inventorySignature??null,
      inventoryReportedAt:raw.inventoryReportedAt??0,
      inventoryCoverageVersion:raw.inventoryCoverageVersion??0,
      coverage:{overflow:raw.coverage?.overflow??0,expired:raw.coverage?.expired??0},
      openedContexts:raw.openedContexts??[],
      inventoryTypesSignature:raw.inventoryTypesSignature??null,
      inventoryTypesReportedAt:raw.inventoryTypesReportedAt??0,
      autoDaily:raw.autoDaily??[],authorityGap:raw.authorityGap??false,manualResultRunIds:raw.manualResultRunIds??[]};
  };
  const persist=state=>api.storage.local.set({[ANALYTICS_STATE_KEY]:state});
  const prune=(queue,time)=>queue.filter(item=>{
    try{validateAnalyticsEvent(item,{now:time});return true;}catch{return false;}
  });
  const hashedToolId=async(state,type,identity)=>{
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(state.identitySalt+':'+type+':'+identity)));
    return 'anon-'+[...digest].slice(0,12).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  };
  const status=()=>run(async()=>{
    const state=await read();
    return {configured,consent:configured&&!revoked&&state.consent,
      queued:state.consent?state.queue.length:0,needsReview:state.needsReview===true,
      coverageGap:state.consent&&(state.coverage.overflow>0||state.coverage.expired>0||state.authorityGap),
      coverage:state.consent?state.coverage:{overflow:0,expired:0}};
  });
  async function setConsent(enabled,{disclosureVersion}={}){
    if(typeof enabled!=='boolean')throw Object.assign(new Error('Invalid consent'),{code:'E_ANALYTICS_CONSENT'});
    if(enabled&&!configured)throw Object.assign(new Error('No HTTPS analytics endpoint configured'),{code:'E_ANALYTICS_UNCONFIGURED'});
    if(enabled&&disclosureVersion!==ANALYTICS_DISCLOSURE_VERSION)
      throw Object.assign(new Error('Current disclosure must be confirmed'),{code:'E_ANALYTICS_DISCLOSURE'});
    if(!enabled){revoked=true;revision++;activeAbort?.abort();}
    return run(async()=>{
      if(enabled){
        const current=await read();
        const state=current.consent?current:{...empty(),consent:true,installId:newId(),identitySalt:newId(),consentReceipt:{disclosureVersion,acceptedAt:now()}};
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
  const statusSnapshot=consent=>({configured,consent,queued:0,needsReview:false});
  function record({event,toolId,source,channel,reason,installedTools,contextId,inventoryTypes,
    readState,projectionGap,inventoryItems,inventoryOverflow,toolType,runStatus,manualRunId},{authorize}={}){
    if(revoked||!configured)return Promise.resolve({recorded:false});
    const generation=revision;
    return run(async()=>{
      if(revoked||generation!==revision)return {recorded:false};
      let state=await read();
      if(revoked||generation!==revision||!state.consent)return {recorded:false};
      if(authorize){
        try{if(await authorize()!==true)return {recorded:false};}
        catch{return {recorded:false};}
        // Consent can be revoked while a queued scope probe is in flight.
        const fresh=await read();
        if(revoked||generation!==revision||!fresh.consent||
           fresh.installId!==state.installId)return {recorded:false};
        state=fresh;
      }
      if(event==='tool.manual_result'&&
        (!/^[a-f0-9-]{36}$/i.test(manualRunId||'')||
        state.manualResultRunIds.includes(manualRunId)))return {recorded:false};
      // The context ID is Chrome-owned sender identity; never transmitted.
      if(event==='app.opened'&&
        (typeof contextId!=='string'||!(/^[a-f0-9-]{36}$/i).test(contextId)||
          state.openedContexts.includes(contextId)))return {recorded:false};
      const time=now();
      // A periodic census must account for newly expired outbox entries too.
      const retained=prune(state.queue,time);
      const currentCoverage={overflow:state.coverage.overflow,
        expired:capped(state.coverage.expired,state.queue.length-retained.length)};
      const currentVersion=capped(currentCoverage.overflow,currentCoverage.expired);
      const signature=event==='app.inventory'&&Array.isArray(installedTools)?
        installedTools.join(','):event==='app.inventory_types'?
        JSON.stringify({inventoryTypes,inventoryItems,inventoryOverflow,readState,
          projectionGap:projectionGap===true}):null;
      // Missing data immediately invalidates the prior census freshness version.
      if(event==='app.inventory'&&signature===state.inventorySignature&&
        currentVersion===state.inventoryCoverageVersion&&
        time>=state.inventoryReportedAt&&time-state.inventoryReportedAt<INVENTORY_REFRESH_MS){
        if(retained.length!==state.queue.length)
          await persist({...state,queue:retained,coverage:currentCoverage});
        return {recorded:false};
      }
      if(event==='app.inventory_types'&&signature===state.inventoryTypesSignature&&
        time>=state.inventoryTypesReportedAt&&time-state.inventoryTypesReportedAt<INVENTORY_REFRESH_MS&&
        projectionGap!==true){
        if(retained.length!==state.queue.length)
          await persist({...state,queue:retained,coverage:currentCoverage});
        return {recorded:false};
      }
      const entry=validateAnalyticsEvent({
        eventId:newId(),installId:state.installId,event,toolId,
        source,channel,timestamp:new Date(time).toISOString(),
        ...(reason?{reason}:{}),
        ...(['tool.manual_attempt','tool.manual_result'].includes(event)?
          {toolType,...(runStatus?{runStatus}:{})}:{}),
        ...(event==='app.inventory_types'?{readState, ...(inventoryTypes?{inventoryTypes}:{}),
          ...(inventoryItems?{inventoryItems}:{}),
          ...(inventoryOverflow!==undefined?{inventoryOverflow}:{}),
          ...(projectionGap!==undefined?{projectionGap}: {})}:{}),
        ...(event==='app.inventory'?{installedTools,
          coverage:{...currentCoverage,version:currentVersion}}:{})
      },{now:time});
      // A new census supersedes unsent old censuses. Transitions remain separate.
      const queue=retained.filter(row=>
        (event!=='app.inventory'||row.event!=='app.inventory')&&
        (event!=='app.inventory_types'||row.event!=='app.inventory_types'));
      // A bounded queue is intentionally lossy under prolonged disconnection.
      // Never block or compromise a tool's primary operation when full.
      queue.push(entry);
      const bounded=queue.slice(-MAX_QUEUED);
      const latestCensus=queue.findLast(row=>row.event==='app.inventory');
      // Retain the latest queued census if lower-priority usage events fill the outbox.
      if(latestCensus&&!bounded.some(row=>row.eventId===latestCensus.eventId)){
        bounded.shift();bounded.unshift(latestCensus);
      }
      const coverage={overflow:capped(currentCoverage.overflow,Math.max(0,queue.length-MAX_QUEUED)),
        expired:currentCoverage.expired};
      const coverageVersion=capped(coverage.overflow,coverage.expired);
      // Include losses caused by admitting this census itself.
      if(event==='app.inventory')entry.coverage={...coverage,version:coverageVersion};
      await persist({...state,queue:bounded,coverage,
        ...(event==='app.inventory'?{inventorySignature:signature,inventoryReportedAt:time,
          inventoryCoverageVersion:coverageVersion}:{}),
        ...(event==='app.inventory_types'?{inventoryTypesSignature:signature,
          inventoryTypesReportedAt:time,authorityGap:state.authorityGap||projectionGap===true}:{}),
        ...(event==='app.opened'?{openedContexts:[...state.openedContexts,contextId].slice(-96)}:{}),
        ...(event==='tool.manual_result'?{manualResultRunIds:[...state.manualResultRunIds,manualRunId].slice(-1024)}:{})});
      return {recorded:true};
    });
  }
  // Called only by the trusted SW Host after validating first-party user action
  // or durable Run/Result authority. The raw task ID is never sent to Worker.
  async function recordManualTask({event,identity,runId,runStatus}={}){
    if(revoked||!configured||typeof identity!=='string'||!identity||
      identity.length>256||!['tool.manual_attempt','tool.manual_result'].includes(event))
      return {recorded:false};
    const state=await read();
    if(!state.consent||revoked)return {recorded:false};
    const toolId=await hashedToolId(state,'task',identity);
    return record({event,toolId,source:'host',channel:'extension',toolType:'task',
      ...(event==='tool.manual_result'?{manualRunId:runId,runStatus}:{})},{
      authorize:async()=>{
        const current=await read();
        return current.consent&&current.installId===state.installId&&
          current.identitySalt===state.identitySalt;
      }});
  }
  // These are CUMULATIVE observations of durable Authority, not client-reported
  // invocations. Only a larger count advances a key; IDB history loss yields
  // coverage uncertainty instead of re-counting an already seen execution.
  function recordAutoDaily(row,projectionGap=false,expectedInstallId=null){
    if(revoked||!configured)return Promise.resolve({recorded:false});
    const generation=revision;
    return run(async()=>{
      if(revoked||generation!==revision)return {recorded:false};
      const state=await read();
      if(!state.consent||revoked||generation!==revision||
        expectedInstallId!==null&&state.installId!==expectedInstallId)return {recorded:false};
      if(!row||typeof row.identity!=='string'||row.identity.length>256||
         !['page','task','app_service'].includes(row.type)||
         !['attempted','completed','failed','outcome_unknown'].includes(row.metricType)||
         !row.sourceTotals||typeof row.sourceTotals!=='object'||
         !/^\d{4}-\d\d-\d\d$/.test(row.day||'')||
         !Number.isSafeInteger(row.total)||row.total<1)return {recorded:false};
      const time=now(),day=Date.parse(row.day+'T00:00:00Z');
      if(!Number.isFinite(day)||day<time-ANALYTICS_MAX_AGE_MS||day>Math.floor(time/86400000)*86400000){
        await persist({...state,authorityGap:true});
        return {recorded:false,gap:true};
      }
      // Install-specific digest makes third-party identifiers unlinkable across
      // installations; never send a raw user-controlled program/task ID.
      const toolId=await hashedToolId(state,row.type,row.identity);
      if(revoked||generation!==revision)return {recorded:false};
      const key=[row.type,toolId,row.day,row.metricType].join('|');
      const previous=state.autoDaily.find(entry=>entry.key===key);
      if(previous&&row.total<=previous.total){
        if(row.total<previous.total&&!state.authorityGap)
          await persist({...state,authorityGap:true});
        return {recorded:false,gap:row.total<previous.total};
      }
      const retainedKeys=state.autoDaily.filter(item=>{
        const oldDay=item.key.split('|')[2];
        return /^\d{4}-\d\d-\d\d$/.test(oldDay||'')&&
          Date.parse(oldDay+'T00:00:00Z')>=time-8*86400000;
      });
      if(!previous&&retainedKeys.length>=1024){
        await persist({...state,authorityGap:true});
        return {recorded:false,gap:true};
      }
      const version=(previous?.version??0)+1;
      const retained=prune(state.queue,time);
      const expired=state.queue.length-retained.length;
      const entry=validateAnalyticsEvent({eventId:newId(),installId:state.installId,
        event:'tool.auto_daily',toolId,source:'host',channel:'extension',
        timestamp:new Date(time).toISOString(),toolType:row.type,utcDate:row.day,
        metricType:row.metricType,total:row.total,version,sourceTotals:row.sourceTotals,
        ...(projectionGap?{projectionGap:true}:{})},{now:time});
      // One pending cumulative snapshot per stable key, even after 100 executions.
      const queue=retained.filter(event=>!(event.event==='tool.auto_daily'&&
        event.toolType===row.type&&event.toolId===toolId&&event.utcDate===row.day&&
        event.metricType===row.metricType));
      queue.push(entry);
      const bounded=queue.slice(-MAX_QUEUED);
      const coverage={overflow:capped(state.coverage.overflow,Math.max(0,queue.length-MAX_QUEUED)),
        expired:capped(state.coverage.expired,expired)};
      const autoDaily=previous?retainedKeys.map(item=>item.key===key?
        {key,total:row.total,version}:item):
        [...retainedKeys,{key,total:row.total,version}];
      await persist({...state,queue:bounded,coverage,autoDaily,
        authorityGap:state.authorityGap||projectionGap===true});
      return {recorded:true,key,total:row.total,version};
    });
  }
  // Crucial: check consent BEFORE reading another authority; re-check in
  // record()/recordAutoDaily() after the asynchronous read and after revocation.
  async function reportAuthority(load){
    if(!configured||revoked||typeof load!=='function')return {recorded:false};
    if(!(await status()).consent||revoked)return {recorded:false};
    const grant=await run(async()=>{
      const state=await read();
      return state.consent&&state.consentReceipt?.disclosureVersion===ANALYTICS_DISCLOSURE_VERSION?
        {since:state.consentReceipt.acceptedAt,installId:state.installId,salt:state.identitySalt}:null;
    });
    if(!grant||revoked)return {recorded:false};
    let projection;
    try{projection=await load({since:grant.since});}
    catch{
      await record({event:'app.inventory_types',toolId:'opendesk',source:'host',
        channel:'extension',readState:'failed'});
      return {recorded:false,readState:'failed'};
    }
    if(revoked)return {recorded:false};
    // Bound each transmitted census to 96 anonymous per-install identities.
    // Overflow is explicit coverage loss, not a false "zero installed" claim.
    const installed=(projection.inventoryTypes?.sidebar?.installed??0)+
      (projection.inventoryTypes?.page?.installed??0)+
      (projection.inventoryTypes?.task?.installed??0);
    const unique=new Set();
    const selected=(projection.inventoryItems||[]).filter(row=>{
      if(!['sidebar','page','task'].includes(row?.type)||typeof row.identity!=='string'||
        row.identity.length>256||!['enabled','disabled','blocked','unknown'].includes(row.status))
        return false;
      const key=row.type+':'+row.identity;
      if(unique.has(key))return false;
      unique.add(key);return true;
    }).sort((a,b)=>(a.type+':'+a.identity).localeCompare(b.type+':'+b.identity)).slice(0,96);
    const inventoryItems=await Promise.all(selected.map(async item=>({
      type:item.type,toolId:item.type==='sidebar'?item.identity:
        await hashedToolId({identitySalt:grant.salt},item.type,item.identity),status:item.status
    })));
    inventoryItems.sort((a,b)=>(a.type+':'+a.toolId).localeCompare(b.type+':'+b.toolId));
    const inventoryOverflow=Math.max(0,installed-inventoryItems.length);
    const hasGap=projection.projectionGap===true||inventoryOverflow>0;
    const inventory=await record({event:'app.inventory_types',toolId:'opendesk',
      source:'host',channel:'extension',readState:'fresh',
      inventoryTypes:projection.inventoryTypes,inventoryItems,inventoryOverflow,
      projectionGap:hasGap},{authorize:async()=>{
        const state=await read();
        return state.consent&&state.installId===grant.installId&&
          state.identitySalt===grant.salt;
      }});
    let changed=0;
    for(const row of projection.daily||[]){
      if((await recordAutoDaily(row,hasGap,grant.installId)).recorded)changed++;
    }
    return {recorded:inventory.recorded||changed>0,autoSnapshots:changed,readState:'fresh'};
  }
  async function flush(){
    if(revoked||!configured)return {sent:0};
    return run(async()=>{
      if(revoked)return {sent:0};
      const state=await read();
      if(!state.consent)return {sent:0};
      const time=now(),queue=prune(state.queue,time);
      if(queue.length!==state.queue.length)await persist({...state,queue,
        coverage:{...state.coverage,expired:capped(state.coverage.expired,state.queue.length-queue.length)}});
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
  return Object.freeze({status,setConsent,record,recordManualTask,recordAutoDaily,reportAuthority,flush,ensureWake,configured});
}
