// Readonly, source-bound native observations. No API replacement, fake sender,
// return-value override, installation write or product test hook is used here.
import assert from 'node:assert/strict';

export function assertObservedMarketConnection(result,url){
  assert.equal(result?.status,'CONNECTED','one actual trusted click must complete a new PROBE');
  assert.equal(result.url,url,'the observed website document must not navigate');
  assert(Array.isArray(result.events)&&result.events.length>=3&&result.events.length<=32);
  const events=result.events,clicks=events.filter(row=>row.kind==='click');
  assert.equal(clicks.length,1);assert.equal(clicks[0].isTrusted,true);
  assert(events.every((row,i)=>Number.isFinite(row.at)&&(!i||row.at>=events[i-1].at)));
  const click=events.indexOf(clicks[0]),pending=events.findIndex((row,i)=>i>click&&row.disabled===true&&row.text==='正在连接 OpenDesk…');
  assert(pending>click,'old CONNECTED text cannot replace a new pending transition');
  const response=events.at(-1);
  assert.deepEqual(result.response,response);assert.equal(response.kind,'mutation');
  assert.equal(response.disabled,false);assert.match(response.text,/^已连接 OpenDesk/);
  assert(events.length-1>pending&&response.at>=events[pending].at);
}
export async function waitForMarketCutOutcome(until,observe,label){
  // The shared polling helper retries thrown errors. An active wake or an
  // identity assertion failure must end this observation, even if a later
  // snapshot could otherwise look successful.
  const outcome=await until(async()=>{
    try{return await observe();}catch(error){return {observationFailure:error};}
  },label);
  if(outcome?.observationFailure)throw outcome.observationFailure;
  return outcome;
}
import {parse} from 'acorn';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {exactBreakpointLocation,readFrame} from '../framework/b05-native-observers.mjs';
import {discoverMarketCutPoints,marketCallLocation} from './app-market-r5-cutpoints.mjs';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const isFunction=node=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node?.type);
export function marketSenderPoints(source){
  const entries=[];
  function walk(node,ancestors=[]){
    if(!node?.type)return;entries.push({node,ancestors});
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)walk(child,[...ancestors,node]);
      else if(value?.type)walk(value,[...ancestors,node]);
    }
  }
  walk(parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}));
  const markers=entries.filter(({node})=>node.type==='Literal'&&node.value==='E_EXTENSION_ID');
  assert.equal(markers.length,1,'one market envelope validator');
  const fn=markers[0].ancestors.filter(isFunction).at(-1);
  assert(fn?.id?.name,'named actual validator; do not guess minified bindings');
  assert(entries.some(({node,ancestors})=>node.type==='Literal'&&node.value==='E_SENDER'&&ancestors.filter(isFunction).at(-1)===fn));
  const calls=entries.filter(({node})=>node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name===fn.id.name);
  assert(calls.length>0&&calls.length<=4,'bounded exact validator calls');
  return calls.map(({node,ancestors})=>{
    assert.equal(node.arguments.length,3);assert(node.arguments.every(arg=>arg.type==='Identifier'));
    const owner=ancestors.filter(isFunction).at(-1);
    const requestExpression=owner?.params.length===2&&owner.params.every(arg=>arg.type==='Identifier')&&
      owner.params[1].name===node.arguments[1].name?owner.params[0].name:null;
    return {range:[node.start,node.end],text:source.slice(node.start,node.end),
      location:{lineNumber:node.loc.start.line-1,columnNumber:node.loc.start.column},
      endLocation:{lineNumber:node.loc.end.line-1,columnNumber:node.loc.end.column},
      senderExpression:node.arguments[1].name,channelExpression:node.arguments[2].name,requestExpression};
  });
}
function projection(point){
  const s=point.senderExpression,c=point.channelExpression;
  const shape=(base,fields)=>'{'+fields.map(key=>JSON.stringify(key)+':{present:Object.hasOwn('+base+','+JSON.stringify(key)+'),type:typeof '+base+'?.'+key+',value:'+base+'?.'+key+'??null}').join(',')+'}';
  return '({senderKeys:Object.keys('+s+'),sender:'+shape(s,['id','nativeApplication','frameId','documentId','documentLifecycle','origin','url'])+
    ',tabPresent:Object.hasOwn('+s+',"tab"),tabType:typeof '+s+'.tab,tab:'+shape('('+s+'.tab||{})',['id','incognito','url'])+
    ',channel:'+shape(c,['enabled','mode','origin','extensionId','protocol'])+
    ',request:'+(point.requestExpression?'{action:'+point.requestExpression+'.action,protocol:'+point.requestExpression+'.protocol}':'null')+'})';
}
export async function observeMarketSender(d,{holdProbe=false}={}){
  const origin='chrome-extension://'+d.getExtensionId(),url=origin+'/marketplace/market-host.js';
  const target=await d.until(async()=>(await d.sendBrowser('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===origin+'/sw.js'),'market sender observer worker');
  const {sessionId}=await d.sendBrowser('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const client={send:(method,params={},timeout=20000)=>d.sendBrowser(method,params,timeout,sessionId)};
  const record=d.evidence.r5[holdProbe?'timeoutObservation':'senderObservation']={status:'IN_PROGRESS',targetId:target.targetId,sessionId,url,observations:[],errors:[]};
  if(holdProbe)record.boundary='real website timer while its real PROBE is held at the unchanged validator call; no fake timer or API reply';
  const scripts=[],contexts=[],pending=new Set(),points=new Map();let disposed=false,held=false;
  const off=d.onBrowserEvent(event=>{
    if(event.sessionId!==sessionId)return;
    if(event.method==='Debugger.scriptParsed')scripts.push(event.params);
    if(event.method==='Runtime.executionContextCreated')contexts.push(event.params.context);
    if(event.method!=='Debugger.paused')return;
    const point=event.params.hitBreakpoints?.map(id=>points.get(id)).find(Boolean);if(!point)return;
    const job=(async()=>{
      try{
        const frame=event.params.callFrames[0];
        assert.equal(frame.location.scriptId,record.script.scriptId);
        assert.equal(frame.location.lineNumber,point.location.lineNumber);assert.equal(frame.location.columnNumber,point.location.columnNumber);
        const observation={at:new Date().toISOString(),location:frame.location,value:await readFrame(client,frame,projection(point))};
        record.observations.push(observation);
        if(holdProbe&&point.requestExpression&&record.heldAt===undefined){
          assert.equal(observation.value.request.action,'PROBE');
          assert.equal(observation.value.request.protocol,d.evidence.r5.channel.protocol);
          record.heldAt=Date.now();record.heldObservation=record.observations.length-1;held=true;
        }
        record.status='OBSERVED';
      }catch(error){record.errors.push({stage:'read',message:error.message});record.status='NOT_OBSERVED';}
      finally{if(!held)await client.send('Debugger.resume').catch(error=>record.errors.push({stage:'resume',message:error.message}));}
    })();pending.add(job);void job.finally(()=>pending.delete(job));
  });
  async function dispose(){
    if(disposed)return;disposed=true;await Promise.allSettled([...pending]);
    for(const breakpointId of points.keys())await client.send('Debugger.removeBreakpoint',{breakpointId}).catch(error=>record.errors.push({stage:'remove-breakpoint',message:error.message}));
    if(held){await client.send('Debugger.resume').then(()=>{held=false;record.resumedAt=Date.now();}).catch(error=>record.errors.push({stage:'resume-held-probe',message:error.message}));}
    await client.send('Debugger.disable').catch(error=>record.errors.push({stage:'disable-debugger',message:error.message}));off();
    await d.sendBrowser('Target.detachFromTarget',{sessionId}).catch(error=>record.errors.push({stage:'detach-observer',message:error.message}));
  }
  d.t.after(dispose);
  try{
    await client.send('Runtime.enable');await client.send('Debugger.enable');
    const script=await d.until(()=>scripts.find(s=>s.url===url),'market-host actual loaded script');
    const actual=(await client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource;
    assert.equal(hash(actual),hash(await readFile(join(d.extension,'marketplace/market-host.js'),'utf8')),'loaded market host matches exact package');
    Object.assign(record,{sourceHash:hash(actual),script,executionContext:contexts.find(c=>c.id===script.executionContextId),points:[]});
    const actualPoints=marketSenderPoints(actual);
    if(holdProbe)assert.equal(actualPoints.filter(point=>point.requestExpression).length,1,'one exact request-bearing envelope call for the real probe delay');
    for(const point of actualPoints){
      const locations=(await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId:script.scriptId,...point.location},end:{scriptId:script.scriptId,...point.endLocation},restrictToFunction:true})).locations;
      const location=exactBreakpointLocation(point,locations,script.scriptId);
      const installed=await client.send('Debugger.setBreakpoint',{location});
      for(const key of ['scriptId','lineNumber','columnNumber'])assert.equal(installed.actualLocation[key],location[key],'no breakpoint relocation');
      points.set(installed.breakpointId,point);record.points.push({...point,actualLocation:installed.actualLocation});
    }
  }catch(error){record.status='NOT_OBSERVED';record.errors.push({stage:'arm',message:error.message});await dispose();throw error;}
  return {record,dispose};
}

// A debugger observer can report executionContextCreated while attaching to an
// already-running document. Those pre-arming events are valid diagnostics, not
// a recovery failure. After arming, reject termination/replacement of the
// particular original context, and independently require ZERO registry calls.
export function assertMarketRecoveryObserverStable(record){
  assert.equal(record?.name,'C');
  assert.equal(record.status,'ARMED','source-bound original registry observer must remain armed');
  assert(Number.isInteger(record.armedEventSequence)&&record.armedEventSequence>=0);
  assert(typeof record.executionContext?.uniqueId==='string'&&record.executionContext.uniqueId.length>0);
  assert(Number.isSafeInteger(record.executionContext.id));
  assert.deepEqual(record.errors,[],'observer read errors invalidate the receipt');
  assert.deepEqual(record.observations,[],'explicit recovery must never resubmit the installed registry');
  const invalid=record.events.filter(event=>{
    if(!(event.sequence>record.armedEventSequence))return false;
    if(event.method==='Target.targetDestroyed')
      return event.params?.targetId===record.target.targetId;
    if(event.sessionId!==record.sessionId)return false;
    if(['Inspector.detached','Runtime.executionContextsCleared'].includes(event.method))return true;
    if(event.method==='Runtime.executionContextDestroyed')
      return event.params?.executionContextId===record.executionContext.id;
    return event.method==='Runtime.executionContextCreated'&&
      event.params?.context?.id===record.executionContext.id&&
      event.params?.context?.uniqueId!==record.executionContext.uniqueId;
  });
  assert.deepEqual(invalid,[],'original trusted review context changed after recovery observer was armed');
}

// Hold one exact, unchanged product call until the driver physically terminates
// its owned worker/page. Unlike sender observation, this never resumes a hit.
export async function armMarketCut(d,name,{targetId=null,observeRegistryWrites=false,wakeAfterContextDestroyed=null}={}){
  assert(['A1','A2','B','C'].includes(name));
  assert(!observeRegistryWrites||name==='C');
  const isWorker=name.startsWith('A'),origin='chrome-extension://'+d.getExtensionId();
  assert(wakeAfterContextDestroyed===null||isWorker&&typeof wakeAfterContextDestroyed==='function');
  const path=isWorker?'marketplace/market-host.js':'ui/marketplace.js',url=origin+'/'+path;
  const target=await d.until(async()=>(await d.sendBrowser('Target.getTargets')).targetInfos.find(row=>
    isWorker?row.type==='service_worker'&&row.url===origin+'/sw.js':row.targetId===targetId),'actual market cut target '+name);
  assert(isWorker||target.type==='page'&&target.url.startsWith(origin+'/ui/marketplace.html?intent='));
  const {sessionId}=await d.sendBrowser('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const client={send:(method,params={},timeout=10000)=>d.sendBrowser(method,params,timeout,sessionId)};
  const record={name,status:'ARMING',target,url,sessionId,events:[],errors:[],boundary:isWorker?
    'physical worker stop at real handoff call; not native tabs.create ACK loss':
    'physical trusted page close at real installer call; not native storage.set ACK loss'};
  if(observeRegistryWrites){record.observations=[];record.boundary='readonly original registry-write call counter during explicit recovery';d.evidence.r5.registryWritesDuringRecovery=record;}
  else (d.evidence.r5.interruptions??=[]).push(record);
  const scripts=[],contexts=[],versions=[],liveContexts=new Map(),reads=new Set();
  let point,breakpointId,disposed=false,failed=null,eventSequence=0;
  if(isWorker)record.workerVersionEvents=[];
  const observed=event=>({sequence:++eventSequence,receivedAt:Date.now(),...event});
  const controller=isWorker?d.getHost():null;
  const off=d.onBrowserEvent(event=>{
    if(controller&&event.sessionId===controller.sessionId&&event.method==='ServiceWorker.workerVersionUpdated'){
      versions.push(...event.params.versions);record.workerVersionEvents.push(observed(event));
    }
    if(event.method==='Target.targetDestroyed'&&event.params.targetId===target.targetId)record.events.push(observed(event));
    if(event.sessionId!==sessionId)return;
    if(event.method==='Runtime.executionContextCreated'){
      contexts.push(event.params.context);liveContexts.set(event.params.context.id,event.params.context);
      record.events.push(observed(event));
    }
    if(event.method==='Debugger.scriptParsed')scripts.push({...event.params,observedSequence:++eventSequence,receivedAt:Date.now(),
      executionContextUniqueId:liveContexts.get(event.params.executionContextId)?.uniqueId??null});
    if(['Runtime.executionContextDestroyed','Runtime.executionContextsCleared','Inspector.detached'].includes(event.method)){
      record.events.push({...observed(event),contextsBefore:[...liveContexts.values()]});
      if(event.method==='Runtime.executionContextDestroyed')liveContexts.delete(event.params.executionContextId);
      if(event.method==='Runtime.executionContextsCleared')liveContexts.clear();
    }
    if(event.method!=='Debugger.paused'||!event.params.hitBreakpoints?.includes(breakpointId))return;
    const reading=(async()=>{
      try{
        if(!observeRegistryWrites)assert.equal(record.hit,undefined,'a cut can hit only once');
        const frame=event.params.callFrames[0];
        for(const key of ['scriptId','lineNumber','columnNumber'])assert.equal(frame.location[key],record.actualLocation[key]);
        assert.equal(liveContexts.get(record.script.executionContextId)?.uniqueId,record.executionContext.uniqueId,
          'the exact call still belongs to the execution context armed for this cut');
        const expression=isWorker?'({intent:'+point.intentExpression+',reviewURL:'+point.reviewURLExpression+
          ',sender:{documentId:'+point.senderExpression+'.documentId,tabId:'+point.senderExpression+'.tab.id}'+
          (name==='A2'?',tab:'+point.tabExpression:'')+'})':name==='B'?
          '({operationId:'+point.operationIdExpression+',toolId:'+point.toolIdExpression+',registryKey:'+point.registryKeyExpression+',journalKey:'+point.journalKeyExpression+'})':
          '({key:'+point.keyExpression+',scope:'+point.scopeExpression+',failure:'+point.failureExpression+',next:'+point.nextExpression+',previous:'+point.previousExpression+'})';
        const observation={at:new Date().toISOString(),location:frame.location,value:await readFrame(client,frame,expression)};
        if(observeRegistryWrites)record.observations.push(observation);
        else {record.hit=observation;record.status='PAUSED_AT_EXACT_CALL';}
      }catch(error){failed=error;record.status='NOT_OBSERVED';record.errors.push({stage:'hit',message:error.message});}
      finally{if(observeRegistryWrites)await client.send('Debugger.resume').catch(error=>record.errors.push({stage:'resume',message:error.message}));}
    })();reads.add(reading);void reading.finally(()=>reads.delete(reading));
  });
  async function dispose(){
    if(disposed)return;disposed=true;
    await Promise.allSettled([...reads]);
    const alive=(await d.sendBrowser('Target.getTargets').catch(()=>({targetInfos:[]}))).targetInfos.some(row=>row.targetId===target.targetId);
    if(alive){
      if(breakpointId)await client.send('Debugger.removeBreakpoint',{breakpointId},2000).catch(()=>{});
      // Failed observation may have left a paused target. Teardown releases only
      // the debugger; a failed case cannot acquire a PASS through this cleanup.
      await client.send('Debugger.disable',{},2000).catch(()=>{});
      await d.sendBrowser('Target.detachFromTarget',{sessionId},2000).catch(()=>{});
    }
    off();
    if(controller)await controller.send('ServiceWorker.disable',{},2000).catch(()=>{});
  }
  d.t.after(dispose);
  try{
    await client.send('Runtime.enable');await client.send('Debugger.enable');
    const script=await d.until(()=>scripts.find(row=>row.url===url&&row.executionContextUniqueId&&
      liveContexts.get(row.executionContextId)?.uniqueId===row.executionContextUniqueId),'source-bound market cut script '+name);
    const actual=(await client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource;
    assert.equal(hash(actual),hash(await readFile(join(d.extension,path),'utf8')),'cut source matches the loaded package');
    const context=liveContexts.get(script.executionContextId);assert(context?.uniqueId,'actual cut execution context');
    Object.assign(record,{script,sourceHash:hash(actual),executionContext:context});
    if(isWorker){
      const request={expression:'void 0',uniqueContextId:context.uniqueId,throwOnSideEffect:true,returnByValue:true};
      const response=await client.send('Runtime.evaluate',request);
      record.contextProbeBefore={sessionId,targetId:target.targetId,request,response,at:Date.now()};
      assert.equal(response.exceptionDetails,undefined);assert.equal(response.result?.type,'undefined',
        'same-session uniqueContextId positive control before the worker cut');
    }
    const discovered=discoverMarketCutPoints(actual,{required:[name],registryStoreKey:SIDEBAR_TOOL_STORE})[name];
    point=observeRegistryWrites?discovered.submission:discovered;record.point=point;
    record.breakpointQuery={start:{scriptId:script.scriptId,...point.location},end:{scriptId:script.scriptId,...point.endLocation},restrictToFunction:true};
    const possible=await client.send('Debugger.getPossibleBreakpoints',record.breakpointQuery);
    record.possibleBreakpoints=possible;
    const location=marketCallLocation(point,possible.locations,script.scriptId);
    record.callPositionRule='sole browser type=call inside exact AST CallExpression with no nested invocation; no adjacent statement or relocation';
    record.selectedCall={...location,type:'call'};
    const installed=await client.send('Debugger.setBreakpoint',{location,...(point.condition?{condition:point.condition}:{})});
    breakpointId=installed.breakpointId;record.installedBreakpoint=installed;record.actualLocation=installed.actualLocation;
    for(const key of ['scriptId','lineNumber','columnNumber'])assert.equal(installed.actualLocation[key],location[key],'no cut relocation');
    if(controller){
      await controller.send('ServiceWorker.enable');
      record.workerVersion=await d.until(()=>versions.filter(row=>row.targetId===target.targetId&&row.scriptURL===origin+'/sw.js'&&row.runningStatus==='running').at(-1),'exact running market worker version');
    }
    // Keep pre-arm events for diagnostics. Native recovery observes only events
    // after this exact breakpoint/context pair was successfully armed.
    record.armedEventSequence=eventSequence;
    record.armedContextUniqueId=context.uniqueId;
    record.status='ARMED';
  }catch(error){failed=error;record.status='NOT_OBSERVED';record.errors.push({stage:'arm',message:error.message});await dispose();throw error;}
  async function wait(){return d.until(()=>{if(failed)throw failed;return record.hit;},'native exact interruption '+name);}
  async function terminate(){
    await wait();record.termination={requestedAt:new Date().toISOString(),requestedAtMs:Date.now(),afterSequence:eventSequence,
      method:isWorker?'ServiceWorker.stopWorker':'Target.closeTarget'};
    const termination=record.termination;
    if(isWorker){
      termination.response=await controller.send('ServiceWorker.stopWorker',{versionId:record.workerVersion.versionId});
      // A ServiceWorker DevTools target ID can survive an execution restart.
      // Require the actual post-request stopped version and destruction of the
      // previously proven unique context; never reuse A1's earlier stop event.
      const stopped=await d.until(()=>record.workerVersionEvents.flatMap(event=>
        event.sequence>termination.afterSequence?event.params.versions.filter(row=>
          row.versionId===record.workerVersion.versionId&&row.registrationId===record.workerVersion.registrationId&&
          row.scriptURL===origin+'/sw.js'&&row.runningStatus==='stopped').map(version=>({event,version})):[]).at(-1),
      'actual post-request stopped worker version '+name);
      termination.stoppedVersion=stopped.version;termination.stoppedEvent=stopped.event;
      termination.targetSnapshots=[];
      // Some Chrome builds keep an inspector target while stopping the V8
      // execution, then remove it later. Observe actual snapshots throughout
      // this wait; a first still-present snapshot is not proof of target reuse.
      const afterStop=await waitForMarketCutOutcome(d.until,async()=>{
        const snapshot=await d.sendBrowser('Target.getTargets');
        termination.targetsAfterStop=snapshot;termination.targetSnapshots.push({at:Date.now(),snapshot});
        const remaining=snapshot.targetInfos.find(row=>row.targetId===target.targetId);
        termination.targetAbsent=!remaining;termination.targetStillPresent=Boolean(remaining);termination.targetReused=remaining?null:false;
        if(!remaining)return {targetAbsent:true};
        assert.equal(remaining.type,'service_worker');assert.equal(remaining.url,origin+'/sw.js');
        const contextDestroyed=record.events.find(event=>event.sequence>termination.afterSequence&&
          event.sessionId===sessionId&&
          ((event.method==='Runtime.executionContextDestroyed'&&
            event.params.executionContextId===record.executionContext.id)||event.method==='Runtime.executionContextsCleared')&&
          event.contextsBefore?.some(context=>context.uniqueId===record.executionContext.uniqueId));
        const next=scripts.find(row=>row.observedSequence>termination.afterSequence&&row.url===url&&
          row.executionContextUniqueId&&liveContexts.get(row.executionContextId)?.uniqueId===row.executionContextUniqueId&&
          row.executionContextUniqueId!==record.executionContext.uniqueId);
        if(contextDestroyed&&!next&&wakeAfterContextDestroyed&&!termination.webProbeWake){
          // The supported website button may wake a stopped execution. It is
          // not an install/recovery action, and cannot replace the identity
          // checks below. PROBE can update its normal request-limit metadata.
          termination.webProbeWake={requestedAt:Date.now(),action:'PROBE',via:'real HTTP connect button',initiated:false};
          try{
            termination.webProbeWake.result=await wakeAfterContextDestroyed();
            termination.webProbeWake.initiated=true;
          }catch(error){
            termination.webProbeWake.failure={at:Date.now(),message:error.message,
              ...(error.marketConnectionObservation?{observation:error.marketConnectionObservation}:{})};
            record.status='NOT_OBSERVED';record.errors.push({stage:'website-probe-wake',...termination.webProbeWake.failure});
            throw error;
          }
        }
        return contextDestroyed&&next?{targetAbsent:false,contextDestroyed,next}:null;
      },'actual stopped target absence or replacement execution '+name);
      if(!afterStop.targetAbsent){
        termination.contextDestroyed=afterStop.contextDestroyed;
        // Keep the same target and observation session. A missing context in an
        // unrelated target, a disconnected inspector or a timeout is no proof.
        const next=afterStop.next;
        const context=liveContexts.get(next.executionContextId),source=await client.send('Debugger.getScriptSource',{scriptId:next.scriptId});
        assert.equal(hash(source.scriptSource),record.sourceHash,'reused worker target must load the identical product source');
        termination.newExecution={sessionId,targetId:target.targetId,context,script:next,sourceHash:hash(source.scriptSource)};
        const request={...record.contextProbeBefore.request};let response,error;
        try{response=await client.send('Runtime.evaluate',request);}catch(failure){error=failure.cdpError;termination.oldContextProbeFailure=failure.message;}
        termination.oldContextProbe={sessionId,targetId:target.targetId,request,...(response?{response}:{}),...(error?{error}:{}),at:Date.now()};
        assert.equal(error?.code,-32602,'old unique context must return the exact native CDP not-found rejection');
        assert.equal(error.message,'uniqueContextId not found');
        const nextRequest={...request,uniqueContextId:context.uniqueId},nextResponse=await client.send('Runtime.evaluate',nextRequest);
        termination.newContextProbe={sessionId,targetId:target.targetId,request:nextRequest,response:nextResponse,at:Date.now()};
        assert.equal(nextResponse.exceptionDetails,undefined);assert.equal(nextResponse.result?.type,'undefined');
        termination.targetReused=true;
        termination.executionProof='stopped-version-and-destroyed-unique-context-on-reused-target';
      }else{
        // A removed inspector target need not deliver a final V8 context event.
        // The original physical target absence proof remains sufficient here.
        termination.executionProof='stopped-version-and-physical-target-absence';
      }
      termination.executionTerminated=true;
    }else{
      termination.response=await d.sendBrowser('Target.closeTarget',{targetId:target.targetId});
      assert.equal(termination.response.success,true);
      await d.until(async()=>(await d.sendBrowser('Target.getTargets')).targetInfos.every(row=>row.targetId!==target.targetId),'cut target physically absent '+name);
      termination.targetAbsent=true;
    }
    termination.observedAt=new Date().toISOString();record.status='INTERRUPTED';
    await dispose();return record;
  }
  return {record,wait,terminate,dispose};
}
