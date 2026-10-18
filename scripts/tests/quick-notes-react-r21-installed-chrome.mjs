#!/usr/bin/env node
// Two REAL installed tool packages through the existing OpenDesk Host + isolated Chrome profile.
// Unlike the dual preview, this test has NO simulated OpenDeskTool and calls the real SDK.
// Linux headless CFT tests extension-host catalog UI; native Mac Side Panel remains NOT_TESTED.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey,validateSidebarToolPackage,
  serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';

const extension=resolve(process.env.OPENDESK_SHARED_UI_EXTENSION_DIR||'dist/development');
const paths=[
  resolve(process.env.OPENDESK_QN_NATIVE_TOOL_FILE||'artifacts/sidebar-tools/quick-notes/native-candidate.opendesk-tool.json'),
  resolve(process.env.OPENDESK_QN_REACT_TOOL_FILE||'artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json')
];
const out=resolve(process.argv[2]||'artifacts/sidebar-tools/quick-notes-react/installed-chrome');
await mkdir(out,{recursive:true});
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
async function waitForChromeExit(child){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const exited=new Promise(resolve=>child.once('close',()=>resolve(true)));
  child.kill();
  if(!await Promise.race([exited,delay(2500).then(()=>false)])&&
      child.exitCode===null&&child.signalCode===null){
    child.kill('SIGKILL');
    await Promise.race([exited,delay(2500)]);
  }
}

let processChrome,profile,socket,sequence=0,launchError,host,extensionId;
const outstanding=new Map(),attached=new Map(),browserErrors=[],networkFailures=[],browserLog=[];
const result={scope:'REAL_OPEN_DESK_EXTENSION_HOST_CHROME_CATALOG',macNativeSidePanel:'NOT_TESTED',
  simulatedSDK:false,isolatedProfile:true,status:'RUNNING',packages:[],operations:[],dataIsolation:'NOT_TESTED'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function call(method,params={},sessionId=null){
  return new Promise((ok,fail)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{outstanding.delete(id);fail(Error('CDP_TIMEOUT '+method));},18000);
    outstanding.set(id,{ok:r=>{clearTimeout(timeout);ok(r);},fail:e=>{clearTimeout(timeout);fail(e);}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function until(fn,what,ms=24000){
  let last;
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){
    try{const item=await fn();if(item)return item;}catch(error){last=error.message;}
    await delay(100);
  }
  throw Error('WAIT_FOR '+what+(last?': '+last:''));
}
async function connect(){
  let port,endpoint;
  for(let i=0;i<150;i++){
    if(launchError)throw launchError;
    if(processChrome.exitCode!==null||processChrome.signalCode!==null)
      throw Error('Chrome exited before startup');
    try{
      const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
      if(lines.length>=2){port=Number(lines[0]);endpoint='ws://127.0.0.1:'+port+lines[1];break;}
    }catch{}
    await delay(100);
  }
  assert.ok(endpoint,'no Chrome debugging endpoint');
  socket=new WebSocket(endpoint);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const item=JSON.parse(event.data);
    if(item.id&&outstanding.has(item.id)){
      const p=outstanding.get(item.id);outstanding.delete(item.id);
      item.error?p.fail(Error(item.error.message)):p.ok(item.result);
    }
    const p=item.params;
    if(item.method==='Runtime.exceptionThrown')
      browserErrors.push({session:item.sessionId,error:p.exceptionDetails?.exception?.description||p.exceptionDetails?.text});
    if(item.method==='Network.responseReceived'&&p.response.status>=400&&
      !p.response.url.endsWith('/favicon.ico'))networkFailures.push({status:p.response.status,url:p.response.url});
  });
  await call('Target.setDiscoverTargets',{discover:true});
}
async function attach(targetId){
  if(attached.has(targetId))return attached.get(targetId);
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  await call('Runtime.enable',{},sessionId);
  await call('Network.enable',{},sessionId);
  attached.set(targetId,sessionId);
  return sessionId;
}
async function evaluate(sessionId,expr){
  const value=await call('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},sessionId);
  if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);
  return value.result?.value;
}
async function click(sessionId,selector){
  const pt=await until(async()=>{
    const x=await evaluate(sessionId,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+');'+
      'if(!e||e.disabled||e.hidden)return null;e.scrollIntoView({block:"center"});'+
      'const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;'+
      'return {x,y,valid:r.width>0&&r.height>0&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&e.contains(document.elementFromPoint(x,y))}})()');
    return x?.valid?x:null;
  },'click '+selector);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y},sessionId);
  for(const type of ['mousePressed','mouseReleased'])
    await call('Input.dispatchMouseEvent',{type,x:pt.x,y:pt.y,button:'left',clickCount:1},sessionId);
}
async function persistedPackage(id){
  return evaluate(host,'chrome.storage.local.get('+JSON.stringify(SIDEBAR_TOOL_STORE)+
    ').then(x=>(x['+JSON.stringify(SIDEBAR_TOOL_STORE)+']||[]).find(p=>p.id==='+JSON.stringify(id)+')||null)');
}
async function importTool(tool){
  const already=await persistedPackage(tool.id);
  if(already){
    assert.equal(hash(Buffer.from(serializeSidebarToolPackage(already))),tool.sha,
      'preinstalled native package must match its original source baseline');
    result.operations.push('PREINSTALLED_PACKAGE_MATCH_'+tool.id);
    return;
  }
  await click(host,'#extension-center-more');
  const menuProbe=await evaluate(host,'(()=>{const b=document.querySelector("#extension-center-import"),m=document.querySelector("#extension-center-menu"),t=document.querySelector("#extension-center-more"),r=b?.getBoundingClientRect(),s=b?getComputedStyle(b):null;return {expanded:t?.getAttribute("aria-expanded"),menuHidden:m?.hidden,buttonHidden:b?.hidden,offsetParent:!!b?.offsetParent,style:s?.display,visibility:s?.visibility,rect:r&&{x:r.x,y:r.y,width:r.width,height:r.height},screen:{width:innerWidth,height:innerHeight},status:document.querySelector("#extension-center-status")?.textContent}})()');
  console.log('R21_REAL_IMPORT_MENU_STATE '+JSON.stringify(menuProbe));
  if(menuProbe.menuHidden||!menuProbe.offsetParent)
    throw Error('REAL_IMPORT_MENU_NOT_VISIBLE '+JSON.stringify(menuProbe));
  await click(host,'#extension-center-import');
  await call('DOM.enable',{},host);
  const root=(await call('DOM.getDocument',{depth:1},host)).root;
  const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},host);
  assert.ok(nodeId,'genuine import file input');
  await call('DOM.setFileInputFiles',{nodeId,files:[tool.file]},host);
  const approval=await until(async()=>{
    const x=await evaluate(host,'(()=>{const e=document.querySelector("#sidebar-tool-preview");return e&&!e.hidden?'+
      '{title:document.querySelector("#sidebar-tool-preview-title")?.textContent,version:document.querySelector("#sidebar-tool-preview-version")?.textContent,disabled:document.querySelector("#sidebar-tool-install")?.disabled}:null})()');
    return x&&!x.disabled?x:null;
  },'review '+tool.id);
  assert.equal(approval.title.trim(),tool.title,'review matches imported package title');
  await click(host,'#sidebar-tool-install');
  const saved=await until(()=>persistedPackage(tool.id),'installed '+tool.id);
  assert.equal(hash(Buffer.from(serializeSidebarToolPackage(saved))),tool.sha,
    'real installed package must match tested candidate bytes');
  result.operations.push('TRUSTED_UI_IMPORT_'+tool.id);
}
async function openTool(id){
  const row='#extension-center-list button[data-extension-key="app:'+id+'"][data-extension-action="primary"]';
  await click(host,row);
  const target=await until(async()=>{
    const items=(await call('Target.getTargets')).targetInfos;
    return items.find(x=>x.type==='iframe'&&x.url.includes('/sidebar-tools/sandbox.html')&&
      x.url.startsWith('chrome-extension://'+extensionId+'/'));
  },'real opaque sandbox '+id);
  const frame=await attach(target.targetId);
  const state=await until(async()=>{
    const x=await evaluate(frame,'(()=>({ready:document.querySelector("#tool-status")?.dataset.state,'+
      'textarea:!!document.querySelector("#note-text")&&!document.querySelector("#note-text").disabled,'+
      'sdk:typeof globalThis.OpenDeskTool?.request,chrome:typeof globalThis.chrome?.runtime,'+
      'runtime:globalThis.OpenDeskPageReact?.version}))()');
    return x.ready==='ready'&&x.textarea?x:null;
  },'real sandbox ready '+id);
  assert.equal(state.sdk,'function','real SDK request bridge');
  assert.equal(state.chrome,'undefined','tool sandbox is not trusted Chrome code');
  assert.equal(state.runtime,id==='quick-notes-react'?'19.2.0':undefined);
  return {target,frame,state};
}
async function saveText(opened,text,id){
  await evaluate(opened.frame,'document.querySelector("#note-text").focus()');
  await call('Input.insertText',{text},opened.frame);
  await until(()=>evaluate(opened.frame,
    'document.querySelector("#note-text")?.value==='+JSON.stringify(text)),'user text typed '+id);
  await click(opened.frame,'button[aria-label="保存笔记"]');
  await until(async()=>{
    const value=await evaluate(opened.frame,'({n:document.querySelectorAll(".note-list button").length,'+
      'status:document.querySelector("#note-status, .note-status")?.textContent||null})');
    return value.n===1&&/已保存/.test(value.status||'')?value:null;
  },'real Host storage acknowledged '+id);
  result.operations.push('REAL_SDK_WRITE_'+id);
}
async function closeTool(){
  await click(host,'#sidebar-tool-back');
  await until(()=>evaluate(host,
    'document.querySelectorAll("#sidebar-tool-frame iframe").length===0'),'close iframe');
}
async function storageDigest(id){
  const key=sidebarToolStorageKey(id);
  const state=await evaluate(host,'chrome.storage.local.get('+JSON.stringify(key)+').then(x=>x['+
    JSON.stringify(key)+']??null)');
  assert.ok(state,'persistent data namespace must exist for '+id);
  return hash(Buffer.from(JSON.stringify(state)));
}
async function reopenVerify(id,text){
  const opened=await openTool(id);
  const existing=await until(async()=>evaluate(opened.frame,'document.querySelector("#note-text")?.value'),
    'restored '+id);
  assert.equal(existing,text,'reopening must read that tool ID private persisted notes');
  await closeTool();
  result.operations.push('REAL_SDK_RESTORED_'+id);
}
try{
  const packages=await Promise.all(paths.map(async file=>{
    const bytes=await readFile(file);
    const pkg=validateSidebarToolPackage(JSON.parse(bytes));
    const sha=hash(bytes);
    assert.equal(sha,hash(Buffer.from(serializeSidebarToolPackage(pkg))),'canonical package bytes');
    result.packages.push({id:pkg.id,sha256:sha,bytes:bytes.length,version:pkg.version});
    return {file,id:pkg.id,title:pkg.title,version:pkg.version,sha};
  }));
  assert.deepEqual(packages.map(x=>x.id),['quick-notes','quick-notes-react']);
  profile=await mkdtemp(join(tmpdir(),'opendesk-r21-installed-'));
  const options=['--disable-gpu','--disable-dev-shm-usage','--no-first-run',
    '--use-mock-keychain','--password-store=basic',
    '--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-port=0',
    '--disable-extensions-except='+extension,'--load-extension='+extension,
    '--headless=new','about:blank'];
  if(process.getuid?.()===0||(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'))
    options.unshift('--no-sandbox');
  processChrome=spawn(process.env.CHROME_BIN||'chromium',options,{stdio:['ignore','ignore','pipe']});
  processChrome.on('error',error=>{launchError=error;});
  processChrome.stderr.on('data',data=>browserLog.push(String(data)));
  await connect();
  result.chrome=await call('Browser.getVersion');
  const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json')));
  const worker=await until(async()=>{
    const all=(await call('Target.getTargets')).targetInfos;
    return all.find(t=>t.type==='service_worker'&&t.url.endsWith('/'+manifest.background.service_worker));
  },'real extension service worker');
  extensionId=new URL(worker.url).host;
  result.extensionId=extensionId;
  const page=await call('Target.createTarget',{url:'chrome-extension://'+extensionId+'/ui/tool.html'});
  host=await attach(page.targetId);
  await call('Page.enable',{},host);
  await until(()=>evaluate(host,
    '(()=>{const t=document.querySelector("#tab-tools"),l=document.querySelector("#extension-center-list"),s=document.querySelector("#extension-center-status");return document.readyState==="complete"&&!!t&&l?.dataset.opendeskReactOwner==="extension-list"&&!!s?.textContent?.trim()})()'),
    'real React extension center controller fully connected');
  await click(host,'#tab-tools');
  await until(()=>evaluate(host,'!document.querySelector("#workbench-tools")?.hidden'),
    'Extension Center visible');
  // Import React independently. Native original is generally a preinstall.
  for(const pkg of packages)await importTool(pkg);
  assert.ok(await persistedPackage('quick-notes'));
  assert.ok(await persistedPackage('quick-notes-react'));
  const beforeKeys=await evaluate(host,'chrome.storage.local.get(null).then(x=>Object.keys(x).filter(k=>'+
    'k.startsWith("opendesk.sidebar-tools.data.v1:")).sort())');
  result.beforeStorageKeys=beforeKeys;
  const native=await openTool('quick-notes');
  await saveText(native,'原生独立数据','quick-notes');
  await closeTool();
  const nativeDigest=await storageDigest('quick-notes');
  const react=await openTool('quick-notes-react');
  await saveText(react,'React 独立数据','quick-notes-react');
  await closeTool();
  const [nativeAfter,reactDigest]=await Promise.all([
    storageDigest('quick-notes'),storageDigest('quick-notes-react')]);
  assert.equal(nativeAfter,nativeDigest,'React write cannot modify native stored data');
  assert.notEqual(nativeDigest,reactDigest,'two independent data namespaces');
  await reopenVerify('quick-notes','原生独立数据');
  await reopenVerify('quick-notes-react','React 独立数据');
  const [nativeFinally,reactFinally]=await Promise.all([
    storageDigest('quick-notes'),storageDigest('quick-notes-react')]);
  assert.equal(nativeFinally,nativeDigest);
  assert.equal(reactFinally,reactDigest);
  result.dataIsolation='PASS';
  result.operations.push('REAL_SDK_ISOLATION','BOTH_INDEPENDENTLY_INSTALLED');
  assert.deepEqual(browserErrors,[],'No uncaught runtime errors from observed extension targets');
  assert.deepEqual(networkFailures,[],'No failed observed extension resources');
  result.status='PASS';
}catch(error){
  result.status='FAIL';result.error=String(error.stack||error);process.exitCode=1;
  if(host&&socket?.readyState===WebSocket.OPEN){
    try{result.failureDocument=await evaluate(host,'({url:location.href,body:document.body?.innerText.slice(0,3500)})');}
    catch{}
    try{
      result.hostReactOwnership=await evaluate(host,`(()=>{
        const list=document.querySelector("#extension-center-list");
        const center=document.querySelector("#extension-center");
        const app=document.querySelector("#opendesk-react-app");
        return {reactShellCount:document.querySelectorAll("#opendesk-react-app").length,
          centerCount:document.querySelectorAll("#extension-center").length,
          listCount:document.querySelectorAll("#extension-center-list").length,
          listOwner:list?.dataset.opendeskReactOwner||null,
          centerOwner:center?.dataset.opendeskReactOwner||null,
          listConnected:Boolean(list?.isConnected),
          shellContainsList:Boolean(app?.contains(list)),
          shellContainsCenter:Boolean(app?.contains(center)),
          bodyContainsList:Boolean(document.body.contains(list))};
      })()`);
    }catch{}

    try{
      const shot=await call('Page.captureScreenshot',{format:'png'},host);
      await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));
    }catch{}
  }
}finally{
  result.errors=browserErrors;result.networkFailures=networkFailures;
  await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  await writeFile(join(out,'chrome.log'),browserLog.join(''));
  try{socket?.close();}catch{}
  try{
    await waitForChromeExit(processChrome);
    if(profile)await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:200});
  }catch(error){
    result.cleanupError=String(error.stack||error);
    if(result.status!=='FAIL'){
      result.status='FAIL';result.error='CHROME_CLEANUP_FAILED '+result.cleanupError;
      process.exitCode=1;
    }
  }
  console.log(JSON.stringify({status:result.status,checks:result.operations,
    dataIsolation:result.dataIsolation,output:out,error:result.error,
    failureDocument:result.status==='FAIL'?result.failureDocument:undefined},null,2));
}
