#!/usr/bin/env node
// INSTALLED_EXTENSION_CHROME_LINUX: actual WXT MV3, real Chrome service worker,
// native API, and React App Shell. Not the native Mac Side Panel.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {verifyPackage} from '../verify-package.mjs';
import {createHash} from 'node:crypto';
import {verifyDeveloperSourceInput} from './developer-source-input.mjs';

const extension=resolve(process.env.OPENDESK_EXTENSION_DIR||'dist/production');
const output=resolve(process.argv[2]||'artifacts/react-sidebar-r352-installed');
await mkdir(output,{recursive:true});
const browser=process.env.OPENDESK_CHROMIUM_EXECUTABLE||process.env.CHROME_BIN||
  ['/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(browser,'Installed Chrome/Chromium is required');
const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3,'Must use the real MV3 package');
const buildMode=process.env.OPENDESK_BUILD_MODE||'production';
assert.ok(['production','development'].includes(buildMode),'Explicit production/development build mode required');
// Edition names (e.g. Developer) do not identify the WXT build mode.
const expectedTabs=['tasks','tools','workflow','develop','cloud',...(buildMode==='development'?['debug']:[])];
const entry=manifest.side_panel?.default_path;
assert.ok(entry,'Packaged manifest must declare side_panel.default_path');
assert.ok(!entry.startsWith('/')&&!entry.includes('..')&&!entry.includes('://'),'Local packaged Side Panel entry required');
assert.ok(existsSync(join(extension,entry.split(/[?#]/)[0])),'Manifest Side Panel document must exist in this candidate');
assert.ok(manifest.background?.service_worker,'Packaged MV3 service worker required');
const keepBrowser=process.env.OPENDESK_KEEP_BROWSER==='1';
const headful=process.env.OPENDESK_HEADFUL==='1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let chrome,profile,socket,launchError,requestId=0,host=null,targetId=null,extensionId,endpoint;
const pending=new Map(),caught=[],network=[];
const report={source:'INSTALLED_EXTENSION_CFT_'+process.platform.toUpperCase(),platform:process.platform,
  extension,entry,buildMode,headful,chrome:null,simulatedHost:false,
  nativeMacSidePanel:'NOT_TESTED',status:'RUNNING',steps:[],reopens:0};
const packageBefore=await verifyPackage(extension,{mode:buildMode});
Object.assign(report,{packageHash:packageBefore.packageHash,edition:packageBefore.edition});
if(process.env.OPENDESK_BUILD_RECEIPT){
  const bytes=await readFile(process.env.OPENDESK_BUILD_RECEIPT),receipt=JSON.parse(bytes);
  assert.equal(receipt.report.packageHash,packageBefore.packageHash);
  assert.equal(receipt.status,'passed');
  report.buildReceipt={path:resolve(process.env.OPENDESK_BUILD_RECEIPT),sha256:createHash('sha256').update(bytes).digest('hex'),attemptId:receipt.attemptId};
}
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
const snapshotExpression=`(async()=>{
  const d=document,app=d.getElementById('opendesk-react-app');
  const ids=['opendesk-react-app','workspace-content','workspace-dock',
    'workbench-tasks','workbench-tools','workbench-workflow','workbench-develop',
    'workbench-cloud','extension-center','extension-center-list','script-source'];
  const tabs=[...d.querySelectorAll('.workbench-nav button[role=tab]')];
  return {readyState:d.readyState,href:location.href,
    chromeRuntime:typeof chrome?.runtime?.id==='string',
    storageApi:typeof chrome?.storage?.local?.get==='function',
    runtimeId:chrome?.runtime?.id||null,manifest:chrome.runtime.getManifest(),
    storageRead:await chrome.storage.local.get([]).then(x=>Object.keys(x).length),
    app:!!app,rootCount:d.querySelectorAll('#opendesk-react-app').length,
    availableTabs:tabs.filter(x=>!x.hidden).map(x=>x.dataset.workbenchTab),
    visibleTabs:tabs.filter(x=>!x.hidden&&x.getClientRects().length).map(x=>x.dataset.workbenchTab),
    selected:tabs.filter(x=>x.getAttribute('aria-selected')==='true').map(x=>x.dataset.workbenchTab),
    debugHidden:d.getElementById('tab-debug')?.hidden,
    debugPage:!!d.getElementById('workbench-debug'),
    idCounts:ids.map(id=>[id,d.querySelectorAll('#'+id).length]),
    ownedIds:ids.filter(id=>id!=='opendesk-react-app').map(id=>[id,!!app?.contains(d.getElementById(id))]),
    developerOwners:[
      ['#script-source','developer-source'],
      ['#script-javascript-world-row','developer-world'],
      ['#page-component-framework .page-component-choices','developer-framework'],
      ['#develop-dock .dock-buttons','developer-actions'],
      ['#script-status','developer-run-status'],
      ['#script-result','developer-result'],
      ['#script-current-page-host','developer-target-host']
    ].map(([selector,expected])=>({selector,expected,
      actual:d.querySelector(selector)?.dataset.opendeskReactOwner||null})),
    portalCount:d.querySelectorAll('[data-opendesk-diagnostic-portal],#debug-diagnostic-portal').length,
    surface:d.documentElement.dataset.opendeskSurface||null,
    catalogVisible:!!d.getElementById('workbench-discover')&&!d.getElementById('workbench-discover').hidden,
    toolVisible:!!d.getElementById('sidebar-tool-display')&&!d.getElementById('sidebar-tool-display').hidden,
    visibleText:d.body?.innerText?.slice(0,450)||''};
})()`;
async function snapshot(){return evaluate(snapshotExpression);}
async function openInstalledPage(){
  const url='chrome-extension://'+extensionId+'/'+entry;
  const next=await call('Target.createTarget',{url});
  targetId=next.targetId;
  const attach=await call('Target.attachToTarget',{targetId,flatten:true});
  host=attach.sessionId;
  await call('Runtime.enable',{},host);
  await call('Page.enable',{},host);
  await call('Network.enable',{},host);
  const params=new URL(url).searchParams;
  const expectedSurface=params.has('toolId')||params.has('previewId')?'tool-page':'catalog';
  const state=await until(async()=>{
    const s=await snapshot();
    return s.readyState==='complete'&&s.app&&s.surface===expectedSurface&&
      s.idCounts.every(([,count])=>count===1)?s:null;
  },'real installed React app and '+expectedSurface+' classification');
  assert.equal(state.chromeRuntime,true,'Real chrome.runtime required');
  assert.equal(state.storageApi,true,'Real chrome.storage.local required');
  assert.equal(state.runtimeId,extensionId,'Extension identity must match service worker');
  assert.equal(state.manifest.name,manifest.name,'Runtime must use this packaged manifest');
  assert.equal(state.manifest.version,manifest.version);
  assert.equal(state.manifest.side_panel?.default_path,entry);
  assert.equal(state.rootCount,1);
  assert.deepEqual(state.availableTabs,expectedTabs,'Production has five available tabs; development adds Debug');
  assert.equal(state.debugHidden,buildMode!=='development');
  assert.equal(state.debugPage,buildMode==='development');
  for(const [id,count] of state.idCounts)assert.equal(count,1,'One live DOM ID: '+id);
  for(const [id,owned] of state.ownedIds)assert.equal(owned,true,'Single React root contains '+id);
  for(const row of state.developerOwners)
    assert.equal(row.actual,row.expected,'React must exclusively own mounted Developer slot: '+row.selector);
  assert.equal(state.portalCount,0,'No diagnostic portal');
  if(expectedSurface==='catalog'){
    assert.equal(state.catalogVisible,true,'Default extension tab opens actual catalog');
    assert.equal(state.toolVisible,false,'Default catalog must not impersonate a tool preview');
  }else assert.equal(state.selected[0],'tools','Tool/preview uses the tools page');
  report.steps.push({name:'real-extension-tab-mounted',surface:state.surface,
    availableTabs:state.availableTabs,visibleTabs:state.visibleTabs,loadedUrl:state.href,
    nativeSidePanel:'NOT_TESTED'});
  return state;
}

try{
  profile=await mkdtemp(join(tmpdir(),'od-r352-installed-'));
  const options=['--no-first-run','--no-default-browser-check',
    '--disable-gpu','--disable-dev-shm-usage','--use-mock-keychain',
    '--password-store=basic','--user-data-dir='+profile,
    '--remote-debugging-port=0','--disable-extensions-except='+extension,
    '--load-extension='+extension,...(headful?[]:['--headless=new']),'about:blank'];
  if(process.getuid?.()===0||(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'))
    options.unshift('--no-sandbox');
  chrome=spawn(browser,options,{detached:keepBrowser,stdio:['ignore','ignore','pipe']});
  let stderr='';
  chrome.on('error',error=>{launchError=error;});
  chrome.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-8000);});
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
  report.cdpEndpoint=endpoint;report.profile=profile;report.browserPid=chrome.pid;
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
  const nativePanel=await evaluate(`chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})
    .then(contexts=>contexts.some(context=>context.documentUrl===location.href))`);
  report.steps.push(nativePanel?{name:'native-developer-source-editing',...await verifyDeveloperSourceInput({
    call:(method,params)=>call(method,params,host),evaluate,until
  })}:{name:'native-developer-source-editing',status:'NOT_TESTED',
    reason:'Catalog route hides Developer controls; this check requires a real SIDE_PANEL context.'});
  await call('Target.closeTarget',{targetId});
  host=null;targetId=null;
  await openInstalledPage();
  report.reopens=1;
  assert.deepEqual(caught,[],'No uncaught extension runtime errors');
  assert.deepEqual(network,[],'No failed installed resources');
  assert.equal((await verifyPackage(extension,{mode:buildMode})).packageHash,packageBefore.packageHash);
  report.status='PASS';

}catch(error){
  report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;
  if(socket?.readyState===WebSocket.OPEN){
    try{report.targets=(await call('Target.getTargets')).targetInfos.map(t=>
      ({type:t.type,url:t.url?.slice(0,210)}));}catch{}
  }
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
  const retained=keepBrowser&&Boolean(endpoint)&&chrome?.exitCode===null&&!chrome.signalCode;
  report.browserRetained=retained;
  try{socket?.close();}catch{}
  if(retained){
    // Detach only our client; leave this driver's own CFT and generated profile for CUA.
    chrome.stderr.destroy();chrome.unref();
    console.log('OPENDESK_BROWSER_RETAINED',JSON.stringify({
      cdpEndpoint:endpoint,profile,pid:chrome.pid,headful,extension}));
  }else{
    if(chrome?.exitCode===null&&!chrome.signalCode){
      chrome.kill('SIGTERM');
      await Promise.race([new Promise(ok=>chrome.once('exit',ok)),sleep(2600)]);
      if(chrome.exitCode===null&&!chrome.signalCode)chrome.kill('SIGKILL');
    }
    if(profile)await rm(profile,{recursive:true,force:true,maxRetries:7,retryDelay:150});
  }
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(report.status==='PASS')console.log('REACT_SIDEBAR_R352_INSTALLED_CHROME_PASS',JSON.stringify(report));
}
