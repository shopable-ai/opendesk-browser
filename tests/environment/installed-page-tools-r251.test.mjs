import {test,describe,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setInstalledPageProgramEnabled} from '../../src/ui/installed-page-tools.js';

const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;
const installed=(programId='page-a',overrides={})=>({
  programId,title:'已安装的原始名称',revision:3,manifestHash:'a'.repeat(64),
  sourceHash:'b'.repeat(64),pageRules:{matches:['https://example.com/*']},
  enabled:true,nativeState:'registered',
  authorization:{status:'active',generation:7,installationId:'installation-'+programId},...overrides
});

// Actual unified controller and React page in isolated Chromium; only services
// are doubled. Native click provenance and browser focus are never fabricated.
async function fixture(){
  const state={rowsModel:{rows:[]},view:'list'};
  const toolView=createSidebarToolsView();
  const root=createRoot(document.getElementById('root'));
  const paint=()=>flushSync(()=>root.render(React.createElement(React.Fragment,null,
    React.createElement(ExtensionCenterPage,state),
    React.createElement(NotificationViewport,{view:toolView,snapshot:toolView.getSnapshot()}))));
  const unsubscribe=toolView.subscribe(paint);
  paint();
  document.getElementById('extension-center-list').dataset.opendeskReactOwner='extension-list';
  const extensionList={owner:'extension-list',
    renderRows(model){state.rowsModel=model;paint();},
    renderToolbar(model){state.toolbarModel=model;paint();},
    renderDetail(model){state.detailModel=model;paint();},
    renderRecoveries(model){state.recoveryModel=model;paint();},
    renderFeedback(model){state.feedbackModel=model;paint();},
    renderStatus(model){state.statusModel=model;paint();},
    renderView(view){state.view=view;paint();},
    connectBack(fn){state.onBack=fn;paint();},
    setMenuKey(key){state.menuKey=key;paint();},
    renderRowMenu(items,options){state.rowMenuModel=options?{...options,items}:null;paint();}
  };
  const reads=new Map(),readQueue=[],changes=new Set(),connections=new Set();
  const f={state,rows:window.initialRows,calls:[],permissionChecks:[],permissionRequests:[],
    clicks:[],allowed:true,writeMode:'normal',holdWrite:false,ready:false,changes,connections};
  document.addEventListener('click',event=>f.clicks.push({trusted:event.isTrusted,
    action:event.target.closest('[data-ec-detail-action]')?.dataset.ecDetailAction}),true);
  const extensionOrigin='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/';
  const originalFetch=window.fetch;
  window.fetch=async (url,options)=>{
    if(typeof url==='string'&&url.startsWith(extensionOrigin)){
      const response=await originalFetch('/'+url.slice(extensionOrigin.length),options);
      return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});
    }
    if(url==='https://raw.githubusercontent.com/shopable-ai/opendesk-browser/main/official-tools/stay-focus/latest.json')
      return new Response(null,{status:404});
    return originalFetch(url,options);
  };
  const api={runtime:{getURL:path=>extensionOrigin+path},
    tabs:{create:async()=>{throw Error('unexpected navigation');}},
    permissions:{contains:async request=>{f.permissionChecks.push(structuredClone(request));return f.allowed;},
      request:async request=>{f.permissionRequests.push(request);throw Error('unexpected permission prompt');}},
    storage:{local:{get:async()=>({})},onChanged:{
      addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}}};
  const client={subscribeConnection(fn){connections.add(fn);return ()=>connections.delete(fn);},
    async request(name,args){
      f.calls.push({name,args:structuredClone(args)});
      if(name==='listPagePrograms')return readQueue.length?readQueue.shift():{installed:structuredClone(f.rows)};
      if(name!=='setInstalledPageEnabled')throw Error('unexpected authority: '+name);
      if(f.holdWrite)await new Promise(resolve=>{f.releaseWrite=resolve;});
      if(f.writeMode==='error')throw Object.assign(Error('安装授权已改变'),{code:'E_REVISION'});
      if(f.writeMode!=='ack'){
        const current=f.rows.find(row=>row.programId===args.programId);
        current.enabled=args.enabled;
        current.nativeState=args.enabled?'registered':'disabled';
        current.authorization.status=args.enabled?'active':'disabled';
        current.authorization.generation++;
        if(f.writeMode==='native-pending'){
          current.nativeState='blocked';
          current.error={code:'E_USER_SCRIPTS_UNAVAILABLE',message:'Chrome 用户脚本访问不可用'};
        }
        if(f.writeMode==='cleanup-pending'){
          current.managedCleanup={scope:'managed-ui-only',state:'unknown',records:1,pendingRecords:1,
            pendingDocuments:[{tabId:42,documentId:'old-page',tabTitle:'正在编辑的网页'}]};
        }
        return structuredClone(current);
      }
      return {enabled:args.enabled};
    }};
  const controller=createExtensionCenter({api,client,doc:document,extensionList,
    notify:window.enableSharedNotices?toolView.showToast:null,
    sidebarTools:{},taskWorkbench:{navigate(){throw Error('unexpected navigation');}}});
  Object.assign(f,{controller,
    deferRead(id){
      let resolve,reject;
      const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      const read={resolve,reject,settled:false};reads.set(id,read);readQueue.push(promise);
      return read;
    },
    beginRead(id){
      const read=f.deferRead(id);
      void controller.refresh().then(()=>{read.settled=true;});
    },
    finishRead(id,rows,error){
      const read=reads.get(id);
      if(error)read.reject(Object.assign(Error(error),{code:'E_PAGE_INSTALLATION'}));
      else read.resolve({installed:rows});
    },
    readSettled:id=>reads.get(id).settled,
    dispose(){controller.dispose();unsubscribe();toolView.dispose();}
  });
  window.fixture=f;
  await controller.refresh();f.ready=true;
}

const row=(page,id='page-a')=>page.locator(`[data-extension-id="page:${id}"]`);
const action=(page,id='page-a',kind='main')=>page.locator(
  `[data-extension-key="page:${id}"][data-extension-action="${kind}"]`);
const toggle=page=>page.getByRole('switch');
const switchTrack=page=>page.locator('[data-ec-detail-action="toggle"]');
const status=page=>page.locator('#extension-center-status');
const receipt=page=>page.locator('.sidebar-tool-toast-stack[data-position="bottom-center"] .sidebar-tool-toast');
const pageState=page=>page.locator('.ec-page-control .ec-page-state');
const writes=page=>page.evaluate(()=>fixture.calls.filter(call=>call.name==='setInstalledPageEnabled'));
async function detail(page,id='page-a'){await action(page,id).click();}
async function idle(page){await page.waitForFunction(()=>!fixture.state.rowsModel.busy);}
async function finishRead(page,id,rows,error){
  await page.evaluate(({id,rows,error})=>fixture.finishRead(id,rows,error),{id,rows,error});
  await page.waitForFunction(id=>fixture.readSettled(id),id);
}

describe('R25.1 installed Page behavior through unified ExtensionCenter / real React',{
  skip:modulePath?false:'NOT_TESTED: OPENDESK_PLAYWRIGHT_MODULE required'
},()=>{
  let browser,server;
  before(async()=>{
    const {chromium}=await import(modulePath);
    const bundled=await build({stdin:{contents:`import React from 'react';
      import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import {ExtensionCenterPage} from './src/ui/react/tabs/tools.tsx';
      import {NotificationViewport} from './src/ui/react/components/notifications.tsx';
      import {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
      import {createExtensionCenter} from './src/ui/extension-center.js';
      (${fixture.toString()})().catch(error=>{window.fixtureError=String(error.stack);});`,
      resolveDir:new URL('../../',import.meta.url).pathname,loader:'tsx'},
      bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',
      plugins:[{name:'fixture-raw-css',setup(builder){
        builder.onResolve({filter:/\.css\?raw$/},args=>({
          path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'fixture-raw-css'}));
        builder.onLoad({filter:/.*/,namespace:'fixture-raw-css'},async args=>({
          contents:await readFile(args.path,'utf8'),loader:'text'}));
      }}]});
    const css=(await Promise.all(['design-tokens.css','react/components/ui/sidebar-shared.css',
      'design-system.css','tool-shell.css','extension-center.css']
      .map(name=>readFile(new URL('../../src/ui/'+name,import.meta.url),'utf8')))).join('\n');
    const sources=JSON.parse(await readFile(new URL('../../official-pages/sources.json',import.meta.url),'utf8'));
    const appCatalog=await readFile(new URL('../../official-tools/catalog.json',import.meta.url),'utf8');
    const pageCatalog={schema:'opendesk.official-pages.releases.v1',sourceRepository:sources.sourceRepository,
      apps:sources.programs.map(({programId,title,description,version,revision,sites,installationPolicy})=>({
        programId,title,description,version,revision,sites,installationPolicy,
        kind:'page-program',status:'blocked',blockedReason:'Offline browser fixture'}))};
    server=createServer((req,res)=>{
      const script=req.url==='/app.js',style=req.url==='/style.css',catalog=req.url.includes('catalog.json');
      res.setHeader('Content-Type',script?'text/javascript':style?'text/css':catalog?'application/json':'text/html');
      res.end(script?bundled.outputFiles[0].text:style?css:catalog?
        (req.url.startsWith('/official-pages/')?JSON.stringify(pageCatalog):appCatalog):
        '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="workspace-content"><div id="root"></div></div><script type="module" src="/app.js"></script></body></html>');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],
      ...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?{executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{})});
  });
  after(async()=>{
    await browser?.close();
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
  async function open(t,rows=[installed()],enableSharedNotices=false){
    const page=await browser.newPage();page.setDefaultTimeout(5000);
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
    await page.addInitScript(({rows,enableSharedNotices})=>{
      window.initialRows=rows;window.enableSharedNotices=enableSharedNotices;
    },{rows,enableSharedNotices});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.fixture?.ready||window.fixtureError);
    assert.equal(await page.evaluate(()=>window.fixtureError),undefined);
    return page;
  }

  test('01 installed identity/title wins; malformed and mismatched records never become manageable',async t=>{
    const page=await open(t,[installed(),installed('fallback',{title:''}),
      {programId:'wrong',manifestHash:'c'.repeat(64),title:'Candidate title must not win',installed:installed('wrong')},
      {programId:'missing-hash'},{manifestHash:'d'.repeat(64)}]);
    assert.equal(await row(page).locator('.ec-name-text').innerText(),'已安装的原始名称');
    assert.equal(await row(page,'fallback').locator('.ec-name-text').innerText(),'fallback');
    assert.equal(await page.locator('#extension-center-list > li').count(),2);
    await detail(page);
    await page.getByText('权限、版本与技术信息',{exact:true}).click();
    assert.match(await page.locator('#extension-center-detail-body').innerText(),/修订：r3/);
    assert.match(await page.locator('#extension-center-detail-body').innerText(),new RegExp('b'.repeat(64)));
    assert.deepEqual(await page.evaluate(()=>[...new Set(fixture.calls.map(call=>call.name))]),['listPagePrograms']);
  });

  test('02 installed Page without a Candidate remains manageable via its native row menu',async t=>{
    const page=await open(t);
    await action(page,'page-a','more').click();
    await page.getByRole('menuitem',{name:'停用自动运行',exact:true}).click();await idle(page);
    assert.equal((await writes(page)).length,1);
    assert.equal((await writes(page))[0].args.enabled,false);
    assert.match(await row(page).innerText(),/已停用/);
    assert.match(await status(page).innerText(),/Page Authority 确认/);
    assert.equal(await action(page,'page-a','more').evaluate(node=>node===document.activeElement),true);
  });

  test('03 long markup-like titles and full site rules remain literal React text',async t=>{
    const title='<img src=x onerror="window.injected=true">'+ '很长的已安装名称'.repeat(40);
    const matches=['https://example.com/'+ 'long-path/'.repeat(60)+'*','https://second.example/*'];
    const page=await open(t,[installed('page-a',{title,pageRules:{matches}})]);
    assert.equal(await row(page).locator('.ec-name-text').textContent(),title);
    await detail(page);
    assert.deepEqual(await page.locator('.ec-sites li').allTextContents(),matches);
    assert.equal(await page.locator('#extension-center-detail img').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
  });

  test('04 disabled/suspended/registered/pending states retain their distinct current UI semantics',async t=>{
    const page=await open(t,[installed('disabled',{enabled:false,nativeState:'disabled',
      authorization:{status:'disabled',generation:7}}),
      installed('suspended',{authorization:{status:'suspended',generation:7}}),
      installed('registered'),installed('pending',{nativeState:'pending'})]);
    assert.match(await row(page,'disabled').innerText(),/已停用/);
    assert.match(await row(page,'suspended').innerText(),/网站访问受限/);
    assert.doesNotMatch(await row(page,'registered').innerText(),/已停用|访问受限|待核对/);
    assert.match(await row(page,'pending').innerText(),/注册待核对/);
    for(const id of ['disabled','suspended','registered']){
      await detail(page,id);assert.equal(await toggle(page).isChecked(),id!=='disabled');
      assert.equal(await page.getByRole('button',{name:'尝试恢复原有授权与注册'}).count(),Number(id==='suspended'));
      await page.locator('#extension-center-back').click();
    }
    assert.deepEqual(await writes(page),[]);
  });

  test('05 reordered refresh preserves the selected detail and returns focus to that installed row',async t=>{
    const page=await open(t,[installed(),installed('page-b',{title:'Z'})]);
    await detail(page);
    await page.evaluate(async()=>{fixture.rows.reverse();fixture.rows[0].title='A';await fixture.controller.refresh();});
    assert.equal(await page.locator('#extension-center-detail').isVisible(),true);
    assert.equal(await page.evaluate(()=>fixture.state.detailModel.key),'page:page-a');
    await page.locator('#extension-center-back').click();
    assert.equal(await action(page).evaluate(node=>node===document.activeElement),true);
  });

  test('06 current technical detail stays visible and its action keeps real browser focus on refresh',async t=>{
    const page=await open(t);await detail(page);
    await page.getByText('权限、版本与技术信息',{exact:true}).click();
    await toggle(page).focus();
    await page.evaluate(()=>fixture.controller.refresh());
    assert.match(await page.locator('#extension-center-detail-body').innerText(),/固定源码 SHA-256：b{64}/);
    assert.equal(await toggle(page).evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.locator('#installed-page-tools-list').count(),0);
  });

  test('07 list refresh leaves focus in the external search control untouched',async t=>{
    const page=await open(t);const search=page.locator('#extension-center-search');await search.focus();
    await page.evaluate(()=>fixture.controller.refresh());
    assert.equal(await search.evaluate(node=>node===document.activeElement),true);
  });

  test('08 a removed selected Page exits detail and focuses the current search fallback',async t=>{
    const page=await open(t);await detail(page);
    await page.evaluate(async()=>{fixture.rows=[];await fixture.controller.refresh();});
    assert.equal(await page.locator('#extension-center-list-view').isVisible(),true);
    assert.equal(await page.locator('#extension-center-search').evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.locator('#extension-center-list > li').count(),0);
    assert.equal((await writes(page)).length,0);
  });

  test('09 only a trusted disable dispatches once; busy/readback/feedback/focus remain authoritative',async t=>{
    const page=await open(t);await detail(page);
    await toggle(page).evaluate(node=>node.click());assert.equal((await writes(page)).length,0);
    await page.evaluate(()=>{fixture.holdWrite=true;});await toggle(page).press('Space');
    await page.waitForFunction(()=>fixture.calls.some(call=>call.name==='setInstalledPageEnabled'));
    assert.equal(await toggle(page).isDisabled(),true);
    await toggle(page).evaluate(node=>node.dispatchEvent(new MouseEvent('click',{bubbles:true})));
    assert.equal((await writes(page)).length,1);
    await page.evaluate(()=>fixture.releaseWrite());await idle(page);
    assert.deepEqual((await writes(page))[0].args,{programId:'page-a',manifestHash:'a'.repeat(64),installationId:'installation-page-a',enabled:false,expectedGeneration:7});
    assert.equal(await status(page).getAttribute('data-state'),'success');
    assert.match(await status(page).innerText(),/Page Authority 确认/);
    assert.equal(await toggle(page).evaluate(node=>node===document.activeElement),true);
    await page.evaluate(()=>fixture.controller.refresh());
    assert.equal(await status(page).getAttribute('data-state'),'success');
    assert.equal(await page.evaluate(()=>fixture.clicks.some(click=>click.action==='toggle'&&click.trusted)),true);
    assert.deepEqual(await page.evaluate(()=>fixture.permissionChecks),[]);
    assert.deepEqual(await page.evaluate(()=>[...new Set(fixture.calls.map(call=>call.name))]),['listPagePrograms','setInstalledPageEnabled']);
  });

  test('10 explicit enable checks exactly the previously approved origins with no permission request',async t=>{
    const matches=['https://example.com/*','https://second.example/*'];
    const page=await open(t,[installed('page-a',{enabled:false,pageRules:{matches}})]);await detail(page);
    await switchTrack(page).click();await idle(page);
    assert.deepEqual(await page.evaluate(()=>fixture.permissionChecks),[{origins:matches}]);
    assert.deepEqual(await page.evaluate(()=>fixture.permissionRequests),[]);
    assert.equal((await writes(page))[0].args.enabled,true);
    assert.equal(await status(page).getAttribute('data-state'),'success');
  });

  test('11 suspended installation explicitly restores enabled:true in the same approved scope',async t=>{
    const page=await open(t,[installed('page-a',{authorization:{status:'suspended',generation:9,installationId:'original'}})]);
    await detail(page);
    await page.getByRole('button',{name:'尝试恢复原有授权与注册'}).click();await idle(page);
    assert.deepEqual((await writes(page))[0].args,{programId:'page-a',manifestHash:'a'.repeat(64),installationId:'original',enabled:true,expectedGeneration:9});
    assert.deepEqual(await page.evaluate(()=>fixture.permissionChecks),[{origins:['https://example.com/*']}]);
    assert.deepEqual(await page.evaluate(()=>fixture.rows[0].pageRules.matches),['https://example.com/*']);
    assert.equal(await page.evaluate(()=>fixture.rows[0].authorization.installationId),'original');
    assert.deepEqual(await page.evaluate(()=>fixture.permissionRequests),[]);
    assert.equal(await status(page).getAttribute('data-state'),'success');
  });

  test('12 suspended Page with revoked Chrome access never writes or requests broader access',async t=>{
    const page=await open(t,[installed('page-a',{authorization:{status:'suspended',generation:7}})]);
    await page.evaluate(()=>{fixture.allowed=false;});await detail(page);
    await page.getByRole('button',{name:'尝试恢复原有授权与注册'}).click();await idle(page);
    assert.deepEqual(await writes(page),[]);assert.match(await status(page).innerText(),/E_PERMISSION/);
    assert.deepEqual(await page.evaluate(()=>fixture.permissionRequests),[]);
    assert.equal(await page.getByRole('button',{name:'尝试恢复原有授权与注册'}).isVisible(),true);
  });

  test('13 denied enable has zero writes and retains its semantic error through refresh',async t=>{
    const page=await open(t,[installed('page-a',{enabled:false})]);await detail(page);
    await page.evaluate(()=>{fixture.allowed=false;});await switchTrack(page).click();await idle(page);
    await page.evaluate(()=>fixture.controller.refresh());
    assert.deepEqual(await writes(page),[]);assert.match(await status(page).innerText(),/访问受限.*E_PERMISSION/);
    assert.equal(await status(page).getAttribute('data-state'),'error');
    assert.deepEqual(await page.evaluate(()=>fixture.permissionRequests),[]);
  });

  test('14 failed generation write preserves Authority/error and never automatically retries',async t=>{
    const page=await open(t);await detail(page);await page.evaluate(()=>{fixture.writeMode='error';});
    await switchTrack(page).click();await idle(page);
    await page.evaluate(async()=>{await fixture.controller.refresh();document.dispatchEvent(new Event('opendesk:page-installation-changed'));});
    await idle(page);
    assert.equal((await writes(page)).length,1);assert.match(await status(page).innerText(),/状态已变化.*E_REVISION/);
    assert.equal(await page.evaluate(()=>fixture.rows[0].enabled),true);
    assert.equal(await page.evaluate(()=>fixture.rows[0].authorization.generation),7);
    assert.equal(await toggle(page).isEnabled(),true);
  });

  test('15 failed installed read withdraws unverified rows; a successful read recovers without writes',async t=>{
    const page=await open(t);await page.evaluate(()=>fixture.beginRead('failure'));
    await finishRead(page,'failure',null,'Page registry unavailable');
    assert.equal(await page.locator('#extension-center-list > li').count(),0);
    assert.match(await status(page).innerText(),/读取失败.*Page registry unavailable/);
    assert.equal(await page.locator('#extension-center-count').innerText(),'部分安装状态待核对');
    await page.evaluate(()=>fixture.controller.refresh());
    assert.equal(await row(page).count(),1);assert.doesNotMatch(await status(page).innerText(),/Page registry unavailable/);
    assert.deepEqual(await writes(page),[]);
  });

  test('16 pending refresh never steals focus moved outside the rows while awaiting Authority',async t=>{
    const page=await open(t);await action(page,'page-a','more').focus();
    await page.evaluate(()=>fixture.beginRead('pending'));await page.locator('#extension-center-search').focus();
    await finishRead(page,'pending',[installed()]);
    assert.equal(await page.locator('#extension-center-search').evaluate(node=>node===document.activeElement),true);
  });

  test('17 stale read failure cannot replace a newer successful list or its status',async t=>{
    const page=await open(t);await page.evaluate(async()=>{fixture.beginRead('old');fixture.rows[0].title='最新安装';await fixture.controller.refresh();});
    const message=await status(page).innerText();await finishRead(page,'old',null,'obsolete failure');
    assert.equal(await row(page).locator('.ec-name-text').innerText(),'最新安装');
    assert.equal(await status(page).innerText(),message);
  });

  test('18 older installed success cannot replace a newer identity or reopen obsolete detail',async t=>{
    const page=await open(t);await detail(page);
    await page.evaluate(async()=>{fixture.beginRead('old');fixture.rows[0].sourceHash='c'.repeat(64);fixture.rows[0].title='新修订';await fixture.controller.refresh();});
    await finishRead(page,'old',[installed()]);
    assert.equal(await row(page).locator('.ec-name-text').innerText(),'新修订');
    assert.equal(await page.locator('#extension-center-list-view').isVisible(),true);
    assert.match(await status(page).innerText(),/固定身份已变化/);
    assert.deepEqual(await writes(page),[]);
  });

  test('19 disposal ignores in-flight read/write completion and removes all refresh subscriptions',async t=>{
    const page=await open(t);await detail(page);await page.evaluate(()=>{fixture.holdWrite=true;});
    await switchTrack(page).click();await page.waitForFunction(()=>typeof fixture.releaseWrite==='function');
    await page.evaluate(()=>{fixture.beginRead('late');fixture.dispose();});
    const text=await page.locator('body').innerText();
    const calls=await page.evaluate(()=>fixture.calls.length);
    await finishRead(page,'late',[installed('late',{title:'不得渲染'})]);
    await page.evaluate(async()=>{
      fixture.releaseWrite();await fixture.controller.refresh();
      document.dispatchEvent(new Event('opendesk:page-installation-changed'));
      for(const fn of fixture.changes)fn({'opendesk.page.changed':{}},'local');
      for(const fn of fixture.connections)fn({connected:true});
      document.querySelector('[data-ec-detail-action="toggle"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    });
    assert.equal(await page.locator('body').innerText(),text);
    assert.equal(await page.evaluate(()=>fixture.calls.length),calls);
    assert.equal(await page.evaluate(()=>fixture.changes.size+fixture.connections.size),0);
  });

  test('ACK without setting readback does not claim success',async t=>{
    const page=await open(t);await detail(page);await page.evaluate(()=>{fixture.writeMode='ack';});
    await switchTrack(page).click();await idle(page);
    assert.match(await status(page).innerText(),/尚未由 Page Authority 读回确认/);
    assert.equal((await writes(page)).length,1);
  });

  test('a newer Authority generation with the requested switch state does not confirm this operation',async t=>{
    const page=await open(t,[installed()],true);await detail(page);
    await page.evaluate(()=>{fixture.deferRead('newer-generation');});
    await toggle(page).press('Space');
    await page.waitForFunction(()=>fixture.calls.at(-1)?.name==='listPagePrograms'&&
      fixture.calls.some(call=>call.name==='setInstalledPageEnabled'));
    await page.evaluate(()=>{
      fixture.rows[0].authorization.generation++;
      fixture.finishRead('newer-generation',fixture.rows);
    });
    await idle(page);
    assert.match(await status(page).innerText(),/尚未由 Page Authority 读回确认/);
    assert.equal(await pageState(page).getAttribute('data-state'),'off');
    assert.equal(await receipt(page).count(),0);
    assert.equal((await writes(page)).length,1);
  });

  test('pending native disable uses a dismissible shared receipt and retains local status without replay',async t=>{
    const page=await open(t,[installed()],true);await detail(page);
    await page.evaluate(()=>{fixture.writeMode='native-pending';});
    const control=toggle(page);
    await control.press('Space');await idle(page);
    assert.match(await receipt(page).innerText(),/原生注销或受管清理仍待核对/);
    assert.equal(await receipt(page).getAttribute('data-type'),'info');
    assert.doesNotMatch(await status(page).textContent(),/已确认停用设置/);
    assert.equal(await control.evaluate(node=>node===document.activeElement),true);
    assert.equal(await pageState(page).getAttribute('data-state'),'pending');
    const dismiss=receipt(page).getByRole('button',{name:'关闭提示'});
    await dismiss.press('Enter');await receipt(page).waitFor({state:'detached'});
    await page.locator('#extension-center-back').click();
    assert.match(await row(page).innerText(),/停用设置已保存.*原生注销待核对/);
    await detail(page);
    assert.equal(await pageState(page).getAttribute('data-state'),'pending');
    await page.evaluate(()=>{fixture.deferRead('refresh');});
    const reads=await page.evaluate(()=>fixture.calls.filter(call=>call.name==='listPagePrograms').length);
    await page.getByRole('button',{name:'刷新可信状态'}).click();
    await page.waitForFunction(reads=>fixture.calls.filter(call=>call.name==='listPagePrograms').length>reads,reads);
    const disabled=installed('page-a',{enabled:false,nativeState:'disabled',
      authorization:{status:'disabled',generation:8,installationId:'installation-page-a'}});
    await page.evaluate(rows=>fixture.finishRead('refresh',rows),[disabled]);
    await page.waitForFunction(()=>fixture.state.detailModel.pageControl.state==='off');
    assert.equal(await receipt(page).count(),0);
    assert.equal((await writes(page)).length,1);
    assert.deepEqual(await page.evaluate(()=>[...new Set(fixture.calls.map(call=>call.name))]),['listPagePrograms','setInstalledPageEnabled']);
  });

  test('list partial disable keeps moved focus and reports its status in the list and detail',async t=>{
    const page=await open(t,[installed()],true);
    await page.evaluate(()=>{fixture.writeMode='native-pending';fixture.deferRead('list-toggle');});
    await action(page,'page-a','more').click();
    await page.getByRole('menuitem',{name:'停用自动运行',exact:true}).click();
    await page.waitForFunction(()=>fixture.calls.at(-1)?.name==='listPagePrograms'&&
      fixture.calls.some(call=>call.name==='setInstalledPageEnabled'));
    const search=page.locator('#extension-center-search');await search.focus();
    await page.evaluate(()=>fixture.finishRead('list-toggle',fixture.rows));await idle(page);
    assert.equal(await search.evaluate(node=>node===document.activeElement),true);
    assert.match(await receipt(page).innerText(),/原生注销或受管清理仍待核对/);
    assert.doesNotMatch(await status(page).textContent(),/已确认停用设置/);
    assert.match(await row(page).innerText(),/停用设置已保存.*原生注销待核对/);
    await detail(page);
    assert.match(await pageState(page).innerText(),/停用设置已保存.*原生注销待核对/);
    assert.equal((await writes(page)).length,1);
  });

  test('cleanup-only disable keeps a read-only recheck and returns keyboard focus to the switch',async t=>{
    const page=await open(t,[installed()],true);await detail(page);
    await page.setViewportSize({width:360,height:640});
    await page.evaluate(()=>{fixture.writeMode='cleanup-pending';});
    await toggle(page).press('Space');await idle(page);
    assert.match(await pageState(page).innerText(),/停用设置已保存.*网页清理待核对/);
    assert.doesNotMatch(await pageState(page).innerText(),/原生注销.*待核对/);
    assert.equal(await receipt(page).getAttribute('data-type'),'info');
    assert.doesNotMatch(await status(page).textContent(),/停用设置|网页清理待核对/);
    await receipt(page).getByRole('button',{name:'关闭提示'}).press('Enter');
    await receipt(page).waitFor({state:'detached'});
    const recheck=page.getByRole('button',{name:'刷新可信状态'});
    const reads=await page.evaluate(()=>{
      fixture.rows[0].managedCleanup={state:'retired'};
      return fixture.calls.filter(call=>call.name==='listPagePrograms').length;
    });
    await recheck.press('Enter');
    await recheck.waitFor({state:'detached'});
    assert.equal(await toggle(page).evaluate(node=>node===document.activeElement),true);
    assert.doesNotMatch(await pageState(page).innerText(),/清理待核对/);
    assert.equal(await receipt(page).count(),0);
    assert.deepEqual(await page.evaluate(reads=>({
      reads:fixture.calls.filter(call=>call.name==='listPagePrograms').length-reads,
      writes:fixture.calls.filter(call=>call.name==='setInstalledPageEnabled').length
    }),reads),{reads:1,writes:1});
  });

  test('detail partial disable keeps focus moved while Authority is pending',async t=>{
    const page=await open(t,[installed()],true);await detail(page);
    await page.evaluate(()=>{fixture.writeMode='native-pending';fixture.deferRead('detail-toggle');});
    await toggle(page).press('Space');
    await page.waitForFunction(()=>fixture.calls.at(-1)?.name==='listPagePrograms'&&
      fixture.calls.some(call=>call.name==='setInstalledPageEnabled'));
    const back=page.locator('#extension-center-back');await back.focus();
    await page.evaluate(()=>fixture.finishRead('detail-toggle',fixture.rows));await idle(page);
    assert.equal(await back.evaluate(node=>node===document.activeElement),true);
    assert.match(await receipt(page).innerText(),/原生注销或受管清理仍待核对/);
    assert.equal((await writes(page)).length,1);
  });

  test('changed manifest/revision/source/installation closes detail; stale-generation native action is rejected',async t=>{
    const page=await open(t);
    for(const field of ['manifestHash','revision','sourceHash','installationId']){
      await detail(page);
      await page.evaluate(async field=>{
        if(field==='installationId')fixture.rows[0].authorization.installationId+='-new';
        else if(field==='revision')fixture.rows[0].revision++;
        else fixture.rows[0][field]=(field==='manifestHash'?'c':'d').repeat(64);
        await fixture.controller.refresh();
      },field);
      assert.equal(await page.locator('#extension-center-list-view').isVisible(),true);
      assert.match(await status(page).innerText(),/固定身份已变化/);
    }
    await detail(page);
    await page.evaluate(async()=>{
      const stale=fixture.state.detailModel.pageControl.onToggle;
      fixture.rows[0].authorization.generation++;await fixture.controller.refresh();
      document.addEventListener('keydown',event=>{
        event.preventDefault();event.stopImmediatePropagation();stale(false,event);
      },{capture:true,once:true});
    });
    await toggle(page).press('Space');
    assert.deepEqual(await writes(page),[]);
  });
});

test('the shared Page action rejects a mismatched installed manifest before any permission or RPC',async()=>{
  let effects=0;
  await assert.rejects(setInstalledPageProgramEnabled({
    row:{programId:'page-a',manifestHash:'c'.repeat(64),installed:installed()},
    api:{permissions:{contains:async()=>{effects++;return true;}}},
    client:{request:async()=>{effects++;}}
  }),{code:'E_PAGE_CHANGED'});
  assert.equal(effects,0);
});

test('a disable record with a different grant cannot stand in for a successful settings write',async()=>{
  const before=installed();
  const error={code:'E_USER_SCRIPTS_UNAVAILABLE',message:'Chrome 用户脚本访问不可用'};
  await assert.rejects(setInstalledPageProgramEnabled({
    row:{programId:before.programId,manifestHash:before.manifestHash,installed:before},
    enabled:false,
    client:{request:async()=>({...before,enabled:false,nativeState:'blocked',error,
      authorization:{status:'disabled',installationId:before.authorization.installationId,generation:9}})}
  }),{code:error.code});
});
