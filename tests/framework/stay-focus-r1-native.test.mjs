// Native macOS Chrome acceptance: installed release -> trusted opt-in ->
// actual HTTP navigation redirected by Chrome DNR -> uninstall -> URL restores.
// No fake DNR, storage writes, synthetic DOM clicks or user-grant injection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
const BIN=process.env.CHROME_BIN,ROOT=path.resolve('dist/production');
const OUT=path.resolve(process.env.OPENDESK_FOCUS_NATIVE_EVIDENCE||'artifacts/stay-focus-r1-native');
const ENABLED=process.env.OPENDESK_STAY_FOCUS_NATIVE==='1';
const protocol='opendesk.stay-focus.v1',store='opendesk.stay-focus.state.v1';
function connect(url){
  const socket=new WebSocket(url),waiting=new Map();let serial=0;
  const ready=new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const msg=JSON.parse(event.data),p=waiting.get(msg.id);if(!p)return;
    waiting.delete(msg.id);clearTimeout(p.timer);
    msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);
  };
  socket.onclose=()=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(Error('CDP disconnected'));}};
  return {ready,send(method,params={},sessionId){return new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},15000);
    waiting.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });},close(){socket.close();}};
}
async function screenshot(c,session,name){
  const image=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);
  const bytes=Buffer.from(image.data,'base64');
  await writeFile(path.join(OUT,name+'.png'),bytes);
  return {file:name+'.png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
async function until(run,label,limit=18000){
  const end=Date.now()+limit;let last;
  while(Date.now()<end){try{const value=await run();if(value)return value;}catch(e){last=String(e);}await sleep(150);}
  throw Error(label+' timed out'+(last?' - '+last:''));
}
async function evalRead(c,session,expression){
  const x=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
  if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails).slice(0,350));
  return x.result.value;
}
async function click(c,session,selector){
  await until(()=>evalRead(c,session,'(()=>{const x=document.querySelector('+JSON.stringify(selector)+');return !!x&&!x.disabled&&x.getClientRects().length>0;})()'),'clickable '+selector);
  await evalRead(c,session,'document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center"})');
  const p=await evalRead(c,session,'(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  for(const type of ['mousePressed','mouseReleased'])
    await c.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1},session);
}
async function fill(c,session,selector,value){
  await click(c,session,selector);
  await c.send('Input.insertText',{text:value},session);
}
// Real CDP keyboard input, not changing DOM values or local usage via evaluate.
async function replaceField(c,session,selector,value){
  await click(c,session,selector);
  await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',
    modifiers:4,windowsVirtualKeyCode:65},session);
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',
    modifiers:4,windowsVirtualKeyCode:65},session);
  await c.send('Input.insertText',{text:value},session);
}
async function press(c,session,key,code,virtualKey){
  await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode:virtualKey},session);
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtualKey},session);
}
test('Real Chrome always-block and live one-minute quota, Side Panel approval and uninstall',{skip:!ENABLED,timeout:360000},async t=>{
  assert.equal(process.platform,'darwin','Native CI must be macOS');
  assert.ok(BIN&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0);
  const packageFile=path.join(ROOT,'official-tools/stay-focus/stay-focus.opendesk-tool.json');
  const bytes=await readFile(packageFile),pkg=JSON.parse(bytes);
  assert.equal(pkg.id,'stay-focus');assert.equal(pkg.version,'1.0.0');
  await mkdir(OUT,{recursive:true});
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-stay-focus-r1-'));
  const http=createServer((_req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><title>Stay Focus native HTTP test</title><h1>Allowed site before rules</h1>');
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const page='http://127.0.0.1:'+http.address().port+'/real-navigation';
  const chromeArgs=['--use-mock-keychain','--password-store=basic','--no-sandbox',
    '--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+ROOT,'--load-extension='+ROOT,'about:blank'];
  const launchChrome=()=>spawn(BIN,chromeArgs,{stdio:['ignore','ignore','pipe']});
  let chrome=launchChrome();
  let errors='',client=null,passed=false;
  const report={candidate:process.env.GITHUB_SHA||null,
    pkgSHA256:createHash('sha256').update(bytes).digest('hex'),
    nativeChrome:'NOT_TESTED',approval:'NOT_TESTED',actualNavigation:'NOT_TESTED',
    quota:'NATIVE_NOT_TESTED',quotaTrace:[],screenshots:[],
    disabled:'NOT_TESTED',reenabled:'NOT_TESTED',restart:'NOT_TESTED',
    unregister:'NOT_TESTED',uninstall:'NOT_TESTED',steps:[]};
  const note=(name,details)=>{report.steps.push({name,...details});console.log('STAY_FOCUS_NATIVE '+name+' '+JSON.stringify(details));};
  const captureChromeErrors=process=>process.stderr.on('data',x=>{
    errors=(errors+String(x)).slice(-2200);
  });
  captureChromeErrors(chrome);
  t.after(async()=>{
    if(client)try{await client.send('Browser.close');}catch{}
    client?.close();
    if(chrome.exitCode===null&&chrome.signalCode===null){
      await new Promise(resolve=>{const timer=setTimeout(()=>{chrome.kill('SIGKILL');resolve();},2000);
        chrome.once('close',()=>{clearTimeout(timer);resolve();});chrome.kill('SIGTERM');});
    }
    await new Promise(resolve=>http.close(resolve));
    assert.ok(path.basename(profile).startsWith('opendesk-stay-focus-r1-')&&path.dirname(profile)===tmpdir());
    await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200});
    if(report.quota==='IN_PROGRESS')report.quota='FAIL';
    report.passed=passed;report.chromeErrorTail=errors.slice(-900);
    await writeFile(path.join(OUT,'native-report.json'),JSON.stringify(report,null,2)+'\n');
  });
  const remote=await until(async()=>{
    const source=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
    const port=Number(source?.split('\n')[0]);return port>0?port:null;
  },'isolated Chrome debugging port',30000);
  const version=await(await fetch('http://127.0.0.1:'+remote+'/json/version')).json();
  client=connect(version.webSocketDebuggerUrl);await client.ready;
  report.nativeChrome=version.Browser;
  const id=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'real unpacked SW',15000);
  report.extensionId=id;
  const ui=await client.send('Target.createTarget',{url:'chrome-extension://'+id+'/ui/tool.html?hostInstanceId='+randomUUID()});
  const uid=(await client.send('Target.attachToTarget',{targetId:ui.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},uid);await client.send('Page.enable',{},uid);
  await until(()=>evalRead(client,uid,'!!document.querySelector("#sidebar-tool-official-stay-focus-install")'),'official release in catalogue');
  // Use the actual shipped catalog launcher, not a CDP-injected test button.
  // It checks isTrusted and invokes sidePanel.open in the real user gesture.
  await click(client,uid,'#catalog-open-dev-sidebar');
  const context=await until(async()=>{const found=await evalRead(client,uid,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return found.find(x=>x.documentUrl?.includes('/ui/tool.html')&&x.documentId);
  },'real SIDE_PANEL');
  let sid=await until(async()=>{const x=(await client.send('Target.getTargets')).targetInfos;
    const target=x.find(row=>row.url===context.documentUrl);if(!target)return null;
    return (await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  },'Side Panel CDP');
  await client.send('Runtime.enable',{},sid);await client.send('Page.enable',{},sid);
  await click(client,sid,'#tab-tools');
  await click(client,sid,'#sidebar-tool-discover-toggle');
  await click(client,sid,'#sidebar-tool-official-stay-focus-install');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-preview").hidden'),'official review');
  await click(client,sid,'#sidebar-tool-install');
  const installed='[data-sidebar-tool-action=open][data-sidebar-tool-id=stay-focus]';
  await until(()=>evalRead(client,sid,'!!document.querySelector('+JSON.stringify(installed)+')'),'real tool installed');
  await click(client,sid,installed);
  const frame=await until(async()=>{
    const x=(await client.send('Target.getTargets')).targetInfos;
    const target=x.find(row=>row.type==='iframe'&&row.url?.includes('/sidebar-tools/sandbox.html'));
    return target?(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId:null;
  },'sandbox iframe');
  await client.send('Runtime.enable',{},frame);await client.send('Page.enable',{},frame);
  await until(()=>evalRead(client,frame,'!!document.querySelector("#site-host")'),'real Stay Focus UI');
  const dimensions=await evalRead(client,frame,
    '(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,visible:!!document.querySelector("#site-host")}))()');
  assert.ok(dimensions.scrollWidth<=dimensions.width+2,'native tool must not overflow its iframe horizontally');
  report.toolGeometry=dimensions;
  report.screenshots.push(await screenshot(client,sid,'installed-stay-focus-native-panel'));
  await fill(client,frame,'#site-host','127.0.0.1');
  await click(client,frame,'#site-mode');await press(client,frame,'ArrowDown','ArrowDown',40);
  await press(client,frame,'Enter','Enter',13);
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-mode").value'),'always');
  await click(client,frame,'#site-form button[type=submit]');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-action-review").hidden'),'trusted site review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(()=>evalRead(client,sid,
    'chrome.storage.local.get('+JSON.stringify(store)+').then(x=>x['+JSON.stringify(store)+']?.sites?.length===1)'),'authorized site rule');
  note('trusted-domain-approval',{hostname:'127.0.0.1',noQueryStored:true});
  await click(client,sid,'#sidebar-tool-settings-open');
  report.nativePermissionBefore=await evalRead(client,sid,
    'chrome.permissions.contains({permissions:["idle","declarativeNetRequestWithHostAccess"]})');
  await click(client,sid,'#stay-focus-enable-native');
  const allowed=await until(()=>evalRead(client,sid,
    'chrome.permissions.contains({permissions:["idle","declarativeNetRequestWithHostAccess"]})'), 'actual Chrome optional native grants',7500).catch(()=>false);
  if(!allowed){report.approval='BLOCKED_NATIVE_PERMISSION_PROMPT';
    note('native-permission-blocked',{notGranted:true});
    throw Error('Native Chrome rejected or did not approve DNR and idle; cannot claim real blocking');}
  const enabled=await until(()=>evalRead(client,sid,
    'chrome.storage.local.get('+JSON.stringify(store)+').then(x=>x['+JSON.stringify(store)+']?.enabled===true)'), 'real trusted activation',10000);
  assert.equal(enabled,true);report.approval='PASS';
  report.nativePermissionAfter=allowed;
  const rules=await until(async()=>{
    const rows=await evalRead(client,sid,'chrome.declarativeNetRequest.getDynamicRules()');
    return rows.filter(row=>row.id>=730000&&row.id<=730199).length===1?rows:null;
  },'actual DNR rule created');
  note('Chrome-getDynamicRules',{owned:rules.filter(row=>row.id>=730000).map(row=>({id:row.id,regexFilter:row.condition.regexFilter,extensionPath:row.action.redirect?.extensionPath}))});
  const visit=await client.send('Target.createTarget',{url:page});
  const navigated=await until(async()=>{
    const list=(await client.send('Target.getTargets')).targetInfos;
    const target=list.find(x=>x.targetId===visit.targetId);
    return target?.url?.includes('/stay-focus/blocked-always.html')?target.url:null;
  },'actual HTTP main-frame blocked via Chrome DNR',16000);
  assert.ok(navigated.startsWith('chrome-extension://'+id+'/stay-focus/blocked-always.html'));
  const blockedSession=(await client.send('Target.attachToTarget',{targetId:visit.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},blockedSession);await client.send('Page.enable',{},blockedSession);
  const blockedText=await until(async()=>{
    const value=await evalRead(client,blockedSession,'document.querySelector("#reason")?.textContent||""');
    return value.includes('始终限制')?value:null;
  },'real local extension block page rendered with correct reason');
  assert.ok(blockedText.includes('始终限制'),'rule redirect must deliver the actual block page UI');
  report.screenshots.push(await screenshot(client,blockedSession,'actual-dnr-blocked-page'));
  report.actualNavigation='PASS';note('real-http-navigation',{status:'PASS',
    urlPath:'/stay-focus/blocked-always.html',renderedReason:blockedText});

  // Replace the actual site rule through sandbox UI and its trusted review.
  // Never set the usage counter, never seed a DNR rule and never shorten time.
  await click(client,frame,'#site-mode');
  await press(client,frame,'ArrowUp','ArrowUp',38);
  await press(client,frame,'Enter','Enter',13);
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-mode").value'),'limit');
  await replaceField(client,frame,'#site-minutes','1');
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-minutes").value'),'1');
  await click(client,frame,'#site-form button[type=submit]');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-action-review").hidden'),
    'trusted one-minute quota review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(async()=>{
    const result=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+store+'");'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {site:x["'+store+'"]?.sites?.[0],'+
      'owned:rules.filter(r=>r.id>=730000&&r.id<=730199).length}})()');
    return result.site?.mode==='limit'&&result.site.minutes===1&&result.owned===0;
  },'real UI changed from always block to an unused one-minute quota');
  report.quota='IN_PROGRESS';
  note('real-ui-one-minute-quota',{minutes:1,storageUsageWasNotModified:true});

  // This creates a real HTTP tab and makes it the focused, active Chrome tab.
  // Browser tabs/window activation and CDP mouse events are actual browser
  // operations; they do not bypass the service or synthesize usage/storage.
  const live=await client.send('Target.createTarget',{url:page});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===live.targetId)?.url===page;
  },'HTTP page allowed before quota',15000);
  await client.send('Target.activateTarget',{targetId:live.targetId});
  const liveSession=(await client.send('Target.attachToTarget',
    {targetId:live.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},liveSession);
  await client.send('Page.enable',{},liveSession);
  const focusedTab=await evalRead(client,sid,'(async()=>{'+
    'const tabs=await chrome.tabs.query({url:'+JSON.stringify(page)+'});'+
    'const tab=tabs.at(-1);if(!tab)return null;'+
    'await chrome.windows.update(tab.windowId,{focused:true});'+
    'await chrome.tabs.update(tab.id,{active:true});'+
    'return {tabId:tab.id,windowId:tab.windowId}})()');
  assert.ok(Number.isInteger(focusedTab?.tabId),'actual HTTP tab must exist');
  report.screenshots.push(await screenshot(client,liveSession,'quota-active-http-before-limit'));
  const quotaObservation='(async()=>{'+
    'const [saved,rules,win]=await Promise.all(['+
    'chrome.storage.local.get("'+store+'"),chrome.declarativeNetRequest.getDynamicRules(),'+
    'chrome.windows.getLastFocused()]);'+
    'const tabs=await chrome.tabs.query({active:true,windowId:win.id});'+
    'return {usedMs:saved["'+store+'"]?.usage?.["s:127.0.0.1"]||0,'+
    'rules:rules.filter(r=>r.id>=730000&&r.id<=730199).map(r=>({id:r.id,path:r.action?.redirect?.extensionPath})),'+
    'idle:await chrome.idle.queryState(60),focused:win.focused,'+
    'activeUrl:tabs[0]?.url||null,tabId:tabs[0]?.id||null};})()';
  const quotaStart=Date.now();
  let reached=null;
  while(Date.now()-quotaStart<145000){
    // Keep performing real interaction with the opened Chrome page during
    // the quota window; the idle API is still independently read and recorded.
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',
      x:60+(report.quotaTrace.length%3)*24,y:85},liveSession);
    const snapshot=await evalRead(client,sid,quotaObservation);
    const elapsedMs=Date.now()-quotaStart;
    report.quotaTrace.push({elapsedMs,...snapshot});
    if(snapshot.usedMs>=60000&&snapshot.rules.some(r=>r.path==='/stay-focus/blocked-quota.html')){
      reached={elapsedMs,...snapshot};break;
    }
    await sleep(3000);
  }
  if(!reached){
    report.quota='FAIL';
    throw Error('Real active one-minute quota never created Chrome quota DNR rule: '+
      JSON.stringify(report.quotaTrace.slice(-6)));
  }
  assert.ok(report.quotaTrace.some(x=>x.usedMs<60000),
    'quota trace needs actual pre-threshold foreground observations');
  assert.ok(report.quotaTrace.some(x=>x.focused&&x.idle==='active'&&x.tabId===focusedTab.tabId),
    'real browser must observe focused active non-idle target tab');
  report.quotaEnforcedElapsedMs=reached.elapsedMs;
  report.quotaOvershootMs=reached.elapsedMs-60000;
  note('actual-elapsed-quota-exhaustion',{usedMs:reached.usedMs,
    elapsedMs:reached.elapsedMs,overshootMs:report.quotaOvershootMs,
    actualDnrRules:reached.rules,traceRecords:report.quotaTrace.length});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===live.targetId)?.url?.includes('/stay-focus/blocked-quota.html');
  },'previously open site navigated to actual quota block page',15000);
  report.screenshots.push(await screenshot(client,liveSession,'existing-tab-quota-blocked'));
  const quotaVisit=await client.send('Target.createTarget',{url:page});
  const quotaRedirect=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===quotaVisit.targetId)?.url?.includes('/stay-focus/blocked-quota.html');
  },'new real HTTP main-frame navigation denied by quota DNR',15000);
  assert.ok(quotaRedirect.startsWith('chrome-extension://'+id+'/stay-focus/blocked-quota.html'));
  report.actualQuotaNavigation='PASS';
  report.quota='PASS';
  note('quota-real-http-navigation',{status:'PASS',urlPath:'/stay-focus/blocked-quota.html'});

  // Native lifecycle: the user can stop enforcement without uninstalling and
  // re-enable with the original daily quota still exhausted. Never write
  // DNR rules or usage directly from the test harness.
  const stopVisible=await evalRead(client,sid,
    '(()=>{const node=document.querySelector("#stay-focus-disable");'+
    'return !!node&&!node.disabled&&node.getClientRects().length>0})()');
  if(!stopVisible)await click(client,sid,'#sidebar-tool-settings-open');
  await click(client,sid,'#stay-focus-disable');
  await until(async()=>{
    const state=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+store+'");'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {enabled:x["'+store+'"]?.enabled,'+
      'owned:rules.filter(r=>r.id>=730000&&r.id<=730199).length}})()');
    return state.enabled===false&&state.owned===0?state:null;
  },'Chrome DNR rule retired after real trusted disable',15000);
  const pausedPage=await client.send('Target.createTarget',{url:page});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===pausedPage.targetId)?.url===page;
  },'actual HTTP navigation restored by disabling Stay Focus',15000);
  report.disabled='PASS';
  note('trusted-disable-restores-access',{url:page,ownedRules:0});

  await click(client,sid,'#stay-focus-enable-native');
  await until(async()=>{
    const state=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+store+'");'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {enabled:x["'+store+'"]?.enabled,'+
      'owned:rules.filter(r=>r.id>=730000&&r.id<=730199&&'+
      'r.action?.redirect?.extensionPath==="/stay-focus/blocked-quota.html").length}})()');
    return state.enabled===true&&state.owned===1?state:null;
  },'real reenable restores exhausted quota rule',15000);
  const reblocked=await client.send('Target.createTarget',{url:page});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===reblocked.targetId)?.url?.includes('/stay-focus/blocked-quota.html');
  },'real HTTP restriction resumes when Stay Focus is reenabled',15000);
  report.reenabled='PASS';
  note('reenable-restores-quota-restriction',{quotaPersisted:true,ruleOwned:true});

  // Actual full Chrome restart with the SAME profile, not only an MV3 worker
  // restart or a storage/permission fixture. Do not seed rules or usage.
  const beforeRestart=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+
    store+'");return x["'+store+'"]?.usage?.["s:127.0.0.1"]||0})()');
  assert.ok(beforeRestart>=60000,'the real exhausted quota must exist before restarting Chrome');
  const priorChrome=chrome;
  await client.send('Browser.close');
  await until(()=>priorChrome.exitCode!==null||priorChrome.signalCode!==null,
    'original Chrome process really exited',25000);
  client.close();client=null;
  chrome=launchChrome();captureChromeErrors(chrome);
  const reopenedVersion=await until(async()=>{
    const source=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
    const port=Number(source?.split('\\n')[0]);if(!(port>0))return null;
    try{const response=await fetch('http://127.0.0.1:'+port+'/json/version');
      return response.ok?await response.json():null;}catch{return null;}
  },'restarted Chrome CDP with the same profile',30000);
  client=connect(reopenedVersion.webSocketDebuggerUrl);await client.ready;
  const restoredId=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'restarted installed extension SW',20000);
  assert.equal(restoredId,id,'Chrome restart must retain the exact installed extension identity');
  const reopenedUI=await client.send('Target.createTarget',{
    url:'chrome-extension://'+restoredId+'/ui/tool.html?hostInstanceId='+randomUUID()});
  const reopenedSession=(await client.send('Target.attachToTarget',
    {targetId:reopenedUI.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},reopenedSession);
  await client.send('Page.enable',{},reopenedSession);
  const restored=await until(async()=>{
    const value=await evalRead(client,reopenedSession,'(async()=>{const x=await chrome.storage.local.get("'+
      store+'");const rules=await chrome.declarativeNetRequest.getDynamicRules();return {'+
      'enabled:x["'+store+'"]?.enabled,usage:x["'+store+'"]?.usage?.["s:127.0.0.1"]||0,'+
      'quotaRules:rules.filter(r=>r.id>=730000&&r.id<=730199&&'+
      'r.action?.redirect?.extensionPath==="/stay-focus/blocked-quota.html").length}})()');
    return value.enabled===true&&value.usage===beforeRestart&&value.quotaRules===1?value:null;
  },'persisted quota and owned DNR rule after full Chrome restart',22000);
  const postRestartVisit=await client.send('Target.createTarget',{url:page});
  const redirectedAfterRestart=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===postRestartVisit.targetId)?.url?.includes(
      '/stay-focus/blocked-quota.html');
  },'actual HTTP navigation still blocked after Chrome restart',15000);
  assert.ok(redirectedAfterRestart.startsWith('chrome-extension://'+id+'/'));
  report.restart='PASS';
  note('chrome-restart-restores-quota-and-navigation',{sameProfile:true,
    extensionId:restoredId,usageMs:restored.usage,quotaRules:restored.quotaRules});

  // Reopen the REAL Side Panel for removal; don't mutate extension storage
  // using CDP or silently remove the package behind the user's UI.
  await click(client,reopenedSession,'#catalog-open-dev-sidebar');
  const restoredContext=await until(async()=>{
    const contexts=await evalRead(client,reopenedSession,
      'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return contexts.find(row=>row.documentUrl?.includes('/ui/tool.html')&&row.documentId);
  },'Side Panel reopened after Chrome restart');
  sid=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const target=targets.find(row=>row.url===restoredContext.documentUrl);
    return target?(await client.send('Target.attachToTarget',
      {targetId:target.targetId,flatten:true})).sessionId:null;
  },'restarted Side Panel CDP');
  await client.send('Runtime.enable',{},sid);
  await client.send('Page.enable',{},sid);
  await click(client,sid,'#tab-tools');
  await click(client,sid,installed);
  await click(client,sid,'#sidebar-tool-remove');
  await click(client,sid,'#sidebar-tool-inline-remove-confirm');
  await until(async()=>{
    const result=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get(['+
      JSON.stringify(store)+',"opendesk.sidebar-tools.installed.v1"]);'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {present:Object.hasOwn(x,'+
      JSON.stringify(store)+'),installed:x["opendesk.sidebar-tools.installed.v1"]?.some(t=>t.id==="stay-focus"),owned:rules.filter(r=>r.id>=730000&&r.id<=730199).length};})()');
    return result.present===false&&result.installed===false&&result.owned===0?result:null;
  },'uninstall removes independent data and all DNR rules',15000);
  const restored=await client.send('Target.createTarget',{url:page});
  const allowedURL=await until(async()=>{
    const x=(await client.send('Target.getTargets')).targetInfos.find(row=>row.targetId===restored.targetId);
    return x?.url===page?x.url:null;
  },'real HTTP becomes available after removal',12000);
  assert.equal(allowedURL,page);
  report.unregister='PASS';report.uninstall='PASS';passed=true;
  note('uninstall-restores-access',{realHTTP:true,ownedRules:0});
});