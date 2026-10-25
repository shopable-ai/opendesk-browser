import {test,describe,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';

const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;

// The actual App Shell + ToolHost + controller, including hidden ancestors.
// Only storage/catalog and the sandbox app contents are fixture services.
async function fixture(){
  const view=createSidebarToolsView();
  let app,host;
  app=mountSidebarApp(document,{toolView:view,onNavigate:tab=>app.renderNavigation(tab)});
  const tool={format:SIDEBAR_TOOL_FORMAT,id:'focus-return-test',version:'1.0.0',title:'返回焦点测试',
    description:'isolated fixture',capabilities:['storage.local'],html:'<main>Fixture</main>',css:'',js:'void 0;'};
  const store={[SIDEBAR_TOOL_STORE]:[tool]};
  const enableIO={get:0,set:0,gate:null,release:null};
  async function beforeEnableIO(operation,keys){
    if(!(Array.isArray(keys)?keys:[keys]).includes(SIDEBAR_TOOL_ENABLE_STORE))return;
    enableIO[operation]++;
    const gate=enableIO.gate;
    if(gate?.operation!==operation)return;
    enableIO.gate=null;
    await gate.ready;
    if(gate.fail)throw new Error('Fixture enable storage '+operation+' failed');
  }
  const api={runtime:{getURL:p=>location.origin+'/'+p},storage:{
    local:{async get(keys){await beforeEnableIO('get',keys);return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(store[key])]));},
      async set(values){await beforeEnableIO('set',Object.keys(values));Object.assign(store,structuredClone(values));},async remove(key){delete store[key];}},
    session:{async get(){return {};},async remove(){}},onChanged:{addListener(){},removeListener(){}}}};
  host=createSidebarTools({api,doc:document,view,taskWorkbench:{},fetcher:fetch});
  await host.ready;host.setVisible(true);
  const f={view,app,host,tool,
    enableIO,
    enabled(){return store[SIDEBAR_TOOL_ENABLE_STORE]?.[tool.id]!==false;},
    holdEnableIO(operation,fail=false){
      const ready=new Promise(resolve=>{enableIO.release=resolve;});
      enableIO.gate={operation,fail,ready};
    },
    releaseEnableIO(){enableIO.release();},
    rows(include=true){app.renderRows({rows:include?[{key:'app:'+tool.id,title:tool.title,kind:'app',
      type:'应用',installed:true,description:'fixture',primaryAction:'打开'}]:[],
      busy:false,pendingKey:null,onOpenRow:()=>host.openTool(tool.id),onMore:()=>host.openTool(tool.id)});},
    dispose(){host.dispose();app.dispose();view.dispose();}};
  window.fixture=f;f.rows();
}

describe('IR02 tool return focus after the actual React visibility commit',{
  skip:modulePath?false:'NOT_TESTED: OPENDESK_PLAYWRIGHT_MODULE required'
},()=>{
  let server,browser;
  before(async()=>{
    const {chromium}=await import(modulePath);
    const bundled=await build({stdin:{contents:`import {mountSidebarApp} from './src/ui/react/main.tsx';
      import {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
      import {createSidebarTools} from './src/ui/sidebar-tools.js';
      import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE} from './src/ui/sidebar-tools/package.js';
      import {SIDEBAR_TOOL_ENABLE_STORE} from './src/ui/sidebar-tools/lifecycle.js';
      (${fixture.toString()})().catch(error=>{window.fixtureError=String(error.stack);});`,
      resolveDir:new URL('../../',import.meta.url).pathname,loader:'tsx'},bundle:true,write:false,
      outfile:'focus-return-fixture.js',
      format:'esm',platform:'browser',target:'es2022',logLevel:'silent',plugins:[{name:'raw-css',setup(builder){
        builder.onResolve({filter:/\.css\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path)}));
        builder.onLoad({filter:/\.css\?raw$/},async args=>({contents:await readFile(args.path.slice(0,-4),'utf8'),loader:'text'}));
      }}]});
    const css=(await Promise.all(['design-tokens.css','design-system.css','extension-center.css']
      .map(name=>readFile(new URL('../../src/ui/'+name,import.meta.url),'utf8')))).join('\n');
    server=createServer((req,res)=>{
      const script=req.url==='/app.js',style=req.url==='/style.css',catalog=req.url.includes('catalog.json');
      res.setHeader('Content-Type',script?'text/javascript':style?'text/css':catalog?'application/json':'text/html');
      // Chrome's manifest sandbox supplies the opaque origin in production.
      if(req.url.includes('sandbox.html'))res.setHeader('Content-Security-Policy','sandbox allow-scripts');
      res.end(script?bundled.outputFiles.find(file=>file.path.endsWith('.js')).text:style?css+bundled.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n'):catalog?JSON.stringify({schema:'opendesk.official-tools.releases.v1',
        sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[]}):req.url.includes('sandbox.html')?
        '<!doctype html><script>addEventListener("message",event=>{if(event.data.kind==="load")window.toolInit=event.data;if(event.data.requestId==="dirty-observed")window.dirtyAck=true;});</script><main>Sandbox fixture</main>':
        '<!doctype html><html lang="zh-CN" data-opendesk-tab="tools"><head><link rel="stylesheet" href="/style.css"></head><body><div id="opendesk-react-app"></div><script type="module" src="/app.js"></script></body></html>');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],
      ...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?{executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{})});
  });
  after(async()=>{
    await browser?.close();
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
  async function open(t){
    const page=await browser.newPage(),errors=[];page.setDefaultTimeout(5000);
    page.on('pageerror',error=>errors.push(String(error)));
    t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.fixture||window.fixtureError);
    assert.equal(await page.evaluate(()=>window.fixtureError),undefined);
    await control(page,'main').waitFor({state:'visible'});
    assert.deepEqual(await page.locator('[data-extension-key="app:focus-return-test"]')
      .evaluateAll(nodes=>nodes.map(node=>node.dataset.extensionAction)),['main','more'],
      'the real installed row exposes a main entry and management action; primaryAction is its label');
    return page;
  }
  const control=(page,action)=>page.locator(`[data-extension-key="app:focus-return-test"][data-extension-action="${action}"]`);
  async function assertFocused(page,target){
    await page.locator('#sidebar-tool-list-view').waitFor({state:'visible'});
    await target.waitFor({state:'visible'});
    await page.waitForFunction(node=>node===document.activeElement,await target.elementHandle());
    assert.equal(await page.locator('#sidebar-tool-list-view').isVisible(),true);
    assert.equal(await target.isVisible(),true);
    assert.equal(await target.evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.locator('#sidebar-tool-frame iframe').count(),0);
  }

  async function openSettings(t){
    const page=await open(t);
    await control(page,'main').click();
    await page.locator('#sidebar-tool-settings-open').click();
    await page.locator('#sidebar-tool-settings-view').waitFor({state:'visible'});
    await page.waitForFunction(()=>{
      const button=document.getElementById('sidebar-tool-enable');
      return button&&!button.disabled&&button.getAttribute('aria-checked')==='true';
    });
    return page;
  }
  async function assertSettingsFocus(page,id){
    await page.locator('#'+id).waitFor({state:'visible'});
    await page.waitForFunction(id=>{
      const button=document.getElementById(id);
      return button&&!button.disabled&&button===document.activeElement;
    },id);
    assert.equal(await page.locator('#sidebar-tool-settings-view').isVisible(),true);
    assert.equal(await page.locator('#sidebar-tool-list-view').isVisible(),false);
  }

  test('gear switch retains keyboard focus after busy disables it during stop and resume',async t=>{
    const page=await openSettings(t);
    for(const enabled of [false,true]){
      await page.evaluate(()=>fixture.holdEnableIO('set'));
      await page.locator('#sidebar-tool-enable').press('Space');
      await page.waitForFunction(()=>document.getElementById('sidebar-tool-enable').disabled);
      assert.equal(await page.evaluate(()=>fixture.enabled()),!enabled,'write is still pending');
      await page.evaluate(()=>fixture.releaseEnableIO());
      await page.waitForFunction(enabled=>fixture.enabled()===enabled&&
        fixture.view.getSnapshot().fields['sidebar-tool-enable'].attributes['aria-checked']===String(enabled),enabled);
      await assertSettingsFocus(page,'sidebar-tool-enable');
      assert.equal(await page.locator('#sidebar-tool-enable').getAttribute('aria-checked'),String(enabled));
    }
  });

  test('failed toggle focuses retry; failed and successful keyboard rereads restore focus without replaying the write',async t=>{
    const page=await openSettings(t);
    await page.evaluate(()=>fixture.holdEnableIO('set',true));
    await page.locator('#sidebar-tool-enable').press('Space');
    await page.waitForFunction(()=>document.getElementById('sidebar-tool-enable').disabled);
    await page.evaluate(()=>fixture.releaseEnableIO());
    await assertSettingsFocus(page,'sidebar-tool-enable-retry');
    assert.equal(await page.locator('#sidebar-tool-enable').isVisible(),false,
      'unknown state hides the switch rather than presenting an ordinary ON/OFF value');
    const writes=await page.evaluate(()=>fixture.enableIO.set);
    for(const fail of [true,false]){
      await page.evaluate(fail=>fixture.holdEnableIO('get',fail),fail);
      await page.locator('#sidebar-tool-enable-retry').press('Space');
      await page.waitForFunction(()=>document.getElementById('sidebar-tool-enable-retry').disabled);
      await page.evaluate(()=>fixture.releaseEnableIO());
      await assertSettingsFocus(page,fail?'sidebar-tool-enable-retry':'sidebar-tool-enable');
      assert.equal(await page.evaluate(()=>fixture.enableIO.set),writes,'reread never replays the failed mutation');
      assert.equal(await page.evaluate(()=>fixture.enabled()),true,'failed stop has not changed persisted state');
    }
    assert.equal(await page.locator('#sidebar-tool-enable-retry').isVisible(),false);
    assert.equal(await page.locator('#sidebar-tool-enable').getAttribute('aria-checked'),'true');
  });

  test('Back from the main row entry focuses installed management after the list becomes visible',async t=>{
    const page=await open(t);await control(page,'main').click();
    assert.equal(await page.locator('#sidebar-tool-list-view').isVisible(),false);
    await page.locator('#sidebar-tool-back').click();
    await assertFocused(page,control(page,'more'));
  });

  test('Back resolves the current management node after the installed list is removed and rendered again',async t=>{
    const page=await open(t);
    const original=await control(page,'more').elementHandle();
    await control(page,'main').click();
    await page.evaluate(()=>fixture.rows(false));
    await control(page,'more').waitFor({state:'detached'});
    await page.evaluate(()=>fixture.rows());
    await control(page,'more').waitFor({state:'attached'});
    assert.equal(await original.evaluate(node=>node.isConnected),false);
    await page.locator('#sidebar-tool-back').click();
    await assertFocused(page,control(page,'more'));
  });

  test('Back falls back to the visible search when the original row is no longer present',async t=>{
    const page=await open(t);await control(page,'main').click();
    await page.evaluate(()=>fixture.rows(false));
    await control(page,'main').waitFor({state:'detached'});
    await page.locator('#sidebar-tool-back').click();
    await assertFocused(page,page.locator('#extension-center-search'));
  });

  test('dirty cancel keeps the live tool; explicit Continue returns focus after React reveals the list',async t=>{
    const page=await open(t);await control(page,'main').click();
    const sandbox=await page.locator('#sidebar-tool-frame iframe').elementHandle();
    const frame=await sandbox.contentFrame();await frame.waitForFunction(()=>window.toolInit);
    await frame.evaluate(()=>{const init=window.toolInit;
      const identity={protocol:init.protocol,toolId:init.tool.id,instance:init.instance};
      parent.postMessage({...identity,kind:'edit-state',dirty:true,busy:false},'*');
      parent.postMessage({...identity,kind:'request',requestId:'dirty-observed',operation:'storage.get',payload:{key:'noop'}},'*');
    });
    // The bridge must have observed the actual sandbox message before Back.
    await frame.waitForFunction(()=>window.dirtyAck);
    await page.locator('#sidebar-tool-back').click();
    await page.locator('#sidebar-tool-action-review').waitFor({state:'visible'});
    assert.equal(await page.locator('#sidebar-tool-list-view').isVisible(),false);
    await page.locator('#sidebar-tool-action-cancel').click();
    assert.equal(await page.locator('#sidebar-tool-list-view').isVisible(),false);
    assert.equal(await page.locator('#sidebar-tool-frame iframe').count(),1);
    await page.locator('#sidebar-tool-back').click();
    await page.locator('#sidebar-tool-action-continue').click();
    await assertFocused(page,control(page,'more'));
    assert.equal(await page.locator('#sidebar-tool-action-review').isVisible(),false);
  });
});
