import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/app-model.js';

const {createApp} = globalThis.ScrapyAppModel;
const page = {status:'available',url:'https://example.com/',title:'Page'};
const clone = value => structuredClone(value);
function fixture(overrides = {}, onChange = () => {}) {
  let value = null, etag = 'v0';
  const calls = [];
  const sdk = {currentPage:async()=>page, load:async()=>({value:clone(value),etag}),
    save:async(next,expected)=>{calls.push({next:clone(next),expected}); assert.equal(expected,etag);value=clone(next);etag+='1';return {saved:true};},
    prepare:async()=>{},start:async(_c,_u,id)=>({clientRequestId:id,runId:'run',status:'running'}),
    read:async id=>({clientRequestId:id,runId:'run',resultId:'result',status:'completed',retired:true,result:{engine:{status:'completed'},data:[{title:'one',detail:1},{title:'two',derived:2}]}}),
    stop:async id=>{calls.push({stop:id});return {clientRequestId:id,runId:'run',accepted:true};},
    download:async(snapshot,format,output)=>{calls.push({snapshot,format,output});return {started:true};},...overrides};
  const app=createApp(sdk,onChange);app.state.config=clone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);
  return {app,sdk,calls};
}
const csv = label => [{kind:'csv.configure',fieldNames:{title:label},fieldOrder:['title']}];
const rejected = code => error => error.code === code;

test('model exposes an instance-bound monotonic revision, including manual ABA and dirty edits', () => {
  const {app} = fixture();
  assert.equal(typeof app.configIdentity,'function');
  const initial = app.configIdentity(), config = clone(app.state.config);
  app.edit({...config,maxPages:2});app.edit(config);
  assert.ok(app.configIdentity().configRevision > initial.configRevision);
  assert.equal(app.configIdentity().profileEpoch,initial.profileEpoch);
  assert.throws(()=>app.applyConfiguration(initial,{...config,maxPages:3}),rejected('STALE_STATE'));
  const other = fixture().app;
  assert.throws(()=>other.applyConfiguration(app.configIdentity(),config),rejected('STALE_STATE'));
  const before = app.configIdentity().configRevision;app.touch();
  assert.ok(app.configIdentity().configRevision > before);
});

for (const dirty of [false,true]) test(`transaction undo restores config and original dirty=${dirty}, with a newer revision`, async () => {
  const {app} = fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);
  if(dirty)app.touch();
  const config = clone(app.state.config), identity = app.configIdentity();
  const applied = app.applyConfiguration(identity,{...config,maxPages:2});
  assert.equal(applied.status,'applied');assert.equal(app.state.dirty,true);
  assert.ok(applied.identity.configRevision > identity.configRevision);
  const undone = app.undoConfiguration(applied.undoId);
  assert.equal(undone.status,'undone');assert.deepEqual(app.state.config,config);assert.equal(app.state.dirty,dirty);
  assert.ok(undone.identity.configRevision > applied.identity.configRevision);
  assert.throws(()=>app.undoConfiguration(applied.undoId),rejected('NO_UNDO'));
});

test('invalid transactions, later edits, profile changes, run locks and disposal cannot overwrite current state', async () => {
  const {app} = fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);
  const before = clone(app.state);
  assert.throws(()=>app.applyConfiguration(app.configIdentity(),{...app.state.config,maxPages:100}),rejected('INVALID_INPUT'));
  assert.deepEqual(app.state,before);
  let receipt = app.applyConfiguration(app.configIdentity(),{...app.state.config,maxPages:2});
  app.touch();assert.throws(()=>app.undoConfiguration(receipt.undoId),rejected('STALE_STATE'));
  receipt = app.applyConfiguration(app.configIdentity(),{...app.state.config,maxPages:3});
  app.state.phase='starting';assert.throws(()=>app.undoConfiguration(receipt.undoId),rejected('LOCKED'));
  app.state.phase='idle';await app.newProfile();await app.confirmAction();
  assert.throws(()=>app.undoConfiguration(receipt.undoId),rejected('STALE_STATE'));
  app.dispose();assert.throws(()=>app.applyConfiguration(app.configIdentity(),app.state.config),rejected('DISPOSED'));
});

// Dynamic import leaves the model contract tests readable even before the facade exists.
const apiFor = async (app, options) => (await import('../src/business-api.js')).createBusinessApi(app,options);
test('a batch applies once to the existing model; invalid batches never partially apply',async()=>{
  let emits=0;const {app}=fixture({},()=>emits++);await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);
  const api=await apiFor(app),state=api.state.read();
  const before=clone(app.state),count=emits;
  assert.throws(()=>api.config.propose({identity:state.identity,actions:[...csv('书名'),{kind:'pagination.configure',maxPages:100}]}),rejected('INVALID_INPUT'));
  assert.deepEqual(app.state,before);assert.equal(emits,count);
  const proposal=api.config.propose({identity:state.identity,actions:[...csv('书名'),{kind:'field.upsert',key:'price',rule:'.price::text'}]});
  proposal.config.itemConfig.title='tampered';
  const applied=api.config.apply({proposalId:proposal.proposalId});
  assert.equal(emits,count+1);assert.equal(app.state.config.itemConfig.title,before.config.itemConfig.title);
  assert.equal(app.state.config.output.fieldNames.title,'书名');assert.equal(app.state.config.itemConfig.price,'.price::text');
  assert.equal(api.config.undo({undoId:applied.undoId}).status,'undone');assert.deepEqual(app.state.config,before.config);
  assert.throws(()=>api.config.apply({proposalId:proposal.proposalId}),rejected('REPLAYED'));
});

test('stale proposals reject ABA, instance changes and unfinished UI input without changing the draft',async()=>{
  const {app}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);let blocked=false;
  const api=await apiFor(app,{isBlocked:()=>blocked}),identity=api.state.read().identity;
  const old=api.config.propose({identity,actions:csv('A')}),original=clone(app.state.config);
  app.edit({...original,maxPages:2});app.edit(original);
  assert.throws(()=>api.config.apply({proposalId:old.proposalId}),rejected('STALE_STATE'));
  assert.throws(()=>api.config.propose({identity,actions:csv('A')}),rejected('STALE_STATE'));
  const p=api.config.propose({identity:api.state.read().identity,actions:csv('B')});blocked=true;
  assert.throws(()=>api.config.apply({proposalId:p.proposalId}),rejected('LOCKED'));
  assert.deepEqual(app.state.config,original);
  const state=api.state.read();state.config.itemConfig.title='external';assert.notEqual(app.state.config.itemConfig.title,'external');
});

test('the existing Chat full-config reply applies and undoes through the same facade and original model',async()=>{
  const {app}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);const api=await apiFor(app);
  const before=api.state.read(),config={...before.config,output:{fieldNames:{title:'书名'},fieldOrder:['title']}};
  const proposal=api.config.propose({identity:before.identity,config});
  config.output.fieldNames.title='caller mutation';
  assert.deepEqual(app.state.config,before.config,'propose does not write to the original model');
  const applied=api.config.apply({proposalId:proposal.proposalId});
  assert.equal(app.state.config.output.fieldNames.title,'书名');assert.equal(app.state.dirty,true);
  api.config.undo({undoId:applied.undoId});assert.deepEqual(app.state.config,before.config);assert.equal(app.state.dirty,before.dirty);
  assert.throws(()=>api.config.propose({identity:before.identity,config:before.config}),rejected('STALE_STATE'));
});

test('full-config facade proposals reject ambiguous, invalid and redirected replies atomically',async()=>{
  const {app}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);const api=await apiFor(app),before=api.state.read();
  for(const args of [
    {config:before.config,actions:csv('A')},
    {config:{...before.config,maxPages:100}},
    {config:{...before.config,url:'https://other.example/'}},
    {config:null},{}
  ]){
    assert.throws(()=>api.config.propose({identity:before.identity,...args}),rejected('INVALID_INPUT'));
    assert.deepEqual(api.state.read(),before);
  }
});

test('saveCopy uses the original CAS catalog, preserves the source and auto-names without a prompt',async()=>{
  const {app,calls}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);await app.save('Original');
  const original=clone(app.state.records[0]);const api=await apiFor(app);
  const p=api.config.propose({identity:api.state.read().identity,actions:csv('新标题')});const applied=api.config.apply({proposalId:p.proposalId});
  const saved=await api.config.saveCopy({identity:applied.identity});
  assert.equal(saved.status,'saved');assert.notEqual(saved.profileId,original.id);assert.equal(app.state.dirty,false);
  assert.deepEqual(app.state.records.find(r=>r.id===original.id),original);
  assert.equal(app.state.records.length,2);assert.equal(calls.length,2);assert.equal(calls[1].expected,'v01');
  assert.throws(()=>api.config.undo({undoId:applied.undoId}),rejected('NO_UNDO'));
});

for (const code of ['E_CONFLICT','E_OUTCOME_UNKNOWN']) test(`saveCopy ${code} preserves the draft and never retries the write`,async()=>{
  const {app,sdk}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,maxPages:2});
  let writes=0;sdk.save=async()=>{writes++;throw Object.assign(Error(code),{code});};
  const api=await apiFor(app),before=clone(app.state.config);
  const result=await api.config.saveCopy({identity:api.state.read().identity});
  assert.equal(result.status,code==='E_CONFLICT'?'conflict':'unknown');assert.equal(writes,1);
  assert.deepEqual(app.state.config,before);assert.equal(app.state.dirty,true);
  await assert.rejects(api.config.saveCopy({identity:api.state.read().identity}),rejected('LOCKED'));
  assert.equal(writes,1);
});

test('raw export has no output; custom export completes actual columns and freezes current settings separately from run settings',async()=>{
  const {app,calls}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,url:page.url,output:{fieldNames:{title:'Run'},fieldOrder:['title']}});
  await app.refreshTarget();await app.start(page.url);const api=await apiFor(app);
  let p=api.config.propose({identity:api.state.read().identity,actions:csv('Current')});api.config.apply({proposalId:p.proposalId});
  const frozen=api.results.prepareExport({format:'csv',mode:'custom'});
  p=api.config.propose({identity:api.state.read().identity,actions:csv('Later')});api.config.apply({proposalId:p.proposalId});
  assert.equal((await api.results.export({exportId:frozen.exportId})).status,'accepted');
  assert.deepEqual(calls.at(-1).output,{fieldNames:{title:'Current'},fieldOrder:['title','detail','derived']});
  await api.results.export({format:'csv'});assert.equal(calls.at(-1).output,undefined);
  const fromRun=await api.results.export({format:'csv',mode:'custom',settingsSource:'run'});
  assert.equal(calls.at(-1).output.fieldNames.title,'Run');assert.equal(fromRun.settingsRevision,null,'run-time config revision was not recorded by the original runner');
  await assert.rejects(api.results.export({exportId:frozen.exportId}),rejected('REPLAYED'));
});

test('stop follows only the original run handle even when the page/config changes; stale result exports cannot dispatch',async()=>{
  const {app,calls}=fixture({read:async id=>({clientRequestId:id,runId:'run',status:'running',retired:false,result:{data:[{title:'one'}]}})});
  app.edit({...app.state.config,url:page.url});await app.refreshTarget();await app.start(page.url);
  const api=await apiFor(app),handle=api.state.read().run;
  const prepared=api.results.prepareExport({format:'csv'});
  app.state.target={url:'https://other.example/'};
  assert.equal((await api.capture.stop({run:handle})).status,'accepted');assert.equal(calls.at(-1).stop,handle.clientRequestId);
  app.state.snapshot={...app.state.snapshot};
  await assert.rejects(api.results.export({exportId:prepared.exportId}),rejected('STALE_STATE'));
  assert.equal(calls.some(c=>c.format),false);
});

test('saving failures, capacity and normalized names keep the existing draft and never write a partial catalog',async()=>{
  const {app,calls}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);await app.save('配置');
  const api=await apiFor(app);
  assert.equal((await api.config.saveCopy({identity:api.state.read().identity,name:' 配置 '})).code,'INVALID_INPUT');
  assert.equal(calls.length,1);assert.equal(app.state.records.length,1);
  const first=await api.config.saveCopy({identity:api.state.read().identity});
  assert.equal(first.name,'配置 副本');
  await app.selectProfile(app.state.records[0].id);
  const next=await api.config.saveCopy({identity:api.state.read().identity});
  assert.equal(next.name,'配置 副本 2');
  const before=calls.length;
  app.edit({...app.state.config,itemConfig:{title:'中'.repeat(1000)}});
  const large=await api.config.saveCopy({identity:api.state.read().identity});
  // Each profile is legal; repeated large copies eventually hit the catalog budget.
  assert.equal(large.status,'saved');
  const refused=await api.config.saveCopy({identity:api.state.read().identity});
  assert.equal(refused.status,'saved');
  const overflow=await api.config.saveCopy({identity:api.state.read().identity});
  assert.equal(overflow.code,'INVALID_INPUT');assert.equal(calls.length,before+2);
});

test('a run invalidates undo even after retirement, and a new instance cannot use the old undo token',async()=>{
  const {app}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,url:page.url});
  const api=await apiFor(app),p=api.config.propose({identity:api.state.read().identity,actions:csv('Title')});
  const applied=api.config.apply({proposalId:p.proposalId});await app.refreshTarget();
  assert.equal((await api.capture.start({identity:applied.identity})).status,'accepted');assert.equal(app.state.retired,true);
  assert.throws(()=>api.config.undo({undoId:applied.undoId}),rejected('STALE_STATE'));
  const other=await apiFor(fixture().app);assert.throws(()=>other.config.undo({undoId:applied.undoId}),rejected('NO_UNDO'));
});

for (const rejectedSave of [false,true]) test(`disposal prevents a late ${rejectedSave?'failed':'successful'} save from changing the local model`,async()=>{
  let release;const gate=new Promise((resolve,reject)=>{release=rejectedSave?reject:resolve;});
  const {app,sdk}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,maxPages:2});
  const api=await apiFor(app);sdk.save=()=>gate;
  const saving=api.config.saveCopy({identity:api.state.read().identity});app.dispose();const before=clone(app.state);
  release(rejectedSave?Error('late failure'):{saved:true});
  assert.equal((await saving).status,'blocked');assert.deepEqual(app.state,before);
  assert.throws(()=>api.config.propose({identity:before,actions:csv('late')}),rejected('DISPOSED'));
});

test('a failed download consumes its frozen command; locks and disposed facades never replay it',async()=>{
  const {app,calls}=fixture({download:async()=>({})});await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,url:page.url});
  await app.refreshTarget();await app.start(page.url);const api=await apiFor(app);
  const prepared=api.results.prepareExport({format:'csv'});
  assert.equal((await api.results.export({exportId:prepared.exportId})).status,'unknown');
  await assert.rejects(api.results.export({exportId:prepared.exportId}),rejected('REPLAYED'));
  api.dispose();assert.throws(()=>api.results.prepareExport({format:'csv'}),rejected('DISPOSED'));
  assert.equal(calls.some(c=>c.next),false);
});

test('known access revocation blocks cached result reads and exports without a download request',async()=>{
  const {app,calls}=fixture();await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,url:page.url});
  await app.refreshTarget();await app.start(page.url);const api=await apiFor(app);
  const prepared=api.results.prepareExport({format:'csv'});
  app.state.targetError={code:'E_PERMISSION_DENIED',message:'revoked'};
  assert.throws(()=>api.results.read(),rejected('PERMISSION_DENIED'));
  await assert.rejects(api.results.export({exportId:prepared.exportId}),rejected('PERMISSION_DENIED'));
  assert.equal(calls.some(c=>c.format),false);
  app.state.targetError=null;
  assert.throws(()=>api.results.prepareExport({format:'csv'}),rejected('PERMISSION_DENIED'),'restoring access cannot revive the revoked cached run');
});

test('an SDK download permission rejection retires the cached result across facade recreation',async()=>{
  let downloads=0;
  const {app}=fixture({download:async()=>{downloads++;throw Object.assign(Error('download permission revoked'),{code:'E_PERMISSION_DENIED'});}});
  await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,url:page.url});await app.refreshTarget();await app.start(page.url);
  const api=await apiFor(app),receipt=await api.results.export({format:'csv'});
  assert.equal(receipt.errorCode,'E_PERMISSION_DENIED');
  app.state.error='';api.dispose();
  const reopened=await apiFor(app);
  assert.throws(()=>reopened.results.read(),rejected('PERMISSION_DENIED'));
  await assert.rejects(reopened.results.export({format:'json'}),rejected('PERMISSION_DENIED'));
  assert.equal(downloads,1,'restoring access or recreating a facade never replays the revoked result');
});

test('a late denied download cannot invalidate a successor run or its prepared export',async()=>{
  let deny;const gate=new Promise((_,reject)=>{deny=reject;});
  const {app,sdk}=fixture({download:()=>gate});await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,url:page.url});
  await app.refreshTarget();await app.start(page.url);const api=await apiFor(app),original=api.state.read().run;
  const downloading=api.results.export({format:'csv'});
  await app.start(page.url);const next=api.results.prepareExport({format:'json'});
  deny(Object.assign(Error('old download revoked'),{code:'E_PERMISSION_DENIED'}));
  const old=await downloading;assert.equal(old.clientRequestId,original.clientRequestId);assert.equal(old.stale,true);
  sdk.download=async()=>({started:true});
  const result=await api.results.export({exportId:next.exportId});
  assert.equal(result.status,'accepted');assert.equal(result.clientRequestId,app.state.clientRequestId);
});

test('out-of-order download denials keep the current revoked run fenced',async()=>{
  let denyOld;const oldGate=new Promise((_,reject)=>{denyOld=reject;});
  const {app,sdk}=fixture({download:()=>oldGate});await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,url:page.url});
  await app.refreshTarget();await app.start(page.url);const api=await apiFor(app),old=api.results.export({format:'csv'});
  await app.start(page.url);sdk.download=async()=>{throw Object.assign(Error('new run revoked'),{code:'E_PERMISSION_DENIED'});};
  await api.results.export({format:'csv'});
  denyOld(Object.assign(Error('old run revoked'),{code:'E_PERMISSION_DENIED'}));await old;
  app.state.error='';
  assert.throws(()=>api.results.read(),rejected('PERMISSION_DENIED'),'late denial must not erase the successor denial');
});

test('configuration stays locked while a successor is preparing even if an old Stop response arrives',async()=>{
  let releaseStop,releasePrepare;
  const stopGate=new Promise(resolve=>{releaseStop=resolve;}),prepareGate=new Promise(resolve=>{releasePrepare=resolve;});
  const {app,sdk}=fixture({stop:()=>stopGate,read:async id=>({clientRequestId:id,runId:'run',status:'running',retired:false})});
  app.edit({...app.state.config,url:page.url});await app.refreshTarget();await app.start(page.url);
  const oldId=app.state.clientRequestId,stopping=app.stop();
  sdk.read=async id=>({clientRequestId:id,runId:'run',status:'completed',retired:true});await app.refresh();
  sdk.prepare=()=>prepareGate;const successor=app.start(page.url);
  releaseStop({clientRequestId:oldId,runId:'run',accepted:true,retired:true});await stopping;
  const api=await apiFor(app);
  try {assert.throws(()=>api.config.propose({identity:api.state.read().identity,actions:csv('late')}),rejected('LOCKED'));}
  finally {releasePrepare();await successor;}
});

for(const fail of [false,true])test(`late export ${fail?'failure':'success'} retains the exported run identity and the successor error`,async()=>{
  let release;const gate=new Promise((resolve,reject)=>{release=fail?reject:resolve;});
  const {app,sdk}=fixture({download:()=>gate});await app.load();if(!app.state.config.url)app.state.config=structuredClone(globalThis.ScrapyAppModel.DEFAULT_CONFIG);app.edit({...app.state.config,url:page.url});
  await app.refreshTarget();await app.start(page.url);const api=await apiFor(app),original=api.state.read().run;
  const pending=api.results.export({format:'csv'});
  sdk.read=async()=>{throw Error('successor read failed');};await app.start(page.url);
  const before=clone(app.state);assert.notEqual(before.clientRequestId,original.clientRequestId);
  release(fail?Error('old download failed'):{started:true});const receipt=await pending;
  assert.equal(receipt.clientRequestId,original.clientRequestId);assert.equal(receipt.runId,original.runId);
  assert.equal(receipt.status,fail?'unknown':'accepted');assert.deepEqual(app.state,before);
});
