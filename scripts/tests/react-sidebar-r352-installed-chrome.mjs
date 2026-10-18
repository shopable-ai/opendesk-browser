#!/usr/bin/env node
// INSTALLED_EXTENSION_CHROME_LINUX: actual WXT MV3, real Chrome service worker,
// native API, and React App Shell. Not the native Mac Side Panel.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

const extension=resolve(process.env.OPENDESK_EXTENSION_DIR||'dist/development');
const output=resolve(process.argv[2]||'artifacts/react-sidebar-r352-installed');
await mkdir(output,{recursive:true});
const browser=process.env.CHROME_BIN||
  ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(browser,'Installed Chrome/Chromium is required');
const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3,'Must use the real MV3 package');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let chrome,profile,socket,launchError,requestId=0,host=null,targetId=null,extensionId;
const pending=new Map(),caught=[],network=[];
const report={source:'INSTALLED_EXTENSION_CHROME_LINUX',chrome:null,simulatedHost:false,
  nativeMacSidePanel:'NOT_TESTED',status:'RUNNING',steps:[],reopens:0};
function call(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
    const id=++requestId,timer=setTimeout(()=>{
      pending.delete(id);reject(Error('CDP_TIMEOUT '+method));
    },18000);
    pending.set(id,{ok:value=>{clearTimeout(timer);resolve(value);},
      fail:error=>{clearTimeout(timer);reject(error);}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function until(run,label){
  let lastError='';
  for(let i=0;i<145;i++){
    try{const value=await run();if(value)return value;}
    catch(error){lastError=String(error.message||error);}
    await sleep(125);
  }
  throw Error('WAIT_FOR '+label+(lastError?': '+lastError:''));
}
async function evaluate(expression){
  const response=await call('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true},host);
  if(response.exceptionDetails)
    throw Error('Installed page exception: '+
      (response.exceptionDetails.exception?.description||response.exceptionDetails.text));
  return response.result.value;
}
const snapshotExpression=[
  '(async()=>{',
  'const d=document;',
  'const ids=["opendesk-react-app","workspace-content","workspace-dock",',
  '"workbench-tasks","workbench-tools","workbench-workflow",',
  '"workbench-develop","workbench-cloud","extension-center",',
  '"extension-center-list","cloud-overview-state","script-source"];',
  'const app=d.getElementById("opendesk-react-app");',
  'const list=d.getElementById("extension-center-list");',
  'return {readyState:d.readyState,href:location.href,',
  'chromeRuntime:typeof chrome?.runtime?.id==="string",',
  'storageApi:typeof chrome?.storage?.local?.get==="function",',
  'runtimeId:chrome?.runtime?.id||null,',
  'storageRead:await chrome.storage.local.get([]).then(x=>Object.keys(x).length),',
  'app:!!app,rootCount:d.querySelectorAll("#opendesk-react-app").length,',
  'tabCount:d.querySelectorAll(".workbench-nav button[role=tab]").length,',
  'centerOwner:d.getElementById("extension-center")?.dataset.opendeskReactOwner||null,',
  'listOwner:list?.dataset.opendeskReactOwner||null,',
  'appContainsList:!!app?.contains(list),',
  'appContainsCloud:!!app?.contains(d.getElementById("workbench-cloud")),',
  'idCounts:ids.map(id=>[id,d.querySelectorAll("#"+id).length]),',
  'view:d.documentElement.dataset.opendeskSurface||null,',
  'status:d.getElementById("extension-center-status")?.textContent||"",',
  'visibleText:d.body?.innerText?.slice(0,450)||""',
  '};})()'
].join('\n');
async function snapshot(){return evaluate(snapshotExpression);}
async function openInstalledPage(){
  const next=await call('Target.createTarget',{
    url:'chrome-extension://'+extensionId+'/ui/tool.html'});
  targetId=next.targetId;
  const attach=await call('Target.attachToTarget',{targetId,flatten:true});
  host=attach.sessionId;
  await call('Runtime.enable',{},host);
  await call('Page.enable',{},host);
  await call('Network.enable',{},host);
  const state=await until(async()=>{
    const s=await snapshot();
    return s.readyState==='complete'&&s.app&&
      s.listOwner==='extension-list'&&s.appContainsList&&s.appContainsCloud?s:null;
  },'real installed extension App Shell');
  assert.equal(state.chromeRuntime,true,'Real chrome.runtime required');
  assert.equal(state.storageApi,true,'Real chrome.storage.local required');
  assert.equal(state.runtimeId,extensionId,'Extension identity must match service worker');
  assert.equal(state.centerOwner,'extension-center');
  assert.equal(state.rootCount,1);
  assert.equal(state.tabCount,6);
  for(const [id,count] of state.idCounts)
    assert.equal(count,1,'One live DOM ID: '+id);
  report.steps.push({name:'real-extension-shell-mounted',view:state.view,
    tabCount:state.tabCount,loadedUrl:state.href});
  return state;
}
try{
  profile=await mkdtemp(join(tmpdir(),'od-r352-installed-'));
  const options=['--no-first-run','--no-default-browser-check',
    '--disable-gpu','--disable-dev-shm-usage','--use-mock-keychain',
    '--password-store=basic','--user-data-dir='+profile,
    '--remote-debugging-port=0','--disable-extensions-except='+extension,
    '--load-extension='+extension,'--headless=new','about:blank'];
  if(process.getuid?.()===0||(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'))
    options.unshift('--no-sandbox');
  chrome=spawn(browser,options,{stdio:['ignore','ignore','pipe']});
  let stderr='';
  chrome.on('error',error=>{launchError=error;});
  chrome.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-8000);});
  let endpoint;
  for(let attempt=0;attempt<220;attempt++){
    if(launchError)throw launchError;
    if(chrome.exitCode!==null||chrome.signalCode)throw Error('Chrome quit: '+stderr);
    try{
      const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8'))
        .trim().split('\n');
      if(lines.length>=2){endpoint='ws://127.0.0.1:'+lines[0]+lines[1];break;}
    }catch{}
    await sleep(100);
  }
  assert(endpoint,'Missing Chrome CDP endpoint: '+stderr);
  socket=new WebSocket(endpoint);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.method==='Runtime.exceptionThrown'){
      const d=m.params.exceptionDetails;
      caught.push({session:m.sessionId,
        exception:d?.exception?.description||d?.text||'unknown'});
    }
    if(m.method==='Network.responseReceived'&&m.params.response.status>=400&&
      !m.params.response.url.endsWith('/favicon.ico'))
      network.push({status:m.params.response.status,url:m.params.response.url});
    const wait=pending.get(m.id);
    if(!wait)return;pending.delete(m.id);
    m.error?wait.fail(Error(m.error.message)):wait.ok(m.result);
  });
  await call('Target.setDiscoverTargets',{discover:true});
  report.chrome=(await call('Browser.getVersion')).product;
  const worker=await until(async()=>{
    const targets=(await call('Target.getTargets')).targetInfos;
    return targets.find(t=>t.type==='service_worker'&&
      t.url.endsWith('/'+manifest.background.service_worker));
  },'actual installed MV3 service worker');
  extensionId=new URL(worker.url).host;
  report.extensionId=extensionId;
  await openInstalledPage();
  await call('Target.closeTarget',{targetId});
  host=null;targetId=null;
  await openInstalledPage();
  report.reopens=1;
  assert.deepEqual(caught,[],'No uncaught extension runtime errors');
  assert.deepEqual(network,[],'No failed installed resources');
  report.status='PASS';
  console.log('REACT_SIDEBAR_R352_INSTALLED_CHROME_PASS',JSON.stringify(report));
}catch(error){
  report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;
  if(host){
    try{report.failure=await snapshot();}catch(e){report.snapshotError=String(e);}
    try{
      const shot=await call('Page.captureScreenshot',{format:'png'},host);
      await writeFile(join(output,'failure.png'),Buffer.from(shot.data,'base64'));
    }catch{}
  }
  console.error('REACT_SIDEBAR_R352_INSTALLED_CHROME_FAIL',report.error,
    JSON.stringify(report.failure||{}));
}finally{
  report.runtimeErrors=caught;report.failedResources=network;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  try{socket?.close();}catch{}
  if(chrome?.exitCode===null&&!chrome.signalCode){
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(ok=>chrome.once('exit',ok)),sleep(2600)]);
    if(chrome.exitCode===null&&!chrome.signalCode)chrome.kill('SIGKILL');
  }
  if(profile)await rm(profile,{recursive:true,force:true,maxRetries:7,retryDelay:150});
}
