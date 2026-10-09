// R12 fixed-package Chrome MV3 registration/restart smoke. No mock senders,
// no preauthorized settings, no inherited profile and no release ZIP.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, stat, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

const binary=process.env.CHROME_FOR_TESTING_BIN;
assert(binary, 'Pinned CHROME_FOR_TESTING_BIN required');
const extension=resolve('dist/production');
const receipt=JSON.parse(await readFile('docs/framework/evidence/wxt/builds/build-production.json','utf8'));
const actual=await readFile(join(extension,'sw.js'));
const recorded=receipt.report.files.find(x=>x.path==='sw.js');
assert.equal(actual.length,recorded.bytes);
assert.equal(createHash('sha256').update(actual).digest('hex'),recorded.sha256);
const profile=await mkdtemp(join(tmpdir(),'opendesk-r12-sw-'));
let child;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function waitFor(fn, label, timeout=30000) {
  const start=Date.now(),errors=[];
  while(Date.now()-start<timeout) {
    if(child?.exitCode!==null && child?.exitCode!==undefined) throw Error('Chrome exited before '+label+': '+child.exitCode);
    try {const result=await fn();if(result)return result;} catch(e){errors.push(e.message);}
    await sleep(250);
  }
  throw Error('Timed out '+label+': '+errors.slice(-3).join('; '));
}
async function connect(url) {
  const socket=new WebSocket(url);
  const waiters=new Map();
  let seq=0;
  const ready=new Promise((yes,no)=>{
    socket.addEventListener('open',yes,{once:true});
    socket.addEventListener('error',no,{once:true});
  });
  await Promise.race([ready,new Promise((_,no)=>setTimeout(()=>no(Error('CDP open timeout')),10000))]);
  socket.addEventListener('message',event=>{
    let response;try {response=JSON.parse(event.data);}catch{return;}
    const wait=waiters.get(response.id);if(!wait)return;
    waiters.delete(response.id);clearTimeout(wait.timer);
    if(response.error)wait.reject(Error(response.error.message||'CDP error'));
    else wait.resolve(response.result??{});
  });
  socket.addEventListener('close',()=>{
    for(const w of waiters.values()){clearTimeout(w.timer);w.reject(Error('CDP closed'));}
    waiters.clear();
  });
  return {socket,send(method,params={},sessionId) {
    return new Promise((yes,no)=>{
      const id=++seq;
      const timer=setTimeout(()=>{waiters.delete(id);no(Error('CDP '+method+' timeout'));},10000);
      waiters.set(id,{resolve:yes,reject:no,timer});
      try {socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}
      catch(e){clearTimeout(timer);waiters.delete(id);no(e);}
    });
  }};
}
const expression=`(async()=>{const session=await chrome.storage.session.get('browserSessionIncarnation');return {
  url:location.href,extensionId:chrome.runtime.id,
  nativePortsMap:globalThis.__opendeskNativeHostPorts instanceof Map,
  hasSession:typeof session.browserSessionIncarnation==='string',
  session:session.browserSessionIncarnation,
  listeners:{
    messages:chrome.runtime.onMessage.hasListeners(),
    connect:chrome.runtime.onConnect.hasListeners(),
    tabs:chrome.tabs.onRemoved.hasListeners(),
    permissions:chrome.permissions.onRemoved.hasListeners(),
    navigation:chrome.webNavigation.onCommitted.hasListeners()
  }
};})()`;
async function observedWorker(cdp) {
  const all=await cdp.send('Target.getTargets');
  return all.targetInfos?.find(t=>t.type==='service_worker' && /^chrome-extension:\/\/[^/]+\/sw\.js$/.test(t.url));
}
async function inspect(cdp,targetId) {
  const attached=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  const sessionId=attached.sessionId;
  try {
    await cdp.send('Runtime.enable',{},sessionId);
    return await waitFor(async()=>{
      const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
      if(result.exceptionDetails)throw Error('SW runtime exception: '+JSON.stringify(result.exceptionDetails).slice(0,400));
      const value=result.result?.value;
      return value?.hasSession ? value : null;
    },'SW broker session');
  } finally {
    await cdp.send('Target.detachFromTarget',{sessionId}).catch(()=>{});
  }
}
try {
  child=spawn(binary,[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-sync',
    '--disable-background-networking','--remote-debugging-port=0',
    '--user-data-dir='+profile,
    '--disable-extensions-except='+extension,'--load-extension='+extension,
    'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',part=>{stderr=(stderr+part.toString()).slice(-12000);});
  const [port,endpoint]=await waitFor(async()=>{
    const p=await readFile(join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
    const items=p?.trim().split('\n');return items?.length===2?items:null;
  },'Chrome debugger port');
  const cdp=await connect('ws://127.0.0.1:'+port+endpoint);
  try {
    const first=await waitFor(()=>observedWorker(cdp),'installed MV3 extension SW',30000);
    const before=await inspect(cdp,first.targetId);
    assert.equal(before.url,first.url);
    assert.equal(before.nativePortsMap,true);
    assert(Object.values(before.listeners).every(Boolean),'Required Chrome event listener not registered');
    const extensionId=before.extensionId;
    assert.match(extensionId,/^[a-p]{32}$/);
    // The built-in CDP lifecycle control stops a real Worker. No mock event
    // or altered user permissions is used. Its real registered scope restarts.
    // ServiceWorker CDP domain is a PAGE-session domain, not a Browser-root
    // command in Chrome 155. Keep the action in the isolated real browser.
    const page=(await cdp.send('Target.getTargets')).targetInfos.find(x=>x.type==='page' && x.url==='about:blank');
    assert(page,'Missing actual Chrome page target for ServiceWorker CDP domain');
    const pageSession=(await cdp.send('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
    let resumed;
    try {
      await cdp.send('ServiceWorker.enable',{},pageSession);
      await cdp.send('ServiceWorker.stopAllWorkers',{},pageSession);
      await waitFor(async()=>!(await observedWorker(cdp)),'actual worker suspension',15000);
      await cdp.send('ServiceWorker.startWorker',{scopeURL:'chrome-extension://'+extensionId+'/'},pageSession);
      resumed=await waitFor(()=>observedWorker(cdp),'real MV3 service worker restart',20000);
    } finally {
      await cdp.send('Target.detachFromTarget',{sessionId:pageSession}).catch(()=>{});
    }
    const after=await inspect(cdp,resumed.targetId);
    assert.equal(after.extensionId,extensionId);
    assert.equal(after.nativePortsMap,true);
    assert(Object.values(after.listeners).every(Boolean),'Listener missing after SW restart');
    assert.equal(after.session,before.session,'Session incarnation changed across SW restart');
    const evidence={test:'R12 SW native registration + stop/start',status:'passed',
      chromeProcessPid:child.pid,packageHash:receipt.report.packageHash,
      swBytes:actual.length,swSha256:recorded.sha256,
      firstUrl:first.url,resumedUrl:resumed.url,extensionId,
      requiredEventListeners:before.listeners,
      originalSessionPreserved:after.session===before.session};
    const output='artifacts/r12-sw-native-smoke.json';
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,JSON.stringify(evidence,null,2)+'\n');
    console.log('R12_NATIVE_SW_REGISTRATION_AND_RESTART=PASS packageHash='+evidence.packageHash+' swBytes='+evidence.swBytes);
  } finally {cdp.socket.close();}
} catch(error) {
  console.error('R12_NATIVE_SW_REGISTRATION_AND_RESTART=FAIL '+error.stack);
  throw error;
} finally {
  if(child?.exitCode===null){child.kill('SIGTERM');await sleep(350);if(child.exitCode===null)child.kill('SIGKILL');}
  await rm(profile,{recursive:true,force:true});
}
