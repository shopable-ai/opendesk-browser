import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieController} from '../../examples/sidebar-tools/cookie-editor/app/controller/cookie-controller.js';
import {createCookieSdkAdapter} from '../../examples/sidebar-tools/cookie-editor/app/adapters/browser-sdk.js';

const site='https://shop.example.com/account';
const base={name:'sid',value:'SECRET_FIXTURE',domain:'shop.example.com',path:'/',
  hostOnly:true,storeId:'0',session:true,secure:false,httpOnly:false,sameSite:'lax'};
const copy=value=>structuredClone(value);
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {resolve,reject,promise};};
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
  assert.equal(plan.issueCount,0);
  assert.equal(await f.controller.executeImport(source),false);
  assert.equal(calls,1);
  assert.equal(f.controller.snapshot().messageType,'error');
  f.controller.dispose();
});

test('import skips existing cookie slots by default, with a separately approved overwrite plan',async()=>{
  const f=fixture();await f.controller.load();
  const source='sid=REPLACEMENT; fresh=ADDED';
  const safe=await f.controller.previewImport(source);
  assert.equal(safe.created,1);
  assert.equal(safe.replaced,1);
  assert.equal(safe.accepted,1);
  assert.equal(safe.skipped,1);
  assert.equal(await f.controller.executeImport(source,'auto',true),false);
  assert.equal(f.calls.some(([name])=>name==='set'),false);
  const preview=await f.controller.previewImport(source);
  assert.equal(preview.accepted,1);
  assert.equal(await f.controller.executeImport(source),true);
  assert.equal(f.calls.filter(([name])=>name==='set').length,1);
  assert.equal(f.rows().find(row=>row.name==='sid').value,'SECRET_FIXTURE');
  const approved=await f.controller.previewImport(source,'auto',true);
  assert.equal(approved.replaced,2);
  assert.equal(approved.accepted,2);
  assert.equal(await f.controller.executeImport(source,'auto',true),true);
  assert.equal(f.rows().find(row=>row.name==='sid').value,'REPLACEMENT');
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

test('import preflight publishes statuses and safe reasons only, never values',async()=>{
  const f=fixture();await f.controller.load();
  const source=JSON.stringify([{name:'bad',value:'SENSITIVE_INPUT',expirationDate:1,session:false},
    {name:'valid',value:'OTHER_SENSITIVE',session:true}]);
  const plan=await f.controller.previewImport(source,'json');
  assert.equal(plan.accepted,1);
  assert.equal(plan.issueCount,1);
  assert.equal(plan.issues[0].status,'expired');
  assert.doesNotMatch(JSON.stringify(plan),/SENSITIVE_INPUT|OTHER_SENSITIVE/);
  f.controller.dispose();
});

test('editing import text during async preflight invalidates old plan without writes',async()=>{
  const f=fixture();await f.controller.load();
  const pending=deferred();
  f.cookies.getCurrentStore=async()=>pending.promise;
  const preview=f.controller.previewImport('before=STALE_SECRET');
  await Promise.resolve();await Promise.resolve();
  f.controller.discardImport();
  pending.resolve({storeId:'0'});
  assert.equal(await preview,null);
  assert.equal(await f.controller.executeImport('before=STALE_SECRET'),false);
  assert.equal(f.calls.some(([name])=>name==='set'),false);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/STALE_SECRET/);
  f.controller.dispose();
});

test('R5.15 preserving an unedited Cookie value is not an empty write',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id;
  const input={...base,secure:true,value:''};
  assert.equal(await f.controller.save(input,{originalId:id,valueEdited:false}),true);
  assert.equal(f.rows()[0].value,'SECRET_FIXTURE');
  assert.equal(f.rows()[0].secure,true);
  assert.equal(f.calls.filter(([kind])=>kind==='set').length,1);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/SECRET_FIXTURE/);
  f.controller.dispose();
});

test('R5.15 no value grant refuses implicit blank overwrite but permits explicit empty',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id;
  f.cookies.get=async()=>({cookie:{...base,valueRedacted:true}});
  assert.equal(await f.controller.readValue(id),null);
  assert.equal(await f.controller.save({...base,secure:true,value:''},
    {originalId:id,valueEdited:false}),false);
  assert.equal(f.calls.filter(([kind])=>kind==='set').length,0);
  assert.equal(f.rows()[0].value,'SECRET_FIXTURE');
  assert.equal(await f.controller.save({...base,value:''},
    {originalId:id,valueEdited:true}),true);
  assert.equal(f.rows()[0].value,'');
  f.controller.dispose();
});

test('R5.20 preserving a withheld value accepts an omitted draft value',async()=>{
  const f=fixture();await f.controller.load();
  const {value,...draft}=base;
  const id=f.controller.snapshot().rows[0].id;
  assert.equal(await f.controller.save({...draft,secure:true},
    {originalId:id,valueEdited:false}),true);
  assert.equal(f.rows()[0].value,value);
  assert.equal(f.rows()[0].secure,true);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/SECRET_FIXTURE/);
  f.controller.dispose();
});

test('R5.20 value reads cannot complete into an editor during a pending write',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id;
  const valueRead=deferred(),write=deferred();
  f.cookies.get=async()=>valueRead.promise;
  f.cookies.set=async()=>write.promise;
  const reading=f.controller.readValue(id);
  const saving=f.controller.save({...base,value:'EDITED'},{originalId:id});
  valueRead.resolve({cookie:{...base,valueRedacted:false}});
  assert.equal(await reading,null);
  write.resolve({saved:false,verified:false});
  assert.equal(await saving,false);
  f.controller.dispose();
});

test('R5.20 a dismissed in-flight clear preview never becomes executable',async()=>{
  const f=fixture();await f.controller.load();
  const pending=deferred();let clears=0;
  f.cookies.clearSite=async opts=>{if(opts.preview)return pending.promise;clears++;};
  const preview=f.controller.previewClear();
  f.controller.discardClear();
  pending.resolve({matched:1,previewRef:'12345678-1234-1234-1234-123456789abc'});
  assert.equal(await preview,null);
  assert.equal(await f.controller.executeClear(),false);
  assert.equal(clears,0);
  f.controller.dispose();
});

test('R5.20 batched imports preserve the no-overwrite decision at native write time',async()=>{
  const f=fixture();await f.controller.load();
  const batches=[];
  f.cookies.setMany=async opts=>{
    batches.push(copy(opts));
    return {results:opts.cookies.map((_,index)=>({index,saved:true,verified:true}))};
  };
  await f.controller.previewImport('fresh=PRIVATE');
  assert.equal(await f.controller.executeImport('fresh=PRIVATE'),true);
  assert.equal(batches[0].cookies[0].ifAbsent,true);
  await f.controller.previewImport('fresh=PRIVATE','auto',true);
  assert.equal(await f.controller.executeImport('fresh=PRIVATE','auto',true),true);
  assert.equal(batches[1].cookies[0].ifAbsent,undefined);
  f.controller.dispose();
});

test('R5.20 import preflight recognizes a native slot across host-only representations',async()=>{
  const f=fixture();await f.controller.load();
  const source=JSON.stringify([{...base,domain:'.shop.example.com',hostOnly:false}]);
  const plan=await f.controller.previewImport(source,'json');
  assert.equal(plan.replaced,1);
  assert.equal(plan.accepted,0);
  assert.equal(await f.controller.executeImport(source,'json'),false);
  assert.equal(f.calls.some(([name])=>name==='set'),false);
  f.controller.dispose();
});

test('R5.20 consumers cannot mutate the Controller target or partition identity',async()=>{
  const f=fixture();
  const partitionKey={topLevelSite:'https://shop.example.com'};
  f.cookies.getAll=async opts=>opts.partitionKey?[{...base,partitionKey}]:[];
  await f.controller.load();
  const snapshot=f.controller.snapshot(),id=snapshot.rows[0].id;
  snapshot.target.url='https://evil.example/';
  snapshot.rows[0].partitionKey.topLevelSite='https://evil.example';
  f.controller.getRow(id).partitionKey.topLevelSite='https://another.example';
  assert.equal(f.controller.snapshot().target.url,site);
  assert.equal(f.controller.snapshot().rows[0].partitionKey.topLevelSite,
    'https://shop.example.com');
  f.controller.dispose();
});

test('R5.20 failed saves retain caller drafts and do not consume list identity',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id,draft={...base,name:'renamed',value:'DRAFT_SECRET'};
  const before=copy(draft);
  f.cookies.set=async()=>{throw Object.assign(Error('DRAFT_SECRET'),{code:'E_CANCELLED'});};
  assert.equal(await f.controller.save(draft,{originalId:id}),false);
  assert.deepEqual(draft,before);
  assert.equal(f.controller.getRow(id).name,base.name);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/DRAFT_SECRET/);
  assert.equal(f.calls.some(([name])=>name==='remove'),false);
  f.controller.dispose();
});

test('R5.20 revocation during export prevents both sensitive sinks',async()=>{
  for(const method of ['copy','download']){
    const f=fixture();await f.controller.load();
    const pending=deferred();f.cookies.getAll=async()=>pending.promise;
    const exporting=f.controller.exportTo({method});
    f.controller.invalidate('撤权');
    pending.resolve([{...base,valueRedacted:false}]);
    assert.equal(await exporting,false);
    assert.equal(f.calls.some(([name])=>name===method),false);
    assert.doesNotMatch(JSON.stringify(f.snapshots),/SECRET_FIXTURE/);
    f.controller.dispose();
  }
});

test('R5.20 revocation stops an import between native chunks without replay',async()=>{
  const f=fixture();await f.controller.load();
  const source='first=ONE; second=TWO';let writes=0;
  await f.controller.previewImport(source);
  f.cookies.set=async()=>{
    writes++;
    f.controller.invalidate('撤权');
    return {saved:true,verified:true};
  };
  assert.equal(await f.controller.executeImport(source),false);
  assert.equal(writes,1);
  await f.controller.load();
  assert.equal(await f.controller.executeImport(source),false);
  assert.equal(writes,1);
  f.controller.dispose();
});

test('R5.20 confirmed empty values stay distinct from denied values',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id;
  f.cookies.get=async()=>({cookie:{...base,value:'',valueRedacted:false}});
  assert.equal(await f.controller.readValue(id),'');
  f.cookies.get=async()=>({cookie:{...base,value:'',valueRedacted:true}});
  assert.equal(await f.controller.readValue(id),null);
  f.controller.dispose();
});

test('R5.20 explicit replacement overrides a metadata marker without treating omission as empty',async()=>{
  const f=fixture();await f.controller.load();
  const row=f.controller.snapshot().rows[0];
  assert.equal(await f.controller.save({...row,value:''},
    {originalId:row.id,valueEdited:true}),true);
  assert.equal(f.rows()[0].value,'');
  const current=f.controller.snapshot().rows[0];
  assert.equal(await f.controller.save(current,
    {originalId:current.id,valueEdited:true}),false);
  assert.equal(f.calls.filter(([name])=>name==='set').length,1);
  f.controller.dispose();
});

test('R5.20 rename retains exact Store, Partition and Path in both native mutations',async()=>{
  const f=fixture();
  const old={...base,path:'/account',partitionKey:{
    topLevelSite:'https://shop.example.com',hasCrossSiteAncestor:true}};
  f.cookies.getAll=async opts=>opts.partitionKey?[copy(old)]:[];
  f.cookies.get=async()=>({cookie:{...old,valueRedacted:false}});
  await f.controller.load();
  const id=f.controller.snapshot().rows[0].id;
  assert.equal(await f.controller.save({...old,name:'renamed',value:''},
    {originalId:id,valueEdited:false}),true);
  const mutations=f.calls.filter(([name])=>['set','remove'].includes(name));
  assert.deepEqual(mutations.map(([name])=>name),['set','remove']);
  for(const [,opts] of mutations){
    assert.equal(opts.storeId,old.storeId);
    assert.equal(opts.path,old.path);
    assert.deepEqual(opts.partitionKey,old.partitionKey);
  }
  assert.equal(mutations[0][1].ifAbsent,true);
  assert.equal(mutations[0][1].value,base.value);
  assert.equal(mutations[1][1].name,base.name);
  f.controller.dispose();
});

test('R5.20 rename collisions and scope edits never reach native mutations',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id;
  for(const patch of [
    {path:'/other'},{storeId:'1'},{hostOnly:false},
    {partitionKey:{topLevelSite:'https://other.example'}}
  ])assert.equal(await f.controller.save({...base,...patch},{originalId:id}),false);
  f.cookies.getAll=async opts=>opts.partitionKey?[]:[copy(base),{
    ...base,name:'renamed',domain:'.shop.example.com',hostOnly:false
  }];
  assert.equal(await f.controller.save({...base,name:'renamed'},{originalId:id}),false);
  assert.equal(f.calls.some(([name])=>['set','remove'].includes(name)),false);
  f.controller.dispose();
});

test('R5.20 import preflight rejects Store and Partition mismatches before writes',async()=>{
  const f=fixture();await f.controller.load();
  const source=JSON.stringify([
    {...base,name:'store',storeId:'1'},
    {...base,name:'partition',partitionKey:{topLevelSite:'https://other.example'}},
    {...base,name:'ancestor',partitionKey:{topLevelSite:'https://shop.example.com',hasCrossSiteAncestor:true}}
  ]);
  const plan=await f.controller.previewImport(source,'json');
  assert.equal(plan.accepted,0);
  assert.equal(plan.issueCount,3);
  assert.equal(await f.controller.executeImport(source,'json'),false);
  assert.equal(f.calls.some(([name])=>name==='set'),false);
  f.controller.dispose();
});

test('R5.20 a revoked clear plan and an unknown clear receipt are never replayed',async()=>{
  const f=fixture();await f.controller.load();let clears=0;
  await f.controller.previewClear();
  f.controller.invalidate('撤权');await f.controller.load();
  f.cookies.clearSite=async opts=>{
    if(opts.preview)return {matched:1,previewRef:'12345678-1234-1234-1234-123456789abc'};
    clears++;throw Object.assign(Error('SECRET_FIXTURE'),{code:'E_OUTCOME_UNKNOWN'});
  };
  assert.equal(await f.controller.executeClear(),false);
  assert.equal(clears,0);
  await f.controller.previewClear();
  assert.equal(await f.controller.executeClear(),false);
  assert.equal(await f.controller.executeClear(),false);
  assert.equal(clears,1);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/SECRET_FIXTURE/);
  f.controller.dispose();
});

test('R5.20 metadata exports strip values and full exports require explicit value receipts',async()=>{
  const f=fixture();await f.controller.load();
  assert.equal(await f.controller.exportTo({metadata:true,method:'copy'}),true);
  const metadata=JSON.parse(f.calls.find(([name])=>name==='copy')[1]);
  assert.equal(metadata.restoreSupported,false);
  assert.equal('value' in metadata.cookies[0],false);
  assert.equal(await f.controller.exportTo({method:'download'}),false);
  assert.equal(f.calls.some(([name])=>name==='download'),false);
  f.cookies.getAll=async opts=>opts.partitionKey?[]:[{...base,valueRedacted:false}];
  assert.equal(await f.controller.exportTo({method:'download'}),true);
  assert.equal(f.calls.find(([name])=>name==='download')[1].text.includes(base.value),true);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/SECRET_FIXTURE/);
  f.controller.dispose();
});

test('R5.20 a revoked SDK receipt invalidates both preflights without waiting for a UI event',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id,source='fresh=SECRET';
  await f.controller.previewImport(source);
  await f.controller.previewClear();
  const epoch=f.controller.snapshot().epoch;
  f.cookies.get=async()=>{throw Object.assign(Error('PRIVATE'),{code:'E_GRANT_REVOKED'});};
  assert.equal(await f.controller.readValue(id),null);
  assert.ok(f.controller.snapshot().epoch>epoch);
  assert.equal(f.controller.snapshot().target,null);
  await f.controller.load();
  assert.equal(await f.controller.executeImport(source),false);
  assert.equal(await f.controller.executeClear(),false);
  assert.equal(f.calls.some(([name])=>name==='set'),false);
  f.controller.dispose();
});

test('R5.20 dismissed preflight errors do not replace the current status',async()=>{
  for(const kind of ['import','clear']){
    const f=fixture();await f.controller.load();
    const pending=deferred();
    if(kind==='import')f.cookies.getCurrentStore=async()=>pending.promise;
    else f.cookies.clearSite=async()=>pending.promise;
    const reading=kind==='import'?f.controller.previewImport('fresh=PRIVATE'):
      f.controller.previewClear();
    if(kind==='import')f.controller.discardImport();else f.controller.discardClear();
    const message=f.controller.snapshot().message;
    pending.reject(Object.assign(Error('PRIVATE'),{code:'E_SCHEMA'}));
    assert.equal(await reading,null);
    assert.equal(f.controller.snapshot().message,message);
    f.controller.dispose();
  }
});

test('R5.20 revocation from a pending value read stops a concurrent save preflight',async()=>{
  const f=fixture();await f.controller.load();
  const id=f.controller.snapshot().rows[0].id,value=deferred(),preflight=deferred();
  f.cookies.get=async()=>value.promise;
  f.cookies.getAll=async()=>preflight.promise;
  const reading=f.controller.readValue(id);
  const saving=f.controller.save({...base,value:'DRAFT'},{originalId:id});
  value.reject(Object.assign(Error('PRIVATE'),{code:'E_GRANT_REVOKED'}));
  assert.equal(await reading,null);
  preflight.resolve([copy(base)]);
  assert.equal(await saving,false);
  assert.equal(f.calls.some(([name])=>name==='set'),false);
  assert.equal(f.controller.snapshot().target,null);
  f.controller.dispose();
});

test('R5.20 batched revocation receipts retire the epoch and cannot replay an import',async()=>{
  const f=fixture();await f.controller.load();let writes=0;
  f.cookies.setMany=async()=>{
    writes++;return {results:[{index:0,saved:false,verified:false,code:'E_GRANT_REVOKED'}]};
  };
  await f.controller.previewImport('fresh=PRIVATE');
  assert.equal(await f.controller.executeImport('fresh=PRIVATE'),false);
  assert.equal(f.controller.snapshot().target,null);
  await f.controller.load();
  assert.equal(await f.controller.executeImport('fresh=PRIVATE'),false);
  assert.equal(writes,1);
  f.controller.dispose();
});

test('R5.20 observation reports legacy gap/drop facts with metadata-only snapshots',async()=>{
  const f=fixture();await f.controller.load();
  f.cookies.observe.read=async()=>({
    events:[{name:'sid',domain:base.domain,path:'/',removed:false,
      value:'OBSERVE_SECRET',details:{value:'NESTED_SECRET'}},
      {name:'old',domain:base.domain,path:'/account',removed:true}],
    nextCursor:'2',gapCount:4,droppedCount:9,sessionRef:'PRIVATE_SESSION_REF'
  });
  await f.controller.observe('start');
  assert.equal(f.controller.snapshot().observeStats,null);
  await f.controller.observe('read');
  const snapshot=f.controller.snapshot();
  assert.deepEqual(snapshot.observeStats,{eventCount:2,gapCount:4,droppedCount:9});
  assert.equal(snapshot.message,'本次读取 2 个变化，缺口 4，缓冲丢弃 9；无 Cookie 值。');
  assert.deepEqual(snapshot.observeEvents,[
    {name:'sid',domain:base.domain,path:'/',removed:false},
    {name:'old',domain:base.domain,path:'/account',removed:true}
  ]);
  snapshot.observeStats.gapCount=999;
  assert.equal(f.controller.snapshot().observeStats.gapCount,4);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/OBSERVE_SECRET|NESTED_SECRET|PRIVATE_SESSION_REF/);
  // Incomplete receipts must not claim a confirmed zero gap or zero drops.
  f.cookies.observe.read=async()=>({events:[],nextCursor:'2'});
  await f.controller.observe('read');
  assert.deepEqual(f.controller.snapshot().observeStats,
    {eventCount:0,gapCount:null,droppedCount:null});
  assert.match(f.controller.snapshot().message,/缺口 未提供，缓冲丢弃 未提供/);
  await f.controller.observe('stop');
  assert.equal(f.controller.snapshot().observeStats,null);
  await f.controller.observe('start');await f.controller.observe('read');
  f.controller.invalidate('撤权');
  assert.equal(f.controller.snapshot().observeStats,null);
  assert.deepEqual(f.controller.snapshot().observeEvents,[]);
  f.controller.dispose();
});
