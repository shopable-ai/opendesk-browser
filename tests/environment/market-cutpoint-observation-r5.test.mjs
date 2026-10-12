import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {discoverMarketCutPoints,marketCallLocation} from '../helpers/app-market-r5-cutpoints.mjs';
import {marketSenderPoints,assertObservedMarketConnection,waitForMarketCutOutcome,assertMarketRecoveryObserverStable} from '../helpers/app-market-r5-observers.mjs';

test('a failed active wake cannot be swallowed by polling and replaced with later success',async()=>{
  const failure=Error('actual website wake failed');let calls=0;
  const retryingUntil=async observe=>{
    for(let i=0;i<3;i++)try{const result=await observe();if(result)return result;}catch{}
    throw Error('observation timed out');
  };
  await assert.rejects(waitForMarketCutOutcome(retryingUntil,async()=>{
    if(++calls===1)throw failure;return {targetAbsent:true};
  },'worker termination'),error=>error===failure);
  assert.equal(calls,1,'the later replacement must never be observed after a failed wake');
  calls=0;
  assert.deepEqual(await waitForMarketCutOutcome(retryingUntil,async()=>++calls===1?null:{targetAbsent:true},'worker termination'),{targetAbsent:true});
  assert.equal(calls,2,'ordinary missing evidence may still be observed again');
});

test('a native reconnect receipt requires its own trusted click, pending transition and completed response',()=>{
  const url='http://127.0.0.1:43132/help/';
  const events=[{kind:'click',at:1,isTrusted:true},
    {kind:'before-handler',at:2,disabled:false,text:'已连接 OpenDesk'},
    {kind:'mutation',at:3,disabled:true,text:'正在连接 OpenDesk…'},
    {kind:'mutation',at:4,disabled:false,text:'已连接 OpenDesk · 安装在扩展内确认'}];
  const good={status:'CONNECTED',url,events,response:events.at(-1)};
  assert.doesNotThrow(()=>assertObservedMarketConnection(good,url));
  for(const change of [
    row=>row.status='FAILED',row=>row.url+='navigated/',row=>row.events[0].isTrusted=false,
    row=>row.events.splice(2,1),row=>row.events[2].disabled=false,
    row=>row.events[2].text='已连接 OpenDesk',row=>row.events[3].at=0,
    row=>row.events.unshift({...row.events[0]}),row=>row.response={...row.response,disabled:true}
  ]){const value=structuredClone(good);change(value);assert.throws(()=>assertObservedMarketConnection(value,url));}
});

test('held PROBE observation can read a request only in the exact two-parameter sender handler',async()=>{
  const source=await readFile('src/marketplace/external.js','utf8');
  const points=marketSenderPoints(source),requestPoints=points.filter(point=>point.requestExpression);
  assert.equal(requestPoints.length,1);assert.equal(requestPoints[0].senderExpression,'sender');
  assert.equal(requestPoints[0].requestExpression,'message');
  const changed=source.replace('return {handle(message,sender){','return {handle(message,sender,unknown){');
  assert.notEqual(changed,source);
  assert.equal(marketSenderPoints(changed).filter(point=>point.requestExpression).length,0,
    'an unknown handler shape cannot guess a request binding');
});

test('market observation binds current non-nested source calls and declines changed call shapes',async()=>{
  const host=await readFile('src/marketplace/external.js','utf8');
  const installer=await readFile('src/ui/sidebar-tools/installation.js','utf8');
  const storage=await readFile('src/ui/sidebar-tools/storage-state.js','utf8');
  for(const [source,required] of [[host,['A1','A2']],[installer,['B']],[storage,['C']]]){
    const points=discoverMarketCutPoints(source,{required,registryStoreKey:'opendesk.sidebar-tools.installed.v1'});
    for(const point of Object.values(points)){
      assert.equal(point.nestedInvocations,0);assert.equal(point.breakpointType,'call');
      assert.equal(source.slice(...point.range),point.text);
    }
  }
  for(const source of [host.replace('api.tabs.query({})','api.tabs.query({filter:other()})'),
    host.replace('Missing created tab identity','different identity marker')]){
    assert.throws(()=>discoverMarketCutPoints(source,{required:['A1']}),{code:'E_NATIVE_NOT_OBSERVED'});
  }
});

test('browser call position must be unique inside the exact invocation, never a neighbouring statement',()=>{
  const point={location:{lineNumber:0,columnNumber:20},endLocation:{lineNumber:0,columnNumber:40},nestedInvocations:0,breakpointType:'call'};
  const actual={scriptId:'loaded-script',lineNumber:0,columnNumber:27,type:'call'};
  const statement={scriptId:'loaded-script',lineNumber:0,columnNumber:22};
  assert.deepEqual(marketCallLocation(point,[statement,actual],'loaded-script'),{scriptId:'loaded-script',lineNumber:0,columnNumber:27});
  for(const locations of [[],[statement],[{...actual,scriptId:'other-script'}],
    [{...actual,columnNumber:19}],[{...actual,columnNumber:40}],[{...actual,type:'return'}],
    [actual,{...actual,columnNumber:35}],[actual,{...statement,columnNumber:45}],[actual,{...statement,columnNumber:NaN}]]){
    assert.throws(()=>marketCallLocation(point,locations,'loaded-script'),{code:'E_NATIVE_NOT_OBSERVED'});
  }
  assert.throws(()=>marketCallLocation({...point,nestedInvocations:1},[actual],'loaded-script'),{code:'E_NATIVE_NOT_OBSERVED'});
});

test('recovery observer preserves pre-arm context events and forbids post-arm registry replay or context loss',()=>{
  const initial={sequence:1,method:'Runtime.executionContextCreated',sessionId:'test-session',
    params:{context:{id:7,uniqueId:'unique-original'}}};
  const good={name:'C',status:'ARMED',sessionId:'test-session',armedEventSequence:2,
    target:{targetId:'review-target'},executionContext:{id:7,uniqueId:'unique-original'},
    errors:[],observations:[],events:[initial]};
  assert.doesNotThrow(()=>assertMarketRecoveryObserverStable(good),
    'a contextCreated event received during native debugger attachment is not a recovery write');
  for(const event of [
    {sequence:3,method:'Target.targetDestroyed',params:{targetId:'review-target'}},
    {sequence:3,method:'Inspector.detached',sessionId:'test-session'},
    {sequence:3,method:'Runtime.executionContextsCleared',sessionId:'test-session'},
    {sequence:3,method:'Runtime.executionContextDestroyed',sessionId:'test-session',params:{executionContextId:7}},
    {sequence:3,method:'Runtime.executionContextCreated',sessionId:'test-session',
      params:{context:{id:7,uniqueId:'different'}}}
  ]){
    assert.throws(()=>assertMarketRecoveryObserverStable({...good,events:[initial,event]}),
      'post-arm destruction of original context invalidates zero-replay evidence');
  }
  assert.doesNotThrow(()=>assertMarketRecoveryObserverStable({...good,events:[initial,
    {sequence:3,method:'Runtime.executionContextCreated',sessionId:'test-session',
      params:{context:{id:11,uniqueId:'unrelated'}}}]}));
  assert.throws(()=>assertMarketRecoveryObserverStable({...good,observations:[{value:{key:'opendesk.sidebar-tools.installed.v1'}}]}),
    'any observed installed-registry submission invalidates the recovery receipt');
  assert.throws(()=>assertMarketRecoveryObserverStable({...good,status:'NOT_OBSERVED'}));
  assert.throws(()=>assertMarketRecoveryObserverStable({...good,errors:[{message:'debugger lost'}]}));
});
