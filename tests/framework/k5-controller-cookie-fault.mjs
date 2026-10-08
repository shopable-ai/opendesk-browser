import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';

export const COOKIE_FAULT_IDS=Object.freeze(['COOKIE-NATIVE-SET-FAILURE','COOKIE-NATIVE-REMOVE-FAILURE']);
const member=node=>node?.type==='MemberExpression'?(node.property.name??node.property.value):null;
const fn=node=>['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration'].includes(node?.type);
const sha=source=>createHash('sha256').update(source).digest('hex');
const point=node=>({range:[node.start,node.end],location:{lineNumber:node.loc.start.line-1,columnNumber:node.loc.start.column},
  endLocation:{lineNumber:node.loc.end.line-1,columnNumber:node.loc.end.column}});
const missing=message=>Object.assign(new Error(message),{code:'E_NATIVE_NOT_OBSERVED'});

// Select unchanged product calls, never replace APIs or callback results.
export function discoverCookieFaultPoints(source,method) {
  assert(['set','remove'].includes(method));
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}),entries=[];
  function walk(node,parents=[]) {
    if(!node?.type)return;entries.push({node,parents});
    for(const value of Object.values(node)) {
      if(Array.isArray(value))for(const item of value)walk(item,[...parents,node]);
      else if(value?.type)walk(value,[...parents,node]);
    }
  }
  walk(ast);
  const calls=entries.filter(({node})=>node.type==='CallExpression'&&member(node.callee)===method&&
    member(node.callee.object)==='cookies'&&node.arguments.length===2&&fn(node.arguments[1])&&
    node.arguments[0]?.type==='ObjectExpression'&&node.arguments[0].properties.some(p=>p.key?.name==='storeId'));
  if(calls.length!==1)throw missing('Unique product scoped native cookie call is absent');
  const call=calls[0].node,callback=call.arguments[1];
  const errors=entries.filter(({node,parents})=>member(node)==='lastError'&&parents.includes(callback)&&
    [...parents].reverse().find(fn)===callback);
  if(errors.length!==1)throw missing('Unique native callback lastError observation is absent');
  const runtime=errors[0].node.object;
  assert.equal(member(runtime),'runtime');
  const callbackValue=callback.params[0];
  assert.equal(callbackValue?.type,'Identifier');
  const properties=call.arguments[0].properties;
  assert.equal(properties.length,2);
  const details=properties.find(p=>p.type==='SpreadElement')?.argument;
  const storeId=properties.find(p=>p.key?.name==='storeId')?.value;
  assert.equal(details?.type,'Identifier');assert.equal(storeId?.type,'Identifier');
  return {sourceHash:sha(source),method,submission:point(call),callback:point(errors[0].node),callbackRange:[callback.start,callback.end],
    detailsExpression:details.name,storeIdExpression:storeId.name,
    submissionExpression:source.slice(call.arguments[0].start,call.arguments[0].end),
    errorExpression:source.slice(errors[0].node.start,errors[0].node.end),callbackValueExpression:callbackValue.name};
}

// Inspect data descriptors without executing object spread, accessors or native getters.
export function cookieDetailsFromProperties(properties,storeId) {
  const details={};
  for(const property of properties) {
    if(!property.enumerable)continue;
    if(property.get||property.set||!property.value)throw missing('Cookie details must contain only own data properties');
    const value=property.value;
    if(value.objectId||!['string','number','boolean','undefined','object'].includes(value.type)||
      (value.type==='object'&&value.subtype!=='null')||value.unserializableValue)
      throw missing('Cookie details contain an unobservable value');
    Object.defineProperty(details,property.name,{value:value.type==='undefined'?undefined:value.value,enumerable:true,writable:true,configurable:true});
  }
  assert.equal(typeof storeId,'string');details.storeId=storeId;return details;
}

export function discoverCookieLastErrorPoint(source) {
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}),entries=[];
  function walk(node,parents=[]) {if(!node?.type)return;entries.push({node,parents});for(const value of Object.values(node)) {
    if(Array.isArray(value))for(const child of value)walk(child,[...parents,node]);else if(value?.type)walk(value,[...parents,node]);}}
  walk(ast);
  const candidates=[];
  for(const {node,parents} of entries.filter(({node})=>node.type==='VariableDeclarator'&&node.id.type==='Identifier')) {
    const init=node.init?.type==='ChainExpression'?node.init.expression:node.init;
    if(member(init)!=='lastError')continue;
    const owner=[...parents].reverse().find(fn);
    const throws=entries.filter(({node:throwNode,parents:throwParents})=>throwNode.type==='ThrowStatement'&&
      [...throwParents].reverse().find(fn)===owner&&throwNode.argument?.type==='CallExpression'&&
      throwNode.argument.arguments[0]?.value==='E_CHROME'&&member(throwNode.argument.arguments[1])==='message'&&
      throwNode.argument.arguments[1].object.name===node.id.name);
    if(throws.length!==1)continue;
    const enclosingTry=[...throws[0].parents].reverse().find(p=>p.type==='TryStatement');
    const caught=enclosingTry?.handler;
    if(caught?.param?.type!=='Identifier')continue;
    const rejections=entries.filter(({node:call,parents:callParents})=>call.type==='CallExpression'&&
      callParents.includes(caught)&&call.arguments.length===1&&call.arguments[0].type==='Identifier'&&
      call.arguments[0].name===caught.param.name);
    if(rejections.length===1)candidates.push({point:point(rejections[0].node),expression:caught.param.name,
      nativeThrow:point(throws[0].node)});
  }
  if(candidates.length!==1)throw missing('Unique product-copied native error rejection is absent');
  return candidates[0];
}

function positionInside(location,range,source) {
  const lines=source.split('\n');
  const offset=lines.slice(0,location.lineNumber).reduce((n,line)=>n+line.length+1,0)+location.columnNumber;
  return offset>=range[0]&&offset<range[1];
}
export function selectCookieFaultBreakpoint(locations,scriptId,point,source) {
  const exact=locations.filter(l=>l.scriptId===scriptId&&l.lineNumber===point.location.lineNumber&&l.columnNumber===point.location.columnNumber&&positionInside(l,point.range,source));
  if(exact.length===1)return {scriptId,lineNumber:exact[0].lineNumber,columnNumber:exact[0].columnNumber};
  const inside=locations.filter(l=>l.scriptId===scriptId&&positionInside(l,point.range,source));
  if(inside.length!==1)throw missing('Unique breakpoint within selected native call/lastError AST range is absent');
  return {scriptId,lineNumber:inside[0].lineNumber,columnNumber:inside[0].columnNumber};
}

export function selectCookieCallbackFrame(frames,scriptId,range,source) {
  const selected=frames.filter(frame=>frame.location.scriptId===scriptId&&positionInside(frame.location,range,source));
  assert(selected.length<=1,'Cookie callback stack must have a unique selected invocation');
  return selected[0]??null;
}
export async function installCookieFaultObserver({client,source,method,until,onSubmission,record}) {
  const selector=discoverCookieFaultPoints(source,method),lastError=discoverCookieLastErrorPoint(source),scripts=[],evidence={selector,lastError,submissions:[],callbacks:[],nativeErrors:[],unrelatedRejections:[],errors:[]};
  const breakpoints=[];let handling=Promise.resolve(),closed=false;
  client.onEvent(event=>{
    if(closed)return;
    if(event.method==='Debugger.scriptParsed')scripts.push(event.params);
  });
  await client.send('Debugger.enable');
  const script=await until(()=>scripts.find(row=>row.url.endsWith('/sw.js')),'cookie observer product sw script');
  const actual=(await client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource;
  assert.equal(sha(actual),selector.sourceHash,'Observer must bind actual unchanged product SW bytes');
  for(const kind of ['submission','callback','nativeError']) {
    const selected=kind==='nativeError'?lastError.point:selector[kind];
    const possible=(await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId:script.scriptId,...selected.location},
      end:{scriptId:script.scriptId,...selected.endLocation},restrictToFunction:true})).locations;
    const location=selectCookieFaultBreakpoint(possible,script.scriptId,selected,source);
    const installed=await client.send('Debugger.setBreakpoint',{location});
    assert.deepEqual(installed.actualLocation,location);
    breakpoints.push({kind,...installed,requestedLocation:location});
  }
  evidence.breakpoints=breakpoints;
  async function read(frame,expression) {
    const result=await client.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression,
      returnByValue:true,throwOnSideEffect:true,silent:true});
    if(result.exceptionDetails)throw missing('Readonly native cookie observation failed: '+JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function readDetails(frame) {
    const binding=await client.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,
      expression:selector.detailsExpression,returnByValue:false,throwOnSideEffect:true,silent:true});
    if(binding.exceptionDetails||!binding.result.objectId)throw missing('Readonly cookie details binding unavailable');
    const properties=await client.send('Runtime.getProperties',{objectId:binding.result.objectId,ownProperties:true,generatePreview:false});
    if(properties.exceptionDetails)throw missing('Readonly cookie details descriptors unavailable');
    return cookieDetailsFromProperties(properties.result,await read(frame,selector.storeIdExpression));
  }
  async function readCopiedError(frame) {
    const binding=await client.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,
      expression:lastError.expression,returnByValue:false,throwOnSideEffect:true,silent:true});
    if(binding.exceptionDetails||!binding.result.objectId)throw missing('Product-copied error binding unavailable');
    const properties=await client.send('Runtime.getProperties',{objectId:binding.result.objectId,ownProperties:true,generatePreview:false});
    if(properties.exceptionDetails)throw missing('Product-copied error descriptors unavailable');
    const data={};
    for(const name of ['code','message']) {
      const property=properties.result.find(row=>row.name===name);
      if(!property||property.get||property.set||property.value?.type!=='string')throw missing('Product error has no copied '+name);
      data[name]=property.value.value;
    }
    assert.equal(data.code,'E_CHROME');assert(data.message.length>0);
    return {...data,properties:properties.result};
  }
  client.onEvent(event=>{
    if(closed||event.method!=='Debugger.paused')return;
    const hit=breakpoints.find(row=>event.params.hitBreakpoints?.includes(row.breakpointId));
    if(!hit)return;
    handling=handling.then(async()=>{
      try {
        const frame=event.params.callFrames[0],at=Date.now();
        if(hit.kind==='submission') {
          const row={at,method,details:await readDetails(frame),paused:event.params};
          evidence.submissions.push(row);await record(evidence);
          if(onSubmission)row.stimulus=await onSubmission(row);
        } else if(hit.kind==='callback') {
          const row={at,method,lastError:null,
            value:await read(frame,`(${selector.callbackValueExpression} ?? null)`),paused:event.params};
          evidence.callbacks.push(row);
        } else {
          const callbackFrame=selectCookieCallbackFrame(event.params.callFrames,script.scriptId,selector.callbackRange,source);
          if(!callbackFrame) {evidence.unrelatedRejections.push({at,paused:event.params});await record(evidence);return;}
          const copiedError=await readCopiedError(frame),message=copiedError.message;
          assert.equal(evidence.callbacks.length,1);evidence.callbacks[0].lastError=message;
          evidence.nativeErrors.push({at,method,message,copiedError,paused:event.params,cookieCallbackFrame:callbackFrame});
        }
        await record(evidence);
      } catch(error) {evidence.errors.push({code:error.code,message:error.message});await record(evidence);}
      finally {await client.send('Debugger.resume').catch(()=>{});}
    });
  });
  return {evidence,async complete(){await until(()=>evidence.nativeErrors.length||evidence.errors.length,'actual product-copied native cookie lastError');await handling;
    assert.deepEqual(evidence.errors,[]);assert.equal(evidence.submissions.length,1);assert.equal(evidence.callbacks.length,1);
    assert.equal(evidence.nativeErrors.length,1);
    assert.equal(typeof evidence.callbacks[0].lastError,'string');assert(evidence.callbacks[0].lastError.length>0);
    assert.equal(evidence.callbacks[0].value,null);return evidence;},
    async close(){await handling;closed=true;for(const row of breakpoints)await client.send('Debugger.removeBreakpoint',{breakpointId:row.breakpointId}).catch(()=>{});
      await client.send('Debugger.resume').catch(()=>{});await client.send('Debugger.disable').catch(()=>{});}};
}

export function validateCookieFaultJournal({run,result,operations,observer,method}) {
  assert.equal(observer.method??observer.selector.method,method);
  assert.deepEqual(observer.errors,[]);assert.equal(observer.submissions.length,1);assert.equal(observer.callbacks.length,1);
  assert.equal(typeof observer.callbacks[0].lastError,'string');assert(observer.callbacks[0].lastError.length>0);
  assert.equal(observer.callbacks[0].value,null);
  const faultMethod=method==='set'?'setCookie':'deleteCookie';
  const native=operations.filter(op=>['setCookie','deleteCookie'].includes(op.envelope?.operation.method));
  assert.equal(native.length,1,'A caught native failure must fence the following write before submission');
  const operation=native[0];assert.equal(operation.envelope.operation.method,faultMethod);
  assert.equal(operation.submissionCount,1);assert.equal(operation.state,'effect_unknown');
  assert.equal(operation.deliveryState,'fenced');assert.equal(operation.runId,run.runId);
  assert.equal(operation.envelope.identity.runId,run.runId);
  assert.equal(operation.envelope.identity.ownerEpoch,run.identity.ownerEpoch);
  assert.equal(operation.envelope.target.tabId,run.target.tabId);
  assert.equal(operation.envelope.target.frameId,run.target.frameId);
  assert.equal(operation.envelope.target.documentId,run.target.documentId);
  assert.equal(operation.envelope.revision.sourceHash,run.revision.sourceHash);
  assert.equal(operation.envelope.revision.revision,run.revision.revision);
  assert(!operation.nativeReceipts?.some(row=>row.stage===`cookies.${method}`),'Failed native call must not gain a successful effect receipt');
  assert(!operation.reply?.value,'Native failure must not become a successful value');
  assert.equal(run.retirementState,'released');assert.equal(run.workerRetired,true);
  assert.equal(result.tag,'controller-result');assert.equal(result.runId,run.runId);assert.equal(result.resultId,run.resultId);
  assert.equal(result.revision.sourceHash,run.revision.sourceHash);
  assert.equal(result.revision.revision,run.revision.revision);
  return {nativeLastError:true,effectUnknown:true,submissionCount:1,noFollowingWrite:true,workerRetired:true,retirementReleased:true,formalAccepted:false};
}
