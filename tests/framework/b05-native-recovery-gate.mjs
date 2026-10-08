import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {exactBreakpointLocation,requireFreshWorkerContext} from './b05-native-observers.mjs';
const sha=source=>createHash('sha256').update(source).digest('hex');
const missing=message=>Object.assign(new Error(message),{code:'E_NATIVE_NOT_OBSERVED'});

// Chrome can retain a service-worker Target/session while replacing its native
// execution context. Arm that real session before termination as well as newly
// attached sessions. The first constant initialization has no native effects.
// An exact persisted URL breakpoint there gates replacement startup.
export function discoverWorkerStartupPoint(source) {
  const root=parse(source,{ecmaVersion:'latest',locations:true});
  assert.equal(root.body.length,1);
  const declaration=root.body[0];assert.equal(declaration.type,'VariableDeclaration');assert.equal(declaration.declarations.length,1);
  const invocation=declaration.declarations[0].init;assert.equal(invocation.type,'CallExpression');assert.equal(invocation.callee.type,'FunctionExpression');
  const statements=invocation.callee.body.body.filter(s=>!s.directive),first=statements[0];
  assert.equal(first.type,'VariableDeclaration');assert.equal(first.kind,'const');assert.equal(first.declarations.length,1);
  const literal=first.declarations[0].init;assert.equal(literal.type,'Literal');assert.equal(literal.value,'opendesk.environment.v1');
  return {location:{lineNumber:first.loc.start.line-1,columnNumber:first.loc.start.column},
    endLocation:{lineNumber:first.loc.end.line-1,columnNumber:first.loc.end.column},text:source.slice(first.start,first.end),
    effectFreePrefix:source.slice(0,first.end)};
}
export async function armNativeRecoveryGate({browser,clients,old,point,sourceHash,evidence,until,traceKv,projectError}) {
  const oldContexts=old.executionContexts;
  if(!point||!oldContexts?.length||oldContexts.some(c=>!c.uniqueId))throw missing('Exact KV point and old native contexts required');
  const filter=[{type:'service_worker',exclude:false},{exclude:true}],owned=[],pending=new Set();
  const gate=evidence.recoveryStartup={status:'NOT_TESTED',oldTargetId:old.targetId,oldContexts,filter,attachments:[],nativeEvents:[]};
  let expecting=false,closing=false,failure,candidate,replacement,startupLocation;
  function track(task) {pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});return task;}
  function fail(error) {failure=error;gate.status='NOT_TESTED';gate.error=projectError(error);}
  function childClient(sessionId) {
    const removals=[];
    const client={send:(method,params)=>browser.send(method,params,sessionId),on(listener){
      const off=browser.on(event=>{if(event.sessionId===sessionId)listener(event);});removals.push(off);return off;
    },close(){for(const off of removals)off();}};
    clients.push(client);return client;
  }
  async function validateStartup(item,pause) {
    if(candidate&&candidate!==item)throw missing('Multiple replacement startup sessions');
    if(item.validating)throw missing('Multiple replacement startup pauses');
    item.validating=true;candidate=item;
    const script=item.scripts.toReversed().find(s=>s.scriptId===pause.callFrames[0].location.scriptId&&s.url===old.url);
    if(!script)throw missing('Startup pause must bind exact bundled worker script');
    assert.deepEqual(pause.callFrames[0].location,{scriptId:script.scriptId,...startupLocation});
    const actual=(await item.client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource;
    if(sha(actual)!==sourceHash)throw missing('Replacement startup source differs unchanged package');
    const executionContext=requireFreshWorkerContext(script,[...item.contexts.values()],oldContexts);
    const startupResolutions=[...(item.crashed?[]:item.startupInstalled.locations),...item.resolved.filter(r=>r.breakpointId===item.startupBreakpoint).map(r=>r.location)]
      .filter(r=>r.scriptId===script.scriptId).filter((r,i,rows)=>rows.findIndex(o=>o.scriptId===r.scriptId&&o.lineNumber===r.lineNumber&&o.columnNumber===r.columnNumber)===i);
    exactBreakpointLocation({location:startupLocation},startupResolutions,script.scriptId);
    const resolutions=[...(item.crashed?[]:item.installed.locations),...item.resolved.filter(r=>r.breakpointId===item.breakpointId).map(r=>r.location)]
      .filter((r,i,rows)=>rows.findIndex(o=>o.scriptId===r.scriptId&&o.lineNumber===r.lineNumber&&o.columnNumber===r.columnNumber)===i)
      .filter(r=>r.scriptId===script.scriptId);
    const resolution=exactBreakpointLocation(point,resolutions,script.scriptId);
    item.tracer=await traceKv(item.client,script.scriptId,evidence,{breakpointId:item.breakpointId,actualLocation:resolution},executionContext);
    Object.assign(gate,{sourceHash:sha(actual),script,executionContext,requestedLocation:point.location,actualLocation:resolution,
      startupPause:pause,startupLocation,startupSourcePoint:item.startupPoint??gate.startupPoint,observerInstalledAt:new Date().toISOString(),replacementTargetId:item.attachment.targetInfo.targetId,
      targetReused:item.attachment.targetInfo.targetId===old.targetId,replacementSessionId:item.attachment.sessionId});
    if(failure||closing)throw failure??missing('Startup coverage ended before validated resume');
    await item.client.send('Debugger.removeBreakpoint',{breakpointId:item.startupBreakpoint});item.startupBreakpoint=null;
    await item.client.send('Debugger.resume');
    await item.client.send('Runtime.runIfWaitingForDebugger');
    gate.resumedAt=new Date().toISOString();gate.status='OBSERVED';
    replacement={target:item.attachment.targetInfo,client:item.client,contexts:[executionContext]};
  }
  async function attach(attachment) {
    if(attachment.targetInfo.url!==old.url)return;
    const client=childClient(attachment.sessionId),item={attachment,client,scripts:[],contexts:new Map(),resolved:[],debuggerEnabled:false,detached:false};
    owned.push(item);gate.attachments.push(attachment);
    client.on(event=>{
      const p=event.params??{};
      if(event.method==='Inspector.targetCrashed'&&!gate.executionContext){item.crashed=true;item.scripts.length=0;item.resolved.length=0;item.contexts.clear();}
      if(event.method==='Debugger.scriptParsed')item.scripts.push(p);
      if(event.method==='Debugger.breakpointResolved')item.resolved.push(p);
      if(event.method==='Runtime.executionContextCreated')item.contexts.set(p.context.id,p.context);
      if(event.method==='Runtime.executionContextDestroyed')item.contexts.delete(p.executionContextId);
      if(event.method==='Runtime.executionContextsCleared')item.contexts.clear();
      if(['Inspector.targetCrashed','Inspector.targetReloadedAfterCrash','Runtime.executionContextsCleared','Runtime.executionContextCreated'].includes(event.method))
        gate.nativeEvents.push({at:new Date().toISOString(),sessionId:attachment.sessionId,event});
      if(!closing&&gate.executionContext&&candidate===item&&
        (event.method==='Inspector.targetCrashed'||event.method==='Runtime.executionContextsCleared'||
          event.method==='Runtime.executionContextDestroyed'&&p.executionContextId===gate.executionContext.id))
        fail(missing('Validated replacement context lost during recovery trace'));
      if(!closing&&expecting&&event.method==='Debugger.paused'&&p.hitBreakpoints?.includes(item.startupBreakpoint))
        track(validateStartup(item,p).catch(fail));
    });
    await client.send('Debugger.enable');item.debuggerEnabled=true;
    await client.send('Runtime.enable');
    if(!startupLocation) {
      const script=item.scripts.find(s=>s.url===old.url);if(!script)throw missing('Existing exact worker script required before stop');
      const actual=(await client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource;
      if(sha(actual)!==sourceHash)throw missing('Original worker source differs package');
      const point=discoverWorkerStartupPoint(actual);
      const locations=(await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId:script.scriptId,...point.location},end:{scriptId:script.scriptId,...point.endLocation},restrictToFunction:true})).locations;
      if(locations.length!==1)throw missing('First effect-free constant must have one exact native executable position');
      startupLocation={lineNumber:locations[0].lineNumber,columnNumber:locations[0].columnNumber};item.startupPoint=point;
      gate.startupPoint=point;gate.nativeStartupPossibleLocations=locations;
    }
    item.installed=await client.send('Debugger.setBreakpointByUrl',{url:old.url,...point.location});item.breakpointId=item.installed.breakpointId;
    item.startupInstalled=await client.send('Debugger.setBreakpointByUrl',{url:old.url,...startupLocation});item.startupBreakpoint=item.startupInstalled.breakpointId;
    item.armedAt=new Date().toISOString();
    // This does not resume a Debugger.paused original storage cut.
    await client.send('Runtime.runIfWaitingForDebugger');
  }
  const off=browser.on(event=>{
    if(event.method==='Target.detachedFromTarget'){
      const item=owned.find(i=>i.attachment.sessionId===event.params.sessionId);
      if(item)item.detached=true;
      if(!closing&&candidate===item)fail(missing('Validated recovery session detached'));
    }
    if(event.method==='Target.attachedToTarget'&&event.params.targetInfo.type==='service_worker')
      track(attach(event.params).catch(fail));
  });
  await browser.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter});
  await Promise.allSettled([...pending]);if(failure)throw failure;
  assert.equal(owned.filter(i=>i.attachment.targetInfo.targetId===old.targetId).length,1,'One existing matching native SW session required');
  gate.armedAt=new Date().toISOString();
  return {
    expectReplacement(){expecting=true;gate.stopExpectedAt=new Date().toISOString();},
    async afterPhysicalStop(stop) {
      assert.equal(stop.versionStopped.runningStatus,'stopped');assert.equal(stop.versionStopped.scriptURL,old.url);
      assert.equal(stop.targetAbsent,true);
      assert(gate.nativeEvents.some(e=>e.event.method==='Inspector.targetCrashed'));
      assert(!(await browser.send('Target.getTargets')).targetInfos.some(t=>t.targetId===old.targetId));
      gate.retiredSessions=[];
      for(const item of owned.filter(i=>i.attachment.targetInfo.targetId===old.targetId&&!i.detached)){
        await browser.send('Target.detachFromTarget',{sessionId:item.attachment.sessionId});
        item.detached=true;item.client.close();
        gate.retiredSessions.push({sessionId:item.attachment.sessionId,targetId:old.targetId,at:new Date().toISOString(),afterNativeStop:true});
      }
    },
    async wait(){return until(()=>{if(failure)throw failure;return replacement;},'gated fresh native SW context');},
    assertCoverage(){if(failure)throw failure;if(gate.status!=='OBSERVED')throw missing('Pre-execution recovery KV coverage incomplete');
      assert(gate.nativeEvents.some(e=>e.event.method==='Inspector.targetCrashed'),'Actual old native worker termination required');
      assert(!oldContexts.some(c=>c.uniqueId===gate.executionContext.uniqueId));},
    async close(){
      closing=true;gate.coverageEndedAt=new Date().toISOString();
      for(const item of owned){
        if(item.detached)continue;
        if(item.tracer)await item.tracer.close();
        for(const id of [item.startupBreakpoint,item.tracer?null:item.breakpointId].filter(Boolean))
          await item.client.send('Debugger.removeBreakpoint',{breakpointId:id}).catch(()=>{});
        if(item.debuggerEnabled)await item.client.send('Debugger.disable').catch(()=>{});
        await item.client.send('Runtime.runIfWaitingForDebugger').catch(()=>{});
      }
      await browser.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true}).catch(()=>{});
      off();await Promise.allSettled([...pending]);
      for(const item of owned){if(!item.detached)await browser.send('Target.detachFromTarget',{sessionId:item.attachment.sessionId}).catch(()=>{});item.client.close();}
    }
  };
}
