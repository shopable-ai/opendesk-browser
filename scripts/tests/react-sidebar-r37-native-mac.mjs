#!/usr/bin/env node
// Real Mac CFT SIDE_PANEL evidence. Connect only to a driver-owned profile.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyPackage} from '../verify-package.mjs';
import {createHash} from 'node:crypto';

assert.equal(process.platform,'darwin');
const installedBytes=await readFile(resolve(process.argv[2]));
const installed=JSON.parse(installedBytes);
assert.equal(installed.browserRetained,true);
const output=resolve(process.argv[3]);await mkdir(output,{recursive:true});
const {chromium}=await import(process.env.OPENDESK_PLAYWRIGHT_MODULE);
let browser=await chromium.connectOverCDP(installed.cdpEndpoint);
let context=browser.contexts()[0];
const candidate=await verifyPackage(installed.extension,{mode:installed.buildMode});
assert.equal(candidate.packageHash,installed.packageHash,'running browser must have been launched with this exact package');
assert.equal(candidate.edition,installed.edition);
assert(installed.buildReceipt?.path&&installed.buildReceipt.sha256&&installed.buildReceipt.attemptId,'frozen build receipt required');
const buildBytes=await readFile(installed.buildReceipt.path),build=JSON.parse(buildBytes);
assert.equal(createHash('sha256').update(buildBytes).digest('hex'),installed.buildReceipt.sha256);
assert.equal(build.attemptId,installed.buildReceipt.attemptId);assert.equal(build.status,'passed');
assert.equal(build.report.packageHash,candidate.packageHash);assert.equal(build.report.edition,candidate.edition);
const report={source:'NATIVE_MAC_SIDE_PANEL',status:'RUNNING',extensionId:installed.extensionId,
  extension:installed.extension,buildMode:installed.buildMode,packageHash:candidate.packageHash,
  edition:candidate.edition,installedReceiptSha256:createHash('sha256').update(installedBytes).digest('hex'),buildReceipt:installed.buildReceipt,
  steps:[],errors:[],externalConditions:[]};
const socket=new WebSocket(installed.cdpEndpoint);await new Promise((ok,no)=>{
  socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});
});
let nextId=0;const pending=new Map();
socket.addEventListener('message',event=>{
  const message=JSON.parse(event.data),entry=pending.get(message.id);if(!entry)return;
  pending.delete(message.id);clearTimeout(entry.timer);
  message.error?entry.no(new Error(message.error.message)):entry.ok(message.result);
});
function cdp(method,params={},sessionId){return new Promise((ok,no)=>{
  const id=++nextId,timer=setTimeout(()=>{pending.delete(id);no(Error('CDP_TIMEOUT '+method));},12000);
  pending.set(id,{ok,no,timer});socket.send(JSON.stringify({id,method,params,...sessionId&&{sessionId}}));
});}
async function panelPage(){
  for(const page of context.pages())if(page.url().includes(installed.extensionId+'/sidepanel.html')&&
    await page.evaluate(async()=>!await chrome.tabs.getCurrent()))return page;
}
async function evidence(name,data={}){
  report.steps.push({name,status:'PASS',...data});
  await panel.screenshot({path:resolve(output,name+'.png')});
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
let panel;
const observedPages=new WeakSet();
function observe(page){if(!observedPages.has(page)){observedPages.add(page);page.on('pageerror',error=>report.errors.push(String(error)));}}
try{
  let catalog;
  for(const page of context.pages())if(page.url().includes(installed.extensionId+'/sidepanel.html?')&&
    await page.evaluate(async()=>Boolean(await chrome.tabs.getCurrent())))catalog=page;
  assert(catalog,'Existing catalog required');
  panel=await panelPage();
  if(!panel){await catalog.locator('#catalog-open-dev-sidebar').click();
    await catalog.waitForFunction(async()=>Boolean((await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})).length));
    // Chrome exposes a newly opened native panel to Target discovery before
    // an existing Playwright CDP connection publishes it as a Page.
    browser=await chromium.connectOverCDP(installed.cdpEndpoint);context=browser.contexts()[0];
    // Playwright discovers the Chrome-owned target asynchronously.
    for(let i=0;i<50&&!panel;i++){panel=await panelPage();if(!panel)await new Promise(ok=>setTimeout(ok,100));}
  }
  assert(panel,'Native Side Panel target required');
  observe(panel);
  await panel.locator('[data-workbench-tab="tasks"]').waitFor({state:'visible'});
  const identity=await panel.evaluate(async()=>({url:location.href,id:chrome.runtime.id,
    tab:await chrome.tabs.getCurrent(),contexts:await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}),
    roots:document.querySelectorAll('#opendesk-react-app').length,
    tabs:[...document.querySelectorAll('[data-workbench-tab]')].filter(n=>!n.hidden).map(n=>n.dataset.workbenchTab)}));
  assert.equal(identity.tab,undefined);assert.equal(identity.roots,1);
  assert.equal(identity.id,installed.extensionId);
  assert(identity.contexts.some(row=>row.documentUrl===identity.url&&row.contextType==='SIDE_PANEL'));
  assert.deepEqual(identity.tabs,['tasks','tools','workflow','develop','cloud',...(installed.buildMode==='development'?['debug']:[])]);
  await evidence('native-open',identity);

  let target=context.pages().find(page=>page.url()==='http://127.0.0.1:43111/demo-form.html');
  if(!target){target=await context.newPage();await target.goto('http://127.0.0.1:43111/demo-form.html');}
  await target.bringToFront();await panel.locator('#tab-develop').click();
  await panel.waitForFunction(()=>document.getElementById('script-run')?.disabled===false);
  const source='async function main(){ return {r37:"native-panel",title:await page.title()}; }';
  await panel.locator('#script-source').fill(source);
  if(!await panel.locator('#script-params').isVisible())await panel.locator('#manual-project-params-tools > summary').click();
  await panel.locator('#script-params').fill('{"r37":true}');
  await panel.locator('#tab-workflow').click();await panel.locator('#workflow-ai-request').fill('R37 只读核对网页标题');
  for(const tab of ['cloud','tasks','tools','workflow','develop']){
    await panel.locator(`[data-workbench-tab="${tab}"]`).click();
    assert.equal(await panel.locator(`[data-workbench-tab="${tab}"]`).getAttribute('aria-selected'),'true');
  }
  assert.equal(await panel.locator('#script-source').inputValue(),source);
  assert.equal(await panel.locator('#script-params').inputValue(),'{"r37":true}');
  await evidence('navigation-input-retention');
  await panel.locator('#script-run').click();
  await panel.waitForFunction(()=>document.getElementById('script-result')?.textContent.includes('native-panel'))
    .catch(async error=>{throw Error(String(error)+'\nRUN_DIAGNOSTICS '+JSON.stringify(await panel.evaluate(()=>({
      status:document.getElementById('script-status')?.textContent,result:document.getElementById('script-result')?.textContent,
      source:document.getElementById('script-source')?.value,text:document.body.innerText
    }))));});
  assert.match(await panel.locator('#script-result').innerText(),/Browser Test Lab/);
  await evidence('controller-run');
  await panel.locator('#script-source').fill('async function main(){ await new Promise(resolve=>setTimeout(resolve,20000)); return "late-r37"; }');
  const delayedStart=Date.now();
  await panel.locator('#script-run').click();await panel.locator('#script-stop').waitFor({state:'visible'});
  await panel.locator('#script-stop').click();
  await panel.waitForFunction(()=>document.getElementById('script-result')?.textContent.includes('E_CANCELLED'));
  const cancelledRun=await panel.locator('#script-task-id').textContent();
  assert.doesNotMatch(await panel.locator('#script-result').innerText(),/late-r37/);
  await evidence('controller-stop');

  await panel.locator('#tab-tools').click();
  if(await panel.locator('#sidebar-tool-back').isVisible())await panel.locator('#sidebar-tool-back').click();
  await panel.locator('[data-extension-key="app:quick-notes"][data-extension-action="more"]').click();
  await panel.locator('#extension-center-row-menu').getByRole('menuitem',{name:'查看详情',exact:true}).click();
  assert.equal(await panel.locator('#extension-center-detail').isVisible(),true);
  await evidence('tool-detail');
  await panel.locator('#extension-center-back').click();
  await panel.locator('[data-extension-key="app:quick-notes"][data-extension-action="primary"]').click();
  await panel.locator('#sidebar-tool-frame iframe').waitFor();
  const {targetInfos}=await cdp('Target.getTargets');
  const parent=targetInfos.find(row=>row.url===panel.url()&&row.type==='page');
  assert(parent,'Exact native panel target required');
  const {sessionId:panelSession}=await cdp('Target.attachToTarget',{targetId:parent.targetId,flatten:true});
  const {root}=await cdp('DOM.getDocument',{},panelSession);
  const {nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-frame iframe'},panelSession);
  const {node:frameOwner}=await cdp('DOM.describeNode',{nodeId},panelSession);
  assert(frameOwner.frameId,'Actual panel iframe frameId required');
  let sandbox;
  for(let i=0;i<50&&!sandbox;i++){
    const targets=await cdp('Target.getTargets');
    sandbox=targets.targetInfos.find(row=>row.type==='iframe'&&row.targetId===frameOwner.frameId&&row.url.includes(installed.extensionId+'/sidebar-tools/sandbox.html'));
    if(!sandbox)await new Promise(ok=>setTimeout(ok,100));
  }
  assert(sandbox,'Actual sandbox target required');
  const {sessionId}=await cdp('Target.attachToTarget',{targetId:sandbox.targetId,flatten:true});
  // Chrome pauses a newly auto-attached OOPIF for the debugger. Resume the
  // instrumentation target; no product state or business callback is injected.
  await cdp('Runtime.runIfWaitingForDebugger',{},sessionId);
  let body;
  for(let i=0;i<50;i++){
    body=await cdp('Runtime.evaluate',{expression:'document.body?.innerText||""',returnByValue:true},sessionId);
    if(body.result.value.includes('我的笔记'))break;
    await new Promise(ok=>setTimeout(ok,100));
  }
  assert.match(body.result.value,/我的笔记/);
  await evidence('sandbox-tool',{target:sandbox,parentTargetId:parent.targetId,ownedFrameId:frameOwner.frameId});
  await panel.locator('#sidebar-tool-settings-open').click();
  assert.equal(await panel.locator('#sidebar-tool-settings-view').isVisible(),true);
  await evidence('tool-settings');
  await panel.locator('#sidebar-tool-back').click();
  await panel.locator('#tab-workflow').click();
  assert.equal(await panel.locator('#workflow-ai-request').inputValue(),'R37 只读核对网页标题');
  await panel.locator('#workflow-provider-toggle').click();
  assert.equal(await panel.locator('#workflow-provider-settings').isVisible(),true);
  report.externalConditions.push({operation:'AI 生成并执行工作流',status:'NOT_TESTED',
    reason:'独立 CFT 未配对 Native/Codex；本轮不主动配对或扩大外部授权',
    observed:await panel.locator('#workflow-provider-settings').innerText()});
  await panel.keyboard.press('Escape');await panel.locator('#tab-cloud').click();
  report.externalConditions.push({operation:'Cloud Claim/远端执行',status:'NOT_TESTED',
    reason:'未提供独立候选配对与远端授权，保持未配对状态',observed:await panel.locator('#workbench-cloud').innerText()});
  await evidence('workflow-cloud-state');
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,delayedStart+20500-Date.now())));
  assert.equal(await panel.locator('#script-task-id').textContent(),cancelledRun);
  assert.match(await panel.locator('#script-result').textContent(),/E_CANCELLED/);
  assert.doesNotMatch(await panel.locator('#script-result').textContent(),/late-r37/);
  await evidence('late-result-after-cancel',{run:cancelledRun,elapsedMs:Date.now()-delayedStart});

  const before=await panel.evaluate(async()=>await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}));
  await catalog.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();await chrome.sidePanel.close({windowId:tab.windowId});});
  await catalog.waitForFunction(async()=>!(await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})).length);
  await catalog.locator('#catalog-open-dev-sidebar').click();
  await catalog.waitForFunction(async()=>Boolean((await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})).length));
  browser=await chromium.connectOverCDP(installed.cdpEndpoint);context=browser.contexts()[0];
  panel=null;for(let i=0;i<50&&!panel;i++){panel=await panelPage();if(!panel)await new Promise(ok=>setTimeout(ok,100));}
  assert(panel,'Reopened native panel target required');observe(panel);
  assert(panel);const after=await panel.evaluate(async()=>await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}));
  assert.equal(after.length,1);assert.equal(after[0].documentUrl,panel.url());
  assert.equal(await panel.locator('#opendesk-react-app').count(),1);
  // Chrome may retain and reuse a native panel document. Prove the reopened
  // owner is usable rather than requiring the browser to allocate a new ID.
  await panel.locator('#tab-develop').click();
  await panel.locator('#script-source').fill('async function main(){ return "r37-reopened"; }');
  await panel.locator('#script-run').click();
  await panel.waitForFunction(()=>document.getElementById('script-result')?.textContent.includes('r37-reopened'));
  await evidence('native-close-reopen',{before,after,reusedDocument:after[0].documentId===before[0].documentId});
  assert.deepEqual(report.errors,[]);
  assert.equal((await verifyPackage(installed.extension,{mode:installed.buildMode})).packageHash,report.packageHash);
  report.status='PASS_CORE_WITH_EXTERNAL_NOT_TESTED';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);if(panel)await panel.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');socket.close();console.log(JSON.stringify(report));}
// Disconnect this observer without closing the retained driver-owned browser.
setTimeout(()=>process.exit(process.exitCode||0),10);
