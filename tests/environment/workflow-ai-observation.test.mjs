import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowObservation,WORKFLOW_OBSERVE_SOURCE} from '../../src/ui/workflow/observation.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {digestUtf8} from '../../src/platform/protocol.js';

async function fixture() {
  const target={windowId:2,tabId:3,frameId:0,documentId:'document-one',origin:'https://example.com',url:'https://example.com/path?private=never-upload#fragment'};
  const sourceHash=await digestUtf8(WORKFLOW_OBSERVE_SOURCE),calls=[],owners=[];let granted=true,stale=false;
  const result={runId:'run-one',resultId:'result-one',revision:{sourceHash},outcome:{ok:true,valueWire:encodeValue({kind:'semantic-dom-summary',
    document:{documentId:target.documentId,url:target.url},nodes:[{role:'button',name:'Search',text:'Search'}],truncated:false})}};
  const page={capture:()=>({...target,status:'available'}),revalidate:async()=>{if(stale)throw Object.assign(Error('stale'),{code:'E_DOCUMENT_STALE'});}};
  const host={currentRun:null,executionPending:false,completion:Promise.resolve({state:'completed'}),
    start:async request=>{calls.push(request);return {runId:'run-one',revision:{sourceHash}};},
    controller:{snapshotControllerRun:async()=>({run:{runId:'run-one',revision:{sourceHash}},results:[result]})},stop:async()=>{}};
  const service=createWorkflowObservation({api:{permissions:{contains:async()=>granted}},host,currentPageTarget:page,onRunOwner:id=>owners.push(id)});
  return {target,result,calls,owners,page,host,service,revoke(){granted=false;},stale(){stale=true;}};
}
test('only fixed observe code reaches original RunHost; bounded receipt omits full URL',async t=>{
  const f=await fixture();t.after(()=>f.service.dispose());const receipt=await f.service.observe(f.target,{requestId:'observe-one'});
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].source.sourceUtf8,WORKFLOW_OBSERVE_SOURCE);
  assert.deepEqual(f.calls[0].params,{});assert.equal(f.calls[0].target.expectedUrl,f.target.url);
  assert.equal(receipt.resultId,'result-one');assert.equal(receipt.summary.origin,'https://example.com');
  assert.doesNotMatch(JSON.stringify(receipt),/never-upload|fragment|private=/);assert.equal(f.owners.at(-1),null);
  await assert.rejects(f.service.observe(f.target,{requestId:'observe-one'}),{code:'E_AI_APPROVAL'});assert.equal(f.calls.length,1);
});
for(const boundary of ['permission','document','busy','cancelled'])test('observe rejects '+boundary+' before dispatch',async t=>{
  const f=await fixture();t.after(()=>f.service.dispose());const controller=new AbortController();
  if(boundary==='permission')f.revoke();if(boundary==='document')f.stale();if(boundary==='busy')f.host.currentRun='other';if(boundary==='cancelled')controller.abort();
  await assert.rejects(f.service.observe(f.target,{requestId:'observe-denied',signal:controller.signal}));assert.equal(f.calls.length,0);
});
test('website revocation after observation withholds data from model',async t=>{
  const f=await fixture();t.after(()=>f.service.dispose());
  f.host.controller.snapshotControllerRun=async()=>{f.revoke();return {results:[f.result]};};
  await assert.rejects(f.service.observe(f.target,{requestId:'observe-revoked'}),{code:'E_PERMISSION'});assert.equal(f.calls.length,1);
});
for(const defect of ['no-result','wrong-source','wrong-document','unknown'])test('observe requires a matching durable receipt: '+defect,async t=>{
  const f=await fixture();t.after(()=>f.service.dispose());
  if(defect==='no-result')f.host.controller.snapshotControllerRun=async()=>({results:[]});
  if(defect==='wrong-source')f.result.revision.sourceHash='0'.repeat(64);
  if(defect==='wrong-document')f.result.outcome.valueWire=encodeValue({kind:'semantic-dom-summary',document:{documentId:'other',url:f.target.url},nodes:[]});
  if(defect==='unknown')f.host.completion=Promise.resolve({state:'paused_unknown'});
  await assert.rejects(f.service.observe(f.target,{requestId:'observe-bad'}));assert.equal(f.calls.length,1);
});

test('navigation during an observation withholds the old document durable result',async t=>{
  const f=await fixture();t.after(()=>f.service.dispose());let complete;
  f.host.completion=new Promise(resolve=>{complete=resolve;});
  let current={...f.target};
  f.page.capture=()=>({...current,status:'available'});
  f.page.revalidate=async captured=>{
    if(captured.documentId!==current.documentId||captured.url!==current.url)
      throw Object.assign(Error('document changed while reading'),{code:'E_DOCUMENT_STALE'});
  };
  const result=f.service.observe(f.target,{requestId:'navigate-while-reading'});
  const rejected=assert.rejects(result,{code:'E_DOCUMENT_STALE'});
  for(let i=0;i<50&&f.calls.length===0;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(f.calls.length,1);
  current={...f.target,documentId:'document-two',url:'https://example.com/next'};
  // The original result remains perfectly valid for the old document. It must
  // still be withheld from the model after the current document changes.
  complete({state:'completed'});await rejected;
  assert.equal(f.calls.length,1);assert.equal(f.owners.at(-1),null);
});

test('cancellation before a late RunHost claim stops that exact run and withholds its result',async t=>{
  const f=await fixture();t.after(()=>f.service.dispose());const stops=[];let release,reads=0;
  f.host.start=request=>{f.calls.push(request);f.host.executionPending=true;return new Promise(resolve=>{
    release=()=>{f.host.currentRun='run-one';f.host.executionPending=false;resolve({runId:'run-one',revision:f.result.revision});};
  });};
  f.host.stop=async request=>{stops.push(request);f.host.currentRun=null;};
  f.host.controller.snapshotControllerRun=async()=>{reads++;return {results:[f.result]};};
  const controller=new AbortController();
  const result=f.service.observe(f.target,{requestId:'late-claim',signal:controller.signal});
  const rejected=assert.rejects(result,{code:'E_CANCELLED'});
  for(let i=0;i<50&&!release;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(typeof release,'function');controller.abort();release();await rejected;
  assert.deepEqual(stops,[{controller:true,runId:'run-one',reason:'E_CANCELLED'}]);
  assert.equal(reads,0);assert.equal(f.calls.length,1);assert.equal(f.owners.at(-1),null);
});
