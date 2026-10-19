import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';

const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;

test('R37 empty official root renders pages, dispatches input/actions and releases subscriptions',
  {skip:modulePath?false:'NOT_TESTED: OPENDESK_PLAYWRIGHT_MODULE required'},async t=>{
  const {chromium}=await import(modulePath);
  const entry=`import {mountSidebarApp} from './src/ui/react/main.tsx';
    import {createDeveloperView} from './src/ui/develop-view.js';
    import {createMyWorkbenchView} from './src/ui/my-workbench-view.js';
    import {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
    const calls=[];let subscriptions=0;
    const observe=view=>({...view,subscribe:fn=>{subscriptions++;const off=view.subscribe(fn);return ()=>{subscriptions--;off();};}});
    const makeViews=()=>({developerView:observe(createDeveloperView()),myView:observe(createMyWorkbenchView()),toolView:observe(createSidebarToolsView())});
    const {developerView,myView,toolView}=makeViews();
    let app;app=mountSidebarApp(document,{developerView,myView,toolView,debugEnabled:false,
      onNavigate:tab=>{calls.push(tab);app.renderNavigation(tab);}});
    window.fixture={app,calls,developerView,myView,toolView,makeViews,mount:mountSidebarApp,get subscriptions(){return subscriptions;},
      duplicate(){try{mountSidebarApp(document,{onNavigate(){}});}catch(error){return error.message;}},
      dispose(){app.dispose();developerView.dispose();toolView.dispose();}};`;
  const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'r37-fixture.tsx',loader:'tsx'},
    bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',
    plugins:[{name:'raw-css',setup(builder){builder.onLoad({filter:/\.css\?raw$/},async args=>({contents:await readFile(args.path.slice(0,-4),'utf8'),loader:'text'}));
      builder.onResolve({filter:/\.css\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path)}));}}]});
  const server=createServer((request,response)=>{
    response.setHeader('Content-Type',request.url==='/app.js'?'text/javascript':'text/html');
    response.end(request.url==='/app.js'?bundled.outputFiles[0].text:
      '<!doctype html><html lang="zh-CN"><body><div id="opendesk-react-app"></div><script type="module" src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({headless:true,...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?{executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
  t.after(()=>browser.close());
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>{errors.push(String(error));console.error('R37_PAGE_ERROR',String(error));});
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.locator('#tab-my-tasks').waitFor({state:'attached',timeout:5000}).catch(async error=>{
    throw new Error(String(error)+'\n'+JSON.stringify(errors)+'\n'+(await page.content()).slice(0,4500));
  });
  for(const tab of ['tasks','tools','workflow','develop','cloud']){
    assert.equal(await page.locator('[data-workbench-tab="'+tab+'"]').count(),1);
    assert.equal(await page.locator('[data-workbench-page="'+tab+'"]').count(),1);
  }
  assert.equal(await page.locator('#tab-debug').isVisible(),false);
  await page.locator('#tab-develop').click();
  await page.locator('#script-source').fill('async function main() { return "中文输入"; }');
  const value=await page.locator('#script-source').inputValue();
  await page.locator('#tab-tools').click();await page.locator('#tab-develop').click();
  assert.equal(await page.locator('#script-source').inputValue(),value);
  assert.deepEqual(await page.evaluate(()=>window.fixture.calls),['develop','tools','develop']);
  await page.evaluate(()=>window.fixture.myView.setText('task-status','来自原业务状态'));
  await page.locator('#tab-my-tasks').click();
  await page.waitForFunction(()=>document.getElementById('task-status').textContent==='来自原业务状态');
  assert.ok(await page.evaluate(()=>window.fixture.subscriptions)>0);
  assert.match(await page.evaluate(()=>window.fixture.duplicate()),/E_REACT_APP_MOUNT/);
  assert.match(await page.evaluate(()=>{try{window.fixture.app.renderNavigation('debug');}catch(error){return error.message;}}),
    /E_REACT_NAVIGATION_SNAPSHOT/,'production cannot expose Debug through an injected tab snapshot');
  await page.evaluate(()=>window.fixture.dispose());
  assert.equal(await page.locator('#opendesk-react-app').evaluate(node=>node.childElementCount),0);
  assert.equal(await page.evaluate(()=>window.fixture.subscriptions),0);
  assert.match(await page.evaluate(()=>{
    const root=document.getElementById('opendesk-react-app');
    root.append(document.createElement('nav'));
    return window.fixture.duplicate();
  }),/E_REACT_APP_MOUNT/,'reintroduced static business DOM must fail instead of being adopted');
  assert.deepEqual(errors,[]);
  for(const mode of ['paint','owner','initialize','onHide'])await t.test('rollback after '+mode,async t=>{
    const failurePage=await browser.newPage(),uncaught=[];
    t.after(()=>failurePage.close());
    failurePage.on('pageerror',error=>uncaught.push(String(error)));
    await failurePage.goto('http://127.0.0.1:'+server.address().port+'/');
    await failurePage.waitForFunction(()=>!!window.fixture);
    const result=await failurePage.evaluate(mode=>{
      const fixture=window.fixture;fixture.dispose();
      const views=fixture.makeViews(),mount=document.getElementById('opendesk-react-app');
      const snapshot=()=>({children:mount.childElementCount,subscriptions:fixture.subscriptions,
        runtime:views.toolView.resourceSnapshot()});
      const getSnapshot=views.developerView.getSnapshot,getElementById=document.getElementById;
      let disposals=0,failure=null,retryError=null;
      if(mode==='paint')views.developerView.getSnapshot=()=>{throw new Error('E_TEST_PAINT');};
      if(mode==='owner')document.getElementById=function(id){
        return id==='extension-center-list'?null:getElementById.call(this,id);
      };
      if(mode==='initialize'){
        const facade=views.toolView.connect(()=>{
          const frame=document.createElement('iframe');views.toolView.runtime.frameRoot.append(frame);
          return {ready:Promise.resolve(),setVisible(){throw new Error('E_TEST_INITIALIZE');},
            dispose(){disposals++;frame.remove();}};
        });
        facade.setVisible(true);
      }
      try{
        const app=fixture.mount(document,{...views,onNavigate(){}});
        if(mode==='onHide'){
          app.renderCloudPage({overview:{},authorization:{},pairing:{},clients:{},requests:{},
            onHide(){throw new Error('E_TEST_ON_HIDE');}});
          app.dispose();
        }
      }catch(error){failure=error.message;}
      finally{
        views.developerView.getSnapshot=getSnapshot;document.getElementById=getElementById;
      }
      const failed=snapshot();
      try{fixture.mount(document,{...views,onNavigate(){}}).dispose();}
      catch(error){retryError=error.message;}
      const recovered=snapshot();
      for(const view of Object.values(views))view.dispose?.();
      return {failure,failed,retryError,recovered,disposals};
    },mode);
    assert.match(result.failure,/E_TEST_PAINT|E_TEST_INITIALIZE|E_TEST_ON_HIDE|E_REACT_EXTENSION_MOUNT/);
    const empty={children:0,subscriptions:0,runtime:{subscriptions:0,bindings:0,runtime:false,controllers:0,effects:0}};
    assert.deepEqual(result.failed,empty,'failed mount/dispose must release the real root and runtime');
    assert.equal(result.retryError,null,'the same document and caller-owned Views must be reusable');
    assert.deepEqual(result.recovered,empty,'remounted root must clean up normally');
    assert.equal(result.disposals,mode==='initialize'?1:0,'the failed controller is disposed exactly once');
    assert.ok(uncaught.every(message=>message.includes('E_TEST_PAINT')||message.includes('E_TEST_INITIALIZE')),
      'only the injected React errors may escape: '+JSON.stringify(uncaught));
  });
});
