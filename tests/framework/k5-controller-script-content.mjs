import assert from 'node:assert/strict';
import {decodeValue} from '../../src/framework/control/value.js';
import {decodeValue as decodeResultValue} from '../../src/platform/page-port/codec.js';
import {RESOURCE_KEYS,requireResourceCounts} from './k5-controller-native-campaigns.mjs';

export const SCRIPT_CONTENT_ID='SCRIPT-CONTENT-EXACT-DOCUMENT';
export function scriptContentPlan(token) {
  assert.match(token,/^[a-zA-Z0-9-]+$/);
  const id='od-native-'+token,html=`<section id="${id}"><strong>${token}</strong></section>`;
  const content=`await Promise.resolve();const node=document.createElement('section');node.id=${JSON.stringify(id)};node.innerHTML=${JSON.stringify('<strong>'+token+'</strong>')};document.body.appendChild(node);globalThis.__opendeskContentProof=${JSON.stringify(token)};`;
  const source=`const returned=await page.addScriptTag({content:params.content});const node=await page.$eval(params.selector,e=>({html:e.outerHTML,text:e.textContent}));const main=await page.eval('globalThis.__opendeskContentProof',{mode:'expression'});const isolated=await page.evaluate(()=>globalThis.__opendeskContentProof);return {returned,node,main,isolated,workerHasDocument:typeof document!=='undefined'};`;
  return {source,params:{content,selector:'#'+id,token},expected:{returned:undefined,node:{html,text:token},main:token,isolated:undefined,workerHasDocument:false}};
}

// This oracle accepts supplemental native evidence only. It cannot close API16.
export function validateScriptContentJournal({run,result,operations,selected,revision,value,expected,resourcesBefore,resourcesAfter,beforeA,afterA,beforeB,afterB}) {
  assert.equal(run.tag,'controller-run');assert.equal(run.state,'completed');
  assert.equal(run.workerRetired,true);assert.equal(run.retirementState,'released');
  assert.equal(result.tag,'controller-result');assert.equal(result.state,'completed');assert.equal(result.outcome.ok,true);
  assert.equal(result.runId,run.runId);assert.equal(result.resultId,run.resultId);
  for(const pin of [run.revision,result.revision]) {
    assert.equal(pin.scriptId,revision.scriptId);assert.equal(pin.revision,revision.revision);assert.equal(pin.sourceHash,revision.sourceHash);
  }
  for(const name of ['tabId','frameId','documentId'])assert.equal(run.target[name],selected[name]);
  assert.deepEqual(value,expected);assert.deepEqual(decodeResultValue(result.outcome.valueWire),expected);
  assert.equal(operations.length,4);assert.equal(new Set(operations.map(o=>o.envelope.requestId)).size,4);
  for(const operation of operations){assert(Number.isSafeInteger(operation.dispatchAt));assert(Number.isSafeInteger(operation.receiptAt));assert(operation.receiptAt>=operation.dispatchAt);}
  assert.equal(new Set(operations.map(o=>o.dispatchAt)).size,4,'Actual dispatch ordering must be observable');
  operations=[...operations].sort((a,b)=>a.dispatchAt-b.dispatchAt);
  for(let index=1;index<operations.length;index++)assert(operations[index-1].receiptAt<=operations[index].dispatchAt,'Each actual await must complete before the following dispatch');
  const methods=['eval','$eval','eval','evaluate'],values=[undefined,expected.node,expected.main,undefined];
  for(const [index,operation] of operations.entries()) {
    assert.equal(operation.tag,'controller-operation');assert.equal(operation.runId,run.runId);
    assert.equal(operation.state,'durable');assert.equal(operation.submissionCount,1);
    const envelope=operation.envelope;assert.equal(envelope.operation.kind,'user-script');assert.equal(envelope.operation.method,methods[index]);
    assert.equal(envelope.identity.runId,run.runId);assert.equal(envelope.identity.ownerEpoch,run.identity.ownerEpoch);
    assert.equal(envelope.revision.sourceHash,revision.sourceHash);assert.equal(envelope.revision.revision,revision.revision);
    for(const name of ['tabId','frameId','documentId'])assert.equal(envelope.target[name],selected[name]);
    assert.equal(operation.reply.requestId,envelope.requestId);assert.equal(operation.reply.error,undefined);
    assert.deepEqual(decodeValue(operation.reply.value),values[index]);
    const receipts=operation.nativeReceipts;assert(Array.isArray(receipts));
    for(const receipt of receipts)assert.equal(receipt.requestId,envelope.requestId);
    const native=receipts.filter(r=>r.stage==='userScripts.execute');assert.equal(native.length,1);
    assert.equal(native[0].receipt.length,1);const completion=native[0].receipt[0];
    assert.equal(completion.frameId,selected.frameId);assert.equal(completion.documentId,selected.documentId);
    assert.equal(completion.error,undefined);assert.equal(completion.result.ok,true);assert.deepEqual(decodeValue(completion.result.value),values[index]);
    const nativeIndex=receipts.indexOf(native[0]),documentReads=receipts.filter(r=>r.stage==='webNavigation.getAllFrames');
    assert(documentReads.some(r=>receipts.indexOf(r)<nativeIndex)&&documentReads.some(r=>receipts.indexOf(r)>nativeIndex));
  }
  const first=decodeValue(operations[0].envelope.operation.args);
  assert.deepEqual(first,[revision.params.content,{mode:'statement'}]);
  assert.equal(decodeValue(operations[1].envelope.operation.args)[0],revision.params.selector);
  assert.deepEqual(decodeValue(operations[2].envelope.operation.args),['globalThis.__opendeskContentProof',{mode:'expression'}]);
  const isolated=decodeValue(operations[3].envelope.operation.args);assert.equal(isolated[0].mode,'function');assert.deepEqual(isolated[1],[]);
  assert.equal(beforeA.nodeHTML,null);assert.equal(beforeA.nodeCount,0);assert.equal(beforeA.marker,undefined);
  assert.equal(afterA.nodeCount,1);assert.equal(afterA.nodeHTML,expected.node.html);assert.equal(afterA.marker,expected.main);
  assert.equal(afterA.documentURL,beforeA.documentURL);assert.equal(afterA.documentURL,selected.url);
  assert.deepEqual(afterB,beforeB);assert.equal(beforeB.nodeHTML,null);assert.equal(beforeB.nodeCount,0);assert.equal(beforeB.marker,undefined);
  const beforeCounts=requireResourceCounts(resourcesBefore),afterCounts=requireResourceCounts(resourcesAfter);
  assert.deepEqual(Object.keys(beforeCounts).sort(),[...RESOURCE_KEYS].sort());assert.deepEqual(afterCounts,beforeCounts);
  return {exactDocument:true,mainDomModified:true,undefinedReturn:true,userScriptIsolated:true,workerHasNoDocument:true,nativeCompletions:4,resourcesReleased:true,formalAccepted:false};
}
