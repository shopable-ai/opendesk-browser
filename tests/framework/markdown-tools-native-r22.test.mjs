import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

// Browser-backed smoke: a real unpacked production MV3 extension and real
// user-input CDP clicks, using a local fixture. Public-site acceptance remains
// NOT TESTED until a separately recorded genuine public website run.
const chromeCandidates=[process.env.CHROME_BIN,'google-chrome','chromium','google-chrome-stable'].filter(Boolean);
const chromeBinary=chromeCandidates.find(x=>spawnSync(x,['--version'],{stdio:'ignore'}).status===0);
function socket(url){
 const ws=new WebSocket(url),pending=new Map();let seq=0,observe=()=>{};
 const ready=new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
 ws.onmessage=event=>{
  const msg=JSON.parse(event.data);
  if(!msg.id)return observe(msg);
  const result=pending.get(msg.id);if(!result)return;
  clearTimeout(result.timer);pending.delete(msg.id);
  msg.error?result.reject(Error(msg.error.message)):result.resolve(msg.result);
 };
 return {ready,onEvent(fn){observe=fn;},
  send(method,params={},timeout=15000,sessionId){
   return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},timeout);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
   });
  },close(){ws.close();for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('CDP_CLOSED'));}pending.clear();}
 };
}
async function evalIn(target,expression){
 const result=await target.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},20000);
 if(result.exceptionDetails)throw Error('CDP_PAGE_EXCEPTION '+JSON.stringify(result.exceptionDetails).slice(0,350));
 return result.result.value;
}
async function until(fn,what){
 for(let i=0;i<90;i++){try{const out=await fn();if(out)return out;}catch{}await pause(170);}
 throw Error('Native Chrome timeout: '+what);
}
async function click(target,selector){
 const rect=await evalIn(target,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+
  ");if(!e||e.disabled||!e.getClientRects().length)throw Error('CONTROL_UNAVAILABLE');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 for(const type of ['mousePressed','mouseReleased'])await target.send('Input.dispatchMouseEvent',{type,...rect,button:'left',clickCount:1});
}
const fixture='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面测试：剪藏</title>'+
 '<nav>导航和广告不应剪藏</nav><article><h1>页面测试：剪藏</h1><h2>重复章节</h2><h2>重复章节</h2>'+
 '<p>中文测试内容，支持 <strong>粗体</strong> 与 <a href="/read">内部链接</a>。'+
 '这是网页文章正文的完整测试。'.repeat(12)+'</p>'+
 '<pre><code class="language-js">const value = 42;</code></pre>'+
 '<table><tr><th>列一</th><th>列二</th></tr><tr><td>甲</td><td>乙</td></tr></table>'+
 '</article></html>';

test('R22 Chrome: official clipper consent, real content read and local workbench import',{timeout:190000},async t=>{
 assert.ok(chromeBinary,'Real Chrome for Testing is required; fixture-only/node test cannot replace it');
 const profile=await mkdtemp(join(tmpdir(),'opendesk-r22-cft-'));
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(fixture);});
 await new Promise((ok,bad)=>server.once('error',bad).listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/article.html';
 const extension=resolve('dist/production');
 assert.equal(JSON.parse(await readFile(join(extension,'manifest.json'),'utf8')).name,'OpenDesk Browser');
 const args=[...(process.env.OPENDESK_NATIVE_HEADED==='1'?[]:['--headless=new']),
  '--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0','--user-data-dir='+profile,'--disable-extensions-except='+extension,
  '--load-extension='+extension,'about:blank'];
 const chrome=spawn(chromeBinary,args,{stdio:['ignore','ignore','pipe']});
 let browser=null,host=null,article=null,side=null,clip=null,workbench=null,logs='';
 chrome.stderr.on('data',b=>{logs=(logs+b).slice(-3000);});
 t.after(async()=>{
  const observations=resolve('artifacts/markdown-tools-r22');await mkdir(observations,{recursive:true});
  const clipObservation=clip&&await evalIn(clip,'({scriptState:document.querySelector("#tool-status")?.dataset.state,status:document.querySelector("#clip-status")?.textContent,error:document.querySelector("#clip-status")?.dataset.error,markdown:document.querySelector("#clip-source")?.value})').catch(error=>({unavailable:error.message}));
  const hostObservation=side&&await evalIn(side,'({url:location.href,page:document.querySelector("#script-current-page-url")?.textContent,status:document.querySelector("#sidebar-tool-status")?.textContent})').catch(error=>({unavailable:error.message}));
  await writeFile(join(observations,'native-observation.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA||null,clip:clipObservation,host:hostObservation},null,2)+'\n');
  console.log('R22_NATIVE_OBSERVATION '+JSON.stringify({host:hostObservation,clip:clipObservation&&{
   ...clipObservation,markdown:clipObservation.markdown?.slice(0,600)}}));
  if(side)try{
   const {data}=await side.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile(join(observations,'native-final-host.png'),Buffer.from(data,'base64'));
  }catch{}
  // Attached iframe sessions share the browser socket and have no close method.
  for(const c of [workbench,clip,host,article,browser])c?.close?.();
  if(chrome.exitCode===null&&chrome.signalCode===null){
   await new Promise(done=>{const timer=setTimeout(()=>chrome.kill('SIGKILL'),2500);
    chrome.once('close',()=>{clearTimeout(timer);done();});chrome.kill('SIGTERM');});
  }
  await new Promise(done=>server.close(done));
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
 });
 let port=0;
 for(let i=0;i<120;i++){
  if(chrome.exitCode!==null)throw Error('Chrome exited: '+logs);
  try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
  await pause(150);
 }
 assert(port,'Chrome DevToolsActivePort not available: '+logs);
 const base='http://127.0.0.1:'+port;
 const version=await(await fetch(base+'/json/version')).json();
 browser=socket(version.webSocketDebuggerUrl);await browser.ready;
 async function openTab(address){
  const {targetId}=await browser.send('Target.createTarget',{url:address});
  const ws=await until(async()=>{
   const list=await(await fetch(base+'/json/list')).json();
   return list.find(x=>x.id===targetId)?.webSocketDebuggerUrl;
  },'tab target');
  const cdp=socket(ws);await cdp.ready;await cdp.send('Runtime.enable');await cdp.send('Page.enable');
  return {targetId,cdp};
 }
 async function iframeWith(selector){
  const target=await until(async()=>{
   const {targetInfos}=await browser.send('Target.getTargets');
   return targetInfos.find(x=>x.type==='iframe'&&x.url?.includes('/sidebar-tools/sandbox.html'));
  },'sandbox CDP target');
  const attached=await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const frame={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,attached.sessionId)};
  await frame.send('Runtime.enable');await frame.send('Page.enable');
  await until(()=>evalIn(frame,'document.querySelector("#tool-status")?.dataset.state === "ready"'),'sandbox JavaScript ready');
  await until(()=>evalIn(frame,'!!document.querySelector('+JSON.stringify(selector)+')'),'tool UI '+selector);
  return frame;
 }
 const page=await openTab(url);article=page.cdp;
 console.log('R22_NATIVE_STAGE: fixture article tab opened');
 const extensionId=await until(async()=>{
  const items=(await browser.send('Target.getTargets')).targetInfos;
  const row=items.find(x=>x.type==='service_worker'&&/^chrome-extension:\/\/[^/]+\/sw\.js/.test(x.url||''));
  return row?.url?.split('/')[2];
 },'OpenDesk MV3 SW registered');
 const ui=await openTab('chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+randomUUID());
 host=ui.cdp;
 console.log('R22_NATIVE_STAGE: extension host tab opened');
 await until(()=>evalIn(host,'!!document.querySelector("#sidebar-tool-official-web-markdown-clipper-install")'),'tool host loaded');
 const windowId=await evalIn(host,'chrome.windows.getCurrent().then(w=>w.id)');
 await evalIn(host,"(()=>{const b=document.createElement('button');b.id='r22-open-side';b.textContent='Open Side Panel';b.style.cssText='position:fixed;top:70px;left:20px;min-width:200px;min-height:45px;z-index:999999;background:white;color:black';b.addEventListener('click',()=>chrome.sidePanel.open({windowId:"+windowId+"}));document.body.append(b);return true;})()");
 await click(host,'#r22-open-side');
 console.log('R22_NATIVE_STAGE: Side Panel native gesture invoked');
 const context=await until(async()=>{
  const c=await evalIn(host,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");
  return c.find(x=>x.documentUrl?.includes('/ui/tool.html'));
 },'real SIDE_PANEL context');
 const sideTarget=await until(async()=>{
  const {targetInfos}=await browser.send('Target.getTargets');
  return targetInfos.find(x=>x.url===context.documentUrl);
 },'SIDE_PANEL CDP target');
 const attached=await browser.send('Target.attachToTarget',{targetId:sideTarget.targetId,flatten:true});
 side={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,attached.sessionId)};
 await side.send('Runtime.enable');await side.send('Page.enable');
 await until(()=>evalIn(side,'!!document.querySelector("#tab-tools")'),'tools tab');
 await click(side,'#tab-tools');
 console.log('R22_NATIVE_STAGE: Side Panel tools tab clicked');
 await until(()=>evalIn(side,'!document.querySelector("#workbench-tools").hidden'),'tools section');
 // Official tools are discovered separately from My Tools in the current UI.
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-discover-tab").disabled'),'Discover tools available');
 await click(side,'#sidebar-tool-discover-tab');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-discover-panel").hidden'),'official discovery visible');
 const officialButton='#sidebar-tool-official-web-markdown-clipper-install';
 await until(()=>evalIn(side,'(()=>{const n=document.querySelector('+JSON.stringify(officialButton)+');return !!n&&!n.disabled&&!!n.getClientRects().length;})()'),'official clipper install ready');
 // Official candidate must stay review-only: no iframe and no content reads.
 await click(side,officialButton);
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-preview").hidden'),'clipper preview');
 assert.equal(await evalIn(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),0);
 assert.equal(await evalIn(side,'document.querySelector("#sidebar-tool-preview-title").textContent'),'网页剪藏');
 await click(side,'#sidebar-tool-install');
 console.log('R22_NATIVE_STAGE: clipper official install clicked');
 const openClipper='[data-sidebar-tool-action=open][data-sidebar-tool-id=web-markdown-clipper]';
 await until(()=>evalIn(side,'!!document.querySelector('+JSON.stringify(openClipper)+')'),'clipper installed in My Tools');
 await browser.send('Target.activateTarget',{targetId:page.targetId});
 await article.send('Page.bringToFront');
 await click(side,openClipper);
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-open").hidden'),'clipper settings button visible');
 await click(side,'#sidebar-tool-settings-open');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-view").hidden'),'clipper Settings opened');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-allow").disabled'),'clipper exact-site grant ready');
 let dialogs=0;
 browser.onEvent(evt=>{
  if(evt.method!=='Page.javascriptDialogOpening'||evt.sessionId!==attached.sessionId)return;
  dialogs++;void browser.send('Page.handleJavaScriptDialog',{accept:true},15000,attached.sessionId).catch(()=>{});
 });
 await click(side,'#sidebar-tool-settings-allow');
 console.log('R22_NATIVE_STAGE: clip site grant clicked in Settings without a dialog');
 await until(()=>evalIn(side,"chrome.storage.local.get('opendesk.sidebar-tools.clip-sites.v1').then(x=>x['opendesk.sidebar-tools.clip-sites.v1']?.['web-markdown-clipper']?.includes("+JSON.stringify(new URL(url).origin)+"))"),'explicit exact-origin site grant persisted');
 assert.equal(dialogs,0,'A one-click site grant must have zero JavaScript dialogs');
 await click(side,'#sidebar-tool-back'); // Settings → detail
 clip=await iframeWith('#clip-fetch');
 console.log('R22_NATIVE_STAGE: clip sandbox mounted');
 await click(clip,'#clip-fetch');
 console.log('R22_NATIVE_STAGE: clip extraction clicked');
 const extracted=await until(async()=>{
  const out=await evalIn(clip,'document.querySelector("#clip-source").value');
  return out?.includes('页面测试')&&out?.includes('const value')?out:null;
 },'trusted content script extracted actual fixture DOM');
 assert.match(extracted,/重复章节/);
 assert.match(extracted,/\| 列一 \| 列二 \|/);
 assert.doesNotMatch(extracted,/导航和广告不应剪藏/);
 await click(side,'#sidebar-tool-back'); // detail → My Tools
 await click(side,openClipper);
 await click(side,'#sidebar-tool-settings-open');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-deny").disabled'),'clipper site revoke ready');
 await click(side,'#sidebar-tool-settings-deny');
 console.log('R22_NATIVE_STAGE: site revoked in Settings without dialog');
 await until(()=>evalIn(side,"chrome.storage.local.get('opendesk.sidebar-tools.clip-sites.v1').then(x=>!x['opendesk.sidebar-tools.clip-sites.v1']?.['web-markdown-clipper']?.length)"),'clipper exact-site grant revoked');
 assert.equal(dialogs,0,'Site revocation must not open a JavaScript dialog');
 // Revoking clip access immediately closes any active sandbox containing
 // previously read article text. When it auto-suspends the active tool, the
 // installed list is already visible and no Back button should be clicked.
 if(await evalIn(side,'!document.querySelector("#sidebar-tool-display").hidden')){
  if(await evalIn(side,'!document.querySelector("#sidebar-tool-settings-view").hidden'))
   await click(side,'#sidebar-tool-back'); // Settings → detail (if retained)
  if(await evalIn(side,'!document.querySelector("#sidebar-tool-display").hidden'))
   await click(side,'#sidebar-tool-back'); // detail → My Tools (if retained)
 }
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-list-view").hidden'),
   'revoking clipper access returned to the installed list');
 // Install local workbench with the same audited package intake as all R1 tools.
 await click(side,'#sidebar-tool-import-trigger');
 await side.send('DOM.enable');
 const doc=await side.send('DOM.getDocument',{depth:1});
 const inputNode=await side.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#sidebar-tool-file'});
 assert(inputNode.nodeId,'Local package file input missing');
 await side.send('DOM.setFileInputFiles',{nodeId:inputNode.nodeId,
  files:[resolve('dist/production/official-tools/markdown-workbench/markdown-workbench.opendesk-tool.json')]});
 await until(()=>evalIn(side,'document.querySelector("#sidebar-tool-preview-title").textContent==="Markdown 工作台"'),'local Markdown package preview');
 await click(side,'#sidebar-tool-install');
 await until(()=>evalIn(side,'!!document.querySelector("[data-sidebar-tool-action=open][data-sidebar-tool-id=markdown-workbench]")'),'workbench installed');
 await click(side,'[data-sidebar-tool-action=open][data-sidebar-tool-id=markdown-workbench]');
 workbench=await iframeWith('#mdw-source');
 console.log('R22_NATIVE_STAGE: workbench iframe mounted');
 // Chrome's native file input actually imports UTF-8 Markdown in the iframe.
 const importPath=join(profile,'r22-import.md');
 await writeFile(importPath,'# R22 导入\n\n- [x] 安全清单\n\n<script>throw new Error("unsafe")</script>\n');
 await workbench.send('DOM.enable');
 const doc2=await workbench.send('DOM.getDocument',{depth:1});
 const input2=await workbench.send('DOM.querySelector',{nodeId:doc2.root.nodeId,selector:'#mdw-file'});
 assert(input2.nodeId,'Workbench file picker unavailable');
 await workbench.send('DOM.setFileInputFiles',{nodeId:input2.nodeId,files:[importPath]});
 await until(()=>evalIn(workbench,'document.querySelector("#mdw-source").value.includes("安全清单")'),'real file input imported Markdown');
 await click(workbench,'[data-mode=preview]');
 assert.equal(await evalIn(workbench,'document.querySelector(".mdw-preview script")===null'),true);
 const screenshots=resolve('artifacts/markdown-tools-r22');await mkdir(screenshots,{recursive:true});
 const shot=await side.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(join(screenshots,'r22-workbench-sidepanel.png'),Buffer.from(shot.data,'base64'));
 console.log(JSON.stringify({result:'NATIVE_FIXTURE_PASS',installed:['web-markdown-clipper','markdown-workbench'],
  consentDialogs:dialogs,articleBytes:Buffer.byteLength(extracted),markdownImport:true,safePreview:true,
  screenshot:'artifacts/markdown-tools-r22/r22-workbench-sidepanel.png',
  publicWebsite:'NOT_TESTED',clipboardSystem:'NOT_TESTED',downloadSave:'NOT_TESTED'}));
});
