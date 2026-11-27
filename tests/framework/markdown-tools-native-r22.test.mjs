import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {cp,mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

// Browser-backed smoke: a real unpacked production MV3 extension and real
// user-input CDP clicks, using a local fixture. Public-site acceptance remains
// NOT TESTED until a separately recorded genuine public website run.
const chromeCandidates=[process.env.CHROME_BIN,'google-chrome','chromium','google-chrome-stable'].filter(Boolean);
const chromeBinary=chromeCandidates.find(x=>spawnSync(x,['--version'],{stdio:'ignore'}).status===0);
const acceptance=process.env.OPENDESK_CLIPPER_R2_ACCEPTANCE==='1';
const observations=resolve(process.env.OPENDESK_NATIVE_EVIDENCE_DIR||'artifacts/markdown-tools-r22');
let extension=resolve(process.env.OPENDESK_EXTENSION_DIR||'dist/production');
const legacyExtension=acceptance&&process.env.OPENDESK_CLIPPER_LEGACY_EXTENSION_DIR
 ?resolve(process.env.OPENDESK_CLIPPER_LEGACY_EXTENSION_DIR):null;
// Optional handoff: write the absolute path of the finished candidate here.
// Wait only after Chrome has saved the historic data and exited cleanly.
const candidateSignal=legacyExtension&&process.env.OPENDESK_CLIPPER_CANDIDATE_SIGNAL;
const toolId='web-markdown-clipper';
const packagePath=id=>join(extension,'official-tools',id,id+'.opendesk-tool.json');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const fixedPaths=['agents/page-relay.js','sw.js','ui/sidebar-tool-host.js','ui/tool-shell.js'];
const isBrowserManifest=manifest=>['OpenDesk Browser','GrayDove'].includes(manifest.name)&&manifest.manifest_version===3;
async function fixedBinary(root,receiptOverride){
 const {packageFingerprint}=await import('../../scripts/verify-package.mjs');
 const receipt=resolve(receiptOverride||join(root,'../../docs/framework/evidence/wxt/builds/build-production.json'));
 const fingerprint=await packageFingerprint(root);
 const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 const metadata={root,receipt,version:manifest.version,manifestVersion:manifest.manifest_version,
  packageSha256:fingerprint.packageHash,files:Object.fromEntries(['manifest.json',...fixedPaths].map(path=>
   [path,fingerprint.files.find(file=>file.path===path)?.sha256??null]))};
 try{
  const {mode,status,report,attemptId}=JSON.parse(await readFile(receipt,'utf8'));
  metadata.receiptPackageSha256=report?.packageHash??null;
  metadata.attemptId=attemptId??null;
  metadata.verified=mode==='production'&&status==='passed'&&report?.mode==='production'&&
   report.status==='passed'&&report.packageHash===fingerprint.packageHash&&
   isBrowserManifest(manifest)&&Object.values(metadata.files).every(Boolean);
  if(!metadata.verified)metadata.reason='No matching passed production verification for these exact bytes';
 }catch(error){metadata.verified=false;metadata.reason=error.message;}
 return {metadata,fingerprint:packageFingerprint};
}
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
async function until(fn,what,diagnose){
 let lastError;
 for(let i=0;i<90;i++){try{const out=await fn();if(out)return out;}catch(error){lastError=error;}await pause(170);}
 const detail=diagnose?await diagnose().catch(error=>({error:error.message})):null;
 throw Error('Native Chrome timeout: '+what+(lastError?' · last error: '+lastError.message:'')+
  (detail?' · diagnostic: '+JSON.stringify(detail):''));
}
async function describeControl(target,selector){
 return evalIn(target,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+
  ");return {url:location.href,readyState:document.readyState,surface:document.documentElement.dataset.opendeskSurface,title:document.title,text:document.body?.innerText.slice(0,1800),control:e?.outerHTML.slice(0,800),blockedBy:e?.closest('[hidden],[inert],[aria-busy=true]')?.outerHTML.slice(0,300),visibility:e&&getComputedStyle(e).visibility,rects:e?.getClientRects().length};})()");
}
async function visible(target,selector){
 await until(()=>evalIn(target,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+
  ");return !!e&&!e.closest('[hidden],[inert]')&&!!e.getClientRects().length&&getComputedStyle(e).visibility==='visible';})()"),'visible '+selector,()=>describeControl(target,selector));
}
async function click(target,selector){
 const rect=await until(()=>evalIn(target,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+
  ");if(!e||e.disabled||e.closest('[hidden],[inert],[aria-busy=true]')||!e.getClientRects().length||getComputedStyle(e).visibility!=='visible')return false;e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:false;})()"),'clickable '+selector,()=>describeControl(target,selector));
 await mouseClick(target,rect);
}
async function mouseClick(target,rect,modifiers=0){
 for(const type of ['mousePressed','mouseReleased'])await target.send('Input.dispatchMouseEvent',{type,...rect,button:'left',clickCount:1,modifiers});
}
async function key(target,name,extra={}){
 for(const type of ['keyDown','keyUp'])await target.send('Input.dispatchKeyEvent',{type,key:name,code:name,...extra});
}
async function type(target,selector,value){
 await click(target,selector);
 assert.equal(await evalIn(target,'document.activeElement===document.querySelector('+JSON.stringify(selector)+')'),true,'editable control received focus');
 await key(target,'a',{code:'KeyA',windowsVirtualKeyCode:65,commands:['selectAll']});
 await target.send('Input.insertText',{text:value});
 assert.equal(await evalIn(target,'document.querySelector('+JSON.stringify(selector)+').value'),value);
}
async function screenshot(target,name){
 const {data}=await target.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(join(observations,name+'.png'),Buffer.from(data,'base64'));
}
async function selectToolScope(target,scope){
 await visible(target,'#extension-center-list-view');
 if(await evalIn(target,'document.querySelector("#extension-center-menu").hidden'))
  await click(target,'#extension-center-more');
 await click(target,'#extension-center-menu [data-ec-scope="'+scope+'"]');
 await until(()=>evalIn(target,'document.querySelector('+JSON.stringify('[data-ec-scope="'+scope+'"]')+').getAttribute("aria-pressed")==="true"'),'extension scope '+scope);
 await click(target,'#extension-center-more');
}
const fixture='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面测试：剪藏</title>'+
 '<style>.r22-clip-hidden{display:none}</style><nav>导航和广告不应剪藏</nav><article><h1>页面测试：剪藏</h1><h2>重复章节</h2><h2>重复章节</h2>'+
 '<p>中文测试内容，支持 <strong>粗体</strong><span class="r22-clip-hidden">R22_CSS_HIDDEN_SECRET</span> 与 <a href="/read">内部链接</a>。'+
 '这是网页文章正文的完整测试。'.repeat(12)+'</p>'+
 '<pre><code class="language-js">const value = 42;</code></pre>'+
 '<table><tr><th>列一</th><th>列二</th></tr><tr><td>甲</td><td>乙</td></tr></table>'+
 '<section><p id="r2-small">R2-FIRST-REGION <strong>bold region</strong></p><p id="r2-neighbor">R2-PARENT-ONLY</p></section>'+
 '<section><p id="r2-append">R2-APPENDED-REGION</p></section>'+
 '<section><p id="r2-after-edit">R2-APPENDED-AFTER-EDIT</p></section>'+
 '</article></html>';

test(acceptance?'R2 Chrome: installed Clipper upgrade, editing, export and persistence':
 'R22 Chrome: official clipper consent, real content read and local workbench import',{timeout:candidateSignal?950000:acceptance?300000:190000},async t=>{
 assert.ok(chromeBinary,'Real Chrome for Testing is required; fixture-only/node test cannot replace it');
 const checkpoints={};
 const evidence={checkpoint:checkpoints};
 async function recordCandidateManifest(){
  const manifestBytes=await readFile(join(extension,'manifest.json'));
  assert.ok(isBrowserManifest(JSON.parse(manifestBytes)),'Expected an OpenDesk Browser production MV3 manifest');
  Object.assign(evidence,{production:extension,manifestSha256:sha256(manifestBytes)});
 }
 if(!candidateSignal)await recordCandidateManifest();
 await mkdir(observations,{recursive:true});
 const taskRoot=await mkdtemp(join(tmpdir(),'opendesk-r22-cft-'));
 const profile=join(taskRoot,'profile');
 const loadRoot=legacyExtension?join(taskRoot,'extension'):extension;
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(fixture);});
 await new Promise((ok,bad)=>server.once('error',bad).listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/article.html';
 const args=[...(process.env.OPENDESK_NATIVE_HEADED==='1'?[]:['--headless=new']),
  '--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0','--user-data-dir='+profile,'--disable-extensions-except='+loadRoot,
  '--load-extension='+loadRoot];
 let chrome,browser,base,host,article,side,clip,workbench,logs='';
 async function stopChrome(graceful=false){
  if(!chrome||chrome.exitCode!==null||chrome.signalCode!==null)return;
  const closed=new Promise(done=>chrome.once('close',done));
  const timer=setTimeout(()=>chrome.kill('SIGKILL'),5000);
  try{
   if(graceful)await browser.send('Browser.close',{},3000);
   else chrome.kill('SIGTERM');
   await closed;
  }finally{clearTimeout(timer);}
  if(graceful)assert.equal(chrome.exitCode,0,'Chrome must exit normally before restart');
 }
 t.after(async()=>{
  try{
  const clipObservation=clip&&await evalIn(clip,'({scriptState:document.querySelector("#tool-status")?.dataset.state,status:document.querySelector("#clip-status")?.textContent,error:document.querySelector("#clip-status")?.dataset.error,markdown:document.querySelector("#clip-source")?.value})').catch(error=>({unavailable:error.message}));
  const hostObservation=side&&await evalIn(side,'({url:location.href,page:document.querySelector("#script-current-page-url")?.textContent,status:document.querySelector("#sidebar-tool-status")?.textContent})').catch(error=>({unavailable:error.message}));
  await writeFile(join(observations,'native-observation.json'),JSON.stringify({...evidence,sourceCommit:process.env.GITHUB_SHA||null,clip:clipObservation,host:hostObservation,chromeLogs:logs},null,2)+'\n');
  console.log('R22_NATIVE_OBSERVATION '+JSON.stringify({host:hostObservation,clip:clipObservation&&{
   ...clipObservation,markdown:clipObservation.markdown?.slice(0,600)}}));
  if(side)await screenshot(side,'native-final-host').catch(error=>t.diagnostic('Final screenshot unavailable: '+error.message));
  }finally{
  await stopChrome();
  // Attached iframe sessions share the browser socket and have no close method.
  for(const c of [workbench,clip,host,article,browser])c?.close?.();
  await new Promise(done=>server.close(done));
  await rm(taskRoot,{recursive:true,force:true,maxRetries:8,retryDelay:150});
  }
 });
 async function startChrome(restore=false){
 await rm(join(profile,'DevToolsActivePort'),{force:true});
 chrome=spawn(chromeBinary,[...args,restore?'--restore-last-session':'about:blank'],{stdio:['ignore','ignore','pipe']});
 chrome.stderr.on('data',b=>{logs=(logs+b).slice(-3000);});
 let port=0;
 for(let i=0;i<120;i++){
  if(chrome.exitCode!==null)throw Error('Chrome exited: '+logs);
  try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
  await pause(150);
 }
 assert(port,'Chrome DevToolsActivePort not available: '+logs);
 base='http://127.0.0.1:'+port;
 const version=await(await fetch(base+'/json/version')).json();
 evidence.chrome=version.Browser;
 browser=socket(version.webSocketDebuggerUrl);await browser.ready;
 }
 let baselineBinary;
 async function stageBinary({metadata,fingerprint}){
  assert.ok(legacyExtension&&loadRoot===join(taskRoot,'extension'));
  assert.ok(!chrome||chrome.exitCode===0,'Only replace the private load path after a clean Chrome exit');
  await rm(loadRoot,{recursive:true,force:true});
  await cp(metadata.root,loadRoot,{recursive:true,errorOnExist:true,force:false});
  assert.equal((await fingerprint(loadRoot)).packageHash,metadata.packageSha256,'staged bytes match the verified production receipt');
 }
 if(legacyExtension){
  const transition=evidence.fixedBrowser={status:'NOT_TESTED',stableLoadPath:loadRoot};
  baselineBinary=await inspectFixed('baseline',legacyExtension,process.env.OPENDESK_CLIPPER_LEGACY_BUILD_RECEIPT);
  assert.ok(baselineBinary.metadata.verified,'Legacy production verification: '+JSON.stringify(baselineBinary.metadata));
  await stageBinary(baselineBinary);
 }else if(acceptance){
  evidence.fixedBrowser={status:'NOT_TESTED',reason:'No OPENDESK_CLIPPER_LEGACY_EXTENSION_DIR supplied; tool-only upgrade'};
 }
 async function inspectFixed(role,root,receipt){
   const transition=evidence.fixedBrowser;
   try{
    const binary=await fixedBinary(root,receipt);
    transition[role]=binary.metadata;
    return binary;
   }catch(error){
    transition[role]={root,verified:false,reason:error.message};
    throw Error(role+' production artifact unavailable or unreadable: '+error.message,{cause:error});
   }
 }
 async function prepareCandidate(){
  if(candidateSignal){
   console.log('R2_NATIVE_STAGE: historical data saved, Chrome closed; waiting for verified candidate');
   let candidatePath;
   for(let i=0;i<300&&!candidatePath;i++){
    try{candidatePath=(await readFile(candidateSignal,'utf8')).trim();}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(!candidatePath)await pause(2000);
   }
   assert.ok(candidatePath,'Timed out waiting for the finished production candidate path');
   extension=resolve(candidatePath);
   await recordCandidateManifest();
  }
  const transition=evidence.fixedBrowser;
  const candidateBinary=await inspectFixed('candidate',extension,process.env.OPENDESK_CLIPPER_CANDIDATE_BUILD_RECEIPT);
  assert.ok(candidateBinary.metadata.verified,'Candidate production verification: '+JSON.stringify(candidateBinary.metadata));
  transition.changedFixedFiles=fixedPaths.filter(path=>baselineBinary.metadata.files[path]!==candidateBinary.metadata.files[path]);
  assert.ok(transition.changedFixedFiles.length,'Browser upgrade requires a real fixed binary change');
  await stageBinary(candidateBinary);
 }
 await startChrome();
 async function connectTab(targetId){
  const ws=await until(async()=>{
   const list=await(await fetch(base+'/json/list')).json();
   return list.find(x=>x.id===targetId)?.webSocketDebuggerUrl;
  },'tab target');
  const cdp=socket(ws);await cdp.ready;await cdp.send('Runtime.enable');await cdp.send('Page.enable');
  return {targetId,cdp};
 }
 async function openTab(address){
  const {targetId}=await browser.send('Target.createTarget',{url:address});
  return connectTab(targetId);
 }
 async function iframeWith(selector){
  const target=await until(async()=>{
   const {targetInfos}=await browser.send('Target.getTargets');
   return targetInfos.find(x=>x.type==='iframe'&&x.url?.includes('/sidebar-tools/sandbox.html'));
  },'sandbox CDP target',()=>describeControl(side,'#sidebar-tool-status'));
  const attached=await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const frame={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,attached.sessionId)};
  await frame.send('Runtime.enable');await frame.send('Page.enable');
  await until(()=>evalIn(frame,'document.querySelector("#tool-status")?.dataset.state === "ready"'),'sandbox JavaScript ready');
  await until(()=>evalIn(frame,'!!document.querySelector('+JSON.stringify(selector)+')'),'tool UI '+selector);
  return frame;
 }
 let page=await openTab(url);article=page.cdp;
 // Keep the real DOM/Range checks; installed tool behavior is exercised below.
 const rangeSources=await Promise.all(['examples/shared/markdown/convert.js','examples/shared/markdown/selection.js',
  'src/agents/context-menu-selection.js','tests/helpers/menu-selection-browser-cases.mjs'].map(path=>readFile(path,'utf8')));
 const rangeChecks=await evalIn(article,'(()=>{const BROWSER_MENU_SELECTION_PROTOCOL="opendesk.browser.menu-selection.v1";'+
  rangeSources.map(source=>source.replace(/^import .*;\n/gm,'').replace(/\bexport /g,'')).join('\n')+
  '\nreturn runMenuSelectionBrowserCases({cloneVisibleSelection,domToMarkdown,createMenuSelectionSnapshot});})()');
 assert.equal(rangeChecks.status,'PASS');
 console.log('R22_NATIVE_STAGE: fixture article tab opened');
 const identifyExtension=()=>until(async()=>{
  const items=(await browser.send('Target.getTargets')).targetInfos;
  const row=items.find(x=>x.type==='service_worker'&&/^chrome-extension:\/\/[^/]+\/sw\.js/.test(x.url||''));
  return row?.url?.split('/')[2];
 },'OpenDesk MV3 SW registered');
 const extensionId=await identifyExtension();
 evidence.extensionId=extensionId;
 async function openPanel(){
 const ui=await openTab('chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId='+randomUUID());
 host=ui.cdp;
 console.log('R22_NATIVE_STAGE: extension host tab opened');
 // A normal extension tab is a catalog/launcher surface. Product tabs become
 // visible only in the genuine SIDE_PANEL context, after the gesture below.
 await until(()=>evalIn(host,'document.readyState!=="loading"&&!!document.body&&typeof chrome.sidePanel?.open==="function"'),
  'extension launcher DOM and sidePanel API ready',()=>describeControl(host,'body'));
 const windowId=await evalIn(host,'chrome.windows.getCurrent().then(w=>w.id)');
 await evalIn(host,"(()=>{const b=document.createElement('button');b.id='r22-open-side';b.textContent='Open Side Panel';b.style.cssText='position:fixed;top:70px;left:20px;min-width:200px;min-height:45px;z-index:999999;background:white;color:black';b.addEventListener('click',()=>{b.dataset.state='opening';try{Promise.resolve(chrome.sidePanel.open({windowId:"+windowId+"})).then(()=>{b.dataset.state='opened';},error=>{b.dataset.state='error';b.textContent=error.message;});}catch(error){b.dataset.state='error';b.textContent=error.message;}});document.body.append(b);return true;})()");
 await click(host,'#r22-open-side');
 console.log('R22_NATIVE_STAGE: Side Panel native gesture invoked');
 const context=await until(async()=>{
  const c=await evalIn(host,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");
  return c.find(x=>x.documentUrl?.includes('/sidepanel.html'));
 },'real SIDE_PANEL context',()=>describeControl(host,'#r22-open-side'));
 const sideTarget=await until(async()=>{
  const {targetInfos}=await browser.send('Target.getTargets');
  return targetInfos.find(x=>x.url===context.documentUrl);
 },'SIDE_PANEL CDP target');
 const attached=await browser.send('Target.attachToTarget',{targetId:sideTarget.targetId,flatten:true});
 side={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,attached.sessionId)};
 await side.send('Runtime.enable');await side.send('Page.enable');
 await visible(side,'#tab-tools');
 await click(side,'#tab-tools');
 await visible(side,'#workbench-tools');
 return {windowId,sessionId:attached.sessionId,launcher:ui.targetId,documentId:context.documentId};
 }
 let panel=await openPanel();
 let dialogs=0;
 const watchDialogs=()=>browser.onEvent(evt=>{
  if(evt.method!=='Page.javascriptDialogOpening'||evt.sessionId!==panel.sessionId)return;
  dialogs++;void browser.send('Page.handleJavaScriptDialog',{accept:false},15000,panel.sessionId).catch(()=>{});
 });
 watchDialogs();
 async function restartOnOriginalArticle(stage){
  await foregroundArticle();
  await stopChrome(true);
  for(const c of [host,article,browser])c?.close?.();
  host=null;article=null;side=null;clip=null;
  if(stage)await stage();
  await startChrome(true);
  assert.equal(await identifyExtension(),extensionId,'restarted Chrome must use same extension ID');
  const restored=await until(async()=> (await browser.send('Target.getTargets')).targetInfos
   .find(row=>row.type==='page'&&row.url===url),'Chrome restored the original article tab');
  page=await connectTab(restored.targetId);article=page.cdp;
  panel=await openPanel();watchDialogs();
 }
 async function foregroundArticle(){
  await browser.send('Target.activateTarget',{targetId:page.targetId});
  await article.send('Page.bringToFront');
  await until(()=>evalIn(host,
   'chrome.tabs.query({active:true,windowId:'+panel.windowId+'}).then(rows=>rows[0]?.url==='+JSON.stringify(url)+')'),
   'fixture remains the Chrome active tab');
 }
 async function reloadVerifiedCandidate(){
  const transition=evidence.fixedBrowser;
  assert.ok(transition?.candidate?.verified&&loadRoot===join(taskRoot,'extension'));
  const {sidebarToolPackageContractHash}=await import('../../src/ui/sidebar-tools/package.js');
  const expected={extensionId,version:transition.candidate.version,contractHash:await sidebarToolPackageContractHash()};
  const probe=()=>evalIn(side,'(async()=>({extensionId:chrome.runtime.id,version:chrome.runtime.getManifest().version,'+
   'reply:await chrome.runtime.sendMessage({protocol:"opendesk.sidebar-tool.bridge.v1",kind:"runtime-contract"})}))()');
  const observation=transition.runtimeContract={expected,before:await probe()};
  assert.equal(observation.before.extensionId,extensionId);
  assert.equal(observation.before.version,expected.version);
  const previous=panel.documentId;
  await evalIn(side,'setTimeout(()=>chrome.runtime.reload(),100); true');
  await until(async()=>{
   try{await evalIn(side,'chrome.runtime.id');return false;}
   catch(error){return /Session with given id not found|Target closed|Execution context was destroyed|Cannot find context/i.test(error.message);}
  },'previous Side Panel invalidated by chrome.runtime.reload');
  observation.previousPanelInvalidated=true;
  // Command-line unpacked CFT may leave the extension unloaded until relaunch.
  // Keep the same profile/load path and let Chrome start its registration normally.
  await restartOnOriginalArticle();
  assert.notEqual(panel.documentId,previous,'Chrome reload replaced the extension document');
  await until(async()=>{
   observation.after=await probe();
   const {extensionId:id,version,reply}=observation.after;
   const data=reply?.data;
   return id===extensionId&&version===expected.version&&reply?.ok===true&&data&&
    Object.keys(data).sort().join(',')==='contractHash,extensionId,version'&&
    data.extensionId===id&&data.version===version&&data.contractHash===expected.contractHash;
  },'reloaded Worker runs the candidate contract',async()=>observation);
 }
 async function loadPackage(path){
  if(await evalIn(side,'document.querySelector("#extension-center-menu").hidden'))await click(side,'#extension-center-more');
  await click(side,'#extension-center-import');
  await visible(side,'#sidebar-tool-file');
  await side.send('DOM.enable');
  const doc=await side.send('DOM.getDocument',{depth:1});
  const inputNode=await side.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#sidebar-tool-file'});
  assert(inputNode.nodeId,'Local package file input missing');
  await side.send('DOM.setFileInputFiles',{nodeId:inputNode.nodeId,files:[path]});
  await visible(side,'#sidebar-tool-preview');
 }
 const openClipper='#extension-center-list [data-extension-key="app:web-markdown-clipper"][data-extension-action="main"][aria-label^="打开「"]';
 const readSelector=(target,selector,prop)=>evalIn(target,'document.querySelector('+JSON.stringify(selector)+')?.'+prop);
 const readStore=key=>evalIn(side,'chrome.storage.local.get('+JSON.stringify(key)+').then(r=>r['+JSON.stringify(key)+'])');
 const installed=async()=>((await readStore('opendesk.sidebar-tools.installed.v1'))||[]).find(row=>row.id===toolId);
 const clipSite=async()=>(await readStore('opendesk.sidebar-tools.clip-sites.v1'))?.[toolId];
 const origin=new URL(url).origin;
 const blocked=async()=>(await clipSite())?.blockedOrigins?.includes(origin);
 async function completedInstall(id,version){
  await until(()=>evalIn(side,'document.querySelector("#sidebar-tool-import").hidden'),id+' installation review completed',
   ()=>describeControl(side,'#sidebar-tool-install'));
  if(version)assert.equal((await installed())?.version,version,'installed registry version');
 }
 async function launchClipper(){
  await selectToolScope(side,'smart');
  await foregroundArticle();
  await click(side,openClipper);
  clip=await iframeWith('#clip-fetch');
 }
 if(acceptance){
  await runAcceptance();
  return;
 }
 // Discover the fixed official release through the visible React list. Row
 // details delegate review and installation to the existing trusted Host.
 await selectToolScope(side,'available');
 await click(side,'#extension-center-list [data-extension-key="app:web-markdown-clipper"][data-extension-action="main"]');
 await visible(side,'#extension-center-detail');
 // Official candidate must stay review-only: no iframe and no content reads.
 await click(side,'#extension-center-detail [data-ec-detail-action="install"]');
 await visible(side,'#sidebar-tool-preview');
 assert.equal(await evalIn(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),0);
 assert.equal(await evalIn(side,'document.querySelector("#sidebar-tool-preview-title").textContent'),'网页剪藏');
 await click(side,'#sidebar-tool-install');
 console.log('R22_NATIVE_STAGE: clipper official install clicked');
 await until(()=>evalIn(side,'document.querySelector("#sidebar-tool-import").hidden'),'clipper installation review completed');
 await selectToolScope(side,'smart');
 await launchClipper();
 await click(clip,'[data-clip-mode=article]');
 await click(clip,'#clip-fetch');
 const extracted=await until(async()=>{
  const out=await readSelector(clip,'#clip-source','value');
  return out?.includes('页面测试')&&out?.includes('const value')?out:null;
 },'trusted content script extracted actual fixture DOM',()=>describeControl(clip,'#clip-status'));
 assert.match(extracted,/重复章节/);
 assert.match(extracted,/\| 列一 \| 列二 \|/);
 assert.doesNotMatch(extracted,/导航和广告不应剪藏|R22_CSS_HIDDEN_SECRET/);
 // Exercise actual Chrome DOM selection, quote and link through the installed trusted relay.
 const selected=await evalIn(article,"(()=>{const text=document.querySelector('article p').firstChild;"+
   "const range=document.createRange();range.setStart(text,0);range.setEnd(text,6);"+
   "const selection=getSelection();selection.removeAllRanges();selection.addRange(range);"+
   "return selection.toString()})()");
 assert.match(selected,/中文测试/);
 await click(clip,'[data-clip-mode=selection]');
 await click(clip,'#clip-fetch');
 const selectedMarkdown=await until(async()=>{
   const text=await evalIn(clip,'document.querySelector("#clip-source").value');
   return text?.includes('中文测试')?text:null;
 },'trusted selected DOM Markdown');
 assert.doesNotMatch(selectedMarkdown,/重复章节|const value/);
 // A visible browser selection excludes CSS-hidden text. The selected DOM
 // range still contains it, so Chrome must prove the trusted relay strips it.
 const fullSelected=await evalIn(article,"(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('article p'));"+
  "const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString()})()");
 assert.doesNotMatch(fullSelected,/R22_CSS_HIDDEN_SECRET/);
 await until(()=>evalIn(clip,'!document.querySelector("#clip-fetch").disabled'),'second selection request available');
 await click(clip,'#clip-fetch');
 const cleanSelected=await until(async()=>{
  const text=await evalIn(clip,'document.querySelector("#clip-source").value');
  return text?.includes('粗体')?text:null;
 },'CSS-hidden selection exclusion');
 assert.doesNotMatch(cleanSelected,/R22_CSS_HIDDEN_SECRET/);
 assert.match(cleanSelected,/\*\*粗体\*\*/);

 await click(clip,'[data-clip-mode=quote]');
 await click(clip,'#clip-fetch');
 const quoted=await until(async()=>{
   const text=await evalIn(clip,'document.querySelector("#clip-source").value');
   return text?.includes('来源：[')?text:null;
 },'selected Markdown quote with source');
 assert.match(quoted,/> 中文测试/);
 await click(clip,'[data-clip-mode=link]');
 await click(clip,'#clip-fetch');
 const linked=await until(async()=>{
   const text=await evalIn(clip,'document.querySelector("#clip-source").value');
   return text?.startsWith('[页面测试')?text:null;
 },'linked page without article body');
 assert.match(linked,/\]\(http:\/\/127\.0\.0\.1:/);
 assert.doesNotMatch(linked,/重复章节|const value/);
 await click(side,'#sidebar-tool-back'); // detail → My Tools
 await click(side,openClipper);
 await click(side,'#sidebar-tool-settings-open');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-deny").disabled'),'clipper site revoke ready');
 await click(side,'#sidebar-tool-settings-deny');
 console.log('R22_NATIVE_STAGE: site revoked in Settings without dialog');
 await until(blocked,'clipper current origin is opted out',()=>describeControl(side,'#sidebar-tool-settings-deny'));
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
 await loadPackage(packagePath('markdown-workbench'));
 await until(()=>evalIn(side,'document.querySelector("#sidebar-tool-preview-title").textContent==="Markdown 工作台"'),'local Markdown package preview');
 await click(side,'#sidebar-tool-install');
 await until(()=>evalIn(side,'document.querySelector("#sidebar-tool-import").hidden'),'workbench installation review completed');
 const openWorkbench='#extension-center-list [data-extension-key="app:markdown-workbench"][data-extension-action="main"][aria-label^="打开「"]';
 await click(side,openWorkbench);
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
 await screenshot(side,'r22-workbench-sidepanel');
 console.log(JSON.stringify({result:'NATIVE_FIXTURE_PASS',installed:['web-markdown-clipper','markdown-workbench'],
  consentDialogs:dialogs,articleBytes:Buffer.byteLength(extracted),
   modes:['article','selection','quote','link'],markdownImport:true,safePreview:true,
  screenshot:join(observations,'r22-workbench-sidepanel.png'),
  publicWebsite:'NOT_TESTED',clipboardSystem:'NOT_TESTED',downloadSave:'NOT_TESTED'}));
 async function runAcceptance(){
  const legacyPath=join(profile,toolId+'-1.2.14.opendesk-tool.json');
  const legacy=process.env.OPENDESK_CLIPPER_LEGACY_PACKAGE
   ?await readFile(resolve(process.env.OPENDESK_CLIPPER_LEGACY_PACKAGE))
   :spawnSync('git',['show','b9398918d:projects/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json'],{maxBuffer:8*1024*1024});
  if(!Buffer.isBuffer(legacy))assert.equal(legacy.status,0,legacy.stderr?.toString());
  const oldBytes=Buffer.isBuffer(legacy)?legacy:legacy.stdout;
  function verifyTool(bytes,version){
   const pkg=JSON.parse(bytes);
   assert.deepEqual({id:pkg.id,version:pkg.version},{id:toolId,version});
   return sha256(bytes);
  }
  evidence.packages={old:verifyTool(oldBytes,'1.2.14')};
  await writeFile(legacyPath,oldBytes);
  const mark=(name,result)=>{checkpoints[name]=result;t.diagnostic(name+' '+JSON.stringify(result));};
  const library=async()=>(await readStore('opendesk.sidebar-tools.data.v1:'+toolId))?.clips?.items||[];
  const recentCount=expected=>until(async()=>Number(await readSelector(clip,'#clip-recent-count','textContent'))===expected,
   'recent count '+expected,()=>describeControl(clip,'#clip-recent-count'));
  const leaveTool=async(...returnViews)=>{
   for(const view of returnViews){
    await click(side,'#sidebar-tool-back');
    await visible(clip,view);
   }
   await click(side,'#sidebar-tool-back');
   await visible(side,'#extension-center-list-view');
  };
  const attr=(sel,name)=>evalIn(clip,'document.querySelector('+JSON.stringify(sel)+')?.getAttribute('+JSON.stringify(name)+')');
  const mode=name=>until(()=>attr('[data-clip-mode='+name+']','aria-pressed').then(x=>x==='true'),'active mode '+name,
   ()=>describeControl(clip,'#clip-fetch'));
  const markdown=()=>readSelector(clip,'#clip-source','value');
  const clipStatus=()=>describeControl(clip,'#clip-status');
  const processed=()=>until(()=>attr('#clip-home','data-clip-state').then(x=>x==='ready'),'clip operation finished',clipStatus);
  const textWith=marker=>until(async()=>{const value=await markdown();return value?.includes(marker)?value:null;},'Markdown contains '+marker,clipStatus);
  const initial=await installed();
  mark('freshProfileInitialVersion',initial?.version??null);
  await loadPackage(legacyPath);
  const baselineReview=await readSelector(side,'#sidebar-tool-update-versions','textContent');
  if(initial)assert.match(baselineReview,/新 v1\.2\.14/,'fresh preinstall should be disclosed before staging baseline');
  else assert.match(await readSelector(side,'#sidebar-tool-preview-version','textContent'),/1\.2\.14/);
  await screenshot(side,'r2-01-legacy-review');
  await click(side,'#sidebar-tool-install');
  await completedInstall('legacy Clipper','1.2.14');
  const installedBaseline=await installed();
  if(baselineBinary){
   // Reopen the old host from durable install state before creating history.
   await restartOnOriginalArticle();
   assert.deepEqual(await installed(),installedBaseline,'legacy installation persisted across clean restart');
  }
  await launchClipper();
  await recentCount(0);
  const historic=Array.from({length:3},(_,i)=>'# R2 Historic '+i+'\n\n'+
   ('真实历史正文 '+i+' · 0123456789abcdef\n').repeat(400)+'\nHISTORIC-END-'+i);
  const historicBytes=historic.reduce((n,x)=>n+Buffer.byteLength(x),0);
  assert.ok(historicBytes>32*1024);
  for(const [i,body] of historic.entries()){
   await click(clip,'#clip-recent-new');
   await type(clip,'#clip-note-body',body);
   const savedStatus=await readSelector(clip,'#clip-status','textContent');
   await click(clip,'#clip-note-save');
   await recentCount(i+1);
   await until(async()=>await readSelector(clip,'#clip-status','textContent')==='已保存完整正文',
    'historic save and list refresh completed (previous status: '+savedStatus+')',clipStatus);
  }
  const storedBefore=await library();
  assert.equal(storedBefore.length,historic.length);
  for(const body of historic)assert.ok(storedBefore.some(item=>item.body===body),'old installed UI wrote full historic note');
  mark('legacyNotesSaved',{count:historic.length,bytes:historicBytes,bodyHashes:historic.map(sha256),
   recordsSha256:sha256(JSON.stringify(storedBefore)),installedToolSha256:sha256(JSON.stringify(installedBaseline))});
  await screenshot(side,'r2-02-legacy-notes');
  await leaveTool();
  if(baselineBinary){
   await restartOnOriginalArticle(prepareCandidate);
   await reloadVerifiedCandidate();
   const stillLegacy=await installed();
   assert.equal(stillLegacy?.version,'1.2.14','Browser switch must leave the installed tool at 1.2.14');
   assert.deepEqual(stillLegacy,installedBaseline,'Browser switch must leave the installed tool bytes unchanged');
   assert.deepEqual(await library(),storedBefore,'Browser switch alone retained each complete historical record');
   await launchClipper();
   await recentCount(historic.length);
   await click(clip,'#clip-recent-list [aria-label="阅读 R2 Historic 0"]');
   await visible(clip,'#clip-note-read-body');
   assert.match(await readSelector(clip,'#clip-note-read-body','textContent'),/HISTORIC-END-0/);
   await screenshot(side,'r2-02b-new-browser-legacy-note');
   evidence.fixedBrowser.status='PASS';
   mark('fixedBrowserUpgrade',{extensionId,toolVersion:stillLegacy.version,recordsSha256:sha256(JSON.stringify(storedBefore)),
    installedToolSha256:sha256(JSON.stringify(stillLegacy)),legacyReaderRendered:true});
   await leaveTool('#clip-home');
  }
  const candidatePackage=join(baselineBinary?loadRoot:extension,'official-tools',toolId,toolId+'.opendesk-tool.json');
  evidence.packages.candidate=verifyTool(await readFile(candidatePackage),'1.2.15');
  await loadPackage(candidatePackage);
  await visible(side,'#sidebar-tool-update');
  assert.match(await readSelector(side,'#sidebar-tool-update-versions','textContent'),/1\.2\.14.*1\.2\.15/);
  assert.deepEqual(await library(),storedBefore,'review alone must not mutate history');
  await screenshot(side,'r2-03-upgrade-review');
  await click(side,'#sidebar-tool-install');
  await completedInstall('Clipper update','1.2.15');
  assert.deepEqual(await library(),storedBefore,'same-ID update retained historical IDs, bodies and metadata');
  mark('sameIdUpgrade',{version:'1.2.15',historicalRecordsUnchanged:true,
   installedToolSha256:sha256(JSON.stringify(await installed()))});
  await launchClipper();
  await recentCount(3);
  await mode('region');
  assert.equal(await attr('[data-clip-mode]:first-child','data-clip-mode'),'region');
  await screenshot(side,'r2-04-installed-default');

  async function startPick(selector,modifiers=0){
   await click(clip,'#clip-fetch');
   await until(()=>evalIn(article,'!!document.querySelector("[data-opendesk-clip-root]")'),'installed region picker started',clipStatus);
   const point=await evalIn(article,'(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
    'n.scrollIntoView({block:"center"});const r=n.getBoundingClientRect();return {x:r.left+12,y:r.top+r.height/2};})()');
   await article.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point,modifiers});
   await until(()=>evalIn(article,'document.querySelector("[data-opendesk-clip-root]")?.style.display==="block"'),'region hover highlight');
   return point;
  }
  const first=await startPick('#r2-small');
  await mouseClick(article,first);
  const small=await textWith('R2-FIRST-REGION');
  assert.match(small,/\*\*bold region\*\*/);
  assert.doesNotMatch(small,/R2-PARENT-ONLY|R2-APPENDED-REGION/);
  await startPick('#r2-small');
  await key(article,'ArrowUp',{windowsVirtualKeyCode:38});
  await key(article,'Enter',{windowsVirtualKeyCode:13});
  const larger=await textWith('R2-PARENT-ONLY');
  assert.match(larger,/R2-FIRST-REGION/);
  assert.doesNotMatch(larger,/R2-APPENDED-REGION/);
  await startPick('#r2-small');
  await key(article,'ArrowUp',{windowsVirtualKeyCode:38});
  await key(article,'ArrowDown',{windowsVirtualKeyCode:40});
  await key(article,'Enter',{windowsVirtualKeyCode:13});
  await until(async()=>await markdown()===small,'ArrowDown shrinks to the original child',clipStatus);
  await startPick('#r2-small');
  await key(article,'ArrowUp',{windowsVirtualKeyCode:38});
  await key(article,'Enter',{windowsVirtualKeyCode:13});
  await textWith('R2-PARENT-ONLY');
  await startPick('#r2-small');
  await key(article,'Escape',{windowsVirtualKeyCode:27});
  await processed();
  assert.equal(await markdown(),larger,'Esc preserves previous Markdown');
  const appendModifier=process.platform==='darwin'?4:2;
  const next=await startPick('#r2-append',appendModifier);
  await until(()=>evalIn(article,'getComputedStyle(document.querySelector("[data-opendesk-clip-root]")).borderTopColor==="rgb(14, 165, 233)"&&'+
   'getComputedStyle(document.querySelector("[data-opendesk-clip-root] span")).display==="block"'),'append shows blue border and plus badge');
  await screenshot(article,'r2-05-append-highlight');
  await mouseClick(article,next,appendModifier);
  const appended=await textWith('R2-APPENDED-REGION');
  assert.match(appended,/R2-FIRST-REGION[\s\S]*R2-PARENT-ONLY[\s\S]*R2-APPENDED-REGION/);
  mark('region',{firstHit:true,upAndDown:true,cancelKeptResult:true,modifierAppend:true});

  await click(clip,'#clip-show-source');
  const draft=appended.trimEnd()+'\n\n## R2-EDITED-DRAFT\n\nEdited **Markdown**.\n';
  await type(clip,'#clip-source',draft);
  const afterEdit=await startPick('#r2-after-edit',appendModifier);
  await mouseClick(article,afterEdit,appendModifier);
  const edited=await textWith('R2-APPENDED-AFTER-EDIT');
  assert.ok(edited.startsWith(draft.trimEnd()),'append preserves manual edits');
  const atLimit='R2-FULL-DRAFT '+ 'x'.repeat(159970);
  await type(clip,'#clip-source',atLimit);
  const overLimit=await startPick('#r2-after-edit',appendModifier);
  await mouseClick(article,overLimit,appendModifier);
  await until(async()=>/追加后超过 160,000 字节/.test(await readSelector(clip,'#clip-status','textContent')),
   'oversize append reports why it failed',clipStatus);
  assert.equal(await markdown(),atLimit,'oversize append preserves the full draft');
  await screenshot(side,'r2-oversize-append');
  await type(clip,'#clip-source',edited);
  await click(clip,'[data-clip-mode=link]');
  await click(clip,'[data-clip-mode=region]');
  assert.equal(await markdown(),edited,'mode round trip kept the editable draft');
  await click(clip,'#clip-show-preview');
  await visible(clip,'#clip-preview h2');
  assert.ok(await evalIn(clip,'[...document.querySelectorAll("#clip-preview h2")].some(h=>h.textContent==="R2-EDITED-DRAFT")'));
  await screenshot(side,'r2-06-edited-preview');
  await click(clip,'#clip-save');
  await recentCount(4);
  assert.equal((await library()).find(item=>item.kind==='clip')?.body,edited,'saved full edited Markdown');
  mark('editedMarkdown',{bodySha256:sha256(edited),appendAfterEdit:true,oversizeAppendKeptDraft:true,preview:true,save:true});

  const downloads=join(profile,'downloads');
  await mkdir(downloads,{recursive:true});
  await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await click(clip,'#clip-download');
  const file=await until(async()=>{
   const name=(await readdir(downloads)).find(x=>x.endsWith('.md'));
   if(name&&(await readFile(join(downloads,name),'utf8'))===edited)return name;
  },'Chrome downloaded exact edited Markdown',clipStatus);
  mark('download',{file,bytes:Buffer.byteLength(edited),sha256:sha256(edited)});
  // A disposable Chrome profile still shares the operating system clipboard.
  // Explicitly enable this only on an isolated, disposable clipboard session.
  if(process.env.OPENDESK_NATIVE_ISOLATED_CLIPBOARD==='1'){
   await browser.send('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite']});
   const checkedCopy=async(selector,expected)=>{
    await click(clip,selector);
    await until(()=>evalIn(article,'navigator.clipboard.readText()').then(value=>value===expected),'clipboard byte-for-byte readback',clipStatus);
   };
   await checkedCopy('#clip-copy',edited);
   const card='#clip-recent-list .clip-note-card:has([aria-label="阅读 R2 Historic 2"])';
   await checkedCopy(card+' button[aria-label^="复制 "]',historic[2]);
   await click(clip,'#clip-view-all');
   await checkedCopy(card.replace('clip-recent-list','clip-note-list')+' button[aria-label^="复制 "]',historic[2]);
   await click(clip,'#clip-notes-back');
   mark('clipboard',{edited:true,recentFull:true,libraryFull:true});
  }else mark('clipboard','NOT_TESTED: CFT profile shares the system clipboard');

  await click(clip,'[data-clip-mode=article]');
  await until(async()=> (await readStore('opendesk.sidebar-tools.data.v1:'+toolId))?.lastMode==='article',
   'mode preference durable even when library exceeds 32 KiB',clipStatus);
  async function verifyReopened(label){
   await launchClipper();
   await mode('article');
   await recentCount(4);
   await click(clip,'#clip-fetch');
   await textWith('const value = 42;');
   const historicalCard='#clip-recent-list [aria-label="阅读 R2 Historic 0"]';
   await click(clip,historicalCard);
   await visible(clip,'#clip-note-read-body');
   assert.match(await readSelector(clip,'#clip-note-read-body','textContent'),/HISTORIC-END-0/);
   await click(clip,'#clip-note-read-edit');
   await visible(clip,'#clip-note-body');
   assert.equal(await readSelector(clip,'#clip-note-body','value'),historic[0]);
   const after=await library();
   assert.deepEqual(after.filter(item=>item.kind==='note'),storedBefore);
   await screenshot(side,'r2-'+label);
   mark(label,{activeTab:url,restoredMode:'article',fullHistoricNote:true,retainedRecords:after.length});
  }
  const closedPanelId=panel.documentId;
  await evalIn(host,'chrome.sidePanel.close({windowId:'+panel.windowId+'})');
  await until(()=>evalIn(host,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(rows=>rows.length===0)'),
   'real Side Panel context closed');
  clip=null;side=null;
  panel=await openPanel();watchDialogs();
  assert.notEqual(panel.documentId,closedPanelId,'reopen must create a new Side Panel document');
  await verifyReopened('07-panel-reopen');
  await restartOnOriginalArticle();
  await verifyReopened('08-chrome-restart');
  // Keep the historical records intact while exercising destructive actions.
  await leaveTool('#clip-note-reader','#clip-home');
  await launchClipper();
  await click(clip,'#clip-recent-new');
  const disposable='# R2 disposable note\n\n**Visible reader body.**\n';
  await type(clip,'#clip-note-body',disposable);
  await click(clip,'#clip-note-save');
  await recentCount(5);
  const disposableRecord=(await library()).find(item=>item.body===disposable);
  assert.ok(disposableRecord,'disposable note saved through the editor');
  const noteName='[aria-label="阅读 R2 disposable note"]';
  async function checkCardLayout(list){
   const card=list+' .clip-note-card:has('+noteName+')';
   await visible(clip,card);
   const point=await evalIn(clip,'(()=>{const c=document.querySelector('+JSON.stringify(card)+');c.scrollIntoView({block:"center",behavior:"instant"});const r=c.getBoundingClientRect();return {x:r.left+12,y:r.top+12};})()');
   await clip.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
   const layout=await until(()=>evalIn(clip,'(()=>{const c=document.querySelector('+JSON.stringify(card)+');'+
    'const bar=c.querySelector(".clip-note-buttons"),cr=c.getBoundingClientRect(),br=bar.getBoundingClientRect();'+
    'const buttons=[...bar.querySelectorAll("button")];if(getComputedStyle(bar).opacity!=="1")return false;'+
    'return {width:innerWidth,cardWidth:cr.width,actions:buttons.map(b=>b.getAttribute("aria-label")),'+
    'inside:br.left>=cr.left&&br.right<=cr.right&&br.top>=cr.top&&br.bottom<=cr.bottom,'+
    'hit:buttons.every(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),'+
    'noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth};})()'),'visible card actions in '+list);
   assert.equal(layout.inside&&layout.hit&&layout.noHorizontalOverflow,true,JSON.stringify(layout));
   assert.deepEqual(layout.actions.map(s=>s.split(' ')[0]),['复制','编辑','删除']);
   return layout;
  }
  const recentLayout=await checkCardLayout('#clip-recent-list');
  await screenshot(side,'r2-09-recent-actions');
  await click(clip,'#clip-view-all');
  const libraryLayout=await checkCardLayout('#clip-note-list');
  await screenshot(side,'r2-10-library-actions');
  await click(clip,'#clip-note-list '+noteName);
  await visible(clip,'#clip-note-read-body strong');
  assert.equal(await readSelector(clip,'#clip-note-read-body strong','textContent'),'Visible reader body.');
  await visible(clip,'#clip-note-read-copy');
  await visible(clip,'#clip-note-read-download');
  await visible(clip,'#clip-note-read-remove');
  await click(clip,'#clip-note-read-edit');
  await visible(clip,'#clip-note-body');
  assert.equal(await readSelector(clip,'#clip-note-body','value'),disposable);
  const revised=disposable+'\nT5-EDIT-RECEIPT\n';
  await type(clip,'#clip-note-body',revised);
  await click(clip,'#clip-note-save');
  await until(async()=> (await readSelector(clip,'#clip-note-read-body','textContent'))?.includes('T5-EDIT-RECEIPT'),
   'edited note rendered in reader');
  assert.equal((await library()).find(item=>item.id===disposableRecord.id)?.body,revised);
  await click(clip,'#clip-note-read-remove');
  await visible(clip,'.clip-remove-confirm');
  await click(clip,'.clip-remove-confirm button:not(.confirm-danger)');
  assert.equal((await library()).find(item=>item.id===disposableRecord.id)?.body,revised,'cancel leaves the note intact');
  await click(clip,'#clip-note-read-remove');
  await visible(clip,'.clip-remove-confirm');
  await screenshot(side,'r2-11-delete-review');
  await click(clip,'.clip-remove-confirm .confirm-danger');
  await until(async()=>!(await library()).some(item=>item.id===disposableRecord.id),'confirmed deletion persisted');
  await visible(clip,'#clip-note-list');
  assert.equal(await evalIn(clip,'document.querySelector('+JSON.stringify('#clip-note-list '+noteName)+')===null'),true);
  assert.deepEqual((await library()).filter(item=>item.kind==='note'),storedBefore);
  mark('T5NoteActions',{recentLayout,libraryLayout,read:true,edit:true,cancelDelete:true,confirmDelete:true});
  assert.equal(dialogs,0,'No JavaScript dialog was allowed');
 }
});
