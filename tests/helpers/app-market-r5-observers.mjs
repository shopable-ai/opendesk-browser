// Readonly, source-bound native observations. No API replacement, fake sender,
// return-value override, installation write or product test hook is used here.
import assert from 'node:assert/strict';
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

// Hold one exact, unchanged product call until the driver physically terminates
// its owned worker/page. Unlike sender observation, this never resumes a hit.
export async function armMarketCut(d,name,{targetId=null,observeRegistryWrites=false}={}){
  assert(['A1','A2','B','C'].includes(name));
  assert(!observeRegistryWrites||name==='C');
  const isWorker=name.startsWith('A'),origin='chrome-extension://'+d.getExtensionId();
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
  const scripts=[],contexts=[],versions=[],reads=new Set();let point,breakpointId,disposed=false,failed=null;
  const controller=isWorker?d.getHost():null;
  const off=d.onBrowserEvent(event=>{
    if(controller&&event.sessionId===controller.sessionId&&event.method==='ServiceWorker.workerVersionUpdated')versions.push(...event.params.versions);
    if(event.method==='Target.targetDestroyed'&&event.params.targetId===target.targetId)record.events.push(event);
    if(event.sessionId!==sessionId)return;
    if(event.method==='Runtime.executionContextCreated')contexts.push(event.params.context);
    if(event.method==='Debugger.scriptParsed')scripts.push(event.params);
    if(['Runtime.executionContextDestroyed','Runtime.executionContextsCleared','Inspector.detached'].includes(event.method))record.events.push(event);
    if(event.method!=='Debugger.paused'||!event.params.hitBreakpoints?.includes(breakpointId))return;
    const reading=(async()=>{
      try{
        if(!observeRegistryWrites)assert.equal(record.hit,undefined,'a cut can hit only once');
        const frame=event.params.callFrames[0];
        for(const key of ['scriptId','lineNumber','columnNumber'])assert.equal(frame.location[key],record.actualLocation[key]);
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
    const script=await d.until(()=>scripts.find(row=>row.url===url),'source-bound market cut script '+name);
    const actual=(await client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource;
    assert.equal(hash(actual),hash(await readFile(join(d.extension,path),'utf8')),'cut source matches the loaded package');
    const context=contexts.find(row=>row.id===script.executionContextId);assert(context?.uniqueId,'actual cut execution context');
    Object.assign(record,{script,sourceHash:hash(actual),executionContext:context});
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
    record.status='ARMED';
  }catch(error){failed=error;record.status='NOT_OBSERVED';record.errors.push({stage:'arm',message:error.message});await dispose();throw error;}
  async function wait(){return d.until(()=>{if(failed)throw failed;return record.hit;},'native exact interruption '+name);}
  async function terminate(){
    await wait();record.termination={requestedAt:new Date().toISOString(),method:isWorker?'ServiceWorker.stopWorker':'Target.closeTarget'};
    if(isWorker)await controller.send('ServiceWorker.stopWorker',{versionId:record.workerVersion.versionId});
    else assert.equal((await d.sendBrowser('Target.closeTarget',{targetId:target.targetId})).success,true);
    await d.until(async()=>(await d.sendBrowser('Target.getTargets')).targetInfos.every(row=>row.targetId!==target.targetId),'cut target physically absent '+name);
    if(isWorker)record.termination.stoppedVersion=await d.until(()=>versions.find(row=>row.versionId===record.workerVersion.versionId&&row.runningStatus==='stopped'),'cut worker version actually stopped');
    record.termination.targetAbsent=true;record.termination.observedAt=new Date().toISOString();record.status='INTERRUPTED';
    await dispose();return record;
  }
  return {record,wait,terminate,dispose};
}
