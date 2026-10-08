import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {encodeValue,decodeValue} from '../../src/platform/page-port/codec.js';
import {discoverNativeFrameworkKvWrite,assertSdk004OriginalStorageOracle,assertSdk005OriginalStorageOracle} from './k5-sdk-original-storage.mjs';

const unavailable=(message,actual)=>Object.assign(new Error(message),{code:'E_NATIVE_OBSERVATION_UNAVAILABLE',actual});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function discoverNativeBrokerPending(source) {
  const ast=parse(source,{ecmaVersion:'latest',locations:true}),entries=[];
  function visit(node,ancestors=[]){
    if(!node?.type)return;entries.push({node,ancestors});
    for(const [key,value] of Object.entries(node))if(!['loc','start','end'].includes(key)){
      if(Array.isArray(value))for(const child of value)visit(child,[...ancestors,node]);
      else if(value?.type)visit(value,[...ancestors,node]);
    }
  }
  visit(ast);
  const candidates=entries.filter(({node})=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.property.name==='set'&&node.callee.object.type==='Identifier'&&node.arguments[0]?.type==='MemberExpression'&&node.arguments[0].property.name==='opKey'&&node.arguments[0].object.type==='Identifier');
  assert.equal(candidates.length,1,'Unique real SDK broker pending.set(operation.opKey) required');
  const {node,ancestors}=candidates[0],fn=ancestors.toReversed().find(n=>n.async&&['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type));
  assert(fn,'SDK request must be async');
  const admission=entries.filter(e=>e.ancestors.includes(fn)&&e.node.type==='CallExpression'&&e.node.callee.type==='MemberExpression'&&e.node.callee.property.name==='admitSdk');
  assert.equal(admission.length,1);assert.equal(admission[0].node.arguments[0].type,'Identifier');
  const map=node.callee.object.name,operation=node.arguments[0].object.name,request=admission[0].node.arguments[0].name;
  assert(entries.some(e=>e.node.type==='VariableDeclarator'&&e.node.id.name===map&&e.node.init?.type==='NewExpression'&&e.node.init.callee.name==='Map'));
  for(const method of ['get','delete'])assert(entries.some(e=>e.ancestors.includes(fn)&&e.node.type==='CallExpression'&&e.node.callee.type==='MemberExpression'&&e.node.callee.object.name===map&&e.node.callee.property.name===method&&source.slice(e.node.arguments[0]?.start,e.node.arguments[0]?.end)===`${operation}.opKey`));
  return {location:{lineNumber:node.loc.start.line-1,columnNumber:node.loc.start.column},callLocation:{lineNumber:node.callee.property.loc.start.line-1,columnNumber:node.callee.property.loc.start.column},endLocation:{lineNumber:node.loc.end.line-1,columnNumber:node.loc.end.column},mapExpression:map,operationExpression:operation,requestExpression:request,text:source.slice(node.start,node.end)};
}

async function observeStorage({first,traffic,extensionId,extension,key,holdFirstWrite,until}) {
  const client=first.workerClient,source=await readFile(extension+'/sw.js','utf8'),nativePoint=discoverNativeFrameworkKvWrite(source).nativePut,brokerPoint=discoverNativeBrokerPending(source);
  await client.send('Debugger.enable');
  const script=await until(()=>traffic.filter(row=>row.endpoint===first.workerTargetId&&row.message?.method==='Debugger.scriptParsed').map(row=>row.message.params).find(row=>row.url===`chrome-extension://${extensionId}/sw.js`),'Real compiled SDK worker script');
  const loaded=await client.send('Debugger.getScriptSource',{scriptId:script.scriptId});assert.equal(sha(loaded.scriptSource),sha(source));
  const breakpoints=[],tasks=new Set(),errors=[],writes=[];let mapHandle,mapIdentity,mapBreakpoint,writeBreakpoint,releaseWrite,blocked;
  const blockedPromise=new Promise(resolve=>blocked=resolve);
  const pausedRead=async(frame,expression,byValue=true)=>{
    const r=await client.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression,returnByValue:byValue,throwOnSideEffect:true});
    if(r.exceptionDetails)throw unavailable('Read-only SDK callFrame observation failed',r);return r.result;
  };
  const detach=client.onEvent(event=>{
    if(event.method!=='Debugger.paused')return;
    const ids=event.params.hitBreakpoints??[];
    if(!ids.some(id=>id===mapBreakpoint||id===writeBreakpoint))return;
    const task=(async()=>{
      try{
        const frame=event.params.callFrames[0];assert.equal(frame.location.scriptId,script.scriptId);
        if(ids.includes(mapBreakpoint)){
          const value=await pausedRead(frame,`({request:${brokerPoint.requestExpression},operation:${brokerPoint.operationExpression}})`);
          assert.equal(value.value.request.method,'APPSTORAGE_SETITEM');assert.equal(value.value.request.args.key,key);
          mapIdentity={...value.value,at:Date.now(),location:frame.location};
          const handle=await pausedRead(frame,brokerPoint.mapExpression,false);assert.equal(handle.subtype,'map');assert(handle.objectId);mapHandle=handle.objectId;
          await client.send('Debugger.removeBreakpoint',{breakpointId:mapBreakpoint});
        }
        if(ids.includes(writeBreakpoint)){
          const {storeExpression:s,valueExpression:v,keyExpression:k}=nativePoint;
          const value=await pausedRead(frame,`({store:${s},value:${v},key:${k}})`);
          assert.equal(value.value.store,'frameworkKV');assert.equal(value.value.value.tag,'framework-kv');assert.equal(value.value.value.key,key);
          writes.push({...value.value,at:Date.now(),location:frame.location,verifiedNativeCall:nativePoint.text});
          if(holdFirstWrite&&writes.length===1){
            const gate=new Promise(resolve=>releaseWrite=resolve);blocked(writes[0]);await gate;
          }
        }
      }catch(error){errors.push(error);if(releaseWrite)releaseWrite();}
      finally{await client.send('Debugger.resume').catch(error=>errors.push(error));}
    })();tasks.add(task);task.finally(()=>tasks.delete(task)).catch(error=>errors.push(error));
  });
  async function set(point,condition){
    const possible=await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId:script.scriptId,...point.location},end:{scriptId:script.scriptId,...point.endLocation}});
    const location=point.callLocation;
    const exact=possible.locations.filter(l=>l.lineNumber===location.lineNumber&&l.columnNumber===location.columnNumber&&l.type==='call');
    if(exact.length!==1)throw unavailable('Exact real native call breakpoint unavailable',{point,possible});
    const r=await client.send('Debugger.setBreakpoint',{location:{scriptId:script.scriptId,...location},condition});
    assert.deepEqual(r.actualLocation,{scriptId:script.scriptId,...location});breakpoints.push(r.breakpointId);return r.breakpointId;
  }
  try{
    mapBreakpoint=await set(brokerPoint,`${brokerPoint.requestExpression}.method==='APPSTORAGE_SETITEM'&&${brokerPoint.requestExpression}.args.key===${JSON.stringify(key)}`);
    writeBreakpoint=await set(nativePoint,`${nativePoint.storeExpression}==='frameworkKV'&&${nativePoint.valueExpression}.key===${JSON.stringify(key)}`);
  }catch(error){detach();for(const breakpointId of breakpoints)await client.send('Debugger.removeBreakpoint',{breakpointId}).catch(()=>{});await client.send('Debugger.disable');throw error;}
  return {
    writes,errors,points:{nativePoint,brokerPoint,scriptId:script.scriptId,sourceSha256:sha(source)},
    async waitBlocked(){let ready;blockedPromise.then(value=>ready=value);return until(()=>ready,'Actual first frameworkKV native write paused',12000);},
    resume(){assert(releaseWrite,'Actual first write must be paused');releaseWrite();releaseWrite=null;},
    async finish(){await Promise.all([...tasks]);assert.equal(errors.length,0,errors.map(e=>e.message).join('; '));assert(mapHandle,'Actual broker pending Map handle required');
      const r=await client.send('Runtime.callFunctionOn',{objectId:mapHandle,functionDeclaration:'function(){return this.size}',returnByValue:true,throwOnSideEffect:true});
      if(r.exceptionDetails)throw unavailable('Actual broker pending Map read failed',r);
      return {pending:r.result.value,mapIdentity,mapHandleReadOnly:true};
    },
    async dispose(){if(releaseWrite)releaseWrite();await Promise.all([...tasks]);detach();for(const breakpointId of breakpoints)await client.send('Debugger.removeBreakpoint',{breakpointId}).catch(()=>{});if(mapHandle)await client.send('Runtime.releaseObject',{objectId:mapHandle}).catch(()=>{});await client.send('Debugger.disable');}
  };
}

function boundRows(snapshot,payload,nativeWrites,brokerDiagnostics) {
  const operations=snapshot.data.commandJournal.filter(r=>r.value.tag==='sdk-operation'&&r.value.requestId===payload.requestId);assert.equal(operations.length,1);
  const op=operations[0].value;assert.equal(op.method,'APPSTORAGE_SETITEM');assert.equal(op.state,'durable');assert.equal(op.deliveryState,'response_ready');
  const results=snapshot.data.results.filter(r=>r.value.resultId===op.resultId&&r.value.opId===op.opId&&r.value.requestDigest===op.requestDigest);assert.equal(results.length,1);assert.equal(results[0].value.state,'durable');
  const runs=snapshot.data.runs.filter(r=>r.value.runId===op.runId||r.value.tag==='slot');assert.equal(runs.filter(r=>r.value.tag==='sdk-service').length,1);
  assert.equal(brokerDiagnostics.mapIdentity.request.requestId,payload.requestId);assert.equal(brokerDiagnostics.mapIdentity.operation.opKey,op.opKey);
  assert(nativeWrites.every(w=>w.value.namespace===op.namespace&&w.value.area==='app-storage'));
  const admittedAt=Date.parse(op.admittedAt);assert(Number.isFinite(admittedAt));
  assert(op.deadlineAt<=payload.deadlineAt&&op.deadlineAt>admittedAt&&op.deadlineAt<=admittedAt+15000);
  return {operation:op,rows:{commandJournal:operations,results,runs},stored:snapshot.data.frameworkKV.filter(r=>r.value.namespace===op.namespace&&r.value.area==='app-storage'&&r.value.key===decodeValue(payload.argsWire).key)};
}

function decodedReply(reply){assert.equal(reply.ok,true);assert(reply.data?.valueWire);const decoded=decodeValue(reply.data.valueWire);assert.equal(decoded.PageBrigeCode,0);assert(Object.hasOwn(decoded,'data'));return decoded;}
export async function runOriginalStorageCases({first,caseRun,ids,seed,traffic,extensionId,extension,until}) {
  for(const id of ids)await caseRun(id,async()=>{
    const key=`${seed}-${id}`,isConcurrent=id==='F2-K2-SDK-004';
    const observer=await observeStorage({first,traffic,extensionId,extension,key,holdFirstWrite:isConcurrent,until});let remote;
    try{
      const invocation=await first.startPublic('APPSTORAGE_SETITEM',{key,value:isConcurrent?false:0}),payload=invocation.payload;assert(payload,'Original public request required');
      let burst,concurrencyProof;
      if(isConcurrent){
        const paused=await observer.waitBlocked();remote=await first.startNativeBurst(payload,99);assert(remote.issuedAt>=paused.at);
        observer.resume();burst=await first.awaitNativeBurst(remote);remote=null;
        concurrencyProof={originalPublicCalls:1,duplicateRelayMessages:99,totalConcurrentSameId:100,firstNativeWritePausedBeforeBurst:true,awaitPromiseAfterResume:true,paused,burstIssuedAt:burst.issuedAt};
      }
      const original=await first.publicCompletion(invocation);assert.equal(original.publicResponse.ok,true);assert.equal(original.settlement.settlements,1);
      const brokerDiagnostics=await observer.finish();assert.equal(brokerDiagnostics.pending,0);
      let argsConflict,deadlineConflict,readback;
      if(!isConcurrent){
        assert(Date.now()<payload.deadlineAt,'Conflicts must execute within the original live deadline');
        argsConflict=await first.native({...payload,argsWire:encodeValue({key,value:1})});
        deadlineConflict=await first.native({...payload,deadlineAt:payload.deadlineAt+1});
        readback=await first.publicCall('APPSTORAGE_GETITEM',{key});assert.equal(readback.publicResponse.ok,true);
      }
      const snapshot=await first.snapshot(),binding=boundRows(snapshot,payload,observer.writes,brokerDiagnostics);
      assert.equal(binding.stored.length,1);assert.equal(decodeValue(binding.stored[0].value.valueWire),isConcurrent?'false':'0');
      const facts={caseId:id,original,payload,nativeWrites:observer.writes,brokerDiagnostics,rows:binding.rows,binding,observerPoints:observer.points,
        ...(isConcurrent?{decodedReplies:[decodedReply(original.nativeResponse),...burst.replies.map(decodedReply)],replyValueWires:[original.nativeResponse.data.valueWire,...burst.replies.map(reply=>reply.data.valueWire)],concurrencyProof}:{argsConflict,deadlineConflict,readback:{data:readback.publicResponse.value},publicReadback:readback}),formalAccepted:false};
      if(isConcurrent)assertSdk004OriginalStorageOracle(facts);else assertSdk005OriginalStorageOracle(facts);
      return facts;
    }finally{if(remote)await first.releaseNativeBurst(remote).catch(()=>{});await observer.dispose();}
  });
}
