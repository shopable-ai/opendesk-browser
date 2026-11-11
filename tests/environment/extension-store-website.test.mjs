import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_STORE_WEBSITE,STORE_WEBSITE_SCHEMA,resolveStoreWebsiteConfig,navigateOfficialStore}
  from '../../src/marketplace/store-website.js';
import {handleLegacyMarketEntry} from '../../src/marketplace/legacy-market-entry.js';

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

test('old standalone bundled market entries redirect only to the approved website',()=>{
  const pages=[];
  const document={
    querySelector(selector){return selector.includes('header')||selector.includes('footer')
      ?{hidden:false}:null;},
    getElementById(id){if(id!=='market-root')return null;return {
      replaceChildren(){pages.length=0;},
      append(...nodes){pages.push(...nodes);}
    };},
    createElement(tag){return {tag,textContent:''};}
  };
  const links=[],location={pathname:'/ui/marketplace.html',search:'',replace(url){links.push(url);}};
  const website=resolveStoreWebsiteConfig(config(good));
  assert.equal(handleLegacyMarketEntry({location,document,website}),true);
  assert.deepEqual(links,[good]);
  assert.equal(pages.length,0,'a navigated public store cannot render the bundled catalog');
  const reviewLocation={...location,search:'?intent=review-uuid'};
  assert.equal(handleLegacyMarketEntry({location:reviewLocation,document,website}),false);
  assert.deepEqual(links,[good],'trusted install review remains an extension page');
  assert.equal(handleLegacyMarketEntry({location:{...location,pathname:'/ui/market-install.html'},document,website}),false);
});

test('unlaunched store refuses bundled catalog navigation, including historical local bookmarks',()=>{
  const hidden=[];
  const nodes=[];
  const root={replaceChildren(){nodes.length=0;},append(...items){nodes.push(...items);}};
  const document={
    querySelector(){const entry={hidden:false};hidden.push(entry);return entry;},
    getElementById:()=>root,
    createElement:tag=>({tag,textContent:''})
  };
  const location={pathname:'/ui/marketplace.html',search:'',replace(){throw Error('must not navigate');}};
  assert.equal(handleLegacyMarketEntry({location,document,website:resolveStoreWebsiteConfig(config(null))}),true);
  assert.deepEqual(nodes.map(node=>node.textContent),
    ['官方扩展商店尚未上线','目前还没有可访问的官方商店网址，暂不能打开在线商店。']);
  assert.ok(hidden.every(entry=>entry.hidden));
});
