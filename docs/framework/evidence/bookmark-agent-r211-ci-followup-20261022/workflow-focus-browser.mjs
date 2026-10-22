import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build,stop} from 'esbuild';
import {chromium} from '/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root=fileURLToPath(new URL('./verification-snapshot/',import.meta.url));
const output=new URL('./workflow-focus-browser.json',import.meta.url);
const executablePath='/Users/shopme/Documents/workspace/opendesk-browser/tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const report={grade:'REAL_CHROMIUM_DOM_WITH_FIXTURE_SERVICES_NOT_INSTALLED_EXTENSION',
  nativeProvider:false,realBookmarkSdk:false,modelCalls:0,checks:[],status:'RUNNING'};
let browser,server;
try{
  const source=await readFile(root+'src/ui/react/tabs/workflow.tsx');
  report.workflowSourceSha256=createHash('sha256').update(source).digest('hex');
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
    import {WorkflowPage} from './src/ui/react/tabs/workflow.tsx';
    import {workflowFixture} from './tests/environment/workflow-react-fixture.mjs';
    const fixture=await workflowFixture({steps:['one','two','three'].map(stepId=>({stepId,op:'observe'}))});
    window.fixture=fixture;window.trustedKeys=[];
    document.addEventListener('keydown',event=>window.trustedKeys.push({key:event.key,isTrusted:event.isTrusted}));
    createRoot(document.getElementById('root')).render(<WorkflowPage controller={fixture.view}/>);`;
  const bundled=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'workflow-focus-browser.tsx',loader:'tsx'},
    bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  const css=(await Promise.all(['design-tokens.css','design-system.css','tool-shell.css'].map(name=>readFile(root+'src/ui/'+name,'utf8')))).join('\n');
  server=createServer((request,response)=>{
    response.setHeader('Content-Type',request.url==='/app.js'?'text/javascript':request.url==='/style.css'?'text/css':'text/html');
    response.end(request.url==='/app.js'?bundled.outputFiles[0].text:request.url==='/style.css'?css:
      '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath});
  report.browser=browser.version();report.isolatedProfile='Playwright-managed temporary profile';
  const page=await browser.newPage({viewport:{width:960,height:900}});
  page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.locator('#workflow-run:not([disabled])').waitFor();
  await page.locator('#workflow-edit-details').click();
  const step=id=>page.locator('details.workflow-step[data-step-id="'+id+'"]');
  const open=async id=>{if(!await step(id).evaluate(node=>node.open))await step(id).locator('summary').click();};
  const focused=async(selector,label)=>{
    await page.waitForFunction(selector=>document.activeElement===document.querySelector(selector),selector);
    assert.equal(await page.locator(selector).isVisible(),true);
    assert.equal(await page.locator(selector).isEnabled(),true);
    report.checks.push({label,focused:selector,status:'PASS'});
  };
  await open('one');
  const down=step('one').locator('[data-workflow-focus="moveDown"]');
  await down.focus();await down.press('Enter');
  await page.waitForFunction(()=>window.fixture.view.getSnapshot().steps.map(row=>row.stepId).join(',')==='two,one,three');
  await focused('[data-step-id="one"] [data-workflow-focus="moveDown"]','reorder retains the enabled button');
  await down.press('Enter');
  await focused('#workflow-step-one-summary','move to final boundary falls back to its summary');
  await open('three');const removeThree=step('three').locator('[data-workflow-focus="remove"]');
  await removeThree.focus();await removeThree.press('Enter');
  await focused('#workflow-step-one-summary','delete middle step chooses next summary');
  await open('one');const removeOne=step('one').locator('[data-workflow-focus="remove"]');
  await removeOne.focus();await removeOne.press('Enter');
  await focused('#workflow-step-two-summary','delete last step chooses previous summary');
  await open('two');const removeTwo=step('two').locator('[data-workflow-focus="remove"]');
  await removeTwo.focus();await removeTwo.press('Enter');
  await focused('#workflow-ai-request','delete final step returns to bottom composer');
  assert.equal(await page.locator('details.workflow-step').count(),0);
  report.keys=await page.evaluate(()=>window.trustedKeys);
  assert.equal(report.keys.length,5);assert.ok(report.keys.every(row=>row.key==='Enter'&&row.isTrusted));
  assert.deepEqual(errors,[]);report.pageErrors=errors;
  await page.screenshot({path:fileURLToPath(new URL('./workflow-focus-browser.png',import.meta.url))});
  report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  stop();report.ownedBrowserClosed=Boolean(browser);
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error}));
}
