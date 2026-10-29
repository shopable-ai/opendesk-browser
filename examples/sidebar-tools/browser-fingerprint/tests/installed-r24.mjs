#!/usr/bin/env node
// R2.4: install the source-identical candidate in the REAL OpenDesk WXT Host.
// All actions go through the installed React UI, SDK and Trusted Host. An
// independent test observer reads the target webpage in Chrome MAIN world.
// This is NOT the earlier isolated CDP-driver test and never self-grants an App.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const root=resolve('examples/sidebar-tools/browser-fingerprint');
const output=resolve(process.argv[2]||'artifacts/app-ci/browser-fingerprint/chrome');
const candidate=resolve('artifacts/app-ci/browser-fingerprint/candidate.opendesk-tool.json');
const extension=resolve('dist/development');
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const digest=b=>createHash('sha256').update(b).digest('hex');
const temp=await mkdtemp(join(tmpdir(),'opendesk-fp-installed-r24-'));
const profile=join(temp,'chrome-profile');
const evidence={
  kind:'CHROMIUM_INSTALLED_FULL_CHAIN_R24',
  installedOpenDeskHost:false,installedReact:false,macChrome:'NOT_TESTED',
  httpAcceptLanguage:'UNVERIFIABLE',geolocation:'UNSUPPORTED',
  uaCH:'LOW_ENTROPY_PLATFORM_ONLY',status:'NOT_TESTED',checks:[],cycles:[],
  sourceCommit:process.env.GITHUB_SHA||'unknown'
};
let chrome,server,ws,stderr='';
try{
  await mkdir(output,{recursive:true});
  const receipt=JSON.parse(await readFile(resolve('artifacts/app-ci/browser-fingerprint/candidate-receipt.json')));
  const bytes=await readFile(candidate);
  const pkg=JSON.parse(bytes);
  evidence.candidate={id:pkg.id,version:pkg.version,sha256:digest(bytes),bytes:bytes.length,
    capabilities:pkg.capabilities,sourceCommit:receipt.sourceCommit};
  assert.equal(receipt.schema,'opendesk.app-ci-candidate.v1');
  assert.equal(receipt.sourceCommit,evidence.sourceCommit,'candidate must belong to current main');
  assert.equal(receipt.sha256,evidence.candidate.sha256);
  assert.equal(receipt.bytes,bytes.length);
  assert.equal(pkg.id,'browser-fingerprint');
  assert.equal(pkg.version,'0.2.2');
  assert(pkg.capabilities.includes('browser.fingerprint.control'));
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json')));
  assert(manifest.permissions.includes('debugger'));
  assert(!manifest.optional_permissions?.includes('debugger'));
  const hostBundle=await readFile(join(extension,'platform/context-menus.js'),'utf8');
  assert(hostBundle.includes('Emulation.setUserAgentOverride'));
  assert(hostBundle.includes('Emulation.setTimezoneOverride'));
  evidence.checks.push('R24_CANDIDATE_SHA_VERSION_CAPABILITY_AND_WXT_HOST_PASS');

  server=createServer((_req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fingerprint R2.4</title></head><body><h1>Fingerprint R2.4 Test</h1></body></html>');
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
  const fixture='http://127.0.0.1:'+server.address().port+'/';
  chrome=spawn(process.env.CHROME_BIN||'chromium',[
    '--no-sandbox','--disable-dev-shm-usage','--no-first-run','--disable-gpu',
    '--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',c=>{stderr=(stderr+String(c)).slice(-8000)});
  let port;
  for(let i=0;i<240;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited before DevTools endpoint: '+stderr.slice(-1000));
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;
    await pause(100);
  }
  assert(port,'CHROME_DEBUG_ENDPOINT_NOT_AVAILABLE');
  const browserVersion=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  evidence.browser=browserVersion.Browser;
  ws=new WebSocket(browserVersion.webSocketDebuggerUrl);
  await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true})});
  let serial=0;
  const pending=new Map();
  const protocolErrors=[];
  ws.addEventListener('message',event=>{
    let message;try{message=JSON.parse(event.data)}catch{return}
    if(message.id!==undefined){
      const task=pending.get(message.id);
      if(!task)return;
      pending.delete(message.id);clearTimeout(task.timer);
      message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);
    }else if(message.method==='Runtime.exceptionThrown'){
      protocolErrors.push(JSON.stringify(message.params).slice(0,1000));
    }
  });
  function send(method,params={},sessionId){
    return new Promise((resolve,reject)=>{
      const id=++serial;
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method))},30000);
      pending.set(id,{resolve,reject,timer});
      ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }
  async function until(action,name,max=160){
    let last;
    for(let i=0;i<max;i++){
      try{const value=await action();if(value)return value}catch(e){last=e}
      await pause(150);
    }
    throw Error('WAIT '+name+' '+String(last||'').slice(0,350));
  }
  const targets=async()=>(await send('Target.getTargets')).targetInfos;
  const attach=async id=>(await send('Target.attachToTarget',{targetId:id,flatten:true})).sessionId;
  async function evaluate(expression,session){
    const r=await send('Runtime.evaluate',
      {expression,returnByValue:true,awaitPromise:true,userGesture:true},session);
    if(r.exceptionDetails)throw Error('JS_EXCEPTION '+JSON.stringify(r.exceptionDetails).slice(0,700));
    return r.result?.value;
  }
  const click=async(selector,session)=>{
    const point=await evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
      'if(!n||n.disabled)return null;n.scrollIntoView({block:"center"});'+
      'const r=n.getBoundingClientRect();return r.width&&r.height?'+
      '{x:r.x+r.width/2,y:r.y+r.height/2}:null})()',session);
    assert(point,'CONTROL_NOT_CLICKABLE '+selector);
    for(const type of ['mousePressed','mouseReleased'])
      await send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point},session);
  };
  const originalWorker=await until(async()=>(await targets()).find(t=>
    t.type==='service_worker'&&t.url.endsWith('/sw.js')),'WXT service worker');
  const extensionId=new URL(originalWorker.url).host;
  evidence.extensionId=extensionId;
  const worker=await attach(originalWorker.targetId);
  const created=await send('Target.createTarget',{url:fixture});
  await until(async()=>{const list=await targets();return list.some(t=>t.targetId===created.targetId&&t.url===fixture)},'fixture tab');
  const sideFirst=await send('Target.createTarget',{
    url:'chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId='+randomUUID()});
  let host=await attach(sideFirst.targetId);
  await until(()=>evaluate('document.readyState==="complete"&&document.body.innerText.length>80',host),'Host bootstrap');
  await send('Target.activateTarget',{targetId:created.targetId});
  if(await evaluate('!!document.querySelector("#catalog-open-dev-sidebar")',host)){
    await click('#catalog-open-dev-sidebar',host);
    const side=await until(async()=>(await targets()).find(t=>
      ['page','other'].includes(t.type)&&t.url.includes('/sidepanel.html')&&
      t.targetId!==sideFirst.targetId),'real Side Panel');
    host=await attach(side.targetId);
    const contexts=await evaluate('chrome.runtime.getContexts({})',host);
    assert(contexts.some(c=>c.contextType==='SIDE_PANEL'),'real Chrome SIDE_PANEL context');
    evidence.realSidePanel=true;
  }else{
    throw Error('OFFICIAL_SIDEPANEL_ENTRY_MISSING');
  }
  await until(()=>evaluate('!!document.querySelector("#tab-tools")',host),'tools Tab');
  await click('#tab-tools',host);
  await click('#extension-center-more',host);
  await click('#extension-center-import',host);
  await until(()=>evaluate('!!document.querySelector("#sidebar-tool-file")',host),'candidate import input');
  await send('DOM.enable',{},host);
  const {root:domRoot}=await send('DOM.getDocument',{depth:-1,pierce:true},host);
  const {nodeId}=await send('DOM.querySelector',{nodeId:domRoot.nodeId,selector:'#sidebar-tool-file'},host);
  assert(nodeId,'MISSING_IMPORT_FILE_INPUT');
  await send('DOM.setFileInputFiles',{nodeId,files:[candidate]},host);
  await until(()=>evaluate('!!document.querySelector("#sidebar-tool-install")&&'+
    '!document.querySelector("#sidebar-tool-install").disabled',host),'reviewed candidate ready');
  evidence.installReview=(await evaluate('document.body.innerText',host)).slice(-1500);
  assert(evidence.installReview.includes('浏览器指纹'),'correct tool review visible');
  await click('#sidebar-tool-install',host);
  const appSelector='[data-extension-key="app:browser-fingerprint"][data-extension-action="main"]';
  await until(()=>evaluate('!!document.querySelector('+JSON.stringify(appSelector)+')',host),'installed App row');
  evidence.installedOpenDeskHost=true;
  evidence.checks.push('R24_CANDIDATE_INSTALLED_VIA_OFFICIAL_REVIEW_PASS');
  await click(appSelector,host);
  const iframe=await until(async()=>(await targets()).find(t=>
    t.type==='iframe'&&t.url.endsWith('/sidebar-tools/sandbox.html')),'installed sandbox');
  const sandbox=await attach(iframe.targetId);
  const appRead=expr=>evaluate(expr,sandbox);
  await until(()=>appRead('!!document.querySelector(".fp-app")&&'+
    '!!document.querySelector(".fp-bottom-actions")'),'installed React');
  assert(!(await appRead('document.body.innerText')).includes('离线同源 React 预览'));
  evidence.installedReact=true;
  evidence.checks.push('R24_REAL_REACT_SDK_SANDBOX_PASS');

  // Independent observer calls Chrome scripting directly from the test driver.
  // It does NOT use React's target/receipt or the Trusted Host page reader.
  async function independent(){
    const expr='(async()=>{'+
      'const tab=(await chrome.tabs.query({})).find(t=>t.url==='+JSON.stringify(fixture)+');'+
      'if(!tab)throw Error("FIXTURE_TAB_NOT_FOUND");'+
      'const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:"MAIN",'+
      'func:()=>({url:location.href,ua:navigator.userAgent,'+
      'uaCH:navigator.userAgentData?.platform??null,language:navigator.language,'+
      'timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,'+
      'viewport:{width:innerWidth,height:innerHeight}})});'+
      'const targets=await chrome.debugger.getTargets();'+
      'return {tabId:tab.id,documentId:results[0]?.documentId,frameId:results[0]?.frameId,'+
      'values:results[0]?.result,debuggerAttached:targets.find(t=>t.tabId===tab.id)?.attached??false};'+
      '})()';
    const result=await evaluate(expr,worker);
    assert.equal(result?.frameId,0);
    assert.equal(result?.values?.url,fixture);
    assert(result?.documentId,'independent MAIN-world document ID required');
    return {...result,source:'CHROME_SCRIPTING_INDEPENDENT_MAIN_WORLD'};
  }
  await send('Target.activateTarget',{targetId:created.targetId});
  const baseline=await independent();
  evidence.baseline=baseline;
  evidence.checks.push('R24_INDEPENDENT_BASELINE_MAIN_WORLD_PASS');
  const status=()=>appRead('document.querySelector(".fp-status-title")?.textContent?.trim()');
  const action=index=>click('.fp-bottom-actions button:nth-child('+index+')',sandbox);
  async function cycle(name,expected){
    const item={preset:name};
    const initialState=await status();
    assert(initialState==='尚未应用'||initialState.includes('恢复'),'previous cycle not finished');
    await action(1);
    let stage=await until(async()=>{
      const permission=await evaluate('!!document.querySelector("#sidebar-tool-action-continue")',host);
      if(permission)return 'site-consent';
      const label=await status();
      if(label?.includes('已受理'))return 'accepted';
      if(['环境修改未开放','执行失败','授权被拒绝','执行结果未知'].includes(label))
        return 'failed:'+label;
      return null;
    },'React apply or site review');
    if(stage==='site-consent'){
      item.siteConsent='OFFICIAL_HOST_REVIEW_APPROVED_ONCE';
      await click('#sidebar-tool-action-continue',host);
      stage='accepted';
    }
    assert.equal(stage,'accepted','unexpected application state '+stage);
    await until(async()=>String(await status()).includes('已受理'),'native apply receipt');
    item.nativeReceiptText=(await appRead('document.querySelector(".fp-notice")?.textContent'))||'';
    const applied=await independent();
    item.applied=applied;
    assert.equal(applied.documentId,baseline.documentId,'native change must stay in original document');
    assert.equal(applied.debuggerAttached,true,'real Chrome debugger attachment required');
    assert(applied.values.ua.includes(expected.ua),'User-Agent remains unchanged');
    assert.equal(applied.values.uaCH,expected.uaCH,'low-entropy UA-CH platform');
    assert.equal(applied.values.language,expected.language,'JS navigator.language');
    assert.equal(applied.values.timezone,expected.timezone,'Intl timezone');
    assert.deepEqual(applied.values.viewport,expected.viewport,'MAIN world viewport');
    await action(2);
    await until(async()=>['有限字段已验证','部分结果 / 存在差异'].includes(await status()),
      'independent Host readback after native apply');
    const readbackText=await appRead('document.body.innerText');
    assert(readbackText.includes('可信 Browser Host · 独立读回'),'Host readback source not shown');
    const rows=await appRead('[...document.querySelectorAll(".fp-check")].map(n=>n.innerText)');
    assert(rows.some(x=>x.includes('User-Agent')&&x.includes(applied.values.ua)),
      'UI reported UA must match independently observed UA');
    item.verifiedStatus=await status();
    item.readbackRows=rows;
    await action(3);
    await until(async()=>String(await status()).includes('待读回'),'restore native detach receipt');
    item.afterDetach=await independent();
    assert.equal(item.afterDetach.debuggerAttached,false,'debugger must detach before restoration verification');
    await action(2);
    await until(async()=>['调试已停止 · 恢复有限验证','已独立核验恢复','恢复结果未知'].includes(await status()),
      'restoration independent readback');
    item.restorationStatus=await status();
    const restored=await independent();
    item.restored=restored;
    assert.equal(restored.documentId,baseline.documentId);
    assert.equal(restored.debuggerAttached,false);
    for(const key of ['ua','uaCH','language','timezone'])
      assert.deepEqual(restored.values[key],baseline.values[key],'restoration mismatch: '+key);
    assert.deepEqual(restored.values.viewport,baseline.values.viewport,'original viewport not restored');
    assert(['调试已停止 · 恢复有限验证','已独立核验恢复'].includes(item.restorationStatus),
      'restore_unknown is NOT a PASS');
    evidence.cycles.push(item);
    evidence.checks.push('R24_'+name+'_REAL_APPLY_READBACK_RESTORE_PASS');
  }

  await cycle('US',{ua:'Windows NT',uaCH:'Windows',language:'en-US',
    timezone:'America/New_York',viewport:{width:1366,height:768}});
  // Select the German preset using the real Chrome keyboard event path.
  await click('select[aria-label="选择环境预设"]',sandbox);
  for(const type of ['rawKeyDown','keyUp'])
    await send('Input.dispatchKeyEvent',{type,key:'ArrowDown',code:'ArrowDown',
      windowsVirtualKeyCode:40},sandbox);
  for(const type of ['rawKeyDown','keyUp'])
    await send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',
      windowsVirtualKeyCode:13},sandbox);
  await until(()=>appRead('document.querySelector("select[aria-label=\\\"选择环境预设\\\"]")?.value==="de"'),
    'German preset selected');
  await cycle('DE',{ua:'Macintosh',uaCH:'macOS',language:'de-DE',
    timezone:'Europe/Berlin',viewport:{width:1366,height:768}});
  evidence.checks.push('R24_TWO_DISTINCT_SESSION_CYCLES_PASS');
  evidence.protocolErrors=protocolErrors.slice(0,6);
  evidence.status='PASS';
  console.log('CHROMIUM_INSTALLED_FULL_CHAIN_R24_PASS '+JSON.stringify({
    browser:evidence.browser,candidateSha256:evidence.candidate.sha256,
    checked:evidence.checks,cycles:evidence.cycles.map(x=>({preset:x.preset,
      status:x.verifiedStatus,restorationStatus:x.restorationStatus}))}));
}catch(error){
  evidence.status='FAIL';
  evidence.error=String(error?.stack||error);
  evidence.chromeErrors=stderr.slice(-3000);
  console.error('CHROMIUM_INSTALLED_FULL_CHAIN_R24_FAIL',evidence.error);
  process.exitCode=1;
}finally{
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'fingerprint-r24-installed-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  if(ws)try{ws.close()}catch{}
  if(chrome){
    chrome.kill('SIGTERM');
    await pause(1000);
    if(chrome.exitCode===null)chrome.kill('SIGKILL');
  }
  if(server)await new Promise(done=>server.close(done));
  await rm(temp,{force:true,recursive:true});
}