import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieController} from '../app/controller/cookie-controller.js';
import {parseTarget} from '../app/domain/cookie-model.js';
import {safeCode} from '../app/adapters/browser-sdk.js';

const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(t){
  t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
  let url='https://example.com/start',name='fixture',denial=null,requests=0,unresolved=false,targetReads=0,afterUnresolved=false;
  const reads=[],snapshots=[];
  const call=value=>{requests++;return value;};
  const adapter={
    targetFor:async()=>{targetReads++;return call(unresolved||afterUnresolved&&targetReads%2===1
      ?{target:null,reasonCode:'E_DOCUMENT_UNRESOLVED'}:{target:parseTarget(url)});},
    checkRead:async()=>call({callableNow:true}),
    getStore:async()=>call({storeId:'0'}),
    getPartition:async()=>call({partitionKey:{topLevelSite:'https://example.com'}}),
    list:async()=>{
      call();reads.push(url);
      if(denial){const error=denial;denial=null;throw error;}
      return [{name,domain:'example.com',path:'/',storeId:'0',valueRedacted:true}];
    }
  };
  const controller=createCookieController({adapter,navigationIntervalMs:8000,onChange:s=>snapshots.push(s)});
  t.after(()=>controller.dispose());
  return {controller,reads,snapshots,get requests(){return requests;},
    page:value=>{url='https://example.com/'+value;},row:value=>{name=value;},
    unresolved:value=>{unresolved=value;},
    afterUnresolved:()=>{afterUnresolved=true;},
    deny:error=>{denial=error;}};
}

test('twenty paths coalesce within the shared navigation/passive budget and publish latest metadata',async t=>{
  const f=fixture(t);await f.controller.load();t.mock.timers.tick(8000);
  assert.equal(await f.controller.syncMetadata(),true);
  const before=f.requests;
  let pending;
  for(let i=1;i<=20;i++){
    f.page('path-'+i);pending=f.controller.syncNavigation();
    assert.equal(await f.controller.syncMetadata(),false);
    assert.equal(f.controller.snapshot().navigationPending,true);
    assert.equal(f.controller.snapshot().rows.length,1);
  }
  assert.equal(f.requests,before,'waiting paths do not dispatch more SDK work');
  assert.equal(await f.controller.readValue(f.controller.snapshot().rows[0].id),null);
  f.row('changed');t.mock.timers.tick(7999);await flush();assert.equal(f.requests,before);
  t.mock.timers.tick(1);await flush();await pending;
  assert.deepEqual(f.reads,['https://example.com/start','https://example.com/start','https://example.com/path-20']);
  assert.equal(f.controller.snapshot().target.url,'https://example.com/path-20');
  assert.equal(f.controller.snapshot().rows[0].name,'changed');
  assert.equal(f.controller.snapshot().navigationPending,false);
  assert.equal(await f.controller.syncMetadata(),false,'passive shares the navigation cooldown');
  t.mock.timers.tick(8000);f.row('later-change');
  assert.equal(await f.controller.syncMetadata(),true);
  assert.equal(f.controller.snapshot().rows[0].name,'later-change');
  assert.ok(f.snapshots.every(s=>s.phase!=='ready'||s.rows.length===1));
});

test('an unresolved same-tab read preserves only fenced metadata until full revalidation',async t=>{
  const f=fixture(t);await f.controller.load();t.mock.timers.tick(8000);
  f.unresolved(true);f.page('settling');await f.controller.syncNavigation();await flush();
  assert.equal(f.controller.snapshot().navigationPending,true);
  assert.equal(f.controller.snapshot().rows.length,1);
  assert.equal(await f.controller.exportTo({method:'copy'}),false);
  f.unresolved(false);f.row('fresh');t.mock.timers.tick(8000);await flush();
  assert.equal(f.controller.snapshot().target.url,'https://example.com/settling');
  assert.equal(f.controller.snapshot().rows[0].name,'fresh');
  assert.equal(f.controller.snapshot().navigationPending,false);
});

test('permanently unresolved navigation terminates its read retry and stays fail closed',async t=>{
  const f=fixture(t);await f.controller.load();t.mock.timers.tick(8000);
  f.unresolved(true);await f.controller.syncNavigation();await flush();
  for(let i=0;i<3;i++){t.mock.timers.tick(8000);await flush();}
  assert.equal(f.controller.snapshot().phase,'blocked');
  assert.deepEqual(f.controller.snapshot().rows,[]);
  const count=f.requests;t.mock.timers.tick(60000);await flush();
  assert.equal(f.requests,count);
});

test('target-after unresolved uses the same bounded retry as target-before',async t=>{
  const f=fixture(t);await f.controller.load();t.mock.timers.tick(8000);f.afterUnresolved();
  await f.controller.syncNavigation();await flush();
  assert.equal(f.controller.snapshot().readDiagnostic.stage,'target-after');
  for(let i=0;i<4;i++){t.mock.timers.tick(8000);await flush();}
  assert.equal(f.controller.snapshot().phase,'blocked');
  assert.deepEqual(f.controller.snapshot().rows,[]);
});

test('automatic load rate recovery waits sixty seconds and invalidation cancels it',async t=>{
  const f=fixture(t);await f.controller.load();t.mock.timers.tick(8000);
  f.deny(Object.assign(Error('工具请求过于频繁，请一分钟后重试'),{code:'E_TOOL'}));
  const loading=f.controller.load('',{automatic:true});await flush();
  assert.equal(f.controller.snapshot().readDiagnostic.code,'E_RATE_LIMIT');
  const before=f.requests;t.mock.timers.tick(59999);await flush();assert.equal(f.requests,before);
  t.mock.timers.tick(1);await flush();await loading;
  assert.equal(f.controller.snapshot().phase,'ready');
  assert.equal(f.controller.snapshot().readDiagnostic,null);
  assert.doesNotMatch(f.controller.snapshot().message,/等待一分钟/);
  t.mock.timers.tick(8000);f.deny(Object.assign(Error('工具请求过于频繁，请一分钟后重试'),{code:'E_TOOL'}));
  const retired=f.controller.load('',{automatic:true});await flush();
  const finalCount=f.requests;f.controller.invalidate();await retired;
  t.mock.timers.tick(60001);await flush();assert.equal(f.requests,finalCount);
  assert.deepEqual(f.controller.snapshot().rows,[]);
});

test('only the exact legacy Host rate rejection waits sixty seconds behind the sensitive-action fence',async t=>{
  const f=fixture(t);await f.controller.load();t.mock.timers.tick(8000);f.page('next');
  f.deny(Object.assign(Error('工具请求过于频繁，请一分钟后重试'),{code:'E_TOOL'}));
  await f.controller.syncNavigation();await flush();
  const blocked=f.requests;
  assert.equal(f.controller.snapshot().phase,'ready');
  assert.equal(f.controller.snapshot().navigationPending,true);
  assert.equal(f.controller.snapshot().rows.length,1);
  assert.equal(f.controller.snapshot().readDiagnostic.code,'E_RATE_LIMIT');
  assert.equal(await f.controller.exportTo({method:'copy'}),false);
  f.page('latest');void f.controller.syncNavigation();
  t.mock.timers.tick(59999);await flush();assert.equal(f.requests,blocked);
  t.mock.timers.tick(1);await flush();
  assert.equal(f.controller.snapshot().target.url,'https://example.com/latest');
  assert.equal(f.controller.snapshot().navigationPending,false);
  assert.equal(f.controller.snapshot().syncStale,false);
  assert.equal(safeCode({code:'E_TOOL',message:'arbitrary secret'}),'E_COOKIE_READ');
});

for(const retire of ['invalidate','dispose'])test(retire+' cancels delayed reads without resurrecting rows',async t=>{
  const f=fixture(t);await f.controller.load();t.mock.timers.tick(8000);await f.controller.syncMetadata();
  f.page('retired');const pending=f.controller.syncNavigation();await flush();
  assert.equal(f.controller.snapshot().navigationPending,true);
  const before=f.requests;f.controller[retire]();
  await pending;t.mock.timers.tick(60001);await flush();
  assert.equal(f.requests,before);
  assert.deepEqual(f.controller.snapshot().rows,[]);
  assert.equal(f.controller.snapshot().navigationPending,false);
});
