import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiPending} from '../src/ai-pending.js';
import {createAiRequest} from '../src/ai-request.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(initial=null){
  let value=initial,revision=0;
  const calls=[];
  return {calls,get value(){return value;},request:async(op,args)=>{
    calls.push([op,structuredClone(args)]);
    assert.equal(args.key,'ai-pending-request');
    if(op==='storage.get'){assert.equal(args.withEtag,true);return {value:structuredClone(value),etag:String(revision)};}
    assert.equal(op,'storage.set');
    if(args.ifMatch!==String(revision))throw Object.assign(Error('CAS conflict'),{code:'E_STORAGE_CONFLICT'});
    value=structuredClone(args.value);revision++;return {saved:true};
  }};
}
const payload={requestId:'fixture-original',request:'private requirement',context:{sample:'private sample'}};
const timeout=()=>Object.assign(Error('outcome unknown'),{code:'E_AI_OUTCOME_UNKNOWN'});

test('CAS stores only identity before dispatch; run settlement releases with CAS',async()=>{
  const store=fixture(),pending=createAiPending(store.request),calls=[];
  const op=createAiRequest(async name=>{
    calls.push(name);assert.deepEqual(store.value,{schemaVersion:1,requestId:payload.requestId});
    return name==='ai.info'?{generation:1}:{requestId:payload.requestId,providerGeneration:1,proposal:{}};
  },payload,()=>{},pending);
  await op.run();assert.equal(op.settled,true);assert.equal(store.value,null);assert.deepEqual(calls,['ai.info','ai.generate']);
  assert.deepEqual(store.calls.filter(([name])=>name==='storage.set').map(([,args])=>args.value),[{schemaVersion:1,requestId:payload.requestId},null]);
});

test('failed reads, malformed records, unconfirmed writes and exceptions never dispatch',async()=>{
  for(const reply of [undefined,{value:null},{value:{schemaVersion:2,requestId:'old'},etag:'0'},{value:{schemaVersion:1,requestId:'old',sample:'secret'},etag:'0'}]){
    const op=createAiRequest(()=>{throw Error('must not dispatch');},payload,()=>{},createAiPending(async()=>reply));
    await assert.rejects(op.run());assert.equal(op.unknown,true);
  }
  for(const result of [{saved:false},{},null,'throw']){
    let dispatched=0;
    const pending=createAiPending(async name=>{
      if(name==='storage.get')return {value:null,etag:null};
      if(result==='throw')throw timeout();return result;
    });
    const op=createAiRequest(async()=>{dispatched++;},payload,()=>{},pending);
    await assert.rejects(op.run());assert.equal(dispatched,0);assert.equal(op.unknown,true);
  }
});

test('two concurrent instances cannot both claim or dispatch, and stale IDs cannot clear the winner',async()=>{
  const store=fixture(),pending=createAiPending(store.request),sent=[];
  const operations=['one','two'].map(requestId=>createAiRequest(async name=>{
    if(name==='ai.info')return {generation:1};sent.push(requestId);throw timeout();
  },{...payload,requestId},()=>{},pending));
  await Promise.allSettled(operations.map(op=>op.run()));
  assert.equal(sent.length,1);assert.equal(store.value.requestId,sent[0]);
  await assert.rejects(pending.clear(sent[0]==='one'?'two':'one'),/身份/);
  assert.equal(store.value.requestId,sent[0]);
});

test('unknown, mismatched and failed stop replies keep identity; only correlated terminal replies clear',async()=>{
  for(const terminal of ['cancelled','completed','failed']){
    const store=fixture(),pending=createAiPending(store.request);let reply={requestId:payload.requestId,state:'unknown'};
    const op=createAiRequest(async name=>{
      if(name==='ai.info')return {generation:1};if(name==='ai.generate')throw timeout();
      if(reply instanceof Error)throw reply;return reply;
    },payload,()=>{},pending);
    await assert.rejects(op.run());await op.cancel();assert.ok(store.value);
    reply={requestId:'wrong',state:terminal};await assert.rejects(op.cancel(),/身份/);assert.ok(store.value);
    reply=Error('offline');await assert.rejects(op.cancel(),/offline/);assert.ok(store.value);
    reply={requestId:payload.requestId,state:terminal};await op.cancel();assert.equal(store.value,null);
  }
});

test('local preparation cancel retains CAS identity until the real run settles',async()=>{
  const store=fixture(),pending=createAiPending(store.request),info=deferred(),entered=deferred();let generates=0;
  const op=createAiRequest(async name=>{if(name==='ai.info'){entered.resolve();return info.promise;}generates++;},payload,()=>{},pending);
  const run=op.run();await entered.promise;
  await op.cancel();assert.equal(op.settled,false);assert.ok(store.value,'local cancelled is not settled');
  info.resolve({generation:1});assert.equal(await run,null);assert.equal(op.settled,true);assert.equal(store.value,null);assert.equal(generates,0);
});

test('unmount cancellation cannot clear unknown even if the host replies terminal',async()=>{
  const store=fixture(),pending=createAiPending(store.request);
  const op=createAiRequest(async name=>{
    if(name==='ai.info')return {generation:1};if(name==='ai.generate')throw timeout();
    return {requestId:payload.requestId,state:'cancelled'};
  },payload,()=>{},pending);
  await assert.rejects(op.run());await op.cancel({release:false});
  assert.deepEqual(store.value,{schemaVersion:1,requestId:payload.requestId});
});

test('uncertain terminal clear keeps request unknown and prevents candidate delivery',async()=>{
  const store=fixture();let clearing=false;
  const pending=createAiPending(async(name,args)=>{
    if(name==='storage.set'&&args.value===null){clearing=true;throw timeout();}
    return store.request(name,args);
  });
  const op=createAiRequest(async name=>name==='ai.info'?{generation:1}:{requestId:payload.requestId,providerGeneration:1,proposal:{}},payload,()=>{},pending);
  await assert.rejects(op.run());assert.equal(clearing,true);assert.equal(op.unknown,true);assert.equal(op.settled,true);assert.ok(store.value);
});

test('a lost claim receipt can retire only its own undispatched identity without contacting AI',async()=>{
  const store=fixture();let lost=true,aiCalls=0;
  const pending=createAiPending(async(name,args)=>{
    const reply=await store.request(name,args);
    if(name==='storage.set'&&args.value&&lost){lost=false;throw timeout();}
    return reply;
  });
  const op=createAiRequest(async()=>{aiCalls++;throw Error('must not contact AI');},payload,()=>{},pending);
  await assert.rejects(op.run());assert.equal(op.unknown,true);assert.equal(op.dispatched,false);
  assert.equal(store.value.requestId,payload.requestId);
  const reply=await op.cancel();
  assert.deepEqual(reply,{requestId:payload.requestId,state:'cancelled'});
  assert.equal(store.value,null);assert.equal(op.unknown,false);assert.equal(aiCalls,0);
});

test('local recovery keeps a changed owner or failed CAS fenced, then allows an explicit retry',async()=>{
  const store=fixture();let failedClaim=true,failedClear=true,aiCalls=0;
  const pending=createAiPending(async(name,args)=>{
    if(name==='storage.set'&&args.value===null&&failedClear){failedClear=false;throw timeout();}
    const reply=await store.request(name,args);
    if(name==='storage.set'&&args.value&&failedClaim){failedClaim=false;throw timeout();}
    return reply;
  });
  const op=createAiRequest(async()=>{aiCalls++;throw Error('must not contact AI');},payload,()=>{},pending);
  await assert.rejects(op.run());
  await assert.rejects(op.cancel());assert.equal(op.unknown,true);assert.ok(store.value);
  await op.cancel();assert.equal(store.value,null);assert.equal(aiCalls,0);
  const other=fixture({schemaVersion:1,requestId:'other-owner'});
  const loser=createAiRequest(async()=>{throw Error('must not contact AI');},payload,()=>{},createAiPending(other.request));
  await assert.rejects(loser.run());await assert.rejects(loser.cancel(),/身份/);
  assert.equal(other.value.requestId,'other-owner');assert.equal(loser.unknown,true);
});
