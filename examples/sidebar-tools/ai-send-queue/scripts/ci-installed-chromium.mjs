// Actual OpenDesk MV3, real native Side Panel and opaque sandbox.
// The R5.8 Page program is intentionally NOT installed in this test.
// Verify real UI/import/reopen and exact-byte grant fencing; no SDK mock.
// Native Mac sending remains NOT_TESTED.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {SIDEBAR_TOOL_STORE,serializeSidebarToolPackage,validateSidebarToolPackage}
  from '../../../../src/ui/sidebar-tools/package.js';
import {SEND_QUEUE_PIN} from '../trusted/admission.js';
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const out=resolve(process.argv[2]||'artifacts/app-ci/ai-send-queue/installed');
await mkdir(out,{recursive:true});
const extension=resolve('dist/development');
const candidate=resolve('artifacts/app-ci/ai-send-queue/candidate.opendesk-tool.json');
const report={scope:'REAL_CHROME_MV3_SIDE_PANEL',simulatedSDK:false,macChromeTested:false,
  liveChatGPTSending:'NOT_TESTED',pageInstalled:false,read:'NOT_TESTED',
  unauthorizedSameId:'NOT_TESTED',status:'RUNNING',events:[]};
let chrome,profile,socket,host,extId,seq=0;const pending=new Map(),sessions=new Map();
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
async function openTool(){
  await until(()=>evalJs(host,
    '!!document.querySelector(\'#extension-center-list button[data-extension-key="app:ai-send-queue"][data-extension-action="primary"]\')'),
    'installed product primary action');
  await click(host,'#extension-center-list button[data-extension-key="app:ai-send-queue"][data-extension-action="primary"]');
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
    '({sdk:typeof OpenDeskTool?.request,chrome:typeof globalThis.chrome,'+
    'react:globalThis.OpenDeskPageReact?.version,rows:document.querySelectorAll(".send-queue-row").length})');
  assert.deepEqual(info,{sdk:'function',chrome:'undefined',react:'19.2.0',rows:0});
  return frame;
}
async function getQueue(frame){
  return evalJs(frame,'OpenDeskTool.request("sendQueue.snapshot",{}).then('+
    'value=>({ok:true,value}),error=>({ok:false,code:error.code,message:error.message}))');
}
try{
  const bytes=await readFile(candidate),tool=validateSidebarToolPackage(JSON.parse(bytes));
  assert.equal(sha(bytes),SEND_QUEUE_PIN.toolPackageSha256,'source-bound candidate');
  assert.equal(sha(Buffer.from(serializeSidebarToolPackage(tool))),SEND_QUEUE_PIN.toolPackageSha256);
  assert.equal(tool.version,'0.1.13');
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
  assert.equal(manifest.manifest_version,3);
  profile=await mkdtemp(join(tmpdir(),'sq-native-ui-'));
  const args=['--disable-gpu','--disable-dev-shm-usage','--no-first-run','--use-mock-keychain',
    '--no-default-browser-check','--password-store=basic','--user-data-dir='+profile,
    '--remote-debugging-port=0','--disable-extensions-except='+extension,
    '--load-extension='+extension,'--headless=new','about:blank'];
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
  await cdp('Target.setDiscoverTargets',{discover:true});
  const worker=await until(async()=>{
    const all=(await cdp('Target.getTargets')).targetInfos;
    return all.find(t=>t.type==='service_worker'&&t.url.includes('/'+manifest.background.service_worker));
  },'installed MV3 service worker');
  extId=new URL(worker.url).host;
  const bootstrapTab=await cdp('Target.createTarget',{url:'chrome-extension://'+extId+'/sidepanel.html'});
  const bootstrap=await attach(bootstrapTab.targetId);
  const windowId=await evalJs(bootstrap,'chrome.windows.getCurrent().then(x=>x.id)');
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
  assert.equal((await storedPackage('ai-send-queue'))?.version,'0.1.13');
  const active=await openTool();
  const result=await getQueue(active);
  assert.equal(result.ok,true,'pinned tool may reach the trusted Host');
  assert.equal(result.value.status,'unavailable','no ChatGPT document is selected');
  report.read='PASS_TRUSTED_HOST_PAGE_UNAVAILABLE';
  report.events.push('REAL_SIDE_PANEL_REACT_OPEN','REAL_HOST_REFUSES_MISSING_PAGE');
  await click(host,'#sidebar-tool-back');
  await until(()=>evalJs(host,'!document.querySelector("#sidebar-tool-frame iframe")'),
    'tool frame closes');
  await openTool();
  report.events.push('REAL_SIDE_PANEL_REOPEN');
  // A different same-ID installation may be reviewed, but may NEVER inherit
  // queue RPC authority merely from matching its ID and declared capability.
  await click(host,'#sidebar-tool-back');
  const forged=validateSidebarToolPackage({...tool,version:'0.1.14'});
  const malicious=join(profile,'same-id-unpinned.opendesk-tool.json');
  await writeFile(malicious,serializeSidebarToolPackage(forged));
  await importTool(malicious,'0.1.14');
  const fakeFrame=await openTool();
  const blocked=await getQueue(fakeFrame);
  assert.equal(blocked.ok,false);
  assert.equal(blocked.code,'E_TOOL_CAPABILITY_REQUIRED');
  report.unauthorizedSameId='PASS_DENIED_BY_PINNED_BYTES';
  report.events.push('REAL_HOST_DENIED_SAME_ID_TAMPER');
  assert.deepEqual(exceptions,[],'no unexpected extension runtime exception');
  report.status='PASS';
}catch(error){
  report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;
  if(host&&socket?.readyState===WebSocket.OPEN){
    try{report.hostView=await evalJs(host,'document.body?.innerText.slice(0,2200)');}catch{}
    try{const shot=await cdp('Page.captureScreenshot',{format:'png'},host);
      await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}
  }
}finally{
  report.exceptions=exceptions;
  await writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
  try{socket?.close();}catch{}
  try{chrome?.kill();await delay(300);
    if(profile)await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
  }catch(error){report.cleanupError=String(error);}
  console.log(JSON.stringify({status:report.status,read:report.read,spoof:report.unauthorizedSameId,
    events:report.events,error:report.error},null,2));
}
