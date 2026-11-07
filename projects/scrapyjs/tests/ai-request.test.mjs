import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiRequest,requireGeneration} from '../src/ai-request.js';
import {createAiPending} from '../src/ai-pending.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const payload={requestId:'original',request:'保留规则'};
test('dispatch preparation is persisted before handing payload to the bridge',async()=>{
  const calls=[],gate=deferred();let sent=false;
  const operation=createAiRequest(async()=>({generation:1}),payload,()=>{},{
    claim:async()=>calls.push('claim'),beforeDispatch:async()=>{calls.push('dispatch-fence');await gate.promise;},clear:async()=>calls.push('clear')
  },async factory=>{const ready=await factory();if(ready===null)return null;sent=true;return {requestId:'original',providerGeneration:1};});
  const running=operation.run();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['claim','dispatch-fence']);assert.equal(sent,false);
  await operation.cancel();gate.resolve();assert.equal(await running,null);assert.equal(sent,false);
});
test('prepareAI consumes the send action synchronously and privately submits the complete prepared payload',async()=>{
  const claim=deferred(),calls=[],sent=[],observed=[];
  const full={...payload,instructions:'bounded',context:{currentConfig:{itemConfig:{title:'h2'}}}};
  const result={requestId:'original',providerGeneration:4,proposal:{type:'explain',message:'ok'}};
  const op=createAiRequest(async name=>{
    calls.push(name);assert.equal(name,'ai.info','no public ai.generate fallback');return {generation:4};
  },full,info=>observed.push(info.generation),{claim:()=>{calls.push('claim');return claim.promise;},clear:async()=>calls.push('clear')},
  factory=>{calls.push('prepare');return (async()=>{const ready=await factory();sent.push(ready);return result;})();});
  const running=op.run();
  assert.equal(calls[0],'prepare','must reserve the gesture before any async preparation');
  assert.equal(op.dispatched,false);claim.resolve();
  assert.deepEqual(await running,result);
  assert.deepEqual(sent,[{...full,providerGeneration:4}]);assert.deepEqual(observed,[4]);
  assert.deepEqual(calls,['prepare','claim','ai.info','clear']);assert.equal(op.unknown,false);
});

for(const stage of ['before-factory','after-payload','during-info','during-claim'])
  test('known unsent prepare failure keeps cause, fences late preparation and clears only after claim: '+stage,async()=>{
    const gate=deferred(),entered=deferred(),calls=[];
    const cause=Object.assign(Error('preparation timeout'),{code:'E_TOOL_TIMEOUT'});
    const failure=Object.assign(Error('not sent',{cause}),{code:stage==='before-factory'?'E_AI_GESTURE':'E_AI_PREPARE'});
    let factoryResult;
    const op=createAiRequest(async name=>{
      calls.push(name);assert.equal(name,'ai.info');
      if(stage==='during-info'){entered.resolve();await gate.promise;}
      return {generation:1};
    },payload,()=>{},{claim:async()=>{
      calls.push('claim');if(stage==='during-claim'){entered.resolve();await gate.promise;}
    },clear:async()=>calls.push('clear')},async factory=>{
      if(stage==='before-factory')throw failure;
      const ready=factory();
      if(stage.startsWith('during-')){factoryResult=ready;await entered.promise;throw failure;}
      await ready;throw failure;
    });
    const running=op.run();
    if(stage.startsWith('during-')){await entered.promise;await new Promise(resolve=>setImmediate(resolve));gate.resolve();}
    await assert.rejects(running,error=>error===failure&&error.cause===cause);
    if(factoryResult)assert.equal(await factoryResult,null,'expired preparation cannot produce a late payload');
    assert.equal(op.dispatched,false);assert.equal(op.unknown,false);
    assert.deepEqual(calls,stage==='before-factory'?[]:stage==='during-claim'?['claim','clear']:['claim','ai.info','clear']);
    assert.equal((await op.cancel()).state,'cancelled');
  });

test('prepared cancellation during info returns null to the bridge and does not send or replay',async()=>{
  const info=deferred(),entered=deferred(),sent=[],cleared=[];
  const op=createAiRequest(async name=>{assert.equal(name,'ai.info');entered.resolve();return info.promise;},payload,()=>{},
    {claim:async()=>{},clear:async id=>cleared.push(id)},async factory=>{
      const ready=await factory();if(ready===null)return null;sent.push(ready);throw Error('must not send');
    });
  const running=op.run();await entered.promise;
  assert.equal((await op.cancel()).state,'cancelled');info.resolve({generation:1});
  assert.equal(await running,null);assert.deepEqual(sent,[]);assert.deepEqual(cleared,['original']);assert.equal(op.unknown,false);
});

for(const code of ['E_TOOL_TIMEOUT','E_AI_UNKNOWN','E_OUTCOME_UNKNOWN'])
test('prepared dispatch failure and lost claim receipt preserve their distinct original fences: '+code,async()=>{
  const failure=Object.assign(Error('lost receipt'),{code});
  for(const lostClaim of [false,true]){
    const calls=[],cleared=[];
    const op=createAiRequest(async name=>{calls.push(name);return name==='ai.info'?{generation:1}:{requestId:'original',state:'unknown'};},payload,()=>{},
      {claim:async()=>{if(lostClaim)throw failure;},clear:async id=>cleared.push(id)},async factory=>{
        try{await factory();}catch(cause){throw Object.assign(Error('not sent',{cause}),{code:'E_AI_PREPARE'});}
        throw failure;
      });
    await assert.rejects(op.run());assert.equal(op.unknown,true);assert.equal(op.dispatched,!lostClaim);
    assert.deepEqual(cleared,[]);
    assert.equal((await op.cancel()).state,lostClaim?'cancelled':'unknown');
    assert.deepEqual(calls,lostClaim?[]:['ai.info','ai.cancel']);
  }
});

test('stop during terminal cleanup waits for its receipt and suppresses candidate delivery',async()=>{
  const entered=deferred(),clear=deferred(),calls=[];
  const op=createAiRequest(async name=>{
    calls.push(name);return name==='ai.info'?{generation:1}:{requestId:'original',providerGeneration:1,proposal:{}};
  },payload,()=>{},{claim:async()=>{},clear:async()=>{entered.resolve();await clear.promise;}});
  const running=op.run();await entered.promise;
  let reply;const stopping=op.cancel().then(value=>{reply=value;});
  await new Promise(resolve=>setImmediate(resolve));
  const premature=reply;
  clear.resolve();await stopping;
  assert.equal(await running,null,'a stop in cleanup must suppress the already received candidate');
  assert.equal(premature,undefined,'no unknown or terminal receipt before cleanup finishes');
  assert.deepEqual(reply,{requestId:'original',state:'completed'});
  assert.equal(op.unknown,false);assert.deepEqual(calls,['ai.info','ai.generate']);
});
test('terminal evidence survives failed cleanup without clearing a different CAS owner',async()=>{
  let value=null,revision=0,fail=true;const calls=[];
  const pending=createAiPending(async(name,args)=>{
    if(name==='storage.get')return {value:structuredClone(value),etag:String(revision)};
    assert.equal(args.ifMatch,String(revision));
    if(args.value===null&&fail)throw Error('lost cleanup receipt');
    value=structuredClone(args.value);revision++;return {saved:true};
  });
  const op=createAiRequest(async name=>{
    calls.push(name);return name==='ai.info'?{generation:1}:name==='ai.generate'?{requestId:'original',providerGeneration:1}: {requestId:'original',state:'unknown'};
  },payload,()=>{},pending);
  await assert.rejects(op.run(),/lost cleanup/);assert.equal(op.unknown,true);
  fail=false;value={schemaVersion:1,requestId:'other'};revision++;
  await assert.rejects(op.cancel(),/身份/);assert.equal(value.requestId,'other');assert.equal(op.unknown,true);
  value={schemaVersion:1,requestId:'original'};revision++;
  assert.deepEqual(await op.cancel(),{requestId:'original',state:'completed'});
  assert.equal(value,null);assert.equal(op.unknown,false);assert.deepEqual(calls,['ai.info','ai.generate']);
});
test('stop shares a failed terminal cleanup receipt and explicit recovery retains completed evidence',async()=>{
  const entered=deferred(),clear=deferred();let attempts=0;
  const op=createAiRequest(async name=>{
    assert.notEqual(name,'ai.cancel','known completion needs no uncertain Host cancellation');
    return name==='ai.info'?{generation:1}:{requestId:'original',providerGeneration:1};
  },payload,()=>{},{claim:async()=>{},clear:async()=>{
    attempts++;if(attempts===1){entered.resolve();await clear.promise;}
  }});
  const running=op.run(),runFailure=assert.rejects(running,/cleanup failed/);
  await entered.promise;
  const stopFailure=assert.rejects(op.cancel(),/cleanup failed/);
  clear.reject(Error('cleanup failed'));await Promise.all([runFailure,stopFailure]);
  assert.equal(op.unknown,true);assert.equal(attempts,1,'Stop shares the in-flight clear');
  assert.deepEqual(await op.cancel(),{requestId:'original',state:'completed'});
  assert.equal(op.unknown,false);assert.equal(attempts,2);
});
test('cancel during info prevents dispatch after the delayed info response',async()=>{
  const info=deferred(),calls=[];
  const op=createAiRequest((name)=>{calls.push(name);return info.promise;},payload);
  const run=op.run();assert.deepEqual(await op.cancel(),{requestId:'original',state:'cancelled'});
  info.resolve({generation:1});assert.equal(await run,null);assert.deepEqual(calls,['ai.info']);
});
test('unknown and malformed cancellation do not claim the original request was cancelled',async()=>{
  const result=deferred();let reply={requestId:'original',state:'unknown'};
  const op=createAiRequest(async name=>name==='ai.info'?{generation:1}:name==='ai.generate'?result.promise:reply,payload);
  const run=op.run();await new Promise(resolve=>setImmediate(resolve));assert.equal((await op.cancel()).state,'unknown');
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
  const run=op.run();await new Promise(resolve=>setImmediate(resolve));assert.equal((await op.cancel()).state,'cancelled');
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

test('page context preparation stays inside the reserved send and finishes before inference',async()=>{
  const calls=[],sent=[];
  const op=createAiRequest(async name=>{calls.push(name);return {generation:2};},payload,()=>{},
    {claim:async()=>calls.push('claim'),clear:async()=>calls.push('clear')},async factory=>{
      calls.push('reserve');const value=await factory();sent.push(value);
      return {requestId:payload.requestId,providerGeneration:2,proposal:{type:'explain',message:'ok'}};
    },{prepare:async context=>{calls.push('observe');return {...context,sample:'<article>real</article>'};},retire:async()=>calls.push('retire')});
  await op.run();
  assert.equal(sent[0].context.sample,'<article>real</article>');
  assert.deepEqual(calls,['reserve','claim','observe','ai.info','retire','clear']);
});

test('unreleased page preparation keeps the original pending identity and stop never replays it',async()=>{
  const calls=[];let released=false;
  const hooks={prepare:async()=>{calls.push('observe');throw Error('page observation lost');},
    retire:async()=>{calls.push('retire');if(!released)throw Error('page still unknown');}};
  const op=createAiRequest(async()=>{throw Error('must not infer');},payload,()=>{},
    {claim:async()=>calls.push('claim'),clear:async()=>calls.push('clear')},async factory=>factory(),hooks);
  await assert.rejects(op.run(),error=>{
    assert.match(error.message,/page observation lost/);
    assert.match(error.message,/page still unknown/);
    return true;
  });
  assert.equal(op.unknown,true);assert.equal(op.dispatched,false);assert.equal(calls.includes('clear'),false);
  released=true;assert.equal((await op.cancel()).state,'cancelled');
  assert.deepEqual(calls,['claim','observe','retire','retire','clear']);
});
