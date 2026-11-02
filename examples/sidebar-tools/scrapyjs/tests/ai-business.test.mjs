import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/app-model.js';
import * as actions from '../src/ai-actions.js';

const page={status:'available',url:'https://example.com/',title:'Page'};
function fixture(overrides={}) {
  const calls=[];
  const sdk={prepare:async()=>{},currentPage:async()=>page,
    start:async(_config,_url,clientRequestId)=>{calls.push('start');return {clientRequestId,runId:'run-1',status:'running'};},
    read:async clientRequestId=>({clientRequestId,runId:'run-1',status:'running',retired:false,result:{data:[{title:'one'}]}}),
    stop:async clientRequestId=>{calls.push('stop');return {clientRequestId,runId:'run-1',accepted:true,retired:false};},
    download:async(snapshot,format,output)=>{calls.push({snapshot,format,output});return {started:true};},...overrides};
  const app=globalThis.ScrapyAppModel.createApp(sdk);
  app.edit({...app.state.config,url:page.url});
  return {app,calls,sdk};
}
const proposal=(app,kind,format)=>({operation:{kind,...(format?{format}:{})},identity:actions.businessIdentity(app.state,kind)});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

for(const gateName of ['prepare','currentPage'])for(const aiStart of [false,true])for(const retired of [false,true])
test(`confirmed stop prevents dispatch during ${gateName} (${aiStart?'AI':'original'} start, ${retired?'retired':'fresh'})`,async()=>{
  const gate=deferred(),entered=deferred();
  const {app,calls,sdk}=fixture();await app.refreshTarget();
  if(retired){await app.start(page.url);app.state.retired=true;app.state.phase='retired';}
  const previous=Object.fromEntries(['clientRequestId','runId','result','snapshot','runProfile','retired','phase'].map(key=>[key,app.state[key]]));
  // Install the gate only after any prior run and target lookup have completed.
  sdk[gateName]=async()=>{entered.resolve();await gate.promise;return page;};
  const running=aiStart?actions.executeBusinessAction(app,proposal(app,'capture.start')):app.start(page.url);
  await entered.promise;
  try {
    const stop=proposal(app,'capture.stop');
    const receipt=await actions.executeBusinessAction(app,stop);
    assert.equal(receipt.status,'accepted');assert.equal(receipt.dispatchPrevented,true);
    assert.equal(typeof receipt.preparationId,'string');assert.ok(receipt.preparationId);
    assert.equal(app.state.stopRequested,true);
    await assert.rejects(actions.executeBusinessAction(app,stop),/已消费/);
    if(aiStart)await assert.rejects(actions.executeBusinessAction(app,proposal(app,'capture.start')),/锁定/);
  } finally {gate.resolve();await running;}
  const receipt=await running;
  assert.equal(receipt.status,'cancelled');assert.equal(receipt.dispatchPrevented,true);
  assert.deepEqual(calls,retired?['start']:[]);
  for(const [key,value]of Object.entries(previous))assert.strictEqual(app.state[key],value,key);
  assert.match(app.state.notice,/未发起任务/);
});

test('stale preparation stop cannot cancel a newer attempt with the same config and page',async()=>{
  const {app,calls,sdk}=fixture();await app.refreshTarget();
  let gate=deferred();sdk.prepare=()=>gate.promise;
  const first=app.start(page.url),stale=proposal(app,'capture.stop');
  await app.stop();gate.resolve();await first;
  gate=deferred();const second=app.start(page.url);
  try {
    await assert.rejects(actions.executeBusinessAction(app,stale),/变化/);
    assert.equal(app.state.stopRequested,false);
  }finally{gate.resolve();await second;}
  assert.deepEqual(calls,['start']);
});

for(const gateName of ['prepare','currentPage'])for(const rejected of [false,true])
test(`delayed start ${rejected?'failure':'receipt'} cannot mutate a successor during ${gateName}`,async()=>{
  const firstReceipt=deferred(),sent=deferred(),gate=deferred(),entered=deferred();
  const {app,calls,sdk}=fixture({start:async(_config,_url,id)=>{
    calls.push('start');sent.resolve(id);await firstReceipt.promise;
    if(rejected)throw Error('late start failure');
    return {clientRequestId:id,runId:'run-1',status:'running'};
  }});
  await app.refreshTarget();const first=app.start(page.url),firstId=await sent.promise;
  sdk.read=async id=>({clientRequestId:id,runId:'run-1',status:'completed',retired:true,result:{data:[{title:'first'}]}});
  await app.refresh();assert.equal(app.state.retired,true);
  sdk[gateName]=async()=>{entered.resolve();await gate.promise;return page;};
  const second=app.start(page.url);await entered.promise;
  const before=JSON.stringify(app.state),stop=proposal(app,'capture.stop');
  try{
    firstReceipt.resolve();const stale=await first;
    assert.equal(JSON.stringify(app.state),before,'old completion must preserve the entire successor state');
    assert.equal(stale.status,'blocked');assert.equal(stale.stale,true);assert.equal(stale.clientRequestId,firstId);
    const stopped=await actions.executeBusinessAction(app,stop);
    assert.equal(stopped.status,'accepted');assert.equal(stopped.dispatchPrevented,true);
  }finally{gate.resolve();await second;}
  assert.equal((await second).status,'cancelled');assert.deepEqual(calls,['start']);
});

test('start receipt cannot replace the original run binding established by polling',async()=>{
  const gate=deferred(),sent=deferred();
  const {app,sdk}=fixture({start:async(_config,_url,id)=>{
    sent.resolve();await gate.promise;return {clientRequestId:id,runId:'other-run',status:'running'};
  }});
  await app.refreshTarget();const running=app.start(page.url);await sent.promise;
  await app.refresh();assert.equal(app.state.runId,'run-1');
  sdk.read=async()=>{throw Error('unexpected read after mismatched receipt');};
  gate.resolve();const receipt=await running;
  assert.equal(app.state.runId,'run-1');assert.equal(receipt.status,'unknown');assert.match(receipt.error,/身份/);
});

test('stop without a known preparation or original request cannot dispatch',async()=>{
  const {app,calls}=fixture();await app.refreshTarget();
  for(const phase of ['idle','starting','unknown']){
    app.state.phase=phase;
    await assert.rejects(actions.executeBusinessAction(app,proposal(app,'capture.stop')),/没有可停止/);
    assert.equal(app.state.stopRequested,false);
  }
  assert.deepEqual(calls,[]);
});

test('confirmed business actions dispatch once, report actual state and keep ordinary exports raw',async()=>{
  assert.equal(typeof actions.businessIdentity,'function');
  const {app,calls}=fixture();await app.refreshTarget();
  app.edit({...app.state.config,url:page.url,output:{fieldNames:{title:'Original'}}});
  const start=proposal(app,'capture.start');
  const receipt=await actions.executeBusinessAction(app,start);
  assert.equal(receipt.status,'accepted');assert.equal(receipt.runId,'run-1');
  assert.equal(receipt.retired,false);assert.equal(receipt.hostStatus,'running');
  await assert.rejects(actions.executeBusinessAction(app,start),/已消费|变化/);
  assert.equal(calls.filter(value=>value==='start').length,1);
  const shown=await actions.executeBusinessAction(app,proposal(app,'results.show'));
  assert.equal(shown.status,'observed');assert.equal(shown.hasResult,true);
  const stopped=await actions.executeBusinessAction(app,proposal(app,'capture.stop'));
  assert.equal(stopped.status,'accepted');assert.equal(stopped.retired,false);
  app.state.retired=true;app.state.phase='retired';
  app.edit({...app.state.config,output:{fieldNames:{title:'Later'}}});
  const exported=await actions.executeBusinessAction(app,proposal(app,'results.export','csv'));
  assert.equal(exported.status,'accepted');assert.equal(calls.at(-1).format,'csv');
  assert.equal(calls.at(-1).output,undefined);
  assert.equal(app.state.dirty,true,'operations do not save or replace the draft');
});

test('identity drift, locks, invalid operations and missing results cannot dispatch',async()=>{
  assert.equal(typeof actions.businessIdentity,'function');
  for(const change of [s=>s.profileEpoch++,s=>s.config={...s.config,maxPages:2},s=>s.target={...s.target,url:page.url+'other'},
    s=>s.runId='other',s=>s.clientRequestId='other',s=>s.result={data:[]}]) {
    const {app,calls}=fixture();await app.refreshTarget();const old=proposal(app,'capture.start');change(app.state);
    await assert.rejects(actions.executeBusinessAction(app,old),/变化/);assert.deepEqual(calls,[]);
  }
  const {app,calls}=fixture();await app.refreshTarget();
  await assert.rejects(actions.executeBusinessAction(app,proposal(app,'capture.start'),{blocked:true}),/锁定/);
  await assert.rejects(actions.executeBusinessAction(app,proposal(app,'script.run')),/操作/);
  await assert.rejects(actions.executeBusinessAction(app,proposal(app,'results.export','json')),/结果/);
  assert.deepEqual(calls,[]);
});

test('resolved unknown start/download is not success and cannot replay the consumed proposal',async()=>{
  assert.equal(typeof actions.businessIdentity,'function');
  const {app,calls}=fixture({start:async()=>({})});await app.refreshTarget();
  const p=proposal(app,'capture.start'),receipt=await actions.executeBusinessAction(app,p);
  assert.equal(receipt.status,'unknown');assert.ok(receipt.error);
  await assert.rejects(actions.executeBusinessAction(app,p));
  const f=fixture({download:async()=>({})});await f.app.refreshTarget();await f.app.start(page.url);
  const exportProposal=proposal(f.app,'results.export','json');
  assert.equal((await actions.executeBusinessAction(f.app,exportProposal)).status,'unknown');
  await assert.rejects(actions.executeBusinessAction(f.app,exportProposal));
  assert.deepEqual(calls,[]);
});

test('concurrent confirmation is single-flight and disposal blocks late receipts',async()=>{
  assert.equal(typeof actions.businessIdentity,'function');
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const {app,calls}=fixture({prepare:()=>gate});await app.refreshTarget();
  const running=actions.executeBusinessAction(app,proposal(app,'capture.start'));
  await assert.rejects(actions.executeBusinessAction(app,proposal(app,'capture.start')),/操作|锁定/);
  app.dispose();release();
  assert.equal((await running).status,'blocked');assert.deepEqual(calls,[]);
});

for(const kind of ['capture.stop','results.show','results.export'])test('late '+kind+' receipt cannot mutate disposed model state',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  // Substitute only the external operation, keeping the actual model/adapter.
  const sdk={prepare:async()=>{},currentPage:async()=>page,start:async(_c,_u,id)=>({clientRequestId:id,runId:'run-1',status:'running'}),
    read:async id=>({clientRequestId:id,runId:'run-1',status:'running',retired:false,result:{data:[]}}),
    stop:()=>gate,download:()=>gate};
  const app=globalThis.ScrapyAppModel.createApp(sdk);app.edit({...app.state.config,url:page.url});
  await app.refreshTarget();await app.start(page.url);
  if(kind==='results.show')sdk.read=()=>gate;
  const pending=actions.executeBusinessAction(app,proposal(app,kind,kind==='results.export'?'json':undefined));
  app.dispose();const before=JSON.stringify(app.state);
  release({started:true,accepted:true,clientRequestId:app.state.clientRequestId,runId:'run-1',retired:true,status:'completed',result:{data:[{title:'late'}]}});
  assert.equal((await pending).status,'blocked');assert.equal(JSON.stringify(app.state),before);
});

for(const kind of ['capture.stop','results.show'])test(kind+' tolerates polling but rejects changes to original immutable binding',async()=>{
  const f=fixture();await f.app.refreshTarget();await f.app.start(page.url);
  const original=proposal(f.app,kind);
  f.app.state.result={data:[{title:'growing'}]};f.app.state.host='updated';f.app.state.runProfile={config:{output:{fieldNames:{title:'unrelated display'}}}};
  assert.equal((await actions.executeBusinessAction(f.app,original)).status,kind==='capture.stop'?'accepted':'observed');
  for(const change of [...(kind==='capture.stop'?[]:[s=>s.profileEpoch++,s=>s.config={...s.config,maxPages:2},s=>s.target={...s.target,url:page.url+'other'}]),
    s=>s.runId='replacement',s=>s.clientRequestId='replacement']) {
    const {app,calls}=fixture();await app.refreshTarget();await app.start(page.url);const old=proposal(app,kind);change(app.state);
    await assert.rejects(actions.executeBusinessAction(app,old),/变化/);assert.equal(calls.includes('stop'),false);
  }
});

test('original stop remains usable after unrelated page and configuration changes',async()=>{
  const {app,calls}=fixture();await app.refreshTarget();await app.start(page.url);
  const stop=proposal(app,'capture.stop');
  app.state.target={url:'https://other.example/'};app.state.config={...app.state.config,maxPages:2};app.state.profileEpoch++;
  assert.equal((await actions.executeBusinessAction(app,stop)).status,'accepted');assert.equal(calls.includes('stop'),true);
});

test('explicit custom export uses current preferences and supplements actual detail and derived columns',async()=>{
  const {app,calls}=fixture({read:async id=>({clientRequestId:id,runId:'run-1',status:'completed',retired:true,
    result:{data:[{title:'one',detail:1},{title:'two',derived:2}]}})});
  await app.refreshTarget();await app.start(page.url);
  app.edit({...app.state.config,output:{fieldNames:{title:'Current'},fieldOrder:['title']}});
  const p=proposal(app,'results.export','csv');p.operation.mode='custom';
  assert.equal((await actions.executeBusinessAction(app,p)).status,'accepted');
  assert.deepEqual(calls.at(-1).output,{fieldNames:{title:'Current'},fieldOrder:['title','detail','derived']});
});

test('export binds original run output even when result data stays unchanged',async()=>{
  const {app,calls}=fixture();await app.refreshTarget();await app.start(page.url);
  const original=proposal(app,'results.export','csv');
  app.state.runProfile.config.output={fieldNames:{title:'changed'}};
  await assert.rejects(actions.executeBusinessAction(app,original),/变化/);
  assert.equal(calls.some(c=>typeof c==='object'),false);
});

test('viewing results during an existing poll observes current data without starting a duplicate read',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});let reads=0;
  const {app}=fixture({read:async id=>{reads++;if(reads>1)return gate;return {clientRequestId:id,runId:'run-1',status:'running',retired:false,result:{data:[{title:'existing'}]}};}});
  await app.refreshTarget();await app.start(page.url);
  const polling=app.refresh();
  const receipt=await actions.executeBusinessAction(app,proposal(app,'results.show'));
  assert.equal(receipt.status,'observed');assert.equal(receipt.refreshPending,true);assert.equal(receipt.hasResult,true);assert.equal(reads,2);
  release({clientRequestId:app.state.clientRequestId,runId:'run-1',status:'running',retired:false});await polling;
});

test('export refuses a snapshot detached from the reviewed result',async()=>{
  const {app,calls}=fixture();await app.refreshTarget();await app.start(page.url);
  app.state.snapshot={...app.state.snapshot,result:{data:[{title:'different snapshot'}]}};
  await assert.rejects(actions.executeBusinessAction(app,proposal(app,'results.export','json')),/结果/);
  assert.equal(calls.some(c=>typeof c==='object'),false);
});
