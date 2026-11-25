import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieController} from '../app/controller/cookie-controller.js';
import {parseTarget} from '../app/domain/cookie-model.js';
import {safeCode} from '../app/adapters/browser-sdk.js';

const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
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
      return [{name,domain:'example.com',path:'/',hostOnly:true,storeId:'0',valueRedacted:true}];
    }
  };
  const controller=createCookieController({adapter,navigationIntervalMs:8000,onChange:s=>snapshots.push(s)});
  t.after(()=>controller.dispose());
  return {controller,adapter,reads,snapshots,get requests(){return requests;},
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

test('manual Retry replaces a stuck read but neither the Retry nor its replacement bypasses the rate limit',async t=>{
  const f=fixture(t);await f.controller.load();t.mock.timers.tick(8000);
  f.deny(Object.assign(Error('rate'),{code:'E_RATE_LIMIT'}));
  const navigation=f.controller.syncNavigation();await flush();await navigation;
  assert.equal(f.controller.snapshot().readDiagnostic.code,'E_RATE_LIMIT');
  const before=f.requests;
  const first=f.controller.retry();await flush();
  t.mock.timers.tick(4000);await flush();
  const second=f.controller.retry();await flush();await first;
  t.mock.timers.tick(55999);await flush();assert.equal(f.requests,before);
  f.page('fresh');t.mock.timers.tick(1);await flush();
  assert.equal(await second,true);
  assert.equal(f.controller.snapshot().target.url,'https://example.com/fresh');
  assert.equal(f.controller.snapshot().readDiagnostic,null);
});

test('navigation queued during exact-list preflight prevents retained-value and write requests',async t=>{
  const {controller,adapter,page}=fixture(t);await controller.load();
  const before=deferred(),row=controller.snapshot().rows[0],calls=[];
  let live;
  adapter.exactList=(_at,_row,isCurrent)=>{live=isCurrent;return before.promise;};
  adapter.readValue=async()=>{calls.push('value');return 'synthetic';};
  adapter.write=async()=>{calls.push('write');return {saved:true,verified:true};};
  const saving=controller.save({...row,hostOnly:true,value:'',valueRedacted:false},{originalId:row.id,valueEdited:false});
  assert.equal(typeof live,'function');
  page('next');assert.equal(await controller.syncNavigation(),false);
  assert.equal(controller.snapshot().navigationPending,true);
  assert.equal(live(),false);
  before.resolve([row]);assert.equal(await saving,false);
  assert.deepEqual(calls,[]);
  assert.deepEqual(controller.snapshot().unknownEffects,[]);
  t.mock.timers.tick(8000);await flush();
  assert.equal(controller.snapshot().target.url,'https://example.com/next');
});

test('queued Retry lets a committed rename receipt settle without sending the old-name delete',async t=>{
  const {controller,adapter,page}=fixture(t);await controller.load();
  const receipt=deferred(),row=controller.snapshot().rows[0],calls=[];
  adapter.exactList=async()=>[row];
  adapter.write=()=>{calls.push('write');return receipt.promise;};
  adapter.remove=async()=>{calls.push('remove');return {removed:true,verified:true};};
  const saving=controller.save({...row,name:'renamed',hostOnly:true,value:'synthetic',valueRedacted:false},{originalId:row.id});
  await flush();assert.deepEqual(calls,['write']);
  page('next');await controller.syncNavigation();
  const retry=controller.retry();await flush();
  assert.equal(controller.snapshot().busy,true);
  assert.equal(controller.snapshot().target.url,'https://example.com/start');
  receipt.resolve({saved:true,verified:true});
  assert.equal(await saving,false,'rename is only partially complete');
  assert.equal(await retry,true);
  assert.deepEqual(calls,['write']);
  assert.match(controller.snapshot().message,/新名称已写入.*未发送旧名称删除/);
  assert.deepEqual(controller.snapshot().unknownEffects,[]);
});

for(const result of ['verified','unknown','not submitted'])test('queued navigation settles the first import write without sending later rows: '+result,async t=>{
  const {controller,adapter,page}=fixture(t);await controller.load();
  const receipt=deferred(),calls=[];
  adapter.exactList=async()=>[];
  adapter.supportsWriteMany=()=>false;
  adapter.write=(_at,cookie)=>{calls.push(cookie.name);return receipt.promise;};
  const source='first=synthetic; second=synthetic';
  const plan=await controller.previewImport(source,'header');assert.ok(plan);
  const importing=controller.executeImport(source,'header');await flush();
  assert.deepEqual(calls,['first']);
  page('next');await controller.syncNavigation();
  if(result==='verified')receipt.resolve({verified:true,saved:true});
  else receipt.reject(Object.assign(Error(result),{
    code:result==='unknown'?'E_OUTCOME_UNKNOWN':'E_COOKIE_NOT_SUBMITTED'}));
  assert.equal(await importing,false);
  const settled=controller.snapshot().importResult;
  const {status,code,total,confirmed,failed,skipped,unknown,notRun}=settled;
  assert.deepEqual({status,code,total,confirmed,failed,skipped,unknown,notRun},{
    total:2,failed:0,skipped:0,...{
      verified:{status:'partial',code:'E_COOKIE_NOT_SUBMITTED',confirmed:1,unknown:0,notRun:1},
      unknown:{status:'unknown',code:'E_OUTCOME_UNKNOWN',confirmed:0,unknown:1,notRun:1},
      'not submitted':{status:'denied',code:'E_COOKIE_NOT_SUBMITTED',confirmed:0,unknown:0,notRun:2}
    }[result]
  });
  t.mock.timers.tick(8000);await flush();
  assert.equal(controller.snapshot().target.url,'https://example.com/next');
  assert.deepEqual(controller.snapshot().importResult,settled);
  if(result==='unknown'){
    assert.equal((await controller.previewImport(source,'header')).accepted,2);
    assert.equal(await controller.executeImport(source,'header'),false);
    assert.equal(controller.snapshot().importResult.code,'E_COOKIE_IMPORT_OVERLAP');
  }
  assert.deepEqual(calls,['first']);
});

for(const outcome of ['verified','not submitted','unknown'])test('replacement document can be read before a dispatched delete settles: '+outcome,async t=>{
  const {controller,adapter,page,row}=fixture(t);await controller.load();
  const receipt=deferred(),old=controller.snapshot().rows[0],calls=[];
  adapter.remove=(_at,record)=>{calls.push(record.id);return receipt.promise;};
  const deleting=controller.remove(old.id);
  assert.deepEqual(calls,[old.id]);
  controller.invalidate('document replaced');
  assert.equal(controller.snapshot().settlingPrevious,true);
  assert.deepEqual(controller.snapshot().rows,[]);
  assert.deepEqual(controller.snapshot().unknownEffects,[]);
  page('replacement');row('fresh');
  assert.equal(await controller.load('',{preserveMessage:true}),true);
  const fresh=controller.snapshot().rows[0];
  assert.equal(fresh.name,'fresh');
  assert.equal(await controller.remove(fresh.id),false,'no second write until original receipt');
  if(outcome==='verified')receipt.resolve({verified:true,removed:true});
  else receipt.reject(Object.assign(Error(),{code:outcome==='unknown'?'E_OUTCOME_UNKNOWN':'E_COOKIE_NOT_SUBMITTED'}));
  assert.equal(await deleting,outcome==='verified');
  const view=controller.snapshot();
  assert.deepEqual(view.unknownEffects,outcome==='unknown'?['remove']:[]);
  assert.equal(view.previousReceipt.type,{'verified':'success','not submitted':'warning','unknown':'error'}[outcome]);
  assert.doesNotMatch(view.previousReceipt.text,/fixture/);
  assert.equal(view.settlingPrevious,false);
  assert.equal(view.rows[0].name,'fresh');
  assert.equal(view.phase,'ready');
  assert.deepEqual(calls,[old.id]);
  await controller.retry();
  assert.deepEqual(controller.snapshot().previousReceipt,view.previousReceipt);
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
