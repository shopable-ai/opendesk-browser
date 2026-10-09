import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixedReadFixtureHTML, fixedReadPlan, originalReadPlan, originalReadPermission, loadOriginalApi48Catalog, ORIGINAL_FIXED_READ_IDS,
  ORIGINAL_SELECTOR_READ_IDS, ORIGINAL_CONTEXT_READ_IDS, ORIGINAL_CLICK_ERROR_IDS, ORIGINAL_LIMIT_REFUSAL_IDS, ORIGINAL_READ_IDS, originalReadFixtureFamily, validateFixedReadOracle, validateOriginalReadOracle, FIXED_READ_B_BODY,captureOriginalReadOutcome,captureOriginalCaseFailure,originalAdmittedRun} from './k5-controller-product-native-original-cases.mjs';
import {encodeValue} from '../../src/framework/control/value.js';
import {encodeValue as encodeRuntimeValue} from '../../src/platform/page-port/codec.js';
import {parse} from 'acorn';
import {recipeFor} from './f3-api48-cases.mjs';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {ORIGINAL_STYLE_CSS} from './k5-controller-style-observer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = await loadOriginalApi48Catalog(root);
test('original registered script resource error requires actual Chrome network failure and an absent SDK',()=>{
  const definition=catalog.cases.find(r=>r.id==='RESOURCE01-API16-ERR'),sdkRoot='chrome-extension://unit/',sdkURL=sdkRoot+'framework/sdk-main.js';
  const faultUrls={...selectorUrls,aURL:selectorUrls.aURL.replace('#','&resourceFault=script-network#'),sdkRoot,sdkURL};
  const plan=originalReadPlan(definition,faultUrls);assert.equal(plan.resourceError,true);
  assert.equal(plan.params.sdkURL,sdkURL);assert.deepEqual(plan.calls,[{args:[{url:sdkURL}],error:'E_RESOURCE_UNAVAILABLE'}]);
  const original=selectorObservation(plan);original.scriptResource={ready:false,nodes:0,network:[
    {method:'Network.requestWillBeSent',params:{requestId:'unit-load',type:'Script',request:{url:sdkURL}}},
    {method:'Network.loadingFailed',params:{requestId:'unit-load',blockedReason:'inspector'}}],fault:{url:sdkURL,method:'Network.setBlockedURLs',params:{urls:[sdkURL]},reply:{}}};
  assert.equal(validateOriginalReadOracle(plan,original).oraclePassed,true);
  for(const change of [o=>o.scriptResource.ready=true,o=>o.scriptResource.nodes=1,o=>o.scriptResource.network.pop(),
    o=>o.scriptResource.network[1].params.blockedReason='other',o=>o.pageOperations[0].reply.error.code='E_RESOURCE_LOAD',
    o=>o.scriptResource.fault.params.urls.push('https://foreign/code.js'),o=>o.scriptResource.fault.reply={error:'failed'},
    o=>o.scriptResource.network.push({method:'Network.loadingFinished',params:{requestId:'unit-load'}})]){
    const o=structuredClone(original);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));
  }
  assert.throws(()=>originalReadPlan(definition,{...faultUrls,sdkURL:'https://remote/code.js'}));
  assert.throws(()=>originalReadPlan(definition,{...faultUrls,aURL:selectorUrls.aURL}));
});
const urls = {aURL:'http://127.0.0.1:1234/original-api48?role=A#A-fragment', bURL:'http://127.0.0.1:1234/original-api48?role=B#B-fragment', barrierURL:'http://127.0.0.1:1234/original-api48-barrier?token=unit-only'};
const plans = ORIGINAL_FIXED_READ_IDS.map(id => fixedReadPlan(catalog.cases.find(row => row.id === id), urls));
const selectorUrls = {...urls,aURL:urls.aURL.replace('#','&family=selector#'),bURL:urls.bURL.replace('#','&family=selector#')};
const selectorPlans = ORIGINAL_SELECTOR_READ_IDS.map(id => originalReadPlan(catalog.cases.find(row => row.id === id),selectorUrls));

test('original style application requires exact packaged/user-script receipts plus direct same-node disposal evidence',()=>{
  const definition=catalog.cases.find(row=>row.id==='RESOURCE01-API17-OK'),styleBarrierURL=urls.barrierURL+'&stage=style',plan=originalReadPlan(definition,{...selectorUrls,styleBarrierURL});
  assert(plan.source.includes(recipeFor(definition).body));assert.equal(plan.params.nativeStyleBarrierURL,styleBarrierURL);
  assert.deepEqual(plan.calls.map(c=>c.method),['addStyleTag','$eval']);
  const create=()=>{
    const o=inputObservation(plan);o.a=structuredClone(o.aBefore);o.a.styles=o.aBefore.styles={color:'rgb(0, 0, 0)',head:[]};
    const view={tag:'STYLE',text:ORIGINAL_STYLE_CSS,connected:true,documentURL:plan.aURL,color:'rgb(1, 2, 3)'};
    o.style={held:{backendNodeId:12,objectId:'unit-style-node',selected:o.selected,view},after:{backendNodeId:12,objectId:'unit-style-node',view:{...view,connected:false,color:'rgb(0, 0, 0)'}},
      heldAt:8,afterAt:10,objectReleased:true,barrier:{request:{at:7,method:'GET',url:new URL(styleBarrierURL).pathname+new URL(styleBarrierURL).search},release:{at:9},
        pendingOperation:{tag:'controller-operation',runId:o.run.runId,state:'dispatched',envelope:{identity:o.run.identity,revision:o.run.revision,operation:{kind:'service',method:'AXIOS_GET',args:encodeValue([{url:styleBarrierURL}])}}}}};
    return o;
  };
  assert.equal(validateOriginalReadOracle(plan,create()).oraclePassed,true);
  const withSessionReady=create(),styleRead=withSessionReady.pageOperations.find(row=>row.envelope.operation.method==='addStyleTag');
  styleRead.nativeReceipts.splice(1,0,{requestId:styleRead.envelope.requestId,stage:'tabs.sendMessage',receipt:{type:'OPENDESK_CONTROLLER_PAGE_SESSION_V1',ready:true}});
  assert.equal(validateOriginalReadOracle(plan,withSessionReady).oraclePassed,true,'Session ready is a handshake, not a second operation completion');
  for(const mutation of ['duplicate-completion','unready-session','foreign-handshake']) {
    const o=structuredClone(withSessionReady),read=o.pageOperations.find(row=>row.envelope.operation.method==='addStyleTag');
    if(mutation==='duplicate-completion')read.nativeReceipts.splice(3,0,structuredClone(read.nativeReceipts[2]));
    if(mutation==='unready-session')read.nativeReceipts[1].receipt.ready=false;
    if(mutation==='foreign-handshake')read.nativeReceipts[1].requestId='foreign';
    assert.throws(()=>validateOriginalReadOracle(plan,o));
  }
  for(const change of [o=>delete o.style,o=>o.pageOperations[0].nativeReceipts.splice(1,1),o=>o.pageOperations[1].nativeReceipts[1].receipt[0].documentId='foreign',
    o=>o.style.after.view.connected=true,o=>o.a.styles.color='rgb(1, 2, 3)',o=>o.value.checks.pop(),o=>o.bAfter.title='changed']) {
    const o=create();change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));
  }
});

test('approved style refusal drivers require unchanged pages and exact errors without operation dispatch',()=>{
  for(const id of ['RESOURCE01-API17-ERR','RESOURCE01-API17-LIMIT']) {
    const definition=catalog.cases.find(row=>row.id===id),plan=originalReadPlan(definition,selectorUrls);
    assert(plan.source.includes(recipeFor(definition).body));assert.deepEqual(plan.calls,[]);
    assert.equal(plan.requiredAssertions.length,id.endsWith('-ERR')?2:6);
    assert.equal(validateOriginalReadOracle(plan,selectorObservation(plan)).oraclePassed,true);
    for(const change of [o=>o.pageOperations.push({envelope:{operation:{method:'addStyleTag'}}}),
      o=>o.value.artifacts[Object.keys(plan.errors)[0]].code='E_STYLE_URL_UNSUPPORTED',
      o=>o.value.checks.pop(),o=>o.a.bodyHTML+='forbidden',o=>o.bAfter.title='foreign',o=>o.cleanup.after.workers++]) {
      const observation=selectorObservation(plan);change(observation);assert.throws(()=>validateOriginalReadOracle(plan,observation));
    }
  }
});

test('approved script refusal driver preserves the immutable recipe and requires zero page dispatch',()=>{
  const definition=catalog.cases.find(row=>row.id==='RESOURCE01-API16-LIMIT'),plan=originalReadPlan(definition,selectorUrls);
  assert(plan.source.includes(recipeFor(definition).body));assert.equal(originalReadPermission([definition.id]),true);
  assert.deepEqual(plan.calls,[]);assert.equal(plan.requiredAssertions.length,6);
  assert.deepEqual(plan.errors,{'remote-script':'E_REMOTE_CODE_UNSUPPORTED','script-onload':'E_OPTION_UNSUPPORTED','script-module':'E_OPTION_UNSUPPORTED'});
  assert.equal(validateOriginalReadOracle(plan,selectorObservation(plan)).oraclePassed,true);
  for(const change of [o=>o.pageOperations.push({envelope:{operation:{method:'addScriptTag'}}}),
    o=>o.value.artifacts['remote-script'].code='E_RESOURCE_URL_UNSUPPORTED',
    o=>o.value.checks.pop(),o=>o.a.bodyHTML+='<script>forbidden</script>',o=>o.preambleOperations=[]]) {
    const observation=selectorObservation(plan);change(observation);assert.throws(()=>validateOriginalReadOracle(plan,observation));
  }
});

test('approved native limit refusal drivers reject before any non-service or non-preamble dispatch',()=>{
  assert.deepEqual(ORIGINAL_LIMIT_REFUSAL_IDS, ['NAV01-API10-LIMIT','NAV01-API11-LIMIT','CMP04-API28-OK']);
  assert.equal(originalReadPermission(ORIGINAL_LIMIT_REFUSAL_IDS),true);
  const nextURL=selectorUrls.aURL.replace('role=A','role=next').replace('#A-fragment','#next-fragment');
  for (const id of ORIGINAL_LIMIT_REFUSAL_IDS) {
    const definition=catalog.cases.find(row=>row.id===id),plan=originalReadPlan(definition,{...selectorUrls,nextURL});
    assert(plan.source.includes(recipeFor(definition).body));assert.equal(plan.zeroPageDispatch,true);
    assert.deepEqual(plan.calls,[]);assert.deepEqual(Object.values(plan.errors),[id==='CMP04-API28-OK'?'E_CAPABILITY_UNAVAILABLE':'E_OPTION_UNSUPPORTED']);
    assert.equal(validateOriginalReadOracle(plan,selectorObservation(plan)).oraclePassed,true);
    if(id==='NAV01-API11-LIMIT') {
      assert.equal(plan.params.nextURL,nextURL);
      assert.throws(()=>originalReadPlan(definition,selectorUrls),/Invalid URL|URL/);
      assert.throws(()=>originalReadPlan(definition,{...selectorUrls,nextURL:'https://example.test/next'}),/example\.test|127\.0\.0\.1/);
    }
    const extraOperation={tag:'controller-operation',runId:'unit-run',state:'durable',submissionCount:1,dispatchAt:4,
      envelope:{requestId:'unit-extra-dispatch',target:{tabId:1,frameId:0,documentId:'unit-A',url:plan.aURL},revision:{scriptId:'unit-only',revision:1,sourceHash:plan.sourceSha256},
        operation:{kind:plan.operationKind,method:plan.method,args:encodeValue([])}}};
    const extraService={...structuredClone(extraOperation),envelope:{...structuredClone(extraOperation.envelope),requestId:'unit-extra-service',operation:{kind:'service',method:'AXIOS_GET',args:encodeValue([{url:plan.params.nativeBarrierURL}])}},reply:{requestId:'unit-extra-service',value:encodeValue({})}};
    const extraWait={...structuredClone(extraOperation),envelope:{...structuredClone(extraOperation.envelope),requestId:'unit-extra-wait',operation:{kind:'packaged',method:'waitForTimeout',args:encodeValue([350])}},reply:{requestId:'unit-extra-wait',value:encodeValue(undefined)}};
    for(const change of [o=>o.currentRunOperations.push(extraOperation),o=>o.pageOperations.push(extraOperation),
      o=>o.currentRunOperations.push(extraService),o=>o.currentRunOperations.push(extraWait),
      o=>o.currentRunOperations.push(structuredClone(o.barrier.pendingOperation)),o=>o.currentRunOperations.push(structuredClone(o.preambleOperations[0])),
      o=>o.currentRunOperations[0].envelope.operation.args=encodeValue([{url:'http://127.0.0.1:1234/wrong'}]),
      o=>o.currentRunOperations[1].envelope.operation.args=encodeValue([351]),o=>o.currentRunOperations[0].state='dispatched',
      o=>o.currentRunOperations[1].submissionCount=2,o=>o.currentRunOperations[0].reply.requestId='foreign',
      o=>o.value.artifacts[Object.keys(plan.errors)[0]].code='E_WRONG_CODE',o=>o.selected.documentId='other-document',
      o=>o.params={...o.params,nextURL:'http://127.0.0.1:1234/original-api48?role=wrong&family=selector#wrong'},
      o=>o.result.revision={...o.result.revision,sourceHash:'stale'},o=>o.run.retirementState='pending']) {
      const observation=selectorObservation(plan);change(observation);assert.throws(()=>validateOriginalReadOracle(plan,observation));
    }
  }
});

test('native limit refusal oracle uses params decoded from the durable run wire',async()=>{
  const nextURL=selectorUrls.aURL.replace('role=A','role=next').replace('#A-fragment','#next-fragment');
  const definition=catalog.cases.find(row=>row.id==='NAV01-API11-LIMIT'),plan=originalReadPlan(definition,{...selectorUrls,nextURL});
  const base=selectorObservation(plan),actual={run:{paramsWire:encodeRuntimeValue(plan.params)},result:{outcome:{valueWire:encodeRuntimeValue(base.value)}}};
  const captured=await captureOriginalReadOutcome(actual,{});
  assert.deepEqual(captured.params,plan.params);
  const observation=selectorObservation(plan);observation.params=captured.params;observation.value=captured.value;
  assert.equal(validateOriginalReadOracle(plan,observation).oraclePassed,true);
  const wrong=await captureOriginalReadOutcome({run:{paramsWire:encodeRuntimeValue({...plan.params,nextURL:plan.aURL})},result:{outcome:{valueWire:encodeRuntimeValue(base.value)}}},{});
  const rejected=selectorObservation(plan);rejected.params=wrong.params;assert.throws(()=>validateOriginalReadOracle(plan,rejected));
});

const cookieUrls={...urls,aURL:urls.aURL.replace('/original-api48?','/path/original-api48?').replace('#A-fragment','&family=cookie'),bURL:urls.bURL.replace('#B-fragment','&family=cookie')};
const cookieActionUrls=family=>({...cookieUrls,aURL:cookieUrls.aURL.replace('family=cookie',`family=${family}`),bURL:cookieUrls.bURL.replace('127.0.0.1','localhost').replace('family=cookie',`family=${family}`)});
test('complete original cookie mutation drivers preserve frozen input and exact mutation/default read steps',()=>{
  for(const [id,family,method] of [['CMP04-API19-OK','cookie-set','setCookie'],['CMP04-API20-OK','cookie-delete','deleteCookie']]) {
    const definition=catalog.cases.find(row=>row.id===id),plan=originalReadPlan(definition,cookieActionUrls(family));
    assert.equal(plan.calls.length,2);assert.deepEqual(plan.calls.map(c=>c.method),[method,'cookies']);assert.equal(plan.operationKind,'browser');
    assert(plan.source.includes(recipeFor(definition).body));assert.equal(plan.cookieAction,method==='setCookie'?'set':'delete');
    assert.deepEqual(plan.calls[1].args,[[]]);assert.throws(()=>originalReadPlan(definition,{...cookieActionUrls(family),bURL:cookieActionUrls(family).bURL.replace('localhost','127.0.0.1')}),/separate cookie hostname/);
  }
});
test('original cookie read driver retains duplicate URL followed by selected-document default and exact original recipe',()=>{
  const definition=catalog.cases.find(row=>row.id==='CMP04-API18-OK'),plan=originalReadPlan(definition,cookieUrls);
  assert.equal(plan.cookieRead,true);assert.equal(plan.operationKind,'browser');assert.equal(plan.params.url,cookieUrls.aURL);
  assert.deepEqual(plan.calls.map(call=>call.args),[[[cookieUrls.aURL,cookieUrls.aURL]],[[]]]);
  assert(plan.source.includes(recipeFor(definition).body));assert.equal(originalReadPermission([definition.id]),true);
  assert.throws(()=>originalReadPlan(definition,{...cookieUrls,aURL:cookieUrls.aURL.replace('/path/','/')}),/cookie A path/);
});

test('original type input includes the specified literal backslash after recipe compilation',()=>{
  const definition=catalog.cases.find(row=>row.id==='CMP09-API22-OK');
  const ast=parse(recipeFor(definition).body,{ecmaVersion:'latest',allowAwaitOutsideFunction:true});
  const text=ast.body.find(node=>node.type==='VariableDeclaration').declarations[0].init.value;
  assert.deepEqual(Array.from(text,c=>c.codePointAt(0)),[34,92,128512,20320,22909]);
});

test('complete original click/type success drivers retain exact heterogeneous operands and compiled literal',()=>{
  const inputUrls={...selectorUrls,aURL:selectorUrls.aURL.replace('family=selector','family=input-actions'),bURL:selectorUrls.bURL.replace('family=selector','family=input-actions')};
  const plans=['CMP09-API21-OK','CMP09-API22-OK'].map(id=>originalReadPlan(catalog.cases.find(row=>row.id===id),inputUrls));
  assert.equal(plans[0].calls.length,1);assert.equal(plans[1].calls.length,8);
  assert.deepEqual(plans[1].calls.map(call=>call.method),['type','$eval','type','$eval','type','$eval','type','$eval']);
  assert.deepEqual(Array.from(plans[1].calls[6].args[1],c=>c.codePointAt(0)),[34,92,128512,20320,22909]);
});

test('actual runner HTTP fixture branch serves new original input-actions and rejects unknown fixtures',async()=>{
  const source=await readFile(new URL('./k5-controller-product-native.mjs',import.meta.url),'utf8');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});let branch;
  function visit(node) {
    if(!node||typeof node!=='object')return;
    if(node.type==='IfStatement'&&(node.test?.right?.value==='/original-api48'||node.test?.left?.right?.value==='/original-api48'))branch=node.consequent;
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
  visit(ast);assert(branch,'Actual native runner fixture route is missing');
  // Execute the actual bounded server branch with a real local HTTP response.
  // No browser, native receipt or formal result is created by this unit test.
  const route=new Function('url','res','fixedReadFixtureHTML',source.slice(branch.start,branch.end));
  const server=createServer((req,res)=>route(new URL(req.url,'http://127.0.0.1'),res,fixedReadFixtureHTML));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const origin=`http://127.0.0.1:${server.address().port}`;
    for(const family of ['input-actions','type-error']) {
      const response=await fetch(origin+'/original-api48?role=A&family='+family);assert.equal(response.status,200);
      assert.equal(await response.text(),fixedReadFixtureHTML('A',family));
    }
    const cookie=await fetch(origin+'/path/original-api48?role=A&family=cookie');assert.equal(cookie.status,200);
    assert.deepEqual(cookie.headers.getSetCookie(),['sid=a=b; Path=/; HttpOnly; SameSite=Lax','sid=path; Path=/path; HttpOnly; SameSite=Lax']);
    assert.equal(await cookie.text(),fixedReadFixtureHTML('A','cookie'));
    const b=await fetch(origin+'/original-api48?role=B&family=cookie');assert.equal(b.status,200);assert.deepEqual(b.headers.getSetCookie(),[]);
    assert.equal(await b.text(),fixedReadFixtureHTML('B','cookie'));
    for(const family of ['cookie-set','cookie-delete']) {
      const a=await fetch(origin+'/path/original-api48?role=A&family='+family);assert.equal(a.status,200);
      assert.deepEqual(a.headers.getSetCookie(),[family==='cookie-set'?'sid=before; Path=/; HttpOnly; SameSite=Strict':'sid=a=b; Path=/; HttpOnly; SameSite=Lax','sid=path; Path=/path; HttpOnly; SameSite=Lax']);
      assert.equal(await a.text(),fixedReadFixtureHTML('A',family));
      const b=await fetch(origin.replace('127.0.0.1','localhost')+'/original-api48?role=B&family='+family);assert.equal(b.status,200);
      assert.deepEqual(b.headers.getSetCookie(),['sid=B; Path=/; HttpOnly; SameSite=Lax']);assert.equal(await b.text(),fixedReadFixtureHTML('B',family));
    }
    for(const url of ['/original-api48?role=A&family=cookie','/path/original-api48?role=B&family=cookie','/path/original-api48?role=A&family=selector'])
      assert.equal((await fetch(origin+url)).status,400);
    for(const query of ['role=foreign&family=input-actions','role=A&family=foreign'])assert.equal((await fetch(origin+'/original-api48?'+query)).status,400);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('original failure capture preserves other page/resource reads before malformed outcome or input validation',async()=>{
  const failure=Object.assign(new Error('actual A observation unavailable'),{code:'E_RUNNER_PAGE_OBSERVATION',actual:{documentId:'retired'}});
  const order=[],readers={a:async()=>{order.push('a');throw failure;},bAfter:async()=>{order.push('b');return {inputValue:'BaseB'};},
    resources:async()=>{order.push('resources');return {counts:{pending:0,timers:0}};}};
  const failed=await captureOriginalReadOutcome({run:{paramsWire:encodeRuntimeValue({unexpected:true})},result:{outcome:{error:{code:'E_EFFECT_UNKNOWN'}}}},readers);
  assert.deepEqual(order,['a','b','resources']);assert.equal(failed.readError,failure);
  assert.deepEqual(failed.reads.bAfter,{inputValue:'BaseB'});assert.deepEqual(failed.reads.resources,{counts:{pending:0,timers:0}});
  assert.deepEqual(failed.readErrors.a.actual,{documentId:'retired'});assert(failed.decodeErrors.value);assert(failed.decodeError);
  assert.deepEqual(failed.params,{unexpected:true});
  const value={caseId:'unit-only',failure:null,checks:[]},params={nativeBarrierURL:'unit-only'};
  const completed=await captureOriginalReadOutcome({run:{paramsWire:encodeRuntimeValue(params)},result:{outcome:{valueWire:encodeRuntimeValue(value)}}},
    {a:async()=>({inputValue:'actual'}),resources:async()=>({counts:{pending:0}})});
  assert.deepEqual(completed.value,value);assert.deepEqual(completed.params,params);assert.deepEqual(completed.readErrors,{});assert.deepEqual(completed.decodeErrors,{});
});

// Unit-only oracle data exercises rejection of incomplete evidence. It is
// never written to a native report, a receipt, or the formal acceptance ledger.
function unitObservation(plan) {
  const revision = {scriptId:'unit-only',revision:1,sourceHash:plan.sourceSha256};
  const selected = {tabId:1,frameId:0,documentId:'unit-A',url:plan.aURL};
  const b = {tabId:2,documentId:'unit-B',url:plan.bURL,title:'B-title',bodyHTML:FIXED_READ_B_BODY,inputValue:'BaseB',screenshotMarker:{color:'rgb(0, 0, 255)',visible:true}};
  const counts = {pending:0,timers:0,subscriptions:31,ports:1,workers:0,blobs:0};
  const wire = {type:'string',value:plan.expected};
  return {value:{caseId:plan.caseId,failure:null,checks:plan.requiredAssertions.map(name=>({name,actual:wire,expected:wire}))},
    before:{userScripts:{available:false}},after:{userScripts:{available:false},activeTab:{id:2,url:plan.bURL,active:true},focusedB:true},selected,
    run:{runId:'unit-run',resultId:'unit-result',state:'completed',retirementState:'released',target:selected,revision},
    result:{tag:'controller-result',runId:'unit-run',resultId:'unit-result',state:'completed',revision},
    params:plan.params,
    barrier:{request:{method:'GET',url:'/original-api48-barrier?token=unit-only',at:1},
      pendingOperation:{tag:'controller-operation',runId:'unit-run',state:'dispatched',submissionCount:1,
        envelope:{requestId:'unit-only-barrier',target:selected,revision,identity:{runId:'unit-run',ownerEpoch:1},operation:{kind:'service',method:'AXIOS_GET',args:encodeValue([{url:plan.params.nativeBarrierURL}])}}},
      pendingArgs:[{url:plan.params.nativeBarrierURL}],release:{at:2,activeTab:{id:2,url:plan.bURL,active:true},focusedB:true}},
    fixedReadOperations:[{tag:'controller-operation',runId:'unit-run',state:'durable',submissionCount:1,dispatchAt:3,envelope:{target:selected,revision,operation:{kind:'packaged',method:plan.method}}}],
    a:{documentId:'unit-A',url:plan.aURL,title:'A-title',bodyHTML:'<div id="marker">A</div>'},bBefore:b,bAfter:{...b},cleanup:{before:{...counts},after:{...counts}}};
}

function selectorObservation(plan) {
  const observation = unitObservation(plan), revision = observation.run.revision, target = observation.selected;
  observation.run.identity={runId:observation.run.runId,ownerEpoch:1};
  function view(v) {
    if(v === undefined)return {type:'undefined'};if(v === null)return {type:'null'};
    if(Array.isArray(v))return {type:'array',items:v.map(view)};
    if(typeof v === 'object')return {type:'object',entries:Object.keys(v).sort().map(k=>[k,view(v[k])])};
    return {type:typeof v,value:v};
  }
  observation.before.userScripts.available = observation.after.userScripts.available = true;
  observation.a.bodyHTML = plan.bodyHTML;
  observation.value.checks = plan.requiredAssertions.map(name=>({name,actual:view(plan.assertionExpected[name]),expected:view(plan.assertionExpected[name])}));
  observation.value.artifacts = Object.fromEntries(Object.entries(plan.errors).map(([name,code]) => [name,
    {code,name:'PageError',message:code==='E_PAGE_EXECUTION'?'boom':code,
      ...(['throw-eval','reject-eval'].includes(name)?{cause:{name:'Error',message:'boom'}}:{})}]));
  observation.pageOperations = plan.calls.map((call,i) => {
    const requestId = `unit-only-operation-${i}`;
    const reply = {requestId,...(call.error?{error:{code:call.error,name:'PageError',message:call.cause?.message ?? call.error,
      ...(call.cause?{cause:{...call.cause}}:{})}}:{value:encodeValue(call.value)})};
    return {tag:'controller-operation',runId:'unit-run',state:'durable',submissionCount:1,dispatchAt:3+i,reply,
      envelope:{requestId,target,revision,identity:observation.run.identity,operation:{kind:plan.operationKind,method:plan.method,args:encodeValue(call.args)}},
      ...(call.error?{effectState:'failure-observed',nativeReceipts:[{stage:plan.operationKind==='packaged'?'packaged.finalFailure':'userScripts.finalFailure',requestId,
        receipt:{frameId:target.frameId,documentId:target.documentId,error:structuredClone(reply.error),
          ...(plan.operationKind==='packaged'?observation.run.identity:{})}}]}:{})};
  });
  observation.preambleOperations = [{tag:'controller-operation',runId:'unit-run',state:'durable',submissionCount:1,
    envelope:{requestId:'unit-only-preamble',target,revision,operation:{kind:'packaged',method:'waitForTimeout',args:encodeValue([350])}}}];
  const finalBarrier={...structuredClone(observation.barrier.pendingOperation),state:'durable',reply:{requestId:observation.barrier.pendingOperation.envelope.requestId,value:encodeValue({released:true})}};
  const finalPreamble={...structuredClone(observation.preambleOperations[0]),reply:{requestId:observation.preambleOperations[0].envelope.requestId,value:encodeValue(undefined)}};
  observation.currentRunOperations = [finalBarrier, finalPreamble, ...observation.pageOperations];
  if(['click-error','type-error'].includes(plan.fixtureFamily)) {
    if(plan.fixtureFamily==='type-error')Object.assign(observation.a,{inputValue:'Base',readonlyValue:'Locked'});
    for(const page of [observation.a,observation.bBefore,observation.bAfter])page.inputEvents=[];
    observation.aBefore=structuredClone(observation.a);
  }
  return observation;
}

function cookieReadObservation(plan) {
  const o=selectorObservation(plan),storeId='unit-cookie-store',stores=[{id:storeId,tabIds:[1,2]}];
  for(const page of [o.a,o.bBefore,o.bAfter])page.documentCookie='';o.aBefore=structuredClone(o.a);
  const raw=path=>({storeId,name:'sid',value:path==='/'?'a=b':'path',domain:'127.0.0.1',path,httpOnly:true,hostOnly:true,secure:false,sameSite:'lax',session:true});
  const cookies=[raw('/path'),raw('/')],projection=cookies.map(row=>({name:row.name,value:row.value,domain:row.domain,path:row.path,expires:undefined,httpOnly:row.httpOnly,secure:row.secure,sameSite:row.sameSite}));
  const frame=(documentId,url)=>({frameId:0,documentId,url,errorOccurred:false,documentLifecycle:'active'});
  const aFrame=frame('unit-A',plan.aURL),bFrame=frame('unit-B',plan.bURL);
  const baseline={permissions:{cookies:true},stores,a:{tabId:1,frame:aFrame,cookies},b:{tabId:2,frame:bFrame,cookies:[raw('/')]}};
  o.before.cookieObservation=baseline;o.after.cookieObservation=structuredClone(baseline);
  o.barrier.pendingOperation.envelope.requestId='unit-only-http';o.before.cookieAdmission={runId:o.run.runId,pendingRequestId:'unit-only-http',observedAt:1.5};
  function view(v) {
    if(v===undefined)return {type:'undefined'};if(v===null)return {type:'null'};
    if(Array.isArray(v))return {type:'array',items:v.map(view)};
    if(typeof v==='object')return {type:'object',entries:Object.keys(v).sort().map(k=>[k,view(v[k])])};
    return {type:typeof v,value:v};
  }
  const check=o.value.checks.find(check=>check.name==='cookie-default');check.actual=check.expected=view(projection);
  for(const operation of o.pageOperations) {
    operation.reply={requestId:operation.envelope.requestId,value:encodeValue(projection)};
    const receipt=(stage,value)=>({stage,requestId:operation.envelope.requestId,receipt:structuredClone(value)});
    operation.nativeReceipts=[receipt('webNavigation.getAllFrames',[aFrame]),receipt('cookies.getAllCookieStores',stores),
      receipt('cookies.getAll',cookies),receipt('result',operation.reply),receipt('webNavigation.getAllFrames',[aFrame])];
  }
  return o;
}

test('original cookie oracle rejects duplicate URL reads, truncated values, missing native callbacks and foreign stores',()=>{
  const plan=originalReadPlan(catalog.cases.find(row=>row.id==='CMP04-API18-OK'),cookieUrls);
  assert.equal(validateOriginalReadOracle(plan,cookieReadObservation(plan)).oraclePassed,true);
  assert.equal(validateOriginalReadOracle(plan,JSON.parse(JSON.stringify(cookieReadObservation(plan)))).oraclePassed,true,'Explicit undefined cookie expiry must survive the actual JSON wire shape');
  const changes=[o=>o.pageOperations.pop(),o=>o.pageOperations[0].envelope.operation.args=encodeValue([[plan.aURL]]),
    o=>o.pageOperations[0].nativeReceipts.splice(3,0,structuredClone(o.pageOperations[0].nativeReceipts[2])),
    o=>o.pageOperations[0].nativeReceipts[2].receipt[1].value='a',
    o=>o.pageOperations[0].nativeReceipts[2].receipt[1].httpOnly=false,
    o=>o.pageOperations[0].nativeReceipts[2].receipt[1].storeId='foreign',
    o=>o.pageOperations[0].nativeReceipts[2].receipt[1].path='/path',
    o=>o.pageOperations[0].nativeReceipts[2].requestId='foreign',
    o=>o.pageOperations[0].nativeReceipts=o.pageOperations[0].nativeReceipts.filter(row=>row.stage!=='result')];
  for(const change of changes){const o=cookieReadObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));}
});

test('original cookie oracle rejects active B defaults, stale documents, incomplete A/B baseline and edited assertion coverage',()=>{
  const plan=originalReadPlan(catalog.cases.find(row=>row.id==='CMP04-API18-OK'),cookieUrls);
  const changes=[o=>o.pageOperations[1].nativeReceipts[2].receipt.pop(),
    o=>o.pageOperations[1].nativeReceipts[4].receipt[0].documentId='retired',
    o=>o.pageOperations[1].nativeReceipts[4].receipt[0].url=plan.bURL,
    o=>o.pageOperations[1].nativeReceipts.unshift(o.pageOperations[1].nativeReceipts.pop()),
    o=>delete o.before.cookieObservation,o=>delete o.after.cookieObservation,
    o=>o.before.cookieObservation.b.cookies.push(structuredClone(o.before.cookieObservation.a.cookies[0])),
    o=>o.pageOperations[1].envelope.identity={...o.pageOperations[1].envelope.identity,ownerEpoch:99},
    o=>o.value.checks.pop(),o=>o.result.revision={...o.result.revision,sourceHash:'old'},
    o=>o.pageOperations[1].reply.value=encodeValue([]),o=>o.a.documentCookie='sid=a=b',o=>delete o.aBefore.documentCookie];
  for(const [index,change] of changes.entries()){const o=cookieReadObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o),`Cookie evidence mutation ${index} must be rejected`);}
});

function cookieActionObservation(plan) {
  const o=selectorObservation(plan),setting=plan.cookieAction==='set',storeId='unit-store',stores=[{id:storeId,tabIds:[1,2]}];
  for(const page of [o.a,o.bBefore,o.bAfter])page.documentCookie='';o.aBefore=structuredClone(o.a);
  const raw=(path,before=false)=>({storeId,name:'sid',value:path==='/path'?'path':before&&setting?'before':'a=b',domain:'127.0.0.1',path,httpOnly:true,hostOnly:true,secure:false,sameSite:path==='/'&&before&&setting?'strict':'lax',session:true});
  const frame=(documentId,url)=>({frameId:0,documentId,url,errorOccurred:false,documentLifecycle:'active'}),aFrame=frame('unit-A',plan.aURL),bFrame=frame('unit-B',plan.bURL);
  const baseline={permissions:{cookies:true,bOriginPattern:'http://localhost/*',bOriginGranted:false},stores,a:{tabId:1,frame:aFrame,cookies:[raw('/path',true),raw('/',true)]},b:{tabId:2,frame:bFrame,cookieSource:'CDP.Network.getCookies',cookies:[{name:'sid',value:'B',domain:'localhost',path:'/',httpOnly:true,secure:false,sameSite:'Lax',session:true,expires:-1}]}};
  const current=structuredClone(baseline);current.a.cookies=setting?[raw('/path'),raw('/')]:[raw('/path')];
  o.before.cookieObservation=baseline;o.after.cookieObservation=current;o.barrier.pendingOperation.envelope.requestId='unit-only-http';
  o.before.cookieAdmission={runId:o.run.runId,pendingRequestId:'unit-only-http',observedAt:1.5};
  for(const [index,operation] of o.pageOperations.entries()) {
    operation.envelope.operation.method=plan.calls[index].method;
    const projection=current.a.cookies.map(c=>({name:c.name,value:c.value,domain:c.domain,path:c.path,expires:undefined,httpOnly:c.httpOnly,secure:c.secure,sameSite:c.sameSite}));
    operation.reply={requestId:operation.envelope.requestId,value:encodeValue(index===0?undefined:projection)};
    const receipt=(stage,value)=>({stage,requestId:operation.envelope.requestId,receipt:structuredClone(value)});
    const completion=index===1?[receipt('cookies.getAll',current.a.cookies)]:setting?[receipt('cookies.set',current.a.cookies.find(c=>c.path==='/'))]:[
      receipt('cookies.getAll',[baseline.a.cookies.find(c=>c.path==='/')]),receipt('cookies.getAll',[baseline.a.cookies.find(c=>c.path==='/')]),
      receipt('cookies.remove',{url:new URL('/',plan.aURL).href,name:'sid',storeId})];
    operation.nativeReceipts=[receipt('webNavigation.getAllFrames',[aFrame]),receipt('cookies.getAllCookieStores',stores),...completion,receipt('result',operation.reply),receipt('webNavigation.getAllFrames',[aFrame])];
  }
  return o;
}

test('original cookie action oracles require real changed A cookies, isolated B, exact mutation receipts and immutable input assertions',()=>{
  for(const [id,family] of [['CMP04-API19-OK','cookie-set'],['CMP04-API20-OK','cookie-delete']]) {
    const plan=originalReadPlan(catalog.cases.find(row=>row.id===id),cookieActionUrls(family));
    assert.equal(validateOriginalReadOracle(plan,cookieActionObservation(plan)).oraclePassed,true);
    assert.equal(validateOriginalReadOracle(plan,JSON.parse(JSON.stringify(cookieActionObservation(plan)))).oraclePassed,true);
    const changes=[o=>o.after.cookieObservation.a.cookies=o.before.cookieObservation.a.cookies,
      o=>o.after.cookieObservation.b.cookies=[],o=>o.pageOperations[0].nativeReceipts=o.pageOperations[0].nativeReceipts.filter(r=>!['cookies.set','cookies.remove'].includes(r.stage)),
      o=>o.pageOperations[0].nativeReceipts[1].requestId='foreign',o=>o.pageOperations[1].envelope.operation.args=encodeValue([[plan.bURL]]),
      o=>o.pageOperations[0].envelope.identity={...o.run.identity,ownerEpoch:99},o=>o.pageOperations[0].nativeReceipts.at(-1).receipt[0].documentId='retired',
      o=>o.before.cookieAdmission.observedAt=0,o=>o.before.cookieObservation.permissions.cookies=false,o=>o.before.cookieAdmission.pendingRequestId='foreign',
      o=>o.value.checks.pop(),o=>[o.pageOperations[0].dispatchAt,o.pageOperations[1].dispatchAt]=[o.pageOperations[1].dispatchAt,o.pageOperations[0].dispatchAt],
      o=>o.before.cookieObservation.permissions.bOriginGranted=true,o=>delete o.before.cookieObservation.permissions.bOriginGranted,
      o=>o.after.cookieObservation.permissions.bOriginGranted=true,o=>o.after.cookieObservation.permissions.bOriginPattern='http://127.0.0.1/*'];
    for(const [index,change] of changes.entries()){const o=cookieActionObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o),`Cookie action evidence ${index} must be rejected`);}
  }
});

test('actual runner obtains cookie permission via trusted Start and reads baseline only while the original Worker barrier is held',async()=>{
  const source=await readFile(new URL('./k5-controller-product-native.mjs',import.meta.url),'utf8');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});let originalLane;
  function visit(node){if(!node||typeof node!=='object')return;if(node.type==='ForOfStatement'&&node.right?.name==='originalDefinitions')originalLane=node;
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
  visit(ast);assert(originalLane);const lane=source.slice(originalLane.start,originalLane.end);
  const allow=lane.indexOf('await click(tool,toolId,\'#script-allow-cookies\')'),start=lane.indexOf('runId = await start()'),held=lane.indexOf('barrier.pendingArgs ='),baseline=lane.indexOf('before.cookieObservation=await cookieObservation'),release=lane.indexOf('barrier.release =');
  assert(allow>=0&&allow<start&&start<held&&held<baseline&&baseline<release,'Actual cookie API baseline must follow genuine admission/barrier and precede its release');
  assert(source.includes("chrome.permissions.contains({permissions:['cookies']})"));assert(source.includes("bPage.client.send('Network.getCookies',{urls:[bPage.url]})"));
  assert(source.includes('chrome.permissions.contains({origins:'));assert(lane.indexOf('captureOriginalCaseFailure')<lane.indexOf('originalBarriers.delete(token)'));
});

test('failure capture persists pre-cleanup evidence then settles once and keeps the original error despite observer and cleanup errors',async()=>{
  const error=Object.assign(new Error('cookie baseline failed'),{code:'E_COOKIE_BASELINE',actual:{bOriginGranted:true}}),events=[];
  const captured=await captureOriginalCaseFailure(error,{before:{snapshot:async()=>{events.push('snapshot-before');return {runId:'actual'};},a:async()=>{throw new Error('A read failed');}},
    recordBefore:async data=>{events.push('save-before');assert.equal(data.failure.code,error.code);assert.equal(data.before.reads.snapshot.runId,'actual');},
    cleanup:{release:async()=>{events.push('release');return '503';},stop:async()=>{events.push('stop');throw new Error('Stop unavailable');},retirement:async()=>{events.push('retirement');return {runId:'actual',retirementState:'released'};}},
    after:{snapshot:async()=>{events.push('snapshot-after');return {state:'completed'};},resources:async()=>({counts:{pending:0}}),b:async()=>{throw new Error('B read failed');}}});
  assert.deepEqual(events,['snapshot-before','save-before','release','stop','retirement','snapshot-after']);
  assert.equal(captured.failure.code,'E_COOKIE_BASELINE');assert.deepEqual(captured.failure.actual,{bOriginGranted:true});
  assert.equal(captured.before.readErrors.a.message,'A read failed');assert.equal(captured.cleanup.errors.stop.message,'Stop unavailable');
  assert.equal(captured.cleanup.results.retirement.retirementState,'released');assert.deepEqual(captured.after.reads.resources,{counts:{pending:0}});assert.equal(captured.after.readErrors.b.message,'B read failed');
});

test('admitted run recovery requires unique actual source and barrier params and never selects another run',()=>{
  const plan={sourceSha256:'current-source',params:{nativeBarrierURL:'http://127.0.0.1/barrier?token=current'}},run={runId:'actual',revision:{sourceHash:plan.sourceSha256},paramsWire:encodeRuntimeValue(plan.params)};
  const snapshot=rows=>({rows:{runs:rows.map(value=>({value}))}});
  assert.equal(originalAdmittedRun(snapshot([run]),plan)?.runId,'actual');assert.equal(originalAdmittedRun(snapshot([run]),plan,'actual')?.runId,'actual');
  for(const rows of [[],[{...run,revision:{sourceHash:'other'}}],[{...run,paramsWire:encodeRuntimeValue({nativeBarrierURL:'other'})}],[run,{...run,runId:'duplicate'}],[{...run,paramsWire:{bad:'wire'}}]])assert.equal(originalAdmittedRun(snapshot(rows),plan),null);
  assert.equal(originalAdmittedRun(snapshot([run]),plan,'other'),null);
});

test('actual runner preserves A and B on unresolved retirement and closes both only on confirmed cleanup',async()=>{
  const source=await readFile(new URL('./k5-controller-product-native.mjs',import.meta.url),'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});let lane;
  function visit(node){if(!node||typeof node!=='object')return;if(node.type==='ForOfStatement'&&node.right?.name==='originalDefinitions')lane=node;for(const v of Object.values(node))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
  visit(ast);const tryStatement=lane.body.expression.argument.arguments[1].body.body.find(n=>n.type==='TryStatement'),finalizer=source.slice(tryStatement.finalizer.start,tryStatement.finalizer.end);
  const runFinally=new Function('targetsCloseAllowed','row','log','barrier','originalBarriers','token','aPage','bPage','targets','browserClient','json','directory','definition','errorView','originalFailure','runId','resourceFailure',`return (async()=>${finalizer})()`);
  for(const allowed of [false,true])for(const isOpen of [false,true]){const row={},events=[];
    await runFinally(allowed,row,event=>events.push(event.state),{},new Map([['token',{}]]),'token',{id:'A'},{id:'B'},async()=>[{targetId:'A'},{targetId:'B'}],
      {isOpen,send:async(method,args)=>{events.push(args.targetId);}},async()=>{},'unit-only',{id:'unit-only'},e=>({message:e.message}),new Error('original failure'),'unit-only-run',null);
    if(allowed)assert.deepEqual(events,isOpen?['A','B']:[]);else{assert.deepEqual(row.retainedOriginalTargets,['A','B']);assert(!events.includes('A')&&!events.includes('B'));}
  }
});

function inputObservation(plan) {
  const o=selectorObservation(plan),revision=o.run.revision,target=o.selected;
  Object.assign(o.a,{tabId:1,frameId:0,nativeTargetId:'unit-A-target',inputValue:'Base',inputEvents:[]});
  o.bBefore.inputEvents=[];o.bAfter=structuredClone(o.bBefore);o.aBefore=structuredClone(o.a);
  o.pageOperations=plan.calls.map((call,i)=>{
    const requestId=`unit-input-${i}`,frame={frameId:0,documentId:target.documentId,errorOccurred:false,documentLifecycle:'active'};
    return {tag:'controller-operation',runId:o.run.runId,state:'durable',submissionCount:1,dispatchAt:3+i*2,receiptAt:4+i*2,
      envelope:{requestId,target,revision,identity:{runId:o.run.runId,ownerEpoch:1},operation:{kind:call.kind,method:call.method,args:encodeValue(call.args)}},
      reply:{requestId,value:encodeValue(call.value)},nativeReceipts:[
        {requestId,stage:'webNavigation.getAllFrames',receipt:[{...frame}]},
        call.kind==='packaged'?{requestId,stage:'tabs.sendMessage',receipt:{requestId,runId:o.run.runId,ownerEpoch:1,value:encodeValue(call.value)}}:
          {requestId,stage:'userScripts.execute',receipt:[{frameId:0,documentId:target.documentId,result:{ok:true,value:encodeValue(call.value)}}]},
        {requestId,stage:'webNavigation.getAllFrames',receipt:[{...frame}]}]};
  });
  if(plan.inputAction==='click')o.a.inputEvents=['mousedown','mouseup','click','mousedown','mouseup','click'].map((type,i)=>
    ({type,target:'submit',isTrusted:false,detail:2,button:0,key:null,data:null,value:null,at:i+1}));
  else {
    let value='Base',at=0;
    for(const char of Array.from('AB'+String.fromCodePoint(34,92,128512,20320,22909))) {
      o.a.inputEvents.push({type:'keydown',target:'text',isTrusted:false,key:char,data:null,value,at:++at});value+=char;
      o.a.inputEvents.push({type:'input',target:'text',isTrusted:false,key:null,data:char,value,at:++at});
      for(const type of ['keypress','keyup'])o.a.inputEvents.push({type,target:'text',isTrusted:false,key:char,data:null,value,at:++at});
    }
    o.a.inputValue=value;
  }
  return o;
}

test('original input oracles reject partial steps, foreign native completions, input substitutions and changed documents',()=>{
  const inputUrls={...selectorUrls,aURL:selectorUrls.aURL.replace('family=selector','family=input-actions'),bURL:selectorUrls.bURL.replace('family=selector','family=input-actions')};
  for(const id of ['CMP09-API21-OK','CMP09-API22-OK']) {
    const plan=originalReadPlan(catalog.cases.find(row=>row.id===id),inputUrls);
    assert.equal(validateOriginalReadOracle(plan,inputObservation(plan)).oraclePassed,true);
    for(const change of [o=>delete o.aBefore,o=>delete o.a.inputEvents,o=>o.a.inputEvents.pop(),o=>o.a.inputEvents[0].isTrusted=true,
      o=>o.a.inputEvents[0].target='foreign',o=>o.a.documentId='foreign',o=>o.a.nativeTargetId='foreign',o=>o.bAfter.inputValue='changed',
      o=>o.pageOperations.pop(),o=>o.pageOperations[0].envelope.operation.method='foreign',o=>o.pageOperations[0].envelope.identity.ownerEpoch=2,
      o=>o.pageOperations[0].nativeReceipts.splice(1,1),o=>o.pageOperations[0].nativeReceipts[1].receipt.runId='foreign',
      o=>o.pageOperations[0].nativeReceipts[2].receipt[0].documentId='foreign',o=>o.pageOperations[0].nativeReceipts[1].receipt.value=encodeValue('fake-result'),
      o=>o.value.checks.pop(),o=>o.result.revision.sourceHash='foreign',o=>o.cleanup.after.timers++]) {
      const o=inputObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));
    }
    if(plan.inputAction==='click')for(const change of [o=>o.a.inputEvents[0].detail=1,o=>o.a.inputEvents[0].button=1,o=>o.a.inputValue='changed']) {
      const o=inputObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));
    }
    else for(const change of [o=>o.a.inputValue=o.a.inputValue.replace(String.fromCodePoint(92),''),
      o=>o.a.inputEvents.find(e=>e.type==='input').data='foreign',o=>o.a.inputEvents.find(e=>e.type==='input').value='foreign',
      o=>o.pageOperations[1].nativeReceipts[1].receipt[0].documentId='foreign',
      o=>o.pageOperations[1].nativeReceipts[1].receipt[0].result.value=encodeValue('fake-value'),
      o=>o.pageOperations[2].dispatchAt=3.5]) {
      const o=inputObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));
    }
  }
  const html=fixedReadFixtureHTML('A','input-actions');assert(html.includes('value="Base"'));
  assert(!html.includes('dispatchEvent'));assert(!html.includes('.value='));
});

for(const [name,change] of [
  ['extra foreign-request completion',operation=>{const extra=structuredClone(operation.nativeReceipts[1]);extra.requestId='foreign';extra.receipt.requestId='foreign';operation.nativeReceipts.splice(2,0,extra);}],
  ['document checks entirely before completion',operation=>{operation.nativeReceipts.unshift(operation.nativeReceipts.pop());}]
])test(`original input oracle rejects ${name}`,()=>{
  const inputUrls={...selectorUrls,aURL:selectorUrls.aURL.replace('family=selector','family=input-actions'),bURL:selectorUrls.bURL.replace('family=selector','family=input-actions')};
  for(const id of ['CMP09-API21-OK','CMP09-API22-OK']) {
    const plan=originalReadPlan(catalog.cases.find(row=>row.id===id),inputUrls),o=inputObservation(plan);
    change(o.pageOperations[0]);assert.throws(()=>validateOriginalReadOracle(plan,o));
  }
});

test('six immutable selector drivers retain exact recipes, permission groups and value/error oracles', () => {
  assert.equal(ORIGINAL_READ_IDS.length,26);
  assert.equal(originalReadPermission(ORIGINAL_FIXED_READ_IDS),false);
  assert.equal(originalReadPermission(ORIGINAL_SELECTOR_READ_IDS),true);
  assert.throws(()=>originalReadPermission([ORIGINAL_FIXED_READ_IDS[0],ORIGINAL_SELECTOR_READ_IDS[0]]),/separate owned native profiles/);
  for (const plan of selectorPlans) {
    assert.equal(validateOriginalReadOracle(plan,selectorObservation(plan)).oraclePassed,true);
    assert.equal(plan.userScripts,true);
    assert(plan.source.includes('await axiosx.get(params.nativeBarrierURL);'));
    // Function.toString operands must match the unchanged saved recipe source,
    // including literals and ordering, rather than a guessed runtime callback.
    const operands = [];const ast=parse(plan.source,{ecmaVersion:'latest',allowAwaitOutsideFunction:true,allowReturnOutsideFunction:true});
    function visit(node) {
      if(!node||typeof node!=='object')return;
      if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&node.callee.object.name==='page'&&node.callee.property.name===plan.method) {
        const args=node.arguments.map(arg=>/FunctionExpression$/.test(arg.type)?plan.source.slice(arg.start,arg.end):arg.value);
        operands.push(plan.operationKind==='user-script'?[args[0],args[1],args.slice(2)]:args);
      }
      for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
    }
    visit(ast);assert.deepEqual(operands,plan.calls.map(call=>call.args));
  }
  assert(fixedReadFixtureHTML('A','selector').includes('<span class="item">two</span>'));
  assert.equal(fixedReadFixtureHTML('B','selector'),fixedReadFixtureHTML('B'));
  assert.throws(()=>originalReadPlan(selectorPlans[0].definition,urls),/selector fixture/);
});

test('original click error driver requires actual zero-event observations and exact packaged failure receipts',()=>{
  assert.equal(originalReadPermission(ORIGINAL_CLICK_ERROR_IDS),true);
  const definition=catalog.cases.find(row=>row.id===ORIGINAL_CLICK_ERROR_IDS[0]);
  assert.equal(originalReadFixtureFamily(definition),'click-error');
  const clickUrls={...selectorUrls,aURL:selectorUrls.aURL.replace('family=selector','family=click-error'),bURL:selectorUrls.bURL.replace('family=selector','family=click-error')};
  const plan=originalReadPlan(definition,clickUrls);
  assert.equal(validateOriginalReadOracle(plan,selectorObservation(plan)).oraclePassed,true);
  assert.equal(plan.operationKind,'packaged');assert.equal(plan.calls.length,2);assert.equal(Object.keys(plan.errors).length,4);
  for(const change of [o=>delete o.aBefore,o=>delete o.a.inputEvents,o=>o.a.inputEvents.push({type:'click',isTrusted:false}),
    o=>o.bAfter.inputEvents.push({type:'input',isTrusted:true}),o=>o.pageOperations.push(structuredClone(o.pageOperations[0])),
    o=>o.pageOperations[0].nativeReceipts[0].stage='userScripts.finalFailure',
    o=>o.pageOperations[0].nativeReceipts[0].receipt.ownerEpoch=2,o=>o.pageOperations[0].nativeReceipts[0].receipt.runId='foreign-run',
    o=>o.pageOperations[0].envelope.identity={...o.run.identity,ownerEpoch:2},
    o=>o.value.artifacts['click-delay'].code='E_ARGUMENT_TYPE',o=>o.pageOperations[0].reply.error.code='E_ELEMENT_NOT_FOUND']) {
    const observation=selectorObservation(plan);change(observation);assert.throws(()=>validateOriginalReadOracle(plan,observation));
  }
  const html=fixedReadFixtureHTML('A','click-error');
  assert(html.includes('<button id="submit">Submit</button>'));assert(html.includes('OpenDeskInputEventObservations'));
  assert(!html.includes('dispatchEvent'));assert.throws(()=>originalReadPlan(definition,selectorUrls),/selector fixture/);
});

test('complete original type error case retains all five branches and exactly three actual native failures',()=>{
  const definition=catalog.cases.find(row=>row.id==='CMP09-API22-ERR');
  const typeUrls={...selectorUrls,aURL:selectorUrls.aURL.replace('family=selector','family=type-error'),bURL:selectorUrls.bURL.replace('family=selector','family=type-error')};
  const plan=originalReadPlan(definition,typeUrls);
  assert.equal(plan.fixtureFamily,'type-error');assert.equal(plan.calls.length,3);assert.equal(Object.keys(plan.errors).length,5);
  assert.equal(plan.operationKind,'packaged');assert.equal(plan.method,'type');
  const observed=selectorObservation(plan);assert.equal(validateOriginalReadOracle(plan,observed).oraclePassed,true);
  for(const change of [o=>o.value.artifacts['type-delay'].code='E_ARGUMENT_TYPE',o=>o.value.artifacts['type-object'].code='E_ARGUMENT_TYPE',
    o=>o.pageOperations.push(structuredClone(o.pageOperations[0])),o=>o.a.inputEvents.push({type:'input',isTrusted:false}),
    o=>o.a.readonlyValue='mutated',o=>o.a.inputValue='mutated',o=>o.pageOperations[0].envelope.identity.ownerEpoch=2,
    o=>o.pageOperations[2].nativeReceipts[0].receipt.documentId='foreign']) {
    const o=selectorObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));
  }
  const html=fixedReadFixtureHTML('A','type-error');assert(html.includes('id="readonly"'));assert(html.includes('readonly=""'));
  assert(!html.includes('dispatchEvent'));assert(!html.includes('.value='));
});
test('original constructor cases use the actual ctx factory with four pinned reads or zero invalid-option dispatches',()=>{
  assert.equal(originalReadPermission(ORIGINAL_CONTEXT_READ_IDS),true);
  const [success,failure]=ORIGINAL_CONTEXT_READ_IDS.map(id=>originalReadPlan(catalog.cases.find(row=>row.id===id),selectorUrls));
  for(const plan of [success,failure])assert.equal(validateOriginalReadOracle(plan,selectorObservation(plan)).oraclePassed,true);
  assert.equal(success.calls.length,4);assert.deepEqual(success.assertionExpected['constructor-debug'],[true,true,false,undefined]);
  assert.match(success.source,/new ctx\.ChromePage\(\{debug:false\}\)/);assert.equal(failure.calls.length,0);
  for(const change of [o=>o.pageOperations.pop(),o=>o.pageOperations[1].envelope.requestId=o.pageOperations[0].envelope.requestId,
    o=>o.pageOperations[3].envelope.revision={...o.run.revision,sourceHash:'2'.repeat(64)},
    o=>o.value.checks[0].actual={type:'array',items:Array(4).fill({type:'boolean',value:true})}]){
    const o=selectorObservation(success);change(o);assert.throws(()=>validateOriginalReadOracle(success,o));
  }
  const unexpected=selectorObservation(failure);unexpected.pageOperations=selectorObservation(success).pageOperations;
  assert.throws(()=>validateOriginalReadOracle(failure,unexpected));
});

test('selector oracles reject wrong wire values, fake successful null and altered failure codes', () => {
  for (const plan of selectorPlans) for (const change of [
    o=>o.value.checks[0].actual={type:'null'},o=>o.value.checks.pop(),o=>o.before.userScripts.available=false,
    o=>o.a.bodyHTML='<div id="marker">A</div>',o=>o.pageOperations[0].envelope.operation.args=encodeValue(['wrong']),
    o=>o.pageOperations[0].reply={requestId:o.pageOperations[0].envelope.requestId,value:encodeValue(null)},
  ]) {const o=selectorObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));}
  for (const plan of selectorPlans.filter(p=>Object.keys(p.errors).length)) {
    const o=selectorObservation(plan);o.value.artifacts[Object.keys(plan.errors)[0]].code='E_EFFECT_UNKNOWN';
    assert.throws(()=>validateOriginalReadOracle(plan,o));
  }
});

test('selector failure oracles reject missing, duplicate, wrong-document and unknown native completions', () => {
  for (const plan of selectorPlans.filter(p=>p.calls.some(c=>c.error))) for (const change of [
    r=>r.nativeReceipts=[],r=>r.nativeReceipts.push(structuredClone(r.nativeReceipts[0])),
    r=>r.nativeReceipts[0].receipt.documentId='other-document',r=>r.nativeReceipts[0].requestId='other-operation',
    r=>r.effectState='effect_unknown',r=>r.state='effect_unknown',r=>r.submissionCount=2,r=>r.reply.requestId='other-operation',
  ]) {const o=selectorObservation(plan);change(o.pageOperations[0]);assert.throws(()=>validateOriginalReadOracle(plan,o));}
});

test('host selector original OK/ERR gaps remain unroutable and cannot be replaced by Worker snapshot bodies', () => {
  const blocked = ['CMP02-API12-OK','CMP02-API12-ERR','CMP02-API13-OK','CMP02-API13-ERR'];
  assert.deepEqual(blocked.filter(id=>ORIGINAL_SELECTOR_READ_IDS.includes(id)), []);
  assert.deepEqual(blocked.filter(id=>ORIGINAL_READ_IDS.includes(id)), []);
  for (const id of blocked) {
    const definition = catalog.cases.find(row=>row.id===id);
    assert(definition, `Missing frozen contract ${id}`);
    assert.throws(()=>originalReadPlan(definition, selectorUrls), /no complete native input\/oracle driver/);
    const recipe = recipeFor(definition);
    if (id.endsWith('-OK')) {
      assert.equal(recipe.body, null);
      assert(recipe.gaps.join(' ').includes('no shipped host ctx consumer'));
    } else {
      assert(recipe.body?.includes("page.$"));
      assert(recipe.gaps.join(' ').includes('unavailable in Worker'));
      if (id === 'CMP02-API12-ERR') assert(recipe.gaps.join(' ').includes('DOM context preflight'));
    }
  }
  const limit12 = originalReadPlan(catalog.cases.find(row=>row.id==='CMP02-API12-LIMIT'), selectorUrls);
  const limit13 = originalReadPlan(catalog.cases.find(row=>row.id==='CMP02-API13-LIMIT'), selectorUrls);
  assert(limit12.source.includes('page.snapshot('));
  assert(limit13.source.includes('page.snapshots('));
  assert(limit12.source.includes("reject('worker-dollar'"));
  assert(limit13.source.includes("reject('worker-dollars'"));
});

test('original errors preserve exact original name/message and one dispatch per operand', () => {
  const plan=selectorPlans.find(p=>p.caseId==='CMP03-API14-ERR');
  for (const change of [o=>o.value.artifacts['throw-eval'].cause.name='OtherError',o=>o.value.artifacts['reject-eval'].cause.message='other',
    o=>o.pageOperations[1].reply.error.cause={name:'OtherError',message:'boom'},o=>o.pageOperations.push(structuredClone(o.pageOperations[0])),
    o=>o.pageOperations.pop(),o=>o.preambleOperations.push(structuredClone(o.preambleOperations[0])),
    o=>o.preambleOperations[0].envelope.operation.args=encodeValue([0])]) {
    const o=selectorObservation(plan);change(o);assert.throws(()=>validateOriginalReadOracle(plan,o));
  }
});

test('original fixed-read plans bind immutable 603 contracts and exact A/B fixtures', () => {
  assert.equal(catalog.binding.denominator,603);
  assert.match(catalog.binding.specSha256,/^[a-f0-9]{64}$/);
  for (const plan of plans) {
    assert.equal(plan.userScripts,false);
    assert(plan.source.includes('await axiosx.get(params.nativeBarrierURL);'));
    assert(plan.source.includes(`await page.${plan.method}()`));
    assert.deepEqual(plan.requiredAssertions,[`fixed-${plan.method}`]);
    assert.equal(validateFixedReadOracle(plan,unitObservation(plan)).oraclePassed,true);
  }
  assert(fixedReadFixtureHTML('A').includes('<body><div id="marker">A</div></body>'));
  assert(fixedReadFixtureHTML('B').includes('<title>B-title</title>'));
  assert(fixedReadFixtureHTML('B').includes('value="BaseB"'));
  assert(fixedReadFixtureHTML('B').includes('background:rgb(0,0,255)'));
});

test('original lane rejects unimplemented contracts and weakened fixture inputs', () => {
  assert.throws(()=>fixedReadPlan(catalog.cases.find(row=>row.id==='CMP01-API10-OK'),urls),/no complete native/);
  assert.throws(()=>fixedReadPlan(plans[0].definition,{...urls,aURL:urls.aURL.split('#')[0]}),/fragment/);
  assert.throws(()=>fixedReadPlan(plans[0].definition,{...urls,bURL:urls.aURL}),/fixture URLs must differ/);
});

test('original oracle rejects missing or stale result-owned revision even with correct run revision', () => {
  for (const change of [o=>delete o.result.revision,o=>o.result.revision={...o.result.revision,sourceHash:'stale'},o=>o.result.tag='sdk-service-result',o=>o.result.resultId='other-result']) {
    const observation=unitObservation(plans[0]);change(observation);
    assert.throws(()=>validateFixedReadOracle(plans[0],observation));
  }
});

test('original oracle rejects fabricated assertion coverage, wrong A values and changed B', () => {
  for (const change of [o=>o.value.checks=[],o=>o.value.failure={message:'failed'},o=>o.value.checks[0].actual={type:'string',value:'B-title'},o=>o.value.checks[0].expected={type:'string',value:'B-title'},o=>o.bAfter.bodyHTML='mutated',o=>o.selected.documentId='other-document']) {
    const observation=unitObservation(plans[0]);change(observation);
    assert.throws(()=>validateFixedReadOracle(plans[0],observation));
  }
});

test('original oracle rejects missing dispatch barrier, active A and enabled function permission', () => {
  for (const change of [o=>o.barrier.request=null,o=>o.barrier.release.activeTab.id=1,o=>o.barrier.release.focusedB=false,o=>o.after.activeTab.id=1,o=>o.after.focusedB=false,o=>o.before.userScripts.available=true,o=>o.after.userScripts.available=true]) {
    const observation=unitObservation(plans[1]);change(observation);
    assert.throws(()=>validateFixedReadOracle(plans[1],observation));
  }
});

test('original oracle fails closed for missing or unreleased resource owners', () => {
  for (const change of [o=>delete o.cleanup.before.pending,o=>o.cleanup.after.timers=1,o=>o.cleanup.before.workers=undefined,o=>o.run.retirementState='pending']) {
    const observation=unitObservation(plans[2]);change(observation);
    assert.throws(()=>validateFixedReadOracle(plans[2],observation));
  }
});

test('original oracle rejects an HTTP request or read journal belonging to another operation', () => {
  for (const change of [o=>o.barrier.pendingOperation.runId='other-run',o=>o.barrier.pendingOperation.state='durable',o=>o.barrier.pendingArgs[0].url='http://other.test',
    o=>o.fixedReadOperations=[],o=>o.fixedReadOperations.push(o.fixedReadOperations[0]),o=>o.fixedReadOperations[0].envelope.operation.method='content',
    o=>o.fixedReadOperations[0].submissionCount=2,o=>o.fixedReadOperations[0].dispatchAt=1]) {
    const observation=unitObservation(plans[0]);change(observation);
    assert.throws(()=>validateFixedReadOracle(plans[0],observation));
  }
});

test('original oracle rejects a marker-only B fixture even when it stays unchanged', () => {
  for (const change of [b=>b.bodyHTML='<div id="marker">B</div>',b=>b.inputValue='Base',b=>b.screenshotMarker={color:'rgb(255, 0, 0)',visible:true},b=>b.screenshotMarker={color:'rgb(0, 0, 255)',visible:false}]) {
    const observation=unitObservation(plans[0]);change(observation.bBefore);observation.bAfter=structuredClone(observation.bBefore);
    assert.throws(()=>validateFixedReadOracle(plans[0],observation));
  }
});
