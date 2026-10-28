import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('export is an anchored two-tab React popover, never a replacement page',async()=>{
  const [app,view,popup,css]=await Promise.all([
    read('../../app/CookieEditorApp.jsx'),
    read('../../app/components/CookieEditorView.jsx'),
    read('../../app/components/CookieExport.jsx'),
    read('../../src/react.css')
  ]);
  assert.match(app,/exportContent=\{exportOpen\?<CookieExport/);
  assert.doesNotMatch(app,/panel==='export'|restoreExportFocus/);
  assert.match(view,/className="cookie-export-popover"/);
  assert.match(view,/haspopup="dialog" expanded=\{exportOpen\}/);
  assert.match(view,/document\.addEventListener\('focusin'/);
  assert.match(view,/window\.addEventListener\('blur'/);
  assert.match(view,/\['json','JSON'/);
  assert.match(view,/\['header','Cookie Header'/);
  assert.doesNotMatch(view,/<option value="netscape">|aria-label="导出格式" value=/);
  assert.match(popup,/role="dialog"/);
  assert.match(popup,/const requiresValues=format==='header'&&!includeValues/);
  assert.match(popup,/Cookie Header 需要包含 Cookie 值/);
  assert.match(popup,/pendingRef\.current=true/);
  assert.match(popup,/onPendingChange\?\.\(true\)/);
  assert.match(app,/if\(exportPending\.current&&!confirmed\)return/);
  assert.doesNotMatch(view,/\{format==='json'&&<label className="export-inline-values/);
  assert.match(popup,/onDelivered\?\.\(method\)/);
  assert.match(popup,/role="tabpanel"/);
  assert.doesNotMatch(popup,/JSON 备份保留完整属性|复制为请求头文本|仅导出属性，不包含 Cookie 值/);
  assert.match(css,/\.cookie-export-popover\{/);
 assert.match(view,/className="od-button cookie-button--choice"/);
 assert.match(css,/\.cookie-export-tabs\{\s*display:flex;gap:6px;align-items:center/);
 assert.match(view,/aria-selected=\{format===key\}/);
  assert.doesNotMatch(css,/\.cookie-export-workspace\{/);
});

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

test('authorization preview presents one clearly scoped grant action',async()=>{
  const [legacy,react,css]=await Promise.all([
    read('../cookie-editor-r4.3-preview.html'),read('./src/App.jsx'),read('./src/style.css')
  ]);
  assert.match(legacy,/Cookie 访问授权/);
  assert.match(legacy,/允许管理本站 Cookie/);
  assert.doesNotMatch(legacy,/data-action="grantRead"|class="readonly"|data-scene="readonly"/);
  assert.match(legacy,/g\.read=true;g\.write=true/);
  assert.match(react,/Cookie 访问授权/);
  assert.match(react,/允许管理普通 HTTP\/HTTPS 网站的 Cookie；敏感值单独授权。/);
  assert.match(react,/onClick=\{grant\}>允许管理所有网站 Cookie<\/button>/);
  assert.doesNotMatch(react,/preview-grant-icon|首次允许一次|<small>/);
  assert.doesNotMatch(css,/preview-grant-icon|preview-global-grant small/);
  const trustedCss=await read('../../../../../src/ui/tool-shell.css');
  assert.match(trustedCss,/min-height:236px;padding:36px clamp\(16px,6vw,28px\)/);
  assert.match(trustedCss,/max-width:360px/);
});

test('committed standalone React preview reflects the one-action consent UI',async()=>{
  const html=await read('./index.html');
  const scripts=[...html.matchAll(/<script src="data:text\/javascript;base64,([^"]+)"><\/script>/g)];
  const css=html.match(/href="data:text\/css;base64,([^"]+)"/);
  assert.equal(scripts.length,3);
  assert.ok(css);
  const js=Buffer.from(scripts[2][1],'base64').toString('utf8');
  const styles=Buffer.from(css[1],'base64').toString('utf8');
  assert.match(js,/Cookie 访问授权/);
  assert.match(js,/允许管理普通 HTTP\/HTTPS 网站的 Cookie/);
  assert.doesNotMatch(js,/首次允许一次|preview-grant-icon|这是交互演示/);
  assert.match(styles,/\.preview-global-grant\{min-height:236px/);
  assert.doesNotMatch(styles,/preview-grant-icon|preview-global-grant small/);
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


test('one-source import lives in a bottom sheet while the list stays mounted',async()=>{
 const [component,app,css]=await Promise.all([
  read('../../app/components/CookieImport.jsx'),
  read('../../app/CookieEditorApp.jsx'),
  read('../../src/react.css')
 ]);
 assert.match(component,/className="cookie-import-workspace"/);
 assert.match(component,/role="dialog" aria-modal="true"/);
 assert.match(component,/cookie-import-dismiss-layer/);
 assert.match(app,/importOpen=\{panel==='import'\}/);
 assert.doesNotMatch(app,/panel===null&&<CookieEditorView/);
 assert.match(component,/onBeforeSubmit\?\.\(\)===false/);
 assert.doesNotMatch(component,/<dialog\b|showModal\(\)/);
 assert.match(component,/onImportText/);
 assert.match(component,/const \[overwrite,setOverwrite\]=React\.useState\(true\)/);
 assert.match(component,/onImportText\?\.\(text,\{overwrite\}\)/);
 assert.match(component,/className="cookie-import-overwrite"/);
 assert.match(component,/<span>覆盖已有 Cookie<\/span>/);
 assert.doesNotMatch(component,/默认不覆盖|\|\|overwrite/);
 assert.match(css,/height:auto;max-height:calc\(100% - var\(--space-2\)\)/);
 assert.match(css,/display:flex;flex:0 1 auto;flex-direction:column/);
 assert.doesNotMatch(css,/height:min\(510px|height:calc\(100% - 32px\)/);
 assert.match(app,/controller\.previewImport\(text,'auto',overwrite,\{allSites:true\}\)/);
 assert.match(app,/controller\.executeImport\(text,'auto',overwrite,\{allSites:true\}\)/);
 assert.match(app,/cookie-import-toast/);
 assert.match(css,/\.cookie-import-workspace/);
 assert.match(css,/\.cookie-import-footer/);
 assert.match(css,/\.cookie-import-body/);
 for(const legacy of ['cookie-import-summary','导入预检结果','新增 {plan.created}'])
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

test('global Cookie grant is one simulated decision across site changes and revocation',async()=>{
 const f=fixture('first');try{
  await f.controller.load();assert.equal(f.controller.snapshot().phase,'blocked');
  assert.equal(f.mock.hasGlobalCookieGrant(),false);
  f.mock.grantAllSites();await f.controller.load();
  assert.equal(f.controller.snapshot().phase,'ready');
  assert.equal(f.controller.snapshot().rows.length,8);
  for(const hostname of ['docs.example.org','store.example.net']){
   f.mock.switchSite(hostname);await f.controller.load();
   assert.equal(f.controller.snapshot().phase,'ready');
   assert.equal(f.controller.snapshot().target.hostname,hostname);
   assert.equal(f.controller.snapshot().rows.length,2);
  }
  assert.equal(f.mock.inspect().calls.filter(call=>call.op==='globalGrant').length,1);
  f.mock.revokeAllSites();await f.controller.load();
  assert.equal(f.controller.snapshot().phase,'blocked');
  assert.equal(f.mock.hasGlobalCookieGrant(),false);
 }finally{f.close();}
});


test('R5.25 preview covers real Controller status categories from fictional SDK',async()=>{
 for(const [scenario,phase,problem] of [
   ['noPage','blocked','E_NO_ACTIVE_TAB'],
   ['restricted','blocked','E_UNSUPPORTED_SCHEME'],
   ['switching','blocked','E_DOCUMENT_UNRESOLVED'],
   ['chromeDenied','blocked','E_CHROME_PERMISSION_REQUIRED'],
   ['hostClosed','error','E_HOST_CLOSED']
 ]){
   const f=fixture(scenario);
   try{
     await f.controller.load();
     assert.equal(f.controller.snapshot().phase,phase);
     assert.equal(f.controller.snapshot().problem,problem);
     assert.equal(f.mock.inspect().calls.some(row=>row.op==='getAll'),false,
       'an unavailable website or revoked Host must never issue Cookie reads');
   }finally{f.close();}
 }
});

test('R2.6 fictional account scenes expose three redacted accounts without touching real transport',async()=>{
 const demo=createMockSdk({scenario:'accountsDemo'});
 try{
  const state=await demo.request('cookieAccount.status',{});
  assert.equal(state.preview,true);
  assert.equal(state.configured,true);
  assert.equal(state.unlocked,true);
  assert.deepEqual(state.accounts.map(a=>a.alias),['work','personal','qa']);
  assert.equal(state.currentAlias,'work');
  assert.equal(state.settings.autoRefresh,true);
  const receipt=await demo.request('cookieAccount.switch',{alias:'personal',revision:state.revision});
  assert.equal(receipt.preview,true);
  assert.equal(receipt.verified,true);
  assert.equal((await demo.request('cookieAccount.status',{})).currentAlias,'personal');
  const ops=demo.inspect().calls.filter(x=>x.op==='previewAccountSwitch');
  assert.equal(ops.length,1);
  assert.equal(ops[0].args.fixture,true);
 }finally{demo.dispose();}
 const first=createMockSdk({scenario:'accountsFirst'});
 try{
  const state=await first.request('cookieAccount.status',{});
  assert.equal(state.unlocked,true);
  assert.deepEqual(state.accounts,[]);
  const saved=await first.request('cookieAccount.create',{revision:state.revision,displayName:'First local account'});
  assert.equal(saved.accounts[0].displayName,'First local account');
  await assert.rejects(first.request('cookieAccount.unlock',{}),{code:'E_ACCOUNT_REQUEST'});
  await assert.rejects(first.request('cookieAccount.lock',{}),{code:'E_ACCOUNT_REQUEST'});
 }finally{first.dispose();}
 for(const [scenario,code] of [
  ['accountSwitchFail','E_SITE_GRANT_REQUIRED'],
  ['accountSwitchUnknown','E_OUTCOME_UNKNOWN']
 ]){
  const sdk=createMockSdk({scenario});
  try{
   const state=await sdk.request('cookieAccount.status',{});
   await assert.rejects(sdk.request('cookieAccount.switch',{
    alias:'personal',revision:state.revision
   }),{code});
   assert.equal((await sdk.request('cookieAccount.status',{})).currentAlias,'work');
  }finally{sdk.dispose();}
 }
});

test('R3.2 market and account invite share one formal App but never create production grants',async()=>{
 const [product,preview,experiences,accounts,stylesheet]=await Promise.all([
  read('../../app/CookieEditorApp.jsx'),read('./src/App.jsx'),
  read('../../app/components/CookieAccountExperiences.jsx'),
  read('../../app/components/CookieAccounts.jsx'),read('../../src/react.css')
 ]);
 assert.match(product,/<CookieAccountMarket\b/);
 assert.match(product,/initialSection='cookie'/);
 assert.match(product,/\['cookie','Cookie'\],\['accounts','账号'\],\['enterprise','企业'\]/);
 assert.match(preview,/React\.useState\('accountsDemo'\)/);
 assert.match(preview,/initialSection=\{\['accountsFirst'/);
 assert.doesNotMatch(preview,/initialSection=\{\['accountsDemo'/);
 assert.match(preview,/<CookieEditorApp\b/);
 assert.match(accounts,/<CookieAccountShare account=\{shareItem\} previewOnly=\{previewOnly\}/);
 assert.doesNotMatch(accounts,/export function CookieAccountMarket/);
 assert.match(experiences,/disabled=\{!previewOnly\|\|!validRecipient\}/);
 assert.match(experiences,/邀请服务未上线/);
 assert.match(experiences,/https:\/\/example\.invalid\/invite\/demo-only/);
 assert.match(experiences,/onExperience\(item\.id\)/);
 for(const str of ['多账号整理','网址快捷切换','Cookie 有效期管理',
  '匿名邀请','指定用户','撤销','模拟失败'])
   assert.ok(experiences.includes(str),'missing '+str);
 for(const src of [preview,experiences])assert.doesNotMatch(src,
  /chrome\.|document\.cookie|localStorage|sessionStorage|\bfetch\s*\(|XMLHttpRequest/);
 assert.match(stylesheet,/\.cookie-market-resource/);
 assert.match(stylesheet,/\.cookie-share-demo-code/);
});


test('R3.7 dev comparison imports safely and pins approved bytes without generated HTML',async()=>{
 const {approvedHtml,comparisonHtml,accepted}=await import('./build-a-b.mjs');
 const {createHash}=await import('node:crypto');
 const original=await approvedHtml();
 assert.equal(accepted,'020adbf22005cba219af4ff27cd3f3e492978bed');
 assert.equal(createHash('sha1').update('blob '+original.length+'\0').update(original).digest('hex'),accepted);
 const html=comparisonHtml(original,'',{dev:true});
 assert.match(html,/id="current-react"[^>]*src="\/dev.html"/);
 assert.match(html,/id="approved-html"[^>]*srcdoc=/);
 assert.doesNotMatch(html,/data:text\/javascript;base64/);
 const staticHtml=comparisonHtml(original,'STATIC_FIXTURE',{digest:'fixture'});
 assert.match(staticHtml,/srcdoc="STATIC_FIXTURE"/);
 assert.doesNotMatch(staticHtml,/allow-same-origin/);
});

test('R3.7 dev serves current CSS and source receipts while static auditing remains strict',async()=>{
 const [vite,audit,contract]=await Promise.all([read('./vite.config.mjs'),read('./visual-contract-check.mjs'),read('./visual-contract.json').then(JSON.parse)]);
 assert.match(vite,/compileSharedToolCss\(readFileSync\(productCss/);
 assert.match(vite,/server\.watcher\.add/);
 assert.match(vite,/generatedHtmlUsed:false/);
 assert.match(vite,/src="\/src\/main.jsx"/);
 assert.match(audit,/if\(!selfTest&&!devUrl\)try/);
 assert.match(audit,/E_R35_REACT_PREVIEW_STALE/);
 assert.match(audit,/E_SOURCE_CHANGED_DURING_AUDIT/);
 assert.equal(contract.scenario.reactScenario,'approvedParity');
 assert.ok(contract.scenario.fixedTime);
 assert.ok(contract.inventory.styleKeys.includes('stroke'));
});


test('R2.6 mock account create receipts, no-op snapshots and exact scope drift',async()=>{
  const mock=createMockSdk({scenario:'accountsFirst'});
  const origin='https://shop.example.com';
  try{
    const created=await mock.request('cookieAccount.create',{
      origin,revision:0,displayName:'新账号 1'
    });
    assert.equal(created.accounts.length,1);
    assert.equal(created.accounts[0].cookieCount,8);
    const account=created.accounts[0];
    const unchanged=await mock.request('cookieAccount.update',{
      origin,revision:created.revision,alias:account.alias,accountVersion:account.version
    });
    assert.equal(unchanged.unchanged,true);
    assert.equal(unchanged.revision,created.revision);
    await assert.rejects(mock.request('cookieAccount.create',{
      origin,revision:created.revision,displayName:'新账号 1'
    }),error=>error.code==='E_ACCOUNT_NAME_TAKEN');
    await mock.browser.cookies.set({
      url:origin+'/',name:'new_cookie',value:'fictional-only',
      path:'/',storeId:'0',secure:true,httpOnly:false,sameSite:'lax'
    });
    await assert.rejects(mock.request('cookieAccount.update',{
      origin,revision:created.revision,alias:account.alias,accountVersion:account.version
    }),error=>error.code==='E_ACCOUNT_SNAPSHOT_SCOPE_CHANGED');
    const reloaded=await mock.request('cookieAccount.status',{origin});
    assert.equal(reloaded.accounts[0].version,account.version);
    assert.equal(reloaded.revision,created.revision);
  }finally{mock.dispose();}
});

test('R2.6 mock failed account create never produces success receipt',async()=>{
  const mock=createMockSdk({scenario:'accountsFirst'});
  const origin='https://shop.example.com';
  try{
    mock.setFailure('save');
    await assert.rejects(mock.request('cookieAccount.create',{
      origin,revision:0,displayName:'新账号 1'
    }),error=>error.code==='E_ACCOUNT_STORAGE_UNAVAILABLE');
    const status=await mock.request('cookieAccount.status',{origin});
    assert.equal(status.accounts.length,0);
    assert.equal(status.revision,0);
  }finally{mock.dispose();}
});
