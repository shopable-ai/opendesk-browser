import test from 'node:test';
import assert from 'node:assert/strict';
import {createInspection} from '../src/page-inspection.js';

const input={url:'https://book.douban.com/tag/test',kind:'fields',container:'ul.books',item:'li'};
const result={kind:'fields',url:input.url,choices:[{rule:'a::text',status:'pass'}]};
function setup(overrides={}){
  let id,starts=0,stops=0;
  const receipt=()=>({clientRequestId:id,runId:'r1',status:'completed',retired:true,result});
  const sdk={prepare:async()=>{},currentPage:async()=>({status:'available',url:input.url}),
    inspect:async(_input,requestId)=>{id=requestId;starts++;return receipt();},read:async()=>receipt(),
    stop:async()=>{stops++;return {...receipt(),accepted:true};},...overrides};
  return {session:createInspection(sdk),starts:()=>starts,stops:()=>stops};
}
test('field selection requires the original request readback and unchanged configuration',async()=>{
  const {session}=setup();await session.begin(input,'config1');
  assert.equal(session.state.phase,'ready');
  assert.deepEqual(await session.use(0,'config1'),result.choices[0]);
  await assert.rejects(session.use(0,'config2'),/配置/);
});
test('a host terminal without runtime release cannot apply or start another inspection',async()=>{
  const {session,starts}=setup({read:async id=>({clientRequestId:id,runId:'r1',status:'completed',retired:false,result})});
  await session.begin(input,'c');
  assert.equal(session.state.phase,'running');
  await assert.rejects(session.use(0,'c'),/等待/);
  await session.begin(input,'c');assert.equal(starts(),1);
});
test('lost admission stays unknown after close and cannot replay',async()=>{
  let starts=0;const {session}=setup({inspect:async()=>{starts++;throw Error('lost reply');},stop:async()=>{throw Error('offline');},read:async()=>{throw Error('offline');}});
  await session.begin(input,'c');assert.equal(session.state.phase,'unknown');
  await session.close();await session.begin(input,'c');
  assert.equal(starts,1);assert.equal(session.state.phase,'unknown');assert.ok(session.state.clientRequestId);
});
test('navigation and mismatched late receipts reject selection without writing configuration',async()=>{
  for(const overrides of [
    {currentPage:async()=>({status:'available',url:input.url+'?new'})},
    {read:async()=>({clientRequestId:'other',runId:'r1',retired:true,result})}
  ]){
    const {session}=setup(overrides);await session.begin(input,'c');
    await assert.rejects(session.use(0,'c'));
  }
});
test('cancel before metadata resolves never dispatches a task',async()=>{
  let finish;const {session,starts}=setup({prepare:()=>new Promise(resolve=>finish=resolve)});
  const opening=session.begin(input,'c');await session.close();finish();await opening;
  assert.equal(starts(),0);assert.equal(session.state.phase,'closed');
});
test('a late cancelled preflight cannot dispatch a successor inspection twice',async()=>{
  let finish,prepares=0;const {session,starts}=setup({prepare:()=>++prepares===1?new Promise(resolve=>finish=resolve):Promise.resolve()});
  const first=session.begin(input,'old');await session.close();await session.begin(input,'new');finish();await first;
  assert.equal(starts(),1);assert.equal(session.state.phase,'ready');
  assert.deepEqual(await session.use(0,'new'),result.choices[0]);
});
test('only inspected choices can be used and failed candidates stay blocked',async()=>{
  const {session}=setup({read:async id=>({clientRequestId:id,runId:'r1',retired:true,status:'completed',result:{...result,choices:[{rule:'a::text',status:'warning'}]}})});
  await session.begin(input,'c');
  await assert.rejects(session.use(0,'c'),/匹配/);
  await assert.rejects(session.use(1,'c'),/候选/);
});
test('selection waits for an in-flight poll and performs a fresh document check',async()=>{
  let reads=0,finish;const {session}=setup({read:async id=>{
    reads++;
    if(reads===2)return new Promise(resolve=>finish=()=>resolve({clientRequestId:id,runId:'r1',retired:true,status:'completed',result}));
    if(reads===3)throw Error('document revoked');
    return {clientRequestId:id,runId:'r1',retired:true,status:'completed',result};
  }});
  await session.begin(input,'c');const poll=session.refresh(),use=session.use(0,'c');
  finish();await poll;await assert.rejects(use,/document revoked/);
  assert.equal(reads,3);
});
