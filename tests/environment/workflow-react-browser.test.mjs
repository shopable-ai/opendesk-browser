import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
// Opt in to an existing Playwright installation. Never install packages, start
// the product watcher, write dist, or change an installed browser extension.
const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;
test('workflow React browser: edit, save/reopen, run/error/Stop, Tab return, focus and disposal',
  {skip:modulePath?false:'NOT_TESTED: set OPENDESK_PLAYWRIGHT_MODULE to an available Playwright module'},async t=>{
  const {chromium}=await import(modulePath);
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
    import {WorkflowPage} from './src/ui/react/tabs/workflow.tsx';
    import {workflowFixture} from './tests/environment/workflow-react-fixture.mjs';
    const root=createRoot(document.getElementById('root'));
    const fixture=await workflowFixture();window.fixture=fixture;
    function App(){const [active,setActive]=React.useState(true);return <>
      <button id="switch-tab" onClick={()=>setActive(value=>!value)}>切换测试页签</button>
      <WorkflowPage controller={fixture.view} active={active}/>
      <div id="other-tab" hidden={active}>其他页签</div>
    </>;}
    root.render(<App/>);window.unmount=()=>root.unmount();`;
  const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'workflow-browser-fixture.tsx',loader:'tsx'},
    bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  const styles=await Promise.all(['src/ui/design-tokens.css','src/ui/design-system.css','src/ui/tool-shell.css'].map(path=>readFile(path,'utf8')));
  const server=createServer((request,response)=>{
    response.setHeader('Content-Type',request.url==='/app.js'?'text/javascript':request.url==='/style.css'?'text/css':'text/html');
    response.end(request.url==='/app.js'?bundled.outputFiles[0].text:request.url==='/style.css'?styles.join('\n'):
      '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({headless:true,...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?{executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
  t.after(()=>browser.close());const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#workflow-run:not([disabled])').waitFor();
  assert.equal(await page.locator('#workbench-workflow').count(),1);
  await page.locator('#workflow-edit-details').click();
  await page.locator('#workflow-manage-panel > details').first().locator('summary').click();
  await page.locator('#workflow-title').fill('React 保存版本');
  await page.locator('#workflow-description').fill('切页保留草稿');
  await page.locator('#switch-tab').click();assert.equal(await page.locator('#workbench-workflow').isVisible(),false);
  await page.locator('#switch-tab').click();assert.equal(await page.locator('#workflow-title').inputValue(),'React 保存版本');
  assert.equal(await page.locator('#workflow-description').inputValue(),'切页保留草稿');
  await page.locator('#workflow-save:not([disabled])').click();
  await page.waitForFunction(()=>window.fixture.local.size===1);
  const key=await page.evaluate(()=>[...window.fixture.local.keys()][0]);
  await page.locator('#workflow-new').click();
  await page.locator('#workflow-history-toggle').click();
  await page.getByRole('button',{name:'React 保存版本'}).click();
  await page.waitForFunction(()=>window.fixture.view.getSnapshot().steps.length===1);
  assert.equal(await page.locator('#workflow-new-review').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.fixture.view.getSnapshot().controls['workflow-title'].value),'React 保存版本');
  await page.locator('#workflow-run:not([disabled])').click();
  await page.waitForFunction(()=>window.fixture.view.getSnapshot().lastRun==='success');
  assert.match(await page.locator('#workflow-output').innerText(),/执行结果/);
  assert.equal(await page.evaluate(()=>window.fixture.starts[0].source.kind),'saved');
  await page.evaluate(()=>{window.fixture.service.fail=true;});
  await page.locator('#workflow-run:not([disabled])').click();
  await page.waitForFunction(()=>window.fixture.view.getSnapshot().lastRun==='failed');
  assert.match(await page.locator('#workflow-output').innerText(),/E_FIXTURE/);
  await page.evaluate(()=>{window.fixture.service.fail=false;window.fixture.service.hold=true;});
  await page.locator('#workflow-run:not([disabled])').click();
  await page.locator('#workflow-stop:not([disabled])').waitFor();
  await page.locator('#switch-tab').click();await page.locator('#switch-tab').click();
  assert.equal(await page.locator('#workflow-stop').isEnabled(),true);
  await page.locator('#workflow-stop').click();
  await page.locator('#workflow-run:not([disabled])').waitFor();
  assert.equal(await page.evaluate(()=>window.fixture.stops.length),1);
  assert.equal(await page.evaluate(()=>window.fixture.starts.length),3);
  // Opening settings never authorizes a webpage or sends model credentials.
  await page.locator('#workflow-provider-toggle').click();
  assert.equal(await page.locator('[role="dialog"]').isVisible(),true);
  await page.locator('#workflow-source-https').click();
  await page.evaluate(()=>{window.selectEvents=[];document.getElementById('workflow-https-protocol').addEventListener('change',e=>window.selectEvents.push({trusted:e.isTrusted,value:e.target.value}));});
  await page.locator('#workflow-https-protocol').click();await page.keyboard.press('End');await page.keyboard.press('Enter');
  console.log('select probe',await page.evaluate(()=>({events:window.selectEvents,active:document.activeElement?.id,provider:window.fixture.view.getSnapshot().controls['workflow-ai-provider'],focus:window.fixture.view.getSnapshot().focusRequest})));
  await page.locator('#workflow-ai-model').fill('model-test');
  await page.locator('#workflow-ai-key').fill('browser-memory-only-secret');
  await page.locator('#workflow-source-local').click();await page.locator('#workflow-source-https').click();
  assert.equal(await page.locator('#workflow-https-protocol').inputValue(),'cloud_responses');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[role="dialog"]').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'workflow-provider-toggle');
  assert.equal(await page.evaluate(()=>JSON.stringify([...window.fixture.session]).includes('browser-memory-only-secret')),false);
  await page.evaluate(()=>{window.fixture.service.hold=false;});
  await page.locator('#workflow-run:not([disabled])').click();
  await page.waitForFunction(()=>window.fixture.view.getSnapshot().lastRun==='success');
  assert.equal(await page.evaluate(()=>window.fixture.starts.length),4);
  await page.evaluate(()=>{window.unmount();window.fixture.view.dispose();});
  assert.equal(await page.evaluate(()=>Object.values(window.fixture.subscriptions).every(value=>value.size===0)),true);
  assert.deepEqual(errors,[]);
});
