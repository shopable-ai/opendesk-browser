// Optional real-time acceptance. No clock overrides, fabricated records or stop command.
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {MARKET_INTENT_TTL,MARKET_INTENTS_STORE} from '../../src/marketplace/intent.js';
import {MARKET_OPERATIONS_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {assertObservedMarketConnection} from './app-market-r5-observers.mjs';

// This independent scope keeps natural idle failure from masking the real TTL contract.
export async function runMarketRealExpiry({d,websiteReview,check,mark}){
  await mark('real-30-minute-expiry-only');
  const pending=await websiteReview('markdown-workbench',d.packages.get('markdown-workbench').version);
  await d.visible(pending.review,'[data-market-action="confirm-install"]');
  assert.equal(pending.row.consumedAt,null);
  assert.equal(pending.row.expiresAt-pending.row.createdAt,MARKET_INTENT_TTL);
  const readState=async target=>({registry:await d.readStore(SIDEBAR_TOOL_STORE,target),
    operations:await d.readStore(MARKET_OPERATIONS_STORE,target)});
  const baseline=await readState(pending.review),waitStarted=performance.now();
  const record=d.evidence.r5.realExpiry={status:'IN_PROGRESS',scope:'REAL_TTL_ONLY',intent:pending.row,
    reviewURL:pending.reviewURL,startedAt:Date.now(),ttl:MARKET_INTENT_TTL,clockOverride:false,baseline};
  try{
    record.closedTargets=[];
    for(const target of [pending.page,pending.review]){
      assert.equal((await d.sendBrowser('Target.closeTarget',{targetId:target.targetId})).success,true);
      record.closedTargets.push(target.targetId);
    }
    await d.save();
    for(let minute=0;performance.now()-waitStarted<MARKET_INTENT_TTL+1000||Date.now()<=pending.row.expiresAt;){
      record.elapsedMonotonicMs=performance.now()-waitStarted;record.lastObservedWallTime=Date.now();
      const current=Math.floor(record.elapsedMonotonicMs/60000);
      if(current!==minute){minute=current;console.log('R5_NATIVE independent real TTL wait '+minute+'/30 minutes');await d.save();}
      await pause(1000);
    }
    record.elapsedMonotonicMs=performance.now()-waitStarted;record.expiryObservedAt=Date.now();
    assert(record.elapsedMonotonicMs>=MARKET_INTENT_TTL);assert(record.expiryObservedAt>pending.row.expiresAt);
    const expired=await d.openTab(pending.reviewURL);
    await d.until(()=>d.evaluate(expired,'document.body.innerText.includes("无法继续此安装请求")&&document.body.innerText.includes("过期")'),
      'original unconsumed intent expires after real 30 minutes');
    assert.equal(await d.evaluate(expired,'!!document.querySelector("[data-market-action=confirm-install]")'),false);
    const store=await d.readStore(MARKET_INTENTS_STORE,expired);
    const same=store.intents.find(row=>row.intentId===pending.row.intentId);
    assert.deepEqual(same,pending.row);
    assert.deepEqual(await readState(expired),baseline);
    record.expiredIntent=same;record.expiredSurface=await d.evaluate(expired,'({url:location.href,text:document.body.innerText})');
    assert.equal(record.expiredSurface.url,pending.reviewURL);
    await d.screenshot(expired,'r5-independent-real-30-minute-intent-expired.png');
    await d.restartChrome();assert.deepEqual(await readState(d.getHost()),baseline);
    check('real-30-minute-unconsumed-intent-expiry-rejects-review-without-install-effects',
      {intentId:same.intentId,elapsedMonotonicMs:record.elapsedMonotonicMs,expiresAt:same.expiresAt,observedAt:record.expiryObservedAt});
    d.evidence.r5.notTested=d.evidence.r5.notTested.filter(name=>name!=='real-30-minute-intent-expiry');
    record.status='PASS';await d.save();
  }catch(error){record.status='FAILED';record.failure={at:Date.now(),message:error.message};await d.save();throw error;}
}

export async function runMarketNaturalLifecycle({d,websiteReview,check,mark,idleOnly=false}){
  await mark(idleOnly?'natural-idle-only':'natural-idle-and-real-30-minute-expiry');
  const id=d.getExtensionId(),origin='chrome-extension://'+id;
  const pending=await websiteReview('markdown-workbench',d.packages.get('markdown-workbench').version);
  const websiteURL=await d.evaluate(pending.page,'location.href');
  await d.visible(pending.review,'[data-market-action="confirm-install"]');
  assert.equal(pending.row.consumedAt,null);
  assert.equal(pending.row.expiresAt-pending.row.createdAt,MARKET_INTENT_TTL);
  const readState=async target=>({registry:await d.readStore(SIDEBAR_TOOL_STORE,target),
    operations:await d.readStore(MARKET_OPERATIONS_STORE,target)});
  const baseline=await readState(pending.review);
  const record=d.evidence.r5.naturalLifecycle={status:'IN_PROGRESS',intent:pending.row,reviewURL:pending.reviewURL,
    startedAt:Date.now(),scope:idleOnly?'NATURAL_IDLE_ONLY':'NATURAL_IDLE_AND_REAL_TTL',ttl:MARKET_INTENT_TTL,versionEvents:[],contextObservations:[],closedTargets:[],
    stopCommandIssued:false,clockOverride:false,baseline};
  const waitStarted=performance.now(),controller=await d.openTab('about:blank');
  let sequence=0,reconnectPage;
  const off=d.onBrowserEvent(event=>{
    if(event.sessionId===controller.sessionId&&event.method==='ServiceWorker.workerVersionUpdated')
      record.versionEvents.push({sequence:++sequence,at:Date.now(),versions:event.params.versions});
  });
  const targets=async()=>(await d.sendBrowser('Target.getTargets')).targetInfos;
  const close=async target=>assert.equal((await d.sendBrowser('Target.closeTarget',{targetId:target.targetId})).success,true);
  const context=async label=>{
    const worker=await d.until(async()=>(await targets()).find(row=>row.type==='service_worker'&&row.url===origin+'/sw.js'),'real market worker '+label);
    const {sessionId}=await d.sendBrowser('Target.attachToTarget',{targetId:worker.targetId,flatten:true});
    const contexts=[];
    const unobserve=d.onBrowserEvent(event=>{
      if(event.sessionId===sessionId&&event.method==='Runtime.executionContextCreated')contexts.push(event.params.context);
    });
    try{
      await d.sendBrowser('Runtime.enable',{},20000,sessionId);
      const current=await d.until(()=>contexts.find(row=>typeof row.uniqueId==='string'),'unique worker context '+label);
      const observed=await d.sendBrowser('Runtime.evaluate',{uniqueContextId:current.uniqueId,
        expression:'({url:location.href,extensionId:chrome.runtime.id,timeOrigin:performance.timeOrigin})',returnByValue:true},20000,sessionId);
      assert.equal(observed.exceptionDetails,undefined);assert.equal(observed.result.value.url,origin+'/sw.js');
      assert.equal(observed.result.value.extensionId,id);
      const proof={label,at:Date.now(),target:worker,sessionId,context:current,observed:observed.result.value};
      record.contextObservations.push(proof);return proof;
    }finally{
      unobserve();await d.sendBrowser('Target.detachFromTarget',{sessionId});
    }
  };
  try{
    await controller.send('ServiceWorker.enable');
    const old=await context('before-natural-idle');
    const running=await d.until(()=>record.versionEvents.flatMap(event=>event.versions)
      .filter(row=>row.targetId===old.target.targetId&&row.scriptURL===origin+'/sw.js'&&row.runningStatus==='running').at(-1),'running version before natural idle');
    record.runningVersion=running;
    assert.equal((await targets()).find(row=>row.targetId===old.target.targetId)?.attached,false,'no inspector may keep the Worker alive');
    for(const target of await targets()){
      if(!['page','other'].includes(target.type)||target.targetId===controller.targetId)continue;
      await close(target);record.closedTargets.push(target);
    }
    await d.activate(controller);
    record.quiescentAt=Date.now();const boundary=sequence;
    await d.save();
    let stopped;
    for(let elapsed=0;elapsed<120000;elapsed+=1000){
      stopped=record.versionEvents.flatMap(event=>event.sequence>boundary?event.versions.filter(row=>
        row.versionId===running.versionId&&row.registrationId===running.registrationId&&
        row.scriptURL===running.scriptURL&&row.runningStatus==='stopped').map(version=>({event,version})):[]).at(-1);
      if(stopped)break;await pause(1000);
    }
    assert(stopped,'real matching Worker must stop naturally with all extension hosts closed');
    record.stopped=stopped;
    const wakeBoundary=sequence;
    reconnectPage=await d.openTab(websiteURL);
    await d.until(()=>d.evaluate(reconnectPage,'document.querySelector("#connection-state")?.textContent.startsWith("已连接 OpenDesk")'),'new website document reconnects after natural stop');
    record.reopenedWebsite=await d.evaluate(reconnectPage,'({url:location.href,timeOrigin:performance.timeOrigin})');
    record.reopenedWebsite.targetId=reconnectPage.targetId;
    const observation=await reconnectPage.send('Runtime.evaluate',{expression:`(()=>{
      const state=document.querySelector('#connection-state'),button=document.querySelector('#connect-button');
      const r=globalThis.__marketNaturalProbe={events:[],result:null};let pending=false,clicked=false;
      const finish=(status,response)=>{if(r.result)return;r.cancel();r.result={status,response,url:location.href,events:r.events};};
      const snapshot=kind=>{const row={kind,at:Date.now(),disabled:button.disabled,text:state.textContent};r.events.push(row);
        if(!clicked)return;if(row.disabled&&row.text==='正在连接 OpenDesk…')pending=true;
        if(pending&&!row.disabled)finish(row.text.startsWith('已连接 OpenDesk')?'CONNECTED':'FAILED',row);};
      const onClick=event=>{r.events.push({kind:'click',at:Date.now(),browserTimestamp:performance.timeOrigin+event.timeStamp,isTrusted:event.isTrusted});
        if(!event.isTrusted||clicked)return finish('INVALID_CLICK');clicked=true;snapshot('before-handler');};
      const observer=new MutationObserver(()=>snapshot('mutation'));
      r.cancel=()=>{observer.disconnect();button.removeEventListener('click',onClick,true);};
      if(!button||!state||button.disabled)throw Error('PROBE not ready');
      button.addEventListener('click',onClick,true);observer.observe(button,{attributes:true,attributeFilter:['disabled']});
      observer.observe(state,{childList:true,subtree:true,characterData:true});
    })()`});
    assert.equal(observation.exceptionDetails,undefined);
    record.wakeRequestedAt=Date.now();let probe;
    try{
      await d.click(reconnectPage,'#connect-button');
      probe=await d.until(()=>d.evaluate(reconnectPage,'globalThis.__marketNaturalProbe.result||false'),'fresh trusted HTTP PROBE after natural idle');
      assertObservedMarketConnection(probe,websiteURL);record.probe=probe;
    }finally{await d.evaluate(reconnectPage,'globalThis.__marketNaturalProbe.cancel()');}
    const newRunning=await d.until(()=>record.versionEvents.flatMap(event=>event.sequence>wakeBoundary?
      event.versions.filter(row=>row.registrationId===running.registrationId&&row.scriptURL===running.scriptURL&&row.runningStatus==='running')
        .map(version=>({event,version})):[]).at(-1),'real running version after website PROBE');
    record.newRunning=newRunning;
    const fresh=await context('after-natural-idle');
    assert.equal(newRunning.version.targetId,fresh.target.targetId);
    assert.notEqual(fresh.context.uniqueId,old.context.uniqueId,'the observed execution after reconnect must differ from the original');
    const clickTime=probe.events.find(row=>row.kind==='click').browserTimestamp;
    const workerTime=fresh.observed.timeOrigin;
    record.browserOrdering={clickTime,workerTime,marginMs:workerTime-clickTime,
      status:'SUPPORTING_ONLY',wakeCausation:'NOT_PROVEN',
      reason:'Cross-context timer uncertainty is not bounded by this CFT acceptance; timestamps do not decide PASS.'};
    const restored=await d.openTab(pending.reviewURL);
    await d.visible(restored,'[data-market-action="confirm-install"]');
    const intents=await d.readStore(MARKET_INTENTS_STORE,restored);
    const same=intents.intents.find(row=>row.intentId===pending.row.intentId);
    assert.deepEqual(same,pending.row);assert.deepEqual(await readState(restored),baseline);
    record.recoveredIntent=same;await close(restored);
    if(!idleOnly){
    for(let minute=0;performance.now()-waitStarted<MARKET_INTENT_TTL+1000||Date.now()<=pending.row.expiresAt;){
      record.elapsedMonotonicMs=performance.now()-waitStarted;record.lastObservedWallTime=Date.now();
      const current=Math.floor(record.elapsedMonotonicMs/60000);
      if(current!==minute){minute=current;console.log('R5_NATIVE real TTL wait '+minute+'/30 minutes; natural idle already observed');await d.save();}
      await pause(1000);
    }
    record.elapsedMonotonicMs=performance.now()-waitStarted;record.expiryObservedAt=Date.now();
    assert(record.elapsedMonotonicMs>=MARKET_INTENT_TTL);assert(record.expiryObservedAt>pending.row.expiresAt);
    const expired=await d.openTab(pending.reviewURL);
    await d.until(()=>d.evaluate(expired,'document.body.innerText.includes("无法继续此安装请求")&&document.body.innerText.includes("过期")'),'original unconsumed intent expires after real 30 minutes');
    assert.equal(await d.evaluate(expired,'!!document.querySelector("[data-market-action=confirm-install]")'),false);
    assert.deepEqual(await readState(expired),baseline);
    record.expiredSurface=await d.evaluate(expired,'({url:location.href,text:document.body.innerText})');
    await d.screenshot(expired,'r5-real-30-minute-intent-expired.png');
    }
  }catch(error){record.status='FAILED';record.failure={at:Date.now(),message:error.message};throw error;
  }finally{
    off();record.cleanupErrors=[];
    for(const work of [()=>reconnectPage?d.evaluate(reconnectPage,'globalThis.__marketNaturalProbe?.cancel()'):Promise.resolve(),
      ()=>controller.send('ServiceWorker.disable'),()=>d.sendBrowser('Target.detachFromTarget',{sessionId:controller.sessionId}),
      ()=>close(controller)])try{await work();}catch(error){record.cleanupErrors.push(error.message);}
  }
  try{
    assert.deepEqual(record.cleanupErrors,[]);
    await d.restartChrome();assert.deepEqual(await readState(d.getHost()),baseline);
    const same=record.recoveredIntent,[old,fresh]=record.contextObservations;
    check('natural-idle-worker-stopped-and-fresh-http-probe-preserves-unconsumed-intent',
      {intentId:same.intentId,oldUniqueContextId:old.context.uniqueId,newUniqueContextId:fresh.context.uniqueId});
    if(!idleOnly)check('real-30-minute-unconsumed-intent-expiry-rejects-review-without-install-effects',
      {intentId:same.intentId,elapsedMonotonicMs:record.elapsedMonotonicMs,expiresAt:same.expiresAt,observedAt:record.expiryObservedAt});
    const closed=idleOnly?['natural-idle-worker-shutdown']:['real-30-minute-intent-expiry','natural-idle-worker-shutdown'];
    d.evidence.r5.notTested=d.evidence.r5.notTested.filter(name=>!closed.includes(name));
    record.status='PASS';await d.save();
  }catch(error){record.status='FAILED';record.failure={at:Date.now(),message:error.message};await d.save();throw error;}
}
