import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_STORE_WEBSITE,STORE_WEBSITE_SCHEMA,resolveStoreWebsiteConfig,navigateOfficialStore}
  from '../../src/marketplace/store-website.js';
import {handleLegacyMarketEntry} from '../../src/marketplace/legacy-market-entry.js';
import {BROWSER_PUBLIC_CONFIG,BROWSER_PUBLIC_CONFIG_SCHEMA,resolveBrowserPublicConfig}
  from '../../src/config/browser-config.js';

const config=url=>({schema:STORE_WEBSITE_SCHEMA,url});
const good='https://store.vendor-example.io/extensions';

test('public Browser config is the canonical navigation source, frozen and fail-closed',()=>{
  const value={schema:BROWSER_PUBLIC_CONFIG_SCHEMA,
    navigation:{...BROWSER_PUBLIC_CONFIG.navigation}};
  assert.deepEqual(BROWSER_PUBLIC_CONFIG,value);
  assert.ok(Object.isFrozen(BROWSER_PUBLIC_CONFIG));
  assert.ok(Object.isFrozen(BROWSER_PUBLIC_CONFIG.navigation));
  assert.deepEqual(resolveBrowserPublicConfig({
    ...value,navigation:{...value.navigation,extensionStore:good}
  }),{schema:BROWSER_PUBLIC_CONFIG_SCHEMA,navigation:{...value.navigation,extensionStore:good}});
  for(const invalid of [
    null,[],{}, {...value,schema:'unknown'}, {...value,privileges:{install:true}},
    {...value,navigation:{}}, {...value,navigation:{...value.navigation,extensionStore:99}},
    {...value,navigation:{...value.navigation,extensionStore:null,extra:true}}
  ])assert.equal(resolveBrowserPublicConfig(invalid),null);
});

test('developer reference config validates four HTTPS link pairs and freezes independent copies',()=>{
  const input=structuredClone(BROWSER_PUBLIC_CONFIG);
  const modes=['controller','page','react','vue'];
  input.navigation.developerReferences.react.examples='https://docs.vendor-example.io/demo?framework=react#setup';
  const resolved=resolveBrowserPublicConfig(input),references=resolved.navigation.developerReferences;
  assert.ok(Object.isFrozen(references));
  assert.deepEqual(Object.keys(references),modes);
  for(const mode of modes){
    assert.ok(Object.isFrozen(references[mode]));
    assert.notEqual(references[mode],input.navigation.developerReferences[mode]);
    assert.deepEqual(references[mode],input.navigation.developerReferences[mode]);
  }
  input.navigation.developerReferences.react.examples='https://changed.vendor-example.io/';
  assert.equal(references.react.examples,'https://docs.vendor-example.io/demo?framework=react#setup');

  const invalidReferences=[null,[],{},
    {...references,other:references.react},
    {...references,react:{examples:references.react.examples}},
    {...references,react:{...references.react,execute:true}}
  ];
  for(const developerReferences of invalidReferences)
    assert.equal(resolveBrowserPublicConfig({...input,navigation:{...input.navigation,developerReferences}}),null);
  for(const mode of modes)for(const kind of ['examples','help'])for(const url of [
    null,1,'','docs/api/controller.zh-CN.md','//docs.vendor-example.io/',
    'https:docs.vendor-example.io/','javascript:alert(1)','data:text/html,hello',
    'http://docs.vendor-example.io/','https://user:pass@docs.vendor-example.io/',
    ' https://docs.vendor-example.io/','https://docs.vendor-example.io/a b',
    'https://docs.vendor-example.io/\ncode','https://docs.vendor-example.io/\\code',
    'https://docs.vendor-example.io/'+ 'a'.repeat(2048)
  ]){
    const invalid=structuredClone(input);
    invalid.navigation.developerReferences[mode][kind]=url;
    assert.equal(resolveBrowserPublicConfig(invalid),null,mode+'.'+kind+': '+url);
  }
});

test('site navigation follows the framework URL config, including temporary HTTPS test sites',()=>{
  const configured=BROWSER_PUBLIC_CONFIG.navigation.extensionStore;
  assert.deepEqual(OFFICIAL_STORE_WEBSITE,resolveStoreWebsiteConfig(config(configured)));
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
  const reviewId='3ddf3b4c-3fc5-4bfb-9a48-29ba074bb5e3';
  const reviewLocation={...location,search:'?intent='+reviewId};
  assert.equal(handleLegacyMarketEntry({location:reviewLocation,document,website}),false);
  assert.deepEqual(links,[good],'trusted install review remains an extension page');
  for(const query of ['?intent=','?intent=review-uuid','?intent='+reviewId+'&debug=1']){
    assert.equal(handleLegacyMarketEntry({location:{...location,search:query},document,website}),true);
  }
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

test('developer guides require exact HTTPS keys and freeze independent copies',()=>{
  const input=structuredClone(BROWSER_PUBLIC_CONFIG);
  const keys=['apiIndex','typeSelection','localSidebarProject','completeProject',
    'sidebarTool','sidebarExample','runtime','dependencies'];
  assert.deepEqual(Object.keys(input.navigation.developerGuides),keys);
  const resolved=resolveBrowserPublicConfig(input);
  assert.ok(Object.isFrozen(resolved.navigation.developerGuides));
  assert.notEqual(resolved.navigation.developerGuides,input.navigation.developerGuides);
  input.navigation.developerGuides.apiIndex='https://changed.vendor-example.io/';
  assert.notEqual(resolved.navigation.developerGuides.apiIndex,input.navigation.developerGuides.apiIndex);
  for(const guides of [null,[],{}, {...input.navigation.developerGuides,extra:'https://docs.vendor-example.io/'}])
    assert.equal(resolveBrowserPublicConfig({...input,navigation:{...input.navigation,developerGuides:guides}}),null);
  for(const key of keys)for(const url of [null,99,'','docs/api/README.md','http://unsafe.test/',
    'javascript:alert(1)','https://user:pass@docs.test/','https://docs.test/a b','https://docs.test/\ncode',
    'https://docs.test/\\code','https://docs.test/'+'a'.repeat(2048)]){
    const invalid=structuredClone(input);
    invalid.navigation.developerGuides[key]=url;
    assert.equal(resolveBrowserPublicConfig(invalid),null,key);
  }
  for(const key of keys){
    const missing=structuredClone(input);
    delete missing.navigation.developerGuides[key];
    assert.equal(resolveBrowserPublicConfig(missing),null,key);
  }
});
