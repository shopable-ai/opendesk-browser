#!/usr/bin/env node
// R1.7 actual unpacked OpenDesk Browser extension, actual reviewed package
// import, real browser-owned Sandbox, real Card/Switch and close/reopen.
// Runs in the full extension Tool catalog tab; DOES NOT claim native Side Panel.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateSidebarToolPackage,serializeSidebarToolPackage,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';

const extension=resolve('dist/development');
const toolFile=resolve('examples/sidebar-tools/shared-ui-demo/shared-ui-demo.opendesk-tool.json');
const output=resolve(process.argv[2]||'artifacts/sidebar-tools/shared-ui-demo/installed-chrome');
await mkdir(output,{recursive:true});
const bytes=await readFile(toolFile);
const pkg=validateSidebarToolPackage(JSON.parse(bytes));
assert.equal(pkg.id,'shared-ui-demo');
assert.equal(pkg.uiRuntime,'opendesk.react-ui.v1');
assert.deepEqual(pkg.capabilities,[]);
const pkgHash=createHash('sha256').update(bytes).digest('hex');
assert.equal(pkgHash,createHash('sha256').update(serializeSidebarToolPackage(pkg)).digest('hex'),
  'Package must be canonical tested/promoted bytes, not a candidate');
const profile=await mkdtemp(join(tmpdir(),'opendesk-r17-installed-'));
const flags=['--headless=new','--disable-gpu','--disable-dev-shm-usage','--no-first-run',
  '--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-port=0',
  '--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'];
if(process.getuid?.()===0)flags.unshift('--no-sandbox');
const chrome=spawn(process.env.CHROME_BIN||'chromium',flags,{stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
let socket,sequence=0;
const pending=new Map(),exceptions=[],remoteRequests=[];
function cdp(method,params={},sessionId=null){
  if(!socket)throw Error('CDP not connected');
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},18000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function connect(){
  let lines;
  for(let i=0;i<130;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exit before extension load '+chrome.exitCode);
    try{lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');if(lines?.length>=2)break;}catch{}
    await sleep(100);
  }
  assert.ok(lines?.[0]&&lines?.[1],'Chrome debugging endpoint must exist');
  socket=new WebSocket('ws://127.0.0.1:'+lines[0]+lines[1]);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const row=JSON.parse(event.data);
    if(row.id&&pending.has(row.id)){
      const job=pending.get(row.id);pending.delete(row.id);
      row.error?job.reject(Error(row.error.message)):job.resolve(row.result);
    }
    if(row.method==='Runtime.exceptionThrown')
      exceptions.push(row.params.exceptionDetails?.exception?.description||row.params.exceptionDetails?.text);
    if(row.method==='Network.requestWillBeSent'&&/^https?:/i.test(row.params.request?.url||''))
      remoteRequests.push(row.params.request.url);
  });
  await cdp('Target.setDiscoverTargets',{discover:true});
}
async function until(fn,label){
  let last;
  for(let i=0;i<140;i++){
    try{const result=await fn();if(result)return result;}catch(e){last=e.message;}
    await sleep(100);
  }
  throw Error('TIMED_OUT '+label+(last?': '+last:''));
}
async function attach(targetId){
  const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  await cdp('Runtime.enable',{},sessionId);
  await cdp('Network.enable',{},sessionId);
  return sessionId;
}
async function evaluate(sessionId,code){
  const result=await cdp('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true},sessionId);
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result?.value;
}
const q=selector=>'document.querySelector('+JSON.stringify(selector)+')';
async function click(sessionId,selector){
  const point=await until(async()=>{
    const p=await evaluate(sessionId,'(()=>{const e='+q(selector)+';if(!e||e.disabled||e.hidden)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,visible:r.width>0&&r.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&e.contains(document.elementFromPoint(x,y))};})()');
    return p?.visible?p:null;
  },'visible click '+selector);
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y},sessionId);
  for(const type of ['mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1},sessionId);
}
async function frameState(frame,expected){
  return until(async()=>{
    const state=await evaluate(frame,'(()=>{const s=document.querySelector("[data-slot=switch]");return {status:document.querySelector("#tool-app [aria-live]")?.textContent||null,selected:s?.hasAttribute("data-selected"),checked:s?.querySelector("input")?.checked,ready:document.querySelector("#tool-status")?.dataset.state,react:globalThis.OpenDeskPageReact?.version,aria:typeof globalThis.OpenDeskSidebarUI?.Switch,sdk:typeof globalThis.OpenDeskTool?.request,chromeRuntime:typeof globalThis.chrome?.runtime};})()');
    return state.status===expected&&state.ready==='ready'&&
      state.selected===(expected==='已开启')&&state.checked===(expected==='已开启')?state:null;
  },'real sandbox controlled state '+expected);
}
async function toolFrame(){
  const row=await until(async()=>{
    const targets=(await cdp('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='iframe'&&x.url.includes('/sidebar-tools/sandbox.html'));
  },'real opaque sandbox iframe');
  return {target:row,session:await attach(row.targetId)};
}
const result={
  scope:'REAL_UNPACKED_EXTENSION_CATALOG_UI',
  explicitExclusions:['NOT_NATIVE_MAC_SIDE_PANEL','NOT_PERSISTED_BROWSER_RESTART'],
  package:{id:pkg.id,version:pkg.version,sha256:pkgHash,bytes:bytes.length},
  checks:[],status:'IN_PROGRESS'
};
try{
  await connect();
  const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));
  const worker=await until(async()=>{
    const rows=(await cdp('Target.getTargets')).targetInfos;
    return rows.find(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://')&&
      t.url.endsWith('/'+manifest.background.service_worker));
  },'real extension service worker');
  result.extensionId=new URL(worker.url).host;
  const target=await cdp('Target.createTarget',{url:'chrome-extension://'+result.extensionId+'/ui/tool.html'});
  const host=await attach(target.targetId);
  await until(()=>evaluate(host,'document.readyState==="complete"&&!!document.querySelector("#tab-tools")'),'actual extension UI');
  await click(host,'#tab-tools');
  await until(()=>evaluate(host,'!document.querySelector("#workbench-tools").hidden'),'Extension tab visible');
  // The file is selected using Chrome's file input binding and installed via
  // actual trusted UI review. No storage mutation, fake Host receipt or mock.
  await click(host,'#sidebar-tool-import-trigger');
  await cdp('DOM.enable',{},host);
  const dom=(await cdp('DOM.getDocument',{depth:1},host)).root;
  const node=(await cdp('DOM.querySelector',{nodeId:dom.nodeId,selector:'#sidebar-tool-file'},host)).nodeId;
  assert.ok(node,'genuine package import input exists');
  await cdp('DOM.setFileInputFiles',{nodeId:node,files:[toolFile]},host);
  const review=await until(async()=>{
    const s=await evaluate(host,'({hidden:document.querySelector("#sidebar-tool-preview").hidden,version:document.querySelector("#sidebar-tool-preview-version")?.textContent,title:document.querySelector("#sidebar-tool-preview-title")?.textContent,disabled:document.querySelector("#sidebar-tool-install")?.disabled})');
    return s&&!s.hidden&&!s.disabled?s:null;
  },'tool package review and enabled install');
  assert.ok(review.title.includes('广告拦截'),'real review title');
  await click(host,'#sidebar-tool-install');
  const installed=await until(async()=>{
    const rows=await evaluate(host,'chrome.storage.local.get('+JSON.stringify(SIDEBAR_TOOL_STORE)+').then(r=>r['+JSON.stringify(SIDEBAR_TOOL_STORE)+']||[])');
    return rows.find(x=>x.id===pkg.id&&x.version===pkg.version)||null;
  },'real Chrome Storage installation');
  assert.equal(createHash('sha256').update(serializeSidebarToolPackage(installed)).digest('hex'),pkgHash,'Installed package SHA identical');
  result.checks.push('REVIEW_AND_REAL_FILE_INSTALL','STORED_CANONICAL_PACKAGE_SHA');
  const opener='#sidebar-tool-list button[data-sidebar-tool-id="'+pkg.id+'"][data-sidebar-tool-action="open"]';
  for(let cycle=1;cycle<=2;cycle++){
    await click(host,opener);
    const frame=await toolFrame();
    const first=await frameState(frame.session,'已关闭');
    assert.equal(first.react,'19.2.0');
    assert.equal(first.aria,'function');
    assert.equal(first.sdk,'function');
    assert.equal(first.chromeRuntime,'undefined','sandbox cannot access privileged APIs');
    await click(frame.session,'[data-slot="switch"]');
    await frameState(frame.session,'已开启');
    await click(frame.session,'[data-slot="switch"]');
    await frameState(frame.session,'已关闭');
    const screenshot=await cdp('Page.captureScreenshot',{format:'png'},host);
    await writeFile(join(output,'installed-cycle-'+cycle+'.png'),Buffer.from(screenshot.data,'base64'));
    await click(host,'#sidebar-tool-back');
    await until(async()=>{
      const domCount=await evaluate(host,'document.querySelectorAll("#sidebar-tool-frame iframe").length');
      const targets=(await cdp('Target.getTargets')).targetInfos;
      return domCount===0&&!targets.some(t=>t.targetId===frame.target.targetId);
    },'real iframe destruction after close');
    result.checks.push('REAL_SANDBOX_CYCLE_'+cycle+'_OFF_ON_OFF_CLOSE');
  }
  assert.deepEqual(remoteRequests,[],'no remote requests from trusted UI / sandbox');
  assert.deepEqual(exceptions,[],'no uncaught page exceptions');
  result.status='PASS';
  result.networkRequests=remoteRequests.length;
  result.exceptions=exceptions.length;
  console.log('R17_REAL_EXTENSION_CATALOG_PASS '+JSON.stringify(result));
}finally{
  await writeFile(join(output,'installed-report.json'),JSON.stringify(result,null,2)+'\n');
  try{socket?.close();}catch{}
  chrome.kill();
  await new Promise(resolve=>chrome.exitCode!==null?resolve():chrome.once('close',resolve));
  await rm(profile,{recursive:true,force:true});
}
