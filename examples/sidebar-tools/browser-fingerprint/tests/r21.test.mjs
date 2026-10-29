import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {BUILTIN_PRESETS,validConfig,emptyVerification,checkedVerification,classifyVerification} from '../src/env-config.js';
import {readPresets,savePreset,deletePreset,readRuns,appendRun,PRESETS_KEY,RUNS_KEY} from '../src/presets.js';
import {applyEnvironment,checkedAck,classifyFailure,restoreEnvironment} from '../src/run-session.js';
const tag=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fakeHost(){
  const store=new Map();let loseAck=false;
  return {setLoseAck:()=>loseAck=true,
    store,request:async(name,args)=>{
      if(name==='storage.get')return {value:structuredClone(store.get(args.key)??null),etag:tag(store.get(args.key)??null)};
      if(name==='storage.set'){
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
