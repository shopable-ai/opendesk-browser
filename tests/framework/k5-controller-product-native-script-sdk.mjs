import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {decodeValue} from '../../src/framework/control/value.js';
import {decodeValue as decodeRuntimeValue} from '../../src/platform/page-port/codec.js';
import {requireResourceCounts} from './k5-controller-native-campaigns.mjs';

export const SCRIPT_SDK_ID = 'RESOURCE01-API16-OK';
export function decodeScriptSdkResult(result) { return decodeRuntimeValue(result.outcome.valueWire); }
export function scriptSdkPlan(definition,{sdkURL,sdkRoot,key,barrierURL,middleBarrierURL}) {
  assert.equal(definition.id,SCRIPT_SDK_ID);assert.equal(definition.required,true);
  assert.equal(definition.source.symbol,'ChromePage.addScriptTag');
  assert.equal(sdkURL,new URL('framework/sdk-main.js',sdkRoot).href);
  assert.equal(new URL(sdkURL).protocol,'chrome-extension:');
  assert.equal(new URL(barrierURL).origin,new URL(middleBarrierURL).origin);
  const expression=phase=>`(async()=>{const hello=await OpenDeskSDK.ready(),root=await OpenDeskSDK.service.bexUrl(),key=${JSON.stringify(key+'-')}+${phase},value={marker:${JSON.stringify(key)},phase:${phase}};
const promise=OpenDeskSDK.AppLocal.setItem(key,value),isPromise=promise instanceof Promise,set=await promise,read=await OpenDeskSDK.AppLocal.getItem(key),removed=await OpenDeskSDK.AppLocal.removeItem(key);
return {hello,root,isPromise,set,read,removed,diagnostics:OpenDeskSDK.diagnostics()};})()`;
  const firstExpression=expression(1),secondExpression=expression(2);
  const params={sdkURL,sdkRoot,key,nativeBarrierURL:barrierURL,nativeSdkMiddleBarrierURL:middleBarrierURL,firstExpression,secondExpression};
  const source=`await axiosx.get(params.nativeBarrierURL);
const firstReturn=await page.addScriptTag({url:params.sdkURL}),first=await page.evaluateExpression(params.firstExpression);
await axiosx.get(params.nativeSdkMiddleBarrierURL);
const secondReturn=await page.addScriptTag({url:params.sdkURL}),second=await page.evaluateExpression(params.secondExpression);
return {caseId:${JSON.stringify(SCRIPT_SDK_ID)},firstReturn,first,secondReturn,second};`;
  return {caseId:SCRIPT_SDK_ID,definition,source,params,sourceSha256:createHash('sha256').update(source).digest('hex'),
    calls:[{kind:'packaged',method:'addScriptTag',args:[{url:sdkURL}]},{kind:'user-script',method:'evaluateExpression',args:[firstExpression]},
      {kind:'packaged',method:'addScriptTag',args:[{url:sdkURL}]},{kind:'user-script',method:'evaluateExpression',args:[secondExpression]}]};
}

export function validateScriptSdkOracle(plan,o) {
  const {selected,run,result,revision,value}=o;
  assert.equal(value.caseId,SCRIPT_SDK_ID);assert.equal(value.firstReturn,undefined);assert.equal(value.secondReturn,undefined);
  assert.equal(run.state,'completed');assert.equal(run.retirementState,'released');assert.equal(result.state,'completed');
  assert.equal(result.tag,'controller-result');assert.equal(result.runId,run.runId);assert.equal(result.resultId,run.resultId);
  assert.equal(revision.sourceHash,plan.sourceSha256);assert.deepEqual(result.revision,run.revision);
  assert.equal(result.revision.sourceHash,revision.sourceHash);assert.equal(result.revision.revision,revision.revision);
  assert.equal(run.target.documentId,selected.documentId);assert.equal(run.target.tabId,selected.tabId);
  assert.deepEqual(decodeRuntimeValue(run.paramsWire),plan.params);
  for(const [index,sdk] of [value.first,value.second].entries()) {
    assert.equal(sdk.hello.ready,true);assert.deepEqual(sdk.root,{url:plan.params.sdkRoot});assert.equal(sdk.isPromise,true);
    assert.equal(sdk.set,undefined);assert.equal(sdk.removed,undefined);
    assert.deepEqual(sdk.read,{marker:plan.params.key,phase:index+1});assert.equal(sdk.diagnostics.pending,0);
  }
  assert.deepEqual(requireResourceCounts(o.before),requireResourceCounts(o.after),'Controller and SDK must restore their six numeric baselines');
  for(const owner of ['main','isolated']) {
    const counts=r=>owner==='main'?r.owners.main.counts:r.owners.isolated[0].result.relay.counts;
    for(const resource of [o.before,o.middle,o.after])requireResourceCounts({counts:counts(resource)});
    assert.deepEqual(counts(o.before),counts(o.middle),'First URL reload grew document listeners/resources');
    assert.deepEqual(counts(o.middle),counts(o.after),'Second URL reload grew document listeners/resources');
  }
  assert.deepEqual(o.bBefore,o.bAfter);assert.equal(o.bHasSdk,false);
  const operations=[...o.operations].sort((a,b)=>a.dispatchAt-b.dispatchAt||a.receiptAt-b.receiptAt);
  assert.equal(operations.length,plan.calls.length);
  for(const [i,operation] of operations.entries()) {
    const call=plan.calls[i];assert.equal(operation.state,'durable');assert.equal(operation.submissionCount,1);
    assert.equal(operation.runId,run.runId);assert.equal(operation.envelope.identity.ownerEpoch,run.identity.ownerEpoch);
    assert.equal(operation.envelope.target.documentId,selected.documentId);assert.equal(operation.envelope.target.tabId,selected.tabId);
    assert.deepEqual(operation.envelope.revision,run.revision);assert.equal(operation.envelope.operation.kind,call.kind);
    assert.equal(operation.envelope.operation.method,call.method);assert.deepEqual(decodeValue(operation.envelope.operation.args),call.args);
    const handshakes=operation.nativeReceipts.filter(r=>r.receipt?.type==='OPENDESK_CONTROLLER_PAGE_SESSION_V1');
    assert(handshakes.length<=1);
    for(const handshake of handshakes){assert.equal(handshake.stage,'tabs.sendMessage');assert.equal(handshake.requestId,operation.envelope.requestId);assert.equal(handshake.receipt.ready,true);}
    const completion=operation.nativeReceipts.filter(r=>r.stage===(call.kind==='packaged'?'tabs.sendMessage':'userScripts.execute')&&r.receipt?.type!=='OPENDESK_CONTROLLER_PAGE_SESSION_V1');
    assert.equal(completion.length,1);assert.equal(completion[0].requestId,operation.envelope.requestId);
    if(call.kind==='packaged') {const reply=completion[0].receipt;assert.equal(reply.requestId,operation.envelope.requestId);assert.equal(reply.runId,run.runId);assert.equal(reply.ownerEpoch,run.identity.ownerEpoch);assert.equal(reply.error,undefined);assert.equal(decodeValue(reply.value),undefined);}
    else {const reply=completion[0].receipt;assert.equal(reply.length,1);assert.equal(reply[0].documentId,selected.documentId);assert.equal(reply[0].frameId,selected.frameId);assert.equal(reply[0].result.ok,true);assert.deepEqual(decodeValue(reply[0].result.value),i===1?value.first:value.second);}
  }
  const loads=o.network.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url===plan.params.sdkURL);
  assert.equal(loads.length,2,'Both public addScriptTag calls must really load the fixed SDK resource');
  assert.equal(new Set(loads.map(e=>e.params.requestId)).size,2);
  for(const load of loads) {assert.equal(load.params.type,'Script');assert(o.network.some(e=>e.method==='Network.loadingFinished'&&e.params.requestId===load.params.requestId));assert(!o.network.some(e=>e.method==='Network.loadingFailed'&&e.params.requestId===load.params.requestId));}
  assert.equal(o.sdkJournal.length,8,'Two SDK cycles must settle bexUrl and three original AppLocal operations each');
  const expectedMethods=['bexUrl','APPLOCAL_SETITEM','APPLOCAL_GETITEM','APPLOCAL_REMOVEITEM'];
  for(const method of expectedMethods)assert.equal(o.sdkJournal.filter(j=>j.operation.method===method).length,2);
  for(const {operation,run:sdkRun,result:sdkResult} of o.sdkJournal) {
    assert.equal(operation.tag,'sdk-operation');assert.equal(operation.tabId,selected.tabId);assert.equal(operation.documentId,selected.documentId);assert.equal(operation.state,'durable');
    assert.equal(sdkRun.state,'completed');assert.equal(sdkRun.runId,operation.runId);assert.equal(sdkRun.resultId,operation.resultId);
    assert.equal(sdkResult.tag,'sdk-result');assert.equal(sdkResult.state,'durable');assert.equal(sdkResult.runId,operation.runId);assert.equal(sdkResult.resultId,operation.resultId);assert.equal(sdkResult.opId,operation.opId);
    const reply=decodeRuntimeValue(sdkResult.valueWire);
    if(operation.method==='bexUrl')assert.deepEqual(reply,{url:plan.params.sdkRoot});
    else if(operation.method==='APPLOCAL_GETITEM')assert([value.first.read,value.second.read].some(v=>JSON.stringify(v)===JSON.stringify(reply)));
    else assert.equal(reply,undefined);
  }
  return {oraclePassed:true,actualUrlLoads:loads.length,actualSdkPromises:o.sdkJournal.length,repeatedDocumentResourcesStable:true,formalAccepted:false};
}

export async function runScriptSdkOriginal(definition,row,c) {
  const {origin,seed,newPage,tool,toolId,browserClient,originalBarriers,chooseBorrowed,click,evaluate,until,select,option,pageObservation,sdkResources,snapshot,commit,json,directory,start,durable,readUI,targets,errorView,catalog}=c;
  const token=randomUUID(),barrier={token},middle={token:token+'-sdk-middle'};
  const aPage=await newPage(`${origin}/original-api48?seed=${seed}&role=A&family=selector#A-fragment`),bPage=await newPage(`${origin}/original-api48?seed=${seed}&role=B&family=selector#B-fragment`);
  const network=[];aPage.client.onEvent(event=>{if(event.method.startsWith('Network.'))network.push(event);});await aPage.client.send('Network.enable');
  originalBarriers.set(token,barrier);originalBarriers.set(middle.token,middle);
  let selected,revision,plan,runId,retired=false,before;
  const release=pending=>{if(pending.response&&!pending.response.writableEnded){pending.release={at:Date.now()};pending.response.setHeader('content-type','application/json');pending.response.end(JSON.stringify({released:true}));}};
  try {
    selected=await chooseBorrowed(aPage);
    await click(tool,toolId,'#sdk-refresh');
    await until(()=>evaluate(tool,`!!document.querySelector('#sdk-tab option[value="${selected.tabId}"]')`),'SDK original actual tab option');
    await select(tool,'#sdk-tab',selected.tabId);
    await until(()=>evaluate(tool,`!!document.querySelector('#sdk-document option[value="${selected.documentId}"]')`),'SDK original exact document option');
    await select(tool,'#sdk-document',selected.documentId);
    for(const capability of ['storage.session','resources.packaged'])if(!await evaluate(tool,`document.querySelector('#sdk-capabilities input[value="${capability}"]').checked`))await click(tool,toolId,`#sdk-capabilities input[value="${capability}"]`);
    await click(tool,toolId,'#sdk-install');
    await until(()=>evaluate(tool,'document.querySelector("#sdk-status").dataset.state==="installed"'),'SDK original real workbench authorization/install',Number(option('permission-timeout','180000')));
    const installedHello=await evaluate(aPage.client,'OpenDeskSDK.ready()');assert.equal(installedHello.ready,true);
    const sdkURL=await evaluate(tool,"chrome.runtime.getURL('framework/sdk-main.js')"),sdkRoot=await evaluate(tool,"chrome.runtime.getURL('')");
    plan=scriptSdkPlan(definition,{sdkURL,sdkRoot,key:token,barrierURL:`${origin}/original-api48-barrier?token=${token}`,middleBarrierURL:`${origin}/original-api48-barrier?token=${middle.token}`});
    const bBefore=await pageObservation(bPage);before=await sdkResources(aPage,selected);const journalBefore=await snapshot(),beforeKeys=new Set(journalBefore.rows.commandJournal.map(r=>JSON.stringify(r.key)));
    revision=await commit(plan.source,plan.params);row.input={...plan,selected,installedHello,original:definition.input,expected:definition.expected,catalog};
    await json(`${directory}/original-${definition.id}-input.json`,{...row.input,before,bBefore});
    const networkStart=network.length;runId=await start();
    for(const [pending,url] of [[barrier,plan.params.nativeBarrierURL],[middle,plan.params.nativeSdkMiddleBarrierURL]]) {
      await until(()=>pending.request&&!pending.response.destroyed,'SDK original actual Worker HTTP barrier');
      pending.operation=await until(async()=> (await snapshot(tool,{runId})).rows.commandJournal.find(r=>r.value.tag==='controller-operation'&&r.value.runId===runId&&r.value.state==='dispatched'&&r.value.envelope?.operation.method==='AXIOS_GET'&&decodeValue(r.value.envelope.operation.args)[0].url===url)?.value,'SDK original exact admitted barrier operation');
      if(pending===middle)pending.resources=await sdkResources(aPage,selected,false);
      await json(`${directory}/original-${definition.id}-${pending===barrier?'before-url':'before-repeat'}.json`,{runId,revision,selected,request:pending.request,operation:pending.operation,resources:pending.resources});
      release(pending);
    }
    const actual=await durable(runId,tool,true);retired=actual.run.retirementState==='released';const finalSnapshot=await snapshot();
    const sdkJournal=finalSnapshot.rows.commandJournal.filter(r=>r.value.tag==='sdk-operation'&&!beforeKeys.has(JSON.stringify(r.key))&&r.value.tabId===selected.tabId&&r.value.documentId===selected.documentId).map(({value:operation})=>({operation,run:finalSnapshot.rows.runs.find(r=>r.value.runId===operation.runId)?.value,result:finalSnapshot.rows.results.find(r=>r.value.resultId===operation.resultId)?.value}));
    const observation={selected,revision,run:actual.run,result:actual.result,value:decodeScriptSdkResult(actual.result),before,middle:middle.resources,after:await sdkResources(aPage,selected),bBefore,bAfter:await pageObservation(bPage),bHasSdk:await evaluate(bPage.client,'typeof OpenDeskSDK!=="undefined"'),
      operations:actual.snapshot.rows.commandJournal.filter(r=>r.value.tag==='controller-operation'&&r.value.runId===runId&&r.value.envelope?.operation.kind!=='service').map(r=>r.value),sdkJournal,network:network.slice(networkStart)};
    await json(`${directory}/original-${definition.id}-observation.json`,observation);const oracle=validateScriptSdkOracle(plan,observation);await readUI(runId);
    return {...observation,oracle,formalAccepted:false};
  } finally {
    if(runId&&!retired&&tool.isOpen) {
      const failure=await snapshot(tool,{runId});await json(`${directory}/original-${definition.id}-failure-before-cleanup.json`,failure);
      const run=failure.rows.runs.find(r=>r.value.runId===runId)?.value;assert.equal(run?.revision.sourceHash,revision.sourceHash);
      release(barrier);release(middle);
      try {if(!run.workerRetired&&await evaluate(tool,'!document.querySelector("#script-stop").disabled'))await click(tool,toolId,'#script-stop');const terminal=await durable(runId,tool,true);retired=terminal.run.retirementState==='released';await json(`${directory}/original-${definition.id}-failure-after-cleanup.json`,terminal);}catch(error){await json(`${directory}/original-${definition.id}-cleanup-unresolved.json`,errorView(error));}
    }
    release(barrier);release(middle);originalBarriers.delete(token);originalBarriers.delete(middle.token);
    if(!runId||retired){for(const page of [aPage,bPage])if(browserClient.isOpen&&(await targets()).some(t=>t.targetId===page.id))await browserClient.send('Target.closeTarget',{targetId:page.id});}
    else row.retainedOriginalTargets=[aPage.id,bPage.id];
  }
}
