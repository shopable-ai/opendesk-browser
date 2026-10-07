import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';
import {discoverBarriers,CASES,loadContractBindings,selectCaseSlice} from './b05-product-acceptance-20261003.mjs';
import {CP1,discoverAdmissionPoint} from './k5-sdk-admission-abort-native-selector.mjs';
import {discoverStorageObservations,assertPublicUnknown,exactBreakpointLocation,requireFreshWorkerContext} from './b05-native-observers.mjs';

const source=await readFile(new URL('../../dist/production/sw.js',import.meta.url),'utf8');
test('actual WXT AST exposes exact CP1/CP2/CP4/storage and native KV observation ranges',()=>{
  const result=discoverBarriers(source);
  for(const id of ['B05.SDK.crash.before-admission-commit','B05.SDK.crash.after-admission-before-dispatch',
    'B05.SDK.crash.after-durable-before-delivery','F2-K2-SDK-018','F2-K2-SDK-019','B05.native-kv-submission']) {
    const point=result.points[id];assert(point,`Missing current package observation point: ${id}`);
    assert.equal(source.slice(...point.range),point.text);
    assert(point.location.lineNumber<=point.endLocation.lineNumber);
  }
  assert.equal(result.admission.ready,true);assert.deepEqual(result.admission.transactionStores,['commandJournal','runs','results']);
});
test('CP1 selector derives the same runs-put callee property across source layout changes',()=>{
  for(const text of [source,`\n  ${source}`]) {
    const calls=[];
    function walk(node) {
      if(!node?.type)return;
      if(node.type==='CallExpression'&&node.arguments[0]?.value==='runs'&&
        node.arguments[1]?.properties?.some(row=>(row.key?.name??row.key?.value)==='tag'&&row.value?.value==='sdk-service'))calls.push(node);
      for(const value of Object.values(node)) {
        if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);
      }
    }
    walk(parse(text,{ecmaVersion:'latest',locations:true}));assert.equal(calls.length,1);
    const call=calls[0],selected=discoverAdmissionPoint(text);assert.equal(selected.ready,true);
    assert.deepEqual(selected.point.range,[call.start,call.end]);
    assert.deepEqual(selected.point.calleePropertyRange,[call.callee.property.start,call.callee.property.end]);
    assert.equal(text.slice(...selected.point.calleePropertyRange),'put');
    assert.deepEqual(selected.point.location,{lineNumber:call.callee.property.loc.start.line-1,columnNumber:call.callee.property.loc.start.column});
    assert.notDeepEqual(selected.point.location,{lineNumber:call.loc.start.line-1,columnNumber:call.loc.start.column});
    assert.equal(selected.point.locationNode,'callee.property');assert.equal(selected.point.breakpointType,'call');
    assert.deepEqual(selected.transactionStores,['commandJournal','runs','results']);assert.equal(selected.transactionMode,'readwrite');
    assert.notEqual(selected.nativeTransactionStateBindings.workDone,selected.nativeTransactionStateBindings.ended);
    assert.equal(selected.precedingJournalPuts.length,2);
  }
  assert.equal(discoverAdmissionPoint(source.replaceAll('sdk-service','missing-service')).ready,false);
  assert.equal(discoverAdmissionPoint(`${source}\nfixture.put('runs',{tag:'sdk-service'},'ambiguous');`).ready,false);
});
test('exact native breakpoint selector refuses wrong type, relocation, script and ambiguity',()=>{
  const point=discoverAdmissionPoint(source).point,scriptId='native-script',exact={scriptId,...point.location,type:'call'};
  assert.deepEqual(exactBreakpointLocation(point,[exact],scriptId),exact);
  for(const rows of [[],[{...exact,type:'return'}],[{...exact,type:undefined}],
    [{...exact,columnNumber:exact.columnNumber+1}],[{...exact,scriptId:'other-script'}],[exact,exact]])
    assert.throws(()=>exactBreakpointLocation(point,rows,scriptId),error=>error.code==='E_NATIVE_NOT_OBSERVED');
});
test('worker context selector permits reused numeric IDs only with a fresh native unique ID',()=>{
  const script={executionContextId:7},old=[{id:7,uniqueId:'old-native-context'}],fresh={id:7,uniqueId:'new-native-context'};
  assert.deepEqual(requireFreshWorkerContext(script,[fresh],old),fresh);
  for(const [contexts,previous] of [[[old[0]],old],[[],old],[[{id:8,uniqueId:fresh.uniqueId}],old],
    [[{id:7}],old],[[fresh],[]],[[fresh],[{id:7}]]])
    assert.throws(()=>requireFreshWorkerContext(script,contexts,previous),error=>error.code==='E_NATIVE_NOT_OBSERVED');
});
test('storage cut rejects missing or ambiguous immutable source anchors',()=>{
  const removed=source.replaceAll('Storage result is not successful','Changed storage failure');
  assert(!discoverStorageObservations(removed).points.storageDurable);
  const duplicated=`${source}\nfunction ambiguous(){throw new Error('Storage result is not successful');}`;
  assert(!discoverStorageObservations(duplicated).points.storageDurable);
});
test('native KV submission selector refuses a changed or duplicate native put',()=>{
  const duplicate=`${source}\nfunction other(s,v,k){return object(s).put(v,k);}`;
  assert(!discoverStorageObservations(duplicate).points.nativeKvSubmission);
  const selected=discoverStorageObservations(source).points.nativeKvSubmission;
  const missing=source.slice(0,selected.range[0])+source.slice(...selected.range).replace('.onsuccess=','.changed=')+source.slice(selected.range[1]);
  assert(!discoverStorageObservations(missing).points.nativeKvSubmission);
});
test('unknown must expose only the original public request reference',()=>{
  const payload={requestId:'actual-public-id'},operation={...payload,runId:'original-run',opId:'original-op',grantIncarnation:'original-grant'},
    response={ok:false,error:{code:'E_EFFECT_UNKNOWN',message:'unknown',invocation:{...operation}}};
  assertPublicUnknown(response,payload,operation);
  for(const changed of [
    {...response,error:{code:'E_EFFECT_UNKNOWN'}},
    {...response,error:{...response.error,invocation:{...operation,requestId:'replacement'}}},
    {...response,error:{...response.error,invocation:{...operation,opKey:'private'}}},
    {...response,error:{...response.error,token:'private'}}
  ])assert.throws(()=>assertPublicUnknown(changed,payload,operation));
});
test('bounded slices add prerequisites while retaining the full required case list',()=>{
  const count=CASES.length;
  assert.deepEqual(selectCaseSlice(['B05.SDK.crash.before-admission-commit']),['B05.SDK.no-controller','B05.SDK.crash.before-admission-commit']);
  const selected=selectCaseSlice(['B05.SDK.conflict','B05.SDK.unknown-public-reference']);
  assert(selected.includes('B05.SDK.100-concurrent'));assert(selected.includes('B05.SDK.crash.after-effect-before-receipt'));
  assert.equal(CASES.length,count);assert.throws(()=>selectCaseSlice(['unfrozen-made-up-case']));
});
test('preparation retains the frozen denominator and binds its actual helper bytes',async()=>{
  const binding=await loadContractBindings();assert.equal(binding.originalCaseCount,603);
  assert.equal(CASES.length,18);assert.equal(new Set(CASES.map(x=>x.id)).size,18);
  for(const name of ['b05-native-observers.mjs','k5-sdk-admission-abort-native-selector.mjs','k5-sdk-admission-abort-native-inspect.mjs'])
    assert(binding.inputs.some(row=>row.path.endsWith(`/tests/framework/${name}`)&&/^[a-f0-9]{64}$/.test(row.sha256)));
});
