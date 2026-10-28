import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const context=vm.createContext({TextEncoder,URL,crypto:webcrypto});
vm.runInContext(await readFile(new URL('../src/app-model.js',import.meta.url),'utf8'),context);
const {createApp,DEFAULT_CONFIG}=context.ScrapyAppModel;
const plain=v=>JSON.parse(JSON.stringify(v));
const config=key=>({...plain(DEFAULT_CONFIG),itemConfig:{_listContainer:'#sample-list',_listItem:'li',[key]:'.::text'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
function store(value=null){
  let row={value,etag:'0'};const writes=[];
  const sdk={load:async()=>plain(row),save:async(value,etag)=>{
    writes.push({value:plain(value),etag});
    if(etag!==row.etag)throw Error('E_STORAGE_CONFLICT');
    row={value:plain(value),etag:String(Number(row.etag)+1)};return {saved:true};
  }};
  return {sdk,writes,get row(){return plain(row);},remote(value){row={value:plain(value),etag:String(Number(row.etag)+1)};}};
}
async function two(){const storage=store(),app=createApp(storage.sdk);await app.load();app.edit(config('a'));await app.save('A');
  const a=app.state.selectedId;await app.newProfile();app.edit(config('b'));await app.save('B');return {storage,app,a,b:app.state.selectedId};}
test('legacy single config is read without a write and becomes the first named record only on explicit save',async()=>{
  const original=config('legacy'),s=store(original),app=createApp(s.sdk);await app.load();
  assert.equal(s.writes.length,0);assert.deepEqual(plain(app.state.config),original);assert.equal(app.state.records[0].name,'默认配置');
  await app.save();assert.deepEqual(s.row.value.records[0].config,original);assert.equal(s.row.value.schemaVersion,1);
});
test('A/B are independent; selection and complete config persist across reopen; copy and rename preserve the other record',async()=>{
  const {storage,app,a,b}=await two();await app.selectProfile(a);assert.deepEqual(plain(app.state.config),config('a'));
  await app.selectProfile(b);const reopened=createApp(storage.sdk);await reopened.load();
  assert.equal(reopened.state.selectedId,b);assert.deepEqual(plain(reopened.state.config),config('b'));
  await reopened.renameProfile('B renamed');assert.equal(reopened.state.selectedId,b);
  await reopened.copyProfile('C');const c=reopened.state.selectedId;assert.notEqual(c,b);
  reopened.edit(config('c'));await reopened.save();await reopened.selectProfile(b);
  assert.deepEqual(plain(reopened.state.config),config('b'));assert.equal(reopened.state.records.find(r=>r.id===b).name,'B renamed');
  assert.deepEqual(storage.row.value.records.find(r=>r.id===a).config,config('a'));
});
test('duplicate normalized names and illegal/oversized collections fail before writing, retaining all records and draft',async()=>{
  const {storage,app}=await two();const count=storage.writes.length;
  await app.copyProfile(' a ');assert.match(app.state.error,/同名/);assert.equal(storage.writes.length,count);assert.equal(app.state.records.length,2);
  for(const name of ['', 'x'.repeat(61), 'bad\nname']){await app.renameProfile(name);assert(app.state.error);}
  assert.equal(storage.writes.length,count);
  for(let i=2;i<10;i++)await app.copyProfile('Record '+i);
  const before=storage.writes.length;await app.copyProfile('Overflow');assert.match(app.state.error,/10/);assert.equal(storage.writes.length,before);
  const s=store(),large=createApp(s.sdk);await large.load();
  // Each config is valid on its own; aggregate storage must stay within the existing SDK budget.
  const big={...config('x'),waitForSelector:'s'.repeat(3600)};
  large.edit(big);await large.save('Large');await large.copyProfile('Large2');
  const n=s.writes.length;await large.copyProfile('Large3');assert.match(large.state.error,/8192/);assert.equal(s.writes.length,n);
  assert.deepEqual(plain(large.state.config),big);
});
test('dirty switches/new/delete and remote adoption require confirmation; cancel preserves selection, draft and storage',async()=>{
  const {storage,app,a,b}=await two();app.edit(config('draft'));const count=storage.writes.length;
  for(const action of [()=>app.selectProfile(a),()=>app.newProfile(),()=>app.deleteProfile()]){
    await action();assert(app.state.pendingAction);assert.equal(app.state.selectedId,b);
    app.cancelAction();assert.deepEqual(plain(app.state.config),config('draft'));assert.equal(storage.writes.length,count);
  }
  await app.selectProfile(a);await app.confirmAction();assert.equal(app.state.selectedId,a);assert.equal(app.state.dirty,false);
  await app.deleteProfile();app.cancelAction();assert.equal(app.state.records.length,2);
  await app.deleteProfile();await app.confirmAction();assert.equal(app.state.selectedId,b);assert.equal(app.state.records.length,1);
  await app.deleteProfile();await app.confirmAction();assert.equal(app.state.selectedId,null);assert.equal(app.state.records.length,0);
  assert.deepEqual(plain(app.state.config),plain(DEFAULT_CONFIG));
});
test('CAS conflict retains the complete local draft and remote catalog without unconditional retries',async()=>{
  const {storage,app,a,b}=await two();const other=createApp(storage.sdk);await other.load();
  app.edit(config('local'));other.edit(config('remote'));await other.save();await app.save();
  assert.match(app.state.error,/CONFLICT/);assert.deepEqual(plain(app.state.config),config('local'));assert.equal(app.state.selectedId,b);
  assert.deepEqual(plain(app.state.conflict.config),config('remote'));assert.equal(app.state.conflict.catalog.records.length,2);
  const count=storage.writes.length;await app.save();await app.selectProfile(a);assert.equal(storage.writes.length,count);
  app.useSaved();assert(app.state.pendingAction);app.cancelAction();assert.deepEqual(plain(app.state.config),config('local'));
  app.useSaved();await app.confirmAction();assert.deepEqual(plain(app.state.config),config('remote'));
});
test('simultaneous actions during a save cannot replace the selection or draft, and unknown writes never retry',async()=>{
  const {storage,app,a,b}=await two();const latch=deferred(),realSave=storage.sdk.save;let writes=0;
  storage.sdk.save=async(...args)=>{writes++;await latch.promise;return realSave(...args);};
  app.edit(config('newB'));const save=app.save();await app.save();await app.selectProfile(a);await app.newProfile();await app.deleteProfile();
  assert.equal(app.state.selectedId,b);assert.equal(app.state.pendingAction,null);assert.equal(writes,1);
  assert.throws(()=>app.edit(config('late')),/保存|运行/);latch.resolve();await save;
  assert.deepEqual(storage.row.value.records.find(r=>r.id===b).config,config('newB'));
  storage.sdk.save=async()=>{writes++;throw Error('unknown receipt');};app.edit(config('keep'));await app.save();
  const count=writes;await app.save();assert.equal(writes,count);assert.deepEqual(plain(app.state.config),config('keep'));
});
test('invalid saved catalog fails closed; late initial read cannot discard a new local draft',async()=>{
  for(const value of [{schemaVersion:2,records:[]},{schemaVersion:1,selectedId:'missing',records:[]},
    {schemaVersion:1,selectedId:'x',records:[{id:'x',name:'Bad',config:{code:'bad'}}]}]){
    const s=store(value),app=createApp(s.sdk);await app.load();assert(app.state.error);assert.equal(app.state.storageReady,false);
    await app.save('No overwrite');assert.equal(s.writes.length,0);
  }
  const latch=deferred(),app=createApp({load:()=>latch.promise});const read=app.load();app.edit(config('local'));
  latch.resolve({value:config('remote'),etag:'1'});await read;assert.deepEqual(plain(app.state.config),config('local'));
  assert.deepEqual(plain(app.state.conflict.config),config('remote'));
});
test('active run locks record mutations; immutable run ownership survives name changes; switching clears old result',async()=>{
  const {storage,app,a,b}=await two();const receipt=deferred(),sent=deferred();
  Object.assign(storage.sdk,{prepare:async()=>{},currentPage:async()=>({status:'available',url:DEFAULT_CONFIG.url}),
    start:async(_c,_u,id)=>{sent.resolve(id);await receipt.promise;return {clientRequestId:id,runId:'runB'};},
    read:async id=>({clientRequestId:id,runId:'runB',retired:true,status:'completed',result:{data:[{b:'actual'}]}})});
  await app.refreshTarget();const running=app.start(DEFAULT_CONFIG.url);await sent.promise;
  const count=storage.writes.length;await app.selectProfile(a);await app.renameProfile('Wrong');await app.deleteProfile();
  assert.equal(app.state.selectedId,b);assert.equal(storage.writes.length,count);assert.equal(app.state.pendingAction,null);
  receipt.resolve();await running;assert.equal(app.state.runProfile.id,b);assert.equal(app.state.runProfile.name,'B');
  await app.renameProfile('Renamed');assert.equal(app.state.runProfile.name,'B');
  await app.selectProfile(a);assert.equal(app.state.result,null);assert.equal(app.state.runId,null);
});
test('field attributes, pagination and list-detail data survive named copies and switching without truncation',async()=>{
  const {listDetail}=await import('../examples/configs.js');const s=store(),app=createApp(s.sdk);await app.load();app.edit(listDetail);await app.save('Detail');
  const id=app.state.selectedId;await app.copyProfile('Detail copy');await app.newProfile();await app.save('Default');await app.selectProfile(id);
  assert.deepEqual(plain(app.state.config),listDetail);const reopened=createApp(s.sdk);await reopened.load();assert.deepEqual(plain(reopened.state.config),listDetail);
});
test('missing CAS token cannot become an unconditional write; late storage read cannot reset an active run',async()=>{
  for(const etag of [undefined,42,{}]){
    let writes=0;const app=createApp({load:async()=>({value:null,etag}),save:async()=>{writes++;}});
    await app.load();await app.save('No write');assert.equal(writes,0);assert.equal(app.state.storageReady,false);
  }
  const storage=deferred(),receipt=deferred(),sent=deferred();
  const app=createApp({load:()=>storage.promise,prepare:async()=>{},
    currentPage:async()=>({status:'available',url:DEFAULT_CONFIG.url}),
    start:async(_c,_u,id)=>{sent.resolve(id);await receipt.promise;return {clientRequestId:id,runId:'original'};},
    read:async id=>({clientRequestId:id,runId:'original',retired:false,status:'running'})});
  const load=app.load();await app.refreshTarget();const run=app.start(DEFAULT_CONFIG.url),id=await sent.promise;
  storage.resolve({value:config('remote'),etag:'1'});await load;
  assert.equal(app.state.clientRequestId,id);assert(app.state.conflict);assert.equal(app.state.phase,'starting');
  receipt.resolve();await run;assert.equal(app.state.runId,'original');
});
test('initial storage reply arriving after retirement preserves the completed run and its exportable snapshot',async()=>{
  const storage=deferred();
  const app=createApp({load:()=>storage.promise,prepare:async()=>{},
    currentPage:async()=>({status:'available',url:DEFAULT_CONFIG.url}),
    start:async(_c,_u,id)=>({clientRequestId:id,runId:'finished-run'}),
    read:async id=>({clientRequestId:id,runId:'finished-run',retired:true,status:'completed',result:{data:[{title:'actual'}]}})});
  const load=app.load();await app.refreshTarget();await app.start(DEFAULT_CONFIG.url);
  const snapshot=plain(app.state.snapshot);storage.resolve({value:config('remote'),etag:'1'});await load;
  assert.equal(app.state.runId,'finished-run');assert.deepEqual(plain(app.state.snapshot),snapshot);assert.equal(app.state.phase,'retired');
  assert(app.state.conflict);assert.equal(app.state.runProfile.name,'未保存配置');
});
