import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteContentRegistration} from '../../src/page-events/content-script-registration.js';

const profile=(changes={})=>({id:'site-a',version:'1.0.0',origin:'https://a.test',
  adapter:'generic',adapterVersion:'1.0.0',protocols:['webflow.task.intent.v1'],enabled:true,...changes});
function chromeMock(){
  const scripts=new Map(),grants=new Set(),calls=[];
  const api={permissions:{async contains(value){
    calls.push(['contains',value]);
    return grants.has(value.origins[0]);
  },request(){assert.fail('must never request permission');}},scripting:{
    async getRegisteredContentScripts(){calls.push(['get']);return structuredClone([...scripts.values()]);},
    async unregisterContentScripts({ids}){
      calls.push(['unregister',ids]);
      for(const id of ids)scripts.delete(id);
    },
    async registerContentScripts(entries){
      calls.push(['register',entries]);
      for(const entry of entries){
        assert.ok(!scripts.has(entry.id),'duplicate registration');
        scripts.set(entry.id,structuredClone(entry));
      }
    },
  }};
  return {api,scripts,grants,calls};
}
const create=(mock,profiles,extra={})=>createSiteContentRegistration({api:mock.api,profiles,
  adapterIds:['generic','chatgpt'],protocolIds:['webflow.task.intent.v1'],...extra});

test('only reviewed, enabled, permitted exact origins share the fixed generic script',async()=>{
  const mock=chromeMock();
  const profiles=[profile(),profile({id:'site-b',origin:'http://b.test:8080'}),
    profile({id:'denied',origin:'https://denied.test'}),
    profile({id:'disabled',origin:'https://disabled.test',enabled:false}),
    profile({id:'chatgpt',origin:'https://chatgpt.com',adapter:'chatgpt'})];
  for(const p of profiles)if(p.id!=='denied')mock.grants.add(p.origin.replace(':8080','')+'/*');
  const registration=create(mock,profiles);
  const changes=await registration.reconcile();
  assert.equal(changes.length,2);
  for(const [index,entry] of [...mock.scripts.values()].entries()){
    assert.match(entry.id,/^opendesk-web-task-/);
    assert.deepEqual(entry,{id:entry.id,matches:[profiles[index].origin.replace(':8080','')+'/*'],
      js:['agents/web-task-content.js'],allFrames:false,world:'ISOLATED',
      runAt:'document_idle',persistAcrossSessions:true});
    assert.deepEqual(changes[index],{type:'register',id:entry.id});
  }
  assert.deepEqual(mock.calls.filter(([kind])=>kind==='contains').map(([,value])=>value),
    ['https://a.test/*','http://b.test/*','https://denied.test/*'].map(origin=>({origins:[origin]})));
  assert.deepEqual(await registration.reconcile(),[]);
});

test('revocation, disabling and deletion remove only owned registrations',async()=>{
  for(const action of ['revoke','disable','delete']){
    const mock=chromeMock();let profiles=[profile()];
    const foreign={id:'another-owner',matches:['https://other.test/*'],js:['other.js']};
    mock.scripts.set(foreign.id,foreign);mock.grants.add('https://a.test/*');
    const registration=create(mock,async()=>profiles);
    await registration.reconcile();
    const id=[...mock.scripts.keys()].find(id=>id!==foreign.id);
    if(action==='revoke')mock.grants.clear();
    if(action==='disable')profiles=[profile({enabled:false})];
    if(action==='delete')profiles=[];
    assert.deepEqual(await registration.reconcile(),[{type:'unregister',id}]);
    assert.deepEqual([...mock.scripts.values()],[foreign]);
  }
});

test('profile and adapter upgrades replace old identity before registration, including after restart',async()=>{
  for(const change of [{version:'2.0.0'},{adapterVersion:'2.0.0'},
    {origin:'https://new.test'},{protocols:['another.v1']}]){
    const mock=chromeMock();mock.grants.add('https://a.test/*');mock.grants.add('https://new.test/*');
    await create(mock,[profile()]).reconcile();
    const oldId=[...mock.scripts.keys()][0];mock.calls.length=0;
    const changes=await create(mock,[profile(change)],{protocolIds:['webflow.task.intent.v1','another.v1']}).reconcile();
    const newId=[...mock.scripts.keys()][0];assert.notEqual(newId,oldId);
    assert.deepEqual(changes,[{type:'unregister',id:oldId},{type:'register',id:newId}]);
    assert.deepEqual(mock.calls.filter(([kind])=>['unregister','register'].includes(kind)).map(([kind])=>kind),['unregister','register']);
  }
});

test('invalid configurations fail through registry before any Chrome operations',async()=>{
  for(const profiles of [[profile({origin:'https://*.test'})],[profile({origin:'https://a.test/path'})],
    [profile({origin:'file:///tmp'})],[profile({adapter:'unknown'})],
    [profile({protocols:['unknown']})],[profile({js:['evil.js']})],
    [profile(),profile({id:'duplicate-origin'})]]){
    const mock=chromeMock();
    await assert.rejects(async()=>create(mock,profiles).reconcile(),{code:'E_SITE_PROFILE'});
    assert.deepEqual(mock.calls,[]);
  }
});

test('concurrent reconciliation is serialized and does not duplicate registration',async()=>{
  const mock=chromeMock();mock.grants.add('https://a.test/*');
  let active=0,maxActive=0;
  const registration=create(mock,async()=>{
    active++;maxActive=Math.max(active,maxActive);
    await new Promise(resolve=>setImmediate(resolve));active--;return [profile()];
  });
  const results=await Promise.all(Array.from({length:8},()=>registration.reconcile()));
  assert.equal(maxActive,1);assert.equal(results.flat().length,1);
  assert.equal(mock.scripts.size,1);
  assert.equal(mock.calls.filter(([kind])=>kind==='register').length,1);
});

test('Chrome failures propagate and a rejected reconciliation does not poison the queue',async()=>{
  for(const [group,method] of [['permissions','contains'],['scripting','getRegisteredContentScripts'],
    ['scripting','registerContentScripts'],['scripting','unregisterContentScripts']]){
    const mock=chromeMock();mock.grants.add('https://a.test/*');let profiles=[profile()];
    const registration=create(mock,()=>profiles);
    if(method==='unregisterContentScripts'){await registration.reconcile();profiles=[];}
    const original=mock.api[group][method],failure=new Error(method);
    mock.api[group][method]=async()=>{throw failure;};
    await assert.rejects(registration.reconcile(),error=>error===failure);
    mock.api[group][method]=original;
    await registration.reconcile();assert.equal(mock.scripts.size,profiles.length);
  }
});

test('restart is idempotent; changing the fixed packaged script replaces the registration',async()=>{
  const mock=chromeMock();mock.grants.add('https://a.test/*');
  await create(mock,[profile()]).reconcile();
  const oldId=[...mock.scripts.keys()][0];
  assert.deepEqual(await create(mock,[profile()]).reconcile(),[]);
  const changes=await create(mock,[profile()],{scriptPath:'agents/reviewed-content.js'}).reconcile();
  const entry=[...mock.scripts.values()][0];
  assert.notEqual(entry.id,oldId);
  assert.deepEqual(entry.js,['agents/reviewed-content.js']);
  assert.deepEqual(changes,[{type:'unregister',id:oldId},{type:'register',id:entry.id}]);
  for(const scriptPath of ['https://evil.test/code.js','../evil.js','javascript:alert(1)', ['evil.js']])
    assert.throws(()=>create(mock,[profile()],{scriptPath}),TypeError);
});

test('owned registrations with changed execution settings are removed before restoring ISOLATED top-frame defaults',async()=>{
  const mock=chromeMock();mock.grants.add('https://a.test/*');
  const registration=create(mock,[profile()]);await registration.reconcile();
  const entry=[...mock.scripts.values()][0];
  entry.world='MAIN';entry.allFrames=true;
  assert.deepEqual(await registration.reconcile(),[
    {type:'unregister',id:entry.id},{type:'register',id:entry.id}]);
  assert.equal(mock.scripts.get(entry.id).world,'ISOLATED');
  assert.equal(mock.scripts.get(entry.id).allFrames,false);
});
