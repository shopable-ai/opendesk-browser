import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {encodeValue} from '../../src/framework/control/value.js';
import {encodeValue as encodeResultValue} from '../../src/platform/page-port/codec.js';
import {SCRIPT_CONTENT_ID,scriptContentPlan,validateScriptContentJournal} from './k5-controller-script-content.mjs';

// Component fixtures only: no browser, native receipt or formal PASS is created.
const plan=scriptContentPlan('component-proof');
function fixture() {
  const selected={tabId:7,frameId:0,documentId:'component-document',url:'http://127.0.0.1/proof'};
  const revision={scriptId:'component-script',revision:1,sourceHash:createHash('sha256').update(plan.source).digest('hex'),...plan};
  const run={tag:'controller-run',runId:'component-run',resultId:'component-result',identity:{ownerEpoch:1},target:selected,revision,
    state:'completed',workerRetired:true,retirementState:'released'};
  const result={tag:'controller-result',runId:run.runId,resultId:run.resultId,revision,state:'completed',outcome:{ok:true,valueWire:encodeResultValue(plan.expected)}};
  const values=[undefined,plan.expected.node,plan.expected.main,undefined];
  const args=[[plan.params.content,{mode:'statement'}],[plan.params.selector,'e=>({html:e.outerHTML,text:e.textContent})',[]],
    ['globalThis.__opendeskContentProof',{mode:'expression'}],[{mode:'function',source:'()=>globalThis.__opendeskContentProof'},[]]];
  const operations=['eval','$eval','eval','evaluate'].map((method,index)=>{
    const requestId='component-request-'+index;
    return {tag:'controller-operation',runId:run.runId,state:'durable',submissionCount:1,dispatchAt:index*10+1,receiptAt:index*10+2,
      envelope:{requestId,identity:{runId:run.runId,ownerEpoch:1},target:selected,revision,operation:{method,kind:'user-script',args:encodeValue(args[index])}},
      reply:{requestId,value:encodeValue(values[index])},nativeReceipts:[
        {stage:'webNavigation.getAllFrames',requestId},
        {stage:'userScripts.execute',requestId,receipt:[{frameId:0,documentId:selected.documentId,result:{ok:true,value:encodeValue(values[index])}}]},
        {stage:'webNavigation.getAllFrames',requestId}]};
  });
  const counts={pending:0,timers:0,subscriptions:31,ports:1,workers:0,blobs:0};
  const resources={scope:'extension-tool-document',counts};
  const beforeA={nodeHTML:null,nodeCount:0,marker:undefined,documentURL:selected.url};
  const beforeB={...beforeA,documentURL:'http://127.0.0.1/decoy'};
  return structuredClone({run,result,revision,selected,operations,value:plan.expected,expected:plan.expected,
    resourcesBefore:resources,resourcesAfter:resources,beforeA,afterA:{...beforeA,nodeHTML:plan.expected.node.html,nodeCount:1,marker:plan.expected.main},beforeB,afterB:beforeB});
}
test('supplemental content plan modifies target HTML through the public API and awaits its completion',()=>{
  assert.equal(SCRIPT_CONTENT_ID,'SCRIPT-CONTENT-EXACT-DOCUMENT');
  parse(plan.source,{ecmaVersion:'latest',allowAwaitOutsideFunction:true,allowReturnOutsideFunction:true});
  parse(plan.params.content,{ecmaVersion:'latest',allowAwaitOutsideFunction:true});
  assert(plan.source.includes('await page.addScriptTag'));assert(plan.params.content.includes('await Promise.resolve()'));
  assert(plan.params.content.includes('node.innerHTML'));assert.equal(plan.expected.returned,undefined);assert.equal(plan.expected.isolated,undefined);
  assert.throws(()=>scriptContentPlan('injected";'),/match/);
});
test('complete component oracle retains supplemental/nonformal status',()=>{
  assert.equal(validateScriptContentJournal(fixture()).formalAccepted,false);
});
test('IDB key iteration order cannot substitute for actual dispatch ordering',()=>{
  const f=fixture();f.operations.reverse();assert.equal(validateScriptContentJournal(f).nativeCompletions,4);
});
const mutations=[
  ['stale result',f=>f.result.runId='other'],['wrong result id',f=>f.result.resultId='other'],
  ['stale result revision',f=>f.result.revision={...f.result.revision,sourceHash:'wrong'}],
  ['unretired Worker',f=>f.run.workerRetired=false],['unreleased retirement',f=>f.run.retirementState='retiring'],
  ['fake undefined return',f=>f.value={...f.value,returned:true}],
  ['wrong result wire profile',f=>f.result.outcome.valueWire=encodeValue(plan.expected)],
  ['wrong dispatch order',f=>{f.operations[0].dispatchAt=31;f.operations[0].receiptAt=32;f.operations[3].dispatchAt=1;f.operations[3].receiptAt=2;}],
  ['ambiguous dispatch order',f=>f.operations[1].dispatchAt=f.operations[0].dispatchAt],
  ['unawaited dispatch',f=>f.operations[0].receiptAt=15],
  ['missing native submission',f=>f.operations[0].submissionCount=0],
  ['replayed submission',f=>f.operations[0].submissionCount=2],['wrong document',f=>f.operations[0].envelope.target={...f.selected,documentId:'other'}],
  ['stale owner',f=>f.operations[0].envelope.identity.ownerEpoch=2],
  ['stale source',f=>f.operations[0].envelope.revision={...f.revision,sourceHash:'wrong'}],
  ['missing native receipt',f=>f.operations[0].nativeReceipts.splice(1,1)],
  ['wrong receipt document',f=>f.operations[0].nativeReceipts[1].receipt[0].documentId='other'],
  ['duplicate receipt',f=>f.operations[0].nativeReceipts.push(structuredClone(f.operations[0].nativeReceipts[1]))],
  ['missing postdocument check',f=>f.operations[0].nativeReceipts.pop()],
  ['replaced content',f=>f.operations[0].envelope.operation.args=encodeValue(['other',{mode:'statement'}])],
  ['wrong target mutation',f=>f.afterA.nodeHTML='<p>other</p>'],['duplicate mutation',f=>f.afterA.nodeCount=2],
  ['decoy mutation',f=>f.afterB={...f.beforeB,nodeHTML:f.expected.node.html}],
  ['navigated target',f=>f.afterA.documentURL+='changed'],
  ['leaked resource',f=>f.resourcesAfter={...f.resourcesAfter,counts:{...f.resourcesAfter.counts,workers:1}}]
];
for(const [label,mutate] of mutations)test('script content oracle rejects '+label,()=>{
  const f=fixture();mutate(f);assert.throws(()=>validateScriptContentJournal(f));
});
