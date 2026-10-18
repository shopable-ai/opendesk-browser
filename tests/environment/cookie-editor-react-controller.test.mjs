import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieController} from '../../examples/sidebar-tools/cookie-editor/app/controller/cookie-controller.js';
import {createCookieSdkAdapter} from '../../examples/sidebar-tools/cookie-editor/app/adapters/browser-sdk.js';

const site='https://shop.example.com/account';
const base={name:'sid',value:'SECRET_FIXTURE',domain:'shop.example.com',path:'/',
  hostOnly:true,storeId:'0',session:true,secure:false,httpOnly:false,sameSite:'lax'};
const copy=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {resolve,promise};};
function fixture(){
  let rows=[copy(base)],allow=true;
  const calls=[],stopCalls=[];
  const cookies={
    getAll:async opts=>{
      calls.push(['getAll',copy(opts)]);
      return opts.partitionKey?[]:rows.filter(row=>!opts.name||row.name===opts.name).map(copy);
    },
    getPartitionKey:async()=>({partitionKey:{topLevelSite:'https://shop.example.com'}}),
    getCurrentStore:async()=>({storeId:'0'}),
    get:async()=>({cookie:{...rows[0],valueRedacted:false}}),
    set:async opts=>{
      calls.push(['set',copy(opts)]);
      rows=rows.filter(item=>item.name!==opts.name);
      rows.push({...base,...opts,domain:base.domain,hostOnly:true});
      return {saved:true,verified:true};
    },
    remove:async opts=>{
      calls.push(['remove',copy(opts)]);
      rows=rows.filter(item=>item.name!==opts.name);
      return {removed:true,verified:true};
    },
    clearSite:async opts=>opts.preview?{matched:rows.length,previewRef:'12345678-1234-1234-1234-123456789abc'}:
      {preview:false,scope:'EXACT_HOST_HOST_ONLY',matched:1,removed:1,remaining:0},
    observe:{
      start:async()=>({sessionRef:'session-ref'}),
      read:async()=>({events:[],nextCursor:'0'}),
      stop:async opts=>{stopCalls.push(copy(opts));return {stopped:true};}
    }
  };
  const browser={cookies,capabilities:{getStatus:async()=>({callableNow:allow,
    reasonCode:allow?undefined:'E_SITE_GRANT_REQUIRED'})},
    clipboard:{writeText:async text=>calls.push(['copy',text])},
    downloads:{text:async args=>calls.push(['download',copy(args)])}};
  const adapter=createCookieSdkAdapter({getBrowser:()=>browser,
    request:async()=>({status:'available',url:site})});
  const snapshots=[];
  const controller=createCookieController({adapter,onChange:s=>snapshots.push(s)});
  return {browser,cookies,adapter,controller,calls,stopCalls,snapshots,
    rows:()=>copy(rows),grant:value=>{allow=value}};
}
test('real public SDK adapter/controller load redacts sensitive values',async()=>{
  const f=fixture();await f.controller.load();
  assert.equal(f.controller.snapshot().phase,'ready');
  assert.equal(f.controller.snapshot().rows[0].value,undefined);
  assert.equal(JSON.stringify(f.snapshots).includes('SECRET_FIXTURE'),false);
  assert.equal(f.controller.snapshot().rows[0].valueRedacted,true);
  f.controller.dispose();
});
test('save verifies receipt and rename writes before deleting old identity',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id;
  assert.equal(await f.controller.save({...base,name:'new-sid',value:'NEW_SECRET'},
    {originalId:id}),true);
  assert.deepEqual(f.calls.filter(c=>c[0]==='set'||c[0]==='remove').map(c=>c[0]),['set','remove']);
  assert.deepEqual(f.rows().map(x=>x.name),['new-sid']);
  assert.equal(JSON.stringify(f.snapshots).includes('NEW_SECRET'),false);
  f.controller.dispose();
});
test('failed rename removal reports uncertainty without replay',async()=>{
  const f=fixture();await f.controller.load();
  f.cookies.remove=async()=>{throw Object.assign(Error('SECRET_FIXTURE'),{code:'E_OUTCOME_UNKNOWN'});};
  const id=f.controller.snapshot().rows[0].id;
  assert.equal(await f.controller.save({...base,name:'renamed'},{originalId:id}),false);
  assert.equal(f.controller.snapshot().messageType,'error');
  assert.match(f.controller.snapshot().message,/两条可能并存/);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/SECRET_FIXTURE/);
  f.controller.dispose();
});
test('unknown native write must never automatically retry',async()=>{
  const f=fixture();await f.controller.load();
  let writes=0;
  f.cookies.set=async()=>{writes++;throw Object.assign(Error('PRIVATE'),{code:'E_OUTCOME_UNKNOWN'});};
  assert.equal(await f.controller.save({...base,name:'new'}),false);
  assert.equal(writes,1);
  assert.match(f.controller.snapshot().message,/不要自动重试/);
  f.controller.dispose();
});
test('navigation invalidates stale async reads and retires observation',async()=>{
  const f=fixture();await f.controller.load();
  await f.controller.observe('start');
  f.controller.invalidate('目标已变');
  await Promise.resolve();await Promise.resolve();
  assert.equal(f.controller.snapshot().rows.length,0);
  assert.equal(f.stopCalls.length,1);
  await f.controller.load();
  const pending=deferred();f.cookies.getAll=async()=>pending.promise;
  const read=f.controller.load();await Promise.resolve();await Promise.resolve();
  f.controller.invalidate('撤销授权');
  pending.resolve([{...base,value:'DO_NOT_DISPLAY'}]);await read;
  assert.equal(f.controller.snapshot().rows.length,0);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/DO_NOT_DISPLAY/);
  f.controller.dispose();
});
test('clear preview and execute validate the Host result before declaring success',async()=>{
  const f=fixture();await f.controller.load();
  assert.equal((await f.controller.previewClear()).count,1);
  assert.equal(await f.controller.executeClear(),true);
  assert.equal(f.controller.snapshot().messageType,'success');
  f.controller.dispose();
});
test('bulk import preflight and native partial failure never replay writes',async()=>{
  const f=fixture();await f.controller.load();
  let calls=0;f.cookies.setMany=async({cookies})=>{
    calls++;return {results:cookies.map((_,index)=>({
      index,saved:index===0,verified:index===0
    }))};
  };
  const source='new1=A; new2=B';
  const plan=await f.controller.previewImport(source);
  assert.equal(plan.accepted,2);
  assert.equal(await f.controller.executeImport(source),false);
  assert.equal(calls,1);
  assert.equal(f.controller.snapshot().messageType,'error');
  f.controller.dispose();
});

test('discarded import preflight never writes a stale secret plan',async()=>{
  const f=fixture();await f.controller.load();
  const result=await f.controller.previewImport('temporary=SECRET_NOT_FOR_UI');
  assert.equal(result.accepted,1);
  f.controller.discardImport();
  let writes=0;f.cookies.set=async()=>{writes++;return {saved:true,verified:true};};
  assert.equal(await f.controller.executeImport('temporary=SECRET_NOT_FOR_UI'),false);
  assert.equal(writes,0);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/SECRET_NOT_FOR_UI/);
  f.controller.dispose();
});
