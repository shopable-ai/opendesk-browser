import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {encodeValue} from '../../src/framework/control/value.js';
import {encodeValue as encodeRuntimeValue} from '../../src/platform/page-port/codec.js';
import {scriptSdkPlan,validateScriptSdkOracle,decodeScriptSdkResult,SCRIPT_SDK_ID} from './k5-controller-product-native-script-sdk.mjs';

const definition={id:SCRIPT_SDK_ID,required:true,source:{symbol:'ChromePage.addScriptTag'}};
const args={sdkRoot:'chrome-extension://unit/',sdkURL:'chrome-extension://unit/framework/sdk-main.js',key:'unit-key',barrierURL:'http://127.0.0.1:1234/barrier',middleBarrierURL:'http://127.0.0.1:1234/middle'};
function fixture() {
  const plan=scriptSdkPlan(definition,args),selected={tabId:1,frameId:0,documentId:'unit-doc'},revision={scriptId:'unit-script',revision:1,sourceHash:plan.sourceSha256};
  const counts={pending:0,timers:0,subscriptions:3,ports:1,workers:0,blobs:0};
  const resources=()=>({counts:{...counts},owners:{main:{counts:{...counts}},isolated:[{result:{relay:{counts:{...counts}}}}]}});
  const sdk=phase=>({hello:{ready:true},root:{url:args.sdkRoot},isPromise:true,set:undefined,read:{marker:args.key,phase},removed:undefined,diagnostics:{pending:0}});
  const value={caseId:SCRIPT_SDK_ID,firstReturn:undefined,first:sdk(1),secondReturn:undefined,second:sdk(2)};
  const run={state:'completed',retirementState:'released',runId:'unit-run',resultId:'unit-result',target:selected,identity:{ownerEpoch:1},revision,paramsWire:encodeRuntimeValue(plan.params)};
  const result={tag:'controller-result',state:'completed',runId:run.runId,resultId:run.resultId,revision};
  const operations=plan.calls.map((call,i)=>{const requestId='unit-op-'+i;return {state:'durable',submissionCount:1,dispatchAt:i+1,receiptAt:i+2,runId:run.runId,envelope:{requestId,identity:run.identity,target:selected,revision,operation:{kind:call.kind,method:call.method,args:encodeValue(call.args)}},
    nativeReceipts:[{requestId,stage:call.kind==='packaged'?'tabs.sendMessage':'userScripts.execute',receipt:call.kind==='packaged'?{requestId,runId:run.runId,ownerEpoch:1,value:encodeValue(undefined)}:[{documentId:selected.documentId,frameId:0,result:{ok:true,value:encodeValue(i===1?value.first:value.second)}}]}]};});
  const sdkJournal=[];
  for(const phase of [1,2])for(const method of ['bexUrl','APPLOCAL_SETITEM','APPLOCAL_GETITEM','APPLOCAL_REMOVEITEM']) {
    const id=`unit-sdk-${phase}-${method}`,operation={tag:'sdk-operation',state:'durable',tabId:selected.tabId,documentId:selected.documentId,runId:id,resultId:id+'-result',opId:id+'-op',method};
    sdkJournal.push({operation,run:{state:'completed',runId:id,resultId:operation.resultId},result:{tag:'sdk-result',state:'durable',runId:id,resultId:operation.resultId,opId:operation.opId,valueWire:encodeRuntimeValue(method==='bexUrl'?{url:args.sdkRoot}:method==='APPLOCAL_GETITEM'?sdk(phase).read:undefined)}});
  }
  const network=[1,2].flatMap(i=>[{method:'Network.requestWillBeSent',params:{requestId:'unit-load-'+i,type:'Script',request:{url:args.sdkURL}}},{method:'Network.loadingFinished',params:{requestId:'unit-load-'+i}}]);
  return {plan,o:{selected,revision,run,result,value,before:resources(),middle:resources(),after:resources(),bBefore:{title:'B'},bAfter:{title:'B'},bHasSdk:false,operations,sdkJournal,network}};
}

test('SDK URL driver parses saved Worker and MAIN expressions and admits only the packaged SDK identity',()=>{
  const {plan}=fixture();parse(`async function controller(){${plan.source}}`,{ecmaVersion:'latest'});
  for(const expression of [plan.params.firstExpression,plan.params.secondExpression])parse(expression,{ecmaVersion:'latest'});
  assert.throws(()=>scriptSdkPlan(definition,{...args,sdkURL:'https://remote/code.js'}));
});
test('SDK URL oracle accepts complete original promises, two real load traces and stable document resources',()=>{
  const {plan,o}=fixture();assert.equal(validateScriptSdkOracle(plan,o).oraclePassed,true);
  o.operations[0].nativeReceipts.unshift({requestId:o.operations[0].envelope.requestId,stage:'tabs.sendMessage',receipt:{type:'OPENDESK_CONTROLLER_PAGE_SESSION_V1',ready:true}});
  assert.equal(validateScriptSdkOracle(plan,o).oraclePassed,true);
});
test('SDK and controller durable results use runtime wires while page command arguments use control wires',()=>{
  const {plan,o}=fixture();
  assert.deepEqual(decodeScriptSdkResult({outcome:{valueWire:encodeRuntimeValue(o.value)}}),o.value);
  assert.throws(()=>decodeScriptSdkResult({outcome:{valueWire:encodeValue(o.value)}}));
  o.sdkJournal[0].result.valueWire=encodeValue({url:args.sdkRoot});
  assert.throws(()=>validateScriptSdkOracle(plan,o));
});
test('load-only, duplicate dispatch, stale identity, missing promises, grown listeners and changed B cannot pass',()=>{
  const changes=[o=>o.value.first.hello.ready=false,o=>o.value.second.isPromise=false,o=>o.value.second.read.phase=1,o=>o.sdkJournal.pop(),
    o=>o.sdkJournal[0].operation.documentId='foreign',o=>o.result.revision.sourceHash='foreign',o=>o.run.retirementState='pending',
    o=>o.operations[0].submissionCount=2,o=>o.operations[1].nativeReceipts[0].receipt[0].documentId='foreign',
    o=>o.operations[0].nativeReceipts.push(structuredClone(o.operations[0].nativeReceipts[0])),o=>o.middle.owners.main.counts.subscriptions++,
    o=>o.operations[0].nativeReceipts.unshift({requestId:'foreign',stage:'tabs.sendMessage',receipt:{type:'OPENDESK_CONTROLLER_PAGE_SESSION_V1',ready:true}}),
    o=>o.operations[0].nativeReceipts.unshift({requestId:o.operations[0].envelope.requestId,stage:'tabs.sendMessage',receipt:{type:'OPENDESK_CONTROLLER_PAGE_SESSION_V1',ready:false}}),
    o=>delete o.before.counts.blobs,o=>o.bAfter.title='changed',o=>o.bHasSdk=true,o=>o.network.pop(),
    o=>o.network.push({method:'Network.loadingFailed',params:{requestId:'unit-load-1'}})];
  for(const change of changes){const {plan,o}=fixture();change(o);assert.throws(()=>validateScriptSdkOracle(plan,o));}
});
