import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {BUILTIN_PRESETS,validConfig,emptyVerification,checkedVerification,classifyVerification} from '../src/env-config.js';
import {readPresets,savePreset,deletePreset,readRuns,appendRun,PRESETS_KEY,RUNS_KEY} from '../src/presets.js';
import {applyEnvironment,checkedAck,classifyFailure,restoreEnvironment} from '../src/run-session.js';
const tag=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reorderKeys=value=>Array.isArray(value)?value.map(reorderKeys):
  value&&typeof value==='object'?Object.fromEntries(
    Object.keys(value).reverse().map(key=>[key,reorderKeys(value[key])])):value;
const runRow=()=>({id:'r-'+randomUUID(),at:new Date().toISOString(),kind:'restore',
  status:'restored_limited',origin:'https://qa.example.test',presetName:'美国',
  detail:'网页字段恢复，网络头未验证',source:'trusted-browser-host'});
function fakeHost({readValue=value=>value}={}){
  const store=new Map(),writes=[];let loseAck=false;
  return {setLoseAck:()=>loseAck=true,
    store,writes,request:async(name,args)=>{
      if(name==='storage.get')return {value:readValue(structuredClone(store.get(args.key)??null)),etag:tag(store.get(args.key)??null)};
      if(name==='storage.set'){
        writes.push(structuredClone(args));
        if(args.ifMatch!==tag(store.get(args.key)??null))
          throw Object.assign(Error('conflict'),{code:'E_STORAGE_CONFLICT'});
        store.set(args.key,structuredClone(args.value));
        if(loseAck)throw Error('lost ack');
        return {saved:true};
      }
      throw Object.assign(Error('unsupported '+name),{code:'E_SERVICE_UNSUPPORTED'});
    }};
}
test('R2.0 builtins and exact config validation',()=>{
  assert.deepEqual(Object.keys(BUILTIN_PRESETS),['original','us','de','jp']);
  assert.ok(validConfig(BUILTIN_PRESETS.de.config));
  assert.equal(validConfig({...BUILTIN_PRESETS.de.config,secret:'not allowed'}),false);
  assert.ok(emptyVerification(BUILTIN_PRESETS.us.config).every(x=>x.status==='unverifiable'));
});
test('presets persist with CAS readback and deletion leaves old snapshot namespace untouched',async()=>{
  const host=fakeHost();
  const saved=await savePreset(host.request,{id:null,name:'QA 德国',config:BUILTIN_PRESETS.de.config});
  assert.equal(saved.items.length,1);
  assert.equal((await readPresets(host.request)).value.items[0].name,'QA 德国');
  await savePreset(host.request,{id:saved.id,name:'QA 德国',config:BUILTIN_PRESETS.jp.config});
  assert.equal((await readPresets(host.request)).value.items.length,1);
  host.store.set('fingerprint.a.history.v1',{legacy:true});
  await deletePreset(host.request,saved.id);
  assert.equal((await readPresets(host.request)).value.items.length,0);
  assert.deepEqual(host.store.get('fingerprint.a.history.v1'),{legacy:true});
});
test('stale preset drafts cannot overwrite changes to the same saved profile',async t=>{
  for(const change of [{name:'renamed'},...Object.entries(BUILTIN_PRESETS.jp.config)
    .map(([key,value])=>({config:{...BUILTIN_PRESETS.us.config,[key]:value}}))]){
    await t.test(JSON.stringify(change),async()=>{
      const host=fakeHost();
      await savePreset(host.request,{id:null,name:'shared',config:BUILTIN_PRESETS.us.config});
      const expectedPreset=(await readPresets(host.request)).value.items[0];
      await savePreset(host.request,{...expectedPreset,...change});
      const before=structuredClone(host.store.get(PRESETS_KEY)),writes=host.writes.length;
      await assert.rejects(()=>savePreset(host.request,{...expectedPreset,
        config:{...expectedPreset.config,viewport:'mobile'},expectedPreset}),
      {code:'E_STORAGE_CONFLICT'});
      assert.equal(host.writes.length,writes,'conflicting draft must not attempt a write');
      assert.deepEqual(host.store.get(PRESETS_KEY),before);
    });
  }
});
test('a deleted preset baseline conflicts without recreating or writing the profile',async()=>{
  const host=fakeHost();
  await savePreset(host.request,{id:null,name:'shared',config:BUILTIN_PRESETS.us.config});
  const expectedPreset=(await readPresets(host.request)).value.items[0];
  await deletePreset(host.request,expectedPreset.id);
  const before=structuredClone(host.store.get(PRESETS_KEY)),writes=host.writes.length;
  await assert.rejects(()=>savePreset(host.request,{...expectedPreset,expectedPreset}),
    {code:'E_STORAGE_CONFLICT'});
  assert.equal(host.writes.length,writes);
  assert.deepEqual(host.store.get(PRESETS_KEY),before);
});
test('unchanged baseline accepts reordered keys and preserves changes to other profiles',async()=>{
  const host=fakeHost();
  await savePreset(host.request,{id:null,name:'shared',config:BUILTIN_PRESETS.us.config});
  const expectedPreset=reorderKeys((await readPresets(host.request)).value.items[0]);
  const other=await savePreset(host.request,{id:null,name:'other',config:BUILTIN_PRESETS.de.config});
  const removed=await savePreset(host.request,{id:null,name:'removed',config:BUILTIN_PRESETS.us.config});
  await savePreset(host.request,{id:other.id,name:'other edited',config:BUILTIN_PRESETS.jp.config});
  await deletePreset(host.request,removed.id);
  const updated=await savePreset(host.request,{...expectedPreset,
    config:BUILTIN_PRESETS.de.config,expectedPreset});
  assert.deepEqual(updated.items,[
    {id:expectedPreset.id,name:'shared',config:BUILTIN_PRESETS.de.config},
    {id:other.id,name:'other edited',config:BUILTIN_PRESETS.jp.config}
  ]);
});
test('omitted or undefined baseline preserves legacy update and deleted-profile behavior',async()=>{
  const host=fakeHost();
  await savePreset(host.request,{id:null,name:'shared',config:BUILTIN_PRESETS.us.config});
  const stale=(await readPresets(host.request)).value.items[0];
  await savePreset(host.request,{...stale,config:BUILTIN_PRESETS.de.config});
  const updated=await savePreset(host.request,{...stale,expectedPreset:undefined});
  assert.deepEqual(updated.items,[stale]);
  await deletePreset(host.request,stale.id);
  await assert.rejects(()=>savePreset(host.request,stale),{code:'E_PRESET_CHANGED'});
});
test('baseline validation retains CAS protection against a later concurrent write',async()=>{
  const host=fakeHost();
  await savePreset(host.request,{id:null,name:'shared',config:BUILTIN_PRESETS.us.config});
  const expectedPreset=(await readPresets(host.request)).value.items[0];
  let concurrent;
  const request=async(name,args)=>{
    if(name==='storage.set'){
      const latest=structuredClone(host.store.get(PRESETS_KEY));
      latest.items[0].name='concurrent';
      host.store.set(PRESETS_KEY,latest);concurrent=structuredClone(latest);
    }
    return host.request(name,args);
  };
  const writes=host.writes.length;
  await assert.rejects(()=>savePreset(request,{...expectedPreset,
    config:BUILTIN_PRESETS.jp.config,expectedPreset}),{code:'E_STORAGE_CONFLICT'});
  assert.equal(host.writes.length,writes+1,'CAS failure must not retry the write');
  assert.deepEqual(host.store.get(PRESETS_KEY),concurrent);
});
test('CAS rejection and write-ack loss cannot claim saved',async()=>{
  const host=fakeHost(),request=host.request;
  const before=await readPresets(request);
  await savePreset(request,{id:null,name:'first',config:BUILTIN_PRESETS.us.config});
  const stale=async(name,args)=>name==='storage.get'&&args.key===PRESETS_KEY?
    {value:(await request(name,args)).value,etag:before.etag}:request(name,args);
  await assert.rejects(()=>savePreset(stale,{id:null,name:'second',config:BUILTIN_PRESETS.jp.config}),
    {code:'E_STORAGE_CONFLICT'});
  host.setLoseAck();
  await assert.rejects(()=>savePreset(request,{id:null,name:'third',config:BUILTIN_PRESETS.jp.config}),
    {code:'E_OUTCOME_UNKNOWN'});
});
test('preset readback accepts deeply reordered object keys',async()=>{
  const host=fakeHost({readValue:reorderKeys});
  const config=BUILTIN_PRESETS.de.config;
  const saved=await savePreset(host.request,{id:null,name:'QA 德国',config});
  assert.deepEqual(saved.items,[{id:saved.id,name:'QA 德国',config}]);
  const raw=await host.request('storage.get',{key:PRESETS_KEY});
  assert.notDeepEqual(Object.keys(raw.value.items[0].config),Object.keys(config));
});
test('run readback accepts deeply reordered object keys',async()=>{
  const host=fakeHost({readValue:reorderKeys});
  const row=runRow();
  assert.deepEqual(await appendRun(host.request,row),[row]);
  const raw=await host.request('storage.get',{key:RUNS_KEY});
  assert.notDeepEqual(Object.keys(raw.value.items[0]),Object.keys(row));
});
test('reordered readback with real field differences remains unknown',async()=>{
  const host=fakeHost({readValue:value=>{
    const result=reorderKeys(value);
    if(result?.items[0]?.config)result.items[0].config.tz='Asia/Tokyo';
    if(result?.items[0]?.detail)result.items[0].detail='不同的记录';
    return result;
  }});
  await assert.rejects(()=>savePreset(host.request,
    {id:null,name:'QA 德国',config:BUILTIN_PRESETS.de.config}),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(()=>appendRun(host.request,runRow()),{code:'E_OUTCOME_UNKNOWN'});
});
test('run readback with changed array order remains unknown',async()=>{
  const host=fakeHost({readValue:value=>{
    const result=reorderKeys(value);
    result?.items.reverse();
    return result;
  }});
  await appendRun(host.request,runRow());
  await assert.rejects(()=>appendRun(host.request,runRow()),{code:'E_OUTCOME_UNKNOWN'});
});
test('run write-ack loss remains unknown without retry',async()=>{
  const host=fakeHost({readValue:reorderKeys});
  host.setLoseAck();
  const row=runRow();
  let writes=0;
  const request=(name,args)=>{
    if(name==='storage.set')writes++;
    return host.request(name,args);
  };
  await assert.rejects(()=>appendRun(request,row),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(writes,1);
  assert.deepEqual(host.store.get(RUNS_KEY).items,[row]);
});
test('real run records never include URL query or opaque identifiers',async()=>{
  const host=fakeHost();
  await appendRun(host.request,{id:'r-'+randomUUID(),at:new Date().toISOString(),kind:'apply',
    status:'blocked',origin:'https://qa.example.test',presetName:'美国',detail:'Host 不支持',source:'client-precheck'});
  assert.equal((await readRuns(host.request)).value.items[0].status,'blocked');
  assert.deepEqual(Object.keys(host.store.get(RUNS_KEY)),['schema','items']);
  await assert.rejects(()=>appendRun(host.request,{id:'r-'+randomUUID(),at:new Date().toISOString(),
    kind:'apply',status:'blocked',origin:'https://qa.example.test/path?token=secret',
    presetName:'美国',detail:'Host 不支持',source:'client-precheck'}),{code:'E_RUN_SCHEMA'});
});
test('unreviewed Host never mutates page and cannot invent a verification',async()=>{
  let called=0;
  const adapter={context:async()=>{called++;return {status:'available',url:'https://qa.example.test',
      tabRef:'1234567890abcdef',documentRef:'fedcba0987654321'};},
    request:async(name)=>({operation:name,implementation:'not_implemented',callableNow:false,
      authorization:{tool:'missing'}})};
  await assert.rejects(()=>applyEnvironment(adapter,BUILTIN_PRESETS.us.config),
    {code:'E_SERVICE_UNSUPPORTED'});
  assert.equal(called,0);
  assert.equal(classifyFailure({code:'E_SITE_GRANT_REQUIRED'},'apply'),'denied');
  assert.equal(classifyFailure({code:'E_TIMEOUT'},'apply'),'unknown');
  assert.throws(()=>checkedAck({accepted:true,source:'OFFLINE_DESIGN_FIXTURE'},{
    volatile:{documentRef:'fedcba0987654321'}}),{code:'E_OUTCOME_UNKNOWN'});
  assert.throws(()=>checkedVerification(BUILTIN_PRESETS.jp.config,
    {source:'OFFLINE_DESIGN_FIXTURE',rows:[]},{sessionRef:'s',documentRef:'d'}),
    {code:'E_UNVERIFIED_READBACK'});
  assert.equal(classifyVerification(emptyVerification(BUILTIN_PRESETS.jp.config)),'partial');
  await assert.rejects(()=>restoreEnvironment(adapter,{target:null,sessionRef:'s'}),{code:'E_SERVICE_UNSUPPORTED'});
});
