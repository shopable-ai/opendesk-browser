import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {encodeValue,decodeValue} from '../../src/platform/page-port/codec.js';
import {discoverNativeChromeCall,discoverSessionNativeChromeCalls,assertSdk007OriginalSessionOracle,assertSdk009OriginalSessionOracle,assertSdk019OriginalSessionOracle} from './k5-sdk-original-session.mjs';
import {armNativeRecoveryGate} from './b05-native-recovery-gate.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const unavailable=(message,actual)=>Object.assign(new Error(message),{code:'E_NATIVE_OBSERVATION_UNAVAILABLE',actual});
const projectError=e=>({name:e.name,message:e.message,code:e.code,actual:e.actual});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const value={present:undefined,zero:0,no:false,list:[undefined,null]};

export function bindSessionRows(snapshot,payload) {
  const operations=snapshot.data.commandJournal.filter(r=>r.value.tag==='sdk-operation'&&r.value.requestId===payload.requestId);
  assert.equal(operations.length,1);const operation=operations[0].value;
  const results=snapshot.data.results.filter(r=>r.value.tag==='sdk-result'&&r.value.resultId===operation.resultId);
  const runs=snapshot.data.runs.filter(r=>r.value.runId===operation.runId);
  assert.equal(runs.length,1);assert.equal(operation.method,'APPLOCAL_SETITEM');
  assert.equal(typeof operation.grantIncarnation,'string');assert(operation.grantIncarnation);
  const admittedAt=Date.parse(operation.admittedAt);assert(Number.isFinite(admittedAt));
  assert(operation.deadlineAt<=payload.deadlineAt&&operation.deadlineAt<=admittedAt+15000);
  return {operation,result:results[0]?.value,run:runs[0].value,rows:{commandJournal:operations,results,runs},results};
}

async function observeSession({client,scriptId,source,key,evidence,holdCallback,preinstalled,recovery=false}) {
  const api=discoverNativeChromeCall(source),session=discoverSessionNativeChromeCalls(source);
  const tasks=new Set(),errors=[],breakpoints=[];let failure,callId=preinstalled?.breakpointId,callbackId,releaseHold,blocked,closingForTermination=false,actualCallLocation=preinstalled?.actualLocation;
  const waitBlocked=new Promise(resolve=>blocked=resolve);
  const read=async(frame,expression)=>{
    const r=await client.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression,returnByValue:true,throwOnSideEffect:true});
    if(r.exceptionDetails)throw unavailable('Actual native session callback frame read failed',r);return r.result;
  };
  const on=client.onEvent??client.on;
  const off=on(event=>{
    if(event.method!=='Debugger.paused')return;
    const ids=event.params.hitBreakpoints??[];if(!ids.includes(callId)&&!ids.includes(callbackId))return;
    const task=(async()=>{
      let held=false;
      try {
        const frame=event.params.callFrames[0];assert.equal(frame.location.scriptId,scriptId);
        if(ids.includes(callId)) {
          const f=api.frameIdentity;
          // Read locals only. Chrome's storage.session getter is rejected by V8's
          // side-effect guard; exact bundled APPLOCAL caller frames bind the area.
          const observed=(await read(frame,`({method:${f.methodExpression},args:${f.argsExpression}})`)).value;
          if(observed.method==='set') {
            const entries=Object.entries(observed.args[0]);assert.equal(entries.length,1);
            const [nativeKey,stored]=entries[0];
            const binding=nativeKey.startsWith('framework-session:')?JSON.parse(nativeKey.slice('framework-session:'.length)):null;
            if(Array.isArray(binding)&&binding.length===3&&binding[2]===key) {
              assert.deepEqual(decodeValue(stored),value);
              const caller=event.params.callFrames.find(f=>f.location.scriptId===scriptId&&f.location.columnNumber>=session.calls.set.range[0]&&f.location.columnNumber<session.calls.set.range[1]);
              if(!caller)throw unavailable('Native session set must bind exact APPLOCAL caller site',event.params);
              const call={area:'storage.session',method:'set',nativeKey,nativeBinding:binding,valueWire:stored,at:Date.now(),location:frame.location,callerSite:caller.location,callerSiteRange:session.calls.set.range,recovery};
              evidence.nativeCalls.push(call);if(recovery)evidence.postRecoveryNativeCalls.push(call);
              evidence.dispatchObserved={...call,keyMatched:true,outstandingTargetSetCount:1};
            }
          }
        }
        if(ids.includes(callbackId)&&holdCallback&&evidence.nativeCalls.length===1&&!evidence.callbackEnteredBeforeReceipt) {
          const chains=[];for(let s=event.params.asyncStackTrace;s;s=s.parent)chains.push(s);
          const native=chains.find(s=>s.description===session.actualSetCallbackBinding.expectedAsyncStackTraceDescription);
          if(native) {
            const caller=native.callFrames.find(f=>f.url===evidence.workerUrl&&f.columnNumber>=session.calls.set.range[0]&&f.columnNumber<session.calls.set.range[1]);
            if(!caller)throw unavailable('Real native session callback lacks exact APPLOCAL async caller site',event.params);
            const result=await read(frame,api.callbackEntry.valueExpression);assert.equal(result.type,'undefined');
            const observation={entered:true,at:Date.now(),asyncStackTraceDescription:native.description,callbackEntryRange:api.callbackEntry.range,callerSiteRange:session.calls.set.range,location:frame.location,callbackValueKind:result.type,asyncStackTrace:event.params.asyncStackTrace};
            evidence.callbackEnteredBeforeReceipt=observation;held=true;
            const gate=new Promise(resolve=>releaseHold=resolve);blocked(observation);await gate;
          }
        }
      }catch(error){failure=error;errors.push(projectError(error));}
      finally {if(!closingForTermination&&(!held||!evidence.workerStop?.physicalTerminationObserved))await client.send('Debugger.resume').catch(error=>{if(!evidence.workerStop?.physicalTerminationObserved)errors.push(projectError(error));});}
    })();tasks.add(task);task.finally(()=>tasks.delete(task)).catch(()=>{});
  });
  await client.send('Debugger.setAsyncCallStackDepth',{maxDepth:32});
  if(!callId) {
    const possible=await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId,...api.nativeCall.location},end:{scriptId,...api.nativeCall.callbackLocation},restrictToFunction:true});
    const exact=possible.locations.filter(l=>l.type==='call'&&l.lineNumber===api.nativeCall.location.lineNumber&&l.columnNumber>=api.nativeCall.range[0]&&l.columnNumber<api.nativeCall.callbackLocation.columnNumber);
    if(exact.length!==1)throw unavailable('Exact native chromeCall property call is unavailable',{api,possible});
    actualCallLocation={lineNumber:exact[0].lineNumber,columnNumber:exact[0].columnNumber};
    const installed=await client.send('Debugger.setBreakpoint',{location:{scriptId,...actualCallLocation}});callId=installed.breakpointId;
    assert.deepEqual(installed.actualLocation,{scriptId,...actualCallLocation});
    evidence.nativeCallPossibleLocations=possible.locations;
  }
  breakpoints.push(callId);
  if(holdCallback) {
    const possible=await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId,...api.callbackEntry.location},end:{scriptId,...api.callbackEntry.endLocation},restrictToFunction:true});
    const locations=possible.locations.filter(l=>l.lineNumber===api.callbackEntry.location.lineNumber&&l.columnNumber>=api.callbackEntry.range[0]&&l.columnNumber<api.callbackEntry.range[1]).sort((a,b)=>a.columnNumber-b.columnNumber);
    if(!locations.length)throw unavailable('Native callback first statement has no executable position',{api,possible});
    const installed=await client.send('Debugger.setBreakpoint',{location:{scriptId,lineNumber:locations[0].lineNumber,columnNumber:locations[0].columnNumber}});callbackId=installed.breakpointId;breakpoints.push(callbackId);
    assert.deepEqual(installed.actualLocation,{scriptId,lineNumber:locations[0].lineNumber,columnNumber:locations[0].columnNumber});
    evidence.callbackPossibleLocations=possible.locations;
  }
  evidence.observerPoints={api,session};
  return {point:{...api.nativeCall,location:actualCallLocation},waitBlocked:async()=>{
    for(let i=0;i<200;i++){if(failure)throw failure;if(evidence.callbackEnteredBeforeReceipt)return evidence.callbackEnteredBeforeReceipt;await delay(25);}throw unavailable('Actual storage.session.set callback cut was not observed',evidence);
  },assertHealthy(){if(failure)throw failure;assert.equal(errors.length,0);},
  async close({terminated=false}={}){closingForTermination=terminated;off();for(const id of breakpoints)await client.send('Debugger.removeBreakpoint',{breakpointId:id}).catch(()=>{});releaseHold?.();await Promise.allSettled([...tasks]);if(!terminated)await client.send('Debugger.setAsyncCallStackDepth',{maxDepth:0}).catch(()=>{});}
  };
}

export async function runOriginalSessionCases({first,caseRun,ids,seed,traffic,extensionId,extension,until}) {
  if(!ids.length)return;
  const source=await readFile(extension+'/sw.js','utf8'),api=discoverNativeChromeCall(source);
  for(const caseId of ids)await caseRun(caseId,async()=>{
    await first.refreshWorker();const key=`${seed}-${caseId}`,unknown=!caseId.endsWith('007'),evidence={caseId,workerUrl:`chrome-extension://${extensionId}/sw.js`,nativeCalls:[],postRecoveryNativeCalls:[],frameworkKvWrites:[],formalAccepted:false};
    const client=first.workerClient;await client.send('Debugger.enable');
    const script=await until(()=>traffic.filter(r=>r.endpoint===first.workerTargetId&&r.message?.method==='Debugger.scriptParsed').map(r=>r.message.params).find(s=>s.url===evidence.workerUrl),'Actual original session worker script');
    assert.equal(sha((await client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource),sha(source));
    let observer=await observeSession({client,scriptId:script.scriptId,source,key,evidence,holdCallback:unknown}),recovery;
    try {
      const invocation=await first.startPublic('APPLOCAL_SETITEM',{key,value});evidence.payload=invocation.payload;assert(evidence.payload);
      if(unknown) {
        await observer.waitBlocked();const before=bindSessionRows(await first.snapshot(),evidence.payload);
        assert.equal(before.operation.state,'dispatched');assert(!before.operation.nativeReceiptWire);assert.equal(before.results.length,0);
        evidence.beforeOperation=before.operation;evidence.beforeResults=before.results;
        const storage=(await first.snapshot()).sessionStorage,nativeKey=evidence.nativeCalls[0].nativeKey;
        assert(storage[nativeKey]);evidence.actualEffectReadback={method:'get',nativeKey,valueWire:storage[nativeKey]};
      } else {
        evidence.original=await first.publicCompletion(invocation);observer.assertHealthy();assert.equal(evidence.original.publicResponse.ok,true);
        evidence.setResponse=evidence.original.nativeResponse;
        const before=bindSessionRows(await first.snapshot(),evidence.payload);evidence.rows=before.rows;
        const nativeKey=evidence.nativeCalls[0]?.nativeKey;assert(nativeKey);evidence.persistedValueWire=(await first.snapshot()).sessionStorage[nativeKey];
      }
      observer.assertHealthy();
      // The logical breakpoint must resolve to the exact real native call before replacement code starts.
      const point=observer.point;
      recovery=await armNativeRecoveryGate({browser:{send:(...a)=>first.browserClient.send(...a),on:listener=>first.browserClient.onEvent(listener)},clients:first.observerClients,old:first.workerDescriptor,point,sourceHash:sha(source),evidence,until,projectError,
        traceKv:async(child,scriptId,_evidence,preinstalled)=>observeSession({client:child,scriptId,source,key,evidence,holdCallback:false,preinstalled,recovery:true})});
      await observer.close({terminated:unknown});observer=null;
      await first.stopWorker({recovery,evidence});
      evidence.retryResponse=await first.native(evidence.payload);
      if(unknown)evidence.original=await first.publicCompletion(invocation);
      const after=bindSessionRows(await first.snapshot(),evidence.payload);evidence.afterOperation=after.operation;evidence.afterRun=after.run;evidence.afterRows=after.rows;evidence.afterRetryOperation=after.operation;
      evidence.sameRequestReplayed=true;recovery.assertCoverage();
      if(caseId.endsWith('007'))assertSdk007OriginalSessionOracle(evidence);
      else if(caseId.endsWith('009'))assertSdk009OriginalSessionOracle(evidence);
      else assertSdk019OriginalSessionOracle(evidence);
      return evidence;
    }catch(error){error.actual??=evidence;throw error;}
    finally{if(observer)await observer.close({terminated:!!evidence.workerStop?.physicalTerminationObserved});await recovery?.close();}
  });
}
