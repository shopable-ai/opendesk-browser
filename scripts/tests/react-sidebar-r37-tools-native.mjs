import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';
import {verifyPackage} from '../verify-package.mjs';import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
const installed=JSON.parse(await readFile(process.argv[2],'utf8')),out=resolve(process.argv[3]);await mkdir(out,{recursive:true});
const report={source:'NATIVE_MAC_TOOL_COMPAT',status:'FAIL',steps:[]};let panel,toolPage,socket;
const {chromium}=await import(process.env.OPENDESK_PLAYWRIGHT_MODULE);
try{
  const before=await verifyPackage(installed.extension,{mode:installed.buildMode});assert.equal(before.packageHash,installed.packageHash);
  Object.assign(report,{packageHash:before.packageHash,edition:before.edition,extensionId:installed.extensionId,buildReceipt:installed.buildReceipt});
  const browser=await chromium.connectOverCDP(installed.cdpEndpoint),context=browser.contexts()[0];
  for(const page of context.pages())if(page.url().includes(installed.extensionId+'/sidepanel.html')&&!await page.evaluate(()=>chrome.tabs.getCurrent()))panel=page;
  assert(panel);await panel.locator('[data-workbench-tab="tools"]').click();
  const row=panel.locator('[data-extension-key="app:quick-notes"][data-extension-action="more"]');
  for(const enabled of [false,true]){
    await row.click();await panel.getByRole('menuitem',{name:enabled?'启用应用':'停用应用',exact:true}).click();
    await panel.waitForFunction(({key,enabled})=>chrome.storage.local.get(key).then(data=>(data[key]?.['quick-notes']!==false)===enabled),{key:SIDEBAR_TOOL_ENABLE_STORE,enabled});
    await panel.getByRole('status').filter({hasText:'已从本机安装记录确认应用'+(enabled?'启用':'停用')}).waitFor();
    report.steps.push({name:enabled?'tool-enable-readback':'tool-disable-readback',status:'PASS'});
  }
  await panel.locator('[data-extension-key="app:quick-notes"][data-extension-action="primary"]').click();
  await panel.locator('#sidebar-tool-open-tab').waitFor({state:'visible'});
  const opened=context.waitForEvent('page');void opened.catch(()=>{});await panel.locator('#sidebar-tool-open-tab').click();toolPage=await opened;
  await toolPage.waitForFunction(()=>document.documentElement.dataset.opendeskSurface==='tool-page');
  await toolPage.locator('#sidebar-tool-frame iframe').waitFor({state:'visible'});
  report.identity=await toolPage.evaluate(async()=>({url:location.href,id:chrome.runtime.id,tab:await chrome.tabs.getCurrent(),roots:document.querySelectorAll('#opendesk-react-app').length}));
  assert.equal(report.identity.id,installed.extensionId);assert(report.identity.tab?.id);assert.equal(report.identity.roots,1);
  assert.equal(new URL(report.identity.url).searchParams.get('toolId'),'quick-notes');
  socket=new WebSocket(installed.cdpEndpoint);await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});});
  let next=0;const pending=new Map();socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.no(Error(m.error.message)):p.ok(m.result);}});
  const cdp=(method,params={},sessionId)=>new Promise((ok,no)=>{const id=++next,timer=setTimeout(()=>no(Error('CDP_TIMEOUT '+method)),12000);pending.set(id,{ok,no,timer});socket.send(JSON.stringify({id,method,params,...sessionId&&{sessionId}}));});
  const parent=(await cdp('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url===toolPage.url());assert(parent);
  const {sessionId:parentSession}=await cdp('Target.attachToTarget',{targetId:parent.targetId,flatten:true});
  const {root}=await cdp('DOM.getDocument',{},parentSession),{nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-frame iframe'},parentSession);
  const {node}=await cdp('DOM.describeNode',{nodeId},parentSession);assert(node.frameId);
  let child;for(let i=0;i<50&&!child;i++){child=(await cdp('Target.getTargets')).targetInfos.find(t=>t.targetId===node.frameId&&t.type==='iframe');if(!child)await new Promise(ok=>setTimeout(ok,100));}
  assert(child);const {sessionId}=await cdp('Target.attachToTarget',{targetId:child.targetId,flatten:true});await cdp('Runtime.runIfWaitingForDebugger',{},sessionId);
  let body;for(let i=0;i<50;i++){body=(await cdp('Runtime.evaluate',{expression:'document.body?.innerText||""',returnByValue:true},sessionId)).result.value;if(body.includes('我的笔记'))break;await new Promise(ok=>setTimeout(ok,100));}
  assert.match(body,/我的笔记/);report.ownedFrame={parentTargetId:parent.targetId,frameId:node.frameId,targetId:child.targetId,url:child.url};
  await toolPage.screenshot({path:resolve(out,'standalone-tool.png')});await toolPage.close();
  report.steps.push({name:'independent-tool-tab',status:'PASS'});
  assert.equal((await verifyPackage(installed.extension,{mode:installed.buildMode})).packageHash,before.packageHash);report.status='PASS';
}catch(error){report.error=String(error.stack||error);if(toolPage&&!toolPage.isClosed())await toolPage.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});
}finally{socket?.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error}));process.exit(report.status==='PASS'?0:1);}
