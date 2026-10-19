import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('preview mounts the actual App and delegates all Cookie business',async()=>{
  const source=await read('./src/App.jsx');
  assert.match(source,/import CookieEditorApp from ['"]\.\.\/\.\.\/\.\.\/app\/CookieEditorApp\.jsx/);
  assert.match(source,/<CookieEditorApp\b/);
  assert.doesNotMatch(source,/function (?:Editor|ImportPanel|ExportPanel)|normalizeCookie|inspectImport|const (?:isDirty|identity|comparable|toDraft)=/);
});

test('preview uses the fixed React and Shared UI runtime without bundling another copy',async()=>{
  const [vite,build]=await Promise.all([read('./vite.config.mjs'),read('./build-preview.mjs')]);
  assert.match(vite,/external:\s*\[/);
  assert.match(vite,/OpenDeskPageReact/);
  assert.match(vite,/OpenDeskSidebarUI/);
  assert.match(build,/react-19\.2\.0\.js/);
  assert.match(build,/sidebar-shared-ui\.js/);
  assert.match(build,/dist\/development\/sidebar-shared-ui\.js/);
  assert.doesNotMatch(build,/dist\/production/);
  assert.match(build,/connect-src 'none'/);
});

test('fictional transport has no real Cookie, permission, network or persistence path',async()=>{
  const [preview,mock]=await Promise.all([read('./src/App.jsx'),read('./src/mock-sdk.js')]);
  for(const source of [preview,mock])assert.doesNotMatch(source,/chrome\.|document\.cookie|localStorage|sessionStorage|\bfetch\s*\(|XMLHttpRequest/);
  assert.match(preview,/E_PREVIEW_REAL_SDK_PRESENT/);
  assert.match(mock,/import \{key,sameNativeSlot\} from '\.\.\/\.\.\/\.\.\/app\/domain\/cookie-model\.js'/);
});

const {createMockSdk,fictionalCookies}=await import('./src/mock-sdk.js');
const {createCookieSdkAdapter}=await import('../../app/adapters/browser-sdk.js');
const {createCookieController}=await import('../../app/controller/cookie-controller.js');
function fixture(scenario='ready'){
 const mock=createMockSdk({scenario});
 const adapter=createCookieSdkAdapter({getBrowser:()=>mock.browser,request:mock.request});
 const snapshots=[];
 const controller=createCookieController({adapter,onChange:s=>snapshots.push(s)});
 return {mock,adapter,controller,snapshots,close(){controller.dispose();mock.dispose();}};
}

test('real Controller loads only redacted fictional metadata and renames with verified receipts',async()=>{
 const f=fixture();try{
  await f.controller.load();
  assert.equal(f.controller.snapshot().phase,'ready');
  assert.equal(f.controller.snapshot().rows.length,8);
  const original=f.controller.snapshot().rows.find(r=>r.name==='session_id');
  const row=fictionalCookies().find(r=>r.name==='session_id');
  assert.equal(await f.controller.save({...row,name:'renamed_sid'}, {originalId:original.id,valueEdited:false}),true);
  assert.equal(f.mock.inspect().rows.some(r=>r.name==='session_id'),false);
  assert.equal(f.mock.inspect().rows.find(r=>r.name==='renamed_sid').value,row.value);
  assert.deepEqual(f.mock.inspect().calls.filter(c=>['set','remove'].includes(c.op)).map(c=>c.op),['set','remove']);
  assert.doesNotMatch(JSON.stringify(f.snapshots),/sess_demo_only_C18|secret_preview_never_real/);
 }finally{f.close();}
});

test('clear preview/cancel is inert and confirmed scope excludes domain and partition cookies',async()=>{
 const f=fixture();try{
  await f.controller.load();assert.equal((await f.controller.previewClear()).count,6);
  f.controller.discardClear();assert.equal(f.mock.inspect().rows.length,8);
  await f.controller.previewClear();assert.equal(await f.controller.executeClear(),true);
  assert.deepEqual(f.mock.inspect().rows.map(r=>r.name).sort(),['analytics_consent','embedded_pref']);
 }finally{f.close();}
});

test('real import preflight validates rows; batch receipts and JSON export traverse the SDK adapter',async()=>{
 const f=fixture();try{
  await f.controller.load();
  const source=JSON.stringify([{name:'preview_one',value:'fictional one'},{name:'preview_two',value:'fictional two'}]);
  const result=await f.controller.previewImport(source,'json',false);
  assert.equal(result.accepted,2);
  assert.equal(await f.controller.executeImport(source,'json',false),true);
  assert.equal(f.mock.inspect().rows.length,10);
  assert.equal(await f.controller.exportTo({format:'json',metadata:false,method:'copy'}),true);
  const output=JSON.parse(f.mock.inspect().deliveries.at(-1).text);
  assert.equal(output.length,10);
  assert.ok(output.some(r=>r.name==='preview_one'&&r.value==='fictional one'));
  assert.equal(await f.controller.exportTo({format:'header',metadata:false,method:'copy'}),false);
 }finally{f.close();}
});

test('real import overwrite replaces one native slot when hostOnly changes in either direction',async()=>{
 const f=fixture();try{
  await f.controller.load();
  for(const hostOnly of [false,true]){
   const source=JSON.stringify([{name:'theme',value:'updated',domain:hostOnly?'shop.example.com':'.shop.example.com',hostOnly}]);
   const skipped=await f.controller.previewImport(source,'json',false);
   assert.equal(skipped.accepted,0);assert.equal(skipped.replaced,1);
   const plan=await f.controller.previewImport(source,'json',true);
   assert.equal(plan.accepted,1);assert.equal(plan.replaced,1);
   assert.equal(await f.controller.executeImport(source,'json',true),true);
   const rows=f.mock.inspect().rows;
   assert.equal(rows.length,8);
   assert.deepEqual(rows.filter(row=>row.name==='theme').map(row=>[row.hostOnly,row.value]),[[hostOnly,'updated']]);
  }
 }finally{f.close();}
});

test('mock native slots enforce ifAbsent and isolate name, domain, path, store and partition',async()=>{
 const mock=createMockSdk({scenario:'empty'});try{
  const base={url:'https://shop.example.com/',name:'slot',value:'original',path:'/',storeId:'0'};
  const partition={topLevelSite:'https://partner.example.net',hasCrossSiteAncestor:false};
  const inputs=[base,{...base,name:'other'},{...base,domain:'.example.com'},
   {...base,path:'/shop'},{...base,storeId:'1'},{...base,partitionKey:partition},
   {...base,partitionKey:{...partition,topLevelSite:'https://another.example.net'}},
   {...base,partitionKey:{...partition,hasCrossSiteAncestor:true}}];
  for(const input of inputs)await mock.browser.cookies.set(input);
  const before=mock.inspect().rows;
  await assert.rejects(mock.browser.cookies.set({...base,domain:'.shop.example.com',ifAbsent:true}),{code:'E_COOKIE_CONFLICT'});
  assert.deepEqual(mock.inspect().rows,before);
  await mock.browser.cookies.setMany({url:base.url,cookies:[{...base,domain:'shop.example.com',value:'replacement'}]});
  const rows=mock.inspect().rows;
  assert.equal(rows.length,before.length);
  assert.deepEqual(rows.filter(row=>row.value!=='replacement'),before.slice(1));
  assert.equal(rows.find(row=>row.value==='replacement').hostOnly,false);
 }finally{mock.dispose();}
});

for(const operation of ['save','import','clear','remove'])test('unknown '+operation+' is not replayed by the real Controller',async()=>{
 for(const injection of ['scenario','once']){
  const f=fixture(injection==='scenario'?'unknown':'ready');try{
   await f.controller.load();
   const source=JSON.stringify([{name:'uncertain_one',value:'one'},{name:'uncertain_two',value:'two'}]);
   if(operation==='import')assert.equal((await f.controller.previewImport(source,'json',false)).accepted,2);
   if(operation==='clear')assert.equal((await f.controller.previewClear()).count,6);
   const before=f.mock.inspect();
   if(injection==='once')f.mock.setFailure('unknown');
   const run={save:()=>f.controller.save({...fictionalCookies()[0],name:'uncertain'}),
    import:()=>f.controller.executeImport(source,'json',false),clear:()=>f.controller.executeClear(),
    remove:()=>f.controller.remove(f.controller.snapshot().rows[0].id)};
   assert.equal(await run[operation](),false,injection);
   await new Promise(resolve=>setImmediate(resolve));
   const after=f.mock.inspect();
   const writes=after.calls.slice(before.calls.length).filter(call=>['set','setMany','clearSite','remove'].includes(call.op));
   assert.deepEqual(writes.map(call=>call.op),[{save:'set',import:'setMany',clear:'clearSite',remove:'remove'}[operation]],injection);
   assert.deepEqual(after.rows,before.rows,injection);
   assert.match(f.controller.snapshot().message,/E_OUTCOME_UNKNOWN/);
  }finally{f.close();}
 }
});

test('denied values never reach mock clipboard',async()=>{
 const denied=fixture('valuesDenied');try{
  await denied.controller.load();
  assert.equal(await denied.controller.exportTo({format:'json',metadata:false,method:'copy'}),false);
  assert.equal(denied.mock.inspect().deliveries.length,0);
 }finally{denied.close();}
});

test('scene disposal retires metadata sync and releases pending reads',async()=>{
 const f=fixture();await f.controller.load();
 const list=f.adapter.list;let release;
 f.adapter.list=async(...args)=>{await new Promise(resolve=>{release=resolve;});return list(...args);};
 const syncing=f.controller.syncMetadata();
 f.controller.dispose();release();
 assert.equal(await syncing,false);
 assert.equal(f.controller.snapshot().rows.length,0);f.mock.dispose();
 const loading=fixture('loading');const pending=loading.controller.load();
 await new Promise(resolve=>setImmediate(resolve));loading.close();await pending;
 assert.equal(loading.controller.snapshot().rows.length,0);
});


test('full-height import workspace uses real Controller without a review panel',async()=>{
 const [component,app,css]=await Promise.all([
  read('../../app/components/CookieImport.jsx'),
  read('../../app/CookieEditorApp.jsx'),
  read('../../src/react.css')
 ]);
 assert.match(component,/className="cookie-import-workspace"/);
 assert.doesNotMatch(component,/<dialog\b|showModal\(\)/);
 assert.match(component,/onImportText/);
 assert.match(app,/controller\.previewImport\(text,'auto',true\)/);
 assert.match(app,/controller\.executeImport\(text,'auto',true\)/);
 assert.match(app,/cookie-import-toast/);
 assert.match(css,/\.cookie-import-workspace/);
 for(const legacy of ['cookie-import-summary','cookie-import-overwrite','导入预检结果','新增 {plan.created}'])
  assert.equal(component.includes(legacy),false);
});


test('authorized subdomain imports valid parent-domain cookies without a domain editor',async()=>{
 const f=fixture();try{
  await f.controller.load();
  const source=JSON.stringify([{name:'parent_pref',value:'fictional',
    domain:'.example.com',hostOnly:false,path:'/'}]);
  const plan=await f.controller.previewImport(source,'auto',true);
  assert.equal(plan.accepted,1);
  assert.equal(await f.controller.executeImport(source,'auto',true),true);
  assert.ok(f.controller.snapshot().rows.some(row=>
    row.name==='parent_pref'&&row.domain==='.example.com'));
  const foreign=JSON.stringify([{name:'unrelated',value:'fictional',
    domain:'.elsewhere.invalid',hostOnly:false,path:'/'}]);
  const denied=await f.controller.previewImport(foreign,'auto',true);
  assert.equal(denied.accepted,0);
  assert.equal(denied.skipped,1);
  assert.equal(f.mock.inspect().rows.some(row=>row.name==='unrelated'),false);
 }finally{f.close();}
});
