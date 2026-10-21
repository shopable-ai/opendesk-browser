import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

// An isolated browser fixture: actual production controller + React page,
// service doubles only. Never touches the product watcher or installed Chrome.
const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;
async function fixture(){
  const state={rowsModel:{rows:[]},toolbarModel:null,detailModel:null,uninstallModel:null,
    recoveryModel:null,feedbackModel:null,statusModel:null,view:'list',menuKey:null};
  const root=createRoot(document.getElementById('root'));
  const paint=()=>flushSync(()=>root.render(React.createElement(ExtensionCenterPage,state)));
  paint();
  document.getElementById('extension-center-list').dataset.opendeskReactOwner='extension-list';
  const extensionList={owner:'extension-list',
    renderRows(model){state.rowsModel=model;paint();},
    renderToolbar(model){state.toolbarModel=model;paint();},
    renderDetail(model){state.detailModel=model;paint();},
    renderUninstall(model){state.uninstallModel=model;paint();},
    renderRecoveries(model){state.recoveryModel=model;paint();},
    renderFeedback(model){state.feedbackModel=model;paint();},
    renderStatus(model){state.statusModel=model;paint();},
    renderView(view){state.view=view;paint();},
    connectBack(fn){state.onBack=fn;paint();},
    setMenuKey(key){state.menuKey=key;paint();},
    renderRowMenu(items,options){state.rowMenuModel=options?{...options,items}:null;paint();}
  };
  const app={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',title:'快速笔记',description:'记录内容',
    version:'1.0.0',capabilities:['storage.local'],html:'<main>Notes</main>',css:'',js:'void 0;'};
  const page={programId:'reader',manifestHash:'a'.repeat(64),installed:{title:'阅读增强',
    revision:1,manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),enabled:true,
    nativeState:'registered',authorization:{status:'active',generation:5,
      installationId:'fixture-page-install-1'},
    pageRules:{matches:['https://example.com/*']}}};
  const store={[SIDEBAR_TOOL_STORE]:[app],[SIDEBAR_TOOL_ENABLE_STORE]:{[app.id]:true}};
  const changes=new Set(),connections=new Set(),calls=[];
  let lastNativeEvent;
  const eventCall=(action,id,event)=>{lastNativeEvent=event;calls.push({action,id,native:event instanceof MouseEvent,
    trusted:event?.isTrusted,gesture:navigator.userActivation.isActive});};
  let corrupt=false,ackOnly=false,holdToggle=false,finishToggle,pageInstalled=true;
  const api={runtime:{getURL:path=>location.origin+'/'+path},tabs:{create:async value=>calls.push(value)},
    permissions:{contains:async()=>true,request:async()=>{throw Error('unexpected permission');}},
    storage:{local:{get:async keys=>{if(corrupt)throw Error('storage unavailable');
      return Object.fromEntries(keys.map(key=>[key,structuredClone(store[key])]))}},
      onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}}};
  const client={subscribeConnection(fn){connections.add(fn);return ()=>connections.delete(fn);},
    async request(method,args){
      if(method==='listPagePrograms')return {installed:pageInstalled?
        structuredClone([{programId:page.programId,...page.installed}]):[]};
      if(method==='uninstallPageProgram'){
        calls.push({action:'page-uninstall',args});
        if(!pageInstalled||args.programId!==page.programId||
          args.manifestHash!==page.manifestHash||
          args.installationId!==page.installed.authorization.installationId||
          args.expectedGeneration!==page.installed.authorization.generation)
          throw Object.assign(Error('Page identity changed'),{code:'E_PAGE_IDENTITY'});
        pageInstalled=false;
        return {uninstalled:true,nativeState:'unregistered',manifestHash:page.manifestHash,
          installationId:args.installationId,managedCleanup:{state:'retired'}};
      }
      if(method!=='setInstalledPageEnabled')throw Error(method);
      calls.push({action:'page-toggle',args});
      if(!ackOnly){page.installed.enabled=args.enabled;page.installed.authorization.generation++;}
      return {enabled:args.enabled};
    }};
  const sidebarTools={openTool:id=>{calls.push({action:'open',id});return true;},
    openSettings:id=>calls.push({action:'settings',id}),openImport:()=>calls.push({action:'import'}),
    openImportFiles:files=>{calls.push({action:'drop',names:Array.from(files).map(file=>file.name)});return true;},
    openOfficialReview:()=>false,
    uninstallFromList(id,baseline,event){
      eventCall('app-uninstall',id,event);
      const original=store[SIDEBAR_TOOL_STORE].find(item=>item.id===id);
      if(!original||baseline?.id!==id||original.version!==baseline.version||
         original.html!==baseline.html)
        throw Object.assign(Error('App identity changed'),{code:'E_TOOL_CHANGED'});
      store[SIDEBAR_TOOL_STORE]=store[SIDEBAR_TOOL_STORE].filter(item=>item.id!==id);
      return Promise.resolve(true);
    },
    toggleEnabled(id,event){eventCall('toggle',id,event);
      const finish=()=>{store[SIDEBAR_TOOL_ENABLE_STORE][id]=!store[SIDEBAR_TOOL_ENABLE_STORE][id];return true;};
      return holdToggle?new Promise(resolve=>{finishToggle=()=>resolve(finish());}):Promise.resolve(finish());},
    retryUninstallCleanup(id,event){eventCall('cleanup',id,event);store[TOOL_CLEANUP_STORE]={};
      return Promise.resolve({state:'cleaned',toolId:id});}};
  const controller=createExtensionCenter({api,client,doc:document,sidebarTools,extensionList,
    taskWorkbench:{navigate:tab=>{calls.push({action:'navigate',tab});return true;}}});
  window.fixture={state,calls,store,page,changes,connections,controller,
    installedApps:()=>store[SIDEBAR_TOOL_STORE],
    pageInstalled:()=>pageInstalled,nativeEvent:()=>lastNativeEvent,
    setCorrupt:value=>{corrupt=value;},setAckOnly:value=>{ackOnly=value;},
    hold:()=>{holdToggle=true;},release:()=>finishToggle(),
    dispose(){controller.dispose();root.unmount();},
    cleanup(id='quick-notes'){store[SIDEBAR_TOOL_STORE]=[];store[TOOL_CLEANUP_STORE]={
      [id]:{version:app.version,createdAt:1}};},
  };
  await controller.refresh();
}

async function browserFixture(t){
  const css=(await Promise.all(['design-tokens.css','design-system.css','extension-center.css']
    .map(name=>readFile(new URL('../../src/ui/'+name,import.meta.url),'utf8')))).join('\n');
  const {chromium}=await import(modulePath);
  const bundled=await build({stdin:{contents:`import React from 'react';
    import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {ExtensionCenterPage} from './src/ui/react/tabs/tools.tsx';
    import {createExtensionCenter} from './src/ui/extension-center.js';
    import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE} from './src/ui/sidebar-tools/package.js';
    import {SIDEBAR_TOOL_ENABLE_STORE} from './src/ui/sidebar-tools/lifecycle.js';
    import {TOOL_CLEANUP_STORE} from './src/ui/sidebar-tools/installation.js';
    (${fixture.toString()})();`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,
    format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/style.css'?'text/css':req.url.includes('catalog.json')?'application/json':'text/html');
    res.end(req.url==='/style.css'?css:req.url==='/app.js'?bundled.outputFiles[0].text:req.url.includes('catalog.json')?
      JSON.stringify({schema:'opendesk.official-tools.releases.v1',sourceRepository:'https://github.com/shopable-ai/opendesk-browser',
        apps:[{id:'opendesk/quick-notes',toolId:'quick-notes',kind:'sidebar-tool',installationPolicy:'optional',version:'1.0.0',
          packageTitle:'快速笔记',description:'记录内容',capabilities:['storage.local'],packagePath:'official-tools/quick-notes/quick-notes.opendesk-tool.json',bytes:100,sha256:'c'.repeat(64)}]}):
      '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="workspace-content"><div id="root"></div></div><script type="module" src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
    ...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?{executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  // Keep hit-testing deterministic; motion has separate preview/native coverage.
  const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('[data-extension-id="page:reader"]').waitFor().catch(async error=>{
    throw Error(String(error)+'\nFIXTURE_DIAGNOSTICS '+JSON.stringify({errors,state:await page.evaluate(()=>({text:document.body.innerText,fixture:typeof window.fixture}))}));
  });
  t.after(()=>assert.deepEqual(errors,[]));return page;
}
const options={skip:modulePath?false:'NOT_TESTED: set OPENDESK_PLAYWRIGHT_MODULE to an existing Playwright installation'};
// A desktop action intentionally has no pointer target until its row is active.
async function clickRowMore(button){
  await button.locator('..').locator('..').hover();
  await button.click();
}
async function chooseListUninstall(page,key){
  await clickRowMore(page.locator('[data-extension-key="'+key+'"][data-extension-action="more"]'));
  await page.locator('#extension-center-row-menu [data-ec-context-action="uninstall"]').click();
}

test('React page preserves list, search/filter, detail identity and native Page actions',options,async t=>{
  const page=await browserFixture(t);
  await page.locator('[data-extension-key="app:quick-notes"][data-extension-action="main"]').click();
  assert.equal(await page.evaluate(()=>fixture.calls.filter(x=>x.action==='open').length),1);
  await page.locator('#extension-center-search').fill('阅读');
  assert.equal(await page.locator('#extension-center-list > li').count(),1);
  await page.locator('[data-extension-key="page:reader"][data-extension-action="main"]').click();
  assert.equal(await page.locator('#extension-center-detail').isVisible(),true);
  assert.match(await page.locator('.ec-sites').innerText(),/https:\/\/example.com\/\*/);
  await page.locator('#extension-center-back').click();
  await page.locator('[data-extension-key="page:reader"][data-extension-action="more"]').click();
  await page.locator('#extension-center-row-menu').getByRole('menuitem',{name:'查看详情',exact:true}).click();
  assert.equal(await page.locator('#extension-center-detail').isVisible(),true);
  await page.locator('[data-ec-detail-action="toggle"]').click();
  await page.waitForFunction(()=>fixture.page.installed.enabled===false&&fixture.state.detailModel?.busy===false)
    .catch(async error=>{throw new Error(String(error)+'\nTOGGLE_READBACK '+JSON.stringify(await page.evaluate(()=>({
      installed:fixture.page.installed,calls:fixture.calls,detail:fixture.state.detailModel,
      status:fixture.state.statusModel,text:document.body.innerText
    }))));});
  assert.equal(await page.locator('[data-ec-detail-action="toggle"]').evaluate(node=>node===document.activeElement),true);
  assert.equal(await page.evaluate(()=>fixture.calls.find(x=>x.action==='page-toggle').args.expectedGeneration),5);
  await page.evaluate(()=>{fixture.setAckOnly(true);});
  await page.locator('[data-ec-detail-action="toggle"]').click();
  await page.waitForFunction(()=>fixture.state.statusModel?.text.includes('读回确认'));
  await page.evaluate(async()=>{fixture.page.installed.revision++;fixture.page.installed.sourceHash='d'.repeat(64);await fixture.controller.refresh();});
  assert.equal(await page.locator('#extension-center-list-view').isVisible(),true);
  assert.match(await page.locator('#extension-center-status').innerText(),/固定身份已变化/);
  await page.locator('#extension-center-search').fill('');
  await page.locator('#extension-center-more').click();
  await page.locator('[data-ec-kind="page"]').click();
  assert.equal(await page.locator('#extension-center-list > li').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#extension-center-menu').isVisible(),false);
  await page.locator('#extension-center-more').click();
  await page.locator('#extension-center-reset').click();
  assert.equal(await page.locator('#extension-center-list > li').count(),2);
  await page.evaluate(async()=>{fixture.setCorrupt(true);await fixture.controller.refresh();});
  assert.equal(await page.locator('[data-extension-id="app:quick-notes"]').count(),0);
  assert.equal(await page.locator('#extension-center-count').innerText(),'部分安装状态待核对');
  await page.evaluate(()=>fixture.dispose());
  assert.equal(await page.evaluate(()=>fixture.changes.size+fixture.connections.size),0);
});

test('The last hovered or focused installed row keeps the only desktop More button',options,async t=>{
  const page=await browserFixture(t);
  const app=page.locator('[data-extension-id="app:quick-notes"]');
  const reader=page.locator('[data-extension-id="page:reader"]');
  const active=()=>page.locator('#extension-center-list .ec-row--action-visible');
  const opacity=locator=>locator.locator('.ec-row-actions').evaluate(node=>getComputedStyle(node).opacity);
  assert.equal(await active().count(),1,'exactly one menu visible when the list first loads');
  assert.equal(await active().getAttribute('data-extension-id'),'app:quick-notes');
  assert.equal(await opacity(app),'1');
  assert.equal(await opacity(reader),'0');
  await reader.hover();
  await page.waitForFunction(()=>document.querySelector('.ec-row--action-visible')?.dataset.extensionId==='page:reader');
  await page.locator('#extension-center-search').hover();
  assert.equal(await active().count(),1,'moving away must not clear the last visible control');
  assert.equal(await opacity(reader),'1');
  assert.equal(await opacity(app),'0','previous row menu must disappear');
  await app.hover();
  await page.waitForFunction(()=>document.querySelector('.ec-row--action-visible')?.dataset.extensionId==='app:quick-notes');
  await page.locator('#extension-center-search').hover();
  assert.equal(await opacity(app),'1','the last hovered row remains pinned when pointer leaves');
  assert.equal(await opacity(reader),'0');
  await reader.locator('[data-extension-action="main"]').focus();
  await page.waitForFunction(()=>document.querySelector('.ec-row--action-visible')?.dataset.extensionId==='page:reader');
  assert.equal(await opacity(reader),'1','keyboard focus also moves the discoverable control');
  await reader.locator('[data-extension-action="more"]').click();
  assert.equal(await page.locator('#extension-center-row-menu').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await active().getAttribute('data-extension-id'),'page:reader');
  await page.locator('#extension-center-search').fill('阅读');
  assert.equal(await page.locator('#extension-center-list > li').count(),1);
  assert.equal(await active().getAttribute('data-extension-id'),'page:reader');
  await page.locator('#extension-center-search').fill('');
  assert.equal(await active().count(),1,'restoring search must not show multiple pinned menus');
  assert.equal(await active().getAttribute('data-extension-id'),'page:reader');
});

test('React row menu preserves native gestures, keyboard/outside close, pending and disposal',options,async t=>{
  const page=await browserFixture(t);
  const more=page.locator('[data-extension-key="app:quick-notes"][data-extension-action="more"]');
  await clickRowMore(more);
  const menu=page.locator('#extension-center-row-menu');await menu.waitFor();
  assert.equal(await menu.getByRole('menuitem').first().evaluate(node=>node===document.activeElement),true,
    'first menu item receives focus on opening');
  await page.keyboard.press('End');
  assert.equal(await menu.getByRole('menuitem').last().evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('Home');
  assert.equal(await menu.getByRole('menuitem').first().evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('ArrowUp');
  assert.equal(await menu.getByRole('menuitem').last().evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await menu.getByRole('menuitem').first().evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await menu.count(),0);
  assert.equal(await more.evaluate(node=>node===document.activeElement),true);
  await clickRowMore(more);await page.keyboard.press('Tab');assert.equal(await menu.count(),0);
  await clickRowMore(more);await page.locator('#extension-center-search').click();assert.equal(await menu.count(),0);
  await clickRowMore(more);await page.evaluate(()=>document.dispatchEvent(new Event('scroll')));assert.equal(await menu.count(),0);
  await clickRowMore(more);
  await menu.locator('[data-ec-context-action="toggle"]').evaluate(node=>node.click());
  assert.equal(await page.evaluate(()=>fixture.calls.filter(x=>x.action==='toggle').length),0);
  await page.evaluate(()=>fixture.hold());
  await menu.locator('[data-ec-context-action="toggle"]').click();
  assert.equal(await page.locator('#extension-center-list button:enabled').count(),0);
  assert.deepEqual(await page.evaluate(()=>fixture.calls.find(x=>x.action==='toggle')),
    {action:'toggle',id:'quick-notes',native:true,trusted:true,gesture:true});
  assert.deepEqual(await page.evaluate(()=>{
    const event=fixture.nativeEvent();
    return {type:event.type,trusted:event.isTrusted,action:event.target.dataset.ecContextAction};
  }),{type:'click',trusted:true,action:'toggle'});
  await page.evaluate(()=>fixture.release());
  await page.waitForFunction(()=>fixture.state.rowsModel.busy===false);
  assert.equal(await page.locator('#extension-center-status').innerText(),'已从本机安装记录确认应用停用。');
  await clickRowMore(more);await menu.locator('[data-ec-context-action="detail"]').click();
  assert.equal(await page.locator('#extension-center-detail').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#extension-center-list-view').isVisible(),true);
  await clickRowMore(more);await menu.locator('[data-ec-context-action="settings"]').click();
  assert.equal(await page.evaluate(()=>fixture.calls.filter(x=>x.action==='settings').length),1);
  await clickRowMore(more);
  await page.evaluate(()=>{
    window.stale={onClick:fixture.state.rowMenuModel.items[0].onClick,event:fixture.nativeEvent()};
    fixture.dispose();
  });
  assert.equal(await menu.count(),0);
  await page.evaluate(()=>{
    if(!stale.event.isTrusted)throw Error('Disposal must also reject the previously trusted native event');
    stale.onClick(stale.event);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    document.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    document.dispatchEvent(new Event('scroll'));
  });
  assert.equal(await page.evaluate(()=>fixture.calls.filter(x=>x.action==='toggle').length),1);
  assert.equal(await page.evaluate(()=>fixture.changes.size+fixture.connections.size),0);
});

test('R5.11 App overflow opens one modal; cancel/Escape preserve state, confirm binds native gesture and persists removal',options,async t=>{
  const page=await browserFixture(t);
  assert.equal(await page.locator('[data-extension-action="uninstall"]').count(),0,
    'No destructive control appears on a list row');
  await chooseListUninstall(page,'app:quick-notes');
  const modal=page.locator('.od-uninstall-dialog[aria-modal="true"]');
  await modal.waitFor();
  assert.equal(await modal.count(),1,'The list opens exactly one shared confirmation');
  assert.match(await modal.getByRole('heading').innerText(),/快速笔记/);
  assert.equal(await modal.locator('[data-uninstall-cancel]').evaluate(node=>document.activeElement===node),true,
    'Cancel receives initial focus');
  await page.keyboard.press('Escape');
  assert.equal(await modal.count(),0,'Escape closes without removing anything');
  assert.equal(await page.evaluate(()=>fixture.installedApps().length),1);
  await chooseListUninstall(page,'app:quick-notes');
  await modal.locator('[data-uninstall-cancel]').click();
  assert.equal(await page.evaluate(()=>fixture.installedApps().length),1);
  assert.equal(await page.evaluate(()=>fixture.calls.filter(row=>row.action==='app-uninstall').length),0);
  await chooseListUninstall(page,'app:quick-notes');
  await modal.getByRole('button',{name:'确认卸载'}).click();
  await page.waitForFunction(()=>fixture.state.uninstallModel===null&&
    !document.querySelector('[data-extension-id="app:quick-notes"]'));
  assert.equal(await page.evaluate(()=>fixture.installedApps().length),0);
  assert.deepEqual(await page.evaluate(()=>fixture.calls.filter(row=>row.action==='app-uninstall')),
    [{action:'app-uninstall',id:'quick-notes',native:true,trusted:true,gesture:true}],
    'Only one trusted gesture reaches the existing App Host facade');
  assert.match(await page.locator('#extension-center-status').innerText(),/读回确认卸载/);
  await page.evaluate(()=>fixture.controller.refresh());
  assert.equal(await page.locator('[data-extension-id="app:quick-notes"]').count(),0);
});

test('R5.11 Page overflow opens one confirmation; fixed generation is passed to original authority and read back',options,async t=>{
  const page=await browserFixture(t);
  assert.equal(await page.locator('[data-extension-action="uninstall"]').count(),0);
  await chooseListUninstall(page,'page:reader');
  const modal=page.locator('.od-uninstall-dialog[aria-modal="true"]');
  await modal.waitFor();
  assert.match(await modal.innerText(),/阅读增强/);
  await modal.getByRole('button',{name:'取消'}).click();
  assert.equal(await page.evaluate(()=>fixture.calls.filter(row=>row.action==='page-uninstall').length),0);
  await chooseListUninstall(page,'page:reader');
  await modal.getByRole('button',{name:'确认卸载'}).click();
  await page.waitForFunction(()=>fixture.state.uninstallModel===null&&
    !document.querySelector('[data-extension-id="page:reader"]'));
  assert.deepEqual(await page.evaluate(()=>fixture.calls.filter(row=>row.action==='page-uninstall')),
    [{action:'page-uninstall',args:{programId:'reader',manifestHash:'a'.repeat(64),
      installationId:'fixture-page-install-1',expectedGeneration:5}}]);
  assert.equal(await page.evaluate(()=>fixture.pageInstalled()),false);
  assert.match(await page.locator('#extension-center-status').innerText(),/Page Authority 回执/);
  await page.evaluate(()=>fixture.controller.refresh());
  assert.equal(await page.locator('[data-extension-key="page:reader"][data-extension-action="uninstall"]').count(),0);
});

test('R5.6 changes to Page installation identity invalidate the opened list dialog before dispatch',options,async t=>{
  const page=await browserFixture(t);
  await chooseListUninstall(page,'page:reader');
  await page.evaluate(async()=>{
    fixture.page.installed.authorization.generation++;
    await fixture.controller.refresh();
  });
  assert.equal(await page.locator('.od-uninstall-dialog').count(),0);
  assert.equal(await page.evaluate(()=>fixture.calls.filter(row=>row.action==='page-uninstall').length),0);
  assert.match(await page.locator('#extension-center-status').innerText(),/卸载确认已失效/);
});

test('React orphaned cleanup recovery retains trusted native events while catalog is unavailable',options,async t=>{
  const page=await browserFixture(t);
  await page.evaluate(async()=>{fixture.cleanup('local-only');await fixture.controller.refresh();});
  await page.locator('#extension-center-more').click();
  await page.locator('[data-ec-scope="available"]').click();
  await page.keyboard.press('Escape');
  const cleanup=page.getByRole('button',{name:'恢复「local-only」的卸载清理'});
  await cleanup.evaluate(node=>node.click());
  assert.equal(await page.evaluate(()=>fixture.calls.filter(x=>x.action==='cleanup').length),0);
  await cleanup.click();
  await page.waitForFunction(()=>fixture.state.rowsModel.busy===false&&fixture.calls.some(x=>x.action==='cleanup'));
  assert.deepEqual(await page.evaluate(()=>fixture.calls.find(x=>x.action==='cleanup')),
    {action:'cleanup',id:'local-only',native:true,trusted:true,gesture:true});
  assert.equal(await page.locator('#extension-center-cleanups').isVisible(),false);
  assert.equal(await page.locator('#extension-center-status').innerText(),
    '已从存储读回确认卸载清理完成；需要重新安装时请主动审阅。');
  assert.equal(await page.locator('[data-ec-detail-action="install"]').count(),0);
  await page.evaluate(()=>fixture.dispose());
  assert.equal(await page.evaluate(()=>fixture.changes.size+fixture.connections.size),0);
});


test('Extension tab accepts a native file drag and forwards only files to its trusted installer',options,async t=>{
  const page=await browserFixture(t);
  await page.evaluate(()=>{
    const target=document.getElementById('extension-center-list-view');
    const data=new DataTransfer();
    data.items.add(new File(['{"format":"sample"}'],'demo.opendesk-tool.json',{type:'application/json'}));
    window.dragFixture={target,data};
    target.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:data}));
  });
  assert.equal(await page.locator('.ec-file-drop-overlay').count(),1);
  assert.match(await page.locator('.ec-file-drop-overlay').innerText(),/安装前仍需核对/);
  await page.evaluate(()=>{
    const {target,data}=window.dragFixture;
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
  });
  assert.equal(await page.locator('.ec-file-drop-overlay').count(),0);
  assert.deepEqual(await page.evaluate(()=>fixture.calls.filter(c=>c.action==='drop')
    .map(c=>c.names)),[['demo.opendesk-tool.json']]);
  assert.equal(await page.evaluate(()=>fixture.calls.some(c=>c.action==='install')),false);
  await page.evaluate(()=>{
    const target=document.getElementById('extension-center-list-view');
    const data=new DataTransfer();data.setData('text/plain','ordinary text');
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
  });
  assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.action==='drop').length),1,
    'non-file text drags must not trigger the importer');
});

