#!/usr/bin/env node
// R2.3 real Chrome source-driver probe, intentionally NOT the installed OpenDesk Host.
// Uses the production CDP driver + production independent MAIN-world page reader.
// Reports separate evidence. It cannot certify the production SDK/permissions/UI.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve('examples/sidebar-tools/browser-fingerprint');
const out=resolve('artifacts/sidebar-tools/browser-fingerprint/chrome-native-r23');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const temp=await mkdtemp(join(tmpdir(),'opendesk-fp-r23-'));
const extension=join(temp,'extension'),profile=join(temp,'chrome-profile');
const evidence={kind:'REAL_CHROME_NATIVE_PRODUCTION_DRIVER_ISOLATED_HARNESS',
  source:'src/platform/chrome/browser-fingerprint.js',
  pageReader:'src/platform/chrome/browser-page-environment.js',
  installedOpenDeskHost:false,installedReact:false,macChrome:false,
  uaChScope:'LOW_ENTROPY_PLATFORM_ONLY',httpAcceptLanguage:'UNVERIFIABLE',
  geolocation:'UNSUPPORTED',status:'NOT_TESTED'};
let browser,server,ws,stderr='';
try{
  await mkdir(extension,{recursive:true});
  await mkdir(out,{recursive:true});
  for(const name of ['browser-fingerprint.js','browser-page-environment.js'])
    await copyFile(resolve('src/platform/chrome',name),join(extension,name));
  await writeFile(join(extension,'manifest.json'),JSON.stringify({
    manifest_version:3,name:'OpenDesk Fingerprint R2.3 Native Source Probe',
    version:'0.0.1',minimum_chrome_version:'138',
    permissions:['debugger','tabs','scripting','webNavigation'],
    host_permissions:['http://127.0.0.1/*'],
    background:{service_worker:'opendesk-fingerprint-native-r23-worker.js',type:'module'}
  },null,2));
  server=createServer((req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Fingerprint Native QA</h1></body></html>');
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const fixtureUrl='http://127.0.0.1:'+server.address().port+'/';
  const worker=[
    'import {createFingerprintDriver} from "./browser-fingerprint.js";',
    'import {createPageEnvironmentReader} from "./browser-page-environment.js";',
    'const delay=ms=>new Promise(ok=>setTimeout(ok,ms));',
    'const tabRef="T".repeat(32),documentRef="D".repeat(32);',
    'const refs={tabRef,documentRef};',
    'const owner={toolId:"browser-fingerprint",toolVersion:"0.2.2",packageHash:"a".repeat(64),',
    ' epoch:"native-r23",hostInstanceId:"00000000-0000-4000-8000-000000000000",',
    ' toolInstance:"11111111-1111-4111-8111-111111111111"};',
    'let identity;',
    'async function target(input){',
    ' if(input.tabRef!==tabRef||input.documentRef!==documentRef||!identity)throw Error("E_DOCUMENT_STALE");',
    ' const tab=await chrome.tabs.get(identity.tabId);',
    ' const active=(await chrome.tabs.query({active:true,windowId:identity.windowId}))[0];',
    ' const frame=await chrome.webNavigation.getFrame({tabId:identity.tabId,frameId:0});',
    ' if(tab.id!==active?.id||tab.windowId!==identity.windowId||',
    '    frame?.documentId!==identity.documentId||frame?.url!==identity.url)throw Error("E_DOCUMENT_CHANGED");',
    ' return {...identity};',
    '}',
    'const reader=createPageEnvironmentReader({api:chrome,resolveTarget:target,authorize:async()=>true});',
    'const driver=createFingerprintDriver({api:chrome,resolveTarget:target,',
    ' readPage:(args,ctx)=>reader.readEnvironment(args,ctx),authorize:async()=>true});',
    'async function cycle(config){',
    ' const baseline=await reader.readEnvironment(refs,owner);',
    ' const ack=await driver.apply({...refs,config},owner);',
    ' const applied=await driver.readback({sessionRef:ack.sessionRef,documentRef,mode:"applied"},owner);',
    ' const stop=await driver.restore({sessionRef:ack.sessionRef,documentRef},owner);',
    ' const restored=await driver.readback({sessionRef:ack.sessionRef,documentRef,mode:"restore"},owner);',
    ' return {config,baseline,ack,applied,stop,restored};',
    '}',
    'globalThis.fpR23Native={async run(){',
    ' const tab=await chrome.tabs.create({url:"__FIXTURE_URL__",active:true});',
    ' let frame;',
    ' for(let i=0;i<100;i++){frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0}).catch(()=>null);',
    '   if(frame?.documentId&&frame.url==="__FIXTURE_URL__")break;await delay(100);}',
    ' if(!frame?.documentId||frame.url!=="__FIXTURE_URL__")throw Error("TEST_PAGE_UNAVAILABLE");',
    ' identity={tabId:tab.id,windowId:tab.windowId,documentId:frame.documentId,url:frame.url};',
    ' const us=await cycle({ua:"windows",lang:"en-US",tz:"America/New_York",geo:"nyc",viewport:"desktop"});',
    ' const de=await cycle({ua:"mac",lang:"de-DE",tz:"Europe/Berlin",geo:"berlin",viewport:"desktop"});',
    ' return {identity,us,de};',
    '}};'
  ].join('\n').replaceAll('__FIXTURE_URL__',fixtureUrl);
  await writeFile(join(extension,'opendesk-fingerprint-native-r23-worker.js'),worker);
  browser=spawn(process.env.CHROME_BIN||'chromium',[
    // Use an actual headed Chrome window under CI's Xvfb. HeadlessChrome
    // deliberately has a different UA and is not an ordinary user baseline.
    '--no-sandbox','--disable-dev-shm-usage','--no-first-run',
    '--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+extension,'--load-extension='+extension,
    'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  browser.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-10000);});
  let port;
  for(let i=0;i<150;i++){
    if(browser.exitCode!==null)throw Error('CHROME_EXITED_BEFORE_READY');
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}
    catch{}
    if(port)break;
    await sleep(100);
  }
  assert(port,'CHROME_NATIVE_CDP_PORT_MISSING');
  let targetInfo;
  for(let i=0;i<150;i++){
    const list=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    targetInfo=list.find(t=>t.type==='service_worker'&&
      t.url.endsWith('/opendesk-fingerprint-native-r23-worker.js')&&
      t.url.startsWith('chrome-extension://'));
    if(targetInfo?.webSocketDebuggerUrl)break;
    await sleep(100);
  }
  assert(targetInfo?.webSocketDebuggerUrl,'NATIVE_TEST_EXTENSION_SERVICE_WORKER_MISSING');
  ws=new WebSocket(targetInfo.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',fail,{once:true});});
  const runtimeEvents=[];
  ws.addEventListener('message',event=>{
    let value;try{value=JSON.parse(event.data);}catch{return;}
    if(['Runtime.exceptionThrown','Runtime.consoleAPICalled','Log.entryAdded'].includes(value.method))
      runtimeEvents.push(JSON.stringify(value.params||{}).slice(0,1600));
  });
  let serial=0;
  async function cmd(method,params={}){
    return new Promise((ok,fail)=>{
      const id=++serial,timer=setTimeout(()=>fail(Error('CDP command timeout: '+method)),90000);
      const listener=event=>{
        const msg=JSON.parse(event.data);
        if(msg.id!==id)return;
        ws.removeEventListener('message',listener);clearTimeout(timer);
        msg.error?fail(Error(msg.error.message)):ok(msg.result);
      };
      ws.addEventListener('message',listener);
      ws.send(JSON.stringify({id,method,params}));
    });
  }
  await cmd('Runtime.enable');
  // CDP can attach before Chrome resumes a freshly spawned MV3 worker.
  await cmd('Runtime.runIfWaitingForDebugger');
  await cmd('Log.enable').catch(()=>{});
  // A newly discovered module service worker can be inspected before its
  // imports and top-level initialization finish. Observe readiness first.
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    const check=await cmd('Runtime.evaluate',{
      expression:'typeof globalThis.fpR23Native?.run',returnByValue:true});
    if(check.result?.value==='function'){ready=true;break;}
    await sleep(100);
  }
  if(!ready){
    const inspect=await cmd('Runtime.evaluate',{expression:
      '({href:location.href,chrome:typeof chrome,bootstrap:typeof globalThis.fpR23Native})',
      returnByValue:true});
    evidence.bootstrap=inspect.result?.value||null;
    const imported=await cmd('Runtime.evaluate',{expression:
      '(async()=>{const out={debugger:typeof chrome.debugger,manifest:chrome.runtime.getManifest().permissions};'+
      'for(const file of ["background.js","browser-fingerprint.js","browser-page-environment.js"]){'+
      'try{const mod=await import(chrome.runtime.getURL(file));out[file]={ok:true,keys:Object.keys(mod)};}'+
      'catch(e){out[file]={error:String(e),stack:String(e.stack).slice(0,800)};}}return out;})()',
      awaitPromise:true,returnByValue:true});
    evidence.importDiagnostics=imported.result?.value||imported.exceptionDetails?.text||null;
    evidence.runtimeEvents=runtimeEvents.slice(-10);
    evidence.chromeStderr=stderr.slice(-3500);
    throw Error('NATIVE_WORKER_MODULE_BOOTSTRAP_MISSING '+JSON.stringify(evidence.bootstrap));
  }
  const result=await cmd('Runtime.evaluate',{expression:'globalThis.fpR23Native.run()',
    awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||
    result.exceptionDetails.text||'NATIVE_WORKER_EXCEPTION');
  assert(result.result?.value,'NATIVE_RESULT_UNAVAILABLE');
  const runs=result.result.value;
  evidence.results=runs; // Preserve raw evidence even if a field assertion fails.
  for(const [name,run] of [['us',runs.us],['de',runs.de]]){
    assert.equal(run.ack.accepted,true);
    assert.equal(run.ack.source,'trusted-browser-host');
    for(const key of ['ua','uaCH','language','timezone','viewport']){
      assert.equal(run.ack.fieldResults.find(x=>x.key===key)?.status,'applied',
        name+': native CDP command not applied for '+key);
      assert.equal(run.applied.rows.find(x=>x.key===key)?.status,'match',
        name+': independent MAIN readback failed for '+key);
      assert.equal(run.restored.rows.find(x=>x.key===key)?.status,'match',
        name+': independent baseline restore failed for '+key);
    }
    for(const key of ['acceptLanguage','geolocation','publicIp'])
      assert.equal(run.applied.rows.find(x=>x.key===key)?.status,'unverifiable',
        name+': unsupported/network field falsely marked verified: '+key);
    assert.equal(run.stop.accepted,true);
    assert.notEqual(run.applied.rows.find(x=>x.key==='ua').baseline,
      run.applied.rows.find(x=>x.key==='ua').observed,
      name+': UA did not change from original baseline');
  }
  evidence.status='PASS_CHROMIUM_NATIVE_DRIVER_ONLY';
  evidence.browser=JSON.parse(await(await fetch('http://127.0.0.1:'+port+'/json/version')).text()).Browser;
  evidence.results=runs;
  console.log('FINGERPRINT_R23_REAL_CHROME_CDP_AND_MAIN_WORLD_READBACK_PASS');
}catch(error){
  evidence.status='FAIL';
  evidence.error=String(error?.stack||error);
  evidence.chromeStderr=stderr.slice(-8000);
  console.error(evidence.error);
  if(evidence.bootstrap)console.error('R23_BOOTSTRAP '+JSON.stringify(evidence.bootstrap));
  if(evidence.importDiagnostics)console.error('R23_IMPORT_DIAGNOSTICS '+JSON.stringify(evidence.importDiagnostics));
  if(evidence.runtimeEvents?.length)console.error('R23_RUNTIME_EVENTS '+JSON.stringify(evidence.runtimeEvents));
  if(stderr)console.error('R23_CHROME_STDERR '+stderr.slice(-3500));
  process.exitCode=1;
}finally{
  await mkdir(out,{recursive:true});
  await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  try{ws?.close();}catch{}
  if(browser){
    if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGTERM');
    for(let i=0;i<30&&browser.exitCode===null&&browser.signalCode===null;i++)await sleep(100);
    if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGKILL');
    for(let i=0;i<30&&browser.exitCode===null&&browser.signalCode===null;i++)await sleep(100);
  }
  if(server)await new Promise(ok=>server.close(ok));
  // Chrome's profile writer can still be finalizing just after process exit.
  for(let attempt=0;attempt<6;attempt++){
    try{await rm(temp,{recursive:true,force:true});break;}
    catch(error){if(attempt===5)throw error;await sleep(250);}
  }
}
