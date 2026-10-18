#!/usr/bin/env node
// R23: genuine packaged Chrome extension pages and locale persistence.
// Scope: UI / i18n / read-only offline safety ONLY. This is not a Native Agent disk-write test.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';

const extension=resolve(process.env.OPENDESK_WORKSPACE_EXTENSION||'dist/development');
const browserBinary=process.env.CHROME_BIN||'chromium';
const out=resolve(process.argv[2]||'artifacts/native-workspace-r23/chrome');
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
let browser,profile,socket,seq=0,startError;
const outstanding=new Map(),browserExceptions=[];
const report={kind:'R23_REAL_CHROME_PACKAGED_UI',nativeDiskReadWrite:'NOT_TESTED',reactFullMigration:'NOT_DONE',
  cases:[],status:'RUNNING'};

function call(method,params={},sessionId){
  return new Promise((ok,fail)=>{
    const id=++seq;
    const timer=setTimeout(()=>{outstanding.delete(id);fail(new Error('CDP_TIMEOUT '+method));},15000);
    outstanding.set(id,{ok:x=>{clearTimeout(timer);ok(x);},fail:x=>{clearTimeout(timer);fail(x);}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function waitFor(fn,name){
  let last;
  for(let i=0;i<180;i++){
    try{const x=await fn();if(x)return x;}
    catch(e){last=e.message;}
    await pause(100);
  }
  throw Error('TIMED_OUT '+name+(last?' '+last:''));
}
async function connect(){
  const port=await waitFor(async()=>{
    if(startError)throw startError;
    if(browser.exitCode!==null||browser.signalCode!==null)throw Error('CHROME_EXIT');
    try{return Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{return 0;}
  },'Chrome debugging port');
  const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
  socket=new WebSocket('ws://127.0.0.1:'+port+lines[1]);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',e=>{
    const data=JSON.parse(e.data),job=outstanding.get(data.id);
    if(job){
      outstanding.delete(data.id);
      data.error?job.fail(Error(data.error.message)):job.ok(data.result);
    }
    if(data.method==='Runtime.exceptionThrown')
      browserExceptions.push(data.params.exceptionDetails?.exception?.description||data.params.exceptionDetails?.text);
  });
  await call('Target.setDiscoverTargets',{discover:true});
}
async function page(path){
  const created=await call('Target.createTarget',{url:'chrome-extension://'+report.extensionId+'/'+path});
  const attached=await call('Target.attachToTarget',{targetId:created.targetId,flatten:true});
  await call('Runtime.enable',{},attached.sessionId);await call('Page.enable',{},attached.sessionId);
  return {id:created.targetId,session:attached.sessionId};
}
async function evaluate(tab,code){
  const output=await call('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true},tab.session);
  if(output.exceptionDetails)throw Error(output.exceptionDetails.exception?.description||output.exceptionDetails.text);
  return output.result?.value;
}
async function key(tab,k,code){
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:code||k},tab.session);
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:code||k},tab.session);
}
async function chooseLanguage(tab,value){
  const order=['auto','en','zh-CN','zh-TW','ja'],index=order.indexOf(value);
  assert.ok(index>0);
  const select=await evaluate(tab,'(()=>{const e=document.querySelector(".locale-switcher select");'+
    'if(!e)throw Error("locale selector missing");const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};})()');
  assert.ok(select.width>=32&&select.height>=30,'visible and keyboard-accessible locale selector');
  await evaluate(tab,'document.querySelector(".locale-switcher select").focus()');
  await key(tab,'Home','Home');
  for(let i=0;i<index;i++)await key(tab,'ArrowDown','ArrowDown');
  await key(tab,'Enter','Enter');
  await waitFor(async()=>await evaluate(tab,'document.querySelector(".locale-switcher select").value')===value,
    'keyboard selected '+value);
}
async function snapshot(tab){
  return await evaluate(tab,'(()=>({ready:document.readyState,lang:document.documentElement.lang,title:document.title,'+
    'picker:document.querySelector(".locale-switcher select")?.value,'+
    'heading:document.querySelector("#file-workspace .header-subtitle,main h1")?.textContent?.trim(),'+
    'saveDisabled:document.querySelector("#save-file")?.disabled,'+
    'editorDisabled:document.querySelector("#file-editor")?.disabled,'+
    'nativeSettings:document.querySelector("#open-settings")?.getAttribute("aria-label"),'+
    'storageKey:"opendesk.ui.locale.v1"}))()');
}
try{
  await mkdir(out,{recursive:true});
  profile=await mkdtemp(join(tmpdir(),'opendesk-r23-locale-'));
  const args=['--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--use-mock-keychain','--password-store=basic',
    '--disable-extensions-except='+extension,'--load-extension='+extension,
    '--user-data-dir='+profile,'--remote-debugging-port=0','--headless=new','about:blank'];
  if(process.getuid?.()===0||(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'))
    args.unshift('--no-sandbox');
  browser=spawn(browserBinary,args,{stdio:['ignore','ignore','pipe']});
  browser.on('error',e=>{startError=e;});
  await connect();
  report.browser=await call('Browser.getVersion');
  const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json')));
  const worker=await waitFor(async()=>{
    const all=(await call('Target.getTargets')).targetInfos;
    return all.find(x=>x.type==='service_worker'&&x.url.endsWith('/'+manifest.background.service_worker));
  },'packaged extension service worker');
  report.extensionId=new URL(worker.url).host;
  const workspace=await page('native-agent/workspace.html');
  await waitFor(async()=>await evaluate(workspace,'document.readyState==="complete" && !!document.querySelector("#workspace-locale")'),
    'workspace mount');
  const first=await snapshot(workspace);
  assert.ok(['en','ja','zh-CN','zh-TW'].includes(first.lang),JSON.stringify(first));
  assert.equal(first.saveDisabled,true,'Native not connected: write action disabled');
  assert.equal(first.editorDisabled,true,'Native not connected: editor disabled');
  report.cases.push({case:'packaged-workspace-opens-offline-safely',result:'PASS'});

  await chooseLanguage(workspace,'ja');
  await waitFor(async()=>{
    const s=await snapshot(workspace);return s.lang==='ja'&&s.heading==='ローカルファイルワークスペース'&&s.saveDisabled&&s.editorDisabled;
  },'Japanese workspace and unchanged offline authorization');
  report.cases.push({case:'Japanese keyboard switch without enabling writes',result:'PASS'});
  const preference=await evaluate(workspace,
    'chrome.storage.local.get("opendesk.ui.locale.v1").then(x=>x["opendesk.ui.locale.v1"])');
  assert.equal(preference,'ja','preference persisted in real extension storage');

  const settings=await page('native-agent/settings.html');
  await waitFor(async()=>{const s=await snapshot(settings);return s.lang==='ja'&&s.heading==='ローカル Agent 接続';},
    'settings inherits persisted locale');
  report.cases.push({case:'settings-page-restores-same-language',result:'PASS'});
  await chooseLanguage(settings,'en');
  await waitFor(async()=>{const s=await snapshot(workspace);return s.lang==='en'&&s.heading==='Local File Workspace';},
    'cross-page language update');
  const after=await snapshot(workspace);
  assert.equal(after.saveDisabled,true);
  assert.equal(after.editorDisabled,true);
  report.cases.push({case:'cross-page locale storage updates without new Native access',result:'PASS'});
  await call('Page.reload',{ignoreCache:true},workspace.session);
  await waitFor(async()=>{const s=await snapshot(workspace);return s.lang==='en'&&s.heading==='Local File Workspace';},
    'preference survives reload');
  report.cases.push({case:'language persists across reload',result:'PASS'});
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},workspace.session);
  await writeFile(resolve(out,'workspace-en.png'),Buffer.from(shot.data,'base64'));
  // Observe exceptions only from this fully installed candidate.
  assert.deepEqual(browserExceptions,[],'no uncaught browser-side exceptions');
  report.status='PASS';
}catch(e){
  report.status='FAIL';report.error=e.stack||String(e);
}finally{
  try{await mkdir(out,{recursive:true});await writeFile(resolve(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');}
  catch(e){console.error('Unable to preserve report:',e);}
  try{socket?.close();}catch{}
  if(browser?.exitCode===null&&browser?.signalCode===null){
    browser.kill('SIGTERM');await Promise.race([new Promise(r=>browser.once('close',r)),pause(4000)]);
    if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGKILL');
  }
  if(profile)await rm(profile,{recursive:true,force:true});
}
console.log(JSON.stringify({status:report.status,cases:report.cases,scope:report.kind,
  nativeDiskReadWrite:report.nativeDiskReadWrite,error:report.error},null,2));
if(report.status!=='PASS')process.exitCode=1;
