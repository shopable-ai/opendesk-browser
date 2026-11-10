import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_STORE_WEBSITE,STORE_WEBSITE_SCHEMA,resolveStoreWebsiteConfig,navigateOfficialStore}
  from '../../src/marketplace/store-website.js';

const config=url=>({schema:STORE_WEBSITE_SCHEMA,url});
const good='https://store.vendor-example.io/extensions';

test('website URL is intentionally unconfigured until official launch',()=>{
  assert.ok(['ready','coming_soon'].includes(OFFICIAL_STORE_WEBSITE.status));
  assert.notEqual(OFFICIAL_STORE_WEBSITE.status,'invalid');
  assert.deepEqual(resolveStoreWebsiteConfig(config(null)),{status:'coming_soon',url:null});
});

test('online store navigation accepts only a reviewed public HTTPS page and no extra config fields',()=>{
  assert.deepEqual(resolveStoreWebsiteConfig(config(good)),{status:'ready',url:good});
  for(const url of [
    '',123,'javascript:alert(1)','data:text/html,hello','http://store.vendor-example.io/extensions',
    'https://example.com/','https://store.example.com/','https://127.0.0.1/',
    'https://localhost/','https://store.invalid/','https://store.local/',
    'https://store.vendor-example.io:4444/','https://user:pass@store.vendor-example.io/',
    'https://store.vendor-example.io/?next=https://other.test/',
    'https://store.vendor-example.io/#section',' https://store.vendor-example.io/'
  ])assert.equal(resolveStoreWebsiteConfig(config(url)).status,'invalid',String(url));
  assert.equal(resolveStoreWebsiteConfig({...config(good),extra:true}).status,'invalid');
  assert.equal(resolveStoreWebsiteConfig({url:good}).status,'invalid');
});

test('only configured online store opens a tab, and errors do not retry or use internal marketplace',async()=>{
  const calls=[],api={tabs:{async create(options){calls.push(options);return {id:8};}}};
  assert.deepEqual(await navigateOfficialStore(api,config(null)),{status:'coming_soon',url:null});
  assert.equal((await navigateOfficialStore(api,config('http://unsafe.test/'))).status,'invalid');
  assert.deepEqual(calls,[]);
  assert.deepEqual(await navigateOfficialStore(api,config(good)),{status:'tab_created',url:good});
  assert.deepEqual(calls,[{url:good,active:true}]);
  const broken={tabs:{create(){throw Error('tab could not be created');}}};
  const result=await navigateOfficialStore(broken,config(good));
  assert.equal(result.status,'failed');
  assert.match(result.error.message,/could not be created/);
});
