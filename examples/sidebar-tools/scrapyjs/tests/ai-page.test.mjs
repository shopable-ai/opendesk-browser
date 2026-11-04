import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiPageObservation,retireAiPageObservation} from '../src/ai-page.js';

const requestId='12345678-1234-1234-1234-123456789012';
const clientRequestId=requestId+'.page';
const url='https://example.com/catalog';
const snapshot=()=>({clientRequestId,runId:'run-1',resultId:'result-1',state:'completed',retirementState:'released',
  result:{},value:{kind:'context',url,choices:[{html:'<main><h1>Catalog</h1></main>'}],truncated:true}});
const released=()=>({...snapshot(),result:null,value:null});
const unknown=()=>({...released(),state:'unknown',retirementState:'unknown'});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function host(overrides={}){
  const calls=[];
  const request=async(method,payload)=>{
    calls.push({method,payload});
    if(overrides[method])return overrides[method](payload);
    if(method==='controllers.read')return payload.clientRequestId?snapshot():{controller:{sourceHash:'hash'}};
    if(method==='currentPage.info')return {status:'available',url};
    if(method==='controllers.start')return snapshot();
    if(method==='controllers.stop')return released();
    throw Error('Unexpected operation '+method);
  };
  return {request,calls,observation:()=>createAiPageObservation(request,{requestId,url})};
}

test('preflights and returns a bounded context with original identities; concurrent prepare starts once',async()=>{
  const h=host(),operation=h.observation();
  const [context,again]=await Promise.all([operation.prepare(),operation.prepare()]);
  assert.deepEqual(context,{sample:'<main><h1>Catalog</h1></main>',pageObservation:{clientRequestId,runId:'run-1',resultId:'result-1',truncated:true}});
  assert.deepEqual(again,context);
  assert.deepEqual(h.calls,[{method:'controllers.read',payload:{}},{method:'currentPage.info',payload:{}},
    {method:'controllers.start',payload:{clientRequestId,params:{url,configJson:'{}',optionsJson:'{"inspection":{"kind":"context","container":"","item":"","mode":"snapshot"}}',waitForSelector:'',timeoutMs:5000}}}]);
  await operation.assertCurrent();
  assert.deepEqual(h.calls.at(-2),{method:'controllers.read',payload:{clientRequestId}});
  assert.equal(h.calls.at(-1).method,'currentPage.info');
});

test('same URL with a replacement document is rejected by original Host read',async()=>{
  let stale=false;
  const h=host({'controllers.read':payload=>{
    if(stale&&payload.clientRequestId)throw Object.assign(Error('original document changed'),{code:'E_DOCUMENT_CHANGED'});
    return payload.clientRequestId?snapshot():{controller:{sourceHash:'hash'}};
  }});
  const operation=h.observation();await operation.prepare();stale=true;
  await assert.rejects(operation.assertCurrent(),{code:'E_DOCUMENT_CHANGED'});
});

test('assertCurrent rejects changed result identity, snapshot contents and URL',async()=>{
  for(const mutate of [row=>{row.runId='other';},row=>{row.resultId='other';},row=>{row.value.choices[0].html='changed';},row=>{row.retirementState='unknown';}]){
    const h=host({'controllers.read':payload=>{if(!payload.clientRequestId)return {controller:{}};const row=snapshot();mutate(row);return row;}});
    const operation=h.observation();await operation.prepare();
    await assert.rejects(operation.assertCurrent());
  }
  let current=url;
  const h=host({'currentPage.info':()=>({status:'available',url:current})});
  const operation=h.observation();await operation.prepare();current=url+'#changed';
  await assert.rejects(operation.assertCurrent());
});

test('oversized or malformed context cannot reach AI',async()=>{
  for(const mutate of [row=>{row.value.choices[0].html='x'.repeat(12001);},row=>{row.value.kind='fields';},row=>{row.value.url=url+'#other';},row=>{row.value.choices=[];},row=>{row.clientRequestId='other';},row=>{row.resultId=null;}]){
    const h=host({'controllers.start':()=>{const row=snapshot();mutate(row);return row;}});
    await assert.rejects(h.observation().prepare());
  }
});

test('released failed observation reports the actual controller failure without exposing a sample',async()=>{
  const failed={...snapshot(),state:'failed',value:null,
    result:{outcome:{ok:false,error:{code:'E_USER_SCRIPTS_UNAVAILABLE',message:'E_USER_SCRIPTS_UNAVAILABLE'}}}};
  const h=host({'controllers.start':()=>failed});
  await assert.rejects(h.observation().prepare(),error=>{
    assert.equal(error.code,'E_USER_SCRIPTS_UNAVAILABLE');
    assert.match(error.message,/允许用户脚本/);
    return true;
  });
  assert.equal(h.calls.filter(row=>row.method==='controllers.start').length,1);
});

test('an unknown start is never replayed and retirement keeps its original ID',async()=>{
  const h=host({'controllers.start':()=>{throw Object.assign(Error('reply lost'),{code:'E_TOOL_TIMEOUT'});}});
  const operation=h.observation();
  await assert.rejects(operation.prepare(),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(operation.prepare(),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(h.calls.filter(row=>row.method==='controllers.start').length,1);
  await operation.retire();
  assert.deepEqual(h.calls.at(-1),{method:'controllers.stop',payload:{clientRequestId}});
});

for(const code of ['E_PERMISSION','E_TOOL_TIMEOUT'])test('start diagnostics retain the admission cause without lifting retirement fences: '+code,async()=>{
  const h=host({'controllers.start':()=>{throw Object.assign(Error('admission did not return'),{code});}});
  const operation=h.observation();
  await assert.rejects(operation.prepare(),error=>{
    assert.equal(error.code,'E_OUTCOME_UNKNOWN');
    assert.equal(error.clientRequestId,clientRequestId);
    assert.match(error.message,/E_OBSERVATION_STAGE start/);
    assert.ok(error.message.includes(code));
    return true;
  });
  await operation.retire();
  assert.equal(h.calls.filter(row=>row.method==='controllers.start').length,1);
  assert.deepEqual(h.calls.at(-1),{method:'controllers.stop',payload:{clientRequestId}});
});

test('stop release succeeds; unknown stop is only reconciled by read on repeated retirement',async()=>{
  let finished=false;
  const h=host({'controllers.start':()=>{throw Error('lost start');},'controllers.stop':()=>{throw Error('lost stop');},'controllers.read':payload=>payload.clientRequestId?(finished?released():unknown()):{controller:{}}});
  const operation=h.observation();await assert.rejects(operation.prepare(),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(operation.retire(),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(operation.retire(),{code:'E_OUTCOME_UNKNOWN'});
  finished=true;await operation.retire();
  assert.equal(h.calls.filter(row=>row.method==='controllers.stop').length,1);
  assert.deepEqual(h.calls.at(-1),{method:'controllers.read',payload:{clientRequestId}});
  await assert.rejects(operation.assertCurrent());
});

test('retiring a ready released observation preserves original read validation without stopping it',async()=>{
  const h=host(),operation=h.observation();
  const context=await operation.prepare();
  await operation.retire();await operation.retire();
  assert.deepEqual(await operation.assertCurrent(),context);
  assert.deepEqual(await operation.prepare(),context);
  assert.equal(h.calls.filter(row=>row.method==='controllers.stop').length,0);
  assert.deepEqual(h.calls.filter(row=>row.method==='controllers.read').map(row=>row.payload),[{}, {clientRequestId}]);
});

test('cancellation during preflight blocks any late start',async()=>{
  for(const method of ['controllers.read','currentPage.info']){
    const gate=deferred(),entered=deferred();
    const h=host({[method]:()=>{entered.resolve();return gate.promise;}});
    const operation=h.observation(),preparing=operation.prepare();
    await entered.promise;await operation.retire();
    gate.resolve(method==='controllers.read'?{controller:{}}:{status:'available',url});
    await assert.rejects(preparing,{code:'E_CANCELLED'});
    assert.equal(h.calls.filter(row=>row.method==='controllers.start').length,0);
  }
});

test('pending recovery stops the original ID before checking release; no start',async()=>{
  const h=host({'controllers.stop':()=>unknown(),'controllers.read':()=>released()});
  await retireAiPageObservation(h.request,requestId);
  assert.deepEqual(h.calls,[{method:'controllers.stop',payload:{clientRequestId}},{method:'controllers.read',payload:{clientRequestId}}]);
  const cancelled=host({'controllers.stop':()=>({clientRequestId,runId:null,resultId:null,state:'cancelled',retirementState:'not-started',result:null,value:null})});
  await retireAiPageObservation(cancelled.request,requestId);
  const uncertain=host({'controllers.stop':()=>unknown(),'controllers.read':()=>unknown()});
  await assert.rejects(retireAiPageObservation(uncertain.request,requestId),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(retireAiPageObservation(uncertain.request,requestId),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(uncertain.calls.filter(row=>row.method==='controllers.stop').length,1);
});

test('a late start reply cannot revive a cancelled preparation',async()=>{
  const gate=deferred(),entered=deferred();
  const h=host({'controllers.start':()=>{entered.resolve();return gate.promise;}});
  const operation=h.observation(),preparing=operation.prepare();
  await entered.promise;await operation.retire();gate.resolve(snapshot());
  await assert.rejects(preparing,{code:'E_CANCELLED'});
  await assert.rejects(operation.assertCurrent(),{code:'E_CANCELLED'});
  assert.equal(h.calls.filter(row=>row.method==='controllers.start').length,1);
  assert.equal(h.calls.filter(row=>row.method==='controllers.stop').length,1);
});

test('polling cannot switch from the admitted run to another run under the same request ID',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const h=host({'controllers.start':()=>({...snapshot(),state:'running',retirementState:'not-started'}),
    'controllers.read':payload=>payload.clientRequestId?{...snapshot(),runId:'other-run'}:{controller:{}}});
  const checking=assert.rejects(h.observation().prepare());
  for(let i=0;i<30;i++)await Promise.resolve();
  t.mock.timers.tick(100);
  await checking;
});

test('exactly 12000 characters are allowed and unreleased polling has a total deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const large=host({'controllers.start':()=>{const row=snapshot();row.value.choices[0].html='x'.repeat(12000);return row;}});
  assert.equal((await large.observation().prepare()).sample.length,12000);
  const h=host({'controllers.start':()=>unknown(),'controllers.read':payload=>payload.clientRequestId?unknown():{controller:{}}});
  const operation=h.observation(),waiting=assert.rejects(operation.prepare(),error=>{
    assert.equal(error.code,'E_OUTCOME_UNKNOWN');
    assert.match(error.message,/read-release/);
    assert.match(error.message,/"state":"unknown"/);
    assert.match(error.message,/"runId":"run-1"/);
    return true;
  });
  for(let tick=0;tick<=55;tick++){
    for(let i=0;i<30;i++)await Promise.resolve();
    t.mock.timers.tick(100);
  }
  await waiting;
  await assert.rejects(operation.prepare(),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(h.calls.filter(row=>row.method==='controllers.start').length,1);
  assert.ok(h.calls.filter(row=>row.method==='controllers.read').length<=56);
});

test('a stalled release reports when admission completed and the fence was first observed',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const admission=deferred();let reads=0;
  const ids={runId:'94999b7a-a50c-46eb-b4d9-aef1dbfd1e51',resultId:'2b10367f-c8e9-440d-9fca-d114f1637c4e'};
  const h=host({'controllers.start':()=>admission.promise,
    'controllers.read':payload=>!payload.clientRequestId?{controller:{}}:
      ++reads===1?{...snapshot(),...ids,retirementState:'fenced'}:new Promise(()=>{})});
  const waiting=assert.rejects(h.observation().prepare(),error=>{
    assert.equal(error.code,'E_OUTCOME_UNKNOWN');
    assert.match(error.message,/"startMs":1200/);
    assert.match(error.message,/"firstRunningMs":1200/);
    assert.match(error.message,/"firstFencedMs":1300/);
    assert.match(error.message,/"readCount":2/);
    assert.match(error.message,/"maxReadMs":4100/);
    assert.match(error.message,/"state":"completed"/);
    assert.ok(error.message.includes(ids.runId));
    assert.ok(error.message.includes(ids.resultId));
    return true;
  });
  const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  await flush();t.mock.timers.tick(1200);admission.resolve({...snapshot(),...ids,state:'running',retirementState:'not-started'});
  await flush();t.mock.timers.tick(100);await flush();t.mock.timers.tick(100);await flush();
  t.mock.timers.tick(4100);await flush();await waiting;
  assert.equal(h.calls.filter(row=>row.method==='controllers.start').length,1);
});

test('polls only the original request until released, and times out hung transport without replay',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  let reads=0;
  const h=host({'controllers.start':()=>({...snapshot(),state:'running',retirementState:'not-started',value:null}),
    'controllers.read':payload=>payload.clientRequestId?(++reads===2?snapshot():unknown()):{controller:{}}});
  const preparing=h.observation().prepare();
  const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  await flush();t.mock.timers.tick(100);await flush();t.mock.timers.tick(100);await flush();
  assert.equal((await preparing).pageObservation.runId,'run-1');
  assert.equal(reads,2);
  const hung=host({'controllers.start':()=>new Promise(()=>{})}),operation=hung.observation();
  const waiting=assert.rejects(operation.prepare(),error=>{
    assert.equal(error.code,'E_OUTCOME_UNKNOWN');
    assert.match(error.message,/start/);
    assert.match(error.message,/"runId":null/);
    return true;
  });
  await flush();t.mock.timers.tick(5500);await flush();await waiting;
  await assert.rejects(operation.prepare(),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(hung.calls.filter(row=>row.method==='controllers.start').length,1);
  await operation.retire();
});
