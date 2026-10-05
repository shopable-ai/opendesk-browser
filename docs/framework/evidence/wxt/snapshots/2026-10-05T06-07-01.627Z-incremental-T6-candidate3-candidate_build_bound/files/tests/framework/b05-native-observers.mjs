import assert from 'node:assert/strict';
import {parse} from 'acorn';

const functionNode = node => ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node?.type);
const member = node => node?.type === 'MemberExpression' ? node.property.name ?? node.property.value : null;
const location = node => ({lineNumber:node.loc.start.line-1,columnNumber:node.loc.start.column});
const point = (node,extra={}) => ({range:[node.start,node.end],location:location(node),
  endLocation:{lineNumber:node.loc.end.line-1,columnNumber:node.loc.end.column},...extra});

// These selectors consume the actual unchanged bundle, including minified local
// names. Absence/ambiguity is a missing observation, never a neighbouring offset.
export function discoverStorageObservations(source) {
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}),entries=[];
  function walk(node,ancestors=[]) {
    if(!node?.type)return;
    entries.push({node,ancestors});
    for(const value of Object.values(node)) {
      if(Array.isArray(value))for(const child of value)walk(child,[...ancestors,node]);
      else if(value?.type)walk(value,[...ancestors,node]);
    }
  }
  walk(ast);
  const result={points:{},unavailable:{}};
  const anchors=entries.filter(({node})=>node.type==='Literal'&&node.value==='Storage result is not successful');
  if(anchors.length===1) {
    const fn=[...anchors[0].ancestors].reverse().find(functionNode);
    const direct=entries.filter(({ancestors})=>[...ancestors].reverse().find(functionNode)===fn);
    const transactions=direct.filter(({node})=>node.type==='VariableDeclarator'&&node.init?.type==='AwaitExpression'&&
      member(node.init.argument?.callee)==='transaction'&&node.init.argument.arguments[1]?.value==='readwrite');
    if(transactions.length===1) {
      const declaration=transactions[0].node,tx=declaration.init.argument;
      const post=direct.filter(({node})=>node.type==='AwaitExpression'&&node.start>tx.end&&node.start<anchors[0].node.start);
      if(post.length===1&&post[0].node.argument?.type==='CallExpression'&&post[0].node.argument.arguments[0]?.type==='Identifier') {
        result.points.storageDurable=point(post[0].node.argument,{text:source.slice(post[0].node.argument.start,post[0].node.argument.end),
          resultExpression:declaration.id.name,contextExpression:post[0].node.argument.arguments[0].name,senderExpression:null});
      }
    }
  }
  if(!result.points.storageDurable)result.unavailable.storageDurable='Unique post-storage-transaction/pre-broker-return authorization call absent';

  const nativePuts=entries.filter(({node})=>node.type==='CallExpression'&&member(node.callee)==='put'&&
    node.callee.object.type==='CallExpression'&&node.arguments.length===2&&node.arguments.every(x=>x.type==='Identifier'));
  if(nativePuts.length===1) {
    const entry=nativePuts[0],
      transactionFn=[...entry.ancestors].reverse().filter(functionNode).find(fn=>entries.some(({node,ancestors})=>
        ancestors.includes(fn)&&node.type==='Literal'&&node.value==='@storage-keepalive'));
    const calls=entries.filter(({node,ancestors})=>ancestors.includes(transactionFn)&&node.type==='VariableDeclarator'&&member(node.init?.callee)==='action');
    if(calls.length===1) {
      const request=calls[0].node,body=[...calls[0].ancestors].reverse().find(node=>node.type==='BlockStatement');
      const statements=entries.filter(({node,ancestors})=>ancestors.includes(body)&&node.start>request.end&&node.type==='AssignmentExpression'&&
        node.left.object?.name===request.id.name&&member(node.left)==='onsuccess');
      const store=entry.node.callee.object.arguments[0];
      if(statements.length===1&&store?.type==='Identifier')result.points.nativeKvSubmission=point(statements[0].node,{
        text:source.slice(statements[0].node.start,statements[0].node.end),
        requestExpression:request.id.name,actionExpression:source.slice(request.init.callee.start,request.init.callee.end),
        closureBindings:{store:store.name,value:entry.node.arguments[0].name,key:entry.node.arguments[1].name},senderExpression:null});
    }
  }
  if(!result.points.nativeKvSubmission)result.unavailable.nativeKvSubmission='Native IDB put/post-action request registration is absent or ambiguous';
  return result;
}

export class MissingObservation extends Error {constructor(message){super(message);this.code='E_NATIVE_NOT_OBSERVED';}}
export function exactBreakpointLocation(point,locations,scriptId) {
  const exact=locations.filter(row=>row.scriptId===scriptId&&row.lineNumber===point.location.lineNumber&&
    row.columnNumber===point.location.columnNumber);
  if(exact.length!==1||point.breakpointType&&exact[0].type!==point.breakpointType)
    throw new MissingObservation('Unique exact native breakpoint with the required type unavailable; no relocation');
  return exact[0];
}

export function requireFreshWorkerContext(script,contexts,oldContexts) {
  const context=contexts.find(row=>row.id===script.executionContextId);
  if(!oldContexts.length||oldContexts.some(row=>typeof row.uniqueId!=='string'||!row.uniqueId)||
      typeof context?.uniqueId!=='string'||!context.uniqueId||oldContexts.some(row=>row.uniqueId===context.uniqueId))
    throw new MissingObservation('Fresh native worker execution-context unique ID unavailable');
  return context;
}

export async function readFrame(client,frame,expression,returnByValue=true) {
  const result=await client.send('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression,
    returnByValue,throwOnSideEffect:true,silent:true});
  if(result.exceptionDetails)throw new MissingObservation(`Readonly frame observation unavailable: ${JSON.stringify(result.exceptionDetails)}`);
  return returnByValue?result.result.value:result.result;
}
async function properties(client,objectId) {
  const result=await client.send('Runtime.getProperties',{objectId,ownProperties:true});
  if(result.exceptionDetails)throw new MissingObservation('Readonly closure properties unavailable');
  return result;
}

// Called only after the product's own item.action() has returned a native request.
// It adds no request, observer database write, wrapper, or product instrumentation.
export async function inspectNativeKvSubmission(client,paused,selector) {
  const frame=paused.callFrames[0],request=await readFrame(client,frame,selector.requestExpression,false);
  if(request.className!=='IDBRequest'||!request.objectId)throw new MissingObservation('Product native IDBRequest unavailable');
  const native=await readFrame(client,frame,`({sourceClass:${selector.requestExpression}.source?.constructor?.name,
    store:${selector.requestExpression}.source?.name,mode:${selector.requestExpression}.transaction?.mode,
    database:${selector.requestExpression}.transaction?.db.name,readyState:${selector.requestExpression}.readyState})`);
  if(native.store!=='frameworkKV')return null;
  assert.equal(native.sourceClass,'IDBObjectStore');assert.equal(native.mode,'readwrite');assert.equal(native.database,'opendesk-browser');
  const action=await readFrame(client,frame,selector.actionExpression,false);
  const scopes=(await properties(client,action.objectId)).internalProperties?.find(row=>row.name==='[[Scopes]]')?.value;
  if(!scopes?.objectId)throw new MissingObservation('Native put closure scopes unavailable');
  const observations=[];
  for(const scope of (await properties(client,scopes.objectId)).result.filter(row=>/^\d+$/.test(row.name)&&row.value?.objectId)) {
    const rows=(await properties(client,scope.value.objectId)).result,b=selector.closureBindings;
    const store=rows.find(row=>row.name===b.store)?.value,value=rows.find(row=>row.name===b.value)?.value,key=rows.find(row=>row.name===b.key)?.value;
    if(store?.value==='frameworkKV'&&value?.objectId&&key?.value!==undefined) {
      const result=await client.send('Runtime.callFunctionOn',{objectId:value.objectId,functionDeclaration:'function(){return this;}',
        returnByValue:true,throwOnSideEffect:true,silent:true});
      if(result.exceptionDetails)throw new MissingObservation('Native KV submission value unavailable');
      observations.push({native,requestObjectId:request.objectId,scopeName:scope.value.description,key:key.value,value:result.result.value});
    }
  }
  if(observations.length!==1)throw new MissingObservation(`Unique native KV put closure required; observed ${observations.length}`);
  return observations[0];
}

export function assertPublicUnknown(response,payload,operation) {
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_EFFECT_UNKNOWN');
  assert.equal(operation.requestId,payload.requestId);
  const reference=Object.fromEntries(['requestId','runId','opId','grantIncarnation'].map(key=>[key,operation[key]]));
  assert(Object.values(reference).every(value=>typeof value==='string'&&value.length>0),'Original invocation must be independently observed');
  assert.deepEqual(response.error.invocation,reference,'Public unknown error must identify the original committed invocation');
  const allowed=new Set(['code','message','stage','status','response','invocation']);
  assert(Object.keys(response.error).every(key=>allowed.has(key)),'Error exposes non-public internal fields');
}
