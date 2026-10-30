import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiRequest,requireGeneration} from '../src/ai-request.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const payload={requestId:'original',request:'保留规则'};
test('cancel during info prevents dispatch after the delayed info response',async()=>{
  const info=deferred(),calls=[];
  const op=createAiRequest((name)=>{calls.push(name);return info.promise;},payload);
  const run=op.run();assert.deepEqual(await op.cancel(),{requestId:'original',state:'cancelled'});
  info.resolve({generation:1});assert.equal(await run,null);assert.deepEqual(calls,['ai.info']);
});
test('unknown and malformed cancellation do not claim the original request was cancelled',async()=>{
  const result=deferred();let reply={requestId:'original',state:'unknown'};
  const op=createAiRequest(async name=>name==='ai.info'?{generation:1}:name==='ai.generate'?result.promise:reply,payload);
  const run=op.run();await Promise.resolve();assert.equal((await op.cancel()).state,'unknown');
  reply={requestId:'other',state:'cancelled'};await assert.rejects(op.cancel(),/身份/);
  result.resolve({requestId:'original',providerGeneration:1,proposal:{}});assert.equal(await run,null,'late candidate stays fenced after any stop request');
});
test('real response and info require the same explicit provider generation and request identity',async()=>{
  for(const [info,result] of [
    [{},{requestId:'original',providerGeneration:1}],
    [{generation:1},{requestId:'original'}],
    [{generation:1},{requestId:'original',providerGeneration:2}],
    [{generation:1},{requestId:'other',providerGeneration:1}]
  ]){
    const op=createAiRequest(async name=>name==='ai.info'?info:result,payload);
    await assert.rejects(op.run(),/身份|变化/);
  }
  for(const value of [undefined,null,0,-1,'1',NaN,Infinity])assert.throws(()=>requireGeneration(value));
  const expected={requestId:'original',providerGeneration:3,proposal:{a:1}};
  assert.deepEqual(await createAiRequest(async name=>name==='ai.info'?{generation:3}:expected,payload).run(),expected);
});
test('confirmed cancellation is correlated to the original request and suppresses delivery',async()=>{
  const result=deferred(),calls=[];
  const op=createAiRequest(async(name,args)=>{calls.push([name,args]);return name==='ai.info'?{generation:1}:name==='ai.generate'?result.promise:{requestId:args.requestId,state:'cancelled'};},payload);
  const run=op.run();await Promise.resolve();assert.equal((await op.cancel()).state,'cancelled');
  result.resolve({requestId:'original',providerGeneration:1});assert.equal(await run,null);
  assert.deepEqual(calls.at(-1),['ai.cancel',{requestId:'original'}]);
});
test('timeout keeps original identity queryable and total data budget fails before any call',async()=>{
  const calls=[];const timeout=Object.assign(Error('unknown'),{code:'E_AI_TIMEOUT'});
  const op=createAiRequest(async(name)=>{calls.push(name);if(name==='ai.info')return {generation:1};if(name==='ai.generate')throw timeout;return {requestId:'original',state:'unknown'};},payload);
  await assert.rejects(op.run(),{code:'E_AI_TIMEOUT'});assert.equal(op.unknown,true);assert.equal((await op.cancel()).state,'unknown');assert.equal(calls.at(-1),'ai.cancel');
  const oversized=createAiRequest(()=>{throw Error('must not call');},{...payload,context:{sample:'a'.repeat(20000)}});
  await assert.rejects(oversized.run(),/合计超过/);
});
test('preparation timeout is retryable while every dispatched unknown keeps the original request fenced',async()=>{
  for(const code of ['E_TIMEOUT','E_TOOL_TIMEOUT','E_AI_OUTCOME_UNKNOWN']){
    const failure=Object.assign(Error('timeout'),{code}),beforeCalls=[];
    const before=createAiRequest(async name=>{beforeCalls.push(name);throw failure;},payload);
    await assert.rejects(before.run(),{code});assert.equal(before.unknown,false);
    assert.equal((await before.cancel()).state,'cancelled');assert.deepEqual(beforeCalls,['ai.info']);
    const afterCalls=[];
    const after=createAiRequest(async name=>{afterCalls.push(name);if(name==='ai.info')return {generation:1};if(name==='ai.generate')throw failure;return {requestId:'original',state:'unknown'};},payload);
    await assert.rejects(after.run(),{code});assert.equal(after.unknown,true);
    assert.equal((await after.cancel()).state,'unknown');assert.deepEqual(afterCalls,['ai.info','ai.generate','ai.cancel']);
  }
});
test('unknown cancellation followed by a late response cannot clear the persisted request fence',async()=>{
 const result=deferred(),cleared=[];
 const op=createAiRequest(async name=>name==='ai.info'?{generation:1}:name==='ai.generate'?result.promise:{requestId:'original',state:'unknown'},payload,()=>{},
  {claim:async()=>{},clear:async id=>cleared.push(id)});
 const run=op.run();await new Promise(resolve=>setImmediate(resolve));await op.cancel();
 result.resolve({requestId:'original',providerGeneration:1,proposal:{}});assert.equal(await run,null);
 assert.equal(op.unknown,true);assert.deepEqual(cleared,[]);
});
test('failed or malformed cancellation preserves the original fence after a late response',async()=>{
 for(const bad of [()=>{throw Error('offline cancel');},()=>({requestId:'other',state:'completed'})]){
  const result=deferred(),cleared=[];
  const op=createAiRequest(async name=>name==='ai.info'?{generation:1}:name==='ai.generate'?result.promise:bad(),payload,()=>{},
   {claim:async()=>{},clear:async id=>cleared.push(id)});
  const run=op.run();await new Promise(resolve=>setImmediate(resolve));await assert.rejects(op.cancel());
  result.resolve({requestId:'original',providerGeneration:1});assert.equal(await run,null);assert.deepEqual(cleared,[]);assert.equal(op.unknown,true);
 }
});
