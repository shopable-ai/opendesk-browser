// Actual OpenDesk MV3, real native Side Panel and opaque sandbox.
// Verify both installation worlds under the original Chrome Host and Page Authority.
// A missing real ChatGPT conversation still prevents Page RPC; no SDK mock.
// Native Mac sending remains NOT_TESTED.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {SIDEBAR_TOOL_STORE,serializeSidebarToolPackage,validateSidebarToolPackage}
  from '../../../../src/ui/sidebar-tools/package.js';
import {SEND_QUEUE_PIN} from '../../../../src/platform/host/send-queue-admission.js';
import {validatePageInstallPackage} from '../../../../src/scripting/user-scripts/page-install-package.js';
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const out=resolve(process.argv[2]||'artifacts/app-ci/ai-send-queue/installed');
await mkdir(out,{recursive:true});
// Optional independent production snapshot; defaults preserve the existing CI run.
// SEND_QUEUE_HEADED=1 (or true) removes --headless=new.
const extension=resolve(process.env.SEND_QUEUE_EXTENSION_PATH||'dist/development');
const candidate=resolve(process.env.SEND_QUEUE_CANDIDATE_PATH||
  'artifacts/app-ci/ai-send-queue/candidate.opendesk-tool.json');
const pageCandidate=resolve('examples/sidebar-tools/ai-send-queue/ai-send-queue.opendesk-page.json');
const headed=process.env.SEND_QUEUE_HEADED||'false';
assert.ok(['0','1','false','true'].includes(headed),'SEND_QUEUE_HEADED must be 0, 1, false or true');
const headless=!(headed==='1'||headed==='true');
const report={scope:'REAL_CHROME_MV3_BOTH_INSTALLATIONS',simulatedSDK:false,macChromeTested:false,
  extension,candidate,platform:process.platform,headless,chromeVersion:null,
  manifestSha256:null,extensionId:null,screenshots:{},
  liveChatGPTSending:'NOT_TESTED',pageInstalled:false,pageReadback:'NOT_TESTED',read:'NOT_TESTED',
  nativePanelReopen:'NOT_TESTED',unauthorizedSameId:'NOT_TESTED',status:'RUNNING',events:[]};
let chrome,profile,socket,host,extId,demoServer,seq=0;const pending=new Map(),sessions=new Map();
const exceptions=[];
function cdp(method,params={},sessionId=null){
  return new Promise((ok,fail)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP_TIMEOUT '+method));},20000);
    pending.set(id,{ok(value){clearTimeout(timer);ok(value);},fail(error){clearTimeout(timer);fail(error)}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function until(fn,label,timeout=25000){
  const deadline=Date.now()+timeout;let failure='';
  while(Date.now()<deadline){
    try{const result=await fn();if(result)return result;}catch(e){failure=String(e.message||e);}
    await delay(130);
  }
  throw Error('TIMEOUT '+label+(failure?' :: '+failure:''));
}
async function attach(targetId){
  if(sessions.has(targetId))return sessions.get(targetId);
  const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  await cdp('Runtime.enable',{},sessionId);
  sessions.set(targetId,sessionId);
  return sessionId;
}
async function evalJs(sessionId,js){
  const value=await cdp('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true},sessionId);
  if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);
  return value.result?.value;
}
async function click(sessionId,selector){
  const at=await until(()=>evalJs(sessionId,
    '(()=>{const e=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!e||e.disabled||!e.isConnected||!e.getClientRects().length)return null;'+
    'e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();'+
    'const x=r.x+r.width/2,y=r.y+r.height/2;'+
    'return r.width>0&&r.height>0&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&'+
    'e.contains(document.elementFromPoint(x,y))?{x,y}:null})()'),'clickable '+selector);
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,x:at.x,y:at.y,button:'left',
      ...(type==='mouseMoved'?{}:{clickCount:1})},sessionId);
}
async function screenshot(name,frame,readback){
  const expected=readback.ok?readback.value.reason:readback.message;
  assert.ok(expected,'Host supplied visible state reason');
  const visibleStatus=await until(()=>evalJs(frame,
    `(()=>{const e=document.querySelector('.send-queue-empty[role="status"]');`+
    'return e&&e.getClientRects().length&&e.textContent.trim()==='+JSON.stringify(expected)+
    '?e.textContent.trim():null})()'),'rendered '+name);
  await cdp('Page.bringToFront',{},host);
  if(!headless)assert.equal(await evalJs(host,'document.visibilityState'),'visible');
  const shot=await cdp('Page.captureScreenshot',{format:'png'},host);
  const bytes=Buffer.from(shot.data,'base64');
  assert.ok(bytes.length>0,'real screenshot '+name);
  const file=join(out,name+'.png');
  await writeFile(file,bytes);
  report.screenshots[name]={path:file,sha256:sha(bytes),visibleStatus};
}
function identity(value){
  return {id:value.id,version:value.version,
    serializedSha256:sha(Buffer.from(serializeSidebarToolPackage(value)))};
}
async function storedPackage(id){
  return evalJs(host,'chrome.storage.local.get('+JSON.stringify(SIDEBAR_TOOL_STORE)+
    ').then(x=>(x['+JSON.stringify(SIDEBAR_TOOL_STORE)+']||[]).find(p=>p.id==='+JSON.stringify(id)+')||null)');
}
async function importTool(file,expectVersion){
  await click(host,'#extension-center-more');
  await until(()=>evalJs(host,'!document.querySelector("#extension-center-menu")?.hidden'),'import menu');
  await click(host,'#extension-center-import');
  await cdp('DOM.enable',{},host);
  const {root}=await cdp('DOM.getDocument',{depth:1},host);
  const {nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},host);
  assert.ok(nodeId,'real installed-tool file input');
  await cdp('DOM.setFileInputFiles',{nodeId,files:[file]},host);
  const reviewed=await until(()=>evalJs(host,
    '(()=>{const v=document.querySelector("#sidebar-tool-preview");'+
    'if(!v||v.hidden)return null;return {title:document.querySelector("#sidebar-tool-preview-title")?.textContent,'+
    'disabled:document.querySelector("#sidebar-tool-install")?.disabled}})()'),'installed tool review');
  assert.equal(reviewed.title?.trim(),'AI 消息发送队列');
  assert.equal(reviewed.disabled,false);
  await click(host,'#sidebar-tool-install');
  const installed=await until(async()=>{
    const value=await storedPackage('ai-send-queue');
    return value?.version===expectVersion?value:null;
  },'trusted Chrome storage readback '+expectVersion);
  report.events.push('HOST_USER_GESTURE_INSTALL_'+expectVersion);
  return installed;
}
// The same native import sheet reviews a Page JSON and requests origin permission
// under a real click. This is not a synthetic Page Host or a simulated install.
async function importPage(file){
  await click(host,'#extension-center-more');
  await until(()=>evalJs(host,'!document.querySelector("#extension-center-menu")?.hidden'),'Page import menu');
  await click(host,'#extension-center-import');
  await cdp('DOM.enable',{},host);
  const {root}=await cdp('DOM.getDocument',{depth:1},host);
  const {nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},host);
  assert.ok(nodeId,'real Page import input');
  await cdp('DOM.setFileInputFiles',{nodeId,files:[file]},host);
  const reviewed=await until(()=>evalJs(host,
    '(()=>{const p=document.querySelector("#sidebar-tool-preview");'+
    'const t=document.querySelector("#sidebar-tool-preview-version")?.textContent;'+
    'return p&&!p.hidden&&t?.includes("r12")&&!document.querySelector("#sidebar-tool-install")?.disabled?'+
    '{title:document.querySelector("#sidebar-tool-preview-title")?.textContent,version:t}:null})()'),
    'Page candidate review');
  assert.equal(reviewed.title?.trim(),'AI 消息发送队列');
  await click(host,'#sidebar-tool-install');
  const receipt=await until(()=>evalJs(host,
    '(()=>{const s=document.querySelector("#page-install-import-status");'+
    'return s?.dataset.state==="installed"&&s.dataset.installationId&&s.dataset.manifestHash?'+
    '{state:s.dataset.state,id:s.dataset.installationId,hash:s.dataset.manifestHash,text:s.textContent}:null})()'),
    'Page Authority and native Chrome registration readback',45000);
  assert.match(receipt.text,/r12/);
  report.pageInstalled=true;
  report.pageReadback='PASS_PAGE_AUTHORITY_REGISTERED';
  report.events.push('REAL_PAGE_USER_GESTURE_INSTALL','REAL_PAGE_AUTHORITY_READBACK');
  await click(host,'#sidebar-tool-import-close');
  return receipt;
}
async function openTool(){
  await until(()=>evalJs(host,
    '!!document.querySelector(\'#extension-center-list button[data-extension-key="app:ai-send-queue"][data-extension-action="main"]\')'),
    'installed product primary action');
  await click(host,'#extension-center-list button[data-extension-key="app:ai-send-queue"][data-extension-action="main"]');
  const target=await until(async()=>{
    const all=(await cdp('Target.getTargets')).targetInfos;
    return all.find(x=>x.type==='iframe'&&x.url.startsWith('chrome-extension://'+extId+'/')&&
      x.url.includes('/sidebar-tools/sandbox.html'));
  },'actual opaque tool iframe');
  const frame=await attach(target.targetId);
  await until(()=>evalJs(frame,
    'document.querySelector("#tool-status")?.dataset.state==="ready"&&'+
    '!!document.querySelector(".send-queue-app")'),'React 19 Sidebar render');
  const info=await evalJs(frame,
    '({sdk:typeof OpenDeskTool?.request,origin:globalThis.origin,'+
    'runtime:typeof globalThis.chrome?.runtime,storage:typeof globalThis.chrome?.storage,'+
    'cookies:typeof globalThis.chrome?.cookies,permissions:typeof globalThis.chrome?.permissions,'+
    'tabs:typeof globalThis.chrome?.tabs,userScripts:typeof globalThis.chrome?.userScripts,'+
    'react:globalThis.OpenDeskPageReact?.version,rows:document.querySelectorAll(".send-queue-row").length})');
  // Chrome can expose a harmless web chrome namespace; native APIs and the
  // extension origin must remain unavailable in the actual manifest sandbox.
  report.sandboxReadbacks??=[];report.sandboxReadbacks.push(info);
  assert.deepEqual(info,{sdk:'function',origin:'null',runtime:'undefined',storage:'undefined',
    cookies:'undefined',permissions:'undefined',tabs:'undefined',userScripts:'undefined',
    react:'19.2.0',rows:0});
  return frame;
}
async function getQueue(frame){
  return evalJs(frame,'OpenDeskTool.request("sendQueue.snapshot",{}).then('+
    'value=>({ok:true,value}),error=>({ok:false,code:error.code,message:error.message}))');
}
try{
  // Use the repository's real manual-test page as the active HTTP target.
  // An extension/about:blank tab is correctly rejected before queue admission.
  const demoUrl='http://127.0.0.1:43111/demo-form.html';
  const demoBytes=await readFile(new URL('../../../tasks/demo-form.html',import.meta.url));
  let existingDemo;
  try{const response=await fetch(demoUrl,{signal:AbortSignal.timeout(2000)});
    if(response.ok)existingDemo=Buffer.from(await response.arrayBuffer());}catch{}
  if(existingDemo)assert.equal(sha(existingDemo),sha(demoBytes),'existing standard demo server');
  else{
    demoServer=createServer((request,response)=>{
      if(request.url!=='/demo-form.html'){response.writeHead(404);response.end();return;}
      response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(demoBytes);
    });
    await new Promise((ok,fail)=>{demoServer.once('error',fail);demoServer.listen(43111,'127.0.0.1',ok);});
  }
  const bytes=await readFile(candidate),tool=validateSidebarToolPackage(JSON.parse(bytes));
  report.candidateIdentity={...identity(tool),path:candidate,fileSha256:sha(bytes)};
  assert.equal(sha(bytes),SEND_QUEUE_PIN.toolPackageSha256,'source-bound candidate');
  assert.equal(sha(Buffer.from(serializeSidebarToolPackage(tool))),SEND_QUEUE_PIN.toolPackageSha256);
  assert.equal(tool.version,'0.1.13');
  const pagePackage=await validatePageInstallPackage(JSON.parse(await readFile(pageCandidate,'utf8')));
  assert.equal(pagePackage.programId,SEND_QUEUE_PIN.pageProgramId);
  assert.equal(pagePackage.revision,SEND_QUEUE_PIN.pageRevision);
  assert.equal(pagePackage.sourceHash,SEND_QUEUE_PIN.pageSourceHash,'Page source-bound candidate');
  const manifestBytes=await readFile(join(extension,'manifest.json'));
  report.manifestSha256=sha(manifestBytes);
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.manifest_version,3);
  profile=await mkdtemp(join(tmpdir(),'sq-native-ui-'));
  const args=['--disable-gpu','--disable-dev-shm-usage','--no-first-run','--use-mock-keychain',
    '--no-default-browser-check','--password-store=basic','--user-data-dir='+profile,
    '--remote-debugging-port=0','--disable-extensions-except='+extension,
    '--load-extension='+extension,...(headless?['--headless=new']:[]),'about:blank'];
  if(process.getuid?.()===0||process.env.GITHUB_ACTIONS==='true')args.unshift('--no-sandbox');
  chrome=spawn(process.env.CHROME_BIN||'chromium',args,{stdio:['ignore','ignore','pipe']});
  let processError;chrome.once('error',e=>{processError=e;});
  let endpoint;
  await until(async()=>{
    if(processError)throw processError;
    if(chrome.exitCode!==null)throw Error('Chrome exited before CDP');
    try{const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
      if(lines.length>=2)endpoint='ws://127.0.0.1:'+lines[0]+lines[1];
    }catch{}
    return endpoint;
  },'CDP endpoint');
  socket=new WebSocket(endpoint);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data),p=pending.get(m.id);
    if(p){pending.delete(m.id);m.error?p.fail(Error(m.error.message)):p.ok(m.result);}
    if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails?.text||'exception');
  });
  report.chromeVersion=await cdp('Browser.getVersion');
  await cdp('Target.setDiscoverTargets',{discover:true});
  const worker=await until(async()=>{
    const all=(await cdp('Target.getTargets')).targetInfos;
    return all.find(t=>t.type==='service_worker'&&t.url.includes('/'+manifest.background.service_worker));
  },'installed MV3 service worker');
  extId=new URL(worker.url).host;
  report.extensionId=extId;
  const bootstrapTab=await cdp('Target.createTarget',{url:'chrome-extension://'+extId+'/sidepanel.html'});
  const bootstrap=await attach(bootstrapTab.targetId);
  const windowId=await evalJs(bootstrap,'chrome.windows.getCurrent().then(x=>x.id)');
  const contentTab=await cdp('Target.createTarget',{url:demoUrl});
  const content=await attach(contentTab.targetId);
  await until(()=>evalJs(content,'location.href==='+JSON.stringify(demoUrl)+
    '&&document.readyState==="complete"'),'real HTTP demo document');
  await cdp('Page.bringToFront',{},content);
  report.activePage=await until(()=>evalJs(bootstrap,
    'chrome.tabs.query({active:true,windowId:'+JSON.stringify(windowId)+'}).then(xs=>'+
    'xs.find(x=>x.url==='+JSON.stringify(demoUrl)+')||null)'),'active HTTP Chrome tab');
  const open=await cdp('Runtime.evaluate',{
    expression:'chrome.sidePanel.open({windowId:'+JSON.stringify(windowId)+'})',
    userGesture:true,awaitPromise:true,returnByValue:true},bootstrap);
  if(open.exceptionDetails)throw Error('NATIVE_PANEL_OPEN '+open.exceptionDetails.text);
  const context=await until(()=>evalJs(bootstrap,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(xs=>xs.find(x=>'+
    'x.documentUrl?.startsWith('+JSON.stringify('chrome-extension://'+extId+'/sidepanel.html')+')&&'+
    'new URL(x.documentUrl).searchParams.has("hostInstanceId"))||null)'),
    'native Side Panel context');
  assert.equal(context.contextType,'SIDE_PANEL');
  const panel=await until(async()=>{
    const all=(await cdp('Target.getTargets')).targetInfos;
    return all.find(x=>x.targetId!==bootstrapTab.targetId&&x.url===context.documentUrl);
  },'native panel target');
  host=await attach(panel.targetId);
  await cdp('Page.enable',{},host);
  await until(()=>evalJs(host,
    'document.querySelector("#extension-center-list")?.dataset.opendeskReactOwner==="extension-list"'),
    'single real React extension list');
  await click(host,'#tab-tools');
  await until(()=>evalJs(host,'!document.querySelector("#workbench-tools")?.hidden'),'extension center visible');
  const installed=await importTool(candidate,'0.1.13');
  assert.equal(sha(Buffer.from(serializeSidebarToolPackage(installed))),SEND_QUEUE_PIN.toolPackageSha256);
  report.installedIdentity=identity(installed);
  const installedReadback=await storedPackage('ai-send-queue');
  assert.equal(installedReadback?.version,'0.1.13');
  assert.deepEqual(identity(installedReadback),identity(tool),'installed exact-byte readback');
  report.installedReadbackIdentity=identity(installedReadback);
  const active=await openTool();
  const result=await getQueue(active);
  report.initialQueueReadback=result;
  assert.equal(result.ok,true,'pinned tool may reach the trusted Host');
  assert.equal(result.value.status,'unavailable','no ChatGPT document is selected');
  await screenshot('installed-react-page-unavailable',active,result);
  report.read='PASS_TRUSTED_HOST_PAGE_UNAVAILABLE';
  report.events.push('REAL_SIDE_PANEL_REACT_OPEN','REAL_HOST_REFUSES_MISSING_PAGE');
  await click(host,'#sidebar-tool-back');
  await until(()=>evalJs(host,'!document.querySelector("#sidebar-tool-frame iframe")'),
    'tool frame closes');
  await importPage(pageCandidate);
  const bothInstalled=await openTool();
  const withoutWebsite=await getQueue(bothInstalled);
  assert.equal(withoutWebsite.ok,true,'both installed packages retain trusted Host access');
  assert.equal(withoutWebsite.value.status,'unavailable','Page registration cannot invent an active ChatGPT document');
  report.events.push('REAL_BOTH_PACKAGES_INSTALLED_NO_CHATGPT_TARGET');
  await click(host,'#sidebar-tool-back');
  await until(()=>evalJs(host,'!document.querySelector("#sidebar-tool-frame iframe")'),
    'tool frame closes after combined installation');
  // A tool re-open is not a Side Panel re-open. Exercise the native Chrome
  // lifecycle and prove the old SIDE_PANEL document actually disappeared.
  await evalJs(bootstrap,'chrome.sidePanel.close({windowId:'+JSON.stringify(windowId)+'})');
  await until(()=>evalJs(bootstrap,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(xs=>'+
    '!xs.some(x=>x.documentId==='+JSON.stringify(context.documentId)+'))'),
    'native Side Panel document closed');
  report.events.push('REAL_NATIVE_SIDE_PANEL_CLOSED');
  const reopened=await cdp('Runtime.evaluate',{
    expression:'chrome.sidePanel.open({windowId:'+JSON.stringify(windowId)+'})',
    userGesture:true,awaitPromise:true,returnByValue:true},bootstrap);
  if(reopened.exceptionDetails)throw Error('NATIVE_PANEL_REOPEN '+reopened.exceptionDetails.text);
  const reopenedContext=await until(()=>evalJs(bootstrap,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(xs=>xs.find(x=>'+
    'x.documentUrl?.startsWith('+JSON.stringify('chrome-extension://'+extId+'/sidepanel.html')+')&&'+
    'new URL(x.documentUrl).searchParams.has("hostInstanceId")&&'+
    'x.documentId!=='+JSON.stringify(context.documentId)+')||null)'),
    'new native Side Panel document');
  const reopenedTarget=await until(async()=>{
    const all=(await cdp('Target.getTargets')).targetInfos;
    return all.find(x=>x.url===reopenedContext.documentUrl&&x.targetId!==bootstrapTab.targetId);
  },'reopened native panel target');
  host=await attach(reopenedTarget.targetId);
  await cdp('Page.enable',{},host);
  await until(()=>evalJs(host,
    'document.querySelector("#extension-center-list")?.dataset.opendeskReactOwner==="extension-list"'),
    'reopened native React extension list');
  await click(host,'#tab-tools');
  await until(()=>evalJs(host,'!document.querySelector("#workbench-tools")?.hidden'),
    'reopened extension center');
  const returned=await openTool(),readBack=await getQueue(returned);
  report.reopenedQueueReadback=readBack;
  assert.equal(readBack.ok,true,'pinned Tool reopens under the new Side Panel instance');
  assert.equal(readBack.value.status,'unavailable','missing Page remains visibly unavailable');
  const reopenedPackage=await storedPackage('ai-send-queue');
  assert.deepEqual(identity(reopenedPackage),identity(tool),'reopened exact-byte readback');
  report.reopenedReadbackIdentity=identity(reopenedPackage);
  report.panelDocuments={closed:context.documentId,reopened:reopenedContext.documentId};
  await screenshot('native-panel-reopened',returned,readBack);
  report.nativePanelReopen='PASS_NATIVE_CLOSE_REOPEN';
  report.events.push('REAL_SIDE_PANEL_REOPEN');
  // A different same-ID installation may be reviewed, but may NEVER inherit
  // queue RPC authority merely from matching its ID and declared capability.
  await click(host,'#sidebar-tool-back');
  const forged=validateSidebarToolPackage({...tool,version:'0.1.14'});
  const malicious=join(profile,'same-id-unpinned.opendesk-tool.json');
  await writeFile(malicious,serializeSidebarToolPackage(forged));
  const forgedInstalled=await importTool(malicious,'0.1.14');
  assert.deepEqual(identity(forgedInstalled),identity(forged),'same-id forged bytes installed');
  report.sameIdIdentity=identity(forgedInstalled);
  const fakeFrame=await openTool();
  const blocked=await getQueue(fakeFrame);
  report.sameIdQueueReadback=blocked;
  assert.equal(blocked.ok,false);
  assert.equal(blocked.code,'E_TOOL_CAPABILITY_REQUIRED');
  const finalReadback=await storedPackage('ai-send-queue');
  assert.deepEqual(identity(finalReadback),identity(forged),'final same-id readback');
  report.finalReadbackIdentity=identity(finalReadback);
  await screenshot('same-id-forgery-denied',fakeFrame,blocked);
  report.unauthorizedSameId='PASS_DENIED_BY_PINNED_BYTES';
  report.events.push('REAL_HOST_DENIED_SAME_ID_TAMPER');
  assert.deepEqual(exceptions,[],'no unexpected extension runtime exception');
  report.status='PASS';
  report.macChromeTested=process.platform==='darwin'&&!headless&&
    !/HeadlessChrome/i.test(report.chromeVersion.product+' '+report.chromeVersion.userAgent);
}catch(error){
  report.macChromeTested=false;
  report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;
  if(host&&socket?.readyState===WebSocket.OPEN){
    try{report.hostView=await evalJs(host,'document.body?.innerText.slice(0,2200)');}catch{}
    try{const shot=await cdp('Page.captureScreenshot',{format:'png'},host);
      await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}
  }
}finally{
  report.exceptions=exceptions;
  // This CDP socket belongs only to the Chrome spawned with our temporary profile.
  if(chrome&&socket?.readyState===WebSocket.OPEN){
    try{await cdp('Browser.close');}catch{}
  }
  try{socket?.close();}catch{}
  try{chrome?.kill();await delay(300);
    if(profile)await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
  }catch(error){report.cleanupError=String(error);}
  if(demoServer)await new Promise(ok=>demoServer.close(ok));
  await writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,pageInstalled:report.pageInstalled,
    pageReadback:report.pageReadback,read:report.read,spoof:report.unauthorizedSameId,
    events:report.events,nativePanelReopen:report.nativePanelReopen,error:report.error},null,2));
}
