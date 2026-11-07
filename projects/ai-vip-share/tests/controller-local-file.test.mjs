import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime as rawRuntime,released} from './helpers/controller-fixture.mjs';
import {createWebsiteController} from '../src/site-session.js';

const KEY='aiVipSiteSelectionR1';
const legacyPreference=()=>new Map([[KEY,{schemaVersion:1,selection:'local-chatgpt'}]]);

test('old local-file preference exposes no import UI or startup side effects in consumer or developer mode',async()=>{
  for(const options of [{developmentProfile:null},{}]){
    const e=await rawRuntime({...options,store:legacyPreference()});
    assert.equal(e.get('sites-section').hidden,true);
    assert.equal(e.get('site-select').value,'');
    for(const id of ['cookie-file','file-help','file-steps','file-summary'])assert.equal(e.get(id),undefined);
    assert.equal(e.get('cookie-install').hidden,true);
    assert.deepEqual(e.calls,[]);assert.deepEqual(e.cookieCalls,[]);
    assert.deepEqual(e.tabCalls,[]);assert.deepEqual(e.proxyCalls,[]);
    assert.equal(e.storageCalls.some(row=>row.operation==='storage.set'),false);
    assert.deepEqual(e.store.get(KEY),{schemaVersion:1,selection:'local-chatgpt'});
    if(options.developmentProfile!==null){
      await e.click('test-sites');
      assert.deepEqual(e.get('site-options').children.map(row=>row.value),['ordinary-0','ordinary-1']);
      assert.deepEqual(e.calls,[]);assert.deepEqual(e.cookieCalls,[]);
      assert.equal(e.storageCalls.some(row=>row.operation==='storage.set'),false);
    }
  }
});

test('ignored legacy preference permits ordinary selection saving; profile loss clears its credential without writes',async()=>{
  const e=await rawRuntime({store:legacyPreference()});
  await e.chooseSite('ordinary-1');
  assert.deepEqual(e.store.get(KEY),{schemaVersion:1,selection:'ordinary-1'});
  e.get('source-credential').value='Bearer disposable_removal_test';
  e.setStatus(released);await e.click('proxy-refresh');
  assert.equal(e.get('site-select').value,'');
  assert.equal(e.get('sites-section').hidden,true);
  assert.equal(e.get('source-credential').value,'');
  assert.equal(e.get('cookie-install').hidden,true);
  assert.deepEqual(e.calls,[]);assert.deepEqual(e.cookieCalls,[]);
  assert.deepEqual(e.tabCalls,[]);
});

test('sole commercial site shows pending server progress and keeps preparation when developer profile is lost',async t=>{
  const documentState={};
  const e=await rawRuntime({store:legacyPreference(),documentState});
  const previousDocument=globalThis.document;
  globalThis.document=documentState;
  t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
  const delivery={kind:'server-batch'};
  let pending=delivery;
  const controller=createWebsiteController({
    byId:id=>e.get(id.slice('ai-vip-'.length)),
    getPending:()=>pending,setPending:value=>{pending=value;},
    commercialTarget:()=> 'https://chatgpt.com/',onChange(){},
    getRestoredTarget:()=>null,
    storeRequest:async()=>({value:e.store.get(KEY),etag:'a'.repeat(64)})
  });
  await e.flush();
  const render=development=>controller.render({development,locked:false,busy:false,
    commercialLabel:'服务器账号',commercialNotice:'服务器交付 · 第 2 / 3 批，请确认'});
  render(true);
  assert.equal(e.get('site-select').value,'commercial');
  assert.equal(e.get('site-options').hidden,true);
  assert.equal(e.get('site-status').hidden,false);
  assert.equal(e.get('site-status').textContent,'服务器交付 · 第 2 / 3 批，请确认');
  render(false);
  assert.equal(e.get('site-select').value,'commercial');
  assert.equal(pending,delivery);
  assert.equal(e.get('site-status').textContent,'服务器交付 · 第 2 / 3 批，请确认');
  assert.deepEqual(e.calls,[]);assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.tabCalls,[]);
  assert.equal(e.storageCalls.some(row=>row.operation==='storage.set'),false);
  controller.dispose();
});
